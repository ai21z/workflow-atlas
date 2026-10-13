import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecipe, parseImport, serializeProject } from '../factory/core.mjs'
import { INTENT_PART_POLICY_VERSION, getIntentReview, intentReviewIssues, reviewSource, reviewSourceParts, updateIntentReview } from '../factory/intent-review.mjs'

const project = () => {
  const config = createRecipe('feature-delivery')
  config.project.purpose = 'Build the account screen. Invalid edits must not be saved, even after a retry; valid edits can be confirmed.'
  config.workflow.answers.acceptance = 'Valid edits can be confirmed. Valid edits can be confirmed.'
  return config
}
const record = (config, field, index, role = 'task', scope = null, practiceIds = []) => {
  const { text } = reviewSourceParts(reviewSource(config)).find(part => part.field === field && part.index === index)
  return { type: 'part', field, index, text, role, scope, practiceIds }
}
const reviewed = () => updateIntentReview(project(), record(project(), 'brief', 1, 'requirement'))
const legacy = version => {
  const config = project()
  config.workflow.intentReview = {
    version,
    source: reviewSource(config),
    taskKind: 'software-change',
    statements: [{ clause: 'Invalid edits must not be saved', kind: 'requirement', practiceIds: [], ...(version === 1 ? {} : { policyVersion: version === 2 ? 2 : 3 }) }],
    ...(version === 3 ? { knowledgeNeed: 'maintained-reference' } : {}),
  }
  return config
}
const legacyParts = () => {
  let config = updateIntentReview(legacy(3), record(legacy(3), 'brief', 1, 'requirement'))
  config = updateIntentReview(config, record(config, 'answer:acceptance', 0, 'context'))
  config.workflow.intentReview.version = 4
  config.workflow.intentReview.parts = config.workflow.intentReview.parts.map(({ policyVersion, ...part }) => part)
  return config
}

test('source parts retain punctuation, comma clauses, semicolons and conjunctions', () => {
  const config = project()
  config.project.purpose = '  Build the screen, then check it; keep the fallback and existing controls.\r\nWhy?  Check the outcome!\nKeep the final line  '
  assert.deepEqual(reviewSourceParts(reviewSource(config)).filter(part => part.field === 'brief'), [
    { field: 'brief', index: 0, text: 'Build the screen, then check it; keep the fallback and existing controls.', label: 'Description' },
    { field: 'brief', index: 1, text: 'Why?', label: 'Description' },
    { field: 'brief', index: 2, text: 'Check the outcome!', label: 'Description' },
    { field: 'brief', index: 3, text: 'Keep the final line', label: 'Description' },
  ])
  assert.deepEqual(reviewSourceParts({ brief: null, answers: { acceptance: null } }), [])
})

test('line breaks inside a sentence retain the condition and main rule in one source part', () => {
  const config = project()
  for (const text of [
    'Unless permission is granted,\nrecords must not appear.',
    'If permission is granted,\r\nrecords must not appear.',
    'Records must not appear\n\nunless permission is granted.',
  ]) {
    config.workflow.answers.acceptance = text
    const parts = reviewSourceParts(reviewSource(config)).filter(part => part.field === 'answer:acceptance')
    assert.equal(parts.length, 1, text)
    assert.equal(parts[0].text, text)
    const next = updateIntentReview(config, record(config, 'answer:acceptance', 0, 'requirement'))
    assert.equal(next.workflow.intentReview.parts[0].text, text)
    for (const fragment of text.split(/[\r\n]+/u)) assert.throws(() => updateIntentReview(config, { ...record(config, 'answer:acceptance', 0, 'requirement'), text: fragment }), /complete original text/)
  }
})

test('identical wording binds separately to its source field and occurrence', () => {
  let config = project()
  config.project.purpose = 'Valid edits can be confirmed.'
  config = updateIntentReview(config, record(config, 'brief', 0, 'requirement'))
  config = updateIntentReview(config, record(config, 'answer:acceptance', 0, 'context'))
  config = updateIntentReview(config, record(config, 'answer:acceptance', 1, 'restriction', 'unresolved'))
  assert.equal(config.workflow.intentReview.version, 5)
  assert.deepEqual(getIntentReview(config).parts.map(({ field, index, role }) => ({ field, index, role })), [
    { field: 'brief', index: 0, role: 'requirement' },
    { field: 'answer:acceptance', index: 0, role: 'context' },
    { field: 'answer:acceptance', index: 1, role: 'restriction' },
  ])
  assert.deepEqual(parseImport(serializeProject(config)).workflow.intentReview, config.workflow.intentReview)
  assert.equal(getIntentReview(config).active, true)
})

