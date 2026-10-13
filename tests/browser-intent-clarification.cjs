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
const cliArguments = process.argv.slice(2)
if (cliArguments.length && (cliArguments.length !== 1 || cliArguments[0] !== '--privacy-only')) throw new Error('Supported option: --privacy-only. Omit it to run every journey.')
const selectedCheck = cliArguments[0] === '--privacy-only' ? '08-privacy-and-conflict-require-edited-wording' : null
const output = path.join(root, 'local-knowledge/retests/intent-clarification', new Date().toISOString().replace(/[:.]/g, '-'))
const sha = bytes => createHash('sha256').update(bytes).digest('hex')
const report = {
  startedAt: new Date().toISOString(),
  method: 'Public Chrome controls, actual downloaded ZIP bytes and file chooser reopening. Synthetic local JEV transport, fictional user text and fake credentials. No application state injection or live inference.',
  limits: 'Functional browser simulation and screenshots, not an independent human trial, physical mobile test, screen reader audit, live JEV quality test or latency benchmark.',
  selection: selectedCheck || 'All journeys',
  checks: [], downloads: [], requests: [], providerRequests: [], errors: [], storageWrites: [],
}
let browser, context, page, server, base, contract, unzipTextFiles
let clockOffset = 0
let conditionalDownload, scopeDownload

async function sourceHashes() {
  const files = ['atlas/data.js', 'factory/app.mjs', 'factory/intent-review.mjs', 'factory/intent-separation.mjs', 'factory/intent-compounds.mjs', 'factory/core.mjs', 'factory/index.html', 'factory/workspace.css', 'factory/knowledge-query.mjs', 'factory/brief-suggestions.mjs', 'factory/brief-suggestions-view.mjs', 'factory/jev-assistance.mjs', 'factory/jev-contract.mjs', 'tools/serve.mjs']
  return Promise.all(files.map(async name => ({ path: name, sha256: sha(await fs.readFile(path.join(root, name))) })))
}

async function persist() {
  report.finishedAt = new Date().toISOString()
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(report, null, 2) + '\n')
  await fs.writeFile(path.join(output, 'report.md'), [
    '# Intent clarification user journey', '', report.method, '', report.limits, '', `Selection: ${report.selection}.`, '',
    `Checks passed: ${report.checks.filter(check => check.status === 'Pass').length}/${report.checks.length}.`,
    `Actual ZIP downloads: ${report.downloads.length}. Explicit synthetic assessments: ${report.providerRequests.length}.`, '',
    ...report.checks.map(check => `- ${check.id}: ${check.status}${check.error ? `. ${check.error.split('\n')[0]}` : ''}`), '',
    'Detailed observations, source hashes and synthetic request bodies are in results.json. ZIP files contain the exact downloaded bytes.', '',
  ].join('\n'))
}

