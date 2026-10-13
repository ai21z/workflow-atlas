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
  const { createApiDataExample, getTechnologyProfiles } = await import(pathToFileURL(path.join(root, 'factory/core.mjs')).href)
  const expected = createApiDataExample()
  const profiles = getTechnologyProfiles(expected)
  const output = path.join(root, 'local-knowledge/retests/api-path', new Date().toISOString().replace(/[:.]/g, '-'))
  await fs.mkdir(output, { recursive: true })
  const report = {
    method: 'Public Chrome controls, actual downloaded ZIP bytes, offline Project Atlas reading and file-input reopening of an editable API and stored data example. No application state injection or model calls.',
    limits: 'Functional browser simulation and screenshots. No real backend implementation, human comprehension study, screen reader audit or physical mobile-device evidence.',
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
    const option = page.locator('[data-example="api-data"]')
    assert.match(await option.innerText(), /Change an API and stored data/)
    await option.focus()
    await option.press('Enter')
    await page.locator('#project-name').waitFor({ state: 'visible' })
    await briefView(page, 'intent')
    assert.equal(await page.locator('#project-name').inputValue(), expected.project.name)
    assert.equal(await page.locator('[data-field="workflow.answers.acceptance"]').inputValue(), expected.workflow.answers.acceptance)
    report.checks.push('Browse examples opens a separate API and stored data example with proposed acceptance, while existing starter workflows remain unchanged.')

    await page.locator('.main-navigation [data-main-view="knowledge"]').click()
    const knowledge = page.frameLocator('#knowledge-frame')
    await knowledge.locator('button[data-mode="read"]').click()
    await knowledge.locator('#quick-start [data-tour="api-stored-data"]').click()
    assert.match(await knowledge.locator('#reader-title').innerText(), /API.*stored data/i)
    assert.match(await knowledge.locator('#reader-content').innerText(), /MCP/)
    assert.equal(await knowledge.locator('#tour-bar').isVisible(), true)
    await knowledge.locator('#tour-next').click()
    assert.match(await knowledge.locator('#reader-title').innerText(), /requirements/i)
    await knowledge.locator('#tour-exit').click()
    report.checks.push('Knowledge map offers the API and stored data guided path and the next requirements step. Reading alone does not change the draft.')

    let designer = page.locator('#process-designer')
    const openDesigner = async () => {
      await workflowView(page)
      if (!await designer.isVisible()) await page.locator('[data-pe-open="topic-selection"]').click()
      await designer.waitFor({ state: 'visible' })
    }
    const chooseRecord = async (collection, id) => {
      const records = designer.locator('[data-pe-detail="records"]')
      if (await records.getAttribute('open') === null) await records.locator('summary').click()
      await designer.locator('[data-pe-collection-choice]').selectOption(collection)
      await designer.locator(`[data-pe-select="${id}"][data-pe-collection="${collection}"]`).first().click()
    }
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
        for (const profile of profiles) assert.equal(await page.locator(`[data-field="workflow.answers.technology-${profile.id}-0"]`).count(), 1, `${profile.id} has an editable question`)
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Project facts overflow at ${width}/${theme}`)

        await page.locator('.main-navigation [data-main-view="knowledge"]').click()
        if (await knowledge.locator('#topic-subject').isVisible()) {
          await knowledge.locator('#topic-subject').selectOption('api-stored-data')
          await knowledge.locator('#topic-nav [data-topic="spring-boot"]').click()
        } else {
          await knowledge.locator('#mobile-topics').click()
          await knowledge.locator('#mobile-subject').selectOption('api-stored-data')
          await knowledge.locator('#mobile-nav [data-topic="spring-boot"]').click()
        }
        assert.match(await knowledge.locator('#reader-title').innerText(), /Spring Boot/)
        await page.screenshot({ path: path.join(output, `knowledge-${width}-${theme}.png`) })

        await openDesigner()
        await designer.locator('[data-pe-action="list"]').click()
        await designer.locator('[data-pe-select="reconcile"][data-pe-collection="steps"]').first().click()
        assert.match(await designer.locator('[data-pe-bind="steps.7.action"]').inputValue(), /Do not replay the write/)
        assert.equal(await designer.locator('[data-pe-route="unknown"]').inputValue(), 'terminal:more-information')
        assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `Designer overflow at ${width}/${theme}`)
        await designer.locator('[data-pe-bind="steps.7.action"]').scrollIntoViewIfNeeded()
        await page.locator('#toast').waitFor({ state: 'hidden' })
        await page.screenshot({ path: path.join(output, `designer-${width}-${theme}.png`) })
        report.checks.push(`At ${width}px in ${theme}, project facts stay unresolved, specialist questions are editable, the API subject opens Spring Boot and the process explains read only reconciliation and its unknown stop route without page overflow.`)
      }
    }

    await page.setViewportSize({ width: 1440, height: 1000 })
    const recordedAnswer = 'User supplied plan. Inspect the actual Maven wrapper and configured checks before choosing commands.'
    const acceptance = expected.workflow.answers.acceptance + ' User supplied case. Preserve the selected subject after a failed read.'
    const contract = 'User supplied proposed selection.\nKeep permitted topic identifiers and the chosen subject.\nExact API field names remain unresolved.'
    await briefView(page, 'intent')
    await page.locator('[data-field="workflow.answers.acceptance"]').fill(acceptance)
    await briefView(page, 'project')
    await page.locator('[data-detail="profile-maven"] > summary').click()
    await page.locator('[data-field="workflow.answers.technology-maven-0"]').fill(recordedAnswer)
    await openDesigner()
    await chooseRecord('results', 'candidate')
    await designer.locator('[data-pe-bind="results.3.expectedStructure"]').fill(contract)
    await chooseRecord('corrections', 'selection-correction')
    await designer.locator('[data-pe-bind="corrections.0.maxCorrections"]').fill('1')
    await designer.locator('[data-pe-action="review"]').click()
    assert.equal(await designer.locator('[data-pe-action="apply"]').isEnabled(), true)
    await designer.locator('[data-pe-detail="files"] summary').click()
    assert.match(await designer.locator('[data-pe-detail="files"]').innerText(), /CONTRACTS\.md/)
    assert.match(await designer.locator('[data-pe-detail="files"]').innerText(), /EVALUATION\.md/)
    await designer.locator('[data-pe-action="apply"]').click()
    await page.locator('#view-nav [data-project-view="artifacts"]').click()
    await page.locator('[data-file="templates/CONTRACTS.md"]').click()
    assert.ok((await page.locator('#file-preview').innerText()).includes(contract))
    assert.match(await page.locator('#file-preview').innerText(), /Maximum corrections after the initial candidate: 1/)
    report.checks.push('A user edits acceptance, the Maven question, the candidate contract and correction limit, reviews affected files, applies the process and sees the exact multiline contract in Preview files.')

    const saved = []
    const expectedProject = structuredClone(expected)
    expectedProject.workflow.answers.acceptance = acceptance
    expectedProject.workflow.answers['technology-maven-0'] = recordedAnswer
    const expectedProcess = expectedProject.workflowModel.processes.find(process => process.kind === 'application')
    expectedProcess.results.find(result => result.id === 'candidate').expectedStructure = contract
    expectedProcess.corrections[0].maxCorrections = 1
    for (const kind of ['blueprint', 'pack']) {
      await page.locator('#download-project').click()
      await page.locator(`[data-output-kind="${kind}"]`).check()
      const event = page.waitForEvent('download')
      await page.locator('[data-studio-action="download-output"]').click()
      const downloaded = await event
      const filePath = path.join(output, `api-data-${kind}.zip`)
      await downloaded.saveAs(filePath)
      const bytes = await fs.readFile(filePath)
      const { files } = await unzipTextFiles(new Uint8Array(bytes))
      const content = name => files.find(file => file.path === name)?.content
      const project = JSON.parse(content('project.json'))
      assert.deepEqual(project, expectedProject, 'Reading guidance changes no accepted decision, and all accepted edits are preserved')
      assert.deepEqual(project.facts, [])
      assert.deepEqual(project.evidence, [])
      assert.equal(project.runtime.enabled, false)
      assert.ok(project.components.every(component => component.path === '' && Object.values(component.commands).every(value => value === '')))
      assert.equal(JSON.parse(content('manifest.json')).draft, true)
      assert.ok(content('templates/REQUIREMENTS.md').includes(acceptance))
      assert.ok(content('templates/DECISION.md').includes(expected.workflow.notes.architecture))
      assert.ok(content('templates/CONTRACTS.md').includes(contract))
      assert.match(content('templates/CONTRACTS.md'), /Maximum corrections after the initial candidate: 1/)
      assert.match(content('templates/CONTRACTS.md'), /\[UNRESOLVED: approval authority\]/)
      assert.ok(content('templates/EVALUATION.md').includes(expected.workflow.notes.verification))
      assert.match(content('templates/EVALUATION.md'), /topic-selection\/save \/ unknown/)
      assert.match(content('templates/EVALUATION.md'), /topic-selection\/reconcile \/ unknown/)
      assert.match(content('templates/EVALUATION.md'), /\[NOT RUN\]/)
      assert.equal(files.some(file => file.path === 'RUNTIME-DESIGN.md'), false)
      assert.equal(files.some(file => /mcp.*\.json$/i.test(file.path)), false)
      assert.equal(files.some(file => file.path.endsWith('.agent.md')), kind === 'pack')
      if (kind === 'pack') {
        const reference = content('.github/skills/verification/references/project.md')
        for (const profile of profiles) assert.ok(reference.includes(profile.questions[0]), profile.id)
        assert.ok(reference.includes(recordedAnswer))
        assert.ok(reference.includes(contract))
      }
      const htmlPath = path.join(output, `api-data-${kind}.html`)
      await fs.writeFile(htmlPath, content('PROJECT-ATLAS.html'))
      saved.push({ kind, filePath, htmlPath, project })
      report.downloads.push({ kind, file: path.basename(filePath), bytes: bytes.length, paths: files.map(file => file.path), draft: true })
      await page.locator('[data-close-dialog="download-dialog"]').click()
    }
    report.checks.push('Both actual ZIP downloads contain the exact edited acceptance, contract, correction limit and Maven answer. Planned cases stay NOT RUN, authority and commands stay unresolved, and no runtime or MCP configuration is fabricated.')

    for (const download of saved) {
      const reader = await context.newPage()
      await reader.setViewportSize({ width: 390, height: 900 })
      await reader.goto(pathToFileURL(download.htmlPath).href)
      await reader.locator('#viewer-nav-toggle').click()
      await reader.locator('[data-view="workflow"]').first().click()
      assert.match(await reader.locator('.process-design').innerText(), /Resolve the saved outcome without another write/)
      assert.equal(await reader.locator('.process-design .pd-scroll').isVisible(), true)
      assert.ok(await reader.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1))
      await reader.screenshot({ path: path.join(output, `offline-${download.kind}-390.png`) })
      await reader.close()

      await page.close()
      page = await context.newPage()
      designer = page.locator('#process-designer')
      page.setDefaultTimeout(10000)
      await page.goto(base)
      await page.locator('#import-config').click()
      await page.locator('#import-file').setInputFiles(download.filePath)
      await page.locator('#project-name').waitFor({ state: 'visible' })
      await briefView(page, 'intent')
      assert.equal(await page.locator('[data-field="workflow.answers.acceptance"]').inputValue(), acceptance)
      await briefView(page, 'project')
      await page.locator('[data-detail="profile-maven"] > summary').click()
      assert.equal(await page.locator('[data-field="workflow.answers.technology-maven-0"]').inputValue(), recordedAnswer)
      assert.equal(await page.locator('[data-field="components.0.commands.test"]').inputValue(), '')
      await openDesigner()
      await chooseRecord('results', 'candidate')
      assert.equal(await designer.locator('[data-pe-bind="results.3.expectedStructure"]').inputValue(), contract)
      await chooseRecord('corrections', 'selection-correction')
      assert.equal(await designer.locator('[data-pe-bind="corrections.0.maxCorrections"]').inputValue(), '1')
      report.checks.push(`The actual ${download.kind} ZIP reopens through Open pack with all accepted edits and unresolved facts intact. Its Project Atlas renders the process offline at 390px.`)
    }
    assert.equal(report.providerCalls, 0)
    assert.equal(report.inferenceRequests, 0)
    assert.deepEqual(report.errors, [])
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    console.log(`API path UI passed. ${report.checks.length} check groups and ${report.downloads.length} actual ZIP downloads. Evidence: ${output}`)
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
