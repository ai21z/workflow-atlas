import test from 'node:test';
import assert from 'node:assert/strict';
import { posix } from 'node:path';
import { CATALOG, TOOL_ALIASES, PROJECT_JSON_MAX_BYTES, serializeProject, createDefault, createRecipe, createExample, createBackendExample, selectRecipe, getStages, getEffectiveSkills, compileStandaloneSkill, validate, compile, parseImport } from '../factory/core.mjs';

const file = (pack, path) => pack.files.find(item => item.path === path)?.content;
const hasIssue = (result, code, severity = 'error') => result.issues.some(issue => issue.code === code && issue.severity === severity);
const fixture = () => { const config = createExample(); config.project.host = 'vscode'; return config; };

test('project JSON export and import share a byte limit and do not truncate supplied facts', () => {
  const config = fixture();
  config.facts = Array.from({ length: 35 }, (_, index) => ({ id: `fact-${index}`, claim: 'c'.repeat(19990), status: 'inferred', source: 's'.repeat(19990), revision: '', reviewer: '', notes: 'n'.repeat(19990) }));
  const serialized = serializeProject(config);
  assert.ok(Buffer.byteLength(serialized) > 2_000_000);
  assert.ok(Buffer.byteLength(serialized) < PROJECT_JSON_MAX_BYTES);
  assert.deepEqual(parseImport(serialized), config);
  assert.equal(file(compile(config), 'project.json'), serialized);
  assert.equal(compileStandaloneSkill(config, 'verification').validation.configurationComplete, true);
  const oversized = structuredClone(config);
  oversized.facts = Array.from({ length: 50 }, (_, index) => ({ id: `fact-${index}`, claim: '界'.repeat(19990), status: 'inferred', source: '界'.repeat(19990), revision: '', reviewer: '', notes: '界'.repeat(19990) }));
  const checked = validate(oversized);
  assert.ok(hasIssue(checked, 'project-size'));
  assert.equal(checked.configurationComplete, false);
  assert.equal(checked.formatChecked, false);
  assert.throws(() => serializeProject(oversized), /8 MiB.*No text was truncated/);
  assert.throws(() => compile(oversized), /8 MiB/);
  assert.throws(() => compileStandaloneSkill(oversized, 'verification'), /8 MiB/);
  assert.equal(oversized.facts.length, 50);
  assert.equal(oversized.facts[0].claim.length, 19990);
});

test('project-level evidence stays unassigned and never becomes a stage execution result', () => {
  const config = fixture();
  config.evidence = [{ id: 'global-review', stageId: '', check: 'Review the pack with its owner', expected: 'The scope is understandable', observed: '', status: 'planned', method: 'user-recorded', source: '', reviewer: '' }];
  const pack = compile(config);
  assert.equal(pack.validation.configurationComplete, true);
  assert.deepEqual(parseImport(file(pack, 'project.json')), config);
  assert.match(file(pack, 'EVIDENCE.md'), /Stage: Project level/);
  assert.match(file(pack, 'EVIDENCE.md'), /Status: planned/);
  assert.deepEqual(pack.reasons['EVIDENCE.md'].stages, []);
  config.evidence[0].stageId = 'unrecognized-stage';
  assert.throws(() => parseImport(JSON.stringify(config)), /known stage/);
});

test('example is clearly fictional and yields a complete pack without claiming a host exercise', () => {
  const config = fixture();
  assert.match(config.project.purpose, /Fictional example/);
  const pack = compile(config);
  assert.equal(pack.validation.configurationComplete, true);
  assert.equal(pack.validation.formatChecked, true);
  assert.equal(pack.validation.hostExercised, false);
  assert.ok(pack.stats.fileCount > 13);
  assert.equal(pack.stats.bytes, pack.files.reduce((sum, item) => sum + Buffer.byteLength(item.content), 0));
  for (const path of ['WORKFLOW.md', 'project.json', 'manifest.json', 'INSTALL.md', 'VALIDATION.md', 'SOURCES.md']) assert.ok(file(pack, path), path);
  assert.match(file(pack, 'VALIDATION.md'), /Host exercised: no/);
  const manifest = JSON.parse(file(pack, 'manifest.json'));
  assert.equal(manifest.validation.hostExercised, false);
  assert.equal(manifest.draft, false);
  assert.deepEqual(manifest.files, pack.files.map(item => item.path).sort());
});

test('empty profile yields an explicit draft with unresolved data and separate format status', () => {
  const config = createDefault();
  const pack = compile(config);
  assert.equal(pack.validation.configurationComplete, false);
  assert.equal(pack.validation.formatChecked, true);
  assert.equal(JSON.parse(file(pack, 'manifest.json')).draft, true);
  assert.ok(hasIssue(pack.validation, 'missing-value'));
  assert.ok(hasIssue(pack.validation, 'missing-command'));
  assert.match(file(pack, 'WORKFLOW.md'), /UNRESOLVED: test command/);
  assert.doesNotMatch(file(pack, 'WORKFLOW.md'), /npm test/);
  assert.deepEqual(parseImport(file(pack, 'project.json')), config);
});

