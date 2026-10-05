import { CATALOG, createRecipe } from './core.mjs'
import { getIntentAnswer, getIntentQuestionWording } from './intent.mjs'
import { MODEL, PROMPT_VERSION, CONTRACT_VERSION, DEFINITION_DIGEST, SUPPORTED_RECIPES, SUPPORTED_PRACTICES, PRIORITIES, ANSWER_IDS, makeRequest, validateResponse, decide } from './jev-contract.mjs'

const clone = value => JSON.parse(JSON.stringify(value))
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const present = value => typeof value === 'string' && value.trim().length > 0
const recipeFor = id => CATALOG.recipes.find(recipe => recipe.id === id)
const answerIds = new Set(ANSWER_IDS)
const projectAnswerIds = new Set([...ANSWER_IDS, ...CATALOG.recipes.flatMap(recipe => recipe.questions.map(question => question.id))])
const practiceIds = new Set(SUPPORTED_PRACTICES)
let controllerIdentity = 0

function assertText(value) {
  if (typeof value !== 'string') throw new TypeError('Enter text for this value.')
}

function assertAnswer(id) {
  if (!projectAnswerIds.has(id)) throw new Error('Choose a supported workflow question.')
}

// Suggestion applicability and map visibility serve different contexts. The caller
// must obtain an explicit selection. This operation never changes other choices.
export function addSuggestedPractice(config, practiceId) {
  if (!practiceIds.has(practiceId) || !plain(config) || !Array.isArray(config.practices)) throw new Error('Choose a supported suggested practice.')
  const next = clone(config)
  if (!next.practices.includes(practiceId)) next.practices.push(practiceId)
  return next
}

export function composeAssistedProject(draft, recipeId) {
  if (!recipeFor(recipeId)) throw new Error('Choose a supported workflow.')
  if (!plain(draft) || typeof draft.userBrief !== 'string' || typeof draft.purpose !== 'string' || typeof draft.projectName !== 'string' || !plain(draft.suppliedProjectAnswers)) throw new Error('The workflow draft is invalid.')
  let config = createRecipe(recipeId)
  config.project.name = present(draft.projectName) ? draft.projectName : 'Untitled workflow'
  config.project.purpose = draft.purpose
  for (const [id, text] of Object.entries(draft.suppliedProjectAnswers)) {
    assertAnswer(id)
    assertText(text)
    config.workflow.answers[id] = text
  }
  // Usually the purpose already contains the original wording. Keep one separate
  // copy only when the person has deliberately shortened or changed that purpose.
  if (present(draft.userBrief) && draft.purpose !== draft.userBrief) {
    config.workflow.notes[config.workflow.enabledStages[0]] = `Original description:\n${draft.userBrief}`
  }
  for (const id of draft.includedPractices || []) config = addSuggestedPractice(config, id)
  return config
}

export function buildAssistancePayload(draft, requestId, recipeId = draft.manualRecipe) {
  // New catalogue questions remain manual until a reviewed inference profile supports them.
  const suppliedProjectAnswers = Object.fromEntries(Object.entries(clone(draft.suppliedProjectAnswers)).filter(([id]) => answerIds.has(id)))
  const payload = { requestId, userBrief: draft.userBrief, suppliedProjectAnswers }
  // A shortened goal is an explicit user edit. Supply it only for the active
  // recipe's equivalent outcome slot, without duplicating canonical answers.
  const outcome = { 'feature-delivery': 'user-need', feasibility: 'desired-outcome' }[recipeId]
  if (outcome && draft.purpose !== draft.userBrief && !present(payload.suppliedProjectAnswers[outcome])) payload.suppliedProjectAnswers[outcome] = draft.purpose
  if (draft.practiceId) payload.practiceId = draft.practiceId
  return payload
}

function requestFor(payload) {
  return makeRequest({ brief: payload.userBrief, projectAnswers: payload.suppliedProjectAnswers, ...(payload.practiceId ? { practice: { id: payload.practiceId } } : {}) })
}

