const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const os = require('node:os');
const path = require('node:path');

test('office defines and reviews complete inspection coverage and the assigned phone retains operational checks offline', async ({ page, request, browser }) => {
  test.setTimeout(100_000);
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`, owner = { Authorization: 'Bearer browser-owner-token-at-least-32-characters' };
  async function post(route, data) { const response = await request.post(base + route, { headers: owner, data }); expect(response.ok(), await response.text()).toBeTruthy(); return response.json(); }
  async function get(route) { const response = await request.get(base + route, { headers: owner }); expect(response.ok()).toBeTruthy(); return response.json(); }
  const workerId = 'browser-field-task-worker', title = `Inspection coverage ${Date.now()}`;
  await post('/api/ledger/workers', { id: workerId, name: 'Coverage worker', role: 'Installer', status: 'available' });
  const { job } = await post('/api/ledger/intake', { title, client: { name: 'Coverage customer' }, tasks: [{ title: 'Montage deuren', assigneeId: workerId }], assignAutomatically: false });
  await post(`/api/ledger/jobs/${job.id}/assignments`, { workerId, status: 'assigned', role: 'Installer' });
  const contextRoute = `/api/ledger/jobs/${job.id}/work-context`, route = `/api/ledger/jobs/${job.id}/inspection-coverage`, deliveryRoute = `/api/ledger/jobs/${job.id}/work-deliveries`;
  const pack = await post(contextRoute, { action: 'save_package', entryKey: 'coverage-package', sourceHash: (await get(contextRoute)).sourceHash,
    record: { code: 'DOOR', title: 'Deurmontage', outcome: 'Twee deuren plaatsen', taskIds: [job.tasks[0].id], quantityIds: [] } });
  const baseline = await post(`/api/ledger/jobs/${job.id}/production-baselines`, { lines: [{ lineKey: 'door', costCode: 'DOOR', description: 'Deur', unit: 'st', plannedQuantity: 2, plannedLaborHours: 4 }] });
  await post(`/api/ledger/approvals/${baseline.approval.id}/resolve?includeDashboard=false`, { status: 'approved' });
  const entry = await post(`/api/ledger/jobs/${job.id}/production-entries`, { lineKey: 'door', workDate: '2026-09-01', quantity: 1, crewHours: 2, note: 'Eerste deur gemonteerd', entryKey: 'coverage-browser-entry' });
  await post(deliveryRoute, { action: 'retain', entryKey: 'coverage-browser-delivery', sourceHash: (await get(deliveryRoute)).sourceHash,
    record: { packageId: pack.record.id, title: 'Eerste deur gemonteerd', scope: 'Eerste deur geplaatst; tweede deur nog uitvoeren.', entryIds: [entry.entry.id], taskIds: [] } });
  const inspection = await post(`/api/ledger/jobs/${job.id}/inspections`, { title: 'Sluiting eerste deur', status: 'passed', result: 'passed', inspector: 'Fixture inspector', completedAt: '2026-09-02T12:00:00Z' });
  await post(`/api/ledger/approvals/${inspection.inspection.approval.id}/resolve?includeDashboard=false`, { status: 'approved' });
  await post(`/api/ledger/jobs/${job.id}/documents`, { title: 'Afzonderlijk meetrapport', type: 'inspection_coverage_evidence', data: { reference: 'Private office report R1' } });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(base);
  await page.locator('#operator-access-key').fill('browser-office-token-at-least-32-characters'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB'); await page.getByRole('button', { name: `Open ${title}`, exact: true }).first().click();
  const panel = page.getByRole('region', { name: 'Keuringsdekking', exact: true });
  await panel.getByRole('button', { name: 'Controleplan opstellen' }).click();
  await panel.getByLabel('Afbakening controlescope', { exact: true }).fill('Private scope: uitsluitend de eerste deur.');
  await panel.getByLabel('Controletitel voor uitvoerende', { exact: true }).fill('Sluiting deur controleren');
  await panel.getByLabel('Acceptatiecriterium', { exact: true }).fill('Private criterion: conform gecontroleerd meetrapport.');
  await panel.getByLabel('Instructie voor uitvoerende', { exact: true }).fill('Controleer de sluiting; meld afwijkingen.');
  await panel.getByRole('checkbox', { name: 'Alle vereiste controles voor dit beschreven deel zijn opgenomen' }).check();
  await panel.getByLabel('Onderbouwing voor beoordelaar', { exact: true }).fill('Private evidence review required.');
  await panel.getByRole('button', { name: 'Ter beoordeling indienen' }).click(); await expect(panel.getByText('Beoordeling toegevoegd aan Goedkeuringen.')).toBeVisible();
  const first = (await get(route)).records[0].history[0];
  const ownerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  try {
    const reviewer = await ownerContext.newPage(); reviewer.on('pageerror', error => errors.push(error.message));
    await reviewer.goto(base); await reviewer.locator('#operator-access-key').fill('browser-owner-token-at-least-32-characters');
    await reviewer.getByRole('button', { name: 'Sign in', exact: true }).click(); await reviewer.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
    await reviewer.locator('.side-nav').getByRole('button', { name: /^Approvals\b/ }).click();
    const approval = reviewer.locator('.approval-item').filter({ hasText: 'Controleplan beoordelen: Eerste deur gemonteerd' });
    await approval.getByRole('button', { name: 'Review and approve', exact: true }).click();
    const modal = reviewer.getByTestId('approval-review-modal');
    await expect(modal.getByText(/Private criterion: conform gecontroleerd meetrapport/)).toBeVisible();
    await modal.getByLabel('Reviewer reason', { exact: true }).fill('Scope and complete list verified against retained sources.');
    await modal.getByRole('button', { name: 'Confirm approval', exact: true }).click();
    await expect(modal).toBeHidden();
  } finally { await ownerContext.close().catch(() => {}); }
  expect((await get(route)).records[0].coverage.planId).toBe(first.id);
  await panel.getByRole('button', { name: 'Keuringsdekking verversen' }).click();
  await expect(panel.getByText('Bewijs per controle ontbreekt', { exact: true })).toBeVisible();
  await panel.getByRole('button', { name: 'Bewijs per controle beoordelen' }).click();
  await panel.getByRole('combobox', { name: 'Goedgekeurde keuring', exact: true }).selectOption({ label: 'Sluiting eerste deur' });
  await panel.getByLabel('Bewijs voor dit uitgevoerde deel', { exact: true }).fill('Private report row 1 covers this first door.');
  await panel.getByRole('checkbox', { name: 'Afzonderlijk meetrapport' }).check();
  await panel.getByLabel('Onderbouwing voor beoordelaar', { exact: true }).fill('Private mapping verified.');
  await panel.getByRole('button', { name: 'Ter beoordeling indienen' }).click(); await expect(panel.getByText('Beoordeling toegevoegd aan Goedkeuringen.')).toBeVisible();
  const assessment = (await get(route)).records[0].history.at(-1);
  await post(`/api/ledger/approvals/${assessment.approvalId}/resolve?includeDashboard=false`, { status: 'approved' });
  await panel.getByRole('button', { name: 'Keuringsdekking verversen' }).click(); await expect(panel.getByText('Controleplan afgedekt', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Deelopleveringen', exact: true }).getByText('Keuringsdekking: Controleplan afgedekt', { exact: true })).toBeVisible();
  const download = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Keuringsdekking exporteren' }).click(); expect((await download).suggestedFilename()).toBe(`keuringsdekking-${job.id}.json`);
  const stamp = Date.now(), shots = {};
  await panel.scrollIntoViewIfNeeded(); shots.desktop = path.join(os.tmpdir(), `contractor-coverage-${stamp}-desktop.png`); await page.screenshot({ path: shots.desktop });
  expect((await new AxeBuilder({ page }).include('.inspection-coverage').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.evaluate(element => element.scrollIntoView({ block: 'start' }));
  const heading = await panel.getByRole('heading', { name: 'Keuringsdekking', exact: true }).boundingBox(), tabs = await page.locator('.dossier-tabs').boundingBox();
  expect(heading.y).toBeGreaterThanOrEqual(tabs.y + tabs.height);
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  shots.mobile = path.join(os.tmpdir(), `contractor-coverage-${stamp}-mobile.png`); await page.screenshot({ path: shots.mobile });
  expect((await new AxeBuilder({ page }).include('.inspection-coverage').analyze()).violations).toEqual([]);
  const phoneContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  try {
    const phone = await phoneContext.newPage(); phone.on('pageerror', error => errors.push(error.message));
    await phone.goto(base); await phone.locator('#operator-access-key').fill('browser-field-token-at-least-32-characters'); await phone.getByRole('button', { name: 'Sign in', exact: true }).click();
    await phone.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL'); const field = phone.getByTestId('field-work-pack');
    await field.getByRole('button', { name: `Open werkpakket ${title}` }).click(); await field.getByRole('tab', { name: 'Weten', exact: true }).click();
    await expect(field.getByText('Controleplan afgedekt', { exact: true })).toBeVisible(); await expect(field.getByText(/Private/)).toHaveCount(0);
    await field.getByText('Offline werkmap', { exact: true }).click(); await field.getByLabel('Offline wachtzin (minimaal 10 tekens)').fill('coverage-offline-passphrase');
    await field.getByRole('button', { name: 'Werkpakket offline bewaren' }).click(); await expect(field.getByText('Versleuteld opgeslagen voor maximaal 7 dagen.')).toBeVisible();
    await phone.goto(`${base}/field-offline.html`); await phoneContext.setOffline(true); await phone.reload();
    await phone.getByLabel('Offline wachtzin', { exact: true }).fill('coverage-offline-passphrase'); await phone.getByRole('button', { name: 'Ontgrendelen', exact: true }).click();
    await phone.getByRole('button', { name: 'Weten', exact: true }).click(); await expect(phone.getByText('Controleer de sluiting; meld afwijkingen.', { exact: true })).toBeVisible();
    await expect(phone.getByText(/Private/)).toHaveCount(0); shots.offline = path.join(os.tmpdir(), `contractor-coverage-${stamp}-offline.png`); await phone.screenshot({ path: shots.offline });
  } finally { await phoneContext.close().catch(() => {}); }
  expect(errors).toEqual([]); console.log(JSON.stringify({ inspectionCoverageScreenshots: shots }));
});
