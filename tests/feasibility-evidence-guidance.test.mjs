import test from 'node:test'
import assert from 'node:assert/strict'
import { createRecipe, compileSelectedOutput, compileStandaloneSkill } from '../factory/core.mjs'
import { guidanceSnapshot, reviewGuidance } from '../factory/guidance-review.mjs'

const file = (pack, path) => pack.files.find(entry => entry.path === path)?.content

test('feasibility exports preserve evidence limits alongside the supplied facts', () => {
  const config = createRecipe('feasibility')
  config.project.name = 'Synthetic service comparison'
  config.project.purpose = 'Assess whether a proposed approach deserves an experiment.'
  config.facts = [{
    id: 'source-scope', claim: 'The rulebook was not supplied. Completion time has not been measured. The proposed benefit is untested.',
    status: 'unresolved', source: 'sources/process.txt', revision: '', reviewer: '', notes: 'Ask the owner for evidence before making a comparative claim.',
  }]
  const original = structuredClone(config)
  const skillId = 'feasibility-analysis'
  const exports = [
    { pack: compileSelectedOutput(config, { kind: 'pack' }), prefix: `.github/skills/${skillId}` },
    { pack: compileSelectedOutput(config, { kind: 'skill', skillId }), prefix: `.github/skills/${skillId}` },
    { pack: compileStandaloneSkill(config, skillId), prefix: skillId },
  ]
  for (const { pack, prefix } of exports) {
    const skill = file(pack, `${prefix}/SKILL.md`)
    const context = file(pack, `${prefix}/references/project.md`)
    assert.match(skill, /not supplied, not measured and confirmed absent/)
    assert.match(skill, /untested capability or benefit as a hypothesis/)
    assert.match(skill, /slow, variable, reliable or more efficient without supporting observations/)
    assert.match(skill, /every citation supports the exact claim and its certainty/)
    assert.match(skill, /benefits and limitations in comparison tables/)
    assert.ok(context.includes(config.facts[0].claim))
    assert.ok(context.includes(config.facts[0].notes))
    assert.doesNotMatch(skill, /^allowed-tools:/m)
    assert.equal(pack.validation.hostExercised, false)
    assert.equal(pack.validation.formatChecked, true)
  }
  assert.deepEqual(config, original)
})

test('feasibility guidance revisions are reviewable without broad catalog or schema changes', () => {
  const config = createRecipe('feasibility')
  const snapshot = guidanceSnapshot(config)
  const current = snapshot.records.find(record => record.id === 'skill:feasibility-analysis')
  const previous = structuredClone(snapshot)
  const prior = previous.records.find(record => record.id === current.id)
  delete prior.definition.version
  prior.version = previous.catalogVersion
  prior.definition.steps = ['Read the documented current process and source evidence.', 'Define the intended outcome and unresolved decisions.', 'Compare the smallest plausible approaches and their operational needs.', 'Separate measured effort and cost from estimates and assumptions.', 'Deliver a recommendation with evidence, ownership and a proportionate next step.']
  prior.definition.checks = ['Every material conclusion has evidence or is marked unresolved.', 'The recommendation does not imply an unobserved experiment passed.']
  const files = [{ path: 'manifest.json', content: JSON.stringify({ guidanceSnapshot: previous }) }]
  const report = reviewGuidance(config, files)
  assert.equal(current.version, '2.0.2')
  assert.equal(snapshot.catalogVersion, '2.0.1')
  assert.deepEqual(report.changes.map(change => change.id), ['skill:feasibility-analysis'])
  assert.deepEqual(report.changes[0].fields, ['version', 'definition'])
  assert.equal(report.needsAdoption, true)
})
