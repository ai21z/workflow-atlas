import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecipe, serializeProject, parseImport } from '../factory/core.mjs'
import { updateIntentReview, getIntentReview } from '../factory/intent-review.mjs'
import { createBriefSuggestions } from '../factory/brief-suggestions.mjs'
import { createKnowledgeQuery } from '../factory/knowledge-query.mjs'
import { preparePracticeAssessment } from '../factory/brief-suggestions-view.mjs'
import { loadProjection } from '../tools/atlas-query.mjs'

const data = await loadProjection()
const model = createBriefSuggestions(data)
const query = createKnowledgeQuery(data)
const project = purpose => {
  const config = createRecipe('feature-delivery')
  config.project.purpose = purpose
  config.practices = []
  return config
}
const ids = config => model.propose({ config }).suggestions.map(item => item.practiceId).sort()

test('knowledge topic mentions and one-off summaries do not establish ongoing source maintenance', () => {
  for (const brief of [
    'Add a wiki navigation button to the account settings page.',
    'Add a knowledge index search filter to the app.',
    'Prepare a one-time snapshot of the maintained project wiki with original sources.',
    'Summarize the maintained evidence handbook.',
    'Build a feature displaying the maintained wiki sources.',
    'Build a screen that lists records maintained by the evidence team.',
    'Build the invoice API. We will use the maintained reference handbook as evidence.',
    'Create a button to open the maintained wiki sources.',
    'Maintain a wiki navigation button with source links.',
  ]) assert.ok(!ids(project(brief)).includes('evidence-wiki'), brief)
})

test('maintained source references and handbooks retrieve the practice without naming wiki', () => {
  for (const brief of [
    'Keep the original format passages and later corrections in a maintained reference.',
    'Maintain a source linked handbook of the format, editorial decisions and later corrections.',
  ]) {
    const config = project(brief)
    assert.deepEqual(ids(config), ['evidence-wiki'])
    assert.deepEqual(config.practices, [], 'Suggestions never select a practice')
  }
})

test('independent knowledge need supports mixed work without changing original inference text', () => {
  let config = project('Build the requested account screen. Keep a useful record for the next team.')
  const before = structuredClone(config)
  config = updateIntentReview(config, { type: 'task', value: 'software-change' })
  config = updateIntentReview(config, { type: 'knowledge', value: 'maintained-reference' })
  assert.deepEqual(ids(config), ['evidence-wiki', 'minimum-change', 'specification-first'])
  assert.equal(getIntentReview(config).taskKind, 'software-change')
  for (const practice of ['minimum-change', 'specification-first', 'evidence-wiki']) assert.deepEqual(preparePracticeAssessment(config, practice), preparePracticeAssessment(before, practice))
  assert.deepEqual(ids(parseImport(serializeProject(config))), ids(config))
  config.workflow.enabledStages = ['requirements']
  assert.deepEqual(ids(config), ['evidence-wiki'])
})

test('one-off and unsure choices cannot be bypassed by lexical wiki matches', () => {
  for (const value of ['one-off', 'unsure']) {
    const config = updateIntentReview(project('Build the account screen. Maintain a source backed project wiki.'), { type: 'knowledge', value })
    assert.deepEqual(ids(config), ['minimum-change', 'specification-first'])
    const conflicting = updateIntentReview(config, { type: 'task', value: 'knowledge-work' })
    assert.equal(model.propose({ config: conflicting }).clarification.knowledgeConflict, true)
    assert.deepEqual(ids(conflicting), [])
  }
})

test('a knowledge choice cannot override exclusions, restrictions, existing selections or stale source', () => {
  for (const [suffix, blocked] of [
    ['Do not create or maintain a project wiki.', false],
    ['Do not submit this description to an AI provider.', true],
    ['Never retain any material from this request anywhere.', true],
  ]) {
    const config = updateIntentReview(project(`Build the account screen. ${suffix}`), { type: 'knowledge', value: 'maintained-reference' })
    const result = model.propose({ config })
    assert.ok(!ids(config).includes('evidence-wiki'))
    assert.equal(result.unresolvedNegation, blocked)
    if (blocked) assert.equal(result.assessmentCandidate, null)
  }
  const selected = updateIntentReview(project('Build the account screen.'), { type: 'knowledge', value: 'maintained-reference' })
  selected.practices = ['evidence-wiki']
  assert.ok(!ids(selected).includes('evidence-wiki'))
  selected.practices = []
  selected.project.purpose += ' Changed scope.'
  assert.equal(model.propose({ config: selected }).clarification.stale, true)
  assert.ok(!ids(selected).includes('evidence-wiki'))
})

