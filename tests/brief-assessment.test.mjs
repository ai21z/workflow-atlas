import test from 'node:test'
import assert from 'node:assert/strict'
import { createPracticeAssessment, preparePracticeAssessment } from '../factory/brief-suggestions-view.mjs'
import { createRecipe } from '../factory/core.mjs'
import { MODEL, PROMPT_VERSION, CONTRACT_VERSION, DEFINITION_DIGEST, makeRequest, decide, allCoverage } from '../factory/jev-contract.mjs'

function envelope(body, outcome = 'relevant') {
  const request = makeRequest({ brief: body.userBrief, projectAnswers: body.suppliedProjectAnswers, practice: { id: body.practiceId } })
  const selected = { practice: outcome === 'insufficient-context' ? 'insufficient-context' : 'relevant', practice_need: outcome === 'insufficient-context' ? 'not-established' : 'established', practice_boundary: outcome === 'not-relevant' ? 'rejected' : 'not-rejected' }
  const answers = Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
    const choice = selected[id] || (id === 'intent' ? 'feature-delivery' : 'missing')
    assert.ok(Object.hasOwn(question.criteria, choice), `${id}: ${choice}`)
    return [id, { type: 'choice', choice, confidence: 1, probabilities: Object.fromEntries(Object.keys(question.criteria).map(key => [key, key === choice ? 1 : 0])) }]
  }))
  const raw = { model: MODEL, answers, usage: { input_tokens: 200, output_tokens: 0 } }
  return { requestId: body.requestId, decision: { ...decide(raw), allCoverage: allCoverage(raw) }, metadata: { model: MODEL, promptVersion: PROMPT_VERSION, contractVersion: CONTRACT_VERSION, definitionDigest: DEFINITION_DIGEST, attempts: 1, providerElapsedMs: 1, serverElapsedMs: 2, usage: raw.usage } }
}

function config() {
  const value = createRecipe('feature-delivery')
  value.project.purpose = 'Make the smallest necessary change to the request filter.'
  value.workflow.answers.acceptance = 'Open hides Closed requests.'
  value.workflow.answers['irrelevant-profile'] = 'CATALOGUE-SENTINEL-DO-NOT-SEND'
  value.sources = [{ title: 'CATALOGUE-SENTINEL-DO-NOT-SEND' }]
  return value
}

test('practice assessment sends only the user result, current supported answers and practice ID', async () => {
  const calls = []
  const value = config()
  const before = structuredClone(value)
  const controller = createPracticeAssessment({ fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body)
    calls.push({ url, body })
    return { ok: true, json: async () => envelope(body) }
  } })
  assert.equal(preparePracticeAssessment(value, 'minimum-change').brief, value.project.purpose)
  const disclosure = controller.disclosure(value, 'minimum-change')
  const result = await controller.assess(value, 'minimum-change', 'snapshot-1')
  assert.equal(result.outcome, 'relevant')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].url, '/api/jev/suggest')
  assert.deepEqual(Object.keys(calls[0].body).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
  assert.deepEqual(calls[0].body.suppliedProjectAnswers, disclosure.suppliedProjectAnswers)
  assert.ok(!JSON.stringify(calls).includes('CATALOGUE-SENTINEL'))
  assert.deepEqual(value, before)
  await controller.assess(value, 'minimum-change', 'snapshot-1')
  assert.equal(calls.length, 1, 'one successful assessment per current brief snapshot')
})

for (const outcome of ['not-relevant', 'insufficient-context']) test(`practice assessment retains the ${outcome} outcome`, async () => {
  const controller = createPracticeAssessment({ fetchImpl: async (_url, options) => ({ ok: true, json: async () => envelope(JSON.parse(options.body), outcome) }) })
  const result = await controller.assess(config(), 'minimum-change', outcome)
  assert.equal(result.outcome, outcome)
})

test('late assessment responses cannot survive changed text, imports or project choices', async () => {
  let resolve, call
  const controller = createPracticeAssessment({ fetchImpl: (_url, options) => new Promise(done => { call = options; resolve = done }) })
  const pending = controller.assess(config(), 'minimum-change', 'before-edit')
  assert.equal(controller.getState().status, 'requesting')
  controller.invalidate('after-edit')
  assert.equal(call.signal.aborted, true)
  resolve({ ok: true, json: async () => envelope(JSON.parse(call.body)) })
  assert.equal(await pending, null)
  assert.equal(controller.getState().status, 'idle')
  assert.equal(controller.getState().outcome, null)
})

test('invalid responses and transport failures preserve manual choices and permit an explicit retry', async () => {
  const value = config()
  const before = structuredClone(value)
  let calls = 0
  const controller = createPracticeAssessment({ fetchImpl: async (_url, options) => {
    calls += 1
    return { ok: true, json: async () => calls === 1 ? { forged: true } : envelope(JSON.parse(options.body)) }
  } })
  assert.equal((await controller.assess(value, 'minimum-change', 'snapshot')).status, 'failed')
  assert.equal((await controller.assess(value, 'minimum-change', 'snapshot')).outcome, 'relevant')
  assert.deepEqual(value, before)
})
