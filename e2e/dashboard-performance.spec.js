const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const AxeBuilder = require('@axe-core/playwright').default;

test('opportunity entry loads only on demand, keeps typing local and retains the current ledger payload', async ({ page, request }, testInfo) => {
  const errors = [], catalogs = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  page.on('request', request => {
    if (/\/api\/ledger\/(material-stock|qualifications)\/catalog(?:\?|$)/.test(request.url())) catalogs.push(request.url());
  });
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.getByTestId('contractor-workbench').locator('.workbench-counts')).toBeVisible();
  const resources = () => page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
  expect((await resources()).some(url => /\/OpportunityEditor-[^/]+\.js$/.test(url))).toBe(false);
  expect(catalogs).toEqual([]);
  await page.getByRole('button', { name: 'New opportunity', exact: true }).first().click();
  const editor = page.getByTestId('opportunity-modal');
  await expect(editor).toBeVisible();
  await expect.poll(() => catalogs.length).toBe(2);
  expect((await resources()).some(url => /\/OpportunityEditor-[^/]+\.js$/.test(url))).toBe(true);
  await editor.getByLabel('Client name', { exact: true }).fill('Local performance fixture');
  const title = `Local input ${Date.now()} ${'abcdefghij'.repeat(10)}`;
  await editor.getByLabel('Opportunity title', { exact: true }).pressSequentially(title);
  await editor.getByLabel('Estimated value', { exact: true }).fill('1234.50');
  await editor.getByLabel('Scope and qualification notes', { exact: true }).fill('Keep all current source fields');
  await editor.getByLabel('City', { exact: true }).fill('Arnhem');
  await expect(editor.getByLabel('Opportunity title', { exact: true })).toHaveValue(title);
  expect(catalogs).toHaveLength(2);
  await editor.locator('.opportunity-form-grid').evaluate(element => { element.scrollTop = 0; });
  await page.screenshot({ path: testInfo.outputPath('isolated-opportunity-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.side-nav')).toHaveCSS('visibility', 'hidden');
  await editor.locator('.opportunity-form-grid').evaluate(element => { element.scrollTop = 0; });
  expect(await editor.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('isolated-opportunity-mobile.png') });
  const saved = page.waitForResponse(response => new URL(response.url()).pathname === '/api/ledger/opportunities' && response.request().method() === 'POST');
  await editor.getByRole('button', { name: 'Retain opportunity', exact: true }).click();
  const response = await saved;
  expect(response.ok()).toBe(true);
  const { opportunity } = await response.json();
  expect(opportunity).toMatchObject({ title, estimatedValue: 1234.5, city: 'Arnhem', description: 'Keep all current source fields' });
  await expect(editor).toHaveCount(0);
  const retained = await request.get(`/api/ledger/opportunities/${encodeURIComponent(opportunity.id)}`);
  expect(retained.ok()).toBe(true);
  expect((await retained.json()).opportunity.client.name).toBe('Local performance fixture');
  expect(errors).toEqual([]);
});

