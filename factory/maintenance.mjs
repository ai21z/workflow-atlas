import { validateFilePaths } from './zip.mjs'

const MAX_FACT_TEXT = 2_000_000
const MAX_FILES = 4096
const MAX_ARTIFACT_BYTES = 8 * 1024 * 1024
const MAX_SNAPSHOT_BYTES = 32 * 1024 * 1024
const MAX_JSON_BYTES = 64 * 1024 * 1024
const encoder = new TextEncoder()
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
const str = (value, name, limit = 20000) => {
  if (typeof value !== 'string' || value.length > limit) throw new TypeError(`${name} must be text shorter than ${limit} characters.`)
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) throw new TypeError(`${name} contains unsupported control characters.`)
  return value
}
const textInput = text => {
  str(text, 'Uploaded file', MAX_FACT_TEXT)
  if (encoder.encode(text).byteLength > MAX_FACT_TEXT) throw new TypeError('Uploaded text must be smaller than 2 MB in UTF8.')
  return text
}
const snapshotTextBytes = (text, name, limit) => {
  if (typeof text !== 'string') throw new TypeError(`${name} must be text.`)
  const message = `${name} must be at most ${limit / (1024 * 1024)} MiB in UTF8.`
  if (text.length > limit) throw new TypeError(message)
  const size = encoder.encode(text).byteLength
  if (size > limit) throw new TypeError(message)
  str(text, name, limit)
  return size
}
const uniqueId = (name, index) => `import-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 45)}-${index + 1}`
const fact = (name, index, claim, notes = '') => ({ id: uniqueId(name, index), claim: str(claim, 'Fact claim'), status: 'detected', source: name, revision: '', reviewer: '', notes: str(notes, 'Fact notes') })

function sourcePath(name) {
  str(name, 'File name', 240)
  const issues = validateFilePaths([{ path: name, content: '' }])
  if (issues.length) throw new TypeError(issues[0].message)
  return name
}

function componentCandidate(name, label, technologies, commands = {}) {
  const path = name.includes('/') ? name.slice(0, name.lastIndexOf('/')) : '.'
  return { name: str(label, 'Component name', 200), path: str(path, 'Component path', 200), technologies: technologies.map(technology => ({ id: str(technology.id, 'Technology name', 200), version: str(technology.version, 'Technology version', 200) })), commands: { test: commands.test || '', lint: commands.lint || '', build: commands.build || '' } }
}

function simpleMavenProject(text) {
  const xml = text
  const container = { name: '', text: '', children: [] }
  const stack = [container]
  let position = 0
  let count = 0
  for (const match of xml.matchAll(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<[^>]+>|[^<]+/g)) {
    if (match.index !== position) throw new TypeError('The Maven XML is incomplete.')
    const token = match[0]
    position += token.length
    if (token.startsWith('<?') || token.startsWith('<!--')) continue
    if (token.startsWith('<![CDATA[')) { stack.at(-1).text += token.slice(9, -3); continue }
    if (!token.startsWith('<')) { stack.at(-1).text += token; continue }
    const closing = token.match(/^<\/([A-Za-z_][\w.:-]*)\s*>$/)
    if (closing) {
      if (stack.length === 1 || stack.at(-1).qualifiedName !== closing[1]) throw new TypeError('The Maven XML has mismatched tags.')
      stack.pop()
      continue
    }
    const opening = token.match(/^<([A-Za-z_][\w.:-]*)(?:\s[^<>]*)?\/?\s*>$/)
    if (!opening) throw new TypeError('Unsupported or malformed Maven XML. Only simple declarations are read.')
    if (++count > 50000) throw new TypeError('Choose a Maven XML document with no more than 50000 elements.')
    const node = { name: opening[1].split(':').at(-1), qualifiedName: opening[1], text: '', children: [] }
    stack.at(-1).children.push(node)
    if (!/\/\s*>$/.test(token)) stack.push(node)
  }
  if (position !== xml.length || stack.length !== 1 || container.text.trim() || container.children.length !== 1 || container.children[0].name !== 'project') throw new TypeError('Expected a complete Maven project XML document.')
  return container.children[0]
}

