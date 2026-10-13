const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-availability-api-'));
process.env.STATE_FILE = path.join(stateDirectory, 'state.json');
process.env.LEDGER_DB_FILE = path.join(stateDirectory, 'ledger.sqlite');
process.env.UPLOAD_DIR = path.join(stateDirectory, 'uploads');

const app = require('../server');

async function request(baseUrl, route, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options
  });
  const body = await response.json();
  return { response, body };
}

test('availability API keeps assignment approval blocked until cancellation approval completes', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = Date.now();
  const startsAt = new Date(Date.now() + 10 * 86_400_000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 8 * 3_600_000).toISOString();

  const workerResult = await request(baseUrl, '/api/ledger/workers', {
    method: 'POST',
    body: JSON.stringify({ name: `Availability API worker ${suffix}`, role: 'Installer', status: 'available' })
  });
  assert.equal(workerResult.response.status, 201);
  const workerId = workerResult.body.worker.id;

  const rejectedSensitive = await request(baseUrl, `/api/ledger/workers/${encodeURIComponent(workerId)}/availability`, {
    method: 'POST',
    body: JSON.stringify({ periodType: 'leave', startsAt, endsAt, healthDetails: 'Must not be retained.' })
  });
  assert.equal(rejectedSensitive.response.status, 400);
  assert.equal(rejectedSensitive.body.error.code, 'worker_availability_sensitive_data_forbidden');

  const periodResult = await request(baseUrl, `/api/ledger/workers/${encodeURIComponent(workerId)}/availability`, {
    method: 'POST',
    body: JSON.stringify({
      periodType: 'training',
      title: 'Installation training',
      startsAt,
      endsAt,
      notes: 'Operational capacity record only.'
    })
  });
  assert.equal(periodResult.response.status, 201);
  assert.equal(periodResult.body.period.status, 'active');
  assert.equal(periodResult.body.worker.availability.upcoming, 1);
  const periodId = periodResult.body.period.id;
  const workerPeriods = await request(baseUrl, `/api/ledger/workers/${encodeURIComponent(workerId)}/availability`);
  assert.equal(workerPeriods.response.status, 200);
  assert.equal(workerPeriods.body.periods.length, 1);
  assert.equal(workerPeriods.body.periods[0].id, periodId);

  const register = await request(baseUrl, '/api/ledger/availability');
  assert.equal(register.response.status, 200);
  assert.equal(register.body.availabilityRegister.summary.activePeriods, 1);
  assert.equal(register.body.availabilityRegister.policy.pendingCancellationBlocksScheduling, true);
  assert.ok(register.body.availabilityRegister.catalog.some(item => item.key === 'training'));

  const intake = await request(baseUrl, '/api/ledger/intake', {
    method: 'POST',
    body: JSON.stringify({
      title: `Availability API job ${suffix}`,
      clientName: `Availability API client ${suffix}`,
      status: 'scheduled',
      scheduledStart: startsAt,
      scheduledEnd: endsAt
    })
  });
  assert.equal(intake.response.status, 201);
  const jobId = intake.body.job.id;
  const assignmentResult = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/assignments`, {
    method: 'POST',
    body: JSON.stringify({ workerId, role: 'Installer', status: 'planned', scheduledStart: startsAt, scheduledEnd: endsAt })
  });
  assert.equal(assignmentResult.response.status, 201);
  assert.equal(assignmentResult.body.assignment.status, 'pending_approval');
  assert.equal(assignmentResult.body.assignment.availabilityConflicts.length, 1);
  const assignmentApprovalId = assignmentResult.body.assignment.approval.id;

  const cancellation = await request(baseUrl, `/api/ledger/workers/${encodeURIComponent(workerId)}/availability/${encodeURIComponent(periodId)}/cancellation`, {
    method: 'POST',
    body: JSON.stringify({ reason: 'Training moved outside the current assignment window.' })
  });
  assert.equal(cancellation.response.status, 200);
  assert.equal(cancellation.body.period.status, 'pending_cancellation');
  assert.equal(cancellation.body.availabilityRegister.summary.pendingCancellation, 1);

  const blockedApproval = await request(baseUrl, `/api/ledger/approvals/${encodeURIComponent(assignmentApprovalId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ status: 'approved', reason: 'Attempt before unavailability is cleared.' })
  });
  assert.equal(blockedApproval.response.status, 409);
  assert.equal(blockedApproval.body.error.code, 'assignment_worker_availability_required');

  const approvedCancellation = await request(baseUrl, `/api/ledger/approvals/${encodeURIComponent(cancellation.body.approval.id)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ status: 'approved', resolvedBy: 'availability_api_approver', reason: 'Operational move verified.' })
  });
  assert.equal(approvedCancellation.response.status, 200);
  const approvedAssignment = await request(baseUrl, `/api/ledger/approvals/${encodeURIComponent(assignmentApprovalId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ status: 'approved', resolvedBy: 'availability_api_approver', reason: 'Availability window is clear.' })
  });
  assert.equal(approvedAssignment.response.status, 200);

  const finalRegister = await request(baseUrl, '/api/ledger/availability');
  assert.equal(finalRegister.body.availabilityRegister.summary.activePeriods, 0);
  assert.equal(finalRegister.body.availabilityRegister.summary.assignmentConflicts, 0);
  const diagnostics = await request(baseUrl, '/api/ledger/debug');
  assert.equal(diagnostics.body.diagnostics.valid, true);
});

