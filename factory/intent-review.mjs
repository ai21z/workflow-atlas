import { CATALOG } from './catalog.mjs'
import { getIntentAnswer } from './intent.mjs'

export const INTENT_REVIEW_VERSION = 5
export const INTENT_STATEMENT_POLICY_VERSION = 3
export const INTENT_PART_POLICY_VERSION = 4
export const INTENT_TASK_KINDS = ['software-change', 'knowledge-work', 'other', 'unsure']
export const INTENT_KNOWLEDGE_NEEDS = ['maintained-reference', 'one-off', 'unsure']
export const INTENT_PART_ROLES = ['task', 'requirement', 'context', 'restriction']
export const INTENT_RESTRICTION_SCOPES = ['practices', 'product', 'inference', 'handling', 'unresolved']
const kinds = ['requirement', 'context', 'exclusion']
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
const copy = value => JSON.parse(JSON.stringify(value))
const canonical = value => Array.isArray(value) ? value.map(canonical) : plain(value) ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value
const same = (a, b) => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b))
const string = value => typeof value === 'string' ? value : ''
const recipeFor = id => CATALOG.recipes.find(recipe => recipe.id === id)

// Only authored intent and its existing inherited answer participate. Stage
// choices still constrain eligibility independently of this wording review.
export function reviewSource(config) {
  const recipe = string(config?.workflow?.recipe)
  return {
    brief: string(config?.project?.purpose),
    recipe,
    answers: Object.fromEntries((recipeFor(recipe)?.questions || []).map(question => [question.id, getIntentAnswer(config, question.id).text])),
  }
}

export function reviewSourceClauses(source) {
  const values = [source?.brief, ...Object.values(source?.answers || {})].filter(value => typeof value === 'string')
  return [...new Set(values.flatMap(value => value.split(/(?:[;\n!?]+|\.(?=\s|$))/u).map(clause => clause.trim()).filter(Boolean)))]
}

// Keep punctuation, internal line breaks and attached comma, semicolon and
// conjunction clauses. A new line alone must not detach a condition. This is a
// deterministic source partition, not a general language sentence parser.
// Field and occurrence identify repeated wording without merging its meaning.
export function reviewSourceParts(source) {
  const recipe = recipeFor(source?.recipe)
  const fields = [
    { field: 'brief', value: source?.brief, label: 'Description' },
    ...Object.entries(source?.answers || {}).map(([id, value]) => ({ field: `answer:${id}`, value, label: recipe?.questions.find(question => question.id === id)?.label || id })),
  ]
  return fields.flatMap(({ field, value, label }) => typeof value === 'string'
    ? value.split(/(?<=[.!?])\s+/u).map(text => text.trim()).filter(Boolean).map((text, index) => ({ field, index, text, label }))
    : [])
}

// A resolver may quote a complete source sentence or one of its comma or
// contrast clauses. Require exact text and real boundaries on both sides.
// This avoids treating a matching word somewhere in the brief as a statement.
export function matchesReviewClause(source, clause) {
  if (typeof clause !== 'string' || !clause.trim() || clause !== clause.trim()) return false
  return reviewSourceClauses(source).some(sentence => {
    let offset = sentence.indexOf(clause)
    while (offset !== -1) {
      const before = sentence.slice(0, offset)
      const after = sentence.slice(offset + clause.length)
      const starts = !before || /(?:,\s*|\s+(?:but|however|instead|and)\s+)$/iu.test(before)
      const ends = !after || /^(?:\s*,|\s+(?:but|however|instead|and)\s+)/iu.test(after)
      if (starts && ends) return true
      offset = sentence.indexOf(clause, offset + 1)
    }
    return false
  })
}

