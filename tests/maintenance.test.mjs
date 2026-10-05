import test from 'node:test'
import assert from 'node:assert/strict'
import { extractProjectFacts, parseFileBundle, compareFiles, reviewOpenedFiles, resolveComparison } from '../factory/maintenance.mjs'

const file = (path, content) => ({ path, content })

test('package import reads supplied declarations and exact scripts as reviewable candidates', () => {
  const report = extractProjectFacts('apps/web/package.json', JSON.stringify({ name: 'web', dependencies: { react: '^19.0.0' }, devDependencies: { typescript: '~5.9.0' }, scripts: { test: 'vitest run', build: 'vite build' } }))
  assert.deepEqual(report.components[0], { name: 'web', path: 'apps/web', technologies: [{ id: 'react', version: '^19.0.0' }, { id: 'typescript', version: '~5.9.0' }], commands: { test: 'vitest run', build: 'vite build', lint: '' } })
  assert.ok(report.facts.every(fact => fact.status === 'detected' && fact.source === 'apps/web/package.json' && !fact.reviewer))
  assert.match(report.warnings.join('\n'), /Lockfiles.*not checked/)
  assert.match(report.warnings.join('\n'), /exact script bodies/)
})

test('Maven import leaves execution commands unresolved and records declaration limits', () => {
  const report = extractProjectFacts('pom.xml', '<project><parent><artifactId>spring-boot-starter-parent</artifactId><version>4.0.0</version></parent><artifactId>api</artifactId><properties><java.version>21</java.version></properties></project>')
  assert.equal(report.components[0].name, 'api')
  assert.deepEqual(report.components[0].commands, { test: '', lint: '', build: '' })
  assert.deepEqual(report.components[0].technologies, [{ id: 'java', version: '21' }, { id: 'spring-boot', version: '4.0.0' }])
  assert.match(report.facts[0].notes, /inheritance.*not evaluated/)
})

test('Maven candidates come from direct declarations rather than comments or inactive profiles', () => {
  const report = extractProjectFacts('pom.xml', `<?xml version="1.0"?><project xmlns="http://maven.apache.org/POM/4.0.0">
    <!-- Historical <artifactId>old-api</artifactId><properties><java.version>8</java.version><spring-boot.version>1.5.0</spring-boot.version></properties> -->
    <profiles><profile><id>legacy</id><properties><java.version>11</java.version><spring-boot.version>2.0.0</spring-boot.version></properties></profile></profiles>
    <dependencies><dependency><artifactId>dependency-name</artifactId></dependency></dependencies>
    <artifactId>current-api</artifactId><properties><java.version>21</java.version><spring-boot.version>3.4.0</spring-boot.version></properties>
  </project>`)
  assert.equal(report.components[0].name, 'current-api')
  assert.deepEqual(report.components[0].technologies, [{ id: 'java', version: '21' }, { id: 'spring-boot', version: '3.4.0' }])
  assert.ok(!report.facts.some(fact => /old-api|version declared: 1.5|property declared: 8/.test(fact.claim)))
  const nestedOnly = extractProjectFacts('pom.xml', '<project><dependencies><dependency><artifactId>dependency</artifactId></dependency></dependencies><profiles><profile><properties><java.version>8</java.version></properties></profile></profiles></project>')
  assert.equal(nestedOnly.components[0].name, 'Imported Maven component')
  assert.deepEqual(nestedOnly.components[0].technologies, [])
  for (const xml of ['<project><properties></project>', '<project><!-- unclosed </project>', '<project></project><project></project>']) assert.throws(() => extractProjectFacts('pom.xml', xml))
})

test('report assertions are retained as notes without silently confirming them', () => {
  const report = extractProjectFacts('scan.json', JSON.stringify({ facts: [{ claim: 'Tests pass', status: 'confirmed', reviewer: 'Owner', source: 'CI/run/42', revision: 'abc123' }] }))
  assert.equal(report.facts[0].status, 'inferred')
  assert.equal(report.facts[0].reviewer, '')
  assert.equal(report.facts[0].source, 'CI/run/42')
  assert.match(report.facts[0].notes, /Report status: confirmed/)
  assert.match(report.facts[0].notes, /Report reviewer: Owner/)
})

test('import fails before producing candidates for malformed, unsupported or unsafe files', () => {
  for (const [name, text] of [['../package.json', '{}'], ['package.json', '{'], ['package.json', '{"scripts":[]}'], ['pom.xml', '<!DOCTYPE project><project></project>'], ['readme.md', '# text'], ['report.json', '{"facts":[{"claim":"x","unknown":1}]}'], ['report.json', '{"facts":[{"claim":"x","source":{}}]}']]) assert.throws(() => extractProjectFacts(name, text), name)
  assert.throws(() => extractProjectFacts('package.json', ' '.repeat(2_000_001)), /shorter/)
  assert.throws(() => extractProjectFacts('report.json', JSON.stringify({ facts: [{ claim: '界'.repeat(700000) }] })), /2 MB/)
})

