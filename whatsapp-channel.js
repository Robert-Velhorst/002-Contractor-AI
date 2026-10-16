const crypto = require('node:crypto');
const { ClientConversation, hash, fail } = require('./client-conversation');
const { readBoundedJsonResponse } = require('./bounded-json');

function verifySignature(bytes, signature, secret) {
  if (!secret || !/^sha256=[a-f0-9]{64}$/.test(String(signature || ''))) return false;
  return crypto.timingSafeEqual(Buffer.from(signature.slice(7), 'hex'), crypto.createHmac('sha256', secret).update(bytes).digest());
}
function permittedMediaUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'lookaside.fbsbx.com' || url.port || url.username || url.password) fail('Unapproved WhatsApp media host.', 502);
  return url;
}
function whatsappConfig(env = process.env) {
  if (env.CONTRACTOR_AI_WHATSAPP_ENABLED !== 'true') return { enabled: false };
  const fields = { token: 'TOKEN', appSecret: 'APP_SECRET', verifyToken: 'VERIFY_TOKEN', phoneId: 'PHONE_ID', wabaId: 'WABA_ID', version: 'VERSION', privacyReference: 'PRIVACY_REFERENCE', costReference: 'COST_REFERENCE', verificationReference: 'VERIFICATION_REFERENCE' };
  const config = { enabled: true };
  for (const [key, suffix] of Object.entries(fields)) {
    config[key] = String(env[`CONTRACTOR_AI_WHATSAPP_${suffix}`] || '').trim();
    if (!config[key]) fail(`WhatsApp configuration is missing ${suffix}.`, 503);
  }
  if (!/^\d+$/.test(config.phoneId) || !/^\d+$/.test(config.wabaId) || !/^v\d+\.\d+$/.test(config.version) || config.verifyToken.length < 32 || config.appSecret.length < 16) fail('Invalid WhatsApp account or secret configuration.', 503);
  return config;
}

