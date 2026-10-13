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
const output = path.join(root, 'local-knowledge/retests/clarification-recovery', new Date().toISOString().replace(/[:.]/g, '-'))
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

async function createDraft(brief, recipe = 'feature-delivery') {
  await page.locator('#jev-brief').fill(brief)
  await page.locator(`[data-start-recipe="${recipe}"]`).click()
  await page.locator('#jev-create').click()
  await page.locator('#project-name').waitFor({ state: 'visible' })
  await page.locator('#project-name').fill('Clarification recovery review')
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
      if (width === 390) await page.locator('#brief-suggestions').screenshot({ path: path.join(output, `${label}-card-${theme}.png`) })
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
    // These are the eight already disclosed misses, not the independent fresh set.
    const cases = [
      { id: 'O02', recipe: 'bugfix', brief: 'Fix the appointment reminder that uses the previous day for customers west of UTC. The original reminder service did not store a timezone. Appointments without a timezone must continue using the organisation default.', include: ['minimum-change'], exclude: ['specification-first', 'evidence-wiki'], allowed: ['context', 'requirement'] },
      { id: 'O04', brief: 'Add a CSV delimiter option to the existing import dialog. A chosen delimiter must affect only the current import and must be shown in the preview. Do not send this brief or its answers to any external model provider.', include: ['minimum-change', 'specification-first'], exclude: ['evidence-wiki'], allowed: ['requirement', 'inference'], paused: true },
      { id: 'O05', brief: 'Add an undo action for the last reorder in the existing queue screen. A rejected reorder must not be saved. Project input may be stored only in our approved workspace.', include: ['minimum-change', 'specification-first'], exclude: ['evidence-wiki'], allowed: ['requirement', 'handling'], paused: true },
      { id: 'O07', brief: 'Replace the order synchronisation subsystem across all warehouses, including conflict resolution and recovery. Agree the operating rules and acceptance examples before implementation. Keep a living decision record with links to source contracts and later corrections.', include: ['specification-first', 'evidence-wiki'], exclude: ['minimum-change'], allowed: [], knowledge: 'maintained-reference' },
      { id: 'S12', brief: 'Design and implement a new cross-region scheduling service after agreeing its conflict rules. Exclude minimum-change and evidence-wiki from this workflow. The previous team maintained a wiki, but that historical choice is not a request for this project.', include: ['specification-first'], exclude: ['minimum-change', 'evidence-wiki'], allowed: ['practices', 'context'] },
      { id: 'S13', recipe: 'bugfix', brief: 'Fix the broken attachment count in the existing case header. Keep a living evidence ledger linking each regression example to its source ticket and future corrections. Never send any part of this project to JEV or another model service.', include: ['minimum-change', 'evidence-wiki'], exclude: ['specification-first'], allowed: ['inference'], paused: true, knowledge: 'maintained-reference' },
      { id: 'S17', brief: 'Add a disabled-state explanation to the existing approval button. In our first prototype, rejected reviews were saved for later inspection. In the current product, a rejected approval must not be persisted, and the explanation must state why.', include: ['minimum-change', 'specification-first'], exclude: ['evidence-wiki'], allowed: ['context', 'requirement'] },
      { id: 'S18', recipe: 'feasibility', brief: 'Prepare a seating plan and lunch order for the team workshop. The room must have space for twelve attendees. We are not building or changing software.', include: [], exclude: ['minimum-change', 'specification-first', 'evidence-wiki'], allowed: ['no-software'], task: 'other', knowledge: 'one-off' },
    ]
    for (const scenario of cases) await check(`known-${scenario.id}-one-step-recovery`, async () => {
      await fresh()
      await createDraft(scenario.brief, scenario.recipe)
      const before = report.providerRequests.length
      const clicks = []
      if (scenario.id === 'O05') report.quickCardScreens = await visualMatrix('quick-source-meaning')
      for (let count = 0; count < 6 && await page.locator('[data-part-question]').count(); count++) {
        const question = page.locator('[data-part-question]')
        const text = await question.locator('[data-quick-part-quote]').innerText()
        assert.ok(scenario.brief.includes(text), 'The quick question quotes a whole original source sentence')
        const actions = await question.locator('[data-confirm-part-action]').evaluateAll(buttons => buttons.map(button => ({ action: button.dataset.confirmPartAction, field: button.dataset.partField, index: Number(button.dataset.partIndex) })))
        assert.equal(actions.length, 1, 'Only the bounded supported meaning is proposed')
        assert.ok(scenario.allowed.includes(actions[0].action), `Unexpected proposal: ${JSON.stringify(actions)}`)
        const selection = { ...actions[0], text }
        await press(`[data-confirm-part-action="${selection.action}"]`)
        clicks.push(selection)
        assert.equal(await page.locator('#project-purpose').inputValue(), scenario.brief)
      }
      assert.equal(await page.locator('[data-part-question]').count(), 0, 'No repetitive confirmation of an already kept sentence')
      await chooseTask(scenario.task || 'software-change')
      if (scenario.knowledge) await chooseKnowledge(scenario.knowledge)
      const result = await ideas()
      for (const id of scenario.include) assert.ok(result.practices.includes(id), `${scenario.id}: expected ${id}, got ${result.practices}`)
      for (const id of scenario.exclude) assert.ok(!result.practices.includes(id), `${scenario.id}: excluded ${id}`)
      assert.doesNotMatch(result.text, /Local practice ideas are paused/)
      if (scenario.paused) {
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        assert.match(await page.locator('[data-assessment-blocked]').innerText(), /limit on sending or handling your text/)
      }
      const saved = await download(`${scenario.id}-recovered`, 'pack')
      assert.equal(saved.project.workflow.intentReview.version, 5)
      assert.equal(saved.project.project.purpose, scenario.brief)
      const parts = saved.project.workflow.intentReview.parts
      assert.equal(parts.length, clicks.length)
      for (const selection of clicks) {
        const record = parts.find(part => part.field === selection.field && part.index === selection.index)
        assert.equal(record.text, selection.text)
        assert.equal(record.policyVersion, 4)
        const expectedRole = ({ requirement: 'requirement', context: 'context', 'no-software': 'context', inference: 'restriction', handling: 'restriction', practices: 'restriction' })[selection.action]
        assert.equal(record.role, expectedRole)
        if (expectedRole === 'restriction') assert.equal(record.scope, selection.action)
      }
      assert.ok(saved.archive.get('WORKFLOW.md').includes(scenario.brief), 'The original description survives in the workflow')
      if (scenario.id === 'S12') assert.ok(saved.project.project.purpose.includes('Exclude minimum-change and evidence-wiki from this workflow.'), 'Clear exclusions remain in the original text without redundant confirmation')
      const formats = [['zip', saved.filePath]]
      if (scenario.id === 'O05') {
        for (const format of ['json', 'html']) formats.push([format, (await downloadFormat(`O05-recovered-${format}`, format)).filePath])
      }
      for (const [format, filePath] of formats) {
        await reopen(filePath)
        assert.deepEqual((await ideas()).practices, result.practices)
        assert.equal(await page.locator('[data-part-question]').count(), 0)
        if (scenario.paused) assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        const reopened = await download(`${scenario.id}-reopened-${format}`, 'blueprint')
        assert.deepEqual(reopened.project, saved.project)
      }
      assert.equal(report.providerRequests.length, before, 'Clarification and reopening never request inference')
      report.confirmations.push({ id: scenario.id, quickClicks: clicks.length, organizerEdits: 0, taskClicks: 1, knowledgeClicks: scenario.knowledge ? 1 : 0, sources: clicks })
      return { ideas: result.practices, clicks, originalTextPreserved: true, actualReopenFormats: formats.map(([format]) => format), assessmentPaused: !!scenario.paused }
    })

    await check('09-mixed-command-stays-unresolved-without-shortcut', async () => {
      const sentences = [
        'Do not store project input anywhere, but send it to the model service.',
        'Project input may be stored only in our approved workspace and send it to JEV for review.',
      ]
      const observations = []
      for (const text of sentences) {
        await fresh()
        await createDraft(`Add an undo button to the queue. ${text}`)
        assert.equal(await page.locator('[data-confirm-part-action]').count(), 0)
        assert.deepEqual((await ideas()).practices, [])
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        const record = await separate(text, 'restriction', { scope: 'handling' })
        assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
        assert.deepEqual((await ideas()).practices, [])
        const saved = await download(`mixed-command-${observations.length}`, 'blueprint')
        assertParts(saved.project, [record])
        await reopen(saved.filePath)
        assert.deepEqual((await ideas()).practices, [])
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        observations.push({ text, noUnsafeShortcut: true, explicitMeaningStillNeedsReview: true })
      }
      return observations
    })

    await check('10-version-four-meaning-needs-explicit-reconfirmation', async () => {
      await fresh()
      const rule = 'In the current product, a rejected approval must not be persisted, and the explanation must state why.'
      await createDraft(`Fix the appointment reminder. ${rule}`)
      const record = await separate(rule, 'requirement')
      await chooseTask('software-change')
      const saved = await download('new-rule-current-policy', 'blueprint')
      const historical = structuredClone(saved.project)
      historical.workflow.intentReview.version = 4
      historical.workflow.intentReview.parts.forEach(part => { delete part.policyVersion })
      const fixture = path.join(output, 'historical-v4.json')
      await fs.writeFile(fixture, JSON.stringify(historical, null, 2) + '\n')
      report.importFixtures.push({ file: path.basename(fixture), explanation: 'Derived from actual current download, with source part interpretation restored to the old v4 policy. Imported using the public file chooser.', sha256: sha(await fs.readFile(fixture)) })
      await reopen(fixture)
      await selectSentence(rule)
      assert.match(await page.locator('[data-part-status]').innerText(), /needs review/)
      assert.doesNotMatch(await page.locator('[data-part-status]').innerText(), /Used for local matching/)
      assert.deepEqual((await ideas()).practices, [])
      const unchanged = await download('historical-v4-untouched', 'blueprint')
      assert.deepEqual(unchanged.project.workflow.intentReview, historical.workflow.intentReview)
      await briefView(page)
      await readySuggestions()
      assert.equal(await page.locator('[data-confirm-part-action="requirement"]').count(), 1)
      await press('[data-confirm-part-action="requirement"]')
      const current = await download('historical-reconfirmed', 'blueprint')
      assertParts(current.project, [record])
      assert.equal(current.project.workflow.intentReview.parts[0].policyVersion, 4)
      await reopen(current.filePath)
      await selectSentence(rule)
      assert.match(await page.locator('[data-part-status]').innerText(), /Used for local matching/)
      assert.ok((await ideas()).practices.includes('minimum-change'))
      return { oldPolicyNotSilentlyExpanded: true, newMeaningRequiresExplicitConfirmation: true }
    })

    await check('11-identical-source-edit-focus-and-stale-meaning', async () => {
      await fresh()
      const rule = 'In the current product, a rejected approval must not be persisted, and the explanation must state why.'
      const brief = `Add an undo button to the queue. ${rule}`
      await createDraft(brief)
      await page.locator('[data-field="workflow.answers.acceptance"]').fill(rule)
      await readySuggestions()
      assert.equal(await page.locator('[data-confirm-part-action="requirement"]').getAttribute('data-part-field'), 'brief')
      await press('[data-confirm-part-action="requirement"]')
      assert.equal(await page.locator('[data-confirm-part-action="requirement"]').getAttribute('data-part-field'), 'answer:acceptance')
      await page.locator('[data-edit-source-part]').click()
      assert.equal(await page.evaluate(() => document.activeElement.dataset.field), 'workflow.answers.acceptance')
      assert.equal(await page.locator('#project-purpose').inputValue(), brief)
      const changed = 'In the current product, a rejected approval must not be saved, and the explanation must state why.'
      await page.locator('[data-field="workflow.answers.acceptance"]').fill(changed)
      await readySuggestions()
      assert.match((await ideas()).text, /Previous clarifications need reviewing/)
      assert.equal(await page.locator('[data-quick-part-quote]').innerText(), rule, 'Stale original review is not silently reused')
      await press('[data-confirm-part-action="requirement"]')
      assert.equal(await page.locator('[data-quick-part-quote]').innerText(), changed)
      await press('[data-confirm-part-action="requirement"]')
      await chooseTask('software-change')
      const saved = await download('same-text-different-sources', 'pack')
      assert.equal(saved.project.workflow.intentReview.parts.length, 2)
      assert.equal(saved.project.workflow.answers.acceptance, changed)
      assert.equal(saved.project.project.purpose, brief)
      await reopen(saved.filePath)
      assert.equal(await page.locator('[data-part-question]').count(), 0)
      const screens = await visualMatrix('reviewed-source-meanings')
      return { exactFieldFocused: true, noSourceOverwrite: true, staleReviewExplicitlyReconfirmed: true, screens }
    })

    await check('12-original-only-assessment-after-quick-confirm', async () => {
      await fresh()
      const brief = 'Add a disabled-state explanation to the existing approval button.'
      const answer = 'In the current product, a rejected approval must not be persisted, and the explanation must state why.'
      await createDraft(brief)
      await page.locator('[data-field="workflow.answers.acceptance"]').fill(answer)
      await readySuggestions()
      await press('[data-confirm-part-action="requirement"]')
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
      assert.doesNotMatch(JSON.stringify(request), /intentReview|parts|knowledgeNeed|scope|catalogue|graphReasons|taskKind|policyVersion/)
      const saved = await download('assessed-original-inputs', 'pack')
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
  process.stdout.write(`Clarification recovery: ${report.checks.length} checks passed. Evidence: ${output}\n`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
