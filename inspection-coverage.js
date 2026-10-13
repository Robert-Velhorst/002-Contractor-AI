const { randomUUID } = require('node:crypto');
const { digest } = require('./work-context');
const { WorkDelivery } = require('./work-delivery');

const TABLES = ['inspection_coverage_decisions', 'inspection_coverage_commands'];
const COLUMNS = {
  inspection_coverage_decisions: ['job_id', 'delivery_id', 'sequence_number', 'kind', 'plan_id', 'status', 'approval_id', 'snapshot_json', 'snapshot_hash'],
  inspection_coverage_commands: ['job_id', 'request_hash', 'response_json']
};
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { code: 'inspection_coverage_invalid', statusCode }); };
function text(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(char => char.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(char))) fail(`${label} ontbreekt of is ongeldig.`);
  return value.trim();
}
function ids(value) {
  if (!Array.isArray(value) || value.length > 20) fail('Kies maximaal twintig bronstukken.');
  const result = value.map(id => text(id, 'Bronstuk', 150)).sort();
  if (new Set(result).size !== result.length) fail('Dubbele bronstukken zijn niet toegestaan.');
  return result;
}
function retained(row) {
  const snapshot = JSON.parse(row.snapshot_json);
  if (digest(snapshot) !== row.snapshot_hash) fail('De keuringsdekking heeft een ongeldige controlesom.', 409);
  return snapshot;
}
function approvalMatches(row, approval, snapshot) {
  if (!approval || approval.target_type !== 'inspection_coverage_decision' || approval.target_id !== row.id
    || approval.job_id !== row.job_id || approval.status !== row.status
    || (row.status === 'approved' && approval.requested_by === approval.resolved_by)) return false;
  const data = JSON.parse(approval.data_json || '{}');
  return digest(Object.fromEntries(Object.keys(snapshot).map(key => [key, data[key]]))) === digest(snapshot);
}
function migrateInspectionCoverage(db) {
  db.exec(`
    CREATE TABLE inspection_coverage_decisions (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), delivery_id TEXT NOT NULL REFERENCES work_deliveries(id),
      sequence_number INTEGER NOT NULL, kind TEXT NOT NULL CHECK(kind IN ('plan','assessment')),
      plan_id TEXT REFERENCES inspection_coverage_decisions(id),
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','cancelled')),
      approval_id TEXT NOT NULL REFERENCES approvals(id), snapshot_json TEXT NOT NULL, snapshot_hash TEXT NOT NULL,
      created_at TEXT NOT NULL, resolved_at TEXT,
      UNIQUE(delivery_id,sequence_number),
      CHECK((kind = 'plan' AND plan_id IS NULL) OR (kind = 'assessment' AND plan_id IS NOT NULL))
    );
    CREATE UNIQUE INDEX idx_inspection_coverage_pending ON inspection_coverage_decisions(delivery_id) WHERE status = 'pending';
    CREATE INDEX idx_inspection_coverage_job ON inspection_coverage_decisions(job_id,delivery_id,sequence_number);
    CREATE TABLE inspection_coverage_commands (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX idx_inspection_coverage_commands_job ON inspection_coverage_commands(job_id);
  `);
  require('./company-authority').installAuthorityGuards(db, TABLES);
}

