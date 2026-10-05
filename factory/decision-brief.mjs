import { CATALOG, getStages } from './core.mjs'
import { getIntentAnswer, getIntentQuestionWording } from './intent.mjs'
import { workflowModelIssues } from './workflow-model.mjs'

const has = value => typeof value === 'string' && value.trim().length > 0
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
const approachStages = { 'feature-delivery': ['architecture'], bugfix: ['diagnosis', 'bug-fix'], feasibility: ['options', 'recommendation'] }
const outcomeQuestions = { 'feature-delivery': 'user-need', bugfix: 'expected', feasibility: 'desired-outcome' }
const short = text => text.length > 280 ? `${text.slice(0, 280).trimEnd()}…` : text

function plannedAssignment(config, stage) {
  const binding = config.workflow.bindings[stage.id] || {}
  const type = binding.actorType || 'human'
  const owner = type === 'agent'
    ? CATALOG.roles.find(role => role.id === binding.actorId)?.label || binding.actorId || 'Agent role still to choose'
    : has(binding.actorName) ? binding.actorName : type === 'external' ? 'System owner still to name' : 'Person still to name'
  const ownerSuffix = type === 'agent' && binding.actorId ? ' role' : type === 'external' && has(binding.actorName) ? ' system' : ''
  return { stageId: stage.id, title: stage.title, owner, ownerSuffix, type, contextOnly: type === 'agent' && Boolean(binding.contextOnly) }
}

export function getDecisionBrief(config) {
  if (!getStages(config).length) {
    const processes = config.workflowModel.processes.filter(process => process.source === 'custom')
    const outcome = has(config.project.purpose) ? config.project.purpose : ''
    const unresolved = workflowModelIssues(config).map(issue => ({ path: issue.path, label: issue.message }))
    if (!outcome) unresolved.unshift({ path: 'project.purpose', label: 'The result this work should produce' })
    if (!processes.length) unresolved.push({ path: 'workflowModel.processes', label: 'A process and its starting pattern' })
    return {
      outcome: { text: outcome, source: outcome ? 'Project outcome' : '' },
      approach: { records: processes.filter(process => has(process.purpose)).map(process => ({ processId: process.id, stageId: '', title: process.name || process.id, text: process.purpose, included: true })), editStageId: '', editProcessId: processes[0]?.id || '' },
      planned: processes.flatMap(process => {
        const step = process.steps.find(item => item.id === process.entryStepId)
        if (!step) return []
        return [{ processId: process.id, processName: process.name || process.id, stepId: step.id, stageId: '', title: step.name || step.id, owner: step.actor.name || step.actor.id || 'Owner still to name', ownerSuffix: '', type: step.actor.type, contextOnly: step.actor.contextOnly }]
      }),
      unresolved,
    }
  }
  const recipe = CATALOG.recipes.find(item => item.id === config.workflow.recipe)
  const stages = getStages(config)
  const planned = stages.filter(stage => config.workflow.enabledStages.includes(stage.id))
  const answerId = outcomeQuestions[config.workflow.recipe]
  const purpose = has(config.project.purpose)
  const outcome = purpose ? config.project.purpose : getIntentAnswer(config, answerId).text
  const approach = (approachStages[config.workflow.recipe] || []).map(id => stages.find(stage => stage.id === id)).filter(Boolean)
  const records = approach.filter(stage => has(config.workflow.notes[stage.id])).map(stage => ({ stageId: stage.id, title: stage.title, text: config.workflow.notes[stage.id], included: config.workflow.enabledStages.includes(stage.id) }))
  const unresolved = []
  if (!has(outcome)) unresolved.push({ path: 'project.purpose', label: 'The result this work should produce' })
  if (!records.length) unresolved.push({ path: approach[0] ? `workflow.notes.${approach[0].id}` : 'workflow.notes', label: 'The approach to take and the reason for it' })
  for (const question of (recipe?.questions || []).map(getIntentQuestionWording)) {
    const repeatsMissingOutcome = !has(outcome) && question.id === answerId && config.workflow.recipe !== 'bugfix'
    if (!getIntentAnswer(config, question.id).text && !repeatsMissingOutcome) unresolved.push({ path: `workflow.answers.${question.id}`, label: question.label })
  }
  if (!planned.length) unresolved.push({ path: 'workflow.enabledStages', label: 'The stages that belong in this workflow' })
  for (const stage of planned) {
    const binding = config.workflow.bindings[stage.id] || {}
    if (binding.actorType !== 'agent' && !has(binding.actorName)) unresolved.push({ path: `workflow.bindings.${stage.id}.actorName`, label: `Who will own ${stage.title.toLowerCase()}?` })
  }
  return {
    outcome: { text: has(outcome) ? outcome : '', source: purpose ? 'Project outcome' : has(outcome) ? 'Recorded outcome answer' : '' },
    approach: { records, editStageId: approach[0]?.id || planned[0]?.id || '' },
    planned: planned.slice(0, 2).map(stage => plannedAssignment(config, stage)),
    unresolved,
  }
}