function reportFacts(name, report) {
  if (!plain(report) || Object.keys(report).some(key => !['facts', 'components'].includes(key))) throw new TypeError('A project report contains only facts and components arrays.')
  if (report.facts !== undefined && !Array.isArray(report.facts)) throw new TypeError('Report facts must be an array.')
  if (report.components !== undefined && !Array.isArray(report.components)) throw new TypeError('Report components must be an array.')
  if ((report.facts?.length || 0) > 100 || (report.components?.length || 0) > 20) throw new TypeError('A report can contain up to 100 facts and 20 components.')
  const facts = (report.facts || []).map((entry, index) => {
    if (!plain(entry) || Object.keys(entry).some(key => !['id', 'claim', 'status', 'source', 'revision', 'reviewer', 'notes'].includes(key))) throw new TypeError('A report fact has unsupported fields.')
    const claim = str(entry.claim, 'Fact claim')
    const originalStatus = entry.status === undefined ? '' : str(entry.status, 'Original fact status', 100)
    const originalReviewer = entry.reviewer === undefined ? '' : str(entry.reviewer, 'Original reviewer', 200)
    const originalNotes = entry.notes === undefined ? '' : str(entry.notes, 'Original notes')
    const originalId = entry.id === undefined ? '' : str(entry.id, 'Original fact id', 200)
    return {
      ...fact(name, index, claim),
      status: 'inferred',
      source: entry.source === undefined ? name : str(entry.source, 'Fact source', 2000),
      revision: entry.revision === undefined ? '' : str(entry.revision, 'Source revision', 200),
      notes: str([`Imported claim from ${name}. Confirm it against its source.`, originalId && `Original id: ${originalId}.`, originalStatus && `Report status: ${originalStatus}.`, originalReviewer && `Report reviewer: ${originalReviewer}.`, originalNotes].filter(Boolean).join('\n'), 'Imported fact notes')
    }
  })
  const components = (report.components || []).map(entry => {
    if (!plain(entry) || Object.keys(entry).some(key => !['name', 'path', 'technologies', 'commands'].includes(key))) throw new TypeError('A report component has unsupported fields.')
    const label = str(entry.name, 'Component name', 200)
    const path = str(entry.path, 'Component path', 200)
    if (path !== '.') sourcePath(path)
    if (!Array.isArray(entry.technologies) || entry.technologies.length > 30) throw new TypeError('Component technologies must be an array with up to 30 entries.')
    const technologies = entry.technologies.map(technology => {
      if (!plain(technology) || Object.keys(technology).some(key => !['id', 'version'].includes(key))) throw new TypeError('A technology has unsupported fields.')
      return { id: str(technology.id, 'Technology name', 200), version: str(technology.version ?? '', 'Technology version', 200) }
    })
    if (!plain(entry.commands) || Object.keys(entry.commands).some(key => !['test', 'lint', 'build'].includes(key))) throw new TypeError('Component commands contain only test, lint and build text.')
    const commands = Object.fromEntries(['test', 'lint', 'build'].map(key => [key, str(entry.commands[key] ?? '', `${key} command`, 4000)]))
    return { name: label, path, technologies, commands }
  })
  return { facts, components, warnings: ['This report supplies claims and component candidates. None has been independently confirmed by Atlas.'] }
}

