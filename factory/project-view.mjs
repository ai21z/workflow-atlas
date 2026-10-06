import { CATALOG, getStages, getEffectiveSkills } from './core.mjs';
import { renderDecisionBrief } from './decision-brief.mjs';
import { getIntentAnswer, getIntentQuestionWording } from './intent.mjs';
import { renderWorkflowModel, WORKFLOW_MODEL_STYLES } from './workflow-model-view.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const has = value => typeof value === 'string' && value.trim().length > 0;
const copy = (value, fallback = 'Still to decide') => `<span class="pv-copy${has(value) ? '' : ' pv-unresolved'}">${escape(has(value) ? value : fallback)}</span>`;
const label = value => String(value || 'unresolved').replaceAll('-', ' ');
const icon = (name = 'arrow') => {
  const paths = { arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>', book: '<path d="M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zM20 4h-4a3 3 0 0 0-3 3m0 14a4 4 0 0 1 4-2h3V4"/>', flow: '<rect x="8" y="2" width="8" height="5" rx="1"/><rect x="2" y="17" width="8" height="5" rx="1"/><rect x="14" y="17" width="8" height="5" rx="1"/><path d="M12 7v5M6 17v-5h12v5"/>', diamond: '<path d="m12 3 9 9-9 9-9-9z"/>', person: '<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>', spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>', system: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4M7 9h4m-4 4h8"/>', file: '<path d="M5 2h9l5 5v15H5zM14 2v6h5M8 13h8m-8 4h5"/>', layers: '<path d="m12 3 10 5-10 5L2 8zm-9 10 9 5 9-5M3 18l9 5 9-5"/>', evidence: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6m-14-11 2 2 4-4"/>', link: '<path d="m9 15 6-6m-8 4-2 2a4 4 0 0 0 6 6l2-2m-2-14 2-2a4 4 0 0 1 6 6l-2 2"/>', edit: '<path d="m15 3 6 6-12 12H3v-6zm-2 2 6 6"/>', grip: '<circle cx="8" cy="5" r="1"/><circle cx="16" cy="5" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="19" r="1"/><circle cx="16" cy="19" r="1"/>' };
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
};
const action = (attribute, value, text, className = '') => `<button type="button" class="pv-action ${className}" ${attribute}="${escape(value)}">${escape(text)}${icon('arrow')}</button>`;
const badge = (status, text = label(status)) => `<span class="pv-badge pv-badge-${escape(status)}">${escape(text)}</span>`;
const heading = (eyebrow, title, description, extra = '', level = 2) => {
  const tag = level === 1 ? 'h1' : 'h2';
  return `<header class="pv-section-heading"><div><p class="pv-eyebrow">${escape(eyebrow)}</p><${tag}>${escape(title)}</${tag}>${description ? `<p>${escape(description)}</p>` : ''}</div>${extra}</header>`;
};
const roleOf = id => CATALOG.roles.find(role => role.id === id);
const skillOf = id => CATALOG.skills.find(skill => skill.id === id);
const recipeOf = config => getStages(config).length ? CATALOG.recipes.find(recipe => recipe.id === config.workflow.recipe) : undefined;
const enabledStages = config => getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id));
function actorFor(config, stage) {
  const binding = config.workflow.bindings[stage.id] || {};
  const type = binding.actorType || 'human';
  return { type, name: type === 'agent' ? roleOf(binding.actorId)?.label || binding.actorId || 'Choose an agent' : has(binding.actorName) ? binding.actorName : (type === 'external' ? 'Name the external system' : 'Name the owner'), contextOnly: type === 'agent' && binding.contextOnly };
}
function actorChip(config, stage) {
  const actor = actorFor(config, stage);
  return `<span class="pv-actor pv-actor-${escape(actor.type)}">${icon(actor.type === 'agent' ? 'spark' : actor.type === 'external' ? 'system' : 'person')}<span>${escape(actor.name)}</span>${actor.contextOnly ? '<small>context only</small>' : ''}</span>`;
}
const processKindLabel = kind => ({ manual: 'A team process', development: 'How we build it', application: 'How it works when used' })[kind] || 'Process';
function processActorChip(step) {
  const actor = step.actor;
  const name = actor.name || (actor.type === 'agent' ? roleOf(actor.id)?.label || actor.id : actor.id) || (actor.type === 'external' ? 'System still to name' : actor.type === 'agent' ? 'Agent role still to choose' : 'Person still to name');
  return `<span class="pv-actor pv-actor-${escape(actor.type)}">${icon(actor.type === 'agent' ? 'spark' : actor.type === 'external' ? 'system' : 'person')}<span>${escape(name)}</span>${actor.contextOnly ? '<small>context only</small>' : ''}</span>`;
}
function stageFiles(pack, id) {
  return (pack?.files || []).filter(file => file.stages?.includes(id) && !['VALIDATION.md', 'manifest.json'].includes(file.path));
}
function fileLink(file) {
  return `<button type="button" class="pv-file" data-select-file="${escape(file.path)}">${icon('file')}<span>${escape(file.path)}</span>${icon('arrow')}</button>`;
}
function dependencies(config, stage) {
  const active = new Set(config.workflow.enabledStages);
  return (stage.dependsOn || []).map(id => {
    const parent = CATALOG.stages.find(item => item.id === id);
    const supplied = config.workflow.suppliedInputs?.[id];
    return `<span class="pv-dependency${!active.has(id) && !has(supplied) ? ' pv-dependency-open' : ''}">${icon('link')}<span>${escape(active.has(id) ? `Depends on: ${parent?.title || id}` : has(supplied) ? `Supplied input: ${supplied}` : `Input needed: ${parent?.title || id}`)}</span></span>`;
  }).join('');
}

