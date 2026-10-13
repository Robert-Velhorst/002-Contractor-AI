const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Worker } = require('node:worker_threads');
const { ResourcePlanner, preconstructionReconciliation } = require('../resource-planner');
const { ContractorOperatingLedger } = require('../operating-ledger');

function runWorker(data) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(path.join(__dirname, '..', 'resource-planner-worker.js'), { workerData: data });
    worker.once('message', resolve);
    worker.once('error', reject);
    worker.once('exit', code => { if (code !== 0) reject(new Error(`Worker exited with ${code}`)); });
  });
}

function task(id, durationSlots) {
  return {
    id,
    durationSlots,
    currentWorkerId: null,
    candidates: [{ workerId: 'worker-a', windows: [{ startSlot: 0, endSlot: 16 }], blocks: [] }],
    predecessorIds: [],
    lagSlots: {},
    earliestStartSlot: 0,
    dueSlot: null
  };
}

test('preconstruction reconciliation compares role totals and exposes unestimated work without changing the plan', () => {
  const result = preconstructionReconciliation({
    format: 'contractor_ai_preconstruction_capacity_forecast_v1',
    snapshotHash: 'a'.repeat(64),
    forecast: { trades: [
      { role: 'Installer', hours: 8, supervision: { role: 'Site Supervisor', workersPerSupervisor: 4,
        dailyDemand: [{ crewSize: 4, supervisorShiftHours: 8 }] } },
      { role: 'Carpenter', hours: 4, supervision: { role: 'Site Supervisor', workersPerSupervisor: 2,
        dailyDemand: [{ crewSize: 2, supervisorShiftHours: 4 }] } }
    ] }
  }, [
    { durationHours: 4, requiredCrewRequirements: [{ role: 'installer', count: 2 }], supervisorTrade: 'Site Supervisor', supervisionRatio: { workersPerSupervisor: 4 } },
    { durationHours: 4, requiredCrewRequirements: [{ role: 'Carpenter', count: 1 }], supervisorTrade: 'Site Supervisor', supervisionRatio: { workersPerSupervisor: 1 } },
    { durationHours: 3, requiredCrewRequirements: [{ role: 'Electrician', count: 1 }] }
  ]);

  assert.equal(result.comparison, 'aggregate_role_hours_only');
  assert.equal(result.basisSnapshotHash, 'a'.repeat(64));
  assert.deepEqual(result.trades[0], {
    role: 'Installer', estimatedHours: 8, plannedHours: 8, varianceHours: 0, plannedTaskCount: 1, status: 'aligned_total'
  });
  assert.deepEqual(result.trades[1], {
    role: 'Carpenter', estimatedHours: 4, plannedHours: 4, varianceHours: 0, plannedTaskCount: 1, status: 'aligned_total'
  });
  assert.deepEqual(result.additionalPlannedTrades, [{ role: 'Electrician', plannedHours: 3, plannedTaskCount: 1 }]);
  assert.deepEqual(result.supervision[0], {
    role: 'Site Supervisor', crewRoles: ['Installer', 'Carpenter'], estimatedHours: 12, plannedHours: 8,
    varianceHours: -4, plannedTaskCount: 2, status: 'below_estimate'
  });
  assert.deepEqual(result.limitations, ['dates_not_compared', 'accepted_scope_not_verified', 'no_automatic_changes']);
});

test('resource solver places sequential work without double-booking one worker', async () => {
  const result = await runWorker({ jobId: 'job', horizonSlots: 16, timeoutMs: 4000, tasks: [task('first', 8), task('second', 8)] });
  assert.equal(result.status, 'feasible');
  assert.equal(result.assignments.length, 2);
  const [first, second] = result.assignments;
  assert.ok(first.startSlot + 8 <= second.startSlot || second.startSlot + 8 <= first.startSlot);
});

test('equal forecast totals still expose changed work dates and count named supervisors without a ratio', () => {
  const basis = { format: 'contractor_ai_preconstruction_capacity_forecast_v1', forecast: {
    windowStart: '2026-10-05', windowEnd: '2026-10-09', trades: [{ role: 'Installer', hours: 8,
      dailyDemand: [{ date: '2026-10-05', hours: 8 }], supervision: { role: 'Lead', workersPerSupervisor: 4,
        dailyDemand: [{ date: '2026-10-05', crewSize: 1, supervisorShiftHours: 8 }] } }]
  } };
  const plan = [{ taskId: 'shifted', durationHours: 8, plannedStart: '2026-10-06T06:00:00Z', plannedEnd: '2026-10-06T14:00:00Z',
    requiredCrewRequirements: [{ role: 'Installer', count: 1 }], supervisorTrade: 'Lead', supervisorWorkerIds: ['lead'] }];
  const before = structuredClone({ basis, plan });
  const result = preconstructionReconciliation(basis, plan, { timeZone: 'Europe/Amsterdam', timeZoneSource: 'site_access_calendar' });
  assert.equal(result.trades[0].status, 'aligned_total');
  assert.equal(result.supervision[0].plannedHours, 8);
  assert.equal(result.datedComparison.status, 'compared');
  assert.equal(result.datedComparison.timeZoneSource, 'site_access_calendar');
  for (const role of result.datedComparison.roles) {
    assert.deepEqual(role.days, [
      { date: '2026-10-05', estimatedHours: 8, plannedHours: 0, varianceHours: -8, outsideWindow: false },
      { date: '2026-10-06', estimatedHours: 0, plannedHours: 8, varianceHours: 8, outsideWindow: false }
    ]);
  }
  assert.deepEqual({ basis, plan }, before);
});

test('work-date comparison splits overnight work at local midnight and preserves DST elapsed hours', () => {
  const compare = (start, end, expectedDays, count) => preconstructionReconciliation({
    format: 'contractor_ai_preconstruction_capacity_forecast_v1', forecast: {
      windowStart: expectedDays[0].date, windowEnd: expectedDays.at(-1).date,
      trades: [{ role: 'Installer', hours: expectedDays.reduce((sum, day) => sum + day.hours, 0), dailyDemand: expectedDays }]
    }
  }, [{ durationHours: (Date.parse(end) - Date.parse(start)) / 3_600_000, plannedStart: start, plannedEnd: end,
    requiredCrewRequirements: [{ role: 'Installer', count }] }]);
  const autumnDays = [{ date: '2026-10-24', hours: 2 }, { date: '2026-10-25', hours: 50 }, { date: '2026-10-26', hours: 4 }];
  const autumn = compare('2026-10-24T21:00:00Z', '2026-10-26T01:00:00Z', autumnDays, 2);
  assert.equal(autumn.datedComparison.status, 'compared');
  assert.deepEqual(autumn.datedComparison.roles[0].days.map(day => ({ date: day.date, hours: day.plannedHours })), autumnDays);
  assert.ok(autumn.datedComparison.roles[0].days.every(day => day.varianceHours === 0));
  const spring = compare('2026-03-28T23:00:00Z', '2026-03-29T22:00:00Z', [{ date: '2026-03-29', hours: 23 }], 1);
  assert.deepEqual(spring.datedComparison.roles[0].days, [{ date: '2026-03-29', estimatedHours: 23, plannedHours: 23, varianceHours: 0, outsideWindow: false }]);
});

