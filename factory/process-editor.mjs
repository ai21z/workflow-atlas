import { WORKFLOW_PATTERN_VERSION, WORKFLOW_PATTERNS, workflowModelShapeIssues, workflowModelIssues } from './workflow-model.mjs';

const clone = value => structuredClone(value);
const collections = ['steps', 'results', 'checks', 'transitions', 'corrections', 'approvals', 'terminals'];
const safeId = /^[a-z][a-z0-9-]{0,63}$/;
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const blankActor = () => ({ type: 'human', id: '', name: '', contextOnly: false });

export class ProcessEditError extends Error {
  constructor(message, issues = [], impacts = null) {
    super(message);
    this.name = 'ProcessEditError';
    this.issues = issues;
    this.impacts = impacts;
  }
}

function requireId(id) {
  if (typeof id !== 'string' || !safeId.test(id)) throw new ProcessEditError('Choose an identifier starting with a lowercase letter, using lowercase letters, numbers or hyphens, at most 64 characters.');
}

/** Stable identifiers are assigned once. Names can change independently. */
export function createProcessId(records, base = 'process') {
  const stem = String(base).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '').replace(/^[^a-z]+/, '').slice(0, 58) || 'process';
  const used = new Set(records.map(record => typeof record === 'string' ? record : record.id));
  if (!used.has(stem)) return stem;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${stem}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
}

/** New records keep decisions empty. They become meaningful through explicit editing. */
export function createProcessRecord(collection, id) {
  requireId(id);
  switch (collection) {
    case 'steps': return { id, name: '', action: '', actor: blankActor(), capabilities: [], inputIds: [], outputIds: [], instructionIds: [], outcomes: [] };
    case 'results': return { id, name: '', description: '', producerStepId: '', suppliedSource: '', expectedStructure: '', versionPolicy: '', version: '' };
    case 'checks': return { id, stepId: '', candidateId: '', criteria: [], evidenceResultId: '', outcomes: [], method: 'human', revisionPolicy: 'recheck-after-change' };
    case 'transitions': return { id, fromStepId: '', outcome: '', to: { type: 'unresolved', id: '' } };
    case 'corrections': return { id, decisionStepId: '', outcome: '', correctionStepId: '', checkStepId: '', candidateId: '', feedbackResultId: '', maxCorrections: null, exhaustedTerminalId: '' };
    case 'approvals': return { id, stepId: '', authority: '', candidateId: '', evidenceResultIds: [], revisionPolicy: 'reapprove-after-change' };
    case 'terminals': return { id, name: '', status: 'unresolved' };
    case 'outcomes': return id;
    default: throw new ProcessEditError('Choose a supported process record type.');
  }
}

const namedStep = (id, name, action, inputIds, outputIds, outcomes) => ({ ...createProcessRecord('steps', id), name, action, inputIds, outputIds, outcomes });
const namedResult = (id, name, producerStepId) => ({ ...createProcessRecord('results', id), name, producerStepId });
const route = (fromStepId, outcome, type, id) => ({ id: `${fromStepId}-${outcome}`, fromStepId, outcome, to: { type, id } });
const terminal = (id, name, status) => ({ id, name, status });