test('fresh recipes do not choose the user environment and explicit imports retain their choices', () => {
  for (const recipe of ['feature-delivery', 'bugfix', 'feasibility']) {
    const config = createRecipe(recipe);
    assert.equal(config.project.host, '');
    assert.equal(config.project.sourceControl, '');
    assert.deepEqual(parseImport(serializeProject(config)), config);
    assert.equal(hasIssue(validate(config), 'missing-environment'), true);
    assert.equal(hasIssue(validate(config), 'missing-source-control'), true);
  }
  const config = fixture();
  config.project.host = 'jetbrains';
  config.project.sourceControl = 'bitbucket';
  assert.deepEqual(parseImport(serializeProject(config)), config);
  config.project.host = '';
  config.project.sourceControl = '';
  const portable = compileStandaloneSkill(config, 'verification');
  assert.equal(portable.validation.configurationComplete, true);
  assert.equal(portable.validation.issues.some(issue => ['missing-environment', 'missing-source-control'].includes(issue.code)), false);
  for (const field of ['host', 'sourceControl']) {
    for (const value of ['unknown', ' ']) {
      const malformed = structuredClone(config);
      malformed.project[field] = value;
      assert.throws(() => parseImport(serializeProject(malformed)), /supported/);
    }
  }
});

test('missing command fails completeness and remains visible in the artifact', () => {
  const config = fixture();
  config.components[0].commands.test = '';
  const pack = compile(config);
  assert.equal(pack.validation.configurationComplete, false);
  assert.ok(pack.validation.issues.some(issue => issue.code === 'missing-command' && issue.path === 'components[0].commands.test'));
  assert.match(file(pack, '.github/skills/verification/references/project.md'), /UNRESOLVED: test command/);
});

test('feature requirements include supplied acceptance without claiming approval or execution', () => {
  const config = createDefault();
  config.workflow.answers.acceptance = 'Open shows only requests marked Open. All shows every request.';
  const before = structuredClone(config);
  const pack = compile(config);
  const requirements = file(pack, 'templates/REQUIREMENTS.md');
  assert.ok(requirements.includes(`\n\`\`\`text\n${config.workflow.answers.acceptance}\n\`\`\`\n`));
  assert.match(requirements, /Supplied in Brief and preserved as entered/);
  assert.match(requirements, /does not establish approval or observed results/);
  assert.match(requirements, /Acceptance owner: \[UNRESOLVED: acceptance owner\]/);
  assert.match(requirements, /Evidence source: \[UNRESOLVED: source location and revision\]/);
  assert.match(requirements, /\[UNRESOLVED: behavior, source location and revision\]/);
  assert.doesNotMatch(requirements, /\| Input or situation \|/);
  assert.equal(JSON.parse(file(pack, 'manifest.json')).validation.behaviorObserved, false);
  assert.deepEqual(config, before);
  assert.deepEqual(parseImport(file(pack, 'project.json')), before);
});

test('requirements preserve multiline acceptance and Markdown as literal supplied text', () => {
  const config = createDefault();
  const acceptance = '  Keep leading spaces.\r\nOpen | Closed\n\n# Supplied heading\n```text\nA literal example\n```\n``````\n<script>alert("example")</script>\n[link](javascript:example) and **emphasis**.\n  ';
  config.workflow.answers.acceptance = acceptance;
  const pack = compile(config);
  const requirements = file(pack, 'templates/REQUIREMENTS.md');
  const opening = '\n```````text\n';
  const closing = '\n```````\n';
  const start = requirements.indexOf(opening) + opening.length;
  const end = requirements.indexOf(closing, start);
  assert.notEqual(start, opening.length - 1);
  assert.notEqual(end, -1);
  assert.equal(requirements.slice(start, end), acceptance);
  assert.equal(requirements.split(acceptance).length, 2);
  assert.ok(file(pack, 'WORKFLOW.md').includes(acceptance));
  const reopened = parseImport(file(pack, 'project.json'));
  assert.equal(reopened.workflow.answers.acceptance, acceptance);
  assert.equal(file(compile(reopened), 'templates/REQUIREMENTS.md'), requirements);
});

test('requirements keep the unresolved scaffold when acceptance is absent or only whitespace', () => {
  for (const value of [undefined, '', ' \n\r\n  ']) {
    const config = createDefault();
    if (value !== undefined) config.workflow.answers.acceptance = value;
    const pack = compile(config);
    const requirements = file(pack, 'templates/REQUIREMENTS.md');
    assert.match(requirements, /\| Input or situation \| Expected result \| Acceptance owner \| Evidence source \|/);
    assert.match(requirements, /\| \[UNRESOLVED\] \| \[UNRESOLVED\] \| \[UNRESOLVED\] \| \[UNRESOLVED\] \|/);
    assert.doesNotMatch(requirements, /Supplied in Brief/);
    assert.ok(pack.validation.issues.some(issue => issue.code === 'unanswered-question' && issue.path === 'workflow.answers.acceptance'));
    assert.equal(parseImport(file(pack, 'project.json')).workflow.answers.acceptance, value);
  }
});

