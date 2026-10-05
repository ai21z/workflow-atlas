import test from 'node:test'
import assert from 'node:assert/strict'
import { copyFile, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { createJevAssistance, composeAssistedProject, addSuggestedPractice, buildAssistancePayload } from '../factory/jev-assistance.mjs'
import { MODEL, PROMPT_VERSION, CONTRACT_VERSION, DEFINITION_DIGEST, makeRequest, decide, allCoverage } from '../factory/jev-contract.mjs'
import { CATALOG, compile, parseImport, serializeProject, createRecipe } from '../factory/core.mjs'
import { getIntentAnswer } from '../factory/intent.mjs'

function choice(question, selected) {
  return { type: 'choice', choice: selected, confidence: 1, probabilities: Object.fromEntries(Object.keys(question.criteria).map(id => [id, id === selected ? 1 : 0])) }
}

function envelope(body, selections = {}) {
  const request = makeRequest({ brief: body.userBrief, projectAnswers: body.suppliedProjectAnswers, ...(body.practiceId ? { practice: { id: body.practiceId } } : {}) })
  const answers = Object.fromEntries(Object.entries(request.questions).map(([id, question]) => [id, choice(question, selections[id] || (id === 'intent' ? 'feature-delivery' : id.startsWith('coverage:') ? 'missing' : id === 'practice' ? 'relevant' : id === 'practice_need' ? 'established' : 'not-rejected'))]))
  const raw = { model: MODEL, answers, usage: { input_tokens: 200, output_tokens: 0 } }
  return { requestId: body.requestId, decision: { ...decide(raw), allCoverage: allCoverage(raw) }, metadata: { model: MODEL, promptVersion: PROMPT_VERSION, contractVersion: CONTRACT_VERSION, definitionDigest: DEFINITION_DIGEST, attempts: 1, providerElapsedMs: 50, serverElapsedMs: 55, usage: raw.usage } }
}

function response(value, ok = true) { return { ok, json: async () => value } }
const coveredFeature = { 'coverage:feature-delivery:user-need': 'answered', 'coverage:feature-delivery:acceptance': 'answered', 'coverage:feature-delivery:affected': 'answered' }
function instant(selections = {}) {
  const calls = []
  const controller = createJevAssistance({ fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body)
    calls.push({ url, options, body })
    return response(envelope(body, selections))
  } })
  return { controller, calls }
}

function delayed() {
  const calls = []
  const controller = createJevAssistance({ fetchImpl: (url, options) => new Promise(resolve => calls.push({ options, body: JSON.parse(options.body), resolve })) })
  return { controller, calls }
}

async function expandedCatalogAssistance(t) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'atlas-jev-catalog-test-'))
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(directory).startsWith('atlas-jev-catalog-test-'))
    await rm(directory, { recursive: true, force: true })
  })
  const factory = new URL('../factory/', import.meta.url)
  const modules = (await readdir(factory)).filter(name => name.endsWith('.mjs') && name !== 'catalog.mjs')
  await Promise.all(modules.map(name => copyFile(new URL(name, factory), path.join(directory, name))))
  const catalog = structuredClone(CATALOG)
  const feature = catalog.recipes.find(recipe => recipe.id === 'feature-delivery')
  feature.questions.push({ id: 'delivery-owner', label: 'Who owns delivery?', hint: 'Name the owner.' })
  catalog.recipes.push({ ...structuredClone(feature), id: 'manual-only', label: 'Manual workflow', questions: [{ id: 'manual-details', label: 'What should be recorded?', hint: 'Record the manual plan.' }] })
  await writeFile(path.join(directory, 'catalog.mjs'), `export * from ${JSON.stringify(new URL('catalog.mjs', factory).href)}\nexport const CATALOG = ${JSON.stringify(catalog)}\n`)
  return import(pathToFileURL(path.join(directory, 'jev-assistance.mjs')).href)
}

