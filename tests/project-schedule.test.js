const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-project-schedule-api-'));
process.env.STATE_FILE = path.join(stateDirectory, 'state.json');
process.env.LEDGER_DB_FILE = path.join(stateDirectory, 'ledger.sqlite');
process.env.UPLOAD_DIR = path.join(stateDirectory, 'uploads');

const { ContractorOperatingLedger } = require('../operating-ledger');
const app = require('../server');

function temporaryLedger(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-project-schedule-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return ledger;
}

function createJob(ledger, suffix = 'one', tasks = [{ title: 'Plan work', durationHours: 8 }]) {
  return ledger.createIntake({
    client: { name: `Schedule control ${suffix}`, email: `schedule-${suffix}@example.test`, country: 'NL' },
    title: `Schedule control ${suffix}`,
    tasks,
    assignAutomatically: false
  }, { actor: 'schedule-test' });
}

async function request(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const body = await response.json();
  return { response, body };
}

test('critical-path calculation retains dependencies, float, and an approval-gated baseline', t => {
  const ledger = temporaryLedger(t);
  const job = createJob(ledger, 'one', [
    { title: 'Mobilize', durationHours: 8 },
    { title: 'Excavate', durationHours: 4 },
    { title: 'Order materials', durationHours: 4 },
    { title: 'Install', durationHours: 8 }
  ]);
  const [mobilize, excavate, orderMaterials, install] = job.tasks;

  ledger.addTaskDependency(job.id, { predecessorTaskId: mobilize.id, successorTaskId: excavate.id });
  ledger.addTaskDependency(job.id, { predecessorTaskId: mobilize.id, successorTaskId: orderMaterials.id });
  ledger.addTaskDependency(job.id, { predecessorTaskId: excavate.id, successorTaskId: install.id });
  assert.throws(
    () => ledger.addTaskDependency(job.id, { predecessorTaskId: install.id, successorTaskId: mobilize.id }),
    error => error.code === 'task_dependency_cycle' && error.statusCode === 409
  );

  const plan = ledger.calculateJobSchedule(job.id, {
    plannedStart: '2026-08-03T08:00:00.000Z',
    referenceAt: '2026-08-03T08:00:00.000Z'
  });
  assert.equal(plan.ready, true);
  assert.equal(plan.projectDurationHours, 20);
  assert.deepEqual(plan.criticalPathTaskIds, [mobilize.id, excavate.id, install.id]);
  assert.equal(plan.tasks.find(task => task.id === orderMaterials.id).totalFloatHours, 8);
  assert.equal(plan.lookAhead.length, 4);

  const requestResult = ledger.requestScheduleBaseline(job.id, {
    plannedStart: '2026-08-03T08:00:00.000Z',
    reason: 'Initial internal execution baseline.'
  }, { actor: 'planner' });
  assert.equal(requestResult.baseline.status, 'pending_approval');
  assert.equal(requestResult.baseline.versionNumber, 1);
  assert.equal(requestResult.approval.targetType, 'schedule_baseline');
  assert.equal(requestResult.approval.data.externalCommitments, 0);
  const duplicate = ledger.requestScheduleBaseline(job.id, { plannedStart: '2026-08-03T08:00:00.000Z' });
  assert.equal(duplicate.idempotent, true);
  assert.equal(duplicate.baseline.id, requestResult.baseline.id);

  ledger.resolveApproval(requestResult.approval.id, {
    status: 'approved',
    resolvedBy: 'owner',
    reason: 'Sequence and durations reviewed.'
  });
  let detail = ledger.getJobDetail(job.id, { includeAudit: true });
  assert.equal(detail.scheduleControl.activeBaseline.status, 'approved');
  assert.equal(detail.scheduleControl.baselineCurrent, true);
  assert.equal(detail.tasks.find(task => task.id === install.id).plannedStart, '2026-08-03T20:00:00.000Z');
  assert.ok(detail.audit.some(event => event.action === 'approve_schedule_baseline'));

  ledger.transitionLifecycleRecord(job.id, 'task', excavate.id, {
    status: 'open',
    durationHours: 6
  }, { actor: 'planner' });
  detail = ledger.getJobDetail(job.id);
  assert.equal(detail.scheduleControl.baselineStale, true);
  assert.equal(ledger.diagnose().valid, true);
  assert.ok(ledger.diagnose().issues.some(issue => issue.severity === 'warning' && /work plan changed/i.test(issue.message)));
});

