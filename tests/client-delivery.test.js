const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { TABLES, verifyClientDelivery } = require('../client-delivery');
const { setupClientDelivery, verifyClientDeliveryContract } = require('./client-delivery-contract');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'client-delivery-test-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => { ledger.close(); assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir())); assert.ok(path.basename(directory).startsWith('client-delivery-test-')); fs.rmSync(directory, { recursive: true, force: true }); });
  return ledger;
}
function published(f, ledger) { const created = f.clientCommand('offer', f.offer); ledger.resolveApproval(created.approvalId, { status: 'approved' }, { actor: 'reviewer' }); return created; }
test('client partial delivery is scoped, immutable, approval-gated and independent of safety, finance and job closure', t => verifyClientDeliveryContract(fixture(t)));
test('client publication and response exact retries, rollback and single active offer', t => {
  const ledger = fixture(t), f = setupClientDelivery(ledger);
  const input = { action: 'offer', record: f.offer, entryKey: 'stable-offer-key', sourceHash: f.clients.read(f.job.id).sourceHash };
  const created = f.clients.command(f.job.id, input, 'office');
  assert.equal(f.clients.command(f.job.id, input, 'office').offerId, created.offerId);
  assert.equal(f.clients.command(f.job.id, input, 'office').replayed, true);
  assert.throws(() => f.clients.command(f.job.id, { ...input, record: { ...f.offer, title: 'Changed' } }, 'office'), { statusCode: 409 });
  assert.throws(() => f.clientCommand('offer', f.offer), { statusCode: 409 });
  ledger.resolveApproval(created.approvalId, { status: 'approved' }, { actor: 'reviewer' });
  const before = ledger.db.prepare('SELECT count(*) AS n FROM documents').get().n, original = f.clients.delivery.request;
  f.clients.delivery.request = () => { throw new Error('Simulated transactional failure'); };
  const response = f.clientResponse(created.offerId);
  assert.throws(() => f.clients.submit(f.access.id, created.offerId, response), /Simulated/);
  assert.equal(ledger.db.prepare('SELECT count(*) AS n FROM documents').get().n, before);
  assert.equal(f.clients.chat.list(f.access.id).messages.length, 0);
  f.clients.delivery.request = original;
  f.clients.submit(f.access.id, created.offerId, response);
  assert.throws(() => f.clients.submit(f.access.id, created.offerId, { ...response, entryKey: 'different-key' }), { statusCode: 409 });
  assert.equal(f.clients.read(f.job.id).offers[0].response.status, 'pending_review');
});
test('foreign access, unpublished photos, missing authority and malformed public scope are rejected', t => {
  const ledger = fixture(t), f = setupClientDelivery(ledger);
  const other = ledger.createClientPortalAccess(f.job.id); ledger.resolveApproval(other.approval.id, { status: 'approved' });
  const privatePhoto = f.clients.chat.create(f.access.id, { entryKey: 'private-photo', body: 'Private draft' }, { direction: 'outbound', attachment: { originalName: 'detail.png', mimeType: 'image/png', size: 20, sha256: 'a'.repeat(64), storageRef: 'private/test.png' } });
  assert.throws(() => f.clientCommand('offer', { ...f.offer, photoIds: [privatePhoto.id] }), { statusCode: 404 });
  assert.throws(() => f.clientCommand('offer', { ...f.offer, scopeConfirmed: false }), { statusCode: 400 });
  assert.throws(() => f.clientCommand('offer', { ...f.offer, expiresAt: '2000-01-01T00:00:00Z' }), { statusCode: 400 });
  const offered = published(f, ledger), input = f.clientResponse(offered.offerId);
  assert.throws(() => f.clients.submit(other.id, offered.offerId, input), { statusCode: 404 });
  assert.equal(f.clients.portal(other.id).offers.length, 0);
  assert.throws(() => f.clients.submit(f.access.id, offered.offerId, { ...input, authorityConfirmed: false }), { statusCode: 400 });
  assert.throws(() => f.clients.submit(f.access.id, offered.offerId, { ...input, photoIds: [privatePhoto.id] }), { statusCode: 404 });
  assert.throws(() => f.clients.submit(f.access.id, offered.offerId, { ...input, note: '' }), { statusCode: 400 });
});
test('published and customer photos join the retained response; changed photo metadata blocks review', t => {
  const ledger = fixture(t), f = setupClientDelivery(ledger);
  const photo = f.clients.chat.create(f.access.id, { entryKey: 'customer-photo', body: 'Kras op de deur' }, { attachment: { originalName: 'detail.png', mimeType: 'image/png', size: 20, sha256: 'a'.repeat(64), storageRef: 'private/test.png' } });
  f.offer.photoIds = [photo.id]; const offered = published(f, ledger);
  const input = { ...f.clientResponse(offered.offerId), photoIds: [photo.id] };
  assert.equal(f.clients.portal(f.access.id).offers[0].photos[0].id, photo.id);
  f.clients.submit(f.access.id, offered.offerId, input);
  const response = f.clients.read(f.job.id).offers[0].response;
  assert.equal(response.photos[0].filename, 'detail.png');
  const source = f.clients.chat.message(f.access.id, photo.id);
  ledger.db.prepare("UPDATE documents SET status = 'quarantined' WHERE id = ?").run(source.attachment.documentId);
  assert.throws(() => ledger.resolveApproval(response.approvalId, { status: 'approved', reason: 'Verified customer and source' }), { statusCode: 409 });
});
test('changed execution, revoked links, expired offers and withdrawal prevent new customer reliance', t => {
  const ledger = fixture(t), f = setupClientDelivery(ledger), offered = published(f, ledger);
  const input = f.clientResponse(offered.offerId);
  const reversal = ledger.requestProductionEntryReversal(f.job.id, f.entry.id, { reason: 'Incorrect field count' });
  assert.equal(f.clients.portal(f.access.id).offers[0].state, 'source_changed');
  assert.throws(() => f.clients.submit(f.access.id, offered.offerId, input), { statusCode: 409 });
  ledger.resolveApproval(reversal.approval.id, { status: 'rejected' });
  f.clients.submit(f.access.id, offered.offerId, input);
  const response = f.clients.read(f.job.id).offers[0].response;
  const clock = ledger.clock; ledger.clock = () => new Date(Date.now() + 7200000);
  assert.equal(f.clients.portal(f.access.id).offers[0].state, 'expired');
  assert.throws(() => ledger.resolveApproval(response.approvalId, { status: 'approved', reason: 'Verified customer and source' }), { statusCode: 409 });
  ledger.clock = clock;
  f.clientCommand('withdraw', { id: offered.offerId, reason: 'Public scope requires correction' });
  assert.throws(() => ledger.resolveApproval(response.approvalId, { status: 'approved', reason: 'Verified customer and source' }), { statusCode: 409 });
  ledger.resolveApproval(response.approvalId, { status: 'rejected' });
  const revised = published(f, ledger); assert.equal(f.clients.portal(f.access.id).offers.find(row => row.id === revised.offerId).version, 2);
  ledger.revokeClientPortalAccess(f.access.id);
  assert.throws(() => f.clients.submit(f.access.id, revised.offerId, { ...input, entryKey: 'revoked-attempt' }), { statusCode: 403 });
});
test('publication approval content and stored response conversation integrity fail closed', t => {
  const ledger = fixture(t), f = setupClientDelivery(ledger), created = f.clientCommand('offer', f.offer);
  const saved = ledger.db.prepare('SELECT data_json FROM approvals WHERE id = ?').get(created.approvalId).data_json;
  ledger.db.prepare("UPDATE approvals SET data_json = '{}' WHERE id = ?").run(created.approvalId);
  assert.throws(() => ledger.resolveApproval(created.approvalId, { status: 'approved' }), { statusCode: 409 });
  assert.throws(() => verifyClientDelivery(ledger.db), /beoordelingsketen/);
  ledger.db.prepare('UPDATE approvals SET data_json = ? WHERE id = ?').run(saved, created.approvalId);
  ledger.resolveApproval(created.approvalId, { status: 'approved' });
  f.clients.submit(f.access.id, created.offerId, f.clientResponse(created.offerId));
  const response = f.clients.read(f.job.id).offers[0].response;
  ledger.db.prepare("UPDATE communication_records SET body = 'Altered client response' WHERE id = ?").run(response.messageId);
  assert.throws(() => verifyClientDelivery(ledger.db), /gespreksbericht/);
  assert.throws(() => ledger.resolveApproval(response.approvalId, { status: 'approved', reason: 'Verified customer and source' }), { statusCode: 409 });
});
test('client delivery backup verification and native company authority include all retained records', t => {
  const ledger = fixture(t), f = verifyClientDeliveryContract(ledger);
  const { verifySqliteBackupDatabase } = require('../scripts/restore-local-backup');
  assert.equal(verifySqliteBackupDatabase(ledger.dbFile).valid, true);
  ledger.db.prepare("UPDATE client_delivery_responses SET snapshot_hash = 'wrong' WHERE offer_id = ?").run(f.created.offerId);
  assert.throws(() => verifySqliteBackupDatabase(ledger.dbFile), /controlesom/);
  ledger.db.exec("INSERT INTO company_authority (id,environment_id,generation,status,public_key,details_json,updated_at) VALUES ('current','fixture',1,'frozen','fixture','{}','fixture')");
  for (const table of TABLES) assert.throws(() => ledger.db.exec(`DELETE FROM ${table}`), /company_authority_blocked/);
});
test('reviewed response loses current-evidence status when its photo is quarantined, without erasing the customer statement', t => {
  const ledger = fixture(t), f = setupClientDelivery(ledger);
  const photo = f.clients.chat.create(f.access.id, { entryKey: 'reviewed-photo-proof', body: 'Detail' }, { attachment: { originalName: 'detail.png', mimeType: 'image/png', size: 20, sha256: 'a'.repeat(64), storageRef: 'private/test.png' } });
  const offered = published(f, ledger);
  f.clients.submit(f.access.id, offered.offerId, { ...f.clientResponse(offered.offerId), photoIds: [photo.id] });
  const response = f.clients.read(f.job.id).offers[0].response;
  ledger.resolveApproval(response.approvalId, { status: 'approved', reason: 'Customer and photo checked against authority basis' });
  assert.equal(f.delivery.source(f.job.id)[0].response.status, 'accepted_with_reservations');
  ledger.db.prepare("UPDATE documents SET status = 'quarantined' WHERE id = ?").run(f.clients.chat.message(f.access.id, photo.id).attachment.documentId);
  assert.equal(f.delivery.source(f.job.id)[0].response.status, 'source_changed');
  assert.equal(f.delivery.source(f.job.id)[0].response.retainedOutcome, 'accepted_with_reservations');
  assert.equal(verifyClientDelivery(ledger.db), true);
});
test('hosted storage rebinding preserves sealed client/review text and conversation provenance', () => {
  const { rewriteRowReferences } = require('../scripts/migrate-local-backup-to-hosted');
  const original = 'uploads/proof.jpg', replacements = new Map([[original, 's3://fixture/companies/test/proof.jpg']]);
  const data = JSON.stringify({ note: original, authorityReference: original, basis: { body: original } });
  for (const target_type of ['client_delivery_offer', 'work_delivery_decision', 'inspection_coverage_decision']) {
    assert.equal(rewriteRowReferences('approvals', { target_type, data_json: data }, ['data_json'], replacements).data_json, data);
  }
  for (const entity_type of ['conversation_source', 'conversation_publication', 'conversation_analysis', 'client_delivery_offer', 'client_delivery_response']) {
    assert.equal(rewriteRowReferences('audit_events', { entity_type, after_json: data }, ['after_json'], replacements).after_json, data);
  }
  assert.equal(rewriteRowReferences('documents', { type: 'photo', storage_ref: original }, ['storage_ref'], replacements).storage_ref, replacements.get(original));
});
