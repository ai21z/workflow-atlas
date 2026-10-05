import test from 'node:test';
import assert from 'node:assert/strict';
import { compile, compileSelectedOutput, compileStandaloneSkill, getEffectiveSkills, getUseInstructions, parseImport, EXPORTER_VERSION } from '../factory/core.mjs';
import { createBackendWorkflowFixture, createBugfixWorkflowFixture, createDocumentWorkflowFixture } from '../factory/workflow-fixtures.mjs';

const file = (pack, path) => pack.files.find(item => item.path === path)?.content;
const bug = () => {
  const config = createBugfixWorkflowFixture();
  config.project.host = 'vscode';
  config.project.sourceControl = 'github';
  return config;
};

test('custom instructions select a skill and retain connected result and correction context in every skill form', () => {
  const config = bug();
  const before = structuredClone(config);
  assert.deepEqual(getEffectiveSkills(config).map(skill => skill.id), ['bug-diagnosis', 'implementation']);
  for (const [pack, prefix] of [
    [compile(config), '.github/skills/implementation/'],
    [compileSelectedOutput(config, { kind: 'skill', skillId: 'implementation' }), '.github/skills/implementation/'],
    [compileStandaloneSkill(config, 'implementation'), 'implementation/'],
  ]) {
    const instruction = file(pack, `${prefix}SKILL.md`);
    const reference = file(pack, `${prefix}references/project.md`);
    assert.match(instruction, /bug-repair\/repair/);
    assert.match(instruction, /bug-repair\/correct/);
    assert.match(reference, /Maximum corrections after the initial candidate: 2/);
    assert.match(reference, /feedback regression-findings/);
    assert.match(reference, /Record a new identifier when the content changes/);
    assert.match(reference, /regression-check/);
    assert.match(reference, /candidate revision 1 still loses/);
    assert.match(reference, /Earlier revisions cannot qualify a changed candidate/);
    assert.ok(!pack.validation.issues.some(issue => issue.code === 'missing-reference'));
    assert.deepEqual(pack.reasons[`${prefix}SKILL.md`].processes, ['bug-repair']);
    assert.deepEqual(pack.reasons[`${prefix}SKILL.md`].steps, ['bug-repair/repair', 'bug-repair/correct']);
  }
  assert.deepEqual(config, before);
});

test('custom development assignments reach selected profiles without inheriting unrelated work', () => {
  const config = bug();
  const pack = compile(config);
  const profile = file(pack, '.github/agents/implementer.agent.md');
  assert.match(profile, /bug-repair\/repair/);
  assert.match(profile, /bug-repair\/correct/);
  assert.match(profile, /\.\.\/skills\/implementation\/SKILL.md/);
  assert.doesNotMatch(profile, /profile retained without a stage assignment/);
  assert.doesNotMatch(profile, /bug-repair\/diagnose/);
  assert.deepEqual(JSON.parse(profile.match(/^tools: (.+)$/m)[1]), config.agents.find(agent => agent.role === 'implementer').tools);
  assert.ok(getUseInstructions(config).reading.some(route => route.paths.includes('.github/agents/implementer.agent.md')));
  assert.deepEqual(pack.reasons['.github/agents/implementer.agent.md'].steps, ['bug-repair/repair', 'bug-repair/correct']);
});

test('unmatched development actors remain unresolved and missing capabilities are never added automatically', () => {
  const config = bug();
  const flow = config.workflowModel.processes[0];
  flow.steps.find(step => step.id === 'repair').actor.id = 'project-repair-agent';
  const implementer = config.agents.find(agent => agent.role === 'implementer');
  implementer.tools = ['read'];
  const pack = compile(config);
  assert.ok(pack.validation.issues.some(issue => issue.code === 'workflow-unresolved' && issue.message.includes('project-repair-agent')));
  assert.ok(pack.validation.issues.some(issue => issue.code === 'workflow-step-capability' && issue.message.includes('edit')));
  assert.equal(pack.validation.configurationComplete, false);
  assert.ok(!pack.files.some(item => item.path.includes('project-repair-agent.agent')));
  assert.match(file(pack, '.github/skills/implementation/references/project.md'), /project-repair-agent/);
  assert.deepEqual(implementer.tools, ['read']);
  assert.match(file(pack, '.github/agents/implementer.agent.md'), /^tools: \["read"\]$/m);
  assert.ok(!pack.validation.issues.some(issue => issue.code === 'workflow-assignment-export'));
});

test('application actor IDs cannot acquire a development profile assignment', () => {
  const config = createBackendWorkflowFixture();
  const application = config.workflowModel.processes.find(process => process.kind === 'application');
  config.workflowModel.processes = [application];
  config.agents = [{ role: 'implementer', tools: ['read'] }];
  const generate = application.steps.find(step => step.id === 'generate');
  generate.actor = { type: 'agent', id: 'implementer', name: 'Deployed candidate planner', contextOnly: false };
  generate.instructionIds = ['implementation'];
  const pack = compile(config);
  assert.match(file(pack, '.github/agents/implementer.agent.md'), /No stage is assigned to this profile/);
  assert.doesNotMatch(file(pack, '.github/agents/implementer.agent.md'), /Deployed candidate planner|configuration-service\/generate|skills\/implementation/);
  assert.match(file(pack, '.github/skills/implementation/references/project.md'), /Deployed candidate planner/);
  assert.match(file(pack, '.github/skills/implementation/SKILL.md'), /do not deploy an agent/);
  assert.ok(pack.validation.issues.some(issue => issue.code === 'workflow-runtime-agent'));
  assert.deepEqual(pack.reasons['.github/agents/implementer.agent.md'].steps, []);
  assert.deepEqual(pack.reasons['.github/skills/implementation/SKILL.md'].roles, []);
});

