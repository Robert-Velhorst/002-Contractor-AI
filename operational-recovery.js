const crypto = require('node:crypto');
const { stableJson } = require('./backup-manifest');
const { ClientConversation, hash: hashConversationSource } = require('./client-conversation');

const TABLES = ['operational_recovery_cases', 'operational_recovery_commands'];
const COLUMNS = {
  operational_recovery_cases: ['job_id', 'status', 'source_hash', 'snapshot_json', 'snapshot_hash'],
  operational_recovery_commands: ['job_id', 'request_hash', 'response_json']
};
const digest = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : stableJson(value)).digest('hex');
const fail = (code, message, statusCode = 400) => { throw Object.assign(new Error(message), { code, statusCode }); };
const clean = (value, label, max = 500) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max || [...value].some(char => char.charCodeAt(0) < 32 && !'\t\r\n'.includes(char))) fail('operational_recovery_input_invalid', `${label} ontbreekt of is ongeldig.`);
  return value.trim();
};
const decode = row => {
  let snapshot;
  try { snapshot = JSON.parse(row.snapshot_json); } catch { fail('operational_recovery_integrity_failed', 'De herstelcasus kan niet betrouwbaar worden gelezen.', 409); }
  if (digest(snapshot) !== row.snapshot_hash) fail('operational_recovery_integrity_failed', 'De controlesom van de herstelcasus klopt niet.', 409);
  return snapshot;
};
function retainedSource(source) {
  let impact = source.impact;
  if (source.type === 'quality_nonconformance') {
    impact = {
      dueAt: impact?.dueAt || null,
      integrityValid: impact?.integrityValid === true,
      correctionIntegrityValid: impact?.correctionIntegrityValid === true,
      closureIntegrityValid: impact?.closureIntegrityValid === true,
      correctiveActionRecorded: impact?.correctiveActionRecorded === true
    };
  } else if (source.type === 'worker_availability') {
    impact = { activeConflict: true, schedule: { ready: impact?.schedule?.ready === true, status: impact?.schedule?.status || null,
      reason: impact?.schedule?.reason || null, materialBlockers: (impact?.schedule?.materialBlockers || []).slice(0, 100) },
    affectedScheduleTasks: (impact?.affectedScheduleTasks || []).slice(0, 100), materialShortfalls: (impact?.materialShortfalls || []).slice(0, 100),
    clientAppointmentsComplete: impact?.clientAppointmentsComplete === true,
    clientDateCommitments: (impact?.clientDateCommitments || []).slice(0, 100),
    scheduleProjection: impact?.scheduleProjection || null,
    clientAppointments: (impact?.clientAppointments || []).slice(0, 250).map(appointment => ({ id: appointment.id, jobId: appointment.jobId,
      jobTitle: appointment.jobTitle, visitType: appointment.visitType, status: appointment.status, scheduledAt: appointment.scheduledAt,
      assignee: appointment.assignee, approvalId: appointment.approvalId, sourceFingerprint: appointment.sourceFingerprint })),
    crossJobConflictListComplete: impact?.crossJobConflictListComplete === true,
    replacementPlan: impact?.replacementPlan || null,
    crossJobConflicts: (impact?.crossJobConflicts || []).slice(0, 250).map(conflict => ({
      assignmentId: conflict.assignmentId, jobId: conflict.jobId, jobTitle: conflict.jobTitle,
      scheduledStart: conflict.scheduledStart, scheduledEnd: conflict.scheduledEnd,
      replacementCandidates: (conflict.replacementCandidates || []).slice(0, 5).map(candidate => ({
        worker: { id: candidate.worker.id, name: candidate.worker.name, role: candidate.worker.role },
        matchedSkills: (candidate.matchedSkills || []).slice(0, 20), qualificationStatus: candidate.qualificationStatus
      }))
    })) };
  } else if (source.type === 'material_receipt') {
    impact = { affectedTaskCount: impact?.affectedTaskCount || 0,
      materialLines: (impact?.materialLines || []).slice(0, 100).map(line => ({ materialRequirementId: line.materialRequirementId, itemName: line.itemName,
        unit: line.unit, acceptedThisDelivery: line.acceptedThisDelivery, acceptedToDate: line.acceptedToDate,
        requiredQuantity: line.requiredQuantity, shortfallQuantity: line.shortfallQuantity, undeliveredOrderQuantity: line.undeliveredOrderQuantity,
        affectedTasks: (line.affectedTasks || []).slice(0, 100) })), clientDateCommitments: (impact?.clientDateCommitments || []).slice(0, 100),
      scheduleProjection: impact?.scheduleProjection || null,
      schedule: { status: impact?.schedule?.status || 'unavailable', reason: impact?.schedule?.reason || null,
        blockers: (impact?.schedule?.blockers || []).slice(0, 100) }, purchaseOrder: impact?.purchaseOrder || null };
  } else if (source.type === 'material_requirement_shortfall') {
    const materialLines = (impact?.materialLines || []).slice(0, 100).map(line => ({
      materialRequirementId: line.materialRequirementId, itemName: line.itemName, unit: line.unit,
      acceptedToDate: line.acceptedToDate, requiredQuantity: line.requiredQuantity,
      shortfallQuantity: line.shortfallQuantity, undeliveredOrderQuantity: line.undeliveredOrderQuantity,
      warehouseMaterialId: line.warehouseMaterialId || null,
      warehouseAvailableQuantity: Number(line.warehouseAvailableQuantity) || 0,
      warehouseUnitMatches: line.warehouseUnitMatches === true,
      warehouseInTransitQuantity: Number(line.warehouseInTransitQuantity) || 0,
      pendingInspectionQuantity: Number(line.pendingInspectionQuantity) || 0,
      siteDamagedQuantity: Number(line.siteDamagedQuantity) || 0,
      discrepancyReceipts: (line.discrepancyReceipts || []).slice(0, 50).map(receipt => ({
        receiptReference: receipt.receiptReference, evidenceReference: receipt.evidenceReference,
        receivedAt: receipt.receivedAt, pendingInspectionQuantity: Number(receipt.pendingInspectionQuantity) || 0,
        damagedQuantity: Number(receipt.damagedQuantity) || 0,
        reviews: (receipt.reviews || []).slice(0, 50).map(review => ({ acceptedQuantity: Number(review.acceptedQuantity) || 0,
          damagedQuantity: Number(review.damagedQuantity) || 0, reviewReference: review.reviewReference,
          evidenceReference: review.evidenceReference, reviewedAt: review.reviewedAt }))
      })),
      neededBy: line.neededBy || null, supplier: line.supplier || null,
      affectedTasks: (line.affectedTasks || []).slice(0, 100).map(task => ({ id: task.id, title: task.title, status: task.status }))
    }));
    impact = { materialLines, materialShortfalls: materialLines, purchaseOrder: impact?.purchaseOrder || null,
      purchaseOrders: (impact?.purchaseOrders || []).slice(0, 100), schedule: { status: impact?.schedule?.status || 'unavailable' },
      scheduleProjection: impact?.scheduleProjection || null, clientDateCommitments: (impact?.clientDateCommitments || []).slice(0, 100) };
  } else if (source.type === 'equipment_unavailable') {
    impact = { unresolved: impact?.unresolved === true, toolId: impact?.toolId || null, toolName: impact?.toolName || null,
      toolStatus: impact?.toolStatus || null, inspectionStatus: impact?.inspectionStatus || null,
      inspectionBlocksReservation: impact?.inspectionBlocksReservation === true, retirementApprovalId: impact?.retirementApprovalId || null,
      fieldSafetyHold: impact?.fieldSafetyHold ? { id: impact.fieldSafetyHold.id, status: impact.fieldSafetyHold.status,
        issueType: impact.fieldSafetyHold.issueType, note: impact.fieldSafetyHold.note, taskId: impact.fieldSafetyHold.taskId,
        workerId: impact.fieldSafetyHold.workerId, reportedAt: impact.fieldSafetyHold.reportedAt,
        custodySessionId: impact.fieldSafetyHold.custodySessionId } : null,
      reservationId: impact?.reservationId || null, reservationStatus: impact?.reservationStatus || null,
      neededFrom: impact?.neededFrom || null, neededUntil: impact?.neededUntil || null,
      affectedReservationCount: Number(impact?.affectedReservationCount) || 0,
      affectedReservationListComplete: impact?.affectedReservationListComplete === true,
      affectedReservations: (impact?.affectedReservations || []).slice(0, 500).map(reservation => ({
        reservationId: reservation.reservationId, jobId: reservation.jobId, jobTitle: reservation.jobTitle,
        status: reservation.status, neededFrom: reservation.neededFrom || null, neededUntil: reservation.neededUntil || null,
        taskId: reservation.taskId || null
      })),
      replacementCandidateListComplete: impact?.replacementCandidateListComplete === true,
      replacementWindowKnown: impact?.replacementWindowKnown === true,
      replacementCompatibilityVerified: false,
      replacementAssessment: { categoryMatch: impact?.replacementAssessment?.categoryMatch || null,
        compatibilityVerified: false, requiresHumanFitCheck: true },
      replacementCandidates: (impact?.replacementCandidates || []).slice(0, 100).map(candidate => ({
        toolId: candidate.toolId, name: candidate.name, category: candidate.category,
        currentLocation: candidate.currentLocation || null, inspectionStatus: candidate.inspectionStatus || null,
        windowAvailable: candidate.windowAvailable === true
      })),
      taskId: impact?.taskId || null, affectedScheduleTasks: (impact?.affectedScheduleTasks || []).slice(0, 100),
      clientDateCommitments: (impact?.clientDateCommitments || []).slice(0, 100), scheduleProjection: impact?.scheduleProjection || null };
  }
  return { type: source.type, id: source.id, workerId: source.workerId || null, title: source.title, status: source.status, severity: source.severity || null, impact,
    sourceFingerprint: source.sourceFingerprint };
}

function portfolioSourceSummary(source) {
  const impact = source.impact || {};
  const schedule = impact.scheduleProjection;
  const quantity = value => value == null || value === '' ? null : Number.isFinite(Number(value)) ? Number(value) : null;
  const materialLines = (impact.materialLines || []).slice(0, 40).map(line => ({
    itemName: String(line.itemName || 'Materiaal').slice(0, 120),
    unit: String(line.unit || '').slice(0, 30),
    shortfallQuantity: quantity(line.shortfallQuantity),
    warehouseMaterialId: line.warehouseMaterialId || null,
    warehouseAvailableQuantity: quantity(line.warehouseAvailableQuantity) ?? 0,
    warehouseUnitMatches: line.warehouseUnitMatches === true,
    warehouseInTransitQuantity: quantity(line.warehouseInTransitQuantity) ?? 0,
    pendingInspectionQuantity: quantity(line.pendingInspectionQuantity) ?? 0,
    siteDamagedQuantity: quantity(line.siteDamagedQuantity) ?? 0,
    discrepancyReceipts: (line.discrepancyReceipts || []).slice(0, 30).map(receipt => ({
      receiptReference: String(receipt.receiptReference || '').slice(0, 240),
      evidenceReference: String(receipt.evidenceReference || '').slice(0, 500),
      receivedAt: receipt.receivedAt || null,
      pendingInspectionQuantity: quantity(receipt.pendingInspectionQuantity) ?? 0,
      damagedQuantity: quantity(receipt.damagedQuantity) ?? 0,
      reviews: (receipt.reviews || []).slice(0, 30).map(review => ({
        acceptedQuantity: quantity(review.acceptedQuantity) ?? 0,
        damagedQuantity: quantity(review.damagedQuantity) ?? 0,
        reviewReference: String(review.reviewReference || '').slice(0, 240),
        evidenceReference: String(review.evidenceReference || '').slice(0, 500),
        reviewedAt: review.reviewedAt || null
      }))
    })),
    acceptedToDate: quantity(line.acceptedToDate),
    requiredQuantity: quantity(line.requiredQuantity),
    neededBy: line.neededBy || null,
    affectedTaskCount: Array.isArray(line.affectedTasks) ? line.affectedTasks.length : 0
  }));
  const workerName = source.type === 'worker_availability' && typeof source.title === 'string'
    ? source.title.split(':', 1)[0].trim().slice(0, 120) : '';
  const safeTitles = {
    worker_availability: workerName ? `${workerName}: uitvoerder niet beschikbaar` : 'Uitvoerder niet beschikbaar',
    field_progress_blocker: 'Blokkade gemeld door uitvoerende',
    material_receipt: 'Afwijking bij materiaallevering',
    material_requirement_shortfall: 'Materiaaltekort',
    safety_incident: 'Veiligheidsmelding',
    quality_nonconformance: 'Kwaliteitsafwijking',
  equipment_unavailable: impact.toolName ? `${String(impact.toolName).slice(0, 120)}: materieel niet inzetbaar` : 'Materieel niet inzetbaar'
  };
  return {
    type: source.type,
    id: source.id,
    title: safeTitles[source.type] || 'Operationele verstoring',
    status: source.status,
    severity: ['safety_incident', 'quality_nonconformance'].includes(source.type)
      && ['low', 'medium', 'high', 'critical'].includes(source.severity) ? source.severity : null,
    operationalImpact: {
      materialLines,
      affectedTaskCount: quantity(schedule?.affectedTaskCount) ?? quantity(impact.affectedTaskCount),
      criticalTaskCount: quantity(schedule?.criticalTaskCount),
      schedulePathStatus: schedule?.pathStatus || null,
      baselineStatus: schedule?.baselineStatus || null,
      impactedCommitmentCount: (schedule?.contractComparisons || []).filter(item => item.relation === 'baseline_after_date').length,
      crossJobConflictCount: (impact.crossJobConflicts || []).length,
      crossJobConflictListComplete: impact.crossJobConflictListComplete !== false,
      clientAppointmentCount: (impact.clientAppointments || []).length,
      clientAppointmentsComplete: impact.clientAppointmentsComplete !== false,
      earliestImpactAt: [...(impact.crossJobConflicts || []).map(item => item.scheduledStart),
        ...(impact.clientAppointments || []).map(item => item.scheduledAt),
        ...(impact.clientDateCommitments || []).filter(item => item.status === 'active').map(item => item.date),
        ...materialLines.map(item => item.neededBy)]
        .filter(value => value && Number.isFinite(Date.parse(value))).sort((a, b) => Date.parse(a) - Date.parse(b))[0] || null,
      safetyReviewRequired: source.type === 'safety_incident',
      qualityReviewRequired: source.type === 'quality_nonconformance',
      qualityDueAt: source.type === 'quality_nonconformance' ? impact.dueAt || null : null,
      qualityIntegrityValid: source.type === 'quality_nonconformance' ? impact.integrityValid === true : null,
      qualityCorrectionIntegrityValid: source.type === 'quality_nonconformance' ? impact.correctionIntegrityValid === true : null,
      qualityClosureIntegrityValid: source.type === 'quality_nonconformance' ? impact.closureIntegrityValid === true : null,
      qualityCorrectiveActionRecorded: source.type === 'quality_nonconformance' ? impact.correctiveActionRecorded === true : null,
      progressPercent: quantity(impact.progressPercent),
      blockerCount: Array.isArray(impact.blockers) ? impact.blockers.length : null,
      equipment: source.type === 'equipment_unavailable' ? {
        name: String(impact.toolName || '').slice(0, 120),
        status: impact.toolStatus || null,
        inspectionStatus: impact.inspectionStatus || null,
        fieldSafetyHoldOpen: impact.fieldSafetyHold?.status === 'open',
        fieldSafetyIssueType: impact.fieldSafetyHold?.status === 'open' ? impact.fieldSafetyHold.issueType : null,
        neededFrom: impact.neededFrom || null,
        neededUntil: impact.neededUntil || null,
        affectedReservationCount: Number(impact.affectedReservationCount) || 0,
        affectedReservationListComplete: impact.affectedReservationListComplete === true,
        replacementCandidateCount: (impact.replacementCandidates || []).length,
        replacementCandidateListComplete: impact.replacementCandidateListComplete === true,
        replacementCompatibilityVerified: false,
        inspectionBlocksReservation: impact.inspectionBlocksReservation === true
      } : null
    }
  };
}

function triageOperationalSources(sources = [], nowMs = Date.now()) {
  const impacts = sources.map(source => ({ source, impact: source.operationalImpact || {} }));
  const immediate = impacts.find(({ source, impact }) => impact.safetyReviewRequired
    || source.type === 'quality_nonconformance' && source.severity === 'critical'
    || impact.schedulePathStatus === 'critical_path_affected');
  if (immediate) return { priority: 'immediate', action: immediate.impact.safetyReviewRequired ? 'safety_review'
    : immediate.source.type === 'quality_nonconformance' ? 'quality_review' : 'protect_critical_path' };

  const sameDay = impacts.find(({ source, impact }) => {
    const nextImpactAt = Date.parse(impact.earliestImpactAt || '');
    const imminent = Number.isFinite(nextImpactAt) && nextImpactAt <= nowMs + 2 * 86_400_000;
    const imminentMaterial = (impact.materialLines || []).some(line => Number(line.shortfallQuantity) > 0
      && Number.isFinite(Date.parse(line.neededBy || '')) && Date.parse(line.neededBy) <= nowMs + 2 * 86_400_000);
    return (imminent && (impact.crossJobConflictCount > 0 || impact.clientAppointmentCount > 0 || impact.impactedCommitmentCount > 0))
      || imminentMaterial || source.type === 'quality_nonconformance' && source.severity === 'high';
  });
  if (sameDay) return { priority: 'today', action: sameDay.impact.crossJobConflictCount > 0 ? 'confirm_workforce_coverage'
    : sameDay.impact.clientAppointmentCount > 0 ? 'review_client_appointments'
      : sameDay.impact.impactedCommitmentCount > 0 ? 'review_contract_dates'
        : sameDay.source.type === 'quality_nonconformance' ? 'quality_review' : 'secure_material' };

  const planned = impacts.find(({ source, impact }) => impact.crossJobConflictCount > 0 || impact.clientAppointmentCount > 0
    || impact.impactedCommitmentCount > 0 || source.type === 'quality_nonconformance' && source.severity === 'high'
    || source.type === 'material_requirement_shortfall'
    || (impact.materialLines || []).some(line => Number(line.pendingInspectionQuantity) > 0)
    || source.type === 'material_receipt' && (impact.materialLines || []).some(line => Number(line.shortfallQuantity) > 0)
    || impact.blockerCount > 0 || impact.equipment?.inspectionBlocksReservation || source.type === 'equipment_unavailable');
  if (planned) return { priority: 'plan', action: planned.impact.crossJobConflictCount > 0 ? 'confirm_workforce_coverage'
    : planned.impact.clientAppointmentCount > 0 ? 'review_client_appointments'
    : planned.impact.impactedCommitmentCount > 0 ? 'review_contract_dates'
        : (planned.impact.materialLines || []).some(line => Number(line.pendingInspectionQuantity) > 0) ? 'review_material_receipt'
        : planned.impact.blockerCount > 0 ? 'coordinate_field_recovery'
          : planned.impact.equipment || planned.source.type === 'equipment_unavailable' ? 'check_equipment' : 'secure_material' };
  return { priority: 'review', action: 'verify_source' };
}