async function check(id, action) {
  if (selectedCheck && id !== selectedCheck) return
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
  await page.locator('#project-name').fill('Intent clarification review')
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
  assert.ok(![...archive.values()].some(content => content.includes('synthetic-intent-clarification-key')))
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

async function press(selector) {
  await page.locator(selector).waitFor({ state: 'visible' })
  await page.locator(selector).focus()
  await page.keyboard.press('Enter')
  await readySuggestions()
}

async function recordedChoice(kind) {
  await expand('#brief-suggestions [data-detail="clarifications"]')
  assert.match(await page.locator('#brief-suggestions [data-detail="clarifications"]').innerText(), kind)
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

async function confirmTyped(clause, kind, label) {
  const quick = page.locator('[data-part-question]')
  if (await quick.count()) {
    assert.equal(await quick.locator('[data-quick-part-quote]').innerText(), `${clause}.`)
    assert.deepEqual(await quick.locator('[data-confirm-part-action]').evaluateAll(buttons => buttons.map(button => button.dataset.confirmPartAction)), [kind])
    assert.equal(await quick.locator('[data-edit-source-part]').count(), 1)
    assert.equal(await quick.locator('[data-open-parts]').count(), 1)
    await press(`[data-confirm-part-action="${kind}"]`)
    return
  }
  const question = page.locator('[data-statement-question]')
  await question.waitFor({ state: 'visible' })
  assert.equal(await question.locator('blockquote').innerText(), clause)
  assert.deepEqual(await question.locator('[data-clarify-statement]').evaluateAll(elements => elements.map(element => element.dataset.clarifyStatement)), [kind])
  assert.equal(await question.locator('[data-confirm-exclusion]').count(), 0)
  assert.equal(await question.locator('[data-excluded-practice]').count(), 0)
  assert.equal(await question.locator('[data-edit-clarification]').count(), 1)
  assert.match(await question.locator(`[data-clarify-statement="${kind}"]`).innerText(), label)
  await press(`[data-clarify-statement="${kind}"]`)
}

// Current source confirmations retain full sentences and field identity. Older
// clause records remain separate, with their original interpretation policy.
function assertMeanings(review, expected) {
  const current = [...review.statements, ...(review.parts || []).map(part => {
    assert.equal(part.policyVersion, 4)
    assert.ok(part.field === 'brief' || part.field.startsWith('answer:'))
    assert.ok(Number.isInteger(part.index))
    return { clause: part.text.replace(/[.!?]$/u, ''), kind: part.role, practiceIds: part.practiceIds, policyVersion: 3 }
  })]
  assert.deepEqual(current.sort((a, b) => a.clause.localeCompare(b.clause)), [...expected].sort((a, b) => a.clause.localeCompare(b.clause)))
}
function historicalProject(project, version, policyVersion) {
  const fixture = structuredClone(project)
  const review = fixture.workflow.intentReview
  review.statements = [...review.statements, ...(review.parts || []).map(part => ({ clause: part.text.replace(/[.!?]$/u, ''), kind: part.role, practiceIds: part.practiceIds }))].map(({ policyVersion: unused, ...statement }) => version === 1 ? statement : { ...statement, policyVersion })
  review.version = version
  delete review.knowledgeNeed
  delete review.parts
  return fixture
}
function assertReconfirmed(review, clause, kind, originalPolicy) {
  assert.equal(review.version, 5)
  const part = review.parts?.find(item => item.text === `${clause}.` && item.role === kind)
  if (part) {
    assert.equal(part.policyVersion, 4)
    assert.deepEqual(review.statements, [{ clause, kind, practiceIds: [], policyVersion: originalPolicy }], 'The prior record is preserved, not silently upgraded')
  } else assert.deepEqual(review.statements, [{ clause, kind, practiceIds: [], policyVersion: 3 }])
}

async function importFixture(name, project, explanation) {
  const filePath = path.join(output, `${name}.json`)
  await fs.writeFile(filePath, JSON.stringify(project, null, 2) + '\n')
  report.importFixtures ||= []
  report.importFixtures.push({ name, explanation, sha256: sha(await fs.readFile(filePath)) })
  await reopen(filePath)
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
  server = await createAtlasServer({ rootDir: root, getApiKey: () => 'synthetic-intent-clarification-key', transport, now: () => performance.now() + clockOffset })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}/factory/`
  browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })
  report.browser = browser.version()
  report.driverSha256 = sha(await fs.readFile(__filename))
  report.sourcesBefore = await sourceHashes()
  try {
    await check('01-task-choice-keyboard-and-actual-file-reopening', async () => {
      await fresh()
      const brief = 'Create the permit renewal journey.'
      await createDraft(brief)
      assert.equal(await page.locator('[data-task-question]').count(), 1)
      assert.deepEqual((await ideas()).practices, [])
      const questionScreenshots = await visualMatrix('task-question')
      await press('[data-clarify-task="software-change"]')
      const after = await ideas()
      assert.ok(after.practices.includes('minimum-change'))
      assert.ok(after.practices.includes('specification-first'))
      assert.equal(await page.locator('#project-purpose').inputValue(), brief)
      await recordedChoice(/Build, fix or plan software/)
      assert.equal(await page.locator('#brief-suggestions > [data-task-question]').count(), 0, 'The answered inline question gives way to useful suggestions')
      assert.equal(await page.locator('[data-detail="matching"] [data-clarify-task="software-change"]').count(), 1, 'The recorded choice remains editable in matching controls')
      const screenshots = await visualMatrix('task-clarification')
      const saved = await download('task-confirmed', 'pack')
      assert.equal(saved.project.workflow.intentReview.taskKind, 'software-change')
      assert.equal(saved.project.project.purpose, brief)
      assert.ok(!saved.project.practices.includes('minimum-change'))
      assert.ok(!saved.project.practices.includes('specification-first'))
      assert.match(saved.archive.get('WORKFLOW.md'), /Task kind: Software change/)
      assert.match(saved.archive.get('templates/REQUIREMENTS.md'), /Task kind: Software change/)
      const packReferences = [...saved.archive].filter(([name]) => name.endsWith('/references/project.md'))
      assert.ok(packReferences.length > 0)
      for (const [, content] of packReferences) assert.match(content, /Task kind: Software change/)
      const skill = await download('task-confirmed-skill', 'skill')
      assert.deepEqual(skill.project, saved.project)
      const standaloneReferences = [...skill.archive].filter(([name]) => name.endsWith('/references/project.md'))
      assert.ok(standaloneReferences.length > 0)
      for (const [, content] of standaloneReferences) assert.match(content, /Task kind: Software change/)
      const jsonPath = path.join(output, 'task-project.json')
      const htmlPath = path.join(output, 'task-project.html')
      await fs.writeFile(jsonPath, saved.archive.get('project.json'))
      await fs.writeFile(htmlPath, saved.archive.get('PROJECT-ATLAS.html'))
      const reopenings = []
      for (const [label, filePath] of [['zip', saved.filePath], ['json', jsonPath], ['html', htmlPath]]) {
        await reopen(filePath)
        assert.deepEqual((await ideas()).practices, after.practices)
        await recordedChoice(/Build, fix or plan software/)
        const again = await download(`task-reopened-${label}`, 'blueprint')
        assert.deepEqual(again.project, saved.project)
        reopenings.push({ format: label, exactProject: true })
      }
      assert.equal(report.providerRequests.length, 0)
      return { surfaced: after.practices, noAutomaticSelection: true, standaloneSkillHasClarifications: true, reopenings, questionScreenshots, screenshots }
    })

    await check('02-product-rule-confirmation-original-inference-boundary', async () => {
      await fresh()
      const brief = 'Build the account dashboard. Unverified amounts must not appear in totals.'
      await createDraft(brief)
      assert.equal(await page.locator('[data-statement-question], [data-part-question]').count(), 1)
      assert.match(await page.locator('[data-statement-question], [data-part-question]').innerText(), /Unverified amounts must not appear in totals/)
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      const questionScreenshots = await visualMatrix('requirement-question')
      await confirmTyped('Unverified amounts must not appear in totals', 'requirement', /A rule for what we are building/)
      const after = await ideas()
      assert.ok(after.practices.includes('minimum-change'))
      assert.ok(after.practices.includes('specification-first'))
      await expand('#brief-suggestions [data-detail="requirements"]')
      assert.match(await page.locator('[data-detail="requirements"]').innerText(), /Unverified amounts must not appear in totals/)
      await recordedChoice(/product requirement to verify|Product requirement/)
      assert.equal(report.providerRequests.length, 0)
      await expand('#brief-suggestions [data-detail="fit"]')
      await page.locator('[data-assess-idea]').click()
      await page.waitForFunction(() => document.querySelector('.brief-fit-result')?.textContent === 'JEV suggests this fits')
      assert.equal(report.providerRequests.length, 1)
      const request = report.requests.filter(request => request.method === 'POST').at(-1).body
      assert.deepEqual(Object.keys(request).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
      assert.equal(request.userBrief, brief)
      assert.ok(contract.SUPPORTED_PRACTICES.includes(request.practiceId))
      assert.deepEqual(report.providerRequests[0].state, { userBrief: brief, suppliedProjectAnswers: request.suppliedProjectAnswers })
      assert.doesNotMatch(JSON.stringify(request), /intentReview|taskKind|contextResolutions|catalogue|graphReasons|sourceLine|userConfirmed|policyVersion|clarificationType|allowedKinds/)
      const saved = await download('requirement-confirmed', 'blueprint')
      assertMeanings(saved.project.workflow.intentReview, [{ clause: 'Unverified amounts must not appear in totals', kind: 'requirement', practiceIds: [], policyVersion: 3 }])
      assert.ok(!saved.project.practices.includes('minimum-change'))
      assert.match(saved.archive.get('templates/REQUIREMENTS.md'), /Product requirement/)
      await reopen(saved.filePath)
      assert.deepEqual((await ideas()).practices, after.practices)
      assert.equal(report.providerRequests.length, 1, 'Reopening does not repeat inference')
      return { request, preservedStatement: saved.project.workflow.intentReview.statements[0], noAutoApply: true, questionScreenshots }
    })

    await check('03-background-context-does-not-invent-project-answers', async () => {
      await fresh()
      const brief = 'Build the account dashboard. The owner has not commented.'
      await createDraft(brief)
      assert.match(await page.locator('[data-statement-question]').innerText(), /The owner has not commented/)
      await press('[data-clarify-statement="context"]')
      assert.ok((await ideas()).practices.includes('minimum-change'))
      await recordedChoice(/Background, history or task scope/)
      const saved = await download('context-confirmed', 'pack')
      assertMeanings(saved.project.workflow.intentReview, [{ clause: 'The owner has not commented', kind: 'context', practiceIds: [], policyVersion: 3 }])
      assert.equal(saved.project.workflow.answers.acceptance || '', '')
      assert.match(saved.archive.get('templates/REQUIREMENTS.md'), /Background context/)
      assert.match(saved.archive.get('templates/REQUIREMENTS.md'), /UNRESOLVED/)
      await reopen(saved.filePath)
      await recordedChoice(/Background, history or task scope/)
      return { sourcePreserved: saved.project.project.purpose, acceptanceStillUnresolved: true }
    })

    await check('04-explicit-practice-choice-and-dropdown-validation', async () => {
      await fresh()
      const brief = 'Build the account dashboard. Do not add that extra procedure.'
      await createDraft(brief)
      await expand('#brief-suggestions [data-detail="clarify-exclusion"]')
      const dropdownScreenshots = await visualMatrix('exclusion-question')
      await press('[data-confirm-exclusion]')
      assert.match(await page.locator('[data-statement-question] .brief-clarification-error').innerText(), /Choose a practice first/)
      assert.equal(await page.locator('[data-excluded-practice]').evaluate(element => element === document.activeElement), true)
      await page.locator('[data-excluded-practice]').selectOption('minimum-change')
      await press('[data-confirm-exclusion]')
      const after = await ideas()
      assert.ok(!after.practices.includes('minimum-change'))
      assert.ok(after.practices.includes('specification-first'))
      await recordedChoice(/Leave out: Smallest necessary change/)
      const screenshots = await visualMatrix('named-exclusion')
      const saved = await download('exclusion-confirmed', 'blueprint')
      assertMeanings(saved.project.workflow.intentReview, [{ clause: 'Do not add that extra procedure', kind: 'exclusion', practiceIds: ['minimum-change'], policyVersion: 3 }])
      assert.match(saved.archive.get('WORKFLOW.md'), /Named practices to leave out: Smallest necessary change/)
      await reopen(saved.filePath)
      assert.deepEqual((await ideas()).practices, after.practices)
      return { surfaced: after.practices, exclusion: saved.project.workflow.intentReview.statements[0], dropdownScreenshots, screenshots }
    })

    await check('05-edited-text-stales-previous-clarification', async () => {
      await fresh()
      await createDraft('Create the permit renewal journey.')
      await press('[data-clarify-task="software-change"]')
      const revised = 'Create the grant renewal journey.'
      await page.locator('#project-purpose').fill(revised)
      await readySuggestions()
      assert.match(await page.locator('#brief-suggestions').innerText(), /Previous clarifications need reviewing/)
      assert.deepEqual((await ideas()).practices, [])
      assert.equal(await page.locator('[data-task-question]').count(), 1)
      const stale = await download('stale-clarification', 'blueprint')
      assert.equal(stale.project.workflow.intentReview.source.brief, 'Create the permit renewal journey.')
      assert.equal(stale.project.project.purpose, revised)
      assert.match(stale.archive.get('WORKFLOW.md'), /Recorded intent clarifications, not applied/)
      await reopen(stale.filePath)
      assert.deepEqual((await ideas()).practices, [])
      await press('[data-clarify-task="software-change"]')
      assert.ok((await ideas()).practices.includes('minimum-change'))
      const refreshed = await download('refreshed-clarification', 'blueprint')
      assert.equal(refreshed.project.workflow.intentReview.source.brief, revised)
      assert.doesNotMatch(refreshed.archive.get('WORKFLOW.md'), /Recorded intent clarifications, not applied/)
      return { staleRecordRetained: true, newChoiceBoundToCurrentText: true }
    })

    await check('06-selected-stages-still-limit-confirmed-work', async () => {
      await fresh()
      await createDraft('Create the permit renewal journey.')
      await press('[data-clarify-task="software-change"]')
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
      const after = await ideas()
      assert.ok(!after.practices.includes('minimum-change'))
      assert.ok(!after.practices.includes('specification-first'))
      await recordedChoice(/Build, fix or plan software/)
      assert.doesNotMatch(after.text, /Previous clarifications need reviewing/)
      const saved = await download('stages-removed', 'blueprint')
      assert.deepEqual(saved.project.workflow.enabledStages, [])
      assert.equal(saved.project.workflow.intentReview.taskKind, 'software-change')
      await reopen(saved.filePath)
      assert.deepEqual((await ideas()).practices, after.practices)
      return { selectedStages: saved.project.workflow.enabledStages, surfaced: after.practices, clarificationStillCurrent: true }
    })

    await check('07-other-work-and-review-again', async () => {
      await fresh()
      await createDraft('Create the permit renewal journey.')
      await press('[data-clarify-task="other"]')
      const other = await ideas()
      assert.ok(!other.practices.includes('minimum-change'))
      assert.ok(!other.practices.includes('specification-first'))
      await expand('#brief-suggestions [data-detail="clarifications"]')
      await press('[data-reset-clarifications]')
      assert.equal(await page.locator('[data-task-question]').count(), 1)
      await press('[data-clarify-task="unsure"]')
      assert.equal(await page.locator('[data-task-question]').count(), 1)
      assert.ok(!(await ideas()).practices.includes('minimum-change'))
      const saved = await download('unsure-work', 'blueprint')
      assert.equal(saved.project.workflow.intentReview.taskKind, 'unsure')
      await reopen(saved.filePath)
      assert.equal(await page.locator('[data-task-question]').count(), 1)
      return { otherSuppressedSoftwareDefaults: true, resetOfferedReview: true, unsureStillAsks: true }
    })

    await check('08-privacy-and-conflict-require-edited-wording', async () => {
      const initialCalls = report.providerRequests.length
      const scenarios = [
        { name: 'privacy', brief: 'Build the account dashboard. Do not send any data to TypeSafe.' },
        { name: 'negative-subject', brief: 'Build the account dashboard. Nothing in this description or the supplied answers may be sent to an external model service.' },
        { name: 'no-text-transfer', brief: 'Build the account dashboard. None of the supplied text may leave this device.' },
        { name: 'external-calls', brief: 'Build the account dashboard. No external calls.' },
        { name: 'off-device', brief: 'Build the account dashboard. Do not send information off device.' },
        { name: 'global-retention', brief: 'Build the account dashboard. Never retain any material from this request anywhere.' },
        { name: 'conditional-practice', brief: 'Build the account dashboard. The workflow must not include a wiki when the budget is low.' },
        { name: 'conflict', brief: 'Build the account dashboard. The lead says leave Smallest necessary change out of the pack, while the reviewer says it must be included. Both requests remain unresolved.' },
      ]
      const outcomes = []
      for (const scenario of scenarios) {
        await fresh()
        await createDraft(scenario.brief)
        assert.match(await page.locator('[data-statement-question], [data-part-question]').innerText(), /needs clearer meaning|How should Atlas use this sentence/)
        assert.equal(await page.locator('[data-clarify-statement]').count(), 0)
        assert.equal(await page.locator('[data-confirm-exclusion]').count(), 0)
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        await press(await page.locator('[data-edit-source-part]').count() ? '[data-edit-source-part]' : '[data-edit-clarification]')
        assert.equal(await page.locator('#project-purpose').evaluate(element => element === document.activeElement), true)
        const saved = await download(`blocked-${scenario.name}`, 'blueprint')
        assert.equal(saved.project.project.purpose, scenario.brief)
        assert.equal(saved.project.workflow.intentReview, undefined)
        await reopen(saved.filePath)
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        outcomes.push({ name: scenario.name, noDismissalShortcut: true, originalTextReopened: true })
      }
      assert.equal(report.providerRequests.length, initialCalls)
      return outcomes
    })

    await check('09-edit-opens-the-original-answer-from-another-details-tab', async () => {
      await fresh()
      await createDraft('Build the account dashboard.')
      const answer = 'Do not send any data to TypeSafe.'
      const answerSelector = '[data-field="workflow.answers.acceptance"]'
      await page.locator(answerSelector).fill(answer)
      await readySuggestions()
      assert.match(await page.locator('[data-statement-question], [data-part-question]').innerText(), /needs clearer meaning|How should Atlas use this sentence/)
      await page.locator('#details-nav [data-goto="project"]').click()
      assert.equal(await page.locator(answerSelector).count(), 0, 'The acceptance editor belongs to another details tab')
      await press(await page.locator('[data-edit-source-part]').count() ? '[data-edit-source-part]' : '[data-edit-clarification]')
      const focused = await page.locator(answerSelector).evaluate(element => ({ active: element === document.activeElement, selected: element.value.slice(element.selectionStart, element.selectionEnd), value: element.value }))
      assert.equal(focused.active, true)
      assert.equal(focused.value, answer)
      assert.equal(focused.selected, await page.locator('[data-edit-source-part]').count() ? answer : answer.slice(0, -1))
      await page.locator(answerSelector).fill('The accepted account totals match the supplied records.')
      await readySuggestions()
      assert.equal(await page.locator('[data-statement-question]').count(), 0)
      assert.ok((await ideas()).practices.includes('minimum-change'))
      const saved = await download('answer-edited-in-origin', 'blueprint')
      assert.equal(saved.project.workflow.answers.acceptance, 'The accepted account totals match the supplied records.')
      assert.equal(saved.project.workflow.intentReview, undefined)
      await reopen(saved.filePath)
      assert.equal(await page.locator(answerSelector).inputValue(), saved.project.workflow.answers.acceptance)
      return { originalAnswerFocusedAndSelected: focused, replacementRecordedWithoutClarification: true }
    })

    await check('10-conditional-product-rules-keep-the-whole-condition', async () => {
      const scenarios = [
        { name: 'pencil-marks', brief: 'Repair the sudoku app erasing pencil marks when the user opens a hint. Pencil marks must not disappear when a hint is opened.', clause: 'Pencil marks must not disappear when a hint is opened', expected: ['minimum-change', 'specification-first'] },
        { name: 'offline-form', brief: 'Add measurement capture to the offshore buoy servicing app. Technicians must be able to complete the form when the tablet has no signal. Maintain the original measurement protocol passages and later corrections in the project wiki.', clause: 'Technicians must be able to complete the form when the tablet has no signal', expected: ['minimum-change', 'specification-first', 'evidence-wiki'] },
      ]
      const initialCalls = report.providerRequests.length
      const outcomes = []
      for (const scenario of scenarios) {
        await fresh()
        await createDraft(scenario.brief)
        assert.deepEqual((await ideas()).practices, [])
        const screenshots = scenario.name === 'pencil-marks' ? await visualMatrix('conditional-requirement-question') : []
        await confirmTyped(scenario.clause, 'requirement', /Yes, keep the whole requirement/)
        const after = await ideas()
        for (const expected of scenario.expected) assert.ok(after.practices.includes(expected), `${scenario.name}: ${expected}`)
        assert.equal(await page.locator('#project-purpose').inputValue(), scenario.brief)
        const saved = await download(`conditional-${scenario.name}`, 'pack')
        assert.equal(saved.project.workflow.intentReview.version, 5)
        assertMeanings(saved.project.workflow.intentReview, [{ clause: scenario.clause, kind: 'requirement', practiceIds: [], policyVersion: 3 }])
        assert.ok(scenario.expected.every(id => !saved.project.practices.includes(id)), 'Clarification never selects suggested practices')
        for (const name of ['WORKFLOW.md', 'templates/REQUIREMENTS.md']) {
          assert.ok(saved.archive.get(name).includes(scenario.clause))
          assert.match(saved.archive.get(name), /Product requirement/)
        }
        await reopen(saved.filePath)
        assert.deepEqual((await ideas()).practices, after.practices)
        const again = await download(`conditional-${scenario.name}-reopened`, 'blueprint')
        assert.deepEqual(again.project, saved.project)
        if (scenario.name === 'pencil-marks') {
          conditionalDownload = saved
          const skill = await download('conditional-standalone-skill', 'skill')
          const references = [...skill.archive].filter(([name]) => name.endsWith('/references/project.md'))
          assert.ok(references.length)
          for (const [, content] of references) assert.ok(content.includes(scenario.clause))
          for (const [format, source] of [['json', 'project.json'], ['html', 'PROJECT-ATLAS.html']]) {
            const filePath = path.join(output, `conditional-reopen.${format}`)
            await fs.writeFile(filePath, saved.archive.get(source))
            await reopen(filePath)
            const roundTrip = await download(`conditional-${format}-reopened`, 'blueprint')
            assert.deepEqual(roundTrip.project, saved.project)
            assert.deepEqual((await ideas()).practices, after.practices)
          }
        }
        outcomes.push({ name: scenario.name, surfaced: after.practices, preservedClause: scenario.clause, noAutomaticSelection: true, screenshots })
      }
      assert.equal(report.providerRequests.length, initialCalls)
      return outcomes
    })

    await check('11-history-and-disavowal-remain-background', async () => {
      await fresh()
      const brief = 'Fix the battery health dashboard plotting the newest reading under the previous day. Last year the old dashboard did not display any dates. That historical behavior is not the desired behavior now.'
      await createDraft(brief)
      const screenshots = await visualMatrix('historical-context-question')
      const clauses = ['Last year the old dashboard did not display any dates', 'That historical behavior is not the desired behavior now']
      for (const clause of clauses) await confirmTyped(clause, 'context', /Yes, keep it as background/)
      const after = await ideas()
      assert.ok(after.practices.includes('minimum-change'))
      assert.ok(after.practices.includes('specification-first'))
      const saved = await download('historical-context', 'pack')
      assert.equal(saved.project.project.purpose, brief)
      assert.equal(saved.project.workflow.answers.acceptance || '', '')
      assertMeanings(saved.project.workflow.intentReview, clauses.map(clause => ({ clause, kind: 'context', practiceIds: [], policyVersion: 3 })))
      assert.match(saved.archive.get('templates/REQUIREMENTS.md'), /UNRESOLVED/)
      for (const clause of clauses) assert.ok(saved.archive.get('WORKFLOW.md').includes(clause))
      await reopen(saved.filePath)
      assert.deepEqual((await ideas()).practices, after.practices)
      return { surfaced: after.practices, clauses, acceptanceNotInvented: true, historicalAdjacencyKeepsContextOnlyConfirmation: true, screenshots }
    })

    await check('12-knowledge-only-scope-does-not-invite-software-work', async () => {
      const scenarios = [
        { name: 'factbook', brief: 'Maintain the newsroom factbook with original interview passages linked to claims and later corrections. This task only organizes existing information, without inspecting software or planning application changes.', clauses: [{ clause: 'This task only organizes existing information, without inspecting software or planning application changes', typed: true }] },
        { name: 'restoration', brief: 'Maintain a source backed handbook for the restoration workshop. We have not located the original pigment notes yet. Keep source passages linked to material decisions and future corrections as they are collected. Only existing knowledge is being organized, without software inspection or software change planning.', clauses: [{ clause: 'We have not located the original pigment notes yet', typed: false }, { clause: 'Only existing knowledge is being organized, without software inspection or software change planning', typed: true }] },
      ]
      const outcomes = []
      for (const scenario of scenarios) {
        await fresh()
        await createDraft(scenario.brief)
        for (const { clause, typed } of scenario.clauses) {
          if (typed) await confirmTyped(clause, 'context', /Yes, keep this scope/)
          else {
            assert.equal(await page.locator('[data-statement-question] blockquote').innerText(), clause)
            await press('[data-clarify-statement="context"]')
          }
        }
        assert.equal(await page.locator('[data-clarify-task="software-change"]').count(), 0)
        const screenshots = scenario.name === 'factbook' ? await visualMatrix('knowledge-only-scope') : []
        await press('[data-clarify-task="knowledge-work"]')
        const after = await ideas()
        assert.ok(after.practices.includes('evidence-wiki'))
        assert.ok(!after.practices.includes('minimum-change'))
        assert.ok(!after.practices.includes('specification-first'))
        const saved = await download(`scope-${scenario.name}`, 'pack')
        assert.equal(saved.project.project.purpose, scenario.brief)
        assert.equal(saved.project.workflow.intentReview.taskKind, 'knowledge-work')
        assertMeanings(saved.project.workflow.intentReview, scenario.clauses.map(({ clause }) => ({ clause, kind: 'context', practiceIds: [], policyVersion: 3 })))
        if (scenario.name === 'factbook') scopeDownload = saved
        await reopen(saved.filePath)
        assert.deepEqual((await ideas()).practices, after.practices)
        const again = await download(`scope-${scenario.name}-reopened`, 'blueprint')
        assert.deepEqual(again.project, saved.project)
        outcomes.push({ name: scenario.name, surfaced: after.practices, excludedSoftwareChoice: true, screenshots })
      }
      return outcomes
    })

    await check('13-imported-task-conflicting-with-scope-needs-correction', async () => {
      assert.ok(scopeDownload, 'The scope journey must first produce its real download')
      const fixture = structuredClone(scopeDownload.project)
      fixture.workflow.intentReview.taskKind = 'software-change'
      await importFixture('scope-conflicting-task', fixture, 'Derived from the actual scope ZIP, changing only taskKind to simulate an imported conflicting user choice.')
      assert.match(await page.locator('[data-task-question]').innerText(), /scope rules out software work/)
      assert.equal(await page.locator('[data-clarify-task="software-change"]').count(), 0)
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      assert.deepEqual((await ideas()).practices, [])
      await press('[data-edit-task-scope]')
      const focus = await page.locator('#project-purpose').evaluate(element => ({ active: element === document.activeElement, selected: element.value.slice(element.selectionStart, element.selectionEnd) }))
      assert.equal(focus.active, true)
      assert.equal(focus.selected, fixture.workflow.intentReview.statements[0].clause)
      await press('[data-clarify-task="knowledge-work"]')
      assert.deepEqual((await ideas()).practices, ['evidence-wiki'])
      const saved = await download('scope-task-corrected', 'blueprint')
      assert.equal(saved.project.workflow.intentReview.taskKind, 'knowledge-work')
      assert.deepEqual(saved.project.workflow.intentReview.statements, scopeDownload.project.workflow.intentReview.statements)
      await reopen(saved.filePath)
      assert.deepEqual((await ideas()).practices, ['evidence-wiki'])
      return { conflictingTaskBlocked: true, scopeNotDiscarded: true }
    })

    await check('14-legacy-conditional-record-needs-explicit-reconfirmation', async () => {
      assert.ok(conditionalDownload, 'The conditional journey must first produce its real download')
      const fixture = historicalProject(conditionalDownload.project, 1)
      await importFixture('legacy-conditional', fixture, 'Derived from the actual conditional ZIP, removing only v2 provenance to represent the supported v1 record format.')
      assert.deepEqual((await ideas()).practices, [])
      const prior = await download('legacy-conditional-before-reconfirmation', 'blueprint')
      assert.deepEqual(prior.project, fixture, 'Opening and downloading must not upgrade old choices')
      await briefView(page)
      await readySuggestions()
      const clause = fixture.workflow.intentReview.statements[0].clause
      await confirmTyped(clause, 'requirement', /Yes, keep the whole requirement/)
      assert.ok((await ideas()).practices.includes('minimum-change'))
      const saved = await download('legacy-conditional-reconfirmed', 'pack')
      assert.equal(saved.project.workflow.intentReview.version, 5)
      assertReconfirmed(saved.project.workflow.intentReview, clause, 'requirement', 1)
      await reopen(saved.filePath)
      assert.ok((await ideas()).practices.includes('minimum-change'))
      assert.equal(await page.locator('[data-statement-question]').count(), 0)
      return { oldBytesPreservedUntilChoice: true, explicitPolicyUpgrade: 2 }
    })

    await check('15-task-edit-preserves-legacy-statement-provenance', async () => {
      await fresh()
      await createDraft('Create the permit renewal journey. The owner has not commented.')
      await press('[data-clarify-statement="context"]')
      const saved = await download('legacy-task-base', 'blueprint')
      const fixture = structuredClone(saved.project)
      fixture.workflow.intentReview.version = 1
      delete fixture.workflow.intentReview.knowledgeNeed
      delete fixture.workflow.intentReview.parts
      fixture.workflow.intentReview.statements = fixture.workflow.intentReview.statements.map(({ policyVersion, ...statement }) => statement)
      await importFixture('legacy-task', fixture, 'Derived from an actual context download with only its statement policy provenance removed for v1 compatibility testing.')
      await press('[data-clarify-task="software-change"]')
      assert.ok((await ideas()).practices.includes('minimum-change'))
      const migrated = await download('legacy-task-changed', 'pack')
      assert.equal(migrated.project.workflow.intentReview.version, 5)
      assert.deepEqual(migrated.project.workflow.intentReview.statements, fixture.workflow.intentReview.statements.map(statement => ({ ...statement, policyVersion: 1 })))
      await reopen(migrated.filePath)
      assert.ok((await ideas()).practices.includes('minimum-change'))
      const again = await download('legacy-task-changed-reopened', 'blueprint')
      assert.deepEqual(again.project, migrated.project)
      return { legacyGenericContextStillWorks: true, untouchedStatementPolicy: 1 }
    })

    await check('16-conditional-answer-edits-stale-the-record-and-preserve-inference-bytes', async () => {
      await fresh()
      const brief = 'Repair the sudoku app losing pencil marks.'
      const answer = 'Pencil marks must not disappear when a hint is opened.'
      const answerSelector = '[data-field="workflow.answers.acceptance"]'
      await createDraft(brief)
      await page.locator(answerSelector).fill(answer)
      await readySuggestions()
      await confirmTyped(answer.slice(0, -1), 'requirement', /Yes, keep the whole requirement/)
      const initialCalls = report.providerRequests.length
      await expand('#brief-suggestions [data-detail="fit"]')
      await page.locator('[data-assess-idea]').click()
      await page.waitForFunction(() => document.querySelector('.brief-fit-result')?.textContent === 'JEV suggests this fits')
      assert.equal(report.providerRequests.length, initialCalls + 1)
      const request = report.requests.filter(request => request.method === 'POST').at(-1).body
      assert.deepEqual(Object.keys(request).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
      assert.equal(request.userBrief, brief)
      assert.equal(request.suppliedProjectAnswers.acceptance, answer)
      assert.deepEqual(report.providerRequests.at(-1).state, { userBrief: brief, suppliedProjectAnswers: request.suppliedProjectAnswers })
      assert.doesNotMatch(JSON.stringify(request), /intentReview|policyVersion|clarificationType|allowedKinds|catalogue|taskKind/)
      const saved = await download('conditional-answer-confirmed', 'pack')
      assert.equal(saved.project.workflow.intentReview.source.answers.acceptance, answer)
      await reopen(saved.filePath)
      const revised = 'Pencil marks must not disappear when a hint is closed.'
      await page.locator(answerSelector).fill(revised)
      await readySuggestions()
      assert.match(await page.locator('#brief-suggestions').innerText(), /Previous clarifications need reviewing/)
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      const stale = await download('conditional-answer-stale', 'blueprint')
      assert.equal(stale.project.workflow.intentReview.source.answers.acceptance, answer)
      assert.equal(stale.project.workflow.answers.acceptance, revised)
      assert.match(stale.archive.get('WORKFLOW.md'), /Recorded intent clarifications, not applied/)
      await reopen(stale.filePath)
      await confirmTyped(revised.slice(0, -1), 'requirement', /Yes, keep the whole requirement/)
      const next = await download('conditional-answer-reconfirmed', 'blueprint')
      assertMeanings(next.project.workflow.intentReview, [{ clause: revised.slice(0, -1), kind: 'requirement', practiceIds: [], policyVersion: 3 }])
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
      const noStages = await download('conditional-answer-without-stages', 'blueprint')
      assert.deepEqual(noStages.project.workflow.intentReview, next.project.workflow.intentReview)
      await reopen(noStages.filePath)
      assert.ok(!(await ideas()).practices.includes('minimum-change'))
      assert.equal(report.providerRequests.length, initialCalls + 1)
      return { originalRequest: request, changedAnswerRequiresNewChoice: true, stageEligibilityUnchanged: true }
    })

    await check('17-independent-knowledge-need-keeps-software-and-round-trips-all-downloads', async () => {
      await fresh()
      const brief = 'Build the permit renewal dashboard.'
      await createDraft(brief)
      assert.ok(!(await ideas()).practices.includes('evidence-wiki'))
      await chooseTask('software-change')
      await chooseKnowledge('maintained-reference')
      const after = await ideas()
      for (const id of ['minimum-change', 'specification-first', 'evidence-wiki']) assert.ok(after.practices.includes(id), id)
      await recordedChoice(/Yes, an ongoing reference/)
      assert.match(await page.locator('[data-recorded-knowledge]').innerText(), /Yes, an ongoing reference/)
      const screenshots = await visualMatrix('mixed-work-knowledge-matching')
      const callsBefore = report.providerRequests.length
      await expand('#brief-suggestions [data-detail="fit"]')
      await page.locator('[data-assess-idea]').click()
      await page.waitForFunction(() => document.querySelector('.brief-fit-result')?.textContent === 'JEV suggests this fits')
      assert.equal(report.providerRequests.length, callsBefore + 1)
      const request = report.requests.filter(item => item.method === 'POST').at(-1).body
      assert.deepEqual(Object.keys(request).sort(), ['practiceId', 'requestId', 'suppliedProjectAnswers', 'userBrief'])
      assert.equal(request.userBrief, brief)
      assert.deepEqual(report.providerRequests.at(-1).state, { userBrief: brief, suppliedProjectAnswers: request.suppliedProjectAnswers })
      assert.doesNotMatch(JSON.stringify(request), /knowledgeNeed|intentReview|policyVersion|clarificationType|catalogue|taskKind/)
      const saved = await download('mixed-knowledge-pack', 'pack')
      assert.equal(saved.project.workflow.intentReview.version, 5)
      assert.equal(saved.project.workflow.intentReview.taskKind, 'software-change')
      assert.equal(saved.project.workflow.intentReview.knowledgeNeed, 'maintained-reference')
      assert.ok(['minimum-change', 'specification-first', 'evidence-wiki'].every(id => !saved.project.practices.includes(id)))
      for (const name of ['WORKFLOW.md', 'templates/REQUIREMENTS.md']) assert.match(saved.archive.get(name), /Knowledge need: Keep a maintained reference/)
      const skill = await download('mixed-knowledge-skill', 'skill')
      assert.deepEqual(skill.project, saved.project)
      const references = [...skill.archive].filter(([name]) => name.endsWith('/references/project.md'))
      assert.ok(references.length > 0)
      for (const [, content] of references) assert.match(content, /Knowledge need: Keep a maintained reference/)
      const reopenings = [['zip', saved.filePath]]
      for (const [format, source] of [['json', 'project.json'], ['html', 'PROJECT-ATLAS.html']]) {
        const filePath = path.join(output, `mixed-knowledge-project.${format}`)
        await fs.writeFile(filePath, saved.archive.get(source))
        reopenings.push([format, filePath])
      }
      for (const [format, filePath] of reopenings) {
        await reopen(filePath)
        assert.deepEqual((await ideas()).practices, after.practices)
        await recordedChoice(/Yes, an ongoing reference/)
        const again = await download(`mixed-knowledge-reopened-${format}`, 'blueprint')
        assert.deepEqual(again.project, saved.project)
      }
      await workflowView(page)
      const stages = await page.locator('[data-select-stage]').evaluateAll(elements => [...new Set(elements.map(element => element.dataset.selectStage))])
      for (const stage of stages) {
        await page.locator(`[data-select-stage="${stage}"]`).first().click()
        await page.locator(`[data-stage="${stage}"]`).uncheck()
        await closeWorkspaceDetails(page)
      }
      await briefView(page)
      await readySuggestions()
      assert.deepEqual((await ideas()).practices, ['evidence-wiki'], 'Stage removal stops implementation practices, while the independently confirmed reference remains applicable')
      const noStages = await download('mixed-knowledge-without-stages', 'blueprint')
      assert.equal(noStages.project.workflow.intentReview.knowledgeNeed, 'maintained-reference')
      assert.deepEqual(noStages.project.workflow.enabledStages, [])
      await reopen(noStages.filePath)
      assert.deepEqual((await ideas()).practices, ['evidence-wiki'])
      assert.equal(report.providerRequests.length, callsBefore + 1)
      return { surfaced: after.practices, providerStateHasOriginalTextOnly: true, knowledgeSurvivesAllFormats: true, noAutomaticSelection: true, screenshots }
    })

    await check('18-wiki-button-is-not-a-maintained-knowledge-request', async () => {
      await fresh()
      const brief = 'Add a wiki navigation button to the account dashboard.'
      await createDraft(brief)
      const original = await ideas()
      assert.ok(original.practices.includes('minimum-change'))
      assert.ok(!original.practices.includes('evidence-wiki'))
      await chooseKnowledge('one-off')
      assert.ok(!(await ideas()).practices.includes('evidence-wiki'))
      assert.ok((await ideas()).practices.includes('minimum-change'))
      const saved = await download('wiki-button-one-off', 'blueprint')
      assert.equal(saved.project.workflow.intentReview.knowledgeNeed, 'one-off')
      assert.equal(saved.project.project.purpose, brief)
      await reopen(saved.filePath)
      assert.ok(!(await ideas()).practices.includes('evidence-wiki'))
      await chooseKnowledge('unsure')
      assert.ok(!(await ideas()).practices.includes('evidence-wiki'))
      assert.ok((await ideas()).practices.includes('minimum-change'))
      assert.equal(await page.locator('[data-knowledge-conflict]').count(), 0)
      const unsure = await download('wiki-button-unsure', 'blueprint')
      assert.equal(unsure.project.workflow.intentReview.knowledgeNeed, 'unsure')
      await reopen(unsure.filePath)
      assert.ok(!(await ideas()).practices.includes('evidence-wiki'))
      const revised = 'Add a glossary navigation button to the account dashboard.'
      await page.locator('#project-purpose').fill(revised)
      await readySuggestions()
      assert.match((await ideas()).text, /Previous clarifications need reviewing/)
      assert.equal(await page.locator('[data-recorded-knowledge]').count(), 0)
      const stale = await download('knowledge-choice-stale', 'blueprint')
      assert.equal(stale.project.workflow.intentReview.source.brief, brief)
      assert.equal(stale.project.workflow.intentReview.knowledgeNeed, 'unsure')
      assert.match(stale.archive.get('WORKFLOW.md'), /Recorded intent clarifications, not applied/)
      await reopen(stale.filePath)
      await chooseKnowledge('maintained-reference')
      const revisedSaved = await download('knowledge-choice-reconfirmed', 'blueprint')
      assert.equal(revisedSaved.project.workflow.intentReview.source.brief, revised)
      assert.equal(revisedSaved.project.workflow.intentReview.knowledgeNeed, 'maintained-reference')
      return { noWikiFromButtonWord: true, oneOffAndUnsureDoNotDisableSoftware: true, sourceEditNeedsNewChoice: true }
    })

    await check('19-conflicting-knowledge-choices-stay-visible-and-correctable', async () => {
      await fresh()
      await createDraft('Organize the field team reference notes.')
      await chooseTask('knowledge-work')
      assert.ok((await ideas()).practices.includes('evidence-wiki'))
      await chooseKnowledge('one-off')
      assert.equal(await page.locator('[data-knowledge-conflict]').isVisible(), true)
      assert.ok(!(await ideas()).practices.includes('evidence-wiki'))
      assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      const screenshots = await visualMatrix('knowledge-choice-conflict')
      const saved = await download('knowledge-choice-conflict', 'pack')
      assert.equal(saved.project.workflow.intentReview.taskKind, 'knowledge-work')
      assert.equal(saved.project.workflow.intentReview.knowledgeNeed, 'one-off')
      assert.match(saved.archive.get('WORKFLOW.md'), /Knowledge need: One time use/)
      await reopen(saved.filePath)
      assert.equal(await page.locator('[data-knowledge-conflict]').isVisible(), true)
      assert.ok(!(await ideas()).practices.includes('evidence-wiki'))
      await chooseKnowledge('unsure')
      assert.equal(await page.locator('[data-knowledge-conflict]').isVisible(), true)
      assert.ok(!(await ideas()).practices.includes('evidence-wiki'))
      await chooseKnowledge('maintained-reference')
      assert.equal(await page.locator('[data-knowledge-conflict]').count(), 0)
      assert.ok((await ideas()).practices.includes('evidence-wiki'))
      const resolved = await download('knowledge-choice-resolved', 'blueprint')
      assert.equal(resolved.project.workflow.intentReview.knowledgeNeed, 'maintained-reference')
      await reopen(resolved.filePath)
      assert.ok((await ideas()).practices.includes('evidence-wiki'))
      return { conflictWasNotSilentlyOverridden: true, choicesRemainEditable: true, screenshots }
    })

    await check('20-matching-controls-cannot-dismiss-global-restrictions', async () => {
      const callsBefore = report.providerRequests.length
      const scenarios = [
        { name: 'inference-ban', brief: 'Build the account dashboard. No external calls.' },
        { name: 'retention-ban', brief: 'Build the account dashboard. Never retain any material from this request anywhere.' },
      ]
      for (const scenario of scenarios) {
        await fresh()
        await createDraft(scenario.brief)
        await chooseTask('software-change')
        await chooseKnowledge('maintained-reference')
        assert.deepEqual((await ideas()).practices, [])
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        assert.equal(await page.locator('[data-clarify-statement]').count(), 0)
        assert.equal(await page.locator('[data-confirm-exclusion]').count(), 0)
        assert.match(await page.locator('[data-statement-question], [data-part-question]').innerText(), /needs clearer meaning|How should Atlas use this sentence/)
        const saved = await download(`matching-blocked-${scenario.name}`, 'blueprint')
        assert.equal(saved.project.project.purpose, scenario.brief)
        assert.equal(saved.project.workflow.intentReview.taskKind, 'software-change')
        assert.equal(saved.project.workflow.intentReview.knowledgeNeed, 'maintained-reference')
        await reopen(saved.filePath)
        assert.deepEqual((await ideas()).practices, [])
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
      }
      assert.equal(report.providerRequests.length, callsBefore)
      return { restrictionsStillBlockOffers: true, localChoicesPreservedWithoutInference: true }
    })

    await check('21-until-and-unless-keep-the-whole-condition-and-upgrade-only-after-confirmation', async () => {
      const scenarios = [
        { name: 'until', clause: 'The chart must not show a result until calibration is complete' },
        { name: 'unless', clause: 'Unless a measurement is confirmed, the chart must not show a result' },
      ]
      for (const scenario of scenarios) {
        await fresh()
        const brief = `Build the sensor calibration dashboard. ${scenario.clause}.`
        await createDraft(brief)
        assert.deepEqual((await ideas()).practices, [])
        await confirmTyped(scenario.clause, 'requirement', /Yes, keep the whole requirement/)
        assert.ok((await ideas()).practices.includes('minimum-change'))
        const saved = await download(`condition-${scenario.name}-v3`, 'pack')
        assertMeanings(saved.project.workflow.intentReview, [{ clause: scenario.clause, kind: 'requirement', practiceIds: [], policyVersion: 3 }])
        assert.ok(saved.archive.get('templates/REQUIREMENTS.md').includes(scenario.clause))
        await reopen(saved.filePath)
        assert.equal(await page.locator('[data-statement-question]').count(), 0)
        const legacy = historicalProject(saved.project, 2, 2)
        await importFixture(`condition-${scenario.name}-v2`, legacy, 'Derived from the actual conditional ZIP, representing a v2 statement record that predates until and unless support.')
        assert.deepEqual((await ideas()).practices, [])
        await chooseKnowledge('maintained-reference')
        assert.deepEqual((await ideas()).practices, [])
        assert.equal(await page.locator('[data-assess-idea]').count(), 0)
        const migrated = await download(`condition-${scenario.name}-facet-only`, 'blueprint')
        assert.equal(migrated.project.workflow.intentReview.version, 5)
        assert.equal(migrated.project.workflow.intentReview.knowledgeNeed, 'maintained-reference')
        assert.equal(migrated.project.workflow.intentReview.statements[0].policyVersion, 2)
        await briefView(page)
        await readySuggestions()
        await confirmTyped(scenario.clause, 'requirement', /Yes, keep the whole requirement/)
        const after = await ideas()
        for (const id of ['minimum-change', 'specification-first', 'evidence-wiki']) assert.ok(after.practices.includes(id), `${scenario.name}: ${id}`)
        const reconfirmed = await download(`condition-${scenario.name}-reconfirmed`, 'blueprint')
        assertReconfirmed(reconfirmed.project.workflow.intentReview, scenario.clause, 'requirement', 2)
        assert.equal(reconfirmed.project.project.purpose, brief)
        await reopen(reconfirmed.filePath)
        assert.deepEqual((await ideas()).practices, after.practices)
      }
      return { completeConditionsRetained: true, facetEditDoesNotUpgradeLegacyStatements: true, explicitReconfirmationRequired: true }
    })

    await check('22-version-history-is-background-and-keeps-old-policy-until-reviewed', async () => {
      await fresh()
      const clause = 'The previous version did not show week numbers'
      const brief = `Fix the calendar app date labels. ${clause}.`
      await createDraft(brief)
      await confirmTyped(clause, 'context', /Yes, keep it as background/)
      assert.ok((await ideas()).practices.includes('minimum-change'))
      const saved = await download('version-history-v3', 'pack')
      assert.equal(saved.project.project.purpose, brief)
      assert.equal(saved.project.workflow.answers.acceptance || '', '')
      assertMeanings(saved.project.workflow.intentReview, [{ clause, kind: 'context', practiceIds: [], policyVersion: 3 }])
      assert.match(saved.archive.get('templates/REQUIREMENTS.md'), /UNRESOLVED/)
      const old = historicalProject(saved.project, 2, 2)
      await importFixture('version-history-v2', old, 'Derived from the actual version-history ZIP as a v2 record that requires confirmation for the newly supported version-history form.')
      assert.deepEqual((await ideas()).practices, [])
      await recordedChoice(/Recorded choice\. This wording still needs review/)
      const untouched = await download('version-history-v2-untouched', 'blueprint')
      assert.deepEqual(untouched.project, old)
      assert.match(untouched.archive.get('WORKFLOW.md'), /This export does not establish that it is currently used for matching/)
      await briefView(page)
      await readySuggestions()
      await confirmTyped(clause, 'context', /Yes, keep it as background/)
      const current = await download('version-history-reconfirmed', 'blueprint')
      assert.equal(current.project.workflow.intentReview.version, 5)
      assertReconfirmed(current.project.workflow.intentReview, clause, 'context', 2)
      await reopen(current.filePath)
      assert.ok((await ideas()).practices.includes('minimum-change'))
      assert.equal(await page.locator('[data-statement-question]').count(), 0)
      return { historyDidNotInventAcceptance: true, oldRecordPreservedUntilConfirmation: true }
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
  process.stdout.write(`Intent clarifications: ${report.checks.length} checks passed. Evidence: ${output}\n`)
}

main().catch(error => { console.error(error); process.exitCode = 1 })
