const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-shared-stock-api-'));
const tokens = {
  owner: 'shared-stock-owner-token-at-least-32-characters',
  approver: 'shared-stock-approver-token-at-least-32-characters',
  office: 'shared-stock-office-token-at-least-32-characters',
  field: { token: 'shared-stock-field-token-at-least-32-characters', workerId: 'worker-shared-stock' }
};
Object.assign(process.env, {
  NODE_ENV: 'test', CONTRACTOR_AI_RUNTIME_MODE: 'local', CONTRACTOR_AI_STORAGE_MODE: 'local', CONTRACTOR_AI_REQUIRE_AUTH: 'true',
  CONTRACTOR_AI_ROLE_TOKENS: JSON.stringify({ owner: tokens.owner, approver: tokens.approver, office_operator: tokens.office, field_worker: tokens.field }),
  STATE_FILE: path.join(stateDirectory, 'state.json'), LEDGER_DB_FILE: path.join(stateDirectory, 'ledger.sqlite'), UPLOAD_DIR: path.join(stateDirectory, 'uploads')
});
const app = require('../server');

async function request(baseUrl, route, { token = tokens.office, ...options } = {}) {
  const response = await fetch(`${baseUrl}${route}`, { ...options, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) } });
  return { response, body: await response.json() };
}

