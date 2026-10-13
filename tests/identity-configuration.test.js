const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { IdentityRuntime, identityRuntimeConfiguration } = require('../identity-runtime');
const { startIdentityServer, createIdentityApp } = require('../identity-server');
const { IdentityRegistry } = require('../identity-registry');
const { healthcheckUrl, runtimeHealthcheck } = require('../scripts/runtime-healthcheck');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { verifySqliteBackupDatabase } = require('../scripts/restore-local-backup');

test('optional shared identity fails closed on partial settings, unauthenticated companies and unsafe hosted transport', async () => {
  const options = { local: true, authenticationRequired: true };
  assert.equal(identityRuntimeConfiguration({}, options), null);
  assert.throws(() => identityRuntimeConfiguration({ CONTRACTOR_AI_IDENTITY_ISSUER: 'https://identity.test' }, options), { code: 'identity_configuration_incomplete' });
  const env = { CONTRACTOR_AI_IDENTITY_ISSUER: 'http://127.0.0.1:3010', CONTRACTOR_AI_IDENTITY_PUBLIC_ORIGIN: 'http://127.0.0.1:3020',
    CONTRACTOR_AI_IDENTITY_CLIENT_ID: 'company-a', CONTRACTOR_AI_IDENTITY_CLIENT_SECRET: 'a'.repeat(40), CONTRACTOR_AI_IDENTITY_SESSION_KEY: crypto.randomBytes(32).toString('base64') };
  assert.ok(identityRuntimeConfiguration(env, options));
  assert.throws(() => identityRuntimeConfiguration(env, { ...options, local: false }), { code: 'identity_origin_invalid' });
  assert.throws(() => identityRuntimeConfiguration(env, { ...options, authenticationRequired: false }), { code: 'identity_configuration_incomplete' });
  await assert.rejects(startIdentityServer({ CONTRACTOR_IDENTITY_MODE: 'hosted' }), { code: 'identity_hosted_requirements' });
  await assert.rejects(startIdentityServer({ CONTRACTOR_IDENTITY_MODE: 'local', CONTRACTOR_IDENTITY_HOST: '0.0.0.0' }), { code: 'identity_local_binding_invalid' });
  await assert.rejects(startIdentityServer({ CONTRACTOR_IDENTITY_MODE: 'hosted', CONTRACTOR_IDENTITY_DATABASE_URL: 'postgres://localhost/test?sslmode=disable', CONTRACTOR_IDENTITY_DPA_REFERENCE: 'review', CONTRACTOR_IDENTITY_EU_REGION_CONFIRMED: 'true' }), { code: 'identity_database_tls_required' });
});

test('company session encryption is bound to company/issuer; login state is one-use and schema verification detects damage', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-configuration-')), dbFile = path.join(root, 'ledger.sqlite');
  const ledger = new ContractorOperatingLedger({ companyId: 'alpha', dbFile });
  t.after(() => { ledger.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const config = { issuer: 'https://identity.test', origin: 'https://alpha.test', clientId: 'alpha', clientSecret: 'a'.repeat(40), key: crypto.randomBytes(32) };
  const runtime = new IdentityRuntime(ledger, config), token = crypto.randomBytes(32).toString('base64url');
  runtime.put('login', token, { verifier: 'private-verifier' }, 600);
  const foreign = new IdentityRuntime(ledger, { ...config, issuer: 'https://other-issuer.test' });
  assert.throws(() => foreign.get('login', token), { code: 'identity_session_invalid' });
  assert.equal(runtime.get('login', token, true).verifier, 'private-verifier');
  assert.equal(runtime.get('login', token, true), null);
  runtime.put('session', token, { accessToken: 'not-visible-in-database' }, 600);
  assert.ok(!JSON.stringify(ledger.db.prepare('SELECT * FROM identity_runtime_sessions').all()).includes('not-visible-in-database'));
  assert.equal(verifySqliteBackupDatabase(dbFile).valid, true);
  ledger.db.exec('DROP INDEX idx_work_board_membership');
  assert.throws(() => verifySqliteBackupDatabase(dbFile), /Backup identity index is missing/);
});

test('health probes select the actual service and check registry storage without relaxing account origin checks', async t => {
  assert.equal(healthcheckUrl({}), 'http://127.0.0.1:3000/api/health/ready');
  assert.equal(healthcheckUrl({ PORT: '3210' }), 'http://127.0.0.1:3210/api/health/ready');
  assert.equal(healthcheckUrl({ CONTRACTOR_IDENTITY_MODE: 'hosted', CONTRACTOR_IDENTITY_HOST: '::1' }), 'http://[::1]:3010/health/ready');
  assert.throws(() => healthcheckUrl({ PORT: '3000/unsafe-path' }), /Invalid healthcheck port/);
  const registry = new IdentityRegistry({ dbFile: ':memory:', issuer: 'https://identity.test', encryptionKey: crypto.randomBytes(32) });
  const app = await createIdentityApp({ registry }), server = app.listen(0, '127.0.0.1');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); registry.close(); });
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port, base = `http://127.0.0.1:${port}`;
  const env = { CONTRACTOR_IDENTITY_MODE: 'hosted', CONTRACTOR_IDENTITY_PORT: port };
  assert.equal(await runtimeHealthcheck(env), true);
  assert.equal((await fetch(`${base}/api/identity/session`)).status, 400, 'Only the minimal health endpoint bypasses public-origin checks.');
  assert.equal((await fetch(`${base}/health/ready`, { method: 'POST' })).status, 400);
  registry.db.exec('DELETE FROM registry_migrations');
  assert.equal(await runtimeHealthcheck(env), false, 'An HTTP process with missing storage migrations is not ready.');
});
