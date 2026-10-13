import { CATALOG, TOOL_ALIASES, SCHEMA_VERSION, DEFINITION_VERSION, REVIEW_DATE, SOURCES } from './catalog.mjs';
import { guidanceSnapshot } from './guidance-review.mjs';
import { getIntentAnswer } from './intent.mjs';
import { getIntentReview, intentReviewIssues } from './intent-review.mjs';
import { APP_VERSION } from './version.mjs';
import { createWorkflowModel, workflowModelShapeIssues, workflowModelIssues, WORKFLOW_MODEL_LIMITS } from './workflow-model.mjs';
import { workflowModelMarkdown } from './workflow-model-view.mjs';
export { CATALOG, TOOL_ALIASES } from './catalog.mjs';
export const EXPORTER_VERSION = '3.2.0';

const { stages, skills, roles, practices } = CATALOG;
const practiceReviewDate = practice => practice.reviewedOn || CATALOG.definitionMetadata[`practice:${practice.id}`]?.reviewedOn || REVIEW_DATE;
const clone = value => JSON.parse(JSON.stringify(value));
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const encoder = new TextEncoder();
const bytes = value => encoder.encode(value).length;
export const PROJECT_JSON_MAX_BYTES = 8 * 1024 * 1024;
const present = value => typeof value === 'string' && value.trim().length > 0;
const placeholder = (value, label) => present(value) ? value : `[UNRESOLVED: ${label}]`;
const escapeText = value => String(value).replace(/[\\`*_{}\[\]<>#|]/g, '\\$&').replace(/[\r\n]+/g, ' ');
const canonical = value => Array.isArray(value) ? value.map(canonical) : plainObject(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const json = value => `${JSON.stringify(canonical(value), null, 2)}\n`;
const lookupStage = id => stages.find(stage => stage.id === id);
const evidenceStageName = id => id ? lookupStage(id)?.title || id : 'Project level';
const lookupRecipe = id => CATALOG.recipes.find(recipe => recipe.id === id);
function fence(value, language = 'text') {
  const content = String(value);
  const delimiter = '`'.repeat(Math.max(2, ...[...content.matchAll(/`+/g)].map(match => match[0].length)) + 1);
  return `${delimiter}${language}\n${content}\n${delimiter}`;
}

export function getStages(configOrRecipe = 'feature-delivery') {
  if (typeof configOrRecipe === 'object' && configOrRecipe?.workflowModel && !configOrRecipe.workflowModel.processes.some(process => process.source === 'recipe')) return [];
  const recipe = lookupRecipe(typeof configOrRecipe === 'string' ? configOrRecipe : configOrRecipe?.workflow?.recipe);
  return recipe ? recipe.stageIds.map(lookupStage) : [];
}

function defaultBinding(stage) {
  return { ...clone(stage.defaultActor), skills: [...stage.defaultSkills], contextOnly: false };
}

export function createRecipe(recipeId = 'feature-delivery') {
  if (!lookupRecipe(recipeId)) throw new Error('Choose a supported workflow recipe.');
  const selected = getStages(recipeId);
  const usedRoles = new Set(selected.filter(stage => stage.defaultActor.actorType === 'agent').map(stage => stage.defaultActor.actorId));
  return {
    schemaVersion: SCHEMA_VERSION,
    workflowModel: createWorkflowModel(),
    project: { name: '', purpose: '', host: '', sourceControl: '', sourceLocations: '' },
    components: recipeId === 'feasibility' ? [] : [{ id: 'component-1', name: '', path: '', technologies: [], commands: { test: '', lint: '', build: '' } }],
    workflow: { recipe: recipeId, enabledStages: selected.map(stage => stage.id), notes: {}, bindings: Object.fromEntries(selected.map(stage => [stage.id, defaultBinding(stage)])), suppliedInputs: {}, answers: {} },
    skills: [],
    agents: roles.filter(role => usedRoles.has(role.id)).map(role => ({ role: role.id, tools: [...role.defaultTools] })),
    practices: ['portable-behavior', 'progressive-context'],
    constraints: { approvalRequired: true, readOnly: false, notes: '' },
    facts: [], evidence: [],
    model: { name: '', version: '', budget: '', notes: '' },
    runtime: { enabled: false, outcome: '', requiredInputs: '', judgment: '', tools: '', validation: '', limits: '', duplicates: '', failures: '', confirmation: '', controls: [] },
  };
}

export const createDefault = () => createRecipe();

export function selectRecipe(config, recipeId) {
  const fresh = createRecipe(recipeId);
  const next = clone(config);
  next.workflow.recipe = recipeId;
  if (!next.workflowModel.processes.some(process => process.source === 'recipe')) {
    if (next.workflowModel.processes.length >= WORKFLOW_MODEL_LIMITS.processes) throw new Error(`This project already has ${WORKFLOW_MODEL_LIMITS.processes} processes. Adding a recipe needs a free process slot. Your current project was kept.`);
    let id = 'development';
    for (let suffix = 2; next.workflowModel.processes.some(process => process.id === id); suffix += 1) id = `development-${suffix}`;
    next.workflowModel.processes.unshift({ id, source: 'recipe', kind: 'development' });
  }
  next.workflow.enabledStages = [...fresh.workflow.enabledStages];
  for (const [id, binding] of Object.entries(fresh.workflow.bindings)) if (!Object.hasOwn(next.workflow.bindings, id)) next.workflow.bindings[id] = binding;
  for (const candidate of fresh.agents) if (!next.agents.some(agent => agent.role === candidate.role)) next.agents.push(candidate);
  return next;
}

export function createExample(recipeId = 'feature-delivery') {
  if (recipeId === 'api-data') return createApiDataExample();
  const config = createRecipe(recipeId);
  if (recipeId === 'feature-delivery') {
    config.project = {
      name: 'Request list status filter',
      purpose: 'Fictional example. Let people switch a request list between Open and All while keeping existing access rules. Loading, empty and failed requests remain understandable. This is a proposed feature, not an implemented or verified result.',
      host: 'vscode', sourceControl: 'github',
      sourceLocations: 'Fictional worked example only. Supply the actual requirement owner, repository revision, list implementation, API contract and existing tests before adopting this pack.',
    };
    config.components = [
      { id: 'web', name: 'Request list interface', path: '', technologies: ['typescript', 'react', 'vitest', 'playwright'].map(id => ({ id, version: '' })), commands: { test: '', lint: '', build: '' } },
      { id: 'delivery', name: 'Build and delivery tooling', path: '', technologies: ['nodejs', 'npm', 'github-actions'].map(id => ({ id, version: '' })), commands: { test: '', lint: '', build: '' } },
    ];
    config.workflow.answers = {
      'user-need': 'Proposed example outcome. People reviewing requests can select Open to focus on open requests, or All to see every request they are permitted to access. Confirm the starting choice with the requirement owner.',
      acceptance: 'Proposed examples, not approved or run. Open shows permitted open requests and excludes closed requests. All shows every permitted request. Loading is shown while data is pending, without presenting it as an empty result. No matching requests shows a clear empty message. A failed request shows an error and a retry action that keeps the chosen filter. The filter has an accessible name and works with the keyboard. The list and filter remain usable on a narrow screen. Neither choice reveals records outside the existing access rules.',
      affected: 'Inspect the existing list, its data source, authorization boundary and tests. The UI, focused tests and delivery checks are in scope for this example. Whether the API needs a filter parameter is unresolved until the data contract and pagination are known. Versions, repository paths, executable commands and release ownership have not been supplied.',
    };
    config.workflow.notes = {
      requirements: 'Confirm the Open and All examples with the requirement owner. Record the default selection, status definitions, pagination behavior and expected retry behavior. Use permitted open and closed records, no matches, pending data and a failed request as proposed situations. Do not record these examples as observed results.',
      architecture: 'Proposed options. Reuse filtering over loaded data only if it contains the complete permitted result set for the task. Otherwise inspect whether the existing API can filter the full permitted set and preserve pagination. Keep authorization in the existing trusted boundary. Choose the smaller supported change after inspecting the actual contract. No API change, new service or model is assumed necessary.',
      breakdown: 'First agree the expected behavior and inspect the list contract. Then implement the selection and loading, empty, error and retry states. Add focused filtering and component checks and a browser journey. Review access boundaries and existing behavior before the normal release handoff. Connect each task to its acceptance example and record any dependency on a changed API.',
      implementation: 'Use the existing TypeScript and React conventions once inspected. Represent the selection and request state clearly. Reuse current components and data access where suitable. Preserve existing access rules and unrelated list behavior. Confirm real source paths, versions and approved commands before editing or running checks. This pack contains instructions and does not execute this work.',
      verification: 'Proposed checks, all not run. Use Vitest for filtering logic and appropriate component behavior in the actual configured environment. Use Playwright for Open to All, pending data, no matches, error then retry, keyboard selection and the agreed narrow viewport. Verify permitted records and the authorization boundary at the relevant service layer. Confirm existing npm scripts and GitHub Actions jobs, directories, fixtures and versions before execution. Record observed results and remaining gaps separately. A green command alone does not prove every acceptance example.',
      release: 'Before release, name the release owner and confirm the actual pipeline, approval and deployment procedure. Review the changed files and the evidence for each acceptance example. Record a proportionate recovery route if filtering hides the wrong records or breaks existing behavior. No deployment, recovery command or approval is supplied or implied by this example.',
      operations: 'After a real release, compare actual filter behavior, request failures and user feedback with the agreed outcome. Name the support owner and where a problem is reported. Record the release revision and observations before proposing a correction. Usage, reliability and user benefit are unknown until observed.',
    };
    config.constraints.notes = 'Fictional reference stack, not a required stack for other projects. Preserve existing access rules. No production access or credentials are provided. Confirm acceptance, permission boundaries, actual paths, versions, commands, release owner and approval policy. All planned checks are not run. Downloads remain draft instructions until the project supplies its missing facts and evidence.';
    return config;
  }
  config.project = { name: recipeId === 'feasibility' ? 'Configuration service feasibility' : recipeId === 'bugfix' ? 'Saved search repair' : 'Example delivery project', purpose: 'Fictional example. ' + (recipeId === 'feasibility' ? 'Investigate turning supplied references into a valid draft configuration. Produce a go/no-go decision, not a deployed service.' : recipeId === 'bugfix' ? 'Investigate and repair a saved search that loses an optional filter.' : 'Add a saved search feature to a web app with an API.') + ' Paths, versions and commands are sample values, not verified against a real repository.', host: 'jetbrains', sourceControl: 'github', sourceLocations: 'Synthetic example: docs/requirements.md and docs/decisions/. Replace with actual project sources.' };
  config.components = [
    { id: 'web', name: 'Example web app', path: 'web', technologies: [{ id: 'react', version: '19' }, { id: 'typescript', version: '5' }], commands: { test: 'npm test -- --run', lint: 'npm run lint', build: 'npm run build' } },
    { id: 'api', name: 'Example API', path: 'api', technologies: [{ id: 'java', version: '21' }, { id: 'spring-boot', version: '3' }], commands: { test: './mvnw test', lint: './mvnw checkstyle:check', build: './mvnw package' } },
  ];
  const recipe = lookupRecipe(recipeId);
  config.workflow.answers = Object.fromEntries(recipe.questions.map(question => [question.id, `Synthetic example for review: ${question.hint}`]));
  config.workflow.notes[getStages(recipeId)[0].id] = recipeId === 'feasibility' ? 'Follow one synthetic reference input through the current manual configuration process. Record what is known and what still needs investigation.' : 'Define expected saved search behavior, permissions and failure cases with the requirement owner.';
  config.constraints.notes = 'Example boundary: reviewer approval before merge or production release. Confirm the actual policy before adopting this pack.';
  if (recipeId === 'feasibility') {
    config.runtime = {
      enabled: true,
      outcome: 'Create a valid draft configuration for the intended references and return backend confirmed identifiers. This is an expected result, not an observed implementation.',
      requiredInputs: 'References, target configuration type and applicable rules. Ask for clarification when a required value is missing.',
      judgment: 'Investigate whether interpreting ambiguous descriptions needs a model. Ordinary code can enforce schema, permissions and business validation.',
      tools: 'Typed tools or MCP wrappers call existing backend APIs with explicit argument schemas and permitted operations. No connector is configured by this pack.',
      validation: 'The backend validates referenced entities, allowed changes and business rules before any write. Validate the final response separately.',
      limits: 'Define feature specific limits for elapsed time, model expenditure, tool calls, retries, retrieved data and affected records. Exact values remain unresolved.',
      duplicates: 'Investigate an idempotency key and retrieval of the prior result when a write succeeds before the response times out.',
      failures: 'Record incomplete inputs, invalid proposals, backend failures, timeouts and partial completion. Classify causes before changing instructions or models.',
      confirmation: 'Backend results establish completed operations. Agent inferred fields remain explicit assumptions. HTTP success alone does not prove the business outcome.',
      controls: CATALOG.runtimeControls.map(control => ({ ...control, status: 'requirement', implementation: '', evidenceId: '' })),
    };
    config.facts.push({ id: 'example-process', claim: 'The current process is performed manually by an engineer. This is synthetic example data.', status: 'inferred', source: 'Synthetic worked example', revision: '', reviewer: '', notes: 'Replace this example with actual process evidence.' });
  }
  return config;
}

export const createBackendExample = () => createExample('feasibility');

export function createApiDataExample() {
  const config = createRecipe('feature-delivery');
  config.project = {
    name: 'Saved topic review selection',
    purpose: 'Fictional example. A reviewer retrieves permitted topics by subject area, checks a proposed selection and explicitly authorizes saving it for later review. This example includes a requested save. Read only retrieval is a smaller alternative when saving is not required. Nothing has been implemented or run.',
    host: 'vscode', sourceControl: 'github',
    sourceLocations: 'Fictional reference only. Supply the real requirement owner, API contract, access policy, repository revision, data schema, migrations and tests before adopting this pack.',
  };
  config.components = [
    { id: 'api', name: 'Topic review API', path: '', technologies: ['java', 'spring-boot', 'maven'].map(id => ({ id, version: '' })), commands: { test: '', lint: '', build: '' } },
    { id: 'data', name: 'Stored review selections', path: '', technologies: ['postgresql', 'docker'].map(id => ({ id, version: '' })), commands: { test: '', lint: '', build: '' } },
  ];
  config.workflow.answers = {
    'user-need': 'Proposed outcome. A reviewer can retrieve every permitted topic matching an agreed subject area, review a selection and save that selection with a backend confirmed identifier. Confirm whether a saved selection is needed. A read only list should use ordinary retrieval without a save process.',
    acceptance: 'Proposed examples, not approved or run. A valid subject filter returns only permitted matching topics with explicit pagination and a stable agreed order. A valid empty result is distinct from a failed request. Missing or invalid filters ask for correction. An unauthorized caller cannot read or save restricted records. A checked selection is saved only after separate authorization and server validation. A duplicate retry does not create another selection. After a timeout with an uncertain write result, retrieve the prior outcome before retrying. A backend confirmed saved identifier is reported only after checking the stored result. Unknown outcomes and exhausted corrections stop without claiming success.',
    affected: 'Inspect existing API operations, caller scope, subject definitions, pagination, data constraints, transaction boundaries, schema migrations, retention and recovery needs. The proposed reference stack is optional. Real versions, paths, endpoints, commands, write authority and release procedure remain unresolved.',
  };
  config.workflow.notes = {
    requirements: 'Confirm read only retrieval versus a requested saved selection with the requirement owner. Record allowed filters, page and result limits, ordering, permitted caller scope, selection fields, duplicate rules and expected empty, invalid, failed and unauthorized outcomes. Keep proposed examples separate from observed evidence.',
    architecture: 'Prefer an existing approved API and ordinary code for known filters, pagination, validation and persistence. Keep database queries behind the trusted service boundary. Use a model only if interpreting ambiguous input or selecting among supported operations adds measured value. Direct typed API calls are sufficient. MCP is an optional adapter and requires the same access approval, contracts and validation. Do not bypass an untrusted or blocked connector. The separate application design below illustrates a save requested by the user, not a mandatory agent architecture.',
    breakdown: 'Agree the API and data contract first. Implement scoped retrieval and page handling, prepare a selection, check it, authorize the save separately and confirm the stored outcome. Add focused contract, access, data integrity and retry checks. Plan any schema migration and recovery before release. Link each task and check to its acceptance example.',
    implementation: 'Inspect actual Java and Spring Boot conventions, Maven wrapper or configured build, PostgreSQL schema and Docker test setup before choosing implementation commands. Reuse approved service operations and transaction boundaries. Validate inputs and access on the server. Do not generate arbitrary queries when a supported typed operation is available. Never copy credentials into generated instructions. This pack does not call an API or write data.',
    verification: 'Proposed checks, all not run. Cover matching and empty pages, multiple pages, stable ordering, invalid filters, unauthorized access, selection validation, separate save authorization, transaction failure, duplicate retries, uncertain writes, confirmed stored identifiers and migration recovery. Check the changed candidate again after each permitted correction and obtain new approval. Two corrections is an illustrative design choice to confirm, not a measured optimum. Real fixtures, environments, procedures and evidence remain to be supplied.',
    release: 'Name the release and data owners. Confirm the real pipeline, migration ordering, backup or restore strategy where needed, compatibility with existing callers and the route for a failed migration or partial release. Obtain required approval before any deployment or data change. No migration or recovery command has been supplied.',
    operations: 'Record request and operation identifiers, safe failure categories, latency, retrieved counts, retry counts and confirmed save outcomes in the actual approved observability system. Do not log credentials or unnecessary source content. Identify the support owner, retention rules and recovery route. Usage, reliability and user benefit are unknown until observed.',
  };
  config.constraints.notes = 'Fictional optional Java, Spring Boot, Maven, PostgreSQL and Docker reference. Real repository and environment facts are unknown. Read access and write access must be authorized separately by the trusted service. A passed content check is not permission to save. Direct API integration can be used without MCP or a model. Confirm the proposed two correction limit, named approval authority, page limits, time limits, duplicate handling, migration and recovery rules before implementation. All checks remain not run.';
  const actor = (type, name) => ({ type, id: '', name, contextOnly: false });
  const step = (id, name, action, inputIds, outputIds, outcomes, type = 'external', instructions = []) => ({ id, name, action, actor: actor(type, type === 'human' ? 'Authorized reviewer, actual authority unresolved' : 'Trusted application service, implementation unresolved'), capabilities: [], inputIds, outputIds, instructionIds: instructions, outcomes });
  const result = (id, name, producerStepId, description, expectedStructure, suppliedSource = '') => ({ id, name, description, producerStepId, suppliedSource, expectedStructure, versionPolicy: 'Record a new candidate or evidence revision after changes. Earlier evidence and approval do not qualify changed content.', version: '' });
  const route = (fromStepId, outcome, type, id) => ({ id: `${fromStepId}-${outcome}`, fromStepId, outcome, to: { type, id } });
  const process = {
    id: 'topic-selection', source: 'custom', kind: 'application', name: 'Retrieve, check and save a topic selection',
    purpose: 'Proposed application behavior when a saved selection is requested. Ordinary code is the starting option. This design does not execute, grant access or deploy an agent. Saving requires separate authorization. The two correction maximum is illustrative and editable.',
    pattern: { id: 'bounded-correction', version: '1.0' }, entryStepId: 'validate',
    steps: [
      step('validate', 'Validate request and read scope', 'Validate the requested subject filter, caller scope and agreed page limits in the trusted backend. Unknown required values need clarification. Do not accept a caller supplied permission claim.', ['request'], ['validated-request'], ['valid', 'missing-information', 'unauthorized']),
      step('retrieve', 'Retrieve permitted pages', 'Call an approved typed API operation and follow its agreed pagination within recorded limits and the agreed data consistency policy. Only a complete agreed result scope proceeds. A valid empty result is not a failure, but whether an empty selection can be saved needs an explicit requirement. Stop on a partial result or unknown page state. Endpoints, page limits, time limits and consistency policy remain unresolved.', ['validated-request'], ['records'], ['retrieved', 'empty', 'partial', 'unavailable', 'unauthorized']),
      step('prepare', 'Prepare the proposed selection', 'Use retrieved permitted records to prepare the requested selection. Prefer deterministic code. If ambiguous input justifies a model later, restrict it to supported operations and check its output before any save.', ['validated-request', 'records'], ['candidate'], ['ready', 'failed']),
      step('check', 'Check the proposed selection', 'Check content, required fields, source record membership and the allowed scope. Record findings for the exact candidate revision. A valid result is not authorization to persist.', ['candidate', 'records'], ['selection-findings'], ['passed', 'changes-requested', 'unknown'], 'external', ['verification']),
      step('correct', 'Correct using check findings', 'Revise only the named selection using its findings and permitted source records. Count this entry as one correction, including unsuccessful attempts. Return to the same check. Stop at the proposed maximum instead of silently retrying.', ['candidate', 'selection-findings', 'records'], ['candidate'], ['revised', 'blocked']),
      step('authorize', 'Authorize the requested save', 'A named authority reviews the current candidate and check findings. Permission to read and a passed check do not authorize saving. Confirm the actual authority and obtain approval again after changes.', ['candidate', 'selection-findings'], ['save-authorization'], ['accepted', 'changes-requested', 'declined', 'unavailable'], 'human'),
      step('save', 'Save through the approved service', 'Recheck caller write authorization and business rules on the server. Use the agreed transaction and backend duplicate prevention rules. Preserve the original operation identity for recovery. An uncertain or partial write goes to read only reconciliation. Do not replay it automatically.', ['candidate', 'save-authorization'], ['save-result'], ['stored', 'unauthorized', 'failed', 'unknown', 'partial']),
      step('reconcile', 'Resolve the saved outcome without another write', 'For an already confirmed save, retain the backend operation outcome. For an uncertain or partial save, read the original operation outcome through an approved read only operation. Do not replay the write. If the operation identity is missing, the lookup is unavailable or a complete outcome cannot be established, stop for clarification. Exact duplicate prevention and operation lookup contracts remain unresolved.', ['candidate', 'save-result'], ['resolved-save-outcome'], ['confirmed', 'unknown', 'unavailable', 'failed']),
      step('confirm', 'Confirm the stored outcome', 'Check the returned backend identifier and agreed stored outcome against the authorized candidate. An HTTP success or agent statement alone is insufficient. Preserve uncertain or unavailable outcomes without claiming completion.', ['candidate', 'resolved-save-outcome'], ['save-findings'], ['passed', 'failed', 'unknown'], 'external', ['verification']),
      step('report', 'Report the confirmed outcome', 'Return only the checked backend confirmed identifier and outcome. Include any unresolved or partial state explicitly. Do not turn inferred values into completed actions.', ['resolved-save-outcome', 'save-findings'], ['response'], ['reported', 'failed']),
    ],
    results: [
      result('request', 'Requested topic selection', '', 'Fictional request for subject filtered permitted topics and a saved selection.', 'Subject filter, caller identity and requested save intent. Exact field names, types and source are unresolved.', 'User input in this fictional design. Actual request interface unresolved.'),
      result('validated-request', 'Validated request scope', 'validate', 'Request fields and read scope accepted by the trusted backend.', 'Validated filter, trusted caller scope, pagination and time limits. Exact schema unresolved.'),
      result('records', 'Permitted retrieved topics', 'retrieve', 'Matching permitted topics and pagination state, including a valid empty result.', 'Agreed record identifiers, required fields, ordering and page metadata. Exact schema unresolved.'),
      result('candidate', 'Proposed saved selection', 'prepare', 'The logical candidate revised only by the declared correction step.', 'Selected permitted topic identifiers and required review fields. Exact schema unresolved.'),
      result('selection-findings', 'Selection check findings', 'check', 'Expected check findings for the candidate revision. No observed findings are supplied.', 'Criteria results, candidate revision and passed, changes requested or unknown outcome.'),
      result('save-authorization', 'Separate save decision', 'authorize', 'Planned authority decision about the current candidate and evidence.', 'Authority, scope, candidate revision and decision. Actual authority and policy unresolved.'),
      result('save-result', 'Backend save outcome', 'save', 'Confirmed or uncertain backend write outcome, not an agent inference.', 'Backend operation identity, saved identifier where confirmed, duplicate or uncertain state. Exact schema unresolved.'),
      result('resolved-save-outcome', 'Resolved backend operation outcome', 'reconcile', 'The supplied save outcome or a read only lookup of the original operation, without replaying a write.', 'Original backend operation identity, confirmed saved identifier and complete outcome. Missing or uncertain outcomes do not proceed. Exact lookup contract unresolved.'),
      result('save-findings', 'Stored outcome check findings', 'confirm', 'Expected verification of the saved outcome against the authorized candidate.', 'Candidate and stored revisions, checked identifier, observed outcome and source. No observation supplied.'),
      result('response', 'Reported confirmed outcome', 'report', 'Response reporting only the checked operation outcome.', 'Confirmed saved identifier or explicit unresolved state. Exact response schema unresolved.'),
    ],
    checks: [
      { id: 'selection-check', stepId: 'check', candidateId: 'candidate', criteria: ['Only permitted retrieved topic identifiers are selected.', 'Required review fields match the agreed contract.', 'The exact candidate revision is identified.'], evidenceResultId: 'selection-findings', outcomes: ['passed', 'changes-requested', 'unknown'], method: 'code', revisionPolicy: 'recheck-after-change' },
      { id: 'stored-check', stepId: 'confirm', candidateId: 'resolved-save-outcome', criteria: ['Backend confirms the saved identifier and agreed outcome.', 'Stored content matches the separately authorized candidate.', 'An uncertain write is not reported as completion.'], evidenceResultId: 'save-findings', outcomes: ['passed', 'failed', 'unknown'], method: 'code', revisionPolicy: 'recheck-after-change' },
    ],
    transitions: [
      route('validate', 'valid', 'step', 'retrieve'), route('validate', 'missing-information', 'terminal', 'more-information'), route('validate', 'unauthorized', 'terminal', 'stopped'),
      route('retrieve', 'retrieved', 'step', 'prepare'), route('retrieve', 'empty', 'terminal', 'more-information'), route('retrieve', 'partial', 'terminal', 'more-information'), route('retrieve', 'unavailable', 'terminal', 'stopped'), route('retrieve', 'unauthorized', 'terminal', 'stopped'),
      route('prepare', 'ready', 'step', 'check'), route('prepare', 'failed', 'terminal', 'stopped'),
      route('check', 'passed', 'step', 'authorize'), route('check', 'changes-requested', 'step', 'correct'), route('check', 'unknown', 'terminal', 'more-information'),
      route('correct', 'revised', 'step', 'check'), route('correct', 'blocked', 'terminal', 'stopped'),
      route('authorize', 'accepted', 'step', 'save'), route('authorize', 'changes-requested', 'terminal', 'more-information'), route('authorize', 'declined', 'terminal', 'stopped'), route('authorize', 'unavailable', 'terminal', 'more-information'),
      route('save', 'stored', 'step', 'reconcile'), route('save', 'unauthorized', 'terminal', 'stopped'), route('save', 'failed', 'terminal', 'stopped'), route('save', 'unknown', 'step', 'reconcile'), route('save', 'partial', 'step', 'reconcile'),
      route('reconcile', 'confirmed', 'step', 'confirm'), route('reconcile', 'unknown', 'terminal', 'more-information'), route('reconcile', 'unavailable', 'terminal', 'more-information'), route('reconcile', 'failed', 'terminal', 'stopped'),
      route('confirm', 'passed', 'step', 'report'), route('confirm', 'failed', 'terminal', 'stopped'), route('confirm', 'unknown', 'terminal', 'more-information'),
      route('report', 'reported', 'terminal', 'complete'), route('report', 'failed', 'terminal', 'stopped'),
    ],
    corrections: [{ id: 'selection-correction', decisionStepId: 'check', outcome: 'changes-requested', correctionStepId: 'correct', checkStepId: 'check', candidateId: 'candidate', feedbackResultId: 'selection-findings', maxCorrections: 2, exhaustedTerminalId: 'exhausted' }],
    approvals: [{ id: 'save-approval', stepId: 'authorize', authority: '', candidateId: 'candidate', evidenceResultIds: ['selection-findings'], revisionPolicy: 'reapprove-after-change' }],
    terminals: [{ id: 'complete', name: 'Saved selection confirmed and reported', status: 'completed' }, { id: 'more-information', name: 'Clarify missing or uncertain outcome', status: 'needs-information' }, { id: 'stopped', name: 'Stop with findings, no completion claim', status: 'stopped' }, { id: 'exhausted', name: 'Proposed correction limit reached', status: 'stopped' }],
  };
  config.workflowModel.processes.push(process);
  return config;
}

function shapeIssues(config, version = SCHEMA_VERSION) {
  const legacy = version === '1.0';
  const issues = [];
  const issue = (path, message) => issues.push({ severity: 'error', code: 'schema', path, message });
  const object = (value, path, keys) => {
    if (!plainObject(value)) { issue(path, 'Expected an object.'); return false; }
    for (const key of Object.keys(value)) if (!keys.includes(key)) issue(`${path}.${key}`, 'Unknown field. This version cannot preserve it.');
    for (const key of keys) if (!Object.hasOwn(value, key)) issue(`${path}.${key}`, 'Required field is missing.');
    return true;
  };
  const string = (value, path, limit = 20000) => {
    if (typeof value !== 'string') issue(path, 'Expected text.');
    else if (value.length > limit) issue(path, `Text exceeds the ${limit} character limit.`);
    else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) issue(path, 'Control characters are not supported.');
  };
  const boolean = (value, path) => { if (typeof value !== 'boolean') issue(path, 'Expected true or false.'); };
  const array = (value, path, max = 100) => {
    if (!Array.isArray(value)) { issue(path, 'Expected an array.'); return false; }
    if (value.length > max) issue(path, `At most ${max} entries are supported.`);
    return true;
  };
  const list = (value, path, max = 100) => { if (array(value, path, max)) value.forEach((item, index) => string(item, `${path}[${index}]`, 200)); };
  const mapping = (value, path, validKeys, check) => {
    if (!plainObject(value)) { issue(path, 'Expected a named mapping.'); return; }
    if (Object.keys(value).length > 100) issue(path, 'At most 100 entries are supported.');
    for (const [key, item] of Object.entries(value)) {
      if (!validKeys.includes(key)) issue(`${path}.${key}`, 'Unknown stage or question. This version cannot preserve its settings.');
      check(item, `${path}.${key}`);
    }
  };
  const baseKeys = ['schemaVersion', 'project', 'components', 'workflow', 'skills', 'agents', 'practices', 'constraints'];
  if (!object(config, '$', legacy ? baseKeys : [...baseKeys, 'facts', 'evidence', 'model', 'runtime', ...(version === '3.0' ? ['workflowModel'] : [])])) return issues;
  if (config.schemaVersion !== version) issue('schemaVersion', `Unsupported schema version. Expected ${version}.`);
  if (version === '3.0') issues.push(...workflowModelShapeIssues(config.workflowModel));
  if (object(config.project, 'project', ['name', 'purpose', 'host', 'sourceControl', 'sourceLocations'])) for (const key of Object.keys(config.project)) string(config.project[key], `project.${key}`, key === 'name' ? 200 : 20000);
  if (array(config.components, 'components', 30)) config.components.forEach((component, index) => {
    const path = `components[${index}]`;
    if (!object(component, path, ['id', 'name', 'path', 'technologies', 'commands'])) return;
    for (const key of ['id', 'name', 'path']) string(component[key], `${path}.${key}`, 200);
    if (array(component.technologies, `${path}.technologies`, 40)) component.technologies.forEach((technology, i) => { if (object(technology, `${path}.technologies[${i}]`, ['id', 'version'])) for (const key of ['id', 'version']) string(technology[key], `${path}.technologies[${i}].${key}`, 200); });
    if (object(component.commands, `${path}.commands`, ['test', 'lint', 'build'])) for (const key of ['test', 'lint', 'build']) string(component.commands[key], `${path}.commands.${key}`, 4000);
  });
  const reviewFields = version === '3.0' && Object.hasOwn(config.workflow || {}, 'intentReview') ? ['intentReview'] : [];
  if (object(config.workflow, 'workflow', legacy ? ['recipe', 'enabledStages', 'notes'] : ['recipe', 'enabledStages', 'notes', 'bindings', 'suppliedInputs', 'answers', ...reviewFields])) {
    string(config.workflow.recipe, 'workflow.recipe', 200);
    list(config.workflow.enabledStages, 'workflow.enabledStages', 30);
    const stageIds = (legacy ? getStages('feature-delivery') : stages).map(stage => stage.id);
    mapping(config.workflow.notes, 'workflow.notes', stageIds, string);
    if (!legacy) {
      mapping(config.workflow.suppliedInputs, 'workflow.suppliedInputs', stageIds, string);
      mapping(config.workflow.answers, 'workflow.answers', [...CATALOG.recipes.flatMap(recipe => recipe.questions.map(question => question.id)), ...CATALOG.technologyProfiles.flatMap(profile => profile.questions.map((question, index) => `technology-${profile.id}-${index}`))], string);
      if (reviewFields.length) issues.push(...intentReviewIssues(config.workflow.intentReview));
      mapping(config.workflow.bindings, 'workflow.bindings', stageIds, (binding, path) => {
        if (!object(binding, path, ['actorType', 'actorId', 'actorName', 'skills', 'contextOnly'])) return;
        for (const key of ['actorType', 'actorId', 'actorName']) string(binding[key], `${path}.${key}`, 200);
        list(binding.skills, `${path}.skills`, 30); boolean(binding.contextOnly, `${path}.contextOnly`);
      });
    }
  }
  list(config.skills, 'skills', 30); list(config.practices, 'practices', 30);
  if (array(config.agents, 'agents', 30)) config.agents.forEach((agent, i) => { if (object(agent, `agents[${i}]`, ['role', 'tools'])) { string(agent.role, `agents[${i}].role`, 200); list(agent.tools, `agents[${i}].tools`, 30); } });
  if (object(config.constraints, 'constraints', ['approvalRequired', 'readOnly', 'notes'])) { boolean(config.constraints.approvalRequired, 'constraints.approvalRequired'); boolean(config.constraints.readOnly, 'constraints.readOnly'); string(config.constraints.notes, 'constraints.notes'); }
  if (legacy) return issues;
  if (array(config.facts, 'facts', 100)) config.facts.forEach((fact, i) => { const path = `facts[${i}]`; if (object(fact, path, ['id', 'claim', 'status', 'source', 'revision', 'reviewer', 'notes'])) for (const key of Object.keys(fact)) string(fact[key], `${path}.${key}`, ['id', 'status', 'revision', 'reviewer'].includes(key) ? 200 : 20000); });
  if (array(config.evidence, 'evidence', 100)) config.evidence.forEach((record, i) => { const path = `evidence[${i}]`; if (object(record, path, ['id', 'stageId', 'check', 'expected', 'observed', 'status', 'method', 'source', 'reviewer'])) for (const key of Object.keys(record)) string(record[key], `${path}.${key}`, ['id', 'stageId', 'status', 'method', 'reviewer'].includes(key) ? 200 : 20000); });
  if (object(config.model, 'model', ['name', 'version', 'budget', 'notes'])) for (const key of Object.keys(config.model)) string(config.model[key], `model.${key}`);
  const runtimeFields = ['outcome', 'requiredInputs', 'judgment', 'tools', 'validation', 'limits', 'duplicates', 'failures', 'confirmation'];
  if (object(config.runtime, 'runtime', ['enabled', ...runtimeFields, 'controls'])) {
    boolean(config.runtime.enabled, 'runtime.enabled'); for (const key of runtimeFields) string(config.runtime[key], `runtime.${key}`);
    if (array(config.runtime.controls, 'runtime.controls', 30)) config.runtime.controls.forEach((control, i) => { const path = `runtime.controls[${i}]`; if (object(control, path, ['id', 'label', 'status', 'implementation', 'evidenceId'])) for (const key of Object.keys(control)) string(control[key], `${path}.${key}`); });
  }
  return issues;
}

