const { createHash } = require('node:crypto');

const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode }); };
const parse = value => JSON.parse(value || '{}');

class ClientConversation {
  constructor(ledger) { this.ledger = ledger; }

  access(id) {
    const row = this.ledger.db.prepare('SELECT * FROM client_portal_access WHERE id = ?').get(id);
    if (!row || row.status !== 'active' || Date.parse(row.expires_at) <= Date.now()) fail('Conversation access is unavailable.', 403);
    const job = this.ledger.requireJob(row.job_id);
    this.ledger.assertDataSubjectProcessingAllowed('client', job.client_id, 'client_portal_access');
    if (row.client_id !== job.client_id) fail('Conversation client has changed.', 403);
    return { id: row.id, jobId: row.job_id, clientId: row.client_id };
  }

  fromToken(token) {
    const snapshot = this.ledger.getClientPortalSnapshot(token);
    return this.access(snapshot.portal.accessId);
  }

  record(type, id, jobId, action, value, actor = 'system') {
    this.ledger.audit({ entityType: type, entityId: id, jobId, action, actor, after: value });
    return value;
  }

  event(type, id) {
    const row = this.ledger.db.prepare('SELECT after_json FROM audit_events WHERE entity_type = ? AND entity_id = ? ORDER BY sequence_number DESC LIMIT 1').get(type, id);
    return row ? parse(row.after_json) : null;
  }

  message(accessId, id, { client = false } = {}) {
    const access = this.access(accessId);
    const row = this.ledger.db.prepare('SELECT * FROM communication_records WHERE id = ? AND job_id = ? AND channel = ?').get(id, access.jobId, `chat:${accessId}`);
    if (!row) fail('Conversation message not found.', 404);
    const source = this.event('conversation_source', id);
    if (!source || source.body !== row.body || source.direction !== row.direction || source.accessId !== accessId || source.sourceHash !== hash(source.basis)) fail('Message source integrity failed.', 409);
    const publication = this.event('conversation_publication', id);
    if (client && source.direction !== 'inbound' && !publication) fail('Conversation message not found.', 404);
    const review = source.direction === 'inbound' ? this.event('conversation_review', id) : null;
    return { ...source, approvalId: row.approval_id, status: publication ? 'published' : source.direction === 'inbound' ? 'received' : row.status, reviewedAt: review?.reviewedAt || null, publishedAt: publication?.publishedAt || null };
  }

  project(message, client = false) {
    const attachment = message.attachment ? { filename: message.attachment.filename, mimeType: message.attachment.mimeType, size: message.attachment.size, sha256: message.attachment.sha256 } : null;
    return { id: message.id, body: message.body, direction: message.direction, sourceHash: message.sourceHash, replyTo: message.replyTo,
      createdAt: message.createdAt, status: message.status, attachment, channel: message.sourceChannel,
      ...(!client && message.basis?.fieldReportOrigin ? { sourceReference: { type: 'field_report', id: message.basis.fieldReportOrigin.reportId } } : {}),
      ...(!client && message.basis?.photoEvidenceOrigin ? { sourceReference: { type: 'photo_evidence', id: message.basis.photoEvidenceOrigin.captureId, setId: message.basis.photoEvidenceOrigin.setId } } : {}),
      ...(!client ? { approvalId: message.approvalId, reviewedAt: message.reviewedAt } : {}) };
  }

  fieldReportUpdates(accessId) {
    const access = this.access(accessId);
    return this.ledger.db.prepare('SELECT * FROM field_reports WHERE job_id = ? ORDER BY report_date DESC, created_at DESC LIMIT 100')
      .all(access.jobId).flatMap(row => {
        const report = this.ledger.mapFieldReport(row);
        const approval = report.approvalId ? this.ledger.db.prepare(`SELECT status, resolved_at FROM approvals
          WHERE id = ? AND target_type = 'field_report' AND target_id = ?`).get(report.approvalId, report.id) : null;
        if (report.data?.clientVisible !== true || approval?.status !== 'approved' || !approval.resolved_at) return [];
        return [{ id: report.id, reportDate: report.reportDate, workCompleted: report.workCompleted || '',
          sourceHash: hash(report), approvalId: report.approvalId }];
      });
  }

  photoEvidenceUpdates(accessId) {
    const access = this.access(accessId);
    return this.ledger.listPhotoEvidenceSets({ jobId: access.jobId, status: 'released', limit: 500 })
      .filter(set => set.status === 'released' && set.effectiveStatus === 'released'
        && set.readyForTaskCompletion === true && set.integrityValid === true
        && set.sourceCurrent === true && set.reviewIntegrityValid === true
        && set.latestApproval?.status === 'approved' && set.latestApproval?.resolvedAt)
      .flatMap(set => set.captures.flatMap(capture => {
        const document = capture.document;
        if (capture.integrityValid !== true || !document || document.status !== 'stored'
          || !['image/jpeg', 'image/png', 'image/webp'].includes(document.mimeType)
          || document.sizeBytes <= 0 || document.sizeBytes > 5 * 1024 * 1024
          || !/^[a-f0-9]{64}$/.test(document.contentHash || '')) return [];
        return [{
          id: capture.id, setId: set.id, title: set.title, taskTitle: set.taskTitle,
          phase: capture.phase, caption: capture.caption, capturedAt: capture.capturedAt,
          mimeType: document.mimeType, filename: document.filename || document.title,
          origin: {
            setId: set.id, setSourceHash: set.sourceHash, setSnapshotHash: set.snapshotHash,
            captureId: capture.id, captureSourceHash: capture.sourceHash, captureSnapshotHash: capture.snapshotHash,
            documentId: document.id, sha256: document.contentHash, approvalId: set.latestApproval.id
          }
        }];
      }));
  }

