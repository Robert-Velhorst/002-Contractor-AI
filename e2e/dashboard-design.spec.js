const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;

test('redesigned dashboard retains real navigation, mobile access and dossier drafts', async ({ page, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const title = `Design QA ${Date.now()}`;
  const intake = await request.post('/api/ledger/intake', { data: {
    title, service: 'Roof repair', address: 'Teststraat 10', city: 'Arnhem', estimatedHours: 8,
    client: { name: 'Design test client', email: 'design@example.test' }, assignAutomatically: false,
  } });
  expect(intake.ok()).toBeTruthy();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.getByRole('heading', { name: 'Daily overview', exact: true })).toBeVisible();
  const nav = page.getByRole('navigation', { name: 'Work areas', exact: true });
  await expect(nav.getByText('Delivery', { exact: true })).toBeVisible();
  await expect(nav.getByRole('button', { name: 'Today', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByTestId('today-agenda')).toBeVisible();
  await expect(page.getByTestId('contractor-workbench')).toBeVisible();
  await expect(page.getByTestId('contractor-workbench').getByRole('button', { name: 'Refresh work', exact: true })).toBeEnabled();
  await page.screenshot({ path: testInfo.outputPath('dashboard-desktop.png'), fullPage: false });
  const accessibility = await new AxeBuilder({ page }).include('.side-nav').include('.today-agenda').analyze();
  expect(accessibility.violations).toEqual([]);
  await page.getByRole('button', { name: 'View planning', exact: true }).click();
  await expect(page.locator('.topbar h1')).toHaveText('Schedule');
  await nav.getByRole('button', { name: 'Jobs', exact: true }).click();
  await page.getByRole('button', { name: `Open ${title}`, exact: true }).click();
  const dossier = page.getByTestId('job-workspace');
  await expect(dossier.getByRole('heading', { name: title, exact: true })).toBeVisible();
  await dossier.getByRole('tab', { name: 'Client contact', exact: true }).click();
  const subject = dossier.getByRole('textbox', { name: 'Subject', exact: true });
  await subject.fill('Unsaved draft must survive');
  await dossier.getByRole('tab', { name: 'Planning', exact: true }).click();
  await expect(subject).toBeHidden();
  await expect(dossier.getByRole('heading', { name: 'Schedule review', exact: true })).toBeVisible();
  await dossier.getByRole('tab', { name: 'Client contact', exact: true }).click();
  await expect(subject).toHaveValue('Unsaved draft must survive');
  await page.screenshot({ path: testInfo.outputPath('dossier-desktop.png'), fullPage: false });
  const dossierAxe = await new AxeBuilder({ page }).include('.dossier-tabs').analyze();
  expect(dossierAxe.violations).toEqual([]);
  await dossier.getByRole('button', { name: 'Close job workspace' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button', { name: 'Open navigation', exact: true }).click();
  await nav.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(page.getByRole('complementary', { name: 'Primary navigation' })).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeVisible();
  await page.getByLabel('Language', { exact: true }).selectOption('nl-NL');
  await expect(page.getByRole('heading', { name: 'Dagoverzicht', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('dashboard-mobile.png'), fullPage: false });
  const refresh = page.getByRole('button', { name: /Vernieuw|Ververs/i }).first();
  await expect(refresh).toBeVisible();
  const size = await refresh.boundingBox();
  expect(size.height).toBeGreaterThanOrEqual(44);
  expect(size.width).toBeGreaterThanOrEqual(44);
  expect(errors).toEqual([]);
});

test('dashboard never inserts table rows into field forms and fits tablet layout', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.getByTestId('contractor-workbench')).toBeVisible();
  await expect(page.locator('select tr')).toHaveCount(0);
  await page.setViewportSize({ width: 768, height: 1024 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page.getByRole('button', { name: 'Open navigation', exact: true })).toBeVisible();
});
