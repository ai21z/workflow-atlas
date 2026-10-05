import test from 'node:test'
import assert from 'node:assert/strict'
import { CATALOG, createRecipe, selectRecipe, getStages, getUseInstructions, compileSelectedOutput, compileStandaloneSkill } from '../factory/core.mjs'
import { buildProjectAtlas, packageProject, readProjectFiles } from '../factory/portable.mjs'
import { zipFiles } from '../factory/zip.mjs'

const content = (pack, path) => pack.files.find(file => file.path === path)?.content

function skillExports(config, skillId) {
  return [
    { pack: compileSelectedOutput(config, { kind: 'pack' }), prefix: `.github/skills/${skillId}` },
    { pack: compileSelectedOutput(config, { kind: 'skill', skillId }), prefix: `.github/skills/${skillId}` },
    { pack: compileStandaloneSkill(config, skillId), prefix: skillId },
  ]
}

for (const [stageId, skillId] of [['implementation', 'implementation'], ['verification', 'verification']]) {
  test(`supplied-context ${skillId} exports a review procedure in every skill form`, () => {
    const config = createRecipe('feature-delivery')
    config.workflow.enabledStages = [stageId]
    config.workflow.bindings[stageId].contextOnly = true
    const before = structuredClone(config)
    const definition = CATALOG.skills.find(skill => skill.id === skillId)
    for (const { pack, prefix } of skillExports(config, skillId)) {
      const skill = content(pack, `${prefix}/SKILL.md`)
      const reference = content(pack, `${prefix}/references/project.md`)
      const description = JSON.parse(skill.match(/^description: (.*)$/m)[1])
      assert.match(description, /^Review supplied artifacts/)
      assert.match(skill, /Do not perform the underlying work/)
      assert.match(skill, /Request the existing outputs and observed results/)
      assert.match(skill, /Missing evidence remains unresolved/)
      for (const step of definition.steps) assert.ok(!skill.includes(step), `Review-only skill retained active procedure: ${step}`)
      for (const check of definition.checks) assert.ok(skill.includes(check), `Review criteria lost: ${check}`)
      assert.match(reference, /Review supplied artifacts only/)
      assert.equal(pack.validation.formatChecked, true)
      assert.equal(pack.validation.hostExercised, false)
    }
    assert.deepEqual(config, before)
  })
}