  assertCurrentPhotoEvidenceOrigin(origin, accessId, jobId) {
    const expectedKeys = ['approvalId', 'captureId', 'captureSnapshotHash', 'captureSourceHash', 'documentId', 'setId', 'setSnapshotHash', 'setSourceHash', 'sha256'];
    if (!origin || typeof origin !== 'object' || Array.isArray(origin)
      || Object.keys(origin).sort().join() !== expectedKeys.join()
      || expectedKeys.filter(key => key.endsWith('Hash') || key === 'sha256').some(key => !/^[a-f0-9]{64}$/.test(origin[key] || ''))
      || expectedKeys.filter(key => !key.endsWith('Hash') && key !== 'sha256').some(key => typeof origin[key] !== 'string' || !origin[key])) {
      fail('The released photo-evidence source reference is invalid.', 409);
    }
    const access = this.access(accessId);
    if (access.jobId !== jobId) fail('The photo evidence and client conversation belong to different jobs.', 409);
    const set = this.ledger.getPhotoEvidenceSet(origin.setId, { jobId });
    const capture = set.captures.find(item => item.id === origin.captureId);
    const approval = set.latestApproval;
    const document = capture?.documentId ? this.ledger.getDocument(capture.documentId) : null;
    const current = set.status === 'released' && set.effectiveStatus === 'released'
      && set.readyForTaskCompletion === true && set.integrityValid === true
      && set.sourceCurrent === true && set.reviewIntegrityValid === true
      && approval?.status === 'approved' && approval?.resolvedAt && approval.id === origin.approvalId
      && set.sourceHash === origin.setSourceHash && set.snapshotHash === origin.setSnapshotHash
      && capture?.integrityValid === true && capture.sourceHash === origin.captureSourceHash
      && capture.snapshotHash === origin.captureSnapshotHash && capture.documentId === origin.documentId
      && capture.document?.contentHash === origin.sha256 && document?.jobId === jobId
      && document.type === 'photo' && document.status === 'stored'
      && ['image/jpeg', 'image/png', 'image/webp'].includes(document.mimeType)
      && document.sizeBytes > 0 && document.sizeBytes <= 5 * 1024 * 1024
      && (document.data?.analysis?.upload?.sha256 || document.data?.contentHash) === origin.sha256 && document.storageRef;
    if (!current) fail('The released photo changed or is no longer eligible to share. Refresh and review current evidence.', 409);
    return { capture, document, set };
  }

  createPhotoEvidenceDraft(accessId, captureId, payload, actor) {
    return this.ledger.transaction(() => {
      const access = this.access(accessId);
      if (!/^[\w.:-]{8,200}$/.test(payload?.entryKey || '')) fail('A stable photo-evidence message key is required.');
      const body = typeof payload.body === 'string' ? payload.body.trim() : '';
      if (body.length < 3 || body.length > 5000) fail('Write a customer update of 3 to 5000 characters.');
      const origin = payload.origin;
      if (!origin || origin.captureId !== String(captureId || '')) fail('Select a current released work photo.', 409);
      this.assertCurrentPhotoEvidenceOrigin(origin, accessId, access.jobId);
      const message = this.create(accessId, { entryKey: payload.entryKey, body, photoEvidenceOrigin: origin }, { direction: 'outbound', actor });
      return { message, replayed: message.replayed === true };
    });
  }

  assertCurrentFieldReportOrigin(origin, accessId, jobId) {
    if (!origin || Object.keys(origin).sort().join() !== ['reportId', 'reportSourceHash'].sort().join()
      || typeof origin.reportId !== 'string' || !/^[a-f0-9]{64}$/.test(origin.reportSourceHash || '')) {
      fail('The approved field-report source reference is invalid.', 409);
    }
    const access = this.access(accessId);
    if (access.jobId !== jobId) fail('The field report and client conversation belong to different jobs.', 409);
    const current = this.fieldReportUpdates(accessId).find(item => item.id === origin.reportId);
    if (!current || current.sourceHash !== origin.reportSourceHash) {
      fail('The approved field report changed or is no longer client-visible. Review the current report before drafting again.', 409);
    }
    return true;
  }

  createFieldReportDraft(accessId, reportId, payload, actor) {
    return this.ledger.transaction(() => {
      const access = this.access(accessId);
      if (!/^[\w.:-]{8,200}$/.test(payload?.entryKey || '')) fail('A stable field-report message key is required.');
      const body = typeof payload.body === 'string' ? payload.body.trim() : '';
      if (body.length < 3 || body.length > 5000) fail('Write a customer update of 3 to 5000 characters.');
      const origin = { reportId: String(reportId || ''), reportSourceHash: String(payload.sourceHash || '') };
      this.assertCurrentFieldReportOrigin(origin, accessId, access.jobId);
      const message = this.create(accessId, { entryKey: payload.entryKey, body, fieldReportOrigin: origin }, { direction: 'outbound', actor });
      return { message, replayed: message.replayed === true };
    });
  }

  assertMessageApprovalCurrent(messageId, jobId) {
    const row = this.ledger.db.prepare('SELECT channel, direction, job_id FROM communication_records WHERE id = ? AND job_id = ?').get(messageId, jobId);
    if (!row || row.direction !== 'outbound' || !row.channel.startsWith('chat:')) return true;
    const accessId = row.channel.slice('chat:'.length);
    const message = this.message(accessId, messageId);
    if (message.basis?.fieldReportOrigin) this.assertCurrentFieldReportOrigin(message.basis.fieldReportOrigin, accessId, jobId);
    if (message.basis?.photoEvidenceOrigin) this.assertCurrentPhotoEvidenceOrigin(message.basis.photoEvidenceOrigin, accessId, jobId);
    return true;
  }

  list(accessId, { client = false, before = '', limit = 30 } = {}) {
    const access = this.access(accessId);
    const size = Math.max(1, Math.min(50, Number.parseInt(limit, 10) || 30));
    if (before && !/^\d{1,16}$/.test(String(before))) fail('Invalid conversation cursor.');
    const rows = this.ledger.db.prepare(`SELECT e.sequence_number, c.id FROM communication_records c
      JOIN audit_events e ON e.entity_id = c.id AND e.entity_type = 'conversation_source'
      WHERE c.job_id = ? AND c.channel = ? AND e.sequence_number < ?
      ${client ? "AND (c.direction = 'inbound' OR EXISTS (SELECT 1 FROM audit_events p WHERE p.entity_type = 'conversation_publication' AND p.entity_id = c.id))" : ''}
      ORDER BY e.sequence_number DESC LIMIT ?`).all(access.jobId, `chat:${accessId}`, before ? Number(before) : Number.MAX_SAFE_INTEGER, size + 1);
    const page = rows.slice(0, size);
    return { accessId, messages: page.map(row => this.project(this.message(accessId, row.id, { client }), client)).reverse(), nextCursor: rows.length > size ? String(page.at(-1).sequence_number) : null };
  }

