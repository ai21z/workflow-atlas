import { CATALOG, DEFINITION_VERSION, REVIEW_DATE, SOURCES } from './catalog.mjs'

const clone = value => JSON.parse(JSON.stringify(value))
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const same = (first, second) => JSON.stringify(canonical(first)) === JSON.stringify(canonical(second))
const MAX_BYTES = 8 * 1024 * 1024
const groups = ['practice', 'recipe', 'stage', 'skill', 'role', 'technology', 'host', 'runtime']
const text = value => typeof value === 'string'
const version = (value, fallback) => text(value) ? value : fallback
const adoptionNeeded = changes => changes.some(change => change.before !== null && change.after !== null && change.fields.some(field => ['version', 'sources', 'definition', 'limits'].includes(field)))

export function guidanceSnapshot(config) {
  const records = []
  const add = (type, definition, applicability, limits, sources = []) => {
    records.push({ id: `${type}:${definition.id}`, type, label: definition.label || definition.title || definition.id, version: definition.version || DEFINITION_VERSION, reviewedOn: REVIEW_DATE, sources: [...new Set(sources.filter(Boolean))], applicability, limits, definition: clone(definition) })
  }
  const stages = new Set(config.workflow.enabledStages)
  const recipe = CATALOG.recipes.find(item => item.id === config.workflow.recipe)
  if (recipe) add('recipe', recipe, `Selected workflow: ${recipe.label}.`, 'A local recipe describes intended work. It does not record execution or approval.')
  for (const definition of CATALOG.stages.filter(item => stages.has(item.id))) add('stage', definition, 'Included in the recorded workflow.', 'Inputs, checks and outputs describe the intended step, not completed work.')
  const usedSkills = new Set([...config.skills, ...[...stages].flatMap(id => config.workflow.bindings[id]?.skills || [])])
  for (const definition of CATALOG.skills.filter(item => usedSkills.has(item.id))) add('skill', definition, 'Selected directly or assigned to an included workflow step.', 'The source supports the portable skill format. The procedure still needs review and an actual task exercise.', [SOURCES.skills, SOURCES.copilotSkills])
  const assignedRoles = new Set([...stages].filter(id => config.workflow.bindings[id]?.actorType === 'agent').map(id => config.workflow.bindings[id].actorId))
  const selectedRoles = new Set([...config.agents.map(agent => agent.role), ...assignedRoles])
  for (const definition of CATALOG.roles.filter(item => selectedRoles.has(item.id))) add('role', definition, assignedRoles.has(definition.id) ? 'Assigned to an included step as an agent role.' : 'Retained as a selected profile, with no included stage assignment.', 'Requested tools describe instructions. The host must provide actual access.', [SOURCES.agents])
  for (const definition of CATALOG.practices.filter(item => config.practices.includes(item.id))) {
    const applicability = definition.id === 'minimum-change' ? (stages.has('implementation') || stages.has('bug-fix') ? 'Relevant to the included implementation or repair.' : 'Selected reference. Review whether a later implementation needs it.') : definition.id === 'specification-first' ? (stages.has('requirements') && stages.has('implementation') ? 'Connects the included requirement and implementation steps.' : 'Selected reference. The active workflow may cover only part of this pattern.') : definition.application
    add('practice', definition, applicability, definition.limits, [definition.source])
  }
  const technologies = new Set(config.components.flatMap(component => component.technologies.map(item => item.id)))
  const profiles = CATALOG.technologyProfiles.filter(item => item.id === 'generic' || item.technologies.some(id => technologies.has(id)))
  for (const definition of profiles.filter(Boolean)) add('technology', definition, definition.id === 'generic' ? 'Generic questions for technologies without a selected specialist profile.' : `Questions for selected technologies: ${definition.technologies.filter(id => technologies.has(id)).join(', ')}.`, definition.limits, [definition.source, ...(definition.sources || [])])
  const host = CATALOG.hosts.find(item => item.id === config.project.host)
  if (host) add('host', host, `Intended Copilot environment: ${host.label}. Blueprints remain human handoffs.`, 'Documented format is separate from discovery in the installed host and useful task behavior.', [host.source, SOURCES.copilotSkills])
  if (config.runtime.enabled) for (const definition of CATALOG.runtimeControls.filter(item => config.runtime.controls.some(control => control.id === item.id))) add('runtime', definition, 'Selected requirement in the runtime design.', 'A recorded requirement does not provide runtime enforcement or passing evidence.')
  return { snapshotVersion: '1.0', catalogVersion: DEFINITION_VERSION, reviewedOn: REVIEW_DATE, environment: config.project.host, records }
}

function suppliedManifest(files) {
  const records = Array.isArray(files) ? files.filter(file => text(file?.path) && file.path.toLowerCase() === 'manifest.json') : []
  if (!records.length) return { manifest: null, warning: 'No guidance metadata was supplied. Definition history is unknown.' }
  if (records.length !== 1 || !text(records[0].content) || new TextEncoder().encode(records[0].content).length > MAX_BYTES) return { manifest: null, warning: 'Supplied guidance metadata is ambiguous or exceeds the read limit. Definition history is unknown.' }
  try {
    const manifest = JSON.parse(records[0].content)
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error()
    return { manifest, warning: '' }
  } catch { return { manifest: null, warning: 'Supplied guidance metadata could not be read. Definition history is unknown.' } }
}

function boundedDefinition(value) {
  const queue = [{ value, depth: 0 }]
  let visited = 0
  while (queue.length) {
    const item = queue.pop()
    if (++visited > 50000 || item.depth > 20) return false
    if (item.value && typeof item.value === 'object') for (const child of Object.values(item.value)) queue.push({ value: child, depth: item.depth + 1 })
  }
  return true
}

