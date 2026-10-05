import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRecipe, parseImport, serializeProject, getEffectiveSkills, compileSelectedOutput, selectRecipe } from '../factory/core.mjs';
import { resolveWorkflowProcesses } from '../factory/workflow-model.mjs';
import { createBackendWorkflowFixture, createBugfixWorkflowFixture, createDocumentWorkflowFixture } from '../factory/workflow-fixtures.mjs';
import { getOpenedOutputSelection } from '../factory/journey.mjs';
import { createDecisionReview, restoreDecisionReview } from '../factory/decision-review.mjs';
import { packageProject, readProjectFiles } from '../factory/portable.mjs';
import { zipFiles } from '../factory/zip.mjs';
import { renderWorkflowModel, workflowModelMarkdown } from '../factory/workflow-model-view.mjs';

const oldText = readFileSync(new URL('./fixtures/workflow-model/schema-2.json', import.meta.url), 'utf8');
const old = JSON.parse(oldText);
const file = (name, content) => new File([content], name);

test('a saved version 2 project migrates without changing its existing decisions or inventing routes', () => {
  const migrated = parseImport(oldText);
  assert.equal(migrated.schemaVersion, '3.0');
  for (const [key, value] of Object.entries(old)) if (key !== 'schemaVersion') assert.deepEqual(migrated[key], value, key);
  assert.deepEqual(migrated.workflowModel, { version: '1.0', processes: [{ id: 'development', source: 'recipe', kind: 'development' }], evidenceLinks: [] });
  const [process] = resolveWorkflowProcesses(migrated);
  assert.ok(process.inputDependencies.length);
  for (const key of ['checks', 'transitions', 'corrections', 'approvals', 'terminals']) assert.deepEqual(process[key], []);
  assert.deepEqual(parseImport(serializeProject(migrated)), migrated);
  assert.equal(serializeProject(parseImport(oldText)), serializeProject(migrated));
});

test('recipe projections follow edits without a second stored graph', () => {
  const config = parseImport(oldText);
  config.workflow.enabledStages = ['diagnosis'];
  config.workflow.suppliedInputs.reproduction = 'Changed supplied record';
  config.workflow.bindings.diagnosis.actorName = 'Recorded person';
  const [view] = resolveWorkflowProcesses(config);
  assert.deepEqual(view.steps.map(step => step.id), ['diagnosis']);
  assert.equal(view.results.find(result => result.id === 'reproduction-output').suppliedSource, 'Changed supplied record');
  view.steps[0].actor.name = 'Discarded view edit';
  assert.equal(config.workflow.bindings.diagnosis.actorName, 'Recorded person');
  assert.deepEqual(Object.keys(config.workflowModel.processes[0]).sort(), ['id', 'kind', 'source']);
});

test('schema 2 reduced output manifests retain their scope after migration', () => {
  const config = parseImport(oldText);
  const skill = getEffectiveSkills(config)[0].id;
  for (const kind of ['pack', 'blueprint', 'skill']) {
    assert.deepEqual(getOpenedOutputSelection(config, [{ path: 'manifest.json', content: JSON.stringify({ schemaVersion: '2.0', kind, skill }) }]), { kind, skillId: kind === 'skill' ? skill : null });
  }
  assert.equal(getOpenedOutputSelection(config, [{ path: 'manifest.json', content: JSON.stringify({ schemaVersion: '99.0', kind: 'blueprint' }) }]), null);
});

test('supported older decision review settings migrate together and retain the reason', () => {
  const baseline = parseImport(oldText);
  const current = structuredClone(baseline);
  current.project.purpose = 'Investigate the filter bug';
  const record = createDecisionReview(baseline, current, { reason: 'The observed bug needs investigation.', selection: { kind: 'blueprint' } });
  for (const config of [record.baseline, record.current]) { delete config.workflowModel; config.schemaVersion = '2.0'; }
  const restored = restoreDecisionReview(JSON.stringify(record), { current });
  assert.equal(restored.review.reason, record.reason);
  assert.deepEqual(restored.review.baseline, baseline);
  assert.deepEqual(restored.review.current, current);
  assert.ok(restored.warnings.length);
  assert.throws(() => restoreDecisionReview(JSON.stringify(record), { current: baseline }), /do not match/);
});

