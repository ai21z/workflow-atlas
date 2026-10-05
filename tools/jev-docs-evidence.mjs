import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// This exporter reads saved evaluation files. It does not load the API runner.
const repository = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pilot = 'local-knowledge/jev-pilot/optimization';
const snapshotPath = 'docs/jev/evidence.json';
const finalRunId = '2026-10-04T065015370Z-last-fresh-heldout-pilot-v7-positive-evidence-and-boundaries';
const runIds = [
  '2026-10-04T062533007Z-development-pilot-v3-atomic-batch',
  '2026-10-04T062632105Z-development-pilot-v4-compact-atomic-batch',
  '2026-10-04T062723027Z-fresh-heldout-pilot-v3-atomic-batch',
  '2026-10-04T063001726Z-development-pilot-v5-scope-and-isolated-slots',
  '2026-10-04T063153551Z-development-pilot-v6-explicit-gaps-and-scope',
  '2026-10-04T063756189Z-final-fresh-heldout-pilot-v6-explicit-gaps-and-scope',
  '2026-10-04T064246246Z-development-pilot-v7-positive-evidence-and-boundaries',
  finalRunId,
];
const sources = new Map();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function readSource(path) {
  const bytes = await readFile(resolve(repository, path));
  sources.set(path, { path, sha256: sha256(bytes) });
  return bytes;
}
const readJson = async path => JSON.parse(await readSource(path));
const allows = (expected, actual) => Array.isArray(expected) ? expected.includes(actual) : expected === actual;
const choice = answer => answer?.choice ?? null;
const ratio = (correct, total) => ({ correct, total, accuracy: total ? correct / total : null });
const score = values => ratio(values.filter(Boolean).length, values.length);
function nearestRank(values, probability) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  const rank = Math.ceil(probability * sorted.length);
  return { sampleCount: sorted.length, rank, valueMs: sorted.length ? sorted[rank - 1] : null };
}
function wilson95(correct, total) {
  if (!total) return null;
  const z = 1.95996398454, p = correct / total, denominator = 1 + z * z / total;
  const centre = (p + z * z / (2 * total)) / denominator;
  const half = z * Math.sqrt(p * (1 - p) / total + z * z / (4 * total * total)) / denominator;
  return [Math.max(0, centre - half), Math.min(1, centre + half)];
}
function offers(rows, field) {
  const binary = rows.filter(row => !(row.item.practice.expected.includes('relevant') && row.item.practice.expected.length > 1));
  const positive = row => row.item.practice.expected.length === 1 && row.item.practice.expected[0] === 'relevant';
  const offered = row => row[field] === 'relevant';
  const tp = binary.filter(row => positive(row) && offered(row)).length;
  const fp = binary.filter(row => !positive(row) && offered(row)).length;
  const fn = binary.filter(row => positive(row) && !offered(row)).length;
  return { truePositives: tp, falsePositives: fp, falseNegatives: fn, precision: tp + fp ? tp / (tp + fp) : null, recall: tp + fn ? tp / (tp + fn) : null, excludedAmbiguousBinaryCases: rows.length - binary.length };
}
const signature = record => ({ intent: choice(record?.decision?.intent), clarification: choice(record?.decision?.clarification), practice: choice(record?.decision?.practice) });
async function auditRun(id, final = false) {
  const directory = `${pilot}/runs/${id}`;
  const manifest = await readJson(`${directory}/manifest.json`);
  const dataset = await readJson(`${directory}/dataset.json`);
  const records = await readJson(`${directory}/records.json`);
  const gates = await readJson(`${directory}/gates.json`);
  const savedSummary = await readJson(`${directory}/summary.json`);
  if (!Array.isArray(dataset.cases) || !Array.isArray(records)) throw new Error(`Invalid saved data in ${id}`);
  const primary = dataset.cases.map(item => {
    const record = records.find(row => row.caseId === item.id && row.variant === 'normal-1');
    const decision = record?.response?.ok ? record.decision : null;
    const intent = choice(decision?.intent), clarification = choice(decision?.clarification);
    const practice = choice(decision?.practice), directPractice = choice(decision?.rawPractice ?? decision?.practice);
    const intentCorrect = Boolean(decision && allows(item.expectedIntent, intent));
    const clarificationCorrect = Boolean(decision && allows(item.expectedNextQuestion, clarification));
    const practiceCorrect = Boolean(decision && item.practice && allows(item.practice.expected, practice));
    const hasClarification = Boolean(item.expectedNextQuestion?.length);
    return { item, record, intent, clarification, practice, directPractice, intentCorrect, clarificationCorrect, practiceCorrect, hasClarification,
      wholeCorrect: intentCorrect && (!hasClarification || clarificationCorrect) && (!item.practice || practiceCorrect),
      prohibited: (item.prohibitedQuestions || []).includes(clarification) };
  });
  const supported = primary.filter(row => row.item.expectedIntent.every(value => ['feasibility', 'bugfix', 'feature-delivery'].includes(value)));
  const clarifications = primary.filter(row => row.hasClarification);
  const practices = primary.filter(row => row.item.practice);
  const coverage = primary.flatMap(row => Object.entries(row.item.expectedCoverage || {}).map(([slot, expected]) => {
    const recipe = row.item.expectedIntent.length === 1 ? row.item.expectedIntent[0] : null;
    const actual = recipe && row.record?.response?.ok ? choice(row.record.response.answers?.[`coverage:${recipe}:${slot}`]) : null;
    return Boolean(actual && allows(expected, actual));
  }));
  const metrics = {
    intent: score(primary.map(row => row.intentCorrect)),
    supportedIntent: score(supported.map(row => row.intentCorrect)),
    clarification: score(clarifications.map(row => row.clarificationCorrect)),
    jointIntentAndQuestion: score(clarifications.map(row => row.intentCorrect && row.clarificationCorrect)),
    rawCoverage: { ...score(coverage), casesWithCoverageTargets: primary.filter(row => Object.keys(row.item.expectedCoverage || {}).length).length, returnedPrimaryCoverageAnswers: primary.reduce((sum, row) => sum + Object.keys(row.record?.response?.answers || {}).filter(key => key.startsWith('coverage:')).length, 0), interval: null, note: 'Only authored coverage targets are scored. Slots cluster within cases.' },
    practiceInclusion: score(practices.map(row => row.practiceCorrect)),
    directPracticeApplicability: score(practices.map(row => Boolean(row.record?.response?.ok && allows(row.item.practice.expected, row.directPractice)))),
    practiceOffers: offers(practices, 'practice'),
    directPracticeOffers: offers(practices, 'directPractice'),
    practiceById: [...new Set(practices.map(row => row.item.practice.id))].sort().map(practiceId => ({ practiceId, ...score(practices.filter(row => row.item.practice.id === practiceId).map(row => row.practiceCorrect)) })),
    wholeCase: score(primary.map(row => row.wholeCorrect)),
    supportedWholeCase: score(supported.map(row => row.wholeCorrect)),
  };
  metrics.wholeCase.wilson95 = wilson95(metrics.wholeCase.correct, metrics.wholeCase.total);
  const calls = records.map(row => row.response);
  const inputTokens = calls.reduce((sum, call) => sum + (call?.usage?.input_tokens || 0), 0);
  const primaryInputTokens = primary.reduce((sum, row) => sum + (row.record?.response?.usage?.input_tokens || 0), 0);
  const completeUsage = manifest.status === 'complete' && records.length === manifest.trials && calls.every(call => call?.ok && call.attempts?.length === 1 && Number.isInteger(call.usage?.input_tokens) && call.usage.input_tokens >= 0);
  const price = manifest.pricePerMillionInput;
  if (!Number.isFinite(price) || price < 0) throw new Error(`Invalid saved price in ${id}`);
  const usage = { inputTokens, primaryInputTokens, pricePerMillionInputUsd: price, listedPriceEstimateUsd: inputTokens / 1e6 * price, primaryListedPriceEstimateUsd: primaryInputTokens / 1e6 * price,
    meanEstimatePer1000TrialRequestsUsd: records.length ? inputTokens / 1e6 * price / records.length * 1000 : null,
    meanEstimatePer1000PrimaryRequestsUsd: primary.length ? primaryInputTokens / 1e6 * price / primary.length * 1000 : null,
    maxTrialInputTokens: Math.max(0, ...calls.map(call => call?.usage?.input_tokens || 0)), completeKnownUsage: completeUsage,
    formula: 'inputTokens / 1000000 * saved pricePerMillionInputUsd',
    scope: 'Model input tokens for the saved request mix. Estimates include stability trials and exclude earlier pilot runs, browser, proxy and other infrastructure. This is not an invoice or a complete app price.' };
  const latency = { primaryMedian: nearestRank(primary.map(row => row.record?.totalLatencyMs), .5), primaryP95: nearestRank(primary.map(row => row.record?.totalLatencyMs), .95), allTrialsP95: nearestRank(records.map(row => row.totalLatencyMs), .95), completePrimary: primary.every(row => row.record?.response?.ok && Number.isFinite(row.record.totalLatencyMs)),
    formula: 'Sort finite totalLatencyMs values ascending. Select index ceil(probability * sampleCount) - 1.',
    sample: 'Primary uses normal-1 once per authored case. All trials include normal repeats and reversed options.',
    scope: 'One API request per decision, three concurrent runner jobs. totalLatencyMs starts before request construction and persistence, includes network, response parsing, validation, response persistence and decision code. It ends before records.jsonl persistence. Browser, proxy, rendering, artifact generation and user time are excluded.' };
  const normalRecords = records.filter(row => /^normal-\d+$/.test(row.variant));
  const reversedRecords = records.filter(row => row.reverse);
  const repeatDisagreements = [], optionOrderDisagreements = [];
  for (const item of dataset.cases) {
    const normal = normalRecords.filter(row => row.caseId === item.id).sort((a, b) => a.variant.localeCompare(b.variant));
    const reversed = reversedRecords.find(row => row.caseId === item.id);
    for (const task of ['intent', 'clarification', 'practice']) {
      const outcomes = normal.map(row => signature(row)[task]);
      if (new Set(outcomes).size > 1) repeatDisagreements.push({ caseId: item.id, task, outcomes });
      if (reversed && normal[0] && signature(reversed)[task] !== signature(normal[0])[task]) optionOrderDisagreements.push({ caseId: item.id, task, normal: signature(normal[0])[task], reversed: signature(reversed)[task] });
    }
  }
  const sample = { uniqueCases: primary.length, distinctCaseIds: new Set(dataset.cases.map(item => item.id)).size, distinctBriefs: new Set(dataset.cases.map(item => item.brief)).size, primaryVariant: 'normal-1', trials: records.length, normalTrials: normalRecords.length, additionalNormalRepeatTrials: normalRecords.length - primary.length, reversedOptionTrials: reversedRecords.length, normalRepetitionsPerCase: manifest.repeats, validResponses: calls.filter(call => call?.ok).length, retries: calls.reduce((sum, call) => sum + Math.max(0, (call?.attempts?.length || 0) - 1), 0), missingPrimaryResponses: primary.filter(row => !row.record).length, invalidPrimaryResponses: primary.filter(row => row.record && !row.record.response?.ok).length,
    note: 'Repeats and reversed options measure stability. They are not independent cases. Invalid, missing and abstained decisions stay in primary denominators.' };
  const prohibitedIds = primary.filter(row => row.prohibited).map(row => row.item.id);
  const gateResults = {
    intent: { observed: metrics.intent.accuracy, minimum: gates.intentAccuracy, pass: metrics.intent.accuracy >= gates.intentAccuracy },
    clarification: { observed: metrics.clarification.accuracy, minimum: gates.clarificationAccuracyIncludingRouteErrors, pass: metrics.clarification.accuracy !== null && metrics.clarification.accuracy >= gates.clarificationAccuracyIncludingRouteErrors },
    practiceThreeClass: { observed: metrics.practiceInclusion.accuracy, minimum: gates.practiceThreeClassAccuracy, pass: metrics.practiceInclusion.accuracy !== null && metrics.practiceInclusion.accuracy >= gates.practiceThreeClassAccuracy },
    practicePrecision: { observed: metrics.practiceOffers.precision, minimum: gates.practiceOfferPrecision, pass: metrics.practiceOffers.precision !== null && metrics.practiceOffers.precision >= gates.practiceOfferPrecision },
    practiceRecall: { observed: metrics.practiceOffers.recall, minimum: gates.practiceOfferRecall, pass: metrics.practiceOffers.recall !== null && metrics.practiceOffers.recall >= gates.practiceOfferRecall },
    wholeCase: { observed: metrics.wholeCase.accuracy, minimum: gates.strictWholeCaseSuccess, pass: metrics.wholeCase.accuracy >= gates.strictWholeCaseSuccess },
    noRepeatedAnsweredQuestion: { observed: prohibitedIds.length, maximum: gates.prohibitedRepeatedQuestions, caseIds: prohibitedIds, pass: prohibitedIds.length <= gates.prohibitedRepeatedQuestions },
    p95Latency: { observedMs: latency.primaryP95.valueMs, maximumMs: gates.p95LatencyMs, pass: latency.completePrimary && latency.primaryP95.valueMs <= gates.p95LatencyMs },
    estimatedCost: { observedMaxUsd: usage.maxTrialInputTokens / 1e6 * price, maximumUsd: gates.maxPerTrialEstimatedUsd, pass: completeUsage && usage.maxTrialInputTokens / 1e6 * price <= gates.maxPerTrialEstimatedUsd },
  };
  const selectedOutcomes = primary.filter(row => !row.wholeCorrect).flatMap(row => [
    ...(!row.intentCorrect ? [{ caseId: row.item.id, task: 'intent', expected: row.item.expectedIntent, actual: row.intent, reportedConfidence: row.record?.decision?.intent?.confidence ?? null }] : []),
    ...(row.hasClarification && !row.clarificationCorrect ? [{ caseId: row.item.id, task: 'clarification', expected: row.item.expectedNextQuestion, actual: row.clarification, reportedConfidence: row.record?.decision?.clarification?.confidence ?? null, repeatedAnsweredQuestion: row.prohibited }] : []),
    ...(row.item.practice && !row.practiceCorrect ? [{ caseId: row.item.id, task: 'practice', practiceId: row.item.practice.id, expected: row.item.practice.expected, actual: row.practice, reportedConfidence: row.record?.decision?.practice?.confidence ?? null }] : []),
  ]);
  const manifestHashChecks = [];
  for (const [file, expectedSha256] of Object.entries(manifest.hashes || {})) {
    const path = `${directory}/${file}`;
    try {
      const actualSha256 = sha256(await readSource(path));
      manifestHashChecks.push({ path, expectedSha256, actualSha256, matches: expectedSha256 === actualSha256 });
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
      manifestHashChecks.push({ path, expectedSha256, actualSha256: null, matches: false, error: 'Missing saved snapshot' });
    }
  }
  const datasetActualHash = sources.get(`${directory}/dataset.json`).sha256;
  const scorerActualHash = sources.get(`${directory}/score.mjs`)?.sha256;
  const checks = { datasetHash: { expectedSha256: manifest.datasetSha256, actualSha256: datasetActualHash, matches: datasetActualHash === manifest.datasetSha256 }, manifestCaseCountMatches: manifest.caseCount === primary.length, manifestTrialCountMatches: manifest.trials === records.length, manifestInputTokensMatch: manifest.inputTokens === inputTokens,
    savedSummaryCountsMatch: savedSummary.metrics.intent.correct === metrics.intent.correct && savedSummary.metrics.intent.total === metrics.intent.total && savedSummary.metrics.clarification.correct === metrics.clarification.correct && savedSummary.metrics.clarification.total === metrics.clarification.total && savedSummary.metrics.practice.correct === metrics.practiceInclusion.correct && savedSummary.metrics.practice.total === metrics.practiceInclusion.total && savedSummary.metrics.wholeCase.correct === metrics.wholeCase.correct && savedSummary.metrics.wholeCase.total === metrics.wholeCase.total,
    savedSummaryScorerMatchesRunSnapshot: savedSummary.scorerSha256 === scorerActualHash,
    scorerNote: 'Earlier summaries were recalculated after a binary precision correction. Their scorer can differ from the original run snapshot. Final inference saved the corrected scorer.', manifestHashChecks };
  return { id, model: manifest.model, promptVersion: manifest.promptVersion, evaluationUse: final ? 'Last fresh synthetic set, frozen stopping rule, no further tuning' : id.includes('heldout') ? 'Fresh at first inference, later used as development' : 'Exposed development', sample, metrics, latency, usage, stability: { repeatDisagreements, optionOrderDisagreements }, gateResults,
    failedGates: Object.entries(gateResults).filter(([, value]) => !value.pass).map(([name]) => name), allObservedGatesPass: Object.values(gateResults).every(value => value.pass), selectedOutcomes, checks };
}

