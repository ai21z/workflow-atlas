import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, parseImport, serializeProject, validate, getEffectiveSkills, getStages } from '../factory/core.mjs';
import { CORRECTION_SEMANTICS, resolveWorkflowProcesses, workflowModelShapeIssues, workflowModelIssues } from '../factory/workflow-model.mjs';
import { createBackendWorkflowFixture, createBugfixWorkflowFixture, createDocumentWorkflowFixture } from '../factory/workflow-fixtures.mjs';

const fixtures = [createBackendWorkflowFixture, createBugfixWorkflowFixture, createDocumentWorkflowFixture];
const custom = config => config.workflowModel.processes.find(process => process.source === 'custom');
const blocking = config => workflowModelIssues(config).filter(issue => issue.blocking);
const edge = (process, step, outcome) => process.transitions.find(route => route.fromStepId === step && route.outcome === outcome);
const file = (pack, path) => pack.files.find(item => item.path === path)?.content;

for (const create of fixtures) test(`${create.name} describes a fictional process whose records survive export and reopening`, () => {
  const project = create();
  assert.match(project.project.purpose, /Fictional design fixture/);
  assert.deepEqual(workflowModelShapeIssues(project.workflowModel), []);
  assert.deepEqual(blocking(project), []);
  const reopened = parseImport(serializeProject(project));
  assert.deepEqual(reopened, project);
  const pack = compile(project);
  assert.deepEqual(parseImport(file(pack, 'project.json')), project);
  assert.match(file(pack, 'VALIDATION.md'), /Task behavior observed by Atlas: no/);
  assert.equal(pack.validation.hostExercised, false);
  for (const process of resolveWorkflowProcesses(project).filter(item => item.source === 'custom')) {
    for (const step of process.steps) for (const outcome of step.outcomes) {
      const routes = process.transitions.filter(route => route.fromStepId === step.id && route.outcome === outcome);
      assert.equal(routes.length, 1, `${process.id}:${step.id}:${outcome} needs exactly one recorded destination`);
      const destination = routes[0].to;
      if (destination.type === 'step') assert.ok(process.steps.some(item => item.id === destination.id));
      else if (destination.type === 'terminal') assert.ok(process.terminals.some(item => item.id === destination.id));
      else assert.equal(destination.id, '');
    }
  }
});

test('backend approval is optional and uncertain delivery goes to reconciliation without another write', () => {
  const withApproval = custom(createBackendWorkflowFixture());
  const withoutApprovalProject = createBackendWorkflowFixture({ approvalRequired: false });
  const withoutApproval = custom(withoutApprovalProject);
  assert.equal(edge(withApproval, 'check', 'passed').to.id, 'approve');
  assert.equal(edge(withoutApproval, 'check', 'passed').to.id, 'deliver');
  assert.equal(withoutApproval.approvals.length, 0);
  assert.equal(withoutApproval.steps.some(step => step.id === 'approve'), false);
  assert.deepEqual(blocking(withoutApprovalProject), []);
  assert.deepEqual(edge(withApproval, 'deliver', 'uncertain-write').to, { type: 'step', id: 'reconcile' });
  assert.ok(withApproval.transitions.filter(route => route.fromStepId === 'reconcile').every(route => route.to.type !== 'step'));
  assert.equal(withApproval.corrections.some(policy => policy.correctionStepId === 'deliver' || policy.decisionStepId === 'reconcile'), false);
});

test('manual document process has no active software recipe or tool prerequisites', () => {
  const project = createDocumentWorkflowFixture();
  assert.deepEqual(project.components, []);
  assert.deepEqual(project.agents, []);
  assert.deepEqual(getStages(project), []);
  assert.deepEqual(getEffectiveSkills(project), []);
  assert.equal(project.runtime.enabled, false);
  assert.ok(custom(project).steps.every(step => step.actor.type === 'human' && step.capabilities.length === 0));
  const codes = validate(project).issues.map(issue => issue.code);
  assert.equal(codes.includes('missing-command'), false);
  assert.equal(codes.includes('missing-component'), false);
  const pack = compile(project);
  assert.equal(pack.files.some(item => item.path.startsWith('.github/agents/')), false);
});

test('historical failed evidence does not qualify the changed bug repair', () => {
  const project = createBugfixWorkflowFixture();
  const before = structuredClone(project);
  const issues = workflowModelIssues(project);
  assert.ok(issues.some(issue => issue.code === 'workflow-stale-evidence' && !issue.blocking));
  assert.ok(issues.some(issue => issue.code === 'workflow-evidence-not-passing'));
  assert.deepEqual(project, before);
  assert.equal(project.evidence[0].status, 'failed');
  project.workflowModel.evidenceLinks[0].candidateVersion = '2';
  assert.equal(workflowModelIssues(project).some(issue => issue.code === 'workflow-stale-evidence'), false);
  assert.ok(workflowModelIssues(project).some(issue => issue.code === 'workflow-evidence-not-passing'));
  project.workflowModel.evidenceLinks[0].candidateVersion = '';
  assert.ok(workflowModelIssues(project).some(issue => issue.code === 'workflow-unresolved' && issue.path.endsWith('candidateVersion')));
});

