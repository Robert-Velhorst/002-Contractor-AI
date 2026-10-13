const { test, expect } = require('@playwright/test');

async function postJson(request, route, data) {
  const response = await request.post(route, { data });
  expect(response.ok(), `${route}: ${await response.text()}`).toBeTruthy();
  return response.json();
}

function localDateTime(value) {
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

async function waitForResources(page) {
  await expect(page.getByText('Loading resources', { exact: true })).toBeHidden({ timeout: 15_000 });
}

async function selectEnglish(page) {
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
}

test('operator retains worker unavailability, sees assignment conflict, and requests governed cancellation', async ({ page, request }) => {
  const suffix = Date.now();
  const worker = (await postJson(request, '/api/ledger/workers', {
    name: `Browser availability worker ${suffix}`,
    role: 'Installer',
    status: 'available'
  })).worker;
  const startsAt = new Date(Date.now() + 12 * 86_400_000);
  startsAt.setUTCHours(8, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 8 * 3_600_000);

  await page.goto('/');
  await selectEnglish(page);
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  await waitForResources(page);
  await page.getByRole('tab', { name: 'Availability', exact: true }).click();
  const workspace = page.getByTestId('availability-workspace');
  await expect(workspace).toBeVisible();
  await workspace.getByRole('button', { name: 'Add unavailability' }).click();
  const editor = page.getByTestId('availability-editor');
  await expect(editor).toBeVisible();
  await editor.getByLabel('Worker').selectOption(worker.id);
  await editor.getByLabel('Operational type').selectOption('training');
  await editor.getByLabel('Display title').fill('Browser installation training');
  await editor.getByLabel('Starts').fill(localDateTime(startsAt));
  await editor.getByLabel('Ends').fill(localDateTime(endsAt));
  await editor.getByLabel('Operational note').fill('Capacity planning only.');
  await editor.getByRole('button', { name: 'Block availability window' }).click();
  await expect(page.getByText(/now blocks overlapping scheduling/)).toBeVisible();
  const availabilityRow = workspace.locator('.availability-row').filter({ hasText: worker.name });
  await expect(availabilityRow).toBeVisible();
  await expect(availabilityRow.getByText('Browser installation training')).toBeVisible();
  await expect(availabilityRow.getByText('upcoming', { exact: true })).toBeVisible();

  const job = (await postJson(request, '/api/ledger/intake', {
    title: `Browser availability job ${suffix}`,
    client: { name: 'Browser availability client' },
    status: 'scheduled',
    scheduledStart: startsAt.toISOString(),
    scheduledEnd: endsAt.toISOString(),
    assignAutomatically: false
  })).job;
  const material = (await postJson(request, `/api/ledger/jobs/${job.id}/materials`, {
    name: `Roof membrane ${suffix}`, quantity: 10, unit: 'rolls', status: 'needed'
  })).materialRequirement;
  await postJson(request, `/api/ledger/jobs/${job.id}/tasks`, {
    title: 'Install roof membrane', durationHours: 8, materialRequirementIds: [material.id]
  });
  const assignment = await postJson(request, `/api/ledger/jobs/${job.id}/assignments`, {
    workerId: worker.id,
    role: 'Installer',
    status: 'planned',
    scheduledStart: startsAt.toISOString(),
    scheduledEnd: endsAt.toISOString()
  });
  expect(assignment.assignment.status).toBe('pending_approval');
  expect(assignment.assignment.availabilityConflicts).toHaveLength(1);

  await page.getByRole('tab', { name: 'Inventory', exact: true }).click();
  await page.getByRole('tab', { name: 'Workforce', exact: true }).click();
  await waitForResources(page);
  await page.getByRole('tab', { name: 'Availability', exact: true }).click();
  await expect(availabilityRow.getByText('1 conflict', { exact: true })).toBeVisible();
  const disruptionImpact = availabilityRow.locator('.availability-recovery-job').filter({ hasText: `Roof membrane ${suffix}` });
  await expect(disruptionImpact).toContainText(`Roof membrane ${suffix}: 10 rolls short`);
  await expect(disruptionImpact).toContainText('Install roof membrane');
  await expect(disruptionImpact).toContainText('Blocked');
  await availabilityRow.getByRole('button', { name: 'Request cancellation' }).click();
  const cancellationDialog = page.getByTestId('availability-cancellation-modal');
  await cancellationDialog.getByLabel('Operational reason').fill('Training was moved outside this assignment window.');
  await cancellationDialog.getByRole('button', { name: 'Request cancellation approval' }).click();
  await expect(page.getByText(/scheduling block remains active until approval/)).toBeVisible();
  await expect(availabilityRow.getByText('pending cancellation', { exact: true })).toBeVisible();
  await expect(availabilityRow.getByRole('button', { name: 'Review cancellation' })).toBeVisible();

  const approvals = await (await request.get('/api/ledger/approvals?status=pending&limit=100')).json();
  const cancellationApproval = approvals.approvals.find(item => (
    item.targetType === 'worker_availability_cancellation'
    && item.data?.workerId === worker.id
  ));
  expect(cancellationApproval).toBeTruthy();
  await postJson(request, `/api/ledger/approvals/${cancellationApproval.id}/resolve`, {
    status: 'approved',
    resolvedBy: 'Browser availability approver',
    reason: 'Verified operational training move.'
  });

  await page.getByRole('tab', { name: 'Inventory', exact: true }).click();
  await page.getByRole('tab', { name: 'Workforce', exact: true }).click();
  await waitForResources(page);
  await page.getByRole('tab', { name: 'Availability', exact: true }).click();
  await expect(availabilityRow).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(workspace).toBeVisible();
  const geometry = await workspace.evaluate(element => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
});

test('operator coordinates replacements across two jobs from one availability review', async ({ page, request }) => {
  const suffix = Date.now();
  const createWorker = async name => (await postJson(request, '/api/ledger/workers', { name: `${name} ${suffix}`, role: 'Installer', status: 'available' })).worker;
  const worker = await createWorker('Batch unavailable worker');
  const replacements = [await createWorker('Batch replacement one'), await createWorker('Batch replacement two')];
  const startsAt = new Date(Date.now() + 20 * 86_400_000);
  startsAt.setUTCHours(8, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 6 * 3_600_000);
  const period = (await postJson(request, `/api/ledger/workers/${worker.id}/availability`, {
    periodType: 'unavailable', title: 'Coordinated capacity change', startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString()
  })).period;
  const jobs = [];
  for (const number of [1, 2]) {
    const job = (await postJson(request, '/api/ledger/intake', {
      title: `Batch recovery job ${number} ${suffix}`,
      client: { name: `Batch recovery client ${number}` },
      status: 'scheduled',
      scheduledStart: startsAt.toISOString(),
      scheduledEnd: endsAt.toISOString(),
      assignAutomatically: false
    })).job;
    const assignment = await postJson(request, `/api/ledger/jobs/${job.id}/assignments`, {
      workerId: worker.id, role: 'Installer', scheduledStart: startsAt.toISOString(), scheduledEnd: endsAt.toISOString()
    });
    jobs.push({ job, assignment: assignment.assignment });
  }

  await page.goto('/');
  await selectEnglish(page);
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  await waitForResources(page);
  await page.getByRole('tab', { name: 'Availability', exact: true }).click();
  const workspace = page.getByTestId('availability-workspace');
  const row = workspace.locator('.availability-row').filter({ hasText: worker.name });
  await expect(row.getByText('2 conflicts', { exact: true })).toBeVisible();
  await row.getByRole('button', { name: 'Coordinate all 2 replacements' }).click();
  const dialog = page.getByRole('dialog', { name: 'Coordinate assignment replacements' });
  await dialog.getByLabel(`Replacement for ${jobs[0].job.title}`).selectOption(replacements[0].id);
  await dialog.getByLabel(`Replacement for ${jobs[1].job.title}`).selectOption(replacements[1].id);
  await dialog.getByLabel('Operational reason').fill('One absence affects two overlapping scheduled field jobs.');
  await page.setViewportSize({ width: 390, height: 844 });
  await dialog.getByRole('button', { name: 'Submit plan for approval' }).click();
  await expect(page.getByText(/Coordinated replacement plan submitted for approval/)).toBeVisible();

  const pending = await (await request.get('/api/ledger/approvals?status=pending&limit=100')).json();
  const approval = pending.approvals.find(item => item.targetType === 'assignment_replacement_plan' && item.data?.availabilityPeriodId === period.id);
  expect(approval).toBeTruthy();
  expect(approval.data.assignments).toHaveLength(2);
  for (const item of jobs) {
    const detail = await (await request.get(`/api/ledger/jobs/${item.job.id}`)).json();
    expect(detail.job.assignments.find(assignment => assignment.id === item.assignment.id).status).toBe('pending_approval');
  }
  await postJson(request, `/api/ledger/approvals/${approval.id}/resolve`, { status: 'approved', resolvedBy: `Independent batch reviewer ${suffix}` });
  for (let index = 0; index < jobs.length; index += 1) {
    const detail = await (await request.get(`/api/ledger/jobs/${jobs[index].job.id}`)).json();
    expect(detail.job.assignments.find(assignment => assignment.id === jobs[index].assignment.id).status).toBe('released');
    expect(detail.job.assignments.find(assignment => assignment.workerId === replacements[index].id).status).toBe('planned');
  }
  const geometry = await workspace.evaluate(() => ({ pageWidth: document.documentElement.scrollWidth, viewportWidth: document.documentElement.clientWidth }));
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
});

test('unknown return remains blocked beyond its follow-up date until an approved capacity change', async ({ page, request }, testInfo) => {
  const suffix = Date.now();
  const role = `Unknown return installer ${suffix}`;
  const worker = (await postJson(request, '/api/ledger/workers', {
    name: `Unknown return worker ${suffix}`,
    role,
    status: 'available'
  })).worker;
  const replacement = (await postJson(request, '/api/ledger/workers', {
    name: `Standby replacement ${suffix}`,
    role,
    status: 'standby',
    skills: ['solar installation']
  })).worker;
  const conditionalReplacement = (await postJson(request, '/api/ledger/workers', {
    name: `Conditional replacement ${suffix}`,
    role,
    status: 'available',
    skills: ['solar installation']
  })).worker;
  const startsAt = new Date(Date.now() + 3 * 86_400_000);
  startsAt.setHours(8, 0, 0, 0);
  const reviewAt = new Date(startsAt);
  reviewAt.setDate(reviewAt.getDate() + 4);
  const scheduledStart = new Date(startsAt.getTime() + 45 * 86_400_000);
  const scheduledEnd = new Date(scheduledStart.getTime() + 8 * 3_600_000);
  await postJson(request, `/api/ledger/workers/${conditionalReplacement.id}/availability`, {
    periodType: 'standby',
    title: 'Available on call',
    startsAt: scheduledStart.toISOString(),
    endsAt: scheduledEnd.toISOString()
  });

  await page.goto('/');
  await selectEnglish(page);
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  await waitForResources(page);
  await page.getByRole('tab', { name: 'Availability', exact: true }).click();
  const workspace = page.getByTestId('availability-workspace');
  await workspace.getByRole('button', { name: 'Add unavailability' }).click();
  const editor = page.getByTestId('availability-editor');
  await editor.getByLabel('Worker').selectOption(worker.id);
  await editor.getByLabel('Operational type').selectOption('unavailable');
  await editor.getByLabel('Starts').fill(localDateTime(startsAt));
  await editor.getByLabel('Return date is unknown').check();
  await editor.getByLabel('Review availability by').fill(localDateTime(reviewAt).slice(0, 10));
  await editor.getByLabel('Operational note').fill('Check capacity again; no return date is known.');
  await expect(editor.getByLabel('Ends')).toHaveCount(0);
  await editor.getByRole('button', { name: 'Block availability window' }).click();
  await expect(page.getByText(/now blocks overlapping scheduling/)).toBeVisible();
  const row = workspace.locator('.availability-row').filter({ hasText: worker.name });
  await expect(row.getByText('Return date unknown', { exact: true })).toBeVisible();
  await expect(row.getByText(/Review availability by/)).toBeVisible();
  const job = (await postJson(request, '/api/ledger/intake', {
    title: `Unknown return future job ${suffix}`,
    client: { name: 'Unknown return client' },
    status: 'scheduled',
    scheduledStart: scheduledStart.toISOString(),
    scheduledEnd: scheduledEnd.toISOString(),
    assignAutomatically: false
  })).job;
  const assignment = await postJson(request, `/api/ledger/jobs/${job.id}/assignments`, {
    workerId: worker.id,
    role,
    status: 'planned',
    scheduledStart: scheduledStart.toISOString(),
    scheduledEnd: scheduledEnd.toISOString()
  });
  expect(assignment.assignment.status).toBe('pending_approval');
  expect(assignment.assignment.availabilityConflicts).toHaveLength(1);
  expect(assignment.assignment.availabilityConflicts[0].endsAt).toBeNull();

  const reviewReference = `${localDateTime(reviewAt).slice(0, 10)}T00:00:00.000Z`;
  const register = await (await request.get(`/api/ledger/availability?referenceAt=${encodeURIComponent(reviewReference)}`)).json();
  expect(register.availabilityRegister.summary.followUpDue).toBe(1);
  expect(register.availabilityRegister.summary.unknownReturn).toBe(1);
  const conflict = register.availabilityRegister.conflicts.find(item => item.assignmentId === assignment.assignment.id);
  expect(conflict.replacementCandidates.map(item => item.worker.id)).toContain(replacement.id);
  expect(conflict.replacementCandidates.map(item => item.worker.id)).not.toContain(conditionalReplacement.id);

  await page.getByRole('tab', { name: 'Inventory', exact: true }).click();
  await page.getByRole('tab', { name: 'Workforce', exact: true }).click();
  await waitForResources(page);
  await page.getByRole('tab', { name: 'Availability', exact: true }).click();
  await expect(row.getByText('1 conflict', { exact: true })).toBeVisible();
  const recovery = workspace.getByRole('region', { name: 'Affected assignments' });
  await expect(recovery.getByText(job.title)).toBeVisible();
  await expect(recovery.getByText(replacement.name, { exact: true })).toBeVisible();
  await expect(recovery.getByText(conditionalReplacement.name, { exact: true })).toHaveCount(0);
  await expect(recovery.getByRole('button', { name: `Plan with ${replacement.name}` })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('unknown-return-desktop.png'), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const navigationScrim = page.getByRole('button', { name: 'Close navigation overlay' });
  if (await navigationScrim.isVisible()) await navigationScrim.click();
  await expect(page.locator('.side-nav')).toHaveCSS('visibility', 'hidden');
  const geometry = await workspace.evaluate(element => ({
    pageWidth: document.documentElement.scrollWidth,
    viewportWidth: document.documentElement.clientWidth,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  await page.screenshot({ path: testInfo.outputPath('unknown-return-mobile.png'), fullPage: true });

  await recovery.getByRole('button', { name: `Plan with ${replacement.name}` }).click();
  await expect(page.getByTestId('job-workspace')).toBeVisible();
  const planner = page.getByTestId('resource-planner');
  await expect(planner).toBeVisible();
  await expect(planner.getByLabel('Crew member')).toHaveValue(replacement.id);
  await expect(planner.getByText(job.title)).toBeVisible();
  await planner.getByRole('button', { name: 'Close resource planner' }).click();
  await page.getByRole('button', { name: 'Close job workspace' }).click();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  await waitForResources(page);
  await page.getByRole('tab', { name: 'Availability', exact: true }).click();
  const refreshedRecovery = page.getByRole('region', { name: 'Affected assignments' });
  const selectedCandidate = refreshedRecovery.locator('.availability-recovery-job').filter({ hasText: job.title })
    .locator('.availability-candidate').filter({ hasText: replacement.name });
  await selectedCandidate.getByRole('button', { name: 'Request swap' }).click();
  const replacementDialog = page.getByRole('dialog', { name: 'Replace worker' });
  await replacementDialog.getByLabel('Operational reason').fill('Unknown return requires an independently approved cover plan.');
  await replacementDialog.getByRole('button', { name: 'Submit for approval' }).click();
  await expect(replacementDialog).toBeHidden();
  const pendingApprovals = await (await request.get('/api/ledger/approvals?status=pending&limit=100')).json();
  const replacementApproval = pendingApprovals.approvals.find(item => item.targetType === 'assignment_replacement' && item.jobId === job.id);
  expect(replacementApproval).toBeTruthy();
  const unchanged = await request.get(`/api/ledger/jobs/${job.id}`);
  const unchangedAssignments = (await unchanged.json()).job.assignments;
  expect(unchangedAssignments).toHaveLength(2);
  expect(unchangedAssignments.find(item => item.id === assignment.assignment.id).status).toBe('pending_approval');
  expect(unchangedAssignments.find(item => item.id === replacementApproval.targetId).status).toBe('pending_approval');
  const retainedAssignments = await request.get(`/api/ledger/jobs/${job.id}`);
  expect((await retainedAssignments.json()).job.assignments).toHaveLength(2);
});
