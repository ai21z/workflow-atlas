import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecipe, createExample, compile, serializeProject } from '../factory/core.mjs'
import { getDecisionBrief, renderDecisionBrief } from '../factory/decision-brief.mjs'
import { renderProjectView } from '../factory/project-view.mjs'
import { buildProjectAtlas, packageProject, readProjectFiles } from '../factory/portable.mjs'
import { zipFiles } from '../factory/zip.mjs'

test('a blank brief identifies missing choices without inventing an approach or changing the project', () => {
  const config = createRecipe('feasibility')
  const before = serializeProject(config)
  const brief = getDecisionBrief(config)
  assert.equal(brief.outcome.text, '')
  assert.deepEqual(brief.approach.records, [])
  assert.ok(brief.unresolved.some(item => item.path === 'workflow.notes.options'))
  assert.match(renderDecisionBrief(config), /No approach or reason recorded yet/)
  assert.equal(serializeProject(config), before)
})

test('current-process and requirement context are not relabeled as an approach or reason', () => {
  for (const [recipe, stage] of [['feasibility', 'current-process'], ['feature-delivery', 'requirements'], ['bugfix', 'reproduction']]) {
    const config = createRecipe(recipe)
    config.workflow.notes[stage] = 'Here is the current context. No decision has been made.'
    assert.deepEqual(getDecisionBrief(config).approach.records, [])
    assert.match(renderDecisionBrief(config), /No approach or reason recorded yet/)
    assert.match(renderDecisionBrief(config), /Here is the current context/)
  }
})

test('each recipe uses only supplied approach notes and preserves excluded-stage notes visibly', () => {
  for (const [recipe, stage] of [['feasibility', 'options'], ['feature-delivery', 'architecture'], ['bugfix', 'diagnosis']]) {
    const config = createRecipe(recipe)
    config.workflow.notes[stage] = 'Compare option A with option B. The recommendation is unresolved.'
    config.workflow.enabledStages = config.workflow.enabledStages.filter(id => id !== stage)
    const brief = getDecisionBrief(config)
    assert.equal(brief.approach.records[0].text, config.workflow.notes[stage])
    assert.equal(brief.approach.records[0].included, false)
    const html = renderDecisionBrief(config)
    assert.match(html, /a stage not currently included/)
    assert.match(html, /No decision or reason has been inferred from these notes/)
  }
})

test('first and then follow selected recipe order without interpreting check results as progress', () => {
  const config = createRecipe('feasibility')
  config.workflow.enabledStages = ['recommendation', 'current-process', 'options']
  config.evidence = [{ id: 'observed-check', stageId: 'current-process', check: 'A check', expected: 'A record', observed: 'A record was supplied', status: 'passed', method: 'user-recorded', source: 'record.txt', reviewer: 'Reviewer' }]
  const brief = getDecisionBrief(config)
  assert.deepEqual(brief.planned.map(step => step.stageId), ['current-process', 'options'])
  assert.equal(brief.planned[0].owner, 'Analyst')
  assert.match(renderDecisionBrief(config), /Planned recipe order. This does not show observed progress or completed work/)
  config.workflow.bindings['current-process'] = { actorType: 'external', actorId: '', actorName: '', skills: [], contextOnly: false }
  config.workflow.bindings.options = { actorType: 'agent', actorId: '', actorName: '', skills: [], contextOnly: false }
  const unknownOwners = renderDecisionBrief(config)
  assert.match(unknownOwners, />System owner still to name<\/span>/)
  assert.match(unknownOwners, />Agent role still to choose<\/span>/)
  assert.doesNotMatch(unknownOwners, /still to name system|still to choose role/)
  config.workflow.bindings['current-process'].actorName = 'Release service'
  assert.match(renderDecisionBrief(config), />Release service system<\/span>/)
  config.workflow.enabledStages = []
  assert.deepEqual(getDecisionBrief(config).planned, [])
  assert.match(renderDecisionBrief(config), /No stages are selected/)
})

