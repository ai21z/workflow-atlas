import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { readCatalogue, validateCatalogue, compileCatalogue, buildCatalogue } from '../tools/build-catalogue.mjs'
import { CATALOG, SCHEMA_VERSION } from '../factory/catalog.mjs'
import { createRecipe, compile, parseImport } from '../factory/core.mjs'

const data = await readCatalogue()
const baseline = JSON.parse(await readFile(new URL('./fixtures/catalogue-legacy.json', import.meta.url), 'utf8'))
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const content = node => ({ title: node.title, summary: node.summary, sections: node.sections, basis: node.basis, confidence: node.confidence })
const copy = () => structuredClone(data)

test('catalogue validates and committed projections exactly match the source records', async () => {
  assert.doesNotThrow(() => validateCatalogue(data))
  await buildCatalogue({ check: true })
  assert.equal(SCHEMA_VERSION, '3.0')
  assert.deepEqual(compileCatalogue(data).catalog, CATALOG)
})

test('migration preserves every historical route, source, relationship and factory definition', () => {
  const result = compileCatalogue(data)
  assert.deepEqual(result.atlas.nodes.slice(0, baseline.topics.length).map(node => node.id), baseline.topics.map(node => node.id))
  for (const old of baseline.topics) {
    const current = result.atlas.nodes.find(node => node.id === old.id)
    assert.equal(current.parent, old.parent, old.id)
    assert.deepEqual(current.refs, old.refs, old.id)
    for (const id of old.related) assert.ok(current.related.includes(id), `${old.id} lost ${id}`)
    if (!['overview', 'workflow-patterns'].includes(old.id)) assert.equal(digest(content(current)), old.contentHash, `reading content changed: ${old.id}`)
  }
  for (const [id, source] of Object.entries(baseline.sources)) assert.deepEqual(result.atlas.sources[id], source)
  for (const [group, definitions] of Object.entries(baseline.definitions)) for (const old of definitions) {
    assert.equal(digest(result.catalog[group].find(record => record.id === old.id)), old.hash, `definition changed: ${group}/${old.id}`)
  }
  assert.match(result.atlas.nodes.find(node => node.id === 'overview').sections.find(section => section.label === 'What Atlas currently does').text, /bounded correction loops/)
  assert.match(result.atlas.nodes.find(node => node.id === 'workflow-patterns').sections.find(section => section.label === 'Current Atlas boundary').text, /custom process design/)
})

test('type-qualified references preserve distinct meanings for matching raw IDs', () => {
  const result = compileCatalogue(data)
  assert.notEqual(result.atlas.nodes.find(node => node.id === 'architecture').title, result.catalog.stages.find(item => item.id === 'architecture').title)
  assert.equal(result.catalog.stages.find(item => item.id === 'architecture').atlasTopic, 'architecture-decisions')
  assert.ok(result.atlas.nodes.find(node => node.id === 'architecture-decisions').catalog.definitionRefs.includes('stage:architecture'))
})

test('a matching definition ID cannot substitute for a capability topic target', () => {
  const input = copy()
  const skill = structuredClone(input.definitions.find(record => record.type === 'skill'))
  skill.id = skill.spec.id = 'information-retrieval'
  input.definitions.push(skill)
  const relationship = input.relations.find(record => record.type === 'provides-capability')
  relationship.to = 'skill:information-retrieval'
  assert.throws(() => validateCatalogue(input), /provides-capability needs a technology, a capability topic/)
})

test('the generated factory source aliases cannot lose a required format reference', () => {
  for (const alias of ['agents', 'install', 'skills', 'copilotSkills']) {
    const input = copy()
    delete input.manifest.sourceAliases[alias]
    assert.throws(() => compileCatalogue(input), /Catalogue shape is invalid/)
  }
})

test('invalid record shapes, unknown fields and unsafe sources are rejected', () => {
  for (const change of [
    input => { input.topics[0].catalog.kind = 'magic' },
    input => { input.topics[0].catalog.executed = true },
    input => { input.definitions[0].spec.unknownField = 'unsupported' },
    input => { input.definitions[0].spec.inputs = 'not an array' },
    input => { input.sources[0].url = 'javascript:alert(1)' },
    input => { input.sources[0].url = 'https://name:password@example.com/reference' },
  ]) {
    const input = copy()
    change(input)
    assert.throws(() => validateCatalogue(input), /invalid/)
  }
})

test('dangling and mistyped relationships, duplicates and browsing cycles fail before publishing', () => {
  for (const change of [
    input => input.topics.push(structuredClone(input.topics[0])),
    input => { input.relations[0].to = 'topic:missing' },
    input => input.relations.push({ from: 'topic:overview', type: 'uses-definition', to: 'topic:toolchain', sourceRefs: [] }),
    input => input.relations.push({ from: 'topic:overview', type: 'provides-capability', to: 'topic:information-retrieval', sourceRefs: ['input-validation'] }),
    input => { input.relations.find(item => item.from === 'topic:toolchain' && item.type === 'browse-under').to = 'topic:information-retrieval' },
    input => { input.definitions.find(item => item.type === 'recipe').spec.stageIds.push('not-a-stage') },
    input => { input.actions[0].eligibility = 'invented-rule' },
    input => { input.actions[0].runtimeControlId = 'before-write' },
  ]) {
    const input = copy()
    change(input)
    assert.throws(() => validateCatalogue(input), /invalid/)
  }
})

test('reviewed claims require dates, real reading sections and visible source references', () => {
  for (const change of [
    record => { record.catalog.reviewedOn = '' },
    record => { record.catalog.claims = [] },
    record => { record.catalog.claims[0].sectionLabel = 'missing section' },
    record => { record.catalog.claims[0].sourceRefs = [] },
    record => { record.catalog.claims[0].sourceRefs = ['no-source'] },
    record => { record.refs = [] },
  ]) {
    const input = copy()
    change(input.topics.find(record => record.id === 'amazon-neptune'))
    assert.throws(() => validateCatalogue(input), /invalid/)
  }
})

test('reading labels and untrusted-looking prose never become executable code', () => {
  const input = copy()
  input.topics[0].summary = '</script><script>throw new Error("should stay text")</script>'
  const result = compileCatalogue(input)
  assert.ok(!result.files['atlas/data.js'].includes('</script>'))
  assert.ok(result.atlas.nodes.some(node => node.summary === input.topics[0].summary))
})

test('reading a technology is separate from recorded selection and specialist guidance', () => {
  const project = createRecipe('feature-delivery')
  const untouched = structuredClone(project)
  compileCatalogue(data)
  assert.deepEqual(project, untouched)
  project.components = [{ id: 'graph-service', name: 'Graph service', path: '', technologies: [{ id: 'neo4j', version: '' }], commands: { test: '', lint: '', build: '' } }]
  const pack = compile(project)
  const manifest = JSON.parse(pack.files.find(file => file.path === 'manifest.json').content)
  assert.ok(manifest.guidanceSnapshot.records.some(record => record.id === 'technology:generic'))
  assert.ok(!manifest.guidanceSnapshot.records.some(record => record.id === 'technology:graph-data'))
  assert.deepEqual(parseImport(pack.files.find(file => file.path === 'project.json').content), project)
})
