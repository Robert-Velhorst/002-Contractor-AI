const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { riskRegisterPayload } = require('../tests/risk-register-fixture');

test('portfolio review connects real dossier impact, persistence and mobile controls', async ({ page, request }, testInfo) => {
  const title = `Impact review ${Date.now()}`;
  const response = await request.post('/api/ledger/intake', { data: { title, client: { name: 'Impact test customer' }, contractValue: 5000, scheduledStart: '2026-09-07T08:00:00Z', targetCompletion: '2026-09-08T00:00:00Z', tasks: [{ title: 'Foundation', durationHours: 8 }, { title: 'Walls', durationHours: 8 }], assignAutomatically: false } });
  expect(response.ok()).toBeTruthy();
  const { job } = await response.json();
  const takeoff = await request.post(`/api/ledger/jobs/${job.id}/takeoffs`, { data: { title: 'Foundation quantity basis', items: [
    { description: 'Concrete pads', measurementType: 'manual', quantity: 4, unit: 'm3', unitCost: 120, unitPrice: 210, costCode: 'CON-100', wbsCode: '01.20', workPackage: 'Foundations' }
  ] } });
  expect(takeoff.ok()).toBeTruthy();
  const materialResponse = await request.post(`/api/ledger/jobs/${job.id}/materials`, { data: { name: 'Cement bags', quantity: 8, unit: 'bags', status: 'needed' } });
  expect(materialResponse.ok()).toBeTruthy();
  const requirement = (await materialResponse.json()).materialRequirement;
  const stockResponse = await request.patch(`/api/ledger/jobs/${job.id}/materials/${requirement.id}/status`, { data: {
    status: 'available', quantity: 8, notes: 'Counted and accepted on site.', reference: 'stock-check-001', location: 'Foundation store'
  } });
  expect(stockResponse.ok()).toBeTruthy();
  const materialTaskResponse = await request.post(`/api/ledger/jobs/${job.id}/tasks`, { data: { title: 'Mix foundation concrete', durationHours: 4, materialRequirementIds: [requirement.id] } });
  expect(materialTaskResponse.ok()).toBeTruthy();
  const dependency = await request.post(`/api/ledger/jobs/${job.id}/task-dependencies`, { data: { predecessorTaskId: job.tasks[0].id, successorTaskId: job.tasks[1].id } });
  expect(dependency.ok()).toBeTruthy();
  async function post(route, data) {
    const result = await request.post(route, { data });
    expect(result.ok(), await result.text()).toBeTruthy();
    return result.json();
  }
  const draftOrder = await post(`/api/ledger/jobs/${job.id}/purchase-orders`, {
    status: 'draft', supplier: 'Cement Supply B.V.', currency: 'EUR', requiredBy: '2026-09-15T00:00:00.000Z',
    items: [{ lineKey: 'cement-bags', materialRequirementId: requirement.id, name: requirement.name, quantity: 4, unit: 'bags', unitCost: 8 }]
  });
  const scopeResult = await post(`/api/ledger/jobs/${job.id}/commercial-scope/revisions`, { entryKey: `impact-scope-${Date.now()}`,
    title: 'Foundation extension', scopeSummary: 'The agreed foundation and wall extension.', inclusions: ['Complete foundation and walls.'],
    assumptions: ['Site access is available.'], exclusions: ['Unforeseen ground conditions.'], clientResponsibilities: ['Provide site access.'],
    contractorResponsibilities: ['Complete the retained scope.'], allowanceMode: 'none', noAllowanceReason: 'No allowances apply.', reason: 'Establish the contract basis.' });
  await post(`/api/ledger/approvals/${scopeResult.approval.id}/resolve`, { status: 'approved', reason: 'Scope verified.' });
  const risk = await post(`/api/ledger/jobs/${job.id}/risk-register/revisions`, riskRegisterPayload(`impact-risk-${Date.now()}`, scopeResult.revision.id));
  await post(`/api/ledger/approvals/${risk.approval.id}/resolve`, { status: 'approved', reason: 'Risk basis reviewed.' });
  const quote = await post(`/api/ledger/jobs/${job.id}/quote`, { commercialScopeRevisionId: scopeResult.revision.id,
    lineItems: [{ description: 'Foundation and walls', quantity: 1, unitPrice: 5000 }] });
  await post(`/api/ledger/approvals/${quote.quote.approvalId}/resolve`, { status: 'approved', reason: 'Quote verified.' });
  const acceptance = await post(`/api/ledger/jobs/${job.id}/quotes/${quote.quote.id}/acceptance`,
    { acceptedAt: '2026-09-24', evidenceReference: 'signed-quote-17', notes: 'Signed quote received.' });
  await post(`/api/ledger/approvals/${acceptance.approval.id}/resolve`, { status: 'approved', reason: 'Acceptance evidence verified.' });
  const dateView = await (await request.get(`/api/ledger/jobs/${job.id}/client-date-commitments`)).json();
  const acceptedSource = dateView.acceptedSources[0];
  await post(`/api/ledger/jobs/${job.id}/client-date-commitments`, { action: 'record', commandKey: `impact-date-${Date.now()}`,
    entryKey: 'contract-completion', sourceType: acceptedSource.type, sourceId: acceptedSource.id, acceptedSourceHash: acceptedSource.sourceHash,
    sourceHash: dateView.sourceHash, dateKind: 'complete_by', date: '2026-09-08', label: 'Final handover',
    contractWording: 'Complete the works by 8 September 2026.', evidenceReference: 'signed-quote-17, clause 8' });
  const selection = await post(`/api/ledger/jobs/${job.id}/client-selections`, { title: 'Bathroom tile finish', category: 'finish', options: ['Light stone', 'Dark slate'], status: 'pending_client', dueAt: '2026-09-08T00:00:00.000Z' });
  await post(`/api/ledger/jobs/${job.id}/client-selections/${selection.clientSelection.id}/impact-links`, { links: [
    { targetType: 'task', targetId: job.tasks[0].id, rationale: 'The selected tile finish may change the installation sequence.' },
    { targetType: 'material_requirement', targetId: requirement.id, rationale: 'The selected finish determines the tile material requirement.' }
  ] });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  const panel = page.getByTestId('contractor-review');
  await panel.getByRole('button', { name: 'Dossier review', exact: true }).click();
  await expect(panel.getByRole('button', { name: 'Review next batch' })).toBeEnabled();
  await panel.getByRole('button', { name: 'Review next batch' }).click();
  await expect(panel.getByText(/dossiers checked;/)).toBeVisible();
  await expect(panel.getByText('Coverage manifest v1: 15 source tables, 7 derived sources, 10 evaluated checks. Not a certification.')).toBeVisible();
  let pages = 0;
  while (!await panel.getByRole('button', { name: `Analyse ${title}`, exact: true }).count() && pages++ < 20) {
    await panel.getByRole('button', { name: 'Next dossiers', exact: true }).click();
    await expect(panel.getByRole('button', { name: 'Refresh reviews' })).toBeEnabled();
  }
  await panel.getByRole('button', { name: `Analyse ${title}`, exact: true }).click();
  await panel.getByLabel('Proposed duration (hours)', { exact: true }).fill('32');
  await panel.getByLabel('Cost change (EUR)', { exact: true }).fill('300');
  await panel.getByLabel('Revenue change (EUR)', { exact: true }).fill('450');
  await panel.getByRole('button', { name: 'Add measured quantity' }).click();
  await panel.getByRole('spinbutton', { name: 'Proposed quantity 1' }).fill('6');
  await panel.getByRole('button', { name: 'Add material quantity' }).click();
  await panel.locator('.impact-quantity-changes').nth(1).getByRole('spinbutton').fill('12');
  await panel.getByLabel('Change reason', { exact: true }).fill('Additional excavation');
  await panel.getByRole('button', { name: 'Preview impact' }).click();
  await expect(panel.getByRole('region', { name: 'Impact result' })).toBeVisible();
  await expect(panel.getByRole('heading', { name: 'Measured quantity impact' })).toBeVisible();
  await expect(panel.getByText('Concrete pads', { exact: true })).toBeVisible();
  await expect(panel.locator('.impact-result li').filter({ hasText: 'Takeoff cost delta:' })).toContainText('€240.00');
  const materialImpact = panel.getByRole('region', { name: 'Material availability impact' });
  await expect(materialImpact).toContainText('Cement bags');
  await expect(materialImpact).toContainText('Accepted stock: 8 bags');
  await expect(materialImpact).toContainText('Proposed uncovered quantity: 4 bags');
  await expect(materialImpact).toContainText('Additional supply needs confirmation before linked work can proceed');
  await expect(materialImpact).toContainText('Mix foundation concrete');
  await expect(materialImpact).toContainText(draftOrder.purchaseOrder.id);
  await expect(materialImpact).toContainText('Cement Supply B.V.');
  await expect(materialImpact).toContainText('No external supplier commitment recorded');
  const dateImpact = panel.getByRole('list', { name: 'Contractual completion dates' });
  await expect(dateImpact).toContainText('Within contractual date');
  await expect(dateImpact).toContainText('Projected after contractual date (1 calendar day late)');
  const affectedDecisions = panel.getByRole('region', { name: 'Client decisions affected by this proposal' });
  await expect(affectedDecisions).toContainText('Bathroom tile finish');
  await expect(affectedDecisions).toContainText('The selected finish determines the tile material requirement.');
  const contractualContext = panel.getByRole('region', { name: 'Contract and client decision context' });
  await expect(contractualContext).toContainText('Approved scope: Current source');
  await expect(contractualContext).toContainText('Bathroom tile finish');
  await expect(contractualContext).toContainText('Client decision remains open');
  await expect(panel.getByRole('region', { name: 'Affected task dependencies' })).toContainText('Foundation');
  await panel.locator('.impact-result').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('impact-desktop.png') });
  expect((await new AxeBuilder({ page }).include('[data-testid="contractor-review"]').analyze()).violations).toEqual([]);
  await panel.getByRole('button', { name: 'Retain analysis' }).click();
  await expect(panel.getByRole('status').filter({ hasText: 'Analysis retained' })).toBeVisible();
  const saved = await (await request.get(`/api/ledger/jobs/${job.id}/change-impact`)).json();
  expect(saved.reviews).toHaveLength(1);
  expect(saved.reviews[0].sourceCurrent).toBe(true);
  expect(saved.reviews[0].financial.marginDelta).toBe(330);
  expect(saved.reviews[0].schedule.finishDeltaHours).toBe(24);
  expect(saved.reviews[0].schedule.affectedTasks).toHaveLength(2);
  await panel.locator('.retained-reviews summary').filter({ hasText: 'Additional excavation' }).click();
  await panel.getByRole('button', { name: 'Prepare variation draft' }).click();
  await panel.getByLabel('Variation title').fill('Additional excavation variation');
  await panel.getByLabel('Proposed scope').fill('Excavate and remove the additional soil beyond the retained foundation footprint.');
  await panel.getByLabel('Net variation amount').fill('900');
  await panel.getByLabel('Proposed calendar days').fill('1');
  await panel.getByLabel('Variation type').selectOption('unforeseen_condition');
  await panel.getByRole('button', { name: 'Create governed variation draft' }).click();
  await expect(panel.getByRole('status').filter({ hasText: /VAR-\d{4}-\d+ revision 1 retained as a draft/ })).toBeVisible();
  const updated = await (await request.get(`/api/ledger/jobs/${job.id}/change-impact`)).json();
  expect(updated.reviews[0].sourceCurrent).toBe(true);
  expect(updated.reviews[0].relatedVariations).toHaveLength(1);
  expect(updated.reviews[0].relatedVariations[0].status).toBe('draft');
  expect(updated.reviews[0].relatedVariations[0].workAuthorized).toBe(false);
  await panel.locator('.retained-reviews summary').filter({ hasText: 'Additional excavation' }).click();
  const linkedVariation = panel.locator('.retained-reviews > li > details > ul > li').filter({ hasText: 'VAR-2026-000001' });
  await expect(linkedVariation).toContainText('pending');
  await expect(linkedVariation).toContainText('Work not authorized');
  expect(saved.schedule.tasks[0].durationHours).toBe(8);
  await panel.getByRole('button', { name: 'Open dossier', exact: true }).click();
  await expect(page.getByTestId('job-workspace').getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close job workspace' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Language', { exact: true }).selectOption('nl-NL');
  await expect(panel.getByRole('button', { name: 'Dossiercontrole', exact: true })).toBeVisible();
  await expect(panel.getByRole('status').filter({ hasText: /VAR-\d{4}-\d+ revision 1 retained as a draft/ })).toBeVisible();
  await panel.locator('.impact-review').scrollIntoViewIfNeeded();
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('impact-mobile.png') });
  expect((await new AxeBuilder({ page }).include('[data-testid="contractor-review"]').analyze()).violations).toEqual([]);
  await page.getByLabel('Taal', { exact: true }).selectOption('en-GB');
  expect(errors).toEqual([]);
});