  unreadInbox({ limit = 50 } = {}) {
    const size = Math.max(1, Math.min(100, Number.parseInt(limit, 10) || 50));
    const count = Number(this.ledger.db.prepare(`SELECT COUNT(*) AS count FROM communication_records c
      JOIN audit_events s ON s.entity_id = c.id AND s.entity_type = 'conversation_source'
      JOIN client_portal_access a ON a.id = substr(c.channel, 6)
      WHERE c.direction = 'inbound' AND c.channel LIKE 'chat:%' AND a.status = 'active' AND a.expires_at > ?
        AND NOT EXISTS (SELECT 1 FROM audit_events r WHERE r.entity_type = 'conversation_review' AND r.entity_id = c.id)`)
      .get(new Date().toISOString()).count || 0);
    const rows = this.ledger.db.prepare(`SELECT c.id, c.job_id, c.channel, c.created_at, j.title AS job_title,
        cl.name AS client_name, s.after_json AS source_json
      FROM communication_records c
      JOIN audit_events s ON s.entity_id = c.id AND s.entity_type = 'conversation_source'
      JOIN client_portal_access a ON a.id = substr(c.channel, 6)
      JOIN jobs j ON j.id = c.job_id
      LEFT JOIN clients cl ON cl.id = c.client_id
      WHERE c.direction = 'inbound' AND c.channel LIKE 'chat:%' AND a.status = 'active' AND a.expires_at > ?
        AND NOT EXISTS (SELECT 1 FROM audit_events r WHERE r.entity_type = 'conversation_review' AND r.entity_id = c.id)
      ORDER BY s.sequence_number DESC LIMIT ?`).all(new Date().toISOString(), size);
    return {
      unreadCount: count,
      truncated: count > rows.length,
      messages: rows.map(row => {
        const source = parse(row.source_json);
        return { messageId: row.id, jobId: row.job_id, accessId: source.accessId, sourceHash: source.sourceHash,
          createdAt: row.created_at, jobTitle: row.job_title, clientName: row.client_name || null };
      })
    };
  }

  unreviewedAccesses({ limit = 500 } = {}) {
    const size = Math.max(1, Math.min(5000, Number.parseInt(limit, 10) || 500));
    return this.ledger.db.prepare(`SELECT a.id AS access_id, a.job_id, MIN(s.sequence_number) AS first_sequence
      FROM communication_records c
      JOIN audit_events s ON s.entity_id = c.id AND s.entity_type = 'conversation_source'
      JOIN client_portal_access a ON a.id = substr(c.channel, 6)
      WHERE c.direction = 'inbound' AND c.channel LIKE 'chat:%' AND a.status = 'active' AND a.expires_at > ?
        AND NOT EXISTS (SELECT 1 FROM audit_events r WHERE r.entity_type = 'conversation_review' AND r.entity_id = c.id)
      GROUP BY a.id, a.job_id ORDER BY MIN(s.sequence_number), a.id LIMIT ?`)
      .all(new Date().toISOString(), size).map(row => ({ accessId: row.access_id, jobId: row.job_id }));
  }

  legacyMessages(accessId, { before = '', limit = 30 } = {}) {
    const access = this.access(accessId);
    const size = Math.max(1, Math.min(50, Number.parseInt(limit, 10) || 30));
    if (before && !/^\d{1,16}$/.test(String(before))) fail('Invalid legacy-message cursor.');
    const marker = `"portalAccessId":"${access.id}"`.replace(/[!%_]/g, value => `!${value}`);
    const rows = this.ledger.db.prepare(`SELECT e.sequence_number, c.id, c.data_json
      FROM communication_records c
      JOIN audit_events e ON e.entity_id = c.id AND e.entity_type = 'communication' AND e.action = 'create_communication'
      WHERE c.job_id = ? AND c.client_id = ? AND c.channel = 'portal' AND c.direction = 'inbound' AND c.status = 'received'
        AND c.data_json LIKE ? ESCAPE '!'
        AND e.sequence_number < ?
      ORDER BY e.sequence_number DESC LIMIT ?`)
      .all(access.jobId, access.clientId, `%${marker}%`, before ? Number(before) : Number.MAX_SAFE_INTEGER, size + 1);
    const page = rows.slice(0, size).filter(row => {
      const data = parse(row.data_json);
      return data.source === 'client_portal' && data.portalAccessId === access.id;
    });
    return {
      accessId: access.id,
      messages: page.map(row => {
        const communication = this.ledger.db.prepare('SELECT * FROM communication_records WHERE id = ?').get(row.id);
        return { id: communication.id, body: communication.body, subject: communication.subject || 'Client portal message', createdAt: communication.created_at };
      }),
      nextCursor: rows.length > size ? String(rows[size - 1].sequence_number) : null
    };
  }

  markReviewed(accessId, entries, actor) {
    if (!Array.isArray(entries) || entries.length < 1 || entries.length > 50) fail('Select between 1 and 50 loaded messages to mark as reviewed.');
    return this.ledger.transaction(() => {
      const access = this.access(accessId);
      const reviewed = [];
      let newlyReviewed = false;
      for (const entry of entries) {
        if (!entry || typeof entry.id !== 'string' || typeof entry.sourceHash !== 'string') fail('Invalid conversation review entry.');
        const message = this.message(access.id, entry.id);
        if (message.direction !== 'inbound' || message.sourceHash !== entry.sourceHash) fail('A message changed; refresh the conversation before reviewing.', 409);
        const existing = this.event('conversation_review', message.id);
        if (!existing) {
          this.record('conversation_review', message.id, access.jobId, 'review_client_message', {
            accessId: access.id, sourceHash: message.sourceHash, reviewedAt: new Date().toISOString()
          }, actor);
          newlyReviewed = true;
        }
        reviewed.push(message.id);
      }
      return { reviewedIds: reviewed, replayed: !newlyReviewed };
    });
  }

