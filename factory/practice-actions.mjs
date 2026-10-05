import { CATALOG } from './catalog.mjs';

const definitions = Object.freeze([
  { topicId: 'context-selection', practiceId: 'progressive-context', title: 'Load relevant context when needed', reason: 'Keep reusable instructions focused and put project detail in linked references. This selects the existing context practice without claiming a measured cost saving.' },
  { topicId: 'implementation-workflow', practiceId: 'minimum-change', title: 'Prefer the smallest necessary change', reason: 'This workflow includes a change stage. Record the existing reuse and scope practice while keeping required verification and accessibility checks.' },
  { topicId: 'requirements-workflow', practiceId: 'specification-first', title: 'Connect requirements to implementation', reason: 'This workflow includes requirements and implementation. Record the existing traceability practice. It does not install or run Spec Kit.' },
  { topicId: 'llm-wiki', practiceId: 'evidence-wiki', title: 'Keep source backed project knowledge', reason: 'Record the existing source, summary and correction practice. It does not create a wiki service, verify supplied facts or add a knowledge agent.' },
  { topicId: 'study-contract', runtimeControlId: 'before-write', title: 'Record validation before writes', reason: 'For a feasibility study or an existing runtime design, record a requirement to validate permitted changes before persistence. The backend still needs actual authorization and business rules.' },
]);

export const PRACTICE_TOPIC_IDS = Object.freeze(definitions.map(definition => definition.topicId));

const actionId = definition => definition.practiceId ? `practice:${definition.practiceId}` : `runtime:${definition.runtimeControlId}`;
const clone = config => JSON.parse(JSON.stringify(config));

function supportedConfig(config) {
  return config !== null && typeof config === 'object'
    && CATALOG.recipes.some(recipe => recipe.id === config.workflow?.recipe)
    && Array.isArray(config.workflow?.enabledStages)
    && Array.isArray(config.practices)
    && typeof config.runtime?.enabled === 'boolean'
    && Array.isArray(config.runtime.controls);
}

function applicable(definition, config) {
  if (!supportedConfig(config)) return false;
  const stages = config.workflow.enabledStages;
  if (definition.practiceId === 'minimum-change') return stages.includes('implementation') || stages.includes('bug-fix');
  if (definition.practiceId === 'specification-first') return stages.includes('requirements') && stages.includes('implementation');
  if (definition.runtimeControlId) return config.workflow.recipe === 'feasibility' || config.runtime.enabled;
  return true;
}

export function getPracticeAction(topicId, config) {
  const definition = definitions.find(candidate => candidate.topicId === topicId);
  if (!definition || !applicable(definition, config)) return null;
  const id = actionId(definition);
  if (definition.practiceId) {
    const practice = CATALOG.practices.find(candidate => candidate.id === definition.practiceId);
    const alreadyApplied = config.practices.includes(practice.id);
    return {
      id, title: definition.title, topicId, reason: definition.reason, source: practice.source, alreadyApplied,
      changes: alreadyApplied ? ['This reference practice is already selected. No project decisions will change.'] : [
        `Select the existing reference practice: ${practice.label}.`,
        practice.application,
        'Preserve workflow stages, responsibilities, skills, tools, project notes and recorded evidence.',
      ],
    };
  }
  const control = config.runtime.controls.find(candidate => candidate.id === definition.runtimeControlId);
  const alreadyApplied = config.runtime.enabled && Boolean(control);
  return {
    id, title: definition.title, topicId, reason: definition.reason,
    source: 'https://modelcontextprotocol.io/specification/2026-07-28/server/tools',
    alreadyApplied,
    changes: alreadyApplied ? ['The runtime draft already includes this control. Its recorded progress and evidence remain unchanged.'] : [
      ...(!config.runtime.enabled ? ['Include the backend runtime design draft. Missing runtime decisions remain unresolved.'] : []),
      ...(control ? ['Preserve the existing before-write control and its recorded progress.'] : ['Add “Validate permitted changes before writes” as a requirement with no implementation or evidence link.']),
      'Keep project-specific validation text unchanged. Record the actual rules separately.',
      'No runtime enforcement, permissions, implementation or passing evidence is created.',
    ],
  };
}

export function applyPracticeAction(config, id) {
  const definition = definitions.find(candidate => actionId(candidate) === id);
  if (!definition) throw new Error('Choose a supported Atlas practice action.');
  if (!applicable(definition, config)) throw new Error('This practice does not apply to the current workflow.');
  const next = clone(config);
  if (definition.practiceId) {
    if (!next.practices.includes(definition.practiceId)) next.practices.push(definition.practiceId);
  } else {
    next.runtime.enabled = true;
    if (!next.runtime.controls.some(control => control.id === definition.runtimeControlId)) {
      const control = CATALOG.runtimeControls.find(candidate => candidate.id === definition.runtimeControlId);
      next.runtime.controls.push({ ...control, status: 'requirement', implementation: '', evidenceId: '' });
    }
  }
  return next;
}
