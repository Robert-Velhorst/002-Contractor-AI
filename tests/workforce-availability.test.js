const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');

function createLedger(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-worker-availability-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return ledger;
}

function futureWindow(offsetDays = 7, durationHours = 8) {
  const startsAt = new Date(Date.now() + offsetDays * 86_400_000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + durationHours * 3_600_000).toISOString();
  return { startsAt, endsAt };
}

test('standby windows expose conditional capacity without blocking availability or confirmed work', t => {
  const ledger = createLedger(t);
  const window = futureWindow(18, 6);
  const job = ledger.createIntake({
    title: 'Standby window work', client: { name: 'Standby client' },
    status: 'scheduled', scheduledStart: window.startsAt, scheduledEnd: window.endsAt
  });
  const worker = ledger.upsertWorker({ name: 'Standby carpenter', role: 'Installer', status: 'available' });
  const standby = ledger.createWorkerAvailabilityPeriod(worker.id, {
    periodType: 'standby', title: 'Available on call', startsAt: window.startsAt, endsAt: window.endsAt
  }, { actor: 'availability_test' });

  assert.equal(standby.period.periodType, 'standby');
  assert.equal(ledger.getWorker(worker.id).availability.status, 'standby_scheduled');
  assert.equal(ledger.findWorkerAvailabilityConflicts({ workerId: worker.id, scheduledStart: window.startsAt, scheduledEnd: window.endsAt }).length, 0);
  const candidate = ledger.workerScheduleCandidates({ title: job.title, jobType: 'installation' }, window.startsAt, window.endsAt, job.id)
    .find(item => item.worker.id === worker.id);
  assert.equal(candidate.available, true);
  assert.equal(candidate.availabilityConflicts.length, 0);

  const assignment = ledger.addAssignment(job.id, {
    workerId: worker.id, role: 'Installer', status: 'planned',
    scheduledStart: window.startsAt, scheduledEnd: window.endsAt
  });
  assert.equal(assignment.status, 'planned');
  const register = ledger.listWorkerAvailabilityRegister();
  assert.equal(register.summary.currentUnavailable, 0);
  assert.equal(register.summary.upcomingStandby, 1);
  assert.equal(register.conflicts.length, 0);
  assert.equal(ledger.diagnose().valid, true);
});

test('weekly unavailability blocks matching future shifts and expands into daily capacity', t => {
  const ledger = createLedger(t);
  const worker = ledger.upsertWorker({ name: 'Weekly availability carpenter', role: 'Installer', status: 'available' });
  const series = ledger.createWorkerAvailabilityPeriod(worker.id, {
    periodType: 'unavailable', title: 'Weekly family commitment',
    startsAt: '2027-01-04T08:00:00.000Z', endsAt: '2027-01-04T17:00:00.000Z',
    recurrence: { frequency: 'weekly', daysOfWeek: [1], timeZone: 'Europe/Amsterdam', until: '2027-01-25' }
  }, { actor: 'availability_test' });

  const recurringShift = ledger.findWorkerAvailabilityConflicts({
    workerId: worker.id, scheduledStart: '2027-01-11T08:00:00.000Z', scheduledEnd: '2027-01-11T17:00:00.000Z'
  });
  const clearShift = ledger.findWorkerAvailabilityConflicts({
    workerId: worker.id, scheduledStart: '2027-01-12T08:00:00.000Z', scheduledEnd: '2027-01-12T17:00:00.000Z'
  });
  assert.equal(series.period.recurrence.frequency, 'weekly');
  assert.equal(recurringShift.length, 1);
  assert.equal(recurringShift[0].recurrenceOccurrenceDate, '2027-01-11');
  assert.equal(clearShift.length, 0);
  assert.equal(ledger.getWorkerAvailabilityPeriod(series.period.id).nextOccurrence.startsAt, series.period.nextOccurrence.startsAt);
  const summary = ledger.workerAvailabilitySummary(worker.id, '2027-01-11T09:30:00.000Z');
  assert.equal(summary.current, 1);
  assert.equal(summary.upcoming, 2);
  const standbyWorker = ledger.upsertWorker({ name: 'Weekly standby carpenter', role: 'Installer', status: 'available' });
  const standby = ledger.createWorkerAvailabilityPeriod(standbyWorker.id, {
    periodType: 'standby', title: 'Weekly on-call window',
    startsAt: '2027-01-04T08:00:00.000Z', endsAt: '2027-01-04T17:00:00.000Z', minimumNoticeHours: 12,
    recurrence: { frequency: 'weekly', daysOfWeek: [1], timeZone: 'Europe/Amsterdam', until: '2027-01-25' }
  }, { actor: 'availability_test' });
  const standbyOverlap = ledger.findWorkerStandbyConflicts({ workerId: standbyWorker.id,
    scheduledStart: '2027-01-11T08:00:00.000Z', scheduledEnd: '2027-01-11T17:00:00.000Z' });
  assert.equal(standbyOverlap.length, 1);
  assert.equal(standbyOverlap[0].id, standby.period.id);
  assert.equal(standbyOverlap[0].recurrenceOccurrenceDate, '2027-01-11');
  ledger.setCrewCapacityProfile(worker.id, {
    effectiveFrom: '2027-01-04', timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 8, tuesday: 8, wednesday: 0, thursday: 0, friday: 0, saturday: 0 }
  });
  const capacityWorker = ledger.listCrewCapacityBoard({ referenceDate: '2027-01-11' }).workers.find(item => item.id === worker.id);
  assert.equal(capacityWorker.days.find(day => day.date === '2027-01-11').availableHours, 0);
  assert.equal(capacityWorker.days.find(day => day.date === '2027-01-12').availableHours, 8);
});

