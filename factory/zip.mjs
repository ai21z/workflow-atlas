const encoder = new TextEncoder()
const ZIP32_MAX = 0xffffffff
const ZIP_ENTRY_MAX = 0xffff
const UTF8_FLAG = 0x0800
const FIXED_DOS_DATE = 0x0021
const reservedName = /^(?:con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i
const forbiddenCharacter = /[\u0000-\u001f\u007f<>:"|?*]/

const crcTable = new Uint32Array(256)
for (let index = 0; index < 256; index += 1) {
  let value = index
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0)
  }
  crcTable[index] = value >>> 0
}

function crc32(bytes) {
  let value = ZIP32_MAX
  for (const byte of bytes) value = (value >>> 8) ^ crcTable[(value ^ byte) & 0xff]
  return (value ^ ZIP32_MAX) >>> 0
}

function foldPath(path) {
  return path.normalize('NFC').toLowerCase()
}

function hasUnpairedSurrogate(value) {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true
      index += 1
    } else if (unit >= 0xdc00 && unit <= 0xdfff) return true
  }
  return false
}

/**
 * Validate a list of UTF8 text files before building an archive.
 * Returns { code, path, message } issues. An empty array means valid.
 * Validation checks archive paths and portability, not repository existence.
 */
export function validateFilePaths(files) {
  if (!Array.isArray(files)) {
    return [{ code: 'files-type', path: '', message: 'Files must be an array.' }]
  }
  if (files.length > ZIP_ENTRY_MAX) {
    return [{ code: 'entry-limit', path: '', message: 'A ZIP32 pack cannot contain more than 65535 files.' }]
  }

  const issues = []
  const paths = new Map()
  const validPaths = []
  for (const [index, file] of files.entries()) {
    const path = typeof file?.path === 'string' ? file.path : ''
    const issue = (code, message) => issues.push({ code, path, message: `File ${index + 1}: ${message}` })
    if (typeof file?.path !== 'string' || !path) {
      issue('path-type', 'A nonempty relative path is required.')
      continue
    }
    if (typeof file.content !== 'string') issue('content-type', 'Content must be a text string.')
    else if (hasUnpairedSurrogate(file.content)) issue('content-unicode', 'Content contains an unpaired Unicode surrogate.')
    if (hasUnpairedSurrogate(path)) {
      issue('path-unicode', 'The path contains an unpaired Unicode surrogate.')
      continue
    }
    if (path.startsWith('/') || path.includes('\\') || /^[a-z]:/i.test(path)) {
      issue('absolute-path', 'Use a relative path with forward slashes.')
      continue
    }
    const segments = path.split('/')
    if (segments.some(segment => !segment || segment === '.' || segment === '..')) {
      issue('path-segment', 'Empty, dot and parent path segments are not allowed.')
      continue
    }
    if (segments.some(segment => forbiddenCharacter.test(segment))) {
      issue('path-character', 'Path segments contain a control character or a reserved filename character.')
      continue
    }
    if (segments.some(segment => /[. ]$/.test(segment) || reservedName.test(segment))) {
      issue('reserved-name', 'Reserved Windows names and segments ending with a dot or space are not allowed.')
      continue
    }
    if (encoder.encode(path).byteLength > ZIP_ENTRY_MAX) {
      issue('path-length', 'The encoded filename exceeds the ZIP32 filename limit.')
      continue
    }
    const key = foldPath(path)
    if (paths.has(key)) {
      issue('duplicate-path', `The path duplicates ${paths.get(key)} after Unicode normalization and case folding.`)
      continue
    }
    paths.set(key, path)
    validPaths.push({ path, key })
  }
  for (const { path, key } of validPaths) {
    const segments = key.split('/')
    for (let length = 1; length < segments.length; length += 1) {
      const parent = segments.slice(0, length).join('/')
      if (paths.has(parent)) {
        issues.push({ code: 'path-conflict', path, message: `${paths.get(parent)} is a file and cannot also be a parent directory.` })
        break
      }
    }
  }
  return issues
}

