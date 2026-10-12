const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const http = require('node:http')
const path = require('node:path')
const vm = require('node:vm')
const { execFileSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')

let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright')) }

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'local-knowledge/retests/subjects', new Date().toISOString().replace(/[:.]/g, '-'))
const report = {
  startedAt: new Date().toISOString(),
  method: 'Installed Chrome, public reading controls, actual project JSON downloads and a self-contained HTML export. Optional data variants are injected as script responses. No application state injection or live inference.',
  limits: 'Functional browser simulation and screenshots. This is not a human comprehension study, screen reader audit, physical touch device test, source review or catalogue completeness measurement.',
  checks: [], errors: [], storageWrites: [], apiRequests: [], downloads: [],
}
let browser, context, page, server, base, current

function structure(data) {
  return { nodes: data.nodes.map(node => ({ id: node.id, parent: node.parent, level: node.level })), edges: data.edges, clusters: data.catalog?.clusters }
}

async function persist() {
  report.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n')
  await fs.writeFile(path.join(output, 'report.md'), [
    '# Subject navigation browser trial', '', report.method, '', report.limits, '',
    `Observed checks: ${report.checks.filter(item => item.status === 'Pass').length}/${report.checks.length} passed.`,
    `Browser page errors: ${report.errors.length}. Observed storage writes: ${report.storageWrites.length}.`, '',
    ...report.checks.map(item => `- ${item.id}: ${item.status}${item.error ? `. ${item.error.split('\n')[0]}` : ''}`), '',
    'Detailed observations are in results.json. Project JSON files contain fictional work and are the exact downloads. The offline HTML is the exact self-contained export.', '',
  ].join('\n'))
}

async function collectStorage() {
  if (!page || page.isClosed()) return
  for (const frame of page.frames()) {
    const writes = await frame.evaluate(() => window.__subjectStorageWrites || []).catch(() => [])
    report.storageWrites.push(...writes)
  }
}

async function fresh({ width = 1440, height = 1000, theme = 'light', fixture, url } = {}) {
  if (context) { await collectStorage(); await context.close() }
  context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    window.__subjectStorageWrites = []
    for (const operation of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[operation]
      Storage.prototype[operation] = function (...args) {
        window.__subjectStorageWrites.push({ operation, key: args[0] || '', path: location.pathname })
        return original.apply(this, args)
      }
    }
  })
  if (fixture) await context.route('**/atlas/data.js', route => route.fulfill({ contentType: 'text/javascript', body: `window.TOPIC_DATA=${JSON.stringify(fixture)};` }))
  page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('request', request => { if (request.url().includes('/api/')) report.apiRequests.push({ url: request.url(), method: request.method() }) })
  await page.goto(url || `${base}/atlas/?theme=${theme}`)
  if (!url) await page.locator('#reader-title').waitFor()
}

async function check(id, action) {
  const record = { id, status: 'Not run' }
  report.checks.push(record)
  try { record.observation = await action(); record.status = 'Pass' }
  catch (error) { record.status = 'Fail'; record.error = error.stack || String(error); process.stderr.write(`${id}: ${record.error.split('\n')[0]}\n`) }
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, `${id}.png`), fullPage: true }).catch(() => {})
  await persist()
  process.stdout.write(`${id}: ${record.status}\n`)
}

async function unchangedGraph(target = page) {
  assert.deepEqual(await target.evaluate(() => ({ nodes: TOPIC_DATA.nodes.map(node => ({ id: node.id, parent: node.parent, level: node.level })), edges: TOPIC_DATA.edges, clusters: TOPIC_DATA.catalog?.clusters })), structure(current), 'Browsing subjects preserves every original node parent, level, edge and map cluster')
}

async function downloadProject(name) {
  await page.locator('#download-project').click()
  if (await page.locator('#download-dialog .other-downloads').getAttribute('open') === null) await page.locator('#download-dialog .other-downloads > summary').click()
  const [downloaded] = await Promise.all([page.waitForEvent('download'), page.locator('[data-studio-action="download-json"]').click()])
  const filePath = path.join(output, `${name}.json`)
  await downloaded.saveAs(filePath)
  assert.equal(await downloaded.failure(), null)
  const bytes = await fs.readFile(filePath)
  report.downloads.push({ path: filePath, bytes: bytes.length })
  return JSON.parse(bytes.toString('utf8'))
}