test('catalogue additions preserve frozen responses and keep additional answers outside inference', async t => {
  const { createJevAssistance: createExpandedAssistance } = await expandedCatalogAssistance(t)
  const calls = []
  const controller = createExpandedAssistance({ fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body)
    calls.push(body)
    return response(envelope(body, coveredFeature))
  } })
  controller.updateBrief('Add saved searches.')
  await controller.suggest()
  assert.equal(controller.getState().error, null)
  assert.equal(controller.getState().proposal.recipeId, 'feature-delivery')
  assert.equal(controller.getState().nextQuestion.id, 'delivery-owner')
  assert.equal(controller.getState().nextQuestion.assessment, 'unreviewed')
  controller.confirmAnswer('delivery-owner', 'The release owner.')
  await controller.suggest()
  assert.deepEqual(calls.at(-1).suppliedProjectAnswers, {})
  assert.equal(controller.getState().error, null)
  assert.equal(controller.composeProject().config.workflow.answers['delivery-owner'], 'The release owner.')
  assert.throws(() => controller.confirmAnswer('invented-question', 'An unsupported answer.'), /supported workflow question/)
})

test('a catalogue recipe outside the inference profile stays manually selectable and answerable', async t => {
  const { createJevAssistance: createExpandedAssistance } = await expandedCatalogAssistance(t)
  let calls = 0
  const controller = createExpandedAssistance({ fetchImpl: async () => { calls += 1; throw new Error('Manual authoring must not request inference.') } })
  controller.updateBrief('Describe a manually chosen workflow.')
  controller.chooseRecipe('manual-only')
  assert.equal(controller.getState().status, 'manual')
  assert.equal(controller.getState().proposal.intent, null)
  assert.equal(controller.getState().nextQuestion.assessment, 'unreviewed')
  controller.setAnswer('manual-details', 'The supplied manual plan.')
  controller.confirmAnswer('manual-details', controller.getState().pendingAnswers['manual-details'])
  const { config } = controller.composeProject()
  assert.equal(config.workflow.recipe, 'manual-only')
  assert.equal(config.workflow.answers['manual-details'], 'The supplied manual plan.')
  assert.equal(calls, 0)
})

test('catalogue membership does not authorize additional inference recipe or question IDs', async t => {
  const { createJevAssistance: createExpandedAssistance } = await expandedCatalogAssistance(t)
  const corruptions = [
    value => { value.decision.allCoverage['manual-only'] = {} },
    value => { value.decision.allCoverage['feature-delivery']['delivery-owner'] = structuredClone(value.decision.allCoverage['feature-delivery'].acceptance) },
    value => { delete value.decision.allCoverage['feature-delivery'].acceptance },
    value => { value.decision.intent.choice = 'manual-only' },
  ]
  for (const corrupt of corruptions) {
    const controller = createExpandedAssistance({ fetchImpl: async (_url, options) => {
      const value = envelope(JSON.parse(options.body))
      corrupt(value)
      return response(value)
    } })
    controller.updateBrief('Keep this description.')
    await controller.suggest()
    assert.equal(controller.getState().proposal, null)
    assert.equal(controller.getState().error.code, 'invalid_response')
    assert.equal(controller.getState().draft.userBrief, 'Keep this description.')
  }
})

test('assistance only calls on explicit submit and supplies the exact bounded context shape', async () => {
  const { controller, calls } = instant()
  controller.updateBrief('Add a saved search feature.')
  controller.updateName('Saved search')
  controller.getState()
  assert.equal(calls.length, 0)
  assert.equal(controller.getState().status, 'idle')
  await controller.suggest()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/jev/suggest')
  assert.deepEqual(calls[0].body, { requestId: calls[0].body.requestId, userBrief: 'Add a saved search feature.', suppliedProjectAnswers: {} })
  assert.equal(calls[0].options.headers['X-Atlas-Request'], 'jev')
  assert.equal(controller.getState().status, 'reviewing')
  assert.equal(controller.getState().proposal.recipeId, 'feature-delivery')
  assert.equal(controller.isDirty(), true)
})