test('no guessed commands are added to a package without scripts', () => {
  const report = extractProjectFacts('package.json', '{"name":"simple"}')
  assert.deepEqual(report.components[0].commands, { test: '', lint: '', build: '' })
})

test('candidate text respects saved draft boundaries before it can be accepted', () => {
  for (const report of [
    { facts: [{ claim: 'x', revision: 'a'.repeat(201) }] },
    { facts: [{ claim: 'x', notes: 'a'.repeat(20000) }] },
    { facts: [{ claim: 'x\u0000' }] },
    { components: [{ name: 'x', path: 'a'.repeat(201), technologies: [], commands: {} }] }
  ]) assert.throws(() => extractProjectFacts('facts.json', JSON.stringify(report)))
  assert.throws(() => extractProjectFacts('package.json', JSON.stringify({ name: 'a\u0000' })), /control characters/)
  assert.throws(() => extractProjectFacts('pom.xml', `<project><artifactId>${'a'.repeat(201)}</artifactId></project>`), /Component name/)
})

test('local changes are preserved when regeneration leaves the original unchanged', () => {
  const rows = compareFiles([file('SKILL.md', 'original')], [file('SKILL.md', 'my changes')], [file('SKILL.md', 'original')])
  assert.equal(rows[0].status, 'local-edit')
  assert.deepEqual(resolveComparison(rows), [file('SKILL.md', 'my changes')])
})

test('conflicting changes require an explicit content choice before export', () => {
  const rows = compareFiles([file('SKILL.md', 'original')], [file('SKILL.md', 'local')], [file('SKILL.md', 'new template')])
  assert.equal(rows[0].status, 'conflict')
  assert.throws(() => resolveComparison(rows), /Resolve the conflict/)
  assert.deepEqual(resolveComparison(rows, { 'SKILL.md': 'existing' }), [file('SKILL.md', 'local')])
  assert.deepEqual(resolveComparison(rows, { 'SKILL.md': 'generated' }), [file('SKILL.md', 'new template')])
})

test('addition, removal and local-only files are represented without silent loss', () => {
  const rows = compareFiles([file('old.md', 'old')], [file('old.md', 'old'), file('notes.md', 'mine')], [file('new.md', 'new')])
  assert.deepEqual(rows.map(row => [row.path, row.status]), [['new.md', 'added'], ['notes.md', 'local-added'], ['old.md', 'removed']])
  assert.deepEqual(resolveComparison(rows), [file('new.md', 'new'), file('notes.md', 'mine')])
})

test('deletion versus regeneration conflicts instead of recreating user-deleted files', () => {
  const rows = compareFiles([file('a.md', 'old')], [], [file('a.md', 'changed')])
  assert.equal(rows[0].status, 'conflict')
  assert.deepEqual(resolveComparison(rows, { 'a.md': 'remove' }), [])
})

test('local deletions and identical independent edits have safe defaults', () => {
  const removed = compareFiles([file('a.md', 'old')], [], [file('a.md', 'old')])
  assert.equal(removed[0].status, 'local-removed')
  assert.deepEqual(resolveComparison(removed), [])
  const identical = compareFiles([file('a.md', 'old')], [file('a.md', 'same')], [file('a.md', 'same')])
  assert.equal(identical[0].status, 'unchanged')
})

test('without a baseline overlapping unequal files require review', () => {
  const rows = compareFiles([], [file('a.md', 'existing')], [file('a.md', 'generated')])
  assert.equal(rows[0].status, 'conflict')
  assert.throws(() => resolveComparison(rows))
})

test('snapshot parser preserves Unicode and rejects unsafe and colliding paths', () => {
  assert.deepEqual(parseFileBundle(JSON.stringify({ kind: 'atlas-files', files: [file('notes.md', 'Ελληνικά 😀')] })), [file('notes.md', 'Ελληνικά 😀')])
  for (const files of [[file('../outside', 'x')], [file('a.md', 'a'), file('A.md', 'b')], [file('a', 'x'), file('a/b', 'y')], [{ path: 'a.md', content: 42 }]]) assert.throws(() => parseFileBundle(JSON.stringify(files)))
  assert.equal(compareFiles([], [file('A.md', 'a')], [file('a.md', 'b')])[0].status, 'conflict')
})

