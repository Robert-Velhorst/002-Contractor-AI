const test = require('node:test');
const assert = require('node:assert/strict');
const { runDoctor } = require('../scripts/doctor');
const { assessNodeCompatibility, nodeCompatibilityIssue } = require('../scripts/node-compatibility');

test('checks the running app against the declared Node major version', () => {
  assert.deepEqual(assessNodeCompatibility('v22.18.0'), {
    status: 'supported', supported: true, actual: 'v22.18.0', required: '22.x'
  });
  assert.deepEqual(assessNodeCompatibility('v25.2.1'), {
    status: 'unsupported', supported: false, actual: 'v25.2.1', required: '22.x'
  });
  assert.equal(assessNodeCompatibility('unknown').status, 'unknown');
});

test('enforces the supported Node version in production and hosted modes only', () => {
  const unsupported = assessNodeCompatibility('v25.2.1');
  assert.equal(nodeCompatibilityIssue(unsupported, { isProduction: false, runtimeMode: 'local' }), null);
  assert.equal(nodeCompatibilityIssue(unsupported, { isProduction: true, runtimeMode: 'local' })?.code, 'unsupported_node_version');
  assert.equal(nodeCompatibilityIssue(unsupported, { isProduction: false, runtimeMode: 'hosted' })?.code, 'unsupported_node_version');
  assert.equal(nodeCompatibilityIssue(assessNodeCompatibility('v22.18.0'), { isProduction: true, runtimeMode: 'hosted' }), null);
});

test('does not report readiness when the application runs on an unsupported Node version', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    if (url.endsWith('/api/health/ready')) {
      return { ok: true, status: 200, json: async () => ({ status: 'ready' }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        format: 'contractor-ai-support-bundle/v1',
        application: { node: 'v25.2.1', runtimeMode: 'hosted' },
        database: { mode: 'postgres' },
        readiness: { runtimeReady: true }
      })
    };
  };
  try {
    const report = await runDoctor({ baseUrl: 'http://127.0.0.1:3000', token: '', timeoutMs: 1_000 });
    assert.equal(report.ready, false);
    assert.equal(report.runtimeCompatibility.node.status, 'unsupported');
  } finally {
    global.fetch = originalFetch;
  }
});

test('distinguishes a healthy local runtime from hosted runtime readiness', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => url.endsWith('/api/health/ready')
    ? { ok: true, status: 200, json: async () => ({ status: 'ready' }) }
    : {
      ok: true,
      status: 200,
      json: async () => ({
        format: 'contractor-ai-support-bundle/v1',
        application: { node: 'v22.18.0', runtimeMode: 'local' },
        database: { mode: 'sqlite' },
        readiness: { runtimeReady: true, storage: { mode: 'local' } }
      })
    };
  try {
    const report = await runDoctor({ baseUrl: 'http://127.0.0.1:3000', token: '', timeoutMs: 1_000 });
    assert.equal(report.ready, true);
    assert.equal(report.hostedRuntimeReady, false);
    assert.deepEqual(report.hostedRuntimeIssues, [
      'hosted_runtime_required', 'postgresql_required', 's3_object_storage_required'
    ]);
  } finally {
    global.fetch = originalFetch;
  }
});

test('reports hosted runtime readiness only with supported Node and durable provider modes', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => url.endsWith('/api/health/ready')
    ? { ok: true, status: 200, json: async () => ({ status: 'ready' }) }
    : {
      ok: true,
      status: 200,
      json: async () => ({
        format: 'contractor-ai-support-bundle/v1',
        application: { node: 'v22.18.0', runtimeMode: 'hosted' },
        database: { mode: 'postgres' },
        readiness: { runtimeReady: true, storage: { mode: 's3' } }
      })
    };
  try {
    const report = await runDoctor({ baseUrl: 'https://contractor.example.eu', token: 'owner', timeoutMs: 1_000 });
    assert.equal(report.ready, true);
    assert.equal(report.hostedRuntimeReady, true);
    assert.deepEqual(report.hostedRuntimeIssues, []);
    assert.deepEqual(report.deployment, { mode: 'hosted', databaseMode: 'postgres', storageMode: 's3' });
  } finally {
    global.fetch = originalFetch;
  }
});

test('reports endpoint connection failures without exposing raw network errors', async () => {
  const originalFetch = global.fetch;
  global.fetch = async url => {
    const error = new Error(`connect ECONNREFUSED ${url} bearer-secret`);
    error.code = 'ECONNREFUSED';
    throw error;
  };
  try {
    const report = await runDoctor({ baseUrl: 'http://127.0.0.1:3000', token: 'bearer-secret', timeoutMs: 1_000 });
    assert.equal(report.ready, false);
    assert.equal(report.readiness.status, 'connection_failed');
    assert.equal(report.support.status, 'connection_failed');
    assert.deepEqual(report.endpointFailures, [
      { endpoint: '/api/health/ready', code: 'connection_failed' },
      { endpoint: '/api/operations/support-bundle', code: 'connection_failed' }
    ]);
    assert.equal(JSON.stringify(report).includes('bearer-secret'), false);
    assert.equal(JSON.stringify(report).includes('ECONNREFUSED'), false);
  } finally {
    global.fetch = originalFetch;
  }
});

test('distinguishes endpoint timeouts from connection failures', async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => {
    const error = new Error('The operation was aborted');
    error.name = 'AbortError';
    throw error;
  };
  try {
    const report = await runDoctor({ baseUrl: 'http://127.0.0.1:3000', token: '', timeoutMs: 1_000 });
    assert.equal(report.readiness.status, 'timeout');
    assert.equal(report.support.status, 'timeout');
    assert.deepEqual(report.endpointFailures.map(failure => failure.code), ['timeout', 'timeout']);
  } finally {
    global.fetch = originalFetch;
  }
});
