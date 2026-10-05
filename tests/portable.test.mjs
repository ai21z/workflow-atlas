import test from 'node:test'
import assert from 'node:assert/strict'
import { deflateRawSync } from 'node:zlib'
import { createExample, compile, serializeProject, PROJECT_JSON_MAX_BYTES } from '../factory/core.mjs'
import { compareFiles, resolveComparison } from '../factory/maintenance.mjs'
import { buildProjectAtlas, packageProject, packageReviewedFiles, readProjectFiles, PORTABLE_LIMITS } from '../factory/portable.mjs'
import { zipFiles, unzipTextFiles } from '../factory/zip.mjs'

const encode = value => new TextEncoder().encode(value)
const file = (name, content, path = '') => {
  const item = new File([content], name)
  if (path) Object.defineProperty(item, 'webkitRelativePath', { value: path })
  return item
}

test('project-level check records reopen through JSON, ZIP, HTML and folder without inventing observations', async () => {
  const config = createExample('feasibility')
  config.evidence = [{ id: 'scope-review', stageId: '', check: 'Review the study scope', expected: 'The owner accepts the scope', observed: '', status: 'planned', method: 'user-recorded', source: '', reviewer: '' }]
  const pack = packageProject(config, compile(config))
  const html = pack.files.find(entry => entry.path === 'PROJECT-ATLAS.html').content
  assert.match(html, /Project level/)
  const inputs = [
    [file('settings.json', serializeProject(config))],
    [file('pack.zip', zipFiles(pack.files))],
    [file('snapshot.html', html)],
    pack.files.map(entry => file(entry.path.split('/').at(-1), entry.content, `repository/${entry.path}`)),
  ]
  for (const input of inputs) {
    const restored = await readProjectFiles(input)
    assert.deepEqual(restored.config, config)
    assert.equal(restored.config.evidence[0].observed, '')
    assert.equal(restored.config.evidence[0].status, 'planned')
  }
})

test('metadata beyond the former 2 MB bound has the same supported limit across local settings imports', async () => {
  assert.equal(PORTABLE_LIMITS.maxFileBytes, PROJECT_JSON_MAX_BYTES)
  const config = createExample('feasibility')
  config.facts = Array.from({ length: 35 }, (_, index) => ({ id: `fact-${index}`, claim: 'c'.repeat(19990), status: 'inferred', source: 's'.repeat(19990), revision: '', reviewer: '', notes: 'n'.repeat(19990) }))
  const content = serializeProject(config)
  assert.ok(encode(content).byteLength > 2_000_000)
  const restored = await readProjectFiles([file('large-settings.json', content)])
  assert.deepEqual(restored.config, config)
})

test('case-renamed metadata and edited artifacts survive reviewed regeneration', async () => {
  const config = createExample('bugfix')
  const imported = await readProjectFiles([file('PROJECT.JSON', serializeProject(config), 'repo/PROJECT.JSON'), file('WORKFLOW.md', '# Independently edited workflow', 'repo/WORKFLOW.md')])
  const rows = compareFiles([], imported.files, compile(config).files.map(({ path, content }) => ({ path, content })))
  const resolved = resolveComparison(rows, { 'project.json': 'existing', 'WORKFLOW.md': 'existing' })
  const reviewed = packageReviewedFiles(resolved, { decisions: [{ path: 'project.json', choice: 'existing' }] })
  const restored = await readProjectFiles([file('reviewed.zip', zipFiles(reviewed.files))])
  assert.deepEqual(restored.config, config)
  assert.equal(restored.files.find(entry => entry.path === 'PROJECT.JSON').content, serializeProject(config))
  assert.equal(restored.files.find(entry => entry.path === 'WORKFLOW.md').content, '# Independently edited workflow')
})