test('shared supervision stays unknown when one contributing forecast lacks dated demand', () => {
  const trade = (role, dailyDemand) => ({ role, hours: 2, dailyDemand: [{ date: '2026-10-05', hours: 2 }],
    supervision: { role: 'Lead', workersPerSupervisor: 4, dailyDemand } });
  const complete = [{ date: '2026-10-05', crewSize: 1, supervisorShiftHours: 2 }];
  for (const trades of [[trade('Installer', []), trade('Carpenter', complete)], [trade('Carpenter', complete), trade('Installer', [])]]) {
    const result = preconstructionReconciliation({ format: 'contractor_ai_preconstruction_capacity_forecast_v1',
      forecast: { windowStart: '2026-10-05', windowEnd: '2026-10-05', trades } }, [{ durationHours: 2,
      plannedStart: '2026-10-05T06:00:00Z', plannedEnd: '2026-10-05T08:00:00Z', requiredCrewRequirements: [{ role: 'Installer', count: 1 }],
      supervisorTrade: 'Lead', supervisorWorkerIds: [], supervisorWorkerId: 'lead-worker' }]);
    const supervision = result.datedComparison.roles.find(role => role.kind === 'supervision');
    assert.equal(supervision.distributionRecorded, false);
    assert.equal(supervision.days[0].estimatedHours, null);
    assert.equal(supervision.days[0].plannedHours, 2);
    assert.equal(result.supervision[0].plannedHours, 2);
  }
});

test('date review retains unknown distribution and invalid task dates without assuming zero demand', () => {
  const basis = { format: 'contractor_ai_preconstruction_capacity_forecast_v1', forecast: {
    windowStart: '2026-10-05', windowEnd: '2026-10-09', trades: [{ role: 'Installer', hours: 8, dailyDemand: null }]
  } };
  const result = preconstructionReconciliation(basis, [
    { taskId: 'undated', durationHours: 3, requiredCrewRequirements: [{ role: 'Installer', count: 1 }] },
    { durationHours: 2, plannedStart: '2026-10-12T06:00:00Z', plannedEnd: '2026-10-12T08:00:00Z', requiredCrewRequirements: [{ role: 'Installer', count: 1 }] }
  ]);
  assert.equal(result.datedComparison.status, 'partial');
  assert.equal(result.datedComparison.roles[0].undatedHours, 3);
  assert.deepEqual(result.datedComparison.roles[0].days, [{ date: '2026-10-12', estimatedHours: null, plannedHours: 2, varianceHours: null, outsideWindow: true }]);
  assert.equal(result.datedComparison.issues[0].taskId, 'undated');
  assert.ok(result.limitations.includes('dated_comparison_incomplete'));
  assert.equal(preconstructionReconciliation(basis, [], { timeZone: 'Invalid/Zone' }).datedComparison.status, 'unavailable');
});

test('resource solver preserves an existing task slot while scheduling other work', async () => {
  const committed = { ...task('committed', 4), lockedStartSlot: 8 };
  const flexible = task('flexible', 4);
  const result = await runWorker({ jobId: 'job', horizonSlots: 16, timeoutMs: 4000, tasks: [flexible, committed] });

  assert.equal(result.status, 'feasible');
  assert.equal(result.assignments.find(row => row.taskId === 'committed').startSlot, 8);
  assert.notEqual(result.assignments.find(row => row.taskId === 'flexible').startSlot, 8);
});

test('resource solver selects the required distinct crew concurrently and does not overlap members across tasks', async () => {
  const crewTask = {
    ...task('crew-task', 4),
    requiredCrewSize: 2,
    candidates: ['worker-a', 'worker-b', 'worker-c'].map(workerId => ({
      workerId, windows: [{ startSlot: 0, endSlot: 8 }], blocks: []
    }))
  };
  const otherTask = {
    ...task('other-task', 4),
    candidates: [{ workerId: 'worker-a', windows: [{ startSlot: 0, endSlot: 8 }], blocks: [] }]
  };
  const result = await runWorker({ jobId: 'job', horizonSlots: 8, timeoutMs: 4000, tasks: [crewTask, otherTask] });
  assert.equal(result.status, 'feasible');
  const crew = result.assignments.find(row => row.taskId === 'crew-task');
  const other = result.assignments.find(row => row.taskId === 'other-task');
  assert.equal(crew.workerIds.length, 2);
  assert.equal(new Set(crew.workerIds).size, 2);
  assert.ok(crew.workerIds.every(workerId => workerId !== 'worker-a') || other.startSlot >= crew.startSlot + 4 || crew.startSlot >= other.startSlot + 4);
});

test('resource solver distinguishes mathematically infeasible constraints', async () => {
  const result = await runWorker({ jobId: 'job', horizonSlots: 8, timeoutMs: 4000, tasks: [task('first', 8), task('second', 8)] });
  assert.equal(result.status, 'infeasible');
  assert.equal(result.ready, false);
});

test('resource solver enforces dependencies even when successors are listed first', async () => {
  const successor = { ...task('successor', 2), predecessorIds: ['predecessor'], lagSlots: { predecessor: 2 } };
  const predecessor = task('predecessor', 4);
  const result = await runWorker({ jobId: 'job', horizonSlots: 16, timeoutMs: 4000, tasks: [successor, predecessor] });
  assert.equal(result.status, 'feasible');
  const startByTask = new Map(result.assignments.map(row => [row.taskId, row.startSlot]));
  assert.ok(startByTask.get('successor') >= startByTask.get('predecessor') + 6);
});

test('resource preview returns incomplete input without mutating the ledger or invoking the solver', async () => {
  let transactionCallbackWasSync = false;
  const ledger = {
    transaction(callback) {
      const result = callback();
      transactionCallbackWasSync = !(result && typeof result.then === 'function');
      return result;
    },
    requireJob() {},
    getJobDetail() { return { tasks: [], taskDependencies: [], qualificationRequirements: [], scheduledStart: null }; },
    db: { prepare() { return { all() { return []; } }; } },
    activeAssignmentStatusSql() { return "status = 'active'" },
    calculateJobSchedule() { return { materialConstraints: [] }; }
  };
  const planner = new ResourcePlanner(ledger);
  planner.solve = () => { throw new Error('Solver must not run for incomplete input'); };
  const result = await planner.preview('job', { plannedStart: '2026-10-01T07:00:00.000Z' });
  assert.equal(transactionCallbackWasSync, true);
  assert.equal(result.status, 'incomplete_input');
  assert.ok(result.issues.some(issue => issue.code === 'no_active_tasks'));
});

