const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { ClientConversation, hash } = require('../client-conversation');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chat-contract-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(dir, 'ledger.sqlite') });
  t.after(() => { ledger.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const job = ledger.createIntake({ title: 'Private conversation', status: 'in_progress', client: { name: 'Client' }, assignAutomatically: false });
  const access = ledger.createClientPortalAccess(job.id);
  ledger.resolveApproval(access.approval.id, { status: 'approved' });
  const other = ledger.createClientPortalAccess(job.id);
  ledger.resolveApproval(other.approval.id, { status: 'approved' });
  return { ledger, job, access, other, chat: new ClientConversation(ledger) };
}

test('conversation retains immutable scoped sources and exact retry receipts', t => {
  const { chat, access, other, ledger } = fixture(t);
  const payload = { entryKey: 'chat-message-001', body: 'Can the opening be 90 cm?' };
  const a = chat.create(access.id, payload, { direction: 'inbound', actor: 'client_portal' });
  assert.equal(chat.create(access.id, payload, { direction: 'inbound' }).id, a.id);
  assert.equal(chat.list(access.id, { client: true }).messages.length, 1);
  assert.equal(chat.list(other.id, { client: true }).messages.length, 0);
  assert.throws(() => chat.create(access.id, { ...payload, body: 'changed' }, { direction: 'inbound' }), { statusCode: 409 });
  assert.throws(() => chat.create(other.id, { ...payload, replyTo: a.id }, { direction: 'inbound' }), { statusCode: 404 });
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
});

test('outbound chat and photo remain private until a source-current approval is released', t => {
  const { chat, access, ledger } = fixture(t);
  const message = chat.create(access.id, { entryKey: 'chat-outbound-01', body: 'Please inspect this detail.' }, { direction: 'outbound', actor: 'office', attachment: { originalName: 'detail.png', mimeType: 'image/png', size: 20, sha256: 'a'.repeat(64), storageRef: 'private/photo.png' } });
  assert.equal(chat.list(access.id, { client: true }).messages.length, 0);
  assert.throws(() => chat.publish(access.id, message.id, message.sourceHash, 'owner'), { statusCode: 409 });
  ledger.resolveApproval(message.approvalId, { status: 'approved' });
  chat.publish(access.id, message.id, message.sourceHash, 'owner');
  const visible = chat.list(access.id, { client: true }).messages;
  assert.equal(visible.length, 1);
  assert.equal(visible[0].attachment.mimeType, 'image/png');
  assert.equal(JSON.stringify(visible).includes('storageRef'), false);
  assert.equal(ledger.getClientPortalSnapshot(access.portalToken).job.updates.length, 0);
  ledger.db.prepare('UPDATE communication_records SET body = ? WHERE id = ?').run('Tampered', message.id);
  assert.throws(() => chat.message(access.id, message.id), { statusCode: 409 });
});

test('approved client-visible field reports create source-bound customer drafts with separate publication approval', t => {
  const { chat, access, job, ledger } = fixture(t);
  const report = ledger.createFieldReport(job.id, {
    reportDate: '2026-09-27', status: 'client_visible', clientVisible: true, manpower: 4,
    weather: 'Internal weather note', workCompleted: 'The frame installation was completed and checked.'
  }, { actor: 'office_operator' });
  ledger.resolveApproval(report.approvalId, { status: 'approved', reason: 'Daily report reviewed for client visibility.' });
  const source = chat.fieldReportUpdates(access.id).find(item => item.id === report.id);
  assert.ok(source);
  const draft = chat.createFieldReportDraft(access.id, report.id, {
    entryKey: 'field-report-client-update-01', sourceHash: source.sourceHash,
    body: 'Today the frame was installed and checked. The next step is finishing the interior trim.'
  }, 'office_operator');
  assert.equal(draft.message.status, 'draft');
  assert.deepEqual(draft.message.sourceReference, { type: 'field_report', id: report.id });
  assert.equal(chat.list(access.id, { client: true }).messages.length, 0);
  assert.equal(chat.createFieldReportDraft(access.id, report.id, {
    entryKey: 'field-report-client-update-01', sourceHash: source.sourceHash,
    body: 'Today the frame was installed and checked. The next step is finishing the interior trim.'
  }, 'office_operator').replayed, true);

  ledger.resolveApproval(draft.message.approvalId, { status: 'approved', reason: 'Customer wording and source report reviewed.' });
  assert.equal(chat.list(access.id, { client: true }).messages.length, 0, 'approval alone does not publish the update');
  chat.publish(access.id, draft.message.id, draft.message.sourceHash, 'approver');
  assert.equal(chat.list(access.id, { client: true }).messages[0].body, draft.message.body);
  assert.equal(chat.list(access.id, { client: true }).messages[0].sourceReference, undefined);

  const changedReport = ledger.createFieldReport(job.id, {
    reportDate: '2026-09-27', status: 'client_visible', clientVisible: true,
    workCompleted: 'Initial approved summary.'
  }, { actor: 'office_operator' });
  ledger.resolveApproval(changedReport.approvalId, { status: 'approved' });
  const changedSource = chat.fieldReportUpdates(access.id).find(item => item.id === changedReport.id);
  const staleDraft = chat.createFieldReportDraft(access.id, changedReport.id, {
    entryKey: 'field-report-client-update-stale', sourceHash: changedSource.sourceHash,
    body: 'Work completed today.'
  }, 'office_operator').message;
  ledger.db.prepare('UPDATE field_reports SET work_completed = ? WHERE id = ?').run('Corrected report content.', changedReport.id);
  assert.throws(() => ledger.resolveApproval(staleDraft.approvalId, { status: 'approved' }), { statusCode: 409 });
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(staleDraft.approvalId).status, 'pending');
  assert.equal(chat.list(access.id, { client: true }).messages.length, 1);
});

