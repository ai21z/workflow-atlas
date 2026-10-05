import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipe, compile, compileSelectedOutput } from '../factory/core.mjs';

const content = (pack, path) => pack.files.find(file => file.path === path)?.content;
const codes = pack => pack.validation.issues.map(issue => issue.code);
const study = () => {
  const config = createRecipe('feasibility');
  Object.assign(config.project, { name: 'Weekly summary study', purpose: 'Decide whether a weekly usage email would help customers.', sourceLocations: 'Customer request, supplied by the project owner' });
  return config;
};
const section = (text, title) => text.split(`### ${title}\n`)[1]?.split('\n### ')[0];

test('an ordinary feasibility study compares project options without mandatory AI experiments', () => {
  const config = study();
  const before = structuredClone(config);
  const pack = compileSelectedOutput(config, { kind: 'blueprint' });
  const workflow = content(pack, 'WORKFLOW.md');
  const evaluation = content(pack, 'templates/EVALUATION.md');
  assert.match(section(workflow, 'Compare feasible approaches'), /keeping the current approach with the smallest plausible changes/);
  assert.match(section(workflow, 'Compare feasible approaches'), /If model behavior is part of the proposal/);
  assert.match(section(workflow, 'Plan the evidence'), /current approach with the proposed options/);
  assert.doesNotMatch(section(workflow, 'Plan the evidence'), /focused skill|complete pack|minimal project facts/);
  assert.match(evaluation, /Current approach/);
  assert.match(evaluation, /UNRESOLVED: proposed option/);
  assert.match(evaluation, /Expected result \| Observed result and source/);
  assert.match(evaluation, /Corrections and effort \| Elapsed time \| Cost and basis \| Maintenance effort/);
  assert.match(evaluation, /\[NOT RUN\]/);
  assert.match(evaluation, /Keep measurements separate from estimates/);
  assert.doesNotMatch(evaluation, /focused skill|complete pack|minimal project facts|model|host|instructions should have little effect/i);
  assert.doesNotMatch(content(pack, 'EVIDENCE.md'), /Model and budget record|UNRESOLVED: model/);
  assert.deepEqual(config, before);
});

test('the reusable evaluation skill makes instruction experiments conditional', () => {
  const config = study();
  const skill = content(compile(config), '.github/skills/evaluation-planning/SKILL.md');
  assert.match(skill, /actual project options under equivalent conditions/);
  assert.match(skill, /If instructions are the subject of the study/);
  assert.match(skill, /only where useful/);
  assert.match(skill, /Record model usage only when a model is involved/);
  assert.match(skill, /Expected outcomes and observed results remain separate/);
});

test('runtime evaluation retains concrete failure cases and conditional model records', () => {
  const config = study();
  config.runtime.enabled = true;
  config.model.name = 'Supplied model name';
  const pack = compileSelectedOutput(config, { kind: 'blueprint' });
  const evaluation = content(pack, 'templates/EVALUATION.md');
  for (const text of ['Missing required information', 'Invalid proposed result', 'Backend failure', 'Write succeeds before response timeout', 'Duplicate retry']) assert.ok(evaluation.includes(text));
  assert.match(evaluation, /Name: Supplied model name/);
  assert.match(evaluation, /If instructions are what you are evaluating/);
  assert.match(evaluation, /Select only conditions relevant to the study/);
  assert.match(content(pack, 'EVIDENCE.md'), /Model: Supplied model name/);
  config.runtime.enabled = false;
  assert.match(content(compile(config), 'templates/EVALUATION.md'), /Name: Supplied model name/);
  config.model.name = '';
  config.model.notes = 'Owner has not chosen a model yet.';
  assert.match(content(compile(config), 'EVIDENCE.md'), /Owner has not chosen a model yet/);
});

test('workflow capability guidance follows the actual person, system or agent assignment', () => {
  const config = createRecipe('feature-delivery');
  let workflow = content(compileSelectedOutput(config, { kind: 'blueprint' }), 'WORKFLOW.md');
  for (const title of ['Requirements and evidence', 'Release and production']) {
    const stage = section(workflow, title);
    assert.match(stage, /responsible person or system supplies/);
    assert.doesNotMatch(stage, /agent capabilities|host or runtime/i);
  }
  assert.match(section(workflow, 'Development'), /Requested agent capabilities: read, edit/);
  assert.match(section(workflow, 'Tests and review'), /Requested agent capabilities: read, execute/);
  config.workflow.bindings.verification.contextOnly = true;
  workflow = content(compileSelectedOutput(config, { kind: 'blueprint' }), 'WORKFLOW.md');
  assert.match(section(workflow, 'Tests and review'), /Agent scope: review supplied artifacts only/);
  assert.doesNotMatch(section(workflow, 'Tests and review'), /Requested agent capabilities: read, execute/);
});

test('a person owned blueprint omits warnings for profiles it does not export or assign', () => {
  const config = study();
  for (const binding of Object.values(config.workflow.bindings)) Object.assign(binding, { actorType: 'human', actorId: '', actorName: 'Study owner' });
  config.project.host = 'jetbrains';
  config.project.sourceControl = 'github';
  config.agents = [{ role: 'analyst', tools: [] }, { role: 'implementer', tools: ['read', 'execute'] }];
  config.skills = ['verification'];
  config.constraints.readOnly = true;
  const before = structuredClone(config);
  const blueprint = compileSelectedOutput(config, { kind: 'blueprint' });
  const irrelevant = ['preview-host', 'no-tools', 'unassigned-agent', 'execute-boundary', 'library-skill', 'read-only-conflict'];
  for (const code of irrelevant) assert.ok(!codes(blueprint).includes(code), code);
  assert.ok(!blueprint.files.some(file => file.path.startsWith('.github/')));
  assert.equal(blueprint.validation.configurationComplete, true);
  const pack = compile(config);
  for (const code of irrelevant) assert.ok(codes(pack).includes(code), code);
  assert.equal(pack.validation.configurationComplete, false);
  assert.deepEqual(config, before);
});

test('blueprints retain consistency findings for assigned agents and malformed profile selections', () => {
  const config = study();
  config.agents[0].tools = [];
  let pack = compileSelectedOutput(config, { kind: 'blueprint' });
  assert.ok(codes(pack).includes('stage-capability'));
  assert.ok(codes(pack).includes('no-tools'));
  config.agents[0].tools = ['read', 'search', 'execute'];
  config.constraints.readOnly = true;
  pack = compileSelectedOutput(config, { kind: 'blueprint' });
  assert.ok(codes(pack).includes('read-only-conflict'));
  assert.ok(codes(pack).includes('execute-boundary'));
  config.agents = [];
  assert.ok(codes(compileSelectedOutput(config, { kind: 'blueprint' })).includes('missing-actor'));
  config.agents = [{ role: 'analyst', tools: ['read', 'search'] }, { role: 'unknown-role', tools: [] }];
  assert.ok(codes(compileSelectedOutput(config, { kind: 'blueprint' })).includes('unknown-role'));
});

test('bug repair evaluation preserves repair and regression cases without AI comparison requirements', () => {
  const config = createRecipe('bugfix');
  const evaluation = content(compileSelectedOutput(config, { kind: 'blueprint' }), 'templates/EVALUATION.md');
  for (const text of ['Original failing case', 'Adjacent behavior', 'Invalid input', 'Regression or incomplete environment']) assert.ok(evaluation.includes(text));
  assert.doesNotMatch(evaluation, /focused skill|complete pack|Model details/i);
  assert.match(evaluation, /No experiment, successful outcome or productivity gain is established/);
});
