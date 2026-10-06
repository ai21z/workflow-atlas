const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { chromium } = require('playwright')

async function run() {
  const root = path.resolve(__dirname, '..')
  const { createAtlasServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href)
  const { GOAL_STARTERS } = await import(pathToFileURL(path.join(root, 'factory/starter-goals.mjs')).href)
  const { CATALOG } = await import(pathToFileURL(path.join(root, 'factory/core.mjs')).href)
  const { unzipTextFiles } = await import(pathToFileURL(path.join(root, 'factory/zip.mjs')).href)
  const output = path.join(root, 'local-knowledge/retests/starter-goals', new Date().toISOString().replace(/[:.]/g, '-'))
  await fs.mkdir(output, { recursive: true })
  const report = {
    method: 'Public Chrome controls, keyboard actions, file-input imports and actual downloaded ZIP bytes. Synthetic project text. No application state injection or live inference.',
    limits: 'Controlled desktop browser and viewport simulation. This does not establish human usability, screen reader behavior or real touch-device support.',
    checks: [], downloads: [], screenshots: [], pageErrors: [], providerCalls: 0, inferenceRequests: 0, externalRequests: [],
  }
  const server = await createAtlasServer({ rootDir: root, getApiKey: () => '', transport: async () => { report.providerCalls += 1; throw Error('Inference disabled for this trial') } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/factory/`
  let browser, context, page
  const content = (download, name) => download.files.find(file => file.path === name)?.content
  const check = (id, observation) => report.checks.push({ id, status: 'Pass', observation })
  const main = async view => page.locator(`.main-navigation [data-main-view="${view}"]`).click()
  const fresh = async () => {
    if (page) await page.close()
    page = await context.newPage()
    page.setDefaultTimeout(10000)
    await page.goto(base)
    await page.locator('#starter-goal').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#starter-goal option').count(), GOAL_STARTERS.length + 1)
  }
  const choose = async id => {
    await page.locator('#starter-goal').selectOption(id)
    await page.locator('#use-starter-goal').click()
    await page.locator('#project-purpose').waitFor({ state: 'visible' })
  }
  const screenshot = async name => {
    await page.locator('#toast').waitFor({ state: 'hidden', timeout: 10000 })
    await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: false })
    report.screenshots.push(`${name}.png`)
  }
  const filesView = async () => {
    await main('brief')
    await page.locator('#brief-workspace [data-project-view="artifacts"]').click()
    await page.locator('[data-file="WORKFLOW.md"]').click()
    await page.locator('#file-preview').waitFor({ state: 'visible' })
    return page.locator('#file-preview').innerText()
  }
  const download = async (kind, name) => {
    await page.locator('#download-project').click()
    await page.locator(`[data-output-kind="${kind}"]`).check()
    const event = page.waitForEvent('download')
    await page.locator('[data-studio-action="download-output"]').click()
    const actual = await event
    const filePath = path.join(output, `${name}.zip`)
    await actual.saveAs(filePath)
    const bytes = await fs.readFile(filePath)
    const { files } = await unzipTextFiles(new Uint8Array(bytes))
    const project = JSON.parse(files.find(file => file.path === 'project.json').content)
    report.downloads.push({ name, kind, file: path.basename(filePath), bytes: bytes.length, paths: files.map(file => file.path) })
    await page.locator('[data-close-dialog="download-dialog"]').click()
    return { filePath, files, project }
  }
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, reducedMotion: 'reduce' })
    context.on('page', opened => {
      opened.on('pageerror', error => report.pageErrors.push(error.message))
      opened.on('request', request => {
        const url = new URL(request.url())
        if (url.pathname.startsWith('/api/jev/') && url.pathname !== '/api/jev/status') report.inferenceRequests += 1
        if (url.protocol.startsWith('http') && url.origin !== new URL(base).origin) report.externalRequests.push(url.origin + url.pathname)
      })
    })
    for (const goal of GOAL_STARTERS) {
      await fresh()
      await page.locator('#starter-goal').selectOption(goal.id)
      assert.equal(await page.locator('#studio-layout').isVisible(), false, `${goal.id}: selection does not create a project`)
      assert.equal(await page.locator('#jev-brief').inputValue(), '', `${goal.id}: selection does not insert a description`)
      assert.equal(await page.locator('#use-starter-goal').isVisible(), true)
      await page.locator('#use-starter-goal').click()
      await page.locator('#project-purpose').waitFor({ state: 'visible' })
      assert.equal(await page.locator('#project-purpose').inputValue(), goal.purpose)
      assert.equal(await page.locator('#project-name').inputValue(), goal.label)
      assert.equal(await page.locator('#recipe-choice').inputValue(), goal.recipeId)
      assert.equal(await page.locator('#active-goal-host #starter-goal').count(), 1)
      assert.equal(await page.locator('#use-starter-goal').innerText(), 'Start a new draft')
      assert.equal(await page.locator('#starter-goal-label').innerText(), 'Start another draft')
      await main('workflow')
      const expectedStages = CATALOG.recipes.find(recipe => recipe.id === goal.recipeId).stageIds
      const displayedStages = await page.locator('#project-content .pv-authoring-stage [data-select-stage]').evaluateAll(buttons => buttons.map(button => button.dataset.selectStage))
      assert.deepEqual(displayedStages, expectedStages, `${goal.id}: workflow stages`)
      await page.locator(`[data-select-stage="${expectedStages[0]}"]`).first().click()
      assert.equal(await page.locator(`[data-field="workflow.notes.${expectedStages[0]}"]`).inputValue(), goal.stageNotes[expectedStages[0]])
      const workflow = await filesView()
      assert.ok(workflow.includes(goal.purpose))
      for (const note of Object.values(goal.stageNotes)) assert.ok(workflow.includes(note), `${goal.id}: generated planning note`)
      await main('brief')
      const unresolvedId = goal.recipeId === 'bugfix' ? 'observed' : goal.recipeId === 'feasibility' ? 'current-work' : 'acceptance'
      assert.equal(await page.locator(`[data-field="workflow.answers.${unresolvedId}"]`).inputValue(), '', `${goal.id}: unknown answer`)
      check(`goal-${goal.id}`, `${goal.recipeId} stages, editable goal notes and literal file guidance agree. Selection alone did not change the session. Unknown answers remain empty.`)
    }

    await fresh()
    const original = 'Connect our reporting service so staff can review the permitted records.'
    const accepted = 'An unavailable service shows a clear retry option. A user cannot see records outside their permitted scope.'
    await page.locator('#jev-brief').fill(original)
    await page.locator('[data-start-recipe="feature-delivery"]').click()
    assert.equal(await page.locator('#jev-next-answer').getAttribute('data-jev-answer'), 'acceptance')
    await page.locator('#jev-next-answer').fill(accepted)
    await page.locator('[data-jev-action="answer"]').click()
    const picker = page.locator('#starter-goal')
    await picker.focus()
    await picker.press('Home')
    await picker.press('ArrowDown')
    await picker.press('ArrowDown')
    await picker.press('Enter')
    assert.equal(await picker.inputValue(), 'connect-service')
    await page.locator('#use-starter-goal').focus()
    await page.locator('#use-starter-goal').press('Enter')
    await page.locator('#project-purpose').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#project-purpose').inputValue(), original)
    assert.equal(await page.locator('[data-field="workflow.answers.acceptance"]').inputValue(), accepted)
    check('keyboard-and-confirmed-wording', 'Native select keyboard actions and Enter create a goal draft. The previously typed result and explicitly recorded acceptance are retained, without an inference request.')

    const revised = 'Connect our reporting service and preserve staff permissions when they review records.'
    const editedNote = 'Inspect the approved reporting contract. Keep the original permission rules. Ask the owner before adding any write operation.'
    await page.locator('#project-purpose').fill(revised)
    await main('workflow')
    await page.locator('[data-select-stage="architecture"]').first().click()
    await page.locator('[data-field="workflow.notes.architecture"]').fill(editedNote)
    assert.ok((await filesView()).includes(editedNote))
    const blueprint = await download('blueprint', 'service-blueprint')
    const full = await download('pack', 'service-full-pack')
    const service = GOAL_STARTERS.find(goal => goal.id === 'connect-service')
    for (const downloaded of [blueprint, full]) {
      assert.equal(downloaded.project.project.purpose, revised)
      assert.equal(downloaded.project.workflow.notes.architecture, editedNote)
      assert.equal(downloaded.project.workflow.answers.acceptance, accepted)
      assert.deepEqual(downloaded.project.facts, [])
      assert.deepEqual(downloaded.project.evidence, [])
      for (const [stage, note] of Object.entries(service.stageNotes)) if (stage !== 'architecture') assert.equal(downloaded.project.workflow.notes[stage], note)
      assert.ok(content(downloaded, 'WORKFLOW.md').includes(editedNote))
      assert.ok(content(downloaded, 'templates/REQUIREMENTS.md').includes(accepted))
      assert.equal(JSON.parse(content(downloaded, 'manifest.json')).draft, true)
    }
    assert.equal(blueprint.files.some(file => file.path.startsWith('.github/')), false)
    assert.equal(full.files.some(file => file.path.endsWith('.agent.md')), true)
    check('files-and-actual-downloads', 'Edited purpose and architecture instructions reach the visible file preview and both actual ZIPs. Known acceptance stays literal. Setup and observed evidence remain unresolved.')
    for (const downloaded of [blueprint, full]) {
      await fresh()
      await page.locator('#import-config').click()
      await page.locator('#import-file').setInputFiles(downloaded.filePath)
      await page.locator('#project-name').waitFor({ state: 'visible' })
      await main('brief')
      assert.equal(await page.locator('#project-purpose').inputValue(), revised)
      assert.equal(await page.locator('[data-field="workflow.answers.acceptance"]').inputValue(), accepted)
      await main('workflow')
      await page.locator('[data-select-stage="architecture"]').first().click()
      assert.equal(await page.locator('[data-field="workflow.notes.architecture"]').inputValue(), editedNote)
      assert.ok((await filesView()).includes(service.stageNotes.requirements))
    }
    check('download-reimport', 'Both saved Chrome ZIPs reopen through the public importer with the edited purpose, confirmed answer, edited stage note and unedited starter guidance intact.')

    await main('brief')
    const unkept = 'My additional wording has not been downloaded.'
    await page.locator('#project-purpose').fill(unkept)
    await page.locator('#starter-goal').selectOption('fix-bug')
    assert.equal(await page.locator('#project-purpose').inputValue(), unkept, 'Choosing another goal does not modify current work')
    await page.locator('#use-starter-goal').click()
    await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
    await page.locator('#confirm-dialog [value="cancel"]').click()
    assert.equal(await page.locator('#project-purpose').inputValue(), unkept)
    assert.equal(await page.locator('#recipe-choice').inputValue(), 'feature-delivery')
    await page.locator('#use-starter-goal').click()
    await page.locator('#confirm-dialog [value="replace"]').click()
    await page.waitForFunction(() => document.querySelector('#recipe-choice')?.value === 'bugfix')
    assert.equal(await page.locator('#project-purpose').inputValue(), GOAL_STARTERS.find(goal => goal.id === 'fix-bug').purpose)
    assert.equal(await page.locator('[data-field="workflow.answers.observed"]').inputValue(), '')
    assert.equal(await page.locator('[data-field="workflow.answers.expected"]').inputValue(), '')
    check('guarded-replacement', 'Cancelling keeps the edited result and feature workflow. Explicit replacement creates the selected bug draft, with expected and observed behavior still open.')

    await fresh()
    await choose('add-feature')
    await main('workflow')
    await page.locator('[data-pe-new]').click()
    const designer = page.locator('#process-designer')
    await designer.locator('[data-pe-start="name"]').fill('My pending review process')
    await designer.locator('[data-pe-start="pattern"]').selectOption('review-gate')
    await designer.locator('[data-pe-action="create"]').click()
    const pending = 'My unaccepted process action must survive cancelling another goal.'
    await designer.locator('[data-pe-bind="steps.0.action"]').fill(pending)
    await main('brief')
    await page.locator('#starter-goal').selectOption('repair-pipeline')
    await page.locator('#use-starter-goal').click()
    await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
    assert.match(await page.locator('#confirm-description').innerText(), /pending edits/)
    await page.locator('#confirm-dialog [value="cancel"]').click()
    await main('workflow')
    assert.equal(await designer.locator('[data-pe-bind="steps.0.action"]').inputValue(), pending)
    check('pending-process-protection', 'Starting another goal warns about the unaccepted custom process. Cancelling preserves its exact pending action and the current project.')

    await fresh()
    await page.locator('#starter-goal').selectOption('plan-ai-workflow')
    const heading = await page.locator('#start-screen .brief-heading-row h1').boundingBox()
    const goalBox = await page.locator('#goal-picker').boundingBox()
    assert.ok(goalBox.x >= heading.x + heading.width - 1, 'Desktop goal picker is beside the heading on its right')
    assert.ok(goalBox.y < heading.y + heading.height, 'Desktop goal picker shares the heading row')
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 })
      for (const theme of ['light', 'dark']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click()
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Empty Brief fits ${width}px ${theme}`)
        assert.equal(await page.locator('#starter-goal').count(), 1)
        await screenshot(`start-${width}-${theme}`)
      }
    }
    await page.locator('#use-starter-goal').click()
    await page.locator('#project-purpose').waitFor({ state: 'visible' })
    for (const width of [1440, 768, 390, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 })
      for (const theme of ['light', 'dark']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click()
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Active Brief fits ${width}px ${theme}`)
        assert.equal(await page.locator('#active-goal-host #starter-goal').isVisible(), true)
        await screenshot(`active-${width}-${theme}`)
      }
    }
    check('responsive-and-themes', 'The picker is right of the title on desktop. Empty and active Brief fit 1440, 768, 390 and 320 pixels in both themes, including the short 320 by 568 viewport.')
    assert.equal(report.providerCalls, 0)
    assert.equal(report.inferenceRequests, 0)
    assert.deepEqual(report.externalRequests, [])
    assert.deepEqual(report.pageErrors, [])
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    console.log(`Starter goal UI checks passed. ${report.checks.length} groups, ${report.downloads.length} actual ZIPs, ${report.screenshots.length} screenshots. Evidence: ${output}`)
  } catch (error) {
    report.failure = error.message
    if (page && !page.isClosed()) {
      await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: false }).catch(() => {})
      report.visibleState = await page.evaluate(() => ({ url: location.href, focused: document.activeElement?.id, width: innerWidth, documentWidth: document.documentElement.scrollWidth })).catch(() => null)
    }
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    throw error
  } finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 })
