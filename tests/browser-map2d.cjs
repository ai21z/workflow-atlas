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

async function findMapRecord(ref, query, target = page) {
  await target.locator('#map-find').click()
  await target.locator('#map-find-search').fill(query)
  await target.locator(`#map-find-results [data-map-find-record="${ref}"]`).click()
}

async function visibleFocus(id) {
  const measured = await page.evaluate(id => {
    const item = document.getElementById(id), rect = item.getBoundingClientRect(), header = document.querySelector('.topbar').getBoundingClientRect()
    return { focused: document.activeElement === item, top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, headerBottom: header.bottom, width: innerWidth, height: innerHeight }
  }, id)
  assert.equal(measured.focused, true, `${id} receives keyboard focus`)
  assert.ok(measured.top >= measured.headerBottom - 1 && measured.bottom <= measured.height + 1, `${id} is visible below the sticky header: ${JSON.stringify(measured)}`)
  assert.ok(measured.left >= 0 && measured.right <= measured.width + 1, `${id} fits the viewport width`)
  return measured
}

async function insideViewBox(ref, target = page) {
  const [left, top, width, height] = (await target.locator('#map-2d svg').getAttribute('viewBox')).split(/\s+/).map(Number)
  const position = (await node(ref, target).getAttribute('transform')).match(/translate\(([-\d.e]+)[ ,]+([-\d.e]+)\)/)
  assert.ok(position, 'A rendered node exposes its fixed SVG position')
  const x = Number(position[1]), y = Number(position[2])
  return x >= left && x <= left + width && y >= top && y <= top + height
}

