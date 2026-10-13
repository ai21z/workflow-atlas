import { CATALOG } from './catalog.mjs'
import { createKnowledgeQuery, tokenize, textMatchReason } from './knowledge-query.mjs'
import { getPracticeAction } from './practice-actions.mjs'
import { projectTechnologyIds } from './catalogue-rules.mjs'
import { SUPPORTED_PRACTICES } from './jev-contract.mjs'
import { getIntentAnswer } from './intent.mjs'
import { getIntentReview, reviewSource } from './intent-review.mjs'
import { separateIntent } from './intent-separation.mjs'

const supported = new Set(SUPPORTED_PRACTICES)
const text = value => typeof value === 'string' ? value.trim() : ''
const unique = values => [...new Set(values)].sort()
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const snapshot = value => JSON.stringify(canonical(value))

// Reviewed local retrieval cues, not a language classifier or an inference prompt.
// A stage is an eligibility constraint. It cannot establish a candidate's need.
// Product vocabulary covers common interfaces and implementation work. Generic
// words such as service, form and screen still need a technical qualifier.
const SOFTWARE_OBJECT = /\b(?:software|apps?|apis?|endpoints?|dashboards?|bugs?|validators?|databases?|checkout|upload(?:s|er)?|download(?:s|er)?|authentication|code|dependencies|repository|repositories|applications?|sidebars?|toolbars?|dialogs?|tooltips?|widgets?|plugins?|libraries|library|modules?|renderers?|parsers?|import(?:s|er)?|exporters?|installers?|frontend|backend|servers?)\b|\b(?:web|mobile|tablet|desktop|application|checkout|settings|login|search|account|admin|review|preview|profile|user|backend)\s+(?:screens?|forms?|editors?|interfaces?|services?|components?|features?)\b|\b(?:status|search|request)\s+(?:status\s+)?(?:filters?|lists?)\b|\b(?:print\s+preview|command\s+line|support\s+queue)\b/iu
const SOFTWARE_ACTION = /\b(?:add|build|implement|repair|fix|refactor|replace|migrate|develop|change|extend|plan|deliver|inspect|reuse|debug|upgrade|investigate)\b/iu
const READ_ONLY = /\b(?:read|translate|summarize|summarise|proofread)\b/iu
const PASSIVE_OR_HISTORICAL = /^\s*(?:(?:please\s+|(?:i|we)\s+(?:only\s+)?(?:want|need)\s+to\s+|(?:our|my|the)\s+(?:goal|task)\s+is\s+to\s+)?(?:read|translate|summarize|summarise|proofread)\b|(?:we|i|the\s+team)\s+(?:rejected|abandoned|cancelled|canceled|decided\s+against)\b)/iu
function broadChangeWithoutSlice(value, sourceText = value) {
  const clauses = value.split(/[.!?\n]+/u)
  const broad = clauses.some(clause => /\b(?:replace|rewrite|redesign|rebuild|migrate|overhaul)\b/iu.test(clause)
    && /\b(?:subsystems?|entire|whole|all\s+(?:services|warehouses|systems|applications|modules|regions)|across\s+(?:all|every)|platform[ -]wide|system[ -]wide)\b/iu.test(clause))
  const slice = sourceText.split(/[.!?\n]+/u).some(clause => /^\s*(?:(?:for\s+)?(?:this\s+(?:task|slice|ticket)|first\s+(?:slice|step))\s*[:,]\s*|first,?\s+)(?:only\s+)?(?:fix|change|update|add|repair)\b/iu.test(clause)
    && /\b(?:only|single|one)\b/iu.test(clause))
  return broad && !slice
}
function practiceIntentReason(id, positiveText, taskKind = null, knowledgeNeed = null) {
  if (taskKind === 'software-change' && id === 'minimum-change') return 'You confirmed that this work builds, fixes or plans software.'
  if (taskKind === 'software-change' && id === 'specification-first') return 'Your confirmed software task and selected stages connect requirements to a change.'
  if (id === 'evidence-wiki') {
    if (knowledgeNeed === 'one-off' || knowledgeNeed === 'unsure') return ''
    if (knowledgeNeed === 'maintained-reference') return 'You confirmed an ongoing reference that connects sources and decisions.'
    if (taskKind === 'knowledge-work') return 'You confirmed that this work maintains source backed knowledge.'
  }
  const clauses = positiveText.split(/[.!?\n]+/u).filter(Boolean)
  const change = clauses.some(clause => SOFTWARE_ACTION.test(clause) && SOFTWARE_OBJECT.test(clause) && !READ_ONLY.test(clause) && !/^\s*(?:(?:we|i)\s+)?(?:maybe|may|might|could|perhaps)\b/iu.test(clause))
  if (id === 'minimum-change' && change) return 'Your text describes a software change or inspection of existing software.'
  if (id === 'specification-first' && change) return 'Your text describes software work, and your selected stages connect requirements to a change.'
  if (id === 'specification-first' && clauses.some(clause => /\b(?:define|document|write|agree|connect|prepare)\b[^.!?]{0,100}\b(?:requirements?|acceptance\s+(?:examples|criteria|scenarios))\b/iu.test(clause))) return 'Your text asks to define requirements or acceptance examples for the selected change stages.'
  if (id === 'validated-retrieval' && clauses.some(clause => /\b(?:fetch|retrieve|retrieval)\b/iu.test(clause) && /\b(?:api|interface|endpoint)\b/iu.test(clause) && /\b(?:validate|validation|approved|permitted)\b/iu.test(clause))) return 'Your text asks for retrieval through an approved interface or validation of its results.'
  if (id === 'evidence-wiki') {
    // A knowledge topic mention does not establish a maintenance task. Keep
    // one-off reading separate from a maintained source and decision record.
    // Other wording can use the independent, explicit knowledge need choice.
    const maintainedKnowledge = clauses.some(clause => {
      if (/\b(?:one[ -](?:off|time)|snapshot|summari[sz]e|translate|proofread)\b/iu.test(clause)) return false
      const request = /^\s*(?:(?:please\s+)|(?:(?:we|i)\s+(?:will|must|should|need\s+to|want\s+to)\s+))?(?:maintain|keep|create|curate|update)\s+(.+)$/iu.exec(clause)
      if (!request) return false
      const object = /\b(?:wiki|knowledge|index|records?|logs?|handbooks?|references?)\b/iu.exec(request[1])
      if (!object) return false
      const beforeObject = request[1].slice(0, object.index)
      // A button pointing to a wiki or software displaying existing records
      // consumes knowledge. It does not request a maintained source reference.
      if (/\b(?:that|which|from|by|using|use|open|read|consume|consult|browse|display(?:s|ing)?|show(?:s|ing)?|list(?:s|ing)?|render(?:s|ing)?|buttons?|screens?|widgets?|navigation|apps?|apis?|features?|interfaces?)\b/iu.test(beforeObject)) return false
      if (/^\s+(?:navigation|button|link|screen|widget|renderer)\b/iu.test(request[1].slice(object.index + object[0].length))) return false
      const evidence = /\b(?:sources?|evidence|decisions?|passages?|claims?|corrections?)\b/iu.test(clause)
      const maintained = /\b(?:maintain(?:ed|ing)?|living|ongoing)\b/iu.test(clause)
      const kept = /\bkeep\b/iu.test(clause) && /\b(?:sources?|evidence|source[ -]backed)\b/iu.test(clause)
      return evidence && (maintained || kept)
    })
    if (maintainedKnowledge) return 'Your text asks to keep source evidence or decisions for later use.'
  }
  return ''
}

