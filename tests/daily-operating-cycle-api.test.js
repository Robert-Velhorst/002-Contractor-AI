const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-daily-cycle-api-'));
const tokens = {
  owner: 'daily-cycle-owner-token-at-least-32-characters',
  approver: 'daily-cycle-approver-token-at-least-32-characters',
  office: 'daily-cycle-office-token-at-least-32-characters',
  field: { token: 'daily-cycle-field-token-at-least-32-characters', workerId: 'worker-daily-cycle-lead' }
};
Object.assign(process.env, {
  NODE_ENV: 'test',
  CONTRACTOR_AI_RUNTIME_MODE: 'local',
  CONTRACTOR_AI_STORAGE_MODE: 'local',
  CONTRACTOR_AI_REQUIRE_AUTH: 'true',
  CONTRACTOR_AI_ROLE_TOKENS: JSON.stringify({ owner: tokens.owner, approver: tokens.approver, office_operator: tokens.office, field_worker: tokens.field }),
  STATE_FILE: path.join(stateDirectory, 'state.json'),
  LEDGER_DB_FILE: path.join(stateDirectory, 'ledger.sqlite'),
  UPLOAD_DIR: path.join(stateDirectory, 'uploads')
});

const app = require('../server');

async function request(baseUrl, route, options = {}) {
  const { token = tokens.office, ...requestOptions } = options;
  const response = await fetch(`${baseUrl}${route}`, {
    ...requestOptions,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) }
  });
  const body = await response.json();
  return { response, body };
}