class InspectionCoverage {
  constructor(ledger) { this.ledger = ledger; this.db = ledger.db; this.delivery = new WorkDelivery(ledger); }
  now() { return this.ledger.clock().toISOString(); }
  lock(jobId) {
    this.delivery.lock(jobId);
    for (const table of ['inspection_checklist_submissions', 'installation_qc_controls', 'observation_records']) this.db.prepare(`UPDATE ${table} SET status = status WHERE job_id = ?`).run(jobId);
  }
  documents(jobId, selected) {
    return selected.map(id => {
      const row = this.db.prepare('SELECT * FROM documents WHERE id = ? AND job_id = ?').get(id, jobId);
      if (!row || ['deleted', 'rejected', 'quarantined'].includes(row.status) || row.type === 'drawing_revision') fail('Kies een beschikbaar afzonderlijk bronstuk van deze opdracht.', 409);
      if (!row.storage_ref && !String(JSON.parse(row.data_json || '{}').reference || '').trim()) fail('Een bronstuk vereist een bestand of herleidbare externe registratie.', 409);
      return { id, hash: digest(row) };
    });
  }
  physical(jobId, deliveryId) {
    const row = this.delivery.row(jobId, deliveryId), snapshot = retained(row);
    if (row.status !== 'retained' || this.db.prepare("SELECT id FROM work_delivery_decisions WHERE delivery_id = ? AND kind = 'void' AND status = 'pending'").get(row.id)) fail('De deeloplevering is gecorrigeerd of heeft een openstaande correctie.', 409);
    const current = this.delivery.physical(jobId, row.package_id, snapshot.entryIds, snapshot.taskIds);
    if (digest(current) !== digest(snapshot.physical)) fail('De uitgevoerde scope is gewijzigd. Corrigeer eerst de deeloplevering.', 409);
    return { deliveryId, snapshotHash: row.snapshot_hash, physicalHash: digest(current) };
  }
  rows(deliveryId) { return this.db.prepare('SELECT * FROM inspection_coverage_decisions WHERE delivery_id = ? ORDER BY sequence_number').all(deliveryId); }
  activePlan(deliveryId) { return this.rows(deliveryId).filter(row => row.kind === 'plan' && row.status === 'approved').at(-1); }
  planBasis(jobId, deliveryId, plan) { return { physical: this.physical(jobId, deliveryId), documents: this.documents(jobId, plan.documentIds) }; }
  inspection(jobId, id) {
    const row = this.db.prepare('SELECT * FROM inspection_records WHERE id = ? AND job_id = ?').get(id, jobId);
    if (!row) fail('De keuring hoort niet bij deze opdracht.', 409);
    const inspection = this.ledger.mapInspection(row);
    const approval = row.approval_id && this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(row.approval_id);
    const latest = inspection.checklist.submissions.find(item => item.id === inspection.checklist.latestSubmissionId);
    const observations = this.db.prepare('SELECT * FROM observation_records WHERE job_id = ? ORDER BY id').all(jobId)
      .filter(item => JSON.parse(item.data_json || '{}').sourceInspectionId === id);
    if (!approval || approval.status !== 'approved' || approval.job_id !== jobId || approval.target_type !== 'inspection_record' || approval.target_id !== id
      || !['passed', 'approved', 'completed'].includes(row.status) || !['pass', 'passed', 'approved'].includes(row.result) || inspection.defects.length
      || (inspection.checklist.configured && (!inspection.checklist.integrityValid || !latest?.integrityValid || latest.approvalId !== approval.id || latest.result !== 'passed' || !['passed', 'approved', 'completed', 'closed'].includes(latest.status)))
      || (inspection.installationQc && (!inspection.installationQc.readyForTaskCompletion || !inspection.installationQc.referencesCurrent))
      || observations.some(item => !['closed', 'resolved', 'approved', 'cancelled', 'canceled', 'rejected', 'void'].includes(item.status))) fail('Deze keuring is niet actueel, akkoord of vrij van open herstelpunten.', 409);
    return { id, hash: digest({ row, approval, checklist: inspection.checklist, qc: inspection.installationQc, observations }) };
  }
  assessmentBasis(jobId, deliveryId, planRow, responses) {
    const plan = retained(planRow);
    if (this.activePlan(deliveryId)?.id !== planRow.id || !this.current(planRow)) fail('Het controleplan of de uitvoering is gewijzigd.', 409);
    return { planId: planRow.id, planHash: planRow.snapshot_hash, planBasisHash: plan.basisHash,
      responses: responses.map(response => ({ key: response.key, inspection: response.outcome === 'passed' ? this.inspection(jobId, response.inspectionId) : null, documents: this.documents(jobId, response.documentIds) })) };
  }
  current(row) {
    const snapshot = retained(row);
    if (!approvalMatches(row, this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(row.approval_id), snapshot)) return false;
    try {
      const basis = row.kind === 'plan' ? this.planBasis(row.job_id, row.delivery_id, snapshot)
        : this.assessmentBasis(row.job_id, row.delivery_id, this.db.prepare('SELECT * FROM inspection_coverage_decisions WHERE id = ?').get(row.plan_id), snapshot.responses);
      return digest(basis) === snapshot.basisHash;
    } catch (error) { if (![400, 404, 409].includes(error.statusCode)) throw error; return false; }
  }
  describe(row) {
    return { id: row.id, sequence: Number(row.sequence_number), kind: row.kind, planId: row.plan_id, status: row.status,
      approvalId: row.approval_id, ...retained(row), sourceCurrent: this.current(row), createdAt: row.created_at, resolvedAt: row.resolved_at };
  }
  summary(jobId, deliveryId) {
    const delivery = this.delivery.row(jobId, deliveryId), rows = this.rows(deliveryId), planRow = this.activePlan(deliveryId);
    const plan = planRow && retained(planRow), assessment = rows.filter(row => row.kind === 'assessment' && row.status === 'approved' && row.plan_id === planRow?.id).at(-1);
    const pending = rows.some(row => row.status === 'pending');
    const current = Boolean(planRow && this.current(planRow)), assessed = Boolean(assessment && this.current(assessment));
    const status = delivery.status === 'voided' ? 'voided' : pending ? 'pending_review' : !plan ? 'not_configured' : !current ? 'source_changed' : !assessment ? 'evidence_required' : !assessed ? 'source_changed' : 'covered';
    const responses = assessed ? retained(assessment).responses : [];
    return { status, planId: planRow?.id || null, assessmentId: assessment?.id || null, pending, total: plan?.checks.length || 0,
      covered: status === 'covered' ? plan.checks.length : 0, grantsSafetyPermission: false,
      checks: (plan?.checks || []).map(check => ({ key: check.key, title: check.title, fieldInstruction: check.fieldInstruction,
        status: status === 'covered' ? responses.find(row => row.key === check.key).outcome : 'review_required' })) };
  }
  read(jobId) {
    this.ledger.requireJob(jobId, { allowInactive: true });
    const records = this.db.prepare('SELECT * FROM work_deliveries WHERE job_id = ? ORDER BY created_at,id').all(jobId).map(row => ({
      id: row.id, title: retained(row).title, scope: retained(row).scope, status: row.status,
      coverage: this.summary(jobId, row.id), history: this.rows(row.id).map(item => this.describe(item)) }));
    const inspections = this.db.prepare('SELECT id,title,status FROM inspection_records WHERE job_id = ? ORDER BY id').all(jobId).map(row => {
      try { return { ...row, eligible: true, source: this.inspection(jobId, row.id) }; }
      catch (error) { if (![400, 404, 409].includes(error.statusCode)) throw error; return { ...row, eligible: false }; }
    });
    const documents = this.db.prepare("SELECT * FROM documents WHERE job_id = ? AND type <> 'drawing_revision' AND status NOT IN ('deleted','rejected','quarantined') ORDER BY id").all(jobId)
      .map(row => ({ id: row.id, title: row.title, hash: digest(row), contentAvailable: Boolean(row.storage_ref), reference: JSON.parse(row.data_json || '{}').reference || null }));
    return { format: 'contractor-inspection-coverage/v1', jobId, records, options: { inspections, documents }, sourceHash: digest({ records, inspections, documents }) };
  }
  command(jobId, input, actor) {
    if (!input || !['plan', 'assessment'].includes(input.action) || !input.record || typeof input.record !== 'object' || Array.isArray(input.record)) fail('Ongeldige keuringsdekkingactie.');
    const key = text(input.entryKey, 'Wijzigingssleutel', 150), sourceHash = text(input.sourceHash, 'Bronversie', 64);
    if (!/^[a-f0-9]{64}$/.test(sourceHash)) fail('Ongeldige bronversie.');
    const id = digest({ jobId, key }), requestHash = digest(input);
    return this.ledger.transaction(() => {
      this.lock(jobId); this.ledger.requireJob(jobId);
      const previous = this.db.prepare('SELECT * FROM inspection_coverage_commands WHERE id = ?').get(id);
      if (previous) {
        if (previous.request_hash !== requestHash) fail('Deze wijzigingssleutel is al voor andere gegevens gebruikt.', 409);
        return { ...JSON.parse(previous.response_json), replayed: true };
      }
      if (this.read(jobId).sourceHash !== sourceHash) fail('De keuringsdekking is gewijzigd. Ververs en controleer opnieuw.', 409);
      const record = input.record, deliveryId = text(record.deliveryId, 'Deeloplevering', 150);
      this.physical(jobId, deliveryId);
      const rows = this.rows(deliveryId);
      if (rows.some(row => row.status === 'pending')) fail('Behandel eerst de openstaande beoordeling.', 409);
      const snapshot = { format: 'contractor-inspection-coverage-decision/v1', jobId, deliveryId, kind: input.action,
        reason: text(record.reason, 'Onderbouwing', 2000) };
      let planId = null;
      if (input.action === 'plan') {
        if (!Array.isArray(record.checks) || record.checks.length < 1 || record.checks.length > 50 || record.scopeConfirmed !== true) fail('Bevestig de volledige controlescope en benoem een tot vijftig vereiste controles.');
        snapshot.scopeReference = text(record.scopeReference, 'Afbakening controlescope', 2000);
        snapshot.checks = record.checks.map(check => {
          if (!check || typeof check.allowNotApplicable !== 'boolean') fail('Geef expliciet aan of niet-toepasselijkheid beoordeeld mag worden.');
          const key = text(check.key, 'Controlesleutel', 80);
          if (!/^[A-Za-z0-9_-]+$/.test(key)) fail('De controlesleutel mag alleen letters, cijfers, streepjes en onderstrepingen bevatten.');
          return { key, title: text(check.title, 'Controletitel'), criterion: text(check.criterion, 'Acceptatiecriterium', 1500),
            fieldInstruction: text(check.fieldInstruction, 'Instructie voor uitvoerende', 1500), allowNotApplicable: check.allowNotApplicable };
        });
        if (new Set(snapshot.checks.map(check => check.key)).size !== snapshot.checks.length) fail('Controlesleutels moeten uniek zijn.');
        snapshot.documentIds = ids(record.documentIds); snapshot.scopeConfirmed = true;
        snapshot.basisHash = digest(this.planBasis(jobId, deliveryId, snapshot));
      } else {
        const planRow = this.activePlan(deliveryId);
        if (!planRow || record.planId !== planRow.id) fail('Kies het actuele goedgekeurde controleplan.', 409);
        planId = planRow.id;
        const plan = retained(planRow);
        if (!Array.isArray(record.responses) || record.responses.length !== plan.checks.length || new Set(record.responses.map(row => row?.key)).size !== plan.checks.length) fail('Onderbouw iedere vereiste controle precies eenmaal.');
        snapshot.responses = plan.checks.map(check => {
          const response = record.responses.find(row => row?.key === check.key);
          if (!response || !['passed', 'not_applicable'].includes(response.outcome) || (response.outcome === 'not_applicable' && !check.allowNotApplicable)) fail('De controle-uitkomst is niet toegestaan.');
          const documentIds = ids(response.documentIds);
          if (!documentIds.length) fail('Onderbouw iedere controle met een afzonderlijk bronstuk.');
          return { key: check.key, outcome: response.outcome, documentIds,
            inspectionId: response.outcome === 'passed' ? text(response.inspectionId, 'Keuring', 150) : null,
            scopeReference: text(response.scopeReference, 'Bewijs voor dit uitgevoerde deel', 2000) };
        });
        snapshot.basisHash = digest(this.assessmentBasis(jobId, deliveryId, planRow, snapshot.responses));
      }
      const decisionId = randomUUID();
      const approval = this.ledger.createApproval({ targetType: 'inspection_coverage_decision', targetId: decisionId, jobId,
        approvalType: `inspection_coverage_${input.action}`, summary: `${input.action === 'plan' ? 'Controleplan' : 'Keuringsdekking'} beoordelen: ${retained(this.delivery.row(jobId, deliveryId)).title}`,
        reason: snapshot.reason, data: { ...snapshot, noSafetyOrPaymentEffect: true, externalCommitments: 0 } }, { actor });
      this.db.prepare("INSERT INTO inspection_coverage_decisions (id,job_id,delivery_id,sequence_number,kind,plan_id,status,approval_id,snapshot_json,snapshot_hash,created_at) VALUES (?,?,?,?,?,?,'pending',?,?,?,?)")
        .run(decisionId, jobId, deliveryId, Number(rows.at(-1)?.sequence_number || 0) + 1, input.action, planId, approval.id, JSON.stringify(snapshot), digest(snapshot), this.now());
      const response = { deliveryId, decisionId, approvalId: approval.id, replayed: false, externalCommitments: 0 };
      this.db.prepare('INSERT INTO inspection_coverage_commands (id,job_id,request_hash,response_json,created_at) VALUES (?,?,?,?,?)').run(id, jobId, requestHash, JSON.stringify(response), this.now());
      this.ledger.audit({ entityType: 'inspection_coverage', entityId: decisionId, jobId, action: `request_inspection_coverage_${input.action}`, actor, after: response, metadata: { entryKey: key } });
      return response;
    });
  }
  prepareResolution(approval, status, resolver) {
    this.lock(approval.job_id);
    const row = this.db.prepare('SELECT * FROM inspection_coverage_decisions WHERE id = ? AND approval_id = ?').get(approval.target_id, approval.id);
    if (!row || row.status !== 'pending') fail('Deze beoordeling is niet meer openstaand.', 409);
    if (status === 'approved') {
      if (approval.requested_by === resolver) fail('Het controleplan en de dekking vereisen een andere beoordelaar dan de indiener.', 409);
      if (!this.current(row)) fail('De controlescope of het bewijs is gewijzigd. Wijs af en bereid een actuele beoordeling voor.', 409);
    }
  }
  resolve(approval, status) {
    const row = this.db.prepare('SELECT * FROM inspection_coverage_decisions WHERE id = ? AND approval_id = ?').get(approval.target_id, approval.id);
    if (!row || row.status !== 'pending') fail('Beoordeling niet gevonden of al behandeld.', 409);
    this.db.prepare('UPDATE inspection_coverage_decisions SET status = ?, resolved_at = ? WHERE id = ?').run(status, this.now(), row.id);
    this.ledger.audit({ entityType: 'inspection_coverage', entityId: row.id, jobId: row.job_id, action: `inspection_coverage_${status}`, actor: approval.resolved_by,
      after: { kind: row.kind, status }, metadata: { approvalId: approval.id, grantsSafetyPermission: false } });
  }
  privateEvidenceIds(jobId) {
    const result = new Set(this.db.prepare("SELECT id FROM documents WHERE job_id = ? AND type = 'inspection_coverage_evidence'").all(jobId).map(row => row.id));
    for (const row of this.db.prepare('SELECT snapshot_json,snapshot_hash FROM inspection_coverage_decisions WHERE job_id = ?').all(jobId)) {
      const snapshot = retained(row);
      for (const id of [...(snapshot.documentIds || []), ...(snapshot.responses || []).flatMap(response => response.documentIds)]) result.add(id);
    }
    return result;
  }
  exportRecords() { return Object.fromEntries(TABLES.map(table => [table, this.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()])); }
}

