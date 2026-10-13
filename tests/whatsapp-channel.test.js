const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { verifySignature, whatsappConfig, permittedMediaUrl, WhatsAppChannel } = require('../whatsapp-channel');
const { ClientConversation } = require('../client-conversation');
const { ContractorOperatingLedger } = require('../operating-ledger');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('WhatsApp accepts only authenticated exact raw webhook bytes', () => {
  const raw = Buffer.from('{"object":"whatsapp_business_account"}');
  const secret = 'app-secret-for-test';
  const signature = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
  assert.equal(verifySignature(raw, signature, secret), true);
  assert.equal(verifySignature(Buffer.from(raw + ' '), signature, secret), false);
  assert.equal(verifySignature(raw, 'sha256=00', secret), false);
  assert.equal(verifySignature(raw, signature, ''), false);
});

test('signed-channel processing deduplicates intake and blocks retries after submission or uncertain outcome', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whatsapp-contract-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => { ledger.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const job = ledger.createIntake({ title: 'WhatsApp contract', client: { name: 'Client' }, assignAutomatically: false });
  const access = ledger.createClientPortalAccess(job.id);
  ledger.resolveApproval(access.approval.id, { status: 'approved' });
  const chat = new ClientConversation(ledger);
  const env = Object.fromEntries(Object.entries({ ENABLED: 'true', TOKEN: 'test-token', APP_SECRET: 'test-secret-at-least-16', VERIFY_TOKEN: 'test-verification-token-at-least-32', PHONE_ID: '12345', WABA_ID: '67890', VERSION: 'v23.0', PRIVACY_REFERENCE: 'fixture privacy', COST_REFERENCE: 'fixture costs', VERIFICATION_REFERENCE: 'fixture verification' }).map(([key, value]) => [`CONTRACTOR_AI_WHATSAPP_${key}`, value]));
  let calls = 0;
  let failRequest = false;
  const channel = new WhatsAppChannel(chat, { env, fetchImpl: async (_url, options) => {
    calls++;
    assert.equal(JSON.parse(options.body).to, '31612345678');
    if (failRequest) throw new Error('Network outcome unknown');
    return new Response(JSON.stringify({ messages: [{ id: 'wamid.outbound001' }] }), { headers: { 'content-type': 'application/json' } });
  } });
  const binding = channel.bind(access.id, { phone: '+31612345678', consentReference: 'consent evidence', identityReference: 'identity evidence' }, 'owner');
  const envelope = { object: 'whatsapp_business_account', entry: [{ id: '67890', changes: [{ field: 'messages', value: { metadata: { phone_number_id: '12345' }, messages: [{ id: 'wamid.inbound001', from: '31612345678', timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: 'Welke maat moet de opening hebben?' } }] } }] }] };
  assert.equal((await channel.receive(envelope)).ignored, 1);
  ledger.resolveApproval(binding.approvalId, { status: 'approved' });
  assert.equal((await channel.receive(envelope)).retained, 1);
  assert.equal((await channel.receive(envelope)).retained, 0);
  assert.equal(chat.list(access.id).messages.length, 1);
  const outgoing = chat.create(access.id, { body: 'Wij controleren de tekening.', entryKey: 'whatsapp-reply-001' }, { direction: 'outbound' });
  await assert.rejects(channel.dispatch(access.id, outgoing.id, 'owner'), { statusCode: 409 });
  ledger.resolveApproval(outgoing.approvalId, { status: 'approved' });
  chat.publish(access.id, outgoing.id, outgoing.sourceHash, 'owner');
  assert.equal((await channel.dispatch(access.id, outgoing.id, 'owner')).state, 'submitted');
  await assert.rejects(channel.dispatch(access.id, outgoing.id, 'owner'), { statusCode: 409 });
  assert.equal(calls, 1);
  const delivery = structuredClone(envelope);
  const value = delivery.entry[0].changes[0].value;
  delete value.messages;
  value.statuses = [{ id: 'wamid.outbound001', recipient_id: '31612345678', status: 'delivered', timestamp: String(Math.floor(Date.now() / 1000)) }];
  await channel.receive(delivery);
  assert.equal(chat.event('whatsapp_delivery', outgoing.id).status, 'delivered');
  value.statuses[0].status = 'sent';
  await channel.receive(delivery);
  assert.equal(chat.event('whatsapp_delivery', outgoing.id).status, 'delivered');
  const uncertain = chat.create(access.id, { body: 'Tweede gecontroleerde reactie.', entryKey: 'whatsapp-reply-002' }, { direction: 'outbound' });
  ledger.resolveApproval(uncertain.approvalId, { status: 'approved' });
  chat.publish(access.id, uncertain.id, uncertain.sourceHash, 'owner');
  failRequest = true;
  await assert.rejects(channel.dispatch(access.id, uncertain.id, 'owner'));
  assert.equal(chat.event('whatsapp_dispatch', uncertain.id).state, 'unknown');
  await assert.rejects(channel.dispatch(access.id, uncertain.id, 'owner'), { statusCode: 409 });
  assert.equal(calls, 2);
  const photo = chat.create(access.id, { body: 'Controleer dit detail.', entryKey: 'whatsapp-photo-003' }, {
    direction: 'outbound', attachment: { originalName: 'detail.png', mimeType: 'image/png', size: 1, sha256: 'a'.repeat(64), storageRef: 'private/detail.png' }
  });
  ledger.resolveApproval(photo.approvalId, { status: 'approved' });
  chat.publish(access.id, photo.id, photo.sourceHash, 'owner');
  channel.readPhoto = async () => {
    ledger.revokeClientPortalAccess(access.id);
    return { bytes: Buffer.from('x'), mimeType: 'image/png', filename: 'detail.png' };
  };
  await assert.rejects(channel.dispatch(access.id, photo.id, 'owner'), { statusCode: 403 });
  assert.equal(calls, 2, 'Revocation during private storage reads must prevent even the media upload.');
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
});

test('WhatsApp is fail closed and media fetches cannot reach arbitrary or local URLs', () => {
  assert.equal(whatsappConfig({}).enabled, false);
  assert.throws(() => whatsappConfig({ CONTRACTOR_AI_WHATSAPP_ENABLED: 'true' }));
  for (const url of ['http://127.0.0.1/private', 'https://evil.example/file', 'https://user:pass@lookaside.fbsbx.com/file']) assert.throws(() => permittedMediaUrl(url));
  assert.equal(permittedMediaUrl('https://lookaside.fbsbx.com/whatsapp_business/attachments?id=1').hostname, 'lookaside.fbsbx.com');
});