class WhatsAppChannel {
  constructor(chat, { env = process.env, fetchImpl = fetch, storePhoto, readPhoto } = {}) {
    this.chat = chat; this.env = env; this.fetch = fetchImpl; this.storePhoto = storePhoto; this.readPhoto = readPhoto;
  }
  config() { return whatsappConfig(this.env); }
  binding(phone, accessId) {
    const binding = this.chat.event('whatsapp_binding', hash(phone));
    if (!binding || binding.revoked || (accessId && binding.accessId !== accessId)) fail('No verified recipient binding.', 403);
    this.chat.access(binding.accessId);
    const approval = this.chat.ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(binding.approvalId);
    if (approval?.status !== 'approved') fail('Approve the recipient binding first.', 403);
    return binding;
  }
  bind(accessId, payload, actor) {
    return this.chat.ledger.transaction(() => {
      const access = this.chat.access(accessId);
      const phone = String(payload.phone || '').replace(/^\+/, '');
      if (!/^[1-9]\d{7,14}$/.test(phone) || !['consentReference', 'identityReference'].every(key => typeof payload[key] === 'string' && payload[key].trim().length >= 8 && payload[key].length <= 1000)) fail('A verified phone number, consent reference and identity reference are required.');
      const existing = this.chat.event('whatsapp_binding', hash(phone));
      if (existing && !existing.revoked) {
        if (existing.accessId !== accessId) fail('This number is already bound to another conversation. Revoke it first.', 409);
        return existing;
      }
      const approval = this.chat.ledger.createApproval({ targetType: 'whatsapp_binding', targetId: hash(phone), jobId: access.jobId, summary: 'Approve verified WhatsApp conversation recipient', data: { accessId, consentReference: payload.consentReference, identityReference: payload.identityReference } }, { actor });
      return this.chat.record('whatsapp_binding', hash(phone), access.jobId, 'request_whatsapp_binding', { accessId, phone, approvalId: approval.id, consentReference: payload.consentReference, identityReference: payload.identityReference, createdAt: new Date().toISOString() }, actor);
    });
  }
  async graph(path, options = {}) {
    const config = this.config();
    if (!config.enabled) fail('WhatsApp is disabled.', 503);
    const response = await this.fetch(`https://graph.facebook.com/${config.version}/${path}`, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${config.token}`, ...options.headers } });
    if (!response.ok) fail('WhatsApp provider request failed.', 502);
    return readBoundedJsonResponse(response, { maxBytes: 256 * 1024 });
  }
  async media(mediaId) {
    if (!/^\d{1,100}$/.test(mediaId)) fail('Invalid media ID.');
    const metadata = await this.graph(`${mediaId}?phone_number_id=${this.config().phoneId}`);
    const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[metadata.mime_type];
    if (!extension || !Number.isFinite(Number(metadata.file_size)) || Number(metadata.file_size) > 5 * 1024 * 1024) fail('Unsupported WhatsApp photo.', 415);
    const response = await this.fetch(permittedMediaUrl(metadata.url), { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${this.config().token}` } });
    if (!response.ok || !response.body) fail('WhatsApp photo download failed.', 502);
    const chunks = []; let size = 0;
    for await (const chunk of response.body) {
      size += chunk.length;
      if (size > 5 * 1024 * 1024) fail('WhatsApp photo exceeds 5 MB.', 413);
      chunks.push(Buffer.from(chunk));
    }
    const buffer = Buffer.concat(chunks);
    const expected = /^[a-f0-9]{64}$/i.test(metadata.sha256 || '') ? metadata.sha256.toLowerCase() : Buffer.from(metadata.sha256 || '', 'base64').toString('hex');
    if (crypto.createHash('sha256').update(buffer).digest('hex') !== expected) fail('WhatsApp media checksum mismatch.', 409);
    return { buffer, mimeType: metadata.mime_type, originalName: `whatsapp-${mediaId}.${extension}`, size };
  }
  async receive(envelope) {
    const config = this.config();
    if (!config.enabled) fail('WhatsApp is disabled.', 503);
    if (envelope.object !== 'whatsapp_business_account' || !Array.isArray(envelope.entry) || envelope.entry.length > 20) fail('Invalid WhatsApp envelope.');
    let retained = 0; let ignored = 0;
    for (const entry of envelope.entry) {
      if (String(entry.id) !== config.wabaId) fail('Unexpected WhatsApp business account.', 403);
      for (const change of entry.changes || []) {
        const value = change.value || {};
        if (change.field !== 'messages' || String(value.metadata?.phone_number_id) !== config.phoneId) continue;
        for (const status of value.statuses || []) {
          if (!['sent', 'delivered', 'read', 'failed'].includes(status.status) || typeof status.id !== 'string') continue;
          const source = this.chat.event('whatsapp_provider_message', hash(status.id));
          if (!source || source.phone !== status.recipient_id) { ignored++; continue; }
          const previous = this.chat.event('whatsapp_delivery', source.messageId);
          const rank = { submitted: 0, sent: 1, failed: 2, delivered: 3, read: 4 };
          if (previous && rank[previous.status] >= rank[status.status]) continue;
          this.chat.record('whatsapp_delivery', source.messageId, source.jobId, 'receive_whatsapp_delivery', { status: status.status, providerId: status.id, providerTimestamp: status.timestamp || null, source: 'signed_webhook' }, 'whatsapp_webhook');
        }
        for (const message of value.messages || []) {
          if (!/^[\w.=: -]{1,300}$/.test(message.id || '') || !/^[1-9]\d{7,14}$/.test(message.from || '')) { ignored++; continue; }
          if (this.chat.event('whatsapp_inbound', hash(message.id))) continue;
          let binding;
          try { binding = this.binding(message.from); } catch { ignored++; continue; }
          if (!['text', 'image'].includes(message.type)) { ignored++; continue; }
          const access = this.chat.access(binding.accessId);
          const timestamp = Number(message.timestamp) * 1000;
          if (!Number.isFinite(timestamp) || timestamp > Date.now() + 300000 || timestamp < 1) fail('Invalid provider message timestamp.');
          const payload = { entryKey: `whatsapp-${hash(message.id)}`, body: message.type === 'text' ? message.text?.body : message.image?.caption || '' };
          if (message.context?.id) {
            const reply = this.chat.event('whatsapp_inbound', hash(message.context.id)) || this.chat.event('whatsapp_provider_message', hash(message.context.id));
            if (reply?.accessId === access.id) payload.replyTo = reply.messageId;
          }
          const options = { direction: 'inbound', sourceChannel: 'whatsapp', providerId: message.id, providerTimestamp: String(message.timestamp), actor: 'whatsapp_webhook' };
          const create = (attachment, finalizeStorageReservation = null) => this.chat.ledger.transaction(() => {
            this.binding(message.from, access.id);
            const result = this.chat.create(access.id, payload, { ...options, attachment });
            if (!this.chat.event('whatsapp_inbound', hash(message.id))) this.chat.record('whatsapp_inbound', hash(message.id), access.jobId, 'retain_whatsapp_inbound', { messageId: result.id, accessId: access.id, providerId: message.id }, 'whatsapp_webhook');
            const window = this.chat.event('whatsapp_window', access.id);
            if (!window || timestamp > window.timestamp) this.chat.record('whatsapp_window', access.id, access.jobId, 'retain_whatsapp_reply_window', { timestamp, phone: message.from }, 'whatsapp_webhook');
            if (finalizeStorageReservation && !finalizeStorageReservation()) fail('Evidence quota reservation could not be committed with the WhatsApp message.', 503);
            return result;
          });
          if (message.type === 'image') await this.storePhoto(await this.media(message.image.id), create, message.id);
          else create(null);
          retained++;
        }
      }
    }
    return { retained, ignored };
  }
  async dispatch(accessId, messageId, actor) {
    const config = this.config();
    if (!config.enabled) fail('WhatsApp is disabled.', 503);
    const message = this.chat.message(accessId, messageId);
    if (message.direction !== 'outbound' || message.status !== 'published') fail('Publish the approved message before dispatch.', 409);
    const window = this.chat.event('whatsapp_window', accessId);
    if (!window || Date.now() - window.timestamp > 24 * 60 * 60 * 1000) fail('No current inbound 24-hour reply window. Template messaging is not enabled.', 409);
    const binding = this.binding(window.phone, accessId);
    this.chat.publish(accessId, messageId, message.sourceHash, actor);
    if (message.body.length > (message.attachment ? 1024 : 4096)) fail('Message exceeds the WhatsApp text/caption limit.');
    // Claim before any provider mutation. An uncertain attempt is never blindly retried.
    this.chat.ledger.transaction(() => {
      if (this.chat.event('whatsapp_dispatch', messageId)) fail('A dispatch was already attempted. Inspect its receipt; automatic resend is blocked.', 409);
      this.chat.record('whatsapp_dispatch', messageId, message.jobId, 'claim_whatsapp_dispatch', { state: 'sending', accessId, sourceHash: message.sourceHash, startedAt: new Date().toISOString() }, actor);
    });
    try {
      let image;
      if (message.attachment) {
        const file = await this.readPhoto(accessId, messageId);
        this.binding(binding.phone, accessId);
        this.chat.publish(accessId, messageId, message.sourceHash, actor);
        const form = new FormData(); form.set('messaging_product', 'whatsapp'); form.set('file', new Blob([file.bytes], { type: file.mimeType }), file.filename);
        image = await this.graph(`${config.phoneId}/media`, { method: 'POST', body: form });
        if (!image.id) fail('Provider did not return a media ID.', 502);
      }
      this.binding(binding.phone, accessId);
      this.chat.publish(accessId, messageId, message.sourceHash, actor);
      if (Date.now() - window.timestamp > 24 * 60 * 60 * 1000) fail('The inbound reply window expired during preparation.', 409);
      const response = await this.graph(`${config.phoneId}/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', to: binding.phone,
        type: image ? 'image' : 'text', ...(image ? { image: { id: image.id, caption: message.body } } : { text: { body: message.body, preview_url: false } }) }) });
      const providerId = response.messages?.[0]?.id;
      if (typeof providerId !== 'string' || providerId.length > 300) fail('Provider did not return a verifiable message ID.', 502);
      return this.chat.ledger.transaction(() => {
        this.chat.record('whatsapp_provider_message', hash(providerId), message.jobId, 'link_whatsapp_provider_message', { providerId, messageId, accessId, jobId: message.jobId, phone: binding.phone }, actor);
        return this.chat.record('whatsapp_dispatch', messageId, message.jobId, 'retain_whatsapp_submission', { state: 'submitted', providerId, sourceHash: message.sourceHash, submittedAt: new Date().toISOString(), delivered: false }, actor);
      });
    } catch (error) {
      this.chat.record('whatsapp_dispatch', messageId, message.jobId, 'retain_uncertain_whatsapp_dispatch', { state: 'unknown', sourceHash: message.sourceHash, retryBlocked: true }, actor);
      throw error;
    }
  }
}

function registerWhatsAppWebhook(app, { ledger, rawParser, sendError, authenticationRequired, storePhoto, readPhoto, env = process.env, isReady = () => true, route = '/api/integrations/whatsapp/webhook' }) {
  const channel = new WhatsAppChannel(new ClientConversation(ledger), { storePhoto, readPhoto, env });
  app.get(route, (req, res) => {
    try {
      const config = channel.config();
      if (!authenticationRequired || !config.enabled || !isReady()) fail('WhatsApp webhook is unavailable.', 503);
      if (req.query['hub.mode'] !== 'subscribe' || req.query['hub.verify_token'] !== config.verifyToken || typeof req.query['hub.challenge'] !== 'string' || req.query['hub.challenge'].length > 1000) fail('Webhook verification failed.', 403);
      res.status(200).set('Content-Type', 'text/plain; charset=utf-8')
        .set('X-Content-Type-Options', 'nosniff').set('Cache-Control', 'no-store')
        .end(req.query['hub.challenge']);
    } catch (error) { sendError(req, res, error.statusCode || 503, 'whatsapp_webhook_unavailable', error.message); }
  });
  app.post(route, rawParser, async (req, res) => {
    try {
      const config = channel.config();
      if (!authenticationRequired || !config.enabled || !isReady()) fail('WhatsApp webhook is unavailable.', 503);
      if (!Buffer.isBuffer(req.body) || !verifySignature(req.body, req.headers['x-hub-signature-256'], config.appSecret)) fail('Invalid webhook signature.', 401);
      let payload;
      try { payload = JSON.parse(req.body.toString('utf8')); } catch { fail('Malformed webhook.'); }
      res.json({ success: true, ...await channel.receive(payload) });
    } catch (error) { sendError(req, res, error.statusCode || 500, 'whatsapp_webhook_failed', error.statusCode ? error.message : 'Webhook processing failed.'); }
  });
  return channel;
}
function registerWhatsAppOfficeRoutes(app, runtime, channel, actor) {
  const { office, run, base, chat } = runtime;
  app.get(`${base}/whatsapp`, run((req, res) => {
    const access = office(req);
    let enabled = false;
    let reason = 'WhatsApp is disabled.';
    try { enabled = channel.config().enabled; if (enabled) reason = 'Configured; real provider acceptance requires operator evidence.'; } catch (error) { reason = error.message; }
    const rows = chat.list(access.id).messages;
    res.json({ success: true, enabled, reason, receipts: rows.map(message => ({ messageId: message.id, dispatch: chat.event('whatsapp_dispatch', message.id), delivery: chat.event('whatsapp_delivery', message.id) })).filter(item => item.dispatch) });
  }));
  app.post(`${base}/whatsapp/binding`, run((req, res) => {
    const access = office(req);
    if (req.operator.role !== 'owner') fail('Only an owner may bind a recipient.', 403);
    res.json({ success: true, binding: channel.bind(access.id, req.body || {}, actor(req)) });
  }));
  app.post(`${base}/whatsapp/revoke`, run((req, res) => {
    const access = office(req);
    if (req.operator.role !== 'owner') fail('Only an owner may revoke a recipient.', 403);
    const key = hash(String(req.body.phone || '').replace(/^\+/, ''));
    const binding = chat.event('whatsapp_binding', key);
    if (!binding || binding.accessId !== access.id) fail('Binding not found.', 404);
    chat.record('whatsapp_binding', key, access.jobId, 'revoke_whatsapp_binding', { ...binding, revoked: true }, actor(req));
    res.json({ success: true });
  }));
  app.post(`${base}/messages/:messageId/whatsapp`, run(async (req, res) => {
    const access = office(req);
    if (req.operator.role !== 'owner' || !req.operator.authenticated || req.body?.confirmExternalSend !== true) fail('Authenticated owner confirmation is required for an external send.', 403);
    res.json({ success: true, receipt: await channel.dispatch(access.id, req.params.messageId, actor(req)) });
  }));
}
module.exports = { verifySignature, permittedMediaUrl, whatsappConfig, WhatsAppChannel, registerWhatsAppWebhook, registerWhatsAppOfficeRoutes };