test('resource preview uses ledger assignments and returns a non-mutating source-bound proposal', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-resource-plan-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const plannedStart = new Date(Date.now() + 2 * 86_400_000);
  plannedStart.setUTCHours(7, 0, 0, 0);
  const plannedEnd = new Date(plannedStart.getTime() + 5 * 86_400_000);
  const job = ledger.createIntake({
    client: { name: 'Resource plan client', email: 'resource-plan@example.test', country: 'NL' },
    title: 'Resource plan work',
    status: 'planned',
    scheduledStart: plannedStart.toISOString(),
    scheduledEnd: plannedEnd.toISOString(),
    tasks: [{ title: 'Install work', durationHours: 3, requiredTrade: 'Installer' }],
    assignAutomatically: false
  });
  const worker = ledger.upsertWorker({ name: 'Assigned installer', role: 'Installer', status: 'available' });
  for (const task of ledger.defaultTasksForJob(job)) {
    const { excludeFromResourcePlan: _excluded, ...legacyData } = task.data;
    ledger.addTask(job.id, { ...task, data: legacyData });
  }
  ledger.addAssignment(job.id, {
    workerId: worker.id,
    role: 'Installer',
    status: 'planned',
    scheduledStart: plannedStart.toISOString(),
    scheduledEnd: plannedEnd.toISOString()
  });
  const storedJob = ledger.db.prepare('SELECT data_json FROM jobs WHERE id = ?').get(job.id);
  const jobData = JSON.parse(storedJob.data_json);
  jobData.preconstructionCapacityForecast = {
    format: 'contractor_ai_preconstruction_capacity_forecast_v1',
    sourceOpportunityId: 'opportunity-source',
    snapshotHash: 'b'.repeat(64),
    forecast: { trades: [{ role: 'Installer', hours: 8, supervision: {
      role: 'Site Supervisor', workersPerSupervisor: 4,
      dailyDemand: [{ date: plannedStart.toISOString().slice(0, 10), crewSize: 4, supervisorShiftHours: 8 }]
    } }] }
  };
  ledger.db.prepare('UPDATE jobs SET data_json = ? WHERE id = ?').run(JSON.stringify(jobData), job.id);
  const planner = new ResourcePlanner(ledger);
  const before = ledger.getJobDetail(job.id);
  const result = await planner.preview(job.id, { plannedStart: plannedStart.toISOString(), horizonDays: 5 });
  const after = ledger.getJobDetail(job.id);
  assert.equal(result.status, 'feasible_under_recorded_constraints');
  assert.equal(result.tasks.length, 1);
  assert.equal(result.tasks[0].workerId, worker.id);
  assert.equal(result.preconstructionReconciliation.trades[0].plannedHours, 3);
  assert.equal(result.preconstructionReconciliation.trades[0].status, 'below_estimate');
  assert.equal(result.preconstructionReconciliation.supervision[0].status, 'not_configured_in_work_plan');
  assert.match(result.sourceHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(after.tasks.map(task => [task.id, task.plannedStart, task.plannedEnd]), before.tasks.map(task => [task.id, task.plannedStart, task.plannedEnd]));
  assert.equal(after.assignments[0].status, before.assignments[0].status);

  const requested = planner.requestApproval(job.id, { plan: result, reason: 'Review crew allocation.' }, 'scheduler-one');
  const replay = planner.requestApproval(job.id, { plan: result, reason: 'Review crew allocation.' }, 'scheduler-one');
  assert.equal(requested.approval.status, 'pending');
  assert.equal(replay.idempotent, true);
  assert.equal(replay.approval.id, requested.approval.id);
  assert.throws(() => ledger.resolveApproval(requested.approval.id, { status: 'approved', resolvedBy: 'scheduler-one' }, {
    actor: 'scheduler-one', enforceSeparation: true
  }), error => error.code === 'resource_plan_independent_approval_required');
  ledger.resolveApproval(requested.approval.id, { status: 'approved', resolvedBy: 'independent-approver' }, {
    actor: 'independent-approver', enforceSeparation: true
  });
  const applied = ledger.getJobDetail(job.id).tasks[0];
  assert.equal(applied.assigneeId, worker.id);
  assert.equal(applied.plannedStart, result.tasks[0].plannedStart);
  assert.equal(applied.plannedEnd, result.tasks[0].plannedEnd);
  assert.equal(applied.durationHours, 3);
});

test('resource preview resequences independent work while holding material-blocked tasks and their successors', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-resource-material-hold-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const plannedStart = new Date(Date.now() + 2 * 86_400_000);
  plannedStart.setUTCHours(7, 0, 0, 0);
  const plannedEnd = new Date(plannedStart.getTime() + 3 * 86_400_000);
  const job = ledger.createIntake({ title: 'Material recovery sequence', status: 'planned',
    scheduledStart: plannedStart.toISOString(), scheduledEnd: plannedEnd.toISOString(), tasks: [], assignAutomatically: false });
  ledger.db.prepare('DELETE FROM job_tasks WHERE job_id = ?').run(job.id);
  const worker = ledger.upsertWorker({ name: 'Available installer', role: 'Installer', status: 'available' });
  ledger.addAssignment(job.id, { workerId: worker.id, role: 'Installer', status: 'planned',
    scheduledStart: plannedStart.toISOString(), scheduledEnd: plannedEnd.toISOString() });
  const material = ledger.addMaterialRequirement(job.id, { name: 'Roof membrane', quantity: 8, unit: 'rolls' });
  const blocked = ledger.addTask(job.id, { title: 'Install roof membrane', durationHours: 2,
    requiredTrade: 'Installer', assigneeId: worker.id, materialRequirementIds: [material.id] });
  const heldStart = plannedStart.toISOString();
  const heldEnd = new Date(plannedStart.getTime() + 2 * 60 * 60_000).toISOString();
  ledger.updateTaskSchedule(job.id, blocked.id, { plannedStart: heldStart, plannedEnd: heldEnd, durationHours: 2 });
  const dependent = ledger.addTask(job.id, { title: 'Inspect roof membrane', durationHours: 1, requiredTrade: 'Installer' });
  ledger.addTaskDependency(job.id, { predecessorTaskId: blocked.id, successorTaskId: dependent.id });
  const independent = ledger.addTask(job.id, { title: 'Prepare access area', durationHours: 1, requiredTrade: 'Installer' });

  const planner = new ResourcePlanner(ledger);
  const preview = await planner.preview(job.id, { plannedStart: plannedStart.toISOString(), horizonDays: 2 });
  assert.equal(preview.status, 'feasible_under_recorded_constraints', JSON.stringify(preview.issues));
  assert.equal(preview.partial, true);
  assert.deepEqual(preview.tasks.map(row => row.taskId), [independent.id]);
  assert.deepEqual(preview.heldTasks.map(row => row.taskId).sort(), [blocked.id, dependent.id].sort());
  assert.ok(preview.heldTasks.find(row => row.taskId === blocked.id).reasons.some(reason => reason.code === 'material_availability_unresolved'));
  assert.ok(preview.heldTasks.find(row => row.taskId === dependent.id).reasons.some(reason => reason.code === 'blocked_by_material_predecessor'));
  assert.ok(Date.parse(preview.tasks[0].plannedStart) >= Date.parse(heldEnd));

  const pending = planner.requestApproval(job.id, { plan: preview, reason: 'Resequence independent work.' }, 'planner');
  const approvalData = JSON.parse(ledger.db.prepare('SELECT data_json FROM approvals WHERE id = ?').get(pending.approval.id).data_json);
  assert.equal(approvalData.assignments.length, 1);
  assert.equal(approvalData.heldTasks.length, 2);
  ledger.resolveApproval(pending.approval.id, { status: 'approved', resolvedBy: 'independent-approver' }, { actor: 'independent-approver', enforceSeparation: true });
  const after = ledger.getJobDetail(job.id).tasks;
  assert.ok(after.find(row => row.id === independent.id).plannedStart);
  assert.equal(after.find(row => row.id === blocked.id).plannedStart, heldStart);
  assert.equal(after.find(row => row.id === blocked.id).plannedEnd, heldEnd);
  assert.equal(after.find(row => row.id === dependent.id).plannedStart, null);

  ledger.updateMaterialRequirementStatus(job.id, material.id, {
    status: 'needed', availableQuantity: 0,
    expectedAvailableAt: new Date(plannedStart.getTime() + 4 * 86_400_000).toISOString(),
    verificationReference: 'Supplier confirmation SC-204', notes: 'Supplier confirmed expected availability after the planning window.'
  });
  const laterPreview = await planner.preview(job.id, { plannedStart: plannedStart.toISOString(), horizonDays: 2 });
  assert.equal(laterPreview.status, 'feasible_under_recorded_constraints');
  assert.ok(laterPreview.heldTasks.find(row => row.taskId === blocked.id).reasons.some(reason => reason.code === 'material_after_planning_horizon'));
});

