// Shared questions and unchanged practices retain their exact v8 definitions.
// Only the separately versioned minimum-change profile changes in this revision.
import { FROZEN_DEFINITIONS as V8_DEFINITIONS } from './jev-definitions-v8.mjs'
import { MINIMUM_CHANGE_VERSION, MINIMUM_CHANGE_QUESTIONS } from './jev-minimum-change-v9.mjs'

function deepFreeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') deepFreeze(child)
  return Object.freeze(value)
}

export const SHARED_DEFINITION_VERSION = 'v8-frozen-catalog-2.0.1'
export const PRACTICE_DEFINITION_VERSIONS = Object.freeze({
  'specification-first': 'v8-practice-need-separate-from-completeness',
  'minimum-change': MINIMUM_CHANGE_VERSION,
  'evidence-wiki': 'v8-practice-need-separate-from-completeness',
})
export const DEFINITION_DIGEST = '7946f8cc387008833b8a5b58f94714805ea4813bfa8b160d05df45edd86b7f0e'
export const FROZEN_DEFINITIONS = deepFreeze({
  ...V8_DEFINITIONS,
  promptVersion: 'pilot-v9-minimum-change-concrete-work',
  practiceQuestions: {
    ...V8_DEFINITIONS.practiceQuestions,
    'minimum-change': MINIMUM_CHANGE_QUESTIONS,
  },
})
