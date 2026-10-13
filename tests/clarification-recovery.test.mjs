import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecipe, compile, serializeProject, parseImport } from '../factory/core.mjs'
import { updateIntentReview, reviewSource, reviewSourceParts } from '../factory/intent-review.mjs'
import { createBriefSuggestions } from '../factory/brief-suggestions.mjs'
import { preparePracticeAssessment } from '../factory/brief-suggestions-view.mjs'
import { loadProjection } from '../tools/atlas-query.mjs'

const model = createBriefSuggestions(await loadProjection())
const cases = [
  { id: 'history', recipe: 'bugfix', brief: 'Fix the appointment reminder that uses the previous day for customers west of UTC. The original reminder service did not store a timezone. Appointments without a timezone must continue using the organisation default.', expected: ['minimum-change'] },
  { id: 'compound AI limit', brief: 'Add a CSV delimiter option to the existing import dialog. A chosen delimiter must affect only the current import and must be shown in the preview. Do not send this brief or its answers to any external model provider.', expected: ['minimum-change', 'specification-first'], pausedAssessment: true },
  { id: 'input handling', brief: 'Add an undo action for the last reorder in the existing queue screen. A rejected reorder must not be saved. Project input may be stored only in our approved workspace.', expected: ['minimum-change', 'specification-first'], pausedAssessment: true },
  { id: 'replacement', brief: 'Replace the order synchronisation subsystem across all warehouses, including conflict resolution and recovery. Agree the operating rules and acceptance examples before implementation. Keep a living decision record with links to source contracts and later corrections.', knowledge: 'maintained-reference', expected: ['specification-first', 'evidence-wiki'] },
  { id: 'omissions and qualified history', brief: 'Design and implement a new cross-region scheduling service after agreeing its conflict rules. Exclude minimum-change and evidence-wiki from this workflow. The previous team maintained a wiki, but that historical choice is not a request for this project.', expected: ['specification-first'] },
  { id: 'two provider targets', recipe: 'bugfix', brief: 'Fix the broken attachment count in the existing case header. Keep a living evidence ledger linking each regression example to its source ticket and future corrections. Never send any part of this project to JEV or another model service.', knowledge: 'maintained-reference', expected: ['minimum-change', 'evidence-wiki'], pausedAssessment: true },
  { id: 'current coordinated outcomes', brief: 'Add a disabled-state explanation to the existing approval button. In our first prototype, rejected reviews were saved for later inspection. In the current product, a rejected approval must not be persisted, and the explanation must state why.', expected: ['minimum-change', 'specification-first'] },
  { id: 'no software', recipe: 'feasibility', brief: 'Prepare a seating plan and lunch order for the team workshop. The room must have space for twelve attendees. We are not building or changing software.', task: 'other', knowledge: 'one-off', expected: [] },
]
const project = (brief, recipe = 'feature-delivery') => {
  const config = createRecipe(recipe)
  config.project.purpose = brief
  config.practices = []
  return config
}
const applyAction = (config, part, action) => updateIntentReview(config, { type: 'part', field: part.field, index: part.index, text: part.text, role: action.role, scope: action.scope, practiceIds: action.practiceIds })
const ids = result => result.suggestions.map(item => item.practiceId).sort()

