const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setupDelivery } = require('./work-delivery-contract');
const { hierarchy } = require('./work-context-contract');
const { AssetHistory, verifyAssetHistory } = require('../asset-history');
const { ContractorReview } = require('../contractor-review');

function setupAssetHistory(ledger) {
  const f = setupDelivery(ledger), history = new AssetHistory(ledger);
  const contextCommand = (action, record, jobId = f.job.id) => f.context.command(jobId, { action, record, sourceHash: f.context.read(jobId).sourceHash, entryKey: randomUUID() }, 'context-owner');
  const places = hierarchy({ ...f, command: contextCommand });
  const asset = contextCommand('save_place', { type: 'asset', name: 'Ventilatie-unit bestaand', parentId: places.room.id }).record;
  const replacement = contextCommand('save_place', { type: 'asset', name: 'Ventilatie-unit vervangend', parentId: places.room.id }).record;
  contextCommand('save_package', { ...f.pack, placeId: places.room.id });
  const deliveryId = f.command('retain', f.input).deliveryId;
  const task = ledger.addTask(f.job.id, { title: 'Installatie voorbereiden', status: 'open' });
  const assetPackage = contextCommand('save_package', { code: 'ASSET', title: 'Ventilatie', outcome: 'Onderhoud ventilatie', placeId: asset.id, taskIds: [task.id], quantityIds: [] }).record;
  const command = (action, record, jobId = f.job.id) => history.command(jobId, { action, record, sourceHash: history.read(jobId).sourceHash, entryKey: randomUUID() }, 'asset-office');
  const input = { assetId: asset.id, kind: 'installed', deliveryId, performedAt: '2026-09-02', summary: 'Private office execution notes' };
  return { ...f, ...places, history, contextCommand, asset, replacement, assetPackage, deliveryId, input, command };
}

function verifyAssetContract(ledger) {
  const f = setupAssetHistory(ledger), { history, command, job, asset, replacement, input } = f;
  command('profile', { assetId: asset.id, manufacturer: 'Fixture', model: 'Vent-1', serialNumber: 'UNIT-001', reason: 'Typeplaat gecontroleerd' });
  const eventId = command('record', input).eventIds[0];
  assert.equal(history.source(job.id).find(row => row.asset.id === asset.id).events[0].sourceCurrent, true);
  assert.throws(() => command('record', input), { statusCode: 409 });
  assert.throws(() => command('record', { ...input, kind: 'repaired', performedAt: '2026-08-30' }), { statusCode: 400 });
  assert.throws(() => command('record', { ...input, kind: 'repaired', performedAt: '2099-02-31' }), { statusCode: 400 });
  assert.throws(() => command('profile', { assetId: asset.id, serialNumber: 'OTHER-UNIT', reason: 'Not a replacement workflow' }), { statusCode: 409 });
  assert.equal(history.field(job.id, [f.assetPackage.id])[0].events.length, 0);
  command('share', { assetId: asset.id, id: eventId, enabled: true, fieldSummary: 'Filter en aansluiting gecontroleerd.' });
  const field = history.field(job.id, [f.assetPackage.id]);
  assert.equal(field[0].events[0].summary, 'Filter en aansluiting gecontroleerd.');
  for (const secret of ['Private office', 'deliveryId', 'source', 'jobId']) assert.equal(JSON.stringify(field).includes(`"${secret}"`), false);
  assert.equal(JSON.stringify(field).includes('Private office'), false);
  assert.equal(history.field(job.id, []).length, 0);
  assert.equal(history.field(job.id, [f.pack.id]).length, 0);

  const warranty = ledger.createWarrantyClaim(job.id, { title: 'Private warranty dispute', issue: 'Financial claim data', status: 'open' });
  const aftercare = ledger.addAftercareItem(job.id, { title: 'Controle na onderhoud', owner: 'Office', dueAt: '2026-10-01' });
  const plan = ledger.createRecurringPlan(job.id, { service: 'Ventilatie', intervalRule: 'yearly', nextDueAt: '2026-10-01', notes: 'Private service agreement' });
  for (const [kind, id] of [['warranty', warranty.id], ['aftercare', aftercare.id], ['recurring', plan.id]]) command('link', { assetId: asset.id, kind, recordIds: [id] });
  assert.equal(history.source(job.id).find(row => row.asset.id === asset.id).links.length, 3);
  const followUp = command('prepare_recurring', { assetId: asset.id, planId: plan.id });
  const nextId = followUp.preparedJobId;
  assert.ok(nextId);
  assert.equal(command('prepare_recurring', { assetId: asset.id, planId: plan.id }).preparedJobId, nextId);
  command('link', { assetId: replacement.id, kind: 'recurring', recordIds: [plan.id] });
  assert.throws(() => command('prepare_recurring', { assetId: asset.id, planId: plan.id }), { statusCode: 409 });
  command('link', { assetId: replacement.id, kind: 'recurring', recordIds: [] });
  const nextContext = f.context.read(nextId);
  assert.equal(nextContext.packages.length, 1);
  assert.equal(nextContext.packages[0].placeId, asset.id);
  assert.ok(nextContext.tasks.every(row => row.status === 'open' && !row.assigneeId));
  assert.equal(history.source(nextId).find(row => row.asset.id === asset.id).events[0].id, eventId);
  const nextField = history.field(nextId, [nextContext.packages[0].id]);
  assert.equal(nextField[0].events[0].summary, 'Filter en aansluiting gecontroleerd.');
  for (const secret of ['Private warranty', 'Financial claim', 'Private service', job.id, warranty.id]) assert.equal(JSON.stringify(nextField).includes(secret), false);
  command('share', { assetId: asset.id, id: eventId, enabled: false });
  assert.equal(history.field(nextId, [nextContext.packages[0].id])[0].events.length, 0);

  const pair = command('replace', { ...input, replacementAssetId: replacement.id, summary: 'Oude unit verwijderd, nieuwe unit gemonteerd.' });
  assert.equal(pair.eventIds.length, 2);
  assert.equal(history.source(job.id).find(row => row.asset.id === replacement.id).events[0].kind, 'installed');
  command('void', { assetId: asset.id, id: pair.eventIds[0], reason: 'Registratie had betrekking op andere units.' });
  const pairRows = ledger.db.prepare('SELECT status FROM asset_service_events WHERE replacement_id IS NOT NULL').all();
  assert.ok(pairRows.every(row => row.status === 'voided'));
  const correction = f.delivery.command(job.id, { action: 'request_void', record: { id: f.deliveryId, reason: 'Verkeerde uitvoeringsbron' }, sourceHash: f.delivery.read(job.id).sourceHash, entryKey: randomUUID() }, 'owner');
  ledger.resolveApproval(correction.approvalId, { status: 'approved', resolvedBy: 'reviewer' });
  assert.equal(history.source(job.id).find(row => row.asset.id === asset.id).events.find(row => row.id === eventId).sourceCurrent, false);
  assert.ok(new ContractorReview(ledger).inspect(job.id).issues.some(issue => issue.code === 'asset_history_source_changed'));
  assert.equal(verifyAssetHistory(ledger.db).valid, true);
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
  return f;
}
module.exports = { setupAssetHistory, verifyAssetContract };
