import { reviewSourceParts } from './intent-review.mjs'
import { CATALOG } from './catalog.mjs'
import { analyzeCompoundBoundary, hasInputHandlingBoundary, analyzeCompoundHistory, analyzeCompoundHistoryV4, analyzeCompoundRequirement, hasUnresolvedInputException } from './intent-compounds.mjs'

// These are local interpretation rules, not a permission system or a language
// model. A recorded role never edits the source or the inference request.
const NEGATIVE = /\b(?:not|never|nothing|none|no|without|avoid|omit|exclude|leave|don['’]t|cannot)\b/iu
const LIMIT = /\b(?:not|never|nothing|none|no|without|avoid|only|private|confidential|local|offline|don['’]t|cannot)\b/iu
const PROVIDER = /\b(?:jev|typesafe|ai|llms?|inference|model|models|providers?)\b/iu
const GENERIC_DATA = /\b(?:any|all|every|nothing|none|this)\b[^.!?]{0,50}\b(?:information|material|data|content|details|text)\b/iu
const INPUT = /\b(?:brief|prompt|description|request|input|message|text|credentials?|secrets?|api\s+keys?|tokens?)\b/iu
const TRANSFER = /\b(?:send|sent|sending|share|shared|sharing|upload|uploaded|uploading|transmit|transmitted|submit|submitted|disclose|disclosed|reveal|revealed|leave|leaves|reach|reaches)\b/iu
const HANDLING = /\b(?:save|saved|saving|store|stored|storing|retain|retained|retaining|persist|persisted|log|logging|publish|publishing|delete|access|read|query|execute|connect)\b/iu
const MIXED = /\b(?:but|however|instead|therefore|thus|so|now|today|currently|conflicts?|disagree(?:ment)?|says?|said|asks?|asked)\b/iu
const META = /\b(?:atlas|practices?|artifacts?|packs?|workflows?|assistants?|agents?|instructions?|scope|tasks?)\b/iu
const HISTORY = /^(?:(?:last|previous)\s+(?:week|month|year|season|time)|(?:in|during)\s+\d{4}|previously|historically|earlier|(?:in\s+|during\s+)?(?:the|our)\s+(?:first|original|initial|previous|old|retired|superseded)\s+(?:[\p{L}]+\s+){0,2}(?:version|prototype|release|tool|application|app|system))\b/iu
const PAST = /\b(?:did|didn['’]t|was|wasn['’]t|were|weren['’]t|had|hadn['’]t|used\s+to)\b/iu
const ACTIVE = /\b(?:must|shall|should|will|need(?:s)?\s+to|want(?:s)?\s+to)\b|\b(?:and|but|so|then)\s+(?:add|build|implement|keep|use|omit|exclude|never|do\s+not)\b/iu
const CONFLICT = /\b(?:conflicting|disagreement|competing\s+(?:requests|instructions)|both\s+requests\s+remain\s+unresolved)\b/iu
const key = part => `${part.field}:${part.index}`
const unique = items => [...new Map(items.map(item => [JSON.stringify(item), item])).values()]

function handlingLimit(text) {
  // An original limit on the submitted text survives every role assignment.
  // A restriction on product records alone does not establish such a limit.
  return LIMIT.test(text) && (PROVIDER.test(text) || GENERIC_DATA.test(text) && (TRANSFER.test(text) || HANDLING.test(text)) || INPUT.test(text) && (TRANSFER.test(text) || HANDLING.test(text) || /\b(?:local|offline|private|confidential|machine|device|computer)\b/iu.test(text)))
}

function inferenceOnly(text) {
  // Removing this sentence from local matching never permits an assessment.
  // Mixed limits, conditions and unnamed handling targets stay unresolved.
  return handlingLimit(text) && !HANDLING.test(text) && !/\b(?:and|or|unless|except|until|if|when|but|however|instead|also)\b|;/iu.test(text)
    && (TRANSFER.test(text) || /\b(?:use|call|invoke|consult|assess|check)\b/iu.test(text) && PROVIDER.test(text))
}

function productRule(text) {
  if (handlingLimit(text) || META.test(text) || PROVIDER.test(text) || MIXED.test(text) || /\?\s*$/u.test(text)) return false
  if (/;|\b(?:and|or)\b/iu.test(text)) return false
  // A full condition is kept with its rule. A detached or competing instruction
  // still needs editing rather than being discarded as a product requirement.
  const conditions = [...text.matchAll(/\b(?:if|when|unless|until)\b/giu)]
  if (conditions.length > 1) return false
  const main = /^(?:if|when|unless|until)\b/iu.test(text) ? text.slice(text.indexOf(',') + 1).trim() : text
  if (/^(?:if|when|unless|until)\b/iu.test(text) && !text.includes(',')) return false
  return /^[\p{L}\d][\p{L}\d\s'’()/-]{0,140}\s+(?:must|shall|should|needs?\s+to|(?:is|are)\s+not|(?:is|are)\s+never|cannot|can\s+not)\b/iu.test(main)
    || /^(?:no|rejected|invalid|failed|unapproved|unauthori[sz]ed)\b[^.!?]{0,140}\b(?:is|are|must|should|can)\b/iu.test(main)
}

function historyOnly(text) {
  const remainder = text.replace(HISTORY, '').replace(/^\s*,\s*/u, '')
  return HISTORY.test(text) && PAST.test(text) && !ACTIVE.test(text) && !MIXED.test(text) && !META.test(text) && !handlingLimit(text)
    && !/[,;]|\b(?:and|or|then|never|avoid)\b/iu.test(remainder)
}

function legacyConflict(record, local) {
  const expected = record.role === 'requirement' || record.scope === 'product' ? 'requirement'
    : record.role === 'context' ? 'context' : record.scope === 'practices' ? 'exclusion' : null
  return (local.resolvedStatements || []).some(statement => statement.kind !== expected
    || expected === 'exclusion' && JSON.stringify([...statement.practiceIds].sort()) !== JSON.stringify([...record.practiceIds].sort()))
}

function plainOmission(text) {
  // Only an uncomplicated instruction to leave choices out can be mapped to
  // practices. Approval conditions, double negatives and another directive
  // need their own wording, even after practices have been selected.
  if (/\b(?:before|after|unless|except|until|if|when|but|however|instead|without|optional|mandatory|not\s+omit|not\s+exclude)\b|[;?]/iu.test(text)) return false
  const target = /^(?:please\s+)?(?:omit|exclude|(?:leave|keep)\s+out|do\s+not\s+(?:use|include|add|create|maintain|adopt|select|enable)|don['’]t\s+(?:use|include|add|create|maintain|adopt|select|enable)|never\s+(?:use|include|add|create|maintain|adopt|select|enable))\s+(.+?)[.!]?$/iu.exec(text)?.[1]
    || /^(?:please\s+)?(?:keep|leave)\s+(.+?)\s+out(?:\s+of\s+(?:this|the|our)\s+(?:pack|workflow|instructions))?[.!]?$/iu.exec(text)?.[1]
  if (!target || /\bthen\b/iu.test(target)) return false
  if (!/\b(?:and|or)\b|,/iu.test(target)) return true
  const normalize = value => value.replace(/[.!]$/u, '').trim().toLowerCase().replace(/^(?:a|an|the)\s+/u, '').replace(/[- ]+/gu, ' ')
  const names = new Set(CATALOG.practices.flatMap(practice => [normalize(practice.id), normalize(practice.label)]))
  return target.split(/,\s*(?:and\s+)?|\s+(?:and|or)\s+/iu).every(name => names.has(normalize(name)))
}

// Policy 2 distinguishes coordinated objects from additional instructions.
// Keep policy 1 above for saved choices until their exact source is confirmed again.
const EXTRA_ACTION = /^(?:(?:please|also|then)\s+)?(?:(?:we|i|you|they|it)\s+)?(?:do|don['’]t|never|must|should|shall|will|may|can|stop|disable|enable|delete|erase|remove|save|store|send|share|upload|publish|use|call|read|run|execute|connect|keep|add|build|implement|omit|exclude)\b/iu
const CONDITIONAL_LIMIT = /\b(?:unless|except|until|if|when|provided|subject\s+to|only\s+(?:if|when))\b/iu
const cleanEnding = text => text.trim().replace(/[.!]$/u, '').trim()
const coordinated = text => text.split(/\s*,?\s+(?:and|or)\s+|,\s*/iu)
const providerObject = /^(?:(?:any|another|other|an|a|the|external|remote|model|ai)\s+)*(?:jev|typesafe|llms?|models?|providers?|services?)(?:\s+(?:providers?|services?))?$/iu
function sameObject(part) {
  const clean = cleanEnding(part)
  if (providerObject.test(clean)) return true
  const input = /^(?:(?:its|this|the|our|your|these|supplied|submitted|project)\s+)?(?:answers?|brief|description|input|text|data|information)(?:\s+to\s+(.+))?$/iu.exec(clean)
  return Boolean(input && (!input[1] || providerObject.test(input[1])))
}
const safeObjectCoordination = text => !/[;?:]/u.test(text) && !CONDITIONAL_LIMIT.test(text) && !/\b(?:but|however|instead|then|also|while|because|since|which)\b/iu.test(text)
  && coordinated(text).slice(1).every(part => !EXTRA_ACTION.test(part) && sameObject(part))

function inferenceOnlyV2(text) {
  return handlingLimit(text) && !HANDLING.test(text) && safeObjectCoordination(text)
    && (inferenceOnly(text) || /^(?:please\s+)?(?:do\s+not|don['’]t|never|avoid)\s+(?:send|share|upload|transmit|submit|disclose|reveal|use|call|invoke|consult)\b/iu.test(text)
      && (INPUT.test(text) || PROVIDER.test(text)))
}

function inputHandlingV2(text) {
  const submitted = /\b(?:project\s+(?:input|text|data|information)|this\s+(?:brief|description|prompt|request)|(?:submitted|supplied)\s+(?:text|answers|input)|(?:the|our)\s+brief)\b/iu.test(text)
  return submitted && handlingLimit(text) && safeObjectCoordination(text)
    && (/\b(?:may|must|can|should)\s+(?:only\s+)?be\s+(?:stored|saved|retained|logged)\s+(?:only\s+)?(?:in|on|within)\b/iu.test(text)
      || /^(?:please\s+)?(?:do\s+not|don['’]t|never)\s+(?:store|save|retain|log|publish)\b/iu.test(text))
}

function productRuleV2(text) {
  if (productRule(text)) return true
  const clean = cleanEnding(text).replace(/^in\s+(?:(?:the|our)\s+)?current\s+(?:product|application|app|system)\s*,\s*/iu, '')
  if (handlingLimit(clean) || META.test(clean) || PROVIDER.test(clean) || MIXED.test(clean) || /[;?]/u.test(clean)) return false
  const pieces = clean.split(/,?\s+(?:and|or)\s+/iu)
  if (pieces.length < 2 || !productRule(pieces[0])) return false
  // A second outcome must have its own subject/modal or share the first subject.
  // A new imperative is never treated as an ordinary product outcome.
  return pieces.slice(1).every(piece => productRule(piece) || /^(?:must|shall|should|needs?\s+to)\b/iu.test(piece) && productRule(`The result ${piece}`))
}

function historyOnlyV2(text) {
  if (/[:;?]/u.test(text)) return false
  if (historyOnly(text)) return true
  const clean = cleanEnding(text).replace(/,?\s+but\s+that\s+(?:historical|past)\s+(?:choice|decision)\s+is\s+not\s+a\s+request\s+for\s+(?:this|the\s+current)\s+project$/iu, '')
  const anchor = /^(?:(?:in|during)\s+)?(?:the|our)\s+(?:first|original|initial|previous|old|retired|superseded)\s+(?:[\p{L}-]+\s+){0,5}(?:did|didn['’]t|was|were|had|maintained|stored|saved|used|kept|lacked|never)\b/iu
  const anchored = HISTORY.test(clean) || anchor.test(clean)
  const remainder = clean.replace(HISTORY, '').replace(anchor, '').replace(/^\s*,\s*/u, '')
  return anchored && !ACTIVE.test(clean) && !MIXED.test(clean) && !handlingLimit(clean)
    && !/[,;:?]|\b(?:and|or|then|unless|except|until|if|when|provided|avoid)\b/iu.test(remainder)
    && (PAST.test(clean) || /\b(?:maintained|stored|saved|used|kept|lacked)\b/iu.test(clean))
}

function noSoftwareV2(text) {
  return /^(?:we\s+are|i\s+am|this\s+(?:task|work|project)\s+is)\s+not\s+(?:building|changing|implementing|developing|inspecting)(?:\s+(?:or|and)\s+(?:building|changing|implementing|developing|inspecting))?\s+software[.!]?$/iu.test(text.trim())
}

function omissionTextV2(text) {
  return cleanEnding(text).replace(/\s+from\s+(?:this|the|our)\s+(?:pack|workflow|instructions)$/iu, '')
}
function omittedPracticesV2(text) {
  const clean = omissionTextV2(text)
  if (!plainOmission(clean)) return []
  const target = clean.replace(/^(?:please\s+)?(?:omit|exclude|(?:leave|keep)\s+out|(?:do\s+not|don['’]t|never)\s+(?:use|include|add|create|maintain|adopt|select|enable))\s+/iu, '').replace(/^(?:please\s+)?(?:keep|leave)\s+(.+?)\s+out(?:\s+of\s+(?:this|the|our)\s+(?:pack|workflow|instructions))?$/iu, '$1')
  const normalize = value => value.trim().toLowerCase().replace(/^(?:a|an|the)\s+/u, '').replace(/[- ]+/gu, ' ')
  const matches = target.split(/,\s*(?:and\s+)?|\s+(?:and|or)\s+/iu).map(name => CATALOG.practices.find(practice => [practice.id, practice.label].some(value => normalize(value) === normalize(name)))?.id)
  return matches.every(Boolean) ? [...new Set(matches)] : []
}

// A choice of deliverable is separate from the words used to describe its
// alternatives. Keep this evidence tied to the intact source, even when a
// sentence has been classified as background for local retrieval.
function undecidedDeliverable(text) {
  const value = cleanEnding(text)
  return additionalDecisionMarker(value)
    || /^(?:we|i|the\s+team)\s+(?:(?:have|has)\s+not|haven['’]t|hasn['’]t)\s+(?:yet\s+)?(?:selected|chosen|decided(?:\s+on)?)\s+(?:(?:a|the|our|my)\s+)?(?:deliverable|task|kind\s+of\s+work|type\s+of\s+work)\b/iu.test(value)
    || /^(?:(?:our|the|this)\s+)?(?:deliverable|task|kind\s+of\s+work|type\s+of\s+work)\s+(?:is|remains)\s+(?:still\s+)?(?:undecided|unselected|not\s+(?:chosen|selected|decided))\b/iu.test(value)
    || /^(?:we\s+are|we['’]re|i\s+am|i['’]m|the\s+team\s+is)\s+(?:still\s+)?(?:undecided|deciding|choosing)\s+(?:between|whether)\b/iu.test(value)
    || /^(?:we|i)\s+(?:(?:have\s+not|haven['’]t)\s+(?:yet\s+)?(?:decided|chosen)|(?:do\s+not|don['’]t)\s+know)\s+(?:yet\s+)?(?:between|whether|what\s+to\s+(?:build|produce|deliver|plan))\b/iu.test(value)
    || /\b(?:are|remain)\s+(?:still\s+)?(?:alternatives|options)\s*$/iu.test(value) && /\b(?:code|software|briefing|reference|wiki|implementation)\b/iu.test(value)
}

function additionalDecisionMarker(text) {
  // Whole decision statements only. A task choice cannot remove an appended
  // instruction or infer that an owner approved an actual implementation.
  return /^(?:nobody|no\s+one)\s+has\s+(?:yet\s+)?(?:selected|chosen|approved)\s+(?:the|a|our)\s+(?:deliverable|task|option)(?:\s+yet)?$/iu.test(text)
    || /^(?:(?:these|those)\s+are\s+competing\s+options,?\s+and\s+)?(?:the\s+(?:owner|team|sponsor)|we)\s+(?:has|have)\s+not\s+(?:yet\s+)?(?:approved|selected|chosen)\s+(?:any\s+of\s+them|any\s+(?:option|deliverable)|(?:the|a)\s+deliverable)(?:\s+yet)?$/iu.test(text)
}

function resolvedDecisionMarker(text) {
  // Selecting a task resolves the standalone uncertainty, not instructions
  // appended to it. Alternatives without negation can remain as reading text.
  const value = cleanEnding(text)
  if (additionalDecisionMarker(value)) return true
  const options = /^(?:we|i)\s+(?:(?:have\s+not|haven['’]t)\s+(?:yet\s+)?(?:decided|chosen)|(?:do\s+not|don['’]t)\s+know)\s+(?:yet\s+)?(?:between|whether|what\s+to\s+(?:build|produce|deliver|plan))\s+(.+)$/iu.exec(value)
  const option = /^(?:to\s+(?:build|create|write|maintain|use)\s+)?(?:(?:a|an|the|our|one-time|maintained|living|ongoing|code|software|application|process|decision|source|shared|team)\s+){0,5}(?:handbook|dashboard|wiki|briefing|explanation|presentation|reference|memo|report|change|patch|app|application|site|workflow)$/iu
  if (options) {
    const choices = options[1].split(/\s+(?:or|and)\s+|,\s*(?:or\s+|and\s+)?/iu)
    if (choices.length <= 4 && choices.every(choice => option.test(choice))) return true
  }
  return /^(?:we|i|the\s+team)\s+(?:(?:have|has)\s+not|haven['’]t|hasn['’]t)\s+(?:yet\s+)?(?:selected|chosen|decided(?:\s+on)?)\s+(?:(?:a|the|our|my)\s+)?(?:deliverable|task|kind\s+of\s+work|type\s+of\s+work)(?:\s+yet)?$/iu.test(value)
    || /^(?:(?:our|the|this)\s+)?(?:deliverable|task|kind\s+of\s+work|type\s+of\s+work)\s+(?:is|remains)\s+(?:still\s+)?(?:undecided|unselected|not\s+(?:chosen|selected|decided))(?:\s+yet)?$/iu.test(cleanEnding(text))
}

function omissionTextV3(text) {
  return omissionTextV2(text)
    .replace(/^(?:for|in)\s+(?:this|the\s+current|our\s+current)\s+(?:repair|task|change|project|workflow|pack|delivery),?\s+/iu, '')
    .replace(/\s+(?:for|in)\s+(?:this|the\s+current|our\s+current)\s+(?:repair|task|change|project|workflow|pack|delivery)$/iu, '')
    .replace(/^(please\s+)?skip\s+/iu, '$1omit ')
    .replace(/\s+plus\s+/giu, ' and ')
}

function omissionTextV4(text) {
  const value = omissionTextV3(text).replace(/\s+for\s+(?:this|the\s+current|our\s+current)\s+draft$/iu, '')
  const command = /^(?:please\s+)?(?:omit|exclude)\s+(.+)$/iu.exec(value)
  if (!command) return value
  const normalize = name => name.toLowerCase().replace(/[- ]+/gu, ' ')
  const names = new Set(CATALOG.practices.flatMap(practice => [normalize(practice.id), normalize(practice.label)]))
  const targets = command[1].split(/,\s*(?:and\s+)?|\s+(?:and|or)\s+/iu)
  const canonical = targets.map(target => {
    const base = target.replace(/\s+guidance$/iu, '')
    return names.has(normalize(base)) ? base : target
  })
  return `${value.slice(0, command.index + command[0].length - command[1].length)}${canonical.join(' and ')}`
}

function partlyNamedOmission(text) {
  const normalized = omissionTextV4(text)
  const targets = /^(?:please\s+)?(?:omit|exclude)\s+(.+)$/iu.exec(normalized)?.[1]
  if (!targets || omittedPracticesV2(normalized).length) return false
  // A partly recognized list is still a prohibition. An unknown second name
  // must not turn the first practice into a positive recommendation.
  return targets.split(/,\s*(?:and\s+)?|\s+(?:and|or)\s+/iu).some(target => omittedPracticesV2(`omit ${target}`).length > 0)
}

function opposingSoftwareAnswer(parts) {
  const softwareTask = parts.some(part => part.field === 'brief'
    && /^(?:please\s+)?(?:add|build|fix|implement|develop|repair|refactor)\b/iu.test(part.text)
    && /\b(?:existing|current)\s+(?:[\p{L}\d-]+\s+){0,3}(?:app|application|service|page|grid|dashboard|endpoint|component|form|screen|editor|player)\b/iu.test(part.text)
    && !/^(?:please\s+)?(?:add|build|fix|implement|develop|repair|refactor)\s+(?:(?:a|an|the|one-time|one-off|single|printed)\s+){0,4}(?:explanation|memo|presentation|report|briefing|handbook|reference|route|sheet)\b/iu.test(part.text))
  if (!softwareTask) return null
  return parts.find(part => part.field !== 'brief'
    && /^(?:the|our)\s+(?:sponsor|owner|lead|team)\s+(?:(?:has|have)\s+)?(?:canceled|cancelled)\s+(?:implementation|development|software\s+(?:work|changes?)),?\s+and\s+now\s+(?:requests?|wants?|asks?\s+for)\s+(?:only\s+)?(?:a|an)\s+(?:one-time|one-off|single)\b/iu.test(part.text)) || null
}

function productRuleV3(text) {
  if (productRuleV2(text)) return true
  if (handlingLimit(text) || META.test(text) || PROVIDER.test(text) || MIXED.test(text) || /[;?]|\b(?:or|unless|except|if|when|until)\b/iu.test(text)) return false
  const pieces = cleanEnding(text).split(/,?\s+and\s+/iu)
  return pieces.length > 1 && pieces.length <= 4 && productRule(pieces[0])
    && pieces.slice(1).every(piece => /^(?:show|display|clear|hide|reset|refresh)\s+(?:the|a|an|its)\s+(?:(?:status|progress|error|current|selected)\s+)?(?:spinner|indicator|message|label|preview|field|text)$/iu.test(piece)
      && !NEGATIVE.test(piece) && !TRANSFER.test(piece) && !HANDLING.test(piece) && !/\b(?:and|or|then|before|after|must|should|can|will)\b/iu.test(piece))
}

// Reuse the original query guards for unclassified sentences. New full-sentence
// roles are separate from v1-v3 clause confirmations and never upgrade them.
export function separateIntent({ query, facts, source, review, inheritedFields = [] }) {
  const original = query.proposalContext({ ...facts, contextResolutions: review.statements || [] })
  // Removing confirmed background from matching must not weaken a surviving
  // clause's original typed question. Its meaning may depend on that background.
  // Keep exact-clause constraints, without returning source text to task matches.
  const typedQuestions = original.unresolved.filter(item => item.clarificationType && item.clarificationType !== 'general')
  const contextResolutions = (review.statements || []).filter(statement => typedQuestions.filter(item => item.clause === statement.clause)
    .every(item => item.clarifiable && item.allowedKinds.includes(statement.kind) && (statement.policyVersion || 1) >= item.minimumPolicyVersion))
  const recorded = new Map((review.parts || []).map(part => [key(part), part]))
  // A separately authored answer can later inherit identical description text.
  // Its source-bound recorded meaning must stay visible and keep its effect.
  const sourceParts = reviewSourceParts(source).filter(part => !inheritedFields.includes(part.field) || recorded.has(key(part)))
  const inputExceptions = sourceParts.filter(part => hasUnresolvedInputException(part.text, handlingLimit(part.text))).map(part => ({
    clause: part.text, clarificationType: 'input-exception', clarifiable: false, allowedKinds: [],
    reason: 'Atlas cannot apply this handling exception as permission to share input. Keep this rule and plan manually, or edit it if it does not describe your intended limit. Changing its label cannot resolve it.',
  }))
  if (inputExceptions.length) {
    original.unresolved = unique([...inputExceptions, ...original.unresolved])
    original.unresolvedNegation = true
  }
  const opposingAnswer = opposingSoftwareAnswer(sourceParts)
  const sourceConflict = opposingAnswer ? { clause: opposingAnswer.text, reason: 'The description requests software work, but a recorded answer cancels it. Edit them to agree before choosing practices.', clarifiable: false, allowedKinds: [] } : null
  if (sourceConflict) {
    original.unresolved.push(sourceConflict)
    original.unresolvedNegation = true
  }
  const decisionParts = sourceParts.filter(part => undecidedDeliverable(part.text))
  const decisionChoice = review.active && ['software-change', 'knowledge-work', 'other'].includes(review.taskKind) ? review.taskKind : null
  const intentDecision = { present: decisionParts.length > 0, pending: decisionParts.length > 0 && !decisionChoice, source: decisionParts[0]?.text || null }
  const parts = []
  const retained = []
  const requirements = []
  const boundaries = []
  const additionalExcluded = new Set()
  const scopeExcluded = new Set()
  const pendingOmissions = []
  let assessmentBlocked = false
  let explicitPause = false
  const reported = [...facts.brief.matchAll(/\b(?:says?|said|asks?|asked|insists?|insisted)\b/giu)].length > 1
  const globalConflict = CONFLICT.test(facts.brief) || reported || Boolean(sourceConflict)
  for (const part of sourceParts) {
    const record = recorded.get(key(part))
    const local = query.proposalContext({ ...facts, brief: part.text, contextResolutions })
    const hardHandling = handlingLimit(part.text) || hasInputHandlingBoundary(part.text) || local.unresolved.some(item => item.kind === 'handling-restriction')
    assessmentBlocked ||= hardHandling
    const entry = { ...part, role: record?.role || null, scope: record?.scope || null, practiceIds: record?.practiceIds || [], status: 'unreviewed', note: '' }
    const newer = record?.policyVersion >= 2
    const composed = record?.policyVersion >= 3
    const expanded = record?.policyVersion >= 4
    const compound = analyzeCompoundBoundary(part.text)
    // An exact named omission applies before a user labels the sentence.
    // Earlier confirmed meanings retain their old interpretation until review.
    const omissionText = !record || expanded ? omissionTextV4(part.text) : omissionTextV3(part.text)
    const partNamedOmissions = !hardHandling && (!record || composed) && !local.resolvedStatements.some(item => item.kind !== 'exclusion') ? omittedPracticesV2(omissionText) : []
    if ((!record || expanded) && !local.excluded.length && partlyNamedOmission(part.text)) pendingOmissions.push({
      clause: part.text, clarificationType: 'partial-practice-exclusion', clarifiable: false, allowedKinds: [],
      reason: 'One name matches a practice, but the complete exclusion does not. Use the practice names shown in the Knowledge map or edit this instruction.',
    })
    for (const id of partNamedOmissions) additionalExcluded.add(id)
    const rule = expanded ? value => productRuleV3(value) || Boolean(analyzeCompoundRequirement(value)) : composed ? productRuleV3 : newer ? productRuleV2 : productRule
    const history = expanded ? value => historyOnlyV2(value) || Boolean(analyzeCompoundHistory(value)) || Boolean(analyzeCompoundHistoryV4(value)) : composed ? value => historyOnlyV2(value) || Boolean(analyzeCompoundHistory(value)) : newer ? historyOnlyV2 : historyOnly
    const inference = composed ? value => inferenceOnlyV2(value) || compound?.scope === 'inference' : newer ? inferenceOnlyV2 : inferenceOnly
    const omission = newer ? value => plainOmission(expanded ? omissionTextV4(value) : composed ? omissionTextV3(value) : omissionTextV2(value)) : plainOmission
    let remove = false
    if (record) {
      entry.status = 'needs-review'
      entry.note = 'This wording still mixes meanings or has a limit Atlas cannot safely separate. Edit the original sentence.'
      const namedExclusion = local.excluded.length > 0 || partNamedOmissions.length > 0
      if (legacyConflict(record, local)) {
        entry.note = 'An earlier clarification uses this wording differently. Use Review these choices again before changing its meaning.'
        if (record.role === 'restriction') explicitPause = true
      } else if (record.role === 'task') {
        // Retaining the entire sentence lets every original exclusion and guard
        // run. Calling a sentence a task cannot make its negative words positive.
        entry.status = local.unresolvedNegation || namedExclusion || globalConflict ? 'needs-review' : 'applied'
        entry.note = entry.status === 'applied' ? 'Used as task wording for local matching.' : entry.note
      } else if (!globalConflict && !namedExclusion && !hardHandling && record.role === 'requirement' && rule(part.text)) {
        remove = true
        requirements.push({ kind: 'user-requirement', clause: part.text, field: part.field, index: part.index, userConfirmed: true, note: 'Recorded as a product rule to verify, not a request for a practice.' })
      } else if (!globalConflict && !namedExclusion && !hardHandling && record.role === 'context' && (history(part.text) || newer && noSoftwareV2(part.text) || !local.unresolvedNegation && !NEGATIVE.test(part.text) && !ACTIVE.test(part.text) && !/^(?:please\s+)?(?:add|build|fix|implement|maintain|create|keep|use|omit|exclude)\b/iu.test(part.text))) {
        remove = true
        if (newer && noSoftwareV2(part.text)) scopeExcluded.add('software-change')
      } else if (record.role === 'restriction') {
        if (record.scope === 'practices') for (const id of record.practiceIds) additionalExcluded.add(id)
        if (!globalConflict && record.scope === 'inference' && inference(part.text)) {
          remove = true
          assessmentBlocked = true
          boundaries.push({ clause: part.text, kind: 'inference', note: 'Local matching can continue. The optional JEV practice check is paused.' })
        } else if (!globalConflict && newer && record.scope === 'handling' && (inputHandlingV2(part.text) || composed && compound?.scope === 'handling')) {
          remove = true
          assessmentBlocked = true
          boundaries.push({ clause: part.text, kind: 'handling', note: 'Project input handling is limited. Local ideas can continue. The optional JEV practice check stays paused.' })
        } else if (!globalConflict && !namedExclusion && !hardHandling && record.scope === 'product' && rule(part.text)) {
          remove = true
          requirements.push({ kind: 'user-product-restriction', clause: part.text, field: part.field, index: part.index, userConfirmed: true, note: 'Recorded as a product limit to verify.' })
        } else if (!globalConflict && !hardHandling && record.scope === 'practices' && omission(part.text) && !TRANSFER.test((composed ? omissionTextV3(part.text) : part.text).replace(/^(?:please\s+)?leave\s+/iu, '')) && !HANDLING.test(part.text)) {
          remove = true
          for (const id of record.practiceIds) additionalExcluded.add(id)
          boundaries.push({ clause: part.text, kind: 'practices', practiceIds: record.practiceIds, note: 'These practices are kept out of new ideas. Already selected practices are unchanged.' })
        } else explicitPause = true
      }
      if (remove) {
        entry.status = 'applied'
        entry.note = record.role === 'context' ? 'Kept as background. It does not supply a task match.' : record.role === 'requirement' || record.scope === 'product' ? 'Kept as a product rule to verify. It does not supply a task match.' : 'Kept as a restriction with the scope you chose.'
      }
    }
    entry.quickActions = []
    if (!globalConflict && entry.status !== 'applied') {
      const offer = (id, label, role, scope = null, practiceIds = []) => {
        if (!legacyConflict({ role, scope, practiceIds }, local)) entry.quickActions.push({ id, label, role, scope, practiceIds })
      }
      if (!local.excluded.length && !hardHandling) {
        if (productRuleV3(part.text) || analyzeCompoundRequirement(part.text)) offer('requirement', 'Keep as a product rule', 'requirement')
        if (historyOnlyV2(part.text) || analyzeCompoundHistory(part.text) || analyzeCompoundHistoryV4(part.text)) offer('context', 'Keep as background', 'context')
        if (noSoftwareV2(part.text)) offer('no-software', 'Keep software changes out of scope', 'context')
      }
      if (inferenceOnlyV2(part.text) || compound?.scope === 'inference') offer('inference', 'Keep AI checks off', 'restriction', 'inference')
      if (inputHandlingV2(part.text) || compound?.scope === 'handling') offer('handling', 'Keep this input handling limit', 'restriction', 'handling')
      const practiceIds = !hardHandling ? omittedPracticesV2(omissionTextV4(part.text)) : []
      if (practiceIds.length) offer('practices', 'Keep these practices out', 'restriction', 'practices', practiceIds)
    }
    entry.needsClarification = Boolean(local.unresolvedNegation || entry.status === 'needs-review' || hardHandling && entry.status !== 'applied')
    // An explicit task choice answers only the supported deliverable question.
    // It cannot dismiss a handling boundary, named omission or source conflict.
    const decisionAnswered = intentDecision.present && decisionChoice && decisionParts.includes(part) && resolvedDecisionMarker(part.text) && !hardHandling && !local.excluded.length && !globalConflict
    if (!remove && !decisionAnswered) retained.push(part.text)
    parts.push(entry)
  }
  const namedExclusions = query.records().filter(item => item.type === 'topic' && item.definitionRefs.some(ref => ref.startsWith('practice:') && additionalExcluded.has(ref.slice('practice:'.length)))).map(item => ({ ref: item.ref, title: item.title, practiceRefs: item.definitionRefs.filter(ref => ref.startsWith('practice:') && additionalExcluded.has(ref.slice('practice:'.length))), reasons: [{ text: 'Left out by your text or recorded practice choices', matched: [] }] }))
  original.excluded = unique([...original.excluded, ...namedExclusions])
  if (pendingOmissions.length) {
    original.unresolved = unique([...original.unresolved, ...pendingOmissions])
    original.unresolvedNegation = true
  }
  if (!recorded.size && !(intentDecision.present && decisionChoice)) return { context: original, facts: { ...facts, contextResolutions: review.statements || [] }, parts, intentDecision, assessmentBlocked: original.unresolvedNegation || assessmentBlocked || intentDecision.pending, localRetrievalBlocked: original.unresolvedNegation || intentDecision.pending }
  const projectedFacts = { ...facts, brief: retained.join('\n'), contextResolutions }
  const context = query.proposalContext(projectedFacts)
  context.unresolved = context.unresolved.map(item => {
    const matching = typedQuestions.filter(question => question.clause === item.clause)
    if (!matching.length) return item
    const allowedKinds = (item.allowedKinds || []).filter(kind => matching.every(question => question.allowedKinds.includes(kind)))
    return { ...item, clarificationType: matching[0].clarificationType, reason: matching[0].reason, allowedKinds,
      minimumPolicyVersion: Math.max(item.minimumPolicyVersion || 1, ...matching.map(question => question.minimumPolicyVersion || 1)),
      clarifiable: Boolean(item.clarifiable && allowedKinds.length && matching.every(question => question.clarifiable)) }
  })
  // An original named exclusion and task-scope limit cannot be removed by a
  // different label. Explicit selections may only add exclusions.
  context.excluded = unique([...original.excluded, ...context.excluded])
  context.taskScopeExcludedKinds = [...new Set([...original.taskScopeExcludedKinds, ...context.taskScopeExcludedKinds, ...scopeExcluded])]
  context.requirements = unique([...context.requirements, ...requirements])
  context.boundaries = unique([...context.boundaries, ...boundaries])
  context.unresolvedNegation ||= explicitPause || globalConflict || inputExceptions.length > 0 || pendingOmissions.length > 0
  if (pendingOmissions.length) context.unresolved = unique([...context.unresolved, ...pendingOmissions])
  if (inputExceptions.length) context.unresolved = unique([...inputExceptions, ...context.unresolved])
  if (sourceConflict) context.unresolved = unique([...context.unresolved, sourceConflict])
  if ((explicitPause || globalConflict) && !context.unresolved.length) context.unresolved.push({ clause: facts.brief, reason: 'A restriction or competing instruction still needs clarification.', clarifiable: false, allowedKinds: [] })
  assessmentBlocked ||= context.unresolvedNegation || intentDecision.pending
  return { context, facts: projectedFacts, parts, intentDecision, assessmentBlocked, localRetrievalBlocked: context.unresolvedNegation || intentDecision.pending }
}