test('standby minimum notice is retained and rejected for non-standby or invalid values', t => {
  const ledger = createLedger(t);
  const worker = ledger.upsertWorker({ name: 'Notice-window carpenter', role: 'Installer', status: 'available' });
  const window = futureWindow(8, 4);
  const standby = ledger.createWorkerAvailabilityPeriod(worker.id, {
    periodType: 'standby', startsAt: window.startsAt, endsAt: window.endsAt, minimumNoticeHours: 24
  }, { actor: 'availability_test' });

  assert.equal(standby.period.minimumNoticeHours, 24);
  assert.equal(ledger.getWorkerAvailabilityPeriod(standby.period.id).minimumNoticeHours, 24);
  assert.throws(() => ledger.createWorkerAvailabilityPeriod(worker.id, {
    periodType: 'standby', startsAt: window.startsAt, endsAt: window.endsAt, minimumNoticeHours: 1.5
  }), { code: 'worker_standby_notice_invalid' });
  assert.throws(() => ledger.createWorkerAvailabilityPeriod(worker.id, {
    periodType: 'standby', startsAt: window.startsAt, endsAt: null, returnUnknown: true,
    reviewAt: new Date(Date.parse(window.startsAt) + 86400000).toISOString().slice(0, 10)
  }), { code: 'worker_standby_window_end_required' });
  const unavailable = ledger.createWorkerAvailabilityPeriod(worker.id, {
    periodType: 'unavailable', startsAt: window.startsAt, endsAt: window.endsAt, minimumNoticeHours: 24
  }, { actor: 'availability_test' });
  assert.equal(unavailable.period.minimumNoticeHours, 0, 'standby-only terms cannot change a hard unavailability period');

  const legacy = ledger.createWorkerAvailabilityPeriod(worker.id, {
    periodType: 'standby', startsAt: window.startsAt, endsAt: window.endsAt, minimumNoticeHours: 0
  }, { actor: 'availability_test' });
  const legacyData = { ...legacy.period.data };
  delete legacyData.minimumNoticeHours;
  ledger.db.prepare('UPDATE worker_availability_periods SET source_fingerprint = ?, data_json = ? WHERE id = ?')
    .run('legacy-standby-fingerprint', JSON.stringify(legacyData), legacy.period.id);
  const replayedLegacy = ledger.createWorkerAvailabilityPeriod(worker.id, {
    periodType: 'standby', startsAt: window.startsAt, endsAt: window.endsAt
  }, { actor: 'availability_test' });
  assert.equal(replayedLegacy.replayed, true, 'an old zero-notice standby entry remains replay-safe');
  assert.equal(replayedLegacy.period.id, legacy.period.id);
  assert.equal(ledger.diagnose().valid, true);
});

test('availability register reports when its bounded conflict list is incomplete', t => {
  const ledger = createLedger(t);
  const detectedLimits = [];
  ledger.detectWorkerAvailabilityConflicts = limit => {
    detectedLimits.push(limit);
    return Array.from({ length: 251 }, (_, index) => ({ assignmentId: `assignment-${index + 1}` }));
  };

  const register = ledger.listWorkerAvailabilityRegister();

  assert.deepEqual(detectedLimits, [251]);
  assert.equal(register.conflicts.length, 250);
  assert.equal(register.conflictListComplete, false);
  assert.equal(register.summary.assignmentConflicts, 250);
  assert.equal(register.summary.assignmentConflictListComplete, false);
});

test('availability register distinguishes a complete list of exactly 250 conflicts', t => {
  const ledger = createLedger(t);
  ledger.detectWorkerAvailabilityConflicts = limit => Array.from({ length: Math.min(limit, 250) }, (_, index) => ({ assignmentId: `assignment-${index + 1}` }));

  const register = ledger.listWorkerAvailabilityRegister();

  assert.equal(register.conflicts.length, 250);
  assert.equal(register.conflictListComplete, true);
  assert.equal(register.summary.assignmentConflictListComplete, true);
});

test('worker absence conflicts join the same job schedule and verified material shortfalls', t => {
  const ledger = createLedger(t);
  const window = futureWindow(9, 4);
  const job = ledger.createIntake({
    title: 'Combined disruption roof repair', client: { name: 'Disruption client' },
    status: 'scheduled', scheduledStart: window.startsAt, scheduledEnd: window.endsAt
  });
  const material = ledger.addMaterialRequirement(job.id, {
    name: 'Roof membrane', quantity: 10, unit: 'rolls', status: 'needed'
  });
  const task = ledger.addTask(job.id, {
    title: 'Install roof membrane', durationHours: 4, materialRequirementIds: [material.id]
  });
  const worker = ledger.upsertWorker({ name: 'Unavailable roofer', role: 'Roofer', status: 'available' });
  ledger.addAssignment(job.id, {
    workerId: worker.id, role: 'Roofer', status: 'planned',
    scheduledStart: window.startsAt, scheduledEnd: window.endsAt
  });
  const unavailable = ledger.createWorkerAvailabilityPeriod(worker.id, {
    periodType: 'leave', title: 'Unavailable', startsAt: window.startsAt, endsAt: window.endsAt
  }, { actor: 'availability_test' });

  const conflict = ledger.listWorkerAvailabilityRegister().conflicts.find(item => item.period.id === unavailable.period.id);
  assert.equal(conflict.disruptionImpact.materialShortfalls[0].shortfallQuantity, 10);
  assert.equal(conflict.disruptionImpact.materialShortfalls[0].affectedTasks[0].id, task.id);
  assert.equal(conflict.disruptionImpact.schedule.ready, false);
  assert.equal(conflict.disruptionImpact.schedule.materialBlockers[0].taskId, task.id);
  assert.equal(conflict.disruptionImpact.affectedScheduleTasks.length, 0);
  assert.equal(ledger.diagnose().valid, true);
});

