const crypto = require('node:crypto');
const { digest } = require('./work-context');

const TABLES = ['client_completion_reviews'];
const COLUMNS = {
  client_completion_reviews: ['job_id', 'portal_access_id', 'package_document_id', 'package_hash', 'source_hash', 'entry_key', 'request_hash', 'outcome', 'respondent_name', 'authority_confirmed', 'note', 'status', 'submitted_at']
};

function migrateClientCompletionReview(db) {
  db.exec(`
    CREATE TABLE client_completion_reviews (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      portal_access_id TEXT NOT NULL REFERENCES client_portal_access(id) ON DELETE RESTRICT,
      package_document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
      package_hash TEXT NOT NULL,
      source_hash TEXT NOT NULL,
      entry_key TEXT NOT NULL,
      request_hash TEXT NOT NULL,
      outcome TEXT NOT NULL CHECK(outcome IN ('accepted','accepted_with_items','not_accepted')),
      respondent_name TEXT NOT NULL,
      authority_confirmed INTEGER NOT NULL CHECK(authority_confirmed IN (0,1)),
      note TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'received_unreviewed' CHECK(status IN ('received_unreviewed','reviewed_follow_up','reviewed_not_accepted')),
      submitted_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      UNIQUE(portal_access_id,package_hash),
      UNIQUE(portal_access_id,entry_key)
    );
    CREATE INDEX idx_client_completion_reviews_job ON client_completion_reviews(job_id,submitted_at DESC);
  `);
  require('./company-authority').installAuthorityGuards(db, TABLES);
}

function migrateClientCompletionReviewActions(db) {
  db.exec(`
    CREATE TABLE client_completion_review_actions (
      id TEXT PRIMARY KEY,
      completion_review_id TEXT NOT NULL REFERENCES client_completion_reviews(id) ON DELETE RESTRICT,
      entry_key TEXT NOT NULL UNIQUE,
      request_hash TEXT NOT NULL,
      disposition TEXT NOT NULL CHECK(disposition IN ('follow_up_required','no_follow_up_recorded','escalate_not_accepted')),
      note TEXT NOT NULL,
      source_current INTEGER NOT NULL CHECK(source_current IN (0,1)),
      actor TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX idx_client_completion_review_actions_response
      ON client_completion_review_actions(completion_review_id,created_at,id);
  `);
  require('./company-authority').installAuthorityGuards(db, ['client_completion_review_actions']);
}

function requiredText(value, label, min, max) {
  if (typeof value !== 'string') throw Object.assign(new Error(`${label} ontbreekt of is ongeldig.`), { statusCode: 400, code: 'client_completion_review_invalid' });
  const result = value.trim();
  if (result.length < min || result.length > max || [...result].some(char => char.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(char))) {
    throw Object.assign(new Error(`${label} moet ${min}-${max} tekens bevatten.`), { statusCode: 400, code: 'client_completion_review_invalid' });
  }
  return result;
}

