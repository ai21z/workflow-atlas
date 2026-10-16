import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecipe, parseImport, serializeProject } from '../factory/core.mjs'
import { getIntentReview, reviewSource, reviewSourceParts, updateIntentReview } from '../factory/intent-review.mjs'
import { createBriefSuggestions, briefSuggestionInput } from '../factory/brief-suggestions.mjs'
import { createKnowledgeQuery } from '../factory/knowledge-query.mjs'
import { separateIntent } from '../factory/intent-separation.mjs'
import { preparePracticeAssessment } from '../factory/brief-suggestions-view.mjs'
import { buildAssistancePayload } from '../factory/jev-assistance.mjs'
import { makeRequest } from '../factory/jev-contract.mjs'
import { parseSuggestionInput } from '../tools/serve.mjs'
import { loadProjection } from '../tools/atlas-query.mjs'

const projection = await loadProjection()
const model = createBriefSuggestions(projection)
const project = answer => {
  const config = createRecipe('feature-delivery')
  config.project.purpose = 'Add a colour option to the account dashboard.'
  config.workflow.answers.acceptance = answer
  config.practices = []
  return config
}
const classify = (config, role, scope = null) => {
  const { field, index, text } = reviewSourceParts(reviewSource(config)).find(part => part.field === 'answer:acceptance')
  return updateIntentReview(config, { type: 'part', field, index, text, role, scope, practiceIds: [] })
}
const result = config => model.propose({ config })
const answerPart = value => value.clarification.parts.find(part => part.field === 'answer:acceptance')
const reopened = config => parseImport(serializeProject(config))
const asVersion4 = config => {
  const prior = structuredClone(config)
  prior.workflow.intentReview.version = 4
  prior.workflow.intentReview.parts = prior.workflow.intentReview.parts.map(({ policyVersion, ...part }) => part)
  return prior
}

test('coordinated product outcomes require reconfirmation before using the new part policy', () => {
  const config = project('The chosen colour must affect only the current account and must be shown in the preview.')
  const current = classify(config, 'requirement')
  const legacy = asVersion4(current)
  assert.equal(answerPart(result(legacy)).status, 'needs-review')
  assert.equal(answerPart(result(reopened(legacy))).status, 'needs-review')
  const confirmed = classify(legacy, 'requirement')
  for (const candidate of [confirmed, reopened(confirmed)]) {
    const value = result(candidate)
    assert.equal(answerPart(value).status, 'applied')
    assert.equal(value.localRetrievalBlocked, false)
    assert.ok(value.requirements.some(requirement => requirement.clause === config.workflow.answers.acceptance))
  }
  assert.deepEqual(legacy.workflow.intentReview.parts, asVersion4(current).workflow.intentReview.parts)
})

test('coordinated inference objects allow local matching while preserving the complete provider ban', () => {
  for (const text of [
    'Do not send this brief or its answers to any external model provider.',
    'Never send any part of this project to JEV or another model service.',
  ]) {
    const original = project(text)
    const config = classify(original, 'restriction', 'inference')
    assert.equal(answerPart(result(asVersion4(config))).status, 'needs-review', text)
    for (const candidate of [config, reopened(config)]) {
      const value = result(candidate)
      assert.equal(answerPart(value).status, 'applied', text)
      assert.equal(value.localRetrievalBlocked, false, text)
      assert.equal(value.assessmentBlocked, true, text)
      assert.equal(value.assessmentCandidate, null, text)
      assert.deepEqual(preparePracticeAssessment(candidate, 'minimum-change'), preparePracticeAssessment(original, 'minimum-change'))
    }
  }
})