/**
 * Create a deterministic, uncompressed ZIP32 archive from { path, content } files.
 * Uses UTF8 names and content, with every timestamp fixed to 1980-01-01.
 * Throws TypeError for invalid input and RangeError for ZIP32 size limits.
 */
export function zipFiles(files) {
  const issues = validateFilePaths(files)
  if (issues.length) throw new TypeError(issues.map(issue => issue.message).join('\n'))

  let localSize = 0
  let centralSize = 0
  const entries = files.map(file => {
    const name = encoder.encode(file.path)
    const content = encoder.encode(file.content)
    const entry = { name, content, offset: localSize, checksum: crc32(content) }
    localSize += 30 + name.byteLength + content.byteLength
    centralSize += 46 + name.byteLength
    if (content.byteLength > ZIP32_MAX || localSize > ZIP32_MAX || centralSize > ZIP32_MAX) {
      throw new RangeError('The pack exceeds ZIP32 size limits.')
    }
    return entry
  })
  const archiveSize = localSize + centralSize + 22
  if (archiveSize > ZIP32_MAX) throw new RangeError('The pack exceeds ZIP32 size limits.')
  const archive = new Uint8Array(archiveSize)
  const view = new DataView(archive.buffer)
  const word = (offset, value) => view.setUint16(offset, value, true)
  const dword = (offset, value) => view.setUint32(offset, value, true)

  for (const entry of entries) {
    const { name, content, offset, checksum } = entry
    dword(offset, 0x04034b50)
    word(offset + 4, 20)
    word(offset + 6, UTF8_FLAG)
    word(offset + 8, 0)
    word(offset + 10, 0)
    word(offset + 12, FIXED_DOS_DATE)
    dword(offset + 14, checksum)
    dword(offset + 18, content.byteLength)
    dword(offset + 22, content.byteLength)
    word(offset + 26, name.byteLength)
    word(offset + 28, 0)
    archive.set(name, offset + 30)
    archive.set(content, offset + 30 + name.byteLength)
  }

  let centralOffset = localSize
  for (const { name, content, offset, checksum } of entries) {
    dword(centralOffset, 0x02014b50)
    word(centralOffset + 4, 20)
    word(centralOffset + 6, 20)
    word(centralOffset + 8, UTF8_FLAG)
    word(centralOffset + 10, 0)
    word(centralOffset + 12, 0)
    word(centralOffset + 14, FIXED_DOS_DATE)
    dword(centralOffset + 16, checksum)
    dword(centralOffset + 20, content.byteLength)
    dword(centralOffset + 24, content.byteLength)
    word(centralOffset + 28, name.byteLength)
    word(centralOffset + 30, 0)
    word(centralOffset + 32, 0)
    word(centralOffset + 34, 0)
    word(centralOffset + 36, 0)
    dword(centralOffset + 38, 0)
    dword(centralOffset + 42, offset)
    archive.set(name, centralOffset + 46)
    centralOffset += 46 + name.byteLength
  }
  dword(centralOffset, 0x06054b50)
  word(centralOffset + 4, 0)
  word(centralOffset + 6, 0)
  word(centralOffset + 8, entries.length)
  word(centralOffset + 10, entries.length)
  dword(centralOffset + 12, centralSize)
  dword(centralOffset + 16, localSize)
  word(centralOffset + 20, 0)
  return archive
}

/**
 * Read selected UTF8 text entries from a bounded ZIP32 archive.
 * Supports stored and ordinary raw DEFLATE entries, including data descriptors.
 * The selector receives a path and all file paths before any decompression.
 * No paths are written, imported instructions are never executed.
 */