test('earlier selected guidance stays deliberate and can be removed after a rejecting assessment', async () => {
  let reject = false
  const controller = createJevAssistance({ fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body)
    return response(envelope(body, { ...coveredFeature, ...(reject ? { practice_boundary: 'rejected' } : {}) }))
  } })
  controller.updateBrief('Add a saved search feature.')
  controller.choosePractice('specification-first')
  await controller.suggest()
  controller.setPracticeIncluded(true)
  controller.updateBrief('Add saved searches. Omit Requirements before implementation.')
  reject = true
  await controller.suggest()
  assert.equal(controller.getState().proposal.practice.choice, 'not-relevant')
  assert.ok(controller.composeProject().config.practices.includes('specification-first'))
  controller.setPracticeIncluded(false, 'specification-first')
  assert.ok(!controller.composeProject().config.practices.includes('specification-first'))
})

test('model coverage does not fill exported answers, explicit edited wording does and the original remains', async () => {
  const { controller } = instant(coveredFeature)
  const brief = 'Add saved searches. Selecting Save retains the name and filters. Scope is the existing results view.'
  controller.updateBrief(brief)
  await controller.suggest()
  const state = controller.getState()
  assert.deepEqual(state.answerReviews.map(question => question.id), ['acceptance', 'affected'])
  assert.equal(state.answerReviews[0].reviewText, brief)
  assert.equal(state.nextQuestion, null)
  let { config } = controller.accept()
  assert.equal(getIntentAnswer(config, 'user-need').text, brief)
  assert.equal(getIntentAnswer(config, 'acceptance').text, '')
  let requirements = compile(config).files.find(file => file.path === 'templates/REQUIREMENTS.md').content
  assert.match(requirements, /UNRESOLVED/)
  controller.confirmAnswer('acceptance', 'Selecting Save retains the name and filters.')
  controller.updatePurpose('Add saved searches.')
  config = controller.accept().config
  assert.equal(config.workflow.answers.acceptance, 'Selecting Save retains the name and filters.')
  assert.ok(config.workflow.notes.requirements.includes(brief))
  requirements = compile(config).files.find(file => file.path === 'templates/REQUIREMENTS.md').content
  assert.ok(requirements.includes(config.workflow.answers.acceptance))
  assert.equal(config.workflow.answers.affected, undefined)
  const reopened = parseImport(serializeProject(config))
  assert.deepEqual(reopened, config)
  assert.equal(reopened.model.name, '')
})

test('repair expected behavior never inherits the purpose and confirmed wording remains separate', async () => {
  const { controller } = instant({ intent: 'bugfix', 'coverage:bugfix:expected': 'answered', 'coverage:bugfix:observed': 'answered', 'coverage:bugfix:impact': 'answered' })
  controller.updateBrief('Repair a saved search that loses its date filter. An approved example requires keeping that filter.')
  await controller.suggest()
  assert.equal(controller.getState().answerReviews[0].id, 'expected')
  assert.equal(getIntentAnswer(controller.accept().config, 'expected').text, '')
  controller.confirmAnswer('expected', 'An approved saved search retains the date filter.')
  assert.equal(controller.accept().config.workflow.answers.expected, 'An approved saved search retains the date filter.')
})