async function run() {
  await fs.mkdir(output, { recursive: true })
  const sandbox = { window: {} }
  vm.runInNewContext(await fs.readFile(path.join(root, 'atlas/data.js'), 'utf8'), sandbox)
  current = JSON.parse(JSON.stringify(sandbox.window.TOPIC_DATA))
  const wantedIds = ['ci-pipelines', 'containers', 'access-controls', 'workflow-measurements', 'clarify-the-work', 'design-and-delivery', 'verification-evidence', 'release-and-recovery', 'user-facing-feature']
  assert.deepEqual(current.catalog.subjects.map(subject => subject.id), wantedIds)
  const bySubject = Object.fromEntries(current.catalog.subjects.map(subject => [subject.id, subject]))
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml' }
  server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname
      const relative = pathname.endsWith('/') ? pathname.slice(1) + 'index.html' : pathname.slice(1)
      if (!/^(atlas|factory|docs|assets|catalogue)\/[\w./-]+$/.test(relative) || relative.includes('..')) return response.writeHead(404).end()
      const bytes = await fs.readFile(path.join(root, relative))
      response.writeHead(200, { 'Content-Type': types[path.extname(relative)] || 'text/plain' }).end(bytes)
    } catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  try {
    browser = await playwright.chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
    await check('01-desktop-discovery-and-keyboard-reading', async () => {
      await fresh()
      assert.equal(await page.locator('#subject-browse [data-subject]').count(), current.catalog.subjects.length)
      assert.equal(await page.locator('label[for="topic-subject"]').count(), 1)
      assert.equal(await page.locator('#topic-subject').inputValue(), '')
      const before = await page.evaluate(() => ({ hash: location.hash, selected: ATLAS_STATE.selected }))
      await page.locator('#subject-browse [data-subject="ci-pipelines"]').press('Enter')
      assert.equal(await page.locator('#topic-subject').inputValue(), 'ci-pipelines')
      assert.equal(await page.locator('#topic-subject').evaluate(node => node === document.activeElement), true)
      assert.deepEqual(await page.evaluate(() => ({ hash: location.hash, selected: ATLAS_STATE.selected })), before)
      const ids = await page.locator('#topic-nav .search-result').evaluateAll(nodes => nodes.map(node => node.dataset.topic))
      assert.deepEqual([...ids].sort(), [...bySubject['ci-pipelines'].nodeIds].sort())
      const contextText = await page.locator('#subject-context').innerText()
      assert.ok(contextText.includes(bySubject['ci-pipelines'].summary))
      assert.ok(contextText.includes(bySubject['ci-pipelines'].limits))
      await page.locator('#topic-nav [data-topic="pipeline-diagnosis"]').press('Enter')
      assert.equal(await page.locator('#reader-title').innerText(), current.nodes.find(node => node.id === 'pipeline-diagnosis').title)
      assert.equal(await page.evaluate(() => location.hash), '#pipeline-diagnosis')
      assert.equal(await page.locator('#topic-subject').inputValue(), 'ci-pipelines')
      assert.deepEqual(await page.locator('#breadcrumbs [data-topic]').evaluateAll(nodes => nodes.map(node => node.dataset.topic)), ['overview', 'skills'])
      await unchangedGraph()
      return { visibleTopics: ids, selectedTopic: 'pipeline-diagnosis', coverage: 'Authored membership only. The subject summary and limits remain visible.' }
    })

    await check('02-intersection-empty-clear-and-escape', async () => {
      await fresh()
      await page.locator('#topic-subject').selectOption('ci-pipelines')
      await page.locator('#topic-kind').selectOption('technology')
      await page.locator('#topic-search').fill('Docker')
      assert.equal(await page.locator('#topic-nav .search-result').count(), 0)
      assert.match(await page.locator('#topic-nav .empty-search').innerText(), /No topics match these filters/i)
      await page.locator('.sidebar [data-clear-topics]').click()
      assert.equal(await page.locator('#topic-subject').inputValue(), '')
      assert.equal(await page.locator('#topic-kind').inputValue(), 'all')
      assert.equal(await page.locator('#topic-search').inputValue(), '')
      assert.equal(await page.locator('#topic-search').evaluate(node => node === document.activeElement), true)
      await page.locator('#topic-search').fill('Docker')
      await page.locator('#topic-kind').selectOption('technology')
      await page.locator('#topic-subject').selectOption('containers')
      assert.equal(await page.locator('#topic-nav [data-topic="docker"]').count(), 1)
      assert.equal(await page.locator('#topic-search').getAttribute('placeholder'), 'Search in this subject…')
      assert.match(await page.locator('#topic-search').getAttribute('aria-label'), /Search topics in Containers/)
      await page.locator('#topic-subject').press('Escape')
      assert.equal(await page.locator('#topic-subject').inputValue(), 'containers', 'Escape on a select can cancel native options without clearing filters')
      assert.equal(await page.locator('#topic-search').inputValue(), 'Docker', 'Selecting a subject preserves a typed search')
      assert.equal(await page.locator('#topic-kind').inputValue(), 'technology')
      await page.locator('#topic-search').press('Escape')
      assert.equal(await page.locator('#topic-subject').inputValue(), '')
      assert.equal(await page.locator('#topic-kind').inputValue(), 'all')
      assert.equal(await page.locator('#topic-search').inputValue(), '')
      assert.equal(await page.locator('#subject-context').isVisible(), false)
      return 'Search, type and subject intersect. Clear and Escape reset all three.'
    })

    await check('03-home-card-resets-filters-map-is-preserved', async () => {
      await fresh({ theme: 'dark' })
      await page.locator('#topic-search').fill('Docker')
      await page.locator('#topic-kind').selectOption('technology')
      await page.locator('#subject-browse [data-subject="access-controls"]').click()
      assert.equal(await page.locator('#topic-search').inputValue(), '')
      assert.equal(await page.locator('#topic-kind').inputValue(), 'all')
      await page.locator('#topic-nav [data-topic="permissions"]').click()
      await page.locator('[data-mode="explore"]').click()
      await page.locator('[data-view="2d"]').click()
      assert.ok(await page.locator('#flat-map [data-topic="permissions"]').count() > 0)
      await page.locator('[data-view="3d"]').click()
      await page.locator('body[data-graph="ready"]').waitFor({ timeout: 15000 })
      await page.locator('[data-mode="read"]').click()
      assert.equal(await page.locator('#topic-subject').inputValue(), 'access-controls')
      assert.equal(await page.evaluate(() => ATLAS_STATE.selected), 'permissions')
      await unchangedGraph()
      return 'Subject navigation leaves both existing map views, the selected topic and its original hierarchy intact.'
    })

    for (const width of [320, 390]) for (const theme of ['light', 'dark']) {
      await check(`04-mobile-${width}-${theme}`, async () => {
        await fresh({ width, height: 850, theme })
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
        await page.locator('#subject-browse [data-subject="containers"]').click()
        assert.equal(await page.locator('#topics-dialog').evaluate(node => node.open), true)
        assert.equal(await page.locator('#mobile-subject').evaluate(node => node === document.activeElement), true)
        assert.equal(await page.locator('#mobile-subject').inputValue(), 'containers')
        assert.equal(await page.locator('#topics-dialog').evaluate(node => node.scrollWidth <= node.clientWidth), true)
        assert.ok((await page.locator('#mobile-subject-context').innerText()).includes(bySubject.containers.limits))
        await page.locator('#mobile-topic-kind').selectOption('technology')
        await page.locator('#mobile-search').fill('Docker')
        assert.equal(await page.locator('#mobile-nav .search-result').count(), 1)
        await page.screenshot({ path: path.join(output, `mobile-dialog-${width}-${theme}.png`) })
        await page.locator('#mobile-nav [data-topic="docker"]').press('Enter')
        assert.equal(await page.locator('#topics-dialog').evaluate(node => node.open), false)
        assert.equal(await page.evaluate(() => ATLAS_STATE.selected), 'docker')
        assert.equal(await page.locator('#reader-title').evaluate(node => node === document.activeElement), true)
        await page.locator('#mobile-topics').click()
        assert.equal(await page.locator('#mobile-subject').inputValue(), 'containers')
        assert.equal(await page.locator('#mobile-search').inputValue(), 'Docker')
        await page.locator('#topics-dialog [data-clear-topics]').click()
        assert.equal(await page.locator('#mobile-subject').inputValue(), '')
        assert.equal(await page.locator('#mobile-topic-kind').inputValue(), 'all')
        assert.equal(await page.locator('#mobile-search').inputValue(), '')
        await page.locator('#close-topics').click()
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
        await unchangedGraph()
        return 'Home card opens the topic browser with focus, readable limits, intersecting filters and a keyboard reading action. No horizontal overflow.'
      })
    }

    await check('05-short-desktop-controls-reachable', async () => {
      await fresh({ width: 1024, height: 600 })
      await page.locator('#subject-browse [data-subject="workflow-measurements"]').click()
      await page.locator('#topic-subject').scrollIntoViewIfNeeded()
      const bounds = await page.locator('#topic-subject').boundingBox()
      assert.ok(bounds && bounds.x >= 0 && bounds.y >= 0 && bounds.y + bounds.height <= 600)
      await page.locator('#topic-nav [data-topic="eval-metrics"]').click()
      assert.equal(await page.evaluate(() => ATLAS_STATE.selected), 'eval-metrics')
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      return 'Subject controls and reading results remain reachable on a 1024 by 600 desktop.'
    })

    await check('06-legacy-data-hides-optional-controls', async () => {
      const legacy = structuredClone(current)
      delete legacy.catalog.subjects
      await fresh({ fixture: legacy })
      assert.equal(await page.locator('#topic-subject').isVisible(), false)
      assert.equal(await page.locator('#subject-browse [data-subject]').count(), 0)
      await page.locator('#topic-search').fill('Docker')
      await page.locator('#topic-nav [data-topic="docker"]').click()
      assert.equal(await page.evaluate(() => ATLAS_STATE.selected), 'docker')
      await page.setViewportSize({ width: 390, height: 850 })
      await page.locator('#mobile-topics').click()
      assert.equal(await page.locator('#mobile-subject').isVisible(), false)
      return 'Older projections retain normal topic search and reading without unusable subject controls.'
    })

    await check('07-malformed-optional-data-is-ignored', async () => {
      const malformed = structuredClone(current)
      malformed.catalog.subjects = [
        null,
        { ...bySubject.containers, id: 'invalid-subject', nodeIds: ['not-a-topic'] },
        { ...bySubject.containers, id: 'overview-subject', nodeIds: ['overview'] },
        { ...bySubject.containers, id: 'cluster-subject', nodeIds: ['skills'] },
        { ...bySubject.containers, id: 'blank-summary', summary: ' ' },
        { ...bySubject.containers, id: 'duplicate-members', nodeIds: ['docker', 'docker'] },
        bySubject.containers,
        { ...bySubject.containers, title: 'Duplicate id must be ignored' },
      ]
      await fresh({ fixture: malformed })
      assert.deepEqual(await page.locator('#topic-subject option').evaluateAll(nodes => nodes.map(node => node.value)), ['', 'containers'])
      assert.equal(await page.locator('#subject-browse [data-subject]').count(), 1)
      await page.locator('#subject-browse [data-subject="containers"]').click()
      assert.equal(await page.locator('#topic-nav .search-result').count(), bySubject.containers.nodeIds.length)
      const rootTopic = structuredClone(current)
      rootTopic.nodes.find(node => node.id === 'docker').parent = 'overview'
      await fresh({ fixture: rootTopic })
      await page.locator('#topic-subject').selectOption('containers')
      assert.equal(await page.locator('#topic-nav [data-topic="docker"]').count(), 1, 'A non-cluster topic directly under overview remains a valid subject member')
      const invalid = structuredClone(current)
      invalid.catalog.subjects = { invalid: true }
      await fresh({ fixture: invalid })
      assert.equal(await page.locator('#topic-subject').isVisible(), false)
      assert.equal(await page.locator('#subject-browse [data-subject]').count(), 0)
      return 'Bad optional records are ignored while valid records remain usable, including a non-cluster topic directly under overview. A non-array subject value exposes no controls.'
    })

    await check('08-embedded-browsing-preserves-downloaded-project', async () => {
      const wanted = 'Let customers save filters and reopen the same criteria.'
      await fresh({ url: `${base}/factory/#brief` })
      await page.locator('#jev-brief').fill(wanted)
      await page.locator('[data-start-recipe="feature-delivery"]').click()
      await page.locator('#jev-create').click()
      await page.locator('#project-name').fill('Subject reading trial')
      const before = await downloadProject('before-subject-reading')
      const apiCount = report.apiRequests.length
      await page.locator('.main-navigation [data-main-view="knowledge"]').click()
      const frame = page.frameLocator('#knowledge-frame')
      await frame.locator('#knowledge-back').waitFor({ state: 'visible' })
      await frame.locator('[data-mode="read"]').click()
      await frame.locator('#mobile-topics').click()
      await frame.locator('#mobile-subject').selectOption('ci-pipelines')
      await frame.locator('#mobile-nav [data-topic="github-actions"]').click()
      await frame.locator('#knowledge-back').click()
      await page.locator('#project-purpose').waitFor({ state: 'visible' })
      assert.equal(await page.locator('#project-name').inputValue(), 'Subject reading trial')
      assert.equal(await page.locator('#project-purpose').inputValue(), wanted)
      await page.locator('.main-navigation [data-main-view="knowledge"]').click()
      assert.equal(await frame.locator('#reader-title').innerText(), current.nodes.find(node => node.id === 'github-actions').title)
      await frame.locator('#mobile-topics').click()
      assert.equal(await frame.locator('#mobile-subject').inputValue(), 'ci-pipelines')
      await frame.locator('#close-topics').click()
      await page.locator('.main-navigation [data-main-view="brief"]').click()
      const after = await downloadProject('after-subject-reading')
      assert.deepEqual(after, before, 'Exact project decisions are unchanged by subject navigation')
      assert.equal(report.apiRequests.length, apiCount, 'Subject navigation does not call an inference endpoint')
      const actualFrame = page.frames().find(item => item.url().includes('/atlas/'))
      await unchangedGraph(actualFrame)
      return { projectDownloadsEqual: true, topicContextRetained: true, inferenceRequestsWhileBrowsing: 0 }
    })

    await check('09-self-contained-export-keeps-subjects-offline', async () => {
      execFileSync(process.execPath, ['tools/export-atlas.cjs'], { cwd: root, stdio: 'pipe' })
      const offlinePath = path.join(output, 'Workflow Atlas.html')
      await fs.copyFile(path.join(root, 'exports/Workflow Atlas.html'), offlinePath)
      if (context) { await collectStorage(); await context.close() }
      context = await browser.newContext({ offline: true, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
      page = await context.newPage()
      const remote = []
      page.on('pageerror', error => report.errors.push(error.message))
      page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()) })
      await page.goto(pathToFileURL(offlinePath).href)
      assert.deepEqual(await page.evaluate(() => TOPIC_DATA.catalog.subjects), current.catalog.subjects)
      await page.locator('#subject-browse [data-subject="workflow-measurements"]').click()
      await page.locator('#topic-nav [data-topic="eval-metrics"]').press('Enter')
      assert.equal(await page.evaluate(() => ATLAS_STATE.selected), 'eval-metrics')
      await page.locator('[data-mode="explore"]').click()
      await page.locator('[data-view="2d"]').click()
      assert.ok(await page.locator('#flat-map [data-topic="eval-metrics"]').count() > 0)
      await page.locator('[data-view="3d"]').click()
      await page.locator('body[data-graph="ready"]').waitFor({ timeout: 15000 })
      assert.deepEqual(remote, [])
      await unchangedGraph()
      return { exportBytes: (await fs.stat(offlinePath)).size, httpRequests: remote.length, mapViews: ['topic cards', '3D'] }
    })

    await collectStorage()
    assert.deepEqual(report.errors, [], 'No page errors')
    assert.deepEqual(report.storageWrites, [], 'No browser storage writes')
    await persist()
    const failed = report.checks.filter(item => item.status !== 'Pass')
    assert.equal(failed.length, 0, `${failed.length} subject navigation checks failed. See ${output}`)
    process.stdout.write(`PASS ${report.checks.length} subject navigation checks. Evidence: ${output}\n`)
  } finally {
    if (browser) await browser.close()
    if (server) await new Promise(resolve => server.close(resolve))
  }
}

run().catch(async error => { report.failure = error.stack || String(error); await persist().catch(() => {}); console.error(error); process.exitCode = 1 })
