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
const output = path.join(root, 'local-knowledge/retests/map2d', new Date().toISOString().replace(/[:.]/g, '-'))
const report = {
  startedAt: new Date().toISOString(),
  method: 'Installed Chrome, public map and reading controls, exact project JSON downloads and a self-contained HTML export. Legacy and malformed projections are injected as script responses. No application state injection or live inference.',
  limits: 'Functional browser simulation and viewport screenshots. This is not a human comprehension study, screen reader audit, physical touch device test, source review, catalogue completeness claim or production performance measurement.',
  checks: [], errors: [], storageWrites: [], apiRequests: [], downloads: [],
}
let browser, context, page, server, base, current, knowledgeQuery

async function persist() {
  report.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n')
  await fs.writeFile(path.join(output, 'report.md'), [
    '# 2D map browser trial', '', report.method, '', report.limits, '',
    `Observed checks: ${report.checks.filter(item => item.status === 'Pass').length}/${report.checks.length} passed.`,
    `Browser page errors: ${report.errors.length}. Observed storage writes: ${report.storageWrites.length}.`, '',
    ...report.checks.map(item => `- ${item.id}: ${item.status}${item.error ? `. ${item.error.split('\n')[0]}` : ''}`), '',
    'Detailed observations are in results.json. Project JSON files contain fictional work and are the exact downloads. The offline HTML is the exact self-contained export.', '',
  ].join('\n'))
}

async function collectStorage() {
  if (!page || page.isClosed()) return
  for (const frame of page.frames()) report.storageWrites.push(...await frame.evaluate(() => window.__mapStorageWrites || []).catch(() => []))
}

async function fresh({ width = 1440, height = 1000, theme = 'light', fixture, url } = {}) {
  if (context) { await collectStorage(); await context.close() }
  context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, reducedMotion: 'reduce' })
  await context.addInitScript(() => {
    window.__mapStorageWrites = []
    for (const operation of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[operation]
      Storage.prototype[operation] = function (...args) {
        window.__mapStorageWrites.push({ operation, key: args[0] || '', path: location.pathname })
        return original.apply(this, args)
      }
    }
  })
  if (fixture) await context.route('**/atlas/data.js', route => route.fulfill({ contentType: 'text/javascript', body: `window.TOPIC_DATA=${JSON.stringify(fixture)};` }))
  page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('request', request => { if (request.url().includes('/api/')) report.apiRequests.push({ url: request.url(), method: request.method() }) })
  await page.goto(url || `${base}/atlas/?theme=${theme}&view=explore`)
  if (!url) await page.locator('#reader-title').waitFor()
}

async function check(id, action) {
  const record = { id, status: 'Not run' }
  report.checks.push(record)
  try { record.observation = await action(); record.status = 'Pass' }
  catch (error) { record.status = 'Fail'; record.error = error.stack || String(error); process.stderr.write(`${id}: ${record.error.split('\n')[0]}\n`) }
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, `${id}.png`), fullPage: false }).catch(() => {})
  await persist()
  process.stdout.write(`${id}: ${record.status}\n`)
}

async function openMap(target = page) {
  await target.locator('.mode-nav [data-mode="explore"]').click()
  await target.locator('[data-view="map"]').click()
  await target.locator('#map-2d svg').waitFor({ state: 'visible' })
}

function node(ref, target = page) { return target.locator(`#map-2d .map2d-node[data-record="${ref}"]`) }

async function choose(ref, target = page, key = 'Enter') {
  await node(ref, target).press(key)
}

async function insideViewBox(ref, target = page) {
  const [left, top, width, height] = (await target.locator('#map-2d svg').getAttribute('viewBox')).split(/\s+/).map(Number)
  const position = (await node(ref, target).getAttribute('transform')).match(/translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/)
  assert.ok(position, 'A rendered node exposes its fixed SVG position')
  const x = Number(position[1]), y = Number(position[2])
  return x >= left && x <= left + width && y >= top && y <= top + height
}

