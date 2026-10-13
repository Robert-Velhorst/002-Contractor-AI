const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const AxeBuilder = require('@axe-core/playwright').default;

async function resources(page) {
  await page.goto('/');
  await expect(page).toHaveTitle(/Contractor\.AI/);
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.locator('.topbar h1')).toHaveText('Today');
  const nav = page.getByRole('navigation', { name: 'Work areas', exact: true });
  await nav.getByRole('button', { name: 'Resources', exact: true }).click();
  await expect(page.getByText('Loading resources', { exact: true })).toBeHidden();
  await page.getByRole('tab', { name: 'Workforce', exact: true }).click();
  await page.getByRole('tab', { name: 'Crew directory', exact: true }).click();
  return page.getByRole('button', { name: 'Add crew member', exact: true });
}

test('operator action forms stay absent until requested and reuse one module with exact real crew input', async ({ page }, testInfo) => {
  const assets = [], writes = [], errors = [];
  page.on('request', request => {
    if (/\/OperatorActionDialogs-[^/]+\.js$/.test(new URL(request.url()).pathname)) assets.push(request.url());
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/ledger/')) writes.push(request.url());
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  const open = await resources(page);
  expect(assets).toEqual([]);
  await open.click();
  const modal = page.getByTestId('worker-editor');
  await expect(modal).toBeVisible();
  expect(assets).toHaveLength(1);
  await modal.getByRole('button', { name: 'Close crew member editor', exact: true }).click();
  await open.click();
  await expect(modal).toBeVisible();
  expect(assets).toHaveLength(1);
  const name = `Retained on-demand worker ${Date.now()}`;
  const start = await page.evaluate(() => performance.now());
  await modal.getByLabel('Full name', { exact: true }).pressSequentially(name);
  const typingMs = await page.evaluate(start => performance.now() - start, start);
  await modal.getByLabel('Role or trade', { exact: true }).fill('Installer');
  await modal.getByLabel('Hourly cost rate (EUR)', { exact: true }).fill('42.50');
  expect(writes).toEqual([]);
  expect((await new AxeBuilder({ page }).include('[data-testid="worker-editor"]').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('deferred-crew-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await modal.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  await modal.evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('deferred-crew-mobile.png') });
  const saved = page.waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname === '/api/ledger/workers');
  await modal.getByRole('button', { name: 'Save retained crew member', exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.worker).toMatchObject({ name, role: 'Installer', hourlyRate: 42.5, status: 'available' });
  await expect(modal).toHaveCount(0);
  expect(writes).toHaveLength(1);
  expect(errors).toEqual([]);
  fs.writeFileSync(testInfo.outputPath('operator-dialog-observation.json'), JSON.stringify({ downloads: assets.length,
    unsavedInputWrites: 0, retainedWrites: writes.length, typedCharacters: name.length, typingMs,
    workerHourlyRate: body.worker.hourlyRate }));
});

test('an unfinished operator form download can close without replacing the dashboard or repeating the download', async ({ page }) => {
  let release, entered = 0;
  const delay = new Promise(resolve => { release = resolve; });
  await page.route('**/OperatorActionDialogs-*.js', async route => {
    entered += 1;
    await delay;
    await route.continue().catch(() => {});
  });
  try {
    const open = await resources(page);
    await open.click();
    await expect.poll(() => entered).toBe(1);
    const loading = page.getByRole('dialog', { name: 'Add crew member', exact: true });
    await expect(loading).toHaveAttribute('aria-busy', 'true');
    await loading.getByRole('button', { name: 'Close', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    release();
    await open.click();
    await expect(page.getByTestId('worker-editor')).toBeVisible();
    expect(entered).toBe(1);
    await expect(page.locator('.route-failure')).toHaveCount(0);
  } finally { release(); }
});

test('a missing operator form stays inside its error boundary and creates no ledger write', async ({ page }) => {
  const writes = [];
  page.on('request', request => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/ledger/')) writes.push(request.url());
  });
  await page.route('**/OperatorActionDialogs-*.js', route => route.fulfill({ status: 503,
    contentType: 'text/plain', body: 'Local simulated action-form download failure' }));
  const open = await resources(page);
  await open.click();
  const failed = page.getByRole('dialog', { name: 'Add crew member', exact: true });
  await expect(failed.getByRole('alert')).toHaveText('The form could not load.');
  await expect(failed).toHaveAttribute('aria-busy', 'false');
  await expect(page.locator('.route-failure')).toHaveCount(0);
  await failed.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes).toEqual([]);
});