function validateEnvelope(envelope, payload) {
  if (!plain(envelope) || envelope.requestId !== payload.requestId || !plain(envelope.decision) || !plain(envelope.metadata)) return 'invalid response envelope'
  const { decision, metadata } = envelope
  if (metadata.model !== MODEL || metadata.promptVersion !== PROMPT_VERSION || metadata.contractVersion !== CONTRACT_VERSION || metadata.definitionDigest !== DEFINITION_DIGEST) return 'different decision contract'
  if (!plain(decision.allCoverage)) return 'missing recipe coverage'
  // Inference coverage belongs to the frozen profile, independently of catalogue growth.
  if (Object.keys(decision.allCoverage).sort().join('|') !== [...SUPPORTED_RECIPES].sort().join('|')) return 'unexpected recipe coverage'
  const answers = { intent: decision.intent }
  for (const recipeId of SUPPORTED_RECIPES) {
    const coverage = decision.allCoverage[recipeId]
    const questions = PRIORITIES[recipeId]
    if (!plain(coverage) || Object.keys(coverage).sort().join('|') !== [...questions].sort().join('|')) return 'unexpected question coverage'
    for (const questionId of questions) answers[`coverage:${recipeId}:${questionId}`] = coverage[questionId]
  }
  if (payload.practiceId) {
    answers.practice = decision.rawPractice
    answers.practice_need = decision.practiceNeed
    answers.practice_boundary = decision.practiceScope
  } else if (decision.practice !== null) return 'unexpected practice result'
  const response = { model: metadata.model, answers, usage: metadata.usage }
  const invalid = validateResponse(response, requestFor(payload))
  if (invalid) return invalid
  // Recompute policy locally rather than trusting a patch or recipe supplied by
  // the server. Keep the independently returned direct practice answer intact.
  const composed = decide(response)
  if (composed.practice?.choice !== decision.practice?.choice) return 'invalid composed practice outcome'
  if (!Number.isInteger(metadata.attempts) || metadata.attempts < 1 || metadata.attempts > 2) return 'invalid attempt count'
  for (const key of ['providerElapsedMs', 'serverElapsedMs']) if (!Number.isFinite(metadata[key]) || metadata[key] < 0) return 'invalid timing metadata'
  return null
}

const errorMessages = {
  unavailable: 'Suggestions are unavailable here. You can choose a workflow and keep going.',
  authentication: 'The local suggestion service needs a valid key. You can choose a workflow and keep going.',
  rate_limited: 'The suggestion service is busy. Try again later or choose a workflow.',
  local_rate_limited: 'Too many suggestions were requested. Wait a minute or choose a workflow.',
  timeout: 'The suggestion took too long. Your description is still here.',
  overloaded: 'The local suggestion service is busy. Try again shortly or choose a workflow.',
  invalid_response: 'The suggestion could not be checked. Your description is still here.',
  network: 'The suggestion service could not be reached. Your description is still here.',
  input: 'Describe the work you want to do before asking for a suggestion.',
  invalid_input: 'Check the description and recorded answers, then try again.',
  input_too_large: 'The description and answers are too long for this pilot. Shorten them or choose a workflow yourself.',
}

const errorAliases = {
  not_configured: 'unavailable', authentication_failed: 'authentication', timed_out: 'timeout', network_error: 'network',
  provider_unavailable: 'unavailable', response_too_large: 'invalid_response', redirect_rejected: 'invalid_response', provider_rejected: 'invalid_response',
  local_busy: 'overloaded', body_timed_out: 'timeout', invalid_json: 'invalid_response', forbidden_host: 'unavailable', forbidden_origin: 'unavailable', not_found: 'unavailable',
}

