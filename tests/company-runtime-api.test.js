const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { ContractorOperatingLedger } = require('../operating-ledger');

test('two company servers reject cross-company cookies, stale requests and evidence access', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-company-api-'));
  const apps = [];
  const originalEnv = { ...process.env };
  t.after(async () => {
    for (const { app, server } of apps) await app.locals.runtimeControl.shutdown({ server });
    for (const key of Object.keys(process.env)) if (!Object.hasOwn(originalEnv, key)) delete process.env[key];
    Object.assign(process.env, originalEnv);
    fs.rmSync(root, { recursive: true, force: true });
  });
  async function start(companyId) {
    const dataDir = path.join(root, companyId);
    const dbFile = path.join(dataDir, 'ledger.sqlite');
    const ledger = new ContractorOperatingLedger({ dbFile, companyId });
    const now = new Date().toISOString();
    ledger.db.prepare("INSERT INTO clients (id, name, created_at, updated_at) VALUES ('shared-client', ?, ?, ?)").run(`${companyId} private client`, now, now);
    const company = ledger.company;
    ledger.close();
    Object.assign(process.env, {
      NODE_ENV: 'test', CONTRACTOR_AI_RUNTIME_MODE: 'local', CONTRACTOR_AI_STORAGE_MODE: 'local',
      CONTRACTOR_AI_REQUIRE_AUTH: 'true', CONTRACTOR_AI_AUTH_TOKEN: 'same-owner-secret-to-test-company-session-binding',
      CONTRACTOR_AI_ROLE_TOKENS: '', CONTRACTOR_AI_COMPANY_ID: companyId,
      CONTRACTOR_AI_DATA_DIR: dataDir, LEDGER_DB_FILE: dbFile, STATE_FILE: path.join(dataDir, 'state.json'), UPLOAD_DIR: path.join(dataDir, 'uploads'),
      CONTRACTOR_AI_AUTONOMOUS_SCHEDULER_ENABLED: 'false', WEATHER_PROVIDER_ENABLED: 'false',
      CONTRACTOR_AI_BACKUP_SIGNING_KEY: 'test-only-shared-backup-key-not-a-production-secret'
    });
    delete require.cache[require.resolve('../server')];
    const app = require('../server');
    const server = app.listen(0, '127.0.0.1');
    apps.push({ app, server });
    await new Promise(resolve => server.once('listening', resolve));
    const base = `http://127.0.0.1:${server.address().port}`;
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: process.env.CONTRACTOR_AI_AUTH_TOKEN }) });
    assert.equal(login.status, 200);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    return { base, company, cookie };
  }
  const a = await start('company-a');
  const b = await start('company-b');
  assert.notEqual(a.cookie.split('=')[0], b.cookie.split('=')[0]);
  for (const [own, other] of [[a, b], [b, a]]) {
    const session = await fetch(`${own.base}/api/session`, { headers: { Cookie: own.cookie } }).then(r => r.json());
    assert.equal(session.operator.companyId, own.company.id);
    assert.equal(session.operator.ledgerId, own.company.ledgerId);
    const clients = await fetch(`${own.base}/api/ledger/clients`, { headers: { Cookie: own.cookie } });
    assert.equal(clients.status, 200);
    const text = await clients.text();
    assert.ok(text.includes(`${own.company.id} private client`));
    assert.ok(!text.includes(`${other.company.id} private client`));
    const replay = await fetch(`${own.base}/api/ledger/clients`, { headers: { Cookie: other.cookie } });
    assert.equal(replay.status, 401);
    // Renaming the cookie cannot turn a foreign signature into this company's session.
    const renamed = `${own.cookie.split('=')[0]}=${other.cookie.split('=').slice(1).join('=')}`;
    assert.equal((await fetch(`${own.base}/api/ledger/clients`, { headers: { Cookie: renamed } })).status, 401);
    for (const route of ['/api/ledger/jobs', '/api/ledger/documents/shared-document/content', '/api/operations/export']) {
      const stale = await fetch(`${own.base}${route}`, { headers: { Cookie: own.cookie, 'X-Contractor-Company': other.company.id, 'X-Contractor-Ledger': other.company.ledgerId } });
      assert.equal(stale.status, 409);
      assert.equal((await stale.json()).error.code, 'company_runtime_mismatch');
      const nativeDownload = await fetch(`${own.base}${route}?__company=${other.company.id}&__ledger=${other.company.ledgerId}`, { headers: { Cookie: own.cookie } });
      assert.equal(nativeDownload.status, 409);
      assert.equal((await nativeDownload.json()).error.code, 'company_runtime_mismatch');
    }
    const ownExport = await fetch(`${own.base}/api/operations/export?__company=${own.company.id}&__ledger=${own.company.ledgerId}`, { headers: { Cookie: own.cookie } });
    assert.equal(ownExport.status, 200);
    assert.deepEqual((await ownExport.json()).company, own.company);
    const duplicateScope = await fetch(`${own.base}/api/ledger/jobs?__company=${own.company.id}&__company=${other.company.id}`, { headers: { Cookie: own.cookie } });
    assert.equal(duplicateScope.status, 409);
    const mutation = await fetch(`${own.base}/api/preferences`, {
      method: 'PATCH', headers: { Cookie: own.cookie, Origin: own.base, 'Content-Type': 'application/json', 'X-Contractor-Company': other.company.id },
      body: JSON.stringify({ locale: 'nl-NL' })
    });
    assert.equal(mutation.status, 409);
    const retained = await fetch(`${own.base}/api/session`, { headers: { Cookie: own.cookie } }).then(r => r.json());
    assert.equal(retained.operator.preferences.locale, 'en-GB');
    assert.equal(retained.operator.preferences.isPersisted, false);
  }
});
