import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixturePath = 'docs/jev/trial-cases.json';
const fixture = JSON.parse(await readFile(path.join(root, fixturePath), 'utf8'));
const promptPath = fixture.promptModule;
if (!/^local-knowledge\/jev-pilot\/optimization\/questions-v\d+\.mjs$/.test(promptPath || '')) throw new Error('The trial must name its local versioned prompt module.');
if (fixture.automationDriver && !/^local-knowledge\/retests\/[a-z\d-]+\.cjs$/.test(fixture.automationDriver)) throw new Error('Invalid local automation driver path.');
const [command, participant, ...options] = process.argv.slice(2);
const caseOption = options.find(value => value.startsWith('--case='))?.slice(7);
const protocolId = fixture.protocolId;
if (!/^[a-z\d-]+$/.test(protocolId)) throw new Error('Invalid protocol ID.');
const round = path.join(root, 'local-knowledge/jev-pilot/person-trials', protocolId);
const frozen = path.join(round, 'frozen');
const digest = value => createHash('sha256').update(value).digest('hex');
const exists = async file => access(file).then(() => true, () => false);
const html = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const dependencies = [
  'local-knowledge/jev-pilot/questions.mjs',
  ...['questions-v3.mjs', 'questions-v5.mjs', 'questions-v6.mjs', 'questions-v7.mjs', 'transport.mjs'].map(name => `local-knowledge/jev-pilot/optimization/${name}`),
  promptPath,
  ...(fixture.automationDriver ? [fixture.automationDriver] : []),
];
const guideFiles = ['index.html', fixturePath, 'docs/jev/repeatable-trial.md', 'docs/jev/trial-record.md', 'docs/reader.js', 'docs/reader.css', 'docs/index.html', 'docs/jev/index.html', 'tools/jev-person-trial.mjs'];

async function appFiles() {
  const found = [];
  async function visit(directory) {
    for (const entry of await readdir(path.join(root, directory), { withFileTypes: true })) {
      const relative = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await visit(relative);
      else if (entry.isFile()) found.push(relative);
      else throw new Error(`Unsupported browser dependency entry: ${relative}`);
    }
  }
  for (const directory of ['factory', 'atlas', 'docs']) await visit(directory);
  return found.sort();
}

async function verify() {
  if (!await exists(path.join(round, 'manifest.json'))) throw new Error('Prepare the trial first. No API call was made.');
  const manifest = JSON.parse(await readFile(path.join(round, 'manifest.json'), 'utf8'));
  const currentBrowserFiles = await appFiles();
  if (JSON.stringify(currentBrowserFiles) !== JSON.stringify(manifest.browserFiles)) throw new Error('Browser file inventory changed. Prepare a new protocol round. No API call was made.');
  for (const [file, hash] of Object.entries(manifest.hashes)) {
    if (digest(await readFile(path.join(frozen, file))) !== hash) throw new Error(`Frozen file changed: ${file}. No API call was made.`);
    if (digest(await readFile(path.join(root, file))) !== hash) throw new Error(`Current file differs from the frozen trial: ${file}. Keep this round fixed or prepare a new protocol ID.`);
  }
  return manifest;
}

async function prepare() {
  if (await exists(path.join(round, 'manifest.json'))) {
    await verify();
    process.stdout.write(`Existing frozen trial verified: ${protocolId}\n`);
    return;
  }
  const browserFiles = await appFiles();
  const files = [...new Set([...dependencies, ...browserFiles, ...guideFiles])];
  const bytes = await Promise.all(files.map(file => readFile(path.join(root, file))));
  await mkdir(frozen, { recursive: true });
  const hashes = {};
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    await mkdir(path.dirname(path.join(frozen, file)), { recursive: true });
    await writeFile(path.join(frozen, file), bytes[index]);
    hashes[file] = digest(bytes[index]);
  }
  const { CATALOG } = await import(pathToFileURL(path.join(frozen, 'factory/catalog.mjs')));
  const prompt = await import(pathToFileURL(path.join(frozen, promptPath)));
  const manifest = { protocolId, preparedAt: new Date().toISOString(), fixtureSha256: hashes[fixturePath], catalogVersion: CATALOG.version, model: prompt.MODEL, promptModule: promptPath, promptVersion: prompt.PROMPT_VERSION, pricePerMillionInputEstimate: prompt.PRICE_PER_MILLION_INPUT, caseOrder: fixture.cases.map(item => item.id), browserFiles, hashes, evidence: fixture.labelStatus, scope: 'Two simulated scripted sessions and one pending human session, not three human participants. Guided acceptance, not unaided usability or population accuracy.' };
  await writeFile(path.join(round, 'manifest.json'), JSON.stringify(manifest, null, 2));
  process.stdout.write(`Prepared ${protocolId}, ${files.length} frozen files, ${fixture.cases.length} cards. No API call was made.\n`);
}

