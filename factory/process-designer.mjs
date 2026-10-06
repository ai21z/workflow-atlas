import { CATALOG } from './catalog.mjs';
import { createProcessDraft, createProcessRecord, createProcessId, applyProcessEdit, describeProcessImpact, removeProcessRecord, removeProcessOutcome } from './process-editor.mjs';
import { renderProcessDiagram, PROCESS_DIAGRAM_STYLES } from './process-diagram.mjs';

const clone = value => structuredClone(value);
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const human = value => String(value).replaceAll('-', ' ');
const types = { steps: 'Steps', results: 'Inputs and results', checks: 'Checks', transitions: 'Routes', corrections: 'Correction limits', approvals: 'Approval', terminals: 'Endings' };
const kinds = [{ id: 'manual', name: 'A team process' }, { id: 'development', name: 'How we build it' }, { id: 'application', name: 'How it works when used' }];
const patterns = [{ id: 'sequence', name: 'A sequence of steps' }, { id: 'review-gate', name: 'Review before finishing' }, { id: 'bounded-correction', name: 'Check and improve within a limit' }];
const names = records => records.map(record => ({ id: record.id, name: record.name || record.id }));
const options = (records, selected, empty = true) => `${empty ? '<option value="">Still to decide</option>' : ''}${records.map(record => `<option value="${escape(record.id)}"${record.id === selected ? ' selected' : ''}>${escape(record.name || record.label || record.id)}</option>`).join('')}`;
const field = (label, path, value, type = 'text', hint = '') => `<label class="pe-field"><span>${escape(label)}</span>${type === 'textarea' ? `<textarea data-pe-bind="${escape(path)}" rows="3" maxlength="20000">${escape(value)}</textarea>` : `<input data-pe-bind="${escape(path)}" type="${type}" value="${escape(value ?? '')}"${type === 'number' ? ' min="0" max="1000" step="1"' : ' maxlength="200"'}>`}${hint ? `<small>${escape(hint)}</small>` : ''}</label>`;
const select = (label, path, value, records, empty = true) => `<label class="pe-field"><span>${escape(label)}</span><select data-pe-bind="${escape(path)}">${options(records, value, empty)}</select></label>`;
const choices = (label, path, values, records) => `<fieldset class="pe-choices"><legend>${escape(label)}</legend>${records.map(record => `<label><input type="checkbox" data-pe-list="${escape(path)}" value="${escape(record.id)}"${values.includes(record.id) ? ' checked' : ''}><span>${escape(record.name || record.label || record.id)}</span></label>`).join('') || '<p>None defined yet.</p>'}</fieldset>`;

/** Only this process is buffered. Other accepted decisions can safely become its new base. */
export function assessProcessDraftBase(baseConfig, latestConfig, processId, draft) {
  const before = baseConfig?.workflowModel?.processes?.find(process => process.id === (processId || draft?.id)) || null;
  const current = latestConfig?.workflowModel?.processes?.find(process => process.id === (processId || draft?.id)) || null;
  if (!latestConfig?.workflowModel) return { status: 'unavailable', before: clone(before), current: null };
  if (JSON.stringify(baseConfig) === JSON.stringify(latestConfig)) return { status: 'unchanged', before: clone(before), current: clone(current) };
  if (JSON.stringify(before) !== JSON.stringify(current)) return { status: 'conflict', before: clone(before), current: clone(current) };
  return { status: 'rebase', before: clone(before), current: clone(current) };
}

/** A copy keeps the pending design without replacing another accepted process. */
export function copyProcessDraft(draft, config) {
  const copy = clone(draft);
  copy.id = createProcessId(config.workflowModel.processes, `${draft.id}-copy`);
  copy.name = `${draft.name || 'Process'} copy`.slice(0, 200);
  return copy;
}