test('resource plans keep the named supervisor qualified, on shift and free for the full task', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-resource-supervision-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const plannedStart = '2026-10-05T06:00:00.000Z';
  const plannedEnd = '2026-10-05T14:00:00.000Z';
  const job = ledger.createIntake({ title: 'Supervised installation', scheduledStart: plannedStart, scheduledEnd: plannedEnd,
    tasks: [], assignAutomatically: false });
  ledger.db.prepare('DELETE FROM job_tasks WHERE job_id = ?').run(job.id);
  const trainee = ledger.upsertWorker({ name: 'Installation trainee', role: 'Apprentice Installer', status: 'available' });
  const supervisor = ledger.upsertWorker({ name: 'Qualified lead', role: 'Lead Installer', status: 'available' });
  for (const [worker, role] of [[trainee, 'Apprentice Installer'], [supervisor, 'Lead Installer']]) {
    ledger.addAssignment(job.id, { workerId: worker.id, role, status: 'planned', scheduledStart: plannedStart, scheduledEnd: plannedEnd });
  }
  const supervisedTask = ledger.addTask(job.id, { title: 'Install under supervision', durationHours: 2,
    requiredTrade: 'Apprentice Installer', supervisorWorkerId: supervisor.id });
  const leadTask = ledger.addTask(job.id, { title: 'Lead-only commissioning', durationHours: 2, requiredTrade: 'Lead Installer' });
  const planner = new ResourcePlanner(ledger);
  const proposal = await planner.preview(job.id, { plannedStart, horizonDays: 1 });
  assert.equal(proposal.status, 'feasible_under_recorded_constraints', JSON.stringify(proposal.issues));
  const supervised = proposal.tasks.find(row => row.taskId === supervisedTask.id);
  const lead = proposal.tasks.find(row => row.taskId === leadTask.id);
  assert.equal(supervised.workerId, trainee.id);
  assert.equal(supervised.supervisorWorkerId, supervisor.id);
  assert.deepEqual(supervised.supervisorWorkerIds, [supervisor.id]);
  assert.equal(supervised.supervisors[0].workerId, supervisor.id);
  assert.equal(supervised.supervisorName, supervisor.name);
  assert.equal(supervised.supervisorTrade, 'Lead Installer');
  assert.ok(Date.parse(lead.plannedStart) >= Date.parse(supervised.plannedEnd)
    || Date.parse(supervised.plannedStart) >= Date.parse(lead.plannedEnd));

  const approval = planner.requestApproval(job.id, { plan: proposal, reason: 'Review named supervision and task sequence.' }, 'planner');
  ledger.resolveApproval(approval.approval.id, { status: 'approved', resolvedBy: 'independent-approver' }, { actor: 'independent-approver', enforceSeparation: true });
  const applied = ledger.getJobDetail(job.id).tasks.find(row => row.id === supervisedTask.id);
  assert.equal(applied.assigneeId, trainee.id);
  assert.equal(applied.data.supervisorWorkerId, supervisor.id);
  assert.equal(applied.data.supervisorTrade, 'Lead Installer');
});

test('supervision ratios reserve every named qualified supervisor and revalidate the full group on approval', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-resource-supervision-ratio-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => { ledger.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const plannedStart = '2026-10-05T06:00:00.000Z';
  const plannedEnd = '2026-10-05T14:00:00.000Z';
  const job = ledger.createIntake({ title: 'Two-lead supervision ratio', scheduledStart: plannedStart, scheduledEnd: plannedEnd,
    tasks: [], assignAutomatically: false });
  ledger.db.prepare('DELETE FROM job_tasks WHERE job_id = ?').run(job.id);
  const workers = [['Apprentice A', 'Apprentice Installer'], ['Apprentice B', 'Apprentice Installer'],
    ['Lead A', 'Lead Installer'], ['Lead B', 'Lead Installer']].map(([name, role]) => ledger.upsertWorker({ name, role, status: 'available' }));
  for (const worker of workers) ledger.addAssignment(job.id, { workerId: worker.id, role: worker.role, status: 'planned',
    scheduledStart: plannedStart, scheduledEnd: plannedEnd });
  const taskRecord = ledger.addTask(job.id, { title: 'Two-person supervised installation', durationHours: 2,
    requiredCrewRequirements: [{ role: 'Apprentice Installer', count: 2 }],
    supervisorWorkerIds: [workers[2].id, workers[3].id], supervisorTrade: 'Lead Installer',
    supervisionRatio: { workersPerSupervisor: 1 } });
  const planner = new ResourcePlanner(ledger);
  const proposal = await planner.preview(job.id, { plannedStart, horizonDays: 1 });
  assert.equal(proposal.status, 'feasible_under_recorded_constraints', JSON.stringify(proposal.issues));
  const assignment = proposal.tasks.find(item => item.taskId === taskRecord.id);
  assert.equal(assignment.supervisors.length, 2);
  assert.deepEqual(assignment.supervisorWorkerIds, [workers[2].id, workers[3].id]);
  assert.equal(assignment.supervisionRatio.requiredSupervisorCount, 2);
  const modified = structuredClone(proposal);
  modified.tasks[0].supervisorWorkerIds.pop();
  assert.throws(() => planner.requestApproval(job.id, { plan: modified, reason: 'Reject missing ratio supervisor.' }, 'planner'), { statusCode: 409 });
  const approval = planner.requestApproval(job.id, { plan: proposal, reason: 'Approve named ratio supervisors.' }, 'planner');
  ledger.resolveApproval(approval.approval.id, { status: 'approved', resolvedBy: 'independent-approver' }, { actor: 'independent-approver', enforceSeparation: true });
  const applied = ledger.getJobDetail(job.id).tasks.find(item => item.id === taskRecord.id);
  assert.deepEqual(applied.data.supervisorWorkerIds, [workers[2].id, workers[3].id]);
  assert.equal(applied.data.supervisionRatio.requiredSupervisorCount, 2);
});

