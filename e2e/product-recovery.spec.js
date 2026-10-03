const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('failed product module shows an accessible recovery state without clearing retained work or replaying writes', async ({ page }, testInfo) => {
  await page.goto('/');
  await expect(page.getByLabel(/^(Language|Taal)$/)).toBeVisible();
  await page.evaluate(() => sessionStorage.setItem('boundary-retained-work', 'Retained local note'));
  const writes = [];
  page.on('request', request => {
    if (request.url().includes('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(request.method())) writes.push(request.method());
  });
  await page.route('**/assets/App-*.js', route => route.abort('failed'));
  await page.reload();
  await expect(page.getByRole('heading', { name: 'The workspace could not load' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload workspace' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 700 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('product-load-recovery-mobile.png') });
  expect(writes).toEqual([]);
  await page.unroute('**/assets/App-*.js');
  await page.getByRole('button', { name: 'Reload workspace' }).click();
  await expect(page.getByLabel(/^(Language|Taal)$/)).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await page.evaluate(() => sessionStorage.getItem('boundary-retained-work'))).toBe('Retained local note');
  expect(writes).toEqual([]);
});
