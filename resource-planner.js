const { createHash } = require('node:crypto');
const { Worker } = require('node:worker_threads');
const path = require('node:path');

const SLOT_MINUTES = 30;
const MAX_TASKS = 32;
const MAX_PORTFOLIO_JOBS = 8;
const MAX_PORTFOLIO_TASKS = 48;
const MAX_WORKERS = 24;
const MAX_HORIZON_DAYS = 42;
const SOLVER_TIMEOUT_MS = 5000;
const WORKER_TIMEOUT_MS = 7000;

function hash(value) { return createHash('sha256').update(JSON.stringify(value)).digest('hex'); }
function fail(message, statusCode = 400) { throw Object.assign(new Error(message), { statusCode }); }
function normalizeRole(value) { return String(value || '').normalize('NFKC').trim().toLocaleLowerCase('nl-NL').replace(/[^\p{L}\p{N}]+/gu, ' '); }
function taskCrewRequirements(task) {
  const recorded = Array.isArray(task.data?.requiredCrewRequirements) ? task.data.requiredCrewRequirements : [];
  if (recorded.length) return recorded.map(item => ({ role: String(item.role || item.trade || '').trim(), count: Number(item.count || item.workers || 1) }));
  return [{ role: String(task.data?.requiredTrade || '').trim(), count: Number(task.data?.requiredCrewSize || 1) }];
}
function plannedSupervisorCount(task) {
  const recorded = [...(Array.isArray(task.supervisorWorkerIds) ? task.supervisorWorkerIds : []), task.supervisorWorkerId];
  const namedCount = new Set(recorded.filter(Boolean)).size;
  if (namedCount) return namedCount;
  const ratio = Number(task.supervisionRatio?.workersPerSupervisor);
  const crewSize = (task.requiredCrewRequirements || []).reduce((sum, item) => sum + Number(item.count || 0), 0);
  return Number.isInteger(ratio) && ratio > 0 && crewSize > 0 ? Math.ceil(crewSize / ratio) : 0;
}

function datedPreconstructionComparison(forecast, plannedRows, options) {
  const timeZone = options.timeZone || 'Europe/Amsterdam';
  const timeZoneSource = options.timeZoneSource || 'default';
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
  const windowValid = validDate(forecast.windowStart) && validDate(forecast.windowEnd) && forecast.windowEnd >= forecast.windowStart;
  const round = value => Math.round(value * 100) / 100;
  const issues = [];
  if (!windowValid) issues.push({ code: 'forecast_window_missing' });
  let formatter;
  try { formatter = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }); }
  catch { return { status: 'unavailable', timeZone, timeZoneSource, roles: [], issues: [{ code: 'time_zone_invalid' }] }; }
  const dateAt = ms => {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(ms)).map(part => [part.type, part.value]));
    return `${parts.year}-${parts.month}-${parts.day}`;
  };
  const dayEnds = new Map();
  const roles = new Map();
  const roleRecord = (kind, role) => {
    const key = `${kind}:${normalizeRole(role)}`;
    if (!roles.has(key)) roles.set(key, { kind, role, estimated: new Map(), planned: new Map(), distributionRecorded: false, distributionSeen: false, undatedHours: 0 });
    return roles.get(key);
  };
  for (const trade of forecast.trades) {
    const record = roleRecord('trade', trade.role);
    const daily = trade.dailyDemand;
    record.distributionRecorded = Array.isArray(daily) && daily.length > 0
      && daily.every(day => validDate(day.date) && Number.isFinite(day.hours) && day.hours > 0);
    if (record.distributionRecorded) for (const day of daily) record.estimated.set(day.date, day.hours);
    if (trade.supervision) {
      const demand = trade.supervision;
      const supervision = roleRecord('supervision', demand.role);
      const dailySupervision = demand.dailyDemand || [];
      const complete = Array.isArray(dailySupervision) && dailySupervision.length > 0
        && Number.isInteger(demand.workersPerSupervisor) && demand.workersPerSupervisor > 0
        && dailySupervision.every(day => validDate(day.date) && Number.isFinite(day.crewSize) && day.crewSize > 0
          && Number.isFinite(day.supervisorShiftHours) && day.supervisorShiftHours > 0);
      supervision.distributionRecorded = complete && (!supervision.distributionSeen || supervision.distributionRecorded);
      supervision.distributionSeen = true;
      if (complete) for (const day of dailySupervision) supervision.estimated.set(day.date,
        (supervision.estimated.get(day.date) || 0) + Math.ceil(day.crewSize / demand.workersPerSupervisor) * day.supervisorShiftHours);
    }
  }
  for (const task of plannedRows) {
    const duration = Number(task.durationHours);
    if (!Number.isFinite(duration) || duration <= 0) continue;
    const start = Date.parse(task.plannedStart || '');
    const end = Date.parse(task.plannedEnd || '');
    const hoursByDate = new Map();
    const datesValid = Number.isFinite(start) && Number.isFinite(end) && end > start
      && end - start <= MAX_HORIZON_DAYS * 86_400_000
      && Math.abs((end - start) / 3_600_000 - duration) < 0.000001;
    if (!datesValid) issues.push({ code: 'planned_dates_incomplete', taskId: task.taskId || null, title: task.title || null });
    else {
      let cursor = start;
      while (cursor < end) {
        const date = dateAt(cursor);
        if (!dayEnds.has(date)) {
          // Find the local midnight as an instant, preserving 23/25-hour DST days.
          let low = cursor, high = cursor + 2 * 86_400_000;
          while (high - low > 1) {
            const middle = Math.floor((low + high) / 2);
            if (dateAt(middle) === date) low = middle;
            else high = middle;
          }
          dayEnds.set(date, high);
        }
        const segmentEnd = Math.min(end, dayEnds.get(date));
        hoursByDate.set(date, (hoursByDate.get(date) || 0) + (segmentEnd - cursor) / 3_600_000);
        cursor = segmentEnd;
      }
    }
    const demands = (task.requiredCrewRequirements || []).map(item => ({ kind: 'trade', role: item.role, count: Number(item.count) }));
    if (task.supervisorTrade) demands.push({ kind: 'supervision', role: task.supervisorTrade, count: plannedSupervisorCount(task) });
    for (const demand of demands) {
      if (!normalizeRole(demand.role) || !Number.isFinite(demand.count) || demand.count <= 0) continue;
      const record = roleRecord(demand.kind, demand.role);
      if (!datesValid) record.undatedHours += duration * demand.count;
      for (const [date, hours] of hoursByDate) record.planned.set(date, (record.planned.get(date) || 0) + hours * demand.count);
    }
  }
  const results = [...roles.values()].map(record => ({
    kind: record.kind, role: record.role, distributionRecorded: record.distributionRecorded,
    undatedHours: round(record.undatedHours),
    days: [...new Set([...record.estimated.keys(), ...record.planned.keys()])].sort().map(date => {
      const estimatedHours = record.distributionRecorded ? round(record.estimated.get(date) || 0) : null;
      const plannedHours = round(record.planned.get(date) || 0);
      return { date, estimatedHours, plannedHours, varianceHours: estimatedHours === null ? null : round(plannedHours - estimatedHours),
        outsideWindow: windowValid ? date < forecast.windowStart || date > forecast.windowEnd : null };
    })
  }));
  return {
    status: !windowValid ? 'unavailable' : issues.length || results.some(record => !record.distributionRecorded) ? 'partial' : 'compared',
    timeZone, timeZoneSource,
    windowStart: windowValid ? forecast.windowStart : null, windowEnd: windowValid ? forecast.windowEnd : null,
    roles: results, issues
  };
}

function preconstructionReconciliation(basis, plannedRows, options = {}) {
  const forecast = basis?.forecast;
  if (basis?.format !== 'contractor_ai_preconstruction_capacity_forecast_v1' || !Array.isArray(forecast?.trades)) return null;

  const plannedCrewHours = new Map();
  const plannedSupervisorHours = new Map();
  for (const task of plannedRows) {
    const durationHours = Number(task.durationHours);
    if (!Number.isFinite(durationHours) || durationHours <= 0) continue;
    for (const requirement of task.requiredCrewRequirements || []) {
      const role = String(requirement.role || '').trim();
      const roleKey = normalizeRole(role);
      const count = Number(requirement.count);
      if (!roleKey || !Number.isFinite(count) || count <= 0) continue;
      const current = plannedCrewHours.get(roleKey) || { role, hours: 0, taskCount: 0 };
      current.hours += durationHours * count;
      current.taskCount += 1;
      plannedCrewHours.set(roleKey, current);
    }

    const supervisorRole = String(task.supervisorTrade || '').trim();
    const supervisorCount = plannedSupervisorCount(task);
    if (supervisorRole && supervisorCount > 0) {
      const roleKey = normalizeRole(supervisorRole);
      const current = plannedSupervisorHours.get(roleKey) || { role: supervisorRole, hours: 0, taskCount: 0 };
      current.hours += durationHours * supervisorCount;
      current.taskCount += 1;
      plannedSupervisorHours.set(roleKey, current);
    }
  }

  const trades = forecast.trades.map(item => {
    const role = String(item.role || '').trim();
    const roleKey = normalizeRole(role);
    const actual = plannedCrewHours.get(roleKey);
    if (actual) plannedCrewHours.delete(roleKey);
    const estimatedHours = Number(item.hours) || 0;
    const plannedHours = actual?.hours || 0;
    const varianceHours = Math.round((plannedHours - estimatedHours) * 100) / 100;
    return {
      role,
      estimatedHours,
      plannedHours: Math.round(plannedHours * 100) / 100,
      varianceHours,
      plannedTaskCount: actual?.taskCount || 0,
      status: actual ? (Math.abs(varianceHours) <= 0.05 ? 'aligned_total' : varianceHours < 0 ? 'below_estimate' : 'above_estimate') : 'not_in_work_plan'
    };
  });
  const supervisionDemandByRole = new Map();
  for (const item of forecast.trades) {
    const demand = item.supervision;
    if (!demand) continue;
    const role = String(demand.role || '').trim();
    const roleKey = normalizeRole(role);
    const estimatedHours = (demand.dailyDemand || []).reduce((sum, day) => (
      sum + Math.ceil(Number(day.crewSize) / Number(demand.workersPerSupervisor)) * Number(day.supervisorShiftHours)
    ), 0);
    const current = supervisionDemandByRole.get(roleKey) || { role, estimatedHours: 0, crewRoles: [] };
    current.estimatedHours += estimatedHours;
    current.crewRoles.push(String(item.role || ''));
    supervisionDemandByRole.set(roleKey, current);
  }
  const supervision = [];
  for (const [roleKey, demand] of supervisionDemandByRole) {
    const role = demand.role;
    const actual = plannedSupervisorHours.get(roleKey);
    if (actual) plannedSupervisorHours.delete(roleKey);
    const plannedHours = actual?.hours || 0;
    const estimatedHours = demand.estimatedHours;
    const varianceHours = Math.round((plannedHours - estimatedHours) * 100) / 100;
    supervision.push({
      role,
      crewRoles: [...new Set(demand.crewRoles)],
      estimatedHours: Math.round(estimatedHours * 100) / 100,
      plannedHours: Math.round(plannedHours * 100) / 100,
      varianceHours,
      plannedTaskCount: actual?.taskCount || 0,
      status: actual ? (Math.abs(varianceHours) <= 0.05 ? 'aligned_total' : varianceHours < 0 ? 'below_estimate' : 'above_estimate') : 'not_configured_in_work_plan'
    });
  }

  const datedComparison = datedPreconstructionComparison(forecast, plannedRows, options);
  return {
    format: 'contractor_ai_preconstruction_reconciliation_v1',
    status: 'operator_review_required',
    basisSnapshotHash: basis.snapshotHash || null,
    comparison: datedComparison.status === 'unavailable' ? 'aggregate_role_hours_only' : 'aggregate_role_hours_with_date_review',
    datedComparison,
    trades,
    additionalPlannedTrades: [...plannedCrewHours.values()].map(item => ({ role: item.role, plannedHours: Math.round(item.hours * 100) / 100, plannedTaskCount: item.taskCount })),
    supervision,
    additionalPlannedSupervision: [...plannedSupervisorHours.values()].map(item => ({ role: item.role, plannedHours: Math.round(item.hours * 100) / 100, plannedTaskCount: item.taskCount })),
    limitations: [...(datedComparison.status === 'unavailable' ? ['dates_not_compared'] : datedComparison.status === 'partial' ? ['dated_comparison_incomplete'] : []), 'accepted_scope_not_verified', 'no_automatic_changes']
  };
}
function toIsoSlot(anchorMs, slot) { return new Date(anchorMs + slot * SLOT_MINUTES * 60_000).toISOString(); }
function ceilSlot(ms, anchorMs) { return Math.ceil((ms - anchorMs) / (SLOT_MINUTES * 60_000)); }
function floorSlot(ms, anchorMs) { return Math.floor((ms - anchorMs) / (SLOT_MINUTES * 60_000)); }
function localDayParts(ms, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    hourCycle: 'h23',
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(new Date(ms));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return {
    weekday: values.weekday.toLowerCase(),
    date: `${values.year}-${values.month}-${values.day}`,
    minuteOfDay: Number(values.hour) * 60 + Number(values.minute)
  };
}
function normalizedSiteSnapshot(job) {
  return {
    address: String(job.address || '').normalize('NFKC').trim().toLocaleLowerCase('nl-NL'),
    city: String(job.city || '').normalize('NFKC').trim().toLocaleLowerCase('nl-NL'),
    region: String(job.region || '').normalize('NFKC').trim().toLocaleLowerCase('nl-NL'),
    country: String(job.country || '').normalize('NFKC').trim().toLocaleLowerCase('nl-NL')
  };
}
function sameSiteSnapshot(left, right) {
  const normalizedLeft = left && normalizedSiteSnapshot(left);
  const normalizedRight = right && normalizedSiteSnapshot(right);
  return Boolean(normalizedLeft?.address && normalizedRight?.address
    && JSON.stringify(normalizedLeft) === JSON.stringify(normalizedRight));
}