  create(accessId, payload, { direction = 'inbound', actor = 'client_portal', attachment = null, sourceChannel = 'portal', providerId = null, providerTimestamp = null } = {}) {
    return this.ledger.transaction(() => {
      const access = this.access(accessId);
      if (!['inbound', 'outbound'].includes(direction)) fail('Invalid direction.');
      const body = String(payload.body || '').trim();
      if (body.length > 5000 || (!body && !attachment)) fail('A message or photo is required (maximum 5000 characters).');
      if (!/^[\w.:-]{8,200}$/.test(payload.entryKey || '')) fail('A stable message entry key is required.');
      const replyTo = String(payload.replyTo || '');
      if (replyTo) this.message(accessId, replyTo, { client: direction === 'inbound' });
      const linkedEvidence = payload.photoEvidenceOrigin ? this.assertCurrentPhotoEvidenceOrigin(payload.photoEvidenceOrigin, accessId, access.jobId) : null;
      const photo = attachment ? { filename: attachment.originalName, mimeType: attachment.mimeType, size: attachment.size, sha256: attachment.sha256 }
        : linkedEvidence ? { filename: linkedEvidence.document.filename || linkedEvidence.document.title, mimeType: linkedEvidence.document.mimeType, size: linkedEvidence.document.sizeBytes, sha256: payload.photoEvidenceOrigin.sha256 } : null;
      const analysisOrigin = payload.analysisOrigin || null;
      const rfiResponseOrigin = payload.rfiResponseOrigin || null;
      const fieldReportOrigin = payload.fieldReportOrigin || null;
      const photoEvidenceOrigin = payload.photoEvidenceOrigin || null;
      if (analysisOrigin && (typeof analysisOrigin !== 'object' || Array.isArray(analysisOrigin)
        || Object.keys(analysisOrigin).sort().join() !== ['identity', 'quote', 'sourceId'].join()
        || !/^[a-f0-9]{64}$/.test(analysisOrigin.identity || '')
        || typeof analysisOrigin.sourceId !== 'string' || analysisOrigin.sourceId.length > 200
        || typeof analysisOrigin.quote !== 'string' || !analysisOrigin.quote.trim() || analysisOrigin.quote.length > 1500)) fail('Invalid analysis source reference.');
      if (rfiResponseOrigin && (typeof rfiResponseOrigin !== 'object' || Array.isArray(rfiResponseOrigin)
        || Object.keys(rfiResponseOrigin).sort().join() !== ['analysisIdentity', 'approvalId', 'messageSourceHash', 'responseHash', 'rfiId', 'sourceMessageId'].sort().join()
        || !/^[a-f0-9]{64}$/.test(rfiResponseOrigin.analysisIdentity || '')
        || !/^[a-f0-9]{64}$/.test(rfiResponseOrigin.messageSourceHash || '')
        || !/^[a-f0-9]{64}$/.test(rfiResponseOrigin.responseHash || '')
        || typeof rfiResponseOrigin.rfiId !== 'string' || typeof rfiResponseOrigin.approvalId !== 'string'
        || typeof rfiResponseOrigin.sourceMessageId !== 'string')) fail('Invalid approved RFI response source.');
      if (fieldReportOrigin && (typeof fieldReportOrigin !== 'object' || Array.isArray(fieldReportOrigin)
        || Object.keys(fieldReportOrigin).sort().join() !== ['reportId', 'reportSourceHash'].sort().join()
        || typeof fieldReportOrigin.reportId !== 'string' || !/^[a-f0-9]{64}$/.test(fieldReportOrigin.reportSourceHash || '')
        || direction !== 'outbound')) fail('Invalid approved field-report source.');
      if (photoEvidenceOrigin && (attachment || direction !== 'outbound')) fail('Released photo evidence must be linked to an outbound client draft without re-uploading it.');
      if (photoEvidenceOrigin && !linkedEvidence) fail('Released photo evidence is unavailable.', 409);
      const basis = { accessId, direction, body, replyTo, photo, sourceChannel, providerId, providerTimestamp, analysisOrigin, rfiResponseOrigin, fieldReportOrigin };
      if (photoEvidenceOrigin) basis.photoEvidenceOrigin = photoEvidenceOrigin;
      const sourceHash = hash(basis);
      const id = `chat_${hash([accessId, direction, payload.entryKey])}`;
      const existing = this.event('conversation_source', id);
      if (existing) {
        if (existing.sourceHash !== sourceHash) fail('Message entry key already belongs to different content.', 409);
        return { ...this.project(this.message(accessId, id)), replayed: true };
      }
      if (analysisOrigin) {
        const analysis = this.event('conversation_analysis', accessId);
        if (direction !== 'outbound' || !analysis || analysis.identity !== analysisOrigin.identity || analysis.sourceHash !== hash(this.analysisSources(accessId))
          || !analysis.findings.some(finding => finding.sourceId === analysisOrigin.sourceId && finding.quote === analysisOrigin.quote)) fail('The analysis source changed or the proposed quotation does not match.', 409);
      }
      if (fieldReportOrigin) this.assertCurrentFieldReportOrigin(fieldReportOrigin, accessId, access.jobId);
      if (photoEvidenceOrigin) this.assertCurrentPhotoEvidenceOrigin(photoEvidenceOrigin, accessId, access.jobId);
      if (rfiResponseOrigin) {
        const row = this.ledger.db.prepare('SELECT * FROM rfi_records WHERE id = ? AND job_id = ?').get(rfiResponseOrigin.rfiId, access.jobId);
        const rfi = row ? this.ledger.mapRfi(row) : null;
        const approval = rfi?.approvalId ? this.ledger.db.prepare('SELECT id, status, resolved_at, data_json FROM approvals WHERE id = ? AND target_id = ?').get(rfi.approvalId, rfi.id) : null;
        const approvedTerms = approval ? parse(approval.data_json) : null;
        const approvedResponse = approvedTerms?.response ?? approvedTerms?.transition?.response;
        const origin = rfi?.data?.conversationOrigin;
        const analysis = this.event('conversation_analysis', accessId);
        const source = origin?.messageId ? this.message(accessId, origin.messageId) : null;
        if (direction !== 'outbound' || !replyTo || replyTo !== rfiResponseOrigin.sourceMessageId || body !== rfi?.response
          || !['answered', 'resolved', 'closed'].includes(rfi?.status) || !approval || approval.id !== rfiResponseOrigin.approvalId
          || approval.status !== 'approved' || !approval.resolved_at || approvedResponse !== rfi.response
          || hash(rfi.response) !== rfiResponseOrigin.responseHash
          || origin?.accessId !== accessId || origin.messageId !== source?.id || source.direction !== 'inbound'
          || source.sourceHash !== rfiResponseOrigin.messageSourceHash || origin.messageSourceHash !== source.sourceHash
          || analysis?.identity !== rfiResponseOrigin.analysisIdentity || analysis.identity !== origin.analysisIdentity
          || analysis.sourceHash !== hash(this.analysisSources(accessId)) || !analysis.findings.some(finding => (
            finding.sourceId === source.id && finding.quote === origin.quote && finding.category === origin.category
          ))
          || !analysisOrigin || analysisOrigin.identity !== analysis.identity || analysisOrigin.sourceId !== source.id
          || analysisOrigin.quote !== origin.quote) fail('The approved RFI response or its customer source changed; review current evidence before drafting a reply.', 409);
      }
      let document = null;
      if (attachment) document = this.ledger.addDocument(access.jobId, {
        type: 'photo', title: attachment.originalName, filename: attachment.originalName, mimeType: attachment.mimeType,
        sizeBytes: attachment.size, storageRef: attachment.storageRef, status: 'stored',
        data: { private: true, clientVisible: false, contentHash: attachment.sha256, conversationAccessId: accessId }
      }, { actor });
      else if (linkedEvidence) document = linkedEvidence.document;
      const communication = this.ledger.addCommunication(access.jobId, {
        channel: `chat:${accessId}`, direction, body, subject: 'Client conversation', requiresApproval: direction === 'outbound',
        data: { source: 'client_conversation', clientVisible: false, sourceHash, portalAccessId: accessId,
          fieldReportOrigin: fieldReportOrigin || null, photoEvidenceOrigin: photoEvidenceOrigin || null }
      }, { actor, id });
      const source = { id, accessId, jobId: access.jobId, direction, body, replyTo, sourceChannel, providerId, providerTimestamp,
        sourceHash, basis, createdAt: communication.createdAt, attachment: photo ? { ...photo, documentId: document.id } : null };
      this.record('conversation_source', id, access.jobId, 'retain_conversation_source', source, actor);
      return { ...this.project(this.message(accessId, id)), replayed: false };
    });
  }

