import test from 'node:test'
import assert from 'node:assert/strict'
import { compileSelectedOutput, createExample } from '../factory/core.mjs'
import { attachReviewArtifacts } from '../factory/session-output.mjs'
import { restoreDecisionReview } from '../factory/decision-review.mjs'
import { packageProject, readProjectFiles, buildProjectAtlas } from '../factory/portable.mjs'
import { zipFiles } from '../factory/zip.mjs'

const manifest = pack => JSON.parse(pack.files.find(file => file.path === 'manifest.json').content)
const suppliedFile = (name, content) => new File([content], name)

test('unchanged sessions have no extra review files and leave the compiler input intact', () => {
  const config = createExample('feature-delivery')
  const raw = compileSelectedOutput(config,{kind:'pack'})
  const before = JSON.stringify(raw)
  const result = attachReviewArtifacts(config,raw)
  assert.equal(result.files.some(file => file.path === 'decision-review.json'),false)
  assert.equal(JSON.stringify(raw),before)
  assert.deepEqual(manifest(result).guidanceSnapshot,manifest(raw).guidanceSnapshot)
})

test('every selected output keeps exact comparison data, accurate inventories and unchanged validation claims', async () => {
  const baseline = createExample('feature-delivery')
  const current = structuredClone(baseline)
  current.workflow.bindings.architecture.actorType = 'human'
  current.workflow.bindings.architecture.actorName = 'Product owner'
  const reason = 'The owner needs to review the options before implementation.'
  for (const selection of [{kind:'blueprint'},{kind:'pack'},{kind:'skill',skillId:'impact-analysis'}]) {
    const raw = compileSelectedOutput(current,selection)
    const attached = attachReviewArtifacts(current,raw,{baseline,reason})
    const packageResult = packageProject(current,attached)
    const info = manifest(packageResult)
    assert.deepEqual(info.files,[...packageResult.files.map(file => file.path)].sort())
    assert.equal(info.validation.hostExercised,false)
    assert.equal(info.validation.behaviorObserved,false)
    const record = restoreDecisionReview(attached.files.find(file => file.path === 'decision-review.json').content,{current}).review
    assert.deepEqual(record.baseline,baseline)
    assert.equal(record.reason,reason)
    assert.equal(record.output.kind,selection.kind)
    assert.equal(record.output.currentFiles.length,raw.files.length)
    assert.ok(record.changes.some(change => change.path.includes('architecture')))
    for (const file of [suppliedFile('review.zip',zipFiles(packageResult.files)),suppliedFile('review.html',buildProjectAtlas(current,attached))]) {
      const reopened = await readProjectFiles([file])
      assert.deepEqual(reopened.config,current)
      const restored = restoreDecisionReview(reopened.files.find(item => item.path === 'decision-review.json').content,{current:reopened.config})
      assert.equal(restored.review.reason,reason)
      assert.deepEqual(restored.review.baseline,baseline)
      assert.deepEqual(restored.warnings,[])
    }
  }
})

test('supplied reason alone is retained without inventing a project change', () => {
  const config = createExample('feasibility')
  const result = attachReviewArtifacts(config,compileSelectedOutput(config,{kind:'blueprint'}),{reason:'Keep the existing process until the study is reviewed.'})
  const record = restoreDecisionReview(result.files.find(file => file.path === 'decision-review.json').content,{current:config}).review
  assert.equal(record.changes.length,0)
  assert.equal(record.affectedFiles.length,0)
  assert.match(result.files.find(file => file.path === 'DECISION-REVIEW.md').content,/No project decisions changed/)
})

test('deliberate guidance selection is a scoped note, not an upstream check or passing host result', () => {
  const config = createExample('feasibility')
  const adoption = {fromCatalogVersion:'1.0.0',currentCatalogVersion:'2.0.0',definitionIds:['practice:progressive-context']}
  const result = attachReviewArtifacts(config,compileSelectedOutput(config,{kind:'blueprint'}),{guidanceReview:adoption})
  const info = manifest(result)
  assert.deepEqual(info.guidanceReview.definitionIds,adoption.definitionIds)
  assert.match(info.guidanceReview.limit,/not a new source check/)
  assert.equal(info.validation.hostExercised,false)
  assert.equal(info.validation.behaviorObserved,false)
  assert.equal(result.stats.fileCount,result.files.length)
})
