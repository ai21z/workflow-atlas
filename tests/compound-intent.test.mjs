import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecipe, compile, serializeProject, parseImport } from '../factory/core.mjs'
import { reviewSource, reviewSourceParts, updateIntentReview } from '../factory/intent-review.mjs'
import { createBriefSuggestions } from '../factory/brief-suggestions.mjs'
import { preparePracticeAssessment } from '../factory/brief-suggestions-view.mjs'
import { loadProjection } from '../tools/atlas-query.mjs'

const model = createBriefSuggestions(await loadProjection())
const project = (brief, recipe = 'feature-delivery') => {
  const config = createRecipe(recipe)
  config.project.purpose = brief
  config.practices = []
  return config
}
const result = config => model.propose({ config })
const ids = config => result(config).suggestions.map(item => item.practiceId).sort()
const partChange = (part, action) => ({ type: 'part', field: part.field, index: part.index, text: part.text, role: action.role, scope: action.scope, practiceIds: action.practiceIds })
function clarify(config) {
  for (let i = 0; i < 8; i++) {
    const current = result(config)
    const part = current.clarification.reviewPart
    if (part) {
      assert.equal(part.quickActions.length, 1, part.text)
      config = updateIntentReview(config, partChange(part, part.quickActions[0]))
    } else if (current.clarification.taskNeeded && !config.workflow.intentReview?.taskKind) config = updateIntentReview(config, { type: 'task', value: 'software-change' })
    else return config
  }
  assert.fail('Clarification did not settle within the bounded interaction count')
}

const known = [
  { name: 'model and fallback bans', brief: 'Add a due-date filter to the existing invoice table. The filter must include invoices due on the chosen day. Do not send the goal or recorded answers to a hosted model, and do not use a provider fallback.', expected: ['minimum-change', 'specification-first'], assessmentBlocked: true },
  { name: 'local processing and temporary copy retention', brief: 'Add a checksum column to the current import preview. Each preview row must show the checksum of its source file. Process the source inputs only on the approved local workstation, and erase temporary copies when this session ends.', expected: ['minimum-change', 'specification-first'], assessmentBlocked: true },
  { name: 'omission scope and shared product outcome', brief: 'Fix the progress indicator that stops at ninety percent after a completed upload. Omit specification-first and evidence-wiki for this repair. A successful completion must show one hundred percent and clear the spinner.', recipe: 'bugfix', expected: ['minimum-change'], assessmentBlocked: false },
  { name: 'coordinated historical negatives', brief: 'Add an advances row to the existing travel-claim total. In an earlier release, the calculation omitted reimbursements and never counted advances. The current total must subtract paid advances without changing reimbursable expenses.', expected: ['minimum-change', 'specification-first'], assessmentBlocked: false },
  { name: 'environment and retained copy limits', brief: 'Add a preview of changed field names to the existing export wizard. The preview must not include record values. Keep source inputs inside the approved team environment and retain no copies after review. The brief must not be sent to a model provider.', expected: ['minimum-change', 'specification-first'], assessmentBlocked: true },
]

test('known compound cases recover local guidance without changing their source or inference drafts', () => {
  for (const item of known) {
    const before = project(item.brief, item.recipe)
    const draft = preparePracticeAssessment(before, 'minimum-change')
    if (item.assessmentBlocked) assert.equal(result(before).assessmentCandidate, null, item.name)
    const config = clarify(before)
    assert.deepEqual(ids(config), item.expected, item.name)
    assert.equal(result(config).localRetrievalBlocked, false, item.name)
    assert.equal(result(config).assessmentBlocked, item.assessmentBlocked, item.name)
    assert.deepEqual(reviewSource(config), reviewSource(before))
    assert.deepEqual(config.workflow.enabledStages, before.workflow.enabledStages)
    assert.deepEqual(config.practices, before.practices)
    assert.deepEqual(preparePracticeAssessment(config, 'minimum-change'), draft)
    const reopened = parseImport(serializeProject(config))
    assert.deepEqual(reopened, config)
    assert.deepEqual(ids(reopened), item.expected, item.name)
    for (const path of ['WORKFLOW.md', 'templates/REQUIREMENTS.md']) assert.ok(compile(config).files.find(file => file.path === path).content.includes(item.brief))
  }
})

