const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { postgresTestDatabaseUrl, connectVerifiedPostgresClient } = require('./postgres-test-database');
const { cleanupRuntimeDirectory, createRuntimeDirectory, nodeTestEnvironment, runNodeTests } = require('../scripts/run-node-tests');
const connectionString = postgresTestDatabaseUrl();

test('Node child environment drops production credentials, paths, providers and executable hooks', () => {
  const source = { NODE_ENV: 'production', CONTRACTOR_AI_RUNTIME_MODE: 'hosted',
    CONTRACTOR_AI_STORAGE_MODE: 's3', CONTRACTOR_AI_DATA_DIR: '/private/operator',
    STATE_FILE: '/private/state', LEDGER_DB_FILE: '/private/ledger', UPLOAD_DIR: '/private/evidence',
    CONTRACTOR_AI_AUTH_TOKEN: 'synthetic-private-key', CONTRACTOR_AI_ROLE_TOKENS: 'synthetic-roles',
    CONTRACTOR_AI_DATABASE_URL: 'postgres://private.invalid', PGHOST: 'private.invalid', PGPASSWORD: 'synthetic-password',
    CONTRACTOR_AI_S3_SECRET_ACCESS_KEY: 'synthetic-storage-secret', CONTRACTOR_AI_IDENTITY_ISSUER: 'https://private.invalid',
    CONTRACTOR_AI_CHAT_AI_ENABLED: 'true', CONTRACTOR_AI_WHATSAPP_ENABLED: 'true',
    CONTRACTOR_AI_AUTONOMOUS_SCHEDULER_ENABLED: 'true', WEATHER_PROVIDER_ENABLED: 'true',
    NODE_OPTIONS: '--require ./unexpected.js', NODE_TLS_REJECT_UNAUTHORIZED: '0', NODE_TEST_CONTEXT: 'child-v8',
    HTTPS_PROXY: 'https://private.invalid', UNKNOWN_PROVIDER_TOKEN: 'synthetic-unknown-key',
  };
  const before = { ...source }, result = nodeTestEnvironment(source);
  assert.deepEqual(result, { NODE_ENV: 'test', CONTRACTOR_AI_RUNTIME_MODE: 'local',
    CONTRACTOR_AI_STORAGE_MODE: 'local', CONTRACTOR_AI_BIND_HOST: '127.0.0.1',
    CONTRACTOR_AI_AUTONOMOUS_SCHEDULER_ENABLED: 'false', CONTRACTOR_AI_CHAT_AI_ENABLED: 'false',
    CONTRACTOR_AI_WHATSAPP_ENABLED: 'false', WEATHER_PROVIDER_ENABLED: 'false' });
  assert.deepEqual(source, before);
});

test('Node environment retains platform keys and only guarded test database configuration', () => {
  const url = 'postgresql://fixture:fixture@localhost:1/contractor_ai_test_runner?sslmode=verify-full';
  const source = { Path: 'platform', SystemRoot: 'system', HOME: 'home', CI: 'true', TZ: 'Europe/Amsterdam',
    CONTRACTOR_AI_POSTGRES_TEST_URL: url, NODE_EXTRA_CA_CERTS: 'local-test-ca.crt',
    contractor_ai_database_url: 'postgres://private.invalid', npm_config_registry: 'https://private.invalid' };
  const result = nodeTestEnvironment(source);
  for (const key of ['Path', 'SystemRoot', 'HOME', 'CI', 'TZ', 'CONTRACTOR_AI_POSTGRES_TEST_URL', 'NODE_EXTRA_CA_CERTS']) {
    assert.equal(result[key], source[key]);
  }
  assert.equal(result.contractor_ai_database_url, undefined);
  assert.equal(result.npm_config_registry, undefined);
  assert.throws(() => nodeTestEnvironment({ CONTRACTOR_AI_POSTGRES_TEST_URL: 'postgres://private:secret@localhost/production' }),
    { code: 'unsafe_postgres_test_database' });
});

