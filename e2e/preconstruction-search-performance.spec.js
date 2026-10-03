const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const AxeBuilder = require('@axe-core/playwright').default;

test('preconstruction search reuses exact dossier text while typing without ledger writes', async ({ page, request }, testInfo) => {
  const prefix = `Search fixture ${Date.now()}`;
  const opportunities = [];
  for (let index = 0; index < 8; index++) {
    const response = await request.post('/api/ledger/opportunities', { data: {
      title: `${prefix} lead ${index}`, clientName: 'Local search client', stage: 'estimating',
      description: `nested-evidence-${index} ${'Retained scope. '.repeat(60)}`, estimatedValue: 1234.5,
    } });
    expect(response.ok()).toBe(true);
    opportunities.push((await response.json()).opportunity);
  }
  const partnerResponse = await request.post('/api/ledger/trade-partners', { data: {
    name: `${prefix} partner`, partnerType: 'supplier', registrationNumber: '88776655',
    vatNumber: 'NL987654321B01', verificationReference: 'LOCAL-SEARCH-FIXTURE',
    verifiedAt: new Date(Date.now() - 86400000).toISOString(),
  } });
  expect(partnerResponse.ok()).toBe(true);
  const partner = (await partnerResponse.json()).partner;
  const packages = [];
  for (let index = 0; index < 6; index++) {
    const response = await request.post('/api/ledger/bid-packages', { data: {
      opportunityId: opportunities[0].id, title: `${prefix} package ${index}`, trade: 'Mechanical',
      scope: `package-evidence-${index} ${'Retained installation scope. '.repeat(30)}`, tradePartnerIds: [partner.id],
    } });
    expect(response.ok()).toBe(true);
    packages.push((await response.json()).bidPackage);
  }
  await page.addInitScript(prefix => {
    const stringify = JSON.stringify;
    window.searchWork = { opportunities: 0, packages: 0, characters: 0 };
    JSON.stringify = function (...args) {
      const output = stringify.apply(this, args);
      const value = args[0];
      if (value?.id && typeof value.title === 'string' && value.title.startsWith(prefix)) {
        if (typeof value.stage === 'string') window.searchWork.opportunities++;
        else if (typeof value.packageNumber === 'string') window.searchWork.packages++;
        window.searchWork.characters += output?.length || 0;
      }
      return output;
    };
  }, prefix);
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    if (request.method() !== 'GET' && new URL(request.url()).pathname.startsWith('/api/ledger/')) writes.push(request.url());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page).toHaveTitle(/Contractor\.AI/);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await page.getByRole('navigation', { name: 'Work areas', exact: true }).getByRole('button', { name: 'Pipeline', exact: true }).click();
  const pipeline = page.getByTestId('pipeline-workspace');
  await expect(pipeline.locator('.pipeline-row').filter({ hasText: prefix })).toHaveCount(8);
  expect(await page.evaluate(() => window.searchWork.opportunities)).toBe(0);
  const input = pipeline.getByPlaceholder('Search client, scope or location', { exact: true });
  await input.pressSequentially('LeAd 0');
  await expect(pipeline.locator('.pipeline-row')).toHaveCount(1);
  await expect(pipeline.getByRole('button', { name: `Open ${opportunities[0].title}`, exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.searchWork.opportunities)).toBe(8);
  await input.fill(' NESTED-EVIDENCE-1 ');
  await expect(pipeline.locator('.pipeline-row')).toHaveCount(1);
  await expect(pipeline.getByRole('button', { name: `Open ${opportunities[1].title}`, exact: true })).toBeVisible();
  expect(await page.evaluate(() => window.searchWork.opportunities)).toBe(8);
  await input.fill('lead 0');
  await pipeline.locator('.pipeline-panel').scrollIntoViewIfNeeded();
  expect((await new AxeBuilder({ page }).include('.pipeline-panel').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('indexed-pipeline-desktop.png') });
  const pipelineWork = await page.evaluate(() => ({ ...window.searchWork }));
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.side-nav')).toHaveCSS('visibility', 'hidden');
  await pipeline.locator('.pipeline-panel').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('indexed-pipeline-mobile.png') });
  await pipeline.getByRole('tab', { name: 'Bid packages', exact: true }).click();
  const bids = page.getByTestId('bid-package-workspace');
  await expect(bids.locator('.bid-package-row').filter({ hasText: prefix })).toHaveCount(6);
  expect(await page.evaluate(() => window.searchWork.packages)).toBe(0);
  const bidInput = bids.getByPlaceholder('Search package, client, trade or bidder', { exact: true });
  await bidInput.pressSequentially('PaCkAgE 0');
  await expect(bids.locator('.bid-package-row')).toHaveCount(1);
  expect(await page.evaluate(() => window.searchWork.packages)).toBe(6);
  await bidInput.fill(' PACKAGE-EVIDENCE-1 ');
  await expect(bids.locator('.bid-package-row')).toHaveCount(1);
  await expect(bids).toContainText(packages[1].packageNumber);
  await bidInput.fill('package 0');
  expect(await page.evaluate(() => window.searchWork.packages)).toBe(6);
  expect(await page.evaluate(() => window.searchWork.opportunities)).toBe(8);
  await bids.scrollIntoViewIfNeeded();
  expect((await new AxeBuilder({ page }).include('.bid-register').analyze()).violations).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('indexed-bids-mobile.png') });
  await bids.getByRole('button', { name: `Open bid package ${packages[0].packageNumber}`, exact: true }).click();
  await expect(pipeline.locator('.bid-package-detail').getByRole('heading', { name: `${packages[0].packageNumber} / ${packages[0].title}`, exact: true })).toBeVisible();
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  const observation = { pipelineWork, finalWork: await page.evaluate(() => ({ ...window.searchWork })), unsavedLedgerWrites: writes.length };
  fs.writeFileSync(testInfo.outputPath('indexed-search-observation.json'), JSON.stringify(observation));
  console.log(JSON.stringify({ indexedSearch: observation }));
});