function migrateLegacy(config) {
  const next = createDefault();
  for (const key of ['project', 'components', 'skills', 'agents', 'practices', 'constraints']) next[key] = clone(config[key]);
  next.workflow.recipe = config.workflow.recipe;
  next.workflow.enabledStages = [...config.workflow.enabledStages];
  next.workflow.notes = clone(config.workflow.notes);
  for (const stage of getStages()) {
    const binding = next.workflow.bindings[stage.id];
    binding.skills = stage.defaultSkills.filter(id => config.skills.includes(id));
    if (binding.actorType === 'agent' && !config.agents.some(agent => agent.role === binding.actorId)) Object.assign(binding, { actorType: 'human', actorId: '', actorName: 'Workflow owner, confirm migrated assignment' });
  }
  return next;
}

export function serializeProject(config) {
  const structural = shapeIssues(config);
  if (structural.length) throw new Error(`${structural[0].path}: ${structural[0].message}`);
  const malformed = workflowModelIssues(config).find(issue => issue.blocking);
  if (malformed) throw new Error(`${malformed.path}: ${malformed.message}`);
  const content = json(config);
  if (bytes(content) > PROJECT_JSON_MAX_BYTES) throw new Error('Project settings exceed the 8 MiB JSON limit. Reduce the supplied project text before exporting. No text was truncated.');
  return content;
}

