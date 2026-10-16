import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'

const script = await readFile(new URL('../atlas/knowledge-index.js', import.meta.url), 'utf8')
const generated = await readFile(new URL('../atlas/data.js', import.meta.url), 'utf8')
const context = { window: {}, URL }
vm.runInNewContext(script, context)
vm.runInNewContext(generated, context)
const createIndex = context.window.createKnowledgeIndex
const catalogue = context.window.TOPIC_DATA
const plain = value => JSON.parse(JSON.stringify(value))
const ids = rows => [...rows].map(row => row.id)

function fixture() {
  return {
    nodes: [
      { id: 'overview', title: 'Overview', summary: 'All guidance', refs: [], sections: [] },
      { id: 'engineering', title: 'Engineering', parent: 'overview', refs: [], sections: [] },
      { id: 'alpha', title: 'Alpha guide', summary: 'Prepare a bounded answer', parent: 'engineering', refs: ['one', 'two'], catalog: { kind: 'procedure', aliases: ['snapshot pack'], applies: { stages: ['implementation', 'verification'] } }, sections: [{ label: 'Procedure', text: 'Inspect the current revision', items: ['Check the included files'], headers: ['Expected'], rows: [['Context limit', 'Measured tokens']] }] },
      { id: 'beta', title: 'Beta guide', summary: 'Test behavior', parent: 'engineering', refs: ['two'], catalog: { kind: 'concept', applies: { stages: ['verification'] } }, sections: [] },
      { id: 'legacy', title: 'Legacy guide', summary: 'Verification is mentioned without a stage mapping', parent: 'engineering', refs: [], sections: [] },
    ],
    sources: {
      one: ['First repository', 'https://github.com/example/one'],
      two: ['Second repository', 'https://github.com/example/two'],
      unused: ['Unused source', 'https://unused.example/'],
    },
    catalog: {
      clusters: [{ id: 'engineering', short: 'Engineering tools' }],
      definitions: [{ type: 'stage', id: 'implementation', label: 'Development' }, { type: 'stage', id: 'verification', label: 'Tests and review' }, { type: 'technology', id: 'other', label: 'Other' }],
      sources: [{ id: 'one', publisher: 'First publisher' }, { id: 'two', publisher: 'Second publisher' }],
    },
  }
}

test('the full catalogue index retains all 150 topics and every available guide source', () => {
  const index = createIndex(catalogue)
  assert.equal(index.rows.length, 150)
  assert.equal(new Set(ids(index.rows)).size, catalogue.nodes.length)
  assert.deepEqual(ids(index.rows).sort(), ids(catalogue.nodes).sort())
  assert.equal(index.rows.filter(row => row.stageIds.length).length, 149)
  assert.equal(index.rows.filter(row => row.sourceIds.length).length, 149)
  assert.equal(index.topics.length, 11)
  assert.equal(index.stages.length, 17)
  assert.deepEqual(ids(index.filter({ stage: '__none__' })), ['overview'])
  assert.deepEqual(ids(index.filter({ source: '__none__' })), ['overview'])
  for (const row of index.rows) {
    const node = catalogue.nodes.find(node => node.id === row.id)
    assert.deepEqual(plain(row.sourceIds), plain(node.refs), `${row.id} retains every source`)
    assert.equal(row.topicId, node.id === 'overview' ? '__overview__' : (() => {
      let current = node
      while (current.parent !== 'overview') current = catalogue.nodes.find(item => item.id === current.parent)
      return current.id
    })())
  }
  assert.equal(index.filter({ query: 'OpenSpec' }).some(row => row.id === 'openspec-change-specifications'), true)
})

test('filters intersect recorded workflow steps, topic areas, exact source identities and search', () => {
  const index = createIndex(fixture())
  assert.deepEqual(ids(index.filter({ stage: 'verification', topic: 'engineering', source: 'two', query: 'prepare answer' })), ['alpha'])
  assert.deepEqual(ids(index.filter({ source: 'one' })), ['alpha'])
  assert.deepEqual(ids(index.filter({ source: 'two' })), ['alpha', 'beta'])
  assert.deepEqual(ids(index.filter({ stage: 'verification' })), ['alpha', 'beta'])
  assert.ok(!ids(index.filter({ stage: 'verification' })).includes('legacy'), 'a prose mention does not assign a step')
  assert.deepEqual(ids(index.filter({ stage: '__none__', source: '__none__', topic: 'engineering' })), ['engineering', 'legacy'])
  assert.deepEqual(ids(index.filter({ topic: '__overview__' })), ['overview'])
  for (const filter of [{ stage: 'unknown' }, { topic: 'unknown' }, { source: 'unknown' }, { query: 'no matching words' }]) assert.equal(index.filter(filter).length, 0)
  assert.deepEqual(plain(index.sources), [
    { id: 'one', label: 'First repository', url: 'https://github.com/example/one' },
    { id: 'two', label: 'Second repository', url: 'https://github.com/example/two' },
  ])
})

