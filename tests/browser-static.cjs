const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const http = require('node:http')
const path = require('node:path')
const { pathToFileURL } = require('node:url')
const { chromium } = require('playwright')

async function run() {
  const root = path.resolve(__dirname, '..')
  const { buildStatic, PUBLIC_ASSETS } = await import(pathToFileURL(path.join(root, 'tools/build-static.mjs')).href)
  const { unzipTextFiles } = await import(pathToFileURL(path.join(root, 'factory/zip.mjs')).href)
  const bundle = await buildStatic({ rootDir: root, knownSecrets: [] })
  const prefix = '/workflow-atlas/'
  const allowed = new Set(PUBLIC_ASSETS)
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.md': 'text/plain', '.txt': 'text/plain' }
  // Serve only the actual public build, at the same subpath used by a project Pages site.
  const server = http.createServer(async (request, response) => {
    try {
      const pathname = new URL(request.url, 'http://localhost').pathname
      if (request.method !== 'GET' || !pathname.startsWith(prefix)) {
        response.writeHead(404).end('Not found')
        return
      }
      let relative = decodeURIComponent(pathname.slice(prefix.length))
      if (!relative || relative.endsWith('/')) relative += 'index.html'
      if (!allowed.has(relative)) {
        response.writeHead(404).end('Not found')
        return
      }
      const bytes = await fs.readFile(path.join(bundle.output, ...relative.split('/')))
      response.writeHead(200, { 'Content-Type': `${types[path.extname(relative)] || 'application/octet-stream'}; charset=utf-8` }).end(bytes)
    } catch { response.writeHead(500).end('Static fixture error') }
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const origin = `http://127.0.0.1:${server.address().port}`
  const base = `${origin}${prefix}`
  const output = path.join(root, 'local-knowledge/retests/static-pages', new Date().toISOString().replace(/[:.]/g, '-'))
  const report = {
    method: 'Installed Chrome uses a real allowlisted static build mounted under /workflow-atlas/. Actual controls, downloaded ZIP bytes and file-input reopening. No backend or provider access.',
    limits: 'Controlled static-host simulation. Does not establish live GitHub deployment, human comprehension or assistive technology compatibility.',
    build: { files: bundle.files, credentialFindings: bundle.credentialFindings },
    checks: [], errors: [], apiRequests: [], externalRequests: [], badResponses: []
  }
  let browser
  try {
    await fs.mkdir(output, { recursive: true })
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true, reducedMotion: 'reduce' })
    await context.route('**/*', route => {
      const request = route.request()
      const url = new URL(request.url())
      if (/^https?:$/.test(url.protocol) && url.origin !== origin) {
        report.externalRequests.push(request.url())
        return route.abort()
      }
      if (url.pathname.includes('/api/')) {
        report.apiRequests.push({ method: request.method(), path: url.pathname })
        return route.abort()
      }
      return route.continue()
    })
    context.on('page', current => {
      current.setDefaultTimeout(10000)
      current.on('pageerror', error => report.errors.push(error.message))
      current.on('response', response => {
        if (response.status() >= 400) report.badResponses.push({ url: response.url(), status: response.status() })
      })
    })
    const page = await context.newPage()
    await page.goto(base)
    await page.waitForURL(`${base}factory/**`)
    await page.locator('#start-screen').waitFor({ state: 'visible' })
    assert.equal(await page.locator('html').getAttribute('data-atlas-hosting'), 'static')
    await page.waitForFunction(() => document.querySelector('#jev-status').textContent.trim().length > 0)
    const submission = page.locator('#jev-submit')
    assert.ok(!await submission.isVisible() || await submission.isDisabled())
    report.checks.push('The project root redirects inside /workflow-atlas/ and identifies static hosting without probing an API.')

    const purpose = 'Let customers save and reopen their search filters.'
    await page.locator('#jev-brief').fill(purpose)
    await page.locator('#jev-brief').press('Enter')
    await page.locator('#jev-form').evaluate(form => form.requestSubmit())
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
    assert.ok(!await submission.isVisible() || await submission.isDisabled())
    assert.deepEqual(report.apiRequests, [])
    assert.deepEqual(report.externalRequests, [])
    assert.match(await page.locator('#jev-brief').inputValue(), /save and reopen/)
    report.checks.push('Typing, Enter and form submission cannot send a brief to a missing static-site API. The supplied description stays available.')

    await page.locator('[data-start-recipe="feature-delivery"]').click()
    await page.locator('#jev-create').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#jev-practice-details').isVisible(), false)
    await page.locator('#jev-practice').evaluate(select => {
      select.value = 'specification-first'
      select.dispatchEvent(new Event('change', { bubbles: true }))
      document.querySelector('[data-jev-action="check-practice"]').click()
    })
    assert.deepEqual(report.apiRequests, [])
    await page.locator('#jev-create').click()
    await page.locator('#studio-layout').waitFor({ state: 'visible' })
    assert.equal((await page.locator('#project-purpose').inputValue()).trim(), purpose)
    await page.locator('#project-name').fill('Static hosting trial')
    await page.locator('#project-name').press('Tab')
    report.checks.push('A manually selected feature workflow uses the entered description and creates an editable project without inference.')

    await page.locator('#open-knowledge-map').click()
    const map = page.frameLocator('#knowledge-frame')
    await map.locator('#knowledge-back').waitFor({ state: 'visible' })
    const frameUrl = await page.locator('#knowledge-frame').evaluate(element => element.contentWindow.location.href)
    assert.ok(frameUrl.startsWith(`${base}atlas/`))
    await map.locator('#knowledge-back').click()
    await page.locator('#studio-layout').waitFor({ state: 'visible' })
    assert.equal(await page.locator('#project-name').inputValue(), 'Static hosting trial')
    report.checks.push('The embedded Knowledge Atlas loads beneath the project path and returns to the same edited workflow.')

    await page.locator('#open-help').click()
    const popup = context.waitForEvent('page')
    await page.locator('#help-dialog a[href="../docs/"]').click()
    const guide = await popup
    await guide.waitForLoadState('domcontentloaded')
    await guide.locator('#guide-article h1').waitFor({ state: 'visible' })
    assert.ok(guide.url().startsWith(`${base}docs/`))
    await guide.close()
    await page.locator('[data-close-dialog="help-dialog"]').click()
    report.checks.push('Help opens the rendered documentation from the same /workflow-atlas/ path.')

    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: 1000 })
      const toggle = page.getByRole('switch', { name: 'Dark mode', exact: true })
      for (const theme of ['light', 'dark']) {
        if (await page.locator('html').getAttribute('data-theme') !== theme) await toggle.click()
        assert.equal(await toggle.getAttribute('aria-checked'), String(theme === 'dark'))
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `${width}/${theme} page overflow`)
      }
      await page.screenshot({ path: path.join(output, `workflow-${width}-dark.png`), fullPage: true })
    }
    report.checks.push('The workflow fits desktop and 390px widths, with the accessible theme switch controlling both themes.')

    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.locator('#download-project').click()
    await page.locator('[data-output-kind="blueprint"]').check()
    const downloadEvent = page.waitForEvent('download')
    await page.locator('[data-studio-action="download-output"]').click()
    const downloaded = await downloadEvent
    const bytes = await fs.readFile(await downloaded.path())
    const { files } = await unzipTextFiles(new Uint8Array(bytes))
    const project = JSON.parse(files.find(file => file.path === 'project.json').content)
    const manifest = JSON.parse(files.find(file => file.path === 'manifest.json').content)
    assert.equal(project.project.name, 'Static hosting trial')
    assert.equal(project.project.purpose.trim(), purpose)
    assert.equal(manifest.kind, 'blueprint')
    assert.match(files.find(file => file.path === 'WORKFLOW.md').content, /save and reopen their search filters/)
    assert.ok(files.some(file => file.path === 'PROJECT-ATLAS.html'))
    await fs.writeFile(path.join(output, 'static-trial.zip'), bytes)
    report.checks.push('The actual downloaded blueprint ZIP preserves the supplied intent, workflow guide and readable project Atlas.')

    const reopened = await context.newPage()
    await reopened.goto(`${base}factory/`)
    await reopened.locator('#start-screen').waitFor({ state: 'visible' })
    await reopened.locator('#import-file').setInputFiles({ name: 'static-trial.zip', mimeType: 'application/zip', buffer: bytes })
    await reopened.locator('#studio-layout').waitFor({ state: 'visible' })
    assert.equal(await reopened.locator('#project-name').inputValue(), 'Static hosting trial')
    assert.equal((await reopened.locator('#project-purpose').inputValue()).trim(), purpose)
    assert.deepEqual(await context.storageState(), { cookies: [], origins: [] })
    report.checks.push('A fresh tab starts empty and reopens the downloaded bytes through the file input, without browser-storage persistence.')
    assert.deepEqual(report.apiRequests, [])
    assert.deepEqual(report.externalRequests, [])
    assert.deepEqual(report.badResponses, [])
    assert.deepEqual(report.errors, [])
    report.passed = true
    console.log(`PASS ${report.checks.length} static Pages browser checks. Evidence: ${output}`)
  } catch (error) {
    report.passed = false
    report.failure = error.stack || String(error)
    throw error
  } finally {
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n')
    await browser?.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  }
}

run().catch(error => { console.error(error); process.exitCode = 1 })