export function createProcessDesigner({ getConfig, onApply, onPendingChange = () => {}, onNotice = () => {}, onBack = () => {} }) {
  if (!document.getElementById('process-designer-styles')) {
    const styles = document.createElement('style');
    styles.id = 'process-designer-styles';
    styles.textContent = `${PROCESS_DIAGRAM_STYLES}${DESIGNER_STYLES}`;
    document.head.append(styles);
  }
  const dialog = document.createElement('section');
  dialog.id = 'process-designer';
  dialog.className = 'pe-designer';
  dialog.setAttribute('aria-labelledby', 'pe-title');
  dialog.hidden = true;
  document.body.append(dialog);
  const modal = document.createElement('dialog');
  modal.className = 'pe-modal';
  modal.setAttribute('aria-labelledby', 'pe-title');
  document.body.append(modal);
  let inlineHost = null;
  let visible = false;
  let state = null;
  let opener = null;
  let activeProcessId = '';
  const dirty = () => Boolean(state && (state.deleteProcess || (state.draft ? !state.original || JSON.stringify(state.draft) !== JSON.stringify(state.original) : Boolean(state.startName || state.startKind !== 'manual' || state.startPattern !== 'sequence'))));
  const notify = () => {
    const status = dialog.querySelector('.pe-header .eyebrow');
    if(status && state) status.textContent = dirty() ? 'PROCESS EDITS NOT APPLIED' : 'YOUR PROCESS';
    const title = dialog.querySelector('#pe-title');
    if(title && state) title.textContent = state.draft?.name || 'Connect the work';
    const note = dialog.querySelector('.pe-footer > p');
    if(note && state?.draft) note.textContent = dirty() ? 'Pending edits. Review and apply before downloading them.' : 'Session only. Downloads use applied changes.';
    onPendingChange();
  };
  const by = collection => state.draft[collection];
  const selected = () => by(state.collection).find(record => record.id === state.recordId);
  function showSurface() {
    visible = true;
    dialog.hidden = false;
    if (inlineHost) {
      inlineHost.append(dialog);
      dialog.classList.add('pe-inline-designer');
    } else {
      modal.append(dialog);
      if (!modal.open) modal.showModal();
    }
    restorePresentationScroll();
    const shownState=state;
    requestAnimationFrame(()=>{if(state===shownState&&visible)restorePresentationScroll();});
  }
  function hideSurface() {
    visible = false;
    dialog.hidden = true;
    if (modal.open) modal.close();
  }
  function makeState(config, process = null, stepId = '') {
    return { base: JSON.stringify(config), original: process ? clone(process) : null, draft: process ? clone(process) : null, processId: process?.id || '', collection: 'steps', recordId: stepId || process?.entryStepId || '', showInputs: false, listView: matchMedia('(max-width: 700px)').matches, review: null, error: '', notice: '', conflict: null, switchRequest: null, removal: null, discard: false, deleteProcess: false, startName: '', startKind: 'manual', startPattern: 'sequence', mapScroll: { left: 0, top: 0 }, bodyScroll: 0, inspectorScroll: 0, inspectorRecord: '', details: {} };
  }
  function syncConfig({ redraw = true } = {}) {
    if (!state) return true;
    const latest = getConfig();
    const assessment = assessProcessDraftBase(JSON.parse(state.base), latest, state.processId, state.draft);
    if (assessment.status === 'unchanged') {
      if (state.conflict) {
        state.conflict = null;
        state.review = null;
        state.error = '';
        state.notice = 'The current project is back to your original process. Your pending edits are kept. Review them before applying.';
        if (redraw) render();
      }
      return true;
    }
    state.review = null;
    if (assessment.status === 'unavailable') {
      state.error = 'Open a project to continue. Your process edits remain in this session.';
      if (redraw) render();
      return false;
    }
    if (assessment.status === 'conflict') {
      if (!dirty()) {
        if(!assessment.current){state=null;hideSurface();dialog.replaceChildren();return true;}
        const presentation = {collection:state.collection,recordId:state.recordId,listView:state.listView,showInputs:state.showInputs,mapScroll:state.mapScroll,bodyScroll:state.bodyScroll,inspectorScroll:state.inspectorScroll,inspectorRecord:state.inspectorRecord,details:state.details};
        state = makeState(latest, assessment.current);
        for(const key of ['listView','showInputs','mapScroll','bodyScroll','inspectorScroll','inspectorRecord','details']) state[key]=presentation[key];
        if(state.draft && Object.hasOwn(types,presentation.collection) && by(presentation.collection).some(record=>record.id===presentation.recordId)){state.collection=presentation.collection;state.recordId=presentation.recordId;}
        state.notice = 'Showing the current project process.';
        if(redraw)render();
        return true;
      }
      state.conflict = { current: assessment.current };
      state.error = '';
      state.notice = '';
      if (redraw) render();
      return false;
    }
    state.base = JSON.stringify(latest);
    state.notice = 'Your other project changes are kept. Review these process edits again before applying.';
    state.conflict = null;
    state.error = '';
    if (redraw) render();
    return true;
  }
  function close(force = false) {
    if (!state) return true;
    if (!force && dirty()) { state.discard = true; render(); dialog.querySelector('[data-pe-action="keep-editing"]')?.focus(); return false; }
    const target = opener;
    state = null;
    hideSurface();
    dialog.replaceChildren();
    notify();
    const fallback = document.querySelector(`[data-pe-open="${CSS.escape(activeProcessId)}"]`) || document.querySelector('[data-pe-new]') || document.querySelector('#new-project');
    (target?.isConnected ? target : fallback)?.focus();
    return true;
  }
  function open(processId = '', stepId = '', { collection = '', recordId = '' } = {}) {
    if (!getConfig()) return;
    const process = getConfig().workflowModel.processes.find(item => item.id === processId && item.source === 'custom');
    if (processId && !process && processId !== state?.processId && processId !== state?.draft?.id) { onNotice('This process is no longer available. Choose a current process.'); return; }
    if (state) {
      const same = processId === state.processId || Boolean(processId && processId === state.draft?.id);
      if (same) {
        syncConfig({ redraw: false });
        if (state.draft && (stepId || recordId)) {
          state.collection = Object.hasOwn(types, collection) ? collection : 'steps';
          const requested = recordId || stepId;
          state.recordId = by(state.collection).some(item => item.id === requested) ? requested : state.recordId;
          if (state.collection !== 'steps') state.details.records = true;
        }
        showSurface(); render(); return;
      }
      if (dirty()) {
        state.switchRequest = { processId, stepId, collection, recordId };
        showSurface(); render(); return;
      }
      state = null;
    }
    opener = document.activeElement;
    if (processId && !process) { onNotice('This process is no longer available. Choose a current process.'); return; }
    state = makeState(getConfig(), process, stepId);
    if (process) activeProcessId = process.id;
    if (process && Object.hasOwn(types, collection)) {
      state.collection = collection;
      state.recordId = process[collection].find(record => record.id === recordId)?.id || process[collection][0]?.id || '';
      state.details.records = true;
    }
    render();
    showSurface();
    dialog.querySelector(process && (stepId || recordId) ? '.pe-inspector input,.pe-inspector textarea,.pe-inspector select' : process ? '.pe-inspector input,.pe-inspector textarea,.pe-inspector select' : '[data-pe-start="name"]')?.focus();
  }
  function touch() { state.review = null; state.error = ''; state.notice = ''; state.discard = false; state.deleteProcess = false; notify(); }
  function resolvePath(path) {
    const parts = path.split('.');
    if (parts.some(part => ['__proto__', 'prototype', 'constructor'].includes(part))) return null;
    let target = state.draft;
    for (const part of parts.slice(0, -1)) { if (!target || !Object.hasOwn(target, part)) return null; target = target[part]; }
    const key = parts.at(-1);
    return target && Object.hasOwn(target, key) ? { target, key } : null;
  }
  function syncOutcomes(stepId) { for (const check of state.draft.checks.filter(item => item.stepId === stepId)) check.outcomes = [...(state.draft.steps.find(item => item.id === stepId)?.outcomes || [])]; }
  function updateField(control) {
    const reference = resolvePath(control.dataset.peBind);
    if (!reference) return;
    const before = reference.target[reference.key];
    reference.target[reference.key] = control.type === 'number' ? (control.value === '' ? null : Number(control.value)) : control.type === 'checkbox' ? control.checked : control.dataset.peLines ? control.value.split('\n').filter(line => line.trim()) : control.value;
    const match = control.dataset.peBind.match(/^results\.(\d+)\.producerStepId$/);
    if (match && before !== control.value) {
      const result = state.draft.results[Number(match[1])];
      const previous = state.draft.steps.find(step => step.id === before);
      const next = state.draft.steps.find(step => step.id === control.value);
      if (previous) previous.outputIds = previous.outputIds.filter(id => id !== result.id);
      if (next && !next.outputIds.includes(result.id)) next.outputIds.push(result.id);
      if (next) result.suppliedSource = '';
    }
    const check = control.dataset.peBind.match(/^checks\.(\d+)\.stepId$/);
    if (check) state.draft.checks[Number(check[1])].outcomes = [...(state.draft.steps.find(step => step.id === control.value)?.outcomes || [])];
    touch();
  }
  function destinations(value) {
    return `<option value="unresolved:"${value.type === 'unresolved' ? ' selected' : ''}>Still to decide</option><optgroup label="Next step">${by('steps').map(step => `<option value="step:${escape(step.id)}"${value.type === 'step' && value.id === step.id ? ' selected' : ''}>${escape(step.name || step.id)}</option>`).join('')}</optgroup><optgroup label="End the process">${by('terminals').map(end => `<option value="terminal:${escape(end.id)}"${value.type === 'terminal' && value.id === end.id ? ' selected' : ''}>${escape(end.name || end.id)}</option>`).join('')}</optgroup>`;
  }
  function routesFor(step) {
    return `<section class="pe-routes"><h3>What happens next?</h3>${step.outcomes.map(outcome => {
      const route = by('transitions').find(item => item.fromStepId === step.id && item.outcome === outcome);
      const correction = by('corrections').find(item => item.decisionStepId === step.id && item.outcome === outcome);
      return `<div class="pe-route"><label class="pe-field"><span>When ${escape(human(outcome))}</span><select data-pe-route="${escape(outcome)}" data-pe-step="${escape(step.id)}">${destinations(route?.to || { type: 'unresolved', id: '' })}</select></label><button type="button" class="pe-small" data-pe-remove-outcome="${escape(outcome)}" aria-label="Remove ${escape(human(outcome))} outcome">Remove</button>${correction ? `<p>Correction limit: ${correction.maxCorrections ?? 'still to decide'}. <button type="button" class="pe-small" data-pe-select="${escape(correction.id)}" data-pe-collection="corrections">Edit limit and stopping outcome</button></p>` : ''}</div>`;
    }).join('') || '<p>Choose an outcome to connect this step.</p>'}<div class="pe-inline"><label class="pe-field"><span>New outcome name</span><input id="pe-outcome-name" maxlength="64" placeholder="For example, ready for review"></label><button type="button" class="secondary" data-pe-action="add-outcome">Add outcome</button></div></section>`;
  }
  function recordForm() {
    const record = selected();
    if (!record) return '<p>Select a step or record to edit it.</p>';
    const index = by(state.collection).indexOf(record), base = `${state.collection}.${index}`;
    const steps = names(by('steps')), results = names(by('results'));
    let fields = '';
    if (state.collection === 'steps') {
      fields = `${field('What happens here?', `${base}.name`, record.name)}${field('Describe the action', `${base}.action`, record.action, 'textarea')}
        <h3>Who or what does it?</h3>${select('Responsible actor', `${base}.actor.type`, record.actor.type, ['human','agent','external'].map(id => ({id,name: id === 'human' ? 'Person' : id === 'agent' ? 'Agent' : 'Existing system'})), false)}
        ${record.actor.type === 'agent' && state.draft.kind !== 'application' ? select('Agent profile', `${base}.actor.id`, record.actor.id, [...CATALOG.roles.map(role => ({id:role.id,name:`${role.label}${getConfig().agents.some(agent => agent.role === role.id) ? '' : ' (profile not selected)'}`})), ...(record.actor.id && !CATALOG.roles.some(role=>role.id===record.actor.id) ? [{id:record.actor.id,name:`Unmapped: ${record.actor.id}`}] : [])]) : field(record.actor.type === 'agent' ? 'Planned runtime agent ID' : 'Actor ID, optional', `${base}.actor.id`, record.actor.id)}
        ${field('Name or role', `${base}.actor.name`, record.actor.name)}<label class="pe-toggle"><input type="checkbox" data-pe-bind="${base}.actor.contextOnly"${record.actor.contextOnly ? ' checked' : ''}> Review supplied context only</label><p class="pe-hint">Assignments describe responsibility. Tools and permissions must exist in the intended environment.</p>
        <h3>What does it need and produce?</h3>${choices('Needed inputs', `${base}.inputIds`, record.inputIds, results)}<button type="button" class="pe-small" data-pe-action="new-input">Add a supplied input</button>${choices('Produced results', `${base}.outputIds`, record.outputIds, results)}<button type="button" class="pe-small" data-pe-action="new-output">Add a produced result</button>
        <h3>How do we know it is acceptable?</h3><div class="pe-inline">${by('checks').filter(item=>item.stepId===record.id).map(item=>`<button type="button" class="secondary" data-pe-select="${escape(item.id)}" data-pe-collection="checks">Edit check</button>`).join('') || '<button type="button" class="secondary" data-pe-action="add-check">Add a check</button>'}${by('approvals').filter(item=>item.stepId===record.id).map(item=>`<button type="button" class="secondary" data-pe-select="${escape(item.id)}" data-pe-collection="approvals">Edit approval</button>`).join('')}</div>
        ${routesFor(record)}<details class="pe-advanced" data-pe-detail="instructions"><summary>Instructions and requested capabilities</summary>${choices('Reusable procedures', `${base}.instructionIds`, record.instructionIds, CATALOG.skills)}${field('Capabilities, one name per line', `${base}.capabilities`, record.capabilities.join('\n'), 'textarea', 'Names describe requested capabilities. They do not configure integrations.').replace('data-pe-bind=', 'data-pe-lines="true" data-pe-bind=')}</details>`;
    } else if (state.collection === 'results') fields = `${field('Result or input name', `${base}.name`, record.name)}${field('What does it contain?', `${base}.description`, record.description, 'textarea')}${select('Initial producer', `${base}.producerStepId`, record.producerStepId, steps)}${!record.producerStepId ? field('Supplied source', `${base}.suppliedSource`, record.suppliedSource, 'textarea', 'An existing document, request or record. Unknown sources can stay blank.') : '<p>The producing step will list this result. Correction steps may revise it.</p>'}${field('Expected structure', `${base}.expectedStructure`, record.expectedStructure, 'textarea')}${field('How will revisions be identified?', `${base}.versionPolicy`, record.versionPolicy, 'textarea')}${field('Supplied revision, if known', `${base}.version`, record.version)}`;
    else if (state.collection === 'checks') fields = `${select('Checking step', `${base}.stepId`, record.stepId, steps)}${select('Result being checked', `${base}.candidateId`, record.candidateId, results)}${field('Acceptance criteria, one per line', `${base}.criteria`, record.criteria.join('\n'), 'textarea').replace('data-pe-bind=', 'data-pe-lines="true" data-pe-bind=')}${select('Check method', `${base}.method`, record.method, ['human','code','model'].map(id=>({id,name:human(id)})), false)}${select('Evidence produced by this check', `${base}.evidenceResultId`, record.evidenceResultId, results)}<p>Uses the checking step's outcomes. Check a revised candidate again. A planned check is not a passed check.</p>`;
    else if (state.collection === 'transitions') fields = `${select('From step', `${base}.fromStepId`, record.fromStepId, steps)}${select('When this outcome occurs', `${base}.outcome`, record.outcome, (by('steps').find(step=>step.id===record.fromStepId)?.outcomes || []).map(id=>({id,name:human(id)})))}<label class="pe-field"><span>Go to</span><select data-pe-route-id="${escape(record.id)}">${destinations(record.to)}</select></label>`;
    else if (state.collection === 'corrections') fields = `${select('Decision step', `${base}.decisionStepId`, record.decisionStepId, steps)}${select('Outcome that requests correction', `${base}.outcome`, record.outcome, (by('steps').find(step=>step.id===record.decisionStepId)?.outcomes || []).map(id=>({id,name:human(id)})))}${select('Correction step', `${base}.correctionStepId`, record.correctionStepId, steps)}${select('Return to this check', `${base}.checkStepId`, record.checkStepId, steps)}${select('Candidate to revise', `${base}.candidateId`, record.candidateId, results)}${select('Findings returned for correction', `${base}.feedbackResultId`, record.feedbackResultId, results)}${field('Maximum corrections', `${base}.maxCorrections`, record.maxCorrections, 'number', 'After the first candidate. Blank means undecided. Zero allows no corrections.')}${select('When the limit is reached', `${base}.exhaustedTerminalId`, record.exhaustedTerminalId, names(by('terminals').filter(end=>end.status!=='completed')))}<p>Count each correction attempt, including unsuccessful attempts. Reset only for a new run. Recheck the revised candidate and obtain approval again where required.</p>`;
    else if (state.collection === 'approvals') fields = `${select('Approval step', `${base}.stepId`, record.stepId, steps)}${field('Who has authority to approve?', `${base}.authority`, record.authority)}${select('Candidate to approve', `${base}.candidateId`, record.candidateId, results)}${choices('Evidence to review', `${base}.evidenceResultIds`, record.evidenceResultIds, results)}<p>The step needs separate accepted, changes requested and declined outcomes. A material revision requires approval again. Assignment alone does not grant authority.</p>`;
    else if (state.collection === 'terminals') fields = `${field('Ending name', `${base}.name`, record.name)}${select('Meaning of this ending', `${base}.status`, record.status, ['completed','stopped','needs-information','cancelled','unresolved'].map(id=>({id,name:human(id)})), false)}<p>This is a possible ending, not a record that work finished.</p>`;
    return `<div class="pe-record-heading"><h2>${escape(record.name || types[state.collection].replace(/s$/, '') || record.id)}</h2><button type="button" class="pe-small" data-pe-action="remove-record">Remove</button></div>${fields}<p class="pe-id">Stable ID: ${escape(record.id)}</p>`;
  }
  function removalView() {
    const removal = state.removal;
    if (!removal) return '';
    const alternatives = removal.outcome ? selected().outcomes.filter(id=>id!==removal.id).map(id=>({id,name:human(id)})) : names(by(removal.collection).filter(record=>record.id!==removal.id));
    return `<section class="pe-confirm" role="region" aria-label="Review removal"><h2>Review removal</h2><p>${escape(removal.message)}</p>${removal.references.length ? `<ul>${removal.references.map(ref=>`<li>${escape(ref)}</li>`).join('')}</ul>` : '<p>No in-process references were found.</p>'}<label class="pe-field"><span>Replace references with</span><select id="pe-replacement">${options(alternatives,'')}</select></label><p>The next review shows changed connections and files. Existing observations are kept.</p><div class="pe-inline"><button type="button" class="secondary" data-pe-action="cancel-remove">Cancel removal</button><button type="button" class="primary" data-pe-action="confirm-remove">Continue removal</button></div></section>`;
  }
  function render() {
    if (!state) return;
    const active = dialog.contains(document.activeElement) ? document.activeElement : null;
    const focusAttributes = active ? [...active.attributes].filter(attribute => attribute.name.startsWith('data-pe-')) : [];
    const focusSelector = active?.id ? `#${CSS.escape(active.id)}` : focusAttributes.map(attribute => `[${attribute.name}="${CSS.escape(attribute.value)}"]`).join('');
    const selection = active?.selectionStart;
    const selectionEnd = active?.selectionEnd;
    const shown=visible&&dialog.getClientRects().length>0;
    const bodyScroll = shown ? dialog.querySelector('.pe-body')?.scrollTop ?? state.bodyScroll : state.bodyScroll;
    state.bodyScroll = bodyScroll;
    const inspectorRecord = `${state.collection}:${state.recordId}`;
    if(state.inspectorRecord === inspectorRecord) {if(shown)state.inspectorScroll=dialog.querySelector('.pe-inspector')?.scrollTop ?? state.inspectorScroll;}
    else state.inspectorScroll=0;
    state.inspectorRecord=inspectorRecord;
    const mapScroll = dialog.querySelector('.pd-scroll');
    if (mapScroll&&shown) state.mapScroll = { left: mapScroll.scrollLeft, top: mapScroll.scrollTop };
    for (const detail of dialog.querySelectorAll('details[data-pe-detail]')) state.details[detail.dataset.peDetail] = detail.open;
    let body;
    if (!state.draft) body = `<div class="pe-start"><h2>Choose a starting pattern</h2><p>You can change the steps and connections before applying it.</p><label class="pe-field"><span>Process name</span><input data-pe-start="name" value="${escape(state.startName)}" maxlength="200" placeholder="For example, review a document"></label><label class="pe-field"><span>What are we describing?</span><select data-pe-start="kind">${options(kinds,state.startKind,false)}</select></label><label class="pe-field"><span>Starting pattern</span><select data-pe-start="pattern">${options(patterns,state.startPattern,false)}</select></label><button type="button" class="primary" data-pe-action="create">Open designer</button></div>`;
    else if (state.review) body = `<section class="pe-review"><h2>Review your changes</h2><p>The current project stays unchanged until you apply.</p><ul>${state.review.summary.map(item=>`<li>${escape(item)}</li>`).join('')}</ul><details data-pe-detail="files"><summary>Affected files in the full pack (${state.review.files.length})</summary><ul>${state.review.files.map(path=>`<li><code>${escape(path)}</code></li>`).join('') || '<li>No generated file content changes.</li>'}</ul></details><h3>${state.review.blocked ? 'Fix these connections before applying' : 'Open decisions'}</h3><ul>${state.review.issues.map(issue=>`<li><strong>${issue.blocking ? 'Needs correction. ' : ''}</strong>${escape(issue.message)} <small>${escape(issue.path)}</small></li>`).join('') || '<li>No process rule findings. Work has not been executed.</li>'}</ul><div class="pe-inline"><button type="button" class="secondary" data-pe-action="back">Keep editing</button><button type="button" class="primary" data-pe-action="apply"${state.review.blocked ? ' disabled' : ''}>Apply changes</button></div></section>`;
    else body = `<details class="pe-settings" data-pe-detail="settings"><summary>Process details</summary><div class="pe-settings-fields"><label class="pe-field"><span>Process name</span><input data-pe-bind="name" maxlength="200" value="${escape(state.draft.name)}"></label>${select('Describes', 'kind', state.draft.kind, kinds, false)}${field('Purpose', 'purpose', state.draft.purpose, 'textarea')}${select('Pattern rules', 'pattern.id', state.draft.pattern.id, patterns, false)}${select('First step', 'entryStepId', state.draft.entryStepId, names(by('steps')))}<p>Changing pattern rules keeps your records. Review may ask you to adjust incompatible connections.</p>${state.original ? '<button type="button" class="pe-small" data-pe-action="remove-process">Remove this process</button>' : ''}</div></details><div class="pe-layout"><div class="pe-workspace"><div class="pe-toolbar"><div role="group" aria-label="Process view"><button type="button" data-pe-action="map" aria-pressed="${!state.listView}">Map</button><button type="button" data-pe-action="list" aria-pressed="${state.listView}">Step list</button></div><label class="pe-toggle"><input type="checkbox" data-pe-inputs${state.showInputs ? ' checked' : ''}> Show produced inputs</label><button type="button" class="secondary" data-pe-add="steps">Add step</button></div><div id="pe-map">${state.listView ? `<ol class="pe-step-list">${by('steps').map(step=>`<li><button type="button" data-pe-select="${escape(step.id)}" data-pe-collection="steps" aria-pressed="${state.collection==='steps'&&state.recordId===step.id}"><strong>${escape(step.name || step.id)}</strong><span>${escape(step.action || 'Action still to decide')}</span></button></li>`).join('')}</ol>` : renderProcessDiagram(state.draft,{selectedStepId:state.collection==='steps'?state.recordId:'',showInputs:state.showInputs,mode:'edit',prefix:'designer'})}</div><details class="pe-records" data-pe-detail="records"><summary>Inputs, checks and other records</summary><div class="pe-inline">${select('Record type','',state.collection,Object.entries(types).map(([id,name])=>({id,name})),false).replace('data-pe-bind=""','data-pe-collection-choice')}<button type="button" class="secondary" data-pe-add="${state.collection}">Add ${escape(types[state.collection].toLowerCase())}</button></div><div class="pe-record-buttons">${by(state.collection).map(record=>`<button type="button" data-pe-select="${escape(record.id)}" data-pe-collection="${state.collection}" aria-pressed="${state.recordId===record.id}">${escape(record.name || record.id)}</button>`).join('') || '<p>No records of this type yet.</p>'}</div></details></div><aside class="pe-inspector" aria-label="Selected process record">${removalView() || recordForm()}</aside></div>`;
    const conflict = state.conflict ? `<section class="pe-confirm pe-conflict" aria-label="Process changed elsewhere"><h2>This process changed elsewhere</h2><p>Your edits are still here. The current project ${state.conflict.current ? 'also has a newer version of this process' : 'no longer has this process'}. Choose which design to keep before applying.</p><details><summary>Compare the two versions</summary><h3>Your pending design</h3><pre>${escape(JSON.stringify(state.draft, null, 2))}</pre><h3>Current project design</h3><pre>${escape(JSON.stringify(state.conflict.current, null, 2))}</pre></details><div class="pe-inline"><button type="button" class="secondary" data-pe-action="keep-current">Use the current project version</button>${state.draft ? '<button type="button" class="primary" data-pe-action="copy-draft">Keep my design as another process</button>' : ''}<button type="button" class="secondary" data-pe-action="review-over-current">Review replacing the current version</button></div><p>Other project decisions and observations stay unchanged. A replacement still requires review and Apply.</p></section>` : '';
    const switching = state.switchRequest ? `<section class="pe-confirm" aria-label="Keep pending process edits"><h2>Keep your process edits?</h2><p>Review and apply them before switching processes, or explicitly discard them. Moving to Brief or Knowledge map keeps them in this session.</p><div class="pe-inline"><button type="button" class="primary" data-pe-action="cancel-switch">Keep editing this process</button><button type="button" class="secondary" data-pe-action="review-before-switch">Review before switching</button><button type="button" class="secondary" data-pe-action="discard-and-switch">Discard and switch</button></div></section>` : '';
    dialog.classList.toggle('is-editing', Boolean(state.draft&&!state.review&&!state.conflict&&!state.switchRequest&&!state.discard));
    dialog.innerHTML = `<header class="pe-header"><div><p class="eyebrow">${dirty() ? 'PROCESS EDITS NOT APPLIED' : 'YOUR PROCESS'}</p><${inlineHost ? 'h2' : 'h1'} id="pe-title">${escape(state.draft?.name || 'Connect the work')}</${inlineHost ? 'h2' : 'h1'}></div>${inlineHost ? '<button type="button" class="secondary" data-pe-action="overview">Process overview</button>' : '<button type="button" class="secondary" data-pe-action="close">Close designer</button>'}</header><div class="pe-body">${state.error ? `<p class="pe-error" role="alert">${escape(state.error)}</p>` : ''}${state.notice ? `<p class="pe-notice" role="status">${escape(state.notice)}</p>` : ''}${conflict}${switching}${state.discard ? '<section class="pe-confirm"><h2>Discard these edits?</h2><p>They have not been applied to your project or included in a download.</p><div class="pe-inline"><button type="button" class="primary" data-pe-action="keep-editing">Keep editing</button><button type="button" class="secondary" data-pe-action="discard">Discard edits</button></div></section>' : body}</div><footer class="pe-footer"><p>Session only. ${state.draft ? dirty() ? 'Pending edits. Review and apply before downloading them.' : 'Downloads use applied changes.' : 'A pattern is a starting design. It does not run work.'}</p><div class="pe-inline">${inlineHost && dirty() && !state.discard ? '<button type="button" class="secondary" data-pe-action="request-discard">Discard process edits</button>' : ''}${state.draft && !state.review && !state.discard ? `<button type="button" class="primary" data-pe-action="review"${state.conflict ? ' disabled' : ''}>Review changes</button>` : ''}</div></footer>`;
    for (const detail of dialog.querySelectorAll('details[data-pe-detail]')) detail.open = Boolean(state.details[detail.dataset.peDetail]);
    const newBody = dialog.querySelector('.pe-body');
    if (newBody) newBody.scrollTop = bodyScroll;
    const newInspector=dialog.querySelector('.pe-inspector');
    if(newInspector)newInspector.scrollTop=state.inspectorScroll;
    restoreMapScroll();
    if (focusSelector) {
      const control = dialog.querySelector(focusSelector);
      if (control?.getClientRects().length) control.focus({preventScroll:true});
      if (typeof selection === 'number' && ['text','textarea'].includes(control?.type)) control.setSelectionRange(selection,selectionEnd);
    }
  }
  function restoreMapScroll() {
    const scroller = dialog.querySelector('.pd-scroll');
    if (scroller && state) { scroller.scrollLeft = state.mapScroll.left; scroller.scrollTop = state.mapScroll.top; }
  }
  function restorePresentationScroll() {
    if(!state)return;
    const body=dialog.querySelector('.pe-body');
    if(body)body.scrollTop=state.bodyScroll;
    const inspector=dialog.querySelector('.pe-inspector');
    if(inspector)inspector.scrollTop=state.inspectorScroll;
    restoreMapScroll();
  }
  function redrawMap() {
    const map = dialog.querySelector('#pe-map');
    if (map && state.listView) {
      for (const button of map.querySelectorAll('[data-pe-select][data-pe-collection="steps"]')) {
        const step = state.draft.steps.find(record => record.id === button.dataset.peSelect);
        if (step) { button.querySelector('strong').textContent = step.name || step.id; button.querySelector('span').textContent = step.action || 'Action still to decide'; }
      }
    }
    const scroller = map?.querySelector('.pd-scroll');
    if (scroller) state.mapScroll = { left: scroller.scrollLeft, top: scroller.scrollTop };
    if (map && !state.listView) {
      map.innerHTML = renderProcessDiagram(state.draft,{selectedStepId:state.collection==='steps'?state.recordId:'',showInputs:state.showInputs,mode:'edit',prefix:'designer'});
      restoreMapScroll();
    }
  }
  function add(collection, setup = () => {}) {
    const id = createProcessId(by(collection), collection.replace(/s$/, ''));
    const record = createProcessRecord(collection,id); setup(record);
    by(collection).push(record); state.collection=collection; state.recordId=id; touch(); render();
    dialog.querySelector('.pe-inspector input, .pe-inspector textarea, .pe-inspector select')?.focus();
  }
  function materializeDraft() {
    state.draft=createProcessDraft({id:createProcessId(getConfig().workflowModel.processes,'process'),name:state.startName,kind:state.startKind,patternId:state.startPattern});
    state.recordId=state.draft.entryStepId;
    touch();
  }
  function review() {
    if (!syncConfig({ redraw: false })) { render(); return; }
    if (!state.draft && !state.deleteProcess) {
      materializeDraft();
      state.notice = 'Your starting pattern is now a draft. Review it before applying.';
    }
    const draft = state.deleteProcess ? null : state.draft;
    const impacts=describeProcessImpact(getConfig(),state.processId || state.draft.id,draft);
    let result, error;
    try { result=applyProcessEdit(getConfig(),state.processId || state.draft.id,draft); } catch(caught) {error=caught;}
    const summary=[...(state.deleteProcess ? [`Remove the complete process: ${state.original.name || state.original.id}.`] : []), `${impacts.added.length} records added, ${impacts.changedRecords.length} changed, ${impacts.removed.length} removed.`, `${impacts.inputRelations.length} input relationships and ${impacts.routes.length} outcome routes changed.`, `${impacts.instructionIds.length} instruction references affected.`, ...(impacts.evidenceLinks.length ? [`${impacts.evidenceLinks.length} existing evidence associations need review. Their observations are kept.`] : [])];
    let files=[];
    if(result && onApply.preview) { try {files=onApply.preview(result.config);} catch(caught) {error=caught;} }
    state.review={result,blocked:Boolean(error),issues:error?.issues || result?.issues || [],summary,files};
    if(error && !state.review.issues.length) state.review.issues=[{message:error.message,path:'',blocking:true}];
    render(); dialog.querySelector('.pe-review h2')?.setAttribute('tabindex','-1'); dialog.querySelector('.pe-review h2')?.focus();
  }
  function resetToCurrent() {
    const processId = state.processId;
    const latest = getConfig();
    const process = latest?.workflowModel.processes.find(item => item.id === processId && item.source === 'custom');
    state = makeState(latest, process);
    state.notice = 'Pending process edits discarded. The current project is kept.';
    render(); notify();
  }
  function resolveConflict(choice) {
    const latest = getConfig();
    if (!latest || !state?.conflict) return;
    if (choice === 'current') { resetToCurrent(); return; }
    if (choice === 'copy') {
      state.draft = copyProcessDraft(state.draft, latest);
      state.processId = '';
      state.original = null;
      state.deleteProcess = false;
      state.notice = 'Your pending design will be added as another process. The current version is kept.';
    } else {
      state.original = clone(latest.workflowModel.processes.find(item => item.id === (state.processId || state.draft.id)) || null);
      state.notice = 'Review the replacement below. The current project stays unchanged until Apply.';
    }
    state.base = JSON.stringify(latest);
    state.conflict = null;
    state.review = null;
    notify(); review();
  }
  dialog.addEventListener('input',event=>{
    event.stopPropagation(); if (!state) return; const control=event.target;
    if(control.dataset.peStart) {state[`start${control.dataset.peStart[0].toUpperCase()}${control.dataset.peStart.slice(1)}`]=control.value;notify();return;}
    if(control.dataset.peBind && !['select-one','checkbox'].includes(control.type)) {updateField(control);redrawMap();}
  });
  dialog.addEventListener('change',event=>{
    event.stopPropagation();if (!state) return;const control=event.target;
    if(control.hasAttribute('data-pe-collection-choice')) {state.collection=control.value;state.recordId=by(state.collection)[0]?.id || '';state.removal=null;render();return;}
    if(control.hasAttribute('data-pe-inputs')) {state.showInputs=control.checked;redrawMap();return;}
    if(control.dataset.peList) {const ref=resolvePath(control.dataset.peList);if(ref){ref.target[ref.key]=control.checked?[...new Set([...ref.target[ref.key],control.value])]:ref.target[ref.key].filter(id=>id!==control.value);touch();redrawMap();}return;}
    if(control.hasAttribute('data-pe-route') || control.hasAttribute('data-pe-route-id')) {
      let route=control.dataset.peRouteId?by('transitions').find(item=>item.id===control.dataset.peRouteId):by('transitions').find(item=>item.fromStepId===control.dataset.peStep&&item.outcome===control.dataset.peRoute);
      if(!route){route=createProcessRecord('transitions',createProcessId(by('transitions'),'route'));route.fromStepId=control.dataset.peStep;route.outcome=control.dataset.peRoute;by('transitions').push(route);}
      const [type,id]=control.value.split(':');route.to={type,id};touch();redrawMap();return;
    }
    if(control.dataset.peBind && ['select-one','checkbox'].includes(control.type)) {updateField(control);render();}
  });
  dialog.addEventListener('click',event=>{
    event.stopPropagation();const button=event.target.closest('button');if(!button || !state)return;
    try {
      if(button.dataset.peSelect){state.collection=button.dataset.peCollection;state.recordId=button.dataset.peSelect;state.removal=null;render();dialog.querySelector('.pe-inspector input,.pe-inspector select,.pe-inspector textarea')?.focus();return;}
      if(button.dataset.peAdd){add(button.dataset.peAdd);return;}
      if(button.dataset.peRemoveOutcome){state.removal={outcome:true,id:button.dataset.peRemoveOutcome,collection:'outcomes',message:'Removing an outcome may require moving its routes and correction policy to another outcome.',references:by('transitions').filter(route=>route.fromStepId===selected().id&&route.outcome===button.dataset.peRemoveOutcome).map(route=>`Route: ${route.id}`)};render();return;}
      switch(button.dataset.peAction){
        case 'close': close();break;
        case 'overview': suspend();onBack();break;
        case 'request-discard': state.discard=true;render();dialog.querySelector('[data-pe-action="keep-editing"]')?.focus();break;
        case 'discard': if(inlineHost)resetToCurrent();else close(true);break;
        case 'keep-editing': state.discard=false;render();dialog.querySelector(state.review ? '[data-pe-action="back"]' : state.draft ? '[data-pe-action="review"]' : '[data-pe-start="name"]')?.focus();break;
        case 'keep-current': resolveConflict('current');break;
        case 'copy-draft': resolveConflict('copy');break;
        case 'review-over-current': resolveConflict('replace');break;
        case 'cancel-switch': state.switchRequest=null;render();break;
        case 'review-before-switch': state.afterApplyOpen=state.switchRequest;state.switchRequest=null;review();break;
        case 'discard-and-switch': {const next=state.switchRequest;state=null;open(next.processId,next.stepId,{collection:next.collection,recordId:next.recordId});notify();break;}
        case 'create': materializeDraft();render();dialog.querySelector('.pe-inspector input,.pe-inspector textarea,.pe-inspector select')?.focus();break;
        case 'map': state.listView=false;render();break;
        case 'list': state.listView=true;render();break;
        case 'review': review();break;
        case 'back': state.review=null;state.deleteProcess=false;render();dialog.querySelector('[data-pe-action="review"]')?.focus();notify();break;
        case 'remove-process': state.deleteProcess=true;review();notify();break;
        case 'apply': if(!state.review?.blocked && state.review?.result){
          if(JSON.stringify(getConfig())!==state.base){state.review=null;review();break;}
          const previous=state;
          const afterApplyOpen=state.afterApplyOpen;
          activeProcessId=state.deleteProcess ? '' : state.draft.id;
          const next=state.review.result.config;
          if(inlineHost){
            const applied=next.workflowModel.processes.find(process=>process.id===activeProcessId);
            const collection=state.collection,recordId=state.recordId;
            state=makeState(next,applied);
            for(const key of ['listView','showInputs','mapScroll','bodyScroll','inspectorScroll','inspectorRecord','details'])state[key]=clone(previous[key]);
            if(applied && Object.hasOwn(types,collection) && applied[collection].some(record=>record.id===recordId)){state.collection=collection;state.recordId=recordId;}
            state.notice='Process changes applied. Download your project to keep them.';
          }else state=null;
          try{onApply(next);}catch(error){state=previous;throw error;}
          if(afterApplyOpen){state=null;open(afterApplyOpen.processId,afterApplyOpen.stepId,{collection:afterApplyOpen.collection,recordId:afterApplyOpen.recordId});}
          else if(inlineHost){showSurface();render();dialog.querySelector('.pe-inspector input,.pe-inspector textarea,.pe-inspector select,[data-pe-start="name"]')?.focus();}
          else{hideSurface();dialog.replaceChildren();(document.querySelector(`[data-pe-open="${CSS.escape(activeProcessId)}"]`)||document.querySelector('[data-pe-new]'))?.focus();}
          notify();
        }break;
        case 'add-outcome': {const value=dialog.querySelector('#pe-outcome-name').value.trim();if(!value)throw Error('Name the outcome first.');const step=selected();const id=createProcessId(step.outcomes,value);step.outcomes.push(id);syncOutcomes(step.id);touch();render();dialog.querySelector('#pe-outcome-name')?.focus();break;}
        case 'new-input': {const step=selected();add('results',record=>{record.name='Supplied input';step.inputIds.push(record.id);});break;}
        case 'new-output': {const step=selected();add('results',record=>{record.name='Produced result';record.producerStepId=step.id;step.outputIds.push(record.id);});break;}
        case 'add-check': {const step=selected();add('checks',record=>{record.stepId=step.id;record.outcomes=[...step.outcomes];});break;}
        case 'remove-record': {const record=selected();let references=[];try{removeProcessRecord(state.draft,state.collection,record.id);}catch(error){references=error.impacts?.references || [error.message];}state.removal={collection:state.collection,id:record.id,message:`Remove ${record.name || record.id}. Referenced records need a replacement.`,references};render();break;}
        case 'cancel-remove': state.removal=null;render();dialog.querySelector('[data-pe-action="remove-record"]')?.focus();break;
        case 'confirm-remove': {const replacement=dialog.querySelector('#pe-replacement').value;const removal=state.removal;const result=removal.outcome?removeProcessOutcome(state.draft,selected().id,removal.id,{replacementOutcome:replacement}):removeProcessRecord(state.draft,removal.collection,removal.id,{replacementId:replacement});state.draft=result.draft;state.removal=null;if(!selected())state.recordId=by(state.collection)[0]?.id || '';touch();render();(dialog.querySelector('.pe-inspector input,.pe-inspector select,.pe-inspector textarea') || dialog.querySelector('[data-pe-action="review"]'))?.focus();break;}
      }
    }catch(error){if(!state){onNotice(error.message);return;}state.error=error.message;render();dialog.querySelector('[role="alert"]')?.scrollIntoView({block:'nearest'});}
  });
  modal.addEventListener('cancel',event=>{event.preventDefault();close();});
  dialog.addEventListener('keydown',event=>{event.stopPropagation();});
  dialog.addEventListener('scroll',event=>{
    if(!state||!visible||!dialog.getClientRects().length)return;
    if(event.target.matches('.pe-inspector'))state.inspectorScroll=event.target.scrollTop;
    if(event.target.matches('.pe-body'))state.bodyScroll=event.target.scrollTop;
    if(event.target.matches('.pd-scroll'))state.mapScroll={left:event.target.scrollLeft,top:event.target.scrollTop};
  },true);
  function suspend() {
    if(state){
      if(dialog.getClientRects().length)state.bodyScroll=dialog.querySelector('.pe-body')?.scrollTop ?? state.bodyScroll;
      const active=dialog.contains(document.activeElement) ? document.activeElement : null;
      state.focusSelector=active?.id ? `#${CSS.escape(active.id)}` : active ? [...active.attributes].filter(attribute=>attribute.name.startsWith('data-pe-')).map(attribute=>`[${attribute.name}="${CSS.escape(attribute.value)}"]`).join('') : '';
    }
    hideSurface();
  }
  function resume({ focus = false } = {}) {
    if(!state)return false;
    syncConfig({redraw:false});
    showSurface();render();
    if(focus)dialog.querySelector(state.focusSelector || '.pe-inspector input,.pe-inspector textarea,.pe-inspector select,[data-pe-start="name"]')?.focus({preventScroll:true});
    return true;
  }
  return {
    open, close, suspend, resume, syncConfig,
    mount(host){if(!host?.append)throw Error('Choose a Workflow editor host.');inlineHost=host;if(modal.open)modal.close();dialog.classList.add('pe-inline-designer');host.append(dialog);dialog.hidden=!visible || !state;if(state)render();return Boolean(state);},
    setVisible(show){return show ? resume() : suspend();},
    isPending:dirty, hasPending:dirty, isOpen:()=>Boolean(state&&visible), hasDraft:()=>Boolean(state), reset:()=>close(true),
    getContext(){return state ? {processId:state.processId||state.draft?.id||'',stepId:state.collection==='steps'?state.recordId:'',collection:state.collection,recordId:state.recordId,instructionIds:state.draft&&state.collection==='steps' ? [...(selected()?.instructionIds||[])] : [],kind:state.draft?.kind||'',pending:dirty()} : null;},
    getPendingPreview(){return state ? {process:clone(state.draft),processId:state.processId,base:JSON.parse(state.base),pending:dirty(),conflict:Boolean(state.conflict),reviewed:Boolean(state.review&&!state.review.blocked)} : null;},
    launcher(config){const custom=config.workflowModel.processes.filter(process=>process.source==='custom');const process=custom.find(item=>item.id===activeProcessId)||custom[0];activeProcessId=process?.id||'';return `<section class="pe-launcher" aria-label="Process designer"><div class="pe-launch-heading"><div><p class="eyebrow">STEPS AND CONNECTIONS</p><h2>${process?'Your process design':'Need a connected process?'}</h2><p>${process?'Select a step to edit its inputs, checks and next outcomes.':'Start with a sequence, review or bounded correction pattern.'}</p></div><button type="button" class="${process?'secondary':'primary'}" data-pe-new>Design a process</button></div>${process?`<div class="pe-inline"><label class="pe-field"><span>Process</span><select data-pe-active>${options(names(custom),process.id,false)}</select></label><button type="button" class="primary" data-pe-open="${escape(process.id)}">Open designer</button></div>${renderProcessDiagram(process,{mode:'open',prefix:'project-process',selectedStepId:process.entryStepId})}`:''}</section>`;},
    choose(id){activeProcessId=id;},
  };
}