async function clusterLabelClearances() {
  const memberships = current.catalog.layout2d.clusters.map(cluster => ({ id: cluster.id, records: current.catalog.layout2d.nodes.filter(item => item.clusterId === cluster.id).map(item => item.id) }))
  const clearances = await page.evaluate(groups => groups.map(({ id, records }) => {
    const cluster = document.querySelector(`#map-2d .map2d-cluster[data-cluster="${id}"]`)
    const labels = [...cluster.querySelectorAll('.map2d-cluster-name, .map2d-cluster-count')].filter(item => getComputedStyle(item).display !== 'none')
    const labelBottom = Math.max(...labels.map(item => item.getBoundingClientRect().bottom))
    const shapes = records.map(ref => document.querySelector(`#map-2d .map2d-node[data-record="${ref}"] .map2d-shape`))
    return { id, labelBottom, shapeCount: shapes.length, shapeTop: Math.min(...shapes.map(item => item.getBoundingClientRect().top)) }
  }), memberships)
  for (const item of clearances) {
    assert.ok(item.shapeCount > 0, `${item.id} contains actual rendered shapes`)
    item.clearance = item.shapeTop - item.labelBottom
    assert.ok(item.clearance > 0, `${item.id} heading and count must sit above its own node shapes, actual clearance ${item.clearance}px`)
  }
  return clearances.map(({ id, clearance }) => ({ id, clearance }))
}

async function visibleGlyphCenters() {
  return page.evaluate(() => {
    const svg = document.querySelector('#map-2d svg'), bounds = svg.getBoundingClientRect()
    const headerBottom = document.querySelector('.topbar').getBoundingClientRect().bottom
    return [...svg.querySelectorAll('.map2d-node')].map(group => {
      const shape = group.querySelector('.map2d-shape'), rect = shape.getBoundingClientRect()
      const x = rect.x + rect.width / 2, y = rect.y + rect.height / 2
      return { id: group.dataset.record, x, y, hit: document.elementFromPoint(x, y)?.closest('.map2d-node')?.dataset.record }
    }).filter(point => point.x > Math.max(0, bounds.left) + 1 && point.x < Math.min(innerWidth, bounds.right) - 1 && point.y > Math.max(headerBottom, bounds.top) + 1 && point.y < Math.min(innerHeight, bounds.bottom) - 1)
  })
}

