import test from 'node:test';
import assert from 'node:assert/strict';
import { posix } from 'node:path';
import { createDefault, createRecipe, createExample, compile, getStages, parseImport, serializeProject } from '../factory/core.mjs';
import { recommendOutput, compileOutput, compileOpenedOutput, getOpenedOutputSelection, getUseGuide } from '../factory/journey.mjs';
import { packageProject, readProjectFiles } from '../factory/portable.mjs';
import { compareFiles } from '../factory/maintenance.mjs';
import { zipFiles } from '../factory/zip.mjs';

const find = (pack, path) => pack.files.find(file => file.path === path);
const manifest = pack => JSON.parse(find(pack, 'manifest.json').content);
const file = (name, content) => new File([content], name);
function focusedProject() {
  const config = createExample('feature-delivery');
  config.workflow.enabledStages = ['architecture'];
  config.workflow.suppliedInputs.requirements = 'docs/accepted-requirements.md';
  config.skills = [];
  config.agents = config.agents.filter(agent => agent.role === 'analyst');
  return config;
}

test('recommendations start with a readable handoff without treating template agents as a request for a pack', () => {
  for (const config of [createDefault(), createRecipe('bugfix'), createExample('feasibility'), focusedProject()]) {
    const before = serializeProject(config);
    assert.deepEqual({ kind: recommendOutput(config).kind, skillId: recommendOutput(config).skillId }, { kind: 'blueprint', skillId: null });
    assert.equal(manifest(compileOutput(config)).kind, 'blueprint');
    assert.equal(serializeProject(config), before);
  }
  const config = focusedProject();
  for (const selection of [{ kind: 'blueprint', skillId: null }, { kind: 'pack', skillId: null }, { kind: 'skill', skillId: 'impact-analysis' }]) {
    const chosen = compileOutput(config, selection);
    assert.deepEqual(getOpenedOutputSelection(config, chosen.files), selection);
    assert.equal(manifest(chosen).kind, selection.kind);
    assert.equal(manifest(compileOpenedOutput(config, chosen.files)).kind, selection.kind);
  }
});

test('unchosen environments stay unresolved in readable output and draft in custom agent outputs', async () => {
  const config = createExample('feasibility');
  config.project.host = '';
  config.project.sourceControl = '';
  const before = serializeProject(config);
  const blueprint = compileOutput(config, { kind: 'blueprint' });
  assert.equal(blueprint.validation.configurationComplete, true);
  assert.ok(!blueprint.validation.issues.some(issue => ['project.host', 'project.sourceControl'].includes(issue.path)));
  assert.match(find(blueprint, 'WORKFLOW.md').content, /Environment: UNRESOLVED/);
  assert.match(find(blueprint, 'WORKFLOW.md').content, /Source control: UNRESOLVED/);
  assert.ok(!blueprint.files.some(item => item.path.startsWith('.github/')));
  const output = compileOutput(config, { kind: 'pack' });
  assert.equal(output.validation.configurationComplete, false);
  assert.equal(manifest(output).draft, true);
  assert.ok(output.validation.issues.some(issue => issue.code === 'missing-environment'));
  assert.ok(output.validation.issues.some(issue => issue.code === 'missing-source-control'));
  assert.match(find(output, 'INSTALL.md').content, /Unresolved environment/);
  const focused = compileOutput(config, { kind: 'skill', skillId: 'requirement-refinement' });
  assert.equal(focused.validation.configurationComplete, true);
  assert.ok(!focused.validation.issues.some(issue => ['missing-environment', 'missing-source-control'].includes(issue.code)));
  assert.match(find(focused, 'INSTALL.md').content, /Unresolved environment/);
  assert.equal(focused.validation.hostExercised, false);
  const portable = packageProject(config, blueprint);
  const html = find(portable, 'PROJECT-ATLAS.html').content;
  assert.match(html, /Environment not chosen/);
  assert.match(html, /Source control not chosen/);
  const reopened = await readProjectFiles([file('project.zip', zipFiles(portable.files))]);
  assert.deepEqual(reopened.config, config);
  assert.equal(manifest(compileOpenedOutput(reopened.config, reopened.files)).kind, 'blueprint');
  assert.equal(serializeProject(config), before);
});

