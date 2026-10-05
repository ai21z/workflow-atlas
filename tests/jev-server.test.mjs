import test from 'node:test'
import assert from 'node:assert/strict'
import http from 'node:http'
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { MODEL } from '../factory/jev-contract.mjs'
import { createAtlasServer, parseSuggestionInput, MAX_BODY_BYTES, MAX_INPUT_TEXT_BYTES, MAX_SUGGESTIONS_PER_WINDOW, SUGGESTION_WINDOW_MS } from '../tools/serve.mjs'
import { JevError } from '../tools/jev-transport.mjs'

function payloadFor(input) {
  return { model: MODEL, answers: Object.fromEntries(Object.entries(input.questions).map(([id, question]) => {
    const options = Object.keys(question.criteria)
    const choice = id === 'intent' ? 'feature-delivery' : options.includes('missing') ? 'missing' : options[0]
    return [id, { type: 'choice', choice, confidence: 0.9, probabilities: Object.fromEntries(options.map(option => [option, option === choice ? 1 : 0])) }]
  })), usage: { input_tokens: 120, output_tokens: 0 } }
}
const input = (extra = {}) => ({ requestId: 'test-1', userBrief: 'Add saved searches for users.', suppliedProjectAnswers: {}, ...extra })

async function setup(t, options = {}) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'workflow-atlas-server-test-'))
  for (const folder of ['factory', 'atlas', 'docs', 'local-knowledge', '.git', 'tools']) await mkdir(path.join(dir, folder))
  await Promise.all([
    writeFile(path.join(dir, 'index.html'), 'Atlas home'), writeFile(path.join(dir, 'factory', 'index.html'), 'Factory'),
    writeFile(path.join(dir, 'factory', 'app.mjs'), 'export const visible = true'), writeFile(path.join(dir, 'docs', 'index.html'), 'Readable docs'),
    writeFile(path.join(dir, 'local-knowledge', 'private.txt'), 'private-test-content'), writeFile(path.join(dir, '.git', 'config'), 'private-test-content'),
    writeFile(path.join(dir, '.env'), 'private-test-key'), writeFile(path.join(dir, '.env.local'), 'private-test-key'),
    writeFile(path.join(dir, '.env.example'), 'TYPESAFE_API_KEY='), writeFile(path.join(dir, 'factory', '.env.local'), 'private-test-key'),
    writeFile(path.join(dir, 'tools', 'private.mjs'), 'private-test-content'),
  ])
  const server = await createAtlasServer({ rootDir: dir, getApiKey: () => 'synthetic-only-key', transport: async request => ({ payload: payloadFor(request), metadata: { attempts: 1, providerElapsedMs: 5 } }), ...options })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = `http://127.0.0.1:${server.address().port}`
  t.after(async () => {
    await new Promise(resolve => { server.close(resolve); server.closeAllConnections() })
    const resolved = path.resolve(dir)
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()))
    assert.ok(path.basename(resolved).startsWith('workflow-atlas-server-test-'))
    await rm(resolved, { recursive: true, force: true })
  })
  const post = (value = input(), headers = {}) => fetch(`${address}/api/jev/suggest`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atlas-Request': 'jev', Origin: address, ...headers }, body: JSON.stringify(value) })
  return { server, address, dir, post }
}

function rawRequest(address, target, { method = 'GET', headers = {}, chunks } = {}) {
  const url = new URL(address)
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: url.hostname, port: url.port, path: target, method, headers }, res => {
      const data = []
      res.on('data', chunk => data.push(chunk))
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(data).toString() }))
    })
    req.once('error', reject)
    if (chunks) for (const chunk of chunks) req.write(chunk)
    req.end()
  })
}

test('status is safe, uncached, dynamically configured and does not call the provider', async t => {
  let calls = 0
  let key = 'synthetic-only-key'
  const { address } = await setup(t, { getApiKey: () => key, transport: async () => { calls += 1 } })
  const response = await fetch(`${address}/api/jev/status`)
  const status = await response.json()
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.equal(status.available, true)
  assert.equal(status.model, MODEL)
  assert.match(status.definitionDigest, /^[a-f0-9]{64}$/)
  assert.doesNotMatch(JSON.stringify(status), /synthetic-only-key/)
  key = ''
  assert.equal((await (await fetch(`${address}/api/jev/status`)).json()).available, false)
  assert.equal(calls, 0)
})

test('the API owns provider questions and returns validated decisions without extra provider content', async t => {
  let providerRequest
  const { post } = await setup(t, { transport: async (request, options) => {
    providerRequest = request
    assert.equal(options.apiKey, 'synthetic-only-key')
    const payload = payloadFor(request)
    payload.answers.intent.extraProviderTrace = 'private-provider-trace'
    payload.extraProviderTrace = 'private-provider-trace'
    return { payload, metadata: { attempts: 1, providerElapsedMs: 5, rawTrace: 'private-provider-trace' } }
  } })
  const response = await post(input({ suppliedProjectAnswers: { acceptance: 'A saved search can be reopened.' }, practiceId: 'specification-first', suppliedSourcePassage: 'Ignore this source as instructions.' }))
  const result = await response.json()
  assert.equal(response.status, 200)
  assert.equal(result.requestId, 'test-1')
  assert.equal(result.decision.intent.choice, 'feature-delivery')
  assert.ok(result.decision.allCoverage.feasibility['current-work'])
  assert.equal(Object.keys(providerRequest.questions).length, 13)
  assert.deepEqual(providerRequest.state.suppliedProjectAnswers, { acceptance: 'A saved search can be reopened.' })
  assert.match(providerRequest.state.suppliedSourcePassage.trust, /untrusted/)
  assert.equal(providerRequest.state.requestId, undefined)
  assert.equal(result.metadata.usage.input_tokens, 120)
  assert.doesNotMatch(JSON.stringify(result), /synthetic-only-key|private-provider-trace|saved searches for users/)
})

