import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecipe, parseImport, serializeProject } from '../factory/core.mjs'
import { reviewSource, reviewSourceParts, updateIntentReview } from '../factory/intent-review.mjs'
import { createBriefSuggestions } from '../factory/brief-suggestions.mjs'
import { preparePracticeAssessment } from '../factory/brief-suggestions-view.mjs'
import { loadProjection } from '../tools/atlas-query.mjs'

const model = createBriefSuggestions(await loadProjection())
function project(sentence) {
  const config = createRecipe('feature-delivery')
  config.project.purpose = `Add a status filter to the invoice table. ${sentence}`
  config.practices = []
  return config
}
const result = config => model.propose({ config })
const reopened = config => parseImport(serializeProject(config))
const ids = config => result(config).suggestions.map(item => item.practiceId).sort()
function classify(config, sentence, role, scope = null) {
  const part = reviewSourceParts(reviewSource(config)).find(item => item.field === 'brief' && item.text === sentence)
  assert.ok(part, sentence)
  return updateIntentReview(config, { type: 'part', field: part.field, index: part.index, text: part.text, role, scope, practiceIds: [] })
}

test('shared product outcomes cannot swallow an appended imperative after a recognized UI object', () => {
  for (const tail of [
    ': deploy the production package',
    ', migrate the database',
    ', route all traffic to the new deployment',
    ' before deploying the production package',
  ]) {
    const sentence = `A successful completion must show one hundred percent and clear the spinner${tail}.`
    const before = project(sentence)
    const draft = preparePracticeAssessment(before, 'minimum-change')
    assert.equal(result(before).clarification.parts[1].quickActions.some(action => action.role === 'requirement'), false, sentence)
    for (const [role, scope] of [['requirement', null], ['restriction', 'product']]) {
      const config = classify(before, sentence, role, scope)
      for (const current of [config, reopened(config)]) {
        const proposal = result(current)
        assert.equal(proposal.clarification.parts[1].status, 'needs-review', sentence)
        assert.equal(proposal.requirements.some(item => item.clause === sentence), false, sentence)
        assert.deepEqual(reviewSource(current), reviewSource(before))
        assert.deepEqual(preparePracticeAssessment(current, 'minimum-change'), draft)
      }
    }
  }
  const sentence = 'A successful completion must show one hundred percent and clear the spinner.'
  const config = classify(project(sentence), sentence, 'requirement')
  assert.equal(result(config).clarification.parts[1].status, 'applied')
  assert.equal(result(config).requirements.some(item => item.clause === sentence), true)
})

