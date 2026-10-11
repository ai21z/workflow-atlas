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
  }
  const factsOnly = model.propose({ config })
  assert.ok(factsOnly.suggestions.length, 'explicit recipe facts still work without prose')
  assert.ok(!factsOnly.suggestions.some(item => ['validated-retrieval', 'agents-md', 'evidence-wiki'].includes(item.practiceId)), 'a recipe alone does not supply these practice needs')
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