  createLegacyPortalMessage(token, payload = {}, actor = 'client_portal') {
    return this.ledger.transaction(() => {
      const snapshot = this.ledger.getClientPortalSnapshot(token);
      const legacy = this.ledger.addClientPortalMessage(token, payload, { actor });
      const access = this.access(snapshot.portal.accessId);
      const communicationId = legacy.communication.id;
      const message = this.linkLegacyCommunication(access, communicationId, actor);
      return { communication: legacy.communication, portal: legacy.portal, message };
    });
  }

  importLegacyMessage(accessId, communicationId, actor) {
    return this.ledger.transaction(() => {
      const access = this.access(accessId);
      return { message: this.linkLegacyCommunication(access, communicationId, actor), replayed: Boolean(this.event('conversation_legacy_migration', communicationId)) };
    });
  }

  linkLegacyCommunication(access, communicationId, actor) {
    const row = this.ledger.db.prepare(`SELECT * FROM communication_records
      WHERE id = ? AND job_id = ? AND client_id = ?`).get(communicationId, access.jobId, access.clientId);
    if (!row || row.direction !== 'inbound' || row.status !== 'received') fail('Legacy client message is no longer eligible for conversation migration.', 409);
    const existingSource = this.event('conversation_source', communicationId);
    if (existingSource) {
      if (existingSource.accessId !== access.id || existingSource.body !== row.body) fail('Legacy client message is already linked to a different conversation.', 409);
      return this.project(this.message(access.id, communicationId));
    }

    const data = parse(row.data_json);
    if (data.source !== 'client_portal' || data.portalAccessId !== access.id || row.channel !== 'portal') {
      fail('Legacy client message does not match this customer access.', 403);
    }
    const createdAt = row.created_at;
    const basis = { accessId: access.id, direction: 'inbound', body: row.body, replyTo: null, photo: null,
      sourceChannel: 'portal_compatibility', providerId: null, providerTimestamp: createdAt, legacyCommunicationId: communicationId };
    const sourceHash = hash(basis);
    const migratedAt = new Date().toISOString();
    const source = { id: communicationId, accessId: access.id, jobId: access.jobId, direction: 'inbound', body: row.body,
      replyTo: null, sourceChannel: 'portal_compatibility', providerId: null, providerTimestamp: createdAt,
      sourceHash, basis, createdAt, attachment: null };
    const updatedData = { ...data, source: 'client_conversation', portalAccessId: access.id, sourceHash };
    this.ledger.db.prepare('UPDATE communication_records SET channel = ?, data_json = ?, updated_at = ? WHERE id = ?')
      .run(`chat:${access.id}`, JSON.stringify(updatedData), migratedAt, communicationId);
    const updatedCommunication = this.ledger.mapCommunication(
      this.ledger.db.prepare('SELECT * FROM communication_records WHERE id = ?').get(communicationId)
    );
    this.record('communication', communicationId, access.jobId, 'link_legacy_portal_message_to_conversation', updatedCommunication, actor);
    this.record('conversation_source', communicationId, access.jobId, 'retain_conversation_source', source, actor);
    this.record('conversation_legacy_migration', communicationId, access.jobId, 'migrate_legacy_portal_message', {
      accessId: access.id, sourceHash, originalCreatedAt: createdAt, migratedAt
    }, actor);
    return this.project(this.message(access.id, communicationId));
  }

  publish(accessId, id, sourceHash, actor) {
    return this.ledger.transaction(() => {
      const message = this.message(accessId, id);
      if (message.sourceHash !== sourceHash || message.direction !== 'outbound') fail('Publication source does not match.', 409);
      if (message.basis?.fieldReportOrigin) this.assertCurrentFieldReportOrigin(message.basis.fieldReportOrigin, accessId, message.jobId);
      if (message.basis?.photoEvidenceOrigin) this.assertCurrentPhotoEvidenceOrigin(message.basis.photoEvidenceOrigin, accessId, message.jobId);
      const approval = this.ledger.db.prepare('SELECT * FROM approvals WHERE id = ? AND target_id = ?').get(message.approvalId, id);
      if (!approval || approval.status !== 'approved' || !approval.resolved_at) fail('Approve this exact message before publishing.', 409);
      this.ledger.assertDataSubjectProcessingAllowed('client', this.access(accessId).clientId, 'outbound_communication');
      if (!this.event('conversation_publication', id)) this.record('conversation_publication', id, message.jobId, 'publish_conversation_message', { sourceHash, approvalId: approval.id, publishedAt: new Date().toISOString() }, actor);
      return this.project(this.message(accessId, id));
    });
  }

  approvedRfiResponses(accessId) {
    const access = this.access(accessId);
    const analysis = this.event('conversation_analysis', accessId);
    if (!analysis || analysis.sourceHash !== hash(this.analysisSources(accessId))) return [];
    const rows = this.ledger.db.prepare(`SELECT rfi.* FROM rfi_records rfi
      WHERE rfi.job_id = ? AND rfi.status IN ('answered', 'resolved', 'closed')
      ORDER BY rfi.updated_at DESC LIMIT 100`).all(access.jobId);
    return rows.flatMap(row => {
      const rfi = this.ledger.mapRfi(row);
      const origin = rfi.data?.conversationOrigin;
      if (origin?.evidenceKind !== 'message_finding' || origin.accessId !== accessId
        || origin.analysisIdentity !== analysis.identity || !rfi.response || !rfi.approvalId) return [];
      const approval = this.ledger.db.prepare('SELECT id, status, resolved_at, data_json FROM approvals WHERE id = ? AND target_id = ?').get(rfi.approvalId, rfi.id);
      const approvedTerms = approval ? parse(approval.data_json) : null;
      const approvedResponse = approvedTerms?.response ?? approvedTerms?.transition?.response;
      if (approval?.status !== 'approved' || !approval.resolved_at || approvedResponse !== rfi.response) return [];
      try {
        const source = this.message(accessId, origin.messageId);
        if (source.direction !== 'inbound' || source.sourceHash !== origin.messageSourceHash
          || !analysis.findings.some(finding => finding.sourceId === source.id && finding.quote === origin.quote && finding.category === origin.category)) return [];
        return [{ id: rfi.id, title: rfi.title, response: rfi.response, approvalId: rfi.approvalId,
          sourceMessageId: source.id, sourceQuote: origin.quote, sourceHash: source.sourceHash, analysisIdentity: analysis.identity }];
      } catch { return []; }
    });
  }

