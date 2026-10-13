import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecipe, selectRecipe, serializeProject, parseImport, compile, compileStandaloneSkill, validate } from '../factory/core.mjs'
import { INTENT_REVIEW_VERSION, INTENT_STATEMENT_POLICY_VERSION, INTENT_KNOWLEDGE_NEEDS, reviewSource, reviewSourceClauses, matchesReviewClause, getIntentReview, updateIntentReview, intentReviewIssues } from '../factory/intent-review.mjs'
import { makeRequest } from '../factory/jev-contract.mjs'
import { buildAssistancePayload } from '../factory/jev-assistance.mjs'
import { parseSuggestionInput } from '../tools/serve.mjs'

const file = (pack, path) => pack.files.find(item => item.path === path)?.content
const project = () => {
  const config = createRecipe('feature-delivery')
  config.project.purpose = 'Let staff rename the batch. Rejected names must never be saved, but valid names can be confirmed.'
  config.workflow.answers.acceptance = 'The confirmed names are shown together.'
  return config
}
const clarified = () => {
  let config = updateIntentReview(project(), { type: 'task', value: 'software-change' })
  config = updateIntentReview(config, { type: 'statement', clause: 'Rejected names must never be saved', kind: 'requirement' })
  return config
}
const legacyClarified = (version = 1) => {
  const config = clarified()
  config.workflow.intentReview.version = version
  if (version < 3) delete config.workflow.intentReview.knowledgeNeed
  if (version < 4) delete config.workflow.intentReview.parts
  config.workflow.intentReview.statements = config.workflow.intentReview.statements.map(({ policyVersion, ...statement }) => version === 1 ? statement : { ...statement, policyVersion: version === 2 ? 2 : 3 })
  return config
}

test('intent review source uses exact current recipe answers including inheritance, never selected stages', () => {
  const config = project()
  config.workflow.answers['current-work'] = 'An answer belonging to another recipe'
  config.workflow.answers['technology-generic-0'] = 'A technology answer'
  const source = reviewSource(config)
  assert.deepEqual(source, { brief: config.project.purpose, recipe: 'feature-delivery', answers: { 'user-need': config.project.purpose, acceptance: config.workflow.answers.acceptance, affected: '' } })
  config.workflow.enabledStages = []
  config.project.host = 'jetbrains'
  assert.deepEqual(reviewSource(config), source)
  config.workflow.answers['user-need'] = '  More specific wording.  '
  assert.equal(reviewSource(config).answers['user-need'], '  More specific wording.  ')
})

test('old projects keep their shape and null contexts are safe', () => {
  const config = project()
  const serialized = serializeProject(config)
  assert.deepEqual(getIntentReview(null), { active: false, stale: false, taskKind: null, knowledgeNeed: null, statements: [], parts: [] })
  assert.equal(serializeProject(parseImport(serialized)), serialized)
  assert.equal(Object.hasOwn(parseImport(serialized).workflow, 'intentReview'), false)
  assert.doesNotMatch(file(compile(config), 'WORKFLOW.md'), /Recorded intent clarifications/)
  assert.doesNotMatch(file(compile(config), 'templates/REQUIREMENTS.md'), /Recorded intent clarifications/)
})

test('confirmed task and statements round trip without selecting practices or changing inference state', () => {
  const before = project()
  const config = clarified()
  assert.equal(before.workflow.intentReview, undefined)
  assert.deepEqual(config.practices, before.practices)
  assert.deepEqual(config.workflow.answers, before.workflow.answers)
  assert.deepEqual(getIntentReview(config), { active: true, stale: false, taskKind: 'software-change', knowledgeNeed: null, statements: [{ clause: 'Rejected names must never be saved', kind: 'requirement', practiceIds: [], policyVersion: 3 }], parts: [] })
  const restored = parseImport(serializeProject(config))
  assert.deepEqual(restored, config)
  assert.deepEqual(makeRequest({ brief: config.project.purpose, projectAnswers: config.workflow.answers, practice: { id: 'minimum-change' } }), makeRequest({ brief: before.project.purpose, projectAnswers: before.workflow.answers, practice: { id: 'minimum-change' } }))
  const read = getIntentReview(config)
  read.statements[0].kind = 'context'
  assert.equal(config.workflow.intentReview.statements[0].kind, 'requirement')
})