function verifyInspectionCoverage(db) {
  for (const row of db.prepare('SELECT * FROM inspection_coverage_decisions ORDER BY delivery_id,sequence_number').all()) {
    const snapshot = retained(row), approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(row.approval_id);
    const delivery = db.prepare('SELECT job_id FROM work_deliveries WHERE id = ?').get(row.delivery_id);
    if (snapshot.jobId !== row.job_id || snapshot.deliveryId !== row.delivery_id || snapshot.kind !== row.kind || delivery?.job_id !== row.job_id
      || !approvalMatches(row, approval, snapshot)) fail('De keuringsdekking heeft een ongeldige dossier- of beoordelingsketen.', 409);
    if (row.kind === 'plan' && (!Array.isArray(snapshot.checks) || snapshot.checks.length < 1 || snapshot.checks.length > 50 || snapshot.scopeConfirmed !== true
      || new Set(snapshot.checks.map(check => check.key)).size !== snapshot.checks.length)) fail('Het bewaarde controleplan is onvolledig.', 409);
    if (row.kind === 'assessment') {
      const plan = db.prepare('SELECT * FROM inspection_coverage_decisions WHERE id = ?').get(row.plan_id);
      if (!plan || plan.kind !== 'plan' || plan.status !== 'approved' || plan.delivery_id !== row.delivery_id || Number(plan.sequence_number) >= Number(row.sequence_number)
        || digest(retained(plan).checks.map(item => item.key)) !== digest(snapshot.responses.map(item => item.key))) fail('Keuringsdekking verwijst niet naar een volledig controleplan.', 409);
      for (const response of snapshot.responses) {
        const check = retained(plan).checks.find(item => item.key === response.key);
        if (!response.documentIds?.length || !['passed', 'not_applicable'].includes(response.outcome)
          || (response.outcome === 'passed' && !response.inspectionId) || (response.outcome === 'not_applicable' && (!check.allowNotApplicable || response.inspectionId))) fail('Een bewaarde controle-uitkomst is ongeldig.', 409);
      }
      for (const response of snapshot.responses) if (response.inspectionId && db.prepare('SELECT job_id FROM inspection_records WHERE id = ?').get(response.inspectionId)?.job_id !== row.job_id) fail('Keuringsdekking verwijst naar een vreemde keuring.', 409);
    }
    for (const id of [...(snapshot.documentIds || []), ...(snapshot.responses || []).flatMap(response => response.documentIds)]) {
      if (db.prepare('SELECT job_id FROM documents WHERE id = ?').get(id)?.job_id !== row.job_id) fail('Keuringsdekking verwijst naar een vreemd bronstuk.', 409);
    }
  }
  return true;
}
module.exports = { InspectionCoverage, migrateInspectionCoverage, verifyInspectionCoverage, TABLES, COLUMNS };
