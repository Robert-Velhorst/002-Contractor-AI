const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');

test('operator retains and updates one commercially ready client identity', async ({ page, request }) => {
  const sequence = Date.now();
  const company = `Browser Client ${sequence} BV`;
  const email = `client-${sequence}@example.test`;
  const consoleErrors = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.getByRole('heading', { level: 1, exact: true, name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await page.getByRole('tab', { name: /Directory/ }).click();

  const directory = page.getByTestId('client-directory');
  await expect(directory.getByRole('heading', { name: 'Client directory' })).toBeVisible();
  await directory.getByRole('button', { name: 'New client' }).click();

  const editor = page.getByTestId('client-editor-modal');
  await expect(editor.getByRole('heading', { name: 'New client' })).toBeVisible();
  await editor.getByLabel('Contact name').fill('Eva Janssen');
  await editor.getByLabel('Client type').selectOption('business');
  await editor.getByLabel('Legal or company name').fill(company);
  await editor.getByLabel('Contact email').fill(email);
  await editor.getByLabel('Billing email').fill(`billing-${sequence}@example.test`);
  await editor.getByLabel('Phone').fill('+31 20 555 0135');
  await editor.getByLabel('Street address').fill('Weteringschans 125');
  await editor.getByLabel('Postal code').fill('1017 SC');
  await editor.getByLabel('City').fill('Amsterdam');
  await editor.getByLabel('KVK / registration number').fill('87654321');
  await editor.getByLabel('VAT number').fill('NL123456789B01');
  await editor.getByLabel('Internal notes').fill('Primary retained client identity for browser verification.');
  await editor.getByRole('button', { name: 'Retain client' }).click();
  await expect(page.getByText('Client identity retained. No message, project, quote, or invoice was created.')).toBeVisible();

  const row = directory.locator('.client-directory-row').filter({ hasText: company });
  await expect(row).toHaveCount(1);
  await expect(row.getByText('Contact ready', { exact: true })).toBeVisible();
  await expect(row.getByText('Invoice ready', { exact: true })).toBeVisible();
  await expect(row.getByText('Peppol ready', { exact: true })).toBeVisible();
  await expect(row.getByText('No phone retained')).toHaveCount(0);

  await row.getByRole('button', { name: 'Edit client' }).click();
  await expect(editor.getByRole('heading', { name: 'Edit client' })).toBeVisible();
  await editor.getByLabel('Preferred language').selectOption('en');
  await editor.getByLabel('Phone').fill('+31 20 555 0199');
  await editor.getByLabel('Internal notes').fill('Commercial identity reviewed and updated through the client directory.');
  await editor.getByRole('button', { name: 'Update client' }).click();
  await expect(page.getByText('Client identity updated in the ledger. Existing commercial snapshots remain immutable.')).toBeVisible();
  await expect(row.getByText('+31 20 555 0199', { exact: true })).toBeVisible();

  const response = await request.get(`/api/ledger/clients?search=${encodeURIComponent(company)}&limit=10`);
  expect(response.ok()).toBeTruthy();
  const retained = await response.json();
  expect(retained.clients).toHaveLength(1);
  expect(retained.clients[0]).toMatchObject({
    name: 'Eva Janssen',
    company,
    email,
    phone: '+31 20 555 0199',
    preferredLanguage: 'en',
    readiness: {
      contactReady: true,
      invoiceReady: true,
      structuredInvoiceReady: true
    },
    metrics: {
      activeJobs: 0,
      openOpportunities: 0,
      outstandingReceivable: 0
    }
  });
  expect(retained.clients[0].data.notes).toBe('Commercial identity reviewed and updated through the client directory.');
  expect(retained.clients[0].readiness.endpoint).toEqual({ scheme: '0106', id: '87654321', derived: true });

  await directory.getByLabel('Search clients').fill(company);
  await expect(directory.locator('.client-directory-row')).toHaveCount(1);
  await directory.getByLabel('Search clients').fill('definitely-no-client-match');
  await expect(directory.getByText('No matching clients')).toBeVisible();
  await directory.getByLabel('Search clients').fill(company);

  await page.locator('header').getByLabel('Language', { exact: true }).selectOption('nl-NL');
  await expect(page.getByRole('heading', { level: 1, name: 'Klanten', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Klantwerk/ })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Register/ })).toBeVisible();
  await expect(directory.getByRole('heading', { name: 'Klantenregister' })).toBeVisible();
  await expect(directory.getByRole('button', { name: 'Nieuwe klant' })).toBeVisible();
  await expect(directory.getByLabel('Klanten zoeken')).toHaveValue(company);
  await expect(row.getByText(company, { exact: true })).toBeVisible();
  await expect(row.getByText(email, { exact: true })).toBeVisible();
  await expect(row.getByText('+31 20 555 0199', { exact: true })).toBeVisible();
  await expect(row.getByText('Contact gereed', { exact: true })).toBeVisible();
  await expect(row.getByText('Facturatie gereed', { exact: true })).toBeVisible();
  await expect(row.getByText('Peppol gereed', { exact: true })).toBeVisible();
  await directory.getByLabel('Klanten zoeken').fill('');
  await directory.getByRole('button', { name: 'Nieuwe klant' }).click();
  await expect(editor.getByRole('heading', { name: 'Nieuwe klant' })).toBeVisible();
  await editor.getByLabel('Naam contactpersoon').fill('Onvolledige browserklant');
  await expect(editor.getByLabel('Voorkeurstaal')).toBeVisible();
  await editor.getByRole('button', { name: 'Klant vastleggen' }).click();
  await expect(page.getByText('Klantidentiteit vastgelegd. Er is geen bericht, project, offerte of factuur aangemaakt.')).toBeVisible();
  const incompleteRow = directory.locator('.client-directory-row').filter({ hasText: 'Onvolledige browserklant' });
  await expect(incompleteRow.getByText('Contact onvolledig', { exact: true })).toBeVisible();
  await expect(incompleteRow.getByText('Facturatie onvolledig', { exact: true })).toBeVisible();
  await expect(incompleteRow.getByText('Peppol onvolledig', { exact: true })).toBeVisible();
  await expect(incompleteRow.getByText('Ontbreekt: Straatadres koper, Plaats koper, Postcode koper +1', { exact: true })).toBeVisible();
  await directory.getByLabel('Klanten zoeken').fill(company);
  await page.locator('header').getByLabel('Taal', { exact: true }).selectOption('en-GB');
  await expect(directory.getByRole('heading', { name: 'Client directory' })).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  const geometry = await directory.evaluate(element => ({
    pageWidth: document.body.scrollWidth,
    viewportWidth: window.innerWidth,
    scrollWidth: element.scrollWidth,
    clientWidth: element.clientWidth
  }));
  expect(geometry.pageWidth).toBeLessThanOrEqual(geometry.viewportWidth);
  expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);
  expect(consoleErrors).toEqual([]);
});

