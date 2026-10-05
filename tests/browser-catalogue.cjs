const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const http = require('node:http')
const path = require('node:path')
const vm = require('node:vm')
const { execFileSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const { chromium } = require('playwright')

async function run() {
  const root = path.resolve(__dirname, '..')
  const sandbox = { window: {} }
  vm.runInNewContext(await fs.readFile(path.join(root, 'atlas/data.js'), 'utf8'), sandbox)
  const legacy = JSON.parse(JSON.stringify(sandbox.window.TOPIC_DATA))
  delete legacy.catalog
  legacy.nodes.forEach(node => { delete node.catalog })
  const fixture = structuredClone(legacy)
  const metadata = (kind, aliases) => ({ kind, aliases, domains: ['Catalogue browser fixture'], guidance: 'reading', applicability: 'Use when comparing an approach with the intended outcome.', limits: 'This example does not establish project compatibility.', sourceStatus: 'legacy', definitionRefs: [] })
  fixture.nodes.find(node => node.id === 'retrieval').catalog = metadata('capability', ['lookup-fixture-alias'])
  fixture.nodes.find(node => node.id === 'jira').catalog = metadata('technology', ['ticket-fixture-alias'])
  fixture.nodes.find(node => node.id === 'holiday-example').catalog = metadata('example', ['calendar-fixture-alias'])
  const collections = [
    { id: 'study', title: 'Configuration service study', nodeIds: ['construct-study', 'study-baseline'] },
    { id: 'architect', title: 'Architect briefing', nodeIds: ['overview', 'architecture'] },
    { id: 'engineering', title: 'Engineering delivery', nodeIds: ['requirement-status', 'traceability'] },
    { id: 'curation', title: 'Country-data curation', nodeIds: ['applicability', 'temporal-scope'] },
    { id: 'cost', title: 'Cost control', nodeIds: ['routing', 'model-prices'] },
    { id: 'fixture-path', title: 'Catalogue fixture path', nodeIds: ['retrieval', 'jira'] },
  ]
  fixture.catalog = { schemaVersion: '1.0', version: '2.1.0', collections, clusters: [{ id: 'knowledge', short: 'Knowledge fixture label', color: '#78d5ed', position: [74, -49, 9] }] }

  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css' }
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname
      const relative = pathname === '/atlas/' ? 'atlas/index.html' : pathname.slice(1)
      if (!/^atlas\/[\w./-]+$/.test(relative) || relative.includes('..')) return response.writeHead(404).end()
      const content = await fs.readFile(path.join(root, relative))
      response.writeHead(200, { 'Content-Type': types[path.extname(relative)] || 'text/plain' }).end(content)
    } catch { response.writeHead(404).end() }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/atlas/`
  let browser
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route('**/data.js', route => route.fulfill({ contentType: 'text/javascript', body: `window.TOPIC_DATA=${JSON.stringify(fixture)};` }))
    await page.goto(base)
    assert.equal(await page.locator('#tour-select option').count(), 7, 'Five existing paths and one collection remain available')
    await page.locator('#topic-kind').selectOption('technology')
    assert.equal(await page.locator('#topic-nav .search-result').count(), 1)
    assert.match(await page.locator('#topic-nav .search-result small').innerText(), /Technology/)
    assert.equal(await page.locator('#mobile-topic-kind').inputValue(), 'technology')
    await page.locator('#topic-search').fill('lookup-fixture-alias')
    assert.equal(await page.locator('#topic-nav .search-result').count(), 0, 'Search and type filter intersect')
    await page.locator('.sidebar [data-clear-topics]').click()
    assert.equal(await page.locator('#topic-kind').inputValue(), 'all')
    assert.equal(await page.locator('#topic-search').inputValue(), '')
    assert.equal(await page.locator('#topic-search').evaluate(node => node === document.activeElement), true)
    await page.locator('#topic-search').fill('lookup-fixture-alias')
    assert.match(await page.locator('#topic-nav .search-result small').innerText(), /Knowledge fixture label/)
    assert.doesNotMatch(await page.locator('#topic-nav .result-excerpt').innerText(), /lookup-fixture-alias|Catalogue browser fixture/, 'Aliases remain searchable without replacing the readable summary')
    await page.locator('#topic-nav [data-topic="retrieval"]').press('Enter')
    assert.equal(await page.evaluate(() => window.ATLAS_STATE.selected), 'retrieval')
    assert.equal(await page.locator('#reader-meta .topic-kind-badge').innerText(), 'Capability')
    assert.equal(await page.locator('#topic-scope').evaluate(node => node.open), false)
    await page.locator('#topic-scope summary').press('Enter')
    assert.equal(await page.locator('#topic-scope').evaluate(node => node.open), true)
    assert.match(await page.locator('#topic-scope-content').innerText(), /project compatibility/)
    assert.match(await page.locator('#topic-scope-content').innerText(), /migration did not recheck their claims/)
    await page.locator('#tour-select').selectOption('fixture-path')
    await page.locator('#start-tour').click()
    assert.equal(await page.evaluate(() => window.ATLAS_STATE.selected), 'retrieval')
    await page.locator('#tour-next').click()
    assert.equal(await page.evaluate(() => window.ATLAS_STATE.selected), 'jira')
    await page.locator('#tour-exit').click()
    await page.locator('#topic-kind').selectOption('capability')
    await page.locator('#topic-search').press('Escape')
    assert.equal(await page.locator('#topic-kind').inputValue(), 'all')

    const output = path.join(root, 'exports/browser-qa-catalogue')
    await fs.mkdir(output, { recursive: true })
    for (const theme of ['light', 'dark']) {
      await page.setViewportSize({ width: 320, height: 850 })
      await page.goto(`${base}?theme=${theme}#retrieval`)
      await page.locator('#topic-scope summary').click()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `${theme} reader fits 320 pixels`)
      await page.locator('#mobile-topics').click()
      await page.locator('#mobile-topic-kind').selectOption('example')
      await page.locator('#mobile-search').fill('calendar-fixture-alias')
      assert.equal(await page.locator('#mobile-nav .search-result').count(), 1)
      assert.equal(await page.locator('#topics-dialog').evaluate(node => node.scrollWidth <= node.clientWidth), true, `${theme} topic dialog fits`)
      await page.screenshot({ path: path.join(output, `mobile-filter-${theme}.png`) })
      await page.locator('#mobile-nav [data-topic="holiday-example"]').press('Enter')
      assert.equal(await page.locator('#topics-dialog').evaluate(node => node.open), false)
      assert.equal(await page.evaluate(() => window.ATLAS_STATE.selected), 'holiday-example')
      assert.equal(await page.locator('#reader-meta .topic-kind-badge').innerText(), 'Worked example')
    }
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0])
    await page.unroute('**/data.js')
    await page.route('**/data.js', route => route.fulfill({ contentType: 'text/javascript', body: `window.TOPIC_DATA=${JSON.stringify(legacy)};` }))
    await page.goto(base)
    assert.equal(await page.locator('.topic-filters:visible').count(), 0, 'Legacy data does not expose unusable filters')
    assert.equal(await page.locator('#topic-scope').isVisible(), false)
    assert.equal(await page.locator('#tour-select option').count(), 6)
    assert.deepEqual(errors, [])

    // Exercise the actual generated catalogue, not only the metadata contract fixture.
    await page.unroute('**/data.js')
    const current = JSON.parse(JSON.stringify(sandbox.window.TOPIC_DATA))
    const retrievalPath = current.catalog.collections.find(collection => collection.id === 'retrieval')
    assert.ok(retrievalPath, 'The generated catalogue exposes the retrieval learning path')
    assert.deepEqual(retrievalPath.nodeIds, ['information-retrieval', 'retrieval-options', 'retrieve-and-validate', 'retrieval-example'])
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(`${base}?theme=light`)
    assert.deepEqual(await page.evaluate(() => window.TOPIC_DATA), current)
    assert.equal(await page.locator('#tour-select option').count(), current.catalog.collections.length + 1)
    await page.locator('#quick-start .guided-path-choice[data-tour="retrieval"]').scrollIntoViewIfNeeded()
    await page.screenshot({ path: path.join(output, 'actual-guided-path-discovery.png') })
    await page.locator('#quick-start .guided-path-choice[data-tour="retrieval"]').click()
    assert.equal(await page.evaluate(() => window.ATLAS_STATE.selected), 'information-retrieval')
    await page.locator('#tour-exit').click()
    await page.locator('#topic-kind').selectOption('capability')
    await page.locator('#topic-search').fill('lookup')
    await page.locator('#topic-nav [data-topic="information-retrieval"]').click()
    assert.equal(await page.locator('#reader-title').innerText(), 'Retrieve information')
    await page.locator('#topic-scope summary').click()
    const reviewDate = current.nodes.find(node => node.id === 'information-retrieval').catalog.reviewedOn
    assert.ok((await page.locator('#topic-scope-content').innerText()).includes(`Scoped claims reviewed on ${reviewDate}`))
    assert.ok(await page.locator('#topic-scope .scope-claim-sources a').count() > 0)
    await page.screenshot({ path: path.join(output, 'actual-retrieval-desktop.png') })
    await page.locator('#reader-related [data-topic="retrieval-options"]').click()
    const technologyIds = ['postgresql-data', 'amazon-neptune', 'apache-jena-fuseki', 'neo4j-data']
    for (const id of technologyIds) {
      await page.locator(`#reader-related [data-topic="${id}"]`).click()
      assert.equal(await page.locator('#reader-meta .topic-kind-badge').innerText(), 'Technology')
      assert.ok(await page.locator('#reader-sources .source-link').count() > 0, `${id} exposes primary sources`)
      await page.locator('#topic-scope summary').click()
      assert.ok(await page.locator('#topic-scope .scope-claim-sources a').count() > 0, `${id} links its scoped claims to sources`)
      await page.locator('#reader-related [data-topic="retrieval-options"]').click()
    }
    await page.locator('#tour-select').selectOption('retrieval')
    await page.locator('#start-tour').click()
    for (const id of retrievalPath.nodeIds) {
      assert.equal(await page.evaluate(() => window.ATLAS_STATE.selected), id)
      await page.locator('#tour-next').click()
    }
    assert.equal(await page.locator('#tour-bar').isVisible(), false)
    await page.locator('#topic-scope summary').click()
    assert.match(await page.locator('#topic-scope-content').innerText(), /Illustrative or unreviewed guidance/)
    await page.locator('.sidebar [data-clear-topics]').click()
    await page.locator('[data-mode="explore"]').click()
    await page.locator('[data-view="2d"]').click()
    await page.locator('#flat-map [data-topic="information-retrieval"]').click()
    assert.match(await page.locator('#map-selection-evidence').innerText(), /Capability/)
    await page.locator('#read-map-topic').click()
    assert.equal(await page.evaluate(() => window.ATLAS_STATE.mode), 'read')
    await page.setViewportSize({ width: 390, height: 900 })
    await page.goto(`${base}?theme=dark#retrieve-and-validate`)
    await page.locator('#topic-scope summary').click()
    assert.match(await page.locator('#topic-scope-content').innerText(), /Available for project review/)
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    await page.screenshot({ path: path.join(output, 'actual-practice-mobile.png') })
    await page.locator('#mobile-topics').click()
    await page.locator('#mobile-topic-kind').selectOption('technology')
    await page.locator('#mobile-search').fill('Fuseki')
    await page.locator('#mobile-nav [data-topic="apache-jena-fuseki"]').press('Enter')
    assert.equal(await page.evaluate(() => window.ATLAS_STATE.selected), 'apache-jena-fuseki')

    // The self-contained artifact carries the same public catalogue and remains usable offline.
    execFileSync(process.execPath, ['tools/export-atlas.cjs'], { cwd: root, stdio: 'pipe' })
    const offlineContext = await browser.newContext({ offline: true, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
    const offline = await offlineContext.newPage()
    const remote = []
    offline.on('pageerror', error => errors.push(error.message))
    offline.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()) })
    await offline.goto(pathToFileURL(path.join(root, 'exports/Workflow Atlas.html')).href)
    assert.deepEqual(await offline.evaluate(() => window.TOPIC_DATA), current)
    await offline.locator('#topic-kind').selectOption('capability')
    await offline.locator('#topic-search').fill('fetch data')
    await offline.locator('#topic-nav [data-topic="information-retrieval"]').click()
    await offline.locator('#tour-select').selectOption('retrieval')
    await offline.locator('#start-tour').click()
    for (const id of retrievalPath.nodeIds) {
      assert.equal(await offline.evaluate(() => window.ATLAS_STATE.selected), id)
      await offline.locator('#tour-next').click()
    }
    await offline.locator('[data-mode="sources"]').click()
    await offline.locator('#source-search').fill('PostgreSQL')
    assert.ok(await offline.locator('.source-card').count() > 0)
    await offline.locator('[data-mode="explore"]').click()
    await offline.locator('[data-view="2d"]').click()
    assert.ok(await offline.locator('#flat-map [data-topic="information-retrieval"]').count() > 0)
    await offline.locator('[data-view="3d"]').click()
    await offline.locator('body[data-graph="ready"]').waitFor({ timeout: 15000 })
    await offline.screenshot({ path: path.join(output, 'actual-retrieval-offline-map.png') })
    assert.deepEqual(remote, [], 'Offline reading, source search and both map views make no HTTP requests')
    assert.deepEqual(errors, [])
    console.log(`PASS catalogue fixtures and actual ${current.nodes.length}-topic catalogue: retrieval path, four technology examples, type filters, aliases, keyboard/mobile themes and offline 2D/3D with zero HTTP requests`)
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 })
