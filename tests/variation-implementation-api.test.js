const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'variation-implementation-api-'));
const tokens = {
  owner: 'variation-implementation-owner-token-long-enough-01',
  office_operator: 'variation-implementation-office-token-long-enough-02',
  approver: 'variation-implementation-approver-token-long-enough-03',
  field_worker: 'variation-implementation-worker-token-long-enough-04'
};
Object.assign(process.env, {
  STATE_FILE: path.join(directory, 'state.json'),
  LEDGER_DB_FILE: path.join(directory, 'ledger.sqlite'),
  UPLOAD_DIR: path.join(directory, 'uploads'),
  CONTRACTOR_AI_REQUIRE_AUTH: 'true',
  CONTRACTOR_AI_ROLE_TOKENS: JSON.stringify({ ...tokens, field_worker: { token: tokens.field_worker, workerId: 'worker-unrelated' } })
});
const app = require('../server');

test('variation implementation API requires an authenticated office writer and protects approval roles', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await app.locals.runtimeControl.shutdown({ server, signal: 'variation_implementation_api_test' });
    fs.rmSync(directory, { recursive: true, force: true });
  });

  const base = `http://127.0.0.1:${server.address().port}`;
  const route = '/api/ledger/jobs/missing-job/change-orders/missing-change/implementation-plans';
  async function post(token) {
    const response = await fetch(base + route, {
      method: 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({ entryKey: 'api-variation-implementation-001', tasks: [{ title: 'Install panels', materials: [] }] })
    });
    return { status: response.status, body: await response.json() };
  }

  assert.equal((await post()).status, 401);
  assert.equal((await post(tokens.field_worker)).status, 403);
  assert.equal((await post(tokens.approver)).status, 403);
  const office = await post(tokens.office_operator);
  assert.equal(office.status, 404);
  assert.match(office.body.error.message, /Ledger job not found/i);
  const owner = await post(tokens.owner);
  assert.equal(owner.status, 404);
  assert.match(owner.body.error.message, /Ledger job not found/i);
});