test('only released same-job photos can become private customer drafts and stale evidence blocks approval', t => {
  const { chat, access, job, ledger } = fixture(t);
  const worker = ledger.upsertWorker({ id: 'chat-photo-worker', name: 'Field installer', role: 'Installer', status: 'available' });
  const assignment = ledger.addAssignment(job.id, { workerId: worker.id, role: worker.role, status: 'planned' });
  const task = ledger.addTask(job.id, { title: 'Install roof membrane', status: 'in_progress', assigneeId: worker.id });
  const set = ledger.createPhotoEvidenceSet(job.id, {
    entryKey: 'conversation-photo-evidence-set-001', taskId: task.id, assignmentId: assignment.id,
    assignedWorkerId: worker.id, title: 'Roof membrane progress', workLocation: 'Roof / section A',
    requiredPhases: ['before', 'during', 'after']
  }, { actor: 'role:office_operator:planner' });
  const docs = ['before', 'during', 'after'].map(phase => {
    const bytesHash = crypto.createHash('sha256').update(`conversation-photo-${phase}`).digest('hex');
    return ledger.addDocument(job.id, {
      type: 'photo', title: `${phase} roof photo`, filename: `${phase}.jpg`, mimeType: 'image/jpeg', sizeBytes: 128,
      storageRef: `private/${phase}.jpg`, status: 'stored',
      analysis: { upload: { storageRef: `private/${phase}.jpg`, mimeType: 'image/jpeg', size: 128, sha256: bytesHash } }
    });
  });
  for (const [index, phase] of ['before', 'during', 'after'].entries()) {
    ledger.recordPhotoEvidenceCapture(job.id, set.id, docs[index].id, {
      entryKey: `conversation-photo-capture-${phase}-001`, phase,
      capturedAt: new Date(Date.now() - (3 - index) * 60000).toISOString(), caption: `${phase} phase checked`, capturedByWorkerId: worker.id
    }, { actor: `role:field_worker:${worker.id}`, workerId: worker.id, enforceWorkerScope: true });
  }
  const review = ledger.requestPhotoEvidenceReview(job.id, set.id, { entryKey: 'conversation-photo-review-001' }, { actor: 'role:office_operator:planner' });
  ledger.resolveApproval(review.approval.id, { status: 'approved', reason: 'Chronology, images and work scope checked.' }, { actor: 'role:approver:quality', enforceSeparation: true });

  const [photo] = chat.photoEvidenceUpdates(access.id);
  assert.ok(photo);
  assert.equal(photo.origin.setId, set.id);
  const draft = chat.createPhotoEvidenceDraft(access.id, photo.id, {
    entryKey: 'conversation-released-photo-draft-001', origin: photo.origin, body: 'De dakbaan is aangebracht; zie de voortgangsfoto.'
  }, 'role:office_operator:planner').message;
  assert.equal(draft.status, 'draft');
  assert.equal(draft.attachment.sha256, photo.origin.sha256);
  assert.deepEqual(draft.sourceReference, { type: 'photo_evidence', id: photo.id, setId: set.id });
  const approvalRow = ledger.db.prepare('SELECT * FROM approvals WHERE id = ?').get(draft.approvalId);
  const decision = ledger.approvalDecisionSummary(ledger.mapApproval(approvalRow));
  assert.equal(decision.preview.photoEvidenceSource.phase, 'before');
  assert.equal(decision.preview.photoEvidenceSource.sha256, photo.origin.sha256);
  assert.ok(decision.safeguards.some(item => item.includes('released evidence set')));
  assert.equal(chat.list(access.id, { client: true }).messages.length, 0);
  assert.equal(chat.attachment(access.id, draft.id).document.id, photo.origin.documentId);

  ledger.resolveApproval(draft.approvalId, { status: 'approved', reason: 'Customer wording and image reviewed.' });
  chat.publish(access.id, draft.id, draft.sourceHash, 'approver');
  const clientMessage = chat.list(access.id, { client: true }).messages[0];
  assert.equal(clientMessage.attachment.mimeType, 'image/jpeg');
  assert.equal(clientMessage.sourceReference, undefined);
  assert.equal(JSON.stringify(clientMessage).includes('private/'), false);

  const staleDraft = chat.createPhotoEvidenceDraft(access.id, photo.id, {
    entryKey: 'conversation-released-photo-draft-002', origin: photo.origin, body: 'Een tweede update met deze foto.'
  }, 'role:office_operator:planner').message;
  const docData = ledger.getDocument(photo.origin.documentId).data;
  docData.analysis.upload.sha256 = 'f'.repeat(64);
  ledger.db.prepare('UPDATE documents SET data_json = ? WHERE id = ?').run(JSON.stringify(docData), photo.origin.documentId);
  assert.throws(() => ledger.resolveApproval(staleDraft.approvalId, { status: 'approved' }), { statusCode: 409 });
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(staleDraft.approvalId).status, 'pending');
});