const LEGACY_DESIGNER_STYLES = `.pe-designer,.pe-launcher{--panel:var(--paper);--surface:var(--soft)}.pe-designer{--pe-line:var(--line,#bdc8d7);width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;margin:0;padding:0;border:0;border-radius:0;color:var(--ink,#1c2739);background:var(--bg,#f4f7fb)}.pe-designer[open]{display:flex;flex-direction:column}.pe-designer::backdrop{background:#071522a6}.pe-header,.pe-footer{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 26px;border-bottom:1px solid var(--pe-line);flex:none}.pe-header h1{font-size:24px;margin:0}.pe-header p{margin:0 0 4px}.pe-body{overflow:auto;min-height:0;flex:1;padding:18px 26px}.pe-footer{border:0;border-top:1px solid var(--pe-line);background:var(--paper,#fff)}.pe-footer p{margin:0;font-size:13px;line-height:1.5;color:var(--muted,#56647a)}.pe-settings{display:flex;align-items:start;gap:20px;margin-bottom:18px}.pe-settings>.pe-field{flex:1}.pe-settings>details{flex:1}.pe-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,390px);gap:22px;align-items:start}.pe-workspace{min-width:0}.pe-inspector{border:1px solid var(--pe-line);border-radius:14px;padding:18px;background:var(--paper,#fff);min-width:0}.pe-inspector h2{font-size:19px}.pe-inspector h3{font-size:16px;margin-top:24px}.pe-field{display:flex;flex-direction:column;gap:7px;margin:0 0 14px;min-width:0;flex:1}.pe-field>span,.pe-choices legend{font-size:13px;font-weight:650}.pe-field input,.pe-field textarea,.pe-field select,.pe-choices input{font:inherit;color:var(--ink,#1c2739);background:var(--bg,#fff);border:1px solid var(--control-line,#899bb4);border-radius:8px;padding:10px;width:100%;min-width:0;min-height:42px}.pe-field textarea{resize:vertical;line-height:1.5}.pe-field small,.pe-hint,.pe-id{font-size:12px;color:var(--muted,#536078);line-height:1.5}.pe-choices{padding:10px 0;border:0;margin:6px 0}.pe-choices label,.pe-toggle{display:flex;align-items:center;gap:9px;font-size:13px;min-height:40px}.pe-choices input,.pe-toggle input{width:18px;min-height:18px;height:18px;flex:none;accent-color:var(--accent,#347f98)}.pe-choices legend{padding:0}.pe-toolbar,.pe-inline,.pe-launch-heading,.pe-record-heading{display:flex;flex-wrap:wrap;align-items:center;gap:12px}.pe-toolbar{justify-content:space-between}.pe-toolbar button,.pe-record-buttons button,.pe-step-list button{font:inherit;color:var(--ink,#182438);border:1px solid var(--pe-line);border-radius:8px;padding:10px 14px;background:var(--paper,#fff);cursor:pointer;min-height:44px}.pe-toolbar button[aria-pressed=true],.pe-record-buttons button[aria-pressed=true],.pe-step-list button[aria-pressed=true]{border-color:var(--accent,#25728a);box-shadow:0 0 0 2px #348ca22b}.pe-small{border:0;padding:8px;min-height:40px;background:transparent;color:var(--accent,#226c86);text-decoration:underline;cursor:pointer;font:inherit;font-size:13px}.pe-record-buttons{display:flex;gap:8px;flex-wrap:wrap}.pe-record-heading{justify-content:space-between}.pe-step-list{padding:0;list-style-position:inside;display:grid;gap:12px}.pe-step-list li{display:flex;min-width:0}.pe-step-list button{width:100%;text-align:left;display:grid;gap:8px}.pe-step-list span{font-size:13px;line-height:1.5}.pe-advanced,.pe-records{margin-top:18px}.pe-designer summary{cursor:pointer;padding:12px 0;font-size:14px;font-weight:600;min-height:44px}.pe-start,.pe-review{max-width:850px;margin:10px auto;padding:16px}.pe-review li{line-height:1.6;margin:10px 0;overflow-wrap:anywhere}.pe-review small{display:block;color:var(--muted,#56647a)}.pe-route{padding:10px 0;border-bottom:1px solid var(--pe-line)}.pe-route p{font-size:13px;line-height:1.5}.pe-route .pe-field{margin-bottom:0}.pe-error,.pe-confirm{border:1px solid var(--pe-line);border-radius:10px;padding:16px;background:var(--paper,#fff);margin-bottom:15px;line-height:1.6;overflow-wrap:anywhere}.pe-error{border-color:var(--error,#b94b3f)}.pe-launcher{margin-bottom:28px}.pe-launch-heading{justify-content:space-between;margin-bottom:16px}.pe-launch-heading h2{font-size:21px;margin:4px 0}.pe-launch-heading p{margin:4px 0;line-height:1.6}.pe-launcher>.pe-inline>.pe-field{max-width:400px;margin-bottom:0}.pe-designer :is(button,input,select,textarea,summary):focus-visible,.pe-launcher :is(button,select):focus-visible{outline:3px solid var(--accent,#24778e);outline-offset:3px}@media(max-width:900px){.pe-layout{grid-template-columns:1fr}.pe-inspector{scroll-margin:16px}.pe-settings{flex-wrap:wrap}.pe-settings>.pe-field,.pe-settings>details{flex-basis:42%}}@media(max-width:560px){.pe-header,.pe-footer{padding:12px 14px}.pe-header h1{font-size:20px}.pe-body{padding:14px}.pe-footer{align-items:stretch;flex-direction:column;gap:8px}.pe-settings{display:block}.pe-toolbar{gap:8px}.pe-review,.pe-start{padding:0}.pe-inline{align-items:stretch}.pe-launch-heading{align-items:stretch}.pe-launch-heading>button{width:100%}.pe-designer button{white-space:normal}.pe-route .pe-field select{font-size:14px}}`;