test('source equality ignores object key order but retains every wording difference', () => {
  const config = clarified()
  config.workflow.intentReview.source.answers = Object.fromEntries(Object.entries(config.workflow.intentReview.source.answers).reverse())
  assert.equal(getIntentReview(config).active, true)
  const changed = structuredClone(config)
  changed.project.purpose += ' '
  assert.deepEqual(getIntentReview(changed), { active: false, stale: true, taskKind: null, knowledgeNeed: null, statements: [], parts: [] })
  assert.deepEqual(parseImport(serializeProject(changed)), changed)
  assert.equal(validate(changed).issues.some(issue => issue.code === 'stale-intent-review'), true)
})

test('brief, current answer and recipe changes invalidate the record but unrelated settings do not', () => {
  for (const change of [config => { config.project.purpose = 'Different work.' }, config => { config.workflow.answers.acceptance = 'Different acceptance.' }, config => { config.workflow.recipe = 'bugfix' }]) {
    const config = clarified()
    change(config)
    assert.equal(getIntentReview(config).stale, true)
    assert.equal(config.workflow.intentReview.taskKind, 'software-change')
  }
  const config = clarified()
  config.workflow.enabledStages = ['requirements']
  config.workflow.answers['current-work'] = 'Irrelevant old recipe answer'
  config.constraints.notes = 'A separate constraint'
  assert.equal(getIntentReview(config).active, true)
  assert.equal(getIntentReview(selectRecipe(config, 'feasibility')).stale, true)
})

test('new clarification after edits starts a fresh source without silently carrying old decisions forward', () => {
  const config = clarified()
  config.project.purpose = 'Document the latest decisions. No delivery discussion has happened.'
  const next = updateIntentReview(config, { type: 'statement', clause: 'No delivery discussion has happened', kind: 'context' })
  assert.equal(next.workflow.intentReview.taskKind, null)
  assert.deepEqual(next.workflow.intentReview.statements, [{ clause: 'No delivery discussion has happened', kind: 'context', practiceIds: [], policyVersion: 3 }])
  assert.equal(getIntentReview(next).active, true)
  assert.equal(getIntentReview(config).stale, true)
  assert.deepEqual(next.workflow.intentReview.source, reviewSource(next))
})

test('source clause validation accepts whole and comma or contrast clauses without accepting invented or partial words', () => {
  const source = reviewSource(project())
  assert.ok(reviewSourceClauses(source).includes('Rejected names must never be saved, but valid names can be confirmed'))
  for (const clause of ['Let staff rename the batch', 'Rejected names must never be saved', 'valid names can be confirmed', 'The confirmed names are shown together']) assert.equal(matchesReviewClause(source, clause), true, clause)
  for (const clause of ['names must never be saved', 'staff rename the batch', 'Saved records are correct', ' Let staff rename the batch', 'Rejected names must never be saved.']) assert.equal(matchesReviewClause(source, clause), false, clause)
  assert.throws(() => updateIntentReview(project(), { type: 'statement', clause: 'names must never be saved', kind: 'requirement' }), /exact clause/)
})

test('exclusions need current named practices and cannot add instructions or replace requirements', () => {
  const config = project()
  const clause = 'Let staff rename the batch'
  for (const practiceIds of [[], ['made-up-practice'], ['minimum-change', 'minimum-change']]) assert.throws(() => updateIntentReview(config, { type: 'statement', clause, kind: 'exclusion', practiceIds }))
  for (const kind of ['requirement', 'context']) assert.throws(() => updateIntentReview(config, { type: 'statement', clause, kind, practiceIds: ['minimum-change'] }), /Only an exclusion/)
  const next = updateIntentReview(config, { type: 'statement', clause, kind: 'exclusion', practiceIds: ['minimum-change', 'evidence-wiki'] })
  assert.deepEqual(getIntentReview(next).statements[0].practiceIds, ['minimum-change', 'evidence-wiki'])
  assert.deepEqual(next.practices, config.practices)
})

test('statements can be replaced, removed or explicitly cleared without mutating the input', () => {
  const config = clarified()
  const clause = config.workflow.intentReview.statements[0].clause
  const replaced = updateIntentReview(config, { type: 'statement', clause, kind: 'context' })
  assert.equal(replaced.workflow.intentReview.statements.length, 1)
  assert.equal(replaced.workflow.intentReview.statements[0].kind, 'context')
  const removed = updateIntentReview(replaced, { type: 'remove-statement', clause })
  assert.deepEqual(removed.workflow.intentReview.statements, [])
  assert.equal(removed.workflow.intentReview.taskKind, 'software-change')
  assert.equal(Object.hasOwn(updateIntentReview(removed, { type: 'clear' }).workflow, 'intentReview'), false)
  assert.equal(config.workflow.intentReview.statements[0].kind, 'requirement')
})

