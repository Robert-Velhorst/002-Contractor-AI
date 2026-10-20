const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs/promises');
const OWNER = { Authorization: 'Bearer browser-owner-token-at-least-32-characters' };
const { png } = require('../tests/image-fixtures');

test('client photo conversation survives reload and only releases approved office replies', async ({ page, request }, testInfo) => {
  test.setTimeout(120000);
  const runtimeErrors = [];
  const analysisRequests = [];
  const photoResponses = [];
  page.on('request', request => {
    if (/\/conversations\/[^/]+\/(analysis|whatsapp)$/.test(new URL(request.url()).pathname)) analysisRequests.push(request.headers());
  });
  page.on('response', response => {
    if (new URL(response.url()).pathname.endsWith('/photo')) {
      photoResponses.push({ status: response.status(), pathname: new URL(response.url()).pathname });
    }
  });
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const intake = await request.post(`${base}/api/ledger/intake`, { headers: OWNER, data: { title: `Chat browser ${Date.now()}`, client: { name: 'Chat client' }, assignAutomatically: false } });
  const job = (await intake.json()).job;
  const access = (await (await request.post(`${base}/api/ledger/jobs/${job.id}/client-portal-access`, { headers: OWNER, data: { label: 'Client conversation' } })).json()).access;
  expect((await request.post(`${base}/api/ledger/approvals/${access.approval.id}/resolve`, { headers: OWNER, data: { status: 'approved' } })).ok()).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${base}/client-portal.html#token=${access.portalToken}`);
  let chat = page.locator('.conversation');
  await chat.getByLabel('Bericht', { exact: true }).fill('Kan de deuropening breder worden?');
  await expect.poll(() => page.evaluate(() => Array.from({ length: sessionStorage.length }, (_, index) => {
    const key = sessionStorage.key(index)
    if (!key?.startsWith('contractor-ai:draft:v1:')) return ''
    try { return JSON.parse(sessionStorage.getItem(key)).value?.body || '' } catch { return '' }
  }).find(Boolean) || '')).toBe('Kan de deuropening breder worden?')
  await page.reload();
  chat = page.locator('.conversation');
  await expect(chat.getByText('Concept hersteld uit deze browsersessie. Foto’s moet je opnieuw toevoegen.')).toBeVisible();
  await expect(chat.locator('textarea[required]')).toHaveValue('Kan de deuropening breder worden?');
  await chat.getByLabel('Foto toevoegen (max. 5 MB)').setInputFiles({ name: 'opening.png', mimeType: 'image/png', buffer: png });
  await chat.getByRole('button', { name: 'Verstuur bericht', exact: true }).click();
  await expect(chat.getByText('Bericht ontvangen.', { exact: true })).toBeVisible();
  await expect(chat.getByRole('img', { name: 'opening.png' })).toBeVisible();
  expect(await chat.getByRole('img').evaluate(image => image.naturalWidth > 0)).toBe(true);
  const office = `/api/ledger/jobs/${job.id}/conversations/${access.id}`;
  const before = (await (await request.get(base + office, { headers: OWNER })).json()).messages;
  expect(before).toHaveLength(1);
  const reply = (await (await request.post(`${base}${office}/messages`, { headers: OWNER, data: { entryKey: 'browser-office-reply-001', body: 'We bekijken eerst de constructie.', replyTo: before[0].id } })).json()).message;
  await chat.getByRole('button', { name: 'Gesprek vernieuwen' }).click();
  await expect(chat.getByText(reply.body)).toHaveCount(0);
  await request.post(`${base}/api/ledger/approvals/${reply.approvalId}/resolve`, { headers: OWNER, data: { status: 'approved' } });
  expect((await request.post(`${base}${office}/messages/${reply.id}/publish`, { headers: OWNER, data: { sourceHash: reply.sourceHash } })).ok()).toBeTruthy();
  await chat.getByRole('button', { name: 'Gesprek vernieuwen' }).click();
  await expect(chat.getByText(reply.body)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.conversation').analyze()).violations).toEqual([]);
  await chat.screenshot({ path: testInfo.outputPath('client-chat-mobile.png') });
  await page.goto(`${base}/client-portal.html#token=${access.portalToken}`);
  await expect(chat.getByText(reply.body)).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await chat.screenshot({ path: testInfo.outputPath('client-chat-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.locator('#operator-access-key').fill('browser-owner-token-at-least-32-characters');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  const inboxEntry = page.getByRole('button', { name: new RegExp(`Chat client.*${job.title}`) });
  await expect(inboxEntry).toBeVisible();
  const officeSession = await (await page.request.get(`${base}/api/session`)).json();
  const companyHeaders = { 'X-Contractor-Company': officeSession.company.id, 'X-Contractor-Ledger': officeSession.company.ledgerId };
  const photoObservation = { sourceId: before[0].id, sha256: before[0].attachment.sha256,
    observation: 'Mogelijke kier zichtbaar rond de sparing.', uncertainty: 'Afmeting en oorzaak zijn niet uit deze foto vast te stellen.' };
  const requestFinding = { sourceId: before[0].id, quote: before[0].body, category: 'request',
    suggestion: 'Beoordeel of de opening breder kan worden.', uncertainty: 'Gewenste maat en contractimpact zijn nog niet vastgesteld.' };
  const analysisFixture = { identity: 'a'.repeat(64), current: true,
    sources: [{ id: before[0].id, body: before[0].body, direction: before[0].direction, sourceHash: before[0].sourceHash, attachment: before[0].attachment }],
    findings: [requestFinding], observations: [photoObservation], submittedPhotoCount: 1 };
  let submittedPhotoRfi;
  let submittedVariation;
  let submittedSelection;
  await page.route(`${base}${office}/analysis`, route => route.fulfill({ status: 200, headers: companyHeaders, contentType: 'application/json', body: JSON.stringify({ success: true, capability: { enabled: true, model: 'browser-fixture' }, analysis: analysisFixture }) }));
  await page.route(`${base}${office}/analysis/observations/${encodeURIComponent(before[0].id)}/rfi`, async route => {
    submittedPhotoRfi = route.request().postDataJSON();
    await route.fulfill({ status: 201, headers: companyHeaders, contentType: 'application/json', body: JSON.stringify({ success: true, rfi: { id: 'browser-photo-rfi', title: submittedPhotoRfi.title } }) });
  });
  await page.route(`${base}/api/ledger/jobs/${job.id}/change-orders`, async route => {
    submittedVariation = route.request().postDataJSON();
    await route.fulfill({ status: 201, headers: companyHeaders, contentType: 'application/json', body: JSON.stringify({ success: true,
      changeOrder: { id: 'browser-chat-variation', variationNumber: 'VAR-2026-000001', workAuthorized: false } }) });
  });
  await page.route(`${base}${office}/analysis/findings/${encodeURIComponent(before[0].id)}/client-selection`, async route => {
    submittedSelection = route.request().postDataJSON();
    await route.fulfill({ status: 201, headers: companyHeaders, contentType: 'application/json', body: JSON.stringify({ success: true,
      selection: { id: 'browser-chat-selection', title: submittedSelection.title } }) });
  });
  await inboxEntry.click();
  await expect(page.getByLabel('Opdracht voor gesprek')).toHaveValue(job.id);
  await expect(page.getByLabel('Klanttoegang')).toHaveValue(access.id);
  chat = page.locator('.conversation');
  await expect(chat.locator('.conversation-timeline').getByText(before[0].body, { exact: true })).toBeVisible();
  await chat.getByRole('button', { name: /Geladen klantberichten als bekeken markeren/ }).click();
  await expect(chat.getByText('Bekeken', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Nieuwe klantberichten' })).toHaveCount(0);
  await expect(chat.getByRole('img', { name: 'opening.png' })).toBeVisible();
  await chat.getByText('Brongekoppelde analyse').click();
  await expect(chat.getByText(/AI-waarneming, geen vastgesteld feit/)).toBeVisible();
  await chat.getByRole('button', { name: 'Als foto-RFI opvolgen' }).click();
  await expect(chat.getByRole('form', { name: 'Klantbewijs omzetten naar interne RFI' }).getByText(/Onzekerheid:/)).toBeVisible();
  await chat.getByLabel('Verantwoordelijke').fill('Uitvoerder');
  const due = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const dueAt = `${due.getFullYear()}-${String(due.getMonth() + 1).padStart(2, '0')}-${String(due.getDate()).padStart(2, '0')}T${String(due.getHours()).padStart(2, '0')}:${String(due.getMinutes()).padStart(2, '0')}`;
  await chat.getByLabel('Opvolgen voor').fill(dueAt);
  await chat.getByRole('button', { name: 'Interne RFI aanmaken' }).click();
  await expect(chat.getByText(/is aan de interne opvolging toegevoegd/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await chat.screenshot({ path: testInfo.outputPath('office-chat-mobile.png') });
  expect(submittedPhotoRfi).toMatchObject({ analysisIdentity: analysisFixture.identity, sourceId: before[0].id,
    photoSha256: photoObservation.sha256, observation: photoObservation.observation, uncertainty: photoObservation.uncertainty, responsible: 'Uitvoerder' });
  await chat.getByRole('button', { name: 'Wijzigingsconcept voorbereiden' }).click();
  await chat.getByLabel('Voorgestelde scope').fill('Verbreden van de bestaande deuropening na maatcontrole ter plaatse.');
  await chat.getByLabel('Onderbouwing kantoor').fill('De klant vraagt om een bredere deuropening.');
  await chat.getByLabel('Raming meer-/minderprijs excl. btw (€)').fill('450');
  await chat.getByLabel('Geschatte planningsimpact (kalenderdagen)').fill('1');
  await chat.getByLabel('Toelichting planningsimpact').fill('Een extra kalenderdag na controle van de draagconstructie.');
  await chat.getByLabel('Toelichting risico').fill('Draagconstructie en tijdelijke ondersteuning beoordelen.');
  await chat.getByRole('button', { name: 'Intern wijzigingsconcept aanmaken' }).click();
  await expect(chat.getByText(/wacht op interne goedkeuring/)).toBeVisible();
  expect(submittedVariation).toMatchObject({ analysisIdentity: analysisFixture.identity, sourceId: before[0].id, quote: requestFinding.quote,
    amount: 450, scheduleDeltaDays: 1, riskImpact: 'medium', scopeDelta: 'Verbreden van de bestaande deuropening na maatcontrole ter plaatse.' });
  await chat.getByRole('button', { name: 'Klantkeuze voorbereiden' }).click();
  const selectionForm = chat.getByRole('form', { name: 'Klantkeuze uit verzoek voorbereiden' });
  await selectionForm.getByLabel('Klantvraag').fill('Welke breedte wilt u voor de deuropening?');
  await selectionForm.getByLabel('Antwoordopties, één per regel').fill('Standaardbreedte\n90 centimeter');
  const decisionDue = new Date(Date.now() + 72 * 60 * 60 * 1000);
  const decisionDueAt = `${decisionDue.getFullYear()}-${String(decisionDue.getMonth() + 1).padStart(2, '0')}-${String(decisionDue.getDate()).padStart(2, '0')}`;
  await selectionForm.getByLabel('Uiterste reactiedatum').fill(decisionDueAt);
  await selectionForm.getByLabel('Reden en interne controle').fill('De bestelling wacht op bevestiging van de gewenste maat.');
  await selectionForm.getByRole('button', { name: 'Niet-zichtbaar concept ter goedkeuring indienen' }).click();
  await expect(chat.getByText(/opgeslagen als niet-zichtbaar concept en wacht op interne goedkeuring/)).toBeVisible();
  expect(submittedSelection).toMatchObject({ analysisIdentity: analysisFixture.identity, sourceId: before[0].id, quote: requestFinding.quote,
    title: 'Welke breedte wilt u voor de deuropening?', options: ['Standaardbreedte', '90 centimeter'], dueAt: decisionDueAt,
    rationale: 'De bestelling wacht op bevestiging van de gewenste maat.' });
  await chat.getByLabel('Bericht', { exact: true }).fill('Is de huidige breedte al opgemeten?');
  await chat.getByRole('button', { name: 'Conceptantwoord bewaren', exact: true }).click();
  await expect(chat.getByText('Concept opgeslagen; goedkeuring vereist.')).toBeVisible();
  await expect(chat.getByText('Is de huidige breedte al opgemeten?', { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).include('.office-conversations').analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await chat.screenshot({ path: testInfo.outputPath('office-chat-desktop.png') });
  expect(analysisRequests.length).toBeGreaterThanOrEqual(2);
  expect(photoResponses.length).toBeGreaterThanOrEqual(1);
  expect(photoResponses.every(response => response.status === 200)).toBe(true);
  for (const headers of analysisRequests) {
    expect(headers['x-contractor-company']).toBe(officeSession.company.id);
    expect(headers['x-contractor-ledger']).toBe(officeSession.company.ledgerId);
  }
  expect(runtimeErrors).toEqual([]);
});

test('encrypted field work packs reopen offline and synchronize one retained question', async ({ page, request, context }, testInfo) => {
  test.setTimeout(120000);
  const runtimeErrors = [];
  const documentAssets = [];
  page.on('pageerror', error => runtimeErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') runtimeErrors.push(message.text()); });
  page.on('request', request => {
    if (/\/assets\/offline-(drawings|work-packs)-[^/]+\.js$/.test(new URL(request.url()).pathname)) documentAssets.push(request.url());
  });
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const workerId = 'browser-field-task-worker';
  await request.post(`${base}/api/ledger/workers`, { headers: OWNER, data: { id: workerId, name: 'Offline worker', role: 'Carpenter', status: 'available' } });
  const job = (await (await request.post(`${base}/api/ledger/intake`, { headers: OWNER, data: { title: `Offline job ${Date.now()}`, client: { name: 'Client' }, tasks: [{ title: 'Install frame' }], assignAutomatically: false } })).json()).job;
  await request.post(`${base}/api/ledger/jobs/${job.id}/assignments`, { headers: OWNER, data: { workerId, status: 'assigned', role: 'Carpenter' } });
  const pdf = Buffer.from('%PDF-1.7\nOffline drawing byte verification\n%%EOF');
  const upload = await request.post(`${base}/api/ledger/upload`, { headers: { ...OWNER, 'Idempotency-Key': `offline-pdf-${Date.now()}` }, multipart: { jobId: job.id, category: 'drawing_pdf', evidenceFile: { name: 'opening.pdf', mimeType: 'application/pdf', buffer: pdf } } });
  expect(upload.ok()).toBeTruthy();
  const document = (await upload.json()).ledgerDocument;
  const revision = await request.post(`${base}/api/ledger/jobs/${job.id}/drawing-revisions`, { headers: OWNER, data: { entryKey: 'offline-browser-drawing-1', sourceDocumentId: document.id, sheetNumber: 'A-01', revision: 'A', title: 'Opening', issueDate: '2026-01-01', revisionReason: 'First issue' } });
  expect(revision.ok()).toBeTruthy();
  const drawing = (await revision.json()).drawing;
  expect((await request.post(`${base}/api/ledger/approvals/${drawing.approval.id}/resolve`, { headers: OWNER, data: { status: 'approved' } })).ok()).toBeTruthy();
  const safetyPdf = Buffer.from('%PDF-1.7\nOffline safety sheet byte verification\n%%EOF');
  const technicalPdf = Buffer.from('%PDF-1.7\nOffline technical specification byte verification\n%%EOF');
  const documents = [];
  for (const [filename, category, buffer] of [['adhesive-sds.pdf', 'sds_pdf', safetyPdf], ['frame-spec.pdf', 'drawing_pdf', technicalPdf]]) {
    const response = await request.post(`${base}/api/ledger/upload`, { headers: { ...OWNER, 'Idempotency-Key': `offline-${filename}-${Date.now()}` },
      multipart: { jobId: job.id, category, evidenceFile: { name: filename, mimeType: 'application/pdf', buffer } } });
    expect(response.ok()).toBeTruthy();
    documents.push((await response.json()).ledgerDocument);
  }
  const materialResponse = await request.post(`${base}/api/ledger/jobs/${job.id}/materials`, { headers: OWNER,
    data: { name: 'Frame adhesive', quantity: 2, unit: 'kg' } });
  expect(materialResponse.ok()).toBeTruthy();
  const material = (await materialResponse.json()).materialRequirement;
  const sheetResponse = await request.post(`${base}/api/ledger/jobs/${job.id}/sds-revisions`, { headers: OWNER, data: {
    entryKey: 'offline-browser-sds-1', material: 'Frame adhesive', manufacturer: 'Browser fixture manufacturer', productCode: 'FA-100',
    documentId: documents[0].id, linkedMaterialIds: [material.id], language: 'nl', issuedOn: '2026-01-01',
    expiresAt: new Date(Date.now() + 365 * 86400000).toISOString(), hazardClasses: ['Fixture hazard'], requiredPpe: ['Fixture PPE'],
    firstAidMeasures: 'Fixture first-aid controls.', fireMeasures: 'Fixture fire controls.', handlingStorage: 'Fixture storage controls.',
    spillResponse: 'Fixture spill controls.', disposal: 'Fixture disposal controls.', emergencyContact: 'Fixture site contact.',
    revisionReason: 'Source and controls checked for isolated offline test.'
  } });
  expect(sheetResponse.ok(), await sheetResponse.text()).toBeTruthy();
  const sheet = (await sheetResponse.json()).sdsSheet;
  expect((await request.post(`${base}/api/ledger/approvals/${sheet.approval.id}/resolve`, { headers: OWNER, data: { status: 'approved' } })).ok()).toBeTruthy();
  const submittalResponse = await request.post(`${base}/api/ledger/jobs/${job.id}/submittals`, { headers: OWNER,
    data: { title: 'Approved frame specification', status: 'approved', attachments: [documents[1].id] } });
  expect(submittalResponse.ok()).toBeTruthy();
  const submittal = (await submittalResponse.json()).submittal;
  expect((await request.post(`${base}/api/ledger/approvals/${submittal.approval.id}/resolve`, { headers: OWNER, data: { status: 'approved' } })).ok()).toBeTruthy();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.locator('#operator-access-key').fill('browser-field-token-at-least-32-characters');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  const pack = page.getByTestId('field-work-pack');
  await pack.getByRole('button', { name: `Open werkpakket ${job.title}` }).click();
  await expect(pack.getByRole('heading', { name: job.title })).toBeVisible();
  expect(documentAssets).toEqual([]);
  await pack.getByRole('tab', { name: 'Weten', exact: true }).click();
  for (const [button, filename, bytes] of [
    ['Goedgekeurd veiligheidsinformatieblad downloaden', 'adhesive-sds.pdf', safetyPdf],
    ['Goedgekeurd technisch document downloaden', 'frame-spec.pdf', technicalPdf]
  ]) {
    const downloaded = page.waitForEvent('download');
    await pack.getByRole('button', { name: button, exact: true }).click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toBe(filename);
    expect(await fs.readFile(await file.path())).toEqual(bytes);
  }
  expect(documentAssets.some(url => /\/offline-drawings-/.test(url))).toBe(true);
  expect(documentAssets.some(url => /\/offline-work-packs-/.test(url))).toBe(false);
  await pack.locator('summary', { hasText: 'Offline werkmap' }).click();
  await pack.getByLabel('Offline wachtzin (minimaal 10 tekens)').fill('Mijn sterke offline wachtzin');
  await pack.getByRole('button', { name: 'Werkpakket offline bewaren' }).click();
  await expect(pack.getByText('Versleuteld opgeslagen voor maximaal 7 dagen.')).toBeVisible({ timeout: 45000 });
  await page.goto(`${base}/field-offline.html`);
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel('Offline wachtzin', { exact: true }).fill('Mijn sterke offline wachtzin');
  await page.getByRole('button', { name: 'Ontgrendelen', exact: true }).click();
  await expect(page.getByRole('heading', { name: job.title })).toBeVisible();
  await page.getByRole('button', { name: 'Weten', exact: true }).click();
  const drawingLink = page.getByRole('link', { name: 'PDF openen: opening.pdf' });
  await expect(drawingLink).toBeVisible();
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('link', { name: 'PDF downloaden: opening.pdf' }).click();
  const offlineFile = await downloadEvent;
  expect(offlineFile.suggestedFilename()).toBe('opening.pdf');
  expect(await fs.readFile(await offlineFile.path())).toEqual(pdf);
  for (const [filename, bytes] of [['adhesive-sds.pdf', safetyPdf], ['frame-spec.pdf', technicalPdf]]) {
    await expect(page.getByRole('link', { name: `PDF openen: ${filename}` })).toBeVisible();
    const downloaded = page.waitForEvent('download');
    await page.getByRole('link', { name: `PDF downloaden: ${filename}` }).click();
    const file = await downloaded;
    expect(file.suggestedFilename()).toBe(filename);
    expect(await fs.readFile(await file.path())).toEqual(bytes);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await expect(page).toHaveTitle(/Contractor\.AI/i);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: testInfo.outputPath('field-offline-drawing-mobile.png') });
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('field-offline-documents-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('Vraag of blokkade').fill('Welke maat heeft de nieuwe opening?');
  await page.getByRole('button', { name: 'Vraag lokaal bewaren', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wachtrij (1)' })).toBeVisible();
  await page.reload();
  await page.getByLabel('Offline wachtzin', { exact: true }).fill('Mijn sterke offline wachtzin');
  await page.getByRole('button', { name: 'Ontgrendelen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wachtrij (1)' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('field-offline-mobile.png') });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await context.setOffline(false);
  await page.getByRole('button', { name: 'Synchroniseren', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Wachtrij (0)' })).toBeVisible();
  const live = (await (await request.get(`${base}/api/ledger/jobs/${job.id}/work-pack?workerId=${workerId}`, { headers: OWNER })).json()).pack;
  expect(live.questions).toHaveLength(1);
  expect(live.questions[0].message).toBe('Welke maat heeft de nieuwe opening?');
  await page.clock.install();
  await page.clock.fastForward(8 * 24 * 60 * 60 * 1000);
  await expect(page.getByText('Offline toegang verlopen. Alleen herstel van niet-verzonden reacties is nog beschikbaar.')).toBeVisible();
  await expect(page.getByRole('heading', { name: job.title })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /^PDF openen:/ })).toHaveCount(0);
  expect(runtimeErrors).toEqual([]);
});