export const DESIGNER_STYLES = `${LEGACY_DESIGNER_STYLES}
.pe-designer,.pe-designer *{box-sizing:border-box}.pe-modal{width:100vw;max-width:100vw;height:100dvh;max-height:100dvh;margin:0;padding:0;border:0;border-radius:0;background:var(--bg,#f4f7fb);color:var(--ink,#1c2739)}.pe-modal::backdrop{background:#071522a6}.pe-designer{display:flex;flex-direction:column}.pe-designer[hidden]{display:none!important}.pe-inline-designer{width:100%;max-width:100%;height:calc(100dvh - 170px);min-height:560px;max-height:none;margin:0;border:1px solid var(--line,#bdc8d7);border-radius:14px;overflow:hidden}.pe-header :is(h1,h2){font-size:24px;margin:0}.pe-notice{padding:12px 16px;line-height:1.6;border:1px solid var(--line,#bdc8d7);border-radius:10px;background:var(--paper,#fff);overflow-wrap:anywhere}.pe-conflict pre{max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;background:var(--soft,#eef2f7);padding:12px;border-radius:8px}.pe-inline-designer .pe-body{overscroll-behavior:contain}.pe-conflict .pe-inline>button{flex:1;min-width:min(200px,100%)}@media(max-width:900px){.pe-inline-designer{height:auto;min-height:0}.pe-inline-designer .pe-body{overflow:visible}.pe-inline-designer .pe-footer{position:sticky;bottom:0;z-index:2}.pe-inline-designer .pd-scroll{max-height:55dvh;min-height:260px}}@media(max-width:560px){.pe-header :is(h1,h2){font-size:20px}.pe-inline-designer{border-radius:10px}.pe-conflict .pe-inline{display:grid}.pe-conflict .pe-inline>button{min-width:0;width:100%}}
.pe-header{padding:12px 18px;gap:12px}.pe-header>div{min-width:0}.pe-header :is(h1,h2){font-size:20px;line-height:1.3;overflow-wrap:anywhere}.pe-header .eyebrow{font-size:10px}.pe-footer{padding:10px 18px;gap:12px}.pe-footer p{font-size:12px}.pe-settings{display:block;margin:0}.pe-settings>summary{padding:8px 0}.pe-settings-fields{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0 16px;padding:10px 0}.pe-settings-fields>.pe-field:has([data-pe-bind="purpose"]),.pe-settings-fields>p{grid-column:1/-1}.pe-settings-fields>.pe-small{justify-self:start}.pe-notice{padding:8px 12px;font-size:13px;margin:0}.pe-inline-designer .process-diagram figcaption{font-size:12px;line-height:1.4;margin:0 0 8px}
@media(min-width:901px){.pe-inline-designer.is-editing .pe-body{display:flex;flex-direction:column;gap:10px;overflow:hidden;padding:14px 18px}.pe-inline-designer.is-editing .pe-settings{flex:none}.pe-inline-designer.is-editing .pe-layout{flex:1;min-height:0;align-items:stretch;overflow:hidden;gap:18px}.pe-inline-designer.is-editing .pe-workspace{display:flex;flex-direction:column;gap:10px;min-height:0}.pe-inline-designer.is-editing .pe-toolbar{flex:none;gap:8px}.pe-inline-designer.is-editing #pe-map{flex:1;min-height:160px;overflow:auto}.pe-inline-designer.is-editing .process-diagram{margin:0;height:100%;display:flex;flex-direction:column;min-height:0}.pe-inline-designer.is-editing .pd-scroll{flex:1;min-height:160px;max-height:none}.pe-inline-designer.is-editing .pe-records{flex:none;margin:0;max-height:180px;overflow:auto}.pe-inline-designer.is-editing .pe-inspector{height:100%;min-height:0;overflow:auto;overscroll-behavior:contain;padding:16px}.pe-inline-designer.is-editing .pe-body:has(>.pe-settings[open]){display:block;overflow:auto}.pe-inline-designer.is-editing .pe-body:has(>.pe-settings[open]) .pe-layout{height:460px;min-height:460px;margin-top:10px}}
@media(max-width:900px){.pe-settings-fields{grid-template-columns:1fr}.pe-settings-fields>.pe-field,.pe-settings-fields>p{grid-column:auto}.pe-settings{margin-bottom:14px}.pe-notice{margin-bottom:12px}}@media(max-width:560px){.pe-header,.pe-footer{padding:10px 12px}.pe-header :is(h1,h2){font-size:18px}.pe-header>button{font-size:12px;padding:8px 10px}.pe-header{align-items:flex-start}.pe-footer .pe-inline>button{flex:1}.pe-notice{font-size:12px}}
`;
