const { briefView, workflowView: openWorkflowView, closeWorkspaceDetails } = require('./browser-workspace-helpers.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { pathToFileURL } = require('node:url')

let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright')) }

const root = path.resolve(__dirname, '..')
let base = process.env.ATLAS_TEST_URL || null
const output = path.join(root, 'local-knowledge/retests/handoff-ux', new Date().toISOString().replace(/[:.]/g, '-'))
const evidence = {
  startedAt: new Date().toISOString(), base,
  method: 'Installed Chrome controlled through public UI. Actual downloads and file chooser events. No application state injection or model calls.',
  limits: 'Automation checks application behavior. Human comprehension and the native operating system dialog appearance are not measured.',
  checks: [], errors: [], downloads: []
}
const sha = data => createHash('sha256').update(data).digest('hex')
const wanted = 'Let customers save and reopen their search filters.'
const changedWanted = 'Let customers save, reopen and name their search filters.'
const finalWanted = 'Let customers save, name and share their search filters.'
const refined = 'Account owners can share a named saved filter with one colleague.'
const acceptance = 'Given a named filter, when I save and reopen it, all supplied criteria remain.\nBoundary: an empty name prompts for a name.\nLiteral example: ``` and <filter> must stay as supplied.'
let browser, context, page, initialZip, updatedZip, zipApi, server

async function closeResources() {
  const currentBrowser = browser
  const currentServer = server
  browser = null
  server = null
  await Promise.all([
    currentBrowser?.close(),
    currentServer?.listening ? new Promise((resolve, reject) => currentServer.close(error => error ? reject(error) : resolve())) : undefined,
  ])
}

async function persist() {
  evidence.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2) + '\n')
}
async function sourceHashes() {
  const files = []
  async function visit(directory) {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile()) files.push({ path: path.relative(root, absolute).replaceAll('\\', '/'), sha256: sha(await fs.readFile(absolute)) })
    }
  }
  await visit(path.join(root, 'factory'))
  await visit(path.join(root, 'atlas'))
  return files.sort((first, second) => first.path.localeCompare(second.path))
}
async function check(id, action) {
  const record = { id, status: 'Not run', startedAt: new Date().toISOString() }
  evidence.checks.push(record)
  try { record.observation = await action(); record.status = 'Pass' }
  catch (error) { record.status = 'Fail'; record.error = error.stack || String(error) }
  if (page && !page.isClosed()) {
    record.screenshot = `${id}.png`
    await page.screenshot({ path: path.join(output, record.screenshot), fullPage: true }).catch(error => { record.screenshotError = error.message })
    record.viewportScreenshot = `${id}-viewport.png`
    await page.screenshot({ path: path.join(output, record.viewportScreenshot) }).catch(error => { record.viewportScreenshotError = error.message })
  }
  record.finishedAt = new Date().toISOString()
  await persist()
  process.stdout.write(`${id}: ${record.status}\n`)
}
async function fresh(viewport = { width: 1440, height: 1000 }) {
  if (context) await context.close()
  context = await browser.newContext({ viewport, acceptDownloads: true })
  page = await context.newPage()
  page.setDefaultTimeout(8000)
  page.on('pageerror', error => evidence.errors.push({ kind: 'pageerror', message: error.message }))
  page.on('console', message => { if (message.type() === 'error') evidence.errors.push({ kind: 'console', message: message.text(), location: message.location() }) })
  page.on('response', response => { if (response.status() >= 400) evidence.errors.push({ kind: 'http', url: response.url(), status: response.status() }) })
  page.on('requestfailed', request => evidence.errors.push({ kind: 'request', url: request.url(), failure: request.failure()?.errorText || 'Request failed' }))
  await page.goto(base)
  await page.locator('#start-screen').waitFor({ state: 'visible' })
}
async function start(recipe = 'feature-delivery', purpose = wanted) {
  await page.locator(`[data-start-recipe="${recipe}"]`).click()
  await page.locator('#brief-workspace').waitFor({ state: 'visible' })
  await page.locator('#project-name').fill('Saved filters UX regression')
  await briefView(page)
  await page.locator('#project-purpose').fill(purpose)
  await openWorkflowView(page)
  await page.locator('#studio-layout').waitFor({ state: 'visible' })
}
async function closeDetails() {
  await closeWorkspaceDetails(page)
}
async function details(section = 'intent') {
  await closeDetails()
  await briefView(page)
  await page.locator(`#details-nav [data-goto="${section}"]`).click()
  await page.locator('#inspector').waitFor({ state: 'visible' })
}
async function expand(selector) {
  const locator = page.locator(selector)
  if (await locator.getAttribute('open') === null) await locator.locator('summary').first().click()
}
async function readFile(filename) {
  await closeDetails()
  await page.locator('#view-nav [data-project-view="artifacts"]').click()
  await page.locator('#artifact-workspace').waitFor({ state: 'visible' })
  await page.locator(`[data-file="${filename}"]`).click()
  assert.equal(await page.locator('#preview-path').innerText(), filename)
  return page.locator('#file-preview').innerText()
}
async function previewContains(text, expected = true) {
  await page.waitForFunction(({ text, expected }) => document.querySelector('#file-preview')?.textContent.includes(text) === expected, { text, expected })
  return page.locator('#file-preview').innerText()
}
async function openDownload(kind) {
  await closeDetails()
  await page.locator('#download-project').click()
  await page.locator('#download-dialog').waitFor({ state: 'visible' })
  if (kind) await page.locator(`[data-output-kind="${kind}"]`).check()
}
async function closeDownload() { await page.locator('[data-close-dialog="download-dialog"]').click() }
async function receive(button, filename) {
  const pending = page.waitForEvent('download')
  await button.click()
  const downloaded = await pending
  const filePath = path.join(output, filename)
  await downloaded.saveAs(filePath)
  assert.equal(await downloaded.failure(), null)
  const bytes = await fs.readFile(filePath)
  evidence.downloads.push({ filename, suggested: downloaded.suggestedFilename(), bytes: bytes.length, sha256: sha(bytes) })
  return { filePath, bytes }
}
async function inspectZip(download) {
  const archive = await zipApi.unzipTextFiles(new Uint8Array(download.bytes))
  return new Map(archive.files.map(file => [file.path, file.content]))
}
async function openZip(filePath) {
  await fresh()
  await page.locator('#import-config').click()
  await page.locator('#open-dialog').waitFor({ state: 'visible' })
  const [chooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.locator('[data-studio-action="choose-project-file"]').click()
  ])
  await chooser.setFiles(filePath)
  await page.locator('#studio-layout').waitFor({ state: 'visible' })
}
async function assertNoOverflow() {
  const dimensions = await page.evaluate(() => ({ viewport: innerWidth, scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth }))
  assert.ok(dimensions.scroll <= dimensions.viewport + 1, JSON.stringify(dimensions))
  return dimensions
}
async function setTheme(theme) {
  const current = await page.locator('html').getAttribute('data-theme')
  if (current !== theme) await page.locator('#theme-toggle').click()
  assert.equal(await page.locator('html').getAttribute('data-theme'), theme)
}

