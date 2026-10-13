const { test, expect } = require('@playwright/test');
const fs = require('node:fs');

test('isolated intake keeps rapid input, reload recovery and real ledger creation on desktop and mobile', async ({ page, request }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await page.getByRole('navigation', { name: 'Work areas', exact: true })
    .getByRole('button', { name: 'Jobs', exact: true }).click();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  await page.getByRole('button', { name: 'New job', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'New intake', exact: true });
  const title = `IntakePerf ${Date.now()}`;
  const reads = [];
  page.on('request', req => { if (req.url().includes('/api/')) reads.push(req.url()); });
  await dialog.getByLabel('Client name').fill('Isolated intake client');
  const start = await page.evaluate(() => performance.now());
  await dialog.getByLabel('Job title').pressSequentially(title);
  await expect(dialog.getByLabel('Job title')).toHaveValue(title);
  const typingMs = await page.evaluate(time => performance.now() - time, start);
  await dialog.getByLabel('Service').fill('Renovation');
  await dialog.getByLabel('Location').fill('Arnhem');
  await dialog.getByLabel('Priority').selectOption('high');
  await dialog.getByLabel('Scope').fill('Recover every field without creating a job until explicitly saved.');
  expect(reads).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('intake-desktop.png'), fullPage: false });
  await dialog.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  // Reload immediately: pagehide must save the latest local input before the debounce.
  await page.reload();
  await page.getByRole('navigation', { name: 'Work areas', exact: true })
    .getByRole('button', { name: 'Jobs', exact: true }).click();
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  await page.getByRole('button', { name: 'New job', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'New intake', exact: true });
  await expect(dialog.getByLabel('Client name')).toHaveValue('Isolated intake client');
  await expect(dialog.getByLabel('Job title')).toHaveValue(title);
  await expect(dialog.getByLabel('Location')).toHaveValue('Arnhem');
  await expect(dialog.getByLabel('Priority')).toHaveValue('high');
  const before = await request.get(`/api/ledger/jobs?search=${encodeURIComponent(title)}&limit=100`);
  expect(before.ok()).toBe(true);
  expect((await before.json()).jobs).toHaveLength(0);

  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('intake-mobile.png'), fullPage: false });
  const saved = page.waitForResponse(res => new URL(res.url()).pathname === '/api/ledger/intake'
    && res.request().method() === 'POST');
  await dialog.getByRole('button', { name: 'Create intake', exact: true }).click();
  expect((await saved).ok()).toBe(true);
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('.workspace-content')).not.toHaveAttribute('inert');
  const after = await request.get(`/api/ledger/jobs?search=${encodeURIComponent(title)}&limit=100`);
  expect(after.ok()).toBe(true);
  const jobs = (await after.json()).jobs;
  expect(jobs).toHaveLength(1);
  expect(jobs[0].title).toBe(title);
  await page.getByRole('button', { name: 'New job', exact: true }).click();
  await expect(dialog.getByLabel('Job title')).toHaveValue('');
  await expect(dialog.getByLabel('Priority')).toHaveValue('medium');
  expect(errors).toEqual([]);
  const observation = testInfo.outputPath('intake-observation.json');
  fs.writeFileSync(observation, JSON.stringify({ characters: title.length, typingMs,
    inputApiRequests: 0, recovered: true, createdLedgerJobs: jobs.length }));
  await testInfo.attach('intake-observation', { path: observation, contentType: 'application/json' });
});
