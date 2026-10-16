// Query the knowledge graph without a dependency. The same module serves the browser, the command line and the tests.
// Input is the reader projection, the object written to atlas/data.js. Everything here is deterministic and explainable.
// Search is a lexical match on titles, aliases, applicability, summaries and section text. No stemming, so identifiers
// such as pytest or npm match as typed. A query token matches a record token by prefix. Nothing is sent anywhere.

const FIELD_WEIGHTS = { title: 6, aliases: 5, practiceTitle: 5, applicability: 3, summary: 2, practiceSummary: 2, body: 1 }
// Function words that never identify a topic. Kept short on purpose, an identifier is never on this list.
const STOP_WORDS = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'into', 'your', 'their', 'our', 'its', 'are', 'was', 'were', 'will', 'can', 'not', 'but', 'out', 'also', 'only', 'each', 'any', 'all', 'has', 'have', 'had', 'been', 'make', 'sure', 'before', 'after', 'when', 'then', 'than', 'what', 'which', 'who', 'how', 'why', 'where', 'there', 'here', 'they', 'them', 'you', 'use', 'used', 'using', 'one', 'two', 'per', 'via', 'about', 'over', 'under', 'between', 'while', 'should', 'would', 'could', 'may', 'might', 'must', 'does', 'did', 'doing', 'done', 'get', 'got', 'put', 'let', 'add', 'added', 'new', 'own', 'same', 'other', 'such', 'more', 'most', 'some', 'these', 'those', 'being', 'very', 'just', 'still', 'yet', 'ever', 'never', 'always', 'need', 'needs', 'want', 'wants'])
const SEED_WEIGHTS = { 'applied-by': 1, 'explained-by': 1, explains: 1, 'used-by': 0.8, 'has-example': 0.5, 'capability-of': 0.5, 'works-with': 0.3 }
// Fixed retrieval bounds, not confidence or fitted accuracy. A recipe with many stages
// cannot outweigh the task merely by accumulating links. Explicit environment is separate.
const GRAPH_CAPS = { workflow: 0.2, environment: 0.4, related: 0.1 }
const SHORT_IDENTIFIERS = new Set(['ci', 'cd', 'go', 'r', 'c#', 'c++', '.net'])
// Broad task words do not identify the subject of an exclusion or establish an example's environment.
const CONTEXT_WORDS = new Set(['source', 'sources', 'backed', 'project', 'projects', 'practice', 'example', 'boundary', 'review', 'process', 'workflow', 'workflows', 'create', 'run', 'check', 'checks', 'tool', 'tools', 'change', 'changes', 'instructions', 'code', 'agent', 'agents', 'skill', 'diagnosis', 'quality', 'data', 'study', 'implementation', 'verification', 'test', 'tests', 'pipeline', 'build'])
const BROAD_READING_WORDS = new Set([...CONTEXT_WORDS, 'plan', 'planning', 'work', 'result', 'results', 'request', 'application', 'service', 'improve', 'keep', 'existing', 'small', 'needed', 'supported', 'read', 'write', 'save', 'generate'])
const NEGATION = /\b(?:do\s+not|does\s+not|did\s+not|must\s+not|should\s+not|will\s+not|would\s+not|cannot|can\s+not|don['’]t|doesn['’]t|isn['’]t|aren['’]t|never|avoid|without|no)\b/iu
const SHARED_OBJECT_VERBS = /\b(?:create|maintain|add|use|enable|select|include|install|configure)\s+(?:and|or)\s+(?:create|maintain|add|use|enable|select|include|install|configure)\b/giu
const EFFECT_RESTRICTION = /\b(?:saves?|saved|saving|stores?|stored|storing|persists?|persisted|persisting|persistence|retains?|retained|retaining|retention|writes?|writing|deletes?|deleting|publish(?:es|ed|ing)?|sends?|sending|transmits?|transmissions?|uploads?|exposes?|disclos(?:e[sd]?|ing)|reveal(?:s|ed|ing)?|shares?|sharing|leak(?:s|ed|ing)?|mutations?|access|reads?|reading|queries|query|connects?|connections?|calls?|executes?)\b|\b(?:be|been|being|is|are|was|were|not|never)\s+shared\b|\b(?:external|network|remote)\s+(?:requests?|apis?)\b|\b(?:personal|sensitive|confidential)\s+data\b/iu
// A finite passive outcome grammar, not arbitrary conditional language. The status
// qualifies a product object. Negated outcomes must never become positive search terms.
const SHORT_NOUN_PHRASE = String.raw`[\p{L}]+(?:[-'’][\p{L}]+)*(?:\s+[\p{L}]+(?:[-'’][\p{L}]+)*){0,2}`
const OUTCOME_REQUIREMENT = new RegExp(String.raw`^(?:(?:the|a|an)\s+)?((?:rejected|invalid|unapproved|unauthori[sz]ed|failed)\s+${SHORT_NOUN_PHRASE})\s+(?:(?:is|are)\s+not|(?:must|should|will)\s+not\s+be|isn['’]t|aren['’]t)\s+(saved|stored|persisted)(?:\s+as\s+(?:approved|accepted|confirmed)\s+(${SHORT_NOUN_PHRASE}))?$`, 'iu')
const UNSAFE_NOUN_PHRASE = /\b(?:and|or|not|no|never|except|unless|until|if|when|then|before|after|while|without|with|from|to|as|but|however|instead|all|any|every|is|are|was|were|must|should|will|would|can|may)\b/iu
// These complete sentence forms record product capabilities or missing input. They
// neither claim enforcement nor reinterpret a general ban on network operations.
const OFFLINE_REQUIREMENT = /^(.+?)\s+(?:(?:must|should|can|needs?\s+to|must\s+be\s+able\s+to)\s+(?:complete|read|use|open|work|operate|remain\s+readable)\b[^,;!?]*|works?|(?:is|are)\s+working|remains?\s+readable)\s+(?:without\s+(?:an?\s+)?(?:network|internet)\s+connection|offline)$/iu
const MISSING_INFORMATION = /^(?:not\s+(?:agreed|supplied|provided|defined|known|decided|available)(?:\s+yet)?|(?:we|i)\s+have\s+not\s+(?:agreed|supplied|provided|defined|decided)\s+(?:on\s+)?(?:(?:the|our)\s+)?(?:acceptance(?:\s+(?:criteria|examples|checks))?|requirements?|expected\s+behavio[u]?r|scope|affected\s+(?:areas|components))(?:\s+yet)?)$/iu
const UNDECIDED_INFORMATION = /^(?:we|i|the\s+team)\s+have\s+not\s+(?:agreed|decided)\s+(?:on\s+)?whether\s+([^,;!?]{1,300})$/iu
const NAMED_OMISSION = /^(?:(?:for\s+(?:this|the)\s+(?:task|workflow|pack))\s+)?(?:please\s+)?(omit|exclude)\s+(.+)$/iu
const NAMED_LEAVE_OUT = /^(?:please\s+)?leave\s+(.+?)\s+out\s+of\s+(?:(?:this|the)\s+)?(?:(?:exported|generated)\s+)?(?:pack|workflow|instructions)(?:\s+(?:because|since)\s+([^,;!?]{1,300}))?$/iu
const LEAVE_OUT_MENTION = /\bleave\b.*\bout\b/iu
const COMPETING_EXPLANATION = /\b(?:not|omit|exclude|leave|include|included|including|keep|remove|require|requires|must|should|will|would|but|however|instead|while|except|unless|until|then)\b/iu
const namedTargets = value => value.split(/(?:,\s*(?:and\s+)?|\s+and\s+)(?:(?:omit|exclude)\s+)?/iu)
const normalizeName = value => String(value || '').toLowerCase().replace(/[-\u2010-\u2015]/gu, ' ').replace(/\s+/gu, ' ').trim()
// A named exclusion must identify a complete label, id or alias after a small
// selection-verb prefix. Words borrowed from an article title do not identify it.
const exclusionTarget = value => normalizeName(value)
  .replace(/^(?:(?:create|maintain|add|use|using|enable|select|include|install|configure|adopt|introduce)\s+(?:(?:and|or)\s+)?)+/u, '')
  .replace(/^(?:a|an|the|any)\s+/u, '')
