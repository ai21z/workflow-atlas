const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const title = value => String(value || 'Unresolved').replaceAll('-', ' ');

export function processLayout(process) {
  const incoming = new Map(process.steps.map(step => [step.id, 0]));
  const links = new Map(process.steps.map(step => [step.id, []]));
  for (const route of process.transitions) {
    if (route.to.type !== 'step' || !links.has(route.fromStepId) || !links.has(route.to.id)) continue;
    if (process.corrections.some(item => item.decisionStepId === route.fromStepId && item.outcome === route.outcome)) continue;
    links.get(route.fromStepId).push(route.to.id);
    incoming.set(route.to.id, incoming.get(route.to.id) + 1);
  }
  const level = new Map(process.steps.map(step => [step.id, 0]));
  const pending = [...incoming].filter(([, count]) => !count).map(([id]) => id);
  for (let index = 0; index < pending.length; index++) {
    const id = pending[index];
    for (const target of links.get(id)) {
      level.set(target, Math.max(level.get(target), level.get(id) + 1));
      incoming.set(target, incoming.get(target) - 1);
      if (!incoming.get(target)) pending.push(target);
    }
  }
  // Unsupported cycles remain editable drafts. A stable reading order still draws them.
  if (pending.length !== process.steps.length) process.steps.forEach((step, index) => level.set(step.id, Math.floor(index / 3)));
  const columnCounts = new Map();
  const positions = new Map();
  for (const step of process.steps) {
    const column = level.get(step.id);
    const row = columnCounts.get(column) || 0;
    columnCounts.set(column, row + 1);
    positions.set(`step:${step.id}`, { x: 30 + column * 280, y: 50 + row * 160, width: 198, height: 112 });
  }
  const lastColumn = Math.max(0, ...level.values()) + 1;
  process.terminals.forEach((terminal, index) => positions.set(`terminal:${terminal.id}`, { x: 30 + lastColumn * 280, y: 50 + index * 112, width: 198, height: 88 }));
  return { positions, width: Math.max(650, 280 * (lastColumn + 1)), height: Math.max(330, ...[...positions.values()].map(node => node.y + node.height + 65)) };
}

/** Parallel labels describe one destination, not multiple overlapping control arrows. */
export function processDiagramConnections(process, { showInputs = false } = {}) {
  const grouped = new Map();
  const add = (fromStepId, destination, label, kind, correction = false) => {
    if (!fromStepId || !destination.id || !['step', 'terminal'].includes(destination.type)) return;
    const key = `${kind}:${fromStepId}:${destination.type}:${destination.id}`;
    if (!grouped.has(key)) grouped.set(key, { fromStepId, to: { ...destination }, labels: [], kind, correction: false });
    const connection = grouped.get(key);
    if (!connection.labels.includes(label)) connection.labels.push(label);
    connection.correction ||= correction;
  };
  for (const route of process.transitions) {
    const correction = process.corrections.some(item => item.decisionStepId === route.fromStepId && item.outcome === route.outcome);
    add(route.fromStepId, route.to, correction ? `${title(route.outcome)}, within limit` : title(route.outcome), 'control', correction);
  }
  for (const correction of process.corrections) add(correction.decisionStepId, { type: 'terminal', id: correction.exhaustedTerminalId }, 'Limit reached', 'control', true);
  if (showInputs) for (const step of process.steps) for (const input of step.inputIds) {
    const result = process.results.find(item => item.id === input);
    if (result?.producerStepId && result.producerStepId !== step.id) add(result.producerStepId, { type: 'step', id: step.id }, result.name || result.id, 'input');
  }
  return [...grouped.values()];
}

function visualLabelLines(labels) {
  const words = labels.join(' · ').split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line && `${line} ${word}`.length > 28) { lines.push(line); line = ''; }
    line += `${line ? ' ' : ''}${word}`;
  }
  if (line) lines.push(line);
  const visible = lines.slice(0, 3).map(value => value.length > 32 ? `${value.slice(0, 31)}…` : value);
  if (lines.length > 3) visible[2] = `${visible[2].slice(0, 30)}…`;
  return visible;
}