test('source parts require exact complete text at the chosen field and index', () => {
  const config = project()
  const complete = record(config, 'brief', 1, 'requirement')
  for (const changed of [
    { text: 'Invalid edits must not be saved' },
    { text: complete.text.slice(0, -1) },
    { text: ` ${complete.text}` },
    { field: 'answer:acceptance' },
    { field: 'project.purpose' },
    { field: 'answer:missing' },
    { index: 0 },
    { index: -1 },
    { index: 1.5 },
    { index: '1' },
  ]) assert.throws(() => updateIntentReview(config, { ...complete, ...changed }), /intentReview\.parts/)
  assert.equal(config.workflow.intentReview, undefined)
})

test('restriction scopes and multiple named practice exclusions have strict schemas', () => {
  const config = project()
  for (const scope of ['practices', 'product', 'inference', 'handling', 'unresolved']) {
    const practiceIds = scope === 'practices' ? ['minimum-change', 'evidence-wiki'] : []
    const next = updateIntentReview(config, record(config, 'brief', 1, 'restriction', scope, practiceIds))
    assert.deepEqual(getIntentReview(next).parts[0].practiceIds, practiceIds)
    assert.deepEqual(intentReviewIssues(next.workflow.intentReview), [])
  }
  for (const [role, scope, practiceIds] of [
    ['task', 'product', []], ['requirement', 'product', []], ['context', 'unresolved', []],
    ['restriction', null, []], ['restriction', 'network', []], ['restriction', 'practices', []],
    ['restriction', 'product', ['minimum-change']], ['task', null, ['minimum-change']],
    ['restriction', 'practices', ['minimum-change', 'minimum-change']],
    ['restriction', 'practices', ['invented-practice']], ['invented-role', null, []],
  ]) assert.throws(() => updateIntentReview(config, record(config, 'brief', 1, role, scope, practiceIds)), /intentReview\.parts/)
})

test('malformed imports cannot discard unknown parts, duplicate identities or missing fields', () => {
  for (const mutate of [
    review => { delete review.parts },
    review => { review.parts = {} },
    review => { delete review.parts[0].scope },
    review => { review.parts[0].label = 'Unrecognized metadata' },
    review => { review.parts[0].practiceIds = null },
    review => { review.parts.push({ ...review.parts[0], role: 'context' }) },
    review => { review.parts = Array.from({ length: 101 }, () => ({ ...review.parts[0] })) },
    review => { review.version = 6 },
    review => { delete review.parts[0].policyVersion },
    review => { review.parts[0].policyVersion = INTENT_PART_POLICY_VERSION + 1 },
    review => { review.parts[0].policyVersion = '2' },
    review => { review.parts[0].text = '\u0000' },
  ]) {
    const config = reviewed()
    mutate(config.workflow.intentReview)
    assert.ok(intentReviewIssues(config.workflow.intentReview).length)
    assert.throws(() => parseImport(JSON.stringify(config)), /intentReview/)
    assert.throws(() => serializeProject(config), /intentReview/)
    assert.throws(() => updateIntentReview(config, { type: 'task', value: 'software-change' }), /unsupported or malformed/)
  }
})

test('replacing and removing a part preserve other occurrences and review choices', () => {
  let config = reviewed()
  config = updateIntentReview(config, { type: 'knowledge', value: 'maintained-reference' })
  config = updateIntentReview(config, record(config, 'answer:acceptance', 0, 'requirement'))
  const before = structuredClone(config)
  const next = updateIntentReview(config, record(config, 'brief', 1, 'restriction', 'product'))
  assert.deepEqual(config, before)
  assert.equal(next.workflow.intentReview.parts.length, 2)
  const removed = updateIntentReview(next, { type: 'remove-part', field: 'brief', index: 1 })
  assert.deepEqual(removed.workflow.intentReview.parts, [config.workflow.intentReview.parts[1]])
  assert.equal(removed.workflow.intentReview.knowledgeNeed, 'maintained-reference')
  const returned = getIntentReview(removed)
  returned.parts[0].role = 'context'
  assert.equal(removed.workflow.intentReview.parts[0].role, 'requirement')
})

