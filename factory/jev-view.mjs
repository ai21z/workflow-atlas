import { CATALOG } from './catalog.mjs';
import { buildAssistancePayload } from './jev-assistance.mjs';

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const named = (items, id) => items.find(item => item.id === id)?.label || id;
const practiceIds = ['specification-first', 'minimum-change', 'evidence-wiki'];

// This view keeps editable review wording separate until the person confirms it.
export function mountJevView(controller, { onCreate, onChange = () => {} } = {}) {
  const staticHosting = document.documentElement.dataset.atlasHosting === 'static';
  const root = document.querySelector('#jev-start');
  const brief = root.querySelector('#jev-brief');
  const review = root.querySelector('#jev-review');
  const status = root.querySelector('#jev-status');
  const error = root.querySelector('#jev-error');
  const reviewWording = new Map();
  let availability = staticHosting ? false : null;
  let previousStatus = '';
  let previousBrief = '';
  let requestStartedAt = null;
  let metricSequence = 0;
  let visibleResultElapsedMs = null;

  if (staticHosting) {
    root.setAttribute('aria-label', 'Describe your workflow');
    document.querySelector('#start-description').textContent = 'Choose a workflow. Add your decisions and download starting files for your team or AI assistant.';
    document.querySelector('#manual-start-label').textContent = 'Choose a starting workflow';
    root.querySelector('#jev-privacy').textContent = 'Your project stays in this tab. This hosted version makes no AI requests. Download to keep your work.';
    root.querySelector('.jev-start-actions').hidden = true;
    root.querySelector('#jev-submit').hidden = true;
    root.querySelector('.jev-payload').hidden = true;
    root.querySelector('#jev-setup-note').innerHTML = 'Want AI suggestions? <a href="../docs/jev/#integration" target="_blank" rel="noreferrer">Run Atlas locally with your own JEV key <span class="sr-only">(opens in a new tab)</span>↗</a>.';
    document.querySelector('#help-start-description').textContent = 'Choose an investigation, feature or bug workflow. Add a description first to carry it into your draft. You can also design a connected process or open a pack to continue.';
    document.querySelector('#help-session-description').textContent = 'Project editing stays in this tab. This hosted version makes no AI requests. Download before closing or reloading. Open pack accepts an Atlas ZIP, project JSON, project HTML or a folder with Atlas metadata.';
  }

  function recordVisibleResult() {
    const sequence = metricSequence;
    const startedAt = requestStartedAt;
    requestAnimationFrame(() => {
      if (sequence === metricSequence && startedAt !== null) visibleResultElapsedMs = performance.now() - startedAt;
    });
  }

  function render() {
    const state = controller.getState();
    if (state.draft.userBrief !== previousBrief) { reviewWording.clear(); previousBrief = state.draft.userBrief; }
    const requesting = state.status === 'requesting';
    if (requesting && previousStatus !== 'requesting') { requestStartedAt = performance.now(); metricSequence += 1; visibleResultElapsedMs = null; }
    const completedRequest = previousStatus === 'requesting' && !requesting;
    if (document.activeElement !== brief) brief.value = state.draft.userBrief;
    root.querySelector('#jev-submit').disabled = staticHosting || requesting || !state.draft.userBrief.trim();
    root.querySelector('#jev-submit').textContent = requesting ? 'Finding a starting workflow…' : state.proposal ? 'Review my description again' : 'Suggest my workflow →';
    root.querySelector('#jev-cancel').hidden = !requesting;
    root.querySelector('#jev-form').setAttribute('aria-busy', String(requesting));
    const messages = {
      requesting: 'Finding a starting workflow. You can cancel or choose one yourself.',
      reviewing: state.proposal ? 'Your suggested draft is ready to review.' : 'Choose a workflow below. Your description is kept.',
      manual: 'You chose the workflow. Your description is kept.',
      unsupported: 'This request does not match the available workflows. Describe an investigation, a software feature or a bug, or choose a workflow below.',
      unclear: 'I could not tell which workflow fits. Describe what you want to do first, or choose a workflow below.',
      cancelled: 'Suggestion cancelled. Your description is kept.',
      outdated: 'Your description changed. Ask for a new suggestion or choose a workflow yourself.',
      failed: 'Suggestion unavailable. You can try again or choose a workflow yourself.',
    };
    const idleNote = availability === false ? 'Suggestions need a configured local server. Choose a workflow below to continue.' : '';
    const nextStatus = staticHosting ? state.proposal ? 'Your chosen workflow is ready. Review it and create your draft.' : 'Choose a workflow below. Your description will be carried into the draft.' : messages[state.status] || idleNote;
    if (status.textContent !== nextStatus) status.textContent = nextStatus;
    root.querySelector('#jev-setup-note').hidden = availability !== false && !['unavailable', 'authentication'].includes(state.error?.code);
    error.hidden = !state.error;
    if (state.error && error.textContent !== state.error.message) error.textContent = state.error.message;
    if (!state.error) error.textContent = '';
    brief.setAttribute('aria-invalid', String(['input', 'invalid_input', 'input_too_large'].includes(state.error?.code)));

    const payload = root.querySelector('#jev-payload-preview');
    const outgoing = buildAssistancePayload(state.draft, 'disclosure', state.proposal?.recipeId);
    const answerEntries = Object.entries(outgoing.suppliedProjectAnswers).filter(([, value]) => value.trim());
    payload.innerHTML = staticHosting ? '' : `<p>Atlas sends your description${answerEntries.length ? ', your recorded answers' : ''}${state.draft.practiceId ? ' and the practice you selected' : ''}, together with its fixed question definitions. The details are shown below. No project files are uploaded. The server authenticates with its key, which stays out of your project and generated files.</p><dl><dt>Description</dt><dd>${escape(state.draft.userBrief || 'Nothing entered yet.')}</dd>${answerEntries.map(([id, text]) => `<dt>${escape(CATALOG.recipes.flatMap(recipe => recipe.questions).find(question => question.id === id)?.label || id)}</dt><dd>${escape(text)}</dd>`).join('')}${state.draft.practiceId ? `<dt>Practice</dt><dd>${escape(named(CATALOG.practices, state.draft.practiceId))}</dd>` : ''}</dl>`;

    const active = document.activeElement;
    const focusId = review.contains(active) ? active.id : '';
    const selection = focusId && ['TEXTAREA', 'INPUT'].includes(active.tagName) && active.selectionStart !== null && active.selectionStart !== undefined ? [active.selectionStart, active.selectionEnd] : null;
    const openDetails = [...review.querySelectorAll('details[open]')].map(item => item.id);
    const proposal = state.proposal;
    if (!proposal) {
      review.innerHTML = '';
      previousStatus = state.status;
      if (completedRequest) recordVisibleResult();
      onChange(state);
      return;
    }
    const questions = proposal.recipe.questions || CATALOG.recipes.find(item => item.id === proposal.recipeId)?.questions || [];
    const next = state.nextQuestion;
    const selectedPractice = CATALOG.practices.find(item => item.id === state.draft.practiceId);
    const practiceResult = proposal.practice?.choice;
    const keptPractices = state.draft.includedPractices.filter(id => id !== state.draft.practiceId || practiceResult !== 'relevant');
    const keptPracticesMarkup = keptPractices.length ? `<div class="jev-kept-practices"><strong>Your selected practices</strong><p>Your earlier selections are kept. Review them if the description changed.</p>${keptPractices.map(id => `<div><span>${escape(named(CATALOG.practices, id))}${id === state.draft.practiceId && practiceResult === 'not-relevant' ? '. The current check does not suggest it.' : ''}</span><button type="button" class="text-button" data-jev-action="remove-practice" data-practice="${escape(id)}">Remove ${escape(named(CATALOG.practices, id))}</button></div>`).join('')}</div>` : '';
    const answerReviews = state.answerReviews.map(item => {
      const text = reviewWording.has(item.id) ? reviewWording.get(item.id) : item.reviewText;
      return `<details id="jev-covered-${escape(item.id)}" class="jev-answer-review"><summary>Review answer: ${escape(item.label)}</summary><p>Appears covered in your description. It stays unresolved in the files until you record an answer.</p><label class="journey-field" for="jev-wording-${escape(item.id)}"><span>Wording from your description. Edit or shorten it.</span><textarea id="jev-wording-${escape(item.id)}" data-jev-wording="${escape(item.id)}" maxlength="20000" rows="3">${escape(text)}</textarea></label><button type="button" class="secondary" data-jev-action="confirm" data-question="${escape(item.id)}">Use this answer</button></details>`;
    }).join('');
    review.innerHTML = `<article class="jev-proposal" aria-labelledby="jev-proposal-title"><div class="jev-proposal-heading"><div><span class="eyebrow">${proposal.manualOverride ? 'YOUR CHOICE' : 'SUGGESTED WORKFLOW'}</span><h2 id="jev-proposal-title" tabindex="-1">${escape(proposal.recipe.label)}</h2><p>${escape(proposal.recipe.description)}</p></div><label class="jev-recipe-choice" for="jev-recipe"><span>Change workflow</span><select id="jev-recipe">${CATALOG.recipes.map(item => `<option value="${escape(item.id)}" ${item.id === proposal.recipeId ? 'selected' : ''}>${escape(item.label)}</option>`).join('')}</select></label></div><ol class="jev-stage-strip" aria-label="Starting stages">${proposal.stages.map(stage => `<li>${escape(stage.title)}</li>`).join('')}</ol><p class="jev-defaults">Template defaults include starting roles and skills. Edit them for your team. Technologies and commands stay open.</p>${next ? `<section class="jev-question" aria-labelledby="jev-question-title"><span class="eyebrow">OPTIONAL QUESTION</span><h3 id="jev-question-title">${escape(next.label)}</h3><p>${escape(next.hint)}${next.assessment === 'conflicting' ? ' JEV noticed a possible conflict. You can clarify or keep your answer.' : ''}</p><label class="journey-field" for="jev-next-answer"><span class="sr-only">${escape(next.label)}</span><textarea id="jev-next-answer" data-jev-answer="${escape(next.id)}" maxlength="20000" rows="2" placeholder="Add what you know, or finish this later.">${escape(state.draft.suppliedProjectAnswers[next.id] || '')}</textarea></label><p class="hint">Typing stays here until you select Record this answer.</p><div class="jev-question-actions"><button type="button" class="secondary" data-jev-action="answer" data-question="${escape(next.id)}">Record this answer</button>${next.canKeepAnswer ? `<button type="button" class="text-button" data-jev-action="keep" data-question="${escape(next.id)}">Keep my answer</button>` : ''}<button type="button" class="text-button" data-jev-action="defer" data-question="${escape(next.id)}">${next.canKeepAnswer ? 'Continue without this change' : 'Continue without this'}</button></div></section>` : '<p class="jev-ready">You can create this draft now. Unrecorded details remain open in your files.</p>'}${answerReviews}<details id="jev-draft-details" class="jev-draft-details"><summary>Name and recorded answers</summary><label class="journey-field" for="jev-name"><span>Project name</span><input id="jev-name" maxlength="200" value="${escape(state.draft.projectName)}" placeholder="Untitled workflow"></label><label class="journey-field" for="jev-purpose"><span>Wanted result</span><textarea id="jev-purpose" maxlength="20000" rows="2">${escape(state.draft.purpose)}</textarea><small>Your original description is retained if you change this result.</small></label>${questions.map(item => `<p><strong>${escape(item.label)}</strong><br>${escape(state.draft.suppliedProjectAnswers[item.id] || ((item.id === 'user-need' || item.id === 'desired-outcome') ? state.draft.purpose : 'Needs an answer.'))}</p>`).join('')}</details><details id="jev-practice-details" class="jev-draft-details"><summary>Check one practice, optional</summary><p>Assess one reviewed practice for this description. This does not search all practices.</p><label class="journey-field" for="jev-practice"><span>Practice to check</span><select id="jev-practice"><option value="">Choose a practice</option>${practiceIds.map(id => `<option value="${id}" ${state.draft.practiceId === id ? 'selected' : ''}>${escape(named(CATALOG.practices, id))}</option>`).join('')}</select></label><button type="button" class="secondary" data-jev-action="check-practice" ${!state.draft.practiceId || requesting ? 'disabled' : ''}>Check this practice</button>${selectedPractice ? `<p>${escape(selectedPractice.description)}</p><p class="hint">${escape(selectedPractice.limits)}</p>` : ''}${practiceResult ? `<p class="jev-practice-result">${practiceResult === 'relevant' ? 'Suggested for this work.' : practiceResult === 'not-relevant' ? 'Not suggested for this work.' : 'More context needed for this practice.'}</p>${practiceResult === 'relevant' ? `<label class="jev-practice-add"><input id="jev-include-practice" type="checkbox" ${state.draft.includedPractices.includes(state.draft.practiceId) ? 'checked' : ''}> Add ${escape(selectedPractice?.label)} to this draft</label>` : ''}` : ''}</details><div class="jev-create"><button type="button" class="primary" id="jev-create" data-jev-action="create" ${requesting ? 'disabled' : ''}>Create this draft →</button><span>You can edit everything before downloading.</span></div></article>`;
    review.querySelector('#jev-practice-details').insertAdjacentHTML('beforeend', keptPracticesMarkup);
    review.querySelector('#jev-practice-details').hidden = staticHosting;
    review.querySelector('.jev-defaults').insertAdjacentElement('afterend', review.querySelector('.jev-create'));
    const nextAnswer = review.querySelector('#jev-next-answer');
    if (nextAnswer && next) nextAnswer.value = Object.hasOwn(state.pendingAnswers, next.id) ? state.pendingAnswers[next.id] : next.recordedText;
    if (Object.keys(state.pendingAnswers).length) review.querySelector('.jev-create span').textContent = 'Only recorded answers go into this draft. Record your unfinished answer below to include it.';
    if (keptPractices.length) review.querySelector('#jev-practice-details').open = true;
    openDetails.forEach(id => { const detail = document.getElementById(id); if (detail) detail.open = true; });
    if (focusId) {
      const control = document.getElementById(focusId);
      if (control) { control.focus({ preventScroll: true }); if (selection && typeof control.setSelectionRange === 'function') control.setSelectionRange(...selection); }
    }
    if (previousStatus === 'requesting' && state.status === 'reviewing' && !focusId) review.querySelector('#jev-proposal-title')?.focus({ preventScroll: true });
    previousStatus = state.status;
    if (completedRequest) recordVisibleResult();
    onChange(state);
  }

  brief.addEventListener('input', () => controller.updateBrief(brief.value));
  root.querySelector('#jev-form').addEventListener('submit', event => { event.preventDefault(); if (!staticHosting) controller.suggest({ newReview: Boolean(controller.getState().proposal) }); });
  root.querySelector('#jev-cancel').addEventListener('click', () => { controller.cancel(); root.querySelector('#jev-submit').focus(); });
  review.addEventListener('input', event => {
    const target = event.target;
    if (target.dataset.jevWording) { reviewWording.set(target.dataset.jevWording, target.value); return; }
    if (target.dataset.jevAnswer) controller.setAnswer(target.dataset.jevAnswer, target.value);
    else if (target.id === 'jev-name') controller.updateName(target.value);
    else if (target.id === 'jev-purpose') controller.updatePurpose(target.value);
  });
  review.addEventListener('change', event => {
    if (event.target.id === 'jev-recipe') controller.chooseRecipe(event.target.value);
    if (event.target.id === 'jev-practice') controller.choosePractice(event.target.value || null);
    if (event.target.id === 'jev-include-practice') controller.setPracticeIncluded(event.target.checked);
  });
  review.addEventListener('click', async event => {
    const button = event.target.closest('[data-jev-action]');
    if (!button) return;
    const id = button.dataset.question;
    const beforeAction = controller.getState();
    try {
      if (button.dataset.jevAction === 'confirm') controller.confirmAnswer(id, document.getElementById(`jev-wording-${id}`).value);
      if (button.dataset.jevAction === 'answer') controller.confirmAnswer(id, stateAnswer(id));
      if (button.dataset.jevAction === 'defer') controller.deferQuestion(id);
      if (button.dataset.jevAction === 'keep') controller.keepAnswer(id);
      if (['confirm', 'answer', 'defer', 'keep'].includes(button.dataset.jevAction)) {
        const nextField = review.querySelector('#jev-next-answer') || review.querySelector('[data-jev-wording]');
        if (nextField) {
          const details = nextField.closest('details');
          if (details) details.open = true;
        }
        (nextField || review.querySelector('#jev-create'))?.focus();
        const actionMessage = button.dataset.jevAction === 'defer'
          ? Object.hasOwn(beforeAction.pendingAnswers, id) ? 'Unrecorded wording discarded. Any earlier recorded answer is kept.' : 'Question left for later.'
          : button.dataset.jevAction === 'keep' ? 'Your recorded answer is kept.' : 'Answer recorded.';
        status.textContent = `${actionMessage} ${nextField ? 'You can review the next answer or create the draft.' : 'You can create the draft now.'}`;
      }
      if (button.dataset.jevAction === 'check-practice' && !staticHosting) controller.suggest();
      if (button.dataset.jevAction === 'remove-practice') controller.setPracticeIncluded(false, button.dataset.practice);
      if (button.dataset.jevAction === 'create') await onCreate?.();
    } catch {
      error.textContent = 'Enter wording to record, or continue without this answer.';
      error.hidden = false;
      const field = id ? document.getElementById(`jev-wording-${id}`) || document.getElementById('jev-next-answer') : null;
      if (field) { field.setAttribute('aria-invalid', 'true'); field.setAttribute('aria-describedby', 'jev-error'); field.focus(); }
    }
  });
  function stateAnswer(id) { return review.querySelector('#jev-next-answer')?.value ?? controller.getState().draft.suppliedProjectAnswers[id] ?? ''; }

  async function checkAvailability() {
    if (staticHosting) return;
    if (!['http:', 'https:'].includes(location.protocol)) { availability = false; render(); return; }
    try {
      const response = await fetch('/api/jev/status', { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(2500) });
      const value = response.ok ? await response.json() : null;
      availability = value?.available === true;
    } catch { availability = false; }
    render();
  }
  render();
  checkAvailability();
  return { render, clearReviewWording: () => reviewWording.clear(), getMetrics: () => ({ clientResponseElapsedMs: controller.getState().browserElapsedMs, clickToVisibleResultMs: visibleResultElapsedMs, ...controller.getState().metadata }) };
}
