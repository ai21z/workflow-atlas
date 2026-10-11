import { CATALOG } from './catalog.mjs'

// The four eligibility values are presets. An optional conditions block narrows a preset further.
function presetApplies(eligibility, config) {
  const stages = config?.workflow?.enabledStages || []
  switch (eligibility) {
    case 'always': return true
    case 'change-stage': return stages.includes('implementation') || stages.includes('bug-fix')
    case 'requirements-and-change': return stages.includes('requirements') && stages.includes('implementation')
    case 'runtime-design': return config?.workflow?.recipe === 'feasibility' || config?.runtime?.enabled === true
    default: return false
  }
}

export function projectTechnologyIds(config) {
  return new Set((Array.isArray(config?.components) ? config.components : []).flatMap(component => (Array.isArray(component?.technologies) ? component.technologies : []).map(technology => technology?.id).filter(id => typeof id === 'string')))
}

export function actionApplicable(definition, config) {
  if (!presetApplies(definition.eligibility, config)) return false
  const wanted = definition.conditions?.technology?.in
  if (Array.isArray(wanted) && wanted.length) {
    const ids = projectTechnologyIds(config)
    if (!wanted.some(id => ids.has(id))) return false
  }
  return true
}

export function practiceApplicable(id, config) {
  const definition = CATALOG.practiceActions.find(item => item.practiceId === id)
  return definition ? actionApplicable(definition, config) : true
}