function stageCard(config, pack, stage, index, selected, editing, nextStage) {
  const skills = (config.workflow.bindings[stage.id]?.skills || []).map(skillOf).filter(Boolean);
  const files = stageFiles(pack, stage.id);
  const records = (config.evidence || []).filter(record => record.stageId === stage.id);
  return `<article class="pv-stage${selected === stage.id ? ' is-selected' : ''}${editing ? ' is-editable' : ''}" data-drop-stage="${escape(stage.id)}" data-connect-next="${Boolean(nextStage?.dependsOn?.includes(stage.id))}" aria-label="${escape(stage.title)}">
    <h3 class="pv-stage-heading"><button type="button" class="pv-stage-select" data-select-stage="${escape(stage.id)}" aria-label="${editing ? 'Edit' : 'Explore'} ${escape(stage.title)}"${selected === stage.id ? ' aria-current="step"' : ''}>
      <span class="pv-stage-number">${String(index + 1).padStart(2, '0')}</span><span class="pv-stage-title">${escape(stage.title)}</span><span class="pv-stage-open">${icon(editing ? 'edit' : 'arrow')}</span>
    </button></h3>
    <div class="pv-stage-body"><p class="pv-stage-purpose">${escape(stage.purpose)}</p>${actorChip(config, stage)}
      <div class="pv-stage-output"><span class="pv-mini-label">Expected output</span><p>${escape(stage.outputs[0])}</p></div>
      <div class="pv-skill-list">${skills.length ? skills.map(skill => `<span class="pv-skill-chip">${icon('spark')}${escape(skill.label)}</span>`).join('') : '<span class="pv-muted">No procedure attached</span>'}</div>
      ${dependencies(config, stage) ? `<div class="pv-dependencies">${dependencies(config, stage)}</div>` : ''}
      ${has(config.workflow.notes[stage.id]) ? `<p class="pv-stage-note">${escape(config.workflow.notes[stage.id])}</p>` : ''}
    </div>
    <footer class="pv-stage-footer"><span>${files.length} linked ${files.length === 1 ? 'file' : 'files'}${records.length ? ` · ${records.length} evidence ${records.length === 1 ? 'record' : 'records'}` : ''}</span><button type="button" data-reference-topic="${escape(stage.atlasTopic)}" aria-label="Read guidance for ${escape(stage.title)}">${icon('book')}<span>Guidance</span></button></footer>
  </article>`;
}

function perspectives(view, runtime) {
  const items = [['overview', 'Overview', 'layers'], ['workflow', 'Workflow', 'flow'], ['architecture', 'Runtime design', 'system'], ['evidence', 'Evidence & sources', 'evidence']];
  return `<nav class="pv-perspectives" aria-label="Project perspectives">${items.map(([id, title, symbol]) => `<button type="button" data-project-view="${id}" class="${view === id ? 'is-current' : ''}"${view === id ? ' aria-current="page"' : ''}>${icon(symbol)}<span>${title}</span>${id === 'architecture' && !runtime ? '<span class="pv-optional">optional</span>' : ''}</button>`).join('')}</nav>`;
}

function knowledgeEntry() {
  return `<section class="pv-knowledge-entry" aria-labelledby="pv-knowledge-title">
    <div class="pv-knowledge-copy"><p class="pv-eyebrow">Reference concepts</p><h2 id="pv-knowledge-title">Knowledge map</h2><p>Explore connected topics, practical examples and linked sources. This map explains the concepts behind a workflow.</p>${action('data-reference-map', 'overview', 'Open knowledge map', 'pv-action-primary')}<p class="pv-footnote">The reference map is separate from your current project stages.</p></div>
    <svg class="pv-knowledge-preview" viewBox="0 0 180 160" fill="none" aria-hidden="true"><g class="pv-map-lines"><path d="M86 79 41 28 17 92 57 137 86 79 141 129 161 49 86 79 110 15 161 49M41 28l69-13M17 92l69-13M57 137l84-8M41 28l120 21"/></g><g class="pv-map-nodes"><circle cx="41" cy="28" r="9"/><circle cx="17" cy="92" r="6"/><circle cx="57" cy="137" r="8"/><circle cx="141" cy="129" r="8"/><circle cx="161" cy="49" r="10"/><circle cx="110" cy="15" r="5"/></g><circle class="pv-map-halo" cx="86" cy="79" r="27"/><circle class="pv-map-center" cx="86" cy="79" r="13"/></svg>
  </section>`;
}

