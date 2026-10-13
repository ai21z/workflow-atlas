const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { pathToFileURL } = require('node:url')
const { briefView, workflowView, closeWorkspaceDetails } = require('./browser-workspace-helpers.cjs')

let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright')) }

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'local-knowledge/retests/compound-regression', new Date().toISOString().replace(/[:.]/g, '-'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const report = {
  startedAt: new Date().toISOString(),
  method: 'Public Chrome controls, actual downloaded ZIP, JSON and HTML bytes and file chooser reopening. Synthetic local JEV transport, fictional user text and fake credentials. No application state injection or live inference.',
  limits: 'Functional browser simulation and screenshots, not an independent human trial, physical mobile test, screen reader audit, live JEV quality test or latency benchmark.',
  checks: [], downloads: [], reopenings: [], requests: [], providerRequests: [], errors: [], storageWrites: [],
}
let browser, context, page, server, base, contract, unzipTextFiles
let clockOffset = 0
report.confirmations = []
report.importFixtures = []

async function sourceHashes() {
  const files = ['atlas/data.js', 'factory/app.mjs', 'factory/intent-review.mjs', 'factory/intent-separation.mjs', 'factory/intent-compounds.mjs', 'factory/core.mjs', 'factory/index.html', 'factory/workspace.css', 'factory/knowledge-query.mjs', 'factory/brief-suggestions.mjs', 'factory/brief-suggestions-view.mjs', 'factory/jev-assistance.mjs', 'factory/jev-contract.mjs', 'tools/serve.mjs']
  return Promise.all(files.map(async name => ({ path: name, sha256: sha(await fs.readFile(path.join(root, name))) })))
}

async function persist() {
  report.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n')
  await fs.writeFile(path.join(output, 'report.md'), [
    '# Follow-up regression for exposed compound and intent cases', '', report.method, '', report.limits, '', '',
    `Checks passed: ${report.checks.filter(check => check.status === 'Pass').length}/${report.checks.length}.`,
    `Actual downloads: ${report.downloads.length}. Explicit synthetic assessments: ${report.providerRequests.length}.`, '',
    `Native file chooser reopenings: ${report.reopenings.length}.`, '',
    ...report.checks.map(check => `- ${check.id}: ${check.status}${check.error ? `. ${check.error.split('\n')[0]}` : ''}`), '',
    'Detailed observations, source hashes and synthetic request bodies are in results.json. ZIP files contain the exact downloaded bytes.', '',
  ].join('\n'))
}

async function check(id, action) {
  const record = { id, status: 'Not run' }
  report.checks.push(record)
  try { record.observation = await action(); record.status = 'Pass' }
  catch (error) { record.status = 'Fail'; record.error = error.stack || String(error); process.stderr.write(`${id}: ${record.error.split('\n')[0]}\n`) }
  if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, `${id}.png`), fullPage: true }).catch(() => {})
  await persist()
  process.stdout.write(`${id}: ${record.status}\n`)
}

async function fresh({ width = 1440, height = 1000 } = {}) {
  clockOffset += 60_001
  if (context) {
    report.storageWrites.push(...await page.evaluate(() => window.__atlasStorageWrites || []).catch(() => []))
    await context.close()
  }
  context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, reducedMotion: 'reduce' })
  // This observes storage writes. It does not supply or change product state.
  await context.addInitScript(() => {
    window.__atlasStorageWrites = []
    for (const operation of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[operation]
      Storage.prototype[operation] = function (...args) {
        window.__atlasStorageWrites.push({ operation, key: args[0] || '', path: location.pathname })
        return original.apply(this, args)
      }
    }
  })
  context.on('page', opened => {
    opened.on('pageerror', error => report.errors.push(error.message))
    opened.on('request', request => {
      if (request.url().includes('/api/jev/')) report.requests.push({ url: request.url(), method: request.method(), body: request.postDataJSON() })
    })
  })
  page = await context.newPage()
  page.setDefaultTimeout(10000)
  await page.goto(base)
  await page.locator('#start-screen').waitFor({ state: 'visible' })
}