test('a pending opportunity editor download stays cancellable without blocking the dashboard', async ({ page }) => {
  let release, entered = false;
  const delay = new Promise(resolve => { release = resolve; });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/OpportunityEditor-*.js', async route => { entered = true; await delay; await route.continue().catch(() => {}); });
  try {
    await page.goto('/');
    await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
    await page.getByRole('button', { name: 'New opportunity', exact: true }).first().click();
    await expect.poll(() => entered).toBe(true);
    await expect(page.getByRole('dialog', { name: 'Loading opportunity editor', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Close opportunity', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('navigation', { name: 'Work areas', exact: true }).getByRole('button', { name: 'Jobs', exact: true }).click();
    await expect(page.locator('.topbar h1')).toHaveText('Jobs');
    release();
    await page.getByRole('button', { name: 'New opportunity', exact: true }).first().click();
    await expect(page.getByTestId('opportunity-modal')).toBeVisible();
    await expect(page.getByTestId('opportunity-modal').getByLabel('Opportunity title', { exact: true })).toHaveValue('');
    expect(errors).toEqual([]);
  } finally { release(); }
});

test('today loads only the independent inbox and preserves its desktop and phone layout', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/ledger/client-conversations/inbox?*', async route => {
    const response = await route.fetch();
    await route.fulfill({ response, json: {
    unreadCount: 1, truncated: false, messages: [{ messageId: 'local-inbox-fixture', jobId: 'local-job', accessId: 'local-access',
      clientName: 'Klantnaam', jobTitle: 'Nieuw bericht over deurmontage', createdAt: '2026-10-02T08:00:00Z' }],
    } });
  });
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  const inbox = page.getByRole('region', { name: 'New client messages', exact: true });
  await expect(inbox.getByRole('button', { name: /Klantnaam/ })).toBeVisible();
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
  expect(resources.some(url => /\/ClientConversationInbox-[^/]+\.js$/.test(url))).toBe(true);
  expect(resources.some(url => /\/(Conversation|ConversationPhoto|conversation-request)-[^/]+\.js$/.test(url))).toBe(false);
  await expect(inbox.locator('.client-inbox-row')).toHaveCSS('padding-left', '18px');
  await inbox.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('independent-inbox-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.side-nav')).toHaveCSS('visibility', 'hidden');
  await expect(inbox.locator('.client-inbox-row')).toHaveCSS('padding-left', '14px');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('independent-inbox-mobile.png') });
  expect(errors).toEqual([]);
});

test('leaving today aborts the inbox read and returning fetches a fresh inbox', async ({ page }) => {
  const errors = [], aborted = [];
  page.on('pageerror', error => errors.push(error.message));
  const isInbox = url => new URL(url).pathname === '/api/ledger/client-conversations/inbox';
  let release, entered = false, hold = true;
  const delay = new Promise(resolve => { release = resolve; });
  await page.route('**/api/ledger/client-conversations/inbox?*', async route => {
    if (hold) { entered = true; await delay; }
    await route.continue().catch(() => {});
  });
  page.on('requestfailed', request => { if (isInbox(request.url())) aborted.push(request.failure()?.errorText); });
  try {
    await page.goto('/');
    await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
    await expect.poll(() => entered).toBe(true);
    const nav = page.getByRole('navigation', { name: 'Work areas', exact: true });
    await nav.getByRole('button', { name: 'Jobs', exact: true }).click();
    await expect(page.locator('.topbar h1')).toHaveText('Jobs');
    await expect.poll(() => aborted.length).toBe(1);
    hold = false; release();
    const fresh = page.waitForResponse(response => isInbox(response.url()) && response.request().method() === 'GET');
    await nav.getByRole('button', { name: 'Today', exact: true }).click();
    expect((await fresh).ok()).toBe(true);
    expect(errors).toEqual([]);
  } finally { release(); }
});