function overview(config, pack) {
  const stages = enabledStages(config);
  const recipe = recipeOf(config);
  const customOnly = !recipe;
  const processes = config.workflowModel.processes.filter(process => process.source === 'custom');
  const processSteps = processes.flatMap(process => process.steps.map(step => ({ process, step })));
  const count = customOnly ? processSteps.length : stages.length;
  const effectiveSkills = getEffectiveSkills(config);
  const unanswered = (recipe?.questions || []).filter(question => !has(getIntentAnswer(config, question.id).text));
  const components = config.components.filter(component => has(component.name) || component.technologies.length);
  const fileCount = pack?.files?.length || 0;
  const synthetic = /fictional example|synthetic example/i.test(`${config.project.purpose} ${config.project.sourceLocations}`);
  return `<section class="pv-hero">
    <div class="pv-hero-top"><span class="pv-eyebrow">Your project atlas</span>${badge(synthetic ? 'inferred' : 'planned', synthetic ? 'Fictional worked example' : 'Design in progress')}</div>
    <h1>${escape(config.project.name || 'Your project workflow')}</h1>
  </section>
  ${renderDecisionBrief(config, { editable: true })}
  <div class="pv-starting-points">${knowledgeEntry()}<section class="pv-project-entry"><p class="pv-eyebrow">Your choices in this session</p><h2>Current project workflow</h2><p>${customOnly ? count ? `Review ${count} planned ${count === 1 ? 'step' : 'steps'} across ${processes.length} ${processes.length === 1 ? 'process' : 'processes'}. Open a process to edit its owners, inputs and outcome routes.` : 'Design a process to connect the work, its checks and what happens next.' : `Review ${stages.length} selected ${stages.length === 1 ? 'stage' : 'stages'}, their owners and expected outputs. Select a stage to adapt its instructions.`}</p><div class="pv-entry-actions">${action('data-project-view', 'workflow', 'Explore project workflow')}${action('data-open-editor', 'project', 'Edit project details')}</div><p class="pv-footnote">Then choose Preview files and download your project to keep it.</p></section></div>
  <details class="pv-overview-detail"><summary>More project detail</summary><div class="pv-overview-detail-body">
  <div class="pv-metrics"><div><strong>${count}</strong><span>${customOnly ? 'planned process steps' : 'workflow stages'}</span></div><div><strong>${effectiveSkills.length}</strong><span>reusable skills</span></div><div><strong>${fileCount}</strong><span>files in the pack</span></div><div><strong>${(config.evidence || []).length}</strong><span>evidence records</span></div></div>
  <section class="pv-section">${heading(customOnly ? 'The process design' : 'The journey', recipe?.label || 'Processes and connections', customOnly ? 'Open a process to follow its outcome routes. The list does not imply execution order.' : recipe?.description || '', customOnly ? action('data-project-view', 'workflow', 'Edit processes') : action('data-open-editor', 'intent', 'Change recipe'))}
    <div class="pv-journey" aria-label="${customOnly ? 'Planned processes' : 'Included workflow stages'}">${customOnly ? processes.map(process => `<button type="button" data-pe-open="${escape(process.id)}"><span>${escape(processKindLabel(process.kind))}</span><strong>${escape(process.name || process.id)}</strong>${icon('arrow')}</button>`).join('') : stages.map((stage, index) => `<button type="button" data-select-stage="${escape(stage.id)}"><span>${String(index + 1).padStart(2, '0')}</span><strong>${escape(stage.title)}</strong>${icon('arrow')}</button>`).join('')}</div>
    ${customOnly ? !processes.length ? '<p class="pv-empty-note">No process designed yet. Open Workflow to add one.</p>' : '' : !stages.length ? '<p class="pv-empty-note">Choose the stages that belong in this project.</p>' : ''}
  </section>
  <div class="pv-two-col">
    <section class="pv-panel">${heading('Intent', 'The decisions that shape the work', '', customOnly ? action('data-project-view', 'workflow', 'Edit process purposes') : action('data-open-editor', 'intent', 'Edit'))}<div class="pv-decision-list">${customOnly ? processes.map(process => `<article><h3>${escape(process.name || process.id)}</h3>${copy(process.purpose, 'The purpose of this process is still to decide.')}<p class="pv-footnote">${escape(processKindLabel(process.kind))}. ${escape(label(process.pattern.id))} pattern. Planned work, not observed execution.</p></article>`).join('') || '<p class="pv-empty-note">Add a process and describe what it should achieve.</p>' : (recipe?.questions || []).map(getIntentQuestionWording).map(question => { const answer = getIntentAnswer(config, question.id); return `<article><h3>${escape(question.label)}</h3>${copy(answer.text, 'An open question. Add your answer when the outcome is understood.')}${answer.inherited ? '<p class="pv-footnote">Uses your project outcome.</p>' : ''}</article>`; }).join('')}</div>${unanswered.length ? `<p class="pv-footnote">${unanswered.length} ${unanswered.length === 1 ? 'question remains' : 'questions remain'} open. You can download an unfinished project.</p>` : ''}</section>
    <section class="pv-panel">${heading('Project context', 'Where this workflow belongs', '', action('data-open-editor', 'project', 'Edit'))}
      <div class="pv-components">${components.length ? components.map(component => `<article><div class="pv-component-title">${icon('layers')}<h3>${escape(component.name || 'Unnamed component')}</h3></div><p class="pv-path">${escape(component.path || 'Repository path still to confirm')}</p><div class="pv-tech-list">${component.technologies.map(technology => `<span>${escape(CATALOG.technologies.find(item => item.id === technology.id)?.label || technology.id)}${technology.version ? ` <small>${escape(technology.version)}</small>` : ''}</span>`).join('')}</div></article>`).join('') : `<p class="pv-empty-note">${customOnly ? 'No software components recorded. Add them only if this process needs them.' : 'Add the components and technologies relevant to this workflow.'}</p>`}</div>
      <div class="pv-context-row"><span>Instruction target</span><strong>${escape(CATALOG.hosts.find(host => host.id === config.project.host)?.label || config.project.host || 'Not chosen')}</strong></div><div class="pv-context-row"><span>Source control</span><strong>${escape(config.project.sourceControl || 'Not chosen')}</strong></div>
    </section>
  </div>
  <div class="pv-two-col">
    <section class="pv-panel">${heading('Responsibilities', 'People, agents and systems', '', customOnly ? action('data-project-view', 'workflow', 'Review assignments') : action('data-open-editor', 'artifacts', 'Review roles'))}<div class="pv-ownership">${customOnly ? processSteps.map(({ process, step }) => `<div><button type="button" data-pe-open="${escape(process.id)}" data-pe-step="${escape(step.id)}" aria-label="Edit ${escape(step.name || step.id)} in ${escape(process.name || process.id)}">${escape(step.name || step.id)}</button>${processActorChip(step)}</div>`).join('') || '<p class="pv-empty-note">No process steps yet.</p>' : stages.map(stage => `<div><button type="button" data-select-stage="${escape(stage.id)}">${escape(stage.title)}</button>${actorChip(config, stage)}</div>`).join('')}</div>${customOnly ? '<p class="pv-footnote">Assignments describe planned responsibilities. Application actors need their own implementation and permissions.</p>' : ''}</section>
    <section class="pv-panel pv-handoff-panel">${heading('Portable handoff', 'The explanation travels with the work', 'Review the generated instructions and the decisions behind them.')}<div class="pv-output-list">${(pack?.files || []).filter(file => ['WORKFLOW.md', 'PROJECT-FACTS.md', 'EVIDENCE.md', 'RUNTIME-DESIGN.md'].includes(file.path)).map(fileLink).join('')}</div>${action('data-open-editor', 'review', 'Review all files')}<p class="pv-footnote">Agent profiles describe intended behavior. Your host and backend must provide the capabilities and enforce the boundaries.</p></section>
  </div></div></details>`;
}