test('disclosed restriction variants recover after confirmation without changing provider inputs', () => {
  const cases = [
    { limit: 'Do not send this description to a hosted model, and do not switch to another provider if the first one fails.', scope: 'inference' },
    { limit: 'Read these source inputs only on the approved workstation and delete temporary snippets after the review.', scope: 'handling' },
    { limit: 'Neither these inputs nor the notebook may be sent to an external model, and a failed local check must never trigger a provider call.', scope: 'inference' },
    { limit: 'Do not transmit these answers to any model and do not keep a provider copy.', scope: 'inference', field: 'affected' },
  ]
  for (const item of cases) {
    let config = project('Add a status filter to the existing request list.' + (item.field ? '' : ` ${item.limit}`))
    if (item.field) config.workflow.answers[item.field] = item.limit
    const source = reviewSource(config)
    const draft = preparePracticeAssessment(config, 'minimum-change')
    assert.equal(result(config).assessmentCandidate, null)
    const part = result(config).clarification.parts.find(part => part.text === item.limit)
    const action = part.quickActions.find(action => action.scope === item.scope)
    assert.ok(action, item.limit)
    config = updateIntentReview(config, partChange(part, action))
    config = updateIntentReview(config, { type: 'task', value: 'software-change' })
    assert.deepEqual(ids(config), ['minimum-change', 'specification-first'])
    assert.equal(result(config).assessmentCandidate, null)
    assert.deepEqual(reviewSource(config), source)
    assert.deepEqual(preparePracticeAssessment(config, 'minimum-change'), draft)
    const reopened = parseImport(serializeProject(config))
    assert.deepEqual(ids(reopened), ids(config))
    assert.equal(result(reopened).assessmentCandidate, null)
  }
})

const undecided = 'People disagree about the handover process. A code change, a one-time briefing and a maintained decision reference are still alternatives. We have not selected a deliverable.'

test('unselected deliverables and competing unapproved options require an explicit work choice', () => {
  for (const brief of [
    'We are considering a purchasing-screen change, a one-time buyer briefing, or a maintained supplier reference. Nobody has selected the deliverable yet.',
    'The workshop listed a patch to the booking service, a one-time explanation and a maintained policy index. These are competing options, and the owner has not approved any of them. Implementation would be one possible next step if that option is selected.',
  ]) {
    const before = project(brief)
    const draft = preparePracticeAssessment(before, 'minimum-change')
    let config = before
    for (const task of [null, 'unsure']) {
      if (task) config = updateIntentReview(config, { type: 'task', value: task })
      assert.equal(result(config).clarification.intentUndecided, true)
      assert.deepEqual(ids(config), [])
      assert.equal(result(config).assessmentCandidate, null)
      const reopened = parseImport(serializeProject(config))
      assert.deepEqual(ids(reopened), [])
      assert.deepEqual(preparePracticeAssessment(reopened, 'minimum-change'), draft)
    }
  }
})

test('a cancelled implementation in another answer cannot silently lose to the description', () => {
  const before = project('Add a search filter to the current parcel-tracking page.')
  before.workflow.answers['user-need'] = 'The sponsor canceled implementation and now requests only a one-time process explanation.'
  const original = preparePracticeAssessment(before, 'minimum-change')
  let config = before
  for (const value of [null, 'software-change', 'other']) {
    if (value) config = updateIntentReview(config, { type: 'task', value })
    assert.deepEqual(ids(config), [])
    assert.equal(result(config).assessmentCandidate, null)
    assert.ok(result(config).unresolved.some(item => item.reason.includes('recorded answer cancels it')))
    const reopened = parseImport(serializeProject(config))
    assert.deepEqual(ids(reopened), [])
    assert.deepEqual(preparePracticeAssessment(reopened, 'minimum-change'), original)
  }
  const answer = reviewSourceParts(reviewSource(config)).find(part => part.field !== 'brief' && part.text.includes('canceled'))
  config = updateIntentReview(config, partChange(answer, { role: 'context', scope: null, practiceIds: [] }))
  assert.deepEqual(ids(config), [], 'Calling the opposing answer background cannot choose authority')
  config.workflow.answers['user-need'] = 'The owner requests a searchable list of current parcels.'
  assert.equal(result(config).localRetrievalBlocked, false, 'Editing the actual contradictory answer recovers matching')
})

test('fronted and plus-separated named omissions apply before and after clarification', () => {
  for (const omission of ['For this workflow, leave out minimum-change and evidence-wiki.', 'Skip evidence-wiki plus minimum-change in this delivery.']) {
    let config = project(`Add a sort-direction control to the existing inventory grid. ${omission}`)
    const draft = preparePracticeAssessment(config, 'specification-first')
    for (const value of [null, 'software-change']) {
      if (value) config = updateIntentReview(config, { type: 'task', value })
      assert.ok(!ids(config).includes('minimum-change'))
      assert.ok(!ids(config).includes('evidence-wiki'))
    }
    const part = result(config).clarification.parts.find(part => part.text === omission)
    assert.equal(part.quickActions.length, 1)
    assert.equal(part.quickActions[0].id, 'practices')
    config = updateIntentReview(config, partChange(part, part.quickActions[0]))
    assert.deepEqual(ids(config), ['specification-first'])
    const reopened = parseImport(serializeProject(config))
    assert.deepEqual(ids(reopened), ['specification-first'])
    assert.deepEqual(preparePracticeAssessment(reopened, 'specification-first'), draft)
  }
})

