import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipe, createExample, compile, serializeProject } from '../factory/core.mjs';
import { getDecisionBrief, renderDecisionBrief } from '../factory/decision-brief.mjs';
import { recommendOutput } from '../factory/journey.mjs';
import { packageProject, buildProjectAtlas, readProjectFiles } from '../factory/portable.mjs';
import { createDocumentWorkflowFixture, createBackendWorkflowFixture } from '../factory/workflow-fixtures.mjs';

const file = (pack, path) => pack.files.find(item => item.path === path)?.content;
const overview = html => html.split('<section class="pane" id="overview" data-pane>')[1].split('<section class="pane" id="workflow" data-pane>')[0];

test('custom-only brief and recommendation do not inherit dormant recipe answers or a study decision record', () => {
  const config = createDocumentWorkflowFixture();
  config.project.purpose = '';
  config.workflow.answers['desired-outcome'] = 'DORMANT_STUDY_OUTCOME';
  config.workflow.notes.options = 'DORMANT_STUDY_APPROACH';
  const before = serializeProject(config);
  const brief = getDecisionBrief(config);
  assert.equal(brief.outcome.text, '');
  assert.equal(brief.outcome.source, '');
  assert.ok(brief.unresolved.some(item => item.path === 'project.purpose'));
  assert.ok(brief.approach.records.every(record => record.processId === 'document-review'));
  const html = renderDecisionBrief(config, { editable: true });
  assert.doesNotMatch(html, /DORMANT_STUDY|What must the study decide|Editing them is the next step/);
  assert.match(html, /data-pe-open="document-review"/);
  assert.match(html, /Review and apply changes, then download/);
  assert.doesNotMatch(recommendOutput(config).reason, /decision record/);
  assert.match(recommendOutput(config).reason, /process, its connections and planned checks/);
  assert.equal(serializeProject(config), before);
});

test('custom entry owners follow recorded entry IDs and remain separate process starts', () => {
  const config = createDocumentWorkflowFixture();
  const second = structuredClone(config.workflowModel.processes[0]);
  second.id = 'second-process';
  second.name = 'A separate document review';
  second.steps[0].actor.name = 'Second author';
  config.workflowModel.processes[0].steps.reverse();
  config.workflowModel.processes.push(second);
  const brief = getDecisionBrief(config);
  assert.deepEqual(brief.planned.map(item => [item.processId, item.stepId, item.owner]), [
    ['document-review', 'draft', 'Example author'],
    ['second-process', 'draft', 'Second author'],
  ]);
  const html = renderDecisionBrief(config);
  assert.match(html, /Who starts each process/);
  assert.match(html, /Processes do not automatically start one another/);
  assert.doesNotMatch(html, /Planned recipe order|data-pe-open|data-open-editor/);
  assert.match(html, /snapshot is read only/);
});

test('a fresh process project shows a missing design without resurrecting inactive recipe stages', () => {
  const config = createRecipe('feasibility');
  config.workflowModel.processes = [];
  config.components = [];
  config.agents = [];
  const brief = getDecisionBrief(config);
  assert.deepEqual(brief.planned, []);
  assert.ok(brief.unresolved.some(item => item.path === 'workflowModel.processes'));
  assert.ok(!brief.unresolved.some(item => item.path.startsWith('workflow.answers.')));
  assert.match(renderDecisionBrief(config, { editable: true }), /data-pe-new=""/);
  assert.doesNotMatch(renderDecisionBrief(config), /data-pe-new/);
});

test('custom brief escapes supplied text and retains complete long purposes behind disclosure', () => {
  const config = createDocumentWorkflowFixture();
  config.project.purpose = 'Complete intended result. '.repeat(35);
  config.workflowModel.processes[0].purpose = 'Full process purpose. '.repeat(35);
  config.workflowModel.processes[0].steps[0].actor.name = '<img src=x onerror=alert(1)>';
  const html = renderDecisionBrief(config);
  assert.match(html, /Full recorded outcome and process purposes/);
  assert.ok(html.includes(config.project.purpose));
  assert.ok(html.includes(config.workflowModel.processes[0].purpose));
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
});

test('portable custom overview counts its planned steps and people instead of reporting an empty recipe', () => {
  const config = createDocumentWorkflowFixture();
  const html = buildProjectAtlas(config, compile(config));
  const visibleOverview = overview(html);
  assert.match(visibleOverview, /<strong>4<\/strong><span>planned steps<\/span>/);
  assert.match(visibleOverview, /0 agent assignments, 4 human assignments, 0 system assignments/);
  assert.match(visibleOverview, /4 planned steps, 18 outcome routes/);
  assert.doesNotMatch(visibleOverview, /No workflow stages selected|0<\/strong><span>workflow stages/);
  assert.doesNotMatch(html.split('<script id="workflow-atlas-project"')[0], /No recipe stages selected/);
  assert.match(visibleOverview, /href="#workflow" data-view="workflow"/);
});

test('mixed recipe and custom overview includes both sets of planned work', () => {
  const config = createBackendWorkflowFixture();
  const visibleOverview = overview(buildProjectAtlas(config, compile(config)));
  assert.match(visibleOverview, /<strong>11<\/strong><span>planned steps<\/span>/);
  assert.match(visibleOverview, /Create a checked configuration/);
  assert.match(visibleOverview, /data-open-stage="current-process"/);
  assert.match(visibleOverview, /6 planned steps, 31 outcome routes/);
});

test('portable manifest and reasons associate only active recipe stages and namespaced custom steps', async () => {
  const config = createDocumentWorkflowFixture();
  const before = serializeProject(config);
  const pack = packageProject(config, compile(config));
  const manifest = JSON.parse(file(pack, 'manifest.json'));
  const record = manifest.artifacts.find(item => item.path === 'PROJECT-ATLAS.html');
  const expectedSteps = ['document-review/draft', 'document-review/review', 'document-review/revise', 'document-review/handoff'];
  assert.deepEqual(record.stages, []);
  assert.deepEqual(record.processes, ['document-review']);
  assert.deepEqual(record.steps, expectedSteps);
  assert.deepEqual(pack.reasons['PROJECT-ATLAS.html'].stages, []);
  assert.deepEqual(pack.reasons['PROJECT-ATLAS.html'].steps, expectedSteps);
  const reopened = await readProjectFiles([new File([file(pack, 'PROJECT-ATLAS.html')], 'review.html')]);
  assert.deepEqual(reopened.config, config);
  assert.equal(serializeProject(config), before);
});

test('recipe-only wording and active stage associations retain their existing meaning', () => {
  const config = createExample('feasibility');
  const pack = packageProject(config, compile(config));
  const visibleOverview = overview(file(pack, 'PROJECT-ATLAS.html'));
  assert.match(visibleOverview, /<strong>5<\/strong><span>workflow stages<\/span>/);
  assert.match(visibleOverview, /Follow a stage to see its owner/);
  assert.match(recommendOutput(config).reason, /evidence and a decision record/);
  assert.deepEqual(pack.reasons['PROJECT-ATLAS.html'].stages, config.workflow.enabledStages);
  assert.deepEqual(pack.reasons['PROJECT-ATLAS.html'].steps, []);
});
