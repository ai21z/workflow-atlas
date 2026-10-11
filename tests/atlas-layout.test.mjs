import test from 'node:test'
import assert from 'node:assert/strict'
import { buildAtlasLayout } from '../tools/atlas-layout.mjs'
import { compileCatalogue, readCatalogue, graphEdges } from '../tools/build-catalogue.mjs'

const data = await readCatalogue()
const compiled = compileCatalogue(data)
const atlas = compiled.atlas
const input = { nodes: atlas.nodes, clusters: atlas.catalog.clusters, definitions: atlas.catalog.definitions, edges: atlas.catalog.edges }
const layout = atlas.catalog.layout2d
const shuffled = values => [...values].reverse()
const coordinates = result => result.nodes.map(({ id, x, y, radius, labelRank, clusterId }) => ({ id, x, y, radius, labelRank, clusterId }))

test('the versioned map includes every topic and only the supported definition shapes', () => {
  assert.equal(layout.version, 1)
  assert.deepEqual(layout.nodes.filter(node => node.kind === 'topic').map(node => node.topicId).sort(), atlas.nodes.map(node => node.id).sort())
  assert.deepEqual(layout.nodes.filter(node => node.kind !== 'topic').map(node => node.definitionRef).sort(), atlas.catalog.definitions.filter(record => ['practice', 'technology'].includes(record.type)).map(record => record.ref).sort())
  assert.equal(new Set(layout.nodes.map(node => node.id)).size, layout.nodes.length)
  assert.deepEqual([...new Set(layout.nodes.map(node => node.kind))].sort(), ['practice', 'technology', 'topic'])
})

test('layout is deterministic across repeated builds and input ordering without mutating inputs', () => {
  const original = structuredClone(input)
  assert.deepEqual(buildAtlasLayout(input), layout)
  assert.deepEqual(buildAtlasLayout(Object.fromEntries(Object.entries(input).map(([key, values]) => [key, shuffled(values)]))), layout)
  assert.deepEqual(input, original)
})

test('coordinates are finite, bounded and separated for the current catalogue', () => {
  assert.ok(layout.width > 0 && layout.height > 0)
  for (const node of layout.nodes) {
    assert.ok(Number.isFinite(node.x) && Number.isFinite(node.y), node.id)
    assert.ok(node.x >= node.radius && node.x <= layout.width - node.radius, node.id)
    assert.ok(node.y >= node.radius && node.y <= layout.height - node.radius, node.id)
    assert.ok(node.radius >= 6 && node.radius <= 14)
  }
  for (let a = 0; a < layout.nodes.length; a++) for (let b = a + 1; b < layout.nodes.length; b++) {
    const left = layout.nodes[a], right = layout.nodes[b]
    assert.ok(Math.hypot(left.x - right.x, left.y - right.y) >= left.radius + right.radius + 13.9, `${left.id} intersects ${right.id}`)
  }
})

test('linked definitions share their article cluster and unlinked definitions use Factory', () => {
  const byId = new Map(layout.nodes.map(node => [node.id, node]))
  for (const definition of atlas.catalog.definitions.filter(record => ['practice', 'technology'].includes(record.type))) {
    const placed = byId.get(definition.ref)
    assert.equal(placed.clusterId, definition.explainedBy ? byId.get(`topic:${definition.explainedBy}`).clusterId : 'factory', definition.ref)
  }
  for (const cluster of atlas.catalog.clusters) {
    const record = layout.clusters.find(item => item.id === cluster.id)
    assert.equal(record.topicCount, atlas.catalog.clusterDigests.find(item => item.id === cluster.id).topicCount)
  }
  assert.equal(layout.clusters.find(item => item.id === 'factory').topicCount, 0)
})

