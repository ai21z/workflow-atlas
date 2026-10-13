import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createBriefSuggestions, briefSuggestionInput } from '../factory/brief-suggestions.mjs'
import { createRecipe, CATALOG } from '../factory/core.mjs'
import { getPracticeAction } from '../factory/practice-actions.mjs'
import { buildAssistancePayload } from '../factory/jev-assistance.mjs'
import { SUPPORTED_PRACTICES } from '../factory/jev-contract.mjs'
import { loadProjection } from '../tools/atlas-query.mjs'
import { sourceLine } from '../factory/knowledge-query.mjs'

const data = await loadProjection()
const model = createBriefSuggestions(data)
const fixture = JSON.parse(await readFile(new URL('../docs/jev/retrieval-cases.json', import.meta.url), 'utf8'))

function prepare(project) {
  if (!project) return null
  const config = createRecipe(project.recipe)
  if (project.stages) config.workflow.enabledStages = [...project.stages]
  config.workflow.answers = { ...project.answers }
  config.project.host = project.host || ''
  config.components = [{ id: 'fictional', technologies: (project.technologies || []).map(id => ({ id, version: '' })) }]
  config.practices.push(...(project.practices || []))
  return config
}

test('suggestions are existing eligible actions, separate from reading and source review', () => {
  const config = prepare({ recipe: 'feature-delivery', technologies: ['nodejs', 'github-actions'] })
  const before = structuredClone(config)
  const result = model.propose({ brief: 'Add a status filter and make the smallest necessary change. Run pipeline tests before release.', config })
  assert.ok(result.suggestions.length > 0 && result.suggestions.length <= 3)
  for (const suggestion of result.suggestions) {
    assert.ok(CATALOG.practices.some(item => item.id === suggestion.practiceId))
    assert.equal(getPracticeAction(suggestion.topicId, config).id, suggestion.id)
    assert.equal(suggestion.confirmation, 'not checked')
    const node = data.nodes.find(node => node.id === suggestion.topicId)
    assert.equal(suggestion.sourceLine, sourceLine({ ...node.catalog, sourceRefs: node.refs }))
  }
  assert.ok(result.reading.some(item => item.topicId === 'github-actions'))
  assert.ok(!result.suggestions.some(item => ['github-actions', 'ci-skill'].includes(item.topicId)))
  assert.deepEqual(config, before, 'retrieval does not silently select practices or edit project decisions')
})

test('JEV candidate is the highest ranked eligible supported practice, not the first article', () => {
  const result = model.propose({ brief: 'GitHub Actions pipeline checks. Build the smallest necessary change.', config: prepare({ recipe: 'feature-delivery', technologies: ['github-actions'] }) })
  assert.deepEqual(result.assessmentCandidate, result.suggestions.find(item => SUPPORTED_PRACTICES.includes(item.practiceId)) || null)
  assert.ok(result.assessmentCandidate)
  assert.notEqual(result.assessmentCandidate.topicId, 'github-actions')
})

test('already selected and ineligible practices are absent from surfaced suggestions', () => {
  const config = prepare({ recipe: 'bugfix', practices: ['minimum-change', 'evidence-wiki'] })
  const result = model.propose({ brief: 'Make the smallest necessary change. Keep a source backed project wiki and requirements before implementation.', config })
  assert.ok(!result.suggestions.some(item => ['minimum-change', 'evidence-wiki', 'specification-first'].includes(item.practiceId)))
})

test('no chosen project yields reading only and does not manufacture a recipe', () => {
  for (const brief of ['', 'Plan a holiday and book a hotel', 'Build a feature with requirements and acceptance scenarios']) {
    const result = model.propose({ brief })
    assert.deepEqual(result.suggestions, [])
    assert.equal(result.assessmentCandidate, null)
    assert.equal(result.input.recipe, null)
    assert.equal(result.needsProject, true)
    assert.equal(result.note, 'Create a draft to review practices for it.')
  }
})

