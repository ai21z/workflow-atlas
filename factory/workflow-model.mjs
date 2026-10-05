import { CATALOG } from './catalog.mjs';

export const WORKFLOW_MODEL_VERSION = '1.0';
export const WORKFLOW_PATTERN_VERSION = '1.0';
export const WORKFLOW_PATTERNS = Object.freeze(['sequence', 'review-gate', 'bounded-correction']);
export const WORKFLOW_NON_PASSING_OUTCOMES = Object.freeze(['unknown', 'unavailable', 'unrun', 'not-run', 'missing-evidence', 'missing-information', 'blocked', 'failed', 'declined', 'cancelled', 'repairable', 'changes-requested']);
export const WORKFLOW_MODEL_LIMITS = Object.freeze({ processes: 8, steps: 64, results: 128, checks: 64, transitions: 256, corrections: 32, approvals: 32, terminals: 64, evidenceLinks: 128, references: 128, text: 20000 });
export const CORRECTION_SEMANTICS = Object.freeze({
  count: 'Count entry into each correction attempt after the initial candidate, including an unsuccessful attempt.',
  reset: 'Reset the correction count only for a new run, never by revisiting a step.',
  exhausted: 'When the configured maximum is reached, take the recorded exhausted terminal instead of starting another correction.',
  revision: 'A correction revises the named logical candidate. Check the revised candidate again and obtain any required approval again.',
  unknown: 'A missing limit, unavailable check or missing evidence is unresolved. None establishes a successful outcome.',
  execution: 'These are design requirements. Atlas does not execute or enforce the process.',
});

const clone = value => JSON.parse(JSON.stringify(value));
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const present = value => typeof value === 'string' && value.trim().length > 0;
const safeId = /^[a-z][a-z0-9-]{0,63}$/;
const customKeys = ['id', 'source', 'kind', 'name', 'purpose', 'pattern', 'entryStepId', 'steps', 'results', 'checks', 'transitions', 'corrections', 'approvals', 'terminals'];
const processKinds = ['development', 'application', 'manual'];
const terminalStatuses = ['completed', 'stopped', 'needs-information', 'cancelled', 'unresolved'];
const dangerousCapabilities = new Set(['edit', 'write', 'execute', 'delete', 'publish', 'deploy', 'agent']);
const contextReviewCapabilities = new Set(['read', 'search', 'review']);
const instructionIds = new Set(CATALOG.skills.map(skill => skill.id));

export function createWorkflowModel() {
  return { version: WORKFLOW_MODEL_VERSION, processes: [{ id: 'development', source: 'recipe', kind: 'development' }], evidenceLinks: [] };
}

