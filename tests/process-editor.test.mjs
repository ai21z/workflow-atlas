import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipe, parseImport } from '../factory/core.mjs';
import { createBugfixWorkflowFixture } from '../factory/workflow-fixtures.mjs';
import { workflowModelShapeIssues, workflowModelIssues } from '../factory/workflow-model.mjs';
import { createProcessDraft, createProcessRecord, createProcessId, applyProcessEdit, describeProcessImpact, removeProcessRecord, removeProcessOutcome, ProcessEditError } from '../factory/process-editor.mjs';

const clone = value => structuredClone(value);
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.freeze(value);
    for (const member of Object.values(value)) freeze(member);
  }
  return value;
}
const starter = patternId => createProcessDraft({ id: 'my-process', name: 'My process', patternId });
const addStarter = patternId => applyProcessEdit(createRecipe(), 'my-process', starter(patternId)).config;

test('generic patterns work across process kinds without inventing actor, command, authority or correction budget', () => {
  for (const kind of ['development', 'application', 'manual']) for (const patternId of ['sequence', 'review-gate', 'bounded-correction']) {
    const draft = createProcessDraft({ id: 'custom-process', name: 'Our process', kind, patternId });
    const { config, issues } = applyProcessEdit(createRecipe(), draft.id, draft);
    assert.deepEqual(workflowModelShapeIssues(config.workflowModel), []);
    assert.equal(issues.some(issue => issue.blocking), false);
    assert.ok(issues.some(issue => issue.code === 'workflow-unresolved'));
    for (const step of draft.steps) {
      assert.equal(step.actor.name, '');
      assert.equal(step.actor.id, '');
      assert.deepEqual(step.capabilities, []);
      assert.deepEqual(step.instructionIds, []);
      assert.equal(step.action, '');
    }
    for (const correction of draft.corrections) assert.equal(correction.maxCorrections, null);
    for (const approval of draft.approvals) assert.equal(approval.authority, '');
    assert.deepEqual(parseImport(JSON.stringify(config)), config);
  }
});

test('starters reject unsupported choices and identifiers before creating records', () => {
  assert.throws(() => createProcessDraft({ id: 'unsafe id' }), ProcessEditError);
  assert.throws(() => createProcessDraft({ id: 'new', kind: 'deployed' }), /Choose development/);
  assert.throws(() => createProcessDraft({ id: 'new', patternId: 'unbounded' }), /supported process pattern/);
  assert.throws(() => createProcessRecord('permissions', 'new'), /supported process record/);
  assert.throws(() => createProcessRecord('steps', '__proto__'), /identifier/);
});

test('identifiers remain safe and unique even after a name is reused', () => {
  const records = [{ id: 'draft' }, { id: 'draft-2' }];
  assert.equal(createProcessId(records, 'Draft'), 'draft-3');
  assert.equal(createProcessId(records, '902 !_'), 'process');
  assert.equal(createProcessId(['check', 'check-2'], 'Check'), 'check-3');
  const id = createProcessId([], 'z'.repeat(100));
  assert.match(id, /^[a-z][a-z0-9-]{0,63}$/);
});

test('every record factory preserves the strict schema while decisions remain unresolved', () => {
  for (const collection of ['steps', 'results', 'checks', 'transitions', 'corrections', 'approvals', 'terminals']) {
    const draft = starter('bounded-correction');
    draft[collection].push(createProcessRecord(collection, 'new-record'));
    const config = createRecipe();
    config.workflowModel.processes.push(draft);
    assert.deepEqual(workflowModelShapeIssues(config.workflowModel), [], collection);
  }
  assert.equal(createProcessRecord('outcomes', 'ready'), 'ready');
});

test('applying is immutable and preserves unrelated project data', () => {
  const config = createRecipe();
  config.workflow.notes.requirements = 'Keep this existing note.';
  config.project.name = 'Existing project';
  config.evidence = [{ id: 'evidence', stageId: '', check: 'Manual check', expected: 'Expected', observed: 'Observation', status: 'failed', method: 'user-recorded', source: 'User source', reviewer: 'Reviewer' }];
  const before = clone(config);
  freeze(config);
  const draft = freeze(starter('sequence'));
  const { config: next } = applyProcessEdit(config, draft.id, draft);
  assert.deepEqual(config, before);
  assert.deepEqual(next.evidence, before.evidence);
  assert.deepEqual(next.workflow, before.workflow);
  assert.equal(next.project.name, 'Existing project');
  assert.notEqual(next.workflowModel.processes.at(-1), draft);
});