test('deferral and keep answer remain different from model assessment and reset only on related edits', async () => {
  const { controller } = instant({ 'coverage:feature-delivery:user-need': 'answered' })
  controller.updateBrief('Build saved searches.')
  controller.confirmAnswer('acceptance', 'unknown')
  await controller.suggest({ newReview: true })
  assert.equal(controller.getState().nextQuestion.id, 'acceptance')
  assert.equal(controller.getState().nextQuestion.recordedText, 'unknown')
  controller.keepAnswer('acceptance')
  controller.deferQuestion('affected')
  controller.updateName('Another project name')
  controller.confirmAnswer('observed', 'An unrelated recorded bug observation.')
  assert.equal(controller.getState().deferredQuestions.acceptance.kind, 'kept')
  assert.equal(controller.getState().deferredQuestions.affected.kind, 'deferred')
  assert.equal(controller.getState().nextQuestion, null)
  const accepted = controller.accept()
  assert.deepEqual(accepted.deferredQuestions.affected, { text: '', kind: 'deferred' })
  assert.equal(accepted.config.workflow.answers.acceptance, 'unknown')
  assert.equal(accepted.config.workflow.answers.affected, undefined)
  controller.setAnswer('acceptance', '')
  assert.equal(controller.getState().deferredQuestions.acceptance, undefined)
  assert.equal(controller.getState().deferredQuestions.affected.kind, 'deferred')
  assert.equal(controller.getState().nextQuestion.id, 'acceptance')
})

test('creation is available with unresolved fields and remains dirty until the caller confirms acceptance', () => {
  const { controller } = instant()
  controller.updateBrief('Investigate a proposal.')
  controller.chooseRecipe('feasibility')
  controller.deferQuestion('current-work')
  const accepted = controller.accept()
  assert.equal(accepted.config.workflow.recipe, 'feasibility')
  assert.equal(accepted.config.project.name, 'Untitled workflow')
  assert.equal(accepted.config.workflow.answers['current-work'], undefined)
  assert.equal(controller.isDirty(), true)
  controller.markAccepted()
  assert.equal(controller.isDirty(), false)
  controller.updateName('A name after acceptance')
  assert.equal(controller.isDirty(), true)
})

test('manual setup skips the equivalent recorded goal and an edited goal is supplied only for its active outcome slot', async () => {
  const { controller, calls } = instant()
  controller.updateBrief('Investigate turning configuration generation into a backend API.')
  controller.chooseRecipe('feasibility')
  controller.deferQuestion('current-work')
  assert.equal(controller.getState().nextQuestion.id, 'decision-boundary')
  controller.updatePurpose('Compare the existing manual process with a local API pilot.')
  await controller.suggest()
  assert.equal(calls[0].body.suppliedProjectAnswers['desired-outcome'], 'Compare the existing manual process with a local API pilot.')
  assert.equal(calls[0].body.suppliedProjectAnswers['user-need'], undefined)
  const config = controller.accept().config
  assert.equal(config.workflow.answers['desired-outcome'], undefined)
  assert.equal(getIntentAnswer(config, 'desired-outcome').text, 'Compare the existing manual process with a local API pilot.')
  assert.ok(config.workflow.notes['current-process'].includes('Investigate turning configuration generation into a backend API.'))
})

test('duplicate submits make one request and typing discards a late result even when fetch ignores abort', async () => {
  const { controller, calls } = delayed()
  controller.updateBrief('Add saved searches.')
  const first = controller.suggest()
  const duplicate = controller.suggest()
  assert.equal(calls.length, 1)
  assert.throws(() => controller.accept(), /Cancel or finish/)
  controller.updateBrief('Investigate whether saved searches are useful.')
  assert.equal(calls[0].options.signal.aborted, true)
  calls[0].resolve(response(envelope(calls[0].body)))
  assert.equal(await first, null)
  assert.equal(await duplicate, null)
  assert.equal(controller.getState().proposal, null)
  assert.equal(controller.getState().draft.userBrief, 'Investigate whether saved searches are useful.')
})

