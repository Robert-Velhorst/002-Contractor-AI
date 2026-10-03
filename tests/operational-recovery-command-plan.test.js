const assert = require('node:assert/strict');
const test = require('node:test');
const { digest, operationalRecoveryFollowUpActions } = require('../operational-recovery');
const { ContractorOperatingLedger } = require('../operating-ledger');

const now = '2026-09-24T10:00:00.000Z';
const dueSoon = '2026-09-27T10:00:00.000Z';

function fixture(cases) {
  const ledger = {
    clock: () => new Date(now),
    db: { prepare: () => ({ all: () => cases }) },
  };
  return ledger;
}

function row({ id, status = 'open', dueAt = dueSoon, snapshot = {} }) {
  return { id, job_id: `job-${id}`, job_title: `Opdracht ${id}`, status,
    snapshot_json: JSON.stringify({ owner: 'Werkvoorbereider', dueAt, recoveryAction: 'Controleer herstel', ...snapshot }),
    snapshot_hash: digest({ owner: 'Werkvoorbereider', dueAt, recoveryAction: 'Controleer herstel', ...snapshot }) };
}

test('daily command plan includes stable case and follow-up reminders across open recoveries', () => {
  const ledger = fixture([row({ id: 'late', dueAt: '2026-09-23T10:00:00.000Z', snapshot: {
    supplierFollowUps: [{ id: 'supplier-1', sourceId: 'receipt-1', status: 'no_response', nextFollowUpAt: '2026-09-24T09:00:00.000Z', recordedAt: '2026-09-22T10:00:00.000Z' }],
    clientImpactReviews: [{ id: 'client-1', sourceId: 'absence-1', appointment: { id: 'visit-1' }, status: 'awaiting_customer', nextFollowUpAt: '2026-09-25T10:00:00.000Z', recordedAt: '2026-09-23T10:00:00.000Z' }],
    costImpactReviews: [{ id: 'cost-1', status: 'unknown', nextFollowUpAt: '2026-09-26T10:00:00.000Z', recordedAt: '2026-09-23T10:00:00.000Z' }],
  } })]);

  const first = operationalRecoveryFollowUpActions(ledger);
  const replay = operationalRecoveryFollowUpActions(ledger);
  assert.deepEqual(first.map(action => action.id), replay.map(action => action.id));
  assert.deepEqual(first.map(action => action.data.followUpType).sort(), ['client_response', 'cost_review', 'recovery_case', 'supplier_response']);
  assert.ok(first.every(action => action.actionType === 'review_operational_recovery' && !action.safeDraftable && !action.requiresApproval));
  assert.ok(first.every(action => action.jobId === 'job-late' && action.data.recoveryCaseId === 'late'));
  assert.equal(first.find(action => action.data.followUpType === 'recovery_case').severity, 'high');
});

test('only the latest follow-up per source is added and resolved cases are ignored', () => {
  const ledger = fixture([
    row({ id: 'resolved', status: 'resolved', dueAt: '2026-09-23T10:00:00.000Z' }),
    row({ id: 'current', dueAt: '2026-10-03T10:00:00.000Z', snapshot: { supplierFollowUps: [
      { id: 'old', sourceId: 'receipt-1', status: 'no_response', nextFollowUpAt: '2026-09-20T10:00:00.000Z', recordedAt: '2026-09-19T10:00:00.000Z' },
      { id: 'new', sourceId: 'receipt-1', status: 'contact_recorded', recordedAt: '2026-09-23T10:00:00.000Z' },
    ], costImpactReviews: [
      { id: 'cost-old', status: 'unknown', nextFollowUpAt: '2026-09-20T10:00:00.000Z', recordedAt: '2026-09-19T10:00:00.000Z' },
      { id: 'cost-new', status: 'estimate', recordedAt: '2026-09-23T10:00:00.000Z' }
    ] } }),
  ]);

  const actions = operationalRecoveryFollowUpActions(ledger);
  assert.deepEqual(actions, []);
});

test('integrity failures surface as blocked review actions without exposing corrupted snapshots', () => {
  const corrupted = row({ id: 'tampered' });
  corrupted.snapshot_json = JSON.stringify({ owner: 'Secret value', recoveryAction: 'Tampered instructions' });
  const actions = operationalRecoveryFollowUpActions(fixture([corrupted]));
  assert.equal(actions.length, 1);
  assert.equal(actions[0].blocked, true);
  assert.equal(actions[0].severity, 'critical');
  assert.doesNotMatch(actions[0].message, /Secret value|Tampered instructions/);
});

test('future follow-ups outside the review horizon are not placed on today queue', () => {
  const ledger = fixture([row({ id: 'distant', dueAt: '2026-10-10T10:00:00.000Z' })]);
  assert.deepEqual(operationalRecoveryFollowUpActions(ledger), []);
});

test('the ledger workbench publishes due recovery reviews as non-executable job actions', t => {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:', clock: () => new Date(now) });
  t.after(() => ledger.close());
  const job = ledger.createIntake({ title: 'Verlopen herstelcontrole', client: { name: 'Klant' }, assignAutomatically: false });
  const snapshot = { owner: 'Planner', dueAt: '2026-09-23T10:00:00.000Z', recoveryAction: 'Herstel controleren', sources: [],
    supplierFollowUps: [], clientImpactReviews: [], clientDateImpactReviews: [] };
  ledger.db.prepare(`INSERT INTO operational_recovery_cases
    (id,job_id,status,source_hash,snapshot_json,snapshot_hash,created_by,created_at,updated_at,resolved_at)
    VALUES (?,?,?,?,?,?,?,?,?,NULL)`).run('case-due-review', job.id, 'open', 'a'.repeat(64), JSON.stringify(snapshot), digest(snapshot),
    'test', now, now);

  const result = ledger.buildTodayCommandPlan({ stream: 'operations', jobLimit: 1, includeCapabilities: false, limit: 100 });
  const action = result.actions.find(item => item.sourceId === 'case-due-review');
  assert.ok(action);
  assert.equal(action.actionType, 'review_operational_recovery');
  assert.equal(action.safeDraftable, false);
  assert.equal(action.requiresApproval, false);
  assert.equal(action.severity, 'high');
  const apply = ledger.applyTodayCommandPlan({ actionId: action.id, jobId: job.id, limit: 1 });
  assert.equal(apply.summary.applied, 0);
  assert.equal(apply.summary.skipped, 1);
});
