const { test, expect } = require('@playwright/test');
const os = require('node:os');
const path = require('node:path');

test('operator calculates, approves, and revises a critical-path work plan', async ({ page, request }) => {
  const title = `Browser critical path ${Date.now()}`;
  const startDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
  startDate.setUTCHours(8, 0, 0, 0);
  const plannedStart = startDate.toISOString();
  const startLabel = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(startDate);
  const intakeResponse = await request.post('/api/ledger/intake', {
    data: {
      title,
      service: 'Interior renovation',
      status: 'planned',
      scheduledStart: plannedStart,
      client: { name: 'Browser Schedule Client', email: 'browser-schedule@example.test', country: 'NL' },
      tasks: [
        { title: 'Prepare site', durationHours: 8, priority: 'high' },
        { title: 'Install work', durationHours: 16, priority: 'high' }
      ],
      assignAutomatically: false
    }
  });
  expect(intakeResponse.ok()).toBeTruthy();
  const intake = await intakeResponse.json();
  const [prepareTask, installTask] = intake.job.tasks;

  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await page.getByRole('button', { name: `Open ${title}` }).first().click();
  const workspace = page.getByTestId('job-workspace');
  const workPlan = workspace.getByTestId('job-task-control');
  await expect(workPlan.getByRole('heading', { name: 'Work plan' })).toBeVisible();
  await expect(workPlan.getByText('No approved baseline')).toBeVisible();
  await expect(workPlan.getByText('24h', { exact: true }).first()).toBeVisible();

  const dependencyForm = workPlan.locator('.dependency-form');
  await dependencyForm.getByLabel('Predecessor').selectOption(prepareTask.id);
  await dependencyForm.getByLabel('Successor').selectOption(installTask.id);
  await dependencyForm.getByRole('button', { name: 'Add link' }).click();
  await expect(workPlan.locator('.dependency-list')).toContainText('Prepare site');
  await expect(workPlan.locator('.dependency-list')).toContainText('Install work');

  await workPlan.getByLabel('Plan start').fill(plannedStart.slice(0, 16));
  await workPlan.getByRole('button', { name: 'Calculate' }).click();
  await expect(workPlan.getByText('24h', { exact: true })).toHaveCount(2);
  await expect(workPlan.locator('.work-plan-task .tag-red')).toHaveCount(2);
  await expect(workPlan.locator('.work-plan-result > div').filter({ hasText: 'Critical path' }).locator('strong')).toHaveText('2 tasks');
  await expect(workPlan.locator('.work-plan-result > div').filter({ hasText: '14-day look-ahead' }).locator('strong')).toHaveText('2 tasks');

  await workPlan.getByRole('button', { name: 'Request baseline' }).click();
  await expect(workPlan.getByText('Baseline v1 pending')).toBeVisible();
  await workPlan.getByRole('button', { name: 'Review baseline v1' }).click();

  await expect(page.getByRole('heading', { name: 'Approval queue' })).toBeVisible();
  const approvalItem = page.locator('.approval-item').filter({ hasText: `Approve work-plan baseline v1 for ${title}` });
  await expect(approvalItem).toHaveCount(1);
  await approvalItem.getByRole('button', { name: 'Review and approve' }).click();
  const approvalModal = page.getByTestId('approval-review-modal');
  await approvalModal.getByLabel('Reviewer reason').fill('Task durations, sequence, float, and critical path verified.');
  await approvalModal.getByRole('button', { name: 'Confirm approval' }).click();

  await page.getByRole('button', { name: 'Today' }).click();
  await page.getByRole('button', { name: `Open ${title}` }).first().click();
  const reopenedPlan = page.getByTestId('job-workspace').getByTestId('job-task-control');
  await expect(reopenedPlan.getByText('Baseline v1 current')).toBeVisible();
  await expect(reopenedPlan.getByText(startLabel, { exact: false }).first()).toBeVisible();

  await reopenedPlan.getByLabel('Duration hours for Install work').fill('20');
  await reopenedPlan.getByRole('button', { name: 'Save duration for Install work' }).click();
  await expect(reopenedPlan.getByText('Baseline v1 stale')).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const geometry = await reopenedPlan.evaluate(element => ({
    pageWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    visibleOverflow: [...element.querySelectorAll('*')]
      .filter(child => {
        const style = getComputedStyle(child);
        const bounds = child.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0
          && bounds.right > window.innerWidth + 1;
      })
      .map(child => {
        const bounds = child.getBoundingClientRect();
        return {
          tag: child.tagName,
          type: child.getAttribute('type'),
          label: child.getAttribute('aria-label') || child.labels?.[0]?.textContent?.trim() || '',
          id: child.id,
          right: Math.round(bounds.right),
          width: Math.round(bounds.width),
          text: child.textContent.trim().slice(0, 80)
        };
      })
  }));
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.visibleOverflow).toEqual([]);
  const dependencyBounds = await reopenedPlan.locator('.dependency-list button').evaluate(button => ({
    width: button.getBoundingClientRect().width,
    right: button.getBoundingClientRect().right,
    rowRight: button.parentElement.getBoundingClientRect().right
  }));
  expect(dependencyBounds.width).toBeGreaterThanOrEqual(44);
  expect(dependencyBounds.right).toBeLessThanOrEqual(dependencyBounds.rowRight);
});

