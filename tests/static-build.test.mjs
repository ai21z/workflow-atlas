import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, writeFile, symlink, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { buildStatic, PUBLIC_ASSETS, credentialFindingCount, validateAssetInventory } from '../tools/build-static.mjs'

async function fixture(t) {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), 'workflow-atlas-static-test-'))
  for (const relative of PUBLIC_ASSETS) {
    await mkdir(path.dirname(path.join(rootDir, relative)), { recursive: true })
    await writeFile(path.join(rootDir, relative), `${relative === 'factory/index.html' ? '<html lang="en">' : ''}Public fixture: ${relative}`)
  }
  t.after(async () => {
    const target = path.resolve(rootDir)
    assert.equal(path.dirname(target), path.resolve(os.tmpdir()))
    assert.ok(path.basename(target).startsWith('workflow-atlas-static-test-'))
    await rm(target, { recursive: true, force: true })
  })
  return rootDir
}

test('static bundle contains exactly the reviewed inventory and licenses, excluding private canaries', async t => {
  const rootDir = await fixture(t)
  for (const relative of ['.env.local', '.env.example', 'local-knowledge/review.txt', 'tools/secret.txt', 'tests/private.txt', 'factory/.env.local', 'docs/.private/token.txt', 'atlas/node_modules/private.txt']) {
    await mkdir(path.dirname(path.join(rootDir, relative)), { recursive: true })
    await writeFile(path.join(rootDir, relative), 'SYNTHETIC-PRIVATE-CANARY')
  }
  const first = await buildStatic({ rootDir })
  const second = await buildStatic({ rootDir })
  assert.notEqual(first.output, second.output)
  assert.equal(path.dirname(first.output), path.join(rootDir, 'dist'))
  const actual = (await readdir(first.output, { recursive: true, withFileTypes: true }))
    .filter(entry => entry.isFile())
    .map(entry => path.relative(first.output, path.join(entry.parentPath, entry.name)).replaceAll('\\', '/')).sort()
  assert.deepEqual(actual, [...PUBLIC_ASSETS].sort())
  assert.equal(first.files, PUBLIC_ASSETS.length)
  for (const relative of actual) {
    const text = await readFile(path.join(first.output, relative), 'utf8')
    assert.equal(text, `${relative === 'factory/index.html' ? '<html lang="en" data-atlas-hosting="static">' : ''}Public fixture: ${relative}`)
    assert.ok(!text.includes('SYNTHETIC-PRIVATE-CANARY'))
  }
  assert.ok(actual.includes('LICENSE'))
  assert.ok(actual.includes('atlas/vendor/THREE-LICENSE.txt'))
  assert.equal(await readFile(path.join(rootDir, 'factory/index.html'), 'utf8'), '<html lang="en">Public fixture: factory/index.html')
})

test('static build fails closed if the workspace hosting marker cannot be applied', async t => {
  const rootDir = await fixture(t)
  await writeFile(path.join(rootDir, 'factory/index.html'), '<html><body>Changed shell</body></html>')
  await assert.rejects(buildStatic({ rootDir }), /hosting marker needs review/)
  assert.ok(!(await readdir(rootDir)).includes('dist'))
})

test('unlisted public files and sensitive file types stop a build before output', async t => {
  for (const relative of ['factory/new-module.mjs', 'factory/private-key.pem', 'docs/credentials.json']) {
    const rootDir = await fixture(t)
    await writeFile(path.join(rootDir, relative), 'SYNTHETIC-CANARY')
    await assert.rejects(buildStatic({ rootDir }), error => {
      assert.match(error.message, /Review this file/)
      assert.ok(error.message.includes(relative))
      assert.ok(!error.message.includes('SYNTHETIC-CANARY'))
      return true
    })
    assert.ok(!(await readdir(rootDir)).includes('dist'))
  }
})

test('public or output symbolic links are rejected without copying their targets', async t => {
  const rootDir = await fixture(t)
  await mkdir(path.join(rootDir, 'private-target'))
  await writeFile(path.join(rootDir, 'private-target', 'private.txt'), 'SYNTHETIC-CANARY')
  await symlink(path.join(rootDir, 'private-target'), path.join(rootDir, 'factory', 'linked'), 'junction')
  await assert.rejects(buildStatic({ rootDir }), /symbolic link/)
  const second = await fixture(t)
  await mkdir(path.join(second, 'private-target'))
  await symlink(path.join(second, 'private-target'), path.join(second, 'dist'), 'junction')
  await assert.rejects(buildStatic({ rootDir: second }), /real directory/)
  assert.deepEqual(await readdir(path.join(second, 'private-target')), [])
})

test('credential checks stop on synthetic literals and reveal only their paths and counts', async t => {
  const rootDir = await fixture(t)
  const canary = 'fakecredentialonly012345678901234567890'
  await writeFile(path.join(rootDir, 'factory', 'app.mjs'), `const apiKey = "${canary}"`)
  await assert.rejects(buildStatic({ rootDir }), error => {
    assert.equal(error.code, 'credential_findings')
    assert.deepEqual(error.findings, [{ path: 'factory/app.mjs', count: 1 }])
    assert.ok(!error.message.includes(canary))
    return true
  })
  assert.ok(!(await readdir(rootDir)).includes('dist'))
  assert.equal(credentialFindingCount('TYPESAFE_API_KEY=\nAuthorization: Bearer <API_KEY>\napiKey: process.env.TYPESAFE_API_KEY'), 0)
  assert.ok(credentialFindingCount(`Authorization: Bearer ${canary}`) > 0)
  assert.ok(credentialFindingCount(`TYPESAFE_API_KEY=${canary}`) > 0)
  assert.ok(credentialFindingCount('-----BEGIN PRIVATE KEY-----') > 0)
})

test('the public inventory rejects dotfiles, private folders, traversal and missing notices', () => {
  for (const relative of ['factory/.env', 'factory/../secret.json', 'local-knowledge/key.txt', 'factory/key.pem', 'tools/serve.mjs']) {
    assert.throws(() => validateAssetInventory([...PUBLIC_ASSETS, relative]))
  }
  assert.throws(() => validateAssetInventory(PUBLIC_ASSETS.filter(item => item !== 'atlas/vendor/THREE-LICENSE.txt')))
})

test('the exact configured credential check catches opaque values without exposing them', async t => {
  const rootDir = await fixture(t)
  const opaqueCanary = 'synthetic:unusual!opaque?value'
  const content = `<p>Public fixture ${opaqueCanary}</p>`
  assert.equal(credentialFindingCount(content), 0)
  await writeFile(path.join(rootDir, 'index.html'), content)
  await assert.rejects(buildStatic({ rootDir, knownSecrets: [opaqueCanary] }), error => {
    assert.equal(error.code, 'credential_findings')
    assert.deepEqual(error.findings, [{ path: 'index.html', count: 1 }])
    assert.ok(!error.message.includes(opaqueCanary))
    assert.ok(!JSON.stringify(error).includes(opaqueCanary))
    return true
  })
  assert.ok(!(await readdir(rootDir)).includes('dist'))
})