const edit = (attribute, value, text) => `<button type="button" class="db-edit" ${attribute}="${escape(value)}">${escape(text)} →</button>`

export function renderDecisionBrief(config, { editable = false, id = 'decision-brief' } = {}) {
  if (config.workflowModel && !config.workflowModel.processes.some(process => process.source === 'recipe')) {
    const brief = getDecisionBrief(config)
    const processes = config.workflowModel.processes.filter(process => process.source === 'custom')
    return `<section class="decision-brief" aria-labelledby="${escape(id)}-title" data-decision-brief><header class="db-heading"><div><p class="db-eyebrow">The decisions, in plain words</p><h2 id="${escape(id)}-title">Your process design</h2><p>Read the intended result, the planned work and what still needs a decision.</p></div></header><div class="db-grid">
      <article class="db-card"><h3>What do we want?</h3><p class="db-answer${brief.outcome.text ? '' : ' db-open'}">${escape(brief.outcome.text ? short(brief.outcome.text) : 'The intended result is still to decide.')}</p>${editable ? edit('data-open-editor', 'project', 'Edit the outcome') : ''}<p class="db-note">Supplied intent, not an observed result.</p></article>
      <article class="db-card"><h3>Which process?</h3>${processes.length ? processes.map(process => `<div class="db-record"><strong>${escape(process.name || process.id)}</strong><p class="db-preserve">${escape(short(process.purpose || 'Purpose still to decide.'))}</p>${editable ? edit('data-pe-open', process.id, 'Edit this process') : ''}</div>`).join('') : `<p class="db-open">Choose a pattern to start the design.</p>${editable ? edit('data-pe-new', '', 'Design a process') : ''}`}<p class="db-note">Open Workflow for inputs, outcome routes and correction limits.</p></article>
      <article class="db-card"><h3>Who starts each process?</h3>${brief.planned.length ? `<ul class="db-planned">${brief.planned.map(step => `<li><span class="db-step-label">${escape(step.processName)}</span><strong>${escape(step.title)}</strong><span>${escape(step.owner)}${step.contextOnly ? ', supplied context only' : ''}</span></li>`).join('')}</ul>` : '<p class="db-open">The first step or owner is still to choose.</p>'}<p class="db-note">These are planned entry points, not progress. Processes do not automatically start one another.</p></article>
      <article class="db-card"><h3>What is still open?</h3>${brief.unresolved.length ? `<ul class="db-open-list">${brief.unresolved.slice(0, 3).map(item => `<li>${escape(item.label)}</li>`).join('')}</ul>${brief.unresolved.length > 3 ? `<details><summary>${brief.unresolved.length - 3} more findings</summary><ul>${brief.unresolved.slice(3).map(item => `<li>${escape(item.label)}</li>`).join('')}</ul></details>` : ''}` : '<p class="db-answer">No empty outcome or process rule findings.</p>'}<p class="db-note">Written criteria and supplied facts still need review. A structural check does not establish successful work.</p></article>
    </div>${brief.outcome.text.length > 280 || brief.approach.records.some(record => record.text.length > 280) ? `<details class="db-details"><summary>Full recorded outcome and process purposes</summary><div class="db-detail-body"><p class="db-preserve">${escape(brief.outcome.text)}</p>${brief.approach.records.map(record => `<article><h4>${escape(record.title)}</h4><p class="db-preserve">${escape(record.text)}</p></article>`).join('')}</div></details>` : ''}<p class="db-note">${editable ? 'Use the process designer to edit connections. Review and apply changes, then download to keep them.' : 'This snapshot is read only. Reopen its project in Workflow Atlas to edit the connections.'} Atlas does not run the process.</p></section>`
  }
  const brief = getDecisionBrief(config)
  const recipe = CATALOG.recipes.find(item => item.id === config.workflow.recipe)
  const first = brief.approach.records[0]
  const overviewText = first ? short(first.text) : 'No approach or reason recorded yet.'
  const controls = editable
  const stageNotes = Object.entries(config.workflow.notes).filter(([, text]) => has(text))
  const questions = (recipe?.questions || []).map(getIntentQuestionWording)
  const fullOutcome = brief.outcome.text.length > 280 ? `<article><h4>Full recorded outcome</h4><p class="db-preserve">${escape(brief.outcome.text)}</p></article>` : ''
  const fullApproach = first && (first.text.length > 280 || brief.approach.records.length > 1) ? `<details class="db-approach-notes"><summary>Read all approach notes</summary>${brief.approach.records.map(record => `<div class="db-record"><strong>${escape(record.title)}${record.included ? '' : ' (not included in this workflow)'}</strong><p class="db-preserve">${escape(record.text)}</p></div>`).join('')}</details>` : ''
  return `<section class="decision-brief" aria-labelledby="${escape(id)}-title" data-decision-brief>
    <header class="db-heading"><div><p class="db-eyebrow">The decisions, in plain words</p><h2 id="${escape(id)}-title">Decision brief</h2><p>Read the intended result, the recorded choices and what still needs a decision.</p></div></header>
    <div class="db-grid">
      <article class="db-card"><h3>What do we want?</h3><p class="db-answer${brief.outcome.text ? '' : ' db-open'}">${escape(brief.outcome.text ? short(brief.outcome.text) : 'The wanted outcome is still to decide.')}</p>${brief.outcome.source ? `<p class="db-note">${escape(brief.outcome.source)}. Supplied text, not a verified result.</p>` : ''}${controls ? edit('data-open-editor', 'project', 'Edit the outcome') : ''}</article>
      <article class="db-card"><h3>What approach, and why?</h3><p class="db-answer${first ? '' : ' db-open'}">${escape(overviewText)}</p><p class="db-note">${first ? `Recorded notes for ${escape(first.title.toLowerCase())}${first.included ? '' : ', a stage not currently included'}. No decision or reason has been inferred from these notes.` : 'Choose an approach and record its reason when you have enough context.'}</p>${fullApproach}${controls && brief.approach.editStageId ? edit('data-select-stage', brief.approach.editStageId, 'Record the approach') : ''}</article>
      <article class="db-card"><h3>Who is planned to act?</h3>${brief.planned.length ? `<ol class="db-planned">${brief.planned.map((step, index) => `<li><span class="db-step-label">${index === 0 ? 'First' : 'Then'}</span><strong>${escape(step.title)}</strong><span>${escape(step.owner)}${step.ownerSuffix}${step.contextOnly ? ', supplied context only' : ''}</span>${controls ? edit('data-select-stage', step.stageId, 'Review this assignment') : ''}</li>`).join('')}</ol>` : '<p class="db-open">No stages are selected.</p>'}<p class="db-note">Planned recipe order. This does not show observed progress or completed work.</p></article>
      <article class="db-card"><h3>What is still open?</h3>${brief.unresolved.length ? `<ul class="db-open-list">${brief.unresolved.slice(0, 3).map(item => `<li>${escape(item.label)}</li>`).join('')}</ul>${brief.unresolved.length > 3 ? `<p class="db-note">${brief.unresolved.length - 3} more empty fields are listed below.</p>` : ''}` : '<p class="db-answer">The brief fields are filled in.</p>'}<p class="db-note">This checks for empty fields. Questions in your notes may still need a decision.</p>${controls ? edit('data-open-editor', 'intent', 'Review intent answers') : ''}</article>
    </div>
    <details class="db-details"><summary>Recorded context and technical details</summary><div class="db-detail-body">
      ${fullOutcome}<article><h4>Recorded intent answers</h4><dl>${questions.map(question => {
        const answer = getIntentAnswer(config, question.id)
        return `<div><dt>${escape(question.label)}</dt><dd class="db-preserve">${escape(answer.text || 'Still to decide')}${answer.inherited ? '<span class="db-answer-source">Uses your project outcome. A more specific answer can be added in Brief.</span>' : ''}</dd></div>`
      }).join('')}</dl></article>
      <article><h4>Stage notes</h4>${stageNotes.length ? stageNotes.map(([stageId, text]) => `<div class="db-record"><strong>${escape(CATALOG.stages.find(stage => stage.id === stageId)?.title || stageId)}</strong><p class="db-preserve">${escape(text)}</p></div>`).join('') : '<p>No stage notes recorded.</p>'}</article>
      ${brief.unresolved.length ? `<article><h4>All identified open decisions</h4><ul>${brief.unresolved.map(item => `<li>${escape(item.label)}</li>`).join('')}</ul><p class="db-note">This lists empty fields for this brief. Free text can contain other questions that Atlas has not interpreted.</p></article>` : ''}
      <article><h4>Where the instructions will be used</h4><dl><div><dt>Selected environment</dt><dd>${escape(CATALOG.hosts.find(host => host.id === config.project.host)?.label || config.project.host)}</dd></div><div><dt>Source control</dt><dd>${escape(config.project.sourceControl || 'Still to decide')}</dd></div><div><dt>Source locations</dt><dd class="db-preserve">${escape(config.project.sourceLocations || 'No source locations recorded')}</dd></div></dl></article>
      <article><h4>Components and supplied commands</h4>${config.components.length ? config.components.map(component => `<div class="db-record"><strong>${escape(component.name || 'Unnamed component')}</strong><dl><div><dt>Repository path</dt><dd><code>${escape(component.path || 'Still to confirm')}</code></dd></div>${Object.entries(component.commands).map(([name, command]) => `<div><dt>${escape(name)}</dt><dd><code>${escape(command || 'Still to confirm')}</code></dd></div>`).join('')}</dl></div>`).join('') : '<p>No components recorded.</p>'}<p class="db-note">Paths and commands are supplied values. Atlas has not inspected or run them.</p></article>
      <article><h4>Expected tools for planned agent stages</h4>${getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id) && config.workflow.bindings[stage.id]?.actorType === 'agent').map(stage => `<p><strong>${escape(stage.title)}.</strong> ${escape(stage.capabilities.length ? stage.capabilities.join(', ') : 'No tool requirement for this stage')}.</p>`).join('') || '<p>No agent stages selected.</p>'}<p class="db-note">These are recipe expectations. Instructions do not configure tools or runtime permissions. Confirm actual availability in the selected host.</p></article>
    </div></details>
  </section>`
}