  createReplyDraftFromRfi(accessId, rfiId, actor) {
    return this.ledger.transaction(() => {
      const access = this.access(accessId);
      const key = `approved-rfi-response:${rfiId}`;
      if (!/^[\w.:-]{8,200}$/.test(key)) fail('The RFI identifier cannot be used as a conversation entry key.');
      const rfi = this.ledger.db.prepare('SELECT * FROM rfi_records WHERE id = ? AND job_id = ?').get(rfiId, access.jobId);
      const data = rfi ? parse(rfi.data_json) : null;
      const origin = data?.conversationOrigin;
      const approved = this.approvedRfiResponses(accessId).find(item => item.id === rfiId);
      if (!approved || !origin || !rfi.response) fail('This RFI has no current, approved client-conversation response. Refresh and review the conversation.', 409);
      const message = this.create(accessId, {
        entryKey: key,
        body: rfi.response,
        replyTo: origin.messageId,
        analysisOrigin: { identity: origin.analysisIdentity, sourceId: origin.messageId, quote: origin.quote },
        rfiResponseOrigin: {
          rfiId, approvalId: rfi.approval_id, responseHash: hash(rfi.response), analysisIdentity: origin.analysisIdentity,
          sourceMessageId: origin.messageId, messageSourceHash: origin.messageSourceHash
        }
      }, { direction: 'outbound', actor });
      return { message, replayed: message.replayed === true };
    });
  }

  attachment(accessId, id, { client = false } = {}) {
    const message = this.message(accessId, id, { client });
    if (!message.attachment) fail('Message has no photo.', 404);
    if (message.basis?.photoEvidenceOrigin) {
      const linked = this.assertCurrentPhotoEvidenceOrigin(message.basis.photoEvidenceOrigin, accessId, message.jobId);
      return { document: linked.document, sha256: message.basis.photoEvidenceOrigin.sha256 };
    }
    const document = this.ledger.getDocument(message.attachment.documentId);
    if (document.jobId !== message.jobId || (document.data?.analysis?.upload?.sha256 || document.data?.contentHash) !== message.attachment.sha256) fail('Photo source integrity failed.', 409);
    return { document, sha256: message.attachment.sha256 };
  }

  analysisSources(accessId) {
    const messages = [];
    let before = '';
    do {
      const page = this.list(accessId, { before, limit: 50 });
      messages.unshift(...page.messages.filter(message => message.direction === 'inbound' || message.status === 'published'));
      before = page.nextCursor || '';
      if (messages.length > 1000) {
        throw Object.assign(new Error('This conversation exceeds the 1000-message local analysis limit. No partial analysis was created.'), {
          statusCode: 413, code: 'conversation_analysis_source_limit'
        });
      }
    } while (before);
    const sources = messages.map(message => ({ id: message.id, body: message.body, direction: message.direction,
      sourceHash: message.sourceHash, attachment: message.attachment }));
    if (Buffer.byteLength(JSON.stringify(sources)) > 2 * 1024 * 1024) {
      throw Object.assign(new Error('This conversation exceeds the 2 MB local analysis evidence limit. No partial analysis was created.'), {
        statusCode: 413, code: 'conversation_analysis_evidence_limit'
      });
    }
    return sources;
  }

  createRfiFromFinding(accessId, payload, actor) {
    return this.createRfiFromAnalysisItem(accessId, payload, actor, 'message_finding');
  }

  createRfiFromObservation(accessId, payload, actor) {
    return this.createRfiFromAnalysisItem(accessId, payload, actor, 'photo_observation');
  }

