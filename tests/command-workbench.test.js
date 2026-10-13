const assert = require('node:assert/strict');
const test = require('node:test');
const { ContractorOperatingLedger } = require('../operating-ledger');

function commandLedger() {
  const ledger = Object.create(ContractorOperatingLedger.prototype);
  ledger.db = { prepare: () => ({ all: () => [] }) };
  ledger.listJobs = () => [];
  ledger.listApprovals = () => [];
  ledger.nextActions = () => Array.from({ length: 35 }, (_, index) => ({
    type: index % 2 ? 'draft_invoice' : 'review_worker_capacity',
    sourceId: String(index),
    jobType: String(index),
    message: `Task ${String(index).padStart(2, '0')}`,
    severity: 'high',
    requiresApproval: index % 3 === 0,
  }));
  return ledger;
}

test('workbench pages have stable order, matching counts and no overlap', () => {
  const ledger = commandLedger();
  const first = ledger.buildTodayCommandPlan({ limit: 10 });
  const second = ledger.buildTodayCommandPlan({ limit: 10, offset: 10 });
  assert.equal(first.summary.total, 35);
  assert.deepEqual(first.pagination, { offset: 0, limit: 10, returned: 10, matching: 35, hasMore: true });
  assert.equal(new Set([...first.actions, ...second.actions].map(row => row.id)).size, 20);
  const last = ledger.buildTodayCommandPlan({ limit: 10, offset: 30 });
  assert.equal(last.actions.length, 5);
  assert.equal(last.pagination.hasMore, false);
  assert.equal(ledger.buildTodayCommandPlan({ offset: -100, limit: 10 }).pagination.offset, 0);
});

test('workbench combines stream, decision and search filters before pagination', () => {
  const ledger = commandLedger();
  const plan = ledger.buildTodayCommandPlan({ stream: 'finance', mode: 'approval', search: 'Task', limit: 2 });
  assert.equal(plan.summary.total, 35);
  assert.equal(plan.summary.matching, 6);
  assert.equal(plan.matchingSummary.approvalRequired, 6);
  assert.ok(plan.actions.every(row => row.stream === 'finance' && row.requiresApproval));
  assert.equal(plan.pagination.hasMore, true);
  assert.equal(plan.scope.readinessJobLimit, 12);
  assert.equal(plan.scope.completeAudit, false);
});

test('blocked internal drafts never count as runnable work', () => {
  const ledger = commandLedger();
  const summary = ledger.commandPlanSummary([
    { safeDraftable: true, blocked: true },
    { safeDraftable: true, blocked: false },
  ]);
  assert.equal(summary.runnableDrafts, 1);
});

test('independent opportunity follow-ups never collapse into one company action', () => {
  const ledger = commandLedger();
  ledger.nextActions = () => [
    { type: 'draft_opportunity_follow_up', opportunityId: 'lead-a', title: 'Extension', message: 'Follow up extension' },
    { type: 'draft_opportunity_follow_up', opportunityId: 'lead-b', title: 'Renovation', message: 'Follow up renovation' },
  ];
  const plan = ledger.buildTodayCommandPlan();
  assert.equal(plan.actions.length, 2);
  assert.equal(new Set(plan.actions.map(action => action.id)).size, 2);
  assert.deepEqual(new Set(plan.actions.map(action => action.data.opportunityId)), new Set(['lead-a', 'lead-b']));
});

test('applying a selected command revalidates it and rejects blocked or stale work', () => {
  const ledger = commandLedger();
  ledger.assertAutomationActive = () => {};
  ledger.audit = () => {};
  ledger.dashboardSummary = () => ({});
  let runs = 0;
  ledger.runAutonomousCycle = () => { runs += 1; return { applied: [], blocked: [] }; };
  const actions = ledger.nextActions();
  actions[1].blocked = true;
  ledger.nextActions = () => actions;
  const blocked = ledger.buildTodayCommandPlan().actions.find(row => row.blocked);
  const result = ledger.applyTodayCommandPlan({ actionIds: [blocked.id, 'stale-command'], limit: 2 });
  assert.equal(runs, 0);
  assert.equal(result.summary.applied, 0);
  assert.equal(result.summary.skipped, 2);
});

test('an explicitly selected command is resolved before the preview page limit', () => {
  const ledger = commandLedger();
  const actions = Array.from({ length: 120 }, (_, index) => ({
    type: 'draft_invoice', jobType: String(index), message: `Invoice ${String(index).padStart(3, '0')}`,
  }));
  ledger.nextActions = () => actions;
  const id = ledger.buildTodayCommandPlan({ offset: 110 }).actions[0].id;
  ledger.assertAutomationActive = () => {};
  ledger.audit = () => {};
  ledger.dashboardSummary = () => ({});
  ledger.runAutonomousCycle = () => ({ applied: [{ type: 'draft_invoice' }], blocked: [] });
  const result = ledger.applyTodayCommandPlan({ actionId: id, limit: 1 });
  assert.deepEqual(result.selected.map(row => row.id), [id]);
});
