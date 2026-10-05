import http from 'node:http'
import { readFile, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { MODEL, PROMPT_VERSION, CONTRACT_VERSION, DEFINITION_DIGEST, ANSWER_IDS, SUPPORTED_PRACTICES, makeRequest, validateResponse, decide, allCoverage } from '../factory/jev-contract.mjs'
import { JevError, requestJev } from './jev-transport.mjs'

export const DEFAULT_PORT = 8780
export const MAX_BODY_BYTES = 64 * 1024
export const MAX_INPUT_TEXT_BYTES = 24 * 1024
export const MAX_CONCURRENT_REQUESTS = 2
export const MAX_SUGGESTIONS_PER_WINDOW = 30
export const SUGGESTION_WINDOW_MS = 60_000
export const BODY_DEADLINE_MS = 5_000
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const publicFolders = new Set(['factory', 'atlas', 'docs'])
const mime = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
}
const plainObject = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype

export function parseSuggestionInput(value) {
  const allowed = new Set(['requestId', 'userBrief', 'suppliedProjectAnswers', 'practiceId', 'suppliedSourcePassage'])
  const invalid = () => { throw new JevError('invalid_input', 'Check the description and answers, then try again.', { status: 400 }) }
  if (!plainObject(value) || Object.keys(value).some(key => !allowed.has(key))) invalid()
  if (typeof value.requestId !== 'string' || !/^[a-z0-9_-]{1,80}$/i.test(value.requestId)) invalid()
  if (typeof value.userBrief !== 'string' || !value.userBrief.trim() || value.userBrief.length > 16_000) invalid()
  if (!plainObject(value.suppliedProjectAnswers)) invalid()
  let textBytes = Buffer.byteLength(value.userBrief)
  const answers = {}
  for (const [id, text] of Object.entries(value.suppliedProjectAnswers)) {
    if (!ANSWER_IDS.includes(id) || typeof text !== 'string' || text.length > 8_000) invalid()
    answers[id] = text
    textBytes += Buffer.byteLength(text)
  }
  if (value.practiceId !== undefined && (typeof value.practiceId !== 'string' || !SUPPORTED_PRACTICES.includes(value.practiceId))) invalid()
  if (value.suppliedSourcePassage !== undefined) {
    if (typeof value.suppliedSourcePassage !== 'string' || value.suppliedSourcePassage.length > 8_000) invalid()
    textBytes += Buffer.byteLength(value.suppliedSourcePassage)
  }
  if (textBytes > MAX_INPUT_TEXT_BYTES) throw new JevError('input_too_large', 'This description is too long. Shorten it and try again.', { status: 413 })
  return {
    requestId: value.requestId,
    item: { brief: value.userBrief, projectAnswers: answers,
      ...(value.practiceId ? { practice: { id: value.practiceId } } : {}),
      ...(value.suppliedSourcePassage !== undefined ? { untrustedSource: value.suppliedSourcePassage } : {}),
    },
  }
}

function readBody(req, signal) {
  const length = req.headers['content-length']
  if (length !== undefined && (!/^\d+$/.test(length) || Number(length) > MAX_BODY_BYTES)) return Promise.reject(new JevError('input_too_large', 'This request is too large. Shorten the description and try again.', { status: 413 }))
  return new Promise((resolve, reject) => {
    const chunks = []
    let bytes = 0
    const timer = setTimeout(() => finish(new JevError('body_timed_out', 'The request could not be read. Try again.', { status: 408, retryable: true })), BODY_DEADLINE_MS)
    const cleanup = () => {
      clearTimeout(timer)
      req.removeListener('data', onData)
      req.removeListener('end', onEnd)
      req.removeListener('error', onError)
      signal.removeEventListener('abort', onAbort)
    }
    const finish = error => {
      cleanup()
      if (error) { req.resume(); reject(error) }
      else {
        try {
          const text = new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks, bytes))
          resolve(JSON.parse(text))
        } catch { reject(new JevError('invalid_json', 'The request could not be read. Try again.', { status: 400 })) }
      }
    }
    const onData = chunk => {
      bytes += chunk.length
      if (bytes > MAX_BODY_BYTES) finish(new JevError('input_too_large', 'This request is too large. Shorten the description and try again.', { status: 413 }))
      else chunks.push(chunk)
    }
    const onEnd = () => finish()
    const onError = () => finish(new JevError('invalid_json', 'The request could not be read. Try again.', { status: 400 }))
    const onAbort = () => finish(new JevError('cancelled', 'Suggestion cancelled.', { status: 499 }))
    if (signal.aborted) { finish(new JevError('cancelled', 'Suggestion cancelled.', { status: 499 })); return }
    req.on('data', onData)
    req.once('end', onEnd)
    req.once('error', onError)
    signal.addEventListener('abort', onAbort, { once: true })
  })
}

