const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { handoverSmokeCode } = require('./company-handover-smoke');
const { resourcePlannerSmokeCode } = require('./resource-planner-smoke');
const { resolvePackageTarget } = require('./build-windows-standalone');
const { verifyBundleBudget } = require('./verify-bundle-budget');

const packageRoot = resolvePackageTarget();
const runtimeExecutable = path.join(packageRoot, 'runtime', 'node.exe');

function delay(milliseconds) {
  return new Promise(resolve => setTimeout(resolve, milliseconds));
}

async function reservePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, resolve);
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : null;
  await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  assert.ok(Number.isInteger(port) && port > 0, 'Could not reserve a standalone smoke-test port.');
  return port;
}

async function requestJson(baseUrl, route, token, timeoutMs = 5_000, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      method: options.method || 'GET',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.body ? { 'Content-Type': 'application/json' } : {})
      },
      ...(options.body ? { body: JSON.stringify(options.body) } : {}),
      signal: controller.signal
    });
    const text = await response.text();
    return { response, text, body: text ? JSON.parse(text) : null };
  } finally {
    clearTimeout(timeout);
  }
}

async function waitForReadiness(baseUrl, token, child, stderr, timeoutMs = 45_000) {
  const deadline = Date.now() + timeoutMs;
  let lastFailure = 'no response';
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`Packaged runtime exited before readiness (${child.exitCode}): ${stderr()}`);
    }
    try {
      const result = await requestJson(baseUrl, '/api/readiness', token, 2_000);
      if (result.response.status === 200 && result.body?.status === 'ready') return result.body;
      lastFailure = `HTTP ${result.response.status}: ${result.text}`;
    } catch (error) {
      lastFailure = error.message;
    }
    await delay(250);
  }
  throw new Error(`Packaged runtime readiness timed out: ${lastFailure}`);
}

async function stopChild(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise(resolve => child.once('exit', () => resolve(true))),
    delay(8_000).then(() => false)
  ]);
  if (!exited && child.exitCode === null) {
    child.kill('SIGKILL');
    await new Promise(resolve => child.once('exit', resolve));
  }
}