test('availability periods are replay-safe and block assignment approval until approved cancellation', t => {
  const ledger = createLedger(t);
  const window = futureWindow();
  const job = ledger.createIntake({
    title: 'Availability governed assignment',
    client: { name: 'Availability client' },
    scheduledStart: window.startsAt,
    scheduledEnd: window.endsAt
  });
  const worker = ledger.upsertWorker({ name: 'Availability worker', role: 'Installer', status: 'available' });
  const payload = {
    periodType: 'training',
    title: 'Manufacturer training',
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    notes: 'Operational capacity only.'
  };
  const first = ledger.createWorkerAvailabilityPeriod(worker.id, payload, { actor: 'availability_test' });
  const replay = ledger.createWorkerAvailabilityPeriod(worker.id, payload, { actor: 'availability_test' });
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.period.id, first.period.id);
  assert.equal(ledger.getWorker(worker.id).availability.upcoming, 1);
  const scheduleCandidate = ledger.workerScheduleCandidates(
    { title: job.title, jobType: 'installation' },
    window.startsAt,
    window.endsAt,
    job.id
  ).find(item => item.worker.id === worker.id);
  assert.equal(scheduleCandidate.available, false);
  assert.equal(scheduleCandidate.availabilityConflicts.length, 1);

  const assignment = ledger.addAssignment(job.id, {
    workerId: worker.id,
    role: 'Installer',
    status: 'planned',
    scheduledStart: window.startsAt,
    scheduledEnd: window.endsAt
  });
  assert.equal(assignment.status, 'pending_approval');
  assert.equal(assignment.availabilityConflicts.length, 1);
  assert.ok(assignment.data.approvalReasons.some(reason => reason.type === 'worker_availability_conflict'));
  const readiness = ledger.workerAssignmentReadiness([assignment], { jobId: job.id });
  assert.equal(readiness.status, 'blocked');
  assert.equal(readiness.availabilityConflicts, 1);

  const cancellation = ledger.requestWorkerAvailabilityCancellation(worker.id, first.period.id, {
    reason: 'Training was moved outside the retained assignment window.'
  }, { actor: 'availability_test' });
  assert.equal(cancellation.period.status, 'pending_cancellation');
  assert.equal(ledger.findWorkerAvailabilityConflicts({
    workerId: worker.id,
    scheduledStart: window.startsAt,
    scheduledEnd: window.endsAt
  }).length, 1);

  assert.throws(
    () => ledger.resolveApproval(assignment.approval.id, {
      status: 'approved',
      resolvedBy: 'availability_approver',
      reason: 'Attempt before availability resolution.'
    }),
    error => error.code === 'assignment_worker_availability_required'
  );
  assert.equal(ledger.listApprovals({ status: 'pending' }).some(item => item.id === assignment.approval.id), true);

  ledger.resolveApproval(cancellation.approval.id, {
    status: 'approved',
    resolvedBy: 'availability_approver',
    reason: 'Operational training move verified.'
  });
  assert.equal(ledger.getWorkerAvailabilityPeriod(first.period.id).status, 'cancelled');
  const approvedAssignment = ledger.resolveApproval(assignment.approval.id, {
    status: 'approved',
    resolvedBy: 'availability_approver',
    reason: 'Availability conflict is resolved.'
  });
  assert.equal(approvedAssignment.status, 'approved');
  assert.equal(ledger.getJobDetail(job.id).assignments[0].status, 'planned');
  assert.equal(ledger.diagnose().valid, true);
});

test('rejected availability cancellation restores the blocking period and sensitive fields are refused', t => {
  const ledger = createLedger(t);
  const window = futureWindow(14);
  const worker = ledger.upsertWorker({ name: 'Privacy governed worker', role: 'Electrician', status: 'available' });
  assert.throws(
    () => ledger.createWorkerAvailabilityPeriod(worker.id, {
      periodType: 'leave',
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      diagnosis: 'Sensitive diagnosis must not be retained.'
    }),
    error => error.code === 'worker_availability_sensitive_data_forbidden'
  );
  assert.throws(
    () => ledger.createWorkerAvailabilityPeriod(worker.id, {
      periodType: 'leave',
      startsAt: window.startsAt,
      endsAt: window.endsAt,
      notes: 'Medical details must not be retained here.'
    }),
    error => error.code === 'worker_availability_sensitive_data_forbidden'
  );
  const created = ledger.createWorkerAvailabilityPeriod(worker.id, {
    periodType: 'leave',
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    notes: 'Not available for operational planning.'
  });
  const cancellation = ledger.requestWorkerAvailabilityCancellation(worker.id, created.period.id, {
    reason: 'Request is being reviewed against the retained plan.'
  });
  ledger.resolveApproval(cancellation.approval.id, {
    status: 'rejected',
    resolvedBy: 'availability_approver',
    reason: 'The retained leave period remains current.'
  });
  const restored = ledger.getWorkerAvailabilityPeriod(created.period.id);
  assert.equal(restored.status, 'active');
  assert.equal(restored.cancellationApprovalId, null);
  assert.equal(ledger.findWorkerAvailabilityConflicts({
    workerId: worker.id,
    scheduledStart: window.startsAt,
    scheduledEnd: window.endsAt
  }).length, 1);
  assert.equal(ledger.diagnose().valid, true);
});