test('switching recipes preserves feature acceptance without applying it to a bug or study', () => {
  const feature = createDefault();
  feature.workflow.answers.acceptance = 'Feature acceptance that must remain separate from another recipe.';
  for (const recipeId of ['bugfix', 'feasibility']) {
    const switched = selectRecipe(feature, recipeId);
    const pack = compile(switched);
    const requirements = file(pack, 'templates/REQUIREMENTS.md');
    assert.ok(!requirements.includes(feature.workflow.answers.acceptance));
    assert.match(requirements, /\| Input or situation \|/);
    const reopened = parseImport(file(pack, 'project.json'));
    assert.equal(reopened.workflow.answers.acceptance, feature.workflow.answers.acceptance);
    assert.ok(file(compile(selectRecipe(reopened, 'feature-delivery')), 'templates/REQUIREMENTS.md').includes(feature.workflow.answers.acceptance));
  }
});

test('command requirements follow selected stages and optional lint is reported', () => {
  const config = fixture();
  config.workflow.enabledStages = ['requirements'];
  config.components.forEach(component => { component.commands.test = ''; component.commands.build = ''; component.commands.lint = ''; });
  const result = validate(config);
  assert.equal(result.configurationComplete, true);
  assert.equal(hasIssue(result, 'missing-command'), false);
  assert.equal(hasIssue(result, 'optional-command', 'warning'), true);
});

test('dependency gaps and empty workflows cannot be checked as complete', () => {
  const config = fixture();
  config.workflow.enabledStages = ['requirements', 'implementation'];
  assert.equal(hasIssue(validate(config), 'stage-dependency'), true);
  config.workflow.enabledStages = [];
  assert.equal(hasIssue(validate(config), 'missing-stage'), true);
});

test('cloud export rejects repositories outside GitHub and unsupported cloud tool aliases', () => {
  const config = fixture();
  config.project.host = 'github';
  config.project.sourceControl = 'bitbucket';
  assert.equal(hasIssue(validate(config), 'cloud-repository'), true);
  config.project.sourceControl = 'github';
  for (const tool of ['web', 'todo']) {
    config.agents[0].tools = ['read', tool];
    const result = validate(config);
    assert.equal(result.configurationComplete, false);
    assert.equal(result.formatChecked, false);
    assert.equal(hasIssue(result, 'cloud-tool'), true);
  }
});

test('host adapters emit only the documented target values and explicit tools', () => {
  for (const [host, target] of [['vscode', 'vscode'], ['github', 'github-copilot'], ['jetbrains', null]]) {
    const config = fixture();
    config.project.host = host;
    const pack = compile(config);
    const profile = file(pack, '.github/agents/analyst.agent.md');
    assert.match(profile, /^tools: \["read","search"\]$/m);
    assert.match(profile, /^description: ".+"$/m);
    assert.doesNotMatch(profile, /^model:/m);
    if (target) assert.match(profile, new RegExp(`^target: "${target}"$`, 'm'));
    else assert.doesNotMatch(profile, /^target:/m);
    assert.equal(hasIssue(pack.validation, 'preview-host', 'warning'), host === 'jetbrains');
  }
});

test('read only is incompatible with editing, shell execution and delegation', () => {
  const config = fixture();
  config.constraints.readOnly = true;
  for (const tool of ['edit', 'execute', 'agent']) {
    config.agents = [{ role: 'analyst', tools: [tool] }];
    assert.equal(hasIssue(validate(config), 'read-only-conflict'), true);
  }
  config.agents = [{ role: 'analyst', tools: ['read', 'search'] }];
  for (const stage of getStages(config)) Object.assign(config.workflow.bindings[stage.id], { actorType: 'human', actorId: '', actorName: 'Named owner' });
  assert.equal(validate(config).configurationComplete, true);
});

test('empty tools is preserved and never becomes implicit access to all tools', () => {
  const config = fixture();
  config.agents = [{ role: 'analyst', tools: [] }];
  for (const stage of getStages(config)) Object.assign(config.workflow.bindings[stage.id], { actorType: 'human', actorId: '', actorName: 'Named owner' });
  Object.assign(config.workflow.bindings.requirements, { actorType: 'agent', actorId: 'analyst', actorName: '', contextOnly: true });
  const pack = compile(config);
  assert.match(file(pack, '.github/agents/analyst.agent.md'), /^tools: \[\]$/m);
  assert.ok(hasIssue(pack.validation, 'no-tools', 'warning'));
  assert.equal(pack.validation.configurationComplete, true);
});

