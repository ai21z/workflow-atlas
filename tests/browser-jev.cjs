const { briefView, workflowView: openWorkflowView, closeWorkspaceDetails } = require('./browser-workspace-helpers.cjs')
const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const http = require('node:http')
const { createHash } = require('node:crypto')
const { pathToFileURL } = require('node:url')

let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright')) }

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'local-knowledge/retests/jev-integration', new Date().toISOString().replace(/[:.]/g, '-'))
const sha = data => createHash('sha256').update(data).digest('hex')
const evidence = {
  startedAt: new Date().toISOString(),
  method: 'Installed Chrome through the actual public UI and local server. Injected provider transport uses recorded synthetic regressions and explicitly constructed synthetic responses. No provider calls, secrets or application state injection.',
  limits: 'Functional browser simulation. No human comprehension study, native operating system dialog appearance assessment or screen reader audit. Mock timing is not model performance.',
  checks: [], errors: [], console: [], storageWrites: [], downloads: [], providerRequests: [],
}
let browser, context, page, server, base, contract, zipApi, JevError
let mode = 'feature', keyAvailable = true, slowRelease = null, received = 0
let serverClockOffset = 0
let recorded = [], downloadedPack

function answer(question, selected) {
  return { type: 'choice', choice: selected, confidence: 1, probabilities: Object.fromEntries(Object.keys(question.criteria).map(id => [id, id === selected ? 1 : 0])) }
}
function mockPayload(request, selections = {}) {
  return {
    model: contract.MODEL,
    answers: Object.fromEntries(Object.entries(request.questions).map(([id, question]) => [id, answer(question, selections[id] || (id === 'intent' ? 'feature-delivery' : id.startsWith('coverage:') ? 'missing' : id === 'practice' ? 'relevant' : id === 'practice_need' ? 'established' : 'not-rejected'))])),
    usage: { input_tokens: 200, output_tokens: 0 },
  }
}
const featureChoices = { 'coverage:feature-delivery:user-need': 'answered', 'coverage:feature-delivery:affected': 'answered' }
const coveredChoices = { ...featureChoices, 'coverage:feature-delivery:acceptance': 'answered' }
function payloadFor(request, requestMode) {
  if (requestMode === 'recorded-f01' || requestMode === 'recorded-study') {
    const fixture = recorded.find(item => item.id === (requestMode === 'recorded-f01' ? 'F01' : 'study-before-delivery-known-failure'))
    return { model: fixture.recordedResponse.model, answers: Object.fromEntries(Object.keys(request.questions).map(id => [id, structuredClone(fixture.recordedResponse.answers[id])])), usage: structuredClone(fixture.recordedResponse.usage) }
  }
  if (requestMode === 'covered') return mockPayload(request, coveredChoices)
  if (requestMode === 'bug') return mockPayload(request, { intent: 'bugfix', 'coverage:bugfix:expected': 'answered', 'coverage:bugfix:observed': 'answered', 'coverage:bugfix:impact': 'answered' })
  if (requestMode === 'study') return mockPayload(request, { intent: 'feasibility', 'coverage:feasibility:current-work': 'answered', 'coverage:feasibility:desired-outcome': 'answered' })
  if (requestMode === 'unclear' || requestMode === 'outside-supported-recipes') return mockPayload(request, { intent: requestMode })
  if (requestMode === 'rejected-practice') return mockPayload(request, { ...featureChoices, practice_need: 'established', practice_boundary: 'rejected' })
  return mockPayload(request, featureChoices)
}

async function provider(request, { signal, apiKey }) {
  received += 1
  const requestMode = mode
  const item = { number: received, mode: requestMode, model: request.model, questions: Object.keys(request.questions), state: structuredClone(request.state), cancelled: false }
  evidence.providerRequests.push(item)
  signal.addEventListener('abort', () => { item.cancelled = true }, { once: true })
  if (!apiKey) throw new JevError('not_configured', 'Suggestions are not configured here.', { status: 503 })
  if (requestMode === 'authentication') throw new JevError('authentication_failed', 'The local key was not accepted.', { status: 503 })
  if (requestMode === 'timeout') throw new JevError('timed_out', 'The suggestion took too long.', { status: 504 })
  if (requestMode === 'rate-limit') throw new JevError('rate_limited', 'The service is busy.', { status: 429 })
  if (requestMode === 'malformed') return { payload: { model: 'different-model' }, metadata: { attempts: 1, providerElapsedMs: 1 } }
  if (requestMode === 'slow') await new Promise(resolve => { slowRelease = resolve })
  return { payload: payloadFor(request, requestMode), metadata: { attempts: 1, providerElapsedMs: 1 } }
}

