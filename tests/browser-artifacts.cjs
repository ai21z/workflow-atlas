const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright')) }

async function run() {
  const root = path.resolve(__dirname, '..')
  const output = path.join(root, 'local-knowledge/retests/artifact-beta', new Date().toISOString().replace(/[:.]/g, '-'))
  await fs.mkdir(output, { recursive: true })
  const core = await import(pathToFileURL(path.join(root, 'factory/core.mjs')).href)
  const portable = await import(pathToFileURL(path.join(root, 'factory/portable.mjs')).href)
  const cases = [
    { recipe: 'feature-delivery', skill: 'requirement-refinement', purpose: 'Export the filtered report rows to CSV.', answers: { acceptance: 'An empty filter produces headers only. Keep the visible column order.', affected: 'The report screen and existing read API.' } },
    { recipe: 'bugfix', skill: 'bug-diagnosis', purpose: 'Repair the saved search filter.', answers: { expected: 'Reopening keeps the optional filter.', observed: 'The filter disappears when the dates are empty.', impact: 'Users reopening saved searches without dates.' } },
    { recipe: 'feasibility', skill: 'feasibility-analysis', purpose: 'Give the PM a go/no-go proposal for a guided configuration service.', answers: { 'current-work': 'An engineer reads customer references and reviews every result.', 'decision-boundary': 'Compare effort, operating cost and incorrect output risk before approving a build.' } },
  ]
  const browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
  const report = { method: 'Compiled actual output files, then opened each portable HTML offline in installed Chrome. Keyboard, responsive layout, theme switch state and preserved decision text checked through the DOM.', limits: 'Controlled browser checks. No Copilot host adoption, task execution, human comprehension study or screen reader audit.', checks: [], errors: [], remoteRequests: [] }
  try {
    const context = await browser.newContext({ offline: true, viewport: { width: 1440, height: 960 }, reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.on('pageerror', error => report.errors.push(error.message))
    page.on('request', request => { if (/^https?:/.test(request.url())) report.remoteRequests.push(request.url()) })
    for (const example of cases) {
      const config = core.createRecipe(example.recipe)
      config.project.name = `${example.recipe} artifact review`
      config.project.purpose = example.purpose
      config.workflow.answers = example.answers
      for (const selection of [{ kind: 'blueprint' }, { kind: 'skill', skillId: example.skill }, { kind: 'pack' }]) {
        const pack = portable.packageProject(config, core.compileSelectedOutput(config, selection))
        const directory = path.join(output, `${example.recipe}-${selection.kind}`)
        for (const file of pack.files) {
          const destination = path.join(directory, file.path)
          await fs.mkdir(path.dirname(destination), { recursive: true })
          await fs.writeFile(destination, file.content)
        }
        await page.goto(pathToFileURL(path.join(directory, 'PROJECT-ATLAS.html')).href)
        const toggle = page.getByRole('switch', { name: 'Dark mode', exact: true })
        await toggle.focus()
        const before = await page.locator('html').getAttribute('data-theme')
        assert.equal(await toggle.getAttribute('aria-checked'), String(before === 'dark'))
        await toggle.press('Space')
        assert.equal(await toggle.getAttribute('aria-checked'), String(before !== 'dark'))
        assert.equal(await toggle.textContent(), 'Dark mode')
        assert.equal(await toggle.evaluate(element => element === document.activeElement), true)
        for (const width of [1440, 768, 320]) {
          await page.setViewportSize({ width, height: 960 })
          for (const theme of ['light', 'dark']) {
            if (await page.locator('html').getAttribute('data-theme') !== theme) await toggle.click()
            for (const view of ['overview', 'workflow', 'decisions', 'artifacts']) {
              if (await page.locator('#viewer-nav-toggle').isVisible() && await page.locator('#viewer-nav-toggle').getAttribute('aria-expanded') !== 'true') await page.locator('#viewer-nav-toggle').click()
              await page.locator(`#viewer-sections [data-view="${view}"]`).click()
              const dimensions = await page.evaluate(() => ({ viewport: innerWidth, width: document.documentElement.scrollWidth }))
              assert.ok(dimensions.width <= dimensions.viewport + 1, `${example.recipe}/${selection.kind}/${width}/${theme}/${view}: horizontal overflow`)
              if (view === 'decisions') {
                const text = await page.locator('#decisions').innerText()
                for (const answer of Object.values(example.answers)) assert.ok(text.includes(answer))
                if (example.recipe !== 'bugfix') assert.ok(text.includes(example.purpose))
              }
            }
            report.checks.push({ recipe: example.recipe, output: selection.kind, width, theme, views: 4, passed: true })
          }
        }
        if (example.recipe === 'feasibility' && selection.kind === 'blueprint') {
          await page.locator('#viewer-nav-toggle').click()
          await page.locator('#viewer-sections [data-view="decisions"]').click()
          await page.screenshot({ path: path.join(output, 'portable-320-dark.png'), fullPage: true })
          await page.setViewportSize({ width: 1440, height: 960 })
          await toggle.click()
          await page.screenshot({ path: path.join(output, 'portable-1440-light.png'), fullPage: true })
        }
      }
    }
    assert.deepEqual(report.errors, [])
    assert.deepEqual(report.remoteRequests, [])
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    console.log(`PASS ${report.checks.length} artifact layout/theme combinations, 9 offline exports, preserved answers and keyboard switch. Evidence: ${output}`)
  } finally { await browser.close() }
}

run().catch(error => { console.error(error); process.exitCode = 1 })