/** Read only the supplied file. No filesystem discovery, code execution or network retrieval. */
export function extractProjectFacts(name, text) {
  sourcePath(name)
  textInput(text)
  const basename = name.split('/').at(-1).toLowerCase()
  if (basename === 'package.json') {
    const data = JSON.parse(text)
    if (!plain(data)) throw new TypeError('package.json must contain an object.')
    if (data.name !== undefined) str(data.name, 'Package name', 200)
    if (data.version !== undefined) str(data.version, 'Package version', 200)
    for (const key of ['dependencies', 'devDependencies', 'scripts']) if (data[key] !== undefined && !plain(data[key])) throw new TypeError(`${key} must be an object.`)
    const facts = []
    const add = (claim, notes) => facts.push(fact(name, facts.length, claim, notes))
    if (data.name) add(`Package name declared: ${data.name}`)
    if (data.version) add(`Package version declared: ${data.version}`)
    const technologies = []
    const known = { react: 'react', typescript: 'typescript', vue: 'vue', '@angular/core': 'angular' }
    for (const key of ['dependencies', 'devDependencies']) {
      const entries = Object.entries(data[key] || {})
      if (entries.length > 500) throw new TypeError('A manifest can contain up to 500 declarations per dependency group.')
      for (const [dependency, version] of entries) {
        str(version, 'Dependency version', 200)
        if (Object.hasOwn(known, dependency)) {
          add(`${key} declares ${dependency}: ${version}`, 'A declared version range is not evidence of an installed or tested version.')
          if (!technologies.some(item => item.id === known[dependency])) technologies.push({ id: known[dependency], version })
        }
      }
    }
    const commands = {}
    for (const key of ['test', 'lint', 'build']) {
      const value = data.scripts?.[key]
      if (value !== undefined) {
        commands[key] = str(value, `${key} script`, 4000)
        add(`Script ${key} as supplied: ${value}`, 'This is the script body. Confirm the package manager and execution context before using it as a command.')
      }
    }
    return { facts, components: [componentCandidate(name, data.name || 'Imported package', technologies, commands)], warnings: ['Only this supplied manifest was inspected. Lockfiles, installed versions, directories and command execution were not checked.', 'Command candidates are exact script bodies. Confirm their working directory and package manager context before adopting them.'] }
  }
  if (basename === 'pom.xml') {
    if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new TypeError('XML document types and entities are not supported by this lightweight importer.')
    const project = simpleMavenProject(text)
    const decode = value => value.trim().replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&apos;', "'").replaceAll('&amp;', '&')
    const child = (node, tag) => node?.children.find(entry => entry.name === tag)
    const value = (node, tag) => decode(child(node, tag)?.text || '')
    const facts = []
    const add = claim => facts.push(fact(name, facts.length, claim, 'A declaration in this supplied file. Maven inheritance, profiles and property resolution were not evaluated.'))
    const technologies = []
    const properties = child(project, 'properties')
    const java = value(properties, 'java.version') || value(properties, 'maven.compiler.release') || value(properties, 'maven.compiler.source')
    if (java) { add(`Java version property declared: ${java}`); technologies.push({ id: 'java', version: java }) }
    const parent = child(project, 'parent')
    const spring = value(parent, 'artifactId') === 'spring-boot-starter-parent' ? value(parent, 'version') : value(properties, 'spring-boot.version')
    if (spring) { add(`Spring Boot version declared: ${spring}`); technologies.push({ id: 'spring-boot', version: spring }) }
    const artifactId = value(project, 'artifactId')
    if (artifactId) add(`Maven artifact declared: ${artifactId}`)
    return { facts, components: [componentCandidate(name, artifactId || 'Imported Maven component', technologies)], warnings: ['Only simple declarations were read. Effective Maven configuration and test/build commands remain unresolved.'] }
  }
  if (basename.endsWith('.json')) return reportFacts(name, JSON.parse(text))
  throw new TypeError('Import package.json, pom.xml or a JSON project report with facts and components.')
}

function checkedFiles(files) {
  if (!Array.isArray(files) || files.length > MAX_FILES) throw new TypeError(`A file snapshot contains up to ${MAX_FILES} text files.`)
  const issues = validateFilePaths(files)
  if (issues.length) throw new TypeError(issues.map(issue => issue.message).join('\n'))
  let size = 0
  for (const file of files) {
    if (!plain(file) || Object.keys(file).some(key => !['path', 'content'].includes(key))) throw new TypeError('Snapshot files contain only path and content.')
    size += snapshotTextBytes(file.content, 'Snapshot artifact', MAX_ARTIFACT_BYTES)
    if (size > MAX_SNAPSHOT_BYTES) throw new TypeError('A file snapshot must be at most 32 MiB in combined UTF8 content.')
  }
  return files.map(file => ({ path: file.path, content: file.content }))
}

export function parseFileBundle(text) {
  snapshotTextBytes(text, 'Snapshot JSON', MAX_JSON_BYTES)
  const data = JSON.parse(text)
  if (Array.isArray(data)) return checkedFiles(data)
  if (!plain(data) || Object.keys(data).some(key => !['files', 'schemaVersion', 'kind'].includes(key))) throw new TypeError('A file snapshot contains a files array with path and content text.')
  return checkedFiles(data.files)
}