test('malformed or unsupported imported review records fail visibly instead of being discarded or applied', () => {
  const mutations = [
    record => { record.version = 6 },
    record => { record.unrecognized = true },
    record => { record.taskKind = 'invented' },
    record => { delete record.source.answers.acceptance },
    record => { record.source.answers.foreign = 'Unexpected question' },
    record => { record.statements[0].clause = 'Text absent from source' },
    record => { record.statements[0].kind = 'approved' },
    record => { record.statements[0].practiceIds = ['minimum-change'] },
    record => { delete record.statements[0].policyVersion },
    record => { record.statements[0].policyVersion = 4 },
    record => { record.statements[0].policyVersion = '2' },
    record => { record.statements.push(structuredClone(record.statements[0])) },
    record => { record.statements = null },
  ]
  for (const mutate of mutations) {
    const config = clarified()
    mutate(config.workflow.intentReview)
    const bytes = JSON.stringify(config)
    assert.ok(intentReviewIssues(config.workflow.intentReview).length)
    assert.equal(getIntentReview(config).active, false)
    assert.throws(() => parseImport(bytes), /intentReview/)
    assert.throws(() => serializeProject(config), /intentReview/)
    assert.equal(JSON.stringify(config), bytes)
    assert.throws(() => updateIntentReview(config, { type: 'task', value: 'software-change' }), /Clear it explicitly/)
    assert.equal(Object.hasOwn(updateIntentReview(config, { type: 'clear' }).workflow, 'intentReview'), false)
  }
})

test('version 1 imports and reads preserve legacy bytes and statement shapes', () => {
  const config = legacyClarified()
  const bytes = serializeProject(config)
  const restored = parseImport(bytes)
  assert.equal(serializeProject(restored), bytes)
  assert.equal(restored.workflow.intentReview.version, 1)
  assert.deepEqual(getIntentReview(restored).statements, [{ clause: 'Rejected names must never be saved', kind: 'requirement', practiceIds: [] }])
  assert.equal(Object.hasOwn(restored.workflow.intentReview.statements[0], 'policyVersion'), false)
  const invalid = structuredClone(config)
  invalid.workflow.intentReview.statements[0].policyVersion = 1
  assert.throws(() => parseImport(JSON.stringify(invalid)), /policyVersion/)
})

test('editing a legacy task migrates the container without promoting any statement policy', () => {
  const config = legacyClarified()
  const bytes = serializeProject(config)
  const next = updateIntentReview(config, { type: 'task', value: 'knowledge-work' })
  assert.equal(INTENT_REVIEW_VERSION, 5)
  assert.equal(INTENT_STATEMENT_POLICY_VERSION, 3)
  assert.equal(next.workflow.intentReview.version, 5)
  assert.equal(next.workflow.intentReview.knowledgeNeed, null)
  assert.equal(next.workflow.intentReview.taskKind, 'knowledge-work')
  assert.deepEqual(next.workflow.intentReview.statements, [{ ...config.workflow.intentReview.statements[0], policyVersion: 1 }])
  assert.deepEqual(getIntentReview(parseImport(serializeProject(next))), getIntentReview(next))
  assert.equal(serializeProject(config), bytes)
})

test('explicit reconfirmation promotes only the matching legacy statement', () => {
  const config = legacyClarified()
  config.workflow.intentReview.statements.push({ clause: 'The confirmed names are shown together', kind: 'context', practiceIds: [] })
  const oldBytes = serializeProject(config)
  const next = updateIntentReview(config, { type: 'statement', clause: 'Rejected names must never be saved', kind: 'requirement' })
  assert.deepEqual(next.workflow.intentReview.statements, [
    { clause: 'The confirmed names are shown together', kind: 'context', practiceIds: [], policyVersion: 1 },
    { clause: 'Rejected names must never be saved', kind: 'requirement', practiceIds: [], policyVersion: 3 },
  ])
  assert.deepEqual(parseImport(serializeProject(next)), next)
  assert.equal(serializeProject(config), oldBytes)
  const taskOnly = updateIntentReview(next, { type: 'task', value: 'other' })
  assert.deepEqual(taskOnly.workflow.intentReview.statements, next.workflow.intentReview.statements)
  const removed = updateIntentReview(config, { type: 'remove-statement', clause: 'Rejected names must never be saved' })
  assert.deepEqual(removed.workflow.intentReview.statements, [{ clause: 'The confirmed names are shown together', kind: 'context', practiceIds: [], policyVersion: 1 }])
})

