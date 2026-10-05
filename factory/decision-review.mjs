import { CATALOG, compile, compileSelectedOutput, getEffectiveSkills, getStages, parseImport } from './core.mjs';
import { validateFilePaths } from './zip.mjs';

export const DECISION_REVIEW_MAX_BYTES = 8 * 1024 * 1024;
const VERSION = '1.0';
const KIND = 'workflow-decision-review';
const encoder = new TextEncoder();
const clone = value => JSON.parse(JSON.stringify(value));
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
const canonical = value => Array.isArray(value) ? value.map(canonical) : plainObject(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const same = (left, right) => JSON.stringify(canonical(left)) === JSON.stringify(canonical(right));
const stageLabel = id => CATALOG.stages.find(stage => stage.id === id)?.title || id;
const roleLabel = id => CATALOG.roles.find(role => role.id === id)?.label || id;
const skillLabel = id => CATALOG.skills.find(skill => skill.id === id)?.label || id;
const practiceLabel = id => CATALOG.practices.find(practice => practice.id === id)?.label || id;
const sorted = values => [...new Set(values)].sort();
const stagesForRole = (config, role) => getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id) && config.workflow.bindings[stage.id]?.actorType === 'agent' && config.workflow.bindings[stage.id]?.actorId === role).map(stage => stage.id);
const stagesForSkill = (config, skill) => getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id) && config.workflow.bindings[stage.id]?.skills.includes(skill)).map(stage => stage.id);

function project(value) {
  if (!plainObject(value)) throw new Error('Supply parsed project settings for the decision review.');
  return parseImport(JSON.stringify(value));
}