export function parseImport(text) {
  if (typeof text !== 'string' || bytes(text) > PROJECT_JSON_MAX_BYTES) throw new Error('Import must be JSON text no larger than 8 MiB.');
  let config;
  try { config = JSON.parse(text); } catch { throw new Error('The file is not valid JSON.'); }
  if (config?.schemaVersion === '1.0') {
    const legacyIssues = shapeIssues(config, '1.0');
    if (legacyIssues.length) throw new Error(`${legacyIssues[0].path}: ${legacyIssues[0].message}`);
    config = migrateLegacy(config);
  }
  if (config?.schemaVersion === '2.0') {
    const previousIssues = shapeIssues(config, '2.0');
    if (previousIssues.length) throw new Error(`${previousIssues[0].path}: ${previousIssues[0].message}`);
    config = { ...config, schemaVersion: SCHEMA_VERSION, workflowModel: createWorkflowModel() };
  }
  const structural = shapeIssues(config);
  if (structural.length) throw new Error(`${structural[0].path}: ${structural[0].message}`);
  const unsupported = ruleIssues(config).find(issue => ['unknown-host', 'unknown-source-control', 'unknown-recipe', 'unknown-selection', 'unknown-role', 'unknown-tool', 'unknown-actor', 'unknown-status', 'unknown-method', 'duplicate-component', 'duplicate-technology', 'duplicate-agent', 'duplicate-selection', 'duplicate-tool', 'duplicate-record', 'component-id', 'record-id'].includes(issue.code));
  if (unsupported) throw new Error(`${unsupported.path}: ${unsupported.message}`);
  serializeProject(config);
  return config;
}

const safeComponentPath = value => value === '.' || (present(value) && !/^[\\/]|^[a-z]:/i.test(value) && !value.includes('\\') && !value.split('/').some(segment => !segment || segment === '..' || segment === '.') && !/[<>:"|?*\u0000-\u001f]/.test(value) && !value.split('/').some(segment => /[. ]$/.test(segment) || /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(segment)));
const safeOutputPath = value => safeComponentPath(value) && value !== '.';

export function getEffectiveSkills(config) {
  const selected = new Set([...config.skills, ...getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id)).flatMap(stage => config.workflow.bindings[stage.id]?.skills || []), ...customAssignments(config).flatMap(({ step }) => step.instructionIds)]);
  return skills.filter(skill => selected.has(skill.id));
}

function customAssignments(config, skillId) {
  return (config.workflowModel?.processes || []).filter(process => process.source === 'custom').flatMap(process => process.steps.filter(step => !skillId || step.instructionIds.includes(skillId)).map(step => ({ process, step })));
}

function customRoleAssignments(config, roleId) {
  return customAssignments(config).filter(({ process, step }) => process.kind !== 'application' && step.actor.type === 'agent' && step.actor.id === roleId);
}

const customBinding = step => ({ actorType: step.actor.type, actorId: step.actor.id, actorName: step.actor.name, contextOnly: step.actor.contextOnly });
const stepReference = ({ process, step }) => `${process.id}/${step.id}`;
const customLabel = ({ process, step }) => `${process.name || process.id} / ${step.name || step.id}`;
const customActorText = step => `${step.actor.type}: ${placeholder(step.actor.name || step.actor.id, 'actor')}${step.actor.contextOnly ? ', review of supplied artifacts only' : ''}`;

export function getTechnologyProfiles(config) {
  const tech = new Set(config.components.flatMap(component => component.technologies.map(item => item.id)));
  const specific = CATALOG.technologyProfiles.filter(profile => profile.id !== 'generic' && profile.technologies.some(id => tech.has(id)));
  return [CATALOG.technologyProfiles[0], ...specific];
}

function ruleIssues(config, outputKind = 'pack') {
  const issues = [];
  const add = (severity, code, path, message) => issues.push({ severity, code, path, message });
  const error = (code, path, message) => add('error', code, path, message);
  const warning = (code, path, message) => add('warning', code, path, message);
  if (getIntentReview(config).stale) warning('stale-intent-review', 'workflow.intentReview', 'Recorded intent clarifications refer to earlier wording or a different recipe. They are retained but not applied. Review the current brief before confirming them again.');
  if (bytes(json(config)) > PROJECT_JSON_MAX_BYTES) error('project-size', '$', 'Project settings exceed the 8 MiB JSON limit. Reduce the supplied project text. No text was truncated.');
  function selection(values, catalog, path) {
    const seen = new Set();
    values.forEach((id, i) => { if (!catalog.some(item => item.id === id)) error('unknown-selection', `${path}[${i}]`, `Unknown selection: ${id}.`); if (seen.has(id)) error('duplicate-selection', `${path}[${i}]`, 'Selections must be unique.'); seen.add(id); });
  }
  for (const field of ['name', 'purpose']) if (!present(config.project[field])) error('missing-value', `project.${field}`, `Project ${field} must be supplied.`);
  if (!present(config.project.sourceLocations) && !config.facts.some(fact => present(fact.source))) error('missing-value', 'project.sourceLocations', 'Supply source locations or source linked project facts.');
  const copilotOutput = outputKind === 'pack' && config.agents.some(agent => roles.some(role => role.id === agent.role));
  if (config.project.host === '') {
    if (copilotOutput) error('missing-environment', 'project.host', 'Choose the intended Copilot environment before adopting custom agent profiles. A blueprint or portable skill can keep this unresolved.');
  } else if (!CATALOG.hosts.some(host => host.id === config.project.host)) error('unknown-host', 'project.host', 'Choose a supported Copilot environment.');
  if (config.project.sourceControl === '') {
    if (copilotOutput) error('missing-source-control', 'project.sourceControl', 'Choose the actual source control before adopting custom agent profiles. A blueprint or portable skill can keep this unresolved.');
  } else if (!['github', 'bitbucket', 'other'].includes(config.project.sourceControl)) error('unknown-source-control', 'project.sourceControl', 'Choose a supported source control value.');
  if (config.project.host === 'github' && config.project.sourceControl && config.project.sourceControl !== 'github') error('cloud-repository', 'project.sourceControl', 'Copilot cloud agent requires a repository stored on GitHub. Choose an IDE environment for a Bitbucket or other repository.');
  if (copilotOutput && config.project.host === 'jetbrains') warning('preview-host', 'project.host', 'GitHub documents custom agents in JetBrains as public preview. Exercise discovery and tool behavior in the installed plugin.');
  if (!lookupRecipe(config.workflow.recipe)) error('unknown-recipe', 'workflow.recipe', 'Choose a supported workflow recipe.');
  selection(config.workflow.enabledStages, getStages(config.workflow.recipe), 'workflow.enabledStages');
  selection(config.skills, skills, 'skills'); selection(config.practices, practices, 'practices');
  if (config.workflowModel.processes.some(process => process.source === 'recipe') && !config.workflow.enabledStages.length) error('missing-stage', 'workflow.enabledStages', 'Select at least one workflow stage.');
  const enabled = getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id));
  for (const stage of enabled) {
    for (const prerequisite of stage.dependsOn) if (!config.workflow.enabledStages.includes(prerequisite) && !present(config.workflow.suppliedInputs[prerequisite])) error('stage-dependency', `workflow.suppliedInputs.${prerequisite}`, `${stage.title} needs the ${lookupStage(prerequisite).title} output. Enable that stage or supply an existing artifact location.`);
    const binding = config.workflow.bindings[stage.id];
    if (!binding) { error('missing-binding', `workflow.bindings.${stage.id}`, 'Assign an actor and skills to this stage.'); continue; }
    const path = `workflow.bindings.${stage.id}`;
    if (!['human', 'agent', 'external'].includes(binding.actorType)) error('unknown-actor', `${path}.actorType`, 'Choose a human, agent or external system.');
    selection(binding.skills, skills, `${path}.skills`);
    if (binding.actorType === 'agent') {
      const actor = config.agents.find(agent => agent.role === binding.actorId);
      if (!actor) error('missing-actor', `${path}.actorId`, 'Select an agent role or change the responsible actor.');
      else if (!binding.contextOnly) for (const capability of stage.capabilities) if (!actor.tools.includes(capability)) error('stage-capability', `${path}.actorId`, `${stage.title} needs ${capability} when the agent performs this stage. Supply that capability, assign another actor or explicitly use supplied context only.`);
      if (binding.contextOnly) warning('context-only-stage', `${path}.contextOnly`, 'This assignment is a review of supplied artifacts only. A named person or external system must perform any changes or execution and provide the actual outputs and observed results.');
    } else if (!present(binding.actorName)) error('missing-actor', `${path}.actorName`, 'Name the responsible person or external system.');
    const extra = binding.skills.filter(id => !stage.defaultSkills.includes(id));
    if (extra.length) warning('skill-override', `${path}.skills`, `Additional stage skills selected: ${extra.join(', ')}. Review whether their guidance applies here.`);
  }
  for (const id of config.skills) if (outputKind !== 'blueprint' && !enabled.some(stage => config.workflow.bindings[stage.id]?.skills.includes(id)) && !customAssignments(config, id).length) warning('library-skill', 'skills', `${id} is an additional library skill. It is exported without assigning it to every agent.`);
  const usedAgents = new Set([...enabled.filter(stage => config.workflow.bindings[stage.id]?.actorType === 'agent').map(stage => config.workflow.bindings[stage.id].actorId), ...customAssignments(config).filter(({ process, step }) => process.kind !== 'application' && step.actor.type === 'agent').map(({ step }) => step.actor.id)]);
  const roleSeen = new Set();
  config.agents.forEach((agent, i) => {
    const relevantProfile = outputKind !== 'blueprint' || usedAgents.has(agent.role);
    if (!roles.some(role => role.id === agent.role)) error('unknown-role', `agents[${i}].role`, 'Choose a supported role.');
    if (roleSeen.has(agent.role)) error('duplicate-agent', `agents[${i}].role`, 'Select each agent role once.'); roleSeen.add(agent.role);
    const seen = new Set();
    for (const tool of agent.tools) {
      if (!TOOL_ALIASES.includes(tool)) error('unknown-tool', `agents[${i}].tools`, `Unsupported tool alias: ${tool}.`);
      if (seen.has(tool)) error('duplicate-tool', `agents[${i}].tools`, 'Tool aliases must be unique.'); seen.add(tool);
      if (config.project.host === 'github' && ['web', 'todo'].includes(tool)) error('cloud-tool', `agents[${i}].tools`, `${tool} is documented as unavailable for Copilot cloud agent.`);
      if (relevantProfile && config.constraints.readOnly && ['edit', 'execute', 'agent'].includes(tool)) error('read-only-conflict', `agents[${i}].tools`, `The read only boundary conflicts with ${tool}. Execution and delegation can also cause changes.`);
    }
    if (relevantProfile && !agent.tools.length) warning('no-tools', `agents[${i}].tools`, 'An explicit empty tools list disables tools. Context-only work can still be appropriate.');
    if (outputKind !== 'blueprint' && !usedAgents.has(agent.role)) warning('unassigned-agent', `agents[${i}]`, 'This profile has no assigned stage. It is retained as an explicit user selection.');
  });
  const needsCommand = kind => enabled.some(stage => (kind === 'test' ? ['verification', 'reproduction', 'regression'].includes(stage.id) : stage.id === 'release') && config.workflow.bindings[stage.id]?.actorType === 'agent' && !config.workflow.bindings[stage.id]?.contextOnly);
  if (!config.components.length) {
    const requiredCommands = ['test', 'build'].filter(needsCommand);
    if (requiredCommands.length) error('missing-component', 'components', `Agent-run ${requiredCommands.join(' and ')} checks need a repository component with its actual commands. Add that component, use supplied context only or assign the checks to a person or external system.`);
    else if (getStages(config).length) warning('missing-component', 'components', 'No repository components supplied. This can be appropriate for a process study or supplied-context review.');
  }
  const componentSeen = new Set();
  config.components.forEach((component, i) => {
    const path = `components[${i}]`;
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(component.id)) error('component-id', `${path}.id`, 'Component id must use lowercase letters, numbers and single hyphens.');
    if (componentSeen.has(component.id.toLowerCase())) error('duplicate-component', `${path}.id`, 'Component ids must be unique.'); componentSeen.add(component.id.toLowerCase());
    if (!present(component.name)) error('missing-value', `${path}.name`, 'Component name must be supplied.');
    if (!present(component.path)) error('missing-value', `${path}.path`, 'Supply a repository relative path. Use . for the root.');
    else if (!safeComponentPath(component.path)) error('unsafe-component-path', `${path}.path`, 'Use a portable repository relative path with forward slashes. Absolute paths, parent traversal and reserved names are not supported.');
    if (!component.technologies.length) warning('missing-technology', `${path}.technologies`, 'Technology is unresolved. Generic questions remain available.');
    const techSeen = new Set();
    component.technologies.forEach((technology, j) => {
      const techPath = `${path}.technologies[${j}]`;
      if (!present(technology.id)) error('missing-technology', `${techPath}.id`, 'Supply a technology name.');
      else if (!CATALOG.technologies.some(item => item.id === technology.id)) warning('custom-technology', `${techPath}.id`, 'Custom technology recorded. Generic guidance applies without a compatibility claim.');
      if (techSeen.has(technology.id.trim().toLowerCase())) error('duplicate-technology', `${techPath}.id`, 'Select each technology once per component, ignoring letter case.'); techSeen.add(technology.id.trim().toLowerCase());
      if (!present(technology.version)) warning('unspecified-version', `${techPath}.version`, 'Confirm the relevant version before using version dependent guidance.');
    });
    for (const kind of ['test', 'build']) if (needsCommand(kind) && !present(component.commands[kind])) error('missing-command', `${path}.commands.${kind}`, `Supply the actual ${kind} command for the assigned agent. Commands are not inferred from technologies.`);
    if (!present(component.commands.lint)) warning('optional-command', `${path}.commands.lint`, 'No lint command supplied. This check remains unconfigured.');
  });
  for (const question of (getStages(config).length ? lookupRecipe(config.workflow.recipe)?.questions : []) || []) if (!present(getIntentAnswer(config, question.id).text)) warning('unanswered-question', `workflow.answers.${question.id}`, `${question.label} remains unresolved.`);
  function records(items, path, statuses) {
    const seen = new Set();
    items.forEach((record, i) => { if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(record.id)) error('record-id', `${path}[${i}].id`, 'Record ids must use lowercase letters, numbers and single hyphens.'); if (seen.has(record.id)) error('duplicate-record', `${path}[${i}].id`, 'Record ids must be unique.'); seen.add(record.id); if (!statuses.includes(record.status)) error('unknown-status', `${path}[${i}].status`, 'Choose a supported record status.'); });
  }
  records(config.facts, 'facts', CATALOG.factStatuses);
  config.facts.forEach((fact, i) => {
    if (!present(fact.claim)) error('missing-value', `facts[${i}].claim`, 'Describe the fact or unresolved question.');
    if (fact.status === 'confirmed' && (!present(fact.source) || !present(fact.reviewer))) error('unsupported-confirmation', `facts[${i}]`, 'A user-confirmed fact needs a source and reviewer. The factory does not verify that confirmation.');
    if (['detected', 'inferred'].includes(fact.status) && !present(fact.source)) warning('missing-source', `facts[${i}].source`, 'Record the source of this detection or inference.');
  });
  records(config.evidence, 'evidence', CATALOG.evidenceStatuses);
  config.evidence.forEach((record, i) => {
    const path = `evidence[${i}]`;
    if (record.stageId && !stages.some(stage => stage.id === record.stageId)) error('unknown-selection', `${path}.stageId`, 'Assign evidence to a known stage or leave it at project level.');
    if (!['user-recorded', 'tool-observed'].includes(record.method)) error('unknown-method', `${path}.method`, 'Choose user-recorded or externally tool-observed evidence.');
    if (!present(record.check)) error('missing-value', `${path}.check`, 'Describe the check.');
    if (['recorded', 'passed', 'failed'].includes(record.status) && (!present(record.observed) || !present(record.source))) error('unsupported-evidence', path, 'Recorded outcomes need an observed result and source. An expected check is not a result.');
    if (['passed', 'failed'].includes(record.status) && !present(record.reviewer)) error('unsupported-evidence', `${path}.reviewer`, 'Name who accepted this supplied assessment.');
    if (record.method === 'tool-observed') warning('external-evidence', `${path}.method`, 'Tool-observed describes the supplied external record. Atlas has not independently executed or authenticated it.');
    if (['planned', 'not-run'].includes(record.status) && present(record.observed)) warning('evidence-status', path, 'An observation is supplied while the check is planned or unrun. Review the status.');
  });
  records(config.runtime.controls, 'runtime.controls', CATALOG.controlStatuses);
  if (config.runtime.enabled) {
    for (const key of ['outcome', 'requiredInputs', 'judgment', 'tools', 'validation', 'limits', 'duplicates', 'failures', 'confirmation']) if (!present(config.runtime[key])) warning('runtime-question', `runtime.${key}`, 'This runtime design decision remains unresolved.');
    config.runtime.controls.forEach((control, i) => {
      if (['implementation-linked', 'evidence-recorded'].includes(control.status) && !present(control.implementation)) error('unsupported-control', `runtime.controls[${i}].implementation`, 'Link the actual implementation before recording this status.');
      if (control.status === 'evidence-recorded') {
        const record = config.evidence.find(record => record.id === control.evidenceId);
        if (!record || !['recorded', 'passed', 'failed'].includes(record.status) || !present(record.observed) || !present(record.source)) error('unsupported-control', `runtime.controls[${i}].evidenceId`, 'Choose an evidence record with a supplied observed result and source. Recorded evidence may still fail.');
      }
    });
  }
  if (config.agents.some(agent => agent.tools.includes('execute') && (outputKind !== 'blueprint' || usedAgents.has(agent.role)))) warning('execute-boundary', 'agents', 'Execute permits shell commands that can write files. These instructions cannot restrict execution to supplied commands.');
  if (config.constraints.notes) warning('free-text-review', 'constraints.notes', 'Free text constraints require human review. Their consistency is not established by the factory.');
  issues.push(...workflowModelIssues(config));
  config.workflowModel.processes.forEach((process, processIndex) => {
    if (process.source !== 'custom') return;
    process.steps.forEach((step, stepIndex) => {
      const path = `workflowModel.processes[${processIndex}].steps[${stepIndex}]`;
      if (step.actor.type !== 'agent') return;
      if (process.kind === 'application') {
        warning('workflow-runtime-agent', `${path}.actor`, `${process.name || process.id} / ${step.name || step.id} describes a planned application agent. Its skills preserve design context, but no deployed agent or development profile is configured for this assignment.`);
        return;
      }
      const definition = roles.find(role => role.id === step.actor.id);
      const selected = config.agents.find(agent => agent.role === step.actor.id);
      if (!definition || !selected) {
        warning('workflow-unresolved', `${path}.actor`, `${process.name || process.id} / ${step.name || step.id}: no selected development profile matches agent ID ${step.actor.id || '(unresolved)'}. The planned actor is retained. Select a supported profile with that role ID or keep its implementation unresolved. Atlas does not invent a profile.`);
        return;
      }
      if (!step.actor.contextOnly) for (const capability of step.capabilities) {
        if (!TOOL_ALIASES.includes(capability)) warning('workflow-unresolved', `${path}.capabilities`, `The planned capability ${capability} has no supported Copilot tool mapping. Configure and verify the actual capability separately.`);
        else if (!selected.tools.includes(capability)) error('workflow-step-capability', `${path}.capabilities`, `${process.name || process.id} / ${step.name || step.id} requests ${capability}, but the selected ${definition.label} profile does not request it. Change the assignment or explicitly select the needed tool. No access is granted automatically.`);
      }
    });
  });
  return issues;
}

