// Query the knowledge graph from the command line. Reads the reader projection in atlas/data.js and prints JSON.
// Usage:
//   node tools/atlas-query.mjs search <terms...> [--limit N] [--type topic|practice|technology|stage|...]
//   node tools/atlas-query.mjs get <id or type:id>
//   node tools/atlas-query.mjs neighbors <type:id> [--edge TYPE]
//   node tools/atlas-query.mjs propose --brief "<text>" [--technology ID]... [--stage ID]... [--recipe ID] [--host ID] [--limit N]
// Results are catalogue text and a deterministic trace. They are not a review of any source and they grant nothing.
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createKnowledgeQuery } from '../factory/knowledge-query.mjs'

const repository = fileURLToPath(new URL('../', import.meta.url))

export async function loadProjection(rootDir = repository) {
  const text = await readFile(path.join(rootDir, 'atlas', 'data.js'), 'utf8')
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end < 0) throw new Error('atlas/data.js does not contain the reader projection. Run npm run build:catalogue.')
  return JSON.parse(text.slice(start, end + 1))
}

export function parseArguments(argv) {
  const [command, ...rest] = argv
  const accepted = {
    search: new Set(['limit', 'type']),
    get: new Set(),
    neighbors: new Set(['edge', 'limit']),
    propose: new Set(['brief', 'technology', 'stage', 'recipe', 'host', 'limit']),
  }
  if (!Object.hasOwn(accepted, command)) throw new Error('Usage: node tools/atlas-query.mjs search|get|neighbors|propose ...')
  const options = { positional: [], technology: [], stage: [] }
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index]
    if (!item.startsWith('--')) { options.positional.push(item); continue }
    const key = item.slice(2)
    if (!accepted[command].has(key)) throw new Error(`Unknown option --${key} for ${command}.`)
    const value = rest[index + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`Option --${key} needs a value.`)
    index += 1
    if (key === 'technology' || key === 'stage') options[key].push(value)
    else if (key === 'limit') { options.limit = Number(value); if (!Number.isInteger(options.limit) || options.limit < 1 || options.limit > 50) throw new Error('--limit must be a whole number from 1 to 50.') }
    else if (['brief', 'recipe', 'host', 'type', 'edge'].includes(key)) options[key] = value
    else throw new Error(`Unknown option --${key}.`)
  }
  return { command, options }
}

export async function run(argv, { rootDir = repository } = {}) {
  const { command, options } = parseArguments(argv)
  const query = createKnowledgeQuery(await loadProjection(rootDir))
  switch (command) {
    case 'search': {
      if (!options.positional.length) throw new Error('search needs at least one term.')
      if (options.type && !query.records().some(record => record.type === options.type)) throw new Error(`Unknown type: ${options.type}`)
      return { command, query: options.positional.join(' '), results: query.search(options.positional.join(' '), { limit: options.limit || 10, types: options.type ? [options.type] : null }) }
    }
    case 'get': {
      if (options.positional.length !== 1) throw new Error('get needs exactly one id.')
      const record = query.get(options.positional[0])
      if (!record) throw new Error(`Unknown id: ${options.positional[0]}`)
      return { command, record }
    }
    case 'neighbors': {
      if (options.positional.length !== 1) throw new Error('neighbors needs exactly one type:id reference.')
      if (!query.get(options.positional[0])) throw new Error(`Unknown reference: ${options.positional[0]}`)
      const record = query.get(options.positional[0])
      return { command, ref: record.ref, neighbors: query.neighbors(record.ref, { types: options.edge ? [options.edge] : null, limit: options.limit || 200 }) }
    }
    case 'propose': {
      if (options.positional.length) throw new Error('propose accepts options, not positional terms. Use --brief for text.')
      if (!options.brief && !options.technology.length && !options.stage.length && !options.recipe && !options.host) throw new Error('propose needs --brief or at least one project fact.')
      for (const ref of [...options.technology.map(id => `technology:${id}`), ...options.stage.map(id => `stage:${id}`), ...(options.recipe ? [`recipe:${options.recipe}`] : []), ...(options.host ? [`host:${options.host}`] : [])]) if (!query.get(ref)) throw new Error(`Unknown project fact: ${ref}`)
      const input = { brief: options.brief || '', technologies: options.technology, ...(options.stage.length ? { stages: options.stage } : {}), recipe: options.recipe || null, host: options.host || null }
      return { command, input, results: query.propose({ ...input, limit: options.limit || 5 }), constraints: query.proposalContext(input), note: 'Deterministic catalogue retrieval. No model was consulted. Explicit exclusions use limited lexical rules. Source lines report recorded review status, not correctness.' }
    }
    default:
      throw new Error('Usage: node tools/atlas-query.mjs search|get|neighbors|propose ...')
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    const result = await run(process.argv.slice(2))
    console.log(JSON.stringify(result, null, 2))
  } catch (error) { console.error(error.message); process.exitCode = 1 }
}
