import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = fileURLToPath(new URL('../', import.meta.url))
const files = ['docs/content.js', 'docs/jev/content.js']
const before = await Promise.all(files.map(file => readFile(path.join(root, file))))
const build = spawnSync(process.execPath, ['tools/build-docs-guide.mjs'], { cwd: root, stdio: 'inherit' })
if (build.error) throw build.error
if (build.status !== 0) process.exit(build.status || 1)
const after = await Promise.all(files.map(file => readFile(path.join(root, file))))
if (before.some((bytes, index) => !bytes.equals(after[index]))) {
  console.error('Documentation readers were stale and have been rebuilt. Review and commit docs/content.js and docs/jev/content.js.')
  process.exitCode = 1
} else console.log('Documentation readers match their sources.')
