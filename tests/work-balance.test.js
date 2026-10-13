const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { WorkBalance, TABLES, verifyWorkBalance } = require('../work-balance');
const { setupDelivery } = require('./work-delivery-contract');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'work-balance-test-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => { ledger.close(); assert.ok(path.basename(directory).startsWith('work-balance-test-')); fs.rmSync(directory, { recursive: true, force: true }); });
  return ledger;
}

function requestPlan(balance, jobId, packageId, allocations, overrides = {}) {
  const view = balance.read(jobId);
  return balance.command(jobId, { action: 'plan', entryKey: randomUUID(), sourceHash: view.sourceHash,
    record: { scopeConfirmed: true, reference: 'Goedgekeurde grondslag en werkpakket WP-01', reason: 'Uitvoering per werkpakket controleerbaar verdelen.', allocations,
      ...overrides } }, 'work-balance-office');
}

test('approved exact allocation reconciles with retained production and gates position publication', t => {
  const ledger = fixture(t), f = setupDelivery(ledger), balance = new WorkBalance(ledger);
  const allocation = [{ lineKey: 'doors', packageId: f.pack.id, plannedQuantity: 2 }];
  assert.throws(() => requestPlan(balance, f.job.id, f.pack.id, [{ ...allocation[0], plannedQuantity: 1.9999 }]), { statusCode: 400 });
  assert.throws(() => requestPlan(balance, f.job.id, f.pack.id, allocation, { scopeConfirmed: false }), { statusCode: 400 });

  const command = { action: 'plan', entryKey: randomUUID(), sourceHash: balance.read(f.job.id).sourceHash,
    record: { scopeConfirmed: true, reference: 'Goedgekeurde grondslag en werkpakket WP-01', reason: 'Uitvoering per werkpakket controleerbaar verdelen.', allocations: allocation } };
  const pending = balance.command(f.job.id, command, 'work-balance-office');
  assert.deepEqual(balance.command(f.job.id, command, 'work-balance-office'), { ...pending, replayed: true });
  assert.throws(() => balance.command(f.job.id, { ...command, record: { ...command.record, reason: 'Gewijzigde aanvraag' } }, 'work-balance-office'), { statusCode: 409 });
  assert.throws(() => balance.positionBasis(f.job.id, f.pack.id), { statusCode: 409 });
  ledger.resolveApproval(pending.approvalId, { status: 'approved', resolvedBy: 'work-balance-reviewer', reason: 'Verdeling met opdrachtgever gecontroleerd.' });

  const current = balance.read(f.job.id);
  assert.equal(current.state, 'reconciliation_required');
  assert.equal(current.lines[0].unallocatedQuantity, 1);
  assert.equal(current.packages[0].canOffer, false);
  const delivered = f.command('retain', { ...f.input, title: 'Eerste deur geplaatst' });
  assert.ok(delivered.deliveryId);
  const reconciled = balance.read(f.job.id);
  assert.equal(reconciled.state, 'current');
  assert.equal(reconciled.lines[0].unallocatedQuantity, 0);
  assert.equal(reconciled.packages[0].rows[0].allocatedOutputQuantity, 1);
  assert.equal(reconciled.packages[0].rows[0].remainingQuantity, 1);
  const basis = balance.positionBasis(f.job.id, f.pack.id);
  assert.equal(basis.scope[0], 'Deuren: 1 st');
  assert.equal(basis.remainingLaborEstimate, 4);

  const field = f.field.read(f.job.id, f.worker.id);
  assert.equal(field.know.workContext.balance[0].rows[0].remainingQuantity, 1);
  for (const secret of ['baselineId', 'sourceReference', 'private-client@example.test', 'work-balance-office']) assert.equal(JSON.stringify(field).includes(secret), false);
  const second = f.produce('after-plan');
  assert.ok(second.id);
  assert.throws(() => balance.positionBasis(f.job.id, f.pack.id), { statusCode: 409 });
  assert.equal(verifyWorkBalance(ledger.db), true);
  assert.equal(ledger.diagnose().issues.some(issue => /Work balance/.test(issue.message)), false);
});

test('approval rejects a changed work-package source and remains pending until explicit rejection', t => {
  const ledger = fixture(t), f = setupDelivery(ledger), balance = new WorkBalance(ledger);
  const pending = requestPlan(balance, f.job.id, f.pack.id, [{ lineKey: 'doors', packageId: f.pack.id, plannedQuantity: 2 }]);
  f.context.command(f.job.id, { action: 'save_package', record: { ...f.context.read(f.job.id).packages[0], title: 'Gewijzigd werkpakket' },
    sourceHash: f.context.read(f.job.id).sourceHash, entryKey: randomUUID() }, 'context-office');
  assert.throws(() => ledger.resolveApproval(pending.approvalId, { status: 'approved', resolvedBy: 'reviewer' }), { statusCode: 409 });
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(pending.approvalId).status, 'pending');
  ledger.resolveApproval(pending.approvalId, { status: 'rejected', resolvedBy: 'reviewer' });
  assert.equal(balance.read(f.job.id).state, 'allocation_required');
});

test('snapshot tampering is detected by ledger diagnostics and backup validation; tables retain authority fences', t => {
  const ledger = fixture(t), f = setupDelivery(ledger), balance = new WorkBalance(ledger);
  const pending = requestPlan(balance, f.job.id, f.pack.id, [{ lineKey: 'doors', packageId: f.pack.id, plannedQuantity: 2 }]);
  ledger.resolveApproval(pending.approvalId, { status: 'approved', resolvedBy: 'reviewer' });
  assert.equal(verifyWorkBalance(ledger.db), true);
  const { verifySqliteBackupDatabase } = require('../scripts/restore-local-backup');
  assert.equal(verifySqliteBackupDatabase(ledger.dbFile).valid, true);
  ledger.db.prepare("UPDATE work_balance_plans SET snapshot_hash = 'tampered' WHERE id = ?").run(pending.planId);
  assert.throws(() => verifyWorkBalance(ledger.db), { statusCode: 409 });
  assert.ok(ledger.diagnose().issues.some(issue => /work allocation/i.test(issue.message)));
  assert.throws(() => balance.read(f.job.id), { statusCode: 409 });
  ledger.db.exec("INSERT INTO company_authority (id,environment_id,generation,status,public_key,details_json,updated_at) VALUES ('current','fixture',1,'frozen','fixture','{}','fixture')");
  for (const table of TABLES) assert.throws(() => ledger.db.exec(`DELETE FROM ${table}`), /company_authority_blocked/);
});