test('a rejected cycle keeps the accepted graph and allows the draft to be repaired', () => {
  const config = freeze(addStarter('sequence'));
  const before = clone(config);
  const draft = clone(config.workflowModel.processes.at(-1));
  draft.transitions.find(route => route.id === 'handoff-handed-off').to = { type: 'step', id: 'prepare' };
  assert.throws(() => applyProcessEdit(config, draft.id, draft), error => error instanceof ProcessEditError && error.issues.some(issue => issue.code === 'workflow-unsupported-cycle'));
  assert.deepEqual(config, before);
  draft.transitions.find(route => route.id === 'handoff-handed-off').to = { type: 'terminal', id: 'complete' };
  assert.deepEqual(applyProcessEdit(config, draft.id, draft).config, before);
});

test('transactions reject malformed values before cloning can normalize them', () => {
  const config = addStarter('bounded-correction');
  const draft = clone(config.workflowModel.processes.at(-1));
  draft.corrections[0].maxCorrections = Infinity;
  assert.throws(() => applyProcessEdit(config, draft.id, draft), error => error.issues.some(issue => issue.code === 'workflow-model-schema'));
  draft.corrections[0].maxCorrections = null;
  draft.unrecognizedField = 'Do not discard this silently';
  assert.throws(() => applyProcessEdit(config, draft.id, draft), error => error.issues.some(issue => issue.code === 'workflow-model-schema'));
});

test('review scope and unavailable check outcomes cannot turn into editing authority or success', () => {
  const config = addStarter('bounded-correction');
  const draft = clone(config.workflowModel.processes.at(-1));
  draft.steps.find(step => step.id === 'revise').actor.contextOnly = true;
  assert.throws(() => applyProcessEdit(config, draft.id, draft), error => error.issues.some(issue => issue.code === 'workflow-context-only-correction'));
  draft.steps.find(step => step.id === 'revise').actor.contextOnly = false;
  draft.transitions.find(route => route.id === 'review-unavailable').to.id = 'complete';
  assert.throws(() => applyProcessEdit(config, draft.id, draft), error => error.issues.some(issue => issue.code === 'workflow-check-bypass'));
});

test('recipe records and stable process identifiers cannot be overwritten by a custom edit', () => {
  const config = createRecipe();
  assert.throws(() => applyProcessEdit(config, 'development', { ...starter('sequence'), id: 'development' }), /recipe stages/);
  assert.throws(() => applyProcessEdit(config, 'different-id', starter('sequence')), /existing process identifier/);
  assert.throws(() => applyProcessEdit(config, 'missing', null), /no longer exists/);
});

test('impact preview identifies removed records, changed routes, instruction scope and evidence', () => {
  const config = createBugfixWorkflowFixture();
  const before = clone(config);
  const draft = clone(config.workflowModel.processes[0]);
  draft.steps.find(step => step.id === 'repair').instructionIds = ['review'];
  draft.steps.find(step => step.id === 'repair').inputIds = ['diagnosis'];
  draft.transitions.find(route => route.id === 'repair-ready').to = { type: 'unresolved', id: '' };
  draft.terminals = draft.terminals.filter(record => record.id !== 'cancelled');
  const impact = describeProcessImpact(config, draft.id, draft);
  assert.ok(impact.removed.some(record => record.collection === 'terminals' && record.id === 'cancelled'));
  assert.ok(impact.routes.some(record => record.id === 'repair-ready'));
  assert.ok(impact.inputRelations.some(record => record.stepId === 'repair'));
  assert.deepEqual(impact.instructionIds, ['implementation', 'review']);
  assert.equal(impact.evidenceLinks[0].id, 'historical-regression-link');
  assert.deepEqual(config, before);
});

test('referenced record removal requires an explicit replacement and never cascades deletion', () => {
  const draft = freeze(starter('sequence'));
  assert.throws(() => removeProcessRecord(draft, 'steps', 'prepare'), error => error.impacts.references.includes('entryStepId') && error.impacts.references.includes('results.candidate.producerStepId'));
  assert.throws(() => removeProcessRecord(draft, 'results', 'candidate'), error => error.impacts.references.includes('steps.handoff.inputIds'));
  assert.throws(() => removeProcessRecord(draft, 'terminals', 'complete'), error => error.impacts.references.includes('transitions.handoff-handed-off.to'));
  const added = clone(draft);
  added.terminals.push({ id: 'other-complete', name: 'Other completion', status: 'completed' });
  const { draft: next } = removeProcessRecord(added, 'terminals', 'complete', { replacementId: 'other-complete' });
  assert.equal(next.transitions.find(route => route.id === 'handoff-handed-off').to.id, 'other-complete');
  assert.equal(next.transitions.length, added.transitions.length);
  assert.equal(next.results.length, added.results.length);
  assert.equal(added.terminals.length, next.terminals.length + 1);
  assert.equal(applyProcessEdit(createRecipe(), next.id, next).issues.some(issue => issue.blocking), false);
});

