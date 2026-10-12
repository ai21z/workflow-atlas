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

test('search ranks a topic by its own words and explains every match', () => {
  const [first] = query.search('pull request checks on github actions')
  assert.equal(first.ref, 'topic:github-actions')
  assert.ok(first.matched.length >= 3)
  for (const match of first.matched) assert.ok(['title', 'aliases', 'applicability', 'summary', 'body'].includes(match.field))
  assert.equal(first.sourceLine, 'Reviewed 2026-10-12, 14 sources')
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
  assert.equal(sourceLine({ sourceRefs: ['a', 'b'], sourceStatus: 'reviewed', reviewedOn: '2026-10-05' }), 'Reviewed 2026-10-05, 2 sources')
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

test('repeated project facts cannot change rankings, scores or explanations', () => {
  const unique = { brief: 'Implement a scoped change and test it', technologies: ['nodejs', 'docker'], stages: ['implementation', 'verification'], recipe: 'feature-delivery' }
  const repeated = { ...unique, technologies: ['nodejs', 'docker', 'nodejs', 'docker'], stages: ['implementation', 'verification', 'implementation', 'verification'] }
  assert.deepEqual(query.propose(repeated), query.propose(unique))
  for (const item of query.propose(unique, { limit: 50 })) assert.equal(new Set(item.reasons).size, item.reasons.length)
  const directDocker = query.propose({ technologies: ['nodejs', 'docker'], limit: 50 }).find(item => item.ref === 'topic:docker')
  assert.ok(directDocker)
  assert.ok(!directDocker.reasons.some(reason => reason.startsWith('Works with')), 'direct environment evidence takes precedence over a connected seed')
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

test('unsupported or unrecognized negation withholds selectable practice proposals', () => {
  for (const brief of ['The request is not what we expected', 'Avoid flibbertigibbet and implement a scoped change']) {
    assert.equal(query.proposalContext({ brief }).unresolvedNegation, true)
    assert.ok(query.propose({ brief, stages: ['implementation'], limit: 50 }).every(item => !item.selectable))
  }
  const parsed = analyzeBriefConstraints("Fix the tests without Jenkins, but create a source backed project wiki")
  assert.match(parsed.positiveText, /create a source backed project wiki/)
  assert.deepEqual(parsed.exclusions.map(item => item.terms), [['jenkins']])
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
