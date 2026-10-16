import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'

const json = async path => JSON.parse(await readFile(new URL(path, import.meta.url), 'utf8'))
const [review, sources, definitions, topicNames] = await Promise.all([
  json('../catalogue/gap-review.json'), json('../catalogue/sources.json'),
  json('../catalogue/definitions.json'), readdir(new URL('../catalogue/knowledge/', import.meta.url)),
])
const topics = await Promise.all(topicNames.filter(name => name.endsWith('.json')).map(name => json('../catalogue/knowledge/' + name)))
const topicById = new Map(topics.map(topic => [topic.id, topic]))
const sourceById = new Map(sources.map(source => [source.id, source]))
const stageIds = new Set(definitions.filter(item => item.type === 'stage').map(item => item.id))
const recordById = new Map(review.records.map(record => [record.id, record]))
const sorted = values => [...values].sort()
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const digest = value => createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex')
const content = topic => ({ title: topic.title, summary: topic.summary, sections: topic.sections, basis: topic.basis, confidence: topic.confidence })
const fixedMetadata = catalog => Object.fromEntries(Object.entries(catalog).filter(([key]) => !['revision', 'evidence', 'applies', 'sourceStatus', 'reviewedOn', 'claims'].includes(key)))
const withoutStages = applies => Object.fromEntries(Object.entries(applies || {}).filter(([key]) => key !== 'stages'))
const sectionText = sections => sections.flatMap(section => [section.text || '', ...(section.items || []), ...(section.rows || []).flat()]).join('\n')
const assertUnique = (values, label) => assert.equal(new Set(values).size, values.length, label)

function assertOriginalContent(topic, record) {
  const original = { ...topic, sections: topic.sections.slice(0, record.before.sectionCount) }
  assert.equal(digest(content(original)), record.before.contentHash, `${record.id}: original reading content changed`)
  assert.equal(digest(fixedMetadata(topic.catalog)), record.before.fixedMetadataHash, `${record.id}: fixed catalogue metadata changed`)
  assert.deepEqual(topic.refs.slice(0, record.before.sourceRefs.length), record.before.sourceRefs, `${record.id}: original references changed`)
  assert.deepEqual(topic.catalog.claims.slice(0, record.before.claims.length), record.before.claims, `${record.id}: original claims changed`)
}

function assertDeclaredAdditions(topic, record) {
  const sections = topic.sections.slice(record.before.sectionCount)
  assert.deepEqual(sections.map(section => section.label), record.addedSectionLabels, `${record.id}: undeclared added section`)
  assertUnique(record.addedSectionLabels, `${record.id}: duplicate review section`)
  assert.ok(sections.length > 0 && sections.every(section => section.label.startsWith('Gap review: ')), `${record.id}: additions need an explicit review scope`)
  assert.deepEqual(topic.refs, [...record.before.sourceRefs, ...record.addedSourceRefs], `${record.id}: undeclared source reference change`)
  assert.deepEqual(topic.catalog.applies?.stages || [], [...record.before.stageIds, ...record.addedStages], `${record.id}: undeclared stage change`)
  assert.deepEqual(withoutStages(topic.catalog.applies), withoutStages(record.before.applies), `${record.id}: unrelated applicability tags changed`)
  assert.deepEqual(record.before.applies.stages || [], record.before.stageIds, `${record.id}: inconsistent original applicability`)
  assert.equal(topic.catalog.revision, record.before.revision + '.gap1', `${record.id}: review revision is missing`)
  assertUnique(topic.refs, `${record.id}: duplicate reference`)
  assertUnique(topic.catalog.applies?.stages || [], `${record.id}: duplicate stage`)
  for (const id of record.addedStages) assert.ok(stageIds.has(id), `${record.id}: unknown added stage ${id}`)
  for (const id of record.addedSourceRefs) assert.ok(sourceById.has(id), `${record.id}: unknown added source ${id}`)
}

