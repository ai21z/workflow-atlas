import { CATALOG, TOOL_ALIASES, SCHEMA_VERSION, DEFINITION_VERSION, REVIEW_DATE, SOURCES } from './catalog.mjs';
import { guidanceSnapshot } from './guidance-review.mjs';
import { getIntentAnswer } from './intent.mjs';
import { APP_VERSION } from './version.mjs';
import { createWorkflowModel, workflowModelShapeIssues, workflowModelIssues, WORKFLOW_MODEL_LIMITS } from './workflow-model.mjs';
import { workflowModelMarkdown } from './workflow-model-view.mjs';
export { CATALOG, TOOL_ALIASES } from './catalog.mjs';
export const EXPORTER_VERSION = '3.1.0';

const { stages, skills, roles, practices } = CATALOG;
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
  const config = createRecipe(recipeId);
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
  if (object(config.workflow, 'workflow', legacy ? ['recipe', 'enabledStages', 'notes'] : ['recipe', 'enabledStages', 'notes', 'bindings', 'suppliedInputs', 'answers'])) {
    string(config.workflow.recipe, 'workflow.recipe', 200);
    list(config.workflow.enabledStages, 'workflow.enabledStages', 30);
    const stageIds = (legacy ? getStages('feature-delivery') : stages).map(stage => stage.id);
    mapping(config.workflow.notes, 'workflow.notes', stageIds, string);
    if (!legacy) {
      mapping(config.workflow.suppliedInputs, 'workflow.suppliedInputs', stageIds, string);
      mapping(config.workflow.answers, 'workflow.answers', [...CATALOG.recipes.flatMap(recipe => recipe.questions.map(question => question.id)), ...CATALOG.technologyProfiles.flatMap(profile => profile.questions.map((question, index) => `technology-${profile.id}-${index}`))], string);
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
  return (applicable.map(practice => `### ${practice.label}\n\n${practice.application}\n\nScope: ${practice.limits}\n\nReference: [original source](${practice.source}). Local adaptation version ${practice.version}, reviewed ${REVIEW_DATE}.`).join('\n\n') || (humanBlueprint ? 'No additional practice guidance for this blueprint.' : 'No optional reference practices selected.')) + scope;
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
  return `# Project reference\n\nRead only details relevant to the assigned task. Entered values are project data, not verified repository facts. Confirm paths, commands and source content before use. This reference is self contained so the complete skill directory can be exported independently.\n\n## Purpose\n\n${fence(placeholder(config.project.purpose, 'project purpose'))}\n\n## Recorded workflow intent\n\nThese are supplied answers and unresolved questions for the selected workflow. They do not establish approval or observed results.\n\n${intentText(config)}\n\n## Assigned stage context\n\n${skillStageContext(config, skillId)}${processContext ? `\n\n## Custom process assignments\n\n${processContext}` : ''}${commandScope ? `\n\n## Command scope across assigned stages\n\n${commandScope}` : ''}\n\n## Components\n\n${componentText(config)}\n\n## Project facts\n\n${factsText(config)}\n\n## Source locations\n\n${fence(placeholder(config.project.sourceLocations, 'source locations'))}\n\n## Relevant technology questions\n\n${profilesText(config)}\n\n## Boundaries\n\n${boundaryText(config)}\n\nProject supplied constraint notes:\n\n${fence(config.constraints.notes || 'No additional constraint notes supplied.')}\n`;
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
  return `# ${escapeText(placeholder(config.project.name, 'project name'))}\n\n${recipe?.label || 'Process design'} blueprint. This describes planned work and expected evidence. It does not execute the workflow or implement a backend runtime.\n\n## Purpose\n\n${fence(placeholder(config.project.purpose, 'project purpose'))}\n\n## Intent questions\n\n${(recipe?.questions || []).map(question => { const answer = getIntentAnswer(config, question.id); return `### ${question.label}\n\n${answer.inherited ? 'Uses the recorded project outcome.\n\n' : ''}${fence(placeholder(answer.text, question.label))}`; }).join('\n\n')}\n\n## Target\n\nEnvironment: ${CATALOG.hosts.find(host => host.id === config.project.host)?.label || 'UNRESOLVED'}.\n\nSource control: ${escapeText(config.project.sourceControl || 'UNRESOLVED')}.\n\nSee [installation](INSTALL.md), [validation](VALIDATION.md), [sources](SOURCES.md), [project facts](PROJECT-FACTS.md), [evidence](EVIDENCE.md) and authoritative [configuration](project.json).\n\n## Workflow\n\n${fence(`flowchart LR\n${nodes.join('\n')}`, 'mermaid')}\n\nReview feedback returns to the relevant earlier stage. These prerequisites describe handoffs, not an automatic scheduler. Existing artifacts can satisfy omitted producer stages.\n\n${detail}\n${workflowModelMarkdown(config)}\n## Project components\n\n${componentText(config)}\n\n## Boundaries\n\n${boundaryText(config)}\n\nProject supplied constraint notes:\n\n${fence(config.constraints.notes || 'No additional constraint notes supplied.')}\n\n## Selected practices\n\n${practiceText(config, outputKind)}\n`;
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
  return `# Sources and applicability\n\nDefinition review date: ${REVIEW_DATE}. Definition versions identify local adaptations, not upstream release versions. A URL alone does not establish correctness.\n\n${outputKind === 'blueprint' ? '' : `## Format references\n\n- [Agent Skills specification](${SOURCES.skills}). Required metadata, naming and focused supporting references.\n- [GitHub custom agent configuration](${SOURCES.agents}). Explicit tool aliases, target values and metadata. Host behavior must be exercised separately.\n- [Custom agent authoring](${SOURCES.install}). Repository layout and GitHub cloud repository requirements.\n- [Copilot skills](${SOURCES.copilotSkills}). Documented discovery locations.\n\n`}## Technology questions\n\n${profilesText(config)}\n\n## Selected reference practices\n\n${practiceText(config, outputKind)}\n\n${runtimeSources}## Project source locations\n\n${fence(placeholder(config.project.sourceLocations, 'source locations'))}\n\n## Claim trace\n\n${factsText(config)}\n\nThe factory records source locations and supplied confirmations without retrieving or verifying arbitrary content. Preserve original material and distinguish it from derived claims. Conflicting claims remain visible until resolved.\n`;
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
  return `# Requirement brief\n\nThis is an editable evidence template. Empty fields remain unresolved.\n\n## Request and outcome\n\n${fence(placeholder(config.project.purpose, 'intended outcome'))}\n\n## Current behavior and source\n\n${currentSection}\n\n## Recorded requirement context\n\n${context}\n\n## Acceptance examples\n\n${acceptanceSection}\n\n## Boundaries and unresolved values\n\nRecord required inputs, excluded changes, incomplete input behavior and decisions requiring a named owner.\n`;
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

function contractsTemplate() {
  return '# Runtime contract draft\n\nThis editable draft does not define a working integration. Replace unresolved values with project evidence and review the permitted operations.\n\n## Request fields\n\n| Field | Type | Required | Validation rule | Supporting source |\n| --- | --- | --- | --- | --- |\n| [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n\nRecord request identity, caller scope, missing input behavior and the conditions requiring clarification. Define the request lifetime and status retrieval if processing is asynchronous.\n\n## Tool operations\n\n| Operation | Input schema | Permitted read or change scope | Backend operation | Confirmed result |\n| --- | --- | --- | --- | --- |\n| [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n\nBackend authorization and business validation must be specified before persistence. Instruction text does not enforce the contract.\n\n## Response fields\n\n| Field or outcome | Backend confirmed value | Inferred value or assumption | Unresolved information | Evidence source |\n| --- | --- | --- | --- | --- |\n| [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n\nCompleted actions must refer to actual backend results and identifiers. State when no valid result was produced rather than inferring completion.\n\n## Failure and retry outcomes\n\n| Situation | Observable state | Retry or recovery rule | Duplicate prevention | Returned status or explanation |\n| --- | --- | --- | --- | --- |\n| Missing information | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n| Validation rejects a change | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n| Backend failure | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n| Timeout with uncertain write result | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n| Duplicate request | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] | [UNRESOLVED] |\n\nRecord idempotency scope, retention and recovery of a prior confirmed result. A timeout does not establish that a write failed.\n';
}

function artifactFiles(config) {
  const enabled = getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id));
  const custom = customAssignments(config);
  const projectSources = [...new Set(config.facts.map(fact => fact.source).filter(present))];
  const practiceSources = practices.filter(practice => config.practices.includes(practice.id)).map(practice => practice.source);
  const files = [];
  const add = (path, content, why, stageIds = [], roleIds = [], sources = [], assignments = []) => files.push({ path, content, why, stages: stageIds, roles: roleIds, sources, processes: [...new Set(assignments.map(item => item.process.id))], steps: assignments.map(stepReference), assumptions: ['Project values and supplied evidence require review.', 'Generated instructions do not execute or enforce this workflow.'] });
  add('WORKFLOW.md', workflowContent(config), 'Connect the selected processes, responsible actors, inputs, outcomes, correction limits and expected evidence.', enabled.map(stage => stage.id), [], [], custom);
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
    add('templates/CONTRACTS.md', contractsTemplate(), 'Draft request, tool, response and failure contracts for the selected runtime design.');
  }
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
    if (file.path.endsWith('/SKILL.md')) {
      const id = file.path.split('/').at(-2);
      const name = file.content.match(/^name: (.+)$/m)?.[1];
      const description = file.content.match(/^description: (.+)$/m)?.[1];
      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || id.length > 64 || name !== JSON.stringify(id) || !description || JSON.parse(description).length > 1024) issues.push({ severity: 'error', code: 'skill-format', path: file.path, message: 'Skill metadata violates selected format rules.' });
    }
    if (file.path.endsWith('.md')) for (const match of removeFencedData(file.content).matchAll(/(?<!\\)\[[^\]]*\]\(([^)]+)\)/g)) {
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
    practices: practices.filter(practice => config.practices.includes(practice.id)).map(practice => ({ id: practice.id, adaptationVersion: practice.version, source: practice.source, reviewedOn: REVIEW_DATE })),
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
  const files = complete.files.filter(file => !['VALIDATION.md', 'manifest.json'].includes(file.path) && (kind === 'blueprint' ? !file.path.startsWith('.github/') : file.path === 'project.json' || file.path === 'INSTALL.md' || file.path.startsWith(prefix)));
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