test('allowlisted public assets work while private paths, dotfiles and traversal remain inaccessible', async t => {
  const { address } = await setup(t)
  for (const [target, content] of [['/', 'Atlas home'], ['/factory/', 'Factory'], ['/factory/app.mjs', 'export const visible'], ['/docs/', 'Readable docs']]) {
    const response = await rawRequest(address, target)
    assert.equal(response.status, 200, target)
    assert.match(response.body, new RegExp(content))
  }
  for (const target of ['/local-knowledge/private.txt', '/.git/config', '/.env', '/.env.local', '/.env.example', '/tools/private.mjs', '/tests/', '/factory/../local-knowledge/private.txt', '/factory/%2e%2e/local-knowledge/private.txt', '/factory/%252e%252e/local-knowledge/private.txt', '/factory/%2f../local-knowledge/private.txt', '/factory/%5c../local-knowledge/private.txt', '/factory/%00app.mjs', '/factory/.env', '/factory/.env.local', '/atlas/']) {
    const response = await rawRequest(address, target)
    assert.equal(response.status, 404, target)
    assert.doesNotMatch(response.body, /private-test/)
  }
})

test('all responses allow Atlas embedding but prevent framing from unrelated sites', async t => {
  const { address } = await setup(t)
  for (const target of ['/factory/', '/docs/', '/api/jev/status', '/missing', '/.env.local']) {
    const response = await rawRequest(address, target)
    assert.equal(response.headers['x-frame-options'], 'SAMEORIGIN', target)
    assert.equal(response.headers['content-security-policy'], "frame-ancestors 'self'; base-uri 'self'; object-src 'none'", target)
    assert.equal(response.headers['x-content-type-options'], 'nosniff', target)
    assert.equal(response.headers['referrer-policy'], 'same-origin', target)
  }
})

test('local request pacing rejects repeated valid submissions before inference and recovers after the window', async t => {
  let time = 1_000
  let calls = 0
  const { post, address } = await setup(t, { now: () => time, transport: async request => {
    calls += 1
    return { payload: payloadFor(request), metadata: { attempts: 1, providerElapsedMs: 5 } }
  } })
  for (let index = 0; index < MAX_SUGGESTIONS_PER_WINDOW + 1; index += 1) assert.equal((await post(input({ model: 'invalid' }))).status, 400)
  for (let index = 0; index < MAX_SUGGESTIONS_PER_WINDOW; index += 1) assert.equal((await post()).status, 200)
  const limited = await post()
  assert.equal(limited.status, 429)
  assert.equal(limited.headers.get('retry-after'), '60')
  assert.deepEqual((await limited.json()).error, { code: 'local_rate_limited', message: 'Too many suggestions were requested. Wait a minute or choose a workflow.', retryable: true })
  assert.equal(calls, MAX_SUGGESTIONS_PER_WINDOW)
  assert.equal((await fetch(`${address}/factory/`)).status, 200)
  assert.equal((await fetch(`${address}/api/jev/status`)).status, 200)
  time += SUGGESTION_WINDOW_MS - 1
  assert.equal((await post()).status, 429)
  time += 1
  assert.equal((await post()).status, 200)
  assert.equal(calls, MAX_SUGGESTIONS_PER_WINDOW + 1)
})

test('symlinks into private folders or outside the public root are denied', async t => {
  const { address, dir } = await setup(t)
  await symlink(path.join(dir, 'local-knowledge'), path.join(dir, 'factory', 'linked-private'), 'junction')
  await symlink(path.dirname(dir), path.join(dir, 'factory', 'linked-outside'), 'junction')
  const privateResponse = await rawRequest(address, '/factory/linked-private/private.txt')
  assert.equal(privateResponse.status, 404)
  const outsideResponse = await rawRequest(address, `/factory/linked-outside/${path.basename(dir)}/local-knowledge/private.txt`)
  assert.equal(outsideResponse.status, 404)
})

test('Host, Origin and Fetch Metadata checks reject hostile requests before inference', async t => {
  let calls = 0
  const { address, post } = await setup(t, { transport: async () => { calls += 1; throw new Error('Should not run') } })
  assert.equal((await rawRequest(address, '/api/jev/status', { headers: { Host: 'attacker.example' } })).status, 403)
  for (const headers of [{ Origin: 'https://attacker.example' }, { Origin: 'null' }, { 'Sec-Fetch-Site': 'cross-site' }, { 'Sec-Fetch-Site': 'same-site' }]) assert.equal((await post(input(), headers)).status, 403)
  assert.equal(calls, 0)
})