test('baseline approval rejects changed or tampered planning evidence atomically', t => {
  const ledger = temporaryLedger(t);
  const job = createJob(ledger, 'integrity', [
    { title: 'First', durationHours: 4 },
    { title: 'Second', durationHours: 4 }
  ]);
  const [first, second] = job.tasks;
  ledger.addTaskDependency(job.id, { predecessorTaskId: first.id, successorTaskId: second.id });
  const requested = ledger.requestScheduleBaseline(job.id, { plannedStart: '2026-08-10T08:00:00.000Z' });

  ledger.transitionLifecycleRecord(job.id, 'task', second.id, { status: 'open', durationHours: 6 });
  assert.throws(
    () => ledger.resolveApproval(requested.approval.id, { status: 'approved', resolvedBy: 'owner' }),
    error => error.code === 'schedule_baseline_stale'
  );
  assert.equal(ledger.listApprovals({ status: 'pending' }).some(approval => approval.id === requested.approval.id), true);
  assert.deepEqual(ledger.listApprovals({ status: 'pending', id: requested.approval.id }).map(approval => approval.id), [requested.approval.id]);
  assert.equal(ledger.listApprovals({ status: 'pending', jobId: job.id }).some(approval => approval.id === requested.approval.id), true);
  ledger.resolveApproval(requested.approval.id, { status: 'rejected', resolvedBy: 'owner', reason: 'Plan changed.' });

  const replacement = ledger.requestScheduleBaseline(job.id, { plannedStart: '2026-08-10T08:00:00.000Z' });
  ledger.db.prepare("UPDATE schedule_baselines SET snapshot_json = '{}' WHERE id = ?").run(replacement.baseline.id);
  assert.throws(
    () => ledger.resolveApproval(replacement.approval.id, { status: 'approved', resolvedBy: 'owner' }),
    error => error.code === 'schedule_baseline_snapshot_tampered'
  );
  assert.equal(ledger.listApprovals({ status: 'pending' }).some(approval => approval.id === replacement.approval.id), true);
  assert.equal(ledger.diagnose().valid, false);
});

