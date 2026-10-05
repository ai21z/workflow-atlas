const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { chromium } = require('playwright')

async function run() {
  const root = path.resolve(__dirname, '..')
  const { createAtlasServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href)
  const { createRecipe, compileSelectedOutput } = await import(pathToFileURL(path.join(root, 'factory/core.mjs')).href)
  const { packageProject } = await import(pathToFileURL(path.join(root, 'factory/portable.mjs')).href)
  const { zipFiles, unzipTextFiles } = await import(pathToFileURL(path.join(root, 'factory/zip.mjs')).href)
  const output = path.join(root, 'local-knowledge/retests/import-recovery', new Date().toISOString().replace(/[:.]/g, '-'))
  await fs.mkdir(output, { recursive: true })
  const report = {
    method: 'Public browser UI and file chooser events on an isolated server without credentials. Synthetic malformed files and externally edited packs. Download preparation faults are explicitly injected at URL.createObjectURL.',
    limits: 'This checks draft preservation and error recovery. It does not measure native picker appearance, user comprehension, browser download cancellation or disk write completion.',
    checks: [], pageErrors: [], providerCalls: 0,
  }
  let browser, page, context
  const server = await createAtlasServer({ rootDir: root, getApiKey: () => undefined, transport: () => { report.providerCalls++; throw new Error('Unexpected provider call') } })
  const record = async () => fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
  const check = async (id, action) => {
    const entry = { id, status: 'Not run' }
    report.checks.push(entry)
    try { entry.observation = await action(); entry.status = 'Pass' }
    catch (error) { entry.status = 'Fail'; entry.error = error.stack || String(error) }
    if (page && !page.isClosed()) await page.screenshot({ path: path.join(output, `${id}.png`) }).catch(() => {})
    await record()
    console.log(`${id}: ${entry.status}`)
  }
  const fresh = async ({ failDownload = false } = {}) => {
    await context?.close()
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
    if (failDownload) await context.addInitScript(() => {
      const original = URL.createObjectURL
      URL.createObjectURL = function (blob) {
        if (blob instanceof Blob) throw new Error('Synthetic Blob URL allocation failure')
        return original.call(this, blob)
      }
    })
    page = await context.newPage()
    page.setDefaultTimeout(7000)
    page.on('pageerror', error => report.pageErrors.push(error.message))
    await page.goto(`http://127.0.0.1:${server.address().port}/factory/`)
    await page.locator('#start-screen').waitFor({ state: 'visible' })
  }
  const start = async () => {
    await page.locator('[data-start-recipe="bugfix"]').click()
    await page.locator('#brief-name').fill('Keep my repair draft')
    await page.locator('#brief-purpose').fill('Repair saved filters while keeping false, zero and empty text distinct.')
    await page.locator('#brief-context').fill('Unverified issue note: preserve <filter>, Ελληνικά and literal ``` exactly.')
    await page.locator('#brief-form button[type="submit"]').click()
    await page.locator('#download-project').click()
    await page.locator('[data-output-kind="skill"]').check()
    await page.locator('#output-skill').selectOption('bug-diagnosis')
    await page.locator('[data-close-dialog="download-dialog"]').click()
  }
  const openFile = async file => {
    await page.locator('#import-config').click()
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      page.locator('[data-studio-action="choose-project-file"]').click(),
    ])
    await chooser.setFiles(file)
  }
  const readConfig = async () => {
    if (await page.locator('#inspector').isVisible()) await page.locator('#close-inspector').click()
    await page.locator('#view-nav [data-project-view="artifacts"]').click()
    await page.locator('[data-file="project.json"]').click()
    return JSON.parse(await page.locator('#file-preview').innerText())
  }
  const assertFocusedOutput = async () => {
    await page.locator('#download-project').click()
    assert.equal(await page.locator('[data-output-kind="skill"]').isChecked(), true)
    assert.equal(await page.locator('#output-skill').inputValue(), 'bug-diagnosis')
    await page.locator('[data-close-dialog="download-dialog"]').click()
  }
  const fixture = async (name, bytes) => {
    const destination = path.join(output, name)
    await fs.writeFile(destination, bytes)
    return destination
  }
  const receive = async (button, name) => {
    const pending = page.waitForEvent('download')
    await button.click()
    const download = await pending
    const destination = path.join(output, name)
    await download.saveAs(destination)
    assert.equal(await download.failure(), null)
    return new Uint8Array(await fs.readFile(destination))
  }
  const expectDirty = async () => assert.match(await page.locator('#save-state').innerText(), /Changes not downloaded/)
  const reviewFiles = async () => {
    await page.locator('#review-project').click()
    const maintenance = page.locator('[data-detail="maintenance"]')
    if (await maintenance.getAttribute('open') === null) await maintenance.locator('summary').first().click()
  }
  const chooseFile = async (target, value = 'existing') => {
    const row = page.locator('.comparison-row').filter({ has: page.locator(`[data-resolution="${target}"]`) })
    if (await row.getAttribute('open') === null) await row.locator('summary').click()
    await row.locator('[data-resolution]').selectOption(value)
  }
  const rejectFile = async file => {
    await openFile(file)
    await page.waitForFunction(() => document.querySelector('#import-file').value === '')
    await page.locator('#toast').filter({ hasText: 'Could not open this project.' }).waitFor({ state: 'visible' })
    const message = await page.locator('#toast').innerText()
    assert.match(message, /Your current project is unchanged/)
    assert.equal(await page.locator('#confirm-dialog').isVisible(), false)
    assert.equal(await page.locator('#import-file').inputValue(), '')
    await page.locator('[data-close-dialog="open-dialog"]').click()
    return message
  }
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve) })
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    report.browser = browser.version()
    const replacement = createRecipe('feature-delivery')
    replacement.project.name = 'Replacement feature'
    replacement.project.purpose = 'Share a saved filter with one colleague.'
    const replacementJSON = await fixture('replacement.project.json', JSON.stringify(replacement))
    const malformed = [
      ['truncated.json', '{"schemaVersion":'],
      ['unsupported.json', JSON.stringify({ ...replacement, schemaVersion: '9000.0' })],
      ['binary.json', Buffer.from([0xff, 0xfe, 0x00, 0x61])],
      ['broken.zip', Buffer.from('PK\u0003\u0004not a complete archive')],
      ['ordinary.zip', zipFiles([{ path: 'README.md', content: 'No Atlas metadata here.' }])],
      ['ambiguous.zip', zipFiles([{ path: 'first/project.json', content: JSON.stringify(replacement) }, { path: 'second/project.json', content: JSON.stringify(replacement) }])],
      ['ordinary.html', '<html><script>document.body.dataset.executed="yes"</script><p>No snapshot</p></html>'],
      ['truncated.html', '<script id="workflow-atlas-project" type="application/json">{"kind":</script>'],
    ]
    const malformedFiles = await Promise.all(malformed.map(async ([name, bytes]) => ({ name, file: await fixture(name, bytes) })))
    await check('malformed-inputs-preserve-dirty-draft', async () => {
      await fresh()
      await start()
      const before = await readConfig()
      const results = []
      for (const item of malformedFiles) {
        const message = await rejectFile(item.file)
        assert.deepEqual(await readConfig(), before, item.name)
        await assertFocusedOutput()
        await expectDirty()
        results.push({ file: item.name, message })
      }
      assert.equal(await page.locator('body').getAttribute('data-executed'), null)
      return { rejected: results, exactDecisionsAndOutputPreserved: true, importedHTMLDidNotExecute: true }
    })
    await check('replacement-requires-explicit-confirmation', async () => {
      await fresh()
      await start()
      const before = await readConfig()
      for (const cancel of ['button', 'escape']) {
        await openFile(replacementJSON)
        await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
        assert.equal(await page.locator('#project-name').inputValue(), before.project.name)
        if (cancel === 'button') await page.locator('#confirm-dialog [value="cancel"]').click()
        else await page.keyboard.press('Escape')
        await page.locator('#confirm-dialog').waitFor({ state: 'hidden' })
        assert.deepEqual(await readConfig(), before)
        await assertFocusedOutput()
        await expectDirty()
      }
      await openFile(replacementJSON)
      await page.locator('#confirm-dialog [value="replace"]').click()
      await page.locator('#project-name').filter({ visible: true }).waitFor()
      assert.deepEqual(await readConfig(), replacement)
      assert.doesNotMatch(await page.locator('#save-state').innerText(), /Changes not downloaded/)
      return 'Both Keep this session and Escape preserve the exact dirty draft and focused output. Only Replace project installs the selected replacement.'
    })
    await check('failed-import-preserves-external-edits-and-review-reason', async () => {
      const original = createRecipe('bugfix')
      original.project.name = 'Externally edited repair'
      original.project.purpose = 'Keep external reviewer notes when reopening.'
      const generated = packageProject(original, compileSelectedOutput(original, { kind: 'skill', skillId: 'bug-diagnosis' }))
      const target = '.github/skills/bug-diagnosis/references/project.md'
      const exact = generated.files.map(file => ({ path: file.path, content: file.content + (file.path === target ? '\n## External note\nKeep Ω, <policy> and literal ``` exactly.\r\n' : '') }))
      const edited = await fixture('edited-skill.zip', zipFiles(exact))
      await fresh()
      await openFile(edited)
      await page.locator('#studio-layout').waitFor({ state: 'visible' })
      await page.locator('#project-purpose').fill('Retain supplied edits while we compare the repair options.')
      await page.locator('#review-project').click()
      await page.locator('#decision-review-reason').fill('Keep the reviewer wording until the owner decides.')
      if (await page.locator('#inspector').isVisible()) await page.locator('#close-inspector').click()
      const before = await readConfig()
      await rejectFile(malformedFiles.find(item => item.name === 'broken.zip').file)
      assert.deepEqual(await readConfig(), before)
      await assertFocusedOutput()
      await expectDirty()
      await page.locator('#review-project').click()
      assert.equal(await page.locator('#decision-review-reason').inputValue(), 'Keep the reviewer wording until the owner decides.')
      await page.locator('#close-inspector').click()
      await page.locator('#view-nav [data-project-view="artifacts"]').click()
      assert.match(await page.locator('#opened-files-strip').innerText(), /supplied files? needs? review/)
      const retainedBytes = await receive(page.locator('#opened-files-strip [data-studio-action="download-opened-files"]'), 'retained-original-files.zip')
      const retained = await unzipTextFiles(retainedBytes)
      assert.deepEqual(new Map(retained.files.map(file => [file.path, file.content])), new Map(exact.map(file => [file.path, file.content])))
      await expectDirty()
      return { exactOriginalFileContentsRetained: exact.length, reviewReasonRetained: true, downloadingOriginalFilesDoesNotMarkNewDecisionsKept: true }
    })
    await check('download-preparation-failure-keeps-replacement-warning', async () => {
      await fresh({ failDownload: true })
      await start()
      const before = await readConfig()
      await page.locator('#download-project').click()
      await page.locator('[data-studio-action="download-output"]').click()
      assert.match(await page.locator('#download-result').innerText(), /Download failed.*Synthetic Blob URL allocation failure.*Your work remains/)
      await page.locator('[data-close-dialog="download-dialog"]').click()
      await expectDirty()
      await page.locator('#new-project').click()
      await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
      await page.locator('#download-before-replace').click()
      assert.match(await page.locator('#toast').innerText(), /Export failed.*Synthetic Blob URL allocation failure/)
      assert.equal(await page.locator('#confirm-dialog').isVisible(), true)
      await page.locator('#confirm-dialog [value="cancel"]').click()
      assert.deepEqual(await readConfig(), before)
      await expectDirty()
      await page.locator('#export-config').click()
      assert.match(await page.locator('#toast').innerText(), /Project download failed.*Synthetic Blob URL allocation failure/)
      await expectDirty()
      return 'ZIP, JSON and download-before-replacement preparation failures retain the dirty draft. Replacement remains an explicit decision.'
    })
    await check('file-resolution-choices-require-replacement-confirmation', async () => {
      await fresh()
      await openFile(path.join(output, 'edited-skill.zip'))
      await page.locator('#studio-layout').waitFor({ state: 'visible' })
      await reviewFiles()
      await page.locator('[data-action="compare-pack"]').click()
      const target = '.github/skills/bug-diagnosis/references/project.md'
      await chooseFile(target)
      await page.locator('#close-inspector').click()
      await expectDirty()
      await rejectFile(malformedFiles[0].file)
      await reviewFiles()
      assert.equal(await page.locator(`[data-resolution="${target}"]`).inputValue(), 'existing')
      await page.locator('#close-inspector').click()
      await page.locator('#new-project').click()
      await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
      assert.match(await page.locator('#confirm-description').innerText(), /file review choices have not been downloaded/)
      await page.locator('#confirm-dialog [value="cancel"]').click()
      await reviewFiles()
      assert.equal(await page.locator(`[data-resolution="${target}"]`).inputValue(), 'existing')
      await page.locator('#close-inspector').click()
      await readConfig()
      await receive(page.locator('#export-config'), 'decisions-do-not-keep-file-review.json')
      await expectDirty()
      await page.locator('#new-project').click()
      assert.equal(await page.locator('#download-before-replace').innerText(), 'Download reviewed files')
      const bytes = await receive(page.locator('#download-before-replace'), 'kept-reviewed-files.zip')
      const retained = new Map((await unzipTextFiles(bytes)).files.map(file => [file.path, file.content]))
      assert.ok(retained.get(target).includes('Keep Ω, <policy> and literal ``` exactly.'))
      const record = JSON.parse(retained.get('ATLAS-COMPARISON.json'))
      assert.equal(record.comparison.decisions.find(row => row.path === target).choice, 'existing')
      assert.equal(await page.locator('#download-before-replace').innerText(), 'Download current project')
      await page.locator('#confirm-dialog [value="cancel"]').click()
      assert.doesNotMatch(await page.locator('#save-state').innerText(), /Changes not downloaded/)
      await reviewFiles()
      await chooseFile(target, 'generated')
      await expectDirty()
      return 'Malformed import and replacement cancellation retain file choices. Project JSON does not mark them kept. The reviewed ZIP retains the exact chosen file and comparison record. Changing that choice makes it pending again.'
    })
    await check('reviewed-export-does-not-keep-unrelated-edits', async () => {
      await fresh()
      await openFile(path.join(output, 'edited-skill.zip'))
      await page.locator('#studio-layout').waitFor({ state: 'visible' })
      await page.locator('#project-purpose').fill('This current project outcome must still be kept separately.')
      await reviewFiles()
      await page.locator('#decision-review-reason').fill('This decision review reason also needs its own download.')
      await page.locator('[data-action="compare-pack"]').click()
      const unresolved = await page.locator('[data-resolution]').evaluateAll(elements => elements.filter(element => !element.value).map(element => element.dataset.resolution))
      for (const target of unresolved) await chooseFile(target)
      await receive(page.locator('[data-action="export-reconciled"]'), 'reviewed-original-with-new-project-edits.zip')
      await expectDirty()
      await page.locator('#close-inspector').click()
      await page.locator('#new-project').click()
      await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
      assert.doesNotMatch(await page.locator('#confirm-description').innerText(), /file review choices/)
      await page.locator('#confirm-dialog [value="cancel"]').click()
      return 'Keeping resolved files leaves separate project decisions and the comparison reason pending.'
    })
    await check('failed-reviewed-export-retains-file-choices', async () => {
      await fresh({ failDownload: true })
      await openFile(path.join(output, 'edited-skill.zip'))
      await page.locator('#studio-layout').waitFor({ state: 'visible' })
      await reviewFiles()
      await page.locator('[data-action="compare-pack"]').click()
      await chooseFile('.github/skills/bug-diagnosis/references/project.md')
      await page.locator('[data-action="export-reconciled"]').click()
      assert.match(await page.locator('#toast').innerText(), /Synthetic Blob URL allocation failure/)
      await expectDirty()
      await page.locator('#close-inspector').click()
      await page.locator('#new-project').click()
      await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
      assert.equal(await page.locator('#download-before-replace').innerText(), 'Download reviewed files')
      await page.locator('#download-before-replace').click()
      assert.match(await page.locator('#toast').innerText(), /Synthetic Blob URL allocation failure/)
      assert.equal(await page.locator('#confirm-dialog').isVisible(), true)
      await page.locator('#confirm-dialog [value="cancel"]').click()
      await expectDirty()
      return 'A reviewed-file preparation failure keeps the file decisions pending through both download locations.'
    })
    await check('project-edits-preserve-pending-file-review', async () => {
      await fresh()
      await openFile(path.join(output, 'edited-skill.zip'))
      await page.locator('#studio-layout').waitFor({ state: 'visible' })
      await reviewFiles()
      await page.locator('[data-action="compare-pack"]').click()
      const target = '.github/skills/bug-diagnosis/references/project.md'
      await chooseFile(target)
      await page.locator('#close-inspector').click()
      await page.locator('#project-purpose').fill('A revised repair outcome after reviewing files.')
      await reviewFiles()
      assert.equal(await page.locator(`[data-resolution="${target}"]`).count(), 1, 'Editing project decisions must not silently discard file choices')
      assert.equal(await page.locator(`[data-resolution="${target}"]`).inputValue(), 'existing')
      assert.equal(await page.locator('#comparison-snapshot-note').isVisible(), true)
      await page.locator('#close-inspector').click()
      await page.locator('#undo').click()
      await reviewFiles()
      assert.equal(await page.locator(`[data-resolution="${target}"]`).inputValue(), 'existing')
      assert.equal(await page.locator('#comparison-snapshot-note').isHidden(), true)
      await page.locator('#close-inspector').click()
      await page.locator('#redo').click()
      await reviewFiles()
      assert.equal(await page.locator(`[data-resolution="${target}"]`).inputValue(), 'existing')
      assert.equal(await page.locator('#comparison-snapshot-note').isVisible(), true)
      await page.locator('[data-action="compare-pack"]').click()
      await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
      assert.equal(await page.locator('#confirm-title').innerText(), 'Replace this file review?')
      await page.locator('#confirm-dialog [value="cancel"]').click()
      assert.equal(await page.locator(`[data-resolution="${target}"]`).inputValue(), 'existing')
      const input = await fixture('comparison-input.json', JSON.stringify({ files: [{ path: target, content: 'Different supplied comparison text.' }] }))
      for (const action of ['load-baseline-json', 'load-existing-json']) {
        const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.locator(`[data-action="${action}"]`).click()])
        await chooser.setFiles(input)
        await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
        await page.locator('#confirm-dialog [value="cancel"]').click()
        assert.equal(await page.locator(`[data-resolution="${target}"]`).inputValue(), 'existing')
      }
      await page.locator('[data-action="save-snapshot"]').click()
      await page.locator('#confirm-dialog').waitFor({ state: 'visible' })
      await page.locator('#confirm-dialog [value="cancel"]').click()
      assert.equal(await page.locator(`[data-resolution="${target}"]`).inputValue(), 'existing')
      const bytes = await receive(page.locator('[data-action="export-reconciled"]'), 'earlier-comparison-snapshot.zip')
      const earlierFiles = new Map((await unzipTextFiles(bytes)).files.map(file => [file.path, file.content]))
      assert.equal(JSON.parse(earlierFiles.get('project.json')).project.purpose, 'Keep external reviewer notes when reopening.')
      assert.match(await page.locator('#toast').innerText(), /earlier comparison files/)
      await expectDirty()
      await chooseFile(target, 'generated')
      await page.locator('[data-action="compare-pack"]').click()
      await page.locator('#confirm-dialog [value="replace"]').click()
      await page.locator('#confirm-dialog').waitFor({ state: 'hidden' })
      await page.locator('#comparison-snapshot-note').waitFor({ state: 'hidden' })
      assert.equal(await page.locator('#comparison-snapshot-note').isHidden(), true)
      assert.equal(await page.locator(`[data-resolution="${target}"]`).inputValue(), '')
      await chooseFile(target)
      await page.locator('#decision-review-reason').fill('A later reason requires reviewing current generated text.')
      assert.equal(await page.locator('#comparison-snapshot-note').isVisible(), true)
      assert.equal(await page.locator(`[data-resolution="${target}"]`).inputValue(), 'existing')
      await page.locator('#decision-review-reason').fill('')
      assert.equal(await page.locator('#comparison-snapshot-note').isHidden(), true)
      await page.locator('#close-inspector').click()
      await page.locator('#download-project').click()
      await page.locator('[data-output-kind="blueprint"]').check()
      await page.locator('[data-close-dialog="download-dialog"]').click()
      await reviewFiles()
      assert.equal(await page.locator('#comparison-snapshot-note').isVisible(), true)
      assert.equal(await page.locator(`[data-resolution="${target}"]`).inputValue(), 'existing')
      return 'Project edits, output changes and comparison wording retain frozen rows and choices with a visible scope notice. Recompute and comparison input replacements can be cancelled. The actual snapshot ZIP retains earlier text, while current project edits remain pending. Confirmed recomputation replaces the earlier choices.'
    })
    await check('runtime-errors-and-provider-calls', async () => {
      assert.deepEqual(report.pageErrors, [])
      assert.equal(report.providerCalls, 0)
      return 'No uncaught browser errors and no provider calls.'
    })
  } finally {
    await record()
    await Promise.all([browser?.close(), server.listening ? new Promise(resolve => server.close(resolve)) : undefined])
  }
  console.log(`Evidence: ${output}`)
  if (report.checks.some(check => check.status !== 'Pass')) process.exitCode = 1
}

run().catch(error => { console.error(error); process.exitCode = 1 })