test('cancellation, new request and session replacement prevent older work from being applied', async () => {
  const { controller, calls } = delayed()
  controller.updateBrief('Add saved searches.')
  const first = controller.suggest()
  controller.cancel()
  assert.equal(controller.getState().status, 'cancelled')
  assert.equal(controller.isDirty(), true)
  const second = controller.suggest()
  calls[0].resolve(response(envelope(calls[0].body, { intent: 'bugfix' })))
  assert.equal(await first, null)
  calls[1].resolve(response(envelope(calls[1].body)))
  await second
  assert.equal(controller.getState().proposal.recipeId, 'feature-delivery')
  const third = controller.suggest()
  controller.invalidate('pack-opened')
  calls[2].resolve(response(envelope(calls[2].body)))
  assert.equal(await third, null)
  assert.equal(controller.getState().proposal, null)
  assert.equal(controller.getState().draft.userBrief, 'Add saved searches.')
  controller.reset()
  assert.equal(controller.getState().status, 'idle')
  assert.equal(controller.getState().draft.userBrief, '')
  assert.equal(controller.isDirty(), false)
})

test('manual recipe selection wins while retaining the raw model intent and using that recipe coverage', async () => {
  const { controller } = instant({ intent: 'feature-delivery', 'coverage:feasibility:current-work': 'answered', 'coverage:feasibility:desired-outcome': 'answered' })
  controller.updateBrief('Study the options before deciding to implement.')
  await controller.suggest()
  controller.chooseRecipe('feasibility')
  assert.equal(controller.getState().proposal.recipeId, 'feasibility')
  assert.equal(controller.getState().proposal.intent.choice, 'feature-delivery')
  assert.equal(controller.getState().proposal.manualOverride, true)
  assert.equal(controller.getState().nextQuestion.id, 'decision-boundary')
  await controller.suggest()
  assert.equal(controller.getState().proposal.recipeId, 'feasibility')
  assert.equal(controller.accept().config.workflow.recipe, 'feasibility')
})

test('choosing a manual workflow during a request aborts it and keeps the entered description', async () => {
  const { controller, calls } = delayed()
  controller.updateBrief('Add saved searches.')
  const run = controller.suggest()
  controller.chooseRecipe('bugfix')
  calls[0].resolve(response(envelope(calls[0].body)))
  assert.equal(await run, null)
  assert.equal(controller.getState().proposal.recipeId, 'bugfix')
  assert.equal(controller.getState().proposal.intent, null)
  assert.equal(controller.accept().config.project.purpose, 'Add saved searches.')
})

test('a late response body is discarded after the context changes', async () => {
  let resolveJson
  const controller = createJevAssistance({ fetchImpl: async (_url, options) => ({ ok: true, json: () => new Promise(resolve => { resolveJson = () => resolve(envelope(JSON.parse(options.body))) }) }) })
  controller.updateBrief('Build a feature.')
  const run = controller.suggest()
  await Promise.resolve()
  controller.setAnswer('acceptance', 'The new entered answer wins.')
  resolveJson()
  assert.equal(await run, null)
  assert.equal(controller.getState().proposal, null)
  assert.equal(controller.getState().draft.suppliedProjectAnswers.acceptance, undefined)
  assert.equal(controller.getState().pendingAnswers.acceptance, 'The new entered answer wins.')
})

test('unclear and outside-supported intents never force a workflow or erase the brief', async () => {
  for (const intent of ['unclear', 'outside-supported-recipes']) {
    const { controller } = instant({ intent })
    controller.updateBrief('An open-ended description.')
    await controller.suggest()
    assert.equal(controller.getState().status, intent === 'unclear' ? 'unclear' : 'unsupported')
    assert.equal(controller.getState().proposal, null)
    assert.equal(controller.getState().draft.userBrief, 'An open-ended description.')
    assert.throws(() => controller.accept(), /Choose a workflow/)
    controller.updatePurpose('A shorter description for later review.')
    assert.equal(controller.getState().status, intent === 'unclear' ? 'unclear' : 'unsupported')
    controller.chooseRecipe('feasibility')
    assert.equal(controller.accept().config.project.purpose, 'A shorter description for later review.')
  }
})

