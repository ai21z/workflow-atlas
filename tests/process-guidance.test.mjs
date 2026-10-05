import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecipe } from '../factory/core.mjs'
import { createBugfixWorkflowFixture, createDocumentWorkflowFixture, createBackendWorkflowFixture } from '../factory/workflow-fixtures.mjs'
import { guidanceSnapshot, reviewGuidance } from '../factory/guidance-review.mjs'

const records = config => guidanceSnapshot(config).records
const find = (config, id) => records(config).find(record => record.id === id)

test('inactive recipe settings do not contribute selected recipe, stage or binding skill guidance', () => {
  const config = createRecipe('feature-delivery')
  config.workflowModel.processes = []
  assert.ok(config.workflow.enabledStages.length > 0)
  assert.ok(!records(config).some(record => ['recipe', 'stage', 'skill'].includes(record.type)))
  for (const record of records(config).filter(item => item.type === 'role')) assert.match(record.applicability, /no included stage assignment/)
  config.skills = ['impact-analysis']
  assert.ok(find(config, 'skill:impact-analysis'))
  config.workflowModel.processes.push({ id: 'development', source: 'recipe', kind: 'development' })
  assert.ok(find(config, 'recipe:feature-delivery'))
  assert.ok(find(config, 'stage:requirements'))
})

test('custom skill guidance includes human and application assignments without creating profiles', () => {
  const config = createBackendWorkflowFixture()
  config.workflowModel.processes = config.workflowModel.processes.filter(process => process.source === 'custom')
  config.agents = []
  const process = config.workflowModel.processes[0]
  process.steps[0].instructionIds = ['impact-analysis']
  process.steps[0].actor = { type: 'agent', id: 'analyst', name: 'Proposed runtime actor', contextOnly: false }
  process.steps.find(step => step.id === 'approve').instructionIds = ['requirement-refinement']
  const assigned = find(config, 'skill:impact-analysis')
  assert.match(assigned.applicability, /configuration-service\/generate/)
  assert.match(assigned.applicability, /do not configure or deploy an agent/)
  assert.ok(find(config, 'skill:requirement-refinement'))
  assert.ok(!records(config).some(record => record.type === 'role'))
})

test('only selected development and manual agent roles receive custom assignments', () => {
  const config = createBugfixWorkflowFixture()
  config.agents = [{ role: 'analyst', tools: ['read'] }, { role: 'implementer', tools: [] }, { role: 'reviewer', tools: ['read'] }]
  const assigned = find(config, 'role:implementer')
  assert.match(assigned.applicability, /bug-repair\/repair/)
  assert.match(assigned.applicability, /bug-repair\/correct/)
  const process = config.workflowModel.processes.find(item => item.source === 'custom')
  process.kind = 'manual'
  assert.match(find(config, 'role:analyst').applicability, /bug-repair\/diagnose/)
  process.kind = 'application'
  assert.match(find(config, 'role:implementer').applicability, /no included stage assignment/)
  process.kind = 'development'
  config.agents = config.agents.filter(agent => agent.role !== 'implementer')
  assert.equal(find(config, 'role:implementer'), undefined)
})

test('custom guidance scope changes are visible without inventing a definition update', () => {
  const config = createDocumentWorkflowFixture()
  const process = config.workflowModel.processes.find(item => item.source === 'custom')
  process.steps[0].instructionIds = ['impact-analysis']
  const before = guidanceSnapshot(config)
  const original = JSON.stringify(config)
  assert.deepEqual(guidanceSnapshot(config), before)
  assert.equal(JSON.stringify(config), original)
  process.steps[0].instructionIds = []
  process.steps[1].instructionIds = ['impact-analysis']
  const review = reviewGuidance(config, [{ path: 'manifest.json', content: JSON.stringify({ guidanceSnapshot: before }) }])
  const change = review.changes.find(item => item.id === 'skill:impact-analysis')
  assert.deepEqual(change.fields, ['applicability'])
  assert.equal(review.needsAdoption, false)
})