async function main() {
  await fs.mkdir(output, { recursive: true })
  try {
    if (!base) {
      const { createAtlasServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href)
      server = await createAtlasServer({ rootDir: root, getApiKey: () => undefined, transport: () => { throw new Error('Unexpected provider call in handoff test') } })
      await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
      base = `http://127.0.0.1:${server.address().port}/factory/`
      evidence.serverMode = 'Isolated application server without credentials or provider calls'
    } else evidence.serverMode = 'Explicit ATLAS_TEST_URL override'
    evidence.base = base
    zipApi = await import(pathToFileURL(path.join(root, 'factory/zip.mjs')).href)
    browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
    evidence.browser = browser.version()
    evidence.driverSha256 = sha(await fs.readFile(__filename))
    evidence.sourcesBefore = await sourceHashes()
    await check('01-first-use', async () => {
      await fresh()
      await start()
      const task = await page.locator('#task-guide').innerText()
      assert.match(task, /How will you know it works\?/)
      assert.doesNotMatch(task, /What outcome does the user need|Review my download/)
      await page.screenshot({ path: path.join(output, 'workflow-1440.png') })
      await page.locator('#task-guide button').click()
      await page.locator('[data-field="workflow.answers.acceptance"]').waitFor({ state: 'visible' })
      assert.equal(await page.locator('[data-field="workflow.answers.acceptance"]').evaluate(element => element === document.activeElement), true)
      const inherited = page.locator('.inherited-intent')
      assert.match(await inherited.innerText(), /USES YOUR PROJECT OUTCOME/)
      assert.ok((await inherited.innerText()).includes(wanted))
      assert.equal(await inherited.locator('details').getAttribute('open'), null)
      assert.equal(await inherited.locator('textarea').inputValue(), '')
      return 'Acceptance is the next action. The supplied outcome is visible, while optional refinement is collapsed and blank.'
    })
    await check('02-outcome-inheritance', async () => {
      await closeDetails()
      await briefView(page)
      await page.locator('#project-purpose').fill(changedWanted)
      await details()
      assert.ok((await page.locator('.inherited-intent').innerText()).includes(changedWanted))
      await expand('[data-detail="intent-user-need"]')
      await page.locator('[data-field="workflow.answers.user-need"]').fill(refined)
      await closeDetails()
      await briefView(page)
      await page.locator('#project-purpose').fill(finalWanted)
      await details()
      assert.equal(await page.locator('[data-field="workflow.answers.user-need"]').inputValue(), refined)
      await readFile('WORKFLOW.md')
      let workflow = await previewContains(refined)
      assert.ok(workflow.includes(refined))
      await details()
      await expand('[data-detail="intent-user-need"]')
      await page.locator('[data-field="workflow.answers.user-need"]').fill('')
      await readFile('WORKFLOW.md')
      workflow = await previewContains(refined, false)
      assert.ok(workflow.includes(finalWanted))
      assert.ok(!workflow.includes(refined))
      const project = JSON.parse(await readFile('project.json'))
      assert.equal(project.project.purpose, finalWanted)
      assert.equal(project.workflow.answers['user-need'] || '', '')
      assert.equal(project.project.host, '')
      assert.equal(project.project.sourceControl, '')
      return 'Outcome changes propagate until refinement is supplied. Explicit refinement survives another outcome change. Clearing it restores inheritance. Host and source control remain unselected.'
    })
    await check('03-blueprint-consistency', async () => {
      const filePaths = await page.locator('#file-tree [data-file]').evaluateAll(elements => elements.map(element => element.dataset.file))
      const count = Number((await page.locator('#file-count').innerText()).match(/\d+/)[0])
      assert.equal(count, filePaths.length)
      assert.ok(!filePaths.some(file => file.startsWith('.github/')))
      assert.match(await page.locator('#file-output-description').innerText(), /Workflow blueprint/)
      await openDownload()
      assert.equal(await page.locator('[data-output-kind="blueprint"]').isChecked(), true)
      assert.match(await page.locator('#download-review').innerText(), /Draft blueprint ready to share/)
      assert.equal(await page.locator('#download-review .blueprint-findings').getAttribute('open'), null)
      await expand('#download-review .blueprint-findings')
      assert.match(await page.locator('#download-review .blueprint-findings').innerText(), /source locations|Component name|repository relative path|test command/)
      await page.locator('#download-review .blueprint-findings summary').click()
      const downloadCount = Number((await page.locator('#selected-output-description').innerText()).match(/\d+/)[0])
      assert.equal(downloadCount, count)
      await expand('#download-use-guide .download-inventory')
      const inventory = await page.locator('#download-use-guide .download-inventory code').allTextContents()
      assert.deepEqual([...inventory].sort(), [...filePaths].sort())
      initialZip = await receive(page.locator('[data-studio-action="download-output"]'), 'initial-blueprint.zip')
      const entries = await inspectZip(initialZip)
      assert.deepEqual([...entries.keys()].sort(), [...filePaths].sort())
      return { fileCount: count, inventoryMatchesVisibleFilesAndActualZip: true }
    })
    await check('04-reopen-and-edit', async () => {
      assert.ok(initialZip, 'Initial download is required')
      await openZip(initialZip.filePath)
      await details()
      await page.locator('[data-field="workflow.answers.acceptance"]').fill(acceptance)
      await readFile('templates/REQUIREMENTS.md')
      const requirements = await previewContains(acceptance)
      assert.ok(requirements.includes(acceptance))
      assert.equal(await page.locator('#opened-files-strip').isHidden(), true)
      const updates = await page.locator('#session-file-updates').innerText()
      assert.match(updates, /Your edits update \d+ files/)
      assert.doesNotMatch(updates, /external|conflict|need review/i)
      await page.screenshot({ path: path.join(output, 'ordinary-file-update.png') })
      await openDownload()
      assert.equal(await page.locator('#download-source-note').isHidden(), true)
      assert.match(await page.locator('#download-session-updates').innerText(), /Your edits update/)
      updatedZip = await receive(page.locator('[data-studio-action="download-output"]'), 'acceptance-blueprint.zip')
      const entries = await inspectZip(updatedZip)
      assert.ok(entries.get('templates/REQUIREMENTS.md').includes(acceptance))
      assert.ok(entries.get('WORKFLOW.md').includes(acceptance))
      assert.equal(JSON.parse(entries.get('project.json')).workflow.answers.acceptance, acceptance)
      return { neutralUpdateNotice: updates, suppliedAcceptancePreservedInBothFilesAndProject: true }
    })
    await check('04b-selected-output-notice', async () => {
      assert.ok(updatedZip, 'Updated download is required')
      await page.locator('[data-output-kind="skill"]').check()
      await expand('#download-use-guide .download-inventory')
      const inventory = await page.locator('#download-use-guide .download-inventory code').allTextContents()
      const notice = page.locator('#download-session-updates')
      if (await notice.isVisible()) {
        await expand('#download-session-updates details')
        const text = await notice.innerText()
        const updatePaths = await notice.locator('code').allTextContents()
        if (/next download includes these changes/i.test(text)) {
          assert.deepEqual(updatePaths.filter(file => !inventory.includes(file)), [], 'The notice promises files excluded by the selected output')
        } else {
          assert.match(text, /opened pack|original output|may contain|selected download|decisions made in this session/i)
        }
        return { selectedOutput: 'skill', notice: text, updatePaths, selectedInventory: inventory }
      }
      return { selectedOutput: 'skill', notice: 'No visible update list', selectedInventory: inventory }
    })
    await check('05-acceptance-roundtrip', async () => {
      assert.ok(updatedZip, 'Updated download is required')
      await openZip(updatedZip.filePath)
      await details()
      assert.equal(await page.locator('[data-field="workflow.answers.acceptance"]').inputValue(), acceptance)
      assert.ok((await readFile('templates/REQUIREMENTS.md')).includes(acceptance))
      assert.equal(await page.locator('#opened-files-strip').isHidden(), true)
      return 'A fresh browser context imports the actual revised ZIP and restores the exact acceptance text without a supplied-file warning.'
    })
    await check('06-edited-file-preservation', async () => {
      assert.ok(initialZip, 'Initial download is required')
      const entries = await inspectZip(initialZip)
      entries.set('WORKFLOW.md', entries.get('WORKFLOW.md') + '\n\n## External owner note\nPreserve this exact text: <policy> and ``` and Ελληνικά.\r\n')
      const bytes = zipApi.zipFiles([...entries].map(([path, content]) => ({ path, content })))
      const fixturePath = path.join(output, 'externally-edited-blueprint.zip')
      await fs.writeFile(fixturePath, bytes)
      await openZip(fixturePath)
      await readFile('WORKFLOW.md')
      const warning = await page.locator('#opened-files-strip').innerText()
      assert.match(warning, /supplied file needs review/)
      assert.match(warning, /already differed|origin is unknown/)
      await page.screenshot({ path: path.join(output, 'supplied-file-warning.png') })
      const retained = await receive(page.locator('#opened-files-strip [data-studio-action="download-opened-files"]'), 'preserved-original-files.zip')
      const actual = await inspectZip(retained)
      assert.deepEqual([...actual.keys()].sort(), [...entries.keys()].sort())
      for (const [name, original] of entries) assert.equal(actual.get(name), original, `Original text changed: ${name}`)
      await openDownload()
      assert.equal(await page.locator('#download-source-note').isVisible(), true)
      return { warning, exactOriginalFileContentsPreserved: entries.size, archiveContainerBytesCompared: false }
    })
    for (const kind of ['pack', 'skill']) {
      await check(`07-explicit-${kind}`, async () => {
        await fresh()
        await start()
        await openDownload(kind)
        const selectedSkill = kind === 'skill' ? await page.locator('#output-skill').inputValue() : null
        await closeDownload()
        await openDownload()
        assert.equal(await page.locator(`[data-output-kind="${kind}"]`).isChecked(), true)
        if (selectedSkill) assert.equal(await page.locator('#output-skill').inputValue(), selectedSkill)
        const saved = await receive(page.locator('[data-studio-action="download-output"]'), `explicit-${kind}.zip`)
        await openZip(saved.filePath)
        await openDownload()
        assert.equal(await page.locator(`[data-output-kind="${kind}"]`).isChecked(), true)
        if (selectedSkill) assert.equal(await page.locator('#output-skill').inputValue(), selectedSkill)
        await closeDownload()
        await page.locator('#view-nav [data-project-view="artifacts"]').click()
        const uiPaths = await page.locator('#file-tree [data-file]').evaluateAll(elements => elements.map(element => element.dataset.file))
        const entries = await inspectZip(saved)
        assert.deepEqual([...entries.keys()].sort(), uiPaths.sort())
        return { restoredOutput: kind, restoredSkill: selectedSkill, visibleFileCount: uiPaths.length }
      })
    }
    await check('08-bug-expectation', async () => {
      await fresh()
      await start('bugfix', 'Repair the saved filter losing its owner selection.')
      assert.match(await page.locator('#task-guide').innerText(), /What should happen/)
      await details()
      assert.equal(await page.locator('[data-field="workflow.answers.expected"]').inputValue(), '')
      assert.equal(await page.locator('.inherited-intent').count(), 0)
      return 'A repair outcome does not invent the expected behavior of the bug.'
    })
    await check('08b-map-practice-scope', async () => {
      await fresh()
      await start()
      await page.locator('#open-knowledge-map').click()
      await page.locator('#knowledge-workspace').waitFor({ state: 'visible' })
      const atlas = page.frameLocator('#knowledge-frame')
      await atlas.locator('#mobile-topics').click()
      await atlas.locator('#topics-dialog').waitFor({ state: 'visible' })
      await atlas.locator('#mobile-search').fill('Requirements investigation')
      await atlas.locator('#mobile-nav [data-topic="requirements-workflow"]').click()
      await atlas.locator('#topics-dialog').waitFor({ state: 'hidden' })
      await atlas.locator('#reader').waitFor({ state: 'visible' })
      assert.equal(await atlas.locator('#reader-title').innerText(), 'Requirements investigation')
      assert.equal(await atlas.locator('#reader-title').evaluate(element => element === element.ownerDocument.activeElement), true)
      await atlas.getByRole('button', { name: 'Review for my workflow', exact: true }).click()
      await page.locator('#practice-dialog').waitFor({ state: 'visible' })
      await expand('#practice-preview .download-inventory')
      const affected = await page.locator('#practice-preview .download-inventory code').allTextContents()
      assert.ok(affected.length > 0)
      assert.ok(!affected.some(file => file.startsWith('.github/')), 'Blueprint practice preview must use its selected file scope')
      assert.ok(affected.includes('WORKFLOW.md'))
      return { searchOpensReadingDirectly: true, focusedHeading: 'Requirements investigation', selectedOutput: 'blueprint', affectedFiles: affected }
    })
    for (const width of [1440, 320]) for (const theme of ['light', 'dark']) {
      await check(`09-layout-${width}-${theme}`, async () => {
        await fresh({ width, height: width === 320 ? 800 : 1000 })
        await setTheme(theme)
        const startDimensions = await assertNoOverflow()
        await page.locator('[data-start-recipe="feature-delivery"]').focus()
        await page.keyboard.press('Enter')
        await page.locator('#brief-workspace').waitFor({ state: 'visible' })
        await page.locator('#project-name').fill('Keyboard journey')
        await briefView(page)
        await page.locator('#project-purpose').fill(wanted)
        await page.locator('#brief-workspace [data-project-view="workflow"]').focus()
        await page.keyboard.press('Enter')
        await page.locator('#studio-layout').waitFor({ state: 'visible' })
        const workspaceDimensions = await assertNoOverflow()
        await page.locator('#task-guide button').focus()
        await page.keyboard.press('Enter')
        await page.locator('#inspector').waitFor({ state: 'visible' })
        assert.equal(await page.locator('[data-field="workflow.answers.acceptance"]').evaluate(element => element === document.activeElement), true)
        const inspectorDimensions = await assertNoOverflow()
        await page.locator('.main-navigation [data-main-view="workflow"]').focus()
        await page.keyboard.press('Enter')
        await page.locator('#brief-workspace').waitFor({ state: 'hidden' })
        await page.locator('#download-project').focus()
        await page.keyboard.press('Enter')
        await page.locator('#download-dialog').waitFor({ state: 'visible' })
        const dialogDimensions = await assertNoOverflow()
        assert.match(await page.locator('#download-review').innerText(), /Draft blueprint ready to share/)
        assert.equal(await page.locator('#download-review .blueprint-findings').getAttribute('open'), null)
        await page.locator('[data-studio-action="download-output"]').scrollIntoViewIfNeeded()
        const actionPosition = await page.locator('[data-studio-action="download-output"]').evaluate(element => {
          const action = element.getBoundingClientRect()
          const dialog = element.closest('dialog').getBoundingClientRect()
          return { top: action.top, bottom: action.bottom, dialogTop: dialog.top, dialogBottom: dialog.bottom, viewportHeight: innerHeight }
        })
        assert.ok(actionPosition.top >= actionPosition.dialogTop && actionPosition.bottom <= Math.min(actionPosition.dialogBottom, actionPosition.viewportHeight), JSON.stringify(actionPosition))
        await page.screenshot({ path: path.join(output, `download-${width}-${theme}.png`), fullPage: true })
        await page.keyboard.press('Escape')
        await page.locator('#download-dialog').waitFor({ state: 'hidden' })
        return { theme, width, startDimensions, workspaceDimensions, inspectorDimensions, dialogDimensions, actionPosition, keyboardActions: 'Recipe, shape workflow, next action, return to Workflow, open and close download' }
      })
    }
    await check('10-browser-errors', async () => {
      assert.deepEqual(evidence.errors, [])
      return 'No browser page errors or console errors recorded across these sessions.'
    })
    await check('11-source-stability', async () => {
      evidence.sourcesAfter = await sourceHashes()
      assert.deepEqual(evidence.sourcesAfter, evidence.sourcesBefore, 'Application sources changed while this browser run was in progress')
      return { unchangedSourceFiles: evidence.sourcesAfter.length }
    })
  } finally {
    try { await persist() }
    finally { await closeResources() }
  }
  process.stdout.write(`Evidence: ${output}\n`)
  if (evidence.checks.some(check => check.status !== 'Pass')) process.exitCode = 1
}

main().catch(async error => {
  evidence.fatalError = error.stack || String(error)
  await persist().catch(() => {})
  await closeResources().catch(() => {})
  process.stderr.write(String(error) + '\n')
  process.exitCode = 1
})
