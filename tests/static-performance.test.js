const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const zlib = require('node:zlib');

function rawAsset(url, encoding, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request(url, { method, headers: { 'Accept-Encoding': encoding } }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => resolve({ status: response.statusCode, headers: response.headers, body: Buffer.concat(chunks) }));
    });
    request.on('error', reject);
    request.setTimeout(10000, () => request.destroy(new Error('Asset fixture timed out.')));
    request.end();
  });
}

test('built dashboard uses immutable asset caching, no-store HTML, and compression', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-static-'));
  Object.assign(process.env, {
    NODE_ENV: 'test',
    CONTRACTOR_AI_DATA_DIR: directory,
    LEDGER_DB_FILE: path.join(directory, 'ledger.sqlite'),
    UPLOAD_DIR: path.join(directory, 'uploads')
  });
  delete process.env.CONTRACTOR_AI_AUTH_TOKEN;
  delete process.env.CONTRACTOR_AI_ROLE_TOKENS;
  delete process.env.CONTRACTOR_AI_REQUIRE_AUTH;
  delete require.cache[require.resolve('../server')];
  const app = require('../server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    const index = await fetch(baseUrl, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(index.status, 200);
    assert.equal(index.headers.get('cache-control'), 'no-store');
    const html = await index.text();
    const assetPath = html.match(/src="(\/assets\/[^"?]+\.js)"/)?.[1];
    assert.ok(assetPath, 'built JavaScript asset path');
    const brotliAsset = await fetch(`${baseUrl}${assetPath}`, { headers: { 'Accept-Encoding': 'br, gzip' } });
    assert.equal(brotliAsset.status, 200);
    assert.equal(brotliAsset.headers.get('content-encoding'), 'br');
    assert.match(brotliAsset.headers.get('content-type') || '', /javascript/);
    assert.match(brotliAsset.headers.get('vary') || '', /Accept-Encoding/i);
    assert.match(brotliAsset.headers.get('cache-control') || '', /immutable/);
    assert.ok((await brotliAsset.arrayBuffer()).byteLength > 1_024);
    const builtAssetPath = path.join(__dirname, '..', 'dist', assetPath.slice(1));
    const browserAsset = await rawAsset(`${baseUrl}${assetPath}`, 'gzip, deflate, br, zstd');
    assert.equal(browserAsset.status, 200);
    assert.equal(browserAsset.headers['content-encoding'], 'br');
    assert.deepEqual(zlib.brotliDecompressSync(browserAsset.body), fs.readFileSync(builtAssetPath));
    assert.deepEqual(browserAsset.body, fs.readFileSync(`${builtAssetPath}.br`), 'normal browser preference must reuse precompressed bytes');
    assert.equal(Number(browserAsset.headers['content-length']), browserAsset.body.length);
    for (const [encoding, expected] of [
      ['gzip, br', 'br'],
      ['br;q=0, gzip;q=1', 'gzip'],
      ['br;q=0.1, gzip;q=1', 'gzip'],
      ['br;q=0.2, identity;q=1', undefined],
      ['br;q=0, gzip;q=0, deflate;q=1', 'deflate'],
      ['identity', undefined]
    ]) {
      const response = await rawAsset(`${baseUrl}${assetPath}`, encoding);
      assert.equal(response.status, 200);
      assert.equal(response.headers['content-encoding'], expected, encoding);
      const decoded = expected === 'br' ? zlib.brotliDecompressSync(response.body)
        : expected === 'gzip' ? zlib.gunzipSync(response.body)
          : expected === 'deflate' ? zlib.inflateSync(response.body) : response.body;
      assert.deepEqual(decoded, fs.readFileSync(builtAssetPath), encoding);
      if (expected === 'br') assert.deepEqual(response.body, fs.readFileSync(`${builtAssetPath}.br`));
    }
    const head = await rawAsset(`${baseUrl}${assetPath}`, 'gzip, deflate, br, zstd', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.headers['content-encoding'], 'br');
    assert.equal(Number(head.headers['content-length']), browserAsset.body.length);
    assert.equal(head.body.length, 0);
    const decodedBrotliAsset = await fetch(`${baseUrl}${assetPath}`, { headers: { 'Accept-Encoding': 'br' } });
    assert.equal(await decodedBrotliAsset.text(), fs.readFileSync(builtAssetPath, 'utf8'));
    const gzipPreferredAsset = await fetch(`${baseUrl}${assetPath}`, {
      headers: { 'Accept-Encoding': 'br;q=0.1, gzip;q=1' }
    });
    assert.equal(gzipPreferredAsset.headers.get('content-encoding'), 'gzip');
    const asset = await fetch(`${baseUrl}${assetPath}`, { headers: { 'Accept-Encoding': 'gzip' } });
    assert.equal(asset.status, 200);
    assert.match(asset.headers.get('cache-control') || '', /immutable/);
    assert.equal(asset.headers.get('content-encoding'), 'gzip');
    assert.ok((await asset.arrayBuffer()).byteLength > 1_024);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});

