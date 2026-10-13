const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { executeBrowserBatches } = require('../scripts/run-browser-tests');
const { browserCaseList } = require('../scripts/run-browser-tests');
const { browserTestEnvironment } = require('../scripts/run-browser-tests');
const { coverageSummary } = require('../scripts/browser-coverage-reporter');

const outputRoot = path.join(os.tmpdir(), 'contractor-ai-browser-runner-contract');
const batches = [['e2e/first.spec.js:10'], ['e2e/second.spec.js:20'], ['e2e/third.spec.js:30']];

test('CI retains temporary browser candidate and failure evidence even when a run fails', () => {
  const workflow = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/verify.yml'), 'utf8');
  const browserStep = workflow.slice(workflow.indexOf('      - run: npm run test:browser'), workflow.indexOf('\n  windows-standalone:'));
  assert.ok(browserStep.includes('TMPDIR: ${{ runner.temp }}'));
  assert.ok(browserStep.includes('name: browser-candidate-evidence'));
  assert.ok(browserStep.includes('if: always()'));
  assert.ok(browserStep.includes('path: ${{ runner.temp }}/contractor-ai-browser-results-*'));
});

test('browser child environment excludes hosted storage, real credentials, paths, identity and node preloads', () => {
  const source = {
    NODE_ENV: 'production', CONTRACTOR_AI_RUNTIME_MODE: 'hosted', CONTRACTOR_AI_STORAGE_MODE: 's3',
    CONTRACTOR_AI_BIND_HOST: '0.0.0.0', CONTRACTOR_AI_DATABASE_URL: 'postgres://fixture.invalid',
    CONTRACTOR_AI_S3_SECRET_ACCESS_KEY: 'synthetic-secret', CONTRACTOR_AI_IDENTITY_ISSUER: 'https://fixture.invalid',
    CONTRACTOR_AI_AUTH_TOKEN: 'synthetic-token', CONTRACTOR_AI_DATA_DIR: '/operator-data',
    STATE_FILE: '/operator-state', LEDGER_DB_FILE: '/operator-ledger', UPLOAD_DIR: '/operator-files',
    CONTRACTOR_AI_HAI_FEED_PATH: '/operator-feed', CONTRACTOR_AI_AUTHORITY_KEY_FILE: '/operator-key',
    CONTRACTOR_AI_PUBLIC_URL: 'https://fixture.invalid', CONTRACTOR_AI_NGROK_ACTIVE: 'verified',
    NODE_OPTIONS: '--require ./unexpected.js', HTTPS_PROXY: 'https://fixture.invalid',
    DASHBOARD_AUTH_TOKEN: 'synthetic-token', UNKNOWN_PROVIDER_TOKEN: 'synthetic-secret',
    CONTRACTOR_AI_AUTONOMOUS_SCHEDULER_ENABLED: 'true', CONTRACTOR_AI_CHAT_AI_ENABLED: 'true',
    CONTRACTOR_AI_WHATSAPP_ENABLED: 'true', WEATHER_PROVIDER_ENABLED: 'true'
  };
  const unchanged = { ...source };
  const safe = browserTestEnvironment(source);
  assert.deepEqual(safe, {
    NODE_ENV: 'test', CONTRACTOR_AI_RUNTIME_MODE: 'local', CONTRACTOR_AI_STORAGE_MODE: 'local',
    CONTRACTOR_AI_BIND_HOST: '127.0.0.1', CONTRACTOR_AI_AUTONOMOUS_SCHEDULER_ENABLED: 'false',
    CONTRACTOR_AI_CHAT_AI_ENABLED: 'false', CONTRACTOR_AI_WHATSAPP_ENABLED: 'false', WEATHER_PROVIDER_ENABLED: 'false'
  });
  assert.deepEqual(source, unchanged);
});

test('browser child environment retains case-insensitive platform, CI and browser installation paths only', () => {
  const source = {
    Path: 'platform-path', SystemRoot: 'platform-root', TEMP: 'temporary-files', TMPDIR: 'temporary-files',
    HOME: 'home', USERPROFILE: 'profile', LOCALAPPDATA: 'local-appdata', LANG: 'nl_NL.UTF-8', TZ: 'Europe/Amsterdam',
    CI: 'true', PLAYWRIGHT_BROWSERS_PATH: 'browser-cache', CONTRACTOR_AI_VISUAL_QA_DIR: 'screenshots',
    contractor_ai_database_url: 'postgres://fixture.invalid', npm_config_registry: 'https://fixture.invalid'
  };
  const safe = browserTestEnvironment(source);
  for (const [key, value] of Object.entries(source)) {
    if (['contractor_ai_database_url', 'npm_config_registry'].includes(key)) assert.equal(Object.hasOwn(safe, key), false);
    else assert.equal(safe[key], value);
  }
});

test('ordinary browser runs stop after the first failed batch and retain its artifact location', async () => {
  const calls = [];
  const summary = await executeBrowserBatches(batches, {
    outputRoot,
    runBatch: async (selectors, outputDirectory) => {
      calls.push({ selectors, outputDirectory });
      return 1;
    }
  });
  assert.equal(summary.valid, false);
  assert.equal(summary.plannedBatches, 3);
  assert.equal(summary.executedBatches, 1);
  assert.equal(summary.continueOnFailure, false);
  assert.deepEqual(calls, [{ selectors: batches[0], outputDirectory: path.join(outputRoot, 'batch-001') }]);
  assert.deepEqual(summary.failedBatches, [{ batch: 1, status: 1, ...calls[0] }]);
});