test('conversation pagination is stable and revoked links cannot read old media or messages', t => {
  const { chat, access, ledger } = fixture(t);
  for (let i = 0; i < 3; i++) chat.create(access.id, { entryKey: `pagination-${i}`, body: `Message ${i}` }, { direction: 'inbound' });
  const first = chat.list(access.id, { limit: 2, client: true });
  assert.equal(first.messages.length, 2);
  assert.equal(chat.list(access.id, { before: first.nextCursor, limit: 2, client: true }).messages.length, 1);
  ledger.revokeClientPortalAccess(access.id);
  assert.throws(() => chat.list(access.id, { client: true }), { statusCode: 403 });
});

test('historical portal messages are discoverable and import only into their exact active customer access', t => {
  const { chat, access, other, ledger } = fixture(t);
  const legacy = ledger.addClientPortalMessage(access.portalToken, { body: 'We already selected the grey pavers.' }, { actor: 'client_portal' });
  ledger.addClientPortalMessage(other.portalToken, { body: 'This belongs to another portal link.' }, { actor: 'client_portal' });
  ledger.addCommunication(chat.access(access.id).jobId, {
    channel: 'portal', direction: 'inbound', status: 'received', body: 'No verifiable access link.',
    data: { source: 'client_portal' }
  }, { actor: 'client_portal' });

  const candidates = chat.legacyMessages(access.id);
  assert.deepEqual(candidates.messages.map(message => message.id), [legacy.communication.id]);
  assert.equal(candidates.messages[0].createdAt, legacy.communication.createdAt);
  assert.equal(chat.legacyMessages(other.id).messages.length, 1);
  assert.throws(() => chat.importLegacyMessage(other.id, legacy.communication.id, 'approver'), { statusCode: 403 });
  assert.equal(ledger.db.prepare('SELECT channel FROM communication_records WHERE id = ?').get(legacy.communication.id).channel, 'portal');

  const imported = chat.importLegacyMessage(access.id, legacy.communication.id, 'approver');
  assert.equal(imported.message.id, legacy.communication.id);
  assert.equal(imported.message.createdAt, legacy.communication.createdAt);
  assert.deepEqual(chat.legacyMessages(access.id).messages, []);
  assert.equal(chat.list(access.id, { client: true }).messages[0].id, legacy.communication.id);
  assert.equal(chat.list(other.id, { client: true }).messages.length, 0);
  assert.equal(chat.importLegacyMessage(access.id, legacy.communication.id, 'approver').replayed, true);
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
});

