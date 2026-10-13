const test = require('node:test');
const assert = require('node:assert/strict');
const { assessNodeCompatibility, runDoctor } = require('../scripts/doctor');

test('checks the running app against the declared Node major version', () => {
  assert.deepEqual(assessNodeCompatibility('v22.18.0'), {
    status: 'supported', supported: true, actual: 'v22.18.0', required: '22.x'
  });
  assert.deepEqual(assessNodeCompatibility('v25.2.1'), {
    status: 'unsupported', supported: false, actual: 'v25.2.1', required: '22.x'
  });
  assert.equal(assessNodeCompatibility('unknown').status, 'unknown');
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
        application: { node: 'v25.2.1' },
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