function compressedZIP(files, descriptors = false) {
  const entries = files.map(item => {
    const name = encode(item.path)
    const content = encode(item.content)
    const checksum = new DataView(zipFiles([item]).buffer).getUint32(14, true)
    return { name, content, compressed: new Uint8Array(deflateRawSync(content)), checksum }
  })
  const localSize = entries.reduce((sum, entry) => sum + 30 + entry.name.length + entry.compressed.length + (descriptors ? 16 : 0), 0)
  const centralSize = entries.reduce((sum, entry) => sum + 46 + entry.name.length, 0)
  const bytes = new Uint8Array(localSize + centralSize + 22)
  const view = new DataView(bytes.buffer)
  const word = (offset, value) => view.setUint16(offset, value, true)
  const dword = (offset, value) => view.setUint32(offset, value, true)
  let cursor = 0
  let central = localSize
  for (const entry of entries) {
    const flags = 0x0800 | (descriptors ? 8 : 0)
    dword(cursor, 0x04034b50); word(cursor + 4, 20); word(cursor + 6, flags); word(cursor + 8, 8)
    if (!descriptors) { dword(cursor + 14, entry.checksum); dword(cursor + 18, entry.compressed.length); dword(cursor + 22, entry.content.length) }
    word(cursor + 26, entry.name.length)
    bytes.set(entry.name, cursor + 30)
    bytes.set(entry.compressed, cursor + 30 + entry.name.length)
    dword(central, 0x02014b50); word(central + 4, 20); word(central + 6, 20); word(central + 8, flags); word(central + 10, 8)
    dword(central + 16, entry.checksum); dword(central + 20, entry.compressed.length); dword(central + 24, entry.content.length)
    word(central + 28, entry.name.length); dword(central + 42, cursor)
    bytes.set(entry.name, central + 46)
    cursor += 30 + entry.name.length + entry.compressed.length
    if (descriptors) { dword(cursor, 0x08074b50); dword(cursor + 4, entry.checksum); dword(cursor + 8, entry.compressed.length); dword(cursor + 12, entry.content.length); cursor += 16 }
    central += 46 + entry.name.length
  }
  dword(central, 0x06054b50); word(central + 8, entries.length); word(central + 10, entries.length)
  dword(central + 12, centralSize); dword(central + 16, localSize)
  return bytes
}

test('complete packages include a portable viewer and an accurate inventory without modifying the compiler result', () => {
  const config = createExample('feasibility')
  const original = compile(config)
  const before = JSON.stringify(original)
  const pack = packageProject(config, original)
  assert.equal(JSON.stringify(original), before)
  const manifest = JSON.parse(pack.files.find(item => item.path === 'manifest.json').content)
  assert.deepEqual(manifest.files.sort(), pack.files.map(item => item.path).sort())
  assert.equal(manifest.portableAtlas.path, 'PROJECT-ATLAS.html')
  assert.equal(pack.stats.fileCount, pack.files.length)
  assert.equal(pack.stats.bytes, pack.files.reduce((sum, item) => sum + encode(item.content).length, 0))
  assert.equal(pack.files.filter(item => item.path === 'PROJECT-ATLAS.html').length, 1)
  assert.equal(packageProject(config, pack).files.filter(item => item.path === 'PROJECT-ATLAS.html').length, 1)
})

test('an exported project ZIP reopens its decisions, Unicode text and artifact contents', async () => {
  const config = createExample('feature-delivery')
  config.project.name = 'Δοκιμή 世界'
  config.workflow.notes.implementation = 'Use the existing pattern, preserve the user’s choice.'
  const pack = packageProject(config, compile(config))
  const result = await readProjectFiles([file('my-project.zip', zipFiles(pack.files))])
  assert.deepEqual(result.config, config)
  assert.deepEqual(result.files.map(item => item.path).sort(), pack.files.map(item => item.path).sort())
  assert.equal(result.files.find(item => item.path === 'WORKFLOW.md').content, pack.files.find(item => item.path === 'WORKFLOW.md').content)
  assert.equal(result.warnings.length, 1)
})