test('durable analysis scanner selects active conversations with unreviewed inbound messages only', t => {
  const { chat, access, other } = fixture(t);
  const inbound = chat.create(access.id, { entryKey: 'scanner-inbound-0001', body: 'Kan de vloer morgen worden geplaatst?' }, { direction: 'inbound' });
  chat.create(access.id, { entryKey: 'scanner-outbound-0001', body: 'We controleren dit.' }, { direction: 'outbound' });
  chat.create(other.id, { entryKey: 'scanner-other-inbound', body: 'Graag een terugkoppeling.' }, { direction: 'inbound' });
  assert.deepEqual(chat.unreviewedAccesses(), [{ accessId: access.id, jobId: chat.access(access.id).jobId }, { accessId: other.id, jobId: chat.access(other.id).jobId }]);
  chat.markReviewed(access.id, [{ id: inbound.id, sourceHash: inbound.sourceHash }], 'office_operator');
  assert.deepEqual(chat.unreviewedAccesses(), [{ accessId: other.id, jobId: chat.access(other.id).jobId }]);
});

test('analysis-derived drafts remain valid across private drafts but expire when customer evidence changes', t => {
  const { chat, access, job } = fixture(t);
  const source = chat.create(access.id, { entryKey: 'analysis-source-01', body: 'Please inspect the opening.' });
  const origin = { identity: hash('analysis-1'), sourceId: source.id, quote: 'inspect the opening' };
  chat.record('conversation_analysis', access.id, job.id, 'retain_conversation_analysis', {
    identity: origin.identity, sourceHash: hash(chat.analysisSources(access.id)), findings: [{ sourceId: origin.sourceId, quote: origin.quote }]
  });
  const payload = { entryKey: 'analysis-draft-01', body: 'Which opening?', analysisOrigin: origin };
  assert.throws(() => chat.create(access.id, { ...payload, analysisOrigin: { ...origin, hidden: 'extra data' } }, { direction: 'outbound' }), { statusCode: 400 });
  const draft = chat.create(access.id, payload, { direction: 'outbound' });
  assert.deepEqual(chat.message(access.id, draft.id).basis.analysisOrigin, origin);
  assert.equal(chat.create(access.id, payload, { direction: 'outbound' }).replayed, true);
  assert.equal(chat.create(access.id, { ...payload, entryKey: 'analysis-draft-02' }, { direction: 'outbound' }).status, 'draft');
  chat.create(access.id, { entryKey: 'analysis-new-customer-message', body: 'The opening has changed.' });
  assert.throws(() => chat.create(access.id, { ...payload, entryKey: 'analysis-draft-03' }, { direction: 'outbound' }), { statusCode: 409 });
  assert.throws(() => chat.create(access.id, { ...payload, entryKey: 'analysis-inbound-01' }), { statusCode: 409 });
});

