const { test, expect } = require('@playwright/test');
const path = require('node:path');
const os = require('node:os');

test('operator qualifies an opportunity, retains internal activity, and converts one linked job', async ({ page, request }) => {
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  const title = `Browser pipeline ${Date.now()}`;
  const stockResponse = await request.post('/api/ledger/material-stock/counts', { data: {
    name: `Insulation board ${Date.now()}`, sku: 'BROWSER-INS-01', unit: 'm2', countedQuantity: 18,
    reference: 'BROWSER-STOCK-COUNT', note: 'Browser test stock count.', entryKey: `browser-material-${Date.now()}`
  } });
  expect(stockResponse.ok()).toBeTruthy();
  const stockMaterial = (await stockResponse.json()).material;
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/, { exact: true }).selectOption('en-GB');
  await expect(page.getByRole('heading', { level: 1, exact: true, name: 'Today' })).toBeVisible();

  await page.getByRole('button', { name: 'New opportunity' }).click();
  const editor = page.getByTestId('opportunity-modal');
  await expect(editor.getByRole('heading', { name: 'New opportunity' })).toBeVisible();
  await editor.getByLabel('Client name').fill('Browser Pipeline Client');
  await editor.getByLabel('Email').fill('pipeline-browser@example.test');
  await editor.getByLabel('Opportunity title').fill(title);
  await editor.getByLabel('Service').fill('Energy retrofit');
  await editor.getByLabel('Estimated value').fill('24000');
  await editor.getByLabel('Source').fill('referral');
  await editor.getByLabel('Owner').fill('Utrecht office');
  await editor.getByLabel('Next follow-up').fill('2026-07-20T09:00');
  await editor.getByLabel('Decision target').fill('2026-08-01T12:00');
  await editor.getByLabel('City').fill('Utrecht');
  await editor.getByRole('button', { name: 'Add expected material' }).click();
  await expect(editor.getByLabel('Catalogue material')).toBeVisible();
  await editor.getByLabel('Catalogue material').selectOption(stockMaterial.id);
  await editor.getByLabel('Required quantity').fill('14');
  await editor.getByLabel('Expected work start').fill('2026-10-05');
  await editor.getByLabel('Expected work end').fill('2026-10-09');
  await editor.getByLabel('Required trade role').fill('Installer');
  await editor.getByLabel('Estimated crew hours').fill('24');
  await editor.getByLabel('Required declared skills').fill('roof insulation, vapour barrier detailing');
  await editor.getByLabel('VCA (Basic or VOL)').check();
  await editor.getByRole('button', { name: 'Add expected workday' }).click();
  await editor.getByLabel('Work date 1').fill('2026-10-05');
  await editor.getByLabel('Expected hours for this role').fill('24');
  await editor.getByLabel('Estimate required supervision').check();
  const supervision = editor.getByTestId('opportunity-supervision-0');
  await supervision.getByLabel('Supervisor role').fill('Site Supervisor');
  await supervision.getByLabel('Maximum workers per supervisor').fill('4');
  await supervision.getByLabel('Peak crew members').fill('3');
  await supervision.getByLabel('Hours per supervisor').fill('8');
  await editor.getByLabel('Scope and qualification notes').fill('Confirm insulation scope, access, subsidy assumptions, and client decision process.');
  const opportunityResponsePromise = page.waitForResponse(response =>
    response.request().method() === 'POST' && /\/api\/ledger\/opportunities$/.test(new URL(response.url()).pathname))
  await editor.getByRole('button', { name: 'Retain opportunity' }).click();
  const opportunityResponse = await opportunityResponsePromise
  expect(opportunityResponse.ok()).toBeTruthy()
  const opportunityPayload = await opportunityResponse.json()
  expect(opportunityPayload.opportunity.data.capacityForecast).toEqual({
    windowStart: '2026-10-05',
    windowEnd: '2026-10-09',
    trades: [{ role: 'Installer', hours: 24, dailyDemand: [{ date: '2026-10-05', hours: 24 }], requiredQualifications: ['vca'], requiredSkills: ['roof insulation', 'vapour barrier detailing'], supervision: {
      role: 'Site Supervisor', workersPerSupervisor: 4, requiredQualifications: [],
      dailyDemand: [{ date: '2026-10-05', crewSize: 3, supervisorShiftHours: 8 }]
    } }]
  })
  expect(opportunityPayload.opportunity.data.materialForecast).toEqual([
    { materialId: stockMaterial.id, quantity: 14, unit: 'm2' }
  ])
  await expect(page.getByText('Opportunity retained in the preconstruction pipeline.')).toBeVisible();

  const jobsBefore = await request.get(`/api/ledger/jobs?search=${encodeURIComponent(title)}&limit=100`);
  expect(jobsBefore.ok()).toBeTruthy();
  expect((await jobsBefore.json()).jobs).toHaveLength(0);

  await page.getByRole('button', { name: 'Pipeline', exact: true }).click();
  const pipeline = page.getByTestId('pipeline-workspace');
  await expect(pipeline.getByRole('heading', { name: 'Preconstruction pipeline' })).toBeVisible();
  const row = pipeline.locator('.pipeline-row').filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await expect(row).toContainText('€24,000.00');
  await expect(row).toContainText('€2,400.00');

  await row.getByRole('button', { name: 'Follow-up' }).click();
  const activityModal = page.getByTestId('opportunity-activity-modal');
  await activityModal.getByLabel('Activity type').selectOption('qualification');
  await activityModal.getByLabel('Due').fill('2026-07-20T09:00');
  await activityModal.getByLabel('Summary').fill('Confirm subsidy and access assumptions');
  await activityModal.getByLabel('Internal notes').fill('Office review only; do not send until contact details and scope are confirmed.');
  await activityModal.getByRole('button', { name: 'Retain activity' }).click();
  await expect(page.getByText('Internal opportunity activity retained. No external message was sent.')).toBeVisible();

  await row.getByRole('button', { name: `Open ${title}` }).click();
  const detail = pipeline.locator('.pipeline-detail');
  await expect(detail.getByRole('heading', { name: title })).toBeVisible();
  await expect(detail.getByText('Confirm subsidy and access assumptions')).toBeVisible();
  await detail.getByRole('button', { name: 'Complete' }).click();
  await expect(page.getByText('Opportunity activity completed in the internal ledger.')).toBeVisible();
  await expect(detail.getByText('completed', { exact: true })).toBeVisible();

  const conversionResponsePromise = page.waitForResponse(response =>
    response.request().method() === 'POST' && new URL(response.url()).pathname === `/api/ledger/opportunities/${opportunityPayload.opportunity.id}/convert`)
  await row.getByRole('button', { name: 'Create job' }).click();
  const conversionResponse = await conversionResponsePromise
  expect(conversionResponse.ok()).toBeTruthy()
  const conversionPayload = await conversionResponse.json()
  expect(conversionPayload.job.data.preconstructionCapacityForecast).toMatchObject({
    format: 'contractor_ai_preconstruction_capacity_forecast_v1',
    sourceOpportunityId: opportunityPayload.opportunity.id,
    forecast: opportunityPayload.opportunity.data.capacityForecast,
    status: 'planning_basis_only',
    assignmentsCreated: 0
  })
  expect(conversionPayload.job.materials).toHaveLength(1)
  expect(conversionPayload.job.materials[0]).toMatchObject({ materialId: stockMaterial.id, quantity: 14, unit: 'm2' })
  expect(conversionPayload.job.materials[0].data).toMatchObject({
    sourceOpportunityId: opportunityPayload.opportunity.id,
    source: 'opportunity_material_forecast'
  })
  expect(conversionPayload.job.qualificationRequirements).toContainEqual(expect.objectContaining({
    credentialType: 'vca', roleKey: 'installer', mandatory: true, data: expect.objectContaining({ source: 'opportunity_capacity_forecast' })
  }))
  await expect(page.getByText('Qualified opportunity converted to an internal job. No external commitment was made.')).toBeVisible();
  const jobsAfter = await request.get(`/api/ledger/jobs?search=${encodeURIComponent(title)}&limit=100`);
  expect(jobsAfter.ok()).toBeTruthy();
  expect((await jobsAfter.json()).jobs).toHaveLength(1);
  await expect(row.getByRole('button', { name: `Open linked job for ${title}` })).toBeVisible();
  await row.getByRole('button', { name: `Open linked job for ${title}` }).click();
  const jobWorkspace = page.getByTestId('job-workspace');
  await expect(jobWorkspace.getByRole('heading', { name: title })).toBeVisible();
  const staffingBasis = jobWorkspace.getByTestId('preconstruction-capacity-forecast');
  await expect(staffingBasis).toBeVisible();
  await staffingBasis.locator('summary').click();
  await expect(staffingBasis).toContainText('Site Supervisor');
  await expect(staffingBasis).toContainText('planning basis');

  const jobId = conversionPayload.job.id;
  const planStart = new Date('2026-10-12T06:00:00.000Z');
  const planEnd = new Date(planStart.getTime() + 8 * 60 * 60 * 1000);
  const planWorkerResponse = await request.post('/api/ledger/workers', { data: {
    name: `Pipeline reconciliation carpenter ${Date.now()}`, role: 'Carpenter', status: 'available'
  } });
  expect(planWorkerResponse.ok()).toBeTruthy();
  const { worker: planWorker } = await planWorkerResponse.json();
  const planAssignmentResponse = await request.post(`/api/ledger/jobs/${jobId}/assignments`, { data: {
    workerId: planWorker.id, role: 'Carpenter', status: 'planned',
    scheduledStart: planStart.toISOString(), scheduledEnd: planEnd.toISOString(), allocationHours: 8
  } });
  expect(planAssignmentResponse.ok()).toBeTruthy();
  const plannedTaskResponse = await request.post(`/api/ledger/jobs/${jobId}/tasks`, { data: {
    title: 'Prepare insulation framing', status: 'open', requiredTrade: 'Carpenter', durationHours: 4
  } });
  expect(plannedTaskResponse.ok()).toBeTruthy();

  await page.getByRole('button', { name: /Close job workspace|Opdrachtwerkruimte sluiten/ }).click();
  await page.getByRole('button', { name: 'Pipeline', exact: true }).click();
  const refreshedRow = page.getByTestId('pipeline-workspace').locator('.pipeline-row').filter({ hasText: title });
  const reopenOpportunity = refreshedRow.getByRole('button', { name: `Open ${title}` });
  if (await reopenOpportunity.count()) await reopenOpportunity.click();
  await refreshedRow.getByRole('button', { name: `Open linked job for ${title}` }).click();
  const executionWorkPlan = page.getByTestId('job-workspace').getByTestId('job-task-control');
  await executionWorkPlan.getByLabel('Plan start').fill(planStart.toISOString().slice(0, 16));
  await executionWorkPlan.getByRole('button', { name: 'Preview resource plan' }).click();
  const reconciliation = executionWorkPlan.getByTestId('resource-plan-preview').getByTestId('preconstruction-reconciliation');
  await expect(reconciliation).toContainText('Pursuit estimate versus planned hours');
  await expect(reconciliation).toContainText('Installer');
  await expect(reconciliation).toContainText('This estimated trade has no task in the current work plan.');
  await expect(reconciliation).toContainText('Carpenter');
  await expect(reconciliation).toContainText('4 h planned with no pursuit estimate');
  await expect(reconciliation).toContainText('Site Supervisor');
  await expect(reconciliation).toContainText('Task-level supervision is not configured for this forecast role.');
  const dates = reconciliation.getByTestId('preconstruction-date-review');
  await dates.locator('summary').click();
  await expect(dates).toContainText('2026-10-05');
  await expect(dates).toContainText('2026-10-12');
  await expect(dates).toContainText('Outside expected work window');
  await expect(dates).toContainText('4 h planned; dated estimate unknown');
  await reconciliation.screenshot({ path: path.join(os.tmpdir(), 'contractor-ai-date-review-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  const reportGeometry = await reconciliation.evaluate(element => ({
    scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
    viewportWidth: window.innerWidth, pageWidth: document.body.scrollWidth
  }));
  expect(reportGeometry.scrollWidth).toBeLessThanOrEqual(reportGeometry.clientWidth);
  expect(reportGeometry.pageWidth).toBeLessThanOrEqual(reportGeometry.viewportWidth);
  await reconciliation.screenshot({ path: path.join(os.tmpdir(), 'contractor-ai-date-review-mobile.png') });
  const outsideWindow = dates.getByText('Outside expected work window', { exact: true });
  await outsideWindow.scrollIntoViewIfNeeded();
  await expect(outsideWindow).toBeInViewport();
  await page.screenshot({ path: path.join(os.tmpdir(), 'contractor-ai-date-review-mobile-warning.png') });
  expect(pageErrors).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });

  await page.getByRole('button', { name: /Close job workspace|Opdrachtwerkruimte sluiten/ }).click();
  await page.getByRole('button', { name: 'Pipeline', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const geometry = await pipeline.evaluate(element => ({
    pageWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
});
