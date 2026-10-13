const { test, expect } = require('@playwright/test');
const { jpegFixture } = require('../tests/image-fixtures');

test('mobile offline folders retain separate company queues and refuse a wrong-company sync', async ({ page, context }, testInfo) => {
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const owner = { Authorization: 'Bearer browser-owner-token-at-least-32-characters' };
  await page.request.post(`${base}/api/ledger/workers`, { headers: owner, data: { id: 'browser-field-task-worker', name: 'Shared test worker', role: 'Carpenter', status: 'available' } });
  const intake = await page.request.post(`${base}/api/ledger/intake`, { headers: owner, data: {
    title: 'Company A private work', client: { name: 'Private client' }, address: 'Private job address', assignAutomatically: false,
    tasks: [{ title: 'Check opening dimensions', assigneeId: 'browser-field-task-worker' }]
  } });
  expect(intake.ok()).toBeTruthy();
  const job = (await intake.json()).job;
  const assignmentResponse = await page.request.post(`${base}/api/ledger/jobs/${job.id}/assignments`, { headers: owner, data: { workerId: 'browser-field-task-worker', role: 'Carpenter', status: 'assigned' } });
  expect(assignmentResponse.ok()).toBeTruthy();
  const assignment = (await assignmentResponse.json()).assignment;
  const stockCount = await page.request.post(`${base}/api/ledger/material-stock/counts`, { headers: owner, data: {
    name: 'Offline roofing membrane', unit: 'rolls', countedQuantity: 3, reference: 'COUNT-OFFLINE-1', note: 'Counted before dispatch', entryKey: 'count-offline-receipt-1'
  } });
  expect(stockCount.ok()).toBeTruthy();
  const material = await page.request.post(`${base}/api/ledger/jobs/${job.id}/materials`, { headers: owner, data: { name: 'Offline roofing membrane', quantity: 3, unit: 'rolls' } });
  expect(material.ok()).toBeTruthy();
  const materialResult = await material.json();
  const reservation = await page.request.post(`${base}/api/ledger/jobs/${job.id}/material-stock-reservations`, { headers: owner, data: {
    materialRequirementId: materialResult.materialRequirement.id, quantity: 3, sourceReference: 'COUNT-OFFLINE-1', entryKey: 'reserve-offline-receipt-1'
  } });
  expect(reservation.ok()).toBeTruthy();
  const dispatch = await page.request.post(`${base}/api/ledger/material-stock-reservations/${(await reservation.json()).allocation.id}/issue`, { headers: owner, data: {
    quantity: 3, dispatchReference: 'VAN-OFFLINE-1', evidenceReference: 'signed-pick:offline-1',
    expectedArrivalAt: new Date(Date.now() + 86_400_000).toISOString(), entryKey: 'dispatch-offline-receipt-1'
  } });
  expect(dispatch.ok()).toBeTruthy();
  expect((await dispatch.json()).issueId).toBeTruthy();
  const jobDetail = await (await page.request.get(`${base}/api/ledger/jobs/${job.id}`, { headers: owner })).json();
  const task = jobDetail.job.tasks.find(item => item.title === 'Check opening dimensions');
  expect(task).toBeTruthy();
  const scheduledPhoto = await page.request.post(`${base}/api/ledger/jobs/${job.id}/photo-evidence`, { headers: owner, data: {
    entryKey: 'browser-offline-photo-set-0001', taskId: task.id, assignmentId: assignment.id,
    assignedWorkerId: 'browser-field-task-worker', title: 'Roof opening check', workLocation: 'Roof / opening 04',
    requiredPhases: ['before', 'during', 'after']
  } });
  expect(scheduledPhoto.ok()).toBeTruthy();
  const scheduledPhotoSetId = (await scheduledPhoto.json()).photoEvidenceSet.id;
  const login = await page.request.post(`${base}/api/auth/login`, { data: { token: 'browser-field-token-at-least-32-characters' } });
  expect(login.ok()).toBeTruthy();
  const session = await (await page.request.get(`${base}/api/session`)).json();
  expect(session.operator.authenticated).toBe(true);
  const companyA = session.company.id;
  const scopeA = `company:${companyA}:ledger:${session.company.ledgerId}:field_worker:${session.operator.id}`;
  const scopeB = `company:other-company:ledger:22222222-2222-4222-8222-222222222222:field_worker:${session.operator.id}`;
  const pack = title => ({
    job: { id: job.id, title, address: 'Private job address' }, sourceHash: 'a'.repeat(64),
    can: [], know: { instructions: [], drawings: [], safetyPlans: [] }, have: { materials: [], equipment: [] },
    do: [{ id: 'same-task-id', title: 'Check opening dimensions', status: 'open' }], checks: { quality: [], photos: [] },
    savedAt: new Date().toISOString()
  });
  const { sealVault } = await import('../offline-work-packs.mjs');
  const records = [
    [scopeB, await sealVault({ scope: scopeB, packs: [pack('Company B private work')], queue: [] }, 'offline-company-b-passphrase')]
  ];
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  const workPack = page.getByTestId('field-work-pack');
  await workPack.getByRole('button', { name: 'Werkpakket Company A private work openen' }).click();
  await workPack.getByText('Offline werkmap', { exact: true }).click();
  await workPack.getByLabel('Offline wachtzin (minimaal 10 tekens)').fill('offline-company-a-passphrase');
  await workPack.getByRole('button', { name: 'Werkpakket offline bewaren' }).click();
  await expect(workPack.getByText('Versleuteld opgeslagen voor maximaal 7 dagen.')).toBeVisible();
  const serviceWorkerResponse = await page.request.get(`${base}/field-sw.js`);
  expect(serviceWorkerResponse.ok()).toBeTruthy();
  const serviceWorker = await serviceWorkerResponse.text();
  const precache = JSON.parse(serviceWorker.match(/const ASSETS = (.*);/)[1]);
  expect(precache).toContain('/field-offline.html');
  expect(precache.some(asset => /\/assets\/OfflineField-.*\.js$/.test(asset))).toBe(true);
  expect(precache.some(asset => /\/assets\/Conversation-.*\.css$/.test(asset))).toBe(true);
  expect(precache.some(asset => /\/assets\/(?:App|JobWorkspaceControls|IdentityPortal)-/.test(asset))).toBe(false);
  for (const asset of precache.filter(path => path.startsWith('/assets/'))) {
    expect((await page.request.get(`${base}${asset}`)).ok(), `precache asset ${asset}`).toBe(true);
  }
  await page.goto(`${base}/field-offline.html`);
  await expect(page).toHaveURL(`${base}/field-offline.html`);
  expect(await page.title()).toBe('Contractor.AI');
  await page.evaluate(async entries => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('contractor-work-pack-vault', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('vault');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    await new Promise((resolve, reject) => {
      const tx = db.transaction('vault', 'readwrite');
      for (const [key, record] of entries) tx.objectStore('vault').put(record, key);
      tx.oncomplete = resolve; tx.onerror = () => reject(tx.error);
    });
    db.close();
  }, records);
  await page.reload();
  await expect(page.getByLabel('Bedrijfswerkmap').locator('option')).toHaveCount(2);
  await page.getByLabel('Bedrijfswerkmap').selectOption(scopeA);
  await page.getByLabel('Offline wachtzin', { exact: true }).fill('offline-company-a-passphrase');
  await page.getByRole('button', { name: 'Ontgrendelen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Company A private work' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Opgeslagen meldingen' })).toContainText('Offline kunnen nieuwe meldingen of wijzigingen niet worden opgehaald.');
  await expect(page.getByText('Company B private work')).toHaveCount(0);
  await context.setOffline(true);
  await page.reload();
  await page.getByLabel('Bedrijfswerkmap').selectOption(scopeA);
  await page.getByLabel('Offline wachtzin', { exact: true }).fill('offline-company-a-passphrase');
  await page.getByRole('button', { name: 'Ontgrendelen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Company A private work' })).toBeVisible();
  await page.getByRole('button', { name: 'Hebben', exact: true }).click();
  await expect(page.getByText('VAN-OFFLINE-1')).toBeVisible();
  const firstSiteReceipt = page.locator('form').filter({ has: page.getByLabel('Ontvangstreferentie') });
  await firstSiteReceipt.getByLabel('Ontvangen hoeveelheid').fill('2');
  await firstSiteReceipt.getByLabel('Geaccepteerde hoeveelheid').fill('2');
  await firstSiteReceipt.getByLabel('Beschadigde hoeveelheid').fill('0');
  await firstSiteReceipt.getByLabel('Ontvangstreferentie').fill('SITE-OFFLINE-A');
  await firstSiteReceipt.getByLabel('Bewijsreferentie').fill('photo:site-offline-a');
  await firstSiteReceipt.getByLabel('Ontvangen op locatie').fill('Roof level');
  await firstSiteReceipt.getByRole('button', { name: 'Aankomst versleuteld bewaren' }).click();
  await expect(page.getByText(/Aankomst versleuteld op dit apparaat bewaard/)).toBeVisible();
  const secondSiteReceipt = page.locator('form').filter({ has: page.getByLabel('Ontvangstreferentie') });
  await secondSiteReceipt.getByLabel('Ontvangen hoeveelheid').fill('1');
  await secondSiteReceipt.getByLabel('Geaccepteerde hoeveelheid').fill('0');
  await secondSiteReceipt.getByLabel('Beschadigde hoeveelheid').fill('1');
  await secondSiteReceipt.getByLabel('Ontvangstreferentie').fill('SITE-OFFLINE-B');
  await secondSiteReceipt.getByLabel('Bewijsreferentie').fill('photo:site-offline-b');
  await secondSiteReceipt.getByLabel('Ontvangen op locatie').fill('Roof level');
  await secondSiteReceipt.getByRole('button', { name: 'Aankomst versleuteld bewaren' }).click();
  await expect(page.getByText(/1 rolls ontvangen, 0 geaccepteerd, 1 beschadigd/)).toBeVisible();
  await page.getByLabel('Vraag of blokkade').fill('Company A needs the verified opening dimensions.');
  await page.getByRole('button', { name: 'Vraag lokaal bewaren' }).click();
  await page.getByLabel('Voortgangsstatus').selectOption('blocked');
  await page.getByLabel('Voortgang (%)').fill('40');
  await page.getByLabel('Blokkade en benodigde hulp').fill('Company A needs two more verified fixings.');
  await page.getByRole('button', { name: 'Voortgang lokaal bewaren' }).click();
  await page.getByLabel(/Foto \(JPEG, PNG of WebP, maximaal 2 MB\)/).setInputFiles({
    name: 'before-roof.jpg', mimeType: 'image/jpeg',
    buffer: jpegFixture('offline-private-photo-bytes')
  });
  await page.getByLabel('Toelichting (optioneel)').fill('Private offline roof photo caption.');
  await page.getByRole('button', { name: 'Foto versleuteld bewaren', exact: true }).click();
  await expect(page.getByText(/De foto is versleuteld op dit apparaat opgeslagen/)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wachtrij (5)' })).toBeVisible();
  await expect(page.getByText(/Foto voor het werk: before-roof.jpg/)).toBeVisible();
  const storedVault = await page.evaluate(async scope => {
    const db = await new Promise((resolve, reject) => {
      const open = indexedDB.open('contractor-work-pack-vault', 1);
      open.onsuccess = () => resolve(open.result); open.onerror = () => reject(open.error);
    });
    const value = await new Promise((resolve, reject) => {
      const tx = db.transaction('vault', 'readonly'), get = tx.objectStore('vault').get(scope);
      get.onsuccess = () => resolve(get.result); get.onerror = () => reject(get.error);
    });
    db.close(); return value;
  }, scopeA);
  expect(JSON.stringify(storedVault)).not.toContain('offline-private-photo-bytes');
  expect(JSON.stringify(storedVault)).not.toContain('Private offline roof photo caption.');
  await expect(page.getByText(/Geblokkeerd: 40% \| Company A needs two more verified fixings/)).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('company-a-offline-mobile.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole('button', { name: 'Vergrendelen', exact: true }).click();
  await page.getByLabel('Bedrijfswerkmap').selectOption(scopeB);
  await page.getByLabel('Offline wachtzin', { exact: true }).fill('offline-company-b-passphrase');
  await page.getByRole('button', { name: 'Ontgrendelen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Company B private work' })).toBeVisible();
  await expect(page.getByText('Company A needs the verified opening dimensions.')).toHaveCount(0);
  await page.getByLabel('Vraag of blokkade').fill('Company B question must remain with Company B.');
  await page.getByRole('button', { name: 'Vraag lokaal bewaren' }).click();
  await context.setOffline(false);
  const posts = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  await page.getByRole('button', { name: 'Synchroniseren', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('oorspronkelijke bedrijfsomgeving');
  expect(posts).toEqual([]);
  await expect(page.getByRole('heading', { name: 'Wachtrij (1)' })).toBeVisible();
  await page.getByText('Lokale gegevens verwijderen', { exact: true }).click();
  await page.getByLabel('Ook niet-verzonden reacties uit deze werkmap verwijderen').check();
  await page.getByRole('button', { name: 'Werkmap verwijderen', exact: true }).click();
  await expect(page.getByLabel('Bedrijfswerkmap').locator('option')).toHaveCount(1);
  await page.getByLabel('Offline wachtzin', { exact: true }).fill('offline-company-a-passphrase');
  await page.getByRole('button', { name: 'Ontgrendelen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Company A private work' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Wachtrij (5)' })).toBeVisible();
  await expect(page.getByText(/Company A needs the verified opening dimensions/)).toBeVisible();
  await expect(page.getByText(/Company A needs two more verified fixings/)).toBeVisible();
  await expect(page.getByText(/Foto voor het werk: before-roof.jpg/)).toBeVisible();
  await page.getByRole('button', { name: 'Synchroniseren', exact: true }).click();
  await expect(page.locator('main.offline-field > p[role="status"]')).toContainText('offline meldingen zijn bijgewerkt.', { timeout: 15000 });
  await expect(page.getByRole('heading', { name: 'Wachtrij (0)' })).toBeVisible();
  const verifiedJob = await (await page.request.get(`${base}/api/ledger/jobs/${job.id}`, { headers: owner })).json();
  expect(verifiedJob.job.materials.find(item => item.id === materialResult.materialRequirement.id)).toMatchObject({ status: 'received', data: { availableQuantity: 2 } });
  const retainedSet = verifiedJob.job.photoEvidenceSets.find(item => item.id === scheduledPhotoSetId);
  expect(retainedSet.captures.map(item => item.phase)).toContain('before');
  expect(retainedSet.captures.find(item => item.phase === 'before').caption).toBe('Private offline roof photo caption.');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({ path: testInfo.outputPath('company-a-offline-desktop.png'), fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect(errors).toEqual([]);
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
});