function palette(config) {
  const roles = config.agents.map(agent => roleOf(agent.role)).filter(Boolean);
  const actors = [{ type: 'human', id: '', name: 'Person', icon: 'person' }, ...roles.map(role => ({ type: 'agent', id: role.id, name: role.label, icon: 'spark' })), { type: 'external', id: '', name: 'External system', icon: 'system' }];
  return `<aside class="pv-palette" aria-label="Workflow building blocks"><div class="pv-palette-intro"><span class="pv-eyebrow">Make it yours</span><h3>Assign a responsibility. Attach a skill.</h3><p>Drag a block onto a stage, or select a block and then select its stage.</p></div><div class="pv-palette-group"><span class="pv-mini-label">Responsible actor</span><div class="pv-palette-items">${actors.map(actor => `<button type="button" draggable="true" data-drag-actor="${actor.type}" data-palette-actor="${actor.type}" aria-pressed="false" data-actor-id="${escape(actor.id)}" class="pv-palette-item pv-palette-actor">${icon(actor.icon)}<span>${escape(actor.name)}</span>${icon('grip')}</button>`).join('')}</div></div><div class="pv-palette-group"><span class="pv-mini-label">Procedure</span><div class="pv-palette-items">${CATALOG.skills.map(skill => `<button type="button" draggable="true" data-drag-skill="${escape(skill.id)}" data-palette-skill="${escape(skill.id)}" aria-pressed="false" class="pv-palette-item" title="${escape(skill.description)}">${icon('spark')}<span>${escape(skill.label)}</span>${icon('grip')}</button>`).join('')}</div></div></aside>`;
}