async function expand(selector) {
  const detail = page.locator(selector)
  if (await detail.getAttribute('open') === null) await detail.locator(':scope > summary').click()
}

async function readySuggestions() {
  await page.locator('#brief-suggestions').waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.querySelector('#brief-suggestions')?.getAttribute('aria-busy') === 'false')
}

async function createDraft(brief, recipe = 'feature-delivery') {
  await page.locator('#jev-brief').fill(brief)
  await page.locator(`[data-start-recipe="${recipe}"]`).click()
  await page.locator('#jev-create').click()
  await page.locator('#project-name').waitFor({ state: 'visible' })
  await page.locator('#project-name').fill('Compound regression review')
  assert.equal(await page.locator('#project-purpose').inputValue(), brief)
  await readySuggestions()
}

async function ideas() {
  return {
    practices: await page.locator('#brief-suggestions [data-practice-suggestion]').evaluateAll(elements => elements.map(element => element.dataset.practiceSuggestion)),
    reading: await page.locator('#brief-suggestions .brief-reading [data-read-idea]').evaluateAll(elements => elements.map(element => element.dataset.readIdea)),
    text: await page.locator('#brief-suggestions').innerText(),
  }
}

async function download(name, kind = 'pack') {
  await closeWorkspaceDetails(page)
  await page.locator('#download-project').click()
  await page.locator(`[data-output-kind="${kind}"]`).check()
  const waiting = page.waitForEvent('download')
  await page.locator('[data-studio-action="download-output"]').click()
  const downloaded = await waiting
  const filePath = path.join(output, `${name}.zip`)
  await downloaded.saveAs(filePath)
  assert.equal(await downloaded.failure(), null)
  const bytes = await fs.readFile(filePath)
  const { files } = await unzipTextFiles(new Uint8Array(bytes))
  const archive = new Map(files.map(file => [file.path, file.content]))
  const project = JSON.parse(archive.get('project.json'))
  assert.ok(![...archive.values()].some(content => content.includes('synthetic-intent-separation-key')))
  report.downloads.push({ name, kind, bytes: bytes.length, sha256: sha(bytes), files: [...archive.keys()] })
  await page.locator('[data-close-dialog="download-dialog"]').click()
  return { filePath, archive, project }
}

async function reopen(filePath) {
  await fresh()
  await page.locator('#import-config').click()
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-studio-action="choose-project-file"]').click()])
  await chooser.setFiles(filePath)
  await page.locator('#project-name').waitFor({ state: 'visible' })
  await briefView(page)
  await readySuggestions()
  report.reopenings.push({ file: path.basename(filePath), sha256: sha(await fs.readFile(filePath)), method: 'Native file chooser with exact saved download bytes' })
}

async function visualMatrix(label) {
  const observations = []
  await page.locator('#toast').waitFor({ state: 'hidden', timeout: 9000 })
  await page.locator('#brief-ideas-title').focus()
  await page.keyboard.press('Control+Home')
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 })
    for (const theme of ['light', 'dark']) {
      if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click()
      // Scroll is a view action. Keep the sticky header at its real top position
      // for full-page evidence after a theme button has scrolled into view.
      await page.evaluate(() => window.scrollTo(0, 0))
      await page.waitForFunction(() => window.scrollY === 0)
      const dimensions = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }))
      assert.ok(dimensions.document <= dimensions.viewport + 1, JSON.stringify(dimensions))
      assert.ok(dimensions.body <= dimensions.viewport + 1, JSON.stringify(dimensions))
      await page.screenshot({ path: path.join(output, `${label}-${width}-${theme}.png`), fullPage: true })
      if (width === 390) {
        await page.locator('#brief-suggestions').screenshot({ path: path.join(output, `${label}-card-${theme}.png`) })
        const primaryQuestion = page.locator('#brief-suggestions > [data-undecided-question], #brief-suggestions > [data-part-question], #brief-suggestions > [data-statement-question]')
        if (await primaryQuestion.count() === 1) {
          await primaryQuestion.evaluate(element => element.scrollIntoView({ block: 'center' }))
          await primaryQuestion.screenshot({ path: path.join(output, `${label}-primary-question-${theme}.png`) })
        }
        const clarificationContext = page.locator('#brief-suggestions [data-detail="constraints"][open]')
        if (await clarificationContext.count() === 1) {
          await clarificationContext.evaluate(element => element.scrollIntoView({ block: 'center' }))
          await clarificationContext.screenshot({ path: path.join(output, `${label}-clarification-context-${theme}.png`) })
        }
      }
      observations.push({ width, theme, ...dimensions })
    }
  }
  await page.setViewportSize({ width: 1440, height: 1000 })
  return observations
}

