import * as engine from './core.mjs'
import { zipFiles } from './zip.mjs'
import { extractProjectFacts, compareFiles, resolveComparison, parseFileBundle, reviewOpenedFiles } from './maintenance.mjs'
import { getIntentAnswer, getIntentQuestionWording } from './intent.mjs'
import { renderProjectView } from './project-view.mjs'
import { buildProjectAtlas, packageProject, packageReviewedFiles, readProjectFiles } from './portable.mjs'
import { recommendOutput, compileOutput, compileOpenedOutput, getOpenedOutputSelection, getUseGuide } from './journey.mjs'
import { PRACTICE_TOPIC_IDS, getPracticeAction, applyPracticeAction } from './practice-actions.mjs'
import { createDecisionReview, exportDecisionReview, restoreDecisionReview } from './decision-review.mjs'
import { reviewGuidance } from './guidance-review.mjs'
import { attachReviewArtifacts } from './session-output.mjs'
import { createJevAssistance } from './jev-assistance.mjs'
import { mountJevView } from './jev-view.mjs'
import { APP_VERSION } from './version.mjs'
import { createProcessDesigner } from './process-designer.mjs'

const { CATALOG, TOOL_ALIASES, createRecipe, createExample, selectRecipe, getStages, getEffectiveSkills, compileStandaloneSkill, compile, validate, parseImport, serializeProject } = engine
const $ = selector => document.querySelector(selector)
$('#app-version').textContent = `WORKFLOW ATLAS · ${APP_VERSION}`
const storageKey = 'workflow-atlas.factory.v2'
const legacyKey = 'workflow-atlas.factory.v1'
const steps = [
  { id: 'intent', label: 'Brief' },
  { id: 'project', label: 'Components' },
  { id: 'boundaries', label: 'Boundaries' },
  { id: 'evidence', label: 'Sources and evidence' },
  { id: 'runtime', label: 'Runtime design' },
  { id: 'artifacts', label: 'Roles and skills' },
  { id: 'review', label: 'Review changes' }
]
const detailSections = ['intent', 'project', 'boundaries', 'evidence', 'runtime']
const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
const labelOf = item => item?.label || item?.title || item?.id || ''
const list = value => Array.isArray(value) ? value : value ? [value] : []
const formatBytes = count => count < 1024 ? `${count || 0} bytes` : `${(count / 1024).toFixed(1)} KB`
const named = (items, id) => labelOf(items.find(item => item.id === id) || { id })
const uid = prefix => `${prefix}-${crypto.randomUUID()}`
const recipe = () => getStages(config).length ? CATALOG.recipes.find(item => item.id === config.workflow.recipe) : undefined
const resolvedChoice = row => Object.hasOwn(choices, row.path) ? choices[row.path] : row.resolution
const reviewableFiles = files => files.filter(file => !['PROJECT-ATLAS.html', 'manifest.json'].includes(file.path))
function artifactLabel(path, paths) {
  const basename = path.split('/').at(-1)
  if (paths.filter(candidate => candidate.split('/').at(-1) === basename).length < 2) return basename
  const skill = /^\.github\/skills\/([^/]+)\//.exec(path)?.[1]
  if (skill) return `${named(CATALOG.skills, skill)} / ${basename}`
  const directory = path.split('/').slice(0, -1).join('/')
  return directory ? `${directory} / ${basename}` : basename
}
let config = null
let packagingFailure = ''
let currentStep = 'intent'
let selectedFile = 'WORKFLOW.md'
let pack, toastTimer, compileTimer
let recoveryMessage = ''
let legacyDraft = null
let workspaceView = 'workflow'
let selectedStage = ''
let inspectorOpen = false
let projectOrigin = 'blank'
let paletteSelection = null
let lastDownloaded = null
let historyEntries = []
let historyIndex = 0
let lastHistoryKey = ''
let lastHistoryAt = 0
let lastImpact = []
let inspectorReturnFocus = null
let inspectorReturnSelector = ''
let importedFiles = []
let generationAtOpen = null
let candidateImport = null
let outputSelection = null
let downloadPack = null
let pendingPractice = null
let briefReturnFocus = null
let baselineFiles = []
let existingFiles = []
let comparison = []
let choices = {}
let downloadedComparison = null
let downloadedComparisonChoices = ''
let comparisonGeneration = ''
let decisionBaseline = null
let decisionBaselineLabel = 'Since starting this session'
let reviewReason = ''
let lastDownloadedReviewReason = ''
let baselineNeedsDownload = false
let guidanceChoiceNeedsDownload = false
let guidanceAdoption = null
let pendingGuidance = null
let pendingGuidanceDownload = null
let guidanceReturnFocus = null
let guidanceClosingForDownload = false
let theme = matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
let knowledgeOpen = false
let knowledgeReturnFocus = null
let knowledgeScroll = 0
let knowledgeReturnHash = '#start'
let knowledgeReturnSelector = ''
const compactEditor = matchMedia('(max-width: 1100px)')
let deferredAssistantQuestions = {}
let assistantAnswerReviews = {}
const assistantReviewWording = new Map()
let jevView
const assistance = createJevAssistance({ onChange: () => jevView?.render() })
let processDesigner
function applyProcessConfig(next) {
  config = next
  inspectorOpen = false
  selectedStage = ''
  workspaceView = 'workflow'
  changed()
  clearTimeout(compileTimer)
  updatePack(false)
  toast('Process changes applied. Download to keep them.')
}
applyProcessConfig.preview = next => {
  const before = new Map(compile(config).files.map(file => [file.path, file.content]))
  const after = new Map(compile(next).files.map(file => [file.path, file.content]))
  return [...new Set([...before.keys(), ...after.keys()])].filter(path => before.get(path) !== after.get(path))
}
processDesigner = createProcessDesigner({ getConfig: () => config, onApply: applyProcessConfig, onPendingChange: renderSession, onNotice: toast })

async function createAssistedProject() {
  try {
    const snapshot = JSON.stringify([assistance.getState().draft, assistance.getState().pendingAnswers])
    const proposed = assistance.composeProject()
    if (!await replaceConfig(proposed.config, '', 'assisted', { consumeAssistance: true, applyGuard: () => snapshot === JSON.stringify([assistance.getState().draft, assistance.getState().pendingAnswers]) })) return
    deferredAssistantQuestions = proposed.deferredQuestions
    assistantAnswerReviews = Object.fromEntries(proposed.answerReviews.map(item => [item.id, { ...item, purpose: config.project.purpose }]))
    assistance.markAccepted()
    renderTaskGuide()
    renderSession()
    $('#project-content').focus()
    toast('Your draft is ready. Edit its steps and decisions, then download to keep it.')
  } catch (error) { toast(error.message || 'Choose a workflow before creating a draft.') }
}

function setTheme(value) {
  if (!['light', 'dark'].includes(value)) return
  theme = value
  document.documentElement.dataset.theme = theme
  $('#theme-toggle').setAttribute('aria-checked', String(theme === 'dark'))
  if (knowledgeOpen) $('#knowledge-frame').contentWindow?.postMessage({type:'workflow-atlas:theme',theme}, location.origin)
}

function syncEditorAccess() {
  const modal = inspectorOpen && compactEditor.matches && !knowledgeOpen
  $('#studio-main').inert = modal
  $('#start-screen').inert = knowledgeOpen
  $('.studio-header').inert = modal || knowledgeOpen
  $('#studio-layout').inert = knowledgeOpen
  document.body.classList.toggle('editor-modal', modal)
  document.body.classList.toggle('knowledge-open', knowledgeOpen)
  $('.skip').hidden = modal || knowledgeOpen
  if (modal) {
    $('#inspector').setAttribute('role', 'dialog')
    $('#inspector').setAttribute('aria-modal', 'true')
    $('#inspector').setAttribute('aria-labelledby', 'inspector-title')
  } else {
    $('#inspector').removeAttribute('role')
    $('#inspector').removeAttribute('aria-modal')
    $('#inspector').removeAttribute('aria-labelledby')
  }
}
compactEditor.addEventListener('change', () => {
  syncEditorAccess()
  if (inspectorOpen && compactEditor.matches && !$('#inspector').contains(document.activeElement)) $('#close-inspector').focus()
})

function syncPalette() {
  document.querySelectorAll('[data-drag-skill],[data-drag-actor]').forEach(button => {
    const selected = paletteSelection?.kind === 'skill'
      ? button.dataset.dragSkill === paletteSelection.id
      : paletteSelection?.kind === 'actor' && button.dataset.dragActor === paletteSelection.type && (button.dataset.actorId || '') === paletteSelection.id
    button.setAttribute('aria-pressed', String(Boolean(selected)))
  })
}

try {
  const saved = localStorage.getItem(storageKey)
  const old = localStorage.getItem(legacyKey)
  if (saved || old) legacyDraft = saved || old
} catch (error) {
  recoveryMessage = 'This session works without browser storage. Use project files to continue later.'
}

function toast(message) {
  $('#toast').textContent = message
  $('#toast').hidden = false
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => { $('#toast').hidden = true }, 8000)
}

function changed(historyKey = '') {
  if (!config) return
  for (const [id, deferred] of Object.entries(deferredAssistantQuestions)) if (deferred.text !== getIntentAnswer(config, id).text) delete deferredAssistantQuestions[id]
  if (pruneAssistantAnswerReviews() && inspectorOpen && currentStep === 'intent') renderStep()
  const snapshot = JSON.stringify(config)
  if (snapshot !== historyEntries[historyIndex]) {
    const coalesce = historyKey && historyKey === lastHistoryKey && Date.now() - lastHistoryAt < 1200 && historyIndex === historyEntries.length - 1 && historyIndex > 0
    historyEntries = historyEntries.slice(0, historyIndex + 1)
    if (coalesce) historyEntries[historyIndex] = snapshot
    else { historyEntries.push(snapshot); if (historyEntries.length > 60) historyEntries.shift(); historyIndex = historyEntries.length - 1 }
    lastHistoryKey = historyKey
    lastHistoryAt = Date.now()
  }
  renderSession()
  clearTimeout(compileTimer)
  compileTimer = setTimeout(updatePack, 180)
}

function renderSession() {
  const active = Boolean(config)
  const dirty = active && sessionDirty()
  $('#download-project').hidden = !active
  $('#new-project').hidden = !active
  $('#save-state').textContent = dirty ? 'Changes not downloaded' : projectOrigin === 'example' ? 'Fictional example in this session' : 'Session only. Download to keep your work.'
  $('#save-state').classList.toggle('unsaved', dirty)
  const comparisonNotice = $('#comparison-snapshot-note')
  if (comparisonNotice) comparisonNotice.hidden = !comparisonIsStale()
  $('#undo').disabled = !active || historyIndex === 0
  $('#redo').disabled = !active || historyIndex >= historyEntries.length - 1
  if (!active) return
  for (const control of document.querySelectorAll('.project-heading [data-field]')) {
    if (control !== document.activeElement) control.value = config.project[control.dataset.field.split('.')[1]]
  }
  $('#recipe-label').textContent = labelOf(recipe())
  $('#project-origin').textContent = projectOrigin === 'example' ? 'FICTIONAL EXAMPLE' : projectOrigin === 'imported' ? 'OPENED PROJECT' : 'YOUR PROJECT'
  renderOpenedFileNotice()
  refreshIntentProvenance()
  renderTaskGuide()
}

function refreshIntentProvenance() {
  for (const card of document.querySelectorAll('.inherited-intent')) {
    const questionId = card.querySelector('[data-field]')?.dataset.field.split('.').at(-1)
    if (!questionId) continue
    const answer = getIntentAnswer(config, questionId)
    card.querySelector('.preserved-answer').textContent = config.project.purpose
    card.querySelector('.eyebrow').textContent = answer.inherited ? 'USES YOUR PROJECT OUTCOME' : 'OVERALL PROJECT OUTCOME'
    card.querySelector('summary').textContent = answer.inherited ? 'Add a more specific answer, optional' : 'Your more specific answer'
  }
}

function renderTaskGuide() {
  const target = $('#task-guide')
  if (!config) { target.replaceChildren(); return }
  const recommendation = recommendOutput(config)
  const needsBrief = !config.project.name.trim() || !config.project.purpose.trim()
  const missing = list(recipe()?.questions).find(question => {
    const answer = getIntentAnswer(config, question.id).text
    const deferred = deferredAssistantQuestions[question.id]
    const skipped = deferred && (typeof deferred === 'string' ? deferred : deferred.text) === answer
    return !answer.trim() && !skipped
  })
  const reusable = missing && assistantAnswerReview(missing.id)
  const next = needsBrief ? 'Describe the result' : missing ? getIntentQuestionWording(missing).label : 'Review your handoff'
  const action = needsBrief ? 'data-studio-action="task-brief"' : missing ? `data-intent-question="${escape(missing.id)}"` : 'data-studio-action="choose-output"'
  const note = needsBrief ? 'Unknown details can stay blank.' : reusable ? 'Already in your description. Confirm or edit the wording for this answer.' : missing ? 'Add what you know. You can download a draft at any time.' : outputSelection ? `Selected: ${outputTitle(chosenOutput().kind)}. Your choice stays with this session.` : recommendation.reason
  target.innerHTML = `<div><span class="eyebrow">NEXT USEFUL STEP</span><strong>${escape(next)}</strong><span>${escape(note)}</span></div><button type="button" class="secondary" ${action}>${needsBrief ? 'Edit the brief' : reusable ? 'Review wording' : missing ? missing.id === 'acceptance' ? 'Add an example' : 'Add details' : 'Review my download'} →</button>`
}

function assistantAnswerReview(id) {
  const item = assistantAnswerReviews[id]
  return item && config && item.recipeId === config.workflow.recipe && item.purpose === config.project.purpose && !getIntentAnswer(config, id).text.trim() ? item : null
}

function pruneAssistantAnswerReviews() {
  let removed = false
  for (const id of Object.keys(assistantAnswerReviews)) if (!assistantAnswerReview(id)) {
    delete assistantAnswerReviews[id]
    assistantReviewWording.delete(id)
    removed = true
  }
  return removed
}

function hasUnrecordedReviewEdits() {
  return [...assistantReviewWording].some(([id, text]) => assistantAnswerReview(id) && text !== assistantAnswerReviews[id].reviewText)
}

function currentComparisonChoices() {
  return JSON.stringify(comparison.filter(row => Object.hasOwn(choices, row.path)).map(row => [row.path, choices[row.path]]))
}

function hasUnkeptFileReview() {
  const current = currentComparisonChoices()
  return current !== '[]' && (comparison !== downloadedComparison || current !== downloadedComparisonChoices)
}

function comparisonGenerationKey() {
  return JSON.stringify({ config, selection: chosenOutput(), decisionBaseline, reviewReason, guidance: currentGuidanceSelection() })
}

function comparisonIsStale() {
  return comparison.length > 0 && comparisonGeneration !== comparisonGenerationKey()
}

function clearFileComparison() {
  comparison = []
  choices = {}
  comparisonGeneration = ''
  downloadedComparison = null
  downloadedComparisonChoices = ''
}

async function canReplaceFileComparison() {
  return !hasUnkeptFileReview() || await confirmReplace('This replaces your pending file review choices. Download the reviewed files first to keep them, or keep this file review unchanged.', { title: 'Replace this file review?', keep: 'Keep this file review', replace: 'Replace file review' })
}

function sessionDirty({ includeAssistance = true } = {}) {
  return Boolean(processDesigner?.isPending() || (includeAssistance && !config && assistance.isDirty()) || hasUnrecordedReviewEdits() || hasUnkeptFileReview() || (config && (JSON.stringify(config) !== lastDownloaded || reviewReason !== lastDownloadedReviewReason || baselineNeedsDownload || guidanceChoiceNeedsDownload)))
}

function currentReview(selection = chosenOutput()) {
  return createDecisionReview(decisionBaseline || config, config, {reason:reviewReason,selection})
}

function currentGuidanceSelection() {
  const key = guidanceAdoption ? JSON.stringify({config,changes:reviewGuidance(config, importedFiles).changes}) : ''
  return guidanceAdoption?.key === key ? guidanceAdoption.record : null
}

function withSessionReview(raw) {
  return attachReviewArtifacts(config, raw, {baseline:decisionBaseline || config,reason:reviewReason,guidanceReview:currentGuidanceSelection()})
}

function reviewValue(value) {
  if (value === null || value === undefined || value === '') return 'Not recorded'
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2)
}

function guidanceFieldLabel(field) {
  return ({reviewedOn:'review date',definition:'definition content','selected definition added':'definition included now','selected definition removed':'definition no longer included',environment:'intended environment',sources:'source references'})[field] || field
}