test('assignment replacement API retains old coverage until the approval route resolves it', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = Date.now();
  const startsAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 6 * 3_600_000).toISOString();
  const createWorker = async name => (await request(baseUrl, '/api/ledger/workers', {
    method: 'POST', body: JSON.stringify({ name: `${name} ${suffix}`, role: 'Installer', status: 'available' })
  })).body.worker;
  const original = await createWorker('Replacement API original');
  const candidate = await createWorker('Replacement API candidate');
  const periodResult = await request(baseUrl, `/api/ledger/workers/${encodeURIComponent(original.id)}/availability`, {
    method: 'POST', body: JSON.stringify({ periodType: 'unavailable', title: 'Capacity change', startsAt, endsAt })
  });
  const jobResult = await request(baseUrl, '/api/ledger/intake', {
    method: 'POST', body: JSON.stringify({ title: `Replacement API job ${suffix}`, clientName: `Replacement API client ${suffix}`, status: 'scheduled', scheduledStart: startsAt, scheduledEnd: endsAt })
  });
  const jobId = jobResult.body.job.id;
  const assignmentResult = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/assignments`, {
    method: 'POST', body: JSON.stringify({ workerId: original.id, role: 'Installer', scheduledStart: startsAt, scheduledEnd: endsAt })
  });
  const assignment = assignmentResult.body.assignment;
  const proposal = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/assignments/${encodeURIComponent(assignment.id)}/replacement`, {
    method: 'POST', body: JSON.stringify({ workerId: candidate.id, availabilityPeriodId: periodResult.body.period.id, reason: 'Current worker has a confirmed capacity conflict.' })
  });
  assert.equal(proposal.response.status, 201);
  assert.equal(proposal.body.assignment.status, 'pending_approval');
  assert.equal(proposal.body.job.assignments.find(item => item.id === assignment.id).status, 'pending_approval');
  const decision = await request(baseUrl, `/api/ledger/approvals/${encodeURIComponent(proposal.body.approval.id)}/resolve`, {
    method: 'POST', body: JSON.stringify({ status: 'approved', resolvedBy: 'forged_different_identity' })
  });
  assert.equal(decision.response.status, 200);
  const finalJob = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}`);
  assert.equal(finalJob.body.job.assignments.find(item => item.id === assignment.id).status, 'released');
  assert.equal(finalJob.body.job.assignments.find(item => item.id === proposal.body.assignment.id).status, 'planned');
});

test('coordinated availability replacement API creates one portfolio approval and resolves assignments together', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await new Promise(resolve => server.close(resolve)); });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = Date.now();
  const startsAt = new Date(Date.now() + 45 * 86_400_000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 6 * 3_600_000).toISOString();
  const createWorker = async name => (await request(baseUrl, '/api/ledger/workers', {
    method: 'POST', body: JSON.stringify({ name: `${name} ${suffix}`, role: 'Installer', status: 'available' })
  })).body.worker;
  const original = await createWorker('Coordinated API original');
  const candidate = await createWorker('Coordinated API replacement');
  const periodResult = await request(baseUrl, `/api/ledger/workers/${encodeURIComponent(original.id)}/availability`, {
    method: 'POST', body: JSON.stringify({ periodType: 'unavailable', title: 'Capacity change', startsAt, endsAt })
  });
  const jobResult = await request(baseUrl, '/api/ledger/intake', {
    method: 'POST', body: JSON.stringify({ title: `Coordinated API job ${suffix}`, clientName: `Coordinated API client ${suffix}`, status: 'scheduled', scheduledStart: startsAt, scheduledEnd: endsAt })
  });
  const jobId = jobResult.body.job.id;
  const assignmentResult = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/assignments`, {
    method: 'POST', body: JSON.stringify({ workerId: original.id, role: 'Installer', scheduledStart: startsAt, scheduledEnd: endsAt })
  });
  const assignment = assignmentResult.body.assignment;
  const proposal = await request(baseUrl, `/api/ledger/workers/${encodeURIComponent(original.id)}/availability/${encodeURIComponent(periodResult.body.period.id)}/replacement-plan`, {
    method: 'POST', body: JSON.stringify({ assignments: [{ assignmentId: assignment.id, workerId: candidate.id }], reason: 'Operational worker availability requires coordinated coverage.' })
  });
  assert.equal(proposal.response.status, 201);
  assert.equal(proposal.body.approval.targetType, 'assignment_replacement_plan');
  assert.equal(proposal.body.approval.jobId, null);
  const replay = await request(baseUrl, `/api/ledger/workers/${encodeURIComponent(original.id)}/availability/${encodeURIComponent(periodResult.body.period.id)}/replacement-plan`, {
    method: 'POST', body: JSON.stringify({ assignments: [{ assignmentId: assignment.id, workerId: candidate.id }], reason: 'Operational worker availability requires coordinated coverage.' })
  });
  assert.equal(replay.response.status, 201);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.approval.id, proposal.body.approval.id);
  assert.equal(replay.body.planId, proposal.body.planId);
  const beforeDecision = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}`);
  assert.equal(beforeDecision.body.job.assignments.find(item => item.id === assignment.id).status, 'pending_approval');
  const decision = await request(baseUrl, `/api/ledger/approvals/${encodeURIComponent(proposal.body.approval.id)}/resolve`, {
    method: 'POST', body: JSON.stringify({ status: 'approved', resolvedBy: 'coordinated_api_approver' })
  });
  assert.equal(decision.response.status, 200);
  const finalJob = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}`);
  assert.equal(finalJob.body.job.assignments.find(item => item.id === assignment.id).status, 'released');
  assert.equal(finalJob.body.job.assignments.find(item => item.workerId === candidate.id).status, 'planned');
});