test('case and Unicode path aliases across generations share one comparison without losing selected names', () => {
  const rows = compareFiles([file('project.json', 'baseline')], [file('PROJECT.JSON', 'local edit')], [file('project.json', 'new generation')])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].status, 'conflict')
  assert.throws(() => resolveComparison(rows), /Resolve the conflict/)
  assert.deepEqual(resolveComparison(rows, { 'project.json': 'existing' }), [file('PROJECT.JSON', 'local edit')])
  assert.deepEqual(resolveComparison(rows, { 'project.json': 'generated' }), [file('project.json', 'new generation')])
  const unicode = compareFiles([file('notes/café.md', 'base')], [file('notes/cafe\u0301.md', 'local')], [file('notes/café.md', 'base')])
  assert.equal(unicode[0].status, 'local-edit')
  assert.deepEqual(resolveComparison(unicode), [file('notes/cafe\u0301.md', 'local')])
  assert.throws(() => compareFiles([], [file('A.md', 'a'), file('a.md', 'b')], []), /duplicates/)
  assert.throws(() => compareFiles([], [file('parent', 'file')], [file('PARENT/child.md', 'child')]), /parent directory/)
})

test('a snapshot larger than 2 MB round trips through comparison and resolution', () => {
  const baseline = [file('large.md', '界'.repeat(800000))]
  const existing = [file('large.md', `${baseline[0].content}\nLocal changes`)]
  const parsed = parseFileBundle(JSON.stringify({ kind: 'atlas-files', schemaVersion: 1, files: existing }))
  assert.deepEqual(parsed, existing)
  const rows = compareFiles(baseline, parsed, baseline)
  assert.equal(rows[0].status, 'local-edit')
  assert.deepEqual(parseFileBundle(JSON.stringify({ files: resolveComparison(rows) })), existing)
})

test('snapshots accept 8 MiB artifacts and reject a single artifact exceeding the UTF8 limit', () => {
  const limit = 8 * 1024 * 1024
  const files = [file('boundary.md', 'x'.repeat(limit))]
  assert.deepEqual(parseFileBundle(JSON.stringify(files)), files)
  const oversized = [file('oversized.md', '界'.repeat(Math.floor(limit / 3) + 1))]
  assert.throws(() => parseFileBundle(JSON.stringify(oversized)), /artifact.*8 MiB/)
  assert.throws(() => compareFiles([], oversized, []), /artifact.*8 MiB/)
  assert.throws(() => resolveComparison([{ path: 'oversized.md', existing: oversized[0].content, resolution: 'existing' }]), /artifact.*8 MiB/)
})

test('snapshots enforce the 32 MiB aggregate limit independently of each artifact', () => {
  const content = 'x'.repeat(8 * 1024 * 1024)
  const files = Array.from({ length: 4 }, (_, index) => file(`part-${index}.md`, content))
  assert.deepEqual(resolveComparison(compareFiles([], [], files)), files)
  const oversized = [...files, file('extra.md', 'x')]
  assert.throws(() => parseFileBundle(JSON.stringify(oversized)), /32 MiB.*combined/)
  assert.throws(() => compareFiles([], oversized, []), /32 MiB.*combined/)
  assert.throws(() => resolveComparison(oversized.map(entry => ({ path: entry.path, existing: entry.content, resolution: 'existing' }))), /32 MiB.*combined/)
})

test('snapshots permit 4096 files and reject larger file sets', () => {
  const files = Array.from({ length: 4096 }, (_, index) => file(`part-${index}.md`, 'x'))
  assert.deepEqual(parseFileBundle(JSON.stringify(files)), files)
  assert.throws(() => parseFileBundle(JSON.stringify([...files, file('extra.md', 'x')])), /4096 text files/)
})

test('snapshot JSON envelopes are bounded separately from decoded content', () => {
  assert.throws(() => parseFileBundle(`${' '.repeat(64 * 1024 * 1024)}[]`), /Snapshot JSON.*64 MiB/)
})

test('comparison never mutates inputs and handles an empty file as real content', () => {
  const baseline = [file('empty.md', '')]
  const existing = [file('empty.md', '')]
  const generated = [file('empty.md', 'new')]
  const before = JSON.stringify([baseline, existing, generated])
  assert.deepEqual(resolveComparison(compareFiles(baseline, existing, generated)), generated)
  assert.equal(JSON.stringify([baseline, existing, generated]), before)
})

test('reopened generated files classify later Brief changes as session updates without an edit warning', () => {
  const opened = [file('WORKFLOW.md', 'Original brief'), file('templates/REQUIREMENTS.md', '[UNRESOLVED]')]
  const current = [file('WORKFLOW.md', 'Acceptance: keep the supplied text'), file('templates/REQUIREMENTS.md', 'keep the supplied text'), file('DECISION-REVIEW.md', 'Recorded Brief changes')]
  const review = reviewOpenedFiles(opened, opened, current)
  assert.equal(review.referenceAvailable, true)
  assert.equal(review.sessionUpdates.length, 3)
  assert.equal(review.reviewRequired.length, 0)
  assert.deepEqual(review.sessionUpdates.map(row => [row.path, row.change]), [['DECISION-REVIEW.md', 'added'], ['WORKFLOW.md', 'changed'], ['templates/REQUIREMENTS.md', 'changed']])
  assert.ok(review.sessionUpdates.every(row => row.differedOnOpen === false && row.generationChanged === true))
  assert.throws(() => resolveComparison(review.rows), /Resolve the conflict/, 'Classification must not act as an implicit resolution')
})

