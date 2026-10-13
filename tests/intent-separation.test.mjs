import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecipe, compile, compileStandaloneSkill, parseImport, serializeProject } from '../factory/core.mjs'
import { reviewSource, reviewSourceParts, updateIntentReview } from '../factory/intent-review.mjs'
import { createBriefSuggestions } from '../factory/brief-suggestions.mjs'
import { preparePracticeAssessment } from '../factory/brief-suggestions-view.mjs'
import { buildAssistancePayload } from '../factory/jev-assistance.mjs'
import { makeRequest } from '../factory/jev-contract.mjs'
import { parseSuggestionInput } from '../tools/serve.mjs'
import { loadProjection } from '../tools/atlas-query.mjs'

const model = createBriefSuggestions(await loadProjection())
const project = (answer = '', brief = 'Build the account dashboard.') => {
  const config = createRecipe('feature-delivery')
  config.project.purpose = brief
  config.workflow.answers.acceptance = answer
  config.practices = []
  return config
}
const classify = (config, field, index, role, scope = null, practiceIds = []) => {
  const part = reviewSourceParts(reviewSource(config)).find(item => item.field === field && item.index === index)
  return updateIntentReview(config, { type: 'part', field, index, text: part.text, role, scope, practiceIds })
}
const current = config => model.propose({ config })
const ids = result => result.suggestions.map(item => item.practiceId).sort()
const part = (result, field = 'answer:acceptance', index = 0) => result.clarification.parts.find(item => item.field === field && item.index === index)
const file = (pack, path) => pack.files.find(item => item.path === path)?.content

test('a scoped product requirement keeps its exact rule without globally pausing local task guidance', () => {
  const config = project('Edits must not be saved until the reviewer confirms the result.')
  const before = structuredClone(config)
  assert.equal(current(config).localRetrievalBlocked, true)
  const clarified = classify(config, 'answer:acceptance', 0, 'requirement')
  const result = current(clarified)
  assert.deepEqual(ids(result), ['minimum-change', 'specification-first'])
  assert.equal(part(result).status, 'applied')
  assert.equal(result.assessmentBlocked, false)
  assert.ok(result.requirements.some(item => item.clause === config.workflow.answers.acceptance && item.userConfirmed))
  assert.deepEqual(config, before)
  assert.deepEqual(clarified.practices, [])
  assert.deepEqual(clarified.workflow.answers, config.workflow.answers)
  assert.deepEqual(ids(current(parseImport(serializeProject(clarified)))), ids(result))
})

test('scoping an inference ban allows local task guidance while keeping optional assessment unavailable', () => {
  let config = project('Do not send this description to JEV.')
  config = classify(config, 'answer:acceptance', 0, 'restriction', 'inference')
  const result = current(config)
  assert.equal(result.localRetrievalBlocked, false)
  assert.deepEqual(ids(result), ['minimum-change', 'specification-first'])
  assert.equal(result.assessmentBlocked, true)
  assert.equal(result.assessmentCandidate, null)
  assert.equal(part(result).status, 'applied')
  assert.ok(result.boundaries.some(item => item.kind === 'inference' && item.clause === config.workflow.answers.acceptance))
  assert.equal(current(parseImport(serializeProject(config))).assessmentCandidate, null)
})

test('unrecognized explicit restriction scope cannot silently permit optional assessment', () => {
  for (const scope of ['inference', 'unresolved']) {
    const config = classify(project('Keep all material on this device.'), 'answer:acceptance', 0, 'restriction', scope)
    const result = current(config)
    assert.equal(part(result).status, 'needs-review')
    assert.equal(result.assessmentBlocked, true)
    assert.equal(result.assessmentCandidate, null)
  }
})

test('task, requirement and context roles cannot neutralize original inference and input handling limits', () => {
  for (const text of [
    'Do not send this description to JEV.',
    'Nothing in this description may be sent to an external model service.',
    'Never retain any material from this request anywhere.',
  ]) for (const role of ['task', 'requirement', 'context']) {
    let config = classify(project(text), 'answer:acceptance', 0, role)
    config = updateIntentReview(config, { type: 'task', value: 'software-change' })
    const result = current(config)
    assert.equal(result.assessmentBlocked, true, `${role}: ${text}`)
    assert.equal(result.assessmentCandidate, null, `${role}: ${text}`)
    assert.equal(part(result).status, 'needs-review', `${role}: ${text}`)
  }
})

