const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const AxeBuilder = require('@axe-core/playwright').default;

test('real browser asset transport preserves exact code and chooses non-increasing Brotli bodies', async ({ page }, testInfo) => {
  const assetsDirectory = path.resolve(__dirname, '../dist/assets');
  const observations = [], pending = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('response', response => {
    const pathname = new URL(response.url()).pathname;
    if (!/^\/assets\/[^/]+\.(?:js|css)$/.test(pathname)) return;
    pending.push((async () => {
      const name = path.basename(pathname), source = fs.readFileSync(path.join(assetsDirectory, name));
      const encoded = fs.readFileSync(path.join(assetsDirectory, `${name}.br`));
      const baseline = zlib.brotliCompressSync(source, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 10 } });
      const headers = await response.allHeaders();
      expect(response.status()).toBe(200);
      expect(headers['content-encoding']).toBe('br');
      expect(Number(headers['content-length'])).toBe(encoded.length);
      expect((await response.body()).equals(source)).toBe(true);
      expect(encoded.length).toBeLessThanOrEqual(baseline.length);
      observations.push({ name, bytes: source.length, encodedBytes: encoded.length, baselineBytes: baseline.length });
    })().then(() => null, error => error));
  });
  await page.goto('/');
  await expect(page).toHaveTitle(/Contractor\.AI/);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await expect(page.getByTestId('contractor-workbench')).toBeVisible();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  const navigation = page.getByRole('navigation', { name: 'Work areas', exact: true });
  for (const destination of ['Jobs', 'Resources', 'Finance', 'Today']) {
    await navigation.getByRole('button', { name: destination, exact: true }).click();
    await expect(page.locator('.topbar h1')).toHaveText(destination);
  }
  await expect(page.getByTestId('contractor-workbench')).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.topbar').include('.side-nav').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('compressed-dashboard-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.side-nav')).toHaveCSS('visibility', 'hidden');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.getByTestId('contractor-workbench')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('compressed-dashboard-mobile.png') });
  const results = await Promise.all(pending);
  expect(results.filter(Boolean)).toEqual([]);
  for (const prefix of ['App-', 'react-', 'operator-locale-', 'ResourcesWorkspace-', 'FinanceWorkspace-']) {
    expect(observations.some(item => item.name.startsWith(prefix))).toBe(true);
  }
  expect(observations.some(item => item.encodedBytes < item.baselineBytes)).toBe(true);
  const timing = await page.evaluate(() => performance.getEntriesByType('resource')
    .filter(entry => /\/assets\/.+\.(?:js|css)$/.test(new URL(entry.name).pathname))
    .map(entry => ({ name: new URL(entry.name).pathname.split('/').at(-1), encodedBodySize: entry.encodedBodySize })));
  expect(timing.some(entry => entry.encodedBodySize > 0)).toBe(true);
  for (const entry of timing.filter(item => item.encodedBodySize > 0)) {
    expect(entry.encodedBodySize).toBe(fs.statSync(path.join(assetsDirectory, `${entry.name}.br`)).size);
  }
  fs.writeFileSync(testInfo.outputPath('asset-transport-observation.json'), JSON.stringify({ observations, timing }, null, 2));
  expect(errors).toEqual([]);
});