test('Node test runner discovers every test exactly once and npm has no duplicate pretest hook', () => {
  const packageJson = require('../package.json');
  const { allTestFiles, postgresTestFiles, serialStressTestFiles, withTestConcurrency } = require('../scripts/run-node-tests');
  const files = allTestFiles();
  const postgresFiles = postgresTestFiles(files);
  const serialStressFiles = serialStressTestFiles(files);
  const concurrentFiles = files.filter(file => !serialStressFiles.includes(file));
  assert.equal(packageJson.scripts.pretest, undefined);
  assert.match(packageJson.scripts.test, /--test-concurrency=4(?:\s|$)/);
  assert.equal(new Set(files).size, files.length);
  assert.deepEqual(serialStressFiles, [
    'tests/evidence-storage-reservations.test.js',
    'tests/ledger-performance-benchmark.test.js'
  ]);
  assert.equal(new Set([...concurrentFiles, ...serialStressFiles]).size, files.length);
  assert.deepEqual([...concurrentFiles, ...serialStressFiles].sort((left, right) => left.localeCompare(right)), files);
  assert.ok(files.includes('tests/hai-connector.test.js'));
  assert.ok(files.includes('tests/windows-standalone.test.js'));
  assert.deepEqual(files, [...files].sort((left, right) => left.localeCompare(right)));
  assert.deepEqual(postgresFiles, [
    'tests/asset-history-postgres.test.js',
    'tests/client-delivery-postgres.test.js',
    'tests/company-handover-postgres.test.js',
    'tests/company-postgres.test.js',
    'tests/company-startup-postgres.test.js',
    'tests/conversation-analysis-postgres.test.js',
    'tests/evidence-storage-reservations.test.js',
    'tests/identity-postgres.test.js',
    'tests/inspection-coverage-postgres.test.js',
    'tests/loading-read-postgres.test.js',
    'tests/local-to-hosted-migration.test.js',
    'tests/node-test-runner.test.js',
    'tests/operations-safety.test.js',
    'tests/postgres-ledger-contract.test.js',
    'tests/postgres-test-database.test.js',
    'tests/startup-readiness.test.js',
    'tests/work-balance-postgres.test.js',
    'tests/work-context-postgres.test.js',
    'tests/work-delivery-postgres.test.js'
  ]);
  assert.deepEqual(withTestConcurrency(['--test-concurrency=4', '--test-reporter=spec'], 1), [
    '--test-concurrency=1',
    '--test-reporter=spec'
  ]);
});

test('browser runner discovers isolated bounded batches without duplicate workflows', () => {
  const { chunkBrowserTests, configuredBatchSize, discoverBrowserTests } = require('../scripts/run-browser-tests');
  const files = discoverBrowserTests();
  const batchSize = configuredBatchSize();
  const batches = chunkBrowserTests(files, batchSize);
  assert.equal(batchSize, 4);
  assert.ok(files.length > 131, 'new browser workflows must be included in discovery');
  assert.ok(files.some(file => file.startsWith('e2e/work-plan.spec.js:')));
  assert.equal(files.filter(file => file.startsWith('e2e/company-handover.spec.js:')).length, 1);
  assert.equal(files.filter(file => file.startsWith('e2e/company-offline.spec.js:')).length, 1);
  assert.equal(files.filter(file => file.startsWith('e2e/connected-experiences.spec.js:')).length, 2);
  assert.equal(files.filter(file => file.startsWith('e2e/field-work-pack.spec.js:')).length, 1);
  assert.equal(files.filter(file => file.startsWith('e2e/contractor-review.spec.js:')).length, 1);
  assert.equal(files.filter(file => file.startsWith('e2e/contractor-workbench.spec.js:')).length, 3);
  assert.equal(files.filter(file => file.startsWith('e2e/dashboard-design.spec.js:')).length, 2);
  assert.equal(files.filter(file => file.startsWith('e2e/work-board.spec.js:')).length, 4);
  assert.equal(files.filter(file => file.startsWith('e2e/work-balance.spec.js:')).length, 1);
  assert.equal(files.filter(file => file.startsWith('e2e/client-date-commitments.spec.js:')).length, 2);
  assert.equal(new Set(files).size, files.length);
  assert.equal(batches.flat().length, files.length);
  assert.ok(batches.every(batch => batch.length >= 1 && batch.length <= batchSize));
});

test('browser test servers use the same Node executable as the test runner', () => {
  const values = {
    CONTRACTOR_AI_BROWSER_RUNTIME_DIR: path.join(os.tmpdir(), 'contractor-ai-browser-config-contract'),
    CONTRACTOR_AI_BROWSER_LOCAL_PORT: '49101',
    CONTRACTOR_AI_BROWSER_AUTH_PORT: '49102'
  };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  const filename = require.resolve('../playwright.config');
  try {
    Object.assign(process.env, values);
    delete require.cache[filename];
    const config = require(filename);
    assert.equal(config.webServer.length, 2);
    for (const server of config.webServer) {
      assert.equal(server.command, `"${process.execPath}" server.js`);
      assert.equal(server.reuseExistingServer, false);
    }
  } finally {
    delete require.cache[filename];
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});

test('browser audit strips its runner-only flag while preserving Playwright selectors', () => {
  const { browserRunOptions } = require('../scripts/run-browser-tests');
  assert.deepEqual(browserRunOptions([]), { continueOnFailure: false, requestedTests: [] });
  assert.deepEqual(browserRunOptions(['--continue-on-failure']), { continueOnFailure: true, requestedTests: [] });
  assert.deepEqual(browserRunOptions(['e2e/accessibility.spec.js', '--continue-on-failure', '--project=operator-workflows']), {
    continueOnFailure: true, requestedTests: ['e2e/accessibility.spec.js', '--project=operator-workflows']
  });
});