export function intentReviewIssues(review, path = 'workflow.intentReview') {
  const issues = []
  const issue = (at, message) => issues.push({ severity: 'error', code: 'schema', path: at, message })
  const object = (value, at, keys) => {
    if (!plain(value)) { issue(at, 'Expected an intent review object.'); return false }
    for (const key of Object.keys(value)) if (!keys.includes(key)) issue(`${at}.${key}`, 'Unknown intent review field. This version cannot preserve it.')
    for (const key of keys) if (!Object.hasOwn(value, key)) issue(`${at}.${key}`, 'Required intent review field is missing.')
    return true
  }
  const text = (value, at) => {
    if (typeof value !== 'string') issue(at, 'Expected text.')
    else if (value.length > 20000) issue(at, 'Intent review text exceeds the 20000 character limit.')
    else if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(value)) issue(at, 'Control characters are not supported.')
  }
  if (!object(review, path, ['version', 'source', 'taskKind', 'statements', ...([3, 4, 5].includes(review?.version) ? ['knowledgeNeed'] : []), ...([4, 5].includes(review?.version) ? ['parts'] : [])])) return issues
  if (![1, 2, 3, 4, INTENT_REVIEW_VERSION].includes(review.version)) issue(`${path}.version`, 'Unsupported intent review version. This version cannot safely apply or preserve its meaning.')
  if (review.taskKind !== null && !INTENT_TASK_KINDS.includes(review.taskKind)) issue(`${path}.taskKind`, 'Choose a supported task kind or leave it unresolved.')
  if ([3, 4, 5].includes(review.version) && review.knowledgeNeed !== null && !INTENT_KNOWLEDGE_NEEDS.includes(review.knowledgeNeed)) issue(`${path}.knowledgeNeed`, 'Choose a supported knowledge need or leave it unresolved.')
  let validSource = false
  if (object(review.source, `${path}.source`, ['brief', 'recipe', 'answers'])) {
    text(review.source.brief, `${path}.source.brief`)
    text(review.source.recipe, `${path}.source.recipe`)
    const recipe = recipeFor(review.source.recipe)
    if (!recipe) issue(`${path}.source.recipe`, 'Unknown recipe in the recorded intent source.')
    if (object(review.source.answers, `${path}.source.answers`, (recipe?.questions || []).map(question => question.id))) {
      for (const [id, value] of Object.entries(review.source.answers)) text(value, `${path}.source.answers.${id}`)
    }
    validSource = !issues.some(item => item.path.startsWith(`${path}.source`))
  }
  if (!Array.isArray(review.statements)) issue(`${path}.statements`, 'Expected a list of reviewed statements.')
  else {
    if (review.statements.length > 100) issue(`${path}.statements`, 'At most 100 reviewed statements are supported.')
    const seen = new Set()
    review.statements.forEach((statement, index) => {
      const at = `${path}.statements[${index}]`
      const versionedStatements = [2, 3, 4, 5].includes(review.version)
      if (!object(statement, at, ['clause', 'kind', 'practiceIds', ...(versionedStatements ? ['policyVersion'] : [])])) return
      const supportedPolicies = [3, 4, 5].includes(review.version) ? [1, 2, INTENT_STATEMENT_POLICY_VERSION] : [1, 2]
      if (versionedStatements && !supportedPolicies.includes(statement.policyVersion)) issue(`${at}.policyVersion`, 'Unsupported statement interpretation policy. Confirm this statement with a supported version.')
      text(statement.clause, `${at}.clause`)
      if (validSource && !matchesReviewClause(review.source, statement.clause)) issue(`${at}.clause`, 'A reviewed statement must quote an exact clause from its recorded intent source.')
      if (seen.has(statement.clause)) issue(`${at}.clause`, 'Review each statement once.')
      seen.add(statement.clause)
      if (!kinds.includes(statement.kind)) issue(`${at}.kind`, 'Choose requirement, context or exclusion.')
      if (!Array.isArray(statement.practiceIds)) issue(`${at}.practiceIds`, 'Expected a list of excluded practice ids.')
      else {
        if (statement.kind === 'exclusion' && !statement.practiceIds.length) issue(`${at}.practiceIds`, 'An exclusion needs at least one named practice.')
        if (statement.kind !== 'exclusion' && statement.practiceIds.length) issue(`${at}.practiceIds`, 'Only an exclusion can name excluded practices.')
        if (new Set(statement.practiceIds).size !== statement.practiceIds.length) issue(`${at}.practiceIds`, 'Excluded practices must be unique.')
        for (const id of statement.practiceIds) if (!CATALOG.practices.some(practice => practice.id === id)) issue(`${at}.practiceIds`, 'Choose known catalogue practices only.')
      }
    })
  }
  if ([4, 5].includes(review.version)) {
    if (!Array.isArray(review.parts)) issue(`${path}.parts`, 'Expected a list of source parts.')
    else {
      if (review.parts.length > 100) issue(`${path}.parts`, 'At most 100 reviewed source parts are supported.')
      const sourceParts = validSource ? reviewSourceParts(review.source) : []
      const sourceFields = new Set(['brief', ...Object.keys(review.source?.answers || {}).map(id => `answer:${id}`)])
      const seen = new Set()
      review.parts.forEach((part, index) => {
        const at = `${path}.parts[${index}]`
        if (!object(part, at, ['field', 'index', 'text', 'role', 'scope', 'practiceIds', ...(review.version === 5 ? ['policyVersion'] : [])])) return
        if (review.version === 5 && ![1, 2, 3, INTENT_PART_POLICY_VERSION].includes(part.policyVersion)) issue(`${at}.policyVersion`, 'Unsupported source part interpretation policy. Confirm this part with a supported version.')
        if (!sourceFields.has(part.field)) issue(`${at}.field`, 'Choose a recorded description or recipe answer field.')
        if (!Number.isInteger(part.index) || part.index < 0) issue(`${at}.index`, 'Choose a nonnegative source part index.')
        text(part.text, `${at}.text`)
        if (validSource && !sourceParts.some(sourcePart => sourcePart.field === part.field && sourcePart.index === part.index && sourcePart.text === part.text)) issue(`${at}.text`, 'A source part must quote the complete original text at its recorded field and index.')
        const identity = JSON.stringify([part.field, part.index])
        if (seen.has(identity)) issue(at, 'Review each source part once.')
        seen.add(identity)
        if (!INTENT_PART_ROLES.includes(part.role)) issue(`${at}.role`, 'Choose task, requirement, context or restriction.')
        const scopes = review.version === 5 && part.policyVersion >= 2 ? INTENT_RESTRICTION_SCOPES : INTENT_RESTRICTION_SCOPES.filter(scope => scope !== 'handling')
        if (part.role === 'restriction' ? !scopes.includes(part.scope) : part.scope !== null) issue(`${at}.scope`, 'Only a restriction has a scope. Input handling requires source part policy 2 or later. Otherwise choose practices, product, inference or unresolved.')
        if (!Array.isArray(part.practiceIds)) issue(`${at}.practiceIds`, 'Expected a list of excluded practice ids.')
        else {
          const practiceRestriction = part.role === 'restriction' && part.scope === 'practices'
          if (practiceRestriction && !part.practiceIds.length) issue(`${at}.practiceIds`, 'A practice restriction needs at least one named practice.')
          if (!practiceRestriction && part.practiceIds.length) issue(`${at}.practiceIds`, 'Only a practice restriction can name excluded practices.')
          if (new Set(part.practiceIds).size !== part.practiceIds.length) issue(`${at}.practiceIds`, 'Excluded practices must be unique.')
          for (const id of part.practiceIds) if (!CATALOG.practices.some(practice => practice.id === id)) issue(`${at}.practiceIds`, 'Choose known catalogue practices only.')
        }
      })
    }
  }
  return issues
}

