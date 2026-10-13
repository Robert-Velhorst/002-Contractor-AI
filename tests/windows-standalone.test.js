const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { applyStandaloneEnvironment, ensureStandaloneConfig, STANDALONE_CONFIG_FORMAT } = require('../standalone-runtime');
const { startupSummary } = require('../standalone-launcher');
const { assertPackageDataAbsent, isReusableRuntimeLockError, removeStagedWebBuild, resolvePackageTarget, runtimeFiles, withStagedWebBuild } = require('../scripts/build-windows-standalone');

test('staged web output is cleaned after success and failure without hiding the build error', () => {
  let successDirectory;
  const result = withStagedWebBuild(directory => {
    successDirectory = directory;
    fs.writeFileSync(path.join(directory, 'index.html'), 'successful build fixture');
    return 'finished';
  });
  assert.equal(result, 'finished');
  assert.equal(fs.existsSync(successDirectory), false);
  let failedDirectory;
  const failure = new Error('synthetic build failure');
  assert.throws(() => withStagedWebBuild(directory => {
    failedDirectory = directory;
    fs.writeFileSync(path.join(directory, 'index.html'), 'partial build fixture');
    throw failure;
  }), error => error === failure);
  assert.equal(fs.existsSync(failedDirectory), false);
});

test('web build cleanup removes only guarded generated staging output', t => {
  const release = path.resolve(__dirname, '..', 'release');
  resolvePackageTarget(path.join(release, '.contractor-web-build-fixture'));
  fs.mkdirSync(release, { recursive: true });
  const staging = fs.mkdtempSync(path.join(release, '.contractor-web-build-'));
  t.after(() => fs.rmSync(staging, { recursive: true, force: true }));
  fs.mkdirSync(path.join(staging, 'dist'));
  fs.writeFileSync(path.join(staging, 'dist', 'index.html'), '<html></html>');
  assert.throws(() => removeStagedWebBuild(path.join(release, 'ContractorAI-windows-x64')), /unexpected web build staging/);
  assert.throws(() => removeStagedWebBuild(os.tmpdir()), /direct child directories/);
  fs.writeFileSync(path.join(staging, 'runtime.json'), 'synthetic private configuration');
  assert.throws(() => removeStagedWebBuild(staging), /operator data or private configuration/);
  assert.equal(fs.readFileSync(path.join(staging, 'runtime.json'), 'utf8'), 'synthetic private configuration');
  fs.unlinkSync(path.join(staging, 'runtime.json'));
  removeStagedWebBuild(staging);
  assert.equal(fs.existsSync(staging), false);
});

test('Windows release candidates remain inside the release directory without replacing the default target', () => {
  const release = path.resolve(__dirname, '..', 'release');
  assert.equal(resolvePackageTarget(path.join(release, 'ContractorAI-windows-x64-candidate')), path.join(release, 'ContractorAI-windows-x64-candidate'));
  assert.equal(resolvePackageTarget('release/ContractorAI-windows-x64'), path.join(release, 'ContractorAI-windows-x64'));
  for (const unsafe of [release, path.dirname(release), 'release/../data', 'release/nested/candidate', os.tmpdir()]) {
    assert.throws(() => resolvePackageTarget(unsafe), /direct child directories/);
  }
});

test('Windows package selection rejects junctions even when their targets do not exist', t => {
  const release = path.resolve(__dirname, '..', 'release');
  const junction = path.join(release, 'redirected-candidate');
  t.mock.method(fs, 'existsSync', () => false);
  t.mock.method(fs, 'lstatSync', filename => ({ isSymbolicLink: () => filename === junction }));
  assert.throws(() => resolvePackageTarget(junction), /symbolic link or junction/);
});

test('package rebuild refuses retained operator data or identity keys before any cleanup', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-package-data-guard-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const name of ['registry.sqlite', '.env.identity', '.ENV.RECOVERY', 'identity-companies.json', 'data', 'ledger.sqlite.authority.json', 'source.authority-key.json']) {
    const directory = path.join(root, name.replaceAll('.', '-'));
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, name), 'must survive');
    assert.throws(() => assertPackageDataAbsent(directory), /operator data or private configuration/);
    assert.equal(fs.readFileSync(path.join(directory, name), 'utf8'), 'must survive');
  }
  const generated = path.join(root, 'clean'); fs.mkdirSync(generated);
  fs.writeFileSync(path.join(generated, 'BUILD.json'), '{}');
  assert.doesNotThrow(() => assertPackageDataAbsent(generated));
});