  createVariationFromFinding(accessId, payload, actor) {
    return this.ledger.transaction(() => {
      const access = this.access(accessId);
      if (!/^[\w.:-]{8,120}$/.test(payload?.entryKey || '')) fail('A stable variation action key is required.');
      const actionId = `conversation_action_${hash([accessId, 'formal_variation', payload.entryKey])}`;
      const requestHash = hash(payload);
      const previous = this.event('conversation_action', actionId);
      if (previous) {
        if (previous.requestHash !== requestHash) fail('This action key already belongs to different variation content.', 409);
        const row = this.ledger.db.prepare('SELECT * FROM change_orders WHERE id = ? AND job_id = ?').get(previous.changeOrderId, access.jobId);
        if (!row) fail('The retained conversation variation is unavailable.', 409);
        return { changeOrder: this.ledger.mapChangeOrder(row), replayed: true };
      }
      const analysis = this.event('conversation_analysis', accessId);
      const sources = this.analysisSources(accessId);
      if (!analysis || analysis.identity !== payload.analysisIdentity || analysis.sourceHash !== hash(sources)) fail('The conversation changed after analysis. Refresh and review the current analysis.', 409);
      const source = this.message(accessId, payload.sourceId);
      const finding = analysis.findings.find(item => item.sourceId === source.id && item.quote === payload.quote && item.category === 'request');
      if (source.direction !== 'inbound' || !finding || !source.body.includes(finding.quote)) fail('Only a current client request can start a formal variation draft.', 409);
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      const scopeDelta = typeof payload.scopeDelta === 'string' ? payload.scopeDelta.trim() : '';
      const justification = typeof payload.justification === 'string' ? payload.justification.trim() : '';
      const scheduleImpactNarrative = typeof payload.scheduleImpactNarrative === 'string' ? payload.scheduleImpactNarrative.trim() : '';
      const riskImpactStatement = typeof payload.riskImpactStatement === 'string' ? payload.riskImpactStatement.trim() : '';
      const amount = payload.amount;
      const scheduleDeltaDays = payload.scheduleDeltaDays;
      if (title.length < 2 || title.length > 160 || scopeDelta.length < 8 || scopeDelta.length > 4000
        || justification.length < 8 || justification.length > 2000 || scheduleImpactNarrative.length < 8 || scheduleImpactNarrative.length > 2000
        || riskImpactStatement.length < 8 || riskImpactStatement.length > 2000) fail('Complete the variation title, scope, justification and impact reviews.');
      if (typeof amount !== 'number' || !Number.isFinite(amount) || Math.abs(amount) > 10_000_000) fail('Enter an estimated net amount in EUR.');
      if (typeof scheduleDeltaDays !== 'number' || !Number.isFinite(scheduleDeltaDays) || Math.abs(scheduleDeltaDays) > 3650) fail('Enter the proposed schedule impact in calendar days.');
      if (!['none', 'low', 'medium', 'high', 'critical'].includes(payload.riskImpact)) fail('Review and select a risk impact.');
      const conversationOrigin = { evidenceKind: 'message_finding', accessId, messageId: source.id, messageSourceHash: source.sourceHash,
        quote: finding.quote, category: finding.category, suggestion: finding.suggestion, uncertainty: finding.uncertainty, analysisIdentity: analysis.identity };
      const entryKey = `client-conversation:${hash([accessId, source.id, payload.entryKey])}`;
      const changeOrder = this.ledger.createChangeOrder(access.jobId, {
        entryKey, title, scopeDelta, amount, currency: 'EUR', taxRate: 21, scheduleDeltaDays,
        variationType: 'client_request', initiatedBy: 'client', cause: finding.quote, justification,
        requestedAt: source.createdAt, scheduleImpactNarrative, riskImpact: payload.riskImpact, riskImpactStatement,
        evidenceReferences: ['Customer request received via secure conversation'],
        assumptions: ['Scope, quantities and constructability must be verified before issue.'],
        exclusions: ['No work is authorized by this draft.'], status: 'draft'
      }, { actor, conversationOrigin });
      this.record('conversation_action', actionId, access.jobId, 'prepare_variation_from_conversation_request',
        { actionId, requestHash, accessId, sourceId: source.id, sourceHash: source.sourceHash, analysisIdentity: analysis.identity,
          changeOrderId: changeOrder.id, approvalId: changeOrder.approvalId || null, workAuthorized: false }, actor);
      return { changeOrder, replayed: false };
    });
  }

  createSelectionFromFinding(accessId, payload, actor) {
    return this.ledger.transaction(() => {
      const access = this.access(accessId);
      if (!/^[\w.:-]{8,120}$/.test(payload?.entryKey || '')) fail('A stable client-decision action key is required.');
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      const options = Array.isArray(payload.options) ? payload.options.map(value => String(value).trim()) : [];
      const rationale = typeof payload.rationale === 'string' ? payload.rationale.trim() : '';
      if (title.length < 3 || title.length > 160 || options.length < 2 || options.length > 10
        || options.some(option => !option || option.length > 160) || new Set(options.map(value => value.toLocaleLowerCase())).size !== options.length
        || rationale.length < 3 || rationale.length > 1000) fail('Enter a clear customer question, 2 to 10 distinct options, and the office review rationale.');
      let dueAt;
      try { dueAt = this.ledger.normalizeReservationDate(payload.dueAt, 'dueAt'); } catch { fail('Enter a valid customer decision due date.'); }
      if (!Number.isFinite(Date.parse(dueAt)) || Date.parse(dueAt) <= Date.now()) fail('The customer decision due date must be in the future.');
      const actionId = `conversation_action_${hash([accessId, 'client_selection', payload.entryKey])}`;
      const request = { analysisIdentity: payload.analysisIdentity, sourceId: payload.sourceId, quote: payload.quote, category: payload.category, title, options, dueAt, rationale };
      const requestHash = hash(request);
      const previous = this.event('conversation_action', actionId);
      if (previous) {
        if (previous.requestHash !== requestHash) fail('This action key already belongs to different client-decision content.', 409);
        const row = this.ledger.db.prepare('SELECT * FROM client_selections WHERE id = ? AND job_id = ?').get(previous.selectionId, access.jobId);
        if (!row) fail('The retained client-decision proposal is unavailable.', 409);
        return { selection: this.ledger.mapClientSelection(row), replayed: true };
      }
      const analysis = this.event('conversation_analysis', accessId);
      const sources = this.analysisSources(accessId);
      if (!analysis || analysis.identity !== payload.analysisIdentity || analysis.sourceHash !== hash(sources)) fail('The conversation changed after analysis. Refresh and review the current analysis.', 409);
      const source = this.message(accessId, payload.sourceId);
      const finding = analysis.findings.find(item => item.sourceId === source.id && item.quote === payload.quote && item.category === 'request');
      if (source.direction !== 'inbound' || !finding || !source.body.includes(finding.quote)) fail('Only a current inbound client request can prepare a customer choice.', 409);
      const conversationOrigin = { evidenceKind: 'message_finding', accessId, messageId: source.id,
        messageSourceHash: source.sourceHash, quote: finding.quote, category: finding.category,
        suggestion: finding.suggestion, uncertainty: finding.uncertainty, analysisIdentity: analysis.identity,
        analysisSourceHash: analysis.sourceHash, rationale };
      const selection = this.ledger.createClientSelection(access.jobId, {
        title, category: 'client_request', options, status: 'pending_client', dueAt,
        clientVisible: false, requiresApproval: true, source: 'conversation_analysis',
        notes: rationale, data: { conversationOrigin, publishAfterApproval: true }
      }, { actor, conversationOrigin });
      this.record('conversation_action', actionId, access.jobId, 'prepare_client_selection_from_conversation_request',
        { actionId, requestHash, accessId, sourceId: source.id, sourceHash: source.sourceHash,
          analysisIdentity: analysis.identity, selectionId: selection.id, approvalId: selection.approvalId,
          clientVisible: false, externalCommitments: 0 }, actor);
      return { selection, replayed: false };
    });
  }

  assertSelectionPublicationCurrent(selection) {
    const data = selection?.data || {};
    if (data.publishAfterApproval !== true) return true;
    const origin = data.conversationOrigin;
    if (!origin || origin.evidenceKind !== 'message_finding') fail('The client-choice proposal source is missing.', 409);
    const access = this.access(origin.accessId);
    if (access.jobId !== selection.jobId) fail('The client-choice source belongs to another job.', 409);
    const sources = this.analysisSources(access.id);
    const analysis = this.event('conversation_analysis', access.id);
    const source = this.message(access.id, origin.messageId);
    const finding = analysis?.findings?.find(item => item.sourceId === source.id && item.quote === origin.quote && item.category === 'request');
    if (!analysis || analysis.identity !== origin.analysisIdentity || analysis.sourceHash !== origin.analysisSourceHash
      || analysis.sourceHash !== hash(sources) || source.direction !== 'inbound' || source.sourceHash !== origin.messageSourceHash
      || !finding || !source.body.includes(finding.quote)) fail('The conversation or model analysis changed. Refresh and re-approve the customer choice.', 409);
    return true;
  }