/** Generic editable designs, not observed work or application integrations. */
export function createProcessDraft({ id, name = '', kind = 'manual', patternId = 'sequence' } = {}) {
  requireId(id);
  if (!['development', 'application', 'manual'].includes(kind)) throw new ProcessEditError('Choose development, application or manual work.');
  if (!WORKFLOW_PATTERNS.includes(patternId)) throw new ProcessEditError('Choose a supported process pattern.');
  const draft = {
    id, source: 'custom', kind, name, purpose: '', pattern: { id: patternId, version: WORKFLOW_PATTERN_VERSION }, entryStepId: 'prepare',
    steps: [namedStep('prepare', 'Prepare the result', '', [], ['candidate'], ['ready', 'missing-information'])],
    results: [namedResult('candidate', 'Result to prepare', 'prepare')], checks: [], transitions: [], corrections: [], approvals: [],
    terminals: [terminal('complete', 'Work complete', 'completed'), terminal('missing-information', 'More information needed', 'needs-information')],
  };
  if (patternId === 'sequence') {
    draft.steps.push(namedStep('handoff', 'Hand over the result', '', ['candidate'], [], ['handed-off', 'blocked']));
    draft.terminals.push(terminal('stopped', 'Stop with findings', 'stopped'));
    draft.transitions.push(route('prepare', 'ready', 'step', 'handoff'), route('handoff', 'handed-off', 'terminal', 'complete'), route('handoff', 'blocked', 'terminal', 'stopped'));
  } else {
    const outcomes = patternId === 'review-gate' ? ['accepted', 'changes-requested', 'declined', 'unavailable'] : ['passed', 'changes-requested', 'unavailable'];
    draft.steps.push(namedStep('review', 'Check the result', '', ['candidate'], ['findings'], outcomes));
    draft.results.push(namedResult('findings', 'Check findings', 'review'));
    draft.checks.push({ ...createProcessRecord('checks', 'result-check'), stepId: 'review', candidateId: 'candidate', evidenceResultId: 'findings', outcomes: [...outcomes] });
    draft.terminals.push(terminal('stopped', 'Stop with findings', 'stopped'));
    draft.transitions.push(route('prepare', 'ready', 'step', 'review'), route('review', outcomes[0], 'terminal', 'complete'), route('review', 'unavailable', 'terminal', 'stopped'));
    if (patternId === 'review-gate') {
      draft.approvals.push({ ...createProcessRecord('approvals', 'result-approval'), stepId: 'review', candidateId: 'candidate', evidenceResultIds: ['findings'] });
      draft.transitions.push(route('review', 'changes-requested', 'terminal', 'missing-information'), route('review', 'declined', 'terminal', 'stopped'));
    } else {
      draft.steps.push(namedStep('revise', 'Revise using the findings', '', ['candidate', 'findings'], ['candidate'], ['revised', 'blocked']));
      draft.terminals.push(terminal('exhausted', 'Correction limit reached', 'stopped'));
      draft.transitions.push(route('review', 'changes-requested', 'step', 'revise'), route('revise', 'revised', 'step', 'review'), route('revise', 'blocked', 'terminal', 'stopped'));
      draft.corrections.push({ ...createProcessRecord('corrections', 'result-correction'), decisionStepId: 'review', outcome: 'changes-requested', correctionStepId: 'revise', checkStepId: 'review', candidateId: 'candidate', feedbackResultId: 'findings', exhaustedTerminalId: 'exhausted' });
    }
  }
  draft.transitions.push(route('prepare', 'missing-information', 'terminal', 'missing-information'));
  return draft;
}

function delta(before = [], after = []) {
  const left = new Map(before.map(record => [record.id, record]));
  const right = new Map(after.map(record => [record.id, record]));
  return [...new Set([...left.keys(), ...right.keys()])].flatMap(id => equal(left.get(id), right.get(id)) ? [] : [{ id, before: left.get(id) ? clone(left.get(id)) : null, after: right.get(id) ? clone(right.get(id)) : null }]);
}

