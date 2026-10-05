import test from 'node:test';
import assert from 'node:assert/strict';
import { CATALOG, createRecipe, createExample, compile, parseImport } from '../factory/core.mjs';
import { PRACTICE_TOPIC_IDS, getPracticeAction, applyPracticeAction } from '../factory/practice-actions.mjs';
import { guidanceSnapshot } from '../factory/guidance-review.mjs';

test('the Knowledge bridge exposes six curated topic actions with primary references', () => {
  assert.equal(PRACTICE_TOPIC_IDS.length, 6);
  const config = createExample('feature-delivery');
  config.runtime.enabled = true;
  for (const topicId of PRACTICE_TOPIC_IDS) {
    const action = getPracticeAction(topicId, config);
    assert.equal(action.topicId, topicId);
    assert.ok(action.reason && action.changes.length);
    assert.match(action.source, /^https:\/\//);
  }
  assert.equal(getPracticeAction('jev-judgments', config), null);
  assert.equal(getPracticeAction('unknown-topic', config), null);
  assert.equal(getPracticeAction('llm-wiki', null), null);
});

test('reference practice selection changes one decision and survives pack export and import', () => {
  const config = createExample('feature-delivery');
  config.workflow.notes.requirements = 'Keep the supplied decision owner and uncertain policy.';
  config.evidence.push({ id: 'pending', stageId: '', check: 'Host discovery', expected: 'Visible skill', observed: '', status: 'not-run', method: 'user-recorded', source: '', reviewer: '' });
  const before = structuredClone(config);
  const action = getPracticeAction('requirements-workflow', config);
  assert.equal(action.alreadyApplied, false);
  const result = applyPracticeAction(config, action.id);
  assert.notEqual(result, config);
  assert.deepEqual(config, before);
  assert.deepEqual(result, { ...before, practices: [...before.practices, 'specification-first'] });
  const pack = compile(result);
  assert.match(pack.files.find(file => file.path === 'SOURCES.md').content, /Requirements before implementation/);
  assert.deepEqual(parseImport(pack.files.find(file => file.path === 'project.json').content), result);
  assert.equal(getPracticeAction('requirements-workflow', result).alreadyApplied, true);
  assert.deepEqual(applyPracticeAction(result, action.id), result);
});

test('context and knowledge actions never add skills, roles, facts or evidence', () => {
  const config = createRecipe('feasibility');
  config.practices = [];
  for (const topicId of ['context-selection', 'llm-wiki', 'retrieve-and-validate']) {
    const action = getPracticeAction(topicId, config);
    const result = applyPracticeAction(config, action.id);
    const expected = structuredClone(config);
    expected.practices.push(action.id.slice('practice:'.length));
    assert.deepEqual(result, expected);
  }
});

test('validated retrieval adds guidance without changing supplied facts or evidence and round trips through a pack', () => {
  const config = createExample('feature-delivery');
  config.facts.push({ id: 'supplied-fact', claim: 'The supplied source describes the current workflow.', status: 'inferred', source: 'Team supplied source', revision: 'revision-1', reviewer: '', notes: 'The applicability is unresolved.' });
  config.evidence.push({ id: 'unrun-check', stageId: '', check: 'Validate retrieved evidence', expected: 'Evidence supports the scoped claim', observed: '', status: 'not-run', method: 'user-recorded', source: 'Team supplied procedure', reviewer: '' });
  const before = structuredClone(config);
  const action = getPracticeAction('retrieve-and-validate', config);
  assert.equal(action.id, 'practice:validated-retrieval');
  assert.equal(action.alreadyApplied, false);
  const result = applyPracticeAction(config, action.id);
  assert.deepEqual(result, { ...before, practices: [...before.practices, 'validated-retrieval'] });
  assert.deepEqual(config, before);
  const pack = compile(result);
  const workflow = pack.files.find(file => file.path === 'WORKFLOW.md').content;
  const definition = CATALOG.practices.find(practice => practice.id === 'validated-retrieval');
  assert.ok(workflow.includes(definition.application));
  assert.match(workflow, /retriev/i);
  assert.match(workflow, /validat/i);
  for (const filename of ['WORKFLOW.md', 'SOURCES.md']) {
    const text = pack.files.find(file => file.path === filename).content;
    assert.ok(text.includes('Local adaptation version 2.1.0, reviewed 2026-10-05.'));
    assert.ok(text.includes('Local adaptation version 2.0.1, reviewed 2026-10-02.'));
  }
  const manifest = JSON.parse(pack.files.find(file => file.path === 'manifest.json').content);
  assert.equal(manifest.practices.find(practice => practice.id === 'validated-retrieval').reviewedOn, '2026-10-05');
  assert.equal(manifest.practices.find(practice => practice.id === 'portable-behavior').reviewedOn, '2026-10-02');
  const reopened = parseImport(pack.files.find(file => file.path === 'project.json').content);
  assert.deepEqual(reopened, result);
  assert.deepEqual(reopened.facts, before.facts);
  assert.deepEqual(reopened.evidence, before.evidence);
  assert.equal(getPracticeAction('retrieve-and-validate', reopened).alreadyApplied, true);
  assert.deepEqual(applyPracticeAction(reopened, action.id), reopened);
});

test('guidance keeps each definition revision and review scope when the catalogue grows', () => {
  const config = createExample('feasibility');
  config.practices.push('validated-retrieval');
  const snapshot = guidanceSnapshot(config);
  for (const [recordId, metadataId] of [
    ['recipe:feasibility', 'recipe:feasibility'],
    ['technology:generic', 'profile:generic'],
    ['runtime:before-write', 'control:before-write'],
    ['practice:validated-retrieval', 'practice:validated-retrieval'],
  ]) {
    const record = snapshot.records.find(item => item.id === recordId);
    const metadata = CATALOG.definitionMetadata[metadataId];
    assert.equal(record.version, record.definition.version || metadata.revision);
    assert.equal(record.reviewedOn, record.definition.reviewedOn || metadata.reviewedOn || snapshot.reviewedOn);
  }
  const skill = snapshot.records.find(record => record.id === 'skill:feasibility-analysis');
  assert.equal(skill.version, '2.0.2');
  assert.equal(snapshot.records.find(record => record.id === 'recipe:feasibility').version, '2.0.1');
});

test('guidance does not treat retained recipe settings as active stages', () => {
  const config = createExample('feature-delivery');
  config.practices.push('minimum-change', 'specification-first');
  config.workflowModel.processes = [];
  const snapshot = guidanceSnapshot(config);
  for (const id of ['practice:minimum-change', 'practice:specification-first']) {
    assert.match(snapshot.records.find(record => record.id === id).applicability, /^Selected reference\./);
  }
});

test('applicability follows actual enabled stages and runtime scope', () => {
  const study = createRecipe('feasibility');
  assert.equal(getPracticeAction('implementation-workflow', study), null);
  assert.equal(getPracticeAction('requirements-workflow', study), null);
  assert.ok(getPracticeAction('study-contract', study));
  const bugfix = createRecipe('bugfix');
  assert.ok(getPracticeAction('implementation-workflow', bugfix));
  assert.equal(getPracticeAction('requirements-workflow', bugfix), null);
  assert.equal(getPracticeAction('study-contract', bugfix), null);
  bugfix.runtime.enabled = true;
  assert.ok(getPracticeAction('study-contract', bugfix));
  const feature = createRecipe('feature-delivery');
  feature.workflow.enabledStages = feature.workflow.enabledStages.filter(id => id !== 'implementation');
  assert.equal(getPracticeAction('implementation-workflow', feature), null);
  assert.equal(getPracticeAction('requirements-workflow', feature), null);
  assert.throws(() => applyPracticeAction(study, 'practice:minimum-change'), /does not apply/);
  assert.throws(() => applyPracticeAction(bugfix, 'practice:specification-first'), /does not apply/);
  assert.throws(() => applyPracticeAction(feature, 'runtime:before-write'), /does not apply/);
});

test('runtime application records a requirement while preserving unresolved text and observations', () => {
  const config = createRecipe('feasibility');
  config.runtime.validation = 'Unresolved which backend operation owns the transaction.';
  config.constraints.notes = 'Ask the owner about country rules.';
  config.evidence.push({ id: 'draft', stageId: '', check: 'Validate proposed write', expected: 'Backend rejects forbidden change', observed: '', status: 'planned', method: 'user-recorded', source: '', reviewer: '' });
  const before = structuredClone(config);
  const action = getPracticeAction('study-contract', config);
  const result = applyPracticeAction(config, action.id);
  const expected = structuredClone(before);
  expected.runtime.enabled = true;
  expected.runtime.controls = [{ id: 'before-write', label: 'Validate permitted changes before writes', status: 'requirement', implementation: '', evidenceId: '' }];
  assert.deepEqual(result, expected);
  assert.deepEqual(config, before);
  assert.equal(result.evidence[0].observed, '');
  assert.equal(getPracticeAction('study-contract', result).alreadyApplied, true);
  assert.deepEqual(applyPracticeAction(result, action.id), result);
  assert.match(compile(result).files.find(file => file.path === 'RUNTIME-DESIGN.md').content, /Status: requirement/);
});

test('existing runtime control progress is never downgraded or relabeled', () => {
  const config = createExample('feasibility');
  const control = config.runtime.controls.find(control => control.id === 'before-write');
  control.label = 'Team supplied write boundary';
  control.status = 'evidence-recorded';
  control.implementation = 'api/operations/validate';
  control.evidenceId = 'supplied-result';
  config.runtime.enabled = false;
  const before = structuredClone(config);
  const result = applyPracticeAction(config, 'runtime:before-write');
  assert.deepEqual(result.runtime.controls, before.runtime.controls);
  assert.equal(result.runtime.enabled, true);
  assert.deepEqual(config, before);
});

test('unknown actions and malformed configuration are rejected without changes', () => {
  const config = createRecipe('feasibility');
  const before = structuredClone(config);
  for (const id of ['unknown', 'practice:inject-anything', 'runtime:execute', '__proto__']) assert.throws(() => applyPracticeAction(config, id), /supported/);
  assert.throws(() => applyPracticeAction({ workflow: { recipe: 'feasibility' } }, 'runtime:before-write'), /does not apply/);
  assert.deepEqual(config, before);
});