test('replacement-task schedule review is visible and opens the resource planner', async ({ page, request }) => {
  const title = `Browser replacement schedule review ${Date.now()}`;
  const start = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  start.setUTCHours(7, 0, 0, 0);
  const end = new Date(start.getTime() + 8 * 60 * 60 * 1000);
  const intakeResponse = await request.post('/api/ledger/intake', { data: {
    title, service: 'Installation', status: 'planned', scheduledStart: start.toISOString(), scheduledEnd: end.toISOString(),
    client: { name: `${title} Client`, email: 'replacement-review@example.test', country: 'NL' }, tasks: [], assignAutomatically: false
  } });
  expect(intakeResponse.ok(), await intakeResponse.text()).toBeTruthy();
  const { job } = await intakeResponse.json();
  for (const scaffoldTask of job.tasks || []) {
    const cancelResponse = await request.patch(`/api/ledger/jobs/${job.id}/lifecycle/task/${scaffoldTask.id}`, {
      data: { status: 'cancelled', notes: 'Keep this test focused on the replacement task schedule.', actor: 'office_operator' }
    });
    expect(cancelResponse.ok(), await cancelResponse.text()).toBeTruthy();
  }
  const workerResponse = await request.post('/api/ledger/workers', { data: {
    name: `Replacement review installer ${Date.now()}`, role: 'Installer', status: 'available'
  } });
  expect(workerResponse.ok(), await workerResponse.text()).toBeTruthy();
  const { worker } = await workerResponse.json();
  const assignmentResponse = await request.post(`/api/ledger/jobs/${job.id}/assignments`, { data: {
    workerId: worker.id, role: 'Installer', status: 'planned',
    scheduledStart: start.toISOString(), scheduledEnd: end.toISOString(), allocationHours: 8
  } });
  expect(assignmentResponse.ok(), await assignmentResponse.text()).toBeTruthy();
  const taskResponse = await request.post(`/api/ledger/jobs/${job.id}/tasks`, { data: {
    title: 'Replan transferred installation', status: 'open', assigneeId: worker.id, requiredTrade: 'Installer', durationHours: 2,
    data: { crewWorkerIds: [worker.id], crewWorkerAssignments: [{ workerId: worker.id, role: 'Installer' }],
      replacementScheduleReviewRequired: { approvalId: 'browser-replacement-approval', requiredBeforeAllocation: true } }
  } });
  expect(taskResponse.ok(), await taskResponse.text()).toBeTruthy();
  const { task } = await taskResponse.json();

  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await page.getByRole('button', { name: `Open ${title}` }).first().click();
  const workPlan = page.getByTestId('job-workspace').getByTestId('job-task-control');
  const review = workPlan.getByTestId(`replacement-schedule-review-${task.id}`);
  await expect(review).toContainText('Replacement schedule review required');
  await review.getByRole('button', { name: 'Review replacement schedule' }).click();
  await expect(workPlan.getByTestId('resource-plan-preview')).toContainText('Proposed allocation under recorded constraints');
});

