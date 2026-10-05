import { createRecipe } from './core.mjs';

// Fictional design fixtures. They do not run a workflow or record a real trial.
const actor = (type, name, id = '', contextOnly = false) => ({ type, id, name, contextOnly });
const human = name => actor('human', name);
const external = name => actor('external', name);
const role = (id, contextOnly = false) => actor('agent', '', id, contextOnly);
const step = (id, name, action, assignedActor, inputIds, outputIds, outcomes, instructionIds = [], capabilities = []) => ({ id, name, action, actor: assignedActor, capabilities, inputIds, outputIds, instructionIds, outcomes });
const result = (id, name, description, producerStepId, suppliedSource, expectedStructure, version = '') => ({ id, name, description, producerStepId, suppliedSource, expectedStructure, versionPolicy: 'Record a new identifier when the content changes. Keep earlier evidence linked to its original identifier.', version });
const route = (fromStepId, outcome, id, type = 'step') => ({ id: `${fromStepId}-${outcome}`, fromStepId, outcome, to: { type, id } });
const end = (fromStepId, outcome, id) => route(fromStepId, outcome, id, 'terminal');
const unresolved = fromStepId => route(fromStepId, 'unknown', '', 'unresolved');
const terminal = (id, name, status) => ({ id, name, status });
const commonTerminals = () => [
  terminal('complete', 'Handed off through the recorded process', 'completed'),
  terminal('blocked', 'Stop with findings', 'stopped'),
  terminal('missing-information', 'Ask for the missing information', 'needs-information'),
  terminal('exhausted', 'Stop after the correction limit', 'stopped'),
  terminal('declined', 'Approval declined', 'stopped'),
  terminal('cancelled', 'Cancelled with the current findings', 'cancelled'),
];
const check = (id, stepId, candidateId, criteria, evidenceResultId, outcomes, method) => ({ id, stepId, candidateId, criteria, evidenceResultId, outcomes, method, revisionPolicy: 'recheck-after-change' });
const correction = (id, decisionStepId, outcome, correctionStepId, checkStepId, candidateId, feedbackResultId) => ({ id, decisionStepId, outcome, correctionStepId, checkStepId, candidateId, feedbackResultId, maxCorrections: 2, exhaustedTerminalId: 'exhausted' });
const approval = (id, stepId, authority, candidateId, evidenceResultIds) => ({ id, stepId, authority, candidateId, evidenceResultIds, revisionPolicy: 'reapprove-after-change' });
const process = (id, kind, name, purpose, entryStepId) => ({ id, source: 'custom', kind, name, purpose, pattern: { id: 'bounded-correction', version: '1.0' }, entryStepId, steps: [], results: [], checks: [], transitions: [], corrections: [], approvals: [], terminals: commonTerminals() });

function fixtureProject(recipe, name, purpose) {
  const config = createRecipe(recipe);
  config.project.name = name;
  config.project.purpose = `Fictional design fixture. ${purpose} No steps have been executed by this fixture.`;
  config.project.sourceLocations = 'Fictional fixture data. Replace these example decisions with actual project sources.';
  config.constraints.notes = 'Example choices for reviewing the model. Confirm owners, criteria and implementation before adopting them. The limit of two corrections is an example, not an Atlas default.';
  return config;
}