export async function unzipTextFiles(input, options = {}) {
  const limits = {
    maxArchiveBytes: 32 * 1024 * 1024,
    maxEntries: 4096,
    maxFileBytes: 8 * 1024 * 1024,
    maxTotalBytes: 32 * 1024 * 1024,
    ...options,
  }
  if (!(input instanceof Uint8Array)) throw new TypeError('The archive must contain bytes.')
  if (input.byteLength > limits.maxArchiveBytes) throw new RangeError('The ZIP exceeds the 32 MB archive limit.')
  if (input.byteLength < 22) throw new TypeError('The ZIP is incomplete.')
  const view = new DataView(input.buffer, input.byteOffset, input.byteLength)
  const decoder = new TextDecoder('utf-8', { fatal: true })
  let end = -1
  for (let offset = input.byteLength - 22; offset >= Math.max(0, input.byteLength - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50 && offset + 22 + view.getUint16(offset + 20, true) === input.byteLength) { end = offset; break }
  }
  if (end < 0) throw new TypeError('The ZIP end record is missing or incomplete.')
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true)) throw new TypeError('Split ZIP archives are not supported. Choose an ordinary ZIP or a project folder.')
  const count = view.getUint16(end + 10, true)
  const centralSize = view.getUint32(end + 12, true)
  const centralStart = view.getUint32(end + 16, true)
  if (count === 0xffff || centralSize === ZIP32_MAX || centralStart === ZIP32_MAX) throw new TypeError('ZIP64 is not supported. Choose a smaller project pack or a project folder.')
  if (count !== view.getUint16(end + 8, true) || count > limits.maxEntries) throw new RangeError(`Choose a ZIP with no more than ${limits.maxEntries} entries.`)
  if (centralStart + centralSize !== end || centralStart > end) throw new TypeError('The ZIP directory has invalid bounds.')
  const entries = []
  const allNames = new Set()
  let offset = centralStart
  for (let index = 0; index < count; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw new TypeError('The ZIP directory is incomplete.')
    const flags = view.getUint16(offset + 8, true)
    const method = view.getUint16(offset + 10, true)
    const checksum = view.getUint32(offset + 16, true)
    const compressedSize = view.getUint32(offset + 20, true)
    const size = view.getUint32(offset + 24, true)
    const nameLength = view.getUint16(offset + 28, true)
    const extraLength = view.getUint16(offset + 30, true)
    const commentLength = view.getUint16(offset + 32, true)
    const external = view.getUint32(offset + 38, true)
    const localOffset = view.getUint32(offset + 42, true)
    if (view.getUint16(offset + 34, true)) throw new TypeError('Split ZIP entries are not supported.')
    if (compressedSize === ZIP32_MAX || size === ZIP32_MAX || localOffset === ZIP32_MAX) throw new TypeError('ZIP64 entries are not supported.')
    if (flags & ~0x080e) throw new TypeError('Encrypted or unsupported ZIP entries are not supported.')
    if (method !== 0 && method !== 8) throw new TypeError('Choose a ZIP using stored or DEFLATE compression.')
    if (offset + 46 + nameLength + extraLength + commentLength > end || !nameLength) throw new TypeError('A ZIP filename is missing or incomplete.')
    const nameBytes = input.subarray(offset + 46, offset + 46 + nameLength)
    let path
    try { path = decoder.decode(nameBytes) } catch { throw new TypeError('ZIP filenames must use UTF8. Choose a project folder instead.') }
    const directory = path.endsWith('/')
    const checkedPath = directory ? path.slice(0, -1) : path
    const issues = validateFilePaths([{ path: checkedPath, content: '' }])
    if (issues.length) throw new TypeError(`Unsafe ZIP path. ${issues[0].message}`)
    const key = foldPath(checkedPath)
    if (allNames.has(key)) throw new TypeError(`The ZIP has duplicate paths: ${checkedPath}.`)
    allNames.add(key)
    const type = (external >>> 16) & 0xf000
    if (type && type !== 0x8000 && type !== 0x4000) throw new TypeError(`ZIP links and special files are not supported: ${path}.`)
    if (localOffset + 30 > centralStart || view.getUint32(localOffset, true) !== 0x04034b50) throw new TypeError('A ZIP local header is missing or invalid.')
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const dataStart = localOffset + 30 + localNameLength + localExtraLength
    if (view.getUint16(localOffset + 6, true) !== flags || view.getUint16(localOffset + 8, true) !== method || localNameLength !== nameLength || dataStart + compressedSize > centralStart) throw new TypeError('A ZIP entry has conflicting headers or invalid bounds.')
    if (dataStart > centralStart || !nameBytes.every((byte, i) => byte === input[localOffset + 30 + i])) throw new TypeError('A ZIP entry has conflicting filenames.')
    if (!(flags & 8) && (view.getUint32(localOffset + 14, true) !== checksum || view.getUint32(localOffset + 18, true) !== compressedSize || view.getUint32(localOffset + 22, true) !== size)) throw new TypeError('A ZIP entry has conflicting sizes or checksum records.')
    if (method === 0 && compressedSize !== size) throw new TypeError('A stored ZIP entry has conflicting sizes.')
    entries.push({ path, directory, method, checksum, compressedSize, size, localOffset, dataStart })
    offset += 46 + nameLength + extraLength + commentLength
  }
  if (offset !== centralStart + centralSize) throw new TypeError('The ZIP directory size is inconsistent.')
  const ranges = [...entries].sort((a, b) => a.localOffset - b.localOffset)
  for (let index = 1; index < ranges.length; index++) if (ranges[index].localOffset < ranges[index - 1].dataStart + ranges[index - 1].compressedSize) throw new TypeError('ZIP entries overlap.')
  const fileEntries = entries.filter(entry => !entry.directory)
  const issues = validateFilePaths(fileEntries.map(entry => ({ path: entry.path, content: '' })))
  if (issues.length) throw new TypeError(`Unsafe ZIP paths. ${issues[0].message}`)
  const paths = fileEntries.map(entry => entry.path)
  const selected = fileEntries.filter(entry => typeof limits.select !== 'function' || limits.select(entry.path, paths))
  let total = 0
  for (const entry of selected) {
    if (entry.size > limits.maxFileBytes) throw new RangeError(`Selected file exceeds the 8 MB limit: ${entry.path}.`)
    total += entry.size
    if (total > limits.maxTotalBytes) throw new RangeError('The selected text files exceed the 32 MB expanded limit.')
  }
  const files = []
  const warnings = []
  for (const entry of selected) {
    const source = input.subarray(entry.dataStart, entry.dataStart + entry.compressedSize)
    let output = source
    if (entry.method === 8) {
      let decompressor
      try { decompressor = new DecompressionStream('deflate-raw') }
      catch { throw new TypeError('This browser cannot open compressed ZIPs. Extract the ZIP and choose its project folder or project.json.') }
      const reader = new Blob([source]).stream().pipeThrough(decompressor).getReader()
      const chunks = []
      let size = 0
      try {
        for (;;) {
          const result = await reader.read()
          if (result.done) break
          size += result.value.byteLength
          if (size > entry.size || size > limits.maxFileBytes) { await reader.cancel(); throw new RangeError(`Expanded ZIP entry exceeds its declared size: ${entry.path}.`) }
          chunks.push(result.value)
        }
      } catch (error) { throw new TypeError(`Unable to decompress ${entry.path}. ${error.message}`) }
      output = new Uint8Array(size)
      let position = 0
      for (const chunk of chunks) { output.set(chunk, position); position += chunk.byteLength }
    }
    if (output.byteLength !== entry.size || crc32(output) !== entry.checksum) throw new TypeError(`The ZIP entry is incomplete or damaged: ${entry.path}.`)
    let content
    try { content = decoder.decode(output) } catch {
      if (typeof limits.skipNonText === 'function' && limits.skipNonText(entry.path)) { warnings.push(`Manifest-listed artifact is not UTF8 text and was skipped: ${entry.path}.`); continue }
      throw new TypeError(`Selected artifact is not UTF8 text: ${entry.path}.`)
    }
    if (content.includes('\0')) {
      if (typeof limits.skipNonText === 'function' && limits.skipNonText(entry.path)) { warnings.push(`Manifest-listed artifact contains binary data and was skipped: ${entry.path}.`); continue }
      throw new TypeError(`Selected artifact contains binary data: ${entry.path}.`)
    }
    files.push({ path: entry.path, content })
  }
  return { files, skipped: fileEntries.length - files.length, warnings }
}
