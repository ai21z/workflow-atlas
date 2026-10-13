import test from 'node:test';
import assert from 'node:assert/strict';
import { createApiDataExample, createExample, createRecipe, compileSelectedOutput, getTechnologyProfiles, getUseInstructions, serializeProject } from '../factory/core.mjs';
import { workflowModelIssues } from '../factory/workflow-model.mjs';
import { createProcessDraft } from '../factory/process-editor.mjs';
import { packageProject, readProjectFiles } from '../factory/portable.mjs';
import { zipFiles } from '../factory/zip.mjs';

const content = (pack, path) => pack.files.find(file => file.path === path)?.content;
const application = config => config.workflowModel.processes.find(process => process.kind === 'application');

test('the API example keeps the existing recipe and facts unresolved while offering an optional reference stack', () => {
  const config = createApiDataExample();
  assert.deepEqual(createExample('api-data'), config);
  assert.equal(config.workflow.recipe, 'feature-delivery');
  assert.deepEqual(config.workflow.enabledStages, createRecipe().workflow.enabledStages);
  assert.deepEqual(new Set(config.components.flatMap(component => component.technologies.map(technology => technology.id))), new Set(['java', 'spring-boot', 'maven', 'postgresql', 'docker']));
  for (const component of config.components) {
    assert.equal(component.path, '');
    assert.deepEqual(component.commands, { test: '', lint: '', build: '' });
    assert.ok(component.technologies.every(technology => technology.version === ''));
  }
  assert.deepEqual(config.facts, []);
  assert.deepEqual(config.evidence, []);
  assert.equal(config.runtime.enabled, false);
  assert.ok(Object.values(config.model).every(value => value === ''));
  assert.match(config.project.purpose, /includes a requested save/);
  assert.match(config.workflow.notes.architecture, /Direct typed API calls are sufficient/);
  assert.match(config.workflow.notes.architecture, /MCP is an optional adapter/);
  assert.match(config.workflow.notes.architecture, /Do not bypass/);
  assert.equal(createExample('feature-delivery').project.name, 'Request list status filter');
});

test('the connected application distinguishes checking, authorization, uncertain writes and bounded correction', () => {
  const config = createApiDataExample();
  const process = application(config);
  assert.deepEqual(workflowModelIssues(config).filter(issue => issue.blocking), []);
  assert.equal(process.approvals[0].authority, '');
  assert.equal(process.corrections[0].maxCorrections, 2);
  assert.match(process.purpose, /illustrative and editable/);
  assert.ok(process.steps.every(step => step.actor.type !== 'agent'));
  const route = (step, outcome) => process.transitions.find(item => item.fromStepId === step && item.outcome === outcome).to;
  assert.deepEqual(route('check', 'passed'), { type: 'step', id: 'authorize' });
  assert.deepEqual(route('authorize', 'accepted'), { type: 'step', id: 'save' });
  for (const outcome of ['declined', 'changes-requested', 'unavailable']) assert.equal(route('authorize', outcome).type, 'terminal');
  for (const step of ['validate', 'retrieve', 'save']) assert.deepEqual(route(step, 'unauthorized'), { type: 'terminal', id: 'stopped' });
  for (const outcome of ['empty', 'partial']) assert.deepEqual(route('retrieve', outcome), { type: 'terminal', id: 'more-information' });
  for (const outcome of ['unknown', 'partial']) assert.deepEqual(route('save', outcome), { type: 'step', id: 'reconcile' });
  assert.match(process.steps.find(step => step.id === 'reconcile').action, /Do not replay the write/);
  assert.match(process.steps.find(step => step.id === 'reconcile').action, /operation identity is missing/);
  assert.deepEqual(route('reconcile', 'unknown'), { type: 'terminal', id: 'more-information' });
  assert.deepEqual(route('correct', 'revised'), { type: 'step', id: 'check' });
  assert.equal(process.terminals.find(terminal => terminal.id === process.corrections[0].exhaustedTerminalId).status, 'stopped');
  assert.ok(process.results.every(result => result.version === ''));
});

test('application contracts carry exact edited data, checks, authority and routes without manufacturing an integration', () => {
  const config = createApiDataExample();
  const process = application(config);
  const dataContract = 'User supplied proposal.\nSubject code plus selected identifiers.\nExact API fields remain unresolved.';
  const criterion = 'User supplied condition.\nReject records outside the permitted subject scope.';
  process.results.find(result => result.id === 'candidate').expectedStructure = dataContract;
  process.checks[0].criteria.push(criterion);
  process.approvals[0].authority = 'Data owner selected by the user, actual permission evidence still needed';
  process.corrections[0].maxCorrections = 1;
  config.workflow.answers.acceptance += ' User supplied rule. Keep selections for one review session only.';
  config.workflow.notes.architecture += ' User supplied decision. Inspect the existing service before adding an endpoint.';
  config.workflow.notes.verification += ' User supplied case. Interrupt the response after commit and reconcile the original operation.';
  const pack = compileSelectedOutput(config, { kind: 'pack' });
  const contracts = content(pack, 'templates/CONTRACTS.md');
  assert.equal(pack.validation.formatChecked, true);
  assert.equal(pack.validation.configurationComplete, false);
  assert.equal(JSON.parse(content(pack, 'manifest.json')).draft, true);
  for (const value of [dataContract, criterion, process.approvals[0].authority, config.workflow.notes.architecture, config.workflow.notes.verification]) assert.ok(contracts.includes(value), value);
  assert.match(contracts, /save \/ unknown -> .*reconcile/i);
  assert.match(contracts, /Maximum corrections after the initial candidate: 1/);
  assert.match(contracts, /\[UNRESOLVED: supply actual contract and implementation location\]/);
  assert.match(contracts, /Observed result: \[NOT RUN\]/);
  assert.ok(content(pack, 'templates/REQUIREMENTS.md').includes(config.workflow.answers.acceptance));
  assert.ok(content(pack, 'templates/DECISION.md').includes(config.workflow.notes.architecture));
  assert.ok(content(pack, 'templates/EVALUATION.md').includes(config.workflow.notes.verification));
  assert.match(content(pack, 'templates/EVALUATION.md'), /topic-selection\/save \/ unknown/);
  assert.match(content(pack, 'templates/EVALUATION.md'), /topic-selection\/selection-correction \/ correction limit reached/);
  assert.ok(content(pack, '.github/skills/verification/references/project.md').includes(criterion));
  assert.deepEqual(pack.reasons['templates/CONTRACTS.md'].processes, ['topic-selection']);
  assert.equal(pack.reasons['templates/CONTRACTS.md'].steps.length, process.steps.length);
  assert.equal(pack.files.some(file => file.path === 'RUNTIME-DESIGN.md'), false);
  assert.equal(pack.files.some(file => /mcp.*\.json$/i.test(file.path)), false);
  assert.match(content(pack, 'WORKFLOW.md'), /\[UNRESOLVED: test command\]/);
  assert.doesNotMatch(content(pack, 'WORKFLOW.md'), /\.\/mvnw|mvn test|docker compose/);
  assert.ok(getUseInstructions(config, { kind: 'blueprint' }).reading.some(route => route.paths.includes('templates/CONTRACTS.md')));
});

