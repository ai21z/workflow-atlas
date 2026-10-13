import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeCompoundBoundary, analyzeCompoundHistory, hasInputHandlingBoundary } from '../factory/intent-compounds.mjs'

test('compatible inference prohibitions cover every clause and retain exact source fragments', () => {
  const text = 'Do not send the goal or recorded answers to a hosted model, and do not use a provider fallback.'
  assert.deepEqual(analyzeCompoundBoundary(text), { scope: 'inference', clauses: [
    'Do not send the goal or recorded answers to a hosted model',
    'do not use a provider fallback.',
  ] })
  for (const fragment of analyzeCompoundBoundary(text).clauses) assert.ok(text.includes(fragment))
  assert.equal(hasInputHandlingBoundary(text), true)
})

test('input location and copy lifetime compose only after an explicit input binding', () => {
  for (const text of [
    'Process the source inputs only on the approved local workstation, and erase temporary copies when this session ends.',
    'Keep source inputs inside the approved team environment and retain no copies after review.',
    'Store our recorded answers only in our approved workspace and never retain temporary copies.',
    'The brief must not be sent to a model provider and delete temporary copies after review.',
  ]) {
    const result = analyzeCompoundBoundary(text)
    assert.equal(result?.scope, 'handling', text)
    assert.equal(result.clauses.length, 2, text)
    assert.equal(hasInputHandlingBoundary(text), true, text)
    for (const fragment of result.clauses) assert.ok(text.includes(fragment))
  }
  for (const text of [
    'Erase temporary copies when this session ends.',
    'Never use JEV and erase temporary copies when this session ends.',
    'Keep source inputs inside the approved workspace and erase customer records when this session ends.',
  ]) assert.equal(analyzeCompoundBoundary(text), null, text)
})

test('coordinated provider objects are distinct from alternative actions', () => {
  for (const text of [
    'Never send the brief and recorded answers to JEV or another model service.',
    'Do not use a hosted model or an external provider.',
    'Do not send any part of this project to JEV and never invoke a provider fallback.',
  ]) assert.equal(analyzeCompoundBoundary(text)?.scope, 'inference', text)
  for (const text of [
    'Do not send the brief to JEV or use an external provider.',
    'Keep source inputs inside the approved workspace or erase temporary copies after review.',
    'Never use JEV or call an external provider.',
  ]) assert.equal(analyzeCompoundBoundary(text), null, text)
})

test('copy restrictions can name their input explicitly without binding unrelated copies', () => {
  const compound = 'Do not send this brief to JEV, and do not retain copies of the project input.'
  assert.deepEqual(analyzeCompoundBoundary(compound), { scope: 'handling', clauses: [
    'Do not send this brief to JEV',
    'do not retain copies of the project input.',
  ] })
  for (const text of [
    'Do not retain copies of the project input.',
    'Retain no temporary copies of the brief and recorded answers after review.',
    'Erase temporary copies of the project input after review.',
    'Delete copies of this brief when this session ends.',
    'Never use JEV and do not retain copies of the project input.',
  ]) {
    assert.equal(analyzeCompoundBoundary(text)?.scope, 'handling', text)
    assert.equal(hasInputHandlingBoundary(text), true, text)
  }
  for (const text of [
    'Do not retain copies.',
    'Do not retain copies of the production database.',
    'Do not send this brief to JEV and do not retain copies of the production database.',
    'Retain no copies of the project input and production database.',
    'Do not retain copies of the project input and send the original to JEV.',
    'Keep copies of the project input.',
    'Erase copies of the project input when validation fails.',
  ]) assert.equal(analyzeCompoundBoundary(text), null, text)
})

test('exceptions, permissions and new product commands cannot be removed as compatible boundaries', () => {
  for (const text of [
    'Never send the brief to JEV unless approval is granted.',
    'Keep source inputs inside the approved workspace except when the provider needs them.',
    'Keep source inputs inside the approved workspace and send the brief to JEV.',
    'Never send the brief to JEV and use a provider fallback.',
    'Never send the brief to JEV and reports are inaccurate.',
    'Never send the brief to JEV and transactions fail silently.',
    'Keep source inputs inside the approved workspace and build a preview screen.',
    'Keep source inputs inside the approved workspace and clear the customer database.',
    'Do not send the brief to JEV, but use a model if validation fails.',
    'Process source inputs only on the approved workstation and erase copies when approval is denied.',
    'Never use JEV and never retain copies unless approved.',
  ]) {
    assert.equal(analyzeCompoundBoundary(text), null, text)
    assert.equal(hasInputHandlingBoundary(text), true, text)
  }
})