test('a skill shared by active and supplied-context stages distinguishes the two procedures', () => {
  const config = createRecipe('feature-delivery')
  config.workflow.enabledStages = ['implementation', 'verification']
  config.workflow.bindings.verification.skills = ['implementation']
  config.workflow.bindings.verification.contextOnly = true
  for (const { pack, prefix } of skillExports(config, 'implementation')) {
    const skill = content(pack, `${prefix}/SKILL.md`)
    const reference = content(pack, `${prefix}/references/project.md`)
    assert.match(skill, /Development\. Agent: Implementer\. Perform the assigned work/)
    assert.match(skill, /Tests and review\. Agent: Implementer, review of supplied artifacts only\. Review supplied artifacts only/)
    assert.match(skill, /## Procedure for active assignments/)
    assert.match(skill, /## Procedure for supplied-context review/)
    for (const step of CATALOG.skills.find(item => item.id === 'implementation').steps) assert.ok(skill.includes(step))
    assert.match(reference, /Do not perform the underlying work/)
    assert.equal(pack.validation.formatChecked, true)
  }
})

test('human and external skill assignments ignore a dormant agent context flag', () => {
  for (const actorType of ['human', 'external']) {
    const config = createRecipe('feature-delivery')
    config.workflow.enabledStages = ['implementation']
    Object.assign(config.workflow.bindings.implementation, { actorType, actorId: '', actorName: 'Named owner', contextOnly: true })
    for (const { pack, prefix } of skillExports(config, 'implementation')) {
      const skill = content(pack, `${prefix}/SKILL.md`)
      assert.match(skill, /The named person or external system performs this stage/)
      assert.doesNotMatch(skill, /## Procedure for supplied-context review/)
      for (const step of CATALOG.skills.find(item => item.id === 'implementation').steps) assert.ok(skill.includes(step))
      assert.equal(pack.validation.formatChecked, true)
    }
  }
})

test('an unassigned library skill remains reusable without inheriting disabled stage restrictions', () => {
  const config = createRecipe('feature-delivery')
  config.workflow.enabledStages = ['requirements']
  config.workflow.bindings.implementation.contextOnly = true
  config.skills.push('implementation')
  for (const { pack, prefix } of skillExports(config, 'implementation')) {
    const skill = content(pack, `${prefix}/SKILL.md`)
    assert.match(skill, /Additional library skill\. No workflow stage assignment was selected/)
    assert.match(skill, /Confirm the task, responsible actor and permitted scope before using this procedure/)
    assert.doesNotMatch(skill, /## Procedure for supplied-context review/)
    for (const step of CATALOG.skills.find(item => item.id === 'implementation').steps) assert.ok(skill.includes(step))
  }
})
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

test('human blueprints omit agent authoring prose without changing saved choices or portable skills', () => {
  const config = createRecipe('feasibility')
  config.runtime.enabled = true
  for (const binding of Object.values(config.workflow.bindings)) Object.assign(binding, { actorType: 'human', actorId: '', actorName: 'Study owner' })
  config.practices.push('evidence-wiki')
  const before = structuredClone(config)
  const blueprint = compileSelectedOutput(config, { kind: 'blueprint' })
  for (const path of ['WORKFLOW.md', 'SOURCES.md']) {
    assert.doesNotMatch(content(blueprint, path), /Put reusable task guidance in skills|Keep agent profiles focused|avoid copying the entire Atlas into prompts/)
    assert.match(content(blueprint, path), /Keep original sources available/)
  }
  assert.doesNotMatch(content(blueprint, 'SOURCES.md'), /Custom agent authoring|GitHub custom agent configuration/)
  assert.doesNotMatch(content(blueprint, 'RUNTIME-DESIGN.md'), /Copilot profiles in this pack/)
  assert.match(content(blueprint, 'RUNTIME-DESIGN.md'), /when used/)
  assert.ok(!blueprint.files.some(file => file.path.startsWith('.github/')))
  assert.deepEqual(JSON.parse(content(blueprint, 'project.json')), before)
  const pack = compileSelectedOutput(config, { kind: 'pack' })
  assert.match(content(pack, '.github/skills/feasibility-analysis/SKILL.md'), /Put reusable task guidance in skills/)
  assert.match(content(pack, 'SOURCES.md'), /GitHub custom agent configuration/)
  const standalone = compileStandaloneSkill(config, 'feasibility-analysis')
  assert.match(content(standalone, 'feasibility-analysis/SKILL.md'), /Keep agent profiles focused/)
  config.workflow.bindings.options = { actorType: 'agent', actorId: 'analyst', actorName: '', skills: ['feasibility-analysis'], contextOnly: false }
  assert.match(content(compileSelectedOutput(config, { kind: 'blueprint' }), 'WORKFLOW.md'), /Put reusable task guidance in skills/)
})

for (const example of cases) {
  test(`${example.recipe}: decision and evaluation retain supplied context without inventing structured results`, () => {
    const config = createRecipe(example.recipe)
    config.project.purpose = example.purpose
    config.workflow.answers = { ...example.answers }
    const decisionStage = { 'feature-delivery': 'architecture', bugfix: 'diagnosis', feasibility: 'recommendation' }[example.recipe]
    const evaluationStage = { 'feature-delivery': 'verification', bugfix: 'regression', feasibility: 'experiment-plan' }[example.recipe]
    const decisionNote = 'Compare browser and server options only after inspecting the real constraints.\n```text\nNo approved choice.\n```'
    const evaluationNote = 'Include contradictory references and preserve Unicode, commas and newlines. Expected thresholds remain unresolved.'
    config.workflow.notes[decisionStage] = decisionNote
    config.workflow.notes[evaluationStage] = evaluationNote
    config.constraints.notes = 'The PM owns the build decision. Confirm the named person before approval.'
    Object.assign(config.workflow.bindings[decisionStage], { actorType: 'human', actorId: '', actorName: '[PM](javascript:alert)' })
    const before = structuredClone(config)
    const compiled = compileSelectedOutput(config, { kind: 'blueprint' })
    const decision = content(compiled, 'templates/DECISION.md')
    const evaluation = content(compiled, 'templates/EVALUATION.md')
    for (const document of [decision, evaluation]) {
      for (const text of Object.values(example.answers)) assert.ok(document.includes(text), `Omitted supplied intent: ${text}`)
      assert.ok(document.includes(config.constraints.notes))
      assert.match(document, /Supplied context/)
    }
    assert.ok(decision.includes(decisionNote))
    assert.ok(evaluation.includes(evaluationNote))
    assert.doesNotMatch(decision, /\[PM\]\(javascript:/)
    assert.match(decision, /Planned responsibility: Person:/)
    assert.match(decision, /do not establish decision authority or approval/)
    assert.match(decision, /Named decision owner: \[UNRESOLVED: name and decision authority\]/)
    assert.match(decision, /Acceptance date: \[UNRESOLVED: date, if accepted\]/)
    assert.match(decision, /Next action: \[UNRESOLVED: follow up/)
    assert.match(decision, /\| \[UNRESOLVED\] \| \[UNRESOLVED\] \| \[UNRESOLVED\] \| \[UNRESOLVED\] \|/)
    assert.ok(evaluation.split('\n').filter(line => line.startsWith('| ') && line.includes('[UNRESOLVED]')).every(line => line.includes('[NOT RUN]')))
    assert.equal(compiled.validation.formatChecked, true)
    assert.deepEqual(config, before)
  })
}

test('working templates exclude previous recipe answers and inactive stage notes', () => {
  const config = selectRecipe(createRecipe('feature-delivery'), 'bugfix')
  config.workflow.answers.acceptance = 'STALE feature acceptance'
  config.workflow.notes.architecture = 'STALE architecture note'
  config.workflow.notes.diagnosis = 'CURRENT diagnosis note'
  config.workflow.notes.regression = 'DISABLED regression note'
  config.workflow.enabledStages = ['diagnosis']
  config.workflow.suppliedInputs.reproduction = 'evidence/reproduction.md'
  config.runtime.enabled = true
  const compiled = compileSelectedOutput(config, { kind: 'blueprint' })
  for (const path of ['templates/DECISION.md', 'templates/EVALUATION.md']) assert.doesNotMatch(content(compiled, path), /STALE|DISABLED/)
  assert.match(content(compiled, 'templates/DECISION.md'), /CURRENT diagnosis note/)
  assert.match(content(compiled, 'templates/DECISION.md'), /evidence\/reproduction\.md/)
})

test('selective reading routes lead only to included files across recipes and output scopes', () => {
  for (const example of cases) {
    const config = createRecipe(example.recipe)
    for (const selection of [{ kind: 'blueprint' }, { kind: 'skill', skillId: example.skill }, { kind: 'pack' }]) {
      const compiled = compileSelectedOutput(config, selection)
      const guide = getUseInstructions(config, selection)
      const installed = content(compiled, 'INSTALL.md')
      assert.ok(guide.reading.length >= 1 && guide.reading.length <= 3)
      assert.match(installed, /Read only what you need/)
      for (const route of guide.reading) {
        assert.ok(route.purpose.length > 0)
        assert.ok(route.paths.length >= 1 && route.paths.length <= 3)
        for (const path of route.paths) {
          assert.ok(compiled.files.some(file => file.path === path), `${selection.kind} reading route refers to absent ${path}`)
          assert.ok(installed.includes(`[${path}](${path})`))
        }
      }
      assert.equal(compiled.validation.formatChecked, true)
      if (selection.kind === 'pack') {
        const expectedProfiles = [...new Set(getStages(config).filter(stage => config.workflow.enabledStages.includes(stage.id) && config.workflow.bindings[stage.id].actorType === 'agent').map(stage => `.github/agents/${config.workflow.bindings[stage.id].actorId}.agent.md`))]
        const offeredPaths = guide.reading.flatMap(route => route.paths)
        for (const path of expectedProfiles) assert.ok(offeredPaths.includes(path), `Reading route omitted assigned profile ${path}`)
      }
      if (selection.kind === 'skill') {
        assert.deepEqual(guide.reading[0].paths, [`.github/skills/${example.skill}/SKILL.md`])
        assert.ok(guide.reading[1].paths.includes(`.github/skills/${example.skill}/references/project.md`))
        assert.doesNotMatch(installed, /\[WORKFLOW.md\]|custom agent selector/)
      }
    }
  }
  const config = createRecipe('bugfix')
  config.workflow.enabledStages = ['reproduction']
  const selection = { kind: 'blueprint' }
  const guide = getUseInstructions(config, selection)
  assert.deepEqual(guide.reading[1].paths, ['templates/REQUIREMENTS.md'])
  const compiled = compileSelectedOutput(config, selection)
  assert.ok(!compiled.files.some(file => file.path === 'templates/DECISION.md'))
  for (const route of guide.reading) for (const path of route.paths) assert.ok(compiled.files.some(file => file.path === path))
})

test('adoption keeps pack paths at the repository root and project records outside a focused skill', () => {
  const config = createRecipe('feature-delivery')
  config.project.host = 'vscode'
  for (const selection of [{ kind: 'skill', skillId: 'impact-analysis' }, { kind: 'pack' }]) {
    const pack = compileSelectedOutput(config, selection)
    const placement = getUseInstructions(config, selection).steps.find(step => step.title === 'Place the files').body
    assert.ok(content(pack, 'INSTALL.md').includes(placement))
    assert.doesNotMatch(placement, /Copy the selected files to/)
    if (selection.kind === 'skill') {
      assert.match(placement, /Copy only the complete exported \.github\/skills\/impact-analysis\/ directory to that same path at the repository root/)
      assert.match(placement, /SKILL\.md and references\/project\.md/)
      assert.match(placement, /Keeping those records is optional for installing the skill/)
      assert.match(placement, /project and adoption records outside the skill directory/)
      assert.ok(pack.files.some(file => file.path === '.github/skills/impact-analysis/SKILL.md'))
      assert.ok(pack.files.some(file => file.path === '.github/skills/impact-analysis/references/project.md'))
      assert.ok(pack.files.some(file => file.path === 'project.json'))
    } else {
      assert.match(placement, /preserving every exported path relative to the repository root/)
      assert.match(placement, /WORKFLOW\.md, VALIDATION\.md and the other root records at the repository root/)
      for (const path of ['.github/agents/analyst.agent.md', '.github/skills/impact-analysis/SKILL.md', 'WORKFLOW.md', 'VALIDATION.md']) {
        assert.ok(pack.files.some(file => file.path === path), path)
      }
    }
  }
})

test('mixed role execution limits reach its profile and every active implementation skill reference', () => {
  const config = createRecipe('bugfix')
  config.project.host = 'vscode'
  config.workflow.enabledStages = ['bug-fix', 'regression']
  config.workflow.bindings.regression.contextOnly = true
  config.workflow.suppliedInputs.diagnosis = 'sources/diagnosis.md'
  const original = structuredClone(config)
  const pack = compileSelectedOutput(config, { kind: 'pack' })
  const profile = content(pack, '.github/agents/implementer.agent.md')
  assert.match(profile, /Implementer reviews Verify the repair from supplied evidence only and has no active assigned execution stage/)
  assert.match(profile, /Do not run syntax checks, tests, lint checks or builds, including as a side effect of active implementation/)
  assert.match(profile, /Request missing results from the responsible person or external system/)
  assert.match(profile, /These instructions do not enforce host permissions/)
  assert.deepEqual(JSON.parse(profile.match(/^tools: (.*)$/m)[1]), config.agents.find(agent => agent.role === 'implementer').tools)
  assert.match(profile, /^target: "vscode"$/m)
  for (const { pack: output, prefix } of skillExports(config, 'implementation')) {
    const reference = content(output, `${prefix}/references/project.md`)
    assert.match(reference, /## Command scope across assigned stages/)
    assert.match(reference, /Implementer reviews Verify the repair from supplied evidence only and has no active assigned execution stage/)
    assert.match(reference, /Do not run syntax checks, tests, lint checks or builds, including as a side effect of active implementation/)
    assert.match(reference, /leave unobserved checks unresolved/)
    assert.equal(output.validation.formatChecked, true)
  }
  assert.deepEqual(config, original)
})

test('cross-stage execution limits do not block an active execution stage or borrow another role assignment', () => {
  for (const variant of ['active-regression', 'active-reproduction', 'other-role-review', 'disabled-review']) {
    const config = createRecipe('bugfix')
    config.project.host = 'vscode'
    config.workflow.enabledStages = ['bug-fix', 'regression']
    config.workflow.suppliedInputs.diagnosis = 'sources/diagnosis.md'
    config.workflow.bindings.regression.contextOnly = true
    if (variant === 'active-regression') config.workflow.bindings.regression.contextOnly = false
    if (variant === 'active-reproduction') config.workflow.enabledStages.unshift('reproduction')
    if (variant === 'other-role-review') config.workflow.bindings.regression.actorId = 'reviewer'
    if (variant === 'disabled-review') config.workflow.enabledStages = ['bug-fix']
    const pack = compileSelectedOutput(config, { kind: 'pack' })
    const profile = content(pack, '.github/agents/implementer.agent.md')
    assert.doesNotMatch(profile, /## Command scope across assigned stages/, variant)
    for (const { pack: output, prefix } of skillExports(config, 'implementation')) {
      assert.doesNotMatch(content(output, `${prefix}/references/project.md`), /## Command scope across assigned stages/, variant)
    }
    if (variant === 'active-regression') {
      assert.match(content(pack, '.github/skills/verification/SKILL.md'), /Run only the relevant supplied commands when execution is available and authorized/)
      assert.match(profile, /Verify the repair: Check the failing case and relevant neighboring behavior/)
    }
  }
})

test('context-only workflow actions review supplied evidence instead of executing the producer work', () => {
  const config = createRecipe('bugfix')
  config.workflow.enabledStages = ['bug-fix', 'regression']
  config.workflow.bindings.regression.contextOnly = true
  config.workflow.notes.regression = 'Earlier brief: run tests after the repair.'
  const definition = getStages(config).find(stage => stage.id === 'regression')
  const workflow = content(compileSelectedOutput(config, { kind: 'pack' }), 'WORKFLOW.md')
  const review = workflow.split('### Verify the repair\n')[1].split('\n## Project components')[0]
  const actions = review.split('\nActions:\n')[1].split('\nExpected producer outputs and handoff:')[0]
  assert.match(actions, /Inspect only the supplied artifacts and attribute observations to their source/)
  assert.match(actions, /Do not perform the underlying work or run its commands to fill evidence gaps/)
  for (const action of definition.actions) assert.ok(!actions.includes(action), action)
  assert.match(review, /Review criteria for supplied evidence/)
  for (const criterion of definition.checks) assert.ok(review.includes(criterion), criterion)
  for (const output of definition.outputs) assert.ok(review.includes(output), output)
  assert.match(review, /current recorded assignment takes priority over older stage notes or briefs/)
  assert.match(review, /Report conflicting scope instructions and request clarification before expanding the assignment/)
  assert.ok(review.includes(config.workflow.notes.regression))
  config.workflow.bindings.regression.contextOnly = false
  const active = content(compileSelectedOutput(config, { kind: 'pack' }), 'WORKFLOW.md').split('### Verify the repair\n')[1].split('\n## Project components')[0]
  for (const action of definition.actions) assert.ok(active.includes(action), action)
  assert.doesNotMatch(active, /Expected producer outputs and handoff|Review criteria for supplied evidence|Inspect only the supplied artifacts/)
})