/** Structural checks are deliberately separate from incomplete design findings. */
export function workflowModelShapeIssues(model) {
  const issues = [];
  const issue = (path, message) => issues.push({ severity: 'error', code: 'workflow-model-schema', path, message, blocking: true });
  const object = (value, path, keys) => {
    if (!plain(value)) { issue(path, 'Expected an object.'); return false; }
    for (const key of Object.keys(value)) if (!keys.includes(key)) issue(`${path}.${key}`, 'Unknown workflow model field. This version cannot preserve it.');
    for (const key of keys) if (!Object.hasOwn(value, key)) issue(`${path}.${key}`, 'Required workflow model field is missing.');
    return true;
  };
  const string = (value, path, limit = WORKFLOW_MODEL_LIMITS.text) => {
    if (typeof value !== 'string') issue(path, 'Expected text.');
    else if (value.length > limit) issue(path, `Text exceeds the ${limit} character limit.`);
    else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) issue(path, 'Control characters are not supported.');
  };
  const id = (value, path, optional = false) => {
    if (!(optional && value === '') && (typeof value !== 'string' || !safeId.test(value))) issue(path, 'Use a stable identifier starting with a lowercase letter, followed by lowercase letters, numbers or hyphens, at most 64 characters.');
  };
  const oneOf = (value, path, choices) => { if (!choices.includes(value)) issue(path, `Expected one of: ${choices.join(', ')}.`); };
  const array = (value, path, limit) => {
    if (!Array.isArray(value)) { issue(path, 'Expected a list.'); return false; }
    if (value.length > limit) { issue(path, `At most ${limit} entries are supported.`); return false; }
    return true;
  };
  const list = (value, path, validate = id, limit = WORKFLOW_MODEL_LIMITS.references) => {
    if (array(value, path, limit)) value.forEach((entry, index) => validate(entry, `${path}[${index}]`));
  };
  const records = (value, path, limit, check) => {
    if (array(value, path, limit)) value.forEach((entry, index) => check(entry, `${path}[${index}]`));
  };
  if (!object(model, 'workflowModel', ['version', 'processes', 'evidenceLinks'])) return issues;
  oneOf(model.version, 'workflowModel.version', [WORKFLOW_MODEL_VERSION]);
  records(model.processes, 'workflowModel.processes', WORKFLOW_MODEL_LIMITS.processes, (process, path) => {
    if (!plain(process)) { issue(path, 'Expected a process object.'); return; }
    if (process.source === 'recipe') {
      if (object(process, path, ['id', 'source', 'kind'])) {
        id(process.id, `${path}.id`);
        oneOf(process.kind, `${path}.kind`, ['development']);
      }
      return;
    }
    if (!object(process, path, customKeys)) return;
    id(process.id, `${path}.id`);
    oneOf(process.source, `${path}.source`, ['custom']);
    oneOf(process.kind, `${path}.kind`, processKinds);
    string(process.name, `${path}.name`, 200);
    string(process.purpose, `${path}.purpose`);
    id(process.entryStepId, `${path}.entryStepId`, true);
    if (object(process.pattern, `${path}.pattern`, ['id', 'version'])) {
      oneOf(process.pattern.id, `${path}.pattern.id`, WORKFLOW_PATTERNS);
      oneOf(process.pattern.version, `${path}.pattern.version`, [WORKFLOW_PATTERN_VERSION]);
    }
    records(process.steps, `${path}.steps`, WORKFLOW_MODEL_LIMITS.steps, (step, at) => {
      if (!object(step, at, ['id', 'name', 'action', 'actor', 'capabilities', 'inputIds', 'outputIds', 'instructionIds', 'outcomes'])) return;
      id(step.id, `${at}.id`);
      string(step.name, `${at}.name`, 200);
      string(step.action, `${at}.action`);
      if (object(step.actor, `${at}.actor`, ['type', 'id', 'name', 'contextOnly'])) {
        oneOf(step.actor.type, `${at}.actor.type`, ['human', 'agent', 'external']);
        id(step.actor.id, `${at}.actor.id`, true);
        string(step.actor.name, `${at}.actor.name`, 200);
        if (typeof step.actor.contextOnly !== 'boolean') issue(`${at}.actor.contextOnly`, 'Expected true or false.');
      }
      for (const field of ['capabilities', 'inputIds', 'outputIds', 'instructionIds', 'outcomes']) list(step[field], `${at}.${field}`);
    });
    records(process.results, `${path}.results`, WORKFLOW_MODEL_LIMITS.results, (result, at) => {
      if (!object(result, at, ['id', 'name', 'description', 'producerStepId', 'suppliedSource', 'expectedStructure', 'versionPolicy', 'version'])) return;
      id(result.id, `${at}.id`);
      id(result.producerStepId, `${at}.producerStepId`, true);
      string(result.name, `${at}.name`, 200);
      string(result.version, `${at}.version`, 200);
      for (const field of ['description', 'suppliedSource', 'expectedStructure', 'versionPolicy']) string(result[field], `${at}.${field}`);
    });
    records(process.checks, `${path}.checks`, WORKFLOW_MODEL_LIMITS.checks, (check, at) => {
      if (!object(check, at, ['id', 'stepId', 'candidateId', 'criteria', 'evidenceResultId', 'outcomes', 'method', 'revisionPolicy'])) return;
      id(check.id, `${at}.id`);
      for (const field of ['stepId', 'candidateId', 'evidenceResultId']) id(check[field], `${at}.${field}`, true);
      list(check.criteria, `${at}.criteria`, string, 64);
      list(check.outcomes, `${at}.outcomes`);
      oneOf(check.method, `${at}.method`, ['human', 'code', 'model']);
      oneOf(check.revisionPolicy, `${at}.revisionPolicy`, ['recheck-after-change']);
    });
    records(process.transitions, `${path}.transitions`, WORKFLOW_MODEL_LIMITS.transitions, (transition, at) => {
      if (!object(transition, at, ['id', 'fromStepId', 'outcome', 'to'])) return;
      id(transition.id, `${at}.id`);
      id(transition.fromStepId, `${at}.fromStepId`, true);
      id(transition.outcome, `${at}.outcome`, true);
      if (object(transition.to, `${at}.to`, ['type', 'id'])) {
        oneOf(transition.to.type, `${at}.to.type`, ['step', 'terminal', 'unresolved']);
        id(transition.to.id, `${at}.to.id`, true);
      }
    });
    records(process.corrections, `${path}.corrections`, WORKFLOW_MODEL_LIMITS.corrections, (correction, at) => {
      if (!object(correction, at, ['id', 'decisionStepId', 'outcome', 'correctionStepId', 'checkStepId', 'candidateId', 'feedbackResultId', 'maxCorrections', 'exhaustedTerminalId'])) return;
      id(correction.id, `${at}.id`);
      for (const field of ['decisionStepId', 'outcome', 'correctionStepId', 'checkStepId', 'candidateId', 'feedbackResultId', 'exhaustedTerminalId']) id(correction[field], `${at}.${field}`, true);
      if (correction.maxCorrections !== null && (!Number.isInteger(correction.maxCorrections) || correction.maxCorrections < 0 || correction.maxCorrections > 1000)) issue(`${at}.maxCorrections`, 'Expected an integer from 0 to 1000, or null while unresolved.');
    });
    records(process.approvals, `${path}.approvals`, WORKFLOW_MODEL_LIMITS.approvals, (approval, at) => {
      if (!object(approval, at, ['id', 'stepId', 'authority', 'candidateId', 'evidenceResultIds', 'revisionPolicy'])) return;
      id(approval.id, `${at}.id`);
      id(approval.stepId, `${at}.stepId`, true);
      id(approval.candidateId, `${at}.candidateId`, true);
      string(approval.authority, `${at}.authority`, 200);
      list(approval.evidenceResultIds, `${at}.evidenceResultIds`);
      oneOf(approval.revisionPolicy, `${at}.revisionPolicy`, ['reapprove-after-change']);
    });
    records(process.terminals, `${path}.terminals`, WORKFLOW_MODEL_LIMITS.terminals, (terminal, at) => {
      if (!object(terminal, at, ['id', 'name', 'status'])) return;
      id(terminal.id, `${at}.id`);
      string(terminal.name, `${at}.name`, 200);
      oneOf(terminal.status, `${at}.status`, terminalStatuses);
    });
  });
  records(model.evidenceLinks, 'workflowModel.evidenceLinks', WORKFLOW_MODEL_LIMITS.evidenceLinks, (link, path) => {
    if (!object(link, path, ['id', 'evidenceId', 'processId', 'checkId', 'resultId', 'candidateVersion'])) return;
    id(link.id, `${path}.id`);
    // Existing evidence identifiers predate the restricted process identifier syntax.
    string(link.evidenceId, `${path}.evidenceId`, 200);
    for (const field of ['processId', 'checkId', 'resultId']) id(link[field], `${path}.${field}`, true);
    string(link.candidateVersion, `${path}.candidateVersion`, 200);
  });
  return issues;
}

