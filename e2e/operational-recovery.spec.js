const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { riskRegisterPayload } = require('../tests/risk-register-fixture');

test.use({ timezoneId: 'Europe/Amsterdam' });

test('office links a disruption to recovery and the worker resumes from an encrypted offline instruction', async ({ page, browser }, testInfo) => {
  test.setTimeout(150000);
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const office = { Authorization: 'Bearer browser-office-token-at-least-32-characters' };
  const title = `Herstelcasus ${Date.now()}`, errors = [];
  async function post(route, data) {
    const response = await page.request.post(base + route, { headers: office, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  }
  async function get(route) {
    const response = await page.request.get(base + route, { headers: office });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  }
  const workerId = 'browser-field-task-worker', field = { Authorization: 'Bearer browser-field-token-at-least-32-characters' };
  await post('/api/ledger/workers', { id: workerId, name: 'Dakdekker', role: 'Dakdekker', status: 'available' });
  const { job } = await post('/api/ledger/intake', { title, client: { name: 'Herstelcasus klant' },
    tasks: [{ title: 'Montage bevestigingsbeugels', assigneeId: workerId }], assignAutomatically: false });
  await post(`/api/ledger/jobs/${job.id}/assignments`, { workerId, role: 'Dakdekker', status: 'assigned' });
  const fieldPack = await page.request.get(`${base}/api/ledger/jobs/${job.id}/work-pack`, { headers: field });
  expect(fieldPack.ok(), await fieldPack.text()).toBeTruthy();
  const pack = (await fieldPack.json()).pack, taskId = pack.do[0].id;
  const blockedReport = await page.request.post(`${base}/api/ledger/jobs/${job.id}/work-pack/progress`, { headers: field, data: {
    sourceHash: pack.sourceHash, entryKey: `recovery-blocker-${Date.now()}`, taskId, status: 'blocked', progressPercent: 25,
    note: 'Twee bevestigingsbeugels ontbreken op locatie.'
  } });
  expect(blockedReport.ok(), await blockedReport.text()).toBeTruthy();
  const blockedId = (await blockedReport.json()).record.progress.id;
  await post(`/api/ledger/jobs/${job.id}/incidents`, { title: 'Veiligheidssituatie om te beoordelen', severity: 'low', status: 'reported', incidentType: 'near_miss' });
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.__recoverySourceTitleReads = 0;
    const originalFetch = window.fetch.bind(window);
    window.fetch = async (...args) => {
      const response = await originalFetch(...args);
      if (new URL(response.url).pathname.endsWith('/operational-recovery') && response.ok) {
        const originalJson = response.json.bind(response);
        response.json = async () => {
          const data = await originalJson();
          for (const item of data.cases || []) for (const source of item.sources || []) {
            const title = source.title;
            Object.defineProperty(source, 'title', { enumerable: true, configurable: true,
              get() { window.__recoverySourceTitleReads++; return title; } });
          }
          return data;
        };
      }
      return response;
    };
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.locator('#operator-access-key').fill('browser-office-token-at-least-32-characters');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  await page.getByRole('button', { name: 'Projecten', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Projecten', exact: true })).toBeVisible();
  await page.getByRole('button', { name: `${title} openen`, exact: true }).click();
  const panel = page.getByRole('region', { name: 'Operationele herstelcasussen' });
  await panel.getByRole('checkbox', { name: /Blokkade uitvoerende/ }).check();
  await panel.getByRole('button', { name: 'Herstelcasus aanmaken' }).click();
  await panel.getByLabel('Verantwoordelijke').fill('Werkvoorbereider');
  await panel.getByLabel('Opvolgen voor').fill('2030-01-02T09:00');
  await panel.getByLabel('Wat moet worden uitgezocht of voorbereid?').fill('Laat de melding beoordelen en leg de uitkomst vast.');
  await panel.getByRole('button', { name: 'Herstel vastleggen' }).click();
  await expect(panel.getByText('Herstelcasus is bijgewerkt.')).toBeVisible();
  const retained = await get(`/api/ledger/jobs/${job.id}/operational-recovery`);
  expect(retained.cases).toHaveLength(1);
  expect(retained.cases[0].sources).toHaveLength(1);
  expect(retained.cases[0].sources.some(source => source.type === 'field_progress_blocker' && source.impact.note === 'Twee bevestigingsbeugels ontbreken op locatie.')).toBe(true);
  expect(retained.cases[0].owner).toBe('Werkvoorbereider');
  expect(retained.cases[0].customerCommunication).toBe('not_sent');
  await expect(panel.getByRole('button', { name: 'Afronden met bewijs' })).toBeDisabled();
  const instructionForm = panel.getByRole('form', { name: `Bijgewerkte instructie voor taak ${taskId}` });
  const before = await page.evaluate(() => window.__recoverySourceTitleReads), typingWrites = [];
  expect(before).toBeGreaterThan(0);
  const countTypingWrites = request => {
    if (!['GET', 'HEAD'].includes(request.method()) && new URL(request.url()).pathname.startsWith('/api/')) typingWrites.push(request.url());
  };
  page.on('request', countTypingWrites);
  const instruction = 'Controleer de ontvangen beugels op locatie en hervat daarna dezelfde montage.';
  await instructionForm.getByLabel(new RegExp(`Bijgewerkte instructie voor uitvoerder ${workerId}`)).pressSequentially(instruction);
  const after = await page.evaluate(() => window.__recoverySourceTitleReads);
  expect(after).toBe(before); expect(typingWrites).toEqual([]);
  page.off('request', countTypingWrites);
  fs.writeFileSync(testInfo.outputPath('recovery-instruction-typing.json'), JSON.stringify({ before, after, typingWrites: typingWrites.length, characters: instruction.length }));
  await instructionForm.getByRole('button', { name: 'Instructie in werkpakket zetten' }).click();
  await expect(panel.getByText(/Laatste instructie voor uitvoerder/)).toBeVisible();
  const instructedPack = (await (await page.request.get(`${base}/api/ledger/jobs/${job.id}/work-pack`, { headers: field })).json()).pack;
  expect(instructedPack.know.recoveryInstructions).toHaveLength(1);
  const workerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const workerPage = await workerContext.newPage();
  const syncRequests = [];
  workerPage.on('request', request => {
    if (request.url().includes(`/jobs/${job.id}/work-pack/`)) syncRequests.push(new URL(request.url()).pathname);
  });
  await workerPage.goto(base);
  await workerPage.locator('#operator-access-key').fill('browser-field-token-at-least-32-characters');
  await workerPage.getByRole('button', { name: 'Sign in', exact: true }).click();
  await workerPage.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  const workPack = workerPage.getByTestId('field-work-pack');
  await workPack.getByRole('button', { name: `Werkpakket ${title} openen` }).click();
  await workPack.getByText('Offline werkmap', { exact: true }).click();
  await workerPage.getByLabel('Offline wachtzin (minimaal 10 tekens)').fill('test offline herstelinstructie');
  await workerPage.getByRole('button', { name: 'Werkpakket offline bewaren' }).click();
  await expect(workerPage.getByText('Versleuteld opgeslagen voor maximaal 7 dagen.')).toBeVisible();
  await workerPage.getByRole('link', { name: 'Offline werkmap openen' }).click();
  await workerPage.context().setOffline(true);
  await workerPage.getByLabel('Offline wachtzin').fill('test offline herstelinstructie');
  await workerPage.getByRole('button', { name: 'Ontgrendelen' }).click();
  await workerPage.getByRole('button', { name: 'Weten' }).click();
  const offlineInstruction = workerPage.getByRole('region', { name: 'Bijgewerkte taakinstructies' });
  await expect(offlineInstruction).toContainText('Controleer de ontvangen beugels op locatie en hervat daarna dezelfde montage.');
  await workerPage.getByLabel('Ik heb deze opgeslagen versie gelezen').check();
  await workerPage.getByRole('button', { name: 'Leesbevestiging lokaal bewaren' }).click();
  const taskSelector = workerPage.locator('label').filter({ hasText: /^Taak/ }).locator('select');
  await taskSelector.selectOption({ label: instructedPack.do[0].title });
  await workerPage.getByLabel('Voortgang (%)').fill('55');
  await workerPage.getByLabel('Voortgang en bijzonderheden').fill('De nieuwe beugels zijn gecontroleerd en de montage is hervat.');
  await workerPage.getByRole('button', { name: 'Voortgang lokaal bewaren' }).click();
  await expect(workerPage.getByRole('heading', { name: 'Wachtrij (2)' })).toBeVisible();
  await workerPage.context().setOffline(false);
  await workerPage.getByRole('button', { name: 'Synchroniseren' }).click();
  await expect(workerPage.getByText('Alle bewaarde reacties zijn ontvangen en de offline meldingen zijn bijgewerkt.')).toBeVisible();
  expect(syncRequests.filter(url => url.endsWith('/acknowledgments') || url.endsWith('/progress'))).toEqual([
    `/api/ledger/jobs/${job.id}/work-pack/acknowledgments`,
    `/api/ledger/jobs/${job.id}/work-pack/progress`
  ]);
  await workerContext.close();
  const acknowledged = await page.request.post(`${base}/api/ledger/jobs/${job.id}/work-pack/acknowledgments`, { headers: field, data: {
    sourceHash: instructedPack.sourceHash, entryKey: `recovery-read-${Date.now()}`, understood: true
  } });
  expect(acknowledged.ok(), await acknowledged.text()).toBeTruthy();
  const resumedResponse = await page.request.post(`${base}/api/ledger/jobs/${job.id}/work-pack/progress`, { headers: field, data: {
    sourceHash: instructedPack.sourceHash,
    entryKey: `recovery-resume-${Date.now()}`, taskId, status: 'in_progress', progressPercent: 55,
    note: 'De nieuwe beugels zijn gecontroleerd en de montage is hervat.'
  } });
  expect(resumedResponse.ok(), await resumedResponse.text()).toBeTruthy();
  const resumed = await resumedResponse.json();
  await panel.getByRole('button', { name: 'Herstelcasussen verversen' }).click();
  await expect(panel.getByText(/bron gewijzigd; herbeoordeling vereist/)).toBeVisible();
  await expect(panel.getByRole('button', { name: 'Afronden met bewijs' })).toHaveCount(0);
  await panel.getByLabel('Beoordeling van gewijzigde bron').fill('De uitvoerder heeft dezelfde taak na materiaalcontrole hervat.');
  await panel.getByRole('button', { name: 'Bron opnieuw beoordelen' }).click();
  await expect(panel.getByText('Herstelcasus is bijgewerkt.')).toBeVisible();
  await panel.getByRole('combobox', { name: `Hervattingsmelding voor taak ${taskId}` }).selectOption(resumed.record.progress.id);
  await panel.getByLabel('Bewijs van herstel').fill('Montage op locatie is na levering en controle hervat.');
  await panel.getByRole('button', { name: 'Afronden met bewijs' }).click();
  await expect(panel.getByText('Afgerond', { exact: false })).toBeVisible();
  const closed = await get(`/api/ledger/jobs/${job.id}/operational-recovery`);
  expect(closed.cases[0].resolutionReports).toMatchObject([{ sourceId: blockedId, taskId, workerId, status: 'in_progress' }]);
  expect((await new AxeBuilder({ page }).include('[aria-label="Operationele herstelcasussen"]').analyze()).violations).toEqual([]);
  await panel.scrollIntoViewIfNeeded();
  const desktopScreenshot = path.join(os.tmpdir(), `contractor-operational-recovery-${Date.now()}-desktop.png`);
  await page.screenshot({ path: desktopScreenshot });
  await page.setViewportSize({ width: 390, height: 844 }); await panel.scrollIntoViewIfNeeded();
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  const screenshot = path.join(os.tmpdir(), `contractor-operational-recovery-${Date.now()}.png`);
  await page.screenshot({ path: screenshot });
  expect(errors).toEqual([]); console.log(JSON.stringify({ operationalRecoveryMobileScreenshot: screenshot, operationalRecoveryDesktopScreenshot: desktopScreenshot }));
});

test('office prepares one approval-gated worker replacement plan across affected jobs', async ({ page }) => {
  test.setTimeout(90000);
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const office = { Authorization: 'Bearer browser-office-token-at-least-32-characters' };
  async function post(route, data) {
    const response = await page.request.post(base + route, { headers: office, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  }
  const title = `Gecoördineerde uitval ${Date.now()}`;
  const worker = await post('/api/ledger/workers', { name: 'Uitvaller', role: 'Dakdekker', status: 'available' });
  const replacement = await post('/api/ledger/workers', { name: 'Beschikbare vervanger', role: 'Dakdekker', status: 'available' });
  const start = new Date(Date.now() + 12 * 86_400_000), firstEnd = new Date(start.getTime() + 2 * 3_600_000);
  const secondStart = new Date(start.getTime() + 4 * 3_600_000), secondEnd = new Date(secondStart.getTime() + 2 * 3_600_000);
  const first = await post('/api/ledger/intake', { title: `${title} A`, client: { name: 'Herstelklant A' }, status: 'scheduled', assignAutomatically: false,
    scheduledStart: start.toISOString(), scheduledEnd: firstEnd.toISOString() });
  const second = await post('/api/ledger/intake', { title: `${title} B`, client: { name: 'Herstelklant B' }, status: 'scheduled', assignAutomatically: false,
    scheduledStart: secondStart.toISOString(), scheduledEnd: secondEnd.toISOString() });
  await post(`/api/ledger/jobs/${first.job.id}/assignments`, { workerId: worker.worker.id, role: 'Dakdekker', status: 'planned', scheduledStart: start.toISOString(), scheduledEnd: firstEnd.toISOString() });
  await post(`/api/ledger/jobs/${second.job.id}/assignments`, { workerId: worker.worker.id, role: 'Dakdekker', status: 'planned', scheduledStart: secondStart.toISOString(), scheduledEnd: secondEnd.toISOString() });
  await post(`/api/ledger/workers/${worker.worker.id}/availability`, { periodType: 'leave', title: 'Niet beschikbaar', startsAt: start.toISOString(), endsAt: secondEnd.toISOString() });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.locator('#operator-access-key').fill('browser-office-token-at-least-32-characters');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  await page.getByRole('button', { name: 'Projecten', exact: true }).click();
  await page.getByRole('button', { name: `${title} A openen`, exact: true }).click();
  const panel = page.getByRole('region', { name: 'Operationele herstelcasussen' });
  await panel.getByRole('checkbox', { name: /Beschikbaarheid uitvoerder/ }).check();
  await panel.getByRole('button', { name: 'Herstelcasus aanmaken' }).click();
  await panel.getByLabel('Verantwoordelijke').fill('Planner');
  await panel.getByLabel('Opvolgen voor').fill('2030-01-02T09:00');
  await panel.getByLabel('Wat moet worden uitgezocht of voorbereid?').fill('Vervang de uitvoerder op beide opdrachten en laat dit onafhankelijk goedkeuren.');
  await panel.getByRole('button', { name: 'Herstel vastleggen' }).click();
  await panel.getByRole('combobox', { name: `Vervanger voor ${title} A` }).selectOption(replacement.worker.id);
  await panel.getByRole('combobox', { name: `Vervanger voor ${title} B` }).selectOption(replacement.worker.id);
  await panel.getByRole('button', { name: /Alle 2 opdracht\(en\)/ }).click();
  await expect(panel.getByText(/Vervangingsplan wacht op goedkeuring/)).toBeVisible();
  const approvals = await page.request.get(`${base}/api/ledger/approvals`, { headers: office });
  expect(approvals.ok(), await approvals.text()).toBeTruthy();
  const approvalPayload = await approvals.json();
  const approvalList = approvalPayload.approvals || approvalPayload.items || [];
  expect(approvalList.some(item => item.targetType === 'assignment_replacement_plan' && item.status === 'pending')).toBe(true);
});

test('office records a supplier response without sending a message or changing the purchase date', async ({ page }) => {
  test.setTimeout(90000);
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const office = { Authorization: 'Bearer browser-office-token-at-least-32-characters' };
  const owner = { Authorization: 'Bearer browser-owner-token-at-least-32-characters' };
  const capabilityFailures = [];
  page.on('response', response => {
    if (new URL(response.url()).pathname === '/api/operations/capabilities' && response.status() >= 400) capabilityFailures.push(response.status());
  });
  const title = `Leverancierherstel ${Date.now()}`;
  async function post(route, data, headers = office) {
    const response = await page.request.post(base + route, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  }
  async function get(route) {
    const response = await page.request.get(base + route, { headers: office });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  }
  const profile = await page.request.put(`${base}/api/ledger/organization`, { headers: owner, data: {
    legalName: 'Leverancierherstel Aannemer B.V.', registrationNumber: '12345678', vatNumber: 'NL123456789B01',
    email: 'leverancierherstel@contractor.example', address: 'Ledgerstraat 10', postalCode: '3511 AA', city: 'Utrecht', country: 'NL',
    iban: 'NL91ABNA0417164300', bic: 'ABNANL2A', defaultPaymentTermsDays: 30, defaultQuoteValidityDays: 30
  } });
  expect(profile.ok(), await profile.text()).toBeTruthy();
  const suffix = Date.now();
  const { job } = await post('/api/ledger/intake', { title, client: { name: 'Leverancierherstel klant' }, assignAutomatically: false });
  const material = (await post(`/api/ledger/jobs/${job.id}/materials`, { name: 'Dakrollen', quantity: 4, unit: 'rollen', status: 'needed' })).materialRequirement;
  const task = (await post(`/api/ledger/jobs/${job.id}/tasks`, { title: 'Dakrollen verwerken', durationHours: 4, materialRequirementIds: [material.id] })).task;
  const requiredBy = '2030-01-08T09:00:00.000Z';
  const partner = (await post('/api/ledger/trade-partners', { name: `Dakmaterialen ${suffix} B.V.`, partnerType: 'supplier', contactName: 'Planning',
    email: `dakmaterialen-${suffix}@supplier.example`, phone: '+31 10 555 12 34', address: 'Supplierstraat 20', city: 'Rotterdam', country: 'NL',
    registrationNumber: '88776655', vatNumber: 'NL987654321B01', verificationReference: `SUPPLIER-${suffix}`, verifiedAt: new Date(Date.now() - 86_400_000).toISOString() })).partner;
  const order = (await post(`/api/ledger/jobs/${job.id}/purchase-orders`, { status: 'ready_to_order', requiresApproval: true, tradePartnerId: partner.id,
    supplier: partner.name, amount: 400, currency: 'EUR', approvalThreshold: 10000, requiredBy,
    items: [{ lineKey: 'roofing', materialRequirementId: material.id, name: 'Dakrollen', quantity: 4, unit: 'rollen', unitCost: 100 }] })).purchaseOrder;
  await post(`/api/ledger/approvals/${order.approval.id}/resolve`, { status: 'approved', resolvedBy: 'E2E owner', reason: 'Supplier, lines and amount verified.' }, owner);
  const issuePackage = await post(`/api/ledger/jobs/${job.id}/purchase-orders/${order.id}/issue-package`, {}, owner);
  await post(`/api/ledger/approvals/${issuePackage.approval.id}/resolve`, { status: 'approved', resolvedBy: 'E2E owner', reason: 'Issue package verified.' }, owner);
  await post(`/api/ledger/communications/${issuePackage.communication.id}/delivery-receipt`, { integration: 'playwright_test_provider',
    providerMessageId: `supplier-recovery-order-${suffix}`, receipt: { status: 'accepted' } }, owner);
  const receipt = await post(`/api/ledger/jobs/${job.id}/material-receipts`, { purchaseOrderId: order.id, receiptReference: `LEV-${Date.now()}`,
    evidenceReference: 'pakbon:deelzending', receivedBy: 'Uitvoerder', deliveredAt: new Date().toISOString(), finalDelivery: true,
    entryKey: `supplier-e2e-${Date.now()}`, lines: [{ lineKey: 'roofing', materialRequirementId: material.id, itemName: 'Dakrollen', unit: 'rollen',
      receivedQuantity: 2, acceptedQuantity: 2 }] });
  const route = `/api/ledger/jobs/${job.id}/operational-recovery`;
  const planStart = '2030-01-01T09:00:00.000Z';
  const initial = await get(route), source = initial.sources.find(item => item.id === receipt.receipt.id);
  expect(source.impact.materialLines.some(line => line.shortfallQuantity === 2)).toBe(true);
  expect(source.impact.purchaseOrder).toMatchObject({ id: order.id, orderIssued: true, externalCommitments: 1 });
  const communicationsBefore = (await get(`/api/ledger/jobs/${job.id}`)).job.communications.length;
  const blockedPlan = await post(`/api/ledger/jobs/${job.id}/work-plan/calculate`, { plannedStart: planStart });
  expect(blockedPlan.plan.ready).toBe(false);
  expect(blockedPlan.plan.materialBlockers.some(item => item.taskId === task.id && item.reason === 'expected_availability_unknown')).toBe(true);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.locator('#operator-access-key').fill('browser-office-token-at-least-32-characters');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  await page.getByRole('button', { name: 'Projecten', exact: true }).click();
  await page.getByRole('button', { name: `${title} openen`, exact: true }).click();
  const panel = page.getByRole('region', { name: 'Operationele herstelcasussen' });
  await panel.getByRole('checkbox', { name: /Materiaaltekort of leveringsafwijking/ }).check();
  await panel.getByRole('button', { name: 'Herstelcasus aanmaken' }).click();
  await panel.getByLabel('Verantwoordelijke').fill('Werkvoorbereider');
  await panel.getByLabel('Opvolgen voor').fill('2030-01-02T09:00');
  await panel.getByLabel('Wat moet worden uitgezocht of voorbereid?').fill('Vraag ontbrekende dakrollen en leverdatum na.');
  await panel.getByRole('button', { name: 'Herstel vastleggen' }).click();
  await expect(panel.getByText('Herstelcasus is bijgewerkt.')).toBeVisible();
  await panel.getByText('Leverancierscontact registreren', { exact: true }).click();
  await panel.getByRole('combobox', { name: 'Uitkomst' }).selectOption('delivery_date_confirmed');
  await panel.getByLabel('Wat is besproken of bevestigd?').fill('Leverancier bevestigt de nalevering van twee rollen.');
  await panel.getByLabel('Door leverancier genoemde leverdatum').fill('2030-01-12T10:30');
  await panel.getByLabel(/Bewijsreferentie/).fill('e-mail:bevestiging-2026-09-24');
  await panel.getByLabel('Gebruik deze datum in de materiaalprognose voor deze gekoppelde behoefte').check();
  const dossierRefresh = page.waitForResponse(response => response.request().method() === 'GET'
    && new URL(response.url()).pathname === `/api/ledger/jobs/${job.id}`);
  await panel.getByRole('button', { name: 'Opvolging vastleggen' }).click();
  expect((await dossierRefresh).ok()).toBe(true);
  const workPlan = page.getByTestId('job-task-control');
  const taskRow = page.getByTestId(`job-task-${task.id}`);
  const expectedTaskWindow = await page.evaluate(() => new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam'
  }).format(new Date('2030-01-12T09:30:00.000Z')));
  await expect(taskRow.locator('.work-plan-window')).toContainText(expectedTaskWindow);
  const baselineResponse = page.waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname === `/api/ledger/jobs/${job.id}/schedule-baselines`);
  await workPlan.getByTestId('request-work-plan-baseline').click();
  const baselineResult = await (await baselineResponse).json();
  expect(baselineResult.baseline.status).toBe('pending_approval');
  expect(baselineResult.approval).toMatchObject({ status: 'pending', targetType: 'schedule_baseline' });
  expect(baselineResult.baseline.snapshot.tasks.find(item => item.id === task.id).plannedStart)
    .toBe(await page.evaluate(() => new Date('2030-01-12T10:30').toISOString()));

  const retained = await get(route), recoveryCase = retained.cases[0];
  expect(recoveryCase.supplierFollowUps).toHaveLength(1);
  expect(recoveryCase.supplierFollowUps[0]).toMatchObject({ purchaseOrderId: order.id, supplier: partner.name, status: 'delivery_date_confirmed',
    expectedAt: await page.evaluate(() => new Date('2030-01-12T10:30').toISOString()), evidenceReference: 'e-mail:bevestiging-2026-09-24', appliedToMaterialAvailability: true });
  expect(recoveryCase.sourceCurrent).toBe(false);
  expect(recoveryCase.sources[0].impact.purchaseOrder.requiredBy).toBe(requiredBy);
  const refreshedPlan = await post(`/api/ledger/jobs/${job.id}/work-plan/calculate`, { plannedStart: planStart });
  expect(refreshedPlan.plan.ready).toBe(true);
  expect(refreshedPlan.plan.materialConstraints[0].expectedAvailableAt).toBe(await page.evaluate(() => new Date('2030-01-12T10:30').toISOString()));
  expect(refreshedPlan.plan.tasks.find(item => item.id === task.id).plannedStart).toBe(await page.evaluate(() => new Date('2030-01-12T10:30').toISOString()));
  const detail = (await get(`/api/ledger/jobs/${job.id}`)).job;
  expect(detail.scheduleControl.pendingBaseline.id).toBe(baselineResult.baseline.id);
  expect(detail.materials.find(item => item.id === material.id).data).toMatchObject({
    expectedAvailableAt: await page.evaluate(() => new Date('2030-01-12T10:30').toISOString()), expectedAvailableAtReference: 'e-mail:bevestiging-2026-09-24'
  });
  expect(detail.purchaseOrders.find(item => item.id === order.id).requiredBy).toBe(requiredBy);
  expect(detail.communications).toHaveLength(communicationsBefore);
  await panel.getByRole('button', { name: 'Bekijk herstelplanning' }).click();
  await expect(page.getByTestId('resource-plan-preview')).toBeVisible();
  expect(capabilityFailures).toEqual([]);
});

test('office reviews an approved client appointment linked to an absent worker', async ({ page }) => {
  test.setTimeout(90000);
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const office = { Authorization: 'Bearer browser-office-token-at-least-32-characters' };
  const owner = { Authorization: 'Bearer browser-owner-token-at-least-32-characters' };
  const title = `Klantafspraak uitval ${Date.now()}`;
  async function post(route, data, headers = office) {
    const response = await page.request.post(base + route, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  }
  async function get(route) {
    const response = await page.request.get(base + route, { headers: office });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  }
  const worker = (await post('/api/ledger/workers', { name: 'Klantafspraak uitvoerder', role: 'Dakdekker', status: 'available' })).worker;
  const start = new Date(Date.now() + 12 * 86_400_000), end = new Date(start.getTime() + 4 * 3_600_000);
  const { job } = await post('/api/ledger/intake', { title, client: { name: 'Klant met bevestigde afspraak' }, status: 'scheduled',
    scheduledStart: start.toISOString(), scheduledEnd: end.toISOString(), assignAutomatically: false });
  await post(`/api/ledger/jobs/${job.id}/assignments`, { workerId: worker.id, role: 'Dakdekker', status: 'planned',
    scheduledStart: start.toISOString(), scheduledEnd: end.toISOString() });
  await post(`/api/ledger/workers/${worker.id}/availability`, { periodType: 'leave', title: 'Niet beschikbaar', startsAt: start.toISOString(), endsAt: end.toISOString() });
  const scheduledAt = new Date(start.getTime() + 60 * 60_000).toISOString();
  const access = (await post(`/api/ledger/jobs/${job.id}/client-portal-access`, { label: 'Afspraakherstel klantgesprek' }, owner)).access;
  await post(`/api/ledger/approvals/${access.approval.id}/resolve`, { status: 'approved', reason: 'Klantgesprek activeren voor de afspraak.' }, owner);
  const clientMessageResponse = await page.request.post(`${base}/api/client-portal/conversation/messages`, {
    headers: { Authorization: `Bearer ${access.portalToken}` }, data: { entryKey: `appointment-impact-message-${Date.now()}`, body: 'Dinsdag past voor mij; laat weten wie langskomt.' }
  });
  expect(clientMessageResponse.ok(), await clientMessageResponse.text()).toBeTruthy();
  const clientMessage = (await clientMessageResponse.json()).message;
  const visit = (await post(`/api/ledger/jobs/${job.id}/site-visits`, { visitType: 'site_survey', status: 'confirmed', scheduledAt, assignee: worker.name })).siteVisit;
  expect(visit.status).toBe('pending_approval');
  const approval = await post(`/api/ledger/approvals/${visit.approvalId}/resolve`, { status: 'approved', reason: 'Afspraak met de klant bevestigd.' }, owner);
  expect(approval.approval.status).toBe('approved');
  const route = `/api/ledger/jobs/${job.id}/operational-recovery`;
  const view = await get(route), source = view.sources.find(item => item.type === 'worker_availability');
  expect(source.impact.clientAppointments.map(item => item.id)).toContain(visit.id);

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.locator('#operator-access-key').fill('browser-office-token-at-least-32-characters');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  await page.getByRole('button', { name: 'Projecten', exact: true }).click();
  await page.getByRole('button', { name: `${title} openen`, exact: true }).click();
  const panel = page.getByRole('region', { name: 'Operationele herstelcasussen' });
  await panel.getByRole('checkbox', { name: /Beschikbaarheid uitvoerder/ }).check();
  await panel.getByRole('button', { name: 'Herstelcasus aanmaken' }).click();
  await panel.getByLabel('Verantwoordelijke').fill('Planner');
  await panel.getByLabel('Opvolgen voor').fill('2030-01-14T09:00');
  await panel.getByLabel('Wat moet worden uitgezocht of voorbereid?').fill('Beoordeel de goedgekeurde klantafspraak en stem de gevolgen af.');
  await panel.getByRole('button', { name: 'Herstel vastleggen' }).click();
  await expect(panel.getByText('Herstelcasus is bijgewerkt.')).toBeVisible();
  await expect(panel.getByText('Bevestigde klantafspraken tijdens afwezigheid')).toBeVisible();
  await panel.getByText('Klantimpact beoordelen', { exact: true }).click();
  await panel.getByLabel('Beoordeling klantimpact').selectOption('awaiting_customer');
  await panel.getByLabel('Wat is afgesproken of moet worden opgevolgd?').fill('Klant is benaderd; reactie afwachten voordat een nieuw tijdstip wordt afgesproken.');
  await panel.getByLabel('Opnieuw controleren op klantreactie').fill('2030-01-15T09:00');
  await panel.getByLabel(/Kies het klantbericht dat deze beoordeling onderbouwt/).selectOption(clientMessage.id);
  await panel.getByRole('button', { name: 'Klantimpact vastleggen' }).click();
  await expect(panel.getByText('Klantimpact vastgelegd; geen bericht verstuurd of afspraak gewijzigd.')).toBeVisible();

  const retained = await get(route);
  expect(retained.cases[0].clientImpactReviews).toHaveLength(1);
  expect(retained.cases[0].clientImpactReviews[0]).toMatchObject({ status: 'awaiting_customer', messageEvidence: { excerpt: 'Dinsdag past voor mij; laat weten wie langskomt.' },
    appointment: { id: visit.id, approvalId: visit.approvalId, scheduledAt } });
  expect(retained.externalCommitments).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await panel.scrollIntoViewIfNeeded();
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).include('[aria-label="Operationele herstelcasussen"]').analyze()).violations).toEqual([]);
});

test('office closes a combined absence, material, contract-date and cost case from the job dashboard', async ({ page }) => {
  test.setTimeout(150000);
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const office = { Authorization: 'Bearer browser-office-token-at-least-32-characters' };
  const owner = { Authorization: 'Bearer browser-owner-token-at-least-32-characters' };
  const suffix = Date.now(), title = `Gecombineerd herstel ${suffix}`;
  async function post(route, data, headers = office) {
    const response = await page.request.post(base + route, { headers, data });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  }
  async function get(route) {
    const response = await page.request.get(base + route, { headers: office });
    expect(response.ok(), await response.text()).toBeTruthy(); return response.json();
  }

  const startsAt = new Date(Date.now() + 12 * 86_400_000);
  startsAt.setUTCHours(8, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 4 * 3_600_000);
  const { job } = await post('/api/ledger/intake', { title, status: 'scheduled', scheduledStart: startsAt.toISOString(),
    scheduledEnd: endsAt.toISOString(), targetCompletion: '2030-03-31', client: { name: 'Gecombineerd herstel klant' }, assignAutomatically: false });
  const original = (await post('/api/ledger/workers', { id: `combined-absence-${suffix}`, name: `Dakdekker ${suffix}`, role: 'Dakdekker', status: 'available' })).worker;
  const replacement = (await post('/api/ledger/workers', { id: `combined-replacement-${suffix}`, name: `Vervanger ${suffix}`, role: 'Dakdekker', status: 'available' })).worker;
  const assignment = (await post(`/api/ledger/jobs/${job.id}/assignments`, { workerId: original.id, role: 'Dakdekker', status: 'assigned',
    scheduledStart: startsAt.toISOString(), scheduledEnd: endsAt.toISOString() })).assignment;
  const absence = (await post(`/api/ledger/workers/${original.id}/availability`, { periodType: 'leave', title: 'Niet beschikbaar',
    startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() })).period;
  const material = (await post(`/api/ledger/jobs/${job.id}/materials`, { name: 'Dakrollen', quantity: 4, unit: 'rollen', status: 'needed' })).materialRequirement;
  const firstReceipt = (await post(`/api/ledger/jobs/${job.id}/material-receipts`, { receiptReference: `DEEL-${suffix}`, evidenceReference: `pakbon:DEEL-${suffix}`,
    deliveredAt: new Date().toISOString(), receivedBy: original.name, finalDelivery: true, entryKey: `combined-first-receipt-${suffix}`,
    lines: [{ lineKey: 'roof', materialRequirementId: material.id, itemName: material.name, unit: 'rollen', orderedQuantity: 4, receivedQuantity: 2, acceptedQuantity: 2 }] })).receipt;

  const scopeResult = await post(`/api/ledger/jobs/${job.id}/commercial-scope/revisions`, { entryKey: `combined-scope-${suffix}`,
    title: 'Dakrenovatie', scopeSummary: 'De overeengekomen dakrenovatie op basis van de opname.', inclusions: ['Dakbedekking vervangen.'],
    assumptions: ['Toegang tot het dak is beschikbaar.'], exclusions: ['Onvoorzien houtrot.'], clientResponsibilities: ['Toegang verzorgen.'],
    contractorResponsibilities: ['Werk uitvoeren en opleveren.'], allowanceMode: 'none', noAllowanceReason: 'Geen stelposten.', reason: 'Gecombineerde herstelbrowserproef.' });
  await post(`/api/ledger/approvals/${scopeResult.approval.id}/resolve`, { status: 'approved', reason: 'Scope geverifieerd.' }, owner);
  const riskResult = await post(`/api/ledger/jobs/${job.id}/risk-register/revisions`, riskRegisterPayload(`combined-risk-${suffix}`, scopeResult.revision.id));
  await post(`/api/ledger/approvals/${riskResult.approval.id}/resolve`, { status: 'approved', reason: 'Risicoverantwoordelijkheid beoordeeld.' }, owner);
  const quoteResult = await post(`/api/ledger/jobs/${job.id}/quote`, { commercialScopeRevisionId: scopeResult.revision.id,
    lineItems: [{ description: 'Dakrenovatie', quantity: 1, unitPrice: 5000 }] });
  await post(`/api/ledger/approvals/${quoteResult.quote.approvalId}/resolve`, { status: 'approved', reason: 'Offerte gecontroleerd.' }, owner);
  const acceptance = await post(`/api/ledger/jobs/${job.id}/quotes/${quoteResult.quote.id}/acceptance`,
    { acceptedAt: '2026-09-24', evidenceReference: `getekende-offerte-${suffix}` });
  await post(`/api/ledger/approvals/${acceptance.approval.id}/resolve`, { status: 'approved', reason: 'Acceptatiebewijs gecontroleerd.' }, owner);
  let dateView = await get(`/api/ledger/jobs/${job.id}/client-date-commitments`);
  const acceptedSource = dateView.acceptedSources[0];
  await post(`/api/ledger/jobs/${job.id}/client-date-commitments`, { action: 'record', commandKey: `combined-date-${suffix}`, entryKey: 'dak-gereed',
    sourceType: acceptedSource.type, sourceId: acceptedSource.id, acceptedSourceHash: acceptedSource.sourceHash, sourceHash: dateView.sourceHash,
    dateKind: 'complete_by', date: '2030-04-30', label: 'Dakwerk gereed', contractWording: 'Het dakwerk is uiterlijk 30 april 2030 gereed.',
    evidenceReference: `getekende-offerte-${suffix}, bepaling 4` });
  const expense = await post(`/api/ledger/jobs/${job.id}/expense-receipts`, { entryKey: `combined-expense-${suffix}`, expenseDate: new Date().toISOString().slice(0, 10),
    workerId: original.id, workerName: original.name, category: 'materials', vendor: 'Bouwmarkt', receiptReference: `BON-${suffix}`,
    totalAmount: 121, taxAmount: 21, taxTreatment: 'recoverable', paymentMethod: 'company_card', costCode: 'REC-MAT-01', currency: 'EUR' });
  await post(`/api/ledger/approvals/${expense.approval.id}/resolve`, { status: 'approved', reason: 'Bon en projecttoewijzing gecontroleerd.' }, owner);

  let view = await get(`/api/ledger/jobs/${job.id}/operational-recovery`);
  const availabilitySource = view.sources.find(source => source.type === 'worker_availability' && source.id === absence.id);
  const materialSource = view.sources.find(source => source.type === 'material_receipt' && source.id === firstReceipt.id);
  const created = await post(`/api/ledger/jobs/${job.id}/operational-recovery`, { action: 'create', entryKey: `combined-case-${suffix}`,
    sourceHash: view.sourceHash, sources: [{ type: availabilitySource.type, id: absence.id }, { type: materialSource.type, id: firstReceipt.id }],
    owner: 'Werkvoorbereider', dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString(), actionType: 'resequence_work',
    recoveryAction: 'Herstel personeelsdekking, materiaalbeschikbaarheid, klantdatum en kosten.' });
  const replacementRequest = await post(`/api/ledger/jobs/${job.id}/assignments/${assignment.id}/replacement`, { workerId: replacement.id,
    availabilityPeriodId: absence.id, reason: 'Goedgekeurde vervangende dekking voor de afwezige uitvoerder.' });
  await post(`/api/ledger/approvals/${replacementRequest.approval.id}/resolve`, { status: 'approved', reason: 'Rol, beschikbaarheid en dekking onafhankelijk gecontroleerd.' }, owner);
  await post(`/api/ledger/jobs/${job.id}/material-receipts`, { receiptReference: `AANVULLING-${suffix}`, evidenceReference: `pakbon:AANVULLING-${suffix}`,
    deliveredAt: new Date().toISOString(), receivedBy: replacement.name, entryKey: `combined-second-receipt-${suffix}`,
    lines: [{ lineKey: 'roof', materialRequirementId: material.id, itemName: material.name, unit: 'rollen', orderedQuantity: 4, receivedQuantity: 2, acceptedQuantity: 2 }] });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(base);
  await page.locator('#operator-access-key').fill('browser-office-token-at-least-32-characters');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  await page.getByRole('button', { name: 'Projecten', exact: true }).click();
  await page.getByRole('button', { name: `${title} openen`, exact: true }).click();
  const panel = page.getByRole('region', { name: 'Operationele herstelcasussen' });
  await expect(panel.getByText(/bron gewijzigd; herbeoordeling vereist/)).toBeVisible();
  await panel.getByLabel('Beoordeling van gewijzigde bron').fill('Vervanger is goedgekeurd en alle dakrollen zijn ontvangen en geaccepteerd.');
  await panel.getByRole('button', { name: 'Bron opnieuw beoordelen' }).click();
  await expect(panel.getByText('De verstoringen zijn gewijzigd. Ververs en beoordeel opnieuw.')).toHaveCount(0);
  await expect(panel.getByText(/Contractuele mijlpaal .* mist een actuele beoordeling zonder open risico/)).toBeVisible();

  await panel.getByText('Contractimpact beoordelen', { exact: true }).click();
  await panel.getByLabel('Beoordeling contractimpact').selectOption('not_impacted');
  await panel.getByLabel('Waarom is deze mijlpaal wel of niet geraakt?').fill('Vervangende dekking en geaccepteerde nalevering passen binnen de overeengekomen termijn.');
  await panel.getByRole('button', { name: 'Contractimpact vastleggen' }).click();
  await expect(panel.getByText('Contractimpact is vastgelegd. De contractdatum en klantcommunicatie zijn ongewijzigd.')).toBeVisible();

  await panel.getByText('Goedgekeurde werkelijke kosten toerekenen', { exact: true }).click();
  await panel.getByLabel('Kostenpost voor toerekening').selectOption(`expense:${expense.expense.id}`);
  await panel.getByLabel('Toegerekend bedrag').fill('60');
  await panel.getByLabel('Reden van toerekening').fill('Aantoonbaar deel van de extra herstelmaterialen.');
  await panel.getByRole('button', { name: 'Werkelijke kosten toerekenen' }).click();
  await expect(panel.getByText(/€\s?60,00/).first()).toBeVisible();
  await panel.getByText('Kostenimpact beoordelen', { exact: true }).click();
  await panel.getByLabel('Indicatieve raming in euro').fill('60');
  await panel.getByLabel('Onderbouwing').fill('Herstelkosten voorlopig op basis van de goedgekeurde bon beoordeeld.');
  await panel.getByLabel('Bewijsbron kostenimpact').fill(`bon:${expense.expense.receiptReference}`);
  await panel.getByRole('button', { name: 'Kostenimpact vastleggen' }).click();
  await expect(panel.getByText('Kostenimpact is vastgelegd als interne beoordeling; er is niets geboekt of toegezegd.')).toBeVisible();

  await panel.getByLabel('Bewijs van herstel').fill('Vervanger actief, nalevering geaccepteerd, klantdatum beoordeeld en kosten aan de goedgekeurde bon gekoppeld.');
  const closeResponsePromise = page.waitForResponse(response => response.request().method() === 'POST'
    && new URL(response.url()).pathname === `/api/ledger/jobs/${job.id}/operational-recovery`
    && response.request().postDataJSON()?.action === 'update'
    && response.request().postDataJSON()?.status === 'resolved');
  await panel.getByRole('button', { name: 'Afronden met bewijs' }).click();
  const closeResponse = await closeResponsePromise;
  expect(closeResponse.status()).toBe(201);
  await expect(panel.getByText('Herstelcasus is bijgewerkt.')).toBeVisible();
  view = await get(`/api/ledger/jobs/${job.id}/operational-recovery`);
  const retained = view.cases.find(item => item.id === created.caseId);
  expect(retained).toMatchObject({ status: 'resolved', sourceCurrent: true, externalCommitments: 0 });
  expect(retained.clientDateImpactReviews[0]).toMatchObject({ status: 'not_impacted', current: true });
  expect(retained.actualCostAttributions[0]).toMatchObject({ amountCents: 6000, sourceCurrent: true });
  expect(retained.costImpactReviews[0]).toMatchObject({ status: 'estimate', amountCents: 6000, current: true });
  expect(retained.resolutionReview.checkedBy).toBe('role:office_operator');
  expect(retained.resolutionReview.sources.every(source => source.materialShortfalls.length === 0)).toBe(true);
  expect((await get(`/api/ledger/jobs/${job.id}`)).job.targetCompletion).toBe('2030-03-31');
  expect(view.externalCommitments).toBe(0);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).include('[aria-label="Operationele herstelcasussen"]').analyze()).violations).toEqual([]);
});
