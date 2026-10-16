const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { randomUUID } = require('node:crypto');
const os = require('node:os');
const path = require('node:path');

test('recovery replacement survives a lost server response without duplicate proposals or changed assignments', async ({ page, request }) => {
  test.setTimeout(150000);
  const suffix = Date.now(), role = `Recovery installer ${suffix}`, title = `Vervanging herstel ${suffix}`;
  const errors = [], consoleErrors = [], failedRequests = [], cancelledReads = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('requestfailed', request => {
    const failure = { path: new URL(request.url()).pathname, error: request.failure()?.errorText };
    if (request.method() === 'GET' && failure.path === '/api/ledger/command-plan' && failure.error === 'net::ERR_ABORTED') {
      cancelledReads.push(failure);
    } else failedRequests.push(failure);
  });
  async function post(route, data) {
    const response = await request.post(route, { data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  async function get(route) {
    const response = await request.get(route);
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  async function openProject() {
    const row = page.getByRole('row').filter({ hasText: title });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: `${title} openen`, exact: true }).click();
  }
  const original = (await post('/api/ledger/workers', { name: `Afwezige ${suffix}`, role, status: 'available' })).worker;
  const replacement = (await post('/api/ledger/workers', { name: `Vervanger ${suffix}`, role, status: 'available' })).worker;
  const scheduledStart = new Date(Date.now() + 20 * 86400000).toISOString();
  const scheduledEnd = new Date(Date.parse(scheduledStart) + 6 * 3600000).toISOString();
  const period = (await post(`/api/ledger/workers/${original.id}/availability`, {
    periodType: 'unavailable', title: 'Operationele verhindering', startsAt: scheduledStart, endsAt: scheduledEnd
  })).period;
  const job = (await post('/api/ledger/intake', { title, client: { name: 'Herstel klant' }, status: 'scheduled',
    scheduledStart, scheduledEnd, assignAutomatically: false })).job;
  const assignment = (await post(`/api/ledger/jobs/${job.id}/assignments`, { workerId: original.id, role, scheduledStart, scheduledEnd })).assignment;
  const view = await get(`/api/ledger/jobs/${job.id}/operational-recovery`);
  await post(`/api/ledger/jobs/${job.id}/operational-recovery`, { action: 'create', entryKey: randomUUID(), sourceHash: view.sourceHash,
    sources: [{ type: 'worker_availability', id: period.id }], owner: 'Planner', dueAt: scheduledStart,
    actionType: 'replace_worker', recoveryAction: 'Controleer vervanging voor deze opdracht.' });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  expect(new URL(page.url()).pathname).toBe('/');
  await expect(page).toHaveTitle(/Contractor\.AI/);
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  await expect(page.getByRole('button', { name: 'Projecten', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Projecten', exact: true }).click();
  await openProject();
  const panel = page.getByRole('region', { name: 'Operationele herstelcasussen' });
  const replacementPanel = panel.getByRole('region', { name: 'Vervanging over opdrachten' });
  await expect(replacementPanel).toBeVisible();
  const choice = replacementPanel.getByRole('combobox', { name: `Vervanger voor ${title}` });
  const reason = replacementPanel.getByLabel('Reden voor de gecoördineerde vervanging');
  await choice.selectOption(replacement.id);
  await reason.fill('Beschikbaarheid en geschiktheid van deze vervanger gecontroleerd.');

  const bodies = [];
  let retained, releaseResponse;
  await page.route('**/api/ledger/workers/*/availability/*/replacement-plan', async route => {
    bodies.push(route.request().postData());
    const response = await route.fetch();
    expect(response.ok()).toBeTruthy();
    if (!retained) {
      retained = await response.json();
      await new Promise(resolve => { releaseResponse = resolve; });
      await route.abort('failed');
    } else await route.fulfill({ response });
  });
  await replacementPanel.getByRole('button', { name: /Alle 1 opdracht/ }).click();
  await expect.poll(() => typeof releaseResponse).toBe('function');
  await expect(reason).toBeDisabled();
  await expect(choice).toBeDisabled();
  releaseResponse();
  const retry = replacementPanel.getByRole('button', { name: 'Hetzelfde vervangingsplan opnieuw proberen' });
  await expect(retry).toBeVisible();
  await expect(reason).toBeDisabled();
  await expect(choice).toBeDisabled();
  const screenshotRoot = path.join(os.tmpdir(), `contractor-replacement-recovery-${suffix}`);
  await replacementPanel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${screenshotRoot}-retry-desktop.png`, fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await replacementPanel.scrollIntoViewIfNeeded();
  await expect(retry).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: `${screenshotRoot}-retry-mobile.png`, fullPage: false });
  await retry.click();
  await expect(panel.getByText(/Vervangingsplan wacht op goedkeuring/)).toBeVisible();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]).toBe(bodies[0]);
  await expect(replacementPanel.getByText(`Vervangingsplan ingediend voor onafhankelijke goedkeuring: ${retained.approval.id}. Bezetting blijft ongewijzigd tot besluit.`)).toBeVisible();
  const approvals = (await get('/api/ledger/approvals?status=pending&limit=100')).approvals;
  expect(approvals.filter(item => item.targetType === 'assignment_replacement_plan' && item.data?.availabilityPeriodId === period.id)).toHaveLength(1);
  const detail = (await get(`/api/ledger/jobs/${job.id}`)).job;
  expect(detail.assignments.find(item => item.id === assignment.id).status).toBe(assignment.status);
  expect(detail.assignments.filter(item => item.workerId === replacement.id)).toHaveLength(1);
  expect(detail.assignments.find(item => item.workerId === replacement.id).status).toBe('pending_approval');
  expect(await page.locator('vite-error-overlay').count()).toBe(0);
  expect(errors).toEqual([]);
  expect(failedRequests).toEqual([{ path: `/api/ledger/workers/${original.id}/availability/${period.id}/replacement-plan`, error: 'net::ERR_FAILED' }]);
  expect(consoleErrors).toHaveLength(1);
  expect(consoleErrors.filter(message => !message.includes('net::ERR_FAILED'))).toEqual([]);
  expect((await new AxeBuilder({ page }).include('#job-operational-recovery').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await panel.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${screenshotRoot}-desktop.png`, fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await replacementPanel.scrollIntoViewIfNeeded();
  await expect(replacementPanel).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.screenshot({ path: `${screenshotRoot}-mobile.png`, fullPage: false });
  await page.reload();
  await openProject();
  await expect(replacementPanel.getByText(`Vervangingsplan ingediend voor onafhankelijke goedkeuring: ${retained.approval.id}. Bezetting blijft ongewijzigd tot besluit.`)).toBeVisible();
  expect(errors).toEqual([]);
  expect(failedRequests).toHaveLength(1);
  expect(cancelledReads.length).toBeLessThanOrEqual(1);
  expect(consoleErrors).toHaveLength(1);
  expect(consoleErrors.filter(message => !message.includes('net::ERR_FAILED'))).toEqual([]);
  console.log(JSON.stringify({ screenshotRoot, origin: new URL(page.url()).origin, simulatedResponseLoss: true, approvalId: retained.approval.id }));
});