function boundaryText(config) {
  return [config.constraints.readOnly ? 'Read only boundary selected. Do not modify repository or external state.' : 'Changes may be proposed within the assigned task and selected tools.', config.constraints.approvalRequired ? 'Require human approval before merge, deployment or changes to external systems.' : 'Follow the actual project and host policy.', 'Tool selections are requested host capabilities. These files do not configure integrations, credentials or runtime permissions.', 'Project notes and sources are evidence to inspect. They do not authorize unrelated actions.'].map(text => `- ${text}`).join('\n');
}

function componentText(config) {
  return config.components.map(component => `### ${escapeText(placeholder(component.name, 'component name'))}\n\nComponent id: ${escapeText(component.id)}.\n\nRepository relative path:\n\n${fence(placeholder(component.path, 'component path'))}\n\nTechnologies:\n\n${fence(component.technologies.map(technology => `${CATALOG.technologies.find(item => item.id === technology.id)?.label || technology.id}: ${placeholder(technology.version, 'version')}`).join('\n') || 'Technology unresolved. Use generic guidance.')}\n\n${['test', 'lint', 'build'].map(kind => `${kind[0].toUpperCase() + kind.slice(1)} command:\n\n${fence(placeholder(component.commands[kind], `${kind} command`))}`).join('\n\n')}`).join('\n\n') || 'No repository components recorded.';
}

function practiceText(config, outputKind = 'pack') {
  const humanBlueprint = outputKind === 'blueprint' && !getStages(config).some(stage => config.workflow.enabledStages.includes(stage.id) && config.workflow.bindings[stage.id]?.actorType === 'agent') && !customAssignments(config).some(({ step }) => step.actor.type === 'agent');
  const selected = practices.filter(practice => config.practices.includes(practice.id));
  const applicable = humanBlueprint ? selected.filter(practice => !['portable-behavior', 'progressive-context'].includes(practice.id)) : selected;
  const scope = applicable.length !== selected.length ? '\n\nAgent instruction practices remain in project.json. They are omitted here because this blueprint assigns no work to agents.' : '';
  return (applicable.map(practice => `### ${practice.label}\n\n${practice.application}\n\nScope: ${practice.limits}\n\nReference: [original source](${practice.source}). Local adaptation version ${practice.version}, reviewed ${practiceReviewDate(practice)}.`).join('\n\n') || (humanBlueprint ? 'No additional practice guidance for this blueprint.' : 'No optional reference practices selected.')) + scope;
}

function factsText(config) {
  return config.facts.map(fact => `### ${escapeText(fact.id)}\n\n${fence(fact.claim)}\n\nStatus: ${escapeText(fact.status)}.\n\nSource and revision:\n\n${fence(`${placeholder(fact.source, 'source')}\nRevision or date: ${placeholder(fact.revision, 'revision')}`)}\n\nReviewer: ${escapeText(placeholder(fact.reviewer, 'reviewer'))}.\n\n${fence(fact.notes || 'No additional notes.')}\n`).join('\n') || 'No project facts recorded. Entered component values remain unverified project data.';
}

function profilesText(config) {
  return getTechnologyProfiles(config).map(profile => `### ${profile.label}\n\nQuestions and project supplied answers:\n\n${profile.questions.map((text, index) => `- ${text}\n\n${fence(placeholder(config.workflow.answers[`technology-${profile.id}-${index}`], 'project answer'))}`).join('\n\n')}\n\nExpected checks:\n\n${profile.checks.map(text => `- ${text}`).join('\n')}\n\nLimits: ${profile.limits}\n\nReferences: ${[profile.source, ...(profile.sources || [])].map((source, index) => `[primary source ${index + 1}](${source})`).join(', ')}.`).join('\n\n');
}

function actorText(binding) {
  if (!binding) return 'UNRESOLVED actor';
  return binding.actorType === 'agent' ? `Agent: ${roles.find(role => role.id === binding.actorId)?.label || binding.actorId}${binding.contextOnly ? ', review of supplied artifacts only' : ''}` : `${binding.actorType === 'external' ? 'External system' : 'Person'}: ${placeholder(binding.actorName, 'actor name')}`;
}

function intentText(config, excludedIds = []) {
  if (!getStages(config).length) return 'No development recipe is active. Use the recorded custom process purpose, inputs and acceptance criteria.';
  return (lookupRecipe(config.workflow.recipe)?.questions || []).filter(question => !excludedIds.includes(question.id)).map(question => {
    const answer = getIntentAnswer(config, question.id);
    return `### ${question.label}\n\n${answer.inherited ? 'Uses the recorded project outcome.\n\n' : ''}${fence(placeholder(answer.text, question.label))}`;
  }).join('\n\n');
}

function skillStages(config, skillId) {
  return getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id) && config.workflow.bindings[stage.id]?.skills.includes(skillId));
}

const suppliedContextOnly = binding => binding?.actorType === 'agent' && binding.contextOnly;
const assignmentScopePriority = 'The current recorded assignment takes priority over older stage notes or briefs about performing this work. Report conflicting scope instructions and request clarification before expanding the assignment.';
const suppliedReviewActions = [
  'Read supplied outputs and source records against the recorded scope and review criteria.',
  'Request missing outputs and observed results from the responsible person or external system. Missing evidence remains unresolved.',
  'Inspect only the supplied artifacts and attribute observations to their source.',
  'Report supported findings, missing evidence and conflicting scope instructions. Do not perform the underlying work or run its commands to fill evidence gaps.',
];

function skillAssignmentScope(binding) {
  if (suppliedContextOnly(binding)) return `Review supplied artifacts only. Do not perform the underlying work or claim independently executed checks. A person or external system must supply the outputs and observed results. ${assignmentScopePriority}`;
  if (binding?.actorType === 'agent') return 'Perform the assigned work only within the selected capabilities and project boundaries.';
  return 'The named person or external system performs this stage. This skill does not transfer the assignment to an agent.';
}

function customAssignmentScope({ process, step }) {
  const scope = step.actor.contextOnly ? `Review supplied artifacts only. Do not perform the underlying work, execute its checks or produce missing outputs. Another actor supplies actual results. ${assignmentScopePriority}` : skillAssignmentScope(customBinding(step));
  return `${scope}${process.kind === 'application' ? ' This is an application process design. These instructions do not deploy an agent, configure its runtime or transfer this task to a development profile.' : ''}`;
}

function destinationText(process, destination) {
  if (destination.type === 'unresolved') return '[UNRESOLVED: destination]';
  const record = (destination.type === 'step' ? process.steps : process.terminals).find(item => item.id === destination.id);
  return `${destination.type === 'terminal' ? 'End at' : 'Continue to'} ${record?.name || destination.id} (${process.id}/${destination.id})${destination.type === 'terminal' ? `, planned status ${record?.status || 'unresolved'}` : ''}`;
}

function correctionText(process, correction) {
  const named = id => `${process.steps.find(step => step.id === id)?.name || id} (${process.id}/${id})`;
  return `After ${named(correction.decisionStepId)} reports ${correction.outcome}, pass candidate ${correction.candidateId} and feedback ${correction.feedbackResultId} to ${named(correction.correctionStepId)}. Maximum corrections after the initial candidate: ${correction.maxCorrections ?? '[UNRESOLVED]'}. Count every entry into a correction attempt, including a failed attempt. Reset only for a new run. At the limit, ${destinationText(process, { type: 'terminal', id: correction.exhaustedTerminalId })}. Return each changed candidate to ${named(correction.checkStepId)}. Prior evidence remains historical and required approval must be obtained again. This is a design requirement, not an enforced counter.`;
}

function customSkillContext(config, skillId) {
  return customAssignments(config, skillId).map(assignment => {
    const { process, step } = assignment;
    const relevantResults = new Set([...step.inputIds, ...step.outputIds]);
    const checks = process.checks.filter(check => check.stepId === step.id || relevantResults.has(check.candidateId));
    const corrections = process.corrections.filter(correction => [correction.decisionStepId, correction.correctionStepId, correction.checkStepId].includes(step.id));
    const approvals = process.approvals.filter(approval => approval.stepId === step.id || relevantResults.has(approval.candidateId));
    checks.forEach(check => relevantResults.add(check.evidenceResultId));
    corrections.forEach(correction => relevantResults.add(correction.feedbackResultId));
    approvals.forEach(approval => approval.evidenceResultIds.forEach(id => relevantResults.add(id)));
    const records = process.results.filter(result => relevantResults.has(result.id)).map(result => `${result.name || result.id} (${process.id}/${result.id})\nMeaning: ${placeholder(result.description, 'result meaning')}\n${step.inputIds.includes(result.id) ? 'Required input. ' : ''}${step.outputIds.includes(result.id) ? 'Planned output. ' : ''}Initial producer: ${result.producerStepId ? `${process.id}/${result.producerStepId}` : `Supplied from ${placeholder(result.suppliedSource, 'source')}`}\nExpected structure: ${placeholder(result.expectedStructure, 'expected structure')}\nVersion policy: ${placeholder(result.versionPolicy, 'version policy')}\nRecorded revision: ${placeholder(result.version, 'revision')}\nConsumers: ${process.steps.filter(item => item.inputIds.includes(result.id)).map(item => `${process.id}/${item.id}`).join(', ') || 'None'}`).join('\n\n');
    const relatedStepIds = new Set([step.id, ...checks.map(check => check.stepId), ...approvals.map(approval => approval.stepId), ...corrections.flatMap(correction => [correction.decisionStepId, correction.correctionStepId, correction.checkStepId])]);
    const routes = process.steps.filter(item => relatedStepIds.has(item.id)).flatMap(item => item.outcomes.map(outcome => {
      const route = process.transitions.find(candidate => candidate.fromStepId === item.id && candidate.outcome === outcome);
      return `${process.id}/${item.id} / ${outcome}: ${destinationText(process, route?.to || { type: 'unresolved', id: '' })}`;
    })).join('\n');
    const evidence = config.workflowModel.evidenceLinks.filter(link => link.processId === process.id && checks.some(check => check.id === link.checkId)).map(link => {
      const record = config.evidence.find(item => item.id === link.evidenceId);
      return `Supplied evidence ${link.evidenceId}. Check ${link.checkId}, candidate ${link.resultId}, revision ${placeholder(link.candidateVersion, 'revision')}.\nStatus: ${record?.status || 'unresolved'}\nExpected: ${placeholder(record?.expected, 'expected result')}\nObserved: ${placeholder(record?.observed, 'observed result')}\nSource: ${placeholder(record?.source, 'source')}\nReviewer: ${placeholder(record?.reviewer, 'reviewer')}`;
    }).join('\n\n');
    return `### ${escapeText(customLabel(assignment))}\n\nProcess and step: ${escapeText(stepReference(assignment))}. Kind: ${process.kind}. Pattern: ${process.pattern.id}, version ${process.pattern.version}.\n\nPlanned actor: ${escapeText(customActorText(step))}.\n\n${customAssignmentScope(assignment)}\n\nRecorded action${step.actor.contextOnly ? ', background for supplied-context review only' : ''}:\n\n${fence(placeholder(step.action, 'action'))}\n\nRequested capabilities: ${step.capabilities.map(escapeText).join(', ') || 'None'}. Names do not provide access.\n\nInputs, outputs and related evidence definitions:\n\n${fence(records || 'None recorded.')}\n\nDeclared outcomes and destinations:\n\n${fence(routes || 'No routes recorded. Outcomes remain unresolved.')}\n\nRelated check requirements:\n\n${checks.map(check => fence(`Check ${check.id} at ${process.id}/${check.stepId}\nCandidate: ${check.candidateId}\nMethod: ${check.method}\nCriteria: ${check.criteria.length ? check.criteria.map(item => placeholder(item, 'criterion')).join('\n') : '[UNRESOLVED: criteria]'}\nExpected evidence: ${check.evidenceResultId}\nOutcomes: ${check.outcomes.join(', ')}\nA changed candidate must be checked again. Unavailable or unrun checks are not passes.`)).join('\n\n') || 'None recorded.'}\n\nCorrection requirements:\n\n${corrections.map(correction => fence(correctionText(process, correction))).join('\n\n') || 'No correction policy for this assignment.'}\n\nApproval requirements:\n\n${approvals.map(approval => fence(`At ${process.id}/${approval.stepId}, authority ${placeholder(approval.authority, 'approval authority')} reviews candidate ${approval.candidateId} and evidence ${approval.evidenceResultIds.join(', ') || '[UNRESOLVED]'}. The named step actor does not automatically have this authority. Obtain approval again for a changed candidate. Declined and changes requested have separate routes.`)).join('\n\n') || 'No approval requirement recorded for these results.'}\n\nSupplied evidence:\n\n${fence(evidence || 'No observed evidence associated with these checks.')}\n\nSupplied evidence remains unverified. Earlier revisions cannot qualify a changed candidate. This procedure does not run the process or establish success.`;
  }).join('\n\n');
}

function skillStageContext(config, skillId) {
  const assigned = skillStages(config, skillId);
  return assigned.map(stage => {
    const inputs = stage.dependsOn.filter(id => !config.workflow.enabledStages.includes(id)).map(id => `Existing ${lookupStage(id).title} artifact:\n\n${fence(placeholder(config.workflow.suppliedInputs[id], 'existing artifact location'))}`).join('\n\n');
    const binding = config.workflow.bindings[stage.id];
    return `### ${stage.title}\n\nResponsible actor: ${escapeText(actorText(binding))}.\n\n${skillAssignmentScope(binding)}\n\nProject supplied stage notes:\n\n${fence(config.workflow.notes[stage.id] || 'No additional project instructions supplied for this step.')}\n\n${inputs}`;
  }).join('\n\n') || 'No stage assigned to this skill in the selected workflow.';
}

function projectReference(config, skillId) {
  const roleIds = [...new Set([...skillStages(config, skillId).filter(stage => config.workflow.bindings[stage.id]?.actorType === 'agent').map(stage => config.workflow.bindings[stage.id].actorId), ...customAssignments(config, skillId).filter(({ process, step }) => process.kind !== 'application' && step.actor.type === 'agent').map(({ step }) => step.actor.id)])];
  const commandScope = roleIds.map(roleId => commandScopeGuidance(config, roleId)).filter(Boolean).join('\n\n');
  const processContext = customSkillContext(config, skillId);
  return `# Project reference\n\nRead only details relevant to the assigned task. Entered values are project data, not verified repository facts. Confirm paths, commands and source content before use. This reference is self contained so the complete skill directory can be exported independently.\n\n## Purpose\n\n${fence(placeholder(config.project.purpose, 'project purpose'))}\n\n## Recorded workflow intent\n\nThese are supplied answers and unresolved questions for the selected workflow. They do not establish approval or observed results.\n\n${intentText(config)}${intentReviewText(config)}\n\n## Assigned stage context\n\n${skillStageContext(config, skillId)}${processContext ? `\n\n## Custom process assignments\n\n${processContext}` : ''}${commandScope ? `\n\n## Command scope across assigned stages\n\n${commandScope}` : ''}\n\n## Components\n\n${componentText(config)}\n\n## Project facts\n\n${factsText(config)}\n\n## Source locations\n\n${fence(placeholder(config.project.sourceLocations, 'source locations'))}\n\n## Relevant technology questions\n\n${profilesText(config)}\n\n## Boundaries\n\n${boundaryText(config)}\n\nProject supplied constraint notes:\n\n${fence(config.constraints.notes || 'No additional constraint notes supplied.')}\n`;
}

