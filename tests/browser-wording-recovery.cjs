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
const output = path.join(root, 'local-knowledge/retests/wording-recovery', new Date().toISOString().replace(/[:.]/g, '-'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const report = {
  startedAt: new Date().toISOString(),
  method: 'Public Chrome controls, actual downloaded ZIP, JSON and HTML bytes and file chooser reopening. Synthetic local JEV transport, fictional user text and fake credentials. No application state injection or live inference.',
  limits: 'Functional browser simulation and screenshots, not an independent human trial, physical mobile test, screen reader audit, live JEV quality test or latency benchmark.',
  checks: [], downloads: [], reopenings: [], requests: [], providerRequests: [], errors: [], storageWrites: [],
}
let browser, context, page, server, base, contract, unzipTextFiles, currentPartPolicy
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
    '# Historical wording, compound requirements and privacy exception UI trial', '', report.method, '', report.limits, '', '',
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
  await page.locator('#project-name').fill('Wording recovery review')
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


async function confirmPart(action) {
  assert.equal(await page.locator(`[data-confirm-part-action="${action}"]`).count(), 1, `A direct ${action} confirmation is available`)
  await press(`[data-confirm-part-action="${action}"]`)
}

async function confirmSoftwareIfAsked() {
  const visible = await page.locator('#brief-suggestions > [data-task-question]').isVisible()
  if (visible) await chooseTask('software-change')
  return visible
}

async function assertPaused() {
  assert.deepEqual((await ideas()).practices, [])
  assert.equal(await page.locator('[data-assess-idea]').count(), 0)
}

async function roundTrip(name, saved, { expectedPractices, paused = false } = {}) {
  const formats = [['zip', saved.filePath]]
  for (const format of ['json', 'html']) formats.push([format, (await downloadFormat(`${name}-${format}`, format)).filePath])
  for (const [format, filePath] of formats) {
    await reopen(filePath)
    if (paused) await assertPaused()
    if (expectedPractices) assert.deepEqual((await ideas()).practices, expectedPractices)
    const reopened = await download(`${name}-reopened-${format}`, 'blueprint')
    assert.deepEqual(reopened.project, saved.project)
  }
  return formats.map(([format]) => format)
}

async function main() {
  await fs.mkdir(output, { recursive: true })
  contract = await import(pathToFileURL(path.join(root, 'factory/jev-contract.mjs')).href)
  ;({ INTENT_PART_POLICY_VERSION: currentPartPolicy } = await import(pathToFileURL(path.join(root, 'factory/intent-review.mjs')).href))
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
    // These are exposed defects and integration variants. The independent
    // held-out evaluation has its own frozen cases and evidence elsewhere.
    await check('01-historical-background-recovers-without-rewriting', async () => {
      await fresh()
      const history = 'The original player never checked cue identifiers and omitted the paused position.'
      const brief = `Fix the duplicated subtitle cue when playback resumes in the existing video player. ${history} Resuming playback must display each cue once at its intended time.`
      await createDraft(brief, 'bugfix')
      const before = report.providerRequests.length
      await assertPaused()
      assert.equal(await page.locator('[data-quick-part-quote]').innerText(), history)
      await confirmPart('context')
      await confirmSoftwareIfAsked()
      const result = await ideas()
      assert.ok(result.practices.includes('minimum-change'))
      assert.ok(!result.practices.includes('evidence-wiki'))
      assert.equal(await page.locator('#project-purpose').inputValue(), brief)
      const saved = await download('historical-background', 'pack')
      const record = saved.project.workflow.intentReview.parts.find(part => part.text === history)
      assert.equal(record.role, 'context')
      assert.equal(record.policyVersion, currentPartPolicy)
      assert.ok(saved.archive.get('WORKFLOW.md').includes(history))
      const formats = await roundTrip('historical-background', saved, { expectedPractices: result.practices })
      assert.equal(report.providerRequests.length, before)
      return { confirmedOriginalSentence: history, practices: result.practices, formats, noRewritingRequired: true }
    })

    await check('02-compound-requirement-keeps-both-outcomes-and-exclusions', async () => {
      await fresh()
      const rule = 'The duplicate must keep the title and start without assignees.'
      const brief = `Add a keyboard shortcut for duplicating the selected card on the current board. ${rule} For this workflow, leave out minimum-change and evidence-wiki.`
      await createDraft(brief)
      const before = report.providerRequests.length
      assert.ok(!(await ideas()).practices.includes('minimum-change'))
      assert.ok(!(await ideas()).practices.includes('evidence-wiki'))
      assert.equal(await page.locator('[data-quick-part-quote]').innerText(), rule)
      const screens = await visualMatrix('compound-requirement')
      await confirmPart('requirement')
      await confirmPart('practices')
      await confirmSoftwareIfAsked()
      const result = await ideas()
      assert.deepEqual(result.practices, ['specification-first'])
      const saved = await download('compound-product-rule', 'pack')
      assert.equal(saved.project.project.purpose, brief)
      const record = saved.project.workflow.intentReview.parts.find(part => part.text === rule)
      assert.equal(record.role, 'requirement')
      assert.equal(record.policyVersion, currentPartPolicy)
      assert.ok(saved.archive.get('WORKFLOW.md').includes(rule))
      const formats = await roundTrip('compound-product-rule', saved, { expectedPractices: result.practices })
      assert.equal(report.providerRequests.length, before)
      return { exactRequirement: rule, practices: result.practices, formats, screens }
    })

    await check('03-privacy-exception-pauses-before-choices-and-survives-export', async () => {
      await fresh()
      const limit = 'Keep all project input private, but use an outside service if the team thinks it is needed.'
      const brief = `Add a mute icon to the existing meeting-room control panel. The icon must match the device mute state. ${limit}`
      await createDraft(brief)
      const before = report.providerRequests.length
      await assertPaused()
      const question = page.locator('#brief-suggestions > [data-statement-question]')
      assert.match(await question.innerText(), /Clarify the privacy exception/)
      assert.equal(await question.locator('blockquote').innerText(), limit)
      assert.match(await question.locator('[data-clarification-reason]').innerText(), /input|service|approval/)
      assert.equal(await question.locator('[data-open-parts]').count(), 0, 'A role label cannot settle an exception')
      const screens = await visualMatrix('privacy-exception')
      await chooseTask('software-change')
      await chooseKnowledge('maintained-reference')
      await assertPaused()
      for (const [role, options] of [['context', {}], ['requirement', {}], ['restriction', { scope: 'handling' }]]) {
        await separate(limit, role, options)
        await assertPaused()
        assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
      }
      const saved = await download('privacy-exception-unresolved', 'pack')
      assert.equal(saved.project.project.purpose, brief)
      assert.ok(saved.archive.get('WORKFLOW.md').includes(limit))
      const formats = await roundTrip('privacy-exception-unresolved', saved, { paused: true })
      await briefView(page)
      await readySuggestions()
      await press('[data-edit-clarification]')
      assert.equal(await page.evaluate(() => document.activeElement.id), 'project-purpose')
      const resolved = brief.replace(limit, 'Do not send this brief to JEV.')
      await page.locator('#project-purpose').fill(resolved)
      await readySuggestions()
      assert.doesNotMatch((await ideas()).text, /Clarify the privacy exception/)
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      if (await page.locator('[data-confirm-part-action="inference"]').count()) await confirmPart('inference')
      await confirmSoftwareIfAsked()
      const result = await ideas()
      assert.ok(result.practices.includes('minimum-change'))
      assert.ok(result.practices.includes('specification-first'))
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      const corrected = await download('privacy-exception-explicit-ban', 'pack')
      assert.equal(corrected.project.project.purpose, resolved)
      await reopen(corrected.filePath)
      assert.deepEqual((await ideas()).practices, result.practices)
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      assert.equal(report.providerRequests.length, before)
      return { noPrematurePractices: true, labelsCannotResolveException: true, formats, recovery: 'User edits original wording to an explicit inference ban', screens }
    })

    await check('04-answer-exception-and-source-edits-invalidate-old-meaning', async () => {
      await fresh()
      const brief = 'Add a badge showing the current queue depth to the existing dispatch dashboard.'
      const history = 'The previous dashboard never checked queue depth and omitted the active worker count.'
      await createDraft(brief)
      await page.locator('[data-field="workflow.answers.affected"]').fill(history)
      await readySuggestions()
      await confirmPart('context')
      await confirmSoftwareIfAsked()
      assert.ok((await ideas()).practices.includes('minimum-change'))
      const before = report.providerRequests.length
      const privacy = 'Keep these answers private, but send them to an outside service if the team approves.'
      await page.locator('[data-field="workflow.answers.affected"]').fill(privacy)
      await readySuggestions()
      await assertPaused()
      assert.match((await ideas()).text, /Previous clarifications need reviewing/)
      assert.match(await page.locator('#brief-suggestions > [data-statement-question]').innerText(), /Clarify the privacy exception/)
      const saved = await download('answer-privacy-and-stale-history', 'pack')
      assert.equal(saved.project.project.purpose, brief)
      assert.equal(saved.project.workflow.answers.affected, privacy)
      const formats = await roundTrip('answer-privacy-and-stale-history', saved, { paused: true })
      await briefView(page)
      await readySuggestions()
      await press('[data-edit-clarification]')
      assert.equal(await page.evaluate(() => document.activeElement.dataset.field), 'workflow.answers.affected')
      await page.locator('[data-field="workflow.answers.affected"]').fill('Do not send these answers to any model.')
      await readySuggestions()
      if (await page.locator('[data-confirm-part-action="inference"]').count()) await confirmPart('inference')
      await confirmSoftwareIfAsked()
      assert.ok((await ideas()).practices.includes('minimum-change'))
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      assert.equal(report.providerRequests.length, before)
      return { answerSourcesProtected: true, previousBackgroundNotReused: true, formats }
    })

    await check('05-mixed-current-instructions-cannot-hide-in-history-or-requirements', async () => {
      const scenarios = [
        { role: 'context', sentence: 'The original player never checked cue identifiers and now do not use minimum-change.' },
        { role: 'requirement', sentence: 'The duplicate must keep the title and send this brief to an outside model.' },
      ]
      const observations = []
      for (const scenario of scenarios) {
        await fresh()
        const brief = `Add a comparison column to the existing shipment grid. ${scenario.sentence}`
        await createDraft(brief)
        const before = report.providerRequests.length
        assert.equal(await page.locator(`[data-confirm-part-action="${scenario.role}"]`).count(), 0)
        await separate(scenario.sentence, scenario.role)
        assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
        await assertPaused()
        const saved = await download(`mixed-${scenario.role}`, 'blueprint')
        assert.equal(saved.project.project.purpose, brief)
        await reopen(saved.filePath)
        await assertPaused()
        assert.equal(report.providerRequests.length, before)
        observations.push({ role: scenario.role, sourceUnchanged: true, cannotDismissCurrentInstruction: true })
      }
      return observations
    })

    await check('06-older-policy-three-stays-recorded-until-reconfirmed', async () => {
      await fresh()
      const rule = 'The duplicate must keep the title and start without assignees.'
      const brief = `Add a keyboard shortcut for duplicating the selected card on the current board. ${rule}`
      await createDraft(brief)
      await confirmPart('requirement')
      const current = await download('new-rule-policy', 'pack')
      const historical = structuredClone(current.project)
      historical.workflow.intentReview.parts.find(part => part.text === rule).policyVersion = 3
      const fixture = path.join(output, 'historical-part-policy3.json')
      await fs.writeFile(fixture, JSON.stringify(historical, null, 2) + '\n')
      report.importFixtures.push({ file: path.basename(fixture), explanation: 'Actual downloaded project with one source-part policy restored to version 3, imported through the native chooser.', sha256: sha(await fs.readFile(fixture)) })
      await reopen(fixture)
      await selectSentence(rule)
      assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
      const untouched = await download('policy-three-untouched', 'blueprint')
      assert.deepEqual(untouched.project.workflow.intentReview, historical.workflow.intentReview)
      await briefView(page)
      await readySuggestions()
      await confirmPart('requirement')
      await confirmSoftwareIfAsked()
      const result = await ideas()
      assert.ok(result.practices.includes('specification-first'))
      const renewed = await download('policy-three-reconfirmed', 'blueprint')
      assert.equal(renewed.project.workflow.intentReview.parts.find(part => part.text === rule).policyVersion, currentPartPolicy)
      await reopen(renewed.filePath)
      assert.deepEqual((await ideas()).practices, result.practices)
      return { policyThreePreserved: true, currentPartPolicy, explicitConfirmationRequired: true }
    })

    await check('07-assessment-keeps-original-text-and-existing-contract', async () => {
      await fresh()
      const history = 'The previous dashboard never checked queue depth and omitted the active worker count.'
      const brief = `Add a badge showing the current queue depth to the existing dispatch dashboard. ${history}`
      await createDraft(brief)
      await confirmPart('context')
      await confirmSoftwareIfAsked()
      assert.ok((await ideas()).practices.includes('minimum-change'))
      const before = report.providerRequests.length
      await expand('#brief-suggestions [data-detail="fit"]')
      await page.locator('[data-assess-idea]').click()
      await page.waitForFunction(() => document.querySelector('.brief-fit-result')?.textContent === 'JEV suggests this fits')
      assert.equal(report.providerRequests.length, before + 1)
      const request = report.requests.filter(item => item.method === 'POST').at(-1).body
      assert.deepEqual(Object.keys(request).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
      assert.equal(request.userBrief, brief)
      assert.deepEqual(report.providerRequests.at(-1).state, { userBrief: brief, suppliedProjectAnswers: request.suppliedProjectAnswers })
      assert.doesNotMatch(JSON.stringify(request), /intentReview|parts|knowledgeNeed|scope|catalogue|graphReasons|taskKind|policyVersion/)
      const saved = await download('assessed-original-history', 'pack')
      await reopen(saved.filePath)
      assert.equal(report.providerRequests.length, before + 1)
      return { exactBrowserBody: request, providerStateUnchanged: true, noAutomaticInferenceOnReopen: true }
    })

    await check('08-compound-invitation-rule-keeps-initial-access-limit', async () => {
      await fresh()
      const rule = 'The invitation must retain the team name and start with no access to private folders.'
      const brief = `Add an invite option to the existing team settings. ${rule}`
      await createDraft(brief)
      const before = report.providerRequests.length
      assert.equal(await page.locator('[data-quick-part-quote]').innerText(), rule)
      await confirmPart('requirement')
      await confirmSoftwareIfAsked()
      const result = await ideas()
      assert.ok(result.practices.includes('minimum-change'))
      assert.ok(result.practices.includes('specification-first'))
      const saved = await download('invitation-initial-access-rule', 'pack')
      assert.equal(saved.project.project.purpose, brief)
      assert.ok(saved.archive.get('WORKFLOW.md').includes(rule))
      const record = saved.project.workflow.intentReview.parts.find(part => part.text === rule)
      assert.equal(record.role, 'requirement')
      assert.equal(record.policyVersion, currentPartPolicy)
      const formats = await roundTrip('invitation-initial-access-rule', saved, { expectedPractices: result.practices })
      assert.equal(report.providerRequests.length, before)
      return { exactRequirement: rule, productAccessLimitPreserved: true, practices: result.practices, formats }
    })

    await check('09-partly-named-exclusion-needs-exact-source-clarification', async () => {
      await fresh()
      const brief = 'Add a date filter to the existing request list.'
      const answer = 'Skip minimum-change guidance and specification-driven development for this draft.'
      await createDraft(brief)
      await page.locator('[data-field="workflow.answers.affected"]').fill(answer)
      await readySuggestions()
      const before = report.providerRequests.length
      await assertPaused()
      assert.equal(await page.locator('[data-confirm-part-action="practices"]').count(), 0, 'Atlas cannot confirm only the known half')
      await chooseTask('software-change')
      await assertPaused()
      const saved = await download('partial-practice-name-unresolved', 'pack')
      assert.equal(saved.project.workflow.answers.affected, answer)
      await reopen(saved.filePath)
      await assertPaused()
      await press('[data-edit-clarification]')
      assert.equal(await page.evaluate(() => document.activeElement.dataset.field), 'workflow.answers.affected')
      const clarified = 'Omit minimum-change and specification-first for this draft.'
      await page.locator('[data-field="workflow.answers.affected"]').fill(clarified)
      await readySuggestions()
      await confirmPart('practices')
      await confirmSoftwareIfAsked()
      const result = await ideas()
      assert.ok(!result.practices.includes('minimum-change'))
      assert.ok(!result.practices.includes('specification-first'))
      assert.doesNotMatch(result.text, /Practice ideas and JEV checks are paused/)
      const corrected = await download('both-practice-names-confirmed', 'pack')
      assert.equal(corrected.project.workflow.answers.affected, clarified)
      const record = corrected.project.workflow.intentReview.parts.find(part => part.text === clarified)
      assert.equal(record.role, 'restriction')
      assert.equal(record.scope, 'practices')
      assert.deepEqual([...record.practiceIds].sort(), ['minimum-change', 'specification-first'])
      const formats = await roundTrip('both-practice-names-confirmed', corrected, { expectedPractices: result.practices })
      assert.equal(report.providerRequests.length, before)
      return { unrecognizedHalfNeverGuessed: true, exclusionIds: record.practiceIds, formats }
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
  process.stdout.write(`Wording recovery: ${report.checks.length} checks passed. Evidence: ${output}\n`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
