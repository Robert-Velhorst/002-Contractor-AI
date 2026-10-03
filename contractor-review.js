const { createHash, randomUUID } = require('node:crypto');

const JOB_KEY = 'portfolio_dossier_review';
const SOURCE_TABLES = Object.freeze([
  'job_tasks', 'task_dependencies', 'schedule_baselines', 'assignments',
  'material_requirements', 'purchase_orders', 'budget_lines', 'billing_milestones',
  'material_receipts', 'material_receipt_lines', 'change_orders',
  'commercial_scope_revisions', 'client_selections', 'approvals', 'drawing_revisions'
]);
const DERIVED_SOURCES = Object.freeze([
  { name: 'job_schedule', key: null }, { name: 'client_date_commitments', key: 'clientDates' },
  { name: 'work_context', key: 'workContext' }, { name: 'work_balance', key: 'workBalance' },
  { name: 'installed_assets', key: 'installedAssets' }, { name: 'work_deliveries', key: 'workDeliveries' },
  { name: 'takeoffs', key: 'takeoffs' }
]);
const REVIEW_CHECKS = Object.freeze(['schedule_inputs', 'target_completion', 'pending_approvals', 'budget_forecast', 'approved_scope', 'client_decisions', 'delivery_sources', 'asset_history_sources', 'inspection_coverage', 'work_balance']);
const REVIEW_COVERAGE_VERSION = 1;

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
function hash(value) { return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex'); }
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function money(value) { return Math.round((value + Number.EPSILON) * 100) / 100; }
function hours(from, to) { return from && to ? (Date.parse(to) - Date.parse(from)) / 3600000 : null; }
function bounded(value, fallback, max) { return Number.isFinite(Number(value)) ? Math.max(1, Math.min(max, Math.floor(Number(value)))) : fallback; }
function completionForecast(plannedEnd, commitment) {
  if (!commitment.sourceCurrent) return { status: 'contract_source_changed', daysLate: null };
  if (!plannedEnd || !/^\d{4}-\d{2}-\d{2}$/.test(commitment.date)) return { status: 'unknown', daysLate: null };
  const forecast = Date.parse(`${plannedEnd.slice(0, 10)}T00:00:00.000Z`);
  const due = Date.parse(`${commitment.date}T00:00:00.000Z`);
  if (!Number.isFinite(forecast) || !Number.isFinite(due)) return { status: 'unknown', daysLate: null };
  const daysLate = Math.max(0, Math.round((forecast - due) / 86400000));
  return { status: daysLate ? 'projected_late' : 'within_date', daysLate };
}

class ContractorReview {
  constructor(ledger) { this.ledger = ledger; }

  source(jobId, { excludeChangeOrderIds = [], excludeApprovalIds = [] } = {}) {
    const job = { ...this.ledger.requireJob(jobId, { allowInactive: true }), updated_at: null };
    const records = {};
    // Table names are a closed, internal allowlist. Every row of each scoped source is included.
    for (const table of SOURCE_TABLES) {
      const excludedIds = table === 'change_orders' ? excludeChangeOrderIds : table === 'approvals' ? excludeApprovalIds : [];
      const exclusion = excludedIds.length ? ` AND id NOT IN (${excludedIds.map(() => '?').join(', ')})` : '';
      const query = table === 'drawing_revisions'
        ? "SELECT * FROM documents WHERE job_id = ? AND type = 'drawing_revision' ORDER BY id"
        : table === 'material_receipt_lines'
        ? `SELECT lines.* FROM material_receipt_lines lines JOIN material_receipts receipts ON receipts.id = lines.receipt_id WHERE receipts.job_id = ? ORDER BY lines.id`
        : `SELECT * FROM ${table} WHERE job_id = ?${exclusion} ORDER BY id`;
      records[table] = this.ledger.db.prepare(query).all(jobId, ...excludedIds);
    }
    return { version: 10, job, records, clientDates: new (require('./client-date-commitments').ClientDateCommitments)(this.ledger).view(jobId),
      workContext: new (require('./work-context').WorkContext)(this.ledger).source(jobId),
      workBalance: new (require('./work-balance').WorkBalance)(this.ledger).read(jobId),
      installedAssets: new (require('./asset-history').AssetHistory)(this.ledger).source(jobId),
      workDeliveries: new (require('./work-delivery').WorkDelivery)(this.ledger).source(jobId),
      takeoffs: this.ledger.listTakeoffs(jobId).map(takeoff => ({
        id: takeoff.id, title: takeoff.title, status: takeoff.status, currency: takeoff.currency,
        updatedAt: takeoff.updatedAt, snapshotHash: takeoff.snapshotHash, integrityValid: takeoff.integrityValid,
        items: takeoff.items.map(item => ({ id: item.id, description: item.description, category: item.category,
          quantity: item.quantity, unit: item.unit, unitCost: item.unitCost, unitPrice: item.unitPrice,
          costCode: item.costCode, wbsCode: item.wbsCode, workPackage: item.workPackage }))
      })) };
  }

  contractualContext(jobId, source) {
    const scope = this.ledger.commercialScopeForJob(jobId);
    const scopeSummary = revision => revision ? {
      id: revision.id,
      title: revision.title,
      versionNumber: revision.versionNumber,
      status: revision.status,
      currency: revision.currency,
      allowanceTotal: revision.allowanceTotal,
      integrityValid: revision.integrityValid,
      sourceCurrent: revision.id === scope.currentRevision?.id && !scope.stale,
      approvalStatus: source.records.approvals.find(approval => approval.id === revision.approvalId)?.status || null,
      terms: revision.integrityValid ? {
        scopeSummary: revision.snapshot.scopeSummary,
        inclusions: revision.snapshot.inclusions,
        exclusions: revision.snapshot.exclusions
      } : null
    } : null;
    const closedSelectionStatuses = new Set(['accepted', 'approved', 'client_confirmed', 'locked', 'selected', 'ordered', 'cancelled', 'canceled', 'rejected', 'declined', 'closed']);
    const tasks = new Map(source.records.job_tasks.map(row => [row.id, row]));
    const materials = new Map(source.records.material_requirements.map(row => [row.id, row]));
    const drawings = source.records.drawing_revisions.map(row => this.ledger.mapDocument(row));
    const takeoffItems = source.takeoffs.filter(takeoff => takeoff.status !== 'cancelled' && takeoff.integrityValid !== false)
      .flatMap(takeoff => takeoff.items.map(item => ({ ...item, takeoffId: takeoff.id, takeoffTitle: takeoff.title })));
    const decisions = source.records.client_selections.map(row => {
      const selection = this.ledger.mapClientSelection(row);
      const status = String(selection.status || '').toLowerCase();
      return {
        id: selection.id,
        title: selection.title,
        category: selection.category,
        status: selection.status,
        open: !closedSelectionStatuses.has(status),
        selectedOption: selection.data?.selectedOption || null,
        dueAt: selection.dueAt,
        decidedAt: selection.decidedAt,
        value: selection.value,
        currency: selection.currency,
        approvalId: selection.approvalId,
        approvalStatus: source.records.approvals.find(approval => approval.id === selection.approvalId)?.status || null,
        impactLinks: (Array.isArray(selection.data?.impactLinks) ? selection.data.impactLinks : []).map(link => {
          const target = link.targetType === 'task' ? tasks.get(link.targetId)
            : link.targetType === 'material_requirement' ? materials.get(link.targetId)
              : link.targetType === 'takeoff_item' ? takeoffItems.find(item => item.id === link.targetId)
                : link.targetType === 'drawing_revision' ? drawings.find(item => item.id === link.targetId) : null;
          return { ...link, targetTitle: target?.title || target?.name || null, targetStatus: target?.status || null,
            targetUnit: ['material_requirement', 'takeoff_item'].includes(link.targetType) ? target?.unit || null : null,
            targetCurrent: link.targetType === 'drawing_revision' ? Boolean(target?.current && target.integrityValid)
              : link.targetType === 'takeoff_item' ? Boolean(target && target.takeoffStatus !== 'cancelled') : Boolean(target) };
        })
      };
    });
    return {
      scope: {
        state: !scope.currentRevision ? (scope.pendingRevision ? 'approval_pending' : 'missing') : scope.stale ? 'source_changed' : 'current',
        current: scopeSummary(scope.currentRevision),
        pending: scopeSummary(scope.pendingRevision),
        currentSourceHash: scope.currentSourceHash
      },
      clientDecisions: decisions,
      impactTargets: {
        tasks: source.records.job_tasks.filter(row => !['completed', 'cancelled'].includes(String(row.status).toLowerCase())).map(row => ({ id: row.id, title: row.title, status: row.status })),
        materialRequirements: source.records.material_requirements.filter(row => String(row.status).toLowerCase() !== 'cancelled').map(row => ({ id: row.id, title: row.name, status: row.status, unit: row.unit })),
        takeoffItems: takeoffItems.map(item => ({ id: item.id, title: `${item.takeoffTitle} / ${item.description}`, status: 'current', unit: item.unit })),
        drawingRevisions: drawings.filter(item => item.current && item.integrityValid).map(item => ({ id: item.id, title: `${item.documentNumber} rev ${item.revision} / ${item.title}`, status: item.status })),
        drawingReplacements: drawings.filter(item => item.status === 'pending_approval' && item.integrityValid).flatMap(proposed => {
          const current = drawings.find(item => item.id === proposed.supersedesDocumentId && item.current && item.integrityValid);
          return current ? [{ currentDrawingId: current.id, proposedDrawingId: proposed.id, title: `${current.documentNumber}: ${current.revision} > ${proposed.revision}` }] : [];
        })
      },
      openClientDecisionCount: decisions.filter(decision => decision.open).length,
      mapping: 'operator_review_required_no_automatic_relation_inferred'
    };
  }

  inspect(jobId) {
    const source = this.source(jobId);
    const schedule = this.ledger.calculateJobSchedule(jobId);
    const issues = [];
    if (source.workBalance.enabled && source.workBalance.state !== 'current') issues.push({ code: 'work_balance_review', area: 'planning', state: source.workBalance.state });
    const changedDeliveries = source.workDeliveries.filter(row => row.status === 'retained' && (!row.physical.current || row.response.status === 'source_changed')).length;
    if (changedDeliveries) issues.push({ code: 'delivery_source_changed', area: 'quality', count: changedDeliveries });
    const changedAssetEvents = source.installedAssets.flatMap(row => row.events).filter(row => row.status === 'retained' && !row.sourceCurrent).length;
    if (changedAssetEvents) issues.push({ code: 'asset_history_source_changed', area: 'quality', count: changedAssetEvents });
    const uncovered = source.workDeliveries.filter(row => row.status === 'retained' && row.inspectionCoverage.status !== 'covered').length;
    if (uncovered) issues.push({ code: 'inspection_coverage_incomplete', area: 'quality', count: uncovered });
    if (!schedule.ready) issues.push({ code: schedule.reason, area: 'planning' });
    if (schedule.ready && source.job.target_completion && Date.parse(schedule.plannedEnd) > Date.parse(source.job.target_completion)) issues.push({ code: 'target_exceeded', area: 'customer' });
    const pending = source.records.approvals.filter(row => row.status === 'pending').length;
    if (pending) issues.push({ code: 'pending_approvals', area: 'approvals', count: pending });
    const budgets = source.records.budget_lines;
    const overBudget = budgets.filter(row => Number(row.forecast_amount) > Number(row.budget_amount)).length;
    if (overBudget) issues.push({ code: 'forecast_over_budget', area: 'costs', count: overBudget });
    if (!source.records.commercial_scope_revisions.some(row => row.status === 'approved')) issues.push({ code: 'approved_scope_missing', area: 'customer' });
    const sourceTables = SOURCE_TABLES.map(table => ({ table, scanned: Array.isArray(source.records[table]), rowCount: source.records[table]?.length ?? null }));
    const derivedSources = DERIVED_SOURCES.map(item => ({ name: item.name,
      scanned: item.key === null ? Boolean(schedule) : source[item.key] !== null && source[item.key] !== undefined }));
    const coverage = {
      version: REVIEW_COVERAGE_VERSION,
      complete: sourceTables.every(item => item.scanned) && derivedSources.every(item => item.scanned),
      sourceTables,
      derivedSources,
      checks: REVIEW_CHECKS.map(key => ({ key, evaluated: true }))
    };
    return { jobId, title: source.job.title, status: source.job.status, checkedAt: new Date().toISOString(), sourceHash: hash(source), issues, coverage,
      sources: Object.fromEntries(Object.entries(source.records).map(([key, rows]) => [key, rows.length])) };
  }

  setClientDecisionImpacts(jobId, selectionId, payload, actor) {
    const rawLinks = payload?.links;
    if (!Array.isArray(rawLinks) || rawLinks.length > 50) fail('Provide at most 50 explicit work, material, takeoff or drawing links.');
    const links = rawLinks.map(link => {
      const targetType = link?.targetType;
      const targetId = typeof link?.targetId === 'string' ? link.targetId.trim() : '';
      const rationale = typeof link?.rationale === 'string' ? link.rationale.trim() : '';
      if (!['task', 'material_requirement', 'takeoff_item', 'drawing_revision'].includes(targetType) || !targetId || targetId.length > 120
        || rationale.length < 3 || rationale.length > 500) fail('Each link needs a valid work task or material requirement and a reason of 3 to 500 characters.');
      return { targetType, targetId, rationale };
    });
    const keys = links.map(link => `${link.targetType}:${link.targetId}`);
    if (new Set(keys).size !== links.length) fail('Each task or material requirement may only be linked once per client decision.');
    return this.ledger.transaction(() => {
      this.ledger.requireJob(jobId);
      const row = this.ledger.db.prepare('SELECT * FROM client_selections WHERE id = ? AND job_id = ?').get(selectionId, jobId);
      if (!row) fail('Client decision not found for this job.', 404);
      for (const link of links) {
        const target = link.targetType === 'task'
          ? this.ledger.db.prepare('SELECT id FROM job_tasks WHERE id = ? AND job_id = ? AND status NOT IN (\'completed\', \'cancelled\')').get(link.targetId, jobId)
          : link.targetType === 'material_requirement'
            ? this.ledger.db.prepare("SELECT id FROM material_requirements WHERE id = ? AND job_id = ? AND status <> 'cancelled'").get(link.targetId, jobId)
            : null;
        if (link.targetType === 'takeoff_item') {
          const takeoff = this.ledger.listTakeoffs(jobId).find(sheet => sheet.status !== 'cancelled' && sheet.integrityValid !== false && sheet.items.some(item => item.id === link.targetId));
          if (takeoff) continue;
        }
        if (link.targetType === 'drawing_revision') {
          const drawing = this.ledger.listDrawingRevisions({ jobId }).find(item => item.id === link.targetId);
          if (drawing?.current && drawing.integrityValid) continue;
        }
        if (!target) fail('Every linked record must be active, verified where applicable, and belong to this job.', 409);
      }
      const beforeData = this.ledger.mapClientSelection(row).data || {};
      const beforeLinks = Array.isArray(beforeData.impactLinks) ? beforeData.impactLinks : [];
      if (hash(beforeLinks) === hash(links)) return { selection: this.ledger.mapClientSelection(row), changed: false };
      const afterData = { ...beforeData, impactLinks: links };
      const updatedAt = new Date().toISOString();
      this.ledger.db.prepare('UPDATE client_selections SET data_json = ?, updated_at = ? WHERE id = ? AND job_id = ?')
        .run(JSON.stringify(afterData), updatedAt, selectionId, jobId);
      const after = this.ledger.mapClientSelection(this.ledger.db.prepare('SELECT * FROM client_selections WHERE id = ?').get(selectionId));
      this.ledger.audit({ entityType: 'client_selection', entityId: selectionId, jobId,
        action: 'update_client_selection_impact_links', actor, before: { impactLinks: beforeLinks }, after: { impactLinks: links } });
      return { selection: after, changed: true };
    });
  }

  status() {
    const job = this.ledger.getScheduledJob(JOB_KEY);
    return {
      progress: job?.lastResult?.progress || null,
      running: job?.status === 'running' && Date.parse(job.leaseUntil) > Date.now(),
      leaseUntil: job?.leaseUntil || null,
      nextDueAt: job?.lastCompletedAt ? new Date(Date.parse(job.lastCompletedAt) + job.intervalSeconds * 1000).toISOString() : null,
      automationSuspended: this.ledger.getAutomationControl().suspended === true,
      coverage: { version: REVIEW_COVERAGE_VERSION, allDossierStatuses: true, sourceTables: SOURCE_TABLES,
        derivedSources: DERIVED_SOURCES.map(item => item.name), checks: REVIEW_CHECKS, certification: false }
    };
  }

  dossiers({ after = '', limit = 20 } = {}) {
    const size = bounded(limit, 20, 50);
    const rows = this.ledger.db.prepare('SELECT id, title, status FROM jobs WHERE id > ? ORDER BY id LIMIT ?').all(String(after), size + 1);
    return { rows: rows.slice(0, size), nextCursor: rows.length > size ? rows[size - 1].id : null };
  }

  runBatch({ batchSize = 10, now, actor = 'portfolio_scheduler' } = {}) {
    this.ledger.assertAutomationActive();
    const claim = this.ledger.claimScheduledJob(JOB_KEY, { intervalSeconds: 30, leaseSeconds: 120, now });
    if (!claim.claimed) return { ran: false, reason: claim.reason, ...this.status() };
    const prior = claim.job.lastResult?.progress;
    try {
      return this.ledger.transaction(() => {
        const ids = this.ledger.db.prepare('SELECT id FROM jobs ORDER BY id').all().map(row => row.id);
        const resumable = prior && !prior.finished && prior.coverageVersion === REVIEW_COVERAGE_VERSION;
        const progress = !resumable ? {
          runId: randomUUID(), coverageVersion: REVIEW_COVERAGE_VERSION, startedAt: now || new Date().toISOString(), membershipHash: hash(ids),
          highWaterId: ids.at(-1) || '', cursor: '', total: ids.length, checked: 0, failed: 0, issueCount: 0, coverageIncomplete: 0
        } : { ...prior };
        const batch = this.ledger.db.prepare('SELECT id FROM jobs WHERE id > ? AND id <= ? ORDER BY id LIMIT ?').all(progress.cursor, progress.highWaterId, bounded(batchSize, 10, 50));
        progress.lastBatch = [];
        for (const { id } of batch) {
          let report;
          try { report = this.inspect(id); }
          catch { report = { jobId: id, checkedAt: new Date().toISOString(), failed: true,
            coverage: { version: REVIEW_COVERAGE_VERSION, complete: false, failure: 'review_failed', sourceTables: [], derivedSources: [], checks: [] },
            issues: [{ code: 'review_failed', area: 'data' }] }; }
          progress.checked += 1;
          progress.failed += report.failed ? 1 : 0;
          progress.issueCount += report.issues.length;
          progress.coverageIncomplete += report.coverage?.version === REVIEW_COVERAGE_VERSION && report.coverage.complete === true ? 0 : 1;
          progress.cursor = id;
          progress.lastBatch.push(report);
          this.ledger.audit({ entityType: 'dossier_review', entityId: `${progress.runId}:${id}`, jobId: id, action: 'inspect_dossier', actor, after: report });
        }
        progress.finished = !this.ledger.db.prepare('SELECT id FROM jobs WHERE id > ? AND id <= ? LIMIT 1').get(progress.cursor, progress.highWaterId);
        progress.membershipChanged = hash(ids) !== progress.membershipHash;
        progress.complete = progress.finished && !progress.membershipChanged && progress.checked === progress.total
          && progress.failed === 0 && progress.coverageIncomplete === 0;
        progress.updatedAt = now || new Date().toISOString();
        const completion = this.ledger.completeScheduledJob(JOB_KEY, claim.leaseId, { success: true, progress }, { actor, now });
        if (!completion.completed) fail('Portfolio review lease was lost; batch not retained.', 409);
        return { ran: true, ...this.status() };
      });
    } catch (error) {
      this.ledger.completeScheduledJob(JOB_KEY, claim.leaseId, { success: false, progress: prior || null, error: 'Portfolio batch failed; prior progress retained.' }, { actor, now });
      throw error;
    }
  }

  detail(jobId) {
    return this.ledger.transaction(() => {
      const source = this.source(jobId);
      const sourceHash = hash(source);
      const variations = this.ledger.db.prepare('SELECT * FROM change_orders WHERE job_id = ? ORDER BY created_at DESC, id DESC').all(jobId).map(row => this.ledger.mapChangeOrder(row));
      const reviews = this.ledger.db.prepare("SELECT after_json FROM audit_events WHERE entity_type = 'change_impact_review' AND job_id = ? AND action = 'retain_change_impact' ORDER BY created_at DESC, id DESC LIMIT 20").all(jobId).map(row => JSON.parse(row.after_json)).map(review => {
        const relatedVariations = variations.filter(variation => (
          variation.data?.source?.type === 'change_impact_review'
          && variation.data.source.reviewId === review.id
          && variation.data.source.sourceHash === review.sourceHash
          && variation.formalControl?.evidenceReferences?.includes(`change-impact:${review.id}:${review.sourceHash}`)
        ));
        const comparableSource = relatedVariations.length ? this.source(jobId, {
          excludeChangeOrderIds: relatedVariations.map(variation => variation.id),
          excludeApprovalIds: relatedVariations.map(variation => variation.approvalId).filter(Boolean)
        }) : source;
        const internallyApproved = relatedVariations.length === 1
          && relatedVariations[0].status === 'approved'
          && relatedVariations[0].approvalId
          && this.ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(relatedVariations[0].approvalId)?.status === 'approved';
        if (internallyApproved) comparableSource.job.approval_state = review.sourceApprovalState;
        return {
          ...review,
          sourceCurrent: review.sourceHash === hash(comparableSource),
          relatedVariations: relatedVariations.map(variation => ({
            id: variation.id,
            variationNumber: variation.variationNumber,
            revisionNumber: variation.revisionNumber,
            status: variation.status,
            approvalId: variation.approvalId,
            approvalStatus: variation.approvalId ? this.ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(variation.approvalId)?.status || null : null,
            workAuthorized: variation.workAuthorized
          }))
        };
      });
      const schedule = this.ledger.calculateJobSchedule(jobId);
      const materialRequirements = this.ledger.db.prepare("SELECT * FROM material_requirements WHERE job_id = ? AND status <> 'cancelled' ORDER BY created_at, id")
        .all(jobId).map(row => this.ledger.mapMaterialRequirement(row));
      const linkedTasks = this.ledger.db.prepare("SELECT * FROM job_tasks WHERE job_id = ? AND status NOT IN ('completed', 'cancelled') ORDER BY id")
        .all(jobId).map(row => this.ledger.mapTask(row));
      for (const requirement of materialRequirements) {
        requirement.linkedTasks = linkedTasks.filter(task => (task.data?.materialRequirementIds || []).includes(requirement.id))
          .map(task => ({ id: task.id, title: task.title, status: task.status }));
      }
      return { job: this.ledger.mapJob(source.job), sourceHash, schedule,
        takeoffs: source.takeoffs.map(({ id, title, status, currency, integrityValid, items }) => ({ id, title, status, currency, integrityValid, items })),
        materialRequirements,
        contractualContext: this.contractualContext(jobId, source),
        reviews, reviewsLimit: 20 };
    });
  }

  scenario(payload) {
    const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
    if (!reason || reason.length > 2000) fail('A change reason of 1 to 2000 characters is required.');
    const taskId = typeof payload.taskId === 'string' ? payload.taskId : '';
    const durationHours = Number(payload.durationHours);
    if (!taskId || !Number.isFinite(durationHours) || durationHours <= 0 || durationHours > 100000) fail('Select an active dossier task and a duration between 0 and 100000 hours.');
    const costDelta = Number(payload.costDelta ?? 0);
    const revenueDelta = Number(payload.revenueDelta ?? 0);
    if (![costDelta, revenueDelta].every(value => Number.isFinite(value) && Math.abs(value) <= 1e9)) fail('Cost and revenue changes must be finite amounts within one billion.');
    const currency = String(payload.currency || 'EUR').toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) fail('A three-letter currency is required.');
    const rawQuantityChanges = payload.quantityChanges ?? [];
    if (!Array.isArray(rawQuantityChanges) || rawQuantityChanges.length > 50) fail('Enter at most 50 takeoff quantity changes.');
    const quantityChanges = rawQuantityChanges.map(change => {
      const itemId = typeof change?.itemId === 'string' ? change.itemId : '';
      const quantity = Number(change?.quantity);
      if (!itemId || !Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000_000) fail('Each proposed takeoff quantity must be between zero and one billion.');
      return { itemId, quantity };
    });
    if (new Set(quantityChanges.map(change => change.itemId)).size !== quantityChanges.length) fail('A takeoff item may only be changed once per scenario.');
    const rawMaterialChanges = payload.materialChanges ?? [];
    if (!Array.isArray(rawMaterialChanges) || rawMaterialChanges.length > 50) fail('Enter at most 50 material quantity changes.');
    const materialChanges = rawMaterialChanges.map(change => {
      const requirementId = typeof change?.requirementId === 'string' ? change.requirementId : '';
      const quantity = Number(change?.quantity);
      if (!requirementId || !Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000_000
        || Math.abs(Math.round(quantity * 10000) / 10000 - quantity) > 0.000000001) {
        fail('Each proposed material quantity must be between zero and one billion with at most four decimal places.');
      }
      return { requirementId, quantity };
    });
    if (new Set(materialChanges.map(change => change.requirementId)).size !== materialChanges.length) fail('A material requirement may only be changed once per scenario.');
    const rawDrawingChanges = payload.drawingChanges ?? [];
    if (!Array.isArray(rawDrawingChanges) || rawDrawingChanges.length > 50) fail('Enter at most 50 drawing revision replacements.');
    const drawingChanges = rawDrawingChanges.map(change => {
      const currentDrawingId = typeof change?.currentDrawingId === 'string' ? change.currentDrawingId : '';
      const proposedDrawingId = typeof change?.proposedDrawingId === 'string' ? change.proposedDrawingId : '';
      if (!currentDrawingId || !proposedDrawingId || currentDrawingId === proposedDrawingId) fail('Select a current drawing and its proposed replacement.');
      return { currentDrawingId, proposedDrawingId };
    });
    if (new Set(drawingChanges.map(change => change.currentDrawingId)).size !== drawingChanges.length) fail('A drawing sheet may only be replaced once per scenario.');
    return { reason, taskId, durationHours, costDelta: money(costDelta), revenueDelta: money(revenueDelta), currency, quantityChanges, materialChanges, drawingChanges };
  }

  takeoffImpact(quantityChanges, takeoffs, scenarioCurrency) {
    const items = new Map((takeoffs || []).flatMap(takeoff => takeoff.items.map(item => [item.id, { ...item, takeoff }])));
    const changes = quantityChanges.map(change => {
      const item = items.get(change.itemId);
      if (!item || item.takeoff.status === 'cancelled' || item.takeoff.integrityValid === false) {
        fail('A selected takeoff item is missing, cancelled, or failed its integrity check.', 409);
      }
      const quantityDelta = Math.round((change.quantity - Number(item.quantity)) * 1_000_000) / 1_000_000;
      return { itemId: item.id, takeoffId: item.takeoff.id, takeoffTitle: item.takeoff.title,
        description: item.description, wbsCode: item.wbsCode, workPackage: item.workPackage,
        currentQuantity: Number(item.quantity), proposedQuantity: change.quantity, quantityDelta, unit: item.unit,
        unitCost: Number(item.unitCost), unitPrice: Number(item.unitPrice),
        costDelta: money(quantityDelta * Number(item.unitCost)), revenueDelta: money(quantityDelta * Number(item.unitPrice)),
        currency: item.takeoff.currency, sourceStatus: item.takeoff.status };
    });
    const currencies = [...new Set(changes.map(change => change.currency))];
    const costDelta = money(changes.reduce((sum, change) => sum + change.costDelta, 0));
    const revenueDelta = money(changes.reduce((sum, change) => sum + change.revenueDelta, 0));
    if (Math.abs(costDelta) > 1e9 || Math.abs(revenueDelta) > 1e9) fail('Calculated takeoff deltas exceed the supported one-billion scenario limit.');
    return { changes, costDelta, revenueDelta, currencies,
      currencyMismatch: currencies.some(currency => currency !== scenarioCurrency) };
  }

  materialImpact(materialChanges, jobId, schedule) {
    const requirements = this.ledger.db.prepare("SELECT * FROM material_requirements WHERE job_id = ? AND status <> 'cancelled' ORDER BY id").all(jobId)
      .map(row => this.ledger.mapMaterialRequirement(row));
    const byId = new Map(requirements.map(requirement => [requirement.id, requirement]));
    const activeTasks = this.ledger.db.prepare("SELECT * FROM job_tasks WHERE job_id = ? AND status NOT IN ('completed', 'cancelled') ORDER BY id").all(jobId)
      .map(row => this.ledger.mapTask(row));
    const incomingByRequirement = new Map();
    const linkedOrdersByRequirement = new Map();
    const orders = this.ledger.db.prepare("SELECT id FROM purchase_orders WHERE job_id = ? AND status NOT IN ('cancelled', 'rejected', 'void') ORDER BY id").all(jobId)
      .map(({ id }) => this.ledger.getPurchaseOrder(id));
    for (const order of orders) {
      const plan = this.ledger.materialReceiptPurchaseOrderPlan(order.id, { includeFinancials: false });
      for (const line of plan.lines) {
        const sourceItem = order.items?.[line.purchaseOrderLineIndex];
        const explicitRequirementId = sourceItem?.materialRequirementId || sourceItem?.material_requirement_id || null;
        if (!line.materialRequirementId || explicitRequirementId !== line.materialRequirementId) continue;
        const linkedLine = {
          purchaseOrderId: order.id,
          orderReference: order.data?.orderReference || order.issuePackage?.issueReference || order.id,
          supplier: order.supplier || null,
          status: order.status,
          currency: order.currency,
          requiredBy: order.requiredBy || null,
          orderIssued: order.orderIssued === true,
          externalCommitments: order.externalCommitments,
          orderedQuantity: Number(line.orderedQuantity || 0),
          receivedQuantity: Number(line.receivedQuantity || 0),
          acceptedQuantity: Number(line.acceptedQuantity || 0),
          damagedQuantity: Number(line.damagedQuantity || 0),
          remainingQuantity: Number(line.remainingQuantity || 0)
        };
        const linkedLines = linkedOrdersByRequirement.get(line.materialRequirementId) || [];
        linkedLines.push(linkedLine);
        linkedOrdersByRequirement.set(line.materialRequirementId, linkedLines);
        if (order.orderIssued === true && order.externalCommitments === 1) {
          incomingByRequirement.set(line.materialRequirementId,
            (incomingByRequirement.get(line.materialRequirementId) || 0) + linkedLine.remainingQuantity);
        }
      }
    }
    const changes = materialChanges.map(change => {
      const requirement = byId.get(change.requirementId);
      if (!requirement) fail('A selected material requirement is missing, cancelled, or belongs to another dossier.', 409);
      const currentQuantity = Number(requirement.quantity || 0);
      const availableQuantity = Math.max(0, Number(requirement.data?.availableQuantity || 0));
      const incomingQuantity = Math.max(0, incomingByRequirement.get(requirement.id) || 0);
      const linkedPurchaseOrders = linkedOrdersByRequirement.get(requirement.id) || [];
      const existingConstraints = (schedule.materialConstraints || []).filter(item => item.materialRequirementId === requirement.id);
      const linkedTaskIds = new Set(activeTasks.filter(task => (task.data?.materialRequirementIds || []).includes(requirement.id)).map(task => task.id));
      const affectedTasks = activeTasks.filter(task => linkedTaskIds.has(task.id)).map(task => {
        const currentConstraint = existingConstraints.find(item => item.taskId === task.id) || null;
        return { id: task.id, title: task.title, status: task.status,
          plannedStart: schedule.tasks?.find(item => item.id === task.id)?.plannedStart || null,
          currentMaterialBlocker: currentConstraint?.blocker === true };
      });
      const readiness = !affectedTasks.length ? 'no_linked_active_task'
        : (Math.max(0, change.quantity - availableQuantity - incomingQuantity) <= 0 ? 'covered_by_stock_and_issued_orders'
          : (change.quantity > currentQuantity ? 'additional_supply_confirmation_required'
            : (existingConstraints.length && existingConstraints.every(item => !item.blocker)
              ? 'existing_supplier_eta_applies' : 'work_already_material_blocked')));
      return { requirementId: requirement.id, name: requirement.name, unit: requirement.unit, status: requirement.status,
        currentQuantity, proposedQuantity: change.quantity,
        quantityDelta: Math.round((change.quantity - currentQuantity) * 10000) / 10000,
        availableQuantity, incomingQuantity,
        currentShortfall: Math.round(Math.max(0, currentQuantity - availableQuantity - incomingQuantity) * 10000) / 10000,
        proposedShortfall: Math.round(Math.max(0, change.quantity - availableQuantity - incomingQuantity) * 10000) / 10000,
        neededBy: requirement.neededBy, supplier: requirement.supplier, readiness, affectedTasks, linkedPurchaseOrders };
    });
    return { changes, affectedTaskCount: new Set(changes.flatMap(change => change.affectedTasks.map(task => task.id))).size };
  }

  preview(jobId, payload) {
    return this.ledger.transaction(() => {
      const scenario = this.scenario(payload);
      const source = this.source(jobId);
      const drawings = source.records.drawing_revisions.map(row => this.ledger.mapDocument(row));
      const drawingImpact = scenario.drawingChanges.map(change => {
        const current = drawings.find(item => item.id === change.currentDrawingId);
        const proposed = drawings.find(item => item.id === change.proposedDrawingId);
        if (!current || !current.current || !current.integrityValid || !proposed || proposed.status !== 'pending_approval'
          || !proposed.integrityValid || proposed.supersedesDocumentId !== current.id || proposed.documentNumber !== current.documentNumber) {
          fail('A drawing replacement must match the verified current revision and a verified, pending replacement of the same sheet.', 409);
        }
        return { currentDrawingId: current.id, sheetNumber: current.documentNumber, currentRevision: current.revision,
          proposedDrawingId: proposed.id, proposedRevision: proposed.revision, title: proposed.title,
          approvalStatus: source.records.approvals.find(approval => approval.id === proposed.approvalId)?.status || 'unknown',
          status: 'pending_approval', currentSourceHash: current.sourceHash, proposedSourceHash: proposed.sourceHash };
      });
      const takeoffImpact = this.takeoffImpact(scenario.quantityChanges, source.takeoffs, scenario.currency);
      const before = this.ledger.calculateJobSchedule(jobId);
      const materialImpact = this.materialImpact(scenario.materialChanges, jobId, before);
      const after = this.ledger.calculateJobSchedule(jobId, {}, [{ id: scenario.taskId, durationHours: scenario.durationHours }]);
      const affectedTasks = before.ready && after.ready ? after.tasks.flatMap(task => {
        const previous = before.tasks.find(row => row.id === task.id);
        return previous.plannedStart !== task.plannedStart || previous.plannedEnd !== task.plannedEnd ? [{ id: task.id, title: task.title, beforeStart: previous.plannedStart, beforeEnd: previous.plannedEnd, afterStart: task.plannedStart, afterEnd: task.plannedEnd }] : [];
      }) : [];
      const currencies = [...new Set([...source.records.budget_lines, ...source.records.purchase_orders, ...source.records.billing_milestones].map(row => row.currency).filter(Boolean))];
      const takeoffCanConsolidate = !takeoffImpact.currencyMismatch;
      const combinedCostDelta = money(scenario.costDelta + (takeoffCanConsolidate ? takeoffImpact.costDelta : 0));
      const combinedRevenueDelta = money(scenario.revenueDelta + (takeoffCanConsolidate ? takeoffImpact.revenueDelta : 0));
      if (Math.abs(combinedCostDelta) > 1e9 || Math.abs(combinedRevenueDelta) > 1e9) fail('Combined scenario deltas exceed the supported one-billion limit.');
      const contractualCompletionDates = source.clientDates.commitments
        .filter(item => item.status === 'active' && item.dateKind === 'complete_by')
        .map(item => ({
          entryKey: item.entryKey, label: item.label, date: item.date, sourceCurrent: item.sourceCurrent,
          evidenceReference: item.evidenceReference,
          currentForecast: before.ready ? completionForecast(before.plannedEnd, item) : { status: 'unknown', daysLate: null },
          proposedForecast: after.ready ? completionForecast(after.plannedEnd, item) : { status: 'unknown', daysLate: null }
        }));
      const affectedTaskIds = new Set([scenario.taskId, ...affectedTasks.map(task => task.id)]);
      const changedMaterialIds = new Set(scenario.materialChanges.map(change => change.requirementId));
      const changedTakeoffIds = new Set(scenario.quantityChanges.map(change => change.itemId));
      const changedDrawingIds = new Set(scenario.drawingChanges.map(change => change.currentDrawingId));
      const affectedClientDecisions = this.contractualContext(jobId, source).clientDecisions.flatMap(decision => {
        const affectedLinks = decision.impactLinks.filter(link => (
          link.targetType === 'task' && affectedTaskIds.has(link.targetId)
        ) || (
          link.targetType === 'material_requirement' && changedMaterialIds.has(link.targetId)
        ) || (
          link.targetType === 'takeoff_item' && changedTakeoffIds.has(link.targetId)
        ) || (
          link.targetType === 'drawing_revision' && changedDrawingIds.has(link.targetId)
        ));
        return affectedLinks.length ? [{ id: decision.id, title: decision.title, status: decision.status,
          selectedOption: decision.selectedOption, links: affectedLinks }] : [];
      });
      const affectedDependencies = this.ledger.db.prepare(`
        SELECT dependencies.id, dependencies.predecessor_task_id AS predecessorTaskId,
          predecessor.title AS predecessorTitle, dependencies.successor_task_id AS successorTaskId,
          successor.title AS successorTitle, dependencies.dependency_type AS dependencyType,
          dependencies.lag_hours AS lagHours
        FROM task_dependencies dependencies
        JOIN job_tasks predecessor ON predecessor.id = dependencies.predecessor_task_id
        JOIN job_tasks successor ON successor.id = dependencies.successor_task_id
        WHERE dependencies.job_id = ? AND dependencies.status = 'active'
        ORDER BY dependencies.id
      `).all(jobId).filter(dependency => affectedTaskIds.has(dependency.predecessorTaskId) || affectedTaskIds.has(dependency.successorTaskId));
      return {
        version: 4, jobId, sourceHash: hash(source), sourceApprovalState: source.job.approval_state, scenario, status: 'internal_analysis', externalActions: false,
        schedule: { ready: before.ready && after.ready, reason: !before.ready ? before.reason : after.reason, calculationMode: 'elapsed_hours', beforeEnd: before.plannedEnd, afterEnd: after.plannedEnd, finishDeltaHours: hours(before.plannedEnd, after.plannedEnd), affectedTasks, affectedDependencies, targetCompletion: source.job.target_completion, targetExceeded: after.ready && Boolean(source.job.target_completion) ? Date.parse(after.plannedEnd) > Date.parse(source.job.target_completion) : null, contractualCompletionDates },
        financial: { currency: scenario.currency, costDelta: combinedCostDelta, revenueDelta: combinedRevenueDelta,
          operatorCostDelta: scenario.costDelta, operatorRevenueDelta: scenario.revenueDelta,
          takeoffCostDelta: takeoffCanConsolidate ? takeoffImpact.costDelta : null, takeoffRevenueDelta: takeoffCanConsolidate ? takeoffImpact.revenueDelta : null,
          marginDelta: money(scenario.revenueDelta + (takeoffCanConsolidate ? takeoffImpact.revenueDelta : 0) - scenario.costDelta - (takeoffCanConsolidate ? takeoffImpact.costDelta : 0)),
          basis: 'operator_estimate_and_server_calculated_takeoff_delta_not_approved', recordedCurrencies: currencies,
          currencyMismatch: currencies.some(currency => currency !== scenario.currency) || takeoffImpact.currencyMismatch },
        quantityImpact: takeoffImpact,
        drawingImpact,
        materialImpact,
        affectedClientDecisions,
        contractualContext: this.contractualContext(jobId, source),
        linked: { assignments: source.records.assignments.map(row => ({ id: row.id, status: row.status })), purchases: source.records.purchase_orders.map(row => ({ id: row.id, status: row.status, requiredBy: row.required_by })), milestones: source.records.billing_milestones.map(row => ({ id: row.id, status: row.status })), scopes: source.records.commercial_scope_revisions.map(row => ({ id: row.id, status: row.status })), clientDecisions: source.records.client_selections.map(row => ({ id: row.id, status: row.status })), changes: source.records.change_orders.map(row => ({ id: row.id, status: row.status })), takeoffs: source.takeoffs.map(takeoff => ({ id: takeoff.id, status: takeoff.status, itemCount: takeoff.items.length })), pendingApprovals: source.records.approvals.filter(row => row.status === 'pending').map(row => ({ id: row.id, status: row.status })) },
        limitations: ['elapsed_hours_not_work_calendar', 'contract_completion_compared_by_calendar_day', 'linked_records_require_operator_review', 'client_decision_links_are_explicit_operator_assertions_not_automatic_scope_or_cost_changes', 'costs_are_operator_estimates', 'takeoff_rates_are_existing_estimate_rates', 'drawing_replacements_remain_pending_separate_governed_approval', 'no_contract_schedule_or_payment_changes']
      };
    });
  }

  retain(jobId, payload, actor) {
    return this.ledger.transaction(() => {
      const scenario = this.scenario(payload);
      if (typeof payload.entryKey !== 'string' || !/^[a-zA-Z0-9_-]{8,100}$/.test(payload.entryKey)) fail('A stable review key of 8 to 100 letters, digits, hyphens or underscores is required.');
      if (!/^[a-f0-9]{64}$/.test(payload.sourceHash || '')) fail('Preview this change before retaining it.');
      const id = `impact_${hash([jobId, payload.entryKey])}`;
      const requestHash = hash({ scenario, sourceHash: payload.sourceHash });
      const existing = this.ledger.db.prepare("SELECT after_json FROM audit_events WHERE entity_type = 'change_impact_review' AND entity_id = ? AND action = 'retain_change_impact'").get(id);
      if (existing) {
        const review = JSON.parse(existing.after_json);
        if (review.requestHash !== requestHash) fail('This review key was already used for a different proposal.', 409);
        return { replayed: true, review: { ...review, sourceCurrent: review.sourceHash === hash(this.source(jobId)) } };
      }
      const preview = this.preview(jobId, scenario);
      if (preview.sourceHash !== payload.sourceHash) fail('Dossier data changed. Preview the impact again before retaining it.', 409);
      const review = { ...preview, id, requestHash, retainedAt: new Date().toISOString(), retainedBy: actor };
      this.ledger.audit({ entityType: 'change_impact_review', entityId: id, jobId, action: 'retain_change_impact', actor, after: review });
      return { replayed: false, review: { ...review, sourceCurrent: true } };
    });
  }

  prepareVariation(jobId, payload, actor) {
    return this.ledger.transaction(() => {
      const reviewId = typeof payload.reviewId === 'string' ? payload.reviewId : '';
      const sourceHash = typeof payload.sourceHash === 'string' ? payload.sourceHash : '';
      const entryKey = typeof payload.entryKey === 'string' ? payload.entryKey : '';
      if (!reviewId || !/^[a-f0-9]{64}$/.test(sourceHash) || !/^[A-Za-z0-9._:-]{8,160}$/.test(entryKey)) {
        fail('A retained impact analysis, its source hash, and a stable variation key are required.');
      }
      const event = this.ledger.db.prepare("SELECT after_json FROM audit_events WHERE entity_type = 'change_impact_review' AND entity_id = ? AND job_id = ? AND action = 'retain_change_impact'").get(reviewId, jobId);
      if (!event || !this.ledger.verifyAuditIntegrity().valid) fail('The retained impact analysis could not be verified.', 409);
      const review = JSON.parse(event.after_json);
      if (review.id !== reviewId || review.jobId !== jobId || review.sourceHash !== sourceHash || review.status !== 'internal_analysis') {
        fail('The selected analysis does not match this job and source version.', 409);
      }
      const evidenceReference = `change-impact:${review.id}:${review.sourceHash}`;
      const replayRow = this.ledger.db.prepare('SELECT * FROM change_orders WHERE entry_key = ?').get(entryKey);
      if (replayRow) {
        const prior = this.ledger.mapChangeOrder(replayRow);
        if (prior.jobId !== jobId || prior.data?.source?.type !== 'change_impact_review'
          || prior.data.source.reviewId !== reviewId || prior.data.source.sourceHash !== sourceHash
          || !prior.formalControl?.evidenceReferences?.includes(evidenceReference)) {
          fail('This variation key belongs to a different proposal.', 409);
        }
        return { changeOrder: { ...prior, replayed: true }, replayed: true, externalCommitments: 0 };
      }
      const existingLinked = this.ledger.db.prepare('SELECT * FROM change_orders WHERE job_id = ? ORDER BY created_at, id').all(jobId)
        .map(row => this.ledger.mapChangeOrder(row))
        .find(variation => variation.formalControl?.evidenceReferences?.includes(evidenceReference));
      if (existingLinked) fail('A formal variation draft already exists for this impact analysis.', 409);
      if (review.sourceHash !== hash(this.source(jobId))) fail('The dossier changed after analysis. Re-run and retain the impact review before preparing a variation.', 409);
      if (!review.schedule?.ready) fail('A formal variation requires a complete schedule impact analysis.', 409);
      if (review.financial?.currencyMismatch) fail('Mixed-currency records must be reconciled before preparing a priced variation.', 409);
      const amount = Number(payload.amount);
      if (!Number.isFinite(amount) || Math.abs(amount) > 1e9) fail('Enter an explicit net variation amount within one billion.');
      const scopeDelta = String(payload.scopeDelta || '').trim();
      if (scopeDelta.length < 3) fail('Describe the proposed scope change before preparing a variation.');
      const scheduleDeltaDays = Number(payload.scheduleDeltaDays ?? 0);
      if (!Number.isFinite(scheduleDeltaDays) || Math.abs(scheduleDeltaDays) > 3650) fail('Schedule impact must be between -3,650 and 3,650 days.');
      const changeOrder = this.ledger.createChangeOrder(jobId, {
        ...payload,
        entryKey,
        title: payload.title,
        scopeDelta,
        currency: review.financial.currency,
        amount,
        scheduleDeltaDays,
        scheduleImpactNarrative: payload.scheduleImpactNarrative || (scheduleDeltaDays === 0
          ? 'No calendar-day change is proposed; the internal impact analysis reports elapsed-hour effects separately.'
          : `The operator proposes a ${scheduleDeltaDays}-day calendar adjustment; review against the contract and working calendar.`),
        cause: payload.cause || review.scenario.reason,
        justification: payload.justification || review.scenario.reason,
        initiatedBy: payload.initiatedBy || 'contractor',
        variationType: payload.variationType || 'other',
        status: 'draft',
        requiresApproval: true,
        lineItems: [{ description: scopeDelta, quantity: 1, unitPrice: amount, costCode: 'change_order' }],
        evidenceReferences: [...new Set([...(Array.isArray(payload.evidenceReferences) ? payload.evidenceReferences : []), evidenceReference])],
        source: { type: 'change_impact_review', reviewId, sourceHash },
        notes: payload.notes || `Internal time and financial scenario ${review.id}; operator entered the proposed variation price separately.`
      }, { actor });
      return { changeOrder: { ...changeOrder, replayed: false }, replayed: false, externalCommitments: 0 };
    });
  }
}

module.exports = { ContractorReview };