async function press(selector) {
  await page.locator(selector).waitFor({ state: 'visible' })
  await page.locator(selector).focus()
  await page.keyboard.press('Enter')
  await readySuggestions()
}

async function chooseKnowledge(value) {
  await expand('#brief-suggestions [data-detail="matching"]')
  await press(`[data-clarify-knowledge="${value}"]`)
  assert.equal(await page.locator(`[data-clarify-knowledge="${value}"]`).getAttribute('aria-pressed'), 'true')
}

async function chooseTask(value) {
  const selector = `[data-clarify-task="${value}"]`
  if (!await page.locator(selector).isVisible()) await expand('#brief-suggestions [data-detail="matching"]')
  await press(selector)
  assert.equal(await page.locator(selector).getAttribute('aria-pressed'), 'true')
}

async function selectSentence(text, field = 'brief', index) {
  await briefView(page)
  await readySuggestions()
  await expand('#brief-suggestions [data-detail="matching"]')
  await expand('#brief-suggestions [data-detail="separation"]')
  const option = await page.locator('[data-part-select] option').evaluateAll((options, expected) => options.map(option => ({ value: option.value, text: option.textContent })).find(option => {
    const [source, position] = JSON.parse(option.value)
    return source === expected.field && (expected.index === undefined || position === expected.index) && option.text.includes(expected.text.slice(0, 70))
  }), { text, field, index })
  assert.ok(option, `A complete source sentence is selectable: ${field}: ${text}`)
  await page.locator('[data-part-select]').selectOption(option.value)
  assert.equal(await page.locator('[data-part-quote]').innerText(), text)
  return JSON.parse(option.value)
}

async function separate(text, role, { field = 'brief', index, scope, practiceIds = [] } = {}) {
  const identity = await selectSentence(text, field, index)
  await page.locator('[data-part-role]').selectOption(role)
  if (role === 'restriction') {
    await page.locator('[data-part-scope]').selectOption(scope)
    if (scope === 'practices') {
      for (const checkbox of await page.locator('[data-part-practice]').all()) await checkbox.setChecked(practiceIds.includes(await checkbox.getAttribute('data-part-practice')))
    }
  }
  await press('[data-keep-part]')
  assert.equal(await page.locator('[data-part-error]').innerText(), '')
  assert.match(await page.locator('[data-part-status]').innerText(), /Recorded meaning:/)
  return { field: identity[0], index: identity[1], text, role, scope: role === 'restriction' ? scope : null, practiceIds: role === 'restriction' && scope === 'practices' ? practiceIds : [] }
}

async function downloadFormat(name, format) {
  await closeWorkspaceDetails(page)
  await page.locator('#download-project').click()
  await expand('#download-dialog .other-downloads')
  const waiting = page.waitForEvent('download')
  await page.locator(`[data-studio-action="download-${format === 'html' ? 'atlas' : 'json'}"]`).click()
  const downloaded = await waiting
  const filePath = path.join(output, `${name}.${format}`)
  await downloaded.saveAs(filePath)
  assert.equal(await downloaded.failure(), null)
  const bytes = await fs.readFile(filePath)
  assert.ok(!bytes.toString('utf8').includes('synthetic-intent-separation-key'))
  report.downloads.push({ name, format, bytes: bytes.length, sha256: sha(bytes), suggestedFilename: downloaded.suggestedFilename() })
  if (await page.locator('#download-dialog').isVisible()) await page.locator('[data-close-dialog="download-dialog"]').click()
  return { filePath, text: bytes.toString('utf8') }
}

