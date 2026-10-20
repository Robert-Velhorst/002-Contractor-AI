const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('named worker reads a mobile work pack, reports a blocker and sees revised instructions', async ({ page, request, context }, testInfo) => {
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const owner = { Authorization: 'Bearer browser-owner-token-at-least-32-characters' };
  const workerId = 'browser-field-task-worker';
  const title = `Mobile work pack ${Date.now()}`;
  const worker = await request.post(`${base}/api/ledger/workers`, { headers: owner, data: { id: workerId, name: 'Browser pack worker', role: 'Carpenter', status: 'available' } });
  expect(worker.ok()).toBeTruthy();
  const otherWorkerId = 'browser-field-task-assignee';
  const otherWorker = await request.post(`${base}/api/ledger/workers`, { headers: owner, data: { id: otherWorkerId, name: 'Other assigned worker', role: 'Carpenter', status: 'available' } });
  expect(otherWorker.ok()).toBeTruthy();
  const intake = await request.post(`${base}/api/ledger/intake`, { headers: owner, data: { title, client: { name: 'Pack client', email: 'office-private@example.test' }, address: 'Werkstraat 10', tasks: [{ title: 'Fit door frame', description: 'Confirm the opening dimensions first', assigneeId: workerId }], assignAutomatically: false } });
  expect(intake.ok()).toBeTruthy();
  const job = (await intake.json()).job;
  const jhaResponse = await request.post(`${base}/api/ledger/jobs/${job.id}/jhas`, { headers: owner, data: {
    title: 'Frame installation task JHA', status: 'approved', riskLevel: 'medium',
    hazards: ['Frame can tip during lifting'], controls: ['Use a two-person lift and secure the frame'],
    workMethod: 'Install from the prepared opening.', ppe: ['Safety footwear'],
    stopWorkTriggers: ['Opening or support condition changes'], linkedTaskIds: [job.tasks[0].id]
  } });
  expect(jhaResponse.ok(), await jhaResponse.text()).toBeTruthy();
  const jha = (await jhaResponse.json()).jha;
  const jhaApproval = await request.post(`${base}/api/ledger/approvals/${jha.approval.id}/resolve`, { headers: owner, data: {
    status: 'approved', reason: 'Task hazards and controls reviewed for field use.'
  } });
  expect(jhaApproval.ok(), await jhaApproval.text()).toBeTruthy();
  const jhaApplicability = await request.patch(`${base}/api/ledger/jobs/${job.id}/tasks/${job.tasks[0].id}/jha-applicability`, { headers: owner, data: {
    status: 'required', reason: 'Manual frame lifting and changing opening conditions need task controls.', entryKey: `mobile-jha-review-${Date.now()}`
  } });
  expect(jhaApplicability.ok(), await jhaApplicability.text()).toBeTruthy();
  const shiftStart = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  shiftStart.setUTCHours(7, 0, 0, 0);
  const shiftEnd = new Date(shiftStart.getTime() + 8 * 60 * 60 * 1000);
  const assignment = await request.post(`${base}/api/ledger/jobs/${job.id}/assignments`, { headers: owner, data: {
    workerId, status: 'assigned', role: 'Carpenter', scheduledStart: shiftStart.toISOString(), scheduledEnd: shiftEnd.toISOString()
  } });
  expect(assignment.ok()).toBeTruthy();
  const huddle = await request.post(`${base}/api/ledger/jobs/${job.id}/daily-cycles`, { headers: owner, data: {
    entryKey: `mobile-huddle-${Date.now()}`, workDate: shiftStart.toISOString().slice(0, 10), shiftLabel: 'day',
    facilitator: 'Site lead', leadWorkerId: workerId, workerIds: [workerId],
    plannedWork: 'Fit the frame after confirming the opening dimensions.',
    productionTarget: 'Install and inspect the assigned frame.', weather: 'Dry',
    siteConditions: 'Keep the shared access route clear.', safetyFocus: 'Use a two-person lift and stop if the opening changes.',
    qualityHoldPoints: ['Check level before final fixing'], constraints: ['Confirm material delivery at arrival'],
    evidenceReference: 'mobile-huddle-evidence'
  } });
  expect(huddle.ok(), await huddle.text()).toBeTruthy();
  const otherAssignment = await request.post(`${base}/api/ledger/jobs/${job.id}/assignments`, { headers: owner, data: { workerId: otherWorkerId, status: 'assigned', role: 'Carpenter' } });
  expect(otherAssignment.ok()).toBeTruthy();
  const supervisedTaskResponse = await request.post(`${base}/api/ledger/jobs/${job.id}/tasks`, { headers: owner, data: {
    title: 'Set out the next frame', assigneeId: otherWorkerId, requiredTrade: 'Carpenter', supervisorWorkerId: workerId
  } });
  expect(supervisedTaskResponse.ok(), await supervisedTaskResponse.text()).toBeTruthy();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.locator('#operator-access-key').fill('browser-field-token-at-least-32-characters');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  const pack = page.getByTestId('field-work-pack');
  await pack.getByRole('button', { name: `Open werkpakket ${title}` }).click();
  await expect(pack.getByRole('heading', { name: title })).toBeVisible();
  const readiness = pack.getByRole('region', { name: 'Gereedheid werkplanning' });
  await expect(readiness).toContainText(/blokkades|waarschuwingen|missing|ready/i);
  await expect(readiness).toContainText('geen toestemming om te starten');
  for (const name of ['Kunnen', 'Weten', 'Hebben', 'Doen']) {
    await pack.getByRole('tab', { name, exact: true }).click();
    await expect(pack.getByRole('tab', { name, exact: true })).toHaveAttribute('aria-selected', 'true');
  }
  await pack.getByRole('tab', { name: 'Weten', exact: true }).click();
  await expect(pack.getByText('Fit the frame after confirming the opening dimensions.')).toBeVisible();
  await expect(pack.getByText('Use a two-person lift and stop if the opening changes.')).toBeVisible();
  const jhaSection = pack.getByRole('heading', { name: 'Goedgekeurde taak-risicoanalyses (JHA)' });
  await expect(jhaSection).toBeVisible();
  await expect(pack.getByText('Fit door frame: Voor deze taak is een taakgebonden JHA vereist.')).toBeVisible();
  await expect(pack.getByRole('heading', { name: 'Frame installation task JHA' })).toBeVisible();
  await expect(pack.getByText('Use a two-person lift and secure the frame')).toBeVisible();
  await expect(pack.getByText('Opening or support condition changes')).toBeVisible();
  const currentPack = (await (await request.get(`${base}/api/ledger/jobs/${job.id}/work-pack?workerId=${workerId}`, { headers: owner })).json()).pack;
  const ownTask = currentPack.do.find(task => !task.supervisingOnly);
  expect(currentPack.do.some(task => task.supervisingOnly && task.title === 'Set out the next frame')).toBe(true);
  await pack.getByRole('tab', { name: 'Doen', exact: true }).click();
  await expect(pack.getByText('Jij bent de aangewezen begeleider van deze taak. Voortgang meldt de toegewezen uitvoerende.')).toBeVisible();
  await expect(pack.getByText('Fit door frame', { exact: true }).first()).toBeVisible();
  const taskOptions = await pack.getByRole('combobox', { name: 'Taak' }).locator('option').allTextContents();
  expect(taskOptions).not.toContain('Set out the next frame');
  const beforeTaskReport = (await (await request.get(`${base}/api/ledger/jobs/${job.id}`, { headers: owner })).json()).job;
  await pack.getByRole('combobox', { name: 'Taak' }).selectOption(ownTask.id);
  await pack.getByRole('combobox', { name: 'Voortgangsstatus' }).selectOption('blocked');
  await pack.getByRole('spinbutton', { name: 'Voortgang (%)' }).fill('35');
  await pack.getByRole('textbox', { name: 'Wat is uitgevoerd of blokkeert deze taak?' }).fill('The delivered frame is missing two required brackets.');
  await pack.getByRole('button', { name: 'Melden aan kantoor' }).click();
  await expect(pack.getByText('Taakmelding verzonden voor beoordeling door kantoor.')).toBeVisible();
  const recovery = await (await request.get(`${base}/api/ledger/jobs/${job.id}/operational-recovery`, { headers: owner })).json();
  const taskBlocker = recovery.sources.find(source => source.type === 'field_progress_blocker');
  expect(taskBlocker.impact.taskId).toBe(ownTask.id);
  expect(taskBlocker.impact.scheduleProjection.affectedTasks.some(task => task.taskId === ownTask.id)).toBe(true);
  const afterTaskReport = (await (await request.get(`${base}/api/ledger/jobs/${job.id}`, { headers: owner })).json()).job;
  expect(afterTaskReport.status).toBe(beforeTaskReport.status);
  expect(afterTaskReport.progressPercent).toBe(beforeTaskReport.progressPercent);
  await pack.scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await pack.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('work-pack-mobile.png') });
  expect((await new AxeBuilder({ page }).include('[data-testid="field-work-pack"]').analyze()).violations).toEqual([]);
  await pack.getByLabel('Ik heb deze versie van het werkpakket gelezen').check();
  await pack.getByRole('button', { name: 'Leesbevestiging vastleggen' }).click();
  await expect(pack.getByText('Deze versie is gelezen.')).toBeVisible();
  await pack.getByLabel('Vraag of blokkade').fill('De sparing wijkt af van de tekening. Welke maat moet ik volgen?');
  await pack.getByRole('button', { name: 'Ter beoordeling aan kantoor' }).click();
  await expect(pack.getByText('Vraag vastgelegd voor beoordeling door kantoor.')).toBeVisible();
  const before = (await (await request.get(`${base}/api/ledger/jobs/${job.id}/work-pack?workerId=${workerId}`, { headers: owner })).json()).pack;
  expect(before.questions).toHaveLength(1);
  expect(before.acknowledgment.current).toBe(true);
  const newTask = await request.post(`${base}/api/ledger/jobs/${job.id}/tasks`, { headers: owner, data: { title: 'Use revised opening dimension', assigneeId: workerId } });
  expect(newTask.ok()).toBeTruthy();
  await pack.getByRole('button', { name: 'Werkpakket vernieuwen' }).click();
  await expect(pack.getByText(/Werkpakket gewijzigd sinds je laatste leesbevestiging/)).toBeVisible();
  await expect(pack.getByRole('button', { name: 'Leesbevestiging vastleggen' })).toBeDisabled();
  await context.setOffline(true);
  await expect(pack.getByText(/Offline. Leesbevestigingen, vragen en taakmeldingen/)).toBeVisible();
  await expect(pack.getByRole('button', { name: 'Ter beoordeling aan kantoor' })).toBeDisabled();
  await context.setOffline(false);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByLabel('Taal', { exact: true }).selectOption('en-GB');
  await pack.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('work-pack-desktop.png') });
  expect((await new AxeBuilder({ page }).include('[data-testid="field-work-pack"]').analyze()).violations).toEqual([]);
  await pack.getByRole('button', { name: 'Open execution' }).click();
  await expect(page.getByTestId('job-workspace').getByRole('heading', { name: title, exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close job workspace' }).click();
  await pack.getByRole('button', { name: 'Capture photo or field update' }).click();
  await expect(page.getByTestId('field-evidence-form').getByRole('combobox', { name: 'Job', exact: true })).toHaveValue(job.id);
  expect(errors).toEqual([]);
});