test('current client contradictions can become assigned internal follow-up without deciding disputed scope', t => {
  const { chat, access, job, ledger } = fixture(t);
  const source = chat.create(access.id, {
    entryKey: 'contradiction-source-01', body: 'Ik dacht dat de extra sparing al in de prijs zat.'
  }, { direction: 'inbound' });
  const identity = hash('contradiction-analysis');
  const quote = source.body;
  const suggestion = 'Vergelijk de offerte en eerdere klantcommunicatie op de opgenomen sparing.';
  const uncertainty = 'De vastgelegde scope en de klantverwachting zijn nog niet met elkaar vergeleken.';
  chat.record('conversation_analysis', access.id, job.id, 'retain_conversation_analysis', {
    identity, sourceHash: hash(chat.analysisSources(access.id)),
    findings: [{ sourceId: source.id, quote, category: 'contradiction', suggestion, uncertainty }]
  }, 'local_model');
  const command = { entryKey: 'contradiction-rfi-0001', analysisIdentity: identity, sourceId: source.id, quote,
    category: 'contradiction', title: 'Scope sparing met offerte vergelijken',
    question: 'Vergelijk de goedgekeurde offerte met eerdere schriftelijke afspraken en rapporteer de exacte passages.',
    responsible: 'Werkvoorbereider', dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() };

  const result = chat.createRfiFromFinding(access.id, command, 'office_operator');
  const replay = chat.createRfiFromFinding(access.id, command, 'office_operator');

  assert.equal(result.rfi.id, replay.rfi.id);
  assert.equal(replay.replayed, true);
  assert.equal(result.rfi.status, 'open');
  assert.equal(result.rfi.responsible, 'Werkvoorbereider');
  assert.deepEqual(result.rfi.data.conversationOrigin, {
    evidenceKind: 'message_finding', accessId: access.id, messageId: source.id, messageSourceHash: source.sourceHash,
    quote, category: 'contradiction', suggestion, uncertainty, analysisIdentity: identity
  });
  assert.equal(ledger.verifyAuditIntegrity().valid, true);

  assert.throws(() => chat.createRfiFromFinding(access.id, {
    ...command, entryKey: 'information-rfi-0001', category: 'information'
  }, 'office_operator'), { statusCode: 400 });
});