test('mixed-trade planning selects the required qualified roles and persists the complete crew only after approval', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-resource-crew-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const plannedStart = '2026-10-05T06:00:00.000Z';
  const plannedEnd = '2026-10-06T14:00:00.000Z';
  const job = ledger.createIntake({ title: 'Two-person installation', scheduledStart: plannedStart, scheduledEnd: plannedEnd,
    tasks: [], assignAutomatically: false });
  ledger.db.prepare('DELETE FROM job_tasks WHERE job_id = ?').run(job.id);
  const workers = [['Installer A', 'Installer'], ['Electrician A', 'Electrician']].map(([name, role]) => ledger.upsertWorker({ name, role, status: 'available' }));
  for (let index = 0; index < workers.length; index += 1) {
    const assignment = ledger.addAssignment(job.id, { workerId: workers[index].id,
      role: index ? 'Electrician' : 'Installer', status: 'planned', scheduledStart: plannedStart, scheduledEnd: plannedEnd });
    const assignmentData = JSON.parse(ledger.db.prepare('SELECT data_json FROM assignments WHERE id = ?').get(assignment.id).data_json);
    ledger.db.prepare('UPDATE assignments SET data_json = ? WHERE id = ?')
      .run(JSON.stringify({ ...assignmentData, requiresApproval: false }), assignment.id);
  }
  const taskRecord = ledger.addTask(job.id, { title: 'Fit coordinated service panels', durationHours: 2,
    requiredCrewRequirements: [{ role: 'Installer', count: 1 }, { role: 'Electrician', count: 1 }],
    data: { replacementScheduleReviewRequired: { approvalId: 'replacement-approval-test', requiredBeforeAllocation: true } } });
  const planner = new ResourcePlanner(ledger);
  const proposal = await planner.preview(job.id, { plannedStart, horizonDays: 2 });
  assert.equal(proposal.status, 'feasible_under_recorded_constraints', JSON.stringify(proposal.issues));
  const plannedTask = proposal.tasks.find(row => row.taskId === taskRecord.id);
  assert.equal(plannedTask.workerIds.length, 2);
  assert.equal(plannedTask.workers.length, 2);
  assert.equal(new Set(plannedTask.workerIds).size, 2);
  assert.ok(plannedTask.workerIds.includes(plannedTask.workerId));
  assert.deepEqual(plannedTask.workers.map(worker => worker.role).sort(), ['Electrician', 'Installer']);
  assert.deepEqual(plannedTask.requiredCrewRequirements, [{ role: 'Installer', count: 1 }, { role: 'Electrician', count: 1 }]);

  const malformed = structuredClone(proposal);
  malformed.tasks[0].workerIds = [workers[0].id, workers[0].id];
  assert.throws(() => planner.requestApproval(job.id, { plan: malformed, reason: 'Reject duplicate crew member.' }, 'planner'), { statusCode: 409 });
  const wrongTrade = structuredClone(proposal);
  wrongTrade.tasks[0].crewMembers.find(member => member.role === 'Electrician').role = 'Installer';
  assert.deepEqual(wrongTrade.tasks[0].crewMembers.map(member => member.role).sort(), ['Installer', 'Installer']);
  assert.throws(() => planner.requestApproval(job.id, { plan: wrongTrade, reason: 'Reject mismatched trade mix.' }, 'planner'), { statusCode: 409 });
  const approval = planner.requestApproval(job.id, { plan: proposal, reason: 'Approve coordinated two-person task.' }, 'planner');
  ledger.resolveApproval(approval.approval.id, { status: 'approved', resolvedBy: 'independent-approver' }, { actor: 'independent-approver', enforceSeparation: true });
  const applied = ledger.getJobDetail(job.id).tasks.find(row => row.id === taskRecord.id);
  assert.deepEqual([...applied.data.crewWorkerIds].sort(), [...plannedTask.workerIds].sort());
  assert.deepEqual(applied.data.crewWorkerAssignments.map(member => member.role).sort(), ['Electrician', 'Installer']);
  assert.equal(applied.data.requiredCrewSize, 2);
  assert.equal(applied.data.replacementScheduleReviewRequired, undefined, JSON.stringify(applied.data));
  assert.equal(applied.data.replacementScheduleReview.status, 'resolved');
  assert.equal(applied.data.replacementScheduleReview.resolutionApprovalId, approval.approval.id);
  const refreshedProposal = await planner.preview(job.id, { plannedStart, horizonDays: 2 });
  assert.equal(refreshedProposal.status, 'feasible_under_recorded_constraints');
  assert.deepEqual([...refreshedProposal.tasks.find(row => row.taskId === taskRecord.id).workerIds].sort(), [...plannedTask.workerIds].sort());
  const additionalCrewMember = plannedTask.workerIds.find(workerId => workerId !== applied.assigneeId);
  const unavailableWorker = ledger.getWorker(additionalCrewMember);
  ledger.upsertWorker({ id: unavailableWorker.id, name: unavailableWorker.name, role: unavailableWorker.role, status: 'unavailable' });
  const staleCrew = await planner.preview(job.id, { plannedStart, horizonDays: 2 });
  assert.equal(staleCrew.status, 'incomplete_input');
  assert.ok(staleCrew.issues.some(issue => issue.code === 'locked_crew_member_unavailable'));

  const singleWorkerJob = ledger.createIntake({ title: 'Insufficient crew', scheduledStart: plannedStart, scheduledEnd: plannedEnd,
    tasks: [], assignAutomatically: false });
  ledger.db.prepare('DELETE FROM job_tasks WHERE job_id = ?').run(singleWorkerJob.id);
  const loneWorker = ledger.upsertWorker({ name: 'Only available installer', role: 'Installer', status: 'available' });
  ledger.addAssignment(singleWorkerJob.id, { workerId: loneWorker.id, role: 'Installer', status: 'planned', scheduledStart: plannedStart, scheduledEnd: plannedEnd });
  ledger.addTask(singleWorkerJob.id, { title: 'Heavy lift', durationHours: 2, requiredTrade: 'Installer', requiredCrewSize: 2 });
  const blocked = await planner.preview(singleWorkerJob.id, { plannedStart, horizonDays: 2 });
  assert.equal(blocked.status, 'incomplete_input');
  assert.ok(blocked.issues.some(issue => issue.code === 'qualified_crew_insufficient'));
});