test('the optional practice is not auto added and separate allowlisted application supports repair and studies', async () => {
  for (const [intent, practiceId] of [['bugfix', 'specification-first'], ['feasibility', 'minimum-change']]) {
    const { controller } = instant({ intent })
    controller.updateBrief('Inspect the existing software and plan the concrete change.')
    controller.choosePractice(practiceId)
    await controller.suggest()
    assert.equal(controller.getState().proposal.practice.choice, 'relevant')
    assert.ok(!controller.accept().config.practices.includes(practiceId))
    controller.setPracticeIncluded(true)
    assert.equal(controller.accept().config.practices.filter(id => id === practiceId).length, 1)
    controller.setPracticeIncluded(false)
    await controller.suggest()
    assert.ok(!controller.accept().config.practices.includes(practiceId))
  }
  const original = createRecipe('bugfix')
  original.workflow.answers.expected = 'A manually supplied contract.'
  const added = addSuggestedPractice(original, 'specification-first')
  assert.equal(added.workflow.answers.expected, original.workflow.answers.expected)
  assert.deepEqual(original.practices, ['portable-behavior', 'progressive-context'])
  assert.throws(() => addSuggestedPractice(original, 'unreviewed-practice'), /supported/)
})

test('explicit practice rejection takes priority over positive need and cannot be added as a suggestion', async () => {
  const { controller } = instant({ practice: 'relevant', practice_need: 'established', practice_boundary: 'rejected' })
  controller.updateBrief('Build saved searches. Omit Requirements before implementation.')
  controller.choosePractice('specification-first')
  await controller.suggest()
  assert.equal(controller.getState().proposal.rawPractice.choice, 'relevant')
  assert.equal(controller.getState().proposal.practice.choice, 'not-relevant')
  assert.throws(() => controller.setPracticeIncluded(true), /relevant/)
  assert.ok(!controller.accept().config.practices.includes('specification-first'))
})

test('invalid envelopes never expose a proposal and unsafe provider text is not shown in errors', async () => {
  const corruptions = [
    value => { value.requestId = 'wrong request' },
    value => { value.metadata.model = 'jev-latest' },
    value => { value.metadata.definitionDigest = 'different' },
    value => { delete value.decision.allCoverage.bugfix },
    value => { value.decision.allCoverage['feature-delivery'].acceptance.choice = 'invented' },
    value => { value.metadata.usage.input_tokens = -1 },
    value => { value.metadata.attempts = 999 },
  ]
  for (const corrupt of corruptions) {
    const controller = createJevAssistance({ fetchImpl: async (_url, options) => {
      const value = envelope(JSON.parse(options.body))
      corrupt(value)
      return response(value)
    } })
    controller.updateBrief('Keep my entered description.')
    await controller.suggest()
    assert.equal(controller.getState().proposal, null)
    assert.equal(controller.getState().error.code, 'invalid_response')
    assert.equal(controller.getState().draft.userBrief, 'Keep my entered description.')
  }
  const controller = createJevAssistance({ fetchImpl: async () => response({ error: { code: 'authentication', message: 'Secret raw prompt and provider details' } }, false) })
  controller.updateBrief('Keep this too.')
  await controller.suggest()
  assert.equal(controller.getState().error.code, 'authentication')
  assert.ok(!controller.getState().error.message.includes('Secret'))
})

test('static server fallback and empty input preserve a usable manual route', async () => {
  let calls = 0
  const controller = createJevAssistance({ fetchImpl: async () => { calls += 1; return { ok: false, json: async () => { throw new Error('HTML directory listing') } } } })
  await controller.suggest()
  assert.equal(calls, 0)
  assert.equal(controller.getState().error.code, 'input')
  controller.updateBrief('My exact goal.')
  await controller.suggest()
  assert.equal(controller.getState().error.code, 'unavailable')
  controller.chooseRecipe('feature-delivery')
  assert.equal(controller.accept().config.project.purpose, 'My exact goal.')
})

