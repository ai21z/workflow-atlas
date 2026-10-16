const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const http = require('node:http')
const path = require('node:path')
const { createHash } = require('node:crypto')
const { pathToFileURL } = require('node:url')
const { briefView, closeWorkspaceDetails } = require('./browser-workspace-helpers.cjs')

let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright')) }

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'local-knowledge/retests/brief-suggestions', new Date().toISOString().replace(/[:.]/g, '-'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const wanted = 'Add a status filter to the request list. Define requirements and acceptance scenarios before implementation. Make the smallest necessary change.'
const acceptance = 'Open shows only open requests. All shows every request.'
const report = {
  startedAt: new Date().toISOString(),
  method: 'Installed Chrome through public controls and actual ZIP downloads and file chooser imports. The local server uses an injected synthetic provider. No application state injection, live inference or real credentials.',
  limits: 'Functional browser simulation, not a human comprehension study, live model quality evaluation, screen reader audit or real touch device test. Synthetic request timing is not JEV performance.',
  checks: [], errors: [], downloads: [], requests: [], providerRequests: [], storageWrites: [],
}
let browser, context, page, server, base, contract, unzipTextFiles, projection, sourceLine
let mode = 'relevant', keyAvailable = true, received = 0, clockOffset = 0, releaseSlow = null

function mockPayload(request, outcome) {
  const selected = {
    intent: 'feature-delivery',
    practice: outcome === 'insufficient-context' ? 'insufficient-context' : 'relevant',
    practice_need: outcome === 'insufficient-context' ? 'not-established' : 'established',
    practice_boundary: outcome === 'not-relevant' ? 'rejected' : 'not-rejected',
  }
  return {
    model: contract.MODEL,
    answers: Object.fromEntries(Object.entries(request.questions).map(([id, question]) => {
      const choice = selected[id] || 'missing'
      assert.ok(Object.hasOwn(question.criteria, choice), `${id} has no ${choice} choice`)
      return [id, { type: 'choice', choice, confidence: 1, probabilities: Object.fromEntries(Object.keys(question.criteria).map(key => [key, key === choice ? 1 : 0])) }]
    })),
    usage: { input_tokens: 200, output_tokens: 0 },
  }
}

async function provider(request, { signal }) {
  received += 1
  const current = mode
  const record = { mode: current, state: structuredClone(request.state), questions: Object.keys(request.questions), cancelled: false }
  report.providerRequests.push(record)
  signal.addEventListener('abort', () => { record.cancelled = true }, { once: true })
  if (current === 'slow') await new Promise(resolve => { releaseSlow = resolve })
  return { payload: mockPayload(request, current), metadata: { attempts: 1, providerElapsedMs: 1 } }
}

async function persist() {
  report.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n')
  const passed = report.checks.filter(item => item.status === 'Pass').length
  await fs.writeFile(path.join(output, 'report.md'), [
    '# Brief suggestions browser regression', '', report.method, '', report.limits, '',
    `Observed checks: ${passed}/${report.checks.length} passed.`,
    `Browser page errors: ${report.errors.length}. Observed storage writes: ${report.storageWrites.length}.`, '',
    ...report.checks.map(item => `- ${item.id}: ${item.status}${item.error ? `. ${item.error.split('\n')[0]}` : ''}`), '',
    'Detailed observations and synthetic request bodies are in results.json. ZIP files are the exact browser downloads. Screenshots use fictional project text.', '',
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

async function fresh({ width = 1440, height = 1000, url = base, staticOrigin, prepareContext } = {}) {
  clockOffset += 60_001
  if (context) {
    const writes = await page.evaluate(() => window.__atlasStorageWrites || []).catch(() => [])
    report.storageWrites.push(...writes)
    await context.close()
  }
  context = await browser.newContext({ viewport: { width, height }, acceptDownloads: true, reducedMotion: 'reduce' })
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
  if (staticOrigin) await context.route('**/*', route => {
    const address = new URL(route.request().url())
    if (/^https?:$/.test(address.protocol) && address.origin !== staticOrigin) return route.abort()
    return route.continue()
  })
  if (prepareContext) await prepareContext(context)
  page = await context.newPage()
  page.setDefaultTimeout(10000)
  page.on('pageerror', error => report.errors.push(error.message))
  page.on('request', request => {
    if (request.url().includes('/api/')) report.requests.push({ url: request.url(), method: request.method(), body: request.postDataJSON(), static: Boolean(staticOrigin) })
  })
  await page.goto(url)
  await page.locator('#start-screen').waitFor({ state: 'visible' })
}

async function createDraft(brief = wanted) {
  await page.locator('#jev-brief').fill(brief)
  await page.locator('[data-start-recipe="feature-delivery"]').click()
  await page.locator('#jev-create').click()
  await page.locator('#project-name').waitFor({ state: 'visible' })
  await page.locator('#project-name').fill('Request filter review')
  await page.locator('#project-purpose').waitFor({ state: 'visible' })
  assert.equal(await page.locator('#project-purpose').inputValue(), brief)
  await page.locator('[data-field="workflow.answers.acceptance"]').fill(acceptance)
  await page.locator('#brief-suggestions [data-practice-suggestion]').first().waitFor({ state: 'visible' })
}

async function expand(selector) {
  const detail = page.locator(selector)
  if (await detail.getAttribute('open') === null) await detail.locator(':scope > summary').click()
}

async function download(name) {
  await closeWorkspaceDetails(page)
  await page.locator('#download-project').click()
  await page.locator('[data-output-kind="pack"]').check()
  const waiting = page.waitForEvent('download')
  await page.locator('[data-studio-action="download-output"]').click()
  const downloaded = await waiting
  const filePath = path.join(output, `${name}.zip`)
  await downloaded.saveAs(filePath)
  assert.equal(await downloaded.failure(), null)
  const bytes = await fs.readFile(filePath)
  const { files } = await unzipTextFiles(new Uint8Array(bytes))
  const archive = new Map(files.map(file => [file.path, file.content]))
  report.downloads.push({ name, bytes: bytes.length, sha256: sha(bytes), files: [...archive.keys()] })
  await page.locator('[data-close-dialog="download-dialog"]').click()
  return { filePath, archive, project: JSON.parse(archive.get('project.json')) }
}

async function startAssessment(outcome = 'relevant') {
  mode = outcome
  await expand('#brief-suggestions [data-detail="fit"]')
  const before = received
  await page.locator('#brief-suggestions [data-assess-idea]').click()
  await page.waitForFunction(() => document.querySelector('.brief-fit-result')?.textContent.includes('JEV suggests') || document.querySelector('.brief-fit-result')?.textContent.includes('JEV needs'))
  assert.equal(received, before + 1)
}

async function noOverflow() {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth }))
  assert.ok(size.document <= size.viewport + 1, JSON.stringify(size))
  return size
}

async function sourceHashes() {
  const files = ['factory/app.mjs', 'factory/index.html', 'factory/workspace.css', 'factory/knowledge-query.mjs', 'factory/brief-suggestions.mjs', 'factory/brief-suggestions-view.mjs', 'factory/jev-assistance.mjs', 'factory/jev-contract.mjs', 'tools/serve.mjs', 'tools/public-assets.json']
  return Promise.all(files.map(async relative => ({ path: relative, sha256: sha(await fs.readFile(path.join(root, relative))) })))
}

async function main() {
  await fs.mkdir(output, { recursive: true })
  contract = await import(pathToFileURL(path.join(root, 'factory/jev-contract.mjs')).href)
  ;({ unzipTextFiles } = await import(pathToFileURL(path.join(root, 'factory/zip.mjs')).href))
  ;({ sourceLine } = await import(pathToFileURL(path.join(root, 'factory/knowledge-query.mjs')).href))
  projection = await (await import(pathToFileURL(path.join(root, 'tools/atlas-query.mjs')).href)).loadProjection(root)
  const { createAtlasServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href)
  server = await createAtlasServer({ rootDir: root, getApiKey: () => keyAvailable ? 'synthetic-local-trial-key' : '', transport: provider, now: () => performance.now() + clockOffset })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}/factory/`
  browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
  report.browser = browser.version()
  report.driverSha256 = sha(await fs.readFile(__filename))
  report.sourcesBefore = await sourceHashes()
  try {
    await check('01-reading-before-project-and-reviewed-practices', async () => {
      await fresh()
      await page.locator('#jev-brief').fill(wanted)
      await page.locator('#brief-suggestions').waitFor({ state: 'visible' })
      assert.match(await page.locator('#brief-suggestions').innerText(), /Create a draft to review practices/)
      assert.equal(await page.locator('[data-practice-suggestion]').count(), 0)
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      await createDraft()
      const count = await page.locator('#brief-suggestions [data-practice-suggestion]').count()
      assert.ok(count > 0 && count <= 3)
      assert.match(await page.locator('#brief-suggestions').innerText(), /Matched locally. Review before adding/)
      const reasons = await page.locator('#brief-suggestions .brief-idea-reason').allTextContents()
      assert.ok(reasons.every(reason => reason.startsWith('Your text ') && reason.endsWith('.')), 'Each visible reason is a sentence tied to the supplied text')
      assert.match(await page.locator('[data-practice-suggestion="minimum-change"] .brief-idea-reason').innerText(), /software change|smallest necessary change/u, 'The minimum-change reason explains this software task')
      assert.match(await page.locator('[data-practice-suggestion="specification-first"] .brief-idea-reason').innerText(), /requirements/u, 'The requirements reason explains the selected practice')
      // Expect the recorded status of the topic behind the practice, so a later source review does not stale this check.
      const specificationTopic = await page.locator('[data-practice-suggestion="specification-first"] [data-review-idea]').getAttribute('data-review-idea')
      const specificationNode = projection.nodes.find(node => node.id === specificationTopic)
      assert.equal(await page.locator('[data-practice-suggestion="specification-first"] .brief-idea-source').innerText(), sourceLine({ ...specificationNode.catalog, sourceRefs: specificationNode.refs }), 'The source line repeats the recorded review status of the practice topic')
      const sourceLines = await page.locator('#brief-suggestions .brief-idea-source').allTextContents()
      assert.ok(sourceLines.every(line => !/without claim review, 0 sources/u.test(line)), 'A topic with no sources must not claim retained references')
      assert.equal(received, 0)
      return { count, titles: await page.locator('#brief-suggestions h3').allTextContents(), reasons, providerRequests: received }
    })

    await check('02-review-cancel-and-apply-only-on-confirmation', async () => {
      await fresh()
      await createDraft()
      const baseline = await download('before-review')
      await briefView(page)
      const card = page.locator('#brief-suggestions [data-practice-suggestion]').first()
      const selected = await card.getAttribute('data-practice-suggestion')
      await card.locator('[data-review-idea]').click()
      await page.locator('#practice-dialog').waitFor({ state: 'visible' })
      assert.match(await page.locator('#practice-preview').innerText(), /Select the existing reference practice/)
      await page.getByRole('button', { name: 'Keep my workflow unchanged', exact: true }).click()
      const cancelled = await download('after-cancel')
      assert.deepEqual(cancelled.project, baseline.project)
      await briefView(page)
      await page.locator(`[data-practice-suggestion="${selected}"] [data-review-idea]`).click()
      await page.locator('#apply-practice').click()
      assert.equal(await page.locator('.main-navigation [aria-current="page"]').innerText(), 'Brief')
      assert.equal(await page.locator('#project-purpose').inputValue(), wanted)
      await page.locator(`[data-practice-suggestion="${selected}"]`).waitFor({ state: 'detached' })
      const applied = await download('after-apply')
      assert.ok(applied.project.practices.includes(selected))
      assert.equal(applied.project.workflow.answers.acceptance, acceptance)
      assert.match(applied.archive.get('WORKFLOW.md'), /Open shows only open requests/)
      assert.ok(!JSON.stringify([...applied.archive]).includes('synthetic-local-trial-key'))
      await fresh()
      await page.locator('#import-config').click()
      const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-studio-action="choose-project-file"]').click()])
      await chooser.setFiles(applied.filePath)
      await page.locator('#project-name').waitFor({ state: 'visible' })
      await briefView(page)
      assert.equal(await page.locator('#project-purpose').inputValue(), wanted)
      const reopened = await download('reopened')
      assert.deepEqual(reopened.project, applied.project)
      return { selected, exactProjectRestored: true, actualZipDownloads: 4 }
    })

    await check('03-related-reading-keeps-the-project', async () => {
      await fresh()
      await createDraft()
      const topic = await page.locator('#brief-suggestions [data-read-idea]').first().getAttribute('data-read-idea')
      await page.locator('#brief-suggestions [data-read-idea]').first().click()
      await page.locator('#knowledge-workspace').waitFor({ state: 'visible' })
      const frame = page.frameLocator('#knowledge-frame')
      await frame.locator('#knowledge-back').waitFor({ state: 'visible' })
      await page.locator('.main-navigation [data-main-view="brief"]').click()
      assert.equal(await page.locator('#project-purpose').inputValue(), wanted)
      assert.equal(await page.locator('[data-field="workflow.answers.acceptance"]').inputValue(), acceptance)
      return { topic, purposeAndAcceptancePreserved: true }
    })

    for (const [outcome, label] of [['relevant', 'JEV suggests this fits'], ['not-relevant', 'JEV suggests this does not fit'], ['insufficient-context', 'JEV needs more context']]) {
      await check(`04-assessment-${outcome}`, async () => {
        await fresh()
        await createDraft()
        const baseline = await download(`before-${outcome}`)
        await briefView(page)
        await expand('#brief-suggestions [data-detail="fit"]')
        await expand('#brief-suggestions [data-detail="sent"]')
        assert.match(await page.locator('#brief-suggestions [data-detail="sent"]').innerText(), /Open shows only open requests/)
        await startAssessment(outcome)
        assert.equal(await page.locator('.brief-fit-result').innerText(), label)
        assert.equal(await page.locator('.brief-fit-result').evaluate(element => element === document.activeElement), true, 'Completion moves focus from the removed cancel control to the result')
        assert.equal(await page.locator('[data-assess-idea]').isDisabled(), true)
        const body = report.requests.filter(item => item.method === 'POST').at(-1).body
        assert.deepEqual(Object.keys(body).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
        assert.equal(body.userBrief, wanted)
        assert.deepEqual(body.suppliedProjectAnswers, { acceptance, 'user-need': wanted })
        assert.ok(contract.SUPPORTED_PRACTICES.includes(body.practiceId))
        const providerState = report.providerRequests.at(-1).state
        assert.deepEqual(providerState, { userBrief: wanted, suppliedProjectAnswers: body.suppliedProjectAnswers })
        const after = await download(`after-${outcome}`)
        assert.deepEqual(after.project, baseline.project)
        return { outcome, payloadKeys: Object.keys(body), noAutomaticAdoption: true }
      })
    }

    for (const recovery of ['edit', 'cancel', 'import']) await check(`05-stale-assessment-${recovery}`, async () => {
      await fresh()
      await createDraft()
      const original = recovery === 'import' ? await download('before-stale-import') : null
      if (original) {
        await briefView(page)
        await page.locator('#project-purpose').fill(`${wanted} Explain the chosen change.`)
        await page.locator('#brief-suggestions').waitFor({ state: 'visible' })
        await page.waitForFunction(() => document.querySelector('#brief-suggestions')?.getAttribute('aria-busy') === 'false')
      }
      mode = 'slow'
      releaseSlow = null
      await expand('#brief-suggestions [data-detail="fit"]')
      const before = received
      await page.locator('[data-assess-idea]').click()
      await page.waitForFunction(() => document.querySelector('[data-cancel-fit]'))
      assert.equal(await page.locator('[data-cancel-fit]').evaluate(element => element === document.activeElement), true, 'An explicit request moves focus to its cancel control')
      const deadline = Date.now() + 3000
      while (received === before && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 10))
      assert.equal(received, before + 1)
      if (recovery === 'edit') await page.locator('#project-purpose').fill(`${wanted} Keep a source backed project wiki.`)
      else if (recovery === 'cancel') await page.locator('[data-cancel-fit]').click()
      else {
        await page.locator('#import-config').click()
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator('[data-studio-action="choose-project-file"]').click()])
        await chooser.setFiles(original.filePath)
        await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
        await page.locator('#confirm-dialog [value="replace"]').click()
        await page.locator('#confirm-dialog').waitFor({ state: 'hidden' })
        await briefView(page)
        assert.equal(await page.locator('#project-purpose').inputValue(), wanted)
      }
      await page.locator('[data-cancel-fit]').waitFor({ state: 'detached' })
      releaseSlow()
      releaseSlow = null
      await page.waitForFunction(() => !document.querySelector('.brief-fit-result')?.textContent.includes('Checking fit'))
      assert.doesNotMatch(await page.locator('#brief-suggestions').innerText(), /JEV suggests this fits/)
      assert.match(await page.locator('#project-purpose').inputValue(), /smallest necessary change/)
      return { recovery, responseDiscarded: true }
    })

    await check('06-unclear-and-explicit-exclusion', async () => {
      await fresh()
      await createDraft()
      await page.locator('#project-purpose').fill('Make the smallest necessary change. Do not create or maintain a project wiki.')
      await page.locator('#brief-suggestions .brief-exclusion-note').waitFor({ state: 'visible' })
      assert.equal(await page.locator('[data-practice-suggestion="evidence-wiki"]').count(), 0)
      await page.locator('[data-field="workflow.answers.acceptance"]').fill('')
      await page.locator('#project-purpose').fill('Plan a flight and hotel for a holiday.')
      await page.waitForFunction(() => document.querySelectorAll('#brief-suggestions [data-practice-suggestion]').length === 0)
      assert.match(await page.locator('#brief-suggestions').innerText(), /No clear additional practice/)
      return { excludedWiki: true, unrelatedBriefAbstains: true }
    })

    await check('07-local-unavailable-and-offline-reading', async () => {
      keyAvailable = false
      await fresh()
      await createDraft()
      await page.locator('.brief-fit-setup').waitFor({ state: 'visible' })
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      await context.setOffline(true)
      await page.locator('#project-purpose').fill('Make the smallest necessary change to the filter. Run verification loops.')
      await page.locator('#brief-suggestions [data-practice-suggestion]').first().waitFor({ state: 'visible' })
      assert.ok(await page.locator('#brief-suggestions [data-review-idea]').count() > 0)
      await context.setOffline(false)
      keyAvailable = true
      return { localCatalogueWorksOfflineAfterLoad: true, unavailableAssessmentHidden: true }
    })

    await check('08-responsive-themes-and-keyboard', async () => {
      await fresh()
      await createDraft()
      const observations = []
      for (const width of [1440, 768, 390, 320]) {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 })
        for (const theme of ['light', 'dark']) {
          if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click()
          observations.push({ width, theme, ...await noOverflow() })
          await page.screenshot({ path: path.join(output, `brief-${width}-${theme}.png`), fullPage: true })
        }
      }
      await page.setViewportSize({ width: 1440, height: 1000 })
      await page.locator('#project-purpose').focus()
      await page.keyboard.press('Tab')
      const matchingSummary = page.locator('#brief-suggestions [data-detail="matching"] > summary')
      assert.equal(await matchingSummary.evaluate(element => element === document.activeElement), true)
      await page.keyboard.press('Enter')
      assert.equal(await page.locator('#brief-suggestions [data-knowledge-question]').isVisible(), true)
      await page.keyboard.press('Enter')
      assert.equal(await page.locator('#brief-suggestions [data-knowledge-question]').isVisible(), false)
      await page.keyboard.press('Tab')
      assert.equal(await page.locator('#brief-suggestions [data-review-idea]').first().evaluate(element => element === document.activeElement), true)
      const title = await page.locator('#brief-suggestions h3').first().innerText()
      assert.equal(await page.getByRole('button', { name: `Review practice: ${title}`, exact: true }).count(), 1)
      await page.keyboard.press('Enter')
      await page.locator('#practice-dialog').waitFor({ state: 'visible' })
      await page.keyboard.press('Escape')
      await page.locator('#practice-dialog').waitFor({ state: 'hidden' })
      assert.equal(await page.locator('#brief-suggestions [data-review-idea]').first().evaluate(element => element === document.activeElement), true)
      return { observations, keyboardReviewAndEscape: true }
    })

    await check('09-summary-focus-survives-availability-render', async () => {
      let releaseStatus
      const ready = new Promise(resolve => { releaseStatus = resolve })
      await fresh({ prepareContext: async current => current.route('**/api/jev/status', async route => {
        await ready
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true }) }).catch(() => {})
      }) })
      await createDraft()
      const summary = page.locator('#brief-suggestions [data-detail="fit"] > summary')
      await summary.click()
      assert.equal(await summary.evaluate(element => element === document.activeElement), true)
      const response = page.waitForResponse(item => item.url().endsWith('/api/jev/status'))
      releaseStatus()
      await response
      await page.locator('[data-assess-idea]').waitFor({ state: 'visible' })
      await page.waitForFunction(() => !document.querySelector('[data-assess-idea]')?.disabled)
      assert.equal(await page.locator('#brief-suggestions [data-detail="fit"] > summary').evaluate(element => element === document.activeElement), true)
      assert.notEqual(await page.locator('#brief-suggestions [data-detail="fit"]').getAttribute('open'), null)
      return { detailsRemainOpen: true, summaryFocusPreserved: true }
    })

    await check('10-catalogue-failure-survives-availability-render', async () => {
      let releaseStatus
      const ready = new Promise(resolve => { releaseStatus = resolve })
      await fresh({ prepareContext: async current => {
        await current.route('**/atlas/data.js', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'Synthetic catalogue unavailable' }))
        await current.route('**/api/jev/status', async route => {
          await ready
          await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ available: true }) }).catch(() => {})
        })
      } })
      await page.locator('#jev-brief').fill(wanted)
      await page.getByText('Related ideas could not be loaded. Your brief and workflow still work.', { exact: true }).waitFor({ state: 'visible' })
      const response = page.waitForResponse(item => item.url().endsWith('/api/jev/status'))
      releaseStatus()
      await response
      await page.locator('[data-start-recipe="feature-delivery"]').click()
      await page.locator('#jev-create').click()
      assert.equal(await page.locator('#project-purpose').inputValue(), wanted)
      await page.getByText('Related ideas could not be loaded. Your brief and workflow still work.', { exact: true }).waitFor({ state: 'visible' })
      return { availabilityDoesNotHideFailure: true, manualDraftStillWorks: true }
    })

    await check('11-static-subpath-no-api-requests', async () => {
      const { buildStatic, PUBLIC_ASSETS } = await import(pathToFileURL(path.join(root, 'tools/build-static.mjs')).href)
      const bundle = await buildStatic({ rootDir: root, knownSecrets: [] })
      const allowed = new Set(PUBLIC_ASSETS)
      const prefix = '/workflow-atlas/'
      const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/plain' }
      const staticServer = http.createServer(async (request, response) => {
        try {
          const pathname = new URL(request.url, 'http://localhost').pathname
          if (request.method !== 'GET' || !pathname.startsWith(prefix)) return response.writeHead(404).end('Not found')
          let relative = decodeURIComponent(pathname.slice(prefix.length))
          if (!relative || relative.endsWith('/')) relative += 'index.html'
          if (!allowed.has(relative)) return response.writeHead(404).end('Not found')
          const bytes = await fs.readFile(path.join(bundle.output, ...relative.split('/')))
          response.writeHead(200, { 'Content-Type': `${mime[path.extname(relative)] || 'application/octet-stream'}; charset=utf-8` }).end(bytes)
        } catch { response.writeHead(500).end('Fixture error') }
      })
      await new Promise(resolve => staticServer.listen(0, '127.0.0.1', resolve))
      const origin = `http://127.0.0.1:${staticServer.address().port}`
      try {
        await fresh({ url: `${origin}${prefix}factory/`, staticOrigin: origin })
        assert.equal(await page.locator('html').getAttribute('data-atlas-hosting'), 'static')
        await createDraft()
        await page.locator('.brief-fit-setup').waitFor({ state: 'visible' })
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        assert.equal(report.requests.filter(item => item.static).length, 0)
        return { actualStaticBuild: bundle.files, apiRequests: 0 }
      } finally { staticServer.closeAllConnections(); await new Promise(resolve => staticServer.close(resolve)) }
    })

    assert.deepEqual(report.errors, [], 'The trial must not emit browser page errors')
    assert.deepEqual(report.storageWrites, [], 'Project and theme edits must remain session only')
  } finally {
    releaseSlow?.()
    if (page && !page.isClosed()) report.storageWrites.push(...await page.evaluate(() => window.__atlasStorageWrites || []).catch(() => []))
    report.sourcesAfter = await sourceHashes()
    report.sourcesChangedDuringRun = JSON.stringify(report.sourcesBefore) !== JSON.stringify(report.sourcesAfter)
    await persist()
    await context?.close()
    await browser?.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
  const failed = report.checks.filter(item => item.status !== 'Pass')
  assert.deepEqual(failed.map(item => item.id), [], 'Every functional browser scenario must pass')
  process.stdout.write(`Brief suggestions: ${report.checks.length} checks passed. Evidence: ${output}\n`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
