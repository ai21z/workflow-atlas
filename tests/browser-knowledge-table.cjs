const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { pathToFileURL } = require('node:url')
const { briefView } = require('./browser-workspace-helpers.cjs')

let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright')) }

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'local-knowledge/retests/knowledge-table', new Date().toISOString().replace(/[:.]/g, '-'))
const report = {
  startedAt: new Date().toISOString(),
  method: 'Installed Chrome, independently read authored catalogue records, public controls, actual project JSON downloads and a self-contained offline export. No application state injection or live inference.',
  limits: 'Functional browser simulation and screenshots. No remote source availability guarantee, human comprehension study, screen reader audit or physical mobile-device test.',
  checks: [], errors: [], downloads: [], remoteRequests: [], providerCalls: 0,
}
let browser, context, page, server, base, authored, sources, stages, areas, ordered, linkedSources

async function persist() {
  report.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n')
  await fs.writeFile(path.join(output, 'report.md'), [
    '# All knowledge table browser trial', '', report.method, '', report.limits, '',
    `Observed checks: ${report.checks.filter(item => item.status === 'Pass').length}/${report.checks.length} passed.`,
    `Browser errors: ${report.errors.length}. Provider calls: ${report.providerCalls}.`, '',
    ...report.checks.map(item => `- ${item.id}: ${item.status}${item.error ? '. ' + item.error.split('\n')[0] : ''}`), '',
    'Exact filter memberships, link targets, dimensions and downloaded project paths are retained in results.json.', '',
  ].join('\n'))
}

async function check(id, action) {
  const record = { id, status: 'Not run' }
  report.checks.push(record)
  try { record.observation = await action(); record.status = 'Pass' }
  catch (error) { record.status = 'Fail'; record.error = error.stack || String(error); process.stderr.write(`${id}: ${record.error.split('\n')[0]}\n`) }
  await persist()
  process.stdout.write(`${id}: ${record.status}\n`)
}

function instrument(target, offline = false) {
  target.on('pageerror', error => report.errors.push(error.message))
  if (offline) target.on('request', request => { if (/^https?:/.test(request.url())) report.remoteRequests.push(request.url()) })
}

async function fresh({ width = 1440, height = 1000, theme = 'light', url, offline = false } = {}) {
  if (context) await context.close()
  context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, reducedMotion: 'reduce', offline })
  context.on('page', target => instrument(target, offline))
  page = await context.newPage()
  page.setDefaultTimeout(10000)
  await page.goto(url || `${base}/atlas/?view=knowledge&theme=${theme}#overview`)
  if (!url || offline) await page.locator('#knowledge-library').waitFor({ state: 'visible' })
}

function tools(target = page) {
  const section = target.locator('#knowledge-library')
  return {
    section,
    table: section.getByRole('table', { name: 'All knowledge', exact: true }),
    search: section.getByRole('searchbox', { name: 'Search all knowledge', exact: true }),
    stage: section.getByRole('combobox', { name: 'Workflow step', exact: true }),
    topic: section.getByRole('combobox', { name: 'Topic area', exact: true }),
    source: section.getByRole('combobox', { name: 'Source', exact: true }),
    clear: section.locator('#knowledge-clear'), status: section.locator('#knowledge-count'),
    empty: section.locator('#knowledge-empty'), wrap: section.locator('#knowledge-table-wrap'),
  }
}

async function visibleIds(target = page) {
  return tools(target).table.locator('tbody tr:not([hidden])').evaluateAll(rows => rows.map(row => row.dataset.knowledgeId))
}

function rowStages(topic) { return topic.catalog.applies?.stages || [] }
function stageIds(id) { return ordered.filter(topic => id === '__none__' ? !rowStages(topic).length : rowStages(topic).includes(id)).map(topic => topic.id) }
function areaIds(id) { return ordered.filter(topic => topic.areaId === id).map(topic => topic.id) }
function sourceIds(id) { return ordered.filter(topic => id === '__none__' ? !topic.refs.length : topic.refs.includes(id)).map(topic => topic.id) }

async function options(select) {
  return select.locator('option').evaluateAll(elements => elements.map(option => ({ value: option.value, label: option.textContent.trim() })))
}

