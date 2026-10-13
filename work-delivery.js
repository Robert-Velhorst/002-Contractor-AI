const { randomUUID } = require('node:crypto');
const { WorkContext, digest } = require('./work-context');

const TABLES = ['work_deliveries', 'work_delivery_production', 'work_delivery_tasks', 'work_delivery_decisions', 'work_delivery_commands'];
const COLUMNS = {
  work_deliveries: ['job_id', 'package_id', 'status', 'snapshot_json', 'snapshot_hash', 'data_json', 'revision'],
  work_delivery_production: ['delivery_id', 'entry_id', 'released'],
  work_delivery_tasks: ['delivery_id', 'task_id', 'released'],
  work_delivery_decisions: ['job_id', 'delivery_id', 'kind', 'status', 'approval_id', 'snapshot_json', 'snapshot_hash'],
  work_delivery_commands: ['job_id', 'request_hash', 'response_json']
};
const FAIL = (message, statusCode = 400) => { throw Object.assign(new Error(message), { code: 'work_delivery_invalid', statusCode }); };
function text(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(char => char.charCodeAt(0) < 32 && !['\n', '\r', '\t'].includes(char))) FAIL(`${label} ontbreekt of is ongeldig.`);
  return value.trim();
}
function ids(value, label) {
  if (!Array.isArray(value) || value.length > 200) FAIL(`${label}: maximaal 200 koppelingen.`);
  const result = value.map(id => text(id, label, 150)).sort();
  if (new Set(result).size !== result.length) FAIL(`${label} bevat dubbele koppelingen.`);
  return result;
}
function snapshot(row) {
  const value = JSON.parse(row.snapshot_json);
  if (digest(value) !== row.snapshot_hash) FAIL('De bewaarde deeloplevering heeft een ongeldige controlesom.', 409);
  return value;
}
function migrateWorkDelivery(db) {
  db.exec(`
    CREATE TABLE work_deliveries (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      package_id TEXT NOT NULL REFERENCES work_packages(id), status TEXT NOT NULL CHECK(status IN ('retained','voided')),
      snapshot_json TEXT NOT NULL, snapshot_hash TEXT NOT NULL, data_json TEXT NOT NULL,
      revision INTEGER NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE INDEX idx_work_deliveries_job ON work_deliveries(job_id, created_at, id);
    CREATE TABLE work_delivery_production (
      id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES work_deliveries(id) ON DELETE CASCADE,
      entry_id TEXT NOT NULL REFERENCES production_entries(id), released INTEGER NOT NULL DEFAULT 0 CHECK(released IN (0,1)),
      UNIQUE(delivery_id, entry_id)
    );
    CREATE UNIQUE INDEX idx_work_delivery_production_active ON work_delivery_production(entry_id) WHERE released = 0;
    CREATE TABLE work_delivery_tasks (
      id TEXT PRIMARY KEY, delivery_id TEXT NOT NULL REFERENCES work_deliveries(id) ON DELETE CASCADE,
      task_id TEXT NOT NULL REFERENCES job_tasks(id), released INTEGER NOT NULL DEFAULT 0 CHECK(released IN (0,1)),
      UNIQUE(delivery_id, task_id)
    );
    CREATE UNIQUE INDEX idx_work_delivery_tasks_active ON work_delivery_tasks(task_id) WHERE released = 0;
    CREATE TABLE work_delivery_decisions (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      delivery_id TEXT NOT NULL REFERENCES work_deliveries(id), kind TEXT NOT NULL CHECK(kind IN ('response','void')),
      status TEXT NOT NULL CHECK(status IN ('pending','approved','rejected','cancelled')),
      approval_id TEXT REFERENCES approvals(id), snapshot_json TEXT NOT NULL, snapshot_hash TEXT NOT NULL,
      created_at TEXT NOT NULL, resolved_at TEXT
    );
    CREATE UNIQUE INDEX idx_work_delivery_decision_pending ON work_delivery_decisions(delivery_id) WHERE status = 'pending';
    CREATE INDEX idx_work_delivery_decisions_job ON work_delivery_decisions(job_id);
    CREATE TABLE work_delivery_commands (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
      request_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE INDEX idx_work_delivery_commands_job ON work_delivery_commands(job_id);
  `);
  require('./company-authority').installAuthorityGuards(db, TABLES);
}