class ResourcePlanner {
  constructor(ledger, options = {}) {
    this.ledger = ledger;
    this.maxConcurrent = Math.max(1, Math.min(4, Number(options.maxConcurrent) || 2));
    this.active = 0;
  }

  prepare(jobId, payload = {}) {
    const prepared = this.ledger.transaction(() => {
      this.ledger.requireJob(jobId);
      const detail = this.ledger.getJobDetail(jobId, { includeAudit: false });
      const activeStatuses = new Set(['open', 'in_progress', 'blocked', 'ready', 'planned']);
      const tasks = detail.tasks.filter(task => activeStatuses.has(task.status)
        && task.data?.excludeFromWorkPlan !== true
        && task.data?.excludeFromResourcePlan !== true
        && !(task.data?.source === 'job_intake_default' && task.data?.workCategory === 'coordination' && task.data?.workforcePositionEligible === false));
      const dependencies = detail.taskDependencies.filter(item => item.status === 'active' && tasks.some(task => task.id === item.predecessorTaskId) && tasks.some(task => task.id === item.successorTaskId));
      const startInput = payload.plannedStart || payload.planned_start || detail.scheduleControl?.activeBaseline?.plannedStart || detail.scheduledStart;
      const anchorMs = Date.parse(startInput || '');
      const horizonDays = Number(payload.horizonDays || 21);
      const inputIssues = [];
      const schedule = Number.isFinite(anchorMs) ? this.ledger.calculateJobSchedule(jobId, { plannedStart: new Date(anchorMs).toISOString(), horizonDays }) : null;
      const horizonEndMs = Number.isFinite(anchorMs) ? anchorMs + horizonDays * 86_400_000 : NaN;
      const heldTaskReasons = new Map();
      const holdTask = (taskId, reason) => {
        if (!taskId || !tasks.some(task => task.id === taskId)) return false;
        const reasons = heldTaskReasons.get(taskId) || [];
        const key = `${reason.code}:${reason.materialRequirementId || reason.blockedByTaskId || ''}`;
        if (reasons.some(item => `${item.code}:${item.materialRequirementId || item.blockedByTaskId || ''}` === key)) return false;
        reasons.push(reason);
        heldTaskReasons.set(taskId, reasons);
        return true;
      };
      for (const constraint of schedule?.materialConstraints || []) {
        const expectedAt = Date.parse(constraint.expectedAvailableAt || '');
        if (constraint.blocker) holdTask(constraint.taskId, { code: 'material_availability_unresolved',
          materialRequirementId: constraint.materialRequirementId || null, materialName: constraint.materialName || 'Materiaal',
          message: `${constraint.materialName || 'Materiaal'} heeft geen geverifieerde of gedateerde beschikbaarheid voor ${constraint.taskTitle || 'de gekoppelde taak'}.` });
        else if (Number.isFinite(expectedAt) && expectedAt >= horizonEndMs) holdTask(constraint.taskId, {
          code: 'material_after_planning_horizon', materialRequirementId: constraint.materialRequirementId || null,
          materialName: constraint.materialName || 'Materiaal', expectedAvailableAt: constraint.expectedAvailableAt,
          message: `${constraint.materialName || 'Materiaal'} wordt pas na deze planningshorizon verwacht.` });
      }
      let propagated = true;
      while (propagated) {
        propagated = false;
        for (const dependency of dependencies) {
          if (!heldTaskReasons.has(dependency.predecessorTaskId)) continue;
          const predecessor = tasks.find(task => task.id === dependency.predecessorTaskId);
          if (holdTask(dependency.successorTaskId, { code: 'blocked_by_material_predecessor',
            blockedByTaskId: dependency.predecessorTaskId, blockedByTaskTitle: predecessor?.title || dependency.predecessorTaskId,
            message: `Wacht op materiaalgeblokkeerde voorganger: ${predecessor?.title || dependency.predecessorTaskId}.` })) propagated = true;
        }
      }
      const heldTasks = tasks.filter(task => heldTaskReasons.has(task.id)).map(task => ({
        taskId: task.id, title: task.title, reasons: heldTaskReasons.get(task.id)
      }));
      const scheduledTasks = tasks.filter(task => !heldTaskReasons.has(task.id));
      const materialReadyByTask = {};
      for (const constraint of schedule?.materialConstraints || []) {
        if (!constraint.blocker && constraint.expectedAvailableAt && !heldTaskReasons.has(constraint.taskId)) {
          materialReadyByTask[constraint.taskId] = Math.max(materialReadyByTask[constraint.taskId] || anchorMs, Date.parse(constraint.expectedAvailableAt));
        }
      }

      if (!tasks.length) inputIssues.push({ code: 'no_active_tasks', message: 'Add active tasks to the work plan.' });
      if (!Number.isFinite(anchorMs)) inputIssues.push({ code: 'planned_start_required', message: 'Set a planned start for the resource preview.' });
      if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > MAX_HORIZON_DAYS) fail(`Planning horizon must be from 1 to ${MAX_HORIZON_DAYS} days.`);
      if (tasks.length > MAX_TASKS) inputIssues.push({ code: 'task_limit_exceeded', count: tasks.length, limit: MAX_TASKS, message: `The solver is limited to ${MAX_TASKS} tasks per preview.` });
      const lockedSchedules = new Map();
      const slotMs = SLOT_MINUTES * 60_000;
      for (const task of tasks) {
        const held = heldTaskReasons.has(task.id);
        if (!held && (!Number.isFinite(Number(task.durationHours)) || Number(task.durationHours) <= 0)) inputIssues.push({ code: 'duration_required', taskId: task.id, title: task.title, message: `Set a positive duration for ${task.title}.` });
        if (!held && !String(task.data?.requiredTrade || '').trim()) inputIssues.push({ code: 'required_trade_missing', taskId: task.id, title: task.title, message: `Set an explicit required trade for ${task.title}; the planner does not infer one.` });
        if (!held && task.dueAt && !Number.isFinite(Date.parse(task.dueAt))) inputIssues.push({ code: 'due_date_invalid', taskId: task.id, title: task.title, message: `Correct the due date for ${task.title}.` });
        const hasPlannedStart = Boolean(task.plannedStart);
        const hasPlannedEnd = Boolean(task.plannedEnd);
        if (hasPlannedStart !== hasPlannedEnd) {
          inputIssues.push({ code: 'existing_schedule_incomplete', taskId: task.id, title: task.title, message: `${task.title} has only part of an existing schedule. Complete or clear that schedule before calculating a resource plan.` });
          continue;
        }
        if (hasPlannedStart) {
          const start = Date.parse(task.plannedStart);
          const end = Date.parse(task.plannedEnd);
          const startSlot = Number.isFinite(anchorMs) ? (start - anchorMs) / slotMs : NaN;
          const endSlot = Number.isFinite(anchorMs) ? (end - anchorMs) / slotMs : NaN;
          const durationSlots = Math.ceil(Number(task.durationHours) * 60 / SLOT_MINUTES);
          if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isInteger(startSlot) || !Number.isInteger(endSlot)
            || startSlot < 0 || endSlot > horizonDays * 48 || !held && endSlot - startSlot !== durationSlots) {
            inputIssues.push({ code: 'existing_schedule_outside_solver_window', taskId: task.id, title: task.title, message: `${task.title} already has a scheduled time that is outside this planning window or does not match the solver's 30-minute resolution. Change the planning window or review the existing schedule explicitly.` });
            continue;
          }
          lockedSchedules.set(task.id, { startSlot, endSlot });
        }
      }
      const unsupportedDependencies = dependencies.filter(item => !['finish_to_start', 'fs'].includes(String(item.dependencyType || '').toLowerCase()));
      if (unsupportedDependencies.length) inputIssues.push({ code: 'dependency_type_unsupported', count: unsupportedDependencies.length, message: 'Only finish-to-start dependencies are currently supported by this preview.' });

      const assignmentRows = this.ledger.db.prepare(`
        SELECT assignments.*, workers.name AS worker_name, workers.role AS worker_role,
          workers.status AS worker_status, jobs.title AS job_title
        FROM assignments JOIN workers ON workers.id = assignments.worker_id
        JOIN jobs ON jobs.id = assignments.job_id
        WHERE assignments.job_id = ? AND assignments.worker_id IS NOT NULL
          AND ${this.ledger.activeAssignmentStatusSql('assignments')}
        ORDER BY assignments.worker_id, assignments.id
      `).all(jobId);
      if (!assignmentRows.length) inputIssues.push({ code: 'crew_missing', message: 'Assign workers to this job before calculating a resource plan.' });
      const uniqueWorkerIds = [...new Set(assignmentRows.map(row => row.worker_id))];
      if (uniqueWorkerIds.length > MAX_WORKERS) inputIssues.push({ code: 'worker_limit_exceeded', count: uniqueWorkerIds.length, limit: MAX_WORKERS, message: `The solver is limited to ${MAX_WORKERS} workers per preview.` });
      const siteAccessCalendar = detail.data?.siteAccessCalendar || null;
      const travelRoutes = Array.isArray(detail.data?.travelRoutes) ? detail.data.travelRoutes : [];
      const travelRoutesByJob = new Map(travelRoutes.map(route => [route.externalJobId, route]));
      const currentSite = normalizedSiteSnapshot(detail);
      let siteAccessBlocks = [];
      if (siteAccessCalendar && Number.isFinite(anchorMs)) {
        try {
          siteAccessBlocks = this.siteAccessBlocks(siteAccessCalendar, anchorMs, horizonDays);
        } catch (error) {
          inputIssues.push({ code: 'site_access_calendar_invalid', message: `The retained site access calendar is invalid: ${error.message}` });
        }
      }
      const assignmentWindows = new Map();
      for (const row of assignmentRows) {
        const start = Date.parse(row.scheduled_start || '');
        const end = Date.parse(row.scheduled_end || '');
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          inputIssues.push({ code: 'assignment_window_missing', workerId: row.worker_id, workerName: row.worker_name, assignmentId: row.id, message: `${row.worker_name} has an active job assignment without a complete time window.` });
          continue;
        }
        const windows = assignmentWindows.get(row.worker_id) || [];
        windows.push({ start, end, assignmentId: row.id });
        assignmentWindows.set(row.worker_id, windows);
      }