const MIXED_SCOPE = /\b(?:and|or|unless|except|until|if|when|while|before|after|but|however|instead|provided|subject\s+to|only\s+(?:if|when)|omit|exclude|leave|remove|delete|discard|drop|abandon|stop|disable|did\s+not|says?|said|conflict(?:s|ing)?|disagree(?:ment)?|unresolved)\b/iu
const INFERENCE_RESTRICTION = /\b(?:typesafe|jev|ai|llms?|inference|models?|providers?)\b|\b(?:send|share|upload|transmit|disclose)\b.*\b(?:briefs?|prompts?|messages?|inputs?|descriptions?|this\s+text|credentials?|api\s+keys?|tokens?)\b/iu
const NEGATIVE_HANDLING_QUANTIFIER = /\b(?:nothing|none|no\s+(?:part|portion|content|data|text|information|material))\b/iu
const HANDLING_TRANSFER = /\b(?:sent|shared|uploaded|transmitted|submitted|disclosed|revealed|leave|leaves|reach|reaches)\b/iu
const REPORTED_CONFLICT = /\b(?:conflicts?|conflicting|disagreements?|competing\s+(?:requests|instructions)|both\s+requests\s+remain\s+unresolved)\b/iu
const escapePattern = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')
export const QUERY_CLARIFICATION_POLICY_VERSION = 3
const GENERAL_KINDS = ['requirement', 'context', 'exclusion']
const SPECIAL_BLOCKERS = /\b(?:unless|except|until|but|however|instead|so|therefore|thus|omit|exclude|leave|remove|delete|discard|abandon|disable|says?|said|conflicts?|disagreement)\b|\b(?:and|or)\s+(?:do\s+not|don['’]t|never|must|should|shall)\b/iu
const CONDITIONAL_BLOCKERS = /\b(?:except|but|however|instead|so|therefore|thus|omit|exclude|leave|remove|delete|discard|abandon|disable|says?|said|conflicts?|disagreement)\b|\b(?:and|or)\s+(?:do\s+not|don['’]t|never|must|should|shall)\b/iu
const HISTORICAL_ANCHOR = /^(?:(?:last|previous)\s+(?:week|month|year|season|time)|(?:in|during)\s+\d{4}|previously|historically|earlier)\b/iu
const VERSION_HISTORY_ANCHOR = /^(?:(?:in|during)\s+)?(?:the|our)\s+(?:first|original|initial|previous|old|retired|superseded)\s+(?:[\p{L}]+\s+){0,2}(?:version|prototype|release|tool|application|app|system)\b/iu
const HISTORICAL_NEGATIVE = /\b(?:did\s+not|didn['’]t|was\s+not|wasn['’]t|were\s+not|weren['’]t|had\s+not|hadn['’]t)\b/iu
const PAIRED_HISTORY = /^(?:that|this|the)\s+(?:historical|past|previous|old)\s+behaviou?r\s+is\s+not\s+(?:the|our)\s+(?:desired|expected|intended|current)\s+behaviou?r\s+now$/iu
const SCOPE_DECLARATION = /^(?:(?:this|the|our|current)\s+(?:current\s+)?(?:task|work|activity|scope)\s+(?:(?:is|remains)\s+)?(?:only|limited\s+to|confined\s+to)\s+|only\s+[^,;!?]{1,100}\s+(?:is|are)\s+)/iu
const DECLARATIVE_MODAL = /^[\p{L}\d][\p{L}\d\s'’()-]{0,100}\s+(?:must|should|shall|needs?\s+to)\s+[^;!?]{1,180}$/iu
const META_SUBJECT = /\b(?:workflows?|packs?|artifacts?|assistants?|agents?|instructions?|practices?|tasks?|scope)\b/iu

function conditionalStatement(clause) {
  const conditions = [...clause.matchAll(/\b(?:if|when|unless|until)\b/giu)]
  if (conditions.length !== 1) return null
  const index = conditions[0].index
  const main = index === 0 ? /^\s*(?:if|when|unless|until)\s+[^,;!?]+,\s*(.+)$/iu.exec(clause)?.[1] : clause.slice(0, index).replace(/,\s*$/u, '').trim()
  const condition = index === 0 ? clause.slice(0, clause.indexOf(',')) : clause.slice(index + conditions[0][0].length).trim()
  return main && condition && DECLARATIVE_MODAL.test(main) ? { main, condition, minimumPolicyVersion: /^(?:unless|until)$/iu.test(conditions[0][0]) ? 3 : 2 } : null
}

// These structures identify the question to ask, not an automatic answer. Keep
// the complete statement together so its condition, history or scope survives.
function wholeStatementQuestion(sentence, previousSentences) {
  const clause = sentence.trim()
  if (!clause || clause.length > 500) return null
  const negative = NEGATION.test(clause) || HISTORICAL_NEGATIVE.test(clause) || /\bnot\b/iu.test(clause)
  if (!negative) return null
  if (HISTORICAL_ANCHOR.test(clause) && HISTORICAL_NEGATIVE.test(clause)) return { clause, clarificationType: 'historical-context' }
  if (VERSION_HISTORY_ANCHOR.test(clause) && HISTORICAL_NEGATIVE.test(clause)) return { clause, clarificationType: 'historical-context', minimumPolicyVersion: 3 }
  if (PAIRED_HISTORY.test(clause) && previousSentences.some(value => HISTORICAL_ANCHOR.test(value) && HISTORICAL_NEGATIVE.test(value))) return { clause, clarificationType: 'historical-context' }
  if (SCOPE_DECLARATION.test(clause)) {
    // This explicit knowledge-only scope rules out software work independently
    // of later task choices. Other uses of "without" do not establish that fact.
    const knowledgeOnly = /\bonly\b[^;!?]{0,100}\bexisting\s+(?:information|knowledge)\b/iu.test(clause)
    const noSoftware = /\bwithout\s+(?:inspecting\s+software|software\s+inspection)\s+(?:or|and)\s+(?:planning\s+(?:application|software)\s+changes?|software\s+change\s+planning)\s*$/iu.test(clause)
    if (knowledgeOnly && noSoftware) return { clause, clarificationType: 'task-scope', excludedTaskKinds: ['software-change'] }
  }
  // Keep one attached or leading condition whole. New unless/until meanings
  // require a new confirmation, never reinterpret an older stored choice.
  const conditional = conditionalStatement(clause)
  if (conditional) return { clause, clarificationType: 'conditional-requirement', minimumPolicyVersion: conditional.minimumPolicyVersion }
  return null
}

function markClarifiable(items, brief) {
  const text = String(brief || '')
  const sentences = text.split(/[;\n!?]+|\.(?=\s|$)/u).map(value => value.trim()).filter(Boolean)
  const reportedDirectives = [...text.matchAll(/\b(?:says?|said|asks?|asked|insists?|insisted)\b/giu)].length > 1
  const detachedCondition = sentences.some(sentence => /^(?:except|unless|until|only\s+(?:if|when)|provided\s+that|as\s+long\s+as|subject\s+to)\b/iu.test(sentence) && !conditionalStatement(sentence))
  return items.map(item => {
    const containing = sentences.filter(sentence => typeof item.clause === 'string' && sentence.includes(item.clause))
    const target = normalizeName(item.text)
    const opposing = target && sentences.some(sentence => {
      const positive = /^(?:please\s+)?(?:include|keep|require|retain)\s+(.+?)(?:\s+in\s+(?:this|the)\s+(?:pack|workflow|instructions))?$/iu.exec(sentence)
      return positive && normalizeName(positive[1]) === target
    })
    const clarificationType = item.clarificationType || 'general'
    const special = clarificationType !== 'general'
    const blockers = clarificationType === 'conditional-requirement' ? CONDITIONAL_BLOCKERS : special ? SPECIAL_BLOCKERS : MIXED_SCOPE
    // An initial date may be followed by one comma. A second clause or current
    // directive cannot be discarded together with the historical background.
    const mixedHistory = clarificationType === 'historical-context' && !PAIRED_HISTORY.test(item.clause)
      && /[,;]|\b(?:and|or|then|now|today|currently|must|should|shall|will|needs?|wants?)\b/iu.test(item.clause.replace(HISTORICAL_ANCHOR, '').replace(VERSION_HISTORY_ANCHOR, '').replace(/^\s*,\s*/u, ''))
    // A condition on the workflow or its artifacts can restrict a practice.
    // It must not be removed by confirming an ordinary product requirement.
    const conditionalScope = clarificationType === 'conditional-requirement'
      && META_SUBJECT.test((conditionalStatement(item.clause)?.main || '').split(/\b(?:must|should|shall|needs?\s+to)\b/iu)[0])
    const permitted = Boolean(
    item.kind !== 'named-practice' && item.kind !== 'confirmed-practices' && item.kind !== 'handling-restriction'
    && typeof item.clause === 'string' && item.clause.trim()
    && !blockers.test(item.clause) && !INFERENCE_RESTRICTION.test(item.clause) && !EFFECT_RESTRICTION.test(item.clause)
    && containing.every(sentence => !blockers.test(sentence)) && !opposing
    && !REPORTED_CONFLICT.test(text) && !reportedDirectives && !detachedCondition
    && !mixedHistory && !conditionalScope
    && !new RegExp(`${escapePattern(item.clause)}\\s*\\?`, 'u').test(text)
    )
    const allowedKinds = permitted ? clarificationType === 'conditional-requirement' ? ['requirement'] : special ? ['context'] : [...GENERAL_KINDS] : []
    return { ...item, clarificationType, allowedKinds, minimumPolicyVersion: item.minimumPolicyVersion || (special ? 2 : 1), policyVersion: QUERY_CLARIFICATION_POLICY_VERSION, clarifiable: allowedKinds.length > 0 }
  })
}

function acceptedResolutions(resolutions, unresolved, linkedPractices = null) {
  const accepted = new Map()
  if (!Array.isArray(resolutions)) return accepted
  const counts = new Map()
  for (const resolution of resolutions) if (typeof resolution?.clause === 'string') counts.set(resolution.clause, (counts.get(resolution.clause) || 0) + 1)
  for (const resolution of resolutions) {
    if (!resolution || typeof resolution.clause !== 'string' || counts.get(resolution.clause) !== 1 || !['requirement', 'context', 'exclusion'].includes(resolution.kind)) continue
    const matches = unresolved.filter(item => item.clause === resolution.clause)
    const policyVersion = Object.hasOwn(resolution, 'policyVersion') ? resolution.policyVersion : 1
    if (![1, 2, QUERY_CLARIFICATION_POLICY_VERSION].includes(policyVersion) || !matches.length || matches.some(item => !item.clarifiable || !item.allowedKinds.includes(resolution.kind) || policyVersion < item.minimumPolicyVersion)) continue
    const metadata = { policyVersion, clarificationType: matches[0].clarificationType, excludedTaskKinds: [...new Set(matches.flatMap(item => item.excludedTaskKinds || []))] }
    if (resolution.kind === 'exclusion') {
      if (!linkedPractices || !Array.isArray(resolution.practiceIds) || !resolution.practiceIds.length || resolution.practiceIds.some(id => typeof id !== 'string' || !linkedPractices.has(id))) continue
      accepted.set(resolution.clause, { clause: resolution.clause, kind: resolution.kind, practiceIds: [...new Set(resolution.practiceIds)], ...metadata })
    } else if (resolution.practiceIds === undefined || Array.isArray(resolution.practiceIds) && resolution.practiceIds.length === 0) {
      accepted.set(resolution.clause, { clause: resolution.clause, kind: resolution.kind, ...metadata })
    }
  }
  return accepted
}

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
function analyzeRawConstraints(brief = '', resolutions = new Map()) {
  const positive = []
  const exclusions = []
  const unresolved = []
  const requirements = []
  const unknownInformation = []
  const resolvedStatements = []
  const useResolution = clause => {
    const resolution = resolutions.get(clause.trim())
    if (!resolution) return false
    if (!resolvedStatements.some(item => item.clause === resolution.clause)) resolvedStatements.push({ clause: resolution.clause, kind: resolution.kind, policyVersion: resolution.policyVersion, practiceIds: resolution.practiceIds || [] })
    const metadata = { policyVersion: resolution.policyVersion, clarificationType: resolution.clarificationType, ...(resolution.excludedTaskKinds.length ? { excludedTaskKinds: resolution.excludedTaskKinds } : {}) }
    if (resolution.kind === 'requirement') requirements.push({ kind: 'user-requirement', clause: resolution.clause, userConfirmed: true, ...metadata, note: 'The user classified this statement as a task requirement. It remains to be verified.' })
    else if (resolution.kind === 'context') unknownInformation.push({ kind: 'user-context', clause: resolution.clause, userConfirmed: true, ...metadata, note: 'The user classified this statement as context. It supplies no positive practice match.' })
    else exclusions.push({ kind: 'confirmed-practices', clause: resolution.clause, text: resolution.clause, terms: [], practiceIds: resolution.practiceIds, marker: 'user clarification', userConfirmed: true })
    return true
  }
  let unresolvedNegation = false
  const sentences = String(brief || '').split(/([;\n!?]+|\.(?=\s|$))/u)
  for (let index = 0; index < sentences.length; index += 2) {
    const sentence = sentences[index]
    // Negative subjects can prohibit handling without a "not" or "never"
    // marker. Keep the full scope and do not offer a generic context override.
    if (NEGATIVE_HANDLING_QUANTIFIER.test(sentence) && (INFERENCE_RESTRICTION.test(sentence) || EFFECT_RESTRICTION.test(sentence) || HANDLING_TRANSFER.test(sentence))) {
      unresolvedNegation = true
      unresolved.push({ kind: 'handling-restriction', clause: sentence.trim(), reason: 'This wording restricts handling or sending information. Clarify its scope before a practice assessment.' })
      continue
    }
    if (useResolution(sentence)) continue
    // Keep the complete leave-out sentence together. Embedded reports, conflicts
    // and negated retention wording are not a confirmed named exclusion.
    const leaveOut = NAMED_LEAVE_OUT.exec(sentence.trim())
    if (leaveOut && !sentences[index + 1]?.includes('?') && (!leaveOut[2] || (!NEGATION.test(leaveOut[2]) && !COMPETING_EXPLANATION.test(leaveOut[2])))) {
      for (const target of namedTargets(leaveOut[1])) exclusions.push({ text: target.trim(), terms: tokenize(target), marker: 'leave out', clause: sentence.trim(), kind: 'named-practice' })
      continue
    }
    if (LEAVE_OUT_MENTION.test(sentence)) {
      unresolvedNegation = true
      unresolved.push({ clause: sentence.trim(), reason: 'The scope or agreement of this leave-out request needs clarification.' })
      continue
    }
    // Check the whole sentence before comma or contrast splitting. A trailing exception or
    // additional outcome must not be discarded to make a partial sentence fit.
    const outcome = !sentences[index + 1]?.includes('?') && OUTCOME_REQUIREMENT.exec(sentence.trim())
    if (outcome && !UNSAFE_NOUN_PHRASE.test(outcome[1]) && !UNSAFE_NOUN_PHRASE.test(outcome[3] || '')) {
      requirements.push({ kind: 'conditional-outcome', clause: sentence.trim(), subject: outcome[1], outcome: outcome[2], note: 'Keep this as a requirement to verify. Suggestions do not establish that it is satisfied.' })
      continue
    }
    const offline = !sentences[index + 1]?.includes('?') && OFFLINE_REQUIREMENT.exec(sentence.trim())
    const capability = sentence.replace(/\s+(?:without\s+(?:an?\s+)?(?:network|internet)\s+connection|offline)\s*$/iu, '')
    if (offline && !NEGATION.test(capability) && !/\b(?:not|except|unless|until|and|or|then|before|after|while|if|when)\b/iu.test(sentence)) {
      requirements.push({ kind: 'offline-capability', clause: sentence.trim(), note: 'Keep this offline capability as a requirement to verify. It does not establish a ban on all network operations.' })
      continue
    }
    const undecided = UNDECIDED_INFORMATION.exec(sentence.trim())
    const safeUndecided = undecided && !NEGATION.test(undecided[1]) && !/\b(?:not|omit|exclude|except|unless|until|but|however|instead|then)\b/iu.test(undecided[1])
    if (!sentences[index + 1]?.includes('?') && (MISSING_INFORMATION.test(sentence.trim()) || safeUndecided)) {
      unknownInformation.push({ clause: sentence.trim(), note: 'The user records missing information. This is not an instruction to exclude a practice.' })
      continue
    }
    const statement = wholeStatementQuestion(sentence, sentences.slice(0, index).filter((value, priorIndex) => priorIndex % 2 === 0).map(value => value.trim()))
    if (statement) {
      unresolvedNegation = true
      unresolved.push({ ...statement, reason: 'Confirm the meaning of this complete statement without changing its original wording.' })
      continue
    }
    // Preserve comma-separated named omissions as one list. A comma followed by
    // an explicit separate command or explanation starts its own clause. Every
    // remaining target must resolve to a complete existing practice name.
    const ordinaryClauses = value => value.split(/,|\s+(?:but|however|instead)\s+|\s+and\s+(?=(?:do\s+not|don['’]t|avoid|never|no)\b)/iu)
    const clauses = NAMED_OMISSION.test(sentence.trim())
      ? sentence.split(/,\s*(?=(?:(?:and\s+)?(?:keep|create|build|implement|repair|fix|maintain|read|translate|summarize|summarise|define|document|write|prepare|add|reuse|do\s+not|don['’]t|avoid|never|no)|because|since)\b)/iu).flatMap(part => NAMED_OMISSION.test(part.trim()) ? [part] : ordinaryClauses(part))
      : ordinaryClauses(sentence)
    for (const clause of clauses) {
      if (useResolution(clause)) continue
      const omission = NAMED_OMISSION.exec(clause.trim())
      if (omission) {
        if (sentences[index + 1]?.includes('?')) {
          unresolvedNegation = true
          unresolved.push({ clause: clause.trim(), reason: 'A question about omitting a practice is not a confirmed exclusion.' })
          continue
        }
        const targets = namedTargets(omission[2].replace(/\s+from\s+(?:this|the)\s+(?:pack|workflow)\s*$/iu, ''))
        for (const target of targets) exclusions.push({ text: target.trim(), terms: tokenize(target), marker: omission[1], clause: clause.trim(), kind: 'named-practice' })
        continue
      }
      // This exact form asserts a requirement, rather than excluding its subject.
      const required = /^(.+?)\s+(?:is|are)\s+not\s+optional\s*$/iu.exec(clause.trim())
      if (required && !NEGATION.test(required[1]) && !/\bnot\b/iu.test(required[1])) { positive.push(required[1]); continue }
      const match = NEGATION.exec(clause)
      if (!match) {
        if (/\b(?:not|omit|exclude)\b/iu.test(clause) || /^\s*(?:except|unless|until|only\s+(?:if|when|before|after)|provided\s+that|as\s+long\s+as|subject\s+to|but|however|instead)\b/iu.test(clause)) {
          unresolvedNegation = true
          unresolved.push({ clause: clause.trim(), reason: 'The wording or scope of this restriction needs clarification.' })
        } else if (clause.trim()) positive.push(clause.trim())
        continue
      }
      const prefix = clause.slice(0, match.index).trim()
      const text = clause.slice(match.index + match[0].length).trim()
      if (/^did\s+not$/iu.test(match[0]) || /^(?:remove|delete|discard|drop|abandon|stop|disable)\b/iu.test(text)) {
        unresolvedNegation = true
        unresolved.push({ clause: clause.trim(), reason: 'A past event or a restriction on removing something does not identify a practice to exclude.' })
        continue
      }
      if (prefix) positive.push(prefix)
      const terms = tokenize(text)
      exclusions.push({ text, terms, marker: match[0], clause: clause.trim() })
      // "Do not create or maintain a wiki" has one explicitly excluded object. Other coordination can change
      // which words a negation governs, so withhold actions instead of guessing its scope.
      if (!terms.length || /\b(?:not|except|unless|until)\b/iu.test(text) || /\b(?:and|or)\b/iu.test(text.replace(SHARED_OBJECT_VERBS, ' '))) {
        unresolvedNegation = true
        unresolved.push({ clause: clause.trim(), reason: 'The wording or scope of this restriction needs clarification.' })
      }
    }
  }
  return { positiveText: positive.join('. '), exclusions, unresolvedNegation, unresolved: markClarifiable(unresolved, brief), requirements, unknownInformation, resolvedStatements }
}

// Without a catalogue, only requirement/context classification can be checked.
// Named exclusion mappings are additionally validated by proposalContext.
export function analyzeBriefConstraints(brief = '', { contextResolutions = [] } = {}) {
  const original = analyzeRawConstraints(brief)
  const resolutions = acceptedResolutions(contextResolutions, original.unresolved)
  return resolutions.size ? analyzeRawConstraints(brief, resolutions) : original
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
    const practices = record.type === 'topic' ? record.definitionRefs.map(ref => byRef.get(ref)).filter(definition => definition?.type === 'practice') : []
    const fields = {
      title: tokenize(record.title), aliases: tokenize(record.aliases.join(' ')), applicability: tokenize(record.applicability),
      summary: tokenize(record.summary), body: tokenize(record.body),
      practiceTitle: tokenize(practices.map(practice => practice.title).join(' ')),
      practiceSummary: tokenize(practices.map(practice => practice.summary).join(' ')),
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
  const exclusionNames = new Map(records.map(record => [record.ref, new Set([
    record.title, record.id, ...record.aliases,
    ...record.definitionRefs.flatMap(ref => byRef.get(ref)?.type === 'practice' ? [byRef.get(ref).title, byRef.get(ref).id] : []),
    // Retain the existing explicit wiki shorthand without treating any other
    // isolated word in a practice title as an exclusion target.
    ...(record.definitionRefs.includes('practice:evidence-wiki') ? ['wiki', 'project wiki', 'maintained wiki', 'maintained project wiki'] : []),
  ].map(normalizeName))]))
  const environmentNames = new Set(records.filter(record => ['technology', 'host'].includes(record.type)).flatMap(record => tokenize(`${record.id} ${record.title}`)))

  function classifyConstraints(constraints, brief) {
    const excluded = []
    const matchedExclusions = new Set()
    for (const record of records) {
      if (record.type !== 'topic' || record.general) continue
      const reasons = []
      for (const [index, exclusion] of constraints.exclusions.entries()) {
        if (exclusion.kind === 'confirmed-practices') {
          const practices = record.definitionRefs.map(ref => byRef.get(ref)).filter(definition => definition?.type === 'practice' && exclusion.practiceIds.includes(definition.id))
          if (practices.length) { matchedExclusions.add(index); reasons.push({ text: exclusion.clause, matched: practices.map(practice => practice.title), practiceRefs: practices.map(practice => practice.ref), userConfirmed: true }) }
          continue
        }
        if (exclusion.kind === 'named-practice') {
          const practice = record.definitionRefs.map(ref => byRef.get(ref)).find(definition => definition?.type === 'practice' && [definition.title, definition.id].some(name => normalizeName(name) === normalizeName(exclusion.text)))
          if (practice) { matchedExclusions.add(index); reasons.push({ text: exclusion.text, matched: [practice.title], practiceRef: practice.ref }) }
          continue
        }
        if (!exclusionNames.get(record.ref).has(exclusionTarget(exclusion.text))) continue
        const matched = exclusion.terms.filter(term => focusByRef.get(record.ref).has(term))
        matchedExclusions.add(index)
        reasons.push({ text: exclusion.text, matched: matched.length ? matched : [exclusionTarget(exclusion.text)] })
      }
      if (reasons.length) excluded.push({ ref: record.ref, title: record.title, practiceRefs: [...new Set(reasons.flatMap(reason => reason.practiceRefs || (reason.practiceRef ? [reason.practiceRef] : record.definitionRefs.filter(ref => ref.startsWith('practice:')))))], reasons })
    }
    const boundaries = []
    const unresolved = [...constraints.unresolved]
    for (const [index, exclusion] of constraints.exclusions.entries()) {
      if (exclusion.kind === 'confirmed-practices') {
        if (!matchedExclusions.has(index)) unresolved.push({ ...exclusion, reason: 'The confirmed exclusion no longer identifies a linked practice.' })
        continue
      }
      if (exclusion.kind === 'named-practice') {
        if (!matchedExclusions.has(index)) unresolved.push({ ...exclusion, reason: 'The omitted name does not exactly identify a supported practice. Clarify the target before suggesting practices.' })
        continue
      }
      // MCP is an optional integration, not an identity or requirement of the API guide.
      // Recognize only a bare named restriction. Compound restrictions remain unresolved.
      const mcp = /^(?:(?:use|using|include|install|configure|enable)\s+)?(?:an?\s+)?(?:mcp(?:\s+(?:server|servers|connection|connections))?|model\s+context\s+protocol)\s*$/iu.test(exclusion.text)
      const named = exclusionTarget(exclusion.text)
      const namedDefinition = records.some(record => ['technology', 'host'].includes(record.type) && [record.title, record.id].some(name => normalizeName(name) === named))
      if (mcp) boundaries.push({ ...exclusion, kind: 'integration', label: 'MCP', note: 'MCP is excluded. These practice ideas do not require it. Related guidance may describe optional alternatives.' })
      else if (!unresolved.some(item => item.clause === exclusion.clause) && (INFERENCE_RESTRICTION.test(exclusion.clause) || EFFECT_RESTRICTION.test(exclusion.text) || (!matchedExclusions.has(index) && !namedDefinition))) unresolved.push({ ...exclusion, reason: 'Atlas cannot determine which choices this restriction affects.' })
    }
    return { excluded, boundaries, unresolved: markClarifiable(unresolved, brief) }
  }

  function proposalContext({ brief = '', technologies = [], stages, recipe = null, host = null, contextResolutions = [] } = {}) {
    const original = analyzeRawConstraints(brief)
    const classified = classifyConstraints(original, brief)
    const linkedPractices = new Set(records.filter(record => record.type === 'topic').flatMap(record => record.definitionRefs).filter(ref => ref.startsWith('practice:') && byRef.has(ref)).map(ref => ref.slice('practice:'.length)))
    const resolutions = acceptedResolutions(contextResolutions, classified.unresolved, linkedPractices)
    const constraints = resolutions.size ? analyzeRawConstraints(brief, resolutions) : original
    const { excluded, boundaries, unresolved } = resolutions.size ? classifyConstraints(constraints, brief) : classified
    // Only omitted stages use recipe defaults. An explicit empty list means none selected.
    const stageRefs = Array.isArray(stages) ? stages.map(id => `stage:${id}`) : (outgoing.get(`recipe:${recipe}`) || []).filter(edge => edge.type === 'has-part' && edge.to.startsWith('stage:')).map(edge => edge.to)
    const seeds = [...new Set([...technologies.map(id => `technology:${id}`), ...stageRefs, ...(recipe ? [`recipe:${recipe}`] : []), ...(host ? [`host:${host}`] : [])])]
    const environmentSeeds = seeds.filter(ref => ref.startsWith('technology:') || ref.startsWith('host:'))
    const explicitWords = new Set(tokenize([constraints.positiveText, ...environmentSeeds.map(ref => `${ref.slice(ref.indexOf(':') + 1)} ${byRef.get(ref)?.title || ''}`)].join(' ')))
    const scopedOut = []
    for (const record of records) {
      if (record.scope?.generality !== 'example') continue
      const nameWords = tokenize([record.id, record.title].join(' ')).filter(term => !CONTEXT_WORDS.has(term))
      const contextWords = tokenize(record.scope.context || '').filter(term => !CONTEXT_WORDS.has(term))
      // One technology from a named example stack does not establish every other technology in that stack.
      const explicitlyNamed = [record.title, record.id].some(name => constraints.positiveText.toLowerCase().includes(name.toLowerCase()))
      const hasNamedContext = explicitlyNamed || nameWords.some(term => environmentNames.has(term) && explicitWords.has(term)) || (contextWords.length > 0 && contextWords.every(term => explicitWords.has(term)))
      const hasLinkedEnvironment = (outgoing.get(record.ref) || []).some(edge => environmentSeeds.includes(edge.to) && ['applies-to', 'explains', 'uses-definition'].includes(edge.type))
      if (!hasNamedContext && !hasLinkedEnvironment) scopedOut.push({ ref: record.ref, title: record.title, scope: record.scope, reason: 'Example environment is not established by the brief or recorded technologies and host' })
    }
    const taskScopeExcludedKinds = [...new Set(original.unresolved.flatMap(item => item.excludedTaskKinds || []))]
    return { ...constraints, unresolvedNegation: unresolved.length > 0, unresolved, boundaries, excluded, scopedOut, seeds, recipeStageFallback: !Array.isArray(stages), taskScopeExcludedKinds, clarificationPolicyVersion: QUERY_CLARIFICATION_POLICY_VERSION }
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
            if (token !== term && (SHORT_IDENTIFIERS.has(term) || environmentNames.has(term) || !token.startsWith(term))) continue
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

  // Lexical relevance plus bounded workflow, environment and related-stack support.
  // These scores order candidates. They are not probabilities or source quality.
  function propose({ brief = '', technologies = [], stages, recipe = null, host = null, limit = 5, contextResolutions = [] } = {}) {
    const context = proposalContext({ brief, technologies, stages, recipe, host, contextResolutions })
    const excludedRefs = new Set(context.excluded.map(record => record.ref))
    const scopedOutRefs = new Set(context.scopedOut.map(record => record.ref))
    const candidates = new Map()
    const add = (record, score, reason, contribution = reason) => {
      if (record.type !== 'topic' || record.general || excludedRefs.has(record.ref) || scopedOutRefs.has(record.ref) || (record.selectable && context.unresolvedNegation)) return
      if (!candidates.has(record.ref)) candidates.set(record.ref, { record, contributions: new Map(), reasons: [], graphReasons: [], readingFit: !context.positiveText.trim() && !String(brief).trim() })
      const entry = candidates.get(record.ref)
      const prior = entry.contributions.get(contribution) || 0
      if (score <= prior) return
      entry.contributions.set(contribution, score)
      if (reason && !entry.reasons.includes(reason)) entry.reasons.push(reason)
      if (reason && contribution !== 'lexical' && !entry.graphReasons.includes(reason)) entry.graphReasons.push(reason)
    }
    const lexical = context.positiveText ? search(context.positiveText, { limit: records.length, types: ['topic'] }) : []
    const top = lexical[0]?.score || 0
    for (const hit of lexical) {
      const terms = [...new Set(hit.matched.map(item => item.term))]
      add(byRef.get(hit.ref), hit.score / top, textMatchReason(terms), 'lexical')
      const entry = candidates.get(hit.ref)
      const specific = hit.matched.filter(match => !BROAD_READING_WORDS.has(match.term) && !BROAD_READING_WORDS.has(match.token))
      if (entry && specific.some(match => ['title', 'aliases', 'applicability', 'summary'].includes(match.field))) {
        entry.readingFit = true
        entry.readingReason = textMatchReason(specific.filter(match => ['title', 'aliases', 'applicability', 'summary'].includes(match.field)).map(match => match.term))
      }
    }
    const seeds = new Map(context.seeds.map(ref => [ref, null]))
    const stageExplanations = new Map()
    for (const seed of seeds.keys()) {
      if (!seed.startsWith('stage:')) continue
      const explainedBy = byRef.get(seed)?.explainedBy
      if (explainedBy) stageExplanations.set(explainedBy.startsWith('topic:') ? explainedBy : `topic:${explainedBy}`, 2)
      for (const edge of outgoing.get(seed) || []) {
        if (edge.type === 'explained-by' && !stageExplanations.has(edge.to)) stageExplanations.set(edge.to, 1)
      }
    }
    const selectedTechnologies = new Set(technologies.map(id => `technology:${id}`))
    const technologyMatches = record => record.definitionRefs.some(ref => selectedTechnologies.has(ref))
      || (outgoing.get(record.ref) || []).some(edge => selectedTechnologies.has(edge.to) && ['applies-to', 'explains', 'uses-definition'].includes(edge.type))
    if (context.recipeStageFallback) for (const seed of seeds.keys()) if (seed.startsWith('stage:')) seeds.set(seed, `recipe ${byRef.get(`recipe:${recipe}`)?.title || recipe}`)
    for (const [seed, recipeOrigin] of seeds) {
      const seedRecord = byRef.get(seed)
      if (!seedRecord) continue
      const label = `${recipeOrigin ? `${recipeOrigin} stage` : seedRecord.type} ${seedRecord.title}`
      for (const edge of outgoing.get(seed) || []) {
        const weight = SEED_WEIGHTS[edge.type]
        if (!weight) continue
        const target = byRef.get(edge.to)
        if (!target) continue
        if (target.type === 'topic') {
          add(target, weight, `${edge.type === 'applied-by' ? 'Applies to' : ['explains', 'explained-by'].includes(edge.type) ? 'Explains' : 'Connected to'} your ${label}`, seed)
          if (seed.startsWith('technology:') || seed.startsWith('host:')) {
            const entry = candidates.get(target.ref)
            if (entry) { entry.readingFit = true; entry.readingReason ||= entry.graphReasons.at(-1) }
          }
        }
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
    // A reading-stage link does not select a technology. Preserve direct lexical
    // requests and explicit environment evidence, without borrowing a stack from
    // shared development stages or a works-with relationship.
    const ranked = [...candidates.values()].map(entry => {
      const totals = { workflow: 0, environment: 0, related: 0 }
      for (const [key, value] of entry.contributions) {
        if (key === 'lexical') continue
        const category = key.startsWith('works-with:') ? 'related' : key.startsWith('technology:') || key.startsWith('host:') ? 'environment' : 'workflow'
        totals[category] += value
      }
      const scoreParts = { lexical: entry.contributions.get('lexical') || 0, ...Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, Math.min(value, GRAPH_CAPS[key])])) }
      return { ...entry, scoreParts, score: Object.values(scoreParts).reduce((sum, value) => sum + value, 0) }
    }).filter(entry => (entry.readingFit || entry.record.selectable)
      && (entry.record.kind !== 'technology' || technologyMatches(entry.record) || entry.readingFit && entry.contributions.has('lexical')))
      .sort((a, b) => b.score - a.score || (stageExplanations.get(b.record.ref) || 0) - (stageExplanations.get(a.record.ref) || 0) || a.record.title.localeCompare(b.record.title)).slice(0, limit)
    return ranked.map(({ record, score, scoreParts, reasons, graphReasons, readingFit, readingReason }) => ({ ...describe(record), score: Math.round(score * 1000) / 1000, scoreParts, readingFit, readingReason: readingReason || reasons[0], reasons, graphReasons, practiceRef: record.definitionRefs.find(ref => ref.startsWith('practice:')) || null, confirmation: 'not checked' }))
  }

  return { search, get, neighbors, propose, proposalContext, size: records.length, records: () => records.map(describe) }
}