test('ordinary compressed ZIPs reopen with and without data descriptors and a GitHub root folder', async () => {
  const config = createExample('bugfix')
  const pack = compile(config)
  const files = pack.files.map(item => ({ path: `example-main/${item.path}`, content: item.content }))
  files.push({ path: 'example-main/src/worker.js', content: 'Unrelated repository code.' })
  for (const descriptors of [false, true]) {
    const result = await readProjectFiles([file('example.zip', compressedZIP(files, descriptors))])
    assert.deepEqual(result.config, config)
    assert.ok(result.files.some(item => item.path === 'WORKFLOW.md'))
    assert.ok(!result.files.some(item => item.path.startsWith('example-main/')))
    assert.ok(!result.files.some(item => item.path.startsWith('src/')))
    assert.match(result.warnings.at(-1), /1 unrelated/)
  }
})

test('folder import finds Atlas metadata and preserves recognized edited artifacts', async () => {
  const config = createExample('feature-delivery')
  const supplied = [
    file('project.json', JSON.stringify(config), 'repo/project.json'),
    file('WORKFLOW.md', '# My edited workflow', 'repo/WORKFLOW.md'),
    file('SKILL.md', '# My skill', 'repo/.github/skills/mine/SKILL.md'),
    file('secret.bin', new Uint8Array([0, 255]), 'repo/src/secret.bin'),
    file('project.json', '{}', 'repo/node_modules/foreign/project.json'),
  ]
  const result = await readProjectFiles(supplied)
  assert.deepEqual(result.config, config)
  assert.equal(result.files.find(item => item.path === 'WORKFLOW.md').content, '# My edited workflow')
  assert.equal(result.files.length, 3)
  assert.match(result.warnings.at(-1), /2 unrelated/)
})

test('a standalone settings download restores only the supplied model', async () => {
  const config = createExample('feasibility')
  const result = await readProjectFiles([file('my-study.project.json', JSON.stringify(config))])
  assert.deepEqual(result.config, config)
  assert.equal(result.files.length, 1)
  assert.equal(result.files[0].path, 'project.json')
  assert.match(result.warnings[0], /Only project settings/)
})

test('the portable HTML snapshot reopens safely without relying on a server or a script execution', async () => {
  const config = createExample('feasibility')
  const pack = compile(config)
  const html = buildProjectAtlas(config, pack)
  const result = await readProjectFiles([file('my-atlas.html', html)])
  assert.deepEqual(result.config, config)
  assert.deepEqual(result.files.map(item => item.path), pack.files.map(item => item.path))
  assert.match(html, /connect-src 'none'/)
  assert.match(html, /Workflow and handoffs/)
  assert.match(html, /Runtime design/)
  assert.match(html, /Download project JSON/)
  assert.doesNotMatch(html, /<script\b[^>]*\bsrc=/i)
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB|fetch\(/)
})

