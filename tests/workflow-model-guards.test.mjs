import test from 'node:test';
import assert from 'node:assert/strict';
import { createBackendWorkflowFixture, createBugfixWorkflowFixture } from '../factory/workflow-fixtures.mjs';
import { parseImport } from '../factory/core.mjs';
import { workflowModelIssues, workflowModelShapeIssues, resolveWorkflowProcesses, WORKFLOW_MODEL_LIMITS } from '../factory/workflow-model.mjs';

const application = project => project.workflowModel.processes.find(process => process.kind === 'application');
const errors = project => workflowModelIssues(project).filter(issue => issue.blocking);

test('workflow text rejects hidden control characters while preserving ordinary multiline text', () => {
  for (const character of ['\u0000', '\u0007', '\u000b', '\u001b', '\u007f']) {
    const project = createBackendWorkflowFixture();
    application(project).steps[0].action += character;
    assert.ok(workflowModelShapeIssues(project.workflowModel).some(issue => /Control characters/.test(issue.message)));
    assert.throws(() => parseImport(JSON.stringify(project)));
  }
  const project = createBackendWorkflowFixture();
  application(project).steps[0].action = 'First line.\r\nSecond line.\tIndented detail.';
  assert.deepEqual(workflowModelShapeIssues(project.workflowModel), []);
});

test('unclassified context-only capabilities remain unresolved instead of acquiring a safety claim', () => {
  const project = createBugfixWorkflowFixture();
  const reviewer = project.workflowModel.processes[0].steps.find(step => step.id === 'review');
  reviewer.capabilities.push('custom-operation');
  assert.deepEqual(errors(project), []);
  assert.ok(workflowModelIssues(project).some(issue => issue.code === 'workflow-unresolved' && issue.path.endsWith('capabilities')));
  assert.equal(parseImport(JSON.stringify(project)).workflowModel.processes[0].steps.find(step => step.id === 'review').capabilities.includes('custom-operation'), true);
  reviewer.capabilities = ['read', 'publish'];
  assert.ok(errors(project).some(issue => issue.code === 'workflow-context-only'));
});

test('a recipe context-only assignment does not become the producer of implementation or execution results', () => {
  const project = createBackendWorkflowFixture();
  project.workflow.recipe = 'feature-delivery';
  project.workflow.enabledStages = ['implementation', 'verification'];
  project.workflow.bindings.implementation = { actorType: 'agent', actorId: 'reviewer', actorName: '', skills: [], contextOnly: true };
  project.workflow.bindings.verification = { actorType: 'agent', actorId: 'reviewer', actorName: '', skills: [], contextOnly: true };
  project.workflow.suppliedInputs.implementation = 'Supplied change for review';
  const before = structuredClone(project);
  const process = resolveWorkflowProcesses(project).find(item => item.source === 'recipe');
  for (const id of ['implementation', 'verification']) {
    const step = process.steps.find(item => item.id === id);
    assert.deepEqual(step.outputIds, []);
    assert.ok(step.inputIds.includes(`${id}-output`));
    assert.equal(step.capabilities.includes('edit') || step.capabilities.includes('execute'), false);
    assert.match(step.action, /Another actor must perform/);
    assert.equal(process.results.find(result => result.id === `${id}-output`).producerStepId, '');
  }
  assert.equal(process.results.find(result => result.id === 'implementation-output').suppliedSource, 'Supplied change for review');
  assert.equal(process.results.find(result => result.id === 'verification-output').suppliedSource, '');
  assert.deepEqual(project, before);
});

function addEarlierCandidateCheck(project) {
  const process = application(project);
  const step = structuredClone(process.steps.find(item => item.id === 'check'));
  step.id = 'initial-check';
  step.name = 'Earlier candidate check';
  step.outputIds = ['initial-findings'];
  step.outcomes = ['passed', 'unavailable'];
  process.steps.push(step);
  const result = structuredClone(process.results.find(item => item.id === 'findings'));
  result.id = 'initial-findings';
  result.producerStepId = step.id;
  process.results.push(result);
  const check = structuredClone(process.checks[0]);
  check.id = 'earlier-check';
  check.stepId = step.id;
  check.evidenceResultId = result.id;
  check.outcomes = [...step.outcomes];
  process.checks.push(check);
  process.steps.find(item => item.id === 'check').inputIds.push(result.id);
  process.transitions.find(route => route.fromStepId === 'generate' && route.outcome === 'ready').to.id = step.id;
  process.transitions.push(
    { id: 'initial-check-pass', fromStepId: step.id, outcome: 'passed', to: { type: 'step', id: 'check' } },
    { id: 'initial-check-unavailable', fromStepId: step.id, outcome: 'unavailable', to: { type: 'terminal', id: 'blocked' } },
  );
  return process;
}