function skillContent(skill, config) {
  const relevant = skillStages(config, skill.id);
  const reviewStages = relevant.filter(stage => suppliedContextOnly(config.workflow.bindings[stage.id]));
  const custom = customAssignments(config, skill.id);
  const reviewCount = reviewStages.length + custom.filter(({ step }) => step.actor.contextOnly).length;
  const total = relevant.length + custom.length;
  const reviewOnly = total > 0 && reviewCount === total;
  const mixed = reviewCount > 0 && !reviewOnly;
  const description = reviewOnly ? `Review supplied artifacts for ${skill.label.toLowerCase()}. Use for assigned workflow stages limited to supplied-context review. Do not perform the underlying work or claim independently executed checks.` : `${skill.description}${mixed ? ' Follow each recorded stage assignment. Some stages permit supplied-context review only.' : ''}`;
  const reviewSteps = [
    'Read the assigned stage context, recorded outcome and acceptance criteria in references/project.md.',
    'Request the existing outputs and observed results from the responsible person or external system. Missing evidence remains unresolved.',
    'Inspect only the supplied artifacts against the recorded scope and the review criteria below.',
    'Do not perform the underlying work, run its commands or modify repository or external state to produce missing evidence.',
    'Report supported findings, missing inputs and remaining uncertainty. Attribute supplied observations to their source rather than claiming you executed them.',
  ];
  const numbered = steps => steps.map((text, i) => `${i + 1}. ${text}`).join('\n');
  const procedure = [
    !reviewOnly && `${mixed ? '## Procedure for active assignments' : '## Procedure'}\n\n${mixed ? 'Use this procedure only for a stage assigned to perform the work. Use the review procedure below for stages limited to supplied context.\n\n' : ''}${numbered(skill.steps)}`,
    reviewCount > 0 && `## Procedure for supplied-context review\n\n${numbered(reviewSteps)}`,
  ].filter(Boolean).join('\n\n');
  const assignments = [...relevant.map(stage => { const binding = config.workflow.bindings[stage.id]; return `- ${stage.title}. ${escapeText(actorText(binding))}. ${skillAssignmentScope(binding)}`; }), ...custom.map(assignment => `- ${escapeText(customLabel(assignment))} (${escapeText(stepReference(assignment))}). ${escapeText(customActorText(assignment.step))}. ${customAssignmentScope(assignment)}`)].join('\n') || 'Additional library skill. No workflow stage assignment was selected. Confirm the task, responsible actor and permitted scope before using this procedure.';
  return `---\nname: ${JSON.stringify(skill.id)}\ndescription: ${JSON.stringify(description)}\nmetadata:\n  template-version: ${JSON.stringify(EXPORTER_VERSION)}\n---\n\n# ${skill.label}\n\nConfirm the assigned scope below before starting. Read [project context](references/project.md) when the task needs the recorded outcome, answers, stage notes, paths, commands or facts. Values marked UNRESOLVED need clarification.\n\n## Assigned workflow stages\n\n${assignments}\n\n${procedure}\n\n## ${reviewOnly ? 'Review criteria' : 'Checks'}\n\n${reviewCount ? 'For supplied-context review, assess these criteria from the provided artifacts and source records. They do not authorize executing the underlying work or establish that its checks passed.\n\n' : ''}${skill.checks.map(text => `- ${text}`).join('\n')}\n\n## Boundaries\n\n${boundaryText(config)}\n\n## Selected practices\n\n${practiceText(config)}\n`;
}

function assignedStages(config, roleId) {
  return getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id) && config.workflow.bindings[stage.id]?.actorType === 'agent' && config.workflow.bindings[stage.id]?.actorId === roleId);
}

function commandScopeGuidance(config, roleId) {
  const assigned = assignedStages(config, roleId);
  const custom = customRoleAssignments(config, roleId);
  const reviewExecution = [...assigned.filter(stage => suppliedContextOnly(config.workflow.bindings[stage.id]) && stage.capabilities.includes('execute')).map(stage => stage.title), ...custom.filter(({ step }) => step.actor.contextOnly).map(customLabel)];
  if (!reviewExecution.length || assigned.some(stage => !suppliedContextOnly(config.workflow.bindings[stage.id]) && stage.capabilities.includes('execute')) || custom.some(({ step }) => !step.actor.contextOnly && step.capabilities.includes('execute'))) return '';
  const role = roles.find(item => item.id === roleId)?.label || roleId;
  return `${escapeText(role)} reviews ${reviewExecution.map(escapeText).join(', ')} from supplied evidence only and has no active assigned execution stage. Do not run syntax checks, tests, lint checks or builds, including as a side effect of active implementation. Request missing results from the responsible person or external system and leave unobserved checks unresolved. A selected execute tool does not expand this assignment. ${assignmentScopePriority} These instructions do not enforce host permissions.`;
}

function agentContent(agent, config) {
  const role = roles.find(role => role.id === agent.role);
  if (!role) return '';
  const assigned = assignedStages(config, agent.role);
  const custom = customRoleAssignments(config, agent.role);
  const commandScope = commandScopeGuidance(config, agent.role);
  const skillIds = new Set([...assigned.flatMap(stage => config.workflow.bindings[stage.id].skills), ...custom.flatMap(({ step }) => step.instructionIds)]);
  const unassigned = !assigned.length && !custom.length;
  const responsibilities = unassigned ? ['No stage is assigned to this profile in the current workflow. Its presence does not authorize implementation, execution or external changes.', 'Review the intended assignment, scope and available inputs before accepting work.', 'Assign a relevant stage or confirm a separate explicit task before performing the underlying work.'] : [
    ...assigned.map(stage => config.workflow.bindings[stage.id].contextOnly
      ? `${stage.title}: Review supplied artifacts only. Do not perform the underlying work or claim executed checks. A person or external system supplies its outputs and observed results. ${assignmentScopePriority}`
      : `${stage.title}: ${stage.purpose}`),
    ...custom.map(assignment => `${escapeText(customLabel(assignment))} (${escapeText(stepReference(assignment))}): ${customAssignmentScope(assignment)}`),
    'Report observed results, missing evidence and unresolved questions for the assigned work.',
    'Leave business and policy decisions with their named owners.',
  ];
  const description = unassigned ? `${role.label} profile retained without a stage assignment. Use to review the intended assignment and scope before starting work.` : `${role.label} for ${[...assigned.map(stage => `${stage.title}${config.workflow.bindings[stage.id].contextOnly ? ' (supplied context review)' : ''}`), ...custom.map(assignment => `${customLabel(assignment)}${assignment.step.actor.contextOnly ? ' (supplied context review)' : ''}`)].join(', ')}.`;
  const customHandoffs = custom.map(({ process, step }) => `### ${escapeText(process.name || process.id)} / ${escapeText(step.name || step.id)}\n\n${fence(`Process and step: ${process.id}/${step.id}\nRecorded action${step.actor.contextOnly ? ' (background only, supplied-context review takes priority)' : ''}: ${placeholder(step.action, 'action')}\nNeeds: ${step.inputIds.map(id => `${process.id}/${id}`).join(', ') || 'None'}\nExpected outputs: ${step.outputIds.map(id => `${process.id}/${id}`).join(', ') || 'None'}\nRequested capabilities: ${step.capabilities.join(', ') || 'None'}\n${process.transitions.filter(route => route.fromStepId === step.id).map(route => `${route.outcome}: ${destinationText(process, route.to)}`).join('\n') || 'Outcome routes unresolved.'}`)}\n\nRead this process in WORKFLOW.md for result definitions, checks, correction limits and approval authority. Requested capabilities do not grant access.`).join('\n\n');
  const target = config.project.host === 'github' ? 'target: "github-copilot"\n' : config.project.host === 'vscode' ? 'target: "vscode"\n' : '';
  const tools = [...agent.tools].sort((a, b) => TOOL_ALIASES.indexOf(a) - TOOL_ALIASES.indexOf(b));
  return `---\nname: ${JSON.stringify(role.label)}\ndescription: ${JSON.stringify(description)}\n${target}tools: ${JSON.stringify(tools)}\n---\n\n# ${role.label}\n\nRead the [workflow](../../WORKFLOW.md) and [validation record](../../VALIDATION.md) before starting. Intended environment: ${CATALOG.hosts.find(host => host.id === config.project.host)?.label || 'UNRESOLVED'}.\n\n## Responsibilities\n\n${responsibilities.map(text => `- ${text}`).join('\n')}\n\n## Assigned stages and handoffs\n\n${assigned.map(stage => `- ${stage.title}. Expected outputs: ${stage.outputs.join(', ')}. ${config.workflow.bindings[stage.id].contextOnly ? 'Use supplied context only. Other actors must provide changes and observed execution.' : 'Use only available selected capabilities.'}`).join('\n') || 'No recipe stage assigned.'}${customHandoffs ? `\n\n## Custom process assignments\n\n${customHandoffs}` : ''}${commandScope ? `\n\n## Command scope across assigned stages\n\n${commandScope}` : ''}\n\n## Relevant skills\n\n${skills.filter(skill => skillIds.has(skill.id)).map(skill => `- [${skill.label}](../skills/${skill.id}/SKILL.md)`).join('\n') || 'No skills assigned to this role. Read the workflow and supplied context.'}\n\n## Boundaries\n\n${boundaryText(config)}\n\nIf a required capability or input is unavailable, report what is needed. Do not treat named tools or commands as configured integrations. This is a development profile. It is not a deployed backend agent.\n`;
}

function agentsContent(config) {
  const recipe = lookupRecipe(config.workflow.recipe);
  const enabled = getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id));
  const customProcesses = config.workflowModel.processes.filter(process => process.source !== 'recipe');
  const effectiveSkills = getEffectiveSkills(config);
  const agents = roles.filter(role => config.agents.some(agent => agent.role === role.id));
  const commandLines = config.components.length
    ? config.components.map(component => `### ${escapeText(placeholder(component.name, 'component name'))}\n\nPath: ${escapeText(placeholder(component.path, 'component path'))}\n\n${['test', 'lint', 'build'].map(kind => `- ${kind}: ${fenceInline(placeholder(component.commands[kind], `${kind} command`))}`).join('\n')}`).join('\n\n')
    : 'No repository component is recorded. Ask before assuming a build, test or lint command.';
  const stageLines = enabled.length
    ? enabled.map((stage, index) => `${index + 1}. ${stage.title}. ${actorText(config.workflow.bindings[stage.id])}. Produces: ${stage.outputs.join(', ')}.`).join('\n')
    : 'No recipe stages are selected.';
  const processLines = customProcesses.map(process => `- ${escapeText(placeholder(process.name, 'process name'))}, ${process.steps?.length || 0} steps. Read the routes and checks in [WORKFLOW.md](WORKFLOW.md).`).join('\n');
  const roleLines = agents.length
    ? agents.map(role => `- [${role.label}](.github/agents/${role.id}.agent.md). ${assignedStages(config, role.id).map(stage => stage.title).join(', ') || 'No recipe stage assigned'}.`).join('\n')
    : 'No agent profile is selected. People and external systems own every stage.';
  const skillLines = effectiveSkills.length
    ? effectiveSkills.map(skill => `- [${skill.label}](.github/skills/${skill.id}/SKILL.md). ${skill.description}`).join('\n')
    : 'No skill is selected.';
  const acceptanceLines = (recipe?.questions || []).map(question => { const answer = getIntentAnswer(config, question.id); return `### ${question.label}\n\n${fence(placeholder(answer.text, question.label))}`; }).join('\n\n');
  const selectedPractices = practices.filter(practice => config.practices.includes(practice.id));
  const practiceLines = selectedPractices.length ? `${selectedPractices.map(practice => `- ${practice.label}. ${practice.application}`).join('\n')}\n\nSources and scope are in [SOURCES.md](SOURCES.md).` : 'No optional reference practice is selected.';
  return `# ${escapeText(placeholder(config.project.name, 'project name'))}

Workflow Atlas wrote this file from [project.json](project.json). It describes planned work, owners and boundaries for coding agents. It does not run anything, configure an integration or grant a permission. An unresolved value is a question for a person, not a value to invent.

## Purpose

${fence(placeholder(config.project.purpose, 'project purpose'))}

## Commands

${commandLines}

Run only commands recorded here or confirmed by a person. Report a missing or failing command instead of substituting another.

## Workflow

${stageLines}
${processLines ? `\n${processLines}\n` : ''}
Inputs, outcome routes, correction limits and expected evidence are in [WORKFLOW.md](WORKFLOW.md). Review feedback returns to the relevant earlier stage. Existing artifacts can satisfy an omitted earlier stage.

## Roles

${roleLines}

## Skills

${skillLines}

## Acceptance

${acceptanceLines || 'No acceptance questions are defined for this workflow.'}

## Boundaries

${boundaryText(config)}

${fence(config.constraints.notes || 'No additional constraint notes supplied.')}

## Practices

${practiceLines}
`;
}

