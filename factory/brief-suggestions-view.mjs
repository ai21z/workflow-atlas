import { createBriefSuggestions } from './brief-suggestions.mjs'
import { createJevAssistance, buildAssistancePayload } from './jev-assistance.mjs'
import { CATALOG } from './catalog.mjs'
import { getIntentAnswer } from './intent.mjs'

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]))
const labels = {
  relevant: 'JEV suggests this fits',
  'not-relevant': 'JEV suggests this does not fit',
  'insufficient-context': 'JEV needs more context',
}
const taskLabels = {
  'software-change': 'Build, fix or plan software',
  'knowledge-work': 'Maintain source backed knowledge',
  other: 'Other work or reading only',
  unsure: 'Not decided yet',
}
const knowledgeLabels = {
  'maintained-reference': 'Yes, an ongoing reference',
  'one-off': 'One-time output',
  unsure: 'Not sure yet',
}
const partRoles = { task: 'Current task', requirement: 'Product requirement', context: 'Background', restriction: 'Restriction' }
const partScopes = { practices: 'Practices to leave out', product: 'Product behavior', inference: 'Sending text to AI', handling: 'Handling project input', unresolved: 'Not sure' }
const partKey = part => JSON.stringify([part.field, part.index])
const practiceLabel = id => CATALOG.practices.find(practice => practice.id === id)?.label || id
const practiceChoices = () => CATALOG.practiceActions.filter(item => item.practiceId)

function quickPartQuestion(part) {
  const field = escape(part.field)
  return `<section class="brief-clarification brief-quick-meaning" data-part-question aria-labelledby="quick-meaning-title"><h3 id="quick-meaning-title">How should Atlas use this sentence?</h3><p class="hint">${escape(part.label)}, sentence ${part.index + 1}</p><blockquote data-quick-part-quote>${escape(part.text)}</blockquote><div class="brief-clarification-options">${part.quickActions.map(action => `<button type="button" class="secondary" data-confirm-part-action="${escape(action.id)}" data-part-field="${field}" data-part-index="${part.index}" data-suggestion-focus="quick-${field}-${part.index}-${escape(action.id)}">${escape(action.label)}</button>`).join('')}</div><div class="inline-actions"><button type="button" class="text-button" data-open-parts data-part-field="${field}" data-part-index="${part.index}" data-suggestion-focus="choose-part-meaning">Choose another meaning</button><button type="button" class="text-button" data-edit-source-part data-part-field="${field}" data-part-index="${part.index}" data-suggestion-focus="edit-source-part">Edit wording</button></div><p class="hint">Your text stays unchanged. This choice stays in your download.</p></section>`
}

