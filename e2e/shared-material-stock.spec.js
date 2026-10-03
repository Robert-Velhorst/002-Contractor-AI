const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('operator allocates shared stock once, records consumption, and uses the inventory view on mobile', async ({ page, request }) => {
  const suffix = Date.now(), itemName = `Roofing membrane ${suffix}`, jobTitle = `Shared stock roof ${suffix}`;
  const count = await request.post('/api/ledger/material-stock/counts', {
    data: { name: itemName, unit: 'rolls', countedQuantity: 0, reference: `COUNT-${suffix}`, note: 'Create the shared material catalogue item.', entryKey: `count-${suffix}` }
  });
  expect(count.ok(), await count.text()).toBeTruthy();
  const intake = await request.post('/api/ledger/intake', {
    data: { title: jobTitle, client: { name: 'Shared stock client' }, status: 'scheduled', assignAutomatically: false }
  });
  expect(intake.ok(), await intake.text()).toBeTruthy();
  const { job } = await intake.json();
  const requirement = await request.post(`/api/ledger/jobs/${job.id}/materials`, {
    data: { name: itemName, quantity: 6, unit: 'rolls', status: 'needed' }
  });
  expect(requirement.ok(), await requirement.text()).toBeTruthy();
  const { materialRequirement } = await requirement.json();
  const warehouseReceipt = await request.post(`/api/ledger/jobs/${job.id}/material-receipts`, {
    data: { receiptReference: `WAREHOUSE-${suffix}`, evidenceReference: `signed-ticket:WAREHOUSE-${suffix}`,
      receivedBy: 'Warehouse receiver', location: 'Central warehouse', stockDestination: 'company_warehouse',
      entryKey: `warehouse-receipt-${suffix}`, lines: [{ materialRequirementId: materialRequirement.id,
        itemName, unit: 'rolls', receivedQuantity: 10, acceptedQuantity: 10, damagedQuantity: 0 }] }
  });
  expect(warehouseReceipt.ok(), await warehouseReceipt.text()).toBeTruthy();

  const errors = [];
  page.on('pageerror', error => { errors.push(error.message); });
  const response = await page.goto('/');
  expect(response?.ok()).toBeTruthy();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.getByRole('button', { name: 'Resources', exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  await page.getByRole('tab', { name: 'Inventory', exact: true }).click();
  const panel = page.getByTestId('shared-material-stock');
  await expect(panel.getByRole('heading', { name: 'Shared warehouse stock' })).toBeVisible();
  await expect(panel.getByText(itemName, { exact: true }).first()).toBeVisible();
  await expect(panel.getByText(`Warehouse receipt · WAREHOUSE-${suffix}`)).toBeVisible();

  const reservationForm = panel.locator('.shared-stock-form').nth(1);
  await reservationForm.getByLabel('Material requirement').selectOption(materialRequirement.id);
  const reservationQuantity = reservationForm.getByLabel('Quantity', { exact: true });
  await reservationQuantity.click();
  await reservationQuantity.pressSequentially('6');
  await expect(reservationQuantity).toHaveValue('6');
  await reservationForm.getByLabel('Stock count reference').fill(`COUNT-${suffix}`);
  await reservationForm.getByRole('button', { name: 'Reserve stock' }).click();
  await expect(panel.getByText('Material reserved for the selected job.')).toBeVisible();
  const allocation = panel.locator('.shared-stock-allocation').filter({ hasText: jobTitle });
  await expect(allocation).toContainText('6 rolls');
  const issueDetails = allocation.locator('details.shared-stock-issue');
  await issueDetails.locator('summary').click();
  await issueDetails.getByLabel('Issued quantity').fill('3');
  await issueDetails.getByLabel('Expected arrival at job site').fill(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16));
  await issueDetails.getByLabel('Dispatch reference').fill(`VAN-${suffix}`);
  await issueDetails.getByLabel('Issue evidence reference').fill(`signed-dispatch:${suffix}`);
  await issueDetails.getByRole('button', { name: 'Issue to job site' }).click();
  await expect(panel.getByText('Material issued to the job; warehouse stock reduced and arrival estimate linked to the work plan.')).toBeVisible();
  await expect(panel.getByText(`Issue to job site · VAN-${suffix}`)).toBeVisible();
  const stockAfterIssue = await (await request.get('/api/ledger/material-stock')).json();
  const siteIssue = stockAfterIssue.siteIssues.find(item => item.dispatchReference === `VAN-${suffix}`);
  expect(siteIssue).toBeTruthy();
  const arrival = await request.post(`/api/ledger/jobs/${job.id}/material-stock-site-issues/${siteIssue.id}/receipts`, {
    data: { receivedQuantity: 3, acceptedQuantity: 2, damagedQuantity: 0, receiptReference: `SITE-${suffix}`,
      receivedBy: 'Site receiver', location: 'Roof level', evidenceReference: `photo:arrival-${suffix}`, entryKey: `site-arrival-${suffix}` }
  });
  expect(arrival.ok(), await arrival.text()).toBeTruthy();
  await panel.getByRole('button', { name: 'Refresh stock' }).click();
  const inspectionForm = panel.getByRole('form', { name: `Inspect site receipt SITE-${suffix}` });
  await expect(panel.locator('.shared-stock-allocation').filter({ hasText: `SITE-${suffix}` })).toContainText('1 rolls');
  await inspectionForm.getByLabel('Damaged after inspection').fill('1');
  await inspectionForm.getByLabel('Inspection reference').fill(`QC-${suffix}`);
  await inspectionForm.getByLabel('Inspection evidence reference').fill(`photo:inspection-${suffix}`);
  await inspectionForm.getByRole('button', { name: 'Save inspection decision' }).click();
  await expect(panel.getByText('Site receipt inspection retained; only accepted units increased job availability.')).toBeVisible();
  await expect(panel.getByText(`QC-${suffix}`)).toBeVisible();
  await expect(panel.getByText(`photo:inspection-${suffix}`)).toBeVisible();
  await allocation.getByLabel(`Used quantity for ${jobTitle}`).fill('2');
  await allocation.getByLabel(`Use evidence for ${jobTitle}`).fill(`PICK-${suffix}`);
  await allocation.getByRole('button', { name: 'Record use' }).click();
  await expect(panel.getByText('Material use recorded and stock reduced.')).toBeVisible();
  const materialRow = panel.getByRole('row').filter({ hasText: itemName });
  await expect(materialRow).toContainText('5 rolls');
  await expect(materialRow).toContainText('4 rolls');
  await expect(panel.getByText(`Issue to job site · VAN-${suffix}`)).toBeVisible();
  await expect(panel.getByText(`Job consumption · PICK-${suffix}`)).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).include('[data-testid="shared-material-stock"]').analyze()).violations).toEqual([]);
  expect(errors).toEqual([]);
});
