import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readCatalogue, validateCatalogue, compileCatalogue, graphEdges, coverageReport } from '../tools/build-catalogue.mjs'

const data = await readCatalogue()
const copy = () => structuredClone(data)
const withoutSubjects = () => {
  const input = copy()
  delete input.navigation.subjects
  return input
}

test('subject navigation projects the authored reading groups without creating topics', () => {
  assert.deepEqual(data.navigation.subjects.map(subject => subject.id), ['ci-pipelines', 'containers', 'access-controls', 'workflow-measurements'])
  const result = compileCatalogue(data)
  assert.deepEqual(result.atlas.catalog.subjects, data.navigation.subjects)
  assert.deepEqual(result.atlas.catalog.subjects.map(subject => subject.nodeIds.length), [4, 1, 3, 5])
  assert.deepEqual(result.atlas.catalog.subjects.find(subject => subject.id === 'containers').nodeIds, ['docker'])
  assert.match(result.atlas.catalog.subjects.find(subject => subject.id === 'containers').limits, /Docker only/)
  assert.match(result.atlas.catalog.subjects.find(subject => subject.id === 'access-controls').limits, /not a comprehensive security review/)
  assert.match(result.atlas.catalog.subjects.find(subject => subject.id === 'workflow-measurements').limits, /not a full observability catalogue/)
})

test('subjects remain optional for legacy catalogues and may be absent or empty', () => {
  const legacy = withoutSubjects()
  assert.doesNotThrow(() => validateCatalogue(legacy))
  assert.equal(Object.hasOwn(compileCatalogue(legacy).atlas.catalog, 'subjects'), false)
  legacy.navigation.subjects = []
  assert.doesNotThrow(() => validateCatalogue(legacy))
  assert.deepEqual(compileCatalogue(legacy).atlas.catalog.subjects, [])
})

test('subject records reject missing fields, blank text and unknown fields', () => {
  for (const field of ['id', 'title', 'summary', 'limits', 'nodeIds']) {
    const input = copy()
    delete input.navigation.subjects[0][field]
    assert.throws(() => validateCatalogue(input), /Catalogue shape is invalid/, `missing ${field}`)
  }
  for (const field of ['title', 'summary', 'limits']) {
    for (const blank of ['', ' \t\n ']) {
      const input = copy()
      input.navigation.subjects[0][field] = blank
      assert.throws(() => validateCatalogue(input), /Catalogue shape is invalid/, `blank ${field}`)
    }
  }
  const input = copy()
  input.navigation.subjects[0].coverage = 'complete'
  assert.throws(() => validateCatalogue(input), /Catalogue shape is invalid/)
})

test('subject membership must be nonempty, unique and correctly shaped', () => {
  for (const nodeIds of [[], ['docker', 'docker'], ['topic:docker'], ['Docker'], [''], 'docker', [null]]) {
    const input = copy()
    input.navigation.subjects[0].nodeIds = nodeIds
    assert.throws(() => validateCatalogue(input), /Catalogue shape is invalid/, JSON.stringify(nodeIds))
  }
})

test('subject IDs are unique within the subject list', () => {
  const input = copy()
  input.navigation.subjects.push(structuredClone(input.navigation.subjects[0]))
  assert.throws(() => validateCatalogue(input), /duplicate subject ID/)
})

test('subjects reject unknown topics, definition IDs, overview and map clusters', () => {
  const definitionOnly = data.definitions.find(definition => !data.topics.some(topic => topic.id === definition.id)).id
  for (const id of ['no-such-topic', definitionOnly, 'overview', ...data.navigation.clusters.map(cluster => cluster.id)]) {
    const input = copy()
    input.navigation.subjects[0].nodeIds = [id]
    assert.throws(() => validateCatalogue(input), /Catalogue references are invalid/, id)
  }
})

test('a non-cluster topic directly under overview remains eligible for subject membership', () => {
  const input = copy()
  input.relations.find(relation => relation.from === 'topic:permissions' && relation.type === 'browse-under').to = 'topic:overview'
  assert.equal(input.navigation.clusters.some(cluster => cluster.id === 'permissions'), false)
  assert.doesNotThrow(() => validateCatalogue(input))
  const result = compileCatalogue(input).atlas
  assert.equal(result.nodes.find(node => node.id === 'permissions').parent, 'overview')
  assert.ok(result.catalog.subjects.find(subject => subject.id === 'access-controls').nodeIds.includes('permissions'))
})

test('a topic may belong to two subjects without duplicating or moving it', () => {
  const input = copy()
  input.navigation.subjects[1].nodeIds.push('github-actions')
  assert.doesNotThrow(() => validateCatalogue(input))
  assert.deepEqual(compileCatalogue(input).atlas.nodes, compileCatalogue(data).atlas.nodes)
})

test('subject navigation leaves graph, hierarchy, clusters, definitions and coverage unchanged', async () => {
  const legacy = withoutSubjects()
  const before = compileCatalogue(legacy)
  const after = compileCatalogue(data)
  assert.deepEqual(graphEdges(data), graphEdges(legacy))
  assert.deepEqual(after.atlas.nodes, before.atlas.nodes)
  assert.deepEqual(after.atlas.catalog.clusters, before.atlas.catalog.clusters)
  assert.deepEqual(after.atlas.catalog.clusterDigests, before.atlas.catalog.clusterDigests)
  assert.deepEqual(after.atlas.catalog.collections, before.atlas.catalog.collections)
  assert.deepEqual(after.atlas.catalog.definitions, before.atlas.catalog.definitions)
  assert.deepEqual(after.atlas.catalog.claims, before.atlas.catalog.claims)
  assert.deepEqual(after.catalog, before.catalog)
  assert.equal(after.files['factory/catalog.mjs'], before.files['factory/catalog.mjs'])
  const coverage = JSON.parse(await readFile(new URL('../catalogue/coverage.json', import.meta.url), 'utf8'))
  assert.deepEqual(coverageReport(data, coverage), coverageReport(legacy, coverage))
  const { subjects, ...remainingCatalogue } = after.atlas.catalog
  assert.deepEqual(remainingCatalogue, before.atlas.catalog)
})