function fenceInline(value) {
  const content = String(value).replace(/[\r\n]+/g, ' ');
  const delimiter = '`'.repeat(Math.max(0, ...[...content.matchAll(/`+/g)].map(match => match[0].length)) + 1);
  return `${delimiter}${content.startsWith('`') ? ' ' : ''}${content}${content.endsWith('`') ? ' ' : ''}${delimiter}`;
}

function workflowContent(config, outputKind = 'pack') {
  const selected = getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id));
  const recipe = getStages(config).length ? lookupRecipe(config.workflow.recipe) : undefined;
  const nodes = selected.map(stage => `  ${stage.id.replaceAll('-', '_')}["${stage.title}"]`);
  for (const stage of selected) for (const prerequisite of stage.dependsOn) {
    if (config.workflow.enabledStages.includes(prerequisite)) nodes.push(`  ${prerequisite.replaceAll('-', '_')} --> ${stage.id.replaceAll('-', '_')}`);
    else if (present(config.workflow.suppliedInputs[prerequisite])) nodes.push(`  supplied_${prerequisite.replaceAll('-', '_')}["Existing ${lookupStage(prerequisite).title} artifact"] --> ${stage.id.replaceAll('-', '_')}`);
  }
  const detail = selected.map(stage => {
    const binding = config.workflow.bindings[stage.id];
    const reviewOnly = suppliedContextOnly(binding);
    const actions = reviewOnly ? suppliedReviewActions : stage.actions;
    const capabilityGuidance = binding?.actorType !== 'agent'
      ? 'The responsible person or system supplies this step\'s outputs and records any observed results.'
      : binding.contextOnly
        ? `Agent scope: review supplied artifacts only. A person or external system supplies any changes and observed execution. ${assignmentScopePriority}`
        : `Requested agent capabilities: ${stage.capabilities.join(', ') || 'No agent tool requirement'}. Actual availability and enforcement belong to the host or runtime.`;
    return `### ${stage.title}\n\n${stage.purpose}\n\nResponsible actor: ${escapeText(actorText(binding))}.\n\nRelevant skills: ${(binding?.skills || []).map(id => skills.find(skill => skill.id === id)?.label || id).join(', ') || 'None selected'}.\n\n${capabilityGuidance}\n\nPrerequisites:\n\n${stage.dependsOn.map(id => `- ${lookupStage(id).title}: ${config.workflow.enabledStages.includes(id) ? 'selected earlier stage' : 'supplied artifact'}\n\n${!config.workflow.enabledStages.includes(id) ? fence(placeholder(config.workflow.suppliedInputs[id], 'existing artifact location')) : ''}`).join('\n') || 'Starting request and project context.'}\n\nInputs:\n\n${stage.inputs.map(text => `- ${text}`).join('\n')}\n\nActions:\n\n${actions.map(text => `- ${text}`).join('\n')}\n\n${reviewOnly ? 'Expected producer outputs and handoff' : 'Outputs and handoff'}:\n\n${stage.outputs.map(text => `- ${text}`).join('\n')}\n\n${reviewOnly ? 'Review criteria for supplied evidence' : 'Acceptance checks and expected evidence'}:\n\n${stage.checks.map(text => `- ${text}`).join('\n')}\n\nProject supplied stage notes:\n\n${fence(config.workflow.notes[stage.id] || 'No additional project instructions supplied for this step.')}`;
  }).join('\n\n');
  return `# ${escapeText(placeholder(config.project.name, 'project name'))}\n\n${recipe?.label || 'Process design'} blueprint. This describes planned work and expected evidence. It does not execute the workflow or implement a backend runtime.\n\n## Purpose\n\n${fence(placeholder(config.project.purpose, 'project purpose'))}\n\n## Intent questions\n\n${(recipe?.questions || []).map(question => { const answer = getIntentAnswer(config, question.id); return `### ${question.label}\n\n${answer.inherited ? 'Uses the recorded project outcome.\n\n' : ''}${fence(placeholder(answer.text, question.label))}`; }).join('\n\n')}${intentReviewText(config)}\n\n## Target\n\nEnvironment: ${CATALOG.hosts.find(host => host.id === config.project.host)?.label || 'UNRESOLVED'}.\n\nSource control: ${escapeText(config.project.sourceControl || 'UNRESOLVED')}.\n\nSee [installation](INSTALL.md), [validation](VALIDATION.md), [sources](SOURCES.md), [project facts](PROJECT-FACTS.md), [evidence](EVIDENCE.md) and authoritative [configuration](project.json).\n\n## Workflow\n\n${fence(`flowchart LR\n${nodes.join('\n')}`, 'mermaid')}\n\nReview feedback returns to the relevant earlier stage. These prerequisites describe handoffs, not an automatic scheduler. Existing artifacts can satisfy omitted producer stages.\n\n${detail}\n${workflowModelMarkdown(config)}\n## Project components\n\n${componentText(config)}\n\n## Boundaries\n\n${boundaryText(config)}\n\nProject supplied constraint notes:\n\n${fence(config.constraints.notes || 'No additional constraint notes supplied.')}\n\n## Selected practices\n\n${practiceText(config, outputKind)}\n`;
}

function evidenceContent(config) {
  const hasModel = config.runtime.enabled || Object.values(config.model).some(present);
  const modelSection = hasModel ? `## Model and budget record\n\n${fence(`Model: ${placeholder(config.model.name, 'model')}\nVersion: ${placeholder(config.model.version, 'version')}\nBudget: ${placeholder(config.model.budget, 'budget')}\nNotes: ${config.model.notes || 'No additional notes.'}`)}\n\nA selected model or budget does not establish effectiveness or cost savings.\n` : '';
  return `# Evidence record\n\nThis document distinguishes expected checks from supplied observations. All entries were supplied by the user or imported from external records. Atlas has not run, authenticated or independently verified them. A recorded result can be a failure.\n\n${config.evidence.map(record => `## ${escapeText(record.id)}\n\nStage: ${escapeText(evidenceStageName(record.stageId))}.\n\nCheck:\n\n${fence(record.check)}\n\nExpected:\n\n${fence(placeholder(record.expected, 'expected outcome'))}\n\nObserved:\n\n${fence(placeholder(record.observed, 'observed result'))}\n\nStatus: ${escapeText(record.status)}. Origin: ${escapeText(record.method)}. Reviewer: ${escapeText(placeholder(record.reviewer, 'reviewer'))}.\n\nSource:\n\n${fence(placeholder(record.source, 'result source'))}`).join('\n\n') || 'No observed evidence supplied. Use the selected templates to record real results.'}\n\n${modelSection}`;
}

function runtimeContent(config) {
  const sections = [['outcome', 'Expected outcome'], ['requiredInputs', 'Required inputs and clarification'], ['judgment', 'Model judgment and ordinary code'], ['tools', 'Tool contracts and permitted changes'], ['validation', 'Validation before writes and before response'], ['limits', 'Execution and data limits'], ['duplicates', 'Duplicate requests and uncertain writes'], ['failures', 'Failure and partial completion'], ['confirmation', 'Confirmed actions and inference']];
  return `# Backend agent runtime design\n\nThis is a design draft. It describes what the finished application should do for a request. Development agent profiles, when used, guide engineering work. They do not implement this runtime. Selecting a control records a requirement and does not enforce it.\n\nIllustrative architecture. This fixed backend example is separate from explicit process records and is not assembled from their routes.\n\n${fence('flowchart LR\n  User -->|request| API[REST API]\n  API -->|start run| Runner[Agent runner]\n  Runner -->|tool call| Tools[Typed tools or MCP]\n  Tools --> Backend[Existing backend APIs]\n  Backend --> Check[Authorization and business validation]\n  Check -->|allowed| Store[Database]\n  Check -->|rejected| Rejected[Rejected operation result]\n  Store --> Confirm[Confirmed operation result]\n  Confirm --> ToolResult[Structured tool result]\n  Rejected --> ToolResult\n  ToolResult -->|result| Runner\n  Runner --> FinalCheck[Response validation]\n  FinalCheck -->|response| API\n  API -->|response| User', 'mermaid')}\n\n${sections.map(([key, label]) => `## ${label}\n\n${fence(placeholder(config.runtime[key], label))}`).join('\n\n')}\n\n## Requirement, implementation and evidence links\n\n${config.runtime.controls.map(control => `### ${escapeText(control.label)}\n\nStatus: ${escapeText(control.status)}.\n\nImplementation location:\n\n${fence(placeholder(control.implementation, 'implementation link'))}\n\nEvidence id: ${escapeText(placeholder(control.evidenceId, 'evidence link'))}. An evidence link does not imply a passing result.`).join('\n\n') || 'No controls recorded.'}\n\n## Draft contracts\n\nRecord actual request fields, required values, validation failures, allowed tool operations, confirmed backend identifiers and unresolved inferred values. Specify asynchronous status retrieval if the request lifetime requires it. No working contract or integration is configured by this document.\n`;
}

function readingRoutes(config, kind, skill) {
  if (kind === 'skill') return [
    { label: `Use ${skill.label}`, purpose: 'Start with the procedure for your task.', paths: [`.github/skills/${skill.id}/SKILL.md`] },
    { label: 'Check project context', purpose: 'Read the linked reference when you need the recorded outcome, commands or boundaries. Check unresolved findings before adoption.', paths: [`.github/skills/${skill.id}/references/project.md`, 'VALIDATION.md'] },
  ];
  const enabled = getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id));
  const stageIds = new Set(enabled.map(stage => stage.id));
  const routes = [{ label: 'Review the plan', purpose: 'For a PM or teammate. Read the outcome, planned owners, open decisions and findings.', paths: ['WORKFLOW.md', 'VALIDATION.md'] }];
  if (kind === 'blueprint') {
    const templates = [];
    if (['architecture', 'options', 'recommendation', 'diagnosis'].some(id => stageIds.has(id))) templates.push('templates/DECISION.md');
    if (['experiment-plan', 'verification', 'regression'].some(id => stageIds.has(id)) || config.runtime.enabled || customAssignments(config).length) templates.push('templates/EVALUATION.md');
    if (config.workflowModel.processes.some(process => process.source === 'custom' && process.kind === 'application')) templates.push('templates/CONTRACTS.md');
    if (!templates.length && ['requirements', 'current-process', 'feasibility-scope', 'reproduction'].some(id => stageIds.has(id))) templates.push('templates/REQUIREMENTS.md');
    if (templates.length) routes.push({ label: 'Prepare the next step', purpose: 'Use the relevant template to develop the decision or checks. Record actual results only after the work.', paths: templates });
    return routes;
  }
  const assignedRoles = [...new Set([...enabled.filter(stage => config.workflow.bindings[stage.id]?.actorType === 'agent').map(stage => config.workflow.bindings[stage.id].actorId), ...customAssignments(config).filter(({ process, step }) => process.kind !== 'application' && step.actor.type === 'agent').map(({ step }) => step.actor.id)])];
  const profiles = assignedRoles.filter(id => config.agents.some(agent => agent.role === id) && roles.some(role => role.id === id));
  if (profiles.length) routes.push({ label: 'Use an assigned agent', purpose: 'Choose the profile for your task. Read only its linked skills and their project references when needed.', paths: profiles.map(id => `.github/agents/${id}.agent.md`) });
  const effective = getEffectiveSkills(config);
  const preferred = enabled.filter(stage => config.workflow.bindings[stage.id]?.actorType === 'agent').flatMap(stage => config.workflow.bindings[stage.id].skills);
  const procedure = effective.find(item => item.id === preferred[0]) || effective[0];
  if (procedure) routes.push({ label: `Use ${procedure.label}`, purpose: 'For a procedure without an agent profile. Start with this skill and open its linked project reference only as needed.', paths: [`.github/skills/${procedure.id}/SKILL.md`] });
  return routes;
}

export function getUseInstructions(config, selection = { kind: 'pack' }) {
  const kind = selection?.kind;
  if (!['blueprint', 'skill', 'pack'].includes(kind)) throw new Error('Choose a supported output: blueprint, skill or pack.');
  const skill = kind === 'skill' ? skills.find(item => item.id === selection.skillId) : null;
  if (kind === 'skill' && !skill) throw new Error('Choose a supported skill.');
  const reading = readingRoutes(config, kind, skill);
  if (kind === 'blueprint') return {
    title: 'Use the workflow blueprint',
    intro: 'Share a readable plan and its decisions with the people responsible for the work.',
    reading,
    steps: [
      { title: 'Review the plan', body: 'Open WORKFLOW.md and VALIDATION.md. Check the intended outcome, responsible actors, missing inputs and draft findings. If PROJECT-ATLAS.html is included, open it to walk through the same decisions visually.' },
      { title: 'Agree the next action', body: 'Give the workflow to the named owner. Agree which next step should happen, which inputs it needs and what result will be accepted.' },
      { title: 'Record actual results', body: 'Use the relevant templates and EVIDENCE.md to record the procedure, observations, failures and source. A planned check remains planned until someone performs it.' },
      { title: 'Reopen when decisions change', body: 'Upload project.json, the exported ZIP or PROJECT-ATLAS.html to Atlas to reopen the recorded decisions. Later changes to Markdown files do not automatically update project.json.' },
    ],
    limits: ['Atlas has not performed the work or verified supplied facts.', 'The named owners decide whether a recorded result is sufficient for the next step.'],
    source: null,
  };
  const host = config.project.host;
  const environment = CATALOG.hosts.find(item => item.id === host)?.label || 'Unresolved environment';
  const hasProfiles = kind === 'pack' && config.agents.some(agent => roles.some(item => item.id === agent.role));
  const hasSkills = kind === 'skill' || getEffectiveSkills(config).length > 0;
  const location = kind === 'skill' ? `.github/skills/${skill.id}/` : [hasProfiles ? '.github/agents/' : '', hasSkills ? '.github/skills/' : ''].filter(Boolean).join(' and ');
  const placement = kind === 'skill'
    ? `Copy only the complete exported ${location} directory to that same path at the repository root. Keep SKILL.md and references/project.md inside that directory. The other ZIP files support review and reopening. Keeping those records is optional for installing the skill. Keep any retained project and adoption records outside the skill directory. Keep project.json and its review records together for reopening in Atlas. The complete skill directory is self contained and can be copied independently of the root records.`
    : `Copy the pack into the repository while preserving every exported path relative to the repository root. ${location ? `Keep ${location} at those same paths. ` : ''}${hasSkills ? 'Keep each entire skill directory, including SKILL.md and references/project.md. ' : ''}Keep project.json and its review records together for reopening in Atlas. ${hasProfiles ? 'Keep WORKFLOW.md, VALIDATION.md and the other root records at the repository root because the agent profiles reference them.' : 'Keep the workflow records together at their exported paths for review by their named owners.'}`;
  const activeRoles = [...new Set(getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id) && config.workflow.bindings[stage.id]?.actorType === 'agent').map(stage => config.workflow.bindings[stage.id].actorId))];
  const role = roles.find(item => activeRoles.includes(item.id) && config.agents.some(agent => agent.role === item.id)) || roles.find(item => config.agents.some(agent => agent.role === item.id));
  const skillTask = `Try a small task matching ${skill ? `the ${skill.label.toLowerCase()} description` : 'an included skill description'}. Skills can be loaded when relevant. Inspect the resulting work and available session details, and record whether skill use was observable. An agent saying it used a skill is not independent proof.`;
  const task = hasProfiles ? `Select an included custom agent${role ? `, such as ${role.label}` : ''}, then try a small representative task. Check the actual available tools and the resulting work. Instructions alone do not establish that each workflow stage ran.` : hasSkills ? skillTask : 'Use WORKFLOW.md to agree a small representative task with its owner. Record the expected and observed results before continuing.';
  const discovery = !hasProfiles && !hasSkills
    ? 'Review the saved workflow with its named owners and agree the next action and acceptance checks.'
    : host === 'github'
    ? `Use a repository stored on GitHub with Copilot cloud agent available under the organization policy. Review and merge the selected files into the appropriate branch through the normal process. ${hasProfiles ? 'Refresh the agents interface and check the custom agent selector.' : 'Try a task relevant to the included skill and inspect the resulting work.'}`
    : host === 'vscode'
      ? `Open the repository in VS Code with GitHub Copilot configured. Check the installed extension supports ${hasProfiles ? 'custom agents and the selected artifacts. Look for the included profile in the custom agent selector.' : 'skills. Use agent mode with a relevant task and inspect the resulting work.'}`
      : host === 'jetbrains'
        ? `Open the repository in the supported JetBrains IDE with GitHub Copilot configured. Check the installed plugin supports ${hasProfiles ? 'custom agents and the selected artifacts. Custom agents are documented as public preview. Check the custom agent selector.' : 'skills. Use agent mode with a relevant task and inspect the resulting work.'}`
        : 'Choose a supported environment and check its documented discovery behavior before adoption.';
  return {
    title: kind === 'skill' ? `Use ${skill.label}` : 'Use the workflow pack',
    intro: `Intended environment: ${environment}. These instructions explain adoption. Host discovery and task behavior have not been exercised by Atlas.`,
    reading,
    steps: [
      { title: 'Review before copying', body: 'Check VALIDATION.md and the files relevant to your task. Confirm the supplied paths, commands, facts and boundaries against the real project. Resolve errors or deliberately keep this as a draft. project.json keeps the editable settings for reopening.' },
      { title: 'Place the files', body: `Compare existing repository instructions before changing them. Preserve local rules. ${placement}` },
      { title: 'Check the selected host', body: discovery },
      { title: 'Try one bounded task', body: task },
      { title: 'If it is missing or behaves unexpectedly', body: 'Check the repository root, exact file locations, complete skill directory and valid metadata. Check the installed host or extension version and applicable organization policy against the linked documentation. If discovery remains unavailable, record it as unverified instead of treating format checks as successful installation.' },
      { title: 'Record the exercise', body: 'Record repository revision, host and extension or plugin versions, selected model, installed artifacts, actual available tools, task input, expected result, observed result, failures and human corrections. Compare with the existing approach on an equivalent task before claiming improvement.' },
    ],
    limits: ['No host discovery, task execution or productivity gain is established by this export.', ...(hasProfiles ? ['Runtime permissions, credentials, model access and integrations require separate configuration. An explicit empty tools list disables tools.'] : []), ...(host === 'jetbrains' && hasProfiles ? ['The JetBrains adapter omits target because only vscode and github-copilot target values are documented.'] : [])],
    source: hasProfiles ? SOURCES.agents : hasSkills ? SOURCES.copilotSkills : null,
  };
}

function installContent(config, selection = { kind: 'pack' }) {
  const guide = getUseInstructions(config, selection);
  const references = guide.source === SOURCES.agents ? `[GitHub configuration](${SOURCES.agents}), [custom agent authoring](${SOURCES.install}) and [Copilot skills](${SOURCES.copilotSkills}).` : guide.source === SOURCES.copilotSkills ? `[Copilot skills](${SOURCES.copilotSkills}) and [Agent Skills specification](${SOURCES.skills}).` : '';
  return `# ${guide.title}\n\n${guide.intro}\n\n## Read only what you need\n\n${guide.reading.map(route => `- **${escapeText(route.label)}**. ${route.purpose} ${route.paths.map(path => `[${path}](${path})`).join(', ')}.`).join('\n')}\n\n${guide.steps.map((step, index) => `## ${index + 1}. ${step.title}\n\n${step.body}`).join('\n\n')}\n\n## Limits\n\n${guide.limits.map(limit => `- ${limit}`).join('\n')}\n\n${selection.kind === 'blueprint' ? '' : `## Exercise record\n\n| Item | Observed value or source |\n| --- | --- |\n| Repository revision | [NOT RECORDED] |\n| Host and extension or plugin versions | [NOT RECORDED] |\n| Model and installed artifacts | [NOT RECORDED] |\n| Discovery and actual available tools | [NOT RUN] |\n| Task input and expected result | [UNRESOLVED] |\n| Observed result, failures and human corrections | [NOT RUN] |\n| Existing approach comparison | [NOT RUN] |\n\n${references ? `## Format and adoption references\n\n${references}\n` : ''}`}`;
}

function sourceContent(config, outputKind = 'pack') {
  const runtimeSources = config.runtime.enabled ? '## Runtime design references\n\n- [MCP tool specification](https://modelcontextprotocol.io/specification/2026-07-28/server/tools). Input validation, server access control, output schemas, timeouts and logging responsibilities. This does not configure an MCP server.\n- [Safe retries with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/). Duplicate operations and uncertain results after a timeout.\n- [Building effective agents](https://www.anthropic.com/engineering/building-effective-agents). Compare fixed code, workflows and adaptive agents according to the actual task.\n\n' : '';
  return `# Sources and applicability\n\nBaseline definition review record: ${REVIEW_DATE}. Individual definition records may have later dates. Definition versions identify local adaptations, not upstream release versions. A URL alone does not establish correctness.\n\n${outputKind === 'blueprint' ? '' : `## Format references\n\n- [Agent Skills specification](${SOURCES.skills}). Required metadata, naming and focused supporting references.\n- [GitHub custom agent configuration](${SOURCES.agents}). Explicit tool aliases, target values and metadata. Host behavior must be exercised separately.\n- [Custom agent authoring](${SOURCES.install}). Repository layout and GitHub cloud repository requirements.\n- [Copilot skills](${SOURCES.copilotSkills}). Documented discovery locations.\n\n`}## Technology questions\n\n${profilesText(config)}\n\n## Selected reference practices\n\n${practiceText(config, outputKind)}\n\n${runtimeSources}## Project source locations\n\n${fence(placeholder(config.project.sourceLocations, 'source locations'))}\n\n## Claim trace\n\n${factsText(config)}\n\nThe factory records source locations and supplied confirmations without retrieving or verifying arbitrary content. Preserve original material and distinguish it from derived claims. Conflicting claims remain visible until resolved.\n`;
}