test('resource preview respects capacity-calendar non-working days in the worker timezone', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-resource-calendar-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const plannedStartIso = '2026-10-03T06:00:00.000Z'; // Saturday in Europe/Amsterdam.
  const plannedEnd = '2026-10-06T16:00:00.000Z';
  const job = ledger.createIntake({
    client: { name: 'Calendar client', email: 'calendar@example.test', country: 'NL' },
    title: 'Workday-aware plan',
    status: 'planned',
    scheduledStart: plannedStartIso,
    scheduledEnd: plannedEnd,
    tasks: [{ title: 'Install on a working day', durationHours: 2, requiredTrade: 'Installer' }],
    assignAutomatically: false
  });
  const worker = ledger.upsertWorker({ name: 'Calendar installer', role: 'Installer', status: 'available' });
  ledger.addAssignment(job.id, {
    workerId: worker.id,
    role: 'Installer',
    status: 'planned',
    scheduledStart: plannedStartIso,
    scheduledEnd: plannedEnd
  });
  ledger.setCrewCapacityProfile(worker.id, {
    effectiveFrom: '2026-10-03',
    timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 8, tuesday: 8, wednesday: 0, thursday: 0, friday: 0, saturday: 0 },
    workingWindows: { monday: { start: '08:00', end: '16:00' }, tuesday: { start: '08:00', end: '16:00' } }
  });

  const planner = new ResourcePlanner(ledger);
  const proposal = await planner.preview(job.id, { plannedStart: plannedStartIso, horizonDays: 3 });
  assert.equal(proposal.status, 'feasible_under_recorded_constraints');
  const plannedStart = new Date(proposal.tasks[0].plannedStart);
  assert.equal(new Intl.DateTimeFormat('en', { timeZone: 'Europe/Amsterdam', weekday: 'long' }).format(plannedStart), 'Monday');
  assert.equal(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(plannedStart), '08:00');
  assert.ok(!proposal.limitations.includes('legacy_capacity_profiles_without_working_time_windows_only_block_non_working_days'));

  ledger.setCrewCapacityProfile(worker.id, {
    effectiveFrom: '2026-10-03',
    timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 0, tuesday: 8, wednesday: 0, thursday: 0, friday: 0, saturday: 0 },
    workingWindows: { tuesday: { start: '09:00', end: '17:00' } }
  });
  assert.throws(
    () => planner.requestApproval(job.id, { plan: proposal }, 'calendar-test'),
    error => error.statusCode === 409
  );
});

test('resource preview places work wholly inside one of a worker split-shift intervals', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-resource-split-shift-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const plannedStart = '2026-10-05T06:00:00.000Z';
  const plannedEnd = '2026-10-06T16:00:00.000Z';
  const job = ledger.createIntake({
    client: { name: 'Split shift client', email: 'split-shift@example.test', country: 'NL' },
    title: 'Task constrained by lunch break',
    status: 'planned',
    scheduledStart: plannedStart,
    scheduledEnd: plannedEnd,
    tasks: [{ title: 'Afternoon installation', durationHours: 3, requiredTrade: 'Installer' }],
    assignAutomatically: false
  });
  const worker = ledger.upsertWorker({ name: 'Split shift installer', role: 'Installer', status: 'available' });
  ledger.addAssignment(job.id, { workerId: worker.id, role: 'Installer', status: 'planned', scheduledStart: plannedStart, scheduledEnd: plannedEnd });
  ledger.setCrewCapacityProfile(worker.id, {
    effectiveFrom: '2026-10-05',
    timezone: 'Europe/Amsterdam',
    dailyHours: { sunday: 0, monday: 5, tuesday: 0, wednesday: 0, thursday: 0, friday: 0, saturday: 0 },
    workingWindows: { monday: [{ start: '08:00', end: '10:00' }, { start: '13:00', end: '16:00' }] }
  });

  const proposal = await new ResourcePlanner(ledger).preview(job.id, { plannedStart, horizonDays: 2 });
  assert.equal(proposal.status, 'feasible_under_recorded_constraints');
  const plannedTask = proposal.tasks[0];
  const localStart = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(plannedTask.plannedStart));
  assert.equal(localStart, '13:00');
  assert.equal(new Date(plannedTask.plannedEnd).getTime() - new Date(plannedTask.plannedStart).getTime(), 3 * 60 * 60_000);
});

test('site access calendars constrain planning and changing them invalidates a pending proposal', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-resource-site-access-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const plannedStart = '2026-10-05T06:00:00.000Z';
  const plannedEnd = '2026-10-07T16:00:00.000Z';
  const job = ledger.createIntake({
    client: { name: 'Site access client', email: 'site-access@example.test', country: 'NL' },
    title: 'Work within confirmed site hours',
    status: 'planned',
    scheduledStart: plannedStart,
    scheduledEnd: plannedEnd,
    tasks: [{ title: 'Install during site hours', durationHours: 2, requiredTrade: 'Installer' }],
    assignAutomatically: false
  });
  const worker = ledger.upsertWorker({ name: 'Site access installer', role: 'Installer', status: 'available' });
  ledger.addAssignment(job.id, { workerId: worker.id, role: 'Installer', status: 'planned', scheduledStart: plannedStart, scheduledEnd: plannedEnd });
  const weeklyWindows = {
    monday: [{ start: '10:00', end: '12:00' }],
    tuesday: [{ start: '08:00', end: '17:00' }],
    wednesday: [], thursday: [], friday: [], saturday: [], sunday: []
  };
  const saved = ledger.setJobSiteAccessCalendar(job.id, {
    timeZone: 'Europe/Amsterdam',
    weeklyWindows,
    sourceType: 'customer_confirmed',
    note: 'Client confirmed access by email.'
  }, { actor: 'site-coordinator' });
  assert.equal(saved.changed, true);
  assert.equal(saved.calendar.revision, 1);
  assert.deepEqual(saved.job.data.siteAccessCalendar.weeklyWindows, weeklyWindows);
  assert.equal(ledger.setJobSiteAccessCalendar(job.id, {
    timeZone: 'Europe/Amsterdam', weeklyWindows, sourceType: 'customer_confirmed', note: 'Client confirmed access by email.'
  }).changed, false);
  assert.throws(() => ledger.setJobSiteAccessCalendar(job.id, {
    timeZone: 'Europe/Amsterdam',
    weeklyWindows: { ...weeklyWindows, monday: [{ start: '08:00', end: '12:00' }, { start: '11:30', end: '13:00' }] },
    sourceType: 'customer_confirmed',
    note: 'Client confirmed access by email.'
  }), error => error.code === 'site_access_calendar_invalid');

  const planner = new ResourcePlanner(ledger);
  const proposal = await planner.preview(job.id, { plannedStart, horizonDays: 2 });
  assert.equal(proposal.status, 'feasible_under_recorded_constraints');
  assert.equal(proposal.tasks[0].plannedStart, '2026-10-05T08:00:00.000Z');
  assert.ok(!proposal.limitations.includes('site_access_hours_not_recorded'));
  assert.ok(proposal.limitations.includes('recorded_route_durations_between_external_job_assignments_are_hard_blocks'));

  ledger.setJobSiteAccessCalendar(job.id, {
    timeZone: 'Europe/Amsterdam',
    weeklyWindows: { ...weeklyWindows, monday: [{ start: '11:00', end: '13:00' }] },
    sourceType: 'site_document',
    note: 'Access window in the site handover document.'
  }, { actor: 'site-coordinator' });
  assert.throws(() => planner.requestApproval(job.id, { plan: proposal }, 'site-coordinator'), error => error.statusCode === 409);
});