function operationalRecoveryFollowUpActions(ledger, { jobIds = null, horizonDays = 7, limit = 10000 } = {}) {
  const allowedJobs = jobIds?.length ? new Set(jobIds) : null;
  const nowMs = Date.parse(typeof ledger.clock === 'function' ? ledger.clock().toISOString() : new Date().toISOString());
  const horizonMs = nowMs + Math.max(1, Math.min(30, Number(horizonDays) || 7)) * 86_400_000;
  const rows = ledger.db.prepare(`SELECT cases.id, cases.job_id, jobs.title AS job_title, cases.status,
      cases.snapshot_json, cases.snapshot_hash
    FROM operational_recovery_cases cases
    JOIN jobs ON jobs.id = cases.job_id
    WHERE cases.status IN ('open','monitoring')
      AND jobs.status NOT IN ('archived','cancelled','completed','deleted','void')
    ORDER BY cases.updated_at ASC, cases.id ASC
    LIMIT ?`).all(Math.max(1, Math.min(10000, Number(limit) || 10000)));
  const actions = [];
  for (const row of rows) {
    if (!['open', 'monitoring'].includes(row.status)) continue;
    if (allowedJobs && !allowedJobs.has(row.job_id)) continue;
    let snapshot;
    try { snapshot = JSON.parse(row.snapshot_json); } catch { snapshot = null; }
    if (!snapshot || digest(snapshot) !== row.snapshot_hash) {
      actions.push({ id: `recovery_integrity_${row.id}`, stream: 'operations', actionType: 'review_operational_recovery',
        jobId: row.job_id, jobTitle: row.job_title, source: 'operational_recovery', sourceId: row.id,
        severity: 'critical', requiresApproval: false, safeDraftable: false, blocked: true,
        message: 'A recovery record failed its integrity check. Review the retained case before relying on its contents.',
        data: { recoveryCaseId: row.id, integrityFailure: true, followUpType: 'integrity' } });
      continue;
    }
    const dueItems = [{ type: 'recovery_case', id: 'case', dueAt: snapshot.dueAt }];
    const latestBy = (items, key) => {
      const latest = new Map();
      for (const item of items || []) {
        const identifier = key(item);
        if (!identifier) continue;
        const current = latest.get(identifier);
        if (!current || String(item.recordedAt || '').localeCompare(String(current.recordedAt || '')) > 0) latest.set(identifier, item);
      }
      return [...latest.values()];
    };
    for (const item of latestBy(snapshot.supplierFollowUps, followUp => `${followUp.sourceType || 'material_receipt'}:${followUp.sourceId || followUp.materialReceiptId || ''}`)) {
      if (item.status === 'no_response') dueItems.push({ type: 'supplier_response', id: item.id, dueAt: item.nextFollowUpAt });
      if (item.status === 'delivery_date_confirmed') dueItems.push({ type: 'supplier_delivery', id: item.id, dueAt: item.expectedAt });
    }
    for (const item of latestBy(snapshot.clientImpactReviews,
      review => review.sourceId && review.appointment?.id ? `${review.sourceId}:${review.appointment.id}` : null)) {
      if (item.status === 'awaiting_customer') dueItems.push({ type: 'client_response', id: item.id, dueAt: item.nextFollowUpAt });
    }
    for (const item of latestBy(snapshot.clientDateImpactReviews, review => review.commitmentEntryKey)) {
      if (item.status && item.status !== 'not_impacted') dueItems.push({ type: 'contract_review', id: item.id, dueAt: item.nextFollowUpAt });
    }
    const latestCostReview = latestBy(snapshot.costImpactReviews, () => 'recovery_case')[0];
    if (latestCostReview?.status === 'unknown') dueItems.push({ type: 'cost_review', id: latestCostReview.id, dueAt: latestCostReview.nextFollowUpAt });
    for (const item of dueItems) {
      const dueAtMs = Date.parse(String(item.dueAt || ''));
      if (!Number.isFinite(dueAtMs) || dueAtMs > horizonMs) continue;
      const dueAt = new Date(dueAtMs).toISOString();
      const overdue = dueAtMs <= nowMs;
      actions.push({ id: `recovery_follow_up_${digest([row.id, item.type, item.id, dueAt]).slice(0, 32)}`,
        stream: 'operations', actionType: 'review_operational_recovery', jobId: row.job_id, jobTitle: row.job_title,
        source: 'operational_recovery', sourceId: row.id, severity: overdue ? 'high' : 'medium',
        requiresApproval: false, safeDraftable: false, blocked: false,
        message: 'An owned operational recovery follow-up is due. Review current source evidence before acting.',
        data: { recoveryCaseId: row.id, followUpId: item.id, followUpType: item.type, dueAt,
          owner: snapshot.owner || null, overdue } });
    }
  }
  return actions;
}