function intentReviewText(config) {
  const record = config.workflow.intentReview;
  if (!record) return '';
  const review = getIntentReview(config);
  const taskLabels = { 'software-change': 'Software change', 'knowledge-work': 'Knowledge work', other: 'Other work', unsure: 'Not sure yet' };
  const knowledgeLabels = { 'maintained-reference': 'Keep a maintained reference', 'one-off': 'One time use', unsure: 'Not sure yet' };
  const status = review.stale
    ? 'These earlier clarifications are retained for reference and are not applied. The brief, its answers or the recipe has changed. Confirm the current wording before reusing them.'
    : 'These classifications were recorded by the user to clarify the intended work. They do not approve requirements, add practices, configure tools or establish observed results.';
  const choices = [record.taskKind === null ? '' : `Task kind: ${taskLabels[record.taskKind]}.`, record.knowledgeNeed == null ? '' : `Knowledge need: ${knowledgeLabels[record.knowledgeNeed]}.`].filter(Boolean).join('\n\n');
  const task = choices ? `\n\n${choices}\n\nText available when these choices were recorded:\n\n${fence([...new Set([record.source.brief, ...Object.values(record.source.answers)].filter(present))].join('\n\n'))}` : '';
  const statements = record.statements.map(statement => {
    const label = { requirement: 'Product requirement', context: 'Background context', exclusion: 'Practice exclusion' }[statement.kind];
    const exclusion = statement.kind === 'exclusion' ? `\n\nNamed practices to leave out: ${statement.practiceIds.map(id => CATALOG.practices.find(practice => practice.id === id).label).join(', ')}. This records scope, it does not automatically remove an already selected practice.` : '';
    const applicability = review.stale ? '' : '\n\nRecorded classification. This export does not establish that it is currently used for matching. Review its status in Brief.';
    const provenance = (statement.policyVersion || 1) < 3 ? '\n\nRecorded with earlier clarification rules. Newly supported meanings may need confirmation again in Brief. The recorded choice does not establish that current suggestion rules accept it.' : '';
    return `### ${label}${review.stale ? ', earlier wording, not applied' : ''}\n\n${fence(statement.clause)}${exclusion}${applicability}${provenance}`;
  }).join('\n\n');
  const parts = (record.parts || []).map(part => {
    const label = { task: 'Current task', requirement: 'Product requirement', context: 'Background', restriction: 'Restriction' }[part.role];
    const scope = part.scope ? `\n\nScope: ${{ practices: 'Practices to leave out', product: 'Product behavior', inference: 'Sending text to AI', handling: 'Handling project input', unresolved: 'Not resolved' }[part.scope]}.` : '';
    const excluded = part.practiceIds.length ? `\n\nKeep out of new practice ideas: ${part.practiceIds.map(id => CATALOG.practices.find(practice => practice.id === id).label).join(', ')}. Already selected practices are unchanged.` : '';
    return `### ${label}${review.stale ? ', earlier wording, not applied' : ''}\n\nSource: ${part.field === 'brief' ? 'Description' : part.field.slice('answer:'.length)}, sentence ${part.index + 1}.\n\n${fence(part.text)}${scope}${excluded}\n\nRecorded meaning, not verification or runtime enforcement. Review its matching status in Brief. Original limits on sending or handling the submitted text still apply to the optional practice check.`;
  }).join('\n\n');
  return `\n\n## Recorded intent clarifications${review.stale ? ', not applied' : ''}\n\n${status}${task}${statements ? `\n\n${statements}` : ''}${parts ? `\n\n${parts}` : ''}`;
}

function requirementTemplate(config) {
  const hasAcceptanceQuestion = lookupRecipe(config.workflow.recipe)?.questions.some(question => question.id === 'acceptance');
  const acceptance = hasAcceptanceQuestion ? config.workflow.answers.acceptance : '';
  const currentQuestion = config.workflow.recipe === 'feasibility' ? 'current-work' : config.workflow.recipe === 'bugfix' ? 'observed' : '';
  const current = currentQuestion ? getIntentAnswer(config, currentQuestion).text : '';
  const currentSection = present(current) ? `Supplied in Brief and preserved as entered. Atlas has not independently verified this account.\n\n${fence(current)}\n\nEvidence source: [UNRESOLVED: source location and revision]` : '[UNRESOLVED: behavior, source location and revision]';
  const context = intentText(config, ['acceptance', currentQuestion]);
  const acceptanceSection = present(acceptance)
    ? `Supplied in Brief and preserved as entered. Recording these examples does not establish approval or observed results.\n\n${fence(acceptance)}\n\nAcceptance owner: [UNRESOLVED: acceptance owner]\n\nEvidence source: [UNRESOLVED: source location and revision]`
    : '| Input or situation | Expected result | Acceptance owner | Evidence source |\n| --- | --- | --- | --- |\n| [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |';
  return `# Requirement brief\n\nThis is an editable evidence template. Empty fields remain unresolved.\n\n## Request and outcome\n\n${fence(placeholder(config.project.purpose, 'intended outcome'))}\n\n## Current behavior and source\n\n${currentSection}\n\n## Recorded requirement context\n\n${context}${intentReviewText(config)}\n\n## Acceptance examples\n\n${acceptanceSection}\n\n## Boundaries and unresolved values\n\nRecord required inputs, excluded changes, incomplete input behavior and decisions requiring a named owner.\n`;
}

function workingContext(config, stageIds) {
  const selected = getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id) && stageIds.includes(stage.id));
  const stageContext = selected.map(stage => {
    const note = config.workflow.notes[stage.id];
    const supplied = stage.dependsOn.filter(id => !config.workflow.enabledStages.includes(id) && present(config.workflow.suppliedInputs[id])).map(id => `Existing ${lookupStage(id).title} artifact:\n\n${fence(config.workflow.suppliedInputs[id])}`).join('\n\n');
    return `### ${stage.title}\n\nPlanned responsibility: ${escapeText(actorText(config.workflow.bindings[stage.id]))}.\n\n${present(note) ? `Supplied stage notes:\n\n${fence(note)}\n\n` : ''}${supplied}`.trim();
  }).join('\n\n');
  return `## Supplied context\n\nRecorded intent is preserved below. It is input to this record, not an approved option, executed check or observed result.\n\n${intentText(config)}\n\n## Planned stages and supplied notes\n\nStage assignments describe planned work. They do not establish decision authority or approval.\n\n${stageContext || 'No related stage is enabled in this workflow.'}${present(config.constraints.notes) ? `\n\n## Supplied boundaries\n\n${fence(config.constraints.notes)}` : ''}`;
}

function decisionTemplate(config) {
  return `# Design decision and alternatives\n\n## Project outcome\n\n${fence(placeholder(config.project.purpose, 'decision outcome'))}\n\n${workingContext(config, ['architecture', 'options', 'recommendation', 'diagnosis'])}\n\n## Options\n\nUse the supplied context to describe the options being compared. Record evidence before choosing one.\n\n| Option | Supporting evidence | Tradeoffs | Unverified assumptions |\n| --- | --- | --- | --- |\n| [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n\n## Effort and operating cost\n\nKeep measurements separate from estimates. Record units, workload assumptions, relevant environment and versions, source dates and uncertainty.\n\n## Recommendation\n\n[UNRESOLVED: recommendation and supporting evidence]\n\n## Decision owner and follow up\n\nConfirm who may make this decision. A planned stage assignee is not automatically its decision owner. Review any ownership statement in the supplied boundaries.\n\nNamed decision owner: [UNRESOLVED: name and decision authority]\n\nAcceptance date: [UNRESOLVED: date, if accepted]\n\nNext action: [UNRESOLVED: follow up, next experiment or delivery scope]\n\nA completed decision record can be supplied as an existing artifact to a later workflow.\n`;
}

function verificationTemplate() {
  return '# Verification record\n\n| Check and expected result | Command or procedure | Directory and environment | Observed result | Status | Source and reviewer |\n| --- | --- | --- | --- | --- | --- |\n| [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [NOT RUN] | not-run | [UNRESOLVED] |\n\nRecord revision, host and tool versions, human corrections, failures and unrun checks. Expected checks are not observed results. Passing a command does not establish complete acceptance coverage.\n';
}

function evaluationTemplate(config) {
  const cases = config.runtime.enabled ? ['Valid request', 'Missing required information', 'Invalid proposed result', 'Backend failure', 'Write succeeds before response timeout', 'Duplicate retry'] : getStages(config).length && config.workflow.recipe === 'bugfix' ? ['Original failing case', 'Adjacent behavior', 'Invalid input', 'Regression or incomplete environment'] : ['Representative expected use', 'Incomplete information', 'Boundary or failure case', 'Behavior that should stay unchanged'];
  const hasModel = config.runtime.enabled || Object.values(config.model).some(present);
  const modelSection = hasModel ? `## Model details, when used\n\n${fence(`Name: ${placeholder(config.model.name, 'model')}\nVersion: ${placeholder(config.model.version, 'version')}\nBudget: ${placeholder(config.model.budget, 'budget')}`)}\n\nRecord actual model usage and cost separately from estimates. If instructions are what you are evaluating, useful comparison options may include the current setup, minimal project facts, a focused skill or a complete pack. Select only conditions relevant to the study.\n\n` : '';
  const processCases = customEvaluationCases(config);
  return `# Evaluation plan and observed results\n\nCompare the current approach with the actual options for this project. Name each option before running a comparison. Use representative situations, repeated observations where needed and independent acceptance checks.\n\n${workingContext(config, ['experiment-plan', 'verification', 'reproduction', 'regression'])}\n\n## Cases\n\nTranslate the supplied context into explicit cases and expected results before running them. The rows below are starter categories, not inferred cases or completed checks.\n\n| Case | Input or situation | Expected result | Observed result and source |\n| --- | --- | --- | --- |\n${cases.map(name => `| ${name} | [UNRESOLVED] | [UNRESOLVED] | [NOT RUN] |`).join('\n')}\n\n${processCases}## Matched comparison\n\nUse equivalent inputs and record any differences in environment or procedure that could affect the result. Compare accepted outcomes, effort, elapsed time, cost and ongoing maintenance. Keep measurements separate from estimates.\n\n| Option | Accepted result and source | Corrections and effort | Elapsed time | Cost and basis | Maintenance effort |\n| --- | --- | --- | --- | --- | --- |\n${['Current approach', '[UNRESOLVED: proposed option]', '[UNRESOLVED: alternative, if needed]'].map(condition => `| ${condition} | [NOT RUN] | [NOT RECORDED] | [NOT RECORDED] | [NOT RECORDED] | [NOT RECORDED] |`).join('\n')}\n\nRecord who checked each result, how it was checked, the relevant environment and versions, and where the evidence can be inspected. Report failures and unrun checks. A success message alone does not prove the expected outcome.\n\n${modelSection}No experiment, successful outcome or productivity gain is established by this export.\n`;
}

function customEvaluationCases(config) {
  const processes = config.workflowModel.processes.filter(process => process.source === 'custom');
  if (!processes.length) return '';
  const table = rows => `| Planned case | Input or situation | Expected result from the design | Observed result and source |\n| --- | --- | --- | --- |\n${rows.map(row => `| ${row.map(escapeText).join(' | ')} | [NOT RUN] |`).join('\n')}`;
  return `## Planned process cases\n\nThese cases come from the recorded process decisions. They are design expectations, not simulated runs or evidence of success. Supply the actual procedure, candidate revision, environment, observations and source when someone performs each case.\n\n${processes.map(process => {
    const rows = process.steps.flatMap(step => step.outcomes.map(outcome => {
      const route = process.transitions.find(item => item.fromStepId === step.id && item.outcome === outcome);
      const correction = process.corrections.find(item => item.decisionStepId === step.id && item.outcome === outcome);
      const expected = correction ? correctionText(process, correction) : destinationText(process, route?.to || { type: 'unresolved', id: '' });
      return [`${process.id}/${step.id} / ${outcome}`, `Arrange inputs ${step.inputIds.join(', ') || '(none recorded)'} and the declared ${outcome} outcome. Actual inputs and procedure remain to be supplied.`, expected];
    }));
    for (const correction of process.corrections) rows.push([
      `${process.id}/${correction.id} / correction limit reached`,
      correction.maxCorrections === null ? 'Maximum corrections remains UNRESOLVED. Agree a bounded limit before implementing or running this path.' : `The ${correction.maxCorrections} permitted corrections after the initial candidate have been entered, including unsuccessful attempts. The decision reports ${correction.outcome} again.`,
      `${correction.maxCorrections === null ? 'Do not infer a correction allowance. ' : 'Do not enter another correction attempt. '}${destinationText(process, { type: 'terminal', id: correction.exhaustedTerminalId })}. Preserve the current candidate and findings.`,
    ]);
    for (const check of process.checks) rows.push([
      `${process.id}/${check.id} / candidate revision changed`,
      `Candidate ${check.candidateId} changes after earlier evidence was supplied. Criteria: ${check.criteria.join(' ') || '[UNRESOLVED]'}`,
      `Check the changed candidate at ${process.id}/${check.stepId} and record ${check.evidenceResultId} for that revision. Prior evidence stays historical. Unavailable, missing and unrun checks do not pass.`,
    ]);
    for (const approval of process.approvals) rows.push([
      `${process.id}/${approval.id} / approval after changes`,
      `Candidate ${approval.candidateId} changes after an earlier approval.`,
      `Obtain new approval at ${process.id}/${approval.stepId} from ${placeholder(approval.authority, 'authority')} using current evidence ${approval.evidenceResultIds.join(', ') || '[UNRESOLVED]'}. Do not inherit the earlier approval.`,
    ]);
    return `### ${escapeText(process.name || process.id)}\n\nProcess ${escapeText(process.id)}, ${process.kind}. Pattern ${process.pattern.id}, version ${process.pattern.version}.\n\n${rows.length ? table(rows) : 'No outcome cases can be derived yet. Define steps and outcomes before using this plan.'}`;
  }).join('\n\n')}\n\n`;
}

function contractsTemplate(config) {
  const template = '# Runtime contract draft\n\nThis editable draft does not define a working integration. Replace unresolved values with project evidence and review the permitted operations.\n\n## Request fields\n\n| Field | Type | Required | Validation rule | Supporting source |\n| --- | --- | --- | --- | --- |\n| [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n\nRecord request identity, caller scope, missing input behavior and the conditions requiring clarification. Define the request lifetime and status retrieval if processing is asynchronous.\n\n## Tool operations\n\n| Operation | Input schema | Permitted read or change scope | Backend operation | Confirmed result |\n| --- | --- | --- | --- | --- |\n| [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n\nBackend authorization and business validation must be specified before persistence. Instruction text does not enforce the contract.\n\n## Response fields\n\n| Field or outcome | Backend confirmed value | Inferred value or assumption | Unresolved information | Evidence source |\n| --- | --- | --- | --- | --- |\n| [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n\nCompleted actions must refer to actual backend results and identifiers. State when no valid result was produced rather than inferring completion.\n\n## Failure and retry outcomes\n\n| Situation | Observable state | Retry or recovery rule | Duplicate prevention | Returned status or explanation |\n| --- | --- | --- | --- | --- |\n| Missing information | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n| Validation rejects a change | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n| Backend failure | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n| Timeout with uncertain write result | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n| Duplicate request | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n\nRecord idempotency scope, retention and recovery of a prior confirmed result. A timeout does not establish that a write failed.\n';
  const applications = config.workflowModel.processes.filter(process => process.source === 'custom' && process.kind === 'application');
  if (!applications.length) return template;
  return template.replace('# Runtime contract draft', '# Application contract draft') + `\n## Recorded application context\n\nThe following values are supplied design decisions, not working schemas, granted permissions or observed outcomes. Use the result structures, check criteria, authority requirements and routes to fill in the contract tables above. Exact endpoints, fields, types, limits and implementation locations remain unresolved unless supplied. Atlas does not require MCP or a model. Choose an approved integration appropriate to the recorded operation.\n\n${workingContext(config, ['architecture', 'verification'])}\n${applications.map(applicationContractContext).join('\n\n')}`;
}

function applicationContractContext(process) {
  return `## ${escapeText(process.name || process.id)}\n\nProcess: ${escapeText(process.id)}. Entry: ${escapeText(placeholder(process.entryStepId, 'entry step'))}. Pattern: ${process.pattern.id}, version ${process.pattern.version}. These are planned requirements. Atlas does not execute or enforce them.\n\n${fence(placeholder(process.purpose, 'application purpose'))}\n\n### Operations and responsibility\n\n${process.steps.map(step => `#### ${escapeText(step.name || step.id)}\n\nStep: ${escapeText(step.id)}. Planned actor: ${escapeText(customActorText(step))}.\n\n${fence(placeholder(step.action, 'operation behavior'))}\n\nInputs: ${step.inputIds.map(escapeText).join(', ') || '[UNRESOLVED]'}. Outputs: ${step.outputIds.map(escapeText).join(', ') || 'None recorded'}.\n\nExact interface, endpoint and permission implementation: [UNRESOLVED: supply actual contract and implementation location]`).join('\n\n')}\n\n### Data and result contracts\n\n${process.results.map(result => `#### ${escapeText(result.name || result.id)}\n\nResult: ${escapeText(result.id)}. Initial producer: ${escapeText(result.producerStepId || 'Supplied input')}.\n\n${[['Meaning', result.description], ['Expected structure', result.expectedStructure], ['Supplied source', result.suppliedSource || (result.producerStepId ? 'Produced by the named step. This is not an observed result.' : '')], ['Version policy', result.versionPolicy], ['Recorded revision', result.version]].map(([label, value]) => `${label}:\n\n${fence(placeholder(value, label.toLowerCase()))}`).join('\n\n')}`).join('\n\n')}\n\n### Checks and save authority\n\n${process.checks.map(check => `Check ${escapeText(check.id)} at ${escapeText(check.stepId)}. Candidate: ${escapeText(check.candidateId)}. Expected evidence: ${escapeText(check.evidenceResultId)}. Method: ${check.method}.\n\n${fence(check.criteria.join('\n') || '[UNRESOLVED: check criteria]')}\n\nOutcomes: ${check.outcomes.map(escapeText).join(', ') || '[UNRESOLVED]'}. Check a changed candidate again. Observed result: [NOT RUN].`).join('\n\n') || 'No check recorded.'}\n\n${process.approvals.map(approval => `Approval ${escapeText(approval.id)} at ${escapeText(approval.stepId)} for candidate ${escapeText(approval.candidateId)}. Evidence: ${approval.evidenceResultIds.map(escapeText).join(', ') || '[UNRESOLVED]'}.\n\nRequired authority:\n\n${fence(placeholder(approval.authority, 'approval authority'))}\n\nApproval must concern the current candidate revision. A planned actor or passed check does not grant write permission. Actual approval: [NOT RECORDED].`).join('\n\n') || 'No approval recorded. Confirm whether this application changes data and what authorization it requires.'}\n\n### Failure, correction and completion routes\n\n${fence(process.transitions.map(route => `${route.fromStepId} / ${route.outcome} -> ${destinationText(process, route.to)}`).join('\n') || '[UNRESOLVED: outcome routes]')}\n\n${process.corrections.map(correction => fence(correctionText(process, correction))).join('\n\n') || 'No correction policy recorded. Do not infer retries.'}\n\nTerminal states:\n\n${fence(process.terminals.map(terminal => `${terminal.id}: ${terminal.name} (${terminal.status})`).join('\n') || '[UNRESOLVED: terminal states]')}\n`;
}

