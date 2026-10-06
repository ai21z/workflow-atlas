const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

let playwright
try { playwright = require('playwright') }
catch { playwright = require(path.resolve(path.dirname(process.execPath), '../node_modules/playwright')) }

const root = path.resolve(__dirname, '..')
const output = path.join(root, 'local-knowledge/retests/navigation-recovery', new Date().toISOString().replace(/[:.]/g, '-'))
const evidence = {
  method: 'Chrome, public interface actions and a separate loopback server with no credential and a provider transport that rejects every call.',
  limits: 'Functional keyboard, history and viewport regression. This is not a screen reader audit, a human usability study or a real mobile device observation.',
  checks: [], pageErrors: [], navigationErrors: [], providerCalls: 0,
}
let server, browser, context, page, base
let checkpoints = []
const note = 'Keep this exact stage note through Knowledge navigation.'

async function focus() {
  return page.evaluate(() => ({ tag: document.activeElement?.tagName, id: document.activeElement?.id, text: document.activeElement?.textContent?.trim().slice(0, 100) }))
}

async function fresh(viewport = { width: 1440, height: 1000 }) {
  if (context) await context.close()
  context = await browser.newContext({ viewport, reducedMotion: 'reduce' })
  page = await context.newPage()
  page.on('pageerror', error => evidence.pageErrors.push(error.message))
  await page.goto(base)
  await page.getByRole('button', { name: 'Build a feature Outline the change and how to check it.', exact: true }).press('Enter')
  await page.getByRole('textbox', { name: 'Project name', exact: true }).fill('Navigation recovery example')
  await page.locator('#project-purpose').fill('Export the currently filtered report to CSV.')
  await page.locator('.main-navigation [data-main-view="workflow"]').press('Enter')
  await page.getByRole('button', { name: 'Requirements and evidence', exact: true }).press('Enter')
  await page.getByRole('textbox', { name: 'Instructions and handoff for this stage', exact: true }).fill(note)
}

async function openKnowledge() {
  checkpoints.push('Open stage guidance')
  const before = await page.evaluate(() => history.length)
  await page.getByRole('button', { name: 'Read related guidance ↗', exact: true }).press('Enter')
  await page.frameLocator('#knowledge-frame').getByRole('button', { name: '← Back to workspace', exact: true }).waitFor({ state: 'visible' })
  await page.waitForFunction(() => location.hash.startsWith('#knowledge/requirements/read'), null, { timeout: 3000 })
  assert.equal(await page.evaluate(() => history.length), before + 1, 'Opening guidance adds one meaningful history entry')
  assert.equal(await page.locator('.studio-header').evaluate(element => element.inert), false, 'The shared header remains usable from Knowledge map')
}

async function assertKnowledge(topicId = 'requirements', mode = 'read') {
  await page.waitForFunction(({ topicId, mode }) => location.hash === `#knowledge/${topicId}/${mode}`, { topicId, mode }, { timeout: 3000 })
  assert.equal(await page.locator('#knowledge-workspace').isVisible(), true)
  assert.equal(page.frames().some(frame => frame.parentFrame() && frame.url() === 'about:blank'), false)
  assert.equal(await page.locator('.main-navigation [data-main-view="knowledge"]').getAttribute('aria-current'), 'page')
}

async function history(direction) {
  checkpoints.push(`Browser ${direction}`)
  try { await page[direction]({ waitUntil: 'commit', timeout: 3000 }) }
  catch (error) { evidence.navigationErrors.push({ direction, message: error.message.split('\n')[0] }) }
}