test('source review labels distinguish scoped review, retained claims and pending evidence', () => {
  const data = fixture()
  data.nodes.find(node => node.id === 'alpha').catalog.sourceStatus = 'reviewed'
  data.nodes.find(node => node.id === 'beta').catalog.sourceStatus = 'legacy'
  data.nodes.find(node => node.id === 'legacy').catalog = { sourceStatus: 'needs-review' }
  const index = createIndex(data)
  assert.deepEqual(ids(index.filter({ query: 'scoped source claims reviewed' })), ['alpha'])
  assert.deepEqual(ids(index.filter({ query: 'earlier claims not rechecked' })), ['beta'])
  assert.deepEqual(ids(index.filter({ query: 'source review needed' })), ['legacy'])
})

test('multiword search includes aliases, prose, table content, source names and publishers', () => {
  const index = createIndex(fixture())
  for (const query of ['SNAPSHOT tokens', '  revision\nfiles ', 'expected measured', 'first publisher', 'github.com first']) {
    assert.deepEqual(ids(index.filter({ query })), ['alpha'], query)
  }
  assert.deepEqual(ids(index.filter({ query: 'second publisher' })), ['alpha', 'beta'])
})

test('search matches displayed topic areas, recorded stage labels and topic kinds together with guide titles', () => {
  const index = createIndex(fixture())
  assert.deepEqual(ids(index.filter({ query: 'alpha development engineering tools procedure' })), ['alpha'])
  assert.deepEqual(ids(index.filter({ query: 'beta tests review concept' })), ['beta'])
  assert.deepEqual(ids(index.filter({ query: 'legacy development' })), [], 'an undeclared stage is not searchable classification')
})

test('missing or malformed optional metadata falls back without inventing links or applicability', () => {
  const data = fixture()
  data.nodes.push(
    { id: 'malformed', title: 'Malformed guide', parent: 'missing', refs: ['missing', null, 'broken'], catalog: { aliases: [null, {}, 'searchable alias'], applies: { stages: ['unknown', null, 'other'] } }, sections: [null, { text: null, items: {}, rows: [null, ['Recoverable text']] }] },
    { id: 'cycle-a', title: 'Cycle A', parent: 'cycle-b', catalog: { applies: 'verification' } },
    { id: 'cycle-b', title: 'Cycle B', parent: 'cycle-a', refs: 'one' },
    { id: 'duplicate-stages', title: 'Duplicate stages', parent: 'engineering', refs: ['one', 'one'], catalog: { applies: { stages: ['implementation', 'implementation', 'unknown'] } } },
    null,
  )
  data.sources.broken = ['Broken source']
  data.catalog.definitions.push(null, { type: 'stage', id: 'unlabelled' }, { type: 'stage', id: 'implementation', label: 'Duplicate' })
  data.catalog.clusters.push(null, { id: 'other' })
  data.catalog.sources.push(null, { id: 'missing', publisher: {} })
  const index = createIndex(data)
  const malformed = index.rows.find(row => row.id === 'malformed')
  assert.equal(malformed.topicId, '__overview__')
  assert.deepEqual(plain(malformed.sourceIds), [])
  assert.deepEqual(plain(malformed.stageIds), [])
  assert.equal(index.rows.find(row => row.id === 'cycle-a').topicId, '__overview__')
  assert.deepEqual(ids(index.filter({ query: 'searchable recoverable' })), ['malformed'])
  assert.deepEqual(plain(index.rows.find(row => row.id === 'duplicate-stages').stageIds), ['implementation'])
  assert.deepEqual(plain(index.rows.find(row => row.id === 'duplicate-stages').sourceIds), ['one'])
  assert.equal(index.stages.length, 2)
  assert.equal(createIndex({ nodes: data.nodes, sources: data.sources }).stages.length, 0)
  assert.equal(createIndex(null).rows.length, 0)
  assert.equal(index.filter(null).length, index.rows.length)
})

test('index creation and filtering preserve caller data and use a stable title then ID order', () => {
  const data = fixture()
  data.nodes.push({ id: 'alpha-2', title: 'Alpha guide', parent: 'engineering' })
  const original = structuredClone(data)
  const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value) } return value }
  const index = createIndex(freeze(data))
  index.filter({ stage: 'implementation', source: 'one', query: 'snapshot' })
  assert.deepEqual(data, original)
  assert.deepEqual(ids(index.rows).slice(0, 2), ['alpha', 'alpha-2'])
  assert.equal(index.filter().length, index.rows.length)
})