test('unknown return blocks every future assignment and forces a short operational follow-up', t => {
  const ledger = createLedger(t);
  const worker = ledger.upsertWorker({ name: 'Unknown return worker', role: 'Installer', status: 'available' });
  const startsAt = new Date(Date.now() + 3 * 86_400_000);
  startsAt.setUTCHours(8, 0, 0, 0);
  const scheduledStart = new Date(startsAt.getTime() + 45 * 86_400_000);
  const scheduledEnd = new Date(scheduledStart.getTime() + 8 * 3_600_000);
  const job = ledger.createIntake({
    title: 'Future work during open-ended absence',
    client: { name: 'Unknown return client' },
    status: 'scheduled',
    scheduledStart: scheduledStart.toISOString(),
    scheduledEnd: scheduledEnd.toISOString()
  }, { actor: 'availability_test' });
  const assignment = ledger.addAssignment(job.id, {
    workerId: worker.id, role: 'Installer', status: 'planned',
    scheduledStart: scheduledStart.toISOString(), scheduledEnd: scheduledEnd.toISOString()
  }, { actor: 'availability_test' });
  const reviewAt = new Date(startsAt.getTime() + 5 * 86_400_000).toISOString().slice(0, 10);
  assert.throws(() => ledger.createWorkerAvailabilityPeriod(worker.id, {
    periodType: 'unavailable', startsAt: startsAt.toISOString(), returnUnknown: true
  }), error => error.code === 'worker_availability_review_required');
  assert.throws(() => ledger.createWorkerAvailabilityPeriod(worker.id, {
    periodType: 'unavailable', startsAt: startsAt.toISOString(), returnUnknown: true,
    reviewAt: new Date(startsAt.getTime() + 32 * 86_400_000).toISOString().slice(0, 10)
  }), error => error.code === 'worker_availability_review_window_invalid');
  assert.throws(() => ledger.createWorkerAvailabilityPeriod(worker.id, {
    periodType: 'unavailable', startsAt: startsAt.toISOString(), endsAt: scheduledStart.toISOString(),
    returnUnknown: true, reviewAt
  }), error => error.code === 'worker_availability_end_conflict');

  const payload = {
    periodType: 'unavailable', title: 'Return date to be confirmed',
    startsAt: startsAt.toISOString(), endsAt: null, returnUnknown: true, reviewAt,
    notes: 'Operational capacity follow-up only.'
  };
  const created = ledger.createWorkerAvailabilityPeriod(worker.id, payload, { actor: 'availability_test' });
  const replay = ledger.createWorkerAvailabilityPeriod(worker.id, payload, { actor: 'availability_test' });
  assert.equal(created.period.endsAt, null);
  assert.equal(created.period.returnUnknown, true);
  assert.equal(created.period.followUpAt, `${reviewAt}T00:00:00.000Z`);
  assert.equal(created.conflicts.some(conflict => conflict.assignmentId === assignment.id), true);
  assert.equal(replay.replayed, true);
  assert.equal(ledger.getWorker(worker.id).availability.status, 'scheduled');
  assert.equal(ledger.workerAssignmentReadiness([assignment], { jobId: job.id }).status, 'blocked');

  const register = ledger.listWorkerAvailabilityRegister({ referenceAt: `${reviewAt}T00:00:00.000Z` });
  assert.equal(register.summary.unknownReturn, 1);
  assert.equal(register.summary.followUpDue, 1);
  assert.equal(register.periods.find(period => period.id === created.period.id).followUpDue, true);
  assert.equal(ledger.diagnose().valid, true);
});