export function createJevAssistance({ fetchImpl = globalThis.fetch, onChange = () => {}, now = () => performance.now() } = {}) {
  let session = ++controllerIdentity
  let revision = 0
  let sequence = 0
  let status = 'idle'
  let draft = { userBrief: '', originalBrief: '', projectName: '', purpose: '', suppliedProjectAnswers: {}, manualRecipe: null, practiceId: null, includedPractices: [] }
  let purposeEdited = false
  let result = null
  let resultSnapshot = null
  let error = null
  let browserElapsedMs = null
  let suppression = {}
  let pendingAnswers = {}
  let editingAnswers = new Set()
  let pending = null
  let accepted = false

  const selectedRecipe = () => draft.manualRecipe || (recipeFor(result?.decision.intent.choice) ? result.decision.intent.choice : null)
  const reviewStatus = () => {
    if (draft.manualRecipe) return result ? 'reviewing' : 'manual'
    if (recipeFor(result?.decision.intent.choice)) return 'reviewing'
    if (result?.decision.intent.choice === 'outside-supported-recipes') return 'unsupported'
    if (result?.decision.intent.choice === 'unclear') return 'unclear'
    return 'idle'
  }
  const context = () => {
    const payload = buildAssistancePayload(draft, '', selectedRecipe())
    return { userBrief: payload.userBrief, suppliedProjectAnswers: payload.suppliedProjectAnswers, practiceId: draft.practiceId }
  }
  const currentConfig = () => selectedRecipe() ? composeAssistedProject(draft, selectedRecipe()) : null
  const assessmentFor = (recipeId, id) => {
    if (!result || resultSnapshot.userBrief !== draft.userBrief || (resultSnapshot.suppliedProjectAnswers[id] || '') !== (context().suppliedProjectAnswers[id] || '')) return null
    return result.decision.allCoverage[recipeId]?.[id] || null
  }
  const suppressed = (config, id) => suppression[id]?.text === getIntentAnswer(config, id).text

  function projectReview() {
    const recipeId = selectedRecipe()
    if (!recipeId) return { proposal: null, nextQuestion: null, answerReviews: [] }
    const recipe = recipeFor(recipeId)
    const config = currentConfig()
    const questions = recipe.questions.map(question => {
      const wording = getIntentQuestionWording(question)
      const recorded = getIntentAnswer(config, question.id)
      return { id: question.id, label: wording.label, hint: wording.hint, assessment: assessmentFor(recipeId, question.id)?.choice || 'unreviewed', recordedText: recorded.text, source: recorded.source, canKeepAnswer: present(recorded.text), suppressed: suppressed(config, question.id) }
    })
    const answerReviews = questions.filter(question => question.assessment === 'answered' && !present(question.recordedText)).map(question => ({ ...question, reviewText: draft.userBrief }))
    const nextQuestion = questions.find(question => question.assessment !== 'answered' && !(question.assessment === 'unreviewed' && present(question.recordedText) && !editingAnswers.has(question.id)) && !question.suppressed) || null
    const practiceFresh = result && Object.keys(pendingAnswers).length === 0 && resultSnapshot.userBrief === draft.userBrief && resultSnapshot.practiceId === draft.practiceId && JSON.stringify(resultSnapshot.suppliedProjectAnswers) === JSON.stringify(context().suppliedProjectAnswers)
    const practice = practiceFresh ? result.decision.practice : null
    return {
      proposal: {
        recipeId, recipe: { id: recipe.id, label: recipe.label, description: recipe.description },
        stages: recipe.stageIds.map(id => clone(CATALOG.stages.find(stage => stage.id === id))),
        intent: result ? clone(result.decision.intent) : null,
        manualOverride: Boolean(draft.manualRecipe),
        practice: practice ? clone(practice) : null,
        rawPractice: practiceFresh && result.decision.rawPractice ? clone(result.decision.rawPractice) : null,
        metadata: result ? clone(result.metadata) : null,
      }, nextQuestion, answerReviews,
    }
  }

  function getState() {
    const review = projectReview()
    return { status, draft: clone(draft), pendingAnswers: clone(pendingAnswers), ...review, deferredQuestions: clone(suppression), error: error ? clone(error) : null, metadata: result ? clone(result.metadata) : null, browserElapsedMs, revision, dirty: isDirty() }
  }

  function notify() { onChange(getState()) }

  function stopPending(nextStatus) {
    if (pending) pending.abort.abort()
    pending = null
    sequence += 1
    if (nextStatus) status = nextStatus
  }

  function edited({ clearResult = false } = {}) {
    revision += 1
    accepted = false
    error = null
    stopPending(reviewStatus())
    if (clearResult) {
      result = null
      resultSnapshot = null
      status = draft.manualRecipe ? 'manual' : 'outdated'
    }
  }

  function updateBrief(text) {
    assertText(text)
    if (text === draft.userBrief) return
    const hadSuggestion = Boolean(result || pending)
    draft.userBrief = text
    draft.originalBrief = text
    if (!purposeEdited) draft.purpose = text
    suppression = {}
    edited({ clearResult: true })
    if (!hadSuggestion && !draft.manualRecipe) status = 'idle'
    notify()
  }

  function updateName(text) {
    assertText(text)
    if (text === draft.projectName) return
    draft.projectName = text
    accepted = false
    notify()
  }

  function updatePurpose(text) {
    assertText(text)
    if (text === draft.purpose) return
    draft.purpose = text
    purposeEdited = true
    for (const id of ['user-need', 'desired-outcome']) delete suppression[id]
    edited()
    notify()
  }

  function setAnswer(id, text) {
    assertAnswer(id)
    assertText(text)
    if (pendingAnswers[id] === text) return
    pendingAnswers[id] = text
    editingAnswers.add(id)
    delete suppression[id]
    edited()
    notify()
  }

  function confirmAnswer(id, text) {
    assertAnswer(id)
    assertText(text)
    if (!present(text)) throw new Error('Enter wording to record, or continue without this answer.')
    draft.suppliedProjectAnswers[id] = text
    delete pendingAnswers[id]
    editingAnswers.delete(id)
    edited()
    suppression[id] = { text, kind: 'confirmed' }
    notify()
  }

  function suppressQuestion(id, kind) {
    assertAnswer(id)
    const config = currentConfig()
    if (!config) throw new Error('Choose a workflow before reviewing its questions.')
    const text = getIntentAnswer(config, id).text
    if (kind === 'kept' && !present(text)) throw new Error('There is no recorded answer to keep.')
    delete pendingAnswers[id]
    suppression[id] = { text, kind }
    editingAnswers.delete(id)
    edited()
    notify()
  }

  function chooseRecipe(id) {
    if (!recipeFor(id)) throw new Error('Choose a supported workflow.')
    if (draft.manualRecipe === id) return
    draft.manualRecipe = id
    edited()
    status = result ? 'reviewing' : 'manual'
    notify()
  }

  function choosePractice(id) {
    if (id !== null && !practiceIds.has(id)) throw new Error('Choose a supported practice.')
    if (draft.practiceId === id) return
    draft.practiceId = id
    edited()
    notify()
  }

  function setPracticeIncluded(included, practiceId = draft.practiceId) {
    if (typeof included !== 'boolean') throw new Error('Choose whether to include this practice.')
    const id = practiceId
    if (!practiceIds.has(id)) throw new Error('Choose a practice before adding it.')
    if (included && (id !== draft.practiceId || projectReview().proposal?.practice?.choice !== 'relevant')) throw new Error('Review a relevant practice suggestion before adding it.')
    draft.includedPractices = included ? [...new Set([...draft.includedPractices, id])] : draft.includedPractices.filter(item => item !== id)
    accepted = false
    notify()
  }

  function isDirty() {
    return !accepted && (present(draft.userBrief) || present(draft.projectName) || present(draft.purpose) || Object.values(draft.suppliedProjectAnswers).some(present) || Object.values(pendingAnswers).some(present) || draft.includedPractices.length > 0)
  }

  async function suggest({ newReview = false } = {}) {
    if (pending) return pending.promise
    if (!present(draft.userBrief)) {
      error = { code: 'input', message: errorMessages.input }
      status = 'failed'
      notify()
      return null
    }
    if (newReview) suppression = {}
    const requestSequence = ++sequence
    const requestRevision = revision
    const requestSession = session
    const snapshot = context()
    const payload = buildAssistancePayload(draft, `${session}-${requestSequence}`, selectedRecipe())
    const abort = new AbortController()
    const started = now()
    status = 'requesting'
    error = null
    accepted = false
    const current = { abort, promise: null }
    pending = current
    notify()
    const fresh = () => pending === current && sequence === requestSequence && revision === requestRevision && session === requestSession && !abort.signal.aborted
    current.promise = (async () => {
      try {
        const response = await fetchImpl('/api/jev/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atlas-Request': 'jev' }, body: JSON.stringify(payload), signal: abort.signal, cache: 'no-store', credentials: 'same-origin' })
        if (!fresh()) return null
        let envelope
        try { envelope = await response.json() }
        catch { throw { code: response.ok ? 'invalid_response' : 'unavailable' } }
        if (!fresh()) return null
        if (!response.ok) throw { code: plain(envelope.error) ? envelope.error.code : 'unavailable' }
        if (validateEnvelope(envelope, payload)) throw { code: 'invalid_response' }
        result = clone(envelope)
        resultSnapshot = snapshot
        browserElapsedMs = Math.max(0, now() - started)
        status = reviewStatus()
        pending = null
        notify()
        return getState()
      } catch (failure) {
        if (!fresh()) return null
        pending = null
        browserElapsedMs = Math.max(0, now() - started)
        const reported = errorAliases[failure?.code] || failure?.code
        const code = typeof reported === 'string' && Object.hasOwn(errorMessages, reported) ? reported : 'network'
        error = { code, message: errorMessages[code] }
        status = 'failed'
        notify()
        return null
      }
    })()
    return current.promise
  }

  function cancel() {
    stopPending('cancelled')
    error = null
    notify()
  }

  function invalidate(reason = 'outdated') {
    session += 1
    edited({ clearResult: true })
    status = reason === 'manual' ? 'manual' : 'outdated'
    notify()
  }

  function reset() {
    stopPending('idle')
    session = ++controllerIdentity
    revision = 0
    draft = { userBrief: '', originalBrief: '', projectName: '', purpose: '', suppliedProjectAnswers: {}, manualRecipe: null, practiceId: null, includedPractices: [] }
    result = resultSnapshot = error = null
    suppression = {}
    pendingAnswers = {}
    editingAnswers = new Set()
    browserElapsedMs = null
    purposeEdited = accepted = false
    notify()
  }

  function composeProject() {
    if (pending) throw new Error('Cancel or finish the suggestion before creating a draft.')
    const recipeId = selectedRecipe()
    if (!recipeId) throw new Error('Choose a workflow before creating a draft.')
    const config = composeAssistedProject(draft, recipeId)
    const deferredQuestions = Object.fromEntries(Object.entries(suppression).filter(([id, value]) => value.text === getIntentAnswer(config, id).text))
    const answerReviews = projectReview().answerReviews.map(question => ({ ...question, recipeId, originalBrief: draft.userBrief }))
    return { config, deferredQuestions: clone(deferredQuestions), answerReviews: clone(answerReviews) }
  }

  function markAccepted() {
    if (pending) throw new Error('The suggestion is still running.')
    accepted = true
    status = 'accepted'
    notify()
  }

  return { getState, updateBrief, updateName, updatePurpose, setAnswer, confirmAnswer, deferQuestion: id => suppressQuestion(id, 'deferred'), keepAnswer: id => suppressQuestion(id, 'kept'), chooseRecipe, choosePractice, setPracticeIncluded, suggest, cancel, invalidate, reset, isDirty, composeProject, accept: composeProject, markAccepted }
}
