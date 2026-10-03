const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { png } = require('../tests/image-fixtures');
test('office offers retained work, phone customer responds with photo and review updates delivery without closing the job', async ({ page, request, browser }, testInfo) => {
  test.setTimeout(120000);
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`, owner = { Authorization: 'Bearer browser-owner-token-at-least-32-characters' };
  async function post(route, data, headers = owner) { const response = await request.post(base + route, { headers, data }); expect(response.ok(), await response.text()).toBeTruthy(); return response.json(); }
  async function get(route, headers = owner) { const response = await request.get(base + route, { headers }); expect(response.ok(), await response.text()).toBeTruthy(); return response.json(); }
  const title = `Client delivery ${Date.now()}`, errors = [], shots = {}, stamp = Date.now();
  await page.addInitScript(() => {
    const readCounts = { historyTitles: 0, photoAttachments: 0 };
    window.__clientDeliveryReadCounts = readCounts;
    const fetchOriginal = window.fetch;
    window.fetch = async function (...args) {
      const response = await fetchOriginal.apply(this, args);
      const pathname = new URL(response.url).pathname;
      if (!/^\/api\/ledger\/jobs\/[^/]+\/(?:client-deliveries|conversations\/[^/]+)$/.test(pathname)) return response;
      const readJson = response.json.bind(response);
      response.json = async () => {
        const value = await readJson();
        for (const offer of value.offers || []) {
          const title = offer.title;
          Object.defineProperty(offer, 'title', { enumerable: true, get() { readCounts.historyTitles++; return title; } });
        }
        for (const message of value.messages || []) {
          const attachment = message.attachment;
          Object.defineProperty(message, 'attachment', { enumerable: true, get() { readCounts.photoAttachments++; return attachment; } });
        }
        return value;
      };
      return response;
    };
  });
  const { job } = await post('/api/ledger/intake', { title, client: { name: 'Delivery customer' }, tasks: [{ title: 'Deuren monteren' }], assignAutomatically: false });
  const contextRoute = `/api/ledger/jobs/${job.id}/work-context`, route = `/api/ledger/jobs/${job.id}/client-deliveries`, deliveryRoute = `/api/ledger/jobs/${job.id}/work-deliveries`;
  const pack = await post(contextRoute, { action: 'save_package', entryKey: 'client-delivery-package', sourceHash: (await get(contextRoute)).sourceHash,
    record: { code: 'DOOR', title: 'Deurmontage', outcome: 'Twee deuren', taskIds: [job.tasks[0].id], quantityIds: [] } });
  const baseline = await post(`/api/ledger/jobs/${job.id}/production-baselines`, { lines: [{ lineKey: 'door', costCode: 'DOOR', description: 'Deur', unit: 'st', plannedQuantity: 2, plannedLaborHours: 4 }] });
  await post(`/api/ledger/approvals/${baseline.approval.id}/resolve?includeDashboard=false`, { status: 'approved' });
  const entry = await post(`/api/ledger/jobs/${job.id}/production-entries`, { lineKey: 'door', workDate: '2026-09-01', quantity: 1, crewHours: 2, note: 'Eerste deur gemonteerd', entryKey: 'client-delivery-entry' });
  await post(deliveryRoute, { action: 'retain', entryKey: 'client-delivery-retain', sourceHash: (await get(deliveryRoute)).sourceHash,
    record: { packageId: pack.record.id, title: 'Eerste deur gemonteerd', scope: 'Alleen eerste deur; tweede deur nog niet uitgevoerd.', entryIds: [entry.entry.id], taskIds: [] } });
  const { access } = await post(`/api/ledger/jobs/${job.id}/client-portal-access`, { label: 'Opdrachtgever' });
  await post(`/api/ledger/approvals/${access.approval.id}/resolve?includeDashboard=false`, { status: 'approved' });
  const originalStatus = (await get(`/api/ledger/jobs/${job.id}`)).job.status;
  const clientHeaders = { Authorization: `Bearer ${access.portalToken}` };
  const offeredPhotoResponse = await request.post(`${base}/api/client-portal/conversation/messages`, { headers: clientHeaders,
    multipart: { entryKey: `offered-door-${stamp}`, body: 'Already shared door detail.', evidenceFile: { name: 'offered-door.png', mimeType: 'image/png', buffer: png } } });
  expect(offeredPhotoResponse.ok(), await offeredPhotoResponse.text()).toBeTruthy();
  const offeredPhoto = (await offeredPhotoResponse.json()).message;
  page.on('pageerror', error => errors.push(error.message)); await page.setViewportSize({ width: 1440, height: 1000 }); await page.goto(base);
  await page.locator('#operator-access-key').fill('browser-office-token-at-least-32-characters'); await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB'); await page.getByRole('button', { name: `Open ${title}`, exact: true }).first().click();
  const panel = page.getByRole('region', { name: 'Opleveren aan klant', exact: true });
  await panel.getByRole('button', { name: 'Aan klant aanbieden', exact: true }).click();
  await panel.getByRole('combobox', { name: 'Klanttoegang', exact: true }).selectOption(access.id);
  await panel.getByRole('checkbox', { name: 'offered-door.png', exact: true }).check();
  const photoReadsBefore = await page.evaluate(() => ({ ...window.__clientDeliveryReadCounts }));
  await panel.getByLabel('Beoogde ontvanger').pressSequentially('Beoogde klant');
  expect(await page.evaluate(() => ({ ...window.__clientDeliveryReadCounts }))).toEqual(photoReadsBefore);
  const expiry = new Date(Date.now() + 3600000); expiry.setMinutes(expiry.getMinutes() - expiry.getTimezoneOffset());
  await panel.getByLabel('Reageren tot').fill(expiry.toISOString().slice(0, 16));
  await panel.getByLabel('Te controleren bevoegdheidsgrond').fill('Private: oorspronkelijke opdracht en bevoegdheid controleren.');
  await panel.getByRole('checkbox', { name: 'Klantbeschrijving betreft uitsluitend dit uitgevoerde deel' }).check();
  await panel.getByLabel('Onderbouwing voor beoordelaar').fill('Private: uitsluitend eerste deur aan opdrachtgever aanbieden.');
  await panel.getByRole('button', { name: 'Publicatie ter beoordeling indienen' }).click(); await expect(panel.getByText('Publicatie toegevoegd aan Goedkeuringen.')).toBeVisible();
  const offered = (await get(route)).offers[0]; expect((await get('/api/client-portal/deliveries', clientHeaders)).offers).toHaveLength(0);
  const hiddenPhotoReads = [];
  page.on('request', req => { if (new URL(req.url()).pathname.endsWith(`/messages/${offeredPhoto.id}/photo`)) hiddenPhotoReads.push(req.url()); });
  await page.reload();
  await page.getByRole('button', { name: `Open ${title}`, exact: true }).first().click();
  const publication = panel.locator('details').filter({ has: page.getByText('Private: oorspronkelijke opdracht en bevoegdheid controleren.', { exact: true }) });
  await expect(publication).toHaveCount(1);
  await publication.locator('summary').scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  expect(hiddenPhotoReads).toEqual([]);
  await publication.locator('summary').click();
  await expect(publication.getByRole('img', { name: 'offered-door.png' })).toBeVisible();
  expect(hiddenPhotoReads).toHaveLength(1);
  await publication.locator('summary').click();
  await panel.getByRole('button', { name: 'Aanbod intrekken', exact: true }).click();
  const historyReadsBefore = await page.evaluate(() => ({ ...window.__clientDeliveryReadCounts }));
  expect(historyReadsBefore.historyTitles).toBeGreaterThan(0);
  await panel.getByLabel('Reden intrekken').pressSequentially('Alleen een lokaal concept, niet intrekken.');
  const historyReadsAfter = await page.evaluate(() => ({ ...window.__clientDeliveryReadCounts }));
  expect(historyReadsAfter).toEqual(historyReadsBefore);
  expect((await get(route)).offers[0].id).toBe(offered.id);
  expect((await get(route)).offers[0].state).toBe('pending');
  await panel.getByRole('button', { name: 'Annuleren', exact: true }).click();
  console.log(JSON.stringify({ retainedDeliveryTyping: { historyReadsBefore, historyReadsAfter, photoReadsBefore } }));
  const reviewerContext = await browser.newContext({ viewport: { width: 1440, height: 1000 } }), clientContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await clientContext.addInitScript(() => {
    window.__deliveryPhotoLabelReads = 0;
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const response = await originalFetch.apply(this, args);
      if (new URL(response.url).pathname !== '/api/client-portal/deliveries') return response;
      const readJson = response.json.bind(response);
      response.json = async () => {
        const value = await readJson();
        for (const offer of value.offers || []) for (const photo of [...offer.photos, ...(offer.response?.photos || [])]) {
          const filename = photo.filename;
          Object.defineProperty(photo, 'filename', { enumerable: true, get() { window.__deliveryPhotoLabelReads++; return filename; } });
        }
        return value;
      };
      return response;
    };
  });
  try {
    const reviewer = await reviewerContext.newPage(), client = await clientContext.newPage();
    reviewer.on('pageerror', error => errors.push(error.message)); client.on('pageerror', error => errors.push(error.message));
    await reviewer.goto(base); await reviewer.locator('#operator-access-key').fill('browser-owner-token-at-least-32-characters'); await reviewer.getByRole('button', { name: 'Sign in', exact: true }).click();
    await reviewer.getByLabel(/^(Language|Taal)$/).selectOption('en-GB'); await reviewer.locator('.side-nav').getByRole('button', { name: /^Approvals\b/ }).click();
    const publication = reviewer.locator('.approval-item').filter({ hasText: 'Deeloplevering voor klant publiceren: Eerste deur gemonteerd' });
    await publication.getByRole('button', { name: 'Review and approve', exact: true }).click();
    const modal = reviewer.getByTestId('approval-review-modal'); await expect(modal.getByText(/oorspronkelijke opdracht en bevoegdheid/)).toBeVisible();
    await modal.getByLabel('Reviewer reason', { exact: true }).fill('Recipient and public scope reviewed.'); await modal.getByRole('button', { name: 'Confirm approval', exact: true }).click(); await expect(modal).toBeHidden();
    await client.goto(`${base}/client-portal.html#token=${access.portalToken}`);
    const offeredPanel = client.getByRole('region', { name: 'Aangeboden werk', exact: true });
    await expect(offeredPanel.getByText('Alleen eerste deur; tweede deur nog niet uitgevoerd.')).toBeVisible();
    await expect(client.getByText(/Private:/)).toHaveCount(0);
    await expect(offeredPanel.getByRole('img', { name: 'offered-door.png', exact: true })).toBeVisible();
    const clientPhotoReadsBefore = await client.evaluate(() => window.__deliveryPhotoLabelReads), inputWrites = [];
    expect(clientPhotoReadsBefore).toBeGreaterThan(0);
    const countInputWrites = req => { if (req.method() !== 'GET' && new URL(req.url()).pathname.startsWith('/api/')) inputWrites.push(req.url()); };
    client.on('request', countInputWrites);
    await offeredPanel.getByRole('combobox', { name: 'Reactie', exact: true }).selectOption('accepted_with_reservations'); await offeredPanel.getByLabel('Uw naam').pressSequentially('Klantvertegenwoordiger');
    await offeredPanel.getByLabel('Toelichting en eventuele voorbehouden').pressSequentially('Kras bij scharnier nog herstellen.'); await offeredPanel.getByRole('checkbox').check();
    const clientPhotoReadsAfter = await client.evaluate(() => window.__deliveryPhotoLabelReads);
    expect(clientPhotoReadsAfter).toBe(clientPhotoReadsBefore); expect(inputWrites).toEqual([]);
    client.off('request', countInputWrites);
    await client.reload();
    await expect(offeredPanel.getByLabel('Uw naam')).toHaveValue('Klantvertegenwoordiger');
    await expect(offeredPanel.getByLabel('Toelichting en eventuele voorbehouden')).toHaveValue('Kras bij scharnier nog herstellen.');
    await expect(offeredPanel.getByRole('combobox', { name: 'Reactie', exact: true })).toHaveValue('accepted_with_reservations');
    await expect(offeredPanel.getByRole('checkbox')).toBeChecked();
    fs.writeFileSync(testInfo.outputPath('client-delivery-photo-typing.json'), JSON.stringify({ clientPhotoReadsBefore,
      clientPhotoReadsAfter, inputWrites: inputWrites.length, draftRecoveredAfterReload: true,
      typedCharacters: 'Klantvertegenwoordiger'.length + 'Kras bij scharnier nog herstellen.'.length }));
    await offeredPanel.getByLabel('Foto bij reactie (max. 5 MB)').setInputFiles({ name: 'deur-detail.png', mimeType: 'image/png', buffer: png });
    await offeredPanel.getByRole('button', { name: 'Reactie versturen', exact: true }).click(); await expect(offeredPanel.getByText('Reactie ter beoordeling', { exact: true })).toBeVisible();
    await expect(offeredPanel.getByText('Beantwoord', { exact: true })).toBeVisible(); await expect(offeredPanel.getByText('Reactie mogelijk', { exact: true })).toHaveCount(0);
    await expect(offeredPanel.getByRole('img', { name: 'deur-detail.png' })).toBeVisible(); expect(await offeredPanel.getByRole('img', { name: 'deur-detail.png', exact: true }).evaluate(image => image.naturalWidth > 0)).toBe(true);
    const chat = client.getByRole('region', { name: 'Klantgesprek', exact: true }); await expect(chat.getByText(/Klantvertegenwoordiger: Kras bij scharnier nog herstellen/)).toBeVisible();
    expect((await get(deliveryRoute)).records[0].response.status).toBe('not_verified');
    await reviewer.reload(); await reviewer.locator('.side-nav').getByRole('button', { name: /^Approvals\b/ }).click();
    const responseReview = reviewer.locator('.approval-item').filter({ hasText: 'Controle klantreactie: Eerste deur gemonteerd' });
    await responseReview.getByRole('button', { name: 'Review and approve', exact: true }).click();
    await expect(modal.getByText('Private: oorspronkelijke opdracht en bevoegdheid controleren.', { exact: true })).toBeVisible(); await expect(modal.getByText(/deur-detail.png/)).toBeVisible();
    await modal.getByLabel('Reviewer reason', { exact: true }).fill('Klantreactie en bevoegdheid afzonderlijk gecontroleerd.'); await modal.getByRole('button', { name: 'Confirm approval', exact: true }).click(); await expect(modal).toBeHidden();
    await offeredPanel.getByRole('button', { name: 'Aangeboden werk verversen' }).click(); await expect(offeredPanel.getByText('Reactie gecontroleerd vastgelegd', { exact: true })).toBeVisible();
    await offeredPanel.scrollIntoViewIfNeeded(); shots.mobile = path.join(os.tmpdir(), `contractor-client-delivery-${stamp}-mobile.png`); await client.screenshot({ path: shots.mobile });
    expect(await client.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect((await new AxeBuilder({ page: client }).include('.client-delivery-portal').analyze()).violations).toEqual([]);
    await client.setViewportSize({ width: 1440, height: 1000 }); await offeredPanel.scrollIntoViewIfNeeded(); shots.desktop = path.join(os.tmpdir(), `contractor-client-delivery-${stamp}-desktop.png`); await client.screenshot({ path: shots.desktop });
    await client.reload(); await expect(offeredPanel.getByText('Reactie gecontroleerd vastgelegd', { exact: true })).toBeVisible();
    await panel.getByRole('button', { name: 'Klantopleveringen verversen' }).click(); await expect(panel.getByText('Reactie gecontroleerd vastgelegd', { exact: true })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Deelopleveringen', exact: true }).getByText('Met voorbehoud geaccepteerd', { exact: true })).toBeVisible();
    const download = page.waitForEvent('download'); await panel.getByRole('button', { name: 'Klantopleveringen exporteren' }).click(); expect((await download).suggestedFilename()).toBe(`klantopleveringen-${job.id}.json`);
    await panel.scrollIntoViewIfNeeded(); shots.office = path.join(os.tmpdir(), `contractor-client-delivery-${stamp}-office.png`); await page.screenshot({ path: shots.office });
    expect((await new AxeBuilder({ page }).include('.client-deliveries').analyze()).violations).toEqual([]);
    await page.setViewportSize({ width: 390, height: 844 });
    await panel.evaluate(element => element.scrollIntoView({ block: 'start' }));
    expect(await panel.evaluate(element => element.scrollWidth <= element.clientWidth + 1)).toBe(true);
    const heading = await panel.getByRole('heading', { name: 'Opleveren aan klant', exact: true }).boundingBox(), tabs = await page.locator('.dossier-tabs').boundingBox();
    expect(heading.y).toBeGreaterThanOrEqual(tabs.y + tabs.height);
    await panel.getByRole('button', { name: 'Aanbod intrekken', exact: true }).click(); await panel.getByLabel('Reden intrekken').fill('Vervolgaanbod apart voorbereiden.');
    await panel.getByRole('button', { name: 'Aanbod intrekken bevestigen' }).click(); await expect(panel.getByText('Aanbod ingetrokken.', { exact: true })).toBeVisible();
    await offeredPanel.getByRole('button', { name: 'Aangeboden werk verversen' }).click(); await expect(offeredPanel.getByText('Aanbod ingetrokken', { exact: true })).toBeVisible();
    const final = (await get(deliveryRoute)).records[0]; expect(final.response.status).toBe('accepted_with_reservations'); expect(final.finance.status).toBe('not_linked'); expect(final.jobClosed).toBe(false);
    expect((await get(`/api/ledger/jobs/${job.id}`)).job.status).toBe(originalStatus); expect((await get(route)).offers[0].id).toBe(offered.id);
  } finally { await reviewerContext.close().catch(() => {}); await clientContext.close().catch(() => {}); }
  expect(errors).toEqual([]); console.log(JSON.stringify({ clientDeliveryScreenshots: shots }));
});
