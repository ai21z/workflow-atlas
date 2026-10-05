// Explicit, bounded paid smoke check. Ordinary test commands do not run this file.
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { performance } = require('node:perf_hooks')
if (!process.argv.includes('--run-paid')) { process.stderr.write('This check makes up to six deliberate paid requests. Run with --run-paid only for an authorized local smoke test.\n'); process.exit(1) }
let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright')) }
const root = path.resolve(__dirname, '..')
const base = process.env.ATLAS_TEST_URL || 'http://127.0.0.1:8781/factory/'
const output = path.join(root, 'local-knowledge/retests/jev-integration-live', new Date().toISOString().replace(/[:.]/g, '-'))
const maxRequests = process.argv.includes('--feature-only') ? 2 : 6
const report = { startedAt: new Date().toISOString(), base, method: `Installed Chrome through public UI, actual configured local server and pinned JEV. At most ${maxRequests} deliberate synthetic request actions, no prompt tuning.`, limits: 'Functional smoke evidence, not a fresh holdout, human session, production benchmark or p95 estimate.', cases: [], requests: [], errors: [], downloads: [] }
let browser, context, page, currentCase, requestCount = 0
const brief = 'Add an Open and All filter to the support request list. Scope is the list view and its existing API query. We have not agreed acceptance examples yet.'
const acceptance = 'Given Open is selected, the list shows only open requests. Given All is selected, it shows open and closed requests. When there are no matches, it shows an empty state without an error.'
async function save() { report.finishedAt = new Date().toISOString(); await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n') }
async function fresh() {
  if (context) await context.close()
  context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  page = await context.newPage()
  page.setDefaultTimeout(14000)
  page.on('pageerror', error => report.errors.push({ case: currentCase, message: error.message }))
  await page.route('**/api/jev/suggest', async route => { requestCount += 1; if (requestCount > maxRequests) await route.abort(); else await route.continue() })
  await page.goto(base)
  await page.locator('#start-screen').waitFor({ state: 'visible' })
}
async function suggest(action = () => page.locator('#jev-submit').click()) {
  const started = performance.now()
  const [response] = await Promise.all([page.waitForResponse(value => value.url().endsWith('/api/jev/suggest')), action()])
  const envelope = await response.json()
  const record = { case: currentCase, status: response.status(), metadata: envelope.metadata || null, intent: envelope.decision?.intent?.choice || null, clarification: envelope.decision?.clarification?.choice || null, practice: envelope.decision?.practice?.choice || null, coverage: envelope.decision?.coverage ? Object.fromEntries(Object.entries(envelope.decision.coverage).map(([id, value]) => [id, value.choice])) : null, errorCode: envelope.error?.code || null }
  report.requests.push(record)
  assert.equal(response.status(), 200, JSON.stringify(record))
  await page.locator('#jev-submit:not([disabled])').waitFor()
  record.automationActionToSettledUiMs = Math.round((performance.now() - started) * 100) / 100
  return envelope
}
async function check(id, action) {
  currentCase = id
  const record = { id, status: 'Not run' }
  report.cases.push(record)
  try { record.observation = await action(); record.status = 'Pass' }
  catch (error) { record.status = 'Fail'; record.error = error.stack || String(error) }
  if (page && !page.isClosed()) { record.screenshot = `${id}.png`; await page.screenshot({ path: path.join(output, record.screenshot), fullPage: true }).catch(() => {}) }
  await save()
  process.stdout.write(`${id}: ${record.status}\n`)
}
;(async () => {
  await fs.mkdir(output, { recursive: true })
  const status = await fetch(new URL('/api/jev/status', base)).then(value => value.json())
  assert.equal(status.available, true, 'The local server must have an already configured key.')
  report.contract = status
  const portable = await import(pathToFileURL(path.join(root, 'factory/portable.mjs')).href)
  browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
  await check('feature-practice-download-reopen', async () => {
    await fresh()
    await page.locator('#jev-brief').fill(brief)
    const result = await suggest()
    assert.equal(result.decision.intent.choice, 'feature-delivery')
    assert.equal(result.decision.clarification.choice, 'acceptance')
    await page.locator('#jev-next-answer').fill(acceptance)
    await page.locator('[data-jev-action="answer"]').click()
    await page.locator('#jev-draft-details summary').click()
    await page.locator('#jev-name').fill('Support filter plan')
    await page.locator('#jev-practice-details summary').click()
    await page.locator('#jev-practice').selectOption('specification-first')
    const checked = await suggest(() => page.locator('[data-jev-action="check-practice"]').click())
    assert.equal(checked.decision.practice.choice, 'relevant')
    await page.locator('#jev-include-practice').check()
    await page.locator('#jev-create').click()
    await page.locator('#studio-layout').waitFor({ state: 'visible' })
    assert.match(await page.locator('#save-state').innerText(), /Changes not downloaded/)
    await page.locator('#download-project').click()
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('[data-studio-action="download-output"]').click()])
    const filePath = path.join(output, download.suggestedFilename())
    await download.saveAs(filePath)
    const bytes = await fs.readFile(filePath)
    const opened = await portable.readProjectFiles([new File([bytes], download.suggestedFilename(), { type: 'application/zip' })])
    assert.equal(opened.config.workflow.answers.acceptance, acceptance)
    assert.ok(opened.config.practices.includes('specification-first'))
    assert.ok(opened.files.find(file => file.path === 'templates/REQUIREMENTS.md').content.includes(acceptance))
    report.downloads.push({ file: path.basename(filePath), bytes: bytes.length, output: 'blueprint' })
    if (await page.locator('#download-dialog').isVisible()) await page.locator('[data-close-dialog="download-dialog"]').click()
    await page.locator('#import-config').click()
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-studio-action="choose-project-file"]').click()])
    await chooser.setFiles(filePath)
    await page.locator('#project-name').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#project-name').inputValue(), 'Support filter plan')
    return 'Live feature and practice choices, explicit acceptance, actual ZIP requirements and native browser chooser event passed. The OS dialog appearance was not inspected.'
  })
  for (const [id, text, expected] of (process.argv.includes('--feature-only') ? [] : [
    ['investigation', 'Investigate whether our engineer-run reference-to-configuration process should become a backend API. Today an engineer runs local instructions and reviews the configuration manually. Compare feasibility, effort and operating cost before choosing implementation. We need a go or no-go recommendation.', 'feasibility'],
    ['repair', 'Repair the support request list. It currently loses the selected Open filter after reload. Approved expected behavior is that the selected filter survives reload. Scope is the list view and the existing filter query.', 'bugfix'],
    ['unsupported', 'Plan a birthday picnic and choose a cake.', 'outside-supported-recipes'],
    ['covered-description', 'Add an Open and All filter to the support request list. Scope is the list view and its existing API query. Given Open is selected, only open requests appear. Given All is selected, open and closed requests appear. No matches shows an empty state without an error.', 'feature-delivery'],
  ])) await check(id, async () => {
    await fresh()
    await page.locator('#jev-brief').fill(text)
    const result = await suggest()
    assert.equal(result.decision.intent.choice, expected)
    assert.equal(await page.locator('#jev-brief').inputValue(), text)
    if (id === 'unsupported') assert.equal(await page.locator('#jev-create').count(), 0)
    if (id === 'covered-description') {
      assert.equal(result.decision.allCoverage['feature-delivery'].acceptance.choice, 'answered')
      await page.locator('#jev-covered-acceptance summary').click()
      assert.equal(await page.locator('#jev-wording-acceptance').inputValue(), text)
      await page.locator('#jev-wording-acceptance').fill(acceptance)
      await page.locator('[data-jev-action="confirm"][data-question="acceptance"]').click()
      await page.locator('#jev-create').click()
      await page.locator('#studio-layout').waitFor({ state: 'visible' })
    }
    return `Live intent ${expected} passed with preserved user text.`
  })
  assert.ok(requestCount <= maxRequests)
  assert.deepEqual(report.errors, [])
})().catch(error => { report.errors.push({ kind: 'runner', message: error.stack || String(error) }); process.exitCode = 1 }).finally(async () => {
  report.deliberateRequests = requestCount
  if (context) await context.close()
  if (browser) await browser.close()
  await save()
  if (report.cases.some(item => item.status !== 'Pass') || report.errors.length) process.exitCode = 1
  process.stdout.write(`Report: ${output}\n`)
})
