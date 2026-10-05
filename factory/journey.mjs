import { CATALOG, PROJECT_JSON_MAX_BYTES, compileSelectedOutput, getEffectiveSkills, getUseInstructions, getStages } from './core.mjs';

// Output selection belongs to the current session. Project decisions remain in project.json.
export function recommendOutput(config) {
  return {
    kind: 'blueprint', skillId: null, title: 'Workflow blueprint',
    reason: !getStages(config).length
      ? 'Start with a readable process, its connections and planned checks. Choose a skill or full pack when you need the assigned instructions.'
      : config.workflow.recipe === 'feasibility'
      ? 'Start with a readable plan, evidence and a decision record. Add agent instructions only when you need them.'
      : 'Start with a readable workflow and its decisions. Choose a skill or a full pack when you need instructions for an agent.',
  };
}

export function compileOutput(config, selection = recommendOutput(config)) {
  return compileSelectedOutput(config, selection);
}

// A supplied manifest records output scope. Its validation claims are not reused.
export function getOpenedOutputSelection(config, files) {
  if (!Array.isArray(files)) return null;
  const records = files.filter(file => typeof file?.path === 'string' && file.path.normalize('NFC').toLowerCase() === 'manifest.json');
  if (records.length !== 1 || typeof records[0].content !== 'string' || new TextEncoder().encode(records[0].content).length > PROJECT_JSON_MAX_BYTES) return null;
  let manifest;
  try { manifest = JSON.parse(records[0].content); }
  catch { return null; }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest) || !['2.0', CATALOG.schemaVersion].includes(manifest.schemaVersion) || !['blueprint', 'skill', 'pack'].includes(manifest.kind)) return null;
  const selection = { kind: manifest.kind, skillId: null };
  if (manifest.kind === 'skill') {
    if (typeof manifest.skill !== 'string' || !getEffectiveSkills(config).some(skill => skill.id === manifest.skill)) return null;
    selection.skillId = manifest.skill;
  }
  return selection;
}

export function compileOpenedOutput(config, files) {
  return compileOutput(config, getOpenedOutputSelection(config, files) || { kind: 'pack' });
}

export function getUseGuide(config, selection = recommendOutput(config)) {
  return getUseInstructions(config, selection);
}