test('process record changes are explained by stable IDs in decision review', () => {
  const baseline = createDocumentWorkflowFixture();
  const current = structuredClone(baseline);
  current.workflowModel.processes[0].corrections[0].maxCorrections = 3;
  const review = createDecisionReview(baseline, current, { selection: { kind: 'blueprint' } });
  const decision = review.changes.find(change => change.path.includes('.corrections.'));
  assert.equal(decision.before.maxCorrections, 2);
  assert.equal(decision.after.maxCorrections, 3);
  assert.ok(decision.affectedFiles.includes('WORKFLOW.md'));
});

for (const [name, create] of [['backend', createBackendWorkflowFixture], ['bug', createBugfixWorkflowFixture], ['document', createDocumentWorkflowFixture]]) {
  test(`${name} model and externally edited text survive JSON, ZIP, HTML and folder imports`, async () => {
    const config = create();
    const pack = compileSelectedOutput(config, { kind: 'blueprint' });
    const original = pack.files.find(item => item.path === 'WORKFLOW.md');
    original.content += '\nHuman note kept verbatim. Café.\n';
    const output = packageProject(config, pack);
    const cases = [
      [file('project.json', serializeProject(config))],
      [file('workflow.zip', zipFiles(output.files))],
      [file('PROJECT-ATLAS.html', output.files.find(item => item.path === 'PROJECT-ATLAS.html').content)],
      output.files.map(item => { const input = file(item.path.split('/').at(-1), item.content); Object.defineProperty(input, 'webkitRelativePath', { value: `project/${item.path}` }); return input; }),
    ];
    for (const [index, input] of cases.entries()) {
      const opened = await readProjectFiles(input);
      assert.deepEqual(opened.config, config);
      if (index) {
        assert.equal(opened.files.find(item => item.path === 'WORKFLOW.md').content, original.content);
        assert.deepEqual(getOpenedOutputSelection(opened.config, opened.files), { kind: 'blueprint', skillId: null });
      }
    }
  });
}

test('custom designs remain in a focused skill pack even when their guide is omitted', async () => {
  const config = createBackendWorkflowFixture();
  const skillId = getEffectiveSkills(config)[0].id;
  const output = packageProject(config, compileSelectedOutput(config, { kind: 'skill', skillId }));
  assert.ok(!output.files.some(item => item.path === 'WORKFLOW.md'));
  const reopened = await readProjectFiles([file('workflow.zip', zipFiles(output.files))]);
  assert.deepEqual(reopened.config.workflowModel, config.workflowModel);
  assert.deepEqual(getOpenedOutputSelection(reopened.config, reopened.files), { kind: 'skill', skillId });
});

test('readable projections escape supplied markup and explain bounds without execution claims', () => {
  const config = createDocumentWorkflowFixture();
  config.workflowModel.processes[0].name = '<img src=x onerror=alert(1)>';
  const html = renderWorkflowModel(config);
  assert.ok(!html.includes('<img'));
  assert.ok(html.includes('&lt;img'));
  for (const content of [html, workflowModelMarkdown(config)]) {
    assert.match(content, /Atlas does not run/);
    assert.match(content, /Count entry into each correction attempt/);
    assert.match(content, /Maximum corrections/);
  }
});

test('switching a custom-only project to a recipe preserves custom records without ID collision', () => {
  const config = createDocumentWorkflowFixture();
  config.workflowModel.processes[0].id = 'development';
  const next = selectRecipe(config, 'bugfix');
  assert.equal(next.workflowModel.processes[0].id, 'development-2');
  assert.deepEqual(next.workflowModel.processes[1], config.workflowModel.processes[0]);
  assert.doesNotThrow(() => parseImport(serializeProject(next)));
  assert.equal(createRecipe().workflowModel.processes.length, 1);
});

test('adding a recipe to a full process collection fails without changing the source project', () => {
  const config = createDocumentWorkflowFixture();
  config.workflowModel.processes = Array.from({ length: 8 }, (_, index) => ({ ...structuredClone(config.workflowModel.processes[0]), id: `document-${index}` }));
  const before = serializeProject(config);
  assert.throws(() => selectRecipe(config, 'bugfix'), /free process slot/);
  assert.equal(serializeProject(config), before);
});