test('a fresh process study does not require an invented component and output guidance preserves actor decisions', () => {
  const config = createRecipe('feasibility');
  assert.deepEqual(config.components, []);
  assert.equal(createDefault().components.length, 1);
  assert.equal(createRecipe('bugfix').components.length, 1);
  assert.equal(createExample('feasibility').components.length, 2);
  config.project.name = 'Process study';
  config.project.purpose = 'Decide how to improve the existing manual process.';
  const before = serializeProject(config);
  const selection = recommendOutput(config);
  getUseGuide(config, selection);
  const pack = compileOutput(config, selection);
  assert.equal(serializeProject(config), before);
  assert.deepEqual(parseImport(find(pack, 'project.json').content).workflow.bindings, config.workflow.bindings);
  assert.ok(!pack.validation.issues.some(issue => issue.severity === 'error' && issue.path.startsWith('components')));
  assert.ok(pack.validation.issues.some(issue => issue.severity === 'error' && issue.path === 'project.sourceLocations'));
  assert.equal(pack.validation.configurationComplete, false);
  assert.ok(config.workflow.bindings['current-process'].actorType === 'agent');
  assert.ok(!pack.files.some(item => item.path.startsWith('.github/')));
});

test('blueprints omit host profiles while preserving truthful workflow, decisions and relevant templates', () => {
  const config = createExample('feasibility');
  const before = serializeProject(config);
  const pack = compileOutput(config, { kind: 'blueprint' });
  assert.equal(serializeProject(config), before);
  assert.equal(manifest(pack).kind, 'blueprint');
  assert.equal(manifest(pack).target.family, 'workflow-blueprint');
  assert.ok(!pack.files.some(item => item.path.startsWith('.github/')));
  for (const path of ['WORKFLOW.md', 'project.json', 'PROJECT-FACTS.md', 'EVIDENCE.md', 'SOURCES.md', 'RUNTIME-DESIGN.md', 'templates/REQUIREMENTS.md', 'templates/DECISION.md', 'templates/EVALUATION.md', 'templates/CONTRACTS.md', 'INSTALL.md', 'VALIDATION.md']) assert.ok(find(pack, path), path);
  assert.match(find(pack, 'INSTALL.md').content, /human|people/);
  assert.match(find(pack, 'INSTALL.md').content, /Agree which next step should happen/);
  assert.deepEqual(parseImport(find(pack, 'project.json').content), config);
  assert.deepEqual(manifest(pack).files, pack.files.map(item => item.path).sort());
});

test('focused exports contain a complete independent skill and the original decisions with accurate inventory', () => {
  const config = focusedProject();
  const pack = compileOutput(config, { kind: 'skill', skillId: 'impact-analysis' });
  const prefix = '.github/skills/impact-analysis/';
  assert.equal(manifest(pack).kind, 'skill');
  assert.equal(manifest(pack).skill, 'impact-analysis');
  assert.equal(pack.files.length, 6);
  for (const path of [`${prefix}SKILL.md`, `${prefix}references/project.md`, 'project.json', 'INSTALL.md', 'VALIDATION.md', 'manifest.json']) assert.ok(find(pack, path), path);
  assert.ok(!pack.files.some(item => item.path.startsWith('.github/agents/')));
  assert.ok(!find(pack, 'WORKFLOW.md'));
  for (const item of pack.files.filter(item => item.path.startsWith(prefix))) for (const match of item.content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    if (match[1].startsWith('https://')) continue;
    const resolved = posix.normalize(posix.join(posix.dirname(item.path), match[1]));
    assert.ok(resolved.startsWith(prefix));
    assert.ok(find(pack, resolved), `${item.path} -> ${resolved}`);
  }
  assert.deepEqual(manifest(pack).files, pack.files.map(item => item.path).sort());
  assert.deepEqual(manifest(pack).artifacts.map(item => item.path).sort(), pack.files.filter(item => !['VALIDATION.md', 'manifest.json'].includes(item.path)).map(item => item.path).sort());
  assert.deepEqual(parseImport(find(pack, 'project.json').content), config);
  assert.equal(pack.validation.formatChecked, true);
  assert.equal(pack.validation.configurationComplete, true);
});

test('full pack selection retains the existing compiler output', () => {
  const config = createExample('bugfix');
  assert.deepEqual(compileOutput(config, { kind: 'pack' }), compile(config));
  assert.equal(manifest(compile(config)).kind, 'pack');
});