function authoringPalette(config, open) {
  const roles = config.agents.map(agent => roleOf(agent.role)).filter(Boolean);
  const actors = [{ type: 'human', id: '', name: 'Person', icon: 'person' }, ...roles.map(role => ({ type: 'agent', id: role.id, name: role.label, icon: 'spark' })), { type: 'external', id: '', name: 'External system', icon: 'system' }];
  return `<details class="pv-assignment-library" data-authoring-palette${open ? ' open' : ''}>
    <summary>${icon('spark')}<span>Add a role or skill</span><span class="pv-disclosure-marker" aria-hidden="true">+</span></summary>
    <div class="pv-assignment-content"><p class="pv-library-help">Select a role or skill, then select its stage. You can also drag it onto a stage.</p>
      <div class="pv-palette-group"><h3 class="pv-mini-label">Responsible actor</h3><div class="pv-palette-items">${actors.map(actor => `<button type="button" draggable="true" data-drag-actor="${actor.type}" data-palette-actor="${actor.type}" aria-pressed="false" data-actor-id="${escape(actor.id)}" class="pv-palette-item pv-palette-actor">${icon(actor.icon)}<span>${escape(actor.name)}</span></button>`).join('')}</div></div>
      <div class="pv-palette-group"><h3 class="pv-mini-label">Skills</h3><div class="pv-palette-items">${CATALOG.skills.map(skill => `<button type="button" draggable="true" data-drag-skill="${escape(skill.id)}" data-palette-skill="${escape(skill.id)}" aria-pressed="false" class="pv-palette-item" title="${escape(skill.description)}">${icon('spark')}<span>${escape(skill.label)}</span></button>`).join('')}</div></div>
      <div class="pv-library-footer"><span class="pv-library-help">Change the available roles, instructions and tool requests.</span>${action('data-goto', 'artifacts', 'Manage roles and skills')}</div>
    </div>
  </details>`;
}

function authoringStageIssues(config, pack, stage) {
  const bindingPath = `workflow.bindings.${stage.id}`;
  const prerequisites = (stage.dependsOn || []).filter(id => !config.workflow.enabledStages.includes(id) && !has(config.workflow.suppliedInputs?.[id]));
  return (pack?.validation?.issues || []).filter(issue => {
    if (issue.severity !== 'error') return false;
    if (issue.path === bindingPath || issue.path.startsWith(`${bindingPath}.`)) return true;
    if (prerequisites.some(id => issue.path === `workflow.suppliedInputs.${id}`)) return true;
    const evidenceIndex = /^evidence\[(\d+)\]/.exec(issue.path)?.[1];
    return evidenceIndex !== undefined && config.evidence?.[Number(evidenceIndex)]?.stageId === stage.id;
  });
}

function authoringStageCard(config, pack, stage, index, selected, nextStage) {
  const included = config.workflow.enabledStages.includes(stage.id);
  const assignedSkills = (config.workflow.bindings[stage.id]?.skills || []).map(skillOf).filter(Boolean);
  const issues = authoringStageIssues(config, pack, stage);
  const titleId = `pv-authoring-title-${stage.id}`;
  const purposeId = `pv-authoring-purpose-${stage.id}`;
  return `<article class="pv-stage pv-authoring-stage${selected === stage.id ? ' is-selected' : ''}${included ? '' : ' is-excluded'}" data-drop-stage="${escape(stage.id)}" data-connect-next="${Boolean(included && config.workflow.enabledStages.includes(nextStage?.id) && nextStage?.dependsOn?.includes(stage.id))}">
    <h3 class="pv-stage-heading"><button type="button" class="pv-stage-select" data-select-stage="${escape(stage.id)}" aria-pressed="${selected === stage.id}" aria-labelledby="${titleId}" aria-describedby="${purposeId}">
      <span class="pv-stage-number">${String(index + 1).padStart(2, '0')}</span><span class="pv-stage-title" id="${titleId}">${escape(stage.title)}</span><span class="pv-stage-open">${icon('edit')}</span>
    </button></h3>
    <div class="pv-stage-body">${included ? '' : '<p class="pv-stage-excluded-label">Excluded from this pack. Select to include or inspect.</p>'}<p class="pv-stage-purpose" id="${purposeId}">${escape(stage.purpose)}</p>
      <div class="pv-stage-responsibility">${actorChip(config, stage)}</div>
      <div class="pv-stage-output"><span class="pv-mini-label">Output</span><p>${escape(stage.outputs[0] || 'Output still to decide')}</p></div>
      ${assignedSkills.length ? `<div class="pv-skill-list" aria-label="Assigned skills">${assignedSkills.map(skill => `<span class="pv-skill-chip">${escape(skill.label)}</span>`).join('')}</div>` : ''}
      ${dependencies(config, stage) ? `<div class="pv-dependencies">${dependencies(config, stage)}</div>` : ''}
      ${issues.length ? `<p class="pv-stage-attention"><strong>Needs attention</strong><span>${escape(issues[0].message)}${issues.length > 1 ? ` ${issues.length - 1} more ${issues.length === 2 ? 'item' : 'items'} in stage details.` : ''}</span></p>` : ''}
    </div>
    <footer class="pv-stage-footer"><span>${selected === stage.id ? 'Selected stage' : included ? 'Select to edit' : 'Select to include'}</span><button type="button" data-reference-topic="${escape(stage.atlasTopic)}" aria-label="Read guidance for ${escape(stage.title)}">${icon('book')}<span>Guidance</span></button></footer>
  </article>`;
}