test('resource planning requires sourced directional travel buffers and stales routes when either site address changes', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-resource-travel-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const plannedStart = '2026-10-05T06:00:00.000Z';
  const plannedEnd = '2026-10-06T16:00:00.000Z';
  const taskJob = ledger.createIntake({
    client: { name: 'Route planning client', email: 'route-planning@example.test', country: 'NL' },
    title: 'Work requiring a sourced route',
    address: 'Main Street 1', city: 'Utrecht',
    status: 'planned', scheduledStart: plannedStart, scheduledEnd: plannedEnd,
    tasks: [{ title: 'Install equipment', durationHours: 2, requiredTrade: 'Installer' }],
    assignAutomatically: false
  });
  const externalJob = ledger.createIntake({
    client: { name: 'External route client', email: 'external-route@example.test', country: 'NL' },
    title: 'Other scheduled job',
    address: 'Industry Road 25', city: 'Nieuwegein',
    status: 'planned', scheduledStart: plannedStart, scheduledEnd: plannedEnd,
    tasks: [], assignAutomatically: false
  });
  const worker = ledger.upsertWorker({ name: 'Route-aware installer', role: 'Installer', status: 'available' });
  ledger.addAssignment(taskJob.id, {
    workerId: worker.id, role: 'Installer', status: 'planned',
    scheduledStart: plannedStart, scheduledEnd: '2026-10-05T14:00:00.000Z'
  });
  ledger.addAssignment(externalJob.id, {
    workerId: worker.id, role: 'Installer', status: 'planned',
    scheduledStart: '2026-10-05T08:00:00.000Z', scheduledEnd: '2026-10-05T09:00:00.000Z'
  });

  const planner = new ResourcePlanner(ledger);
  const missingRoute = await planner.preview(taskJob.id, { plannedStart, horizonDays: 2 });
  assert.equal(missingRoute.status, 'incomplete_input');
  assert.ok(missingRoute.issues.some(issue => issue.code === 'travel_route_required' && issue.externalJobId === externalJob.id));
  assert.throws(() => ledger.setJobTravelRoute(taskJob.id, {
    externalJobId: externalJob.id,
    minutesToExternal: 0, minutesFromExternal: 0,
    sourceType: 'map_reference', note: 'A route was checked on the planning date.'
  }), error => error.code === 'job_travel_route_invalid');

  const saved = ledger.setJobTravelRoute(taskJob.id, {
    externalJobId: externalJob.id,
    minutesToExternal: 60, minutesFromExternal: 90,
    sourceType: 'map_reference', note: 'Map route checked on 5 October 2026.'
  }, { actor: 'route-planner' });
  assert.equal(saved.route.revision, 1);
  assert.deepEqual(saved.route.fromSite, {
    address: 'main street 1', city: 'utrecht', region: '', country: 'nl'
  });
  const planned = await planner.preview(taskJob.id, { plannedStart, horizonDays: 2 });
  assert.equal(planned.status, 'feasible_under_recorded_constraints');
  assert.ok(Date.parse(planned.tasks[0].plannedStart) >= Date.parse('2026-10-05T10:30:00.000Z'));

  ledger.updateJob(externalJob.id, { address: 'Industry Road 27' });
  const stale = await planner.preview(taskJob.id, { plannedStart, horizonDays: 2 });
  assert.equal(stale.status, 'incomplete_input');
  assert.ok(stale.issues.some(issue => issue.code === 'travel_route_stale'));
  assert.throws(() => planner.requestApproval(taskJob.id, { plan: planned }, 'route-planner'), error => error.statusCode === 409);
});

test('same-site zero travel is accepted only for identical recorded site snapshots', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-resource-same-site-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const plannedStart = '2026-10-05T06:00:00.000Z';
  const plannedEnd = '2026-10-06T16:00:00.000Z';
  const site = { address: 'Shared Campus 5', city: 'Arnhem', region: 'Gelderland', country: 'NL' };
  const job = ledger.createIntake({
    client: { name: 'Same site client', email: 'same-site@example.test', country: 'NL' },
    title: 'Primary site work', ...site, status: 'planned', scheduledStart: plannedStart, scheduledEnd: plannedEnd,
    tasks: [{ title: 'Inspect shared site', durationHours: 1, requiredTrade: 'Inspector' }], assignAutomatically: false
  });
  const other = ledger.createIntake({
    client: { name: 'Same site other client', email: 'same-site-other@example.test', country: 'NL' },
    title: 'Other work at nearby site', address: 'Different Road 8', city: 'Arnhem', region: 'Gelderland', country: 'NL',
    status: 'planned', scheduledStart: plannedStart, scheduledEnd: plannedEnd,
    tasks: [], assignAutomatically: false
  });
  const worker = ledger.upsertWorker({ name: 'Same-site inspector', role: 'Inspector', status: 'available' });
  ledger.addAssignment(job.id, { workerId: worker.id, role: 'Inspector', status: 'planned', scheduledStart: plannedStart, scheduledEnd: '2026-10-05T14:00:00.000Z' });
  ledger.addAssignment(other.id, { workerId: worker.id, role: 'Inspector', status: 'planned', scheduledStart: '2026-10-05T08:00:00.000Z', scheduledEnd: '2026-10-05T09:00:00.000Z' });
  assert.throws(() => ledger.setJobTravelRoute(job.id, {
    externalJobId: other.id, minutesToExternal: 0, minutesFromExternal: 0,
    sourceType: 'same_site', note: 'The jobs do not share the same address.'
  }), error => error.code === 'job_travel_route_invalid');
  ledger.updateJob(other.id, site);
  const saved = ledger.setJobTravelRoute(job.id, {
    externalJobId: other.id, minutesToExternal: 0, minutesFromExternal: 0,
    sourceType: 'same_site', note: 'Both jobs use the same recorded site entrance.'
  });
  assert.equal(saved.changed, true);
  const proposal = await new ResourcePlanner(ledger).preview(job.id, { plannedStart, horizonDays: 2 });
  assert.equal(proposal.status, 'feasible_under_recorded_constraints');
});

