const { randomUUID } = require('node:crypto');
const { digest } = require('./work-context');
const { WorkDelivery } = require('./work-delivery');
const { InspectionCoverage } = require('./inspection-coverage');
const { ClientConversation } = require('./client-conversation');

const TABLES = ['client_delivery_offers', 'client_delivery_responses', 'client_delivery_commands'];
const COLUMNS = {
  client_delivery_offers: ['job_id', 'delivery_id', 'access_id', 'sequence_number', 'status', 'approval_id', 'snapshot_json', 'snapshot_hash', 'withdrawn_at', 'withdrawn_reason'],
  client_delivery_responses: ['job_id', 'offer_id', 'access_id', 'entry_key', 'request_hash', 'decision_id', 'document_id', 'message_id', 'snapshot_json', 'snapshot_hash'],
  client_delivery_commands: ['job_id', 'request_hash', 'response_json']
};
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode, code: 'client_delivery_invalid' }); };
function text(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(char => char.charCodeAt(0) < 32 && !'\t\n\r'.includes(char))) fail(`${label} ontbreekt of is ongeldig.`);
  return value.trim();
}
function ids(value) {
  if (!Array.isArray(value) || value.length > 10) fail('Kies maximaal tien gespreksfoto\'s.');
  const selected = value.map(id => text(id, 'Gespreksfoto', 150)).sort();
  if (new Set(selected).size !== selected.length) fail('Dubbele gespreksfoto\'s zijn niet toegestaan.');
  return selected;
}
function retained(row) {
  const snapshot = JSON.parse(row.snapshot_json);
  if (digest(snapshot) !== row.snapshot_hash) fail('Het klantaanbod of de reactie heeft een ongeldige controlesom.', 409);
  return snapshot;
}
function approvalMatches(row, approval) {
  if (!approval || approval.target_type !== 'client_delivery_offer' || approval.target_id !== row.id || approval.job_id !== row.job_id
    || approval.status !== (row.status === 'withdrawn' ? 'approved' : row.status)) return false;
  const snapshot = retained(row), data = JSON.parse(approval.data_json || '{}');
  return digest(Object.fromEntries(Object.keys(snapshot).map(key => [key, data[key]]))) === row.snapshot_hash;
}
function migrateClientDelivery(db) {
  db.exec(`
    CREATE TABLE client_delivery_offers (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), delivery_id TEXT NOT NULL REFERENCES work_deliveries(id),
      access_id TEXT NOT NULL REFERENCES client_portal_access(id), sequence_number INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','cancelled','withdrawn')),
      approval_id TEXT NOT NULL REFERENCES approvals(id), snapshot_json TEXT NOT NULL, snapshot_hash TEXT NOT NULL,
      created_at TEXT NOT NULL, resolved_at TEXT, withdrawn_at TEXT, withdrawn_reason TEXT,
      UNIQUE(delivery_id,sequence_number)
    );
    CREATE UNIQUE INDEX idx_client_delivery_offer_active ON client_delivery_offers(delivery_id) WHERE status IN ('pending','approved');
    CREATE INDEX idx_client_delivery_offer_access ON client_delivery_offers(access_id,created_at);
    CREATE TABLE client_delivery_responses (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), offer_id TEXT NOT NULL UNIQUE REFERENCES client_delivery_offers(id),
      access_id TEXT NOT NULL REFERENCES client_portal_access(id), entry_key TEXT NOT NULL, request_hash TEXT NOT NULL,
      decision_id TEXT NOT NULL UNIQUE REFERENCES work_delivery_decisions(id), document_id TEXT NOT NULL REFERENCES documents(id),
      message_id TEXT NOT NULL REFERENCES communication_records(id), snapshot_json TEXT NOT NULL, snapshot_hash TEXT NOT NULL,
      created_at TEXT NOT NULL, UNIQUE(access_id,entry_key)
    );
    CREATE INDEX idx_client_delivery_response_job ON client_delivery_responses(job_id);
    CREATE TABLE client_delivery_commands (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  require('./company-authority').installAuthorityGuards(db, TABLES);
}

class ClientDelivery {
  constructor(ledger) {
    this.ledger = ledger; this.db = ledger.db; this.delivery = new WorkDelivery(ledger);
    this.coverage = new InspectionCoverage(ledger); this.chat = new ClientConversation(ledger);
  }
  now() { return this.ledger.clock().toISOString(); }
  lock(jobId) {
    this.coverage.lock(jobId);
    for (const table of ['client_portal_access', 'communication_records']) this.db.prepare(`UPDATE ${table} SET status = status WHERE job_id = ?`).run(jobId);
  }
  row(jobId, id) {
    const row = this.db.prepare('SELECT * FROM client_delivery_offers WHERE id = ? AND job_id = ?').get(id, jobId);
    if (!row) fail('Klantaanbod niet gevonden.', 404);
    return row;
  }
  access(accessId, jobId) {
    const access = this.chat.access(accessId);
    if (access.jobId !== jobId) fail('De klanttoegang hoort niet bij deze opdracht.', 403);
    const row = this.db.prepare('SELECT * FROM client_portal_access WHERE id = ?').get(accessId);
    const approval = row.approval_id && this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(row.approval_id);
    if (!approval || approval.status !== 'approved' || approval.target_type !== 'client_portal_access' || approval.target_id !== row.id || approval.job_id !== jobId) fail('Klanttoegang is niet goedgekeurd.', 403);
    return { id: access.id, clientId: access.clientId, expiresAt: row.expires_at };
  }
  photos(accessId, selected) {
    return selected.map(id => {
      const message = this.chat.message(accessId, id, { client: true });
      const { document, sha256 } = this.chat.attachment(accessId, id, { client: true });
      if (!['stored', 'approved', 'current'].includes(document.status)) fail('Een gespreksfoto is niet meer beschikbaar.', 409);
      return { id, sourceHash: message.sourceHash, sha256, filename: message.attachment.filename };
    });
  }
  basis(jobId, deliveryId, accessId, photoIds) {
    const access = this.access(accessId, jobId), delivery = this.delivery.row(jobId, deliveryId);
    const physical = this.coverage.physical(jobId, deliveryId);
    const detail = this.delivery.describe(delivery);
    return { access, physical, revision: Number(delivery.revision), inspection: detail.inspection,
      coverage: detail.inspectionCoverage, photos: this.photos(accessId, photoIds) };
  }
  current(row) {
    const snapshot = retained(row);
    if (!approvalMatches(row, this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(row.approval_id))) return false;
    try { return digest(this.basis(row.job_id, row.delivery_id, row.access_id, snapshot.photoIds)) === snapshot.basisHash; }
    catch (error) { if (![400, 403, 404, 409].includes(error.statusCode)) throw error; return false; }
  }
  state(row) {
    if (row.status !== 'approved') return row.status;
    if (Date.parse(retained(row).expiresAt) <= Date.parse(this.now())) return 'expired';
    return this.current(row) ? 'available' : 'source_changed';
  }
  response(row, client = false) {
    if (!row) return null;
    const snapshot = retained(row), decision = this.db.prepare('SELECT * FROM work_delivery_decisions WHERE id = ?').get(row.decision_id);
    return { id: row.id, outcome: snapshot.outcome, respondent: snapshot.respondent, note: snapshot.note,
      status: decision.status === 'approved' ? 'recorded' : decision.status === 'pending' ? 'pending_review' : `review_${decision.status}`,
      submittedAt: row.created_at, reviewedAt: decision.resolved_at, photos: snapshot.photos,
      ...(!client ? { decisionId: row.decision_id, approvalId: decision.approval_id, messageId: row.message_id } : {}) };
  }
  describe(row, client = false) {
    const snapshot = retained(row), response = this.db.prepare('SELECT * FROM client_delivery_responses WHERE offer_id = ?').get(row.id);
    const state = this.state(row);
    const result = { id: row.id, version: Number(row.sequence_number), sourceHash: row.snapshot_hash, state,
      ...snapshot.public, expiresAt: snapshot.expiresAt, responseAllowed: state === 'available' && !response,
      response: this.response(response, client), createdAt: row.created_at };
    return client ? result : { ...result, deliveryId: row.delivery_id, accessId: row.access_id, approvalId: row.approval_id,
      recipientName: snapshot.recipientName, authorityReference: snapshot.authorityReference, reason: snapshot.reason,
      photoIds: snapshot.photoIds, sourceCurrent: this.current(row), withdrawnReason: row.withdrawn_reason };
  }
  read(jobId) {
    this.ledger.requireJob(jobId, { allowInactive: true });
    const offers = this.db.prepare('SELECT * FROM client_delivery_offers WHERE job_id = ? ORDER BY created_at,id').all(jobId).map(row => this.describe(row));
    const deliveries = this.delivery.source(jobId).map(row => ({ id: row.id, title: row.title, scope: row.scope, status: row.status,
      current: row.physical.current, pending: row.response.pending, coverage: row.inspectionCoverage.status }));
    const accesses = this.db.prepare("SELECT id,data_json,expires_at FROM client_portal_access WHERE job_id = ? AND status = 'active' ORDER BY id").all(jobId)
      .filter(row => { try { this.access(row.id, jobId); return true; } catch (error) { if (![400, 403, 404, 409].includes(error.statusCode)) throw error; return false; } })
      .map(row => ({ id: row.id, label: JSON.parse(row.data_json).label, expiresAt: row.expires_at }));
    return { format: 'contractor-client-delivery/v1', jobId, offers, options: { deliveries, accesses }, sourceHash: digest({ offers, deliveries, accesses }) };
  }
  portal(accessId) {
    const access = this.chat.access(accessId); this.access(accessId, access.jobId);
    return { offers: this.db.prepare("SELECT * FROM client_delivery_offers WHERE access_id = ? AND job_id = ? AND status IN ('approved','withdrawn') ORDER BY created_at,id").all(accessId, access.jobId)
      .map(row => this.describe(row, true)) };
  }
  command(jobId, input, actor) {
    if (!input || !['offer', 'withdraw'].includes(input.action) || !input.record || Array.isArray(input.record)) fail('Ongeldige klantaanbodactie.');
    const entryKey = text(input.entryKey, 'Wijzigingssleutel', 150), requestHash = digest(input), id = digest({ jobId, entryKey });
    return this.ledger.transaction(() => {
      this.lock(jobId); this.ledger.requireJob(jobId);
      const old = this.db.prepare('SELECT * FROM client_delivery_commands WHERE id = ?').get(id);
      if (old) { if (old.request_hash !== requestHash) fail('Deze wijzigingssleutel hoort bij andere gegevens.', 409); return { ...JSON.parse(old.response_json), replayed: true }; }
      if (this.read(jobId).sourceHash !== input.sourceHash) fail('Het dossier is gewijzigd. Ververs en beoordeel opnieuw.', 409);
      const record = input.record;
      let result;
      if (input.action === 'withdraw') {
        const row = this.row(jobId, text(record.id, 'Klantaanbod', 150));
        const reason = text(record.reason, 'Reden intrekken', 2000);
        if (!['pending', 'approved'].includes(row.status)) fail('Dit aanbod is niet meer actief.', 409);
        if (row.status === 'pending') this.ledger.resolveApproval(row.approval_id, { status: 'cancelled', reason }, { actor });
        else this.db.prepare("UPDATE client_delivery_offers SET status = 'withdrawn', withdrawn_at = ?, withdrawn_reason = ? WHERE id = ?").run(this.now(), reason, row.id);
        this.ledger.audit({ entityType: 'client_delivery_offer', entityId: row.id, jobId, action: 'withdraw_client_delivery_offer', actor, after: { reason } });
        result = { offerId: row.id };
      } else {
        const deliveryId = text(record.deliveryId, 'Deeloplevering', 150), accessId = text(record.accessId, 'Klanttoegang', 150);
        if (record.scopeConfirmed !== true) fail('Bevestig dat de klantbeschrijving uitsluitend dit uitgevoerde deel betreft.');
        if (this.db.prepare("SELECT id FROM client_delivery_offers WHERE delivery_id = ? AND status IN ('pending','approved')").get(deliveryId)
          || this.db.prepare("SELECT id FROM work_delivery_decisions WHERE delivery_id = ? AND status = 'pending'").get(deliveryId)) fail('Trek eerst het eerdere aanbod in en behandel openstaande deelopleveringsbeoordelingen.', 409);
        const photoIds = ids(record.photoIds), basis = this.basis(jobId, deliveryId, accessId, photoIds);
        const expiresAt = text(record.expiresAt, 'Uiterste reactiemoment', 30), expiry = Date.parse(expiresAt);
        if (!Number.isFinite(expiry) || expiry <= Date.parse(this.now()) || expiry > Date.parse(basis.access.expiresAt)) fail('De reactietermijn moet in de toekomst liggen en binnen de klanttoegang vallen.');
        const delivery = this.delivery.describe(this.delivery.row(jobId, deliveryId));
        const offerId = randomUUID(), previous = this.db.prepare('SELECT MAX(sequence_number) AS last FROM client_delivery_offers WHERE delivery_id = ?').get(deliveryId);
        const version = Number(previous.last || 0) + 1;
        const snapshot = { format: 'contractor-client-delivery-offer/v1', id: offerId, version, jobId, deliveryId, accessId, clientId: basis.access.clientId,
          recipientName: text(record.recipientName, 'Beoogde ontvanger'), authorityReference: text(record.authorityReference, 'Te controleren bevoegdheidsgrond', 2000),
          reason: text(record.reason, 'Onderbouwing', 2000), scopeConfirmed: true, photoIds, expiresAt: new Date(expiry).toISOString(), basisHash: digest(basis),
          public: { title: text(record.title, 'Titel voor klant'), scope: text(record.scope, 'Beschrijving voor klant', 4000),
            quantities: delivery.physical.entries.map(row => ({ description: row.description, quantity: row.quantity, unit: row.unit })),
            tasks: delivery.physical.tasks.map(row => ({ title: row.title })), coverageStatus: basis.coverage.status, photos: basis.photos } };
        const approval = this.ledger.createApproval({ targetType: 'client_delivery_offer', targetId: offerId, jobId, approvalType: 'client_delivery_publication',
          summary: `Deeloplevering voor klant publiceren: ${snapshot.public.title}`, reason: snapshot.reason, data: snapshot }, { actor });
        this.db.prepare("INSERT INTO client_delivery_offers (id,job_id,delivery_id,access_id,sequence_number,status,approval_id,snapshot_json,snapshot_hash,created_at) VALUES (?,?,?,?,?,'pending',?,?,?,?)")
          .run(offerId, jobId, deliveryId, accessId, version, approval.id, JSON.stringify(snapshot), digest(snapshot), this.now());
        this.ledger.audit({ entityType: 'client_delivery_offer', entityId: offerId, jobId, action: 'request_client_delivery_publication', actor, after: { approvalId: approval.id, deliveryId, accessId } });
        result = { offerId, approvalId: approval.id };
      }
      const response = { ...result, replayed: false, externalCommitments: 0 };
      this.db.prepare('INSERT INTO client_delivery_commands (id,job_id,request_hash,response_json,created_at) VALUES (?,?,?,?,?)').run(id, jobId, requestHash, JSON.stringify(response), this.now());
      return response;
    });
  }
  prepareResolution(approval, status) {
    this.lock(approval.job_id);
    const row = this.row(approval.job_id, approval.target_id);
    if (row.status !== 'pending' || row.approval_id !== approval.id) fail('Dit klantaanbod is niet meer openstaand.', 409);
    if (status === 'approved' && (!this.current(row) || Date.parse(retained(row).expiresAt) <= Date.parse(this.now()))) fail('Scope, bewijs of klanttoegang is gewijzigd of verlopen.', 409);
  }
  resolve(approval, status) {
    const row = this.row(approval.job_id, approval.target_id);
    if (row.status !== 'pending' || row.approval_id !== approval.id || !['approved', 'rejected', 'cancelled'].includes(status)) fail('Dit klantaanbod is niet meer openstaand.', 409);
    this.db.prepare('UPDATE client_delivery_offers SET status = ?, resolved_at = ? WHERE id = ?').run(status, this.now(), approval.target_id);
    this.ledger.audit({ entityType: 'client_delivery_offer', entityId: approval.target_id, jobId: approval.job_id,
      action: `client_delivery_publication_${status}`, actor: approval.resolved_by, after: { status, channel: 'scoped_client_portal', messageSent: false } });
  }
  submit(accessId, offerId, input) {
    const access = this.chat.access(accessId), entryKey = text(input?.entryKey, 'Reactiesleutel', 150);
    const requestHash = digest({ offerId, input });
    return this.ledger.transaction(() => {
      this.lock(access.jobId); this.access(accessId, access.jobId);
      const row = this.row(access.jobId, offerId);
      if (row.access_id !== accessId) fail('Dit klantaanbod is niet beschikbaar.', 404);
      const old = this.db.prepare('SELECT * FROM client_delivery_responses WHERE access_id = ? AND entry_key = ?').get(accessId, entryKey);
      if (old) { if (old.request_hash !== requestHash) fail('Deze reactiesleutel hoort bij andere gegevens.', 409); return { response: this.response(old, true), replayed: true }; }
      if (row.snapshot_hash !== input.sourceHash || this.state(row) !== 'available' || this.db.prepare('SELECT id FROM client_delivery_responses WHERE offer_id = ?').get(row.id)) fail('Het aanbod is gewijzigd, gesloten of al beantwoord. Ververs de projectinzage.', 409);
      if (this.db.prepare("SELECT id FROM work_delivery_decisions WHERE delivery_id = ? AND status = 'pending'").get(row.delivery_id)) fail('Deze deeloplevering heeft een openstaande beoordeling.', 409);
      if (!['accepted', 'accepted_with_reservations', 'disputed'].includes(input.outcome) || input.authorityConfirmed !== true) fail('Kies een reactie en bevestig namens wie u reageert.');
      const respondent = text(input.respondent, 'Naam'), note = text(input.note, 'Toelichting', 2000), photoIds = ids(input.photoIds);
      const photos = this.photos(accessId, photoIds), offer = retained(row), responseId = randomUUID(), now = this.now();
      const labels = { accepted: 'Akkoord', accepted_with_reservations: 'Akkoord met voorbehoud', disputed: 'Bezwaar' };
      const message = this.chat.create(accessId, { entryKey: `delivery-response-${responseId}`, body: `Reactie op deeloplevering ${offer.public.title} (versie ${row.sequence_number}): ${labels[input.outcome]}.\n${respondent}: ${note}` }, { actor: `client_portal:${accessId}` });
      const document = this.ledger.addDocument(access.jobId, { type: 'acceptance_evidence', title: `Klantreactie: ${offer.public.title}`,
        data: { reference: `client-delivery-response:${responseId}`, clientDeliveryResponseId: responseId, clientVisible: false, private: true } }, { actor: `client_portal:${accessId}` });
      const decision = this.delivery.request(this.delivery.row(access.jobId, row.delivery_id), 'request_response', { outcome: input.outcome, respondent,
        respondedAt: now.slice(0, 10), evidenceDocumentId: document.id, reason: note,
        authorityReference: `Te controleren: ${offer.recipientName}. ${offer.authorityReference}`.slice(0, 1000) }, `client_portal:${accessId}`);
      const snapshot = { format: 'contractor-client-delivery-response/v1', jobId: access.jobId, offerId, accessId,
        offerHash: row.snapshot_hash, outcome: input.outcome, respondent, authorityConfirmed: true, note, photoIds, photos,
        documentId: document.id, decisionId: decision.decisionId, messageId: message.id, messageHash: message.sourceHash, submittedAt: now };
      this.db.prepare('INSERT INTO client_delivery_responses (id,job_id,offer_id,access_id,entry_key,request_hash,decision_id,document_id,message_id,snapshot_json,snapshot_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(responseId, access.jobId, offerId, accessId, entryKey, requestHash, decision.decisionId, document.id, message.id, JSON.stringify(snapshot), digest(snapshot), now);
      this.ledger.audit({ entityType: 'client_delivery_response', entityId: responseId, jobId: access.jobId, action: 'receive_client_delivery_response', actor: `client_portal:${accessId}`, after: { offerId, decisionId: decision.decisionId, messageId: message.id } });
      return { response: this.response(this.db.prepare('SELECT * FROM client_delivery_responses WHERE id = ?').get(responseId), true), replayed: false };
    });
  }
  validateResponseDecision(decisionId, payload) {
    const row = this.db.prepare('SELECT * FROM client_delivery_responses WHERE decision_id = ?').get(decisionId);
    if (!row) return;
    this.lock(row.job_id);
    verifyResponse(this.db, row);
    const snapshot = retained(row), offer = this.row(row.job_id, row.offer_id);
    if (this.state(offer) !== 'available' || offer.snapshot_hash !== snapshot.offerHash || digest(this.photos(row.access_id, snapshot.photoIds)) !== digest(snapshot.photos)) fail('Het klantaanbod, de toegang of het reactiebewijs is niet meer actueel.', 409);
    if (!payload.reason || String(payload.reason).trim().length < 5) fail('Leg vast hoe de klantreactie en bevoegdheid zijn gecontroleerd.');
  }
  exportRecords() { return Object.fromEntries(TABLES.map(table => [table, this.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map(row => ({ ...row }))])); }
}

function verifyClientDelivery(db) {
  for (const row of db.prepare('SELECT * FROM client_delivery_offers').all()) {
    const snapshot = retained(row), access = db.prepare('SELECT job_id FROM client_portal_access WHERE id = ?').get(row.access_id);
    if (snapshot.format !== 'contractor-client-delivery-offer/v1' || snapshot.id !== row.id || snapshot.version !== Number(row.sequence_number) || snapshot.scopeConfirmed !== true
      || snapshot.jobId !== row.job_id || snapshot.deliveryId !== row.delivery_id || snapshot.accessId !== row.access_id || access?.job_id !== row.job_id
      || db.prepare('SELECT job_id FROM work_deliveries WHERE id = ?').get(row.delivery_id)?.job_id !== row.job_id
      || !approvalMatches(row, db.prepare('SELECT * FROM approvals WHERE id = ?').get(row.approval_id))) fail('Klantaanbod mist een geldige dossier- of beoordelingsketen.', 409);
  }
  for (const row of db.prepare('SELECT * FROM client_delivery_responses').all()) verifyResponse(db, row);
  return true;
}
function verifyResponse(db, row) {
    const snapshot = retained(row), offer = db.prepare('SELECT * FROM client_delivery_offers WHERE id = ?').get(row.offer_id);
    const decision = db.prepare('SELECT * FROM work_delivery_decisions WHERE id = ?').get(row.decision_id);
    const document = db.prepare('SELECT * FROM documents WHERE id = ?').get(row.document_id);
    const message = db.prepare('SELECT * FROM communication_records WHERE id = ?').get(row.message_id);
    if (snapshot.format !== 'contractor-client-delivery-response/v1' || snapshot.authorityConfirmed !== true || snapshot.submittedAt !== row.created_at
      || !offer || offer.job_id !== row.job_id || offer.access_id !== row.access_id || snapshot.offerHash !== offer.snapshot_hash
      || snapshot.jobId !== row.job_id || snapshot.accessId !== row.access_id || snapshot.offerId !== row.offer_id
      || snapshot.decisionId !== row.decision_id || snapshot.documentId !== row.document_id || snapshot.messageId !== row.message_id
      || decision?.job_id !== row.job_id || decision.delivery_id !== offer.delivery_id || decision.kind !== 'response'
      || document?.job_id !== row.job_id || document.type !== 'acceptance_evidence' || JSON.parse(document.data_json).clientDeliveryResponseId !== row.id
      || message?.job_id !== row.job_id || message.channel !== `chat:${row.access_id}` || message.direction !== 'inbound') fail('Klantreactie mist een geldige bron- of dossierkoppeling.', 409);
    const recorded = retained(decision);
    const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(decision.approval_id);
    const data = approval && JSON.parse(approval.data_json);
    if (recorded.outcome !== snapshot.outcome || recorded.respondent !== snapshot.respondent || recorded.reason !== snapshot.note || recorded.evidenceDocumentId !== row.document_id
      || !approval || approval.target_type !== 'work_delivery_decision' || approval.target_id !== row.decision_id || approval.job_id !== row.job_id || approval.status !== decision.status
      || digest(Object.fromEntries(Object.keys(recorded).map(key => [key, data[key]]))) !== decision.snapshot_hash) fail('Klantreactie verschilt van de ter beoordeling bewaarde reactie.', 409);
    const event = db.prepare("SELECT after_json FROM audit_events WHERE entity_type = 'conversation_source' AND entity_id = ? ORDER BY sequence_number DESC LIMIT 1").get(row.message_id);
    const source = event && JSON.parse(event.after_json);
    if (!source || source.id !== row.message_id || source.accessId !== row.access_id || source.jobId !== row.job_id || source.direction !== 'inbound'
      || source.body !== message.body || source.basis?.body !== message.body || source.basis?.accessId !== row.access_id || source.basis?.direction !== 'inbound'
      || source.sourceHash !== snapshot.messageHash || require('./client-conversation').hash(source.basis) !== snapshot.messageHash) fail('Klantreactie mist het ongewijzigde gespreksbericht.', 409);
}
// Historical proof does not depend on a portal link remaining active after review.
function responseEvidenceCurrent(db, decisionId) {
  const row = db.prepare('SELECT * FROM client_delivery_responses WHERE decision_id = ?').get(decisionId);
  if (!row) return true;
  try {
    verifyResponse(db, row);
    const snapshot = retained(row), offer = retained(db.prepare('SELECT * FROM client_delivery_offers WHERE id = ?').get(row.offer_id));
    for (const photo of [...snapshot.photos, ...offer.public.photos]) {
      const event = db.prepare("SELECT after_json FROM audit_events WHERE entity_type = 'conversation_source' AND entity_id = ? ORDER BY sequence_number DESC LIMIT 1").get(photo.id);
      const source = event && JSON.parse(event.after_json);
      if (!source || source.accessId !== row.access_id || source.sourceHash !== photo.sourceHash || require('./client-conversation').hash(source.basis) !== photo.sourceHash || source.attachment?.sha256 !== photo.sha256) return false;
      const document = db.prepare('SELECT * FROM documents WHERE id = ? AND job_id = ?').get(source.attachment.documentId, row.job_id);
      if (!document || !['stored', 'approved', 'current'].includes(document.status) || JSON.parse(document.data_json).contentHash !== photo.sha256) return false;
    }
    return true;
  } catch (error) { if (error.statusCode !== 409 && !(error instanceof SyntaxError)) throw error; return false; }
}
module.exports = { ClientDelivery, migrateClientDelivery, verifyClientDelivery, responseEvidenceCurrent, TABLES, COLUMNS };
