const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { generateAuthorityKey, prepareSource, targetDescription, abortSource, retainAuthorityMarker } = require('../company-authority');
const { privateOutput } = require('../company-handover');
const { expectNoAxeViolations } = require('./accessibility-helpers');

test('authority-bound company shows reviewed recovery and disables generic restore on desktop and mobile', async ({ browser }, testInfo) => {
  test.setTimeout(120000);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-handover-browser-')), previousEnv = { ...process.env };
  const dbFile = path.join(root, 'ledger.sqlite'), keyFile = path.join(root, 'source.authority-key.json');
  const key = generateAuthorityKey(), target = targetDescription({ key: generateAuthorityKey(), origin: 'https://fixture.example.test' });
  let app, server, context;
  try {
    const ledger = new ContractorOperatingLedger({ dbFile, companyId: 'handover-browser-fixture' });
    const company = ledger.company, beforeCommit = state => retainAuthorityMarker(dbFile, state);
    try {
      prepareSource(ledger.db, { key, target, company, actor: 'browser_fixture', reason: 'Isolated browser recovery review', beforeCommit });
      abortSource(ledger.db, { key, actor: 'browser_fixture', reason: 'Verify retained local recovery state', beforeCommit });
    } finally { ledger.close(); }
    privateOutput(keyFile, key);
    const ownerKey = 'isolated-browser-handover-owner-token-32-characters';
    Object.assign(process.env, { NODE_ENV: 'test', CONTRACTOR_AI_RUNTIME_MODE: 'local', CONTRACTOR_AI_STORAGE_MODE: 'local',
      CONTRACTOR_AI_REQUIRE_AUTH: 'true', CONTRACTOR_AI_AUTH_TOKEN: ownerKey, CONTRACTOR_AI_ROLE_TOKENS: '', CONTRACTOR_AI_COMPANY_ID: company.id,
      CONTRACTOR_AI_DATA_DIR: root, LEDGER_DB_FILE: dbFile, STATE_FILE: path.join(root, 'state.json'), UPLOAD_DIR: path.join(root, 'uploads'),
      CONTRACTOR_AI_AUTONOMOUS_SCHEDULER_ENABLED: 'false', WEATHER_PROVIDER_ENABLED: 'false', CONTRACTOR_AI_AUTHORITY_KEY_FILE: keyFile,
      CONTRACTOR_AI_BACKUP_SIGNING_KEY: 'isolated-browser-handover-backup-signing-key-32-characters' });
    delete process.env.CONTRACTOR_AI_DATABASE_URL;
    delete require.cache[require.resolve('../server')];
    app = require('../server'); server = app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const backup = await fetch(`${origin}/api/operations/backup`, { method: 'POST', headers: { Authorization: `Bearer ${ownerKey}`, 'Content-Type': 'application/json' }, body: '{}' });
    expect(backup.status).toBe(201);
    context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(origin);
    await expect(page).toHaveTitle(/Contractor/i);
    await page.getByLabel('Access key', { exact: true }).fill(ownerKey);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
    await page.getByRole('button', { name: 'Operations', exact: true }).click();
    await expect(page.getByText('reviewed recovery required', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Check restore for backup/ })).toBeDisabled();
    await expect(page.getByText('Company authority recovery requires review. Generic restore is blocked.', { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath('handover-recovery-desktop.png'), fullPage: true });
    const dataSafety = page.locator('section.page-panel').filter({ has: page.getByRole('heading', { name: 'Data safety', exact: true }) });
    await dataSafety.screenshot({ path: testInfo.outputPath('handover-data-desktop.png') });
    await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('Gecontroleerd herstel vereist', { exact: true })).toBeVisible();
    await expect(page.getByText('Herstel van deze bedrijfsomgeving vereist controle. Standaardherstel is geblokkeerd.', { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expectNoAxeViolations(page);
    await page.screenshot({ path: testInfo.outputPath('handover-recovery-mobile.png'), fullPage: true });
    await dataSafety.screenshot({ path: testInfo.outputPath('handover-data-mobile.png') });
    expect(errors).toEqual([]);
  } finally {
    await context?.close();
    if (app) await app.locals.runtimeControl.shutdown({ server });
    for (const name of Object.keys(process.env)) if (!Object.hasOwn(previousEnv, name)) delete process.env[name];
    Object.assign(process.env, previousEnv);
    expect(path.dirname(root)).toBe(fs.realpathSync(os.tmpdir()));
    expect(path.basename(root).startsWith('contractor-handover-browser-')).toBe(true);
    fs.rmSync(root, { recursive: true, force: true });
  }
});