async function assertStageRestored() {
  checkpoints.push('Verify the stage, note and return focus')
  await page.waitForFunction(() => location.hash === '#stage-requirements', null, { timeout: 3000 })
  assert.equal(await page.locator('#knowledge-workspace').isVisible(), false)
  assert.ok((await page.locator('#knowledge-frame').getAttribute('src')).includes('/atlas/'), 'Returning keeps the loaded Knowledge map')
  assert.equal(page.frames().some(frame => frame.parentFrame() && frame.url() === 'about:blank'), false)
  assert.equal(await page.getByRole('textbox', { name: 'Instructions and handoff for this stage', exact: true }).inputValue(), note)
  assert.equal((await focus()).text, 'Read related guidance ↗')
  const sharedNav=await page.locator('.main-navigation [data-main-view="brief"]').evaluate(link=>{
    const rect=link.getBoundingClientRect()
    return rect.top>=0 && rect.bottom<=innerHeight && link.contains(document.elementFromPoint(rect.left+rect.width/2,rect.top+rect.height/2))
  })
  assert.equal(sharedNav,true,'The shared navigation stays visible and can be hit while reading a narrow stage inspector.')
}

async function persist() {
  await fs.writeFile(path.join(output, 'results.json'), JSON.stringify(evidence, null, 2) + '\n')
  await fs.writeFile(path.join(output, 'report.txt'), [evidence.method, evidence.limits, '', ...evidence.checks.map(item => `${item.id}: ${item.status}${item.error ? '. ' + item.error : ''}`), '', `Provider calls: ${evidence.providerCalls}`, `Page errors: ${evidence.pageErrors.length}`].join('\n') + '\n')
}

async function check(id, action) {
  const item = { id, status: 'Not run' }
  checkpoints = []
  evidence.checks.push(item)
  try { item.observation = await action(); item.status = 'Pass' }
  catch (error) { item.status = 'Fail'; item.error = error.message }
  if (page && !page.isClosed()) {
    item.visibleState = await page.evaluate(() => ({ url: location.href, active: document.activeElement?.tagName, activeId: document.activeElement?.id, iframeSources: [...document.querySelectorAll('iframe')].map(frame => ({ id: frame.id, src: frame.getAttribute('src') })), width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth }))
    item.frames = page.frames().map(frame => frame.url())
    item.checkpoints = [...checkpoints]
    item.frameFocus = await Promise.all(page.frames().map(async frame => ({url:frame.url(),...await frame.evaluate(() => ({id:document.activeElement?.id,tag:document.activeElement?.tagName}))})))
    item.screenshot = `${id}.png`
    await page.screenshot({ path: path.join(output, item.screenshot), fullPage: false })
  }
  await persist()
  console.log(`${id}: ${item.status}${item.error ? '. ' + item.error.split('\n')[0] : ''}`)
}

