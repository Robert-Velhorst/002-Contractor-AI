const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');

test('recovery typing reuses current source and case views and closing cancels only the abandoned read', async ({ page }, testInfo) => {
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const headers = { Authorization: 'Bearer browser-office-token-at-least-32-characters' };
  const title = `Herstelweergave ${Date.now()}`, errors = [], writes = [];
  async function post(route, data) {
    const response = await page.request.post(base + route, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  async function get(route) {
    const response = await page.request.get(base + route, { headers });
    expect(response.ok(), await response.text()).toBeTruthy();
    return response.json();
  }
  const { job } = await post('/api/ledger/intake', { title, client: { name: 'Herstelweergave klant' }, assignAutomatically: false });
  const route = `/api/ledger/jobs/${job.id}/operational-recovery`;
  for (let index = 0; index < 4; index += 1) {
    await post(`/api/ledger/jobs/${job.id}/incidents`, { title: `Te beoordelen situatie ${index + 1}`,
      severity: 'low', status: 'reported', incidentType: 'near_miss' });
  }
  let snapshot = await get(route);
  const sourceIds = snapshot.sources.filter(source => source.type === 'safety_incident').map(source => source.id);
  expect(sourceIds).toHaveLength(4);
  for (let index = 0; index < 3; index += 1) {
    await post(route, { action: 'create', entryKey: `retained-recovery-${job.id}-${index}`, sourceHash: snapshot.sourceHash,
      sources: [{ type: 'safety_incident', id: sourceIds[index] }], owner: 'Werkvoorbereider',
      dueAt: '2030-01-02T09:00:00.000Z', actionType: 'review_only', recoveryAction: `Bewaarde beoordeling ${index + 1}` });
    snapshot = await get(route);
  }
  expect(snapshot.cases).toHaveLength(3);
  // Count reads on the actual JSON response without replacing its values or business data.
  await page.addInitScript(({ route }) => {
    const nativeFetch = window.fetch.bind(window);
    window.recoveryPerformance = { titleReads: 0, caseReads: 0, responses: 0, abortedReads: 0 };
    window.fetch = async (...args) => {
      const requestUrl = typeof args[0] === 'string' ? args[0] : args[0].url;
      const recoveryRead = new URL(requestUrl, location.href).pathname === route
        && (args[1]?.method || args[0]?.method || 'GET').toUpperCase() === 'GET';
      if (recoveryRead) args[1]?.signal?.addEventListener('abort', () => { window.recoveryPerformance.abortedReads += 1; }, { once: true });
      const response = await nativeFetch(...args);
      if (recoveryRead) {
        const nativeJson = response.json.bind(response);
        response.json = async () => {
          const value = await nativeJson();
          window.recoveryPerformance.responses += 1;
          for (const source of value.sources || []) {
            const title = source.title;
            Object.defineProperty(source, 'title', { enumerable: true, get() {
              window.recoveryPerformance.titleReads += 1; return title;
            } });
          }
          for (const item of value.cases || []) {
            const action = item.recoveryAction;
            Object.defineProperty(item, 'recoveryAction', { enumerable: true, get() {
              window.recoveryPerformance.caseReads += 1; return action;
            } });
          }
          return value;
        };
      }
      return response;
    };
  }, { route });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    if (new URL(request.url()).pathname === route && !['GET', 'HEAD'].includes(request.method())) writes.push(request.method());
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.locator('#operator-access-key').fill('browser-office-token-at-least-32-characters');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  await page.getByRole('button', { name: 'Projecten', exact: true }).click();
  const openJob = page.getByRole('button', { name: `${title} openen`, exact: true });
  await openJob.click();
  const panel = page.getByRole('region', { name: 'Operationele herstelcasussen' });
  await expect(panel.getByRole('heading', { name: /^Bewaarde beoordeling/ })).toHaveCount(3);
  await panel.getByRole('checkbox', { name: /Te beoordelen situatie 4/ }).check();
  await panel.getByRole('button', { name: 'Herstelcasus aanmaken', exact: true }).click();
  const beforeTyping = await page.evaluate(() => ({ ...window.recoveryPerformance }));
  expect(beforeTyping.titleReads).toBeGreaterThan(0);
  expect(beforeTyping.caseReads).toBeGreaterThan(0);
  await panel.getByLabel('Verantwoordelijke').pressSequentially('Werkvoorbereider');
  await panel.getByLabel('Wat moet worden uitgezocht of voorbereid?').pressSequentially('Controleer de actuele situatie en het bewijs.');
  const afterTyping = await page.evaluate(() => ({ ...window.recoveryPerformance }));
  expect(afterTyping).toEqual(beforeTyping);
  await expect(panel.getByLabel('Verantwoordelijke')).toHaveValue('Werkvoorbereider');
  await expect(panel.getByLabel('Wat moet worden uitgezocht of voorbereid?')).toHaveValue('Controleer de actuele situatie en het bewijs.');
  await expect(panel.getByRole('checkbox', { name: /Te beoordelen situatie 4/ })).toBeChecked();
  expect((await new AxeBuilder({ page }).include('[aria-label="Operationele herstelcasussen"]').analyze()).violations).toEqual([]);
  await panel.getByLabel('Verantwoordelijke').scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath('recovery-performance-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.side-nav')).toHaveCSS('visibility', 'hidden');
  await panel.getByLabel('Verantwoordelijke').scrollIntoViewIfNeeded();
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('recovery-performance-mobile.png') });
  await panel.getByRole('button', { name: 'Annuleren', exact: true }).click();

  let releaseRead, heldRead;
  const held = new Promise(resolve => { heldRead = resolve; });
  const released = new Promise(resolve => { releaseRead = resolve; });
  await page.route(base + route, async intercepted => {
    heldRead();
    await released;
    await intercepted.continue().catch(() => {});
  }, { times: 1 });
  const beforeRefresh = await page.evaluate(() => ({ ...window.recoveryPerformance }));
  try {
    await panel.getByRole('button', { name: 'Herstelcasussen verversen' }).click();
    await held;
    await expect(panel.getByText('Verstoringen laden...', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Opdrachtwerkruimte sluiten', exact: true }).click();
    await expect(page.getByTestId('job-workspace')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.recoveryPerformance.abortedReads)).toBeGreaterThan(beforeRefresh.abortedReads + 1);
  } finally { releaseRead(); }
  await openJob.click();
  await expect(panel.getByRole('heading', { name: /^Bewaarde beoordeling/ })).toHaveCount(3);
  await expect(panel.getByText('Verstoringen laden...', { exact: true })).toHaveCount(0);
  await expect(panel.getByRole('alert')).toHaveCount(0);
  const afterReopen = await page.evaluate(() => ({ ...window.recoveryPerformance }));
  expect(afterReopen.responses).toBeGreaterThan(beforeRefresh.responses);
  const finalSnapshot = await get(route);
  expect(finalSnapshot.cases.map(item => item.id)).toEqual(snapshot.cases.map(item => item.id));
  expect(finalSnapshot.sourceHash).toBe(snapshot.sourceHash);
  expect(writes).toEqual([]);
  expect(errors).toEqual([]);
  const observation = { beforeTyping, afterTyping, beforeRefresh, afterReopen, retainedCases: finalSnapshot.cases.length, writes };
  fs.writeFileSync(testInfo.outputPath('recovery-performance-observation.json'), JSON.stringify(observation, null, 2));
  console.log(JSON.stringify({ recoveryPerformance: observation }));
});
