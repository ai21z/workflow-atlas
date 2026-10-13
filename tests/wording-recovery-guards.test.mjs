import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecipe, compile, parseImport, serializeProject } from '../factory/core.mjs'
import { reviewSource, reviewSourceParts, updateIntentReview } from '../factory/intent-review.mjs'
import { createBriefSuggestions } from '../factory/brief-suggestions.mjs'
import { preparePracticeAssessment } from '../factory/brief-suggestions-view.mjs'
import { loadProjection } from '../tools/atlas-query.mjs'

const model = createBriefSuggestions(await loadProjection())
const result = config => model.propose({ config })
const reopened = config => parseImport(serializeProject(config))
function project(sentence) {
  const config = createRecipe('feature-delivery')
  config.project.purpose = `Add a status filter to the existing invoice table. ${sentence}`
  config.practices = []
  return config
}
function classify(config, sentence, role, scope = null, practiceIds = []) {
  const part = reviewSourceParts(reviewSource(config)).find(item => item.field === 'brief' && item.text === sentence)
  assert.ok(part, sentence)
  return updateIntentReview(config, { type: 'part', field: part.field, index: part.index, text: part.text, role, scope, practiceIds })
}
const partFor = (config, sentence) => result(config).clarification.parts.find(part => part.field === 'brief' && part.text === sentence)

test('complete catalogue labels keep working when a label contains a grammar keyword', () => {
  const config = project('')
  config.project.purpose = 'Build the selected barcode scanning flow. Exclude Requirements before implementation and Smallest necessary change from this pack. Keep the original scanner contract passages and future corrections in a maintained project wiki.'
  for (const current of [config, reopened(config)]) {
    const proposal = result(current)
    assert.equal(proposal.localRetrievalBlocked, false)
    assert.deepEqual(proposal.suggestions.map(item => item.practiceId), ['evidence-wiki'])
    assert.ok(proposal.excluded.some(item => item.practiceRefs?.includes('practice:minimum-change')))
    assert.ok(proposal.excluded.some(item => item.practiceRefs?.includes('practice:specification-first')))
  }
})