test('input handling remains a recorded limit without entering the inference request', () => {
  const original = project('Project input may be stored only in our approved workspace.')
  const config = classify(original, 'restriction', 'handling')
  const request = candidate => {
    const draft = preparePracticeAssessment(candidate, 'minimum-change')
    return buildAssistancePayload({ userBrief: draft.brief, purpose: draft.brief, suppliedProjectAnswers: draft.answers, practiceId: draft.practiceId, manualRecipe: draft.recipeId }, 'handling-boundary')
  }
  const payload = request(config)
  assert.deepEqual(payload, request(original))
  assert.deepEqual(Object.keys(payload).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
  assert.deepEqual(makeRequest(parseSuggestionInput(payload).item).state, { userBrief: original.project.purpose, suppliedProjectAnswers: payload.suppliedProjectAnswers })
  for (const candidate of [config, reopened(config)]) {
    const value = result(candidate)
    assert.equal(answerPart(value).status, 'applied')
    assert.equal(value.localRetrievalBlocked, false)
    assert.equal(value.assessmentBlocked, true)
    assert.equal(value.assessmentCandidate, null)
    assert.ok(value.boundaries.some(boundary => boundary.kind === 'handling' && boundary.clause === original.workflow.answers.acceptance))
  }
})

test('current confirmation preserves previously supported simple passive inference bans', () => {
  for (const text of [
    'Nothing in this description may be sent to an external model service.',
    'This brief must never reach an external model provider.',
  ]) {
    const config = classify(project(text), 'restriction', 'inference')
    for (const candidate of [config, asVersion4(config), reopened(config)]) {
      const value = result(candidate)
      assert.equal(answerPart(value).status, 'applied', text)
      assert.equal(value.localRetrievalBlocked, false, text)
      assert.equal(value.assessmentBlocked, true, text)
      assert.equal(value.assessmentCandidate, null, text)
    }
  }
})

test('history recognition cannot discard an independent current directive after a comma or colon', () => {
  for (const text of [
    'The original billing service did not show dates, omit the review stage.',
    'The previous app did not show dates: implement a new timezone converter.',
  ]) {
    const original = project(text)
    assert.ok(!answerPart(result(original)).quickActions.some(action => action.id === 'context'), text)
    const config = classify(original, 'context')
    for (const candidate of [config, reopened(config)]) {
      const value = result(candidate)
      assert.equal(answerPart(value).status, 'needs-review', text)
      assert.equal(value.localRetrievalBlocked, true, text)
      assert.equal(value.assessmentCandidate, null, text)
    }
  }
})

test('a coordinated independent predicate cannot be erased as an inference or handling object', () => {
  for (const [text, scope] of [
    ['Never send this brief to JEV and reports are inaccurate.', 'inference'],
    ['Never send this brief to JEV and transactions fail silently.', 'inference'],
    ['Project input may be stored only in our approved workspace and reports are inaccurate.', 'handling'],
  ]) {
    const original = project(text)
    assert.ok(!answerPart(result(original)).quickActions.some(action => action.id === scope), text)
    const config = classify(original, 'restriction', scope)
    for (const candidate of [config, reopened(config)]) {
      const value = result(candidate)
      assert.equal(answerPart(value).status, 'needs-review', text)
      assert.equal(value.localRetrievalBlocked, true, text)
      assert.equal(value.assessmentBlocked, true, text)
      assert.equal(value.assessmentCandidate, null, text)
    }
  }
})

test('scope clarification retains software contradictions instead of making one side authoritative', () => {
  const original = project('We are not building or changing software.')
  const config = updateIntentReview(classify(original, 'context'), { type: 'task', value: 'software-change' })
  for (const candidate of [config, reopened(config)]) {
    const value = result(candidate)
    assert.equal(answerPart(value).status, 'applied')
    assert.equal(value.clarification.taskConflict, true)
    assert.deepEqual(value.suggestions, [])
    assert.equal(value.assessmentCandidate, null)
  }
})

test('a product outcome with a separate imperative still needs clarification under the new policy', () => {
  for (const text of [
    'The screen must hide rejected orders and disable all outside connections.',
    'The preview must show accepted edits or erase the original records.',
  ]) {
    const config = classify(project(text), 'requirement')
    assert.equal(answerPart(result(config)).status, 'needs-review', text)
    assert.equal(answerPart(result(reopened(config))).status, 'needs-review', text)
  }
})

test('removing a historical anchor from matching preserves the dependent clause context-only question', () => {
  const original = project('')
  original.project.purpose = 'Fix the account dashboard date labels. Last year the old dashboard did not display any dates. That historical behavior is not the desired behavior now.'
  const first = reviewSourceParts(reviewSource(original)).find(part => part.field === 'brief' && part.index === 1)
  const clause = 'That historical behavior is not the desired behavior now'
  const config = updateIntentReview(original, { type: 'part', field: first.field, index: first.index, text: first.text, role: 'context', scope: null, practiceIds: [] })
  for (const candidate of [config, reopened(config), asVersion4(config)]) {
    const value = result(candidate)
    assert.equal(value.clarification.statement.clause, clause)
    assert.equal(value.clarification.statement.clarificationType, 'historical-context')
    assert.deepEqual(value.clarification.statement.allowedKinds, ['context'])
    assert.equal(value.clarification.statement.minimumPolicyVersion, 2)
    assert.equal(value.localRetrievalBlocked, true)
    const separated = separateIntent({ query: createKnowledgeQuery(projection), facts: briefSuggestionInput({ config: candidate }), source: reviewSource(candidate), review: getIntentReview(candidate), inheritedFields: ['answer:user-need'] })
    assert.ok(!separated.facts.brief.includes(first.text), 'The original anchor does not return as positive task wording')
    assert.ok(separated.facts.brief.includes(`${clause}.`))
    assert.deepEqual(preparePracticeAssessment(candidate, 'minimum-change'), preparePracticeAssessment(original, 'minimum-change'))
  }
  for (const kind of ['requirement', 'exclusion', 'context']) {
    const invalid = updateIntentReview(config, { type: 'statement', clause, kind, practiceIds: kind === 'exclusion' ? ['minimum-change'] : [] })
    if (kind === 'context') invalid.workflow.intentReview.statements[0].policyVersion = 1
    for (const candidate of [invalid, reopened(invalid)]) {
      const value = result(candidate)
      assert.equal(value.localRetrievalBlocked, true, kind)
      assert.equal(value.clarification.statement.clarificationType, 'historical-context', kind)
      assert.deepEqual(value.clarification.statement.allowedKinds, ['context'], kind)
      assert.ok(!value.clarification.resolvedStatements.some(statement => statement.clause === clause), kind)
    }
  }
  const confirmed = updateIntentReview(config, { type: 'statement', clause, kind: 'context' })
  assert.equal(result(confirmed).localRetrievalBlocked, false)
  assert.equal(result(confirmed).clarification.statement, null)
  assert.deepEqual(result(reopened(confirmed)).suggestions.map(item => item.practiceId).sort(), ['minimum-change', 'specification-first'], 'Resolved context preserves the exact supported practices independently of catalogue ranking')
  assert.equal(original.workflow.intentReview, undefined)
  assert.equal(config.workflow.intentReview.statements.length, 0)
})
