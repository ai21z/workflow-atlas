import test from 'node:test';
import assert from 'node:assert/strict';
import { createExample, createRecipe, parseImport, serializeProject, compileSelectedOutput } from '../factory/core.mjs';
import { DECISION_REVIEW_MAX_BYTES, createDecisionReview, exportDecisionReview, parseDecisionReview, restoreDecisionReview } from '../factory/decision-review.mjs';

const clone = value => JSON.parse(JSON.stringify(value));
const find = (review, path) => review.changes.find(change => change.path === path);
const file = (files, path) => files.find(item => item.path === path);

test('unchanged settings have no decision or generated file changes and are preserved exactly', () => {
  const config = createExample('feasibility');
  const original = serializeProject(config);
  const review = createDecisionReview(config, config, { selection: { kind: 'blueprint' } });
  assert.deepEqual(review.changes, []);
  assert.deepEqual(review.affectedFiles, []);
  assert.deepEqual(review.baseline, config);
  assert.deepEqual(review.current, config);
  assert.equal(serializeProject(config), original);
  assert.equal(review.output.kind, 'blueprint');
  assert.ok(!review.output.currentFiles.some(item => item.path.startsWith('.github/')));
  assert.equal(review.reason, '');
  assert.match(file(exportDecisionReview(review), 'DECISION-REVIEW.md').content, /does not infer one/);
});

test('summaries distinguish outcome, answers, notes, omitted prerequisites and responsible actors', () => {
  const baseline = createExample();
  const current = clone(baseline);
  current.project.purpose = 'Accept a saved search without losing optional filters.';
  current.workflow.answers.acceptance = 'Use the supplied recorded regression cases.';
  current.workflow.enabledStages = current.workflow.enabledStages.filter(id => id !== 'implementation');
  current.workflow.suppliedInputs.implementation = 'docs/reviewed-change.md';
  current.workflow.notes.verification = 'Read the accepted examples before checking the change.';
  Object.assign(current.workflow.bindings.verification, { actorType: 'human', actorId: '', actorName: 'Release reviewer' });
  current.workflow.bindings.architecture.contextOnly = true;
  const review = createDecisionReview(baseline, current);
  assert.match(find(review, 'project.purpose').summary, /intended result, not an observed completion/);
  assert.match(find(review, 'workflow.answers.acceptance').summary, /does not establish requirement acceptance/);
  assert.equal(find(review, 'workflow.enabledStages.implementation').after, false);
  assert.match(find(review, 'workflow.enabledStages.implementation').summary, /existing input/);
  assert.equal(find(review, 'workflow.bindings.verification.actor').after.actorName, 'Release reviewer');
  assert.match(find(review, 'workflow.bindings.verification.actor').summary, /does not contact/);
  assert.match(find(review, 'workflow.bindings.architecture.contextOnly').summary, /context only/);
  assert.deepEqual(find(review, 'workflow.prerequisites.verification').after, [{ stageId: 'implementation', source: 'existing-input', location: 'docs/reviewed-change.md' }]);
  assert.ok(find(review, 'workflow.prerequisites.verification').affectedFiles.includes('WORKFLOW.md'));
  assert.ok(review.affectedFiles.every(item => ['added', 'updated', 'removed'].includes(item.change)));
});

test('component technology and command changes get specific labels without pretending to execute checks', () => {
  const baseline = createExample();
  const current = clone(baseline);
  current.components[0].commands.test = 'npm run check:search';
  current.components[0].technologies[0].version = '20';
  current.components[0].path = 'apps/search';
  const review = createDecisionReview(baseline, current);
  const command = find(review, 'components.web.commands.test');
  assert.equal(command.before, 'npm test -- --run');
  assert.equal(command.after, 'npm run check:search');
  assert.match(command.label, /test command/);
  assert.match(command.summary, /recorded, not run/);
  assert.ok(command.affectedFiles.some(path => path.endsWith('/references/project.md')));
  assert.match(find(review, 'components.web.technologies.react').summary, /not a compatibility check/);
  assert.match(find(review, 'components.web.path').summary, /has not checked/);
});

