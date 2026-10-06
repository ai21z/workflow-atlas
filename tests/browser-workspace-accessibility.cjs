const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { chromium } = require('playwright')

async function run() {
  const root = path.resolve(__dirname, '..')
  const output = path.join(root, 'local-knowledge/retests/workspace-accessibility', new Date().toISOString().replace(/[:.]/g, '-'))
  await fs.mkdir(output, { recursive: true })
  const report = {
    method: 'Installed Chrome, public controls on an isolated server with no credentials. Keyboard events, DOM focus observations, reduced motion and a controlled WebGL failure.',
    limits: 'Functional browser checks. No screen reader, real mobile device, human comprehension or full accessibility conformance assessment.',
    checks: [], errors: [], consoleErrors: [], providerCalls: 0,
  }
  const { createAtlasServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href)
  const server = await createAtlasServer({ rootDir: root, getApiKey: () => undefined, transport: () => { report.providerCalls++; throw new Error('Provider calls are disabled') } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}`
  let browser, page, context
  const persist = () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  const check = async (id, action) => {
    const record = { id, status: 'Not run' }
    report.checks.push(record)
    try { record.observation = await action(); record.status = 'Pass' }
    catch (error) { record.status = 'Fail'; record.error = error.stack || String(error) }
    if (page && !page.isClosed()) {
      record.screenshot = `${id}.png`
      await page.screenshot({ path: path.join(output, record.screenshot) })
    }
    await persist()
    console.log(`${id}: ${record.status}`)
  }
  const fresh = async ({ width = 1440, height = 1000, noWebGL = false } = {}) => {
    await context?.close()
    context = await browser.newContext({ viewport: { width, height }, reducedMotion: 'reduce' })
    if (noWebGL) await context.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function (type, ...arguments) {
        if (/webgl/i.test(type)) return null
        return original.call(this, type, ...arguments)
      }
    })
    page = await context.newPage()
    page.setDefaultTimeout(7000)
    page.on('pageerror', error => report.errors.push(error.message))
    page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push(message.text()) })
    await page.goto(`${base}/factory/`)
    await page.locator('#start-screen').waitFor({ state: 'visible' })
  }
  const focusId = () => page.evaluate(() => document.activeElement.id)
  const tabTo = async (selector, reverse = false) => {
    for (let count = 0; count < 160; count++) {
      if (await page.locator(selector).evaluate(element => element === document.activeElement)) return count
      await page.keyboard.press(reverse ? 'Shift+Tab' : 'Tab')
    }
    throw new Error(`Keyboard order did not reach ${selector}`)
  }
  const enterNav = async (view, reverse = false) => {
    const count = await tabTo(`.main-navigation [data-main-view="${view}"]`, reverse)
    await page.keyboard.press('Enter')
    assert.equal(await page.locator(`.main-navigation [data-main-view="${view}"]`).getAttribute('aria-current'), 'page')
    return count
  }
  const fits = () => page.evaluate(() => ({ viewport: innerWidth, documentWidth: document.documentElement.scrollWidth, headerHeight: document.querySelector('.studio-header').getBoundingClientRect().height }))
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    await check('empty-session-skip-and-main-keyboard', async () => {
      await fresh()
      await page.keyboard.press('Tab')
      assert.equal(await page.locator('.skip').evaluate(element => element === document.activeElement), true)
      await page.keyboard.press('Enter')
      assert.equal(await focusId(), 'start-screen')
      const workflowTabs = await enterNav('workflow', true)
      assert.equal(await focusId(), 'empty-workflow')
      assert.equal(await page.locator('.skip').getAttribute('href'), '#empty-workflow')
      await tabTo('.skip', true)
      await page.keyboard.press('Enter')
      assert.equal(await focusId(), 'empty-workflow')
      const knowledgeTabs = await enterNav('knowledge', true)
      await page.frameLocator('#knowledge-frame').locator('#map-title').waitFor({ state: 'visible' })
      assert.equal(await page.locator('.skip').getAttribute('href'), '#knowledge-frame')
      await tabTo('.skip', true)
      await page.keyboard.press('Enter')
      assert.equal(await focusId(), 'knowledge-frame')
      assert.equal(await page.locator('#knowledge-workspace').isVisible(), true)
      const briefTabs = await enterNav('brief', true)
      assert.equal(await focusId(), 'start-screen')
      assert.equal(await page.locator('#studio-layout').isVisible(), false)
      return { workflowTabs, knowledgeTabs, briefTabs, focus: 'Each main destination and the empty-session skip link is reached and activated with Tab and Enter.' }
    })
    await check('accepted-project-files-and-editor-focus', async () => {
      await fresh()
      await tabTo('[data-start-recipe="feature-delivery"]')
      await page.keyboard.press('Enter')
      assert.equal(await focusId(), 'project-purpose')
      await page.keyboard.type('Download the filtered report as CSV.')
      await page.locator('#project-name').fill('Keyboard export plan')
      await enterNav('workflow', true)
      assert.equal(await focusId(), 'project-content')
      await tabTo('[data-select-stage="requirements"]')
      await page.keyboard.press('Enter')
      assert.equal(await focusId(), 'step-content')
      await page.locator('[data-field="workflow.notes.requirements"]').fill('Preserve the report column order.')
      await tabTo('#view-nav [data-project-view="artifacts"]', true)
      await page.keyboard.press('Enter')
      assert.equal(await focusId(), 'artifact-workspace')
      await tabTo('[data-file="project.json"]')
      await page.keyboard.press('Enter')
      assert.equal(await page.locator('#preview-path').innerText(), 'project.json')
      assert.equal(JSON.parse(await page.locator('#file-preview').innerText()).project.purpose, 'Download the filtered report as CSV.')
      await enterNav('brief', true)
      assert.equal(await focusId(), 'brief-workspace')
      await enterNav('workflow', true)
      assert.equal(await focusId(), 'artifact-workspace')
      assert.equal(await page.locator('#preview-path').innerText(), 'project.json')
      await tabTo('#view-nav [data-project-view="workflow"]', true)
      await page.keyboard.press('Enter')
      assert.equal(await focusId(), 'project-content')
      assert.equal(await page.locator('[data-select-stage="requirements"]').getAttribute('aria-pressed'), 'true')
      await enterNav('brief', true)
      await tabTo('.skip', true)
      await page.keyboard.press('Enter')
      assert.equal(await focusId(), 'brief-workspace')
      return 'The stage, selected JSON file and exact recorded text survive keyboard view changes. Main Workflow restores Files when that was its previous perspective. Edit workflow focuses the diagram region and retains the selected stage. Brief skip focuses its current region.'
    })
    await check('reduced-motion-and-webgl-fallback', async () => {
      await fresh({ noWebGL: true })
      assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true)
      assert.equal(await page.locator('.theme-switch-thumb').evaluate(element => getComputedStyle(element).transitionDuration), '0s')
      await enterNav('knowledge', true)
      const map = page.frameLocator('#knowledge-frame')
      await map.locator('[data-view="2d"]').waitFor({ state: 'visible' })
      await page.waitForFunction(() => document.querySelector('#knowledge-frame').contentDocument.body.dataset.graph === 'fallback')
      assert.equal(await map.locator('[data-view="3d"]').isDisabled(), true)
      assert.equal(await map.locator('[data-view="2d"]').getAttribute('aria-pressed'), 'true')
      assert.equal(await map.locator('#map-rotation').isDisabled(), true)
      await map.locator('#mobile-topics').press('Enter')
      await map.locator('#mobile-search').fill('Requirements investigation')
      await map.locator('#mobile-nav [data-topic="requirements-workflow"]').press('Enter')
      assert.equal(await map.locator('#reader-title').evaluate(element => element === element.ownerDocument.activeElement), true)
      assert.equal(await map.locator('#reader-title').innerText(), 'Requirements investigation')
      await page.keyboard.press('Escape')
      await page.keyboard.press('Escape')
      await page.locator('#start-screen').waitFor({ state: 'visible' })
      return 'WebGL context creation was forced to return null. The unavailable 3D control is disabled, topic cards remain selected, keyboard search opens the reading heading, and Escape returns to Brief. Reduced motion disables automatic rotation and switch transitions.'
    })
    await check('native-zoom-attempt-and-reflow', async () => {
      await fresh()
      const initial = await page.evaluate(() => ({ width: innerWidth, pixelRatio: devicePixelRatio }))
      for (let count = 0; count < 5; count++) await page.keyboard.press('Control+Equal')
      const zoomed = await page.evaluate(() => ({ width: innerWidth, pixelRatio: devicePixelRatio }))
      const actualZoom = zoomed.pixelRatio / initial.pixelRatio
      const nativeZoomObserved = actualZoom >= 1.9 && actualZoom <= 2.1
      if (!nativeZoomObserved) {
        await page.keyboard.press('Control+0')
        await page.setViewportSize({ width: 720, height: 500 })
      }
      const empty = await fits()
      assert.ok(empty.documentWidth <= empty.viewport + 1)
      await page.locator('[data-start-recipe="feature-delivery"]').press('Enter')
      await page.locator('#project-purpose').fill('Keep the outcome understandable at a narrower viewport.')
      await page.locator('.main-navigation [data-main-view="workflow"]').press('Enter')
      const workflow = await fits()
      assert.ok(workflow.documentWidth <= workflow.viewport + 1)
      for (const view of ['brief', 'workflow', 'knowledge']) {
        const link = page.locator(`.main-navigation [data-main-view="${view}"]`)
        assert.equal(await link.isVisible(), true)
        assert.equal(await link.evaluate(element => {
          const rectangle = element.getBoundingClientRect()
          return rectangle.width > 0 && rectangle.left >= 0 && rectangle.right <= innerWidth + 1
        }), true)
      }
      return { initial, zoomed, nativeZoomObserved, actualZoom, substitute: nativeZoomObserved ? null : 'Headless Chrome did not expose native browser zoom through the shortcut. A 720 by 500 CSS viewport verifies narrower reflow only, not text enlargement or native 200% zoom.', empty, workflow }
    })
    await check('controlled-double-text-enlargement', async () => {
      const observations = []
      const enlarge = () => page.evaluate(() => {
        const nodes = [...document.querySelectorAll('body,body *')]
          .filter(element => !element.hasAttribute('data-test-enlarged'))
          .map(element => ({ element, size: parseFloat(getComputedStyle(element).fontSize) }))
        for (const { element, size } of nodes) {
          if (!Number.isFinite(size)) continue
          element.style.fontSize = `${size * 2}px`
          element.setAttribute('data-test-enlarged', '')
        }
      })
      for (const width of [1440, 768, 320]) {
        await fresh({ width, height: 1000 })
        await enlarge()
        const start = await fits()
        assert.ok(start.documentWidth <= start.viewport + 1)
        await page.locator('[data-start-recipe="feature-delivery"]').press('Enter')
        await page.locator('#project-purpose').fill('Keep my workflow readable with enlarged text.')
        await enlarge()
        const brief = await fits()
        assert.ok(brief.documentWidth <= brief.viewport + 1)
        await page.locator('.main-navigation [data-main-view="workflow"]').press('Enter')
        await enlarge()
        const workflow = await fits()
        assert.ok(workflow.documentWidth <= workflow.viewport + 1)
        for (const view of ['brief', 'workflow', 'knowledge']) assert.equal(await page.locator(`.main-navigation [data-main-view="${view}"]`).isVisible(), true)
        observations.push({ width, start, brief, workflow })
        await page.screenshot({ path: path.join(output, `double-text-${width}.png`), fullPage: true })
      }
      return { technique: 'Controlled test styles double each current element computed font size once. This verifies text-only enlargement without claiming native browser zoom or screen reader behavior.', observations }
    })
    await check('custom-editor-skip-region', async () => {
      await fresh()
      await tabTo('[data-start-process]')
      await page.keyboard.press('Enter')
      await page.locator('#workflow-designer-host').waitFor({ state: 'visible' })
      assert.equal(await page.locator('.skip').getAttribute('href'), '#workflow-designer-host')
      await tabTo('.skip', true)
      const before = await page.evaluate(() => history.length)
      await page.keyboard.press('Enter')
      assert.equal(await focusId(), 'workflow-designer-host')
      assert.equal(await page.evaluate(() => history.length), before)
      await enterNav('brief', true)
      assert.equal(await focusId(), 'brief-workspace')
      await enterNav('workflow', true)
      assert.equal(await focusId(), 'workflow-designer-host')
      return 'Skip targets the inline connected-process region without creating a route entry. Main navigation stays keyboard reachable and returns to the retained process editor.'
    })
    assert.deepEqual(report.errors, [])
    assert.ok(report.consoleErrors.every(message => /THREE\.WebGLRenderer: Error creating WebGL(?:2)? context/.test(message)), 'Only the deliberately forced WebGL initialization failure may produce a console error')
    assert.equal(report.providerCalls, 0)
    assert.ok(report.checks.every(record => record.status === 'Pass'), `Failed checks: ${output}`)
    console.log(`PASS ${report.checks.length} accessibility behavior groups. Evidence: ${output}`)
  } finally {
    await persist()
    await browser?.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 })
