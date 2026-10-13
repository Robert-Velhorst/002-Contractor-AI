const { createHash } = require('node:crypto');
const { fieldTaskScope } = require('./field-task-scope');
const { fieldJhaRecords, fieldSdsRecords } = require('./field-safety-projection');
const { normalizeSubmittalAttachmentManifest, submittalAttachmentManifest } = require('./submittal-attachment-manifest');
const { workerMatchesAssignmentTradePartner } = require('./work-board-company-scope');

const pick = (row, keys) => Object.fromEntries(keys.map(key => [key, row[key] ?? null]));
const omit = (row, keys) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)));
const START_RELEASE_CHECKS = ['siteConditionsChecked', 'methodAndControlsReviewed', 'requiredPermitsConfirmed', 'crewAndQualificationsChecked', 'equipmentAndPpeAvailable', 'emergencyArrangementsKnown'];
function fingerprint(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function normalizeRole(value) { return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('nl-NL').replace(/[^\p{L}\p{N}]+/gu, ' '); }
function invalid(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }

class FieldWorkPack {
  constructor(ledger) { this.ledger = ledger; }

  dailyBriefingForAssignment(jobId, workerId, assignment) {
    const workDate = String(assignment.scheduledStart || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(workDate)) return { status: 'not_recorded' };
    const dateAnchor = Date.parse(`${workDate}T00:00:00.000Z`);
    const candidateDates = [-1, 0, 1].map(offset => new Date(dateAnchor + offset * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    const cycles = [...new Map(candidateDates.flatMap(candidateDate =>
      this.ledger.listDailyOperatingCycles({ jobId, workDate: candidateDate, limit: 100 })
        .map(cycle => [cycle.id, cycle])
    )).values()];
    const currentStart = Date.parse(assignment.scheduledStart), currentEnd = Date.parse(assignment.scheduledEnd);
    const overlaps = (start, end) => {
      const otherStart = Date.parse(start || ''), otherEnd = Date.parse(end || '');
      return !Number.isFinite(otherStart) || !Number.isFinite(otherEnd)
        || currentStart < otherEnd && currentEnd > otherStart;
    };
    const relevantCycles = cycles.filter(cycle => (cycle.huddleSnapshot?.crewSchedule || cycle.huddleSnapshot?.crew || []).some(member =>
      overlaps(member.scheduledStart, member.scheduledEnd)
    )).sort((left, right) => Date.parse(right.huddleSnapshot?.retainedAt || 0) - Date.parse(left.huddleSnapshot?.retainedAt || 0));
    if (relevantCycles.length) {
      const cycle = relevantCycles[0], snapshot = cycle.huddleSnapshot;
      const member = (snapshot.crewSchedule || snapshot.crew).find(row => row.workerId === workerId && row.assignmentId === assignment.id);
      if (!member) return { status: 'crew_update_required', workDate, shiftLabel: cycle.shiftLabel || null };
      const shiftCurrent = member.scheduledStart === assignment.scheduledStart && member.scheduledEnd === assignment.scheduledEnd;
      if (!cycle.huddleIntegrityValid || cycle.status !== 'released' || snapshot.status !== 'released' || !shiftCurrent) {
        return { status: 'needs_review', workDate, shiftLabel: cycle.shiftLabel || null };
      }
      return {
        status: 'ready', cycleId: cycle.id, workDate: snapshot.workDate || cycle.workDate, shiftLabel: cycle.shiftLabel,
        facilitator: snapshot.facilitator, plannedWork: snapshot.plannedWork,
        productionTarget: snapshot.productionTarget, weather: snapshot.weather,
        siteConditions: snapshot.siteConditions, safetyFocus: snapshot.safetyFocus,
        qualityHoldPoints: snapshot.qualityHoldPoints || [], constraints: snapshot.constraints || [],
        evidenceReference: snapshot.evidenceReference, retainedAt: snapshot.retainedAt,
        sourceHash: snapshot.sourceHash
      };
    }
    return { status: 'not_recorded', workDate };
  }

  list(scope, { after = '', limit = 20 } = {}) {
    const size = Number.isSafeInteger(Number(limit)) ? Math.max(1, Math.min(50, Number(limit))) : 20;
    const conditions = ["j.id > ?", this.ledger.operationalJobStatusSql('j')];
    const query = this.ledger.db.prepare(`SELECT j.id, j.title, j.address, j.city, j.status, j.scheduled_start AS scheduledStart FROM jobs j WHERE ${conditions.join(' AND ')} ORDER BY j.id LIMIT ?`);
    if (!scope) {
      const rows = query.all(String(after), size + 1);
      return { rows: rows.slice(0, size), nextCursor: rows.length > size ? rows[size - 1].id : null };
    }
    const rows = [];
    let cursor = String(after);
    const activeStatusSql = this.ledger.activeAssignmentStatusSql();
    const assignments = this.ledger.db.prepare(`SELECT * FROM assignments WHERE job_id = ? AND worker_id = ? AND ${activeStatusSql}`);
    while (rows.length <= size) {
      const batch = query.all(cursor, 200);
      if (!batch.length) break;
      for (const job of batch) {
        cursor = job.id;
        if (assignments.all(job.id, scope.workerId || '').some(assignment => (
          workerMatchesAssignmentTradePartner(this.ledger.db, assignment, scope.workerId)
        ))) rows.push(job);
        if (rows.length > size) break;
      }
      if (batch.length < 200 || rows.length > size) break;
    }
    return { rows: rows.slice(0, size), nextCursor: rows.length > size ? rows[size - 1].id : null };
  }

  workers(jobId) {
    this.ledger.requireJob(jobId);
    return this.ledger.db.prepare(`SELECT DISTINCT w.id, w.name FROM assignments a JOIN workers w ON w.id = a.worker_id WHERE a.job_id = ? AND ${this.ledger.activeAssignmentStatusSql('a')} ORDER BY w.name, w.id`).all(jobId);
  }

  assertAssigned(jobId, workerId) {
    this.ledger.requireJob(jobId);
    const assignments = workerId ? this.ledger.db.prepare(`SELECT * FROM assignments WHERE job_id = ? AND worker_id = ? AND ${this.ledger.activeAssignmentStatusSql()}`)
      .all(jobId, workerId).filter(assignment => workerMatchesAssignmentTradePartner(this.ledger.db, assignment, workerId)) : [];
    if (!assignments.length) invalid('This work pack requires an active assignment for the named worker.', 403);
    return new Set(assignments.map(row => row.id));
  }

  drawingFile(jobId, workerId, drawingId, sourceHash) {
    const pack = this.snapshot(jobId, workerId);
    if (sourceHash && sourceHash !== pack.sourceHash) invalid('The work-pack revision changed. Download the current version.', 409);
    const document = this.ledger.getDrawingRevision(drawingId, { jobId });
    const approval = this.ledger.db.prepare('SELECT status FROM approvals WHERE id = ? AND target_id = ?').get(document.approvalId, document.id);
    const sha256 = document.data?.sourceDocumentChecksum;
    if (!document.current || !document.integrityValid || approval?.status !== 'approved' || !/^[a-f0-9]{64}$/.test(sha256 || '')
      || document.mimeType !== 'application/pdf' || document.sizeBytes < 1 || document.sizeBytes > 8 * 1024 * 1024) invalid('A current approved PDF within the 8 MB offline limit is required.', 409);
    if (!pack.know.drawings.some(row => row.id === drawingId)) invalid('This drawing is outside the assigned work-pack scope.', 404);
    return { document, sha256 };
  }

  sdsFile(jobId, workerId, sdsSheetId, sourceHash) {
    const pack = this.snapshot(jobId, workerId);
    if (sourceHash && sourceHash !== pack.sourceHash) invalid('The work-pack revision changed. Download the current version.', 409);
    if (!pack.know.sdsSheets.some(row => row.id === sdsSheetId)) invalid('This safety data sheet is outside the assigned work-pack scope.', 404);
    const sheet = this.ledger.getSdsSheet(sdsSheetId, { jobId });
    const projected = fieldSdsRecords(this.ledger, [sheet])[0];
    if (!projected?.file || !sheet.documentId) invalid('The SDS PDF is not a current, approved and intact field document.', 409);
    const document = this.ledger.getDocument(sheet.documentId);
    const sha256 = sheet.data?.documentChecksum;
    if (!document || document.mimeType !== 'application/pdf' || document.sizeBytes < 1 || document.sizeBytes > 8 * 1024 * 1024
      || ['cancelled', 'rejected', 'superseded', 'void'].includes(String(document.status || '').toLowerCase())
      || !/^[a-f0-9]{64}$/.test(sha256 || '')) {
      invalid('The SDS PDF is unavailable or outside the verified 8 MB limit.', 409);
    }
    return { document, sha256 };
  }

  approvedSubmittals(detail, { hasPositionTaskScope, visibleTaskIds }) {
    const visibleStatuses = new Set(['approved', 'accepted', 'issued', 'sent', 'client_visible']);
    return detail.submittals.flatMap(record => {
      if (!visibleStatuses.has(String(record.status || '').toLowerCase()) || !record.approvalId) return [];
      const approval = this.ledger.db.prepare(`SELECT status, data_json FROM approvals
        WHERE id = ? AND target_type = 'submittal_record' AND target_id = ?`).get(record.approvalId, record.id);
      if (approval?.status !== 'approved') return [];
      let approvedData;
      try { approvedData = typeof approval.data_json === 'string' ? JSON.parse(approval.data_json) : approval.data_json; } catch { return []; }
      const taskIds = [...new Set(Array.isArray(record.data?.taskIds) ? record.data.taskIds : [])].sort();
      const approvedTaskIds = [...new Set(Array.isArray(approvedData?.taskIds) ? approvedData.taskIds : [])].sort();
      const attachmentIds = [...new Set(Array.isArray(record.attachments) ? record.attachments : [])].sort();
      const approvedAttachmentIds = [...new Set(Array.isArray(approvedData?.attachments) ? approvedData.attachments : [])].sort();
      if (JSON.stringify(taskIds) !== JSON.stringify(approvedTaskIds)
        || JSON.stringify(attachmentIds) !== JSON.stringify(approvedAttachmentIds)
        || (hasPositionTaskScope && taskIds.length && !taskIds.some(taskId => visibleTaskIds.has(taskId)))) return [];
      let documents = [];
      if (Array.isArray(approvedData.attachmentManifest)) {
        const approvedManifest = normalizeSubmittalAttachmentManifest(approvedData.attachmentManifest);
        const currentManifest = normalizeSubmittalAttachmentManifest(submittalAttachmentManifest(detail.documents, record.jobId, attachmentIds));
        if (JSON.stringify(approvedManifest) !== JSON.stringify(currentManifest)) return [];
        documents = approvedManifest.filter(file => attachmentIds.includes(file.id));
      }
      return [{ id: record.id, title: record.title, packageName: record.packageName,
        taskIds: hasPositionTaskScope ? taskIds.filter(taskId => visibleTaskIds.has(taskId)) : taskIds,
        taskScope: taskIds.length ? 'tasks' : 'job', attachments: documents }];
    });
  }

  submittalFile(jobId, workerId, submittalId, documentId, sourceHash) {
    const pack = this.snapshot(jobId, workerId);
    if (sourceHash && sourceHash !== pack.sourceHash) invalid('The work-pack revision changed. Download the current version.', 409);
    const submittal = pack.know.submittals.find(item => item.id === submittalId);
    const attachment = submittal?.attachments.find(item => item.id === documentId);
    if (!attachment) invalid('This approved submittal document is outside the assigned work-pack scope.', 404);
    const document = this.ledger.getDocument(documentId);
    if (!document || document.jobId !== jobId || document.mimeType !== 'application/pdf'
      || document.sizeBytes !== attachment.sizeBytes || document.sizeBytes > 8 * 1024 * 1024
      || !document.storageRef || attachment.sha256 !== String(document.data?.analysis?.upload?.sha256 || document.data?.sourceDocumentChecksum || document.data?.contentHash || '').toLowerCase()) {
      invalid('The approved submittal PDF is unavailable or no longer matches its retained source.', 409);
    }
    return { document, sha256: attachment.sha256 };
  }

  snapshot(jobId, workerId) {
    const assignmentIds = this.assertAssigned(jobId, workerId);
    const detail = this.ledger.getJobDetail(jobId, { includeAudit: false });
    const dispatchRecommendation = this.ledger.recommendSchedule(jobId, {}, { actor: 'Contractor.AI', audit: false, detail });
    const dispatchStatus = this.ledger.classifyDispatchReadiness(dispatchRecommendation);
    const worker = this.ledger.getWorker(workerId);
    const assignments = detail.assignments.filter(row => assignmentIds.has(row.id));
    const { hasPositionTaskScope, visibleTaskIds, canSeeTask: taskVisibleToWorker } = fieldTaskScope(detail, workerId, assignments);
    const safetyPlans = detail.preTaskPlans.flatMap(plan => {
      const attendee = (plan.attendees || []).find(row => row.workerId === workerId && assignmentIds.has(row.assignmentId));
      if (!attendee) return [];
      const permit = plan.workPermitId ? this.ledger.getWorkPermit(plan.workPermitId, { jobId }) : null;
      const permitAttendee = permit?.attendees?.find(row => row.workerId === workerId && assignmentIds.has(row.assignmentId));
      const linkedPermit = permit ? {
        id: permit.id,
        title: permit.title,
        permitType: permit.permitType,
        status: permit.effectiveStatus || permit.status,
        validFrom: permit.validFrom,
        expiresAt: permit.expiresAt,
        hazards: permit.hazards,
        controls: permit.controls,
        conditions: permit.conditions,
        recordChecksPassed: permit.readyForWork === true,
        definitionIntegrityValid: permit.definitionIntegrityValid === true,
        ownAcknowledgement: permitAttendee ? pick(permitAttendee, ['status', 'acknowledgedAt', 'integrityValid']) : null,
        blockers: (permit.blockers || []).map(item => item.message)
      } : null;
      return [{
        id: plan.id,
        planNumber: plan.planNumber,
        revisionNumber: plan.revisionNumber,
        jhaId: plan.jhaId,
        linkedTaskIds: (plan.linkedTaskIds || []).filter(taskId => visibleTaskIds.has(taskId)),
        title: plan.title,
        status: plan.effectiveStatus || plan.status,
        workDate: plan.workDate,
        shiftLabel: plan.shiftLabel,
        location: plan.location,
        sdsSheetIds: plan.sdsSheetIds || [],
        responsibleWorkerId: plan.responsibleWorkerId === workerId ? workerId : null,
        steps: plan.steps,
        emergencyArrangements: plan.emergencyArrangements,
        stopWorkTriggers: plan.stopWorkTriggers,
        recordChecksPassed: plan.readyForWork === true,
        definitionIntegrityValid: plan.definitionIntegrityValid === true,
        prerequisitesCurrent: plan.prerequisitesCurrent === true,
        ownAcknowledgement: pick(attendee, ['status', 'acknowledgedAt', 'integrityValid']),
        blockers: (plan.blockers || []).map(item => item.message),
        permit: linkedPermit
      }];
    });
    const workPackMaterialIds = new Set(detail.tasks.filter(row => visibleTaskIds.has(row.id))
      .flatMap(row => Array.isArray(row.data?.materialRequirementIds) ? row.data.materialRequirementIds : []));
    const visibleMaterials = detail.materials.filter(row => !hasPositionTaskScope || workPackMaterialIds.has(row.id));
    const safetySheets = fieldSdsRecords(this.ledger, detail.sdsSheets, hasPositionTaskScope ? workPackMaterialIds : null);
    const submittals = this.approvedSubmittals(detail, { hasPositionTaskScope, visibleTaskIds });
    const safetyAnalyses = fieldJhaRecords(this.ledger, detail.jhas, hasPositionTaskScope ? visibleTaskIds : null);
    const currentSafetySheetIds = new Set(safetySheets.filter(sheet => sheet.file).map(sheet => sheet.id));
    const planSafetySheetIds = new Set(safetyPlans.flatMap(plan => plan.sdsSheetIds || []));
    const sdsReadiness = visibleMaterials.reduce((result, material) => {
      const requirement = material.sdsRequirementStatus || 'unreviewed';
      const mappedSheets = safetySheets.filter(sheet => sheet.linkedMaterialIds.includes(material.id));
      const currentFiles = mappedSheets.filter(sheet => currentSafetySheetIds.has(sheet.id));
      const coveredByPlan = currentFiles.some(sheet => planSafetySheetIds.has(sheet.id));
      const item = {
        materialRequirementId: material.id,
        material: material.name,
        requirement,
        sheetIds: currentFiles.map(sheet => sheet.id),
        safetyPlanCovered: requirement !== 'required' || coveredByPlan,
        ready: requirement === 'not_required' || (requirement === 'required' && currentFiles.length > 0 && coveredByPlan)
      };
      if (requirement === 'unreviewed') {
        result.blockers.push({
          type: 'material_sds_applicability_unreviewed', materialRequirementId: material.id,
          message: `SDS applicability for ${material.name} has not been reviewed.`
        });
      } else if (requirement === 'required' && currentFiles.length === 0) {
        result.blockers.push({
          type: 'material_sds_missing', materialRequirementId: material.id,
          message: `A current approved SDS PDF is missing for ${material.name}.`
        });
      } else if (requirement === 'required' && !coveredByPlan) {
        result.blockers.push({
          type: 'material_sds_not_in_safety_plan', materialRequirementId: material.id,
          message: `The current SDS for ${material.name} is not linked into an assigned pre-task safety plan.`
        });
      }
      result.items.push(item);
      return result;
    }, { status: 'ready', items: [], blockers: [] });
    sdsReadiness.status = sdsReadiness.blockers.length ? 'blocked' : 'ready';
    const equipmentReservations = detail.tools.filter(row => this.ledger.activeToolReservationStatus(row.status)
      && (!hasPositionTaskScope || visibleTaskIds.has(row.data?.taskId)));
    const equipmentReservationIds = new Set(equipmentReservations.map(row => row.id));
    const currentEquipmentCustody = new Map(detail.equipmentCustody
      .filter(row => equipmentReservationIds.has(row.reservationId) && ['checked_out', 'exception'].includes(row.status))
      .map(row => [row.reservationId, {
        status: row.status,
        dueBackAt: row.dueBackAt || null,
        heldByYou: row.workerId === workerId
      }]));
    const lmraAssessments = detail.lmraAssessments
      .filter(row => row.workerId === workerId && safetyPlans.some(plan => plan.id === row.preTaskPlanId))
      .map(row => ({
        id: row.id,
        planId: row.preTaskPlanId,
        taskId: visibleTaskIds.has(row.taskId) ? row.taskId : null,
        workArea: row.workArea,
        activity: row.activity,
        assessedAt: row.assessedAt,
        validUntil: row.validUntil,
        outcome: row.outcome,
        checks: row.checks,
        observedHazards: row.observedHazards,
        stopWorkReason: row.stopWorkReason,
        integrityValid: row.integrityValid === true,
        sourceCurrent: row.sourceCurrent === true,
        expired: row.expired === true,
        isLatestForWorkerPlan: row.isLatestForWorkerPlan === true,
        recordChecksPassed: row.readyForHazardousWork === true,
        blockers: (row.blockers || []).map(item => item.message)
      }));
    const requirements = detail.qualificationRequirements.filter(row => ['active', 'pending_retirement'].includes(row.status));
    const qualificationItems = new Map();
    for (const assignment of assignments) {
      const assessmentEnd = Math.max(Date.now(), ...[assignment.scheduledEnd, detail.scheduledEnd].map(value => Date.parse(value)).filter(Number.isFinite));
      const result = this.ledger.assessWorkerQualifications(workerId, { jobId, role: assignment.role, at: new Date(assessmentEnd).toISOString(), requirements });
      for (const item of result.items) qualificationItems.set(item.requirement.id, {
        id: item.requirement.id, title: item.requirement.title, credentialType: item.requirement.credentialType,
        mandatory: item.requirement.mandatory, status: item.status, expiresOn: item.credential?.expiresOn || null
      });
    }
    const instructions = detail.workerInstructions.filter(row => (!row.workerId || row.workerId === workerId)
      && (!row.assignmentId || assignmentIds.has(row.assignmentId)) && ['approved', 'issued', 'sent', 'published', 'active'].includes(row.status))
      .map(row => pick(row, ['id', 'title', 'body', 'status', 'updatedAt']));
    const tasks = detail.tasks.filter(taskVisibleToWorker)
      .map(row => {
        const crewWorkerAssignments = Array.isArray(row.data?.crewWorkerAssignments) ? row.data.crewWorkerAssignments
          : (Array.isArray(row.data?.crewWorkerIds) ? row.data.crewWorkerIds : []).map(id => ({ workerId: id, role: row.data?.requiredTrade || '' }));
        const crew = crewWorkerAssignments.map(member => {
          const assigned = detail.assignments.find(item => item.workerId === member.workerId
            && ['assigned', 'active', 'planned', 'in_progress'].includes(String(item.status || '').toLowerCase()));
          if (!assigned) return null;
          const person = this.ledger.getWorker(member.workerId);
          return person ? { workerId: person.id, workerName: person.name, role: member.role || assigned.role || '' } : null;
        }).filter(Boolean);
        const supervisorWorkerIds = Array.isArray(row.data?.supervisorWorkerIds) && row.data.supervisorWorkerIds.length
          ? row.data.supervisorWorkerIds : row.data?.supervisorWorkerId ? [row.data.supervisorWorkerId] : [];
        const task = { ...pick(row, ['id', 'title', 'description', 'status', 'priority', 'plannedStart', 'plannedEnd', 'durationHours']), assigneeId: row.assigneeId,
          crewWorkerIds: crew.map(member => member.workerId), crew,
          jhaApplicability: { status: row.jhaApplicability?.status || 'unreviewed' },
          supervisingOnly: row.assigneeId !== workerId && !crew.some(member => member.workerId === workerId) && supervisorWorkerIds.includes(workerId) };
        const taskStart = Date.parse(row.plannedStart || '');
        const taskEnd = Date.parse(row.plannedEnd || '');
        const supervisions = supervisorWorkerIds.map(supervisorWorkerId => {
          const supervisorAssignment = detail.assignments.find(item => item.workerId === supervisorWorkerId
            && ['assigned', 'active', 'planned', 'in_progress'].includes(String(item.status || '').toLowerCase())
            && normalizeRole(item.role) === normalizeRole(row.data?.supervisorTrade));
          const attendance = this.ledger.db.prepare("SELECT id, check_in_at FROM attendance_sessions WHERE job_id = ? AND worker_id = ? AND status = 'checked_in' ORDER BY check_in_at DESC LIMIT 1")
            .get(jobId, supervisorWorkerId);
          const at = row.plannedEnd || supervisorAssignment?.scheduledEnd || detail.scheduledEnd || new Date().toISOString();
          const qualification = this.ledger.assessWorkerQualifications(supervisorWorkerId, {
            jobId, role: row.data?.supervisorTrade, at,
            requirements: detail.qualificationRequirements.filter(requirement => ['active', 'pending_retirement'].includes(requirement.status))
          });
          const shiftStart = Date.parse(supervisorAssignment?.scheduledStart || '');
          const shiftEnd = Date.parse(supervisorAssignment?.scheduledEnd || '');
          return {
            workerId: supervisorWorkerId,
            workerName: supervisorAssignment?.workerName || this.ledger.getWorker(supervisorWorkerId)?.name || null,
            role: row.data?.supervisorTrade || null,
            assignmentCurrent: Boolean(supervisorAssignment),
            shiftCoversTask: Number.isFinite(taskStart) && Number.isFinite(taskEnd) && Number.isFinite(shiftStart) && Number.isFinite(shiftEnd)
              && shiftStart <= taskStart && shiftEnd >= taskEnd,
            qualificationReady: qualification.ready === true,
            qualificationBlockers: qualification.blockers.map(item => item.message),
            checkedIn: Boolean(attendance),
            checkedInAt: attendance?.check_in_at || null
          };
        });
        if (!supervisions.length) return task;
        const supervision = { required: true, ...supervisions[0], ratio: row.data?.supervisionRatio || null,
          requiredSupervisorCount: Number(row.data?.supervisionRatio?.requiredSupervisorCount || 1) };
        return { ...task, supervision, supervisions };
      });
    const scopeChanges = detail.changeOrders
      .filter(row => row.variationNumber && row.status === 'accepted')
      .map(row => row.workAuthorized && row.integrityValid
        ? {
            id: row.id,
            variationNumber: row.variationNumber,
            revisionNumber: row.revisionNumber,
            title: row.title,
            scope: row.scopeDelta,
            acceptedAt: row.data?.acceptance?.acceptedAt || null
          }
        : { id: row.id, variationNumber: row.variationNumber, revisionNumber: row.revisionNumber, reviewRequired: true });
      const recoveryInstructions = new (require('./operational-recovery').OperationalRecovery)(this.ledger)
      .fieldInstructions(jobId, workerId, tasks.map(task => task.id));
    const currentConversationOrigin = new (require('./client-conversation').ClientConversation)(this.ledger);
    const clientUpdates = detail.rfis.filter(rfi => {
      const data = rfi.data || {};
      const approval = data.fieldShareEnabled && rfi.approvalId
        ? this.ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(rfi.approvalId)
        : null;
      return data.fieldShareEnabled === true && ['answered', 'resolved', 'closed'].includes(rfi.status)
        && approval?.status === 'approved' && typeof rfi.response === 'string' && rfi.response.trim()
        && Array.isArray(data.fieldTaskIds) && data.fieldTaskIds.some(id => visibleTaskIds.has(id))
        && currentConversationOrigin.isCurrentRfiOrigin(data.conversationOrigin, jobId);
    }).map(rfi => {
      const taskIds = rfi.data.fieldTaskIds.filter(id => visibleTaskIds.has(id));
      return {
        title: rfi.title,
        response: rfi.response,
        taskTitles: taskIds.map(id => detail.tasks.find(task => task.id === id)?.title).filter(Boolean),
        answeredAt: rfi.answeredAt
      };
    });
    const pack = {
      format: 'contractor-field-work-pack/v1',
      job: pick(detail, ['id', 'title', 'description', 'address', 'city', 'country', 'scheduledStart', 'scheduledEnd', 'targetCompletion', 'status']),
      worker: pick(worker, ['id', 'name']),
      assignments: assignments.map(row => ({ ...pick(row, ['id', 'role', 'status', 'scheduledStart', 'scheduledEnd', 'allocationHours']),
        dailyBriefing: this.dailyBriefingForAssignment(jobId, workerId, row),
        ...(row.data?.startReleaseRequired === true ? {
          startReleaseRequired: true,
          workBoardPositionId: row.data.workBoardPositionId || null,
          workBoardTaskIds: Array.isArray(row.data.workBoardTaskIds) ? row.data.workBoardTaskIds : []
        } : {}) })),
      planningReadiness: {
        status: dispatchStatus,
        blockerCount: dispatchRecommendation.blockers?.length || 0,
        missingCount: dispatchRecommendation.missing?.length || 0,
        warningCount: dispatchRecommendation.warnings?.length || 0,
        checkedAt: new Date().toISOString(),
        authorizationGranted: false
      },
      can: [...qualificationItems.values()],
      know: { instructions, recoveryInstructions, clientUpdates, submittals, scopeChanges: scopeChanges.filter(row => !row.reviewRequired), scopeChangeReviewRequired: scopeChanges.filter(row => row.reviewRequired), workContext: new (require('./work-context').WorkContext)(this.ledger).field(jobId, tasks.map(task => task.id)), sdsReadiness, sdsSheets: safetySheets, jhas: safetyAnalyses,
        jhaApplicability: tasks.filter(task => !task.supervisingOnly && !['completed', 'cancelled', 'canceled', 'deleted'].includes(String(task.status || '').toLowerCase()))
          .map(task => ({ taskId: task.id, title: task.title, status: task.jhaApplicability?.status || 'unreviewed' })),
        drawings: detail.drawings.filter(row => row.current === true
        && (!hasPositionTaskScope || (row.data?.linkedTaskIds || []).some(taskId => visibleTaskIds.has(taskId))))
        .map(row => ({ ...pick(row, ['id', 'title', 'documentNumber', 'revision', 'discipline', 'status']),
        file: { filename: row.filename, mimeType: row.mimeType, sizeBytes: row.sizeBytes, sha256: row.data.sourceDocumentChecksum } })), safetyPlans,
        lmraAssessments, safetyReview: { authorizationGranted: false, notice: 'Dossierinformatie voor controle; dit is geen starttoestemming of veiligheidsvrijgave.' } },
      have: { materials: visibleMaterials
        .map(row => ({ ...pick(row, ['id', 'name', 'quantity', 'unit', 'status', 'neededBy']), sdsRequirementStatus: row.sdsRequirementStatus || 'unreviewed' })),
        siteIssues: new (require('./shared-material-stock').SharedMaterialStock)(this.ledger).listSiteIssues(jobId)
          .filter(row => !hasPositionTaskScope || workPackMaterialIds.has(row.requirementId)),
        equipment: equipmentReservations.map(row => ({ ...pick(row, ['id', 'toolName', 'status', 'neededFrom', 'neededUntil']),
          taskId: row.data?.taskId || null,
          taskTitle: detail.tasks.find(task => task.id === row.data?.taskId)?.title || null,
          custody: currentEquipmentCustody.get(row.id) || null
        })) },
      do: tasks,
      checks: {
        quality: detail.installationQcControls.filter(row => row.assignedWorkerId === workerId
          && (!row.assignmentId || assignmentIds.has(row.assignmentId)) && (!row.taskId || visibleTaskIds.has(row.taskId)))
          .map(row => pick(row, ['id', 'title', 'status', 'taskId'])),
        photos: detail.photoEvidenceSets.filter(row => row.assignedWorkerId === workerId
          && (!row.assignmentId || assignmentIds.has(row.assignmentId)) && (!row.taskId || visibleTaskIds.has(row.taskId))).map(row => ({
          ...pick(row, ['id', 'title', 'status', 'taskId', 'workLocation', 'requiredPhases']),
          capturedPhases: (row.captures || []).map(capture => capture.phase)
        })),
      },
      safetyClearance: false,
    };
    // Task progress alone is not a new instruction and does not invalidate a read acknowledgment.
    const basis = {
      ...omit(pack, ['planningReadiness']),
      job: omit(pack.job, ['status']),
      do: pack.do.map(task => omit(task, ['status']))
    };
    return { ...pack, sourceHash: fingerprint(basis), generatedAt: new Date().toISOString() };
  }

  read(jobId, workerId) {
    return this.ledger.transaction(() => {
      const pack = this.snapshot(jobId, workerId);
      const events = this.ledger.db.prepare("SELECT after_json FROM audit_events WHERE job_id = ? AND entity_type = 'field_work_pack' ORDER BY sequence_number DESC").all(jobId)
        .map(row => JSON.parse(row.after_json)).filter(row => row.workerId === workerId);
      const acknowledgment = events.find(row => row.kind === 'acknowledgment');
      const release = events.find(row => row.kind === 'start_release') || null;
      const releaseRevoked = release && events.some(row => row.kind === 'start_release_revoked' && row.releaseId === release.id);
      const releaseAcknowledgment = release
        ? events.find(row => row.kind === 'start_release_acknowledgment' && row.releaseId === release.id)
        : null;
      const releaseExpiry = Date.parse(release?.expiresAt || '');
      const releaseAssignmentActive = release && pack.assignments.some(row => row.id === release.assignmentId);
      const releaseSourceCurrent = release?.sourceHash === pack.sourceHash;
      const changedSections = acknowledgment?.snapshot && acknowledgment.sourceHash !== pack.sourceHash
        ? ['job', 'assignments', 'can', 'know', 'have', 'do', 'checks'].filter(key => fingerprint(acknowledgment.snapshot[key]) !== fingerprint(pack[key])) : [];
      const questions = this.mapQuestionReplies(jobId, events.filter(row => row.kind === 'question').slice(0, 20));
      const currentAcknowledgment = acknowledgment ? { ...omit(acknowledgment, ['snapshot', 'requestHash']), current: acknowledgment.sourceHash === pack.sourceHash } : null;
      const releaseEligibility = pack.assignments.map(assignment => ({
        assignmentId: assignment.id,
        ...this.startReleaseEligibility({ ...pack, acknowledgment: currentAcknowledgment }, assignment.id)
      }));
      const currentReleaseEligibility = releaseEligibility.find(item => item.assignmentId === release?.assignmentId);
      const releaseReady = Boolean(currentReleaseEligibility?.eligible);
      const releaseActive = Boolean(release && !releaseRevoked && releaseAssignmentActive && releaseSourceCurrent && releaseReady
        && Number.isFinite(releaseExpiry) && releaseExpiry > Date.now() && releaseAcknowledgment);
      const releaseStatus = !release
        ? 'not_issued'
        : releaseRevoked ? 'revoked'
        : !releaseAssignmentActive || !releaseSourceCurrent ? 'outdated'
          : !releaseReady ? 'not_ready'
          : !Number.isFinite(releaseExpiry) || releaseExpiry <= Date.now() ? 'expired'
              : releaseAcknowledgment ? 'active' : 'awaiting_worker';
      const assignmentReleaseState = assignment => {
        const item = events.find(row => row.kind === 'start_release' && row.assignmentId === assignment.id);
        if (!item) return { status: 'not_issued', permissionToStart: false };
        const revoked = events.some(row => row.kind === 'start_release_revoked' && row.releaseId === item.id);
        const receipt = events.find(row => row.kind === 'start_release_acknowledgment' && row.releaseId === item.id);
        const current = item.sourceHash === pack.sourceHash;
        const eligible = releaseEligibility.find(row => row.assignmentId === assignment.id)?.eligible === true;
        const expiresAt = Date.parse(item.expiresAt || '');
        const active = !revoked && current && eligible && Number.isFinite(expiresAt) && expiresAt > Date.now() && Boolean(receipt);
        const state = revoked ? 'revoked' : !current ? 'outdated' : !eligible ? 'not_ready'
          : !Number.isFinite(expiresAt) || expiresAt <= Date.now() ? 'expired' : receipt ? 'active' : 'awaiting_worker';
        return { id: item.id, assignmentId: assignment.id, status: state, sourceHash: item.sourceHash,
          expiresAt: item.expiresAt, reason: item.reason, permissionToStart: active };
      };
      return {
        ...pack,
        assignments: pack.assignments.map(assignment => ({ ...assignment, startRelease: assignmentReleaseState(assignment) })),
        acknowledgment: currentAcknowledgment,
        startRelease: release ? {
          id: release.id,
          assignmentId: release.assignmentId,
          status: releaseStatus,
          sourceHash: release.sourceHash,
          issuedAt: release.issuedAt,
          expiresAt: release.expiresAt,
          reason: release.reason,
          workerAcknowledgedAt: releaseAcknowledgment?.recordedAt || null,
          permissionToStart: releaseActive,
          blockers: releaseActive ? [] : (currentReleaseEligibility?.blockers || [])
        } : { status: releaseStatus, permissionToStart: false, blockers: releaseEligibility[0]?.blockers || [] },
        startReleaseEligibility: releaseEligibility.map(({ assignmentId, eligible, blockers }) => ({ assignmentId, eligible, blockers })),
        changedSections, questions, historyLimit: 20
      };
    });
  }

  startReleaseEligibility(pack, assignmentId) {
    const blockers = [];
    const assignment = pack.assignments.find(row => row.id === assignmentId);
    if (!assignment) blockers.push('The selected active worker assignment is not in this work pack.');
    if (!assignment?.dailyBriefing || assignment.dailyBriefing.status === 'not_recorded') {
      blockers.push('A released start huddle for this exact worker assignment and shift is required before start release.');
    } else if (assignment.dailyBriefing.status === 'crew_update_required') {
      blockers.push('A retained start huddle for this shift does not include this worker assignment; brief the current crew and retain the updated briefing before release.');
    } else if (assignment?.dailyBriefing?.status === 'needs_review') {
      blockers.push('The retained start huddle is blocked, changed, or does not match this worker shift; review and retain a current briefing before release.');
    }
    if (!pack.acknowledgment?.current) blockers.push('The worker must first confirm reading this exact work-pack version.');
    if (['completed', 'closed', 'cancelled', 'canceled', 'rejected', 'archived', 'paused', 'on_hold', 'suspended'].includes(String(pack.job.status || '').toLowerCase())) blockers.push('This job is closed, paused or suspended.');
    if (pack.planningReadiness.status !== 'ready') blockers.push('Dispatch and planning readiness must be fully ready without warnings.');
    const assignedToTask = task => !task.assigneeId || task.assigneeId === pack.worker.id || task.crewWorkerIds?.includes(pack.worker.id);
    if (!pack.do.some(task => !task.supervisingOnly && assignedToTask(task)
      && ['open', 'in_progress'].includes(String(task.status || '').toLowerCase()))) blockers.push('No open, unblocked task remains in this worker work pack.');
    for (const task of pack.do.filter(item => !item.supervisingOnly && assignedToTask(item) && item.supervision?.required)) {
      const supervisors = task.supervisions || [task.supervision];
      for (const supervisor of supervisors) {
        if (!supervisor.assignmentCurrent) blockers.push(`A named supervisor for ${task.title} no longer has a current job assignment in the required role.`);
        if (!supervisor.shiftCoversTask) blockers.push(`A named supervisor's recorded assignment does not cover the full planned task window for ${task.title}.`);
        if (!supervisor.qualificationReady) blockers.push(`A named supervisor's mandatory qualifications for ${task.title} are not current and verified.`);
      }
      const requiredSupervisorCount = Number(task.supervision.requiredSupervisorCount || 1);
      if (supervisors.filter(supervisor => supervisor.checkedIn).length < requiredSupervisorCount) {
        blockers.push(`At least ${requiredSupervisorCount} named supervisor(s) must check in on site before ${task.title} can be released.`);
      }
    }
    if (!pack.job.scheduledStart || !pack.job.scheduledEnd || !assignment?.scheduledStart || !assignment?.scheduledEnd) blockers.push('Current job and worker shift times are required.');
    if (pack.know.scopeChangeReviewRequired.length) blockers.push('An accepted scope change still requires office review.');
    if (pack.can.some(item => item.mandatory && !['ready', 'expiring'].includes(item.status))) blockers.push('One or more required worker qualifications are missing, expired or unverified.');
    for (const item of pack.know.sdsReadiness?.blockers || []) blockers.push(item.message);
    for (const task of pack.know.jhaApplicability || []) {
      if (!['required', 'not_required'].includes(task.status)) {
        blockers.push(`JHA applicability for ${task.title} has not been reviewed or is outdated.`);
      } else if (task.status === 'required') {
        const jha = (pack.know.jhas || []).find(record => record.linkedTaskIds?.includes(task.taskId));
        if (!jha) blockers.push(`A current approved task-linked JHA is missing for ${task.title}.`);
        else if (!(pack.know.safetyPlans || []).some(plan => plan.jhaId === jha.id && plan.linkedTaskIds?.includes(task.taskId))) {
          blockers.push(`The approved task-linked JHA for ${task.title} is not included in a safety plan that covers this task.`);
        }
      }
    }
    if (!pack.know.safetyPlans.length) blockers.push('No current assignment-linked safety plan is available for review.');
    for (const plan of pack.know.safetyPlans) {
      if (!plan.recordChecksPassed || !plan.definitionIntegrityValid || !plan.prerequisitesCurrent) blockers.push(`Safety plan ${plan.planNumber} is not current and ready.`);
      if (plan.ownAcknowledgement?.status !== 'acknowledged' || plan.ownAcknowledgement.integrityValid !== true) blockers.push(`Worker acknowledgment for safety plan ${plan.planNumber} is missing or unverified.`);
      if (plan.permit && (!plan.permit.recordChecksPassed || plan.permit.ownAcknowledgement?.status !== 'acknowledged' || plan.permit.ownAcknowledgement.integrityValid !== true)) blockers.push(`Linked permit for safety plan ${plan.planNumber} is not ready or acknowledged.`);
      const assessment = pack.know.lmraAssessments.find(row => row.planId === plan.id && row.isLatestForWorkerPlan);
      if (!assessment?.recordChecksPassed || assessment.outcome !== 'ready' || !assessment.sourceCurrent || assessment.expired) blockers.push(`A current positive on-site LMRA is required for safety plan ${plan.planNumber}.`);
    }
    const now = Date.now();
    const start = Date.parse(assignment?.scheduledStart || pack.job.scheduledStart || '');
    const end = Date.parse(assignment?.scheduledEnd || pack.job.scheduledEnd || '');
    if (Number.isFinite(start) && now < start) blockers.push('A start release can only be issued during the assigned shift.');
    if (Number.isFinite(end) && now >= end) blockers.push('The assigned worker shift has ended.');
    return { eligible: blockers.length === 0, blockers: [...new Set(blockers)], assignment };
  }

  issueStartRelease(jobId, workerId, payload, actor) {
    return this.ledger.transaction(() => {
      new (require('./work-context').WorkContext)(this.ledger).lock(jobId);
      this.assertAssigned(jobId, workerId);
      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(payload.entryKey || '')) invalid('A stable start-release entry key is required.');
      if (!/^[a-f0-9]{64}$/.test(payload.sourceHash || '')) invalid('Load the current work pack before issuing a start release.');
      const assignmentId = String(payload.assignmentId || '');
      const reason = typeof payload.reason === 'string' ? payload.reason.trim() : '';
      const evidenceReference = typeof payload.evidenceReference === 'string' ? payload.evidenceReference.trim() : '';
      if (reason.length < 5 || reason.length > 1000) invalid('Record why this worker and task are released (5 to 1000 characters).');
      if (evidenceReference.length < 3 || evidenceReference.length > 240) invalid('A site check or briefing evidence reference is required.');
      if (!Array.isArray(payload.checks) || START_RELEASE_CHECKS.some(key => payload.checks.includes(key) !== true)) invalid('Confirm every required site, method, permit, crew, equipment and emergency check.');
      const expiresAt = payload.expiresAt || null;
      const expiry = Date.parse(expiresAt || '');
      const request = { assignmentId, sourceHash: payload.sourceHash, reason, evidenceReference, checks: [...START_RELEASE_CHECKS], expiresAt };
      const requestHash = fingerprint(request);
      const id = `workpack_${fingerprint([jobId, workerId, 'start_release', payload.entryKey])}`;
      const existing = this.ledger.db.prepare("SELECT after_json FROM audit_events WHERE entity_type = 'field_work_pack' AND entity_id = ?").get(id);
      if (existing) {
        const record = JSON.parse(existing.after_json);
        if (record.requestHash !== requestHash) invalid('This start-release entry key was already used for different content.', 409);
        const current = this.read(jobId, workerId).assignments.find(row => row.id === record.assignmentId)?.startRelease;
        return { replayed: true, release: current || { id, assignmentId: record.assignmentId, status: 'outdated', permissionToStart: false }, record };
      }
      const pack = this.read(jobId, workerId);
      if (pack.sourceHash !== payload.sourceHash) invalid('The work-pack source changed. Refresh and read it again before release.', 409);
      const currentRelease = pack.assignments.find(row => row.id === assignmentId)?.startRelease;
      if (['active', 'awaiting_worker'].includes(currentRelease?.status)) invalid('Stop or resolve the existing release for this assignment before issuing another.', 409);
      const eligibility = this.startReleaseEligibility(pack, assignmentId);
      if (!eligibility.eligible) throw Object.assign(new Error('This worker is not ready for a start release.'), {
        statusCode: 409, code: 'start_release_blocked', details: { blockers: eligibility.blockers }
      });
      const assignmentEnd = Date.parse(eligibility.assignment.scheduledEnd);
      if (!Number.isFinite(expiry) || expiry <= Date.now() || expiry > assignmentEnd || expiry - Date.now() > 8 * 60 * 60 * 1000) invalid('Release expiry must be within the active shift and no more than eight hours from now.');
      const record = {
        id, kind: 'start_release', jobId, workerId, assignmentId, sourceHash: pack.sourceHash,
        requestHash, reason, evidenceReference, checks: [...START_RELEASE_CHECKS],
        issuedAt: new Date().toISOString(), expiresAt: new Date(expiry).toISOString(), releasedBy: actor,
        workerAcknowledgedAt: null, snapshot: pack
      };
      this.ledger.audit({ entityType: 'field_work_pack', entityId: id, jobId, action: 'issue_worker_start_release', actor, after: record });
      return { replayed: false, release: this.read(jobId, workerId).assignments.find(row => row.id === assignmentId)?.startRelease };
    });
  }

  acknowledgeStartRelease(jobId, workerId, payload, actor) {
    return this.ledger.transaction(() => {
      this.assertAssigned(jobId, workerId);
      const pack = this.read(jobId, workerId);
      if (payload.understood !== true) invalid('Confirm that you received the supervisor start release.');
      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(payload.entryKey || '')) invalid('A stable release-confirmation entry key is required.');
      const id = `workpack_${fingerprint([jobId, workerId, 'start_release_acknowledgment', payload.entryKey])}`;
      const requestHash = fingerprint({ releaseId: payload.releaseId, sourceHash: payload.sourceHash, understood: true });
      const existing = this.ledger.db.prepare("SELECT after_json FROM audit_events WHERE entity_type = 'field_work_pack' AND entity_id = ?").get(id);
      if (existing) {
        const record = JSON.parse(existing.after_json);
        if (record.requestHash !== requestHash) invalid('This confirmation entry key was already used for different content.', 409);
        const current = this.read(jobId, workerId).assignments.map(assignment => assignment.startRelease).find(item => item.id === record.releaseId);
        return { replayed: true, release: current || { id: record.releaseId, status: 'outdated', permissionToStart: false } };
      }
      const release = pack.assignments.map(assignment => assignment.startRelease).find(item => item.id === payload.releaseId);
      if (!release || release.status !== 'awaiting_worker') invalid('There is no current supervisor release awaiting your confirmation.', 409);
      if (release.sourceHash !== payload.sourceHash || pack.sourceHash !== payload.sourceHash) invalid('The work pack changed. Refresh it and ask the supervisor to review again.', 409);
      const record = { id, kind: 'start_release_acknowledgment', jobId, workerId, releaseId: release.id, sourceHash: release.sourceHash,
        requestHash, recordedAt: new Date().toISOString(), acknowledgedBy: actor };
      this.ledger.audit({ entityType: 'field_work_pack', entityId: id, jobId, action: 'acknowledge_worker_start_release', actor, after: record });
      return { replayed: false, release: this.read(jobId, workerId).assignments.map(assignment => assignment.startRelease).find(item => item.id === release.id) };
    });
  }

  revokeStartRelease(jobId, workerId, releaseId, entryKey, reason, actor) {
    return this.ledger.transaction(() => {
      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(entryKey || '')) invalid('A stable revocation entry key is required.');
      const note = typeof reason === 'string' ? reason.trim() : '';
      if (note.length < 3 || note.length > 1000) invalid('Record why this start release is being stopped (3 to 1000 characters).');
      const id = `workpack_${fingerprint([jobId, workerId, 'start_release_revoked', entryKey])}`;
      const requestHash = fingerprint({ releaseId, reason: note });
      const existing = this.ledger.db.prepare("SELECT after_json FROM audit_events WHERE entity_type = 'field_work_pack' AND entity_id = ?").get(id);
      if (existing) {
        const record = JSON.parse(existing.after_json);
        if (record.requestHash !== requestHash) invalid('This revocation entry key was already used for different content.', 409);
        const current = this.read(jobId, workerId).assignments.map(assignment => assignment.startRelease).find(item => item.id === record.releaseId);
        return { replayed: true, release: current || { id: record.releaseId, status: 'revoked', permissionToStart: false } };
      }
      const current = this.read(jobId, workerId).assignments.map(assignment => assignment.startRelease).find(item => item.id === releaseId);
      if (!current?.id) invalid('The current start release could not be found.', 404);
      if (current.status === 'revoked') invalid('This start release has already been stopped.', 409);
      const record = { id, kind: 'start_release_revoked', jobId, workerId, releaseId, requestHash, reason: note, revokedAt: new Date().toISOString(), revokedBy: actor };
      this.ledger.audit({ entityType: 'field_work_pack', entityId: id, jobId, action: 'revoke_worker_start_release', actor, after: record });
      return { replayed: false, release: { id: releaseId, status: 'revoked', permissionToStart: false } };
    });
  }

  replies(jobId, workerId) {
    return this.ledger.transaction(() => {
      this.assertAssigned(jobId, workerId);
      const events = this.ledger.db.prepare("SELECT after_json FROM audit_events WHERE job_id = ? AND entity_type = 'field_work_pack' ORDER BY sequence_number DESC").all(jobId)
        .map(row => JSON.parse(row.after_json)).filter(row => row.workerId === workerId && row.kind === 'question').slice(0, 20);
      return this.mapQuestionReplies(jobId, events);
    });
  }

  mapQuestionReplies(jobId, questions) {
    return questions.map(question => {
      const rfiRow = question.rfiId ? this.ledger.db.prepare('SELECT * FROM rfi_records WHERE id = ? AND job_id = ?').get(question.rfiId, jobId) : null;
      const rfi = rfiRow ? this.ledger.mapRfi(rfiRow) : null;
      const approval = rfi?.approvalId ? this.ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(rfi.approvalId) : null;
      const approved = ['answered', 'resolved', 'closed'].includes(rfi?.status) && approval?.status === 'approved' && typeof rfi.response === 'string' && rfi.response.trim();
      return {
        ...omit(question, ['snapshot']),
        replyStatus: approved ? 'answered' : (rfi?.status === 'pending_approval' ? 'pending_approval' : (approval?.status === 'rejected' ? 'review_required' : 'open')),
        response: approved ? rfi.response : null,
        repliedAt: approved ? rfi.answeredAt : null
      };
    });
  }

  retain(jobId, workerId, payload, actor, kind, create) {
    return this.ledger.transaction(() => {
      new (require('./work-context').WorkContext)(this.ledger).lock(jobId);
      this.assertAssigned(jobId, workerId);
      if (!/^[a-zA-Z0-9_-]{8,100}$/.test(payload.entryKey || '')) invalid('A stable entry key is required.');
      if (!/^[a-f0-9]{64}$/.test(payload.sourceHash || '')) invalid('Load the current work pack first.');
      const requestHash = fingerprint(payload);
      const id = `workpack_${fingerprint([jobId, workerId, kind, payload.entryKey])}`;
      const existing = this.ledger.db.prepare("SELECT after_json FROM audit_events WHERE entity_type = 'field_work_pack' AND entity_id = ?").get(id);
      if (existing) {
        const record = JSON.parse(existing.after_json);
        if (record.requestHash !== requestHash) invalid('This entry key was already used for different content.', 409);
        return { replayed: true, record, ...(record.report ? { report: record.report } : {}) };
      }
      const pack = this.snapshot(jobId, workerId);
      if (pack.sourceHash !== payload.sourceHash) invalid('Work instructions have changed. Refresh and read the new work pack.', 409);
      const result = create(pack);
      const record = { id, kind, workerId, jobId, sourceHash: pack.sourceHash, requestHash, snapshot: pack, recordedAt: new Date().toISOString(), ...result };
      this.ledger.audit({ entityType: 'field_work_pack', entityId: id, jobId, action: `retain_work_pack_${kind}`, actor, after: record });
      return { replayed: false, record, ...(record.report ? { report: record.report } : {}) };
    });
  }

  acknowledge(jobId, workerId, payload, actor) {
    if (payload.understood !== true) invalid('Explicitly confirm that this work-pack version has been read.');
    return this.retain(jobId, workerId, { sourceHash: payload.sourceHash, entryKey: payload.entryKey, understood: true }, actor, 'acknowledgment', () => ({ safetyClearance: false }));
  }

  question(jobId, workerId, payload, actor) {
    const message = typeof payload.message === 'string' ? payload.message.trim() : '';
    if (message.length < 3 || message.length > 4000) invalid('A question or blocker must contain 3 to 4000 characters.');
    return this.retain(jobId, workerId, { sourceHash: payload.sourceHash, entryKey: payload.entryKey, message }, actor, 'question', pack => {
      const report = this.ledger.createFieldReport(jobId, {
        status: 'submitted', workCompleted: 'Work-pack question; no completion claimed.', blockers: [message],
        notes: message, workerId, workerName: pack.worker.name, source: 'field_work_pack',
        evidenceReferences: [`work-pack:${pack.sourceHash}`], clientVisible: false,
      }, { actor });
      const rfi = this.ledger.createRfi(jobId, {
        title: `Field question from ${pack.worker.name}`,
        question: message,
        status: 'open',
        requiresApproval: false,
        source: 'field_work_pack',
        conversationOrigin: 'worker_work_pack',
        workerId,
        workerName: pack.worker.name,
        sourceReportId: report.id,
        workPackEntryKey: payload.entryKey
      }, { actor });
      return { message, report: pick(report, ['id', 'status']), rfiId: rfi.id, externalCommitments: 0 };
    });
  }

  progress(jobId, workerId, payload, actor) {
    const status = payload?.status;
    const progressPercent = payload?.progressPercent;
    const note = typeof payload?.note === 'string' ? payload.note.trim() : '';
    const taskId = typeof payload?.taskId === 'string' ? payload.taskId.trim() : '';
    if (!['in_progress', 'blocked'].includes(status)) invalid('Field workers can report progress or a blocker, not close a job.');
    if (typeof progressPercent !== 'number' || !Number.isFinite(progressPercent) || progressPercent < 0 || progressPercent > 100) invalid('Progress must be a number between 0 and 100.');
    if (note.length < 3 || note.length > 2000) invalid('A progress note must contain 3 to 2000 characters.');
    if (!taskId) invalid('Choose the task this progress update or blocker concerns.');
    const equipmentIssue = payload?.equipmentIssue == null ? null : {
      reservationId: typeof payload.equipmentIssue.reservationId === 'string' ? payload.equipmentIssue.reservationId.trim() : '',
      issueType: payload.equipmentIssue.issueType,
      note: typeof payload.equipmentIssue.note === 'string' ? payload.equipmentIssue.note.trim() : ''
    };
    if (equipmentIssue && status !== 'blocked') invalid('A suspected equipment fault must be reported as a task blocker.');
    if (equipmentIssue && (equipmentIssue.note.length < 8 || equipmentIssue.note.length > 2000)) invalid('Describe the suspected equipment fault in at least eight characters.');
    const input = { sourceHash: payload.sourceHash, entryKey: payload.entryKey, taskId, status, progressPercent, note,
      ...(equipmentIssue ? { equipmentIssue } : {}), source: 'field_work_pack', blockers: status === 'blocked' ? [note] : [] };
    return this.retain(jobId, workerId, input, actor, 'progress', pack => {
      if (!pack.do.some(task => task.id === taskId && ['open', 'in_progress', 'blocked'].includes(task.status))) invalid('The selected task is not open in this worker work pack.', 409);
      if (equipmentIssue) {
        const reservation = pack.have.equipment.find(item => item.id === equipmentIssue.reservationId && item.taskId === taskId
          && item.custody?.status === 'checked_out' && item.custody.heldByYou === true);
        if (!reservation) invalid('The selected equipment is not checked out to you for this task in the current work-pack version.', 409);
        this.ledger.reportFieldToolSafetyHold(jobId, reservation.id, workerId, { ...equipmentIssue, taskId, entryKey: payload.entryKey }, { actor });
      }
      if (status === 'in_progress') {
        const linkedRequiredAssignments = this.ledger.db.prepare(`SELECT id, worker_id, data_json FROM assignments
          WHERE job_id = ? AND ${this.ledger.activeAssignmentStatusSql()}`).all(jobId).map(row => {
          const data = JSON.parse(row.data_json || '{}');
          return { id: row.id, workerId: row.worker_id, required: data.startReleaseRequired === true,
            taskIds: Array.isArray(data.workBoardTaskIds) ? data.workBoardTaskIds : [] };
        }).filter(row => row.required && row.taskIds.includes(taskId));
        if (linkedRequiredAssignments.length) {
          const workerAssignments = linkedRequiredAssignments.filter(row => row.workerId === workerId);
          if (!workerAssignments.length) invalid('This task is covered by a position that requires its assigned worker to receive a start release.', 409);
          const events = this.ledger.db.prepare("SELECT after_json FROM audit_events WHERE job_id = ? AND entity_type = 'field_work_pack' ORDER BY sequence_number DESC")
            .all(jobId).map(row => JSON.parse(row.after_json)).filter(row => row.workerId === workerId);
          const currentPack = this.read(jobId, workerId);
          const eligibility = new Map((currentPack.startReleaseEligibility || []).map(row => [row.assignmentId, row.eligible]));
          for (const assignment of workerAssignments) {
            const release = events.find(row => row.kind === 'start_release' && row.assignmentId === assignment.id);
            const revoked = release && events.some(row => row.kind === 'start_release_revoked' && row.releaseId === release.id);
            const acknowledgment = release && events.some(row => row.kind === 'start_release_acknowledgment' && row.releaseId === release.id);
            if (!release || revoked || !acknowledgment || release.sourceHash !== currentPack.sourceHash
              || Date.parse(release.expiresAt) <= Date.now() || eligibility.get(assignment.id) !== true) {
              invalid('A current, worker-acknowledged start release is required before reporting this task as in progress.', 409);
            }
          }
        }
      }
      return { progress: { ...pick(this.ledger.addProgressUpdate(jobId, input, { actor }), ['id', 'status', 'progressPercent', 'note', 'createdAt']), taskId } };
    });
  }
}

module.exports = { FieldWorkPack };
