const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { TABLES, verifyAssetHistory } = require('../asset-history');
const { setupAssetHistory, verifyAssetContract } = require('./asset-history-contract');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'asset-history-test-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => { ledger.close(); assert.ok(path.basename(directory).startsWith('asset-history-test-')); fs.rmSync(directory, { recursive: true, force: true }); });
  return ledger;
}
test('installed asset service history, replacement, recurring preparation and worker privacy remain connected', t => verifyAssetContract(fixture(t)));
test('asset history retains exact retries without leaking old private responses and refuses stale/conflicting commands', t => {
  const f = setupAssetHistory(fixture(t));
  const input = { action: 'record', record: f.input, entryKey: randomUUID(), sourceHash: f.history.read(f.job.id).sourceHash };
  const first = f.history.command(f.job.id, input, 'office');
  assert.equal(f.history.command(f.job.id, input, 'office').eventIds[0], first.eventIds[0]);
  assert.equal(f.history.command(f.job.id, input, 'office').replayed, true);
  assert.throws(() => f.history.command(f.job.id, { ...input, entryKey: randomUUID() }, 'office'), { statusCode: 409 });
  assert.throws(() => f.history.command(f.job.id, { ...input, record: { ...input.record, summary: 'Changed' } }, 'office'), { statusCode: 409 });
  assert.equal(JSON.stringify(first).includes('Private office'), false);
  assert.throws(() => f.command('record', f.input, f.other.id), { statusCode: 404 });
});
test('historical evidence stays private after correction and cannot claim untraceable or foreign work', t => {
  const ledger = fixture(t), f = setupAssetHistory(ledger);
  const evidence = ledger.addDocument(f.job.id, { title: 'Private prior service report', type: 'asset_history_evidence', data: { reference: 'Archive report A1' } });
  const input = { ...f.input, kind: 'prior_record', documentId: evidence.id };
  const id = f.command('record', input).eventIds[0];
  assert.ok(f.history.privateEvidenceIds(f.job.id).has(evidence.id));
  const metadataOnly = ledger.addDocument(f.job.id, { title: 'No actual evidence' });
  assert.throws(() => f.command('record', { ...input, documentId: metadataOnly.id }), { statusCode: 400 });
  const foreign = ledger.addDocument(f.other.id, { title: 'Other customer', data: { reference: 'Foreign' } });
  assert.throws(() => f.command('record', { ...input, documentId: foreign.id }), { statusCode: 409 });
  ledger.db.prepare("UPDATE documents SET status = 'quarantined' WHERE id = ?").run(evidence.id);
  assert.equal(f.history.source(f.job.id).find(row => row.asset.id === f.asset.id).events[0].sourceCurrent, false);
  f.command('void', { assetId: f.asset.id, id, reason: 'Wrong document' });
  assert.ok(f.history.privateEvidenceIds(f.job.id).has(evidence.id));
});
test('asset history backup detects source tampering and all new tables retain authority guards', t => {
  const ledger = fixture(t), f = setupAssetHistory(ledger), id = f.command('record', f.input).eventIds[0];
  f.command('profile', { assetId: f.asset.id, serialNumber: 'UNIT-1', reason: 'Typeplaat' });
  const aftercare = ledger.addAftercareItem(f.job.id, { title: 'Follow up' });
  f.command('link', { assetId: f.asset.id, kind: 'aftercare', recordIds: [aftercare.id] });
  const { verifySqliteBackupDatabase } = require('../scripts/restore-local-backup');
  assert.equal(verifySqliteBackupDatabase(ledger.dbFile).valid, true);
  ledger.db.prepare("UPDATE asset_service_events SET snapshot_hash = 'changed' WHERE id = ?").run(id);
  assert.throws(() => verifySqliteBackupDatabase(ledger.dbFile), /controlesom/);
  assert.throws(() => verifyAssetHistory(ledger.db), { statusCode: 409 });
  assert.ok(ledger.diagnose().issues.some(row => /Installed asset history/.test(row.message)));
  ledger.db.exec("INSERT INTO company_authority (id,environment_id,generation,status,public_key,details_json,updated_at) VALUES ('current','fixture',1,'frozen','fixture','{}','fixture')");
  for (const table of TABLES) assert.throws(() => ledger.db.exec(`DELETE FROM ${table}`), /company_authority_blocked/);
});
test('replacement failure rolls back both sides and rejects a single physical identity', t => {
  const ledger = fixture(t), f = setupAssetHistory(ledger);
  f.command('record', { ...f.input, assetId: f.replacement.id });
  const count = ledger.db.prepare('SELECT count(*) AS n FROM asset_service_events').get().n;
  assert.throws(() => f.command('replace', { ...f.input, replacementAssetId: f.replacement.id }), { statusCode: 409 });
  assert.equal(ledger.db.prepare('SELECT count(*) AS n FROM asset_service_events').get().n, count);
  assert.throws(() => f.command('replace', { ...f.input, replacementAssetId: f.asset.id }), { statusCode: 400 });
});
test('sharing can be withdrawn from an archived source job without reopening operational writes', t => {
  const ledger = fixture(t), f = setupAssetHistory(ledger), id = f.command('record', f.input).eventIds[0];
  f.command('share', { assetId: f.asset.id, id, enabled: true, fieldSummary: 'Previously shared operational summary' });
  ledger.db.prepare("UPDATE jobs SET status = 'archived' WHERE id = ?").run(f.job.id);
  f.command('share', { assetId: f.asset.id, id, enabled: false });
  assert.equal(f.history.field(f.job.id, [f.assetPackage.id])[0].events.length, 0);
  assert.throws(() => f.command('share', { assetId: f.asset.id, id, enabled: true, fieldSummary: 'Re-enable' }), { code: 'job_inactive_read_only' });
  assert.throws(() => f.command('record', { ...f.input, kind: 'repaired' }), { code: 'job_inactive_read_only' });
});
test('changed asset scope does not silently reuse an incomplete maintenance preparation', t => {
  const ledger = fixture(t), f = setupAssetHistory(ledger);
  const plan = ledger.createRecurringPlan(f.job.id, { service: 'Ventilation', nextDueAt: '2026-10-01' });
  f.command('link', { assetId: f.asset.id, kind: 'recurring', recordIds: [plan.id] });
  const draft = f.command('prepare_recurring', { assetId: f.asset.id, planId: plan.id });
  f.command('link', { assetId: f.replacement.id, kind: 'recurring', recordIds: [plan.id] });
  const before = ledger.db.prepare('SELECT count(*) AS n FROM jobs').get().n;
  assert.throws(() => f.command('prepare_recurring', { assetId: f.asset.id, planId: plan.id }), { statusCode: 409 });
  assert.equal(ledger.db.prepare('SELECT count(*) AS n FROM jobs').get().n, before);
  assert.equal(f.context.read(draft.preparedJobId).packages.length, 1);
});