test('today excludes acquisition, bid, schedule and dispatch code while navigation warms only its destination', async ({ page }, testInfo) => {
  const errors = [], reads = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.getByTestId('contractor-workbench').locator('.workbench-counts')).toBeVisible();
  const resources = () => page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
  const screen = name => new RegExp(`/${name}-[^/]+\\.js`);
  for (const name of ['PipelineWorkspace', 'BidPackageWorkspace', 'PortfolioScheduleWorkspace', 'DispatchWorkspace']) {
    expect((await resources()).some(url => screen(name).test(url))).toBe(false);
  }
  page.on('request', req => {
    if (/\/api\/ledger\/(opportunities|bid-packages|market-fit|bid-decisions)(?:\?|$)/.test(req.url())) reads.push(req.url());
  });
  const nav = page.getByRole('navigation', { name: 'Work areas', exact: true });
  await nav.getByRole('button', { name: 'Pipeline', exact: true }).hover();
  await expect.poll(async () => (await resources()).some(url => screen('PipelineWorkspace').test(url))).toBe(true);
  expect(reads).toEqual([]);
  for (const name of ['BidPackageWorkspace', 'PortfolioScheduleWorkspace', 'DispatchWorkspace']) {
    expect((await resources()).some(url => screen(name).test(url))).toBe(false);
  }
  await nav.getByRole('button', { name: 'Pipeline', exact: true }).click();
  await expect(page.getByTestId('pipeline-workspace')).toBeVisible();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  expect((await resources()).some(url => screen('BidPackageWorkspace').test(url))).toBe(false);
  await page.getByRole('tab', { name: 'Bid packages', exact: true }).click();
  await expect.poll(async () => (await resources()).some(url => screen('BidPackageWorkspace').test(url))).toBe(true);
  await expect(page.getByRole('tab', { name: 'Bid packages', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('bid-package-workspace')).toBeVisible();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  expect((await new AxeBuilder({ page }).include('.pipeline-view-tabs').withRules(['color-contrast']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('independent-bid-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.side-nav')).toHaveCSS('visibility', 'hidden');
  await expect(page.getByTestId('bid-package-workspace')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('independent-bid-mobile.png') });
  expect(errors).toEqual([]);
});

test('a pending bid screen download keeps the pipeline tabs usable', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  let release, entered = false;
  const delay = new Promise(resolve => { release = resolve; });
  await page.route('**/BidPackageWorkspace-*.js', async route => { entered = true; await delay; await route.continue().catch(() => {}); });
  try {
    await page.goto('/');
    await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
    await page.getByRole('navigation', { name: 'Work areas', exact: true }).getByRole('button', { name: 'Pipeline', exact: true }).click();
    await expect(page.getByTestId('pipeline-workspace')).toBeVisible();
    await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
    await page.getByRole('tab', { name: 'Bid packages', exact: true }).click();
    await expect.poll(() => entered).toBe(true);
    await expect(page.getByTestId('pipeline-workspace').getByText('Loading bid packages', { exact: true })).toBeVisible();
    await page.getByRole('tab', { name: 'Opportunities', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Opportunities', exact: true })).toHaveAttribute('aria-selected', 'true');
    release();
    await expect(page.getByTestId('pipeline-workspace').getByText('Loading bid packages', { exact: true })).toHaveCount(0);
    await page.getByRole('tab', { name: 'Bid packages', exact: true }).click();
    await expect(page.getByRole('tab', { name: 'Bid packages', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('pipeline-workspace').getByText('Loading bid packages', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('bid-package-workspace')).toBeVisible();
    expect(errors).toEqual([]);
  } finally { release(); }
});

test('leaving today aborts its pending workbench read and returning obtains fresh data', async ({ page }) => {
  const errors = [], abandoned = [];
  page.on('pageerror', error => errors.push(error.message));
  const isWorkbench = url => new URL(url).pathname === '/api/ledger/command-plan'
    && new URL(url).searchParams.get('limit') === '20';
  let release, entered = false, hold = true;
  const delay = new Promise(resolve => { release = resolve; });
  await page.route('**/api/ledger/command-plan?*', async route => {
    if (hold && isWorkbench(route.request().url())) { entered = true; await delay; }
    await route.continue().catch(() => {});
  });
  page.on('requestfailed', request => {
    if (isWorkbench(request.url())) abandoned.push(request.failure()?.errorText);
  });
  try {
    await page.goto('/');
    await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
    await expect.poll(() => entered).toBe(true);
    const nav = page.getByRole('navigation', { name: 'Work areas', exact: true });
    await nav.getByRole('button', { name: 'Jobs', exact: true }).click();
    await expect(page.locator('.topbar h1')).toHaveText('Jobs');
    await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
    await expect.poll(() => abandoned.length).toBe(1);
    hold = false; release();
    const fresh = page.waitForResponse(response => isWorkbench(response.url()) && response.request().method() === 'GET');
    await nav.getByRole('button', { name: 'Today', exact: true }).click();
    expect((await fresh).ok()).toBe(true);
    await expect(page.getByTestId('contractor-workbench').locator('.workbench-counts')).toBeVisible();
    await expect(page.getByTestId('contractor-workbench').getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { release(); }
});

test('closing a dossier aborts its work-context and client-delivery reads without stale errors', async ({ page, request }) => {
  const title = `Read cancellation ${Date.now()}`;
  const intake = await request.post('/api/ledger/intake', { data: { title, client: { name: 'Local cancellation fixture' }, assignAutomatically: false } });
  expect(intake.ok()).toBe(true);
  const { job } = await intake.json();
  const errors = [], entered = new Set(), abandoned = new Set();
  page.on('pageerror', error => errors.push(error.message));
  const paths = new Set(['work-context', 'client-deliveries'].map(surface => `/api/ledger/jobs/${job.id}/${surface}`));
  let release, hold = true;
  const delay = new Promise(resolve => { release = resolve; });
  await page.route('**/api/ledger/jobs/**', async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (hold && route.request().method() === 'GET' && paths.has(pathname)) { entered.add(pathname); await delay; }
    await route.continue().catch(() => {});
  });
  page.on('requestfailed', req => { const pathname = new URL(req.url()).pathname; if (paths.has(pathname)) abandoned.add(pathname); });
  try {
    await page.goto('/');
    await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
    await page.getByRole('button', { name: `Open ${title}`, exact: true }).first().click();
    await expect.poll(() => entered.size).toBe(2);
    await page.getByTestId('job-workspace').getByRole('button', { name: 'Close job workspace', exact: true }).click();
    await expect(page.getByTestId('job-workspace')).toHaveCount(0);
    await expect.poll(() => abandoned.size).toBe(2);
    hold = false; release();
    await page.getByRole('button', { name: `Open ${title}`, exact: true }).first().click();
    await expect(page.getByRole('region', { name: 'Werkdossier', exact: true }).getByText('Nog geen locaties gekoppeld.')).toBeVisible();
    await expect(page.getByRole('region', { name: 'Opleveren aan klant', exact: true }).getByRole('alert')).toHaveCount(0);
    expect(errors).toEqual([]);
  } finally { release(); }
});

test('the field assurance queue loads its own code without unrelated dossier controls', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  const nav = page.getByRole('navigation', { name: 'Work areas', exact: true });
  await nav.getByRole('button', { name: 'Field updates', exact: true }).click();
  await expect(page.getByTestId('field-assurance-workspace')).toBeVisible();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  const resources = await page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
  expect(resources.some(name => /\/FieldAssuranceWorkspace-[^/]+\.js/.test(name))).toBe(true);
  expect(resources.filter(name => /\/(?:job-controls|JobWorkspaceControls|CloseoutRegister|CommercialControl|DayworkControl|FieldRiskControl|InspectionChecklistControl|NonconformanceControl|PhotoEvidenceControl|ProductionControl|ProjectControls|TakeoffControl|WorkPlanControl)-[^/]+\.js/.test(name))).toEqual([]);
  await page.getByTestId('field-assurance-workspace').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('independent-field-assurance-desktop.png'), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.side-nav')).toHaveCSS('visibility', 'hidden');
  await page.getByTestId('field-assurance-workspace').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('independent-field-assurance-mobile.png'), fullPage: false });
  expect(errors).toEqual([]);
});

test('clients and automation load independently without warming dossier controls or reading ledger data', async ({ page }, testInfo) => {
  const errors = [], reads = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.getByRole('heading', { name: 'Daily overview', exact: true })).toBeVisible();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  await expect(page.getByTestId('contractor-workbench').locator('.workbench-counts')).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Work areas', exact: true });
  page.on('request', request => {
    if (/\/api\/ledger\/(?:clients|client-directory|command-plan|scheduler)(?:\?|$)/.test(request.url())) reads.push(request.url());
  });
  const loaded = () => page.evaluate(() => performance.getEntriesByType('resource').map(entry => entry.name));
  await nav.getByRole('button', { name: 'Clients', exact: true }).hover();
  await expect.poll(async () => (await loaded()).some(name => /\/ClientsWorkspace-[^/]+\.js/.test(name))).toBe(true);
  expect(reads).toEqual([]);
  expect((await loaded()).some(name => /\/(?:JobWorkspaceControls|AutomationControl|CapabilitySetupControl)-[^/]+\.js/.test(name))).toBe(false);
  await nav.getByRole('button', { name: 'Clients', exact: true }).click();
  await page.getByRole('tab', { name: /^Directory/ }).click();
  await expect(page.getByTestId('client-directory')).toBeVisible();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  await page.getByRole('tab', { name: /^Directory/ }).hover();
  expect((await new AxeBuilder({ page }).include('.client-view-switch').withRules(['color-contrast']).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('independent-clients-desktop.png'), fullPage: false });
  const beforeWarm = [...reads];
  await nav.getByRole('button', { name: 'Operations', exact: true }).hover();
  await expect.poll(async () => (await loaded()).some(name => /\/AutomationControl-[^/]+\.js/.test(name))).toBe(true);
  expect(reads).toEqual(beforeWarm);
  await nav.getByRole('button', { name: 'Operations', exact: true }).click();
  await expect(page.getByTestId('automation-control')).toBeVisible();
  expect((await loaded()).some(name => /\/(?:JobWorkspaceControls|CapabilitySetupControl)-[^/]+\.js/.test(name))).toBe(false);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.side-nav')).toHaveCSS('visibility', 'hidden');
  await page.getByTestId('automation-control').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('independent-automation-mobile.png'), fullPage: false });
  expect(errors).toEqual([]);
});

test('runtime diagnostics do not block unrelated screens and are freshly checked in operations', async ({ page }) => {
  const diagnostics = [];
  page.on('request', req => {
    if (/\/api\/(health|readiness)(?:\?|$)/.test(req.url())) diagnostics.push(new URL(req.url()).pathname);
  });
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.getByRole('heading', { name: 'Daily overview', exact: true })).toBeVisible();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  const nav = page.getByRole('navigation', { name: 'Work areas', exact: true });
  await nav.getByRole('button', { name: 'Jobs', exact: true }).click();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  expect(diagnostics).toEqual([]);

  await nav.getByRole('button', { name: 'Operations', exact: true }).click();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  const panel = page.getByRole('heading', { name: 'Runtime readiness', exact: true })
    .locator('xpath=ancestor::section[1]');
  await expect(panel.locator('.status')).toHaveText('ready');
  expect(diagnostics.sort()).toEqual(['/api/health', '/api/readiness']);

  await page.route('**/api/readiness', route => route.fulfill({ status: 503,
    contentType: 'application/json', body: JSON.stringify({ error: { message: 'Storage check unavailable' } }) }));
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  await expect(panel.locator('.status')).toHaveText('unavailable');
  await expect(panel.getByText('local ready', { exact: true })).toHaveCount(0);
  expect(diagnostics.filter(item => item === '/api/health')).toHaveLength(2);
  expect(diagnostics.filter(item => item === '/api/readiness')).toHaveLength(2);

  await page.route('**/api/health', route => route.fulfill({ status: 503,
    contentType: 'application/json', body: JSON.stringify({ error: { message: 'Health check unavailable' } }) }));
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  await expect(panel.getByText('Runtime diagnostics unavailable.', { exact: true })).toBeVisible();
  await expect(panel.locator('.status')).toHaveCount(0);
  await expect(page.locator('.error-banner')).toBeVisible();
});