// Only the chosen recipe's authored answers join the brief. Technology profile answers,
// source passages, catalogue summaries and generated files are not used as user intent.
export function briefSuggestionInput({ brief = '', config = null } = {}) {
  const recipe = CATALOG.recipes.find(item => item.id === config?.workflow?.recipe)
  const answers = recipe ? Object.fromEntries(recipe.questions.map(question => [question.id, text(getIntentAnswer(config, question.id).text)]).filter(([, value]) => value)) : {}
  const description = text(brief) || text(config?.project?.purpose)
  return {
    brief: [description, ...Object.values(answers).filter(value => value !== description)].filter(Boolean).join('\n'),
    technologies: unique([...projectTechnologyIds(config)]),
    stages: unique((config?.workflow?.enabledStages || []).filter(id => typeof id === 'string')),
    recipe: recipe?.id || null,
    host: text(config?.project?.host) || null,
    answers,
  }
}

function scopeLabel(scope) {
  if (!scope || scope.generality === 'general') return 'Related reading'
  if (scope.generality === 'example') return 'Worked example, adapt it to your project'
  return 'Context specific reading, check its scope'
}

// Suggestions are browser side retrieval results, never inferred project decisions.
// Review and explicit acceptance stay with the caller through the existing practice action.
export function createBriefSuggestions(data) {
  const query = createKnowledgeQuery(data)
  const tokenFrequency = new Map()
  for (const node of data.nodes) {
    const sectionWords = (node.sections || []).map(section => [section.text || '', ...(section.items || []), ...(section.headers || []), ...(section.rows || []).flat()].join(' ')).join(' ')
    for (const token of tokenize([node.title, node.summary, node.catalog.applicability, ...(node.catalog.aliases || []), sectionWords].join(' '))) tokenFrequency.set(token, (tokenFrequency.get(token) || 0) + 1)
  }
  // These conservative corpus-relative thresholds are retrieval heuristics, not
  // measured confidence. Broad words such as scope, request or checks cannot by
  // themselves justify selecting a practice merely because its article uses them.
  const distinctiveLimit = Math.max(2, Math.floor(data.nodes.length * 0.04))
  const uncommonLimit = Math.max(3, Math.floor(data.nodes.length * 0.1))
  // Keep an exact snapshot rather than a collision prone short hash. The caller can use
  // equality to discard a result after facts or catalogue content change.
  const catalogueSnapshot = snapshot({ version: data.catalog.version, nodes: data.nodes.map(node => ({ id: node.id, title: node.title, summary: node.summary, refs: node.refs, sections: node.sections, catalog: node.catalog })), edges: data.catalog.edges, definitions: data.catalog.definitions, sources: data.catalog.sources })

  function input(options) { return briefSuggestionInput(options) }

  function propose(options = {}) {
    const config = options.config || null
    const facts = input(options)
    // Clarifications have a separate local provenance. They never become authored
    // answers or provider state, and edits to the source text invalidate them.
    const storedReview = getIntentReview(config)
    const review = text(options.brief) && options.brief !== config?.project?.purpose
      ? { active: false, stale: storedReview.active || storedReview.stale, taskKind: null, knowledgeNeed: null, statements: [], parts: [] }
      : storedReview
    const contextResolutions = review.active ? review.statements : []
    const separation = separateIntent({ query, facts, source: reviewSource(config), inheritedFields: Object.keys(facts.answers).filter(id => getIntentAnswer(config, id).inherited).map(id => `answer:${id}`), review: { ...review, statements: contextResolutions, parts: review.active ? review.parts : [] } })
    const localFacts = separation.facts
    const fingerprint = snapshot({ catalogue: catalogueSnapshot, facts, review, project: config?.project || null, practices: config?.practices || [], runtime: config?.runtime || null })
    // Retrieve the complete ranked set before filtering. Top technology articles must
    // not conceal lower ranked practices that the project can actually select.
    const results = query.propose({ ...localFacts, limit: data.nodes.length })
    const context = separation.context
    // Reading and historical mentions remain searchable, but do not request a
    // project practice. This is a bounded local grammar, not general intent parsing.
    const matchedText = (context.positiveText ?? facts.brief).split(/[.!?\n]+|\s+and\s+(?=(?:implement|build|repair|fix|refactor)\b)/iu).filter(clause => !PASSIVE_OR_HISTORICAL.test(clause)).join('. ')
    // Alternatives are useful reading, but not evidence of a chosen practice.
    // For an explicitly undecided brief, only the user's task and knowledge
    // choices can supply practice intent. The original text stays untouched.
    const positiveText = separation.intentDecision.present ? '' : matchedText
    const lexicalResults = query.search(positiveText, { limit: data.nodes.length, types: ['topic'] })
    const lexicalById = new Map(lexicalResults.map(result => [result.id, result]))
    const taskKind = review.active ? review.taskKind : null
    const knowledgeNeed = review.active ? review.knowledgeNeed : null
    const knowledgeConflict = taskKind === 'knowledge-work' && ['one-off', 'unsure'].includes(knowledgeNeed)
    const excludedTaskKinds = context.taskScopeExcludedKinds || []
    const taskConflict = Boolean(taskKind && excludedTaskKinds.includes(taskKind))
    // Explicit task choices can supply a candidate that has no lexical overlap.
    // They do not bypass exclusions, current stage eligibility or user review.
    const knowledgeReason = knowledgeConflict ? '' : practiceIntentReason('evidence-wiki', positiveText, taskKind, knowledgeNeed)
    const confirmedIds = taskConflict ? [] : [
      ...(taskKind === 'software-change' ? ['minimum-change', 'specification-first'] : []),
      ...(knowledgeReason && (knowledgeNeed === 'maintained-reference' || taskKind === 'knowledge-work') ? ['evidence-wiki'] : []),
    ]
    const candidateIds = [...new Set([...confirmedIds, ...(knowledgeReason && !taskConflict ? ['evidence-wiki'] : [])])]
    if (!context.unresolvedNegation) for (const practiceId of candidateIds) {
      const definition = CATALOG.practiceActions.find(item => item.practiceId === practiceId)
      const record = definition && query.get(definition.topicId)
      if (!record || results.some(item => item.id === record.id) || [...(context.excluded || []), ...(context.scopedOut || [])].some(item => item.ref === record.ref)) continue
      results.push({ ...record, graphReasons: [], reasons: [], readingFit: false })
    }
    const confirmationPriority = result => {
      const id = CATALOG.practiceActions.find(item => item.topicId === result.id)?.practiceId
      const index = confirmedIds.indexOf(id)
      return index < 0 ? confirmedIds.length : index
    }
    if (confirmedIds.length) results.sort((a, b) => confirmationPriority(a) - confirmationPriority(b))
    // Each practice needs its own text support. A match for a wiki must not unlock
    // unrelated implementation practices merely because change stages are selected.
    const suggestions = []
    const usedPractices = new Set()
    for (const result of results) {
      if (suggestions.length === 3) break
      if (!config || !result.selectable || separation.localRetrievalBlocked || context.excluded.some(item => item.ref === result.ref)) continue
      const action = getPracticeAction(result.id, config)
      if (!action || action.alreadyApplied || !action.id.startsWith('practice:')) continue
      const practiceId = action.id.slice('practice:'.length)
      if (!CATALOG.practices.some(item => item.id === practiceId) || usedPractices.has(practiceId)) continue
      // A software task alone does not establish a bounded change. Broad work
      // can use this practice once the user identifies a concrete first slice.
      if (practiceId === 'minimum-change' && broadChangeWithoutSlice(matchedText, localFacts.brief)) continue
      if (taskConflict) continue
      if (practiceId === 'evidence-wiki' && (!knowledgeReason || knowledgeConflict)) continue
      if (excludedTaskKinds.includes('software-change') && ['minimum-change', 'specification-first'].includes(practiceId)) continue
      if (['knowledge-work', 'other', 'unsure'].includes(taskKind) && ['minimum-change', 'specification-first'].includes(practiceId)) continue
      const anchors = unique((lexicalById.get(result.id)?.matched || []).filter(match => ['title', 'aliases', 'practiceTitle'].includes(match.field) && match.term === match.token).map(match => match.token))
      const hasDistinctiveAnchor = anchors.some(token => (tokenFrequency.get(token) || 0) <= distinctiveLimit)
      const hasAnchorPair = anchors.length >= 2 && anchors.some(token => (tokenFrequency.get(token) || 0) <= uncommonLimit)
      const label = CATALOG.practices.find(item => item.id === practiceId)?.label || ''
      const exactLabel = label && positiveText.toLowerCase().includes(label.toLowerCase())
      const intentReason = practiceIntentReason(practiceId, positiveText, taskKind, knowledgeNeed)
      const lexicalFit = practiceId === 'minimum-change'
        ? exactLabel || /\b(?:smallest|minimum)\s+(?:(?:necessary|coherent)\s+)?change\b/iu.test(positiveText)
        : hasDistinctiveAnchor || hasAnchorPair || exactLabel
      const definition = CATALOG.practiceActions.find(item => item.topicId === result.id)
      const graphReason = result.graphReasons[0]
      // Empty briefs can use explicit stage choices. Once text is supplied, stages
      // only constrain eligibility and never substitute for candidate-local support.
      const graphFit = Boolean(!text(facts.brief) && graphReason && definition && definition.eligibility !== 'always')
      if (!lexicalFit && !intentReason && !graphFit) continue
      const reason = intentReason || (lexicalFit ? textMatchReason(anchors) || `Your text names ${label}.` : graphReason || result.reasons[0])
      usedPractices.add(practiceId)
      suggestions.push({
        id: action.id, practiceId, topicId: result.id, title: action.title,
        reason, reasons: [reason, ...result.graphReasons.filter(item => item !== reason)], sourceLine: result.sourceLine,
        sourceStatus: result.sourceStatus, sourceRefs: [...result.sourceRefs],
        assessmentSupported: supported.has(practiceId), confirmation: 'not checked', action,
      })
    }
    const suggestionTopics = new Set(suggestions.map(item => item.topicId))
    const reading = results.filter(result => result.readingFit && !suggestionTopics.has(result.id)).slice(0, 3).map(result => ({
      topicId: result.id, title: result.title, reason: result.readingReason || result.reasons[0], reasons: [...result.reasons],
      sourceLine: result.sourceLine, sourceStatus: result.sourceStatus, scope: result.scope, scopeLabel: scopeLabel(result.scope),
    }))
    return {
      suggestions, reading, assessmentCandidate: separation.assessmentBlocked ? null : suggestions.find(item => item.assessmentSupported) || null,
      localRetrievalBlocked: separation.localRetrievalBlocked, assessmentBlocked: separation.assessmentBlocked,
      excluded: context.excluded || [], exclusions: context.exclusions || [], unresolvedNegation: Boolean(context.unresolvedNegation),
      unresolved: context.unresolved || [], boundaries: context.boundaries || [], requirements: context.requirements || [],
      unknownInformation: context.unknownInformation || [],
      clarification: {
        taskNeeded: Boolean(config && facts.recipe && text(facts.brief) && (separation.intentDecision.pending || taskConflict || ((!taskKind || taskKind === 'unsure') && (review.stale || !practiceIntentReason('minimum-change', positiveText))))),
        intentUndecided: separation.intentDecision.pending, intentDecisionSource: separation.intentDecision.source,
        taskConflict, excludedTaskKinds,
        taskScopeClause: taskConflict ? context.unknownInformation?.find(item => item.excludedTaskKinds?.includes(taskKind))?.clause || null : null,
        taskKind, knowledgeNeed, knowledgeConflict, stale: review.stale, parts: separation.parts, statements: review.active ? review.statements : [],
        reviewPart: separation.parts.find(part => part.needsClarification && part.quickActions?.length) || null,
        resolvedStatements: context.resolvedStatements || [],
        // One question at a time, with the original clause visible.
        statement: context.unresolved?.[0] || null,
      },
      scopedOut: context.scopedOut || [], noClearMatch: Boolean(config && !suggestions.length),
      fingerprint, input: facts, needsProject: !config,
      note: !config ? 'Create a draft to review practices for it.' : separation.intentDecision.pending ? 'Choose the work to plan before reviewing practice ideas. Related reading stays available.' : !suggestions.length ? 'No clear additional practice matched these words. You can keep editing or explore the knowledge map.' : 'Ideas from your words and recorded project choices. Review before adding. Source status is separate from practice fit.',
    }
  }

  // Cases are authored expectations, not participant observations. Evaluate the final
  // surfaced list after project eligibility and current selections have been applied.
  function evaluate(cases) {
    const results = cases.map(item => {
      const result = propose({ brief: item.brief, config: item.config || null })
      const suggested = result.suggestions.map(suggestion => suggestion.practiceId)
      const expected = item.expected || []
      const excluded = Array.isArray(item.excluded) ? item.excluded : [item.excluded].filter(Boolean)
      return { id: item.id, suggested, expected, excluded, expectedHit: expected.length ? expected.some(id => suggested.includes(id)) : null, excludedSuggested: excluded.filter(id => suggested.includes(id)) }
    })
    const applicable = results.filter(item => item.expectedHit !== null)
    const excludedCases = results.filter(item => item.excluded.length)
    const expectedHits = applicable.filter(item => item.expectedHit).length
    const excludedHits = excludedCases.filter(item => item.excludedSuggested.length).length
    return {
      caseCount: results.length,
      expectedHitAt3: { hits: expectedHits, total: applicable.length, rate: applicable.length ? expectedHits / applicable.length : null },
      excludedSuggestion: { hits: excludedHits, total: excludedCases.length, rate: excludedCases.length ? excludedHits / excludedCases.length : null },
      results,
      limitation: 'Authored fictional cases over the final surfaced suggestions. Not independent user labels, general accuracy, source verification or a JEV evaluation. Cases with no expected practice are excluded from the expected hit denominator.',
    }
  }

  return { input, propose, evaluate }
}
