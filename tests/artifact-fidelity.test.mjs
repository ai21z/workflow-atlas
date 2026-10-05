import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOG, createRecipe, selectRecipe, getStages, compileSelectedOutput, compileStandaloneSkill } from '../factory/core.mjs'
import { buildProjectAtlas, packageProject, readProjectFiles } from '../factory/portable.mjs'
import { zipFiles } from '../factory/zip.mjs'

const content = (pack, path) => pack.files.find(file => file.path === path)?.content
const cases = [
  { recipe: 'feature-delivery', purpose: 'Add CSV export for the current filtered rows.', skill: 'requirement-refinement', answers: { 'user-need': 'Finance needs the displayed rows, not the entire dataset.', acceptance: 'An empty filter returns a header-only CSV.\nKeep the displayed column order.', affected: 'The report screen and its existing read API.' } },
  { recipe: 'bugfix', purpose: 'Repair a saved search that loses its optional filter.', skill: 'bug-diagnosis', answers: { expected: 'The optional filter remains after reopening.', observed: 'At revision abc123, reopen drops the filter when no dates were selected.', impact: 'Users who reopen a saved search without dates.' } },
  { recipe: 'feasibility', purpose: 'Decide whether reference documents can become a guided configuration service.', skill: 'feasibility-analysis', answers: { 'current-work': 'An engineer reviews the references and every resulting configuration.', 'desired-outcome': 'Give the PM a decision supported by effort, cost and output quality evidence.', 'decision-boundary': 'Do not approve a build until the comparison is reviewed.' } },
]

for (const example of cases) {
  test(`${example.recipe}: each output preserves confirmed intent and round-trips without inventing setup`, async () => {
    const config = createRecipe(example.recipe)
    config.project.name = 'Intent fidelity review'
    config.project.purpose = example.purpose
    config.workflow.answers = { ...example.answers }
    const stage = getStages(config).find(stage => config.workflow.bindings[stage.id].skills.includes(example.skill))
    config.workflow.notes[stage.id] = 'Keep the current authorization rules. Ask the owner about any ambiguity.'
    const before = structuredClone(config)
    for (const selection of [{ kind: 'blueprint' }, { kind: 'skill', skillId: example.skill }, { kind: 'pack' }]) {
      const compiled = compileSelectedOutput(config, selection)
      const effective = selection.kind === 'skill'
        ? content(compiled, `.github/skills/${example.skill}/references/project.md`)
        : content(compiled, 'WORKFLOW.md')
      for (const text of [example.purpose, ...Object.values(example.answers), config.workflow.notes[stage.id]]) assert.ok(effective.includes(text), `${selection.kind} omitted ${text}`)
      assert.equal(compiled.validation.hostExercised, false)
      assert.equal(compiled.validation.formatChecked, true)
      assert.ok(!compiled.files.some(file => /mcp\.json$/i.test(file.path)))
      assert.doesNotMatch(effective, /npm test|\.\/mvnw test|Jira|Jenkins/)
      if (selection.kind === 'skill') assert.equal(compiled.files.some(file => file.path.endsWith('.agent.md')), false)
      if (selection.kind === 'blueprint') assert.equal(compiled.files.some(file => file.path.startsWith('.github/')), false)
      const packaged = packageProject(config, compiled)
      const reopened = await readProjectFiles([new File([zipFiles(packaged.files)], 'workflow.zip')])
      assert.deepEqual(reopened.config, before)
      assert.deepEqual(reopened.files.find(file => file.path === 'project.json')?.content, content(compiled, 'project.json'))
    }
    const requirements = content(compileSelectedOutput(config, { kind: 'blueprint' }), 'templates/REQUIREMENTS.md')
    for (const text of Object.values(example.answers)) assert.ok(requirements.includes(text), `Requirement scaffold omitted ${text}`)
    assert.match(requirements, /UNRESOLVED: source location and revision/)
    assert.deepEqual(config, before)
  })
}

test('portable skill carries only current recipe intent and assigned stage context as literal data', () => {
  const feature = createRecipe('feature-delivery')
  feature.workflow.answers.acceptance = 'An old feature acceptance that must stay out of this bug diagnosis.'
  const config = selectRecipe(feature, 'bugfix')
  config.workflow.answers.expected = 'Keep **literal** input.\n```text\nA | B\n```'
  config.workflow.answers.observed = 'Only A appears.'
  config.workflow.enabledStages = ['diagnosis']
  config.workflow.suppliedInputs.reproduction = 'evidence/reproduction.md'
  config.workflow.notes.diagnosis = 'Investigate both branches.'
  config.workflow.notes['bug-fix'] = 'Unselected stage note.'
  Object.assign(config.workflow.bindings.diagnosis, { actorType: 'human', actorId: '', actorName: '[Owner](javascript:alert) <reviewer>' })
  const pack = compileStandaloneSkill(config, 'bug-diagnosis')
  const reference = content(pack, 'bug-diagnosis/references/project.md')
  assert.ok(reference.includes(config.workflow.answers.expected))
  assert.ok(reference.includes(config.workflow.answers.observed))
  assert.match(reference, /evidence\/reproduction\.md/)
  assert.match(reference, /Investigate both branches/)
  assert.ok(!reference.includes(feature.workflow.answers.acceptance))
  assert.doesNotMatch(reference, /Unselected stage note/)
  assert.equal(pack.validation.formatChecked, true)
  assert.doesNotMatch(content(pack, 'bug-diagnosis/SKILL.md'), /\[Owner\]\(javascript:/)
  assert.doesNotMatch(reference, /\[Owner\]\(javascript:/)
})

test('exported Atlas displays the same inherited or explicit outcome as the workflow', () => {
  for (const recipe of ['feature-delivery', 'feasibility']) {
    const config = createRecipe(recipe)
    config.project.purpose = 'The outcome already described in the opening brief.'
    const questionId = recipe === 'feasibility' ? 'desired-outcome' : 'user-need'
    const label = CATALOG.recipes.find(item => item.id === recipe).questions.find(item => item.id === questionId).label
    const html = buildProjectAtlas(config, compileSelectedOutput(config, { kind: 'blueprint' }))
    const decisions = html.slice(html.indexOf('<section class="pane" id="decisions"'), html.indexOf('<section class="pane" id="evidence"'))
    assert.ok(decisions.includes(`<h3>${label}</h3><p class="muted">Uses the recorded project outcome.</p><p class="preserve">${config.project.purpose}</p>`))
    config.workflow.answers[questionId] = 'An explicit updated outcome.'
    const explicit = buildProjectAtlas(config, compileSelectedOutput(config, { kind: 'blueprint' }))
    const explicitDecisions = explicit.slice(explicit.indexOf('<section class="pane" id="decisions"'), explicit.indexOf('<section class="pane" id="evidence"'))
    assert.ok(explicitDecisions.includes(config.workflow.answers[questionId]))
    assert.doesNotMatch(explicitDecisions, /Uses the recorded project outcome/)
  }
})

test('portable viewer includes an accessible dark mode switch without external resources', () => {
  const config = createRecipe('feasibility')
  const html = buildProjectAtlas(config, compileSelectedOutput(config, { kind: 'blueprint' }))
  assert.match(html, /id="viewer-theme"[^>]*role="switch"[^>]*aria-label="Dark mode"[^>]*aria-checked="false"/)
  assert.match(html, /setAttribute\('aria-checked', String\(theme === 'dark'\)\)/)
  assert.match(html, /prefers-reduced-motion: reduce/)
  assert.match(html, /forced-colors: active/)
  assert.doesNotMatch(html, /<script[^>]+src=|<link[^>]+href=/)
})