function renderDecisionChanges() {
  let review
  try { review = currentReview() }
  catch (error) { return `<section class="card"><h3>Decision review needs attention</h3><p>${escape(error.message)}</p><p>Your current decisions remain available.</p></section>` }
  return `<section class="card decision-review-card"><div class="card-title"><h3 id="decision-review-heading" tabindex="-1">What changed?</h3><span class="label-tag">${review.changes.length} decisions</span></div><p class="hint">${escape(decisionBaselineLabel)}. This compares recorded settings, not a history of every edit.</p>${review.changes.length ? `<ul class="decision-highlights">${review.changes.slice(0,3).map(change => `<li>${escape(change.label)} changed.</li>`).join('')}</ul><details class="semantic-change-list"><summary>Inspect all ${review.changes.length} decision changes</summary>${review.changes.map(change => `<article><h4>${escape(change.label)}</h4><p>${escape(change.summary)}</p><div class="decision-value-grid"><div><strong>Before</strong><pre>${escape(reviewValue(change.before))}</pre></div><div><strong>Now</strong><pre>${escape(reviewValue(change.after))}</pre></div></div>${change.stageIds.length ? `<p class="hint">Related steps: ${change.stageIds.map(id => escape(named(CATALOG.stages,id))).join(', ')}.</p>` : ''}<details><summary>Associated file changes (${change.affectedFiles.length})</summary><ul>${change.affectedFiles.map(path => `<li>${pack.files.some(file => file.path === path) ? `<button type="button" class="text-button" data-select-file="${escape(path)}">${escape(path)}</button>` : `<code>${escape(path)}</code>`}</li>`).join('') || '<li>No associated generated change identified.</li>'}</ul></details></article>`).join('')}</details>` : '<p>No recorded decisions changed compared with this baseline.</p>'}<label class="journey-field" for="decision-review-reason"><span>Why are we changing this? <small>Optional</small></span><textarea id="decision-review-reason" maxlength="20000" rows="2" placeholder="Keep the reason a reviewer needs">${escape(reviewReason)}</textarea><small>The reason and comparison travel in ZIP and readable Atlas downloads. Project JSON keeps settings only.</small></label><div class="inline-actions"><button type="button" class="secondary" data-studio-action="choose-decision-baseline">Compare with another Atlas file</button><button type="button" class="text-button" data-studio-action="download-decision-review">Download review Markdown</button></div><p class="hint">File edits are reviewed below. They do not silently change these decisions.</p></section>`
}

function renderGuidance() {
  const report = reviewGuidance(config, importedFiles)
  const status = !importedFiles.length ? 'Current definitions' : report.status === 'matching-records' ? 'Recorded definitions match' : report.status === 'changed' ? `${report.changes.length} guidance ${report.changes.length === 1 ? 'difference' : 'differences'} to review` : 'Exact comparison unavailable'
  return `<details class="card guidance-card" data-detail="guidance"><summary><strong>Guidance and its limits</strong><span>${escape(status)}</span></summary><p>Catalog ${escape(report.current.catalogVersion)}. Recorded source review: ${escape(report.current.reviewedOn)}. Atlas has not checked the linked pages again during this session.</p>${importedFiles.length ? report.warnings.map(warning => `<p class="hint">${escape(warning)}</p>`).join('') : ''}${report.changes.length ? `<ul>${report.changes.map(change => `<li>${escape(change.label)}: ${escape(change.fields.map(guidanceFieldLabel).join(', '))}.</li>`).join('')}</ul><button type="button" class="secondary" data-studio-action="review-guidance">Review current guidance for download</button>` : ''}${currentGuidanceSelection() ? '<p class="hint">Current definitions were deliberately selected for the next generated download. Original opened files remain available.</p>' : ''}<details><summary>Inspect ${report.current.records.length} selected definitions</summary><div class="guidance-records">${report.current.records.map(record => `<article><h4>${escape(record.label)}</h4><p class="hint">${escape(record.type)}. Version ${escape(record.version)}. Review record ${escape(record.reviewedOn)}.</p><p>${escape(record.applicability)}</p><p>${escape(record.limits)}</p>${record.sources.length ? `<ul>${record.sources.map((source,index) => `<li><a href="${escape(source)}" target="_blank" rel="noopener">Source ${index + 1} ↗</a></li>`).join('')}</ul>` : '<p class="hint">Local procedure definition. No separate source claim recorded.</p>'}</article>`).join('')}</div></details><p class="hint">A source link or review date does not prove applicability, factual correctness or host behavior. Changes in project selections are distinct from updates to definition content.</p></details>`
}

function openGuidanceReview(afterDownload = null) {
  if (!config) return
  guidanceReturnFocus = document.activeElement
  const report = reviewGuidance(config, importedFiles)
  pendingGuidance = {key:JSON.stringify({config,changes:report.changes}),report}
  pendingGuidanceDownload = afterDownload
  $('#accept-guidance').textContent = afterDownload ? 'Use current guidance and download' : 'Use current guidance for next download'
  const files = openedFileDifferences()
  $('#guidance-preview').innerHTML = `<p>Review the current definitions before generating replacement instructions. Your original opened files stay available.</p><p class="hint">Current catalog ${escape(report.current.catalogVersion)}, recorded review ${escape(report.current.reviewedOn)}. This is a local metadata comparison, not a fresh check of upstream pages.</p>${report.warnings.map(warning => `<p class="hint">${escape(warning)}</p>`).join('')}<div class="guidance-changes">${report.changes.map(change => `<details><summary>${escape(change.label)}: ${escape(change.fields.map(guidanceFieldLabel).join(', '))}</summary><div class="decision-value-grid"><div><strong>Supplied previous record</strong><pre>${escape(reviewValue(change.before))}</pre></div><div><strong>Current definition</strong><pre>${escape(reviewValue(change.after))}</pre></div></div></details>`).join('') || '<p>No recorded definition changes were identified.</p>'}</div><details><summary>Opened files differing from current generation (${files.length})</summary><ul>${files.map(file => `<li><code>${escape(file.path)}</code></li>`).join('') || '<li>No file differences identified.</li>'}</ul></details><p class="hint">Selecting current definitions does not update external files, prove a source claim or record successful execution. The next download remains an explicit action.</p>`
  $('#guidance-dialog').showModal()
  $('#guidance-title').focus()
}

function guidanceReady(afterDownload) {
  const report = reviewGuidance(config, importedFiles)
  const key = JSON.stringify({config,changes:report.changes})
  if (report.needsAdoption && guidanceAdoption?.key !== key) { openGuidanceReview(afterDownload); return false }
  return true
}

$('#accept-guidance').addEventListener('click', () => {
  if (!pendingGuidance || !config) return
  const report = reviewGuidance(config, importedFiles)
  const key = JSON.stringify({config,changes:report.changes})
  if (key !== pendingGuidance.key) { openGuidanceReview(pendingGuidanceDownload); return }
  guidanceAdoption = {key,record:{fromCatalogVersion:report.previous?.catalogVersion || 'Not recorded',currentCatalogVersion:report.current.catalogVersion,definitionIds:report.changes.map(change => change.id)}}
  guidanceChoiceNeedsDownload = true
  const after = pendingGuidanceDownload
  guidanceClosingForDownload = Boolean(after)
  $('#guidance-dialog').close()
  updatePack(false)
  renderSession()
  if (inspectorOpen && currentStep === 'review') renderStep()
  if (after === 'selected') exportSelectedOutput()
  else if (after === 'pack') exportPack()
  else if (after === 'atlas') downloadAtlas()
  else if (after?.startsWith('skill:')) exportStandaloneSkill(after.slice(6))
  else toast('Current guidance selected for the next generated download. Original files are unchanged.')
  if (after && after !== 'selected' && $('#download-dialog').open) $('#download-dialog').close()
})
$('#guidance-dialog').addEventListener('close', () => {
  const returnFocus = guidanceReturnFocus
  const skipReturn = guidanceClosingForDownload
  guidanceClosingForDownload = false
  pendingGuidance = null
  pendingGuidanceDownload = null
  if (!skipReturn) requestAnimationFrame(() => { if (returnFocus?.isConnected && returnFocus.getClientRects().length && !returnFocus.closest('[hidden],[inert]')) returnFocus.focus({preventScroll:true}); else if (inspectorOpen && currentStep === 'review') $('#decision-review-heading')?.focus() })
})

document.addEventListener('input', event => {
  if (event.target.id !== 'decision-review-reason' || !config) return
  reviewReason = event.target.value
  renderSession()
  clearTimeout(compileTimer)
  compileTimer = setTimeout(() => updatePack(false), 180)
})

$('#decision-baseline-file').addEventListener('change', async event => {
  const active = config
  try {
    if (!active || !event.target.files.length) return
    const result = await readProjectFiles([...event.target.files])
    if (config !== active) throw new Error('The active project changed while reading the comparison. Select it again for this project.')
    decisionBaseline = result.config
    decisionBaselineLabel = `Compared with ${event.target.files[0].name}`
    baselineNeedsDownload = true
    clearTimeout(compileTimer)
    updatePack(false)
    renderStep()
    $('#decision-review-heading')?.focus()
    toast('Comparison baseline loaded. Your current project decisions were not replaced.')
  } catch (error) { toast(`Could not load the comparison baseline. ${error.message}`) }
  finally { event.target.value = '' }
})

function openTaskBrief() {
  if (!config) return
  briefReturnFocus = document.activeElement
  const firstStage = getStages(config).find(stage => config.workflow.enabledStages.includes(stage.id))?.id
  $('#brief-name').value = config.project.name
  $('#brief-purpose').value = config.project.purpose
  $('#brief-context').value = firstStage ? config.workflow.notes[firstStage] || '' : ''
  $('#brief-context').disabled = !firstStage
  $('#brief-context').closest('label').hidden = !firstStage
  $('#brief-dialog').showModal()
  $('#brief-name').focus()
}

function recordTaskBrief() {
  if (!config) return
  config.project.name = $('#brief-name').value
  config.project.purpose = $('#brief-purpose').value
  const firstStage = getStages(config).find(stage => config.workflow.enabledStages.includes(stage.id))?.id
  if (firstStage) config.workflow.notes[firstStage] = $('#brief-context').value
  changed('task-brief')
}
$('#brief-form').addEventListener('input', recordTaskBrief)
$('#brief-dialog').addEventListener('close', () => requestAnimationFrame(() => {
  if (briefReturnFocus?.isConnected && !briefReturnFocus.closest('[hidden],[inert]') && briefReturnFocus.getClientRects().length) briefReturnFocus.focus({preventScroll:true})
  else (workspaceView === 'artifacts' ? $('#artifact-workspace') : $('#project-content')).focus({preventScroll:true})
}))
$('#brief-form').addEventListener('submit', event => {
  event.preventDefault()
  recordTaskBrief()
  $('#brief-dialog').close()
  clearTimeout(compileTimer)
  updatePack(false)
  $('#project-content').focus()
})

function chosenOutput() {
  const recommendation = recommendOutput(config)
  const selection = outputSelection || {kind:recommendation.kind,skillId:recommendation.skillId}
  return selection.kind === 'skill' ? selection : {kind:selection.kind,skillId:null}
}

function preferredSkill() {
  const available = getEffectiveSkills(config)
  const stageId = selectedStage && config.workflow.enabledStages.includes(selectedStage) ? selectedStage : config.workflow.enabledStages[0]
  const assigned = config.workflow.bindings[stageId]?.skills || []
  return assigned.find(id => available.some(skill => skill.id === id)) || available[0]?.id || null
}

function outputTitle(kind) {
  return {blueprint:'Workflow blueprint',skill:'One focused skill',pack:'Full artifact pack'}[kind]
}

function renderOutputChoice() {
  const recommendation = recommendOutput(config)
  const selection = chosenOutput()
  const available = getEffectiveSkills(config)
  const selectedSkill = available.find(skill => skill.id === selection.skillId)
  const missingSkill = selection.kind === 'skill' && !selectedSkill
  const descriptions = {blueprint:'Share the plan, decisions and open questions.',skill:'Give an assistant one procedure, such as diagnosis or review.',pack:'Coordinate the workflow with your selected skills and agent profiles.'}
  const scope = selection.kind === 'skill'
    ? missingSkill ? 'This procedure is no longer assigned. Choose another procedure or output.' : `${selectedSkill.label} is one procedure. It does not cover the whole ${recipe() ? `${labelOf(recipe()).toLowerCase()} workflow` : 'connected process'}.`
    : selection.kind === 'blueprint' ? 'A readable plan for people. Agent profiles and skill files are left out.' : 'Use this when you need several procedures or role instructions. Start with the files for your task.'
  $('#download-output').innerHTML = `<div class="output-recommendation"><span class="eyebrow">${outputSelection ? 'YOUR CHOICE' : 'SUGGESTED START'}</span><strong>${escape(outputSelection ? outputTitle(selection.kind) : recommendation.title)}</strong><p>${outputSelection ? 'Choose the amount of guidance you need now. You can change this at any time.' : escape(recommendation.reason)}</p></div><fieldset class="output-options"><legend>What would help you now?</legend>${['blueprint','skill','pack'].map(kind => `<label class="output-option${selection.kind === kind ? ' is-selected' : ''}"><input type="radio" name="output-kind" data-output-kind="${kind}" value="${kind}" ${selection.kind === kind ? 'checked' : ''} ${kind === 'skill' && !available.length ? 'disabled' : ''}><span><strong>${outputTitle(kind)}</strong><small>${descriptions[kind]}${kind === 'skill' && !available.length ? ' Assign a skill to a stage first.' : ''}</small></span></label>`).join('')}</fieldset>${selection.kind === 'skill' ? `<label class="journey-field" for="output-skill"><span>Choose one procedure</span><select id="output-skill" aria-describedby="output-scope" ${missingSkill ? 'aria-invalid="true"' : ''}>${missingSkill ? `<option value="${escape(selection.skillId)}" selected disabled>${escape(named(CATALOG.skills, selection.skillId))} (no longer assigned)</option>` : ''}${available.map(skill => `<option value="${escape(skill.id)}" ${skill.id === selection.skillId ? 'selected' : ''}>${escape(skill.label)}</option>`).join('')}</select></label>` : ''}<p class="output-scope" id="output-scope">${escape(scope)}</p><p class="hint output-project-note">Every ZIP keeps your full project decisions so you can reopen it and choose a different output later.</p>`
  let failure = ''
  try { downloadPack = packageProject(config, withSessionReview(compileOutput(config, selection))) }
  catch (error) { downloadPack = null; failure = error.message }
  const files = downloadPack?.files || []
  $('#selected-output-title').textContent = `Download ${outputTitle(selection.kind).toLowerCase()}`
  $('#selected-output-description').textContent = `${files.length} files. Includes project decisions, use instructions and a readable Atlas for reopening.`
  $('[data-studio-action="download-output"]').disabled = !downloadPack
  $('[data-studio-action="download-atlas"]').disabled = !downloadPack
  if (failure) $('#selected-output-description').textContent = `Generation needs attention. ${failure}`
  if (!downloadPack) {
    $('#download-use-guide').innerHTML = '<p class="hint">Choose an available output above to preview its files and use instructions. Your project decisions remain in this session.</p>'
    return
  }
  const guide = getUseGuide(config, selection)
  const routes = list(guide.reading).map(route => ({...route,paths:list(route.paths).filter(path => files.some(file => file.path === path))})).filter(route => route.paths.length)
  const routeFiles = routes.flatMap(route => route.paths)
  const reading = routes.length ? `<details class="download-reading"><summary>Read only what you need</summary><p class="hint">Choose your task. Preview these files before downloading.</p><ul>${routes.map(route => `<li><strong>${escape(route.label)}</strong><p>${escape(route.purpose)}</p><div>${route.paths.map(path => `<button type="button" class="text-button" data-select-file="${escape(path)}" aria-label="Preview ${escape(path)}">${escape(artifactLabel(path, routeFiles))}</button>`).join('')}</div></li>`).join('')}</ul></details>` : ''
  $('#download-use-guide').innerHTML = `${reading}<details class="use-download" id="use-download"><summary>How to use this download</summary><h3 id="use-download-title" tabindex="-1">${escape(guide.title)}</h3><p>${escape(guide.intro)}</p><ol>${guide.steps.map(step => `<li><strong>${escape(step.title)}</strong><p>${escape(step.body)}</p></li>`).join('')}</ol><p class="hint">${escape(Array.isArray(guide.limits) ? guide.limits.join(' ') : guide.limits)}</p>${guide.source ? `<a href="${escape(guide.source)}" target="_blank" rel="noopener noreferrer">Official host guidance ↗</a>` : ''}</details><details class="download-inventory"><summary>Included files and their purpose (${files.length})</summary><ul>${files.map(file => `<li><code>${escape(file.path)}</code><span>${escape(file.why || 'Recorded project artifact.')}</span></li>`).join('')}</ul></details>`
}

