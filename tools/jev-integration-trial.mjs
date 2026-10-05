import { readFile, writeFile, mkdir, readdir, lstat, realpath } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { DEFINITION_METADATA } from '../factory/jev-contract.mjs'

export const PROTOCOL_ID = 'atlas-integrated-trial-1'
export const DEFAULT_ROUND = 'round-1'
const repository = fileURLToPath(new URL('../', import.meta.url))
const guidePath = 'docs/jev/integrated-trial.md'
const fixedFiles = ['index.html', 'tools/serve.mjs', 'tools/jev-transport.mjs', 'tools/jev-integration-trial.mjs']
const digest = bytes => createHash('sha256').update(bytes).digest('hex')
const localParts = ['local-knowledge', 'jev-integrated-trial']
const scope = 'Frozen source and scripted fictional inputs only. No inference, participant results or usability conclusion.'

export function extractTrialInputs(guide) {
  if (!guide.includes(`**Protocol: ${PROTOCOL_ID}.**`)) throw new Error('The integrated guide has a different protocol.')
  const labels = { featureDescription: 'Feature description', acceptedExample: 'Accepted example', coveredDescription: 'Covered description', investigation: 'Investigation', repair: 'Repair', unsupported: 'Unsupported' }
  return Object.fromEntries(Object.entries(labels).map(([id, label]) => {
    const matches = [...guide.matchAll(new RegExp(`^\\*\\*${label}:\\*\\* ([^\\r\\n]+)$`, 'gm'))]
    if (matches.length !== 1) throw new Error(`The guide must supply exactly one shared text: ${label}.`)
    return [id, matches[0][1]]
  }))
}

export async function collectTrialFiles(rootDir = repository) {
  const files = [...fixedFiles]
  async function visit(relative) {
    if (!(await lstat(path.join(rootDir, relative))).isDirectory()) throw new Error(`Unsupported source directory: ${relative}.`)
    for (const entry of await readdir(path.join(rootDir, relative), { withFileTypes: true })) {
      if (entry.name.startsWith('.') || ['local-knowledge', 'node_modules', 'tools', 'tests'].includes(entry.name.toLowerCase())) continue
      const file = `${relative}/${entry.name}`
      if (entry.isDirectory()) await visit(file)
      else if (entry.isFile()) files.push(file)
      else throw new Error(`Unsupported source entry: ${file}.`)
    }
  }
  for (const folder of ['factory', 'atlas', 'docs']) await visit(folder)
  for (const file of files) if (!(await lstat(path.join(rootDir, file))).isFile()) throw new Error(`Unsupported source file: ${file}.`)
  return files.sort()
}

async function roundPath(rootDir, round, createParents = false) {
  if (typeof round !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(round) || round.length > 64) throw new Error('Use a simple round name, such as round-2.')
  let parent = await realpath(rootDir)
  for (const part of localParts) {
    parent = path.join(parent, part)
    if (createParents) { try { await mkdir(parent) } catch (error) { if (error.code !== 'EEXIST') throw error } }
    if (!(await lstat(parent)).isDirectory()) throw new Error('The local trial directory must be a real directory.')
  }
  return path.join(parent, round)
}

export async function freezeTrial({ rootDir = repository, round = DEFAULT_ROUND } = {}) {
  const files = await collectTrialFiles(rootDir)
  const contents = new Map(await Promise.all(files.map(async file => [file, await readFile(path.join(rootDir, file))])))
  const fixedInputs = extractTrialInputs(contents.get(guidePath).toString('utf8'))
  const target = await roundPath(rootDir, round, true)
  try { await mkdir(target) } catch (error) { if (error.code === 'EEXIST') throw new Error('This round already exists. Verify it or choose a new --round.'); throw error }
  const manifest = { protocolId: PROTOCOL_ID, round, frozenAt: new Date().toISOString(), definition: DEFINITION_METADATA, fixedInputs, files, hashes: Object.fromEntries(files.map(file => [file, digest(contents.get(file))])), scope }
  for (const [file, bytes] of contents) {
    const destination = path.join(target, 'frozen', file)
    await mkdir(path.dirname(destination), { recursive: true })
    await writeFile(destination, bytes, { flag: 'wx' })
  }
  await writeFile(path.join(target, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' })
  return { manifest, manifestPath: path.join(target, 'manifest.json') }
}

export async function verifyTrial({ rootDir = repository, round = DEFAULT_ROUND } = {}) {
  const target = await roundPath(rootDir, round)
  if (!(await lstat(target)).isDirectory()) throw new Error('The frozen round must be a real directory.')
  const manifest = JSON.parse(await readFile(path.join(target, 'manifest.json'), 'utf8'))
  const files = await collectTrialFiles(rootDir)
  if (manifest.protocolId !== PROTOCOL_ID || manifest.round !== round || JSON.stringify(files) !== JSON.stringify(manifest.files)) throw new Error('Relevant source inventory changed. Keep this round fixed and choose a new --round.')
  if (JSON.stringify(await collectTrialFiles(path.join(target, 'frozen'))) !== JSON.stringify(files)) throw new Error('The frozen source inventory changed. Choose a new --round.')
  if (!manifest.hashes || JSON.stringify(Object.keys(manifest.hashes).sort()) !== JSON.stringify(files)) throw new Error('The frozen manifest file list is invalid.')
  for (const file of files) {
    if (!/^[a-f0-9]{64}$/.test(manifest.hashes[file])) throw new Error('The frozen manifest hash is invalid.')
    for (const filename of [path.join(rootDir, file), path.join(target, 'frozen', file)]) {
      if (!(await lstat(filename)).isFile() || digest(await readFile(filename)) !== manifest.hashes[file]) throw new Error(`Source differs from the frozen round: ${file}. Choose a new --round.`)
    }
  }
  const inputs = extractTrialInputs(await readFile(path.join(rootDir, guidePath), 'utf8'))
  if (JSON.stringify(inputs) !== JSON.stringify(manifest.fixedInputs) || JSON.stringify(DEFINITION_METADATA) !== JSON.stringify(manifest.definition) || manifest.scope !== scope) throw new Error('Frozen inputs or definition metadata changed. Choose a new --round.')
  return { manifest, manifestPath: path.join(target, 'manifest.json') }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [command, option, suppliedRound, ...extra] = process.argv.slice(2)
  if (!['freeze', 'verify'].includes(command) || (option !== undefined && (option !== '--round' || !suppliedRound || extra.length))) {
    process.stderr.write('Usage: node tools/jev-integration-trial.mjs freeze|verify [--round round-2]\n')
    process.exitCode = 1
  } else {
    try {
      const result = await (command === 'freeze' ? freezeTrial : verifyTrial)({ round: suppliedRound || DEFAULT_ROUND })
      process.stdout.write(`${command === 'freeze' ? 'Frozen' : 'Verified'} ${PROTOCOL_ID}, ${result.manifest.round}, ${result.manifest.files.length} source files.\n${result.manifestPath}\n${scope}\n`)
    } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1 }
  }
}
