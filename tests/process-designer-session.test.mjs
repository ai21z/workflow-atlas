import test from 'node:test';
import assert from 'node:assert/strict';
import { createRecipe } from '../factory/core.mjs';
import { createProcessDraft, applyProcessEdit } from '../factory/process-editor.mjs';
import { assessProcessDraftBase, copyProcessDraft } from '../factory/process-designer.mjs';

const clone = value => structuredClone(value);
const processConfig = () => {
  const config = createRecipe();
  const process = createProcessDraft({id:'review-request',name:'Review a request',patternId:'review-gate'});
  return applyProcessEdit(config,process.id,process).config;
};

test('a pending process edit rebases onto unrelated Brief decisions without reverting them', () => {
  const base = processConfig();
  const pending = clone(base.workflowModel.processes.find(process=>process.id==='review-request'));
  pending.steps[0].name = 'Prepare a revised request';
  const latest = clone(base);
  latest.project.purpose = 'The independently revised outcome.';
  latest.workflow.answers.acceptance = 'A separately recorded acceptance decision.';
  assert.equal(assessProcessDraftBase(base,latest,pending.id,pending).status,'rebase');
  const applied = applyProcessEdit(latest,pending.id,pending).config;
  assert.equal(applied.project.purpose,latest.project.purpose);
  assert.deepEqual(applied.workflow.answers,latest.workflow.answers);
  assert.equal(applied.workflowModel.processes.find(process=>process.id===pending.id).steps[0].name,pending.steps[0].name);
  assert.equal(base.project.purpose,'');
});

test('a same-process change or deletion is a conflict and preserves both versions for explicit recovery', () => {
  const base = processConfig();
  const pending = clone(base.workflowModel.processes.find(process=>process.id==='review-request'));
  pending.steps[0].action = 'My buffered action';
  const latest = clone(base);
  latest.workflowModel.processes.find(process=>process.id===pending.id).steps[0].action = 'A newer committed action';
  const result = assessProcessDraftBase(base,latest,pending.id,pending);
  assert.equal(result.status,'conflict');
  assert.equal(result.before.steps[0].action,'');
  assert.equal(result.current.steps[0].action,'A newer committed action');
  assert.equal(pending.steps[0].action,'My buffered action');
  result.current.steps[0].action='Inspection does not mutate the committed configuration';
  assert.equal(latest.workflowModel.processes.find(process=>process.id===pending.id).steps[0].action,'A newer committed action');
  latest.workflowModel.processes=latest.workflowModel.processes.filter(process=>process.id!==pending.id);
  assert.equal(assessProcessDraftBase(base,latest,pending.id,pending).status,'conflict');
});

test('keeping both versions creates a distinct editable process without moving existing observations', () => {
  const config=processConfig();
  const pending=clone(config.workflowModel.processes.find(process=>process.id==='review-request'));
  pending.steps[0].action='A pending action';
  const copied=copyProcessDraft(pending,config);
  assert.equal(copied.id,'review-request-copy');
  assert.equal(copied.name,'Review a request copy');
  assert.deepEqual(copied.steps,pending.steps);
  const next=applyProcessEdit(config,copied.id,copied).config;
  assert.equal(next.workflowModel.processes.length,config.workflowModel.processes.length+1);
  assert.equal(next.workflowModel.processes.find(process=>process.id===pending.id).steps[0].action,'');
  assert.equal(next.workflowModel.processes.find(process=>process.id===copied.id).steps[0].action,'A pending action');
  assert.deepEqual(next.workflowModel.evidenceLinks,config.workflowModel.evidenceLinks);
});

test('new process ID collisions require explicit recovery instead of overwriting an accepted process', () => {
  const base=createRecipe();
  const pending=createProcessDraft({id:'process',name:'Pending new process'});
  const latest=applyProcessEdit(base,'process',createProcessDraft({id:'process',name:'Accepted new process'})).config;
  assert.equal(assessProcessDraftBase(base,latest,'',pending).status,'conflict');
  assert.equal(assessProcessDraftBase(base,base,'',pending).status,'unchanged');
  assert.equal(assessProcessDraftBase(base,null,'',pending).status,'unavailable');
});
