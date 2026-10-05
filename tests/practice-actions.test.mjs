import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipe, createExample, compile, parseImport } from '../factory/core.mjs';
import { PRACTICE_TOPIC_IDS, getPracticeAction, applyPracticeAction } from '../factory/practice-actions.mjs';

test('the Knowledge bridge exposes only five curated topic actions with primary references', () => {
  assert.equal(PRACTICE_TOPIC_IDS.length, 5);
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
  for (const topicId of ['context-selection', 'llm-wiki']) {
    const action = getPracticeAction(topicId, config);
    const result = applyPracticeAction(config, action.id);
    const expected = structuredClone(config);
    expected.practices.push(action.id.slice('practice:'.length));
    assert.deepEqual(result, expected);
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