function authoringWorkflow(config, pack, selected, paletteOpen) {
  const stages = getStages(config);
  const recipe = recipeOf(config);
  if (!stages.length) return '';
  return `<header class="pv-authoring-heading"><div><h2>${escape(recipe?.label || 'Your workflow')}</h2><p>Select a stage to adapt its responsibility and instructions.</p></div></header>
    ${authoringPalette(config, paletteOpen)}
    <div class="pv-stage-grid" aria-label="Workflow stages in recipe order">${stages.map((stage, index) => authoringStageCard(config, pack, stage, index, selected, stages[index + 1])).join('')}</div>
    ${!stages.length ? `<div class="pv-empty">${icon('flow')}<h3>Choose the work you need</h3><p>Include the relevant stages. An existing artifact can supply an earlier stage's output.</p>${action('data-goto', 'workflow', 'Choose stages')}</div>` : ''}
    <div class="pv-authoring-guidance">${icon('book')}<span>Need help understanding this workflow?</span>${action('data-reference-topic', config.workflow.recipe === 'feasibility' ? 'construct-study' : 'workflows', 'Read the guidance')}</div>`;
}

function workflow(config, pack, selected, editing) {
  const stages = enabledStages(config);
  const recipe = recipeOf(config);
  if (!recipe && config.workflowModel.processes.some(process => process.source === 'custom')) return heading('Planned work', 'Read your process', 'Review the recorded steps, checks and outcome routes below.', '', 1);
  const selectedStage = stages.find(stage => stage.id === selected);
  return `${heading('The work, made visible', recipe?.label || 'Your workflow', editing ? 'Select a stage to change its details. Assign actors and skills directly on the workflow.' : 'Follow the handoffs. Open a stage to see its decisions, responsibilities and expected outputs.', action('data-open-editor', 'workflow', editing ? 'Configure stages' : 'Edit workflow'), 1)}
    ${editing ? palette(config) : ''}
    <div class="pv-flow-heading"><span>${icon('flow')} ${stages.length} included stages</span><span>Dependencies are shown on each stage</span></div>
    <div class="pv-stage-grid">${stages.map((stage, index) => stageCard(config, pack, stage, index, selected, editing, stages[index + 1])).join('')}</div>
    ${!stages.length ? `<div class="pv-empty">${icon('flow')}<h3>Your workflow starts here</h3><p>Select the stages you need. Existing artifacts can provide inputs for work already completed.</p>${action('data-open-editor', 'workflow', 'Choose stages')}</div>` : ''}
    ${selectedStage ? `<section class="pv-panel pv-stage-reading">${heading('Inside this stage', selectedStage.title, selectedStage.purpose, action('data-select-stage', selectedStage.id, 'Edit this stage'))}<div class="pv-three-col">${[['Receives', selectedStage.inputs], ['Produces', selectedStage.outputs], ['Acceptance questions', selectedStage.checks]].map(([title, values]) => `<div><h3>${title}</h3><ul>${values.map(value => `<li>${escape(value)}</li>`).join('')}</ul></div>`).join('')}</div><div class="pv-output-list">${stageFiles(pack, selectedStage.id).slice(0, 5).map(fileLink).join('')}</div></section>` : ''}
    <div class="pv-reading-callout">${icon('book')}<div><strong>Understand the pattern behind the workflow</strong><p>Each stage has guidance from the Knowledge Atlas. Reading it does not change your project.</p></div>${action('data-reference-topic', config.workflow.recipe === 'feasibility' ? 'construct-study' : 'workflows', 'Open guidance')}</div>`;
}

function architecture(config, pack) {
  if (!config.runtime.enabled) return `${heading('A different perspective', 'How the finished system will behave', 'Describe runtime responsibilities separately from the work needed to build them.', '', 1)}<div class="pv-empty pv-runtime-empty">${icon('system')}<h3>No runtime design included yet</h3><p>This is optional. Add a runtime design when your project needs to explain requests, tool calls, boundaries and confirmed results.</p>${action('data-open-editor', 'workflow', 'Add runtime decisions', 'pv-action-primary')}${action('data-reference-topic', 'study-runtime', 'Explore a backend example')}</div>`;
  const runtime = config.runtime;
  const nodes = [
    { name: 'Request', kind: 'Input', symbol: 'person', text: runtime.requiredInputs },
    { name: 'Interpretation', kind: 'Judgment', symbol: 'spark', text: runtime.judgment },
    { name: 'Tools & services', kind: 'Capability', symbol: 'system', text: runtime.tools },
    { name: 'Permitted changes', kind: 'Validation', symbol: 'diamond', text: runtime.validation },
    { name: 'Confirmed result', kind: 'Response', symbol: 'evidence', text: runtime.confirmation },
  ];
  return `${heading('The application being designed', 'Runtime decisions', 'This view describes intended responsibilities. It does not represent an observed running system.', action('data-open-editor', 'workflow', 'Edit runtime design'), 1)}<section class="pv-runtime-outcome"><span class="pv-eyebrow">Intended outcome</span><p>${copy(runtime.outcome, 'Define the result this system should produce.')}</p>${badge('requirement', 'Design requirements')}</section><div class="pv-runtime-flow" aria-label="Conceptual runtime responsibilities">${nodes.map((node, index) => `<article class="pv-runtime-node"><span class="pv-runtime-symbol">${icon(node.symbol)}</span><span class="pv-mini-label">${String(index + 1).padStart(2, '0')} / ${node.kind}</span><h3>${node.name}</h3><p>${copy(node.text, 'This responsibility still needs a decision.')}</p></article>`).join('')}</div><p class="pv-footnote">A conceptual reading order. Record the real call order, contracts and enforcement points in the runtime design.</p><div class="pv-three-col pv-runtime-boundaries">${[['Execution boundaries', runtime.limits, 'Define time, cost, calls, retries and data limits.'], ['Duplicate requests', runtime.duplicates, 'Decide how retries and uncertain writes are resolved.'], ['Failure behavior', runtime.failures, 'Describe incomplete, rejected and failed outcomes.']].map(([title, value, empty]) => `<section class="pv-panel"><h3>${title}</h3><p>${copy(value, empty)}</p></section>`).join('')}</div><section class="pv-panel">${heading('From intent to evidence', 'What supports these controls?', 'A requirement, an implementation link and an observed result are different things.')}<div class="pv-control-list">${runtime.controls.length ? runtime.controls.map(control => {
      const evidence = config.evidence.find(item => item.id === control.evidenceId);
      return `<article><div class="pv-control-title"><h3>${escape(control.label)}</h3>${badge(control.status)}</div><dl><div><dt>Implementation</dt><dd>${copy(control.implementation, 'No implementation linked')}</dd></div><div><dt>Evidence</dt><dd>${evidence ? `${escape(evidence.check)} ${badge(evidence.status, `Recorded: ${label(evidence.status)}`)}` : '<span class="pv-unresolved">No evidence linked</span>'}</dd></div></dl></article>`;
    }).join('') : '<p class="pv-empty-note">Add the controls that this capability actually needs.</p>'}</div></section><div class="pv-output-list">${(pack?.files || []).filter(file => file.path === 'RUNTIME-DESIGN.md' || file.path === 'templates/CONTRACTS.md').map(fileLink).join('')}</div>`;
}

function evidenceView(config, pack) {
  const recipe = recipeOf(config);
  const facts = config.facts || [];
  const evidence = config.evidence || [];
  return `${heading('Why we believe what we believe', 'Decisions, sources and evidence', 'Keep what you chose, what a source says and what happened visible in their own terms.', action('data-open-editor', 'evidence', 'Edit evidence'), 1)}
    <div class="pv-evidence-summary"><div>${icon('diamond')}<strong>${(recipe?.questions || []).filter(question => has(config.workflow.answers[question.id])).length}</strong><span>recorded intent answers</span></div><div>${icon('book')}<strong>${facts.length}</strong><span>project facts</span></div><div>${icon('evidence')}<strong>${evidence.length}</strong><span>evidence records</span></div></div>
    <section class="pv-panel">${heading('Intent and boundaries', 'Decisions recorded for this project', '', action('data-open-editor', 'intent', 'Edit intent'))}<div class="pv-decision-list">${(recipe?.questions || []).map(getIntentQuestionWording).map(question => `<article><h3>${escape(question.label)}</h3>${copy(config.workflow.answers[question.id])}</article>`).join('')}<article><h3>Approval boundary</h3><p>${config.constraints.approvalRequired ? 'Review approval is required before merge or production release.' : 'No approval requirement selected in this project.'}</p></article><article><h3>Change boundary</h3><p>${config.constraints.readOnly ? 'Repository changes are outside the selected instruction scope.' : 'Repository changes can be part of the selected workflow, subject to its stage responsibilities.'}</p>${has(config.constraints.notes) ? copy(config.constraints.notes) : ''}</article></div></section>
    <section class="pv-section">${heading('Source material', 'Project facts', 'Each claim retains its recorded status and origin. A confirmed status is a supplied assertion, not independent verification by Atlas.')}${facts.length ? `<div class="pv-fact-grid">${facts.map(fact => `<article class="pv-panel pv-fact">${badge(fact.status, `Recorded: ${label(fact.status)}`)}<h3>${escape(fact.claim)}</h3><dl><div><dt>Source</dt><dd>${copy(fact.source, 'Source needed')}</dd></div>${has(fact.revision) ? `<div><dt>Revision</dt><dd>${escape(fact.revision)}</dd></div>` : ''}${has(fact.reviewer) ? `<div><dt>Reviewer</dt><dd>${escape(fact.reviewer)}</dd></div>` : ''}</dl>${has(fact.notes) ? `<p class="pv-footnote">${escape(fact.notes)}</p>` : ''}</article>`).join('')}</div>` : `<div class="pv-empty pv-empty-small">${icon('book')}<h3>Add the context you can point to</h3><p>Record a source, a claim and its status. An imported or inferred claim still needs review.</p>${action('data-open-editor', 'evidence', 'Add a project fact')}</div>`}</section>
    <section class="pv-section">${heading('Expected and observed', 'Evidence records', 'User supplied records are displayed as recorded. The Atlas does not independently authenticate them.')}${evidence.length ? `<div class="pv-evidence-list">${evidence.map(record => `<article class="pv-panel"><div class="pv-control-title"><h3>${escape(record.check || 'Untitled evidence record')}</h3>${badge(record.status, `Recorded: ${label(record.status)}`)}</div><p class="pv-mini-label">${escape(CATALOG.stages.find(stage => stage.id === record.stageId)?.title || 'Project level record')}</p><div class="pv-two-col"><div><h4>Expected</h4>${copy(record.expected, 'Expected result not recorded')}</div><div><h4>Observed</h4>${copy(record.observed, 'No observation recorded')}</div></div><dl><div><dt>Source</dt><dd>${copy(record.source, 'Source not recorded')}</dd></div><div><dt>Reviewer</dt><dd>${copy(record.reviewer, 'Reviewer not recorded')}</dd></div><div><dt>Method</dt><dd>${escape(label(record.method))}</dd></div></dl></article>`).join('')}</div>` : `<div class="pv-empty pv-empty-small">${icon('evidence')}<h3>Define the check. Record what happens.</h3><p>No evidence records yet. Begin with the expected outcome, then add observations when they are available.</p>${action('data-open-editor', 'evidence', 'Plan an evidence check')}</div>`}</section>
    <section class="pv-panel">${heading('Applied guidance', 'Practices behind these instructions', 'These are selected approaches, with their sources and limits.')}<div class="pv-practice-list">${CATALOG.practices.filter(practice => config.practices.includes(practice.id)).map(practice => `<article><h3>${escape(practice.label)}</h3><p>${escape(practice.application)}</p><p class="pv-footnote">${escape(practice.limits)}</p><a href="${escape(practice.source)}" target="_blank" rel="noreferrer">Read the original source <span class="pv-link-note">(opens in a new tab)</span>${icon('arrow')}</a></article>`).join('') || '<p class="pv-empty-note">No reference practices selected. Review Roles and skills to choose the guidance used by this project.</p>'}</div></section><div class="pv-output-list">${(pack?.files || []).filter(file => ['PROJECT-FACTS.md', 'EVIDENCE.md', 'SOURCES.md', 'templates/DECISION.md'].includes(file.path)).map(fileLink).join('')}</div>`;
}

export function renderProjectView(config, pack, { view = 'overview', selectedStage = '', editing = false, authoring = false, paletteOpen = false } = {}) {
  const supported = ['overview', 'workflow', 'architecture', 'evidence'];
  const perspective = supported.includes(view) ? view : 'overview';
  let content;
  if (perspective === 'workflow') content = authoring ? authoringWorkflow(config, pack, selectedStage, paletteOpen) : workflow(config, pack, selectedStage, editing);
  else if (perspective === 'architecture') content = architecture(config, pack);
  else if (perspective === 'evidence') content = evidenceView(config, pack);
  else content = overview(config, pack);
  return `<div class="project-view${authoring ? ' pv-authoring' : ''}" data-current-view="${perspective}"><style>${WORKFLOW_MODEL_STYLES}</style>${authoring ? '' : perspectives(perspective, config.runtime.enabled)}${content}${perspective === 'workflow' && !authoring ? renderWorkflowModel(config) : ''}</div>`;
}