test('conservative handling protection does not depend on a successful compound parse', () => {
  for (const text of [
    'Process source inputs only on an approved workstation and rotate the archive.',
    'Keep supplied inputs within the designated environment.',
    'All recorded answers are private and must be erased after processing.',
    'No external model calls are allowed.',
  ]) assert.equal(hasInputHandlingBoundary(text), true, text)
  for (const text of [
    'The input field must not show invalid dates.',
    'The import preview must include a checksum.',
    'Rejected orders must not be saved.',
  ]) assert.equal(hasInputHandlingBoundary(text), false, text)
})

test('unrecognized tails, excessive compositions and incomplete clauses remain unresolved', () => {
  for (const text of [
    '', null, {},
    'Never use JEV and',
    'Never use JEV and never use a provider fallback and never use JEV and never use a provider fallback and never use JEV.',
    `Never use ${'external '.repeat(300)}JEV.`,
    'Never send the brief to JEV; delete the archive.',
    'Never send the brief to JEV: keep an external backup.',
    'Never send the brief to JEV\u0000.',
  ]) assert.equal(analyzeCompoundBoundary(text), null, String(text))
  assert.equal(hasInputHandlingBoundary(null), false)
})

test('coordinated historical predicates share only an explicit past setting', () => {
  const text = 'In an earlier release, the calculation omitted reimbursements and never counted advances.'
  assert.deepEqual(analyzeCompoundHistory(text), { clauses: [
    'In an earlier release, the calculation omitted reimbursements',
    'never counted advances.',
  ] })
  for (const history of [
    'In the previous version, the screen showed totals and did not include discounts.',
    'During our original prototype, the form was incomplete and the navigation was confusing.',
  ]) {
    const result = analyzeCompoundHistory(history)
    assert.equal(result?.clauses.length, 2, history)
    for (const fragment of result.clauses) assert.ok(history.includes(fragment))
  }
})

test('history does not turn current, conditional or ambiguous commands into past behavior', () => {
  for (const text of [
    'In an earlier release, the calculation omitted reimbursements and never count advances.',
    'In an earlier release, the calculation omitted reimbursements and ignore all discounts.',
    'In an earlier release, the calculation omitted reimbursements, omit the review stage.',
    'In an earlier release, the calculation omitted reimbursements and now add the missing values.',
    'In an earlier release, the calculation omitted reimbursements and the totals must include advances.',
    'In an earlier release, add a detailed preview.',
    'In an earlier release, the calculation omitted reimbursements and add a logged event.',
    'In an earlier release, the calculation omitted reimbursements and the system deletes archived records.',
    'In an earlier release, the calculation omitted reimbursements unless approval was granted.',
    'The calculation omitted reimbursements and never counted advances.',
    'In an earlier release, the calculation omitted reimbursements and never sent source inputs to JEV.',
  ]) assert.equal(analyzeCompoundHistory(text), null, text)
})

test('disclosed restriction regressions are recognized as complete source clauses', () => {
  // These cases were disclosed after the first evaluation. They are regression
  // coverage, not evidence of performance on unseen wording.
  const cases = [
    { id: 'C01', scope: 'inference', text: 'Do not send this description to a hosted model, and do not switch to another provider if the first one fails.', clauses: [
      'Do not send this description to a hosted model',
      'do not switch to another provider if the first one fails.',
    ] },
    { id: 'C03', scope: 'handling', text: 'Read these source inputs only on the approved workstation and delete temporary snippets after the review.', clauses: [
      'Read these source inputs only on the approved workstation',
      'delete temporary snippets after the review.',
    ] },
    { id: 'D17', scope: 'inference', text: 'Neither these inputs nor the notebook may be sent to an external model, and a failed local check must never trigger a provider call.', clauses: [
      'Neither these inputs nor the notebook may be sent to an external model',
      'a failed local check must never trigger a provider call.',
    ] },
    { id: 'D19', scope: 'inference', text: 'Do not transmit these answers to any model and do not keep a provider copy.', clauses: [
      'Do not transmit these answers to any model',
      'do not keep a provider copy.',
    ] },
  ]
  for (const item of cases) {
    const result = analyzeCompoundBoundary(item.text)
    assert.deepEqual(result, { scope: item.scope, clauses: item.clauses }, item.id)
    assert.equal(hasInputHandlingBoundary(item.text), true, item.id)
    for (const clause of result.clauses) assert.ok(item.text.includes(clause), item.id)
  }
})