test('context-only custom assignments replace the active skill procedure and retain scope in the profile', () => {
  const config = bug();
  const flow = config.workflowModel.processes[0];
  flow.steps.find(step => step.id === 'review').instructionIds = ['verification'];
  const pack = compileStandaloneSkill(config, 'verification');
  const instruction = file(pack, 'verification/SKILL.md');
  assert.match(instruction, /Procedure for supplied-context review/);
  assert.doesNotMatch(instruction, /## Procedure\n/);
  assert.match(instruction, /Do not perform the underlying work, execute its checks or produce missing outputs/);
  assert.match(file(pack, 'verification/references/project.md'), /background for supplied-context review only/);
  const profile = file(compile(config), '.github/agents/reviewer.agent.md');
  assert.match(profile, /bug-repair\/review/);
  assert.match(profile, /has no active assigned execution stage/);
  assert.match(profile, /Do not run syntax checks, tests, lint checks or builds/);
});

test('mixed custom skill assignments separate active work from supplied-context review', () => {
  const config = bug();
  config.workflowModel.processes[0].steps.find(step => step.id === 'review').instructionIds = ['implementation'];
  const text = file(compile(config), '.github/skills/implementation/SKILL.md');
  assert.match(text, /Procedure for active assignments/);
  assert.match(text, /Procedure for supplied-context review/);
  assert.match(text, /bug-repair\/review/);
  assert.match(text, /bug-repair\/repair/);
});

test('each declared custom outcome, exhaustion and revision check becomes a planned evaluation case', () => {
  for (const config of [createBackendWorkflowFixture(), bug(), createDocumentWorkflowFixture()]) {
    const pack = compileSelectedOutput(config, { kind: 'blueprint' });
    const evaluation = file(pack, 'templates/EVALUATION.md');
    assert.ok(evaluation);
    assert.match(evaluation, /design expectations, not simulated runs or evidence of success/);
    for (const process of config.workflowModel.processes.filter(item => item.source === 'custom')) {
      for (const step of process.steps) for (const outcome of step.outcomes) assert.ok(evaluation.includes(`${process.id}/${step.id} / ${outcome}`));
      for (const correction of process.corrections) assert.ok(evaluation.includes(`${process.id}/${correction.id} / correction limit reached`));
      for (const check of process.checks) assert.ok(evaluation.includes(`${process.id}/${check.id} / candidate revision changed`));
      for (const approval of process.approvals) assert.ok(evaluation.includes(`${process.id}/${approval.id} / approval after changes`));
    }
    const rows = evaluation.split('\n').filter(line => line.startsWith('| ') && /\/.*\|/.test(line));
    assert.ok(rows.length);
    assert.ok(rows.every(line => line.endsWith('| [NOT RUN] |')));
    assert.ok(!pack.files.some(item => item.path.startsWith('.github/')));
    assert.deepEqual(parseImport(file(pack, 'project.json')), config);
    assert.ok(getUseInstructions(config, { kind: 'blueprint' }).reading.some(route => route.paths.includes('templates/EVALUATION.md')));
  }
});

test('zero and unresolved correction limits retain different planned expectations', () => {
  for (const limit of [0, null]) {
    const config = createDocumentWorkflowFixture();
    config.workflowModel.processes[0].corrections[0].maxCorrections = limit;
    const text = file(compile(config), 'templates/EVALUATION.md');
    if (limit === 0) assert.match(text, /The 0 permitted corrections.*Do not enter another correction attempt/);
    else assert.match(text, /Maximum corrections remains UNRESOLVED.*Do not infer a correction allowance/);
  }
});

test('custom human instruction assignments remain human and a manual process keeps inactive recipe intent out of its skill', () => {
  const config = createDocumentWorkflowFixture();
  config.workflow.answers['current-work'] = 'INACTIVE_RECIPE_DATA';
  config.workflowModel.processes[0].steps.find(step => step.id === 'draft').instructionIds = ['implementation'];
  const pack = compile(config);
  assert.ok(!pack.files.some(item => item.path.startsWith('.github/agents/')));
  assert.match(file(pack, '.github/skills/implementation/SKILL.md'), /does not transfer the assignment to an agent/);
  assert.doesNotMatch(file(pack, '.github/skills/implementation/references/project.md'), /INACTIVE_RECIPE_DATA/);
  assert.match(file(pack, '.github/skills/implementation/references/project.md'), /No development recipe is active/);
});

test('process associations and exporter version survive manifests and reduced output without changing deterministic bytes', () => {
  const config = bug();
  const first = compile(config);
  assert.deepEqual(first, compile(config));
  for (const pack of [first, compileSelectedOutput(config, { kind: 'skill', skillId: 'implementation' }), compileStandaloneSkill(config, 'implementation')]) {
    const manifest = JSON.parse(file(pack, 'manifest.json'));
    assert.equal(manifest.exporterVersion, EXPORTER_VERSION);
    const skill = manifest.artifacts.find(item => item.path.endsWith('implementation/SKILL.md'));
    assert.deepEqual(skill.processes, ['bug-repair']);
    assert.deepEqual(skill.steps, ['bug-repair/repair', 'bug-repair/correct']);
    assert.ok(manifest.artifacts.every(item => pack.files.some(generated => generated.path === item.path)));
    assert.ok(!pack.validation.issues.some(issue => issue.code === 'missing-reference'));
  }
});