function recipeProcess(config, reference) {
  const recipe = CATALOG.recipes.find(item => item.id === config.workflow.recipe);
  const allStages = recipe ? recipe.stageIds.map(id => CATALOG.stages.find(stage => stage.id === id)).filter(Boolean) : [];
  const selected = allStages.filter(stage => config.workflow.enabledStages.includes(stage.id));
  const selectedIds = new Set(selected.map(stage => stage.id));
  const bindingFor = stage => config.workflow.bindings[stage.id] || { ...stage.defaultActor, skills: stage.defaultSkills, contextOnly: false };
  const reviewOnly = stage => bindingFor(stage).actorType === 'agent' && bindingFor(stage).contextOnly;
  const producedHere = stage => selectedIds.has(stage.id) && !reviewOnly(stage);
  const resultStages = allStages.filter(stage => selectedIds.has(stage.id) || selected.some(consumer => consumer.dependsOn.includes(stage.id)));
  const results = resultStages.map(stage => ({
    id: `${stage.id}-output`, name: `${stage.title} output`, description: stage.outputs.join('\n'),
    producerStepId: producedHere(stage) ? stage.id : '',
    suppliedSource: producedHere(stage) ? '' : config.workflow.suppliedInputs[stage.id] || '',
    expectedStructure: '', versionPolicy: '', version: '',
    consumerStepIds: selected.filter(consumer => consumer.dependsOn.includes(stage.id) || (consumer.id === stage.id && reviewOnly(consumer))).map(consumer => consumer.id),
    reviserStepIds: [],
  }));
  return {
    id: reference.id, source: 'recipe', kind: 'development', name: recipe?.label || recipe?.title || config.workflow.recipe,
    purpose: recipe?.description || '', pattern: null, entryStepId: '', terminals: [],
    steps: selected.map(stage => {
      const binding = bindingFor(stage);
      const isReview = reviewOnly(stage);
      return {
        id: stage.id, name: stage.title, action: isReview ? `Review the supplied ${stage.title.toLowerCase()} outputs. Another actor must perform the underlying work and supply its observed results.` : stage.purpose,
        actor: { type: binding.actorType, id: binding.actorId, name: binding.actorName || CATALOG.roles.find(role => role.id === binding.actorId)?.label || '', contextOnly: isReview },
        capabilities: stage.capabilities.filter(capability => !isReview || contextReviewCapabilities.has(capability)),
        inputIds: [...stage.dependsOn.map(id => `${id}-output`), ...(isReview ? [`${stage.id}-output`] : [])], outputIds: isReview ? [] : [`${stage.id}-output`],
        expectedOutputIds: [`${stage.id}-output`], requiredProductionCapabilities: [...stage.capabilities],
        instructionIds: [...binding.skills], outcomes: [],
        notes: config.workflow.notes[stage.id] || '', expectedInputs: [...stage.inputs], plannedChecks: [...stage.checks],
      };
    }),
    results, checks: [], transitions: [], corrections: [], approvals: [],
    inputDependencies: selected.flatMap(stage => [...stage.dependsOn.map(id => `${id}-output`), ...(reviewOnly(stage) ? [`${stage.id}-output`] : [])].map(resultId => ({ resultId, fromStepId: results.find(result => result.id === resultId)?.producerStepId || '', toStepId: stage.id }))),
  };
}