function comparison(item, response, decision) {
  if (!response.ok || !decision) return { status: 'Blocked', error: response.error || 'No valid decision' };
  const observed = { intent: decision.intent.choice, nextQuestion: decision.clarification?.choice ?? null, practice: decision.practice?.choice ?? null, coverage: Object.fromEntries(Object.entries(decision.coverage).map(([id, answer]) => [id, answer.choice])) };
  const differences = [];
  for (const field of ['intent', 'nextQuestion', 'practice']) if (observed[field] !== item.expected[field]) differences.push(`${field}: expected ${item.expected[field]}, received ${observed[field]}`);
  for (const [id, expected] of Object.entries(item.expected.coverage)) if (observed.coverage[id] !== expected) differences.push(`coverage ${id}: expected ${expected}, received ${observed.coverage[id]}`);
  return { status: differences.length ? 'Fail' : 'Pass', expected: item.expected, observed, differences, limit: 'Comparison with authored fictional targets, not an independent participant judgment.' };
}

async function report(directory, records, manifest) {
  const reportData = { protocolId, participant, actorType: participant.startsWith('sim-') ? 'simulated scripted session' : 'human session requiring a separate participant record', manifest, records, humanObservations: 'Not supplied by the API runner. Record the participant review separately.', costLimit: 'Input-token estimates use the frozen reference price, not a provider debit. Failed or retried calls can have unreported usage.', latencyLimit: 'Local request and decision time, including request persistence, validation and any retries. Excludes browser rendering and human review. Seven requests do not establish p95 performance.' };
  await writeFile(path.join(directory, 'results.json'), JSON.stringify(reportData, null, 2));
  const rows = records.map(record => `<section><h2>${html(record.caseId)}. ${html(record.title)}</h2><p><strong>Authored target comparison: ${html(record.comparison.status)}</strong></p><dl><dt>Proposed activity</dt><dd>${html(record.intentLabel)}</dd><dt>Next catalog question</dt><dd>${html(record.questionLabel)}</dd><dt>Selected practice assessment</dt><dd>${html(record.practiceLabel)}: ${html(record.practiceResultLabel)}</dd><dt>Local decision time</dt><dd>${html(record.latencyMs.toFixed(1))} ms</dd><dt>Estimated input cost</dt><dd>${record.estimatedUsd === null ? 'Unknown' : `$${record.estimatedUsd.toFixed(8)}`}</dd><dt>Attempts</dt><dd>${record.response.attempts?.length ?? 0}</dd></dl><p><strong>Why the authored test expects this:</strong> ${html(record.targetReason)}</p>${record.comparison.differences?.length ? `<ul>${record.comparison.differences.map(value => `<li>${html(value)}</li>`).join('')}</ul>` : ''}${record.comparison.error ? `<p>${html(record.comparison.error)}</p>` : ''}<details><summary>Exact original request, response and code decision</summary><pre>${html(JSON.stringify({ request: record.request, response: record.response, decision: record.decision }, null, 2))}</pre></details></section>`).join('');
  const content = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="light dark"><title>${html(participant)} trial review</title><style>body{font:17px/1.7 system-ui,sans-serif;max-width:900px;margin:40px auto;padding:0 24px}section{border-top:1px solid #888;padding:24px 0}dt{font-weight:bold}dd{margin:0 0 10px}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:13px/1.6 monospace}summary{cursor:pointer;padding:14px 0}a:focus-visible,summary:focus-visible{outline:3px solid #538bdd}h1,h2{line-height:1.3}</style><h1>${html(participant)}. JEV review</h1><p>${html(reportData.actorType)}. Protocol ${html(protocolId)}.</p><p>This shows the original proposals and comparisons with authored targets. It does not record human understanding or run a workflow in Atlas.</p><p>Intent is assessed by JEV. The next question and final practice result combine JEV judgments with code rules. The practice was selected by the test card, not discovered by JEV.</p>${rows}<footer><p>${html(reportData.latencyLimit)}</p><p>${html(reportData.costLimit)}</p></footer></html>`;
  await writeFile(path.join(directory, 'results.html'), content);
}

async function run() {
  if (!['sim-01', 'sim-02', 'person-03'].includes(participant)) throw new Error('Use sim-01, sim-02 or person-03.');
  const manifest = await verify();
  if (!process.env.TYPESAFE_API_KEY) throw new Error('TYPESAFE_API_KEY is missing from this process. No API call was made.');
  const frozenFixture = JSON.parse(await readFile(path.join(frozen, fixturePath), 'utf8'));
  const selected = caseOption ? frozenFixture.cases.filter(item => item.id === caseOption) : frozenFixture.cases;
  if (!selected.length) throw new Error('Unknown card ID.');
  const directory = path.join(round, participant);
  await mkdir(directory, { recursive: true });
  const previous = await exists(path.join(directory, 'results.json')) ? JSON.parse(await readFile(path.join(directory, 'results.json'), 'utf8')) : { records: [] };
  const records = previous.records;
  const prompt = await import(pathToFileURL(path.join(frozen, manifest.promptModule)));
  const { requestEvaluation } = await import(pathToFileURL(path.join(frozen, 'local-knowledge/jev-pilot/optimization/transport.mjs')));
  const { CATALOG } = await import(pathToFileURL(path.join(frozen, 'factory/catalog.mjs')));
  for (const item of selected) {
    if (records.some(record => record.caseId === item.id)) { process.stdout.write(`${participant} ${item.id}: existing result preserved, no repeat API call.\n`); continue; }
    if (frozenFixture.cases[records.length]?.id !== item.id) throw new Error(`Run the cards in fixed order. Next is ${frozenFixture.cases[records.length]?.id || 'none'}.`);
    const request = prompt.makeRequest(item);
    const started = performance.now();
    const response = await requestEvaluation(request, directory, item.id);
    const decision = response.ok ? prompt.decide(response) : null;
    const question = CATALOG.recipes.find(recipe => recipe.id === decision?.intent.choice)?.questions.find(value => value.id === decision?.clarification?.choice);
    const record = { caseId: item.id, title: item.title, recordedAt: new Date().toISOString(), request, response, decision, latencyMs: performance.now() - started, inputTokens: response.usage?.input_tokens ?? null, estimatedUsd: Number.isInteger(response.usage?.input_tokens) ? response.usage.input_tokens / 1e6 * manifest.pricePerMillionInputEstimate : null, intentLabel: CATALOG.recipes.find(recipe => recipe.id === decision?.intent.choice)?.label || ({ unclear: 'The immediate activity is unclear', 'outside-supported-recipes': 'Outside the supported development workflows' }[decision?.intent.choice] || 'No valid proposal'), practiceResultLabel: ({ relevant: 'Useful for this task', 'not-relevant': 'Do not include in this task', 'insufficient-context': 'More context needed' }[decision?.practice?.choice] || 'Not assessed'), questionLabel: question?.label || (decision?.clarification?.choice === 'none-needed' ? 'No core catalog question needed' : 'No recipe-specific question selected'), practiceLabel: CATALOG.practices.find(value => value.id === item.practice?.id)?.label || 'No practice designated', targetReason: item.why, comparison: comparison(item, response, decision) };
    records.push(record);
    await report(directory, records, manifest);
    process.stdout.write(`${participant} ${item.id}: ${record.comparison.status}, ${record.latencyMs.toFixed(1)} ms, ${record.inputTokens ?? 'unknown'} input tokens.\n`);
    if (!response.ok) throw new Error('Blocked by API or response validation failure. Original evidence retained, stop this session.');
  }
  process.stdout.write(`Review ${path.relative(root, path.join(directory, 'results.html'))}\n`);
}

if (command === 'prepare') await prepare();
else if (command === 'verify') { await verify(); process.stdout.write('Frozen trial verified. No API call was made.\n'); }
else if (command === 'run') await run();
else throw new Error('Use prepare, verify, or run <participant> --case=<card>.');