  isCurrentRfiOrigin(origin, jobId) {
    try {
      if (!origin || !['message_finding', 'photo_observation'].includes(origin.evidenceKind)) return false;
      const access = this.access(origin.accessId);
      if (access.jobId !== jobId) return false;
      const sources = this.analysisSources(access.id);
      const analysis = this.event('conversation_analysis', access.id);
      const source = this.message(access.id, origin.messageId);
      if (!analysis || analysis.identity !== origin.analysisIdentity || analysis.sourceHash !== hash(sources)
        || source.direction !== 'inbound' || source.sourceHash !== origin.messageSourceHash) return false;
      if (origin.evidenceKind === 'message_finding') {
        return analysis.findings.some(item => item.sourceId === source.id && item.quote === origin.quote
          && item.category === origin.category && source.body.includes(item.quote));
      }
      return source.attachment?.sha256 === origin.photoSha256
        && analysis.observations?.some(item => item.sourceId === source.id && item.sha256 === origin.photoSha256
          && item.observation === origin.observation && item.uncertainty === origin.uncertainty);
    } catch {
      return false;
    }
  }

  createRfiFromAnalysisItem(accessId, payload, actor, evidenceKind) {
    return this.ledger.transaction(() => {
      const access = this.access(accessId);
      if (!/^[\w.:-]{8,120}$/.test(payload?.entryKey || '')) fail('A stable RFI action key is required.');
      const actionId = `conversation_action_${hash([accessId, evidenceKind, payload.entryKey])}`;
      const requestHash = hash(payload);
      const previous = this.event('conversation_action', actionId);
      if (previous) {
        if (previous.requestHash !== requestHash) fail('This action key already belongs to different RFI content.', 409);
        const row = this.ledger.db.prepare('SELECT * FROM rfi_records WHERE id = ? AND job_id = ?').get(previous.rfiId, access.jobId);
        if (!row) fail('The retained conversation RFI is unavailable.', 409);
        return { rfi: this.ledger.mapRfi(row), replayed: true };
      }
      const analysis = this.event('conversation_analysis', accessId);
      const sources = this.analysisSources(accessId);
      if (!analysis || analysis.identity !== payload.analysisIdentity || analysis.sourceHash !== hash(sources)) fail('The conversation changed after analysis. Refresh and review the current analysis.', 409);
      const source = this.message(accessId, payload.sourceId);
      if (source.direction !== 'inbound') fail('Only inbound client evidence can become an RFI.');
      let origin;
      if (evidenceKind === 'message_finding') {
        if (!['question', 'request', 'issue', 'contradiction'].includes(payload.category)) fail('Only a current client question, request, issue or contradiction can become an RFI.');
        const finding = analysis.findings.find(item => item.sourceId === source.id && item.quote === payload.quote && item.category === payload.category);
        if (!finding || !source.body.includes(finding.quote)) fail('Review the current source quotation before creating the RFI.', 409);
        origin = { evidenceKind, accessId, messageId: source.id, messageSourceHash: source.sourceHash, quote: finding.quote,
          category: finding.category, suggestion: finding.suggestion, uncertainty: finding.uncertainty, analysisIdentity: analysis.identity };
      } else {
        const observation = analysis.observations?.find(item => item.sourceId === source.id && item.sha256 === payload.photoSha256
          && item.observation === payload.observation && item.uncertainty === payload.uncertainty);
        if (!source.attachment || source.attachment.sha256 !== payload.photoSha256 || !observation) fail('The photo or its current AI observation changed. Refresh and review the source photo.', 409);
        origin = { evidenceKind, accessId, messageId: source.id, messageSourceHash: source.sourceHash,
          photoSha256: source.attachment.sha256, observation: observation.observation, uncertainty: observation.uncertainty, analysisIdentity: analysis.identity };
      }
      if (typeof payload.question !== 'string' || !payload.question.trim() || payload.question.trim().length > 2000) fail('Enter the internal RFI question.', 409);
      const title = typeof payload.title === 'string' ? payload.title.trim() : '';
      const responsible = typeof payload.responsible === 'string' ? payload.responsible.trim() : '';
      if (!title || title.length > 160 || !responsible || responsible.length > 160) fail('Enter an RFI title and responsible person.');
      let dueAt;
      try { dueAt = this.ledger.normalizeReservationDate(payload.dueAt, 'dueAt'); } catch { fail('Enter a valid RFI follow-up date.'); }
      if (!Number.isFinite(Date.parse(dueAt)) || Date.parse(dueAt) <= Date.now()) fail('The RFI follow-up date must be in the future.');
      if (payload.shareWithField === true && !Array.isArray(payload.fieldTaskIds)) fail('Select affected work tasks before sharing an approved answer with the field.');
      const fieldTaskIds = payload.shareWithField === true ? [...new Set(payload.fieldTaskIds)] : [];
      if (payload.shareWithField === true && (!fieldTaskIds.length || fieldTaskIds.length > 50 || fieldTaskIds.some(id => typeof id !== 'string'))) fail('Select one or more affected work tasks before sharing an approved answer with the field.');
      const jobTasks = this.ledger.db.prepare('SELECT id FROM job_tasks WHERE job_id = ?').all(access.jobId).map(row => row.id);
      if (fieldTaskIds.some(id => !jobTasks.includes(id))) fail('A selected work task does not belong to this assignment.', 409);
      const rfi = this.ledger.createRfi(access.jobId, {
        title, question: payload.question.trim(), responsible, dueAt, status: 'open', requiresApproval: false,
        source: 'client_conversation_analysis',
        conversationOrigin: origin,
        fieldTaskIds,
        fieldShareEnabled: payload.shareWithField === true
      }, { actor });
      this.record('conversation_action', actionId, access.jobId, `create_rfi_from_${evidenceKind}`,
        { actionId, requestHash, accessId, sourceId: source.id, sourceHash: source.sourceHash, analysisIdentity: analysis.identity, rfiId: rfi.id }, actor);
      return { rfi, replayed: false };
    });
  }
}

module.exports = { ClientConversation, hash, fail };