function renderStudio() {
  renderSession()
  $('#start-screen').hidden = Boolean(config) || knowledgeOpen
  $('#studio-layout').hidden = !config || knowledgeOpen
  if (!config) {
    $('.skip').href = '#start-screen'
    syncEditorAccess()
    return
  }
  $('#project-content').hidden = workspaceView === 'artifacts'
  $('#project-content').setAttribute('aria-label', workspaceView === 'overview' ? 'Project Atlas preview' : 'Current workflow')
  $('#artifact-workspace').hidden = workspaceView !== 'artifacts'
  $('.skip').href = workspaceView === 'artifacts' ? '#artifact-workspace' : '#project-content'
  $('#view-nav').querySelectorAll('[data-project-view]').forEach(button => {
    if (button.dataset.projectView === workspaceView) button.setAttribute('aria-current', 'page')
    else button.removeAttribute('aria-current')
  })
  $('#preview-atlas').setAttribute('aria-pressed', String(workspaceView === 'overview'))
  $('#project-details').setAttribute('aria-expanded', String(inspectorOpen && detailSections.includes(currentStep) && !selectedStage))
  $('#review-project').setAttribute('aria-expanded', String(inspectorOpen && currentStep === 'review' && !selectedStage))
  if (workspaceView !== 'artifacts') {
    const active = document.activeElement
    const attributes = active?.tagName === 'BUTTON' && $('#project-content').contains(active) ? [...active.attributes].filter(attribute => attribute.name.startsWith('data-')) : []
    const focusSelector = attributes.map(attribute => `[${attribute.name}="${CSS.escape(attribute.value)}"]`).join('')
    const paletteOpen = Boolean($('#project-content [data-authoring-palette]')?.open)
    $('#project-content').innerHTML = renderProjectView(config, pack, { view: workspaceView, selectedStage, editing: true, authoring: true, paletteOpen })
    if (workspaceView === 'workflow') $('#project-content').insertAdjacentHTML('afterbegin', processDesigner.launcher(config))
    if (focusSelector) $('#project-content').querySelector(`button${focusSelector}`)?.focus({preventScroll:true})
  }
  $('#inspector').hidden = !inspectorOpen
  $('#studio-layout').classList.toggle('has-inspector', inspectorOpen)
  syncEditorAccess()
  syncPalette()
  const tray = $('#impact-tray')
  tray.hidden = !lastImpact.length
  if (lastImpact.length) tray.innerHTML = `<div><span class="impact-dot"></span><strong>${lastImpact.length} ${lastImpact.length === 1 ? 'file updated' : 'files updated'}</strong><small>From your latest edit</small></div><div class="impact-files">${lastImpact.slice(0, 3).map(path => `<button type="button" data-select-file="${escape(path)}" title="${escape(path)}" aria-label="${escape(artifactLabel(path, lastImpact))}. Open ${escape(path)}">${escape(artifactLabel(path, lastImpact))} ↗</button>`).join('')}${lastImpact.length > 3 ? `<button type="button" data-project-view="artifacts">View all →</button>` : ''}</div><button type="button" class="icon-button" data-studio-action="dismiss-impact" aria-label="Dismiss change summary">×</button>`
  renderInspectorImpact()
}

function renderInspectorImpact() {
  if (!config || !pack) return
  const relevant = selectedStage ? pack.files.filter(file => file.stages?.includes(selectedStage) || file.path === 'WORKFLOW.md') : pack.files.filter(file => {
    if (currentStep === 'artifacts') return file.path.startsWith('.github/')
    if (currentStep === 'evidence') return ['EVIDENCE.md','PROJECT-FACTS.md'].includes(file.path)
    if (currentStep === 'workflow') return ['WORKFLOW.md','RUNTIME-DESIGN.md'].includes(file.path)
    return ['WORKFLOW.md','project.json'].includes(file.path)
  })
  relevant.sort((a, b) => (a.path === 'WORKFLOW.md' ? -1 : b.path === 'WORKFLOW.md' ? 1 : 0))
  const artifactPaths = relevant.filter(file => file.path !== 'PROJECT-ATLAS.html').map(file => file.path)
  $('#inspector-impact').innerHTML = `<span>RELATED FILES</span><div>${artifactPaths.slice(0, 4).map(path => `<button type="button" data-select-file="${escape(path)}" title="${escape(path)}" aria-label="${escape(artifactLabel(path, artifactPaths))}. Open ${escape(path)}">${escape(artifactLabel(path, artifactPaths))} ↗</button>`).join('')}</div>`
}

function showView(view, focus = true) {
  if (!config) { renderStudio(); return }
  if (view === 'architecture') { goTo('runtime', focus); return }
  if (view === 'evidence') { goTo('evidence', focus); return }
  if (!['overview','workflow','artifacts'].includes(view)) return
  workspaceView = view
  paletteSelection = null
  $('#palette-hint').hidden = true
  inspectorOpen = false
  selectedStage = ''
  history.replaceState(null, '', `#${view === 'overview' ? 'preview' : view === 'artifacts' ? 'files' : view}`)
  renderStudio()
  if (focus) {
    const content = view === 'artifacts' ? $('#artifact-workspace') : $('#project-content')
    content.focus({preventScroll:true})
    window.scrollTo({top:0,behavior:'instant'})
  }
}

function closeInspector() {
  inspectorOpen = false
  selectedStage = ''
  renderStudio()
  history.replaceState(null, '', `#${workspaceView === 'overview' ? 'preview' : workspaceView === 'artifacts' ? 'files' : 'workflow'}`)
  const original = inspectorReturnFocus?.isConnected && inspectorReturnFocus.getClientRects().length ? inspectorReturnFocus : inspectorReturnSelector ? document.querySelector(inspectorReturnSelector) : null
  if (original?.getClientRects().length && !original.closest('[hidden],[inert]')) original.focus()
  else $('#project-details').focus()
}

function rememberEditorInvoker() {
  const active = document.activeElement
  if ($('#inspector').contains(active)) return
  inspectorReturnFocus = active
  inspectorReturnSelector = ''
  if (active.id) inspectorReturnSelector = `#${CSS.escape(active.id)}`
  else for (const attribute of ['data-select-stage','data-open-editor','data-goto']) {
    if (active.hasAttribute(attribute)) { inspectorReturnSelector = `[${attribute}="${CSS.escape(active.getAttribute(attribute))}"]`; break }
  }
}

function openStage(id) {
  if (!config) return
  const stage = getStages(config).find(item => item.id === id)
  if (!stage) return
  if (paletteSelection) { applyPalette(id); return }
  rememberEditorInvoker()
  selectedStage = id
  currentStep = 'workflow'
  inspectorOpen = true
  history.replaceState(null, '', `#stage-${id}`)
  renderStudio()
  renderStep(true)
  $('#inspector').scrollTop = 0
}

function restoreHistory(direction) {
  if (!config) return
  if (processDesigner.isOpen()) return
  const next = historyIndex + direction
  if (next < 0 || next >= historyEntries.length) return
  clearTimeout(compileTimer)
  historyIndex = next
  config = JSON.parse(historyEntries[historyIndex])
  pruneAssistantAnswerReviews()
  if (selectedStage && !getStages(config).some(stage => stage.id === selectedStage)) {
    selectedStage = ''
    currentStep = 'intent'
    if (inspectorOpen) history.replaceState(null, '', '#details-intent')
  }
  lastHistoryKey = ''
  updatePack(false)
  if (inspectorOpen) renderStep()
  toast(direction < 0 ? 'Change undone.' : 'Change restored.')
}

function sectionHead(title, description, number) {
  return `<div class="section-head"><h3>${title}</h3><p>${description}</p></div>`
}

function field(label, path, value, placeholder = '', hint = '', type = 'text', full = false) {
  const id = `field-${path.replaceAll('.', '-')}`
  const limit = path.includes('.commands.') ? 4000 : /\.(name|path|revision|reviewer)$/.test(path) ? 200 : 20000
  const input = type === 'textarea'
    ? `<textarea id="${id}" maxlength="${limit}" data-field="${escape(path)}" placeholder="${escape(placeholder)}" ${hint ? `aria-describedby="${id}-hint"` : ''}>${escape(value)}</textarea>`
    : `<input id="${id}" type="${type}" maxlength="${limit}" data-field="${escape(path)}" value="${escape(value)}" placeholder="${escape(placeholder)}" ${hint ? `aria-describedby="${id}-hint"` : ''}>`
  return `<div class="field${full ? ' full' : ''}"><label for="${id}">${escape(label)}</label>${input}${hint ? `<span class="hint" id="${id}-hint">${escape(hint)}</span>` : ''}</div>`
}

function options(items, selected) {
  return items.map(item => typeof item === 'string' ? { id: item, label: item.replaceAll('-', ' ') } : item).filter(Boolean).map(item => `<option value="${escape(item.id)}" ${item.id === selected ? 'selected' : ''}>${escape(labelOf(item))}</option>`).join('')
}

function selectField(label, path, value, items, hint = '') {
  const id = `field-${path.replaceAll('.', '-')}`
  return `<div class="field"><label for="${id}">${escape(label)}</label><select id="${id}" data-field="${escape(path)}" ${hint ? `aria-describedby="${id}-hint"` : ''}>${options(items, value)}</select>${hint ? `<span class="hint" id="${id}-hint">${escape(hint)}</span>` : ''}</div>`
}

function checkField(label, path, checked, hint = '') {
  return `<label class="check-option"><input type="checkbox" data-field="${escape(path)}" ${checked ? 'checked' : ''}><span><strong>${escape(label)}</strong>${hint ? `<small>${escape(hint)}</small>` : ''}</span></label>`
}

function atlasLink(topic, label) {
  return `<button type="button" class="text-button" data-reference-topic="${escape(topic)}">${escape(label)} ↗</button>`
}

function renderIntent() {
  return sectionHead('Describe the outcome', 'These answers guide the instructions. Leave anything you do not know unresolved.') +
    `<div class="field"><label for="recipe-choice">Starting workflow</label><select id="recipe-choice" data-recipe-select>${!recipe() ? '<option value="" selected disabled>No development recipe. Custom processes only.</option>' : ''}${options(CATALOG.recipes, recipe() ? config.workflow.recipe : '')}</select><span class="hint">Choosing a development recipe keeps your custom processes and project records for review.</span></div><div class="field-grid brief-questions">${list(recipe()?.questions).map(getIntentQuestionWording).map(question => {
      const answer = getIntentAnswer(config, question.id)
      const review = assistantAnswerReview(question.id)
      if (review) {
        const text = assistantReviewWording.has(question.id) ? assistantReviewWording.get(question.id) : review.reviewText
        return `<div class="assistant-answer-review full" data-assistant-answer-review="${escape(question.id)}"><label for="assistant-answer-${escape(question.id)}">${escape(question.label)}</label><p class="hint" id="assistant-answer-hint-${escape(question.id)}">This appears in your description. Edit or shorten the wording, then choose Use this answer to include it in your files.</p><textarea id="assistant-answer-${escape(question.id)}" data-assistant-answer-wording="${escape(question.id)}" aria-describedby="assistant-answer-hint-${escape(question.id)}" maxlength="20000" rows="5">${escape(text)}</textarea><div class="inline-actions"><button type="button" class="secondary" data-confirm-assistant-answer="${escape(question.id)}">Use this answer</button><button type="button" class="text-button" data-defer-assistant-answer="${escape(question.id)}">Leave unanswered</button></div></div>`
      }
      const canInherit = getIntentAnswer({...config,workflow:{...config.workflow,answers:{...config.workflow.answers,[question.id]:''}}}, question.id).inherited
      const input = field(question.label, `workflow.answers.${question.id}`, config.workflow.answers[question.id] || '', '', canInherit ? 'Optional detail for this workflow. Leave blank to use your project outcome. Editing the overall outcome keeps a separately supplied answer.' : question.hint || '', 'textarea', true)
      if (!canInherit) return input
      return `<div class="inherited-intent full"><span class="eyebrow">${answer.inherited ? 'USES YOUR PROJECT OUTCOME' : 'OVERALL PROJECT OUTCOME'}</span><p class="preserved-answer">${escape(config.project.purpose)}</p><button type="button" class="text-button" data-studio-action="edit-outcome">Edit project outcome</button><details data-detail="intent-${escape(question.id)}" ${answer.inherited ? '' : 'open'}><summary>${answer.inherited ? 'Add a more specific answer, optional' : 'Your more specific answer'}</summary>${input}</details></div>`
    }).join('')}</div>${atlasLink('task-contract', 'Read about task contracts')}`
}

function hostNote() {
  if (!config.project.host) return 'Choose a Copilot environment if you want agent profiles. A workflow blueprint and portable skill can stay independent of an IDE.'
  if (config.project.host === 'github') return 'Copilot cloud agent needs a repository on GitHub. Review actual support and tool availability in your selected host.'
  if (config.project.host === 'jetbrains') return 'Review custom agent and skill support in your installed IDE and Copilot plugin. Exported tool lists request capabilities, not authorization.'
  return 'The VS Code adapter uses the documented target field. Available tools, models and integrations depend on your environment.'
}

function componentCard(component, index) {
  const base = `components.${index}`
  return `<div class="card component-card"><div class="card-title"><h3><span class="component-number">${String(index + 1).padStart(2, '0')}</span> Component</h3><button type="button" class="remove" data-action="remove-component" data-index="${index}">Remove component</button></div>
    <div class="field-grid">${field('Component name', `${base}.name`, component.name, 'e.g. Frontend')}${field('Repository path', `${base}.path`, component.path, 'e.g. apps/web or .', 'Relative to the repository root.')}</div>
    <span class="tech-label">Technologies and versions</span><div class="tech-entry"><select aria-label="Technology for component ${index + 1}" data-tech-select="${index}"><option value="">Choose a technology</option>${options(CATALOG.technologies, '')}<option value="__custom">Custom technology</option></select><input aria-label="Technology version for component ${index + 1}" data-tech-version="${index}" maxlength="200" placeholder="Version"><button type="button" class="secondary" data-action="add-tech" data-index="${index}">Add</button></div>
    <div class="field tech-custom" data-tech-custom-wrap="${index}" hidden><label for="custom-tech-${index}">Custom technology name</label><input id="custom-tech-${index}" data-tech-custom="${index}" maxlength="200" placeholder="e.g. Internal query engine"></div>
    <div class="tech-list">${component.technologies.map((tech, techIndex) => `<span class="tech-chip">${escape(named(CATALOG.technologies, tech.id))}${tech.version ? ` ${escape(tech.version)}` : ''}<button type="button" data-action="remove-tech" data-index="${index}" data-tech-index="${techIndex}" aria-label="Remove ${escape(tech.id)}">×</button></span>`).join('')}${!component.technologies.length ? '<span class="hint">Use the stack this component actually has.</span>' : ''}</div>
    <details data-detail="commands-${escape(component.id)}"><summary>Actual commands</summary><div class="commands">${field('Test', `${base}.commands.test`, component.commands.test, 'Actual test command, or leave unresolved')}${field('Lint', `${base}.commands.lint`, component.commands.lint, 'Optional check command')}${field('Build', `${base}.commands.build`, component.commands.build, 'Actual build command, or leave unresolved')}</div><p class="hint">Commands are exported as supplied text. Paths and execution have not been checked.</p></details></div>`
}

function technologyQuestions() {
  const selected = new Set(config.components.flatMap(component => component.technologies.map(tech => tech.id)))
  const profiles = list(CATALOG.technologyProfiles).filter(profile => profile.id === 'generic' || profile.technologies.some(id => selected.has(id)))
  if (!profiles.length) return '<div class="info-strip"><span class="info-icon">i</span><span>Generic guidance applies. Add project-specific checks in the workflow. Selecting a technology does not establish compatibility or expertise.</span></div>'
  return `<div class="section-subhead"><h3>Questions for this stack</h3><span>Decisions, not assumed setup.</span></div>${profiles.map(profile => `<details class="card profile-card" data-detail="profile-${escape(profile.id)}"><summary>${escape(labelOf(profile))}</summary><div class="field-grid">${profile.questions.map((question, index) => {
    const key = typeof question === 'string' ? `technology-${profile.id}-${index}` : question.id
    return field(typeof question === 'string' ? question : question.label, `workflow.answers.${key}`, config.workflow.answers[key], '', typeof question === 'string' ? '' : question.hint || '', 'textarea', true)
  }).join('')}</div><ul class="compact-list">${profile.checks.map(check => `<li>${escape(check)}</li>`).join('')}</ul><p class="hint">${escape(profile.limits)}</p><a href="${escape(profile.source)}" target="_blank" rel="noopener noreferrer">Primary documentation ↗</a></details>`).join('')}`
}

function importPreview() {
  if (!candidateImport) return ''
  return `<div class="card import-preview"><div class="card-title"><h3>Review imported candidates</h3><span class="label-tag">NOT CONFIRMED</span></div><p class="hint">Only the files you selected were read. Confirm facts separately after adding them. Existing components and commands are not overwritten.</p>${candidateImport.warnings.map(warning => `<p class="issue">${escape(warning)}</p>`).join('')}
    <div class="candidate-list">${candidateImport.facts.map((fact, index) => `<label class="check-option"><input type="checkbox" data-import-fact="${index}" ${candidateImport.selectedFacts.has(index) ? 'checked' : ''}><span><strong>${escape(fact.claim)}</strong><small>${escape(fact.source)} · ${escape(fact.status)}</small></span></label>`).join('')}${candidateImport.components.map((component, index) => `<label class="check-option"><input type="checkbox" data-import-component="${index}" ${candidateImport.selectedComponents.has(index) ? 'checked' : ''}><span><strong>Add component: ${escape(component.name)}</strong><small>${escape(component.path)} · ${escape(component.technologies.map(tech => tech.id).join(', '))}. Review imported commands.</small></span></label>`).join('')}</div><div class="inline-actions"><button type="button" class="primary" data-action="accept-import">Add selected candidates</button><button type="button" class="secondary" data-action="dismiss-import">Discard candidates</button></div></div>`
}

