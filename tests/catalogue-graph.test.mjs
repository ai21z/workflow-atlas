import test from 'node:test'
import assert from 'node:assert/strict'
import { readCatalogue, validateCatalogue, compileCatalogue, graphEdges, staleReviews, INVERSES, DERIVED_TYPES, REVIEW_CYCLE_DAYS } from '../tools/build-catalogue.mjs'
import { actionApplicable } from '../factory/catalogue-rules.mjs'

const data = await readCatalogue()
const copy = () => structuredClone(data)
const key = edge => `${edge.from}/${edge.type}/${edge.to}`

test('schema 1.1 is additive: every authored relation survives, every edge has an inverse and nothing is duplicated', () => {
  const edges = graphEdges(data)
  const keys = new Set(edges.map(key))
  assert.equal(keys.size, edges.length, 'edges are unique')
  for (const relation of data.relations) assert.ok(keys.has(key(relation)), `authored relation kept: ${key(relation)}`)
  for (const edge of edges) {
    const inverse = INVERSES[edge.type]
    assert.ok(inverse, `every edge type has an inverse: ${edge.type}`)
    assert.ok(keys.has(`${edge.to}/${inverse}/${edge.from}`), `inverse present for ${key(edge)}`)
  }
  assert.ok(edges.filter(edge => !edge.derived).length === data.relations.length)
  for (const type of DERIVED_TYPES.filter(type => type !== 'applies-to')) assert.ok(edges.some(edge => edge.derived && edge.type === type), `specs produce ${type} edges`)
  assert.ok(edges.some(edge => edge.derived && edge.type === 'evidenced-by' && edge.from.startsWith('claim:')), 'claims produce evidence edges')
})

test('edges hidden in specs become typed graph edges', () => {
  const edges = graphEdges(data)
  const count = type => edges.filter(edge => edge.type === type && edge.derived).length
  const stages = data.definitions.filter(item => item.type === 'stage')
  assert.equal(count('depends-on'), stages.reduce((sum, item) => sum + item.spec.dependsOn.length, 0))
  assert.equal(count('default-skill'), stages.reduce((sum, item) => sum + item.spec.defaultSkills.length, 0))
  assert.equal(count('performed-by'), stages.filter(item => item.spec.defaultActor.actorType === 'agent').length)
  assert.equal(count('part-of'), data.definitions.filter(item => item.type === 'recipe').reduce((sum, item) => sum + item.spec.stageIds.length, 0))
  const claims = data.topics.flatMap(topic => topic.catalog.claims)
  assert.equal(count('evidenced-by'), claims.reduce((sum, claim) => sum + claim.sourceRefs.length, 0))
  assert.ok(edges.some(edge => edge.from === 'stage:implementation' && edge.type === 'depends-on'))
})

test('an applies block derives applies-to edges and the reader projection carries claims, definitions and cluster digests', () => {
  const input = copy()
  const topic = input.topics.find(item => item.id === 'retries')
  topic.catalog.applies = { stages: ['implementation', 'verification'], technologies: ['nodejs'] }
  const result = compileCatalogue(input)
  const applied = result.atlas.catalog.edges.filter(edge => edge.from === 'topic:retries' && edge.type === 'applies-to').map(edge => edge.to).sort()
  assert.deepEqual(applied, ['stage:implementation', 'stage:verification', 'technology:nodejs'])
  assert.ok(result.atlas.catalog.edges.some(edge => edge.from === 'stage:implementation' && edge.type === 'applied-by' && edge.to === 'topic:retries' && edge.derived))
  assert.equal(result.atlas.catalog.definitions.length, input.definitions.length)
  for (const record of result.atlas.catalog.definitions.filter(item => item.type === 'stage')) assert.ok(record.explainedBy, `stage ${record.id} names its topic`)
  assert.equal(result.atlas.catalog.clusterDigests.length, input.navigation.clusters.length)
  assert.equal(result.atlas.catalog.clusterDigests.reduce((sum, item) => sum + item.topicCount, 0), input.topics.length - 1 - input.navigation.clusters.length, 'every topic except overview and the cluster roots belongs to one cluster')
  const claim = result.atlas.catalog.claims[0]
  assert.match(claim.id, /^claim:[a-z0-9-]+-\d+$/)
  assert.ok(result.atlas.nodes.find(node => node.id === claim.topicId).catalog.claims.some(item => item.id === claim.id))
  assert.equal(result.atlas.catalog.reviewCycleDays, REVIEW_CYCLE_DAYS)
})

test('record level evidence fields reach metadata without changing compiled specs', () => {
  const input = copy()
  const technology = input.definitions.find(item => item.type === 'technology' && item.id === 'postgresql')
  technology.category = 'data-store'
  technology.basis = 'Documented engine behavior'
  technology.confidenceLevel = 'established'
  const result = compileCatalogue(input)
  assert.deepEqual(result.catalog.technologies.find(item => item.id === 'postgresql'), compileCatalogue(copy()).catalog.technologies.find(item => item.id === 'postgresql'), 'the spec the compiler exports is unchanged')
  assert.equal(result.catalog.definitionMetadata['technology:postgresql'].category, 'data-store')
  assert.equal(result.atlas.catalog.definitions.find(item => item.ref === 'technology:postgresql').confidenceLevel, 'established')
  input.definitions.push({ type: 'technology', id: 'example-tech', revision: '1', sourceRefs: [], spec: { id: 'example-tech', label: 'Example technology' } })
  assert.equal(compileCatalogue(input).catalog.definitionMetadata['technology:example-tech'].category, undefined, 'absent fields stay absent')
})

