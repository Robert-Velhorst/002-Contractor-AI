const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-review-api-'));
process.env.STATE_FILE = path.join(directory, 'state.json');
process.env.LEDGER_DB_FILE = path.join(directory, 'ledger.sqlite');
process.env.UPLOAD_DIR = path.join(directory, 'uploads');
const app = require('../server');

test('review API retains internal analysis and durable coverage with validated payloads', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await app.locals.runtimeControl.shutdown({ server, signal: 'contractor_review_api_test' });
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, data, method = 'POST') {
    const response = await fetch(base + route, data ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {});
    return { status: response.status, body: await response.json() };
  }
  const intake = await request('/api/ledger/intake', { title: 'Impact API', contractValue: 5000, scheduledStart: new Date(Date.now() + 60 * 60 * 1000).toISOString(), client: { name: 'Review customer' }, tasks: [{ title: 'Foundation', durationHours: 8 }], assignAutomatically: false });
  assert.equal(intake.status, 201);
  const job = intake.body.job;
  const takeoff = await request(`/api/ledger/jobs/${job.id}/takeoffs`, { title: 'Foundation quantity basis', items: [
    { description: 'Concrete pads', measurementType: 'manual', quantity: 4, unit: 'm3', unitCost: 120, unitPrice: 210, costCode: 'CON-100', wbsCode: '01.20', workPackage: 'Foundations' }
  ] });
  assert.equal(takeoff.status, 201);
  const takeoffItemsRoute = `/api/ledger/jobs/${job.id}/takeoffs/${takeoff.body.takeoff.id}/items`;
  for (const field of ['quantity', 'count', 'unitPrice']) {
    const invalidItem = { description: 'Untrusted numeric value', measurementType: field === 'quantity' ? 'manual' : 'count', unitPrice: 10 };
    invalidItem[field] = [4];
    const rejected = await request(takeoffItemsRoute, invalidItem);
    assert.equal(rejected.status, 400, `${field} array should be rejected: ${JSON.stringify(rejected.body)}`);
    assert.equal(rejected.body.error.code, 'takeoff_measurement_invalid');
  }
  const validItem = await request(takeoffItemsRoute, {
    description: 'Valid measured count', measurementType: 'count', count: '2', unitPrice: '10'
  });
  assert.equal(validItem.status, 201);
  assert.equal(validItem.body.item.quantity, 2);
  const rejectedUpdate = await request(`${takeoffItemsRoute}/${validItem.body.item.id}`, { count: [3] }, 'PUT');
  assert.equal(rejectedUpdate.status, 400);
  assert.equal(rejectedUpdate.body.error.code, 'takeoff_measurement_invalid');
  const material = await request(`/api/ledger/jobs/${job.id}/materials`, { name: 'Cement bags', quantity: 8, unit: 'bags', status: 'needed' });
  assert.equal(material.status, 201);
  const selection = await request(`/api/ledger/jobs/${job.id}/client-selections`, { title: 'Cement finish', options: ['Smooth', 'Brushed'] });
  assert.equal(selection.status, 201);
  const impactLinks = [{ targetType: 'material_requirement', targetId: material.body.materialRequirement.id, rationale: 'Finish changes determine the cement quantity.' }];
  const linkedDecision = await request(`/api/ledger/jobs/${job.id}/client-selections/${selection.body.clientSelection.id}/impact-links`, { links: impactLinks });
  assert.equal(linkedDecision.status, 200, JSON.stringify(linkedDecision.body));
  assert.deepEqual(linkedDecision.body.selection.data.impactLinks, impactLinks);
  const badImpactLink = await request(`/api/ledger/jobs/${job.id}/client-selections/${selection.body.clientSelection.id}/impact-links`, {
    links: [{ targetType: 'task', targetId: 'unrelated-task', rationale: 'Belongs to another job.' }]
  });
  assert.equal(badImpactLink.status, 409);
  const route = `/api/ledger/jobs/${job.id}/change-impact`;
  const source = await request(route);
  assert.equal(source.status, 200);
  const payload = { mode: 'preview', taskId: job.tasks[0].id, durationHours: 16, reason: 'Extra excavation', costDelta: 200,
    quantityChanges: [{ itemId: takeoff.body.takeoff.items[0].id, quantity: 6 }],
    materialChanges: [{ requirementId: material.body.materialRequirement.id, quantity: 12 }] };
  const preview = await request(route, payload);
  assert.equal(preview.status, 200);
  assert.equal(preview.body.review.status, 'internal_analysis');
  assert.equal(preview.body.review.quantityImpact.changes[0].costDelta, 240);
  assert.equal(preview.body.review.financial.costDelta, 440);
  assert.equal(preview.body.review.materialImpact.changes[0].proposedShortfall, 12);
  assert.equal((await request(`/api/ledger/jobs/${job.id}/takeoffs/${takeoff.body.takeoff.id}`)).body.takeoff.items[0].quantity, 4);
  const retainedPayload = { ...payload, mode: 'retain', sourceHash: preview.body.review.sourceHash, entryKey: 'api-review-1' };
  const retained = await request(route, retainedPayload);
  assert.equal(retained.status, 200);
  assert.equal((await request(route, retainedPayload)).body.replayed, true);
  assert.equal((await request(route)).body.reviews.length, 1);
  const retainedReview = (await request(route)).body.reviews[0];
  const variationPayload = {
    mode: 'prepare_variation',
    reviewId: retainedReview.id,
    sourceHash: retainedReview.sourceHash,
    entryKey: 'api-impact-variation-1',
    title: 'Additional excavation variation',
    scopeDelta: 'Excavate additional soil beyond the measured foundation scope.',
    amount: 900,
    scheduleDeltaDays: 1,
    variationType: 'unforeseen_condition',
    initiatedBy: 'site_condition'
  };
  const variation = await request(route, variationPayload);
  assert.equal(variation.status, 200, JSON.stringify(variation.body));
  assert.equal(variation.body.changeOrder.status, 'draft');
  assert.equal(variation.body.changeOrder.workAuthorized, false);
  assert.equal(variation.body.changeOrder.data.externalCommitments, 0);
  assert.equal((await request(route, variationPayload)).body.replayed, true);
  assert.equal((await request(route)).body.reviews[0].sourceCurrent, true);
  assert.equal((await request(route, { ...retainedPayload, costDelta: 10 })).status, 409);
  assert.equal((await request(route, { ...payload, durationHours: 'Infinity' })).status, 400);
  assert.equal((await request(route, { ...payload, mode: 'apply' })).status, 400);
  const batch = await request('/api/ledger/portfolio-review', { batchSize: 10 });
  assert.equal(batch.status, 200);
  assert.equal(batch.body.progress.complete, true);
  assert.equal(batch.body.progress.coverageVersion, batch.body.coverage.version);
  assert.equal(batch.body.progress.coverageIncomplete, 0);
  assert.equal(batch.body.coverage.sourceTables.length, 15);
  assert.equal(batch.body.coverage.checks.length, 10);
  assert.equal(batch.body.coverage.certification, false);
  assert.equal((await request('/api/ledger/portfolio-review', { batchSize: 10 })).body.ran, false);
  const dossiers = await request('/api/ledger/portfolio-review?limit=1');
  assert.equal(dossiers.body.dossiers.rows[0].id, job.id);
  const cycle = await request('/api/ledger/scheduler/run', { maxActions: 1 });
  assert.equal(cycle.status, 200);
  assert.equal(cycle.body.portfolioReview?.reason, 'not_due');
});
