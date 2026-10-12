const assert = require('node:assert/strict');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { postgresTestDatabaseUrl, connectVerifiedPostgresClient } = require('./postgres-test-database');

test('PostgreSQL test guard accepts only explicit disposable loopback databases', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    const url = `postgresql://test:password@${host}:5432/contractor_ai_test_phase200?sslmode=verify-full`;
    assert.equal(postgresTestDatabaseUrl(url), url);
  }
  assert.equal(postgresTestDatabaseUrl('postgres://localhost/contractor_ai_test'), 'postgres://localhost/contractor_ai_test');
  assert.equal(postgresTestDatabaseUrl(''), undefined);
});

test('PostgreSQL test guard rejects production, remote, ambiguous and redirected targets without leaking credentials', () => {
  for (const value of [
    'not-a-url', 'postgresql://localhost/postgres',
    'postgresql://localhost/contractor_ai', 'postgresql://localhost/contractor_ai_test_backup/extra',
    'postgresql://db.example.test/contractor_ai_test', 'postgresql://127.0.0.2/contractor_ai_test',
    'postgresql://localhost.evil.test/contractor_ai_test', 'https://localhost/contractor_ai_test',
    'postgresql://localhost/contractor_ai_%74est', 'postgresql://localhost/contractor_ai_test#fragment',
    'postgresql://localhost/contractor_ai_test?host=production.example.test',
    'postgresql://localhost/contractor_ai_test?dbname=production',
    'postgresql://localhost/contractor_ai_test?sslmode=disable&sslmode=verify-full'
  ]) {
    assert.throws(() => postgresTestDatabaseUrl(value), { code: 'unsafe_postgres_test_database' });
  }
  assert.throws(() => postgresTestDatabaseUrl('postgresql://user:private-password@production.example.test/production'), error => {
    assert.equal(error.code, 'unsafe_postgres_test_database');
    assert.ok(!error.message.includes('private-password'));
    assert.ok(!error.message.includes('production.example.test'));
    return true;
  });
});

test('runner and direct database test invocation reject unsafe configuration before opening a connection', () => {
  const secret = 'never-print-this-test-secret';
  const env = { ...process.env, CONTRACTOR_AI_POSTGRES_TEST_URL: `postgresql://user:${secret}@localhost:1/production` };
  delete env.NODE_TEST_CONTEXT;
  for (const args of [
    ['scripts/run-node-tests.js', 'tests/company-postgres.test.js'],
    ['--test', 'tests/company-postgres.test.js']
  ]) {
    const result = spawnSync(process.execPath, args, {
      cwd: require('node:path').resolve(__dirname, '..'),
      env,
      encoding: 'utf8', timeout: 10_000
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert.match(result.stdout + result.stderr, /unsafe_postgres_test_database/);
    assert.ok(!(result.stdout + result.stderr).includes(secret));
    assert.doesNotMatch(result.stdout + result.stderr, /ECONNREFUSED/);
  }
});

test('every database integration file enters through the shared disposable-target guard', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const { postgresTestFiles } = require('../scripts/run-node-tests');
  const files = postgresTestFiles().filter(file => file !== 'tests/postgres-test-database.test.js');
  assert.equal(files.length, 17);
  assert.ok(files.includes('tests/company-startup-postgres.test.js'));
  for (const file of files) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', file), 'utf8');
    assert.match(source, /require\('\.\/postgres-test-database'\)/, file);
    assert.match(source, /const (?:connectionString|postgresTestUrl) = postgresTestDatabaseUrl\(\);/, file);
  }
});

test('verified PostgreSQL connection remains open for its owner to use and clean up', async () => {
  const calls = [];
  const client = { connection: { stream: { authorized: true } },
    async connect() { calls.push('connect'); }, async end() { calls.push('end'); } };
  assert.equal(await connectVerifiedPostgresClient(client), client);
  assert.deepEqual(calls, ['connect']);
});

for (const authorized of [undefined, false]) {
  test(`unverified PostgreSQL connection is closed before rejecting (${authorized})`, async () => {
    const calls = [];
    const client = { connection: { stream: { authorized } },
      async connect() { calls.push('connect'); }, async end() { calls.push('end'); } };
    await assert.rejects(() => connectVerifiedPostgresClient(client), /must use verified TLS/);
    assert.deepEqual(calls, ['connect', 'end']);
  });
}

test('failed PostgreSQL connection releases its client and preserves the original error', async () => {
  const failure = new Error('Fixture handshake failed');
  let ended = false;
  const client = { async connect() { throw failure; }, async end() { ended = true; } };
  await assert.rejects(() => connectVerifiedPostgresClient(client), error => error === failure);
  assert.equal(ended, true);
});

test('PostgreSQL cleanup failure cannot replace the handshake failure', async () => {
  const failure = new Error('Fixture handshake failed');
  const client = { async connect() { throw failure; }, async end() { throw new Error('Fixture close failed'); } };
  await assert.rejects(() => connectVerifiedPostgresClient(client), error => error === failure);
});

const connectionString = postgresTestDatabaseUrl();
test('real plaintext PostgreSQL rejection terminates instead of leaking its admin socket', { skip: !connectionString }, () => {
  const url = new URL(connectionString); url.searchParams.set('sslmode', 'disable');
  const env = { ...process.env, CONTRACTOR_AI_POSTGRES_TEST_URL: url.href };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, ['--test', 'tests/asset-history-postgres.test.js'], {
    cwd: require('node:path').resolve(__dirname, '..'), env, encoding: 'utf8', timeout: 10_000
  });
  assert.equal(result.error, undefined, 'failed TLS verification must release its socket and exit');
  assert.equal(result.status, 1);
  assert.match(result.stdout + result.stderr, /must use verified TLS/);
});
