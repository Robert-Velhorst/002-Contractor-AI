const { test, expect } = require('@playwright/test')
const AxeBuilder = require('@axe-core/playwright').default
const os = require('node:os')
const path = require('node:path')

test('approved project expenses flow through a disruption case into an estimate-to-actual comparison', async ({ page }) => {
  const marker = Date.now()
  const title = `Kostenherstel ${marker}`
  const workerId = `recovery-cost-worker-${marker}`
  const receiptReference = `RECOVERY-COST-${marker}`
  const errors = []
  const consoleErrors = []
  page.on('pageerror', error => errors.push(error.message))
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()) })

  const post = async (route, data) => {
    const response = await page.request.post(route, { data })
    expect(response.ok(), await response.text()).toBeTruthy()
    return response.json()
  }
  const intake = await post('/api/ledger/intake', { title, client: { name: `Klant ${marker}` }, assignAutomatically: false })
  const jobId = intake.job.id
  await post('/api/ledger/workers', { id: workerId, name: 'Dakdekker herstelkosten', role: 'Dakdekker', status: 'available' })
  await post(`/api/ledger/jobs/${jobId}/assignments`, { workerId, role: 'Dakdekker', status: 'assigned' })
  const expense = await post(`/api/ledger/jobs/${jobId}/expense-receipts`, {
    entryKey: `recovery-cost-expense-${marker}`, expenseDate: new Date().toISOString().slice(0, 10), workerId,
    workerName: 'Dakdekker herstelkosten', category: 'materials', vendor: 'Bouwmarkt', receiptReference,
    totalAmount: 121, taxAmount: 21, taxTreatment: 'recoverable', paymentMethod: 'personal_card',
    costCode: 'MAT-HERSTEL', currency: 'EUR'
  })
  expect(expense.expense.status).toBe('pending_approval')
  await post(`/api/ledger/approvals/${expense.approval.id}/resolve`, {
    status: 'approved', resolvedBy: 'Browser operator', reason: 'Bon, projecttoewijzing en btw gecontroleerd.'
  })
  const incident = await post(`/api/ledger/jobs/${jobId}/incidents`, {
    title: 'Extra materiaal door onverwachte aansluiting', severity: 'low', status: 'reported', incidentType: 'near_miss'
  })

  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.goto('/')
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL')
  await page.getByRole('button', { name: 'Projecten', exact: true }).click()
  await page.getByRole('button', { name: `${title} openen`, exact: true }).click()

  const recovery = page.getByRole('region', { name: 'Operationele herstelcasussen' })
  await recovery.getByRole('checkbox', { name: new RegExp(`Veiligheidsmelding.*${incident.incident.title}`) }).check()
  await recovery.getByRole('button', { name: 'Herstelcasus aanmaken' }).click()
  await recovery.getByLabel('Verantwoordelijke').fill('Werkvoorbereider')
  await recovery.getByLabel('Opvolgen voor').fill('2030-01-02T09:00')
  await recovery.getByLabel('Wat moet worden uitgezocht of voorbereid?').fill('Controleer de extra materiaalkosten van het herstel.')
  await recovery.getByRole('button', { name: 'Herstel vastleggen' }).click()
  await expect(recovery.getByText('Herstelcasus is bijgewerkt.')).toBeVisible()

  await recovery.getByText('Kostenimpact beoordelen', { exact: true }).click()
  await recovery.getByLabel('Beoordeling kostenimpact').selectOption('estimate')
  await recovery.getByLabel('Indicatieve raming in euro').fill('150')
  await recovery.getByLabel('Onderbouwing').fill('Extra materiaal en transport geraamd na de onverwachte aansluiting.')
  await recovery.getByLabel('Bewijsbron kostenimpact').fill(`calculatie:${receiptReference}`)
  await recovery.getByRole('button', { name: 'Kostenimpact vastleggen' }).click()
  await expect(recovery.getByText('Kostenimpact is vastgelegd als interne beoordeling; er is niets geboekt of toegezegd.')).toBeVisible()

  await recovery.getByText('Goedgekeurde werkelijke kosten toerekenen', { exact: true }).click()
  await recovery.getByLabel('Kostenpost voor toerekening').selectOption(`expense:${expense.expense.id}`)
  await recovery.getByLabel('Toegerekend bedrag').fill('100')
  await recovery.getByLabel('Reden van toerekening').fill('Goedgekeurde netto bon voor extra materiaal bij deze verstoring.')
  const commandBodies = []
  let loseResponse = true
  await page.route(`**/api/ledger/jobs/${jobId}/operational-recovery`, async route => {
    const request = route.request()
    if (request.method() !== 'POST' || request.postDataJSON()?.action !== 'actual_cost_attribution') return route.continue()
    commandBodies.push(request.postData())
    const response = await route.fetch()
    expect(response.ok(), await response.text()).toBe(true)
    if (loseResponse) {
      loseResponse = false
      return route.abort('connectionreset')
    }
    expect((await response.json()).replayed).toBe(true)
    return route.fulfill({ response })
  })
  await recovery.getByRole('button', { name: 'Werkelijke kosten toerekenen' }).click()
  await expect(recovery.getByRole('button', { name: 'Dezelfde kostentoerekening opnieuw proberen' })).toBeVisible()
  await expect(recovery.getByLabel('Toegerekend bedrag')).toBeDisabled()
  await page.reload()
  await page.getByRole('button', { name: 'Projecten', exact: true }).click()
  await page.getByRole('button', { name: `${title} openen`, exact: true }).click()
  await recovery.getByRole('button', { name: 'Dezelfde kostentoerekening opnieuw proberen' }).click()
  await expect.poll(() => commandBodies.length).toBe(2)
  expect(commandBodies[1]).toBe(commandBodies[0])
  await expect(recovery.getByLabel('Vergelijking raming en werkelijke kosten'))
    .toContainText('Actuele raming: € 150,00. Goedgekeurd en aan deze casus toegerekend tot nu toe: € 100,00.')
  await expect(recovery.getByLabel('Vergelijking raming en werkelijke kosten')).toContainText('Verschil tot de raming: € 50,00')

  const retained = await (await page.request.get(`/api/ledger/jobs/${jobId}/operational-recovery`)).json()
  expect(retained.actualCostSources.find(source => source.id === expense.expense.id)).toMatchObject({ allocatedCents: 10000, availableCents: 0 })
  expect(retained.cases[0].actualCostAttributions).toHaveLength(1)
  expect(retained.cases[0].actualCostAttributions[0]).toMatchObject({ amountCents: 10000, sourceCurrent: true, accountingPosted: false })
  expect(await new AxeBuilder({ page }).include('[aria-label="Operationele herstelcasussen"]').analyze()).toMatchObject({ violations: [] })
  await expect(page).toHaveTitle(/Contractor/i)
  expect(await page.locator('body').innerText()).not.toMatch(/Internal Server Error|Something went wrong|Vite Error/)
  expect(errors).toEqual([])
  expect(consoleErrors.filter(message => !message.includes('net::ERR_CONNECTION_RESET'))).toEqual([])
  expect(await page.locator('vite-error-overlay').count()).toBe(0)
  const screenshotDirectory = process.env.CONTRACTOR_AI_VISUAL_QA_DIR || os.tmpdir()
  await recovery.getByLabel('Vergelijking raming en werkelijke kosten').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(screenshotDirectory, 'phase210-cost-replay-desktop.png') })

  await page.setViewportSize({ width: 390, height: 844 })
  await recovery.scrollIntoViewIfNeeded()
  expect(await recovery.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true)
  await recovery.getByLabel('Vergelijking raming en werkelijke kosten').scrollIntoViewIfNeeded()
  await page.screenshot({ path: path.join(screenshotDirectory, 'phase210-cost-replay-mobile.png') })
})
