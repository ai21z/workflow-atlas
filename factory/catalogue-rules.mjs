import { CATALOG } from './catalog.mjs'

export function actionApplicable(definition, config) {
  const stages = config?.workflow?.enabledStages || []
  switch (definition.eligibility) {
    case 'always': return true
    case 'change-stage': return stages.includes('implementation') || stages.includes('bug-fix')
    case 'requirements-and-change': return stages.includes('requirements') && stages.includes('implementation')
    case 'runtime-design': return config?.workflow?.recipe === 'feasibility' || config?.runtime?.enabled === true
    default: return false
  }
}

export function practiceApplicable(id, config) {
  const definition = CATALOG.practiceActions.find(item => item.practiceId === id)
  return definition ? actionApplicable(definition, config) : true
}