test('failure conditions on negative provider switching do not become permissions or catch all tails', () => {
  for (const text of [
    'Do not switch to another provider if the first one fails.',
    'Never fall back to a hosted model when the primary provider times out.',
    'A failed local check must never trigger a provider call.',
    'The unsuccessful request should not initiate an external model request.',
  ]) {
    assert.equal(analyzeCompoundBoundary(text)?.scope, 'inference', text)
    assert.equal(hasInputHandlingBoundary(text), true, text)
  }
  for (const text of [
    'Switch to another provider if the first one fails.',
    'Do not switch to another provider unless the first one fails.',
    'Do not switch to another provider if the first one succeeds.',
    'Do not switch to another provider if the first one fails, upload the brief instead.',
    'Do not switch to another provider if the first one fails and upload the brief.',
    'Do not switch to another provider if the first one fails or approval is granted.',
    'A failed local check may trigger a provider call.',
    'A failed local check must never trigger a provider call unless approved.',
    'A failed local check must never trigger a provider call: deploy the release.',
    'Do not switch to another provider if the first one fails and keep copies after review.',
  ]) assert.equal(analyzeCompoundBoundary(text), null, text)
})

test('read and snippet lifetime limits require identified input and an entirely negative composition', () => {
  for (const text of [
    'Read the brief only on the approved workstation and erase temporary snippets when this session ends.',
    'The source inputs may be read only within our approved workspace and never retain snippets.',
    'Delete temporary snippets of this brief after review.',
  ]) {
    assert.equal(analyzeCompoundBoundary(text)?.scope, 'handling', text)
    assert.equal(hasInputHandlingBoundary(text), true, text)
  }
  for (const text of [
    'Read the production database only on the approved workstation and delete temporary snippets after review.',
    'Read the brief on an external provider and delete temporary snippets after review.',
    'Read the brief only on the approved workstation and delete code snippets after review.',
    'Read the brief only on the approved workstation and delete temporary snippets when validation fails.',
    'Read the brief only on the approved workstation and upload temporary snippets to a provider.',
    'Read the brief only on the approved workstation, publish a summary and delete temporary snippets after review.',
    'Delete temporary snippets after review.',
  ]) assert.equal(analyzeCompoundBoundary(text), null, text)
})

test('neither nor transfer prohibitions bind an input without accepting unrelated actions or double negatives', () => {
  for (const text of [
    'Neither the brief nor the exported report may be shared to an external provider.',
    'Neither these inputs nor our decision notebook nor the exported files can be sent to JEV.',
  ]) {
    assert.equal(analyzeCompoundBoundary(text)?.scope, 'inference', text)
    assert.equal(hasInputHandlingBoundary(text), true, text)
  }
  for (const text of [
    'Neither these inputs nor the notebook may not be sent to an external model.',
    'Neither the dashboard nor the notebook may be sent to an external model.',
    'Neither these inputs nor deploy the notebook may be sent to an external model.',
    'Neither these inputs nor the notebook may be sent to an external model unless approved.',
    'Neither these inputs nor the notebook may be sent to an external model, and a failed local check must trigger a provider call.',
    'Neither these inputs nor the notebook may be sent to an external model, and a failed local check must never trigger a provider call, delete the archive.',
  ]) assert.equal(analyzeCompoundBoundary(text), null, text)
})

test('provider copy prohibitions retain their inference scope and require a traceable input', () => {
  for (const text of [
    'Do not transmit these answers to any model and retain no provider copies.',
    'Do not keep a provider copy of the project input.',
  ]) {
    assert.equal(analyzeCompoundBoundary(text)?.scope, 'inference', text)
    assert.equal(hasInputHandlingBoundary(text), true, text)
  }
  for (const text of [
    'Do not keep a provider copy.',
    'Do not use JEV and do not keep a provider copy.',
    'Do not keep a provider copy of the production database.',
    'Do not transmit these answers to any model and keep a provider copy.',
    'Do not transmit these answers to any model and do not keep a provider copy unless needed.',
    'Do not transmit these answers to any model and do not keep a provider copy, send a local backup.',
  ]) assert.equal(analyzeCompoundBoundary(text), null, text)
})