class ClientCompletionReview {
  constructor(ledger) { this.ledger = ledger; this.db = ledger.db; }
  access(accessId, jobId) {
    const row = this.db.prepare(`SELECT * FROM client_portal_access WHERE id = ? AND job_id = ? AND status = 'active'`).get(accessId, jobId);
    const approval = row?.approval_id ? this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(row.approval_id) : null;
    if (!row || Date.parse(row.expires_at) <= Date.now() || approval?.status !== 'approved'
      || approval.target_type !== 'client_portal_access' || approval.target_id !== row.id || approval.job_id !== jobId) {
      throw Object.assign(new Error('De goedgekeurde klanttoegang is niet meer actief.'), { statusCode: 403, code: 'client_portal_access_required' });
    }
    return row;
  }
  basis(jobId, accessId) {
    this.ledger.requireJob(jobId, { allowInactive: true });
    const access = this.access(accessId, jobId);
    const detail = this.ledger.getJobDetail(jobId, { includeAudit: false });
    const readiness = this.ledger.assessHandoverReadiness(jobId, { detail });
    if (!readiness.ready || !readiness.currentPackageId) throw Object.assign(new Error('Er is nog geen actueel, gereed handover-dossier beschikbaar voor klantbeoordeling.'), { statusCode: 409, code: 'client_completion_package_unavailable', details: readiness });
    const packageDocument = detail.documents.find(item => item.id === readiness.currentPackageId && item.type === 'handover_issue_package');
    if (!packageDocument?.data?.packageHash || !packageDocument.data?.issueReference) throw Object.assign(new Error('Het actuele handover-dossier ontbreekt of is onvolledig.'), { statusCode: 409, code: 'client_completion_package_unavailable' });
    const packageContent = this.ledger.getHandoverIssuePackage(packageDocument.id, { audit: false });
    if (packageContent.packageHash !== packageDocument.data.packageHash) throw Object.assign(new Error('Het handover-dossier is gewijzigd. Vernieuw en controleer opnieuw.'), { statusCode: 409, code: 'client_completion_package_changed' });
    const delivery = detail.communications.find(item => item.data?.source === 'handover_issue_package'
      && item.data?.packageHash === packageDocument.data.packageHash
      && item.data?.attachmentDocumentIds?.includes(packageDocument.id)
      && item.status === 'sent');
    if (!delivery) throw Object.assign(new Error('Het dossier moet eerst via een gecontroleerde bezorging aan de klant zijn verstrekt.'), { statusCode: 409, code: 'client_completion_package_not_delivered' });
    const sourceHash = digest({ jobId, accessId, packageDocumentId: packageDocument.id,
      packageHash: packageContent.packageHash, evidenceHash: readiness.evidenceHash, deliveryId: delivery.id });
    return { access, detail, readiness, packageDocument, packageContent, delivery, sourceHash };
  }
  publicResponse(row) {
    return { id: row.id, outcome: row.outcome, respondentName: row.respondent_name,
      authorityConfirmed: Boolean(row.authority_confirmed), note: row.note, status: row.status,
      submittedAt: row.submitted_at, packageReference: (() => {
        const document = this.db.prepare('SELECT data_json FROM documents WHERE id = ?').get(row.package_document_id);
        return document ? JSON.parse(document.data_json || '{}').issueReference || null : null;
      })() };
  }
  reviewActions(reviewId) {
    return this.db.prepare(`SELECT id,completion_review_id AS completionReviewId,entry_key AS entryKey,
      disposition,note,source_current AS sourceCurrent,actor,created_at AS createdAt
      FROM client_completion_review_actions WHERE completion_review_id = ? ORDER BY created_at,id`).all(reviewId)
      .map(action => ({ ...action, sourceCurrent: action.sourceCurrent === true || Number(action.sourceCurrent) === 1 }));
  }
  portal(portalToken) {
    const snapshot = this.ledger.getClientPortalSnapshot(portalToken), jobId = snapshot.job.id, accessId = snapshot.portal.accessId;
    try {
      const basis = this.basis(jobId, accessId);
      const prior = this.db.prepare('SELECT * FROM client_completion_reviews WHERE portal_access_id = ? AND package_hash = ?').get(accessId, basis.packageContent.packageHash);
      return { available: true, sourceHash: basis.sourceHash,
        package: { id: basis.packageDocument.id, issueReference: basis.packageDocument.data.issueReference,
          preparedAt: basis.packageDocument.data.snapshot?.preparedAt || basis.packageDocument.createdAt,
          packageHash: basis.packageContent.packageHash },
        response: prior ? this.publicResponse(prior) : null, responseAllowed: !prior, sourceCurrent: true };
    } catch (error) {
      if (![403, 404, 409].includes(error.statusCode)) throw error;
      const prior = this.db.prepare(`SELECT * FROM client_completion_reviews WHERE portal_access_id = ? ORDER BY submitted_at DESC LIMIT 1`).get(accessId);
      return { available: false, sourceHash: null, package: null, response: prior ? this.publicResponse(prior) : null,
        responseAllowed: false, sourceCurrent: false };
    }
  }
  submit(portalToken, payload = {}) {
    const snapshot = this.ledger.getClientPortalSnapshot(portalToken), jobId = snapshot.job.id, accessId = snapshot.portal.accessId;
    return this.ledger.transaction(() => {
      const basis = this.basis(jobId, accessId);
      const sourceHash = requiredText(payload.sourceHash, 'Bronversie', 64, 64);
      if (sourceHash !== basis.sourceHash) throw Object.assign(new Error('Het opleverdossier is gewijzigd. Vernieuw en beoordeel de actuele versie.'), { statusCode: 409, code: 'client_completion_source_changed' });
      const entryKey = requiredText(payload.entryKey, 'Reactiesleutel', 8, 200);
      const outcome = payload.outcome;
      if (!['accepted', 'accepted_with_items', 'not_accepted'].includes(outcome)) throw Object.assign(new Error('Kies een geldige opleverreactie.'), { statusCode: 400, code: 'client_completion_outcome_invalid' });
      const respondentName = requiredText(payload.respondentName, 'Naam', 2, 160);
      const authorityConfirmed = payload.authorityConfirmed === true;
      if (outcome !== 'not_accepted' && !authorityConfirmed) throw Object.assign(new Error('Bevestig dat je bevoegd bent om namens de opdrachtgever te reageren.'), { statusCode: 400, code: 'client_completion_authority_required' });
      const note = outcome === 'accepted' ? String(payload.note || '').trim() : requiredText(payload.note, 'Toelichting of restpunten', 5, 2000);
      if (note.length > 2000) throw Object.assign(new Error('De toelichting mag maximaal 2.000 tekens bevatten.'), { statusCode: 400, code: 'client_completion_note_invalid' });
      const request = { jobId, accessId, packageDocumentId: basis.packageDocument.id, packageHash: basis.packageContent.packageHash,
        sourceHash, outcome, respondentName, authorityConfirmed, note };
      const requestHash = digest(request);
      const replay = this.db.prepare('SELECT * FROM client_completion_reviews WHERE portal_access_id = ? AND entry_key = ?').get(accessId, entryKey);
      if (replay) {
        if (replay.request_hash !== requestHash) throw Object.assign(new Error('Deze reactiesleutel is al voor een andere reactie gebruikt.'), { statusCode: 409, code: 'client_completion_replay_conflict' });
        return { response: this.publicResponse(replay), replayed: true, externalCommitments: 0 };
      }
      const existing = this.db.prepare('SELECT id FROM client_completion_reviews WHERE portal_access_id = ? AND package_hash = ?').get(accessId, basis.packageContent.packageHash);
      if (existing) throw Object.assign(new Error('Je reactie op deze dossier-versie is al ontvangen.'), { statusCode: 409, code: 'client_completion_already_submitted' });
      const id = `client_completion_${crypto.createHash('sha256').update(`${accessId}\0${entryKey}`).digest('hex').slice(0, 28)}`;
      const submittedAt = this.ledger.clock().toISOString();
      this.db.prepare(`INSERT INTO client_completion_reviews
        (id,job_id,portal_access_id,package_document_id,package_hash,source_hash,entry_key,request_hash,outcome,respondent_name,authority_confirmed,note,status,submitted_at,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?, 'received_unreviewed',?,?)`)
        .run(id, jobId, accessId, basis.packageDocument.id, basis.packageContent.packageHash, sourceHash, entryKey, requestHash,
          outcome, respondentName, authorityConfirmed ? 1 : 0, note, submittedAt, submittedAt);
      const row = this.db.prepare('SELECT * FROM client_completion_reviews WHERE id = ?').get(id), response = this.publicResponse(row);
      this.ledger.audit({ entityType: 'client_completion_review', entityId: id, jobId, action: 'receive_client_completion_review', actor: 'client_portal',
        after: { ...request, id, status: row.status, submittedAt }, metadata: { externalCommitments: 0, changesJobStatus: false, changesContractValue: false } });
      return { response, replayed: false, externalCommitments: 0, changesJobStatus: false, changesContractValue: false };
    });
  }
  list(jobId) {
    this.ledger.requireJob(jobId, { allowInactive: true });
    return this.db.prepare('SELECT * FROM client_completion_reviews WHERE job_id = ? ORDER BY submitted_at DESC,id').all(jobId).map(row => {
      const reviewActions = this.reviewActions(row.id);
      return {
        ...this.publicResponse(row), portalAccessId: row.portal_access_id, packageDocumentId: row.package_document_id,
        packageHash: row.package_hash, sourceHash: row.source_hash,
        sourceCurrent: this.isCurrent(row), reviewActions,
        officeReviewStatus: reviewActions.length ? 'reviewed' : 'received_unreviewed'
      };
    });
  }
  review(jobId, reviewId, payload = {}, actor = 'Contractor.AI') {
    return this.ledger.transaction(() => {
      this.ledger.requireJob(jobId, { allowInactive: true });
      const response = this.db.prepare('SELECT * FROM client_completion_reviews WHERE id = ? AND job_id = ?').get(reviewId, jobId);
      if (!response) throw Object.assign(new Error('De klantreactie is niet gevonden.'), { statusCode: 404, code: 'client_completion_review_not_found' });
      const entryKey = requiredText(payload.entryKey, 'Review sleutel', 8, 200);
      const disposition = payload.disposition;
      if (!['follow_up_required', 'no_follow_up_recorded', 'escalate_not_accepted'].includes(disposition)) {
        throw Object.assign(new Error('Kies een geldige interne reviewuitkomst.'), { statusCode: 400, code: 'client_completion_disposition_invalid' });
      }
      const note = requiredText(payload.note, 'Reviewonderbouwing', 5, 2000);
      const sourceCurrent = this.isCurrent(response);
      if (!sourceCurrent && payload.confirmStaleSource !== true) {
        throw Object.assign(new Error('Het dossier is gewijzigd. Bevestig expliciet dat je een verouderde reactie beoordeelt.'), { statusCode: 409, code: 'client_completion_source_stale' });
      }
      if (disposition === 'escalate_not_accepted' && response.outcome !== 'not_accepted') {
        throw Object.assign(new Error('Alleen een klantreactie "niet geaccepteerd" kan hiermee worden geescaleerd.'), { statusCode: 409, code: 'client_completion_escalation_mismatch' });
      }
      const request = { jobId, reviewId, disposition, note, sourceCurrent, actor };
      const requestHash = digest(request);
      const replay = this.db.prepare('SELECT * FROM client_completion_review_actions WHERE entry_key = ?').get(entryKey);
      if (replay) {
        if (replay.request_hash !== requestHash) throw Object.assign(new Error('Deze reviewsleutel is al voor een andere beoordeling gebruikt.'), { statusCode: 409, code: 'client_completion_review_replay_conflict' });
        return { action: this.reviewActions(reviewId).find(item => item.id === replay.id), replayed: true, externalCommitments: 0 };
      }
      const id = `client_completion_action_${crypto.createHash('sha256').update(`${reviewId}\0${entryKey}`).digest('hex').slice(0, 24)}`;
      const createdAt = this.ledger.clock().toISOString();
      this.db.prepare(`INSERT INTO client_completion_review_actions
        (id,completion_review_id,entry_key,request_hash,disposition,note,source_current,actor,created_at)
        VALUES (?,?,?,?,?,?,?,?,?)`).run(id, reviewId, entryKey, requestHash, disposition, note, sourceCurrent ? 1 : 0, actor, createdAt);
      const action = this.reviewActions(reviewId).find(item => item.id === id);
      this.ledger.audit({ entityType: 'client_completion_review', entityId: reviewId, jobId,
        action: 'review_client_completion_response', actor,
        before: { latestReview: this.reviewActions(reviewId).length > 1 ? this.reviewActions(reviewId).at(-2) : null },
        after: { reviewAction: action, clientOutcome: response.outcome, sourceCurrent },
        metadata: { changesJobStatus: false, changesContractValue: false, changesInvoice: false, changesPayment: false, externalCommitments: 0 } });
      return { action, replayed: false, externalCommitments: 0, changesJobStatus: false, changesContractValue: false };
    });
  }
  exportRecords() {
    return this.db.prepare('SELECT * FROM client_completion_reviews ORDER BY job_id,submitted_at,id').all().map(row => ({
      id: row.id, jobId: row.job_id, portalAccessId: row.portal_access_id, packageDocumentId: row.package_document_id,
      packageHash: row.package_hash, sourceHash: row.source_hash, entryKey: row.entry_key, requestHash: row.request_hash,
      outcome: row.outcome, respondentName: row.respondent_name, authorityConfirmed: Boolean(row.authority_confirmed),
      note: row.note, status: row.status, submittedAt: row.submitted_at, createdAt: row.created_at
    }));
  }
  exportReviewActions() {
    return this.db.prepare(`SELECT a.* FROM client_completion_review_actions a
      JOIN client_completion_reviews r ON r.id = a.completion_review_id
      ORDER BY r.job_id,a.created_at,a.id`).all().map(row => ({
      id: row.id, completionReviewId: row.completion_review_id, entryKey: row.entry_key,
      requestHash: row.request_hash, disposition: row.disposition, note: row.note,
      sourceCurrent: Boolean(row.source_current), actor: row.actor, createdAt: row.created_at
    }));
  }
  isCurrent(row) {
    try { const basis = this.basis(row.job_id, row.portal_access_id); return basis.packageContent.packageHash === row.package_hash && basis.sourceHash === row.source_hash; }
    catch (error) { if ([403, 404, 409].includes(error.statusCode)) return false; throw error; }
  }
  download(portalToken) {
    const snapshot = this.ledger.getClientPortalSnapshot(portalToken), basis = this.basis(snapshot.job.id, snapshot.portal.accessId);
    return this.ledger.getHandoverIssuePackage(basis.packageDocument.id, { actor: 'client_portal' });
  }
}

module.exports = { ClientCompletionReview, migrateClientCompletionReview, migrateClientCompletionReviewActions };