test('daily-cycle API enforces field identity and retains approval, export, capability, and autonomy evidence', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await app.locals.runtimeControl.shutdown({ server, signal: 'daily_cycle_api_test' });
    fs.rmSync(stateDirectory, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const suffix = Date.now();
  const intake = await request(baseUrl, '/api/ledger/intake', {
    method: 'POST',
    body: JSON.stringify({
      title: `Daily cycle API ${suffix}`,
      clientName: `Daily cycle client ${suffix}`,
      status: 'scheduled',
      assignAutomatically: false
    })
  });
  assert.equal(intake.response.status, 201);
  const jobId = intake.body.job.id;
  const assignmentStart = new Date(Date.now() - 45 * 60_000).toISOString();
  const assignmentEnd = new Date(Date.now() + 6 * 60 * 60_000).toISOString();
  const worker = await request(baseUrl, '/api/ledger/workers', {
    method: 'POST',
    body: JSON.stringify({ id: tokens.field.workerId, name: 'Field daily cycle lead', role: 'Site lead', status: 'available', hourlyRate: 66 })
  });
  assert.equal(worker.response.status, 201);
  const assignment = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/assignments`, {
    method: 'POST',
    body: JSON.stringify({ workerId: tokens.field.workerId, role: 'Site lead', status: 'assigned', scheduledStart: assignmentStart, scheduledEnd: assignmentEnd })
  });
  assert.equal(assignment.response.status, 201);

  const huddlePayload = {
    entryKey: `daily-huddle-api-${suffix}`,
    workDate: new Date().toISOString().slice(0, 10),
    facilitator: 'Spoofed facilitator',
    workerIds: ['different-worker'],
    plannedWork: 'Install and inspect the retained ground-floor service wall.',
    productionTarget: 'Complete twelve linear metres.',
    weather: 'cloudy',
    siteConditions: 'Occupied corridor remains protected.',
    safetyFocus: 'Keep the occupied corridor separated from the work zone.',
    qualityHoldPoints: ['Services checked before boarding'],
    constraints: ['Client access at 12:00'],
    evidenceReference: `huddle-api-evidence-${suffix}`
  };
  const started = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/daily-cycles`, {
    token: tokens.field.token,
    method: 'POST',
    body: JSON.stringify(huddlePayload)
  });
  assert.equal(started.response.status, 201);
  assert.equal(started.body.cycle.status, 'released');
  assert.equal(started.body.cycle.facilitator, 'Field daily cycle lead');
  assert.equal(started.body.cycle.leadWorkerId, tokens.field.workerId);
  assert.deepEqual(started.body.cycle.crew.map(member => member.workerId), [tokens.field.workerId]);
  assert.equal(started.body.cycle.crew[0].assignmentId, assignment.body.assignment.id, JSON.stringify(started.body.cycle.crew[0]));
  assert.equal(started.body.cycle.sourceHash, undefined);
  assert.equal(started.body.cycle.huddleSourceHash, undefined);
  assert.equal(started.body.externalCommitments, 0);

  const workerCannotConfirm = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/assignments/${encodeURIComponent(assignment.body.assignment.id)}/confirm-missing-checkin-unavailable`, {
    token: tokens.field.token, method: 'POST', body: JSON.stringify({ sourceHash: 'a'.repeat(64) })
  });
  assert.equal(workerCannotConfirm.response.status, 403);
  const officeCannotUseStaleSource = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/assignments/${encodeURIComponent(assignment.body.assignment.id)}/confirm-missing-checkin-unavailable`, {
    token: tokens.office, method: 'POST', body: JSON.stringify({ sourceHash: '0'.repeat(64) })
  });
  assert.equal(officeCannotUseStaleSource.response.status, 409);

  const dashboard = await request(baseUrl, '/api/ledger/dashboard', { token: tokens.office });
  const cycleReview = dashboard.body.dashboard.nextActions.find(action => action.type === 'review_daily_cycle'
    && action.actionKind === 'end_of_day_missing' && action.cycleId === started.body.cycle.id);
  assert.equal(dashboard.response.status, 200);
  assert.ok(cycleReview, JSON.stringify(dashboard.body.dashboard.nextActions.filter(action => action.type === 'review_daily_cycle')));
  assert.equal(cycleReview.huddleSnapshot, undefined);

  const peerWorker = await request(baseUrl, '/api/ledger/workers', {
    method: 'POST', body: JSON.stringify({ id: 'worker-daily-cycle-peer', name: 'Peer cycle lead', role: 'Electrician', status: 'available' })
  });
  assert.equal(peerWorker.response.status, 201);
  const peerAssignment = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/assignments`, {
    method: 'POST', body: JSON.stringify({ workerId: 'worker-daily-cycle-peer', role: 'Electrician', status: 'assigned' })
  });
  assert.equal(peerAssignment.response.status, 201);
  const peerCycle = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/daily-cycles`, {
    method: 'POST',
    body: JSON.stringify({
      entryKey: `peer-daily-huddle-api-${suffix}`, workDate: new Date().toISOString().slice(0, 10), shiftLabel: 'late shift',
      facilitator: 'Peer cycle lead', leadWorkerId: 'worker-daily-cycle-peer', workerIds: ['worker-daily-cycle-peer'],
      plannedWork: 'Complete the separate electrical installation zone.', productionTarget: 'Inspect six distribution points.',
      safetyFocus: 'Isolate electrical equipment before access.', evidenceReference: `peer-huddle-evidence-${suffix}`
    })
  });
  assert.equal(peerCycle.response.status, 201, JSON.stringify(peerCycle.body));

  const replay = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/daily-cycles`, {
    token: tokens.field.token,
    method: 'POST',
    body: JSON.stringify(huddlePayload)
  });
  assert.equal(replay.response.status, 201);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.cycle.id, started.body.cycle.id);

  const listed = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/daily-cycles`, { token: tokens.field.token });
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.cycles.length, 1);
  assert.equal(listed.body.cycles.some(cycle => cycle.id === peerCycle.body.cycle.id), false);
  assert.equal(listed.body.cycles[0].data, undefined);
  assert.equal(listed.body.cycles[0].huddleSnapshot, undefined);

  const eodPayload = {
    entryKey: `daily-eod-api-${suffix}`,
    workerId: 'spoofed-worker',
    hours: 8,
    manpower: 2,
    weather: 'cloudy',
    workCompleted: 'Completed and checked the full ground-floor service wall.',
    blockers: [],
    safetyConcern: false,
    planAchieved: true,
    varianceReasons: [],
    unresolvedActions: ['Confirm tomorrow delivery at the gate'],
    tomorrowPlan: 'Receive materials and start the first-floor service wall.',
    evidenceReferences: [`progress-photo-api-${suffix}`]
  };
  const peerCycleClose = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/daily-cycles/${encodeURIComponent(peerCycle.body.cycle.id)}/end-of-day`, {
    token: tokens.field.token, method: 'POST', body: JSON.stringify({ ...eodPayload, entryKey: `peer-daily-eod-api-${suffix}` })
  });
  assert.equal(peerCycleClose.response.status, 403);
  assert.equal(peerCycleClose.body.error.code, 'field_daily_cycle_scope_forbidden');
  const closed = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/daily-cycles/${encodeURIComponent(started.body.cycle.id)}/end-of-day`, {
    token: tokens.field.token,
    method: 'POST',
    body: JSON.stringify(eodPayload)
  });
  assert.equal(closed.response.status, 201);
  assert.equal(closed.body.cycle.status, 'pending_approval');
  assert.equal(closed.body.dailyLog.timeLog.workerId, tokens.field.workerId);
  assert.equal(closed.body.dailyLog.approvals, 1);
  assert.equal(closed.body.externalCommitments, 0);

  const approvalId = (await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}`, { token: tokens.office })).body.job
    .dailyOperatingCycles[0].approvalId;
  const approved = await request(baseUrl, `/api/ledger/approvals/${encodeURIComponent(approvalId)}/resolve`, {
    token: tokens.approver,
    method: 'POST',
    body: JSON.stringify({ status: 'approved', resolvedBy: 'daily-api-approver', reason: 'Daily source evidence verified.' })
  });
  assert.equal(approved.response.status, 200);
  const detail = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}`, { token: tokens.office });
  assert.equal(detail.body.job.dailyOperatingCycles[0].status, 'closed');
  assert.equal(detail.body.job.dailyOperatingCycles[0].integrityValid, true);

  const secondIntake = await request(baseUrl, '/api/ledger/intake', {
    method: 'POST',
    body: JSON.stringify({ title: `Daily cycle autonomy ${suffix}`, clientName: 'Autonomy client', status: 'scheduled', assignAutomatically: false })
  });
  assert.equal(secondIntake.response.status, 201);
  const preview = await request(baseUrl, '/api/ledger/autonomous-cycle', {
    token: tokens.owner,
    method: 'POST',
    body: JSON.stringify({ dryRun: true, actionTypes: ['review_daily_cycle'], jobIds: [secondIntake.body.job.id] })
  });
  assert.equal(preview.response.status, 200);
  assert.ok(preview.body.preview.some(action => action.type === 'review_daily_cycle' && action.actionKind === 'start_huddle_missing'));
  assert.equal(preview.body.summary.externalCommitments, 0);

  const capabilities = await request(baseUrl, '/api/operations/capabilities', { token: tokens.owner });
  assert.equal(capabilities.response.status, 200);
  assert.equal(capabilities.body.capabilities.dailyOperatingCycles.exactReplay, true);
  assert.equal(capabilities.body.capabilities.dailyOperatingCycles.externalCommitments, 0);
  const operationalExport = await request(baseUrl, '/api/operations/export', { token: tokens.owner });
  assert.equal(operationalExport.response.status, 200);
  assert.equal(operationalExport.body.dailyOperatingCycles.length, 2);
  const diagnostics = await request(baseUrl, '/api/ledger/debug', { token: tokens.owner });
  assert.equal(diagnostics.response.status, 200);
  assert.equal(diagnostics.body.diagnostics.valid, true, JSON.stringify(diagnostics.body.diagnostics.issues));
  assert.equal(diagnostics.body.diagnostics.migrations.currentVersion, '097_durable_evidence_storage_reservations');
  assert.equal(diagnostics.body.diagnostics.counts.dailyOperatingCycles, 2);
});