test('contract generation follows arbitrary application processes, not the fictional example identifier', () => {
  const config = createRecipe();
  const process = createProcessDraft({ id: 'custom-import', name: 'Project specific import', kind: 'application', patternId: 'sequence' });
  process.purpose = 'User supplied process for an unrelated application.';
  process.results[0].expectedStructure = 'Project specific payload and validation requirements.';
  config.workflowModel.processes.push(process);
  const pack = compileSelectedOutput(config, { kind: 'blueprint' });
  const contract = content(pack, 'templates/CONTRACTS.md');
  assert.match(contract, /Project specific import/);
  assert.ok(contract.includes(process.results[0].expectedStructure));
  assert.doesNotMatch(contract, /Saved topic|topic-selection/);
  assert.deepEqual(pack.reasons['templates/CONTRACTS.md'].processes, ['custom-import']);
  assert.equal(pack.files.some(file => file.path === 'RUNTIME-DESIGN.md'), false);
  const noApp = compileSelectedOutput(createExample('feature-delivery'), { kind: 'pack' });
  assert.equal(content(noApp, 'templates/CONTRACTS.md'), undefined);
  const runtime = compileSelectedOutput(createExample('feasibility'), { kind: 'pack' });
  assert.match(content(runtime, 'templates/CONTRACTS.md'), /^# Runtime contract draft/);
  assert.doesNotMatch(content(runtime, 'templates/CONTRACTS.md'), /Recorded application context/);
});

test('reference stack questions adapt without rewriting the supplied application design', () => {
  const config = createApiDataExample();
  const profiles = getTechnologyProfiles(config);
  assert.deepEqual(new Set(profiles.filter(profile => profile.id !== 'generic').map(profile => profile.id)), new Set(['java', 'spring-boot', 'maven', 'postgresql', 'docker']));
  const pack = compileSelectedOutput(config, { kind: 'pack' });
  const reference = content(pack, '.github/skills/verification/references/project.md');
  for (const profile of profiles) assert.ok(reference.includes(profile.questions[0]), profile.id);
  const design = structuredClone(application(config));
  config.components[0].technologies = [{ id: 'nodejs', version: '' }];
  const changed = compileSelectedOutput(config, { kind: 'pack' });
  assert.deepEqual(application(config), design);
  assert.equal(getTechnologyProfiles(config).some(profile => profile.id === 'spring-boot'), false);
  assert.ok(content(changed, '.github/skills/verification/references/project.md').includes(getTechnologyProfiles(config).find(profile => profile.id === 'nodejs').questions[0]));
});

test('blueprint and full ZIP bytes reopen with edited connected design, draft contracts and no supplied evidence', async () => {
  const config = createApiDataExample();
  application(config).results.find(result => result.id === 'candidate').expectedStructure = 'User edited contract. Save only selected permitted topic identifiers.';
  config.workflow.answers.acceptance += ' User edited example. Preserve the chosen subject after a failed read.';
  const before = serializeProject(config);
  for (const kind of ['blueprint', 'pack']) {
    const compiled = compileSelectedOutput(config, { kind });
    const bytes = zipFiles(packageProject(config, compiled).files);
    const opened = await readProjectFiles([new File([bytes], `api-data-${kind}.zip`)]);
    assert.equal(serializeProject(opened.config), before);
    assert.ok(content(opened, 'templates/CONTRACTS.md').includes(application(config).results.find(result => result.id === 'candidate').expectedStructure));
    assert.ok(content(opened, 'templates/REQUIREMENTS.md').includes(config.workflow.answers.acceptance));
    assert.match(content(opened, 'PROJECT-ATLAS.html'), /Saved topic review selection/);
    assert.equal(content(compiled, 'templates/CONTRACTS.md'), content(compileSelectedOutput(opened.config, { kind }), 'templates/CONTRACTS.md'));
    assert.equal(compiled.files.some(file => file.path.endsWith('.agent.md')), kind === 'pack');
    assert.deepEqual(opened.config.facts, []);
    assert.deepEqual(opened.config.evidence, []);
    assert.equal(opened.config.runtime.enabled, false);
  }
  assert.equal(serializeProject(config), before);
});