test('an explicit environment snapshot never inherits the parent test database', () => {
  const previous = process.env.CONTRACTOR_AI_POSTGRES_TEST_URL;
  try {
    process.env.CONTRACTOR_AI_POSTGRES_TEST_URL = 'postgresql://fixture:fixture@localhost:1/contractor_ai_test_parent?sslmode=verify-full';
    assert.equal(nodeTestEnvironment({}).CONTRACTOR_AI_POSTGRES_TEST_URL, undefined);
  } finally {
    if (previous === undefined) delete process.env.CONTRACTOR_AI_POSTGRES_TEST_URL;
    else process.env.CONTRACTOR_AI_POSTGRES_TEST_URL = previous;
  }
});

test('canonical Node runner isolates real children, defeats parent preloads and never touches an operator path', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-runner-proof-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const marker = path.join(directory, 'preload-marker'), operatorState = path.join(directory, 'operator-state.json');
  const receipt = path.join(directory, 'child-executed.json');
  fs.writeFileSync(operatorState, 'operator data must remain unchanged');
  const preload = path.join(directory, 'unexpected.cjs');
  fs.writeFileSync(preload, `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'unexpected parent preload');`);
  const fixture = path.join(directory, 'isolated.test.js');
  fs.writeFileSync(fixture, `const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('real child isolation',()=>{
assert.equal(process.env.UNKNOWN_PROVIDER_TOKEN,undefined);
assert.equal(process.env.CONTRACTOR_AI_AUTH_TOKEN,undefined);
assert.equal(process.env.NODE_OPTIONS,undefined);
assert.equal(process.env.CONTRACTOR_AI_CHAT_AI_ENABLED,'false');
assert.equal(process.env.CONTRACTOR_AI_WHATSAPP_ENABLED,'false');
assert.equal(process.env.NODE_ENV,'test');
const root=process.env.CONTRACTOR_AI_NODE_TEST_RUNTIME_DIR;
assert.ok(root&&path.basename(root).startsWith('contractor-ai-node-tests-'));
assert.equal(path.dirname(path.dirname(process.env.STATE_FILE)),root);
assert.ok(path.basename(path.dirname(process.env.STATE_FILE)).startsWith('process-'+process.pid+'-'));
assert.equal(path.basename(process.env.STATE_FILE),'state.json');
assert.notEqual(process.env.STATE_FILE,${JSON.stringify(operatorState)});
assert.equal(fs.existsSync(${JSON.stringify(marker)}),false);
fs.writeFileSync(process.env.STATE_FILE,'isolated fixture');
fs.writeFileSync(${JSON.stringify(receipt)},JSON.stringify({root,state:process.env.STATE_FILE}));
});`);
  const replacements = { UNKNOWN_PROVIDER_TOKEN: 'synthetic-private-provider-key',
    CONTRACTOR_AI_AUTH_TOKEN: 'synthetic-private-operator-key', STATE_FILE: operatorState,
    NODE_OPTIONS: `--require ${JSON.stringify(preload)}` };
  const previous = Object.fromEntries(Object.keys(replacements).map(key => [key, process.env[key]]));
  try {
    Object.assign(process.env, replacements);
    assert.equal(runNodeTests(['--test-concurrency=1', fixture]), 0);
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
  assert.equal(fs.readFileSync(operatorState, 'utf8'), 'operator data must remain unchanged');
  assert.equal(fs.existsSync(marker), false);
  const executed = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.equal(path.dirname(path.dirname(executed.state)), executed.root);
  assert.equal(fs.existsSync(executed.root), false, 'completed child storage must be cleaned');
});

