import test from 'node:test'
import assert from 'node:assert/strict'
import { GOAL_STARTERS, createGoalProject } from '../factory/starter-goals.mjs'
import { CATALOG, compileSelectedOutput, createRecipe, getStages, parseImport, serializeProject, validate } from '../factory/core.mjs'
import { getIntentAnswer } from '../factory/intent.mjs'
import { resolveWorkflowProcesses } from '../factory/workflow-model.mjs'

const file = (pack, path) => pack.files.find(item => item.path === path)?.content

test('ready goals use supported recipes and their own supported stage notes', () => {
  assert.equal(GOAL_STARTERS.length, 10)
  assert.equal(new Set(GOAL_STARTERS.map(goal => goal.id)).size, GOAL_STARTERS.length)
  assert.deepEqual([...new Set(GOAL_STARTERS.map(goal => goal.group))], ['Build and improve', 'Repair and verify', 'Explore and plan'])
  for (const goal of GOAL_STARTERS) {
    assert.ok(CATALOG.recipes.some(recipe => recipe.id === goal.recipeId), goal.id)
    assert.deepEqual(Object.keys(goal.stageNotes).sort(), getStages(goal.recipeId).map(stage => stage.id).sort(), goal.id)
    assert.ok(goal.label && goal.description && goal.purpose, goal.id)
  }
  assert.equal(GOAL_STARTERS.find(goal => goal.id === 'repair-pipeline').recipeId, 'bugfix')
  assert.equal(GOAL_STARTERS.find(goal => goal.id === 'plan-ai-workflow').recipeId, 'feasibility')
  assert.equal(new Set(GOAL_STARTERS.map(goal => goal.purpose)).size, GOAL_STARTERS.length)
})

for (const goal of GOAL_STARTERS) {
  test(`${goal.id}: editable draft preserves planning guidance through projection and both exports`, () => {
    const config = createGoalProject(goal.id)
    const validation = validate(config)
    assert.equal(validation.issues.some(issue => issue.code === 'schema'), false)
    assert.equal(validation.formatChecked, true)
    assert.equal(validation.configurationComplete, false)
    assert.equal(validation.hostExercised, false)
    assert.deepEqual(parseImport(serializeProject(config)), config)
    assert.equal(config.project.name, goal.label)
    assert.equal(config.project.purpose, goal.purpose)
    assert.deepEqual(config.workflow.notes, goal.stageNotes)
    const [process] = resolveWorkflowProcesses(config)
    assert.deepEqual(process.steps.map(step => step.id), getStages(goal.recipeId).map(stage => stage.id))
    for (const step of process.steps) assert.equal(step.notes, goal.stageNotes[step.id])
    const firstStageId = config.workflow.enabledStages[0]
    config.workflow.notes[firstStageId] += '\nMy scope. Confirm the owner before proceeding.'
    config.project.purpose += ' Keep my recorded decision.'
    const before = structuredClone(config)
    for (const kind of ['blueprint', 'pack']) {
      const pack = compileSelectedOutput(config, { kind })
      const workflow = file(pack, 'WORKFLOW.md')
      assert.ok(workflow.includes(config.project.purpose), `${kind}: purpose`)
      for (const note of Object.values(config.workflow.notes)) assert.ok(workflow.includes(note), `${kind}: planning note`)
      assert.deepEqual(parseImport(file(pack, 'project.json')), config)
      const manifest = JSON.parse(file(pack, 'manifest.json'))
      assert.equal(manifest.recipe, goal.recipeId)
      assert.equal(manifest.kind, kind)
      assert.equal(manifest.draft, true)
      assert.equal(manifest.validation.behaviorObserved, false)
      assert.equal(manifest.validation.improvementEstablished, false)
      assert.equal(pack.validation.formatChecked, true)
      assert.match(file(pack, 'EVIDENCE.md'), /No observed evidence supplied/)
      assert.match(file(pack, 'PROJECT-FACTS.md'), /No project facts recorded/)
    }
    assert.deepEqual(config, before)
  })
}

test('ready goals leave project setup and acceptance evidence unresolved', () => {
  for (const goal of GOAL_STARTERS) {
    const config = createGoalProject(goal.id)
    const baseline = createRecipe(goal.recipeId)
    assert.equal(config.project.host, '')
    assert.equal(config.project.sourceControl, '')
    assert.equal(config.project.sourceLocations, '')
    assert.deepEqual(config.components, baseline.components)
    assert.deepEqual(config.workflow.answers, {})
    assert.deepEqual(config.workflow.suppliedInputs, {})
    assert.deepEqual(config.facts, [])
    assert.deepEqual(config.evidence, [])
    assert.deepEqual(config.model, baseline.model)
    assert.deepEqual(config.constraints, baseline.constraints)
    for (const id of ['expected', 'observed', 'impact', 'acceptance', 'affected', 'current-work', 'decision-boundary']) {
      assert.equal(getIntentAnswer(config, id).source, 'unresolved', `${goal.id}/${id}`)
    }
    assert.equal(config.runtime.enabled, goal.id === 'plan-ai-workflow')
    assert.equal(config.runtime.outcome, goal.id === 'plan-ai-workflow' ? goal.purpose : '')
    for (const key of ['requiredInputs', 'judgment', 'tools', 'validation', 'limits', 'duplicates', 'failures', 'confirmation']) assert.equal(config.runtime[key], '', `${goal.id}/${key}`)
    assert.deepEqual(config.runtime.controls, [])
  }
})

test('goal drafts and source definitions are isolated from later edits', () => {
  const before = JSON.stringify(GOAL_STARTERS)
  const first = createGoalProject('plan-ai-workflow')
  const second = createGoalProject('plan-ai-workflow')
  first.project.purpose = 'My change'
  first.workflow.notes.options = 'My option'
  first.workflow.bindings.options.skills.push('verification')
  first.runtime.controls.push({ id: 'draft-only' })
  assert.equal(JSON.stringify(GOAL_STARTERS), before)
  assert.equal(second.project.purpose, GOAL_STARTERS.find(goal => goal.id === 'plan-ai-workflow').purpose)
  assert.notEqual(first.workflow.notes.options, second.workflow.notes.options)
  assert.equal(second.workflow.bindings.options.skills.includes('verification'), false)
  assert.deepEqual(second.runtime.controls, [])
  assert.equal(Object.isFrozen(GOAL_STARTERS), true)
  assert.equal(Object.isFrozen(GOAL_STARTERS[0].stageNotes), true)
  assert.throws(() => { GOAL_STARTERS[0].stageNotes.requirements = 'Changed shared definition' }, TypeError)
})

test('unsupported ready goals fail without choosing a different workflow', () => {
  for (const id of [undefined, null, '', 'other-goal', '__proto__', {}, 1]) {
    assert.throws(() => createGoalProject(id), /Choose a supported ready goal/)
  }
})