export const DECISION_BRIEF_STYLES = `
.decision-brief { --db-ink: var(--pv-ink, var(--ink)); --db-muted: var(--pv-muted, var(--muted)); --db-accent: var(--pv-accent, var(--accent)); --db-panel: var(--pv-panel, var(--panel)); --db-line: var(--pv-line, var(--border)); --db-soft: var(--pv-accent-soft, var(--accent-soft)); --db-focus: var(--pv-focus, var(--focus)); margin: 22px 0; color: var(--db-ink); }
.decision-brief * { box-sizing: border-box; }
.decision-brief :is(h2, h3, h4, p) { margin: 0; overflow-wrap: anywhere; }
.decision-brief .db-eyebrow { color: var(--db-accent); font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.decision-brief .db-heading h2 { margin: 6px 0 8px; font-size: 27px; line-height: 1.25; }
.decision-brief .db-heading p:last-child { font-size: 14px; color: var(--db-muted); }
.decision-brief .db-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; margin: 18px 0 14px; }
.decision-brief .db-card { min-width: 0; padding: 20px; border: 1px solid var(--db-line); border-radius: 13px; background: var(--db-panel); }
.decision-brief .db-card h3 { font-size: 18px; line-height: 1.4; margin-bottom: 12px; }
.decision-brief .db-answer { font-size: 15px; line-height: 1.7; white-space: pre-line; }
.decision-brief .db-note { font-size: 12px; line-height: 1.6; color: var(--db-muted); margin-top: 12px; }
.decision-brief .db-approach-notes { margin-top: 12px; border-top: 1px solid var(--db-line); }
.decision-brief .db-approach-notes > summary { min-height: 44px; padding: 10px 0; cursor: pointer; color: var(--db-accent); font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
.decision-brief .db-approach-notes .db-record { font-size: 14px; line-height: 1.7; }
.decision-brief .db-open { color: var(--db-muted); }
.decision-brief .db-edit { display: inline-flex; align-items: center; min-height: 40px; background: none; border: 0; padding: 8px 0; margin-top: 7px; font: inherit; font-size: 13px; font-weight: 600; line-height: 1.5; color: var(--db-accent); cursor: pointer; text-align: left; overflow-wrap: anywhere; }
.decision-brief .db-planned { display: grid; gap: 16px; padding: 0; margin: 0; list-style: none; }
.decision-brief .db-planned li { display: flex; flex-direction: column; min-width: 0; gap: 3px; }
.decision-brief .db-step-label { font-size: 12px; color: var(--db-accent); font-weight: 700; }
.decision-brief .db-planned strong { font-size: 14px; }
.decision-brief .db-planned li > span:not(.db-step-label) { font-size: 14px; color: var(--db-muted); overflow-wrap: anywhere; }
.decision-brief .db-planned .db-edit { margin-top: 0; }
.decision-brief .db-open-list { padding-left: 20px; margin: 0; font-size: 14px; }
.decision-brief .db-open-list li + li { margin-top: 8px; }
.decision-brief .db-details { border: 1px solid var(--db-line); border-radius: 11px; background: var(--db-panel); }
.decision-brief .db-details > summary { cursor: pointer; min-height: 46px; padding: 12px 16px; font-weight: 600; font-size: 14px; color: var(--db-accent); overflow-wrap: anywhere; }
.decision-brief .db-detail-body { display: grid; gap: 22px; padding: 8px 20px 20px; }
.decision-brief .db-detail-body h4 { font-size: 15px; color: var(--db-ink); margin-bottom: 10px; }
.decision-brief .db-detail-body p, .decision-brief .db-detail-body li, .decision-brief .db-detail-body dl { font-size: 14px; line-height: 1.7; }
.decision-brief .db-detail-body dl { margin: 0; }
.decision-brief .db-detail-body dl > div { display: grid; grid-template-columns: minmax(140px, .8fr) minmax(0, 1.4fr); gap: 14px; margin: 8px 0; }
.decision-brief dt { color: var(--db-muted); }
.decision-brief dd { margin: 0; overflow-wrap: anywhere; }
.decision-brief code { white-space: pre-wrap; overflow-wrap: anywhere; }
.decision-brief .db-preserve { white-space: pre-line; }
.decision-brief .db-answer-source { display: block; margin-top: 6px; font-size: 12px; color: var(--db-muted); }
.decision-brief .db-record + .db-record { margin-top: 15px; }
.decision-brief .db-record p { margin-top: 6px; }
.decision-brief :is(button, summary):focus-visible { outline: 3px solid var(--db-focus); outline-offset: 3px; }
@media (max-width: 700px) { .decision-brief .db-grid { grid-template-columns: 1fr; } .decision-brief .db-detail-body dl > div { grid-template-columns: 1fr; gap: 2px; } }
@container (max-width: 700px) { .decision-brief .db-grid { grid-template-columns: 1fr; } .decision-brief .db-detail-body dl > div { grid-template-columns: 1fr; gap: 2px; } }
@media (forced-colors: active) { .decision-brief :is(button, summary):focus-visible { outline-color: Highlight; } }
`