test('a loaded 500-client directory keeps typing and pagination bounded without commands', async ({ page }, testInfo) => {
  const query = 'shared retained client directory registration';
  const clients = Array.from({ length: 500 }, (_, index) => ({
    id: `bounded-client-${index + 1}`, name: `${query} ${String(index + 1).padStart(3, '0')}`,
    email: `client-${index + 1}@example.test`, phone: '+31 20 555 0199',
    address: 'Synthetic client street 125', city: 'Arnhem', country: 'NL',
    data: { billingEmail: 'billing@example.test', registrationNumber: String(10000000 + index) },
    readiness: { contactReady: true, invoiceReady: true, structuredInvoiceReady: true },
    metrics: { activeJobs: 3, openOpportunities: 0, acceptedContractValue: 0, outstandingReceivable: 0 },
    latestJobs: [],
  }));
  const errors = [], writes = [], preferenceWrites = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  page.on('request', request => {
    const pathname = new URL(request.url()).pathname;
    if (pathname.startsWith('/api/') && !['GET', 'HEAD'].includes(request.method())) {
      if (pathname === '/api/preferences') preferenceWrites.push({ method: request.method(), body: request.postDataJSON() });
      else writes.push(request.url());
    }
  });
  // This read-only fixture exercises the real built UI without adding QA clients to any ledger.
  await page.route('**/api/ledger/clients?*', async route => {
    if (route.request().method() !== 'GET') return route.fallback();
    const response = await route.fetch();
    expect(response.ok()).toBe(true);
    await route.fulfill({ response, json: { ...(await response.json()), clients,
      summary: { total: clients.length, contactReady: clients.length, invoiceReady: clients.length,
        structuredInvoiceReady: clients.length, activeJobs: 1500, outstandingReceivable: 0 } } });
  });
  await page.addInitScript(() => {
    window.__directoryWork = { billingReads: 0, metricReads: 0 };
    const fetchOriginal = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await fetchOriginal(...args);
      if (new URL(response.url).pathname === '/api/ledger/clients' && response.ok) {
        const jsonOriginal = response.json.bind(response);
        response.json = async () => {
          const value = await jsonOriginal();
          for (const client of value.clients || []) {
            const billingEmail = client.data.billingEmail, activeJobs = client.metrics.activeJobs;
            Object.defineProperty(client.data, 'billingEmail', { enumerable: true,
              get() { window.__directoryWork.billingReads++; return billingEmail; } });
            Object.defineProperty(client.metrics, 'activeJobs', { enumerable: true,
              get() { window.__directoryWork.metricReads++; return activeJobs; } });
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
  await page.getByRole('button', { name: 'Clients', exact: true }).click();
  await page.getByRole('tab', { name: /^Directory/ }).click();
  const directory = page.getByTestId('client-directory');
  await expect(directory.getByRole('article')).toHaveCount(25);
  await expect(directory.getByText('Showing 1-25 of 500', { exact: true })).toBeVisible();
  const before = await page.evaluate(() => ({ ...window.__directoryWork }));
  const preferencesBeforeTyping = preferenceWrites.length;
  const search = directory.getByLabel('Search clients');
  await search.pressSequentially(query);
  await expect(search).toHaveValue(query);
  await expect(directory.getByRole('article')).toHaveCount(25);
  const after = await page.evaluate(() => ({ ...window.__directoryWork }));
  expect(after.billingReads - before.billingReads).toBe(500);
  expect(after.metricReads).toBe(before.metricReads);
  expect(writes).toEqual([]);
  expect(preferenceWrites).toHaveLength(preferencesBeforeTyping);
  const pagination = directory.getByRole('navigation', { name: 'List pages' });
  await pagination.getByRole('button', { name: 'Next' }).click();
  await expect(pagination.getByText('Showing 26-50 of 500', { exact: true })).toBeVisible();
  await expect(directory.getByTestId('client-directory-bounded-client-26')).toBeVisible();
  await pagination.getByLabel('Rows per page').selectOption('50');
  await expect(directory.getByRole('article')).toHaveCount(50);
  await search.fill('10000499');
  await expect(directory.getByRole('article')).toHaveCount(1);
  await expect(directory.getByTestId('client-directory-bounded-client-500')).toBeVisible();
  await directory.getByRole('button', { name: 'Edit client', exact: true }).click();
  const editor = page.getByTestId('client-editor-modal');
  await expect(editor.getByLabel('Contact name')).toHaveValue(clients[499].name);
  await expect(editor.getByLabel('KVK / registration number')).toHaveValue('10000499');
  await editor.getByRole('button', { name: 'Close client editor', exact: true }).click();
  await expect(editor).toHaveCount(0);
  await search.fill('');
  await pagination.getByLabel('Rows per page').selectOption('25');
  await page.locator('header').getByLabel('Language', { exact: true }).selectOption('nl-NL');
  await expect(directory.getByRole('heading', { name: 'Klantenregister' })).toBeVisible();
  await expect(directory.getByRole('navigation', { name: "Lijstpagina's" })).toBeVisible();
  await directory.getByRole('button', { name: 'Volgende', exact: true }).click();
  await expect(directory.getByText('Weergave 26-50 van 500', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.client-directory').analyze()).violations).toEqual([]);
  await directory.locator('.panel-heading').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('client-directory-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.side-nav')).toHaveCSS('visibility', 'hidden');
  await directory.locator('.panel-heading').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('client-directory-mobile-top.png') });
  await directory.getByRole('navigation').scrollIntoViewIfNeeded();
  await expect(directory.getByRole('button', { name: 'Vorige', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(await directory.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.client-directory').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('client-directory-mobile.png') });
  await directory.getByRole('button', { name: 'Vorige', exact: true }).click();
  await expect(directory.getByText('Weergave 1-25 van 500', { exact: true })).toBeVisible();
  await directory.getByLabel('Klanten zoeken').fill('not-a-retained-client');
  await expect(directory.getByText('Geen overeenkomende klanten', { exact: true })).toBeVisible();
  await expect(directory.getByRole('article')).toHaveCount(0);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  expect(preferenceWrites).toContainEqual({ method: 'PATCH', body: { locale: 'nl-NL' } });
  for (const preference of preferenceWrites) {
    expect(preference.method).toBe('PATCH');
    expect(Object.keys(preference.body)).toEqual(['locale']);
    expect(['en-GB', 'nl-NL']).toContain(preference.body.locale);
  }
  fs.writeFileSync(testInfo.outputPath('client-directory-typing.json'), JSON.stringify({
    clients: clients.length, initialRows: 25, typedCharacters: query.length, before, after,
    registrationReached: '10000499', commandWrites: writes.length, preferenceWrites,
  }, null, 2));
});