test('autonomy creates one internal availability review task and never changes commitments', t => {
  const ledger = createLedger(t);
  const window = futureWindow(21);
  const job = ledger.createIntake({
    title: 'Availability autonomous review',
    client: { name: 'Autonomy availability client' },
    scheduledStart: window.startsAt,
    scheduledEnd: window.endsAt
  });
  const worker = ledger.upsertWorker({ name: 'Autonomy availability worker', role: 'Foreman', status: 'available' });
  const assignment = ledger.addAssignment(job.id, {
    workerId: worker.id,
    role: 'Foreman',
    status: 'planned',
    scheduledStart: window.startsAt,
    scheduledEnd: window.endsAt
  });
  const period = ledger.createWorkerAvailabilityPeriod(worker.id, {
    periodType: 'external_commitment',
    startsAt: window.startsAt,
    endsAt: window.endsAt,
    notes: 'Retained capacity conflict.'
  });
  const action = ledger.nextActions().find(item => (
    item.type === 'review_worker_availability_conflict'
    && item.assignmentId === assignment.id
    && item.periodId === period.period.id
  ));
  assert.ok(action);
  const workforceRow = ledger.listWorkforceReadiness({ limit: 100 }).jobs.find(item => item.jobId === job.id);
  assert.equal(workforceRow.flags.workerConflict, true);
  assert.equal(workforceRow.counts.workerAvailabilityConflicts, 1);
  assert.equal(ledger.dashboardSummary().workload.workerAvailabilityConflicts, 1);
  const first = ledger.runAutonomousCycle({
    actionTypes: ['review_worker_availability_conflict'],
    jobIds: [job.id],
    actor: 'availability_autonomy_test'
  });
  assert.equal(first.applied.length, 1);
  const task = ledger.getJobDetail(job.id).tasks.find(item => item.id === first.applied[0].taskId);
  assert.equal(task.data.internalOnly, true);
  assert.equal(task.data.externalCommitments, 0);
  assert.equal(ledger.getWorkerAvailabilityPeriod(period.period.id).status, 'active');
  assert.equal(ledger.getJobDetail(job.id).assignments.find(item => item.id === assignment.id).status, 'planned');
  const second = ledger.runAutonomousCycle({ actionTypes: ['review_worker_availability_conflict'], jobIds: [job.id] });
  assert.equal(second.applied.length, 0);
  assert.equal(ledger.diagnose().valid, true);
});

test('availability conflicts offer only role-matched, available and qualification-ready replacements', t => {
  const ledger = createLedger(t);
  const window = futureWindow(18);
  const job = ledger.createIntake({
    title: 'Solar installation crew replacement',
    client: { name: 'Replacement client' },
    scheduledStart: window.startsAt,
    scheduledEnd: window.endsAt
  });
  const absentWorker = ledger.upsertWorker({ name: 'Unavailable installer', role: 'Installer', status: 'available' });
  const available = ledger.upsertWorker({ name: 'Standby installer', role: 'Installer', status: 'standby', skills: ['solar installation'] });
  const regularCapacity = ledger.upsertWorker({ name: 'Regular installer', role: 'Installer', status: 'available' });
  const busy = ledger.upsertWorker({ name: 'Busy installer', role: 'Installer', status: 'available' });
  ledger.upsertWorker({ name: 'Available plumber', role: 'Plumber', status: 'available' });
  const otherJob = ledger.createIntake({
    title: 'Separate assignment occupying crew',
    client: { name: 'Other client' },
    scheduledStart: window.startsAt,
    scheduledEnd: window.endsAt
  });
  ledger.addAssignment(otherJob.id, {
    workerId: busy.id,
    role: 'Installer',
    scheduledStart: window.startsAt,
    scheduledEnd: window.endsAt
  });
  const unavailable = ledger.createWorkerAvailabilityPeriod(absentWorker.id, {
    periodType: 'unavailable',
    title: 'Capacity unavailable',
    startsAt: window.startsAt,
    endsAt: window.endsAt
  });
  const affectedAssignment = ledger.addAssignment(job.id, {
    workerId: absentWorker.id,
    role: 'Installer',
    scheduledStart: window.startsAt,
    scheduledEnd: window.endsAt
  });

  let conflict = ledger.listWorkerAvailabilityRegister().conflicts.find(item => item.assignmentId === affectedAssignment.id);
  assert.deepEqual(conflict.replacementCandidates.map(item => item.worker.id), [available.id, regularCapacity.id]);
  assert.deepEqual(conflict.replacementCandidates[0].matchedSkills, ['solar installation']);
  assert.equal(conflict.replacementCandidates[0].qualificationStatus, 'not_required');

  ledger.createWorkerAvailabilityPeriod(available.id, {
    periodType: 'standby', title: 'Available on call', startsAt: window.startsAt, endsAt: window.endsAt
  });
  conflict = ledger.listWorkerAvailabilityRegister().conflicts.find(item => item.assignmentId === affectedAssignment.id);
  assert.deepEqual(conflict.replacementCandidates.map(item => item.worker.id), [regularCapacity.id]);
  assert.throws(() => ledger.requestAssignmentReplacement(job.id, affectedAssignment.id, {
    availabilityPeriodId: unavailable.period.id, workerId: available.id, reason: 'Select this replacement'
  }), { code: 'assignment_replacement_candidate_stale', statusCode: 409 });

  ledger.createQualificationRequirement(job.id, {
    credentialType: 'vca',
    role: 'Installer',
    mandatory: true
  });
  conflict = ledger.listWorkerAvailabilityRegister().conflicts.find(item => item.assignmentId === affectedAssignment.id);
  assert.deepEqual(conflict.replacementCandidates, []);
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 1);
  assert.equal(ledger.diagnose().valid, true);
});

function replacementFixture(t) {
  const ledger = createLedger(t);
  const window = futureWindow(24);
  const job = ledger.createIntake({ title: 'Replacement approval job', client: { name: 'Replacement approval client' }, scheduledStart: window.startsAt, scheduledEnd: window.endsAt });
  const originalWorker = ledger.upsertWorker({ name: 'Original installer', role: 'Installer', status: 'available' });
  const replacementWorker = ledger.upsertWorker({ name: 'Replacement installer', role: 'Installer', status: 'available' });
  const availability = ledger.createWorkerAvailabilityPeriod(originalWorker.id, { periodType: 'unavailable', title: 'Capacity change', startsAt: window.startsAt, endsAt: window.endsAt });
  const assignment = ledger.addAssignment(job.id, { workerId: originalWorker.id, role: 'Installer', scheduledStart: window.startsAt, scheduledEnd: window.endsAt });
  return { ledger, job, window, originalWorker, replacementWorker, availability: availability.period, assignment };
}