test('dashboard warms code without ledger reads and cancels abandoned mobile sections', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.getByRole('heading', { name: 'Daily overview', exact: true })).toBeVisible();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  const nav = page.getByRole('navigation', { name: 'Work areas', exact: true });
  const reads = [];
  page.on('request', request => {
    if (/\/api\/ledger\/(finance|cash-flow)(?:\?|$)/.test(request.url())) reads.push(request.url());
  });
  await nav.getByRole('button', { name: 'Finance', exact: true }).hover();
  await expect.poll(() => page.evaluate(() => performance.getEntriesByType('resource')
    .some(entry => /FinanceWorkspace-[^/]+\.js/.test(entry.name)))).toBe(true);
  expect(reads).toEqual([]);

  let finish;
  const delay = new Promise(resolve => { finish = resolve; });
  let entered = false;
  await page.route('**/api/ledger/finance?*', async route => {
    entered = true;
    await delay;
    await route.continue().catch(() => {});
  });
  const abandoned = [];
  page.on('requestfailed', request => {
    if (request.url().includes('/api/ledger/finance?')) abandoned.push(request.failure()?.errorText);
  });
  await nav.getByRole('button', { name: 'Finance', exact: true }).click();
  await expect.poll(() => entered).toBe(true);
  await expect(page.locator('.workspace-content')).toHaveAttribute('inert');
  await page.setViewportSize({ width: 390, height: 844 });
  const menu = page.getByRole('button', { name: 'Open navigation', exact: true });
  await expect(menu).toBeEnabled();
  await menu.click();
  const start = await page.evaluate(() => performance.now());
  await nav.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.locator('.topbar h1')).toHaveText('Today');
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  await expect.poll(() => abandoned.length).toBe(1);
  const elapsed = await page.evaluate(time => performance.now() - time, start);
  finish();
  await expect(page.getByRole('complementary', { name: 'Primary navigation', exact: true })).not.toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('responsive-navigation-mobile.png'), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
  const observationPath = testInfo.outputPath('navigation-observation.json');
  fs.writeFileSync(observationPath, JSON.stringify({ abandonedRequests: abandoned.length,
    returnToTodayMs: elapsed, warmedCodeWithoutLedgerReads: true }));
  await testInfo.attach('navigation-observation', { path: observationPath, contentType: 'application/json' });
});