function assertVerifiedContributions(topic, record) {
  const addedClaims = topic.catalog.claims.slice(record.before.claims.length)
  const addedLabels = new Set(record.addedSectionLabels)
  assert.deepEqual(sorted(record.verification.map(item => item.sourceRef)), sorted(record.addedSourceRefs), `${record.id}: added sources lack verified contributions`)
  assert.equal(addedClaims.length, record.verification.length, `${record.id}: unrecorded claim additions`)
  for (const verification of record.verification) {
    const source = sourceById.get(verification.sourceRef)
    assert.ok(source, `${record.id}: missing verified source`)
    assert.equal(verification.url, source.url, `${record.id}: verification URL differs from source record`)
    const url = new URL(verification.url)
    assert.equal(url.protocol, 'https:', `${record.id}: source protocol`)
    assert.equal(url.username + url.password, '', `${record.id}: source credentials`)
    assert.ok(verification.supports.trim().length > 20 && verification.method.trim().length > 20, `${record.id}: verification needs a scoped fact and inspection method`)
    const claim = addedClaims.find(item => item.text === verification.supports && item.sourceRefs.includes(verification.sourceRef))
    assert.ok(claim, `${record.id}: verified fact has no matching added claim`)
    assert.ok(addedLabels.has(claim.sectionLabel), `${record.id}: new claim is attached to an original section`)
    const section = topic.sections.find(item => item.label === claim.sectionLabel)
    assert.ok(sectionText([section]).includes(claim.text), `${record.id}: claim not present in its cited section`)
    assert.equal(source.status, 'reviewed', `${record.id}: checked source is not marked reviewed`)
    assert.ok(source.reviewedOn && source.contribution.trim(), `${record.id}: reviewed source lacks scope or date`)
  }
  for (const claim of addedClaims) {
    assert.ok(claim.sourceRefs.length > 0 && claim.sourceRefs.every(id => record.addedSourceRefs.includes(id)), `${record.id}: added claim uses an undeclared source`)
  }
  if (record.addedSourceRefs.length) {
    assert.equal(topic.catalog.sourceStatus, 'reviewed', `${record.id}: reviewed contribution status`)
    assert.equal(topic.catalog.reviewedOn, review.reviewedOn, `${record.id}: contribution review date`)
  }
}

test('gap review covers every original missing field and only entries that needed review', () => {
  assert.equal(review.schemaVersion, 1)
  assertUnique(review.records.map(record => record.id), 'duplicate audit entry')
  const originallyMissing = []
  for (const topic of topics) {
    const record = recordById.get(topic.id)
    const missingSteps = record ? record.before.stageIds.length === 0 : !(topic.catalog.applies?.stages || []).length
    const missingSources = record ? record.before.sourceRefs.length === 0 : topic.refs.length === 0
    if (missingSteps || missingSources) originallyMissing.push(topic.id)
    if (record) {
      assert.equal(record.beforeMissingSteps, missingSteps, `${topic.id}: initial step flag`)
      assert.equal(record.beforeMissingSources, missingSources, `${topic.id}: initial source flag`)
      assert.ok(missingSteps || missingSources, `${topic.id}: review entry had neither gap`)
    }
  }
  assert.deepEqual(sorted(review.records.map(record => record.id)), sorted(originallyMissing))
  assert.equal(topicById.size, topics.length, 'topic identities must remain unique')
})

test('gap review preserves original reading content, fixed metadata, references and claims', () => {
  for (const record of review.records) {
    const topic = topicById.get(record.id)
    assert.ok(topic, `${record.id}: reviewed guide no longer exists`)
    assert.ok(Number.isInteger(record.before.sectionCount) && record.before.sectionCount > 0, `${record.id}: original section inventory`)
    assert.match(record.before.contentHash, /^[a-f0-9]{64}$/)
    assert.match(record.before.fixedMetadataHash, /^[a-f0-9]{64}$/)
    assertOriginalContent(topic, record)
  }
})

test('gap review additions exactly match declared sections, applicability and source links', () => {
  for (const record of review.records) assertDeclaredAdditions(topicById.get(record.id), record)
})

test('each new source link has an inspection record and a visible scoped claim', () => {
  for (const record of review.records) assertVerifiedContributions(topicById.get(record.id), record)
})

test('each review entry exposes concrete acceptance outputs and remaining uncertainty', () => {
  assert.match(review.scope, /applicability.*check.*recommendations/i, 'audit must label placement and checks as recommendations')
  for (const record of review.records) {
    const topic = topicById.get(record.id)
    const text = sectionText(topic.sections.slice(record.before.sectionCount))
    assert.ok(record.checks.length >= 2 && record.checks.length <= 4, `${record.id}: expected a bounded set of checks`)
    assertUnique(record.checks, `${record.id}: repeated check output`)
    for (const check of record.checks) {
      assert.ok(check.trim().length > 20, `${record.id}: check has no concrete detail`)
      assert.ok(text.includes(check), `${record.id}: check exists only in the ledger`)
    }
    assert.ok(record.uncertainties.length > 0 && record.uncertainties.every(item => item.trim().length > 20), `${record.id}: uncertainty is missing`)
    assert.match(text, /unverified|unresolved|unknown|untested|unrun|uncertainty|not revalidated|not reaudited|not.*observed.*result|not.*execution result|only.*checked|only.*verified|not.*establish|no .*established|not.*whole guide/i, `${record.id}: visible uncertainty scope is missing`)
    assert.deepEqual(record.remaining, {
      workflowSteps: !(topic.catalog.applies?.stages || []).length,
      sources: topic.refs.length === 0,
    }, `${record.id}: remaining-gap flags differ from guide`)
  }
})