test('assignment replacement is atomic and requires a different approver', t => {
  const { ledger, job, originalWorker, replacementWorker, availability, assignment } = replacementFixture(t);
  const requested = ledger.requestAssignmentReplacement(job.id, assignment.id, {
    workerId: replacementWorker.id, availabilityPeriodId: availability.id, reason: 'Original worker has a conflicting field commitment.'
  }, { actor: 'office_operator' });
  assert.equal(requested.assignment.status, 'pending_approval');
  assert.equal(ledger.getJobDetail(job.id).assignments.find(item => item.id === assignment.id).status, 'pending_approval');
  assert.throws(() => ledger.resolveApproval(requested.approval.id, { status: 'approved', resolvedBy: 'office_operator' }, { enforceSeparation: true }), { code: 'assignment_replacement_independent_approval_required' });

  const approved = ledger.resolveApproval(requested.approval.id, { status: 'approved', resolvedBy: 'independent_approver', reason: 'Coverage checked.' });
  assert.equal(approved.status, 'approved');
  const assignments = ledger.getJobDetail(job.id).assignments;
  assert.equal(assignments.find(item => item.id === assignment.id).status, 'released');
  assert.equal(assignments.find(item => item.id === requested.assignment.id).status, 'planned');
  assert.equal(assignments.find(item => item.id === assignment.id).workerId, originalWorker.id);
  assert.equal(assignments.find(item => item.id === requested.assignment.id).workerId, replacementWorker.id);
  assert.equal(assignments.find(item => item.id === requested.assignment.id).requiresApproval, false);
  assert.equal(ledger.diagnose().valid, true);
});

test('approved assignment replacement hands linked tasks to the replacement and cancels future capacity allocations', t => {
  const { ledger, job, originalWorker, replacementWorker, availability, assignment, window } = replacementFixture(t);
  const originalData = JSON.parse(ledger.db.prepare('SELECT data_json FROM assignments WHERE id = ?').get(assignment.id).data_json);
  ledger.db.prepare('UPDATE assignments SET status = ?, data_json = ? WHERE id = ?')
    .run('active', JSON.stringify({ ...originalData, requiresApproval: false }), assignment.id);
  const task = ledger.addTask(job.id, {
    title: 'Install the scheduled equipment', status: 'open', assigneeId: originalWorker.id,
    requiredTrade: 'Installer', plannedStart: window.startsAt, plannedEnd: window.endsAt,
    data: {
      crewWorkerIds: [originalWorker.id],
      crewWorkerAssignments: [{ workerId: originalWorker.id, role: 'Installer' }]
    }
  });
  const allocation = ledger.createCrewCapacityAllocation({ assignmentId: assignment.id, taskId: task.id,
    workDate: window.startsAt.slice(0, 10), plannedHours: 2 }).allocation;
  const requested = ledger.requestAssignmentReplacement(job.id, assignment.id, {
    workerId: replacementWorker.id, availabilityPeriodId: availability.id,
    reason: 'Original worker has a conflicting field commitment.'
  }, { actor: 'office_operator' });

  ledger.resolveApproval(requested.approval.id, { status: 'approved', resolvedBy: 'independent_approver' });

  const updatedTask = ledger.getJobDetail(job.id).tasks.find(item => item.id === task.id);
  assert.equal(updatedTask.assigneeId, replacementWorker.id);
  assert.deepEqual(updatedTask.data.crewWorkerIds, [replacementWorker.id]);
  assert.deepEqual(updatedTask.data.crewWorkerAssignments, [{ workerId: replacementWorker.id, role: 'Installer' }]);
  assert.equal(updatedTask.data.replacementHistory.at(-1).fromWorkerId, originalWorker.id);
  assert.equal(updatedTask.data.replacementHistory.at(-1).toWorkerId, replacementWorker.id);
  const retainedAllocation = ledger.getCrewCapacityAllocation(allocation.id);
  assert.equal(retainedAllocation.status, 'cancelled');
  assert.equal(retainedAllocation.integrityValid, true);
  assert.equal(ledger.diagnose().valid, true);
});

test('assignment replacement approval leaves the approval and assignments unchanged when an assigned task has a partial schedule', t => {
  const { ledger, job, originalWorker, replacementWorker, availability, assignment, window } = replacementFixture(t);
  ledger.addTask(job.id, { title: 'Partially scheduled assigned work', assigneeId: originalWorker.id, plannedStart: window.startsAt });
  const requested = ledger.requestAssignmentReplacement(job.id, assignment.id, {
    workerId: replacementWorker.id, availabilityPeriodId: availability.id,
    reason: 'Original worker has a conflicting field commitment.'
  }, { actor: 'office_operator' });

  assert.throws(() => ledger.resolveApproval(requested.approval.id, {
    status: 'approved', resolvedBy: 'independent_approver'
  }), { code: 'assignment_replacement_task_window_stale' });

  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(requested.approval.id).status, 'pending');
  assert.equal(ledger.getJobDetail(job.id).assignments.find(item => item.id === assignment.id).status, 'pending_approval');
  assert.equal(ledger.getJobDetail(job.id).assignments.find(item => item.id === requested.assignment.id).status, 'pending_approval');
  assert.equal(ledger.diagnose().valid, true);
});

