import { lstat, readdir, readFile, realpath, mkdir, mkdtemp, writeFile, appendFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
export const PUBLIC_ASSETS = Object.freeze(JSON.parse(await readFile(new URL('./public-assets.json', import.meta.url), 'utf8')))
const folders = new Set(['factory', 'atlas', 'docs'])
const blocked = new Set(['local-knowledge', 'node_modules', 'tools', 'tests', 'exports', 'dist'])
const extensions = new Set(['.html', '.css', '.js', '.mjs', '.md', '.json', '.txt', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff2'])
const textExtensions = new Set(['.html', '.css', '.js', '.mjs', '.md', '.json', '.txt', '.svg'])
const privatePart = part => part.startsWith('.') || blocked.has(part.toLowerCase())
const within = (parent, target) => { const relative = path.relative(parent, target); return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative) }

export function validateAssetInventory(assets) {
  if (!Array.isArray(assets) || new Set(assets).size !== assets.length || !assets.includes('LICENSE') || !assets.includes('atlas/vendor/THREE-LICENSE.txt')) throw new Error('Public asset inventory is incomplete or contains duplicates.')
  for (const asset of assets) {
    if (typeof asset !== 'string' || /[\\\u0000-\u001f\u007f]/.test(asset) || path.posix.isAbsolute(asset)) throw new Error('Public asset inventory contains an invalid path.')
    const parts = asset.split('/')
    if (parts.some(part => !part || part === '..' || privatePart(part))) throw new Error('Public asset inventory contains a private path.')
    if (asset === 'LICENSE' || asset === 'index.html') continue
    if (!folders.has(parts[0]) || !extensions.has(path.posix.extname(asset))) throw new Error('Public asset inventory contains a nonpublic file type or location.')
  }
}

// Detect common accidental credential literals. Findings expose paths and counts only.
// This is a release check, not a guarantee that every possible secret format is detected.
export function credentialFindingCount(text) {
  const patterns = [
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    /\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[0-9A-Z]{16})\b/g,
    /\bBearer[ \t]+[A-Za-z0-9._~-]{20,}/g,
    /\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\b/g,
    /\b(?:TYPESAFE_API_KEY|api[_-]?key|client[_-]?secret|access[_-]?token)["']?\s*[:=]\s*["'][A-Za-z0-9._~+/-]{20,}["']/gi,
    /\bTYPESAFE_API_KEY[ \t]*=[ \t]*[A-Za-z0-9._~+/-]{20,}/g,
  ]
  return patterns.reduce((total, pattern) => total + [...text.matchAll(pattern)].length, 0)
}

async function checkPublicTree(rootDir, allowed, relative) {
  for (const entry of await readdir(path.join(rootDir, relative), { withFileTypes: true })) {
    if (privatePart(entry.name)) continue
    const child = `${relative}/${entry.name}`
    if (entry.isSymbolicLink()) throw new Error(`Public tree contains a symbolic link: ${child}`)
    if (entry.isDirectory()) await checkPublicTree(rootDir, allowed, child)
    else if (!entry.isFile() || !allowed.has(child)) throw new Error(`Review this file before adding it to the public inventory: ${child}`)
  }
}

async function readPublicAsset(rootDir, relative) {
  const parts = relative.split('/')
  let candidate = rootDir
  for (const part of parts) {
    candidate = path.join(candidate, part)
    const info = await lstat(candidate)
    if (info.isSymbolicLink()) throw new Error(`Public asset uses a symbolic link: ${relative}`)
  }
  const resolved = await realpath(candidate)
  if (!within(rootDir, resolved) || !(await lstat(resolved)).isFile()) throw new Error(`Public asset is not a regular file inside this project: ${relative}`)
  return readFile(resolved)
}

export async function buildStatic({ rootDir = repository, knownSecrets = [process.env.TYPESAFE_API_KEY] } = {}) {
  validateAssetInventory(PUBLIC_ASSETS)
  if (!Array.isArray(knownSecrets) || knownSecrets.some(value => value !== undefined && typeof value !== 'string')) throw new Error('Configured credential checks must be a list of strings.')
  // Compare only in memory. Never place a credential value in output or diagnostics.
  const secretBytes = [...new Set(knownSecrets.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean))].map(value => Buffer.from(value, 'utf8'))
  const resolvedRoot = await realpath(rootDir)
  const allowed = new Set(PUBLIC_ASSETS)
  for (const folder of folders) {
    if ((await lstat(path.join(resolvedRoot, folder))).isSymbolicLink()) throw new Error(`Public folder uses a symbolic link: ${folder}`)
    await checkPublicTree(resolvedRoot, allowed, folder)
  }
  const assets = []
  const findings = []
  for (const relative of PUBLIC_ASSETS) {
    let bytes = await readPublicAsset(resolvedRoot, relative)
    if (relative === 'factory/index.html') {
      const html = bytes.toString('utf8')
      if (!html.includes('<html lang="en">')) throw new Error('The workspace hosting marker needs review before publishing.')
      bytes = Buffer.from(html.replace('<html lang="en">', '<html lang="en" data-atlas-hosting="static">'), 'utf8')
    }
    let count = 0
    if (relative === 'LICENSE' || textExtensions.has(path.extname(relative))) {
      count += credentialFindingCount(bytes.toString('utf8'))
    }
    for (const secret of secretBytes) {
      let offset = 0
      while ((offset = bytes.indexOf(secret, offset)) !== -1) { count += 1; offset += secret.length }
    }
    if (count) findings.push({ path: relative, count })
    assets.push({ relative, bytes })
  }
  if (findings.length) {
    const error = new Error(`Possible credential literals found. No bundle written. ${findings.map(item => `${item.path} (${item.count})`).join(', ')}`)
    error.code = 'credential_findings'
    error.findings = findings
    throw error
  }
  // Each build has its own directory. No previous output is deleted or overwritten.
  const dist = path.join(resolvedRoot, 'dist')
  await mkdir(dist, { recursive: true })
  if ((await lstat(dist)).isSymbolicLink() || await realpath(dist) !== dist) throw new Error('The build directory must be a real directory inside this project.')
  const output = await mkdtemp(path.join(dist, 'public-'))
  if (!within(dist, output)) throw new Error('The output directory is outside dist.')
  for (const { relative, bytes } of assets) {
    const destination = path.join(output, ...relative.split('/'))
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, bytes, { flag: 'wx' })
  }
  return { output, files: assets.length, bytes: assets.reduce((total, asset) => total + asset.bytes.length, 0), credentialFindings: 0 }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length > 2) throw new Error('Usage: node tools/build-static.mjs')
    const result = await buildStatic()
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `path=${path.relative(repository, result.output).split(path.sep).join('/')}\n`)
    process.stdout.write(`Static beta bundle: ${result.output}\n${result.files} allowlisted files. Credential findings: ${result.credentialFindings}.\n`)
    process.stdout.write('Static workflow editing and downloads only. No JEV backend or credentials are included. Review this bundle before publishing.\n')
  } catch (error) {
    process.stderr.write(`${error.message}\n`)
    process.exitCode = 1
  }
}
