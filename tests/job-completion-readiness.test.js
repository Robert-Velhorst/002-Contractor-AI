const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const stateDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-job-completion-'));
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

async function createJob(baseUrl, title) {
  const result = await request(baseUrl, '/api/ledger/intake', {
    method: 'POST',
    body: JSON.stringify({ title, service: 'renovation', status: 'in_progress', progressPercent: 80, assignAutomatically: false })
  });
  assert.equal(result.response.status, 201);
  return result.body.job.id;
}

async function completeOpenTasks(baseUrl, jobId) {
  const detail = await request(baseUrl, `/api/ledger/jobs/${jobId}`);
  assert.equal(detail.response.status, 200);
  for (const task of detail.body.job.tasks.filter(item => !['completed', 'cancelled'].includes(item.status))) {
    const result = await request(baseUrl, `/api/ledger/jobs/${jobId}/lifecycle/task/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'completed', notes: 'Verified task outcome for completion readiness test.' })
    });
    assert.equal(result.response.status, 200, JSON.stringify(result.body));
  }
}

test('operational completion is blocked by open work and rechecked against changed evidence', async t => {
  const server = app.listen(0);
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  const blockedJobId = await createJob(baseUrl, 'Completion blocked by active task');
  const task = await request(baseUrl, `/api/ledger/jobs/${blockedJobId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Finish bathroom tiling', status: 'in_progress', durationHours: 4 })
  });
  assert.equal(task.response.status, 201);

  const blockedProposal = await request(baseUrl, `/api/ledger/jobs/${blockedJobId}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'completed', progressPercent: 100, reason: 'Field team reported work complete.' })
  });
  assert.equal(blockedProposal.response.status, 200);
  assert.equal(blockedProposal.body.approval.decision.preview.completionReadiness.ready, false);
  assert.ok(blockedProposal.body.approval.decision.preview.completionReadiness.blockers.some(item => item.code === 'work_tasks_open'));

  const blockedResolution = await request(baseUrl, `/api/ledger/approvals/${blockedProposal.body.approval.id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ status: 'approved', resolvedBy: 'Completion reviewer' })
  });
  assert.equal(blockedResolution.response.status, 409);
  assert.equal(blockedResolution.body.error.code, 'job_completion_not_ready');
  const retainedBlockedJob = await request(baseUrl, `/api/ledger/jobs/${blockedJobId}`);
  assert.notEqual(retainedBlockedJob.body.job.status, 'completed');
  assert.equal(retainedBlockedJob.body.job.approvals.find(item => item.id === blockedProposal.body.approval.id).status, 'pending');

  const staleJobId = await createJob(baseUrl, 'Completion readiness changes before approval');
  await completeOpenTasks(baseUrl, staleJobId);
  const openSelection = await request(baseUrl, `/api/ledger/jobs/${staleJobId}/client-selections`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Confirm paint finish', category: 'finish', options: ['matte', 'satin'], status: 'pending_client' })
  });
  assert.equal(openSelection.response.status, 201);
  const invoice = await request(baseUrl, `/api/ledger/jobs/${staleJobId}/invoices`, {
    method: 'POST',
    body: JSON.stringify({ amount: 250, taxRate: 21, dueAt: '2026-10-10T00:00:00.000Z' })
  });
  assert.equal(invoice.response.status, 201);
  const readyProposal = await request(baseUrl, `/api/ledger/jobs/${staleJobId}`, {
    method: 'PUT',
    body: JSON.stringify({ status: 'completed', progressPercent: 100, reason: 'Operational work is reported complete.' })
  });
  assert.equal(readyProposal.response.status, 200);
  assert.equal(readyProposal.body.approval.decision.preview.completionReadiness.ready, true, JSON.stringify(readyProposal.body.approval.decision.preview.completionReadiness));
  assert.equal(readyProposal.body.approval.decision.preview.completionReadiness.separation.paymentRequiredForOperationalCompletion, false);
  assert.ok(readyProposal.body.approval.decision.preview.completionReadiness.warnings.some(item => item.code === 'client_decisions_open'));
  assert.ok(readyProposal.body.approval.decision.preview.completionReadiness.warnings.some(item => item.code === 'receivables_open'));
  const closeout = await request(baseUrl, `/api/ledger/jobs/${staleJobId}/closeout-assessment`);
  assert.equal(closeout.response.status, 200, JSON.stringify(closeout.body));
  assert.equal(closeout.body.assessment.readOnly, true);
  assert.equal(closeout.body.assessment.sections.operational.status, 'work_in_progress');
  assert.equal(closeout.body.assessment.sections.handover.status, 'blocked');
  assert.equal(closeout.body.assessment.sections.client.state, 'awaiting_response');
  assert.equal(closeout.body.assessment.sections.commercial.status, 'open_items');
  assert.equal(closeout.body.assessment.sections.commercial.openSelections[0].id, openSelection.body.clientSelection.id);
  assert.equal(closeout.body.assessment.sections.finance.status, 'balances_open');
  assert.equal(closeout.body.assessment.sections.finance.receivables[0].outstandingAmount, invoice.body.invoice.total);
  assert.equal(closeout.body.assessment.determinations.legalAcceptance, 'not_determined');
  assert.equal(closeout.body.assessment.determinations.contractualClosure, 'not_determined');
  assert.equal(closeout.body.assessment.determinations.paymentRelease, 'not_determined');
  assert.equal(closeout.body.assessment.status, 'follow_up_required');

  const lateTask = await request(baseUrl, `/api/ledger/jobs/${staleJobId}/tasks`, {
    method: 'POST',
    body: JSON.stringify({ title: 'Verified completed follow-on task', status: 'completed', durationHours: 2 })
  });
  assert.equal(lateTask.response.status, 201);
  const staleResolution = await request(baseUrl, `/api/ledger/approvals/${readyProposal.body.approval.id}/resolve`, {
    method: 'POST',
    body: JSON.stringify({ status: 'approved', resolvedBy: 'Completion reviewer' })
  });
  assert.equal(staleResolution.response.status, 409);
  assert.equal(staleResolution.body.error.code, 'job_completion_readiness_changed');
  const retainedStaleJob = await request(baseUrl, `/api/ledger/jobs/${staleJobId}`);
  assert.notEqual(retainedStaleJob.body.job.status, 'completed');
  assert.equal(retainedStaleJob.body.job.approvals.find(item => item.id === readyProposal.body.approval.id).status, 'pending');
});