test('Windows package rebuild recognizes both common locked-runtime errors', () => {
  assert.equal(isReusableRuntimeLockError({ code: 'EBUSY' }, 'win32'), true);
  assert.equal(isReusableRuntimeLockError({ code: 'EPERM' }, 'win32'), true);
  assert.equal(isReusableRuntimeLockError({ code: 'EACCES' }, 'win32'), false);
  assert.equal(isReusableRuntimeLockError({ code: 'EBUSY' }, 'linux'), false);
});

test('standalone runtime creates one persistent owner key under the Windows user profile', () => {
  const localAppData = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-standalone-'));
  const environment = { LOCALAPPDATA: localAppData, PORT: '4123' };
  const first = ensureStandaloneConfig({ environment });
  const second = ensureStandaloneConfig({ environment });
  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(first.config.format, STANDALONE_CONFIG_FORMAT);
  assert.equal(first.config.ownerToken, second.config.ownerToken);
  assert.ok(first.config.ownerToken.length >= 32);
  assert.equal(first.config.backupSigningKey, second.config.backupSigningKey);
  assert.ok(first.config.backupSigningKey.length >= 32);
  assert.ok(first.config.evidenceStorageMaxBytes > 0);
  assert.equal(first.config.port, 4123);
  assert.ok(first.paths.configFile.startsWith(path.resolve(localAppData)));

  const applied = applyStandaloneEnvironment({ environment });
  assert.equal(environment.NODE_ENV, 'production');
  assert.equal(environment.CONTRACTOR_AI_RUNTIME_MODE, 'local');
  assert.equal(environment.CONTRACTOR_AI_STORAGE_MODE, 'local');
  assert.equal(environment.CONTRACTOR_AI_REQUIRE_AUTH, 'true');
  assert.equal(environment.CONTRACTOR_AI_BIND_HOST, '127.0.0.1');
  assert.equal(environment.CONTRACTOR_AI_AUTH_TOKEN, first.config.ownerToken);
  assert.equal(environment.CONTRACTOR_AI_BACKUP_SIGNING_KEY, first.config.backupSigningKey);
  assert.equal(environment.CONTRACTOR_AI_EVIDENCE_STORAGE_MAX_BYTES, String(first.config.evidenceStorageMaxBytes));
  assert.equal(environment.LEDGER_DB_FILE, applied.paths.ledgerFile);
});

test('Windows package contract includes the standalone, tunnel, HAI, and canonical ledger runtimes', () => {
  for (const required of [
    'server.js',
    'backup-manifest.js',
    'company-authority.js',
    'company-handover.js',
    'backup-evidence.js',
    'scripts/company-handover.js',
    'docs/COMPANY_HANDOVER.md',
    'docs/adr/0003-company-authority-handover.md',
    'operating-ledger.js',
    'runtime-lock.js',
    'identity-registry.js',
    'identity-runtime.js',
    'identity-server.js',
    'identity-oidc-adapter.js',
    'identity-recovery.js',
    'work-context.js',
    'work-delivery.js',
    'work-balance.js',
    'client-date-commitments.js',
    'docs/WORK_BALANCE.md',
    'asset-history.js',
    'inspection-coverage.js',
    'client-delivery.js',
    'docs/SHARED_WORK_MODEL.md',
    'scripts/identity-maintenance.js',
    'docs/IDENTITY_RECOVERY.md',
    'docs/adr/0002-registry-recovery-does-not-restore-access.md',
    'scripts/runtime-healthcheck.js',
    'standalone-launcher.js',
    'standalone-runtime.js',
    'hai-connector.js',
    'scripts/start-ngrok.js',
    'scripts/export-hai-feed.js'
  ]) assert.ok(runtimeFiles.includes(required), required);
  const tunnelSource = fs.readFileSync(path.resolve(__dirname, '..', 'scripts', 'start-ngrok.js'), 'utf8');
  for (const lifecycleControl of [
    'publicAuthenticationBoundary',
    "CONTRACTOR_AI_NGROK_ACTIVE = 'true'",
    'CONTRACTOR_AI_NGROK_VERIFIED_AT',
    'await closeTunnelIngress(runtime.listener)'
  ]) assert.ok(tunnelSource.includes(lifecycleControl), lifecycleControl);
});

test('standalone startup only displays the owner key on first run', () => {
  const runtime = {
    created: true,
    config: { ownerToken: 'private-owner-key', port: 4175 },
    paths: { configFile: 'C:\\private\\runtime.json', dataDir: 'C:\\private\\data' }
  };
  const firstRun = startupSummary(runtime, 'http://127.0.0.1:4175');
  assert.match(firstRun, /First-run owner access key: private-owner-key/);

  const laterRun = startupSummary({ ...runtime, created: false }, 'http://127.0.0.1:4175');
  assert.doesNotMatch(laterRun, /private-owner-key/);
  assert.match(laterRun, /retained in C:\\private\\runtime\.json/);
});