function renderProject() {
  return sectionHead('Use your actual project context', 'Paths, technologies and commands are supplied by you. Template settings are editable choices, not detected facts.') +
    `<div class="card"><div class="field-grid">${selectField('Copilot environment', 'project.host', config.project.host, [{id:'',label:'Not chosen'},...CATALOG.hosts], 'Choose your actual environment when you need agent instructions.')}${selectField('Source control', 'project.sourceControl', config.project.sourceControl, [{id:'',label:'Not chosen'}, { id: 'bitbucket', label: 'Bitbucket' }, { id: 'github', label: 'GitHub' }, { id: 'other', label: 'Other or local' }], 'No repository is detected or connected.')}${field('Source locations', 'project.sourceLocations', config.project.sourceLocations, 'Links or paths to requirements and documentation', 'References only. Keep credentials out of exported settings.', 'textarea', true)}</div><p class="hint" id="host-note">${hostNote()}</p><a href="https://docs.github.com/en/copilot/reference/custom-agents-configuration" target="_blank" rel="noopener noreferrer">Official host reference</a></div>
    <div class="import-launch"><div><strong>Bring in project facts</strong><p>Upload package.json, pom.xml or a facts report. Review candidates before adding them.</p></div><button type="button" class="secondary" data-action="import-facts">Choose files ↑</button></div>${importPreview()}<div class="section-subhead"><h3>Project components</h3><span>Paths, stack and actual commands.</span></div>${config.components.map(componentCard).join('')}${!config.components.length ? '<p class="empty-help">No repository components recorded. A process study can stay this way. Agent-run tests or release checks need a component with an actual command.</p>' : ''}<button type="button" class="add-component" data-action="add-component">+ Add a component</button>${technologyQuestions()}`
}

function fact(title, value) {
  return `<div><dt>${escape(title)}</dt><dd>${list(value).length > 1 ? `<ul>${list(value).map(item => `<li>${escape(item)}</li>`).join('')}</ul>` : escape(list(value)[0] || 'No fixed value')}</dd></div>`
}

function actorName(binding) {
  return binding.actorType === 'agent' ? named(CATALOG.roles, binding.actorId) : binding.actorName || (binding.actorType === 'external' ? 'External system, unnamed' : 'Human, unnamed')
}

function stageCard(stage, index) {
  const enabled = config.workflow.enabledStages.includes(stage.id)
  const binding = config.workflow.bindings[stage.id]
  const base = `workflow.bindings.${stage.id}`
  return `<div class="stage-card ${enabled ? '' : 'is-off'}" data-stage-card="${escape(stage.id)}">
    <div class="stage-top"><span>${String(index + 1).padStart(2, '0')}</span><label class="stage-toggle"><div><strong>Include this stage</strong><small>${escape(stage.purpose)}</small></div><input type="checkbox" data-stage="${escape(stage.id)}" ${enabled ? 'checked' : ''} aria-label="Include ${escape(labelOf(stage))}"></label></div>
    <div class="field-grid stage-assignment">${selectField('Responsible actor', `${base}.actorType`, binding.actorType, [{ id: 'human', label: 'Person' }, { id: 'agent', label: 'Agent profile' }, { id: 'external', label: 'External system' }])}${binding.actorType === 'agent' ? selectField('Agent role', `${base}.actorId`, binding.actorId, [{ id: '', label: 'Choose an enabled role' }, ...config.agents.map(agent => CATALOG.roles.find(role => role.id === agent.role))]) : field(binding.actorType === 'external' ? 'System or service' : 'Person or team', `${base}.actorName`, binding.actorName, binding.actorType === 'external' ? 'e.g. CI pipeline' : 'Name or owner')}</div>
    ${binding.actorType === 'agent' ? checkField('Work only from supplied context', `${base}.contextOnly`, binding.contextOnly, 'Appropriate for reviewing supplied material without repository tools.') : ''}
    ${field('Instructions and handoff for this stage', `workflow.notes.${stage.id}`, config.workflow.notes[stage.id], 'Add project constraints, acceptance examples or handoff details', ['architecture','diagnosis','bug-fix','options','recommendation'].includes(stage.id) ? 'Record the approach and its reason here. Preview Atlas presents these supplied notes in the decision brief.' : '', 'textarea')}
    <details data-detail="stage-skills-${escape(stage.id)}"><summary>Relevant skills · ${binding.skills.length} selected</summary><fieldset class="skill-bindings"><legend class="sr-only">Relevant skills</legend>${CATALOG.skills.map(skill => `<label class="tool-toggle"><input type="checkbox" data-binding-skill="${escape(skill.id)}" data-stage-id="${escape(stage.id)}" ${binding.skills.includes(skill.id) ? 'checked' : ''}>${escape(labelOf(skill))}</label>`).join('')}</fieldset></details>
    ${list(stage.dependsOn).map(id => field(`Existing ${named(CATALOG.stages, id)} output`, `workflow.suppliedInputs.${id}`, config.workflow.suppliedInputs[id], 'Path or source reference', 'Supply an existing artifact to satisfy this input without repeating the earlier stage.')).join('')}
    <details data-detail="stage-reference-${escape(stage.id)}"><summary>Stage inputs, outputs and checks</summary><dl class="stage-facts">${fact('Required inputs', stage.inputs)}${fact('Expected outputs', stage.outputs)}${fact('Acceptance and evidence', stage.checks)}${fact('Capabilities if assigned to an agent', stage.capabilities)}</dl></details>
    <div class="stage-actions"><button type="button" class="text-button" data-action="add-stage-evidence" data-stage-id="${escape(stage.id)}">+ Record an acceptance check</button>${atlasLink(stage.atlasTopic || 'task-contract', 'Read related guidance')}</div></div>`
}

function renderRuntime() {
  const runtime = config.runtime
  const fields = [
    ['outcome', 'Successful outcome', 'What must the backend actually confirm?'],
    ['requiredInputs', 'Required information', 'When should the system request clarification?'],
    ['judgment', 'Where model judgment is useful', 'Which steps should use ordinary application code?'],
    ['tools', 'Tools and allowed changes', 'What can each tool read, create or update?'],
    ['validation', 'Checks before persistence', 'Record business validation and authorization requirements.'],
    ['limits', 'Execution and data limits', 'Time, calls, retries, usage, retrieved and affected records.'],
    ['duplicates', 'Duplicate requests and uncertain writes', 'How is a retry identified and its original result recovered?'],
    ['failures', 'Failures and partial completion', 'Clarification, invalid proposals, timeouts and recovery.'],
    ['confirmation', 'Confirmed versus inferred result', 'Backend action evidence, assumptions and unresolved values.']
  ]
  return `<div class="card"><div class="card-title"><h3>Backend runtime design</h3><span class="label-tag">PROPOSED DESIGN</span></div>${checkField('Include a runtime design', 'runtime.enabled', runtime.enabled, 'The team workflow builds the feature. This design describes a future application request.')}${runtime.enabled ? `<div class="runtime-path" aria-label="Proposed runtime architecture"><span>Request</span><b>→</b><span>API</span><b>→</b><span>Agent</span><b>→</b><span>Typed tools</span><b>→</b><span>Backend</span><b>→</b><span>Confirmed result</span></div><p class="hint">MCP is an optional tool interface. A fixed process may need ordinary code around a model call.</p><details data-detail="runtime-decisions"><summary>Outcome, boundaries and failure behavior</summary><div class="field-grid">${fields.map(([key, label, hint]) => field(label, `runtime.${key}`, runtime[key], '', hint, 'textarea', true)).join('')}</div></details><details data-detail="runtime-controls"><summary>Implementation and evidence references</summary><p class="hint">These statuses describe supplied records. Atlas does not enforce or verify runtime controls.</p>${runtime.controls.map((control, index) => `<div class="control-record"><strong>${escape(control.label)}</strong><div class="field-grid">${selectField('Recorded progress', `runtime.controls.${index}.status`, control.status, [{ id: 'requirement', label: 'Requirement recorded' }, { id: 'implementation-linked', label: 'Implementation linked' }, { id: 'evidence-recorded', label: 'Evidence recorded' }])}${field('Implementation reference', `runtime.controls.${index}.implementation`, control.implementation, 'Path or operation reference')}${selectField('Supporting evidence record', `runtime.controls.${index}.evidenceId`, control.evidenceId, [{ id: '', label: 'No evidence linked' }, ...config.evidence.map(item => ({ id: item.id, label: item.check || 'Untitled check' }))])}</div></div>`).join('')}</details>` : ''}</div>`
}

function renderArtifacts() {
  const effective = getEffectiveSkills(config).map(skill => skill.id)
  return sectionHead('Give each role focused instructions', 'Step assignments determine the relevant skills. Additional skills can be exported deliberately.', 4) +
    `<div class="section-subhead"><h3>Copilot agent profiles</h3><span>Enable the roles you actually need.</span></div>${CATALOG.roles.map(role => {
      const agent = config.agents.find(item => item.role === role.id)
      const assigned = getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id) && config.workflow.bindings[stage.id]?.actorType === 'agent' && config.workflow.bindings[stage.id].actorId === role.id)
      const custom = config.workflowModel.processes.filter(process => process.source === 'custom' && process.kind !== 'application').flatMap(process => process.steps.filter(step => step.actor.type === 'agent' && step.actor.id === role.id).map(step => ({ ...step, label: `${process.name || process.id} / ${step.name || step.id}` })))
      const skills = [...new Set([...assigned.flatMap(stage => config.workflow.bindings[stage.id].skills), ...custom.flatMap(step => step.instructionIds)])]
      const assignments = [...assigned.map(stage => labelOf(stage)), ...custom.map(step => step.label)]
      return `<div class="agent-card"><label class="selection"><input type="checkbox" data-role="${role.id}" ${agent ? 'checked' : ''}><span><strong>${escape(labelOf(role))}</strong><small>${escape(role.description)}</small></span></label>${agent ? `<p class="role-use">Used by ${assignments.length ? assignments.map(escape).join(', ') : 'no selected step'}. ${skills.length ? `Skills: ${skills.map(id => escape(named(CATALOG.skills, id))).join(', ')}.` : 'No step skills assigned.'}</p><fieldset class="tools"><legend>Requested host tools</legend>${TOOL_ALIASES.map(tool => `<label class="tool-toggle"><input type="checkbox" data-tool="${tool}" data-role-id="${role.id}" ${agent.tools.includes(tool) ? 'checked' : ''}>${tool}</label>`).join('')}</fieldset><p class="hint">An empty list is valid for supplied-context work. Tool requests are checked against the assigned work. Application actors are separate from these development profiles.</p>` : ''}</div>`
    }).join('')}
    <div class="section-subhead"><h3>Portable skills</h3><span>${effective.length} included through assignments or your choices.</span></div><div class="selection-grid">${CATALOG.skills.map(skill => `<div class="skill-option"><label class="selection"><input type="checkbox" data-skill="${skill.id}" ${config.skills.includes(skill.id) ? 'checked' : ''}><span><strong>${escape(labelOf(skill))}</strong><small>${escape(skill.description)}</small><small>${effective.includes(skill.id) ? 'Included in this pack' : 'Not included'} · Checkbox adds an extra export</small></span></label>${effective.includes(skill.id) ? `<button type="button" class="text-button" data-action="export-skill" data-skill-id="${skill.id}">Download standalone skill ↓</button>` : ''}</div>`).join('')}</div>
    <p class="hint">Tool lists request host capabilities. ${atlasLink('agent-roles', 'Read about roles')}</p>`
}

function renderBoundaries() {
  return sectionHead('Set the project boundaries', 'Review these template settings against the actual project rules.') +
    `<div class="card">${checkField('Require review before release', 'constraints.approvalRequired', config.constraints.approvalRequired, 'Record a human decision before production changes.')}${checkField('Read only workflow', 'constraints.readOnly', config.constraints.readOnly, 'Repository modification by an assigned agent needs review.')}${field('Project constraints', 'constraints.notes', config.constraints.notes, 'Policies, conventions and boundaries', 'Record actual project rules.', 'textarea')}</div>
    <details class="card" data-detail="practices"><summary>Source backed practices</summary><p class="hint">Select the guidance that applies to this project.</p>${CATALOG.practices.map(practice => `<div class="practice-card"><label class="selection"><input type="checkbox" data-practice="${practice.id}" ${config.practices.includes(practice.id) ? 'checked' : ''}><span><strong>${escape(labelOf(practice))}</strong><small>${escape(practice.description)}</small></span></label><details><summary>Contribution and limits</summary><p>${escape(practice.application)}</p><p>${escape(list(practice.limits).join(' '))}</p><a href="${escape(practice.source)}" target="_blank" rel="noopener noreferrer">Primary source</a></details></div>`).join('')}</details>`
}

function factRecord(record, index) {
  const base = `facts.${index}`
  return `<details class="card record-card" data-detail="fact-${escape(record.id)}" ${!record.claim ? 'open' : ''}><summary><span>${escape(record.claim || 'New project fact')}</span><span class="record-state">${escape(record.status.replaceAll('-', ' '))}</span></summary><div class="field-grid">${field('Claim or unresolved question', `${base}.claim`, record.claim, '', '', 'textarea', true)}${selectField('Knowledge status', `${base}.status`, record.status, CATALOG.factStatuses)}${field('Source location', `${base}.source`, record.source, 'Path or source URL')}${field('Source revision or date', `${base}.revision`, record.revision)}${field('Reviewer or owner', `${base}.reviewer`, record.reviewer)}${field('Notes, conflicts and limits', `${base}.notes`, record.notes, '', '', 'textarea', true)}</div><button type="button" class="remove" data-action="remove-fact" data-index="${index}">Remove fact</button></details>`
}

function evidenceRecord(record, index) {
  const base = `evidence.${index}`
  return `<details class="card record-card" data-detail="evidence-${escape(record.id)}" ${!record.check ? 'open' : ''}><summary><span>${escape(record.check || 'New acceptance check')}</span><span class="record-state">${escape(record.status.replaceAll('-', ' '))}</span></summary><div class="field-grid">${selectField('Workflow stage', `${base}.stageId`, record.stageId, [{ id: '', label: 'Project level check' }, ...getStages(config)])}${selectField('Reported status', `${base}.status`, record.status, CATALOG.evidenceStatuses)}${field('Check or evaluation case', `${base}.check`, record.check, 'What are we trying to establish?', '', 'textarea', true)}${field('Expected outcome', `${base}.expected`, record.expected, '', '', 'textarea', true)}${field('Observed outcome', `${base}.observed`, record.observed, 'Record what happened. Leave blank if not exercised.', '', 'textarea', true)}${selectField('Evidence origin', `${base}.method`, record.method, [{ id: 'user-recorded', label: 'Recorded by a person' }, { id: 'tool-observed', label: 'Supplied tool observation' }], 'Selecting tool observation does not mean Atlas ran the check.')}${field('Supporting output or source', `${base}.source`, record.source, 'Log, result file or reviewed report')}${field('Reviewer', `${base}.reviewer`, record.reviewer)}</div><button type="button" class="remove" data-action="remove-evidence" data-index="${index}">Remove check</button></details>`
}

function renderEvidence() {
  const stageIds = new Set(getStages(config).map(stage => stage.id))
  const records = config.evidence.map((record, index) => stageIds.has(record.stageId)
    ? `<div class="card evidence-link"><strong>${escape(record.check || 'Untitled check')}</strong><p class="hint">${escape(named(CATALOG.stages, record.stageId))}. Recorded: ${escape(record.status)}.</p><button type="button" class="text-button" data-edit-evidence="${index}">Edit this stage check</button></div>`
    : evidenceRecord(record, index)).join('')
  return sectionHead('Keep knowledge and proof distinct', 'Record sources, assumptions and actual observations. Missing information stays visible in the export.', 5) +
    `<div class="info-strip"><span class="info-icon">i</span><span>A recorded requirement is not an implemented control. A recorded result is a supplied claim until its source is reviewed. ${atlasLink('provenance', 'Explore provenance')}</span></div><div class="section-subhead"><h3>Project facts</h3><span>${config.facts.length} records</span></div>${config.facts.map(factRecord).join('')}${!config.facts.length ? '<p class="empty-help">Add only facts that matter to this workflow. Sources and uncertainties belong with the claim.</p>' : ''}<button type="button" class="add-component" data-action="add-fact">+ Add a fact or open question</button><div class="section-subhead"><h3>Acceptance and observed evidence</h3><span>${config.evidence.length} checks</span></div>${records}${!config.evidence.length ? '<p class="empty-help">Start with expected outcomes. Add observed results when the work has been exercised.</p>' : ''}<button type="button" class="add-component" data-action="add-evidence">+ Add an acceptance check</button>
    <details class="card model-card" data-detail="model"><summary>Model selection and evaluation plan</summary><p class="hint">Record a model if this workflow uses one. Evaluation stages and runtime drafts include a template for comparing relevant options. Atlas does not run evaluations.</p><div class="field-grid">${field('Chosen model or unresolved choice', 'model.name', config.model.name, 'Model name, or leave unresolved')}${field('Model version', 'model.version', config.model.version)}${field('Budget and limits', 'model.budget', config.model.budget, 'Units, time period and assumptions', '', 'textarea', true)}${field('Selection rationale and observations', 'model.notes', config.model.notes, 'Task quality, human corrections, latency and measured expenditure', 'No universal model ranking or token saving is assumed.', 'textarea', true)}</div>${atlasLink('evaluation', 'Explore evaluation')}</details>`
}