test('wanted outcome can use the recorded intent answer with explicit provenance and preserves hostile text safely', () => {
  const config = createRecipe('feasibility')
  config.workflow.answers['desired-outcome'] = '<img src=x onerror=alert(1)> Decide whether to build.'
  const brief = getDecisionBrief(config)
  assert.equal(brief.outcome.source, 'Recorded outcome answer')
  const html = renderDecisionBrief(config)
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/)
  assert.doesNotMatch(html, /<img src=x/)
  config.project.purpose = 'The project supplied outcome takes priority.'
  assert.equal(getDecisionBrief(config).outcome.text, config.project.purpose)
})

test('long supplied notes remain readable in disclosure and technical commands stay out of the plain cards', () => {
  const config = createExample('feature-delivery')
  config.project.purpose = 'Wanted outcome '.repeat(50)
  config.workflow.notes.architecture = 'Architecture detail '.repeat(50)
  config.components[0].commands.test = 'exact-project-command --fixture'
  const html = renderDecisionBrief(config)
  const plain = html.split('<details class="db-details">')[0]
  assert.doesNotMatch(plain, /exact-project-command/)
  assert.match(html, /exact-project-command --fixture/)
  assert.ok(html.includes(config.project.purpose))
  assert.ok(html.includes(config.workflow.notes.architecture))
  assert.match(html, /Paths and commands are supplied values. Atlas has not inspected or run them/)
})

test('a filled study exposes complete options and provisional recommendation without claiming its questions are resolved', () => {
  const config = createExample('feasibility')
  config.workflow.notes.options = 'Option A. '.repeat(40) + '\nOption B. Keep the current process.\nOption C. Try a manual prototype.'
  config.workflow.notes.recommendation = 'Collect customer evidence first. Consent and cost are still unknown.'
  const html = renderDecisionBrief(config)
  const plainCards = html.split('<details class="db-details">')[0]
  const disclosure = plainCards.split('<details class="db-approach-notes">')[1]?.split('</details>')[0]
  assert.ok(disclosure)
  assert.ok(disclosure.includes(config.workflow.notes.options))
  assert.ok(disclosure.includes(config.workflow.notes.recommendation))
  assert.match(plainCards, /This checks for empty fields. Questions in your notes may still need a decision/)
  assert.doesNotMatch(plainCards, /No empty intent or approach fields identified/)
});

test('live and offline overviews use the shared projection and retain the richer perspectives', () => {
  const config = createExample('bugfix')
  config.workflow.notes.diagnosis = 'Investigate an omitted filter. The cause is still a hypothesis.'
  const pack = compile(config)
  const live = renderProjectView(config, pack)
  const exported = buildProjectAtlas(config, pack)
  assert.ok(live.includes(renderDecisionBrief(config, { editable: true })))
  assert.ok(exported.includes(renderDecisionBrief(config, { id: 'snapshot-decision-brief' })))
  assert.ok(live.indexOf('data-decision-brief') < live.indexOf('class="pv-starting-points"'))
  assert.ok(exported.indexOf('data-decision-brief') < exported.indexOf('class="overview-detail"'))
  assert.match(live, /More project detail/)
  assert.match(exported, /More project detail/)
  assert.match(live, /data-project-view="evidence"/)
  assert.match(exported, /id="decisions" data-pane/)
  const exportedBrief = renderDecisionBrief(config)
  assert.doesNotMatch(exportedBrief, /data-open-editor|data-select-stage/)
})

test('brief addition preserves exact authoritative project data through exported ZIP and HTML reopening', async () => {
  const config = createExample('feasibility')
  config.workflow.notes.options = 'Use ordinary validation for the fixed rules. Investigate a model for ambiguous descriptions.'
  const pack = packageProject(config, compile(config))
  const html = pack.files.find(file => file.path === 'PROJECT-ATLAS.html').content
  for (const file of [new File([zipFiles(pack.files)], 'project.zip'), new File([html], 'project.html')]) {
    const reopened = await readProjectFiles([file])
    assert.equal(serializeProject(reopened.config), serializeProject(config))
    assert.deepEqual(getDecisionBrief(reopened.config), getDecisionBrief(config))
  }
})