async function clusterLabelClearances({ fitted = true } = {}) {
  await settleMap()
  const memberships = current.catalog.layout2d.clusters.map(cluster => ({ id: cluster.id, records: current.catalog.layout2d.nodes.filter(item => item.clusterId === cluster.id).map(item => item.id) }))
  const clearances = await page.evaluate(({ groups, fitted }) => groups.map(({ id, records }) => {
    const svgBounds = document.querySelector('#map-2d svg').getBoundingClientRect()
    const cluster = document.querySelector(`#map-2d .map2d-cluster[data-cluster="${id}"]`)
    const labels = [...cluster.querySelectorAll('.map2d-cluster-name, .map2d-cluster-count')].filter(item => getComputedStyle(item).display !== 'none')
    const rectangles = labels.map(item => item.getBoundingClientRect())
    const labelBottom = Math.max(...rectangles.map(rect => rect.bottom))
    const block = { left: Math.min(...rectangles.map(rect => rect.left)), right: Math.max(...rectangles.map(rect => rect.right)), top: Math.min(...rectangles.map(rect => rect.top)), bottom: labelBottom }
    const visibleBlock = { left: Math.max(block.left, svgBounds.left), right: Math.min(block.right, svgBounds.right), top: Math.max(block.top, svgBounds.top), bottom: Math.min(block.bottom, svgBounds.bottom) }
    const labelInsets = labels.map(item => {
      const rect = item.getBoundingClientRect()
      return { text: item.textContent, renderedFontSize: parseFloat(getComputedStyle(item).fontSize) * item.getScreenCTM().a, expectedFontSize: item.classList.contains('map2d-cluster-name') ? 14 : 11, left: rect.left - svgBounds.left, right: svgBounds.right - rect.right, top: rect.top - svgBounds.top, bottom: svgBounds.bottom - rect.bottom }
    })
    const shapes = records.map(ref => document.querySelector(`#map-2d .map2d-node[data-record="${ref}"] .map2d-shape`))
    const foreignGlyphs = [...document.querySelectorAll('#map-2d .map2d-node')].filter(group => !records.includes(group.dataset.record)).map(group => {
      const rect = group.querySelector('.map2d-shape').getBoundingClientRect()
      const visible = { left: Math.max(rect.left, svgBounds.left), right: Math.min(rect.right, svgBounds.right), top: Math.max(rect.top, svgBounds.top), bottom: Math.min(rect.bottom, svgBounds.bottom) }
      const glyph = fitted ? rect : visible, heading = fitted ? block : visibleBlock
      if (!fitted && (glyph.left >= glyph.right || glyph.top >= glyph.bottom || heading.left >= heading.right || heading.top >= heading.bottom)) return null
      return { id: group.dataset.record, separation: Math.max(heading.left - glyph.right, glyph.left - heading.right, heading.top - glyph.bottom, glyph.top - heading.bottom) }
    }).filter(Boolean).sort((a, b) => a.separation - b.separation)
    const nodeLabels = [...document.querySelectorAll('#map-2d .map2d-label')].filter(label => getComputedStyle(label).display !== 'none').map(label => {
      const rect = label.getBoundingClientRect()
      const visible = { left: Math.max(rect.left, svgBounds.left), right: Math.min(rect.right, svgBounds.right), top: Math.max(rect.top, svgBounds.top), bottom: Math.min(rect.bottom, svgBounds.bottom) }
      const heading = fitted ? block : visibleBlock
      if (visible.left >= visible.right || visible.top >= visible.bottom || heading.left >= heading.right || heading.top >= heading.bottom) return null
      return { id: label.dataset.record, text: label.textContent, separation: Math.max(heading.left - visible.right, visible.left - heading.right, heading.top - visible.bottom, visible.top - heading.bottom) }
    }).filter(Boolean).sort((a, b) => a.separation - b.separation)
    return { id, context: `${innerWidth}x${innerHeight}, subject ${document.querySelector('#map-subject').value || 'all'}`, labelBottom, labelInsets, block, visibleBlock, closestForeignGlyph: foreignGlyphs[0] || null, closestNodeLabel: nodeLabels[0] || null, shapeCount: shapes.length, shapeTop: Math.min(...shapes.map(item => item.getBoundingClientRect().top)) }
  }), { groups: memberships, fitted })
  for (const item of clearances) {
    assert.ok(item.shapeCount > 0, `${item.id} contains actual rendered shapes`)
    item.clearance = item.shapeTop - item.labelBottom
    assert.ok(item.clearance > 0, `${item.id} heading and count must sit above its own node shapes, actual clearance ${item.clearance}px`)
    for (const label of item.labelInsets) assert.ok(label.renderedFontSize >= label.expectedFontSize - .1, `${item.context}: ${item.id} label "${label.text}" must retain its ${label.expectedFontSize}px screen font size, actual ${label.renderedFontSize}px`)
    if (item.closestForeignGlyph) assert.ok(item.closestForeignGlyph.separation >= 4, `${item.context}: ${item.id} heading/count block must keep 4px clear of foreign glyph ${item.closestForeignGlyph.id}, actual ${item.closestForeignGlyph.separation}px`)
    if (item.closestNodeLabel) assert.ok(item.closestNodeLabel.separation >= 4, `${item.context}: ${item.id} heading/count block must keep 4px clear of visible node label ${item.closestNodeLabel.id}, actual ${item.closestNodeLabel.separation}px`)
    for (const label of fitted ? item.labelInsets : []) for (const side of ['left', 'right', 'top', 'bottom']) {
      assert.ok(label[side] >= 4, `${item.id} label "${label.text}" must fit inside the SVG with a 4px inset on ${side}, actual inset ${label[side]}px`)
    }
  }
  const visible = clearances.filter(item => item.visibleBlock.right > item.visibleBlock.left && item.visibleBlock.bottom > item.visibleBlock.top)
  let minimumSeparation = Infinity
  for (let a = 0; a < visible.length; a++) for (let b = a + 1; b < visible.length; b++) {
    const left = visible[a], right = visible[b], first = fitted ? left.block : left.visibleBlock, second = fitted ? right.block : right.visibleBlock
    const separation = Math.max(first.left - second.right, second.left - first.right, first.top - second.bottom, second.top - first.bottom)
    assert.ok(separation >= 4, `${left.context}: ${left.id} and ${right.id} heading/count blocks need at least 4px separation, actual ${separation}px`)
    minimumSeparation = Math.min(minimumSeparation, separation)
  }
  return clearances.map(({ id, clearance, labelInsets, block, closestForeignGlyph, closestNodeLabel }) => ({ id, clearance, labelInsets, block, closestForeignGlyph, closestNodeLabel, minimumVisibleBlockSeparation: Number.isFinite(minimumSeparation) ? minimumSeparation : null }))
}

