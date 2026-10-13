const test = require('node:test');
const assert = require('node:assert/strict');

const ledgerId = '11111111-1111-4111-8111-111111111111';
const scope = `company:company-a:ledger:${ledgerId}:field_worker:shared-person`;

test('a browser page pins its environment and refuses stale-page requests or responses', async () => {
  const { createCompanyFetch } = await import('../company-request.mjs');
  let servedCompany = 'company-a';
  const seen = [];
  const request = createCompanyFetch(async (_url, options) => {
    seen.push(Object.fromEntries(options.headers));
    return new Response('{}', { headers: { 'X-Contractor-Company': servedCompany, 'X-Contractor-Ledger': ledgerId } });
  });
  assert.equal(request.url('/api/operations/export'), undefined, 'unbound links cannot navigate');
  await request('/api/session');
  const download = new URL(request.url('/api/operations/export?format=json'), 'http://localhost');
  assert.equal(download.searchParams.get('format'), 'json');
  assert.equal(download.searchParams.get('__company'), 'company-a');
  assert.equal(download.searchParams.get('__ledger'), ledgerId);
  assert.throws(() => request.url('/api/operations/export?__company=company-b'), { code: 'company_runtime_mismatch' });
  await request('/api/ledger/jobs', { method: 'POST', body: '{}' });
  assert.equal(seen[1]['x-contractor-company'], 'company-a');
  assert.equal(seen[1]['x-contractor-ledger'], ledgerId);
  const count = seen.length;
  await assert.rejects(request('/api/ledger/jobs', { headers: { 'X-Contractor-Company': 'company-b' } }), { code: 'company_runtime_mismatch' });
  await assert.rejects(request('https://external.invalid/api/jobs'));
  await assert.rejects(request('/api/../not-an-api'));
  assert.equal(seen.length, count);
  servedCompany = 'company-b';
  await assert.rejects(request('/api/session'), { code: 'company_runtime_mismatch' });
});

test('saved field drafts are bound to both company and ledger, never just an overlapping person ID', async () => {
  const { fieldOutboxOperatorScope, draftMatchesOperatorScope } = await import('../field-outbox.js');
  const operator = { authenticated: true, id: 'shared-person', role: 'field_worker', companyId: 'company-a', ledgerId };
  assert.equal(fieldOutboxOperatorScope(operator), scope);
  const other = fieldOutboxOperatorScope({ ...operator, companyId: 'company-b' });
  assert.notEqual(other, scope);
  assert.equal(draftMatchesOperatorScope({ operatorScope: scope }, other), false);
  assert.equal(draftMatchesOperatorScope({ operatorScope: 'field_worker:shared-person' }, scope), false);
  assert.equal(fieldOutboxOperatorScope({ role: 'field_worker', id: 'shared-person', authenticated: true }), '');
  assert.equal(draftMatchesOperatorScope({}, 'owner:local'), false);
});

test('legacy offline queues stay retained but cannot be silently attached to a company', async () => {
  const { synchronizeVault } = await import('../offline-work-packs.mjs');
  let calls = 0;
  const data = { scope: 'field_worker:shared-person', packs: [], queue: [{ payload: { message: 'Retain me' } }] };
  await assert.rejects(synchronizeVault(data, data.scope, async () => { calls++; }), /no verified company/);
  assert.equal(calls, 0);
  assert.equal(data.queue.length, 1);
});
