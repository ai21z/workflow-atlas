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
const output = path.join(root, 'local-knowledge/retests/compound-intent', new Date().toISOString().replace(/[:.]/g, '-'))
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
    '# Compound restriction and undecided intent user journey', '', report.method, '', report.limits, '', '',
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
  await page.locator('#project-name').fill('Compound intent review')
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
        const primaryQuestion = page.locator('#brief-suggestions > [data-undecided-question], #brief-suggestions > [data-part-question]')
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
    // Focused regressions use already disclosed failures and authored adversarial variants.
    // The separate sealed fresh set is not read by this browser driver.
    await check('01-compound-local-handling-downloads-and-reopening', async () => {
      await fresh()
      const restriction = 'Process the source inputs only on the approved local workstation, and erase temporary copies when this session ends.'
      const brief = `Add a checksum column to the current import preview. Each preview row must show the checksum of its source file. ${restriction}`
      await createDraft(brief)
      const before = report.providerRequests.length
      assert.equal(await page.locator('[data-assess-idea]').count(), 0, 'The original compound limit prevents assessment even before confirmation')
      assert.equal(await page.locator('[data-confirm-part-action="handling"]').count(), 1)
      assert.equal(await page.locator('[data-quick-part-quote]').innerText(), restriction)
      const screens = await visualMatrix('compound-handling')
      await press('[data-confirm-part-action="handling"]')
      const result = await ideas()
      assert.ok(result.practices.includes('minimum-change'))
      assert.ok(result.practices.includes('specification-first'))
      assert.equal(await page.locator('[data-part-question]').count(), 0)
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      assert.equal(await page.locator('#project-purpose').inputValue(), brief)
      const saved = await download('compound-handling', 'pack')
      const record = saved.project.workflow.intentReview.parts[0]
      assert.equal(record.text, restriction)
      assert.equal(record.role, 'restriction')
      assert.equal(record.scope, 'handling')
      assert.equal(record.policyVersion, 4)
      assert.ok(saved.archive.get('WORKFLOW.md').includes(restriction))
      const formats = [['zip', saved.filePath]]
      for (const format of ['json', 'html']) formats.push([format, (await downloadFormat(`compound-handling-${format}`, format)).filePath])
      for (const [format, filePath] of formats) {
        await reopen(filePath)
        assert.deepEqual((await ideas()).practices, result.practices)
        assert.equal(await page.locator('[data-part-question]').count(), 0)
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        const reopened = await download(`compound-handling-reopened-${format}`, 'blueprint')
        assert.deepEqual(reopened.project, saved.project)
      }
      assert.equal(report.providerRequests.length, before)
      return { expectedPractices: result.practices, confirmations: 1, formats: formats.map(([format]) => format), screens }
    })

    await check('02-coordinated-provider-and-copy-restrictions', async () => {
      const restrictions = [
        'Keep source inputs inside the approved team environment and retain no copies after review.',
        'Do not send this brief to JEV, and do not retain copies of the project input.',
      ]
      const observations = []
      for (const restriction of restrictions) {
        await fresh()
        const brief = `Add a preview of changed field names to the existing export wizard. The preview must not include record values. ${restriction}`
        await createDraft(brief)
        const before = report.providerRequests.length
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        let confirmations = 0
        while (await page.locator('[data-part-question]').count() && confirmations < 4) {
          const buttons = page.locator('[data-part-question] [data-confirm-part-action]')
          assert.equal(await buttons.count(), 1)
          const action = await buttons.getAttribute('data-confirm-part-action')
          assert.ok(['handling', 'inference', 'requirement'].includes(action))
          await press(`[data-confirm-part-action="${action}"]`)
          confirmations += 1
        }
        const taskPrompted = await page.locator('#brief-suggestions > [data-task-question]').isVisible()
        if (taskPrompted) await chooseTask('software-change')
        assert.ok((await ideas()).practices.includes('minimum-change'))
        assert.ok((await ideas()).practices.includes('specification-first'))
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        const saved = await download(`coordinated-restriction-${observations.length}`, 'blueprint')
        await reopen(saved.filePath)
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        assert.equal(report.providerRequests.length, before)
        observations.push({ restriction, confirmations, taskConfirmations: taskPrompted ? 1 : 0, practices: (await ideas()).practices })
      }
      return observations
    })

    await check('03-contradictory-compound-does-not-get-a-shortcut', async () => {
      const restrictions = [
        'Process source inputs only on the approved local workstation, and send them to JEV for review.',
        'Do not retain copies of project input, and upload the input to an external model.',
      ]
      const observations = []
      for (const restriction of restrictions) {
        await fresh()
        const brief = `Fix the count in the current import preview. ${restriction}`
        await createDraft(brief)
        const before = report.providerRequests.length
        assert.equal(await page.locator('[data-confirm-part-action]').count(), 0)
        // Planning guidance for the separate fix task does not authorize
        // sending input. The unreviewed compound must never unlock inference.
        const practicesBeforeClassification = (await ideas()).practices
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        assert.equal(await page.locator('#project-purpose').inputValue(), brief)
        await separate(restriction, 'restriction', { scope: 'handling' })
        assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
        assert.deepEqual((await ideas()).practices, [])
        const saved = await download(`contradictory-compound-${observations.length}`, 'blueprint')
        assert.equal(saved.project.project.purpose, brief)
        await reopen(saved.filePath)
        assert.deepEqual((await ideas()).practices, [])
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        assert.equal(report.providerRequests.length, before)
        observations.push({ restriction, practicesBeforeClassification, staysUnresolvedAfterClassification: true, noInferencePermission: true })
      }
      return observations
    })

    await check('04-undecided-brief-stays-undecided-after-partial-clarification', async () => {
      await fresh()
      const alternatives = 'A code change, a one-time briefing and a maintained decision reference are still alternatives.'
      const decision = 'We have not selected a deliverable.'
      const brief = `People disagree about the handover process. ${alternatives} ${decision}`
      await createDraft(brief)
      const before = report.providerRequests.length
      assert.match(await page.locator('[data-undecided-question]').innerText(), /What should we plan now/)
      assert.deepEqual((await ideas()).practices, [])
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      const constraints = page.locator('#brief-suggestions [data-detail="constraints"]')
      assert.equal(await constraints.locator(':scope > summary').innerText(), 'Wording and limits to clarify')
      assert.doesNotMatch(await constraints.textContent(), /The wording or scope of this restriction needs clarification/)
      assert.match(await constraints.textContent(), /This wording still needs clarification/)
      assert.ok((await constraints.textContent()).includes(decision.slice(0, -1)), 'The undecided source clause stays visible')
      await expand('#brief-suggestions [data-detail="constraints"]')
      const screens = await visualMatrix('undecided-work')
      await separate(decision, 'context')
      await separate(alternatives, 'context')
      assert.deepEqual((await ideas()).practices, [], 'Partial source clarification cannot choose a deliverable')
      assert.equal(await page.locator('[data-undecided-question]').count(), 1)
      await chooseTask('unsure')
      assert.equal(await page.locator('[data-clarify-task="unsure"]').innerText(), 'Not decided yet')
      assert.deepEqual((await ideas()).practices, [])
      await chooseKnowledge('maintained-reference')
      assert.deepEqual((await ideas()).practices, [], 'An optional knowledge choice does not bypass the main undecided intent')
      const saved = await download('undecided-kept', 'pack')
      assert.equal(saved.project.project.purpose, brief)
      assert.equal(saved.project.workflow.intentReview.taskKind, 'unsure')
      const formats = [['zip', saved.filePath]]
      for (const format of ['json', 'html']) formats.push([format, (await downloadFormat(`undecided-kept-${format}`, format)).filePath])
      for (const [format, filePath] of formats) {
        await reopen(filePath)
        assert.deepEqual((await ideas()).practices, [])
        assert.equal(await page.locator('[data-undecided-question]').count(), 1)
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        const reopened = await download(`undecided-kept-reopened-${format}`, 'blueprint')
        assert.deepEqual(reopened.project, saved.project)
      }
      assert.equal(report.providerRequests.length, before)
      return { prematureSuggestions: 0, unsurePersists: true, formats: formats.map(([format]) => format), screens }
    })

    await check('05-explicit-task-choice-does-not-select-another-alternative', async () => {
      const brief = 'People disagree about the handover process. A code change, a one-time briefing and a maintained decision reference are still alternatives. We have not selected a deliverable.'
      const observations = []
      for (const task of ['software-change', 'other', 'knowledge-work']) {
        await fresh()
        await createDraft(brief)
        const before = report.providerRequests.length
        await chooseTask(task)
        const result = await ideas()
        assert.equal(await page.locator('[data-undecided-question]').count(), 0)
        if (task === 'software-change') {
          assert.ok(result.practices.includes('minimum-change'))
          assert.ok(result.practices.includes('specification-first'))
          assert.ok(!result.practices.includes('evidence-wiki'), 'The unchosen maintained reference is not a need')
        } else if (task === 'other') assert.deepEqual(result.practices, [])
        else {
          assert.ok(result.practices.includes('evidence-wiki'))
          assert.ok(!result.practices.includes('minimum-change'))
          assert.ok(!result.practices.includes('specification-first'))
        }
        const saved = await download(`chosen-task-${task}`, 'blueprint')
        await reopen(saved.filePath)
        assert.deepEqual((await ideas()).practices, result.practices)
        assert.equal(report.providerRequests.length, before)
        observations.push({ task, practices: result.practices, sourceUnchanged: saved.project.project.purpose === brief })
      }
      return observations
    })

    await check('06-source-edit-invalidates-the-chosen-task', async () => {
      await fresh()
      const brief = 'We have not selected a deliverable. A code change or a one-time briefing are still alternatives.'
      await createDraft(brief)
      await chooseTask('software-change')
      assert.ok((await ideas()).practices.includes('minimum-change'))
      const changed = 'We have not selected a deliverable. A mobile app or a one-time briefing are still alternatives.'
      await page.locator('#project-purpose').fill(changed)
      await readySuggestions()
      assert.equal(await page.locator('[data-undecided-question]').count(), 1)
      assert.deepEqual((await ideas()).practices, [])
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      assert.match((await ideas()).text, /Previous clarifications need reviewing/)
      const saved = await download('changed-undecided-source', 'blueprint')
      await reopen(saved.filePath)
      assert.deepEqual((await ideas()).practices, [])
      assert.equal(await page.locator('[data-undecided-question]').count(), 1)
      return { staleTaskNeverReused: true }
    })

    await check('07-old-compound-meaning-needs-reconfirmation', async () => {
      await fresh()
      const restriction = 'Process the source inputs only on the approved local workstation, and erase temporary copies when this session ends.'
      await createDraft(`Add a checksum column to the current import preview. ${restriction}`)
      await press('[data-confirm-part-action="handling"]')
      const saved = await download('new-compound-policy', 'blueprint')
      const historical = structuredClone(saved.project)
      historical.workflow.intentReview.parts[0].policyVersion = 2
      const fixture = path.join(output, 'historical-v5-policy2.json')
      await fs.writeFile(fixture, JSON.stringify(historical, null, 2) + '\n')
      report.importFixtures.push({ file: path.basename(fixture), explanation: 'Actual download with the source part interpretation restored to policy 2. Imported through the file chooser.', sha256: sha(await fs.readFile(fixture)) })
      await reopen(fixture)
      assert.equal(await page.locator('[data-confirm-part-action="handling"]').count(), 1)
      await selectSentence(restriction)
      assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
      assert.deepEqual((await ideas()).practices, [])
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      const untouched = await download('old-compound-policy-untouched', 'blueprint')
      assert.deepEqual(untouched.project.workflow.intentReview, historical.workflow.intentReview)
      await briefView(page)
      await readySuggestions()
      await press('[data-confirm-part-action="handling"]')
      assert.ok((await ideas()).practices.includes('minimum-change'))
      const current = await download('compound-policy-reconfirmed', 'blueprint')
      assert.equal(current.project.workflow.intentReview.parts[0].policyVersion, 4)
      await reopen(current.filePath)
      assert.equal(await page.locator('[data-part-question]').count(), 0)
      return { priorPolicyPreserved: true, explicitConfirmationRequired: true }
    })

    await check('08-original-only-assessment-after-intent-choice', async () => {
      await fresh()
      const brief = 'A code change or a one-time briefing are still alternatives. We have not selected a deliverable.'
      await createDraft(brief)
      const before = report.providerRequests.length
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      await chooseTask('software-change')
      assert.ok((await ideas()).practices.includes('minimum-change'))
      await expand('#brief-suggestions [data-detail="fit"]')
      await page.locator('[data-assess-idea]').click()
      await page.waitForFunction(() => document.querySelector('.brief-fit-result')?.textContent === 'JEV suggests this fits')
      assert.equal(report.providerRequests.length, before + 1)
      const request = report.requests.filter(item => item.method === 'POST').at(-1).body
      assert.deepEqual(Object.keys(request).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
      assert.equal(request.userBrief, brief)
      assert.deepEqual(report.providerRequests.at(-1).state, { userBrief: brief, suppliedProjectAnswers: request.suppliedProjectAnswers })
      assert.doesNotMatch(JSON.stringify(request), /intentReview|parts|knowledgeNeed|scope|catalogue|graphReasons|taskKind|policyVersion/)
      const saved = await download('assessed-original-undecided-text', 'pack')
      await reopen(saved.filePath)
      assert.equal(report.providerRequests.length, before + 1)
      return { originalBrowserBody: request, providerStateUnchanged: true, noInferenceOnReopen: true }
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
  process.stdout.write(`Compound intent: ${report.checks.length} checks passed. Evidence: ${output}\n`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
