const { ClientConversation, fail } = require('./client-conversation');
const { createHash } = require('node:crypto');

function registerConversationRoutes(app, { ledger, requireClientPortalToken, actor, readUploadPayload, storeUploadedFile, evidenceStorage, reserveEvidenceStorage, releaseEvidenceStorageReservation, imageProcessor, sendError }) {
  const chat = new ClientConversation(ledger);
  const office = req => {
    if (!['owner', 'approver', 'office_operator'].includes(req.operator?.role)) fail('Office access required.', 403);
    const access = chat.access(req.params.accessId);
    if (access.jobId !== req.params.jobId) fail('Conversation not found in this job.', 404);
    return access;
  };
  const client = req => chat.fromToken(req.clientPortalToken);
  const run = fn => async (req, res) => {
    try { await fn(req, res); }
    catch (error) { sendError(req, res, error.statusCode || 500, error.code || 'conversation_request_failed', error.statusCode ? error.message : 'The conversation request failed.'); }
  };
  const read = (resolve, isClient) => run((req, res) => res.json({ success: true, ...chat.list(resolve(req).id, { ...req.query, client: isClient }) }));
  const create = (resolve, direction) => run(async (req, res) => {
    const access = resolve(req);
    let stored = null;
    let retained = false;
    let reserved = 0;
    try {
      const { payload, file } = await readUploadPayload(req);
      if (typeof payload.analysisOrigin === 'string' && payload.analysisOrigin) {
        try { payload.analysisOrigin = JSON.parse(payload.analysisOrigin); } catch { fail('Invalid analysis source.'); }
      }
      // The authenticated scope is rechecked after the asynchronous upload read.
      resolve(req);
      if (file && (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimeType) || file.buffer.length > 5 * 1024 * 1024)) fail('Conversation photos must be JPEG, PNG or WebP, at most 5 MB.', 415);
      if (file) { reserved = reserveEvidenceStorage(file.buffer.length); stored = await storeUploadedFile(file); }
      resolve(req);
      const message = chat.create(access.id, payload, { direction, actor: direction === 'inbound' ? 'client_portal' : actor(req), attachment: stored });
      retained = !message.replayed;
      res.status(201).json({ success: true, message });
    } finally {
      if (stored && !retained) await evidenceStorage.remove(stored.storageRef);
      releaseEvidenceStorageReservation(reserved);
    }
  });
  const photo = (resolve, isClient) => run(async (req, res) => {
    const access = resolve(req);
    if (req.query.preview !== undefined && req.query.preview !== '1') fail('Invalid photo preview variant.', 400);
    const retained = chat.attachment(access.id, req.params.messageId, { client: isClient });
    const bytes = await evidenceStorage.read(retained.document.storageRef, {
      maxBytes: 5 * 1024 * 1024,
      expectedSize: retained.document.sizeBytes,
      expectedSha256: retained.sha256
    });
    if (createHash('sha256').update(bytes).digest('hex') !== retained.sha256) fail('Photo checksum does not match.', 409);
    const preview = req.query.preview === '1' ? await imageProcessor.preview(bytes, retained.document.mimeType) : null;
    resolve(req);
    const current = chat.attachment(access.id, req.params.messageId, { client: isClient });
    if (current.sha256 !== retained.sha256 || current.document.storageRef !== retained.document.storageRef) fail('Photo changed during processing.', 409);
    res.set({ 'Cache-Control': 'no-store', 'Content-Type': preview?.mimeType || retained.document.mimeType,
      'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' }).send(preview?.buffer || bytes);
  });
  app.get('/api/client-portal/conversation', requireClientPortalToken, read(client, true));
  app.post('/api/client-portal/conversation/messages', requireClientPortalToken, create(client, 'inbound'));
  app.get('/api/client-portal/conversation/messages/:messageId/photo', requireClientPortalToken, photo(client, true));
  const base = '/api/ledger/jobs/:jobId/conversations/:accessId';
  app.get('/api/ledger/client-conversations/inbox', run((req, res) => {
    if (!['owner', 'approver', 'office_operator'].includes(req.operator?.role)) fail('Office access required.', 403);
    res.json({ success: true, ...chat.unreadInbox({ limit: req.query?.limit }) });
  }));
  app.get(base, read(office, false));
  app.get(`${base}/field-reports`, run((req, res) => {
    const access = office(req);
    res.json({ success: true, reports: chat.fieldReportUpdates(access.id) });
  }));
  app.get(`${base}/photo-evidence`, run((req, res) => {
    const access = office(req);
    res.json({ success: true, photos: chat.photoEvidenceUpdates(access.id) });
  }));
  app.get(`${base}/legacy-messages`, run((req, res) => {
    const access = office(req);
    res.json({ success: true, ...chat.legacyMessages(access.id, req.query || {}) });
  }));
  app.post(`${base}/legacy-messages/:messageId/import`, run((req, res) => {
    const access = office(req);
    if (!['owner', 'approver'].includes(req.operator.role)) fail('An owner or approver must approve historical message visibility.', 403);
    res.status(201).json({ success: true, ...chat.importLegacyMessage(access.id, req.params.messageId, actor(req)) });
  }));
  app.post(`${base}/messages/reviewed`, run((req, res) => {
    const access = office(req);
    res.json({ success: true, ...chat.markReviewed(access.id, req.body?.messages, actor(req)) });
  }));
  app.post(`${base}/messages`, create(office, 'outbound'));
  app.post(`${base}/field-reports/:reportId/draft`, run((req, res) => {
    const access = office(req);
    res.status(201).json({ success: true, ...chat.createFieldReportDraft(access.id, req.params.reportId, req.body || {}, actor(req)) });
  }));
  app.post(`${base}/photo-evidence/:captureId/draft`, run((req, res) => {
    const access = office(req);
    res.status(201).json({ success: true, ...chat.createPhotoEvidenceDraft(access.id, req.params.captureId, req.body || {}, actor(req)) });
  }));
  app.get(`${base}/messages/:messageId/photo`, photo(office, false));
  app.post(`${base}/messages/:messageId/publish`, run((req, res) => {
    const access = office(req);
    if (!['owner', 'approver'].includes(req.operator.role)) fail('An approver must release the message.', 403);
    res.json({ success: true, message: chat.publish(access.id, req.params.messageId, req.body?.sourceHash, actor(req)) });
  }));
  app.post(`${base}/analysis/findings/:sourceId/rfi`, run((req, res) => {
    const access = office(req);
    if (req.body?.sourceId !== req.params.sourceId) fail('RFI source message does not match the route.', 409);
    res.status(201).json({ success: true, ...chat.createRfiFromFinding(access.id, req.body, actor(req)) });
  }));
  app.get(`${base}/analysis/rfi-responses`, run((req, res) => {
    const access = office(req);
    res.json({ success: true, responses: chat.approvedRfiResponses(access.id) });
  }));
  app.post(`${base}/analysis/rfi-responses/:rfiId/draft`, run((req, res) => {
    const access = office(req);
    res.status(201).json({ success: true, ...chat.createReplyDraftFromRfi(access.id, req.params.rfiId, actor(req)) });
  }));
  app.post(`${base}/analysis/findings/:sourceId/client-selection`, run((req, res) => {
    const access = office(req);
    if (req.body?.sourceId !== req.params.sourceId) fail('Client-decision source message does not match the route.', 409);
    res.status(201).json({ success: true, ...chat.createSelectionFromFinding(access.id, req.body, actor(req)) });
  }));
  app.post(`${base}/analysis/observations/:sourceId/rfi`, run((req, res) => {
    const access = office(req);
    if (req.body?.sourceId !== req.params.sourceId) fail('RFI source message does not match the route.', 409);
    res.status(201).json({ success: true, ...chat.createRfiFromObservation(access.id, req.body, actor(req)) });
  }));
  app.post(`${base}/analysis/findings/:sourceId/variation`, run((req, res) => {
    const access = office(req);
    if (req.body?.sourceId !== req.params.sourceId) fail('Variation source message does not match the route.', 409);
    res.status(201).json({ success: true, ...chat.createVariationFromFinding(access.id, req.body, actor(req)) });
  }));
  return { chat, office, run, base };
}

module.exports = { registerConversationRoutes };