async function run() {
  await fs.mkdir(output, { recursive: true })
  const { createAtlasServer } = await import(pathToFileURL(path.join(root, 'tools/serve.mjs')).href)
  server = await createAtlasServer({ getApiKey: () => '', transport: async () => { evidence.providerCalls += 1; throw new Error('Provider disabled for navigation regression') } })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${server.address().port}/factory/`
  browser = await playwright.chromium.launch({ channel: 'chrome', headless: true })

  await check('desktop-back-restores-stage', async () => {
    await fresh()
    await openKnowledge()
    await history('goBack')
    await assertStageRestored()
    return 'One browser Back returns to the stage, its exact note and its guidance opener.'
  })

  await check('mobile-back-forward-repeated-knowledge', async () => {
    await fresh({ width: 320, height: 568 })
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await openKnowledge()
      await history('goBack')
      await assertStageRestored()
      await history('goForward')
      await page.frameLocator('#knowledge-frame').getByRole('button', { name: '← Back to workspace', exact: true }).waitFor({ state: 'visible' })
      await assertKnowledge()
      await page.frameLocator('#knowledge-frame').getByRole('button', { name: '← Back to workspace', exact: true }).press('Enter')
      await assertStageRestored()
    }
    return 'Back, Forward and the explicit return preserve the stage across repeated opens at 320 by 568.'
  })

  await check('mobile-explicit-return-reopen-back', async () => {
    await fresh({ width: 320, height: 568 })
    for (let cycle = 0; cycle < 2; cycle += 1) {
      await openKnowledge()
      checkpoints.push(`Explicit return ${cycle + 1}`)
      await page.frameLocator('#knowledge-frame').getByRole('button', { name: '← Back to workspace', exact: true }).press('Enter')
      await assertStageRestored()
    }
    await openKnowledge()
    await history('goBack')
    await assertStageRestored()
    return 'After two explicit Knowledge returns, reopening and pressing Back still returns once to the stage.'
  })

  await check('topic-history-remains-usable', async () => {
    await fresh()
    await openKnowledge()
    const frame = page.frameLocator('#knowledge-frame')
    await frame.getByRole('searchbox', { name: 'Search all topics', exact: true }).fill('Requirements investigation')
    await frame.getByRole('button', { name: 'Requirements investigation. Practice. Read topic', exact: true }).press('Enter')
    await frame.getByRole('heading', { name: 'Requirements investigation', exact: true }).waitFor({ state: 'visible' })
    await assertKnowledge('requirements-workflow')
    await history('goBack')
    await frame.getByRole('heading', { name: 'Requirements & traceability', exact: true }).waitFor({ state: 'visible', timeout: 3000 })
    await assertKnowledge()
    await history('goBack')
    await assertStageRestored()
    await history('goForward')
    await frame.getByRole('heading', { name: 'Requirements & traceability', exact: true }).waitFor({ state: 'visible', timeout: 3000 })
    await assertKnowledge()
    return 'Back traverses the selected topic before returning to the stage. Forward restores usable guidance.'
  })

  await check('mobile-nested-topic-escape', async () => {
    await fresh({ width: 320, height: 568 })
    await openKnowledge()
    const frame = page.frameLocator('#knowledge-frame')
    await frame.getByRole('button', { name: 'Search topics', exact: true }).press('Enter')
    await frame.getByRole('searchbox', { name: 'Search all topics', exact: true }).press('Escape')
    await assertKnowledge()
    const actualFrame = page.frames().find(item => item.url().includes('/atlas/'))
    assert.equal(await actualFrame.evaluate(() => document.activeElement?.id), 'mobile-topics')
    await frame.getByRole('button', { name: 'Search topics', exact: true }).press('Escape')
    await assertStageRestored()
    return 'First Escape closes the topic dialog. Second Escape returns to the existing stage.'
  })

  await check('short-light-output-change-focus', async () => {
    await fresh({ width: 320, height: 568 })
    await page.getByRole('button', { name: 'Close details', exact: true }).press('Escape')
    await page.getByRole('switch', { name: 'Dark mode', exact: true }).press('Space')
    await page.getByRole('button', { name: 'Download', exact: true }).press('Enter')
    await page.getByRole('radio', { name: 'One focused skill Give an assistant one procedure, such as diagnosis or review.', exact: true }).press('Space')
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute('data-output-kind')), 'skill')
    await page.getByRole('combobox', { name: 'Choose one procedure', exact: true }).selectOption({ label: 'Verification' })
    assert.equal((await focus()).id, 'output-skill')
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true)
    const dialogFits = await page.locator('#download-dialog').evaluate(element => { const r = element.getBoundingClientRect(); return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight })
    assert.equal(dialogFits, true)
    await page.screenshot({ path: path.join(output, 'short-light-output-modal.png'), fullPage: false })
    await page.getByRole('button', { name: 'Close downloads', exact: true }).press('Escape')
    assert.equal((await focus()).id, 'download-project')
    return 'Output radio and procedure choice retain focus, dialog fits, and Escape returns to Download.'
  })
}

run().catch(error => { evidence.fatal = error.stack; process.exitCode = 1 }).finally(async () => {
  if (evidence.checks.some(item => item.status !== 'Pass') || evidence.providerCalls || evidence.pageErrors.length || evidence.navigationErrors.length) process.exitCode = 1
  await persist()
  if (browser) await browser.close()
  if (server) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
  console.log(`Evidence: ${output}`)
})