function writeJson(res, status, body) {
  if (res.destroyed || res.writableEnded) return
  const bytes = Buffer.from(JSON.stringify(body))
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': bytes.length, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...(status === 413 || status === 408 ? { Connection: 'close' } : {}) })
  res.end(bytes)
}

function fail(res, error) {
  const safe = error instanceof JevError ? error : new JevError('internal_error', 'The suggestion could not be completed. Choose a workflow or try again.', { status: 500 })
  writeJson(res, safe.status, { error: { code: safe.code, message: safe.message, retryable: safe.retryable } })
}

function privatePath(parts) {
  return parts.some(part => part.startsWith('.') || ['local-knowledge', 'node_modules', 'tools', 'tests'].includes(part.toLowerCase()))
}

function allowedPublicRelative(relative) {
  const parts = relative.split(path.sep)
  return !relative.startsWith('..') && !path.isAbsolute(relative) && !privatePath(parts) && (relative === 'index.html' || publicFolders.has(parts[0]))
}

async function staticAsset(rootDir, rawPath) {
  // Decode once and reject encoded separators before URL normalization can erase traversal.
  if (!rawPath.startsWith('/') || /%(?:2f|5c|00)/i.test(rawPath)) return null
  let decoded
  try { decoded = decodeURIComponent(rawPath) } catch { return null }
  if (/[\\%\u0000-\u001f\u007f]/.test(decoded)) return null
  const parts = decoded.slice(1).split('/').filter(Boolean)
  if (parts.some(part => part === '.' || part === '..') || privatePath(parts)) return null
  if (decoded === '/') parts.push('index.html')
  if (!(parts.length === 1 && parts[0] === 'index.html') && !publicFolders.has(parts[0])) return null
  let candidate = path.join(rootDir, ...parts)
  try {
    if ((await stat(candidate)).isDirectory()) candidate = path.join(candidate, 'index.html')
    const resolved = await realpath(candidate)
    if (!allowedPublicRelative(path.relative(rootDir, resolved))) return null
    const info = await stat(resolved)
    if (!info.isFile() || !mime[path.extname(resolved).toLowerCase()]) return null
    return { file: resolved, type: mime[path.extname(resolved).toLowerCase()] }
  } catch { return null }
}