test('requested tools and approval instructions never become a runtime permission claim', () => {
  const baseline = createExample();
  const current = clone(baseline);
  current.agents.find(agent => agent.role === 'analyst').tools.push('execute');
  current.constraints.approvalRequired = false;
  current.constraints.readOnly = true;
  const review = createDecisionReview(baseline, current);
  assert.match(find(review, 'agents.analyst').summary, /not configured integrations, credentials or enforced runtime permissions/);
  assert.ok(find(review, 'agents.analyst').affectedFiles.includes('.github/agents/analyst.agent.md'));
  assert.match(find(review, 'constraints.approvalRequired').summary, /actual project and host policy still applies/);
  assert.match(find(review, 'constraints.readOnly').summary, /host or runtime must enforce/);
});

test('runtime requirements, implementation locations and evidence references remain separate from observed success', () => {
  const baseline = createExample('feasibility');
  const current = clone(baseline);
  const control = current.runtime.controls.find(item => item.id === 'before-write');
  control.status = 'evidence-recorded';
  control.implementation = 'service/src/PermissionCheck.java';
  control.evidenceId = 'denied-request';
  current.evidence.push({ id: 'denied-request', stageId: 'experiment-plan', check: 'Reject an unpermitted write', expected: 'No record is saved', observed: 'The record was incorrectly saved', status: 'failed', method: 'tool-observed', source: 'logs/denied-request.txt', reviewer: 'Named reviewer' });
  const review = createDecisionReview(baseline, current);
  assert.equal(find(review, 'runtime.controls.before-write.status').before, 'requirement');
  assert.match(find(review, 'runtime.controls.before-write.status').summary, /may still describe a failure/);
  assert.match(find(review, 'runtime.controls.before-write.implementation').summary, /has not inspected or verified/);
  assert.match(find(review, 'runtime.controls.before-write.evidenceId').summary, /does not establish a passing result/);
  assert.equal(find(review, 'evidence.denied-request').after.status, 'failed');
  assert.match(find(review, 'evidence.denied-request').summary, /not an Atlas execution or authentication/);
});

test('facts, model records and practices are supplied data without gains or provider routing claims', () => {
  const baseline = createExample();
  const current = clone(baseline);
  current.facts.push({ id: 'approval-owner', claim: 'A named owner reviews releases.', status: 'confirmed', source: 'docs/release-policy.md', revision: 'revision-17', reviewer: 'Named reviewer', notes: '' });
  current.model.name = 'Selected by project owner';
  current.practices.push('evidence-wiki');
  current.skills.push('knowledge-maintenance');
  const review = createDecisionReview(baseline, current);
  assert.match(find(review, 'facts.approval-owner').summary, /not independent verification/);
  assert.match(find(review, 'model.name').summary, /does not route model calls/);
  assert.match(find(review, 'practices').summary, /not installed tools or proof of productivity improvement/);
  assert.match(find(review, 'skills').summary, /not automatically assigned/);
});

test('selected output metadata is fresh and a newly selected skill has no invented previous inventory', () => {
  const baseline = createRecipe('feasibility');
  const current = clone(baseline);
  current.skills.push('verification');
  const review = createDecisionReview(baseline, current, { selection: { kind: 'skill', skillId: 'verification' } });
  assert.equal(review.output.baselineScope, 'unavailable');
  assert.deepEqual(review.output.baselineFiles, []);
  assert.ok(review.output.currentFiles.some(item => item.path === '.github/skills/verification/SKILL.md'));
  assert.ok(!review.output.currentFiles.some(item => item.path.startsWith('.github/agents/')));
  assert.match(file(exportDecisionReview(review), 'DECISION-REVIEW.md').content, /no previous focused output inventory/);
  assert.throws(() => createDecisionReview(baseline, current, { selection: { kind: 'skill', skillId: 'unselected-skill' } }), /supported skill/);
});

