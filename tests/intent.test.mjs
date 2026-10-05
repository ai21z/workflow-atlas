import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecipe, selectRecipe, serializeProject, parseImport, compile, validate } from '../factory/core.mjs'
import { getIntentAnswer } from '../factory/intent.mjs'
import { getDecisionBrief, renderDecisionBrief } from '../factory/decision-brief.mjs'

test('the project outcome supplies the equivalent feature and study answer without duplicating stored data', () => {
  for (const [recipe, question] of [['feature-delivery', 'user-need'], ['feasibility', 'desired-outcome']]) {
    const config = createRecipe(recipe)
    config.project.purpose = '  Let people save a search.\r\nKeep the entered words.  '
    const before = serializeProject(config)
    assert.deepEqual(getIntentAnswer(config, question), { text: config.project.purpose, source: 'project-outcome', sourcePath: 'project.purpose', inherited: true })
    assert.ok(!getDecisionBrief(config).unresolved.some(item => item.path === `workflow.answers.${question}`))
    assert.match(renderDecisionBrief(config), /Uses your project outcome/)
    assert.equal(serializeProject(config), before)
  }
})

test('explicit intent answers take priority and remain distinct from the project outcome', () => {
  const config = createRecipe('feature-delivery')
  config.project.purpose = 'Ship a saved search feature.'
  config.workflow.answers['user-need'] = '  People need to repeat a search without rebuilding its filters.  '
  assert.deepEqual(getIntentAnswer(config, 'user-need'), { text: config.workflow.answers['user-need'], source: 'answer', sourcePath: 'workflow.answers.user-need', inherited: false })
  assert.equal(getDecisionBrief(config).outcome.text, config.project.purpose)
  assert.match(renderDecisionBrief(config), /People need to repeat a search/)
  assert.doesNotMatch(renderDecisionBrief(config), /Uses your project outcome/)
})

test('whitespace is absent for completeness but remains unchanged in the project record', () => {
  const config = createRecipe('feature-delivery')
  config.workflow.answers['user-need'] = ' \r\n\t '
  config.project.purpose = 'Supplied result'
  const before = serializeProject(config)
  assert.equal(getIntentAnswer(config, 'user-need').text, 'Supplied result')
  assert.equal(serializeProject(config), before)
  config.project.purpose = ' \n '
  assert.equal(getIntentAnswer(config, 'user-need').source, 'unresolved')
  const brief = getDecisionBrief(config)
  assert.equal(brief.unresolved.filter(item => item.path === 'project.purpose' || item.path === 'workflow.answers.user-need').length, 1)
})

test('a repair purpose does not invent expected behavior or answer other missing questions', () => {
  const config = createRecipe('bugfix')
  config.project.purpose = 'Investigate and fix the checkout error.'
  for (const id of ['expected', 'observed', 'impact', 'user-need', 'desired-outcome']) assert.equal(getIntentAnswer(config, id).source, 'unresolved')
  assert.ok(getDecisionBrief(config).unresolved.some(item => item.path === 'workflow.answers.expected'))
  config.workflow.answers.expected = 'An accepted payment should create exactly one order.'
  assert.equal(getIntentAnswer(config, 'expected').text, config.workflow.answers.expected)
  assert.equal(getIntentAnswer(config, 'expected').source, 'answer')
})

test('recipe changes preserve explicit answers and limit inherited outcomes to the active recipe', () => {
  const config = createRecipe('feature-delivery')
  config.project.purpose = 'Investigate whether saved searches would help.'
  config.workflow.answers['user-need'] = 'A recorded feature need'
  const study = selectRecipe(config, 'feasibility')
  assert.equal(getIntentAnswer(study, 'desired-outcome').source, 'project-outcome')
  assert.equal(getIntentAnswer(study, 'user-need').text, 'A recorded feature need')
  const bug = selectRecipe(study, 'bugfix')
  assert.equal(getIntentAnswer(bug, 'expected').source, 'unresolved')
  assert.equal(getIntentAnswer(bug, 'desired-outcome').source, 'unresolved')
  assert.equal(getIntentAnswer(selectRecipe(bug, 'feature-delivery'), 'user-need').text, 'A recorded feature need')
})

test('project round trips preserve raw answers and inherited presentation, including hostile text', () => {
  const config = createRecipe('feasibility')
  config.project.purpose = '<img src=x onerror=alert(1)>\nInvestigate this outcome.'
  config.workflow.answers['desired-outcome'] = '   '
  const reopened = parseImport(serializeProject(config))
  assert.equal(serializeProject(reopened), serializeProject(config))
  assert.deepEqual(getIntentAnswer(reopened, 'desired-outcome'), getIntentAnswer(config, 'desired-outcome'))
  assert.match(renderDecisionBrief(reopened), /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(renderDecisionBrief(reopened), /<img src=x/)
})

test('validation and workflow exports resolve only the equivalent outcome question with explicit provenance', () => {
  for (const [recipe, question, other] of [['feature-delivery', 'user-need', 'acceptance'], ['feasibility', 'desired-outcome', 'decision-boundary']]) {
    const config = createRecipe(recipe)
    config.project.purpose = '  An entered outcome.\nIt stays verbatim.  '
    const before = serializeProject(config)
    const issues = validate(config).issues
    assert.ok(!issues.some(issue => issue.code === 'unanswered-question' && issue.path === `workflow.answers.${question}`))
    assert.ok(issues.some(issue => issue.code === 'unanswered-question' && issue.path === `workflow.answers.${other}`))
    const workflow = compile(config).files.find(file => file.path === 'WORKFLOW.md').content
    assert.match(workflow, /Uses the recorded project outcome/)
    assert.ok(workflow.includes(config.project.purpose))
    assert.equal(serializeProject(config), before)
    config.workflow.answers[question] = 'A separate and more specific recorded answer.'
    const refined = compile(config).files.find(file => file.path === 'WORKFLOW.md').content
    assert.ok(refined.includes(config.workflow.answers[question]))
    assert.doesNotMatch(refined, /Uses the recorded project outcome/)
  }
  const bug = createRecipe('bugfix')
  bug.project.purpose = 'Repair a checkout error.'
  assert.ok(validate(bug).issues.some(issue => issue.code === 'unanswered-question' && issue.path === 'workflow.answers.expected'))
  assert.doesNotMatch(compile(bug).files.find(file => file.path === 'WORKFLOW.md').content, /Uses the recorded project outcome/)
})

test('an inherited answer follows the outcome until an explicit refinement is supplied', () => {
  const config = createRecipe('feature-delivery')
  config.project.purpose = 'Initial outcome'
  assert.equal(getIntentAnswer(config, 'user-need').text, 'Initial outcome')
  config.project.purpose = 'Changed outcome'
  assert.equal(getIntentAnswer(config, 'user-need').text, 'Changed outcome')
  config.workflow.answers['user-need'] = 'More specific need'
  config.project.purpose = 'Another changed outcome'
  assert.equal(getIntentAnswer(config, 'user-need').text, 'More specific need')
  config.workflow.answers['user-need'] = ''
  assert.equal(getIntentAnswer(config, 'user-need').text, 'Another changed outcome')
})