test('unknown capabilities, recipes and selected definitions remain errors', () => {
  const mutations = [
    [config => { config.agents[0].tools.push('*'); }, 'unknown-tool'],
    [config => { config.project.host = 'any-host'; }, 'unknown-host'],
    [config => { config.workflow.recipe = 'all-work'; }, 'unknown-recipe'],
    [config => { config.skills.push('unknown-skill'); }, 'unknown-selection'],
    [config => { config.practices.push('unknown-practice'); }, 'unknown-selection'],
    [config => { config.agents[0].role = 'unknown-role'; }, 'unknown-role'],
  ];
  for (const [mutate, expected] of mutations) {
    const config = fixture(); mutate(config);
    const result = validate(config);
    assert.equal(hasIssue(result, expected), true, expected);
    assert.equal(result.configurationComplete, false);
  }
});

test('custom technologies round trip as supplied context, without compatibility claims', () => {
  const config = fixture();
  config.components[0].technologies = [{ id: 'Internal Platform Ω', version: 'vNext' }];
  const pack = compile(config);
  assert.equal(pack.validation.configurationComplete, true);
  assert.ok(hasIssue(pack.validation, 'custom-technology', 'warning'));
  assert.match(file(pack, 'WORKFLOW.md'), /Internal Platform Ω: vNext/);
  assert.deepEqual(parseImport(file(pack, 'project.json')), config);
});

test('unsafe component path syntax is rejected without claiming file existence checks', () => {
  for (const path of ['../other', 'src/../other', '/absolute', 'C:/repo', '\\server\\share', 'src\\child', 'a//b', 'con', 'a/COM1.txt', 'a/COM¹', 'a/LPT².txt', 'a/NUL', 'a/trailing.', 'a/trailing ', 'a/new\nline']) {
    const config = fixture(); config.components[0].path = path;
    assert.equal(hasIssue(validate(config), 'unsafe-component-path'), true, path);
  }
  const config = fixture();
  config.components[0].path = '.';
  config.components[1].path = 'not-a-real-directory';
  assert.equal(validate(config).configurationComplete, true);
  assert.match(file(compile(config), 'VALIDATION.md'), /Repository path existence/);
});

test('duplicate components, technologies, roles, stages and tools are rejected', () => {
  const mutations = [
    [config => { config.components[1].id = config.components[0].id; }, 'duplicate-component'],
    [config => { config.components[0].technologies.push(config.components[0].technologies[0]); }, 'duplicate-technology'],
    [config => { config.components[0].technologies.push({ id: 'REACT', version: '' }); }, 'duplicate-technology'],
    [config => { config.agents.push(config.agents[0]); }, 'duplicate-agent'],
    [config => { config.workflow.enabledStages.push('requirements'); }, 'duplicate-selection'],
    [config => { config.skills.push('verification', 'verification'); }, 'duplicate-selection'],
    [config => { config.agents[0].tools.push('read'); }, 'duplicate-tool'],
  ];
  for (const [mutate, code] of mutations) { const config = fixture(); mutate(config); assert.ok(hasIssue(validate(config), code), code); }
});

test('schema parser rejects unsupported or lossy imports before the caller replaces state', () => {
  const current = fixture();
  let draft = current;
  for (const invalid of ['not JSON', JSON.stringify({ schemaVersion: '2.0' }), JSON.stringify({ ...current, futureField: true }), JSON.stringify({ ...current, components: null })]) {
    assert.throws(() => { draft = parseImport(invalid); });
    assert.equal(draft, current);
  }
  const unknownNested = fixture(); unknownNested.components[0].commands.deploy = 'publish';
  assert.throws(() => parseImport(JSON.stringify(unknownNested)), /Unknown field/);
  const unsupported = fixture(); unsupported.schemaVersion = '3.0';
  assert.throws(() => parseImport(JSON.stringify(unsupported)), /Unsupported schema version/);
  const invalidType = fixture(); invalidType.constraints.readOnly = 'yes';
  assert.throws(() => parseImport(JSON.stringify(invalidType)), /Expected true or false/);
  const badNote = fixture(); badNote.workflow.notes.customStage = 'unpreserved';
  assert.throws(() => parseImport(JSON.stringify(badNote)), /Unknown stage/);
  assert.throws(() => parseImport(' '.repeat(PROJECT_JSON_MAX_BYTES + 1)), /no larger than 8 MiB/);
  assert.equal(validate(null).formatChecked, false);
  assert.throws(() => compile(null), /Expected an object/);
});