test('historical recovery never absorbs a new direction or an input handling limit', () => {
  for (const sentence of [
    'The original player never checked cue identifiers and omit the approval stage.',
    'The original player never checked cue identifiers and the replacement must skip validation.',
    'The original player never checked cue identifiers, deploy the release.',
    'The original player never checked cue identifiers unless approval was granted.',
    'The original player never checked cue identifiers and never sent this brief to JEV.',
  ]) {
    const before = project(sentence)
    assert.equal(partFor(before, sentence).quickActions.some(action => action.role === 'context'), false, sentence)
    const config = classify(before, sentence, 'context')
    for (const current of [config, reopened(config)]) {
      assert.equal(partFor(current, sentence).status, 'needs-review', sentence)
      assert.deepEqual(reviewSource(current), reviewSource(before))
      assert.deepEqual(preparePracticeAssessment(current, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
    }
  }
})

test('a shared product requirement does not swallow independent commands, permissions or practice omissions', () => {
  for (const sentence of [
    'Do not create a duplicate that must keep the title and start without assignees.',
    'Never create a duplicate that must keep the title and start without assignees.',
    'Do not create an account that must keep the title and start without assignees.',
    'The duplicate must keep the title and start without assignees, deploy the release.',
    'The duplicate must keep the title and start without assignees: remove the approval stage.',
    'The duplicate must keep the title and start without assignees and omit specification-first.',
    'The duplicate must keep the title and start without assignees unless an external model approves.',
    'The duplicate must keep the title and send this brief to JEV.',
  ]) {
    const before = project(sentence)
    assert.equal(partFor(before, sentence).quickActions.some(action => action.role === 'requirement'), false, sentence)
    for (const [role, scope] of [['requirement', null], ['restriction', 'product']]) {
      const config = classify(before, sentence, role, scope)
      for (const current of [config, reopened(config)]) {
        assert.equal(partFor(current, sentence).status, 'needs-review', sentence)
        assert.equal(result(current).requirements.some(item => item.clause === sentence), false, sentence)
        assert.deepEqual(reviewSource(current), reviewSource(before))
        assert.deepEqual(preparePracticeAssessment(current, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
      }
    }
  }
})

test('historical settings and later named subjects retain their complete past predicate', () => {
  for (const sentence of [
    'In an earlier release, the player never checked cue identifiers and omitted the paused position.',
    'The original player never checked cue identifiers and the navigation omitted the paused position.',
    'The original player never checked cue identifiers and the navigation was confusing.',
  ]) {
    const before = project(sentence)
    assert.equal(partFor(before, sentence).quickActions.some(action => action.role === 'context'), true, sentence)
    const config = classify(before, sentence, 'context')
    for (const current of [config, reopened(config)]) {
      assert.equal(partFor(current, sentence).status, 'applied', sentence)
      assert.deepEqual(reviewSource(current), reviewSource(before))
      assert.deepEqual(preparePracticeAssessment(current, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
    }
  }
})

test('an unresolved input privacy exception pauses local practice offers through every role and task choice', () => {
  for (const sentence of [
    'Keep all project input private, but use an outside service if the team thinks it is needed.',
    'Keep this brief on the local workstation unless the team approves an external provider.',
    'Do not send this description to a model except when the owner requests it.',
    'Keep every document on our network unless the analyst decides a public service would be useful.',
    'This brief is confidential unless the owner explicitly approves sharing.',
    'This project input is private, but an approver may allow sharing.',
  ]) {
    const before = project(sentence)
    const draft = preparePracticeAssessment(before, 'minimum-change')
    const variants = [before, updateIntentReview(before, { type: 'task', value: 'software-change' })]
    for (const [role, scope] of [['task', null], ['context', null], ['requirement', null], ['restriction', 'product'], ['restriction', 'inference'], ['restriction', 'handling'], ['restriction', 'unresolved']]) {
      variants.push(classify(before, sentence, role, scope))
    }
    for (const config of variants) for (const current of [config, reopened(config)]) {
      const proposal = result(current)
      assert.equal(proposal.localRetrievalBlocked, true, sentence)
      assert.deepEqual(proposal.suggestions, [], sentence)
      assert.equal(proposal.assessmentBlocked, true, sentence)
      assert.equal(proposal.assessmentCandidate, null, sentence)
      assert.ok(proposal.unresolved.some(item => item.clause === sentence), sentence)
      assert.ok(proposal.unresolved.some(item => item.clarificationType === 'input-exception' && item.clause === sentence), sentence)
      assert.deepEqual(reviewSource(current), reviewSource(before))
      assert.deepEqual(preparePracticeAssessment(current, 'minimum-change'), draft)
    }
  }
})

test('a historical negative decision cannot absorb current actions, exceptions or model access', () => {
  const known = 'During the previous release, the team chose not to implement bookmarks or save reading position.'
  const config = classify(project(known), known, 'context')
  assert.equal(partFor(config, known).status, 'applied')
  for (const sentence of [
    'During the previous release, the team chose not to implement bookmarks or deploy the release.',
    'During the previous release, the team chose not to implement bookmarks or send this brief to JEV.',
    'During the previous release, the team chose not to implement bookmarks and now save reading position.',
    'During the previous release, the team chose not to implement bookmarks or the product must save reading position.',
    'During the previous release, the team chose not to implement bookmarks: save reading position.',
    'During the previous release, the team chose not to implement bookmarks unless a model permits it.',
  ]) {
    const before = project(sentence)
    assert.equal(partFor(before, sentence).quickActions.some(action => action.role === 'context'), false, sentence)
    const classified = classify(before, sentence, 'context')
    for (const current of [classified, reopened(classified)]) {
      assert.equal(partFor(current, sentence).status, 'needs-review', sentence)
      assert.deepEqual(reviewSource(current), reviewSource(before))
      assert.deepEqual(preparePracticeAssessment(current, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
    }
  }
})

test('a negative initial product access rule cannot stand for permissions or provider access', () => {
  const sentence = 'The invitation must retain the team name and start with no access to private folders.'
  const before = project(sentence)
  const config = classify(before, sentence, 'requirement')
  for (const current of [config, reopened(config)]) {
    assert.equal(partFor(current, sentence).status, 'applied')
    assert.ok(result(current).requirements.some(item => item.clause === sentence))
    assert.deepEqual(preparePracticeAssessment(current, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
  }
  for (const source of [
    'The invitation must retain its name and start with access to private folders.',
    'The invitation must retain its name and start with no access to private folders unless a model approves.',
    'The invitation must retain its name and start with no access to private folders, give the service full access.',
    'The invitation must retain its name and start with no access to private folders and send this brief to a model.',
  ]) {
    const original = project(source)
    assert.equal(partFor(original, source).quickActions.some(action => action.role === 'requirement'), false, source)
    const classified = classify(original, source, 'requirement')
    assert.equal(partFor(classified, source).status, 'needs-review', source)
    assert.equal(result(classified).requirements.some(item => item.clause === source), false, source)
  }
})

test('practice guidance aliases are bounded to named omissions and preserve older choices', () => {
  const sentence = 'Skip minimum-change guidance and specification-first guidance for this draft.'
  const before = project(sentence)
  const expected = ['practice:minimum-change', 'practice:specification-first']
  for (const current of [before, reopened(before), updateIntentReview(before, { type: 'task', value: 'software-change' })]) {
    assert.deepEqual(result(current).excluded.flatMap(item => item.practiceRefs).sort(), expected)
    assert.deepEqual(result(current).suggestions, [])
  }
  for (const policyVersion of [1, 2, 3]) {
    const old = classify(before, sentence, 'context')
    old.workflow.intentReview.parts[0].policyVersion = policyVersion
    for (const current of [old, reopened(old)]) {
      assert.equal(partFor(current, sentence).status, 'applied', String(policyVersion))
      assert.deepEqual(result(current).excluded, [], String(policyVersion))
      const confirmed = classify(current, sentence, 'restriction', 'practices', ['minimum-change', 'specification-first'])
      assert.deepEqual(result(confirmed).excluded.flatMap(item => item.practiceRefs).sort(), expected)
      assert.deepEqual(preparePracticeAssessment(confirmed, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
    }
  }
  for (const source of [
    'Do not skip minimum-change guidance and specification-driven development for this draft.',
    'Skip minimum-change guidance and unknown-practice for this draft.',
    'Skip minimum-change guidance and publish the release for this draft.',
    'Skip minimum-change guidance and specification-driven development for this draft unless approved.',
  ]) {
    const current = project(source)
    assert.equal(partFor(current, source).quickActions.some(action => action.id === 'practices'), false, source)
    assert.equal(result(current).excluded.some(item => item.reasons?.some(reason => reason.text === 'Left out by your text or recorded practice choices')), false, source)
  }
})

test('a partly named omission asks for clarification without inventing an unknown alias', () => {
  for (const sentence of [
    'Skip minimum-change guidance and specification-driven development for this draft.',
    'Skip minimum-change guidance and unknown-practice for this draft.',
  ]) {
    const before = project(sentence)
    const variants = [before, updateIntentReview(before, { type: 'task', value: 'software-change' })]
    for (const role of ['task', 'context', 'requirement']) variants.push(classify(before, sentence, role))
    for (const config of variants) for (const current of [config, reopened(config)]) {
      const proposal = result(current)
      assert.equal(proposal.localRetrievalBlocked, true, sentence)
      assert.deepEqual(proposal.suggestions, [], sentence)
      assert.equal(proposal.assessmentCandidate, null, sentence)
      assert.ok(proposal.unresolved.some(item => item.clause === sentence), sentence)
      assert.equal(partFor(current, sentence).quickActions.some(action => action.id === 'practices'), false, sentence)
      assert.deepEqual(reviewSource(current), reviewSource(before))
      assert.deepEqual(preparePracticeAssessment(current, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
    }
  }
})

test('new historical and requirement recognition requires reconfirmation of old part policies', () => {
  for (const [sentence, role] of [
    ['The original player never checked cue identifiers and omitted the paused position.', 'context'],
    ['The duplicate must keep the title and start without assignees.', 'requirement'],
  ]) {
    const before = project(sentence)
    for (const policyVersion of [1, 2, 3]) {
      const config = classify(before, sentence, role)
      config.workflow.intentReview.parts[0].policyVersion = policyVersion
      for (const current of [config, reopened(config), updateIntentReview(config, { type: 'task', value: 'software-change' })]) {
        assert.equal(partFor(current, sentence).status, 'needs-review', `${policyVersion}: ${sentence}`)
        assert.equal(current.workflow.intentReview.parts[0].policyVersion, policyVersion)
        const confirmed = classify(current, sentence, role)
        assert.equal(partFor(confirmed, sentence).status, 'applied', sentence)
        assert.deepEqual(reviewSource(confirmed), reviewSource(before))
        assert.deepEqual(preparePracticeAssessment(confirmed, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
      }
    }
  }
})

test('ordinary conditional product privacy behavior does not become a local input exception gate', () => {
  for (const sentence of [
    'The password preview must mask private values when the field loses focus.',
    'The account row must hide its private email unless the current user owns the account.',
    'The input field must show a warning if a private value is selected.',
    'The input field must keep private values hidden unless the current user owns the account.',
  ]) {
    const before = project(sentence)
    const config = updateIntentReview(classify(before, sentence, 'requirement'), { type: 'task', value: 'software-change' })
    for (const current of [config, reopened(config)]) {
      assert.equal(result(current).localRetrievalBlocked, false, sentence)
      assert.deepEqual(reviewSource(current), reviewSource(before))
      assert.deepEqual(preparePracticeAssessment(current, 'minimum-change'), preparePracticeAssessment(before, 'minimum-change'))
    }
  }
})

test('recovered source sentences stay complete in generated requirements and workflow documents', () => {
  for (const [sentence, role] of [
    ['The original player never checked cue identifiers and omitted the paused position.', 'context'],
    ['The duplicate must keep the title and start without assignees.', 'requirement'],
  ]) {
    const before = project(sentence)
    const config = classify(before, sentence, role)
    for (const current of [config, reopened(config)]) {
      assert.equal(partFor(current, sentence).status, 'applied', sentence)
      for (const path of ['WORKFLOW.md', 'templates/REQUIREMENTS.md']) {
        assert.ok(compile(current).files.find(file => file.path === path).content.includes(before.project.purpose), `${path}: ${sentence}`)
      }
      assert.deepEqual(current.workflow.enabledStages, before.workflow.enabledStages)
      assert.deepEqual(current.practices, before.practices)
    }
  }
})