test('manual operations refresh reloads shared operator state without reusing an aborted navigation signal', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  const nav = page.getByRole('navigation', { name: 'Work areas', exact: true });
  const isPlan = response => new URL(response.url()).pathname === '/api/ledger/command-plan'
    && response.request().method() === 'GET';
  const first = page.waitForResponse(isPlan);
  await nav.getByRole('button', { name: 'Operations', exact: true }).click();
  expect((await first).ok()).toBe(true);
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  const sharedStateResponses = new Set();
  page.on('response', response => {
    const url = new URL(response.url());
    if (response.request().method() === 'GET') sharedStateResponses.add(`${url.pathname}${url.search}`);
  });
  const refreshed = page.waitForResponse(isPlan);
  await page.getByRole('button', { name: 'Refresh data', exact: true }).click();
  expect((await refreshed).ok()).toBe(true);
  await expect.poll(() => [...sharedStateResponses]).toEqual(expect.arrayContaining([
    '/api/session',
    '/api/ledger/jobs?limit=100',
    '/api/ledger/dashboard',
    '/api/ledger/approvals?status=pending&limit=100',
  ]));
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  await expect(page.locator('.error-banner')).toHaveCount(0);
});

test('large crew directory searches stay local and paginated on desktop and mobile', async ({ page, request }, testInfo) => {
  const prefix = `ResourcePerf ${Date.now()} row`;
  for (let index = 0; index < 50; index++) {
    const response = await request.post('/api/ledger/workers', { data: {
      name: `${prefix} ${String(index).padStart(3, '0')}`, role: 'Carpenter', status: 'available',
    } });
    expect(response.ok()).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  const nav = page.getByRole('navigation', { name: 'Work areas', exact: true });
  await nav.getByRole('button', { name: 'Resources', exact: true }).click();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  await page.getByRole('tab', { name: 'Crew directory', exact: true }).click();
  const directory = page.getByTestId('worker-directory');
  await expect(directory.getByRole('article')).toHaveCount(25);
  const search = directory.getByRole('searchbox');
  const target = `${prefix} 007`;
  const requests = [];
  page.on('request', request => { if (request.url().includes('/api/')) requests.push(request.url()); });
  const observations = [];
  for (const query of ['row 007', 'ROW 007', '  row 007', 'row 007  ', target.toLowerCase(), target, 'row 007']) {
    const start = await page.evaluate(() => performance.now());
    await search.fill(query);
    await expect(directory.getByRole('article')).toHaveCount(1);
    await expect(directory.getByText(target, { exact: true })).toBeVisible();
    observations.push(await page.evaluate(time => performance.now() - time, start));
  }
  expect(requests).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('crew-search-desktop.png'), fullPage: false });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('complementary', { name: 'Primary navigation', exact: true })).not.toBeVisible();
  await expect(search).toHaveValue('row 007');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('crew-search-mobile.png'), fullPage: false });
  const observationPath = testInfo.outputPath('search-observations.json');
  fs.writeFileSync(observationPath, JSON.stringify({ fixtureWorkers: 50,
    queryToResultMs: observations, searchApiRequests: requests.length }));
  await testInfo.attach('search-observations', { path: observationPath, contentType: 'application/json' });
});
