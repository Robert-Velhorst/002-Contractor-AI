const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const AxeBuilder = require('@axe-core/playwright').default;

async function financeJob(request) {
  const title = `Deferred finance ${Date.now()}`;
  const response = await request.post('/api/ledger/intake', { data: {
    title, service: 'Retained local work', client: { name: 'Local test client' },
    status: 'in_progress', progressPercent: 50, estimatedCost: 1800, contractValue: 2400,
    assignAutomatically: false,
  } });
  expect(response.ok()).toBe(true);
  return { ...(await response.json()), title };
}

async function openFinance(page, title) {
  await page.goto('/');
  await expect(page).toHaveTitle(/Contractor\.AI/);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.locator('.topbar h1')).toHaveText('Today');
  await page.getByRole('navigation', { name: 'Work areas', exact: true }).getByRole('button', { name: 'Finance', exact: true }).click();
  return page.getByTestId('finance-workspace').locator('.finance-item').filter({ hasText: title })
    .getByRole('button', { name: `Budget baseline for ${title}`, exact: true });
}

test('financial forms load once on demand and preserve responsive input and exact approval-safe values', async ({ page, request }, testInfo) => {
  const job = await financeJob(request);
  const assets = [], writes = [], errors = [];
  page.on('request', request => {
    if (/\/(FinanceActionDialog|ResourceActionDialog)-[^/]+\.js$/.test(new URL(request.url()).pathname)) assets.push(request.url());
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/ledger/')) writes.push(request.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const open = await openFinance(page, job.title);
  expect(assets).toEqual([]);
  await open.click();
  let modal = page.getByTestId('finance-control-modal');
  await expect(modal.getByRole('heading', { name: 'Budget baseline', exact: true })).toBeVisible();
  expect(assets.filter(url => url.includes('/FinanceActionDialog-'))).toHaveLength(1);
  expect(assets.filter(url => url.includes('/ResourceActionDialog-'))).toHaveLength(0);
  await modal.getByRole('button', { name: 'Close finance control', exact: true }).click();
  await open.click();
  await expect(modal).toBeVisible();
  expect(assets.filter(url => url.includes('/FinanceActionDialog-'))).toHaveLength(1);
  await modal.getByLabel('Budget amount (EUR)', { exact: true }).fill('1500.25');
  await modal.getByLabel('Forecast amount (EUR)', { exact: true }).fill('1600.75');
  const text = 'abcdefghij'.repeat(10);
  await modal.getByLabel('Budget description', { exact: true }).fill('');
  const start = await page.evaluate(() => performance.now());
  await modal.getByLabel('Budget description', { exact: true }).pressSequentially(text);
  const entryMs = await page.evaluate(start => performance.now() - start, start);
  await expect(modal.getByLabel('Budget description', { exact: true })).toHaveValue(text);
  await modal.getByLabel('Internal evidence and notes').fill('Retained evidence supports these exact values.');
  expect(writes).toEqual([]);
  expect((await new AxeBuilder({ page }).include('[data-testid="finance-control-modal"]').analyze()).violations).toEqual([]);
  await modal.evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('deferred-finance-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await modal.evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('deferred-finance-mobile.png') });
  const saved = page.waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname === `/api/ledger/jobs/${job.job.id}/budget-lines`);
  await modal.getByRole('button', { name: 'Request approver review', exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.budgetLine).toMatchObject({ budgetAmount: 1500.25, forecastAmount: 1600.75, description: text, status: 'pending_approval' });
  await expect(modal).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(errors).toEqual([]);
  fs.writeFileSync(testInfo.outputPath('dialog-observation.json'), JSON.stringify({
    financeDownloads: 1, unrelatedResourceDownloads: 0, unsavedInputWrites: 0,
    approvalWrites: writes.length, typedCharacters: text.length, typedEntryMs: entryMs,
    budgetAmount: body.budgetLine.budgetAmount, forecastAmount: body.budgetLine.forecastAmount,
  }));
});

test('a delayed financial form can be dismissed and reused without another code download', async ({ page, request }) => {
  const job = await financeJob(request);
  let release, entered = 0;
  const delay = new Promise(resolve => { release = resolve; });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/FinanceActionDialog-*.js', async route => {
    entered += 1;
    await delay;
    await route.continue().catch(() => {});
  });
  try {
    const open = await openFinance(page, job.title);
    await open.click();
    await expect.poll(() => entered).toBe(1);
    const loading = page.getByRole('dialog', { name: 'Budget baseline', exact: true });
    await expect(loading).toHaveAttribute('aria-busy', 'true');
    await loading.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    const nav = page.getByRole('navigation', { name: 'Work areas', exact: true });
    await nav.getByRole('button', { name: 'Today', exact: true }).click();
    await expect(page.locator('.topbar h1')).toHaveText('Today');
    release();
    await nav.getByRole('button', { name: 'Finance', exact: true }).click();
    await open.click();
    await expect(page.getByTestId('finance-control-modal')).toBeVisible();
    expect(entered).toBe(1);
    expect(errors).toEqual([]);
  } finally { release(); }
});

test('a missing financial form does not replace the dashboard or create ledger writes', async ({ page, request }) => {
  const job = await financeJob(request);
  const writes = [];
  page.on('request', request => { if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/ledger/')) writes.push(request.url()); });
  await page.route('**/FinanceActionDialog-*.js', route => route.fulfill({ status: 503, contentType: 'text/plain', body: 'Local simulated code-download failure' }));
  const open = await openFinance(page, job.title);
  await open.click();
  const failed = page.getByRole('dialog', { name: 'Budget baseline', exact: true });
  await expect(failed.getByRole('alert')).toHaveText('The form could not load.');
  await expect(failed).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.route-failure')).toHaveCount(0);
  await failed.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('navigation', { name: 'Work areas', exact: true }).getByRole('button', { name: 'Jobs', exact: true }).click();
  await expect(page.locator('.topbar h1')).toHaveText('Jobs');
  expect(writes).toEqual([]);
});
