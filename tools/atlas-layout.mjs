// Geometry for the reading map only. Layout never changes catalogue records or their relationships.
const WIDTH = 2300
const HEIGHT = 1900
const CENTER = { x: WIDTH / 2, y: 800 }
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0
const finite = value => typeof value === 'number' && Number.isFinite(value)
const hash = text => [...text].reduce((value, char) => Math.imul(value ^ char.charCodeAt(0), 16777619) >>> 0, 2166136261)
const rounded = value => Math.round(value * 100) / 100
const familyOf = type => ['browse-under', 'browses', 'part-of', 'has-part'].includes(type) ? 'structure' : ['applies-to', 'applied-by', 'requires', 'required-by'].includes(type) ? 'applies' : 'reading'

export function buildAtlasLayout({ nodes = [], clusters = [], definitions = [], edges = [] } = {}) {
  for (const [name, values] of Object.entries({ nodes, clusters, definitions, edges })) if (!Array.isArray(values)) throw new TypeError(`Layout ${name} must be an array.`)
  const topics = new Map()
  for (const topic of nodes) {
    if (!topic || typeof topic.id !== 'string' || !topic.id || topics.has(topic.id)) throw new TypeError('Layout topics need unique nonempty IDs.')
    topics.set(topic.id, topic)
  }
  const homes = new Map()
  for (const cluster of [...clusters].sort((a, b) => compare(a?.id || '', b?.id || ''))) {
    if (!cluster || typeof cluster.id !== 'string' || !cluster.id || homes.has(cluster.id)) throw new TypeError('Layout clusters need unique nonempty IDs.')
    if (!topics.has(cluster.id) || !Array.isArray(cluster.position) || cluster.position.length < 2 || !cluster.position.every(finite)) throw new TypeError(`Layout cluster ${cluster.id} needs a topic and finite position.`)
    // Preserve left, right and vertical homes from the existing map. The original 3D positions remain untouched.
    const x = CENTER.x + cluster.position[0] * 8, y = CENTER.y - cluster.position[1] * 9
    if (!finite(x) || !finite(y) || x < 30 || x > WIDTH - 30 || y < 30 || y > HEIGHT - 30) throw new TypeError(`Layout cluster ${cluster.id} needs a position within the map bounds.`)
    homes.set(cluster.id, { id: cluster.id, label: cluster.short || topics.get(cluster.id).title || cluster.id, x, y, topicCount: 0 })
  }
  const clusterFor = id => {
    const seen = new Set()
    let current = id
    while (current && !seen.has(current)) {
      if (homes.has(current)) return current
      seen.add(current)
      current = topics.get(current)?.parent
    }
    return id === 'overview' ? 'overview' : 'factory'
  }
  const records = [...topics.values()].map(topic => ({ id: `topic:${topic.id}`, topicId: topic.id, clusterId: clusterFor(topic.id), kind: 'topic', label: topic.title || topic.id }))
  const definitionIds = new Set()
  for (const definition of definitions) {
    if (!definition || !['practice', 'technology'].includes(definition.type)) continue
    if (!definition.ref && (typeof definition.id !== 'string' || !definition.id)) throw new TypeError('Layout definitions need unique qualified IDs.')
    const ref = definition.ref || `${definition.type}:${definition.id}`
    if (typeof ref !== 'string' || !ref.startsWith(`${definition.type}:`) || !/^(practice|technology):[a-z][a-z0-9-]*$/.test(ref) || definitionIds.has(ref)) throw new TypeError('Layout definitions need unique qualified IDs.')
    definitionIds.add(ref)
    records.push({ id: ref, definitionRef: ref, clusterId: topics.has(definition.explainedBy) ? clusterFor(definition.explainedBy) : 'factory', kind: definition.type, label: definition.label || definition.id || ref })
  }
  records.sort((a, b) => compare(a.id, b.id))
  if (records.some(record => record.clusterId === 'factory')) homes.set('factory', { id: 'factory', label: 'Factory definitions', x: CENTER.x, y: 1600, topicCount: 0 })
  const registry = new Map(records.map(record => [record.id, record]))
  const renderEdges = new Map()
  const degree = new Map(records.map(record => [record.id, new Set()]))
  for (const edge of edges) {
    if (!edge || typeof edge.type !== 'string' || !registry.has(edge.from) || !registry.has(edge.to) || edge.from === edge.to) continue
    const [from, to] = [edge.from, edge.to].sort(compare)
    const family = familyOf(edge.type)
    const key = `${from}/${family}/${to}`
    if (!renderEdges.has(key)) renderEdges.set(key, { from, to, family, relations: new Map() })
    renderEdges.get(key).relations.set(`${edge.from}/${edge.type}/${edge.to}`, structuredClone(edge))
    degree.get(from).add(to)
    degree.get(to).add(from)
  }
  const links = [...renderEdges.values()].sort((a, b) => compare(`${a.from}/${a.family}/${a.to}`, `${b.from}/${b.family}/${b.to}`)).map(edge => ({ ...edge, relations: [...edge.relations.values()].sort((a, b) => compare(`${a.from}/${a.type}/${a.to}`, `${b.from}/${b.type}/${b.to}`)) }))
  const members = new Map()
  for (const record of records) {
    if (!members.has(record.clusterId)) members.set(record.clusterId, [])
    members.get(record.clusterId).push(record)
    if (record.kind === 'topic' && homes.has(record.clusterId) && record.topicId !== record.clusterId) homes.get(record.clusterId).topicCount++
  }
  for (const record of records) {
    record.radius = rounded(Math.min(14, 6 + Math.sqrt(degree.get(record.id).size) * 1.35))
    const home = homes.get(record.clusterId) || CENTER
    const fixed = record.topicId === 'overview' || homes.has(record.topicId)
    const index = members.get(record.clusterId).indexOf(record)
    const angle = index * Math.PI * (3 - Math.sqrt(5)) + hash(record.clusterId) / 4294967296 * Math.PI * 2
    const distance = fixed ? 0 : 55 + 29 * Math.sqrt(index + 1)
    record.x = home.x + Math.cos(angle) * distance
    record.y = home.y + Math.sin(angle) * distance
    record.fixed = fixed
  }
  // A stable radial pull and local repulsion, computed once during compilation, never in the browser.
  for (let pass = 0; pass < 100; pass++) {
    const movement = records.map(record => {
      const home = homes.get(record.clusterId) || CENTER
      return { x: (home.x - record.x) * 0.018, y: (home.y - record.y) * 0.018 }
    })
    for (let a = 0; a < records.length; a++) for (let b = a + 1; b < records.length; b++) {
      const left = records[a], right = records[b]
      const dx = right.x - left.x, dy = right.y - left.y
      const distance = Math.hypot(dx, dy) || 0.01
      const gap = left.radius + right.radius + 23
      const force = Math.min(12, 260 / (distance * distance) + Math.max(0, gap - distance) * 0.2)
      const x = dx / distance * force, y = dy / distance * force
      movement[a].x -= x; movement[a].y -= y
      movement[b].x += x; movement[b].y += y
    }
    records.forEach((record, index) => {
      if (record.fixed) return
      record.x += Math.max(-9, Math.min(9, movement[index].x))
      record.y += Math.max(-9, Math.min(9, movement[index].y))
      record.x = Math.max(30, Math.min(WIDTH - 30, record.x))
      record.y = Math.max(30, Math.min(HEIGHT - 30, record.y))
    })
  }
  // Final separation removes remaining glyph collisions while keeping recorded cluster membership.
  for (let pass = 0; pass < 24; pass++) {
    let collisions = 0
    for (let a = 0; a < records.length; a++) for (let b = a + 1; b < records.length; b++) {
      const left = records[a], right = records[b]
      const dx = right.x - left.x, dy = right.y - left.y
      const distance = Math.hypot(dx, dy) || 0.01
      const gap = left.radius + right.radius + 14
      if (distance >= gap || (left.fixed && right.fixed)) continue
      collisions++
      const shift = (gap - distance + 0.1) / (left.fixed || right.fixed ? 1 : 2)
      const x = dx / distance * shift, y = dy / distance * shift
      if (!left.fixed) { left.x -= x; left.y -= y }
      if (!right.fixed) { right.x += x; right.y += y }
    }
    if (!collisions) break
  }
  records.forEach(record => {
    record.x = Math.max(30, Math.min(WIDTH - 30, record.x))
    record.y = Math.max(30, Math.min(HEIGHT - 30, record.y))
  })
  const priority = records.slice().sort((a, b) => {
    const importance = record => (record.topicId === 'overview' ? 10000 : homes.has(record.topicId) ? 5000 : 0) + degree.get(record.id).size * 4 + (record.kind === 'practice' ? 2 : record.kind === 'topic' ? 1 : 0)
    return importance(b) - importance(a) || compare(a.id, b.id)
  })
  // Delay labels that intersect earlier labels. This is a prominence order, never a quality score.
  const ranked = [], delayed = []
  for (const record of priority) {
    const width = Math.min(260, 6.8 * String(record.label).length)
    const collides = ranked.some(other => Math.abs(record.x - other.x) < (width + other.width) / 2 + 10 && Math.abs(record.y - other.y) < 28)
    if (collides && !record.fixed) delayed.push(record)
    else ranked.push({ ...record, width })
  }
  const ranks = new Map([...ranked, ...delayed].map((record, index) => [record.id, index + 1]))
  return {
    version: 1, width: WIDTH, height: HEIGHT,
    nodes: records.map(({ label, fixed, ...record }) => ({ ...record, x: rounded(record.x), y: rounded(record.y), labelRank: ranks.get(record.id) })),
    clusters: [...homes.values()].sort((a, b) => compare(a.id, b.id)).map(home => ({ ...home, x: rounded(home.x), y: rounded(home.y) })),
    edges: links,
  }
}