test('known paused cases recover through explicit short questions without changing original inputs', () => {
  for (const item of cases) {
    let config = project(item.brief, item.recipe)
    const before = structuredClone(config)
    const requests = ['minimum-change', 'specification-first', 'evidence-wiki'].map(id => preparePracticeAssessment(config, id))
    let result = model.propose({ config })
    let confirmations = 0
    for (let step = 0; step < 8; step++) {
      const part = result.clarification.reviewPart
      if (part) {
        assert.equal(part.quickActions.length, 1, item.id)
        config = applyAction(config, part, part.quickActions[0])
      } else if (result.clarification.taskNeeded && !config.workflow.intentReview?.taskKind) {
        config = updateIntentReview(config, { type: 'task', value: item.task || 'software-change' })
      } else break
      confirmations++
      result = model.propose({ config })
    }
    if (item.knowledge) config = updateIntentReview(config, { type: 'knowledge', value: item.knowledge })
    result = model.propose({ config })
    assert.deepEqual(ids(result), [...item.expected].sort(), item.id)
    assert.equal(result.localRetrievalBlocked, false, item.id)
    assert.equal(result.assessmentBlocked, Boolean(item.pausedAssessment), item.id)
    assert.ok(confirmations <= 3, `${item.id}: ${confirmations} confirmations`)
    assert.deepEqual(config.project, before.project)
    assert.deepEqual(config.workflow.answers, before.workflow.answers)
    assert.deepEqual(config.workflow.enabledStages, before.workflow.enabledStages)
    assert.deepEqual(config.practices, before.practices)
    assert.deepEqual(['minimum-change', 'specification-first', 'evidence-wiki'].map(id => preparePracticeAssessment(config, id)), requests)
    const reopened = parseImport(serializeProject(config))
    assert.deepEqual(reopened, config)
    assert.deepEqual(ids(model.propose({ config: reopened })), ids(result))
    for (const path of ['WORKFLOW.md', 'templates/REQUIREMENTS.md']) assert.ok(compile(config).files.find(file => file.path === path)?.content.includes(item.brief), `${item.id}: ${path}`)
  }
})

test('new meanings do not reinterpret saved version 4 parts until explicitly reconfirmed', () => {
  let config = project('Build the account dashboard. Do not send this brief or its answers to any external model provider.')
  const source = reviewSourceParts(reviewSource(config)).find(part => part.field === 'brief' && part.index === 1)
  const action = { role: 'restriction', scope: 'inference', practiceIds: [] }
  config = applyAction(config, source, action)
  config.workflow.intentReview.version = 4
  for (const part of config.workflow.intentReview.parts) delete part.policyVersion
  const old = structuredClone(config)
  const result = model.propose({ config: parseImport(serializeProject(config)) })
  assert.equal(result.localRetrievalBlocked, true)
  assert.equal(result.clarification.parts.find(part => part.field === 'brief' && part.index === 1).status, 'needs-review')
  assert.deepEqual(config, old)
  config = applyAction(config, source, action)
  assert.equal(config.workflow.intentReview.version, 5)
  assert.equal(config.workflow.intentReview.parts[0].policyVersion, 4)
  assert.equal(model.propose({ config }).localRetrievalBlocked, false)
  assert.equal(model.propose({ config }).assessmentBlocked, true)
})

test('input handling is preserved as its own boundary in Markdown and reopening', () => {
  let config = project('Build the account dashboard. Project input may be stored only in our approved workspace.')
  const part = model.propose({ config }).clarification.reviewPart
  assert.equal(part.quickActions[0].scope, 'handling')
  config = applyAction(config, part, part.quickActions[0])
  for (const path of ['WORKFLOW.md', 'templates/REQUIREMENTS.md']) {
    const output = compile(config).files.find(file => file.path === path).content
    assert.ok(output.includes('Handling project input'))
    assert.ok(output.includes(part.text))
  }
  const reopened = parseImport(serializeProject(config))
  assert.equal(model.propose({ config: reopened }).assessmentCandidate, null)
})

test('a broad replacement needs a concrete bounded slice before a minimum-change suggestion', () => {
  for (const brief of [
    'Replace the entire authentication system across all regions.',
    'Rewrite the order subsystem across all warehouses.',
    'Migrate all services to a new platform.',
  ]) {
    const config = updateIntentReview(project(brief), { type: 'task', value: 'software-change' })
    assert.ok(!ids(model.propose({ config })).includes('minimum-change'), brief)
  }
  for (const brief of [
    'Fix a date formatter in the existing authentication system.',
    'Replace the authentication subsystem. First, fix only one failing date formatter.',
  ]) {
    const config = updateIntentReview(project(brief), { type: 'task', value: 'software-change' })
    assert.ok(ids(model.propose({ config })).includes('minimum-change'), brief)
  }
})
