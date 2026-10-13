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
const output = path.join(root, 'local-knowledge/retests/ranking-exclusions', new Date().toISOString().replace(/[:.]/g, '-'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const purpose = 'Fetch topics by subject from an approved API, validate the selection and save only after human approval. Define requirements and acceptance scenarios before implementation. Make the smallest necessary change.'
const noMcpPurpose = `${purpose} No MCP.`
const acceptance = 'Only permitted topics from the selected subject appear. An approved selection is saved once. Rejected selections return a rejected outcome.'
const negativeAcceptance = 'Only permitted topics from the selected subject appear. An approved selection is saved once. Rejected selections are not saved.'
const report = {
  startedAt: new Date().toISOString(),
  method: 'Public Chrome controls, actual downloaded ZIP bytes and file chooser reopening. Synthetic local JEV transport, fictional user text and fake credentials. No application state injection or live inference.',
  limits: 'Functional browser simulation and screenshots, not an independent human trial, physical mobile test, screen reader audit, live JEV quality test or latency benchmark.',
  checks: [], downloads: [], requests: [], providerRequests: [], errors: [], storageWrites: [],
}
let browser, context, page, server, base, contract, unzipTextFiles
let clockOffset = 0

async function sourceHashes() {
  const files = ['atlas/data.js', 'factory/app.mjs', 'factory/index.html', 'factory/workspace.css', 'factory/knowledge-query.mjs', 'factory/brief-suggestions.mjs', 'factory/brief-suggestions-view.mjs', 'factory/jev-assistance.mjs', 'factory/jev-contract.mjs', 'tools/serve.mjs']
  return Promise.all(files.map(async name => ({ path: name, sha256: sha(await fs.readFile(path.join(root, name))) })))
}

async function persist() {
  report.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n')
  await fs.writeFile(path.join(output, 'report.md'), [
    '# Ranking and exclusions user journey', '', report.method, '', report.limits, '',
    `Checks passed: ${report.checks.filter(check => check.status === 'Pass').length}/${report.checks.length}.`,
    `Actual ZIP downloads: ${report.downloads.length}. Explicit synthetic assessments: ${report.providerRequests.length}.`, '',
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

async function createDraft(brief = purpose) {
  await page.locator('#jev-brief').fill(brief)
  await page.locator('[data-start-recipe="feature-delivery"]').click()
  await page.locator('#jev-create').click()
  await page.locator('#project-name').waitFor({ state: 'visible' })
  await page.locator('#project-name').fill('Approved topic selection')
  assert.equal(await page.locator('#project-purpose').inputValue(), brief)
  await page.locator('[data-field="workflow.answers.acceptance"]').fill(acceptance)
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
  assert.ok(![...archive.values()].some(content => content.includes('synthetic-ranking-trial-key')))
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
  server = await createAtlasServer({ rootDir: root, getApiKey: () => 'synthetic-ranking-trial-key', transport, now: () => performance.now() + clockOffset })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}/factory/`
  browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
  report.browser = browser.version()
  report.driverSha256 = sha(await fs.readFile(__filename))
  report.sourcesBefore = await sourceHashes()
  try {
    await check('01-api-task-reading-and-no-mcp', async () => {
      await fresh()
      await createDraft()
      const baseline = await ideas()
      assert.ok(baseline.reading.includes('api-stored-data'), 'The API task must surface the API and stored data guide')
      assert.equal(baseline.reading[0], 'api-stored-data', 'Task guidance outranks generic stage accumulation')
      assert.ok(baseline.practices.includes('minimum-change'), 'The smallest change request has an independent practice')
      assert.ok(baseline.practices.includes('specification-first'), 'Requirements before implementation have an independent practice')
      await page.locator('#project-purpose').fill(noMcpPurpose)
      await readySuggestions()
      const constrained = await ideas()
      assert.ok(constrained.reading.includes('api-stored-data'), 'No MCP does not exclude an MCP-optional API guide')
      assert.equal(constrained.reading[0], 'api-stored-data')
      assert.ok(constrained.practices.includes('minimum-change'), 'No MCP does not pause the independent smallest change practice')
      assert.ok(constrained.practices.includes('specification-first'), 'No MCP does not pause the independent requirements practice')
      assert.equal(report.providerRequests.length, 0, 'Local retrieval does not invoke JEV')
      assert.equal(report.requests.filter(request => request.method === 'POST').length, 0)
      await expand('#brief-suggestions [data-detail="reading"]')
      await page.locator('#brief-suggestions .brief-reading [data-read-idea="api-stored-data"]').click()
      await page.locator('#knowledge-workspace').waitFor({ state: 'visible' })
      const reader = page.frameLocator('#knowledge-frame')
      await reader.locator('#reader-title').waitFor({ state: 'visible' })
      assert.match(await reader.locator('#reader-title').innerText(), /API.*stored data/i)
      await briefView(page)
      assert.equal(await page.locator('#project-purpose').inputValue(), noMcpPurpose)
      await expand('#brief-suggestions .brief-constraints')
      assert.match(await page.locator('#brief-suggestions .brief-constraints').innerText(), /MCP is excluded.*do not require it/s)
      await expand('#brief-suggestions [data-detail="reading"]')
      return { baseline, constrained, readingPreservesIntent: true, screenshots: await visualMatrix('no-mcp') }
    })

    await check('02-conditional-acceptance-and-edit-recovery', async () => {
      await fresh()
      await createDraft(noMcpPurpose)
      await page.locator('[data-field="workflow.answers.acceptance"]').fill(negativeAcceptance)
      await readySuggestions()
      const current = await ideas()
      assert.ok(current.practices.includes('minimum-change'), 'A scoped rejection outcome keeps independent smallest change guidance available')
      assert.ok(current.practices.includes('specification-first'), 'A scoped rejection outcome keeps requirements guidance available')
      await expand('#brief-suggestions details[data-detail="requirements"]')
      const requirement = await page.locator('#brief-suggestions details[data-detail="requirements"]').innerText()
      assert.match(requirement, /Requirements from your text/)
      assert.match(requirement, /Rejected selections are not saved/)
      assert.ok(!requirement.includes(purpose), 'The requirement identifies the exact clause instead of repeating the whole brief')
      assert.ok(await page.locator('#brief-suggestions [data-assess-idea]').count() > 0, 'A recognized outcome keeps an optional assessment available')
      assert.equal(report.providerRequests.length, 0, 'Recognizing a requirement does not send inference')
      const screenshots = await visualMatrix('conditional-acceptance')

      const universalAcceptance = negativeAcceptance.replace('Rejected selections are not saved.', 'Selections are not saved.')
      await page.locator('[data-field="workflow.answers.acceptance"]').fill(universalAcceptance)
      await readySuggestions()
      const paused = await ideas()
      assert.deepEqual(paused.practices, [], 'A universal save prohibition remains unresolved and pauses practice suggestions')
      assert.match(await page.locator('#brief-suggestions [data-part-question]').innerText(), /Selections are not saved/)
      assert.equal(await page.locator('#brief-suggestions [data-confirm-part-action="requirement"]').count(), 1, 'The full-source product meaning needs an explicit user confirmation')
      assert.equal(await page.locator('#brief-suggestions [data-clarify-statement]').count(), 0, 'The primary question refers to the complete source, not a detached fragment')
      assert.equal(await page.locator('#brief-suggestions [data-assess-idea]').count(), 0, 'An unresolved universal prohibition cannot offer provider assessment')
      assert.equal(report.providerRequests.length, 0)

      await page.locator('[data-field="workflow.answers.acceptance"]').fill(negativeAcceptance)
      await readySuggestions()
      const restored = await ideas()
      assert.deepEqual(restored.practices, current.practices, 'Restoring the exact scoped outcome restores the same practice suggestions')
      await expand('#brief-suggestions details[data-detail="requirements"]')
      assert.match(await page.locator('#brief-suggestions details[data-detail="requirements"]').innerText(), /Rejected selections are not saved/)
      assert.equal(report.providerRequests.length, 0, 'Editing and recovering suggestions remain entirely local')
      assert.equal(report.requests.filter(request => request.method === 'POST').length, 0)

      const saved = await download('conditional-acceptance', 'blueprint')
      assert.equal(saved.project.workflow.answers.acceptance, negativeAcceptance)
      assert.ok(saved.archive.get('WORKFLOW.md').includes(negativeAcceptance))
      assert.ok(saved.archive.get('templates/REQUIREMENTS.md').includes(negativeAcceptance), 'The requirements scaffold retains the user acceptance wording')
      await reopen(saved.filePath)
      assert.equal(await page.locator('[data-field="workflow.answers.acceptance"]').inputValue(), negativeAcceptance)
      const reopenedIdeas = await ideas()
      assert.deepEqual(reopenedIdeas.practices, current.practices, 'The actual downloaded project restores the recognized outcome and suggestions')
      await expand('#brief-suggestions details[data-detail="requirements"]')
      assert.match(await page.locator('#brief-suggestions details[data-detail="requirements"]').innerText(), /Rejected selections are not saved/)
      const reopened = await download('conditional-acceptance-reopened', 'pack')
      assert.deepEqual(reopened.project, saved.project)
      assert.ok(reopened.archive.get('WORKFLOW.md').includes(negativeAcceptance))
      assert.ok(reopened.archive.get('templates/REQUIREMENTS.md').includes(negativeAcceptance))
      await reopen(reopened.filePath)
      assert.equal(await page.locator('[data-field="workflow.answers.acceptance"]').inputValue(), negativeAcceptance)
      assert.deepEqual((await ideas()).practices, current.practices, 'The full artifact pack also reopens with the same recognized outcome and suggestions')
      const packReopened = await download('conditional-pack-reopened', 'blueprint')
      assert.deepEqual(packReopened.project, saved.project)
      assert.ok(packReopened.archive.get('WORKFLOW.md').includes(negativeAcceptance))
      assert.ok(packReopened.archive.get('templates/REQUIREMENTS.md').includes(negativeAcceptance))
      assert.equal(report.providerRequests.length, 0)
      return { current, requirement, universalAcceptance, paused, restored, reopenedIdeas, exactProjectsReopened: 2, screenshots, limitation: 'A bounded passive rejection outcome is recognized as a requirement. It is preserved text, not an enforced runtime guarantee or general natural language interpretation.' }
    })

    await check('03-unresolved-prohibition-stays-visible', async () => {
      await fresh()
      await createDraft(`${noMcpPurpose} Do not send personal data.`)
      const current = await ideas()
      assert.match(current.text, /personal data/i, 'The unresolved consequential instruction must be visible rather than silently ignored')
      assert.match(current.text, /clarif|paused|check|constraint|exclusion/i, 'The interface explains what still needs review')
      assert.equal(await page.locator('#brief-suggestions [data-assess-idea]').count(), 0, 'An unresolved data-sharing instruction must not offer provider assessment')
      assert.equal(report.providerRequests.length, 0)
      assert.equal(report.requests.filter(request => request.method === 'POST').length, 0)
      const saved = await download('unresolved-data-boundary', 'blueprint')
      assert.equal(saved.project.project.purpose, `${noMcpPurpose} Do not send personal data.`)
      assert.ok(saved.archive.get('WORKFLOW.md').includes('Do not send personal data.'))
      await briefView(page)
      return { current, intentRetainedInDownload: true, screenshots: await visualMatrix('unresolved-data') }
    })

    await check('04-explicit-assessment-keeps-frozen-boundary', async () => {
      await fresh()
      await createDraft(noMcpPurpose)
      await page.locator('[data-field="workflow.answers.acceptance"]').fill(negativeAcceptance)
      await readySuggestions()
      assert.equal(report.providerRequests.length, 0)
      await expand('#brief-suggestions [data-detail="fit"]')
      await expand('#brief-suggestions [data-detail="sent"]')
      assert.match(await page.locator('#brief-suggestions [data-detail="sent"]').innerText(), /Only permitted topics/)
      await page.locator('#brief-suggestions [data-assess-idea]').click()
      await page.waitForFunction(() => document.querySelector('.brief-fit-result')?.textContent === 'JEV suggests this fits')
      assert.equal(report.providerRequests.length, 1)
      const request = report.requests.filter(request => request.method === 'POST').at(-1).body
      assert.deepEqual(Object.keys(request).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
      assert.equal(request.userBrief, noMcpPurpose)
      assert.deepEqual(request.suppliedProjectAnswers, { acceptance: negativeAcceptance, 'user-need': noMcpPurpose })
      assert.ok(contract.SUPPORTED_PRACTICES.includes(request.practiceId))
      assert.deepEqual(report.providerRequests[0].state, { userBrief: noMcpPurpose, suppliedProjectAnswers: request.suppliedProjectAnswers })
      assert.doesNotMatch(JSON.stringify(request), /sourceLine|sourceStatus|graphReasons|catalogue|definitionRefs|api-stored-data|conditional-outcome|"requirements"/)
      return { request, providerState: report.providerRequests[0].state, explicitSyntheticAssessmentOnly: true }
    })

    await check('05-stage-removals-practice-review-download-and-reopen', async () => {
      await fresh()
      await createDraft(noMcpPurpose)
      await page.locator('[data-practice-suggestion="minimum-change"] [data-review-idea]').click()
      await page.locator('#practice-dialog').waitFor({ state: 'visible' })
      assert.match(await page.locator('#practice-preview').innerText(), /Select the existing reference practice/)
      await page.locator('#apply-practice').click()
      await page.locator('[data-practice-suggestion="minimum-change"]').waitFor({ state: 'detached' })
      await workflowView(page)
      const stages = await page.locator('[data-select-stage]').evaluateAll(elements => [...new Set(elements.map(element => element.dataset.selectStage))])
      assert.ok(stages.length > 0)
      for (const stage of stages) {
        await page.locator(`[data-select-stage="${stage}"]`).first().click()
        await page.locator(`[data-stage="${stage}"]`).uncheck()
        await closeWorkspaceDetails(page)
      }
      await briefView(page)
      await readySuggestions()
      const withoutStages = await ideas()
      assert.ok(!withoutStages.practices.includes('specification-first'), 'Removing requirements also removes its stage-scoped practice suggestion')
      assert.ok(withoutStages.reading.includes('api-stored-data'), 'Explicit API wording can still supply useful reading without selected stages')
      assert.equal(report.providerRequests.length, 1, 'Reviewing, editing and downloading do not trigger another assessment')
      const downloads = []
      for (const kind of ['blueprint', 'pack']) {
        const saved = await download(`stage-free-${kind}`, kind)
        assert.deepEqual(saved.project.workflow.enabledStages, [])
        assert.equal(saved.project.project.purpose, noMcpPurpose)
        assert.equal(saved.project.workflow.answers.acceptance, acceptance)
        assert.ok(saved.project.practices.includes('minimum-change'))
        assert.ok(saved.archive.get('WORKFLOW.md').includes(noMcpPurpose))
        assert.ok(saved.archive.get('WORKFLOW.md').includes(acceptance))
        assert.equal(saved.archive.has('templates/REQUIREMENTS.md'), false, 'Removing the requirements stage does not recreate its scaffold')
        assert.equal(saved.project.runtime.enabled, false)
        assert.equal([...saved.archive.keys()].some(name => /mcp.*\.json$/i.test(name)), false)
        downloads.push(saved)
      }
      assert.deepEqual(downloads[0].project, downloads[1].project)
      for (const [index, saved] of downloads.entries()) {
        await reopen(saved.filePath)
        assert.equal(await page.locator('#project-purpose').inputValue(), noMcpPurpose)
        assert.equal(await page.locator('[data-field="workflow.answers.acceptance"]').inputValue(), acceptance)
        const reopened = await download(`stage-free-reopened-${index}`)
        assert.deepEqual(reopened.project, saved.project, 'The actual downloaded project reopens without changing intent, selections or practices')
      }
      await briefView(page)
      await page.locator('[data-field="workflow.answers.acceptance"]').fill('')
      await page.locator('#project-purpose').fill('Plan a flight and hotel for a holiday.')
      await readySuggestions()
      const unrelated = await ideas()
      assert.deepEqual(unrelated.practices, [])
      assert.deepEqual(unrelated.reading, [], 'No selected stages and an unrelated brief must not recreate the recipe stages as reading evidence')
      assert.equal(report.providerRequests.length, 1)
      return { removedStages: stages, withoutStages, exactProjectsReopened: 2, unrelated }
    })

    await check('06-offline-outcome-omissions-and-reopening', async () => {
      const scenarios = [
        { name: 'offline-checklist', brief: 'Build an offline inspection checklist in our tablet app. Keep the original safety standard passages linked to checklist rules in a maintained project wiki, including future corrections.', acceptance: 'Inspectors must complete checks without a network connection.', expected: ['minimum-change', 'specification-first', 'evidence-wiki'] },
        { name: 'rejected-applications', brief: 'Add a review decision to the grant application screen. Keep the source-backed eligibility decisions in a maintained project wiki.', acceptance: 'Rejected applications are not saved as approved records.', expected: ['minimum-change', 'specification-first', 'evidence-wiki'] },
        { name: 'named-omissions', brief: 'Build the selected barcode scanning flow. Exclude Requirements before implementation and Smallest necessary change from this pack. Keep the original scanner contract passages and future corrections in a maintained project wiki.', acceptance: 'Not agreed yet.', expected: ['evidence-wiki'] },
      ]
      const checks = []
      const requestsBefore = report.providerRequests.length
      for (const scenario of scenarios) {
        await fresh()
        await createDraft(scenario.brief)
        await page.locator('[data-field="workflow.answers.acceptance"]').fill(scenario.acceptance)
        await readySuggestions()
        const current = await ideas()
        assert.deepEqual([...current.practices].sort(), [...scenario.expected].sort(), scenario.name)
        await page.locator('[data-practice-suggestion="evidence-wiki"] [data-review-idea]').click()
        await page.locator('#practice-dialog').waitFor({ state: 'visible' })
        await page.locator('#apply-practice').click()
        await page.locator('[data-practice-suggestion="evidence-wiki"]').waitFor({ state: 'detached' })
        const saved = await download(scenario.name, 'pack')
        assert.equal(saved.project.project.purpose, scenario.brief)
        assert.equal(saved.project.workflow.answers.acceptance, scenario.acceptance)
        assert.ok(saved.project.practices.includes('evidence-wiki'))
        assert.ok(saved.archive.get('WORKFLOW.md').includes(scenario.acceptance))
        assert.ok(saved.archive.get('templates/REQUIREMENTS.md').includes(scenario.acceptance))
        assert.ok(!saved.project.practices.includes('minimum-change'), 'A suggestion is not an accepted decision')
        assert.ok(!saved.project.practices.includes('specification-first'), 'Only the explicitly reviewed wiki is applied')
        await reopen(saved.filePath)
        const reopenedIdeas = await ideas()
        assert.deepEqual([...reopenedIdeas.practices].sort(), scenario.expected.filter(id => id !== 'evidence-wiki').sort())
        const again = await download(scenario.name + '-reopened', 'blueprint')
        assert.deepEqual(again.project, saved.project)
        checks.push({ name: scenario.name, surfaced: current.practices, reopened: reopenedIdeas.practices, exactProject: true })
      }
      assert.equal(report.providerRequests.length, requestsBefore, 'Retrieval, review and downloads remain local')
      return checks
    })

    await check('07-comma-separated-omissions-remain-excluded-after-reopening', async () => {
      const brief = 'Build an invoice preview in our app. Maintain original billing rule evidence and future corrections in a project wiki. Omit Requirements before implementation, Smallest necessary change and Source backed project wiki from this pack.'
      await fresh()
      await createDraft(brief)
      const initial = await ideas()
      assert.deepEqual(initial.practices, [])
      assert.equal(await page.locator('#brief-suggestions [data-assess-idea]').count(), 0)
      const saved = await download('comma-omissions', 'blueprint')
      assert.equal(saved.project.project.purpose, brief)
      for (const id of ['minimum-change', 'specification-first', 'evidence-wiki']) assert.ok(!saved.project.practices.includes(id))
      await reopen(saved.filePath)
      assert.deepEqual((await ideas()).practices, [])
      assert.equal(await page.locator('#project-purpose').inputValue(), brief)
      await page.locator('#project-purpose').fill(brief.split(' Omit ')[0])
      await readySuggestions()
      const restored = await ideas()
      assert.deepEqual([...restored.practices].sort(), ['evidence-wiki', 'minimum-change', 'specification-first'])
      return { initial: initial.practices, reopenedExcluded: true, editingRestores: restored.practices }
    })

    await check('08-leave-out-and-conflicting-instructions-after-pilot', async () => {
      // These wording failures were exposed by the confirmation pilot. This is
      // regression evidence after repair, not another fresh accuracy sample.
      const scenarios = [
        { name: 'leave-wiki-out', brief: 'Add drag and drop ordering to the household budget categories screen. Please leave Source backed project wiki out of this pack. We only want the selected software change and its ordinary delivery work.', excluded: 'evidence-wiki' },
        { name: 'leave-requirements-out', brief: 'Build the animal shelter adoption appointment page. Leave Requirements before implementation out of the exported pack because our team supplies that procedure. Keep the original appointment policy passages and later corrections in a maintained project wiki.', excluded: 'specification-first' },
        { name: 'unresolved-include-omit', brief: 'Build the bakery production count widget. The lead says leave Smallest necessary change out of the pack, while the reviewer says it must be included. Both requests remain unresolved.', paused: true },
      ]
      const results = []
      const requestsBefore = report.providerRequests.length
      for (const scenario of scenarios) {
        await fresh()
        await createDraft(scenario.brief)
        const initial = await ideas()
        if (scenario.excluded) assert.ok(!initial.practices.includes(scenario.excluded), 'A named omission is not suggested')
        if (scenario.paused) {
          assert.deepEqual(initial.practices, [])
          assert.equal(await page.locator('#brief-suggestions [data-assess-idea]').count(), 0)
          assert.match(await page.locator('#brief-suggestions').innerText(), /need clarification|paused/u)
        }
        const saved = await download(scenario.name, 'blueprint')
        assert.equal(saved.project.project.purpose, scenario.brief)
        if (scenario.excluded) assert.ok(!saved.project.practices.includes(scenario.excluded))
        await reopen(saved.filePath)
        assert.equal(await page.locator('#project-purpose').inputValue(), scenario.brief)
        const reopened = await ideas()
        assert.deepEqual(reopened.practices, initial.practices)
        const again = await download(scenario.name + '-reopened', 'pack')
        assert.deepEqual(again.project, saved.project)
        results.push({ name: scenario.name, practices: initial.practices, exactProjectReopened: true, paused: Boolean(scenario.paused) })
      }
      assert.equal(report.providerRequests.length, requestsBefore, 'Local exclusions and recovery do not send inference')
      return results
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
  assert.equal(report.sourcesChangedDuringRun, false, 'No implementation file changed during the trial')
  assert.deepEqual(report.checks.filter(check => check.status !== 'Pass').map(check => check.id), [], 'Every browser scenario must pass')
  process.stdout.write(`Ranking and exclusions: ${report.checks.length} checks passed. Evidence: ${output}\n`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
