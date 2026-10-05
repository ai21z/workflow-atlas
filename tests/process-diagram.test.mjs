import test from 'node:test';
import assert from 'node:assert/strict';
import { createProcessDraft } from '../factory/process-editor.mjs';
import { createBackendWorkflowFixture } from '../factory/workflow-fixtures.mjs';
import { processDiagramConnections, processLayout, renderProcessDiagram } from '../factory/process-diagram.mjs';

const starter = patternId => createProcessDraft({ id: 'custom', name: 'Our process', patternId });

test('correction exhaustion leaves the decision step and reaches the recorded stopping terminal', () => {
  const process = starter('bounded-correction');
  const connections = processDiagramConnections(process);
  const exhausted = connections.filter(connection => connection.labels.includes('Limit reached'));
  assert.equal(exhausted.length, 1);
  assert.equal(exhausted[0].fromStepId, 'review');
  assert.deepEqual(exhausted[0].to, { type: 'terminal', id: 'exhausted' });
  assert.equal(exhausted[0].correction, true);
  const correction = connections.find(connection => connection.to.id === 'revise');
  assert.deepEqual(correction.labels, ['changes requested, within limit']);
  assert.equal(process.corrections[0].maxCorrections, null);
  assert.match(renderProcessDiagram(process, { selectedStepId: 'review' }), /<tspan[^>]*>Limit reached<\/tspan>/);
});

test('outcomes sharing a source and destination appear on one grouped connection', () => {
  const process = createBackendWorkflowFixture().workflowModel.processes.find(item => item.source === 'custom');
  const original = JSON.stringify(process);
  const connections = processDiagramConnections(process);
  const stopping = connections.filter(connection => connection.fromStepId === 'check' && connection.to.type === 'terminal' && connection.to.id === 'blocked');
  assert.equal(stopping.length, 1);
  assert.deepEqual(stopping[0].labels, ['unavailable', 'blocked']);
  assert.equal(JSON.stringify(process), original);
  const rendered = renderProcessDiagram(process, { selectedStepId: 'check' });
  assert.equal((rendered.match(/<title>unavailable, blocked<\/title>/g) || []).length, 1);
  assert.match(rendered, /unavailable · blocked/);
});

test('grouping preserves independent source steps and kinds of destination', () => {
  const process = starter('sequence');
  process.terminals.push({ id: 'handoff', name: 'Stop at handoff', status: 'stopped' });
  process.transitions.push({ id: 'prepare-stop', fromStepId: 'prepare', outcome: 'stop', to: { type: 'terminal', id: 'handoff' } });
  const connections = processDiagramConnections(process);
  assert.equal(connections.filter(connection => connection.to.id === 'handoff').length, 2);
  assert.equal(connections.filter(connection => connection.fromStepId === 'prepare').length, 3);
});

test('correction exhaustion labels can share a terminal without drawing coincident control arrows', () => {
  const process = starter('bounded-correction');
  process.corrections[0].exhaustedTerminalId = 'stopped';
  const stop = processDiagramConnections(process).filter(connection => connection.fromStepId === 'review' && connection.to.id === 'stopped');
  assert.equal(stop.length, 1);
  assert.deepEqual(stop[0].labels, ['unavailable', 'Limit reached']);
  assert.equal(stop[0].correction, true);
});

test('input relationships stay separate from control routes and group their result labels', () => {
  const process = starter('sequence');
  process.results.push({ ...process.results[0], id: 'notes', name: 'Preparation notes' });
  process.steps.find(step => step.id === 'handoff').inputIds.push('notes');
  assert.equal(processDiagramConnections(process).some(connection => connection.kind === 'input'), false);
  const connections = processDiagramConnections(process, { showInputs: true });
  const input = connections.filter(connection => connection.kind === 'input');
  assert.equal(input.length, 1);
  assert.deepEqual(input[0].labels, ['Result to prepare', 'Preparation notes']);
  assert.ok(connections.some(connection => connection.kind === 'control' && connection.fromStepId === input[0].fromStepId && connection.to.id === input[0].to.id));
  const rendered = renderProcessDiagram(process, { showInputs: true, selectedStepId: 'handoff' });
  const inputPath = rendered.match(/class="pd-edge is-input[^\"]*".*?<path d="([^\"]+)"/s)?.[1];
  const controlPath = rendered.match(/class="pd-edge is-route[^\"]*".*?<path d="([^\"]+)"/s)?.[1];
  assert.ok(inputPath);
  assert.notEqual(inputPath, controlPath);
});

test('unresolved routes and incomplete correction policies never acquire invented graph destinations', () => {
  const process = starter('bounded-correction');
  process.corrections[0].exhaustedTerminalId = '';
  process.transitions.push({ id: 'unresolved', fromStepId: 'review', outcome: 'unknown', to: { type: 'unresolved', id: '' } });
  const connections = processDiagramConnections(process);
  assert.equal(connections.some(connection => connection.labels.includes('Limit reached')), false);
  assert.equal(connections.some(connection => connection.to.type === 'unresolved'), false);
  const html = renderProcessDiagram(process);
  assert.match(html, /unresolved destinations are listed in step details/);
  assert.equal(html.includes('NaN'), false);
});

test('long names remain complete in accessible editor names and readable text while markup is escaped', () => {
  const process = starter('sequence');
  const name = 'A very long step name '.repeat(8) + '<unsafe> & "quoted"';
  process.steps[0].name = name;
  process.steps[0].actor.name = 'An owner with a long description '.repeat(8);
  const escaped = name.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const html = renderProcessDiagram(process, { mode: 'edit' });
  assert.ok(html.includes(`aria-label="Edit ${escaped}"`));
  assert.ok(html.includes(`<strong title="${escaped}">${escaped}</strong>`));
  assert.ok(html.includes(process.steps[0].actor.name));
  assert.equal(html.includes('<unsafe>'), false);
  const reading = renderProcessDiagram(process);
  assert.ok(reading.includes(`<strong title="${escaped}">${escaped}</strong>`));
});

test('diagram layout provides fixed nonoverlapping node rectangles and contains every node', () => {
  const process = createBackendWorkflowFixture().workflowModel.processes.find(item => item.source === 'custom');
  for (const step of process.steps) step.name = 'A deliberately long name '.repeat(20);
  const { positions, width, height } = processLayout(process);
  const nodes = [...positions.values()];
  for (const [index, node] of nodes.entries()) {
    assert.ok(node.x + node.width <= width);
    assert.ok(node.y + node.height <= height);
    for (const other of nodes.slice(index + 1)) assert.ok(node.x + node.width <= other.x || other.x + other.width <= node.x || node.y + node.height <= other.y || other.y + other.height <= node.y);
  }
});
