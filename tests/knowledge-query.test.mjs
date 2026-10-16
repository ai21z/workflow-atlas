import test from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { createKnowledgeQuery, tokenize, sourceLine, analyzeBriefConstraints, textMatchReason } from '../factory/knowledge-query.mjs'
import { loadProjection, parseArguments, run } from '../tools/atlas-query.mjs'

const data = await loadProjection()
const query = createKnowledgeQuery(data)
const cli = fileURLToPath(new URL('../tools/atlas-query.mjs', import.meta.url))

test('tokens preserve recognized short technical names, ignore function words and never stem', () => {
  assert.deepEqual(tokenize('Pytest runs pytest, npm ci and Node.js 22'), ['pytest', 'runs', 'npm', 'ci', 'node'])
  assert.deepEqual(tokenize('CI/CD Go C# C++ R .NET and the a I to on CI'), ['ci', 'cd', 'go', 'c#', 'c++', 'r', '.net'])
  assert.deepEqual(tokenize('the and for with'), [], 'function words never match')
  assert.deepEqual(tokenize(''), [])
  assert.deepEqual(tokenize(null), [])
})

test('short technical searches match exact tokens and do not invent missing catalogue coverage', () => {
  assert.equal(query.search('Go')[0].ref, 'technology:go')
  assert.equal(query.search('.NET')[0].ref, 'technology:dotnet')
  assert.ok(query.search('CI').some(item => item.ref === 'topic:github-actions'))
  for (const term of ['Go', 'R', 'C#', 'C++']) {
    const token = tokenize(term)[0]
    for (const result of query.search(term)) assert.ok(result.matched.every(match => match.token === token))
  }
  // The production catalogue has no R or C#/C++ record yet. Verify punctuation with a small independent fixture.
  const topics = ['R', 'C#', 'C++', '.NET', 'Go', 'Governance'].map((title, index) => ({ id: `name-${index}`, title, summary: '', parent: 'overview', refs: [], sections: [], catalog: { kind: 'concept' } }))
  const technical = createKnowledgeQuery({ nodes: topics, catalog: { edges: [] } })
  for (const title of ['R', 'C#', 'C++', '.NET', 'Go']) assert.deepEqual(technical.search(title).map(hit => hit.title), [title])
})

test('known technology words do not expand into a different technology by prefix', () => {
  for (const hit of query.search('Java', { limit: 100 })) assert.ok(hit.matched.every(match => match.token === 'java'), 'Java must not match JavaScript')
  assert.ok(query.search('Java').some(item => item.id === 'java'))
  assert.ok(query.search('pyth').some(item => item.id === 'python'), 'an incomplete word still supports prefix lookup')
})

test('search ranks a topic by its own words and explains every match', () => {
  const [first] = query.search('pull request checks on github actions')
  assert.equal(first.ref, 'topic:github-actions')
  assert.ok(first.matched.length >= 3)
  for (const match of first.matched) assert.ok(['title', 'aliases', 'practiceTitle', 'applicability', 'summary', 'practiceSummary', 'body'].includes(match.field))
  assert.equal(first.sourceLine, 'Scoped source claims reviewed 2026-10-12, 14 sources')
  const retries = query.search('retry stopping rule correction')
  assert.ok(retries.slice(0, 3).some(hit => hit.ref === 'topic:retries'))
  assert.deepEqual(query.search('   '), [])
  assert.ok(query.search('pytest').some(hit => hit.ref === 'topic:python'), 'an identifier matches without stemming')
})

test('search can be limited to definition types and results are deterministic', () => {
  const practices = query.search('context', { types: ['practice'] })
  assert.ok(practices.length)
  assert.ok(practices.every(hit => hit.type === 'practice'))
  assert.deepEqual(query.search('verification evidence', { limit: 5 }), query.search('verification evidence', { limit: 5 }))
})

test('get returns a topic with sections, claims, sources and typed neighbours', () => {
  const record = query.get('docker')
  assert.equal(record.ref, 'topic:docker')
  assert.ok(record.sections.length >= 7)
  assert.ok(record.claims.length >= 10)
  assert.ok(record.sources.every(source => source.url && source.status))
  assert.ok(record.neighbors.some(item => item.type === 'browse-under' && item.ref === 'topic:toolchain'))
  assert.ok(record.neighbors.some(item => item.type === 'explains' && item.ref === 'technology:docker' && item.derived))
  assert.equal(query.get('no-such-thing'), null)
  const stage = query.get('stage:implementation')
  assert.equal(stage.type, 'stage')
  assert.ok(stage.neighbors.some(item => item.type === 'explained-by' && item.ref === 'topic:implementation-workflow'))
})

test('source lines report recorded status and never a judgement', () => {
  assert.equal(sourceLine({ sourceRefs: ['a', 'b'], sourceStatus: 'reviewed', reviewedOn: '2026-10-05' }), 'Scoped source claims reviewed 2026-10-05, 2 sources')
  assert.equal(sourceLine({ sourceRefs: ['a'], sourceStatus: 'reviewed', reviewedOn: '' }), 'Scoped source claims reviewed, 1 source')
  assert.equal(sourceLine({ sourceRefs: ['a'], sourceStatus: 'needs-review', reviewedOn: '' }), 'Not yet reviewed, 1 source')
  assert.equal(sourceLine({ sourceRefs: [], sourceStatus: 'legacy', reviewedOn: '' }), 'No sources recorded. No claim review recorded.')
  assert.equal(sourceLine({ sourceRefs: ['a'], sourceStatus: 'legacy', reviewedOn: '' }), 'References retained without claim review, 1 source')
  assert.equal(sourceLine({ sourceRefs: [], sourceStatus: null, reviewedOn: '' }), 'No source recorded')
})

test('match explanations quote the supplied words and keep graph evidence separate', () => {
  assert.equal(textMatchReason([]), '')
  assert.equal(textMatchReason(['acceptance', 'acceptance']), 'Your text mentions “acceptance”.')
  assert.equal(textMatchReason(['acceptance', 'implementation']), 'Your text mentions “acceptance” and “implementation”.')
  const [lexical] = query.propose({ brief: 'pyth' })
  assert.equal(lexical.id, 'python')
  assert.equal(lexical.reasons[0], 'Your text mentions “pyth”.', 'prefix matches quote the supplied term, not an expanded catalogue token')
  assert.deepEqual(lexical.graphReasons, [])
  const graph = query.propose({ brief: 'python', technologies: ['python'], limit: 50 }).find(item => item.id === 'python')
  assert.ok(graph.graphReasons.length)
  assert.ok(graph.graphReasons.every(reason => graph.reasons.includes(reason) && !reason.startsWith('Your text mentions ')))
})

test('propose combines the brief with the project facts and gives a reason for every suggestion', () => {
  const results = query.propose({ brief: 'Add a status filter to the request list and run the tests in CI', technologies: ['nodejs', 'github-actions'], stages: ['implementation', 'verification'], recipe: 'feature-delivery' })
  assert.ok(results.length <= 5)
  for (const item of results) {
    assert.equal(item.type, 'topic')
    assert.ok(item.reasons.length, `${item.ref} has a reason`)
    assert.ok(item.sourceLine)
    assert.equal(item.confirmation, 'not checked')
  }
  assert.ok(results.some(item => item.ref === 'topic:nodejs' && item.reasons.some(reason => reason.includes('technology Node.js'))))
  assert.ok(results.some(item => item.ref === 'topic:github-actions'))
  assert.ok(!results.some(item => ['topic:overview', 'topic:toolchain', 'topic:workflows'].includes(item.ref)), 'cluster overviews are not proposed')
  const factsOnly = query.propose({ technologies: ['postgresql'] })
  assert.ok(factsOnly.some(item => item.ref === 'topic:postgresql-data'))
  assert.deepEqual(query.propose({}), [])
  const selectable = query.propose({ brief: 'keep the smallest necessary change', stages: ['implementation'] }).find(item => item.ref === 'topic:implementation-workflow')
  assert.ok(selectable)
  assert.equal(selectable.practiceRef, 'practice:minimum-change')
})

test('definitions explain their topics and recipes reach topic explanations through their stages', () => {
  assert.equal(query.propose({ stages: ['reproduction'] })[0].ref, 'topic:verification-loops')
  assert.equal(query.propose({ stages: ['diagnosis'] })[0].ref, 'topic:finding-contract')
  const feature = query.propose({ recipe: 'feature-delivery', limit: 50 })
  assert.ok(feature.some(item => item.ref === 'topic:implementation-workflow'))
  assert.ok(feature.some(item => item.reasons.some(reason => reason.includes('recipe Feature delivery stage'))))
  const bug = query.propose({ recipe: 'bugfix', limit: 50 })
  assert.ok(bug.some(item => item.ref === 'topic:verification-loops'))
  assert.ok(bug.some(item => item.ref === 'topic:finding-contract'))
  assert.ok(bug.some(item => item.ref === 'topic:implementation-workflow'))
})