test('source edits stale every part while stages and technologies retain source meaning', () => {
  const config = reviewed()
  for (const change of [
    next => { next.project.purpose += ' Keep the earlier fallback.' },
    next => { next.workflow.answers.acceptance += ' Show a status.' },
    next => { next.workflow.recipe = 'bugfix' },
  ]) {
    const edited = structuredClone(config)
    change(edited)
    assert.deepEqual(getIntentReview(edited), { active: false, stale: true, taskKind: null, knowledgeNeed: null, statements: [], parts: [] })
    assert.deepEqual(edited.workflow.intentReview, config.workflow.intentReview)
  }
  const stages = structuredClone(config)
  stages.workflow.enabledStages = []
  stages.project.host = 'jetbrains'
  assert.deepEqual(getIntentReview(stages), getIntentReview(config))
  const revised = structuredClone(config)
  revised.project.purpose += ' Keep the earlier fallback.'
  const reconfirmed = updateIntentReview(revised, { type: 'task', value: 'software-change' })
  assert.deepEqual(reconfirmed.workflow.intentReview.parts, [])
  assert.deepEqual(reconfirmed.workflow.intentReview.source, reviewSource(revised))
})

test('legacy reviews round trip unchanged and explicit edits preserve existing confirmation policy', () => {
  for (const version of [1, 2, 3]) {
    const config = legacy(version)
    assert.deepEqual(intentReviewIssues(config.workflow.intentReview), [])
    assert.deepEqual(parseImport(serializeProject(config)).workflow.intentReview, config.workflow.intentReview)
    assert.deepEqual(getIntentReview(config).parts, [])
    const expectedStatements = config.workflow.intentReview.statements.map(statement => ({ ...statement, policyVersion: statement.policyVersion || 1 }))
    for (const change of [
      { type: 'task', value: 'other' },
      record(config, 'brief', 0, 'task'),
      { type: 'remove-part', field: 'brief', index: 0 },
    ]) {
      const next = updateIntentReview(config, change)
      assert.equal(next.workflow.intentReview.version, 5)
      assert.deepEqual(next.workflow.intentReview.statements, expectedStatements)
      assert.equal(next.workflow.intentReview.knowledgeNeed, version === 3 ? 'maintained-reference' : null)
      assert.deepEqual(next.workflow.intentReview.source, config.workflow.intentReview.source)
      assert.deepEqual(intentReviewIssues(next.workflow.intentReview), [])
    }
    const invalid = structuredClone(config)
    invalid.workflow.intentReview.parts = []
    assert.throws(() => parseImport(JSON.stringify(invalid)), /Unknown intent review field/)
  }
})

test('new parts do not upgrade legacy statement policies or change original intent', () => {
  const config = legacy(2)
  const next = updateIntentReview(config, record(config, 'brief', 0, 'task'))
  assert.equal(next.workflow.intentReview.statements[0].policyVersion, 2)
  assert.equal(next.project.purpose, config.project.purpose)
  assert.deepEqual(next.workflow.answers, config.workflow.answers)
  assert.deepEqual(next.workflow.intentReview.source, config.workflow.intentReview.source)
  assert.deepEqual(getIntentReview(createRecipe('feature-delivery')).parts, [])
})

test('version 4 parts reopen unchanged and normalize their earlier policy only in copied reads', () => {
  const config = legacyParts()
  const bytes = serializeProject(config)
  const restored = parseImport(bytes)
  assert.equal(serializeProject(restored), bytes)
  assert.equal(restored.workflow.intentReview.version, 4)
  const read = getIntentReview(restored)
  assert.deepEqual(read.parts, config.workflow.intentReview.parts.map(part => ({ ...part, policyVersion: 1 })))
  assert.equal(read.knowledgeNeed, 'maintained-reference')
  read.parts[0].practiceIds.push('minimum-change')
  read.parts[0].role = 'context'
  assert.equal(serializeProject(restored), bytes)
  assert.equal(Object.hasOwn(restored.workflow.intentReview.parts[0], 'policyVersion'), false)
})

