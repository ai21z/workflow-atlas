const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { chromium } = require('playwright')
const { briefView, workflowView } = require('./browser-workspace-helpers.cjs')

async function run() {
  const root = path.resolve(__dirname, '..')
  const { createAtlasServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href)
  const { unzipTextFiles } = await import(pathToFileURL(path.join(root, 'factory/zip.mjs')).href)
  const { createExample, getTechnologyProfiles, CATALOG } = await import(pathToFileURL(path.join(root, 'factory/core.mjs')).href)
  const expected = createExample('feature-delivery')
  const profiles = getTechnologyProfiles(expected)
  const output = path.join(root, 'local-knowledge/retests/feature-path', new Date().toISOString().replace(/[:.]/g, '-'))
  await fs.mkdir(output, { recursive: true })
  const report = {
    method: 'Public Chrome controls, actual downloaded ZIP bytes and file-input reopening of the fictional status filter example. No application state injection or model calls.',
    limits: 'Functional browser simulation and screenshots. No real project implementation, human comprehension study, screen reader audit or physical mobile-device evidence.',
    checks: [], downloads: [], errors: [], inferenceRequests: 0, providerCalls: 0,
  }
  const server = await createAtlasServer({ rootDir: root, getApiKey: () => '', transport: async () => { report.providerCalls += 1; throw Error('Inference disabled') } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const base = `http://127.0.0.1:${server.address().port}/factory/`
  let browser, page
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, reducedMotion: 'reduce' })
    context.on('page', opened => {
      opened.on('pageerror', error => report.errors.push(error.message))
      opened.on('request', request => {
        const url = new URL(request.url())
        if (url.pathname.startsWith('/api/jev/') && url.pathname !== '/api/jev/status') report.inferenceRequests += 1
      })
    })
    page = await context.newPage()
    page.setDefaultTimeout(10000)
    await page.goto(base)
    await page.locator('#start-screen [data-studio-action="examples"]').click()
    await page.locator('[data-example="feature-delivery"]').focus()
    await page.locator('[data-example="feature-delivery"]').press('Enter')
    await page.locator('#project-name').waitFor({ state: 'visible' })
    await briefView(page, 'intent')
    assert.equal(await page.locator('#project-name').inputValue(), expected.project.name)
    assert.equal(await page.locator('[data-field="workflow.answers.acceptance"]').inputValue(), expected.workflow.answers.acceptance)
    report.checks.push('Browse examples opens the status filter with concrete proposed acceptance, without running or approving anything.')
    await page.locator('.main-navigation [data-main-view="knowledge"]').click()
    const knowledge = page.frameLocator('#knowledge-frame')
    await knowledge.locator('button[data-mode="read"]').click()
    await knowledge.locator('#quick-start [data-tour="user-facing-feature"]').click()
    assert.match(await knowledge.locator('#reader-content').innerText(), /Open/)
    assert.match(await knowledge.locator('#reader-content').innerText(), /All/)
    assert.equal(await knowledge.locator('#tour-bar').isVisible(), true)
    await knowledge.locator('#tour-next').click()
    assert.match(await knowledge.locator('#reader-title').innerText(), /requirements/i)
    await knowledge.locator('#tour-exit').click()
    report.checks.push('Knowledge map offers the feature guided path, a concrete Open and All example and a next step into requirements guidance.')

    for (const width of [1440, 390, 320]) {
      await page.setViewportSize({ width, height: width === 320 ? 568 : 1000 })
      for (const theme of ['light', 'dark']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await page.locator('#theme-toggle').click()
        await briefView(page, 'project')
        for (const [index, component] of expected.components.entries()) {
          assert.equal(await page.locator(`[data-field="components.${index}.path"]`).inputValue(), '')
          for (const kind of ['test', 'lint', 'build']) assert.equal(await page.locator(`[data-field="components.${index}.commands.${kind}"]`).inputValue(), '')
          assert.ok(component.technologies.every(technology => technology.version === ''))
        }
        for (const profile of profiles) assert.equal(await page.locator(`[data-field="workflow.answers.technology-${profile.id}-0"]`).count(), 1, `${profile.id} has its own editable question`)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Project facts overflow at ${width}/${theme}`)
        await page.locator('.main-navigation [data-main-view="knowledge"]').click()
        if (await knowledge.locator('#topic-subject').isVisible()) {
          await knowledge.locator('#topic-subject').selectOption('user-facing-feature')
          await knowledge.locator('#topic-nav [data-topic="react"]').click()
        } else {
          await knowledge.locator('#mobile-topics').click()
          await knowledge.locator('#mobile-subject').selectOption('user-facing-feature')
          await knowledge.locator('#mobile-nav [data-topic="react"]').click()
        }
        assert.match(await knowledge.locator('#reader-title').innerText(), /React/)
        assert.match(await knowledge.locator('#reader-content').innerText(), /keyboard/i)
        await page.screenshot({ path: path.join(output, `knowledge-${width}-${theme}.png`) })
        await workflowView(page)
        await page.locator('[data-select-stage="verification"]').first().click()
        const verificationNotes = page.locator('[data-field="workflow.notes.verification"]')
        assert.equal(await verificationNotes.inputValue(), expected.workflow.notes.verification)
        await verificationNotes.scrollIntoViewIfNeeded()
        assert.equal(await verificationNotes.isVisible(), true)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Workflow overflow at ${width}/${theme}`)
        await page.locator('#toast').waitFor({ state: 'hidden' })
        await page.screenshot({ path: path.join(output, `workflow-${width}-${theme}.png`) })
        report.checks.push(`At ${width}px in ${theme}, actual paths and commands stay empty, all seven specialist questions are editable, the feature subject opens React guidance, and planned verification notes fit the page.`)
      }
    }

    await page.setViewportSize({ width: 1440, height: 1000 })
    await workflowView(page)
    await page.locator('[data-select-stage="verification"]').first().click()
    const stepReading = page.locator('[data-detail="stage-reading-verification"]')
    await stepReading.locator('summary').click()
    assert.equal(await stepReading.locator('[data-reference-topic="repository-task-workflow"]').count(), 0, 'Task planning is not presented as verification-step guidance')
    await stepReading.locator('[data-reference-topic="evaluation-workflow"]').click()
    const evaluationTitle = CATALOG.stageReading.verification.find(topic => topic.id === 'evaluation-workflow').title
    await knowledge.locator('#reader-title').filter({ hasText: evaluationTitle }).waitFor()
    assert.equal(await knowledge.locator('#reader-title').innerText(), evaluationTitle)
    assert.equal(await knowledge.locator('#reader-content ol').count() > 0, true)
    await workflowView(page)
    assert.equal(await page.locator('[data-field="workflow.notes.verification"]').inputValue(), expected.workflow.notes.verification)
    report.checks.push('Verification-step reading opens the declared evaluation procedure without showing unrelated task-planning guidance or changing project notes. Subsequent downloads verify the complete project remains unchanged.')
    await briefView(page, 'project')
    const recordedAnswer = 'Proposed project follow up. Inspect the actual selection type and validate external status values at the data boundary. No implementation has been inspected.'
    await page.locator('[data-detail="profile-typescript"] > summary').click()
    await page.locator('[data-field="workflow.answers.technology-typescript-0"]').fill(recordedAnswer)
    const saved = []
    for (const kind of ['blueprint', 'pack']) {
      await page.locator('#download-project').click()
      await page.locator(`[data-output-kind="${kind}"]`).check()
      const event = page.waitForEvent('download')
      await page.locator('[data-studio-action="download-output"]').click()
      const downloaded = await event
      const filePath = path.join(output, `status-filter-${kind}.zip`)
      await downloaded.saveAs(filePath)
      const bytes = await fs.readFile(filePath)
      const { files } = await unzipTextFiles(new Uint8Array(bytes))
      const content = name => files.find(file => file.path === name)?.content
      const project = JSON.parse(content('project.json'))
      const expectedProject = structuredClone(expected)
      expectedProject.workflow.answers['technology-typescript-0'] = recordedAnswer
      assert.deepEqual(project, expectedProject, 'Reading the subject and guided path changes no project decision')
      assert.equal(project.workflow.answers['technology-typescript-0'], recordedAnswer)
      assert.equal(project.workflow.answers.acceptance, expected.workflow.answers.acceptance)
      assert.deepEqual(project.evidence, [])
      assert.ok(project.components.every(component => component.path === '' && Object.values(component.commands).every(value => value === '')))
      assert.equal(JSON.parse(content('manifest.json')).draft, true)
      assert.ok(content('templates/REQUIREMENTS.md').includes(expected.workflow.answers.acceptance))
      assert.ok(content('templates/DECISION.md').includes(expected.workflow.notes.architecture))
      assert.ok(content('templates/EVALUATION.md').includes(expected.workflow.notes.verification))
      assert.match(content('templates/VERIFICATION.md'), /\[NOT RUN\]/)
      assert.doesNotMatch(content('WORKFLOW.md'), /npm test|npm run|npx playwright/)
      assert.equal(files.some(file => file.path.endsWith('.agent.md')), kind === 'pack')
      if (kind === 'pack') {
        const reference = content('.github/skills/verification/references/project.md')
        for (const profile of profiles) assert.ok(reference.includes(profile.questions[0]), profile.id)
        assert.ok(reference.includes(recordedAnswer))
      }
      saved.push({ kind, filePath, project })
      report.downloads.push({ kind, file: path.basename(filePath), bytes: bytes.length, paths: files.map(file => file.path), draft: true })
      await page.locator('[data-close-dialog="download-dialog"]').click()
    }
    report.checks.push('Both actual ZIP downloads preserve acceptance, design, verification plans and the edited TypeScript answer. Commands stay unresolved, observed evidence stays empty, and the full pack contains all seven technology questions.')

    for (const download of saved) {
      await page.close()
      page = await context.newPage()
      page.setDefaultTimeout(10000)
      await page.goto(base)
      await page.locator('#import-config').click()
      await page.locator('#import-file').setInputFiles(download.filePath)
      await page.locator('#project-name').waitFor({ state: 'visible' })
      await briefView(page, 'intent')
      assert.equal(await page.locator('[data-field="workflow.answers.acceptance"]').inputValue(), expected.workflow.answers.acceptance)
      await briefView(page, 'project')
      await page.locator('[data-detail="profile-typescript"] > summary').click()
      assert.equal(await page.locator('[data-field="workflow.answers.technology-typescript-0"]').inputValue(), recordedAnswer)
      assert.equal(await page.locator('[data-field="components.0.commands.test"]').inputValue(), '')
      await workflowView(page)
      await page.locator('[data-select-stage="verification"]').first().click()
      assert.equal(await page.locator('[data-field="workflow.notes.verification"]').inputValue(), expected.workflow.notes.verification)
      report.checks.push(`The actual ${download.kind} ZIP reopens through Open pack with the edited question, proposed acceptance, verification instructions and unresolved command intact.`)
    }
    assert.equal(report.providerCalls, 0)
    assert.equal(report.inferenceRequests, 0)
    assert.deepEqual(report.errors, [])
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    console.log(`Feature path UI passed. ${report.checks.length} check groups and ${report.downloads.length} actual ZIP downloads. Evidence: ${output}`)
  } catch (error) {
    report.failure = error.stack || String(error)
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, 'failure.png'), fullPage: true }).catch(() => {})
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    throw error
  } finally {
    await browser?.close()
    await new Promise(resolve => server.close(resolve))
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 })