function issueStep(path) {
  if (path.startsWith('workflow.answers.technology-')) return 'project'
  if (path === 'workflow.recipe') return 'intent'
  if (/^workflow\.answers/.test(path)) return 'intent'
  if (/^(project|components)/.test(path)) return 'project'
  if (/^runtime/.test(path)) return 'runtime'
  if (/^workflow/.test(path)) return 'workflow'
  if (/^(practices|constraints)/.test(path)) return 'boundaries'
  if (/^(skills|agents)/.test(path)) return 'artifacts'
  if (/^(facts|evidence|model)/.test(path)) return 'evidence'
  return 'review'
}

function statusCard(title, pass, description, unavailable = false) {
  return `<div class="status-card ${pass ? '' : 'pending'}"><div class="status-icon">${pass ? '✓' : unavailable ? '○' : '!'}</div><strong>${escape(title)}</strong><span>${escape(description)}</span></div>`
}

function prioritizedIssues(issues) {
  return [...issues].sort((first, second) => Number(second.severity === 'error') - Number(first.severity === 'error'))
}

function renderComparison() {
  return `<details class="card" data-detail="maintenance"><summary>Regenerate without losing local edits</summary><p class="hint">Compare a generated baseline, your edited pack and this new generation. Files remain in the browser. Conflicts need an explicit choice.</p><div class="inline-actions"><button type="button" class="secondary" data-action="save-snapshot">Save generated snapshot ↓</button><button type="button" class="secondary" data-action="load-baseline">Baseline folder ↑</button><button type="button" class="secondary" data-action="load-baseline-json">Baseline snapshot JSON ↑</button><button type="button" class="secondary" data-action="load-existing">Edited pack folder ↑</button><button type="button" class="secondary" data-action="load-existing-json">Edited files JSON ↑</button></div><p class="hint">Baseline: ${baselineFiles.length} files. Edited pack: ${existingFiles.length} files. Folder selection reads only the files you choose. Without a baseline, differing files require your decision.</p>${existingFiles.length ? `<button type="button" class="secondary" data-action="compare-pack">Compare with current generation</button>` : ''}${comparison.length ? `<p id="comparison-snapshot-note" class="issue warning" role="status" ${comparisonIsStale() ? "" : "hidden"}>Your project or output changed after this comparison. These files and choices are kept as an earlier snapshot. Compare with current generation to review your latest changes, or export these reviewed files and keep later project edits separately.</p><div class="comparison-list">${comparison.map((row, index) => `<details class="comparison-row"><summary><span>${escape(row.path)}</span><span class="record-state">${escape(row.status.replaceAll('-', ' '))}</span></summary><div class="field"><label for="comparison-${index}">Exported version</label><select id="comparison-${index}" data-resolution="${escape(row.path)}"><option value="" ${!(resolvedChoice(row)) ? 'selected' : ''}>Resolve this conflict</option>${options([{ id: 'generated', label: 'New generated file' }, { id: 'existing', label: 'Keep my edited file' }, { id: 'remove', label: 'Remove from export' }], resolvedChoice(row))}</select></div><div class="diff-columns"><div><strong>Existing</strong><pre>${escape(row.existing ?? '(File absent)')}</pre></div><div><strong>New generation</strong><pre>${escape(row.generated ?? '(File absent)')}</pre></div></div></details>`).join('')}</div><p class="hint">These choices apply to the files captured when this comparison was created. Edited files are not revalidated. The inventory and readable Atlas are rebuilt from the retained project and file contents. A comparison record accompanies the export.</p><button type="button" class="primary" data-action="export-reconciled">Export reviewed file set ↓</button>` : ''}</details>`
}

function renderReview() {
  const validation = { ...pack.validation, issues: prioritizedIssues(pack.validation.issues) }
  return sectionHead('Review the decisions and the files', 'Compare what changed, inspect the guidance and preserve your file edits.', 6) + (packagingFailure ? `<div class="issue error" role="alert"><strong>The download could not be prepared.</strong><p>${escape(packagingFailure)}</p><p>Project JSON can keep current settings. It does not keep comparison notes or supplied files.</p></div>` : '') + renderDecisionChanges() + renderGuidance() +
    `<div class="status-grid">${statusCard('Configuration', validation.configurationComplete, validation.configurationComplete ? 'Known required settings and rules satisfied.' : 'Required settings or rules need attention.')}${statusCard('File formats', validation.formatChecked && !packagingFailure, packagingFailure ? 'Portable output could not be prepared. Base generation checks do not establish a usable download.' : validation.formatChecked ? 'Generated structure checked.' : 'Generated structure needs attention.', Boolean(packagingFailure))}${statusCard('Host and behavior', false, 'No host execution or task improvement observed here.', true)}</div>${validation.issues.length ? `<div class="issue-list">${validation.issues.map(issue => `<div class="issue ${escape(issue.severity)}"><strong>${issue.severity === 'error' ? 'Needs attention' : 'Review note'}</strong> · ${escape(issue.message)}<button type="button" data-goto="${issueStep(issue.path)}" data-issue-path="${escape(issue.path)}">Open ${(steps.find(step => step.id === issueStep(issue.path))?.label || 'Stage details').toLowerCase()} →</button></div>`).join('')}</div>` : packagingFailure ? '<p class="hint">Resolve the output preparation failure before adopting a generated download.</p>' : '<div class="empty-state">The configuration and format checks passed. Inspect the files, exercise them in the intended host and record actual outcomes separately.</div>'}
    <div class="card review-card"><div class="card-title"><h3>Pack at a glance</h3><span class="label-tag">SCHEMA ${escape(config.schemaVersion)}</span></div><div class="review-summary"><dl><dt>Project</dt><dd>${escape(config.project.name || 'Unresolved')}</dd><dt>Intention</dt><dd>${escape(labelOf(recipe()) || 'Custom process design')}</dd><dt>Environment</dt><dd>${escape(named(CATALOG.hosts, config.project.host) || 'Not chosen')}</dd><dt>Components</dt><dd>${config.components.length}</dd><dt>Planned work</dt><dd>${getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id)).length} recipe stages, ${config.workflowModel.processes.filter(process => process.source === 'custom').reduce((count, process) => count + process.steps.length, 0)} custom steps</dd><dt>Planned skills / roles</dt><dd>${getEffectiveSkills(config).length} skills, ${config.agents.length} profiles</dd><dt>Evidence</dt><dd>${config.facts.length} facts, ${config.evidence.length} check records</dd><dt>Output</dt><dd>${pack.files.length} files, ${formatBytes(pack.stats.bytes)}</dd></dl></div></div><div class="card"><div class="card-title"><h3>Keep your source configuration</h3></div><p class="hint">JSON settings preserve decisions and supplied records. Generated files are reviewable outputs. Save a snapshot before editing an exported pack.</p><div class="inline-actions"><button type="button" class="secondary" data-action="export-config">Save settings .json ↓</button><button type="button" class="secondary" data-action="import-config">Import settings ↑</button></div></div>${renderComparison()}<div class="info-strip"><span class="info-icon">i</span><span>Start with <strong>INSTALL.md</strong>. Host discovery and useful task behavior need separate evidence. User-supplied observations do not become independently verified by exporting them.</span></div>`
}

function openDownload() {
  if (!config) return
  clearTimeout(compileTimer)
  updatePack(false)
  renderOutputChoice()
  renderDownloadReview()
  $('#download-result').textContent = ''
  $('#download-dialog').showModal()
}

function openedFileDifferences() {
  return openedFileReview().reviewRequired
}

function openedFileReview() {
  const comparable = files => files.filter(file => !['project-atlas.html','manifest.json','project.json'].includes(file.path.toLowerCase())).map(({path,content}) => ({path,content}))
  if (!config || importedFiles.length < 2) return {differences:[],sessionUpdates:[],reviewRequired:[]}
  const current = withSessionReview(compileOpenedOutput(config, importedFiles)).files
  return reviewOpenedFiles(comparable(importedFiles), generationAtOpen === null ? null : comparable(generationAtOpen), comparable(current))
}

function renderOpenedFileNotice() {
  const review = openedFileReview()
  const count = review.reviewRequired.length
  const updateCount = review.sessionUpdates.length
  for (const id of ['opened-files-strip','download-source-note']) {
    const target = document.getElementById(id)
    target.hidden = !count
    if (count) target.innerHTML = `<div><strong>${count} supplied ${count === 1 ? 'file needs' : 'files need'} review.</strong><p>They already differed when opened, or their origin is unknown. Compare them before replacing any content.</p></div><button type="button" class="secondary" data-studio-action="download-opened-files">Download original files</button><button type="button" class="text-button" data-goto="review">Compare file changes</button>`
  }
  for (const id of ['session-file-updates','download-session-updates']) {
    const target = document.getElementById(id)
    const wasOpen = target.querySelector('details')?.open || false
    target.hidden = !updateCount
    target.innerHTML = updateCount ? `<details ${wasOpen ? 'open' : ''}><summary>Your edits update ${updateCount} ${updateCount === 1 ? 'file' : 'files'}</summary><p>These updates come from decisions made in this session. Your original download is still available.</p><ul>${review.sessionUpdates.map(row => `<li><code>${escape(row.path)}</code></li>`).join('')}</ul><button type="button" class="text-button" data-studio-action="download-opened-files">Download original files</button></details>` : ''
  }
}

function renderDownloadReview() {
  const selectedPack = downloadPack || pack
  const issues = prioritizedIssues(selectedPack.validation.issues)
  const errors = issues.filter(issue => issue.severity === 'error')
  const notes = issues.length - errors.length
  const ready = downloadPack && selectedPack.validation.configurationComplete && selectedPack.validation.formatChecked
  const blueprintDraft = chosenOutput().kind === 'blueprint' && downloadPack && selectedPack.validation.formatChecked
  const summary = !downloadPack ? 'Selected output could not be generated. Your decisions remain in this session.' : blueprintDraft ? issues.length ? 'Draft blueprint ready to share.' : 'Blueprint ready to share.' : ready ? 'Configuration complete. Generated formats checked.' : errors.length ? `${errors.length} ${errors.length === 1 ? 'detail needs' : 'details need'} attention. You can keep this draft.` : 'Review generation findings before downloading.'
  const visibleIssues = blueprintDraft ? issues : errors
  const issueList = visibleIssues.length ? `<ul>${visibleIssues.slice(0, 4).map(issue => `<li>${escape(issue.message)} <button type="button" class="text-button" data-goto="${issueStep(issue.path)}" data-issue-path="${escape(issue.path)}">Edit</button></li>`).join('')}</ul>` : ''
  const reviewLink = `<button type="button" class="text-button" data-goto="review">${visibleIssues.length > 4 ? 'See all findings and file changes' : notes ? `Review ${notes} ${notes === 1 ? 'note' : 'notes'} and file changes` : 'Review details and file changes'}</button>`
  const findings = blueprintDraft && visibleIssues.length ? `<p class="hint">Your handoff keeps unanswered questions visible. You can share it before deciding every technical detail.</p><details class="blueprint-findings"><summary>Review ${visibleIssues.length} open details and notes</summary>${issueList}${reviewLink}</details>` : issueList + reviewLink
  $('#download-review').innerHTML = `<div class="download-review"><strong>${escape(summary)}</strong>${findings}<p class="hint">These instructions have not been exercised in your project.</p></div>`
  renderOpenedFileNotice()
}

$('#download-output').addEventListener('change', event => {
  if (!config) return
  if (event.target.matches('[data-output-kind]')) outputSelection = {kind:event.target.dataset.outputKind,skillId:event.target.dataset.outputKind === 'skill' ? preferredSkill() : null}
  else if (event.target.id === 'output-skill') outputSelection = {kind:'skill',skillId:event.target.value}
  else return
  const returnId = event.target.id
  const returnKind = event.target.dataset.outputKind
  updatePack(false)
  renderOutputChoice()
  renderDownloadReview()
  if (returnId) document.getElementById(returnId)?.focus()
  else if (returnKind) $(`[data-output-kind="${returnKind}"]`)?.focus()
  $('#download-result').textContent = 'Output choice updated. Your workflow decisions are unchanged.'
})

function exportSelectedOutput() {
  if (!config) return
  if (!guidanceReady('selected')) return
  try {
    renderOutputChoice()
    renderDownloadReview()
    if (!downloadPack) throw new Error('Resolve the generation finding before downloading.')
    const selection = chosenOutput()
    const draft = !downloadPack.validation.configurationComplete || !downloadPack.validation.formatChecked
    download(`${filename()}-${selection.kind}${draft ? '-draft' : ''}.zip`, zipFiles(downloadPack.files), 'application/zip')
    markDownloaded()
    $('#download-result').textContent = `${outputTitle(selection.kind)} downloaded. Open INSTALL.md first. Reopen this ZIP here to continue.`
    $('#use-download').open = true
    $('#use-download-title').focus()
  } catch (error) { $('#download-result').textContent = `Download failed. ${error.message} Your work remains in this session.` }
}

function renderNav() {
  $('#details-nav').hidden = Boolean(selectedStage) || !detailSections.includes(currentStep)
  $('#details-nav').innerHTML = steps.filter(step => detailSections.includes(step.id)).map(step => `<button type="button" data-goto="${step.id}" ${currentStep === step.id ? 'aria-current="page"' : ''}>${step.label}</button>`).join('')
}

function renderStep(focus = false) {
  if (!config) return
  const open = new Set([...$('#step-content').querySelectorAll('details[open][data-detail]')].map(item => item.dataset.detail))
  const stage = selectedStage && getStages(config).find(item => item.id === selectedStage)
  $('#inspector-kicker').textContent = stage ? 'STAGE DECISIONS' : 'YOUR PROJECT'
  $('#inspector-title').textContent = stage ? labelOf(stage) : detailSections.includes(currentStep) ? 'Project details' : steps.find(item => item.id === currentStep)?.label || 'Workflow'
  const stageEvidence = stage ? config.evidence.map((record, index) => ({record,index})).filter(({record}) => record.stageId === stage.id) : []
  const renderer = ({ intent: renderIntent, project: renderProject, boundaries: renderBoundaries, runtime: renderRuntime, artifacts: renderArtifacts, evidence: renderEvidence, review: renderReview })[currentStep] || renderIntent
  $('#step-content').innerHTML = stage ? stageCard(stage, getStages(config).indexOf(stage)) + `<div class="section-subhead"><h3>Evidence for this stage</h3></div>${stageEvidence.map(({record,index}) => evidenceRecord(record,index)).join('')}${!stageEvidence.length ? '<p class="hint">Record an expected result. Add observations when the check has been exercised.</p>' : ''}` : renderer()
  $('#step-content').querySelectorAll('details[data-detail]').forEach(item => { if (open.has(item.dataset.detail)) item.open = true })
  renderNav()
  renderInspectorImpact()
  renderFieldIssues()
  if (focus) $('#step-content').focus({ preventScroll: true })
}

function goTo(id, focus = true) {
  if (!config) { toast('Choose a starting workflow or open a pack first.'); return }
  if (id === 'workflow') { openStage(getStages(config)[0]?.id); return }
  if (!steps.some(step => step.id === id)) return
  rememberEditorInvoker()
  clearTimeout(compileTimer)
  updatePack(false)
  currentStep = id
  selectedStage = ''
  inspectorOpen = true
  history.replaceState(null, '', `#details-${id}`)
  renderStudio()
  renderStep(focus)
  if (focus) $('#inspector').scrollTop = 0
}

function updatePreview() {
  const file = pack.files.find(item => item.path === selectedFile) || pack.files[0]
  if (!file) { $('#preview-path').textContent = 'Resolve configuration errors'; $('#file-preview').textContent = 'Files cannot be generated from this configuration. Review the reported errors.'; $('#file-context').textContent = 'No artifact is available.'; return }
  selectedFile = file.path
  $('#preview-path').textContent = file.path
  $('#file-preview').textContent = file.content
  const metadata = file.metadata || file
  const processes = config.workflowModel.processes.filter(process => process.source === 'custom')
  const used = [...list(metadata.stages).map(id => named(CATALOG.stages, id)), ...list(metadata.roles).map(id => named(CATALOG.roles, id)), ...list(metadata.processes).map(id => processes.find(process => process.id === id)?.name || id), ...list(metadata.steps).map(reference => { const [processId, stepId] = reference.split('/'); return processes.find(process => process.id === processId)?.steps.find(step => step.id === stepId)?.name || reference })]
  $('#file-context').innerHTML = `<p>${escape(metadata.why || 'This file supports review or installation of the selected pack.')}</p>${used.length ? `<p><strong>Used by</strong> ${escape(used.join(', '))}</p>` : ''}${list(metadata.sources).length ? `<p><strong>Sources</strong> ${list(metadata.sources).map(source => escape(typeof source === 'string' ? source : source.url || source.title || source.id)).join(', ')}</p>` : ''}${list(metadata.assumptions).length ? `<p><strong>Review</strong> ${list(metadata.assumptions).map(assumption => escape(assumption)).join(' ')}</p>` : ''}`
  $('#file-tree').querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.file === selectedFile)))
}