test('material shortages block baseline and expected receipt dates shift dependent work and stale approvals', t => {
  const ledger = temporaryLedger(t);
  const job = createJob(ledger, 'material-impact', []);
  const material = ledger.addMaterialRequirement(job.id, { name: 'Roof membrane', quantity: 10, unit: 'rolls' });
  const install = ledger.addTask(job.id, {
    title: 'Install roof membrane',
    durationHours: 4,
    materialRequirementIds: [material.id]
  });
  const inspect = ledger.addTask(job.id, { title: 'Inspect roof', durationHours: 2 });
  ledger.addTaskDependency(job.id, { predecessorTaskId: install.id, successorTaskId: inspect.id });
  const plannedStart = '2026-09-24T08:00:00.000Z';

  const blocked = ledger.calculateJobSchedule(job.id, { plannedStart });
  assert.equal(blocked.ready, false);
  assert.equal(blocked.reason, 'material_availability_unresolved');
  assert.equal(blocked.materialBlockers[0].reason, 'expected_availability_unknown');
  assert.throws(
    () => ledger.requestScheduleBaseline(job.id, { plannedStart }),
    error => error.code === 'schedule_baseline_not_ready' && error.details.materialBlockers.length === 1
  );
  assert.throws(
    () => ledger.updateMaterialRequirementStatus(job.id, material.id, {
      status: 'needed',
      availableQuantity: 0,
      expectedAvailableAt: '2030-04-10T12:00:00.000Z',
      notes: 'ETA without a traceable source must be rejected.'
    }),
    error => error.statusCode === 400 && /reference/i.test(error.message)
  );

  ledger.updateMaterialRequirementStatus(job.id, material.id, {
    status: 'needed',
    availableQuantity: 0,
    expectedAvailableAt: '2030-04-10T12:00:00.000Z',
    verificationReference: 'Supplier confirmation SC-1042',
    notes: 'Supplier confirmed the estimated replenishment date.'
  });
  const planned = ledger.calculateJobSchedule(job.id, { plannedStart });
  assert.equal(planned.ready, true);
  assert.equal(planned.materialConstraints[0].blocker, false);
  assert.equal(planned.tasks.find(task => task.id === install.id).plannedStart, '2030-04-10T12:00:00.000Z');
  assert.equal(planned.tasks.find(task => task.id === inspect.id).plannedStart, '2030-04-10T16:00:00.000Z');

  const requested = ledger.requestScheduleBaseline(job.id, { plannedStart });
  ledger.updateMaterialRequirementStatus(job.id, material.id, {
    status: 'needed',
    availableQuantity: 0,
    expectedAvailableAt: '2030-04-12T12:00:00.000Z',
    verificationReference: 'Supplier update SC-1042',
    notes: 'Supplier revised the estimated replenishment date.'
  });
  assert.throws(
    () => ledger.resolveApproval(requested.approval.id, { status: 'approved', resolvedBy: 'owner' }),
    error => error.code === 'schedule_baseline_stale'
  );
});

test('work-plan material links must belong to the same job', t => {
  const ledger = temporaryLedger(t);
  const job = createJob(ledger, 'material-link-owner', []);
  const otherJob = createJob(ledger, 'material-link-other', []);
  const material = ledger.addMaterialRequirement(otherJob.id, { name: 'Restricted material', quantity: 1 });
  assert.throws(
    () => ledger.addTask(job.id, { title: 'Use material', durationHours: 1, materialRequirementIds: [material.id] }),
    error => error.code === 'task_material_requirement_job_mismatch' && error.statusCode === 400
  );
});

test('autonomous logic prepares one internal baseline and leaves it approval-gated', t => {
  const ledger = temporaryLedger(t);
  const job = ledger.createIntake({
    client: { name: 'Autonomous schedule client', email: 'autonomous-schedule@example.test', country: 'NL' },
    title: 'Autonomous schedule baseline',
    status: 'planned',
    scheduledStart: '2026-08-17T08:00:00.000Z',
    tasks: [
      { title: 'Prepare site', durationHours: 4 },
      { title: 'Execute work', durationHours: 12 }
    ],
    assignAutomatically: false
  }, { actor: 'schedule-test' });
  ledger.addTaskDependency(job.id, {
    predecessorTaskId: job.tasks[0].id,
    successorTaskId: job.tasks[1].id
  });

  const preview = ledger.runAutonomousCycle({
    dryRun: true,
    actionTypes: ['prepare_schedule_baseline'],
    jobIds: [job.id]
  });
  assert.equal(preview.preview.length, 1);
  assert.equal(preview.preview[0].requiresApproval, true);

  const applied = ledger.runAutonomousCycle({
    dryRun: false,
    actionTypes: ['prepare_schedule_baseline'],
    jobIds: [job.id],
    actor: 'autonomous-scheduler'
  });
  assert.equal(applied.applied.length, 1);
  assert.equal(applied.applied[0].status, 'pending_approval');
  assert.equal(applied.summary.externalCommitments, 0);
  const detail = ledger.getJobDetail(job.id);
  assert.equal(detail.scheduleControl.pendingBaseline.id, applied.applied[0].scheduleBaselineId);

  const repeated = ledger.runAutonomousCycle({
    dryRun: false,
    actionTypes: ['prepare_schedule_baseline'],
    jobIds: [job.id]
  });
  assert.equal(repeated.applied.length, 0);
  assert.equal(ledger.listScheduleBaselines(job.id).length, 1);
});

