import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const number = '(?:0|[1-9]\\d*)'
const identifier = '(?:0|[1-9]\\d*|\\d*[A-Za-z-][0-9A-Za-z-]*)'
const semver = new RegExp(`^${number}\\.${number}\\.${number}(?:-${identifier}(?:\\.${identifier})*)?$`)

export async function checkVersion({ rootDir = root, write = false, tag } = {}) {
  const metadata = JSON.parse(await readFile(path.join(rootDir, 'package.json'), 'utf8'))
  const version = metadata.version
  if (typeof version !== 'string' || !semver.test(version)) throw new Error('Use a release version such as 0.1.0-beta.1, without build metadata.')
  const lock = JSON.parse(await readFile(path.join(rootDir, 'package-lock.json'), 'utf8'))
  if (lock.version !== version || lock.packages?.['']?.version !== version) throw new Error('package.json and package-lock.json versions differ. Use npm version to update them together.')
  const modulePath = path.join(rootDir, 'factory/version.mjs')
  const expected = `// Kept in sync with package.json by tools/version.mjs.\nexport const APP_VERSION = '${version}'\n`
  if (write) await writeFile(modulePath, expected)
  else {
    const actual = await readFile(modulePath, 'utf8')
    if (actual.replaceAll('\r\n', '\n') !== expected) throw new Error('The app version is out of date. Run node tools/version.mjs --write.')
    const changelog = await readFile(path.join(rootDir, 'CHANGELOG.md'), 'utf8')
    if (!changelog.split(/\r?\n/).includes(`## ${version}`)) throw new Error('Add a CHANGELOG.md entry for the current version.')
  }
  if (tag !== undefined && tag !== `v${version}`) throw new Error('The tag must match v followed by the package version.')
  return version
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2)
    if (!['--write', '--check'].includes(args[0]) || !(args.length === 1 || (args[0] === '--check' && args.length === 3 && args[1] === '--tag'))) throw new Error('Usage: node tools/version.mjs --write or --check [--tag v0.1.0-beta.1]')
    const version = await checkVersion({ write: args[0] === '--write', tag: args[2] })
    console.log(`Workflow Atlas ${version}. Version ${args[0] === '--write' ? 'updated' : 'checked'}.`)
  } catch (error) {
    console.error(error.message)
    process.exitCode = 1
  }
}