function reasonText(value) {
  if (typeof value !== 'string' || value.length > 20000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error('Decision reason must be text of at most 20,000 characters without control characters.');
  return value;
}

function outputSelection(value) {
  if (!plainObject(value) || Object.keys(value).some(key => !['kind', 'skillId'].includes(key)) || !['blueprint', 'skill', 'pack'].includes(value.kind)) throw new Error('Choose a supported decision review output.');
  if (value.kind === 'skill' && typeof value.skillId !== 'string') throw new Error('Choose a skill for this decision review output.');
  if (value.kind !== 'skill' && value.skillId !== undefined && value.skillId !== null) throw new Error('Only a focused skill output can include a skill id.');
  return { kind: value.kind, skillId: value.kind === 'skill' ? value.skillId : null };
}

function inventory(pack) {
  return pack.files.map(file => ({ path: file.path, stages: sorted(file.stages || []), roles: sorted(file.roles || []) })).sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
}

function changedFiles(before, after) {
  const oldFiles = new Map(before.files.map(file => [file.path, file]));
  const newFiles = new Map(after.files.map(file => [file.path, file]));
  return sorted([...oldFiles.keys(), ...newFiles.keys()]).flatMap(path => {
    const previous = oldFiles.get(path);
    const current = newFiles.get(path);
    if (previous && current && previous.content === current.content) return [];
    return [{ path, change: !previous ? 'added' : !current ? 'removed' : 'updated', stageIds: sorted([...(previous?.stages || []), ...(current?.stages || [])]), roleIds: sorted([...(previous?.roles || []), ...(current?.roles || [])]) }];
  });
}

function semanticChanges(baseline, current, affectedFiles) {
  const changes = [];
  const enabled = sorted([...baseline.workflow.enabledStages, ...current.workflow.enabledStages]);
  const paths = (...prefixes) => affectedFiles.filter(file => prefixes.some(prefix => file.path === prefix || file.path.startsWith(prefix))).map(file => file.path);
  const add = (path, label, before, after, summary, stageIds = [], filePaths = null) => {
    const oldValue = before === undefined ? null : before;
    const newValue = after === undefined ? null : after;
    if (same(oldValue, newValue)) return;
    const associated = filePaths || affectedFiles.filter(file => file.stageIds.some(id => stageIds.includes(id)) || file.path === 'WORKFLOW.md' || file.path === 'project.json' || file.path === 'VALIDATION.md' || file.path === 'manifest.json').map(file => file.path);
    changes.push({ id: path, path, label, before: clone(oldValue), after: clone(newValue), summary, stageIds: sorted(stageIds), affectedFiles: sorted(associated) });
  };
  const projectLabels = { name: 'Project name', purpose: 'Intended outcome', host: 'Intended Copilot environment', sourceControl: 'Source control', sourceLocations: 'Recorded source locations' };
  for (const [field, label] of Object.entries(projectLabels)) add(`project.${field}`, label, baseline.project[field], current.project[field], field === 'purpose' ? 'The requested outcome changed. This is an intended result, not an observed completion.' : field === 'host' ? 'The target environment changed. Availability, discovery and behavior still need a trial in that host.' : field === 'sourceLocations' ? 'The recorded source locations changed. Atlas has not retrieved or verified their contents.' : 'The recorded project value changed.', enabled, affectedFiles.map(file => file.path));
  add('workflow.recipe', 'Workflow recipe', baseline.workflow.recipe, current.workflow.recipe, 'The workflow recipe changed. Its fixed steps and expected handoffs describe planned work, not a running scheduler.', enabled);
  for (const stageId of enabled) add(`workflow.enabledStages.${stageId}`, stageLabel(stageId), baseline.workflow.enabledStages.includes(stageId), current.workflow.enabledStages.includes(stageId), current.workflow.enabledStages.includes(stageId) ? 'This step is included in the plan. Its actor still needs to perform the work and supply the expected output.' : 'This step is omitted from the plan. Later steps still need its prerequisite output, or a supplied existing input.', [stageId]);
  if (same(sorted(baseline.workflow.enabledStages), sorted(current.workflow.enabledStages))) add('workflow.enabledStages.order', 'Recorded step order', baseline.workflow.enabledStages, current.workflow.enabledStages, 'The saved selection order changed. The recipe topology and generated handoff order stay fixed.', enabled, paths('project.json'));
  const questionLabel = id => CATALOG.recipes.flatMap(recipe => recipe.questions).find(question => question.id === id)?.label || CATALOG.technologyProfiles.flatMap(profile => profile.questions.map((label, index) => ({ id: `technology-${profile.id}-${index}`, label }))).find(question => question.id === id)?.label || id;
  for (const id of sorted([...Object.keys(baseline.workflow.answers), ...Object.keys(current.workflow.answers)])) add(`workflow.answers.${id}`, questionLabel(id), baseline.workflow.answers[id], current.workflow.answers[id], 'The recorded answer changed. It remains project supplied context and does not establish requirement acceptance.', enabled, paths('WORKFLOW.md', 'project.json', 'VALIDATION.md', 'templates/', '.github/skills/'));
  for (const id of sorted([...Object.keys(baseline.workflow.notes), ...Object.keys(current.workflow.notes)])) add(`workflow.notes.${id}`, `${stageLabel(id)} notes`, baseline.workflow.notes[id], current.workflow.notes[id], current.workflow.enabledStages.includes(id) ? 'The supplied instructions for this step changed. Instructions do not establish that work ran.' : 'Saved context for an omitted step changed. It is retained in project settings.', [id]);
  for (const id of sorted([...Object.keys(baseline.workflow.suppliedInputs), ...Object.keys(current.workflow.suppliedInputs)])) add(`workflow.suppliedInputs.${id}`, `Existing ${stageLabel(id)} input`, baseline.workflow.suppliedInputs[id], current.workflow.suppliedInputs[id], 'The recorded location of an existing prerequisite changed. Its presence does not verify that the artifact exists or satisfies the receiving step.', enabled.filter(stageId => CATALOG.stages.find(stage => stage.id === stageId)?.dependsOn.includes(id)));
  for (const id of sorted([...Object.keys(baseline.workflow.bindings), ...Object.keys(current.workflow.bindings)])) {
    const previous = baseline.workflow.bindings[id];
    const next = current.workflow.bindings[id];
    if (!previous || !next) { add(`workflow.bindings.${id}`, `${stageLabel(id)} assignment`, previous, next, 'A saved assignment was added or removed. The assignment records responsibility and requested skills, not actual execution.', [id]); continue; }
    const actor = binding => ({ actorType: binding.actorType, actorId: binding.actorId, actorName: binding.actorName });
    add(`workflow.bindings.${id}.actor`, `${stageLabel(id)} owner`, actor(previous), actor(next), next.actorType === 'agent' ? 'An agent role is the recorded owner. Exported instructions and requested tools still depend on the selected host.' : 'A person or external system is the recorded owner. Atlas does not contact that owner or execute the step.', [id]);
    add(`workflow.bindings.${id}.skills`, `${stageLabel(id)} skills`, previous.skills, next.skills, 'The requested procedures for this step changed. Skill selection does not establish discovery or task success.', [id]);
    add(`workflow.bindings.${id}.contextOnly`, `${stageLabel(id)} supplied context boundary`, previous.contextOnly, next.contextOnly, next.contextOnly ? 'The assignment is a review of supplied context only. A person or external system must perform any underlying changes or execution.' : 'The supplied context only instruction was removed. Available tools and actual project authorization still govern the work.', [id]);
  }
  const handoffs = (config, id) => config.workflow.enabledStages.includes(id) ? (CATALOG.stages.find(stage => stage.id === id)?.dependsOn || []).map(stageId => ({ stageId, source: config.workflow.enabledStages.includes(stageId) ? 'included-step' : 'existing-input', location: config.workflow.enabledStages.includes(stageId) ? '' : config.workflow.suppliedInputs[stageId] || '' })) : [];
  for (const id of enabled) add(`workflow.prerequisites.${id}`, `${stageLabel(id)} handoff`, handoffs(baseline, id), handoffs(current, id), 'The planned prerequisite handoff changed. An included step or a recorded location is not evidence that the required output has been accepted.', [id]);
  const records = (path, before, after, key, label, description, stageIds, filePaths) => {
    const oldRows = new Map(before.map(record => [record[key], record]));
    const newRows = new Map(after.map(record => [record[key], record]));
    for (const id of sorted([...oldRows.keys(), ...newRows.keys()])) add(`${path}.${id}`, label(id, oldRows.get(id), newRows.get(id)), oldRows.get(id), newRows.get(id), description, stageIds(id, oldRows.get(id), newRows.get(id)), typeof filePaths === 'function' ? filePaths(id) : filePaths);
    if (same(sorted([...oldRows.keys()]), sorted([...newRows.keys()]))) add(`${path}.$order`, `${path.endsWith('.technologies') ? 'Technologies' : path === 'components' ? 'Components' : path === 'agents' ? 'Agent profiles' : path === 'runtime.controls' ? 'Runtime controls' : path === 'facts' ? 'Facts' : 'Evidence'} recorded order`, before.map(record => record[key]), after.map(record => record[key]), 'The saved record order changed. The records keep their supplied meaning.', [], paths('project.json', ...(path === 'components' || path.endsWith('.technologies') ? ['WORKFLOW.md', 'PROJECT-FACTS.md', '.github/skills/'] : path === 'facts' ? ['PROJECT-FACTS.md', 'SOURCES.md', '.github/skills/'] : path === 'evidence' ? ['EVIDENCE.md'] : path === 'runtime.controls' ? ['RUNTIME-DESIGN.md'] : [])));
  };
  const modelPaths = paths('project.json', 'WORKFLOW.md', 'VALIDATION.md', 'manifest.json');
  const oldProcesses = new Map(baseline.workflowModel.processes.map(process => [process.id, process]));
  const newProcesses = new Map(current.workflowModel.processes.map(process => [process.id, process]));
  for (const id of sorted([...oldProcesses.keys(), ...newProcesses.keys()])) {
    const before = oldProcesses.get(id);
    const after = newProcesses.get(id);
    const prefix = `workflowModel.processes.${id}`;
    const name = after?.name || before?.name || id;
    if (!before || !after || before.source !== after.source) {
      add(prefix, `${name} process`, before, after, 'The recorded process definition changed. A recipe reference uses the saved recipe settings. Custom process records describe intended work, not execution.', [], modelPaths);
      continue;
    }
    for (const field of ['kind', 'name', 'purpose', 'pattern', 'entryStepId']) add(`${prefix}.${field}`, `${name} ${field}`, before[field], after[field], 'The process design changed. Declared outcomes do not establish an observed result.', [], modelPaths);
    if (after.source === 'custom') for (const field of ['steps', 'results', 'checks', 'transitions', 'corrections', 'approvals', 'terminals']) records(`${prefix}.${field}`, before[field], after[field], 'id', recordId => `${name}: ${field} ${recordId}`, 'A planned process record changed. Review its input relationships, routes and stopping conditions. Instructions do not enforce these decisions.', () => [], modelPaths);
  }
  add('workflowModel.processes.$order', 'Process reading order', baseline.workflowModel.processes.map(process => process.id), current.workflowModel.processes.map(process => process.id), 'The reading order changed. It does not schedule processes or make one start another.', [], modelPaths);
  records('workflowModel.evidenceLinks', baseline.workflowModel.evidenceLinks, current.workflowModel.evidenceLinks, 'id', id => `Candidate evidence reference ${id}`, 'The association with supplied evidence changed. Candidate identity and revision must match before applicability can be assessed. Atlas has not executed or verified this evidence.', () => [], modelPaths);
  const oldComponents = new Map(baseline.components.map(component => [component.id, component]));
  const newComponents = new Map(current.components.map(component => [component.id, component]));
  for (const id of sorted([...oldComponents.keys(), ...newComponents.keys()])) {
    const previous = oldComponents.get(id);
    const next = newComponents.get(id);
    const name = next?.name || previous?.name || id;
    const prefix = `components.${id}`;
    if (!previous || !next) { add(prefix, `${name} component`, previous, next, 'A repository component was added or removed. Its paths, technologies and commands are supplied context, not verified repository contents.', enabled, affectedFiles.map(file => file.path)); continue; }
    add(`${prefix}.name`, `${name} name`, previous.name, next.name, 'The supplied component name changed.', enabled, affectedFiles.map(file => file.path));
    add(`${prefix}.path`, `${name} repository location`, previous.path, next.path, 'The supplied repository relative path changed. Atlas has not checked that this location exists.', enabled, affectedFiles.map(file => file.path));
    for (const kind of ['test', 'lint', 'build']) add(`${prefix}.commands.${kind}`, `${name} ${kind} command`, previous.commands[kind], next.commands[kind], 'The supplied command changed. It was recorded, not run. Confirm its directory and actual project authorization before execution.', enabled, paths('WORKFLOW.md', 'PROJECT-FACTS.md', '.github/skills/', 'project.json', 'VALIDATION.md'));
    records(`${prefix}.technologies`, previous.technologies, next.technologies, 'id', technology => `${name}: ${CATALOG.technologies.find(item => item.id === technology)?.label || technology}`, 'The recorded technology or version changed. This is supplied context, not a compatibility check or proof of specialist support.', () => enabled, paths('WORKFLOW.md', 'PROJECT-FACTS.md', 'SOURCES.md', '.github/skills/', 'project.json', 'VALIDATION.md'));
  }
  if (same(sorted([...oldComponents.keys()]), sorted([...newComponents.keys()]))) add('components.$order', 'Recorded component order', baseline.components.map(component => component.id), current.components.map(component => component.id), 'The component display order changed. The recorded paths and commands keep their supplied meaning.', enabled, paths('WORKFLOW.md', 'PROJECT-FACTS.md', '.github/skills/', 'project.json'));
  add('skills', 'Additional library skills', baseline.skills, current.skills, 'The additional skill library selection changed. A library skill is not automatically assigned to every agent or step.', sorted([...baseline.skills, ...current.skills].flatMap(id => [...stagesForSkill(baseline, id), ...stagesForSkill(current, id)])), paths('.github/skills/', 'project.json', 'VALIDATION.md', 'manifest.json'));
  records('agents', baseline.agents, current.agents, 'role', id => `${roleLabel(id)} requested capabilities`, 'The selected profile or requested tool aliases changed. These are host instructions, not configured integrations, credentials or enforced runtime permissions. Execution and delegation can cause changes.', id => [...stagesForRole(baseline, id), ...stagesForRole(current, id)], id => paths(`.github/agents/${id}.agent.md`, 'project.json', 'VALIDATION.md', 'manifest.json'));
  add('constraints.approvalRequired', 'Human approval instruction', baseline.constraints.approvalRequired, current.constraints.approvalRequired, current.constraints.approvalRequired ? 'The exported instructions require human approval before merge, deployment or changes to external systems. The selected host and actual project policy must enforce approvals.' : 'That approval instruction was removed. The actual project and host policy still applies.', enabled, paths('WORKFLOW.md', '.github/', 'project.json', 'VALIDATION.md'));
  add('constraints.readOnly', 'Read only instruction', baseline.constraints.readOnly, current.constraints.readOnly, current.constraints.readOnly ? 'A read only instruction is selected. The host or runtime must enforce permissions. Conflicting requested tools remain visible in validation.' : 'The read only instruction was removed. This does not grant actual permissions.', enabled, paths('WORKFLOW.md', '.github/', 'project.json', 'VALIDATION.md'));
  add('constraints.notes', 'Recorded boundary context', baseline.constraints.notes, current.constraints.notes, 'The supplied boundary notes changed. Their consistency and actual policy authority need human review.', enabled, paths('WORKFLOW.md', '.github/', 'project.json', 'VALIDATION.md'));
  records('facts', baseline.facts, current.facts, 'id', id => `Recorded fact: ${id}`, 'A supplied fact, source, revision or review status changed. Confirmation is the supplied assertion, not independent verification by Atlas.', () => [], paths('PROJECT-FACTS.md', 'SOURCES.md', '.github/skills/', 'project.json', 'VALIDATION.md'));
  records('evidence', baseline.evidence, current.evidence, 'id', id => `Supplied evidence: ${id}`, 'A supplied check or observation changed. Planned checks are not results. Recorded or passing status remains a supplied assessment, not an Atlas execution or authentication.', (id, before, after) => [before?.stageId, after?.stageId].filter(Boolean), paths('EVIDENCE.md', '.github/skills/', 'project.json', 'VALIDATION.md', 'RUNTIME-DESIGN.md'));
  for (const field of ['name', 'version', 'budget', 'notes']) add(`model.${field}`, `Recorded model ${field}`, baseline.model[field], current.model[field], 'The supplied model or budget record changed. Atlas does not route model calls, measure expenditure or establish effectiveness.', [], paths('EVIDENCE.md', 'templates/EVALUATION.md', '.github/skills/', 'project.json'));
  add('runtime.enabled', 'Backend runtime design draft', baseline.runtime.enabled, current.runtime.enabled, current.runtime.enabled ? 'The runtime design draft is included. This does not create or deploy a backend agent.' : 'The runtime design draft is omitted from generated outputs. Its settings remain in project.json.', [], paths('RUNTIME-DESIGN.md', 'templates/CONTRACTS.md', 'templates/EVALUATION.md', 'SOURCES.md', 'project.json', 'VALIDATION.md', 'manifest.json'));
  const runtimeLabels = { outcome: 'Expected runtime result', requiredInputs: 'Required runtime inputs', judgment: 'Runtime judgment boundary', tools: 'Recorded runtime tools', validation: 'Runtime validation requirements', limits: 'Runtime execution limits', duplicates: 'Runtime duplicate handling', failures: 'Runtime failure handling', confirmation: 'Runtime result confirmation' };
  for (const [field, label] of Object.entries(runtimeLabels)) add(`runtime.${field}`, label, baseline.runtime[field], current.runtime[field], current.runtime.enabled ? 'The recorded runtime design requirement changed. Implementation and observed evidence must be supplied separately.' : 'Recorded context for the omitted runtime design changed. It remains in project settings.', [], paths('RUNTIME-DESIGN.md', 'project.json', 'VALIDATION.md'));
  const oldControls = new Map(baseline.runtime.controls.map(control => [control.id, control]));
  const newControls = new Map(current.runtime.controls.map(control => [control.id, control]));
  for (const id of sorted([...oldControls.keys(), ...newControls.keys()])) {
    const previous = oldControls.get(id);
    const next = newControls.get(id);
    const label = next?.label || previous?.label || id;
    const prefix = `runtime.controls.${id}`;
    if (!previous || !next) { add(prefix, label, previous, next, 'A recorded runtime control was added or removed. A requirement is not enforced. An implementation link is not verified. Recorded evidence may still describe a failure.', [], paths('RUNTIME-DESIGN.md', 'project.json', 'VALIDATION.md')); continue; }
    add(`${prefix}.label`, `${label} recorded label`, previous.label, next.label, 'The supplied label changed. It does not define an enforced control.', [], paths('RUNTIME-DESIGN.md', 'project.json'));
    add(`${prefix}.status`, `${label} recorded status`, previous.status, next.status, 'The supplied progress status changed. A requirement is not enforced. Linked implementation is not verified and recorded evidence may still describe a failure.', [], paths('RUNTIME-DESIGN.md', 'project.json', 'VALIDATION.md'));
    add(`${prefix}.implementation`, `${label} implementation location`, previous.implementation, next.implementation, 'The recorded implementation location changed. Atlas has not inspected or verified that implementation.', [], paths('RUNTIME-DESIGN.md', 'project.json', 'VALIDATION.md'));
    add(`${prefix}.evidenceId`, `${label} evidence link`, previous.evidenceId, next.evidenceId, 'The supplied evidence reference changed. An evidence link does not establish a passing result or authenticate an observation.', [], paths('RUNTIME-DESIGN.md', 'project.json', 'VALIDATION.md'));
  }
  if (same(sorted([...oldControls.keys()]), sorted([...newControls.keys()]))) add('runtime.controls.$order', 'Recorded runtime control order', baseline.runtime.controls.map(control => control.id), current.runtime.controls.map(control => control.id), 'The saved control order changed. Requirements, implementation locations and evidence keep their supplied meaning.', [], paths('RUNTIME-DESIGN.md', 'project.json'));
  add('practices', 'Selected reference practices', baseline.practices, current.practices, 'The selected guidance changed. Practices are adapted instructions, not installed tools or proof of productivity improvement.', enabled, paths('WORKFLOW.md', 'SOURCES.md', '.github/', 'project.json', 'manifest.json'));
  return changes;
}

export function createDecisionReview(baselineInput, currentInput, { reason = '', selection = { kind: 'pack' } } = {}) {
  const baseline = project(baselineInput);
  const current = project(currentInput);
  const chosen = outputSelection(selection);
  const beforePack = compile(baseline);
  const afterPack = compile(current);
  const currentOutput = compileSelectedOutput(current, chosen);
  const baselineAvailable = chosen.kind !== 'skill' || getEffectiveSkills(baseline).some(skill => skill.id === chosen.skillId);
  const previousOutput = baselineAvailable ? compileSelectedOutput(baseline, chosen) : null;
  const affectedFiles = changedFiles(beforePack, afterPack);
  const record = {
    schemaVersion: VERSION, kind: KIND, definitionVersion: CATALOG.version,
    reason: reasonText(reason), baseline, current,
    output: { ...chosen, baselineScope: baselineAvailable ? 'selected-output' : 'unavailable', baselineFiles: previousOutput ? inventory(previousOutput) : [], currentFiles: inventory(currentOutput) },
    changes: semanticChanges(baseline, current, affectedFiles),
    affectedFiles,
    scope: 'Full generation changes are calculated from these exact settings. Per decision file lists associate changed paths with generated stage metadata and document scope. They do not isolate causal effects when several decisions change together. Arbitrary text is recorded context. Supplied Markdown edits do not change project settings.',
  };
  ensureSize(record);
  return record;
}

function ensureSize(record) {
  if (encoder.encode(JSON.stringify(record, null, 2)).length + 1 > DECISION_REVIEW_MAX_BYTES) throw new Error('Decision review exceeds the 8 MiB JSON limit. Reduce the supplied review text or project context. No values were truncated.');
}

export function parseDecisionReview(text, { current } = {}) {
  if (typeof text !== 'string' || encoder.encode(text).length > DECISION_REVIEW_MAX_BYTES) throw new Error('Decision review must be JSON text no larger than 8 MiB.');
  let supplied;
  try { supplied = JSON.parse(text); } catch { throw new Error('The decision review is not valid JSON.'); }
  if (!plainObject(supplied) || supplied.schemaVersion !== VERSION || supplied.kind !== KIND || supplied.definitionVersion !== CATALOG.version) throw new Error('Unsupported decision review record or definition version.');
  const fresh = createDecisionReview(supplied.baseline, supplied.current, { reason: supplied.reason, selection: { kind: supplied.output?.kind, skillId: supplied.output?.skillId } });
  if (!same(supplied, fresh)) throw new Error('Decision review metadata or summaries do not match fresh generation from its settings. The supplied record was not applied.');
  if (current !== undefined && !same(project(current), fresh.current)) throw new Error('Decision review current settings do not match the opened project. The supplied record was not applied.');
  return fresh;
}

function restoreShape(record) {
  const object = (value, fields, label) => {
    if (!plainObject(value) || Object.keys(value).some(key => !fields.includes(key)) || fields.some(key => !Object.hasOwn(value, key))) throw new Error(`${label} has missing or unsupported fields.`);
  };
  const text = (value, label, maximum = 20000) => {
    if (typeof value !== 'string' || value.length > maximum || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new Error(`${label} must be bounded text without control characters.`);
  };
  const list = (value, label, maximum = 4096) => {
    if (!Array.isArray(value) || value.length > maximum) throw new Error(`${label} must be an array of no more than ${maximum} entries.`);
  };
  const textList = (value, label, maximum = 100) => {
    list(value, label, maximum);
    value.forEach(item => text(item, label, 200));
    if (new Set(value).size !== value.length) throw new Error(`${label} must not contain duplicates.`);
  };
  const filePaths = (value, label) => {
    list(value, label);
    value.forEach(path => text(path, label, 2000));
    const issues = validateFilePaths(value.map(path => ({ path, content: '' })));
    if (issues.length) throw new Error(`${label} is unsafe. ${issues[0].message}`);
  };
  const jsonData = (value, label) => {
    const pending = [{ value, depth: 0 }];
    while (pending.length) {
      const entry = pending.pop();
      if (entry.depth > 32) throw new Error(`${label} is too deeply nested.`);
      if (entry.value === null || typeof entry.value === 'boolean') continue;
      if (typeof entry.value === 'string') { text(entry.value, label); continue; }
      if (typeof entry.value === 'number') { if (!Number.isFinite(entry.value)) throw new Error(`${label} contains a nonfinite number.`); continue; }
      if (Array.isArray(entry.value)) { list(entry.value, label); pending.push(...entry.value.map(value => ({ value, depth: entry.depth + 1 }))); continue; }
      if (!plainObject(entry.value) || Object.keys(entry.value).some(key => ['__proto__', 'constructor', 'prototype'].includes(key))) throw new Error(`${label} must contain ordinary JSON data.`);
      for (const [key, value] of Object.entries(entry.value)) { text(key, label, 2000); pending.push({ value, depth: entry.depth + 1 }); }
    }
  };
  object(record, ['schemaVersion', 'kind', 'definitionVersion', 'reason', 'baseline', 'current', 'output', 'changes', 'affectedFiles', 'scope'], 'Decision review');
  if (record.schemaVersion !== VERSION || record.kind !== KIND) throw new Error('Unsupported decision review schema or kind.');
  text(record.definitionVersion, 'Definition version', 200);
  if (!/^\d+\.\d+\.\d+(?:[-+][a-z0-9.-]+)?$/i.test(record.definitionVersion)) throw new Error('Decision review definition version is malformed.');
  reasonText(record.reason);
  text(record.scope, 'Review scope', 4000);
  object(record.output, ['kind', 'skillId', 'baselineScope', 'baselineFiles', 'currentFiles'], 'Decision review output');
  outputSelection({ kind: record.output.kind, skillId: record.output.skillId });
  if (!['selected-output', 'unavailable'].includes(record.output.baselineScope)) throw new Error('Decision review baseline output scope is unsupported.');
  for (const field of ['baselineFiles', 'currentFiles']) {
    list(record.output[field], `Output ${field}`);
    for (const row of record.output[field]) {
      object(row, ['path', 'stages', 'roles'], 'Output inventory entry');
      textList(row.stages, 'Output stage ids');
      textList(row.roles, 'Output role ids');
    }
    filePaths(record.output[field].map(row => row.path), `Output ${field} paths`);
  }
  list(record.changes, 'Decision changes');
  const ids = new Set();
  for (const change of record.changes) {
    object(change, ['id', 'path', 'label', 'before', 'after', 'summary', 'stageIds', 'affectedFiles'], 'Decision change');
    for (const field of ['id', 'path', 'label']) text(change[field], `Decision ${field}`, 2000);
    if (!change.id || !change.path || ids.has(change.id)) throw new Error('Decision change ids and paths must be nonempty and unique.');
    ids.add(change.id);
    text(change.summary, 'Decision summary');
    jsonData(change.before, 'Decision before value');
    jsonData(change.after, 'Decision after value');
    textList(change.stageIds, 'Decision stage ids');
    filePaths(change.affectedFiles, 'Decision affected paths');
  }
  list(record.affectedFiles, 'Generated file changes');
  for (const row of record.affectedFiles) {
    object(row, ['path', 'change', 'stageIds', 'roleIds'], 'Generated file change');
    if (!['added', 'updated', 'removed'].includes(row.change)) throw new Error('Generated file change kind is unsupported.');
    textList(row.stageIds, 'Generated file stage ids');
    textList(row.roleIds, 'Generated file role ids');
  }
  filePaths(record.affectedFiles.map(row => row.path), 'Generated change paths');
}

// Restoration uses the supplied baseline and reason only. Derived claims are rebuilt.
export function restoreDecisionReview(text, { current } = {}) {
  if (typeof text !== 'string' || encoder.encode(text).length > DECISION_REVIEW_MAX_BYTES) throw new Error('Decision review must be JSON text no larger than 8 MiB.');
  let supplied;
  try { supplied = JSON.parse(text); } catch { throw new Error('The decision review is not valid JSON.'); }
  restoreShape(supplied);
  const baseline = project(supplied.baseline);
  const recordedCurrent = project(supplied.current);
  // project() accepts only supported, validated migrations. Compare their canonical settings below.
  if (current === undefined) throw new Error('Supply the opened project before restoring a decision review.');
  if (!same(project(current), recordedCurrent)) throw new Error('Decision review current settings do not match the opened project. The supplied record was not applied.');
  const review = createDecisionReview(baseline, recordedCurrent, { reason: supplied.reason, selection: { kind: supplied.output.kind, skillId: supplied.output.skillId } });
  const warnings = same(supplied, review) ? [] : ['Restored the supplied baseline and reason. Previous definition metadata and decision summaries were replaced by fresh generation. The supplied reason and any recorded results remain unverified.'];
  return { review, warnings };
}

const markdownText = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replace(/[\\`*_{}\[\]#|]/g, '\\$&').replace(/[\r\n]+/g, ' ');
function valueBlock(value) {
  const content = typeof value === 'string' ? value : JSON.stringify(canonical(value), null, 2);
  const limit = 1200;
  const shortened = content.length > limit ? `${content.slice(0, limit)}\n[Display shortened. Full value is in decision-review.json.]` : content;
  const delimiter = '`'.repeat(Math.max(2, ...[...shortened.matchAll(/`+/g)].map(match => match[0].length)) + 1);
  return `${delimiter}text\n${shortened}\n${delimiter}`;
}

export function exportDecisionReview(review) {
  if (!plainObject(review)) throw new Error('Supply a plain decision review record.');
  const record = parseDecisionReview(JSON.stringify(review));
  const count = record.changes.length;
  const outputName = record.output.kind === 'blueprint' ? 'Workflow blueprint' : record.output.kind === 'skill' ? `${skillLabel(record.output.skillId)} skill` : 'Full artifact pack';
  const changeText = record.changes.map(change => `### ${markdownText(change.label)}\n\n${markdownText(change.summary)}\n\nBefore:\n\n${valueBlock(change.before)}\n\nAfter:\n\n${valueBlock(change.after)}\n\n${change.stageIds.length ? `Related steps: ${change.stageIds.map(stageLabel).map(markdownText).join(', ')}.\n\n` : ''}${change.affectedFiles.length ? `Associated changed files: ${change.affectedFiles.map(markdownText).join(', ')}.` : 'No associated generated content changes were identified for this decision.'}`).join('\n\n');
  const content = `# Workflow decision review\n\n${count} recorded decision ${count === 1 ? 'change' : 'changes'} between the supplied baseline and current project settings. This is a baseline comparison, not a history of intermediate edits.\n\n## Reason supplied by the user\n\n${record.reason ? valueBlock(record.reason) : 'No reason was supplied. The review does not infer one.'}\n\n## Download scope\n\n${markdownText(outputName)}. ${record.output.currentFiles.length} generated files before this review record and the portable viewer are added.${record.output.baselineScope === 'unavailable' ? ' This focused skill was not selected in the baseline. There is no previous focused output inventory.' : ''}\n\n## Decisions\n\n${changeText || 'No project decisions changed. Any supplied reason is retained as context.'}\n\n## Generated file changes\n\n${record.affectedFiles.map(file => `- ${markdownText(file.change)}. ${markdownText(file.path)}.`).join('\n') || 'No generated file contents changed.'}\n\n## Limits\n\n${record.scope}\n\nBefore and after values are supplied data. A fact status, evidence status or linked implementation remains a supplied assertion. Atlas has not run commands, verified source content, enforced policy, exercised the host or established a productivity gain. Complete values and exact project settings are in decision-review.json.\n`;
  if (encoder.encode(content).length > DECISION_REVIEW_MAX_BYTES) throw new Error('Readable decision review exceeds the 8 MiB file limit. No review text was truncated.');
  const stages = sorted(record.changes.flatMap(change => change.stageIds));
  return [
    { path: 'DECISION-REVIEW.md', content, why: 'Explain recorded project decision changes, their supplied reason and associated generated files.', stages, roles: [], sources: [], assumptions: ['This comparison records supplied decisions and does not establish execution or enforcement.'] },
    { path: 'decision-review.json', content: `${JSON.stringify(canonical(record), null, 2)}\n`, why: 'Preserve the exact review baseline, current project settings and user supplied reason for explicit reopening.', stages, roles: [], sources: [], assumptions: ['Imported summaries must match fresh generation and the opened project before restoration.'] },
  ];
}