test('new complete conditional and past-version meanings require an explicit v3 confirmation', () => {
  const cases = [
    ['The boarding pass must not be marked ready unless the document has been checked', 'requirement'],
    ['The warning must not disappear until the weight is safe', 'requirement'],
    ['Unless the document has been checked, the boarding pass must not be marked ready', 'requirement'],
    ['The first version did not distinguish recipients who shared a surname', 'context'],
    ['During the original prototype we did not support a separate accent pattern', 'context'],
    ['In the retired desktop tool, grades were not attached to route identifiers', 'context'],
  ]
  for (const [clause, kind] of cases) {
    const before = query.proposalContext({ brief: `${clause}.` })
    assert.deepEqual(before.unresolved.map(item => item.clause), [clause])
    assert.deepEqual(before.unresolved[0].allowedKinds, [kind])
    for (const policyVersion of [1, 2, 3]) {
      const after = query.proposalContext({ brief: `${clause}.`, contextResolutions: [{ clause, kind, policyVersion, practiceIds: [] }] })
      assert.equal(after.unresolvedNegation, policyVersion !== 3, `${policyVersion}: ${clause}`)
      if (policyVersion === 3) assert.equal(after.resolvedStatements[0].clause, clause)
    }
  }
})

test('new condition and history forms cannot dismiss handling restrictions or current directives', () => {
  for (const clause of [
    'The agent must not send this brief until the user approves',
    'The application must not retain any material unless approved',
    'During the original prototype we did not send prompts to the provider',
    'In the retired desktop tool, records were not saved',
    'The old system did not show names, but never query records now',
    'The workflow must not include a wiki unless approved',
    'The warning must not disappear until the weight is safe unless approved',
    'The original version did not display labels and now we must omit the wiki',
    'Never disclose any information from this request',
    'The system must not reveal private details until approval',
    'The photos must not be shared until approval',
    'The old application did not display amounts so keep all secrets private',
    'Unless verification passes, the totals must not appear and publish every request',
  ]) {
    const before = query.proposalContext({ brief: `${clause}.` })
    assert.equal(before.unresolvedNegation, true, clause)
    assert.ok(before.unresolved.every(item => !item.clarifiable), clause)
    for (const kind of ['requirement', 'context']) {
      const after = query.proposalContext({ brief: `${clause}.`, contextResolutions: before.unresolved.map(item => ({ clause: item.clause, kind, policyVersion: 3, practiceIds: [] })) })
      assert.equal(after.unresolvedNegation, true, clause)
    }
  }
})

test('existing v2 whole statement confirmations still work and wrong roles cannot activate', () => {
  const clause = 'The marks must not disappear when hints open'
  for (const policyVersion of [2, 3]) {
    assert.equal(query.proposalContext({ brief: `${clause}.`, contextResolutions: [{ clause, kind: 'requirement', policyVersion }] }).unresolvedNegation, false)
    assert.equal(query.proposalContext({ brief: `${clause}.`, contextResolutions: [{ clause, kind: 'context', policyVersion }] }).unresolvedNegation, true)
  }
})

test('negative handling subjects stay paused even after local choices or recorded overrides', () => {
  for (const clause of [
    'Nothing in this description or the supplied answers may be sent to an external model service',
    'None of the supplied text may leave this device',
    'No part of this description may reach an external provider',
    'Nothing here may be disclosed',
  ]) {
    let config = project(`Build the account screen. ${clause}.`)
    config = updateIntentReview(config, { type: 'task', value: 'software-change' })
    config = updateIntentReview(config, { type: 'knowledge', value: 'maintained-reference' })
    for (const kind of ['requirement', 'context']) {
      const recorded = updateIntentReview(config, { type: 'statement', clause, kind })
      const result = model.propose({ config: recorded })
      assert.equal(result.unresolvedNegation, true, clause)
      assert.equal(result.assessmentCandidate, null, clause)
      assert.deepEqual(result.suggestions, [])
      assert.equal(result.clarification.statement.clause, clause)
      assert.equal(result.clarification.statement.clarifiable, false)
      assert.deepEqual(model.propose({ config: parseImport(serializeProject(recorded)) }).suggestions, [])
    }
  }
})