/** Impact is a review of proposed changes. It never alters evidence or claims invalidity. */
export function describeProcessImpact(config, processId, draft) {
  const before = config.workflowModel.processes.find(process => process.id === processId) || null;
  const records = collections.flatMap(collection => delta(before?.[collection], draft?.[collection]).map(change => ({ collection, ...change })));
  const changedSteps = records.filter(record => record.collection === 'steps');
  const inputRelations = changedSteps.filter(record => !equal(record.before?.inputIds || [], record.after?.inputIds || []) || !equal(record.before?.outputIds || [], record.after?.outputIds || [])).map(record => ({ stepId: record.id, beforeInputs: record.before?.inputIds || [], afterInputs: record.after?.inputIds || [], beforeOutputs: record.before?.outputIds || [], afterOutputs: record.after?.outputIds || [] }));
  const changedResultIds = new Set(records.filter(record => record.collection === 'results').map(record => record.id));
  const changedRouteSteps = new Set(records.filter(record => record.collection === 'transitions').flatMap(record => [record.before?.fromStepId, record.after?.fromStepId]).filter(Boolean));
  const changedDecisionSteps = new Set(records.filter(record => ['checks', 'approvals', 'corrections'].includes(record.collection)).flatMap(record => [record.before, record.after].filter(Boolean).flatMap(value => [value.stepId, value.decisionStepId, value.correctionStepId, value.checkStepId])).filter(Boolean));
  const affectedStepIds = new Set(changedSteps.map(record => record.id));
  for (const step of [...(before?.steps || []), ...(draft?.steps || [])]) if (changedRouteSteps.has(step.id) || changedDecisionSteps.has(step.id) || [...step.inputIds, ...step.outputIds].some(id => changedResultIds.has(id))) affectedStepIds.add(step.id);
  const instructionIds = [...new Set([...(before?.steps || []), ...(draft?.steps || [])].filter(step => affectedStepIds.has(step.id)).flatMap(step => step.instructionIds))];
  return {
    processId, operation: before ? (draft ? 'update' : 'remove') : 'add', changed: !equal(before, draft),
    added: records.filter(record => !record.before), removed: records.filter(record => !record.after), changedRecords: records.filter(record => record.before && record.after),
    inputRelations, resultSources: records.filter(record => record.collection === 'results' && (record.before?.producerStepId !== record.after?.producerStepId || record.before?.suppliedSource !== record.after?.suppliedSource)), routes: records.filter(record => record.collection === 'transitions'), instructionIds, affectedStepIds: [...affectedStepIds],
    evidenceLinks: !equal(before, draft) ? clone(config.workflowModel.evidenceLinks.filter(link => link.processId === processId)) : [],
  };
}

/** Apply all references together. Callers keep rejected drafts visible for correction. */
export function applyProcessEdit(config, processId, draft, { evidenceLinkUpdates = [] } = {}) {
  const priorShape = workflowModelShapeIssues(config?.workflowModel);
  if (priorShape.length) throw new ProcessEditError('The current workflow model cannot be edited safely.', priorShape);
  requireId(processId);
  const before = config.workflowModel.processes.find(process => process.id === processId);
  if (!before && draft === null) throw new ProcessEditError('This process no longer exists.');
  if (draft !== null && (draft?.id !== processId || draft?.source !== 'custom')) throw new ProcessEditError('Keep the existing process identifier and edit a custom process.');
  if (before?.source === 'recipe' && draft !== null) throw new ProcessEditError('Edit recipe stages through their existing controls. Add a custom process for explicit connections.');
  const next = clone(config);
  const index = next.workflowModel.processes.findIndex(process => process.id === processId);
  if (draft === null) next.workflowModel.processes.splice(index, 1);
  else if (index < 0) next.workflowModel.processes.push(clone(draft));
  else next.workflowModel.processes[index] = clone(draft);
  const proposedShape = workflowModelShapeIssues(next.workflowModel);
  if (proposedShape.length) throw new ProcessEditError('Resolve the record format problems before applying. The current project was kept.', proposedShape);
  const impacts = describeProcessImpact(config, processId, draft);
  const updated = new Set();
  for (const update of evidenceLinkUpdates) {
    if (!update || typeof update !== 'object' || Array.isArray(update)) throw new ProcessEditError('Supply a complete evidence association for an explicit reassignment.', [], impacts);
    const linkIndex = next.workflowModel.evidenceLinks.findIndex(link => link.id === update.id);
    if (linkIndex < 0 || updated.has(update.id)) throw new ProcessEditError('Choose an existing evidence association once for each explicit reassignment.', [], impacts);
    updated.add(update.id);
    next.workflowModel.evidenceLinks[linkIndex] = clone(update);
  }
  const issues = workflowModelIssues(next);
  if (issues.some(issue => issue.blocking)) throw new ProcessEditError('Resolve the connection problems before applying. The current project was kept.', issues, impacts);
  return { config: next, issues, impacts };
}

