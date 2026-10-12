// Maintainer reporting only. None of this metadata enters the browser or inference.
export function coverageReport(data, coverage) {
  const fail = message => { throw new Error(`Invalid coverage metadata: ${message}`) }
  const keys = (record, allowed, where) => {
    if (!record || typeof record !== 'object' || Array.isArray(record) || Object.keys(record).some(key => !allowed.includes(key))) fail(where)
  }
  const text = value => typeof value === 'string' && value.trim().length > 0
  const idShape = value => typeof value === 'string' && /^[a-z][a-z0-9-]*$/.test(value)
  keys(coverage, ['note', 'slots', 'indirect', 'guidance'], 'unknown top level field')
  if (!Array.isArray(coverage.slots)) fail('slots must be an array')
  if (coverage.note !== undefined && !text(coverage.note)) fail('note must be text')
  for (const field of ['indirect', 'guidance']) if (coverage[field] !== undefined && !Array.isArray(coverage[field])) fail(`${field} must be an array`)
  const topics = new Map(data.topics.map(item => [item.id, item]))
  const sources = new Map(data.sources.map(item => [item.id, item]))
  const names = new Map(data.definitions.filter(item => ['technology', 'host'].includes(item.type)).map(item => [`${item.type}:${item.id}`, item]))
  const profiles = data.definitions.filter(item => item.type === 'profile')
  const indirect = new Map()
  for (const entry of coverage.indirect || []) {
    keys(entry, ['id', 'type', 'topicIds', 'note'], 'indirect record')
    const ref = `${entry.type || 'technology'}:${entry.id}`
    if (!idShape(entry.id) || !['technology', 'host'].includes(entry.type || 'technology') || !text(entry.note)) fail(`indirect record ${ref}`)
    if (indirect.has(ref)) fail(`duplicate indirect record ${ref}`)
    if (!Array.isArray(entry.topicIds) || !entry.topicIds.length || new Set(entry.topicIds).size !== entry.topicIds.length || entry.topicIds.some(id => !topics.has(id))) fail(`indirect topics ${ref}`)
    indirect.set(ref, entry)
  }
  const guidance = new Map()
  for (const entry of coverage.guidance || []) {
    keys(entry, ['topicId', 'task', 'procedureSection', 'outputSection', 'exampleSections', 'scope'], 'guidance record')
    const topic = topics.get(entry.topicId)
    if (!topic || guidance.has(entry.topicId)) fail(`unknown or duplicate guidance topic ${entry.topicId}`)
    if (![entry.task, entry.scope].every(text)) fail(`task and scope required for ${entry.topicId}`)
    const labels = new Set(topic.sections.map(section => section.label))
    if (![entry.procedureSection, entry.outputSection].every(label => text(label) && labels.has(label))) fail(`procedure or output section missing in ${entry.topicId}`)
    if (!Array.isArray(entry.exampleSections) || new Set(entry.exampleSections).size !== entry.exampleSections.length || entry.exampleSections.some(label => !labels.has(label))) fail(`example sections missing in ${entry.topicId}`)
    guidance.set(entry.topicId, entry)
  }
  const seenSlots = new Set()
  const wantedRefs = new Set()
  const report = coverage.slots.map(slot => {
    keys(slot, ['id', 'title', 'wanted'], 'slot record')
    if (!idShape(slot.id) || seenSlots.has(slot.id) || !text(slot.title) || !Array.isArray(slot.wanted)) fail(`slot ${slot.id}`)
    seenSlots.add(slot.id)
    const seenEntries = new Set()
    const items = slot.wanted.map(entry => {
      if (typeof entry !== 'string') keys(entry, ['id', 'type'], 'wanted record')
      const { id, type = 'technology' } = typeof entry === 'string' ? { id: entry } : entry
      const ref = `${type}:${id}`
      if (!idShape(id) || !['technology', 'host'].includes(type) || seenEntries.has(ref)) fail(`wanted record ${ref}`)
      seenEntries.add(ref)
      wantedRefs.add(ref)
      const links = data.relations.filter(link => (link.type === 'explained-by' && link.from === ref) || (link.type === 'uses-definition' && link.to === ref))
      const direct = new Set(links.map(link => (link.type === 'explained-by' ? link.to : link.from).slice(6)))
      if (topics.has(id)) direct.add(id)
      for (const topic of data.topics) if ((topic.catalog.applies?.[type === 'host' ? 'hosts' : 'technologies'] || []).includes(id)) direct.add(topic.id)
      const indirectEntry = indirect.get(ref)
      const topicIds = [...new Set([...direct, ...(indirectEntry?.topicIds || [])])].sort()
      const named = names.has(ref)
      const profileIds = type === 'technology' ? profiles.filter(profile => profile.spec.technologies.includes(id)).map(profile => profile.id) : []
      // Keep the old structural definition. Indirect reading is a separate dimension.
      const status = named && direct.size && (profileIds.length || type === 'host') ? 'covered' : named && direct.size ? 'thin' : named ? 'named only' : direct.size ? 'topic only' : 'missing'
      return {
        id, type, status,
        reading: { presence: direct.size ? 'linked' : indirectEntry ? 'indirect only' : 'none', topicIds, note: indirectEntry?.note || '' },
        taskGuidance: topicIds.filter(topicId => guidance.has(topicId)).map(topicId => ({ ...guidance.get(topicId) })),
        review: topicIds.map(topicId => {
          const topic = topics.get(topicId)
          return {
            topicId, status: topic.catalog.sourceStatus, reviewedOn: topic.catalog.reviewedOn, scopedClaims: topic.catalog.claims.length,
            scope: topic.sections.find(section => section.label === 'Review scope')?.text || (topic.catalog.sourceStatus === 'reviewed' ? 'Review covers the listed factual claims. It does not certify the whole article or project compatibility.' : 'No dated claim review is recorded. References and proposed procedures require their own review.'),
            sourceRevisions: topic.refs.map(id => ({ id, revision: sources.get(id)?.revision || '', status: sources.get(id)?.status || 'unknown' })),
          }
        }),
        factory: { profileIds, hostTarget: type === 'host' && named, limits: 'Questions and export targets only. No installation, execution, compatibility or successful use is established.' },
      }
    })
    return { id: slot.id, title: slot.title, items }
  })
  for (const ref of indirect.keys()) if (!wantedRefs.has(ref)) fail(`indirect record is not in a wanted slot: ${ref}`)
  return report
}

export function guidanceReport(data, coverage) {
  // Validate metadata even when called without the structural report.
  coverageReport(data, coverage)
  return (coverage.guidance || []).map(entry => {
    const topic = data.topics.find(topic => topic.id === entry.topicId)
    return { ...entry, reviewStatus: topic.catalog.sourceStatus, reviewedOn: topic.catalog.reviewedOn, scopedClaims: topic.catalog.claims.length }
  })
}