async function downloadProject(label) {
  await page.locator('#download-project').click()
  const extras = page.locator('#download-dialog .other-downloads')
  if (await extras.getAttribute('open') === null) await extras.locator('summary').click()
  const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-studio-action="download-json"]').click()])
  const destination = path.join(output, label + '.json')
  await download.saveAs(destination)
  assert.equal(await download.failure(), null)
  const bytes = await fs.readFile(destination)
  report.downloads.push({ path: destination, bytes: bytes.length })
  return JSON.parse(bytes.toString('utf8'))
}

async function loadAuthored() {
  const read = async name => JSON.parse(await fs.readFile(path.join(root, 'catalogue', name), 'utf8'))
  const [manifest, navigation, definitions, sourceRecords, relations, topics] = await Promise.all([
    read('manifest.json'), read('navigation.json'), read('definitions.json'), read('sources.json'), read('relations.json'),
    fs.readdir(path.join(root, 'catalogue/knowledge')).then(names => Promise.all(names.filter(name => name.endsWith('.json')).map(name => read('knowledge/' + name)))),
  ])
  const parents = new Map(relations.filter(relation => relation.type === 'browse-under').map(relation => [relation.from.slice(6), relation.to.slice(6)]))
  const clusterIds = new Set(navigation.clusters.map(cluster => cluster.id))
  function areaFor(id) {
    if (id === 'overview') return '__overview__'
    const visited = new Set()
    while (id && !visited.has(id)) {
      if (clusterIds.has(id)) return id
      visited.add(id)
      id = parents.get(id)
    }
    throw Error('No authored topic area for ' + id)
  }
  authored = new Map(topics.map(topic => [topic.id, { ...topic, areaId: areaFor(topic.id) }]))
  ordered = manifest.topicOrder.map(id => authored.get(id)).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id))
  sources = new Map(sourceRecords.map(source => [source.id, source]))
  stages = definitions.filter(definition => definition.type === 'stage').map(definition => ({ id: definition.id, title: definition.spec.title }))
  areas = navigation.clusters.map(cluster => ({ id: cluster.id, title: cluster.short })).concat({ id: '__overview__', title: 'Overview' })
  const used = new Set(ordered.flatMap(topic => topic.refs))
  linkedSources = sourceRecords.filter(source => used.has(source.id))
  assert.equal(ordered.length, 150, 'The complete authored knowledge catalogue is included')
  assert.equal(areas.length, 11, 'Ten topic areas and the Atlas overview remain discoverable')
}