test('step reading follows explicit procedure applicability without assigning tools or changing stages', () => {
  const input = copy()
  const candidate = input.topics.find(item => item.id === 'retries')
  candidate.catalog.kind = 'procedure'
  candidate.catalog.applies = { stages: ['architecture'] }
  const result = compileCatalogue(input).catalog
  assert.ok(result.stageReading.architecture.some(topic => topic.id === candidate.id && topic.title === candidate.title))
  assert.ok(!result.stageReading.operations.some(topic => topic.id === candidate.id))
  assert.deepEqual(result.stages, compileCatalogue(data).catalog.stages)
  assert.deepEqual(result.practiceActions, data.actions)
})

test('generated edge types, unlabeled examples, unsourced stacks, misdirected evidence and requires cycles are rejected', () => {
  const rejected = [
    [input => input.relations.push({ from: 'topic:retries', type: 'applies-to', to: 'stage:implementation', sourceRefs: [] }), /invalid/],
    [input => input.relations.push({ from: 'topic:retries', type: 'depends-on', to: 'topic:workflows', sourceRefs: [] }), /invalid/],
    [input => input.relations.push({ from: 'topic:retries', type: 'example-of', to: 'topic:workflows', sourceRefs: [] }), /labeled as an example/],
    [input => input.relations.push({ from: 'technology:nodejs', type: 'works-with', to: 'technology:postgresql', sourceRefs: [] }), /works-with needs two technologies and a source/],
    [input => input.relations.push({ from: 'source:skillspec', type: 'evidenced-by', to: 'topic:retries', sourceRefs: [] }), /evidenced-by must point/],
    [input => input.relations.push({ from: 'topic:retries', type: 'requires', to: 'source:skillspec', sourceRefs: [] }), /requires cannot involve a source/],
    [input => input.relations.push({ from: 'topic:retries', type: 'requires', to: 'topic:workflows', sourceRefs: [] }, { from: 'topic:workflows', type: 'requires', to: 'topic:retries', sourceRefs: [] }), /requires cycle/],
    [input => { input.topics[0].catalog.applies = { stages: ['not-a-stage'] } }, /unknown stage/],
    [input => { input.topics[0].catalog.evidence = { basisKinds: ['guessed'], confidenceLevel: 'proposed' } }, /invalid/],
    [input => { input.topics[0].catalog.scope = { generality: 'everywhere' } }, /invalid/],
    [input => { input.definitions.find(item => item.type === 'technology').category = 'magic' }, /invalid/],
    [input => { input.definitions[0].confidenceLevel = 'certain' }, /invalid/],
    [input => { input.sources[0].kind = 'rumor' }, /invalid/],
    [input => { input.actions[0].conditions = { technology: { in: ['unknown-tech'] } } }, /unknown reference technology:unknown-tech/],
    [input => { input.relations[0].status = 'reviewed' }, /reviewed relationship needs a review date/],
  ]
  for (const [change, pattern] of rejected) {
    const input = copy()
    change(input)
    assert.throws(() => validateCatalogue(input), pattern)
  }
  const accepted = copy()
  accepted.topics.find(item => item.id === 'retries').catalog.scope = { generality: 'example', context: 'talos' }
  accepted.relations.push({ from: 'topic:retries', type: 'example-of', to: 'topic:workflows', sourceRefs: [], note: 'Stopping rule example.' })
  accepted.relations.push({ from: 'technology:nodejs', type: 'works-with', to: 'technology:postgresql', sourceRefs: ['skillspec'] })
  accepted.relations.push({ from: 'topic:retries', type: 'evidenced-by', to: 'source:skillspec', sourceRefs: [] })
  accepted.relations.push({ from: 'topic:retries', type: 'requires', to: 'topic:workflows', sourceRefs: [] })
  assert.doesNotThrow(() => validateCatalogue(accepted))
  const edges = graphEdges(accepted)
  assert.ok(edges.some(edge => edge.from === 'topic:workflows' && edge.type === 'has-example' && edge.to === 'topic:retries' && edge.derived))
  assert.ok(edges.some(edge => edge.from === 'technology:postgresql' && edge.type === 'works-with' && edge.to === 'technology:nodejs' && edge.derived))
  assert.ok(DERIVED_TYPES.every(type => INVERSES[type]))
})

test('projections never carry a build date and stale reviews are only reported', () => {
  const first = compileCatalogue(copy()).files
  const second = compileCatalogue(copy()).files
  assert.deepEqual(first, second)
  const input = copy()
  const source = input.sources.find(item => item.status === 'reviewed')
  source.reviewedOn = '2020-01-01'
  const stale = staleReviews(input, new Date('2026-10-11'))
  assert.ok(stale.includes(`source:${source.id}`))
  const projected = compileCatalogue(input)
  assert.ok(!JSON.stringify(projected.atlas.catalog).includes('staleReviews'))
  assert.deepEqual(projected.files, compileCatalogue(input).files, 'an old review date changes nothing in the projection')
})

test('an action condition on technology narrows a preset without replacing it', () => {
  const config = { workflow: { enabledStages: ['implementation'], recipe: 'feature-delivery' }, runtime: { enabled: false }, components: [{ technologies: [{ id: 'nodejs', version: '' }] }] }
  const base = { eligibility: 'change-stage' }
  assert.equal(actionApplicable(base, config), true)
  assert.equal(actionApplicable({ ...base, conditions: { technology: { in: ['nodejs', 'python'] } } }, config), true)
  assert.equal(actionApplicable({ ...base, conditions: { technology: { in: ['python'] } } }, config), false)
  assert.equal(actionApplicable({ eligibility: 'always', conditions: { technology: { in: ['nodejs'] } } }, { workflow: {}, runtime: {} }), false, 'no recorded technology is not a match')
  assert.equal(actionApplicable({ eligibility: 'invented', conditions: { technology: { in: ['nodejs'] } } }, config), false)
})