function updatePack(refreshReview = true) {
  packagingFailure = ''
  if (!config) { pack = null; renderStudio(); return }
  const previous = new Map((pack?.files || []).map(file => [file.path, file.content]))
  let packagingError = ''
  try { pack = packageProject(config, withSessionReview(compileOutput(config, chosenOutput()))) }
  catch (error) { packagingError = error.message; packagingFailure = error.message; pack = { files: [], validation: validate(config), stats: { fileCount: 0, bytes: 0 } } }
  if (previous.size) {
    const current = new Map(pack.files.map(file => [file.path, file.content]))
    lastImpact = [...new Set([...previous.keys(), ...current.keys()])].filter(path => !['project.json','manifest.json','PROJECT-ATLAS.html'].includes(path) && previous.get(path) !== current.get(path))
  }
  const errors = pack.validation.issues.filter(issue => issue.severity === 'error').length
  const ready = pack.files.length && pack.validation.configurationComplete && pack.validation.formatChecked
  $('#file-count').textContent = `${pack.files.length} files`
  $('#file-output-description').textContent = `${outputTitle(chosenOutput().kind)}. These are the files included in your selected download.`
  $('#pack-status').innerHTML = `<div class="pack-status ${ready ? 'ready' : ''}"><i></i><span>${packagingError ? escape(packagingError) : ready ? 'Configuration complete · format checked' : `${errors} ${errors === 1 ? 'item' : 'items'} to resolve · draft pack`}</span></div>`
  let previousGroup = ''
  const rank = file => file.path.startsWith('.github/skills/') ? 1 : file.path.startsWith('.github/agents/') ? 2 : 0
  const files = [...pack.files].sort((a, b) => rank(a) - rank(b) || (a.path === 'WORKFLOW.md' ? -1 : b.path === 'WORKFLOW.md' ? 1 : a.path.localeCompare(b.path)))
  $('#file-tree').innerHTML = files.map(file => {
    const group = file.path.startsWith('.github/skills/') ? 'Portable skills' : file.path.startsWith('.github/agents/') ? 'Copilot profiles' : 'Blueprint and evidence'
    const heading = group !== previousGroup ? `<div class="file-group">${group}</div>` : ''
    previousGroup = group
    return `${heading}<button type="button" class="file-node ${file.path.includes('/') ? 'indent' : ''}" data-file="${escape(file.path)}" title="${escape(file.path)}" aria-pressed="false"><span aria-hidden="true">◇</span>${escape(file.path.replace(/^\.github\/(skills|agents)\//, ''))}</button>`
  }).join('')
  filterArtifacts()
  updatePreview()
  $('#pack-size').textContent = `${formatBytes(pack.stats.bytes)} of text · no model calls`
  $('#export-pack').textContent = `Download ${outputTitle(chosenOutput().kind).toLowerCase()}`
  $('#export-pack').disabled = !pack.files.length
  $('#download-atlas').disabled = !pack.files.length
  $('#copy-file').disabled = !pack.files.length
  renderNav()
  renderStudio()
  renderFieldIssues()
  if (inspectorOpen && currentStep === 'review' && refreshReview) renderStep()
}

function renderFieldIssues() {
  if (!pack) return
  const controls = [...document.querySelectorAll('[data-field]')]
  for (const control of controls) {
    control.removeAttribute('aria-invalid')
    const descriptions = (control.getAttribute('aria-describedby') || '').split(/\s+/).filter(id => id && !id.endsWith('-error'))
    if (descriptions.length) control.setAttribute('aria-describedby', descriptions.join(' '))
    else control.removeAttribute('aria-describedby')
  }
  document.querySelectorAll('[data-field-error]').forEach(item => item.remove())
  const grouped = new Map()
  for (const issue of pack.validation.issues.filter(item => item.severity === 'error')) {
    const path = issue.path.replace(/\[(\d+)\]/g, '.$1')
    const control = controls.find(item => item.dataset.field === path) || controls.find(item => item.dataset.field.startsWith(`${path}.`))
    if (!control) continue
    if (!grouped.has(control)) grouped.set(control, [])
    grouped.get(control).push(issue.message)
  }
  for (const [control, messages] of grouped) {
    const id = `${control.id}-error`
    const note = document.createElement('span')
    note.id = id
    note.className = 'field-error'
    note.dataset.fieldError = ''
    note.textContent = messages.join(' ')
    control.insertAdjacentElement('afterend', note)
    control.setAttribute('aria-invalid', 'true')
    control.setAttribute('aria-describedby', [control.getAttribute('aria-describedby'),id].filter(Boolean).join(' '))
  }
}

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}

function filename() {
  return (config.project.name || 'workflow').normalize('NFKD').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 80) || 'workflow'
}

function exportConfig() {
  if (!config) return
  try {
    const content = serializeProject(config)
    download(`${filename()}.project.json`, content, 'application/json')
    markDownloaded(false)
    toast(reviewReason || baselineNeedsDownload || guidanceChoiceNeedsDownload ? 'Project settings downloaded. Use ZIP or readable Atlas to keep the comparison and reason.' : 'Project downloaded. Open this JSON to continue later.')
  } catch (error) { toast(`Project download failed. ${error.message} Your changes remain in this session.`) }
}

function exportStandaloneSkill(skillId) {
  if (!config || !guidanceReady(`skill:${skillId}`)) return
  try {
    const standalone = compileStandaloneSkill(config, skillId)
    download(`${filename()}-${skillId}-skill.zip`, zipFiles(standalone.files), 'application/zip')
    toast('Standalone skill exported with its required resources. Use a project ZIP or readable Atlas to keep the editable decisions and review.')
  } catch (error) { toast(`Skill export failed. ${error.message}`) }
}

function exportPack() {
  if (!config) return
  if (!guidanceReady('pack')) return
  clearTimeout(compileTimer)
  updatePack()
  if (!pack.files.length) { goTo('review'); toast('Resolve structural configuration errors before exporting files.'); return }
  try {
    const draft = !pack.validation.configurationComplete || !pack.validation.formatChecked
    download(`${filename()}${draft ? '-draft' : ''}.zip`, zipFiles(pack.files), 'application/zip')
    markDownloaded()
    toast('Project pack downloaded with its offline Atlas. Open the ZIP here to continue.')
  } catch (error) { toast(`Export failed. ${error.message}`) }
}

function confirmReplace(description, wording = {}) {
  const dialog = $('#confirm-dialog')
  $('#confirm-title').textContent = wording.title || 'Replace this session?'
  $('#confirm-dialog [value="cancel"]').textContent = wording.keep || 'Keep this session'
  $('#confirm-dialog [value="replace"]').textContent = wording.replace || 'Replace project'
  $('#confirm-description').textContent = description
  $('#download-before-replace').hidden = !config
  $('#download-before-replace').textContent = hasUnkeptFileReview() ? 'Download reviewed files' : 'Download current project'
  dialog.returnValue = 'cancel'
  dialog.showModal()
  return new Promise(resolve => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'replace'), { once: true }))
}

async function replaceConfig(next, message, origin = 'example', { consumeAssistance = false, applyGuard = () => true } = {}) {
  if (processDesigner.isPending()) { toast('Apply or discard your process edits before opening another project.'); return false }
  if (sessionDirty({ includeAssistance: !consumeAssistance }) && !await confirmReplace(hasUnrecordedReviewEdits() ? 'You have wording that is not recorded. Choose Use this answer to include it in your files, or replace this session.' : hasUnkeptFileReview() ? 'Your file review choices have not been downloaded. Download the reviewed files to keep them. Any separate project edits also need their own project download before replacing this session.' : config ? 'There are decisions or review notes you have not downloaded. Download your current project to keep them, or replace this session.' : 'Your description has not been downloaded. Keep this session to use it, or replace it with the selected pack.')) return false
  if (!applyGuard()) { toast('The description changed. Review the current draft before creating it.'); return false }
  if (processDesigner.isOpen()) processDesigner.reset()
  clearTimeout(compileTimer)
  if (!consumeAssistance) { assistance.reset(); jevView?.clearReviewWording() }
  deferredAssistantQuestions = {}
  assistantAnswerReviews = {}
  assistantReviewWording.clear()
  config = next
  candidateImport = null
  outputSelection = null
  downloadPack = null
  pendingPractice = null
  clearFileComparison()
  baselineFiles = []; existingFiles = []; importedFiles = []; generationAtOpen = null
  decisionBaseline = config ? JSON.parse(JSON.stringify(config)) : null
  decisionBaselineLabel = origin === 'imported' ? 'Since opening this pack' : 'Since starting this session'
  reviewReason = ''; lastDownloadedReviewReason = ''; baselineNeedsDownload = false
  guidanceAdoption = null; pendingGuidance = null; guidanceChoiceNeedsDownload = false
  projectOrigin = origin
  historyEntries = config ? [JSON.stringify(config)] : []; historyIndex = 0
  lastDownloaded = config && origin !== 'assisted' ? JSON.stringify(config) : null; lastHistoryKey = ''
  selectedStage = ''; inspectorOpen = false; paletteSelection = null
  $('#palette-hint').hidden = true
  $('#import-notice').hidden = true
  pack = null
  lastImpact = []
  updatePack(false)
  if (config) showView('workflow')
  else { history.replaceState(null, '', '#start'); renderStudio(); $('#start-screen').focus() }
  if (message) toast(message)
  return true
}

function focusField(path) {
  const reviewId = path.startsWith('workflow.answers.') ? path.slice('workflow.answers.'.length) : ''
  if (reviewId && assistantAnswerReview(reviewId)) {
    document.getElementById(`assistant-answer-${reviewId}`)?.focus()
    return
  }
  const controls = [...document.querySelectorAll('[data-field]')]
  let control = controls.find(item => item.dataset.field === path) || controls.find(item => item.dataset.field.startsWith(`${path}.`))
  if (!control && path.startsWith('agents.')) {
    const agent = config.agents[Number(path.split('.')[1])]
    if (agent) control = [...document.querySelectorAll('[data-role]')].find(item => item.dataset.role === agent.role)
  }
  if (!control && path.startsWith('workflow.enabledStages')) control = document.querySelector('[data-stage]')
  if (!control) return
  let parent = control.parentElement
  while (parent) { if (parent.tagName === 'DETAILS') parent.open = true; parent = parent.parentElement }
  control.focus()
}

function addEvidence(stageId = '') {
  if (config.evidence.length >= 100) { toast('This draft supports up to 100 check records.'); return }
  config.evidence.push({ id: uid('check'), stageId, check: '', expected: '', observed: '', status: 'planned', method: 'user-recorded', source: '', reviewer: '' })
  changed()
  if (stageId) openStage(stageId)
  else goTo('evidence', false)
  focusField(`evidence.${config.evidence.length - 1}.check`)
}

function removeRecord(collection, index) {
  if (collection === 'evidence') {
    const id = config.evidence[index]?.id
    if (config.workflowModel.evidenceLinks.some(link => link.evidenceId === id) || config.runtime.controls.some(control => control.evidenceId === id)) {
      toast('This evidence is linked to a process or runtime control. Keep the record, or review and change its associations before removing it.')
      return
    }
  }
  config[collection].splice(index, 1)
  changed()
  renderStep()
  const prefix = collection === 'facts' ? 'fact' : 'evidence'
  const candidates = [...config[collection].slice(index), ...config[collection].slice(0, index).reverse()]
  const nextSummary = candidates.map(record => $('#step-content').querySelector(`[data-detail="${prefix}-${CSS.escape(record.id)}"] > summary`)).find(Boolean)
  if (nextSummary) nextSummary.focus()
  else $('#step-content').querySelector(`[data-action="${collection === 'facts' ? 'add-fact' : selectedStage ? 'add-stage-evidence' : 'add-evidence'}"]`)?.focus()
}

document.addEventListener('input', event => {
  const wording = event.target.closest('[data-assistant-answer-wording]')
  if (wording && assistantAnswerReview(wording.dataset.assistantAnswerWording)) {
    assistantReviewWording.set(wording.dataset.assistantAnswerWording, wording.value)
    renderSession()
    return
  }
  const control = event.target.closest('[data-field]')
  if (!control || !config) return
  const keys = control.dataset.field.split('.')
  const property = keys.pop()
  let target = config
  for (const key of keys) target = target[key]
  target[property] = control.type === 'checkbox' ? control.checked : control.value
  if (control.dataset.field.endsWith('.actorType') && target.actorType === 'agent' && !config.agents.some(agent => agent.role === target.actorId)) target.actorId = config.agents[0]?.role || ''
  if (control.dataset.field === 'project.host' && $('#host-note')) $('#host-note').textContent = hostNote()
  if (control.dataset.field === 'runtime.enabled' && control.checked && !config.runtime.controls.length) config.runtime.controls = CATALOG.runtimeControls.map(item => ({ ...item, status: 'requirement', implementation: '', evidenceId: '' }))
  if (/^(facts|evidence)\.\d+\.(claim|check|status)$/.test(control.dataset.field)) {
    const [collection, index, key] = control.dataset.field.split('.')
    const record = config[collection][index]
    const summary = control.closest('.record-card')?.querySelector('summary')
    if (summary && key === 'status') summary.querySelector('.record-state').textContent = record.status.replaceAll('-', ' ')
    else if (summary) summary.querySelector('span:first-child').textContent = record[key] || (collection === 'facts' ? 'New project fact' : 'New acceptance check')
  }
  changed(control.dataset.field)
})

document.addEventListener('change', event => {
  const control = event.target
  if (!config) return
  if (control.hasAttribute('data-pe-active')) { processDesigner.choose(control.value); renderStudio(); $('[data-pe-active]')?.focus(); return }
  if (control.hasAttribute('data-import-fact') || control.hasAttribute('data-import-component')) {
    if (!candidateImport) return
    const fact = control.hasAttribute('data-import-fact')
    const selected = fact ? candidateImport.selectedFacts : candidateImport.selectedComponents
    const index = Number(fact ? control.dataset.importFact : control.dataset.importComponent)
    if (control.checked) selected.add(index)
    else selected.delete(index)
    return
  }
  if (control.hasAttribute('data-recipe-select')) {
    if (!control.value) return
    try { config = selectRecipe(config, control.value) }
    catch (error) { control.value = config.workflow.recipe; toast(error.message); return }
    changed(); clearTimeout(compileTimer); updatePack(false); renderStep(); $('[data-recipe-select]').focus()
    toast('Workflow changed. Existing settings and records are retained for review.')
    return
  }
  if (control.hasAttribute('data-tech-select')) { $(`[data-tech-custom-wrap="${control.dataset.techSelect}"]`).hidden = control.value !== '__custom'; return }
  if (control.hasAttribute('data-field')) {
    const path = control.dataset.field
    if (path.endsWith('.actorType')) {
      renderStep(); focusField(path)
    } else if (path === 'runtime.enabled') { renderStep(); focusField(path) }
    else if (/^evidence\.\d+\.stageId$/.test(path)) {
      const index = Number(path.split('.')[1])
      const stageId = config.evidence[index].stageId
      if (selectedStage && getStages(config).some(stage => stage.id === stageId)) openStage(stageId)
      else if (selectedStage) goTo('evidence')
      else renderStep()
      focusField(`evidence.${index}.check`)
    }
    return
  }
  if (control.hasAttribute('data-stage')) {
    config.workflow.enabledStages = getStages(config).filter(stage => stage.id === control.dataset.stage ? control.checked : config.workflow.enabledStages.includes(stage.id)).map(stage => stage.id)
    renderStep(); $(`[data-stage="${control.dataset.stage}"]`).focus()
  } else if (control.hasAttribute('data-binding-skill')) {
    const binding = config.workflow.bindings[control.dataset.stageId]
    binding.skills = CATALOG.skills.filter(skill => skill.id === control.dataset.bindingSkill ? control.checked : binding.skills.includes(skill.id)).map(skill => skill.id)
  } else if (control.hasAttribute('data-skill')) {
    config.skills = CATALOG.skills.filter(skill => skill.id === control.dataset.skill ? control.checked : config.skills.includes(skill.id)).map(skill => skill.id)
    renderStep(); $(`[data-skill="${control.dataset.skill}"]`).focus()
  } else if (control.hasAttribute('data-role')) {
    if (control.checked) { const role = CATALOG.roles.find(item => item.id === control.dataset.role); config.agents.push({ role: role.id, tools: [...role.defaultTools] }) }
    else config.agents = config.agents.filter(agent => agent.role !== control.dataset.role)
    renderStep(); $(`[data-role="${control.dataset.role}"]`).focus()
  } else if (control.hasAttribute('data-tool')) {
    const agent = config.agents.find(item => item.role === control.dataset.roleId)
    agent.tools = TOOL_ALIASES.filter(tool => tool === control.dataset.tool ? control.checked : agent.tools.includes(tool))
  } else if (control.hasAttribute('data-practice')) {
    config.practices = CATALOG.practices.filter(practice => practice.id === control.dataset.practice ? control.checked : config.practices.includes(practice.id)).map(practice => practice.id)
  } else if (control.hasAttribute('data-resolution')) { choices[control.dataset.resolution] = control.value; renderSession(); return }
  else return
  changed()
})

