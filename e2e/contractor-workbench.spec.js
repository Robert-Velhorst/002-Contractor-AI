const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('daily workbench connects a real intake to a retained internal draft and its dossier', async ({ page, request }, testInfo) => {
  const title = `Workbench roof ${Date.now()}`;
  const intakeResponse = await request.post('/api/ledger/intake', { data: {
    title, service: 'Roof repair', address: 'Teststraat 10', city: 'Arnhem', priority: 'high', estimatedHours: 8,
    client: { name: 'Workbench test client', email: 'workbench@example.test' }, assignAutomatically: false,
  } });
  expect(intakeResponse.ok()).toBeTruthy();
  const intake = await intakeResponse.json();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  const workbench = page.getByTestId('contractor-workbench');
  await expect(workbench.getByRole('heading', { name: 'Daily workbench' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('workbench-entry.png') });
  await workbench.getByRole('searchbox', { name: 'Search work' }).fill(title);
  await workbench.getByRole('button', { name: 'Search work', exact: true }).click();
  await workbench.getByLabel('Work area').selectOption('capability');
  const draftButton = workbench.getByRole('button', { name: 'Prepare internal draft' }).first();
  await expect(draftButton).toBeEnabled();
  const row = draftButton.locator('xpath=ancestor::article');
  const commandId = await row.getAttribute('data-action-id');
  const responsePromise = page.waitForResponse(response => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/ledger/command-plan');
  await draftButton.click();
  const applyResponse = await responsePromise;
  expect(applyResponse.ok()).toBeTruthy();
  const result = await applyResponse.json();
  expect(result.selected.map(action => action.id)).toEqual([commandId]);
  expect(result.summary.applied).toBe(1);
  expect(result.summary.externalCommitments).toBe(0);
  const replayResponse = await request.post('/api/ledger/command-plan', { data: { actionId: commandId, jobId: intake.job.id, limit: 1 } });
  expect(replayResponse.ok()).toBeTruthy();
  const replay = await replayResponse.json();
  expect(replay.summary.applied).toBe(0);
  expect(replay.summary.skipped).toBe(1);
  await expect(workbench.getByRole('status').filter({ hasText: '1 internal record(s) prepared' })).toBeVisible();
  const detail = await (await request.get(`/api/ledger/jobs/${intake.job.id}`)).json();
  expect(detail.job.audit.some(event => event.action === 'apply_today_command_plan')).toBeTruthy();
  expect(detail.job.communications.filter(record => record.status === 'sent')).toHaveLength(0);
  await expect(workbench.locator(`article[data-action-id="${commandId}"]`)).toHaveCount(0);
  await workbench.getByLabel('Work area').selectOption('all');
  await expect(workbench.locator('article').first()).toBeVisible();
  await workbench.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('workbench-desktop.png') });
  const accessibility = await new AxeBuilder({ page }).include('[data-testid="contractor-workbench"]').analyze();
  expect(accessibility.violations).toEqual([]);
  await workbench.getByRole('button', { name: `Open ${title}`, exact: true }).first().click();
  await expect(page.getByTestId('job-workspace').getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close job workspace' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Language', { exact: true }).selectOption('nl-NL');
  await expect(workbench.getByRole('heading', { name: 'Dagelijkse werkbank' })).toBeVisible();
  await workbench.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  expect(await workbench.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('workbench-mobile.png') });
  await page.getByLabel('Taal', { exact: true }).selectOption('en-GB');
  await expect(workbench.getByRole('heading', { name: 'Daily workbench' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('separate overdue sales opportunities remain visible and open the right pipeline dossier', async ({ page, request }) => {
  const prefix = `Workbench leads ${Date.now()}`;
  for (const suffix of ['Extension', 'Renovation']) {
    const response = await request.post('/api/ledger/opportunities', { data: {
      clientName: 'Workbench sales client', title: `${prefix} ${suffix}`, service: 'Maintenance',
      estimatedValue: 5000, nextFollowUpAt: new Date(Date.now() - 3600_000).toISOString(),
    } });
    expect(response.ok()).toBeTruthy();
  }
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  const workbench = page.getByTestId('contractor-workbench');
  await workbench.getByRole('searchbox', { name: 'Search work' }).fill(prefix);
  await workbench.getByRole('button', { name: 'Search work', exact: true }).click();
  const followUps = workbench.locator('article').filter({ hasText: 'needs an internal follow-up draft' });
  await expect(followUps).toHaveCount(2);
  await followUps.filter({ hasText: 'Renovation' }).getByRole('button', { name: `Open ${prefix} Renovation` }).click();
  await expect(page.getByTestId('pipeline-workspace').locator('.pipeline-detail').getByRole('heading', { name: `${prefix} Renovation` })).toBeVisible();
});

test('owned recovery deadlines enter the daily workbench and open their job without becoming executable drafts', async ({ page, request }) => {
  const title = `Recovery follow-up ${Date.now()}`;
  const created = await request.post('/api/ledger/intake', { data: { title, client: { name: 'Recovery workbench client' }, assignAutomatically: false } });
  expect(created.ok(), await created.text()).toBeTruthy();
  const { job } = await created.json();
  const materialResponse = await request.post(`/api/ledger/jobs/${job.id}/materials`, { data: { name: 'Roof rolls', quantity: 4, unit: 'rolls', status: 'needed' } });
  expect(materialResponse.ok(), await materialResponse.text()).toBeTruthy();
  const material = (await materialResponse.json()).materialRequirement;
  const orderResponse = await request.post(`/api/ledger/jobs/${job.id}/purchase-orders`, { data: { status: 'draft', supplier: 'Roof Supplies', amount: 400,
    approvalThreshold: 10000, requiredBy: new Date(Date.now() + 9 * 86_400_000).toISOString(),
    items: [{ lineKey: 'roofing', materialRequirementId: material.id, name: material.name, quantity: 4, unit: 'rolls' }] } });
  expect(orderResponse.ok(), await orderResponse.text()).toBeTruthy();
  const order = (await orderResponse.json()).purchaseOrder;
  const receiptResponse = await request.post(`/api/ledger/jobs/${job.id}/material-receipts`, { data: { purchaseOrderId: order.id,
    receiptReference: `WB-${Date.now()}`, evidenceReference: 'delivery-note:short', receivedBy: 'Field worker', deliveredAt: new Date().toISOString(),
    finalDelivery: true, entryKey: `wb-short-delivery-${Date.now()}`,
    lines: [{ lineKey: 'roofing', materialRequirementId: material.id, itemName: material.name, unit: 'rolls', receivedQuantity: 2, acceptedQuantity: 2 }] } });
  expect(receiptResponse.ok(), await receiptResponse.text()).toBeTruthy();
  const receipt = (await receiptResponse.json()).receipt;
  const recoveryRoute = `/api/ledger/jobs/${job.id}/operational-recovery`;
  const recoveryView = await (await request.get(recoveryRoute)).json();
  const source = recoveryView.sources.find(item => item.id === receipt.id);
  expect(source).toBeTruthy();
  const createdCase = await request.post(recoveryRoute, { data: { action: 'create', entryKey: `wb-case-${Date.now()}`,
    sourceHash: recoveryView.sourceHash, sources: [{ type: source.type, id: source.id }], owner: 'Materials coordinator',
    dueAt: new Date(Date.now() - 3600_000).toISOString(), actionType: 'recover_material', recoveryAction: 'Check the short delivery and confirm the next step.' } });
  expect(createdCase.ok(), await createdCase.text()).toBeTruthy();

  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  const workbench = page.getByTestId('contractor-workbench');
  await workbench.getByRole('searchbox', { name: 'Search work' }).fill(title);
  await workbench.getByRole('button', { name: 'Search work', exact: true }).click();
  const action = workbench.locator('article').filter({ hasText: 'Recovery case for' });
  await expect(action).toHaveCount(1);
  await expect(action).toContainText('is overdue');
  await expect(action.getByRole('button', { name: 'Prepare internal draft' })).toHaveCount(0);
  await action.getByRole('button', { name: `Open ${title}` }).click();
  await expect(page.getByTestId('job-workspace').getByRole('region', { name: 'Operationele herstelcasussen' })).toBeVisible();
  await page.getByRole('button', { name: 'Close job workspace' }).click();

  await page.getByLabel('Language', { exact: true }).selectOption('nl-NL');
  await workbench.scrollIntoViewIfNeeded();
  await workbench.getByRole('searchbox', { name: 'Werk zoeken' }).fill(title);
  await workbench.getByRole('button', { name: 'Werk zoeken', exact: true }).click();
  const dutchAction = workbench.locator('article').filter({ hasText: 'Herstelcasus voor' });
  await expect(dutchAction).toContainText('is over tijd');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
