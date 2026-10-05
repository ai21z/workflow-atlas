import test from 'node:test'
import assert from 'node:assert/strict'
import { makeRequest, MODEL } from '../factory/jev-contract.mjs'
import { requestJev, retryAfterMs, JevError, PROVIDER_URL } from '../tools/jev-transport.mjs'

const request = () => makeRequest({ brief: 'Add a saved search feature.', projectAnswers: {} })
function payloadFor(input) {
  return { model: MODEL, answers: Object.fromEntries(Object.entries(input.questions).map(([id, question]) => {
    const options = Object.keys(question.criteria)
    const choice = id === 'intent' ? 'feature-delivery' : 'missing'
    return [id, { type: 'choice', choice, confidence: 0.9, probabilities: Object.fromEntries(options.map(option => [option, option === choice ? 1 : 0])) }]
  })), usage: { input_tokens: 120, output_tokens: 0 } }
}
const jsonResponse = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } })
const expectCode = code => error => error instanceof JevError && error.code === code

test('transport pins its endpoint and model, validates data and returns safe timing metadata', async () => {
  const input = request()
  const expected = payloadFor(input)
  let calls = 0
  const result = await requestJev(input, { apiKey: ' synthetic-only-key ', fetchImpl: async (url, options) => {
    calls += 1
    assert.equal(url, PROVIDER_URL)
    assert.equal(options.redirect, 'manual')
    assert.equal(options.headers.Authorization, 'Bearer synthetic-only-key')
    assert.deepEqual(JSON.parse(options.body), input)
    assert.ok(options.signal instanceof AbortSignal)
    return jsonResponse(expected)
  } })
  assert.equal(calls, 1)
  assert.deepEqual(result.payload, expected)
  assert.equal(result.metadata.attempts, 1)
  assert.ok(result.metadata.providerElapsedMs >= 0)
  assert.deepEqual(result.metadata.usage, { input_tokens: 120, output_tokens: 0 })
})

test('missing key, unexpected model and prior cancellation never make a provider call', async () => {
  let calls = 0
  const fetchImpl = async () => { calls += 1; throw new Error('Should not be called') }
  await assert.rejects(requestJev(request(), { apiKey: '', fetchImpl }), expectCode('not_configured'))
  await assert.rejects(requestJev({ ...request(), model: 'jev-latest' }, { apiKey: 'synthetic', fetchImpl }), expectCode('invalid_request'))
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(requestJev(request(), { apiKey: 'synthetic', fetchImpl, signal: controller.signal }), expectCode('cancelled'))
  assert.equal(calls, 0)
})

test('authentication and invalid provider input do not retry or reveal response bodies', async () => {
  for (const [status, code] of [[401, 'authentication_failed'], [403, 'authentication_failed'], [422, 'provider_rejected'], [302, 'redirect_rejected']]) {
    let calls = 0
    await assert.rejects(requestJev(request(), { apiKey: 'private-test-key', fetchImpl: async () => {
      calls += 1
      return new Response('private-test-key and submitted-user-description', { status })
    } }), error => {
      assert.equal(error.code, code)
      assert.doesNotMatch(error.message, /private-test-key|submitted-user-description/)
      return true
    })
    assert.equal(calls, 1)
  }
})

test('a transient failure has at most one retry and counts both attempts in elapsed time', async () => {
  const input = request()
  let calls = 0
  const result = await requestJev(input, { apiKey: 'synthetic', fetchImpl: async () => {
    calls += 1
    return calls === 1 ? new Response('', { status: 503, headers: { 'Retry-After': '0' } }) : jsonResponse(payloadFor(input))
  } })
  assert.equal(calls, 2)
  assert.equal(result.metadata.attempts, 2)
  calls = 0
  await assert.rejects(requestJev(input, { apiKey: 'synthetic', fetchImpl: async () => {
    calls += 1
    return new Response('', { status: 429, headers: { 'Retry-After': '0' } })
  } }), expectCode('rate_limited'))
  assert.equal(calls, 2)
})