async function buildEvidence() {
  const runs = [];
  for (const id of runIds) runs.push(await auditRun(id, id === finalRunId));
  const finalRun = runs.find(run => run.id === finalRunId);
  const selection = await readJson(`${pilot}/selection-v7.json`);
  const history = runs.map(run => ({ id: run.id, promptVersion: run.promptVersion, evaluationUse: run.evaluationUse, sample: run.sample, metrics: run.metrics, primaryP95Ms: run.latency.primaryP95.valueMs, inputTokens: run.usage.inputTokens, listedPriceEstimateUsd: run.usage.listedPriceEstimateUsd, failedGates: run.failedGates }));
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    scope: { evidenceType: 'Synthetic API screening of saved runs', confidenceInReconciledMeasurements: 'high', realUserGeneralization: 'unknown', realUsersMeasured: 0, uiIntegrationMeasured: false, productionDeploymentMeasured: false, fallbackValidated: false,
      invalidResponsePolicy: 'The isolated runner returns no decision for an invalid response. It does not invoke a deterministic fallback. No application fallback was evaluated.',
      supportedRecipes: ['feasibility', 'bugfix', 'feature-delivery'], supportedPractices: ['minimum-change', 'specification-first', 'evidence-wiki'],
      limitations: ['Manually authored synthetic targets are not a random sample of production requests or independent human validation.', 'Whole-case success scores intent, selected next question and designated practice inclusion. It does not require every raw slot judgment to be correct.', 'Raw coverage accuracy scores three authored workflow slots per eligible case, not every speculative slot returned.', 'Next question and final practice inclusion are model plus code. Direct applicability is a separate comparison.', 'No empirical confidence calibration, comparison with human authoring, artifact use or user effort was measured.', 'Each request assessed intent and nine speculative context slots. One designated practice adds direct applicability, positive need and boundary questions.', 'Earlier fresh sets became development data before v7. They do not provide fresh evidence for v7.', 'Pricing uses the saved unit price. The exporter does not verify current pricing.'] },
    finalRun,
    optimizationHistory: history,
    optimizationAggregate: { runs: runs.length, calls: runs.reduce((sum, run) => sum + run.sample.trials, 0), validResponses: runs.reduce((sum, run) => sum + run.sample.validResponses, 0), retries: runs.reduce((sum, run) => sum + run.sample.retries, 0), inputTokens: runs.reduce((sum, run) => sum + run.usage.inputTokens, 0), listedPriceEstimateUsd: runs.reduce((sum, run) => sum + run.usage.listedPriceEstimateUsd, 0), scope: 'All eight optimization runs, including exposed development, rejected candidates and stability trials. Earlier protocol probes and the previous pilot are excluded.' },
    provenance: { sourceAvailability: 'Owner local evidence. Raw briefs, author descriptions, API headers and credentials are not included.', selectionChecks: { promptHashMatchesFinalSnapshot: selection.promptSha256 === finalRun.checks.manifestHashChecks.find(value => value.path.endsWith('/questions-v7.mjs'))?.actualSha256, datasetHashMatchesFinalSnapshot: selection.freshDatasetSha256 === finalRun.checks.datasetHash.actualSha256 },
      runChecks: runs.map(run => ({ id: run.id, ...run.checks })), sources: [...sources.values()].sort((a, b) => a.path.localeCompare(b.path)) },
  };
}
const argumentsList = process.argv.slice(2);
if (argumentsList.some(value => !['--write', '--check'].includes(value)) || argumentsList.length > 1) {
  throw new Error('Usage: node tools/jev-docs-evidence.mjs [--write | --check]');
}
const evidence = await buildEvidence();
const stable = value => { const { generatedAt, ...content } = value; return content; };
if (argumentsList.includes('--check')) {
  const saved = JSON.parse(await readFile(resolve(repository, snapshotPath), 'utf8'));
  if (JSON.stringify(stable(saved)) !== JSON.stringify(stable(evidence))) throw new Error('Saved JEV evidence differs from recomputed source evidence. Review changes before using --write.');
  process.stdout.write(`Verified ${snapshotPath} against saved source evidence.\n`);
} else if (argumentsList.includes('--write')) {
  await mkdir(dirname(resolve(repository, snapshotPath)), { recursive: true });
  await writeFile(resolve(repository, snapshotPath), `${JSON.stringify(evidence, null, 2)}\n`);
  process.stdout.write(`Wrote ${snapshotPath}.\n`);
} else {
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}
