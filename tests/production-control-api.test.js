const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-production-api-'));
const tokens = {
  owner: 'production-owner-token-at-least-32-characters',
  approver: 'production-approver-token-at-least-32-characters',
  office_operator: 'production-office-token-at-least-32-characters',
  field_worker: {
    token: 'production-field-token-at-least-32-characters',
    workerId: 'worker-production-field'
  }
};
Object.assign(process.env, {
  NODE_ENV: 'test',
  CONTRACTOR_AI_RUNTIME_MODE: 'local',
  CONTRACTOR_AI_STORAGE_MODE: 'local',
  CONTRACTOR_AI_REQUIRE_AUTH: 'true',
  CONTRACTOR_AI_ROLE_TOKENS: JSON.stringify(tokens),
  STATE_FILE: path.join(directory, 'state.json'),
  LEDGER_DB_FILE: path.join(directory, 'ledger.sqlite'),
  UPLOAD_DIR: path.join(directory, 'uploads')
});
delete process.env.CONTRACTOR_AI_AUTH_TOKEN;
delete process.env.DASHBOARD_AUTH_TOKEN;

const app = require('../server');

async function request(baseUrl, route, token, options = {}) {
  const response = await fetch(`${baseUrl}${route}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers || {})
    }
  });
  const text = await response.text();
  return { response, body: text ? JSON.parse(text) : null };
}

test('production API enforces office baselines, scoped field capture, replay, and approved reversals', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await app.locals.runtimeControl.shutdown({ server, signal: 'production_control_api_test' });
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const worker = await request(baseUrl, '/api/ledger/workers', tokens.office_operator, {
    method: 'POST',
    body: JSON.stringify({ id: tokens.field_worker.workerId, name: 'Production field worker', role: 'Installer', status: 'available', hourlyRate: 62 })
  });
  assert.equal(worker.response.status, 201, JSON.stringify(worker.body));
  const intake = await request(baseUrl, '/api/ledger/intake', tokens.office_operator, {
    method: 'POST',
    body: JSON.stringify({
      title: 'API measured production',
      client: { name: 'API Production Client' },
      status: 'in_progress',
      workerId: tokens.field_worker.workerId,
      assignAutomatically: false
    })
  });
  assert.equal(intake.response.status, 201, JSON.stringify(intake.body));
  const jobId = intake.body.job.id;
  const assignment = await request(baseUrl, `/api/ledger/jobs/${jobId}/assignments`, tokens.office_operator, {
    method: 'POST',
    body: JSON.stringify({ workerId: tokens.field_worker.workerId, role: 'Installer', status: 'assigned' })
  });
  assert.equal(assignment.response.status, 201, JSON.stringify(assignment.body));
  const peerWorkerId = 'worker-production-peer';
  const peerWorker = await request(baseUrl, '/api/ledger/workers', tokens.office_operator, {
    method: 'POST', body: JSON.stringify({ id: peerWorkerId, name: 'Peer production worker', role: 'Finisher', status: 'available', hourlyRate: 74 })
  });
  assert.equal(peerWorker.response.status, 201, JSON.stringify(peerWorker.body));
  const peerAssignment = await request(baseUrl, `/api/ledger/jobs/${jobId}/assignments`, tokens.office_operator, {
    method: 'POST', body: JSON.stringify({ workerId: peerWorkerId, role: 'Finisher', status: 'assigned' })
  });
  assert.equal(peerAssignment.response.status, 201, JSON.stringify(peerAssignment.body));
  const ownTask = await request(baseUrl, `/api/ledger/jobs/${jobId}/tasks`, tokens.office_operator, {
    method: 'POST', body: JSON.stringify({ title: 'Install finish area', assigneeId: tokens.field_worker.workerId })
  });
  assert.equal(ownTask.response.status, 201, JSON.stringify(ownTask.body));
  const peerTask = await request(baseUrl, `/api/ledger/jobs/${jobId}/tasks`, tokens.office_operator, {
    method: 'POST', body: JSON.stringify({ title: 'Install peer trim', assigneeId: peerWorkerId })
  });
  assert.equal(peerTask.response.status, 201, JSON.stringify(peerTask.body));

  const deniedBaseline = await request(baseUrl, `/api/ledger/jobs/${jobId}/production-baselines`, tokens.field_worker.token, {
    method: 'POST', body: JSON.stringify({ lines: [] })
  });
  assert.equal(deniedBaseline.response.status, 403);
  const prepared = await request(baseUrl, `/api/ledger/jobs/${jobId}/production-baselines`, tokens.office_operator, {
    method: 'POST',
    body: JSON.stringify({
      lines: [
        { lineKey: 'installed-area', taskId: ownTask.body.task.id, costCode: 'LAB-AREA', description: 'Installed finish area', unit: 'm2', plannedQuantity: 80, plannedLaborHours: 64 },
        { lineKey: 'peer-trim', taskId: peerTask.body.task.id, costCode: 'LAB-TRIM', description: 'Installed peer trim', unit: 'm', plannedQuantity: 20, plannedLaborHours: 16 },
        { lineKey: 'unlinked-line', costCode: 'LAB-UNLINKED', description: 'Unlinked production scope', unit: 'pcs', plannedQuantity: 30, plannedLaborHours: 12 }
      ]
    })
  });
  assert.equal(prepared.response.status, 201, JSON.stringify(prepared.body));
  assert.equal(prepared.body.baseline.status, 'pending_approval');
  assert.equal(prepared.body.approval.targetType, 'production_baseline');

  const approved = await request(baseUrl, `/api/ledger/approvals/${prepared.body.approval.id}/resolve`, tokens.approver, {
    method: 'POST', body: JSON.stringify({ status: 'approved', reason: 'Production quantity and labor plan checked.' })
  });
  assert.equal(approved.response.status, 200, JSON.stringify(approved.body));

  const fieldRead = await request(baseUrl, `/api/ledger/jobs/${jobId}/production`, tokens.field_worker.token);
  assert.equal(fieldRead.response.status, 200, JSON.stringify(fieldRead.body));
  assert.equal(fieldRead.body.production.activeBaseline.id, prepared.body.baseline.id);
  assert.equal(fieldRead.body.production.activeBaseline.approvalId, undefined);
  assert.equal(fieldRead.body.production.activeBaseline.data, undefined);
  assert.equal(fieldRead.body.production.activeBaseline.snapshotHash, undefined);
  assert.equal(fieldRead.body.production.sourceHash, undefined);
  assert.deepEqual(fieldRead.body.production.activeBaseline.snapshot.lines.map(line => line.lineKey), ['installed-area']);
  assert.equal(fieldRead.body.production.activeBaseline.snapshot.lines[0].plannedLaborHours, undefined);
  assert.equal(fieldRead.body.production.activeBaseline.snapshot.lines[0].costCode, undefined);
  assert.deepEqual(fieldRead.body.production.entries, []);
  const fieldJobDetail = await request(baseUrl, `/api/ledger/jobs/${jobId}`, tokens.field_worker.token);
  assert.equal(fieldJobDetail.response.status, 200, JSON.stringify(fieldJobDetail.body));
  assert.deepEqual(fieldJobDetail.body.job.productionControl.activeBaseline.snapshot.lines.map(line => line.lineKey), ['installed-area']);
  assert.deepEqual(fieldJobDetail.body.job.productionBaselines.map(item => item.id), [prepared.body.baseline.id]);
  assert.equal(JSON.stringify(fieldJobDetail.body.job.productionControl).includes('peer-trim'), false);

  const hiddenPeerLine = await request(baseUrl, `/api/ledger/jobs/${jobId}/production-entries`, tokens.field_worker.token, {
    method: 'POST', body: JSON.stringify({ entryKey: 'production-api-peer-line-0001', baselineId: prepared.body.baseline.id, lineKey: 'peer-trim', workDate: '2026-07-16', quantity: 1, crewHours: 1, note: 'Should not be visible to this position.' })
  });
  assert.equal(hiddenPeerLine.response.status, 403);
  const hiddenUnlinkedLine = await request(baseUrl, `/api/ledger/jobs/${jobId}/production-entries`, tokens.field_worker.token, {
    method: 'POST', body: JSON.stringify({ entryKey: 'production-api-unlinked-0001', baselineId: prepared.body.baseline.id, lineKey: 'unlinked-line', workDate: '2026-07-16', quantity: 1, crewHours: 1, note: 'Unlinked scope must remain blocked.' })
  });
  assert.equal(hiddenUnlinkedLine.response.status, 403);

  const payload = {
    entryKey: 'production-api-field-0001',
    baselineId: prepared.body.baseline.id,
    lineKey: 'installed-area',
    workDate: '2026-07-16',
    quantity: 16,
    crewHours: 24,
    note: 'Scoped crew measured and retained the first installed area.',
    actor: 'spoofed-owner'
  };
  const recorded = await request(baseUrl, `/api/ledger/jobs/${jobId}/production-entries`, tokens.field_worker.token, {
    method: 'POST', body: JSON.stringify(payload)
  });
  assert.equal(recorded.response.status, 201, JSON.stringify(recorded.body));
  assert.equal(recorded.body.entry.replayed, false);
  assert.equal(recorded.body.entry.workerId, tokens.field_worker.workerId);
  assert.equal(recorded.body.entry.data, undefined);
  assert.equal(recorded.body.entry.entryKey, undefined);
  assert.equal(recorded.body.entry.entryFingerprint, undefined);
  assert.equal(recorded.body.production.summary.performanceFactor, 0.5333);
  assert.deepEqual(recorded.body.production.entries.map(entry => entry.id), [recorded.body.entry.id]);
  assert.equal(JSON.stringify(recorded.body.production).includes('Peer production worker'), false);
  assert.equal(recorded.body.production.lines.some(line => line.lineKey === 'peer-trim'), false);
  const replay = await request(baseUrl, `/api/ledger/jobs/${jobId}/production-entries`, tokens.field_worker.token, {
    method: 'POST', body: JSON.stringify(payload)
  });
  assert.equal(replay.response.status, 201, JSON.stringify(replay.body));
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.entry.id, recorded.body.entry.id);
  const conflict = await request(baseUrl, `/api/ledger/jobs/${jobId}/production-entries`, tokens.field_worker.token, {
    method: 'POST', body: JSON.stringify({ ...payload, quantity: 20 })
  });
  assert.equal(conflict.response.status, 409);
  assert.equal(conflict.body.error.code, 'production_entry_key_reused');

  const peerProduction = await request(baseUrl, `/api/ledger/jobs/${jobId}/production-entries`, tokens.office_operator, {
    method: 'POST', body: JSON.stringify({ baselineId: prepared.body.baseline.id, lineKey: 'peer-trim', workDate: '2026-07-16', quantity: 5, crewHours: 10, note: 'Peer crew output retained.', workerId: peerWorkerId, workerName: 'Peer production worker', entryKey: 'production-api-peer-office-0001' })
  });
  assert.equal(peerProduction.response.status, 201, JSON.stringify(peerProduction.body));
  const fieldReadWithPeerData = await request(baseUrl, `/api/ledger/jobs/${jobId}/production`, tokens.field_worker.token);
  assert.equal(fieldReadWithPeerData.response.status, 200, JSON.stringify(fieldReadWithPeerData.body));
  assert.deepEqual(fieldReadWithPeerData.body.production.entries.map(entry => entry.id), [recorded.body.entry.id]);
  assert.deepEqual(fieldReadWithPeerData.body.production.lines.map(line => line.lineKey), ['installed-area']);
  assert.equal(JSON.stringify(fieldReadWithPeerData.body.production).includes('Peer production worker'), false);

  const deniedReversal = await request(baseUrl, `/api/ledger/jobs/${jobId}/production-entries/${recorded.body.entry.id}/reversal`, tokens.field_worker.token, {
    method: 'POST', body: JSON.stringify({ reason: 'Field role cannot reverse retained production.' })
  });
  assert.equal(deniedReversal.response.status, 403);
  const reversal = await request(baseUrl, `/api/ledger/jobs/${jobId}/production-entries/${recorded.body.entry.id}/reversal`, tokens.office_operator, {
    method: 'POST', body: JSON.stringify({ reason: 'The installed quantity was assigned to the wrong cost code.' })
  });
  assert.equal(reversal.response.status, 201, JSON.stringify(reversal.body));
  assert.equal(reversal.body.entry.status, 'pending_reversal');
  const resolved = await request(baseUrl, `/api/ledger/approvals/${reversal.body.approval.id}/resolve`, tokens.approver, {
    method: 'POST', body: JSON.stringify({ status: 'approved', reason: 'Wrong cost-code allocation verified.' })
  });
  assert.equal(resolved.response.status, 200, JSON.stringify(resolved.body));

  const ownerDetail = await request(baseUrl, `/api/ledger/jobs/${jobId}`, tokens.owner);
  assert.equal(ownerDetail.response.status, 200, JSON.stringify(ownerDetail.body));
  assert.equal(ownerDetail.body.job.productionEntries.find(entry => entry.id === recorded.body.entry.id).status, 'reversed');
  assert.equal(ownerDetail.body.job.productionControl.summary.crewHours, 10);
  assert.ok(ownerDetail.body.job.audit.some(event => event.action === 'record_production_output' && event.actor === 'role:field_worker'));

  const capabilities = await request(baseUrl, '/api/operations/capabilities', tokens.owner);
  assert.equal(capabilities.response.status, 200, JSON.stringify(capabilities.body));
  assert.equal(capabilities.body.capabilities.productionControl.earnedHoursCalculation, true);
  assert.equal(capabilities.body.capabilities.productionControl.reversalMode, 'approval_gated_compensating_record');
  assert.equal(capabilities.body.capabilities.requestSafety.productionEntryKey, 'durable');
});