export function createBackendWorkflowFixture({ approvalRequired = true } = {}) {
  const config = fixtureProject('feasibility', 'Backend configuration workflow', 'Study a service that turns supplied references into a checked configuration and a confirmed delivery result.');
  config.constraints.approvalRequired = approvalRequired;
  const app = process('configuration-service', 'application', 'Create a checked configuration', 'Generate a candidate, check it, correct repairable failures and confirm delivery. A possible write followed by a timeout goes to reconciliation.', 'generate');
  const generationActor = external('Proposed agent service, implementation not configured');
  const checkOutcomes = ['passed', 'repairable', 'missing-information', 'unavailable', 'blocked', 'cancelled', 'unknown'];
  app.steps = [
    step('generate', 'Generate candidate', 'Interpret the supplied request within the agreed rules. Ask for missing inputs instead of inventing them.', generationActor, ['request'], ['candidate'], ['ready', 'missing-information', 'blocked', 'cancelled', 'unknown']),
    step('check', 'Check candidate', 'Check structure and agreed business criteria against this candidate version. An unavailable check is not a pass.', external('Proposed validator, implementation not configured'), ['request', 'candidate'], ['findings'], checkOutcomes),
    step('correct', 'Correct candidate', 'Use the current candidate and findings to make one correction attempt. Entering this step consumes one attempt, including an unsuccessful attempt.', generationActor, ['candidate', 'findings'], ['candidate'], ['corrected', 'blocked', 'cancelled', 'unknown']),
    ...(approvalRequired ? [step('approve', 'Review for delivery', 'A named decision authority reviews the checked candidate. Changes requested remain a separate handoff and do not trigger an automatic retry.', human('Example configuration owner'), ['candidate', 'findings'], ['approval-decision'], ['accepted', 'changes-requested', 'declined', 'cancelled', 'unknown'])] : []),
    step('deliver', 'Deliver the checked candidate', 'Request delivery through the permitted backend operation. Use the backend confirmation as evidence of the outcome. Do not retry a write whose outcome is uncertain.', external('Existing delivery API, actual contract unresolved'), ['candidate', 'findings', ...(approvalRequired ? ['approval-decision'] : [])], ['delivery-attempt'], ['confirmed', 'uncertain-write', 'blocked', 'cancelled', 'unknown']),
    step('reconcile', 'Confirm an uncertain write', 'Look up the original operation through the agreed recovery procedure. Confirm its outcome or hand it to an owner. This step must not repeat the write.', external('Recovery procedure, actual implementation unresolved'), ['delivery-attempt'], ['reconciliation'], ['confirmed', 'unconfirmed', 'unavailable', 'cancelled', 'unknown']),
  ];
  app.results = [
    result('request', 'Supplied references and rules', 'Fictional request definition. The actual reference format and business rules remain to be agreed.', '', 'Example request supplied by the caller', 'Request identifier, references, requested configuration type and applicable rules'),
    result('candidate', 'Candidate configuration', 'Expected output of generation or correction. Defining it does not mean a candidate was created.', 'generate', '', 'Configuration content with an explicit revision identifier', '1'),
    result('findings', 'Validation findings', 'Expected findings for the exact candidate revision, including unavailable or unrun checks.', 'check', '', 'Candidate revision, criteria, outcomes, findings and skipped checks'),
    ...(approvalRequired ? [result('approval-decision', 'Delivery decision', 'Expected decision from the named authority for the checked candidate version.', 'approve', '', 'Authority, candidate revision, reviewed evidence and decision')] : []),
    result('delivery-attempt', 'Delivery attempt record', 'Expected record of the original operation. An attempt without confirmation is not completed delivery.', 'deliver', '', 'Operation identifier, candidate revision and confirmed or uncertain outcome'),
    result('reconciliation', 'Reconciliation record', 'Expected evidence about the original delivery attempt. It does not represent a second write.', 'reconcile', '', 'Original operation identifier, confirmation source and remaining uncertainty'),
  ];
  app.checks = [check('candidate-validation', 'check', 'candidate', ['The candidate satisfies the agreed structure.', 'Referenced entities and intended changes satisfy the supplied business rules.', 'Each reported result identifies the candidate revision and its evidence.'], 'findings', checkOutcomes, 'code')];
  app.transitions = [
    route('generate', 'ready', 'check'), end('generate', 'missing-information', 'missing-information'), end('generate', 'blocked', 'blocked'), end('generate', 'cancelled', 'cancelled'), unresolved('generate'),
    route('check', 'passed', approvalRequired ? 'approve' : 'deliver'), route('check', 'repairable', 'correct'), end('check', 'missing-information', 'missing-information'), end('check', 'unavailable', 'blocked'), end('check', 'blocked', 'blocked'), end('check', 'cancelled', 'cancelled'), unresolved('check'),
    route('correct', 'corrected', 'check'), end('correct', 'blocked', 'blocked'), end('correct', 'cancelled', 'cancelled'), unresolved('correct'),
    ...(approvalRequired ? [route('approve', 'accepted', 'deliver'), end('approve', 'changes-requested', 'missing-information'), end('approve', 'declined', 'declined'), end('approve', 'cancelled', 'cancelled'), unresolved('approve')] : []),
    end('deliver', 'confirmed', 'complete'), route('deliver', 'uncertain-write', 'reconcile'), end('deliver', 'blocked', 'blocked'), end('deliver', 'cancelled', 'cancelled'), unresolved('deliver'),
    end('reconcile', 'confirmed', 'complete'), end('reconcile', 'unconfirmed', 'blocked'), end('reconcile', 'unavailable', 'blocked'), end('reconcile', 'cancelled', 'cancelled'), unresolved('reconcile'),
  ];
  app.corrections = [correction('candidate-correction', 'check', 'repairable', 'correct', 'check', 'candidate', 'findings')];
  app.approvals = approvalRequired ? [approval('delivery-approval', 'approve', 'Example configuration owner. Confirm actual authority before implementation.', 'candidate', ['findings'])] : [];
  if (!approvalRequired) app.terminals = app.terminals.filter(item => item.id !== 'declined');
  config.workflowModel = { version: '1.0', processes: [{ id: 'development', source: 'recipe', kind: 'development' }, app], evidenceLinks: [] };
  config.workflow.notes['experiment-plan'] = 'Plan cases for the configuration-service process: passing candidate, repairable failure, two exhausted corrections, missing input, unavailable check, changed revision, and uncertain delivery requiring reconciliation. Expected results are not observed results.';
  config.runtime.enabled = true;
  config.runtime.outcome = app.purpose;
  return config;
}

