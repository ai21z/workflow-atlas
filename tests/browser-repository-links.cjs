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
const output = path.join(root, 'local-knowledge/retests/repository-links', new Date().toISOString().replace(/[:.]/g, '-'))
const report = {
  startedAt: new Date().toISOString(),
  method: 'Installed Chrome, actual authored catalogue targets, public controls, actual project JSON downloads and a self-contained offline export. No application state injection or live inference.',
  limits: 'Functional browser simulation and screenshots. No remote link availability guarantee, human comprehension study, screen reader audit or physical mobile-device test.',
  checks: [], errors: [], downloads: [], remoteRequests: [], providerCalls: 0,
}
let browser, context, page, server, base, hub, authored, sources, tableSpec, expectedGuides

async function persist() {
  report.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n')
  await fs.writeFile(path.join(output, 'report.md'), [
    '# Repository links browser trial', '', report.method, '', report.limits, '',
    `Observed checks: ${report.checks.filter(item => item.status === 'Pass').length}/${report.checks.length} passed.`,
    `Browser errors: ${report.errors.length}. Provider calls: ${report.providerCalls}.`, '',
    ...report.checks.map(item => `- ${item.id}: ${item.status}${item.error ? '. ' + item.error.split('\n')[0] : ''}`), '',
    'Detailed targets, dimensions and downloaded project paths are retained in results.json.', '',
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
  await page.goto(url || `${base}/atlas/?theme=${theme}#${hub.id}`)
  if (!url || offline) await page.locator('#reader-title').waitFor()
}

function tableSection(target = page) {
  return target.locator('.content-section').filter({ has: target.getByRole('heading', { name: tableSpec.label, exact: true }) })
}

function tools(target = page) {
  const section = tableSection(target)
  return { section, table: section.getByRole('table', { name: tableSpec.label, exact: true }), search: section.getByRole('searchbox', { name: tableSpec.tools.searchLabel, exact: true }), filter: section.getByRole('combobox', { name: tableSpec.tools.filterLabel, exact: true }), clear: section.locator('.table-clear'), status: section.getByRole('status') }
}

async function visibleNames(target = page) {
  return tools(target).table.locator('tbody tr:not([hidden])').evaluateAll(rows => rows.map(row => row.querySelector('th a.table-entry-link').textContent.replace(/\s*↗\s*$/, '').trim()))
}

function guideRows(id) {
  return tableSpec.rows.filter((row, index) => tableSpec.cellLinks.some(link => link.row === index && link.topicId === id)).map(row => row[0])
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

async function run() {
  await fs.mkdir(output, { recursive: true })
  hub = JSON.parse(await fs.readFile(path.join(root, 'catalogue/knowledge/repository-workflow-references.json'), 'utf8'))
  sources = new Map(JSON.parse(await fs.readFile(path.join(root, 'catalogue/sources.json'), 'utf8')).map(source => [source.id, source]))
  authored = new Map(await Promise.all((await fs.readdir(path.join(root, 'catalogue/knowledge'))).filter(name => name.endsWith('.json')).map(async name => { const topic = JSON.parse(await fs.readFile(path.join(root, 'catalogue/knowledge', name), 'utf8')); return [topic.id, topic] })))
  tableSpec = hub.sections.find(section => section.type === 'table')
  expectedGuides = [...new Map(tableSpec.cellLinks.filter(link => link.topicId).map(link => [link.topicId, link.label]))]
  assert.equal(tableSpec.rows.length, 27)
  assert.equal(expectedGuides.length, 14)
  const { createAtlasServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href)
  server = await createAtlasServer({ rootDir: root, getApiKey: () => '', transport: async () => { report.providerCalls += 1; throw Error('Inference disabled') } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}`
  try {
    browser = await playwright.chromium.launch({ channel: 'chrome', headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
    await check('01-all-authored-row-links-and-revisions', async () => {
      await fresh()
      const { table, filter } = tools()
      assert.equal(await table.locator('tbody tr').count(), 27)
      assert.deepEqual(await visibleNames(), tableSpec.rows.map(row => row[0]))
      for (let row = 0; row < tableSpec.rows.length; row++) {
        const rendered = table.locator('tbody tr').nth(row)
        const targets = tableSpec.cellLinks.filter(link => link.row === row)
        assert.equal(await rendered.locator('.table-cell-links a').count(), targets.length, tableSpec.rows[row][0])
        for (const link of targets) {
          const cell = rendered.locator('th,td').nth(link.column)
          const anchor = link.sourceRef ? cell.getByRole('link', { name: `Reviewed source for ${tableSpec.rows[row][0]}`, exact: true }) : cell.getByRole('link', { name: link.label + (link.href ? ' ↗' : ''), exact: true })
          const expectedHref = link.href || (link.sourceRef ? sources.get(link.sourceRef).url : '#' + link.topicId)
          assert.equal(await anchor.getAttribute('href'), expectedHref)
          if (link.topicId) {
            assert.equal(await anchor.getAttribute('data-topic'), link.topicId)
            assert.ok(authored.has(link.topicId))
          } else {
            const url = new URL(expectedHref)
            assert.equal(url.protocol, 'https:')
            assert.equal(await anchor.getAttribute('target'), '_blank')
            assert.match(await anchor.getAttribute('rel'), /noopener/)
            if (link.sourceRef) {
              const source = sources.get(link.sourceRef)
              const revision = source.revision.match(/[a-f0-9]{40}/)?.[0]
              assert.ok(revision, `Reviewed source has a pinned revision: ${link.sourceRef}`)
              assert.ok(url.pathname.includes(revision), `Rendered source preserves inspected revision: ${link.sourceRef}`)
            }
          }
        }
      }
      const retainedQualifications = {}
      for (const name of ['Laya', 'AgentRC', 'Agent Reach', 'OpenSpec']) {
        const row = tableSpec.rows.findIndex(values => values[0] === name)
        const qualification = table.locator('tbody tr').nth(row).locator('th,td').nth(2).locator('.table-cell-context')
        assert.equal(await qualification.isVisible(), true, `${name} retains its applicability qualification beside the guide link`)
        retainedQualifications[name] = await qualification.innerText()
        assert.equal(retainedQualifications[name], tableSpec.rows[row][2])
        assert.match(retainedQualifications[name], /experimental|conditional|optional/)
      }
      assert.deepEqual((await filter.locator('option').evaluateAll(options => options.filter(option => option.value).map(option => [option.value, option.textContent.trim()]))).sort(), [...expectedGuides].sort())
      await page.screenshot({ path: path.join(output, 'desktop-links-light.png'), fullPage: true })
      return { rows: 27, links: tableSpec.cellLinks.length, workflowOptions: expectedGuides.length, retainedQualifications, sourceCheck: 'Exact authored source URLs and inspected 40-character revisions. Remote availability was not requested.' }
    })

    await check('02-every-workflow-filter-has-exact-authored-membership', async () => {
      await fresh()
      const controls = tools()
      const memberships = {}
      for (const [id] of expectedGuides) {
        await controls.filter.selectOption(id)
        memberships[id] = await visibleNames()
        assert.deepEqual(memberships[id], guideRows(id))
        assert.match(await controls.status.innerText(), new RegExp(`${guideRows(id).length} of 27`))
      }
      await controls.filter.selectOption('')
      assert.equal((await visibleNames()).length, 27)
      return memberships
    })

    await check('03-search-filter-intersection-multiword-empty-and-clear', async () => {
      await fresh()
      const controls = tools()
      await controls.filter.selectOption('evaluation-workflow')
      await controls.search.fill('Promptfoo')
      assert.deepEqual(await visibleNames(), ['Promptfoo'])
      await controls.search.fill('Docling')
      assert.deepEqual(await visibleNames(), [])
      assert.equal(await controls.section.locator('.table-empty').isVisible(), true)
      assert.equal(await controls.section.locator('.table-wrap').isVisible(), false)
      await controls.clear.click()
      assert.equal(await controls.search.inputValue(), '')
      assert.equal(await controls.filter.inputValue(), '')
      assert.equal(await controls.search.evaluate(node => node === document.activeElement), true)
      assert.equal((await visibleNames()).length, 27)
      await controls.search.fill('structured associations')
      assert.deepEqual(await visibleNames(), ['Docling'], 'Separate words match both useful step and retained check')
      await controls.search.press('Escape')
      assert.equal(await controls.search.inputValue(), '')
      assert.equal((await visibleNames()).length, 27)
      return { intersection: ['Promptfoo'], multiword: ['Docling'], clearRestored: 27 }
    })

    await check('04-keyboard-guide-reading-history-and-modified-click', async () => {
      await fresh()
      const targetId = 'evaluation-workflow'
      await tools().filter.selectOption(targetId)
      await tools().search.fill('Promptfoo')
      assert.deepEqual(await visibleNames(), ['Promptfoo'])
      const guide = tools().table.locator(`a[data-topic="${targetId}"]`).first()
      await guide.focus()
      await guide.press('Enter')
      await page.waitForFunction(id => window.ATLAS_STATE.selected === id, targetId)
      assert.equal(await page.locator('#reader-title').innerText(), authored.get(targetId).title)
      assert.equal(await page.locator('#reader-title').evaluate(node => node === document.activeElement), true)
      await page.goBack()
      await page.waitForFunction(id => window.ATLAS_STATE.selected === id, hub.id)
      assert.equal(await page.locator('#reader-title').innerText(), hub.title)
      assert.equal(await tools().search.inputValue(), 'Promptfoo', 'Browser Back restores the table search')
      assert.equal(await tools().filter.inputValue(), targetId, 'Browser Back restores the workflow filter')
      assert.deepEqual(await visibleNames(), ['Promptfoo'], 'Browser Back restores the filtered search membership')
      const [opened] = await Promise.all([context.waitForEvent('page'), tools().table.locator(`a[data-topic="${targetId}"]`).first().click({ modifiers: ['ControlOrMeta'] })])
      await opened.waitForLoadState()
      await opened.waitForFunction(id => window.ATLAS_STATE?.selected === id, targetId)
      assert.equal(await opened.locator('#reader-title').innerText(), authored.get(targetId).title)
      assert.equal(await page.evaluate(() => window.ATLAS_STATE.selected), hub.id)
      await opened.close()
      return { keyboardTarget: targetId, backTarget: hub.id, restoredSearch: 'Promptfoo', restoredWorkflow: targetId, restoredMembership: ['Promptfoo'], modifiedClickOpenedTargetWithoutReplacingCurrentSelection: true }
    })

    await check('05-small-screen-light-and-dark-controls-and-check-column', async () => {
      const dimensions = {}
      for (const theme of ['light', 'dark']) {
        await fresh({ width: 320, height: 568, theme })
        const controls = tools()
        await controls.search.fill('OpenSpec')
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
        for (const locator of [controls.search, controls.filter, controls.clear]) {
          const box = await locator.boundingBox()
          assert.ok(box && box.x >= 0 && box.x + box.width <= 321, 'Each table control fits the narrow viewport')
        }
        assert.deepEqual(await visibleNames(), ['OpenSpec'])
        const wrap = controls.section.locator('.table-wrap')
        await wrap.scrollIntoViewIfNeeded()
        const observed = await wrap.evaluate(node => { node.scrollLeft = node.scrollWidth; return { width: node.clientWidth, scrollWidth: node.scrollWidth, scrollLeft: node.scrollLeft, rect: { left: node.getBoundingClientRect().left, right: node.getBoundingClientRect().right } } })
        assert.ok(observed.rect.left >= 0 && observed.rect.right <= 321)
        assert.ok(observed.scrollWidth > observed.width && observed.scrollLeft > 0)
        const retainedCheck = controls.table.locator('tbody tr:not([hidden]) td').last()
        const checkBox = await retainedCheck.boundingBox()
        const wrapBox = await wrap.boundingBox()
        assert.ok(checkBox && wrapBox && checkBox.x >= wrapBox.x - 1 && checkBox.x + checkBox.width <= wrapBox.x + wrapBox.width + 1, 'The final acceptance-check column is reachable by horizontal scrolling')
        assert.match(await retainedCheck.innerText(), /Independent code review and behavior tests/)
        await page.screenshot({ path: path.join(output, `mobile-check-${theme}.png`), fullPage: true })
        dimensions[theme] = observed
      }
      return dimensions
    })

    await check('06-embedded-reader-escape-and-project-preservation', async () => {
      await fresh({ url: `${base}/factory/` })
      await page.locator('#start-screen [data-studio-action="examples"]').click()
      await page.locator('[data-example="feature-delivery"]').click()
      await page.locator('#project-name').waitFor({ state: 'visible' })
      const before = await downloadProject('before-reading')
      await page.locator('.main-navigation [data-main-view="knowledge"]').click()
      const frame = page.frameLocator('#knowledge-frame')
      await frame.locator('button[data-mode="read"]').click()
      await frame.locator('#topic-search').fill(hub.title)
      await frame.locator(`#topic-nav [data-topic="${hub.id}"]`).click()
      await frame.locator('#topic-search').fill('')
      const controls = tools(frame)
      await controls.filter.selectOption('evaluation-workflow')
      await controls.search.fill('Promptfoo')
      await controls.search.press('Escape')
      assert.equal(await controls.filter.inputValue(), '')
      assert.equal(await controls.search.inputValue(), '')
      assert.equal(await frame.locator('body').getAttribute('data-mode'), 'read')
      assert.equal(await frame.locator('#reader-title').innerText(), hub.title)
      assert.equal(await page.locator('#knowledge-frame').isVisible(), true, 'Escape clears local controls without closing the embedded reader')
      await controls.table.locator('a[data-topic="decision-record-workflow"]').press('Enter')
      assert.equal(await frame.locator('#reader-title').innerText(), authored.get('decision-record-workflow').title)
      await briefView(page, 'intent')
      const after = await downloadProject('after-reading')
      assert.deepEqual(after, before, 'Reference reading and filtering preserve the complete downloaded project')
      return { projectName: before.project.name, exactDownloadedProjectPreserved: true, embeddedEscapeStayedInReader: true }
    })

    await check('07-self-contained-offline-filtering-and-internal-navigation', async () => {
      execFileSync(process.execPath, ['tools/export-atlas.cjs'], { cwd: root, stdio: 'pipe' })
      const exportPath = path.join(root, 'exports/Workflow Atlas.html')
      await fresh({ offline: true, url: pathToFileURL(exportPath).href + '#' + hub.id })
      const controls = tools()
      await controls.filter.selectOption('software-investigation-workflow')
      assert.deepEqual(await visibleNames(), guideRows('software-investigation-workflow'))
      await controls.search.fill('Ghidra')
      assert.deepEqual(await visibleNames(), ['Ghidra'])
      await controls.table.locator('tbody tr:not([hidden]) a[data-topic="software-investigation-workflow"]').press('Enter')
      assert.equal(await page.locator('#reader-title').innerText(), authored.get('software-investigation-workflow').title)
      await page.goBack()
      assert.equal(await page.locator('#reader-title').innerText(), hub.title)
      assert.deepEqual(report.remoteRequests, [], 'Offline filtering and internal guide navigation issue zero HTTP requests')
      await page.screenshot({ path: path.join(output, 'offline-links.png'), fullPage: true })
      return { exportPath, remoteRequests: report.remoteRequests.length, guide: 'software-investigation-workflow' }
    })

    assert.deepEqual(report.errors, [])
    assert.equal(report.providerCalls, 0)
    assert.equal(report.checks.filter(item => item.status === 'Fail').length, 0)
    process.stdout.write(`PASS repository links: ${report.checks.length} groups, 27 rows, 14 workflow filters, keyboard/history, embedded project preservation, narrow layouts and offline reading. Evidence: ${output}\n`)
  } finally {
    if (context) await context.close()
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
    await persist()
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 })
