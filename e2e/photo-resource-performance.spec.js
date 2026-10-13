const { test, expect } = require('@playwright/test');
const AxeBuilder = require('@axe-core/playwright').default;
const { randomUUID, createHash } = require('node:crypto');
const fs = require('node:fs');
const sharp = require('sharp');
const { png } = require('../tests/image-fixtures');

test('private conversation photos load near the viewport without shifting their reserved frames', async ({ page, request, browser }, testInfo) => {
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const owner = { Authorization: 'Bearer browser-owner-token-at-least-32-characters' };
  async function post(route, data) {
    const response = await request.post(base + route, { headers: owner, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const { job } = await post('/api/ledger/intake', { title: `Photo resources ${Date.now()}`, client: { name: 'Photo resource fixture' }, assignAutomatically: false });
  const { access } = await post(`/api/ledger/jobs/${job.id}/client-portal-access`, { label: 'Photo resource portal' });
  await post(`/api/ledger/approvals/${access.approval.id}/resolve?includeDashboard=false`, { status: 'approved' });
  const messages = [];
  for (let index = 0; index < 12; index += 1) {
    const response = await request.post(`${base}/api/client-portal/conversation/messages`, {
      headers: { Authorization: `Bearer ${access.portalToken}` },
      multipart: { entryKey: randomUUID(), body: `Site detail ${index}. ${'Checked local fixture. '.repeat(15)}`,
        evidenceFile: { name: `site-detail-${index}.png`, mimeType: 'image/png', buffer: png } }
    });
    expect(response.ok(), await response.text()).toBe(true);
    messages.push((await response.json()).message);
  }
  const reads = [], errors = [];
  await page.addInitScript(() => {
    const create = URL.createObjectURL, revoke = URL.revokeObjectURL;
    const live = new Map();
    window.__photoLeaseStats = { created: 0, revoked: 0, peak: 0, peakBytes: 0 };
    URL.createObjectURL = function (blob) {
      const url = Reflect.apply(create, this, [blob]);
      if (blob.type === 'image/webp') {
        live.set(url, blob.size);
        const stats = window.__photoLeaseStats;
        stats.created += 1;
        stats.peak = Math.max(stats.peak, live.size);
        stats.peakBytes = Math.max(stats.peakBytes, [...live.values()].reduce((sum, bytes) => sum + bytes, 0));
      }
      return url;
    };
    URL.revokeObjectURL = function (url) {
      if (live.delete(url)) window.__photoLeaseStats.revoked += 1;
      return Reflect.apply(revoke, this, [url]);
    };
    window.__activePhotoLeases = () => live.size;
  });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) errors.push(message.text()); });
  page.on('request', req => {
    const match = new URL(req.url()).pathname.match(/^\/api\/client-portal\/conversation\/messages\/([^/]+)\/photo$/);
    if (match) reads.push({ id: match[1], token: req.headers().authorization });
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/client-portal.html#token=${access.portalToken}`);
  await expect(page).toHaveTitle(/Contractor\.AI/);
  const chat = page.getByRole('region', { name: 'Klantgesprek', exact: true });
  await expect(chat.locator('.conversation-photo-slot')).toHaveCount(12);
  await page.waitForTimeout(250);
  expect(reads.length).toBeLessThan(12);
  expect(reads.some(read => read.id === messages[11].id)).toBe(false);
  const last = chat.locator(`[id="message-${messages[11].id}"] .conversation-photo-slot`);
  const before = await last.boundingBox();
  await last.scrollIntoViewIfNeeded();
  const image = last.getByRole('img', { name: 'site-detail-11.png' });
  await expect(image).toBeVisible();
  await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
  const after = await last.boundingBox();
  expect(Math.abs(before.width - after.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(before.height - after.height)).toBeLessThanOrEqual(1);
  expect(reads.filter(read => read.id === messages[11].id)).toHaveLength(1);
  expect(reads.every(read => read.token === `Bearer ${access.portalToken}`)).toBe(true);
  expect(reads.length).toBeLessThan(12);
  await page.screenshot({ path: testInfo.outputPath('visible-photo-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await last.scrollIntoViewIfNeeded();
  await expect(image).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.conversation').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('visible-photo-mobile.png') });
  for (const message of messages) {
    const slot = chat.locator(`[id="message-${message.id}"] .conversation-photo-slot`);
    await slot.scrollIntoViewIfNeeded();
    await expect(slot.getByRole('img')).toBeVisible();
    expect(await page.evaluate(() => window.__activePhotoLeases())).toBeLessThanOrEqual(8);
    expect(await chat.getByRole('img').count()).toBeLessThanOrEqual(8);
  }
  const first = chat.locator(`[id="message-${messages[0].id}"] .conversation-photo-slot`);
  await expect(first.getByRole('img')).toHaveCount(0);
  const firstReads = reads.filter(read => read.id === messages[0].id).length;
  await first.scrollIntoViewIfNeeded();
  await expect(first.getByRole('img')).toBeVisible();
  expect(reads.filter(read => read.id === messages[0].id).length).toBeGreaterThan(firstReads);
  expect(reads.every(read => read.token === `Bearer ${access.portalToken}`)).toBe(true);
  const leases = await page.evaluate(() => ({ ...window.__photoLeaseStats, live: window.__activePhotoLeases() }));
  expect(leases.peak).toBeLessThanOrEqual(8);
  expect(leases.revoked).toBeGreaterThan(0);
  expect(leases.peakBytes).toBeLessThanOrEqual(8 * 512 * 1024);
  expect(new Set(reads.map(read => read.id)).size).toBe(12);
  expect(await page.locator('vite-error-overlay').count()).toBe(0);
  expect(errors).toEqual([]);
  const fallbackContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  let fallbackActivePreviews;
  try {
    await fallbackContext.addInitScript(() => { window.IntersectionObserver = undefined; });
    const fallbackPage = await fallbackContext.newPage();
    const fallbackErrors = [];
    fallbackPage.on('pageerror', error => fallbackErrors.push(error.message));
    await fallbackPage.goto(`${base}/client-portal.html#token=${access.portalToken}`);
    await expect(fallbackPage).toHaveTitle(/Contractor\.AI/);
    const fallbackChat = fallbackPage.getByRole('region', { name: 'Klantgesprek', exact: true });
    await expect(fallbackChat.getByRole('img')).toHaveCount(8);
    const waiting = fallbackChat.locator(`[id="message-${messages[11].id}"] .conversation-photo-slot`);
    await waiting.scrollIntoViewIfNeeded();
    await expect(waiting.getByRole('img')).toHaveCount(0);
    await expect(waiting.getByRole('button', { name: 'Foto laden: site-detail-11.png', exact: true })).toBeVisible();
    await fallbackPage.screenshot({ path: testInfo.outputPath('waiting-photo-mobile.png') });
    await waiting.getByRole('button', { name: 'Foto laden: site-detail-11.png', exact: true }).click();
    await expect(waiting.getByRole('img')).toBeVisible();
    await expect.poll(() => waiting.getByRole('img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    fallbackActivePreviews = await fallbackChat.getByRole('img').count();
    expect(fallbackActivePreviews).toBe(8);
    expect(await fallbackPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    expect(fallbackErrors).toEqual([]);
  } finally { await fallbackContext.close(); }
  fs.writeFileSync(testInfo.outputPath('windowed-photo-observation.json'), JSON.stringify({ retainedPhotos: 12,
    distinctDownloadedPhotos: new Set(reads.map(read => read.id)).size, scopedPreviewRequests: reads.length, fallbackActivePreviews, ...leases }));
  // A released source must not be resurrected from client memory after revocation.
  await last.scrollIntoViewIfNeeded();
  await expect(first.getByRole('img')).toHaveCount(0);
  await post(`/api/ledger/client-portal-access/${access.id}/revoke`, {});
  const denied = page.waitForResponse(response => new URL(response.url()).pathname.endsWith(`/messages/${messages[0].id}/photo`)
    && new URL(response.url()).searchParams.get('preview') === '1' && response.status() === 404);
  await first.scrollIntoViewIfNeeded();
  await denied;
  await expect(first.getByRole('alert')).toBeVisible();
  await expect(first.getByRole('img')).toHaveCount(0);
  console.log(JSON.stringify({ windowedPhotos: { retainedPhotos: 12, scopedPreviewRequests: reads.length, fallbackActivePreviews, ...leases, revokedReentryStatus: 404 } }));
});

test('a large private photo renders a bounded preview and downloads its unchanged original only on request', async ({ page, request }, testInfo) => {
  const base = `http://127.0.0.1:${process.env.CONTRACTOR_AI_BROWSER_AUTH_PORT}`;
  const owner = { Authorization: 'Bearer browser-owner-token-at-least-32-characters' };
  async function post(route, data) {
    const response = await request.post(base + route, { headers: owner, data });
    expect(response.ok(), await response.text()).toBe(true);
    return response.json();
  }
  const { job } = await post('/api/ledger/intake', { title: `Large photo ${Date.now()}`, client: { name: 'Local photo fixture' }, assignAutomatically: false });
  const { access } = await post(`/api/ledger/jobs/${job.id}/client-portal-access`, { label: 'Bounded photo portal' });
  await post(`/api/ledger/approvals/${access.approval.id}/resolve?includeDashboard=false`, { status: 'approved' });
  const original = await sharp({ create: { width: 4032, height: 3024, channels: 3,
    noise: { type: 'gaussian', mean: 128, sigma: 15 } } }).composite([{ input: Buffer.from(
    '<svg width="4032" height="3024"><rect x="1200" y="100" width="1632" height="2800" fill="#52736a"/><rect x="1320" y="220" width="1392" height="2560" fill="#fff"/><rect x="1480" y="380" width="1072" height="2240" fill="#a1bab5"/><circle cx="2420" cy="1600" r="60" fill="#283331"/></svg>') }])
    .jpeg({ quality: 78 }).toBuffer();
  const filename = '12mp-site-detail.jpg';
  const uploaded = await request.post(`${base}/api/client-portal/conversation/messages`, {
    headers: { Authorization: `Bearer ${access.portalToken}` },
    multipart: { entryKey: randomUUID(), body: 'Synthetic local door-detail fixture.', evidenceFile: { name: filename, mimeType: 'image/jpeg', buffer: original } }
  });
  expect(uploaded.ok(), await uploaded.text()).toBe(true);
  const message = (await uploaded.json()).message;
  const pathname = `/api/client-portal/conversation/messages/${message.id}/photo`;
  await page.addInitScript(({ pathname }) => {
    const readBlob = Response.prototype.blob;
    Response.prototype.blob = async function (...args) {
      const blob = await Reflect.apply(readBlob, this, args);
      const url = new URL(this.url, location.href);
      if (url.pathname === pathname && url.searchParams.get('preview') === '1') {
        window.__boundedPhotoPreview = { mime: blob.type, bytes: Array.from(new Uint8Array(await blob.arrayBuffer())) };
      }
      return blob;
    };
  }, { pathname });
  const reads = [], errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', event => { if (['error', 'warning'].includes(event.type())) errors.push(event.text()); });
  page.on('request', req => { if (new URL(req.url()).pathname === pathname) reads.push(req); });
  const previewResponse = page.waitForResponse(response => new URL(response.url()).pathname === pathname
    && new URL(response.url()).searchParams.get('preview') === '1');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(`${base}/client-portal.html#token=${access.portalToken}`);
  await expect(page).toHaveTitle(/Contractor\.AI/);
  const chat = page.getByRole('region', { name: 'Klantgesprek', exact: true });
  const photo = chat.getByRole('img', { name: filename });
  await chat.locator('.conversation-photo-slot').scrollIntoViewIfNeeded();
  await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate(node => node.naturalWidth)).toBe(960);
  const response = await previewResponse;
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/webp');
  expect(response.headers()['cache-control']).toBe('no-store');
  // Observe the application's existing body read; no refetch or CSP change is needed.
  const captured = await page.evaluate(() => window.__boundedPhotoPreview);
  expect(captured.mime).toBe('image/webp');
  const preview = Buffer.from(captured.bytes);
  expect(preview.length).toBeGreaterThan(0);
  expect(preview.length).toBe(Number(response.headers()['content-length']));
  const previewMetadata = await sharp(preview).metadata();
  expect(previewMetadata.format).toBe('webp');
  expect(previewMetadata.width).toBe(960);
  expect(previewMetadata.height).toBe(720);
  expect(preview.length).toBeLessThan(original.length / 4);
  expect(preview.length).toBeLessThanOrEqual(512 * 1024);
  expect(reads).toHaveLength(1);
  expect(reads.every(req => new URL(req.url()).searchParams.get('preview') === '1')).toBe(true);
  expect(reads[0].headers().authorization).toBe(`Bearer ${access.portalToken}`);
  await page.screenshot({ path: testInfo.outputPath('bounded-photo-desktop.png') });
  const downloaded = page.waitForEvent('download');
  await chat.getByRole('button', { name: `Origineel downloaden: ${filename}`, exact: true }).click();
  const download = await downloaded;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toBe(filename);
  const downloadedBytes = fs.readFileSync(await download.path());
  expect(createHash('sha256').update(downloadedBytes).digest('hex')).toBe(createHash('sha256').update(original).digest('hex'));
  expect(reads).toHaveLength(2);
  expect(new URL(reads[1].url()).searchParams.has('preview')).toBe(false);
  expect(reads[1].headers().authorization).toBe(`Bearer ${access.portalToken}`);
  await page.setViewportSize({ width: 390, height: 844 });
  await chat.locator('.conversation-photo-slot').scrollIntoViewIfNeeded();
  await expect(photo).toBeVisible();
  expect(await photo.evaluate(node => node.naturalWidth * node.naturalHeight)).toBe(960 * 720);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  expect((await new AxeBuilder({ page }).include('.conversation').analyze()).violations).toEqual([]);
  await page.screenshot({ path: testInfo.outputPath('bounded-photo-mobile.png') });
  expect(await page.locator('vite-error-overlay').count()).toBe(0);
  expect(errors).toEqual([]);
  const observation = { originalBytes: original.length, previewBytes: preview.length,
    originalPixels: 4032 * 3024, previewPixels: 960 * 720, automaticOriginalReads: 0, verifiedOriginalDownloads: 1 };
  fs.writeFileSync(testInfo.outputPath('bounded-photo-observation.json'), JSON.stringify(observation));
  console.log(JSON.stringify({ boundedPhoto: observation }));
});