test('output and skill choices reject unknown, unsafe and unselected values without changing the project', () => {
  const config = focusedProject();
  const before = serializeProject(config);
  for (const kind of ['unknown', '../outside', null]) assert.throws(() => compileOutput(config, { kind }), /supported output/);
  for (const skillId of ['../outside', 'unknown', null]) assert.throws(() => compileOutput(config, { kind: 'skill', skillId }), /supported skill/);
  assert.throws(() => compileOutput(config, { kind: 'skill', skillId: 'verification' }), /Assign or select/);
  assert.throws(() => getUseGuide(config, { kind: 'unsupported' }), /supported output/);
  assert.equal(serializeProject(config), before);
});

test('all three portable outputs reopen exact decisions through JSON, ZIP and Project Atlas HTML', async () => {
  for (const [config, selection] of [
    [createExample('feasibility'), { kind: 'blueprint' }],
    [focusedProject(), { kind: 'skill', skillId: 'impact-analysis' }],
    [createExample('bugfix'), { kind: 'pack' }],
  ]) {
    config.project.name = 'Study Ελληνικά 世界';
    config.evidence = [{ id: 'project-check', stageId: '', check: 'Review the proposal', expected: 'The owner accepts the scope', observed: '', status: 'planned', method: 'user-recorded', source: '', reviewer: '' }];
    const pack = packageProject(config, compileOutput(config, selection));
    assert.deepEqual(manifest(pack).files, pack.files.map(item => item.path).sort());
    assert.equal(manifest(pack).kind, selection.kind);
    const inputs = [
      file('project.json', find(pack, 'project.json').content),
      file('project.zip', zipFiles(pack.files)),
      file('PROJECT-ATLAS.html', find(pack, 'PROJECT-ATLAS.html').content),
    ];
    for (const input of inputs) {
      const result = await readProjectFiles([input]);
      assert.deepEqual(result.config, config);
      assert.equal(result.config.evidence[0].observed, '');
      if (input.name !== 'project.json') {
        const expected = pack.files.filter(item => input.name.endsWith('.html') ? item.path !== 'PROJECT-ATLAS.html' : true).map(item => item.path).sort();
        assert.deepEqual(result.files.map(item => item.path).sort(), expected);
        assert.equal(JSON.parse(result.files.find(item => item.path === 'manifest.json').content).kind, selection.kind);
        assert.equal(result.files.find(item => item.path === 'INSTALL.md').content, find(pack, 'INSTALL.md').content);
      }
    }
  }
});

