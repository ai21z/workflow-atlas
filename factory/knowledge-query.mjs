// Query the knowledge graph without a dependency. The same module serves the browser, the command line and the tests.
// Input is the reader projection, the object written to atlas/data.js. Everything here is deterministic and explainable.
// Search is a lexical match on titles, aliases, applicability, summaries and section text. No stemming, so identifiers
// such as pytest or npm match as typed. A query token matches a record token by prefix. Nothing is sent anywhere.

const FIELD_WEIGHTS = { title: 6, aliases: 5, applicability: 3, summary: 2, body: 1 }
// Function words that never identify a topic. Kept short on purpose, an identifier is never on this list.
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'their', 'our', 'its', 'are', 'was', 'were', 'will', 'can', 'not', 'but', 'out', 'also', 'only', 'each', 'any', 'all', 'has', 'have', 'had', 'been', 'make', 'sure', 'before', 'after', 'when', 'then', 'than', 'what', 'which', 'who', 'how', 'why', 'where', 'there', 'here', 'they', 'them', 'you', 'use', 'used', 'using', 'one', 'two', 'per', 'via', 'about', 'over', 'under', 'between', 'while', 'should', 'would', 'could', 'may', 'might', 'must', 'does', 'did', 'doing', 'done', 'get', 'got', 'put', 'let', 'add', 'added', 'new', 'own', 'same', 'other', 'such', 'more', 'most', 'some', 'these', 'those', 'being', 'very', 'just', 'still', 'yet', 'ever', 'never', 'always', 'need', 'needs', 'want', 'wants'])
const BODY_TOKEN_CAP = 120
const SEED_WEIGHTS = { 'applied-by': 1, 'explained-by': 1, explains: 1, 'used-by': 0.8, 'has-example': 0.5, 'capability-of': 0.5, 'works-with': 0.3 }
const SHORT_IDENTIFIERS = new Set(['ci', 'cd', 'go', 'r', 'c#', 'c++', '.net'])
// Broad task words do not identify the subject of an exclusion or establish an example's environment.
const CONTEXT_WORDS = new Set(['source', 'sources', 'backed', 'project', 'projects', 'practice', 'example', 'boundary', 'review', 'process', 'workflow', 'workflows', 'create', 'run', 'check', 'checks', 'tool', 'tools', 'change', 'changes', 'instructions', 'code', 'agent', 'agents', 'skill', 'diagnosis', 'quality', 'data', 'study', 'implementation', 'verification', 'test', 'tests', 'pipeline', 'build'])
const NEGATION = /\b(?:do\s+not|does\s+not|did\s+not|must\s+not|should\s+not|will\s+not|would\s+not|cannot|can\s+not|don['’]t|doesn['’]t|isn['’]t|aren['’]t|never|avoid|without|no)\b/iu
const SHARED_OBJECT_VERBS = /\b(?:create|maintain|add|use|enable|select|include|install|configure)\s+(?:and|or)\s+(?:create|maintain|add|use|enable|select|include|install|configure)\b/giu

