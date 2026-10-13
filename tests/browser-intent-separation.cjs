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
const output = path.join(root, 'local-knowledge/retests/intent-separation', new Date().toISOString().replace(/[:.]/g, '-'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const report = {
  startedAt: new Date().toISOString(),
  method: 'Public Chrome controls, actual downloaded ZIP, JSON and HTML bytes and file chooser reopening. Synthetic local JEV transport, fictional user text and fake credentials. No application state injection or live inference.',
  limits: 'Functional browser simulation and screenshots, not an independent human trial, physical mobile test, screen reader audit, live JEV quality test or latency benchmark.',
  checks: [], downloads: [], reopenings: [], requests: [], providerRequests: [], errors: [], storageWrites: [],
}
let browser, context, page, server, base, contract, unzipTextFiles
let clockOffset = 0

async function sourceHashes() {
  const files = ['atlas/data.js', 'factory/app.mjs', 'factory/intent-review.mjs', 'factory/intent-separation.mjs', 'factory/intent-compounds.mjs', 'factory/core.mjs', 'factory/index.html', 'factory/workspace.css', 'factory/knowledge-query.mjs', 'factory/brief-suggestions.mjs', 'factory/brief-suggestions-view.mjs', 'factory/jev-assistance.mjs', 'factory/jev-contract.mjs', 'tools/serve.mjs']
  return Promise.all(files.map(async name => ({ path: name, sha256: sha(await fs.readFile(path.join(root, name))) })))
}

async function persist() {
  report.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n')
  await fs.writeFile(path.join(output, 'report.md'), [
    '# Task, requirement and restriction user journey', '', report.method, '', report.limits, '', '',
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

async function createDraft(brief) {
  await page.locator('#jev-brief').fill(brief)
  await page.locator('[data-start-recipe="feature-delivery"]').click()
  await page.locator('#jev-create').click()
  await page.locator('#project-name').waitFor({ state: 'visible' })
  await page.locator('#project-name').fill('Statement separation review')
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

function assertParts(project, expected) {
  assert.equal(project.workflow.intentReview.version, 5)
  const records = project.workflow.intentReview.parts
  const normalize = ({ field, index, text, role, scope, practiceIds }) => ({ field, index, text, role, scope, practiceIds: [...practiceIds].sort() })
  assert.deepEqual(records.map(normalize), expected.map(normalize))
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
    await check('01-complete-task-and-conditional-rule-round-trip-every-format', async () => {
      await fresh()
      const task = 'Build the itinerary editor.'
      const rule = 'When a segment is delayed, unconfirmed totals must not appear.'
      const brief = `${task} ${rule}`
      await createDraft(brief)
      const records = [await separate(task, 'task'), await separate(rule, 'requirement')]
      await chooseTask('software-change')
      const after = await ideas()
      assert.ok(after.practices.includes('minimum-change'))
      assert.ok(after.practices.includes('specification-first'))
      assert.equal(await page.locator('#project-purpose').inputValue(), brief)
      assert.match(await page.locator('[data-part-status]').innerText(), /Used for local matching/)
      const screens = await visualMatrix('task-and-product-rule')
      const saved = await download('task-rule-pack', 'pack')
      assertParts(saved.project, records)
      assert.ok(['minimum-change', 'specification-first'].every(id => !saved.project.practices.includes(id)))
      for (const name of ['WORKFLOW.md', 'templates/REQUIREMENTS.md']) {
        assert.ok(saved.archive.get(name).includes(rule), name)
        assert.ok(saved.archive.get(name).includes(task), name)
      }
      const json = await downloadFormat('task-rule-project', 'json')
      assert.deepEqual(JSON.parse(json.text), saved.project)
      const html = await downloadFormat('task-rule-atlas', 'html')
      const reopenings = []
      for (const [format, filePath] of [['zip', saved.filePath], ['json', json.filePath], ['html', html.filePath]]) {
        await reopen(filePath)
        assert.deepEqual((await ideas()).practices, after.practices)
        await selectSentence(rule)
        assert.equal(await page.locator('[data-part-role]').inputValue(), 'requirement')
        assert.match(await page.locator('[data-part-status]').innerText(), /Used for local matching/)
        const again = await download(`task-rule-reopened-${format}`, 'blueprint')
        assert.deepEqual(again.project, saved.project)
        reopenings.push({ format, exactProject: true })
      }
      assert.equal(report.providerRequests.length, 0)
      return { completeConditionalPreserved: true, noAutomaticPracticeApplication: true, screens, reopenings }
    })

    await check('02-background-without-current-task-does-not-become-work', async () => {
      await fresh()
      const history = 'The former release rebuilt the notification panel.'
      await createDraft(history)
      const record = await separate(history, 'context')
      const after = await ideas()
      assert.ok(!after.practices.includes('minimum-change'))
      assert.ok(!after.practices.includes('specification-first'))
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      const saved = await download('background-only', 'blueprint')
      assertParts(saved.project, [record])
      assert.equal(saved.project.workflow.answers.acceptance || '', '')
      await reopen(saved.filePath)
      assert.deepEqual((await ideas()).practices, after.practices)
      await selectSentence(history)
      assert.equal(await page.locator('[data-part-role]').inputValue(), 'context')
      return { noSoftwareTaskInvented: true, noAcceptanceInvented: true }
    })

    await check('03-external-inference-limit-keeps-local-guidance-without-request', async () => {
      await fresh()
      const task = 'Build the roster editor.'
      const limit = 'Do not send this brief to an external AI provider.'
      const brief = `${task} ${limit}`
      const callsBefore = report.providerRequests.length
      await createDraft(brief)
      if (await page.locator('[data-open-parts]').isVisible()) {
        await page.locator('[data-open-parts]').click()
        assert.equal(await page.locator('[data-part-role]').isVisible(), true)
      }
      const records = [await separate(task, 'task'), await separate(limit, 'restriction', { scope: 'inference' })]
      await chooseTask('software-change')
      const after = await ideas()
      assert.ok(after.practices.includes('minimum-change'))
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      assert.match(await page.locator('[data-assessment-blocked]').innerText(), /limit on sending or handling your text/)
      const screens = await visualMatrix('local-guidance-with-inference-paused')
      const saved = await download('external-inference-limit', 'pack')
      assertParts(saved.project, records)
      await reopen(saved.filePath)
      assert.deepEqual((await ideas()).practices, after.practices)
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      assert.equal(report.providerRequests.length, callsBefore)
      return { localIdeas: after.practices, noInference: true, screens }
    })

    await check('04-explicit-multiple-practice-exclusions-use-checkboxes', async () => {
      await fresh()
      const limit = 'Leave out minimum-change and specification-first.'
      await createDraft(`Build the roster editor. ${limit}`)
      const record = await separate(limit, 'restriction', { scope: 'practices', practiceIds: ['minimum-change', 'specification-first'] })
      await chooseTask('software-change')
      await chooseKnowledge('maintained-reference')
      const after = await ideas()
      assert.ok(!after.practices.includes('minimum-change'))
      assert.ok(!after.practices.includes('specification-first'))
      assert.ok(after.practices.includes('evidence-wiki'))
      await selectSentence(limit)
      assert.equal(await page.locator('[data-part-practice="minimum-change"]').isChecked(), true)
      assert.equal(await page.locator('[data-part-practice="specification-first"]').isChecked(), true)
      const screens = await visualMatrix('multiple-practice-limits')
      const saved = await download('multiple-practice-limits', 'blueprint')
      assertParts(saved.project, [record])
      await reopen(saved.filePath)
      assert.deepEqual((await ideas()).practices, after.practices)
      await selectSentence(limit)
      assert.equal(await page.locator('[data-part-practice="minimum-change"]').isChecked(), true)
      assert.equal(await page.locator('[data-part-practice="specification-first"]').isChecked(), true)
      return { excluded: record.practiceIds, remaining: after.practices, screens }
    })

    await check('05-source-edits-stale-the-record-and-require-new-meaning', async () => {
      await fresh()
      const task = 'Build the equipment booking page.'
      const rule = 'When the booking is pending, an unconfirmed total must not appear.'
      const original = `${task} ${rule}`
      await createDraft(original)
      await separate(rule, 'requirement')
      const revisedRule = 'When the booking is cancelled, an unconfirmed total must not appear.'
      const revised = `${task} ${revisedRule}`
      await page.locator('#project-purpose').fill(revised)
      await readySuggestions()
      assert.match((await ideas()).text, /Previous clarifications need reviewing/)
      await selectSentence(revisedRule)
      assert.equal(await page.locator('[data-part-role]').inputValue(), '')
      const stale = await download('changed-source-stale', 'blueprint')
      assert.equal(stale.project.workflow.intentReview.source.brief, original)
      assert.equal(stale.project.project.purpose, revised)
      assert.match(stale.archive.get('WORKFLOW.md'), /not applied/)
      await reopen(stale.filePath)
      const record = await separate(revisedRule, 'requirement')
      const current = await download('changed-source-reviewed', 'blueprint')
      assertParts(current.project, [record])
      assert.equal(current.project.workflow.intentReview.source.brief, revised)
      await reopen(current.filePath)
      assert.doesNotMatch((await ideas()).text, /Previous clarifications need reviewing/)
      return { staleRecordPreservedUntilReviewed: true, newExactSourceRecorded: true }
    })

    await check('06-stage-eligibility-remains-authoritative', async () => {
      await fresh()
      const task = 'Build the itinerary editor.'
      await createDraft(task)
      const record = await separate(task, 'task')
      await chooseTask('software-change')
      assert.ok((await ideas()).practices.includes('minimum-change'))
      await workflowView(page)
      const stages = await page.locator('[data-select-stage]').evaluateAll(elements => [...new Set(elements.map(element => element.dataset.selectStage))])
      for (const stage of stages) {
        await page.locator(`[data-select-stage="${stage}"]`).first().click()
        await page.locator(`[data-stage="${stage}"]`).uncheck()
        await closeWorkspaceDetails(page)
      }
      await briefView(page)
      await readySuggestions()
      assert.ok(!(await ideas()).practices.includes('minimum-change'))
      assert.ok(!(await ideas()).practices.includes('specification-first'))
      assert.doesNotMatch((await ideas()).text, /Previous clarifications need reviewing/)
      const saved = await download('no-enabled-stages', 'blueprint')
      assertParts(saved.project, [record])
      assert.deepEqual(saved.project.workflow.enabledStages, [])
      await reopen(saved.filePath)
      assert.ok(!(await ideas()).practices.includes('minimum-change'))
      return { recordedMeaningPreserved: true, disabledStagesNotSuggested: true }
    })

    await check('07-answer-role-and-original-inference-payload', async () => {
      await fresh()
      const brief = 'Build the equipment booking page.'
      const answer = 'When the booking is pending, an unconfirmed total must not appear.'
      await createDraft(brief)
      const answerSelector = '[data-field="workflow.answers.acceptance"]'
      await page.locator(answerSelector).fill(answer)
      await readySuggestions()
      const record = await separate(answer, 'requirement', { field: 'answer:acceptance' })
      await chooseTask('software-change')
      const before = report.providerRequests.length
      await expand('#brief-suggestions [data-detail="fit"]')
      await page.locator('[data-assess-idea]').click()
      await page.waitForFunction(() => document.querySelector('.brief-fit-result')?.textContent === 'JEV suggests this fits')
      assert.equal(report.providerRequests.length, before + 1)
      const request = report.requests.filter(item => item.method === 'POST').at(-1).body
      assert.deepEqual(Object.keys(request).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
      assert.equal(request.userBrief, brief)
      assert.equal(request.suppliedProjectAnswers.acceptance, answer)
      assert.deepEqual(report.providerRequests.at(-1).state, { userBrief: brief, suppliedProjectAnswers: request.suppliedProjectAnswers })
      assert.doesNotMatch(JSON.stringify(request), /intentReview|parts|knowledgeNeed|scope|catalogue|graphReasons|taskKind/)
      const saved = await download('answer-requirement-assessed', 'pack')
      assertParts(saved.project, [record])
      assert.equal(saved.project.workflow.answers.acceptance, answer)
      await reopen(saved.filePath)
      await selectSentence(answer, 'answer:acceptance')
      assert.equal(await page.locator('[data-part-role]').inputValue(), 'requirement')
      assert.equal(report.providerRequests.length, before + 1)
      return { originalBrowserBody: request, noExtraProviderState: true, reopeningDoesNotCallJev: true }
    })

    await check('08-unkept-editor-choice-survives-unrelated-render-and-remove-is-explicit', async () => {
      await fresh()
      const task = 'Build the equipment booking page.'
      const background = 'The previous release included a booking table.'
      await createDraft(`${task} ${background}`)
      await selectSentence(background)
      await page.locator('[data-keep-part]').click()
      assert.match(await page.locator('[data-part-error]').innerText(), /Choose what this sentence means/)
      await page.locator('[data-part-role]').selectOption('context')
      assert.match(await page.locator('[data-part-status]').innerText(), /not been kept yet/)
      await chooseKnowledge('one-off')
      assert.equal(await page.locator('[data-part-role]').inputValue(), 'context')
      assert.match(await page.locator('[data-part-status]').innerText(), /not been kept yet/)
      await selectSentence(task)
      await selectSentence(background)
      assert.equal(await page.locator('[data-part-role]').inputValue(), 'context')
      const pending = await download('unkept-meaning', 'blueprint')
      assert.ok(!pending.project.workflow.intentReview.parts?.length)
      await selectSentence(background)
      await press('[data-keep-part]')
      assert.match(await page.locator('[data-part-status]').innerText(), /Recorded meaning: Background/)
      await press('[data-remove-part]')
      assert.equal(await page.locator('[data-part-role]').inputValue(), '')
      assert.match(await page.locator('[data-part-status]').innerText(), /No meaning recorded yet/)
      const removed = await download('removed-meaning', 'blueprint')
      assert.deepEqual(removed.project.workflow.intentReview.parts, [])
      await reopen(removed.filePath)
      await selectSentence(background)
      assert.equal(await page.locator('[data-part-role]').inputValue(), '')
      return { unkeptEditsDoNotLeakToFiles: true, unrelatedChoicePreservesPendingMeaning: true, removalRoundTrips: true }
    })

    await check('09-unknown-limit-cannot-be-dismissed-as-background', async () => {
      await fresh()
      const limit = 'Do not store or use any of this request anywhere.'
      await createDraft(`Build the equipment booking page. ${limit}`)
      const before = report.providerRequests.length
      await separate(limit, 'context')
      assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
      assert.deepEqual((await ideas()).practices, [])
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      const record = await separate(limit, 'restriction', { scope: 'unresolved' })
      assert.deepEqual((await ideas()).practices, [])
      const saved = await download('unresolved-restriction', 'blueprint')
      assertParts(saved.project, [record])
      await reopen(saved.filePath)
      assert.deepEqual((await ideas()).practices, [])
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      assert.equal(report.providerRequests.length, before)
      return { noRoleChoiceOverridesUnclearHandlingLimit: true, unresolvedChoicePreserved: true }
    })

    await check('10-line-wrapped-condition-stays-with-its-complete-rule', async () => {
      const scenarios = [
        { name: 'leading-condition', text: 'Unless permission is granted,\nrecords must not appear.' },
        { name: 'trailing-condition', text: 'Records must not appear\n\nunless permission is granted.' },
      ]
      const observations = []
      for (const scenario of scenarios) {
        await fresh()
        await createDraft('Build the equipment booking page.')
        await page.locator('[data-field="workflow.answers.acceptance"]').fill(scenario.text)
        await readySuggestions()
        const record = await separate(scenario.text, 'requirement', { field: 'answer:acceptance' })
        const sourceOptions = await page.locator('[data-part-select] option').evaluateAll(options => options.filter(option => JSON.parse(option.value)[0] === 'answer:acceptance').length)
        assert.equal(sourceOptions, 1, 'A line break must not detach the condition into another choice')
        assert.equal(await page.locator('[data-part-quote]').innerText(), scenario.text)
        assert.match(await page.locator('[data-part-status]').innerText(), /Used for local matching/)
        await chooseTask('software-change')
        assert.ok((await ideas()).practices.includes('minimum-change'))
        const screens = scenario.name === 'leading-condition' ? await visualMatrix('complete-line-wrapped-rule') : []
        const saved = await download(`line-wrapped-${scenario.name}`, 'pack')
        assertParts(saved.project, [record])
        assert.equal(saved.project.workflow.answers.acceptance, scenario.text)
        for (const filename of ['WORKFLOW.md', 'templates/REQUIREMENTS.md']) assert.ok(saved.archive.get(filename).includes(scenario.text), `${filename} keeps the exact line breaks and condition`)
        await reopen(saved.filePath)
        await selectSentence(scenario.text, 'answer:acceptance')
        assert.equal(await page.locator('[data-part-quote]').innerText(), scenario.text)
        assert.equal(await page.locator('[data-part-role]').inputValue(), 'requirement')
        assert.match(await page.locator('[data-part-status]').innerText(), /Used for local matching/)
        assert.ok((await ideas()).practices.includes('minimum-change'))
        observations.push({ name: scenario.name, exactText: scenario.text, oneSourcePart: true, completeConditionInFilesAndReopening: true, screens })
      }
      return observations
    })

    await check('11-earlier-meaning-conflict-is-recorded-without-false-applied-status', async () => {
      const scenarios = [
        { legacy: 'context', role: 'task' },
        { legacy: 'requirement', role: 'task' },
        { legacy: 'context', role: 'requirement' },
      ]
      const text = 'Unverified amounts must not appear in totals.'
      const observations = []
      for (const scenario of scenarios) {
        await fresh()
        await createDraft('Build the equipment booking page.')
        await page.locator('[data-field="workflow.answers.acceptance"]').fill(text)
        await readySuggestions()
        const baseline = await download(`legacy-source-${scenario.legacy}-${scenario.role}`, 'blueprint')
        const fixture = structuredClone(baseline.project)
        const { reviewSource } = await import(pathToFileURL(path.join(root, 'factory/intent-review.mjs')).href)
        fixture.workflow.intentReview = { version: 4, source: reviewSource(fixture), taskKind: null, knowledgeNeed: null, statements: [{ clause: text.slice(0, -1), kind: scenario.legacy, practiceIds: [], policyVersion: 3 }], parts: [] }
        const fixturePath = path.join(output, `legacy-${scenario.legacy}-${scenario.role}.json`)
        await fs.writeFile(fixturePath, JSON.stringify(fixture, null, 2) + '\n')
        report.importFixtures ||= []
        report.importFixtures.push({ file: path.basename(fixturePath), explanation: 'Actual downloaded project with an explicit historical v4 statement record. Imported through the public file chooser to test conflicting prior meanings.', sha256: sha(await fs.readFile(fixturePath)) })
        await reopen(fixturePath)
        await expand('#brief-suggestions [data-detail="clarifications"]')
        assert.doesNotMatch(await page.locator('[data-detail="clarifications"]').innerText(), /This wording still needs review/)
        const record = await separate(text, scenario.role, { field: 'answer:acceptance' })
        const status = await page.locator('[data-part-status]').innerText()
        assert.match(status, /needs review/)
        assert.match(status, /earlier clarification uses this wording differently/)
        assert.doesNotMatch(status, /Used for local matching|Used as task wording/)
        const legacyRecords = [{ clause: text.slice(0, -1), kind: scenario.legacy, practiceIds: [], policyVersion: 3 }]
        const saved = await download(`conflicting-${scenario.legacy}-to-${scenario.role}`, 'pack')
        assertParts(saved.project, [record])
        assert.deepEqual(saved.project.workflow.intentReview.statements, legacyRecords)
        await reopen(saved.filePath)
        await selectSentence(text, 'answer:acceptance')
        const restoredStatus = await page.locator('[data-part-status]').innerText()
        assert.match(restoredStatus, /needs review/)
        assert.match(restoredStatus, /earlier clarification uses this wording differently/)
        assert.doesNotMatch(restoredStatus, /Used for local matching|Used as task wording/)
        const again = await download(`conflicting-${scenario.legacy}-to-${scenario.role}-reopened`, 'blueprint')
        assert.deepEqual(again.project, saved.project)
        observations.push({ previousMeaning: scenario.legacy, newMeaning: scenario.role, needsReviewBeforeAndAfterReopening: true, earlierChoicePreserved: true })
      }
      return observations
    })

    await check('12-explicit-answer-meaning-survives-identical-inherited-text', async () => {
      await fresh()
      const brief = 'Build the account dashboard.'
      const before = report.providerRequests.length
      await createDraft(brief)
      await expand('[data-detail="intent-user-need"]')
      const answer = page.locator('[data-field="workflow.answers.user-need"]')
      await answer.fill(brief)
      await readySuggestions()
      const record = await separate(brief, 'restriction', { field: 'answer:user-need', scope: 'inference' })
      assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      await expand('[data-detail="intent-user-need"]')
      await answer.fill('')
      await readySuggestions()
      assert.doesNotMatch((await ideas()).text, /Previous clarifications need reviewing/)
      await selectSentence(brief, 'answer:user-need')
      assert.equal(await page.locator('[data-part-role]').inputValue(), 'restriction')
      assert.equal(await page.locator('[data-part-scope]').inputValue(), 'inference')
      assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      const saved = await download('recorded-answer-now-inherited', 'pack')
      assertParts(saved.project, [record])
      assert.equal(saved.project.workflow.answers['user-need'] || '', '')
      assert.equal(saved.project.workflow.intentReview.source.answers['user-need'], brief)
      await reopen(saved.filePath)
      await selectSentence(brief, 'answer:user-need')
      assert.equal(await page.locator('[data-part-scope]').inputValue(), 'inference')
      assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      const revised = `${brief} Keep the current fallback.`
      await page.locator('#project-purpose').fill(revised)
      await readySuggestions()
      assert.match((await ideas()).text, /Previous clarifications need reviewing/)
      const stale = await download('inherited-source-edited', 'blueprint')
      assert.deepEqual(stale.project.workflow.intentReview, saved.project.workflow.intentReview)
      assert.equal(stale.project.project.purpose, revised)
      assert.match(stale.archive.get('WORKFLOW.md'), /not applied/)
      await reopen(stale.filePath)
      assert.match((await ideas()).text, /Previous clarifications need reviewing/)
      assert.equal(report.providerRequests.length, before)
      return { explicitToInheritedRetainsChoiceAndPause: true, effectiveTextUnchangedUntilSourceEdit: true, changedSourceRequiresNewReview: true }
    })

    await check('13-detached-condition-cannot-be-removed-as-background', async () => {
      await fresh()
      const main = 'Records must not appear.'
      const condition = 'Unless permission is granted.'
      const answer = `${main} ${condition}`
      const before = report.providerRequests.length
      await createDraft('Build the account dashboard.')
      await page.locator('[data-field="workflow.answers.acceptance"]').fill(answer)
      await readySuggestions()
      const records = [
        await separate(main, 'requirement', { field: 'answer:acceptance', index: 0 }),
        await separate(condition, 'context', { field: 'answer:acceptance', index: 1 }),
      ]
      assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
      assert.doesNotMatch(await page.locator('[data-part-status]').innerText(), /Used for local matching/)
      assert.deepEqual((await ideas()).practices, [])
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      await page.screenshot({ path: path.join(output, 'detached-condition-needs-review.png'), fullPage: true })
      const saved = await download('detached-condition-kept-unresolved', 'pack')
      assertParts(saved.project, records)
      assert.equal(saved.project.workflow.answers.acceptance, answer)
      for (const filename of ['WORKFLOW.md', 'templates/REQUIREMENTS.md']) assert.ok(saved.archive.get(filename).includes(condition), `${filename} retains the detached condition`)
      await reopen(saved.filePath)
      await selectSentence(condition, 'answer:acceptance', 1)
      assert.equal(await page.locator('[data-part-role]').inputValue(), 'context')
      assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
      assert.deepEqual((await ideas()).practices, [])
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      assert.equal(report.providerRequests.length, before)
      return { detachedConditionRemainsUnresolved: true, backgroundChoiceCannotDiscardIt: true, originalAnswerAndRecordsSurviveReopening: true }
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
  process.stdout.write(`Intent separation: ${report.checks.length} checks passed. Evidence: ${output}\n`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