function migrateOperationalRecovery(db) {
  db.exec(`
    CREATE TABLE operational_recovery_cases (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), status TEXT NOT NULL CHECK(status IN ('open','monitoring','resolved','cancelled')),
      source_hash TEXT NOT NULL, snapshot_json TEXT NOT NULL, snapshot_hash TEXT NOT NULL,
      created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, resolved_at TEXT
    );
    CREATE INDEX idx_operational_recovery_job ON operational_recovery_cases(job_id, updated_at DESC);
    CREATE TABLE operational_recovery_commands (
      id TEXT PRIMARY KEY, job_id TEXT NOT NULL REFERENCES jobs(id), request_hash TEXT NOT NULL,
      response_json TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  require('./company-authority').installAuthorityGuards(db, TABLES);
}

class OperationalRecovery {
  constructor(ledger) { this.ledger = ledger; this.db = ledger.db; this.chat = new ClientConversation(ledger); this.clientDates = new (require('./client-date-commitments').ClientDateCommitments)(ledger); }
  now() { return this.ledger.clock().toISOString(); }
  lock(jobId) { this.db.prepare('SELECT id FROM jobs WHERE id = ?').get(jobId) || fail('job_not_found', 'Opdracht niet gevonden.', 404); }

  approvedActualCosts(jobId) {
    const forecast = this.ledger.calculateCostForecast(jobId);
    const approvedExpenses = new Set(forecast.sourceBasis?.recognition?.approvedExpenseIds || []);
    const approvedInvoices = new Set(forecast.sourceBasis?.recognition?.approvedSupplierInvoiceIds || []);
    const records = [
      ...(forecast.sourceBasis?.expenses || []).filter(item => approvedExpenses.has(item.id) && item.recognition === 'approved_actual'
        && item.currency === 'EUR' && item.governedReceipt && item.integrityValid)
        .map(item => ({ type: 'expense', id: item.id, label: `Onkostendeclaratie ${item.costCode}`, amountCents: Math.round(item.amount * 100), currency: 'EUR', approvalId: item.approvalId })),
      ...(forecast.sourceBasis?.supplierInvoices || []).filter(item => approvedInvoices.has(item.id) && item.recognition === 'approved_actual' && item.currency === 'EUR')
        .map(item => ({ type: 'supplier_invoice', id: item.id, label: `Leveranciersfactuur ${item.id}`, amountCents: Math.round(item.netAmount * 100), currency: 'EUR', approvalId: item.approvalId }))
    ].filter(item => Number.isSafeInteger(item.amountCents) && item.amountCents > 0)
      .sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
    return records.map(item => ({ ...item, sourceFingerprint: digest(item) }));
  }

  actualCostAllocations(jobId) {
    const rows = this.db.prepare('SELECT snapshot_json,snapshot_hash FROM operational_recovery_cases WHERE job_id = ?').all(jobId);
    const allocated = new Map();
    for (const row of rows) {
      const snapshot = decode(row);
      const reversals = new Set((snapshot.actualCostReversals || []).map(item => item.attributionId));
      for (const item of snapshot.actualCostAttributions || []) {
        if (!reversals.has(item.id)) allocated.set(`${item.sourceType}:${item.sourceId}`,
          (allocated.get(`${item.sourceType}:${item.sourceId}`) || 0) + item.amountCents);
      }
    }
    return allocated;
  }

  supplierLeadTimeRiskIndex() {
    const suppliers = require('./supplier-performance').listSupplierDeliveryPerformance(this.db);
    return new Map(suppliers.flatMap(supplier => supplier.leadTimeRisks.map(risk => [risk.purchaseOrderId, {
      requiredBy: risk.requiredBy,
      historicalP75EquivalentCompletionAt: risk.historicalP75EquivalentCompletionAt,
      historicalLeadTimeDays: risk.historicalLeadTimeDays,
      sampleSize: risk.sampleSize
    }])));
  }

  materialReceiptImpact(receipt, supplierLeadTimeRisks = null) {
    const impact = this.ledger.materialReceiptOperationalImpact(receipt);
    const order = receipt.purchaseOrderId ? this.ledger.getPurchaseOrder(receipt.purchaseOrderId) : null;
    impact.purchaseOrder = order ? { id: order.id, supplier: order.supplier, status: order.status, requiredBy: order.requiredBy,
      tradePartnerId: order.tradePartnerId, orderIssued: order.orderIssued === true, externalCommitments: order.externalCommitments,
      issueStatus: order.issuePackage?.transportStatus || null } : null;
    const risk = order && (supplierLeadTimeRisks || this.supplierLeadTimeRiskIndex()).get(order.id);
    if (risk) impact.materialLines = (impact.materialLines || []).map(line => ({ ...line,
      supplierLeadTimeRisks: [{ supplier: order.supplier, ...risk }] }));
    return impact;
  }

  materialRequirementSource(jobId, materialRequirementId, supplierLeadTimeRisks = null) {
    const row = this.db.prepare("SELECT * FROM material_requirements WHERE id = ? AND job_id = ? AND status <> 'cancelled'")
      .get(materialRequirementId, jobId);
    if (!row) return null;
    const requirement = this.ledger.mapMaterialRequirement(row);
    const availableQuantity = Math.max(0, Number(requirement.data?.availableQuantity || 0));
    const orders = this.db.prepare("SELECT id FROM purchase_orders WHERE job_id = ? AND status NOT IN ('cancelled', 'rejected', 'void') ORDER BY id")
      .all(jobId).map(({ id }) => this.ledger.getPurchaseOrder(id))
      .filter(order => order.orderIssued === true && order.externalCommitments === 1);
    const leadTimeRisks = supplierLeadTimeRisks || (orders.length ? this.supplierLeadTimeRiskIndex() : new Map());
    const issuedLines = [];
    for (const order of orders) {
      const plan = this.ledger.materialReceiptPurchaseOrderPlan(order.id);
      for (const line of plan.lines) {
        const item = order.items?.[line.purchaseOrderLineIndex];
        const explicitId = item?.materialRequirementId || item?.material_requirement_id || null;
        if (explicitId !== requirement.id || line.materialRequirementId !== requirement.id || !(line.remainingQuantity > 0)) continue;
        issuedLines.push({ id: order.id, supplier: order.supplier || null, status: order.status, requiredBy: order.requiredBy || null,
          orderIssued: order.orderIssued === true, externalCommitments: order.externalCommitments,
          issueStatus: order.issuePackage?.transportStatus || null, remainingQuantity: Number(line.remainingQuantity),
          leadTimeRisk: leadTimeRisks.get(order.id) || null });
      }
    }
    const warehouseInTransitQuantity = Number(this.db.prepare(`SELECT COALESCE(SUM(quantity-received_quantity),0) AS quantity
      FROM shared_material_site_issues WHERE material_requirement_id=?`).get(requirement.id).quantity || 0);
    const siteReceiptRows = this.db.prepare(`SELECT receipt.receipt_reference,receipt.evidence_reference,receipt.created_at,
        receipt.id AS receipt_id,receipt.received_quantity,receipt.accepted_quantity,receipt.damaged_quantity
      FROM shared_material_site_issue_receipts receipt
      JOIN shared_material_site_issues issue ON issue.id=receipt.issue_id
      WHERE issue.material_requirement_id=?
      ORDER BY receipt.created_at,receipt.id`).all(requirement.id);
    const discrepancyReceipts = siteReceiptRows.map(receipt => {
      const reviews = this.db.prepare(`SELECT accepted_quantity,damaged_quantity,review_reference,evidence_reference,created_at
        FROM shared_material_site_issue_receipt_reviews WHERE receipt_id=? ORDER BY created_at,id`).all(receipt.receipt_id);
      const reviewedAccepted = reviews.reduce((total, review) => total + Number(review.accepted_quantity), 0);
      const reviewedDamaged = reviews.reduce((total, review) => total + Number(review.damaged_quantity), 0);
      return { receiptReference: receipt.receipt_reference, evidenceReference: receipt.evidence_reference, receivedAt: receipt.created_at,
        pendingInspectionQuantity: Math.round(Math.max(0, Number(receipt.received_quantity) - Number(receipt.accepted_quantity) - Number(receipt.damaged_quantity)
          - reviewedAccepted - reviewedDamaged) * 10000) / 10000,
        damagedQuantity: Number(receipt.damaged_quantity) + reviewedDamaged || 0,
        reviews: reviews.map(review => ({ acceptedQuantity: Number(review.accepted_quantity), damagedQuantity: Number(review.damaged_quantity),
          reviewReference: review.review_reference, evidenceReference: review.evidence_reference, reviewedAt: review.created_at })) };
    })
      .filter(receipt => receipt.pendingInspectionQuantity > 0 || receipt.damagedQuantity > 0);
    const pendingInspectionQuantity = Math.round(discrepancyReceipts.reduce((total, receipt) => total + receipt.pendingInspectionQuantity, 0) * 10000) / 10000;
    const siteDamagedQuantity = Math.round(discrepancyReceipts.reduce((total, receipt) => total + receipt.damagedQuantity, 0) * 10000) / 10000;
    const warehouseAvailability = requirement.materialId ? this.db.prepare(`SELECT material.id,material.stock_quantity,
        COALESCE(SUM(CASE WHEN allocation.status='reserved' THEN allocation.quantity-allocation.consumed_quantity ELSE 0 END),0) AS reserved_quantity,
        material.unit
      FROM materials material LEFT JOIN shared_material_allocations allocation ON allocation.material_id=material.id
      WHERE material.id=? GROUP BY material.id`).get(requirement.materialId) : null;
    const warehouseUnitMatches = warehouseAvailability
      && String(warehouseAvailability.unit).trim().toLowerCase() === String(requirement.unit).trim().toLowerCase();
    const warehouseAvailableQuantity = warehouseUnitMatches ? Math.round(Math.max(0,
      Number(warehouseAvailability.stock_quantity || 0) - Number(warehouseAvailability.reserved_quantity || 0)) * 10000) / 10000 : 0;
    const undeliveredOrderQuantity = issuedLines.reduce((total, line) => total + line.remainingQuantity, 0);
    const incomingQuantity = undeliveredOrderQuantity + warehouseInTransitQuantity;
    const shortfallQuantity = Math.round(Math.max(0, requirement.quantity - availableQuantity - incomingQuantity) * 10000) / 10000;
    const tasks = this.db.prepare("SELECT * FROM job_tasks WHERE job_id = ? AND status NOT IN ('completed', 'cancelled') ORDER BY id")
      .all(jobId).map(task => this.ledger.mapTask(task))
      .filter(task => (task.data?.materialRequirementIds || []).includes(requirement.id))
      .map(task => ({ id: task.id, title: task.title, status: task.status }));
    const materialLine = { materialRequirementId: requirement.id, itemName: requirement.name, unit: requirement.unit,
      acceptedToDate: availableQuantity, requiredQuantity: requirement.quantity,
      shortfallQuantity, undeliveredOrderQuantity, neededBy: requirement.neededBy || null,
      warehouseMaterialId: warehouseUnitMatches ? requirement.materialId : null,
      warehouseAvailableQuantity,
      warehouseUnitMatches: Boolean(warehouseUnitMatches),
      warehouseInTransitQuantity: Math.round(warehouseInTransitQuantity * 10000) / 10000,
      pendingInspectionQuantity, siteDamagedQuantity, discrepancyReceipts,
      expectedAvailableAt: requirement.data?.expectedAvailableAt || null,
      expectedAvailableAtReference: requirement.data?.expectedAvailableAtReference || null,
      supplier: requirement.supplier || issuedLines[0]?.supplier || null,
      supplierLeadTimeRisks: issuedLines.filter(line => line.leadTimeRisk).map(line => ({ supplier: line.supplier,
        requiredBy: line.requiredBy, ...line.leadTimeRisk })), affectedTasks: tasks };
    const purchaseOrder = issuedLines.length ? { ...issuedLines[0], count: issuedLines.length } : null;
    const impact = { materialLines: [materialLine], materialShortfalls: [materialLine], purchaseOrder,
      purchaseOrders: issuedLines, schedule: { status: shortfallQuantity > 0 ? 'blocked' : 'covered' } };
    return { type: 'material_requirement_shortfall', id: requirement.id, title: `Materiaalbehoefte: ${requirement.name}`,
      status: shortfallQuantity > 0 ? 'shortfall' : 'covered', impact,
      sourceFingerprint: digest({ requirement, availableQuantity, issuedLines, tasks, shortfallQuantity, warehouseMaterialId: warehouseUnitMatches ? requirement.materialId : null,
        warehouseAvailableQuantity, warehouseInTransitQuantity, pendingInspectionQuantity, siteDamagedQuantity, discrepancyReceipts }) };
  }

  equipmentReservationSource(row, requireActiveDisruption = false) {
    const reservation = this.ledger.mapToolReservation(row);
    const toolRow = row.tool_id ? this.db.prepare('SELECT * FROM tools WHERE id = ?').get(row.tool_id) : null;
    if (!toolRow) return null;
    const tool = this.ledger.mapTool(toolRow);
    const inspection = this.ledger.assessToolInspection(tool);
    const fieldSafetyHold = tool.data?.fieldSafetyHold?.status === 'open' ? tool.data.fieldSafetyHold : null;
    const retirementApproval = this.db.prepare("SELECT id FROM approvals WHERE target_type = 'tool_retirement' AND target_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1").get(tool.id);
    const activeReservation = this.ledger.activeToolReservationStatus(reservation.status);
    const equipmentReady = tool.status === 'available' && inspection.blocksReservation !== true && !retirementApproval;
    const unresolved = activeReservation && !equipmentReady || Boolean(fieldSafetyHold);
    if (requireActiveDisruption && !unresolved) return null;
    const taskId = reservation.data?.taskId || null;
    const taskRow = taskId ? this.db.prepare('SELECT * FROM job_tasks WHERE id = ? AND job_id = ?').get(taskId, reservation.jobId) : null;
    const task = taskRow ? this.ledger.mapTask(taskRow) : null;
    const affectedRows = this.db.prepare(`SELECT reservations.id, reservations.job_id, reservations.status,
        reservations.needed_from, reservations.needed_until, reservations.data_json, jobs.title AS job_title
      FROM tool_reservations AS reservations LEFT JOIN jobs ON jobs.id = reservations.job_id
      WHERE reservations.tool_id = ? AND ${this.ledger.activeToolReservationStatusSql('reservations')}
      ORDER BY reservations.needed_from, reservations.id LIMIT 501`).all(tool.id);
    const affectedReservationCount = this.db.prepare(`SELECT COUNT(*) AS count FROM tool_reservations AS reservations
      WHERE reservations.tool_id = ? AND ${this.ledger.activeToolReservationStatusSql('reservations')}`).get(tool.id).count;
    const affectedReservations = affectedRows.slice(0, 500).map(affected => ({
      reservationId: affected.id, jobId: affected.job_id, jobTitle: affected.job_title || affected.job_id,
      status: affected.status, neededFrom: affected.needed_from || null, neededUntil: affected.needed_until || null,
      taskId: this.ledger.mapToolReservation(affected).data?.taskId || null
    }));
    const replacementWindowStart = Date.parse(reservation.neededFrom || '');
    const replacementWindowEnd = Date.parse(reservation.neededUntil || '');
    const replacementWindowKnown = Number.isFinite(replacementWindowStart) && Number.isFinite(replacementWindowEnd)
      && replacementWindowEnd > replacementWindowStart;
    const candidateRows = tool.category ? this.db.prepare(`SELECT * FROM tools WHERE id <> ? AND category = ? AND status = 'available'
      ORDER BY name, id LIMIT 101`).all(tool.id, tool.category) : [];
    const replacementCandidates = [];
    if (replacementWindowKnown) for (const candidateRow of candidateRows.slice(0, 100)) {
      const candidate = this.ledger.mapTool(candidateRow);
      const candidateInspection = this.ledger.assessToolInspection(candidate);
      if (candidateInspection.reservationReady !== true || candidate.data?.fieldSafetyHold?.status === 'open') continue;
      const pendingCandidateRetirement = this.db.prepare("SELECT id FROM approvals WHERE target_type = 'tool_retirement' AND target_id = ? AND status = 'pending' ORDER BY created_at DESC LIMIT 1").get(candidate.id);
      if (pendingCandidateRetirement) continue;
      const reservations = this.ledger.toolReservationScope(candidate.id).operational;
      const conflictsOrUnknownWindows = reservations.some(other => {
        const otherStart = Date.parse(other.neededFrom || ''), otherEnd = Date.parse(other.neededUntil || '');
        if (!Number.isFinite(otherStart) || !Number.isFinite(otherEnd) || otherEnd <= otherStart) return true;
        return otherStart < replacementWindowEnd && replacementWindowStart < otherEnd;
      });
      if (conflictsOrUnknownWindows) continue;
      replacementCandidates.push({ toolId: candidate.id, name: candidate.name, category: candidate.category,
        currentLocation: candidate.currentLocation || null, inspectionStatus: candidateInspection.status, windowAvailable: true });
    }
    const impact = { unresolved, toolId: tool.id, toolName: tool.name, toolStatus: tool.status,
      inspectionStatus: inspection.status, inspectionBlocksReservation: inspection.blocksReservation === true,
      fieldSafetyHold: fieldSafetyHold ? { id: fieldSafetyHold.id, status: fieldSafetyHold.status, issueType: fieldSafetyHold.issueType,
        note: fieldSafetyHold.note, taskId: fieldSafetyHold.taskId, workerId: fieldSafetyHold.workerId,
        reportedAt: fieldSafetyHold.reportedAt, custodySessionId: fieldSafetyHold.custodySessionId } : null,
      retirementApprovalId: retirementApproval?.id || null, reservationId: reservation.id, reservationStatus: reservation.status,
      neededFrom: reservation.neededFrom || null, neededUntil: reservation.neededUntil || null, taskId: task?.id || null,
      affectedReservationCount,
      affectedReservationListComplete: affectedReservationCount <= 500,
      affectedReservations,
      replacementWindowKnown,
      replacementCandidateListComplete: candidateRows.length <= 100,
      replacementCompatibilityVerified: false,
      replacementAssessment: { categoryMatch: tool.category || null, compatibilityVerified: false, requiresHumanFitCheck: true },
      replacementCandidates,
      affectedScheduleTasks: task ? [{ taskId: task.id, title: task.title, status: task.status }] : [] };
    return { type: 'equipment_unavailable', id: reservation.id,
      title: `${tool.name}: equipment niet inzetbaar voor gereserveerd werk`, status: reservation.status,
      impact, sourceFingerprint: digest({ reservation, tool: { id: tool.id, status: tool.status },
        inspection: { status: inspection.status, blocksReservation: inspection.blocksReservation, dueAt: inspection.dueAt,
          lastInspectionId: inspection.latestInspection?.id || null }, fieldSafetyHold,
        retirementApprovalId: retirementApproval?.id || null,
        affectedReservationCount, affectedReservations, affectedReservationListComplete: affectedReservationCount <= 500,
        replacementWindowKnown, replacementCandidates, replacementCandidateListComplete: candidateRows.length <= 100,
        task: task ? { id: task.id, status: task.status, updatedAt: task.updatedAt } : null }) };
  }

  approvedClientAppointments(period, workerName) {
    const workerNameCount = this.db.prepare('SELECT COUNT(*) AS count FROM workers WHERE name = ?').get(workerName).count;
    const personKeys = [period.workerId, workerNameCount === 1 ? workerName : period.workerId];
    const rows = this.db.prepare(`SELECT visits.id, visits.job_id, jobs.title AS job_title, visits.visit_type, visits.status,
        visits.scheduled_at, visits.assignee, visits.approval_id, approvals.status AS approval_status
      FROM site_visits visits
      JOIN jobs ON jobs.id = visits.job_id
      JOIN approvals ON approvals.id = visits.approval_id AND approvals.job_id = visits.job_id AND approvals.target_type = 'site_visit'
      WHERE visits.assignee IN (?, ?) AND visits.scheduled_at >= ? AND visits.scheduled_at <= ?
        AND visits.status IN ('confirmed','client_confirmed','committed','approved','sent') AND approvals.status = 'approved'
        AND jobs.status NOT IN ('archived','cancelled','completed')
      ORDER BY visits.scheduled_at, visits.id LIMIT 251`).all(...personKeys, period.startsAt, period.endsAt);
    const complete = rows.length <= 250;
    const messagesByJob = new Map();
    const appointments = rows.slice(0, 250).map(row => {
      const appointment = { id: row.id, jobId: row.job_id, jobTitle: row.job_title, visitType: row.visit_type, status: row.status,
        scheduledAt: row.scheduled_at, assignee: row.assignee, approvalId: row.approval_id };
      if (!messagesByJob.has(row.job_id)) messagesByJob.set(row.job_id, this.approvedClientMessages(row.job_id));
      const clientMessages = messagesByJob.get(row.job_id);
      return { ...appointment, clientMessages, sourceFingerprint: digest({ ...appointment, approvalStatus: row.approval_status, clientMessages }) };
    });
    return { appointments, complete };
  }

  approvedClientMessages(jobId) {
    const accesses = this.db.prepare(`SELECT access.id FROM client_portal_access access
      JOIN approvals ON approvals.id = access.approval_id AND approvals.job_id = access.job_id
        AND approvals.target_type = 'client_portal_access' AND approvals.target_id = access.id AND approvals.status = 'approved'
      WHERE access.job_id = ? AND access.status = 'active' ORDER BY access.id LIMIT 6`).all(jobId);
    const messages = [];
    for (const access of accesses.slice(0, 5)) {
      const page = this.chat.list(access.id, { client: true, limit: 20 });
      messages.push(...page.messages.filter(message => message.direction === 'inbound').map(message => ({
        id: message.id, accessId: access.id, sourceHash: message.sourceHash, createdAt: message.createdAt,
        excerpt: message.body.slice(0, 240), hasMore: message.body.length > 240
      })));
    }
    return messages.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)).slice(-10);
  }

  fieldProgressEvents(jobId) {
    return this.db.prepare("SELECT after_json, sequence_number FROM audit_events WHERE job_id = ? AND entity_type = 'field_work_pack' AND action IN ('retain_work_pack_progress','retain_work_pack_acknowledgment') ORDER BY sequence_number DESC LIMIT 10000")
      .all(jobId).map(row => ({ ...JSON.parse(row.after_json), sequenceNumber: row.sequence_number }))
      .filter(record => record.jobId === jobId && record.workerId
        && (record.kind === 'acknowledgment' || record.kind === 'progress' && record.progress?.id));
  }

  fieldBlockerFollowUps(progress, events) {
    const blockerEvent = events.find(record => record.progress?.id === progress.id);
    const taskId = progress.data?.taskId || null;
    const workerId = blockerEvent?.workerId || null;
    if (!taskId || !workerId) return { workerId, taskId, followUpReports: [] };
    const followUpReports = events.filter(record => record.kind === 'progress' && record.workerId === workerId && record.progress.taskId === taskId
      && record.progress.status === 'in_progress' && record.sequenceNumber > blockerEvent.sequenceNumber)
      .slice(0, 50).map(record => {
        const acknowledged = events.filter(event => event.kind === 'acknowledgment' && event.workerId === workerId
          && event.sequenceNumber > blockerEvent.sequenceNumber && event.sequenceNumber < record.sequenceNumber
          && event.sourceHash === record.sourceHash && event.snapshot?.know?.recoveryInstructions);
        return { id: record.progress.id, taskId, workerId, status: record.progress.status,
          note: record.progress.note, reportedAt: record.progress.createdAt, sourceHash: record.sourceHash,
          acknowledgedInstructionIds: [...new Set(acknowledged.flatMap(event => event.snapshot.know.recoveryInstructions
            .filter(instruction => instruction.taskId === taskId).map(instruction => instruction.id)))] };
      });
    return { workerId, taskId, followUpReports };
  }

  sources(jobId, shared = null) {
    this.lock(jobId);
    const clientDateCommitments = this.clientDates.view(jobId).commitments;
    const hasMaterialOrders = this.db.prepare("SELECT 1 FROM purchase_orders WHERE job_id = ? AND status NOT IN ('cancelled','rejected','void') LIMIT 1")
      .get(jobId);
    const supplierLeadTimeRisks = hasMaterialOrders
      ? (shared?.supplierLeadTimeRisks || shared?.loadSupplierLeadTimeRisks?.() || this.supplierLeadTimeRiskIndex())
      : new Map();
    const linkedFieldBlockers = new Set(this.db.prepare("SELECT snapshot_json, snapshot_hash FROM operational_recovery_cases WHERE job_id = ? AND status IN ('open','monitoring','resolved')")
      .all(jobId).flatMap(row => decode(row).sources || []).filter(source => source.type === 'field_progress_blocker').map(source => source.id));
    const register = shared?.availabilityRegister || this.ledger.listWorkerAvailabilityRegister({ limit: 1000 });
    const portfolioConflicts = register.conflicts;
    const localPeriods = new Map();
    for (const row of portfolioConflicts.filter(item => item.jobId === jobId)) {
      const group = localPeriods.get(row.period.id) || { period: row.period, workerName: row.workerName, localRows: [] };
      group.localRows.push(row);
      localPeriods.set(row.period.id, group);
    }
    const pendingPlans = this.db.prepare("SELECT id, target_id, data_json, created_at FROM approvals WHERE target_type = 'assignment_replacement_plan' AND status = 'pending'").all()
      .flatMap(row => {
        try { return [[JSON.parse(row.data_json).availabilityPeriodId, row]]; } catch { return []; }
      });
    const pendingPlansByPeriod = new Map(pendingPlans);
    const availability = [...localPeriods.values()].map(({ period, workerName, localRows }) => {
      const crossJobConflicts = [...new Map(portfolioConflicts.filter(row => row.period.id === period.id).map(row => [row.assignmentId, {
        assignmentId: row.assignmentId, jobId: row.jobId, jobTitle: row.jobTitle, workerId: row.workerId,
        scheduledStart: row.scheduledStart, scheduledEnd: row.scheduledEnd,
        replacementCandidates: row.replacementCandidates
      }])).values()];
      const pendingPlan = pendingPlansByPeriod.get(period.id);
      const clientAppointments = this.approvedClientAppointments(period, workerName);
      const impact = { ...localRows[0].disruptionImpact, crossJobConflicts, crossJobConflictListComplete: register.conflictListComplete === true,
        clientAppointments: clientAppointments.appointments, clientAppointmentsComplete: clientAppointments.complete,
        replacementPlan: pendingPlan ? { id: pendingPlan.id, planId: pendingPlan.target_id, status: 'pending', createdAt: pendingPlan.created_at } : null };
      const sourceFingerprint = digest({ period, conflicts: crossJobConflicts.map(({ assignmentId, jobId: affectedJobId, scheduledStart, scheduledEnd }) => ({
        assignmentId, jobId: affectedJobId, scheduledStart, scheduledEnd
      })), clientAppointments: clientAppointments.appointments.map(({ id, sourceFingerprint: appointmentFingerprint }) => ({ id, sourceFingerprint: appointmentFingerprint })),
      clientAppointmentsComplete: clientAppointments.complete });
      return { type: 'worker_availability', id: period.id, workerId: period.workerId, title: `${workerName}: ${period.title}`,
        status: period.status, impact, sourceFingerprint };
    });
    const fieldProgressEvents = this.fieldProgressEvents(jobId);
    const fieldBlockers = this.db.prepare("SELECT * FROM progress_updates WHERE job_id = ? AND status = 'blocked' ORDER BY created_at DESC LIMIT 1000")
      .all(jobId).map(row => this.ledger.mapProgress(row)).filter(progress => progress.data?.source === 'field_work_pack' && !linkedFieldBlockers.has(progress.id))
      .map(progress => {
        const followUp = this.fieldBlockerFollowUps(progress, fieldProgressEvents);
        const impact = { taskId: followUp.taskId, workerId: followUp.workerId, followUpReports: followUp.followUpReports,
          progressPercent: progress.progressPercent, note: progress.note, blockers: progress.blockers, reportedAt: progress.createdAt };
        return { type: 'field_progress_blocker', id: progress.id, title: `Blokkade gemeld ${progress.createdAt}`,
          workerId: followUp.workerId, status: progress.status, impact, sourceFingerprint: digest({ progress, followUpReports: followUp.followUpReports }) };
      });
    const receipts = this.ledger.listMaterialReceipts({ jobId, status: 'discrepancy', limit: 1000 })
      .map(row => {
        const impact = this.materialReceiptImpact(row, supplierLeadTimeRisks);
        return { type: 'material_receipt', id: row.id, title: `Levering ${row.receiptReference}`, status: row.status,
          impact, sourceFingerprint: digest({ fingerprint: row.entryFingerprint, impact }) };
      });
    const materialShortfalls = this.db.prepare("SELECT id FROM material_requirements WHERE job_id = ? AND status <> 'cancelled' ORDER BY id")
      .all(jobId).map(({ id }) => this.materialRequirementSource(jobId, id, supplierLeadTimeRisks))
      .filter(source => source?.status === 'shortfall'
        || (source?.impact?.materialLines || []).some(line => Number(line.pendingInspectionQuantity) > 0));
    const incidents = this.db.prepare("SELECT * FROM incident_records WHERE job_id = ? AND status NOT IN ('resolved','closed','cancelled') ORDER BY created_at DESC LIMIT 1000")
      .all(jobId).map(row => {
        const incident = this.ledger.mapIncident(row);
        const impact = { requiresHumanSafetyReview: true, owner: incident.responsible || null, dueAt: incident.dueAt || null };
        return { type: 'safety_incident', id: row.id, title: incident.title, status: incident.status, severity: incident.severity,
          impact, sourceFingerprint: digest({ incident, impact }) };
      });
    const qualityNonconformances = this.ledger.listNonconformances({ jobId, limit: 5000 })
      .filter(record => record.status !== 'closed' || record.integrityValid !== true
        || record.correctionIntegrityValid !== true || record.closureIntegrityValid !== true)
      .map(record => {
        const impact = { dueAt: record.dueAt || null, integrityValid: record.integrityValid === true,
          correctionIntegrityValid: record.correctionIntegrityValid === true,
          closureIntegrityValid: record.closureIntegrityValid === true,
          correctiveActionRecorded: Boolean(record.correctiveAction) };
        return { type: 'quality_nonconformance', id: record.id, title: 'Kwaliteitsafwijking', status: record.status,
          severity: ['low', 'medium', 'high', 'critical'].includes(record.severity) ? record.severity : null,
          impact, sourceFingerprint: digest({ sourceHash: record.sourceHash, snapshotHash: record.snapshotHash,
            correctiveActionHash: record.correctiveActionHash, closureHash: record.closureHash, status: record.status, impact }) };
      });
    const equipmentReservations = this.db.prepare(`SELECT reservations.* FROM tool_reservations reservations
      JOIN tools ON tools.id = reservations.tool_id
      WHERE reservations.job_id = ? AND (${this.ledger.activeToolReservationStatusSql('reservations')} OR tools.status IN ('maintenance','lost'))
      ORDER BY reservations.needed_from, reservations.id`).all(jobId)
      .map(row => this.equipmentReservationSource(row, true)).filter(Boolean);
    const scheduleControl = this.ledger.getJobDetail(jobId, { includeAudit: false, includeCapabilities: false }).scheduleControl;
    return [...availability, ...receipts, ...materialShortfalls, ...incidents, ...qualityNonconformances, ...fieldBlockers, ...equipmentReservations].map(source => {
      const scheduleProjection = this.scheduleProjection(source, scheduleControl, clientDateCommitments);
      const impact = { ...source.impact, clientDateCommitments, scheduleProjection };
      return { ...source, impact, sourceFingerprint: digest({ prior: source.sourceFingerprint, clientDateCommitments, scheduleProjection }) };
    }).sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
  }

  sourceRecord(jobId, reference, activeSources) {
    const active = activeSources.find(source => source.type === reference.type && source.id === reference.id);
    if (active) return active;
    if (reference.type === 'worker_availability') {
      const row = this.db.prepare(`SELECT periods.*, workers.name AS worker_name, workers.role AS worker_role
        FROM worker_availability_periods periods JOIN workers ON workers.id = periods.worker_id
        WHERE periods.id = ? AND workers.id IN (SELECT worker_id FROM assignments WHERE job_id = ?)`)
        .get(reference.id, jobId);
      if (!row) return null;
      const period = this.ledger.mapWorkerAvailabilityPeriod(row), appointments = this.approvedClientAppointments(period, row.worker_name);
      const impact = { activeConflict: false, schedule: { ready: true, status: 'recovered' },
        clientAppointments: appointments.appointments, clientAppointmentsComplete: appointments.complete };
      return this.decorateSource(jobId, { type: reference.type, id: period.id, workerId: period.worker_id, title: `${row.worker_name}: ${period.title}`, status: period.status,
        impact, sourceFingerprint: digest({ period, impact }) });
    }
    if (reference.type === 'material_receipt') {
      const row = this.db.prepare('SELECT id FROM material_receipts WHERE id = ? AND job_id = ?').get(reference.id, jobId);
      if (!row) return null;
      const receipt = this.ledger.getMaterialReceipt(reference.id), impact = this.materialReceiptImpact(receipt);
      return this.decorateSource(jobId, { type: reference.type, id: receipt.id, title: `Levering ${receipt.receiptReference}`, status: receipt.status,
        impact, sourceFingerprint: digest({ fingerprint: receipt.entryFingerprint, impact }) });
    }
    if (reference.type === 'material_requirement_shortfall') {
      const source = this.materialRequirementSource(jobId, reference.id);
      if (!source) return null;
      return this.decorateSource(jobId, source);
    }
    if (reference.type === 'safety_incident') {
      const row = this.db.prepare('SELECT * FROM incident_records WHERE id = ? AND job_id = ?').get(reference.id, jobId);
      if (!row) return null;
      const incident = this.ledger.mapIncident(row), impact = { requiresHumanSafetyReview: !['resolved', 'closed', 'cancelled'].includes(incident.status), owner: incident.responsible || null, dueAt: incident.dueAt || null };
      return this.decorateSource(jobId, { type: reference.type, id: row.id, title: incident.title, status: incident.status, severity: incident.severity,
        impact, sourceFingerprint: digest({ incident, impact }) });
    }
    if (reference.type === 'quality_nonconformance') {
      const record = this.ledger.getNonconformance(reference.id, { jobId });
      const impact = { dueAt: record.dueAt || null, integrityValid: record.integrityValid === true,
        correctionIntegrityValid: record.correctionIntegrityValid === true,
        closureIntegrityValid: record.closureIntegrityValid === true,
        correctiveActionRecorded: Boolean(record.correctiveAction) };
      return this.decorateSource(jobId, { type: reference.type, id: record.id, title: 'Kwaliteitsafwijking', status: record.status,
        severity: ['low', 'medium', 'high', 'critical'].includes(record.severity) ? record.severity : null,
        impact, sourceFingerprint: digest({ sourceHash: record.sourceHash, snapshotHash: record.snapshotHash,
          correctiveActionHash: record.correctiveActionHash, closureHash: record.closureHash, status: record.status, impact }) });
    }
    if (reference.type === 'field_progress_blocker') {
      const row = this.db.prepare("SELECT * FROM progress_updates WHERE id = ? AND job_id = ? AND status = 'blocked'").get(reference.id, jobId);
      if (!row) return null;
      const progress = this.ledger.mapProgress(row);
      if (progress.data?.source !== 'field_work_pack') return null;
      const followUp = this.fieldBlockerFollowUps(progress, this.fieldProgressEvents(jobId));
      const impact = { taskId: followUp.taskId, workerId: followUp.workerId, followUpReports: followUp.followUpReports,
        progressPercent: progress.progressPercent, note: progress.note, blockers: progress.blockers, reportedAt: progress.createdAt };
      return this.decorateSource(jobId, { type: reference.type, id: progress.id, title: `Blokkade gemeld ${progress.createdAt}`,
        workerId: followUp.workerId, status: progress.status, impact, sourceFingerprint: digest({ progress, followUpReports: followUp.followUpReports }) });
    }
    if (reference.type === 'equipment_unavailable') {
      const row = this.db.prepare('SELECT * FROM tool_reservations WHERE id = ? AND job_id = ?').get(reference.id, jobId);
      if (!row) return null;
      const source = this.equipmentReservationSource(row);
      return source ? this.decorateSource(jobId, source) : null;
    }
    return null;
  }

  decorateSource(jobId, source) {
    const clientDateCommitments = this.clientDates.view(jobId).commitments;
    const detail = this.ledger.getJobDetail(jobId, { includeAudit: false, includeCapabilities: false });
    const impact = { ...source.impact, clientDateCommitments,
      scheduleProjection: this.scheduleProjection(source, detail.scheduleControl, clientDateCommitments) };
    return { ...source, impact, sourceFingerprint: digest({ prior: source.sourceFingerprint, clientDateCommitments, scheduleProjection: impact.scheduleProjection }) };
  }

  scheduleProjection(source, control, commitments) {
    const activeBaseline = control?.activeBaseline;
    const baselineCurrent = control?.baselineCurrent === true && activeBaseline?.status === 'approved';
    const tasks = Array.isArray(control?.tasks) ? control.tasks : [];
    const taskIds = new Set();
    for (const task of source.impact?.affectedScheduleTasks || []) if (task.taskId) taskIds.add(task.taskId);
    for (const line of source.impact?.materialLines || []) {
      for (const task of line.affectedTasks || []) if (task.taskId || task.id) taskIds.add(task.taskId || task.id);
    }
    for (const line of source.impact?.materialShortfalls || []) {
      for (const task of line.affectedTasks || []) if (task.id) taskIds.add(task.id);
    }
    if (source.impact?.taskId) taskIds.add(source.impact.taskId);
    const affectedTasks = tasks.filter(task => taskIds.has(task.id)).map(task => ({
      taskId: task.id,
      title: task.title,
      plannedStart: task.plannedStart || null,
      plannedEnd: task.plannedEnd || null,
      critical: task.critical === true,
      totalFloatHours: Number.isFinite(task.totalFloatHours) ? task.totalFloatHours : null
    }));
    const materialReadiness = (source.impact?.materialLines || []).slice(0, 100).map(line => {
      const linkedTasks = affectedTasks.filter(task => (line.affectedTasks || []).some(link => link.id === task.taskId || link.taskId === task.taskId));
      const expectedDay = line.expectedAvailableAt && Number.isFinite(Date.parse(line.expectedAvailableAt)) ? line.expectedAvailableAt.slice(0, 10) : null;
      return {
        materialRequirementId: line.materialRequirementId,
        itemName: line.itemName,
        unit: line.unit,
        shortfallQuantity: Number(line.shortfallQuantity) || 0,
        expectedAvailableAt: line.expectedAvailableAt || null,
        evidenceReference: line.expectedAvailableAtReference || null,
        supplierLeadTimeRisks: line.supplierLeadTimeRisks || [],
        tasks: linkedTasks.map(task => {
          const plannedStartDay = baselineCurrent && task.plannedStart && Number.isFinite(Date.parse(task.plannedStart))
            ? task.plannedStart.slice(0, 10) : null;
          const status = !(Number(line.shortfallQuantity) > 0) ? 'covered'
            : !baselineCurrent ? 'not_comparable'
              : !plannedStartDay ? 'task_not_scheduled'
                : !expectedDay ? 'availability_unknown'
                  : expectedDay <= plannedStartDay ? 'expected_by_task_start' : 'expected_after_task_start';
          return { taskId: task.taskId, title: task.title, plannedStart: task.plannedStart, critical: task.critical, status };
        })
      };
    });
    const currentCommitments = (commitments || []).filter(item => item.status === 'active' && item.sourceCurrent);
    const plannedEnd = baselineCurrent ? activeBaseline.plannedEnd || control.plannedEnd || null : null;
    const plannedEndDay = plannedEnd && Number.isFinite(Date.parse(plannedEnd)) ? plannedEnd.slice(0, 10) : null;
    const contractComparisons = currentCommitments.map(commitment => {
      const relation = !baselineCurrent || !plannedEndDay ? 'not_comparable'
        : plannedEndDay <= commitment.date ? 'baseline_on_or_before_date' : 'baseline_after_date';
      return { entryKey: commitment.entryKey, label: commitment.label, date: commitment.date, relation };
    });
    return {
      baselineStatus: baselineCurrent ? 'approved_current' : activeBaseline ? 'approved_stale' : control?.pendingBaseline ? 'pending_approval' : 'missing',
      baselineId: baselineCurrent ? activeBaseline.id : null,
      baselineVersion: baselineCurrent ? activeBaseline.versionNumber : null,
      plannedEnd,
      affectedTaskCount: affectedTasks.length,
      criticalTaskCount: affectedTasks.filter(task => task.critical).length,
      pathStatus: !baselineCurrent ? 'not_comparable' : !affectedTasks.length ? 'no_linked_tasks'
        : affectedTasks.some(task => task.critical) ? 'critical_path_affected' : 'linked_noncritical_tasks',
      affectedTasks,
      materialReadiness,
      contractComparisons,
      interpretation: 'Interne planningsvergelijking; geen voorspelling van vertraging of wijziging van een contractdatum.'
    };
  }

  list(jobId) {
    this.lock(jobId);
    const current = this.sources(jobId);
    const approvedActualCosts = this.approvedActualCosts(jobId);
    const allocatedActualCosts = this.actualCostAllocations(jobId);
    const currentCommitments = current[0]?.impact?.clientDateCommitments || this.clientDates.view(jobId).commitments;
    const cases = this.db.prepare('SELECT * FROM operational_recovery_cases WHERE job_id = ? ORDER BY updated_at DESC, id').all(jobId).map(row => {
      const snapshot = decode(row);
      const selected = snapshot.sources.map(reference => this.sourceRecord(jobId, reference, current));
      const sourceCurrent = selected.every(Boolean) && digest(selected.map(({ type, id, sourceFingerprint }) => ({ type, id, sourceFingerprint }))) === row.source_hash;
      const clientDateImpactReviews = (snapshot.clientDateImpactReviews || []).map(review => ({ ...review,
        current: sourceCurrent && review.recoverySourceHash === row.source_hash
          && currentCommitments.some(commitment => commitment.entryKey === review.commitmentEntryKey && commitment.status === 'active'
            && commitment.sourceCurrent && commitment.commitmentHash === review.commitmentHash)
      }));
      const costImpactReviews = (snapshot.costImpactReviews || []).map(review => ({ ...review,
        current: sourceCurrent && review.sourceHash === row.source_hash
      }));
      const clientImpactReviews = (snapshot.clientImpactReviews || []).map(review => {
        const source = selected.find(item => item?.type === 'worker_availability' && item.id === review.sourceId);
        return { ...review, current: sourceCurrent && source?.sourceFingerprint === review.sourceFingerprint
          && source.impact?.clientAppointments?.some(appointment => appointment.id === review.appointment?.id
            && appointment.sourceFingerprint === review.appointment?.sourceFingerprint) === true };
      });
      const taskBlockers = (snapshot.sources || []).filter(source => source.type === 'field_progress_blocker' && source.impact?.taskId);
      const resolutionVerificationStatus = row.status !== 'resolved' || !taskBlockers.length ? 'not_applicable'
        : this.validResolutionReports(snapshot) ? 'worker_resumption_recorded' : 'legacy_text_only';
      const actualCostAttributions = (snapshot.actualCostAttributions || []).map(item => {
        const currentCost = approvedActualCosts.find(source => source.type === item.sourceType && source.id === item.sourceId);
        return { ...item, reversed: (snapshot.actualCostReversals || []).some(reversal => reversal.attributionId === item.id),
          sourceCurrent: currentCost?.sourceFingerprint === item.sourceFingerprint };
      });
      const result = { id: row.id, jobId: row.job_id, status: row.status, ...snapshot, clientDateImpactReviews, clientImpactReviews, costImpactReviews, actualCostAttributions,
        sources: selected.filter(Boolean), sourceHash: row.source_hash, caseHash: row.snapshot_hash, sourceCurrent,
        resolutionVerificationStatus,
        staleReason: sourceCurrent ? null : 'De bronregistratie is gewijzigd of niet meer actief; beoordeel de effecten opnieuw.',
        createdBy: row.created_by, createdAt: row.created_at, updatedAt: row.updated_at, resolvedAt: row.resolved_at };
      result.resolutionBlockers = row.status === 'resolved' ? [] : this.resolutionBlockers(result);
      return result;
    });
    const actualCostSources = approvedActualCosts.map(source => ({ ...source,
      allocatedCents: allocatedActualCosts.get(`${source.type}:${source.id}`) || 0,
      availableCents: Math.max(0, source.amountCents - (allocatedActualCosts.get(`${source.type}:${source.id}`) || 0)) }));
    return { jobId, cases, sources: current, actualCostSources,
      sourceHash: digest(current.map(({ type, id, sourceFingerprint }) => ({ type, id, sourceFingerprint }))), externalCommitments: 0 };
  }

  portfolio({ limit = 200 } = {}) {
    const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 200));
    const total = this.db.prepare(`SELECT COUNT(*) AS count FROM operational_recovery_cases cases
      JOIN jobs ON jobs.id = cases.job_id
      WHERE cases.status IN ('open', 'monitoring') AND ${this.ledger.operationalJobStatusSql('jobs')}`).get().count;
    const rows = this.db.prepare(`SELECT cases.*, jobs.title AS job_title
      FROM operational_recovery_cases cases JOIN jobs ON jobs.id = cases.job_id
      WHERE cases.status IN ('open', 'monitoring') AND ${this.ledger.operationalJobStatusSql('jobs')}
      ORDER BY cases.updated_at DESC, cases.id ASC LIMIT ?`).all(boundedLimit + 1);
    const truncated = rows.length > boundedLimit;
    rows.length = Math.min(rows.length, boundedLimit);
    const linkedSourcesByJob = new Map();
    for (const row of rows) {
      try {
        const snapshot = decode(row);
        const linked = linkedSourcesByJob.get(row.job_id) || new Set();
        for (const source of snapshot.sources || []) linked.add(`${source.type}:${source.id}`);
        linkedSourcesByJob.set(row.job_id, linked);
      } catch { /* A corrupt case must not hide its active sources from the operator. */ }
    }
    const currentByJob = new Map();
    const sourceJobs = this.db.prepare(`SELECT jobs.id, jobs.title FROM jobs
      WHERE ${this.ledger.operationalJobStatusSql('jobs')} AND (
        EXISTS (SELECT 1 FROM incident_records WHERE incident_records.job_id = jobs.id AND incident_records.status NOT IN ('resolved','closed','cancelled'))
        OR EXISTS (SELECT 1 FROM progress_updates WHERE progress_updates.job_id = jobs.id AND progress_updates.status = 'blocked')
        OR EXISTS (SELECT 1 FROM material_receipts WHERE material_receipts.job_id = jobs.id AND material_receipts.status = 'discrepancy')
        OR EXISTS (SELECT 1 FROM material_requirements WHERE material_requirements.job_id = jobs.id AND material_requirements.status <> 'cancelled')
        OR EXISTS (SELECT 1 FROM nonconformance_records WHERE nonconformance_records.job_id = jobs.id AND nonconformance_records.status <> 'closed')
        OR EXISTS (SELECT 1 FROM tool_reservations reservations WHERE reservations.job_id = jobs.id AND ${this.ledger.activeToolReservationStatusSql('reservations')})
        OR EXISTS (SELECT 1 FROM assignments assignments JOIN worker_availability_periods periods
          ON periods.worker_id = assignments.worker_id AND periods.status IN ('active','pending_cancellation')
          WHERE assignments.job_id = jobs.id AND assignments.status NOT IN ('released','cancelled','completed','closed','rejected'))
      ) ORDER BY jobs.updated_at DESC, jobs.id LIMIT 201`).all();
    const jobScanTruncated = sourceJobs.length > 200;
    sourceJobs.length = Math.min(sourceJobs.length, 200);
    const shared = { availabilityRegister: sourceJobs.length || rows.length
      ? this.ledger.listWorkerAvailabilityRegister({ limit: 1000 }) : null, supplierLeadTimeRisks: null };
    shared.loadSupplierLeadTimeRisks = () => {
      if (!shared.supplierLeadTimeRisks) shared.supplierLeadTimeRisks = this.supplierLeadTimeRiskIndex();
      return shared.supplierLeadTimeRisks;
    };
    let sourceScanErrors = 0;
    for (const job of sourceJobs) {
      try { currentByJob.set(job.id, this.sources(job.id, shared)); }
      catch { currentByJob.set(job.id, null); sourceScanErrors += 1; }
    }
    const items = rows.map(row => {
      let snapshot;
      try { snapshot = decode(row); }
      catch {
        return { id: row.id, jobId: row.job_id, jobTitle: row.job_title, status: row.status,
          updatedAt: row.updated_at, integrityValid: false, sourceCurrent: null, owner: null,
          dueAt: null, recoveryAction: null, sources: [], affectedJobs: [] };
      }
      if (!currentByJob.has(row.job_id)) {
        try { currentByJob.set(row.job_id, this.sources(row.job_id, shared)); }
        catch { currentByJob.set(row.job_id, null); }
      }
      const current = currentByJob.get(row.job_id);
      let selected = null;
      try { if (current) selected = (snapshot.sources || []).map(reference => this.sourceRecord(row.job_id, reference, current)); }
      catch { sourceScanErrors += 1; }
      const sourceCurrent = current && selected
        ? selected.every(Boolean) && digest(selected.map(({ type, id, sourceFingerprint }) => ({ type, id, sourceFingerprint }))) === row.source_hash
        : null;
      const retainedByKey = new Map((snapshot.sources || []).map(source => [`${source.type}:${source.id}`, source]));
      const sourceRows = (snapshot.sources || []).map(reference => {
        const source = current?.find(item => item.type === reference.type && item.id === reference.id)
          || retainedByKey.get(`${reference.type}:${reference.id}`);
        return portfolioSourceSummary(source || reference);
      });
      const affectedJobs = new Map();
      for (const source of selected?.filter(Boolean) || []) {
        for (const conflict of source.impact?.crossJobConflicts || []) {
          if (conflict.jobId && conflict.jobId !== row.job_id) affectedJobs.set(conflict.jobId, conflict.jobTitle || conflict.jobId);
        }
      }
      return { id: row.id, jobId: row.job_id, jobTitle: row.job_title, status: row.status,
        updatedAt: row.updated_at, integrityValid: true, sourceCurrent,
        owner: snapshot.owner || null, dueAt: snapshot.dueAt || null,
        sources: sourceRows, triage: triageOperationalSources(sourceRows), affectedJobs: [...affectedJobs].map(([id, title]) => ({ id, title })) };
    });
    const unassigned = [];
    for (const job of sourceJobs) {
      const current = currentByJob.get(job.id);
      if (!current) continue;
      const linked = linkedSourcesByJob.get(job.id) || new Set();
      for (const source of current) {
        if (linked.has(`${source.type}:${source.id}`)) continue;
        const affectedJobs = [...new Map((source.impact?.crossJobConflicts || [])
          .filter(conflict => conflict.jobId && conflict.jobId !== job.id)
          .map(conflict => [conflict.jobId, conflict.jobTitle || conflict.jobId])).entries()]
          .map(([id, title]) => ({ id, title }));
        unassigned.push({ id: `source:${job.id}:${source.type}:${source.id}`, kind: 'unassigned_source',
          jobId: job.id, jobTitle: job.title, status: 'unassigned', integrityValid: true, sourceCurrent: true,
          owner: null, dueAt: null,
          sourceType: source.type, sourceId: source.id,
          sources: [portfolioSourceSummary(source)], triage: triageOperationalSources([portfolioSourceSummary(source)]), affectedJobs });
      }
    }
    const cases = [...items, ...unassigned];
    const caseCount = items.length;
    const unassignedSourceCount = unassigned.length;
    const availabilityPeriodsComplete = !shared.availabilityRegister || shared.availabilityRegister.periods.length < 1000;
    const availabilityConflictsComplete = !shared.availabilityRegister || shared.availabilityRegister.conflictListComplete !== false;
    const coverageComplete = !truncated && !jobScanTruncated && sourceScanErrors === 0
      && availabilityPeriodsComplete && availabilityConflictsComplete;
    return { cases, total: total + unassignedSourceCount, caseCount, unassignedSourceCount,
      truncated: !coverageComplete, coverageComplete, sourceJobsScanned: sourceJobs.length,
      sourceJobsTotalAtLeast: sourceJobs.length + Number(jobScanTruncated), sourceScanErrors,
      availabilityPeriodsComplete, availabilityConflictsComplete };
  }

  validResolutionReports(snapshot) {
    const requireInstructionAcknowledgment = snapshot.resolutionProtocolVersion === 2;
    const blockers = (snapshot.sources || []).filter(source => source.type === 'field_progress_blocker' && source.impact?.taskId);
    const reports = snapshot.resolutionReports;
    return blockers.length > 0 && Array.isArray(reports) && reports.length === blockers.length && blockers.every(source => {
      const retained = reports.find(report => report.sourceId === source.id);
      const instruction = (snapshot.fieldInstructions || []).find(item => item.id === retained?.instructionId
        && item.sourceId === source.id && item.taskId === source.impact.taskId && item.workerId === source.impact.workerId);
      return Boolean(retained && (!requireInstructionAcknowledgment || instruction) && retained.taskId === source.impact.taskId && retained.workerId === source.impact.workerId
        && retained.status === 'in_progress' && source.impact.followUpReports?.some(report => report.id === retained.progressId
          && report.taskId === retained.taskId && report.workerId === retained.workerId && report.status === retained.status
          && report.sourceHash === retained.sourceHash && (!requireInstructionAcknowledgment || report.acknowledgedInstructionIds?.includes(instruction.id))));
    });
  }

  fieldInstructions(jobId, workerId, taskIds = null) {
    const allowedTasks = taskIds ? new Set(taskIds) : null;
    return this.list(jobId).cases.filter(item => ['open', 'monitoring'].includes(item.status))
      .flatMap(item => {
        const latestBySource = new Map();
        for (const instruction of item.fieldInstructions || []) {
          const source = item.sources.find(candidate => candidate.type === 'field_progress_blocker' && candidate.id === instruction.sourceId);
          if (!source || source.impact?.workerId !== workerId || source.impact?.taskId !== instruction.taskId
            || allowedTasks && !allowedTasks.has(instruction.taskId)) continue;
          const previous = latestBySource.get(instruction.sourceId);
          if (!previous || String(instruction.recordedAt).localeCompare(String(previous.recordedAt)) > 0) latestBySource.set(instruction.sourceId, instruction);
        }
        return [...latestBySource.values()];
      }).map(({ id, caseId, sourceId, taskId, text, recordedAt, recordedBy }) => ({ id, caseId, sourceId, taskId, text, recordedAt, recordedBy }));
  }

  resolutionBlockers(recoveryCase) {
    const blockers = [];
    for (const source of recoveryCase.sources || []) {
      if (source.type === 'worker_availability') {
        if (source.impact?.crossJobConflictListComplete === false) blockers.push({ sourceId: source.id, code: 'availability_list_incomplete', message: 'De volledige lijst met geraakte opdrachten kon niet worden gecontroleerd.' });
        if ((source.impact?.crossJobConflicts || []).length > 0) blockers.push({ sourceId: source.id, code: 'availability_conflicts_open', message: 'Er zijn nog ingeplande opdrachten tijdens de onbeschikbaarheid.' });
        if (source.impact?.clientAppointmentsComplete === false) blockers.push({ sourceId: source.id, code: 'client_appointments_incomplete', message: 'De volledige lijst met klantafspraken kon niet worden gecontroleerd.' });
        for (const appointment of source.impact?.clientAppointments || []) {
          const reviewed = (recoveryCase.clientImpactReviews || []).some(review => review.current && review.sourceId === source.id
            && review.appointment?.id === appointment.id && review.status === 'reviewed_unaffected');
          if (!reviewed) blockers.push({ sourceId: source.id, code: 'client_appointment_unresolved', appointmentId: appointment.id,
            message: `Klantafspraak ${appointment.visitType} heeft nog geen actuele beoordeling zonder vervolgactie.` });
        }
        for (const commitment of source.impact?.clientDateCommitments || []) {
          if (commitment.status !== 'active' || !commitment.sourceCurrent) continue;
          const reviewed = (recoveryCase.clientDateImpactReviews || []).some(review => review.current
            && review.commitmentEntryKey === commitment.entryKey && review.status === 'not_impacted');
          if (!reviewed) blockers.push({ sourceId: source.id, code: 'contract_date_unresolved', commitmentEntryKey: commitment.entryKey,
            message: `Contractuele mijlpaal '${commitment.label}' mist een actuele beoordeling zonder open risico.` });
        }
      } else if (['material_receipt', 'material_requirement_shortfall'].includes(source.type)
          && (source.impact?.materialLines || []).some(line => Number(line.shortfallQuantity) > 0)) {
        blockers.push({ sourceId: source.id, code: 'material_shortfall_open', message: 'Een of meer materiaaltekorten zijn nog niet aantoonbaar aangevuld.' });
      } else if (source.type === 'safety_incident' && !['resolved', 'closed', 'cancelled'].includes(source.status)) {
        blockers.push({ sourceId: source.id, code: 'safety_review_open', message: 'De veiligheidsmelding is nog niet via de eigen veiligheidsprocedure afgesloten.' });
      } else if (source.type === 'quality_nonconformance' && source.status !== 'closed') {
        blockers.push({ sourceId: source.id, code: 'quality_nonconformance_open', message: 'De kwaliteitsafwijking moet via de onafhankelijke kwaliteitsprocedure worden gecorrigeerd en gesloten.' });
      } else if (source.type === 'quality_nonconformance'
          && (source.impact?.integrityValid !== true || source.impact?.correctionIntegrityValid !== true || source.impact?.closureIntegrityValid !== true)) {
        blockers.push({ sourceId: source.id, code: 'quality_nonconformance_integrity_failed', message: 'De integriteit van het kwaliteitsdossier of de onafhankelijke sluiting kon niet worden bevestigd.' });
      } else if (source.type === 'equipment_unavailable' && source.impact?.unresolved === true) {
        blockers.push({ sourceId: source.id, code: 'equipment_not_ready', message: `${source.impact.toolName || 'Gereserveerd materieel'} is nog niet vrijgegeven voor de gekoppelde werkzaamheden.` });
      } else if (source.type === 'field_progress_blocker' && source.impact?.taskId) {
        const instruction = [...(recoveryCase.fieldInstructions || [])].reverse().find(item => item.sourceId === source.id
          && item.taskId === source.impact.taskId && item.workerId === source.impact.workerId);
        if (!instruction) blockers.push({ sourceId: source.id, code: 'field_instruction_missing', message: 'Leg eerst een bijgewerkte taakgebonden instructie vast voor de getroffen uitvoerder.' });
        else if (!source.impact.followUpReports?.some(report => report.status === 'in_progress'
          && report.acknowledgedInstructionIds?.includes(instruction.id))) blockers.push({ sourceId: source.id, code: 'field_instruction_ack_pending', message: 'Wacht op een hervattingsmelding nadat de uitvoerder de actuele werkpakketversie met deze instructie heeft bevestigd.' });
      }
    }
    return blockers;
  }

  resolutionReview(recoveryCase, actor, sourceHash) {
    return {
      sourceHash,
      checkedAt: this.now(),
      checkedBy: actor,
      sources: (recoveryCase.sources || []).map(source => ({
        type: source.type, id: source.id, sourceFingerprint: source.sourceFingerprint, status: source.status,
        materialShortfalls: (source.impact?.materialLines || []).filter(line => Number(line.shortfallQuantity) > 0)
          .map(line => ({ materialRequirementId: line.materialRequirementId, quantity: Number(line.shortfallQuantity) })),
        equipmentAvailability: source.type === 'equipment_unavailable' ? { reservationId: source.impact.reservationId,
          toolId: source.impact.toolId, toolStatus: source.impact.toolStatus, inspectionStatus: source.impact.inspectionStatus,
          inspectionBlocksReservation: source.impact.inspectionBlocksReservation, unresolved: source.impact.unresolved,
          taskId: source.impact.taskId } : null,
        unresolvedAssignmentIds: (source.impact?.crossJobConflicts || []).map(conflict => conflict.assignmentId),
        reviewedAppointmentIds: (recoveryCase.clientImpactReviews || []).filter(review => review.current && review.sourceId === source.id
          && review.status === 'reviewed_unaffected').map(review => review.appointment.id),
        reviewedCommitmentEntryKeys: (recoveryCase.clientDateImpactReviews || []).filter(review => review.current && review.status === 'not_impacted'
          && source.impact?.clientDateCommitments?.some(commitment => commitment.entryKey === review.commitmentEntryKey))
          .map(review => review.commitmentEntryKey)
      }))
    };
  }

  command(jobId, input, actor) {
      if (!input || !['create', 'update', 'supplier_follow_up', 'warehouse_material_issue', 'client_impact_review', 'client_date_impact_review', 'cost_impact_review', 'actual_cost_attribution', 'actual_cost_reversal', 'field_instruction'].includes(input.action)) fail('operational_recovery_action_invalid', 'Kies een herstelcasus, werk een bestaande casus bij of registreer leveranciers-, magazijn-, klant-, kosten- of uitvoerdersopvolging.');
    const entryKey = clean(input.entryKey, 'Wijzigingssleutel', 160), requestHash = digest(input), commandId = digest({ jobId, entryKey });
    return this.ledger.transaction(() => {
      this.lock(jobId);
      const prior = this.db.prepare('SELECT * FROM operational_recovery_commands WHERE id = ?').get(commandId);
      if (prior) {
        if (prior.request_hash !== requestHash) fail('operational_recovery_replay_conflict', 'Deze wijzigingssleutel is al voor andere gegevens gebruikt.', 409);
        return { ...JSON.parse(prior.response_json), replayed: true };
      }
      const view = this.list(jobId);
      const sourceByKey = new Map(view.sources.map(source => [`${source.type}:${source.id}`, source]));
      let id, status, snapshot, sourceHash, followUpId = null, clientReviewId = null, clientDateReviewId = null, costReviewId = null, fieldInstructionId = null, actualCostRecord = null;
      let materialAvailabilityUpdated = false, materialRequirementId = null, warehouseMaterialIssue = null;
      if (input.action === 'create') {
        if (input.sourceHash !== view.sourceHash) fail('operational_recovery_source_changed', 'De verstoringen zijn gewijzigd. Ververs en beoordeel opnieuw.', 409);
        if (!Array.isArray(input.sources) || !input.sources.length || input.sources.length > 20) fail('operational_recovery_sources_invalid', 'Kies een tot twintig actieve bronregistraties.');
        const selected = [...new Map(input.sources.map(source => {
          const type = clean(source?.type, 'Brontype', 40), sourceId = clean(source?.id, 'Bronregistratie', 160);
          return [`${type}:${sourceId}`, sourceByKey.get(`${type}:${sourceId}`) || fail('operational_recovery_source_invalid', 'Een gekozen bron is niet actief voor deze opdracht.', 409)];
        })).values()].sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
        status = 'open'; id = crypto.randomUUID();
        sourceHash = digest(selected.map(({ type, id: sourceId, sourceFingerprint }) => ({ type, id: sourceId, sourceFingerprint })));
        snapshot = {
          sources: selected.map(retainedSource),
          owner: clean(input.owner, 'Eigenaar', 160), dueAt: this.ledger.normalizeReservationDate(input.dueAt, 'dueAt'),
          recoveryAction: clean(input.recoveryAction, 'Herstelrichting', 1000),
          actionType: ['replace_worker', 'resequence_work', 'recover_material', 'recover_equipment', 'stop_and_review', 'review_only', 'other'].includes(input.actionType) ? input.actionType : fail('operational_recovery_action_type_invalid', 'Kies een geldige herstelrichting.'),
          customerCommitmentReview: 'required_before_any_customer_date_change', customerCommunication: 'not_sent', supplierAction: 'not_sent',
          resolutionEvidence: null, supplierFollowUps: [], externalCommitments: 0
        };
        const now = this.now();
        this.db.prepare(`INSERT INTO operational_recovery_cases (id,job_id,status,source_hash,snapshot_json,snapshot_hash,created_by,created_at,updated_at,resolved_at)
          VALUES (?,?,?, ?,?,?, ?,?,?,NULL)`).run(id, jobId, status, sourceHash, JSON.stringify(snapshot), digest(snapshot), actor, now, now);
      } else if (input.action === 'supplier_follow_up') {
        id = clean(input.caseId, 'Herstelcasus', 160);
        const row = this.db.prepare("SELECT * FROM operational_recovery_cases WHERE id = ? AND job_id = ? AND status IN ('open','monitoring')").get(id, jobId);
        if (!row) fail('operational_recovery_case_not_found', 'Open herstelcasus niet gevonden.', 404);
        const existing = view.cases.find(item => item.id === id);
        if (input.caseHash !== row.snapshot_hash || input.sourceHash !== view.sourceHash || !existing?.sourceCurrent) fail('operational_recovery_source_changed', 'Bron of herstelcasus is gewijzigd. Ververs en beoordeel opnieuw voordat je leveranciersopvolging registreert.', 409);
        const sourceId = clean(input.sourceId, 'Materiaalbron', 160);
        const source = existing.sources.find(item => ['material_receipt', 'material_requirement_shortfall'].includes(item.type) && item.id === sourceId);
        if (!source?.impact?.purchaseOrder || !source.impact.materialLines.some(line => line.shortfallQuantity > 0)) fail('operational_recovery_supplier_source_invalid', 'Leveringsbron mist een gekoppelde bestelling of actueel tekort.', 409);
        const followUpStatus = clean(input.followUpStatus, 'Opvolgstatus', 40);
        if (!['contact_recorded', 'no_response', 'delivery_date_confirmed', 'alternative_proposed'].includes(followUpStatus)) fail('operational_recovery_supplier_status_invalid', 'Kies een geldige leveranciersopvolgstatus.');
        const summary = clean(input.summary, 'Opvolgnotitie', 1000), evidenceReference = clean(input.evidenceReference, 'Bewijsreferentie', 500);
        let expectedAt = null, nextFollowUpAt = null;
        if (input.expectedAt) {
          try { expectedAt = this.ledger.normalizeReservationDate(input.expectedAt, 'expectedAt'); }
          catch { fail('operational_recovery_supplier_date_invalid', 'De door de leverancier genoemde datum is ongeldig.'); }
          if (!Number.isFinite(Date.parse(expectedAt))) fail('operational_recovery_supplier_date_invalid', 'De door de leverancier genoemde datum is ongeldig.');
        }
        if (input.nextFollowUpAt) {
          try { nextFollowUpAt = this.ledger.normalizeReservationDate(input.nextFollowUpAt, 'nextFollowUpAt'); }
          catch { fail('operational_recovery_supplier_follow_up_date_invalid', 'De volgende opvolgdatum is ongeldig.'); }
          if (!Number.isFinite(Date.parse(nextFollowUpAt)) || Date.parse(nextFollowUpAt) <= Date.parse(this.now())) fail('operational_recovery_supplier_follow_up_date_invalid', 'De volgende opvolgdatum moet in de toekomst liggen.');
        }
        if (followUpStatus === 'no_response' && !nextFollowUpAt) fail('operational_recovery_supplier_follow_up_required', 'Plan een datum om opnieuw contact op te nemen.');
        if (followUpStatus === 'delivery_date_confirmed' && !expectedAt) fail('operational_recovery_supplier_eta_required', 'Leg de door de leverancier genoemde leverdatum vast.');
        let availabilityTargetId = null;
        if (input.applyExpectedAvailability === true) {
          const candidate = clean(input.materialRequirementId, 'Materiaalbehoefte', 160);
          const linkedRequirements = [...new Set((source.impact.materialLines || [])
            .filter(line => Number(line.shortfallQuantity) > 0 && line.materialRequirementId)
            .map(line => line.materialRequirementId))];
          if (followUpStatus !== 'delivery_date_confirmed' || !linkedRequirements.includes(candidate)) {
            fail('operational_recovery_supplier_eta_scope_invalid', 'Pas een bevestigde leverdatum alleen toe op een aantoonbaar gekoppelde materiaalbehoefte met tekort.');
          }
          const order = this.ledger.getPurchaseOrder(source.impact.purchaseOrder.id);
          if (order?.orderIssued !== true || order.externalCommitments !== 1) {
            fail('operational_recovery_supplier_order_not_issued', 'Gebruik een leveranciersdatum pas als de gekoppelde bestelling aantoonbaar is uitgegeven.');
          }
          availabilityTargetId = candidate;
        }
        status = row.status; snapshot = { ...decode(row) }; sourceHash = row.source_hash;
        followUpId = crypto.randomUUID();
        snapshot.supplierFollowUps = [...(snapshot.supplierFollowUps || []), { id: followUpId, sourceType: source.type, sourceId,
          ...(source.type === 'material_receipt' ? { materialReceiptId: sourceId } : {}),
          purchaseOrderId: source.impact.purchaseOrder.id, supplier: source.impact.purchaseOrder.supplier, status: followUpStatus,
          summary, evidenceReference, expectedAt, nextFollowUpAt, appliedToMaterialAvailability: input.applyExpectedAvailability === true,
          sourceFingerprint: source.sourceFingerprint,
          recordedBy: actor, recordedAt: this.now() }].slice(-100);
        const now = this.now();
        this.db.prepare('UPDATE operational_recovery_cases SET snapshot_json = ?,snapshot_hash = ?,updated_at = ? WHERE id = ?')
          .run(JSON.stringify(snapshot), digest(snapshot), now, id);
        if (availabilityTargetId) {
          const material = this.db.prepare('SELECT * FROM material_requirements WHERE id = ? AND job_id = ?').get(availabilityTargetId, jobId);
          if (!material) fail('operational_recovery_supplier_material_missing', 'De gekoppelde materiaalbehoefte bestaat niet meer.', 409);
          let materialData = {};
          try { materialData = JSON.parse(material.data_json || '{}'); } catch { fail('operational_recovery_supplier_material_invalid', 'De materiaalprognose kan niet veilig worden bijgewerkt.', 409); }
          const confirmation = { followUpId, purchaseOrderId: source.impact.purchaseOrder.id, supplier: source.impact.purchaseOrder.supplier,
            expectedAt, evidenceReference, recoveryCaseId: id, sourceFingerprint: source.sourceFingerprint, recordedBy: actor, recordedAt: now };
          const confirmations = Array.isArray(materialData.supplierAvailabilityConfirmations) ? materialData.supplierAvailabilityConfirmations.slice(-49) : [];
          const nextMaterialData = { ...materialData, expectedAvailableAt: expectedAt, expectedAvailableAtReference: evidenceReference,
            supplierAvailabilityConfirmations: [...confirmations, confirmation] };
          this.db.prepare('UPDATE material_requirements SET data_json = ?, updated_at = ? WHERE id = ? AND job_id = ?')
            .run(JSON.stringify(nextMaterialData), now, availabilityTargetId, jobId);
          this.ledger.audit({ entityType: 'material_requirement', entityId: availabilityTargetId, jobId, action: 'record_supplier_confirmed_availability', actor,
            before: { expectedAvailableAt: materialData.expectedAvailableAt || null, expectedAvailableAtReference: materialData.expectedAvailableAtReference || null },
            after: { expectedAvailableAt: expectedAt, expectedAvailableAtReference: evidenceReference },
            metadata: { followUpId, recoveryCaseId: id, purchaseOrderId: source.impact.purchaseOrder.id, sourceFingerprint: source.sourceFingerprint,
              externalCommitments: 0 } });
          materialAvailabilityUpdated = true;
          materialRequirementId = availabilityTargetId;
        }
      } else if (input.action === 'warehouse_material_issue') {
        id = clean(input.caseId, 'Herstelcasus', 160);
        const row = this.db.prepare("SELECT * FROM operational_recovery_cases WHERE id = ? AND job_id = ? AND status IN ('open','monitoring')").get(id, jobId);
        if (!row) fail('operational_recovery_case_not_found', 'Open herstelcasus niet gevonden.', 404);
        const existing = view.cases.find(item => item.id === id);
        if (input.caseHash !== row.snapshot_hash || input.sourceHash !== view.sourceHash || !existing?.sourceCurrent) {
          fail('operational_recovery_source_changed', 'Bron of herstelcasus is gewijzigd. Ververs en beoordeel de magazijnvoorraad opnieuw.', 409);
        }
        const sourceId = clean(input.sourceId, 'Materiaalbehoefte', 160);
        const source = existing.sources.find(item => item.type === 'material_requirement_shortfall' && item.id === sourceId);
        const line = source?.impact?.materialLines?.find(item => item.materialRequirementId === sourceId);
        if (!line || !(Number(line.shortfallQuantity) > 0)) fail('operational_recovery_warehouse_source_invalid', 'Deze materiaalbehoefte heeft geen actueel tekort om naar de bouwplaats uit te geven.', 409);
        if (!line.warehouseMaterialId || line.warehouseUnitMatches !== true) fail('operational_recovery_warehouse_catalog_link_required', 'Koppel de materiaalbehoefte aan een voorraadartikel met dezelfde eenheid voordat je voorraad uitgeeft.', 409);
        const amount = Number(input.quantity);
        if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 10000) / 10000 !== amount
            || amount > Number(line.shortfallQuantity) + 0.000001) {
          fail('operational_recovery_warehouse_quantity_invalid', 'De uitgiftehoeveelheid moet positief zijn, maximaal vier decimalen hebben en binnen het actuele tekort vallen.');
        }
        if (amount > Number(line.warehouseAvailableQuantity) + 0.000001) fail('operational_recovery_warehouse_stock_changed', 'De getoonde vrije voorraad is inmiddels gewijzigd. Ververs de herstelbron en probeer opnieuw.', 409);
        const sourceReference = clean(input.sourceReference, 'Voorraadtelreferentie', 240);
        const dispatchReference = clean(input.dispatchReference, 'Uitgiftereferentie', 240);
        const evidenceReference = clean(input.evidenceReference, 'Uitgiftebewijs', 240);
        const note = input.note ? clean(input.note, 'Toelichting', 1000) : 'Issued from company warehouse during operational recovery.';
        let expectedArrivalAt;
        try { expectedArrivalAt = this.ledger.normalizeReservationDate(input.expectedArrivalAt, 'expectedArrivalAt'); }
        catch { fail('operational_recovery_warehouse_eta_invalid', 'Vul een geldige verwachte aankomsttijd op de bouwplaats in.'); }
        if (!Number.isFinite(Date.parse(expectedArrivalAt)) || Date.parse(expectedArrivalAt) <= Date.parse(this.now())) {
          fail('operational_recovery_warehouse_eta_invalid', 'De verwachte aankomsttijd op de bouwplaats moet in de toekomst liggen.');
        }
        const stock = new (require('./shared-material-stock').SharedMaterialStock)(this.ledger);
        const reserveKey = `recovery-stock:${digest([jobId, entryKey, 'reserve'])}`;
        const issueKey = `recovery-stock:${digest([jobId, entryKey, 'issue'])}`;
        const allocation = stock.reserve(jobId, { materialRequirementId: sourceId, quantity: amount,
          sourceReference, note, entryKey: reserveKey }, { actor });
        const issue = stock.issue(allocation.allocation.id, { quantity: amount, dispatchReference,
          evidenceReference, expectedArrivalAt, note, entryKey: issueKey }, { actor });
        status = row.status; snapshot = decode(row); sourceHash = row.source_hash;
        warehouseMaterialIssue = { allocationId: allocation.allocation.id, issueId: issue.issueId,
          materialRequirementId: sourceId, materialId: line.warehouseMaterialId, quantity: amount,
          unit: line.unit, expectedArrivalAt, dispatchReference };
      } else if (input.action === 'client_impact_review') {
        id = clean(input.caseId, 'Herstelcasus', 160);
        const row = this.db.prepare("SELECT * FROM operational_recovery_cases WHERE id = ? AND job_id = ? AND status IN ('open','monitoring')").get(id, jobId);
        if (!row) fail('operational_recovery_case_not_found', 'Open herstelcasus niet gevonden.', 404);
        const existing = view.cases.find(item => item.id === id);
        if (input.caseHash !== row.snapshot_hash || input.sourceHash !== view.sourceHash || !existing?.sourceCurrent) fail('operational_recovery_source_changed', 'Bron of herstelcasus is gewijzigd. Ververs en beoordeel de klantafspraak opnieuw.', 409);
        const sourceId = clean(input.sourceId, 'Beschikbaarheidsregistratie', 160);
        const source = existing.sources.find(item => item.type === 'worker_availability' && item.id === sourceId);
        const appointmentId = clean(input.appointmentId, 'Klantafspraak', 160);
        const appointment = source?.impact?.clientAppointments?.find(item => item.id === appointmentId);
        if (!appointment) fail('operational_recovery_client_appointment_invalid', 'De goedgekeurde klantafspraak hoort niet bij deze actuele verstoring.', 409);
        const reviewStatus = clean(input.reviewStatus, 'Beoordeling', 40);
        if (!['reviewed_unaffected', 'customer_follow_up_required', 'awaiting_customer'].includes(reviewStatus)) fail('operational_recovery_client_review_status_invalid', 'Kies een geldige klantimpactbeoordeling.');
        if (reviewStatus === 'reviewed_unaffected' && source.impact.clientAppointmentsComplete !== true) fail('operational_recovery_client_scope_incomplete', 'De afsprakenlijst is niet volledig; leg geen beoordeling zonder impact vast.');
        const summary = clean(input.summary, 'Beoordelingstoelichting', 1000);
        const messageId = clean(input.messageId, 'Klantbericht', 200), accessId = clean(input.accessId, 'Klanttoegang', 200), messageHash = clean(input.messageHash, 'Bericht-hash', 64);
        const messageEvidence = appointment.clientMessages?.find(message => message.id === messageId && message.accessId === accessId && message.sourceHash === messageHash);
        if (!messageEvidence) fail('operational_recovery_client_message_invalid', 'Kies een huidig inkomend bericht uit het klantgesprek van deze afspraak.', 409);
        const currentMessage = this.chat.message(accessId, messageId, { client: true });
        if (currentMessage.direction !== 'inbound' || currentMessage.sourceHash !== messageHash || this.chat.access(accessId).jobId !== appointment.jobId) {
          fail('operational_recovery_client_message_changed', 'Het klantbericht is gewijzigd of hoort niet bij deze opdracht. Ververs en beoordeel opnieuw.', 409);
        }
        let nextFollowUpAt = null;
        if (input.nextFollowUpAt) {
          try { nextFollowUpAt = this.ledger.normalizeReservationDate(input.nextFollowUpAt, 'nextFollowUpAt'); }
          catch { fail('operational_recovery_client_follow_up_date_invalid', 'De volgende klantopvolgdatum is ongeldig.'); }
          if (!Number.isFinite(Date.parse(nextFollowUpAt)) || Date.parse(nextFollowUpAt) <= Date.parse(this.now())) fail('operational_recovery_client_follow_up_date_invalid', 'De volgende klantopvolgdatum moet in de toekomst liggen.');
        }
        if (reviewStatus === 'awaiting_customer' && !nextFollowUpAt) fail('operational_recovery_client_follow_up_required', 'Plan wanneer je opnieuw controleert op een klantreactie.');
        status = row.status; snapshot = { ...decode(row) }; sourceHash = row.source_hash;
        clientReviewId = crypto.randomUUID();
        snapshot.clientImpactReviews = [...(snapshot.clientImpactReviews || []), { id: clientReviewId, sourceId, sourceFingerprint: source.sourceFingerprint,
          appointment: { id: appointment.id, jobId: appointment.jobId, jobTitle: appointment.jobTitle, visitType: appointment.visitType,
            status: appointment.status, scheduledAt: appointment.scheduledAt, assignee: appointment.assignee, approvalId: appointment.approvalId,
            sourceFingerprint: appointment.sourceFingerprint }, status: reviewStatus, summary,
          messageEvidence: { accessId, messageId, messageHash, createdAt: currentMessage.createdAt, excerpt: currentMessage.body.slice(0, 500), hasMore: currentMessage.body.length > 500 }, nextFollowUpAt,
          recordedBy: actor, recordedAt: this.now() }].slice(-100);
        const now = this.now();
        this.db.prepare('UPDATE operational_recovery_cases SET snapshot_json = ?,snapshot_hash = ?,updated_at = ? WHERE id = ?')
          .run(JSON.stringify(snapshot), digest(snapshot), now, id);
      } else if (input.action === 'client_date_impact_review') {
        id = clean(input.caseId, 'Herstelcasus', 160);
        const row = this.db.prepare("SELECT * FROM operational_recovery_cases WHERE id = ? AND job_id = ? AND status IN ('open','monitoring')").get(id, jobId);
        if (!row) fail('operational_recovery_case_not_found', 'Open herstelcasus niet gevonden.', 404);
        const existing = view.cases.find(item => item.id === id);
        if (input.caseHash !== row.snapshot_hash || input.sourceHash !== view.sourceHash || !existing?.sourceCurrent) {
          fail('operational_recovery_source_changed', 'Bron of herstelcasus is gewijzigd. Beoordeel de contractuele impact opnieuw.', 409);
        }
        const entryKey = clean(input.commitmentEntryKey, 'Contractuele mijlpaal', 120);
        const commitment = this.clientDates.view(jobId).commitments.find(item => item.entryKey === entryKey);
        if (!commitment || commitment.status !== 'active' || !commitment.sourceCurrent || commitment.commitmentHash !== input.commitmentHash
          || !existing.sources.some(source => source.impact?.clientDateCommitments?.some(item => item.entryKey === entryKey && item.commitmentHash === input.commitmentHash))) {
          fail('operational_recovery_contract_commitment_invalid', 'De contractmijlpaal is ingetrokken, gewijzigd of niet aan deze actuele herstelcasus gekoppeld.', 409);
        }
        const reviewStatus = clean(input.reviewStatus, 'Impactbeoordeling', 40);
        if (!['not_impacted', 'at_risk', 'decision_required'].includes(reviewStatus)) fail('operational_recovery_contract_review_status_invalid', 'Kies een geldige beoordeling van de contractdatum.');
        const summary = clean(input.summary, 'Beoordelingstoelichting', 1000);
        let nextFollowUpAt = null;
        if (input.nextFollowUpAt) {
          try { nextFollowUpAt = this.ledger.normalizeReservationDate(input.nextFollowUpAt, 'nextFollowUpAt'); }
          catch { fail('operational_recovery_contract_follow_up_invalid', 'De vervolgdatum is ongeldig.'); }
          if (!Number.isFinite(Date.parse(nextFollowUpAt)) || Date.parse(nextFollowUpAt) <= Date.parse(this.now())) fail('operational_recovery_contract_follow_up_invalid', 'De vervolgdatum moet in de toekomst liggen.');
        }
        if (reviewStatus !== 'not_impacted' && !nextFollowUpAt) fail('operational_recovery_contract_follow_up_required', 'Plan een datum om de risicobeoordeling opnieuw te controleren.');
        status = row.status; snapshot = { ...decode(row) }; sourceHash = row.source_hash;
        clientDateReviewId = crypto.randomUUID();
        const commitmentSnapshot = { ...commitment };
        delete commitmentSnapshot.commitmentHash; delete commitmentSnapshot.sourceCurrent; delete commitmentSnapshot.history;
        snapshot.clientDateImpactReviews = [...(snapshot.clientDateImpactReviews || []), {
          id: clientDateReviewId, commitmentEntryKey: entryKey, commitmentHash: commitment.commitmentHash, commitment: commitmentSnapshot,
          recoverySourceHash: row.source_hash,
          relatedSources: existing.sources.map(source => ({ type: source.type, id: source.id, sourceFingerprint: source.sourceFingerprint })),
          status: reviewStatus, summary, nextFollowUpAt, recordedBy: actor, recordedAt: this.now()
        }].slice(-100);
        const now = this.now();
        this.db.prepare('UPDATE operational_recovery_cases SET snapshot_json = ?,snapshot_hash = ?,updated_at = ? WHERE id = ?')
          .run(JSON.stringify(snapshot), digest(snapshot), now, id);
      } else if (input.action === 'field_instruction') {
        id = clean(input.caseId, 'Herstelcasus', 160);
        const row = this.db.prepare("SELECT * FROM operational_recovery_cases WHERE id = ? AND job_id = ? AND status IN ('open','monitoring')").get(id, jobId);
        if (!row) fail('operational_recovery_case_not_found', 'Open herstelcasus niet gevonden.', 404);
        const existing = view.cases.find(item => item.id === id);
        if (input.caseHash !== row.snapshot_hash || input.sourceHash !== view.sourceHash || !existing?.sourceCurrent) fail('operational_recovery_source_changed', 'Bron of herstelcasus is gewijzigd. Ververs en beoordeel opnieuw voordat je instructies verstrekt.', 409);
        const sourceId = clean(input.sourceId, 'Taakblokkade', 160);
        const source = existing.sources.find(item => item.type === 'field_progress_blocker' && item.id === sourceId && item.impact?.taskId && item.impact?.workerId);
        if (!source) fail('operational_recovery_field_source_invalid', 'De taakblokkade hoort niet bij deze actuele herstelcasus.', 409);
        const text = clean(input.text, 'Instructie', 2000);
        status = row.status; snapshot = { ...decode(row) }; sourceHash = row.source_hash;
        fieldInstructionId = crypto.randomUUID();
        snapshot.fieldInstructions = [...(snapshot.fieldInstructions || []), { id: fieldInstructionId, caseId: id, sourceId,
          taskId: source.impact.taskId, workerId: source.impact.workerId, sourceFingerprint: source.sourceFingerprint,
          text, recordedBy: actor, recordedAt: this.now(), grantsSafetyClearance: false }].slice(-100);
        const now = this.now();
        this.db.prepare('UPDATE operational_recovery_cases SET snapshot_json = ?,snapshot_hash = ?,updated_at = ? WHERE id = ?')
          .run(JSON.stringify(snapshot), digest(snapshot), now, id);
      } else if (input.action === 'cost_impact_review') {
        id = clean(input.caseId, 'Herstelcasus', 160);
        const row = this.db.prepare("SELECT * FROM operational_recovery_cases WHERE id = ? AND job_id = ? AND status IN ('open','monitoring')").get(id, jobId);
        if (!row) fail('operational_recovery_case_not_found', 'Open herstelcasus niet gevonden.', 404);
        const existing = view.cases.find(item => item.id === id);
        if (input.caseHash !== row.snapshot_hash || input.sourceHash !== view.sourceHash || !existing?.sourceCurrent) {
          fail('operational_recovery_source_changed', 'Bron of herstelcasus is gewijzigd. Beoordeel de kostenimpact opnieuw.', 409);
        }
        const reviewStatus = clean(input.reviewStatus, 'Kostenbeoordeling', 40);
        if (!['estimate', 'no_additional_cost', 'unknown'].includes(reviewStatus)) fail('operational_recovery_cost_review_status_invalid', 'Kies een geldige kostenbeoordeling.');
        const summary = clean(input.summary, 'Toelichting kostenimpact', 1000);
        const evidenceReference = input.evidenceReference ? clean(input.evidenceReference, 'Kostenbewijs', 500) : null;
        if (['estimate', 'no_additional_cost'].includes(reviewStatus) && !evidenceReference) fail('operational_recovery_cost_evidence_required', 'Een raming of nulbedrag vereist een controleerbare bewijsreferentie.');
        let amountCents = null, nextFollowUpAt = null;
        if (reviewStatus === 'estimate') {
          if (!(typeof input.amount === 'number' || (typeof input.amount === 'string' && input.amount.trim()))) {
            fail('operational_recovery_cost_amount_invalid', 'Vul een geldig geraamd bedrag in euro in met maximaal twee decimalen.');
          }
          const amount = Number(input.amount);
          if (!Number.isFinite(amount) || amount < 0 || amount > 100000000 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-7) {
            fail('operational_recovery_cost_amount_invalid', 'Vul een geldig geraamd bedrag in euro in met maximaal twee decimalen.');
          }
          amountCents = Math.round(amount * 100);
        } else if (input.amount !== undefined && input.amount !== null && input.amount !== '') {
          fail('operational_recovery_cost_amount_invalid', 'Een bedrag mag alleen bij een expliciete raming worden vastgelegd.');
        }
        if (reviewStatus === 'unknown') {
          try { nextFollowUpAt = this.ledger.normalizeReservationDate(input.nextFollowUpAt, 'nextFollowUpAt'); }
          catch { fail('operational_recovery_cost_follow_up_required', 'Plan een datum om de kostenimpact opnieuw te beoordelen.'); }
          if (!Number.isFinite(Date.parse(nextFollowUpAt)) || Date.parse(nextFollowUpAt) <= Date.parse(this.now())) {
            fail('operational_recovery_cost_follow_up_required', 'De volgende kostencontrole moet in de toekomst liggen.');
          }
        }
        status = row.status; snapshot = { ...decode(row) }; sourceHash = row.source_hash;
        costReviewId = crypto.randomUUID();
        const record = { id: costReviewId, status: reviewStatus, currency: 'EUR', amountCents, summary, evidenceReference,
          nextFollowUpAt, sourceHash: row.source_hash,
          sources: snapshot.sources.map(source => ({ type: source.type, id: source.id, sourceFingerprint: source.sourceFingerprint })),
          recordedBy: actor, recordedAt: this.now(), accountingPosted: false, externalCommitments: 0 };
        snapshot.costImpactReviews = [...(snapshot.costImpactReviews || []), record].slice(-100);
        const now = this.now();
        this.db.prepare('UPDATE operational_recovery_cases SET snapshot_json = ?,snapshot_hash = ?,updated_at = ? WHERE id = ?')
          .run(JSON.stringify(snapshot), digest(snapshot), now, id);
      } else if (input.action === 'actual_cost_attribution' || input.action === 'actual_cost_reversal') {
        id = clean(input.caseId, 'Herstelcasus', 160);
        const row = this.db.prepare("SELECT * FROM operational_recovery_cases WHERE id = ? AND job_id = ? AND status IN ('open','monitoring')").get(id, jobId);
        if (!row) fail('operational_recovery_case_not_found', 'Open herstelcasus niet gevonden.', 404);
        const existing = view.cases.find(item => item.id === id);
        if (input.caseHash !== row.snapshot_hash || input.sourceHash !== view.sourceHash || !existing?.sourceCurrent) {
          fail('operational_recovery_source_changed', 'Bron of herstelcasus is gewijzigd. Ververs en beoordeel opnieuw.', 409);
        }
        status = row.status; snapshot = { ...decode(row) }; sourceHash = row.source_hash;
        const now = this.now();
        if (input.action === 'actual_cost_attribution') {
          const sourceType = clean(input.sourceType, 'Soort kostenbron', 40), sourceId = clean(input.sourceId, 'Kostenbron', 160);
          const source = this.approvedActualCosts(jobId).find(item => item.type === sourceType && item.id === sourceId);
          if (!source || source.sourceFingerprint !== input.sourceFingerprint) fail('operational_recovery_actual_cost_source_invalid', 'De kostenbron is niet langer een actuele, goedgekeurde euro-kostenpost.', 409);
          const amount = Number(input.amount);
          if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-7) {
            fail('operational_recovery_actual_cost_amount_invalid', 'Vul een positief bedrag met maximaal twee decimalen in.');
          }
          const amountCents = Math.round(amount * 100), allocated = this.actualCostAllocations(jobId).get(`${sourceType}:${sourceId}`) || 0;
          if (amountCents > source.amountCents - allocated) fail('operational_recovery_actual_cost_exceeds_source', 'Het bedrag is hoger dan het nog niet toegerekende deel van deze goedgekeurde kostenpost.', 409);
          actualCostRecord = { id: crypto.randomUUID(), sourceType, sourceId, sourceFingerprint: source.sourceFingerprint,
            sourceAmountCents: source.amountCents, amountCents, currency: 'EUR', rationale: clean(input.rationale, 'Toelichting toerekening', 1000),
            recordedBy: actor, recordedAt: now, accountingPosted: false, externalCommitments: 0 };
          snapshot.actualCostAttributions = [...(snapshot.actualCostAttributions || []), actualCostRecord].slice(-500);
        } else {
          const attributionId = clean(input.attributionId, 'Toerekening', 160);
          const attribution = (snapshot.actualCostAttributions || []).find(item => item.id === attributionId);
          if (!attribution || (snapshot.actualCostReversals || []).some(item => item.attributionId === attributionId)) fail('operational_recovery_actual_cost_attribution_invalid', 'Deze toerekening bestaat niet of is al teruggedraaid.', 409);
          actualCostRecord = { id: crypto.randomUUID(), attributionId, rationale: clean(input.rationale, 'Reden correctie', 1000),
            recordedBy: actor, recordedAt: now, accountingPosted: false, externalCommitments: 0 };
          snapshot.actualCostReversals = [...(snapshot.actualCostReversals || []), actualCostRecord].slice(-500);
        }
        this.db.prepare('UPDATE operational_recovery_cases SET snapshot_json = ?,snapshot_hash = ?,updated_at = ? WHERE id = ?')
          .run(JSON.stringify(snapshot), digest(snapshot), now, id);
      } else {
        id = clean(input.caseId, 'Herstelcasus', 160);
        const row = this.db.prepare('SELECT * FROM operational_recovery_cases WHERE id = ? AND job_id = ?').get(id, jobId);
        if (!row) fail('operational_recovery_case_not_found', 'Herstelcasus niet gevonden.', 404);
        const existing = view.cases.find(item => item.id === id);
        if (input.caseHash !== row.snapshot_hash || input.sourceHash !== view.sourceHash || (!existing?.sourceCurrent && input.reassess !== true)) fail('operational_recovery_source_changed', 'Bron of herstelcasus is gewijzigd. Beoordeel de bijgewerkte bron expliciet voordat je verdergaat.', 409);
        if (!['open', 'monitoring', 'resolved', 'cancelled'].includes(input.status)) fail('operational_recovery_status_invalid', 'Ongeldige casusstatus.');
        status = input.status; snapshot = { ...decode(row) }; sourceHash = row.source_hash;
        if (input.reassess === true) {
          if (status === 'resolved') fail('operational_recovery_reassess_separately', 'Beoordeel een gewijzigde bron eerst opnieuw. Sluit de bijgewerkte casus daarna met een nieuwe controle af.', 409);
          const refreshed = snapshot.sources.map(reference => this.sourceRecord(jobId, reference, view.sources));
          if (refreshed.some(source => !source)) fail('operational_recovery_source_missing', 'Een oorspronkelijke bron ontbreekt; sluit de casus niet op basis van incomplete informatie.', 409);
          const reviewNote = clean(input.reviewNote, 'Herbeoordeling', 2000);
          snapshot.sources = refreshed.map(retainedSource);
          snapshot.reassessments = [...(snapshot.reassessments || []), { note: reviewNote, reviewedBy: actor, reviewedAt: this.now() }].slice(-50);
          sourceHash = digest(snapshot.sources.map(({ type, id: sourceId, sourceFingerprint }) => ({ type, id: sourceId, sourceFingerprint })));
        }
        if (status === 'resolved') {
          snapshot.resolutionEvidence = clean(input.resolutionEvidence, 'Bewijs van herstel', 2000);
          const outstanding = this.resolutionBlockers(existing);
          if (outstanding.length) fail('operational_recovery_resolution_blocked', `Herstelcasus kan nog niet worden afgerond: ${outstanding.map(item => item.message).join(' ')}`, 409);
          snapshot.resolutionReview = this.resolutionReview(existing, actor, row.source_hash);
          const taskBlockers = snapshot.sources.filter(source => source.type === 'field_progress_blocker');
          if (taskBlockers.length) {
            if (!Array.isArray(input.resolutionReports) || input.resolutionReports.length !== taskBlockers.length) {
              fail('operational_recovery_resolution_report_required', 'Koppel voor elke taakblokkade een latere hervattingsmelding van dezelfde uitvoerende.', 409);
            }
            snapshot.resolutionProtocolVersion = 2;
            snapshot.resolutionReports = taskBlockers.map(source => {
              const selection = input.resolutionReports.find(item => item?.sourceId === source.id);
              const currentSource = existing.sources.find(item => item.type === source.type && item.id === source.id);
              const report = currentSource?.impact?.followUpReports?.find(item => item.id === selection?.progressId
                && item.taskId === source.impact?.taskId && item.workerId === source.impact?.workerId);
              if (!report) fail('operational_recovery_resolution_report_invalid', 'De hervattingsmelding hoort niet bij dezelfde uitvoerende, taak en actuele verstoring.', 409);
              const instruction = [...(snapshot.fieldInstructions || [])].reverse().find(item => item.sourceId === source.id
                && item.taskId === source.impact?.taskId && item.workerId === source.impact?.workerId);
              if (!instruction || !report.acknowledgedInstructionIds?.includes(instruction.id)) fail('operational_recovery_instruction_ack_required', 'De uitvoerder moet eerst de actuele taakgebonden instructie lezen en daarna de taak hervatten.', 409);
              return { sourceId: source.id, instructionId: instruction.id, progressId: report.id, taskId: report.taskId, workerId: report.workerId,
                reportedAt: report.reportedAt, sourceHash: report.sourceHash, status: report.status, note: report.note };
            });
          }
        }
        if (['open', 'monitoring'].includes(status)) {
          snapshot.owner = clean(input.owner, 'Eigenaar', 160);
          snapshot.dueAt = this.ledger.normalizeReservationDate(input.dueAt, 'dueAt');
          snapshot.recoveryAction = clean(input.recoveryAction, 'Herstelrichting', 1000);
        }
        const now = this.now();
        this.db.prepare('UPDATE operational_recovery_cases SET status = ?,source_hash = ?,snapshot_json = ?,snapshot_hash = ?,updated_at = ?,resolved_at = ? WHERE id = ?')
          .run(status, sourceHash, JSON.stringify(snapshot), digest(snapshot), now, status === 'resolved' || status === 'cancelled' ? now : null, id);
      }
      const now = this.now(), response = { caseId: id, status, sourceHash, ...(followUpId ? { followUpId } : {}), ...(clientReviewId || clientDateReviewId ? { reviewId: clientReviewId || clientDateReviewId } : {}),
        ...(fieldInstructionId ? { fieldInstructionId } : {}), ...(costReviewId ? { reviewId: costReviewId } : {}),
        ...(actualCostRecord ? { actualCostRecordId: actualCostRecord.id } : {}),
        ...(warehouseMaterialIssue ? { warehouseMaterialIssue } : {}),
        ...(followUpId ? { materialAvailabilityUpdated, ...(materialRequirementId ? { materialRequirementId } : {}), reassessmentRequired: materialAvailabilityUpdated } : {}),
        replayed: false, externalCommitments: 0 };
      this.db.prepare('INSERT INTO operational_recovery_commands (id,job_id,request_hash,response_json,created_at) VALUES (?,?,?,?,?)')
        .run(commandId, jobId, requestHash, JSON.stringify(response), now);
      this.ledger.audit({ entityType: 'operational_recovery_case', entityId: id, jobId, action: `operational_recovery_${input.action}`, actor,
        after: response, metadata: { sourceCount: snapshot.sources.length, supplierFollowUp: input.action === 'supplier_follow_up',
          materialAvailabilityUpdated,
          warehouseMaterialIssue: warehouseMaterialIssue || null,
          clientImpactReview: input.action === 'client_impact_review', clientDateImpactReview: input.action === 'client_date_impact_review',
          ...(fieldInstructionId ? { fieldInstruction: snapshot.fieldInstructions.find(item => item.id === fieldInstructionId) } : {}),
          ...(input.action === 'update' && status === 'resolved' && Array.isArray(snapshot.resolutionReports) ? { resolutionReports: snapshot.resolutionReports } : {}),
          ...(input.action === 'update' && status === 'resolved' && snapshot.resolutionReview ? { resolutionReview: snapshot.resolutionReview } : {}),
          ...(clientDateReviewId ? { clientDateImpactReviewRecord: snapshot.clientDateImpactReviews.find(review => review.id === clientDateReviewId) } : {}),
          ...(costReviewId ? { costImpactReviewRecord: snapshot.costImpactReviews.find(review => review.id === costReviewId) } : {}),
          ...(actualCostRecord ? { actualCostRecord } : {}), externalCommitments: 0 } });
      return response;
    });
  }

  exportRecords() { return Object.fromEntries(TABLES.map(table => [table, this.db.prepare(`SELECT * FROM ${table} ORDER BY id`).all().map(row => ({ ...row }))])); }
}

function verifyOperationalRecovery(db) {
  const cases = db.prepare('SELECT * FROM operational_recovery_cases ORDER BY id').all();
  for (const row of cases) {
    const snapshot = decode(row);
    const taskBlockers = (snapshot.sources || []).filter(source => source.type === 'field_progress_blocker' && source.impact?.taskId);
    const hasInvalidTaskResolution = row.status === 'resolved' && taskBlockers.length > 0 && snapshot.resolutionProtocolVersion === 2
      && !new OperationalRecovery({ db }).validResolutionReports(snapshot);
    const hasUnauditedTaskResolution = row.status === 'resolved' && taskBlockers.length > 0 && Array.isArray(snapshot.resolutionReports)
      && !db.prepare("SELECT after_json, metadata_json FROM audit_events WHERE entity_type = 'operational_recovery_case' AND entity_id = ? AND action = 'operational_recovery_update' ORDER BY sequence_number DESC")
        .all(row.id).some(event => {
          try {
            const after = JSON.parse(event.after_json), metadata = JSON.parse(event.metadata_json || '{}');
            return after.caseId === row.id && after.status === 'resolved' && digest(metadata.resolutionReports) === digest(snapshot.resolutionReports);
          } catch { return false; }
        });
    const hasInvalidFieldInstruction = (snapshot.fieldInstructions || []).some(instruction => {
      const source = snapshot.sources.find(item => item.type === 'field_progress_blocker' && item.id === instruction.sourceId);
      return !instruction.id || instruction.caseId !== row.id || !instruction.workerId || !instruction.taskId || !instruction.text
        || instruction.grantsSafetyClearance !== false || source?.impact?.workerId !== instruction.workerId || source?.impact?.taskId !== instruction.taskId;
    });
    const hasUnauditedFieldInstruction = (snapshot.fieldInstructions || []).some(instruction => !db.prepare("SELECT metadata_json FROM audit_events WHERE entity_type = 'operational_recovery_case' AND entity_id = ? AND action = 'operational_recovery_field_instruction' ORDER BY sequence_number DESC")
      .all(row.id).some(event => {
        try { return digest(JSON.parse(event.metadata_json || '{}').fieldInstruction) === digest(instruction); }
        catch { return false; }
      }));
    const hasUnauditedResolutionReview = row.status === 'resolved' && snapshot.resolutionReview
      && (snapshot.resolutionReview.sourceHash !== row.source_hash
        || !Array.isArray(snapshot.resolutionReview.sources)
        || !db.prepare("SELECT metadata_json FROM audit_events WHERE entity_type = 'operational_recovery_case' AND entity_id = ? AND action = 'operational_recovery_update' ORDER BY sequence_number DESC")
          .all(row.id).some(event => {
            try { return digest(JSON.parse(event.metadata_json || '{}').resolutionReview) === digest(snapshot.resolutionReview); }
            catch { return false; }
          }));
    if (!snapshot.sources?.length || !snapshot.owner || !snapshot.dueAt || !snapshot.recoveryAction || !['open', 'monitoring', 'resolved', 'cancelled'].includes(row.status)
      || (row.status === 'resolved' && !snapshot.resolutionEvidence) || hasInvalidTaskResolution || hasUnauditedTaskResolution || hasUnauditedResolutionReview
      || hasInvalidFieldInstruction || hasUnauditedFieldInstruction) fail('operational_recovery_integrity_failed', 'Een herstelcasus mist verplichte opvolging of bewijs.', 409);
    const sourceHash = digest(snapshot.sources.map(({ type, id, sourceFingerprint }) => ({ type, id, sourceFingerprint })));
    if (sourceHash !== row.source_hash) fail('operational_recovery_integrity_failed', 'De herstelcasus verwijst naar een onjuiste bronversie.', 409);
    for (const followUp of snapshot.supplierFollowUps || []) {
      const sourceType = followUp.sourceType || 'material_receipt';
      const sourceId = followUp.sourceId || followUp.materialReceiptId;
      const source = snapshot.sources.find(item => item.type === sourceType && item.id === sourceId);
      if (!source?.impact?.purchaseOrder || source.impact.purchaseOrder.id !== followUp.purchaseOrderId
        || source.sourceFingerprint !== followUp.sourceFingerprint || !followUp.evidenceReference || !followUp.recordedBy || !followUp.recordedAt
        || !['contact_recorded', 'no_response', 'delivery_date_confirmed', 'alternative_proposed'].includes(followUp.status)
        || (followUp.status === 'delivery_date_confirmed' && !followUp.expectedAt)
        || (followUp.status === 'no_response' && !followUp.nextFollowUpAt)) {
        fail('operational_recovery_integrity_failed', 'Leveranciersopvolging mist een geldige bestelbron of bewijsreferentie.', 409);
      }
    }
    for (const review of snapshot.clientImpactReviews || []) {
      const source = snapshot.sources.find(item => item.type === 'worker_availability' && item.id === review.sourceId);
      if (!source || !review.sourceFingerprint || !review.appointment?.id || !review.appointment?.approvalId || !review.appointment?.scheduledAt
        || !review.appointment?.sourceFingerprint || !['reviewed_unaffected', 'customer_follow_up_required', 'awaiting_customer'].includes(review.status)
        || !review.summary || (!review.evidenceReference && (!review.messageEvidence?.accessId || !review.messageEvidence?.messageId || !/^[a-f0-9]{64}$/.test(review.messageEvidence?.messageHash || '')))
        || !review.recordedBy || !review.recordedAt
        || (review.status === 'awaiting_customer' && !review.nextFollowUpAt)) {
        fail('operational_recovery_integrity_failed', 'Klantimpactbeoordeling mist een goedgekeurde afspraak, besluitreferentie of opvolging.', 409);
      }
      if (review.messageEvidence) {
        const messageEvidence = review.messageEvidence;
        const event = db.prepare(`SELECT job_id, after_json FROM audit_events WHERE entity_type = 'conversation_source' AND entity_id = ?
          ORDER BY sequence_number DESC LIMIT 1`).get(messageEvidence.messageId);
        let retainedMessage;
        try { retainedMessage = event && JSON.parse(event.after_json); } catch { retainedMessage = null; }
        if (!event || event.job_id !== review.appointment.jobId || !retainedMessage || retainedMessage.direction !== 'inbound'
          || retainedMessage.accessId !== messageEvidence.accessId || retainedMessage.sourceHash !== messageEvidence.messageHash
          || retainedMessage.sourceHash !== hashConversationSource(retainedMessage.basis) || retainedMessage.body !== retainedMessage.basis?.body
          || retainedMessage.body.slice(0, 500) !== messageEvidence.excerpt || retainedMessage.createdAt !== messageEvidence.createdAt) {
          fail('operational_recovery_integrity_failed', 'De klantimpactbeoordeling verwijst niet naar het bewaarde inkomende klantbericht.', 409);
        }
      }
    }
    for (const review of snapshot.clientDateImpactReviews || []) {
      if (!review.id || !review.commitment || review.commitment.entryKey !== review.commitmentEntryKey
        || digest(review.commitment) !== review.commitmentHash || review.commitment.status !== 'active'
        || !Array.isArray(review.relatedSources) || !review.relatedSources.length
        || digest(review.relatedSources) !== review.recoverySourceHash
        || review.relatedSources.some(source => !source.type || !source.id || !/^[a-f0-9]{64}$/.test(source.sourceFingerprint || ''))
        || !['not_impacted', 'at_risk', 'decision_required'].includes(review.status) || !review.summary
        || !review.recordedBy || !review.recordedAt
        || (review.status !== 'not_impacted' && !review.nextFollowUpAt)) {
        fail('operational_recovery_integrity_failed', 'Contractimpactbeoordeling mist een controleerbare contractmijlpaal, bronkoppeling of vervolgactie.', 409);
      }
      if (review.nextFollowUpAt && (!Number.isFinite(Date.parse(review.nextFollowUpAt)) || Date.parse(review.nextFollowUpAt) <= Date.parse(review.recordedAt))) {
        fail('operational_recovery_integrity_failed', 'Contractimpactbeoordeling heeft een ongeldige vervolgdatum.', 409);
      }
      const event = db.prepare(`SELECT after_json, metadata_json FROM audit_events WHERE entity_type = 'operational_recovery_case' AND entity_id = ?
        AND action = 'operational_recovery_client_date_impact_review' ORDER BY sequence_number DESC`).all(row.id).find(candidate => {
          try { return JSON.parse(candidate.metadata_json || '{}').clientDateImpactReviewRecord?.id === review.id; } catch { return false; }
        });
      let auditAfter, auditRecord;
      try { auditAfter = event && JSON.parse(event.after_json); auditRecord = event && JSON.parse(event.metadata_json || '{}').clientDateImpactReviewRecord; } catch { auditAfter = null; auditRecord = null; }
      if (!event || auditAfter?.reviewId !== review.id || auditAfter?.caseId !== row.id || digest(auditRecord) !== digest(review)) {
        fail('operational_recovery_integrity_failed', 'Contractimpactbeoordeling ontbreekt of wijkt af van de onveranderlijke auditregistratie.', 409);
      }
    }
    for (const review of snapshot.costImpactReviews || []) {
      const validAmount = review.status === 'estimate' && Number.isSafeInteger(review.amountCents) && review.amountCents >= 0;
      const validNoCost = review.status === 'no_additional_cost' && review.amountCents === null;
      const validUnknown = review.status === 'unknown' && review.amountCents === null && Number.isFinite(Date.parse(review.nextFollowUpAt || ''))
        && Date.parse(review.nextFollowUpAt) > Date.parse(review.recordedAt);
      if (!review.id || !['estimate', 'no_additional_cost', 'unknown'].includes(review.status) || !['EUR'].includes(review.currency)
        || !(validAmount || validNoCost || validUnknown) || !review.summary
        || (review.status !== 'unknown' && !review.evidenceReference) || !Array.isArray(review.sources) || !review.sources.length
        || review.sources.some(source => !source.type || !source.id || !/^[a-f0-9]{64}$/.test(source.sourceFingerprint || ''))
        || review.sourceHash !== digest(review.sources) || review.accountingPosted !== false || review.externalCommitments !== 0 || !review.recordedBy || !review.recordedAt) {
        fail('operational_recovery_integrity_failed', 'Kostenbeoordeling mist een geldige raming, bewijsreferentie of actuele bronkoppeling.', 409);
      }
      const event = db.prepare(`SELECT after_json, metadata_json FROM audit_events WHERE entity_type = 'operational_recovery_case' AND entity_id = ?
        AND action = 'operational_recovery_cost_impact_review' ORDER BY sequence_number DESC`).all(row.id).find(candidate => {
          try { return JSON.parse(candidate.metadata_json || '{}').costImpactReviewRecord?.id === review.id; } catch { return false; }
        });
      let auditAfter, auditRecord;
      try { auditAfter = event && JSON.parse(event.after_json); auditRecord = event && JSON.parse(event.metadata_json || '{}').costImpactReviewRecord; }
      catch { auditAfter = null; auditRecord = null; }
      if (!event || auditAfter?.reviewId !== review.id || auditAfter?.caseId !== row.id || digest(auditRecord) !== digest(review)) {
        fail('operational_recovery_integrity_failed', 'Kostenbeoordeling ontbreekt of wijkt af van de onveranderlijke auditregistratie.', 409);
      }
    }
    const reversals = new Set();
    for (const reversal of snapshot.actualCostReversals || []) {
      const attribution = (snapshot.actualCostAttributions || []).find(item => item.id === reversal.attributionId);
      const event = db.prepare(`SELECT after_json,metadata_json FROM audit_events WHERE entity_type='operational_recovery_case' AND entity_id=?
        AND action='operational_recovery_actual_cost_reversal' ORDER BY sequence_number DESC`).all(row.id).find(candidate => {
        try { return JSON.parse(candidate.metadata_json || '{}').actualCostRecord?.id === reversal.id; } catch { return false; }
      });
      let auditAfter, auditRecord;
      try { auditAfter = event && JSON.parse(event.after_json); auditRecord = event && JSON.parse(event.metadata_json || '{}').actualCostRecord; } catch { auditAfter = null; auditRecord = null; }
      if (!attribution || reversals.has(reversal.attributionId) || !reversal.rationale || !reversal.recordedBy || !reversal.recordedAt
        || reversal.accountingPosted !== false || reversal.externalCommitments !== 0 || !event || auditAfter?.actualCostRecordId !== reversal.id
        || auditAfter?.caseId !== row.id || digest(auditRecord) !== digest(reversal)) {
        fail('operational_recovery_integrity_failed', 'Correctie van een werkelijke kosten-toerekening wijkt af van de onveranderlijke auditregistratie.', 409);
      }
      reversals.add(reversal.attributionId);
    }
    for (const attribution of snapshot.actualCostAttributions || []) {
      const valid = attribution.id && ['expense', 'supplier_invoice'].includes(attribution.sourceType) && attribution.sourceId
        && /^[a-f0-9]{64}$/.test(attribution.sourceFingerprint || '') && Number.isSafeInteger(attribution.sourceAmountCents)
        && attribution.sourceAmountCents > 0 && Number.isSafeInteger(attribution.amountCents) && attribution.amountCents > 0
        && attribution.amountCents <= attribution.sourceAmountCents && attribution.currency === 'EUR' && attribution.rationale
        && attribution.recordedBy && attribution.recordedAt && attribution.accountingPosted === false && attribution.externalCommitments === 0;
      const event = db.prepare(`SELECT after_json,metadata_json FROM audit_events WHERE entity_type='operational_recovery_case' AND entity_id=?
        AND action='operational_recovery_actual_cost_attribution' ORDER BY sequence_number DESC`).all(row.id).find(candidate => {
        try { return JSON.parse(candidate.metadata_json || '{}').actualCostRecord?.id === attribution.id; } catch { return false; }
      });
      let auditAfter, auditRecord;
      try { auditAfter = event && JSON.parse(event.after_json); auditRecord = event && JSON.parse(event.metadata_json || '{}').actualCostRecord; } catch { auditAfter = null; auditRecord = null; }
      if (!valid || !event || auditAfter?.actualCostRecordId !== attribution.id || auditAfter?.caseId !== row.id
        || digest(auditRecord) !== digest(attribution)) fail('operational_recovery_integrity_failed', 'Werkelijke kosten-toerekening mist een geldige bron of auditregistratie.', 409);
    }
  }
  const activeActualAllocations = new Map();
  for (const row of cases) {
    const snapshot = decode(row), reversed = new Set((snapshot.actualCostReversals || []).map(item => item.attributionId));
    for (const item of snapshot.actualCostAttributions || []) if (!reversed.has(item.id)) {
      const key = `${item.sourceType}:${item.sourceId}`, current = activeActualAllocations.get(key) || { cents: 0, sourceAmountCents: item.sourceAmountCents, fingerprint: item.sourceFingerprint };
      current.cents += item.amountCents;
      if (current.sourceAmountCents !== item.sourceAmountCents || current.fingerprint !== item.sourceFingerprint || current.cents > current.sourceAmountCents) {
        fail('operational_recovery_integrity_failed', 'Toerekeningen van een goedgekeurde kostenbron overschrijden de bron of gebruiken afwijkende brongegevens.', 409);
      }
      activeActualAllocations.set(key, current);
    }
  }
  for (const row of db.prepare('SELECT * FROM operational_recovery_commands').all()) {
    let response;
    try { response = JSON.parse(row.response_json); } catch { fail('operational_recovery_integrity_failed', 'Een herstelopdracht is beschadigd.', 409); }
    if (!cases.some(item => item.id === response.caseId && item.job_id === row.job_id)) fail('operational_recovery_integrity_failed', 'Een wijzigingsbewijs verwijst niet naar een herstelcasus.', 409);
  }
  return true;
}

module.exports = { OperationalRecovery, migrateOperationalRecovery, verifyOperationalRecovery, TABLES, COLUMNS, digest, operationalRecoveryFollowUpActions, portfolioSourceSummary, triageOperationalSources };