test('unrelated version 4 edits preserve every untouched part policy and legacy choice', () => {
  const config = legacyParts()
  const bytes = serializeProject(config)
  const expectedParts = config.workflow.intentReview.parts.map(part => ({ ...part, policyVersion: 1 }))
  for (const change of [
    { type: 'task', value: 'other' },
    { type: 'knowledge', value: 'one-off' },
    { type: 'statement', clause: 'Build the account screen', kind: 'context' },
    { type: 'remove-statement', clause: 'Build the account screen' },
    { type: 'remove-part', field: 'brief', index: 0 },
  ]) {
    const next = updateIntentReview(config, change)
    assert.equal(next.workflow.intentReview.version, 5)
    assert.deepEqual(next.workflow.intentReview.parts, expectedParts)
    assert.deepEqual(next.workflow.intentReview.source, config.workflow.intentReview.source)
    assert.deepEqual(next.workflow.intentReview.statements[0], config.workflow.intentReview.statements[0])
    assert.equal(next.workflow.intentReview.knowledgeNeed, change.type === 'knowledge' ? 'one-off' : 'maintained-reference')
    assert.equal(next.workflow.intentReview.taskKind, change.type === 'task' ? 'other' : 'software-change')
    assert.deepEqual(parseImport(serializeProject(next)), next)
  }
  assert.equal(serializeProject(config), bytes)
})

test('explicit reconfirmation promotes only the chosen part and always stamps the current policy', () => {
  assert.equal(INTENT_PART_POLICY_VERSION, 4)
  const config = legacyParts()
  const bytes = serializeProject(config)
  const next = updateIntentReview(config, { ...record(config, 'brief', 1, 'requirement'), policyVersion: 1 })
  assert.deepEqual(next.workflow.intentReview.parts, [
    { ...config.workflow.intentReview.parts[1], policyVersion: 1 },
    { ...config.workflow.intentReview.parts[0], policyVersion: INTENT_PART_POLICY_VERSION },
  ])
  assert.deepEqual(next.workflow.intentReview.statements, config.workflow.intentReview.statements)
  assert.deepEqual(parseImport(serializeProject(next)), next)
  assert.equal(serializeProject(config), bytes)
  const taskEdit = updateIntentReview(next, { type: 'task', value: 'knowledge-work' })
  assert.deepEqual(taskEdit.workflow.intentReview.parts, next.workflow.intentReview.parts)
  const removed = updateIntentReview(config, { type: 'remove-part', field: 'brief', index: 1 })
  assert.deepEqual(removed.workflow.intentReview.parts, [{ ...config.workflow.intentReview.parts[1], policyVersion: 1 }])
})

test('input handling requires policy 2 or later and cannot silently extend legacy records', () => {
  const current = updateIntentReview(project(), record(project(), 'brief', 1, 'restriction', 'handling'))
  assert.deepEqual(intentReviewIssues(current.workflow.intentReview), [])
  assert.deepEqual(parseImport(serializeProject(current)), current)
  for (const mutate of [
    review => { review.parts[0].policyVersion = 1 },
    review => { review.parts[0].role = 'requirement' },
    review => { review.parts[0].practiceIds = ['minimum-change'] },
    review => { review.version = 4; delete review.parts[0].policyVersion },
  ]) {
    const invalid = structuredClone(current)
    mutate(invalid.workflow.intentReview)
    assert.throws(() => parseImport(JSON.stringify(invalid)), /intentReview\.parts/)
    assert.throws(() => updateIntentReview(invalid, { type: 'task', value: 'software-change' }), /unsupported or malformed/)
  }
  const invalidLegacy = legacyParts()
  invalidLegacy.workflow.intentReview.parts[0].policyVersion = 1
  assert.throws(() => parseImport(JSON.stringify(invalidLegacy)), /Unknown intent review field/)
})

test('version 4 source edits keep stale original parts until a new explicit clarification', () => {
  const config = legacyParts()
  config.project.purpose += ' '
  const bytes = serializeProject(config)
  assert.deepEqual(getIntentReview(config), { active: false, stale: true, taskKind: null, knowledgeNeed: null, statements: [], parts: [] })
  assert.equal(serializeProject(parseImport(bytes)), bytes)
  const next = updateIntentReview(config, record(config, 'brief', 0, 'task'))
  assert.equal(next.workflow.intentReview.version, 5)
  assert.equal(next.workflow.intentReview.parts.length, 1)
  assert.equal(next.workflow.intentReview.parts[0].policyVersion, INTENT_PART_POLICY_VERSION)
  assert.deepEqual(next.workflow.intentReview.statements, [])
  assert.equal(next.workflow.intentReview.knowledgeNeed, null)
  assert.equal(serializeProject(config), bytes)
})