function artifactFiles(config) {
  const enabled = getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id));
  const custom = customAssignments(config);
  const projectSources = [...new Set(config.facts.map(fact => fact.source).filter(present))];
  const practiceSources = practices.filter(practice => config.practices.includes(practice.id)).map(practice => practice.source);
  const files = [];
  const add = (path, content, why, stageIds = [], roleIds = [], sources = [], assignments = []) => files.push({ path, content, why, stages: stageIds, roles: roleIds, sources, processes: [...new Set(assignments.map(item => item.process.id))], steps: assignments.map(stepReference), assumptions: ['Project values and supplied evidence require review.', 'Generated instructions do not execute or enforce this workflow.'] });
  add('WORKFLOW.md', workflowContent(config), 'Connect the selected processes, responsible actors, inputs, outcomes, correction limits and expected evidence.', enabled.map(stage => stage.id), [], [], custom);
  add('AGENTS.md', agentsContent(config), 'Give any coding agent that reads the repository root the recorded commands, stage order, owners, acceptance and boundaries in one short file.', enabled.map(stage => stage.id), config.agents.map(agent => agent.role), [SOURCES.agentsMd], custom);
  add('project.json', json(config), 'Preserve the versioned editable configuration as the authoritative saved representation.', [], [], [], custom);
  add('INSTALL.md', installContent(config), 'Review destinations and exercise the selected host before adoption.', [], [], [SOURCES.agents]);
  add('SOURCES.md', sourceContent(config), 'Trace adapted practices and project claims to their recorded sources.', [], [], [...practiceSources, ...projectSources]);
  add('PROJECT-FACTS.md', `# Project facts\n\nEntered component values are unverified project data. Status describes supplied provenance and review, not independent verification by Atlas.\n\n${factsText(config)}\n\n## Components\n\n${componentText(config)}\n`, 'Expose the provenance, status and unresolved parts of project facts.', [], [], projectSources);
  add('EVIDENCE.md', evidenceContent(config), 'Keep expected checks separate from supplied observed results.', config.evidence.map(record => record.stageId).filter(Boolean), [], [], custom.filter(({ process, step }) => config.workflowModel.evidenceLinks.some(link => link.processId === process.id && process.checks.some(check => check.id === link.checkId && check.stepId === step.id))));
  const selectedIds = new Set(enabled.map(stage => stage.id));
  if (['requirements', 'current-process', 'feasibility-scope', 'reproduction'].some(id => selectedIds.has(id))) add('templates/REQUIREMENTS.md', requirementTemplate(config), 'Capture the request, acceptance examples and requirement sources.', enabled.filter(stage => ['requirements', 'current-process', 'feasibility-scope', 'reproduction'].includes(stage.id)).map(stage => stage.id));
  if (['architecture', 'options', 'recommendation', 'diagnosis'].some(id => selectedIds.has(id))) add('templates/DECISION.md', decisionTemplate(config), 'Record options, assumptions and a supported design or feasibility decision.', enabled.filter(stage => ['architecture', 'options', 'recommendation', 'diagnosis'].includes(stage.id)).map(stage => stage.id));
  if (['verification', 'reproduction', 'regression', 'experiment-plan'].some(id => selectedIds.has(id))) add('templates/VERIFICATION.md', verificationTemplate(), 'Record actual commands or procedures, results, failures and unrun checks.', enabled.filter(stage => ['verification', 'reproduction', 'regression', 'experiment-plan'].includes(stage.id)).map(stage => stage.id));
  if (['experiment-plan', 'verification', 'regression'].some(id => selectedIds.has(id)) || config.runtime.enabled || custom.length) add('templates/EVALUATION.md', evaluationTemplate(config), 'Prepare representative tasks, declared outcome paths and correction limit cases without claiming they have run.', enabled.filter(stage => ['experiment-plan', 'verification', 'reproduction', 'regression'].includes(stage.id)).map(stage => stage.id), [], [], custom);
  if (config.runtime.enabled) {
    add('RUNTIME-DESIGN.md', runtimeContent(config), 'Describe the finished backend feature and link controls to implementation and evidence. The fixed architecture remains illustrative.');
  }
  const applicationAssignments = custom.filter(({ process }) => process.kind === 'application');
  const hasApplication = config.workflowModel.processes.some(process => process.source === 'custom' && process.kind === 'application');
  if (config.runtime.enabled || hasApplication) add('templates/CONTRACTS.md', contractsTemplate(config), hasApplication ? 'Draft request, tool, response and failure contracts from the recorded application design.' : 'Draft request, tool, response and failure contracts for the selected runtime design.', [], [], [], applicationAssignments);
  for (const skill of getEffectiveSkills(config)) {
    const usedStages = enabled.filter(stage => config.workflow.bindings[stage.id]?.skills.includes(skill.id));
    const usedCustom = customAssignments(config, skill.id);
    const usedRoles = [...new Set([...usedStages.filter(stage => config.workflow.bindings[stage.id].actorType === 'agent').map(stage => config.workflow.bindings[stage.id].actorId), ...usedCustom.filter(({ process, step }) => process.kind !== 'application' && step.actor.type === 'agent' && config.agents.some(agent => agent.role === step.actor.id)).map(({ step }) => step.actor.id)])];
    add(`.github/skills/${skill.id}/SKILL.md`, skillContent(skill, config), usedStages.length || usedCustom.length ? `Provide ${skill.label.toLowerCase()} only for the assigned workflow steps.` : 'Preserve a deliberately selected extra library skill.', usedStages.map(stage => stage.id), usedRoles, [SOURCES.skills, ...practiceSources], usedCustom);
    add(`.github/skills/${skill.id}/references/project.md`, projectReference(config, skill.id), 'Provide self contained project context, result definitions, checks and routes when this skill needs them.', usedStages.map(stage => stage.id), usedRoles, projectSources, usedCustom);
  }
  for (const role of roles) { const agent = config.agents.find(item => item.role === role.id); if (agent) add(`.github/agents/${role.id}.agent.md`, agentContent(agent, config), 'Assign development or manual responsibilities, requested capabilities and relevant skills. Application actors remain a separate design.', assignedStages(config, role.id).map(stage => stage.id), [role.id], [SOURCES.agents], customRoleAssignments(config, role.id)); }
  return files;
}

function removeFencedData(content) {
  let length = 0;
  return content.split('\n').filter(line => { const opening = line.match(/^(`{3,})([^`]*)$/); if (!length && opening) { length = opening[1].length; return false; } if (length && new RegExp(`^\u0060{${length},}\\s*$`).test(line)) { length = 0; return false; } return !length; }).join('\n');
}

function resolveReference(file, target) {
  const path = file.split('/').slice(0, -1);
  for (const segment of target.split('/')) { if (segment === '.') continue; if (segment === '..') { if (!path.length) return null; path.pop(); } else path.push(segment); }
  return path.join('/');
}

function formatIssues(files) {
  const issues = [];
  const paths = new Set();
  const references = new Set([...files.map(file => file.path), 'VALIDATION.md', 'manifest.json']);
  for (const file of files) {
    if (!safeOutputPath(file.path)) issues.push({ severity: 'error', code: 'unsafe-output', path: file.path, message: 'Generated paths must be portable and repository relative.' });
    if (paths.has(file.path.toLowerCase())) issues.push({ severity: 'error', code: 'duplicate-output', path: file.path, message: 'Generated paths must be unique on case insensitive filesystems.' }); paths.add(file.path.toLowerCase());
    if (file.path.endsWith('.agent.md') && file.content.split('\n---\n')[1]?.length > 30000) issues.push({ severity: 'error', code: 'agent-length', path: file.path, message: 'Agent prompt exceeds 30,000 characters.' });
    if (file.path === 'AGENTS.md') {
      const size = bytes(file.content);
      if (size > 32 * 1024) issues.push({ severity: 'error', code: 'agents-length', path: file.path, message: 'AGENTS.md exceeds 32 KiB, the documented Codex combined limit. Shorten recorded notes or move detail to WORKFLOW.md.' });
      else if (size > 16 * 1024) issues.push({ severity: 'warning', code: 'agents-length', path: file.path, message: 'AGENTS.md exceeds 16 KiB. Some hosts read only the first 16 KiB.' });
    }
    if (file.path.endsWith('/SKILL.md')) {
      const id = file.path.split('/').at(-2);
      const name = file.content.match(/^name: (.+)$/m)?.[1];
      const description = file.content.match(/^description: (.+)$/m)?.[1];
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 64 || name !== JSON.stringify(id) || !description || JSON.parse(description).length > 1024) issues.push({ severity: 'error', code: 'skill-format', path: file.path, message: 'Skill metadata violates selected format rules.' });
    }
    if (file.path.endsWith('.md')) for (const match of removeFencedData(file.content).replace(/(`+)[\s\S]*?\1/g, '').matchAll(/(?<!\\)\[[^\]]*\]\(([^)]+)\)/g)) {
      if (/^https:\/\//.test(match[1])) continue;
      const resolved = resolveReference(file.path, match[1]);
      if (!resolved || !references.has(resolved)) issues.push({ severity: 'error', code: 'missing-reference', path: file.path, message: `Internal resource is missing: ${match[1]}.` });
    }
  }
  return issues;
}

function validateForOutput(config, outputKind) {
  const structural = shapeIssues(config);
  if (structural.length) return { issues: structural, configurationComplete: false, formatChecked: false, hostExercised: false };
  const issues = ruleIssues(config, outputKind);
  if (issues.some(issue => issue.code === 'project-size' || issue.blocking)) return { issues, configurationComplete: false, formatChecked: false, hostExercised: false };
  const formats = formatIssues(artifactFiles(config)); issues.push(...formats);
  const adapterError = issues.some(issue => issue.severity === 'error' && ['unknown-host', 'unknown-role', 'unknown-selection', 'unknown-tool', 'cloud-tool', 'duplicate-agent', 'duplicate-selection', 'duplicate-tool'].includes(issue.code));
  return { issues, configurationComplete: !issues.some(issue => issue.severity === 'error' || ['workflow-unresolved', 'workflow-stale-evidence'].includes(issue.code)), formatChecked: !formats.some(issue => issue.severity === 'error') && !adapterError, hostExercised: false };
}

export function validate(config) {
  return validateForOutput(config, 'pack');
}

function validationContent(validation) {
  return `# Validation record\n\n- Configuration complete: ${validation.configurationComplete ? 'yes, under factory rules' : 'no, draft'}\n- Format checked: ${validation.formatChecked ? 'yes, factory rules' : 'no, format or adapter errors'}\n- Host exercised: no\n- Task behavior observed by Atlas: no\n- Outcome improvement established: no\n\n## Findings\n\n${validation.issues.map(issue => `- **${issue.severity.toUpperCase()} ${escapeText(issue.code)}** at ${escapeText(issue.path)}. ${escapeText(issue.message)}`).join('\n') || 'No rule issues found.'}\n\n## Scope\n\nThe factory checks the versioned shape, selected definitions, actor and capability consistency, prerequisites, path syntax, metadata and internal references.\n\nRepository path existence, source content, command execution, actual tool availability, supplied evidence authenticity, model access, host discovery, task success and production outcomes remain unverified. Recorded evidence describes supplied information only.\n\nTechnology profiles add relevant questions and expected checks. They do not establish compatibility or expert support for every technology.\n`;
}

function finish(files, validation, manifest) {
  manifest.appVersion = APP_VERSION;
  const withValidation = [...files, { path: 'VALIDATION.md', content: validationContent(validation), why: 'Expose rule findings and the limits of what the factory checked.', stages: [], roles: [], sources: [], assumptions: [] }];
  manifest.files = [...withValidation.map(file => file.path), 'manifest.json'].sort();
  withValidation.push({ path: 'manifest.json', content: json(manifest), why: 'Record definition versions, export scope and artifact membership.', stages: [], roles: [], sources: [], assumptions: [] });
  withValidation.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  if (formatIssues(withValidation).some(issue => ['unsafe-output', 'duplicate-output'].includes(issue.code))) throw new Error('Generated pack contains unsafe or duplicate paths.');
  return { files: withValidation, validation, reasons: Object.fromEntries(withValidation.map(file => [file.path, { purpose: file.why, stages: file.stages, roles: file.roles, processes: file.processes || [], steps: file.steps || [], sources: file.sources, assumptions: file.assumptions }])), stats: { fileCount: withValidation.length, bytes: withValidation.reduce((sum, file) => sum + bytes(file.content), 0) } };
}

export function compile(config) {
  const structural = shapeIssues(config);
  if (structural.length) throw new Error(`${structural[0].path}: ${structural[0].message}`);
  serializeProject(config);
  const validation = validate(config);
  return finish(artifactFiles(config), validation, {
    schemaVersion: SCHEMA_VERSION, workflowModelVersion: config.workflowModel.version, templateVersion: EXPORTER_VERSION, exporterVersion: EXPORTER_VERSION, catalogVersion: DEFINITION_VERSION, reviewedOn: REVIEW_DATE,
    kind: 'pack', target: { family: 'github-copilot', environment: config.project.host }, recipe: config.workflow.recipe, draft: !validation.configurationComplete,
    validation: { configurationComplete: validation.configurationComplete, formatChecked: validation.formatChecked, hostExercised: false, behaviorObserved: false, improvementEstablished: false },
    practices: practices.filter(practice => config.practices.includes(practice.id)).map(practice => ({ id: practice.id, adaptationVersion: practice.version, source: practice.source, reviewedOn: practiceReviewDate(practice) })),
    guidanceSnapshot: guidanceSnapshot(config),
    artifacts: artifactFiles(config).map(file => ({ path: file.path, purpose: file.why, stages: file.stages, roles: file.roles, processes: file.processes || [], steps: file.steps || [] })),
  });
}

export function compileSelectedOutput(config, selection = { kind: 'pack' }) {
  const kind = selection?.kind;
  if (!['blueprint', 'skill', 'pack'].includes(kind)) throw new Error('Choose a supported output: blueprint, skill or pack.');
  if (kind === 'pack') return compile(config);
  const complete = compile(config);
  const skill = kind === 'skill' ? skills.find(item => item.id === selection.skillId) : null;
  if (kind === 'skill' && !skill) throw new Error('Choose a supported skill.');
  if (kind === 'skill' && !getEffectiveSkills(config).some(item => item.id === skill.id)) throw new Error('Assign or select this skill before exporting it.');
  const prefix = skill ? `.github/skills/${skill.id}/` : '';
  const files = complete.files.filter(file => !['VALIDATION.md', 'manifest.json'].includes(file.path) && (kind === 'blueprint' ? !file.path.startsWith('.github/') && file.path !== 'AGENTS.md' : file.path === 'project.json' || file.path === 'INSTALL.md' || file.path.startsWith(prefix)));
  if (kind === 'blueprint') {
    files.find(file => file.path === 'WORKFLOW.md').content = workflowContent(config, kind);
    files.find(file => file.path === 'SOURCES.md').content = sourceContent(config, kind);
  }
  const install = files.find(file => file.path === 'INSTALL.md');
  install.content = installContent(config, selection);
  install.why = kind === 'blueprint' ? 'Explain a human owned handoff and how to record results and reopen the plan.' : 'Explain where to place the complete skill directory and how to exercise it in the selected host.';
  install.sources = kind === 'blueprint' ? [] : [SOURCES.copilotSkills];
  const issues = ruleIssues(config, kind);
  const formats = formatIssues(files);
  issues.push(...formats);
  const adapterError = kind !== 'blueprint' && issues.some(issue => issue.severity === 'error' && ['unknown-host', 'unknown-role', 'unknown-selection', 'unknown-tool', 'cloud-tool', 'duplicate-agent', 'duplicate-selection', 'duplicate-tool'].includes(issue.code));
  const validation = { issues, configurationComplete: !issues.some(issue => issue.severity === 'error' || ['workflow-unresolved', 'workflow-stale-evidence'].includes(issue.code)), formatChecked: !formats.some(issue => issue.severity === 'error') && !adapterError, hostExercised: false };
  const manifest = JSON.parse(complete.files.find(file => file.path === 'manifest.json').content);
  Object.assign(manifest, {
    kind,
    target: kind === 'blueprint' ? { family: 'workflow-blueprint', environment: 'human-handoff' } : manifest.target,
    draft: !validation.configurationComplete,
    validation: { configurationComplete: validation.configurationComplete, formatChecked: validation.formatChecked, hostExercised: false, behaviorObserved: false, improvementEstablished: false },
    artifacts: files.map(file => ({ path: file.path, purpose: file.why, stages: file.stages, roles: file.roles, processes: file.processes || [], steps: file.steps || [] })),
  });
  if (skill) manifest.skill = skill.id;
  return finish(files, validation, manifest);
}

export function compileStandaloneSkill(config, skillId) {
  const structural = shapeIssues(config);
  if (structural.length) throw new Error(`${structural[0].path}: ${structural[0].message}`);
  serializeProject(config);
  const skill = skills.find(skill => skill.id === skillId);
  if (!skill) throw new Error('Choose a supported skill.');
  const assignments = customAssignments(config, skillId);
  const associations = { processes: [...new Set(assignments.map(item => item.process.id))], steps: assignments.map(stepReference) };
  const files = [{ path: `${skillId}/SKILL.md`, content: skillContent(skill, config), why: 'Export a focused portable procedure.', stages: [], roles: [], sources: [SOURCES.skills], assumptions: [], ...associations }, { path: `${skillId}/references/project.md`, content: projectReference(config, skill.id), why: 'Include all required project resources inside the skill directory.', stages: [], roles: [], sources: [], assumptions: [], ...associations }];
  const complete = validateForOutput(config, 'standalone-skill');
  const formats = formatIssues(files);
  const validation = { ...complete, formatChecked: !formats.some(issue => issue.severity === 'error'), issues: [...complete.issues, ...formats] };
  return finish(files, validation, { schemaVersion: SCHEMA_VERSION, workflowModelVersion: config.workflowModel.version, templateVersion: EXPORTER_VERSION, exporterVersion: EXPORTER_VERSION, reviewedOn: REVIEW_DATE, kind: 'standalone-skill', skill: skillId, draft: !validation.configurationComplete, artifacts: files.map(file => ({ path: file.path, purpose: file.why, stages: file.stages, roles: file.roles, processes: file.processes, steps: file.steps })), validation: { configurationComplete: validation.configurationComplete, formatChecked: validation.formatChecked, hostExercised: false } });
}




