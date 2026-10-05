import test from 'node:test'
import assert from 'node:assert/strict'
import { validateFilePaths, zipFiles } from '../factory/zip.mjs'

const decoder = new TextDecoder('utf-8', { fatal: true })

function readStoredArchive(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const end = bytes.byteLength - 22
  assert.equal(view.getUint32(end, true), 0x06054b50)
  assert.equal(view.getUint16(end + 4, true), 0)
  assert.equal(view.getUint16(end + 6, true), 0)
  const count = view.getUint16(end + 10, true)
  assert.equal(view.getUint16(end + 8, true), count)
  const centralSize = view.getUint32(end + 12, true)
  const centralStart = view.getUint32(end + 16, true)
  assert.equal(centralStart + centralSize, end)
  assert.equal(view.getUint16(end + 20, true), 0)
  const files = []
  let position = centralStart
  for (let index = 0; index < count; index += 1) {
    assert.equal(view.getUint32(position, true), 0x02014b50)
    assert.equal(view.getUint16(position + 8, true), 0x0800)
    assert.equal(view.getUint16(position + 10, true), 0)
    assert.equal(view.getUint16(position + 12, true), 0)
    assert.equal(view.getUint16(position + 14, true), 0x0021)
    const checksum = view.getUint32(position + 16, true)
    const size = view.getUint32(position + 20, true)
    assert.equal(view.getUint32(position + 24, true), size)
    const nameLength = view.getUint16(position + 28, true)
    const extraLength = view.getUint16(position + 30, true)
    const commentLength = view.getUint16(position + 32, true)
    assert.equal(extraLength, 0)
    assert.equal(commentLength, 0)
    const localOffset = view.getUint32(position + 42, true)
    assert.equal(view.getUint32(localOffset, true), 0x04034b50)
    assert.equal(view.getUint16(localOffset + 6, true), 0x0800)
    assert.equal(view.getUint16(localOffset + 8, true), 0)
    assert.equal(view.getUint16(localOffset + 10, true), 0)
    assert.equal(view.getUint16(localOffset + 12, true), 0x0021)
    assert.equal(view.getUint32(localOffset + 14, true), checksum)
    assert.equal(view.getUint32(localOffset + 18, true), size)
    assert.equal(view.getUint32(localOffset + 22, true), size)
    assert.equal(view.getUint16(localOffset + 26, true), nameLength)
    assert.equal(view.getUint16(localOffset + 28, true), 0)
    const nameBytes = bytes.subarray(position + 46, position + 46 + nameLength)
    assert.deepEqual(bytes.subarray(localOffset + 30, localOffset + 30 + nameLength), nameBytes)
    const contentStart = localOffset + 30 + nameLength
    assert.ok(contentStart + size <= centralStart)
    files.push({
      path: decoder.decode(nameBytes),
      content: decoder.decode(bytes.subarray(contentStart, contentStart + size)),
      checksum,
    })
    position += 46 + nameLength + extraLength + commentLength
  }
  assert.equal(position, end)
  return files
}

test('ZIP contains extractable UTF8 files, correct headers and a known CRC32', () => {
  const input = [
    { path: 'WORKFLOW.md', content: '123456789' },
    { path: '.github/skills/review/SKILL.md', content: '# Review\n' },
    { path: 'references/κόσμος 🧠.md', content: 'Καλημέρα, 世界, 🧠\n' },
    { path: 'empty.txt', content: '' },
  ]
  const output = readStoredArchive(zipFiles(input))
  assert.deepEqual(output.map(({ path, content }) => ({ path, content })), input)
  assert.equal(output[0].checksum, 0xcbf43926)
  assert.equal(output[3].checksum, 0)
})

test('same input produces byte-identical archives with a fixed timestamp', () => {
  const files = [{ path: 'a.md', content: 'Stable\n' }]
  assert.deepEqual(zipFiles(files), zipFiles(files))
})

test('an empty archive has a valid end record', () => {
  assert.equal(zipFiles([]).byteLength, 22)
  assert.deepEqual(readStoredArchive(zipFiles([])), [])
})

test('unsafe paths cannot be exported', () => {
  const unsafe = [
    '', '/absolute.md', 'C:/absolute.md', 'C:relative.md', '\\\\server\\file.md',
    'folder\\file.md', '.', '..', '../escape.md', 'safe/../escape.md', 'safe/./file.md',
    'safe//file.md', 'folder/', 'NUL', 'nul.md', 'folder/CON.txt', 'COM1.md', 'com¹.md',
    'LPT9', 'name.', 'name ', 'folder /file.md', 'a:b.md', 'a?b.md', 'a*b.md',
    'a|b.md', 'a<b.md', 'a>b.md', 'a"b.md', 'a\u0000b.md', 'a\u001fb.md', 'a\u007fb.md',
    'bad\ud800.md', 'bad\udfff.md',
  ]
  for (const path of unsafe) {
    const files = [{ path, content: 'Text' }]
    assert.ok(validateFilePaths(files).length, `Expected validation to reject ${JSON.stringify(path)}`)
    assert.throws(() => zipFiles(files), TypeError)
  }
})

test('ordinary dotfiles and reserved-name prefixes remain valid', () => {
  const files = ['.github/agents/code.agent.md', '.env.example', 'CONTEXT.md', 'COM10.md', 'a..b.md']
    .map(path => ({ path, content: '' }))
  assert.deepEqual(validateFilePaths(files), [])
})

test('path collisions account for case and Unicode normalization', () => {
  for (const paths of [['Readme.md', 'README.md'], ['café.md', 'cafe\u0301.md']]) {
    const files = paths.map(path => ({ path, content: '' }))
    assert.ok(validateFilePaths(files).some(issue => issue.code === 'duplicate-path'))
    assert.throws(() => zipFiles(files), TypeError)
  }
})

test('a file cannot also be a parent directory regardless of ordering or case', () => {
  for (const paths of [['Folder', 'folder/file.md'], ['folder/file.md', 'Folder']]) {
    const files = paths.map(path => ({ path, content: '' }))
    assert.ok(validateFilePaths(files).some(issue => issue.code === 'path-conflict'))
    assert.throws(() => zipFiles(files), TypeError)
  }
})

test('input and content types fail with validation issues', () => {
  for (const files of [null, {}, 'files', [null], [{ content: '' }], [{ path: 42, content: '' }], [{ path: 'a.md', content: 42 }]]) {
    assert.ok(validateFilePaths(files).length)
    assert.throws(() => zipFiles(files), TypeError)
  }
  assert.ok(validateFilePaths([{ path: 'a.md', content: '\ud800' }]).some(issue => issue.code === 'content-unicode'))
})

test('ZIP32 file count and encoded filename limits are checked', () => {
  const countIssues = validateFilePaths(Array(65536))
  assert.equal(countIssues[0].code, 'entry-limit')
  const nameIssues = validateFilePaths([{ path: 'a'.repeat(65536), content: '' }])
  assert.equal(nameIssues[0].code, 'path-length')
  const utf8Issues = validateFilePaths([{ path: 'é'.repeat(32768), content: '' }])
  assert.equal(utf8Issues[0].code, 'path-length')
})