test('Retry-After supports seconds and dates, and never waits outside the remaining budget', async () => {
  const epoch = Date.parse('2026-10-05T12:00:00Z')
  assert.equal(retryAfterMs('1.5', epoch), 1500)
  assert.equal(retryAfterMs('Mon, 05 Oct 2026 12:00:02 GMT', epoch), 2000)
  assert.equal(retryAfterMs('Mon, 05 Oct 2026 11:59:58 GMT', epoch), 0)
  assert.equal(retryAfterMs('not a date', epoch), null)
  assert.equal(retryAfterMs('-1', epoch), null)
  let calls = 0
  await assert.rejects(requestJev(request(), { apiKey: 'synthetic', totalDeadlineMs: 40, epochNow: () => epoch, fetchImpl: async () => {
    calls += 1
    return new Response('', { status: 429, headers: { 'Retry-After': 'Mon, 05 Oct 2026 12:00:02 GMT' } })
  } }), expectCode('rate_limited'))
  assert.equal(calls, 1)
})

test('one total deadline stops a provider fetch even when an injected fetch ignores abort', async () => {
  let calls = 0
  await assert.rejects(requestJev(request(), { apiKey: 'synthetic', totalDeadlineMs: 25, fetchImpl: () => {
    calls += 1
    return new Promise(() => {})
  } }), expectCode('timed_out'))
  assert.equal(calls, 1)
})

test('cancellation aborts the provider signal and does not trigger a retry', async () => {
  const controller = new AbortController()
  let providerSignal
  let calls = 0
  const pending = requestJev(request(), { apiKey: 'synthetic', signal: controller.signal, fetchImpl: (_url, options) => {
    calls += 1
    providerSignal = options.signal
    return new Promise(() => {})
  } })
  controller.abort()
  await assert.rejects(pending, expectCode('cancelled'))
  assert.equal(providerSignal.aborted, true)
  assert.equal(calls, 1)
})

test('the deadline also bounds streamed response reading and is not renewed after a retry', async () => {
  const input = request()
  let calls = 0
  await assert.rejects(requestJev(input, { apiKey: 'synthetic', totalDeadlineMs: 40, fetchImpl: async () => {
    calls += 1
    if (calls === 1) return new Response('', { status: 503, headers: { 'Retry-After': '0.01' } })
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new TextEncoder().encode('{')) } }), { headers: { 'Content-Type': 'application/json' } })
  } }), expectCode('timed_out'))
  assert.equal(calls, 2)
})

test('malformed successful responses are rejected without retry or silent repair', async () => {
  const input = request()
  const valid = payloadFor(input)
  const changed = structuredClone(valid)
  changed.answers.intent.probabilities['feature-delivery'] = 0.5
  for (const response of [
    new Response('not JSON', { headers: { 'Content-Type': 'application/json' } }),
    new Response('{}', { headers: { 'Content-Type': 'text/html' } }),
    jsonResponse({ ...valid, model: 'jev-latest' }),
    jsonResponse({ ...valid, answers: [] }),
    jsonResponse({ ...valid, usage: { input_tokens: -1, output_tokens: 0 } }),
    jsonResponse(changed),
  ]) {
    let calls = 0
    await assert.rejects(requestJev(input, { apiKey: 'synthetic', fetchImpl: async () => { calls += 1; return response } }), expectCode('invalid_response'))
    assert.equal(calls, 1)
  }
})

test('response size is enforced both from Content-Length and while streaming', async () => {
  for (const response of [
    new Response('{}', { headers: { 'Content-Type': 'application/json', 'Content-Length': '1000' } }),
    new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(40)); controller.enqueue(new Uint8Array(40)); controller.close() } }), { headers: { 'Content-Type': 'application/json' } }),
  ]) {
    let calls = 0
    await assert.rejects(requestJev(request(), { apiKey: 'synthetic', maxResponseBytes: 64, fetchImpl: async () => { calls += 1; return response } }), expectCode('response_too_large'))
    assert.equal(calls, 1)
  }
})

test('network exceptions are retried only once and their arbitrary content is hidden', async () => {
  let calls = 0
  await assert.rejects(requestJev(request(), { apiKey: 'private-test-key', fetchImpl: async () => {
    calls += 1
    throw new Error('private-test-key submitted-user-description')
  } }), error => {
    assert.equal(error.code, 'network_error')
    assert.doesNotMatch(error.message, /private-test-key|submitted-user-description/)
    return true
  })
  assert.equal(calls, 2)
})