test('import rejects unsupported identities and duplicates that the UI cannot preserve', () => {
  const mutations = [
    config => { config.project.host = 'somewhere'; },
    config => { config.project.sourceControl = 'unrecognized'; },
    config => { config.workflow.recipe = 'other-recipe'; },
    config => { config.workflow.enabledStages.push('custom-stage'); },
    config => { config.skills.push('custom-skill'); },
    config => { config.practices.push('custom-practice'); },
    config => { config.agents[0].role = 'custom-role'; },
    config => { config.agents[0].tools.push('custom-tool'); },
    config => { config.agents.push(config.agents[0]); },
    config => { config.skills.push('verification', 'verification'); },
    config => { config.components[1].id = config.components[0].id; },
    config => { config.components[0].technologies.push(config.components[0].technologies[0]); },
  ];
  for (const mutate of mutations) { const config = fixture(); mutate(config); assert.throws(() => parseImport(JSON.stringify(config))); }
  assert.deepEqual(parseImport(JSON.stringify(createDefault())), createDefault());
  const conflict = fixture(); conflict.constraints.readOnly = true;
  assert.deepEqual(parseImport(JSON.stringify(conflict)), conflict);
  const dependency = fixture(); dependency.workflow.enabledStages = ['verification'];
  assert.deepEqual(parseImport(JSON.stringify(dependency)), dependency);
});

test('entered text remains data and command fences cannot be prematurely closed', () => {
  const config = fixture();
  config.project.name = '# [Name](missing.md) <script>alert(1)</script>';
  config.project.purpose = '```\n[untrusted](missing.md)\n---\ntools: ["*"]\n```';
  config.components[0].commands.test = 'npm test\n```\n# injected heading\n`````\n[bad](other.md)';
  config.constraints.notes = '---\ntarget: any\n[ignore](../../not-in-pack.md)';
  const pack = compile(config);
  assert.equal(pack.validation.configurationComplete, true);
  assert.equal(pack.validation.formatChecked, true);
  assert.equal(hasIssue(pack.validation, 'missing-reference'), false);
  assert.deepEqual(parseImport(file(pack, 'project.json')), config);
  const workflow = file(pack, 'WORKFLOW.md');
  assert.match(workflow, /``````text\nnpm test\n```\n# injected heading\n`````\n\[bad\]\(other.md\)\n``````/);
  assert.match(file(pack, '.github/agents/analyst.agent.md'), /^tools: \["read","search"\]$/m);
});

test('every generated resource reference resolves within a safe complete layout', () => {
  const config = fixture();
  config.skills = CATALOG.skills.map(skill => skill.id);
  config.agents = CATALOG.roles.map(role => ({ role: role.id, tools: role.defaultTools }));
  config.practices = CATALOG.practices.map(practice => practice.id);
  const pack = compile(config);
  const paths = new Set(pack.files.map(item => item.path));
  assert.equal(paths.size, pack.files.length);
  for (const item of pack.files) {
    assert.ok(!item.path.startsWith('/') && !item.path.includes('..') && !item.path.includes('\\'));
    for (const match of item.content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (match[1].startsWith('https://')) continue;
      const resolved = posix.normalize(posix.join(posix.dirname(item.path), match[1]));
      assert.ok(paths.has(resolved), `${item.path} -> ${resolved}`);
    }
    if (item.path.endsWith('/SKILL.md')) {
      const name = JSON.parse(item.content.match(/^name: (.+)$/m)[1]);
      assert.equal(name, posix.basename(posix.dirname(item.path)));
      assert.ok(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) && name.length <= 64);
      assert.ok(JSON.parse(item.content.match(/^description: (.+)$/m)[1]).length <= 1024);
      assert.ok(item.content.split('\n').length < 500);
    }
  }
});

test('compiler regeneration is deterministic, importable and does not mutate its input', () => {
  const config = fixture();
  config.project.name = 'Σχέδιο 日本語';
  config.constraints.notes = '';
  const before = JSON.stringify(config);
  const first = compile(config);
  const second = compile(parseImport(file(first, 'project.json')));
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(config), before);
  assert.equal(first.stats.bytes, first.files.reduce((sum, item) => sum + Buffer.byteLength(item.content), 0));
  const reordered = Object.fromEntries(Object.entries(config).reverse());
  reordered.project = Object.fromEntries(Object.entries(config.project).reverse());
  assert.deepEqual(compile(reordered), first);
  assert.doesNotMatch(file(first, 'WORKFLOW.md'), /UNRESOLVED: no stage override|UNRESOLVED: no additional constraint/);
  assert.match(file(first, 'WORKFLOW.md'), /No additional project instructions supplied for this step/);
  assert.match(file(first, 'WORKFLOW.md'), /No additional constraint notes supplied/);
});

test('catalog source records identify local adaptation and primary references', () => {
  assert.equal(CATALOG.schemaVersion, '2.0');
  assert.equal(Object.isFrozen(CATALOG.roles[0].defaultTools), true);
  for (const practice of CATALOG.practices) {
    assert.ok(practice.source.startsWith('https://'));
    assert.ok(practice.version && practice.limits && practice.description);
  }
  assert.deepEqual(TOOL_ALIASES, ['read', 'search', 'edit', 'execute', 'agent', 'web', 'todo']);
  const config = fixture();
  config.practices = CATALOG.practices.map(practice => practice.id);
  const source = file(compile(config), 'SOURCES.md');
  assert.match(source, /not upstream release versions/);
  assert.match(source, /github.com\/DietrichGebert\/ponytail/);
  assert.match(source, /gist.github.com\/karpathy/);
  assert.match(source, /does not establish a measured token or cost saving/);
});