test('stage reading links do not select a named technology while explicit facts and reading requests still work', () => {
  const topic = (id, title, kind, definitionRefs = []) => ({ id, title, summary: '', parent: 'reading', refs: [], sections: [], catalog: { kind, aliases: [], definitionRefs } })
  const independent = createKnowledgeQuery({
    nodes: [topic('language-guide', 'Fixture language', 'technology'), topic('neutral-guide', 'Neutral result checks', 'procedure')],
    catalog: {
      definitions: [{ ref: 'stage:verification', id: 'verification', type: 'stage', label: 'Verification' }, { ref: 'technology:fixture-language', id: 'fixture-language', type: 'technology', label: 'Fixture language' }, { ref: 'technology:unrelated', id: 'unrelated', type: 'technology', label: 'Unrelated technology' }],
      edges: [
        { from: 'stage:verification', type: 'applied-by', to: 'topic:language-guide', derived: true },
        { from: 'stage:verification', type: 'applied-by', to: 'topic:neutral-guide', derived: true },
        { from: 'topic:language-guide', type: 'applies-to', to: 'technology:fixture-language' },
        { from: 'technology:fixture-language', type: 'applied-by', to: 'topic:language-guide', derived: true },
        { from: 'technology:unrelated', type: 'works-with', to: 'technology:fixture-language' },
      ],
    },
  })
  assert.deepEqual(independent.propose({ stages: ['verification'] }).map(item => item.id), ['neutral-guide'])
  assert.deepEqual(independent.propose({ technologies: ['unrelated'], stages: ['verification'] }).map(item => item.id), ['neutral-guide'])
  assert.ok(independent.propose({ technologies: ['fixture-language'], stages: ['verification'] }).some(item => item.id === 'language-guide' && item.graphReasons.some(reason => reason.includes('technology Fixture language'))))
  assert.ok(independent.propose({ brief: 'Fixture language', stages: ['verification'] }).some(item => item.id === 'language-guide' && item.reasons[0].includes('Your text mentions')))
  assert.equal(independent.search('Fixture language')[0].id, 'language-guide')
})

test('canonical stage explanations win graph-only ties against generic applicable reading', () => {
  const topic = (id, title) => ({ id, title, summary: '', parent: 'reading', refs: [], sections: [], catalog: { kind: 'procedure', definitionRefs: [] } })
  const nodes = [topic('applicable', 'A general guide'), topic('canonical', 'Z canonical stage guide')]
  for (const metadata of [true, false]) {
    const independent = createKnowledgeQuery({ nodes, catalog: {
      definitions: [{ ref: 'stage:verification', id: 'verification', type: 'stage', label: 'Verification', ...(metadata ? { explainedBy: 'canonical' } : {}) }],
      edges: [
        { from: 'stage:verification', type: 'applied-by', to: 'topic:applicable', derived: true },
        { from: 'stage:verification', type: 'explained-by', to: 'topic:canonical' },
      ],
    } })
    const reading = independent.propose({ stages: ['verification'] })
    assert.equal(reading[0].id, 'canonical', `canonical ${metadata ? 'definition' : 'relationship'} takes precedence`)
    assert.equal(reading[0].score, reading[1].score, 'the tie preference does not invent extra graph evidence')
    assert.equal(independent.propose({ brief: 'A general guide', stages: ['verification'] })[0].id, 'applicable', 'specific reading intent still outranks a generic stage explanation')
  }
})

test('repeated project facts cannot change rankings, scores or explanations', () => {
  const unique = { brief: 'Implement a scoped change and test it', technologies: ['nodejs', 'docker'], stages: ['implementation', 'verification'], recipe: 'feature-delivery' }
  const repeated = { ...unique, technologies: ['nodejs', 'docker', 'nodejs', 'docker'], stages: ['implementation', 'verification', 'implementation', 'verification'] }
  assert.deepEqual(query.propose(repeated), query.propose(unique))
  for (const item of query.propose(unique, { limit: 50 })) assert.equal(new Set(item.reasons).size, item.reasons.length)
  const directDocker = query.propose({ technologies: ['nodejs', 'docker'], limit: 50 }).find(item => item.ref === 'topic:docker')
  assert.ok(directDocker)
  assert.ok(!directDocker.reasons.some(reason => reason.startsWith('Works with')), 'direct environment evidence takes precedence over a connected seed')
})

test('workflow graph support is bounded and explicit stages never regain recipe defaults', async () => {
  const explicitEmpty = { recipe: 'feature-delivery', stages: [] }
  assert.deepEqual(query.proposalContext(explicitEmpty).seeds, ['recipe:feature-delivery'])
  assert.ok(query.propose({ ...explicitEmpty, limit: 50 }).every(item => item.graphReasons.every(reason => !reason.includes(' stage '))))
  const verification = query.propose({ recipe: 'feature-delivery', stages: ['verification'], limit: 100 })
  for (const item of verification) {
    assert.ok(item.scoreParts.workflow <= 0.2)
    assert.ok(item.graphReasons.every(reason => !/stage (Development|Release and production|Architecture and impact)/.test(reason)))
  }
  const allStages = query.propose({ recipe: 'feature-delivery', limit: 100 })
  assert.ok(allStages.some(item => item.graphReasons.some(reason => reason.includes('recipe Feature delivery stage Development'))))
  for (const item of allStages) assert.ok(item.scoreParts.workflow <= 0.2)
  const cliDefault = await run(['propose', '--recipe', 'feature-delivery', '--limit', '50'])
  assert.equal(Object.hasOwn(cliDefault.input, 'stages'), false, 'an omitted CLI scope still permits recipe fallback')
  assert.equal(cliDefault.constraints.recipeStageFallback, true)
  const cliSelected = await run(['propose', '--recipe', 'feature-delivery', '--stage', 'verification', '--limit', '50'])
  assert.deepEqual(cliSelected.input.stages, ['verification'])
  assert.equal(cliSelected.constraints.recipeStageFallback, false)
})

test('API task relevance wins over generic recipe links with an auditable score', () => {
  const results = query.propose({ brief: 'Fetch topics by subject from an approved API, validate the selection and save only after human approval.', technologies: ['java', 'spring-boot', 'postgresql'], recipe: 'feature-delivery', limit: 20 })
  assert.equal(results[0].id, 'api-stored-data')
  assert.ok(results[0].reasons[0].includes('“api”'))
  assert.equal(results[0].scoreParts.workflow, 0.2, 'the reviewed step mapping contributes only the bounded workflow score')
  assert.ok(data.nodes.find(node => node.id === 'api-stored-data').catalog.applies.stages.includes('verification'), 'workflow relevance has an explicit authored mapping')
  for (const item of results) {
    assert.ok(item.scoreParts.workflow <= 0.2)
    assert.ok(item.scoreParts.environment <= 0.4)
    assert.ok(item.scoreParts.related <= 0.1)
    assert.ok(Math.abs(item.score - Object.values(item.scoreParts).reduce((sum, value) => sum + value, 0)) < 0.001)
    assert.equal(item.confirmation, 'not checked')
  }
})

test('search includes article text after the former first 120 distinct token cutoff', () => {
  const node = { id: 'late-term', title: 'Independent fixture', summary: '', parent: 'overview', refs: [], sections: [{ type: 'p', text: Array.from({ length: 150 }, (_, index) => `word${index}`).join(' ') + ' reconciliationtail' }], catalog: { kind: 'concept' } }
  const fullText = createKnowledgeQuery({ nodes: [node], catalog: { edges: [] } })
  assert.equal(fullText.search('reconciliationtail')[0].id, 'late-term')
})