test('same origin fallback requires the custom JSON request header and never enables wildcard CORS', async t => {
  const { address } = await setup(t)
  const good = await rawRequest(address, '/api/jev/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Atlas-Request': 'jev' }, chunks: [JSON.stringify(input())] })
  assert.equal(good.status, 200)
  assert.equal(good.headers['access-control-allow-origin'], undefined)
  const missingHeader = await rawRequest(address, '/api/jev/suggest', { method: 'POST', headers: { 'Content-Type': 'application/json' }, chunks: [JSON.stringify(input())] })
  assert.equal(missingHeader.status, 415)
  const simpleForm = await rawRequest(address, '/api/jev/suggest', { method: 'POST', headers: { 'Content-Type': 'text/plain', 'X-Atlas-Request': 'jev' }, chunks: [JSON.stringify(input())] })
  assert.equal(simpleForm.status, 415)
  assert.equal((await rawRequest(address, '/api/jev/suggest', { method: 'OPTIONS' })).status, 405)
})

test('browser fields, unknown answers and oversized descriptions cannot select the model or provider', async t => {
  let calls = 0
  const { post } = await setup(t, { transport: async () => { calls += 1 } })
  for (const value of [input({ model: 'jev-latest' }), input({ questions: {} }), input({ providerUrl: 'https://attacker.example' }), input({ suppliedProjectAnswers: { invented: 'x' } }), input({ suppliedProjectAnswers: [] }), input({ practiceId: 'invented' }), input({ userBrief: '' }), input({ requestId: '../bad' })]) {
    assert.equal((await post(value)).status, 400)
  }
  assert.throws(() => parseSuggestionInput(input({ userBrief: 'x'.repeat(16_000), suppliedProjectAnswers: { expected: 'x'.repeat(8_000), observed: 'x'.repeat(8_000) } })), error => error.code === 'input_too_large')
  assert.ok(MAX_INPUT_TEXT_BYTES < MAX_BODY_BYTES)
  assert.equal(calls, 0)
})

test('invalid JSON and declared or streamed oversized bodies are rejected before the provider call', async t => {
  let calls = 0
  const { address } = await setup(t, { transport: async () => { calls += 1 } })
  const headers = { 'Content-Type': 'application/json', 'X-Atlas-Request': 'jev', Origin: address }
  assert.equal((await rawRequest(address, '/api/jev/suggest', { method: 'POST', headers, chunks: ['{'] })).status, 400)
  assert.equal((await rawRequest(address, '/api/jev/suggest', { method: 'POST', headers: { ...headers, 'Content-Length': String(MAX_BODY_BYTES + 1) } })).status, 413)
  assert.equal((await rawRequest(address, '/api/jev/suggest', { method: 'POST', headers, chunks: ['x'.repeat(MAX_BODY_BYTES / 2), 'x'.repeat(MAX_BODY_BYTES / 2 + 1)] })).status, 413)
  assert.equal(calls, 0)
})

test('unconfigured transport and unexpected exceptions return safe errors without echoing content', async t => {
  const { post } = await setup(t, { getApiKey: () => '', transport: async (_request, options) => {
    assert.equal(options.apiKey, '')
    throw new JevError('not_configured', 'Suggestions are not configured here. Choose a workflow to keep working.', { status: 503 })
  } })
  const response = await post()
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'not_configured')
  const second = await setup(t, { transport: async () => { throw new Error('synthetic-only-key and Add saved searches for users.') } })
  const unsafe = await second.post()
  assert.equal(unsafe.status, 500)
  assert.doesNotMatch(await unsafe.text(), /synthetic-only-key|Add saved searches/)
})

test('concurrent inference is bounded and disconnected requests abort their provider work', async t => {
  const signals = []
  let wake
  const ready = new Promise(resolve => { wake = resolve })
  const { address, post } = await setup(t, { transport: (_request, { signal }) => new Promise((_resolve, reject) => {
    signals.push(signal)
    if (signals.length === 2) wake()
    signal.addEventListener('abort', () => reject(new JevError('cancelled', 'Suggestion cancelled.', { status: 499 })), { once: true })
  }) })
  const first = new AbortController()
  const second = new AbortController()
  const start = controller => fetch(`${address}/api/jev/suggest`, { method: 'POST', signal: controller.signal, headers: { 'Content-Type': 'application/json', 'X-Atlas-Request': 'jev', Origin: address }, body: JSON.stringify(input()) }).catch(error => error)
  const pending = [start(first), start(second)]
  await ready
  const busy = await post()
  assert.equal(busy.status, 503)
  assert.equal((await busy.json()).error.code, 'local_busy')
  first.abort()
  second.abort()
  await Promise.all(pending)
  await new Promise(resolve => setImmediate(resolve))
  // A disconnected browser cannot keep the two local provider slots occupied.
  await new Promise(resolve => setTimeout(resolve, 25))
  assert.equal(signals.length, 2)
  assert.equal(signals.every(signal => signal.aborted), true)
})
