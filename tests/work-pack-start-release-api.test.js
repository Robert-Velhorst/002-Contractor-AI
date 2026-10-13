const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-start-release-api-'));
const tokens = {
  owner: 'start-release-owner-token-at-least-32-characters',
  approver: 'start-release-approver-token-at-least-32-characters',
  office: 'start-release-office-token-at-least-32-characters',
  field: { token: 'start-release-field-token-at-least-32-characters', workerId: 'start-release-field-worker' }
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
  return { response, body: await response.json() };
}

test('start-release API restricts issuance to owner or approver and keeps worker actions identity-bound', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await app.locals.runtimeControl.shutdown({ server, signal: 'start_release_api_test' });
    fs.rmSync(stateDirectory, { recursive: true, force: true });
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const job = await request(baseUrl, '/api/ledger/intake', {
    method: 'POST', body: JSON.stringify({ title: `Start release API ${Date.now()}`, assignAutomatically: false })
  });
  assert.equal(job.response.status, 201);
  const jobId = job.body.job.id;
  assert.equal((await request(baseUrl, '/api/ledger/workers', {
    method: 'POST', body: JSON.stringify({ id: tokens.field.workerId, name: 'Named start-release worker', role: 'Carpenter', status: 'available' })
  })).response.status, 201);
  assert.equal((await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/assignments`, {
    method: 'POST', body: JSON.stringify({ workerId: tokens.field.workerId, role: 'Carpenter', status: 'assigned' })
  })).response.status, 201);
  const pack = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/work-pack?workerId=${encodeURIComponent(tokens.field.workerId)}`);
  assert.equal(pack.response.status, 200);

  const payload = {
    workerId: tokens.field.workerId,
    assignmentId: pack.body.pack.assignments[0].id,
    sourceHash: pack.body.pack.sourceHash,
    entryKey: 'start-release-api-entry',
    reason: 'Supervisor completed the site review.',
    evidenceReference: 'briefing:api-test',
    checks: ['siteConditionsChecked', 'methodAndControlsReviewed', 'requiredPermitsConfirmed', 'crewAndQualificationsChecked', 'equipmentAndPpeAvailable', 'emergencyArrangementsKnown'],
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString()
  };
  const officeDenied = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/work-pack/start-release`, {
    method: 'POST', body: JSON.stringify(payload)
  });
  assert.equal(officeDenied.response.status, 403);
  const fieldDenied = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/work-pack/start-release`, {
    method: 'POST', token: tokens.field.token, body: JSON.stringify(payload)
  });
  assert.equal(fieldDenied.response.status, 403);

  for (const token of [tokens.owner, tokens.approver]) {
    const deniedByReadiness = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/work-pack/start-release`, {
      method: 'POST', token, body: JSON.stringify(payload)
    });
    assert.equal(deniedByReadiness.response.status, 409);
    assert.equal(deniedByReadiness.body.error.code, 'start_release_blocked');
    assert.ok(deniedByReadiness.body.error.details.blockers.length > 0);
  }

  const fieldAcknowledgmentWithoutRelease = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/work-pack/start-release/acknowledgment`, {
    method: 'POST', token: tokens.field.token,
    body: JSON.stringify({ entryKey: 'release-ack-api', releaseId: 'missing', sourceHash: pack.body.pack.sourceHash, understood: true })
  });
  assert.equal(fieldAcknowledgmentWithoutRelease.response.status, 409);
  const foreignWorker = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/work-pack/start-release/acknowledgment`, {
    method: 'POST', token: tokens.field.token,
    body: JSON.stringify({ workerId: 'different-worker', entryKey: 'release-ack-forged', releaseId: 'missing', sourceHash: pack.body.pack.sourceHash, understood: true })
  });
  assert.equal(foreignWorker.response.status, 409);
  const workerStopWithoutRelease = await request(baseUrl, `/api/ledger/jobs/${encodeURIComponent(jobId)}/work-pack/start-release/revoke`, {
    method: 'POST', token: tokens.field.token,
    body: JSON.stringify({ workerId: 'different-worker', releaseId: 'missing', entryKey: 'release-stop-api', reason: 'Unsafe condition.' })
  });
  assert.equal(workerStopWithoutRelease.response.status, 404);
});