test('unrelated prose with an existing workflow does not force graph only actions', () => {
  const config = prepare({ recipe: 'feature-delivery' })
  for (const brief of ['Plan a flight and hotel for a holiday.', 'Write a poem about blue skies.']) {
    const result = model.propose({ brief, config })
    assert.deepEqual(result.suggestions, [])
    assert.equal(result.assessmentCandidate, null)
    assert.equal(result.noClearMatch, true)
    assert.deepEqual(result.reading, [], 'generic recipe links and incidental body words are not useful reading for an unrelated task')
  }
  const factsOnly = model.propose({ config })
  assert.ok(factsOnly.suggestions.length, 'explicit recipe facts still work without prose')
  assert.ok(!factsOnly.suggestions.some(item => ['validated-retrieval', 'agents-md', 'evidence-wiki'].includes(item.practiceId)), 'a recipe alone does not supply these practice needs')
})

test('No MCP preserves independent suggestions, API reading and the project itself', () => {
  const config = prepare({ recipe: 'feature-delivery', technologies: ['java', 'spring-boot', 'postgresql'] })
  const before = structuredClone(config)
  const brief = 'Fetch topics by subject from an approved API, validate the selection and save only after human approval.'
  const base = model.propose({ brief, config })
  const bounded = model.propose({ brief: `${brief} No MCP.`, config })
  assert.deepEqual(bounded.suggestions.map(item => item.practiceId), base.suggestions.map(item => item.practiceId))
  assert.ok(bounded.suggestions.length > 0)
  assert.equal(bounded.reading[0].topicId, 'api-stored-data')
  assert.equal(bounded.unresolvedNegation, false)
  assert.equal(bounded.boundaries[0].clause, 'No MCP')
  assert.deepEqual(config, before)
})

test('unresolved consequential prohibitions pause practices and optional JEV checks but preserve useful reading', () => {
  const config = prepare({ recipe: 'feature-delivery' })
  for (const clause of ['No external calls.', 'Do not save anything.', 'Never send personal data.']) {
    const brief = `Fetch matching topics from the approved API. Make the smallest necessary change. ${clause}`
    const result = model.propose({ brief, config })
    assert.equal(result.unresolvedNegation, true)
    assert.ok(result.unresolved.length > 0)
    assert.deepEqual(result.suggestions, [])
    assert.equal(result.assessmentCandidate, null)
    assert.ok(result.reading.length > 0)
    assert.equal(result.input.brief, brief)
  }
})

test('explicit stage removals constrain both practice eligibility and reading reasons', () => {
  const config = prepare({ recipe: 'feature-delivery', stages: [] })
  const result = model.propose({ brief: 'Fetch topics from an approved API and make the smallest necessary change.', config })
  assert.deepEqual(result.input.stages, [])
  assert.ok(!result.suggestions.some(item => ['minimum-change', 'specification-first'].includes(item.practiceId)))
  for (const reading of result.reading) assert.ok(reading.reasons.every(reason => !reason.includes(' stage ')))
})

