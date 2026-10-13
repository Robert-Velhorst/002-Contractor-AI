const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { WorkBalance } = require('../work-balance');
const { setupDelivery } = require('./work-delivery-contract');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'work-balance-api-'));
Object.assign(process.env, { STATE_FILE: path.join(directory, 'state.json'), LEDGER_DB_FILE: path.join(directory, 'ledger.sqlite'), UPLOAD_DIR: path.join(directory, 'uploads'), CONTRACTOR_AI_REQUIRE_AUTH: 'true' });
const tokens = { owner: 'work-balance-owner-token-at-least-32-characters', office_operator: 'work-balance-office-token-at-least-32-characters', approver: 'work-balance-approver-token-at-least-32-characters', field_worker: 'work-balance-field-token-at-least-32-characters' };
const ledger = new ContractorOperatingLedger({ dbFile: process.env.LEDGER_DB_FILE }), f = setupDelivery(ledger);
const balance = new WorkBalance(ledger), view = balance.read(f.job.id);
const request = balance.command(f.job.id, { action: 'plan', entryKey: 'api-work-balance-plan', sourceHash: view.sourceHash,
  record: { scopeConfirmed: true, reference: 'Approved production basis and package WP-01', reason: 'Allocate exact line quantity.', allocations: [{ lineKey: 'doors', packageId: f.pack.id, plannedQuantity: 2 }] } }, 'api-office');
Object.assign(process.env, { CONTRACTOR_AI_ROLE_TOKENS: JSON.stringify({ ...tokens, field_worker: { token: tokens.field_worker, workerId: f.worker.id } }) });
const fixture = { jobId: f.job.id, otherJobId: f.other.id, approvalId: request.approvalId, workerId: f.worker.id };
ledger.close();
const app = require('../server');

test('work-balance endpoints enforce authenticated operator and reviewer roles', async t => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await app.locals.runtimeControl.shutdown({ server, signal: 'work_balance_api_test' }); assert.ok(path.basename(directory).startsWith('work-balance-api-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`, route = `/api/ledger/jobs/${fixture.jobId}/work-balance`;
  async function requestApi(url, token, data) {
    const response = await fetch(base + url, { method: data ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  assert.equal((await requestApi(route)).status, 401);
  assert.equal((await requestApi(route, tokens.field_worker)).status, 403);
  const current = await requestApi(route, tokens.office_operator);
  assert.equal(current.status, 200);
  assert.equal(current.body.state, 'review_pending');
  assert.equal((await requestApi(route, tokens.approver, { action: 'plan' })).status, 403);
  assert.equal((await requestApi(`/api/ledger/approvals/${fixture.approvalId}/resolve?includeDashboard=false`, tokens.office_operator, { status: 'approved' })).status, 403);
  assert.equal((await requestApi(`/api/ledger/approvals/${fixture.approvalId}/resolve?includeDashboard=false`, tokens.approver, { status: 'approved' })).status, 200);
  const approved = await requestApi(route, tokens.owner);
  assert.equal(approved.body.state, 'reconciliation_required');
  assert.equal((await requestApi(`/api/ledger/jobs/${fixture.jobId}/work-pack`, tokens.field_worker)).body.pack.know.workContext.balance[0].rows[0].remainingQuantity, null);
  assert.equal((await requestApi(`/api/ledger/jobs/${fixture.otherJobId}/work-pack`, tokens.field_worker)).status, 403);
  const exported = await requestApi('/api/operations/export', tokens.owner);
  assert.equal(exported.body.workBalance.work_balance_plans.length, 1);
});