test('typing an optional answer does not hide the field before its record action', async () => {
  const { controller } = instant({ 'coverage:feature-delivery:user-need': 'answered' })
  controller.updateBrief('Build saved searches.')
  await controller.suggest()
  assert.equal(controller.getState().nextQuestion.id, 'acceptance')
  controller.setAnswer('acceptance', 'S')
  assert.equal(controller.getState().nextQuestion.id, 'acceptance')
  controller.setAnswer('acceptance', 'Save keeps the entered filters.')
  assert.equal(controller.getState().nextQuestion.id, 'acceptance')
  controller.confirmAnswer('acceptance', 'Save keeps the entered filters.')
  assert.equal(controller.getState().nextQuestion.id, 'affected')
})

test('unrecorded optional wording is excluded from requests and every generated file after skipping or direct creation', async () => {
  for (const skip of [false, true]) {
    const { controller, calls } = instant({ 'coverage:feature-delivery:user-need': 'answered' })
    controller.updateBrief('Add a CSV export button to the monthly sales report.')
    await controller.suggest()
    const pending = 'DRAFT ONLY. Maybe export up to 500 rows. I have not confirmed this.'
    controller.setAnswer('acceptance', pending)
    assert.equal(controller.getState().pendingAnswers.acceptance, pending)
    assert.equal(controller.getState().nextQuestion.canKeepAnswer, false)
    assert.throws(() => controller.keepAnswer('acceptance'), /no recorded answer/)
    assert.equal(controller.getState().draft.suppliedProjectAnswers.acceptance, undefined)
    if (skip) {
      controller.deferQuestion('acceptance')
      assert.equal(controller.getState().pendingAnswers.acceptance, undefined)
      assert.deepEqual(controller.getState().deferredQuestions.acceptance, { text: '', kind: 'deferred' })
    }
    await controller.suggest()
    assert.equal(calls.at(-1).body.suppliedProjectAnswers.acceptance, undefined)
    const { config } = controller.composeProject()
    assert.equal(config.workflow.answers.acceptance, undefined)
    assert.ok(!serializeProject(config).includes(pending))
    assert.ok(compile(config).files.every(file => !file.content.includes(pending)))
  }
})

test('keeping, skipping and directly creating with edited wording preserve the earlier recorded answer', async () => {
  for (const action of ['keep', 'defer', 'create']) {
    const { controller } = instant({ 'coverage:feature-delivery:user-need': 'answered' })
    controller.updateBrief('Add a CSV export button.')
    controller.confirmAnswer('acceptance', 'Export contains the current filtered rows.')
    await controller.suggest({ newReview: true })
    controller.setAnswer('acceptance', 'Unconfirmed change to the exported rows.')
    assert.equal(controller.getState().nextQuestion.recordedText, 'Export contains the current filtered rows.')
    assert.equal(controller.getState().nextQuestion.canKeepAnswer, true)
    if (action === 'keep') controller.keepAnswer('acceptance')
    if (action === 'defer') controller.deferQuestion('acceptance')
    const config = controller.composeProject().config
    assert.equal(config.workflow.answers.acceptance, 'Export contains the current filtered rows.')
    assert.ok(compile(config).files.every(file => !file.content.includes('Unconfirmed change')))
    if (action !== 'create') assert.equal(controller.getState().pendingAnswers.acceptance, undefined)
  }
})

test('recording commits pending wording once, refreshes context and permits a new practice check', async () => {
  const { controller, calls } = instant({ 'coverage:feature-delivery:user-need': 'answered' })
  controller.updateBrief('Add saved searches.')
  controller.choosePractice('specification-first')
  await controller.suggest()
  assert.equal(controller.getState().proposal.practice.choice, 'relevant')
  controller.setAnswer('acceptance', 'Selecting Save retains the current filters.')
  assert.equal(controller.getState().proposal.practice, null)
  assert.throws(() => controller.setPracticeIncluded(true), /relevant/)
  controller.confirmAnswer('acceptance', controller.getState().pendingAnswers.acceptance)
  assert.equal(controller.getState().pendingAnswers.acceptance, undefined)
  assert.equal(controller.getState().draft.suppliedProjectAnswers.acceptance, 'Selecting Save retains the current filters.')
  assert.equal(controller.getState().proposal.practice, null)
  await controller.suggest()
  assert.equal(calls.at(-1).body.suppliedProjectAnswers.acceptance, 'Selecting Save retains the current filters.')
  assert.equal(controller.getState().proposal.practice.choice, 'relevant')
})