document.addEventListener('click', async event => {
  const processOpen = event.target.closest('[data-pe-open]')
  if (processOpen && config) { processDesigner.open(processOpen.dataset.peOpen, processOpen.dataset.peStep || ''); return }
  if (event.target.closest('[data-pe-new]') && config) { processDesigner.open(); return }
  if (event.target.closest('[data-start-process]')) {
    const next = createRecipe('feasibility')
    next.workflowModel.processes = []
    next.agents = []
    next.skills = []
    next.practices = []
    next.components = []
    if (await replaceConfig(next, '', 'blank')) processDesigner.open()
    return
  }
  const evidenceEdit = event.target.closest('[data-edit-evidence]')
  if (evidenceEdit && config) {
    const index = Number(evidenceEdit.dataset.editEvidence)
    openStage(config.evidence[index].stageId)
    focusField(`evidence.${index}.check`)
    return
  }
  const go = event.target.closest('[data-goto]')
  if (go) {
    go.closest('dialog')?.close()
    const path = go.dataset.issuePath?.replace(/\[(\d+)\]/g, '.$1')
    const processPath = path?.match(/^workflowModel\.processes\.(\d+)(?:\.(steps|results|checks|transitions|corrections|approvals|terminals)\.(\d+))?/)
    if (processPath) {
      const process = config.workflowModel.processes[Number(processPath[1])]
      if (process?.source === 'custom') {
        const collection = processPath[2] || 'steps'
        const recordId = process[collection][Number(processPath[3] || 0)]?.id || ''
        processDesigner.open(process.id, collection === 'steps' ? recordId : '', { collection, recordId })
        return
      }
    }
    const evidenceIndex = path?.match(/^evidence\.(\d+)/)?.[1]
    const prerequisite = path?.match(/^workflow\.suppliedInputs\.([^.]+)/)?.[1]
    const dependent = prerequisite && getStages(config).find(stage => config.workflow.enabledStages.includes(stage.id) && stage.dependsOn.includes(prerequisite))
    const stageId = path?.match(/^workflow\.(?:bindings|notes)\.([^.]+)/)?.[1] || dependent?.id || (evidenceIndex !== undefined ? config.evidence[Number(evidenceIndex)]?.stageId : '')
    if (stageId && getStages(config).some(stage => stage.id === stageId)) openStage(stageId)
    else goTo(go.dataset.goto)
    if (path) focusField(path)
    return
  }
  const file = event.target.closest('[data-file]')
  if (file) { selectedFile = file.dataset.file; updatePreview(); return }
  const button = event.target.closest('[data-action]')
  if (!button) return
  const index = Number(button.dataset.index)
  switch (button.dataset.action) {
    case 'add-component':
      if (config.components.length >= 30) { toast('This version supports up to 30 components.'); return }
      config.components.push({ id: uid('component'), name: '', path: '', technologies: [], commands: { test: '', lint: '', build: '' } })
      changed(); renderStep(); focusField(`components.${config.components.length - 1}.name`)
      break
    case 'remove-component': config.components.splice(index, 1); changed(); renderStep(); $('.add-component').focus(); break
    case 'add-tech': {
      if (config.components[index].technologies.length >= 40) { toast('This version supports up to 40 technologies per component.'); return }
      const select = $(`[data-tech-select="${index}"]`)
      const id = select.value === '__custom' ? $(`[data-tech-custom="${index}"]`).value.trim() : select.value
      if (!id) { toast('Choose a technology or enter its name.'); select.focus(); return }
      if (config.components[index].technologies.some(tech => tech.id.toLowerCase() === id.toLowerCase())) { toast('This technology is already included. Remove it to change its version.'); return }
      config.components[index].technologies.push({ id, version: $(`[data-tech-version="${index}"]`).value.trim() })
      changed(); renderStep(); $(`[data-tech-select="${index}"]`).focus()
      break
    }
    case 'remove-tech': config.components[index].technologies.splice(Number(button.dataset.techIndex), 1); changed(); renderStep(); $(`[data-tech-select="${index}"]`).focus(); break
    case 'add-fact':
      if (config.facts.length >= 100) { toast('This draft supports up to 100 fact records.'); return }
      config.facts.push({ id: uid('fact'), claim: '', status: 'unresolved', source: '', revision: '', reviewer: '', notes: '' })
      changed(); renderStep(); focusField(`facts.${config.facts.length - 1}.claim`)
      break
    case 'remove-fact': removeRecord('facts', index); break
    case 'add-evidence': addEvidence(); break
    case 'add-stage-evidence': addEvidence(button.dataset.stageId); break
    case 'remove-evidence': removeRecord('evidence', index); break
    case 'export-skill':
      exportStandaloneSkill(button.dataset.skillId)
      break
    case 'export-config': exportConfig(); break
    case 'import-config': $('#open-dialog').showModal(); break
    case 'import-facts': $('#facts-file').click(); break
    case 'dismiss-import': candidateImport = null; renderStep(); break
    case 'accept-import': {
      const selectedFacts = candidateImport.facts.filter((item, index) => candidateImport.selectedFacts.has(index) && !config.facts.some(existing => existing.claim === item.claim && existing.source === item.source))
      const selectedComponents = candidateImport.components.filter((item, index) => candidateImport.selectedComponents.has(index))
      if (config.facts.length + selectedFacts.length > 100 || config.components.length + selectedComponents.length > 30) { toast('Selection exceeds the draft limit. Select fewer candidates.'); return }
      selectedFacts.forEach(item => config.facts.push({ ...item, id: uid('fact') }))
      selectedComponents.forEach(item => config.components.push({ ...item, id: uid('component') }))
      candidateImport = null
      changed(); renderStep(); toast('Selected candidates added. Equivalent existing facts were skipped. Review paths and commands.'); break
    }
    case 'save-snapshot':
      try {
        updatePack(false)
        const content = JSON.stringify({files:reviewableFiles(pack.files).map(({path,content}) => ({path,content}))}, null, 2)
        const nextBaseline = parseFileBundle(content)
        if (!await canReplaceFileComparison()) break
        download(`${filename()}.generated-snapshot.json`, content, 'application/json')
        baselineFiles = nextBaseline
        clearFileComparison(); renderStep(); renderSession()
      } catch (error) { toast(`Snapshot download failed. ${error.message}`) }
      break
    case 'load-baseline': $('#baseline-files').click(); break
    case 'load-existing': $('#existing-files').click(); break
    case 'load-baseline-json': $('#baseline-json').click(); break
    case 'load-existing-json': $('#existing-json').click(); break
    case 'compare-pack':
      try {
        updatePack(false)
        const next = compareFiles(reviewableFiles(baselineFiles), reviewableFiles(existingFiles), reviewableFiles(pack.files).map(({ path, content }) => ({ path, content })))
        if (!await canReplaceFileComparison()) break
        clearFileComparison()
        comparison = next
        comparisonGeneration = comparisonGenerationKey()
        renderStep(); renderSession()
      }
      catch (error) { toast(`Comparison failed. ${error.message}`) }
      break
    case 'export-reconciled': exportReviewedFiles(); break
  }
})

function exportReviewedFiles() {
  try {
    const files = resolveComparison(comparison, choices)
    const stale = comparisonIsStale()
    const record = { description: 'Reviewed file set from the retained comparison snapshot. Later project changes are not included. Edited files were not revalidated. The inventory and readable Atlas were rebuilt from the retained project and file contents.', files: files.map(item => item.path), decisions: comparison.map(row => ({ path: row.path, status: row.status, choice: resolvedChoice(row) })) }
    const reviewed = packageReviewedFiles(files, record)
    download(`${filename()}-reviewed-files.zip`, zipFiles(reviewed.files), 'application/zip')
    downloadedComparison = comparison
    downloadedComparisonChoices = currentComparisonChoices()
    renderSession()
    if ($('#confirm-dialog').open) $('#download-before-replace').textContent = 'Download current project'
    toast((reviewed.config ? 'Reviewed files downloaded. The Atlas reflects the retained project and these exact file contents. Edited file behavior remains unverified.' : 'Reviewed files downloaded without a Project Atlas because project.json was removed.') + (stale ? ' These are the earlier comparison files. Keep later project edits in a separate download.' : ''))
  } catch (error) { toast(`Resolve comparison findings first. ${error.message}`) }
}

async function openProjectFiles(event) {
  if (!event.target.files.length) return
  try {
    const result = await readProjectFiles([...event.target.files])
    $('#open-dialog').close()
    if (!await replaceConfig(result.config, 'Project opened in this session. Your decisions and Atlas are ready.', 'imported')) return
    importedFiles = result.files || []
    outputSelection = getOpenedOutputSelection(config, importedFiles)
    existingFiles = importedFiles.filter(file => file.path !== 'PROJECT-ATLAS.html')
    const reviewFiles = importedFiles.filter(file => file.path.toLowerCase() === 'decision-review.json')
    const reviewWarnings = []
    if (reviewFiles.length === 1) {
      try {
        const restored = restoreDecisionReview(reviewFiles[0].content, {current:config})
        decisionBaseline = restored.review.baseline
        decisionBaselineLabel = 'Compared with the baseline kept in this pack'
        reviewReason = restored.review.reason
        lastDownloadedReviewReason = reviewReason
        reviewWarnings.push(...restored.warnings)
      } catch (error) { reviewWarnings.push(`The supplied change review was kept as a file but was not applied. ${error.message}`) }
    }
    generationAtOpen = withSessionReview(compileOpenedOutput(config, importedFiles)).files.map(({path,content}) => ({path,content}))
    updatePack(false)
    renderSession()
    const differences = openedFileDifferences()
    const messages = [...reviewWarnings,...(result.warnings || [])]
    const guidance = reviewGuidance(config, importedFiles)
    if (guidance.changes.length) messages.unshift(`${guidance.changes.length} guidance ${guidance.changes.length === 1 ? 'record differs' : 'records differ'} from current definitions. Use Review changes to inspect their versions and scope.`)
    if (differences.length) messages.unshift(`${differences.length} supplied ${differences.length === 1 ? 'file differs' : 'files differ'} from this generator. This may reflect file edits or another generator version. Your original files are kept for review.`)
    if (messages.length) {
      $('#import-notice').hidden = false
      const reviewNeeded = differences.length || messages.length > 1
      $('#import-notice').classList.toggle('import-info', !reviewNeeded)
      $('#import-notice').innerHTML = `<details ${reviewNeeded ? 'open' : ''}><summary>${reviewNeeded ? 'Review the opened files' : 'Project restored. Import details'}</summary><p>${messages.map(escape).join(' ')}</p><div>${importedFiles.length ? '<button type="button" data-studio-action="download-opened-files">Download opened files</button>' : ''}<button type="button" data-goto="review">Review files</button></div></details><button type="button" data-studio-action="dismiss-import-notice" aria-label="Dismiss import notice">×</button>`
    }
  } catch (error) { toast(`Could not open this project. ${error.message} Your current project is unchanged.`) }
  finally { event.target.value = '' }
}
$('#import-file').addEventListener('change', openProjectFiles)
$('#project-folder').addEventListener('change', openProjectFiles)

$('#facts-file').addEventListener('change', async event => {
  try {
    const files = [...event.target.files]
    if (files.length > 40) throw new Error('Choose no more than 40 files.')
    const candidates = { facts: [], components: [], warnings: [] }
    for (const file of files) {
      if (file.size > 2 * 1024 * 1024) throw new Error(`${file.name} exceeds 2 MB.`)
      const result = extractProjectFacts(file.webkitRelativePath || file.name, await file.text())
      candidates.facts.push(...result.facts); candidates.components.push(...result.components); candidates.warnings.push(...result.warnings)
    }
    candidateImport = { ...candidates, selectedFacts: new Set(candidates.facts.map((item, index) => index)), selectedComponents: new Set() }
    goTo('project', false)
    toast('Candidates loaded for review. Your draft has not changed.')
  } catch (error) { toast(`Fact import rejected. ${error.message} Your draft is unchanged.`) }
  finally { event.target.value = '' }
})

async function readFolder(event, kind) {
  try {
    const files = [...event.target.files]
    if (files.length > 4096) throw new Error('Choose a pack folder with no more than 4096 files.')
    const entries = []
    for (const file of files) {
      const path = file.webkitRelativePath ? file.webkitRelativePath.split('/').slice(1).join('/') : file.name
      if (['PROJECT-ATLAS.html','manifest.json'].includes(path)) continue
      if (file.size > 8 * 1024 * 1024) throw new Error(`${file.name} exceeds 8 MB.`)
      let content
      try { content = new TextDecoder('utf-8', { fatal: true }).decode(await file.arrayBuffer()) }
      catch { throw new Error(`${file.name} is not a UTF8 text file.`) }
      if (content.includes('\0')) throw new Error(`${file.name} contains binary data. Choose text artifacts only.`)
      entries.push({ path, content })
    }
    const safe = parseFileBundle(JSON.stringify({ files: entries }))
    if (!await canReplaceFileComparison()) return
    if (kind === 'baseline') baselineFiles = safe
    else existingFiles = safe
    clearFileComparison()
    goTo('review', false)
    renderSession()
    toast(`${kind === 'baseline' ? 'Baseline' : 'Edited pack'} loaded for comparison. No files were written.`)
  } catch (error) { toast(`Folder rejected. ${error.message}`) }
  finally { event.target.value = '' }
}

$('#baseline-files').addEventListener('change', event => readFolder(event, 'baseline'))
$('#existing-files').addEventListener('change', event => readFolder(event, 'existing'))
async function readSnapshot(event, kind) {
  try {
    const file = event.target.files[0]
    if (!file) return
    if (file.size > 64 * 1024 * 1024) throw new Error('File bundle JSON exceeds 64 MB.')
    const files = parseFileBundle(await file.text())
    if (!await canReplaceFileComparison()) return
    if (kind === 'baseline') baselineFiles = files
    else existingFiles = files
    clearFileComparison()
    goTo('review', false)
    renderSession()
    toast(`${kind === 'baseline' ? 'Baseline' : 'Edited files'} loaded. Your draft is unchanged.`)
  } catch (error) { toast(`Snapshot rejected. ${error.message}`) }
  finally { event.target.value = '' }
}
$('#baseline-json').addEventListener('change', event => readSnapshot(event, 'baseline'))
$('#existing-json').addEventListener('change', event => readSnapshot(event, 'existing'))
$('#export-config').addEventListener('click', exportConfig)
$('#import-config').addEventListener('click', () => $('#open-dialog').showModal())
$('#export-pack').addEventListener('click', openDownload)
$('#new-project').addEventListener('click', () => replaceConfig(null, '', 'blank'))
$('#copy-file').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText($('#file-preview').textContent); toast('File contents copied.') }
  catch { toast('Clipboard unavailable. Select and copy the preview text.') }
})
function markDownloaded(reviewIncluded = true) {
  lastDownloaded = JSON.stringify(config)
  if (reviewIncluded) { lastDownloadedReviewReason = reviewReason; baselineNeedsDownload = false; guidanceChoiceNeedsDownload = false }
  lastHistoryKey = ''
  lastHistoryAt = 0
  projectOrigin = projectOrigin === 'example' ? 'example' : 'project'
  renderSession()
}

function downloadAtlas() {
  if (!config) return
  if (!guidanceReady('atlas')) return
  try {
    const output = buildProjectAtlas(config, withSessionReview(compileOutput(config, chosenOutput())))
    download(`${filename()}.atlas.html`, output, 'text/html')
    markDownloaded()
    toast('Your readable Atlas was downloaded. It also contains the project needed to reopen it.')
  } catch (error) { toast(`Atlas download failed. ${error.message}`) }
}

function openKnowledge(topic = 'overview', view = 'read', push = true) {
  document.querySelectorAll('dialog[open]').forEach(dialog => dialog.close())
  if (!knowledgeOpen) {
    knowledgeReturnFocus = document.activeElement
    knowledgeReturnSelector = knowledgeReturnFocus.id ? `#${CSS.escape(knowledgeReturnFocus.id)}` : null
    knowledgeScroll = window.scrollY
    knowledgeReturnHash = config ? (location.hash === '#knowledge' ? history.state?.returnHash || '#workflow' : location.hash) : '#start'
  }
  knowledgeOpen = true
  $('#knowledge-workspace').hidden = false
  $('.skip').hidden = true
  $('.studio-header').hidden = true
  $('#studio-layout').hidden = true
  $('#start-screen').hidden = true
  const knowledgeView = view === 'explore' ? 'explore' : 'read'
  // Replace the embedded document so its blank placeholder does not become a Back destination.
  $('#knowledge-frame').contentWindow.location.replace(new URL(`../atlas/?embedded=1&view=${knowledgeView}&theme=${theme}#${encodeURIComponent(topic)}`, location.href).href)
  if (push) history.pushState({atlasKnowledge:true,topic,view:knowledgeView,returnHash:knowledgeReturnHash}, '', '#knowledge')
  syncEditorAccess()
  $('#knowledge-frame').focus()
}

function closeKnowledge(updateHistory = true) {
  if (!knowledgeOpen) return
  knowledgeOpen = false
  $('#knowledge-workspace').hidden = true
  $('.studio-header').hidden = false
  $('#knowledge-frame').contentWindow.location.replace('about:blank')
  $('#start-screen').hidden = Boolean(config)
  $('#studio-layout').hidden = !config
  syncEditorAccess()
  if (updateHistory) history.replaceState(null, '', knowledgeReturnHash)
  window.scrollTo({top:knowledgeScroll,behavior:'instant'})
  if (knowledgeReturnFocus?.isConnected && !knowledgeReturnFocus.closest('[hidden],[inert]')) knowledgeReturnFocus.focus({preventScroll:true})
  else if (knowledgeReturnSelector && $(knowledgeReturnSelector)?.getClientRects().length) $(knowledgeReturnSelector).focus({preventScroll:true})
  else if (inspectorOpen && compactEditor.matches) $('#close-inspector').focus()
  else $('#open-knowledge-map').focus({preventScroll:true})
}