test('a corrected candidate cannot reuse another earlier check as if it applied to the new revision', () => {
  const project = createBackendWorkflowFixture();
  const process = addEarlierCandidateCheck(project);
  assert.ok(errors(project).some(issue => issue.code === 'workflow-correction-stale-check'));
  assert.throws(() => parseImport(JSON.stringify(project)));
  process.transitions.find(route => route.fromStepId === 'correct' && route.outcome === 'corrected').to.id = 'initial-check';
  assert.deepEqual(errors(project), []);
  assert.doesNotThrow(() => parseImport(JSON.stringify(project)));
});

test('recorded evidence applicability is compared per revision without rewriting supplied records', () => {
  const project = createBugfixWorkflowFixture();
  const historical = structuredClone(project.evidence[0]);
  historical.id = 'current-regression';
  historical.status = 'passed';
  historical.check = 'Fictional regression assessment for candidate revision 2';
  historical.observed = 'Synthetic fixture observation for version 2. This is not an Atlas test run.';
  project.evidence.push(historical);
  project.workflowModel.evidenceLinks.push({ ...project.workflowModel.evidenceLinks[0], id: 'current-regression-link', evidenceId: historical.id, candidateVersion: '2' });
  const before = structuredClone(project);
  assert.deepEqual(workflowModelIssues(project).filter(issue => issue.code === 'workflow-stale-evidence').map(issue => issue.path), ['workflowModel.evidenceLinks[0]']);
  project.workflowModel.processes[0].results.find(result => result.id === 'candidate').version = '3';
  assert.equal(workflowModelIssues(project).filter(issue => issue.code === 'workflow-stale-evidence').length, 2);
  assert.deepEqual(project.evidence, before.evidence);
  assert.deepEqual(project.workflowModel.evidenceLinks, before.workflowModel.evidenceLinks);
});

test('record ordering does not change the declared control graph', () => {
  const project = createBackendWorkflowFixture();
  const process = application(project);
  const before = errors(project);
  for (const field of ['steps', 'results', 'checks', 'transitions', 'corrections', 'approvals', 'terminals']) process[field].reverse();
  assert.deepEqual(errors(project), before);
  assert.doesNotThrow(() => parseImport(JSON.stringify(project)));
});

test('bounded validation handles the maximum number of processes, steps and result dependencies', () => {
  const project = createBackendWorkflowFixture();
  const steps = [];
  const results = [];
  const transitions = [];
  for (let index = 0; index < WORKFLOW_MODEL_LIMITS.steps; index += 1) {
    const id = `step-${index}`;
    const outputIds = [`result-${index}-a`, `result-${index}-b`];
    steps.push({ id, name: id, action: 'Produce the planned records from the supplied earlier records.', actor: { type: 'human', id: '', name: 'Planned owner', contextOnly: false }, capabilities: [], inputIds: results.map(result => result.id), outputIds, instructionIds: [], outcomes: ['ready'] });
    for (const resultId of outputIds) results.push({ id: resultId, name: resultId, description: 'Planned output.', producerStepId: id, suppliedSource: '', expectedStructure: 'Reviewable record.', versionPolicy: 'Record an explicit revision for each change.', version: '' });
    transitions.push({ id: `route-${index}`, fromStepId: id, outcome: 'ready', to: index === WORKFLOW_MODEL_LIMITS.steps - 1 ? { type: 'terminal', id: 'complete' } : { type: 'step', id: `step-${index + 1}` } });
  }
  const process = { id: 'large-process', source: 'custom', kind: 'manual', name: 'Bounded planned process', purpose: 'Exercise validation at its stated record limits.', pattern: { id: 'sequence', version: '1.0' }, entryStepId: 'step-0', steps, results, checks: [], transitions, corrections: [], approvals: [], terminals: [{ id: 'complete', name: 'Planned handoff', status: 'completed' }] };
  project.workflowModel = { version: '1.0', processes: Array.from({ length: WORKFLOW_MODEL_LIMITS.processes }, (_, index) => ({ ...structuredClone(process), id: `large-process-${index}` })), evidenceLinks: [] };
  assert.deepEqual(workflowModelIssues(project), []);
  project.workflowModel.processes[0].steps.push(structuredClone(steps[0]));
  assert.ok(workflowModelShapeIssues(project.workflowModel).some(issue => issue.path.endsWith('steps') && issue.blocking));
});