/** Returns disposable views. Editing these views never changes authoring configuration. */
export function resolveWorkflowProcesses(config) {
  if (workflowModelShapeIssues(config?.workflowModel).length) return [];
  return config.workflowModel.processes.map(process => {
    if (process.source === 'recipe') return recipeProcess(config, process);
    const view = clone(process);
    view.results = view.results.map(result => ({
      ...result,
      consumerStepIds: view.steps.filter(step => step.inputIds.includes(result.id)).map(step => step.id),
      reviserStepIds: [...new Set(view.corrections.filter(correction => correction.candidateId === result.id).map(correction => correction.correctionStepId).filter(Boolean))],
    }));
    view.inputDependencies = view.steps.flatMap(step => step.inputIds.map(resultId => ({ resultId, fromStepId: view.results.find(result => result.id === resultId)?.producerStepId || '', toStepId: step.id })));
    return view;
  });
}

function graphFor(process, excluded = new Set()) {
  const adjacency = new Map(process.steps.map(step => [step.id, []]));
  for (const route of process.transitions) if (!excluded.has(route.id) && route.to.type === 'step' && adjacency.has(route.fromStepId) && adjacency.has(route.to.id)) adjacency.get(route.fromStepId).push(route.to.id);
  return adjacency;
}

function reachable(graph, start, excluded = new Set()) {
  const seen = new Set();
  const pending = [start];
  while (pending.length) {
    const id = pending.pop();
    if (!graph.has(id) || seen.has(id) || excluded.has(id)) continue;
    seen.add(id);
    pending.push(...graph.get(id));
  }
  return seen;
}

function cyclic(graph) {
  const indegree = new Map([...graph.keys()].map(id => [id, 0]));
  for (const destinations of graph.values()) for (const id of destinations) indegree.set(id, indegree.get(id) + 1);
  const pending = [...indegree].filter(([, count]) => count === 0).map(([id]) => id);
  let visited = 0;
  while (pending.length) {
    const id = pending.pop();
    visited += 1;
    for (const next of graph.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) pending.push(next);
    }
  }
  return visited !== graph.size;
}