test('historical context removes no current directive hidden in the same sentence', () => {
  for (const text of [
    'Last year the app did not display dates, never disclose customer records.',
    'The original version did not show dates and stop all outside connections.',
    'Earlier the page did not display notes; omit the review stage.',
  ]) {
    const result = current(classify(project(text), 'answer:acceptance', 0, 'context'))
    assert.equal(part(result).status, 'needs-review', text)
    assert.equal(result.localRetrievalBlocked, true, text)
    assert.equal(result.assessmentCandidate, null, text)
  }
  const result = current(classify(project('Last year the app did not display any dates.'), 'answer:acceptance', 0, 'context'))
  assert.equal(part(result).status, 'applied')
  assert.deepEqual(ids(result), ['minimum-change', 'specification-first'])
})

test('a product role cannot discard a separate coordinated directive', () => {
  for (const text of [
    'Invalid entries must not appear; never disclose customer records.',
    'The screen must not show unapproved entries and stop all outside connections.',
  ]) for (const role of ['requirement', 'restriction']) {
    const result = current(classify(project(text), 'answer:acceptance', 0, role, role === 'restriction' ? 'product' : null))
    assert.equal(part(result).status, 'needs-review', `${role}: ${text}`)
    assert.equal(result.localRetrievalBlocked, true, `${role}: ${text}`)
  }
})

test('one complete omission can explicitly exclude multiple practices without changing existing selections', () => {
  let config = project('Leave those two extra procedures out of this pack.', 'Build the account dashboard. Maintain a source backed project wiki.')
  config = classify(config, 'answer:acceptance', 0, 'restriction', 'practices', ['minimum-change', 'evidence-wiki'])
  const result = current(config)
  assert.equal(part(result).status, 'applied')
  assert.deepEqual(ids(result), ['specification-first'])
  assert.deepEqual(config.practices, [])
  const reopened = parseImport(serializeProject(config))
  assert.deepEqual(ids(current(reopened)), ids(result))
  assert.deepEqual(reopened.workflow.intentReview.parts[0].practiceIds, ['minimum-change', 'evidence-wiki'])
  reopened.practices = ['minimum-change']
  assert.deepEqual(ids(current(reopened)), ['specification-first'])
  assert.deepEqual(reopened.practices, ['minimum-change'])
})

test('practice exclusions cannot discard conditional limits, double negatives or mixed directives', () => {
  for (const text of [
    'No release before security approval.',
    'Do not deploy the project without review.',
    'Evidence wiki is not optional.',
    'Do not omit the review procedure.',
    'Do not use the wiki and keep the source evidence.',
    'Do not use the wiki and stop all outside connections.',
  ]) {
    const result = current(classify(project(text), 'answer:acceptance', 0, 'restriction', 'practices', ['minimum-change']))
    assert.equal(part(result).status, 'needs-review', text)
    assert.equal(result.localRetrievalBlocked, true, text)
    assert.equal(result.assessmentCandidate, null, text)
  }
})

test('inherited description text does not create a duplicate classification step', () => {
  const config = project('', 'Build the account dashboard. Edits must not be stored until they are approved.')
  const result = current(classify(config, 'brief', 1, 'requirement'))
  assert.ok(!result.clarification.parts.some(item => item.field === 'answer:user-need'))
  assert.deepEqual(ids(result), ['minimum-change', 'specification-first'])
  const separate = structuredClone(config)
  separate.workflow.answers.acceptance = 'Edits must not be stored until they are approved.'
  const onlyBrief = classify(separate, 'brief', 1, 'requirement')
  assert.equal(current(onlyBrief).localRetrievalBlocked, true, 'An independently supplied duplicate remains independently unresolved')
  const both = classify(onlyBrief, 'answer:acceptance', 0, 'requirement')
  assert.deepEqual(ids(current(both)), ['minimum-change', 'specification-first'])
})

test('stage changes recheck eligibility while source edits invalidate part meaning', () => {
  const config = classify(project('Edits must not be stored until approved.'), 'answer:acceptance', 0, 'requirement')
  const stages = structuredClone(config)
  stages.workflow.enabledStages = ['requirements']
  assert.deepEqual(ids(current(stages)), [])
  assert.equal(current(stages).clarification.stale, false)
  assert.deepEqual(stages.workflow.intentReview, config.workflow.intentReview)
  const edited = structuredClone(config)
  edited.workflow.answers.acceptance = 'Never store any information from this request.'
  assert.equal(current(edited).clarification.stale, true)
  assert.equal(current(edited).assessmentCandidate, null)
  assert.deepEqual(edited.workflow.intentReview, config.workflow.intentReview)
})