async function persist() {
  evidence.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2) + '\n')
  const passed = evidence.checks.filter(check => check.status === 'Pass').length
  const lines = [
    '# Integrated JEV browser regression', '',
    evidence.method, '', evidence.limits, '',
    `Observed checks: ${passed}/${evidence.checks.length} passed.`,
    `Browser page errors: ${evidence.errors.length}. Observed browser storage writes: ${evidence.storageWrites.length}.`, '',
    ...evidence.checks.map(check => `- ${check.id}: ${check.status}${check.error ? `. ${check.error.split('\n')[0]}` : ''}`), '',
    'Detailed observations, source hashes and synthetic requests are in results.json. Screenshots use fictional project text. Exported ZIPs are the actual browser downloads.', '',
  ]
  await fs.writeFile(path.join(output, 'report.md'), lines.join('\n'))
}
async function check(id, action) {
  const record = { id, status: 'Not run', startedAt: new Date().toISOString() }
  evidence.checks.push(record)
  try { record.observation = await action(); record.status = 'Pass' }
  catch (error) {
    record.status = 'Fail'
    record.error = error.stack || String(error)
    process.stderr.write(`${id}: ${record.error.split('\n')[0]}\n`)
  }
  if (page && !page.isClosed()) {
    record.screenshot = `${id}.png`
    await page.screenshot({ path: path.join(output, record.screenshot), fullPage: true }).catch(error => { record.screenshotError = error.message })
  }
  record.finishedAt = new Date().toISOString()
  await persist()
  process.stdout.write(`${id}: ${record.status}\n`)
}
async function fresh({ width = 1440, height = 1000, reducedMotion = 'reduce' } = {}) {
  // Independent scenarios start outside the prior local request window.
  // The real limiter remains enabled and has separate server regression coverage.
  serverClockOffset += 60_001
  if (context) {
    for (const frame of page.frames()) {
      const writes = await frame.evaluate(() => window.__atlasStorageWrites || []).catch(() => [])
      evidence.storageWrites.push(...writes)
    }
    await context.close()
  }
  context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, reducedMotion })
  await context.addInitScript(() => {
    window.__atlasStorageWrites = []
    for (const operation of ['setItem', 'removeItem', 'clear']) {
      const original = Storage.prototype[operation]
      Storage.prototype[operation] = function (...args) {
        window.__atlasStorageWrites.push({ operation, key: args[0] || '', page: location.pathname })
        return original.apply(this, args)
      }
    }
    if (typeof IDBObjectStore !== 'undefined') for (const operation of ['add', 'put', 'delete', 'clear']) {
      const original = IDBObjectStore.prototype[operation]
      IDBObjectStore.prototype[operation] = function (...args) {
        window.__atlasStorageWrites.push({ operation: `indexedDB.${operation}`, page: location.pathname })
        return original.apply(this, args)
      }
    }
  })
  page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => evidence.errors.push({ message: error.message, mode }))
  page.on('console', message => { if (message.type() === 'error') evidence.console.push({ message: message.text(), mode }) })
  await page.goto(base)
  await page.locator('#start-screen').waitFor({ state: 'visible' })
}
async function expand(selector) {
  const detail = page.locator(selector)
  if (await detail.getAttribute('open') === null) await detail.locator(':scope > summary').click()
}
async function suggest(brief, nextMode = 'feature') {
  mode = nextMode
  await page.locator('#jev-brief').fill(brief)
  const before = received
  await page.locator('#jev-submit').click()
  await page.waitForFunction(() => document.querySelector('#jev-form')?.getAttribute('aria-busy') === 'false')
  assert.equal(received, before + 1)
  return before
}
async function createDraft() {
  await page.locator('#jev-create').click()
  await page.locator('#studio-layout').waitFor({ state: 'visible' })
  await openWorkflowView(page)
}
async function readFile(filename) {
  await closeWorkspaceDetails(page)
  await page.locator('#view-nav [data-project-view="artifacts"]').click()
  await page.locator(`[data-file="${filename}"]`).click()
  await page.waitForFunction(filename => document.querySelector('#preview-path')?.textContent === filename, filename)
  return page.locator('#file-preview').innerText()
}
async function download(name = 'accepted-feature.zip', kind = 'pack') {
  await closeWorkspaceDetails(page)
  await page.locator('#download-project').click()
  await page.locator('#download-dialog').waitFor({ state: 'visible' })
  await page.locator(`[data-output-kind="${kind}"]`).check()
  const pending = page.waitForEvent('download')
  await page.locator('[data-studio-action="download-output"]').click()
  const downloaded = await pending
  const filePath = path.join(output, name)
  await downloaded.saveAs(filePath)
  assert.equal(await downloaded.failure(), null)
  const bytes = await fs.readFile(filePath)
  const files = await zipApi.unzipTextFiles(new Uint8Array(bytes))
  const archive = new Map(files.files.map(file => [file.path, file.content]))
  evidence.downloads.push({ filename: name, bytes: bytes.length, sha256: sha(bytes), files: [...archive.keys()] })
  return { filePath, archive }
}
async function openZip(filePath) {
  await fresh()
  await page.locator('#import-config').click()
  await page.locator('#open-dialog').waitFor({ state: 'visible' })
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-studio-action="choose-project-file"]').click()])
  await chooser.setFiles(filePath)
  await page.locator('#studio-layout').waitFor({ state: 'visible' })
}
async function noOverflow() {
  const sizes = await page.evaluate(() => ({ width: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }))
  assert.ok(sizes.document <= sizes.width + 1, JSON.stringify(sizes))
  return sizes
}
async function setTheme(theme) {
  if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click()
  assert.equal(await page.locator('html').getAttribute('data-theme'), theme)
}
async function focusWithTab(id) {
  for (let count = 0; count < 45; count += 1) {
    if (await page.evaluate(id => document.activeElement?.id === id, id)) return count
    await page.keyboard.press('Tab')
  }
  throw new Error(`The Tab order did not reach ${id}.`)
}
async function waitForProvider(before) {
  const deadline = Date.now() + 2500
  while (received === before && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
  assert.equal(received, before + 1, 'The local server must dispatch the explicit suggestion to its injected provider.')
}
async function sourceHashes() {
  const files = ['factory/app.mjs', 'factory/index.html', 'factory/jev-view.mjs', 'factory/jev.css', 'factory/jev-assistance.mjs', 'factory/jev-contract.mjs', 'factory/jev-definitions.mjs', 'tools/serve.mjs', 'tools/jev-transport.mjs']
  return Promise.all(files.map(async relative => ({ path: relative, sha256: sha(await fs.readFile(path.join(root, relative))) })))
}

async function main() {
  await fs.mkdir(output, { recursive: true })
  contract = await import(pathToFileURL(path.join(root, 'factory/jev-contract.mjs')).href)
  zipApi = await import(pathToFileURL(path.join(root, 'factory/zip.mjs')).href)
  ;({ JevError } = await import(pathToFileURL(path.join(root, 'tools/jev-transport.mjs')).href))
  const { createAtlasServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href)
  recorded = JSON.parse(await fs.readFile(path.join(root, 'tests/fixtures/jev-v8-responses.json'), 'utf8')).cases
  server = await createAtlasServer({ rootDir: root, getApiKey: () => keyAvailable ? 'synthetic-test-key' : undefined, transport: provider, now: () => performance.now() + serverClockOffset })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}/factory/`
  evidence.base = base
  browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
  evidence.browser = browser.version()
  evidence.driverSha256 = sha(await fs.readFile(__filename))
  evidence.sourcesBefore = await sourceHashes()
  try {
    await check('01-recorded-feature-practice-and-create', async () => {
      await fresh()
      const fixture = recorded.find(item => item.id === 'F01')
      await suggest(fixture.item.brief, 'recorded-f01')
      assert.match(await page.locator('#jev-proposal-title').innerText(), /Feature delivery/)
      assert.match(await page.locator('#jev-question-title').innerText(), /How will you know it works/)
      await expand('#jev-practice-details')
      await page.locator('#jev-practice').selectOption('specification-first')
      const before = received
      await page.locator('[data-jev-action="check-practice"]').click()
      await page.locator('#jev-include-practice').waitFor({ state: 'visible' })
      assert.equal(received, before + 1)
      assert.match(await page.locator('.jev-practice-result').innerText(), /Suggested for this work/)
      await page.locator('#jev-include-practice').check()
      await page.locator('#jev-next-answer').click()
      await page.keyboard.type('Open shows only open requests. All shows every request.', { delay: 4 })
      assert.equal(await page.locator('#jev-next-answer').inputValue(), 'Open shows only open requests. All shows every request.')
      await page.locator('[data-jev-action="answer"]').click()
      await createDraft()
      assert.match(await page.locator('#recipe-label').innerText(), /Feature delivery/)
      assert.equal(await page.locator('#project-purpose').inputValue(), fixture.item.brief)
      assert.doesNotMatch(await page.locator('#task-guide').innerText(), /How will you know it works/)
      await page.locator('#new-project').click()
      await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
      await page.locator('#confirm-dialog button[value="cancel"]').click()
      await page.locator('#studio-layout').waitFor({ state: 'visible' })
      const workflow = await readFile('WORKFLOW.md')
      assert.match(workflow, /Open shows only open requests/)
      downloadedPack = await download()
      const config = JSON.parse(downloadedPack.archive.get('project.json'))
      assert.equal(config.workflow.recipe, 'feature-delivery')
      assert.equal(config.workflow.answers.acceptance, 'Open shows only open requests. All shows every request.')
      assert.ok(config.practices.includes('specification-first'))
      assert.ok(downloadedPack.archive.get('templates/REQUIREMENTS.md').includes(config.workflow.answers.acceptance))
      assert.ok(!downloadedPack.archive.get('project.json').includes('synthetic-test-key'))
      assert.ok(!downloadedPack.archive.get('project.json').includes('allCoverage'))
      await page.locator('[data-close-dialog="download-dialog"]').click()
      await page.locator('#new-project').click()
      await page.locator('#start-screen').waitFor({ state: 'visible' })
      assert.equal(await page.locator('#confirm-dialog').isVisible(), false)
      return { record: 'F01', responseType: 'Retained recorded response, subset for the ten-question request and complete response for the designated practice.', actualZipBytesVerified: true, newlyCreatedWorkWarnedBeforeDownload: true, explicitDownloadClearedWarning: true }
    })
    await check('02-native-file-chooser-reopen-no-inference', async () => {
      assert.ok(downloadedPack, 'The accepted feature ZIP must exist.')
      const before = received
      await openZip(downloadedPack.filePath)
      assert.equal(received, before)
      const workflow = await readFile('WORKFLOW.md')
      assert.match(workflow, /Open shows only open requests/)
      assert.equal(await page.locator('#recipe-label').innerText(), 'Feature delivery')
      assert.equal(await page.locator('#project-purpose').inputValue(), recorded.find(item => item.id === 'F01').item.brief)
      return 'The actual browser ZIP reopened through a file chooser event. Accepted wording and manual project fields survived. No inference occurred.'
    })
    await check('03-description-coverage-and-confirmed-reuse', async () => {
      await fresh()
      const brief = 'Add saved searches. Save keeps the name and filters. Scope is the existing results view only.'
      await suggest(brief, 'covered')
      await expand('#jev-covered-acceptance')
      assert.equal(await page.locator('#jev-wording-acceptance').inputValue(), brief)
      await page.locator('#jev-wording-acceptance').fill('Save keeps the name and filters exactly as entered.')
      await page.locator('[data-jev-action="confirm"][data-question="acceptance"]').click()
      await expand('#jev-draft-details')
      await page.locator('#jev-purpose').fill('Add saved searches.')
      await page.locator('.jev-payload > summary').click()
      assert.match(await page.locator('#jev-payload-preview').innerText(), /Add saved searches\./)
      const before = received
      await page.locator('#jev-submit').click()
      await page.waitForFunction(() => document.querySelector('#jev-form')?.getAttribute('aria-busy') === 'false')
      assert.equal(received, before + 1)
      assert.equal(evidence.providerRequests.at(-1).state.suppliedProjectAnswers['user-need'], 'Add saved searches.')
      assert.equal(evidence.providerRequests.at(-1).state.suppliedProjectAnswers.acceptance, 'Save keeps the name and filters exactly as entered.')
      await createDraft()
      const requirements = await readFile('templates/REQUIREMENTS.md')
      assert.match(requirements, /Save keeps the name and filters exactly as entered/)
      assert.match(requirements, /UNRESOLVED/)
      const bundle = await download('confirmed-reuse.zip')
      const config = JSON.parse(bundle.archive.get('project.json'))
      assert.equal(config.workflow.answers.acceptance, 'Save keeps the name and filters exactly as entered.')
      assert.equal(config.workflow.answers.affected, undefined)
      assert.ok(config.workflow.notes.requirements.includes(brief))
      assert.equal(config.project.purpose, 'Add saved searches.')
      return { exactOriginalOffered: true, explicitlyConfirmedEditedWording: config.workflow.answers.acceptance, unconfirmedAffectedFieldRemainedUnresolved: true, originalRetained: true }
    })
    await check('04-unconfirmed-covered-answer-remains-unresolved', async () => {
      await fresh()
      await suggest('Add saved searches. Save keeps name and filters. Scope is the results view.', 'covered')
      assert.equal(await page.locator('#jev-covered-acceptance').count(), 1)
      await createDraft()
      assert.match(await page.locator('#task-guide').innerText(), /How will you know it works/)
      const bundle = await download('unconfirmed-coverage.zip')
      const config = JSON.parse(bundle.archive.get('project.json'))
      assert.equal(config.workflow.answers.acceptance, undefined)
      assert.match(bundle.archive.get('templates/REQUIREMENTS.md'), /UNRESOLVED/)
      return 'Coverage labels did not silently insert answer text. The created project and downloaded requirements preserve the actual gap.'
    })
    await check('05-deferral-carried-through-creation', async () => {
      await fresh()
      await suggest('Add saved searches. Scope is the existing results view.', 'feature')
      const discarded = 'Unfinished example. Keep this out of my requirements.'
      await page.locator('#jev-next-answer').fill(discarded)
      await page.locator('[data-jev-action="defer"]').focus()
      await page.keyboard.press('Enter')
      assert.equal(await page.locator('#jev-question-title').count(), 0)
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'jev-wording-affected')
      assert.ok((await page.locator('#jev-status').innerText()).trim())
      await createDraft()
      assert.doesNotMatch(await page.locator('#task-guide').innerText(), /How will you know it works/)
      const bundle = await download('deferred-question.zip')
      assert.equal(JSON.parse(bundle.archive.get('project.json')).workflow.answers.acceptance, undefined)
      assert.match(bundle.archive.get('templates/REQUIREMENTS.md'), /UNRESOLVED/)
      assert.ok([...bundle.archive.values()].every(text => !text.includes(discarded)))
      return 'Typed but unrecorded wording was discarded by Continue without this and appeared in no downloaded file. Keyboard focus advanced to the remaining wording review. The declined question did not immediately repeat after creation.'
    })
    await check('06-manual-choice-and-knowledge-preserve-description', async () => {
      await fresh()
      const brief = 'Investigate whether the local engineer run configuration process should become a backend API.'
      await page.locator('#jev-brief').fill(brief)
      const before = received
      await page.locator('#open-knowledge-map').click()
      await page.locator('#knowledge-workspace').waitFor({ state: 'visible' })
      await page.frameLocator('#knowledge-frame').locator('#knowledge-back').click()
      await page.locator('#start-screen').waitFor({ state: 'visible' })
      assert.equal(await page.locator('#jev-brief').inputValue(), brief)
      assert.equal(received, before)
      await page.locator('[data-start-recipe="feasibility"]').click()
      assert.match(await page.locator('#jev-proposal-title').innerText(), /Feasibility/)
      await expand('#jev-draft-details')
      await page.locator('#jev-name').fill('Backend configuration feasibility')
      await createDraft()
      assert.equal(await page.locator('#recipe-label').innerText(), 'Feasibility investigation')
      assert.equal(await page.locator('#project-purpose').inputValue(), brief)
      assert.equal(received, before)
      return 'Knowledge opened and returned without losing the pre-project description. Manual choice created a study with no inference.'
    })
    await check('07-slow-cancel-edits-and-manual-selection', async () => {
      await fresh()
      mode = 'slow'
      await page.locator('#jev-brief').fill('Build a status filter.')
      let before = received
      await page.locator('#jev-submit').click()
      await page.waitForFunction(() => document.querySelector('#jev-form')?.getAttribute('aria-busy') === 'true')
      await waitForProvider(before)
      assert.equal(await page.locator('#jev-submit').isDisabled(), true)
      await page.locator('#jev-cancel').click()
      assert.match(await page.locator('#jev-status').innerText(), /cancelled/)
      slowRelease()
      await page.waitForTimeout(50)
      assert.equal(await page.locator('#jev-proposal-title').count(), 0)
      assert.equal(await page.locator('#jev-brief').inputValue(), 'Build a status filter.')
      mode = 'slow'
      before = received
      await page.locator('#jev-submit').click()
      await waitForProvider(before)
      await page.locator('#jev-brief').fill('Investigate whether a backend API is feasible.')
      await page.locator('[data-start-recipe="feasibility"]').click()
      slowRelease()
      await page.waitForTimeout(50)
      assert.match(await page.locator('#jev-proposal-title').innerText(), /Feasibility/)
      assert.equal(await page.locator('#jev-brief').inputValue(), 'Investigate whether a backend API is feasible.')
      await createDraft()
      assert.equal(await page.locator('#recipe-label').innerText(), 'Feasibility investigation')
      return 'Cancel, typing and choosing a manual workflow invalidated outstanding work. No late result replaced the new direction.'
    })
    await check('08-unclear-and-unsupported-fallback', async () => {
      for (const intent of ['unclear', 'outside-supported-recipes']) {
        await fresh()
        await suggest('An open ended request that needs a human choice.', intent)
        assert.equal(await page.locator('#jev-proposal-title').count(), 0)
        assert.equal(await page.locator('#jev-brief').inputValue(), 'An open ended request that needs a human choice.')
        const status = await page.locator('#jev-status').innerText()
        assert.match(status, intent === 'unclear' ? /could not tell which workflow fits/ : /does not match the available workflows/)
        assert.doesNotMatch(status, /You chose the workflow/)
        assert.match(status, /choose a workflow below/)
        await page.locator('[data-start-recipe="bugfix"]').click()
        await createDraft()
        assert.equal(await page.locator('#recipe-label').innerText(), 'Bug investigation and repair')
      }
      return 'Unclear and unsupported results explained the specific limitation and offered manual choices. Neither claimed the user had selected a workflow or forced a recipe.'
    })
    await check('09-unconfigured-and-provider-errors', async () => {
      const outcomes = []
      for (const errorMode of ['unconfigured', 'authentication', 'timeout', 'rate-limit', 'malformed']) {
        keyAvailable = errorMode !== 'unconfigured'
        await fresh()
        await suggest('Keep my description while a suggestion fails.', errorMode)
        await page.locator('#jev-error').waitFor({ state: 'visible' })
        const message = await page.locator('#jev-error').innerText()
        assert.equal(await page.locator('#jev-brief').inputValue(), 'Keep my description while a suggestion fails.')
        assert.ok(!message.includes('synthetic-test-key'))
        assert.equal(await page.locator('#jev-proposal-title').count(), 0)
        await page.locator('[data-start-recipe="feature-delivery"]').click()
        await createDraft()
        assert.equal(await page.locator('#project-purpose').inputValue(), 'Keep my description while a suggestion fails.')
        outcomes.push({ errorMode, message })
      }
      keyAvailable = true
      return outcomes
    })
    await check('10-retained-model-failure-remains-visible', async () => {
      await fresh()
      const fixture = recorded.find(item => item.id === 'study-before-delivery-known-failure')
      await suggest(fixture.item.brief, 'recorded-study')
      assert.match(await page.locator('#jev-proposal-title').innerText(), /Feasibility/)
      assert.match(await page.locator('#jev-question-title').innerText(), /How is this done today/)
      await page.locator('[data-jev-action="defer"]').click()
      await createDraft()
      assert.doesNotMatch(await page.locator('#task-guide').innerText(), /How is this done today/)
      return 'The retained synthetic study failure still asks about current work. UI deferral allows progress. This is a workaround, not a model accuracy improvement.'
    })
    await check('10a-repair-expected-behavior-and-manual-override', async () => {
      await fresh()
      const brief = 'Repair a saved search that drops its date filter. The approved example retains every selected date. Only the existing filter is affected.'
      await suggest(brief, 'bug')
      assert.match(await page.locator('#jev-proposal-title').innerText(), /Bug investigation/)
      await expand('#jev-covered-expected')
      assert.equal(await page.locator('#jev-wording-expected').inputValue(), brief)
      await page.locator('#jev-wording-expected').fill('The approved example retains every selected date.')
      await page.locator('[data-jev-action="confirm"][data-question="expected"]').click()
      await createDraft()
      const bundle = await download('repair-expected.zip')
      const config = JSON.parse(bundle.archive.get('project.json'))
      assert.equal(config.workflow.answers.expected, 'The approved example retains every selected date.')
      assert.equal(config.project.purpose, brief)
      await fresh()
      await suggest('Plan a selected behavior change, but let me choose its workflow.', 'feature')
      await page.locator('#jev-recipe').selectOption('feasibility')
      assert.match(await page.locator('#jev-proposal-title').innerText(), /Feasibility/)
      assert.match(await page.locator('.jev-proposal-heading .eyebrow').innerText(), /YOUR CHOICE/)
      await createDraft()
      assert.equal(await page.locator('#recipe-label').innerText(), 'Feasibility investigation')
      return 'Expected repair behavior was explicitly recorded separately from the overall goal. A deliberate manual workflow also overrode a supported model suggestion.'
    })
    await check('10b-old-review-wording-does-not-follow-a-new-description', async () => {
      await fresh()
      await suggest('Add the first feature. Its accepted result is first. Scope is one view.', 'covered')
      await expand('#jev-covered-acceptance')
      await page.locator('#jev-wording-acceptance').fill('Unconfirmed wording for the first feature.')
      const nextBrief = 'Add the second feature. Its accepted result is second. Scope is another view.'
      await suggest(nextBrief, 'covered')
      await expand('#jev-covered-acceptance')
      assert.equal(await page.locator('#jev-wording-acceptance').inputValue(), nextBrief)
      return 'Editing the original description invalidates cached unconfirmed reuse wording. The new review offers the exact new description.'
    })
    await check('10c-selected-practice-can-be-removed-after-a-new-rejection', async () => {
      await fresh()
      await suggest('Build a status filter for the existing request list.', 'feature')
      await expand('#jev-practice-details')
      await page.locator('#jev-practice').selectOption('specification-first')
      await page.locator('[data-jev-action="check-practice"]').click()
      await page.locator('#jev-include-practice').waitFor({ state: 'visible' })
      await page.locator('#jev-include-practice').check()
      await suggest('Build a status filter. Omit Requirements before implementation.', 'rejected-practice')
      await expand('#jev-practice-details')
      assert.match(await page.locator('.jev-practice-result').innerText(), /Not suggested/)
      await page.locator('[data-jev-action="remove-practice"][data-practice="specification-first"]').click()
      await createDraft()
      const bundle = await download('removed-practice.zip')
      const config = JSON.parse(bundle.archive.get('project.json'))
      assert.ok(!config.practices.includes('specification-first'))
      return 'An earlier explicit practice choice stayed visible after a contrary review. The user removed it and the actual export excluded it.'
    })
    await check('10d-create-does-not-record-unfinished-answer', async () => {
      await fresh()
      await suggest('Add saved searches. Scope is the existing results view.', 'feature')
      const unfinished = 'Draft only. I have not approved this acceptance wording.'
      await page.locator('#jev-next-answer').fill(unfinished)
      await createDraft()
      const bundle = await download('unfinished-answer.zip')
      assert.equal(JSON.parse(bundle.archive.get('project.json')).workflow.answers.acceptance, undefined)
      assert.ok([...bundle.archive.values()].every(text => !text.includes(unfinished)))
      return 'Create this draft compiled recorded decisions only. Typing in the optional answer field did not silently approve or export that text.'
    })
    await check('10e-skip-edits-keeps-previously-recorded-answer', async () => {
      await fresh()
      await suggest('Add saved searches. Scope is the existing results view.', 'feature')
      const accepted = 'Save keeps the exact search name and chosen filters.'
      await page.locator('#jev-next-answer').fill(accepted)
      await page.locator('[data-jev-action="answer"]').focus()
      await page.keyboard.press('Enter')
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'jev-wording-affected')
      mode = 'feature'
      await page.locator('#jev-submit').click()
      await page.waitForFunction(() => document.querySelector('#jev-form')?.getAttribute('aria-busy') === 'false')
      await page.locator('#jev-next-answer').fill('Unapproved replacement of an existing answer.')
      await page.locator('[data-jev-action="keep"]').focus()
      await page.keyboard.press('Enter')
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'jev-wording-affected')
      await createDraft()
      const bundle = await download('kept-recorded-answer.zip')
      assert.equal(JSON.parse(bundle.archive.get('project.json')).workflow.answers.acceptance, accepted)
      assert.ok([...bundle.archive.values()].every(text => !text.includes('Unapproved replacement')))
      return 'Record this answer explicitly committed text. A later Keep my answer discarded pending replacement wording and retained the previous confirmed answer. Both actions advanced keyboard focus.'
    })
    await check('10f-covered-description-can-be-reused-after-create', async () => {
      await fresh()
      const brief = 'Investigate whether the engineer run configuration process should become an API. Today an engineer runs local instructions and reviews the configuration manually. Compare feasibility and cost before implementation.'
      const currentWork = 'Today an engineer runs local instructions and reviews the configuration manually.'
      await suggest(brief, 'study')
      await createDraft()
      assert.match(await page.locator('#task-guide').innerText(), /Already in your description/)
      await page.locator('#task-guide').getByRole('button', { name: /Review wording/ }).click()
      await page.locator('[data-assistant-answer-review="current-work"]').waitFor({ state: 'visible' })
      assert.equal(await page.locator('#assistant-answer-current-work').inputValue(), brief)
      await page.locator('#assistant-answer-current-work').fill(currentWork)
      const unresolved = await readFile('WORKFLOW.md')
      assert.match(unresolved, /UNRESOLVED/)
      const pendingBundle = await download('postcreate-current-work-unconfirmed.zip')
      assert.equal(JSON.parse(pendingBundle.archive.get('project.json')).workflow.answers['current-work'], undefined)
      await page.locator('[data-close-dialog="download-dialog"]').click()
      await page.locator('#task-guide').getByRole('button', { name: /Review wording/ }).click()
      assert.equal(await page.locator('#assistant-answer-current-work').inputValue(), currentWork)
      await page.locator('[data-confirm-assistant-answer="current-work"]').click()
      const bundle = await download('postcreate-current-work.zip')
      const config = JSON.parse(bundle.archive.get('project.json'))
      assert.equal(config.workflow.answers['current-work'], currentWork)
      assert.ok(bundle.archive.get('WORKFLOW.md').includes(currentWork))
      assert.ok(!bundle.archive.get('project.json').includes('allCoverage'))
      const before = received
      await openZip(bundle.filePath)
      await briefView(page)
      assert.equal(await page.locator('[data-assistant-answer-review]').count(), 0)
      assert.equal(received, before)
      return 'The editor offered the exact original description for a covered field. Editing it stayed pending across Files navigation. Use this answer recorded the chosen wording and the actual ZIP retained it. Reopening did not revive session-only model assessments or trigger inference.'
    })
    await check('10g-editor-review-deferral-and-context-invalidation', async () => {
      await fresh()
      const brief = 'Add saved searches. Save keeps name and filters. Scope is the results view.'
      await suggest(brief, 'covered')
      await createDraft()
      await page.locator('#task-guide').getByRole('button', { name: /Review wording/ }).click()
      await page.locator('#assistant-answer-acceptance').fill('This unconfirmed replacement must not be kept.')
      await page.locator('[data-defer-assistant-answer="acceptance"]').click()
      assert.doesNotMatch(await page.locator('#task-guide').innerText(), /How will you know it works/)
      const bundle = await download('postcreate-deferred-answer.zip')
      assert.equal(JSON.parse(bundle.archive.get('project.json')).workflow.answers.acceptance, undefined)
      assert.ok([...bundle.archive.values()].every(text => !text.includes('This unconfirmed replacement')))
      await page.locator('[data-close-dialog="download-dialog"]').click()
      await briefView(page)
      await page.locator('#project-purpose').fill('Investigate an entirely different delivery approach.')
      await page.locator('#project-purpose').press('Tab')
      await briefView(page)
      assert.equal(await page.locator('[data-assistant-answer-review]').count(), 0)
      await fresh()
      await suggest(brief, 'covered')
      await createDraft()
      await briefView(page)
      await page.locator('#recipe-choice').selectOption('feasibility')
      assert.equal(await page.locator('[data-assistant-answer-review]').count(), 0)
      return 'Leave unanswered discarded pending wording and suppressed the immediate question. Changing the goal or starting workflow cleared old wording-review assessments.'
    })
    await check('10h-last-review-keyboard-focus-reaches-create', async () => {
      await fresh()
      await suggest('Add saved searches. Scope is the existing results view.', 'feature')
      await page.locator('[data-jev-action="defer"]').focus()
      await page.keyboard.press('Enter')
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'jev-wording-affected')
      await page.locator('[data-jev-action="confirm"][data-question="affected"]').focus()
      await page.keyboard.press('Enter')
      assert.equal(await page.evaluate(() => document.activeElement?.id), 'jev-create')
      assert.ok((await page.locator('#jev-status').innerText()).trim())
      await page.keyboard.press('Enter')
      await page.locator('#studio-layout').waitFor({ state: 'visible' })
      return 'When the final wording review was confirmed, focus advanced to Create this draft and Enter created the project. Focus did not fall back to the document body.'
    })
    await check('10i-active-replacement-proposal-survives-project-download-new-and-open', async () => {
      await openZip(downloadedPack.filePath)
      await briefView(page)
      const currentResult = await page.locator('#project-purpose').inputValue()
      await page.locator('[data-studio-action="review-suggestion"]').click()
      const proposal = 'Investigate a separate reporting integration before changing the current project.'
      const recordedAnswer = 'Compare permitted read operations with the approved reporting contract.'
      const unfinishedAnswer = 'Unconfirmed replacement wording that must remain editable.'
      await suggest(proposal, 'feature')
      await page.locator('#jev-next-answer').fill(recordedAnswer)
      await page.locator('[data-jev-action="answer"]').click()
      mode = 'feature'
      await page.locator('#jev-submit').click()
      await page.waitForFunction(() => document.querySelector('#jev-form')?.getAttribute('aria-busy') === 'false')
      await page.locator('#jev-next-answer').fill(unfinishedAnswer)
      const assertProposal = async () => {
        await briefView(page)
        await expand('#active-suggestion')
        assert.equal(await page.locator('#project-purpose').inputValue(), currentResult)
        assert.equal(await page.locator('#jev-brief').inputValue(), proposal)
        assert.equal(await page.locator('#jev-next-answer').inputValue(), unfinishedAnswer)
        await expand('#jev-draft-details')
        assert.ok((await page.locator('#jev-draft-details').innerText()).includes(recordedAnswer))
      }
      await page.locator('#new-project').click()
      await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
      assert.match(await page.locator('#confirm-description').innerText(), /separate replacement proposal/i)
      assert.match(await page.locator('#confirm-description').innerText(), /not included in a current project download/i)
      await page.locator('#confirm-dialog [value="cancel"]').click()
      await assertProposal()
      const bundle = await download('active-project-only.zip')
      assert.equal(JSON.parse(bundle.archive.get('project.json')).project.purpose, currentResult)
      for (const text of bundle.archive.values()) {
        assert.equal(text.includes(proposal), false)
        assert.equal(text.includes(recordedAnswer), false)
        assert.equal(text.includes(unfinishedAnswer), false)
      }
      await page.locator('[data-close-dialog="download-dialog"]').click()
      await page.locator('#new-project').click()
      await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
      await page.locator('#confirm-dialog [value="cancel"]').click()
      await assertProposal()
      await page.locator('#import-config').click()
      await page.locator('#import-file').setInputFiles(downloadedPack.filePath)
      await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
      await page.locator('#confirm-dialog [value="cancel"]').click()
      await assertProposal()
      await page.locator('#new-project').click()
      await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
      assert.equal(await page.locator('#download-before-replace').isVisible(), false)
      assert.equal(await page.locator('#confirm-dialog [value="replace"]').innerText(), 'Discard proposal and replace')
      await page.locator('#confirm-dialog [value="replace"]').click()
      await page.locator('#start-screen').waitFor({ state: 'visible' })
      assert.equal(await page.locator('#jev-brief').inputValue(), '')
      return 'An active replacement proposal keeps its separate description, recorded answer and unfinished answer after cancelling New or Open. Downloaded project ZIP bytes contain only accepted project decisions. Downloading the current project does not clear the separate-proposal warning. Only explicit Discard proposal and replace clears this work.'
    })
    await check('10j-active-proposal-warns-before-browser-reload', async () => {
      await openZip(downloadedPack.filePath)
      await briefView(page)
      await page.locator('[data-studio-action="review-suggestion"]').click()
      const proposal = 'This separate description must survive cancelling a browser reload.'
      await page.locator('#jev-brief').fill(proposal)
      const leavePrompt = page.waitForEvent('dialog', { timeout: 3000 })
      const navigation = page.reload({ waitUntil: 'domcontentloaded', timeout: 3000 }).catch(error => error.message)
      const dialog = await leavePrompt
      assert.equal(dialog.type(), 'beforeunload')
      await dialog.dismiss()
      await navigation
      assert.equal(await page.locator('#jev-brief').inputValue(), proposal)
      assert.equal(await page.locator('#studio-layout').isVisible(), true)
      return 'Chrome raised the real beforeunload dialog for a separate proposal on an otherwise clean opened project. Cancelling reload preserved the typed description and active project.'
    })
    await check('10k-unconfirmed-reuse-wording-protects-an-accepted-session', async () => {
      await fresh()
      await suggest('Add saved searches. Save retains filters. Scope is the existing search view.', 'covered')
      await createDraft()
      await download('accepted-before-reuse-edit.zip')
      await page.locator('[data-close-dialog="download-dialog"]').click()
      await briefView(page)
      await expand('#active-suggestion')
      await expand('#jev-covered-acceptance')
      const wording = 'Separate unconfirmed wording changed after the original draft was accepted.'
      await page.locator('#jev-wording-acceptance').fill(wording)
      await page.locator('#new-project').click()
      await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
      assert.match(await page.locator('#confirm-description').innerText(), /separate replacement proposal/i)
      await page.locator('#confirm-dialog [value="cancel"]').click()
      assert.equal(await page.locator('#jev-wording-acceptance').inputValue(), wording)
      const bundle = await download('accepted-project-with-separate-reuse-edit.zip')
      for (const text of bundle.archive.values()) assert.equal(text.includes(wording), false)
      return 'Editing the separate reuse-answer textarea after the original suggestion was accepted is protected even though that text is intentionally not a recorded controller answer. Cancelling preserves it. Actual accepted-project ZIPs exclude it.'
    })
    await check('10l-hosted-active-project-has-a-manual-replacement-path', async () => {
      const { buildStatic, PUBLIC_ASSETS } = await import(pathToFileURL(path.join(root, 'tools/build-static.mjs')).href)
      const bundle = await buildStatic({ rootDir: root, knownSecrets: [] })
      const prefix = '/workflow-atlas/'
      const allowed = new Set(PUBLIC_ASSETS)
      const types = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/plain', '.txt': 'text/plain' }
      const staticServer = http.createServer(async (request, response) => {
        try {
          const pathname = new URL(request.url, 'http://localhost').pathname
          if (request.method !== 'GET' || !pathname.startsWith(prefix)) { response.writeHead(404).end('Not found'); return }
          let relative = decodeURIComponent(pathname.slice(prefix.length))
          if (!relative || relative.endsWith('/')) relative += 'index.html'
          if (!allowed.has(relative)) { response.writeHead(404).end('Not found'); return }
          const bytes = await fs.readFile(path.join(bundle.output, ...relative.split('/')))
          response.writeHead(200, { 'Content-Type': `${types[path.extname(relative)] || 'application/octet-stream'}; charset=utf-8` }).end(bytes)
        } catch { response.writeHead(500).end('Static trial error') }
      })
      await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve))
      const originalBase = base
      const origin = `http://127.0.0.1:${staticServer.address().port}`
      base = `${origin}${prefix}factory/`
      const unexpectedRequests = []
      const before = received
      try {
        await fresh()
        await context.route('**/*', route => {
          const url = new URL(route.request().url())
          if (url.pathname.includes('/api/') || (url.protocol.startsWith('http') && url.origin !== origin)) {
            unexpectedRequests.push(url.origin + url.pathname)
            return route.abort()
          }
          return route.continue()
        })
        assert.equal(await page.locator('html').getAttribute('data-atlas-hosting'), 'static')
        const currentResult = 'Plan an ordinary reporting feature for the existing staff view.'
        await page.locator('#jev-brief').fill(currentResult)
        await page.locator('[data-start-recipe="feature-delivery"]').click()
        await createDraft()
        await briefView(page)
        await page.locator('[data-studio-action="review-suggestion"]').click()
        assert.equal(await page.locator('#active-suggestion [data-review-recipe]').count(), 3)
        const proposal = 'Investigate whether a separate reporting integration is feasible.'
        await page.locator('#jev-brief').fill(proposal)
        await page.locator('[data-review-recipe="feasibility"]').click()
        assert.match(await page.locator('#jev-proposal-title').innerText(), /Feasibility/)
        assert.equal(await page.locator('#recipe-choice').inputValue(), 'feature-delivery')
        assert.equal(await page.locator('#project-purpose').inputValue(), currentResult)
        await page.locator('#jev-next-answer').fill('Today staff read the report manually in the existing view.')
        await page.locator('[data-jev-action="answer"]').click()
        await page.locator('#jev-create').click()
        await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
        await page.locator('#confirm-dialog [value="cancel"]').click()
        assert.equal(await page.locator('#recipe-choice').inputValue(), 'feature-delivery')
        assert.equal(await page.locator('#project-purpose').inputValue(), currentResult)
        assert.equal(await page.locator('#jev-brief').inputValue(), proposal)
        await page.locator('#jev-create').click()
        await page.locator('#confirm-dialog [value="replace"]').click()
        await page.waitForFunction(() => document.querySelector('#recipe-choice')?.value === 'feasibility')
        assert.equal(await page.locator('#project-purpose').inputValue(), proposal)
        assert.equal(await page.locator('[data-field="workflow.answers.current-work"]').inputValue(), 'Today staff read the report manually in the existing view.')
        assert.equal(received, before)
        assert.deepEqual(unexpectedRequests, [])
        await page.screenshot({ path: path.join(output, 'hosted-manual-replacement.png'), fullPage: true })
        return { observation: 'The actual allowlisted static build under /workflow-atlas/ offers three supported manual replacement workflows. Selection only creates a proposal. Cancelling Create keeps the current project and proposal. Explicit replacement applies the proposed result and recorded answer without any API or provider request.', build: { files: bundle.files, credentialFindings: bundle.credentialFindings } }
      } finally {
        base = originalBase
        await context?.close()
        context = null
        page = null
        await new Promise(resolve => staticServer.close(resolve))
      }
    })
    for (const theme of ['light', 'dark']) {
      await check(`11-responsive-keyboard-${theme}`, async () => {
        await fresh({ width: 320, height: 800 })
        await setTheme(theme)
        const first = await noOverflow()
        const tabCount = await focusWithTab('jev-brief')
        await page.keyboard.type('Add a status filter. Scope is the request list only.')
        await focusWithTab('jev-submit')
        mode = 'feature'
        await page.keyboard.press('Enter')
        await page.locator('#jev-create').waitFor({ state: 'visible' })
        const proposal = await noOverflow()
        assert.equal(await page.locator('#jev-status').getAttribute('role'), 'status')
        assert.equal(await page.locator('#jev-status').getAttribute('aria-live'), 'polite')
        await focusWithTab('jev-next-answer')
        await page.keyboard.type('Open shows only open requests.', { delay: 2 })
        assert.equal(await page.locator('#jev-next-answer').inputValue(), 'Open shows only open requests.')
        await page.keyboard.press('Tab')
        await page.keyboard.press('Enter')
        await focusWithTab('jev-create')
        await page.keyboard.press('Enter')
        await page.locator('#studio-layout').waitFor({ state: 'visible' })
        const created = await noOverflow()
        await focusWithTab('download-project')
        await page.keyboard.press('Enter')
        await page.locator('#download-dialog').waitFor({ state: 'visible' })
        const dialog = await noOverflow()
        await page.keyboard.press('Escape')
        await page.locator('#download-dialog').waitFor({ state: 'hidden' })
        return { theme, reducedMotion: 'reduce', initialTabsToBrief: tabCount, first, proposal, created, dialog, keyboardActions: 'Tab to brief, type, submit, optional answer, record, create, open download and Escape.' }
      })
    }
    await check('12-browser-errors-and-storage', async () => {
      for (const frame of page.frames()) evidence.storageWrites.push(...await frame.evaluate(() => window.__atlasStorageWrites || []).catch(() => []))
      assert.deepEqual(evidence.errors, [])
      assert.deepEqual(evidence.storageWrites, [])
      const unexpected = evidence.console.filter(item => !/^Failed to load resource: the server responded with a status of (429|502|503|504)/.test(item.message))
      assert.deepEqual(unexpected, [])
      return 'No browser page errors or browser storage writes observed. Deliberate failing API HTTP responses produced expected browser resource messages.'
    })
    await check('13-source-stability', async () => {
      evidence.sourcesAfter = await sourceHashes()
      assert.deepEqual(evidence.sourcesAfter, evidence.sourcesBefore, 'Application source changed during the run. Repeat against stable final source.')
      return { unchangedInspectedFiles: evidence.sourcesAfter.length }
    })
  } finally {
    await persist()
    await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
  process.stdout.write(`Evidence: ${output}\n`)
  if (evidence.checks.some(check => check.status !== 'Pass')) process.exitCode = 1
}

main().catch(async error => {
  evidence.fatalError = error.stack || String(error)
  await persist().catch(() => {})
  await browser?.close().catch(() => {})
  if (server) { server.closeAllConnections(); server.close() }
  process.stderr.write(String(error) + '\n')
  process.exitCode = 1
})