export function createBugfixWorkflowFixture() {
  const config = fixtureProject('bugfix', 'Bug repair with a bounded review loop', 'Repair a fictional saved search defect. Preserve old failed regression evidence while the changed candidate awaits new checks.');
  const flow = process('bug-repair', 'development', 'Investigate and repair a defect', 'Reproduce the defect, investigate its cause, repair it, recheck each changed revision and hand off for the normal release process.', 'reproduce');
  const regressionOutcomes = ['passed', 'repairable', 'missing-information', 'unavailable', 'blocked', 'unknown'];
  flow.steps = [
    step('reproduce', 'Record the reproduction', 'Use the supplied reproduction and environment. Preserve expected and actual behavior without inventing a cause.', human('Example developer'), ['bug-report'], ['reproduction'], ['reproduced', 'missing-information', 'blocked', 'cancelled', 'unknown'], ['bug-diagnosis']),
    step('diagnose', 'Investigate the cause', 'Inspect the relevant code and reproduction. Separate a proposed explanation from an established cause.', role('analyst'), ['reproduction'], ['diagnosis'], ['ready', 'blocked', 'unknown'], ['bug-diagnosis'], ['read', 'search']),
    step('repair', 'Prepare the initial repair', 'Make the scoped repair and preserve the reproduction case. Record the changed candidate revision.', role('implementer'), ['reproduction', 'diagnosis'], ['candidate'], ['ready', 'blocked', 'unknown'], ['implementation'], ['read', 'edit']),
    step('regression', 'Check the repaired revision', 'Use the actual supplied test procedure against the current candidate. A missing command or unavailable check remains unresolved.', external('Existing test process, command not supplied'), ['candidate', 'reproduction', 'test-procedure'], ['regression-findings'], regressionOutcomes),
    step('correct', 'Correct the failed repair', 'Use failed findings for this candidate to make one scoped correction. Recheck the new version.', role('implementer'), ['candidate', 'regression-findings'], ['candidate'], ['corrected', 'blocked', 'unknown'], ['implementation'], ['read', 'edit']),
    step('review', 'Review supplied context', 'Review only the supplied repair and verification findings. Do not execute tests, modify the repair or claim to verify unseen behavior.', role('reviewer', true), ['candidate', 'regression-findings'], ['review-findings'], ['ready', 'concerns', 'unknown'], [], ['read']),
    step('approve', 'Decide the handoff', 'The named release owner reviews the candidate and supplied findings. Acceptance authorizes the planned handoff, not deployment.', human('Example release owner'), ['candidate', 'regression-findings', 'review-findings'], ['approval-decision'], ['accepted', 'changes-requested', 'declined', 'unknown']),
    step('handoff', 'Prepare the release handoff', 'Pass the checked repair, reproduction and recorded review to the normal release owner. This process does not deploy the change.', human('Example developer'), ['candidate', 'regression-findings', 'review-findings', 'approval-decision'], ['release-handoff'], ['handed-off', 'blocked', 'unknown']),
  ];
  flow.results = [
    result('bug-report', 'Bug report', 'Fictional saved search loses its optional filter after reopening.', '', 'Fictional bug report supplied for this fixture', 'Expected behavior, observed behavior, reproduction input and affected environment', '1'),
    result('reproduction', 'Reproduction record', 'Expected record of the failing case. It is not a claim that a real defect was reproduced.', 'reproduce', '', 'Input, environment, revision, expected behavior and observed behavior'),
    result('diagnosis', 'Cause analysis', 'Expected explanation with supporting evidence and remaining alternatives.', 'diagnose', '', 'Cause, supporting sources, affected scope and open questions'),
    result('candidate', 'Proposed repair', 'Fictional current revision 2. The supplied failed findings concern revision 1 and do not establish this revision.', 'repair', '', 'Change reference, revision identifier and regression case', '2'),
    result('test-procedure', 'Actual regression procedure', 'The actual command, directory and environment are not supplied. Keep the check unresolved until a project owner provides them.', '', '', 'Actual command or manual procedure, directory and environment'),
    result('regression-findings', 'Regression findings', 'Expected evidence for the checked revision. Earlier failed evidence remains historical.', 'regression', '', 'Candidate revision, actual procedure, observed outcomes and unrun checks'),
    result('review-findings', 'Context review findings', 'Expected review of the supplied evidence, without test execution or code changes.', 'review', '', 'Candidate revision, supplied evidence, scope concerns and missing information'),
    result('approval-decision', 'Release handoff decision', 'Expected decision by the named authority for this checked repair.', 'approve', '', 'Authority, candidate revision, reviewed evidence and decision'),
    result('release-handoff', 'Release handoff', 'Expected handoff record. It does not claim a merge, release or production deployment.', 'handoff', '', 'Candidate revision, evidence references, owner and remaining release requirements'),
  ];
  flow.checks = [check('regression-check', 'regression', 'candidate', ['The original failing case has the expected behavior.', 'Relevant neighboring behavior remains acceptable.', 'The procedure, candidate revision and actual observations are recorded.'], 'regression-findings', regressionOutcomes, 'code')];
  flow.transitions = [
    route('reproduce', 'reproduced', 'diagnose'), end('reproduce', 'missing-information', 'missing-information'), end('reproduce', 'blocked', 'blocked'), end('reproduce', 'cancelled', 'cancelled'), unresolved('reproduce'),
    route('diagnose', 'ready', 'repair'), end('diagnose', 'blocked', 'blocked'), unresolved('diagnose'),
    route('repair', 'ready', 'regression'), end('repair', 'blocked', 'blocked'), unresolved('repair'),
    route('regression', 'passed', 'review'), route('regression', 'repairable', 'correct'), end('regression', 'missing-information', 'missing-information'), end('regression', 'unavailable', 'blocked'), end('regression', 'blocked', 'blocked'), unresolved('regression'),
    route('correct', 'corrected', 'regression'), end('correct', 'blocked', 'blocked'), unresolved('correct'),
    route('review', 'ready', 'approve'), end('review', 'concerns', 'missing-information'), unresolved('review'),
    route('approve', 'accepted', 'handoff'), end('approve', 'changes-requested', 'missing-information'), end('approve', 'declined', 'declined'), unresolved('approve'),
    end('handoff', 'handed-off', 'complete'), end('handoff', 'blocked', 'blocked'), unresolved('handoff'),
  ];
  flow.corrections = [correction('regression-correction', 'regression', 'repairable', 'correct', 'regression', 'candidate', 'regression-findings')];
  flow.approvals = [approval('release-handoff-approval', 'approve', 'Example release owner. Actual organizational authority remains to be confirmed.', 'candidate', ['regression-findings', 'review-findings'])];
  config.workflowModel = {
    version: '1.0', processes: [flow],
    evidenceLinks: [{ id: 'historical-regression-link', evidenceId: 'historical-regression', processId: 'bug-repair', checkId: 'regression-check', resultId: 'candidate', candidateVersion: '1' }],
  };
  config.evidence = [{ id: 'historical-regression', stageId: 'regression', check: 'Fictional regression assessment for candidate revision 1', expected: 'The saved search retains its optional filter after reopening.', observed: 'Synthetic fixture observation: candidate revision 1 still loses the optional filter. This is fictional evidence, not a test performed by Atlas.', status: 'failed', method: 'user-recorded', source: 'Fictional fixture record for candidate revision 1', reviewer: 'Fictional reviewer' }];
  return config;
}