test('portfolio resource plan coordinates shared crews, retains travel buffers, and applies atomically after independent approval', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-portfolio-resource-plan-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const plannedStart = '2026-10-05T06:00:00.000Z';
  const plannedEnd = '2026-10-06T16:00:00.000Z';
  const first = ledger.createIntake({ title: 'Portfolio site north', address: 'North Street 1', city: 'Utrecht', country: 'NL',
    status: 'planned', scheduledStart: plannedStart, scheduledEnd: plannedEnd,
    tasks: [{ title: 'North installation', durationHours: 2, requiredTrade: 'Installer' }], assignAutomatically: false });
  const second = ledger.createIntake({ title: 'Portfolio site south', address: 'South Street 8', city: 'Utrecht', country: 'NL',
    status: 'planned', scheduledStart: plannedStart, scheduledEnd: plannedEnd,
    tasks: [{ title: 'South installation', durationHours: 2, requiredTrade: 'Installer' }], assignAutomatically: false });
  const worker = ledger.upsertWorker({ name: 'Shared portfolio installer', role: 'Installer', status: 'available' });
  for (const job of [first, second]) ledger.addAssignment(job.id, { workerId: worker.id, role: 'Installer', status: 'planned',
    scheduledStart: plannedStart, scheduledEnd: plannedEnd });
  ledger.setJobTravelRoute(first.id, { externalJobId: second.id, minutesToExternal: 45, minutesFromExternal: 30,
    sourceType: 'map_reference', note: 'Map route checked for both site directions.' });

  const planner = new ResourcePlanner(ledger);
  const proposal = await planner.previewPortfolio({ jobIds: [first.id, second.id], plannedStart, horizonDays: 2 });
  assert.equal(proposal.status, 'feasible_under_recorded_constraints');
  assert.equal(proposal.tasks.length, 2);
  const expectedForward = proposal.travelRouteEvidence[0].fromJobId === first.id ? 45 : 30;
  assert.equal(proposal.travelRouteEvidence[0].minutesForward, expectedForward);
  const chronological = [...proposal.tasks].sort((a, b) => Date.parse(a.plannedStart) - Date.parse(b.plannedStart));
  const routeMinutes = chronological[0].jobId === first.id ? 45 : 30;
  assert.ok(Date.parse(chronological[1].plannedStart) - Date.parse(chronological[0].plannedEnd) >= routeMinutes * 60_000);
  assert.equal(ledger.getJobDetail(first.id).tasks[0].plannedStart, null);
  assert.equal(ledger.getJobDetail(second.id).tasks[0].plannedStart, null);

  const requested = planner.requestPortfolioApproval({ plan: proposal, reason: 'Coordinate both crew assignments.' }, 'scheduler');
  const replay = planner.requestPortfolioApproval({ plan: proposal, reason: 'Coordinate both crew assignments.' }, 'scheduler');
  assert.equal(requested.approval.targetType, 'portfolio_resource_plan');
  assert.equal(replay.idempotent, true);
  assert.throws(() => ledger.resolveApproval(requested.approval.id, { status: 'approved', resolvedBy: 'scheduler' }, {
    actor: 'scheduler', enforceSeparation: true
  }), error => error.code === 'resource_plan_independent_approval_required');
  const changedStart = new Date(Date.parse(plannedStart) + 8 * 60 * 60_000).toISOString();
  const changedEnd = new Date(Date.parse(changedStart) + 2 * 60 * 60_000).toISOString();
  ledger.updateTaskSchedule(second.id, second.tasks[0].id, { plannedStart: changedStart, plannedEnd: changedEnd, durationHours: 2 });
  assert.throws(() => ledger.resolveApproval(requested.approval.id, { status: 'approved', resolvedBy: 'independent-approver' }, {
    actor: 'independent-approver', enforceSeparation: true
  }), error => error.statusCode === 409);
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(requested.approval.id).status, 'pending');
  assert.equal(ledger.getJobDetail(first.id).tasks[0].plannedStart, null);
  ledger.resolveApproval(requested.approval.id, { status: 'rejected', resolvedBy: 'independent-approver', reason: 'The source schedule changed.' }, {
    actor: 'independent-approver', enforceSeparation: true
  });
  const refreshed = await planner.previewPortfolio({ jobIds: [first.id, second.id], plannedStart, horizonDays: 2 });
  const refreshedApproval = planner.requestPortfolioApproval({ plan: refreshed }, 'scheduler');
  ledger.resolveApproval(refreshedApproval.approval.id, { status: 'approved', resolvedBy: 'independent-approver' }, {
    actor: 'independent-approver', enforceSeparation: true
  });
  for (const job of [first, second]) {
    const applied = ledger.getJobDetail(job.id).tasks[0];
    assert.equal(applied.assigneeId, worker.id);
    assert.ok(applied.plannedStart);
    assert.equal(applied.durationHours, 2);
  }
});

test('resource preview and approval keep an existing task schedule fixed', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-resource-plan-commitment-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const plannedStart = '2026-10-05T06:00:00.000Z';
  const committedStart = '2026-10-05T10:00:00.000Z';
  const committedEnd = '2026-10-05T12:00:00.000Z';
  const job = ledger.createIntake({
    client: { name: 'Schedule preservation client', email: 'schedule-preservation@example.test', country: 'NL' },
    title: 'Preserve accepted task timing',
    status: 'planned',
    scheduledStart: plannedStart,
    scheduledEnd: '2026-10-07T16:00:00.000Z',
    tasks: [{ title: 'Committed installation', durationHours: 2, requiredTrade: 'Installer' }],
    assignAutomatically: false
  });
  const worker = ledger.upsertWorker({ name: 'Committed installer', role: 'Installer', status: 'available' });
  ledger.addAssignment(job.id, { workerId: worker.id, role: 'Installer', status: 'planned', scheduledStart: plannedStart, scheduledEnd: '2026-10-07T16:00:00.000Z' });
  ledger.updateTaskSchedule(job.id, job.tasks[0].id, { plannedStart: committedStart, plannedEnd: committedEnd, durationHours: 2 });
  const planner = new ResourcePlanner(ledger);
  const proposal = await planner.preview(job.id, { plannedStart, horizonDays: 2 });

  assert.equal(proposal.status, 'feasible_under_recorded_constraints');
  assert.equal(proposal.tasks[0].plannedStart, committedStart);
  assert.equal(proposal.tasks[0].plannedEnd, committedEnd);
  assert.equal(proposal.tasks[0].scheduleProtected, true);

  const movedProposal = { ...proposal, tasks: [{ ...proposal.tasks[0], plannedStart, plannedEnd: '2026-10-05T08:00:00.000Z' }] };
  assert.throws(() => planner.requestApproval(job.id, { plan: movedProposal }, 'scheduler'), error => error.statusCode === 409);

  const requested = planner.requestApproval(job.id, { plan: proposal }, 'scheduler');
  ledger.resolveApproval(requested.approval.id, { status: 'approved', resolvedBy: 'independent-approver' }, {
    actor: 'independent-approver', enforceSeparation: true
  });
  const applied = ledger.getJobDetail(job.id).tasks[0];
  assert.equal(applied.plannedStart, committedStart);
  assert.equal(applied.plannedEnd, committedEnd);
});

test('resource approval refuses stale task sources and leaves approval pending without applying', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-resource-plan-stale-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const plannedStart = new Date(Date.now() + 2 * 86_400_000);
  plannedStart.setUTCHours(7, 0, 0, 0);
  const plannedEnd = new Date(plannedStart.getTime() + 3 * 86_400_000);
  const job = ledger.createIntake({
    client: { name: 'Stale plan client', email: 'stale-plan@example.test', country: 'NL' },
    title: 'Stale resource plan',
    status: 'planned',
    scheduledStart: plannedStart.toISOString(),
    scheduledEnd: plannedEnd.toISOString(),
    tasks: [{ title: 'Wire installation', durationHours: 2, requiredTrade: 'Electrician' }],
    assignAutomatically: false
  });
  const worker = ledger.upsertWorker({ name: 'Available electrician', role: 'Electrician', status: 'available' });
  ledger.addAssignment(job.id, { workerId: worker.id, role: 'Electrician', status: 'planned', scheduledStart: plannedStart.toISOString(), scheduledEnd: plannedEnd.toISOString() });
  const planner = new ResourcePlanner(ledger);
  const proposal = await planner.preview(job.id, { plannedStart: plannedStart.toISOString(), horizonDays: 3 });
  const requested = planner.requestApproval(job.id, { plan: proposal }, 'scheduler');
  ledger.updateTaskSchedule(job.id, job.tasks[0].id, { durationHours: 4 }, { actor: 'scheduler' });
  assert.throws(() => ledger.resolveApproval(requested.approval.id, { status: 'approved', resolvedBy: 'approver' }, {
    actor: 'approver', enforceSeparation: true
  }), error => error.statusCode === 409);
  assert.equal(ledger.listApprovals({ status: 'pending', id: requested.approval.id }).length, 1);
  const unchanged = ledger.getJobDetail(job.id).tasks[0];
  assert.equal(unchanged.assigneeId, null);
  assert.equal(unchanged.plannedStart, null);
  assert.equal(unchanged.durationHours, 4);
});