test('explicit exclusions suppress proposals while ordinary search remains a reading search', () => {
  const positive = 'Create a source backed project wiki'
  const negative = 'Do not create a source backed project wiki'
  assert.ok(query.propose({ brief: positive }).some(item => item.practiceRef === 'practice:evidence-wiki'))
  assert.ok(!query.propose({ brief: negative }).some(item => item.practiceRef === 'practice:evidence-wiki'))
  assert.ok(query.search(negative).some(item => item.ref === 'topic:llm-wiki'))
  const context = query.proposalContext({ brief: negative })
  assert.equal(context.positiveText, '')
  assert.equal(context.exclusions[0].marker, 'Do not')
  assert.ok(context.excluded.some(item => item.practiceRefs.includes('practice:evidence-wiki') && item.reasons[0].matched.includes('wiki')))
  assert.equal(context.unresolvedNegation, false)
  const mixed = 'Create a project wiki. Do not create a project wiki. Fix the pipeline tests'
  assert.ok(!query.propose({ brief: mixed, stages: ['implementation', 'verification'], limit: 50 }).some(item => item.ref === 'topic:llm-wiki'))
  const sharedObject = 'Make the smallest necessary change. Do not create or maintain a project wiki.'
  assert.equal(query.proposalContext({ brief: sharedObject }).unresolvedNegation, false)
  assert.ok(query.propose({ brief: sharedObject, stages: ['implementation'], limit: 50 }).some(item => item.practiceRef === 'practice:minimum-change'))
  assert.ok(!query.propose({ brief: sharedObject, stages: ['implementation'], limit: 50 }).some(item => item.practiceRef === 'practice:evidence-wiki'))
})

test('linked practice language is searchable on its topic without borrowing stage descriptions', () => {
  const wiki = query.search('maintained index corrections', { limit: 100 }).find(item => item.id === 'llm-wiki')
  assert.ok(wiki.matched.some(match => match.field === 'practiceSummary' && match.term === 'corrections'))
  const label = query.search('smallest necessary change', { limit: 100 }).find(item => item.id === 'implementation-workflow')
  assert.ok(label.matched.some(match => match.field === 'practiceTitle' && match.term === 'necessary'))
  const independent = createKnowledgeQuery({ nodes: [{ id: 'fixture', title: 'Topic', summary: '', parent: 'cluster', refs: [], sections: [], catalog: { kind: 'practice', definitionRefs: ['practice:p', 'stage:s'] } }], catalog: { edges: [], definitions: [
    { ref: 'practice:p', id: 'p', type: 'practice', label: 'Practice phrase', summary: 'practiceexclusive' },
    { ref: 'stage:s', id: 's', type: 'stage', label: 'Stage phrase', summary: 'stageexclusive' },
  ] } })
  assert.equal(independent.search('practiceexclusive', { types: ['topic'] })[0].id, 'fixture')
  assert.deepEqual(independent.search('stageexclusive', { types: ['topic'] }), [])
})

test('omit and exclude resolve only complete named practices, including shared targets', () => {
  for (const clause of [
    'For this task omit Requirements before implementation and omit Smallest necessary change.',
    'Exclude Requirements before implementation and Smallest necessary change from this pack.',
    'Please omit specification-first and minimum-change.',
  ]) {
    const context = query.proposalContext({ brief: `Keep a source backed project wiki. ${clause}`, stages: ['requirements', 'implementation'] })
    assert.equal(context.unresolvedNegation, false, clause)
    assert.deepEqual(new Set(context.excluded.flatMap(item => item.practiceRefs)), new Set(['practice:specification-first', 'practice:minimum-change']))
    assert.ok(!/requirements|smallest|minimum|specification/iu.test(context.positiveText), 'omitted names never become positive retrieval terms')
    assert.ok(query.propose({ brief: `Keep a source backed project wiki. ${clause}`, stages: ['requirements', 'implementation'], limit: 100 }).some(item => item.practiceRef === 'practice:evidence-wiki'))
  }
  for (const clause of [
    'Omit an old wiki page from the result.',
    'Exclude Requirements before implementation and external calls.',
    'Omit Smallest necessary change or Source backed project wiki.',
    'Exclude Smallest necessary change unless the reviewer asks.',
    'Exclude unknown practice.',
    'Omit Requirements before implementation?',
    'Omit Requirements before implementation and add a project wiki.',
  ]) {
    const context = query.proposalContext({ brief: `Make the smallest necessary change. ${clause}` })
    assert.equal(context.unresolvedNegation, true, clause)
    assert.ok(query.propose({ brief: `Make the smallest necessary change. ${clause}`, stages: ['implementation'], limit: 100 }).every(item => !item.selectable))
  }
})

test('retention instructions and historical negation are not interpreted as practice exclusions', () => {
  for (const clause of ['Do not remove the existing project wiki.', 'Never delete the project wiki.', 'We did not reject the existing design.']) {
    const context = query.proposalContext({ brief: clause })
    assert.equal(context.unresolvedNegation, true, clause)
    assert.deepEqual(context.excluded, [], clause)
    assert.equal(context.positiveText, '', clause)
  }
})

test('comma-separated named omissions cannot become positive practice matches', () => {
  const names = ['practice:specification-first', 'practice:minimum-change', 'practice:evidence-wiki']
  for (const clause of [
    'Omit Requirements before implementation, Smallest necessary change and Source backed project wiki from this pack.',
    'Exclude Requirements before implementation, Smallest necessary change, and Source backed project wiki.',
    'Omit specification-first, minimum-change, evidence-wiki from the workflow.',
  ]) {
    const context = query.proposalContext({ brief: clause })
    assert.equal(context.unresolvedNegation, false, clause)
    assert.deepEqual(new Set(context.excluded.flatMap(item => item.practiceRefs)), new Set(names), clause)
    assert.equal(context.positiveText, '', clause)
    assert.deepEqual(query.propose({ brief: clause, stages: ['requirements', 'implementation'], limit: 100 }).filter(item => names.includes(item.practiceRef)), [], clause)
  }
  const independent = query.proposalContext({ brief: 'Omit Requirements before implementation, Smallest necessary change from this pack, keep a source backed project wiki.' })
  assert.equal(independent.unresolvedNegation, false)
  assert.match(independent.positiveText, /keep a source backed project wiki/iu)
  assert.deepEqual(new Set(independent.excluded.flatMap(item => item.practiceRefs)), new Set(names.slice(0, 2)))
  const explained = query.proposalContext({ brief: 'For this task omit Requirements before implementation and omit Smallest necessary change, since we are only maintaining the knowledge record.' })
  assert.equal(explained.unresolvedNegation, false)
  assert.deepEqual(new Set(explained.excluded.flatMap(item => item.practiceRefs)), new Set(names.slice(0, 2)))
  for (const clause of [
    'Omit Requirements before implementation, unknown practice and Source backed project wiki.',
    'Omit Requirements before implementation, external calls and Source backed project wiki.',
    'Omit Requirements before implementation, Smallest necessary change, unless approved.',
    'Omit Requirements before implementation, Smallest necessary change from this pack, no external calls.',
    'Omit Requirements before implementation, because we also exclude an unknown rule.',
    'Omit Requirements before implementation, Smallest necessary change and Source backed project wiki?',
  ]) {
    const context = query.proposalContext({ brief: clause })
    assert.equal(context.unresolvedNegation, true, clause)
    assert.ok(query.propose({ brief: clause, stages: ['requirements', 'implementation'], limit: 100 }).every(item => !item.selectable), clause)
  }
})

// These regressions were added after the confirmation pilot exposed leave-out
// wording. Passing them is functional verification, not fresh accuracy evidence.
test('post-confirmation leave-out requests use exact named practice exclusions', () => {
  for (const clause of [
    'Please leave Source backed project wiki out of this pack.',
    'Leave evidence-wiki out of the generated instructions.',
    'Leave Source backed project wiki out of the workflow since our team supplies that procedure.',
    'Leave Source backed project wiki out of pack.',
  ]) {
    const context = query.proposalContext({ brief: clause })
    assert.equal(context.unresolvedNegation, false, clause)
    assert.deepEqual(new Set(context.excluded.flatMap(item => item.practiceRefs)), new Set(['practice:evidence-wiki']), clause)
    assert.equal(context.positiveText, '', clause)
    assert.equal(context.exclusions[0].clause, clause.slice(0, -1), 'retain the whole original sentence')
  }
  const coordinated = query.proposalContext({ brief: 'Leave Requirements before implementation, Smallest necessary change and Source backed project wiki out of the exported pack.' })
  assert.equal(coordinated.unresolvedNegation, false)
  assert.deepEqual(new Set(coordinated.excluded.flatMap(item => item.practiceRefs)), new Set(['practice:specification-first', 'practice:minimum-change', 'practice:evidence-wiki']))
})