test('part roles and scopes never enter provider state or change the original practice draft', () => {
  const original = project('Edits must not be stored until approved.')
  let config = classify(original, 'brief', 0, 'task')
  config = classify(config, 'answer:acceptance', 0, 'requirement')
  config = updateIntentReview(config, { type: 'knowledge', value: 'maintained-reference' })
  for (const practiceId of ['minimum-change', 'specification-first', 'evidence-wiki']) {
    const before = preparePracticeAssessment(original, practiceId)
    const after = preparePracticeAssessment(config, practiceId)
    assert.deepEqual(after, before)
    const draft = { userBrief: after.brief, purpose: after.brief, suppliedProjectAnswers: after.answers, practiceId, manualRecipe: after.recipeId }
    const payload = buildAssistancePayload(draft, 'parts-boundary')
    assert.deepEqual(Object.keys(payload).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
    assert.deepEqual(buildAssistancePayload({ ...draft, parts: config.workflow.intentReview.parts, intentReview: config.workflow.intentReview }, 'parts-boundary'), payload)
    const request = makeRequest(parseSuggestionInput(payload).item)
    assert.deepEqual(request.state, { userBrief: original.project.purpose, suppliedProjectAnswers: payload.suppliedProjectAnswers })
    assert.throws(() => parseSuggestionInput({ ...payload, parts: config.workflow.intentReview.parts }), error => error.code === 'invalid_input')
  }
})

test('exports preserve exact source roles and restrictions without claiming they are verified', () => {
  let config = project('Edits must not be stored until approved. Do not send this description to JEV.')
  config = classify(config, 'answer:acceptance', 0, 'requirement')
  config = classify(config, 'answer:acceptance', 1, 'restriction', 'inference')
  const originalReview = structuredClone(config.workflow.intentReview)
  for (const stale of [false, true]) {
    if (stale) config.project.purpose += ' Include the revised layout.'
    const pack = compile(config)
    const standalone = compileStandaloneSkill(config, 'implementation')
    for (const content of [file(pack, 'WORKFLOW.md'), file(pack, 'templates/REQUIREMENTS.md'), file(standalone, 'implementation/references/project.md')]) {
      assert.ok(content.includes(originalReview.parts[0].text))
      assert.ok(content.includes(originalReview.parts[1].text))
      assert.match(content, /Product requirement/)
      assert.match(content, /Restriction/)
      assert.match(content, stale ? /not applied/ : /do not approve requirements/)
    }
    assert.deepEqual(parseImport(file(pack, 'project.json')).workflow.intentReview, originalReview)
  }
})

test('line wrapped conditions remain attached to the confirmed requirement in matching and exports', () => {
  for (const text of [
    'Unless permission is granted,\nrecords must not appear.',
    'If permission is granted,\r\nrecords must not appear.',
    'Records must not appear\n\nunless permission is granted.',
  ]) {
    const config = project(text)
    const parts = reviewSourceParts(reviewSource(config)).filter(item => item.field === 'answer:acceptance')
    assert.equal(parts.length, 1, text)
    const classified = classify(config, 'answer:acceptance', 0, 'requirement')
    const result = current(classified)
    assert.equal(part(result).text, text)
    assert.equal(part(result).status, 'applied')
    assert.ok(result.requirements.some(item => item.clause === text && item.userConfirmed))
    assert.ok(!result.requirements.some(item => item.clause === 'records must not appear.' || item.clause === 'Records must not appear'))
    assert.deepEqual(ids(result), ['minimum-change', 'specification-first'])
    assert.equal(classified.workflow.answers.acceptance, text)
    const pack = compile(classified)
    assert.ok(file(pack, 'templates/REQUIREMENTS.md').includes(text))
    const reopened = parseImport(file(pack, 'project.json'))
    assert.equal(reopened.workflow.intentReview.parts[0].text, text)
    assert.deepEqual(ids(current(reopened)), ids(result))
    const mistakenContext = current(classify(config, 'answer:acceptance', 0, 'context'))
    assert.equal(part(mistakenContext).status, 'needs-review')
    assert.equal(mistakenContext.localRetrievalBlocked, true)
  }
})

test('an active legacy context or requirement cannot be displayed as an applied task part', () => {
  for (const kind of ['context', 'requirement']) {
    let config = project('Unverified amounts must not appear in totals.')
    config = updateIntentReview(config, { type: 'statement', clause: 'Unverified amounts must not appear in totals', kind })
    const before = structuredClone(config.workflow.intentReview.statements)
    config = classify(config, 'answer:acceptance', 0, 'task')
    const result = current(config)
    assert.equal(part(result).status, 'needs-review', kind)
    assert.doesNotMatch(part(result).note, /Used as task wording/)
    assert.ok(result.clarification.resolvedStatements.some(item => item.kind === kind))
    assert.deepEqual(config.workflow.intentReview.statements, before)
  }
})

test('a conflicting product part does not silently supersede a confirmed legacy background statement', () => {
  for (const role of ['requirement', 'restriction']) {
    let config = project('Unverified amounts must not appear in totals.')
    config = updateIntentReview(config, { type: 'statement', clause: 'Unverified amounts must not appear in totals', kind: 'context' })
    const before = structuredClone(config.workflow.intentReview.statements)
    config = classify(config, 'answer:acceptance', 0, role, role === 'restriction' ? 'product' : null)
    const result = current(config)
    assert.equal(part(result).status, 'needs-review', role)
    assert.ok(result.unknownInformation.some(item => item.kind === 'user-context'))
    assert.ok(!result.requirements.some(item => item.field === 'answer:acceptance'))
    assert.deepEqual(config.workflow.intentReview.statements, before)
    assert.deepEqual(current(parseImport(serializeProject(config))).clarification.parts, result.clarification.parts)
  }
})

test('a recorded inference restriction survives an identical authored answer becoming inherited', () => {
  let config = project()
  config.workflow.answers['user-need'] = config.project.purpose
  config = classify(config, 'answer:user-need', 0, 'restriction', 'inference')
  const recorded = structuredClone(config.workflow.intentReview)
  const expectedDrafts = Object.fromEntries(['minimum-change', 'specification-first', 'evidence-wiki'].map(id => [id, preparePracticeAssessment(config, id)]))
  const before = current(config)
  assert.equal(before.assessmentBlocked, true)
  assert.equal(part(before, 'answer:user-need').scope, 'inference')
  for (const inheritedValue of ['', '  ', undefined]) {
    const inherited = structuredClone(config)
    if (inheritedValue === undefined) delete inherited.workflow.answers['user-need']
    else inherited.workflow.answers['user-need'] = inheritedValue
    for (const reopened of [inherited, parseImport(serializeProject(inherited))]) {
      const result = current(reopened)
      assert.equal(result.clarification.stale, false, 'Effective source text is unchanged')
      assert.equal(result.assessmentBlocked, true)
      assert.equal(result.assessmentCandidate, null)
      assert.equal(part(result, 'answer:user-need')?.scope, 'inference')
      assert.equal(part(result, 'answer:user-need')?.status, 'needs-review')
      assert.deepEqual(reopened.workflow.intentReview, recorded)
      for (const [id, expected] of Object.entries(expectedDrafts)) assert.deepEqual(preparePracticeAssessment(reopened, id), expected)
    }
    inherited.project.purpose += ' Keep the current fallback.'
    assert.equal(current(inherited).clarification.stale, true)
    assert.deepEqual(inherited.workflow.intentReview, recorded)
  }
})

test('recorded task, requirement and context parts remain visible when identical answers inherit', () => {
  for (const [text, role] of [
    ['Build the account dashboard.', 'task'],
    ['Edits must not be stored until approved.', 'requirement'],
    ['Last year the app did not show dates.', 'context'],
  ]) {
    let config = project('', text)
    config.workflow.answers['user-need'] = text
    config = classify(config, 'answer:user-need', 0, role)
    const before = part(current(config), 'answer:user-need')
    delete config.workflow.answers['user-need']
    const after = current(config)
    assert.equal(after.clarification.stale, false)
    assert.deepEqual(part(after, 'answer:user-need'), before, role)
    assert.equal(part(after, 'answer:user-need')?.role, role)
  }
})

test('detached conditions cannot be dismissed as background after a product requirement', () => {
  for (const condition of ['Unless permission is granted.', 'Until the reviewer approves it.', 'Provided that permission is granted.', 'Only if permission is granted.']) {
    let config = project(`Records must not appear. ${condition}`)
    config = classify(config, 'answer:acceptance', 0, 'requirement')
    config = classify(config, 'answer:acceptance', 1, 'context')
    const result = current(config)
    assert.equal(part(result, 'answer:acceptance', 1).status, 'needs-review', condition)
    assert.equal(result.localRetrievalBlocked, true, condition)
    assert.equal(result.assessmentCandidate, null, condition)
  }
})