test('approved source-linked RFI answers return to the originating conversation as unpublished drafts', t => {
  const { chat, access, job, ledger } = fixture(t);
  const source = chat.create(access.id, {
    entryKey: 'approved-rfi-source-01', body: 'Ik dacht dat de extra sparing al in de prijs zat.'
  }, { direction: 'inbound' });
  const identity = hash('approved-rfi-analysis');
  const quote = source.body;
  const suggestion = 'Vergelijk de offerte en eerdere klantcommunicatie op de opgenomen sparing.';
  const uncertainty = 'De vastgelegde scope en de klantverwachting zijn nog niet met elkaar vergeleken.';
  chat.record('conversation_analysis', access.id, job.id, 'retain_conversation_analysis', {
    identity, sourceHash: hash(chat.analysisSources(access.id)),
    findings: [{ sourceId: source.id, quote, category: 'contradiction', suggestion, uncertainty }]
  }, 'local_model');
  const rfi = ledger.createRfi(job.id, {
    title: 'Scope sparing vergelijken', status: 'open', question: 'Vergelijk offerte en communicatie.',
    responsible: 'Werkvoorbereider', dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    conversationOrigin: { evidenceKind: 'message_finding', accessId: access.id, messageId: source.id,
      messageSourceHash: source.sourceHash, quote, category: 'contradiction', suggestion, uncertainty, analysisIdentity: identity }
  }, { actor: 'office_operator' });

  assert.deepEqual(chat.approvedRfiResponses(access.id), []);
  const answer = 'De ondertekende offerte noemt de sparing niet; de eerdere e-mail vraagt alleen om een prijsindicatie.';
  const transition = ledger.transitionLifecycleRecord(job.id, 'rfi', rfi.id, {
    status: 'answered', response: answer, notes: answer, resolution: answer
  }, { actor: 'office_operator' });
  assert.equal(transition.approvalRequired, true);
  ledger.resolveApproval(transition.approval.id, { status: 'approved', resolvedBy: 'approver', reason: 'Source documents compared and response checked.' });
  const answeredRfi = ledger.db.prepare('SELECT * FROM rfi_records WHERE id = ?').get(rfi.id);
  const approvedRfi = ledger.mapRfi(answeredRfi);
  assert.equal(approvedRfi.status, 'answered');
  assert.equal(approvedRfi.response, answer);
  const available = chat.approvedRfiResponses(access.id);
  assert.equal(available.length, 1);
  assert.equal(available[0].id, rfi.id);
  assert.equal(available[0].response, answer);
  ledger.db.prepare('UPDATE rfi_records SET response = ? WHERE id = ?').run('Tampered after approval.', rfi.id);
  assert.deepEqual(chat.approvedRfiResponses(access.id), []);
  ledger.db.prepare('UPDATE rfi_records SET response = ? WHERE id = ?').run(answer, rfi.id);

  const created = chat.createReplyDraftFromRfi(access.id, rfi.id, 'office_operator');
  const replayed = chat.createReplyDraftFromRfi(access.id, rfi.id, 'office_operator');
  assert.equal(created.message.id, replayed.message.id);
  assert.equal(replayed.replayed, true);
  assert.equal(created.message.direction, 'outbound');
  assert.equal(created.message.status, 'draft');
  assert.equal(created.message.body, answer);
  assert.equal(created.message.replyTo, source.id);
  const retained = chat.message(access.id, created.message.id);
  assert.deepEqual(retained.basis.rfiResponseOrigin, {
    rfiId: rfi.id, approvalId: transition.approval.id, responseHash: hash(answer), analysisIdentity: identity,
    sourceMessageId: source.id, messageSourceHash: source.sourceHash
  });
  assert.equal(chat.list(access.id, { client: true }).messages.some(message => message.id === created.message.id), false);
  assert.throws(() => chat.publish(access.id, created.message.id, created.message.sourceHash, 'approver'), { statusCode: 409 });
  assert.equal(ledger.verifyAuditIntegrity().valid, true);

  chat.create(access.id, { entryKey: 'approved-rfi-new-customer-context', body: 'Ik heb nog een aanvullende vraag.' }, { direction: 'inbound' });
  assert.deepEqual(chat.approvedRfiResponses(access.id), []);
  assert.throws(() => chat.createReplyDraftFromRfi(access.id, rfi.id, 'office_operator'), { statusCode: 409 });
});

