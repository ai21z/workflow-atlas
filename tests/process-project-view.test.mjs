import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipe, getStages } from '../factory/core.mjs';
import { createProcessDraft } from '../factory/process-editor.mjs';
import { renderProjectView } from '../factory/project-view.mjs';

const pack = { files: [], validation: { issues: [] } };
function customProject(processes) {
  const config = createRecipe('feasibility');
  config.project.name = 'Our process';
  config.project.purpose = 'Make the work clear.';
  config.workflowModel.processes = processes;
  return config;
}
const process = (id, kind = 'manual') => createProcessDraft({ id, name: `${kind} process`, kind, patternId: 'sequence' });

test('a manual-only overview presents its real steps without inactive recipe prompts', () => {
  const draft = process('manual-work');
  draft.steps[0].actor.name = 'Document author';
  draft.steps[1].actor.name = 'Team lead';
  draft.purpose = 'Prepare and hand over the document.';
  const config = customProject([draft]);
  assert.equal(config.workflow.enabledStages.length, 5);
  const html = renderProjectView(config, pack);
  assert.match(html, /Review 2 planned steps across 1 process/);
  assert.match(html, /<strong>2<\/strong><span>planned process steps<\/span>/);
  assert.match(html, /A team process/);
  assert.match(html, /Document author/);
  assert.match(html, /Team lead/);
  assert.match(html, /Prepare and hand over the document/);
  assert.match(html, /data-pe-open="manual-work" data-pe-step="prepare"/);
  assert.match(html, /No software components recorded. Add them only if this process needs them/);
  assert.doesNotMatch(html, /Review 0 selected stages|Choose the stages that belong|Change recipe|workflow stages<\/span>|data-select-stage=/);
});

test('custom application and development processes retain their different meanings and assignments', () => {
  const application = process('service', 'application');
  application.steps[0].actor = { type: 'external', id: '', name: 'Proposed service', contextOnly: false };
  const development = process('build', 'development');
  development.steps[0].actor = { type: 'agent', id: 'reviewer', name: '', contextOnly: true };
  const html = renderProjectView(customProject([application, development]), pack);
  assert.match(html, /Review 4 planned steps across 2 processes/);
  assert.match(html, /How it works when used/);
  assert.match(html, /How we build it/);
  assert.match(html, /Proposed service/);
  assert.match(html, /context only/);
  assert.match(html, /Application actors need their own implementation and permissions/);
  assert.match(html, /The list does not imply execution order/);
  assert.match(html, /data-pe-open="service" data-pe-step="prepare"/);
  assert.match(html, /data-pe-open="build" data-pe-step="prepare"/);
});

test('missing custom actors and purposes remain visibly unresolved instead of inheriting recipe owners', () => {
  const draft = process('unresolved');
  draft.steps[0].actor.type = 'external';
  const html = renderProjectView(customProject([draft]), pack);
  assert.match(html, /System still to name/);
  assert.match(html, /Person still to name/);
  assert.match(html, /The purpose of this process is still to decide/);
  assert.doesNotMatch(html, /No stage skills assigned|No agent stages selected/);
});

test('empty custom authoring state offers process design rather than a hidden recipe', () => {
  const html = renderProjectView(customProject([]), pack);
  assert.match(html, /Design a process to connect the work/);
  assert.match(html, /No process designed yet. Open Workflow to add one/);
  assert.match(html, /No process steps yet/);
  assert.doesNotMatch(html, /Choose the stages that belong|Change recipe|Review 0 selected stages/);
});

test('custom names and assignment wording are escaped in text and navigation attributes', () => {
  const draft = process('safe-id');
  draft.name = '<script>untrusted</script>';
  draft.steps[0].name = 'Owner "scope" <unsafe>';
  draft.steps[0].actor.name = '<img src=x onerror=alert(1)>';
  const html = renderProjectView(customProject([draft]), pack);
  assert.match(html, /&lt;script&gt;untrusted&lt;\/script&gt;/);
  assert.match(html, /Owner &quot;scope&quot; &lt;unsafe&gt;/);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<script>untrusted|<img src=x|<unsafe>/);
});

test('existing recipe overviews keep their stage metrics, controls and ownership presentation', () => {
  const config = createRecipe('feature-delivery');
  const count = getStages(config).length;
  const html = renderProjectView(config, pack);
  assert.ok(html.includes(`Review ${count} selected stages`));
  assert.ok(html.includes(`<strong>${count}</strong><span>workflow stages</span>`));
  assert.match(html, /Change recipe/);
  assert.match(html, /data-select-stage="requirements"/);
  assert.doesNotMatch(html, /planned process steps<\/span>|Review 0 selected stages/);
});