function sendPracticeContext() {
  if (!knowledgeOpen) return
  const actions = config ? PRACTICE_TOPIC_IDS.map(topicId => getPracticeAction(topicId, config)).filter(Boolean).map(action => ({topicId:action.topicId,id:action.id,title:action.title,alreadyApplied:action.alreadyApplied,reason:action.reason})) : []
  $('#knowledge-frame').contentWindow?.postMessage({type:'workflow-atlas:practice-context',actions,projectName:config?.project.name || 'Untitled workflow'}, location.origin)
}

function previewPractice(actionId, topicId) {
  if (!config) return
  const action = getPracticeAction(topicId, config)
  if (!action || action.id !== actionId || action.alreadyApplied) return
  try {
    const next = applyPracticeAction(config, actionId)
    const selection = chosenOutput()
    const missingProcedure = selection.kind === 'skill' && !getEffectiveSkills(config).some(skill => skill.id === selection.skillId)
    let filePreview = '<p class="hint practice-output-note">File preview is unavailable because the selected procedure is no longer assigned. You can apply this practice to the workflow. Choose an available output before downloading.</p>'
    if (!missingProcedure) {
      const beforeFiles = new Map(compileOutput(config, selection).files.map(file => [file.path,file.content]))
      const afterFiles = new Map(compileOutput(next, selection).files.map(file => [file.path,file.content]))
      const changes = [...new Set([...beforeFiles.keys(),...afterFiles.keys()])].filter(path => beforeFiles.get(path) !== afterFiles.get(path)).map(path => ({path,kind:!beforeFiles.has(path) ? 'Added' : !afterFiles.has(path) ? 'Removed' : 'Updated'}))
      filePreview = `<details class="download-inventory"><summary>Affected generated files (${changes.length})</summary><ul>${changes.map(change => `<li><code>${escape(change.path)}</code><span>${change.kind}</span></li>`).join('')}</ul></details>`
    }
    pendingPractice = {actionId,topicId,projectState:JSON.stringify(config)}
    $('#practice-preview').innerHTML = `<p class="eyebrow">FOR ${escape(config.project.name || 'YOUR WORKFLOW')}</p><h3>${escape(action.title)}</h3><p>${escape(action.reason)}</p><ul class="practice-changes">${action.changes.map(change => `<li>${escape(change)}</li>`).join('')}</ul><p class="hint">This records intended guidance. It does not run tools, grant permissions or verify a result.</p>${filePreview}<p><a href="${escape(action.source)}" target="_blank" rel="noopener noreferrer">Read the source behind this practice ↗</a></p>`
    $('#practice-dialog').showModal()
    $('#practice-title').focus()
  } catch (error) { toast(`Practice review could not be prepared. ${error.message} Your workflow is unchanged.`) }
}

$('#apply-practice').addEventListener('click', () => {
  if (!pendingPractice || !config) return
  if (pendingPractice.projectState !== JSON.stringify(config)) {
    $('#practice-dialog').close()
    toast('Your decisions changed. Review the practice again before applying it.')
    return
  }
  const action = pendingPractice
  config = applyPracticeAction(config, action.actionId)
  $('#practice-dialog').close()
  closeKnowledge()
  changed()
  clearTimeout(compileTimer)
  updatePack(false)
  goTo(action.actionId.startsWith('runtime:') ? 'runtime' : 'boundaries')
  toast('Practice applied to your decisions. Review the changes, or use Undo to return.')
})
$('#practice-dialog').addEventListener('close', () => {
  if (knowledgeOpen && pendingPractice) $('#knowledge-frame').contentWindow?.postMessage({type:'workflow-atlas:practice-review-closed',actionId:pendingPractice.actionId,topicId:pendingPractice.topicId}, location.origin)
  pendingPractice = null
})

window.addEventListener('message', event => {
  if (event.origin !== location.origin || event.source !== $('#knowledge-frame').contentWindow || !knowledgeOpen) return
  if (event.data?.type === 'workflow-atlas:close-knowledge') closeKnowledge()
  if (event.data?.type === 'workflow-atlas:theme' && event.data.theme !== theme) setTheme(event.data.theme)
  if (event.data?.type === 'workflow-atlas:knowledge-ready') sendPracticeContext()
  if (event.data?.type === 'workflow-atlas:practice-request' && typeof event.data.actionId === 'string' && typeof event.data.topicId === 'string') previewPractice(event.data.actionId,event.data.topicId)
})

function setPalette(selection) {
  paletteSelection = selection
  syncPalette()
  const name = selection.kind === 'skill' ? named(CATALOG.skills, selection.id) : selection.type === 'agent' ? named(CATALOG.roles, selection.id) : selection.type === 'human' ? 'Person' : 'External system'
  $('#palette-hint').hidden = false
  $('#palette-hint').innerHTML = `<span><strong>${escape(name)}</strong> selected. Choose a workflow stage to ${selection.kind === 'skill' ? 'attach this skill' : 'assign this actor'}.</span><button type="button" data-studio-action="cancel-palette">Cancel</button>`
}

function applyPalette(id) {
  const stage = getStages(config).find(item => item.id === id)
  if (!stage || !paletteSelection) return
  const binding = config.workflow.bindings[id]
  const selection = paletteSelection
  if (selection.kind === 'skill') {
    if (!CATALOG.skills.some(item => item.id === selection.id)) return
    if (!binding.skills.includes(selection.id)) binding.skills.push(selection.id)
  } else if (['human','external','agent'].includes(selection.type)) {
    if (selection.type === 'agent') {
      const role = CATALOG.roles.find(item => item.id === selection.id)
      if (!role) return
      binding.actorId = role.id
      if (!config.agents.some(agent => agent.role === role.id)) config.agents.push({role:role.id,tools:[...role.defaultTools]})
    }
    binding.actorType = selection.type
  } else return
  paletteSelection = null
  $('#palette-hint').hidden = true
  changed()
  clearTimeout(compileTimer)
  updatePack(false)
  openStage(id)
  toast(selection.kind === 'skill' ? 'Skill attached. Related instructions have been updated.' : 'Responsibility updated. Inspect the assignment and connected artifacts.')
}

document.addEventListener('click', async event => {
  const intentQuestion = event.target.closest('[data-intent-question]')
  if (intentQuestion) { goTo('intent', false); focusField(`workflow.answers.${intentQuestion.dataset.intentQuestion}`); return }
  const answerAction = event.target.closest('[data-confirm-assistant-answer],[data-defer-assistant-answer]')
  if (answerAction) {
    const id = answerAction.dataset.confirmAssistantAnswer || answerAction.dataset.deferAssistantAnswer
    if (!assistantAnswerReview(id)) return
    const input = document.getElementById(`assistant-answer-${id}`)
    if (answerAction.hasAttribute('data-confirm-assistant-answer')) {
      if (!input.value.trim()) { input.setAttribute('aria-invalid', 'true'); toast('Enter wording to record, or leave this unanswered.'); input.focus(); return }
      config.workflow.answers[id] = input.value
      delete deferredAssistantQuestions[id]
      changed(`workflow.answers.${id}`)
    } else {
      deferredAssistantQuestions[id] = { text: '', kind: 'deferred' }
    }
    delete assistantAnswerReviews[id]
    assistantReviewWording.delete(id)
    renderStep()
    renderSession()
    const nextReview = $('#step-content [data-assistant-answer-wording]')
    ;(nextReview || $('#close-inspector')).focus()
    toast(answerAction.hasAttribute('data-confirm-assistant-answer') ? 'Answer recorded in your project and files.' : 'Left unanswered. You can add it later in Project details.')
    return
  }
  const start = event.target.closest('[data-start-recipe]')
  if (start) {
    if (!config && assistance.isDirty()) { assistance.chooseRecipe(start.dataset.startRecipe); return }
    if (await replaceConfig(createRecipe(start.dataset.startRecipe), '', 'blank')) openTaskBrief()
    return
  }
  const close = event.target.closest('[data-close-dialog]')
  if (close) { document.getElementById(close.dataset.closeDialog).close(); return }
  const view = event.target.closest('[data-project-view]')
  if (view) { event.target.closest('dialog')?.close(); showView(view.dataset.projectView); return }
  const stage = event.target.closest('[data-select-stage]')
  if (stage) { openStage(stage.dataset.selectStage); return }
  const editor = event.target.closest('[data-open-editor]')
  if (editor) { goTo(editor.dataset.openEditor); return }
  const artifact = event.target.closest('[data-select-file]')
  if (artifact) { artifact.closest('dialog')?.close(); selectedFile = artifact.dataset.selectFile; updatePreview(); showView('artifacts'); return }
  const knowledge = event.target.closest('[data-reference-topic]')
  if (knowledge) { openKnowledge(knowledge.dataset.referenceTopic); return }
  const map = event.target.closest('[data-reference-map]')
  if (map) { openKnowledge(map.dataset.referenceMap, 'explore'); return }
  const skill = event.target.closest('[data-drag-skill]')
  if (skill) { setPalette({kind:'skill',id:skill.dataset.dragSkill}); return }
  const actor = event.target.closest('[data-drag-actor]')
  if (actor) { setPalette({kind:'actor',type:actor.dataset.dragActor,id:actor.dataset.actorId || ''}); return }
  const example = event.target.closest('[data-example]')
  if (example) { $('#examples-dialog').close(); await replaceConfig(createExample(example.dataset.example), 'Example loaded. All details are fictional and ready to adapt.'); return }
  const action = event.target.closest('[data-studio-action]')?.dataset.studioAction
  if (!action) return
  switch (action) {
    case 'choose-decision-baseline': $('#decision-baseline-file').click(); break
    case 'download-decision-review':
      try { const file = exportDecisionReview(currentReview(chosenOutput())).find(item => item.path === 'DECISION-REVIEW.md'); download(`${filename()}-decision-review.md`,file.content,'text/markdown'); toast('Readable review downloaded. ZIP or readable Atlas keeps the editable comparison and reason.') }
      catch (error) { toast(`Review download failed. ${error.message}`) }
      break
    case 'review-guidance': openGuidanceReview(); break
    case 'task-brief': openTaskBrief(); break
    case 'edit-outcome': openTaskBrief(); $('#brief-purpose').focus(); break
    case 'choose-output': openDownload(); break
    case 'download-output': exportSelectedOutput(); break
    case 'open-pack': $('#open-dialog').showModal(); break
    case 'blank-project': $('#examples-dialog').close(); await replaceConfig(null, '', 'blank'); break
    case 'examples': $('#help-dialog').close(); $('#examples-dialog').showModal(); break
    case 'undo': restoreHistory(-1); break
    case 'redo': restoreHistory(1); break
    case 'choose-project-file': $('#import-file').click(); break
    case 'choose-project-folder': $('#project-folder').click(); break
    case 'download-pack': exportPack(); if (!$('#guidance-dialog').open) $('#download-dialog').close(); break
    case 'download-atlas': downloadAtlas(); if (!$('#guidance-dialog').open) $('#download-dialog').close(); break
    case 'download-json': exportConfig(); $('#download-dialog').close(); break
    case 'dismiss-impact': lastImpact = []; renderStudio(); break
    case 'dismiss-import-notice': $('#import-notice').hidden = true; break
    case 'download-opened-files': download(`${filename()}-opened-files.zip`, zipFiles(importedFiles), 'application/zip'); toast('Original files downloaded exactly as supplied.'); break
    case 'recover-draft':
      try { if (await replaceConfig(parseImport(legacyDraft), 'Older draft recovered into this session. Its stored original is unchanged.', 'imported')) $('#legacy-notice').hidden = true }
      catch (error) { toast(`Recovery failed. ${error.message} Download the original to keep it.`) }
      break
    case 'download-legacy': download('previous-atlas-draft.json', legacyDraft, 'application/json'); break
    case 'dismiss-legacy': $('#legacy-notice').hidden = true; break
    case 'cancel-palette': paletteSelection = null; $('#palette-hint').hidden = true; syncPalette(); break
  }
})

document.addEventListener('dragstart', event => {
  const source = event.target.closest('[data-drag-actor],[data-drag-skill]')
  if (!source || !event.dataTransfer) return
  const selection = source.hasAttribute('data-drag-skill') ? {kind:'skill',id:source.dataset.dragSkill} : {kind:'actor',type:source.dataset.dragActor,id:source.dataset.actorId || ''}
  event.dataTransfer.setData('application/x-workflow-atlas', JSON.stringify(selection))
  event.dataTransfer.effectAllowed = 'copy'
})
document.addEventListener('dragover', event => {
  const target = event.target.closest('[data-drop-stage]')
  if (!target || !event.dataTransfer.types.includes('application/x-workflow-atlas')) return
  event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; target.classList.add('drop-active')
})
document.addEventListener('dragleave', event => event.target.closest('[data-drop-stage]')?.classList.remove('drop-active'))
document.addEventListener('drop', event => {
  const target = event.target.closest('[data-drop-stage]')
  if (!target) return
  target.classList.remove('drop-active')
  const payload = event.dataTransfer.getData('application/x-workflow-atlas')
  if (!payload) return
  event.preventDefault()
  try { paletteSelection = JSON.parse(payload); applyPalette(target.dataset.dropStage) } catch { toast('Choose a role or skill from this project palette.') }
})
$('#close-inspector').addEventListener('click', closeInspector)
$('#theme-toggle').addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark'))
$('#open-help').addEventListener('click', () => { $('#help-dialog').showModal(); $('#help-title').focus() })
$('#undo').addEventListener('click', () => restoreHistory(-1))
$('#redo').addEventListener('click', () => restoreHistory(1))
$('#download-project').addEventListener('click', openDownload)
$('#download-atlas').addEventListener('click', downloadAtlas)
$('#download-before-replace').addEventListener('click', () => hasUnkeptFileReview() ? exportReviewedFiles() : exportPack())
function filterArtifacts() {
  const query = $('#artifact-search').value.toLowerCase()
  let count = 0
  $('#file-tree').querySelectorAll('[data-file]').forEach(button => { button.hidden = !button.dataset.file.toLowerCase().includes(query); if (!button.hidden) count += 1 })
  $('#artifact-search-status').textContent = query ? count ? `${count} matching ${count === 1 ? 'file' : 'files'}` : 'No matching files. Try another name.' : ''
}
$('#artifact-search').addEventListener('input', filterArtifacts)
document.addEventListener('keydown', event => {
  const dialog = event.target.closest('dialog[open]')
  if (event.key === 'Tab' && dialog) {
    const controls = [...dialog.querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex="0"]')].filter(item => !item.disabled && !item.closest('[hidden]') && item.getClientRects().length)
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement.matches('[tabindex="-1"]'))) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  if (event.key === 'Tab' && inspectorOpen && compactEditor.matches && !knowledgeOpen && !document.querySelector('dialog[open]')) {
    const controls = [...$('#inspector').querySelectorAll('button,a[href],input,select,textarea,summary,[tabindex="0"]')].filter(item => !item.disabled && !item.closest('[hidden]') && item.getClientRects().length)
    const first = controls[0], last = controls.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('#step-content'))) { event.preventDefault(); last?.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus() }
  }
  if (event.key === 'Escape' && !document.querySelector('dialog[open]')) { if (knowledgeOpen) closeKnowledge(); else if (paletteSelection) { paletteSelection = null; $('#palette-hint').hidden = true; syncPalette() } else if (inspectorOpen) closeInspector() }
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z' && !event.target.closest('input,textarea,[contenteditable]') && !document.querySelector('dialog[open]')) { event.preventDefault(); restoreHistory(event.shiftKey ? 1 : -1) }
})
window.addEventListener('beforeunload', event => { if (sessionDirty()) { event.preventDefault(); event.returnValue = '' } })
function applyRoute() {
  const id = location.hash.slice(1)
  if (id === 'knowledge') { if (!knowledgeOpen) openKnowledge(typeof history.state?.topic === 'string' ? history.state.topic : 'overview', history.state?.view || 'explore', false); return }
  if (knowledgeOpen) { closeKnowledge(false); if (location.hash === knowledgeReturnHash) return }
  if (!config) { history.replaceState(null, '', '#start'); renderStudio(); return }
  if (id.startsWith('stage-')) { openStage(id.slice(6)); return }
  if (id.startsWith('details-')) { goTo(id.slice(8), false); return }
  if (['preview', 'overview'].includes(id)) { showView(id === 'preview' ? 'overview' : 'workflow', false); return }
  if (['files', 'artifacts'].includes(id)) { showView('artifacts', false); return }
  if (id === 'architecture') { goTo('runtime', false); return }
  if (id === 'workflow' || id === 'start' || !id) { showView('workflow', false); return }
  if (steps.some(step => step.id === id)) goTo(id, false)
}
window.addEventListener('hashchange', applyRoute)
$('#example-options').innerHTML = CATALOG.recipes.map((item, index) => `<button type="button" data-example="${item.id}"><span class="example-icon" aria-hidden="true">${['◈','◎','◇'][index]}</span><div><strong>${escape(labelOf(item))}</strong><p>${escape(item.description)}</p><small>${item.stageIds.length} stages · Fictional project</small></div><span aria-hidden="true">→</span></button>`).join('')
$('#legacy-notice').hidden = !legacyDraft
jevView = mountJevView(assistance, { onCreate: createAssistedProject })
setTheme(theme)
renderStudio()
applyRoute()
if (recoveryMessage) toast(recoveryMessage)
