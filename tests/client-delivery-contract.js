const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setupDelivery } = require('./work-delivery-contract');
const { ClientDelivery, verifyClientDelivery } = require('../client-delivery');
function setupClientDelivery(ledger) {
  const f = setupDelivery(ledger), deliveryId = f.command('retain', f.input).deliveryId;
  const access = ledger.createClientPortalAccess(f.job.id, { label: 'Opdrachtgever' });
  ledger.resolveApproval(access.approval.id, { status: 'approved' }, { actor: 'portal-reviewer' });
  const clients = new ClientDelivery(ledger);
  const offer = { deliveryId, accessId: access.id, recipientName: 'Beoogde klant', authorityReference: 'Private bevoegdheidsgrond: opdrachtgever controleren',
    title: 'Eerste deur geplaatst', scope: 'Alleen de eerste deur; de tweede deur is nog niet uitgevoerd.',
    expiresAt: new Date(Date.now() + 3600000).toISOString(), photoIds: [], scopeConfirmed: true, reason: 'Private publicatiecontrole' };
  const clientCommand = (action, record) => clients.command(f.job.id, { action, record, entryKey: randomUUID(), sourceHash: clients.read(f.job.id).sourceHash }, 'office');
  const response = offerId => ({ entryKey: randomUUID(), sourceHash: clients.portal(access.id).offers.find(row => row.id === offerId).sourceHash,
    outcome: 'accepted_with_reservations', respondent: 'Klantvertegenwoordiger', authorityConfirmed: true, note: 'Eerste deur akkoord; kleine beschadiging nog herstellen.', photoIds: [] });
  return { ...f, deliveryId, clients, access, offer, clientCommand, clientResponse: response };
}
function verifyClientDeliveryContract(ledger, overrides = {}) {
  const f = setupClientDelivery(ledger), { clients, clientCommand: command, job, access } = f;
  Object.assign(f.offer, overrides.offer);
  const jobStatus = ledger.getJobRow(job.id).status;
  const created = command('offer', f.offer);
  assert.equal(clients.portal(access.id).offers.length, 0);
  assert.throws(() => clients.submit(access.id, created.offerId, { ...f.clientResponse, entryKey: 'unapproved-attempt', sourceHash: 'wrong' }), { statusCode: 409 });
  ledger.resolveApproval(created.approvalId, { status: 'approved' }, { actor: 'publication-reviewer' });
  const visible = clients.portal(access.id).offers[0];
  assert.equal(visible.state, 'available'); assert.equal(visible.quantities[0].quantity, 1); assert.equal(visible.coverageStatus, 'not_configured');
  for (const secret of ['Private', 'approvalId', 'authorityReference', f.deliveryId, f.document.id]) assert.equal(JSON.stringify(visible).includes(secret), false);
  const input = { ...f.clientResponse(created.offerId), ...overrides.response }, submitted = clients.submit(access.id, created.offerId, input);
  assert.equal(submitted.response.status, 'pending_review');
  assert.equal(clients.submit(access.id, created.offerId, input).replayed, true);
  assert.throws(() => clients.submit(access.id, created.offerId, { ...input, note: 'Changed' }), { statusCode: 409 });
  assert.equal(f.delivery.source(job.id)[0].response.status, 'not_verified');
  const retained = clients.read(job.id).offers[0].response;
  assert.throws(() => ledger.resolveApproval(retained.approvalId, { status: 'approved' }, { actor: 'response-reviewer' }), { statusCode: 400 });
  ledger.resolveApproval(retained.approvalId, { status: 'approved', reason: 'Klantreactie en bevoegdheid via afzonderlijke opdrachtregistratie gecontroleerd.' }, { actor: 'response-reviewer' });
  assert.equal(clients.portal(access.id).offers[0].response.status, 'recorded');
  assert.equal(f.delivery.source(job.id)[0].response.status, 'accepted_with_reservations');
  assert.equal(f.delivery.source(job.id)[0].finance.status, 'not_linked');
  assert.equal(ledger.getJobRow(job.id).status, jobStatus);
  const chat = clients.chat.list(access.id, { client: true });
  assert.equal(chat.messages.length, 1); assert.equal(chat.messages[0].direction, 'inbound'); assert.ok(chat.messages[0].body.includes(input.note));
  const field = f.field.read(job.id, f.worker.id);
  for (const secret of ['Klantvertegenwoordiger', 'Private', input.note]) assert.equal(JSON.stringify(field).includes(secret), false);
  command('withdraw', { id: created.offerId, reason: 'Nieuwe klantvraag wordt afzonderlijk voorbereid.' });
  assert.equal(clients.portal(access.id).offers[0].state, 'withdrawn');
  assert.equal(f.delivery.source(job.id)[0].response.status, 'accepted_with_reservations');
  ledger.revokeClientPortalAccess(access.id);
  assert.throws(() => clients.portal(access.id), { statusCode: 403 });
  assert.equal(f.delivery.source(job.id)[0].response.status, 'accepted_with_reservations');
  assert.equal(verifyClientDelivery(ledger.db), true); assert.equal(ledger.verifyAuditIntegrity().valid, true);
  return { ...f, created, submitted };
}
module.exports = { setupClientDelivery, verifyClientDeliveryContract };