test('replacement schedule review resolves only after a complete schedule is covered by the new assignment', t => {
  const { ledger, job, originalWorker, replacementWorker, availability, assignment, window } = replacementFixture(t);
  const task = ledger.addTask(job.id, {
    title: 'Replanned replacement task', assigneeId: originalWorker.id, requiredTrade: 'Installer', durationHours: 2
  });
  const requested = ledger.requestAssignmentReplacement(job.id, assignment.id, {
    workerId: replacementWorker.id, availabilityPeriodId: availability.id,
    reason: 'Original worker has a conflicting field commitment.'
  }, { actor: 'office_operator' });
  ledger.resolveApproval(requested.approval.id, { status: 'approved', resolvedBy: 'independent_approver' });
  assert.equal(ledger.getJobDetail(job.id).tasks.find(item => item.id === task.id).data.replacementScheduleReviewRequired.requiredBeforeAllocation, true);

  const scheduled = ledger.updateTaskSchedule(job.id, task.id, {
    plannedStart: window.startsAt, plannedEnd: window.endsAt
  }, { actor: 'office_operator' });

  assert.equal(scheduled.data.replacementScheduleReviewRequired, undefined, JSON.stringify({
    schedule: [scheduled.plannedStart, scheduled.plannedEnd],
    assignments: ledger.getJobDetail(job.id).assignments.map(item => ({ status: item.status, workerId: item.workerId, role: item.role, start: item.scheduledStart, end: item.scheduledEnd, requiresApproval: item.requiresApproval })),
    qualification: ledger.assessWorkerQualifications(replacementWorker.id, { jobId: job.id, role: 'Installer', at: scheduled.plannedEnd })
  }));
  assert.equal(scheduled.data.replacementScheduleReview.status, 'resolved');
  assert.equal(scheduled.data.replacementScheduleReview.resolvedBy, 'office_operator');
  assert.equal(scheduled.data.replacementScheduleReview.scheduledStart, window.startsAt);
});

test('rejecting a replacement preserves the original assignment', t => {
  const { ledger, job, replacementWorker, availability, assignment } = replacementFixture(t);
  const requested = ledger.requestAssignmentReplacement(job.id, assignment.id, {
    workerId: replacementWorker.id, availabilityPeriodId: availability.id, reason: 'Original worker is unavailable for this work.'
  }, { actor: 'office_operator' });
  ledger.resolveApproval(requested.approval.id, { status: 'rejected', resolvedBy: 'independent_approver', reason: 'Keep current plan pending further review.' });
  const assignments = ledger.getJobDetail(job.id).assignments;
  assert.equal(assignments.find(item => item.id === assignment.id).status, 'pending_approval');
  assert.equal(assignments.find(item => item.id === requested.assignment.id).status, 'rejected');
  assert.equal(ledger.diagnose().valid, true);
});

test('replacement approval revalidates capacity and keeps both assignments unchanged when stale', t => {
  const { ledger, job, replacementWorker, availability, assignment } = replacementFixture(t);
  const requested = ledger.requestAssignmentReplacement(job.id, assignment.id, {
    workerId: replacementWorker.id, availabilityPeriodId: availability.id, reason: 'Original worker cannot cover the requested field shift.'
  }, { actor: 'office_operator' });
  ledger.upsertWorker({ id: replacementWorker.id, name: replacementWorker.name, role: replacementWorker.role, status: 'offline' });
  assert.throws(() => ledger.resolveApproval(requested.approval.id, { status: 'approved', resolvedBy: 'independent_approver' }), { code: 'assignment_replacement_candidate_stale' });
  const assignments = ledger.getJobDetail(job.id).assignments;
  assert.equal(assignments.find(item => item.id === assignment.id).status, 'pending_approval');
  assert.equal(assignments.find(item => item.id === requested.assignment.id).status, 'pending_approval');
  assert.equal(ledger.mapApproval(ledger.db.prepare('SELECT * FROM approvals WHERE id = ?').get(requested.approval.id)).status, 'pending');
});

test('replacement approval fails closed if the proposed worker enters an overlapping standby window', t => {
  const { ledger, job, window, replacementWorker, availability, assignment } = replacementFixture(t);
  const requested = ledger.requestAssignmentReplacement(job.id, assignment.id, {
    workerId: replacementWorker.id, availabilityPeriodId: availability.id, reason: 'Original worker cannot cover this field shift.'
  }, { actor: 'office_operator' });
  ledger.createWorkerAvailabilityPeriod(replacementWorker.id, {
    periodType: 'standby', title: 'Available on call', startsAt: window.startsAt, endsAt: window.endsAt
  });

  assert.throws(() => ledger.resolveApproval(requested.approval.id, { status: 'approved', resolvedBy: 'independent_approver' }), { code: 'assignment_replacement_candidate_stale' });
  const assignments = ledger.getJobDetail(job.id).assignments;
  assert.equal(assignments.find(item => item.id === assignment.id).status, 'pending_approval');
  assert.equal(assignments.find(item => item.id === requested.assignment.id).status, 'pending_approval');
  assert.equal(ledger.mapApproval(ledger.db.prepare('SELECT * FROM approvals WHERE id = ?').get(requested.approval.id)).status, 'pending');
  assert.equal(ledger.diagnose().valid, true);
});