test('JSON and readable exports roundtrip exact baseline, current and optional reason without changing input settings', () => {
  const baseline = createExample('bugfix');
  const current = clone(baseline);
  current.project.name = 'Search Ελληνικά 世界';
  current.constraints.notes = 'Review the fix with its acceptance owner.';
  const reason = 'The supplied reproduction showed an optional filter disappearing.';
  const review = createDecisionReview(baseline, current, { reason, selection: { kind: 'pack' } });
  const files = exportDecisionReview(review);
  const restored = parseDecisionReview(file(files, 'decision-review.json').content, { current });
  assert.deepEqual(restored, review);
  assert.deepEqual(parseImport(JSON.stringify(restored.baseline)), baseline);
  assert.deepEqual(parseImport(JSON.stringify(restored.current)), current);
  assert.equal(restored.reason, reason);
  assert.equal(files.length, 2);
  assert.match(file(files, 'DECISION-REVIEW.md').content, /baseline comparison, not a history of intermediate edits/);
  assert.match(file(files, 'DECISION-REVIEW.md').content, /Supplied Markdown edits do not change project settings/);
  assert.throws(() => parseDecisionReview(file(files, 'decision-review.json').content, { current: baseline }), /do not match the opened project/);
});

test('planned check records produce identical review files after a serialized project is reopened', () => {
  const baseline = createRecipe('bugfix');
  const current = clone(baseline);
  current.evidence.push({ id: 'last-row', stageId: 'verification', check: 'CSV includes the final row', expected: 'Every requested row is present', observed: '', status: 'planned', method: 'user-recorded', source: '', reviewer: '' });
  const files = exportDecisionReview(createDecisionReview(baseline, current, { selection: { kind: 'blueprint' } }));
  const opened = parseImport(serializeProject(current));
  const restored = restoreDecisionReview(file(files, 'decision-review.json').content, { current: opened });
  assert.deepEqual(restored.warnings, []);
  const regenerated = exportDecisionReview(restored.review);
  for (const original of files) assert.equal(file(regenerated, original.path).content, original.content, original.path);
  assert.equal(opened.evidence[0].status, 'planned');
  assert.equal(opened.evidence[0].observed, '');
});

