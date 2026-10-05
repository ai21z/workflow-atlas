import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { readGuidePages, serializeGuide } from '../tools/build-jev-guide.mjs'

test('documentation readers are identical from Windows and Linux Markdown checkouts', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'atlas-docs-test-'))
  t.after(async () => {
    assert.equal(path.dirname(path.resolve(directory)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(directory).startsWith('atlas-docs-test-'))
    await rm(directory, { recursive: true, force: true })
  })
  const source = '# Example\n\nKeep the next step clear.\n'
  const definitions = [{ id: 'example', title: 'Example' }]
  await writeFile(path.join(directory, 'example.md'), source)
  const linux = serializeGuide('GUIDE', await readGuidePages(directory, definitions))
  await writeFile(path.join(directory, 'example.md'), source.replaceAll('\n', '\r\n'))
  const windows = serializeGuide('GUIDE', await readGuidePages(directory, definitions))
  assert.equal(windows, linux)
})
