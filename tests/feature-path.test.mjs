import test from 'node:test';
import assert from 'node:assert/strict';
import { createExample, createRecipe, compileSelectedOutput, getTechnologyProfiles, serializeProject } from '../factory/core.mjs';
import { packageProject, readProjectFiles } from '../factory/portable.mjs';
import { zipFiles } from '../factory/zip.mjs';

const content = (pack, path) => pack.files.find(file => file.path === path)?.content;

test('the feature example supplies useful proposed behavior while real repository facts remain unresolved', () => {
  const config = createExample('feature-delivery');
  assert.equal(config.project.name, 'Request list status filter');
  assert.deepEqual(config.workflow.enabledStages, createRecipe('feature-delivery').workflow.enabledStages);
  assert.deepEqual(new Set(config.components.flatMap(component => component.technologies.map(technology => technology.id))), new Set(['typescript', 'react', 'nodejs', 'npm', 'vitest', 'playwright', 'github-actions']));
  for (const component of config.components) {
    assert.equal(component.path, '');
    assert.deepEqual(component.commands, { test: '', lint: '', build: '' });
    assert.ok(component.technologies.every(technology => technology.version === ''));
  }
  for (const expected of ['Open shows', 'All shows', 'Loading', 'empty', 'error', 'retry', 'keyboard', 'narrow screen', 'access rules']) assert.ok(config.workflow.answers.acceptance.includes(expected), expected);
  assert.match(config.workflow.notes.architecture, /complete permitted result set/);
  assert.match(config.workflow.notes.architecture, /pagination/);
  assert.match(config.workflow.notes.verification, /all not run/);
  assert.deepEqual(config.facts, []);
  assert.deepEqual(config.evidence, []);
  assert.equal(config.runtime.enabled, false);
});

test('the reference stack changes skill questions without turning proposed examples into evidence', () => {
  const config = createExample('feature-delivery');
  const profiles = getTechnologyProfiles(config);
  assert.deepEqual(new Set(profiles.filter(profile => profile.id !== 'generic').map(profile => profile.id)), new Set(['typescript', 'react', 'nodejs', 'npm', 'vitest', 'playwright', 'github-actions']));
  const pack = compileSelectedOutput(config, { kind: 'pack' });
  assert.equal(pack.validation.formatChecked, true);
  assert.equal(pack.validation.configurationComplete, false);
  assert.equal(JSON.parse(content(pack, 'manifest.json')).draft, true);
  const reference = content(pack, '.github/skills/verification/references/project.md');
  for (const profile of profiles) {
    assert.ok(reference.includes(profile.label), profile.id);
    assert.ok(reference.includes(profile.questions[0]), `${profile.id} question`);
  }
  assert.ok(content(pack, 'templates/REQUIREMENTS.md').includes(config.workflow.answers.acceptance));
  assert.ok(content(pack, 'templates/DECISION.md').includes(config.workflow.notes.architecture));
  assert.ok(content(pack, 'templates/EVALUATION.md').includes(config.workflow.notes.verification));
  assert.match(content(pack, 'templates/VERIFICATION.md'), /\[NOT RUN\]/);
  assert.match(content(pack, 'WORKFLOW.md'), /\[UNRESOLVED: test command\]/);
  assert.match(content(pack, 'WORKFLOW.md'), /\[UNRESOLVED: component path\]/);
  assert.doesNotMatch(content(pack, 'WORKFLOW.md'), /npm test|npm run|npx playwright|\/mvnw/);
  assert.equal(pack.files.some(file => file.path === 'RUNTIME-DESIGN.md'), false);
  assert.equal(pack.files.some(file => /mcp.*\.json$/i.test(file.path)), false);

  const changed = structuredClone(config);
  changed.components.forEach(component => { component.technologies = component.technologies.filter(technology => technology.id !== 'playwright'); });
  const other = compileSelectedOutput(changed, { kind: 'pack' });
  const otherReference = content(other, '.github/skills/verification/references/project.md');
  assert.equal(getTechnologyProfiles(changed).some(profile => profile.id === 'playwright'), false);
  assert.ok(!otherReference.includes(profiles.find(profile => profile.id === 'playwright').questions[0]));
  assert.equal(changed.workflow.notes.verification, config.workflow.notes.verification, 'recorded notes remain user input, separate from selected profile guidance');
});

test('both actual artifact byte formats retain the proposed workflow and unresolved facts through import', async () => {
  const config = createExample('feature-delivery');
  const before = serializeProject(config);
  for (const kind of ['blueprint', 'pack']) {
    const compiled = compileSelectedOutput(config, { kind });
    const packaged = packageProject(config, compiled);
    const bytes = zipFiles(packaged.files);
    const opened = await readProjectFiles([new File([bytes], `status-filter-${kind}.zip`)]);
    assert.equal(serializeProject(opened.config), before);
    assert.ok(content(opened, 'WORKFLOW.md').includes(config.workflow.notes.verification));
    assert.ok(content(opened, 'templates/REQUIREMENTS.md').includes(config.workflow.answers.acceptance));
    assert.match(content(opened, 'PROJECT-ATLAS.html'), /Request list status filter/);
    assert.equal(content(compiled, 'WORKFLOW.md'), content(compileSelectedOutput(opened.config, { kind }), 'WORKFLOW.md'));
    assert.equal(compiled.files.some(file => file.path.endsWith('.agent.md')), kind === 'pack');
    assert.deepEqual(opened.config.evidence, []);
  }
  assert.equal(serializeProject(config), before);
});
