import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { checkVersion } from '../tools/version.mjs'
import { APP_VERSION } from '../factory/version.mjs'
import { createRecipe, compile, compileSelectedOutput, compileStandaloneSkill } from '../factory/core.mjs'

async function fixture(t) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'atlas-version-test-'))
  await mkdir(path.join(rootDir, 'factory'))
  for (const file of ['package.json', 'package-lock.json', 'CHANGELOG.md', 'factory/version.mjs']) {
    await writeFile(path.join(rootDir, file), await readFile(new URL(`../${file}`, import.meta.url)))
  }
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(rootDir)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(rootDir).startsWith('atlas-version-test-'))
    await rm(rootDir, { recursive: true, force: true })
  })
  return rootDir
}

test('release identity rejects a mismatched tag or lockfile', async t => {
  const rootDir = await fixture(t)
  assert.equal(await checkVersion({ rootDir, tag: `v${APP_VERSION}` }), APP_VERSION)
  await assert.rejects(checkVersion({ rootDir, tag: 'v9.9.9' }), /tag must match/)
  const lock = JSON.parse(await readFile(path.join(rootDir, 'package-lock.json'), 'utf8'))
  lock.packages[''].version = '9.9.9'
  await writeFile(path.join(rootDir, 'package-lock.json'), JSON.stringify(lock))
  await assert.rejects(checkVersion({ rootDir }), /versions differ/)
})

test('stale app metadata can be regenerated but release notes remain required', async t => {
  const rootDir = await fixture(t)
  await writeFile(path.join(rootDir, 'factory/version.mjs'), 'stale')
  await assert.rejects(checkVersion({ rootDir }), /out of date/)
  await checkVersion({ rootDir, write: true })
  assert.equal(await checkVersion({ rootDir }), APP_VERSION)
  await writeFile(path.join(rootDir, 'CHANGELOG.md'), '# Changelog\n')
  await assert.rejects(checkVersion({ rootDir }), /CHANGELOG/)
})

test('all export scopes record app identity without changing the project schema', () => {
  const project = createRecipe('feature-delivery')
  const before = JSON.stringify(project)
  const outputs = [compile(project), compileSelectedOutput(project, { kind: 'blueprint' }), compileSelectedOutput(project, { kind: 'skill', skillId: 'requirement-refinement' }), compileStandaloneSkill(project, 'requirement-refinement')]
  for (const output of outputs) {
    const manifest = JSON.parse(output.files.find(file => file.path === 'manifest.json').content)
    assert.equal(manifest.appVersion, APP_VERSION)
    assert.equal(manifest.schemaVersion, project.schemaVersion)
  }
  assert.equal(JSON.stringify(project), before)
})
