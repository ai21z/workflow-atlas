import test from 'node:test';
import assert from 'node:assert/strict';
import { createExample, createRecipe, compile, compileSelectedOutput, serializeProject, parseImport } from '../factory/core.mjs';

const agentsFile = result => result.files.find(file => file.path === 'AGENTS.md');

test('the full pack carries a short AGENTS.md at the repository root', () => {
  const config = createExample('feature-delivery');
  const pack = compile(config);
  const file = agentsFile(pack);
  assert.ok(file, 'AGENTS.md is part of the pack');
  assert.ok(pack.files.find(item => item.path === 'manifest.json').content.includes('"AGENTS.md"'));
  const lines = file.content.split('\n');
  assert.ok(lines.length < 200, `AGENTS.md stays under 200 lines, got ${lines.length}`);
  assert.ok(Buffer.byteLength(file.content) < 16 * 1024, 'AGENTS.md stays under 16 KiB for the example');
  assert.equal(lines[0], `# ${config.project.name}`);
  for (const heading of ['## Purpose', '## Commands', '## Workflow', '## Roles', '## Skills', '## Acceptance', '## Boundaries', '## Practices']) assert.ok(file.content.includes(`\n${heading}\n`), `${heading} present`);
  assert.ok(!file.content.startsWith('---'), 'AGENTS.md has no frontmatter');
  assert.match(file.content, /- test: `[^`]+`/, 'recorded test command appears inline');
  assert.match(file.content, /^1\. /m, 'stages are numbered in order');
  assert.ok(file.content.includes('(.github/agents/'), 'agent profiles are linked');
  assert.ok(file.content.includes('(.github/skills/'), 'skills are linked');
  assert.ok(file.content.includes('does not run anything'), 'the file states its limits once');
  assert.equal(pack.reasons['AGENTS.md'].roles.length, config.agents.length, 'reasons connect the file to selected roles');
  assert.ok(pack.reasons['AGENTS.md'].stages.length > 0, 'reasons connect the file to enabled stages');
});

test('unresolved project values stay visible in AGENTS.md instead of being invented', () => {
  const config = createRecipe('bugfix');
  const file = agentsFile(compile(config));
  assert.ok(file.content.includes('\\[UNRESOLVED: project name\\]'), 'heading keeps the escaped placeholder');
  assert.ok(file.content.includes('`[UNRESOLVED: test command]`'));
  assert.ok(file.content.includes('[UNRESOLVED: What should happen?]'));
  assert.ok(file.content.includes('not a value to invent'));
});

test('a feasibility study without components asks before assuming commands', () => {
  const config = createRecipe('feasibility');
  const file = agentsFile(compile(config));
  assert.ok(file.content.includes('No repository component is recorded. Ask before assuming a build, test or lint command.'));
});

test('blueprint and single skill outputs do not include AGENTS.md', () => {
  const config = createExample('feature-delivery');
  assert.equal(agentsFile(compileSelectedOutput(config, { kind: 'blueprint' })), undefined);
  const skillId = compile(config).files.find(file => file.path.endsWith('/SKILL.md')).path.split('/')[2];
  assert.equal(agentsFile(compileSelectedOutput(config, { kind: 'skill', skillId })), undefined);
  assert.ok(agentsFile(compileSelectedOutput(config, { kind: 'pack' })));
});

test('AGENTS.md is deterministic and survives a project round trip', () => {
  const config = createExample('bugfix');
  const first = agentsFile(compile(config)).content;
  const second = agentsFile(compile(parseImport(serializeProject(config)))).content;
  assert.equal(first, second);
});

test('oversized AGENTS.md is reported by the format check', () => {
  const config = createExample('feature-delivery');
  config.constraints.notes = 'x'.repeat(14000);
  const warned = compile(config);
  assert.ok(warned.validation.issues.some(issue => issue.code === 'agents-length' && issue.severity === 'warning'));
  assert.equal(warned.validation.formatChecked, true, 'a warning does not fail the format check');
  config.project.purpose = 'y'.repeat(19000);
  config.constraints.notes = 'x'.repeat(19000);
  const failed = compile(config);
  assert.ok(failed.validation.issues.some(issue => issue.code === 'agents-length' && issue.severity === 'error'));
  assert.equal(failed.validation.formatChecked, false);
});

test('backtick text in recorded commands cannot break out of the inline fence', () => {
  const config = createExample('feature-delivery');
  config.components[0].commands.test = 'npm test `echo hi`';
  const file = agentsFile(compile(config));
  assert.ok(file.content.includes('- test: ``npm test `echo hi` ``'));
});