async function settleMap() {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

async function fittedMapBounds() {
  await settleMap()
  const viewBox = (await page.locator('#map-2d svg').getAttribute('viewBox')).split(/\s+/).map(Number)
  assert.equal(viewBox.length, 4)
  assert.ok(viewBox.every(Number.isFinite) && viewBox[2] > 0 && viewBox[3] > 0, 'Fit map has a finite camera with a positive extent')
  const clusterLabels = await clusterLabelClearances()
  const measured = await page.evaluate(() => {
    const bounds = document.querySelector('#map-2d svg').getBoundingClientRect()
    const source = new Map(TOPIC_DATA.catalog.layout2d.nodes.map(node => [node.id, node]))
    const glyphs = [...document.querySelectorAll('#map-2d .map2d-node')].map(group => {
      const rect = group.querySelector('.map2d-shape').getBoundingClientRect()
      return { id: group.dataset.record, width: rect.width, sourceDiameter: source.get(group.dataset.record).radius * 2, left: rect.left - bounds.left, right: bounds.right - rect.right, top: rect.top - bounds.top, bottom: bounds.bottom - rect.bottom }
    })
    return { glyphs, possibleBaseScale: Math.min(bounds.width / TOPIC_DATA.catalog.layout2d.width, bounds.height / TOPIC_DATA.catalog.layout2d.height) }
  })
  const glyphs = measured.glyphs
  assert.equal(glyphs.length, current.catalog.layout2d.nodes.length)
  for (const glyph of glyphs) assert.ok(glyph.width + .01 >= glyph.sourceDiameter * measured.possibleBaseScale / 2, `${glyph.id} must retain at least half the possible base map scale, actual rendered width ${glyph.width}px`)
  for (const glyph of glyphs) for (const side of ['left', 'right', 'top', 'bottom']) {
    assert.ok(glyph[side] >= 4, `${glyph.id} glyph must fit inside the SVG with a 4px inset on ${side}, actual inset ${glyph[side]}px`)
  }
  return { viewBox, clusterLabels, fittedGlyphs: glyphs.length, possibleBaseScale: measured.possibleBaseScale, minimumRenderedScale: Math.min(...glyphs.map(glyph => glyph.width / glyph.sourceDiameter)) }
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
        assert.match(await page.locator('#map-neighbours').innerText(), /explained by this guide/i)
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
      await settleMap()
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
      await settleMap()
      assert.equal(await svg.getAttribute('viewBox'), original)
      await fittedMapBounds()
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
      await fittedMapBounds()
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
        const clearances = await clusterLabelClearances()
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
      await fittedMapBounds()
      await key.locator('.map2d-key-details > summary').click()
      await fittedMapBounds()
      await key.locator('.map2d-cluster-key li').last().scrollIntoViewIfNeeded()
      assert.equal(await key.locator('.map2d-cluster-key li').count(), current.catalog.layout2d.clusters.length)
      await assertKeyFits()
      await page.screenshot({ path: path.join(output, 'short-phone-expanded-map-key.png'), fullPage: false })
      await page.locator('#map-reset').click()
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      return 'At 320 by 568, named highlighted articles, the compact cluster key and Fit map remain reachable without horizontal overflow or bottom clipping.'
    })

    for (const theme of ['light', 'dark']) await check(`06c-short-desktop-fit-headings-${theme}`, async () => {
      await fresh({ width: 1280, height: 720, theme })
      const observations = []
      for (const subject of ['', 'ci-pipelines', 'containers', '']) {
        await page.locator('#map-subject').selectOption(subject)
        const automatic = await fittedMapBounds()
        await page.locator('#map-reset').click()
        const explicit = await fittedMapBounds()
        assert.deepEqual(explicit.viewBox, automatic.viewBox, 'Changing subject controls while fitted updates the same complete Fit map camera')
        await page.locator('#map-reset').click()
        assert.deepEqual((await fittedMapBounds()).viewBox, explicit.viewBox, 'Repeated Fit map is stable for the same viewport and subject')
        observations.push({ subject: subject || 'all', ...explicit })
        if (subject === 'ci-pipelines') {
          await page.locator('#map-2d svg').scrollIntoViewIfNeeded()
          await page.screenshot({ path: path.join(output, `short-desktop-fit-ci-${theme}.png`), fullPage: false })
        }
      }
      await unchangedGraph()
      return observations
    })

    for (const theme of ['light', 'dark']) await check(`06d-responsive-fit-and-manual-camera-${theme}`, async () => {
      await fresh({ width: 390, height: 720, theme })
      await page.locator('#map-subject').selectOption('ci-pipelines')
      const observations = []
      for (const width of [390, 320, 1280]) {
        await page.setViewportSize({ width, height: 720 })
        const automatic = await fittedMapBounds()
        await page.locator('#map-reset').click()
        const explicit = await fittedMapBounds()
        assert.deepEqual(explicit.viewBox, automatic.viewBox, 'A fitted camera adapts to the actual SVG dimensions after resizing')
        observations.push({ width, ...explicit })
      }
      const svg = page.locator('#map-2d svg'), fitted = await svg.getAttribute('viewBox')
      await page.locator('#zoom-in').click()
      await svg.press('ArrowRight')
      await svg.press('ArrowDown')
      await settleMap()
      const manual = await svg.getAttribute('viewBox')
      assert.notEqual(manual, fitted, 'The user intentionally zoomed and panned away from Fit map')
      const selected = await page.evaluate(() => ATLAS_STATE.mapRecord)
      for (const subject of ['', 'containers', 'ci-pipelines', '']) {
        await page.locator('#map-subject').selectOption(subject)
        await settleMap()
        assert.equal(await svg.getAttribute('viewBox'), manual, 'Subject controls do not replace an intentionally panned or zoomed camera')
      }
      for (const width of [390, 320, 1280]) {
        await page.setViewportSize({ width, height: 720 })
        await settleMap()
        assert.equal(await svg.getAttribute('viewBox'), manual, 'Resizing preserves the user camera until Fit map is requested')
      }
      assert.equal(await page.evaluate(() => ATLAS_STATE.mapRecord), selected, 'Fitting and resizing do not change the selected record')
      await page.locator('#map-reset').click()
      const restored = await fittedMapBounds()
      assert.notEqual((await svg.getAttribute('viewBox')), manual, 'Fit map restores a complete view after manual navigation')
      await page.locator('#map-2d svg').scrollIntoViewIfNeeded()
      await page.screenshot({ path: path.join(output, `resized-fit-desktop-${theme}.png`), fullPage: false })
      await unchangedGraph()
      return { fittedSequence: observations, manualViewBox: manual, restored }
    })

    for (const theme of ['light', 'dark']) await check(`06e-small-desktop-cluster-label-spacing-${theme}`, async () => {
      const observations = []
      for (const width of [1024, 1280]) {
        await fresh({ width, height: 600, theme })
        const subjects = await page.locator('#map-subject option').evaluateAll(options => options.map(option => option.value).filter(Boolean))
        assert.equal(subjects.length, current.catalog.subjects.length)
        for (const subject of ['', ...subjects, '']) {
          await page.locator('#map-subject').selectOption(subject)
          const fitted = await fittedMapBounds()
          observations.push({ width, height: 600, subject: subject || 'all', ...fitted })
          if (['ci-pipelines', 'workflow-measurements'].includes(subject)) {
            await page.locator('#map-2d svg').scrollIntoViewIfNeeded()
            await page.screenshot({ path: path.join(output, `small-desktop-${width}-${subject === 'ci-pipelines' ? 'ci' : subject}-${theme}.png`), fullPage: false })
          }
        }
      }
      await unchangedGraph()
      return observations
    })

    for (const theme of ['light', 'dark']) await check(`06f-zoomed-cluster-label-spacing-${theme}`, async () => {
      const observations = []
      for (const width of [1280, 390, 320]) {
        await fresh({ width, height: 720, theme })
        await page.locator('#map-subject').selectOption('ci-pipelines')
        const svg = page.locator('#map-2d svg')
        await fittedMapBounds()
        if (width < 620) {
          await page.locator('.map2d-key-details > summary').click()
          await fittedMapBounds()
        }
        for (let zoomStep = 1; zoomStep <= 4; zoomStep++) {
          await page.locator('#zoom-in').click()
          const labels = await clusterLabelClearances({ fitted: false })
          observations.push({ width, zoomStep, viewBox: await svg.getAttribute('viewBox'), labels })
        }
        await svg.press('ArrowRight')
        await svg.press('ArrowUp')
        observations.push({ width, state: 'panned', labels: await clusterLabelClearances({ fitted: false }) })
        await page.locator('#map-reset').click()
        observations.push({ width, state: 'restored fit', ...await fittedMapBounds() })
        await svg.scrollIntoViewIfNeeded()
        await page.screenshot({ path: path.join(output, `cluster-spacing-${width}-${theme}.png`), fullPage: false })
      }
      await unchangedGraph()
      return observations
    })

    for (const { width, height } of [{ width: 1440, height: 900 }, { width: 390, height: 844 }]) for (const theme of ['light', 'dark']) await check(`06g-map-find-visible-selection-${width}-${theme}`, async () => {
      await fresh({ width, height, theme })
      await page.locator('#map-subject').selectOption('containers')
      await page.locator('#map-find').click()
      await page.locator('#map-find-search').fill('')
      assert.equal(await page.locator('#map-find-results [data-map-find-record]').count(), current.catalog.layout2d.nodes.length, 'Map finding includes every guide, practice and technology node')
      assert.match(await page.locator('#map-find-help').innerText(), /all subjects/i)
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('#map-find').evaluate(button => button === document.activeElement), true, 'Closing a button-opened finder restores focus to its opening button')
      await page.locator('#map-find').click()
      await page.locator('#map-find-search').fill('ci')
      const ciResults = await page.locator('#map-find-results [data-map-find-record]').evaluateAll(items => items.map(item => item.dataset.mapFindRecord))
      assert.ok(ciResults.includes('topic:github-actions') && ciResults.includes('topic:jenkins'), 'The CI abbreviation finds the real pipeline guides')
      const architectureRef = 'topic:' + current.nodes.find(item => item.title === 'Architecture decisions').id
      const architectureAt = ciResults.indexOf(architectureRef)
      assert.ok(architectureAt < 0 || architectureAt > Math.max(ciResults.indexOf('topic:github-actions'), ciResults.indexOf('topic:jenkins')), 'The substring inside decisions must not outrank the actual CI aliases')
      await page.locator('#map-find-search').fill('GitHub Actions')
      const guide = page.locator('#map-find-results [data-map-find-record="topic:github-actions"]')
      const technology = page.locator('#map-find-results [data-map-find-record="technology:github-actions"]')
      assert.match(await guide.innerText(), /Guide/)
      assert.match(await technology.innerText(), /Technology/)
      assert.match(await technology.getAttribute('aria-label'), /Show GitHub Actions on map/)
      await technology.press('Enter')
      assert.equal(await page.locator('#map-find-dialog').evaluate(dialog => dialog.open), false)
      assert.equal(await page.evaluate(() => ATLAS_STATE.mode), 'explore')
      assert.equal(await page.evaluate(() => ATLAS_STATE.view), 'map')
      assert.equal(await page.evaluate(() => ATLAS_STATE.mapRecord), 'technology:github-actions')
      assert.equal(await page.locator('#map-subject').inputValue(), 'containers', 'Finding across all subjects does not silently reset the chosen highlight')
      assert.equal(await insideViewBox('technology:github-actions'), true)
      const selected = await visibleFocus('map-selected-name')
      assert.equal(await page.locator('#map-selected-name').innerText(), 'GitHub Actions')
      assert.match(await page.locator('#map-selected-kind').innerText(), /Technology/)
      assert.match(await page.locator('#map-open-details').innerText(), /Details and connections \(\d+\)/)
      await page.screenshot({ path: path.join(output, `map-find-selection-${width}-${theme}.png`), fullPage: false })
      await page.locator('#map-open-details').click()
      const details = await visibleFocus('map-record-title')
      await page.locator('#map-neighbours [data-map-record="topic:github-actions"]').click()
      assert.equal(await page.evaluate(() => ATLAS_STATE.mapRecord), 'topic:github-actions')
      await visibleFocus('map-record-title')
      assert.equal(await page.evaluate(() => ATLAS_STATE.mode), 'explore', 'A named connection selects without opening the reading view')
      await page.locator('#map-return').click()
      await visibleFocus('map-selected-name')
      await page.keyboard.press('/')
      assert.equal(await page.locator('#map-find-dialog').evaluate(dialog => dialog.open), true, 'Slash opens the map finder while exploring the map')
      assert.equal(await page.locator('#map-find-search').evaluate(input => input === document.activeElement), true)
      await page.locator('#map-find-search').fill('unfindable atlas item 938572')
      assert.equal(await page.locator('#map-find-results [data-map-find-record]').count(), 0)
      assert.match(await page.locator('#map-find-count').innerText(), /^0 of /)
      assert.match(await page.locator('#map-find-results').innerText(), /No map items match/)
      await page.locator('#map-find-search').press('ControlOrMeta+A')
      await page.locator('#map-find-search').press('Backspace')
      assert.equal(await page.locator('#map-find-results [data-map-find-record]').count(), current.catalog.layout2d.nodes.length)
      await page.keyboard.press('Escape')
      assert.equal(await page.locator('#map-find-dialog').evaluate(dialog => dialog.open), false)
      await visibleFocus('map-selected-name')
      await findMapRecord('practice:agents-md', 'AGENTS.md')
      assert.match(await page.locator('#map-selected-kind').innerText(), /Practice/)
      await findMapRecord('technology:spring-boot', 'Spring Boot')
      assert.match(await page.locator('#map-selected-kind').innerText(), /No guide recorded/)
      await page.locator('#map-open-details').click()
      assert.equal(await page.locator('#map-record-read').isVisible(), false)
      assert.match(await page.locator('#map-neighbours').innerText(), /Catalogue name only/)
      assert.equal(await page.locator('#map-neighbours [data-map-record]').count(), 0, 'An isolated catalogue name does not invent related guidance')
      await findMapRecord('topic:github-actions', 'GitHub Actions')
      await page.locator('#map-open-details').click()
      await page.locator('#map-record-read').click()
      assert.equal(await page.evaluate(() => ATLAS_STATE.mode), 'read', 'Reading remains an explicit separate action')
      assert.equal(await page.locator('#reader-title').innerText(), 'GitHub Actions')
      assert.deepEqual(await page.locator('#breadcrumbs [data-topic]').evaluateAll(items => items.map(item => item.dataset.topic)), ['overview', 'toolchain'])
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
      await unchangedGraph()
      return { width, height, theme, selected, details, searchedMapNodes: current.catalog.layout2d.nodes.length, explicitReading: true }
    })

    await check('06h-readable-directed-inverse-and-symmetric-connections', async () => {
      await fresh()
      await page.locator('#map-family-reading').check()
      await findMapRecord('technology:docker', 'Docker')
      await page.locator('#map-open-details').click()
      const explanation = page.locator('#map-neighbours [data-map-record="topic:docker"]')
      assert.match(await explanation.innerText(), /Explained by this guide/)
      assert.doesNotMatch(await explanation.innerText(), /Incoming:|explained by,|explains,/)
      const why = explanation.locator('..').locator('details.map-relation-details')
      assert.equal(await why.evaluate(details => details.open), false, 'Original technical relationship details are available on demand')
      await why.locator('summary').click()
      assert.match(await why.innerText(), /Docker \(Technology\) → explained by → Docker \(Guide\)/)
      assert.match(await why.innerText(), /No sources recorded for this relationship/)
      const pending = page.locator('#map-neighbours [data-map-record="technology:python"]')
      assert.match(await pending.locator('.map-relation-warning').innerText(), /needs review/i)
      const pendingWhy = pending.locator('..').locator('details.map-relation-details')
      await pendingWhy.locator('summary').click()
      assert.match(await pendingWhy.innerText(), /uv Docker guide/)
      assert.ok((await pendingWhy.locator('a').evaluateAll(links => links.map(link => link.href))).includes(current.sources['uv-docker'][1]))
      const symmetric = page.locator('#map-neighbours [data-map-record="technology:nodejs"]')
      assert.equal((await symmetric.innerText()).match(/Works with this item/g).length, 1)
      const symmetricLine = page.locator('#map-2d .map2d-edge[data-from="technology:docker"][data-to="technology:nodejs"]')
      assert.equal(await symmetricLine.getAttribute('data-directed'), 'false')
      assert.equal(await symmetricLine.getAttribute('marker-start'), null)
      assert.equal(await symmetricLine.getAttribute('marker-end'), null)
      const explanationLine = page.locator('#map-2d .map2d-edge[data-from="technology:docker"][data-to="topic:docker"][data-edge-family="reading"]')
      assert.equal(await explanationLine.getAttribute('data-directed'), 'true')
      assert.ok(await explanationLine.getAttribute('marker-end'))
      await findMapRecord('technology:neptune', 'Neptune')
      const derivedOnly = current.catalog.layout2d.edges.find(edge => edge.from === 'technology:neptune' && edge.to === 'topic:amazon-neptune' && edge.family === 'applies')
      assert.ok(derivedOnly.relations.every(relation => relation.derived), 'The real catalogue case contains only a generated relation and its inverse')
      const derivedLine = page.locator('#map-2d .map2d-edge[data-from="technology:neptune"][data-to="topic:amazon-neptune"][data-edge-family="applies"]')
      assert.equal(await derivedLine.getAttribute('data-directed'), 'true')
      assert.ok(await derivedLine.getAttribute('marker-start'), 'The actual applies-to direction points from the guide to the technology')
      assert.equal(await derivedLine.getAttribute('marker-end'), null, 'A generated inverse does not invent an opposing direction')
      await findMapRecord('technology:docker', 'Docker')
      await page.locator('#map-open-details').click()
      await explanation.click()
      assert.match(await page.locator('#map-neighbours [data-map-record="technology:docker"]').innerText(), /Explains this item/)
      await findMapRecord('technology:github-actions', 'GitHub Actions')
      await page.locator('#map-open-details').click()
      const applies = await page.locator('#map-neighbours [data-map-record="topic:github-actions"]').innerText()
      assert.equal((applies.match(/Guidance that applies here/g) || []).length, 1, 'Equivalent explicit and inverse predicates have one human explanation')
      assert.doesNotMatch(applies, /Incoming:|applied by,|applies to,/)
      await findMapRecord('practice:agents-md', 'AGENTS.md')
      await page.locator('#map-open-details').click()
      const independent = await page.locator('#map-neighbours [data-map-record="topic:agents-md"]').innerText()
      assert.equal((independent.match(/Explained by this guide/g) || []).length, 1)
      assert.equal((independent.match(/Used by this guide/g) || []).length, 1, 'Different explanation and definition-use meanings remain distinct')
      await unchangedGraph()
      return { symmetricArrowheads: false, generatedInverseHasOneArrowhead: true, outgoingAndInverseExplanations: true, reciprocalDeduplication: true, independentMeaningsPreserved: true, pendingRelationshipNotesAndSources: true }
    })

    await check('06i-hidden-connections-recovery-and-real-isolation', async () => {
      await fresh({ width: 390, height: 844 })
      await findMapRecord('technology:github-actions', 'GitHub Actions')
      await page.locator('#map-open-details').click()
      for (const family of ['structure', 'applies', 'reading']) await page.locator('#map-family-' + family).uncheck()
      assert.match(await page.locator('#map-neighbours').innerText(), /hidden by the current filters/)
      await page.locator('.map-show-connections').press('Enter')
      for (const family of ['structure', 'applies', 'reading']) assert.equal(await page.locator('#map-family-' + family).isChecked(), true)
      assert.ok(await page.locator('#map-neighbours [data-map-record]').count() > 0)
      await findMapRecord('technology:spring-boot', 'Spring Boot')
      await page.locator('#map-open-details').click()
      assert.match(await page.locator('#map-neighbours').innerText(), /Catalogue name only/)
      assert.equal(await page.locator('.map-show-connections').count(), 0, 'An isolated item does not offer to reveal invented connections')
      await unchangedGraph()
      return 'Phone keyboard users can reveal genuinely filtered connections, while an isolated catalogue name remains truthfully unconnected.'
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

    await check('07f-mismatched-relation-cannot-invent-a-guide', async () => {
      const malformed = structuredClone(current)
      const explanation = { from: 'technology:spring-boot', to: 'topic:docker', type: 'explained-by', sourceRefs: [] }
      malformed.catalog.layout2d.edges.push(
        { from: 'technology:docker', to: 'topic:docker', family: 'reading', relations: [explanation] },
        { from: explanation.from, to: explanation.to, family: 'unknown', relations: [explanation] },
      )
      const actual = malformed.catalog.layout2d.edges.find(edge => edge.from === 'technology:github-actions' && edge.to === 'topic:github-actions' && edge.family === 'reading')
      actual.relations = actual.relations.map(relation => ({ ...relation, sourceRefs: { malformed: true } }))
      await fresh({ fixture: malformed })
      await page.locator('#map-family-reading').check()
      await findMapRecord('technology:spring-boot', 'Spring Boot')
      assert.match(await page.locator('#map-selected-kind').innerText(), /No guide recorded/)
      await page.locator('#map-open-details').click()
      assert.equal(await page.locator('#map-record-read').isVisible(), false, 'A relation nested under different endpoints or an unsupported family cannot fabricate a reading target')
      assert.equal(await page.locator('#map-neighbours [data-map-record]').count(), 0)
      await findMapRecord('technology:github-actions', 'GitHub Actions')
      await page.locator('#map-open-details').click()
      const why = page.locator('#map-neighbours [data-map-record="topic:github-actions"]').locator('..').locator('.map-relation-details')
      await why.locator('summary').click()
      assert.match(await why.innerText(), /No sources recorded for this relationship/)
      assert.equal(await why.locator('a').count(), 0, 'Malformed relationship source metadata does not invent source links or break the readable connection')
      assert.equal(await page.locator('body').getAttribute('data-map2d'), 'ready')
      return 'Reading targets use validated edge endpoints and families. Unsupported source containers are treated as absent source metadata.'
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
      await findMapRecord('technology:docker', 'Docker')
      await visibleFocus('map-selected-name')
      await page.locator('#map-open-details').click()
      await visibleFocus('map-record-title')
      await page.locator('#map-family-reading').check()
      assert.match(await page.locator('#map-neighbours [data-map-record="topic:docker"]').innerText(), /Explained by this guide/)
      await page.locator('#map-neighbours [data-map-record="topic:docker"]').locator('..').locator('summary').click()
      assert.match(await page.locator('#map-neighbours [data-map-record="topic:docker"]').locator('..').innerText(), /Docker \(Technology\) → explained by → Docker \(Guide\)/)
      await page.locator('#map-return').click()
      await visibleFocus('map-selected-name')
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