test('browser audit continues through failures without losing their selectors or artifact directories', async () => {
  const calls = [];
  const announced = [];
  const statuses = [1, 0, 2];
  const summary = await executeBrowserBatches(batches, {
    outputRoot, continueOnFailure: true,
    onBatch: (index, selectors) => announced.push({ index, selectors }),
    runBatch: async (selectors, outputDirectory) => {
      calls.push({ selectors, outputDirectory });
      return statuses[calls.length - 1];
    }
  });
  assert.equal(summary.valid, false);
  assert.equal(summary.executedBatches, 3);
  assert.deepEqual(announced, batches.map((selectors, index) => ({ index, selectors })));
  assert.equal(new Set(calls.map(call => call.outputDirectory)).size, 3);
  assert.deepEqual(summary.failedBatches, [
    { batch: 1, status: 1, ...calls[0] },
    { batch: 3, status: 2, ...calls[2] }
  ]);
});

test('browser audit is successful only when every executed batch succeeds', async () => {
  const summary = await executeBrowserBatches(batches, { outputRoot, continueOnFailure: true, runBatch: async () => 0 });
  assert.equal(summary.valid, true);
  assert.equal(summary.executedBatches, summary.plannedBatches);
  assert.deepEqual(summary.failedBatches, []);
});

test('an unexpected runner exception is not swallowed as a successful audit', async () => {
  const failure = new Error('Fixture launch failed.');
  let calls = 0;
  await assert.rejects(executeBrowserBatches(batches, {
    outputRoot, continueOnFailure: true,
    runBatch: async () => { calls += 1; throw failure; }
  }), error => error === failure);
  assert.equal(calls, 1);
});

test('automatic browser selection uses exact file and title, not mutable source line numbers', () => {
  const original = [{ file: 'e2e/first.spec.js', line: 10, title: 'retains a > b literally' }];
  const moved = [{ ...original[0], line: 100 }];
  assert.equal(browserCaseList(original), browserCaseList(moved));
  assert.equal(browserCaseList(original), 'first.spec.js \u203A retains a > b literally');
  assert.throws(() => browserCaseList([{ ...original[0], title: 'first\nsecond' }]), /Invalid stable/);
});

test('browser coverage rejects missing, unexpected, duplicate and empty selections', () => {
  const expected = [{ file: 'e2e/first.spec.js', title: 'first' }, { file: 'e2e/second.spec.js', title: 'second' }];
  assert.equal(coverageSummary(expected, expected).valid, true);
  assert.equal(coverageSummary(expected, expected.slice(0, 1)).valid, false);
  assert.equal(coverageSummary(expected, [...expected, expected[0]]).valid, false);
  assert.equal(coverageSummary(expected, [...expected, { file: 'e2e/other.spec.js', title: 'other' }]).valid, false);
  assert.equal(coverageSummary([], []).valid, false);
  assert.equal(coverageSummary([expected[0], expected[0]], expected).valid, false);
});

test('the real coverage reporter fails an empty collection instead of accepting a no-test success', async () => {
  const Reporter = require('../scripts/browser-coverage-reporter');
  const reporter = Object.create(Reporter.prototype);
  reporter.expected = [{ file: 'e2e/first.spec.js', title: 'first' }];
  reporter.onBegin({}, { allTests: () => [] });
  assert.deepEqual(await reporter.onEnd(), { status: 'failed' });
  reporter.onBegin({}, { allTests: () => [{ title: 'first', location: {
    file: path.join(__dirname, '..', 'e2e', 'first.spec.js')
  } }] });
  reporter.onTestEnd({ title: 'first', location: { file: path.join(__dirname, '..', 'e2e', 'first.spec.js') } }, { status: 'passed' });
  assert.equal(await reporter.onEnd(), undefined);
});

test('a collected but skipped case fails the browser coverage gate', async () => {
  const Reporter = require('../scripts/browser-coverage-reporter');
  const reporter = Object.create(Reporter.prototype);
  const item = { title: 'first', location: { file: path.join(__dirname, '..', 'e2e', 'first.spec.js') } };
  reporter.expected = [{ file: 'e2e/first.spec.js', title: 'first' }];
  reporter.onBegin({}, { allTests: () => [item] });
  reporter.onTestEnd(item, { status: 'skipped' });
  assert.deepEqual(await reporter.onEnd(), { status: 'failed' });
});

test('installed Playwright collects one exact stable description without launching a browser', () => {
  const { discoverBrowserCases } = require('../scripts/run-browser-tests');
  const selected = discoverBrowserCases().find(item => item.file === 'e2e/auth-session.spec.js');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-browser-selection-'));
  try {
    const listPath = path.join(directory, 'test-list.txt');
    fs.writeFileSync(listPath, browserCaseList([{ ...selected, line: selected.line + 10000 }]));
    const result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test',
      '--test-list', listPath, '--list'], {
      cwd: path.join(__dirname, '..'), encoding: 'utf8', timeout: 30000, windowsHide: true,
      env: { ...process.env, CONTRACTOR_AI_BROWSER_RUNTIME_DIR: directory,
        CONTRACTOR_AI_BROWSER_LOCAL_PORT: '49131', CONTRACTOR_AI_BROWSER_AUTH_PORT: '49132' }
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.ok(result.stdout.includes(selected.title), result.stdout);
    assert.match(result.stdout, /Total: 1 test in 1 file/);
  } finally {
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('contractor-ai-browser-selection-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  }
});