function separationEditor(parts, selected, draft) {
  if (!parts.length || !selected || !draft) return ''
  const restriction = draft.role === 'restriction'
  const pending = draft.role !== (selected.role || '') || (restriction && (draft.scope !== (selected.scope || '') || JSON.stringify([...(draft.scope === 'practices' ? draft.practiceIds : [])].sort()) !== JSON.stringify([...(selected.practiceIds || [])].sort())))
  const status = selected.role
    ? `Recorded meaning: ${partRoles[selected.role] || selected.role}. ${selected.status === 'applied' ? 'Used for local matching.' : 'This meaning still needs review.'}`
    : 'No meaning recorded yet.'
  return `<details class="brief-separation" data-detail="separation"><summary>Separate tasks and rules</summary><p>Tell Atlas which sentence describes the work, a product rule, background or a limit. Your original text stays unchanged.</p><div class="brief-clarification"><label>Choose a sentence<select data-part-select data-suggestion-focus="part-select">${parts.map(part => `<option value="${escape(partKey(part))}" ${partKey(part) === partKey(selected) ? 'selected' : ''}>${escape(part.label)}, sentence ${part.index + 1}: ${escape(part.text.length > 85 ? `${part.text.slice(0, 82)}…` : part.text)}</option>`).join('')}</select></label><p class="hint brief-part-source">${escape(selected.label)}, sentence ${selected.index + 1}</p><blockquote data-part-quote>${escape(selected.text)}</blockquote><label>This sentence is<select data-part-role data-suggestion-focus="part-role"><option value="">Choose a meaning</option>${Object.entries(partRoles).map(([value, label]) => `<option value="${value}" ${draft.role === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${restriction ? `<label>What does it limit?<select data-part-scope data-suggestion-focus="part-scope"><option value="">Choose the limit</option>${Object.entries(partScopes).map(([value, label]) => `<option value="${value}" ${draft.scope === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${draft.scope === 'practices' ? `<fieldset class="brief-part-practices"><legend>Practices to leave out</legend>${practiceChoices().map(item => `<label><input type="checkbox" data-part-practice="${escape(item.practiceId)}" data-suggestion-focus="part-practice-${escape(item.practiceId)}" ${draft.practiceIds.includes(item.practiceId) ? 'checked' : ''}><span>${escape(practiceLabel(item.practiceId))}</span></label>`).join('')}</fieldset>` : ''}` : ''}<p class="hint">These choices guide local matching. Limits on sending or handling text still pause the JEV check.</p><div class="inline-actions"><button type="button" class="secondary" data-keep-part data-suggestion-focus="keep-part">Keep this meaning</button>${selected.role ? '<button type="button" class="text-button" data-remove-part data-suggestion-focus="remove-part">Remove this meaning</button>' : ''}</div><p class="brief-part-status" data-part-status role="status" tabindex="-1">${escape(status)}${selected.note ? ` ${escape(selected.note)}` : ''}${pending ? ' This edit has not been kept yet.' : ''}</p><p class="brief-clarification-error" data-part-error role="status"></p></div></details>`
}

function taskQuestion(clarification) {
  const undecided = clarification.intentUndecided
  const title = undecided ? 'What should we plan now?' : clarification.taskConflict ? 'Which kind of work fits this scope?' : 'What kind of work is this?'
  const explanation = undecided ? 'Choose the work to plan. Mentioned alternatives stay out of practice matching until you choose.' : clarification.taskConflict ? 'Your scope rules out software work. Choose another kind of work, or edit the scope.' : 'Your choice helps match practices. Nothing is added automatically.'
  return `<fieldset class="brief-clarification" data-task-question ${undecided ? 'data-undecided-question' : ''}><legend>${title}</legend><p>${explanation}</p>${undecided && clarification.intentDecisionSource ? `<blockquote data-intent-decision-source>${escape(clarification.intentDecisionSource)}</blockquote>` : ''}<div class="brief-clarification-options">${Object.entries(taskLabels).filter(([value]) => !(clarification.excludedTaskKinds || []).includes(value)).map(([value, label]) => `<button type="button" class="secondary" data-clarify-task="${value}" data-suggestion-focus="task-${value}" aria-pressed="${clarification.taskKind === value}">${label}</button>`).join('')}</div>${clarification.taskConflict ? '<button type="button" class="text-button" data-edit-task-scope data-suggestion-focus="edit-task-scope">Edit the scope instead</button>' : ''}</fieldset>`
}

function knowledgeQuestion(clarification) {
  return `<fieldset class="brief-clarification" data-knowledge-question><legend>Will you maintain sources and decisions over time?</legend><div class="brief-clarification-options">${Object.entries(knowledgeLabels).map(([value, label]) => `<button type="button" class="secondary" data-clarify-knowledge="${value}" data-suggestion-focus="knowledge-${value}" aria-pressed="${clarification.knowledgeNeed === value}">${label}</button>`).join('')}</div></fieldset>`
}

function statementQuestion(statement, canSeparate = false) {
  const clause = escape(statement.clause)
  if (statement.clarificationType === 'input-exception') return `<div class="brief-clarification" data-statement-question data-input-exception><p><strong>Clarify the privacy exception.</strong></p><blockquote>${clause}</blockquote><p data-clarification-reason>${escape(statement.reason)}</p><p>Practice ideas and JEV checks stay paused while this is unresolved.</p><button type="button" class="secondary" data-edit-clarification data-suggestion-focus="edit-clarification">Edit the wording</button></div>`
  if (!statement.clarifiable) return `<div class="brief-clarification" data-statement-question><p><strong>This instruction needs clearer meaning.</strong></p><blockquote>${clause}</blockquote>${statement.reason ? `<p data-clarification-reason>${escape(statement.reason)}</p>` : ''}<p>Atlas cannot safely decide what it allows.${canSeparate ? ' Explain its meaning, or edit the wording.' : ' Edit it before checking practices.'}</p><div class="inline-actions">${canSeparate ? '<button type="button" class="secondary" data-open-parts data-suggestion-focus="open-parts">Separate this sentence</button>' : ''}<button type="button" class="${canSeparate ? 'text-button' : 'secondary'}" data-edit-clarification data-suggestion-focus="edit-clarification">Edit my description</button></div></div>`
  const prompts = {
    'conditional-requirement': ['Is this a rule for what you are building?', 'Yes, keep the whole requirement'],
    'historical-context': ['Is this background from earlier work?', 'Yes, keep it as background'],
    'task-scope': ['Does this describe the scope of this task?', 'Yes, keep this scope'],
  }
  const prompt = prompts[statement.clarificationType]
  const allowed = statement.allowedKinds || ['requirement', 'context', 'exclusion']
  const meanings = { requirement: 'A rule for what we are building', context: 'Background or missing information' }
  const buttons = Object.entries(meanings).filter(([kind]) => allowed.includes(kind)).map(([kind, label]) => `<button type="button" class="secondary" data-clarify-statement="${kind}" data-review-clause="${clause}" data-suggestion-focus="meaning-${kind}">${prompt?.[1] || label}</button>`).join('')
  const exclusion = allowed.includes('exclusion') ? `<details data-detail="clarify-exclusion"><summary>A practice to leave out</summary><label>Which practice?<select data-excluded-practice><option value="">Choose a practice</option>${CATALOG.practiceActions.filter(item => item.practiceId).map(item => `<option value="${escape(item.practiceId)}">${escape(CATALOG.practices.find(practice => practice.id === item.practiceId)?.label || item.title)}</option>`).join('')}</select></label><button type="button" class="secondary" data-confirm-exclusion data-review-clause="${clause}" data-suggestion-focus="meaning-exclusion">Keep this practice out</button><p class="hint">Choose one practice. For several or conflicting instructions, edit the wording.</p></details>` : ''
  return `<fieldset class="brief-clarification" data-statement-question><legend>${prompt?.[0] || 'What does this sentence mean?'}</legend><blockquote>${clause}</blockquote><div class="brief-clarification-options">${buttons}</div>${exclusion}<button type="button" class="text-button" data-edit-clarification data-suggestion-focus="edit-clarification">Edit the wording instead</button><p class="hint">Your original text stays unchanged. This clarification stays in Atlas and your downloads.</p><p class="brief-clarification-error" role="status"></p></fieldset>`
}

// Only user-authored text and the existing supported practice ID enter this draft.
// Retrieval reasons, topic bodies, summaries, sources and scores stay in the browser.
export function preparePracticeAssessment(config, practiceId) {
  const recipe = CATALOG.recipes.find(item => item.id === config?.workflow?.recipe)
  if (!recipe) throw new Error('Choose a starting workflow before checking a practice.')
  return {
    brief: config.project.purpose,
    recipeId: recipe.id,
    practiceId,
    answers: Object.fromEntries(recipe.questions.map(question => [question.id, getIntentAnswer(config, question.id).text]).filter(([, text]) => typeof text === 'string' && text.trim())),
  }
}

export function createPracticeAssessment({ fetchImpl = globalThis.fetch, onChange = () => {} } = {}) {
  let fingerprint = ''
  let epoch = 0
  let state = { status: 'idle', practiceId: null, outcome: null, error: null }
  const controller = createJevAssistance({ fetchImpl })
  const getState = () => ({ ...state })
  const notify = () => onChange(getState())

  function invalidate(nextFingerprint = '') {
    epoch += 1
    fingerprint = nextFingerprint
    controller.reset()
    state = { status: 'idle', practiceId: null, outcome: null, error: null }
    notify()
  }

  function disclosure(config, practiceId) {
    const draft = preparePracticeAssessment(config, practiceId)
    return buildAssistancePayload({ userBrief: draft.brief, purpose: draft.brief, suppliedProjectAnswers: draft.answers, practiceId, manualRecipe: draft.recipeId }, 'practice-disclosure', draft.recipeId)
  }

  async function assess(config, practiceId, snapshot) {
    if (snapshot !== fingerprint) invalidate(snapshot)
    if (state.status === 'requesting' || state.status === 'assessed') return null
    const draft = preparePracticeAssessment(config, practiceId)
    const requestEpoch = ++epoch
    controller.reset()
    controller.updateBrief(draft.brief)
    controller.chooseRecipe(draft.recipeId)
    for (const [id, text] of Object.entries(draft.answers)) controller.confirmAnswer(id, text)
    controller.choosePractice(practiceId)
    state = { status: 'requesting', practiceId, outcome: null, error: null }
    notify()
    await controller.suggest()
    if (epoch !== requestEpoch || fingerprint !== snapshot) return null
    const result = controller.getState()
    const outcome = result.proposal?.practice?.choice
    state = outcome && Object.hasOwn(labels, outcome)
      ? { status: 'assessed', practiceId, outcome, error: null }
      : { status: 'failed', practiceId, outcome: null, error: result.error?.message || 'This assessment could not be checked. Your choices are unchanged.' }
    notify()
    return getState()
  }

  function cancel() {
    invalidate(fingerprint)
    state.status = 'cancelled'
    notify()
  }

  return { getState, invalidate, assess, disclosure, cancel }
}

export function mountBriefSuggestions({ root, getContext, onRead, onReview, onClarify, onEditBrief, fetchImpl = globalThis.fetch } = {}) {
  const staticHosting = document.documentElement.dataset.atlasHosting === 'static'
  let model = null
  let current = null
  let rendered = ''
  let timer
  let available = staticHosting ? false : null
  let failure = false
  let synchronizing = false
  let contextSnapshot = ''
  let selectedPartKey = ''
  let confirmedPart = null
  const partDrafts = new Map()
  const assessment = createPracticeAssessment({ fetchImpl, onChange: () => { if (!synchronizing) render() } })

  function selectedPart() {
    const parts = current?.clarification?.parts || []
    return parts.find(part => partKey(part) === selectedPartKey) || parts.find(part => !part.role) || parts[0]
  }

  function partDraft(part) {
    const key = partKey(part)
    let draft = partDrafts.get(key)
    const recorded = JSON.stringify([part.role, part.scope, part.practiceIds || []])
    if (!draft || draft.text !== part.text || draft.recorded !== recorded) {
      draft = { text: part.text, recorded, role: part.role || '', scope: part.scope || '', practiceIds: [...(part.practiceIds || [])] }
      partDrafts.set(key, draft)
    }
    return draft
  }

  function render() {
    if (failure) {
      root.hidden = false
      root.innerHTML = '<p class="hint" role="status">Related ideas could not be loaded. Your brief and workflow still work.</p>'
      return
    }
    if (!model || !current) { root.hidden = true; return }
    const context = getContext()
    const active = assessment.getState()
    const candidate = current.assessmentCandidate
    const assessmentText = item => active.practiceId === item.practiceId
      ? active.status === 'requesting' ? 'Checking fit with JEV…' : labels[active.outcome] || 'Not assessed by JEV'
      : 'Not assessed by JEV'
    const open = new Set([...root.querySelectorAll('details[open]')].map(element => element.dataset.detail))
    const focusedElement = root.contains(document.activeElement) ? document.activeElement : null
    const focused = focusedElement?.dataset.suggestionFocus
    const focusedDetail = focusedElement?.tagName === 'SUMMARY' ? focusedElement.parentElement.dataset.detail : null
    const pendingExclusion = root.querySelector('[data-excluded-practice]')?.value
    const previousClause = root.querySelector('[data-confirm-exclusion]')?.dataset.reviewClause
    const suggestions = current.suggestions.map(item => `<li class="brief-idea" data-practice-suggestion="${escape(item.practiceId)}"><div><h3>${escape(item.title)}</h3><p class="brief-idea-reason">${escape(item.reason)}</p><p class="brief-idea-source">${escape(item.sourceLine)}</p></div><div class="brief-idea-actions"><button type="button" class="secondary" aria-label="Review practice: ${escape(item.title)}" data-review-idea="${escape(item.topicId)}" data-suggestion-focus="review-${escape(item.practiceId)}">Review practice</button><button type="button" class="text-button" aria-label="Read topic: ${escape(item.title)}" data-read-idea="${escape(item.topicId)}" data-suggestion-focus="read-${escape(item.practiceId)}">Read topic</button></div><details data-detail="why-${escape(item.practiceId)}"><summary aria-label="Why this appeared: ${escape(item.title)}">Why this appeared</summary><ul>${item.reasons.map(reason => `<li>${escape(reason)}</li>`).join('')}</ul><p>${escape(assessmentText(item))}. Source review is separate.</p></details></li>`).join('')
    let fit = ''
    if (candidate) {
      if (staticHosting || available === false) {
        fit = '<p class="hint brief-fit-setup">Optional JEV assessment needs a configured local server. <a href="../docs/jev/#integration" target="_blank" rel="noopener">Set up JEV locally ↗</a>.</p>'
      } else {
        const payload = assessment.disclosure(context.config, candidate.practiceId)
        fit = `<details class="brief-fit" data-detail="fit"><summary>Check fit with JEV, optional</summary><p>Check <strong>${escape(candidate.title)}</strong>. This sends your result and the recorded answers below to TypeSafe. Catalogue text stays here. An assessment does not add the practice.</p><details data-detail="sent"><summary>Review the text that will be sent</summary><dl><dt>Wanted result</dt><dd>${escape(payload.userBrief)}</dd>${Object.entries(payload.suppliedProjectAnswers).map(([id, text]) => `<dt>${escape(CATALOG.recipes.flatMap(recipe => recipe.questions).find(question => question.id === id)?.label || id)}</dt><dd>${escape(text)}</dd>`).join('')}<dt>Practice ID</dt><dd>${escape(candidate.practiceId)}</dd></dl></details><div class="inline-actions"><button type="button" class="secondary" data-assess-idea data-suggestion-focus="assess" ${available !== true || ['requesting', 'assessed'].includes(active.status) ? 'disabled' : ''}>${active.status === 'assessed' ? 'Assessment complete' : 'Check fit with JEV'}</button>${active.status === 'requesting' ? '<button type="button" class="text-button" data-cancel-fit data-suggestion-focus="cancel">Cancel assessment</button>' : ''}</div><p class="brief-fit-result" tabindex="-1" role="status" aria-live="polite">${escape(active.status === 'requesting' ? 'Checking fit with JEV…' : labels[active.outcome] || (active.status === 'cancelled' ? 'Assessment cancelled. Your choices are unchanged.' : 'Not assessed by JEV'))}</p>${active.error ? `<p role="alert">${escape(active.error)}</p>` : ''}</details>`
      }
    }
    const reading = current.reading.map(item => `<li><button type="button" class="text-button" data-read-idea="${escape(item.topicId)}" data-suggestion-focus="reading-${escape(item.topicId)}">${escape(item.title)}</button>${item.scopeLabel ? `<span class="brief-reading-scope">${escape(item.scopeLabel)}</span>` : ''}<p>${escape(item.reason)}</p></li>`).join('')
    const hasBrief = Boolean(context.brief?.trim())
    root.hidden = !hasBrief && !context.config
    const clarification = current.clarification || {}
    const parts = clarification.parts || []
    for (const [key, draft] of partDrafts) if (!parts.some(part => partKey(part) === key && part.text === draft.text)) partDrafts.delete(key)
    const selected = selectedPart()
    if (selected) selectedPartKey = partKey(selected)
    const canSeparate = Boolean(parts.length && onClarify)
    const canClarify = Boolean(context.config && current.input.recipe && onClarify)
    const inputException = clarification.statement?.clarificationType === 'input-exception'
    const nextPart = !inputException && !clarification.intentUndecided && parts.find(part => part.field === clarification.reviewPart?.field && part.index === clarification.reviewPart?.index && part.quickActions?.length)
    const inlineTask = canClarify && !inputException && clarification.taskNeeded && (clarification.intentUndecided || (!nextPart && !clarification.statement))
    const shownStatement = !inlineTask && !nextPart ? clarification.statement : null
    const question = canClarify ? inlineTask ? taskQuestion(clarification) : nextPart ? quickPartQuestion(nextPart) : shownStatement ? statementQuestion(shownStatement, canSeparate) : '' : ''
    const keptPart = confirmedPart && parts.find(part => part.field === confirmedPart.field && part.index === confirmedPart.index && part.text === confirmedPart.text && part.role === confirmedPart.role && part.scope === confirmedPart.scope)
    const confirmation = keptPart ? `<p class="brief-part-feedback" data-part-feedback role="status">Recorded as ${escape(partRoles[keptPart.role].toLowerCase())}.${keptPart.status === 'needs-review' ? ' This meaning still needs review.' : ''} <button type="button" class="text-button" data-open-parts data-part-field="${escape(keptPart.field)}" data-part-index="${keptPart.index}" data-suggestion-focus="review-kept-meaning">Review this choice</button></p>` : ''
    const matching = canClarify ? `<details class="brief-matching" data-detail="matching"><summary>Refine matching</summary><p class="hint">These choices guide local matching and stay in your downloads. JEV reads your original description and answers. Nothing is added automatically.</p>${canSeparate ? separationEditor(parts, selected, partDraft(selected)) : ''}${inlineTask ? '' : taskQuestion(clarification)}${knowledgeQuestion(clarification)}</details>` : ''
    const knowledgeConflict = clarification.knowledgeConflict ? '<p class="brief-matching-conflict" data-knowledge-conflict role="status">Your work type says ongoing knowledge, but this choice does not. Review these choices.</p>' : ''
    const unresolvedReason = item => clarification.intentUndecided && item.reason === 'The wording or scope of this restriction needs clarification.' ? 'This wording still needs clarification.' : item.reason
    const unresolved = (current.unresolved || []).filter(item => !question || (nextPart ? !nextPart.text.includes(item.clause) : item.clause !== shownStatement?.clause)).map(item => `<li><q>${escape(item.clause)}</q> ${escape(unresolvedReason(item))}</li>`).join('')
    const boundaries = (current.boundaries || []).map(item => `<li><q>${escape(item.clause)}</q> ${escape(item.note)}</li>`).join('')
    const requirementItems = (current.requirements || []).map(item => `<li><q>${escape(item.clause)}</q></li>`).join('')
    const requirements = requirementItems ? `<details class="brief-requirements" data-detail="requirements"><summary>Requirements from your text</summary><ul>${requirementItems}</ul><p>Keep these as requirements to verify. Suggestions do not establish that they are satisfied. Atlas does not enforce them when a workflow runs.</p></details>` : ''
    const localBlocked = current.localRetrievalBlocked ?? current.unresolvedNegation
    const constraintsTitle = clarification.intentUndecided ? 'Wording and limits to clarify' : `Restrictions from your text${unresolved ? ' need clarification' : ''}`
    const restrictions = unresolved || boundaries ? `<details class="brief-constraints" data-detail="constraints" ${unresolved && !question ? 'open' : ''}><summary>${constraintsTitle}</summary><ul>${unresolved}${boundaries}</ul>${localBlocked ? '<p>Practice ideas and JEV checks are paused until these statements are clear.</p>' : '<p>These restrictions stay in your text. Atlas does not enforce them when a workflow runs.</p>'}</details>` : ''
    if (current.assessmentBlocked && !localBlocked) fit = '<p class="hint brief-fit-setup" data-assessment-blocked>JEV check is paused by a limit on sending or handling your text.</p>'
    const recordedParts = parts.filter(part => part.role)
    const partRecords = recordedParts.length ? `<ul class="brief-recorded-parts">${recordedParts.map(part => `<li><p class="hint">${escape(part.label)}, sentence ${part.index + 1}</p><q>${escape(part.text)}</q><p>${escape(partRoles[part.role])}${part.scope ? `: ${escape(partScopes[part.scope])}` : ''}. ${part.status === 'applied' ? 'Used for local matching.' : 'This meaning still needs review.'}</p><button type="button" class="text-button" data-open-parts data-part-field="${escape(part.field)}" data-part-index="${part.index}" data-suggestion-focus="recorded-part-${escape(part.field)}-${part.index}">Review this meaning</button></li>`).join('')}</ul>` : ''
    const recorded = clarification.taskKind || clarification.knowledgeNeed || clarification.statements?.length || recordedParts.length ? `<details class="brief-recorded-clarifications" data-detail="clarifications"><summary>Your clarifications</summary>${clarification.taskKind ? `<p>Kind of work: ${escape(taskLabels[clarification.taskKind])}.</p>` : ''}${clarification.knowledgeNeed ? `<p data-recorded-knowledge>Keep sources and decisions over time: ${escape(knowledgeLabels[clarification.knowledgeNeed])}.</p>` : ''}${clarification.statements?.length ? `<ul>${clarification.statements.map((item, index) => `<li><q>${escape(item.clause)}</q><p>${item.kind === 'requirement' ? 'A product requirement to verify.' : item.kind === 'context' ? 'Background, history or task scope.' : `Leave out: ${item.practiceIds.map(id => escape(CATALOG.practices.find(practice => practice.id === id)?.label || id)).join(', ')}.`}</p>${!(clarification.resolvedStatements || []).some(resolved => resolved.clause === item.clause && resolved.kind === item.kind) ? '<p class="hint">Recorded choice. This wording still needs review before it can guide suggestions.</p>' : ''}${onEditBrief ? `<button type="button" class="text-button" data-edit-recorded-clarification data-review-clause="${escape(item.clause)}" data-suggestion-focus="edit-recorded-${index}">Edit original wording</button>` : ''}</li>`).join('')}</ul>` : ''}${partRecords}<p>Reviewed choices guide local suggestions. All recorded choices stay in your downloads. JEV still reads your original description and answers.</p><button type="button" class="text-button" data-reset-clarifications data-suggestion-focus="reset-clarifications">Review these choices again</button></details>` : ''
    const html = `<div class="brief-ideas-heading"><h2 id="brief-ideas-title" tabindex="-1">Ideas for your workflow</h2><p>Matched locally. Review before adding.</p></div>${clarification.stale ? '<p class="hint" role="status">Your text changed. Previous clarifications need reviewing.</p>' : ''}${question}${confirmation}${knowledgeConflict}${matching}${suggestions ? `<ul class="brief-ideas-list">${suggestions}</ul>` : `<p class="hint">${escape(localBlocked ? 'Practice ideas and JEV checks are paused until this is clear.' : current.note || 'No additional practice matched this brief. You can keep shaping your workflow.')}</p>`}${recorded}${requirements}${restrictions}${fit}${reading ? `<details class="brief-reading" data-detail="reading"><summary>Related reading (${current.reading.length})</summary><ul>${reading}</ul></details>` : ''}${current.excluded?.length ? '<p class="hint brief-exclusion-note">Explicit exclusions were kept out of the practice ideas.</p>' : ''}`
    if (html === rendered) return
    rendered = html
    root.innerHTML = html
    const exclusionSelect = root.querySelector('[data-excluded-practice]')
    if (exclusionSelect) {
      exclusionSelect.dataset.suggestionFocus = 'excluded-practice'
      if (previousClause === current.clarification?.statement?.clause && pendingExclusion) exclusionSelect.value = pendingExclusion
    }
    for (const detail of root.querySelectorAll('details')) if (open.has(detail.dataset.detail)) detail.open = true
    if (focusedDetail) [...root.querySelectorAll('details')].find(element => element.dataset.detail === focusedDetail)?.querySelector(':scope > summary')?.focus({ preventScroll: true })
    if (focused) {
      const replacement = [...root.querySelectorAll('[data-suggestion-focus]')].find(element => element.dataset.suggestionFocus === focused && !element.disabled && !element.closest('details:not([open])'))
      const fallback = active.status === 'requesting' ? root.querySelector('[data-cancel-fit]') : root.querySelector('.brief-fit-result')
      const focusTarget = replacement || fallback || root.querySelector('#brief-ideas-title')
      focusTarget?.focus({ preventScroll: true })
    }
  }

  function update({ immediate = false } = {}) {
    clearTimeout(timer)
    if (!model) return
    const context = getContext()
    const nextContext = JSON.stringify(context)
    if (nextContext !== contextSnapshot) {
      contextSnapshot = nextContext
      synchronizing = true
      assessment.invalidate()
      synchronizing = false
    }
    root.setAttribute('aria-busy', 'true')
    const calculate = () => {
      const next = model.propose(context)
      if (current?.fingerprint !== next.fingerprint) {
        synchronizing = true
        assessment.invalidate(next.fingerprint)
        synchronizing = false
      }
      current = next
      root.setAttribute('aria-busy', 'false')
      render()
    }
    if (immediate) calculate()
    else timer = setTimeout(calculate, 160)
  }

  root.addEventListener('change', event => {
    const control = event.target
    if (!control?.matches?.('[data-part-select], [data-part-role], [data-part-scope], [data-part-practice]')) return
    const priorFingerprint = current?.fingerprint
    const value = control.value
    const checked = control.checked
    update({ immediate: true })
    if (!current || current.fingerprint !== priorFingerprint) return
    if (control.hasAttribute('data-part-select')) {
      if (!(current.clarification?.parts || []).some(part => partKey(part) === value)) return
      selectedPartKey = value
    } else {
      const part = selectedPart()
      if (!part) return
      const draft = partDraft(part)
      if (control.hasAttribute('data-part-role')) {
        if (value && !Object.hasOwn(partRoles, value)) return
        draft.role = value
      } else if (control.hasAttribute('data-part-scope')) {
        if (value && !Object.hasOwn(partScopes, value)) return
        draft.scope = value
      } else {
        const practiceId = control.dataset.partPractice
        if (!practiceChoices().some(item => item.practiceId === practiceId)) return
        draft.practiceIds = checked ? [...new Set([...draft.practiceIds, practiceId])] : draft.practiceIds.filter(id => id !== practiceId)
      }
    }
    render()
  })

  root.addEventListener('click', async event => {
    const control = event.target.closest('button')
    if (!control || !root.contains(control)) return
    const priorFingerprint = current?.fingerprint
    update({ immediate: true })
    if (!current || current.fingerprint !== priorFingerprint) return
    if (control.hasAttribute('data-confirm-part-action')) {
      const field = control.dataset.partField
      const index = Number(control.dataset.partIndex)
      const reviewPart = current.clarification?.reviewPart
      if (!onClarify || !getContext().config || reviewPart?.field !== field || reviewPart?.index !== index) return
      const part = current.clarification.parts?.find(item => item.field === field && item.index === index)
      const action = part?.quickActions?.find(item => item.id === control.dataset.confirmPartAction)
      if (!action) return
      const change = { type: 'part', field, index, text: part.text, role: action.role, scope: action.scope, practiceIds: [...action.practiceIds] }
      onClarify(change)
      partDrafts.delete(partKey(part))
      confirmedPart = change
      update({ immediate: true })
      const nextControl = [...root.querySelectorAll('[data-part-question] button, [data-statement-question] button, [data-task-question] button')].find(element => !element.disabled && !element.closest('details:not([open])')) || root.querySelector('#brief-ideas-title')
      nextControl?.focus({ preventScroll: true })
      return
    }
    if (control.hasAttribute('data-edit-source-part')) {
      const part = current.clarification?.parts?.find(item => item.field === control.dataset.partField && item.index === Number(control.dataset.partIndex))
      if (part) onEditBrief?.(part.text, { field: part.field, index: part.index })
      return
    }
    if (control.hasAttribute('data-open-parts')) {
      const parts = current.clarification?.parts || []
      const clause = current.clarification?.statement?.clause
      const matchingPart = control.dataset.partField
        ? parts.find(part => part.field === control.dataset.partField && part.index === Number(control.dataset.partIndex))
        : clause && parts.find(part => part.text === clause || part.text.includes(clause))
      if (control.dataset.partField && !matchingPart) return
      if (matchingPart) selectedPartKey = partKey(matchingPart)
      render()
      for (const name of ['matching', 'separation']) {
        const details = root.querySelector(`[data-detail="${name}"]`)
        if (details) details.open = true
      }
      root.querySelector('[data-part-role]')?.focus()
      return
    }
    if (control.hasAttribute('data-keep-part') || control.hasAttribute('data-remove-part')) {
      const part = selectedPart()
      if (!part || !onClarify || !getContext().config) return
      const draft = partDraft(part)
      const showError = (message, selector) => {
        const error = root.querySelector('[data-part-error]')
        if (error) error.textContent = message
        root.querySelector(selector)?.focus()
      }
      if (control.hasAttribute('data-remove-part')) {
        onClarify({ type: 'remove-part', field: part.field, index: part.index })
      } else {
        if (!Object.hasOwn(partRoles, draft.role)) { showError('Choose what this sentence means first.', '[data-part-role]'); return }
        if (draft.role === 'restriction' && !Object.hasOwn(partScopes, draft.scope)) { showError('Choose what this restriction limits.', '[data-part-scope]'); return }
        if (draft.role === 'restriction' && draft.scope === 'practices' && !draft.practiceIds.length) { showError('Choose at least one practice to leave out.', '[data-part-practice]'); return }
        onClarify({ type: 'part', field: part.field, index: part.index, text: part.text, role: draft.role, scope: draft.role === 'restriction' ? draft.scope : null, practiceIds: draft.role === 'restriction' && draft.scope === 'practices' ? [...draft.practiceIds] : [] })
      }
      partDrafts.delete(partKey(part))
      update({ immediate: true })
      root.querySelector('[data-part-status]')?.focus({ preventScroll: true })
      return
    }
    if (control.hasAttribute('data-edit-task-scope')) { onEditBrief?.(current?.clarification?.taskScopeClause); return }
    if (control.hasAttribute('data-edit-clarification')) { onEditBrief?.(current?.clarification?.statement?.clause); return }
    if (control.hasAttribute('data-edit-recorded-clarification')) {
      const clause = control.dataset.reviewClause
      if (current.clarification?.statements?.some(item => item.clause === clause)) onEditBrief?.(clause)
      return
    }
    if (control.hasAttribute('data-reset-clarifications')) { partDrafts.clear(); confirmedPart = null; onClarify?.({ type: 'clear' }); update({ immediate: true }); root.querySelector('#brief-ideas-title')?.focus(); return }
    if (control.dataset.clarifyTask) {
      if (!onClarify || !current.input.recipe || !Object.hasOwn(taskLabels, control.dataset.clarifyTask)) return
      if ((current.clarification.excludedTaskKinds || []).includes(control.dataset.clarifyTask)) return
      if (getContext().config) onClarify?.({ type: 'task', value: control.dataset.clarifyTask })
      update({ immediate: true })
      const selected = root.querySelector('[data-task-question] button[aria-pressed="true"]')
      ;(selected && !selected.closest('details:not([open])') ? selected : root.querySelector('#brief-ideas-title'))?.focus({ preventScroll: true })
      return
    }
    if (control.dataset.clarifyKnowledge) {
      if (!onClarify || !getContext().config || !current.input.recipe || !Object.hasOwn(knowledgeLabels, control.dataset.clarifyKnowledge)) return
      onClarify({ type: 'knowledge', value: control.dataset.clarifyKnowledge })
      update({ immediate: true })
      ;(root.querySelector('[data-knowledge-question] button[aria-pressed="true"]') || root.querySelector('#brief-ideas-title'))?.focus({ preventScroll: true })
      return
    }
    if (control.dataset.clarifyStatement || control.hasAttribute('data-confirm-exclusion')) {
      const practiceId = root.querySelector('[data-excluded-practice]')?.value
      const clause = control.dataset.reviewClause
      const statement = current?.clarification?.statement
      if (!statement?.clarifiable || statement.clause !== clause) return
      const kind = control.dataset.clarifyStatement || 'exclusion'
      if (!(statement.allowedKinds || ['requirement', 'context', 'exclusion']).includes(kind)) return
      if (control.hasAttribute('data-confirm-exclusion') && !practiceId) {
        root.querySelector('.brief-clarification-error').textContent = 'Choose a practice first.'
        root.querySelector('[data-excluded-practice]')?.focus()
        return
      }
      onClarify?.({ type: 'statement', clause, kind, practiceIds: practiceId && control.hasAttribute('data-confirm-exclusion') ? [practiceId] : [] })
      update({ immediate: true })
      const nextQuestion = [...root.querySelectorAll('[data-statement-question] button, [data-task-question] button')].find(element => !element.disabled && !element.closest('details:not([open])'))
      ;(nextQuestion || root.querySelector('#brief-ideas-title'))?.focus({ preventScroll: true })
      return
    }
    if (control.dataset.readIdea) { onRead(control.dataset.readIdea); return }
    if (control.dataset.reviewIdea) {
      const item = current?.suggestions.find(candidate => candidate.topicId === control.dataset.reviewIdea)
      if (item) onReview(item.action.id, item.topicId)
      return
    }
    if (control.hasAttribute('data-cancel-fit')) { assessment.cancel(); return }
    if (control.hasAttribute('data-assess-idea')) {
      const candidate = current?.assessmentCandidate
      if (staticHosting || available !== true || !candidate) return
      await assessment.assess(getContext().config, candidate.practiceId, current.fingerprint)
    }
  })

  const ready = (async () => {
    try {
      const response = await fetchImpl(new URL('../atlas/data.js', import.meta.url))
      if (!response.ok) throw new Error('Catalogue unavailable')
      const text = await response.text()
      model = createBriefSuggestions(JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1)))
      update({ immediate: true })
    } catch {
      failure = true
      render()
    }
  })()
  if (!staticHosting) fetchImpl('/api/jev/status', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(2500) }).then(response => response.json()).then(value => { available = value?.available === true; render() }).catch(() => { available = false; render() })
  return { update, ready, invalidate() { partDrafts.clear(); selectedPartKey = ''; confirmedPart = null; current = null; assessment.invalidate(); update({ immediate: true }) }, failed: () => failure }
}
