import { CATALOG } from './catalog.mjs'
import { createKnowledgeQuery, tokenize, textMatchReason } from './knowledge-query.mjs'
import { getPracticeAction } from './practice-actions.mjs'
import { projectTechnologyIds } from './catalogue-rules.mjs'
import { SUPPORTED_PRACTICES } from './jev-contract.mjs'
import { getIntentAnswer } from './intent.mjs'

const supported = new Set(SUPPORTED_PRACTICES)
const text = value => typeof value === 'string' ? value.trim() : ''
const unique = values => [...new Set(values)].sort()
const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const snapshot = value => JSON.stringify(canonical(value))

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
    const fingerprint = snapshot({ catalogue: catalogueSnapshot, facts, project: config?.project || null, practices: config?.practices || [], runtime: config?.runtime || null })
    // Retrieve the complete ranked set before filtering. Top technology articles must
    // not conceal lower ranked practices that the project can actually select.
    const results = query.propose({ ...facts, limit: data.nodes.length })
    const context = typeof query.proposalContext === 'function' ? query.proposalContext(facts) : { exclusions: [], excluded: [], unresolvedNegation: false }
    const lexicalResults = query.search(context.positiveText ?? facts.brief, { limit: data.nodes.length, types: ['topic'] })
    const lexicalById = new Map(lexicalResults.map(result => [result.id, result]))
    // A chosen recipe can supply graph context, but cannot turn unrelated prose into
    // a project recommendation. Require at least one direct lexical match outside
    // section bodies when a brief is present. This deliberately abstains on some
    // valid paraphrases. It does not classify arbitrary natural language intent.
    const directMatch = !text(facts.brief) || lexicalResults.some(result => {
      const action = config && getPracticeAction(result.id, config)
      return action && !action.alreadyApplied && action.id.startsWith('practice:') && result.matched.some(match => ['title', 'aliases', 'applicability', 'summary'].includes(match.field))
    })
    const suggestions = []
    const usedPractices = new Set()
    for (const result of results) {
      if (suggestions.length === 3) break
      if (!config || !directMatch || !result.selectable) continue
      const action = getPracticeAction(result.id, config)
      if (!action || action.alreadyApplied || !action.id.startsWith('practice:')) continue
      const practiceId = action.id.slice('practice:'.length)
      if (!CATALOG.practices.some(item => item.id === practiceId) || usedPractices.has(practiceId)) continue
      const anchors = unique((lexicalById.get(result.id)?.matched || []).filter(match => ['title', 'aliases'].includes(match.field) && match.term === match.token).map(match => match.token))
      const hasDistinctiveAnchor = anchors.some(token => (tokenFrequency.get(token) || 0) <= distinctiveLimit)
      const hasAnchorPair = anchors.length >= 2 && anchors.some(token => (tokenFrequency.get(token) || 0) <= uncommonLimit)
      const lexicalFit = hasDistinctiveAnchor || hasAnchorPair
      const definition = CATALOG.practiceActions.find(item => item.topicId === result.id)
      const graphReason = result.graphReasons[0]
      // A stage-scoped action has explicit project evidence. Always-eligible
      // practices need their own lexical support and cannot borrow another
      // candidate's match, or the generic fact that this is a software project.
      const graphFit = Boolean(graphReason && definition && definition.eligibility !== 'always')
      if (!lexicalFit && !graphFit) continue
      const reason = lexicalFit ? textMatchReason(anchors) : graphReason || result.reasons[0]
      usedPractices.add(practiceId)
      suggestions.push({
        id: action.id, practiceId, topicId: result.id, title: action.title,
        reason, reasons: [reason, ...result.graphReasons.filter(item => item !== reason)], sourceLine: result.sourceLine,
        sourceStatus: result.sourceStatus, sourceRefs: [...result.sourceRefs],
        assessmentSupported: supported.has(practiceId), confirmation: 'not checked', action,
      })
    }
    const suggestionTopics = new Set(suggestions.map(item => item.topicId))
    const reading = results.filter(result => !suggestionTopics.has(result.id)).slice(0, 3).map(result => ({
      topicId: result.id, title: result.title, reason: result.reasons[0], reasons: [...result.reasons],
      sourceLine: result.sourceLine, sourceStatus: result.sourceStatus, scope: result.scope, scopeLabel: scopeLabel(result.scope),
    }))
    return {
      suggestions, reading, assessmentCandidate: suggestions.find(item => item.assessmentSupported) || null,
      excluded: context.excluded || [], exclusions: context.exclusions || [], unresolvedNegation: Boolean(context.unresolvedNegation),
      scopedOut: context.scopedOut || [], noClearMatch: Boolean(config && !suggestions.length),
      fingerprint, input: facts, needsProject: !config,
      note: !config ? 'Create a draft to review practices for it.' : !suggestions.length ? 'No clear additional practice matched these words. You can keep editing or explore the knowledge map.' : 'Ideas from your words and recorded project choices. Review before adding. Source status is separate from practice fit.',
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