function withoutFencedData(content) {
  let delimiter = null;
  return content.split('\n').filter(line => {
    if (!delimiter) { const match = line.match(/^(`{3,})text$/); if (match) { delimiter = match[1]; return false; } return true; }
    if (line === delimiter) delimiter = null;
    return false;
  }).join('\n');
}

test('hostile Markdown and HTML stay inert in readable review values and escaped labels', () => {
  const baseline = createExample();
  const current = clone(baseline);
  const hostile = '```\n# Owned\n<script>alert(1)</script>\n[run](javascript:alert(1))\n``````\n<img src=x onerror=alert(1)>';
  current.components[0].name = '<img src=x onerror=alert(1)> [execute](javascript:alert(1))';
  current.project.purpose = hostile;
  const review = createDecisionReview(baseline, current, { reason: hostile });
  const markdown = file(exportDecisionReview(review), 'DECISION-REVIEW.md').content;
  const prose = withoutFencedData(markdown);
  assert.doesNotMatch(prose, /<script>|<img|^# Owned|(?<!\\)\[execute\]\(javascript:/m);
  assert.match(prose, /&lt;img/);
  assert.match(markdown, /```````text/);
  assert.equal(parseDecisionReview(file(exportDecisionReview(review), 'decision-review.json').content).reason, hostile);
});

test('supplied metadata, summaries, paths, added fields and definition claims must match fresh generation', () => {
  const baseline = createExample('feasibility');
  const current = clone(baseline);
  current.project.purpose = 'Make a supported study decision.';
  const review = createDecisionReview(baseline, current, { selection: { kind: 'blueprint' } });
  for (const mutate of [
    record => { record.changes[0].summary = 'Everything passed.'; },
    record => { record.output.currentFiles[0].path = '../../outside'; },
    record => { record.affectedFiles[0].change = 'success'; },
    record => { record.completed = true; },
    record => { record.output.currentFiles.push({ path: 'EXECUTED.md', stages: [], roles: [] }); },
  ]) {
    const tampered = clone(review);
    mutate(tampered);
    assert.throws(() => parseDecisionReview(JSON.stringify(tampered)), /do not match fresh generation/);
  }
  const changedVersion = clone(review);
  changedVersion.definitionVersion = 'future';
  assert.throws(() => parseDecisionReview(JSON.stringify(changedVersion)), /Unsupported/);
  const badConfig = clone(review);
  badConfig.current.runtime.enabled = 'run-imported-code';
  assert.throws(() => parseDecisionReview(JSON.stringify(badConfig)), /Expected true or false/);
});

test('malformed, oversized and executable looking record data are rejected without silently updating project settings', () => {
  const config = createExample('feasibility');
  const original = serializeProject(config);
  assert.throws(() => parseDecisionReview('import("javascript:alert(1)")'), /not valid JSON/);
  assert.throws(() => parseDecisionReview(' '.repeat(DECISION_REVIEW_MAX_BYTES + 1)), /no larger than 8 MiB/);
  assert.throws(() => parseDecisionReview('[]'), /Unsupported/);
  assert.throws(() => createDecisionReview(config, config, { reason: '\u0000' }), /without control characters/);
  assert.throws(() => createDecisionReview(config, config, { reason: 'a'.repeat(20001) }), /20,000/);
  assert.throws(() => createDecisionReview(config, config, { selection: { kind: 'pack', script: 'run' } }), /supported decision review output/);
  const record = JSON.parse(JSON.stringify(createDecisionReview(config, config)));
  record.__proto__ = { completed: true };
  assert.throws(() => exportDecisionReview(record), /plain|metadata|summaries|match|Supply|Unsupported/);
  assert.equal(serializeProject(config), original);
});

test('reordered records are visible without being mistaken for executed workflow order or capability changes', () => {
  const baseline = createExample();
  const current = clone(baseline);
  current.components.reverse();
  current.workflow.enabledStages.reverse();
  current.components[1].technologies.reverse();
  const review = createDecisionReview(baseline, current);
  assert.match(find(review, 'components.$order').summary, /display order changed/);
  assert.match(find(review, 'workflow.enabledStages.order').summary, /recipe topology and generated handoff order stay fixed/);
  assert.equal(find(review, 'components.web.technologies.$order').label, 'Technologies recorded order');
  assert.equal(new Set(review.changes.map(change => change.id)).size, review.changes.length);
});

test('safe restoration carries exact baseline and supplied reason across definition drift while replacing all summaries', () => {
  const baseline = createExample('feasibility');
  const current = clone(baseline);
  current.project.purpose = 'Decide whether the proposed integration is justified.';
  const fresh = createDecisionReview(baseline, current, { reason: 'A named owner requested the study.', selection: { kind: 'blueprint' } });
  const original = JSON.stringify(fresh);
  assert.deepEqual(restoreDecisionReview(original, { current }), { review: fresh, warnings: [] });
  const older = clone(fresh);
  older.definitionVersion = '1.9.0';
  older.changes[0].summary = 'Unsupported old summary claims that the task passed.';
  older.output.currentFiles = older.output.currentFiles.filter(row => row.path !== 'INSTALL.md');
  const restored = restoreDecisionReview(JSON.stringify(older), { current });
  assert.deepEqual(restored.review, fresh);
  assert.equal(restored.review.reason, 'A named owner requested the study.');
  assert.deepEqual(restored.review.baseline, baseline);
  assert.equal(restored.warnings.length, 1);
  assert.match(restored.warnings[0], /replaced by fresh generation/);
  assert.doesNotMatch(JSON.stringify(restored.review), /Unsupported old summary/);
  assert.throws(() => parseDecisionReview(JSON.stringify(older)), /Unsupported/);
  assert.equal(JSON.stringify(fresh), original);
});

test('restoration rejects unsafe derived records, unsupported envelopes, migrations and mismatched current settings', () => {
  const baseline = createExample('feasibility');
  const current = clone(baseline);
  current.project.purpose = 'Record the changed study outcome.';
  const fresh = createDecisionReview(baseline, current, { selection: { kind: 'blueprint' } });
  assert.throws(() => restoreDecisionReview(JSON.stringify(fresh)), /Supply the opened project/);
  assert.throws(() => restoreDecisionReview(JSON.stringify(fresh), { current: baseline }), /do not match the opened project/);
  for (const mutate of [
    record => { record.completed = true; },
    record => { record.schemaVersion = '2.0'; },
    record => { record.output.currentFiles[0].path = '../../outside'; },
    record => { record.changes[0].executed = true; },
    record => { record.changes[0].summary = '\u0000'; },
    record => { record.affectedFiles[0].change = 'success'; },
    record => { record.definitionVersion = 'execute-import'; },
    record => { record.current.runtime.enabled = 'execute-import'; },
    record => { record.output.kind = 'execute-import'; },
  ]) {
    const malformed = clone(fresh);
    mutate(malformed);
    assert.throws(() => restoreDecisionReview(JSON.stringify(malformed), { current }));
  }
  assert.throws(() => restoreDecisionReview('import("javascript:alert(1)")', { current }), /not valid JSON/);
  assert.throws(() => restoreDecisionReview(' '.repeat(DECISION_REVIEW_MAX_BYTES + 1), { current }), /no larger than 8 MiB/);
});

test('evaluation stage notes associate their changed evaluation artifact with the recorded decision', () => {
  const baseline = createRecipe('feasibility')
  for (const binding of Object.values(baseline.workflow.bindings)) Object.assign(binding, { actorType: 'human', actorId: '', actorName: 'Study owner' })
  const current = structuredClone(baseline)
  current.workflow.notes['experiment-plan'] = 'Include conflicting references before deciding whether to build.'
  const output = compileSelectedOutput(current, { kind: 'blueprint' })
  assert.ok(file(output.files, 'templates/EVALUATION.md').content.includes(current.workflow.notes['experiment-plan']))
  const review = createDecisionReview(baseline, current, { selection: { kind: 'blueprint' } })
  assert.ok(review.affectedFiles.some(file => file.path === 'templates/EVALUATION.md'))
  const change = review.changes.find(item => item.path === 'workflow.notes.experiment-plan')
  assert.ok(change.affectedFiles.includes('templates/EVALUATION.md'), 'The evaluation note change omits the evaluation artifact it updates')
})

test('recorded acceptance changes associate the working templates and self-contained references they update', () => {
  const baseline = createRecipe('feature-delivery')
  const current = structuredClone(baseline)
  current.workflow.answers.acceptance = 'Empty results produce a header-only CSV. Keep the displayed column order.'
  const review = createDecisionReview(baseline, current, { selection: { kind: 'blueprint' } })
  const change = review.changes.find(item => item.path === 'workflow.answers.acceptance')
  for (const path of ['templates/REQUIREMENTS.md', 'templates/DECISION.md', 'templates/EVALUATION.md', '.github/skills/implementation/references/project.md']) {
    assert.ok(review.affectedFiles.some(file => file.path === path))
    assert.ok(change.affectedFiles.includes(path), `The acceptance answer change omits ${path}`)
  }
  assert.ok(!change.affectedFiles.includes('templates/VERIFICATION.md'))
  assert.ok(!review.output.currentFiles.some(item => item.path.startsWith('.github/')))
  assert.match(review.scope, /do not isolate causal effects when several decisions change together/)
})

test('older file associations restore exact decisions and selected output with refreshed summaries', () => {
  const baseline = createRecipe('feature-delivery')
  const current = structuredClone(baseline)
  current.workflow.answers.acceptance = 'Preserve all visible rows in the CSV.'
  for (const selection of [{ kind: 'blueprint' }, { kind: 'pack' }, { kind: 'skill', skillId: 'requirement-refinement' }]) {
    const fresh = createDecisionReview(baseline, current, { reason: 'Clarify export acceptance.', selection })
    const older = structuredClone(fresh)
    older.changes.find(item => item.path === 'workflow.answers.acceptance').affectedFiles = ['VALIDATION.md', 'WORKFLOW.md', 'project.json']
    const restored = restoreDecisionReview(JSON.stringify(older), { current })
    assert.deepEqual(restored.review, fresh)
    assert.deepEqual(restored.review.baseline, baseline)
    assert.deepEqual(restored.review.current, current)
    assert.equal(restored.review.output.kind, selection.kind)
    assert.equal(restored.warnings.length, 1)
    assert.match(restored.warnings[0], /replaced by fresh generation/)
    const json = file(exportDecisionReview(restored.review), 'decision-review.json').content
    assert.deepEqual(parseDecisionReview(json, { current }), fresh)
  }
})
