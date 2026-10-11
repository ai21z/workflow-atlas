// Apply tools/catalogue-vocabulary.json to the catalogue sources. Idempotent: a second run changes nothing.
// It fills catalog.evidence, catalog.scope and catalog.applies on topics, category on technology names, and example-of
// relationships. It never overwrites a value that is already present and different, it reports it instead.
import { readFile, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const repository = fileURLToPath(new URL('../', import.meta.url))
const write = (file, value) => writeFile(file, JSON.stringify(value, null, 2) + '\n')

export async function backfillVocabulary({ rootDir = repository, dryRun = false } = {}) {
  const table = JSON.parse(await readFile(path.join(rootDir, 'tools', 'catalogue-vocabulary.json'), 'utf8'))
  const base = path.join(rootDir, 'catalogue')
  const report = { changed: [], skipped: [], unmapped: [] }
  const keep = (where, field, current, wanted) => {
    if (current === undefined) return true
    if (JSON.stringify(current) !== JSON.stringify(wanted)) report.skipped.push(`${where} ${field} already set to a different value`)
    return false
  }
  for (const name of (await readdir(path.join(base, 'knowledge'))).sort()) {
    const file = path.join(base, 'knowledge', name)
    const topic = JSON.parse(await readFile(file, 'utf8'))
    let touched = false
    const kinds = table.basisKinds[topic.basis]
    const level = table.confidenceLevel[topic.confidence]
    if (!kinds) report.unmapped.push(`${topic.id} basis: ${topic.basis}`)
    if (!level) report.unmapped.push(`${topic.id} confidence: ${topic.confidence}`)
    if (kinds && level) {
      const evidence = { basisKinds: kinds, confidenceLevel: level }
      if (keep(topic.id, 'evidence', topic.catalog.evidence, evidence)) { topic.catalog.evidence = evidence; touched = true }
    }
    const scope = table.scope[topic.id]
    if (scope && keep(topic.id, 'scope', topic.catalog.scope, scope)) { topic.catalog.scope = scope; touched = true }
    const applies = table.applies[topic.id]
    if (applies && keep(topic.id, 'applies', topic.catalog.applies, applies)) { topic.catalog.applies = applies; touched = true }
    if (touched) { report.changed.push(`topic ${topic.id}`); if (!dryRun) await write(file, topic) }
  }
  const definitionsFile = path.join(base, 'definitions.json')
  const definitions = JSON.parse(await readFile(definitionsFile, 'utf8'))
  let definitionsTouched = false
  for (const record of definitions) {
    if (record.type !== 'technology') continue
    const category = table.technologyCategory[record.id]
    if (!category) { report.unmapped.push(`technology ${record.id} has no category`); continue }
    if (keep(`technology ${record.id}`, 'category', record.category, category)) { record.category = category; definitionsTouched = true; report.changed.push(`technology ${record.id}`) }
  }
  if (definitionsTouched && !dryRun) await write(definitionsFile, definitions)
  const relationsFile = path.join(base, 'relations.json')
  const relations = JSON.parse(await readFile(relationsFile, 'utf8'))
  let relationsTouched = false
  for (const [example, general] of Object.entries(table.exampleOf)) {
    const from = `topic:${example}`
    const to = `topic:${general}`
    if (relations.some(item => item.from === from && item.type === 'example-of')) { if (!relations.some(item => item.from === from && item.type === 'example-of' && item.to === to)) report.skipped.push(`${from} example-of points elsewhere`); continue }
    relations.push({ from, type: 'example-of', to, sourceRefs: [] })
    relationsTouched = true
    report.changed.push(`${from} example-of ${to}`)
  }
  if (relationsTouched && !dryRun) await write(relationsFile, relations)
  return report
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const dryRun = process.argv.includes('--dry-run')
    if (process.argv.slice(2).some(arg => arg !== '--dry-run')) throw new Error('Usage: node tools/backfill-catalogue-vocabulary.mjs [--dry-run]')
    const report = await backfillVocabulary({ dryRun })
    console.log(`${report.changed.length} records ${dryRun ? 'would change' : 'changed'}, ${report.skipped.length} kept their existing value, ${report.unmapped.length} unmapped.`)
    for (const line of [...report.skipped, ...report.unmapped]) console.log(`  ${line}`)
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