export function getIntentReview(config) {
  const review = config?.workflow?.intentReview
  if (review === undefined) return { active: false, stale: false, taskKind: null, knowledgeNeed: null, statements: [], parts: [] }
  if (intentReviewIssues(review).length || !same(review.source, reviewSource(config))) return { active: false, stale: true, taskKind: null, knowledgeNeed: null, statements: [], parts: [] }
  const knowledgeNeed = [3, 4, 5].includes(review.version) ? review.knowledgeNeed : null
  const parts = review.version === 4 ? review.parts.map(part => ({ ...copy(part), policyVersion: 1 })) : review.version === 5 ? copy(review.parts) : []
  return { active: review.taskKind !== null || knowledgeNeed !== null || review.statements.length > 0 || parts.length > 0, stale: false, taskKind: review.taskKind, knowledgeNeed, statements: copy(review.statements), parts }
}

export function updateIntentReview(config, change) {
  if (!plain(change)) throw new Error('Choose an intent clarification change.')
  const next = copy(config)
  if (change.type === 'clear') { delete next.workflow.intentReview; return next }
  const prior = config.workflow?.intentReview
  if (prior !== undefined && intentReviewIssues(prior).length) throw new Error('The recorded intent review is unsupported or malformed. Clear it explicitly before replacing it.')
  const source = reviewSource(config)
  const review = prior && same(prior.source, source) ? copy(prior) : { version: INTENT_REVIEW_VERSION, source, taskKind: null, knowledgeNeed: null, statements: [], parts: [] }
  // Container upgrades preserve each prior confirmation policy. Editing the
  // task must not activate untouched statements or parts under newly supported
  // recognition rules. Only confirming that item upgrades its policy.
  if (review.version === 1) {
    review.statements = review.statements.map(statement => ({ ...statement, policyVersion: 1 }))
  }
  if (review.version < INTENT_REVIEW_VERSION) {
    if (review.version < 3) review.knowledgeNeed = null
    review.parts = review.version === 4 ? review.parts.map(part => ({ ...part, policyVersion: 1 })) : []
    review.version = INTENT_REVIEW_VERSION
  }
  if (change.type === 'task') review.taskKind = change.value
  else if (change.type === 'knowledge') review.knowledgeNeed = change.value
  else if (change.type === 'statement') {
    const statement = { clause: change.clause, kind: change.kind, practiceIds: Array.isArray(change.practiceIds) ? [...change.practiceIds] : change.practiceIds === undefined ? [] : change.practiceIds, policyVersion: INTENT_STATEMENT_POLICY_VERSION }
    review.statements = [...review.statements.filter(item => item.clause !== change.clause), statement]
  } else if (change.type === 'remove-statement') review.statements = review.statements.filter(item => item.clause !== change.clause)
  else if (change.type === 'part') {
    const part = { field: change.field, index: change.index, text: change.text, role: change.role, scope: change.scope, practiceIds: Array.isArray(change.practiceIds) ? [...change.practiceIds] : change.practiceIds, policyVersion: INTENT_PART_POLICY_VERSION }
    review.parts = [...review.parts.filter(item => item.field !== part.field || item.index !== part.index), part]
  } else if (change.type === 'remove-part') review.parts = review.parts.filter(item => item.field !== change.field || item.index !== change.index)
  else throw new Error('Unsupported intent clarification change.')
  const issues = intentReviewIssues(review)
  if (issues.length) throw new Error(`${issues[0].path}: ${issues[0].message}`)
  next.workflow.intentReview = review
  return next
}
