// Public controls shared by the three-view browser regression journeys.
async function briefView(page, section = 'intent') {
  await page.locator('.main-navigation [data-main-view="brief"]').click()
  await page.locator('#brief-workspace').waitFor({ state: 'visible' })
  await page.locator(`#details-nav [data-goto="${section}"]`).click()
}

async function workflowView(page) {
  await page.locator('.main-navigation [data-main-view="workflow"]').click()
  const editor = page.locator('#view-nav [data-project-view="workflow"]')
  if (await editor.isVisible()) await editor.click()
}

async function closeWorkspaceDetails(page) {
  if (await page.locator('body').evaluate(element => element.classList.contains('brief-mode'))) {
    await workflowView(page)
  } else if (await page.locator('#close-inspector').isVisible()) {
    await page.locator('#close-inspector').click()
  }
}

module.exports = { briefView, workflowView, closeWorkspaceDetails }
