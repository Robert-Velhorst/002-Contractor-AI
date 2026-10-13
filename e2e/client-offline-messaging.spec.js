const { test, expect } = require('@playwright/test')
const os = require('node:os')
const path = require('node:path')
const { png } = require('../tests/image-fixtures')

test('client conversation remains available offline and synchronizes its encrypted local message and photo after reconnect', async ({ browser, request }) => {
  test.setTimeout(120000)
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`
  const owner = { Authorization: 'Bearer browser-owner-token-at-least-32-characters' }
  async function post(route, data, headers = owner) {
    const response = await request.post(base + route, { headers, data })
    expect(response.ok(), await response.text()).toBeTruthy()
    return response.json()
  }
  async function get(route, headers) {
    const response = await request.get(base + route, { headers })
    expect(response.ok(), await response.text()).toBeTruthy()
    return response.json()
  }

  const { job } = await post('/api/ledger/intake', { title: `Offline client chat ${Date.now()}`, client: { name: 'Offline chat customer' }, tasks: [{ title: 'Klantgesprek' }], assignAutomatically: false })
  const { access } = await post(`/api/ledger/jobs/${job.id}/client-portal-access`, { label: 'Offline chat link' })
  await post(`/api/ledger/approvals/${access.approval.id}/resolve?includeDashboard=false`, { status: 'approved' })
  const clientContext = await browser.newContext({ viewport: { width: 390, height: 844 } })
  try {
    const page = await clientContext.newPage()
    const errors = []
    const photoResponses = []
    page.on('pageerror', error => errors.push(error.message))
    page.on('response', response => {
      if (/^\/api\/client-portal\/conversation\/messages\/[^/]+\/photo$/.test(new URL(response.url()).pathname)) {
        photoResponses.push(response.status())
      }
    })
    await page.goto(`${base}/client-portal.html#token=${access.portalToken}`)
    expect(new URL(page.url()).pathname).toBe('/client-portal.html')
    await expect(page).toHaveTitle(/Contractor\.AI/)
    await expect(page.getByRole('heading', { name: job.title, exact: true })).toBeVisible()
    const conversation = page.getByRole('region', { name: 'Klantgesprek', exact: true })
    await expect(conversation.getByText(/Gesprek offline bewaard/)).toBeVisible({ timeout: 20000 })
    await page.waitForFunction(() => Boolean(navigator.serviceWorker?.controller), null, { timeout: 20000 })

    await clientContext.setOffline(true)
    await conversation.getByLabel('Bericht').fill('De voordeurbel werkt niet; graag eerst aanbellen bij de buren.')
    await conversation.getByLabel('Foto toevoegen (max. 5 MB)').setInputFiles({ name: 'voordeur.png', mimeType: 'image/png', buffer: png })
    await conversation.getByRole('button', { name: 'Verstuur bericht' }).click()
    await expect(conversation.getByText(/Alleen lokaal bewaard; nog niet door de aannemer ontvangen/)).toBeVisible()
    await expect(conversation.getByText(/1 lokaal bewaard, niet ontvangen/)).toBeVisible()

    await page.reload()
    await expect(page.getByRole('heading', { name: job.title, exact: true })).toBeVisible()
    const reopenedConversation = page.getByRole('region', { name: 'Klantgesprek', exact: true })
    await expect(reopenedConversation.getByText('De voordeurbel werkt niet; graag eerst aanbellen bij de buren.')).toBeVisible()
    await expect(reopenedConversation.getByText('Alleen op dit apparaat bewaard')).toBeVisible()
    await expect(reopenedConversation.getByText(/Versleutelde gesprekssnapshot van/)).toBeVisible()
    await reopenedConversation.evaluate(element => element.scrollIntoView({ block: 'start' }))
    const offlineScreenshot = path.join(os.tmpdir(), `contractor-client-offline-${Date.now()}-mobile.png`)
    await page.screenshot({ path: offlineScreenshot })

    await clientContext.setOffline(false)
    await expect(reopenedConversation.getByText('De voordeurbel werkt niet; graag eerst aanbellen bij de buren.')).toBeVisible()
    await expect(reopenedConversation.getByText('Alleen op dit apparaat bewaard')).toHaveCount(0, { timeout: 20000 })
    const messages = (await get('/api/client-portal/conversation', { Authorization: `Bearer ${access.portalToken}` })).messages
    const received = messages.find(message => message.body === 'De voordeurbel werkt niet; graag eerst aanbellen bij de buren.')
    expect(received?.direction).toBe('inbound')
    expect(received?.attachment?.filename).toBe('voordeur.png')
    await expect(reopenedConversation.locator('.conversation-photo')).toBeVisible()
    await expect.poll(() => reopenedConversation.locator('.conversation-photo').evaluate(image => image.naturalWidth)).toBeGreaterThan(0)
    expect(photoResponses).toContain(200)
    expect(photoResponses).not.toContain(401)
    expect(errors).toEqual([])
    console.log(JSON.stringify({ clientOfflineScreenshot: offlineScreenshot }))
  } finally { await clientContext.close() }
})
