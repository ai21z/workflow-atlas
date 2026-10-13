import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readCatalogue, compileCatalogue, guidanceReport, coverageReport } from '../tools/build-catalogue.mjs'
import { createKnowledgeQuery } from '../factory/knowledge-query.mjs'

const data = await readCatalogue()
const atlas = compileCatalogue(data).atlas
const query = createKnowledgeQuery(atlas)
const coverage = JSON.parse(await readFile(new URL('../catalogue/coverage.json', import.meta.url), 'utf8'))
const guides = ['api-stored-data', 'java', 'spring-boot', 'maven', 'postgresql-data']

test('the API and data path exposes a useful procedure and honestly scoped reference guidance', () => {
  const packets = guidanceReport(data, coverage)
  for (const id of guides) {
    const topic = data.topics.find(record => record.id === id)
    assert.ok(topic, id)
    assert.equal(topic.catalog.sourceStatus, 'reviewed')
    assert.ok(topic.catalog.claims.length > 0)
    assert.ok(topic.catalog.limits.length > 30)
    assert.ok(packets.some(packet => packet.topicId === id), `${id} has declared procedure, output and examples`)
    for (const claim of topic.catalog.claims) {
      assert.ok(topic.sections.some(section => section.label === claim.sectionLabel))
      for (const source of claim.sourceRefs) assert.ok(topic.refs.includes(source))
    }
  }
  const path = data.navigation.collections.find(item => item.id === 'api-stored-data')
  assert.equal(path.nodeIds[0], 'api-stored-data')
  assert.ok(path.nodeIds.includes('verification-loops'))
  assert.ok(path.nodeIds.includes('release-operations'))
  const subject = data.navigation.subjects.find(item => item.id === 'api-stored-data')
  assert.deepEqual(subject.nodeIds, path.nodeIds)
  assert.match(subject.limits, /optional/i)
})

test('ordinary development facts do not choose the optional API reference stack', () => {
  for (const technologies of [[], ['python'], ['react', 'typescript']]) {
    const proposals = query.propose({ technologies, stages: ['architecture', 'implementation', 'verification'], recipe: 'feature-delivery', limit: 100 })
    for (const id of ['java', 'spring-boot', 'maven', 'postgresql-data']) {
      assert.ok(!proposals.some(result => result.id === id), `Unselected ${id} must not be implied by shared development stages`)
    }
  }
})

test('recorded API reference technologies reach their guides without pretending to be confirmed', () => {
  for (const [technology, topic] of [['java', 'java'], ['spring-boot', 'spring-boot'], ['maven', 'maven'], ['postgresql', 'postgresql-data']]) {
    const result = query.propose({ technologies: [technology], limit: 100 }).find(item => item.id === topic)
    assert.ok(result, technology)
    assert.equal(result.confirmation, 'not checked')
    assert.ok(result.graphReasons.some(reason => reason.includes('technology ')))
    const record = query.get(`topic:${topic}`)
    assert.ok(record.claims.length > 0)
  }
})

test('adding API reference guidance does not conceal the remaining catalogue gaps', () => {
  const rows = coverageReport(data, coverage).flatMap(slot => slot.items)
  const byId = id => rows.find(item => item.id === id)
  for (const id of ['java', 'spring-boot', 'maven', 'postgresql']) {
    assert.equal(byId(id).status, 'covered', id)
  }
  assert.equal(byId('gradle').status, 'missing')
  assert.equal(byId('pytest').status, 'missing')
})