test('post-confirmation ambiguous, unknown and negated leave-out requests pause instead of supplying positive terms', () => {
  for (const clause of [
    'Leave unknown practice out of this pack.',
    'Leave Source backed project wiki and unknown practice out of this pack.',
    'Leave Smallest necessary change or Source backed project wiki out of this pack.',
    'Leave Source backed project wiki out of the pack and keep its generated instructions.',
    'Leave Source backed project wiki out of the pack because the reviewer says it must be included.',
    'Leave Source backed project wiki out of the pack because we do not maintain sources.',
    'Leave Source backed project wiki out of the pack, unless approved.',
    'Leave Source backed project wiki out of this pack?',
    'Do not leave Source backed project wiki out of this pack.',
    'Never leave Smallest necessary change out of the workflow.',
    'Keep the wiki and do not remove it or leave it out of the pack.',
    'The lead says leave Smallest necessary change out of the pack, while the reviewer says it must be included.',
    'We have not agreed whether to leave Smallest necessary change out of the pack.',
  ]) {
    const context = query.proposalContext({ brief: clause })
    assert.equal(context.unresolvedNegation, true, clause)
    assert.equal(context.positiveText, '', clause)
    assert.ok(query.propose({ brief: clause, stages: ['requirements', 'implementation'], limit: 100 }).every(item => !item.selectable), clause)
  }
  for (const clause of ['Do not leave Source backed project wiki out of this pack.', 'The lead says leave Smallest necessary change out of the pack, while the reviewer says it must be included.']) {
    assert.deepEqual(query.proposalContext({ brief: clause }).excluded, [], 'unsettled or opposite wording does not confirm an exclusion')
  }
})