test('draft creation carries exact unconfirmed description reviews without creating recorded answers', async () => {
  const { controller } = instant({ intent: 'feasibility', 'coverage:feasibility:current-work': 'answered', 'coverage:feasibility:desired-outcome': 'answered', 'coverage:feasibility:decision-boundary': 'answered' })
  const description = 'An engineer creates the configuration today. Compare a guided service with that process.'
  controller.updateBrief(description)
  await controller.suggest()
  controller.updatePurpose('Assess a guided configuration service.')
  const composed = controller.composeProject()
  assert.equal(composed.config.workflow.answers['current-work'], undefined)
  const review = composed.answerReviews.find(item => item.id === 'current-work')
  assert.equal(review.recipeId, 'feasibility')
  assert.equal(review.reviewText, description)
  assert.equal(review.originalBrief, description)
  review.reviewText = 'Modified returned snapshot.'
  assert.equal(controller.composeProject().answerReviews.find(item => item.id === 'current-work').reviewText, description)
})

test('deferral cancels an in-flight review and cannot be reversed by its late response', async () => {
  const { controller, calls } = delayed()
  controller.updateBrief('Build saved searches.')
  controller.chooseRecipe('feature-delivery')
  const run = controller.suggest()
  controller.deferQuestion('acceptance')
  assert.equal(calls[0].options.signal.aborted, true)
  calls[0].resolve(response(envelope(calls[0].body)))
  assert.equal(await run, null)
  assert.equal(controller.getState().deferredQuestions.acceptance.kind, 'deferred')
  assert.equal(controller.getState().proposal.intent, null)
})

test('server failure categories keep safe actionable messages and preserve the description', async () => {
  for (const [serverCode, expected] of [['not_configured', 'unavailable'], ['authentication_failed', 'authentication'], ['timed_out', 'timeout'], ['rate_limited', 'rate_limited'], ['local_rate_limited', 'local_rate_limited'], ['local_busy', 'overloaded'], ['input_too_large', 'input_too_large']]) {
    const controller = createJevAssistance({ fetchImpl: async () => response({ error: { code: serverCode, message: 'Do not reflect this body' } }, false) })
    controller.updateBrief('The description stays here.')
    await controller.suggest()
    assert.equal(controller.getState().error.code, expected)
    assert.ok(!controller.getState().error.message.includes('Do not reflect'))
    if (serverCode === 'local_rate_limited') assert.match(controller.getState().error.message, /Wait a minute/)
    assert.equal(controller.getState().draft.userBrief, 'The description stays here.')
  }
})

test('pure draft composition preserves entered text without inventing answers or configuring a model', () => {
  const draft = { userBrief: '  Exact original words.\nSecond line.  ', projectName: '', purpose: '  Exact original words.\nSecond line.  ', suppliedProjectAnswers: {}, practiceId: null, includedPractices: [] }
  const project = composeAssistedProject(draft, 'feasibility')
  assert.equal(project.project.purpose, draft.userBrief)
  assert.deepEqual(project.workflow.notes, {})
  assert.deepEqual(project.workflow.answers, {})
  assert.equal(project.runtime.enabled, false)
  assert.deepEqual(project.model, { name: '', version: '', budget: '', notes: '' })
  assert.deepEqual(buildAssistancePayload(draft, 'opaque'), { requestId: 'opaque', userBrief: draft.userBrief, suppliedProjectAnswers: {} })
  assert.throws(() => composeAssistedProject({ ...draft, suppliedProjectAnswers: { arbitrary: 'value' } }, 'feasibility'), /supported workflow question/)
})
