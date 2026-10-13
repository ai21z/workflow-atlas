// A bounded local grammar for compatible boundaries. It does not execute or
// grant permission for any operation. Every accepted clause remains quoted in
// its complete source record. Unknown clauses keep the whole record unresolved.
const INPUT_WORD = /\b(?:goals?|briefs?|prompts?|descriptions?|requests?|inputs?|answers?|messages?|text|data|information|credentials?|secrets?|api\s+keys?|tokens?)\b/iu
const PROVIDER_WORD = /\b(?:jev|typesafe|llms?|models?|providers?|inference|ai)\b/iu
const BOUNDARY_WORD = /\b(?:not|never|no|nothing|none|neither|nor|only|inside|within|offline|local(?:ly)?|private|confidential|approved|don['’]t|cannot)\b/iu
const HANDLING_WORD = /\b(?:read|process(?:ed|ing)?|keep|kept|send|sent|share|shared|upload(?:ed)?|transmit(?:ted)?|store(?:d)?|sav(?:e|ed)|retain(?:ed)?|persist(?:ed)?|log(?:ged)?|publish(?:ed)?|eras(?:e|ed)|delet(?:e|ed))\b/iu
const UNSUPPORTED_JOIN = /[;?:]|\b(?:unless|except|provided|otherwise|instead|however|but|rather|whether|either|alternatively|because|since|while|which|then|also)\b/iu
const INPUT_OBJECT = /^(?:(?:the|this|our|your|recorded|submitted|supplied|source|project|original|current|user|existing|all|any|its|these)\s+){0,5}(?:goals?|briefs?|prompts?|descriptions?|requests?|inputs?|answers?|messages?|text|data|information)$/iu
const PROJECT_OBJECT = /^(?:any|every|all)\s+(?:part|portion|content)\s+of\s+(?:this|the|our)\s+(?:project|brief|request|description)$/iu
const ARTIFACT_OBJECT = /^(?:(?:the|this|our|these|those|generated|exported|project|resulting|current|maintained|incident|decision|living)\s+){1,5}(?:notebooks?|documents?|reports?|artifacts?|files?|notes|references?|packs?)$/iu
const PROVIDER_OBJECT = /^(?:(?:any|another|other|an|a|the|external|remote|hosted|approved|our|local|model|ai)\s+){0,5}(?:jev|typesafe|llms?|models?|providers?|services?)(?:\s+(?:providers?|services?|fallbacks?))?$/iu
const LOCATION = /^(?:(?:the|our|this|an|a|approved|local|team|current|designated|internal)\s+){1,6}(?:workstation|machine|device|environment|workspace|network)$/iu
const COPIES = /^(?:(?:a|the|these|those|any|all|temporary|local|working|remaining|source)\s+){0,4}(?:copy|copies|snippets?)$/iu
const PROVIDER_COPIES = /^(?:(?:a|the|any|all|another|external|hosted|remote|model|ai)\s+){0,4}provider\s+(?:copy|copies)$/iu
const RETENTION_END = /\s+(?:after\s+(?:(?:this|the|our|current)\s+)?(?:review|session)|when\s+(?:(?:this|the|our|current)\s+)?(?:session|review)\s+ends)$/iu
const stripEnding = value => value.trim().replace(/[.!]$/u, '').trim()
const objectList = (value, accepts) => value.split(/\s*,\s*(?:and\s+|or\s+)?|\s+(?:and|or)\s+/iu).every(item => accepts(item.trim()))
const inputObject = value => INPUT_OBJECT.test(value) || PROJECT_OBJECT.test(value)
const inputList = value => objectList(value, inputObject)
const providerList = value => objectList(value, item => PROVIDER_OBJECT.test(item))

function inputCopies(value, inputBound, accepts = COPIES) {
  const explicit = /^(.+?)\s+of\s+(.+)$/iu.exec(value)
  return explicit ? accepts.test(explicit[1]) && inputList(explicit[2]) : inputBound && accepts.test(value)
}

function copyBoundaryAtom(text, inputBound) {
  const timed = RETENTION_END.test(text)
  const retentionText = text.replace(RETENTION_END, '')
  const noCopies = /^(?:please\s+)?(?:retain|keep|store|save)\s+no\s+(.+)$/iu.exec(retentionText)
  if (noCopies && inputCopies(noCopies[1], inputBound, PROVIDER_COPIES)) return { scope: 'inference', inputBound: true }
  if (noCopies && inputCopies(noCopies[1], inputBound)) return { scope: 'handling', inputBound: true }
  const neverCopies = /^(?:please\s+)?(?:do\s+not|don['’]t|never)\s+(?:retain|keep|store|save|log)\s+(.+)$/iu.exec(retentionText)
  if (neverCopies && inputCopies(neverCopies[1], inputBound, PROVIDER_COPIES)) return { scope: 'inference', inputBound: true }
  if (neverCopies && inputCopies(neverCopies[1], inputBound)) return { scope: 'handling', inputBound: true }
  const eraseCopies = /^(?:please\s+)?(?:erase|delete|remove)\s+(.+)$/iu.exec(retentionText)
  if (timed && eraseCopies && inputCopies(eraseCopies[1], inputBound)) return { scope: 'handling', inputBound: true }
  return null
}

// Protection is deliberately broader than successful interpretation. A mixed
// or unrecognized boundary can still make an optional model check unavailable.
export function hasInputHandlingBoundary(text) {
  if (typeof text !== 'string') return false
  return BOUNDARY_WORD.test(text) && (PROVIDER_WORD.test(text) || INPUT_WORD.test(text) && HANDLING_WORD.test(text))
    || Boolean(copyBoundaryAtom(stripEnding(text), false))
}

function boundaryAtom(fragment, inputBound) {
  const text = stripEnding(fragment)
  if (!text || UNSUPPORTED_JOIN.test(text)) return null
  // Provider alternatives are objects of the same prohibition. Alternative
  // actions do not match these complete object grammars.
  const transfer = /^(?:please\s+)?(?:do\s+not|don['’]t|never|avoid)\s+(?:send|share|upload|transmit|submit|disclose|reveal)\s+(.+?)\s+to\s+(.+)$/iu.exec(text)
  if (transfer && inputList(transfer[1]) && providerList(transfer[2])) return { scope: 'inference', inputBound: true }
  const passiveTransfer = /^(.+?)\s+(?:must|shall|should|may|can)\s+(?:not|never)\s+be\s+(?:sent|shared|uploaded|transmitted|submitted|disclosed|revealed)\s+to\s+(.+)$/iu.exec(text)
  if (passiveTransfer && inputList(passiveTransfer[1]) && providerList(passiveTransfer[2])) return { scope: 'inference', inputBound: true }
  // Neither/nor is one negative transfer rule, not two alternative actions.
  // At least one object must name input before a document can share that ban.
  const neitherTransfer = /^neither\s+(.+?)\s+(?:must|shall|should|may|can)\s+be\s+(?:sent|shared|uploaded|transmitted|submitted|disclosed|revealed)\s+to\s+(.+)$/iu.exec(text)
  if (neitherTransfer) {
    const targets = neitherTransfer[1].split(/\s+nor\s+/iu)
    if (targets.length >= 2 && targets.length <= 4 && targets.some(inputObject)
      && targets.every(target => inputObject(target) || ARTIFACT_OBJECT.test(target)) && providerList(neitherTransfer[2])) return { scope: 'inference', inputBound: true }
  }
  const provider = /^(?:please\s+)?(?:do\s+not|don['’]t|never|avoid)\s+(?:use|call|invoke|consult)\s+(.+)$/iu.exec(text)
  if (provider && providerList(provider[1])) return { scope: 'inference', inputBound }
  // Failure clauses may qualify only a negative provider rule. They never
  // authorize fallback, and unrelated conditions or trailing commands fail.
  const noSwitch = /^(?:please\s+)?(?:do\s+not|don['’]t|never)\s+(?:switch|fall\s+back)\s+to\s+(.+?)(?:\s+(?:if|when)\s+(?:the|our|this)\s+(?:(?:first|primary|current|initial|local)\s+)?(?:one|provider|model|service|check|request|attempt)\s+(?:fails|times\s+out))?$/iu.exec(text)
  if (noSwitch && providerList(noSwitch[1])) return { scope: 'inference', inputBound }
  const noTrigger = /^(?:a|the|our|this)\s+(?:failed|unsuccessful)\s+(?:(?:local|first|primary|initial|current)\s+)?(?:check|validation|request|attempt)\s+(?:must|shall|should|may|can)\s+(?:never|not)\s+(?:trigger|start|initiate)\s+(.+?)\s+(?:call|request)$/iu.exec(text)
  if (noTrigger && providerList(noTrigger[1])) return { scope: 'inference', inputBound }

  const location = /^(?:please\s+)?(?:read|process|keep|store|save|retain)\s+(.+?)\s+(?:only\s+(?:on|in|inside|within)|inside|within)\s+(.+)$/iu.exec(text)
  if (location && inputList(location[1]) && LOCATION.test(location[2])) return { scope: 'handling', inputBound: true }
  const passiveLocation = /^(.+?)\s+(?:may|must|can|should)\s+(?:only\s+)?be\s+(?:read|processed|stored|saved|retained|logged)\s+only\s+(?:on|in|inside|within)\s+(.+)$/iu.exec(text)
  if (passiveLocation && inputList(passiveLocation[1]) && LOCATION.test(passiveLocation[2])) return { scope: 'handling', inputBound: true }

  // Copies refer to a previously recognized input or explicitly name that input.
  // Retention timing is attached to its rule, never interpreted as permission.
  return copyBoundaryAtom(text, inputBound)
}

// Try complete clauses before splitting "and", so coordinated input or provider
// objects remain intact. Only a full covering parse succeeds, with four clauses
// and eight potential joins at most. Fragments are exact source substrings.
function coveringConjunction(text, recognize) {
  if (typeof text !== 'string' || !text.trim() || text.length > 2000 || /[\u0000-\u001f]/u.test(text.replace(/[\r\n\t]/gu, ''))) return null
  const source = text.trim()
  const joins = [...source.matchAll(/,?\s+and\s+/giu)]
  if (joins.length > 8) return null
  const visit = (start, state, clauses, scopes) => {
    if (clauses.length >= 4) return null
    const ends = [{ end: source.length, next: source.length }, ...joins.filter(join => join.index >= start).reverse().map(join => ({ end: join.index, next: join.index + join[0].length }))]
    for (const { end, next } of ends) {
      const fragment = source.slice(start, end).trim()
      const atom = recognize(fragment, state)
      if (!atom) continue
      const nextClauses = [...clauses, fragment]
      const nextScopes = [...scopes, atom.scope]
      if (end === source.length) return { clauses: nextClauses, scopes: nextScopes }
      const result = visit(next, atom.inputBound, nextClauses, nextScopes)
      if (result) return result
    }
    return null
  }
  return visit(0, false, [], [])
}

export function analyzeCompoundBoundary(text) {
  const result = coveringConjunction(text, boundaryAtom)
  if (!result) return null
  return { scope: result.scopes.includes('handling') ? 'handling' : 'inference', clauses: result.clauses }
}

const HISTORY_ANCHOR = /^(?:(?:in|during)\s+)?(?:(?:an?|the|our)\s+)?(?:earlier|previous|old|initial|first|original|retired|superseded)\s+(?:release|version|prototype|implementation)\s*,?\s+/iu
const CURRENT_DIRECTION = /\b(?:must|shall|should|will|needs?|wants?|now|today|currently|if|when|until|avoid|please)\b/iu
const PAST_VERB = '(?:was|were|had|kept|lost|gave|took|wrote|read|ran|built|omitted|counted|showed|displayed|stored|saved|retained|logged|included|returned|failed|used|lacked|supported|calculated|processed|rendered|required|generated)'
const PAST_PREDICATE_SOURCE = `(?:never\\s+)?(?:(?:did(?:\\s+not)?|didn['’]t)\\s+[\\p{L}]+|${PAST_VERB})\\b(?:\\s+.+)?`
const PAST_PREDICATE = new RegExp(`^${PAST_PREDICATE_SOURCE}$`, 'iu')
const PAST_WITH_SUBJECT = new RegExp(`^(?:(?:the|our|its|this|that|a|an)\\s+[\\p{L}\\d'’()/-]+(?:\\s+[\\p{L}\\d'’()/-]+){0,8}|we|i|they|it)\\s+(${PAST_PREDICATE_SOURCE})$`, 'iu')

function historyAtom(fragment, historyBound) {
  const text = stripEnding(fragment)
  const anchor = HISTORY_ANCHOR.exec(text)
  if (!historyBound && !anchor || historyBound && anchor) return null
  const body = anchor ? text.slice(anchor[0].length) : text
  // No modal, new imperative, exception or second direction can inherit a past
  // tense merely because the preceding clause describes an earlier release.
  if (!body || /[,.!?;:]|\b(?:and|or)\b/iu.test(body) || UNSUPPORTED_JOIN.test(body) || CURRENT_DIRECTION.test(body) || hasInputHandlingBoundary(body)) return null
  if (historyBound && PAST_PREDICATE.test(body)) return { scope: 'context', inputBound: true }
  const subjectAndPredicate = PAST_WITH_SUBJECT.exec(body)
  return subjectAndPredicate && PAST_PREDICATE.test(subjectAndPredicate[1]) ? { scope: 'context', inputBound: true } : null
}

export function analyzeCompoundHistory(text) {
  const result = coveringConjunction(text, historyAtom)
  return result ? { clauses: result.clauses } : null
}

// Policy 4 extends the past setting to an explicitly historical component.
// Keep the older parser intact for previously confirmed source parts.
const HISTORICAL_COMPONENT = /^(?:the|our)\s+(?:original|earlier|previous|old|initial|first|retired|superseded)\s+[\p{L}\d-]+(?:\s+[\p{L}\d-]+){0,4}\s+$/iu
const PAST_VERB_V4 = '(?:checked|validated|rejected|accepted|dropped|ignored|skipped|preserved|copied|removed|started|stopped|opened|closed|reset|hid|sent|shared|uploaded)'
const PAST_PREDICATE_V4 = new RegExp(`^(?:${PAST_PREDICATE_SOURCE}|(?:never\\s+)?${PAST_VERB_V4}\\b(?:\\s+.+)?)$`, 'iu')
const PAST_SUBJECT_V4 = /^(?:(?:the|our|its|this|that|a|an)\s+[\p{L}\d'’()/-]+(?:\s+[\p{L}\d'’()/-]+){0,8}|we|i|they|it)\s+$/iu
function withPastSubject(text, accepts, historical = false) {
  for (const space of text.matchAll(/\s+/gu)) {
    const subject = text.slice(0, space.index + space[0].length)
    const predicate = text.slice(space.index + space[0].length)
    if ((historical ? HISTORICAL_COMPONENT : PAST_SUBJECT_V4).test(subject) && accepts(predicate)) return true
  }
  return false
}

function historyAtomV4(fragment, historyBound) {
  const text = stripEnding(fragment)
  if (!text || /[,;:!?]|\b(?:and|or)\b/iu.test(text.replace(HISTORY_ANCHOR, ''))
    || UNSUPPORTED_JOIN.test(text) || CURRENT_DIRECTION.test(text) || hasInputHandlingBoundary(text)) return null
  if (historyBound) {
    if (PAST_PREDICATE_V4.test(text)) return { scope: 'context', inputBound: true }
    return withPastSubject(text, value => PAST_PREDICATE_V4.test(value)) ? { scope: 'context', inputBound: true } : null
  }
  const setting = HISTORY_ANCHOR.exec(text)
  if (setting) {
    if (withPastSubject(text.slice(setting[0].length), value => PAST_PREDICATE_V4.test(value))) return { scope: 'context', inputBound: true }
  }
  // Try the bounded subject endings, not a greedy match that could swallow a
  // predicate or let a second command inherit the historical adjective.
  return withPastSubject(text, value => PAST_PREDICATE_V4.test(value), true) ? { scope: 'context', inputBound: true } : null
}

export function analyzeCompoundHistoryV4(text) {
  const result = coveringConjunction(text, historyAtomV4)
  if (result) return { clauses: result.clauses }
  if (typeof text !== 'string' || text.length > 2000) return null
  const clean = stripEnding(text)
  const setting = HISTORY_ANCHOR.exec(clean)
  if (!setting || UNSUPPORTED_JOIN.test(clean) || CURRENT_DIRECTION.test(clean) || hasInputHandlingBoundary(clean)) return null
  const pastChoice = predicate => {
    const choice = /^(?:chose|decided|opted)\s+not\s+to\s+(.+)$/iu.exec(predicate)
    if (!choice) return false
    const actions = choice[1].split(/\s+(?:and|or)\s+/iu)
    // The negation belongs to one historical decision. It cannot reach a new
    // command, modal or input boundary after a loosely matched conjunction.
    return actions.length <= 4 && actions.every(action => /^(?:implement|build|add|save|store|support|include|retain|keep|show|display|check|validate|copy|use|maintain)\s+[\p{L}\d'’/-]+(?:\s+[\p{L}\d'’/-]+){0,7}$/iu.test(action)
      && !/\b(?:not|never|no|without|must|shall|should|will|may|can|then|now|today|currently|please|that|which|atlas|practices?|agents?|instructions?|providers?|jev|typesafe)\b/iu.test(action))
  }
  return withPastSubject(clean.slice(setting[0].length), pastChoice) ? { clauses: [text.trim()] } : null
}

// Product outcomes can share a subject and modal. Each predicate still needs a
// complete recognized shape, so an appended command cannot become a rule.
const PRODUCT_SUBJECT = /^((?:the|a|an|each|every|its|our|this|these|those)\s+(?:[\p{L}\d-]+\s+){0,5}[\p{L}\d-]+)\s+(?:must|shall|should|needs?\s+to)\s+(.+)$/iu
const OUTCOME_OBJECT = /^(?:(?:the|a|an|its|their|current|original|selected|existing|new|same|own|source|copied|sort|accent|background|team)\s+){1,5}(?:title|name|label|identifier|id|status|state|position|value|values|selection|selections|assignee|assignees|owner|owners|assignment|assignments|date|dates|description|content|text|order|format|formatting|priority|permissions|tags|attachments|spinner|indicator|message|preview|field|checksum|colou?r)$/iu
const EMPTY_PROPERTY = /^(?:(?:any|an?|the|its|existing|previous|current|selected|assigned|copied|private)\s+){0,4}(?:assignees?|owners?|assignments?|attachments?|tags?|selections?|values?|dates?|permissions?|rows?)$/iu
const EMPTY_ACCESS = /^access\s+to\s+(?:(?:the|any|its|private|existing|selected|shared)\s+){0,4}(?:folders?|files?|records?|accounts?)$/iu
const PRODUCT_META = /\b(?:atlas|practices?|artifacts?|packs?|workflows?|assistants?|agents?|instructions?|scope|tasks?|jev|typesafe|ai|llms?|models?|providers?|inference|briefs?|prompts?|credentials?|secrets?|tokens?)\b/iu
function requirementAtom(fragment, subjectBound) {
  const text = stripEnding(fragment)
  if (!text || UNSUPPORTED_JOIN.test(text) || PRODUCT_META.test(text) || hasInputHandlingBoundary(text)
    || /[,;:!?]|\b(?:or|if|when|until|before|after|then|now|today|currently)\b/iu.test(text)) return null
  const subject = PRODUCT_SUBJECT.exec(text)
  if (subject && /\b(?:not|never|no|without|that|which|who|create|build|delete|send|use|call)\b/iu.test(subject[1])) return null
  const predicate = subject ? subject[2] : subjectBound ? text.replace(/^(?:must|shall|should|needs?\s+to)\s+/iu, '') : ''
  const keep = /^(?:keep|retain|preserve|copy|include|show|display|clear|hide|reset|refresh)\s+(.+)$/iu.exec(predicate)
  const empty = /^(?:start|open|begin|remain)\s+(?:without|with\s+no)\s+(.+)$/iu.exec(predicate)
  if (keep && OUTCOME_OBJECT.test(keep[1]) || empty && (EMPTY_PROPERTY.test(empty[1]) || EMPTY_ACCESS.test(empty[1]))) return { scope: 'requirement', inputBound: true }
  return null
}

export function analyzeCompoundRequirement(text) {
  const result = coveringConjunction(text, requirementAtom)
  return result ? { clauses: result.clauses } : null
}

// An exception is not permission. This guard uses the intact source even when
// a user labels it as background. Fully understood negative boundaries keep
// their existing behavior, including a ban on fallback after provider failure.
export function hasUnresolvedInputException(text, recognizedLimit = false) {
  if (typeof text !== 'string' || analyzeCompoundBoundary(text)) return false
  const locationException = /^(?:please\s+)?(?:keep|store|retain|process|read)\s+(?:every|all|any)\s+(?:project\s+)?(?:documents?|files?|inputs?|answers?|data|information|text)\s+(?:only\s+)?(?:on|in|inside|within)\s+(.+?)\s+(?:unless|except|provided|but|if|when)\b/iu.exec(text)
  const ambiguousLocation = Boolean(locationException && LOCATION.test(locationException[1]))
  if (!recognizedLimit && !hasInputHandlingBoundary(text) && !ambiguousLocation) return false
  // A product input field is not the description submitted to Atlas. Provider
  // references or a separately named project source still keep the guard active.
  if (/\b(?:input|text|message|description)\s+(?:field|box|control|widget)\b/iu.test(text)
    && !PROVIDER_WORD.test(text) && !/\b(?:brief|prompt|project\s+inputs?|recorded\s+answers?|source\s+inputs?)\b/iu.test(text)) return false
  return /\b(?:unless|except|provided|otherwise|but|however|if|when|only\s+with|subject\s+to)\b/iu.test(text)
}