export async function createAtlasServer({ rootDir = root, getApiKey = () => process.env.TYPESAFE_API_KEY, transport = requestJev, now = () => performance.now() } = {}) {
  const resolvedRoot = await realpath(rootDir)
  let active = 0
  const recentSuggestions = []
  const server = http.createServer(async (req, res) => {
    // The Knowledge map is embedded by Atlas. Unrelated sites must not frame paid actions.
    res.setHeader('Content-Security-Policy', "frame-ancestors 'self'; base-uri 'self'; object-src 'none'")
    res.setHeader('X-Frame-Options', 'SAMEORIGIN')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('Referrer-Policy', 'same-origin')
    const started = now()
    const port = server.address()?.port
    const host = `127.0.0.1:${port}`
    const origin = `http://${host}`
    const rawPath = (req.url || '').split('?')[0]
    const isApi = rawPath.startsWith('/api/')
    const hostCount = req.rawHeaders.filter((_, index) => index % 2 === 0 && req.rawHeaders[index].toLowerCase() === 'host').length
    if (hostCount !== 1 || req.headers.host !== host) { writeJson(res, 403, { error: { code: 'forbidden_host', message: 'Open Atlas at its local address.', retryable: false } }); return }
    if (isApi) {
      if ((req.headers.origin !== undefined && req.headers.origin !== origin) || (req.headers['sec-fetch-site'] !== undefined && req.headers['sec-fetch-site'] !== 'same-origin')) {
        writeJson(res, 403, { error: { code: 'forbidden_origin', message: 'Open Atlas at its local address.', retryable: false } }); return
      }
      if (rawPath === '/api/jev/status' && req.method === 'GET') {
        try {
          const key = getApiKey()
          writeJson(res, 200, { available: typeof key === 'string' && Boolean(key.trim()), model: MODEL, promptVersion: PROMPT_VERSION, contractVersion: CONTRACT_VERSION, definitionDigest: DEFINITION_DIGEST })
        } catch { fail(res, new JevError('not_configured', 'Suggestions are not configured here. Choose a workflow to keep working.', { status: 503 })) }
        return
      }
      if (rawPath !== '/api/jev/suggest') { writeJson(res, 404, { error: { code: 'not_found', message: 'This assistance endpoint is not available.', retryable: false } }); return }
      if (req.method !== 'POST') { writeJson(res, 405, { error: { code: 'method_not_allowed', message: 'Use the suggestion action in Atlas.', retryable: false } }); return }
      if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '') || req.headers['x-atlas-request'] !== 'jev') {
        writeJson(res, 415, { error: { code: 'invalid_content_type', message: 'Use the suggestion action in Atlas.', retryable: false } }); return
      }
      if (active >= MAX_CONCURRENT_REQUESTS) { writeJson(res, 503, { error: { code: 'local_busy', message: 'Another suggestion is running. Try again shortly or choose a workflow.', retryable: true } }); return }
      active += 1
      const controller = new AbortController()
      const onDisconnect = () => { if (!res.writableEnded) controller.abort() }
      req.once('aborted', onDisconnect)
      res.once('close', onDisconnect)
      try {
        const { requestId, item } = parseSuggestionInput(await readBody(req, controller.signal))
        const admittedAt = now()
        while (recentSuggestions.length && admittedAt - recentSuggestions[0] >= SUGGESTION_WINDOW_MS) recentSuggestions.shift()
        if (recentSuggestions.length >= MAX_SUGGESTIONS_PER_WINDOW) {
          res.setHeader('Retry-After', String(Math.max(1, Math.ceil((SUGGESTION_WINDOW_MS - (admittedAt - recentSuggestions[0])) / 1000))))
          throw new JevError('local_rate_limited', 'Too many suggestions were requested. Wait a minute or choose a workflow.', { status: 429, retryable: true })
        }
        // Bound repeated submissions as well as concurrent work. This is local pacing, not authentication or a spend cap.
        recentSuggestions.push(admittedAt)
        const request = makeRequest(item)
        const result = await transport(request, { apiKey: getApiKey(), signal: controller.signal })
        if (controller.signal.aborted) return
        if (!result || validateResponse(result.payload, request)) throw new JevError('invalid_response', 'TypeSafe returned an invalid response.')
        const attempts = result.metadata?.attempts
        const elapsed = result.metadata?.providerElapsedMs
        if (!Number.isInteger(attempts) || attempts < 1 || attempts > 2 || !Number.isFinite(elapsed) || elapsed < 0) throw new JevError('invalid_response', 'TypeSafe returned an invalid response.')
        // Return only the requested decision fields, never additional provider response content.
        const safePayload = { model: MODEL, answers: Object.fromEntries(Object.entries(result.payload.answers).map(([id, answer]) => [id, {
          type: answer.type, choice: answer.choice, confidence: answer.confidence, probabilities: { ...answer.probabilities },
        }])), usage: { input_tokens: result.payload.usage.input_tokens, output_tokens: result.payload.usage.output_tokens } }
        writeJson(res, 200, {
          requestId,
          decision: { ...decide(safePayload), allCoverage: allCoverage(safePayload) },
          metadata: { model: MODEL, promptVersion: PROMPT_VERSION, contractVersion: CONTRACT_VERSION, definitionDigest: DEFINITION_DIGEST, attempts, providerElapsedMs: elapsed, serverElapsedMs: Math.round((now() - started) * 100) / 100, usage: { input_tokens: result.payload.usage.input_tokens, output_tokens: result.payload.usage.output_tokens } },
        })
      } catch (error) { fail(res, error) } finally {
        active -= 1
        req.removeListener('aborted', onDisconnect)
        res.removeListener('close', onDisconnect)
      }
      return
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Use GET to open Atlas.'); return }
    const asset = await staticAsset(resolvedRoot, rawPath)
    if (!asset) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' }); res.end('Page not found.'); return }
    try {
      const bytes = await readFile(asset.file)
      res.writeHead(200, { 'Content-Type': asset.type, 'Content-Length': bytes.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin' })
      res.end(req.method === 'HEAD' ? undefined : bytes)
    } catch { if (!res.headersSent) { res.writeHead(404); res.end('Page not found.') } }
  })
  server.maxHeadersCount = 40
  server.headersTimeout = 5_000
  server.requestTimeout = 15_000
  server.keepAliveTimeout = 5_000
  return server
}

export async function startLocalServer({ port = DEFAULT_PORT, ...options } = {}) {
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Use Node.js 22 or newer to run the local Atlas server.')
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Choose a port between 1 and 65535.')
  const server = await createAtlasServer(options)
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve) })
  return server
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  let port = DEFAULT_PORT
  const args = process.argv.slice(2)
  if (args.length) {
    if (args.length !== 2 || args[0] !== '--port' || !/^\d+$/.test(args[1])) { process.stderr.write('Usage: node tools/serve.mjs [--port 8781]\n'); process.exitCode = 1 }
    else port = Number(args[1])
  }
  if (!process.exitCode) {
    try {
      const server = await startLocalServer({ port })
      process.stdout.write(`Workflow Atlas: http://127.0.0.1:${port}/factory/\n`)
      process.stdout.write('Projects stay in the tab. Suggestions use the server TypeSafe key when configured.\n')
      const stop = () => { server.close(() => process.exit(0)); server.closeAllConnections() }
      process.once('SIGINT', stop)
      process.once('SIGTERM', stop)
    } catch (error) {
      process.stderr.write(error?.code === 'EADDRINUSE' ? `Port ${port} is already in use. Stop the old server deliberately or run node tools/serve.mjs --port 8781.\n` : 'The local server could not start. Use Node.js 22 or newer and a valid available port.\n')
      process.exitCode = 1
    }
  }
}