test('conditional acceptance preserves independent ideas and exact user wording without changing the inference contract', () => {
  const brief = 'Fetch topics from an approved API. Define requirements and acceptance scenarios before implementation. Make the smallest necessary change. No MCP.'
  const config = prepare({ recipe: 'feature-delivery' })
  config.project.purpose = brief
  const base = model.propose({ brief, config })
  const acceptance = 'Only permitted topics appear. Approved selections are saved once. Rejected selections are not saved.'
  config.workflow.answers.acceptance = acceptance
  const before = structuredClone(config)
  const result = model.propose({ brief, config })
  assert.ok(result.suggestions.length > 0)
  assert.deepEqual(result.suggestions.map(item => item.practiceId), base.suggestions.map(item => item.practiceId))
  assert.equal(result.unresolvedNegation, false)
  assert.equal(result.requirements[0].clause, 'Rejected selections are not saved')
  assert.ok(result.assessmentCandidate)
  assert.equal(result.input.answers.acceptance, acceptance)
  assert.deepEqual(config, before)
  const payload = buildAssistancePayload({ userBrief: brief, suppliedProjectAnswers: result.input.answers, practiceId: result.assessmentCandidate.practiceId, manualRecipe: config.workflow.recipe }, 'conditional-assessment', config.workflow.recipe)
  assert.deepEqual(Object.keys(payload).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
  assert.equal(payload.suppliedProjectAnswers.acceptance, acceptance)
  assert.ok(!JSON.stringify(payload).includes('conditional-outcome'))
  assert.ok(!JSON.stringify(payload).includes(result.requirements[0].note))
})

test('editing conditional acceptance to a universal prohibition pauses ideas and restoring it recovers them', () => {
  const config = prepare({ recipe: 'feature-delivery', answers: { acceptance: 'Rejected selections are not saved.' } })
  const brief = 'Fetch topics from the approved API. Make the smallest necessary change.'
  const first = model.propose({ brief, config })
  assert.ok(first.suggestions.length > 0)
  config.workflow.answers.acceptance = 'Selections are not saved.'
  const paused = model.propose({ brief, config })
  assert.equal(paused.unresolvedNegation, true)
  assert.deepEqual(paused.requirements, [])
  assert.deepEqual(paused.suggestions, [])
  assert.equal(paused.assessmentCandidate, null)
  config.workflow.answers.acceptance = 'Rejected selections are not saved.'
  const restored = model.propose({ brief, config })
  assert.equal(restored.unresolvedNegation, false)
  assert.deepEqual(restored.suggestions.map(item => item.practiceId), first.suggestions.map(item => item.practiceId))
  config.workflow.enabledStages = []
  const withoutStages = model.propose({ brief, config })
  assert.ok(!withoutStages.suggestions.some(item => ['minimum-change', 'specification-first'].includes(item.practiceId)))
  assert.ok(withoutStages.reading.flatMap(item => item.reasons).every(reason => !reason.includes(' stage ')))
})

test('a positive requirement expressed as not optional keeps the wiki practice available', () => {
  const result = model.propose({ brief: 'Keep source evidence in a project wiki. The sources are not optional.', config: prepare({ recipe: 'feasibility' }) })
  assert.equal(result.unresolvedNegation, false)
  assert.ok(result.suggestions.some(item => item.practiceId === 'evidence-wiki'))
})

test('ordinary feature acceptance does not imply retrieval or repository instruction work', () => {
  const config = prepare({ recipe: 'feature-delivery', practices: ['minimum-change'] })
  const result = model.propose({ brief: 'Add a status filter to the request list. Define acceptance examples before implementation and make the pipeline tests pass before release. Do not create or maintain a project wiki.', config })
  assert.ok(result.suggestions.some(item => item.practiceId === 'specification-first'))
  assert.ok(!result.suggestions.some(item => ['validated-retrieval', 'agents-md', 'evidence-wiki'].includes(item.practiceId)))
  assert.ok(result.suggestions.length < 3, 'the list is not padded with weak matches')
  const scopeOnly = model.propose({ brief: 'Build a feature with scope checks and acceptance examples.', config })
  assert.ok(!scopeOnly.suggestions.some(item => item.practiceId === 'validated-retrieval'), 'two broad alias tokens are not a retrieval need')
})

test('retrieval uses recorded technologies and current recipe answers only', () => {
  const config = prepare({ recipe: 'bugfix', technologies: ['go', 'go'] })
  config.project.purpose = 'Repair the existing status filter.'
  config.workflow.answers = { expected: 'Open hides Closed requests.', observed: 'Both remain visible.', acceptance: 'INACTIVE RECIPE ANSWER', 'technology-generic-0': 'PROFILE ANSWER' }
  config.evidence = [{ notes: 'SOURCE PASSAGE' }]
  const input = briefSuggestionInput({ config })
  assert.deepEqual(input.technologies, ['go'])
  assert.deepEqual(input.answers, { expected: 'Open hides Closed requests.', observed: 'Both remain visible.' })
  assert.ok(!JSON.stringify(input).includes('INACTIVE RECIPE ANSWER'))
  assert.ok(!JSON.stringify(input).includes('PROFILE ANSWER'))
  assert.ok(!JSON.stringify(input).includes('SOURCE PASSAGE'))
  const feature = prepare({ recipe: 'feature-delivery' })
  feature.project.purpose = 'Build the support filter.'
  assert.equal(briefSuggestionInput({ config: feature }).answers['user-need'], feature.project.purpose)
})

test('explicit exclusions also apply when supplied in a recipe answer', () => {
  const config = prepare({ recipe: 'feature-delivery', answers: { affected: 'The request screen only. Do not create or maintain a project wiki.' } })
  const result = model.propose({ brief: 'Make the smallest necessary change and prepare requirements.', config })
  assert.ok(!result.suggestions.some(item => item.practiceId === 'evidence-wiki'))
  assert.ok(result.exclusions.length > 0)
  assert.ok(result.excluded.some(item => item.practiceRefs?.includes('practice:evidence-wiki')))
})

test('snapshots change with facts, source metadata, eligibility and selections', () => {
  const config = prepare({ recipe: 'feature-delivery' })
  const first = model.propose({ brief: 'Smallest necessary change', config }).fingerprint
  assert.equal(model.propose({ brief: 'Smallest necessary change', config }).fingerprint, first)
  const changed = structuredClone(config)
  changed.workflow.answers.acceptance = 'Open hides Closed requests.'
  assert.notEqual(model.propose({ brief: 'Smallest necessary change', config: changed }).fingerprint, first)
  const selected = structuredClone(config)
  selected.practices.push('minimum-change')
  assert.notEqual(model.propose({ brief: 'Smallest necessary change', config: selected }).fingerprint, first)
  const projection = structuredClone(data)
  projection.nodes.find(node => node.id === 'implementation-workflow').catalog.sourceStatus = 'needs-review'
  assert.notEqual(createBriefSuggestions(projection).propose({ brief: 'Smallest necessary change', config }).fingerprint, first)
})

test('catalogue proposals cannot add fields to the frozen inference request path', () => {
  const config = prepare({ recipe: 'feature-delivery', answers: { acceptance: 'Open hides Closed requests.' } })
  const result = model.propose({ brief: 'Make the smallest necessary change.', config })
  const draft = { userBrief: 'Make the smallest necessary change.', purpose: 'Make the smallest necessary change.', suppliedProjectAnswers: config.workflow.answers, manualRecipe: 'feature-delivery', practiceId: result.assessmentCandidate.practiceId, catalogue: result, suggestions: result.suggestions }
  const payload = buildAssistancePayload(draft, 'request-1')
  assert.deepEqual(Object.keys(payload).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
  assert.equal(payload.userBrief, draft.userBrief)
  assert.deepEqual(payload.suppliedProjectAnswers, config.workflow.answers)
  assert.ok(!JSON.stringify(payload).includes('sourceLine'))
  assert.ok(!JSON.stringify(payload).includes('catalogue'))
})

test('fifteen authored cases report final surfaced top three and excluded suggestions', t => {
  assert.equal(fixture.cases.length, 15)
  const prepared = fixture.cases.map(item => ({ ...item, config: prepare(item.project) }))
  const measured = model.evaluate(prepared)
  t.diagnostic(`Expected practice hit at 3: ${measured.expectedHitAt3.hits}/${measured.expectedHitAt3.total}. Excluded practice suggested: ${measured.excludedSuggestion.hits}/${measured.excludedSuggestion.total}. Authored fictional cases, not general accuracy or JEV results.`)
  for (const item of measured.results) {
    assert.deepEqual(item.excludedSuggested, [], `${item.id} must respect exclusions and eligibility`)
    if (!item.expected.length) assert.deepEqual(item.suggested, [], `${item.id} should abstain`)
  }
  assert.equal(measured.expectedHitAt3.total, 13)
  assert.equal(measured.excludedSuggestion.total, 15)
  assert.equal(measured.excludedSuggestion.hits, 0)
  // Report misses honestly. This acceptance set does not supply a calibrated hit target.
  assert.ok(measured.expectedHitAt3.hits > 0)
})

test('maintained knowledge retrieval uses its own need and does not unlock unrelated change practices', () => {
  const config = prepare({ recipe: 'feature-delivery' })
  for (const brief of [
    'Keep a source backed project wiki.',
    'Create a maintained project knowledge index linked to original sources and record future corrections.',
  ]) {
    const result = model.propose({ brief, config })
    assert.ok(result.suggestions.some(item => item.practiceId === 'evidence-wiki'), brief)
    assert.ok(!result.suggestions.some(item => ['minimum-change', 'specification-first'].includes(item.practiceId)), brief)
  }
})

test('concrete software work and a maintained evidence record can surface all three supported practices', () => {
  const config = prepare({ recipe: 'feature-delivery' })
  const brief = 'Build an offline inspection checklist in our tablet app. Keep the original safety standard passages linked to checklist rules in a maintained project wiki, including future corrections.'
  config.workflow.answers = { 'user-need': 'Inspectors must complete checks without a network connection.', acceptance: 'Entries remain available after the app restarts.', affected: 'Checklist screen and local storage.' }
  const result = model.propose({ brief, config })
  assert.equal(result.unresolvedNegation, false)
  assert.deepEqual(result.suggestions.map(item => item.practiceId).sort(), [...SUPPORTED_PRACTICES].sort())
  config.workflow.enabledStages = ['requirements']
  assert.deepEqual(model.propose({ brief, config }).suggestions.map(item => item.practiceId), ['evidence-wiki'])
  config.workflow.enabledStages = []
  assert.deepEqual(model.propose({ brief, config }).suggestions.map(item => item.practiceId), ['evidence-wiki'])
})

test('named omissions suppress only their named practices and persist in original inference wording', () => {
  const config = prepare({ recipe: 'feature-delivery' })
  const brief = 'Build the selected barcode scanning flow. Exclude Requirements before implementation and Smallest necessary change from this pack. Keep the original scanner contract passages and future corrections in a maintained project wiki.'
  const result = model.propose({ brief, config })
  assert.equal(result.unresolvedNegation, false)
  assert.deepEqual(result.suggestions.map(item => item.practiceId), ['evidence-wiki'])
  const request = buildAssistancePayload({ userBrief: brief, suppliedProjectAnswers: result.input.answers, practiceId: 'evidence-wiki' }, 'omission-check', config.workflow.recipe)
  assert.equal(request.userBrief, brief)
  assert.deepEqual(Object.keys(request).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
})

test('a concrete feature with missing acceptance still has local change and specification evidence', () => {
  const config = prepare({ recipe: 'feature-delivery', answers: { acceptance: 'Not agreed yet.' } })
  const brief = 'Add a refund-status filter to the merchant dashboard. We have not agreed on the acceptance examples yet.'
  const result = model.propose({ brief, config })
  assert.equal(result.unresolvedNegation, false)
  assert.deepEqual(result.suggestions.map(item => item.practiceId).sort(), ['minimum-change', 'specification-first'])
  assert.equal(result.input.answers.acceptance, 'Not agreed yet.')
  assert.ok(result.suggestions.every(item => item.confirmation === 'not checked'))
})

test('physical tasks, passive reading and abandoned plans cannot borrow selected software stages', () => {
  const config = prepare({ recipe: 'feature-delivery' })
  for (const brief of ['Plan a catering service for the conference.', 'Replace the paper forms at reception.', 'Repair the screen door in the office.', 'Read the smallest necessary change guide and translate it into French.', 'Summarize the source backed project wiki.']) {
    const result = model.propose({ brief, config })
    assert.deepEqual(result.suggestions, [], brief)
  }
  const historical = model.propose({ brief: 'We rejected a plan to change the software last year. Maintain the decision log linked to source evidence.', config })
  assert.deepEqual(historical.suggestions.map(item => item.practiceId), ['evidence-wiki'])
})

test('isolated adjectives, deferred software and common reading wrappers do not request change practices', () => {
  const config = prepare({ recipe: 'feature-delivery' })
  for (const brief of ['The necessary report is attached.', 'The smallest conference room is available.', 'I only want to read the smallest necessary change guide.', 'Our goal is to summarize the source backed project wiki.', 'We decided against a plan to build the software.']) assert.deepEqual(model.propose({ brief, config }).suggestions, [], brief)
  const deferred = model.propose({ brief: 'We may build a mobile app later. Keep a maintained source-backed project index now.', config })
  assert.deepEqual(deferred.suggestions.map(item => item.practiceId), ['evidence-wiki'])
  const actual = model.propose({ brief: 'Read existing code and implement the requested account screen.', config })
  assert.deepEqual(actual.suggestions.map(item => item.practiceId).sort(), ['minimum-change', 'specification-first'])
})

test('ordinary interface and implementation requests retain candidate-local software evidence', () => {
  const config = prepare({ recipe: 'feature-delivery' })
  for (const brief of ['Add an unread message badge to the help desk sidebar.', 'Fix the invoice import failure.', 'Add a print preview to the certificate screen.', 'Plan delivery of the approved PDF rendering library upgrade.', 'Fix the command line uploader showing completion too early.', 'Add a warning before changing the retention period in the records application.', 'Fix the desktop package installer accepting corrupt archives.', 'Add bulk reassignment to the support queue.', 'Build a rotation control in the preview screen.']) {
    const result = model.propose({ brief, config })
    assert.deepEqual(result.suggestions.map(item => item.practiceId).sort(), ['minimum-change', 'specification-first'], brief)
  }
})

// These development cases exercise local user decisions. Fresh pilot cases stay
// excluded and unopened until the implementation is frozen.
test('confirmed task kinds recover unfamiliar wording without treating stages as intent', async () => {
  const { updateIntentReview } = await import('../factory/intent-review.mjs')
  let config = prepare({ recipe: 'feature-delivery' })
  config.project.purpose = 'Create the permit renewal journey.'
  const original = structuredClone(config)
  assert.equal(model.propose({ config }).clarification.taskNeeded, true)
  assert.deepEqual(model.propose({ config }).suggestions, [])
  config = updateIntentReview(config, { type: 'task', value: 'software-change' })
  const confirmed = model.propose({ config })
  assert.deepEqual(confirmed.suggestions.map(item => item.practiceId), ['minimum-change', 'specification-first'])
  assert.deepEqual(config.practices, original.practices)
  config.workflow.enabledStages = []
  assert.deepEqual(model.propose({ config }).suggestions, [])
  config.workflow.enabledStages = original.workflow.enabledStages
  config.project.purpose += ' Include a separate paper checklist.'
  const changed = model.propose({ config })
  assert.equal(changed.clarification.stale, true)
  assert.equal(changed.clarification.taskNeeded, true)
  assert.deepEqual(changed.suggestions, [])
  assert.deepEqual(model.propose({ brief: 'Read about permit forms.', config }).suggestions, [])
})

test('confirmed requirements and context resolve only exact clauses and keep provider text unchanged', async () => {
  const { updateIntentReview } = await import('../factory/intent-review.mjs')
  const { preparePracticeAssessment } = await import('../factory/brief-suggestions-view.mjs')
  let config = prepare({ recipe: 'feature-delivery' })
  config.project.purpose = 'Build the account dashboard. Unverified amounts must not appear in totals.'
  const before = preparePracticeAssessment(config, 'minimum-change')
  const pending = model.propose({ config })
  assert.equal(pending.clarification.statement.clarifiable, true)
  assert.deepEqual(pending.suggestions, [])
  config = updateIntentReview(config, { type: 'statement', clause: pending.clarification.statement.clause, kind: 'requirement' })
  const after = model.propose({ config })
  assert.equal(after.unresolvedNegation, false)
  assert.deepEqual(after.suggestions.map(item => item.practiceId).sort(), ['minimum-change', 'specification-first'])
  assert.ok(after.requirements.some(item => item.userConfirmed && item.clause === pending.clarification.statement.clause))
  assert.deepEqual(preparePracticeAssessment(config, 'minimum-change'), before)
  config = updateIntentReview(config, { type: 'statement', clause: pending.clarification.statement.clause, kind: 'context' })
  assert.ok(model.propose({ config }).unknownInformation.some(item => item.userConfirmed))
  assert.deepEqual(preparePracticeAssessment(config, 'minimum-change'), before)
})

test('confirmed exclusions override task support and cannot bypass separate hard restrictions', async () => {
  const { updateIntentReview } = await import('../factory/intent-review.mjs')
  let config = prepare({ recipe: 'feature-delivery' })
  config.project.purpose = 'Create the permit renewal journey. Do not add that extra procedure.'
  const clause = model.propose({ config }).clarification.statement.clause
  config = updateIntentReview(config, { type: 'statement', clause, kind: 'exclusion', practiceIds: ['minimum-change'] })
  config = updateIntentReview(config, { type: 'task', value: 'software-change' })
  assert.deepEqual(model.propose({ config }).suggestions.map(item => item.practiceId), ['specification-first'])
  for (const value of ['other', 'unsure', 'knowledge-work']) {
    const result = model.propose({ config: updateIntentReview(config, { type: 'task', value }) })
    assert.ok(!result.suggestions.some(item => ['minimum-change', 'specification-first'].includes(item.practiceId)))
  }
  config.project.purpose += ' Do not send this brief to TypeSafe.'
  const blocked = model.propose({ config })
  assert.equal(blocked.unresolvedNegation, true)
  assert.deepEqual(blocked.suggestions, [])
  assert.equal(blocked.assessmentCandidate, null)
  assert.ok(blocked.unresolved.some(item => item.clarifiable === false))
})


test('conditional requirements and history use explicit whole sentence confirmation without changing inference', async () => {
  const { updateIntentReview, reviewSource } = await import('../factory/intent-review.mjs')
  const { preparePracticeAssessment } = await import('../factory/brief-suggestions-view.mjs')
  const { serializeProject, parseImport } = await import('../factory/core.mjs')
  for (const sample of [
    { clause: 'Pencil marks must not disappear when a hint is opened', kind: 'requirement', role: 'conditional-requirement' },
    { clause: 'Technicians must be able to complete the form when the tablet has no signal', kind: 'requirement', role: 'conditional-requirement' },
    { clause: 'Last year the old dashboard did not display any dates', kind: 'context', role: 'historical-context' },
  ]) {
    let config = createRecipe('feature-delivery')
    config.project.purpose = `Fix the existing dashboard. ${sample.clause}.`
    const original = structuredClone(config)
    const pending = model.propose({ config })
    assert.deepEqual(pending.clarification.statement.allowedKinds, [sample.kind])
    assert.equal(pending.clarification.statement.clarificationType, sample.role)
    assert.equal(pending.clarification.statement.clause, sample.clause)
    assert.equal(pending.assessmentCandidate, null)
    config.workflow.intentReview = { version: 1, source: reviewSource(config), taskKind: null, statements: [{ clause: sample.clause, kind: sample.kind, practiceIds: [] }] }
    assert.equal(model.propose({ config }).assessmentCandidate, null, 'Old unsupported interpretations need reconfirmation')
    const wrong = updateIntentReview(config, { type: 'statement', clause: sample.clause, kind: sample.kind === 'context' ? 'requirement' : 'context' })
    assert.equal(model.propose({ config: wrong }).assessmentCandidate, null)
    config = updateIntentReview(config, { type: 'statement', clause: sample.clause, kind: sample.kind })
    const result = model.propose({ config })
    assert.deepEqual(result.suggestions.map(item => item.practiceId).sort(), ['minimum-change', 'specification-first'])
    assert.equal(result.clarification.statement, null)
    assert.equal(result.clarification.resolvedStatements.length, 1)
    assert.deepEqual(preparePracticeAssessment(config, 'minimum-change'), preparePracticeAssessment(original, 'minimum-change'))
    assert.deepEqual(model.propose({ config: parseImport(serializeProject(config)) }).suggestions, result.suggestions)
    config.workflow.enabledStages = []
    assert.deepEqual(model.propose({ config }).suggestions, [])
  }
})

test('confirmed knowledge-only scope cannot be overridden by a software task choice', async () => {
  const { updateIntentReview } = await import('../factory/intent-review.mjs')
  let config = createRecipe('feature-delivery')
  const clause = 'This task only organizes existing information, without inspecting software or planning application changes'
  config.project.purpose = `Maintain a source backed knowledge wiki for the workshop. ${clause}.`
  let result = model.propose({ config })
  assert.equal(result.clarification.statement.clause, clause)
  assert.deepEqual(result.clarification.statement.allowedKinds, ['context'])
  config = updateIntentReview(config, { type: 'statement', clause, kind: 'context' })
  config = updateIntentReview(config, { type: 'task', value: 'software-change' })
  result = model.propose({ config })
  assert.equal(result.clarification.taskConflict, true)
  assert.equal(result.clarification.taskNeeded, true)
  assert.deepEqual(result.clarification.excludedTaskKinds, ['software-change'])
  assert.deepEqual(result.suggestions, [])
  assert.equal(result.assessmentCandidate, null)
  assert.equal(config.workflow.intentReview.taskKind, 'software-change', 'The stored user choice is not silently rewritten')
  config = updateIntentReview(config, { type: 'task', value: 'knowledge-work' })
  result = model.propose({ config })
  assert.equal(result.clarification.taskConflict, false)
  assert.deepEqual(result.suggestions.map(item => item.practiceId), ['evidence-wiki'])
})


test('recipe-free projects do not ask for a task record that they cannot retain', () => {
  const config = createRecipe('feature-delivery')
  config.workflow.recipe = null
  config.project.purpose = 'Organize the exhibit handover.'
  assert.equal(model.propose({ config }).clarification.taskNeeded, false)
})