      const requirements = detail.qualificationRequirements.filter(row => ['active', 'pending_retirement'].includes(row.status));
      const candidateByTask = {};
      const qualificationEvidence = [];
      const capacityProfiles = (typeof this.ledger.listCrewCapacityProfiles === 'function'
        ? this.ledger.listCrewCapacityProfiles({ includeHistory: false, limit: 10_000 })
        : [])
        .filter(profile => uniqueWorkerIds.includes(profile.workerId));
      for (const profile of capacityProfiles) {
        if (!profile.integrityValid) inputIssues.push({ code: 'capacity_profile_integrity_invalid', workerId: profile.workerId, message: `The retained capacity calendar for ${profile.workerName || profile.workerId} failed its integrity check.` });
      }
      const capacityByWorker = new Map(capacityProfiles.filter(profile => profile.integrityValid).map(profile => [profile.workerId, profile]));
      const availabilityRows = this.ledger.db.prepare(`
        SELECT * FROM worker_availability_periods
        WHERE worker_id IN (${uniqueWorkerIds.length ? uniqueWorkerIds.map(() => '?').join(',') : "''"})
          AND status IN ('active', 'pending_cancellation')
        ORDER BY worker_id, starts_at, id
      `).all(...uniqueWorkerIds);
      const availability = availabilityRows.map(row => this.ledger.mapWorkerAvailabilityPeriod(row));
      const portfolioJobIds = [...new Set((Array.isArray(payload.portfolioJobIds) ? payload.portfolioJobIds : [])
        .map(value => String(value)).filter(value => value && value !== jobId))];
      const portfolioExclusion = portfolioJobIds.length
        ? `AND assignments.job_id NOT IN (${portfolioJobIds.map(() => '?').join(', ')})`
        : '';
      const externalRows = this.ledger.db.prepare(`
        SELECT assignments.*, jobs.title AS job_title, jobs.address AS job_address,
          jobs.city AS job_city, jobs.region AS job_region, jobs.country AS job_country
        FROM assignments JOIN jobs ON jobs.id = assignments.job_id
        WHERE assignments.job_id <> ? ${portfolioExclusion} AND assignments.worker_id IN (${uniqueWorkerIds.length ? uniqueWorkerIds.map(() => '?').join(',') : "''"})
          AND ${this.ledger.activeAssignmentStatusSql('assignments')}
          AND (assignments.scheduled_start IS NULL OR assignments.scheduled_end IS NULL
            OR (assignments.scheduled_end > ? AND assignments.scheduled_start < ?))
        ORDER BY assignments.worker_id, assignments.id
      `).all(jobId, ...portfolioJobIds, ...uniqueWorkerIds,
        Number.isFinite(anchorMs) ? new Date(anchorMs - 8 * 60 * 60_000).toISOString() : '9999-12-31T23:59:59.999Z',
        Number.isFinite(horizonEndMs) ? new Date(horizonEndMs + 8 * 60 * 60_000).toISOString() : '0001-01-01T00:00:00.000Z');
      const externalByWorker = new Map();
      for (const row of externalRows) {
        const start = Date.parse(row.scheduled_start || '');
        const end = Date.parse(row.scheduled_end || '');
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
          inputIssues.push({ code: 'external_assignment_window_missing', workerId: row.worker_id, assignmentId: row.id, message: `An existing assignment for ${row.worker_id} has no complete time window, so conflicts cannot be checked.` });
          continue;
        }
        const rows = externalByWorker.get(row.worker_id) || [];
        rows.push({
          start, end, jobId: row.job_id, jobTitle: row.job_title,
          site: normalizedSiteSnapshot({ address: row.job_address, city: row.job_city, region: row.job_region, country: row.job_country })
        });
        externalByWorker.set(row.worker_id, rows);
      }
      const missingTravelRoutes = new Set();

      const blocksForWorker = workerId => [
        ...tasks.filter(task => heldTaskReasons.has(task.id) && [task.assigneeId, ...(task.data?.supervisorWorkerIds || (task.data?.supervisorWorkerId ? [task.data.supervisorWorkerId] : []))].includes(workerId)
          && task.plannedStart && task.plannedEnd).map(task => ({ start: Date.parse(task.plannedStart), end: Date.parse(task.plannedEnd), reason: 'held_material_task' })),
        ...availability.filter(period => period.workerId === workerId && period.periodType !== 'standby').map(period => ({ start: Date.parse(period.startsAt), end: period.returnUnknown || !period.endsAt ? horizonEndMs : Date.parse(period.endsAt), reason: 'reported_unavailability' })),
        ...(externalByWorker.get(workerId) || []).map(item => ({ start: item.start, end: item.end, reason: 'other_job_assignment' })),
        ...(externalByWorker.get(workerId) || []).flatMap(item => {
          const route = travelRoutesByJob.get(item.jobId);
          const routeIsCurrent = route?.version === 1
            && JSON.stringify(route.fromSite) === JSON.stringify(currentSite)
            && JSON.stringify(route.toSite) === JSON.stringify(item.site)
            && Number.isInteger(route.minutesToExternal) && route.minutesToExternal >= 0 && route.minutesToExternal <= 480
            && Number.isInteger(route.minutesFromExternal) && route.minutesFromExternal >= 0 && route.minutesFromExternal <= 480
            && (route.sourceType === 'same_site' || route.sourceType === 'map_reference' || route.sourceType === 'contractor_verified')
            && (route.sourceType !== 'same_site' || (sameSiteSnapshot(currentSite, item.site) && route.minutesToExternal === 0 && route.minutesFromExternal === 0))
            && (route.sourceType === 'same_site' || (route.minutesToExternal > 0 && route.minutesFromExternal > 0))
            && typeof route.note === 'string' && route.note.trim().length >= 8;
          if (!routeIsCurrent) {
            const addressesReady = Boolean(currentSite.address && item.site.address);
            const issueCode = !addressesReady ? 'travel_route_site_address_required' : route ? 'travel_route_stale' : 'travel_route_required';
            const issueKey = `${item.jobId}:${issueCode}`;
            if (!missingTravelRoutes.has(issueKey)) {
              missingTravelRoutes.add(issueKey);
              inputIssues.push({
                code: issueCode,
                externalJobId: item.jobId,
                externalJobTitle: item.jobTitle,
                sameSite: sameSiteSnapshot(currentSite, item.site),
                siteAddressesReady: addressesReady,
                existingRoute: route || null,
                message: !addressesReady
                  ? `Record a street address for both ${detail.title} and ${item.jobTitle} before travel can be planned.`
                  : route
                  ? `Refresh the recorded route to ${item.jobTitle}; one or both site addresses changed.`
                  : `Record a sourced route to ${item.jobTitle} in both directions before planning around this worker's other assignment.`
              });
            }
            return [];
          }
          return [
            { start: item.start - route.minutesToExternal * 60_000, end: item.start, reason: 'travel_to_other_job' },
            { start: item.end, end: item.end + route.minutesFromExternal * 60_000, reason: 'travel_from_other_job' }
          ].filter(block => block.end > block.start);
        }),
        ...this.nonWorkingDayBlocks(capacityByWorker.get(workerId), anchorMs, horizonDays),
        ...siteAccessBlocks
      ].filter(item => Number.isFinite(item.start) && Number.isFinite(item.end) && item.end > anchorMs && item.start < horizonEndMs);

      for (const task of tasks) {
        if (heldTaskReasons.has(task.id)) {
          candidateByTask[task.id] = [];
          continue;
        }
        const crewRequirements = taskCrewRequirements(task);
        const supervisorWorkerIds = Array.isArray(task.data?.supervisorWorkerIds) && task.data.supervisorWorkerIds.length
          ? [...new Set(task.data.supervisorWorkerIds)] : task.data?.supervisorWorkerId ? [task.data.supervisorWorkerId] : [];
        const supervisorWorkerId = supervisorWorkerIds[0] || null;
        const supervisorTrade = normalizeRole(task.data?.supervisorTrade);
        if (Boolean(supervisorWorkerIds.length) !== Boolean(supervisorTrade)) inputIssues.push({ code: 'supervision_assignment_incomplete', taskId: task.id, title: task.title, message: `Record named supervisors and their explicit job role for ${task.title}.` });
        if (supervisorWorkerIds.some(id => id === task.assigneeId)) inputIssues.push({ code: 'supervisor_must_be_distinct', taskId: task.id, title: task.title, message: `The assigned worker cannot supervise their own task: ${task.title}.` });
        const supervisors = supervisorWorkerIds.map(workerId => {
          const rows = assignmentRows.filter(row => row.worker_id === workerId
            && normalizeRole(row.role || row.worker_role) === supervisorTrade && row.worker_status === 'available');
          const windows = (assignmentWindows.get(workerId) || []).filter(window => window.end > anchorMs && window.start < horizonEndMs);
          if (!rows.length) inputIssues.push({ code: 'supervisor_assignment_unavailable', taskId: task.id, title: task.title, workerId, message: `Each named supervisor must have an active, available job assignment in the explicit ${task.data.supervisorTrade} role.` });
          if (!windows.length) inputIssues.push({ code: 'supervisor_window_missing', taskId: task.id, title: task.title, workerId, message: `A scheduled job window is required for each supervisor assigned to ${task.title}.` });
          if (rows.length && windows.length) {
            const assessmentAt = new Date(Math.max(anchorMs, ...windows.map(window => Math.min(window.end, horizonEndMs)))).toISOString();
            const qualification = this.ledger.assessWorkerQualifications(workerId, { jobId, role: task.data.supervisorTrade, at: assessmentAt, requirements });
            qualificationEvidence.push({ taskId: task.id, workerId, role: 'supervisor', status: qualification.status,
              blockers: qualification.blockers.map(item => item.type), evidence: qualification.items.map(item => ({ requirementId: item.requirement.id,
                status: item.status, credentialId: item.credential?.id || null, expiresOn: item.credential?.expiresOn || null })) });
            if (!qualification.ready) inputIssues.push({ code: 'supervisor_qualification_missing', taskId: task.id, title: task.title, workerId, blockers: qualification.blockers.map(item => item.type), message: `A named supervisor does not currently satisfy mandatory qualifications for ${task.title}.` });
          }
          return { workerId, rows, windows };
        });
        const ratio = task.data?.supervisionRatio;
        const requiredSupervisorCount = Number(ratio?.requiredSupervisorCount || (supervisorWorkerIds.length ? 1 : 0));
        if (ratio && (!Number.isInteger(Number(ratio.workersPerSupervisor)) || !Number.isInteger(requiredSupervisorCount)
          || requiredSupervisorCount !== Math.ceil(Number(task.data?.requiredCrewSize || 1) / Number(ratio.workersPerSupervisor))
          || supervisorWorkerIds.length < requiredSupervisorCount)) {
          inputIssues.push({ code: 'supervision_ratio_invalid', taskId: task.id, title: task.title, message: `The retained supervisor count no longer satisfies the supervision ratio for ${task.title}.` });
        }
        const candidates = [];
        for (const workerId of uniqueWorkerIds) {
          const rows = assignmentRows.filter(row => row.worker_id === workerId);
          if (rows.some(row => row.worker_status !== 'available')) continue;
          const windows = (assignmentWindows.get(workerId) || []).filter(window => window.end > anchorMs && window.start < horizonEndMs);
          if (!windows.length) continue;
          const assessmentAt = new Date(Math.max(anchorMs, ...windows.map(window => Math.min(window.end, horizonEndMs)))).toISOString();
          if (supervisorWorkerIds.includes(workerId)) continue;
          const blocks = blocksForWorker(workerId);
          const supervisorBlocks = supervisorWorkerIds.flatMap(id => blocksForWorker(id));
          const primaryWindows = windows.map(window => ({ start: Math.max(window.start, anchorMs), end: Math.min(window.end, horizonEndMs) }));
          const pairedWindows = supervisors.reduce((available, supervisor) => available.flatMap(window => supervisor.windows
            .map(supervisorWindow => ({ start: Math.max(window.start, supervisorWindow.start), end: Math.min(window.end, supervisorWindow.end) }))
            .filter(window => window.end > window.start)), primaryWindows);
          for (const crewRequirement of crewRequirements) {
            const eligibleRows = rows.filter(row => normalizeRole(row.role || row.worker_role) === normalizeRole(crewRequirement.role));
            if (!eligibleRows.length) continue;
            const qualification = this.ledger.assessWorkerQualifications(workerId, { jobId, role: crewRequirement.role, at: assessmentAt, requirements });
            qualificationEvidence.push({
              taskId: task.id,
              workerId,
              role: crewRequirement.role,
              status: qualification.status,
              blockers: qualification.blockers.map(item => item.type),
              evidence: qualification.items.map(item => ({
                requirementId: item.requirement.id,
                status: item.status,
                credentialId: item.credential?.id || null,
                expiresOn: item.credential?.expiresOn || null
              }))
            });
            if (!qualification.ready) continue;
            candidates.push({
              workerId,
              workerName: rows[0].worker_name,
              role: eligibleRows[0].role || eligibleRows[0].worker_role,
              roleKey: normalizeRole(crewRequirement.role),
              supervisorWorkerId,
              supervisorWorkerIds,
              supervisorNames: supervisors.map(item => item.rows[0]?.worker_name || this.ledger.getWorker(item.workerId)?.name || item.workerId),
              windows: pairedWindows.map(window => ({ startSlot: Math.max(0, ceilSlot(window.start, anchorMs)), endSlot: Math.min(horizonDays * 48, floorSlot(window.end, anchorMs)) })).filter(window => window.endSlot > window.startSlot),
              blocks: [...blocks, ...supervisorBlocks].map(block => ({ startSlot: Math.max(0, floorSlot(block.start, anchorMs)), endSlot: Math.min(horizonDays * 48, ceilSlot(block.end, anchorMs)), reason: block.reason }))
            });
          }
        }
        candidateByTask[task.id] = candidates;
        const requiredCrewSize = Number(task.data?.requiredCrewSize || 1);
        if (!Number.isInteger(requiredCrewSize) || requiredCrewSize < 1 || requiredCrewSize > 12) {
          inputIssues.push({ code: 'required_crew_size_invalid', taskId: task.id, title: task.title, message: `Record a whole-number crew size from 1 to 12 for ${task.title}.` });
        } else if (task.assigneeId && !candidates.some(candidate => candidate.workerId === task.assigneeId)) {
          inputIssues.push({ code: 'assigned_worker_unqualified', taskId: task.id, title: task.title, workerId: task.assigneeId,
            message: `The already assigned worker for ${task.title} does not currently meet any required trade, availability and qualification requirements.` });
        } else if (task.plannedStart && Array.isArray(task.data?.crewWorkerIds)
          && (task.data?.crewWorkerAssignments || task.data.crewWorkerIds.map(workerId => ({ workerId, role: crewRequirements[0]?.role })))
            .some(member => !candidates.some(candidate => candidate.workerId === member.workerId && normalizeRole(candidate.role) === normalizeRole(member.role)))) {
          inputIssues.push({ code: 'locked_crew_member_unavailable', taskId: task.id, title: task.title,
            message: `A worker already retained on the fixed crew for ${task.title} no longer meets the recorded trade, availability and qualification requirements.` });
        } else {
          for (const crewRequirement of crewRequirements) {
            const roleCandidates = candidates.filter(candidate => candidate.roleKey === normalizeRole(crewRequirement.role));
            if (roleCandidates.length < crewRequirement.count) inputIssues.push({ code: 'qualified_crew_insufficient', taskId: task.id, title: task.title,
              requiredTrade: crewRequirement.role, requiredCrewSize: crewRequirement.count, qualifiedCandidateCount: roleCandidates.length,
              message: `${task.title} requires ${crewRequirement.count} qualified ${crewRequirement.role} worker(s), but only ${roleCandidates.length} currently assigned worker(s) meet the recorded conditions.` });
          }
        }
      }

      const source = {
        jobId,
        plannedStart: Number.isFinite(anchorMs) ? new Date(anchorMs).toISOString() : null,
        horizonDays,
        tasks: tasks.map(task => ({ id: task.id, title: task.title, status: task.status, priority: task.priority, durationHours: task.durationHours, assigneeId: task.assigneeId, requiredCrewSize: task.data?.requiredCrewSize || 1, requiredCrewRequirements: taskCrewRequirements(task), crewWorkerIds: task.data?.crewWorkerIds || [], crewWorkerAssignments: task.data?.crewWorkerAssignments || [], dueAt: task.dueAt || null, requiredTrade: task.data?.requiredTrade || null, supervisorWorkerIds: task.data?.supervisorWorkerIds || (task.data?.supervisorWorkerId ? [task.data.supervisorWorkerId] : []), supervisorTrade: task.data?.supervisorTrade || null, supervisionRatio: task.data?.supervisionRatio || null, materialRequirementIds: task.data?.materialRequirementIds || [], plannedStart: task.plannedStart, plannedEnd: task.plannedEnd })).sort((a, b) => a.id.localeCompare(b.id)),
        dependencies: dependencies.map(item => ({ id: item.id, predecessorTaskId: item.predecessorTaskId, successorTaskId: item.successorTaskId, type: item.dependencyType, lagHours: item.lagHours })).sort((a, b) => a.id.localeCompare(b.id)),
        assignments: assignmentRows.map(row => ({ id: row.id, workerId: row.worker_id, workerName: row.worker_name, workerRole: row.worker_role, workerStatus: row.worker_status, role: row.role, status: row.status, scheduledStart: row.scheduled_start, scheduledEnd: row.scheduled_end })).sort((a, b) => a.id.localeCompare(b.id)),
        availability: availability.map(item => ({ id: item.id, workerId: item.workerId, periodType: item.periodType, status: item.status, startsAt: item.startsAt, endsAt: item.endsAt, returnUnknown: item.returnUnknown })).sort((a, b) => a.id.localeCompare(b.id)),
        siteAccessCalendar,
        capacityProfiles: capacityProfiles.map(profile => ({ workerId: profile.workerId, effectiveFrom: profile.effectiveFrom, timezone: profile.timezone, dailyHours: profile.dailyHours, workingWindows: profile.workingWindows, sourceHash: profile.sourceHash, integrityValid: profile.integrityValid })).sort((a, b) => a.workerId.localeCompare(b.workerId)),
        externalAssignments: externalRows.map(row => ({ id: row.id, workerId: row.worker_id, jobId: row.job_id, title: row.job_title, status: row.status, scheduledStart: row.scheduled_start, scheduledEnd: row.scheduled_end, site: normalizedSiteSnapshot({ address: row.job_address, city: row.job_city, region: row.job_region, country: row.job_country }) })).sort((a, b) => a.id.localeCompare(b.id)),
        travelRoutes,
        qualifications: qualificationEvidence.sort((a, b) => `${a.taskId}:${a.workerId}:${a.role || ''}`.localeCompare(`${b.taskId}:${b.workerId}:${b.role || ''}`)),
        qualificationRequirements: requirements.map(item => ({ id: item.id, roleKey: item.roleKey, credentialType: item.credentialType, mandatory: item.mandatory, status: item.status })).sort((a, b) => a.id.localeCompare(b.id)),
        materialConstraints: schedule?.materialConstraints || [],
        preconstructionCapacityForecast: detail.data?.preconstructionCapacityForecast || null
      };
      const sourceHash = hash(source);
      if (inputIssues.length) return { result: { status: 'incomplete_input', ready: false, jobId, sourceHash, generatedAt: new Date().toISOString(), issues: inputIssues, tasks: [], limitations: this.limitations(capacityProfiles, Boolean(siteAccessCalendar)) } };
      if (!scheduledTasks.length) return { result: { status: 'blocked_by_materials', ready: false, partial: false, jobId, sourceHash,
        plannedStart: new Date(anchorMs).toISOString(), horizonDays, generatedAt: new Date().toISOString(), tasks: [], heldTasks,
        issues: heldTasks.flatMap(item => item.reasons), limitations: this.limitations(capacityProfiles, Boolean(siteAccessCalendar)) } };

      const tasksForSolver = scheduledTasks.map(task => ({
        id: task.id,
        jobId,
        title: task.title,
        durationSlots: Math.ceil(Number(task.durationHours) * 60 / SLOT_MINUTES),
        requiredCrewSize: Number(task.data?.requiredCrewSize || 1),
        crewRequirements: taskCrewRequirements(task).map(item => ({ role: item.role, roleKey: normalizeRole(item.role), count: item.count })),
        currentWorkerId: task.assigneeId || null,
        fixedCrewWorkerAssignments: task.plannedStart && Array.isArray(task.data?.crewWorkerAssignments)
          ? task.data.crewWorkerAssignments
          : task.plannedStart && Array.isArray(task.data?.crewWorkerIds)
            ? task.data.crewWorkerIds.map(workerId => ({ workerId, role: taskCrewRequirements(task)[0]?.role || task.data?.requiredTrade || '' }))
            : null,
        lockedStartSlot: lockedSchedules.get(task.id)?.startSlot ?? null,
        candidates: candidateByTask[task.id],
        supervisorWorkerIds: Array.isArray(task.data?.supervisorWorkerIds) && task.data.supervisorWorkerIds.length
          ? task.data.supervisorWorkerIds : task.data?.supervisorWorkerId ? [task.data.supervisorWorkerId] : [],
        supervisorWorkerId: task.data?.supervisorWorkerId || null,
        supervisorTrade: task.data?.supervisorTrade || null,
        supervisionRatio: task.data?.supervisionRatio || null,
        predecessorIds: dependencies.filter(item => item.successorTaskId === task.id && scheduledTasks.some(candidate => candidate.id === item.predecessorTaskId)).map(item => item.predecessorTaskId),
        lagSlots: Object.fromEntries(dependencies.filter(item => item.successorTaskId === task.id).map(item => [item.predecessorTaskId, Math.ceil(Number(item.lagHours || 0) * 60 / SLOT_MINUTES)])),
        earliestStartSlot: materialReadyByTask[task.id] ? Math.max(0, ceilSlot(materialReadyByTask[task.id], anchorMs)) : 0,
        dueSlot: task.dueAt ? floorSlot(Date.parse(task.dueAt), anchorMs) : null
      }));
      const problem = { jobId, anchorMs, horizonSlots: horizonDays * 48, tasks: tasksForSolver, timeoutMs: SOLVER_TIMEOUT_MS };
      return { jobId, sourceHash, anchorMs, horizonDays, tasks, heldTasks, candidateByTask, tasksForSolver, problem,
        capacityProfiles, siteAccessCalendar, currentSite, travelRoutes,
        preconstructionCapacityForecast: detail.data?.preconstructionCapacityForecast || null };
    });
    return prepared;
  }

  async preview(jobId, payload = {}) {
    const prepared = this.prepare(jobId, payload);
    if (prepared.result) return prepared.result;
    const { sourceHash, anchorMs, tasks, heldTasks, candidateByTask, tasksForSolver, problem, horizonDays, capacityProfiles, siteAccessCalendar,
      preconstructionCapacityForecast } = prepared;
    const solved = await this.solve(problem);
    if (solved.status !== 'feasible') return { ...solved, jobId, sourceHash, plannedStart: new Date(anchorMs).toISOString(), horizonDays, generatedAt: new Date().toISOString(), heldTasks, issues: solved.status === 'infeasible' ? [{ code: 'resource_constraints_conflict', message: 'The recorded task, trade, assignment-window, site-access, availability, external-assignment, material or dependency constraints cannot all be satisfied.' }] : [], limitations: this.limitations(capacityProfiles, Boolean(siteAccessCalendar)) };
    const rows = solved.assignments.map(item => {
      const task = tasks.find(candidate => candidate.id === item.taskId);
      const selectedCrew = item.crewMembers || (item.workerIds || [item.workerId]).map(workerId => ({ workerId, role: task?.data?.requiredTrade }));
      const workers = selectedCrew.map(member => {
        const candidate = candidateByTask[item.taskId].find(option => option.workerId === member.workerId && normalizeRole(option.role) === normalizeRole(member.role));
        return candidate ? { workerId: candidate.workerId, workerName: candidate.workerName, role: candidate.role } : null;
      }).filter(Boolean);
      const supervisorWorkerIds = item.supervisorWorkerIds || (item.supervisorWorkerId ? [item.supervisorWorkerId] : []);
      const supervisorCandidate = candidateByTask[item.taskId].find(candidate => candidate.workerId === item.workerId);
      const supervisors = supervisorWorkerIds.map((workerId, index) => ({
        workerId,
        workerName: supervisorCandidate?.supervisorNames?.[index] || workerId,
        role: task?.data.supervisorTrade || null
      }));
      return {
      taskId: item.taskId,
      title: task?.title,
      workerId: task?.assigneeId || item.workerId,
      workerName: workers.find(worker => worker.workerId === (task?.assigneeId || item.workerId))?.workerName,
      workerIds: selectedCrew.map(member => member.workerId),
      crewMembers: selectedCrew,
      workers,
      supervisorWorkerIds,
      supervisors,
      supervisorWorkerId: item.supervisorWorkerId || null,
      supervisorName: supervisors[0]?.workerName || null,
      supervisorTrade: task?.data.supervisorTrade || null,
      supervisionRatio: task?.data.supervisionRatio || null,
      requiredTrade: task?.data.requiredTrade,
      requiredCrewRequirements: taskCrewRequirements(task),
      plannedStart: toIsoSlot(anchorMs, item.startSlot),
      plannedEnd: toIsoSlot(anchorMs, item.startSlot + tasksForSolver.find(task => task.id === item.taskId).durationSlots),
      durationHours: tasksForSolver.find(task => task.id === item.taskId).durationSlots * SLOT_MINUTES / 60,
      scheduleProtected: Number.isInteger(tasksForSolver.find(task => task.id === item.taskId).lockedStartSlot),
      durationRoundedUp: tasksForSolver.find(task => task.id === item.taskId).durationSlots * SLOT_MINUTES / 60 > Number(task.durationHours)
    }; });
    return {
      status: 'feasible_under_recorded_constraints', ready: true, partial: heldTasks.length > 0, heldTasks,
      jobId, sourceHash, plannedStart: new Date(anchorMs).toISOString(), horizonDays, generatedAt: new Date().toISOString(),
      tasks: rows, objective: solved.objective, issues: [],
      preconstructionReconciliation: preconstructionReconciliation(preconstructionCapacityForecast, rows, {
        timeZone: siteAccessCalendar?.timeZone || 'Europe/Amsterdam',
        timeZoneSource: siteAccessCalendar ? 'site_access_calendar' : 'default'
      }),
      limitations: this.limitations(capacityProfiles, Boolean(siteAccessCalendar))
    };
  }

  preparePortfolio(jobIdsInput, payload = {}) {
    const jobIds = [...new Set((Array.isArray(jobIdsInput) ? jobIdsInput : []).map(value => String(value || '').trim()).filter(Boolean))].sort();
    if (jobIds.length < 2 || jobIds.length > MAX_PORTFOLIO_JOBS) {
      fail(`Select between 2 and ${MAX_PORTFOLIO_JOBS} jobs for a portfolio resource plan.`);
    }
    const portfolioId = `portfolio:${hash(jobIds).slice(0, 24)}`;
    const horizonDays = Number(payload.horizonDays || 21);
    if (!Number.isInteger(horizonDays) || horizonDays < 1 || horizonDays > MAX_HORIZON_DAYS) {
      fail(`Planning horizon must be from 1 to ${MAX_HORIZON_DAYS} days.`);
    }
    const plannedStart = payload.plannedStart || payload.planned_start;
    const preparedJobs = jobIds.map(jobId => this.prepare(jobId, {
      plannedStart,
      horizonDays,
      portfolioJobIds: jobIds
    }));
    const jobErrors = preparedJobs.filter(item => item.result && item.result.status !== 'blocked_by_materials')
      .map(item => ({ jobId: item.jobId, ...item.result }));
    if (jobErrors.length) {
      return { result: { status: 'incomplete_input', ready: false, portfolioId, jobIds, issues: jobErrors.flatMap(item => (
        (item.issues || []).map(issue => ({ ...issue, jobId: item.jobId }))
      )), jobErrors } };
    }
    const anchorMs = preparedJobs.find(item => Number.isFinite(item.anchorMs))?.anchorMs;
    if (!Number.isFinite(anchorMs)) {
      return { result: { status: 'incomplete_input', ready: false, portfolioId, jobIds,
        issues: [{ code: 'planned_start_required', message: 'Set one shared planned start for the portfolio resource preview.' }] } };
    }
    const jobDetails = preparedJobs.map(item => {
      const job = this.ledger.requireJob(item.jobId);
      const detail = this.ledger.getJobDetail(item.jobId, { includeAudit: false, includeCapabilities: false });
      return { id: item.jobId, title: job.title, site: item.currentSite || normalizedSiteSnapshot(detail),
        routes: item.travelRoutes || detail.data?.travelRoutes || [], prepared: item, detail };
    });
    const travelMinutesByJobId = Object.fromEntries(jobIds.map(id => [id, {}]));
    const travelRouteEvidence = [];
    const routeIssues = [];
    const validRoute = (route, fromSite, toSite) => Boolean(route?.version === 1
      && JSON.stringify(route.fromSite) === JSON.stringify(fromSite)
      && JSON.stringify(route.toSite) === JSON.stringify(toSite)
      && Number.isInteger(route.minutesToExternal) && route.minutesToExternal >= 0 && route.minutesToExternal <= 480
      && Number.isInteger(route.minutesFromExternal) && route.minutesFromExternal >= 0 && route.minutesFromExternal <= 480
      && ['same_site', 'map_reference', 'contractor_verified'].includes(route.sourceType)
      && (route.sourceType !== 'same_site' || (sameSiteSnapshot(fromSite, toSite) && route.minutesToExternal === 0 && route.minutesFromExternal === 0))
      && (route.sourceType === 'same_site' || (route.minutesToExternal > 0 && route.minutesFromExternal > 0))
      && typeof route.note === 'string' && route.note.trim().length >= 8);
    const workerSets = jobDetails.map(item => new Set((item.prepared.tasksForSolver || []).flatMap(task => [
      ...task.candidates.map(candidate => candidate.workerId), ...task.supervisorWorkerIds
    ])));
    for (let left = 0; left < jobDetails.length; left += 1) {
      for (let right = left + 1; right < jobDetails.length; right += 1) {
        const from = jobDetails[left], to = jobDetails[right];
        const sameSite = sameSiteSnapshot(from.site, to.site);
        let forward = sameSite ? { minutesToExternal: 0, minutesFromExternal: 0, sourceType: 'same_site', note: 'Verified identical site snapshot.' } : null;
        if (!sameSite) {
          const candidate = from.routes.find(route => route.externalJobId === to.id);
          if (validRoute(candidate, from.site, to.site)) {
            forward = candidate;
          } else {
            const reverseCandidate = to.routes.find(route => route.externalJobId === from.id);
            if (validRoute(reverseCandidate, to.site, from.site)) {
              forward = { minutesToExternal: reverseCandidate.minutesFromExternal, minutesFromExternal: reverseCandidate.minutesToExternal,
                sourceType: reverseCandidate.sourceType, note: reverseCandidate.note, version: reverseCandidate.version };
            }
          }
        }
        if (forward) {
          travelMinutesByJobId[from.id][to.id] = forward.minutesToExternal;
          travelMinutesByJobId[to.id][from.id] = forward.minutesFromExternal;
          travelRouteEvidence.push({ fromJobId: from.id, toJobId: to.id,
            minutesForward: forward.minutesToExternal, minutesReverse: forward.minutesFromExternal,
            sourceType: forward.sourceType, note: forward.note, fromSite: from.site, toSite: to.site });
        } else {
          const sharedWorkers = [...workerSets[left]].filter(workerId => workerSets[right].has(workerId));
          if (sharedWorkers.length) routeIssues.push({ code: from.site.address && to.site.address ? 'portfolio_travel_route_required' : 'portfolio_travel_route_site_address_required',
            fromJobId: from.id, fromJobTitle: from.title, toJobId: to.id, toJobTitle: to.title,
            sharedWorkerCount: sharedWorkers.length,
            message: from.site.address && to.site.address
              ? `Record a current sourced route between ${from.title} and ${to.title} before planning shared workers across both sites.`
              : `Add a street address to both ${from.title} and ${to.title} before planning shared workers across these sites.` });
          travelMinutesByJobId[from.id][to.id] = null;
          travelMinutesByJobId[to.id][from.id] = null;
        }
      }
    }
    if (routeIssues.length) return { result: { status: 'incomplete_input', ready: false, portfolioId, jobIds,
      plannedStart: new Date(anchorMs).toISOString(), horizonDays, issues: routeIssues, travelRouteEvidence } };
    const tasks = [];
    const tasksForSolver = [];
    const heldTasks = [];
    const sourceHashes = [];
    const limitations = [];
    for (const item of preparedJobs) {
      const job = jobDetails.find(detail => detail.id === item.jobId);
      if (item.result?.status === 'blocked_by_materials') {
        heldTasks.push(...(item.result.heldTasks || []).map(task => ({ ...task, jobId: item.jobId, jobTitle: job.title })));
        sourceHashes.push({ jobId: item.jobId, sourceHash: item.result.sourceHash });
        continue;
      }
      sourceHashes.push({ jobId: item.jobId, sourceHash: item.sourceHash });
      heldTasks.push(...item.heldTasks.map(task => ({ ...task, jobId: item.jobId, jobTitle: job.title })));
      tasks.push(...item.tasks.map(task => ({ ...task, jobId: item.jobId, jobTitle: job.title })));
      tasksForSolver.push(...item.tasksForSolver.map(task => ({
        ...task,
        jobId: item.jobId,
        jobTitle: job.title,
        travelMinutesByJobId: travelMinutesByJobId[item.jobId],
        candidates: task.candidates.map(candidate => ({ ...candidate, jobId: item.jobId }))
      })));
      limitations.push(...(item.result?.limitations || this.limitations(item.capacityProfiles, Boolean(item.siteAccessCalendar))));
    }
    if (!tasksForSolver.length) return { result: { status: 'blocked_by_materials', ready: false, partial: false,
      portfolioId, jobIds, plannedStart: new Date(anchorMs).toISOString(), horizonDays, tasks: [], heldTasks, issues: heldTasks.flatMap(task => task.reasons || []) } };
    if (tasksForSolver.length > MAX_PORTFOLIO_TASKS) return { result: { status: 'incomplete_input', ready: false, portfolioId, jobIds,
      issues: [{ code: 'portfolio_task_limit_exceeded', count: tasksForSolver.length, limit: MAX_PORTFOLIO_TASKS,
        message: `The joint planner is limited to ${MAX_PORTFOLIO_TASKS} active tasks per portfolio preview.` }] } };
    const sourceHash = hash({ portfolioId, jobIds, plannedStart: new Date(anchorMs).toISOString(), horizonDays,
      sourceHashes, travelMinutesByJobId, travelRouteEvidence, heldTasks });
    return { portfolioId, jobId: portfolioId, jobIds, sourceHash, anchorMs, horizonDays, tasks, heldTasks, tasksForSolver,
      travelMinutesByJobId, travelRouteEvidence, limitations: [...new Set(limitations)] };
  }

  async previewPortfolio(payload = {}) {
    const prepared = this.preparePortfolio(payload.jobIds || payload.job_ids, payload);
    if (prepared.result) return prepared.result;
    const solved = await this.solve({ jobId: prepared.portfolioId, anchorMs: prepared.anchorMs,
      horizonSlots: prepared.horizonDays * 48, tasks: prepared.tasksForSolver, timeoutMs: SOLVER_TIMEOUT_MS });
    if (solved.status !== 'feasible') return { ...solved, ready: false, portfolioId: prepared.portfolioId, jobIds: prepared.jobIds,
      sourceHash: prepared.sourceHash, plannedStart: new Date(prepared.anchorMs).toISOString(), horizonDays: prepared.horizonDays,
      heldTasks: prepared.heldTasks, travelRouteEvidence: prepared.travelRouteEvidence,
      issues: solved.status === 'infeasible' ? [{ code: 'portfolio_resource_constraints_conflict',
        message: 'The selected job plans, crew windows, qualifications, travel buffers, dependencies, availability or material constraints cannot all be satisfied.' }] : [],
      limitations: prepared.limitations };
    const durationByTask = new Map(prepared.tasksForSolver.map(task => [task.id, task.durationSlots]));
    const proposal = {
      status: 'feasible_under_recorded_constraints', jobId: prepared.portfolioId, sourceHash: prepared.sourceHash,
      plannedStart: new Date(prepared.anchorMs).toISOString(), horizonDays: prepared.horizonDays,
      tasks: solved.assignments.map(item => ({ ...item,
        plannedStart: toIsoSlot(prepared.anchorMs, item.startSlot),
        plannedEnd: toIsoSlot(prepared.anchorMs, item.startSlot + durationByTask.get(item.taskId)),
        supervisorWorkerIds: item.supervisorWorkerIds || [],
        supervisorWorkerId: item.supervisorWorkerId || null
      }))
    };
    const assignments = this.validatePlan(prepared, proposal);
    const jobTitles = new Map(prepared.tasks.map(task => [task.id, task.jobTitle]));
    return { status: 'feasible_under_recorded_constraints', ready: true, partial: prepared.heldTasks.length > 0,
      portfolioId: prepared.portfolioId, jobId: prepared.portfolioId, jobIds: prepared.jobIds, sourceHash: prepared.sourceHash,
      plannedStart: proposal.plannedStart, horizonDays: prepared.horizonDays, tasks: assignments.map(item => ({
        ...item, jobTitle: jobTitles.get(item.taskId) || item.jobId
      })), heldTasks: prepared.heldTasks, travelRouteEvidence: prepared.travelRouteEvidence,
      objective: solved.objective, issues: [], limitations: prepared.limitations };
  }

  validatePlan(prepared, proposal) {
    if (prepared.result || proposal?.status !== 'feasible_under_recorded_constraints' || proposal.jobId !== prepared.jobId || proposal.sourceHash !== prepared.sourceHash) {
      fail('De resourceplanning is gewijzigd of is niet meer compleet. Bereken een nieuw voorstel.', 409);
    }
    if (!Array.isArray(proposal.tasks) || proposal.tasks.length !== prepared.tasksForSolver.length) fail('Het resourcevoorstel bevat niet alle actieve taken.', 409);
    const submitted = new Map();
    for (const row of proposal.tasks) {
      if (!row || typeof row.taskId !== 'string' || submitted.has(row.taskId)) fail('Het resourcevoorstel bevat dubbele of ongeldige taken.', 409);
      submitted.set(row.taskId, row);
    }
    const assignments = [];
    const byTask = new Map();
    for (const task of prepared.tasksForSolver) {
      const row = submitted.get(task.id);
      const leadWorkerId = prepared.tasks.find(item => item.id === task.id)?.assigneeId || row?.workerId;
      const submittedCrew = Array.isArray(row?.crewMembers) ? row.crewMembers
        : (Array.isArray(row?.workerIds) ? row.workerIds : [row?.workerId]).map(workerId => ({ workerId, role: task.crewRequirements[0]?.role || '' }));
      const crewMembers = submittedCrew.map(member => ({ workerId: member?.workerId, role: member?.role, roleKey: normalizeRole(member?.role) }));
      const workerIds = crewMembers.map(member => member.workerId).sort();
      const crewCandidates = crewMembers.map(member => task.candidates.find(item => item.workerId === member.workerId && item.roleKey === member.roleKey));
      const expectedSupervisorIds = task.supervisorWorkerIds || (task.supervisorWorkerId ? [task.supervisorWorkerId] : []);
      const submittedSupervisorIds = Array.isArray(row?.supervisorWorkerIds) ? row.supervisorWorkerIds
        : row?.supervisorWorkerId ? [row.supervisorWorkerId] : [];
      const leadIndex = crewMembers.findIndex(member => member.workerId === leadWorkerId);
      const candidate = leadIndex >= 0 ? crewCandidates[leadIndex] : null;
      const startMs = Date.parse(row?.plannedStart || ''), endMs = Date.parse(row?.plannedEnd || '');
      const slotMs = SLOT_MINUTES * 60_000;
      const startSlot = (startMs - prepared.anchorMs) / slotMs;
      const endSlot = (endMs - prepared.anchorMs) / slotMs;
      const fixedCrewWorkerAssignments = Array.isArray(task.fixedCrewWorkerAssignments)
        ? task.fixedCrewWorkerAssignments.map(member => `${member.workerId}:${normalizeRole(member.role)}`).sort() : null;
      const submittedCrewAssignments = crewMembers.map(member => `${member.workerId}:${member.roleKey}`).sort();
      const supervisorsMatch = JSON.stringify([...new Set(submittedSupervisorIds)].sort()) === JSON.stringify([...expectedSupervisorIds].sort())
        && new Set(submittedSupervisorIds).size === submittedSupervisorIds.length
        && !submittedSupervisorIds.some(workerId => workerIds.includes(workerId));
      const roleCountsMatch = task.crewRequirements.every(requirement => (
        crewMembers.filter(member => member.roleKey === requirement.roleKey).length === requirement.count
      )) && crewMembers.length === task.requiredCrewSize;
      if (!candidate || new Set(workerIds).size !== workerIds.length || workerIds.length !== task.requiredCrewSize
        || !supervisorsMatch || !roleCountsMatch
        || (Array.isArray(row?.workerIds) && JSON.stringify([...new Set(row.workerIds)].sort()) !== JSON.stringify(workerIds))
        || (fixedCrewWorkerAssignments && JSON.stringify(submittedCrewAssignments) !== JSON.stringify(fixedCrewWorkerAssignments))
        || crewCandidates.some(item => !item)
        || !Number.isInteger(startSlot) || !Number.isInteger(endSlot)
        || crewCandidates.some(item => JSON.stringify([...(item.supervisorWorkerIds || (item.supervisorWorkerId ? [item.supervisorWorkerId] : []))].sort())
          !== JSON.stringify([...expectedSupervisorIds].sort()))
        || endSlot - startSlot !== task.durationSlots || startSlot < task.earliestStartSlot
        || (Number.isInteger(task.lockedStartSlot) && startSlot !== task.lockedStartSlot)
        || (task.dueSlot !== null && endSlot > task.dueSlot)
        || crewCandidates.some(item => !item.windows.some(window => startSlot >= window.startSlot && endSlot <= window.endSlot)
          || item.blocks.some(block => startSlot < block.endSlot && endSlot > block.startSlot))) {
        fail('Een taak past niet meer binnen de actuele inzet-, beschikbaarheids- of kwalificatievoorwaarden.', 409);
      }
      const normalized = {
        taskId: task.id,
        jobId: task.jobId || prepared.jobId,
        workerId: candidate.workerId,
        workerName: candidate.workerName,
        workerIds,
        crewMembers: crewMembers.map(member => ({ workerId: member.workerId, role: member.role })),
        workers: crewCandidates.map(item => ({ workerId: item.workerId, workerName: item.workerName, role: item.role })),
        supervisorWorkerIds: expectedSupervisorIds,
        supervisors: expectedSupervisorIds.map((workerId, index) => ({ workerId,
          workerName: candidate.supervisorNames?.[index] || workerId, role: task.supervisorTrade || null })),
        supervisorWorkerId: candidate.supervisorWorkerId || null,
        supervisorName: candidate.supervisorNames?.[0] || candidate.supervisorName || null,
        supervisorTrade: prepared.tasks.find(item => item.id === task.id)?.data?.supervisorTrade || null,
        supervisionRatio: task.supervisionRatio || null,
        title: task.title,
        requiredTrade: prepared.tasks.find(item => item.id === task.id)?.data?.requiredTrade,
        startSlot,
        endSlot,
        plannedStart: toIsoSlot(prepared.anchorMs, startSlot),
        plannedEnd: toIsoSlot(prepared.anchorMs, endSlot),
        durationHours: task.durationSlots * SLOT_MINUTES / 60,
        scheduleProtected: Number.isInteger(task.lockedStartSlot)
      };
      assignments.push(normalized);
      byTask.set(task.id, normalized);
    }
    for (const task of prepared.tasksForSolver) {
      const row = byTask.get(task.id);
      for (const predecessorId of task.predecessorIds) {
        const predecessor = byTask.get(predecessorId);
        if (!predecessor || row.startSlot < predecessor.endSlot + (task.lagSlots[predecessorId] || 0)) fail('De taakvolgorde is gewijzigd of bevat een afhankelijkheidsconflict.', 409);
      }
    }
    const byWorker = new Map();
    for (const row of assignments) {
      for (const workerId of row.workerIds) {
        const workerRows = byWorker.get(workerId) || [];
        workerRows.push(row);
        byWorker.set(workerId, workerRows);
      }
      for (const workerId of row.supervisorWorkerIds || (row.supervisorWorkerId ? [row.supervisorWorkerId] : [])) {
        const supervisedRows = byWorker.get(workerId) || [];
        supervisedRows.push({ ...row, workerId });
        byWorker.set(workerId, supervisedRows);
      }
    }
    for (const rows of byWorker.values()) {
      rows.sort((a, b) => a.startSlot - b.startSlot);
      for (let index = 1; index < rows.length; index += 1) {
        const previous = rows[index - 1];
        const current = rows[index];
        const travelMinutes = previous.jobId === current.jobId ? 0
          : Number(prepared.travelMinutesByJobId?.[previous.jobId]?.[current.jobId]);
        if (!Number.isFinite(travelMinutes) || previous.endSlot + Math.ceil(travelMinutes / SLOT_MINUTES) > current.startSlot) {
          fail('Het resourcevoorstel plant een uitvoerende dubbel in of laat onvoldoende reistijd tussen opdrachten.', 409);
        }
      }
    }
    return assignments.map(row => ({
      taskId: row.taskId,
      jobId: row.jobId,
      workerId: row.workerId,
      workerName: row.workerName,
      workerIds: row.workerIds,
      crewMembers: row.crewMembers,
      workers: row.workers,
      supervisorWorkerIds: row.supervisorWorkerIds,
      supervisors: row.supervisors,
      supervisorWorkerId: row.supervisorWorkerId,
      supervisorName: row.supervisorName,
      supervisorTrade: row.supervisorTrade,
      supervisionRatio: row.supervisionRatio,
      title: row.title,
      requiredTrade: row.requiredTrade,
      plannedStart: row.plannedStart,
      plannedEnd: row.plannedEnd,
      durationHours: row.durationHours,
      scheduleProtected: row.scheduleProtected
    }));
  }

  requestApproval(jobId, payload = {}, actor = 'Contractor.AI') {
    return this.ledger.transaction(() => {
      const proposal = payload.plan;
      const prepared = this.prepare(jobId, { plannedStart: proposal?.plannedStart, horizonDays: proposal?.horizonDays });
      const assignments = this.validatePlan(prepared, proposal);
      const data = {
        format: 'contractor_ai_resource_plan_v1',
        sourceHash: prepared.sourceHash,
        plannedStart: new Date(prepared.anchorMs).toISOString(),
        horizonDays: prepared.horizonDays,
        assignments,
        heldTasks: prepared.heldTasks,
        requestedReason: typeof payload.reason === 'string' ? payload.reason.slice(0, 2000) : null
      };
      const proposalHash = hash(data);
      const pending = this.ledger.db.prepare(`
        SELECT * FROM approvals WHERE target_type = 'resource_plan' AND job_id = ? AND status = 'pending'
        ORDER BY created_at DESC LIMIT 1
      `).get(jobId);
      if (pending) {
        const pendingData = JSON.parse(pending.data_json || '{}');
        if (pendingData.proposalHash === proposalHash) return { approval: this.ledger.mapApproval(pending), idempotent: true };
        fail('Behandel eerst het bestaande resourcevoorstel in de goedkeuringswachtrij.', 409);
      }
      const proposalId = `resource_${require('node:crypto').randomUUID()}`;
      const approval = this.ledger.createApproval({
        targetType: 'resource_plan',
        targetId: proposalId,
        jobId,
        approvalType: 'internal_resource_plan',
        summary: `${prepared.heldTasks.length ? 'Approve partial resource plan for ' : 'Approve resource plan for '}${this.ledger.requireJob(jobId).title}`,
        reason: `Only ${assignments.length} schedulable task(s) will change after independent approval and source-current validation. ${prepared.heldTasks.length} material-dependent task(s) and their dependent work remain unchanged and on hold.`,
        data: { ...data, proposalHash, externalCommitments: 0 }
      }, { actor });
      this.ledger.audit({
        entityType: 'resource_plan',
        entityId: proposalId,
        jobId,
        action: 'request_resource_plan_approval',
        actor,
        after: { approvalId: approval.id, sourceHash: data.sourceHash, assignments, proposalHash },
        metadata: { approvalId: approval.id, assignmentCount: assignments.length, externalCommitments: 0 }
      });
      return { approval, idempotent: false };
    });
  }

  requestPortfolioApproval(payload = {}, actor = 'Contractor.AI') {
    return this.ledger.transaction(() => {
      const proposal = payload.plan;
      if (!proposal || !Array.isArray(proposal.jobIds)) fail('Bereken eerst een portfolio-resourcevoorstel.', 409);
      const prepared = this.preparePortfolio(proposal.jobIds, {
        plannedStart: proposal.plannedStart,
        horizonDays: proposal.horizonDays
      });
      const assignments = this.validatePlan(prepared, proposal);
      const data = {
        format: 'contractor_ai_portfolio_resource_plan_v1',
        portfolioId: prepared.portfolioId,
        jobIds: prepared.jobIds,
        sourceHash: prepared.sourceHash,
        plannedStart: new Date(prepared.anchorMs).toISOString(),
        horizonDays: prepared.horizonDays,
        assignments,
        heldTasks: prepared.heldTasks,
        travelRouteEvidence: prepared.travelRouteEvidence,
        requestedReason: typeof payload.reason === 'string' ? payload.reason.slice(0, 2000) : null
      };
      const proposalHash = hash(data);
      const pendingRows = this.ledger.db.prepare(`
        SELECT * FROM approvals WHERE target_type = 'portfolio_resource_plan' AND status = 'pending'
        ORDER BY created_at DESC
      `).all();
      for (const pending of pendingRows) {
        const pendingData = JSON.parse(pending.data_json || '{}');
        if (pendingData.portfolioId !== prepared.portfolioId) continue;
        if (pendingData.proposalHash === proposalHash) return { approval: this.ledger.mapApproval(pending), idempotent: true };
        fail('Behandel eerst het bestaande gezamenlijke resourcevoorstel in de goedkeuringswachtrij.', 409);
      }
      const proposalId = `portfolio_resource_${require('node:crypto').randomUUID()}`;
      this.ledger.requireJob(prepared.jobIds[0]);
      const approval = this.ledger.createApproval({
        targetType: 'portfolio_resource_plan',
        targetId: proposalId,
        jobId: prepared.jobIds[0],
        approvalType: 'internal_portfolio_resource_plan',
        summary: `Approve joint resource plan for ${prepared.jobIds.length} jobs`,
        reason: `One independent approval applies ${assignments.length} task allocation(s) across ${prepared.jobIds.length} selected jobs atomically. ${prepared.heldTasks.length} material-dependent task(s) remain unchanged and on hold.`,
        data: { ...data, proposalHash, externalCommitments: 0 }
      }, { actor });
      for (const jobId of prepared.jobIds) this.ledger.audit({
        entityType: 'portfolio_resource_plan', entityId: proposalId, jobId,
        action: 'request_portfolio_resource_plan_approval', actor,
        after: { approvalId: approval.id, portfolioId: prepared.portfolioId, sourceHash: data.sourceHash, proposalHash },
        metadata: { approvalId: approval.id, assignmentCount: assignments.length, jobCount: prepared.jobIds.length, externalCommitments: 0 }
      });
      return { approval, idempotent: false };
    });
  }

  applyApprovedResourcePlan(proposalId) {
    const approval = this.ledger.db.prepare(`
      SELECT * FROM approvals WHERE target_type = 'resource_plan' AND target_id = ? AND status = 'approved'
      ORDER BY resolved_at DESC LIMIT 1
    `).get(proposalId);
    if (!approval) fail('Voor het resourcevoorstel is geen goedkeuring vastgelegd.', 409);
    const resourcePlanId = approval.target_id;
    const data = JSON.parse(approval.data_json || '{}');
    const proposalHash = data.proposalHash;
    const integrityData = { ...data };
    delete integrityData.proposalHash;
    delete integrityData.externalCommitments;
    if (data.format !== 'contractor_ai_resource_plan_v1' || hash(integrityData) !== proposalHash) fail('De integriteit van het resourcevoorstel kan niet worden bevestigd.', 409);
    const prepared = this.prepare(approval.job_id, { plannedStart: data.plannedStart, horizonDays: data.horizonDays });
    const assignments = this.validatePlan(prepared, {
      status: 'feasible_under_recorded_constraints',
      jobId: approval.job_id,
      sourceHash: data.sourceHash,
      tasks: data.assignments
    });
    const timestamp = this.ledger.clock().toISOString();
    for (const assignment of assignments) {
      const beforeRow = this.ledger.db.prepare('SELECT * FROM job_tasks WHERE id = ? AND job_id = ?').get(assignment.taskId, approval.job_id);
      if (!beforeRow) fail('Een taak uit het resourcevoorstel bestaat niet meer.', 409);
      const before = this.ledger.mapTask(beforeRow);
      let taskData = { ...before.data, crewWorkerIds: assignment.workerIds, crewWorkerAssignments: assignment.crewMembers,
        requiredCrewSize: assignment.workerIds.length, requiredCrewRequirements: taskCrewRequirements(before),
        supervisorWorkerId: assignment.supervisorWorkerId, supervisorWorkerIds: assignment.supervisorWorkerIds,
        supervisionRatio: assignment.supervisionRatio, supervisorTrade: assignment.supervisorTrade };
      taskData = this.ledger.resolveReplacementScheduleReview(approval.job_id, {
        ...before, assigneeId: assignment.workerId, plannedStart: assignment.plannedStart, plannedEnd: assignment.plannedEnd
      }, assignment, taskData, approval.resolved_by || 'approval', timestamp, approval.id);
      this.ledger.db.prepare(`
        UPDATE job_tasks
        SET assignee_id = ?, planned_start = ?, planned_end = ?, duration_hours = ?, data_json = ?, updated_at = ?
        WHERE id = ? AND job_id = ?
      `).run(assignment.workerId, assignment.plannedStart, assignment.plannedEnd, assignment.durationHours,
        JSON.stringify(taskData),
        timestamp, assignment.taskId, approval.job_id);
      const after = this.ledger.mapTask(this.ledger.db.prepare('SELECT * FROM job_tasks WHERE id = ?').get(assignment.taskId));
      this.ledger.audit({
        entityType: 'task',
        entityId: assignment.taskId,
        jobId: approval.job_id,
        action: 'apply_resource_plan_assignment',
        actor: approval.resolved_by || 'approval',
        before,
        after,
        metadata: { approvalId: approval.id, resourcePlanId, workerId: assignment.workerId, externalCommitments: 0 }
      });
    }
    this.ledger.audit({
      entityType: 'resource_plan',
      entityId: resourcePlanId,
      jobId: approval.job_id,
      action: 'apply_approved_resource_plan',
      actor: approval.resolved_by || 'approval',
      after: { approvalId: approval.id, sourceHash: data.sourceHash, assignments },
      metadata: { approvalId: approval.id, assignmentCount: assignments.length, externalCommitments: 0 }
    });
    return assignments;
  }

  applyApprovedPortfolioResourcePlan(proposalId) {
    const approval = this.ledger.db.prepare(`
      SELECT * FROM approvals WHERE target_type = 'portfolio_resource_plan' AND target_id = ? AND status = 'approved'
      ORDER BY resolved_at DESC LIMIT 1
    `).get(proposalId);
    if (!approval) fail('Voor het gezamenlijke resourcevoorstel is geen goedkeuring vastgelegd.', 409);
    const data = JSON.parse(approval.data_json || '{}');
    const proposalHash = data.proposalHash;
    const integrityData = { ...data };
    delete integrityData.proposalHash;
    delete integrityData.externalCommitments;
    if (data.format !== 'contractor_ai_portfolio_resource_plan_v1' || hash(integrityData) !== proposalHash) {
      fail('De integriteit van het gezamenlijke resourcevoorstel kan niet worden bevestigd.', 409);
    }
    const prepared = this.preparePortfolio(data.jobIds, { plannedStart: data.plannedStart, horizonDays: data.horizonDays });
    const assignments = this.validatePlan(prepared, {
      status: 'feasible_under_recorded_constraints', jobId: prepared.portfolioId,
      jobIds: prepared.jobIds, sourceHash: data.sourceHash, plannedStart: data.plannedStart,
      horizonDays: data.horizonDays, tasks: data.assignments
    });
    const allowedJobs = new Set(prepared.jobIds);
    const timestamp = this.ledger.clock().toISOString();
    for (const assignment of assignments) {
      if (!allowedJobs.has(assignment.jobId)) fail('Een taak uit het voorstel valt buiten de goedgekeurde opdrachten.', 409);
      const beforeRow = this.ledger.db.prepare('SELECT * FROM job_tasks WHERE id = ? AND job_id = ?').get(assignment.taskId, assignment.jobId);
      if (!beforeRow) fail('Een taak uit het gezamenlijke voorstel bestaat niet meer.', 409);
      const before = this.ledger.mapTask(beforeRow);
      let taskData = { ...before.data, crewWorkerIds: assignment.workerIds, crewWorkerAssignments: assignment.crewMembers,
        requiredCrewSize: assignment.workerIds.length, requiredCrewRequirements: taskCrewRequirements(before),
        supervisorWorkerId: assignment.supervisorWorkerId, supervisorWorkerIds: assignment.supervisorWorkerIds,
        supervisionRatio: assignment.supervisionRatio, supervisorTrade: assignment.supervisorTrade };
      taskData = this.ledger.resolveReplacementScheduleReview(assignment.jobId, {
        ...before, assigneeId: assignment.workerId, plannedStart: assignment.plannedStart, plannedEnd: assignment.plannedEnd
      }, assignment, taskData, approval.resolved_by || 'approval', timestamp, approval.id);
      this.ledger.db.prepare(`
        UPDATE job_tasks
        SET assignee_id = ?, planned_start = ?, planned_end = ?, duration_hours = ?, data_json = ?, updated_at = ?
        WHERE id = ? AND job_id = ?
      `).run(assignment.workerId, assignment.plannedStart, assignment.plannedEnd, assignment.durationHours,
        JSON.stringify(taskData),
        timestamp, assignment.taskId, assignment.jobId);
      const after = this.ledger.mapTask(this.ledger.db.prepare('SELECT * FROM job_tasks WHERE id = ?').get(assignment.taskId));
      this.ledger.audit({ entityType: 'task', entityId: assignment.taskId, jobId: assignment.jobId,
        action: 'apply_portfolio_resource_plan_assignment', actor: approval.resolved_by || 'approval', before, after,
        metadata: { approvalId: approval.id, portfolioId: data.portfolioId, workerId: assignment.workerId, externalCommitments: 0 } });
    }
    this.ledger.audit({ entityType: 'portfolio_resource_plan', entityId: proposalId, jobId: approval.job_id,
      action: 'apply_approved_portfolio_resource_plan', actor: approval.resolved_by || 'approval',
      after: { approvalId: approval.id, portfolioId: data.portfolioId, sourceHash: data.sourceHash, assignments },
      metadata: { approvalId: approval.id, assignmentCount: assignments.length, jobCount: prepared.jobIds.length, externalCommitments: 0 } });
    return assignments;
  }

  limitations(capacityProfiles = [], hasSiteAccessCalendar = false) {
    const limitations = ['proposal_only_until_independent_approval', 'approval_revalidates_source_hash_and_task_constraints_before_apply', 'existing_task_schedule_is_preserved', 'only_current_job_assignments_are_candidates', 'requires_explicit_task_trade_duration_and_assignment_time_windows', 'task_durations_round_up_to_30_minutes_and_tasks_are_not_split', 'breaks_and_split_shifts_must_be_recorded_as_explicit_work_intervals', 'recorded_route_durations_between_external_job_assignments_are_hard_blocks', 'home_to_first_job_and_return_trips_are_not_modeled', 'travel_within_a_site_is_not_modeled', 'qualification_is_checked_conservatively_at_the_latest_candidate_window_end', 'reported_standby_is_not_work_consent'];
    if (!hasSiteAccessCalendar) limitations.push('site_access_hours_not_recorded');
    if (capacityProfiles.some(profile => !profile.hasWorkingTimeWindows)) limitations.push('legacy_capacity_profiles_without_working_time_windows_only_block_non_working_days');
    return limitations;
  }

  siteAccessBlocks(calendar, anchorMs, horizonDays) {
    const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    if (calendar.version !== 1 || !calendar.weeklyWindows || typeof calendar.weeklyWindows !== 'object') throw new Error('unsupported format');
    if (!['customer_confirmed', 'site_document', 'contractor_verified'].includes(calendar.sourceType)
      || typeof calendar.note !== 'string' || calendar.note.trim().length < 8) throw new Error('missing verification source');
    try { new Intl.DateTimeFormat('en', { timeZone: calendar.timeZone }).format(new Date(0)); }
    catch { throw new Error('invalid time zone'); }
    const windowsByDay = new Map();
    for (const day of weekdays) {
      const windows = calendar.weeklyWindows[day];
      if (!Array.isArray(windows) || windows.length > 3) throw new Error(`invalid ${day} intervals`);
      const minutes = windows.map(window => {
        if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(window?.start || ''))
          || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(window?.end || ''))) throw new Error(`invalid ${day} time`);
        const start = Number(window.start.slice(0, 2)) * 60 + Number(window.start.slice(3));
        const end = Number(window.end.slice(0, 2)) * 60 + Number(window.end.slice(3));
        if (end <= start) throw new Error(`invalid ${day} range`);
        return { start, end };
      }).sort((left, right) => left.start - right.start);
      if (minutes.some((window, index) => index > 0 && minutes[index - 1].end > window.start)) throw new Error(`overlapping ${day} intervals`);
      windowsByDay.set(day, minutes);
    }

    const horizonSlots = horizonDays * 48;
    const slotMs = SLOT_MINUTES * 60_000;
    const blocked = [];
    let runStart = null;
    for (let slot = 0; slot <= horizonSlots; slot += 1) {
      if (slot === horizonSlots) {
        if (runStart !== null) blocked.push({ start: anchorMs + runStart * slotMs, end: anchorMs + slot * slotMs, reason: 'site_access_closed' });
        break;
      }
      const start = slot < horizonSlots ? localDayParts(anchorMs + slot * slotMs, calendar.timeZone) : null;
      const end = slot < horizonSlots ? localDayParts(anchorMs + (slot + 1) * slotMs, calendar.timeZone) : null;
      const isOpen = Boolean(start && end && end.date === start.date && windowsByDay.get(start.weekday)?.some(window => (
        start.minuteOfDay >= window.start && end.minuteOfDay <= window.end
      )));
      if (!isOpen && runStart === null) runStart = slot;
      if (isOpen && runStart !== null) {
        blocked.push({ start: anchorMs + runStart * slotMs, end: anchorMs + slot * slotMs, reason: 'site_access_closed' });
        runStart = null;
      }
    }
    return blocked;
  }

  nonWorkingDayBlocks(profile, anchorMs, horizonDays) {
    if (!profile) return [];
    const horizonSlots = horizonDays * 48;
    const slotMs = SLOT_MINUTES * 60_000;
    const blocked = [];
    let runStart = null;
    for (let slot = 0; slot <= horizonSlots; slot += 1) {
      const start = slot < horizonSlots ? localDayParts(anchorMs + slot * slotMs, profile.timezone) : null;
      const end = slot < horizonSlots ? localDayParts(anchorMs + (slot + 1) * slotMs, profile.timezone) : null;
      const dayWindows = start ? profile.workingWindows?.[start.weekday] : null;
      const windows = Array.isArray(dayWindows) ? dayWindows : dayWindows ? [dayWindows] : [];
      const withinWindow = windows.some(window => {
        const windowStart = Number(window.start.slice(0, 2)) * 60 + Number(window.start.slice(3));
        const windowEnd = Number(window.end.slice(0, 2)) * 60 + Number(window.end.slice(3));
        return start.minuteOfDay >= windowStart && end.minuteOfDay <= windowEnd;
      });
      const isBlocked = Boolean(start && (
        start.date < profile.effectiveFrom
        || Number(profile.dailyHours?.[start.weekday] || 0) <= 0
        || (profile.hasWorkingTimeWindows && (
          !withinWindow
          || end.date !== start.date
        ))
      ));
      if (isBlocked && runStart === null) runStart = slot;
      if (!isBlocked && runStart !== null) {
        blocked.push({ start: anchorMs + runStart * slotMs, end: anchorMs + slot * slotMs, reason: 'non_working_day' });
        runStart = null;
      }
    }
    return blocked;
  }

  solve(problem) {
    if (this.active >= this.maxConcurrent) fail('The resource planner is busy. Retry shortly.', 503);
    this.active += 1;
    return new Promise((resolve, reject) => {
      const worker = new Worker(path.join(__dirname, 'resource-planner-worker.js'), { workerData: problem });
      let settled = false;
      const finish = (callback, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.active = Math.max(0, this.active - 1);
        callback(value);
      };
      const timer = setTimeout(() => {
        void worker.terminate();
        finish(resolve, { status: 'timed_out', ready: false, reason: 'wall_clock_limit' });
      }, WORKER_TIMEOUT_MS);
      worker.once('message', result => finish(resolve, result));
      worker.once('error', error => finish(reject, error));
      worker.once('exit', code => { if (code !== 0 && !settled) finish(reject, new Error(`Resource solver worker exited with code ${code}.`)); });
    });
  }
}

module.exports = { ResourcePlanner, preconstructionReconciliation };