test('new source inventory is exactly the difference from the preserved original source IDs', () => {
  assertUnique(review.beforeSourceIds, 'original source IDs')
  assertUnique(review.newSourceIds, 'new source IDs')
  assertUnique(sources.map(source => source.id), 'source records')
  const original = new Set(review.beforeSourceIds)
  assert.ok(review.beforeSourceIds.every(id => sourceById.has(id)), 'original source record was removed')
  assert.deepEqual(sorted(sources.filter(source => !original.has(source.id)).map(source => source.id)), sorted(review.newSourceIds))
  assert.equal(review.summary.newSourceRecords, review.newSourceIds.length)
  const verified = new Set(review.records.flatMap(record => record.verification.map(item => item.sourceRef)))
  for (const id of review.newSourceIds) {
    assert.ok(verified.has(id), `${id}: newly added source has no verified guide contribution`)
    const source = sourceById.get(id)
    assert.equal(source.reviewedOn, review.reviewedOn, `${id}: new source review date`)
    assert.equal(source.retrievedOn, review.reviewedOn, `${id}: new source retrieval date`)
  }
})

test('audit summary follows the authored guide changes, not link or badge counts alone', () => {
  const before = {
    topics: topics.length,
    withSteps: topics.filter(topic => (recordById.get(topic.id)?.before.stageIds || topic.catalog.applies?.stages || []).length).length,
    withSources: topics.filter(topic => (recordById.get(topic.id)?.before.sourceRefs || topic.refs).length).length,
  }
  const after = {
    topics: topics.length,
    withSteps: topics.filter(topic => topic.catalog.applies?.stages?.length).length,
    withSources: topics.filter(topic => topic.refs.length).length,
  }
  const statuses = Object.fromEntries(['reviewed', 'legacy', 'needs-review'].map(status => [status, topics.filter(topic => topic.catalog.sourceStatus === status).length]))
  const actual = {
    before, after, reviewedEntries: review.records.length,
    addedStageLinks: review.records.reduce((sum, record) => sum + record.addedStages.length, 0),
    addedSourceLinks: review.records.reduce((sum, record) => sum + record.addedSourceRefs.length, 0),
    newSourceRecords: sources.length - review.beforeSourceIds.length,
    checkOutputs: review.records.reduce((sum, record) => sum + record.checks.length, 0), statuses,
  }
  assert.deepEqual(review.summary, actual)
  assert.equal(after.withSteps - before.withSteps, review.records.filter(record => record.beforeMissingSteps && !record.remaining.workflowSteps).length)
  assert.equal(after.withSources - before.withSources, review.records.filter(record => record.beforeMissingSources && !record.remaining.sources).length)
  assert.deepEqual(before, { topics: 150, withSteps: 50, withSources: 108 })
  assert.deepEqual(after, { topics: 150, withSteps: 149, withSources: 149 })
  assert.equal(actual.reviewedEntries, 116)
  assert.equal(actual.addedStageLinks, 300)
  assert.equal(actual.addedSourceLinks, 41)
  assert.equal(actual.newSourceRecords, 16)
  assert.equal(actual.checkOutputs, 310)
})

test('overview remains an explicit unresolved exception rather than receiving forced links', () => {
  const topic = topicById.get('overview')
  const record = recordById.get('overview')
  assert.equal(topic.catalog.sourceStatus, 'needs-review')
  assert.equal(topic.catalog.reviewedOn, '')
  assert.deepEqual(topic.refs, [])
  assert.deepEqual(topic.catalog.applies?.stages || [], [])
  assert.deepEqual(record.addedStages, [])
  assert.deepEqual(record.addedSourceRefs, [])
  assert.deepEqual(record.verification, [])
  assert.deepEqual(record.remaining, { workflowSteps: true, sources: true })
  assert.deepEqual(review.remaining, [{ id: 'overview', ...record.remaining, reasons: record.uncertainties }])
  const text = sectionText(topic.sections.slice(record.before.sectionCount))
  assert.match(text, /local product.*overview|product.*navigation overview/i)
  assert.match(text, /version-specific implementation evidence/i)
  assert.match(text, /no single workflow step|not.*one delivery step/i)
})

test('preservation and contribution guards reject plausible silent regressions', () => {
  const record = review.records.find(item => item.addedSourceRefs.length > 0 && item.addedStages.length > 0)
  const original = topicById.get(record.id)
  const changedText = structuredClone(original)
  changedText.sections[0].label += ' changed'
  assert.throws(() => assertOriginalContent(changedText, record), /original reading content changed/)
  const changedMetadata = structuredClone(original)
  changedMetadata.catalog.kind = original.catalog.kind === 'reference' ? 'concept' : 'reference'
  assert.throws(() => assertOriginalContent(changedMetadata, record), /fixed catalogue metadata changed/)
  const undeclaredStage = structuredClone(original)
  undeclaredStage.catalog.applies.stages.push('release')
  assert.throws(() => assertDeclaredAdditions(undeclaredStage, record), /undeclared stage change/)
  const falseSupport = structuredClone(original)
  falseSupport.catalog.claims.at(-1).text = 'The page proves this project successfully executed every check.'
  assert.throws(() => assertVerifiedContributions(falseSupport, record), /verified fact has no matching added claim/)
  const wrongUrl = structuredClone(record)
  wrongUrl.verification[0].url = 'https://example.com/unrelated'
  assert.throws(() => assertVerifiedContributions(original, wrongUrl), /verification URL differs/)
})