// Paths are kept explicit so removal cannot invent a new semantic relationship.
function recordReferences(draft, collection, id) {
  const refs = [];
  const scalar = (object, field, path, replacementType = collection) => { if (object[field] === id) refs.push({ object, field, path, type: 'scalar', replacementType }); };
  const list = (object, field, path) => { if (object[field].includes(id)) refs.push({ object, field, path, type: 'list', replacementType: collection }); };
  if (collection === 'steps') {
    scalar(draft, 'entryStepId', 'entryStepId');
    draft.results.forEach(record => scalar(record, 'producerStepId', `results.${record.id}.producerStepId`));
    draft.checks.forEach(record => scalar(record, 'stepId', `checks.${record.id}.stepId`));
    draft.transitions.forEach(record => {
      scalar(record, 'fromStepId', `transitions.${record.id}.fromStepId`);
      if (record.to.type === 'step') scalar(record.to, 'id', `transitions.${record.id}.to`);
    });
    draft.corrections.forEach(record => ['decisionStepId', 'correctionStepId', 'checkStepId'].forEach(field => scalar(record, field, `corrections.${record.id}.${field}`)));
    draft.approvals.forEach(record => scalar(record, 'stepId', `approvals.${record.id}.stepId`));
  } else if (collection === 'results') {
    draft.steps.forEach(record => ['inputIds', 'outputIds'].forEach(field => list(record, field, `steps.${record.id}.${field}`)));
    draft.checks.forEach(record => ['candidateId', 'evidenceResultId'].forEach(field => scalar(record, field, `checks.${record.id}.${field}`)));
    draft.corrections.forEach(record => ['candidateId', 'feedbackResultId'].forEach(field => scalar(record, field, `corrections.${record.id}.${field}`)));
    draft.approvals.forEach(record => { scalar(record, 'candidateId', `approvals.${record.id}.candidateId`); list(record, 'evidenceResultIds', `approvals.${record.id}.evidenceResultIds`); });
  } else if (collection === 'terminals') {
    draft.transitions.forEach(record => { if (record.to.type === 'terminal') scalar(record.to, 'id', `transitions.${record.id}.to`); });
    draft.corrections.forEach(record => scalar(record, 'exhaustedTerminalId', `corrections.${record.id}.exhaustedTerminalId`));
  }
  return refs;
}

/** References require a named replacement. Nothing else is removed as a side effect. */
export function removeProcessRecord(draft, collection, id, { replacementId = '' } = {}) {
  if (!collections.includes(collection)) throw new ProcessEditError('Choose a supported process record type.');
  const next = clone(draft);
  const index = next[collection].findIndex(record => record.id === id);
  if (index < 0) throw new ProcessEditError('This record no longer exists.');
  const references = recordReferences(next, collection, id);
  const impacts = { collection, id, references: references.map(({ path }) => path), replacementId, removed: clone(next[collection][index]) };
  if (replacementId && (replacementId === id || !next[collection].some(record => record.id === replacementId))) throw new ProcessEditError('Choose a different existing record of the same type as the replacement.', [], impacts);
  if (references.length && !replacementId) throw new ProcessEditError('This record is still referenced. Choose a replacement or keep the record.', [], impacts);
  for (const reference of references) {
    if (reference.type === 'list') reference.object[reference.field] = [...new Set(reference.object[reference.field].map(value => value === id ? replacementId : value))];
    else reference.object[reference.field] = replacementId;
  }
  next[collection].splice(index, 1);
  return { draft: next, impacts };
}

export function removeProcessOutcome(draft, stepId, outcome, { replacementOutcome = '' } = {}) {
  const next = clone(draft);
  const step = next.steps.find(record => record.id === stepId);
  if (!step || !step.outcomes.includes(outcome)) throw new ProcessEditError('This step outcome no longer exists.');
  if (replacementOutcome && (replacementOutcome === outcome || !step.outcomes.includes(replacementOutcome))) throw new ProcessEditError('Choose a different declared outcome from this step.');
  const routes = next.transitions.filter(record => record.fromStepId === stepId && record.outcome === outcome);
  const corrections = next.corrections.filter(record => record.decisionStepId === stepId && record.outcome === outcome);
  const impacts = { stepId, outcome, routeIds: routes.map(record => record.id), correctionIds: corrections.map(record => record.id), replacementOutcome };
  if ((routes.length || corrections.length) && !replacementOutcome) throw new ProcessEditError('This outcome has connections. Choose a replacement or keep it.', [], impacts);
  for (const record of [...routes, ...corrections]) record.outcome = replacementOutcome;
  step.outcomes = step.outcomes.filter(value => value !== outcome);
  for (const check of next.checks.filter(record => record.stepId === stepId)) check.outcomes = [...step.outcomes];
  return { draft: next, impacts };
}
