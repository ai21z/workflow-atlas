import test from 'node:test'
import assert from 'node:assert/strict'
import { createExample, compile, compileSelectedOutput } from '../factory/core.mjs'
import { guidanceSnapshot, reviewGuidance, renderGuidanceDetails } from '../factory/guidance-review.mjs'

const manifestFiles = manifest => [{ path: 'manifest.json', content: JSON.stringify(manifest) }]
const getManifest = config => JSON.parse(compile(config).files.find(file => file.path === 'manifest.json').content)

test('selected guidance records expose scope and limits without establishing execution', () => {
  const config = createExample('feasibility')
  const before = JSON.stringify(config)
  const report = reviewGuidance(config, manifestFiles(getManifest(config)))
  assert.equal(report.status, 'matching-records')
  assert.equal(report.needsAdoption, false)
  assert.equal(report.current.reviewedOn, '2026-10-02')
  assert.ok(report.current.records.some(record => record.id === 'practice:progressive-context'))
  assert.ok(report.current.records.some(record => record.id === 'technology:generic'))
  assert.ok(report.current.records.every(record => record.applicability && record.limits))
  assert.equal(JSON.stringify(config), before)
})

test('an unresolved environment round trips guidance without inventing host definitions', () => {
  const config = createExample('feasibility')
  config.project.host = ''
  config.project.sourceControl = ''
  const manifest = getManifest(config)
  assert.equal(manifest.guidanceSnapshot.environment, '')
  assert.ok(!manifest.guidanceSnapshot.records.some(record => record.type === 'host'))
  const report = reviewGuidance(config, manifestFiles(manifest))
  assert.equal(report.status, 'matching-records')
  assert.equal(report.needsAdoption, false)
  assert.match(renderGuidanceDetails(manifest.guidanceSnapshot), /Intended environment not chosen/)
  config.project.host = 'vscode'
  const changed = reviewGuidance(config, manifestFiles(manifest))
  assert.ok(changed.changes.some(change => change.id === 'environment' && change.before === '' && change.after === 'vscode'))
  assert.ok(changed.changes.some(change => change.id === 'host:vscode' && change.before === null))
})

test('retained profiles remain in the guidance scope without implying a stage assignment', () => {
  const config = createExample('feature-delivery')
  config.workflow.enabledStages = ['requirements']
  const unused = guidanceSnapshot(config).records.find(record => record.id === 'role:analyst')
  assert.match(unused.applicability,/no included stage assignment/)
})

test('definition content and source changes are visible even with the same global version', () => {
  const config = createExample('feature-delivery')
  const manifest = getManifest(config)
  const record = manifest.guidanceSnapshot.records.find(item => item.id === 'practice:portable-behavior')
  record.definition.application = 'Previously recorded guidance'
  record.sources = ['https://example.com/previous-source']
  manifest.validation.hostExercised = true
  const before = JSON.stringify(manifest)
  const report = reviewGuidance(config, manifestFiles(manifest))
  const changed = report.changes.find(item => item.id === record.id)
  assert.ok(changed.fields.includes('definition'))
  assert.ok(changed.fields.includes('sources'))
  assert.equal(report.status, 'changed')
  assert.equal(report.needsAdoption, true)
  assert.ok(!('hostExercised' in report))
  assert.equal(JSON.stringify(manifest), before)
})

test('older packs expose unknown contents rather than treating age as invalidity', () => {
  const config = createExample('bugfix')
  const manifest = getManifest(config)
  delete manifest.guidanceSnapshot
  manifest.reviewedOn = '2020-01-01'
  const report = reviewGuidance(config, manifestFiles(manifest))
  assert.equal(report.status, 'comparison-incomplete')
  assert.equal(report.needsAdoption, false)
  assert.equal(report.changes.length, 0)
  assert.match(report.warnings.join(' '), /older review date alone does not/)
  manifest.catalogVersion = '1.0.0'
  assert.equal(reviewGuidance(config, manifestFiles(manifest)).changes[0].id, 'catalog')
})

test('selection and intended environment changes are separate recorded differences', () => {
  const config = createExample('feature-delivery')
  const old = getManifest(config)
  config.project.host = 'vscode'
  config.practices.push('evidence-wiki')
  const report = reviewGuidance(config, manifestFiles(old))
  assert.ok(report.changes.some(item => item.id === 'environment'))
  assert.ok(report.changes.some(item => item.id === 'practice:evidence-wiki' && item.fields.includes('selected definition added')))
  assert.equal(report.needsAdoption, false)
})

test('malformed, ambiguous and oversized supplied metadata retain explicit uncertainty', () => {
  const config = createExample('bugfix')
  for (const files of [[], [{path:'manifest.json',content:'invalid'}], [{path:'manifest.json',content:'[]'}], [{path:'manifest.json',content:' '.repeat(8 * 1024 * 1024 + 1)}], [...manifestFiles(getManifest(config)), ...manifestFiles(getManifest(config))]]) {
    const report = reviewGuidance(config, files)
    assert.equal(report.status, 'unknown')
    assert.equal(report.needsAdoption, false)
    assert.ok(report.warnings.length)
  }
  const manifest = getManifest(config)
  const nested = {}
  let item = nested
  for(let index = 0; index < 40; index++) { item.child = {}; item = item.child }
  manifest.guidanceSnapshot.records[0].definition = nested
  assert.equal(reviewGuidance(config, manifestFiles(manifest)).status, 'comparison-incomplete')
})

test('all selected exports carry the definition snapshot and keep validation distinct', () => {
  const config = createExample('feature-delivery')
  for (const selection of [{kind:'pack'}, {kind:'blueprint'}, {kind:'skill',skillId:'impact-analysis'}]) {
    const pack = compileSelectedOutput(config, selection)
    const manifest = JSON.parse(pack.files.find(file => file.path === 'manifest.json').content)
    assert.deepEqual(manifest.guidanceSnapshot, guidanceSnapshot(config))
    assert.equal(manifest.validation.hostExercised, false)
    assert.equal(manifest.validation.behaviorObserved, false)
  }
})

test('portable guidance renders supplied history safely and retains unknowns', () => {
  const snapshot = guidanceSnapshot(createExample('feasibility'))
  snapshot.records[0].label = '<img src=x onerror=alert(1)>'
  snapshot.records[0].sources = ['javascript:alert(1)','https://example.com/record']
  const html = renderGuidanceDetails(snapshot)
  assert.ok(!html.includes('<img src=x'))
  assert.ok(!html.includes('href="javascript:'))
  assert.match(html,/&lt;img/)
  assert.match(html,/Recorded review 2026-10-02/)
  assert.match(html,/not a new source check/)
  assert.match(renderGuidanceDetails(null),/Exact historical guidance contents are unknown/)
})
