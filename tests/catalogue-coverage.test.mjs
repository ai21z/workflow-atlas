import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { readCatalogue, compileCatalogue, coverageReport, guidanceReport } from '../tools/build-catalogue.mjs'

const data = await readCatalogue()
const coverage = JSON.parse(await readFile(new URL('../catalogue/coverage.json', import.meta.url), 'utf8'))
const find = (report, slot, id) => report.find(item => item.id === slot).items.find(item => item.id === id)

test('coverage separates indirect guidance from selectable records and structural completeness', () => {
  const report = coverageReport(data, coverage)
  const pytest = find(report, 'build-test', 'pytest')
  assert.equal(pytest.status, 'missing')
  assert.equal(pytest.reading.presence, 'indirect only')
  assert.ok(pytest.reading.topicIds.includes('python'))
  assert.deepEqual(pytest.factory.profileIds, [])
  const spring = find(report, 'framework', 'spring-boot')
  assert.equal(spring.status, 'covered')
  assert.equal(spring.reading.presence, 'linked')
  assert.ok(spring.reading.topicIds.includes('spring-boot'))
  assert.deepEqual(spring.factory.profileIds, ['spring-boot'])
  const github = find(report, 'agent-host', 'github')
  assert.equal(github.factory.hostTarget, true)
  assert.deepEqual(github.factory.profileIds, [])
  assert.match(github.factory.limits, /No installation, execution, compatibility/)
})

test('review counts and dated claim scope stay distinct from task procedure and example metadata', () => {
  const report = coverageReport(data, coverage)
  const postgres = find(report, 'data-store', 'postgresql')
  assert.ok(postgres.review.some(item => item.topicId === 'postgresql-data' && item.status === 'reviewed' && item.scopedClaims > 1))
  assert.ok(postgres.taskGuidance.some(item => item.topicId === 'postgresql-data' && item.exampleSections.length > 0))
  const guides = guidanceReport(data, coverage)
  const requirements = guides.find(item => item.topicId === 'requirements-workflow')
  assert.equal(requirements.reviewStatus, 'reviewed')
  assert.equal(requirements.reviewedOn, '2026-10-15')
  assert.ok(requirements.exampleSections.includes('Worked example'))
  assert.equal(requirements.scopedClaims, 1)
  assert.match(data.topics.find(topic => topic.id === 'requirements-workflow').sections.find(section => section.label === 'Gap review: verified source contribution').text, /broader workflow.*proposals/)
  const node = find(report, 'language-runtime', 'nodejs').review.find(item => item.topicId === 'nodejs')
  assert.match(node.scope, /Node.js 26.11.1/)
  assert.ok(node.sourceRevisions.some(item => item.id === 'npm-ci-v11' && item.revision === 'npm 11.21.0'))
})

test('false task evidence, unknown indirect references and malformed coverage fail the build report', () => {
  const changes = [
    input => { input.complete = true },
    input => { input.guidance = 'complete' },
    input => { input.indirect = {} },
    input => { input.slots[0].wanted.push(input.slots[0].wanted[0]) },
    input => { input.slots.push(structuredClone(input.slots[0])) },
    input => { input.indirect[0].topicIds = ['missing-topic'] },
    input => { input.indirect[0].id = 'not-in-slot' },
    input => { input.guidance[0].procedureSection = 'nonexistent procedure' },
    input => { input.guidance[0].outputSection = 'nonexistent output' },
    input => { input.guidance[0].exampleSections = ['nonexistent evidence'] },
    input => { input.guidance[0].verified = true },
    input => { input.guidance.push(structuredClone(input.guidance[0])) },
  ]
  for (const change of changes) {
    const input = structuredClone(coverage)
    change(input)
    assert.throws(() => coverageReport(data, input), /Invalid coverage metadata/)
  }
})

test('maintainer coverage metadata changes no reader, factory or inference projection', () => {
  const before = compileCatalogue(data)
  const input = structuredClone(coverage)
  input.guidance = []
  input.indirect = []
  coverageReport(data, input)
  assert.deepEqual(compileCatalogue(data), before)
  assert.equal(Object.hasOwn(before.atlas.catalog, 'guidance'), false)
  assert.equal(Object.hasOwn(before.catalog, 'coverage'), false)
})