/** Blocking means structurally unsafe to accept, not that an incomplete design cannot be downloaded. */
export function workflowModelIssues(config) {
  const shape = workflowModelShapeIssues(config?.workflowModel);
  if (shape.length) return shape;
  const issues = [];
  const issue = (code, path, message, blocking = true) => issues.push({ severity: blocking ? 'error' : 'warning', code, path, message, blocking });
  const unresolved = (path, message) => issue('workflow-unresolved', path, message, false);
  const duplicateIds = (records, path) => {
    const seen = new Set();
    records.forEach((record, index) => {
      if (seen.has(record.id)) issue('workflow-duplicate-id', `${path}[${index}].id`, `Duplicate identifier: ${record.id}.`);
      seen.add(record.id);
    });
  };
  const distinct = (list, path) => { if (new Set(list).size !== list.length) issue('workflow-duplicate-reference', path, 'References and outcomes must not be repeated.'); };
  const ref = (value, map, path, label) => {
    if (!value) { unresolved(path, `Choose ${label}.`); return undefined; }
    if (!map.has(value)) { issue('workflow-dangling-reference', path, `Unknown ${label}: ${value}.`); return undefined; }
    return map.get(value);
  };
  const model = config.workflowModel;
  duplicateIds(model.processes, 'workflowModel.processes');
  duplicateIds(model.evidenceLinks, 'workflowModel.evidenceLinks');
  if (!model.processes.length) unresolved('workflowModel.processes', 'Choose a process to describe.');
  if (model.processes.filter(process => process.source === 'recipe').length > 1) issue('workflow-recipe-reference', 'workflowModel.processes', 'The active recipe can be referenced by only one process.');
  for (const [index, process] of model.processes.entries()) {
    const path = `workflowModel.processes[${index}]`;
    if (process.source === 'recipe') continue;
    for (const field of ['steps', 'results', 'checks', 'transitions', 'corrections', 'approvals', 'terminals']) duplicateIds(process[field], `${path}.${field}`);
    const steps = new Map(process.steps.map(step => [step.id, step]));
    const results = new Map(process.results.map(result => [result.id, result]));
    const terminals = new Map(process.terminals.map(terminal => [terminal.id, terminal]));
    const checksByStep = new Map(process.checks.map(check => [check.stepId, check]));
    const approvalsByStep = new Map(process.approvals.map(approval => [approval.stepId, approval]));
    const routeByOutcome = new Map();
    const routeKey = (stepId, outcome) => `${stepId}:${outcome}`;
    for (const field of ['name', 'purpose']) if (!present(process[field])) unresolved(`${path}.${field}`, `Describe the process ${field}.`);
    if (!process.steps.length) unresolved(`${path}.steps`, 'Add the steps in this process.');
    if (!process.terminals.length) unresolved(`${path}.terminals`, 'Describe how the process finishes or stops.');
    ref(process.entryStepId, steps, `${path}.entryStepId`, 'an entry step');
    if (process.pattern.id !== 'bounded-correction' && process.corrections.length) issue('workflow-pattern-conflict', `${path}.pattern`, 'Correction policies require the bounded correction pattern.');
    if (process.pattern.id === 'sequence' && process.approvals.length) issue('workflow-pattern-conflict', `${path}.pattern`, 'An approval requires the review gate or bounded correction pattern.');
    if (process.pattern.id === 'bounded-correction' && !process.corrections.length) unresolved(`${path}.corrections`, 'Define the correction policy or choose another pattern.');
    if (process.pattern.id === 'review-gate' && !process.approvals.length && !process.checks.length) unresolved(`${path}.checks`, 'Define the review check or approval gate.');

    process.steps.forEach((step, i) => {
      const at = `${path}.steps[${i}]`;
      for (const field of ['name', 'action']) if (!present(step[field])) unresolved(`${at}.${field}`, `Describe this step's ${field}.`);
      if (!present(step.actor.name) && !present(step.actor.id)) unresolved(`${at}.actor`, 'Name the planned actor. This assignment does not grant permissions.');
      for (const field of ['capabilities', 'inputIds', 'outputIds', 'instructionIds', 'outcomes']) distinct(step[field], `${at}.${field}`);
      for (const field of ['inputIds', 'outputIds']) for (const id of step[field]) ref(id, results, `${at}.${field}`, 'result');
      for (const id of step.instructionIds) if (!instructionIds.has(id)) issue('workflow-instruction-reference', `${at}.instructionIds`, `Unknown instruction identifier: ${id}. Use a supported skill identifier.`);
      if (step.actor.contextOnly && step.capabilities.some(capability => dangerousCapabilities.has(capability))) issue('workflow-context-only', `${at}.capabilities`, 'A supplied-context reviewer cannot be assigned changes, execution or delegation. Assign the work to another actor.');
      if (step.actor.contextOnly && step.capabilities.some(capability => !contextReviewCapabilities.has(capability) && !dangerousCapabilities.has(capability))) unresolved(`${at}.capabilities`, 'This supplied-context assignment names an unclassified capability. Confirm that it only reviews supplied material. Capability names do not establish safe behavior or grant tools.');
      if (!step.outcomes.length) unresolved(`${at}.outcomes`, 'Declare the possible outcomes and their destinations.');
    });

    process.results.forEach((result, i) => {
      const at = `${path}.results[${i}]`;
      if (result.producerStepId && present(result.suppliedSource)) issue('workflow-result-source', at, 'A result has either an initial producer or a supplied source, not both.');
      if (result.producerStepId) {
        const producer = ref(result.producerStepId, steps, `${at}.producerStepId`, 'producer step');
        if (producer && !producer.outputIds.includes(result.id)) issue('workflow-result-producer', at, 'The initial producer must declare this result as an output.');
      } else if (!present(result.suppliedSource)) unresolved(at, 'Name the initial producer or the supplied source of this result.');
      for (const field of ['name', 'description', 'expectedStructure', 'versionPolicy']) if (!present(result[field])) unresolved(`${at}.${field}`, `Describe the result ${field}.`);
      for (const writer of process.steps.filter(step => step.outputIds.includes(result.id))) {
        const explicitRevision = process.corrections.some(correction => correction.correctionStepId === writer.id && correction.candidateId === result.id);
        if (writer.id !== result.producerStepId && !explicitRevision) issue('workflow-result-producer', at, `Step ${writer.id} produces this result but is neither its initial producer nor its declared correction step.`);
      }
    });

    const checkSteps = new Set();
    process.checks.forEach((check, i) => {
      const at = `${path}.checks[${i}]`;
      const step = ref(check.stepId, steps, `${at}.stepId`, 'check step');
      const candidate = ref(check.candidateId, results, `${at}.candidateId`, 'candidate result');
      const evidence = ref(check.evidenceResultId, results, `${at}.evidenceResultId`, 'evidence result');
      if (check.stepId && checkSteps.has(check.stepId)) issue('workflow-check-conflict', `${at}.stepId`, 'Each check step has one check definition in this model version.');
      checkSteps.add(check.stepId);
      if (candidate && step && !step.inputIds.includes(candidate.id)) issue('workflow-check-input', at, 'The check step must consume its named candidate.');
      if (evidence && step && (evidence.producerStepId !== step.id || !step.outputIds.includes(evidence.id))) issue('workflow-check-evidence', at, 'Check evidence must be produced by its check step.');
      if (candidate && evidence && candidate.id === evidence.id) issue('workflow-check-evidence', at, 'Candidate and check evidence must have distinct result identities.');
      distinct(check.outcomes, `${at}.outcomes`);
      if (step && (check.outcomes.length !== step.outcomes.length || check.outcomes.some(outcome => !step.outcomes.includes(outcome)))) issue('workflow-check-outcomes', `${at}.outcomes`, 'Check outcomes must match the outcomes declared by its step.');
      if (!check.criteria.length || check.criteria.some(criterion => !present(criterion))) unresolved(`${at}.criteria`, 'Supply the criteria used to judge the candidate.');
    });

    process.transitions.forEach((route, i) => {
      const at = `${path}.transitions[${i}]`;
      const source = ref(route.fromStepId, steps, `${at}.fromStepId`, 'source step');
      if (!route.outcome) unresolved(`${at}.outcome`, 'Choose the source outcome.');
      else if (source && !source.outcomes.includes(route.outcome)) issue('workflow-undeclared-outcome', `${at}.outcome`, 'The source step does not declare this outcome.');
      if (route.fromStepId && route.outcome) {
        const key = routeKey(route.fromStepId, route.outcome);
        if (routeByOutcome.has(key)) issue('workflow-ambiguous-route', at, 'One step outcome cannot have multiple destinations. Parallel routes are not supported.');
        routeByOutcome.set(key, route);
      }
      if (route.to.type === 'unresolved') {
        if (route.to.id) issue('workflow-unresolved-destination', `${at}.to.id`, 'An unresolved destination must not name a step or terminal.');
        unresolved(`${at}.to`, 'Choose what should happen after this outcome.');
      } else ref(route.to.id, route.to.type === 'step' ? steps : terminals, `${at}.to.id`, `${route.to.type} destination`);
    });
    for (const [i, step] of process.steps.entries()) for (const outcome of step.outcomes) if (!routeByOutcome.has(routeKey(step.id, outcome))) unresolved(`${path}.steps[${i}].outcomes`, `Choose a destination for ${step.id}: ${outcome}.`);

    const correctionEdges = new Set();
    const correctionTargets = new Set();
    const correctionDecisions = new Set();
    process.corrections.forEach((correction, i) => {
      const at = `${path}.corrections[${i}]`;
      const decision = ref(correction.decisionStepId, steps, `${at}.decisionStepId`, 'decision step');
      const target = ref(correction.correctionStepId, steps, `${at}.correctionStepId`, 'correction step');
      const checker = ref(correction.checkStepId, steps, `${at}.checkStepId`, 'check step');
      const candidate = ref(correction.candidateId, results, `${at}.candidateId`, 'candidate result');
      const feedback = ref(correction.feedbackResultId, results, `${at}.feedbackResultId`, 'feedback result');
      const exhausted = ref(correction.exhaustedTerminalId, terminals, `${at}.exhaustedTerminalId`, 'exhausted terminal');
      if (correction.maxCorrections === null) unresolved(`${at}.maxCorrections`, 'Choose the maximum corrections after the initial candidate. No default limit is assumed.');
      if (exhausted?.status === 'completed') issue('workflow-correction-exhaustion', at, 'Exhausting corrections cannot count as completed work.');
      if (target?.actor.contextOnly) issue('workflow-context-only-correction', at, 'A supplied-context reviewer cannot perform corrections. Assign the correction to an actor who can change the candidate.');
      if (target && candidate && (!target.inputIds.includes(candidate.id) || !target.outputIds.includes(candidate.id))) issue('workflow-correction-candidate', at, 'The correction step must consume and revise the same named logical candidate.');
      if (target && feedback && !target.inputIds.includes(feedback.id)) issue('workflow-correction-feedback', at, 'The correction step must consume its findings or requested changes.');
      if (checker && !checksByStep.has(checker.id)) issue('workflow-correction-check', at, 'A correction must return to a defined check step.');
      if (checker && candidate && checksByStep.get(checker.id)?.candidateId !== candidate.id) issue('workflow-correction-check', at, 'The return check must check the corrected candidate.');
      if (decision && !checksByStep.has(decision.id) && !approvalsByStep.has(decision.id)) issue('workflow-correction-decision', at, 'A correction must originate from a check or an approval decision.');
      if (decision && candidate && (checksByStep.get(decision.id) || approvalsByStep.get(decision.id))?.candidateId !== candidate.id) issue('workflow-correction-candidate', at, 'The correction decision must concern the named candidate.');
      if (feedback && decision && feedback.producerStepId !== decision.id) issue('workflow-correction-feedback', at, 'Correction findings must be produced by the decision step requesting the correction.');
      if (!correction.outcome) unresolved(`${at}.outcome`, 'Name the outcome that requests correction.');
      else if (decision && !decision.outcomes.includes(correction.outcome)) issue('workflow-undeclared-outcome', `${at}.outcome`, 'The correction decision does not declare this outcome.');
      if (approvalsByStep.has(correction.decisionStepId) && correction.outcome && correction.outcome !== 'changes-requested') issue('workflow-approval-correction', at, 'Only changes requested can start an approval correction. Declined approval must stop or seek human assistance.');
      if (correction.correctionStepId && correctionTargets.has(correction.correctionStepId)) issue('workflow-correction-overlap', at, 'A correction step cannot belong to multiple correction counters.');
      correctionTargets.add(correction.correctionStepId);
      const key = routeKey(correction.decisionStepId, correction.outcome);
      if (correctionDecisions.has(key)) issue('workflow-correction-overlap', at, 'One decision outcome cannot select multiple correction policies.');
      correctionDecisions.add(key);
      const route = routeByOutcome.get(key);
      if (!route || route.to.type === 'unresolved' || !route.to.id) unresolved(at, 'Connect the correction decision outcome to its correction step.');
      else if (route.to.type !== 'step' || route.to.id !== correction.correctionStepId) issue('workflow-correction-route', at, 'The correction decision must route to its declared correction step.');
      else correctionEdges.add(route.id);
      if (target && (target.id === decision?.id || target.id === checker?.id)) issue('workflow-correction-self', at, 'Correction, decision and return check must not collapse into one step.');
    });

    const graph = graphFor(process);
    const forward = graphFor(process, correctionEdges);
    const completeDestinations = route => route.to.type === 'terminal' && terminals.get(route.to.id)?.status === 'completed';
    const canComplete = set => process.transitions.some(route => set.has(route.fromStepId) && completeDestinations(route));
    if (cyclic(forward)) issue('workflow-unsupported-cycle', `${path}.transitions`, 'The process contains a cycle outside a declared bounded correction path.');
    const fromEntry = reachable(graph, process.entryStepId);
    const entryWithout = new Map();
    const entryWithoutStep = id => {
      if (!entryWithout.has(id)) entryWithout.set(id, reachable(graph, process.entryStepId, new Set([id])));
      return entryWithout.get(id);
    };
    const openRoutes = process.transitions.some(route => route.to.type === 'unresolved' || !route.to.id) || process.steps.some(step => !step.outcomes.length || step.outcomes.some(outcome => !routeByOutcome.has(routeKey(step.id, outcome))));
    if (steps.has(process.entryStepId)) process.steps.forEach((step, i) => {
      if (!fromEntry.has(step.id)) issue('workflow-unreachable-step', `${path}.steps[${i}]`, `Step ${step.id} is not reachable from the entry.`, !openRoutes);
      for (const id of step.inputIds) {
        const producer = results.get(id)?.producerStepId;
        if (producer === step.id) issue('workflow-input-order', `${path}.steps[${i}].inputIds`, `Step ${step.id} cannot consume result ${id} before initially producing it. Use a supplied source or a separate producer.`);
        if (producer && producer !== step.id && steps.has(producer) && entryWithoutStep(producer).has(step.id)) issue('workflow-input-order', `${path}.steps[${i}].inputIds`, `Step ${step.id} can be reached before result ${id} is produced by ${producer}.`);
      }
    });
    process.checks.forEach((check, i) => {
      for (const route of process.transitions.filter(route => route.fromStepId === check.stepId && WORKFLOW_NON_PASSING_OUTCOMES.includes(route.outcome))) {
        const bypass = completeDestinations(route) || (route.to.type === 'step' && canComplete(reachable(graph, route.to.id, new Set([check.stepId]))));
        if (bypass) issue('workflow-check-bypass', `${path}.checks[${i}]`, `The ${route.outcome} outcome cannot complete the process without returning through this check.`);
      }
    });
    process.corrections.forEach((correction, i) => {
      if (!steps.has(correction.correctionStepId) || !steps.has(correction.checkStepId)) return;
      const at = `${path}.corrections[${i}]`;
      if (!reachable(forward, correction.correctionStepId).has(correction.checkStepId)) issue('workflow-correction-return', at, 'The correction path must return to its named check.', !openRoutes);
      if (canComplete(reachable(forward, correction.correctionStepId, new Set([correction.checkStepId])))) issue('workflow-correction-bypass', at, 'A revised candidate cannot reach completion without its required check.');
      for (const affected of process.checks.filter(check => check.candidateId === correction.candidateId && check.stepId !== correction.checkStepId)) {
        if (canComplete(reachable(forward, correction.correctionStepId, new Set([affected.stepId])))) issue('workflow-correction-stale-check', at, `A revised candidate can reach completion without repeating check ${affected.id}. This model does not declare exceptions that keep earlier check evidence current after a change.`);
      }
      for (const route of process.transitions) if (route.to.type === 'step' && route.to.id === correction.correctionStepId && !correctionEdges.has(route.id)) issue('workflow-correction-entry', at, 'Enter the correction step only through its declared correction policy, so no route bypasses the correction limit.');
      if (process.entryStepId === correction.correctionStepId) issue('workflow-correction-entry', at, 'A correction step cannot be the initial entry. Corrections follow an initial candidate and decision.');
    });

    const approvalSteps = new Set();
    process.approvals.forEach((approval, i) => {
      const at = `${path}.approvals[${i}]`;
      const step = ref(approval.stepId, steps, `${at}.stepId`, 'approval step');
      const candidate = ref(approval.candidateId, results, `${at}.candidateId`, 'approval candidate');
      if (approval.stepId && approvalSteps.has(approval.stepId)) issue('workflow-approval-conflict', at, 'Each approval step has one authority requirement.');
      approvalSteps.add(approval.stepId);
      if (!present(approval.authority)) unresolved(`${at}.authority`, 'Name who has authority to approve. The planned actor alone does not grant it.');
      if (candidate && step && !step.inputIds.includes(candidate.id)) issue('workflow-approval-input', at, 'The approval step must consume its named candidate.');
      distinct(approval.evidenceResultIds, `${at}.evidenceResultIds`);
      if (!approval.evidenceResultIds.length) unresolved(`${at}.evidenceResultIds`, 'Name the evidence the authority reviews.');
      for (const id of approval.evidenceResultIds) {
        const evidence = ref(id, results, `${at}.evidenceResultIds`, 'approval evidence');
        const checkedHere = step && checksByStep.get(step.id)?.evidenceResultId === id && evidence?.producerStepId === step.id;
        if (evidence && step && !step.inputIds.includes(id) && !checkedHere) issue('workflow-approval-input', at, 'The approval step must consume the named evidence or produce it through its own defined check.');
      }
      if (!step) return;
      for (const outcome of ['accepted', 'changes-requested', 'declined']) if (!step.outcomes.includes(outcome)) issue('workflow-approval-outcomes', at, `Approval must declare the ${outcome} outcome.`);
      if (canComplete(entryWithoutStep(step.id))) issue('workflow-approval-bypass', at, 'A completion path bypasses the required approval.');
      for (const correction of process.corrections.filter(item => item.candidateId === approval.candidateId)) {
        if (canComplete(reachable(graph, correction.correctionStepId, new Set([step.id])))) issue('workflow-approval-after-change', at, 'A corrected candidate can reach completion without obtaining this approval again.');
      }
      for (const route of process.transitions.filter(route => route.fromStepId === step.id && route.outcome !== 'accepted')) {
        if (completeDestinations(route) || (route.to.type === 'step' && canComplete(reachable(graph, route.to.id, new Set([step.id]))))) issue('workflow-approval-bypass', at, 'Only accepted approval can continue to completion.');
        if (route.outcome === 'declined' && route.to.type === 'step' && reachable(graph, route.to.id).has(step.id)) issue('workflow-approval-declined', at, 'Declined approval cannot automatically return to approval or enter another correction attempt.');
      }
    });
    process.terminals.forEach((terminal, i) => {
      if (!present(terminal.name)) unresolved(`${path}.terminals[${i}].name`, 'Name this finishing or stopping outcome.');
      const targeted = process.transitions.some(route => route.to.type === 'terminal' && route.to.id === terminal.id) || process.corrections.some(correction => correction.exhaustedTerminalId === terminal.id);
      if (!targeted) unresolved(`${path}.terminals[${i}]`, `Terminal ${terminal.id} has no route or exhausted policy leading to it.`);
    });
  }

  const processes = new Map(resolveWorkflowProcesses(config).map(process => [process.id, process]));
  const evidence = new Map((config.evidence || []).map(record => [record.id, record]));
  model.evidenceLinks.forEach((link, index) => {
    const path = `workflowModel.evidenceLinks[${index}]`;
    const record = ref(link.evidenceId, evidence, `${path}.evidenceId`, 'evidence record');
    const process = ref(link.processId, processes, `${path}.processId`, 'process');
    if (!process) return;
    const check = ref(link.checkId, new Map(process.checks.map(item => [item.id, item])), `${path}.checkId`, 'check');
    const result = ref(link.resultId, new Map(process.results.map(item => [item.id, item])), `${path}.resultId`, 'candidate result');
    if (check && result && check.candidateId !== result.id) issue('workflow-evidence-candidate', path, 'The evidence association must refer to the check\'s candidate.');
    if (!present(link.candidateVersion) || !present(result?.version)) unresolved(`${path}.candidateVersion`, 'Evidence applicability to the current candidate is unresolved until both supplied revisions are recorded.');
    else if (link.candidateVersion !== result.version) issue('workflow-stale-evidence', path, 'This evidence concerns a different recorded candidate version. Keep it as history and check the current candidate again.', false);
    if (record && record.status !== 'passed') issue('workflow-evidence-not-passing', path, 'The linked observation does not record a passed check. Linking evidence does not approve a candidate.', false);
  });
  return issues;
}