test('rendering edges deduplicate reciprocal family pairs but retain exact directed relationships', () => {
  const registry = new Set(layout.nodes.map(node => node.id))
  const eligible = atlas.catalog.edges.filter(edge => registry.has(edge.from) && registry.has(edge.to))
  const key = edge => `${edge.from}/${edge.type}/${edge.to}`
  const projected = layout.edges.flatMap(edge => edge.relations)
  assert.deepEqual(projected.map(key).sort(), eligible.map(key).sort())
  const original = new Map(eligible.map(edge => [key(edge), edge]))
  for (const edge of projected) assert.deepEqual(edge, original.get(key(edge)))
  assert.equal(new Set(layout.edges.map(edge => `${edge.from}/${edge.family}/${edge.to}`)).size, layout.edges.length)
  for (const edge of layout.edges) {
    assert.ok(registry.has(edge.from) && registry.has(edge.to))
    assert.ok(['structure', 'applies', 'reading'].includes(edge.family))
    assert.ok(edge.from < edge.to)
  }
  const sample = buildAtlasLayout({ nodes: [{ id: 'overview' }, { id: 'child', parent: 'overview' }], edges: [
    { from: 'topic:child', to: 'topic:overview', type: 'browse-under', sourceRefs: [], derived: false },
    { from: 'topic:overview', to: 'topic:child', type: 'browses', sourceRefs: [], derived: true },
    { from: 'topic:child', to: 'topic:overview', type: 'requires', sourceRefs: [], derived: false },
  ] })
  assert.deepEqual(sample.edges.map(edge => edge.family), ['applies', 'structure'])
  assert.equal(sample.edges.find(edge => edge.family === 'structure').relations.length, 2)
})

test('label rank is a unique prominence order independent from review metadata', () => {
  assert.deepEqual(layout.nodes.map(node => node.labelRank).sort((a, b) => a - b), layout.nodes.map((_, index) => index + 1))
  const changed = structuredClone(input)
  changed.nodes.forEach(node => { node.catalog.sourceStatus = 'reviewed'; node.catalog.reviewedOn = '2026-10-11'; node.catalog.confidence = 'High'; node.refs = [] })
  changed.definitions.forEach(record => { record.reviewedOn = '2026-10-11'; record.sourceRefs = []; record.confidenceLevel = 'high' })
  assert.deepEqual(coordinates(buildAtlasLayout(changed)), coordinates(layout))
  const prominent = layout.nodes.filter(node => node.labelRank <= 11)
  assert.ok(prominent.some(node => node.topicId === 'overview'))
  assert.equal(prominent.filter(node => atlas.catalog.clusters.some(cluster => cluster.id === node.topicId)).length, 10)
})

test('layout rejects malformed shape and safely places unclustered legacy topics', () => {
  for (const key of ['nodes', 'clusters', 'definitions', 'edges']) assert.throws(() => buildAtlasLayout({ [key]: null }), /must be an array/)
  assert.throws(() => buildAtlasLayout({ nodes: [{ id: 'same' }, { id: 'same' }] }), /unique nonempty IDs/)
  assert.throws(() => buildAtlasLayout({ nodes: [{ id: 'group' }], clusters: [{ id: 'group', position: [NaN, 0, 0] }] }), /finite position/)
  assert.throws(() => buildAtlasLayout({ nodes: [{ id: 'group' }], clusters: [{ id: 'group', position: [1e300, 0, 0] }] }), /map bounds/)
  assert.throws(() => buildAtlasLayout({ clusters: [{ id: 'missing', position: [0, 0, 0] }] }), /needs a topic/)
  assert.throws(() => buildAtlasLayout({ definitions: [{ type: 'practice', ref: 'technology:no' }] }), /qualified IDs/)
  assert.throws(() => buildAtlasLayout({ definitions: [{ type: 'technology' }] }), /qualified IDs/)
  const fallback = buildAtlasLayout({ nodes: [{ id: 'a', parent: 'b' }, { id: 'b', parent: 'a' }], definitions: [{ type: 'technology', id: 'unknown', explainedBy: 'missing' }], edges: [{ from: 'topic:a', to: 'missing:no', type: 'related-reading' }] })
  assert.ok(fallback.nodes.every(node => node.clusterId === 'factory' && Number.isFinite(node.x) && Number.isFinite(node.y)))
  assert.deepEqual(fallback.edges, [])
  assert.deepEqual(buildAtlasLayout().nodes, [])
})

test('subject filters and evidence changes do not rewrite geometry or the original graph', () => {
  const without = structuredClone(data)
  delete without.navigation.subjects
  const other = compileCatalogue(without)
  assert.deepEqual(other.atlas.catalog.layout2d, layout)
  assert.deepEqual(atlas.catalog.edges, graphEdges(data))
  assert.deepEqual(atlas.catalog.clusters, data.navigation.clusters)
  assert.deepEqual(other.atlas.nodes, atlas.nodes)
  assert.deepEqual(other.catalog, compiled.catalog)
  assert.equal(other.files['factory/catalog.mjs'], compiled.files['factory/catalog.mjs'])
})
