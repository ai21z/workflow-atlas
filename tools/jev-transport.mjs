import { MODEL, validateResponse } from '../factory/jev-contract.mjs'

export const PROVIDER_URL = 'https://api.typesafe.ai/v1/systemone'
export const TOTAL_DEADLINE_MS = 10_000
export const MAX_RESPONSE_BYTES = 256 * 1024
export const MAX_ATTEMPTS = 2

const transientStatuses = new Set([429, 500, 502, 503, 504, 529])

export class JevError extends Error {
  constructor(code, message, { status = 502, retryable = false } = {}) {
    super(message)
    this.name = 'JevError'
    this.code = code
    this.status = status
    this.retryable = retryable
  }
}

const cancelled = () => new JevError('cancelled', 'Suggestion cancelled.', { status: 499 })
const timedOut = () => new JevError('timed_out', 'The suggestion took too long. Try again or choose a workflow.', { status: 504, retryable: true })
const networkFailure = () => new JevError('network_error', 'TypeSafe could not be reached. Try again or choose a workflow.', { retryable: true })

export function retryAfterMs(value, now = Date.now()) {
  if (typeof value !== 'string' || !value.trim()) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return seconds >= 0 ? seconds * 1000 : null
  const date = Date.parse(value)
  return Number.isFinite(date) ? Math.max(0, date - now) : null
}

function waitFor(promise, signal) {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const onAbort = () => { cleanup(); reject(signal.reason) }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
    Promise.resolve(promise).then(value => { cleanup(); resolve(value) }, error => { cleanup(); reject(error) })
  })
}

function delay(ms, signal) {
  if (signal.aborted) return Promise.reject(signal.reason)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { cleanup(); resolve() }, ms)
    const onAbort = () => { clearTimeout(timer); cleanup(); reject(signal.reason) }
    const cleanup = () => signal.removeEventListener('abort', onAbort)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function discard(response) {
  try { response.body?.cancel().catch(() => {}) } catch {}
}

async function readBounded(response, maxBytes, signal) {
  const length = response.headers.get('content-length')
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > maxBytes)) {
    discard(response)
    throw new JevError('response_too_large', 'TypeSafe returned an unreadable response.')
  }
  if (!response.body) throw new JevError('invalid_response', 'TypeSafe returned an invalid response.')
  const reader = response.body.getReader()
  const chunks = []
  let bytes = 0
  try {
    while (true) {
      const { value, done } = await waitFor(reader.read(), signal)
      if (done) break
      bytes += value.byteLength
      if (bytes > maxBytes) throw new JevError('response_too_large', 'TypeSafe returned an unreadable response.')
      chunks.push(value)
    }
    const joined = new Uint8Array(bytes)
    let offset = 0
    for (const chunk of chunks) { joined.set(chunk, offset); offset += chunk.byteLength }
    let text
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(joined) } catch {
      throw new JevError('invalid_response', 'TypeSafe returned an invalid response.')
    }
    try { return JSON.parse(text) } catch {
      throw new JevError('invalid_response', 'TypeSafe returned an invalid response.')
    }
  } catch (error) {
    try { reader.cancel().catch(() => {}) } catch {}
    if (signal.aborted) throw signal.reason
    if (error instanceof JevError) throw error
    throw networkFailure()
  } finally {
    try { reader.releaseLock() } catch {}
  }
}

function httpFailure(status) {
  if (status === 401 || status === 403) return new JevError('authentication_failed', 'The local TypeSafe key was not accepted. Ask the owner to check its setup.', { status: 503 })
  if (status === 429) return new JevError('rate_limited', 'TypeSafe is busy. Try again later or choose a workflow.', { status: 429, retryable: true })
  if (status === 529 || status >= 500) return new JevError('provider_unavailable', 'TypeSafe is unavailable. Try again later or choose a workflow.', { status: 503, retryable: transientStatuses.has(status) })
  if (status >= 300 && status < 400) return new JevError('redirect_rejected', 'TypeSafe returned an unexpected redirect.')
  return new JevError('provider_rejected', 'TypeSafe could not accept this suggestion request.')
}

// Credentials and user text stay in this call. Normal operation does not log or save them.
export async function requestJev(request, {
  apiKey,
  signal,
  fetchImpl = globalThis.fetch,
  totalDeadlineMs = TOTAL_DEADLINE_MS,
  maxResponseBytes = MAX_RESPONSE_BYTES,
  now = () => performance.now(),
  epochNow = () => Date.now(),
} = {}) {
  if (typeof apiKey !== 'string' || !apiKey.trim()) throw new JevError('not_configured', 'Suggestions are not configured here. Choose a workflow to keep working.', { status: 503 })
  if (request?.model !== MODEL) throw new JevError('invalid_request', 'The suggestion request is not supported.', { status: 400 })
  if (!Number.isFinite(totalDeadlineMs) || totalDeadlineMs <= 0 || !Number.isSafeInteger(maxResponseBytes) || maxResponseBytes <= 0) throw new TypeError('Invalid transport limits')
  const started = now()
  const controller = new AbortController()
  const onCancel = () => controller.abort(cancelled())
  if (signal?.aborted) controller.abort(cancelled())
  else signal?.addEventListener('abort', onCancel, { once: true })
  const timer = setTimeout(() => controller.abort(timedOut()), totalDeadlineMs)
  let attempts = 0
  try {
    while (attempts < MAX_ATTEMPTS) {
      if (controller.signal.aborted) throw controller.signal.reason
      attempts += 1
      let response
      try {
        response = await waitFor(fetchImpl(PROVIDER_URL, {
          method: 'POST', redirect: 'manual', signal: controller.signal,
          headers: { Authorization: `Bearer ${apiKey.trim()}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(request),
        }), controller.signal)
      } catch {
        if (controller.signal.aborted) throw controller.signal.reason
        if (attempts < MAX_ATTEMPTS && totalDeadlineMs - (now() - started) > 150) {
          await delay(150, controller.signal)
          continue
        }
        throw networkFailure()
      }
      if (!response.ok) {
        const error = httpFailure(response.status)
        const retryDelay = retryAfterMs(response.headers.get('retry-after'), epochNow()) ?? 150
        discard(response)
        if (attempts < MAX_ATTEMPTS && transientStatuses.has(response.status) && retryDelay < totalDeadlineMs - (now() - started)) {
          await delay(retryDelay, controller.signal)
          continue
        }
        throw error
      }
      const contentType = response.headers.get('content-type') || ''
      if (!/^application\/(?:json|[a-z0-9.+-]+\+json)(?:\s*;|$)/i.test(contentType)) {
        discard(response)
        throw new JevError('invalid_response', 'TypeSafe returned an invalid response.')
      }
      const payload = await readBounded(response, maxResponseBytes, controller.signal)
      if (validateResponse(payload, request)) throw new JevError('invalid_response', 'TypeSafe returned an invalid response.')
      if (controller.signal.aborted || now() - started >= totalDeadlineMs) throw controller.signal.reason || timedOut()
      return { payload, metadata: { attempts, providerElapsedMs: Math.round((now() - started) * 100) / 100, usage: { input_tokens: payload.usage.input_tokens, output_tokens: payload.usage.output_tokens } } }
    }
    throw networkFailure()
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onCancel)
  }
}