test('work-plan API exposes calculation, dependency lifecycle, and baseline approval', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const intake = await request(baseUrl, '/api/ledger/intake', {
    method: 'POST',
    body: JSON.stringify({
      clientName: 'API Schedule Client',
      title: 'API work plan',
      assignAutomatically: false,
      tasks: [{ title: 'Prepare', durationHours: 8 }]
    })
  });
  const jobId = intake.body.job.id;
  const firstTaskId = intake.body.job.tasks[0].id;
  const second = await request(baseUrl, `/api/ledger/jobs/${jobId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Build', durationHours: 16 })
  });
  const dependency = await request(baseUrl, `/api/ledger/jobs/${jobId}/task-dependencies`, {
    method: 'POST',
    body: JSON.stringify({ predecessorTaskId: firstTaskId, successorTaskId: second.body.task.id })
  });
  assert.equal(dependency.response.status, 201);
  assert.equal(dependency.body.dependency.status, 'active');

  const calculated = await request(baseUrl, `/api/ledger/jobs/${jobId}/work-plan/calculate`, {
    method: 'POST',
    body: JSON.stringify({ plannedStart: '2026-09-01' })
  });
  assert.equal(calculated.response.status, 200);
  assert.equal(calculated.body.plan.ready, true);
  assert.equal(calculated.body.plan.projectDurationHours, 24);

  const resourcePreview = await request(baseUrl, `/api/ledger/jobs/${jobId}/work-plan/resource-preview`, {
    method: 'POST',
    body: JSON.stringify({ plannedStart: '2026-09-01T07:00:00.000Z', horizonDays: 14 })
  });
  assert.equal(resourcePreview.response.status, 200);
  assert.equal(resourcePreview.body.plan.status, 'incomplete_input');
  assert.ok(resourcePreview.body.plan.issues.some(issue => issue.code === 'required_trade_missing'));
  assert.ok(resourcePreview.body.plan.limitations.includes('proposal_only_until_independent_approval'));

  const resourceApproval = await request(baseUrl, `/api/ledger/jobs/${jobId}/work-plan/resource-approval`, {
    method: 'POST',
    body: JSON.stringify({ plan: resourcePreview.body.plan })
  });
  assert.equal(resourceApproval.response.status, 409);
  assert.equal(resourceApproval.body.error.code, 'conflict');

  const baseline = await request(baseUrl, `/api/ledger/jobs/${jobId}/schedule-baselines`, {
    method: 'POST',
    body: JSON.stringify({ plannedStart: '2026-09-01' })
  });
  assert.equal(baseline.response.status, 201);
  assert.equal(baseline.body.baseline.status, 'pending_approval');
  assert.equal(baseline.body.job.scheduleControl.pendingBaseline.id, baseline.body.baseline.id);
  const resolved = await request(baseUrl, `/api/ledger/approvals/${baseline.body.approval.id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ status: 'approved', resolvedBy: 'owner', reason: 'Work plan checked.' })
  });
  assert.equal(resolved.response.status, 200);

  const detail = await request(baseUrl, `/api/ledger/jobs/${jobId}`);
  assert.equal(detail.body.job.scheduleControl.activeBaseline.id, baseline.body.baseline.id);
  assert.equal(detail.body.job.scheduleControl.baselineCurrent, true);

  const cancelled = await request(baseUrl, `/api/ledger/jobs/${jobId}/task-dependencies/${dependency.body.dependency.id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Tasks can now run independently.' })
  });
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.body.dependency.status, 'cancelled');
  assert.equal(cancelled.body.job.scheduleControl.baselineStale, true);
});