test('named omission extensions do not discard conditional or imperative tails', () => {
  for (const omission of [
    'Skip evidence-wiki plus minimum-change in this delivery unless the owner approves.',
    'For this workflow, leave out minimum-change and enable provider access.',
    'Skip evidence-wiki plus minimum-change in this delivery, then send the input to a model.',
  ]) {
    const config = project(`Fix the selected item count in the existing list. ${omission}`)
    const part = result(config).clarification.parts.find(part => part.text === omission)
    assert.ok(!part.quickActions.some(action => action.id === 'practices'), omission)
  }
})
test('an undecided deliverable cannot become chosen work through lexical matches or background classification', () => {
  const before = project(undecided)
  const variants = [before, updateIntentReview(before, { type: 'statement', clause: 'We have not selected a deliverable', kind: 'context' })]
  const source = reviewSourceParts(reviewSource(before)).find(part => part.text.startsWith('We have not'))
  variants.push(updateIntentReview(before, partChange(source, { role: 'context', scope: null, practiceIds: [] })))
  for (const candidate of variants) for (const config of [candidate, parseImport(serializeProject(candidate))]) {
    assert.equal(result(config).clarification.intentUndecided, true)
    assert.equal(result(config).clarification.taskNeeded, true)
    assert.equal(result(config).localRetrievalBlocked, true)
    assert.deepEqual(ids(config), [])
    assert.equal(result(config).assessmentCandidate, null)
  }
  for (const value of ['unsure', 'other']) {
    const config = updateIntentReview(before, { type: 'task', value })
    assert.deepEqual(ids(config), [])
    assert.equal(result(config).clarification.intentUndecided, value === 'unsure')
  }
  const software = updateIntentReview(before, { type: 'task', value: 'software-change' })
  assert.deepEqual(ids(software), ['minimum-change', 'specification-first'])
  assert.equal(result(software).clarification.intentUndecided, false)
  assert.deepEqual(preparePracticeAssessment(software, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
  const knowledge = updateIntentReview(before, { type: 'task', value: 'knowledge-work' })
  assert.deepEqual(ids(knowledge), ['evidence-wiki'])
  for (const config of [software, knowledge]) assert.deepEqual(ids(parseImport(serializeProject(config))), ids(config))
})

test('task decisions cannot erase independent handling restrictions, omissions or stage eligibility', () => {
  const before = project(`${undecided} Do not send this brief to JEV. Omit minimum-change.`)
  let config = updateIntentReview(before, { type: 'task', value: 'software-change' })
  config = clarify(config)
  assert.deepEqual(ids(config), ['specification-first'])
  assert.equal(result(config).assessmentCandidate, null)
  config.workflow.enabledStages = ['release']
  assert.deepEqual(ids(config), [])
  assert.deepEqual(preparePracticeAssessment(config, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
})

test('unselected product values do not turn a concrete task into an undecided deliverable', () => {
  for (const rule of [
    'The customer has not selected a delivery option.',
    'We have not selected a database vendor.',
    'When the user has not chosen a task, the application must show a placeholder.',
    'Investigate which API authentication method fits our import service.',
  ]) {
    const config = project(`Add a status filter to the account dashboard. ${rule}`)
    assert.equal(result(config).clarification.intentUndecided, false, rule)
  }
})

test('source part policy 2 preserves compound interpretation until exact reconfirmation', () => {
  const before = project(known[1].brief)
  const part = reviewSourceParts(reviewSource(before)).find(part => part.text.startsWith('Process '))
  const action = partChange(part, { role: 'restriction', scope: 'handling', practiceIds: [] })
  const old = updateIntentReview(before, action)
  old.workflow.intentReview.parts[0].policyVersion = 2
  const bytes = serializeProject(old)
  assert.equal(result(old).localRetrievalBlocked, true)
  assert.equal(result(old).assessmentCandidate, null)
  const unrelated = updateIntentReview(old, { type: 'task', value: 'software-change' })
  assert.equal(unrelated.workflow.intentReview.parts[0].policyVersion, 2)
  assert.equal(result(unrelated).localRetrievalBlocked, true)
  const confirmed = updateIntentReview(unrelated, action)
  assert.equal(confirmed.workflow.intentReview.parts[0].policyVersion, 4)
  assert.equal(result(confirmed).localRetrievalBlocked, false)
  assert.equal(result(confirmed).assessmentCandidate, null)
  assert.equal(serializeProject(parseImport(bytes)), bytes)
})

test('a recorded task does not permit mixed compound restrictions to be discarded', () => {
  for (const text of [
    'Keep source inputs inside the approved team environment and upload a copy to an external provider.',
    'Process this brief only on the approved workstation unless a provider is available.',
    'Do not send this brief to JEV and disable the approval checks.',
  ]) {
    const before = project(`Add a status filter to the dashboard. ${text}`)
    const part = reviewSourceParts(reviewSource(before)).find(part => part.index === 1 && part.field === 'brief')
    let config = updateIntentReview(before, partChange(part, { role: 'restriction', scope: 'handling', practiceIds: [] }))
    config = updateIntentReview(config, { type: 'task', value: 'software-change' })
    assert.equal(result(config).localRetrievalBlocked, true, text)
    assert.equal(result(config).assessmentCandidate, null, text)
    assert.equal(result(parseImport(serializeProject(config))).assessmentCandidate, null, text)
  }
})