test('conversation requests prepare private client-choice drafts that publish only after a current-source approval', t => {
  const { chat, access, other, job, ledger } = fixture(t);
  function prepare(accessId, prefix, body) {
    const source = chat.create(accessId, { entryKey: `${prefix}-message-01`, body }, { direction: 'inbound' });
    const identity = hash(`${prefix}-analysis`);
    const sources = chat.analysisSources(accessId);
    const quote = body;
    chat.record('conversation_analysis', accessId, job.id, 'retain_conversation_analysis', {
      identity, sourceHash: hash(sources), sources, findings: [{ sourceId: source.id, quote, category: 'request',
        suggestion: 'Leg de klantkeuze met opties voor aan interne beoordeling.', uncertainty: 'De klantvraag bevat nog geen formeel vastgestelde opties.' }]
    }, 'local_model');
    return { source, identity, quote };
  }
  const first = prepare(access.id, 'selection-publish', 'Welke kleur wilt u voor de gevelsteen?');
  const command = { entryKey: 'conversation-selection-action-001', analysisIdentity: first.identity, sourceId: first.source.id,
    quote: first.quote, category: 'request', title: 'Kleur gevelsteen kiezen', options: ['Roodbruin', 'Antraciet'],
    dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), rationale: 'De uitvoerder heeft de definitieve kleur nodig voor bestelling.' };
  const proposed = chat.createSelectionFromFinding(access.id, command, 'office_operator');
  assert.equal(proposed.selection.status, 'pending_approval');
  assert.equal(proposed.selection.data.clientVisible, false);
  assert.equal(proposed.selection.data.publishAfterApproval, true);
  assert.equal(chat.createSelectionFromFinding(access.id, command, 'office_operator').selection.id, proposed.selection.id);
  assert.equal(ledger.getClientPortalSnapshot(access.portalToken).job.selections.some(item => item.id === proposed.selection.id), false);
  ledger.resolveApproval(proposed.selection.approvalId, { status: 'approved', resolvedBy: 'approver', reason: 'Question and customer-visible options reviewed.' });
  const published = ledger.mapClientSelection(ledger.db.prepare('SELECT * FROM client_selections WHERE id = ? AND job_id = ?').get(proposed.selection.id, job.id));
  assert.equal(published.status, 'pending_client');
  assert.equal(published.data.clientVisible, true);
  assert.equal(published.data.publishAfterApproval, false);
  assert.deepEqual(published.options, ['Roodbruin', 'Antraciet']);
  assert.equal(ledger.getClientPortalSnapshot(access.portalToken).job.selections.some(item => item.id === published.id), true);

  const rejectedSource = prepare(access.id, 'selection-rejected', 'Welke afwerking heeft uw voorkeur?');
  const rejected = chat.createSelectionFromFinding(access.id, { ...command, entryKey: 'conversation-selection-action-rejected',
    analysisIdentity: rejectedSource.identity, sourceId: rejectedSource.source.id, quote: rejectedSource.quote,
    title: 'Afwerking kiezen' }, 'office_operator').selection;
  ledger.resolveApproval(rejected.approvalId, { status: 'rejected', resolvedBy: 'approver', reason: 'Options need technical review.' });
  const rejectedRecord = ledger.mapClientSelection(ledger.db.prepare('SELECT * FROM client_selections WHERE id = ? AND job_id = ?').get(rejected.id, job.id));
  assert.equal(rejectedRecord.status, 'rejected');
  assert.equal(rejectedRecord.data.clientVisible, false);
  assert.equal(rejectedRecord.data.publishAfterApproval, false);
  assert.equal(ledger.getClientPortalSnapshot(access.portalToken).job.selections.some(item => item.id === rejected.id), false);

  const second = prepare(other.id, 'selection-stale', 'Wilt u de deur links of rechts laten draaien?');
  const stale = chat.createSelectionFromFinding(other.id, { ...command, entryKey: 'conversation-selection-action-002',
    analysisIdentity: second.identity, sourceId: second.source.id, quote: second.quote, title: 'Draairichting deur kiezen' }, 'office_operator').selection;
  chat.create(other.id, { entryKey: 'selection-stale-follow-up', body: 'Aanvulling: de deur mag niet naar de gang draaien.' }, { direction: 'inbound' });
  assert.throws(() => ledger.resolveApproval(stale.approvalId, { status: 'approved', resolvedBy: 'approver' }), { statusCode: 409 });
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(stale.approvalId).status, 'pending');
  assert.equal(ledger.getClientPortalSnapshot(other.portalToken).job.selections.some(item => item.id === stale.id), false);
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
});
