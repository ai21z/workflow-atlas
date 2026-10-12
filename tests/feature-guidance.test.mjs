import test from 'node:test'
import assert from 'node:assert/strict'
import { readCatalogue, compileCatalogue } from '../tools/build-catalogue.mjs'
import { createKnowledgeQuery } from '../factory/knowledge-query.mjs'

const data = await readCatalogue()
const query = createKnowledgeQuery(compileCatalogue(data).atlas)
const stackGuides = ['react', 'javascript-typescript', 'npm', 'vitest', 'playwright']

test('generic delivery stages do not imply the reference feature stack', () => {
  for (const technologies of [[], ['python']]) {
    const proposals = query.propose({ technologies, stages: ['implementation', 'verification'], recipe: 'feature-delivery', limit: 50 })
    for (const id of stackGuides) assert.ok(!proposals.some(result => result.id === id), `${id} was not a recorded technology or requested in text`)
    assert.ok(proposals.some(result => result.id === 'user-facing-feature'), 'the neutral procedure still applies')
  }
})

test('explicit reference technologies connect to their useful guides while claims remain scoped', () => {
  for (const [technology, topic] of [['react', 'react'], ['typescript', 'javascript-typescript'], ['javascript', 'javascript-typescript'], ['npm', 'npm'], ['vitest', 'vitest'], ['playwright', 'playwright']]) {
    const proposed = query.propose({ technologies: [technology], limit: 50 })
    const guidance = proposed.find(result => result.id === topic)
    assert.ok(guidance, `${technology} reaches its guide`)
    assert.equal(guidance.confirmation, 'not checked')
    assert.ok(guidance.graphReasons.some(reason => reason.includes('technology ')))
    const record = query.get(`topic:${topic}`)
    assert.ok(record.claims.length, 'reviewed facts have scoped claims')
    assert.ok(record.sections.some(section => section.label === 'Useful result'))
    assert.ok(record.sections.some(section => section.label === 'What Atlas changes'))
  }
})

test('language, package and browser questions are findable through ordinary user terms', () => {
  for (const [words, expected] of [['type assertion', 'javascript-typescript'], ['npm ci', 'npm'], ['simulated DOM vitest', 'vitest'], ['browser journey playwright', 'playwright'], ['loading empty error', 'user-facing-feature']]) {
    assert.ok(query.search(words, { limit: 5 }).some(result => result.id === expected), `${words} finds ${expected}`)
  }
})