test('differences already present on open remain reviewable before and after project changes', () => {
  const reference = [file('WORKFLOW.md', 'Generated brief'), file('templates/REQUIREMENTS.md', 'Original acceptance')]
  const opened = [file('WORKFLOW.md', 'Local instructions'), file('templates/REQUIREMENTS.md', 'Original acceptance')]
  const untouched = reviewOpenedFiles(opened, reference, reference)
  assert.deepEqual(untouched.reviewRequired.map(row => [row.path, row.status]), [['WORKFLOW.md', 'opened-difference']])
  const changed = reviewOpenedFiles(opened, reference, [file('WORKFLOW.md', 'New generated brief'), file('templates/REQUIREMENTS.md', 'New acceptance')])
  assert.deepEqual(changed.reviewRequired.map(row => [row.path, row.status]), [['WORKFLOW.md', 'mixed-difference']])
  assert.deepEqual(changed.sessionUpdates.map(row => row.path), ['templates/REQUIREMENTS.md'])
  assert.equal(changed.reviewRequired[0].opened, 'Local instructions')
  assert.equal(changed.reviewRequired[0].generatedAtOpen, 'Generated brief')
  assert.equal(changed.reviewRequired[0].generated, 'New generated brief')
})

test('unknown generation history does not label supplied differences as ordinary session changes', () => {
  const opened = [file('notes.md', 'Kept content'), file('same.md', '')]
  const generated = [file('notes.md', 'Replacement'), file('same.md', ''), file('new.md', 'New content')]
  const review = reviewOpenedFiles(opened, null, generated)
  assert.equal(review.referenceAvailable, false)
  assert.equal(review.sessionUpdates.length, 0)
  assert.deepEqual(review.reviewRequired.map(row => [row.path, row.status, row.differedOnOpen]), [['new.md', 'unknown-origin', null], ['notes.md', 'unknown-origin', null]])
  assert.deepEqual(review.unchanged.map(row => row.path), ['same.md'])
  assert.ok(review.reviewRequired.every(row => row.generatedAtOpen === null && row.generationChanged === null))
})

test('missing supplied files and supplied additions are preserved as differences of unknown cause', () => {
  const generated = [file('expected.md', 'Expected')]
  const opened = [file('notes.md', 'Supplied notes')]
  const review = reviewOpenedFiles(opened, generated, generated)
  assert.deepEqual(review.reviewRequired.map(row => [row.path, row.status, row.change]), [['expected.md', 'opened-difference', 'added'], ['notes.md', 'opened-difference', 'removed']])
  assert.equal(review.reviewRequired.find(row => row.path === 'notes.md').opened, 'Supplied notes')
  assert.equal(review.sessionUpdates.length, 0)
})

test('session removal and returning to the opened content are distinguished from unresolved differences', () => {
  const reference = [file('a.md', 'Original'), file('b.md', '')]
  const removed = reviewOpenedFiles(reference, reference, [file('b.md', '')])
  assert.deepEqual(removed.sessionUpdates.map(row => [row.path, row.change]), [['a.md', 'removed']])
  const converged = reviewOpenedFiles([file('a.md', 'Changed'), file('b.md', '')], reference, [file('a.md', 'Changed'), file('b.md', '')])
  assert.equal(converged.differences.length, 0)
  assert.equal(converged.rows.find(row => row.path === 'a.md').differedOnOpen, true)
  assert.equal(converged.rows.find(row => row.path === 'b.md').opened, '')
})

test('opened review preserves exact text and supplied path spelling without mutating inputs', () => {
  const opened = [file('NOTES/cafe\u0301.md', '  supplied\r\n```\nUnicode: Ελληνικά 😀\n')]
  const reference = [file('notes/café.md', 'Old generation')]
  const generated = [file('notes/café.md', 'New generation')]
  const before = JSON.stringify([opened, reference, generated])
  const review = reviewOpenedFiles(opened, reference, generated)
  assert.equal(review.rows.length, 1)
  assert.equal(review.rows[0].openedPath, opened[0].path)
  assert.equal(review.rows[0].opened, opened[0].content)
  assert.equal(review.rows[0].status, 'mixed-difference')
  assert.equal(JSON.stringify([opened, reference, generated]), before)
  assert.throws(() => reviewOpenedFiles([file('A.md', 'a'), file('a.md', 'b')], [], []), /duplicates/)
  assert.throws(() => reviewOpenedFiles([file('../escape.md', 'a')], [], []))
  assert.throws(() => reviewOpenedFiles([], {}, []))
})