export function createDocumentWorkflowFixture() {
  const config = fixtureProject('feasibility', 'Document drafting and review', 'Draft a short explanation from a supplied brief, review it, revise when requested and hand off the accepted version.');
  config.components = [];
  config.agents = [];
  config.skills = [];
  config.practices = [];
  const flow = process('document-review', 'manual', 'Draft, review and hand off a document', 'A person drafts the document and a named owner reviews it against the brief. Revisions return for review. Handoff does not publish the document.', 'draft');
  const reviewOutcomes = ['accepted', 'changes-requested', 'declined', 'unavailable', 'cancelled', 'unknown'];
  flow.steps = [
    step('draft', 'Write the first draft', 'Use the supplied brief to write the document. Ask the brief owner for missing information.', human('Example author'), ['brief'], ['document'], ['ready', 'missing-information', 'cancelled', 'unknown']),
    step('review', 'Review the current draft', 'The named document owner checks this version against the brief and records a decision with findings. Earlier approval does not apply to a revised draft.', human('Example document owner'), ['brief', 'document'], ['review-findings'], reviewOutcomes),
    step('revise', 'Revise the draft', 'Use the current draft and requested changes to make one revision. Each entry consumes one correction attempt. Return the changed draft to the document owner.', human('Example author'), ['document', 'review-findings'], ['document'], ['revised', 'blocked', 'cancelled', 'unknown']),
    step('handoff', 'Hand off the accepted version', 'Give the accepted document and decision record to the intended recipient. Do not publish or distribute it elsewhere.', human('Example author'), ['document', 'review-findings'], ['handoff-record'], ['handed-off', 'blocked', 'cancelled', 'unknown']),
  ];
  flow.results = [
    result('brief', 'Supplied brief', 'Fictional brief: explain the proposed service in one page for a project manager, with open decisions visible.', '', 'Fictional brief supplied by the document owner', 'Audience, intended result, required points and acceptance criteria', '1'),
    result('document', 'Document draft', 'Expected draft or revision. No repository path or publishing system is required.', 'draft', '', 'Document content with a revision identifier', '1'),
    result('review-findings', 'Review decision and findings', 'Expected decision for the specific draft version, with requested changes or reasons for declining.', 'review', '', 'Draft revision, brief criteria, authority, decision and findings'),
    result('handoff-record', 'Document handoff', 'Expected record of giving the accepted version to its intended recipient. It is not a publication claim.', 'handoff', '', 'Accepted draft revision, recipient and review decision'),
  ];
  flow.checks = [check('document-check', 'review', 'document', ['The document addresses the audience and intended result in the supplied brief.', 'The required points are present and unsupported statements remain explicit questions.', 'The decision names the exact reviewed revision.'], 'review-findings', reviewOutcomes, 'human')];
  flow.transitions = [
    route('draft', 'ready', 'review'), end('draft', 'missing-information', 'missing-information'), end('draft', 'cancelled', 'cancelled'), unresolved('draft'),
    route('review', 'accepted', 'handoff'), route('review', 'changes-requested', 'revise'), end('review', 'declined', 'declined'), end('review', 'unavailable', 'blocked'), end('review', 'cancelled', 'cancelled'), unresolved('review'),
    route('revise', 'revised', 'review'), end('revise', 'blocked', 'blocked'), end('revise', 'cancelled', 'cancelled'), unresolved('revise'),
    end('handoff', 'handed-off', 'complete'), end('handoff', 'blocked', 'blocked'), end('handoff', 'cancelled', 'cancelled'), unresolved('handoff'),
  ];
  flow.corrections = [correction('document-correction', 'review', 'changes-requested', 'revise', 'review', 'document', 'review-findings')];
  flow.approvals = [approval('document-approval', 'review', 'Example document owner, responsible for accepting the brief.', 'document', ['review-findings'])];
  config.workflowModel = { version: '1.0', processes: [flow], evidenceLinks: [] };
  return config;
}
