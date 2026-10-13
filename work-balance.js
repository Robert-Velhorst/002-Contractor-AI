const { randomUUID } = require('node:crypto');
const { WorkContext, digest } = require('./work-context');
const { WorkDelivery } = require('./work-delivery');

const TABLES = ['work_balance_plans', 'work_balance_commands'];
const COLUMNS = {
  work_balance_plans: ['job_id', 'sequence_number', 'status', 'approval_id', 'snapshot_json', 'snapshot_hash'],
  work_balance_commands: ['job_id', 'request_hash', 'response_json']
};
const fail = (message, statusCode = 400) => { throw Object.assign(new Error(message), { statusCode, code: 'work_balance_invalid' }); };
function text(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(char => char.charCodeAt(0) < 32 && !'\t\r\n'.includes(char))) fail(`${label} ontbreekt of is ongeldig.`);
  return value.trim();
}
function units(value, zero = false) {
  if (!['number', 'string'].includes(typeof value) || value === '' || !Number.isFinite(Number(value))) fail('Ongeldige hoeveelheid.');
  const number = Number(value), scaled = Math.round(number * 10000);
  if (number < 0 || (!zero && number === 0) || number > 1e9 || Math.abs(scaled / 10000 - number) > Math.max(1e-9, number * Number.EPSILON)) fail('Hoeveelheden vereisen maximaal vier decimalen en een waarde tot een miljard.');
  return BigInt(scaled);
}
function quantity(value) {
  if (value > BigInt(Number.MAX_SAFE_INTEGER) || value < 0n) fail('De totale hoeveelheid kan niet exact worden weergegeven.', 409);
  return Number(value) / 10000;
}
const sum = values => values.reduce((total, value) => total + units(value, true), 0n);
const positive = value => value > 0n ? value : 0n;
function retained(row) {
  const snapshot = JSON.parse(row.snapshot_json);
  if (digest(snapshot) !== row.snapshot_hash) fail('De werkverdeling heeft een ongeldige controlesom.', 409);
  return snapshot;
}
function approvalMatches(row, approval) {
  if (!approval || approval.target_type !== 'work_balance_plan' || approval.target_id !== row.id || approval.job_id !== row.job_id
    || approval.status !== (row.status === 'superseded' ? 'approved' : row.status)) return false;
  const snapshot = retained(row), data = JSON.parse(approval.data_json || '{}');
  return digest(Object.fromEntries(Object.keys(snapshot).map(key => [key, data[key]]))) === row.snapshot_hash;
}
function migrateWorkBalance(db) {
  db.exec(`
    CREATE TABLE work_balance_plans (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), sequence_number INTEGER NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('pending','approved','superseded','rejected','cancelled')),
      approval_id TEXT NOT NULL REFERENCES approvals(id), snapshot_json TEXT NOT NULL, snapshot_hash TEXT NOT NULL,
      created_at TEXT NOT NULL, resolved_at TEXT, UNIQUE(job_id,sequence_number)
    );
    CREATE UNIQUE INDEX idx_work_balance_pending ON work_balance_plans(job_id) WHERE status = 'pending';
    CREATE UNIQUE INDEX idx_work_balance_active ON work_balance_plans(job_id) WHERE status = 'approved';
    CREATE INDEX idx_work_balance_job ON work_balance_plans(job_id,sequence_number);
    CREATE TABLE work_balance_commands (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  require('./company-authority').installAuthorityGuards(db, TABLES);
}

class WorkBalance {
  constructor(ledger) { this.ledger = ledger; this.db = ledger.db; this.context = new WorkContext(ledger); this.delivery = new WorkDelivery(ledger); }
  now() { return this.ledger.clock().toISOString(); }
  lock(jobId) { this.delivery.lock(jobId); }
  enabled(jobId) { return Boolean(this.db.prepare('SELECT id FROM work_balance_plans WHERE job_id = ? LIMIT 1').get(jobId)); }
  rows(jobId) { return this.db.prepare('SELECT * FROM work_balance_plans WHERE job_id = ? ORDER BY sequence_number').all(jobId); }
  baseline(id) {
    const baseline = this.ledger.getProductionBaseline(id), approval = this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(baseline.approvalId);
    const data = JSON.parse(approval?.data_json || '{}');
    if (!['approved', 'superseded'].includes(baseline.status) || approval?.status !== 'approved' || approval.target_type !== 'production_baseline'
      || approval.target_id !== id || approval.job_id !== baseline.jobId || data.snapshotHash !== baseline.snapshotHash || data.planHash !== baseline.snapshot.planHash) fail('De productiegrondslag heeft geen passende goedkeuring.', 409);
    return baseline;
  }
  basis(jobId) {
    const context = this.context.source(jobId), baselines = this.ledger.listProductionBaselines(jobId);
    const active = baselines.filter(row => row.status === 'approved');
    if (active.length > 1) fail('Meer dan een actieve productiegrondslag vereist herstel.', 409);
    const baseline = active.length ? this.baseline(active[0].id) : null;
    const packages = context.packages.filter(row => !row.archived).map(row => ({ ...row,
      tasks: row.taskIds.map(id => context.tasks.find(task => task.id === id)).map(task => ({ id: task.id, title: task.title, excluded: task.data?.excludeFromWorkPlan === true })),
      places: this.context.placesFor(row.placeId ? [row.placeId] : []),
      quantities: row.quantityIds.map(id => context.quantities.find(item => item.id === id)).map(item => ({ id: item.id, description: item.description,
        quantity: item.quantity, unit: item.unit, sourceReference: item.sourceReference, sheetStatus: item.sheetStatus })) }));
    return { jobId, baseline: baseline ? { id: baseline.id, hash: baseline.snapshotHash, version: baseline.versionNumber, lines: baseline.snapshot.lines } : null,
      pendingBaselines: baselines.filter(row => row.status === 'pending_approval').map(row => ({ id: row.id, hash: row.snapshotHash })), packages };
  }
  normalizeAllocations(input, basis) {
    if (!basis.baseline || basis.pendingBaselines.length) fail('Behandel eerst de productiegrondslag en openstaande herziening.', 409);
    if (!Array.isArray(input) || !input.length || input.length > 1000) fail('Verdeel de productiegrondslag over maximaal duizend werkpakketregels.');
    const keys = new Set();
    const allocations = input.map(item => {
      const lineKey = text(item?.lineKey, 'Productieregel', 100), packageId = text(item?.packageId, 'Werkpakket', 150);
      const line = basis.baseline.lines.find(row => row.lineKey === lineKey), pack = basis.packages.find(row => row.id === packageId);
      if (!line || !pack || pack.places.some(row => row.archived) || !pack.taskIds.length || pack.tasks.some(row => row.excluded)) fail('Kies een actieve productieregel en een werkpakket met geldige werkzaamheden.', 409);
      const key = `${lineKey}:${packageId}`;
      if (keys.has(key)) fail('Combineer dubbele regels voor hetzelfde werkpakket.');
      keys.add(key);
      return { lineKey, packageId, plannedQuantity: quantity(units(item.plannedQuantity)) };
    }).sort((a, b) => a.lineKey.localeCompare(b.lineKey) || a.packageId.localeCompare(b.packageId));
    for (const line of basis.baseline.lines) {
      if (sum(allocations.filter(row => row.lineKey === line.lineKey).map(row => row.plannedQuantity)) !== units(line.plannedQuantity)) fail(`Verdeel precies ${line.plannedQuantity} ${line.unit} voor ${line.description}.`);
    }
    return allocations;
  }
  plan(row, basis) {
    const snapshot = retained(row);
    if (!approvalMatches(row, this.db.prepare('SELECT * FROM approvals WHERE id = ?').get(row.approval_id))) fail('De werkverdeling heeft een ongeldige beoordelingsketen.', 409);
    return { id: row.id, status: row.status, sequence: Number(row.sequence_number), approvalId: row.approval_id,
      ...snapshot, sourceCurrent: snapshot.basisHash === digest(basis), createdAt: row.created_at, resolvedAt: row.resolved_at };
  }
  execution(jobId, basis) {
    const baselineCache = new Map(), deliveryCache = new Map();
    return this.db.prepare('SELECT * FROM production_entries WHERE job_id = ? ORDER BY id').all(jobId).map(row => {
      const entry = this.ledger.mapProductionEntry(row);
      if (!baselineCache.has(entry.baselineId)) baselineCache.set(entry.baselineId, this.baseline(entry.baselineId));
      const baseline = baselineCache.get(entry.baselineId), originalLine = baseline.snapshot.lines.find(line => line.lineKey === entry.lineKey);
      const currentLine = basis.baseline?.lines.find(line => line.lineKey === entry.lineKey);
      const fingerprint = digest({ baselineId: entry.baselineId, lineKey: entry.lineKey, workDate: entry.workDate,
        quantity: entry.quantity, crewHours: entry.crewHours, note: entry.note, evidenceDocumentIds: entry.evidenceDocumentIds });
      if (baseline.jobId !== jobId || !originalLine || fingerprint !== entry.entryFingerprint || !['recorded', 'pending_reversal', 'reversed'].includes(entry.status)) fail('Een productiemeting heeft een ongeldige bron of controlesom.', 409);
      units(entry.quantity);
      const allocation = this.db.prepare('SELECT work_deliveries.* FROM work_delivery_production JOIN work_deliveries ON work_deliveries.id = work_delivery_production.delivery_id WHERE entry_id = ? AND released = 0').get(entry.id);
      let allocationCurrent = false;
      if (allocation) {
        if (allocation.job_id !== jobId) fail('Productietoerekening verwijst naar een andere opdracht.', 409);
        if (!deliveryCache.has(allocation.id)) {
          const snapshot = retained(allocation);
          const pending = this.db.prepare("SELECT id FROM work_delivery_decisions WHERE delivery_id = ? AND kind = 'void' AND status = 'pending'").get(allocation.id);
          let physical;
          try { physical = this.delivery.physical(jobId, allocation.package_id, snapshot.entryIds, snapshot.taskIds); } catch (error) { if (![400, 404, 409].includes(error.statusCode)) throw error; }
          deliveryCache.set(allocation.id, Boolean(allocation.status === 'retained' && !pending && physical && digest(physical) === digest(snapshot.physical)));
        }
        allocationCurrent = deliveryCache.get(allocation.id);
      }
      return { id: entry.id, lineKey: entry.lineKey, unit: originalLine.unit, quantity: entry.quantity, status: entry.status,
        fingerprint: entry.entryFingerprint, currentUnit: Boolean(currentLine && currentLine.unit === originalLine.unit),
        deliveryId: allocation?.id || null, packageId: allocation?.package_id || null, allocationCurrent };
    });
  }
  read(jobId) {
    const basis = this.basis(jobId), history = this.rows(jobId).map(row => this.plan(row, basis));
    const active = history.find(row => row.status === 'approved'), pending = history.find(row => row.status === 'pending');
    const execution = this.execution(jobId, basis), recorded = execution.filter(row => row.status !== 'reversed');
    const context = this.context.source(jobId);
    const ready = Boolean(active?.sourceCurrent && !pending && !basis.pendingBaselines.length);
    const lines = (basis.baseline?.lines || []).map(line => {
      const entries = recorded.filter(row => row.lineKey === line.lineKey), confirmed = entries.filter(row => row.status === 'recorded' && row.currentUnit);
      const uncertain = entries.filter(row => row.status !== 'recorded' || !row.currentUnit);
      const planned = units(line.plannedQuantity), measured = sum(confirmed.map(row => row.quantity));
      const allocations = (active?.allocations || []).filter(row => row.lineKey === line.lineKey);
      const allocated = confirmed.filter(row => row.allocationCurrent && allocations.some(allocation => allocation.packageId === row.packageId));
      const unallocated = measured - sum(allocated.map(row => row.quantity));
      return { lineKey: line.lineKey, description: line.description, unit: line.unit, plannedQuantity: line.plannedQuantity,
        reportedQuantity: quantity(measured), pendingCorrectionQuantity: quantity(sum(uncertain.map(row => row.quantity))),
        unallocatedQuantity: quantity(unallocated), remainingQuantity: uncertain.length ? null : quantity(positive(planned - measured)),
        excessQuantity: quantity(positive(measured - planned)), reliableAllocation: ready && !uncertain.length && unallocated === 0n };
    });
    const packages = basis.packages.map(pack => {
      const tasks = context.tasks.filter(task => pack.taskIds.includes(task.id)).map(task => ({ id: task.id, title: task.title, status: task.status,
        excluded: task.data?.excludeFromWorkPlan === true, durationHours: task.durationHours || null }));
      const rows = (active?.allocations || []).filter(row => row.packageId === pack.id).map(allocation => {
        const line = lines.find(row => row.lineKey === allocation.lineKey), source = basis.baseline?.lines.find(row => row.lineKey === allocation.lineKey);
        const done = sum(recorded.filter(row => row.packageId === pack.id && row.lineKey === allocation.lineKey && row.status === 'recorded' && row.currentUnit && row.allocationCurrent).map(row => row.quantity));
        const remaining = positive(units(allocation.plannedQuantity) - done), excess = positive(done - units(allocation.plannedQuantity));
        const reliable = Boolean(line?.reliableAllocation && source && !excess);
        return { lineKey: allocation.lineKey, description: source?.description || allocation.lineKey, unit: source?.unit || '', plannedQuantity: allocation.plannedQuantity,
          allocatedOutputQuantity: quantity(done), remainingQuantity: reliable ? quantity(remaining) : null, excessQuantity: quantity(excess),
          remainingLaborEstimate: reliable ? Math.round(quantity(remaining) * source.plannedLaborHours / source.plannedQuantity * 10000) / 10000 : null };
      });
      const openTasks = tasks.filter(task => !task.excluded && !['completed', 'cancelled', 'canceled', 'deleted'].includes(task.status));
      const excluded = tasks.some(task => task.excluded || ['cancelled', 'canceled', 'deleted'].includes(task.status));
      const taskScopeMismatch = rows.length > 0 && rows.every(row => row.remainingQuantity !== null)
        && (rows.every(row => row.remainingQuantity === 0) ? openTasks.length > 0 : !openTasks.length);
      const state = !active ? (pending ? 'review_pending' : 'allocation_required') : !active.sourceCurrent ? 'source_changed' : pending || basis.pendingBaselines.length ? 'review_pending'
        : excluded || taskScopeMismatch || rows.some(row => row.remainingQuantity === null) ? 'reconciliation_required' : 'current';
      return { id: pack.id, code: pack.code, title: pack.title, state, taskOnly: !rows.length, taskScopeMismatch, rows, tasks,
        remainingLaborEstimate: state === 'current' && rows.length ? rows.reduce((total, row) => total + row.remainingLaborEstimate, 0) : null,
        executionHash: digest(recorded.filter(row => rows.some(line => line.lineKey === row.lineKey))),
        canOffer: state === 'current' && openTasks.length > 0 && !pack.places.some(row => row.archived), openTaskIds: openTasks.map(row => row.id) };
    });
    const unmappedEntries = recorded.filter(row => !lines.some(line => line.lineKey === row.lineKey));
    const state = !basis.baseline ? 'baseline_required' : !active ? (pending ? 'review_pending' : 'allocation_required') : !active.sourceCurrent ? 'source_changed'
      : pending || basis.pendingBaselines.length ? 'review_pending' : unmappedEntries.length || lines.some(line => !line.reliableAllocation || line.excessQuantity > 0) || packages.some(row => row.state !== 'current') ? 'reconciliation_required' : 'current';
    const sourceHash = digest({ basis, history, execution, tasks: context.tasks });
    return { format: 'contractor-work-balance/v1', jobId, enabled: history.length > 0, state, activePlanId: active?.id || null,
      planVersion: active?.sequence || null, history, packages, lines, unassignedEntries: recorded.filter(row => !row.allocationCurrent || !active?.allocations.some(item => item.packageId === row.packageId && item.lineKey === row.lineKey)),
      options: basis, sourceHash, externalCommitments: 0, scheduleFeasible: false, jobClosed: false };
  }
  field(jobId, packageIds) {
    if (!packageIds.length || !this.enabled(jobId)) return [];
    return this.read(jobId).packages.filter(row => packageIds.includes(row.id)).map(row => ({ packageId: row.id, title: row.title, state: row.state, taskOnly: row.taskOnly,
      rows: row.rows.map(({ description, unit, plannedQuantity, allocatedOutputQuantity, remainingQuantity, excessQuantity }) => ({ description, unit, plannedQuantity, allocatedOutputQuantity, remainingQuantity, excessQuantity })) }));
  }
  positionBasis(jobId, packageId) {
    if (!this.enabled(jobId)) return null;
    const view = this.read(jobId), pack = view.packages.find(row => row.id === packageId);
    if (!pack?.canOffer) fail('De werkbalans is gewijzigd, onvolledig of heeft geen open werkzaamheden. Beoordeel eerst de verdeling en productietoerekening.', 409);
    const remaining = { state: pack.state, taskOnly: pack.taskOnly, rows: pack.rows, openTaskIds: pack.openTaskIds };
    return { sourceHash: digest({ planId: view.activePlanId, remaining, executionHash: pack.executionHash }), remainingLaborEstimate: pack.remainingLaborEstimate,
      scope: pack.rows.filter(row => row.remainingQuantity > 0).map(row => `${row.description}: ${row.remainingQuantity} ${row.unit}`), taskIds: pack.openTaskIds };
  }
  command(jobId, input, actor) {
    if (!input || input.action !== 'plan' || !input.record || typeof input.record !== 'object' || Array.isArray(input.record)) fail('Ongeldige werkverdeling.');
    const entryKey = text(input.entryKey, 'Wijzigingssleutel', 150), requestHash = digest(input), id = digest({ jobId, entryKey });
    return this.ledger.transaction(() => {
      this.lock(jobId); this.ledger.requireJob(jobId);
      const prior = this.db.prepare('SELECT * FROM work_balance_commands WHERE id = ?').get(id);
      if (prior) { if (prior.request_hash !== requestHash) fail('Deze wijzigingssleutel is al voor andere gegevens gebruikt.', 409); return { ...JSON.parse(prior.response_json), replayed: true }; }
      if (this.read(jobId).sourceHash !== input.sourceHash) fail('De werkbalans is gewijzigd. Ververs en controleer opnieuw.', 409);
      if (this.rows(jobId).some(row => row.status === 'pending')) fail('Behandel eerst de openstaande werkverdeling.', 409);
      const basis = this.basis(jobId), record = input.record;
      if (record.scopeConfirmed !== true) fail('Bevestig dat de hele productiegrondslag precies eenmaal is verdeeld.');
      const allocations = this.normalizeAllocations(record.allocations, basis), planId = randomUUID(), version = this.rows(jobId).length + 1;
      const snapshot = { format: 'contractor-work-balance-plan/v1', id: planId, jobId, version, baselineId: basis.baseline.id,
        baselineHash: basis.baseline.hash, basisHash: digest(basis), scopeConfirmed: true, reference: text(record.reference, 'Afbakening en bron', 2000),
        reason: text(record.reason, 'Onderbouwing', 2000), allocations,
        scope: allocations.map(row => ({ ...row, packageCode: basis.packages.find(pack => pack.id === row.packageId).code,
          packageTitle: basis.packages.find(pack => pack.id === row.packageId).title,
          description: basis.baseline.lines.find(line => line.lineKey === row.lineKey).description, unit: basis.baseline.lines.find(line => line.lineKey === row.lineKey).unit })) };
      const approval = this.ledger.createApproval({ targetType: 'work_balance_plan', targetId: planId, jobId, approvalType: 'work_balance_plan',
        summary: `Werkverdeling beoordelen: versie ${version}`, reason: snapshot.reason, data: snapshot }, { actor });
      this.db.prepare("INSERT INTO work_balance_plans (id,job_id,sequence_number,status,approval_id,snapshot_json,snapshot_hash,created_at) VALUES (?,?,?,'pending',?,?,?,?)")
        .run(planId, jobId, version, approval.id, JSON.stringify(snapshot), digest(snapshot), this.now());
      const response = { planId, approvalId: approval.id, replayed: false, externalCommitments: 0 };
      this.db.prepare('INSERT INTO work_balance_commands (id,job_id,request_hash,response_json,created_at) VALUES (?,?,?,?,?)').run(id, jobId, requestHash, JSON.stringify(response), this.now());
      this.ledger.audit({ entityType: 'work_balance_plan', entityId: planId, jobId, action: 'request_work_allocation', actor, after: response });
      return response;
    });
  }
  prepareResolution(approval, status) {
    this.lock(approval.job_id);
    const row = this.db.prepare('SELECT * FROM work_balance_plans WHERE id = ? AND job_id = ?').get(approval.target_id, approval.job_id);
    if (!row || row.status !== 'pending' || row.approval_id !== approval.id || !approvalMatches(row, approval)) fail('De werkverdeling of beoordelingsketen is niet meer actueel.', 409);
    if (status === 'approved') {
      const basis = this.basis(approval.job_id), snapshot = retained(row);
      if (digest(basis) !== snapshot.basisHash) fail('De productiegrondslag of werkpakketten zijn gewijzigd.', 409);
      this.normalizeAllocations(snapshot.allocations, basis);
    }
  }
  resolve(approval, status) {
    const row = this.db.prepare('SELECT * FROM work_balance_plans WHERE id = ?').get(approval.target_id);
    if (!row || row.status !== 'pending' || row.approval_id !== approval.id || !['approved', 'rejected', 'cancelled'].includes(status)) fail('Deze werkverdeling is niet meer openstaand.', 409);
    if (status === 'approved') this.db.prepare("UPDATE work_balance_plans SET status = 'superseded' WHERE job_id = ? AND status = 'approved'").run(row.job_id);
    this.db.prepare('UPDATE work_balance_plans SET status = ?, resolved_at = ? WHERE id = ?').run(status, this.now(), row.id);
    this.ledger.audit({ entityType: 'work_balance_plan', entityId: row.id, jobId: row.job_id, action: `work_allocation_${status}`,
      actor: approval.resolved_by, after: { status, externalCommitments: 0 } });
  }
  exportRecords() { return Object.fromEntries(TABLES.map(table => [table, this.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map(row => ({ ...row }))])); }
}

function verifyWorkBalance(db) {
  for (const row of db.prepare('SELECT * FROM work_balance_plans ORDER BY id').all()) {
    const snapshot = retained(row);
    if (snapshot.format !== 'contractor-work-balance-plan/v1' || snapshot.id !== row.id || snapshot.jobId !== row.job_id || snapshot.version !== Number(row.sequence_number)
      || !approvalMatches(row, db.prepare('SELECT * FROM approvals WHERE id = ?').get(row.approval_id))) fail('De werkverdeling heeft een ongeldige beoordelingsketen.', 409);
    const baseline = db.prepare('SELECT job_id,snapshot_hash,snapshot_json FROM production_baselines WHERE id = ?').get(snapshot.baselineId);
    if (baseline?.job_id !== row.job_id || baseline.snapshot_hash !== snapshot.baselineHash || !Array.isArray(snapshot.allocations) || !snapshot.allocations.length) fail('De werkverdeling mist de vastgelegde grondslag.', 409);
    const keys = new Set(), lines = JSON.parse(baseline.snapshot_json).lines;
    for (const allocation of snapshot.allocations) {
      const key = `${allocation.lineKey}:${allocation.packageId}`;
      if (keys.has(key) || !lines.some(line => line.lineKey === allocation.lineKey) || db.prepare('SELECT job_id FROM work_packages WHERE id = ?').get(allocation.packageId)?.job_id !== row.job_id) fail('De werkverdeling heeft een ongeldige werkpakketkoppeling.', 409);
      keys.add(key); units(allocation.plannedQuantity);
    }
    for (const line of lines) if (sum(snapshot.allocations.filter(row => row.lineKey === line.lineKey).map(row => row.plannedQuantity)) !== units(line.plannedQuantity)) fail('De werkverdeling bewaart niet de totale hoeveelheid.', 409);
  }
  return true;
}

module.exports = { WorkBalance, migrateWorkBalance, verifyWorkBalance, TABLES, COLUMNS };