async function unchangedGraph(target = page) {
  const original = data => ({ nodes: data.nodes.map(item => ({ id: item.id, parent: item.parent, level: item.level })), edges: data.edges, typedEdges: data.catalog?.edges, clusters: data.catalog?.clusters, subjects: data.catalog?.subjects })
  const actual = await target.evaluate(() => ({ nodes: TOPIC_DATA.nodes.map(item => ({ id: item.id, parent: item.parent, level: item.level })), edges: TOPIC_DATA.edges, typedEdges: TOPIC_DATA.catalog?.edges, clusters: TOPIC_DATA.catalog?.clusters, subjects: TOPIC_DATA.catalog?.subjects }))
  assert.deepEqual(actual, original(current), 'Map interaction preserves original topic hierarchy, 3D edges, cluster homes and subject memberships')
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
  knowledgeQuery = (await import(pathToFileURL(path.join(root, 'factory/knowledge-query.mjs')).href)).createKnowledgeQuery(current)
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

    await check('01-default-map-topic-reading-and-hierarchy', async () => {
      await fresh()
      await page.locator('#map-2d svg').waitFor({ state: 'visible' })
      assert.equal(await page.locator('[data-view="map"]').getAttribute('aria-pressed'), 'true')
      assert.equal(await page.locator('body').getAttribute('data-map2d'), 'ready')
      assert.equal(await page.locator('#map-2d .map2d-node').count(), current.nodes.length + current.catalog.definitions.filter(item => ['practice', 'technology'].includes(item.type)).length)
      await choose('topic:docker')
      const docker = current.nodes.find(item => item.id === 'docker')
      assert.equal(await page.locator('#map-record-title').innerText(), docker.title)
      const sourceText = await page.locator('#map-record-evidence').innerText()
      assert.ok(sourceText.includes(`${docker.refs.length} linked source${docker.refs.length === 1 ? '' : 's'}`))
      assert.ok(sourceText.includes(docker.catalog.sourceStatus === 'reviewed' ? `Reviewed ${docker.catalog.reviewedOn}` : 'No claim review recorded'))
      assert.equal(await node('topic:docker').getAttribute('aria-pressed'), 'true')
      assert.equal(await node('topic:docker').locator('circle.map2d-shape').count(), 1)
      assert.equal(await page.evaluate(() => location.hash), '#docker')
      await page.locator('#map-record-read').click()
      assert.equal(await page.locator('#reader-title').innerText(), current.nodes.find(item => item.id === 'docker').title)
      assert.deepEqual(await page.locator('#breadcrumbs [data-topic]').evaluateAll(items => items.map(item => item.dataset.topic)), ['overview', 'toolchain'])
      await unchangedGraph()
      return '2D is discoverable without choosing a rendering technology. A topic opens its existing article and unchanged breadcrumb.'
    })

    await check('02-practice-technology-neighbours-and-source-status', async () => {
      await fresh()
      await openMap()
      await page.locator('#map-family-reading').check()
      for (const ref of ['practice:agents-md', 'technology:github-actions']) {
        const expected = knowledgeQuery.get(ref)
        await choose(ref)
        assert.equal(await node(ref).locator(ref.startsWith('practice:') ? 'rect.map2d-shape' : 'polygon.map2d-shape').count(), 1)
        assert.equal(await page.locator('#map-record-title').innerText(), expected.title)
        const evidence = await page.locator('#map-record-evidence').innerText()
        const definition = current.catalog.definitions.find(item => item.ref === ref)
        assert.ok(evidence.includes(`${definition.sourceRefs.length} linked source${definition.sourceRefs.length === 1 ? '' : 's'}`), 'Source counts come from the actual record')
        assert.ok(evidence.includes(definition.reviewedOn ? `Record reviewed ${definition.reviewedOn}` : 'No record review date'), 'Only a recorded review date may be claimed')
        assert.doesNotMatch(evidence, /verified|confirmed|validated/i)
        if (definition.sourceRefs.length) {
          if (!await page.locator('#map-record-sources').evaluate(item => item.open)) await page.locator('#map-record-sources summary').click()
          assert.deepEqual(await page.locator('#map-record-source-links a').evaluateAll(items => items.map(item => item.href)), definition.sourceRefs.map(id => current.sources[id][1]), 'Source links open the actual recorded references')
        }
        const neighbours = await page.locator('#map-neighbours [data-map-record]').evaluateAll(items => items.map(item => item.dataset.mapRecord))
        const displayed = new Set(current.catalog.layout2d.nodes.map(item => item.id))
        const recorded = new Set(current.catalog.edges.filter(edge => edge.from === ref || edge.to === ref).map(edge => edge.from === ref ? edge.to : edge.from).filter(other => other !== ref && displayed.has(other)))
        assert.ok(neighbours.length > 0)
        assert.deepEqual([...new Set(neighbours)].sort(), [...recorded].sort(), 'Every available neighbour has a real typed catalogue edge, with none invented or silently omitted')
        assert.ok((await page.locator('#map-neighbours').innerText()).includes('explained by'))
      }
      await page.locator('#map-neighbours [data-map-record="topic:github-actions"]').first().press('Enter')
      assert.equal(await page.locator('#map-record-title').innerText(), current.nodes.find(item => item.id === 'github-actions').title)
      await unchangedGraph()
      return 'Practice and technology shapes open recorded metadata and genuine typed neighbours. Neighbour buttons reach the related topic.'
    })

    await check('03-edge-family-controls-and-selected-neighbourhood', async () => {
      await fresh()
      await openMap()
      await choose('topic:implementation-workflow')
      assert.equal(await page.locator('#map-family-structure').isChecked(), true)
      assert.equal(await page.locator('#map-family-applies').isChecked(), true)
      assert.equal(await page.locator('#map-family-reading').isChecked(), false)
      assert.equal(await page.locator('#map-2d .map2d-edge[data-edge-family="reading"]').count(), 0)
      await page.locator('#map-family-reading').check()
      assert.ok(await page.locator('#map-2d .map2d-edge[data-edge-family="reading"]').count() > 0)
      await page.locator('#map-family-structure').uncheck()
      assert.equal(await page.locator('#map-2d .map2d-edge[data-edge-family="structure"]').count(), 0)
      await page.locator('#map-family-applies').uncheck()
      assert.equal(await page.locator('#map-2d .map2d-edge[data-edge-family="applies"]').count(), 0)
      const visible = await page.locator('#map-2d .map2d-edge').evaluateAll(items => items.map(item => item.dataset.edgeFamily))
      assert.ok(visible.every(item => item === 'reading'))
      return { remainingVisibleFamily: 'reading', defaultFamilies: ['structure', 'applies'] }
    })

    await check('04-keyboard-pan-zoom-reset-and-topic-action', async () => {
      await fresh()
      await openMap()
      const svg = page.locator('#map-2d svg')
      const original = await svg.getAttribute('viewBox')
      const fixedPositions = await page.locator('#map-2d .map2d-node').evaluateAll(items => items.map(item => item.getAttribute('transform')))
      await svg.press('ArrowRight')
      assert.notEqual(await svg.getAttribute('viewBox'), original, 'Arrow keys pan the stable layout')
      await page.locator('#zoom-in').press('Enter')
      const zoomed = await svg.getAttribute('viewBox')
      assert.ok(Number(zoomed.split(' ')[2]) < Number(original.split(' ')[2]), 'Zoom in decreases the visible map width')
      await page.locator('#zoom-out').press('Enter')
      assert.notEqual(await svg.getAttribute('viewBox'), zoomed)
      await page.locator('#map-reset').press('Enter')
      assert.equal(await svg.getAttribute('viewBox'), original)
      await svg.scrollIntoViewIfNeeded()
      const bounds = await svg.boundingBox()
      const header = await page.locator('.topbar').boundingBox()
      const point = { x: bounds.x + 12, y: Math.max(bounds.y + 12, header.y + header.height + 12) }
      const hit = await page.evaluate(({ x, y }) => { const item = document.elementFromPoint(x, y); return { inMap: Boolean(item?.closest('#map-2d')), node: Boolean(item?.closest('.map2d-node')), tag: item?.tagName, id: item?.id } }, point)
      assert.equal(hit.inMap && !hit.node, true, `The drag begins on visible empty map space: ${JSON.stringify({ bounds, point, hit })}`)
      await page.mouse.move(point.x, point.y)
      await page.mouse.down()
      await page.mouse.move(point.x + 48, point.y + 28, { steps: 4 })
      await page.mouse.up()
      assert.notEqual(await svg.getAttribute('viewBox'), original, 'Dragging empty map space pans without moving topic positions')
      await page.locator('#map-reset').click()
      assert.deepEqual(await page.locator('#map-2d .map2d-node').evaluateAll(items => items.map(item => item.getAttribute('transform'))), fixedPositions, 'Pan and zoom never rearrange node positions')
      await choose('topic:docker', page, 'Space')
      assert.equal(await page.locator('#map-record-title').innerText(), current.nodes.find(item => item.id === 'docker').title)
      assert.equal(await node('topic:docker').getAttribute('role'), 'button')
      assert.ok(await node('topic:docker').getAttribute('aria-label'))
      await unchangedGraph()
      return 'Keyboard users can select with Space, pan with arrows, zoom with visible buttons and reset the view.'
    })

    await check('04b-full-record-list-and-neighbours-recenter-selection', async () => {
      await fresh()
      await openMap()
      const displayed = current.catalog.layout2d.nodes
      await page.locator('.map-index > summary').click()
      assert.equal(await page.locator('#map-topic-list [data-map-record]').count(), displayed.length, 'The accessible list includes every displayed topic, practice and technology')
      const unlinked = current.catalog.definitions.find(item => ['practice', 'technology'].includes(item.type) && !item.explainedBy && !current.catalog.edges.some(edge => edge.from === item.ref || edge.to === item.ref))
      assert.ok(unlinked, 'The real catalogue has an unlinked definition to exercise')
      const svg = page.locator('#map-2d svg')
      for (let index = 0; index < 5; index++) await page.locator('#zoom-in').click()
      for (let index = 0; index < 6; index++) await svg.press('ArrowRight')
      assert.equal(await insideViewBox(unlinked.ref), false, 'The target is outside the panned and zoomed map before the list action')
      await page.locator(`#map-topic-list [data-map-record="${unlinked.ref}"]`).click()
      assert.equal(await page.locator('#map-record-title').innerText(), unlinked.label)
      assert.equal(await insideViewBox(unlinked.ref), true, 'Choosing an unlinked definition from the full list brings its node into view without Fit map')
      assert.equal(await page.locator('#map-record-read').isVisible(), false, 'An unlinked definition does not invent an explanation article')
      assert.equal(await page.locator('#map-neighbours [data-map-record]').count(), 0, 'An unlinked record does not invent neighbours')
      await page.locator('#map-family-reading').check()
      await page.locator('#map-topic-list [data-map-record="technology:github-actions"]').click()
      for (let index = 0; index < 12; index++) await svg.press('ArrowRight')
      assert.equal(await insideViewBox('topic:github-actions'), false, 'The neighbour is out of view before its external button is used')
      await page.locator('#map-neighbours [data-map-record="topic:github-actions"]').click()
      assert.equal(await insideViewBox('topic:github-actions'), true, 'Choosing a named neighbour recenters its node without resetting zoom')
      assert.equal(await page.locator('#map-record-title').innerText(), current.nodes.find(item => item.id === 'github-actions').title)
      await unchangedGraph()
      return { listedNodes: displayed.length, unlinkedDefinition: unlinked.ref, recenteredFrom: ['full record list', 'Neighbours'] }
    })

    for (const theme of ['light', 'dark']) await check(`04c-visible-glyph-pointer-priority-${theme}`, async () => {
      const observations = []
      for (const width of [320, 390, 1440]) {
        await fresh({ width, height: width === 1440 ? 1000 : 850, theme })
        const svg = page.locator('#map-2d svg')
        await svg.scrollIntoViewIfNeeded()
        const fitted = await visibleGlyphCenters()
        assert.equal(fitted.length, current.catalog.layout2d.nodes.length, 'Every glyph center is visible at full fit')
        for (const point of fitted) {
          const actual = await visibleGlyphCenters()
          const target = actual.find(item => item.id === point.id)
          assert.equal(target?.hit, point.id, `${width}px ${theme}: the visible ${point.id} glyph takes priority over another node's expanded target or label`)
          await page.mouse.click(target.x, target.y)
          assert.equal(await page.evaluate(() => ATLAS_STATE.mapRecord), point.id, 'An actual pointer click selects the visibly clicked record')
        }
        const states = []
        for (const state of ['zoomed', 'panned']) {
          if (state === 'zoomed') for (let index = 0; index < 2; index++) await page.locator('#zoom-in').click()
          else { await svg.press('ArrowRight'); await svg.press('ArrowDown') }
          await svg.scrollIntoViewIfNeeded()
          const visible = await visibleGlyphCenters()
          assert.ok(visible.length > 0)
          for (const point of visible) assert.equal(point.hit, point.id, `${width}px ${theme} ${state}: no glyph center is intercepted`)
          for (const point of visible.filter((_, index) => index % 9 === 0)) {
            const target = (await visibleGlyphCenters()).find(item => item.id === point.id)
            await page.mouse.click(target.x, target.y)
            assert.equal(await page.evaluate(() => ATLAS_STATE.mapRecord), point.id)
          }
          states.push({ state, visibleGlyphs: visible.length })
        }
        observations.push({ width, fullFitPointerClicks: fitted.length, states })
      }
      return observations
    })

    await check('05-subject-highlights-without-reparenting-or-hiding', async () => {
      await fresh()
      await openMap()
      const total = await page.locator('#map-2d .map2d-node').count()
      const hash = await page.evaluate(() => location.hash)
      await page.locator('#map-subject').selectOption('containers')
      assert.equal(await page.locator('#topic-subject').inputValue(), 'containers')
      assert.equal(await page.locator('#mobile-subject').inputValue(), 'containers')
      assert.equal(await page.locator('#map-2d .map2d-node').count(), total)
      assert.equal(await node('topic:docker').getAttribute('data-subject-match'), 'true')
      assert.equal(await node('topic:jira').getAttribute('data-subject-match'), 'false')
      assert.ok((await node('topic:jira').getAttribute('class')).includes('is-dimmed'))
      assert.equal(await page.evaluate(() => location.hash), hash)
      assert.match(await page.locator('#subject-context').innerText(), /Docker/)
      await page.locator('#zoom-in').click()
      await page.locator('.map2d-label[data-record="topic:docker"]').click()
      assert.equal(await node('topic:docker').getAttribute('aria-pressed'), 'true', 'Clicking a highlighted article label selects its node')
      await page.locator('#map-record-read').click()
      assert.equal(await page.locator('#topic-subject').inputValue(), 'containers')
      await page.locator('#topic-subject').selectOption('ci-pipelines')
      await openMap()
      assert.equal(await page.locator('#map-subject').inputValue(), 'ci-pipelines')
      await page.locator('#map-subject').selectOption('')
      assert.equal(await page.locator('#topic-subject').inputValue(), '')
      await unchangedGraph()
      return 'A subject highlights its articles while every map record and original topic home remain available. Reading and map selectors stay synchronized.'
    })

    for (const width of [320, 390, 1440]) for (const theme of ['light', 'dark']) {
      await check(`06-responsive-${width}-${theme}`, async () => {
        await fresh({ width, height: width === 1440 ? 1000 : 850, theme })
        await openMap()
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'No page level horizontal overflow')
        await page.locator('#map-2d svg').scrollIntoViewIfNeeded()
        const clearances = width === 1440 ? await clusterLabelClearances() : null
        await page.screenshot({ path: path.join(output, `full-map-${width}-${theme}.png`), fullPage: false })
        await page.locator('#map-subject').selectOption('ci-pipelines')
        if (width < 620) {
          const article = page.locator('[data-map2d-subject-record="topic:github-actions"]')
          await article.click()
          assert.equal(await article.getAttribute('aria-pressed'), 'true')
          assert.equal(await page.locator('#map-record-kind').innerText(), 'READING TOPIC')
          assert.equal(await insideViewBox('topic:github-actions'), true)
          await page.screenshot({ path: path.join(output, `subject-map-${width}-${theme}.png`), fullPage: false })
        }
        await choose('technology:github-actions')
        await page.locator('#map-record-panel').scrollIntoViewIfNeeded()
        const panel = await page.locator('#map-record-panel').boundingBox()
        assert.ok(panel && panel.x >= 0 && panel.x + panel.width <= width + 1, 'Readable record panel stays within viewport width')
        assert.equal(await page.locator('#map-record-read').isVisible(), true)
        assert.ok(await page.locator('#map-neighbours [data-map-record]').count() > 0)
        await page.screenshot({ path: path.join(output, `record-${width}-${theme}.png`), fullPage: false })
        await page.locator('#map-record-read').click()
        assert.equal(await page.locator('#reader-title').innerText(), current.nodes.find(item => item.id === 'github-actions').title)
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
        return { observation: `${width}px ${theme} map controls, record panel and reading action fit the viewport.`, clusterLabelClearances: clearances }
      })
    }

    await check('06b-short-phone-map-key-controls-and-subject-articles', async () => {
      await fresh({ width: 320, height: 568 })
      await openMap()
      const key = page.locator('.map2d-compact-key'), stage = page.locator('#graph-stage')
      assert.equal(await key.isVisible(), true)
      const assertKeyFits = async () => {
        const keyBounds = await key.boundingBox(), stageBounds = await stage.boundingBox()
        assert.ok(keyBounds.x >= stageBounds.x && keyBounds.x + keyBounds.width <= stageBounds.x + stageBounds.width + 1)
        assert.ok(keyBounds.y >= stageBounds.y && keyBounds.y + keyBounds.height <= stageBounds.y + stageBounds.height + 1, 'The compact key is contained in the map stage, without clipped content below it')
      }
      await assertKeyFits()
      await page.locator('#map-subject').selectOption('ci-pipelines')
      await page.locator('[data-map2d-subject-record="topic:github-actions"]').click()
      assert.equal(await page.locator('#map-record-title').innerText(), current.nodes.find(item => item.id === 'github-actions').title)
      assert.equal(await insideViewBox('topic:github-actions'), true)
      await page.locator('#map-reset').click()
      assert.equal(await page.locator('#map-2d svg').getAttribute('viewBox'), `0 0 ${current.catalog.layout2d.width} ${current.catalog.layout2d.height}`)
      await key.locator('.map2d-key-details > summary').click()
      await key.locator('.map2d-cluster-key li').last().scrollIntoViewIfNeeded()
      assert.equal(await key.locator('.map2d-cluster-key li').count(), current.catalog.layout2d.clusters.length)
      await assertKeyFits()
      await page.screenshot({ path: path.join(output, 'short-phone-expanded-map-key.png'), fullPage: false })
      await page.locator('#map-reset').click()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      return 'At 320 by 568, named highlighted articles, the compact cluster key and Fit map remain reachable without horizontal overflow or bottom clipping.'
    })

    await check('07-legacy-projection-fallback-and-preserved-3d', async () => {
      const legacy = structuredClone(current)
      delete legacy.catalog.layout2d
      await fresh({ fixture: legacy })
      assert.equal(await page.locator('[data-view="map"]').isDisabled(), true)
      assert.equal(await page.locator('[data-view="2d"]').getAttribute('aria-pressed'), 'true')
      assert.ok(await page.locator('#flat-map [data-topic]').count() > 0)
      await page.locator('[data-view="3d"]').click()
      await page.locator('body[data-graph="ready"]').waitFor({ timeout: 15000 })
      await unchangedGraph()
      return 'An older projection uses topic cards and keeps the standalone 3D map available.'
    })

    await check('07b-malformed-layout-falls-back-without-page-error', async () => {
      const malformed = structuredClone(current)
      malformed.catalog.layout2d.nodes[0].x = 'not a coordinate'
      await fresh({ fixture: malformed })
      assert.equal(await page.locator('body').getAttribute('data-map2d'), 'unavailable')
      assert.equal(await page.locator('[data-view="map"]').isDisabled(), true)
      assert.equal(await page.locator('[data-view="2d"]').getAttribute('aria-pressed'), 'true')
      assert.ok(await page.locator('#flat-map [data-topic]').count() > 0)
      await page.locator('#flat-map [data-topic="toolchain"]').click()
      await page.locator('#read-selection').click()
      assert.equal(await page.locator('#reader-title').innerText(), current.nodes.find(item => item.id === 'toolchain').title)
      return 'Unsupported coordinates disable only the new rendering option. Cards still lead to existing articles.'
    })

    await check('07c-malformed-edge-container-falls-back', async () => {
      const malformed = structuredClone(current)
      malformed.catalog.layout2d.edges = { unexpected: 'edge object' }
      await fresh({ fixture: malformed })
      assert.equal(await page.locator('body').getAttribute('data-map2d'), 'unavailable')
      assert.equal(await page.locator('[data-view="map"]').isDisabled(), true)
      assert.equal(await page.locator('[data-view="2d"]').getAttribute('aria-pressed'), 'true')
      assert.ok(await page.locator('#flat-map [data-topic]').count() > 0)
      return 'An unsupported edge container disables only 2D rendering and retains usable topic cards.'
    })

    await check('07d-malformed-edge-entries-and-relations-are-ignored', async () => {
      const malformed = structuredClone(current)
      const actual = malformed.catalog.layout2d.edges.find(edge => [edge.from, edge.to].includes('technology:github-actions') && [edge.from, edge.to].includes('topic:github-actions') && edge.family === 'reading')
      assert.ok(actual, 'The real layout has the explanation edge used in this fixture')
      malformed.catalog.layout2d.edges = [
        null, 42, {},
        { ...actual, from: 'topic:does-not-exist' },
        { ...actual, family: 'unknown' },
        { ...actual, relations: { malformed: true } },
        { ...actual, relations: [null, {}, { from: actual.from, to: actual.to, type: 7 }, { from: 'topic:docker', to: 'topic:jira', type: 'fabricated-test-edge' }, ...actual.relations] },
      ]
      await fresh({ fixture: malformed })
      await openMap()
      await page.locator('#map-family-reading').check()
      await choose('technology:github-actions')
      assert.equal(await page.locator('body').getAttribute('data-map2d'), 'ready')
      assert.deepEqual(await page.locator('#map-neighbours [data-map-record]').evaluateAll(items => items.map(item => item.dataset.mapRecord)), ['topic:github-actions'])
      assert.doesNotMatch(await page.locator('#map-neighbours').innerText(), /fabricated|undefined/)
      assert.equal(await page.locator('#map-2d .map2d-edge').count(), 1)
      await page.locator('#map-neighbours [data-map-record="topic:github-actions"]').click()
      assert.equal(await page.locator('#map-record-title').innerText(), current.nodes.find(item => item.id === 'github-actions').title)
      return 'Malformed edge entries and relation values are skipped. A valid recorded connection remains readable and actionable.'
    })

    await check('07e-absent-projected-edges-reuse-typed-catalogue-edges', async () => {
      const older = structuredClone(current)
      delete older.catalog.layout2d.edges
      await fresh({ fixture: older })
      await openMap()
      await page.locator('#map-family-reading').check()
      await choose('technology:github-actions')
      const displayed = new Set(current.catalog.layout2d.nodes.map(item => item.id)), ref = 'technology:github-actions'
      const expected = [...new Set(current.catalog.edges.filter(edge => edge.from === ref || edge.to === ref).map(edge => edge.from === ref ? edge.to : edge.from).filter(other => other !== ref && displayed.has(other)))].sort()
      assert.deepEqual((await page.locator('#map-neighbours [data-map-record]').evaluateAll(items => items.map(item => item.dataset.mapRecord))).sort(), expected)
      assert.ok(await page.locator('#map-2d .map2d-edge').count() > 0)
      await page.locator('#map-neighbours [data-map-record="topic:github-actions"]').click()
      assert.equal(await page.locator('#map-record-title').innerText(), current.nodes.find(item => item.id === 'github-actions').title)
      return 'With the optional projected edge list absent, both the graph and Neighbours list derive real relationships from the existing typed catalogue edges.'
    })

    await check('08-embedded-map-preserves-exact-project-downloads', async () => {
      const wanted = 'Let customers save filters and reopen the same criteria.'
      await fresh({ url: `${base}/factory/#brief` })
      await page.locator('#jev-brief').fill(wanted)
      await page.locator('[data-start-recipe="feature-delivery"]').click()
      await page.locator('#jev-create').click()
      await page.locator('#project-name').fill('2D map reading trial')
      const before = await downloadProject('before-map-reading')
      const apiCount = report.apiRequests.length
      await page.locator('.main-navigation [data-main-view="knowledge"]').click()
      const frame = page.frameLocator('#knowledge-frame')
      await openMap(frame)
      await frame.locator('#map-subject').selectOption('ci-pipelines')
      await choose('technology:github-actions', frame)
      await frame.locator('#map-record-read').click()
      await frame.locator('#knowledge-back').click()
      assert.equal(await page.locator('#project-name').inputValue(), '2D map reading trial')
      assert.equal(await page.locator('#project-purpose').inputValue(), wanted)
      await page.locator('.main-navigation [data-main-view="brief"]').click()
      const after = await downloadProject('after-map-reading')
      assert.deepEqual(after, before, 'Exact project decisions are unchanged by map browsing')
      assert.equal(report.apiRequests.length, apiCount, 'Map browsing does not call inference')
      return { projectDownloadsEqual: true, inferenceRequestsWhileBrowsing: 0 }
    })

    await check('09-self-contained-offline-map-and-3d', async () => {
      execFileSync(process.execPath, ['tools/export-atlas.cjs'], { cwd: root, stdio: 'pipe' })
      const offlinePath = path.join(output, 'Workflow Atlas.html')
      await fs.copyFile(path.join(root, 'exports/Workflow Atlas.html'), offlinePath)
      if (context) { await collectStorage(); await context.close() }
      context = await browser.newContext({ offline: true, viewport: { width: 1440, height: 1000 }, reducedMotion: 'reduce' })
      page = await context.newPage()
      page.setDefaultTimeout(10000)
      const remote = []
      page.on('pageerror', error => report.errors.push(error.message))
      page.on('request', request => { if (/^https?:/.test(request.url())) remote.push(request.url()) })
      await page.goto(pathToFileURL(offlinePath).href)
      await openMap()
      await page.locator('#map-subject').selectOption('containers')
      await choose('topic:docker')
      await page.locator('#map-record-read').click()
      assert.equal(await page.evaluate(() => ATLAS_STATE.selected), 'docker')
      await page.locator('.mode-nav [data-mode="explore"]').click()
      await page.locator('[data-view="3d"]').click()
      await page.locator('body[data-graph="ready"]').waitFor({ timeout: 15000 })
      await page.locator('[data-view="2d"]').click()
      assert.ok(await page.locator('#flat-map [data-topic="docker"]').count() > 0)
      assert.deepEqual(remote, [])
      await unchangedGraph()
      return { exportBytes: (await fs.stat(offlinePath)).size, httpRequests: 0, mapViews: ['2D map', '3D map', 'Topic cards'] }
    })

    await collectStorage()
    assert.deepEqual(report.errors, [], 'No page errors')
    assert.deepEqual(report.storageWrites, [], 'No browser storage writes')
    await persist()
    const failed = report.checks.filter(item => item.status !== 'Pass')
    assert.equal(failed.length, 0, `${failed.length} map checks failed. See ${output}`)
    process.stdout.write(`PASS ${report.checks.length} map checks. Evidence: ${output}\n`)
  } finally {
    if (browser) await browser.close()
    if (server) await new Promise(resolve => server.close(resolve))
  }
}

run().catch(async error => { report.failure = error.stack || String(error); await persist().catch(() => {}); console.error(error); process.exitCode = 1 })
