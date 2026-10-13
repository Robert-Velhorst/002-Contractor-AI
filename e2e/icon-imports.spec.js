const { test, expect } = require('@playwright/test');
const { expectNoAxeViolations } = require('./accessibility-helpers');
const os = require('node:os');
const path = require('node:path');

test('direct icon modules render usable desktop and mobile navigation without runtime errors', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const response = await page.goto('/');
  expect(response.ok()).toBeTruthy();
  await expect(page).toHaveTitle('Contractor.AI');
  await expect(page.getByRole('navigation', { name: /^(Work areas|Werkgebieden)$/ })
    .getByRole('button', { name: /^(Finance|Financien)$/ })).toBeEnabled();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.getByRole('heading', { level: 1, name: 'Today', exact: true })).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  const navigation = page.getByRole('navigation', { name: 'Work areas' });
  const buttons = navigation.getByRole('button');
  await expect(navigation.getByRole('button', { name: 'Finance', exact: true })).toBeEnabled();
  await expect.poll(() => buttons.count()).toBeGreaterThan(10);
  await expect(navigation.locator('svg.lucide')).toHaveCount(await buttons.count());
  expect(await navigation.locator('svg.lucide').evaluateAll(icons => icons.every(icon => {
    const rect = icon.getBoundingClientRect();
    return rect.width >= 16 && rect.height >= 16 && Boolean(icon.querySelector('path,line,polyline,rect,circle,ellipse,polygon'));
  }))).toBe(true);
  const workbench = page.getByTestId('contractor-workbench');
  await expect(workbench).toBeVisible();
  await expect(workbench.getByText('Loading work plan...', { exact: true })).toBeHidden();
  await expect(workbench.getByRole('alert')).toHaveCount(0);
  const marker = Date.now();
  const desktop = path.join(os.tmpdir(), `contractor-direct-icons-${marker}-desktop.png`);
  await page.screenshot({ path: desktop });

  await buttons.filter({ hasText: /^Finance$/ }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Finance', exact: true })).toBeVisible();
  const cashFlow = page.getByTestId('cash-flow-control');
  await expect(cashFlow.getByRole('heading', { name: '13-week cash-flow forecast' })).toBeVisible();
  await expect(cashFlow.getByRole('button', { name: 'Recalculate' }).locator('svg.lucide')).toHaveCount(1);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Close navigation', exact: true })).toBeVisible();
  await buttons.filter({ hasText: /^Finance$/ }).click();
  await expect(page.locator('.side-nav')).toBeHidden();
  await expect(page.getByRole('heading', { level: 1, name: 'Finance', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await expectNoAxeViolations(page, 'direct-icon mobile finance');
  const mobile = path.join(os.tmpdir(), `contractor-direct-icons-${marker}-mobile.png`);
  await page.screenshot({ path: mobile });
  expect(errors).toEqual([]);
  console.log(JSON.stringify({ directIconScreenshots: { desktop, mobile } }));
});