test('use guides distinguish human handoff and concrete selected host adoption without invented observations', () => {
  const study = createExample('feasibility');
  const human = getUseGuide(study, { kind: 'blueprint' });
  assert.equal(human.source, null);
  assert.ok(human.steps.some(step => step.title === 'Agree the next action'));
  assert.doesNotMatch(JSON.stringify(human), /install|credential|capabilit|tools list|selector/i);
  for (const host of ['jetbrains', 'vscode', 'github']) {
    const config = focusedProject();
    config.project.host = host;
    const skill = getUseGuide(config, { kind: 'skill', skillId: 'impact-analysis' });
    assert.ok(skill.steps.some(step => step.body.includes('.github/skills/impact-analysis/')));
    assert.ok(skill.steps.some(step => step.title === 'If it is missing or behaves unexpectedly'));
    assert.ok(skill.steps.some(step => /host and extension or plugin versions/.test(step.body)));
    assert.match(skill.source, /^https:\/\/docs.github.com\//);
    assert.doesNotMatch(JSON.stringify(skill), /custom agent|public preview|tools list|\.github\/agents|target values/i);
    assert.doesNotMatch(find(compileOutput(config, { kind: 'skill', skillId: 'impact-analysis' }), 'INSTALL.md').content, /custom agent|public preview|tools list|\.github\/agents|target values/i);
    const pack = compileOutput(config, { kind: 'pack' });
    assert.match(find(pack, 'INSTALL.md').content, /\.github\/agents\/ and \.github\/skills\//);
    assert.match(find(pack, 'INSTALL.md').content, /\[NOT RUN\]/);
    assert.equal(pack.validation.hostExercised, false);
    assert.equal(manifest(pack).validation.behaviorObserved, false);
    assert.equal(manifest(pack).validation.improvementEstablished, false);
    if (host === 'jetbrains') assert.match(find(pack, 'INSTALL.md').content, /public preview/);
    if (host === 'github') assert.match(find(pack, 'INSTALL.md').content, /repository stored on GitHub/);
  }
  const config = focusedProject();
  config.agents = [];
  const noProfiles = getUseGuide(config, { kind: 'pack' });
  assert.doesNotMatch(JSON.stringify(noProfiles), /custom agent|public preview|tools list|\.github\/agents|target values/i);
  assert.match(noProfiles.steps.find(step => step.title === 'Place the files').body, /\.github\/skills\//);
});

test('draft findings remain explicit in a reduced output', () => {
  const config = focusedProject();
  config.project.purpose = '';
  const pack = compileOutput(config, { kind: 'skill', skillId: 'impact-analysis' });
  assert.equal(pack.validation.configurationComplete, false);
  assert.equal(manifest(pack).draft, true);
  assert.match(find(pack, 'VALIDATION.md').content, /no, draft/);
  assert.match(find(pack, 'VALIDATION.md').content, /Host exercised: no/);
  assert.match(find(pack, 'VALIDATION.md').content, /Outcome improvement established: no/);
  assert.ok(pack.validation.issues.some(issue => issue.path === 'project.purpose'));
});

const comparisonFiles = files => files.filter(file => !['PROJECT-ATLAS.html', 'manifest.json', 'project.json'].includes(file.path)).map(({ path, content }) => ({ path, content }));

test('reopened reduced outputs compare with their original scope without false external edits', () => {
  for (const [config, selection] of [
    [createExample('feasibility'), { kind: 'blueprint' }],
    [focusedProject(), { kind: 'skill', skillId: 'impact-analysis' }],
  ]) {
    const before = serializeProject(config);
    const original = packageProject(config, compileOutput(config, selection));
    const fresh = compileOpenedOutput(config, original.files);
    assert.equal(manifest(fresh).kind, selection.kind);
    assert.equal(serializeProject(config), before);
    const rows = compareFiles([], comparisonFiles(original.files), comparisonFiles(fresh.files));
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => row.status === 'unchanged'), JSON.stringify(rows.filter(row => row.status !== 'unchanged')));
    assert.equal(find(fresh, 'INSTALL.md').content, find(original, 'INSTALL.md').content);
  }
});

test('matching opened scope retains real edits and recomputes validation rather than trusting imported claims', () => {
  const config = focusedProject();
  const original = packageProject(config, compileOutput(config, { kind: 'skill', skillId: 'impact-analysis' }));
  find(original, 'INSTALL.md').content += '\nProject specific handoff note.\n';
  const supplied = manifest(original);
  Object.assign(supplied.validation, { hostExercised: true, behaviorObserved: true, improvementEstablished: true });
  find(original, 'manifest.json').content = JSON.stringify(supplied);
  const fresh = compileOpenedOutput(config, original.files);
  const changed = compareFiles([], comparisonFiles(original.files), comparisonFiles(fresh.files)).filter(row => row.status !== 'unchanged');
  assert.deepEqual(changed.map(row => row.path), ['INSTALL.md']);
  assert.equal(changed[0].status, 'conflict');
  assert.equal(changed[0].resolution, '');
  assert.equal(fresh.validation.hostExercised, false);
  assert.equal(manifest(fresh).validation.behaviorObserved, false);
  assert.equal(manifest(fresh).validation.improvementEstablished, false);
  assert.ok(find(original, 'INSTALL.md').content.endsWith('Project specific handoff note.\n'));
});

test('missing, malformed, unsupported, ambiguous and reviewed manifests fall back to full generation', () => {
  const config = focusedProject();
  const record = content => [{ path: 'manifest.json', content }];
  const cases = [
    undefined,
    [],
    record('{broken'),
    record('null'),
    record('[]'),
    record(JSON.stringify({ schemaVersion: '1.0', kind: 'skill', skill: 'impact-analysis' })),
    record(JSON.stringify({ schemaVersion: '2.0', kind: 'unknown' })),
    record(JSON.stringify({ schemaVersion: '2.0', kind: 'reviewed-file-set' })),
    record(JSON.stringify({ schemaVersion: '2.0', kind: 'skill', skill: '../outside' })),
    record(JSON.stringify({ schemaVersion: '2.0', kind: 'skill', skill: 'verification' })),
    [{ path: 'manifest.json', content: JSON.stringify({ schemaVersion: '2.0', kind: 'blueprint' }) }, { path: 'MANIFEST.JSON', content: '{}' }],
    [{ path: '../manifest.json', content: JSON.stringify({ schemaVersion: '2.0', kind: 'blueprint' }) }],
  ];
  for (const files of cases) {
    assert.equal(getOpenedOutputSelection(config, files), null);
    const fresh = compileOpenedOutput(config, files);
    assert.deepEqual(fresh, compileOutput(config, { kind: 'pack' }));
    assert.ok(find(fresh, '.github/agents/analyst.agent.md'));
  }
});