test('a task decision answers only a complete uncertainty marker, keeping appended limits and commands', () => {
  for (const sentence of [
    'We have not selected a deliverable, but do not use specification-first.',
    'We have not selected a deliverable, and do not send this brief to JEV.',
    'We have not selected a deliverable unless the compliance review permits it.',
    'We have not selected a deliverable: migrate the database.',
  ]) {
    const before = project(sentence)
    for (const value of ['software-change', 'knowledge-work', 'other']) {
      const config = updateIntentReview(before, { type: 'task', value })
      for (const current of [config, reopened(config)]) {
        assert.equal(result(current).localRetrievalBlocked, true, sentence)
        assert.deepEqual(ids(current), [], sentence)
        assert.equal(result(current).assessmentCandidate, null, sentence)
        assert.deepEqual(preparePracticeAssessment(current, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
      }
    }
  }
  const standalone = updateIntentReview(project('We have not selected a deliverable.'), { type: 'task', value: 'software-change' })
  assert.equal(result(standalone).localRetrievalBlocked, false)
  assert.deepEqual(ids(standalone), ['minimum-change', 'specification-first'])
})

test('an exact source edit makes an earlier task decision stale instead of choosing a new deliverable', () => {
  const before = updateIntentReview(project('We have not selected a deliverable.'), { type: 'task', value: 'software-change' })
  assert.equal(result(before).clarification.intentUndecided, false)
  const edited = structuredClone(before)
  edited.project.purpose = edited.project.purpose.replace('invoice table', 'customer table')
  for (const config of [edited, reopened(edited)]) {
    const proposal = result(config)
    assert.equal(proposal.clarification.stale, true)
    assert.equal(proposal.clarification.intentUndecided, true)
    assert.equal(proposal.localRetrievalBlocked, true)
    assert.deepEqual(ids(config), [])
    assert.equal(proposal.assessmentCandidate, null)
  }
})

test('explicit input copy limits block assessment before classification and survive every alternative label', () => {
  for (const sentence of [
    'Do not send this brief to JEV, and do not retain copies of the project input.',
    'Erase temporary copies of the project input after review.',
  ]) {
    const before = project(sentence)
    assert.equal(result(before).assessmentBlocked, true, sentence)
    assert.equal(result(before).assessmentCandidate, null, sentence)
    const source = reviewSource(before)
    const draft = preparePracticeAssessment(before, 'minimum-change')
    for (const [role, scope] of [['task', null], ['context', null], ['requirement', null], ['restriction', 'product'], ['restriction', 'inference'], ['restriction', 'handling']]) {
      const config = classify(before, sentence, role, scope)
      for (const current of [config, reopened(config)]) {
        assert.equal(result(current).assessmentBlocked, true, `${role}/${scope}: ${sentence}`)
        assert.equal(result(current).assessmentCandidate, null, sentence)
        assert.deepEqual(reviewSource(current), source)
        assert.deepEqual(preparePracticeAssessment(current, 'minimum-change'), draft)
      }
    }
    const confirmed = classify(before, sentence, 'restriction', 'handling')
    assert.equal(result(confirmed).localRetrievalBlocked, false, sentence)
    assert.deepEqual(ids(confirmed), ['minimum-change', 'specification-first'])
  }
})

test('choosing work cannot erase positive directives attached to an undecided options sentence', () => {
  for (const sentence of [
    'We have not decided between a handbook or a dashboard, deploy the release.',
    'We have not decided whether to use a dashboard, remove the approval step.',
    'We have not decided between a handbook and a dashboard and publish the files.',
  ]) {
    const before = project(sentence)
    for (const value of ['software-change', 'knowledge-work', 'other']) {
      const config = updateIntentReview(before, { type: 'task', value })
      for (const current of [config, reopened(config)]) {
        assert.equal(result(current).localRetrievalBlocked, true, sentence)
        assert.deepEqual(ids(current), [], sentence)
        assert.deepEqual(reviewSource(current), reviewSource(before))
        assert.deepEqual(preparePracticeAssessment(current, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
      }
    }
  }
})

test('one-time document work and an unrelated cancellation are not a current software authority conflict', () => {
  for (const [brief, answer] of [
    ['Add a one-time process explanation to the workshop notes.', 'The sponsor canceled implementation and now requests only a one-time process explanation.'],
    ['Add a one-time briefing about the existing customer dashboard.', 'The sponsor canceled implementation and now requests only a one-time process explanation.'],
    ['Add a status filter to the existing account dashboard.', 'The sponsor canceled implementation of the legacy batch job and now requests a one-time explanation of that decision.'],
    ['Add a status filter to the existing account dashboard.', 'The owner canceled a customer order and now requests a one-time receipt.'],
    ['Add a status filter to the existing account dashboard.', 'The owner has not canceled implementation and now requests a one-time progress report.'],
  ]) {
    const before = createRecipe('feature-delivery')
    before.project.purpose = brief
    before.workflow.answers['user-need'] = answer
    before.practices = []
    for (const config of [before, reopened(before), updateIntentReview(before, { type: 'task', value: 'other' })]) {
      const proposal = result(config)
      assert.equal(proposal.unresolved.some(item => item.reason.includes('recorded answer cancels it')), false, `${brief} ${answer}`)
      assert.deepEqual(preparePracticeAssessment(config, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
    }
  }
})

test('automatic exact omissions reject negated scopes, unknown names, exceptions and independent commands', () => {
  for (const sentence of [
    'For this workflow, do not skip minimum-change plus specification-first.',
    'Not for this workflow, skip minimum-change plus specification-first.',
    'For this workflow, skip minimum-change plus unknown-practice.',
    'Skip minimum-change plus specification-first in this delivery unless approved.',
    'For this workflow, skip minimum-change plus specification-first and deploy the release.',
    'For this workflow, leave out minimum-change plus specification-first: create a provider account.',
  ]) {
    const config = project(sentence)
    for (const current of [config, reopened(config)]) {
      const proposal = result(current)
      assert.equal(proposal.clarification.parts[1].quickActions.some(action => action.id === 'practices'), false, sentence)
      assert.equal(proposal.excluded.some(item => item.reasons?.some(reason => reason.text === 'Left out by your text or recorded practice choices')), false, sentence)
    }
  }
})

test('new named omission recognition does not silently replace an older confirmed background meaning', () => {
  const sentence = 'Skip minimum-change plus specification-first in this delivery.'
  const before = project(sentence)
  for (const policyVersion of [1, 2]) {
    const config = classify(before, sentence, 'context')
    config.workflow.intentReview.parts[0].policyVersion = policyVersion
    const versions = [config]
    if (policyVersion === 1) {
      const version4 = structuredClone(config)
      version4.workflow.intentReview.version = 4
      delete version4.workflow.intentReview.parts[0].policyVersion
      versions.push(version4)
    }
    for (const version of versions) for (const current of [version, reopened(version)]) {
      const proposal = result(current)
      assert.equal(proposal.clarification.parts[1].status, 'applied')
      assert.deepEqual(proposal.excluded, [])
      assert.deepEqual(ids(current), ['minimum-change', 'specification-first'])
      assert.deepEqual(preparePracticeAssessment(current, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
    }
  }
  const currentPolicy = classify(before, sentence, 'context')
  for (const current of [currentPolicy, reopened(currentPolicy)]) {
    const proposal = result(current)
    assert.equal(proposal.clarification.parts[1].status, 'needs-review')
    assert.deepEqual(ids(current), [])
    assert.deepEqual(proposal.excluded.flatMap(item => item.practiceRefs).sort(), ['practice:minimum-change', 'practice:specification-first'])
    assert.equal(proposal.clarification.parts[1].quickActions.some(action => action.id === 'practices'), true)
  }
})