test('shared stock API retains counts, enforces reservation limits and denies field mutations', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await app.locals.runtimeControl.shutdown({ server, signal: 'shared_material_stock_api_test' }); fs.rmSync(stateDirectory, { recursive: true, force: true }); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = Date.now();
  const intake = await request(baseUrl, '/api/ledger/intake', { method: 'POST', body: JSON.stringify({ title: `Stock API ${suffix}`, clientName: 'Stock API client', status: 'scheduled', assignAutomatically: false }) });
  assert.equal(intake.response.status, 201);
  const counted = await request(baseUrl, '/api/ledger/material-stock/counts', { method: 'POST', body: JSON.stringify({ name: 'Cable drum', unit: 'drums', countedQuantity: 3, reference: `COUNT-${suffix}`, note: 'Counted at the warehouse', entryKey: `count-${suffix}` }) });
  assert.equal(counted.response.status, 201);
  assert.equal(counted.body.materials[0].stockQuantity, 3);
  const catalog = await request(baseUrl, '/api/ledger/material-stock/catalog');
  assert.equal(catalog.response.status, 200);
  assert.deepEqual(catalog.body.materials[0], {
    id: counted.body.materials[0].id, name: 'Cable drum', sku: null, unit: 'drums', stockQuantity: 3, reservedQuantity: 0, availableQuantity: 3
  });
  assert.equal(Object.hasOwn(catalog.body, 'allocations'), false);
  const fieldCatalog = await request(baseUrl, '/api/ledger/material-stock/catalog', { token: tokens.field.token });
  assert.equal(fieldCatalog.response.status, 403);
  assert.equal(fieldCatalog.body.error.code, 'insufficient_role');
  const requirement = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(intake.body.job.id)}/materials`, { method: 'POST', body: JSON.stringify({ name: 'Cable drum', quantity: 3, unit: 'drums' }) });
  assert.equal(requirement.response.status, 201);
  assert.equal(requirement.body.materialRequirement.materialId, counted.body.materials[0].id);
  const allocation = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(intake.body.job.id)}/material-stock-reservations`, {
    method: 'POST', body: JSON.stringify({ materialRequirementId: requirement.body.materialRequirement.id, quantity: 3, sourceReference: `COUNT-${suffix}`, entryKey: `reserve-${suffix}` })
  });
  assert.equal(allocation.response.status, 201);
  assert.equal(allocation.body.allocation.remainingQuantity, 3);
  const issue = await request(baseUrl, `/api/ledger/material-stock-reservations/${encodeURIComponent(allocation.body.allocation.id)}/issue`, {
    method: 'POST', body: JSON.stringify({ quantity: 2, dispatchReference: `PICK-${suffix}`, evidenceReference: `signed-pick-${suffix}`,
      expectedArrivalAt: new Date(Date.now() + 86_400_000).toISOString(), entryKey: `issue-${suffix}` })
  });
  assert.equal(issue.response.status, 201);
  assert.equal(issue.body.siteIssues.find(item => item.id === issue.body.issueId).status, 'in_transit');
  const unauthorizedArrival = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(intake.body.job.id)}/material-stock-site-issues/${encodeURIComponent(issue.body.issueId)}/receipts`, {
    token: tokens.field.token, method: 'POST', body: JSON.stringify({ receivedQuantity: 1, acceptedQuantity: 0, damagedQuantity: 0,
      receiptReference: `SITE-${suffix}`, location: 'Roof', evidenceReference: `photo-${suffix}`, entryKey: `site-${suffix}` })
  });
  assert.equal(unauthorizedArrival.response.status, 403);
  const worker = await request(baseUrl, '/api/ledger/workers', { method: 'POST', body: JSON.stringify({ id: 'worker-shared-stock', name: 'Field receiver', role: 'Installer', status: 'available' }) });
  assert.equal(worker.response.status, 201);
  const assignment = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(intake.body.job.id)}/assignments`, {
    method: 'POST', body: JSON.stringify({ workerId: 'worker-shared-stock', role: 'Installer' })
  });
  assert.equal(assignment.response.status, 201);
  const officeArrival = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(intake.body.job.id)}/material-stock-site-issues/${encodeURIComponent(issue.body.issueId)}/receipts`, {
    method: 'POST', body: JSON.stringify({ receivedQuantity: 1, acceptedQuantity: 0, damagedQuantity: 0,
      receiptReference: `OFFICE-SITE-${suffix}`, receivedBy: 'Office receiver', location: 'Roof',
      evidenceReference: `office-photo-${suffix}`, entryKey: `office-site-${suffix}` })
  });
  assert.equal(officeArrival.response.status, 201);
  const authorizedArrival = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(intake.body.job.id)}/material-stock-site-issues/${encodeURIComponent(issue.body.issueId)}/receipts`, {
    token: tokens.field.token, method: 'POST', body: JSON.stringify({ receivedQuantity: 1, acceptedQuantity: 0, damagedQuantity: 0,
      receiptReference: `SITE-${suffix}`, location: 'Roof', evidenceReference: `photo-${suffix}`, entryKey: `site-${suffix}` })
  });
  assert.equal(authorizedArrival.response.status, 201);
  assert.equal(authorizedArrival.body.receipt.receivedBy, 'Field receiver');
  assert.equal(Object.hasOwn(authorizedArrival.body.issue, 'allocationId'), false);
  assert.deepEqual(authorizedArrival.body.issue.receipts.map(receipt => receipt.id), [authorizedArrival.body.receipt.id]);
  assert.equal(JSON.stringify(authorizedArrival.body).includes('office-photo-'), false);
  assert.equal(JSON.stringify(authorizedArrival.body).includes('OFFICE-SITE-'), false);
  assert.equal(authorizedArrival.body.issue.pendingInspectionQuantity, 2);
  assert.equal(authorizedArrival.body.issue.acceptedQuantity, 0);
  const reviewRoute = `/api/ledger/jobs/${encodeURIComponent(intake.body.job.id)}/material-stock-site-issues/${encodeURIComponent(issue.body.issueId)}/receipts/${encodeURIComponent(authorizedArrival.body.receipt.id)}/reviews`;
  const reviewBody = { acceptedQuantity: 1, damagedQuantity: 0, expectedPendingInspectionQuantity: 1,
    reviewReference: `INSPECT-${suffix}`, evidenceReference: `inspection-photo-${suffix}`, entryKey: `review-${suffix}` };
  const fieldReview = await request(baseUrl, reviewRoute, { token: tokens.field.token, method: 'POST', body: JSON.stringify(reviewBody) });
  assert.equal(fieldReview.response.status, 403);
  const officeReview = await request(baseUrl, reviewRoute, { method: 'POST', body: JSON.stringify(reviewBody) });
  assert.equal(officeReview.response.status, 201);
  assert.equal(officeReview.body.review.acceptedQuantity, 1);
  assert.equal(officeReview.body.issue.pendingInspectionQuantity, 1);
  assert.equal(officeReview.body.issue.acceptedQuantity, 1);
  const reviewReplay = await request(baseUrl, reviewRoute, { method: 'POST', body: JSON.stringify(reviewBody) });
  assert.equal(reviewReplay.response.status, 201);
  assert.equal(reviewReplay.body.replayed, true);
  const staleReview = await request(baseUrl, reviewRoute, { method: 'POST', body: JSON.stringify({ ...reviewBody, entryKey: `review-stale-${suffix}` }) });
  assert.equal(staleReview.response.status, 409);
  assert.equal(staleReview.body.error.code, 'material_site_receipt_review_stale');
  const fieldWrite = await request(baseUrl, '/api/ledger/material-stock/counts', { token: tokens.field.token, method: 'POST', body: JSON.stringify({ materialId: counted.body.materials[0].id, countedQuantity: 5, reference: 'FIELD', note: 'Not permitted', entryKey: `field-${suffix}` }) });
  assert.equal(fieldWrite.response.status, 403);
  const shortage = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(intake.body.job.id)}/material-stock-reservations`, {
    method: 'POST', body: JSON.stringify({ materialRequirementId: requirement.body.materialRequirement.id, quantity: 1, sourceReference: `COUNT-${suffix}`, entryKey: `second-${suffix}` })
  });
  assert.equal(shortage.response.status, 409);
  assert.equal(shortage.body.error.code, 'material_requirement_already_reserved');
});