test('missing correction limits remain an exportable draft and zero is preserved without a default', () => {
  const project = createDocumentWorkflowFixture();
  custom(project).corrections[0].maxCorrections = null;
  assert.deepEqual(blocking(project), []);
  assert.ok(workflowModelIssues(project).some(issue => issue.path.endsWith('maxCorrections') && issue.code === 'workflow-unresolved'));
  assert.equal(parseImport(serializeProject(project)).workflowModel.processes[0].corrections[0].maxCorrections, null);
  assert.equal(compile(project).validation.configurationComplete, false);
  custom(project).corrections[0].maxCorrections = 0;
  assert.deepEqual(blocking(project), []);
  assert.equal(parseImport(serializeProject(project)).workflowModel.processes[0].corrections[0].maxCorrections, 0);
  assert.match(CORRECTION_SEMANTICS.count, /including an unsuccessful attempt/);
  assert.match(CORRECTION_SEMANTICS.reset, /only for a new run/);
  assert.match(CORRECTION_SEMANTICS.execution, /does not execute or enforce/);
});

test('process projections cannot become a competing authoring copy', () => {
  const project = createBackendWorkflowFixture();
  const before = structuredClone(project);
  const views = resolveWorkflowProcesses(project);
  const recipe = views.find(process => process.source === 'recipe');
  assert.deepEqual(recipe.transitions, []);
  assert.deepEqual(recipe.checks, []);
  assert.ok(recipe.inputDependencies.length > 0);
  const app = views.find(process => process.source === 'custom');
  app.steps[0].name = 'Disposable edit';
  app.results[0].consumerStepIds.length = 0;
  assert.deepEqual(project, before);
});

const invalidCases = [
  ['dangling input', 'workflow-dangling-reference', flow => { flow.steps[0].inputIds.push('missing-result'); }],
  ['dangling destination', 'workflow-dangling-reference', flow => { edge(flow, 'generate', 'ready').to.id = 'missing-step'; }],
  ['duplicate record', 'workflow-duplicate-id', flow => { flow.results.push(structuredClone(flow.results[0])); }],
  ['undeclared outcome', 'workflow-undeclared-outcome', flow => { edge(flow, 'generate', 'ready').outcome = 'undeclared'; }],
  ['ambiguous destination', 'workflow-ambiguous-route', flow => { flow.transitions.push({ ...structuredClone(edge(flow, 'generate', 'ready')), id: 'duplicate-ready-route', to: { type: 'terminal', id: 'blocked' } }); }],
  ['wrong producer', 'workflow-result-producer', flow => { flow.results.find(result => result.id === 'candidate').producerStepId = 'deliver'; }],
  ['competing supplied source', 'workflow-result-source', flow => { flow.results.find(result => result.id === 'candidate').suppliedSource = 'Another candidate'; }],
  ['undeclared cycle', 'workflow-unsupported-cycle', flow => { edge(flow, 'generate', 'ready').to.id = 'generate'; }],
  ['correction without findings', 'workflow-correction-feedback', flow => { flow.steps.find(step => step.id === 'correct').inputIds = ['candidate']; }],
  ['correction count bypass', 'workflow-correction-entry', flow => { edge(flow, 'generate', 'ready').to.id = 'correct'; }],
  ['correction skips recheck', 'workflow-correction-bypass', flow => { edge(flow, 'correct', 'corrected').to.id = 'approve'; }],
  ['approval bypass', 'workflow-approval-bypass', flow => { edge(flow, 'check', 'passed').to.id = 'deliver'; }],
  ['declined approval retries', 'workflow-approval-declined', flow => { edge(flow, 'approve', 'declined').to = { type: 'step', id: 'correct' }; }],
  ['completed exhaustion', 'workflow-correction-exhaustion', flow => { flow.corrections[0].exhaustedTerminalId = 'complete'; }],
  ['context reviewer performs correction', 'workflow-context-only-correction', flow => { flow.steps.find(step => step.id === 'correct').actor.contextOnly = true; }],
  ['context reviewer gains execution', 'workflow-context-only', flow => { const step = flow.steps.find(step => step.id === 'check'); step.actor.contextOnly = true; step.capabilities = ['execute']; }],
];

for (const [name, expectedCode, mutate] of invalidCases) test(`unsafe design is rejected: ${name}`, () => {
  const project = createBackendWorkflowFixture();
  mutate(custom(project));
  assert.ok(blocking(project).some(issue => issue.code === expectedCode), JSON.stringify(workflowModelIssues(project)));
  assert.throws(() => serializeProject(project));
  assert.throws(() => parseImport(JSON.stringify(project)));
});

for (const outcome of ['unavailable', 'blocked', 'missing-information', 'unknown', 'repairable']) test(`${outcome} cannot silently continue to approval and completion`, () => {
  const project = createBackendWorkflowFixture();
  edge(custom(project), 'check', outcome).to = { type: 'step', id: 'approve' };
  assert.ok(blocking(project).some(issue => issue.code === 'workflow-check-bypass'), JSON.stringify(workflowModelIssues(project)));
  assert.throws(() => serializeProject(project));
});

test('a consumer cannot require evidence whose producer it bypassed', () => {
  const project = createBugfixWorkflowFixture();
  edge(custom(project), 'repair', 'ready').to.id = 'review';
  assert.ok(blocking(project).some(issue => issue.code === 'workflow-input-order'), JSON.stringify(workflowModelIssues(project)));
});

test('unrecognized fields, future versions and invalid limits fail rather than being dropped', () => {
  for (const mutate of [
    project => { project.workflowModel.version = '99.0'; },
    project => { custom(project).steps[0].unexpected = 'preserve me'; },
    project => { custom(project).corrections[0].maxCorrections = -1; },
    project => { custom(project).corrections[0].maxCorrections = 1.5; },
  ]) {
    const project = createDocumentWorkflowFixture();
    mutate(project);
    const before = structuredClone(project);
    assert.ok(workflowModelShapeIssues(project.workflowModel).some(issue => issue.blocking));
    assert.throws(() => parseImport(JSON.stringify(project)));
    assert.deepEqual(project, before);
  }
});