export function tokenize(text) {
  const seen = new Set()
  const tokens = []
  for (const token of String(text || '').toLowerCase().match(/\.net\b|[\p{L}\p{N}]+(?:\+\+|#)?/gu) || []) {
    if ((token.length < 3 && !SHORT_IDENTIFIERS.has(token)) || seen.has(token) || STOP_WORDS.has(token)) continue
    seen.add(token)
    tokens.push(token)
  }
  return tokens
}

// Only explicit exclusion clauses are recognized. This is an auditable lexical guard, not language understanding.
// Ordinary search deliberately does not use this guard, so a reader can still find a topic they ruled out.
export function analyzeBriefConstraints(brief = '') {
  const positive = []
  const exclusions = []
  let unresolvedNegation = false
  const clauses = String(brief || '').split(/[;,\n!?]+|\.(?=\s|$)|\s+(?:but|however|instead)\s+|\s+and\s+(?=(?:do\s+not|don['’]t|avoid|never|no)\b)/iu)
  for (const clause of clauses) {
    const match = NEGATION.exec(clause)
    if (!match) {
      if (/\bnot\b/iu.test(clause)) unresolvedNegation = true
      if (clause.trim()) positive.push(clause.trim())
      continue
    }
    const prefix = clause.slice(0, match.index).trim()
    const text = clause.slice(match.index + match[0].length).trim()
    if (prefix) positive.push(prefix)
    const terms = tokenize(text)
    exclusions.push({ text, terms, marker: match[0] })
    // "Do not create or maintain a wiki" has one explicitly excluded object. Other coordination can change
    // which words a negation governs, so withhold actions instead of guessing its scope.
    if (!terms.length || /\b(?:and|or)\b/iu.test(text.replace(SHARED_OBJECT_VERBS, ' '))) unresolvedNegation = true
  }
  return { positiveText: positive.join('. '), exclusions, unresolvedNegation }
}

function sectionText(section) {
  if (section.type === 'table') return [...(section.headers || []), ...(section.rows || []).flat()].join(' ')
  if (Array.isArray(section.items)) return section.items.join(' ')
  return section.text || ''
}

export function sourceLine(record, sourcesById) {
  const count = record.sourceRefs.length
  const noun = count === 1 ? 'source' : 'sources'
  if (record.sourceStatus === 'reviewed') return `Reviewed${record.reviewedOn ? ` ${record.reviewedOn}` : ''}, ${count} ${noun}`
  if (record.sourceStatus === 'needs-review') return `Not yet reviewed, ${count} ${noun}`
  if (record.sourceStatus === 'legacy') return count ? `References retained without claim review, ${count} ${noun}` : 'No sources recorded. No claim review recorded.'
  if (count) return `${count} ${noun}${record.reviewedOn ? `, reviewed ${record.reviewedOn}` : ''}`
  return 'No source recorded'
}

export function textMatchReason(terms) {
  const words = [...new Set(terms)].map(term => `“${term}”`)
  const list = words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words.at(-1)}` : words[0]
  return words.length ? `Your text mentions ${list}.` : ''
}

export function createKnowledgeQuery(data) {
  if (!data || !Array.isArray(data.nodes) || !data.catalog || !Array.isArray(data.catalog.edges)) throw new TypeError('A reader projection with nodes and catalog.edges is required')
  const sourcesById = new Map((data.catalog.sources || []).map(item => [item.id, item]))
  const nodesById = new Map(data.nodes.map(node => [node.id, node]))
  const rootFor = id => { let node = nodesById.get(id); const seen = new Set(); while (node && node.parent && node.parent !== 'overview' && !seen.has(node.id)) { seen.add(node.id); node = nodesById.get(node.parent) } return node?.parent === 'overview' ? node.id : null }
  const records = []
  for (const node of data.nodes) {
    records.push({
      ref: `topic:${node.id}`, id: node.id, type: 'topic', kind: node.catalog.kind, title: node.title, summary: node.summary,
      aliases: node.catalog.aliases || [], applicability: node.catalog.applicability || '', body: node.sections.map(sectionText).join(' '),
      sourceRefs: node.refs || [], sourceStatus: node.catalog.sourceStatus, reviewedOn: node.catalog.reviewedOn || '',
      scope: node.catalog.scope || null, selectable: node.catalog.guidance === 'selectable', definitionRefs: node.catalog.definitionRefs || [],
      cluster: node.parent === 'overview' ? node.id : rootFor(node.id), general: node.id === 'overview' || node.parent === 'overview',
    })
  }
  for (const record of data.catalog.definitions || []) {
    records.push({
      ref: record.ref, id: record.id, type: record.type, kind: record.type, title: record.label, summary: record.summary || '',
      aliases: [], applicability: '', body: '', sourceRefs: record.sourceRefs || [], sourceStatus: null, reviewedOn: record.reviewedOn || '',
      scope: null, selectable: false, definitionRefs: [], cluster: null, general: false, explainedBy: record.explainedBy || null, category: record.category || null,
    })
  }
  const byRef = new Map(records.map(record => [record.ref, record]))
  const indexed = records.map(record => {
    const fields = {
      title: tokenize(record.title), aliases: tokenize(record.aliases.join(' ')), applicability: tokenize(record.applicability),
      summary: tokenize(record.summary), body: tokenize(record.body).slice(0, BODY_TOKEN_CAP),
    }
    return { record, fields, all: new Set(Object.values(fields).flat()) }
  })
  const documentFrequency = new Map()
  for (const entry of indexed) for (const token of entry.all) documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1)
  const idf = token => Math.log(1 + indexed.length / (1 + (documentFrequency.get(token) || 0)))
  const outgoing = new Map()
  for (const edge of data.catalog.edges) { if (!outgoing.has(edge.from)) outgoing.set(edge.from, []); outgoing.get(edge.from).push(edge) }
  const focusTokens = record => new Set(tokenize([record.title, record.id, ...record.aliases, ...record.definitionRefs.map(ref => byRef.get(ref)?.title || '')].join(' ')).filter(term => !CONTEXT_WORDS.has(term)))
  const focusByRef = new Map(records.map(record => [record.ref, focusTokens(record)]))

  function proposalContext({ brief = '', technologies = [], stages = [], recipe = null, host = null } = {}) {
    const constraints = analyzeBriefConstraints(brief)
    const excluded = []
    const matchedExclusions = new Set()
    for (const record of records) {
      if (record.type !== 'topic' || record.general) continue
      const reasons = []
      for (const [index, exclusion] of constraints.exclusions.entries()) {
        const matched = exclusion.terms.filter(term => focusByRef.get(record.ref).has(term))
        if (!matched.length) continue
        matchedExclusions.add(index)
        reasons.push({ text: exclusion.text, matched })
      }
      if (reasons.length) excluded.push({ ref: record.ref, title: record.title, practiceRefs: record.definitionRefs.filter(ref => ref.startsWith('practice:')), reasons })
    }
    const seeds = [...new Set([...technologies.map(id => `technology:${id}`), ...stages.map(id => `stage:${id}`), ...(recipe ? [`recipe:${recipe}`] : []), ...(host ? [`host:${host}`] : [])])]
    const environmentSeeds = seeds.filter(ref => ref.startsWith('technology:') || ref.startsWith('host:'))
    const explicitWords = new Set(tokenize([constraints.positiveText, ...environmentSeeds.map(ref => `${ref.slice(ref.indexOf(':') + 1)} ${byRef.get(ref)?.title || ''}`)].join(' ')))
    const scopedOut = []
    for (const record of records) {
      if (record.scope?.generality !== 'example') continue
      const nameWords = tokenize([record.id, record.title].join(' ')).filter(term => !CONTEXT_WORDS.has(term))
      const contextWords = tokenize(record.scope.context || '').filter(term => !CONTEXT_WORDS.has(term))
      // One technology from a named example stack does not establish every other technology in that stack.
      const hasNamedContext = nameWords.some(term => explicitWords.has(term)) || (contextWords.length > 0 && contextWords.every(term => explicitWords.has(term)))
      const hasLinkedEnvironment = (outgoing.get(record.ref) || []).some(edge => environmentSeeds.includes(edge.to) && ['applies-to', 'explains', 'uses-definition'].includes(edge.type))
      if (!hasNamedContext && !hasLinkedEnvironment) scopedOut.push({ ref: record.ref, title: record.title, scope: record.scope, reason: 'Example environment is not established by the brief or recorded technologies and host' })
    }
    return { ...constraints, unresolvedNegation: constraints.unresolvedNegation || matchedExclusions.size < constraints.exclusions.length, excluded, scopedOut, seeds }
  }

  function describe(record) {
    return { ref: record.ref, id: record.id, type: record.type, kind: record.kind, title: record.title, summary: record.summary, applicability: record.applicability, cluster: record.cluster, scope: record.scope, selectable: record.selectable, definitionRefs: record.definitionRefs, sourceLine: sourceLine(record, sourcesById), sourceStatus: record.sourceStatus, sourceRefs: record.sourceRefs }
  }

  function search(text, { limit = 10, types = null } = {}) {
    const query = tokenize(text)
    if (!query.length) return []
    const phrase = String(text).trim().toLowerCase()
    const hits = []
    for (const entry of indexed) {
      if (types && !types.includes(entry.record.type)) continue
      let score = 0
      const matched = []
      for (const term of query) {
        let best = null
        for (const [field, tokens] of Object.entries(entry.fields)) {
          for (const token of tokens) {
            if (token !== term && (SHORT_IDENTIFIERS.has(term) || !token.startsWith(term))) continue
            const value = FIELD_WEIGHTS[field] * idf(token) * (token === term ? 1 : 0.7)
            if (!best || value > best.value) best = { term, field, token, value }
          }
        }
        if (best) { score += best.value; matched.push({ term: best.term, field: best.field, token: best.token }) }
      }
      if (phrase.length >= 3 && entry.record.title.toLowerCase().includes(phrase)) score += FIELD_WEIGHTS.title
      if (score > 0) hits.push({ ...describe(entry.record), score: Math.round(score * 1000) / 1000, matched })
    }
    hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))
    return hits.slice(0, limit)
  }

  function get(refOrId) {
    const record = byRef.get(refOrId) || byRef.get(`topic:${refOrId}`)
    if (!record) return null
    const node = record.type === 'topic' ? nodesById.get(record.id) : null
    return { ...describe(record), aliases: record.aliases, sections: node ? node.sections : undefined, claims: node ? node.catalog.claims : undefined, sources: record.sourceRefs.map(id => { const source = sourcesById.get(id); return source ? { id, title: source.title, url: source.url, status: source.status, reviewedOn: source.reviewedOn || '' } : { id } }), neighbors: neighbors(record.ref) }
  }

  function neighbors(ref, { types = null, limit = 200 } = {}) {
    return (outgoing.get(ref) || []).filter(edge => !types || types.includes(edge.type)).slice(0, limit).map(edge => {
      const target = byRef.get(edge.to)
      return { type: edge.type, ref: edge.to, title: target ? target.title : edge.to, kind: target ? target.kind : edge.to.split(':')[0], derived: Boolean(edge.derived), sourceRefs: edge.sourceRefs || [] }
    })
  }

  // Propose topics for a brief and the structured facts a project already holds. Scores are the sum of a lexical part
  // scaled to one and a graph part from the project's own technologies, stages, recipe and host. Every reason is shown.
  function propose({ brief = '', technologies = [], stages = [], recipe = null, host = null, limit = 5 } = {}) {
    const context = proposalContext({ brief, technologies, stages, recipe, host })
    const excludedRefs = new Set(context.excluded.map(record => record.ref))
    const scopedOutRefs = new Set(context.scopedOut.map(record => record.ref))
    const candidates = new Map()
    const add = (record, score, reason, contribution = reason) => {
      if (record.type !== 'topic' || record.general || excludedRefs.has(record.ref) || scopedOutRefs.has(record.ref) || (record.selectable && context.unresolvedNegation)) return
      if (!candidates.has(record.ref)) candidates.set(record.ref, { record, contributions: new Map(), reasons: [], graphReasons: [] })
      const entry = candidates.get(record.ref)
      const prior = entry.contributions.get(contribution) || 0
      if (score <= prior) return
      entry.contributions.set(contribution, score)
      if (reason && !entry.reasons.includes(reason)) entry.reasons.push(reason)
      if (reason && contribution !== 'lexical' && !entry.graphReasons.includes(reason)) entry.graphReasons.push(reason)
    }
    const lexical = context.positiveText ? search(context.positiveText, { limit: 40, types: ['topic'] }) : []
    const top = lexical[0]?.score || 0
    for (const hit of lexical) {
      const terms = [...new Set(hit.matched.map(item => item.term))]
      add(byRef.get(hit.ref), hit.score / top, textMatchReason(terms), 'lexical')
    }
    const seeds = new Map(context.seeds.map(ref => [ref, null]))
    // A recipe names its stages. Use their typed explanation links, without walking arbitrary graph paths.
    if (recipe) for (const edge of outgoing.get(`recipe:${recipe}`) || []) {
      if (edge.type === 'has-part' && edge.to.startsWith('stage:') && !seeds.has(edge.to)) seeds.set(edge.to, `recipe ${byRef.get(`recipe:${recipe}`)?.title || recipe}`)
    }
    for (const [seed, recipeOrigin] of seeds) {
      const seedRecord = byRef.get(seed)
      if (!seedRecord) continue
      const label = `${recipeOrigin ? `${recipeOrigin} stage` : seedRecord.type} ${seedRecord.title}`
      for (const edge of outgoing.get(seed) || []) {
        const weight = SEED_WEIGHTS[edge.type]
        if (!weight) continue
        const target = byRef.get(edge.to)
        if (!target) continue
        if (target.type === 'topic') add(target, weight, `${edge.type === 'applied-by' ? 'Applies to' : ['explains', 'explained-by'].includes(edge.type) ? 'Explains' : 'Connected to'} your ${label}`, seed)
      }
    }
    for (const [seed] of seeds) {
      const seedRecord = byRef.get(seed)
      if (!seedRecord) continue
      const label = `${seedRecord.type} ${seedRecord.title}`
      for (const edge of (outgoing.get(seed) || []).filter(item => item.type === 'works-with')) {
        for (const next of outgoing.get(edge.to) || []) {
          const topic = byRef.get(next.to)
          if (!topic || topic.type !== 'topic' || !['explains', 'explained-by', 'applied-by'].includes(next.type)) continue
          if (candidates.get(topic.ref)?.contributions.has(edge.to) || candidates.get(topic.ref)?.contributions.has(seed)) continue
          add(topic, SEED_WEIGHTS['works-with'], `Works with your ${label}`, `works-with:${seed}`)
        }
      }
    }
    const ranked = [...candidates.values()].map(entry => ({ ...entry, score: [...entry.contributions.values()].reduce((sum, score) => sum + score, 0) })).sort((a, b) => b.score - a.score || a.record.title.localeCompare(b.record.title)).slice(0, limit)
    return ranked.map(({ record, score, reasons, graphReasons }) => ({ ...describe(record), score: Math.round(score * 1000) / 1000, reasons, graphReasons, practiceRef: record.definitionRefs.find(ref => ref.startsWith('practice:')) || null, confirmation: 'not checked' }))
  }

  return { search, get, neighbors, propose, proposalContext, size: records.length, records: () => records.map(describe) }
}