class WorkDelivery {
  constructor(ledger) { this.ledger = ledger; this.db = ledger.db; this.context = new WorkContext(ledger); }
  privateEvidenceIds(jobId) {
    const ids = this.db.prepare("SELECT id FROM documents WHERE job_id = ? AND type = 'acceptance_evidence'").all(jobId).map(row => row.id);
    for (const row of this.db.prepare('SELECT snapshot_json,snapshot_hash FROM work_delivery_decisions WHERE job_id = ?').all(jobId)) {
      const evidenceId = snapshot(row).evidenceDocumentId;
      if (evidenceId) ids.push(evidenceId);
    }
    return new Set(ids);
  }
  lock(jobId) {
    this.context.lock(jobId);
    // Freeze the existing evidence rows while validating and retaining a decision.
    for (const [table, column] of [['production_baselines', 'status'], ['production_entries', 'status'], ['inspection_records', 'status'],
      ['billing_milestones', 'status'], ['invoices', 'status'], ['payments', 'status'], ['credit_notes', 'status'], ['documents', 'status']]) {
      this.db.prepare(`UPDATE ${table} SET ${column} = ${column} WHERE job_id = ?`).run(jobId);
    }
  }
  row(jobId, id) {
    const row = this.db.prepare('SELECT * FROM work_deliveries WHERE id = ? AND job_id = ?').get(text(id, 'Deeloplevering', 150), jobId);
    if (!row) FAIL('Deeloplevering niet gevonden bij deze opdracht.', 404);
    return row;
  }
  records(table, jobId, selected) {
    return selected.map(id => {
      const row = this.db.prepare(`SELECT * FROM ${table} WHERE id = ? AND job_id = ?`).get(id, jobId);
      if (!row) FAIL('Een gekoppelde registratie hoort niet bij deze opdracht.', 409);
      return row;
    });
  }
  physical(jobId, packageId, entryIds, taskIds) {
    const context = this.context.source(jobId), item = context.packages.find(row => row.id === packageId);
    if (!item) FAIL('Werkpakket niet gevonden.', 409);
    const tasks = taskIds.map(id => context.tasks.find(row => row.id === id && item.taskIds.includes(id)));
    if (tasks.some(task => !task)) FAIL('De werkzaamheid is niet meer aan dit werkpakket gekoppeld.', 409);
    const entries = this.records('production_entries', jobId, entryIds).map(row => {
      const entry = this.ledger.mapProductionEntry(row), baseline = this.ledger.getProductionBaseline(entry.baselineId);
      const line = baseline.snapshot.lines.find(line => line.lineKey === entry.lineKey);
      if (!line) FAIL('Productiemeting verwijst naar een onbekende regel.', 409);
      return { id: entry.id, status: entry.status, baselineId: entry.baselineId, baselineHash: baseline.snapshotHash,
        lineKey: entry.lineKey, description: line.description, unit: line.unit, quantity: entry.quantity,
        workDate: entry.workDate, entryFingerprint: entry.entryFingerprint };
    });
    return { package: { id: item.id, code: item.code, title: item.title, outcome: item.outcome, archived: item.archived,
      quantityIds: item.quantityIds, placeId: item.placeId || null }, places: this.context.placesFor(item.placeId ? [item.placeId] : []),
      measuredScope: item.quantityIds.map(id => context.quantities.find(row => row.id === id)),
      tasks: tasks.map(task => ({ id: task.id, title: task.title, status: task.status, completedAt: task.completedAt || null, excluded: task.data?.excludeFromWorkPlan === true })), entries };
  }
  inspection(jobId, selected) {
    const rows = this.records('inspection_records', jobId, selected).map(row => {
      const item = this.ledger.mapInspection(row);
      const approved = row.approval_id && this.db.prepare("SELECT id FROM approvals WHERE id = ? AND status = 'approved'").get(row.approval_id);
      return { id: row.id, title: row.title, status: row.status, result: row.result, updatedAt: row.updated_at,
        passed: Boolean(approved && ['passed', 'approved', 'completed'].includes(row.status) && ['pass', 'passed', 'approved'].includes(row.result)
          && !item.defects.length && (!item.checklist.configured || item.checklist.integrityValid)
          && (!item.installationQc || (item.installationQc.integrityValid && item.installationQc.sourceCurrent && item.installationQc.status === 'released'))) };
    });
    return { status: !rows.length ? 'not_linked' : rows.every(row => row.passed) ? 'linked_checks_passed' : 'review_required', records: rows };
  }
  milestoneOwners(jobId) {
    const owners = new Map();
    for (const row of this.db.prepare("SELECT id, data_json FROM work_deliveries WHERE job_id = ? AND status = 'retained'").all(jobId)) {
      for (const milestoneId of JSON.parse(row.data_json).milestoneIds || []) {
        const rows = owners.get(milestoneId) || [];
        rows.push(row.id);
        owners.set(milestoneId, rows);
      }
    }
    return owners;
  }
  finance(jobId, selected) {
    const owners = this.milestoneOwners(jobId);
    const conflicts = selected.filter(id => (owners.get(id) || []).length > 1);
    const milestones = this.records('billing_milestones', jobId, selected).map(row => ({ id: row.id, title: row.title, status: row.status,
      invoiceId: row.invoice_id, amount: Number(row.amount), taxAmount: Number(row.tax_amount), total: Number(row.total), currency: row.currency,
      allocationStatus: conflicts.includes(row.id) ? 'allocation_conflict' : 'linked_to_delivery' }));
    const invoiceIds = conflicts.length ? [] : [...new Set(milestones.map(row => row.invoiceId).filter(Boolean))];
    const invoices = this.records('invoices', jobId, invoiceIds).map(row => ({
      id: row.id, status: row.status, ...this.ledger.getInvoiceReconciliation(row.id)
    }));
    const eligible = milestones.length && milestones.every(row => row.invoiceId && ['invoiced', 'prepared'].includes(row.status))
      && invoices.every(row => ['prepared', 'sent', 'submitted', 'partially_paid', 'partially_settled', 'paid', 'settled', 'written_off', 'credited'].includes(row.status));
    return { status: conflicts.length ? 'allocation_conflict' : !milestones.length ? 'not_linked' : !eligible ? 'not_invoiced' : invoices.every(row => row.settled)
      ? invoices.some(row => row.writtenOffAmount > 0 || row.creditedAmount > 0) ? 'settled_with_adjustment' : 'paid' : 'outstanding', milestones, invoices };
  }
  describe(row) {
    const retained = snapshot(row), links = JSON.parse(row.data_json);
    let currentPhysical = null;
    try { currentPhysical = this.physical(row.job_id, row.package_id, retained.entryIds, retained.taskIds); } catch (error) { if (error.statusCode !== 409) throw error; }
    const physicalCurrent = Boolean(currentPhysical && digest(currentPhysical) === digest(retained.physical));
    const inspection = this.inspection(row.job_id, links.inspectionIds), finance = this.finance(row.job_id, links.milestoneIds);
    const decisions = this.db.prepare('SELECT * FROM work_delivery_decisions WHERE delivery_id = ? ORDER BY created_at, id').all(row.id).map(item => ({
      id: item.id, kind: item.kind, status: item.status, approvalId: item.approval_id, ...snapshot(item), createdAt: item.created_at, resolvedAt: item.resolved_at
    }));
    const accepted = decisions.filter(item => item.kind === 'response' && item.status === 'approved').at(-1);
    const evidence = accepted ? this.db.prepare('SELECT * FROM documents WHERE id = ? AND job_id = ?').get(accepted.evidenceDocumentId, row.job_id) : null;
    const responseCurrent = Boolean(physicalCurrent && evidence && digest([evidence]) === accepted.evidenceHash && !['deleted', 'rejected', 'quarantined'].includes(evidence.status)
      && require('./client-delivery').responseEvidenceCurrent(this.db, accepted.id));
    const response = { status: row.status === 'voided' ? 'voided' : !accepted ? 'not_verified' : responseCurrent ? accepted.outcome : 'source_changed',
      retainedOutcome: accepted?.outcome || null, pending: decisions.some(item => item.status === 'pending'), decisionId: accepted?.id || null };
    return { id: row.id, jobId: row.job_id, packageId: row.package_id, title: retained.title, scope: retained.scope, status: row.status,
      revision: Number(row.revision), createdAt: row.created_at, snapshotHash: row.snapshot_hash, entryIds: retained.entryIds, taskIds: retained.taskIds,
      physical: { status: row.status === 'voided' ? 'voided' : physicalCurrent ? 'reported' : 'source_changed', current: physicalCurrent,
        entries: retained.physical.entries, tasks: retained.physical.tasks }, inspection, response, finance, decisions,
      inspectionCoverage: new (require('./inspection-coverage').InspectionCoverage)(this.ledger).summary(row.job_id, row.id),
      startPermission: false, jobClosed: false };
  }
  source(jobId) {
    this.ledger.requireJob(jobId, { allowInactive: true });
    return this.db.prepare('SELECT * FROM work_deliveries WHERE job_id = ? ORDER BY created_at, id').all(jobId).map(row => this.describe(row));
  }
  read(jobId) {
    const records = this.source(jobId), context = this.context.read(jobId);
    const options = {
      packages: context.packages.filter(row => !row.archived).map(({ id, title, code, taskIds }) => ({ id, title, code, taskIds })),
      tasks: context.tasks.filter(row => row.status === 'completed' && !row.data?.excludeFromWorkPlan).map(({ id, title }) => ({ id, title })),
      entries: this.db.prepare("SELECT * FROM production_entries WHERE job_id = ? AND status = 'recorded' ORDER BY work_date, id").all(jobId).map(row => ({ ...this.ledger.mapProductionEntry(row),
        unit: this.ledger.getProductionBaseline(row.baseline_id).snapshot.lines.find(line => line.lineKey === row.line_key)?.unit || '' })),
      inspections: this.db.prepare('SELECT id, title, status FROM inspection_records WHERE job_id = ? ORDER BY id').all(jobId),
      milestones: this.db.prepare('SELECT id, title, status FROM billing_milestones WHERE job_id = ? ORDER BY id').all(jobId),
      documents: this.db.prepare("SELECT * FROM documents WHERE job_id = ? AND type <> 'drawing_revision' AND status NOT IN ('deleted','rejected','quarantined') ORDER BY id").all(jobId)
        .map(row => ({ id: row.id, title: row.title, status: row.status, contentAvailable: Boolean(row.storage_ref), reference: JSON.parse(row.data_json || '{}').reference || null }))
    };
    const documentsHash = digest(this.db.prepare('SELECT * FROM documents WHERE job_id = ? ORDER BY id').all(jobId));
    return { format: 'contractor-work-delivery/v1', jobId, records, options, sourceHash: digest({ records, options, contextHash: context.sourceHash, documentsHash }) };
  }
  field(jobId, packageIds) {
    if (!packageIds.length) return [];
    return this.db.prepare(`SELECT * FROM work_deliveries WHERE job_id = ? AND package_id IN (${packageIds.map(() => '?').join(',')}) ORDER BY created_at,id`).all(jobId, ...packageIds).map(row => {
      const retained = snapshot(row); let current = false;
      try { current = digest(this.physical(jobId, row.package_id, retained.entryIds, retained.taskIds)) === digest(retained.physical); } catch (error) { if (error.statusCode !== 409) throw error; }
      return { id: row.id, packageId: row.package_id, title: retained.title, scope: retained.scope, status: row.status,
        physicalStatus: row.status === 'voided' ? 'voided' : current ? 'reported' : 'source_changed',
        inspectionStatus: this.inspection(jobId, JSON.parse(row.data_json).inspectionIds).status,
        inspectionCoverage: new (require('./inspection-coverage').InspectionCoverage)(this.ledger).summary(jobId, row.id),
        quantities: retained.physical.entries.map(({ description, quantity, unit }) => ({ description, quantity, unit })) };
    });
  }
  command(jobId, input, actor) {
    if (!input || typeof input !== 'object' || Array.isArray(input) || !input.record || typeof input.record !== 'object' || Array.isArray(input.record)) FAIL('Ongeldige deelopleveringsactie.');
    const key = text(input.entryKey, 'Wijzigingssleutel', 150), sourceHash = text(input.sourceHash, 'Bronversie', 64);
    if (!/^[a-f0-9]{64}$/.test(sourceHash) || !['retain', 'link', 'request_response', 'request_void'].includes(input.action)) FAIL('Ongeldige actie of bronversie.');
    const id = digest({ jobId, key }), requestHash = digest(input);
    return this.ledger.transaction(() => {
      this.lock(jobId); this.ledger.requireJob(jobId);
      const prior = this.db.prepare('SELECT * FROM work_delivery_commands WHERE id = ? AND job_id = ?').get(id, jobId);
      if (prior) {
        if (prior.request_hash !== requestHash) FAIL('Deze wijzigingssleutel is al voor andere gegevens gebruikt.', 409);
        return { ...JSON.parse(prior.response_json), replayed: true };
      }
      if (this.read(jobId).sourceHash !== sourceHash) FAIL('De deelopleveringsgegevens zijn gewijzigd. Ververs en controleer opnieuw.', 409);
      let result;
      if (input.action === 'retain') result = this.retain(jobId, input.record);
      else {
        const row = this.row(jobId, input.record.id);
        if (row.status !== 'retained') FAIL('Deze deeloplevering is gecorrigeerd en niet meer actief.', 409);
        if (this.db.prepare("SELECT id FROM work_delivery_decisions WHERE delivery_id = ? AND status = 'pending'").get(row.id)) FAIL('Behandel eerst de openstaande beoordeling.', 409);
        result = input.action === 'link' ? this.link(row, input.record) : this.request(row, input.action, input.record, actor);
      }
      const response = { ...result, replayed: false, externalCommitments: 0 };
      this.ledger.audit({ entityType: 'work_delivery', entityId: result.deliveryId, jobId, action: `work_delivery_${input.action}`, actor, after: response, metadata: { entryKey: key, externalCommitments: 0 } });
      this.db.prepare('INSERT INTO work_delivery_commands (id,job_id,request_hash,response_json,created_at) VALUES (?,?,?,?,?)')
        .run(id, jobId, requestHash, JSON.stringify(response), this.ledger.clock().toISOString());
      return response;
    });
  }
  retain(jobId, input) {
    const packageId = text(input.packageId, 'Werkpakket', 150), entryIds = ids(input.entryIds, 'Productiemetingen'), taskIds = ids(input.taskIds, 'Voltooide taken');
    if (!entryIds.length && !taskIds.length) FAIL('Koppel minstens een productiemeting of voltooide taak.');
    const physical = this.physical(jobId, packageId, entryIds, taskIds);
    if (physical.package.archived || physical.places.some(row => row.archived) || physical.tasks.some(row => row.status !== 'completed' || row.excluded)
      || physical.entries.some(row => row.status !== 'recorded')) FAIL('De geselecteerde uitvoering is niet actueel of voltooid.', 409);
    for (const [table, column, values] of [['work_delivery_production', 'entry_id', entryIds], ['work_delivery_tasks', 'task_id', taskIds]]) {
      if (values.some(id => this.db.prepare(`SELECT id FROM ${table} WHERE ${column} = ? AND released = 0`).get(id))) FAIL('Deze uitvoering hoort al bij een actieve deeloplevering.', 409);
    }
    const retained = { format: 'contractor-work-delivery/v1', jobId, packageId, title: text(input.title, 'Titel'), scope: text(input.scope, 'Uitgevoerd deel', 4000), entryIds, taskIds, physical };
    const id = randomUUID(), now = this.ledger.clock().toISOString();
    this.db.prepare("INSERT INTO work_deliveries (id,job_id,package_id,status,snapshot_json,snapshot_hash,data_json,revision,created_at,updated_at) VALUES (?,?,?,'retained',?,?,?,1,?,?)")
      .run(id, jobId, packageId, JSON.stringify(retained), digest(retained), JSON.stringify({ inspectionIds: [], milestoneIds: [] }), now, now);
    for (const [table, column, values] of [['work_delivery_production', 'entry_id', entryIds], ['work_delivery_tasks', 'task_id', taskIds]]) {
      for (const value of values) this.db.prepare(`INSERT INTO ${table} (id,delivery_id,${column},released) VALUES (?,?,?,0)`).run(randomUUID(), id, value);
    }
    return { deliveryId: id };
  }
  link(row, input) {
    const links = { inspectionIds: ids(input.inspectionIds, 'Keuringen'), milestoneIds: ids(input.milestoneIds, 'Factuurtermijnen') };
    this.inspection(row.job_id, links.inspectionIds);
    const owners = this.milestoneOwners(row.job_id);
    if (links.milestoneIds.some(id => (owners.get(id) || []).some(ownerId => ownerId !== row.id))) {
      FAIL('Een factuurtermijn mag maar aan één actieve deeloplevering zijn gekoppeld. Controleer de bestaande koppeling voordat u doorgaat.', 409);
    }
    this.finance(row.job_id, links.milestoneIds);
    this.db.prepare('UPDATE work_deliveries SET data_json = ?, revision = revision + 1, updated_at = ? WHERE id = ?')
      .run(JSON.stringify(links), this.ledger.clock().toISOString(), row.id);
    return { deliveryId: row.id };
  }
  decisionBasis(row, evidenceDocumentId) {
    const detail = this.describe(row);
    const documents = evidenceDocumentId ? this.records('documents', row.job_id, [evidenceDocumentId]) : [];
    if (documents.some(doc => ['deleted', 'rejected', 'quarantined'].includes(doc.status))) FAIL('Klantbewijs is niet beschikbaar voor beoordeling.', 409);
    return { snapshotHash: row.snapshot_hash, status: row.status, physicalCurrent: detail.physical.current, inspection: detail.inspection,
      revision: Number(row.revision), documents, previousDecisions: detail.decisions.filter(item => item.status !== 'pending').map(item => ({ id: item.id, status: item.status })) };
  }
  request(row, action, input, actor) {
    const kind = action === 'request_void' ? 'void' : 'response', now = this.ledger.clock().toISOString();
    const evidenceDocumentId = kind === 'response' ? text(input.evidenceDocumentId, 'Klantbewijs', 150) : null;
    const basis = this.decisionBasis(row, evidenceDocumentId);
    if (kind === 'response') {
      const document = basis.documents[0];
      if (document.type === 'drawing_revision') FAIL('Gebruik een afzonderlijk klantbewijs, niet een uitvoerende tekening.');
      if (!document.storage_ref && !String(JSON.parse(document.data_json || '{}').reference || '').trim()) FAIL('Klantbewijs vereist een opgeslagen bestand of een herleidbare externe bronregistratie.');
    }
    if (kind === 'response' && !basis.physicalCurrent) FAIL('Het uitgevoerde deel is gewijzigd. Corrigeer de deeloplevering voordat een nieuwe klantreactie wordt beoordeeld.', 409);
    const retained = { deliveryId: row.id, jobId: row.job_id, title: snapshot(row).title, reason: text(input.reason, 'Toelichting', 2000), basisHash: digest(basis), evidenceDocumentId, evidenceHash: digest(basis.documents) };
    if (kind === 'response') {
      if (!['accepted', 'accepted_with_reservations', 'disputed'].includes(input.outcome)) FAIL('Kies een geldige klantreactie.');
      const date = text(input.respondedAt, 'Datum klantreactie', 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date || date > now.slice(0, 10)) FAIL('De klantreactie vereist een geldige datum, niet in de toekomst.');
      const physical = snapshot(row).physical;
      const latestWorkDate = [...physical.entries.map(entry => entry.workDate), ...physical.tasks.map(task => task.completedAt?.slice(0, 10)).filter(Boolean)].sort().at(-1);
      if (input.outcome !== 'disputed' && latestWorkDate && date < latestWorkDate) FAIL('Acceptatie kan niet voorafgaan aan de geregistreerde uitvoering.');
      Object.assign(retained, { outcome: input.outcome, respondedAt: date, respondent: text(input.respondent, 'Naam klant / vertegenwoordiger'), authorityReference: text(input.authorityReference, 'Onderbouwing bevoegdheid', 1000) });
    }
    const id = randomUUID();
    const approval = this.ledger.createApproval({ targetType: 'work_delivery_decision', targetId: id, jobId: row.job_id,
      approvalType: `work_delivery_${kind}`, summary: `${kind === 'void' ? 'Correctie deeloplevering' : 'Controle klantreactie'}: ${retained.title}`,
      reason: retained.reason, data: { ...retained, kind, externalCommitments: 0, noSafetyOrPaymentEffect: true } }, { actor });
    this.db.prepare("INSERT INTO work_delivery_decisions (id,job_id,delivery_id,kind,status,approval_id,snapshot_json,snapshot_hash,created_at) VALUES (?,?,?,?,'pending',?,?,?,?)")
      .run(id, row.job_id, row.id, kind, approval.id, JSON.stringify(retained), digest(retained), now);
    return { deliveryId: row.id, decisionId: id, approvalId: approval.id };
  }
  prepareResolution(approval, status, payload = {}) {
    this.lock(approval.job_id);
    const row = this.db.prepare('SELECT * FROM work_delivery_decisions WHERE id = ? AND approval_id = ?').get(approval.target_id, approval.id);
    if (!row || row.status !== 'pending') FAIL('Deze beoordeling is niet meer openstaand.', 409);
    if (status === 'approved') {
      new (require('./client-delivery').ClientDelivery)(this.ledger).validateResponseDecision(row.id, payload);
      const retained = snapshot(row), delivery = this.row(row.job_id, row.delivery_id);
      if (digest(this.decisionBasis(delivery, retained.evidenceDocumentId)) !== retained.basisHash) FAIL('De onderbouwing is gewijzigd. Wijs deze beoordeling af en bereid een actuele beoordeling voor.', 409);
    }
  }
  resolve(approval, status) {
    const row = this.db.prepare('SELECT * FROM work_delivery_decisions WHERE id = ? AND approval_id = ?').get(approval.target_id, approval.id);
    if (!row || row.status !== 'pending') FAIL('Beoordeling niet gevonden of al behandeld.', 409);
    if (status === 'approved' && row.kind === 'void') {
      this.db.prepare("UPDATE work_deliveries SET status = 'voided', revision = revision + 1, updated_at = ? WHERE id = ?").run(this.ledger.clock().toISOString(), row.delivery_id);
      for (const table of ['work_delivery_production', 'work_delivery_tasks']) this.db.prepare(`UPDATE ${table} SET released = 1 WHERE delivery_id = ?`).run(row.delivery_id);
    }
    this.db.prepare('UPDATE work_delivery_decisions SET status = ?, resolved_at = ? WHERE id = ?').run(status, this.ledger.clock().toISOString(), row.id);
    this.ledger.audit({ entityType: 'work_delivery', entityId: row.delivery_id, jobId: row.job_id, action: `work_delivery_decision_${status}`, actor: approval.resolved_by,
      after: { decisionId: row.id, kind: row.kind, status }, metadata: { approvalId: approval.id, externalCommitments: 0 } });
  }
  exportRecords() { return Object.fromEntries(TABLES.map(table => [table, this.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all()])); }
}
function verifyWorkDeliveries(db) {
  for (const table of ['work_deliveries', 'work_delivery_decisions']) for (const row of db.prepare(`SELECT * FROM ${table}`).all()) {
    const retained = snapshot(row);
    if (retained.jobId !== row.job_id || (table === 'work_deliveries' && retained.packageId !== row.package_id)
      || (table === 'work_delivery_decisions' && retained.deliveryId !== row.delivery_id)) FAIL('Deeloplevering is niet aan het juiste dossier gebonden.', 409);
    if (table === 'work_deliveries') {
      for (const [linkTable, column, key] of [['work_delivery_production', 'entry_id', 'entryIds'], ['work_delivery_tasks', 'task_id', 'taskIds']]) {
        const links = db.prepare(`SELECT * FROM ${linkTable} WHERE delivery_id = ? ORDER BY ${column}`).all(row.id);
        if (digest(links.map(link => link[column])) !== digest(retained[key]) || links.some(link => Number(link.released) !== (row.status === 'voided' ? 1 : 0))) FAIL('Deeloplevering mist een geldige uitvoeringskoppeling.', 409);
      }
    } else {
      const approval = db.prepare('SELECT * FROM approvals WHERE id = ?').get(row.approval_id);
      if (!approval || approval.target_id !== row.id || approval.target_type !== 'work_delivery_decision' || approval.job_id !== row.job_id || approval.status !== row.status) FAIL('Deeloplevering mist een geldige beoordelingsketen.', 409);
    }
  }
  return true;
}
module.exports = { WorkDelivery, migrateWorkDelivery, verifyWorkDeliveries, TABLES, COLUMNS };
