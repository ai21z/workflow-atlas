import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile, readFile, rm, rename, symlink } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { freezeTrial, verifyTrial, extractTrialInputs, collectTrialFiles, PROTOCOL_ID } from '../tools/jev-integration-trial.mjs'
import { DEFINITION_METADATA } from '../factory/jev-contract.mjs'

const guide = `# Integrated trial\n\n**Protocol: ${PROTOCOL_ID}.**\n\n**Feature description:** Add a filter. Preserve  two spaces.\n\n**Accepted example:** Open shows open requests.\n\n**Covered description:** Add a filter. Open shows open requests.\n\n**Investigation:** Compare viability before choosing implementation.\n\n**Repair:** Repair the filter that loses its setting.\n\n**Unsupported:** Plan a picnic.\n`

async function setup(t) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workflow-atlas-integrated-freeze-test-'))
  for (const folder of ['factory', 'atlas', 'docs/jev', 'tools']) await mkdir(path.join(rootDir, folder), { recursive: true })
  const files = {
    'index.html': 'Atlas home', 'factory/app.mjs': 'An application asset', 'factory/jev-contract.mjs': 'Frozen contract source',
    'atlas/index.html': 'Knowledge map', 'docs/reader.js': 'Readable docs', 'docs/jev/integrated-trial.md': guide,
    'tools/serve.mjs': 'Local server', 'tools/jev-transport.mjs': 'Provider transport', 'tools/jev-integration-trial.mjs': 'Freeze procedure',
  }
  for (const [file, content] of Object.entries(files)) await writeFile(path.join(rootDir, file), content)
  t.after(async () => {
    const resolved = path.resolve(rootDir)
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()))
    assert.ok(path.basename(resolved).startsWith('workflow-atlas-integrated-freeze-test-'))
    await rm(resolved, { recursive: true, force: true })
  })
  return rootDir
}

test('freeze captures exact guide inputs, public source copies, stable hashes and bounded evidence claims', async t => {
  const rootDir = await setup(t)
  const { manifest, manifestPath } = await freezeTrial({ rootDir })
  assert.equal(manifest.protocolId, 'atlas-integrated-trial-1')
  assert.equal(manifest.round, 'round-1')
  assert.deepEqual(manifest.definition, DEFINITION_METADATA)
  assert.equal(manifest.fixedInputs.featureDescription, 'Add a filter. Preserve  two spaces.')
  assert.equal(Object.keys(manifest.fixedInputs).length, 6)
  assert.deepEqual(manifest.files, await collectTrialFiles(rootDir))
  assert.ok(manifest.files.includes('factory/jev-contract.mjs'))
  assert.ok(manifest.files.includes('tools/jev-integration-trial.mjs'))
  assert.match(manifest.scope, /No inference, participant results or usability conclusion/)
  assert.equal(path.relative(rootDir, manifestPath), path.join('local-knowledge', 'jev-integrated-trial', 'round-1', 'manifest.json'))
  assert.deepEqual((await verifyTrial({ rootDir })).manifest, manifest)
  const saved = JSON.parse(await readFile(manifestPath, 'utf8'))
  assert.deepEqual(saved, manifest)
})

test('freeze refuses to overwrite the same round before and after source changes', async t => {
  const rootDir = await setup(t)
  const initial = await freezeTrial({ rootDir })
  const bytes = await readFile(initial.manifestPath, 'utf8')
  await assert.rejects(freezeTrial({ rootDir }), /already exists/)
  await writeFile(path.join(rootDir, 'factory/app.mjs'), 'Changed after freezing')
  await assert.rejects(freezeTrial({ rootDir }), /already exists/)
  assert.equal(await readFile(initial.manifestPath, 'utf8'), bytes)
  const next = await freezeTrial({ rootDir, round: 'round-2' })
  assert.equal(next.manifest.round, 'round-2')
  await verifyTrial({ rootDir, round: 'round-2' })
})

test('verification detects changed, missing and added relevant sources', async t => {
  const rootDir = await setup(t)
  await freezeTrial({ rootDir })
  const asset = path.join(rootDir, 'factory/app.mjs')
  await writeFile(asset, 'Changed')
  await assert.rejects(verifyTrial({ rootDir }), /differs from the frozen/)
  await writeFile(asset, 'An application asset')
  await rename(asset, path.join(rootDir, 'factory/renamed.mjs'))
  await assert.rejects(verifyTrial({ rootDir }), /inventory changed/)
  await rename(path.join(rootDir, 'factory/renamed.mjs'), asset)
  await writeFile(path.join(rootDir, 'docs/additional.md'), 'New relevant document')
  await assert.rejects(verifyTrial({ rootDir }), /inventory changed/)
})

test('verification detects changed frozen copies and independently changed manifest inputs', async t => {
  const rootDir = await setup(t)
  const frozen = await freezeTrial({ rootDir })
  const filename = path.join(path.dirname(frozen.manifestPath), 'frozen', 'atlas', 'index.html')
  await writeFile(filename, 'Changed snapshot')
  await assert.rejects(verifyTrial({ rootDir }), /differs from the frozen/)
  await writeFile(filename, 'Knowledge map')
  const altered = structuredClone(frozen.manifest)
  altered.fixedInputs.repair = 'An altered trial question'
  await writeFile(frozen.manifestPath, JSON.stringify(altered))
  await assert.rejects(verifyTrial({ rootDir }), /inputs or definition metadata changed/)
  await writeFile(frozen.manifestPath, JSON.stringify(frozen.manifest))
  await writeFile(path.join(path.dirname(frozen.manifestPath), 'frozen', 'docs', 'added.md'), 'An added snapshot source')
  await assert.rejects(verifyTrial({ rootDir }), /frozen source inventory changed/)
})

test('shared inputs are exact and ambiguous or differently versioned guides are rejected', () => {
  assert.equal(extractTrialInputs(guide.replaceAll('\n', '\r\n')).featureDescription, 'Add a filter. Preserve  two spaces.')
  assert.throws(() => extractTrialInputs(guide.replace('atlas-integrated-trial-1', 'atlas-integrated-trial-2')), /different protocol/)
  assert.throws(() => extractTrialInputs(`${guide}\n**Repair:** Another repair.\n`), /exactly one shared text/)
  assert.throws(() => extractTrialInputs(guide.replace('**Repair:** Repair the filter that loses its setting.\n', '')), /exactly one shared text/)
})

test('round names cannot escape the local destination and symbolic link source directories are rejected', async t => {
  const rootDir = await setup(t)
  for (const round of ['../outside', '.', '..', 'round/2', 'C:\\outside', 'ROUND-2', 'x'.repeat(65)]) await assert.rejects(freezeTrial({ rootDir, round }), /simple round name/)
  await rename(path.join(rootDir, 'factory'), path.join(rootDir, 'original-factory'))
  await symlink(path.join(rootDir, 'original-factory'), path.join(rootDir, 'factory'), 'junction')
  await assert.rejects(freezeTrial({ rootDir }), /Unsupported source directory/)
})

test('a linked local destination is rejected without writing a snapshot outside the expected folder', async t => {
  const rootDir = await setup(t)
  await mkdir(path.join(rootDir, 'other-local-folder'))
  await symlink(path.join(rootDir, 'other-local-folder'), path.join(rootDir, 'local-knowledge'), 'junction')
  await assert.rejects(freezeTrial({ rootDir }), /real directory/)
})