/** A three-way text comparison. Conflicts have no default resolution. */
export function compareFiles(baselineFiles, existingFiles, generatedFiles) {
  const identity = path => path.normalize('NFC').toLowerCase()
  const index = files => new Map(checkedFiles(files).map(file => [identity(file.path), file]))
  const baseline = index(baselineFiles)
  const existing = index(existingFiles)
  const generated = index(generatedFiles)
  const keys = [...new Set([...baseline.keys(), ...existing.keys(), ...generated.keys()])]
  const entries = keys.map(key => ({ key, path: (generated.get(key) || existing.get(key) || baseline.get(key)).path })).sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  const pathIssues = validateFilePaths(entries.map(({ path }) => ({ path, content: '' })))
  if (pathIssues.length) throw new TypeError(pathIssues.map(issue => issue.message).join('\n'))
  return entries.map(({ key, path }) => {
    const baseFile = baseline.get(key)
    const localFile = existing.get(key)
    const nextFile = generated.get(key)
    const base = baseFile?.content ?? null
    const local = localFile?.content ?? null
    const next = nextFile?.content ?? null
    let status, resolution
    if (local === next) { status = 'unchanged'; resolution = local === null ? 'remove' : 'existing' }
    else if (local === base) { status = next === null ? 'removed' : base === null ? 'added' : 'regenerated'; resolution = next === null ? 'remove' : 'generated' }
    else if (next === base) { status = local === null ? 'local-removed' : base === null ? 'local-added' : 'local-edit'; resolution = local === null ? 'remove' : 'existing' }
    else { status = 'conflict'; resolution = '' }
    return { path, status, baseline: base, existing: local, generated: next, resolution, baselinePath: baseFile?.path || null, existingPath: localFile?.path || null, generatedPath: nextFile?.path || null }
  })
}

/**
 * Explain reopened file differences using generation captured at the time of opening.
 * That generation is a session reference, not evidence of how supplied files were made.
 * No resolution is selected here. The original supplied content remains untouched.
 */
export function reviewOpenedFiles(openedFiles, generationAtOpen, generatedFiles) {
  const referenceAvailable = generationAtOpen !== null && generationAtOpen !== undefined
  const rows = compareFiles(referenceAvailable ? generationAtOpen : [], openedFiles, generatedFiles).map(row => {
    const differsNow = row.existing !== row.generated
    const differedOnOpen = referenceAvailable ? row.existing !== row.baseline : null
    const generationChanged = referenceAvailable ? row.generated !== row.baseline : null
    const status = !differsNow ? 'unchanged'
      : !referenceAvailable ? 'unknown-origin'
      : !differedOnOpen ? 'session-update'
      : generationChanged ? 'mixed-difference' : 'opened-difference'
    return {
      path: row.path,
      status,
      change: !differsNow ? null : row.existing === null ? 'added' : row.generated === null ? 'removed' : 'changed',
      requiresReview: differsNow && status !== 'session-update',
      differedOnOpen,
      generationChanged,
      opened: row.existing,
      generatedAtOpen: referenceAvailable ? row.baseline : null,
      generated: row.generated,
      openedPath: row.existingPath,
      generatedAtOpenPath: referenceAvailable ? row.baselinePath : null,
      generatedPath: row.generatedPath
    }
  })
  return {
    referenceAvailable,
    rows,
    differences: rows.filter(row => row.status !== 'unchanged'),
    sessionUpdates: rows.filter(row => row.status === 'session-update'),
    reviewRequired: rows.filter(row => row.requiresReview),
    unchanged: rows.filter(row => row.status === 'unchanged')
  }
}

export function resolveComparison(rows, choices = {}) {
  if (!Array.isArray(rows) || !plain(choices)) throw new TypeError('Comparison rows and explicit choices are required.')
  const files = []
  for (const row of rows) {
    const choice = Object.hasOwn(choices, row.path) ? choices[row.path] : row.resolution
    if (!['generated', 'existing', 'remove'].includes(choice)) throw new TypeError(`Resolve the conflict in ${row.path} before exporting.`)
    if (choice === 'remove') continue
    const content = row[choice]
    if (typeof content !== 'string') throw new TypeError(`${row.path} has no ${choice} content. Select removal explicitly.`)
    files.push({ path: row[`${choice}Path`] || row.path, content })
  }
  return checkedFiles(files)
}