test('editing the source discards prior legacy decisions only when a new clarification is confirmed', () => {
  const config = legacyClarified()
  config.project.purpose = 'Revise the software form. Invalid names must not be submitted.'
  const stale = serializeProject(config)
  const next = updateIntentReview(config, { type: 'task', value: 'software-change' })
  assert.equal(getIntentReview(config).stale, true)
  assert.equal(next.workflow.intentReview.version, 5)
  assert.deepEqual(next.workflow.intentReview.statements, [])
  assert.deepEqual(next.workflow.intentReview.source, reviewSource(config))
  assert.equal(serializeProject(config), stale)
})

test('all record versions export user classifications without promoting their policy or claiming validation', () => {
  for (const config of [legacyClarified(), legacyClarified(2), legacyClarified(3), legacyClarified(4), clarified()]) {
    const before = serializeProject(config)
    const pack = compile(config)
    assert.deepEqual(parseImport(file(pack, 'project.json')), config)
    for (const path of ['WORKFLOW.md', 'templates/REQUIREMENTS.md']) {
      assert.match(file(pack, path), /Product requirement/)
      assert.match(file(pack, path), /do not approve requirements/)
      assert.doesNotMatch(file(pack, path), /policyVersion/)
    }
    assert.equal(serializeProject(config), before)
  }
})

