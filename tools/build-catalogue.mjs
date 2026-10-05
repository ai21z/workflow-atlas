import { readFile, readdir, writeFile, lstat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'

const repository = fileURLToPath(new URL('../', import.meta.url))
const schema = JSON.parse(await readFile(new URL('../catalogue/catalogue.schema.json', import.meta.url), 'utf8'))
const validateShape = new Ajv2020({ allErrors: true, strict: true }).compile(schema)
const groups = { stage: 'stages', skill: 'skills', role: 'roles', practice: 'practices', recipe: 'recipes', profile: 'technologyProfiles', control: 'runtimeControls', technology: 'technologies', host: 'hosts' }
const serialize = value => JSON.stringify(value, null, 2).replaceAll('<', '\\u003c').replaceAll('\u2028', '\\u2028').replaceAll('\u2029', '\\u2029')

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
  for (const topic of data.topics) {
    requireSources(topic.refs)
    if (topic.catalog.domains.some(id => !domains.has(id))) fail(`unknown domain in ${topic.id}`)
    for (const claim of topic.catalog.claims) {
      requireSources(claim.sourceRefs)
      if (!claim.sourceRefs.length || !topic.sections.some(section => section.label === claim.sectionLabel)) fail(`claim needs a source and an existing section: ${topic.id}`)
      if (claim.sourceRefs.some(id => !topic.refs.includes(id))) fail(`claim source must be visible in topic references: ${topic.id}`)
    }
    if (topic.catalog.sourceStatus === 'reviewed' && (!topic.catalog.reviewedOn || !topic.catalog.claims.length)) fail(`reviewed topic needs a date and scoped claims: ${topic.id}`)
  }
  const parents = new Map()
  for (const relation of data.relations) {
    requireRef(relation.from)
    requireRef(relation.to)
    requireSources(relation.sourceRefs)
    const fromTopic = relation.from.startsWith('topic:')
    const toTopic = relation.to.startsWith('topic:')
    if (['browse-under','related-reading','broader-concept','illustrates'].includes(relation.type) && !(fromTopic && toTopic)) fail(`reading relationship requires two topics: ${relation.from}`)
    if (relation.type === 'explained-by' && !(definitions.has(relation.from) && toTopic)) fail('explained-by must connect a definition to a topic')
    if (relation.type === 'uses-definition' && !(fromTopic && definitions.has(relation.to))) fail('uses-definition must connect a topic to a definition')
    if (relation.type === 'provides-capability' && !(relation.from.startsWith('technology:') && toTopic && topics.get(relation.to.slice(6))?.catalog.kind === 'capability' && relation.sourceRefs.length)) fail('provides-capability needs a technology, a capability topic and supporting sources')
    if (relation.from === relation.to) fail('self relationships are not supported')
    if (relation.type === 'browse-under') {
      if (parents.has(relation.from)) fail(`multiple browsing parents for ${relation.from}`)
      parents.set(relation.from, relation.to)
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
  }
  for (const cluster of data.navigation.clusters) if (parents.get(`topic:${cluster.id}`) !== 'topic:overview') fail(`cluster must be an overview child: ${cluster.id}`)
  for (const item of data.navigation.collections) {
    if (!item.nodeIds.length) fail(`empty guided path: ${item.id}`)
    item.nodeIds.forEach(id => requireRef(`topic:${id}`))
  }
  return data
}

export function compileCatalogue(data) {
  validateCatalogue(data)
  const sources = new Map(data.sources.map(item => [item.id, item]))
  const url = id => sources.get(id).url
  const definitions = Object.fromEntries(Object.values(groups).map(group => [group, []]))
  const definitionMetadata = {}
  for (const record of data.definitions) {
    const spec = structuredClone(record.spec)
    if (record.sourceRefs.length) {
      spec.source = url(record.sourceRefs[0])
      if (record.sourceRefs.length > 1) spec.sources = record.sourceRefs.slice(1).map(url)
    }
    definitions[groups[record.type]].push(spec)
    definitionMetadata[`${record.type}:${record.id}`] = { revision: record.revision, reviewedOn: record.reviewedOn || '', sourceRefs: [...record.sourceRefs] }
  }
  const nodes = data.manifest.topicOrder.map(id => {
    const node = structuredClone(data.topics.find(item => item.id === id))
    const links = data.relations.filter(item => item.from === `topic:${id}`)
    node.parent = links.find(item => item.type === 'browse-under')?.to.slice(6) || null
    node.related = links.filter(item => ['related-reading','broader-concept','illustrates'].includes(item.type)).map(item => item.to.slice(6))
    node.catalog.guidance = data.actions.some(action => action.topicId === id) ? 'selectable' : 'reading'
    node.catalog.definitionRefs = [...new Set([...links.filter(item => item.type === 'uses-definition').map(item => item.to), ...data.relations.filter(item => item.type === 'explained-by' && item.to === `topic:${id}`).map(item => item.from)])]
    return node
  })
  const atlas = { nodes, sources: Object.fromEntries(data.sources.map(item => [item.id, [item.title, item.url]])), catalog: { schemaVersion: data.manifest.schemaVersion, version: data.manifest.version, ...data.navigation, sources: data.sources, relations: data.relations } }
  const catalog = { schemaVersion: data.manifest.projectSchemaVersion, version: data.manifest.version, reviewedOn: data.manifest.reviewedOn, ...definitions, factStatuses: data.manifest.factStatuses, evidenceStatuses: data.manifest.evidenceStatuses, controlStatuses: data.manifest.controlStatuses, practiceActions: data.actions, definitionMetadata }
  const factory = `// Compiled from catalogue/. Edit source records and run npm run build:catalogue.\nexport const SCHEMA_VERSION = ${JSON.stringify(data.manifest.projectSchemaVersion)};\nexport const DEFINITION_VERSION = ${JSON.stringify(data.manifest.version)};\nexport const REVIEW_DATE = ${JSON.stringify(data.manifest.reviewedOn)};\nexport const SOURCES = Object.freeze(${serialize(Object.fromEntries(Object.entries(data.manifest.sourceAliases).map(([key, id]) => [key, url(id)])))});\nexport const TOOL_ALIASES = Object.freeze(${serialize(data.manifest.toolAliases)});\nfunction deepFreeze(value) { if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); } return value; }\nexport const CATALOG = deepFreeze(${serialize(catalog)});\n`
  return { files: { 'atlas/data.js': `// Compiled from catalogue/. Edit source records and run npm run build:catalogue.\nwindow.TOPIC_DATA = ${serialize(atlas)};\n`, 'factory/catalog.mjs': factory }, atlas, catalog }
}

export async function buildCatalogue({ rootDir = repository, check = false } = {}) {
  const data = await readCatalogue(rootDir)
  const compiled = compileCatalogue(data)
  for (const [name, content] of Object.entries(compiled.files)) {
    const destination = path.join(rootDir, name)
    if (check) {
      if (await readFile(destination, 'utf8').catch(() => '') !== content) throw new Error(`Generated catalogue is stale: ${name}. Run npm run build:catalogue.`)
    } else await writeFile(destination, content)
  }
  return { topics: data.topics.length, definitions: data.definitions.length, sources: data.sources.length, version: data.manifest.version }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: node tools/build-catalogue.mjs [--check]')
    const result = await buildCatalogue({ check: process.argv.includes('--check') })
    console.log(`Catalogue ${result.version}: ${result.topics} topics, ${result.definitions} definitions, ${result.sources} sources. ${process.argv.includes('--check') ? 'Published projections match.' : 'Published projections updated.'}`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