test('operator jointly plans crews across jobs with travel time and requests one approval', async ({ page, request }) => {
  const marker = Date.now();
  const plannedStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  plannedStart.setUTCHours(7, 0, 0, 0);
  const plannedEnd = new Date(plannedStart.getTime() + 2 * 24 * 60 * 60 * 1000);
  const jobs = [];
  for (const [label, address] of [['North', 'North Road 5'], ['South', 'South Road 18']]) {
    const response = await request.post('/api/ledger/intake', { data: {
      title: `Portfolio ${label} ${marker}`, status: 'planned', address, city: 'Utrecht', country: 'NL',
      scheduledStart: plannedStart.toISOString(), scheduledEnd: plannedEnd.toISOString(),
      client: { name: `Portfolio client ${label} ${marker}`, country: 'NL' },
      tasks: [{ title: `${label} installation ${marker}`, durationHours: 2, requiredTrade: 'Installer' }],
      assignAutomatically: false
    } });
    expect(response.ok()).toBeTruthy();
    jobs.push((await response.json()).job);
  }
  const workerResponse = await request.post('/api/ledger/workers', { data: {
    name: `Portfolio installer ${marker}`, role: 'Installer', status: 'available'
  } });
  const worker = (await workerResponse.json()).worker;
  for (const job of jobs) {
    const response = await request.post(`/api/ledger/jobs/${job.id}/assignments`, { data: {
      workerId: worker.id, role: 'Installer', status: 'planned',
      scheduledStart: plannedStart.toISOString(), scheduledEnd: plannedEnd.toISOString()
    } });
    expect(response.ok()).toBeTruthy();
  }
  const routeResponse = await request.post(`/api/ledger/jobs/${jobs[0].id}/travel-routes`, { data: {
    externalJobId: jobs[1].id, minutesToExternal: 45, minutesFromExternal: 30,
    sourceType: 'map_reference', note: 'Map route checked in both directions.'
  } });
  expect(routeResponse.ok()).toBeTruthy();

  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await page.getByRole('button', { name: 'Schedule', exact: true }).click();
  const planner = page.getByTestId('portfolio-resource-planner');
  await expect(planner).toBeVisible();
  for (const job of jobs) await planner.getByLabel(new RegExp(job.title)).check();
  await planner.getByLabel('Shared planning start').fill(plannedStart.toISOString().slice(0, 16));
  await planner.getByRole('button', { name: 'Calculate joint plan' }).click();
  await expect(planner.getByText('2 task allocations')).toBeVisible();
  await expect(planner).toContainText(worker.name);
  await expect(planner).toContainText(/(?:45 min \/ 30 min|30 min \/ 45 min)/);
  await page.setViewportSize({ width: 390, height: 844 });
  const plannerGeometry = await planner.evaluate(element => ({
    viewportWidth: window.innerWidth,
    pageWidth: document.body.scrollWidth,
    right: element.getBoundingClientRect().right,
    visibleOverflow: [...element.querySelectorAll('input, button, article, label')]
      .filter(child => {
        const bounds = child.getBoundingClientRect();
        return bounds.width > 0 && (bounds.left < -1 || bounds.right > window.innerWidth + 1);
      }).map(child => child.textContent.trim().slice(0, 60))
  }));
  expect(plannerGeometry.pageWidth).toBeLessThanOrEqual(plannerGeometry.viewportWidth);
  expect(plannerGeometry.right).toBeLessThanOrEqual(plannerGeometry.viewportWidth + 1);
  expect(plannerGeometry.visibleOverflow).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 960 });
  await planner.getByRole('button', { name: 'Request independent approval' }).click();
  await expect(page.getByRole('heading', { name: 'Approval queue' })).toBeVisible();
  await expect(page.locator('.approval-item').filter({ hasText: 'Approve joint resource plan for 2 jobs' })).toHaveCount(1);
});