test('post-confirmation exposed briefs suppress leave-out targets and retain user context', async () => {
  const { createBriefSuggestions } = await import('../factory/brief-suggestions.mjs')
  const { createRecipe } = await import('../factory/core.mjs')
  const { buildAssistancePayload } = await import('../factory/jev-assistance.mjs')
  const suggestions = createBriefSuggestions(data)
  const config = createRecipe('feature-delivery')
  const first = 'Add drag and drop ordering to the household budget categories screen. Please leave Source backed project wiki out of this pack. We only want the selected software change and its ordinary delivery work.'
  const second = 'Build the animal shelter adoption appointment page. Leave Requirements before implementation out of the exported pack because our team supplies that procedure. Keep the original appointment policy passages and later corrections in a maintained project wiki.'
  const third = 'Build the bakery production count widget. The lead says leave Smallest necessary change out of the pack, while the reviewer says it must be included. Both requests remain unresolved.'
  const firstResult = suggestions.propose({ brief: first, config })
  assert.equal(firstResult.unresolvedNegation, false)
  assert.ok(!firstResult.suggestions.some(item => item.practiceId === 'evidence-wiki'))
  const secondResult = suggestions.propose({ brief: second, config })
  assert.equal(secondResult.unresolvedNegation, false)
  assert.ok(!secondResult.suggestions.some(item => item.practiceId === 'specification-first'))
  assert.ok(secondResult.suggestions.some(item => item.practiceId === 'evidence-wiki'))
  const thirdResult = suggestions.propose({ brief: third, config })
  assert.equal(thirdResult.unresolvedNegation, true)
  assert.deepEqual(thirdResult.suggestions, [])
  assert.equal(thirdResult.assessmentCandidate, null)
  const payload = buildAssistancePayload({ userBrief: second, suppliedProjectAnswers: secondResult.input.answers, practiceId: 'evidence-wiki' }, 'post-confirmation-exclusion-check', config.workflow.recipe)
  assert.deepEqual(Object.keys(payload).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
  assert.equal(payload.userBrief, second)
  assert.equal(secondResult.input.brief, second)
})

test('finite missing-input statuses are unknown information and not exclusions or positive matches', () => {
  for (const clause of ['Not agreed yet.', 'Not supplied.', 'Not provided yet.', 'We have not agreed acceptance criteria yet.', 'We have not agreed on the acceptance examples yet.', 'I have not supplied the scope.', 'We have not defined expected behavior.', 'We have not agreed whether bookings expire automatically.', 'We have not decided whether to show a warning or block the request.']) {
    const context = query.proposalContext({ brief: clause })
    assert.equal(context.unresolvedNegation, false, clause)
    assert.equal(context.unknownInformation.length, 1, clause)
    assert.equal(context.positiveText, '', clause)
    assert.deepEqual(context.exclusions, [], clause)
  }
  for (const clause of ['We have not agreed acceptance criteria or deployment permissions.', 'We have not agreed acceptance criteria, so do not save anything.', 'Not supplied unless approved.', 'Not agreed yet?', 'We have not agreed whether to never save any records.', 'We have not agreed whether to save, so do not save anything.', 'We have not agreed whether to exclude Smallest necessary change.', 'We have not agreed whether to save unless approved.', 'We have not agreed whether to save anything?']) {
    assert.equal(query.proposalContext({ brief: clause }).unresolvedNegation, true, clause)
  }
})

test('bounded offline capabilities preserve independent guidance without resolving network policy', () => {
  for (const clause of ['Inspectors must complete checks without a network connection.', 'The app must work without an internet connection.', 'Readers can open articles without a network connection.', 'The route guide works without a network connection.', 'The route guide is working offline.', 'Downloaded instructions remain readable without an internet connection.', 'The guide must remain readable offline.']) {
    const context = query.proposalContext({ brief: `Make the smallest necessary change. ${clause}`, stages: ['implementation'] })
    assert.equal(context.unresolvedNegation, false, clause)
    assert.equal(context.requirements[0].kind, 'offline-capability')
    assert.ok(!context.positiveText.includes('network'), 'offline wording must not provide positive network matches')
    assert.deepEqual(context.exclusions, [])
  }
  for (const clause of ['Without a network connection.', 'No network connections.', 'The app must work without a network connection unless approved.', 'The app must work without a network connection?', 'The app must not work without a network connection.', 'Inspectors must complete checks without a network connection and send the records.', 'Inspectors must complete checks without a network connection. No external calls.', 'The guide remains readable without a network connection unless approved.', 'The guide must open records then send them without a network connection.', 'The guide is not working offline.']) {
    assert.equal(query.proposalContext({ brief: clause }).unresolvedNegation, true, clause)
  }
})

test('qualified application outcomes are requirements but exceptional or universal variants stay unresolved', () => {
  const clause = 'Rejected applications are not saved as approved records'
  const context = query.proposalContext({ brief: `${clause}.` })
  assert.equal(context.unresolvedNegation, false)
  assert.equal(context.requirements[0].kind, 'conditional-outcome')
  assert.equal(context.requirements[0].clause, clause)
  assert.equal(context.positiveText, '')
  for (const wording of ['Applications are not saved as approved records.', 'Rejected applications are not saved as approved records unless approved.', 'Rejected applications are not saved as approved records or published.', 'Rejected applications are not saved as approved records?', 'Rejected applications are not saved as approved records to an external service.']) {
    assert.equal(query.proposalContext({ brief: wording }).unresolvedNegation, true, wording)
  }
})

test('bounded passive outcome objects are domain-neutral and reject logical or operational extensions', () => {
  for (const clause of ['Rejected reservations are not saved as confirmed bookings.', 'Invalid vouchers are not stored as approved discounts.', 'Unapproved local parking permits must not be persisted as accepted city parking permits.', 'Failed reconciliation messages are not stored.']) {
    const context = query.proposalContext({ brief: clause })
    assert.equal(context.unresolvedNegation, false, clause)
    assert.equal(context.requirements.length, 1, clause)
    assert.equal(context.requirements[0].kind, 'conditional-outcome')
    assert.equal(context.positiveText, '')
    assert.deepEqual(context.exclusions, [])
  }
  for (const clause of ['Reservations are not saved as confirmed bookings.', 'Rejected reservations are not saved as confirmed bookings unless approved.', 'Invalid vouchers are not stored as approved discounts or orders.', 'Rejected reservations and tickets are not saved.', 'Rejected or invalid vouchers are not stored.', 'Invalid vouchers are not sent.', 'Invalid vouchers are not stored as approved discounts to an external service.', 'Invalid vouchers are not stored as approved discounts?', 'Unapproved very long local parking permits are not saved.', 'Rejected reservations are not saved as approved every local booking.']) {
    assert.equal(query.proposalContext({ brief: clause }).unresolvedNegation, true, clause)
  }
})

test('unsupported or unrecognized negation withholds selectable practice proposals', () => {
  for (const brief of ['The request is not what we expected', 'Avoid flibbertigibbet and implement a scoped change']) {
    assert.equal(query.proposalContext({ brief }).unresolvedNegation, true)
    assert.ok(query.propose({ brief, stages: ['implementation'], limit: 50 }).every(item => !item.selectable))
  }
  const parsed = analyzeBriefConstraints("Fix the tests without Jenkins, but create a source backed project wiki")
  assert.match(parsed.positiveText, /create a source backed project wiki/)
  assert.deepEqual(parsed.exclusions.map(item => item.terms), [['jenkins']])
})

test('named optional MCP restriction retains independent guidance while consequential restrictions remain unresolved', () => {
  const task = 'Fetch topics by subject from an approved API, validate the selection and save only after human approval.'
  for (const clause of ['No MCP.', 'Do not use MCP servers.', 'Without Model Context Protocol.']) {
    const context = query.proposalContext({ brief: `${task} ${clause}` })
    assert.equal(context.unresolvedNegation, false, clause)
    assert.equal(context.boundaries[0].label, 'MCP')
    assert.ok(query.propose({ brief: `${task} ${clause}` }).some(item => item.id === 'api-stored-data'), 'optional MCP discussion is not a required dependency')
  }
  for (const clause of ['No external calls.', 'Do not save anything.', 'No writes.', 'No database writes.', 'Do not access databases.', 'No transmissions.', 'Never send personal data.', 'Do not save data via PostgreSQL.', 'No implementation.', 'Do not send personal data is not optional.', 'No wiki is not optional.', 'No Jenkins except for tests.', 'No MCP and no external calls.', 'Avoid flibbertigibbet.']) {
    const context = query.proposalContext({ brief: `Make the smallest necessary change. ${clause}` })
    assert.equal(context.unresolvedNegation, true, clause)
    assert.ok(context.unresolved.length, 'the actual unresolved wording must be inspectable')
    const restriction = clause === 'No MCP and no external calls.' ? 'no external calls' : clause.replace(/\.$/, '')
    assert.ok(context.unresolved.some(item => item.clause.includes(restriction)))
    assert.ok(query.propose({ brief: `Make the smallest necessary change. ${clause}`, stages: ['implementation'], limit: 100 }).every(item => !item.selectable))
  }
  const required = query.proposalContext({ brief: 'Keep source evidence in a project wiki. The sources are not optional.' })
  assert.equal(required.unresolvedNegation, false)
  assert.deepEqual(required.exclusions, [])
  assert.match(required.positiveText, /sources/)
})

test('bounded passive outcomes are requirements to verify, not positive matches or global exclusions', () => {
  for (const clause of ['Rejected selections are not saved', 'An invalid request is not stored', 'Unapproved changes must not be persisted', 'Unauthorized submissions should not be saved', 'Unauthorised records will not be stored', 'Failed inputs aren’t persisted']) {
    const parsed = analyzeBriefConstraints(`${clause}.`)
    assert.equal(parsed.unresolvedNegation, false, clause)
    assert.equal(parsed.positiveText, '', 'a negated outcome cannot become a positive retrieval signal')
    assert.deepEqual(parsed.exclusions, [])
    assert.deepEqual(parsed.unresolved, [])
    assert.equal(parsed.requirements.length, 1)
    assert.equal(parsed.requirements[0].kind, 'conditional-outcome')
    assert.equal(parsed.requirements[0].clause, clause)
    assert.match(parsed.requirements[0].note, /requirement to verify/)
    const context = query.proposalContext({ brief: `Make the smallest necessary change. ${clause}.` })
    assert.equal(context.unresolvedNegation, false)
    assert.deepEqual(context.excluded, [])
    assert.ok(query.propose({ brief: `Make the smallest necessary change. ${clause}.`, stages: ['implementation'], limit: 100 }).some(item => item.practiceRef === 'practice:minimum-change'))
  }
})

test('universal, imperative, exceptional and compound outcomes are not mistaken for bounded acceptance', () => {
  for (const clause of ['Selections are not saved.', 'Personal data is not stored.', 'Do not save rejected selections.', 'Rejected selections are not saved?', 'Rejected selections are not saved or published.', 'Rejected selections are not saved unless approved.', 'Rejected selections are not saved, unless approved.', 'Rejected selections are not saved, or published.', 'Rejected selections are not saved; except in tests.', 'Rejected selections are not saved until review.', 'Rejected selections are not saved. Until review is complete.', 'Rejected selections are not saved but only before approval.', 'Rejected selections are not saved however admins may override this.', 'Rejected selections are not saved instead they are always saved.', 'Rejected selections are not saved; only if the reviewer declines.', 'Rejected selections are not saved\nprovided that the reviewer declines.', 'Rejected selections are not saved. As long as the reviewer declines.', 'If validation fails, selections are not saved.', 'Not rejected selections are not saved.', 'Rejected personal data is not sent.', 'Rejected selections are not saved to an external service.', 'Unapproved changes must not be stored?', 'Unapproved changes must not be stored however admins may override this.', 'Unapproved changes must not be stored to an external service.', 'Failed inputs aren’t persisted to an external service.', 'Do not store unapproved changes.', 'Never persist failed inputs.']) {
    const context = query.proposalContext({ brief: `Make the smallest necessary change. ${clause}`, stages: ['implementation'] })
    assert.equal(context.unresolvedNegation, true, clause)
    assert.ok(context.unresolved.length, clause)
    assert.ok(query.propose({ brief: `Make the smallest necessary change. ${clause}`, stages: ['implementation'], limit: 100 }).every(item => !item.selectable), clause)
  }
})

test('a recorded outcome cannot hide a separate operation restriction or introduce stage context', () => {
  const brief = 'Make the smallest necessary change. Rejected selections are not saved.'
  for (const restriction of ['Never send personal data.', 'No external calls.', 'Do not save anything.', 'No MCP, unless an admin approves.']) {
    const context = query.proposalContext({ brief: `${brief} ${restriction}`, stages: ['implementation'] })
    assert.equal(context.requirements[0].clause, 'Rejected selections are not saved')
    assert.equal(context.unresolvedNegation, true, restriction)
    assert.ok(query.propose({ brief: `${brief} ${restriction}`, stages: ['implementation'], limit: 100 }).every(item => !item.selectable))
  }
  const empty = query.proposalContext({ brief, recipe: 'feature-delivery', stages: [] })
  assert.ok(empty.seeds.every(seed => !seed.startsWith('stage:')))
  const bounded = query.proposalContext({ brief: `${brief} No MCP.`, stages: [] })
  assert.equal(bounded.unresolvedNegation, false)
  assert.equal(bounded.boundaries[0].label, 'MCP')
  assert.equal(bounded.requirements[0].clause, 'Rejected selections are not saved')
})

test('workplace examples require established environment context instead of generic pipeline matches', () => {
  const unrelated = { brief: 'Make the pipeline tests pass before release', technologies: ['nodejs', 'github-actions'], stages: ['verification'] }
  const results = query.propose({ ...unrelated, limit: 50 })
  assert.ok(!results.some(item => item.scope?.context === 'atlassian-jenkins'))
  assert.ok(query.proposalContext(unrelated).scopedOut.some(item => item.ref === 'topic:jenkins'))
  const jenkins = query.propose({ brief: 'Fix Jenkins pipeline tests', stages: ['verification'], limit: 50 })
  assert.ok(jenkins.some(item => item.ref === 'topic:jenkins'))
  assert.ok(!jenkins.some(item => item.ref === 'topic:jacoco-counters'), 'Jenkins alone does not establish that a Java coverage tool is in use')
  assert.ok(!query.propose({ brief: 'Fix the pipeline without Jenkins', stages: ['verification'], limit: 50 }).some(item => item.scope?.context === 'atlassian-jenkins'))
  assert.ok(query.search('pipeline').some(item => item.ref === 'topic:jenkins'), 'ordinary lexical reading still includes examples')
})

test('explicit local requirement and context clarification removes matching influence without changing the original brief', () => {
  const brief = 'Make the smallest necessary change. Unverified amounts must not appear in totals. The request is not what we expected.'
  const before = query.proposalContext({ brief, stages: ['implementation'] })
  assert.equal(before.unresolvedNegation, true)
  assert.ok(before.unresolved.every(item => item.clarifiable))
  const contextResolutions = [
    { clause: 'Unverified amounts must not appear in totals', kind: 'requirement' },
    { clause: 'The request is not what we expected', kind: 'context' },
  ]
  const after = query.proposalContext({ brief, stages: ['implementation'], contextResolutions })
  assert.equal(after.unresolvedNegation, false)
  assert.equal(after.positiveText, 'Make the smallest necessary change')
  assert.equal(after.requirements[0].clause, contextResolutions[0].clause)
  assert.equal(after.requirements[0].userConfirmed, true)
  assert.equal(after.requirements[0].kind, 'user-requirement')
  assert.equal(after.unknownInformation[0].clause, contextResolutions[1].clause)
  assert.equal(after.unknownInformation[0].userConfirmed, true)
  assert.equal(after.unknownInformation[0].kind, 'user-context')
  assert.deepEqual(after.excluded, [])
  assert.ok(query.propose({ brief, stages: ['implementation'], contextResolutions, limit: 100 }).some(item => item.practiceRef === 'practice:minimum-change'))
  assert.equal(query.proposalContext({ brief }).unresolvedNegation, true, 'classification is an explicit input, not hidden shared state')
  assert.equal(brief, 'Make the smallest necessary change. Unverified amounts must not appear in totals. The request is not what we expected.')
  const standalone = analyzeBriefConstraints('The request is not what we expected.', { contextResolutions: [contextResolutions[1]] })
  assert.equal(standalone.unresolvedNegation, false)
  assert.equal(standalone.unknownInformation[0].userConfirmed, true)
})

test('clarification removes the entire ambiguous clause and preserves unrelated unresolved scope and selected stages', () => {
  const clause = 'Build the widget without flibbertigibbet'
  const contextResolutions = [{ clause, kind: 'context' }]
  const resolved = query.proposalContext({ brief: `${clause}.`, recipe: 'feature-delivery', stages: [], contextResolutions })
  assert.equal(resolved.positiveText, '', 'a positive prefix inside clarified context cannot support a practice')
  assert.equal(resolved.unresolvedNegation, false)
  assert.ok(resolved.seeds.every(seed => !seed.startsWith('stage:')))
  const partial = query.proposalContext({ brief: `${clause}. No external calls.`, contextResolutions })
  assert.equal(partial.unresolvedNegation, true)
  assert.deepEqual(partial.unresolved.map(item => item.clause), ['No external calls'])
  assert.ok(query.propose({ brief: `${clause}. No external calls.`, stages: ['implementation'], contextResolutions, limit: 100 }).every(item => !item.selectable))
})

test('local exclusion clarification maps only exact linked practice ids and keeps the original words', () => {
  const brief = 'Make the smallest necessary change. Keep evidence in a project wiki. No extras.'
  const contextResolutions = [{ clause: 'No extras', kind: 'exclusion', practiceIds: ['evidence-wiki'] }]
  const context = query.proposalContext({ brief, stages: ['requirements', 'implementation'], contextResolutions })
  assert.equal(context.unresolvedNegation, false)
  assert.deepEqual(new Set(context.excluded.flatMap(item => item.practiceRefs)), new Set(['practice:evidence-wiki']))
  assert.equal(context.exclusions[0].clause, 'No extras')
  assert.equal(context.exclusions[0].userConfirmed, true)
  assert.equal(context.exclusions[0].kind, 'confirmed-practices')
  assert.deepEqual(context.exclusions[0].terms, [])
  const proposals = query.propose({ brief, stages: ['requirements', 'implementation'], contextResolutions, limit: 100 })
  assert.ok(!proposals.some(item => item.practiceRef === 'practice:evidence-wiki'))
  assert.ok(proposals.some(item => item.practiceRef === 'practice:minimum-change'))
  for (const practiceIds of [[], ['unknown'], ['practice:evidence-wiki'], ['evidence-wiki', 'unknown'], ['portable-behavior'], [null]]) {
    assert.equal(query.proposalContext({ brief, contextResolutions: [{ clause: 'No extras', kind: 'exclusion', practiceIds }] }).unresolvedNegation, true, JSON.stringify(practiceIds))
  }
})

test('generic references to extra procedures need explicit clarification instead of matching incidental topic words', () => {
  for (const clause of ['Do not add that extra procedure', 'No additional procedures', 'No optional practice', 'Avoid the extra work', 'No extra diagnosis', 'Do not add the remaining tasks']) {
    const before = query.proposalContext({ brief: `${clause}.` })
    assert.equal(before.unresolvedNegation, true, clause)
    assert.equal(before.unresolved[0].clarifiable, true, clause)
    assert.deepEqual(before.excluded, [], clause)
    const after = query.proposalContext({ brief: `${clause}.`, contextResolutions: [{ clause, kind: 'exclusion', practiceIds: ['minimum-change'] }] })
    assert.equal(after.unresolvedNegation, false, clause)
    assert.deepEqual(new Set(after.excluded.flatMap(item => item.practiceRefs)), new Set(['practice:minimum-change']))
  }
})

test('clarification cannot override original named exclusions, known boundaries or unsupported named targets', () => {
  for (const clause of ['Omit Source backed project wiki', 'Leave Source backed project wiki out of this pack', 'Do not create or maintain a wiki', 'Do not add a maintained wiki']) {
    const before = query.proposalContext({ brief: `${clause}.` })
    for (const kind of ['requirement', 'context', 'exclusion']) {
      const after = query.proposalContext({ brief: `${clause}.`, contextResolutions: [{ clause, kind, ...(kind === 'exclusion' ? { practiceIds: ['minimum-change'] } : {}) }] })
      assert.deepEqual(after.excluded, before.excluded, `${kind}: ${clause}`)
      assert.deepEqual(after.requirements, before.requirements)
      assert.deepEqual(after.unknownInformation, before.unknownInformation)
    }
  }
  const boundary = query.proposalContext({ brief: 'No MCP.', contextResolutions: [{ clause: 'No MCP', kind: 'context' }] })
  assert.equal(boundary.boundaries[0].label, 'MCP')
  for (const clause of ['Omit unknown practice', 'Leave unknown practice out of this pack', 'Omit Source backed project wiki and unknown practice']) {
    const context = query.proposalContext({ brief: `${clause}.`, contextResolutions: [{ clause, kind: 'exclusion', practiceIds: ['evidence-wiki'] }] })
    assert.equal(context.unresolvedNegation, true, clause)
    assert.ok(context.unresolved.every(item => !item.clarifiable), clause)
  }
})

test('conflicting, conditional, historical and inference privacy wording requires rewriting, not one click categorization', () => {
  const cases = [
    'No extras, but include extras.',
    'No extra instructions. Include extra instructions.',
    'No writes unless reviewed.',
    'No writes except in tests.',
    'No external calls and no writes.',
    'The lead says leave Smallest necessary change out of the pack, while the reviewer says it must be included.',
    'No extras. Both requests remain unresolved.',
    'No extras. The requests conflict.',
    'Reviewer A says hide Closed requests. Reviewer B says keep Closed visible. No decision has been made.',
    'No extras. Unless approved.',
    'Do not remove the existing wiki.',
    'We did not save records.',
    'No extras?',
    'Do not send this brief to TypeSafe.',
    'No AI requests.',
    'No external calls.',
    'Do not send information off this device.',
    'Never save anything.',
    'Do not store sensitive data.',
    'Do not send my prompts.',
    'Do not share these messages.',
    'Never disclose credentials.',
  ]
  for (const brief of cases) {
    const original = query.proposalContext({ brief })
    assert.equal(original.unresolvedNegation, true, brief)
    assert.ok(original.unresolved.every(item => item.clarifiable === false), brief)
    const contextResolutions = original.unresolved.map(item => ({ clause: item.clause, kind: 'requirement' }))
    const after = query.proposalContext({ brief, contextResolutions })
    assert.deepEqual(after, original, brief)
  }
})

// R19 exposed this guard gap in the frozen conditional/context holdout. This
// correction is a post-holdout safety regression, not fresh accuracy evidence.
test('global retention restrictions cannot be cleared through any clarification kind or policy', () => {
  for (const clause of [
    'Never retain any material from this request anywhere',
    'Avoid retaining material from this request',
    'No retention of request material',
    'Request material must not be retained',
    'The service must not retain material when work is complete',
  ]) {
    const brief = `Make the smallest necessary change. ${clause}.`
    const original = query.proposalContext({ brief })
    assert.equal(original.unresolvedNegation, true, clause)
    assert.deepEqual(original.unresolved.map(item => item.clause), [clause])
    assert.deepEqual(original.unresolved[0].allowedKinds, [], clause)
    for (const kind of ['context', 'requirement', 'exclusion']) {
      for (const policyVersion of [1, 2]) {
        const contextResolutions = [{ clause, kind, policyVersion, ...(kind === 'exclusion' ? { practiceIds: ['evidence-wiki'] } : {}) }]
        const after = query.proposalContext({ brief, contextResolutions })
        assert.equal(after.unresolvedNegation, true, `${kind}/${policyVersion}: ${clause}`)
        assert.deepEqual(after.resolvedStatements, [])
        assert.ok(query.propose({ brief, contextResolutions, stages: ['implementation'], limit: 100 }).every(item => !item.selectable))
      }
    }
  }
  for (const brief of [
    'Retain the Source backed project wiki.',
    'Keep original policy passages and retained decisions in a maintained project wiki.',
    'The project wiki retains original sources and later corrections.',
    'Maintain the project wiki for retention of original source passages.',
  ]) {
    const context = query.proposalContext({ brief })
    assert.equal(context.unresolvedNegation, false, brief)
    assert.deepEqual(context.excluded, [])
    assert.notEqual(context.positiveText, '')
  }
  for (const brief of ['Do not remove the existing project wiki.', 'Never delete the project wiki.']) {
    const context = query.proposalContext({ brief })
    assert.equal(context.unresolvedNegation, true, brief)
    assert.deepEqual(context.excluded, [])
    assert.ok(context.unresolved.every(item => !item.clarifiable))
  }
  const bounded = query.proposalContext({ brief: 'Rejected selections are not saved. Omit Source backed project wiki.' })
  assert.equal(bounded.unresolvedNegation, false)
  assert.equal(bounded.requirements[0].clause, 'Rejected selections are not saved')
  assert.ok(bounded.excluded.some(item => item.practiceRefs.includes('practice:evidence-wiki')))
})

test('nonexact, duplicate, stale and malformed clarification cannot change retrieval', () => {
  const brief = 'Make the smallest necessary change. No extras.'
  const before = query.proposalContext({ brief })
  for (const contextResolutions of [
    null, {},
    [{ clause: 'No extras.', kind: 'context' }],
    [{ clause: ' No extras', kind: 'context' }],
    [{ clause: 'extras', kind: 'context' }],
    [{ clause: 'no extras', kind: 'context' }],
    [{ clause: 'No extras', kind: 'unknown' }],
    [{ clause: 'No extras', kind: 'context', practiceIds: ['evidence-wiki'] }],
    [{ clause: 'No extras', kind: 'requirement' }, { clause: 'No extras', kind: 'context' }],
    [{ clause: 'No extras', kind: 'context' }, { clause: 'No extras', kind: 'context' }],
    [{ clause: 'Create a wiki', kind: 'requirement' }],
  ]) assert.deepEqual(query.proposalContext({ brief, contextResolutions }), before, JSON.stringify(contextResolutions))
  const changedBrief = 'Make the smallest necessary change. No external calls.'
  assert.deepEqual(query.proposalContext({ brief: changedBrief, contextResolutions: [{ clause: 'No extras', kind: 'context' }] }), query.proposalContext({ brief: changedBrief }))
})

// The old held-out H04/H07/H16/H17/H21 cases became development regressions
// after their first immutable run. These tests are not fresh accuracy evidence.
test('whole conditional product statements offer only a requirement confirmation and retain the full condition', () => {
  for (const clause of [
    'Pencil marks must not disappear when a hint is opened',
    'Technicians must be able to complete the form when the tablet has no signal',
    'If the heading is hidden, the focus marker must not disappear',
    'When a hint is opened, pencil marks must not disappear',
    'The section marker should remain visible when no heading is selected',
  ]) {
    const before = query.proposalContext({ brief: `${clause}.` })
    assert.equal(before.unresolvedNegation, true, clause)
    assert.equal(before.unresolved.length, 1)
    assert.equal(before.unresolved[0].clause, clause)
    assert.equal(before.unresolved[0].clarificationType, 'conditional-requirement')
    assert.deepEqual(before.unresolved[0].allowedKinds, ['requirement'])
    assert.equal(before.positiveText, '')
    const resolution = { clause, kind: 'requirement', policyVersion: 2 }
    const after = query.proposalContext({ brief: `${clause}.`, contextResolutions: [resolution] })
    assert.equal(after.unresolvedNegation, false, clause)
    assert.equal(after.requirements[0].clause, clause)
    assert.equal(after.requirements[0].userConfirmed, true)
    assert.equal(after.requirements[0].policyVersion, 2)
    assert.equal(after.positiveText, '')
    assert.deepEqual(after.resolvedStatements, [{ ...resolution, practiceIds: [] }])
    for (const kind of ['context', 'exclusion']) {
      const wrong = query.proposalContext({ brief: `${clause}.`, contextResolutions: [{ clause, kind, policyVersion: 2, ...(kind === 'exclusion' ? { practiceIds: ['minimum-change'] } : {}) }] })
      assert.equal(wrong.unresolvedNegation, true, kind)
      assert.deepEqual(wrong.resolvedStatements, [])
    }
  }
})

test('explicit historical statements and their paired disavowal offer context only', () => {
  const clauses = ['Last year the old dashboard did not display any dates', 'That historical behavior is not the desired behavior now']
  const brief = `${clauses.join('. ')}.`
  const before = query.proposalContext({ brief })
  assert.deepEqual(before.unresolved.map(item => item.clause), clauses)
  assert.ok(before.unresolved.every(item => item.clarificationType === 'historical-context'))
  assert.ok(before.unresolved.every(item => JSON.stringify(item.allowedKinds) === '["context"]'))
  for (const [index, clause] of clauses.entries()) {
    const after = query.proposalContext({ brief, contextResolutions: clauses.slice(0, index + 1).map(clause => ({ clause, kind: 'context', policyVersion: 2 })) })
    assert.equal(after.unresolvedNegation, index !== clauses.length - 1)
    assert.equal(after.unknownInformation[index].clause, clause)
    assert.equal(after.positiveText, '')
    assert.equal(after.resolvedStatements.length, index + 1)
  }
  for (const clause of ['In 2018, the banner did not display the date', 'Previously the menu was not visible', "Last month the legend didn't display the unit"]) {
    const context = query.proposalContext({ brief: `${clause}.` })
    assert.equal(context.unresolved[0].clause, clause)
    assert.equal(context.unresolved[0].clarificationType, 'historical-context')
    assert.deepEqual(context.unresolved[0].allowedKinds, ['context'])
  }
  assert.equal(query.proposalContext({ brief: 'We did not display dates.' }).unresolved[0].clarifiable, false, 'past tense alone does not prove historical background')
})

test('knowledge-only task scope is quoted whole and continues to exclude software work after confirmation', () => {
  for (const clause of [
    'This task only organizes existing information, without inspecting software or planning application changes',
    'Only existing knowledge is being organized, without software inspection or software change planning',
  ]) {
    const before = query.proposalContext({ brief: `${clause}.` })
    assert.equal(before.unresolved.length, 1)
    assert.equal(before.unresolved[0].clause, clause)
    assert.equal(before.unresolved[0].clarificationType, 'task-scope')
    assert.deepEqual(before.unresolved[0].allowedKinds, ['context'])
    assert.deepEqual(before.taskScopeExcludedKinds, ['software-change'])
    const after = query.proposalContext({ brief: `${clause}.`, contextResolutions: [{ clause, kind: 'context', policyVersion: 2 }] })
    assert.equal(after.unresolvedNegation, false)
    assert.equal(after.positiveText, '')
    assert.deepEqual(after.taskScopeExcludedKinds, ['software-change'])
    assert.deepEqual(after.unknownInformation[0].excludedTaskKinds, ['software-change'])
    assert.equal(after.unknownInformation[0].clause, clause)
    for (const kind of ['requirement', 'exclusion']) {
      assert.equal(query.proposalContext({ brief: `${clause}.`, contextResolutions: [{ clause, kind, policyVersion: 2, ...(kind === 'exclusion' ? { practiceIds: ['evidence-wiki'] } : {}) }] }).unresolvedNegation, true)
    }
  }
  const missing = 'We have not located the original pigment notes yet'
  const scope = 'Only existing knowledge is being organized, without software inspection or software change planning'
  const partial = query.proposalContext({ brief: `${missing}. ${scope}.`, contextResolutions: [{ clause: missing, kind: 'context', policyVersion: 2 }] })
  assert.deepEqual(partial.unresolved.map(item => item.clause), [scope])
  assert.deepEqual(partial.taskScopeExcludedKinds, ['software-change'])
  for (const brief of ['This task only organizes existing information, without a schedule.', 'Only existing knowledge is being organized, without a timetable.', 'Build a screen without inspecting software.']) {
    assert.deepEqual(query.proposalContext({ brief }).taskScopeExcludedKinds, [], 'arbitrary without wording cannot invent a no-software scope')
  }
})

test('unsupported task scopes preserve named exclusions instead of offering a whole context confirmation', () => {
  for (const clause of [
    'This task only adds metadata, without a wiki',
    'Only existing knowledge is being organized, without a project wiki',
  ]) {
    const brief = `${clause}.`
    const original = query.proposalContext({ brief })
    assert.ok(original.excluded.some(item => item.practiceRefs.includes('practice:evidence-wiki')), clause)
    assert.deepEqual(original.taskScopeExcludedKinds, [])
    assert.ok(original.unresolved.every(item => item.clarificationType !== 'task-scope'))
    const after = query.proposalContext({ brief, contextResolutions: [{ clause, kind: 'context', policyVersion: 2 }] })
    assert.deepEqual(after.excluded, original.excluded)
    assert.deepEqual(after.resolvedStatements, [])
  }
})

test('historical prefixes cannot hide an additional or current directive in a context confirmation', () => {
  for (const clause of [
    'Last year the dashboard did not display dates, now we must add a wiki',
    'Last year the dashboard did not display dates, add a wiki',
    'Last year the dashboard did not display dates and add a wiki',
    'Last year the dashboard did not display dates then add a wiki',
    'Previously the menu was not visible now we need a wiki',
    'In 2018, the banner did not display dates, today we want a wiki',
    'Last year the dashboard did not display dates we should add a wiki',
  ]) {
    const before = query.proposalContext({ brief: `${clause}.` })
    assert.deepEqual(before.unresolved.map(item => item.clause), [clause])
    assert.deepEqual(before.unresolved[0].allowedKinds, [], clause)
    assert.equal(before.positiveText, '')
    const after = query.proposalContext({ brief: `${clause}.`, contextResolutions: [{ clause, kind: 'context', policyVersion: 2 }] })
    assert.equal(after.unresolvedNegation, true, clause)
    assert.deepEqual(after.resolvedStatements, [])
  }
  const brief = 'Last year the dashboard did not display dates. That historical behavior is not desired and add a wiki now.'
  const result = query.proposalContext({ brief })
  assert.ok(result.unresolved.filter(item => item.clause.startsWith('That historical')).every(item => !item.clarifiable))
})

test('new whole-sentence meanings require explicit policy v2 while old general choices retain v1 semantics', () => {
  const clause = 'Pencil marks must not disappear when a hint is opened'
  for (const extras of [{}, { policyVersion: 1 }, { policyVersion: null }, { policyVersion: '2' }, { policyVersion: 4 }]) {
    const result = query.proposalContext({ brief: `${clause}.`, contextResolutions: [{ clause, kind: 'requirement', ...extras }] })
    assert.equal(result.unresolvedNegation, true, JSON.stringify(extras))
    assert.deepEqual(result.resolvedStatements, [])
  }
  const generic = 'The request is not what we expected'
  for (const extras of [{}, { policyVersion: 1 }, { policyVersion: 2 }, { policyVersion: 3 }]) {
    const result = query.proposalContext({ brief: `${generic}.`, contextResolutions: [{ clause: generic, kind: 'context', ...extras }] })
    assert.equal(result.unresolvedNegation, false)
    assert.equal(result.resolvedStatements[0].policyVersion, extras.policyVersion || 1)
  }
  const legacyExclusion = query.proposalContext({ brief: 'No extras.', contextResolutions: [{ clause: 'No extras', kind: 'exclusion', practiceIds: ['evidence-wiki'] }] })
  assert.equal(legacyExclusion.unresolvedNegation, false)
  assert.equal(legacyExclusion.resolvedStatements[0].policyVersion, 1)
  assert.equal(query.proposalContext({ brief: `${generic}.`, contextResolutions: [{ clause: generic, kind: 'context', policyVersion: null }] }).unresolvedNegation, true)
})

test('whole-statement roles cannot reinterpret provider privacy, global operation bans or competing instructions', () => {
  for (const brief of [
    'The client must not send this brief to an external model when suggestions are requested.',
    'The system must not save any data when the workflow runs.',
    'This task is limited to local work, without sending information off this device.',
    'Last year we did not share prompts with an AI provider.',
    'Pencil marks must not disappear when hints open, but they must disappear when hints open.',
    'Pencil marks must not disappear when hints open unless approved.',
    'This task only organizes existing information, without inspecting software or planning application changes, but build the application anyway.',
    'The lead says the marks must not disappear when hints open, while the reviewer says they must disappear.',
    'Pencil marks must not disappear when hints open?',
  ]) {
    const original = query.proposalContext({ brief })
    assert.equal(original.unresolvedNegation, true, brief)
    assert.ok(original.unresolved.every(item => item.allowedKinds.length === 0), brief)
    for (const kind of ['requirement', 'context', 'exclusion']) {
      const contextResolutions = original.unresolved.map(item => ({ clause: item.clause, kind, policyVersion: 2, ...(kind === 'exclusion' ? { practiceIds: ['minimum-change'] } : {}) }))
      const after = query.proposalContext({ brief, contextResolutions })
      assert.equal(after.unresolvedNegation, true, `${kind}: ${brief}`)
      assert.deepEqual(after.resolvedStatements, [])
    }
  }
})

test('conditional workflow and artifact scope cannot be cleared as a product requirement', () => {
  const positive = 'Keep original policy sources and later corrections in a maintained project wiki'
  for (const clause of [
    'The workflow must not include a wiki when the budget is low',
    'When the budget is low, the workflow must not include a wiki',
    'The exported pack should not include a wiki if the source is private',
    'The assistant must not include a wiki when evidence is missing',
    'The project instructions must not include a wiki when time is short',
    'This task should not include a wiki when information is missing',
  ]) {
    const brief = `${positive}. ${clause}.`
    const before = query.proposalContext({ brief })
    assert.deepEqual(before.unresolved.map(item => item.clause), [clause])
    assert.deepEqual(before.unresolved[0].allowedKinds, [], clause)
    for (const kind of ['requirement', 'context', 'exclusion']) {
      const contextResolutions = [{ clause, kind, policyVersion: 2, ...(kind === 'exclusion' ? { practiceIds: ['evidence-wiki'] } : {}) }]
      const after = query.proposalContext({ brief, contextResolutions })
      assert.equal(after.unresolvedNegation, true, `${kind}: ${clause}`)
      assert.deepEqual(after.resolvedStatements, [])
      assert.ok(query.propose({ brief, contextResolutions, limit: 100 }).every(item => !item.selectable))
    }
  }
})

test('a confirmed whole requirement leaves separate restrictions and original source matching intact', () => {
  const clause = 'Pencil marks must not disappear when a hint is opened'
  const contextResolutions = [{ clause, kind: 'requirement', policyVersion: 2 }]
  const brief = `Make the smallest necessary change. ${clause}. No external calls.`
  const context = query.proposalContext({ brief, contextResolutions })
  assert.equal(context.unresolvedNegation, true)
  assert.deepEqual(context.unresolved.map(item => item.clause), ['No external calls'])
  assert.equal(context.requirements[0].clause, clause)
  assert.equal(context.positiveText, 'Make the smallest necessary change')
  assert.ok(query.propose({ brief, contextResolutions, stages: ['implementation'], limit: 100 }).every(item => !item.selectable))
  for (const stale of ['Pencil marks must not disappear', `${clause}.`, clause.toLowerCase()]) {
    assert.equal(query.proposalContext({ brief: `${clause}.`, contextResolutions: [{ clause: stale, kind: 'requirement', policyVersion: 2 }] }).unresolvedNegation, true)
  }
})

test('the command line prints JSON, rejects bad input and never consults anything outside the projection', async () => {
  const parsed = parseArguments(['propose', '--brief', 'fix the pipeline', '--technology', 'docker', '--technology', 'python', '--limit', '3'])
  assert.deepEqual(parsed.options.technology, ['docker', 'python'])
  assert.equal(parsed.options.limit, 3)
  assert.throws(() => parseArguments(['search', '--limit', '0']), /--limit/)
  assert.throws(() => parseArguments(['search', '--nope', 'x']), /Unknown option/)
  assert.throws(() => parseArguments(['search', 'docker', '--brief', 'ignored']), /Unknown option/)
  const result = await run(['search', 'docker', 'compose', '--limit', '2'])
  assert.equal(result.results.length, 2)
  await assert.rejects(run(['get', 'no-such-id']), /Unknown id/)
  await assert.rejects(run(['propose']), /needs --brief/)
  await assert.rejects(run(['propose', '--technology', 'no-such-technology']), /Unknown project fact/)
  await assert.rejects(run(['propose', 'ignored', '--brief', 'wiki']), /positional/)
  await assert.rejects(run(['search', 'docker', '--type', 'no-such-type']), /Unknown type/)
  const audited = await run(['propose', '--brief', 'Do not create a project wiki'])
  assert.ok(audited.constraints.excluded.some(item => item.practiceRefs.includes('practice:evidence-wiki')))
  const shorthandNeighbors = await run(['neighbors', 'docker'])
  assert.equal(shorthandNeighbors.ref, 'topic:docker')
  assert.ok(shorthandNeighbors.neighbors.length)
  const ok = spawnSync(process.execPath, [cli, 'search', 'agents.md', '--limit', '1'], { encoding: 'utf8' })
  assert.equal(ok.status, 0, ok.stderr)
  const payload = JSON.parse(ok.stdout)
  assert.equal(payload.command, 'search')
  assert.equal(payload.results[0].ref, 'topic:agents-md')
  const bad = spawnSync(process.execPath, [cli, 'neighbors', 'topic:missing'], { encoding: 'utf8' })
  assert.equal(bad.status, 1)
  assert.match(bad.stderr, /Unknown reference/)
})
