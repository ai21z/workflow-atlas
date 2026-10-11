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

export function mountBriefSuggestions({ root, getContext, onRead, onReview, fetchImpl = globalThis.fetch } = {}) {
  const staticHosting = document.documentElement.dataset.atlasHosting === 'static'
  let model = null
  let current = null
  let rendered = ''
  let timer
  let available = staticHosting ? false : null
  let failure = false
  let synchronizing = false
  let contextSnapshot = ''
  const assessment = createPracticeAssessment({ fetchImpl, onChange: () => { if (!synchronizing) render() } })

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
    const html = `<div class="brief-ideas-heading"><h2 id="brief-ideas-title" tabindex="-1">Ideas for your workflow</h2><p>Matched locally. Review before adding.</p></div>${suggestions ? `<ul class="brief-ideas-list">${suggestions}</ul>` : `<p class="hint">${escape(current.unresolvedNegation ? 'Some exclusions need clarification, so practice ideas are paused. You can still read related topics.' : current.note || 'No additional practice matched this brief. You can keep shaping your workflow.')}</p>`}${fit}${reading ? `<details class="brief-reading" data-detail="reading"><summary>Related reading (${current.reading.length})</summary><ul>${reading}</ul></details>` : ''}${current.excluded?.length ? '<p class="hint brief-exclusion-note">Explicit exclusions were kept out of the practice ideas.</p>' : ''}`
    if (html === rendered) return
    rendered = html
    root.innerHTML = html
    for (const detail of root.querySelectorAll('details')) if (open.has(detail.dataset.detail)) detail.open = true
    if (focusedDetail) [...root.querySelectorAll('details')].find(element => element.dataset.detail === focusedDetail)?.querySelector(':scope > summary')?.focus({ preventScroll: true })
    if (focused) {
      const replacement = [...root.querySelectorAll('[data-suggestion-focus]')].find(element => element.dataset.suggestionFocus === focused && !element.disabled)
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

  root.addEventListener('click', async event => {
    const control = event.target.closest('button')
    if (!control) return
    if (control.dataset.readIdea) { onRead(control.dataset.readIdea); return }
    if (control.dataset.reviewIdea) {
      update({ immediate: true })
      const item = current?.suggestions.find(candidate => candidate.topicId === control.dataset.reviewIdea)
      if (item) onReview(item.action.id, item.topicId)
      return
    }
    if (control.hasAttribute('data-cancel-fit')) { assessment.cancel(); return }
    if (control.hasAttribute('data-assess-idea')) {
      update({ immediate: true })
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
  return { update, ready, invalidate() { current = null; assessment.invalidate(); update({ immediate: true }) }, failed: () => failure }
}