function removeFixture(directory) {
  const resolved = path.resolve(directory);
  const tempRoot = path.resolve(os.tmpdir());
  if (!resolved.startsWith(`${tempRoot}${path.sep}`) || !path.basename(resolved).startsWith('contractor-ai-windows-package-')) {
    throw new Error(`Refusing to remove unexpected standalone fixture: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

async function verifyPackagedIdentity(fixtureRoot) {
  const port = await reservePort(), issuer = `http://127.0.0.1:${port}`;
  const directory = path.join(fixtureRoot, 'identity'), companiesFile = path.join(directory, 'companies.json');
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(companiesFile, '[]\n', { mode: 0o600 });
  const env = { ...process.env, NODE_ENV: 'production', CONTRACTOR_IDENTITY_MODE: 'local',
    CONTRACTOR_IDENTITY_ISSUER: issuer, CONTRACTOR_IDENTITY_HOST: '127.0.0.1', CONTRACTOR_IDENTITY_PORT: String(port),
    CONTRACTOR_IDENTITY_DB_FILE: path.join(directory, 'registry.sqlite'), CONTRACTOR_IDENTITY_DATABASE_URL: '',
    CONTRACTOR_IDENTITY_COMPANIES_FILE: companiesFile, CONTRACTOR_IDENTITY_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64'),
    CONTRACTOR_IDENTITY_BACKUP_KEY: crypto.randomBytes(32).toString('base64'),
    CONTRACTOR_IDENTITY_TRUST_PROXY: '' };
  function maintain(args, environment = env) {
    const result = spawnSync(runtimeExecutable, ['scripts/identity-maintenance.js', ...args], { cwd: packageRoot, env: environment, encoding: 'utf8', timeout: 20000, windowsHide: true });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(`${result.stdout}${result.stderr}`.includes(environment.CONTRACTOR_IDENTITY_ENCRYPTION_KEY), false);
    return JSON.parse(result.stdout);
  }
  let retainedKeys;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let stderr = '';
    const child = spawn(runtimeExecutable, ['identity-server.js'], { cwd: packageRoot, env, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-10000); });
    try {
      const deadline = Date.now() + 30000;
      let ready = false;
      while (Date.now() < deadline) {
        if (child.exitCode !== null) throw new Error(`Packaged identity stopped before readiness: ${stderr}`);
        try { const result = await requestJson(issuer, '/health/ready'); ready = result.response.ok && result.body.ready === true; } catch { /* Startup is asynchronous. */ }
        if (ready) break;
        await delay(250);
      }
      assert.equal(ready, true, 'The packaged account service must start using its own database and production dependencies.');
      const discovery = await requestJson(issuer, '/.well-known/openid-configuration');
      assert.equal(discovery.body.issuer, issuer);
      assert.ok(discovery.body.code_challenge_methods_supported.includes('S256'));
      const keys = await requestJson(issuer, new URL(discovery.body.jwks_uri).pathname);
      assert.equal(keys.body.keys.length, 1);
      assert.equal(Object.hasOwn(keys.body.keys[0], 'd'), false, 'Discovery must never expose the signing private key.');
      if (retainedKeys) assert.deepEqual(keys.body, retainedKeys, 'Packaged registry signing keys must survive restart.');
      retainedKeys = keys.body;
      const shell = await fetch(`${issuer}/identity.html`);
      assert.equal(shell.status, 200);
      assert.match(await shell.text(), /<div id="root"><\/div>/);
      const status = maintain(['status']);
      assert.equal(status.ready, true);
      if (attempt === 0) {
        const checkpoint = path.join(directory, 'checkpoint.json');
        maintain(['backup', '--output', checkpoint, '--actor', 'packaged-fixture', '--reference', 'Package recovery drill']);
        assert.equal(maintain(['verify', '--backup-file', checkpoint]).registryId, status.registryId);
        const restored = maintain(['restore', '--backup-file', checkpoint, '--expected-registry-id', status.registryId,
          '--bindings-output', path.join(directory, 'restored-bindings.json'), '--actor', 'packaged-fixture', '--reference', 'Package recovery drill',
          '--confirm', 'RESTORE_REGISTRY_WITHOUT_ACCESS'], { ...env, CONTRACTOR_IDENTITY_DB_FILE: path.join(directory, 'restored.sqlite'), CONTRACTOR_IDENTITY_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') });
        assert.equal(restored.credentialsRestored, false);
        assert.equal(restored.admissionRestored, false);
      }
    } finally { await stopChild(child); }
  }
  return { startup: true, restartPersistence: true, oidcDiscovery: true, isolatedDatabase: true, maintenanceBackupRestore: true };
}

function verifyPackagedBundle(directory, build) {
  assert.equal(build.bundleBudget?.valid, true, 'Rebuild the package with verified bundle-budget evidence before release.');
  const retained = JSON.parse(fs.readFileSync(path.join(directory, 'BUNDLE_BUDGET.json'), 'utf8'));
  const actual = verifyBundleBudget({ distDirectory: path.join(directory, 'dist') });
  assert.deepEqual(retained, actual, 'Packaged assets and limits must match their retained bundle evidence.');
  assert.equal(build.bundleBudget.assetCount, actual.assetCount);
  assert.deepEqual(build.bundleBudget.measurements, actual.measurements);
  return actual;
}

async function verifyWindowsStandalone() {
  assert.equal(process.platform, 'win32', 'The Windows package smoke test must run on Windows.');
  assert.ok(fs.existsSync(runtimeExecutable), 'Build the Windows standalone package before running its smoke test.');
  const build = JSON.parse(fs.readFileSync(path.join(packageRoot, 'BUILD.json'), 'utf8'));
  assert.equal(build.format, 'contractor-ai-windows-package/v1');
  assert.match(String(build.node || ''), /^24\.22\.0$/, 'The packaged runtime must use Node.js 24.22.0.');
  verifyPackagedBundle(packageRoot, build);

  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-windows-package-'));
  const port = await reservePort();
  const ownerToken = crypto.randomBytes(32).toString('base64url');
  const configDirectory = path.join(fixtureRoot, 'config');
  const haiFeedPath = path.join(fixtureRoot, 'connected-sources', 'contractor-ai.json');
  fs.mkdirSync(configDirectory, { recursive: true });
  fs.writeFileSync(path.join(configDirectory, 'runtime.json'), `${JSON.stringify({
    format: 'contractor-ai-windows-standalone/v1',
    ownerToken,
    port,
    createdAt: new Date().toISOString()
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });

  let stdout = '';
  let stderr = '';
  const child = spawn(runtimeExecutable, ['standalone-launcher.js'], {
    cwd: packageRoot,
    env: {
      ...process.env,
      CONTRACTOR_AI_STANDALONE_ROOT: fixtureRoot,
      CONTRACTOR_AI_OPEN_BROWSER: 'false',
      CONTRACTOR_AI_HAI_FEED_PATH: haiFeedPath
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });
  child.stdout.on('data', chunk => { stdout = `${stdout}${chunk}`.slice(-100_000); });
  child.stderr.on('data', chunk => { stderr = `${stderr}${chunk}`.slice(-100_000); });

  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    const readiness = await waitForReadiness(baseUrl, ownerToken, child, () => stderr);
    assert.equal(readiness.ledger?.migrations?.currentVersion, '097_durable_evidence_storage_reservations');
    for (const version of ['093_client_completion_office_review', '094_worker_notification_inbox', '095_field_reply_notifications', '096_loading_read_indexes', '097_durable_evidence_storage_reservations']) {
      assert.ok(readiness.ledger.migrations.applied.some(migration => migration.version === version), `${version} must be applied in the packaged ledger.`);
    }
    assert.deepEqual(readiness.ledger?.migrations?.pending, []);
    assert.ok(readiness.ledger?.migrations?.applied?.some(migration => migration.version === '071_data_subject_request_governance'));

    const session = await requestJson(baseUrl, '/api/session', ownerToken);
    assert.equal(session.response.status, 200);
    const company = session.body.company;
    assert.ok(company?.id && company?.ledgerId, 'Packaged runtime must retain a company environment.');
    assert.equal(session.body.operator.companyId, company.id);
    assert.equal(session.body.operator.ledgerId, company.ledgerId);
    assert.equal(session.response.headers.get('X-Contractor-Company'), company.id);
    assert.equal(session.response.headers.get('X-Contractor-Ledger'), company.ledgerId);
    for (const directory of [path.join(fixtureRoot, 'data'), path.join(fixtureRoot, 'data', 'uploads')]) {
      const marker = JSON.parse(fs.readFileSync(path.join(directory, '.contractor-company.json'), 'utf8'));
      assert.deepEqual(marker.company, company);
    }
    const foreignDownload = await requestJson(baseUrl, '/api/operations/export?__company=another-company', ownerToken);
    assert.equal(foreignDownload.response.status, 409);
    assert.equal(foreignDownload.body.error.code, 'company_runtime_mismatch');

    const operators = await requestJson(baseUrl, '/api/operations/operators', ownerToken);
    assert.equal(operators.response.status, 200);
    assert.equal(operators.body?.summary?.environment, 1);
    assert.equal(JSON.stringify(operators.body).includes(ownerToken), false);
    assert.equal(operators.body?.accounts?.some(account => Object.hasOwn(account, 'tokenHash')), false);

    const privacyRequests = await requestJson(baseUrl, '/api/operations/privacy/requests?status=all&limit=10', ownerToken);
    assert.equal(privacyRequests.response.status, 200);
    assert.deepEqual(privacyRequests.body?.requests, []);

    const portfolioReview = await requestJson(baseUrl, '/api/ledger/portfolio-review', ownerToken);
    assert.equal(portfolioReview.response.status, 200);
    assert.equal(portfolioReview.body?.coverage?.certification, false);
    assert.deepEqual(portfolioReview.body?.dossiers?.rows, []);
    const workPacks = await requestJson(baseUrl, '/api/ledger/work-packs', ownerToken);
    assert.equal(workPacks.response.status, 200);
    assert.deepEqual(workPacks.body.rows, []);
    const offlineShell = await fetch(`${baseUrl}/field-sw.js`);
    assert.equal(offlineShell.status, 200);
    assert.match(await offlineShell.text(), /contractor-field-shell-/);
    const disabledWhatsApp = await requestJson(baseUrl, '/api/integrations/whatsapp/webhook', null);
    assert.equal(disabledWhatsApp.response.status, 503);

    const capabilities = await requestJson(baseUrl, '/api/operations/capabilities', ownerToken);
    assert.equal(capabilities.response.status, 200);
    assert.equal(capabilities.body?.capabilities?.retention?.dataSubjectRequests, true);
    assert.equal(capabilities.body?.capabilities?.retention?.fullErasureClaimed, false);

    const manifest = await requestJson(baseUrl, '/api/integrations/hai/manifest', ownerToken);
    assert.equal(manifest.response.status, 200);
    assert.equal(manifest.body?.mode, 'read_only');
    assert.equal(manifest.body?.canExecute, false);
    assert.equal(manifest.body?.schema, 'accountfeed.GenericItem');
    assert.equal(manifest.body?.itemProvider, 'generic_json_feed');
    assert.equal(manifest.body?.itemType, 'document');
    assert.equal(manifest.body?.operationType, 'review_document');
    const haiStatus = await requestJson(baseUrl, '/api/integrations/hai/status', ownerToken);
    assert.equal(haiStatus.response.status, 200);
    assert.equal(haiStatus.body?.publication?.status, 'not_published');
    const haiPublication = await requestJson(baseUrl, '/api/integrations/hai/publish', ownerToken, 5_000, {
      method: 'POST',
      body: { limit: 100 }
    });
    assert.equal(haiPublication.response.status, 200);
    assert.equal(haiPublication.body?.publication?.status, 'published');
    assert.equal(haiPublication.body?.canExecute, false);
    assert.equal(haiPublication.body?.externalCommitments, 0);
    assert.ok(fs.existsSync(haiFeedPath));
    assert.equal(stdout.includes(ownerToken), false, 'A retained standalone owner key must not reappear in startup output.');
    const identityRuntime = await verifyPackagedIdentity(fixtureRoot);
    const handoverRun = spawnSync(runtimeExecutable, ['-e', handoverSmokeCode], { cwd: packageRoot, encoding: 'utf8', timeout: 60000, windowsHide: true });
    assert.equal(handoverRun.status, 0, handoverRun.stderr);
    const { packagedHandover } = JSON.parse(handoverRun.stdout);
    assert.equal(packagedHandover?.marker, true);
    const plannerRun = spawnSync(runtimeExecutable, ['-e', resourcePlannerSmokeCode], {
      cwd: packageRoot, encoding: 'utf8', timeout: 60000, windowsHide: true
    });
    assert.equal(plannerRun.status, 0, plannerRun.stderr);
    const resourcePlanning = JSON.parse(plannerRun.stdout);
    assert.equal(resourcePlanning.valid, true);
    assert.equal(resourcePlanning.packagedResourcePlanning, true);
    assert.equal(resourcePlanning.datedForecast, true);
    assert.equal(resourcePlanning.previewReadOnly, true);

    return {
      valid: true,
      verificationScope: 'isolated_windows_package',
      packageRoot,
      liveProvidersVerified: false,
      node: build.node,
      migration: readiness.ledger.migrations.currentVersion,
      pendingMigrations: readiness.ledger.migrations.pending.length,
      companyBoundaryVerified: true,
      operatorRegisterRedacted: true,
      privacyRegisterAvailable: true,
      portfolioReviewAvailable: true,
      haiReadOnly: true,
      haiContract: manifest.body.schema,
      haiLocalFeedPublished: true,
      haiDestination: 'isolated_local_fixture',
      packagedHandover,
      resourcePlanning,
      identityRuntime
    };
  } finally {
    await stopChild(child);
    removeFixture(fixtureRoot);
  }
}

if (require.main === module) {
  verifyWindowsStandalone()
    .then(result => process.stdout.write(`${JSON.stringify(result)}\n`))
    .catch(error => {
      process.stderr.write(`Windows standalone smoke test failed: ${error.message}\n`);
      process.exitCode = 1;
    });
}

module.exports = { removeFixture, reservePort, verifyPackagedBundle, verifyWindowsStandalone };