test('HTML-like project values are escaped both in the page and embedded JSON', async () => {
  const config = createExample('bugfix')
  const hostile = '</script><img src=x onerror="window.attacked=true"><script>'
  config.project.name = hostile
  config.project.purpose = hostile
  config.facts.push({ id: 'bad', claim: hostile, status: 'inferred', source: 'javascript:alert(1)', revision: '', reviewer: '', notes: '' })
  const html = buildProjectAtlas(config, compile(config))
  assert.ok(!html.includes(hostile))
  assert.match(html, /&lt;\/script&gt;/)
  assert.match(html, /\\u003c\/script\\u003e/)
  assert.doesNotMatch(html, /href="javascript:/)
  const result = await readProjectFiles([file('snapshot.html', html)])
  assert.equal(result.config.project.name, hostile)
})

test('unknown HTML and ambiguous snapshots cannot become executable imports', async () => {
  await assert.rejects(readProjectFiles([file('foreign.html', '<script>throw new Error("executed")</script>')]), /no unambiguous/)
  const config = createExample('bugfix')
  const html = buildProjectAtlas(config, compile(config))
  const data = html.match(/<script id="workflow-atlas-project"[^>]*>[\s\S]*?<\/script>/)[0]
  await assert.rejects(readProjectFiles([file('ambiguous.html', html.replace('</body>', `${data}</body>`))]), /no unambiguous/)
})

test('multiple project documents and arbitrary repositories are rejected without guessing decisions', async () => {
  const config = JSON.stringify(createExample('bugfix'))
  await assert.rejects(readProjectFiles([file('project.json', config, 'repo/one/project.json'), file('project.json', config, 'repo/two/project.json')]), /More than one/)
  await assert.rejects(readProjectFiles([file('README.md', '# Repo', 'repo/README.md')]), /No Atlas project metadata/)
  await assert.rejects(readProjectFiles([file('package.json', '{"dependencies":{"react":"19"}}')]), /schema|field/i)
  await assert.rejects(readProjectFiles([]), /Choose/)
})

test('unsafe, duplicate and overlapping folder paths are rejected before reading data', async () => {
  const config = JSON.stringify(createExample('bugfix'))
  await assert.rejects(readProjectFiles([file('project.json', config, '../project.json')]), /parent path/)
  await assert.rejects(readProjectFiles([file('project.json', config, 'repo/project.json'), file('PROJECT.JSON', config, 'repo/PROJECT.JSON')]), /duplicates/)
  await assert.rejects(readProjectFiles([file('project.json', config, 'repo/project.json'), file('repo', 'file', 'repo')]), /parent directory/)
})

test('missing manifest members produce a visible warning without preventing a valid model from opening', async () => {
  const config = JSON.stringify(createExample('bugfix'))
  const result = await readProjectFiles([file('project.json', config), file('manifest.json', '{"files":["project.json","missing.md"]}')])
  assert.match(result.warnings.at(-1), /1 files listed.*missing/)
})

test('damaged archives and altered checksum records are rejected', async () => {
  const bytes = zipFiles([{ path: 'project.json', content: JSON.stringify(createExample('bugfix')) }])
  const broken = bytes.slice()
  const nameLength = new DataView(broken.buffer).getUint16(26, true)
  broken[30 + nameLength] ^= 1
  await assert.rejects(unzipTextFiles(broken), /damaged/)
  await assert.rejects(unzipTextFiles(bytes.subarray(0, bytes.length - 1)), /end record/)
})

test('expanded size is checked before and during decompression', async () => {
  const bytes = compressedZIP([{ path: 'text.txt', content: 'A'.repeat(100_000) }])
  await assert.rejects(unzipTextFiles(bytes, { maxFileBytes: 100 }), /limit/)
  const forged = bytes.slice()
  const view = new DataView(forged.buffer)
  const central = view.getUint32(forged.length - 22 + 16, true)
  view.setUint32(22, 50, true)
  view.setUint32(central + 24, 50, true)
  await assert.rejects(unzipTextFiles(forged), /declared size/)
})

test('ZIP selection skips unrelated binary files without decompressing their content', async () => {
  const config = createExample('bugfix')
  const result = await readProjectFiles([file('repo.zip', compressedZIP([
    { path: 'root/project.json', content: JSON.stringify(config) },
    { path: 'root/photo.bin', content: '\0binary' },
  ]))])
  assert.deepEqual(result.config, config)
  assert.match(result.warnings.at(-1), /1 unrelated/)
})

test('the ZIP reader rejects encrypted, linked and unsafe entries', async () => {
  const base = zipFiles([{ path: 'project.json', content: '{}' }])
  const encrypted = base.slice()
  const view = new DataView(encrypted.buffer)
  const central = view.getUint32(encrypted.length - 6, true)
  view.setUint16(6, 0x0801, true); view.setUint16(central + 8, 0x0801, true)
  await assert.rejects(unzipTextFiles(encrypted), /Encrypted/)
  const symlink = base.slice()
  new DataView(symlink.buffer).setUint32(central + 38, 0xa1ff0000, true)
  await assert.rejects(unzipTextFiles(symlink), /links/)
  const unsafe = base.slice()
  unsafe.set(encode('../bad!.json'), 30)
  unsafe.set(encode('../bad!.json'), central + 46)
  await assert.rejects(unzipTextFiles(unsafe), /Unsafe ZIP path/)
})

test('selected project file size bounds are explicit and viewer bundles are not limited to the old 2 MB snapshot bound', async () => {
  assert.ok(PORTABLE_LIMITS.maxFileBytes > 3_000_000)
  const large = { name: 'project.json', size: PORTABLE_LIMITS.maxFileBytes + 1, async arrayBuffer() { throw new Error('Must not read oversized data') } }
  await assert.rejects(readProjectFiles([large]), /8 MB/)
})

test('unsupported project schema cannot enter the portable round trip', async () => {
  const config = createExample('bugfix')
  config.schemaVersion = '99.0'
  await assert.rejects(readProjectFiles([file('project.json', JSON.stringify(config))]), /Unsupported schema/)
})

test('a visible snapshot cannot disagree with the authoritative packaged project document', async () => {
  const config = createExample('bugfix')
  const different = createExample('bugfix')
  different.project.name = 'A different project'
  assert.throws(() => packageProject(different, compile(config)), /matching the current project/)
  const html = buildProjectAtlas(config, compile(config))
  const embedded = html.match(/<script id="workflow-atlas-project"[^>]*>([\s\S]*?)<\/script>/)[1]
  const payload = JSON.parse(embedded)
  payload.config = different
  const altered = html.replace(embedded, JSON.stringify(payload))
  await assert.rejects(readProjectFiles([file('altered.html', altered)]), /disagree/)
})

test('viewer export rejects an oversized snapshot instead of producing a file that cannot reopen', () => {
  const config = createExample('bugfix')
  const pack = compile(config)
  pack.files.push({ path: 'large.txt', content: '<'.repeat(3_000_000) })
  assert.throws(() => buildProjectAtlas(config, pack), /Project Atlas exceeds 8 MB/)
})

test('reviewed export rebuilds its viewer from retained metadata and actual resolved artifact contents', async () => {
  const retained = createExample('bugfix')
  retained.project.name = 'The retained project'
  const current = createExample('bugfix')
  current.project.name = 'An unrelated newer draft'
  const stale = packageProject(current, compile(current)).files.find(item => item.path === 'PROJECT-ATLAS.html')
  const source = compile(retained).files.map(({ path, content }) => ({ path, content }))
  const skillPath = source.find(item => item.path.endsWith('/SKILL.md')).path
  source.find(item => item.path === skillPath).content = '# My independently edited skill\nKeep this exact wording.'
  source.push({ path: stale.path, content: stale.content })
  const before = JSON.stringify(source)
  const reviewed = packageReviewedFiles(source, { decisions: [{ path: 'project.json', choice: 'existing' }, { path: skillPath, choice: 'existing' }] })
  assert.equal(JSON.stringify(source), before)
  assert.deepEqual(reviewed.config, retained)
  const html = reviewed.files.find(item => item.path === 'PROJECT-ATLAS.html').content
  const snapshot = JSON.parse(html.match(/<script id="workflow-atlas-project"[^>]*>([\s\S]*?)<\/script>/)[1])
  assert.deepEqual(snapshot.config, retained)
  assert.equal(snapshot.files.find(item => item.path === skillPath).content, '# My independently edited skill\nKeep this exact wording.')
  assert.ok(!snapshot.files.some(item => item.path === 'PROJECT-ATLAS.html'))
  const restored = await readProjectFiles([file('reviewed.zip', zipFiles(reviewed.files))])
  assert.deepEqual(restored.config, retained)
  assert.equal(restored.files.find(item => item.path === skillPath).content, snapshot.files.find(item => item.path === skillPath).content)
  assert.deepEqual(restored.files.map(item => item.path), reviewed.files.map(item => item.path))
})

test('reviewed inventory is accurate and does not inherit source format or behavior claims', () => {
  const config = createExample('feasibility')
  const source = compile(config).files.map(({ path, content }) => ({ path, content }))
  const prior = source.find(item => item.path === 'manifest.json')
  prior.content = JSON.stringify({ files: ['invented.md'], validation: { formatChecked: true, hostExercised: true, behaviorObserved: true } })
  source.find(item => item.path === 'VALIDATION.md').content = '# Prior unverified file\nFormat checked: yes'
  const reviewed = packageReviewedFiles(source, { description: 'User choices' })
  const manifest = JSON.parse(reviewed.files.find(item => item.path === 'manifest.json').content)
  assert.equal(manifest.kind, 'reviewed-file-set')
  assert.deepEqual(manifest.files, reviewed.files.map(item => item.path).sort())
  assert.ok(Object.values(manifest.validation).every(value => value === false))
  assert.equal(reviewed.files.find(item => item.path === 'VALIDATION.md').content, '# Prior unverified file\nFormat checked: yes')
  assert.equal(JSON.parse(reviewed.files.find(item => item.path === manifest.supportingRecords[0]).content).content, prior.content)
  assert.match(reviewed.files.find(item => item.path === 'PROJECT-ATLAS.html').content, /not endorsed or revalidated/)
  assert.match(reviewed.warnings[0], /not revalidated/)
})

test('removing metadata produces an explicit file set without retaining or inventing a Project Atlas', () => {
  const config = createExample('bugfix')
  const original = packageProject(config, compile(config)).files.filter(item => item.path !== 'project.json').map(({ path, content }) => ({ path, content }))
  const reviewed = packageReviewedFiles(original, { decisions: [{ path: 'project.json', choice: 'remove' }] })
  assert.equal(reviewed.config, null)
  assert.ok(!reviewed.files.some(item => item.path === 'PROJECT-ATLAS.html'))
  const manifest = JSON.parse(reviewed.files.find(item => item.path === 'manifest.json').content)
  assert.equal(manifest.project.metadataParsed, false)
  assert.ok(!manifest.portableAtlas)
  assert.match(reviewed.warnings.at(-1), /no project to reopen/)
})

test('reviewed files can omit an old manifest and previous comparison records are preserved', () => {
  const config = createExample('bugfix')
  const first = packageReviewedFiles([{ path: 'project.json', content: JSON.stringify(config) }, { path: 'ATLAS-COMPARISON.json', content: '{"old":"record"}' }], { version: 'second' })
  const manifest = JSON.parse(first.files.find(item => item.path === 'manifest.json').content)
  assert.equal(first.files.find(item => item.path === 'ATLAS-COMPARISON.json').content, '{"old":"record"}')
  assert.equal(manifest.reviewRecord, 'ATLAS-COMPARISON-2.json')
  assert.deepEqual(manifest.supportingRecords, [])
  assert.equal(JSON.parse(first.files.find(item => item.path === 'ATLAS-COMPARISON-2.json').content).comparison.version, 'second')
})

test('invalid retained metadata cannot produce a misleading reviewed viewer', () => {
  assert.throws(() => packageReviewedFiles([{ path: 'project.json', content: '{"bad":true}' }], { decisions: [] }), /resolved project.json cannot be reopened/)
  assert.throws(() => packageReviewedFiles([], null), /comparison decision record/)
  const config = createExample('bugfix')
  const other = createExample('bugfix')
  other.project.name = 'Different model'
  assert.throws(() => buildProjectAtlas(other, compile(config)), /same decisions/)
})

test('manifest-listed custom text artifacts round trip through ZIP, folder and portable HTML', async () => {
  const config = createExample('bugfix')
  const source = compile(config).files.map(({ path, content }) => ({ path, content }))
  source.push({ path: 'notes/custom.md', content: '# A decision written outside the editor\nPreserve this note.' })
  source.push({ path: 'helpers/check.py', content: 'raise RuntimeError("This artifact must never execute during import")\n' })
  const reviewed = packageReviewedFiles(source, { decisions: [{ path: 'notes/custom.md', choice: 'existing' }] })
  const zipped = reviewed.files.map(item => ({ path: `repository-main/${item.path}`, content: item.content }))
  const zipResult = await readProjectFiles([file('custom.zip', compressedZIP(zipped))])
  const folderResult = await readProjectFiles(reviewed.files.map(item => file(item.path.split('/').at(-1), item.content, `repository/${item.path}`)))
  const htmlResult = await readProjectFiles([file('custom.atlas.html', reviewed.files.find(item => item.path === 'PROJECT-ATLAS.html').content)])
  for (const result of [zipResult, folderResult, htmlResult]) {
    assert.deepEqual(result.config, config)
    assert.equal(result.files.find(item => item.path === 'notes/custom.md').content, '# A decision written outside the editor\nPreserve this note.')
    assert.equal(result.files.find(item => item.path === 'helpers/check.py').content, 'raise RuntimeError("This artifact must never execute during import")\n')
  }
  assert.deepEqual(zipResult.files.filter(item => item.path !== 'PROJECT-ATLAS.html'), htmlResult.files)
})

test('manifest inventory cannot request unsafe paths or duplicate path aliases', async () => {
  const config = createExample('bugfix')
  for (const paths of [['project.json', '../outside.md'], ['project.json', 'notes/a.md', 'notes/A.md'], ['project.json', 'notes/café.md', 'notes/cafe\u0301.md']]) {
    const files = [{ path: 'project.json', content: JSON.stringify(config) }, { path: 'manifest.json', content: JSON.stringify({ files: paths }) }]
    await assert.rejects(readProjectFiles([file('unsafe.zip', zipFiles(files))]), /Unsafe manifest inventory/)
    await assert.rejects(readProjectFiles(files.map(item => file(item.path, item.content))), /Unsafe manifest inventory/)
  }
})

test('unsupported and binary manifest requests are skipped with warnings while unrelated repo files stay unopened', async () => {
  const config = createExample('bugfix')
  const entries = [
    { path: 'project.json', content: JSON.stringify(config) },
    { path: 'manifest.json', content: JSON.stringify({ files: ['project.json', 'manifest.json', 'notes/good.md', 'notes/binary.txt', 'images/photo.png', 'node_modules/private/secret.md'] }) },
    { path: 'notes/good.md', content: 'A supplied artifact.' },
    { path: 'notes/binary.txt', content: '\0not text' },
    { path: 'images/photo.png', content: '\0not an image to open' },
    { path: 'node_modules/private/secret.md', content: 'Dependency content must be skipped.' },
    { path: 'src/unrelated.py', content: 'raise Exception("Do not open unrelated repo files")' },
  ]
  const zipResult = await readProjectFiles([file('mixed.zip', compressedZIP(entries))])
  const folderResult = await readProjectFiles(entries.map(item => file(item.path.split('/').at(-1), item.content, `repository/${item.path}`)))
  for (const result of [zipResult, folderResult]) {
    assert.ok(result.files.some(item => item.path === 'notes/good.md'))
    assert.equal(result.files.length, 3)
    assert.ok(result.warnings.some(warning => /unsupported text extension/.test(warning)))
    assert.ok(result.warnings.some(warning => /binary data/.test(warning)))
    assert.ok(result.warnings.some(warning => /ignored directory/.test(warning)))
    assert.ok(!result.files.some(item => item.path.startsWith('src/')))
  }
})