async function run() {
  await fs.mkdir(output, { recursive: true })
  await loadAuthored()
  const { createAtlasServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href)
  server = await createAtlasServer({ rootDir: root, getApiKey: () => '', transport: async () => { report.providerCalls += 1; throw Error('Inference disabled') } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  try {
    browser = await playwright.chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
    await check('01-complete-authored-catalogue-direct-guide-and-source-links', async () => {
      await fresh()
      const controls = tools()
      assert.equal(await page.locator('button[data-mode="knowledge"]').getAttribute('aria-pressed'), 'true')
      assert.equal(await page.locator('body').getAttribute('data-mode'), 'knowledge')
      assert.equal(await page.title(), 'All knowledge · Workflow Atlas')
      assert.equal(await controls.table.locator('tbody tr').count(), ordered.length)
      assert.deepEqual(await visibleIds(), ordered.map(topic => topic.id))
      const observedRows = await controls.table.locator('tbody tr').evaluateAll(rows => rows.map(row => {
        const cells = row.querySelectorAll('th,td')
        const guide = cells[0].querySelector('a[data-topic][data-open-reading="true"]')
        return {
          id: row.dataset.knowledgeId,
          title: guide?.textContent.trim(), href: guide?.href, target: guide?.target,
          area: cells[1].textContent.trim(), steps: cells[2].textContent.trim(),
          sourceLinks: [...cells[3].querySelectorAll('a')].map(anchor => ({ href: anchor.href, target: anchor.target, rel: anchor.rel })),
          sourceDetails: Boolean(cells[3].querySelector('details')),
        }
      }))
      let sourceLinkCount = 0
      for (let index = 0; index < ordered.length; index++) {
        const topic = ordered[index], row = observedRows[index]
        assert.equal(row.id, topic.id)
        assert.equal(row.title.replace(/\s*↗\s*$/, ''), topic.title)
        const guideURL = new URL(row.href)
        assert.equal(guideURL.origin, base)
        assert.equal(guideURL.pathname, '/atlas/')
        assert.equal(guideURL.searchParams.get('view'), 'read')
        assert.equal(guideURL.searchParams.has('embedded'), false)
        assert.equal(decodeURIComponent(guideURL.hash.slice(1)), topic.id)
        assert.ok(!row.target || row.target === '_self', 'Internal guides retain ordinary same-tab links')
        assert.equal(row.area, areas.find(area => area.id === topic.areaId).title)
        if (!rowStages(topic).length) assert.match(row.steps, /No recorded step/)
        else for (const id of rowStages(topic)) assert.ok(row.steps.includes(stages.find(stage => stage.id === id).title), `Recorded stage label is visible for ${topic.id}/${id}`)
        assert.deepEqual(row.sourceLinks.map(link => link.href).sort(), topic.refs.map(id => sources.get(id).url).sort(), `Exact authored sources for ${topic.id}`)
        assert.equal(row.sourceDetails, topic.refs.length > 1, `Source details reflect the recorded count for ${topic.id}`)
        for (const link of row.sourceLinks) {
          assert.equal(new URL(link.href).protocol, 'https:')
          assert.equal(link.target, '_blank')
          assert.match(link.rel, /noopener/)
        }
        sourceLinkCount += row.sourceLinks.length
      }
      assert.match(await controls.status.innerText(), /150 of 150/)
      const sourceBearing = ordered.find(topic => topic.refs.length > 1)
      const detail = controls.table.locator(`tr[data-knowledge-id="${sourceBearing.id}"] td`).last().locator('details')
      await detail.locator('summary').click()
      assert.equal(await detail.locator('a').first().isVisible(), true, 'Users can expand the retained source links')
      await page.screenshot({ path: path.join(output, 'desktop-all-knowledge-light.png') })
      return { rows: ordered.length, directGuideLinks: observedRows.length, exactSourceLinks: sourceLinkCount, topicAreas: areas.length, sourceMetadata: 'Exact authored source URLs, without a remote availability claim' }
    })

    await check('02-exact-workflow-step-topic-area-and-stable-source-memberships', async () => {
      await fresh()
      const controls = tools()
      const stageOptions = await options(controls.stage)
      assert.deepEqual(stageOptions.filter(option => option.value && option.value !== '__none__').map(option => [option.value, option.label]).sort(), stages.map(stage => [stage.id, stage.title]).sort())
      assert.equal(stageOptions.find(option => option.value === '__none__').label, 'No recorded step')
      const topicOptions = await options(controls.topic)
      assert.deepEqual(topicOptions.filter(option => option.value).map(option => [option.value, option.label]).sort(), areas.map(area => [area.id, area.title]).sort())
      const sourceOptions = await options(controls.source)
      assert.deepEqual(sourceOptions.filter(option => option.value && option.value !== '__none__').map(option => option.value).sort(), linkedSources.map(source => source.id).sort())
      assert.equal(sourceOptions.find(option => option.value === '__none__').label, 'No linked source')
      const memberships = { stages: {}, areas: {}, sources: {} }
      for (const id of [...stages.map(stage => stage.id), '__none__']) {
        await controls.stage.selectOption(id)
        memberships.stages[id] = await visibleIds()
        assert.deepEqual(memberships.stages[id], stageIds(id), 'Only explicitly recorded stage applicability is included: ' + id)
        assert.match(await controls.status.innerText(), new RegExp(`${stageIds(id).length} of ${ordered.length}`))
      }
      await controls.stage.selectOption('')
      for (const area of areas) {
        await controls.topic.selectOption(area.id)
        memberships.areas[area.id] = await visibleIds()
        assert.deepEqual(memberships.areas[area.id], areaIds(area.id), 'Topic membership follows authored browsing ancestors: ' + area.id)
      }
      await controls.topic.selectOption('')
      for (const id of [...linkedSources.map(source => source.id), '__none__']) {
        await controls.source.selectOption(id)
        memberships.sources[id] = await visibleIds()
        assert.deepEqual(memberships.sources[id], sourceIds(id), 'A source ID selects its exact recorded references: ' + id)
      }
      await controls.source.selectOption('')
      assert.deepEqual(await visibleIds(), ordered.map(topic => topic.id))
      return memberships
    })

    await check('03-intersecting-filters-multiword-full-guide-search-and-missing-metadata', async () => {
      await fresh()
      const controls = tools()
      await controls.stage.selectOption('verification')
      await controls.topic.selectOption(authored.get('evaluation-workflow').areaId)
      await controls.source.selectOption('repo-promptfoo')
      await controls.search.fill('representative scoring')
      assert.deepEqual(await visibleIds(), ['evaluation-workflow'], 'All three metadata filters and separate full-guide search tokens intersect')
      await controls.search.fill('Docling')
      assert.deepEqual(await visibleIds(), [])
      assert.equal(await controls.empty.isVisible(), true)
      assert.equal(await controls.wrap.isVisible(), false)
      assert.match(await controls.status.innerText(), /0 of 150/)
      await controls.clear.click()
      assert.equal(await controls.search.inputValue(), '')
      for (const filter of [controls.stage, controls.topic, controls.source]) assert.equal(await filter.inputValue(), '')
      assert.equal(await controls.search.evaluate(node => node === document.activeElement), true)
      assert.equal((await visibleIds()).length, 150)
      await controls.stage.selectOption('__none__')
      await controls.source.selectOption('__none__')
      const missing = ordered.filter(topic => !rowStages(topic).length && !topic.refs.length).map(topic => topic.id)
      assert.deepEqual(await visibleIds(), missing)
      assert.ok(missing.length > 0, 'Missing applicability and sources remain discoverable')
      await controls.clear.click()
      await controls.search.fill('Promptfoo')
      assert.ok((await visibleIds()).includes('evaluation-workflow'), 'Repository aliases remain searchable')
      return { intersection: ['evaluation-workflow'], missingStageAndSource: missing, clearedRows: 150, searchIncludesFullGuideProse: true }
    })

    await check('04-keyboard-reading-history-modified-click-and-local-shortcuts', async () => {
      await fresh()
      const controls = tools(), targetId = 'evaluation-workflow'
      await controls.stage.selectOption('verification')
      await controls.topic.selectOption(authored.get(targetId).areaId)
      await controls.source.selectOption('repo-promptfoo')
      await controls.search.fill('representative scoring')
      const guide = controls.table.locator(`a[data-topic="${targetId}"][data-open-reading="true"]`)
      await guide.focus()
      await guide.press('Enter')
      await page.locator('#reader-title').waitFor({ state: 'visible' })
      assert.equal(await page.locator('#reader-title').innerText(), authored.get(targetId).title)
      assert.equal(await page.locator('body').getAttribute('data-mode'), 'read')
      assert.equal(await page.locator('#reader-title').evaluate(node => node === document.activeElement), true)
      await page.goBack()
      await page.locator('#knowledge-library').waitFor({ state: 'visible' })
      assert.equal(await controls.search.inputValue(), 'representative scoring')
      assert.equal(await controls.stage.inputValue(), 'verification')
      assert.equal(await controls.topic.inputValue(), authored.get(targetId).areaId)
      assert.equal(await controls.source.inputValue(), 'repo-promptfoo')
      assert.deepEqual(await visibleIds(), [targetId])
      const [opened] = await Promise.all([context.waitForEvent('page'), guide.click({ modifiers: ['ControlOrMeta'] })])
      await opened.waitForLoadState()
      await opened.locator('#reader-title').waitFor({ state: 'visible' })
      assert.equal(await opened.locator('#reader-title').innerText(), authored.get(targetId).title)
      assert.equal(await opened.locator('body').getAttribute('data-mode'), 'read')
      assert.equal(await page.locator('body').getAttribute('data-mode'), 'knowledge')
      await opened.close()
      await page.locator('#knowledge-title').focus()
      await page.keyboard.press('/')
      assert.equal(await controls.search.evaluate(node => node === document.activeElement), true, 'Slash targets the active knowledge search')
      await controls.search.press('Escape')
      assert.equal(await controls.search.inputValue(), '')
      for (const filter of [controls.stage, controls.topic, controls.source]) assert.equal(await filter.inputValue(), '')
      assert.equal(await page.locator('body').getAttribute('data-mode'), 'knowledge')
      assert.equal((await visibleIds()).length, 150)
      return { keyboardTarget: targetId, browserBackRestoredAllFourControls: true, modifiedClickOpenedReadView: true, slashFocusedActiveSearch: true, escapeClearedLocally: true }
    })

    await check('05-320px-light-and-dark-filter-fit-and-source-column-access', async () => {
      const dimensions = {}
      for (const theme of ['light', 'dark']) {
        await fresh({ width: 320, height: 568, theme })
        const controls = tools()
        await controls.source.selectOption('repo-promptfoo')
        await controls.search.fill('representative scoring')
        assert.deepEqual(await visibleIds(), ['evaluation-workflow'])
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), 'The page fits the narrow viewport')
        for (const control of [controls.search, controls.stage, controls.topic, controls.source, controls.clear]) {
          const box = await control.boundingBox()
          assert.ok(box && box.x >= 0 && box.x + box.width <= 321, 'Each knowledge control fits 320px')
        }
        const sourceCell = controls.table.locator('tr[data-knowledge-id="evaluation-workflow"] td').last()
        await sourceCell.locator('details > summary').click()
        await controls.wrap.scrollIntoViewIfNeeded()
        const observed = await controls.wrap.evaluate(node => { node.scrollLeft = node.scrollWidth; return { width: node.clientWidth, scrollWidth: node.scrollWidth, scrollLeft: node.scrollLeft, left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right } })
        assert.ok(observed.left >= 0 && observed.right <= 321)
        assert.ok(observed.scrollWidth > observed.width && observed.scrollLeft > 0)
        const lastSource = sourceCell.locator('a').last()
        const anchorBox = await lastSource.boundingBox(), wrapBox = await controls.wrap.boundingBox()
        assert.ok(anchorBox && wrapBox && anchorBox.x >= wrapBox.x - 1 && anchorBox.x + anchorBox.width <= wrapBox.x + wrapBox.width + 1, 'The rightmost source link is reachable within the table scroller')
        assert.equal(await lastSource.isVisible(), true)
        await page.screenshot({ path: path.join(output, `mobile-sources-${theme}.png`) })
        dimensions[theme] = observed
      }
      return dimensions
    })

    await check('06-embedded-view-restoration-local-escape-and-downloaded-project-preservation', async () => {
      await fresh({ url: `${base}/factory/` })
      await page.locator('#start-screen [data-studio-action="examples"]').click()
      await page.locator('[data-example="feature-delivery"]').click()
      await page.locator('#project-name').waitFor({ state: 'visible' })
      const before = await downloadProject('before-knowledge-table')
      await page.locator('.main-navigation [data-main-view="knowledge"]').click()
      const frame = page.frameLocator('#knowledge-frame')
      await frame.locator('button[data-mode="knowledge"]').click()
      await frame.locator('#knowledge-library').waitFor({ state: 'visible' })
      const controls = tools(frame)
      await controls.stage.selectOption('verification')
      await controls.topic.selectOption(authored.get('evaluation-workflow').areaId)
      await controls.source.selectOption('repo-promptfoo')
      await controls.search.fill('representative scoring')
      assert.deepEqual(await visibleIds(frame), ['evaluation-workflow'])
      await briefView(page, 'intent')
      await page.locator('.main-navigation [data-main-view="knowledge"]').click()
      await frame.locator('#knowledge-library').waitFor({ state: 'visible' })
      assert.equal(await frame.locator('body').getAttribute('data-mode'), 'knowledge')
      assert.match(new URL(page.url()).hash, /\/knowledge$/)
      assert.equal(await controls.search.inputValue(), 'representative scoring')
      assert.equal(await controls.stage.inputValue(), 'verification')
      assert.equal(await controls.topic.inputValue(), authored.get('evaluation-workflow').areaId)
      assert.equal(await controls.source.inputValue(), 'repo-promptfoo')
      await controls.table.locator('a[data-topic="evaluation-workflow"][data-open-reading="true"]').press('Enter')
      assert.equal(await frame.locator('#reader-title').innerText(), authored.get('evaluation-workflow').title)
      await frame.locator('button[data-mode="knowledge"]').click()
      assert.deepEqual(await visibleIds(frame), ['evaluation-workflow'])
      await controls.search.focus()
      await controls.search.press('Escape')
      assert.equal(await controls.search.inputValue(), '')
      for (const filter of [controls.stage, controls.topic, controls.source]) assert.equal(await filter.inputValue(), '')
      assert.equal(await frame.locator('body').getAttribute('data-mode'), 'knowledge')
      assert.equal(await page.locator('#knowledge-frame').isVisible(), true, 'Escape clears the local filters without closing the embedded pane')
      assert.equal((await visibleIds(frame)).length, 150)
      await briefView(page, 'intent')
      const after = await downloadProject('after-knowledge-table')
      assert.deepEqual(after, before, 'Knowledge filtering and reading preserve the complete actual downloaded project')
      return { projectName: before.project.name, exactDownloadedProjectPreserved: true, restoredKnowledgeView: true, restoredAllFourControls: true, embeddedEscapeStayedInTable: true }
    })

    await check('07-offline-filtering-direct-guide-links-history-and-zero-http', async () => {
      execFileSync(process.execPath, ['tools/export-atlas.cjs'], { cwd: root, stdio: 'pipe' })
      const exportPath = path.join(root, 'exports/Workflow Atlas.html')
      await fresh({ offline: true, url: pathToFileURL(exportPath).href + '?view=knowledge#overview' })
      const controls = tools()
      await controls.stage.selectOption('verification')
      await controls.topic.selectOption(authored.get('evaluation-workflow').areaId)
      await controls.source.selectOption('repo-promptfoo')
      await controls.search.fill('representative scoring')
      assert.deepEqual(await visibleIds(), ['evaluation-workflow'])
      const guide = controls.table.locator('a[data-topic="evaluation-workflow"][data-open-reading="true"]')
      const href = new URL(await guide.getAttribute('href'), page.url())
      assert.equal(href.protocol, 'file:')
      assert.equal(href.pathname, new URL(pathToFileURL(exportPath)).pathname)
      assert.equal(href.searchParams.get('view'), 'read')
      await guide.press('Enter')
      await page.locator('#reader-title').waitFor({ state: 'visible' })
      assert.equal(await page.locator('#reader-title').innerText(), authored.get('evaluation-workflow').title)
      await page.goBack()
      await page.locator('#knowledge-library').waitFor({ state: 'visible' })
      assert.deepEqual(await visibleIds(), ['evaluation-workflow'])
      assert.equal(await controls.search.inputValue(), 'representative scoring')
      assert.equal(await controls.source.inputValue(), 'repo-promptfoo')
      assert.deepEqual(report.remoteRequests, [], 'Offline filtering and reading issue zero HTTP requests')
      await page.screenshot({ path: path.join(output, 'offline-knowledge-filter.png'), fullPage: true })
      return { exportPath, remoteRequests: report.remoteRequests.length, guide: 'evaluation-workflow', filterMembershipAndHistoryPreserved: true }
    })

    await check('08-source-library-guide-route-survives-reload', async () => {
      await fresh()
      const targetId = 'evaluation-workflow', source = sources.get('repo-promptfoo')
      await page.locator('button[data-mode="sources"]').click()
      await page.locator('#source-library').waitFor({ state: 'visible' })
      assert.equal(new URL(page.url()).searchParams.get('view'), 'sources')
      await page.locator('#source-search').fill(source.title)
      const card = page.locator('.source-card').filter({ has: page.getByRole('link', { name: source.title + ' ↗', exact: true }) })
      await card.locator(`button.source-topic[data-topic="${targetId}"]`).click()
      await page.locator('#reader-title').waitFor({ state: 'visible' })
      assert.equal(await page.locator('body').getAttribute('data-mode'), 'read')
      assert.equal(await page.locator('#reader-title').innerText(), authored.get(targetId).title)
      const readingURL = page.url(), route = new URL(readingURL)
      assert.equal(route.searchParams.get('view'), 'read')
      assert.equal(decodeURIComponent(route.hash.slice(1)), targetId)
      await page.reload()
      await page.locator('#reader-title').waitFor({ state: 'visible' })
      assert.equal(await page.locator('body').getAttribute('data-mode'), 'read')
      assert.equal(await page.locator('#reader-title').innerText(), authored.get(targetId).title)
      assert.equal(await page.title(), authored.get(targetId).title + ' · Workflow Atlas')
      assert.equal(page.url(), readingURL, 'Refreshing the visible guide keeps its copied URL and reading view')
      return { sourceId: source.id, guide: targetId, readingURL, refreshedSameGuide: true }
    })

    await check('09-explore-reading-controls-keep-copyable-reading-routes', async () => {
      const observations = []
      for (const readingControl of ['#read-map-topic', '#read-selection', '.skip-link']) {
        await fresh()
        const targetId = 'evaluation-workflow'
        await page.locator('button[data-mode="explore"]').click()
        await page.locator('#landscape').waitFor({ state: 'visible' })
        assert.equal(new URL(page.url()).searchParams.get('view'), 'explore')
        await page.locator('button[data-view="2d"]').click()
        await page.locator('#flat-map button[data-topic="evaluation"]').click()
        await page.locator(`#flat-map button[data-topic="${targetId}"]`).click()
        assert.equal(await page.locator('body').getAttribute('data-mode'), 'explore')
        const control = page.locator(readingControl)
        await control.focus()
        await control.press('Enter')
        await page.locator('#reader-title').waitFor({ state: 'visible' })
        assert.equal(await page.locator('body').getAttribute('data-mode'), 'read')
        assert.equal(await page.locator('#reader-title').innerText(), authored.get(targetId).title)
        const readingURL = page.url(), route = new URL(readingURL)
        assert.equal(route.searchParams.get('view'), 'read', `${readingControl} synchronizes the visible reading mode with its URL`)
        assert.equal(decodeURIComponent(route.hash.slice(1)), targetId)
        await page.reload()
        await page.locator('#reader-title').waitFor({ state: 'visible' })
        assert.equal(await page.locator('body').getAttribute('data-mode'), 'read')
        assert.equal(await page.locator('#reader-title').innerText(), authored.get(targetId).title)
        assert.equal(page.url(), readingURL)
        observations.push({ readingControl, guide: targetId, readingURL, refreshedSameGuide: true })
      }
      return observations
    })

    await check('10-gap-review-keeps-pending-evidence-and-scoped-claims-visible', async () => {
      await fresh()
      const controls = tools()
      for (const topic of ordered) {
        const row = controls.table.locator(`tbody tr[data-knowledge-id="${topic.id}"]`)
        const status = topic.catalog.sourceStatus
        assert.equal(await row.locator('.knowledge-review').innerText(), status === 'reviewed' ? 'Scoped source claims reviewed' : status === 'needs-review' ? 'Source review needed' : 'Earlier claims not rechecked')
      }
      await controls.stage.selectOption('__none__')
      await controls.source.selectOption('__none__')
      assert.deepEqual(await visibleIds(), ['overview'])
      assert.equal(await controls.table.locator('tr[data-knowledge-id="overview"] .knowledge-review-pending').isVisible(), true)
      await controls.clear.click()
      await controls.search.fill('Architecture decisions')
      await controls.table.locator('a[data-topic="architecture-decisions"]').press('Enter')
      const sourceSection = page.locator('.content-section').filter({ has: page.getByRole('heading', { name: 'Gap review: verified source contribution', exact: true }) })
      assert.match(await sourceSection.innerText(), /scoped source fact|source contribution/i)
      assert.match(await page.locator('#reader-content').innerText(), /proposals|recommendations/i)
      assert.equal(await page.locator('#reader-sources .source-link').count() > 0, true)
      await page.goBack()
      await controls.table.waitFor({ state: 'visible' })
      assert.equal(await controls.search.inputValue(), 'Architecture decisions')
      return { rowsWithExplicitReviewStatus: ordered.length, remainingUnmappedAndUncited: ['overview'], scopedSourceAndProposalBoundaryVisible: true }
    })

    assert.deepEqual(report.errors, [])
    assert.equal(report.providerCalls, 0)
    assert.equal(report.checks.filter(item => item.status === 'Fail').length, 0)
    process.stdout.write(`PASS all knowledge table: ${report.checks.length} groups, ${ordered.length} guides, exact step/topic/source filters, keyboard/history, embedded project preservation, narrow layouts and offline reading. Evidence: ${output}\n`)
  } finally {
    if (context) await context.close()
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
    await persist()
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 })