test('test bootstrap refuses an arbitrary non-runner directory before creating storage', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-not-a-runner-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, ['--require', path.resolve(__dirname, '../scripts/node-test-runtime.js'), '-e', ''], {
    env: { ...nodeTestEnvironment(), CONTRACTOR_AI_NODE_TEST_RUNTIME_DIR: directory }, encoding: 'utf8', timeout: 10000,
  });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /invalid_node_test_runtime/);
  assert.deepEqual(fs.readdirSync(directory), []);
});

test('trusted bootstrap preserves fixture storage in native worker threads', t => {
  const root = createRuntimeDirectory();
  t.after(() => cleanupRuntimeDirectory(root));
  const source = `const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Worker}=require('node:worker_threads');
const initial=process.env.STATE_FILE;
assert.equal(path.dirname(path.dirname(initial)),process.env.CONTRACTOR_AI_NODE_TEST_RUNTIME_DIR);
assert.ok(path.basename(path.dirname(initial)).startsWith('process-'+process.pid+'-'));
assert.equal(path.basename(initial),'state.json');
const fixture=path.join(path.dirname(initial),'explicit-fixture-state.json');
fs.writeFileSync(fixture,'fixture-owned storage');process.env.STATE_FILE=fixture;
const worker=new Worker("require('node:worker_threads').parentPort.postMessage(process.env.STATE_FILE)",{eval:true});
worker.once('message',value=>{assert.equal(value,fixture);assert.equal(fs.readFileSync(value,'utf8'),'fixture-owned storage')});
worker.once('error',error=>{console.error(error);process.exitCode=1});
worker.once('exit',code=>{if(code!==0)process.exitCode=1});`;
  const result = spawnSync(process.execPath, ['--require', path.resolve(__dirname, '../scripts/node-test-runtime.js'), '-e', source], {
    env: { ...nodeTestEnvironment(), CONTRACTOR_AI_NODE_TEST_RUNTIME_DIR: root }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readdirSync(root).length, 1);
});

test('reused process identities never overwrite or collide with previous process storage', t => {
  const root = createRuntimeDirectory();
  t.after(() => cleanupRuntimeDirectory(root));
  const preload = path.resolve(__dirname, '../scripts/node-test-runtime.js');
  const source = `const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const previous=path.join(process.env.CONTRACTOR_AI_NODE_TEST_RUNTIME_DIR,'process-'+process.pid);
fs.mkdirSync(previous);fs.writeFileSync(path.join(previous,'state.json'),'previous process data');
require(${JSON.stringify(preload)});
assert.notEqual(path.dirname(process.env.STATE_FILE),previous);
assert.equal(fs.existsSync(path.dirname(process.env.STATE_FILE)),true);
assert.equal(fs.readFileSync(path.join(previous,'state.json'),'utf8'),'previous process data');`;
  const result = spawnSync(process.execPath, ['-e', source], {
    env: { ...nodeTestEnvironment(), CONTRACTOR_AI_NODE_TEST_RUNTIME_DIR: root }, encoding: 'utf8', timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
});

test('canonical Node runner preserves verified TLS for its disposable PostgreSQL child', { skip: !connectionString }, async t => {
  const { Client } = require('pg');
  const client = await connectVerifiedPostgresClient(new Client({ connectionString }));
  t.after(() => client.end());
  assert.equal((await client.query('SELECT current_database() AS name')).rows[0].name, new URL(connectionString).pathname.slice(1));
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-runner-tls-proof-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const fixture = path.join(directory, 'verified.test.js');
  fs.writeFileSync(fixture, `const test=require('node:test'),assert=require('node:assert/strict');
const {Client}=require(${JSON.stringify(require.resolve('pg'))});
test('verified child TLS',async()=>{const c=new Client({connectionString:process.env.CONTRACTOR_AI_POSTGRES_TEST_URL});
try{await c.connect();assert.equal(c.connection.stream.authorized,true);assert.ok((await c.query('SELECT 1 AS value')).rows[0].value===1)}finally{await c.end()}});`);
  assert.equal(runNodeTests(['--test-concurrency=1', fixture]), 0);
});