test('operator links a material requirement to a task and sees an unresolved shortage block planning', async ({ page, request }) => {
  const title = `Browser material constraint ${Date.now()}`;
  const countReference = `COUNT-${Date.now()}`;
  const stockResponse = await request.post('/api/ledger/material-stock/counts', {
    data: { name: 'Roof membrane shared stock', unit: 'rolls', countedQuantity: 10, reference: countReference, note: 'Browser work-plan stock check.', entryKey: `work-plan-stock-${Date.now()}` }
  });
  expect(stockResponse.ok(), await stockResponse.text()).toBeTruthy();
  const { material: stockItem } = await stockResponse.json();
  const intakeResponse = await request.post('/api/ledger/intake', {
    data: {
      title,
      service: 'Roof repair',
      status: 'planned',
      client: { name: 'Browser Material Client', email: 'browser-material@example.test', country: 'NL' },
      tasks: [],
      assignAutomatically: false
    }
  });
  expect(intakeResponse.ok()).toBeTruthy();
  const { job } = await intakeResponse.json();
  const materialResponse = await request.post(`/api/ledger/jobs/${encodeURIComponent(job.id)}/materials`, {
    data: { name: 'Roof membrane', materialId: stockItem.id, quantity: 10, unit: 'rolls' }
  });
  expect(materialResponse.ok()).toBeTruthy();
  const { materialRequirement } = await materialResponse.json();

  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await page.getByRole('button', { name: `Open ${title}` }).first().click();
  const workPlan = page.getByTestId('job-workspace').getByTestId('job-task-control');
  await workPlan.getByLabel('Task title').fill('Install roof membrane');
  await workPlan.getByLabel('Trade group 1', { exact: true }).fill('Roofer');
  await workPlan.getByLabel('Required materials').selectOption(materialRequirement.id);
  await workPlan.getByRole('button', { name: 'Add task' }).click();
  await expect(workPlan.locator('.work-plan-task').getByText('Install roof membrane', { exact: true })).toBeVisible();
  const planStart = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 16);
  await workPlan.getByLabel('Plan start').fill(planStart);
  await workPlan.getByRole('button', { name: 'Calculate' }).click();
  await expect(workPlan.getByRole('alert')).toContainText('Material availability blocks this internal plan');
  await expect(workPlan.getByRole('alert')).toContainText('Roof membrane shared stock missing (0/10 rolls)');
  await expect(workPlan.getByRole('alert')).toContainText('Warehouse position: free 10 / reserved for this job 0 / reserved for other jobs 0 / in transit 0 rolls');
  await expect(workPlan.getByRole('button', { name: 'Request baseline' })).toBeDisabled();
  const reservation = workPlan.locator('.work-plan-stock-reservation');
  await reservation.locator('summary').click();
  await expect(reservation.getByLabel('Quantity to reserve (rolls)')).toHaveValue('10');
  await reservation.getByLabel('Stock count or source reference').fill(countReference);
  await reservation.getByRole('button', { name: 'Confirm warehouse reservation' }).click();
  await expect(workPlan.locator('.form-success')).toContainText('Warehouse stock reserved for this job. Site issue and arrival are still required before the task is ready.');
  await expect(workPlan.getByRole('alert')).toContainText('Warehouse position: free 0 / reserved for this job 10 / reserved for other jobs 0 / in transit 0 rolls');
  const issue = workPlan.locator('.work-plan-stock-reservation');
  await issue.locator('summary').click();
  await expect(issue.getByLabel('Quantity to issue (rolls)')).toHaveValue('10');
  const expectedArrival = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString().slice(0, 16);
  await issue.getByLabel('Expected arrival at job site').fill(expectedArrival);
  await issue.getByLabel('Dispatch reference').fill(`VAN-${Date.now()}`);
  await issue.getByLabel('Issue evidence reference').fill(`signed-dispatch:${Date.now()}`);
  await issue.getByRole('button', { name: 'Record issue to the job site' }).click();
  await expect(workPlan.getByText('Warehouse issue recorded. The work plan now uses its referenced arrival estimate; confirm receipt at the site.', { exact: true })).toBeVisible();
  await expect(workPlan.locator('.notice-warning')).toContainText('Plan uses estimated material availability');
  const plannedTask = workPlan.locator('.work-plan-task').filter({ hasText: 'Install roof membrane' });
  await expect(plannedTask).toContainText('10 in transit rolls');
  await expect(workPlan.getByRole('button', { name: 'Request baseline' })).toBeEnabled();
  const stockSnapshot = await request.get('/api/ledger/material-stock');
  expect(stockSnapshot.ok()).toBeTruthy();
  const stock = await stockSnapshot.json();
  expect(stock.allocations.filter(item => item.requirementId === materialRequirement.id && item.status === 'reserved')).toHaveLength(0);
  expect(stock.siteIssues.filter(item => item.requirementId === materialRequirement.id && item.status === 'in_transit')).toHaveLength(1);
  const jobSnapshot = await request.get(`/api/ledger/jobs/${encodeURIComponent(job.id)}`);
  expect(jobSnapshot.ok()).toBeTruthy();
  const jobDetail = await jobSnapshot.json();
  expect(jobDetail.job.materials.find(item => item.id === materialRequirement.id).data.availableQuantity).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  const geometry = await workPlan.evaluate(element => ({
    pageWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    visibleOverflow: [...element.querySelectorAll('*')]
      .filter(child => {
        const style = getComputedStyle(child);
        const bounds = child.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && bounds.width > 0
          && bounds.right > window.innerWidth + 1;
      })
      .map(child => ({ tag: child.tagName, className: child.className, text: child.textContent.trim().slice(0, 90) }))
  }));
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.visibleOverflow).toEqual([]);
});

test('resource staffing gap opens the matching self-service position workflow', async ({ page, request }) => {
  const title = `Browser staffing gap ${Date.now()}`;
  const startDate = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  startDate.setUTCHours(8, 0, 0, 0);
  const intakeResponse = await request.post('/api/ledger/intake', {
    data: {
      title,
      service: 'Electrical installation',
      status: 'planned',
      scheduledStart: startDate.toISOString(),
      scheduledEnd: new Date(startDate.getTime() + 4 * 60 * 60 * 1000).toISOString(),
      client: { name: 'Browser Staffing Client', email: 'browser-staffing@example.test', country: 'NL' },
      tasks: [{ title: 'Install distribution board', description: 'Replace and test the distribution board.', durationHours: 4, requiredTrade: 'Electrician' }],
      assignAutomatically: false
    }
  });
  expect(intakeResponse.ok()).toBeTruthy();
  const { job } = await intakeResponse.json();

  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await page.getByRole('button', { name: `Open ${title}` }).first().click();
  const workspace = page.getByTestId('job-workspace');
  const workPlan = workspace.getByTestId('job-task-control');
  await workPlan.getByLabel('Plan start').fill(startDate.toISOString().slice(0, 16));
  await workPlan.getByRole('button', { name: 'Preview resource plan' }).click();
  const staffingLink = workPlan.getByRole('link', { name: 'Review positions and worker applications' });
  await expect(staffingLink).toBeVisible();
  await staffingLink.click();

  const workBoard = page.locator(`#work-board-positions-${job.id}`);
  await expect(workBoard).toBeVisible();
  await workBoard.locator('details > summary').click();
  await workBoard.getByLabel('Uit bestaande werkzaamheid').selectOption(job.tasks[0].id);
  await expect(workBoard.getByLabel('Vakgebied')).toHaveValue('Electrician');
  await expect(workBoard.getByLabel('Werkzaamheden')).toHaveValue('Replace and test the distribution board.');
});

