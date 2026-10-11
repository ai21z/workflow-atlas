import { readFile, readdir, writeFile, lstat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { buildAtlasLayout } from './atlas-layout.mjs'

const repository = fileURLToPath(new URL('../', import.meta.url))
const schema = JSON.parse(await readFile(new URL('../catalogue/catalogue.schema.json', import.meta.url), 'utf8'))
const validateShape = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
const groups = { stage: 'stages', skill: 'skills', role: 'roles', practice: 'practices', recipe: 'recipes', profile: 'technologyProfiles', control: 'runtimeControls', technology: 'technologies', host: 'hosts' }
const serialize = value => JSON.stringify(value, null, 2).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')

// A reviewed record older than this many days is reported by the check. The number is never written into a projection.
export const REVIEW_CYCLE_DAYS = 180

// Authors write one direction. The build generates the inverse with derived: true. A type that maps to itself is symmetric.
const forwardInverses = {
  'browse-under': 'browses', 'related-reading': 'related-reading', 'broader-concept': 'narrower-concept', 'explained-by': 'explains', 'uses-definition': 'used-by',
  'provides-capability': 'capability-of', illustrates: 'illustrated-by', 'applies-to': 'applied-by', requires: 'required-by', 'evidenced-by': 'evidence-for',
  'example-of': 'has-example', 'works-with': 'works-with', 'depends-on': 'depended-on-by', 'default-skill': 'default-skill-of', 'performed-by': 'performs', 'part-of': 'has-part',
}
export const INVERSES = Object.freeze(Object.fromEntries(Object.entries(forwardInverses).flatMap(([type, inverse]) => [[type, inverse], [inverse, type]])))

// These edge types are generated from specs and the applies block. They are rejected in relations.json.
export const DERIVED_TYPES = Object.freeze(['applies-to', 'depends-on', 'default-skill', 'performed-by', 'part-of'])

export async function readCatalogue(rootDir = repository) {
  const base = path.join(rootDir, 'catalogue')
  const json = async name => JSON.parse(await readFile(path.join(base, name), 'utf8'))
  const names = (await readdir(path.join(base, 'knowledge'))).sort()
  if (names.some(name => !/^[a-z][a-z0-9-]*\.json$/.test(name))) throw new Error('Knowledge filenames must be stable topic IDs followed by .json.')
  for (const name of names) if (!(await lstat(path.join(base, 'knowledge', name))).isFile()) throw new Error('Knowledge records must be regular files.')
  const [manifest, topics, definitions, sources, actions, navigation, relations] = await Promise.all([
    json('manifest.json'), Promise.all(names.map(name => json(`knowledge/${name}`))), json('definitions.json'), json('sources.json'), json('actions.json'), json('navigation.json'), json('relations.json')
  ])
  topics.forEach((topic, i) => { if (`${topic.id}.json` !== names[i]) throw new Error(`Knowledge filename does not match its ID: ${names[i]}`) })
  return { manifest, topics, definitions, sources, actions, navigation, relations }
}

export function validateCatalogue(data) {
  if (!validateShape(data)) throw new Error('Catalogue shape is invalid: ' + validateShape.errors.slice(0, 12).map(error => `${error.instancePath || '/'} ${error.message}`).join('. '))
  const fail = message => { throw new Error(`Catalogue references are invalid: ${message}`) }
  const unique = (values, name) => { if (new Set(values).size !== values.length) fail(`duplicate ${name}`) }
  unique(data.topics.map(item => item.id), 'topic ID')
  unique(data.sources.map(item => item.id), 'source ID')
  unique(data.definitions.map(item => `${item.type}:${item.id}`), 'definition ID')
  unique(data.navigation.domains.map(item => item.id), 'domain ID')
  unique(data.navigation.clusters.map(item => item.id), 'cluster ID')
  unique(data.navigation.collections.map(item => item.id), 'collection ID')
  unique((data.navigation.subjects || []).map(item => item.id), 'subject ID')
  unique(data.actions.map(item => item.topicId), 'action topic')
  unique(data.relations.map(item => `${item.from}/${item.type}/${item.to}`), 'relationship')
  const topics = new Map(data.topics.map(item => [item.id, item]))
  const sources = new Map(data.sources.map(item => [item.id, item]))
  const definitions = new Map(data.definitions.map(item => [`${item.type}:${item.id}`, item]))
  const registry = new Set([...topics.keys()].map(id => `topic:${id}`).concat([...sources.keys()].map(id => `source:${id}`), [...definitions.keys()]))
  const domains = new Set(data.navigation.domains.map(item => item.id))
  const requireRef = ref => { if (!registry.has(ref)) fail(`unknown reference ${ref}`) }
  const requireSources = refs => refs.forEach(id => requireRef(`source:${id}`))
  if (data.manifest.topicOrder.length !== topics.size || data.manifest.topicOrder.some(id => !topics.has(id))) fail('topic order must contain every topic exactly once')
  if (!topics.has('overview')) fail('missing overview topic')
  Object.values(data.manifest.sourceAliases).forEach(id => requireRef(`source:${id}`))
  for (const source of data.sources) {
    const url = new URL(source.url)
    if (url.protocol !== 'https:' || url.username || url.password) fail(`unsafe source URL ${source.id}`)
    if (source.status === 'reviewed' && !source.reviewedOn) fail(`reviewed source needs a review date: ${source.id}`)
  }
  const appliesTypes = { stages: 'stage', recipes: 'recipe', technologies: 'technology', hosts: 'host' }
  for (const topic of data.topics) {
    requireSources(topic.refs)
    if (topic.catalog.domains.some(id => !domains.has(id))) fail(`unknown domain in ${topic.id}`)
    for (const claim of topic.catalog.claims) {
      requireSources(claim.sourceRefs)
      if (!claim.sourceRefs.length || !topic.sections.some(section => section.label === claim.sectionLabel)) fail(`claim needs a source and an existing section: ${topic.id}`)
      if (claim.sourceRefs.some(id => !topic.refs.includes(id))) fail(`claim source must be visible in topic references: ${topic.id}`)
    }
    if (topic.catalog.sourceStatus === 'reviewed' && (!topic.catalog.reviewedOn || !topic.catalog.claims.length)) fail(`reviewed topic needs a date and scoped claims: ${topic.id}`)
    for (const [key, type] of Object.entries(appliesTypes)) (topic.catalog.applies?.[key] || []).forEach(id => { if (!definitions.has(`${type}:${id}`)) fail(`applies names an unknown ${type} in ${topic.id}: ${id}`) })
  }
  const parents = new Map()
  const requiresEdges = new Map()
  for (const relation of data.relations) {
    requireRef(relation.from)
    requireRef(relation.to)
    requireSources(relation.sourceRefs)
    const fromTopic = relation.from.startsWith('topic:')
    const toTopic = relation.to.startsWith('topic:')
    const fromSource = relation.from.startsWith('source:')
    const toSource = relation.to.startsWith('source:')
    if (DERIVED_TYPES.includes(relation.type)) fail(`${relation.type} is generated by the build and cannot be authored: ${relation.from}`)
    if (['browse-under', 'related-reading', 'broader-concept', 'illustrates'].includes(relation.type) && !(fromTopic && toTopic)) fail(`reading relationship requires two topics: ${relation.from}`)
    if (relation.type === 'explained-by' && !(definitions.has(relation.from) && toTopic)) fail('explained-by must connect a definition to a topic')
    if (relation.type === 'uses-definition' && !(fromTopic && definitions.has(relation.to))) fail('uses-definition must connect a topic to a definition')
    if (relation.type === 'provides-capability' && !(relation.from.startsWith('technology:') && toTopic && topics.get(relation.to.slice(6))?.catalog.kind === 'capability' && relation.sourceRefs.length)) fail('provides-capability needs a technology, a capability topic and supporting sources')
    if (relation.type === 'requires') {
      if (fromSource || toSource) fail(`requires cannot involve a source: ${relation.from}`)
      if (!requiresEdges.has(relation.from)) requiresEdges.set(relation.from, [])
      requiresEdges.get(relation.from).push(relation.to)
    }
    if (relation.type === 'evidenced-by' && (fromSource || !toSource)) fail(`evidenced-by must point from a topic or definition to a source: ${relation.from}`)
    if (relation.type === 'example-of') {
      if (!(fromTopic && toTopic)) fail(`example-of requires two topics: ${relation.from}`)
      if (topics.get(relation.from.slice(6)).catalog.scope?.generality !== 'example') fail(`example-of needs a topic labeled as an example: ${relation.from}`)
    }
    if (relation.type === 'works-with' && !(relation.from.startsWith('technology:') && relation.to.startsWith('technology:') && relation.sourceRefs.length)) fail(`works-with needs two technologies and a source: ${relation.from}`)
    if (relation.status === 'reviewed' && !relation.reviewedOn) fail(`reviewed relationship needs a review date: ${relation.from} ${relation.type} ${relation.to}`)
    if (relation.from === relation.to) fail('self relationships are not supported')
    if (relation.type === 'browse-under') {
      if (parents.has(relation.from)) fail(`multiple browsing parents for ${relation.from}`)
      parents.set(relation.from, relation.to)
    }
  }
  for (const start of requiresEdges.keys()) {
    const stack = [[start, new Set()]]
    while (stack.length) {
      const [node, seen] = stack.pop()
      for (const next of requiresEdges.get(node) || []) {
        if (next === start) fail(`requires cycle at ${start}`)
        if (!seen.has(next)) stack.push([next, new Set([...seen, next])])
      }
    }
  }
  if (parents.has('topic:overview')) fail('overview must remain the browsing root')
  for (const topic of data.topics) {
    const visited = new Set()
    let current = `topic:${topic.id}`
    while (current !== 'topic:overview') {
      if (visited.has(current)) fail(`cyclic browsing hierarchy at ${current}`)
      visited.add(current)
      current = parents.get(current)
      if (!current) fail(`topic ${topic.id} is disconnected from overview`)
    }
  }
  for (const item of data.definitions) {
    if (item.id !== item.spec.id) fail(`definition ID mismatch: ${item.type}:${item.id}`)
    requireSources(item.sourceRefs)
    const spec = item.spec
    if (item.type === 'stage') {
      spec.dependsOn.forEach(id => requireRef(`stage:${id}`))
      spec.defaultSkills.forEach(id => requireRef(`skill:${id}`))
      requireRef(`topic:${spec.atlasTopic}`)
      if (spec.defaultActor.actorType === 'agent') requireRef(`role:${spec.defaultActor.actorId}`)
      if (spec.capabilities.some(id => !data.manifest.toolAliases.includes(id))) fail(`unknown tool alias in ${item.id}`)
      if (!data.relations.some(link => link.type === 'explained-by' && link.from === `stage:${item.id}` && link.to === `topic:${spec.atlasTopic}`)) fail(`stage reading mapping is inconsistent: ${item.id}`)
    }
    if (item.type === 'role' && spec.defaultTools.some(id => !data.manifest.toolAliases.includes(id))) fail(`unknown role tool alias: ${item.id}`)
    if (item.type === 'recipe') {
      spec.stageIds.forEach(id => requireRef(`stage:${id}`))
      unique(spec.questions.map(item => item.id), `question in ${item.id}`)
    }
    if (item.type === 'profile') spec.technologies.forEach(id => requireRef(`technology:${id}`))
  }
  for (const action of data.actions) {
    requireRef(`topic:${action.topicId}`)
    if (Boolean(action.practiceId) === Boolean(action.runtimeControlId)) fail(`action needs exactly one target: ${action.topicId}`)
    const ref = action.practiceId ? `practice:${action.practiceId}` : `control:${action.runtimeControlId}`
    requireRef(ref)
    if (!data.relations.some(link => link.type === 'uses-definition' && link.from === `topic:${action.topicId}` && link.to === ref)) fail(`action needs an explicit definition link: ${action.topicId}`)
    ;(action.conditions?.technology?.in || []).forEach(id => requireRef(`technology:${id}`))
  }
  for (const cluster of data.navigation.clusters) if (parents.get(`topic:${cluster.id}`) !== 'topic:overview') fail(`cluster must be an overview child: ${cluster.id}`)
  const clusterIds = new Set(data.navigation.clusters.map(item => item.id))
  for (const subject of data.navigation.subjects || []) {
    for (const id of subject.nodeIds) {
      requireRef(`topic:${id}`)
      if (id === 'overview' || clusterIds.has(id)) fail(`subject must name a reading topic, not the overview or a map cluster: ${subject.id}/${id}`)
    }
  }
  for (const item of data.navigation.collections) {
    if (!item.nodeIds.length) fail(`empty guided path: ${item.id}`)
    item.nodeIds.forEach(id => requireRef(`topic:${id}`))
  }
  return data
}

// The full graph: authored relations, edges generated from specs and the applies block, claim evidence, and one inverse per edge.
export function graphEdges(data) {
  const edges = []
  const seen = new Set()
  const add = edge => {
    const key = `${edge.from}/${edge.type}/${edge.to}`
    if (seen.has(key)) return
    seen.add(key)
    edges.push(edge)
  }
  for (const relation of data.relations) add({ ...relation, derived: false })
  for (const record of data.definitions) {
    const ref = `${record.type}:${record.id}`
    const spec = record.spec
    if (record.type === 'stage') {
      spec.dependsOn.forEach(id => add({ from: ref, type: 'depends-on', to: `stage:${id}`, sourceRefs: [], derived: true }))
      spec.defaultSkills.forEach(id => add({ from: ref, type: 'default-skill', to: `skill:${id}`, sourceRefs: [], derived: true }))
      if (spec.defaultActor.actorType === 'agent') add({ from: ref, type: 'performed-by', to: `role:${spec.defaultActor.actorId}`, sourceRefs: [], derived: true })
    }
    if (record.type === 'recipe') spec.stageIds.forEach(id => add({ from: `stage:${id}`, type: 'part-of', to: ref, sourceRefs: [], derived: true }))
  }
  const appliesTypes = { stages: 'stage', recipes: 'recipe', technologies: 'technology', hosts: 'host' }
  for (const topic of data.topics) {
    for (const [key, type] of Object.entries(appliesTypes)) (topic.catalog.applies?.[key] || []).forEach(id => add({ from: `topic:${topic.id}`, type: 'applies-to', to: `${type}:${id}`, sourceRefs: [], derived: true }))
    topic.catalog.claims.forEach((claim, index) => claim.sourceRefs.forEach(id => add({ from: `claim:${topic.id}-${index + 1}`, type: 'evidenced-by', to: `source:${id}`, sourceRefs: [...claim.sourceRefs], derived: true })))
  }
  for (const edge of [...edges]) {
    const inverse = INVERSES[edge.type]
    if (!inverse) continue
    add({ from: edge.to, type: inverse, to: edge.from, sourceRefs: [...edge.sourceRefs], derived: true })
  }
  return edges
}

export function compileCatalogue(data) {
  validateCatalogue(data)
  const sources = new Map(data.sources.map(item => [item.id, item]))
  const url = id => sources.get(id).url
  const definitions = Object.fromEntries(Object.values(groups).map(group => [group, []]))
  const definitionMetadata = {}
  const explainedBy = new Map(data.relations.filter(item => item.type === 'explained-by').map(item => [item.from, item.to.slice(6)]))
  const definitionRecords = []
  for (const record of data.definitions) {
    const spec = structuredClone(record.spec)
    if (record.sourceRefs.length) {
      spec.source = url(record.sourceRefs[0])
      if (record.sourceRefs.length > 1) spec.sources = record.sourceRefs.slice(1).map(url)
    }
    definitions[groups[record.type]].push(spec)
    const ref = `${record.type}:${record.id}`
    const extra = Object.fromEntries(['basis', 'confidenceLevel', 'category'].filter(key => record[key] !== undefined).map(key => [key, record[key]]))
    definitionMetadata[ref] = { revision: record.revision, reviewedOn: record.reviewedOn || '', sourceRefs: [...record.sourceRefs], ...extra }
    definitionRecords.push({ ref, type: record.type, id: record.id, label: record.spec.label || record.spec.title || record.id, summary: record.spec.description || record.spec.purpose || '', explainedBy: explainedBy.get(ref) || null, revision: record.revision, reviewedOn: record.reviewedOn || '', sourceRefs: [...record.sourceRefs], ...extra })
  }
  const nodes = data.manifest.topicOrder.map(id => {
    const node = structuredClone(data.topics.find(item => item.id === id))
    const links = data.relations.filter(item => item.from === `topic:${id}`)
    node.parent = links.find(item => item.type === 'browse-under')?.to.slice(6) || null
    node.related = links.filter(item => ['related-reading', 'broader-concept', 'illustrates'].includes(item.type)).map(item => item.to.slice(6))
    node.catalog.guidance = data.actions.some(action => action.topicId === id) ? 'selectable' : 'reading'
    node.catalog.definitionRefs = [...new Set([...links.filter(item => item.type === 'uses-definition').map(item => item.to), ...data.relations.filter(item => item.type === 'explained-by' && item.to === `topic:${id}`).map(item => item.from)])]
    node.catalog.claims = node.catalog.claims.map((claim, index) => ({ id: `claim:${id}-${index + 1}`, ...claim }))
    return node
  })
  const children = new Map()
  for (const relation of data.relations) if (relation.type === 'browse-under') { const parent = relation.to.slice(6); if (!children.has(parent)) children.set(parent, []); children.get(parent).push(relation.from.slice(6)) }
  const descendants = id => (children.get(id) || []).flatMap(child => [child, ...descendants(child)])
  const clusterDigests = data.navigation.clusters.map(cluster => {
    const topic = data.topics.find(item => item.id === cluster.id)
    const topicIds = descendants(cluster.id).sort()
    return { id: cluster.id, short: cluster.short, title: topic.title, summary: topic.summary, topicCount: topicIds.length, topicIds }
  })
  const claims = nodes.flatMap(node => node.catalog.claims.map(claim => ({ ...claim, topicId: node.id })))
  const edges = graphEdges(data)
  const layout2d = buildAtlasLayout({ nodes, clusters: data.navigation.clusters, definitions: definitionRecords, edges })
  const atlas = {
    nodes,
    sources: Object.fromEntries(data.sources.map(item => [item.id, [item.title, item.url]])),
    catalog: { schemaVersion: data.manifest.schemaVersion, version: data.manifest.version, reviewCycleDays: REVIEW_CYCLE_DAYS, ...data.navigation, sources: data.sources, relations: data.relations, edges, claims, definitions: definitionRecords, clusterDigests, layout2d },
  }
  const catalog = { schemaVersion: data.manifest.projectSchemaVersion, version: data.manifest.version, reviewedOn: data.manifest.reviewedOn, ...definitions, factStatuses: data.manifest.factStatuses, evidenceStatuses: data.manifest.evidenceStatuses, controlStatuses: data.manifest.controlStatuses, practiceActions: data.actions, definitionMetadata }
  const factory = `// Compiled from catalogue/. Edit source records and run npm run build:catalogue.\nexport const SCHEMA_VERSION = ${JSON.stringify(data.manifest.projectSchemaVersion)};\nexport const DEFINITION_VERSION = ${JSON.stringify(data.manifest.version)};\nexport const REVIEW_DATE = ${JSON.stringify(data.manifest.reviewedOn)};\nexport const SOURCES = Object.freeze(${serialize(Object.fromEntries(Object.entries(data.manifest.sourceAliases).map(([key, id]) => [key, url(id)])))});\nexport const TOOL_ALIASES = Object.freeze(${serialize(data.manifest.toolAliases)});\nfunction deepFreeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }\nexport const CATALOG = deepFreeze(${serialize(catalog)});\n`
  return { files: { 'atlas/data.js': `// Compiled from catalogue/. Edit source records and run npm run build:catalogue.\nwindow.TOPIC_DATA = ${serialize(atlas)};\n`, 'factory/catalog.mjs': factory }, atlas, catalog }
}

// Reviewed records whose date is older than the review cycle. Computed at build time only, never stored in a projection.
export function staleReviews(data, today = new Date()) {
  const limit = today.getTime() - REVIEW_CYCLE_DAYS * 86_400_000
  const old = reviewedOn => reviewedOn && Date.parse(reviewedOn) < limit
  return [
    ...data.topics.filter(item => item.catalog.sourceStatus === 'reviewed' && old(item.catalog.reviewedOn)).map(item => `topic:${item.id}`),
    ...data.sources.filter(item => item.status === 'reviewed' && old(item.reviewedOn)).map(item => `source:${item.id}`),
    ...data.definitions.filter(item => old(item.reviewedOn)).map(item => `${item.type}:${item.id}`),
    ...data.relations.filter(item => item.status === 'reviewed' && old(item.reviewedOn)).map(item => `${item.from} ${item.type} ${item.to}`),
  ]
}

// Structural coverage of the eight stack slots named in catalogue/coverage.json. A report for the maintainer, never a projection.
export function coverageReport(data, coverage) {
  if (!coverage || !Array.isArray(coverage.slots)) throw new Error('coverage.json needs a slots array')
  const topics = new Set(data.topics.map(item => item.id))
  const names = new Map(data.definitions.filter(item => item.type === 'technology' || item.type === 'host').map(item => [`${item.type}:${item.id}`, item]))
  const profiled = new Set(data.definitions.filter(item => item.type === 'profile').flatMap(item => item.spec.technologies))
  const explained = new Set(data.relations.filter(item => item.type === 'explained-by').map(item => item.from))
  const used = new Set(data.relations.filter(item => item.type === 'uses-definition').map(item => item.to))
  const applied = new Set(data.topics.flatMap(topic => [...(topic.catalog.applies?.technologies || []).map(id => `technology:${id}`), ...(topic.catalog.applies?.hosts || []).map(id => `host:${id}`)]))
  return coverage.slots.map(slot => {
    if (!slot.id || !slot.title || !Array.isArray(slot.wanted)) throw new Error(`coverage slot needs id, title and wanted: ${JSON.stringify(slot)}`)
    const items = slot.wanted.map(entry => {
      const { id, type = 'technology' } = typeof entry === 'string' ? { id: entry } : entry
      const ref = `${type}:${id}`
      const named = names.has(ref)
      const topic = topics.has(id) || explained.has(ref) || used.has(ref) || applied.has(ref)
      const profile = type === 'technology' && profiled.has(id)
      const status = named && topic && (profile || type === 'host') ? 'covered' : named && topic ? 'thin' : named ? 'named only' : topic ? 'topic only' : 'missing'
      return { id, type, status }
    })
    return { id: slot.id, title: slot.title, items }
  })
}

export async function buildCatalogue({ rootDir = repository, check = false } = {}) {
  const data = await readCatalogue(rootDir)
  const compiled = compileCatalogue(data)
  const coverage = coverageReport(data, JSON.parse(await readFile(path.join(rootDir, 'catalogue', 'coverage.json'), 'utf8').catch(() => '{"slots":[]}')))
  for (const [name, content] of Object.entries(compiled.files)) {
    const destination = path.join(rootDir, name)
    if (check) {
      if (await readFile(destination, 'utf8').catch(() => '') !== content) throw new Error(`Generated catalogue is stale: ${name}. Run npm run build:catalogue.`)
    } else await writeFile(destination, content)
  }
  return { topics: data.topics.length, definitions: data.definitions.length, sources: data.sources.length, edges: compiled.atlas.catalog.edges.length, version: data.manifest.version, staleReviews: staleReviews(data), coverage }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: node tools/build-catalogue.mjs [--check]')
    const result = await buildCatalogue({ check: process.argv.includes('--check') })
    console.log(`Catalogue ${result.version}: ${result.topics} topics, ${result.definitions} definitions, ${result.sources} sources, ${result.edges} graph edges. ${process.argv.includes('--check') ? 'Published projections match.' : 'Published projections updated.'}`)
    if (result.staleReviews.length) console.log(`${result.staleReviews.length} reviewed records are older than ${REVIEW_CYCLE_DAYS} days: ${result.staleReviews.join(', ')}`)
    for (const slot of result.coverage) {
      const by = status => slot.items.filter(item => item.status === status).map(item => item.id)
      console.log(`Coverage, ${slot.title}: covered ${by('covered').join(', ') || 'none'}. Thin ${by('thin').join(', ') || 'none'}. Named only ${by('named only').join(', ') || 'none'}. Topic only ${by('topic only').join(', ') || 'none'}. Missing ${by('missing').join(', ') || 'none'}.`)
    }
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