function validSnapshot(snapshot) {
  if (!snapshot || snapshot.snapshotVersion !== '1.0' || !text(snapshot.catalogVersion) || !text(snapshot.reviewedOn) || !text(snapshot.environment) || !Array.isArray(snapshot.records) || snapshot.records.length > 250) return false
  const ids = new Set()
  for (const record of snapshot.records) {
    if (!record || !text(record.id) || ids.has(record.id) || !groups.includes(record.type) || !text(record.label) || !text(record.version) || !text(record.reviewedOn) || !Array.isArray(record.sources) || record.sources.some(source => !text(source)) || !text(record.applicability) || !text(record.limits) || !record.definition || typeof record.definition !== 'object' || Array.isArray(record.definition) || !boundedDefinition(record.definition)) return false
    ids.add(record.id)
  }
  return true
}

export function renderGuidanceDetails(snapshot) {
  const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]))
  if (!validSnapshot(snapshot)) return '<p class="muted">This file has no supported definition snapshot. Exact historical guidance contents are unknown.</p>'
  const sourceLink = source => {
    try {
      const url = new URL(source)
      if (url.protocol === 'https:' && !url.username && !url.password) return `<a href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">${escape(source)} ↗</a>`
    } catch {}
    return escape(source)
  }
  return `<details class="card"><summary>Guidance versions and scope (${snapshot.records.length})</summary><p>Supplied catalog ${escape(snapshot.catalogVersion)}. Recorded review ${escape(snapshot.reviewedOn)}. Intended environment ${escape(snapshot.environment || 'not chosen')}. These are metadata records, not a new source check or proof of compatibility.</p>${snapshot.records.map(record => `<article class="source-card"><h3>${escape(record.label)}</h3><p class="muted">${escape(record.type)}. Version ${escape(record.version)}. Recorded review ${escape(record.reviewedOn)}.</p><p>${escape(record.applicability)}</p><p>${escape(record.limits)}</p>${record.sources.length ? `<ul>${record.sources.map(source => `<li>${sourceLink(source)}</li>`).join('')}</ul>` : '<p class="muted">Local definition with no separate source reference.</p>'}</article>`).join('')}</details>`
}

export function reviewGuidance(config, files = []) {
  const current = guidanceSnapshot(config)
  const supplied = suppliedManifest(files)
  const manifest = supplied.manifest
  const warnings = supplied.warning ? [supplied.warning] : []
  const changes = []
  const add = (id, label, fields, before, after) => changes.push({ id, label, fields, before, after })
  if (!manifest) return { status: 'unknown', current, previous: null, changes, warnings, needsAdoption: false }
  if (manifest.kind === 'reviewed-file-set') warnings.push('This is a supplied reviewed file set. Its generation history is not independently established.')
  const previous = manifest.guidanceSnapshot
  if (validSnapshot(previous)) {
    const byId = new Map(previous.records.map(record => [record.id, record]))
    for (const record of current.records) {
      const before = byId.get(record.id)
      if (!before) add(record.id, record.label, ['selected definition added'], null, record)
      else {
        const fields = ['version', 'reviewedOn', 'sources', 'applicability', 'limits', 'definition'].filter(key => !same(before[key], record[key]))
        if (fields.length) add(record.id, record.label, fields, before, record)
      }
    }
    const activeIds = new Set(current.records.map(record => record.id))
    for (const before of previous.records.filter(record => !activeIds.has(record.id))) add(before.id, before.label, ['selected definition removed'], before, null)
    if (previous.environment !== current.environment) add('environment', 'Intended Copilot environment', ['environment'], previous.environment, current.environment)
    if (previous.catalogVersion !== current.catalogVersion) add('catalog', 'Catalog version', ['version'], previous.catalogVersion, current.catalogVersion)
    return { status: changes.length ? 'changed' : 'matching-records', current, previous: clone(previous), changes, warnings, needsAdoption: adoptionNeeded(changes) }
  }
  warnings.push(previous ? 'The supplied definition snapshot is unsupported or malformed. Exact definition comparison is unavailable.' : 'This pack did not record definition contents. Exact definition comparison is unavailable. An older review date alone does not make its guidance invalid.')
  const previousVersion = version(manifest.catalogVersion, version(manifest.templateVersion, 'Not recorded'))
  if (previousVersion !== 'Not recorded' && previousVersion !== current.catalogVersion) add('catalog', 'Catalog version', ['version'], previousVersion, current.catalogVersion)
  const oldEnvironment = manifest.target?.family === 'github-copilot' && text(manifest.target.environment) ? manifest.target.environment : null
  if (oldEnvironment && oldEnvironment !== current.environment) add('environment', 'Intended Copilot environment', ['environment'], oldEnvironment, current.environment)
  if (Array.isArray(manifest.practices)) for (const record of current.records.filter(record => record.type === 'practice')) {
    const old = manifest.practices.find(item => item?.id === record.definition.id)
    if (!old) continue
    const fields = []
    if (text(old.adaptationVersion) && old.adaptationVersion !== record.version) fields.push('version')
    if (text(old.source) && !record.sources.includes(old.source)) fields.push('sources')
    if (fields.length) add(record.id, record.label, fields, { version: old.adaptationVersion || 'Not recorded', sources: text(old.source) ? [old.source] : [] }, record)
  }
  return { status: changes.length ? 'changed' : 'comparison-incomplete', current, previous: null, changes, warnings, needsAdoption: adoptionNeeded(changes) }
}