export function renderProcessDiagram(process, { selectedStepId = '', showInputs = false, mode = 'read', prefix = 'process-map' } = {}) {
  const { positions, width, height } = processLayout(process);
  const marker = `${prefix}-arrow`.replace(/[^a-zA-Z0-9_-]/g, '-');
  const edges = [];
  const edge = (from, to, labels, type, highlighted) => {
    if (!from || !to) return;
    const backwards = to.x <= from.x;
    const offset = type === 'is-input' ? 16 : 0;
    const x1 = from.x + from.width, y1 = from.y + from.height / 2 + offset;
    const x2 = to.x, y2 = to.y + to.height / 2 + offset;
    const bend = backwards ? Math.max(26, Math.min(from.y, to.y) - 22) : (x1 + x2) / 2;
    const d = backwards ? `M ${x1} ${y1} C ${x1 + 28} ${bend},${x2 - 28} ${bend},${x2} ${y2}` : `M ${x1} ${y1} C ${bend} ${y1},${bend} ${y2},${x2} ${y2}`;
    const x = backwards ? (x1 + x2) / 2 : bend;
    const labelLines = visualLabelLines(labels);
    const y = backwards ? bend - (labelLines.length - 1) * 13 : (y1 + y2) / 2 - 8 - (labelLines.length - 1) * 13;
    edges.push(`<g class="pd-edge ${type}${highlighted ? ' is-highlighted' : ''}"><title>${escape(labels.join(', '))}</title><path d="${d}" marker-end="url(#${marker})"/>${highlighted ? `<text x="${x}" y="${y}" text-anchor="middle">${labelLines.map((line, index) => `<tspan x="${x}" dy="${index ? 13 : 0}">${escape(line)}</tspan>`).join('')}</text>` : ''}</g>`);
  };
  for (const connection of processDiagramConnections(process, { showInputs })) {
    const type = connection.kind === 'input' ? 'is-input' : connection.correction ? 'is-correction' : 'is-route';
    const highlighted = connection.kind === 'input' ? connection.to.id === selectedStepId : connection.fromStepId === selectedStepId;
    edge(positions.get(`step:${connection.fromStepId}`), positions.get(`${connection.to.type}:${connection.to.id}`), connection.labels, type, highlighted);
  }
  const node = (record, type) => {
    const position = positions.get(`${type}:${record.id}`);
    const check = process.checks.some(item => item.stepId === record.id);
    const approval = process.approvals.some(item => item.stepId === record.id);
    const correction = process.corrections.some(item => item.correctionStepId === record.id);
    const label = type === 'terminal' ? `End: ${title(record.status)}` : approval ? 'Approval' : check ? 'Check' : correction ? 'Correction' : 'Step';
    const attributes = mode === 'edit' ? `data-pe-select="${escape(record.id)}" data-pe-collection="${type === 'step' ? 'steps' : 'terminals'}"` : `data-pe-open="${escape(process.id)}" data-pe-step="${type === 'step' ? escape(record.id) : ''}"`;
    const tag = mode === 'read' ? 'div' : 'button';
    const status = type === 'step' && process.entryStepId === record.id ? ' · Start' : '';
    const name = record.name || record.id;
    const owner = type === 'step' ? record.actor.name || record.actor.id || 'Owner to decide' : '';
    return `<${tag} ${tag === 'button' ? `type="button" ${attributes} aria-label="${mode === 'edit' ? 'Edit' : 'Open'} ${escape(name)}"${type === 'step' ? ` aria-pressed="${record.id === selectedStepId}"` : ''}` : ''} class="pd-node ${type === 'terminal' ? 'is-terminal' : ''} ${record.id === selectedStepId ? 'is-selected' : ''}" style="left:${position.x}px;top:${position.y}px;width:${position.width}px;height:${position.height}px"><span>${escape(label + status)}</span><strong title="${escape(name)}">${escape(name)}</strong>${type === 'step' ? `<small title="${escape(owner)}">${escape(owner)}</small>` : ''}</${tag}>`;
  };
  return `<figure class="process-diagram"><figcaption>${mode === 'read' ? 'Planned process' : 'Select a step to edit'}. Solid arrows show outcomes. Purple arrows show correction. Dashed arrows, when enabled, show produced inputs. Supplied inputs and unresolved destinations are listed in step details.</figcaption><div class="pd-scroll" tabindex="0" role="region" aria-label="Process diagram for ${escape(process.name || process.id)}. Scroll to explore."><div class="pd-canvas" style="width:${width}px;height:${height}px"><svg width="${width}" height="${height}" aria-hidden="true"><defs><marker id="${marker}" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0 L8 4 L0 8 Z" fill="currentColor"/></marker></defs>${edges.join('')}</svg>${process.steps.map(step => node(step, 'step')).join('')}${process.terminals.map(terminal => node(terminal, 'terminal')).join('')}</div></div></figure>`;
}

export const PROCESS_DIAGRAM_STYLES = `.process-diagram{margin:1rem 0;min-width:0}.process-diagram figcaption{font-size:.82rem;line-height:1.5;margin:0 0 .7rem;color:var(--muted,#53627a)}.pd-scroll{overflow:auto;max-height:68vh;border:1px solid var(--line,var(--border,#aebdce));border-radius:16px;background:var(--surface,var(--panel,var(--paper,#f6f9fd)));scrollbar-gutter:stable}.pd-canvas{position:relative;background-image:radial-gradient(var(--line,var(--border,#d9e2ef)) 1px,transparent 1px);background-size:20px 20px}.pd-canvas svg{position:absolute;inset:0;color:var(--muted,#667993)}.pd-edge path{fill:none;stroke:var(--muted,#667993);stroke-width:1.5;opacity:.48}.pd-edge.is-highlighted path{opacity:1;stroke-width:2.4}.pd-edge.is-correction path{stroke:#9463db}.pd-edge.is-input path{stroke-dasharray:5 5;stroke:#208b88}.pd-edge text{font:600 11px system-ui;fill:var(--ink,#19273b);paint-order:stroke;stroke:var(--surface,var(--panel,var(--paper,#fff)));stroke-width:5;stroke-linejoin:round}.pd-node{position:absolute;box-sizing:border-box;display:flex;flex-direction:column;align-items:flex-start;justify-content:center;text-align:left;gap:5px;padding:12px 14px;border:1px solid var(--line,var(--border,#aebdce));border-radius:13px;background:var(--panel,var(--paper,#fff));color:var(--ink,#162137);box-shadow:0 5px 14px #172b4510;white-space:normal;font:inherit}.pd-node strong{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2;overflow:hidden;width:100%;font-size:.94rem;line-height:1.3;overflow-wrap:anywhere}.pd-node span,.pd-node small{max-width:100%;font-size:.73rem;color:var(--muted,#53627a)}.pd-node small{overflow:hidden;white-space:nowrap;text-overflow:ellipsis}button.pd-node{cursor:pointer}.pd-node.is-selected{border:2px solid var(--accent,#246d87);box-shadow:0 0 0 3px #388cad22}.pd-node.is-terminal{border-style:dashed;box-shadow:none}.pd-node:focus-visible,.pd-scroll:focus-visible{outline:3px solid var(--accent,#246d87);outline-offset:3px}`;