test('coordinated replacement plan applies all selected assignments atomically after independent approval', t => {
  const { ledger, job, originalWorker, availability } = replacementFixture(t);
  const conflicts = ledger.listWorkerAvailabilityRegister().conflicts.filter(item => item.period.id === availability.id);
  Array.from({ length: conflicts.length + 6 }, (_, index) => ledger.upsertWorker({ name: `Coordinated plan candidate ${index + 1}`, role: 'Installer', status: 'available' }));
  const used = new Set();
  const selections = conflicts.map(conflict => {
    const original = ledger.db.prepare('SELECT * FROM assignments WHERE id = ?').get(conflict.assignmentId);
    const candidate = ledger.workerReplacementCandidates(original).find(item => !used.has(item.worker.id));
    assert.ok(candidate, `expected a distinct eligible replacement for ${conflict.assignmentId}`);
    used.add(candidate.worker.id);
    return { assignmentId: conflict.assignmentId, workerId: candidate.worker.id };
  });
  assert.equal(selections.length, 1);

  const request = ledger.requestWorkerAvailabilityReplacementPlan(originalWorker.id, availability.id, {
    reason: 'Operational availability change affects both scheduled field jobs.',
    assignments: selections
  }, { actor: 'office_operator' });
  assert.equal(request.approval.status, 'pending');
  assert.equal(request.approval.jobId, null);
  assert.equal(ledger.requestWorkerAvailabilityReplacementPlan(originalWorker.id, availability.id, {
    reason: 'Operational availability change affects both scheduled field jobs.',
    assignments: selections
  }, { actor: 'office_operator' }).replayed, true);
  assert.throws(() => ledger.resolveApproval(request.approval.id, { status: 'approved', resolvedBy: 'office_operator' }, { enforceSeparation: true }), { code: 'assignment_replacement_independent_approval_required' });

  ledger.resolveApproval(request.approval.id, { status: 'approved', resolvedBy: 'independent_approver' });
  for (const selection of selections) {
    const original = ledger.db.prepare('SELECT job_id FROM assignments WHERE id = ?').get(selection.assignmentId);
    const assignments = ledger.getJobDetail(original.job_id).assignments;
    assert.equal(assignments.find(item => item.id === selection.assignmentId).status, 'released');
    assert.equal(assignments.find(item => item.workerId === selection.workerId).status, 'planned');
    assert.equal(assignments.find(item => item.workerId === selection.workerId).requiresApproval, false);
  }
  assert.ok(job.id);
  assert.equal(ledger.diagnose().valid, true);
});

test('coordinated replacement approval changes no job when a candidate becomes stale', t => {
  const { ledger, job, originalWorker, replacementWorker, availability, assignment } = replacementFixture(t);
  const conflicts = ledger.listWorkerAvailabilityRegister().conflicts.filter(item => item.period.id === availability.id);
  Array.from({ length: conflicts.length + 2 }, (_, index) => ledger.upsertWorker({ name: `Stale plan replacement ${index + 1}`, role: 'Installer', status: 'available' }));
  const used = new Set();
  const selections = conflicts.map(conflict => {
    const original = ledger.db.prepare('SELECT * FROM assignments WHERE id = ?').get(conflict.assignmentId);
    const candidate = ledger.workerReplacementCandidates(original).find(item => !used.has(item.worker.id));
    assert.ok(candidate, `expected a distinct replacement for ${conflict.assignmentId}; job=${original.job_id}; status=${original.status}; workers=${JSON.stringify(ledger.listWorkers({ limit: 100 }).map(worker => [worker.id, worker.status, worker.role]))}`);
    used.add(candidate.worker.id);
    return { assignmentId: conflict.assignmentId, workerId: candidate.worker.id };
  });
  const request = ledger.requestWorkerAvailabilityReplacementPlan(originalWorker.id, availability.id, {
    reason: 'Operational capacity changed and both assignments need coverage.',
    assignments: selections
  }, { actor: 'office_operator' });
  const staleCandidate = ledger.listWorkers({ limit: 100 }).find(worker => worker.id === selections[0].workerId);
  ledger.upsertWorker({ id: staleCandidate.id, name: staleCandidate.name, role: staleCandidate.role, status: 'offline' });
  assert.throws(() => ledger.resolveApproval(request.approval.id, { status: 'approved', resolvedBy: 'independent_approver' }), { code: 'assignment_replacement_candidate_stale' });
  const assignments = ledger.getJobDetail(job.id).assignments;
  assert.equal(assignments.filter(item => item.workerId === originalWorker.id).every(item => item.status === 'pending_approval'), true);
  assert.equal(assignments.filter(item => item.workerId !== originalWorker.id).every(item => item.status === 'pending_approval'), true);
  assert.ok(assignment.id);
  assert.ok(replacementWorker.id);
  assert.equal(ledger.mapApproval(ledger.db.prepare('SELECT * FROM approvals WHERE id = ?').get(request.approval.id)).status, 'pending');
  assert.equal(ledger.diagnose().valid, true);
});