test('workflow and requirements exports quote classifications without treating them as verified outcomes', () => {
  const config = clarified()
  const pack = compile(config)
  for (const path of ['WORKFLOW.md', 'templates/REQUIREMENTS.md']) {
    const text = file(pack, path)
    assert.match(text, /Recorded intent clarifications/)
    assert.match(text, /Task kind: Software change/)
    assert.ok(text.includes(config.project.purpose))
    assert.match(text, /### Product requirement\n\n```text\nRejected names must never be saved\n```/)
    assert.match(text, /do not approve requirements, add practices, configure tools or establish observed results/)
  }
  const reopened = parseImport(file(pack, 'project.json'))
  assert.deepEqual(getIntentReview(reopened), getIntentReview(config))
})

test('stale exports retain quoted historical classifications while explicitly withholding their effect', () => {
  const config = clarified()
  const original = config.project.purpose
  config.project.purpose = 'A different task.'
  for (const path of ['WORKFLOW.md', 'templates/REQUIREMENTS.md']) {
    const text = file(compile(config), path)
    assert.match(text, /Recorded intent clarifications, not applied/)
    assert.match(text, /earlier wording, not applied/)
    assert.ok(text.includes(original))
    assert.match(text, /brief, its answers or the recipe has changed/)
  }
})


test('a standalone skill keeps active and stale clarification without requiring the root pack', () => {
  const config = clarified()
  const reference = file(compileStandaloneSkill(config, 'implementation'), 'implementation/references/project.md')
  assert.match(reference, /Recorded intent clarifications/)
  assert.match(reference, /Software change/)
  assert.match(reference, /Rejected names must never be saved/)
  config.project.purpose += ' Updated scope.'
  const stale = file(compileStandaloneSkill(config, 'implementation'), 'implementation/references/project.md')
  assert.match(stale, /Recorded intent clarifications, not applied/)
})

test('knowledge need is an independent explicit choice and never selects a practice or invents answers', () => {
  assert.deepEqual(INTENT_KNOWLEDGE_NEEDS, ['maintained-reference', 'one-off', 'unsure'])
  for (const value of [null, ...INTENT_KNOWLEDGE_NEEDS]) {
    const before = project()
    const config = updateIntentReview(before, { type: 'knowledge', value })
    assert.equal(config.workflow.intentReview.version, 5)
    assert.deepEqual(getIntentReview(config), { active: value !== null, stale: false, taskKind: null, knowledgeNeed: value, statements: [], parts: [] })
    assert.deepEqual(config.practices, before.practices)
    assert.deepEqual(config.workflow.answers, before.workflow.answers)
    assert.deepEqual(config.project, before.project)
    assert.equal(before.workflow.intentReview, undefined)
    assert.deepEqual(parseImport(serializeProject(config)), config)
  }
  const config = updateIntentReview(clarified(), { type: 'knowledge', value: 'maintained-reference' })
  const cleared = updateIntentReview(config, { type: 'knowledge', value: null })
  assert.equal(getIntentReview(cleared).knowledgeNeed, null)
  assert.equal(getIntentReview(cleared).active, true)
  assert.deepEqual(cleared.workflow.intentReview.statements, config.workflow.intentReview.statements)
})

test('versions 1 and 2 reopen without a knowledge facet or implicit migration', () => {
  for (const version of [1, 2]) {
    const config = legacyClarified(version)
    config.workflow.intentReview.taskKind = 'knowledge-work'
    const bytes = serializeProject(config)
    const restored = parseImport(bytes)
    assert.equal(serializeProject(restored), bytes)
    assert.equal(restored.workflow.intentReview.version, version)
    assert.equal(Object.hasOwn(restored.workflow.intentReview, 'knowledgeNeed'), false)
    assert.equal(getIntentReview(restored).knowledgeNeed, null)
    assert.deepEqual(getIntentReview(restored).statements, config.workflow.intentReview.statements)
  }
})

test('knowledge and task edits migrate old containers without upgrading untouched statement policies', () => {
  for (const version of [1, 2]) {
    const before = legacyClarified(version)
    if (version === 2) before.workflow.intentReview.statements.push({ clause: 'The confirmed names are shown together', kind: 'context', practiceIds: [], policyVersion: 1 })
    const original = serializeProject(before)
    const expectedStatements = before.workflow.intentReview.statements.map(statement => ({ ...statement, policyVersion: statement.policyVersion || 1 }))
    let config = updateIntentReview(before, { type: 'knowledge', value: 'maintained-reference' })
    assert.equal(config.workflow.intentReview.version, 5)
    assert.equal(config.workflow.intentReview.taskKind, before.workflow.intentReview.taskKind)
    assert.deepEqual(config.workflow.intentReview.source, before.workflow.intentReview.source)
    assert.deepEqual(config.workflow.intentReview.statements, expectedStatements)
    config = updateIntentReview(config, { type: 'task', value: 'other' })
    assert.equal(config.workflow.intentReview.knowledgeNeed, 'maintained-reference')
    assert.deepEqual(config.workflow.intentReview.statements, expectedStatements)
    config = updateIntentReview(config, { type: 'statement', clause: expectedStatements[0].clause, kind: 'requirement' })
    assert.equal(config.workflow.intentReview.statements.find(statement => statement.clause === expectedStatements[0].clause).policyVersion, 3)
    for (const statement of expectedStatements.slice(1)) assert.deepEqual(config.workflow.intentReview.statements.find(item => item.clause === statement.clause), statement)
    assert.deepEqual(parseImport(serializeProject(config)), config)
    assert.equal(serializeProject(before), original)
  }
})

test('knowledge field and statement policies are validated against their exact container version', () => {
  for (const value of [undefined, false, 1, [], {}, 'maintain', 'MAINTAINED-REFERENCE']) assert.throws(() => updateIntentReview(project(), { type: 'knowledge', value }), /knowledgeNeed/)
  const missing = clarified()
  delete missing.workflow.intentReview.knowledgeNeed
  assert.throws(() => parseImport(JSON.stringify(missing)), /knowledgeNeed/)
  for (const version of [1, 2]) {
    const invalid = legacyClarified(version)
    invalid.workflow.intentReview.knowledgeNeed = null
    assert.throws(() => parseImport(JSON.stringify(invalid)), /knowledgeNeed/)
  }
  const oldPolicy = legacyClarified(2)
  oldPolicy.workflow.intentReview.statements[0].policyVersion = 3
  assert.throws(() => parseImport(JSON.stringify(oldPolicy)), /policyVersion/)
  for (const policyVersion of [1, 2, 3]) {
    const config = clarified()
    config.workflow.intentReview.statements[0].policyVersion = policyVersion
    assert.deepEqual(parseImport(serializeProject(config)), config)
  }
})

test('knowledge choices become stale on exact source changes and reset only after a new explicit choice', () => {
  const original = updateIntentReview(clarified(), { type: 'knowledge', value: 'maintained-reference' })
  for (const edit of [config => { config.project.purpose += ' ' }, config => { config.workflow.answers.acceptance += ' ' }, config => { Object.assign(config, selectRecipe(config, 'bugfix')) }]) {
    const config = structuredClone(original)
    edit(config)
    assert.deepEqual(getIntentReview(config), { active: false, stale: true, taskKind: null, knowledgeNeed: null, statements: [], parts: [] })
    assert.equal(config.workflow.intentReview.knowledgeNeed, 'maintained-reference')
    assert.deepEqual(parseImport(serializeProject(config)), config)
    const next = updateIntentReview(config, { type: 'knowledge', value: 'one-off' })
    assert.equal(next.workflow.intentReview.version, 5)
    assert.equal(next.workflow.intentReview.taskKind, null)
    assert.deepEqual(next.workflow.intentReview.statements, [])
    assert.deepEqual(next.workflow.intentReview.source, reviewSource(config))
    assert.equal(getIntentReview(next).knowledgeNeed, 'one-off')
  }
  const config = structuredClone(original)
  config.workflow.enabledStages = []
  assert.equal(getIntentReview(config).knowledgeNeed, 'maintained-reference')
  assert.equal(getIntentReview(config).stale, false)
})

test('knowledge exports preserve recorded choices and source wording even after they become stale', () => {
  const labels = { 'maintained-reference': 'Keep a maintained reference', 'one-off': 'One time use', unsure: 'Not sure yet' }
  for (const [value, label] of Object.entries(labels)) {
    const config = updateIntentReview(project(), { type: 'knowledge', value })
    const source = config.project.purpose
    for (const stale of [false, true]) {
      if (stale) config.project.purpose = 'A different request.'
      const pack = compile(config)
      const standalone = compileStandaloneSkill(config, 'implementation')
      for (const content of [file(pack, 'WORKFLOW.md'), file(pack, 'templates/REQUIREMENTS.md'), file(standalone, 'implementation/references/project.md')]) {
        assert.ok(content.includes(`Knowledge need: ${label}.`))
        assert.ok(content.includes(source))
        assert.match(content, stale ? /Recorded intent clarifications, not applied/ : /do not approve requirements, add practices/)
      }
      assert.deepEqual(parseImport(file(pack, 'project.json')), config)
      assert.ok(!config.practices.includes('evidence-wiki'))
    }
  }
})

test('exported classifications do not claim current retrieval acceptance for any stored policy', () => {
  for (const config of [legacyClarified(), legacyClarified(2), legacyClarified(3), legacyClarified(4), clarified()]) {
    for (const content of [file(compile(config), 'WORKFLOW.md'), file(compileStandaloneSkill(config, 'implementation'), 'implementation/references/project.md')]) {
      assert.match(content, /Recorded classification\. This export does not establish that it is currently used for matching\. Review its status in Brief\./)
      if (config.workflow.intentReview.version < 3) assert.match(content, /Newly supported meanings may need confirmation again/)
      assert.doesNotMatch(content, /conditional, historical or task scope meanings need confirmation again/)
    }
  }
})

test('knowledge and policy metadata stay outside provider state and are rejected as foreign request fields', () => {
  const config = updateIntentReview(clarified(), { type: 'knowledge', value: 'maintained-reference' })
  const draft = { userBrief: config.project.purpose, purpose: config.project.purpose, suppliedProjectAnswers: config.workflow.answers, practiceId: 'minimum-change', manualRecipe: config.workflow.recipe }
  const original = buildAssistancePayload(draft, 'knowledge-boundary')
  const withLocalMetadata = buildAssistancePayload({ ...draft, intentReview: config.workflow.intentReview, knowledgeNeed: 'maintained-reference', policyVersion: 3 }, 'knowledge-boundary')
  assert.deepEqual(withLocalMetadata, original)
  assert.deepEqual(Object.keys(original).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
  const request = makeRequest(parseSuggestionInput(original).item)
  assert.deepEqual(request.state, { userBrief: config.project.purpose, suppliedProjectAnswers: original.suppliedProjectAnswers })
  for (const [key, value] of Object.entries({ intentReview: config.workflow.intentReview, knowledgeNeed: 'maintained-reference', policyVersion: 3 })) {
    assert.throws(() => parseSuggestionInput({ ...original, [key]: value }), error => error.code === 'invalid_input')
    assert.throws(() => parseSuggestionInput({ ...original, suppliedProjectAnswers: { ...original.suppliedProjectAnswers, [key]: 'foreign field' } }), error => error.code === 'invalid_input')
  }
})
