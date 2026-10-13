const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const os = require('node:os');
const path = require('node:path');

test('work balance approval reconciles execution, gates positions and stays usable on mobile', async ({ page, browser }) => {
  test.setTimeout(120000);
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const owner = { Authorization: 'Bearer browser-owner-token-at-least-32-characters' };
  async function post(route, data, headers = owner) {
    const response = await page.request.post(base + route, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  }
  async function get(route, headers = owner) {
    const response = await page.request.get(base + route, { headers });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  }
  const title = `Work balance ${Date.now()}`, errors = [], stamp = Date.now(), shots = {};
  const { job } = await post('/api/ledger/intake', { title, client: { name: 'Synthetic balance customer' }, tasks: [{ title: 'Monteren en controleren' }], assignAutomatically: false });
  const contextRoute = `/api/ledger/jobs/${job.id}/work-context`, balanceRoute = `/api/ledger/jobs/${job.id}/work-balance`, deliveryRoute = `/api/ledger/jobs/${job.id}/work-deliveries`;
  const pack = await post(contextRoute, { action: 'save_package', entryKey: 'work-balance-package', sourceHash: (await get(contextRoute)).sourceHash,
    record: { code: 'WB-01', title: 'Deurmontage', outcome: 'Twee deuren gemonteerd', taskIds: [job.tasks[0].id], quantityIds: [] } });
  const baseline = await post(`/api/ledger/jobs/${job.id}/production-baselines`, { lines: [{ lineKey: 'doors', costCode: 'INSTALL', description: 'Deuren', unit: 'st', plannedQuantity: 2, plannedLaborHours: 8 }] });
  await post(`/api/ledger/approvals/${baseline.approval.id}/resolve?includeDashboard=false`, { status: 'approved' });
  const entry = await post(`/api/ledger/jobs/${job.id}/production-entries`, { lineKey: 'doors', workDate: '2026-09-23', quantity: 1, crewHours: 4, note: 'Eerste deur gemonteerd', entryKey: 'work-balance-first-entry' });

  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(base);
  await page.locator('#operator-access-key').fill('browser-office-token-at-least-32-characters'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB'); await page.getByRole('button', { name: `Open ${title}`, exact: true }).first().click();
  const panel = page.getByRole('region', { name: 'Werkbalans', exact: true });
  await panel.getByRole('button', { name: 'Werkverdeling opstellen' }).click();
  await panel.getByLabel('Afbakening en bron').fill('Approved production line doors / WP-01');
  await panel.getByLabel('Onderbouwing voor beoordelaar').fill('The full approved quantity belongs to this measured work package.');
  await panel.getByRole('checkbox').check();
  await panel.getByRole('button', { name: 'Ter beoordeling indienen' }).click();
  await expect(panel.getByText('Werkverdeling naar Goedkeuringen gestuurd.')).toBeVisible();
  const plan = await get(balanceRoute);
  expect(plan.state).toBe('review_pending');

  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const reviewer = await reviewerContext.newPage(); reviewer.on('pageerror', error => errors.push(error.message)); await reviewer.goto(base);
    await reviewer.locator('#operator-access-key').fill('browser-owner-token-at-least-32-characters'); await reviewer.getByRole('button', { name: 'Sign in', exact: true }).click();
    await reviewer.getByLabel(/^(Language|Taal)$/).selectOption('en-GB'); await reviewer.locator('.side-nav').getByRole('button', { name: /^Approvals\b/ }).click();
    const approval = reviewer.locator('.approval-item').filter({ hasText: 'Werkverdeling beoordelen: versie 1' });
    await approval.getByRole('button', { name: 'Review and approve', exact: true }).click();
    const modal = reviewer.getByTestId('approval-review-modal');
    await expect(modal.getByText('The full approved quantity belongs to this measured work package.')).toBeVisible();
    await modal.getByLabel('Reviewer reason', { exact: true }).fill('Allocation matches the approved production basis and package.');
    await modal.getByRole('button', { name: 'Confirm approval', exact: true }).click(); await expect(modal).toBeHidden();
  } finally { await reviewerContext.close(); }

  await panel.getByRole('button', { name: 'Werkbalans verversen' }).click();
  await expect(panel.getByText('Uitvoering of toerekening controleren').first()).toBeVisible();
  await post(deliveryRoute, { action: 'retain', entryKey: 'work-balance-retain-first', sourceHash: (await get(deliveryRoute)).sourceHash,
    record: { packageId: pack.record.id, title: 'Eerste deur', scope: 'Eerste deur geplaatst; tweede deur resteert.', entryIds: [entry.entry.id], taskIds: [] } });
  await panel.getByRole('button', { name: 'Werkbalans verversen' }).click();
  await expect(panel.getByText(/1 van 2 st gemeld \/ 1 st resterend/)).toBeVisible();
  expect((await get(balanceRoute)).state).toBe('current');

  const balanceSource = (await get('/api/ledger/jobs/' + job.id + '/work-board')).workPackages[0];
  const now = Date.now(), start = new Date(now + 5 * 86400000), end = new Date(start.getTime() + 8 * 3600000);
  const position = await post(`/api/ledger/jobs/${job.id}/work-board`, { entryKey: 'work-balance-position', confirmPublication: true,
    title: 'Finish door installation', role: 'Carpenter', city: 'Arnhem', description: 'Finish the remaining approved door work.', materials: 'One approved door', equipment: 'Hand tools', prerequisites: 'Review the field pack',
    startsAt: start.toISOString(), endsAt: end.toISOString(), hours: 8, rate: 45, capacity: 1, workPackageId: balanceSource.id,
    workPackageSourceHash: balanceSource.sourceHash, sourceTaskIds: balanceSource.taskIds });
  expect(position.position.workPackageCurrent).toBe(true);
  await post(`/api/ledger/jobs/${job.id}/production-entries`, { lineKey: 'doors', workDate: '2026-09-23', quantity: 0.5, crewHours: 2, note: 'Additional production awaiting allocation', entryKey: 'work-balance-unallocated-output' });
  expect((await get(`/api/ledger/jobs/${job.id}/work-board`)).positions[0].workPackageCurrent).toBe(false);

  await panel.getByRole('button', { name: 'Werkbalans verversen' }).click(); await panel.scrollIntoViewIfNeeded();
  expect((await new AxeBuilder({ page }).include('.work-balance').analyze()).violations).toEqual([]);
  shots.desktop = path.join(os.tmpdir(), `contractor-work-balance-${stamp}-desktop.png`); await page.screenshot({ path: shots.desktop });
  await page.setViewportSize({ width: 390, height: 844 }); await panel.scrollIntoViewIfNeeded();
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  shots.mobile = path.join(os.tmpdir(), `contractor-work-balance-${stamp}-mobile.png`); await page.screenshot({ path: shots.mobile });
  expect(errors).toEqual([]); console.log(JSON.stringify({ workBalanceScreenshots: shots }));
});