test('each intent has distinct stages and focused procedure outputs', () => {
  const examples = ['feasibility', 'bugfix', 'feature-delivery'].map(id => createExample(id));
  const packs = examples.map(compile);
  for (const pack of packs) {
    assert.equal(pack.validation.configurationComplete, true);
    assert.equal(pack.validation.formatChecked, true);
  }
  assert.match(file(packs[0], 'WORKFLOW.md'), /Recommend go or no-go/);
  assert.match(file(packs[1], 'WORKFLOW.md'), /Reproduce the observed problem/);
  assert.match(file(packs[2], 'WORKFLOW.md'), /Release and production/);
  assert.equal(file(packs[0], '.github/skills/verification/SKILL.md'), undefined);
  assert.equal(file(packs[0], '.github/skills/implementation/SKILL.md'), undefined);
  assert.ok(file(packs[0], 'templates/DECISION.md'));
  assert.ok(file(packs[1], 'templates/VERIFICATION.md'));
  assert.equal(new Set(examples.flatMap(config => getStages(config).map(stage => stage.id))).size, CATALOG.stages.length);
});

test('verification can use a supplied existing change without forcing earlier development', () => {
  const config = fixture();
  config.workflow.enabledStages = ['verification'];
  assert.ok(hasIssue(validate(config), 'stage-dependency'));
  config.workflow.suppliedInputs.implementation = 'Existing change abc123 and acceptance record docs/acceptance.md';
  const pack = compile(config);
  assert.equal(pack.validation.configurationComplete, true);
  assert.match(file(pack, 'WORKFLOW.md'), /Existing change abc123/);
  assert.doesNotMatch(file(pack, 'WORKFLOW.md'), /### Development/);
});

test('human and external handoffs work without unnecessary agent or command requirements', () => {
  const config = fixture();
  config.agents = [];
  config.components.forEach(component => { component.commands.test = ''; component.commands.build = ''; });
  for (const stage of getStages(config)) Object.assign(config.workflow.bindings[stage.id], { actorType: 'human', actorId: '', actorName: 'Engineering owner' });
  Object.assign(config.workflow.bindings.verification, { actorType: 'external', actorName: 'Existing test pipeline' });
  const pack = compile(config);
  assert.equal(pack.validation.configurationComplete, true);
  assert.match(file(pack, 'WORKFLOW.md'), /External system: Existing test pipeline/);
  assert.equal(pack.files.some(item => item.path.endsWith('.agent.md')), false);
});

test('agent-run checks cannot become complete by removing all components', () => {
  for (const recipe of ['bugfix', 'feature-delivery']) {
    const config = createExample(recipe);
    config.components = [];
    assert.equal(hasIssue(validate(config), 'missing-component'), true, recipe);
    assert.equal(compile(config).validation.configurationComplete, false, recipe);
    for (const stage of getStages(config)) if (config.workflow.bindings[stage.id].actorType === 'agent') config.workflow.bindings[stage.id].contextOnly = true;
    assert.equal(validate(config).configurationComplete, true, `${recipe} supplied-context review`);
    for (const stage of getStages(config)) Object.assign(config.workflow.bindings[stage.id], { actorType: stage.id === 'verification' ? 'external' : 'human', actorId: '', actorName: 'Named check owner', contextOnly: false });
    assert.equal(validate(config).configurationComplete, true, `${recipe} human or external checks`);
  }
  const study = createExample('feasibility');
  study.components = [];
  assert.equal(validate(study).configurationComplete, true);
  assert.equal(hasIssue(validate(study), 'missing-component', 'warning'), true);
  const release = fixture();
  release.components = [];
  release.workflow.enabledStages = ['release'];
  release.workflow.suppliedInputs.verification = 'Existing observed verification record';
  release.agents.find(agent => agent.role === 'analyst').tools.push('execute');
  Object.assign(release.workflow.bindings.release, { actorType: 'agent', actorId: 'analyst', actorName: '', contextOnly: false });
  const result = validate(release);
  assert.equal(result.configurationComplete, false);
  assert.match(result.issues.find(issue => issue.code === 'missing-component' && issue.severity === 'error').message, /build checks need a repository component/);
});

test('agent work requires the relevant capability unless explicitly reviewing supplied context', () => {
  const config = fixture();
  config.workflow.enabledStages = ['implementation'];
  config.workflow.suppliedInputs.breakdown = 'Approved task docs/task.md';
  config.agents.find(agent => agent.role === 'implementer').tools = ['read'];
  assert.ok(hasIssue(validate(config), 'stage-capability'));
  config.workflow.bindings.implementation.contextOnly = true;
  assert.equal(hasIssue(validate(config), 'stage-capability'), false);
  assert.equal(hasIssue(validate(config), 'context-only-stage', 'warning'), true);
  config.workflow.bindings.implementation.actorId = 'missing';
  assert.ok(hasIssue(validate(config), 'missing-actor'));
});

test('skills are assigned to the relevant role rather than every exported agent', () => {
  const config = fixture();
  config.agents.push({ role: 'reviewer', tools: ['read', 'search'] });
  const pack = compile(config);
  assert.match(file(pack, '.github/agents/analyst.agent.md'), /impact-analysis\/SKILL.md/);
  assert.doesNotMatch(file(pack, '.github/agents/analyst.agent.md'), /verification\/SKILL.md/);
  assert.match(file(pack, '.github/agents/implementer.agent.md'), /verification\/SKILL.md/);
  assert.doesNotMatch(file(pack, '.github/agents/reviewer.agent.md'), /impact-analysis\/SKILL.md/);
  config.workflow.enabledStages = ['requirements'];
  const requirementsPack = compile(config);
  assert.equal(file(requirementsPack, '.github/skills/verification/SKILL.md'), undefined);
  config.skills.push('verification');
  assert.ok(file(compile(config), '.github/skills/verification/SKILL.md'));
  assert.ok(hasIssue(validate(config), 'library-skill', 'warning'));
});

test('legacy migration preserves facts, notes, commands, explicit tools and extra skills', () => {
  const current = fixture();
  const legacy = Object.fromEntries(['project', 'components', 'skills', 'agents', 'practices', 'constraints'].map(key => [key, current[key]]));
  legacy.schemaVersion = '1.0';
  legacy.workflow = { recipe: 'feature-delivery', enabledStages: ['requirements'], notes: { requirements: 'Original user note' } };
  legacy.skills = ['impact-analysis', 'verification'];
  legacy.agents = [{ role: 'analyst', tools: [] }];
  const migrated = parseImport(JSON.stringify(legacy));
  assert.equal(migrated.schemaVersion, '2.0');
  for (const key of ['project', 'components', 'skills', 'agents', 'practices', 'constraints']) assert.deepEqual(migrated[key], legacy[key]);
  assert.deepEqual(migrated.workflow.notes, legacy.workflow.notes);
  assert.deepEqual(migrated.workflow.enabledStages, ['requirements']);
  assert.ok(getEffectiveSkills(migrated).some(skill => skill.id === 'verification'));
  assert.match(file(compile(migrated), '.github/agents/analyst.agent.md'), /^tools: \[\]$/m);
  const unpreserved = { ...legacy, futureField: 'keep this' };
  assert.throws(() => parseImport(JSON.stringify(unpreserved)), /Unknown field/);
});

test('recipe switching preserves prior user work and allows deliberate return', () => {
  const config = fixture();
  config.workflow.notes.requirements = 'Original feature decision';
  config.workflow.bindings.requirements.actorName = 'Named owner';
  config.workflow.answers.acceptance = 'Original acceptance';
  const before = JSON.stringify(config);
  const study = selectRecipe(config, 'feasibility');
  study.workflow.notes['current-process'] = 'Study observation';
  const returned = selectRecipe(study, 'feature-delivery');
  assert.equal(JSON.stringify(config), before);
  assert.equal(returned.workflow.notes.requirements, 'Original feature decision');
  assert.equal(returned.workflow.bindings.requirements.actorName, 'Named owner');
  assert.equal(returned.workflow.notes['current-process'], 'Study observation');
  assert.equal(returned.workflow.answers.acceptance, 'Original acceptance');
  assert.deepEqual(parseImport(JSON.stringify(returned)), returned);
});

test('recording a requirement cannot become verified implementation or observed evidence', () => {
  const config = createBackendExample();
  const first = compile(config);
  const manifest = JSON.parse(file(first, 'manifest.json'));
  assert.equal(manifest.validation.behaviorObserved, false);
  assert.equal(manifest.validation.improvementEstablished, false);
  assert.ok(config.runtime.controls.every(control => control.status === 'requirement'));
  config.runtime.controls[0].status = 'evidence-recorded';
  assert.ok(hasIssue(validate(config), 'unsupported-control'));
  config.runtime.controls[0].implementation = 'src/validation.ts';
  config.runtime.controls[0].evidenceId = 'check-1';
  config.evidence.push({ id: 'check-1', stageId: 'experiment-plan', check: 'Invalid input is rejected', expected: 'No write', observed: '', status: 'planned', method: 'user-recorded', source: '', reviewer: '' });
  assert.ok(hasIssue(validate(config), 'unsupported-control'));
  Object.assign(config.evidence[0], { observed: 'Unexpected write observed', status: 'failed', source: 'recorded-test.log', reviewer: 'Engineering owner' });
  const failed = compile(config);
  assert.equal(failed.validation.configurationComplete, true);
  assert.match(file(failed, 'EVIDENCE.md'), /Status: failed/);
  assert.equal(JSON.parse(file(failed, 'manifest.json')).validation.behaviorObserved, false);
});

test('confirmed facts and accepted outcomes need supporting supplied records', () => {
  const config = fixture();
  config.facts.push({ id: 'fact-1', claim: 'Test command comes from the pipeline', status: 'confirmed', source: '', revision: '', reviewer: '', notes: '' });
  assert.ok(hasIssue(validate(config), 'unsupported-confirmation'));
  Object.assign(config.facts[0], { source: 'ci.yml:42', reviewer: 'Maintainer' });
  config.evidence.push({ id: 'result-1', stageId: 'verification', check: 'Test run', expected: 'Pass', observed: '', status: 'passed', method: 'tool-observed', source: '', reviewer: '' });
  assert.ok(hasIssue(validate(config), 'unsupported-evidence'));
  Object.assign(config.evidence[0], { observed: '18 passing tests', source: 'test-output.txt', reviewer: 'Reviewer' });
  const pack = compile(config);
  assert.equal(pack.validation.configurationComplete, true);
  assert.ok(hasIssue(pack.validation, 'external-evidence', 'warning'));
  assert.equal(pack.validation.hostExercised, false);
  assert.match(file(pack, 'EVIDENCE.md'), /not run, authenticated or independently verified/);
});

test('complete skill directories resolve all resources without root pack dependencies', () => {
  const config = fixture();
  for (const skill of getEffectiveSkills(config)) {
    const pack = compileStandaloneSkill(config, skill.id);
    const paths = new Set(pack.files.map(item => item.path));
    assert.equal(pack.validation.formatChecked, true);
    for (const item of pack.files.filter(item => item.path.startsWith(`${skill.id}/`))) for (const match of item.content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      if (match[1].startsWith('https://')) continue;
      const resolved = posix.normalize(posix.join(posix.dirname(item.path), match[1]));
      assert.ok(paths.has(resolved), `${item.path} -> ${resolved}`);
      assert.ok(resolved.startsWith(`${skill.id}/`));
    }
  }
  assert.throws(() => compileStandaloneSkill(config, '../outside'), /supported skill/);
});

test('technology profiles add questions without inventing commands or compatibility', () => {
  const config = fixture();
  config.workflow.answers['technology-spring-boot-0'] = 'Actual API examples recorded in docs/api-contract.md';
  config.components[0].technologies.push({ id: 'sparql', version: '' });
  const sources = file(compile(config), 'SOURCES.md');
  assert.match(sources, /controller and actual server/);
  assert.match(sources, /manual interaction/);
  assert.match(sources, /shape conformance and domain correctness/);
  assert.match(sources, /Actual API examples recorded/);
  assert.deepEqual(parseImport(JSON.stringify(config)), config);
  assert.match(sources, /do not establish engine configuration/);
  config.components[0].commands.test = '';
  assert.match(file(compile(config), '.github/skills/verification/references/project.md'), /UNRESOLVED: test command/);
});

test('artifact reasons connect outputs with stages and roles', () => {
  const config = fixture();
  const pack = compile(config);
  const reason = pack.reasons['.github/agents/implementer.agent.md'];
  assert.deepEqual(reason.roles, ['implementer']);
  assert.ok(reason.stages.includes('implementation'));
  assert.ok(reason.purpose.length > 10);
  assert.deepEqual(pack.reasons['WORKFLOW.md'].stages, config.workflow.enabledStages);
});

test('agent release work needs build execution while human and external handoffs remain valid', () => {
  const config = fixture();
  config.workflow.enabledStages = ['release'];
  config.workflow.suppliedInputs.verification = 'Reviewed verification record docs/results.md';
  Object.assign(config.workflow.bindings.release, { actorType: 'agent', actorId: 'analyst', actorName: '' });
  assert.ok(hasIssue(validate(config), 'stage-capability'));
  config.agents.find(agent => agent.role === 'analyst').tools.push('execute');
  assert.equal(validate(config).configurationComplete, true);
  config.components[0].commands.build = '';
  assert.ok(hasIssue(validate(config), 'missing-command'));
  Object.assign(config.workflow.bindings.release, { actorType: 'external', actorId: '', actorName: 'Existing release system' });
  assert.equal(validate(config).configurationComplete, true);
  Object.assign(config.workflow.bindings.release, { actorType: 'human', actorName: 'Release owner' });
  assert.equal(validate(config).configurationComplete, true);
});

test('retained unassigned roles guide review without implying implementation in a study', () => {
  const source = fixture();
  const config = selectRecipe(source, 'feasibility');
  const pack = compile(config);
  assert.deepEqual(config.agents, source.agents);
  const profile = file(pack, '.github/agents/implementer.agent.md');
  assert.ok(profile);
  assert.match(profile, /profile retained without a stage assignment/);
  assert.match(profile, /presence does not authorize implementation, execution or external changes/);
  assert.doesNotMatch(profile, /Follow the delivery plan and existing conventions/);
  assert.doesNotMatch(profile, /verification\/SKILL.md/);
  assert.equal(file(pack, '.github/skills/implementation/SKILL.md'), undefined);
});