test('a replacement that creates conflicting meaning is rejected at atomic apply', () => {
  const config = addStarter('sequence');
  const draft = config.workflowModel.processes.at(-1);
  const { draft: next } = removeProcessRecord(draft, 'steps', 'prepare', { replacementId: 'handoff' });
  assert.equal(next.results.length, draft.results.length);
  assert.equal(next.transitions.length, draft.transitions.length);
  assert.throws(() => applyProcessEdit(config, draft.id, next), error => error.issues.some(issue => issue.blocking));
});

test('outcome removal retains connected routes for explicit replacement and does not silently merge branches', () => {
  const draft = starter('bounded-correction');
  assert.throws(() => removeProcessOutcome(draft, 'review', 'changes-requested'), error => error.impacts.routeIds.includes('review-changes-requested') && error.impacts.correctionIds.includes('result-correction'));
  const { draft: next } = removeProcessOutcome(draft, 'review', 'changes-requested', { replacementOutcome: 'passed' });
  assert.deepEqual(next.checks[0].outcomes, next.steps.find(step => step.id === 'review').outcomes);
  assert.equal(next.transitions.length, draft.transitions.length);
  assert.equal(next.corrections[0].outcome, 'passed');
  assert.throws(() => applyProcessEdit(createRecipe(), next.id, next), error => error.issues.some(issue => issue.code === 'workflow-ambiguous-route'));
});

test('deleting a process keeps observed evidence and rejects dangling associations', () => {
  const config = freeze(createBugfixWorkflowFixture());
  const before = clone(config);
  assert.throws(() => applyProcessEdit(config, 'bug-repair', null), error => error.impacts.evidenceLinks[0].id === 'historical-regression-link' && error.issues.some(issue => issue.code === 'workflow-dangling-reference'));
  assert.deepEqual(config, before);
  const unlinked = addStarter('sequence');
  const { config: next } = applyProcessEdit(unlinked, 'my-process', null);
  assert.equal(next.workflowModel.processes.some(process => process.id === 'my-process'), false);
  assert.deepEqual(next.evidence, unlinked.evidence);
});

test('changing a candidate revision preserves earlier evidence without asserting it is current', () => {
  const config = createBugfixWorkflowFixture();
  const draft = clone(config.workflowModel.processes[0]);
  draft.results.find(result => result.id === 'candidate').version = '3';
  const { config: next, issues } = applyProcessEdit(config, draft.id, draft);
  assert.deepEqual(next.evidence, config.evidence);
  assert.deepEqual(next.workflowModel.evidenceLinks, config.workflowModel.evidenceLinks);
  assert.ok(issues.some(issue => issue.code === 'workflow-stale-evidence'));
  assert.equal(next.workflowModel.evidenceLinks[0].candidateVersion, '1');
});

test('an explicit evidence reassignment preserves observations and validates the new candidate relationship', () => {
  const config = createBugfixWorkflowFixture();
  const draft = clone(config.workflowModel.processes[0]);
  draft.checks[0].id = 'new-regression-check';
  assert.throws(() => applyProcessEdit(config, draft.id, draft), error => error.issues.some(issue => issue.code === 'workflow-dangling-reference'));
  const update = { ...config.workflowModel.evidenceLinks[0], checkId: 'new-regression-check' };
  const { config: next } = applyProcessEdit(config, draft.id, draft, { evidenceLinkUpdates: [update] });
  assert.deepEqual(next.evidence, config.evidence);
  assert.equal(next.workflowModel.evidenceLinks[0].checkId, 'new-regression-check');
  assert.equal(next.workflowModel.evidenceLinks[0].candidateVersion, '1');
  assert.throws(() => applyProcessEdit(config, draft.id, draft, { evidenceLinkUpdates: [update, update] }), /once/);
  assert.throws(() => applyProcessEdit(config, draft.id, draft, { evidenceLinkUpdates: [{ ...update, id: 'invented-link' }] }), /existing evidence association/);
  assert.equal(workflowModelIssues(next).some(issue => issue.blocking), false);
});