test('operator records verified site access hours from the work plan on desktop and mobile', async ({ page, request }) => {
  const title = `Browser site access ${Date.now()}`;
  const intakeResponse = await request.post('/api/ledger/intake', {
    data: {
      title,
      service: 'Interior renovation',
      status: 'planned',
      client: { name: 'Browser Site Access Client', email: 'browser-site-access@example.test', country: 'NL' },
      tasks: [],
      assignAutomatically: false
    }
  });
  expect(intakeResponse.ok()).toBeTruthy();
  const { job } = await intakeResponse.json();

  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await page.getByRole('button', { name: `Open ${title}` }).first().click();
  const workPlan = page.getByTestId('job-workspace').getByTestId('job-task-control');
  const calendar = workPlan.getByTestId('site-access-calendar');
  await calendar.locator('summary').click();
  await calendar.getByRole('group', { name: 'Monday' }).getByRole('button', { name: 'Add access interval' }).click();
  await calendar.getByLabel('Monday Access starts').fill('08:00');
  await calendar.getByLabel('Monday Access ends').fill('16:00');
  await calendar.getByLabel('Site time zone').fill('Europe/Amsterdam');
  await calendar.getByLabel('Confirmation or source note').fill('Client confirmed Monday access by email.');
  await calendar.getByRole('button', { name: 'Save site access hours' }).click();
  await expect(calendar.locator('summary')).toContainText('Verified schedule saved');

  const refreshed = await request.get(`/api/ledger/jobs/${job.id}`);
  expect(refreshed.ok()).toBeTruthy();
  const detail = await refreshed.json();
  expect(detail.job.data.siteAccessCalendar.weeklyWindows.monday).toEqual([{ start: '08:00', end: '16:00' }]);
  expect(detail.job.data.siteAccessCalendar.sourceType).toBe('customer_confirmed');

  await page.setViewportSize({ width: 390, height: 844 });
  const geometry = await calendar.evaluate(element => ({
    pageWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
});

test('resource preview preserves and labels an existing task commitment', async ({ page, request }) => {
  const title = `Browser protected task schedule ${Date.now()}`;
  const plannedStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  plannedStart.setUTCHours(6, 0, 0, 0);
  const commitmentStart = new Date(plannedStart.getTime() + 4 * 60 * 60 * 1000);
  const commitmentEnd = new Date(commitmentStart.getTime() + 2 * 60 * 60 * 1000);
  const intakeResponse = await request.post('/api/ledger/intake', {
    data: {
      title,
      service: 'Installation',
      status: 'planned',
      scheduledStart: plannedStart.toISOString(),
      scheduledEnd: new Date(plannedStart.getTime() + 48 * 60 * 60 * 1000).toISOString(),
      client: { name: 'Protected Schedule Client', email: 'protected-schedule@example.test', country: 'NL' },
      tasks: [{ title: 'Committed installation', durationHours: 2, requiredTrade: 'Installer' }],
      assignAutomatically: false
    }
  });
  expect(intakeResponse.ok()).toBeTruthy();
  const { job } = await intakeResponse.json();
  const workerResponse = await request.post('/api/ledger/workers', {
    data: { name: 'Protected schedule installer', role: 'Installer', status: 'available' }
  });
  expect(workerResponse.ok()).toBeTruthy();
  const { worker } = await workerResponse.json();
  const assignmentResponse = await request.post(`/api/ledger/jobs/${job.id}/assignments`, {
    data: {
      workerId: worker.id,
      role: 'Installer',
      status: 'planned',
      scheduledStart: plannedStart.toISOString(),
      scheduledEnd: new Date(plannedStart.getTime() + 48 * 60 * 60 * 1000).toISOString(),
      allocationHours: 2
    }
  });
  expect(assignmentResponse.ok()).toBeTruthy();
  const scheduleResponse = await request.patch(`/api/ledger/jobs/${job.id}/tasks/${job.tasks[0].id}/schedule`, {
    data: { plannedStart: commitmentStart.toISOString(), plannedEnd: commitmentEnd.toISOString(), durationHours: 2 }
  });
  expect(scheduleResponse.ok()).toBeTruthy();

  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await page.getByRole('button', { name: `Open ${title}` }).first().click();
  const workPlan = page.getByTestId('job-workspace').getByTestId('job-task-control');
  await workPlan.getByLabel('Plan start').fill(plannedStart.toISOString().slice(0, 16));
  await workPlan.getByRole('button', { name: 'Preview resource plan' }).click();

  const preview = workPlan.getByTestId('resource-plan-preview');
  await expect(preview.getByText('Existing schedule protected')).toBeVisible();
  await expect(preview.locator('.work-plan-result')).toContainText(worker.name);
  await expect(preview.locator('.work-plan-result')).toContainText('Committed installation');
});

test('resource preview holds material-blocked tasks and shows a partial plan for independent work', async ({ page, request }) => {
  const title = `Browser material recovery plan ${Date.now()}`;
  const plannedStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  plannedStart.setUTCHours(6, 0, 0, 0);
  const plannedEnd = new Date(plannedStart.getTime() + 48 * 60 * 60 * 1000);
  const intakeResponse = await request.post('/api/ledger/intake', { data: {
    title,
    service: 'Installation',
    status: 'planned',
    scheduledStart: plannedStart.toISOString(),
    scheduledEnd: plannedEnd.toISOString(),
    client: { name: 'Material Recovery Client', email: 'material-recovery@example.test', country: 'NL' },
    tasks: [{ title: 'Prepare access area', durationHours: 1, requiredTrade: 'Installer' }],
    assignAutomatically: false
  } });
  expect(intakeResponse.ok()).toBeTruthy();
  const { job } = await intakeResponse.json();
  const materialResponse = await request.post(`/api/ledger/jobs/${job.id}/materials`, {
    data: { name: 'Roof membrane', quantity: 8, unit: 'rolls' }
  });
  expect(materialResponse.ok()).toBeTruthy();
  const { materialRequirement } = await materialResponse.json();
  const blockedResponse = await request.post(`/api/ledger/jobs/${job.id}/tasks`, { data: {
    title: 'Install roof membrane', durationHours: 2, requiredTrade: 'Installer',
    materialRequirementIds: [materialRequirement.id]
  } });
  expect(blockedResponse.ok()).toBeTruthy();
  const { task: blockedTask } = await blockedResponse.json();
  const dependentResponse = await request.post(`/api/ledger/jobs/${job.id}/tasks`, { data: {
    title: 'Inspect roof membrane', durationHours: 1, requiredTrade: 'Installer'
  } });
  expect(dependentResponse.ok()).toBeTruthy();
  const { task: dependentTask } = await dependentResponse.json();
  const dependencyResponse = await request.post(`/api/ledger/jobs/${job.id}/task-dependencies`, { data: {
    predecessorTaskId: blockedTask.id, successorTaskId: dependentTask.id
  } });
  expect(dependencyResponse.ok()).toBeTruthy();
  const workerResponse = await request.post('/api/ledger/workers', {
    data: { name: 'Material plan installer', role: 'Installer', status: 'available' }
  });
  expect(workerResponse.ok()).toBeTruthy();
  const { worker } = await workerResponse.json();
  const assignmentResponse = await request.post(`/api/ledger/jobs/${job.id}/assignments`, { data: {
    workerId: worker.id, role: 'Installer', status: 'planned',
    scheduledStart: plannedStart.toISOString(), scheduledEnd: plannedEnd.toISOString(), allocationHours: 2
  } });
  expect(assignmentResponse.ok()).toBeTruthy();

  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await page.getByRole('button', { name: `Open ${title}` }).first().click();
  const workPlan = page.getByTestId('job-workspace').getByTestId('job-task-control');
  await workPlan.getByLabel('Plan start').fill(plannedStart.toISOString().slice(0, 16));
  await workPlan.getByRole('button', { name: 'Preview resource plan' }).click();

  const preview = workPlan.getByTestId('resource-plan-preview');
  await expect(preview).toContainText('Partial resource plan; material-dependent tasks are held');
  const heldTasks = preview.getByTestId('resource-plan-held-tasks');
  await expect(heldTasks).toContainText('Install roof membrane');
  await expect(heldTasks).toContainText('Inspect roof membrane');
  await expect(heldTasks).toContainText('No verified or dated availability for Roof membrane');
  await expect(preview.locator('.work-plan-result')).toContainText('Prepare access area');
  await expect(preview.locator('.work-plan-result')).not.toContainText('Install roof membrane');
});

test('resource preview captures a sourced route to another assigned job and recalculates', async ({ page, request }) => {
  const pageErrors = [];
  const consoleErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  const title = `Browser route planning ${Date.now()}`;
  const otherTitle = `Browser other route job ${Date.now()}`;
  const plannedStart = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
  plannedStart.setUTCHours(6, 0, 0, 0);
  const plannedEnd = new Date(plannedStart.getTime() + 48 * 60 * 60 * 1000);
  const intake = async (jobTitle, email, address, tasks) => {
    const response = await request.post('/api/ledger/intake', {
      data: {
        title: jobTitle,
        service: 'Installation',
        status: 'planned',
        address,
        city: 'Utrecht',
        scheduledStart: plannedStart.toISOString(),
        scheduledEnd: plannedEnd.toISOString(),
        client: { name: `${jobTitle} Client`, email, country: 'NL' },
        tasks,
        assignAutomatically: false
      }
    });
    expect(response.ok()).toBeTruthy();
    return (await response.json()).job;
  };
  const job = await intake(title, 'route-primary@example.test', 'Main Street 1', [
    { title: 'Install equipment', durationHours: 2, requiredTrade: 'Installer' }
  ]);
  const otherJob = await intake(otherTitle, 'route-other@example.test', 'Industry Road 25', []);
  const workerResponse = await request.post('/api/ledger/workers', {
    data: { name: `Route installer ${Date.now()}`, role: 'Installer', status: 'available' }
  });
  expect(workerResponse.ok()).toBeTruthy();
  const { worker } = await workerResponse.json();
  for (const [assignedJob, start, end] of [
    [job, plannedStart, plannedEnd],
    [otherJob, new Date(plannedStart.getTime() + 4 * 60 * 60 * 1000), new Date(plannedStart.getTime() + 5 * 60 * 60 * 1000)]
  ]) {
    const response = await request.post(`/api/ledger/jobs/${assignedJob.id}/assignments`, {
      data: {
        workerId: worker.id,
        role: 'Installer',
        status: 'planned',
        scheduledStart: start.toISOString(),
        scheduledEnd: end.toISOString(),
        allocationHours: 2
      }
    });
    expect(response.ok()).toBeTruthy();
  }

  await page.goto('/');
  await expect(page).toHaveTitle('Contractor.AI');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await page.getByRole('button', { name: `Open ${title}` }).first().click();
  const workPlan = page.getByTestId('job-workspace').getByTestId('job-task-control');
  await workPlan.getByLabel('Plan start').fill(plannedStart.toISOString().slice(0, 16));
  await workPlan.getByRole('button', { name: 'Preview resource plan' }).click();
  const routeForm = workPlan.getByTestId(`travel-route-${otherJob.id}`);
  await expect(routeForm).toContainText('Record a sourced route');
  await routeForm.scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(os.tmpdir(), 'contractor-ai-route-planner-desktop.png'), fullPage: false });
  await routeForm.getByLabel('Minutes from this site to other job').fill('35');
  await routeForm.getByLabel('Minutes from other job to this site').fill('50');
  await routeForm.getByLabel('Route source or verification note').fill('Map route reviewed before the resource proposal.');
  await routeForm.getByRole('button', { name: 'Save route and recalculate' }).click();

  await expect(workPlan.getByTestId('resource-plan-preview')).toContainText('Proposed allocation under recorded constraints');
  await expect(workPlan.locator('.recorded-travel-routes')).toContainText('35 min there, 50 min back');
  const refreshed = await request.get(`/api/ledger/jobs/${job.id}`);
  expect(refreshed.ok()).toBeTruthy();
  const detail = await refreshed.json();
  expect(detail.job.data.travelRoutes).toHaveLength(1);
  expect(detail.job.data.travelRoutes[0]).toMatchObject({ externalJobId: otherJob.id, minutesToExternal: 35, minutesFromExternal: 50 });

  const savedRoutes = workPlan.locator('.recorded-travel-routes');
  await savedRoutes.locator('summary').click();
  await savedRoutes.getByRole('button', { name: 'Edit route' }).click();
  await savedRoutes.getByLabel('Minutes from this site to other job').fill('40');
  await savedRoutes.getByRole('button', { name: 'Save route and recalculate' }).click();
  await expect(savedRoutes).toContainText('40 min there, 50 min back');
  const revised = await request.get(`/api/ledger/jobs/${job.id}`);
  expect((await revised.json()).job.data.travelRoutes[0]).toMatchObject({ revision: 2, minutesToExternal: 40, minutesFromExternal: 50 });

  await page.setViewportSize({ width: 390, height: 844 });
  if (!await savedRoutes.evaluate(element => element.open)) await savedRoutes.locator('summary').click();
  await savedRoutes.scrollIntoViewIfNeeded();
  const geometry = await savedRoutes.evaluate(element => ({
    pageWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  await page.screenshot({ path: path.join(os.tmpdir(), 'contractor-ai-route-planner-mobile.png'), fullPage: false });
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test('operator assigns a named supervisor to a task from the work-plan form', async ({ page, request }) => {
  const title = `Browser supervision ${Date.now()}`;
  const intakeResponse = await request.post('/api/ledger/intake', {
    data: {
      title,
      status: 'planned',
      client: { name: 'Browser Supervision Client', email: 'browser-supervision@example.test', country: 'NL' },
      tasks: [],
      assignAutomatically: false
    }
  });
  expect(intakeResponse.ok()).toBeTruthy();
  const { job } = await intakeResponse.json();
  const apprenticeResponse = await request.post('/api/ledger/workers', {
    data: { name: `Apprentice ${Date.now()}`, role: 'Apprentice Installer', status: 'available' }
  });
  const supervisorResponse = await request.post('/api/ledger/workers', {
    data: { name: `Lead ${Date.now()}`, role: 'Lead Installer', status: 'available' }
  });
  expect(apprenticeResponse.ok()).toBeTruthy();
  expect(supervisorResponse.ok()).toBeTruthy();
  const apprentice = (await apprenticeResponse.json()).worker;
  const supervisor = (await supervisorResponse.json()).worker;
  for (const [worker, role] of [[apprentice, 'Apprentice Installer'], [supervisor, 'Lead Installer']]) {
    const assignment = await request.post(`/api/ledger/jobs/${job.id}/assignments`, {
      data: { workerId: worker.id, role, status: 'planned' }
    });
    expect(assignment.ok()).toBeTruthy();
  }

  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await page.getByRole('button', { name: `Open ${title}` }).first().click();
  const workPlan = page.getByTestId('job-workspace').getByTestId('job-task-control');
  await workPlan.getByLabel('Task title').fill('Install under supervision');
  await workPlan.getByLabel('Trade group 1').fill('Apprentice Installer');
  await workPlan.getByLabel('Workers per supervisor').fill('1');
  await workPlan.getByLabel('Named supervisors').selectOption(supervisor.id);
  await workPlan.getByRole('button', { name: 'Add task' }).click();

  await expect(workPlan.locator('.work-plan-task').filter({ hasText: 'Install under supervision' }))
    .toContainText(`Supervised by ${supervisor.name} · Lead Installer`);
  const refreshed = await request.get(`/api/ledger/jobs/${job.id}`);
  expect(refreshed.ok()).toBeTruthy();
  const detail = await refreshed.json();
  expect(detail.job.tasks.find(task => task.title === 'Install under supervision').data)
    .toMatchObject({ supervisorWorkerId: supervisor.id, supervisorWorkerIds: [supervisor.id], supervisorTrade: 'Lead Installer',
      supervisionRatio: { workersPerSupervisor: 1, requiredSupervisorCount: 1 } });
});

test('operator plans and retains a qualified mixed-trade crew for one task', async ({ page, request }) => {
  const marker = Date.now();
  const title = `Browser crew sizing ${marker}`;
  const plannedStart = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000);
  plannedStart.setUTCHours(6, 0, 0, 0);
  const scheduledEnd = new Date(plannedStart.getTime() + 48 * 60 * 60 * 1000);
  const intakeResponse = await request.post('/api/ledger/intake', { data: {
    title, status: 'planned', scheduledStart: plannedStart.toISOString(), scheduledEnd: scheduledEnd.toISOString(),
    client: { name: `Crew-size client ${marker}`, country: 'NL' },
    tasks: [{ title: 'Stage roof panels', durationHours: 1, requiredCrewRequirements: [
      { role: 'Installer', count: 1 }, { role: 'Electrician', count: 1 }
    ],
      dueAt: new Date(plannedStart.getTime() + 24 * 60 * 60 * 1000).toISOString() }],
    assignAutomatically: false
  } });
  expect(intakeResponse.ok()).toBeTruthy();
  const { job } = await intakeResponse.json();
  const workers = [];
  for (const [name, role] of [['A', 'Installer'], ['B', 'Electrician']]) {
    const workerResponse = await request.post('/api/ledger/workers', { data: { name: `Crew ${name} ${marker}`, role, status: 'available' } });
    expect(workerResponse.ok()).toBeTruthy();
    const { worker } = await workerResponse.json();
    workers.push(worker);
    const assignment = await request.post(`/api/ledger/jobs/${job.id}/assignments`, { data: {
      workerId: worker.id, role, status: 'planned', scheduledStart: plannedStart.toISOString(), scheduledEnd: scheduledEnd.toISOString()
    } });
    expect(assignment.ok()).toBeTruthy();
  }

  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await page.getByRole('button', { name: `Open ${title}` }).first().click();
  const workPlan = page.getByTestId('job-workspace').getByTestId('job-task-control');
  await workPlan.getByLabel('Task title').fill('Lift and fit roof panels');
  await workPlan.getByLabel('Trade group 1').fill('Installer');
  await workPlan.getByLabel('Workers in group 1').fill('1');
  await workPlan.getByRole('button', { name: 'Add trade group' }).click();
  await workPlan.getByRole('textbox', { name: 'Trade group 2' }).fill('Electrician');
  await workPlan.getByLabel('Workers in group 2').fill('1');
  await workPlan.getByLabel('Due date').fill(new Date(plannedStart.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  await workPlan.getByRole('button', { name: 'Add task' }).click();
  const detailResponse = await request.get(`/api/ledger/jobs/${job.id}`);
  expect(detailResponse.ok()).toBeTruthy();
  const detail = await detailResponse.json();
  expect(detail.job.tasks.find(task => task.title === 'Lift and fit roof panels').data.requiredCrewRequirements)
    .toEqual([{ role: 'Installer', count: 1 }, { role: 'Electrician', count: 1 }]);

  await workPlan.getByLabel('Plan start').fill(plannedStart.toISOString().slice(0, 16));
  await workPlan.getByRole('button', { name: 'Preview resource plan' }).click();
  const preview = workPlan.getByTestId('resource-plan-preview');
  await expect(preview).toContainText(workers[0].name);
  await expect(preview).toContainText(workers[1].name);
  await expect(preview).toContainText('Installer');
  await expect(preview).toContainText('Electrician');
});