async function main() {
  await fs.mkdir(output, { recursive: true })
  contract = await import(pathToFileURL(path.join(root, 'factory/jev-contract.mjs')).href)
  ;({ unzipTextFiles } = await import(pathToFileURL(path.join(root, 'factory/zip.mjs')).href))
  const { createAtlasServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href)
  const transport = async request => {
    report.providerRequests.push({ state: structuredClone(request.state), questions: Object.keys(request.questions) })
    const choice = { intent: 'feature-delivery', practice: 'relevant', practice_need: 'established', practice_boundary: 'not-rejected' }
    return { payload: {
      model: contract.MODEL,
      answers: Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
        const selected = choice[id] || 'missing'
        assert.ok(Object.hasOwn(question.criteria, selected), `${id} does not support ${selected}`)
        return [id, { type: 'choice', choice: selected, confidence: 1, probabilities: Object.fromEntries(Object.keys(question.criteria).map(key => [key, key === selected ? 1 : 0])) }]
      })), usage: { input_tokens: 200, output_tokens: 0 },
    }, metadata: { attempts: 1, providerElapsedMs: 1 } }
  }
  server = await createAtlasServer({ rootDir: root, getApiKey: () => 'synthetic-intent-separation-key', transport, now: () => performance.now() + clockOffset })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}/factory/`
  browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
  report.browser = browser.version()
  report.driverSha256 = sha(await fs.readFile(__filename))
  report.sourcesBefore = await sourceHashes()
  try {
    // These cases were exposed by the earlier frozen evaluation.
    // This is follow-up regression coverage, never a fresh-case score.
    async function confirmMeaning(action) {
      assert.equal(await page.locator(`[data-confirm-part-action="${action}"]`).count(), 1)
      await press(`[data-confirm-part-action="${action}"]`)
    }
    async function confirmSoftwareIfAsked() {
      const shown = await page.locator('#brief-suggestions > [data-task-question]').isVisible()
      if (shown) await chooseTask('software-change')
      return shown ? 1 : 0
    }
    async function assertNoInference() {
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
    }

    await check('01-C01-provider-fallback-ban-and-old-policies', async () => {
      await fresh()
      const limit = 'Do not send this description to a hosted model, and do not switch to another provider if the first one fails.'
      const brief = `Add saved tag selections to the current receipt search sidebar. Reopening a saved selection must restore exactly the chosen tags. ${limit}`
      await createDraft(brief)
      const before = report.providerRequests.length
      await assertNoInference()
      await confirmMeaning('inference')
      const taskConfirmations = await confirmSoftwareIfAsked()
      const result = await ideas()
      assert.ok(result.practices.includes('minimum-change'))
      assert.ok(result.practices.includes('specification-first'))
      await assertNoInference()
      const saved = await download('C01-current-provider-boundary', 'pack')
      assert.equal(saved.project.project.purpose, brief)
      const part = saved.project.workflow.intentReview.parts.find(item => item.text === limit)
      assert.equal(part.policyVersion, 4)
      assert.equal(part.scope, 'inference')
      await reopen(saved.filePath)
      assert.deepEqual((await ideas()).practices, result.practices)
      for (const policy of [1, 2]) {
        const historical = structuredClone(saved.project)
        historical.workflow.intentReview.parts.find(item => item.text === limit).policyVersion = policy
        const fixture = path.join(output, `C01-historical-policy-${policy}.json`)
        await fs.writeFile(fixture, JSON.stringify(historical, null, 2) + '\n')
        report.importFixtures.push({ file: path.basename(fixture), explanation: 'Actual downloaded project restored to an earlier source-part policy, imported through the native chooser.', sha256: sha(await fs.readFile(fixture)) })
        await reopen(fixture)
        await assertNoInference()
        await selectSentence(limit)
        assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
        const old = await download(`C01-policy-${policy}-untouched`, 'blueprint')
        assert.deepEqual(old.project.workflow.intentReview, historical.workflow.intentReview)
        await briefView(page)
        await readySuggestions()
        await confirmMeaning('inference')
        const renewed = await download(`C01-policy-${policy}-reconfirmed`, 'blueprint')
        assert.equal(renewed.project.workflow.intentReview.parts.find(item => item.text === limit).policyVersion, 4)
        await reopen(renewed.filePath)
        assert.deepEqual((await ideas()).practices, result.practices)
        await assertNoInference()
      }
      assert.equal(report.providerRequests.length, before)
      return { practices: result.practices, sourceUnchanged: true, earlierPoliciesPreserved: [1, 2], taskConfirmations }
    })

    await check('02-C03-read-delete-input-boundary-round-trip', async () => {
      await fresh()
      const limit = 'Read these source inputs only on the approved workstation and delete temporary snippets after the review.'
      const brief = `Add image dimension badges to the existing asset-library grid. Each badge must show the pixel width and height of its own asset. ${limit}`
      await createDraft(brief)
      const before = report.providerRequests.length
      await assertNoInference()
      await confirmMeaning('handling')
      const taskConfirmations = await confirmSoftwareIfAsked()
      const result = await ideas()
      assert.ok(result.practices.includes('minimum-change'))
      assert.ok(result.practices.includes('specification-first'))
      await assertNoInference()
      const saved = await download('C03-compound-input-handling', 'pack')
      assert.equal(saved.project.project.purpose, brief)
      assert.ok(saved.archive.get('WORKFLOW.md').includes(limit))
      const formats = [['zip', saved.filePath]]
      for (const format of ['json', 'html']) formats.push([format, (await downloadFormat(`C03-compound-input-handling-${format}`, format)).filePath])
      for (const [format, file] of formats) {
        await reopen(file)
        assert.deepEqual((await ideas()).practices, result.practices)
        await assertNoInference()
        const reopened = await download(`C03-reopened-${format}`, 'blueprint')
        assert.deepEqual(reopened.project, saved.project)
      }
      assert.equal(report.providerRequests.length, before)
      return { practices: result.practices, formats: formats.map(([format]) => format), taskConfirmations }
    })

    await check('03-D16-plus-omissions-apply-before-clarification', async () => {
      await fresh()
      const omission = 'Skip evidence-wiki plus minimum-change in this delivery.'
      const brief = `Add a sort-direction control to the existing inventory grid. Changing direction must reverse the chosen sort and preserve the filters. ${omission}`
      await createDraft(brief)
      const initial = await ideas()
      assert.ok(!initial.practices.includes('minimum-change'))
      assert.ok(!initial.practices.includes('evidence-wiki'))
      const first = await download('D16-before-any-clarification', 'blueprint')
      assert.equal(first.project.workflow.intentReview, undefined)
      assert.equal(first.project.project.purpose, brief)
      await reopen(first.filePath)
      await chooseTask('software-change')
      await chooseKnowledge('maintained-reference')
      const clarified = await ideas()
      assert.ok(clarified.practices.includes('specification-first'))
      assert.ok(!clarified.practices.includes('minimum-change'))
      assert.ok(!clarified.practices.includes('evidence-wiki'))
      const saved = await download('D16-after-explicit-choices', 'pack')
      await reopen(saved.filePath)
      assert.deepEqual((await ideas()).practices, clarified.practices)
      assert.equal(await page.locator('#project-purpose').inputValue(), brief)
      return { beforeClarification: initial.practices, afterChoices: clarified.practices, exclusionsNeverBypassed: true }
    })

    await check('04-D18-conflicting-sources-require-original-answer-edit', async () => {
      await fresh()
      const brief = 'Add a search filter to the current parcel-tracking page.'
      const answer = 'The sponsor canceled implementation and now requests only a one-time process explanation.'
      await createDraft(brief)
      await expand('[data-detail="intent-user-need"]')
      await page.locator('[data-field="workflow.answers.user-need"]').fill(answer)
      await readySuggestions()
      const before = report.providerRequests.length
      assert.deepEqual((await ideas()).practices, [])
      await assertNoInference()
      assert.match(await page.locator('#brief-suggestions').textContent(), /recorded answer cancels it/)
      const screens = await visualMatrix('source-conflict')
      await chooseTask('software-change')
      await chooseKnowledge('maintained-reference')
      assert.deepEqual((await ideas()).practices, [], 'Task and knowledge choices cannot settle contradictory source wording')
      await assertNoInference()
      await separate(answer, 'context', { field: 'answer:user-need' })
      assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
      assert.deepEqual((await ideas()).practices, [])
      const saved = await download('D18-conflicting-source-kept', 'pack')
      assert.equal(saved.project.project.purpose, brief)
      assert.equal(saved.project.workflow.answers['user-need'], answer)
      const formats = [['zip', saved.filePath]]
      for (const format of ['json', 'html']) formats.push([format, (await downloadFormat(`D18-conflicting-source-${format}`, format)).filePath])
      for (const [format, file] of formats) {
        await reopen(file)
        assert.deepEqual((await ideas()).practices, [])
        await assertNoInference()
        const reopened = await download(`D18-conflict-reopened-${format}`, 'blueprint')
        assert.deepEqual(reopened.project, saved.project)
      }
      await briefView(page)
      await readySuggestions()
      await press('[data-edit-clarification]')
      assert.equal(await page.evaluate(() => document.activeElement.dataset.field), 'workflow.answers.user-need', 'The visible edit action opens the original conflicting answer')
      const resolved = 'Customers need a search filter for the current parcel-tracking page.'
      await page.locator('[data-field="workflow.answers.user-need"]').fill(resolved)
      await readySuggestions()
      assert.ok((await ideas()).practices.includes('minimum-change'))
      assert.doesNotMatch(await page.locator('#brief-suggestions').textContent(), /recorded answer cancels it/)
      const reconciled = await download('D18-source-answer-corrected', 'pack')
      assert.equal(reconciled.project.project.purpose, brief)
      assert.equal(reconciled.project.workflow.answers['user-need'], resolved)
      await reopen(reconciled.filePath)
      assert.ok((await ideas()).practices.includes('minimum-change'))
      assert.equal(report.providerRequests.length, before)
      return { sourceConflictNotDismissed: true, formats: formats.map(([format]) => format), recovery: 'Edited the original specific answer through the visible edit action', noInferenceDuringTrial: true, screens }
    })

    await check('05-C04-D11-unselected-options-use-the-visible-question', async () => {
      const briefs = [
        { id: 'C04', text: 'We are considering a purchasing-screen change, a one-time buyer briefing, or a maintained supplier reference. Nobody has selected the deliverable yet.' },
        { id: 'D11', text: 'The workshop listed a patch to the booking service, a one-time explanation and a maintained policy index. These are competing options, and the owner has not approved any of them. Implementation would be one possible next step if that option is selected.' },
      ]
      const observations = []
      for (const scenario of briefs) {
        await fresh()
        await createDraft(scenario.text)
        const before = report.providerRequests.length
        assert.match(await page.locator('[data-undecided-question]').innerText(), /What should we plan now/)
        assert.deepEqual((await ideas()).practices, [])
        await assertNoInference()
        await chooseTask('unsure')
        await chooseKnowledge('maintained-reference')
        assert.deepEqual((await ideas()).practices, [])
        const saved = await download(`${scenario.id}-not-decided`, 'pack')
        await reopen(saved.filePath)
        assert.equal(await page.locator('[data-undecided-question]').count(), 1)
        assert.deepEqual((await ideas()).practices, [])
        await assertNoInference()
        assert.equal(await page.locator('#project-purpose').inputValue(), scenario.text)
        await chooseKnowledge('one-off')
        await chooseTask('other')
        assert.equal(await page.locator('[data-undecided-question]').count(), 0)
        assert.deepEqual((await ideas()).practices, [])
        assert.equal(report.providerRequests.length, before)
        observations.push({ id: scenario.id, prematureSuggestions: 0, sourceUnchanged: true })
      }
      return observations
    })

    await check('06-D17-D19-compound-inference-guards-cover-answer-sources', async () => {
      const scenarios = [
        { id: 'D17', recipe: 'bugfix', brief: 'Fix the incorrect reconnect count in the existing equipment dashboard. Keep a living incident notebook that links each repair decision to source logs and later corrections. Neither these inputs nor the notebook may be sent to an external model, and a failed local check must never trigger a provider call.', knowledge: true },
        { id: 'D19', brief: 'Add a remaining-character counter to the existing dispatch-note form.', answers: { acceptance: 'The counter must count the same characters as the server limit and warn before the limit is exceeded.', affected: 'Do not transmit these answers to any model and do not keep a provider copy.' } },
      ]
      const observations = []
      for (const scenario of scenarios) {
        await fresh()
        await createDraft(scenario.brief, scenario.recipe)
        for (const [id, text] of Object.entries(scenario.answers || {})) await page.locator(`[data-field="workflow.answers.${id}"]`).fill(text)
        await readySuggestions()
        const before = report.providerRequests.length
        await assertNoInference()
        let confirmations = 0
        while (await page.locator('[data-part-question]').count() && confirmations < 4) {
          const action = await page.locator('[data-part-question] [data-confirm-part-action]').getAttribute('data-confirm-part-action')
          assert.ok(['inference', 'requirement', 'handling'].includes(action))
          await confirmMeaning(action)
          confirmations += 1
        }
        const taskConfirmations = await confirmSoftwareIfAsked()
        if (scenario.knowledge) await chooseKnowledge('maintained-reference')
        const result = await ideas()
        assert.ok(result.practices.includes('minimum-change'))
        if (scenario.knowledge) assert.ok(result.practices.includes('evidence-wiki'))
        else assert.ok(result.practices.includes('specification-first'))
        await assertNoInference()
        const saved = await download(`${scenario.id}-compound-inference`, 'pack')
        assert.equal(saved.project.project.purpose, scenario.brief)
        for (const [id, text] of Object.entries(scenario.answers || {})) assert.equal(saved.project.workflow.answers[id], text)
        await reopen(saved.filePath)
        assert.deepEqual((await ideas()).practices, result.practices)
        await assertNoInference()
        assert.equal(report.providerRequests.length, before)
        observations.push({ id: scenario.id, practices: result.practices, confirmations, taskConfirmations })
      }
      return observations
    })
    assert.deepEqual(report.errors, [], 'No browser page errors')
  } finally {
    if (page && !page.isClosed()) report.storageWrites.push(...await page.evaluate(() => window.__atlasStorageWrites || []).catch(() => []))
    report.sourcesAfter = await sourceHashes()
    report.sourcesChangedDuringRun = JSON.stringify(report.sourcesBefore) !== JSON.stringify(report.sourcesAfter)
    await persist()
    await context?.close()
    await browser?.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
  assert.deepEqual(report.storageWrites, [], 'Project edits stay session only')
  assert.equal(report.sourcesChangedDuringRun, false, 'The audited implementation files did not change during the trial')
  assert.deepEqual(report.checks.filter(check => check.status !== 'Pass').map(check => check.id), [], 'Every browser scenario must pass')
  process.stdout.write(`Compound regression: ${report.checks.length} checks passed. Evidence: ${output}\n`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
