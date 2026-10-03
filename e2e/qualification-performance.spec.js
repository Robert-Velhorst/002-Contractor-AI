const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');

test('500 loaded qualification records stay bounded while typing and preserve the last worker identity', async ({ page }, testInfo) => {
  const query = 'retained shared workforce qualification record';
  const rows = Array.from({ length: 500 }, (_, index) => ({
    worker: { id: `bounded-worker-${index + 1}`, name: `Qualified worker ${String(index + 1).padStart(3, '0')}`, role: 'Installer', status: 'available', activeAssignmentCount: 0 },
    qualification: { status: 'current', approved: true, credentials: [{ id: `bounded-proof-${index + 1}`, title: 'VCA Basic', issuer: 'Synthetic qualification source', credentialNumber: `${query} ${index + 1}`, status: 'approved', expiresOn: '2035-01-01' }] },
  }));
  const errors = [], writes = [], preferences = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (!pathname.startsWith('/api/') || ['GET', 'HEAD'].includes(request.method())) return;
    if (pathname === '/api/preferences') preferences.push({ method: request.method(), body: request.postDataJSON() });
    else writes.push(pathname);
  });
  // Intercept only the read response, never persist synthetic workers or credentials.
  await page.route('**/api/ledger/qualifications', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    const value = await response.json();
    await route.fulfill({ response, json: { ...value, qualificationRegister: {
      ...value.qualificationRegister, workers: rows, requirements: [], jobs: [],
      summary: { workersWithApprovedCredentials: rows.length, pendingCredentials: 0, expiringCredentials: 0, expiredCredentials: 0, blockedAssignments: 0 },
    } } });
  });
  await page.addInitScript(() => {
    window.__qualificationWork = { searchReads: 0, approvedReads: 0 };
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (new URL(response.url).pathname === '/api/ledger/qualifications' && response.ok) {
        const originalJson = response.json.bind(response);
        response.json = async () => {
          const value = await originalJson();
          for (const row of value.qualificationRegister.workers) {
            const approved = row.qualification.approved;
            Object.defineProperty(row.qualification, 'approved', { enumerable: true,
              get() { window.__qualificationWork.approvedReads++; return approved; } });
            for (const credential of row.qualification.credentials) {
              const number = credential.credentialNumber;
              Object.defineProperty(credential, 'credentialNumber', { enumerable: true,
                get() { window.__qualificationWork.searchReads++; return number; } });
            }
          }
          return value;
        };
      }
      return response;
    };
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page).toHaveTitle(/Contractor\.AI/);
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await page.getByRole('button', { name: 'Resources', exact: true }).click();
  await expect(page.getByText('Loading resources', { exact: true })).toBeHidden();
  await page.getByRole('tab', { name: 'Qualifications', exact: true }).click();
  const workspace = page.getByTestId('qualification-workspace');
  const list = workspace.locator('.qualification-worker-list');
  await expect(list.getByRole('article')).toHaveCount(25);
  await expect(list.getByText('Showing 1-25 of 500', { exact: true })).toBeVisible();
  const search = workspace.getByRole('searchbox', { name: 'Search workforce qualifications' });
  const before = await page.evaluate(() => ({ ...window.__qualificationWork }));
  const preferencesBefore = preferences.length;
  await search.pressSequentially(query);
  await expect(search).toHaveValue(query);
  await expect(list.getByRole('article')).toHaveCount(25);
  const after = await page.evaluate(() => ({ ...window.__qualificationWork }));
  expect(after.searchReads - before.searchReads).toBe(500);
  expect(after.approvedReads).toBe(before.approvedReads);
  expect(preferences).toHaveLength(preferencesBefore);
  expect(writes).toEqual([]);
  const pagination = list.getByRole('navigation', { name: 'List pages' });
  await pagination.getByRole('button', { name: 'Next' }).click();
  await expect(list.getByText('Qualified worker 026', { exact: true })).toBeVisible();
  await pagination.getByLabel('Rows per page').selectOption('50');
  await expect(list.getByRole('article')).toHaveCount(50);
  await search.fill(`${query} 500`);
  await expect(list.getByRole('article')).toHaveCount(1);
  await expect(list.getByText('Qualified worker 500', { exact: true })).toBeVisible();
  await list.getByRole('button', { name: 'Add revision', exact: true }).click();
  const editor = page.getByTestId('credential-editor');
  await expect(editor.getByRole('heading', { name: 'Add credential for Qualified worker 500' })).toBeVisible();
  await editor.getByRole('button', { name: 'Close credential editor' }).click();
  await expect(editor).toHaveCount(0);
  await search.fill('');
  await pagination.getByLabel('Rows per page').selectOption('25');
  await page.locator('header').getByLabel('Language', { exact: true }).selectOption('nl-NL');
  await expect(workspace.getByRole('heading', { name: 'Kwalificaties medewerkers' })).toBeVisible();
  await list.getByRole('button', { name: 'Volgende', exact: true }).click();
  await expect(list.getByText('Weergave 26-50 van 500', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.qualification-workspace').analyze()).violations).toEqual([]);
  await workspace.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('qualifications-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.side-nav')).toHaveCSS('visibility', 'hidden');
  await workspace.locator('.qualification-toolbar').scrollIntoViewIfNeeded();
  expect(await workspace.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.qualification-workspace').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('qualifications-mobile-top.png') });
  await list.getByRole('navigation').scrollIntoViewIfNeeded();
  await expect(list.getByRole('button', { name: 'Vorige', exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('qualifications-mobile-pages.png') });
  await list.getByRole('button', { name: 'Vorige', exact: true }).click();
  await expect(list.getByText('Weergave 1-25 van 500', { exact: true })).toBeVisible();
  await workspace.getByRole('searchbox', { name: 'Kwalificaties van medewerkers doorzoeken' }).fill('not-a-retained-credential');
  await expect(list.getByRole('article')).toHaveCount(0);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  expect(preferences).toContainEqual({ method: 'PATCH', body: { locale: 'nl-NL' } });
  for (const preference of preferences) {
    expect(preference.method).toBe('PATCH');
    expect(Object.keys(preference.body)).toEqual(['locale']);
    expect(['en-GB', 'nl-NL']).toContain(preference.body.locale);
  }
  fs.writeFileSync(testInfo.outputPath('qualification-typing.json'), JSON.stringify({
    records: rows.length, initialRows: 25, typedCharacters: query.length, before, after,
    lastWorkerReached: rows[499].worker.id, commandWrites: writes.length, preferences,
  }, null, 2));
});
