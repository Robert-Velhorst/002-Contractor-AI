const { test, expect, request: playwrightRequest } = require('@playwright/test');

async function createJob(api, title) {
  const response = await api.post('/api/ledger/intake', {
    data: {
      title,
      service: 'General contracting',
      status: 'planned',
      client: { name: 'Browser closeout client' },
      assignAutomatically: false
    }
  });
  expect(response.ok()).toBeTruthy();
  return response.json();
}

async function openJob(page, title, baseURL) {
  await page.goto(`${baseURL}/`);
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.getByRole('heading', { level: 1, exact: true, name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: `Open ${title}` }).first().click();
  const workspace = page.getByTestId('job-workspace');
  await expect(workspace.getByRole('heading', { name: title })).toBeVisible();
  return workspace;
}

test('closeout register syncs an offline punch and connects warranty and aftercare lifecycle', async ({ page, context }) => {
  const baseURL = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const api = await playwrightRequest.newContext({
    baseURL,
    extraHTTPHeaders: { Authorization: 'Bearer browser-owner-token-at-least-32-characters' }
  });
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const title = `Browser closeout ${Date.now()}`;
  const intake = await createJob(api, title);
  await page.goto(baseURL);
  await page.locator('#operator-access-key').fill('browser-owner-token-at-least-32-characters');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible();
  const workspace = await openJob(page, title, baseURL);
  await workspace.getByRole('tab', { name: 'Quality & safety' }).click();
  const register = workspace.getByTestId('closeout-register');
  await expect(register.locator('h3')).toBeVisible();

  await register.getByTestId('closeout-create-record').click();
  const punchForm = register.getByTestId('closeout-punch_item-form');
  await punchForm.locator('select').first().selectOption('high');
  await punchForm.locator('input[type="date"]').fill(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
  await punchForm.locator('input:not([type])').nth(0).fill('Door frame finish requires correction');
  await punchForm.locator('input:not([type])').nth(1).fill('Browser finishing supervisor');
  await punchForm.locator('input:not([type])').nth(2).fill('Level 2 room 2.14');
  await punchForm.locator('textarea').first().fill('Paint edge is incomplete at the retained frame location.');

  await context.setOffline(true);
  const submitPunch = punchForm.locator('button').first();
  await expect(submitPunch).toBeEnabled();
  await submitPunch.click();
  await expect.poll(() => page.evaluate(() => new Promise(resolve => {
    const open = indexedDB.open('contractor-ai-field-outbox', 2);
    open.onerror = () => resolve(-1);
    open.onsuccess = () => {
      const request = open.result.transaction('operation-drafts').objectStore('operation-drafts').getAll();
      request.onsuccess = () => resolve(request.result.filter(draft => draft.payload?.title === 'Door frame finish requires correction').length);
      request.onerror = () => resolve(-1);
    };
  }))).toBe(1);
  await context.setOffline(false);

  await expect.poll(async () => {
    const response = await api.get(`/api/ledger/jobs/${intake.job.id}`);
    if (!response.ok()) return null;
    const detail = (await response.json()).job;
    return detail.punchItems.filter(record => record.title === 'Door frame finish requires correction').length;
  }).toBe(1);
  await expect(register.getByText('Door frame finish requires correction')).toBeVisible();

  const punch = (await (await api.get(`/api/ledger/jobs/${intake.job.id}`)).json()).job.punchItems.find(record => record.title === 'Door frame finish requires correction');
  await register.getByTestId(`closeout-${punch.id}`).getByTestId('closeout-lifecycle-action').click();
  const lifecycle = page.getByTestId('client-lifecycle-modal');
  await lifecycle.getByLabel('Evidence and outcome').fill('Finish corrected, inspected in daylight, and retained against the room record.');
  const lifecycleResponsePromise = page.waitForResponse(response => response.url().includes(`/lifecycle/punch_item/${punch.id}`));
  await lifecycle.getByTestId('client-lifecycle-submit').click();
  const lifecycleResponse = await lifecycleResponsePromise;
  expect(lifecycleResponse.status(), await lifecycleResponse.text()).toBe(200);
  expect((await lifecycleResponse.json()).approvalRequired).toBe(true);

  const punchDetailResponse = await api.get(`/api/ledger/jobs/${intake.job.id}`);
  expect(punchDetailResponse.ok()).toBeTruthy();
  const punchDetail = (await punchDetailResponse.json()).job;
  const retainedPunch = punchDetail.punchItems.find(record => record.title === 'Door frame finish requires correction');
  expect(retainedPunch.status).toBe('pending_approval');

  await register.getByRole('tab').nth(1).click();
  await register.getByTestId('closeout-create-record').click();
  const warrantyForm = register.getByTestId('closeout-warranty_claim-form');
  await warrantyForm.locator('select').nth(0).selectOption('workmanship');
  await warrantyForm.locator('select').nth(1).selectOption('medium');
  await warrantyForm.locator('input:not([type])').first().fill('Cabinet hinge alignment report');
  await warrantyForm.locator('textarea').first().fill('Client reported that the retained cabinet door does not close evenly.');
  await warrantyForm.locator('button').first().click();
  await expect(register.getByText('Cabinet hinge alignment report')).toBeVisible();

  await register.getByRole('tab').nth(2).click();
  await register.getByTestId('closeout-create-record').click();
  const aftercareForm = register.getByTestId('closeout-aftercare-form');
  await aftercareForm.locator('select').nth(0).selectOption('client_follow_up');
  await aftercareForm.locator('select').nth(1).selectOption('phone');
  await aftercareForm.locator('input:not([type])').nth(0).fill('Seven-day installation check');
  await aftercareForm.locator('input:not([type])').nth(1).fill('Browser office operator');
  await aftercareForm.locator('textarea').first().fill('Confirm operation and retain any reported issue without promising work.');
  await aftercareForm.locator('button').first().click();
  await expect(register.getByText('Seven-day installation check')).toBeVisible();

  const aftercareId = (await (await api.get(`/api/ledger/jobs/${intake.job.id}`)).json()).job.aftercare.find(record => record.title === 'Seven-day installation check').id;
  await register.getByTestId(`closeout-${aftercareId}`).getByTestId('closeout-lifecycle-action').click();
  await lifecycle.getByLabel('Evidence and outcome').fill('Client confirmed normal operation; no new issue or commitment was recorded.');
  const aftercareResponsePromise = page.waitForResponse(response => response.url().includes(`/lifecycle/aftercare/${aftercareId}`));
  await lifecycle.getByTestId('client-lifecycle-submit').click();
  const aftercareResponse = await aftercareResponsePromise;
  expect(aftercareResponse.status(), await aftercareResponse.text()).toBe(200);
  expect((await aftercareResponse.json()).approvalRequired).toBe(false);
  await expect.poll(async () => {
    const response = await api.get(`/api/ledger/jobs/${intake.job.id}`);
    return (await response.json()).job.aftercare.find(record => record.id === aftercareId)?.status;
  }).toBe('completed');

  const finalDetailResponse = await api.get(`/api/ledger/jobs/${intake.job.id}`);
  const finalDetail = (await finalDetailResponse.json()).job;
  expect(finalDetail.punchItems.filter(record => record.title === 'Door frame finish requires correction')).toHaveLength(1);
  expect(finalDetail.warrantyClaims.filter(record => record.title === 'Cabinet hinge alignment report')).toHaveLength(1);
  expect(finalDetail.aftercare.find(record => record.title === 'Seven-day installation check').status).toBe('completed');

  await page.locator('header').getByLabel('Language', { exact: true }).selectOption('nl-NL');
  await expect(register.getByRole('heading', { name: 'Oplevering en nazorg' })).toBeVisible();
  const records = register.locator('.closeout-records');
  await expect(records.getByText('Seven-day installation check')).toBeVisible();
  await expect(records.getByText('Client confirmed normal operation; no new issue or commitment was recorded.')).toBeVisible();
  await register.getByTestId('closeout-tab-warranty_claim').click();
  await expect(records.getByText('Cabinet hinge alignment report')).toBeVisible();
  await expect(records.getByText('Client reported that the retained cabinet door does not close evenly.')).toBeVisible();
  await register.getByTestId('closeout-tab-punch_item').click();
  await expect(records.getByText('Door frame finish requires correction')).toBeVisible();
  await expect(records.getByText('Paint edge is incomplete at the retained frame location.')).toBeVisible();
  await page.locator('header').getByLabel('Taal', { exact: true }).selectOption('en-GB');

  await page.setViewportSize({ width: 390, height: 844 });
  const geometry = await register.evaluate(element => ({
    pageWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  expect(consoleErrors).toEqual([]);
  await api.dispose();
});
