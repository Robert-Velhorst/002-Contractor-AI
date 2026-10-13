const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { TABLES, verifyWorkDeliveries } = require('../work-delivery');
const { WorkBalance } = require('../work-balance');
const { ContractualCloseout } = require('../contractual-closeout');
const { setupDelivery, verifyDeliveryContract } = require('./work-delivery-contract');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'work-delivery-test-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => { ledger.close(); assert.ok(path.basename(directory).startsWith('work-delivery-test-')); fs.rmSync(directory, { recursive: true, force: true }); });
  return ledger;
}
test('partial deliveries keep physical, inspection, customer and financial states independent', t => verifyDeliveryContract(fixture(t)));
test('delivery commands retain exact retries and reject changed or stale input', t => {
  const f = setupDelivery(fixture(t));
  const input = { action: 'retain', record: f.input, sourceHash: f.delivery.read(f.job.id).sourceHash, entryKey: randomUUID() };
  const first = f.delivery.command(f.job.id, input, 'office');
  assert.equal(f.delivery.command(f.job.id, input, 'office').deliveryId, first.deliveryId);
  assert.equal(f.delivery.command(f.job.id, input, 'office').replayed, true);
  assert.throws(() => f.delivery.command(f.job.id, { ...input, entryKey: randomUUID() }, 'office'), { statusCode: 409 });
  assert.throws(() => f.delivery.command(f.job.id, { ...input, record: { ...f.input, title: 'Changed' } }, 'office'), { statusCode: 409 });
});
test('pending response cannot approve changed evidence; rejection retains recovery path', t => {
  const ledger = fixture(t), f = setupDelivery(ledger), id = f.command('retain', f.input).deliveryId;
  const pending = f.command('request_response', f.response(id));
  ledger.db.prepare("UPDATE documents SET title = 'Changed evidence' WHERE id = ?").run(f.document.id);
  assert.throws(() => ledger.resolveApproval(pending.approvalId, { status: 'approved', resolvedBy: 'reviewer' }), { statusCode: 409 });
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(pending.approvalId).status, 'pending');
  ledger.resolveApproval(pending.approvalId, { status: 'rejected', resolvedBy: 'reviewer' });
  const retry = f.command('request_response', { ...f.response(id), outcome: 'disputed' });
  ledger.resolveApproval(retry.approvalId, { status: 'approved', resolvedBy: 'reviewer' });
  assert.equal(f.delivery.source(f.job.id)[0].response.status, 'disputed');
  assert.throws(() => f.command('request_response', { ...f.response(id), respondedAt: '2099-01-01' }), { statusCode: 400 });
  const doc = ledger.addDocument(f.other.id, { title: 'Other client evidence', type: 'acceptance_evidence' });
  assert.throws(() => f.command('request_response', { ...f.response(id), evidenceDocumentId: doc.id }), { statusCode: 409 });
});
test('delivery snapshots verify integrity and new tables retain native write fences', t => {
  const ledger = fixture(t), f = setupDelivery(ledger);
  ledger.db.prepare("UPDATE job_tasks SET status = 'completed' WHERE id = ?").run(f.job.tasks[0].id);
  const id = f.command('retain', { ...f.input, taskIds: [f.job.tasks[0].id] }).deliveryId;
  f.command('request_response', f.response(id));
  ledger.db.prepare("UPDATE work_deliveries SET snapshot_hash = 'tampered' WHERE id = ?").run(id);
  assert.throws(() => verifyWorkDeliveries(ledger.db), { statusCode: 409 });
  assert.ok(ledger.diagnose().issues.some(issue => /Work delivery snapshot/.test(issue.message)));
  assert.throws(() => f.delivery.read(f.job.id), { statusCode: 409 });
  ledger.db.exec("INSERT INTO company_authority (id,environment_id,generation,status,public_key,details_json,updated_at) VALUES ('current','fixture',1,'frozen','fixture','{}','fixture')");
  for (const table of TABLES) assert.throws(() => ledger.db.exec(`DELETE FROM ${table}`), /company_authority_blocked/);
});
test('linked invoice reconciliation distinguishes pending receipts, actual receipts and write-offs', t => {
  const ledger = fixture(t), f = setupDelivery(ledger), id = f.command('retain', f.input).deliveryId;
  ledger.updateOrganizationProfile({ legalName: 'Fixture Contractor', tradingName: 'Fixture Contractor', registrationNumber: '12345678', vatNumber: 'NL123456789B01', email: 'finance@example.test', phone: '+31301234567', address: 'Teststraat 1', postalCode: '3511 AA', city: 'Utrecht', country: 'NL', iban: 'NL91 ABNA 0417 1643 00' });
  const milestone = ledger.createBillingMilestone(f.job.id, { title: 'Deelbetaling eerste deur', amount: 100, taxRate: 21, plannedIssueAt: '2026-09-01', dueAt: '2026-09-30' });
  ledger.resolveApproval(milestone.approvalId, { status: 'approved', resolvedBy: 'finance-reviewer' });
  f.command('link', { id, inspectionIds: [], milestoneIds: [milestone.id] });
  assert.equal(f.delivery.source(f.job.id)[0].finance.status, 'not_invoiced');
  const invoice = ledger.createInvoice(f.job.id, { billingMilestoneId: milestone.id });
  ledger.resolveApproval(invoice.approvalId, { status: 'approved', resolvedBy: 'finance-reviewer' });
  ledger.prepareInvoiceIssuePackage(f.job.id, invoice.id);
  assert.equal(f.delivery.source(f.job.id)[0].finance.status, 'outstanding');
  const receipt = ledger.recordPayment(f.job.id, { invoiceId: invoice.id, status: 'received', amount: 100, reference: 'Verified bank evidence fixture' });
  assert.equal(f.delivery.source(f.job.id)[0].finance.invoices[0].receivedAmount, 0);
  ledger.resolveApproval(receipt.approvalId, { status: 'approved', resolvedBy: 'receipt-reviewer' });
  assert.equal(f.delivery.source(f.job.id)[0].finance.invoices[0].receivedAmount, 100);
  const writeOff = ledger.recordPayment(f.job.id, { invoiceId: invoice.id, status: 'written_off', amount: 21, reference: 'Approved write-off fixture' });
  ledger.resolveApproval(writeOff.approvalId, { status: 'approved', resolvedBy: 'write-off-reviewer' });
  const result = f.delivery.source(f.job.id)[0];
  assert.equal(result.finance.status, 'settled_with_adjustment');
  assert.equal(result.finance.invoices[0].writtenOffAmount, 21);
  assert.equal(result.response.status, 'not_verified');
  assert.equal(result.inspection.status, 'not_linked');
});

test('a billing milestone can belong to only one active delivery and its value follows an explicit link', t => {
  const ledger = fixture(t), f = setupDelivery(ledger);
  const firstId = f.command('retain', f.input).deliveryId;
  const secondEntry = f.produce('second-finance');
  const secondId = f.command('retain', { ...f.input, title: 'Tweede deur', entryIds: [secondEntry.id] }).deliveryId;
  const milestone = ledger.createBillingMilestone(f.job.id, { title: 'Eerste deur termijn', amount: 100, taxRate: 21,
    plannedIssueAt: '2026-09-01', dueAt: '2026-09-30' });

  f.command('link', { id: firstId, inspectionIds: [], milestoneIds: [milestone.id] });
  const first = f.delivery.source(f.job.id).find(item => item.id === firstId);
  assert.equal(first.finance.status, 'not_invoiced');
  assert.deepEqual(first.finance.milestones.map(({ id, amount, taxAmount, total, currency }) => ({ id, amount, taxAmount, total, currency })),
    [{ id: milestone.id, amount: 100, taxAmount: 21, total: 121, currency: 'EUR' }]);
  assert.throws(() => f.command('link', { id: secondId, inspectionIds: [], milestoneIds: [milestone.id] }), { statusCode: 409 });

  f.command('link', { id: firstId, inspectionIds: [], milestoneIds: [] });
  f.command('link', { id: secondId, inspectionIds: [], milestoneIds: [milestone.id] });
  assert.equal(f.delivery.source(f.job.id).find(item => item.id === secondId).finance.milestones[0].id, milestone.id);

  ledger.db.prepare('UPDATE work_deliveries SET data_json = ? WHERE id = ?')
    .run(JSON.stringify({ inspectionIds: [], milestoneIds: [milestone.id] }), firstId);
  for (const item of f.delivery.source(f.job.id)) {
    assert.equal(item.finance.status, 'allocation_conflict');
    assert.deepEqual(item.finance.invoices, []);
  }
  const assessment = new ContractualCloseout(ledger).assess(f.job.id);
  assert.equal(assessment.sections.finance.status, 'allocation_conflict');
  assert.equal(assessment.warnings.some(warning => warning.code === 'delivery_finance_allocation_conflict'), true);
});

test('closeout joins remaining work, partial acceptance, inspection and invoice sources by package without asserting closure', t => {
  const ledger = fixture(t), f = setupDelivery(ledger), balance = new WorkBalance(ledger);
  const closeout = new ContractualCloseout(ledger);
  assert.equal(closeout.assess(f.job.id).sections.workPackages.status, 'allocation_required');
  const plan = balance.command(f.job.id, { action: 'plan', entryKey: randomUUID(), sourceHash: balance.read(f.job.id).sourceHash,
    record: { scopeConfirmed: true, reference: 'Approved production scope for WP-01', reason: 'Allocate the measured baseline to the work package.',
      allocations: [{ lineKey: 'doors', packageId: f.pack.id, plannedQuantity: 2 }] } }, 'work-balance-office');
  assert.equal(closeout.assess(f.job.id).sections.workPackages.status, 'review_pending');
  ledger.resolveApproval(plan.approvalId, { status: 'approved', resolvedBy: 'balance-reviewer' });
  const delivery = f.command('retain', f.input).deliveryId;
  const response = f.command('request_response', f.response(delivery));
  ledger.resolveApproval(response.approvalId, { status: 'approved', resolvedBy: 'client-response-reviewer' });
  ledger.updateOrganizationProfile({ legalName: 'Fixture Contractor', tradingName: 'Fixture Contractor', registrationNumber: '12345678',
    vatNumber: 'NL123456789B01', email: 'finance@example.test', phone: '+31301234567', address: 'Teststraat 1', postalCode: '3511 AA', city: 'Utrecht', country: 'NL', iban: 'NL91 ABNA 0417 1643 00' });
  const milestone = ledger.createBillingMilestone(f.job.id, { title: 'Eerste deur', amount: 100, taxRate: 21, plannedIssueAt: '2026-09-01', dueAt: '2026-09-30' });
  ledger.resolveApproval(milestone.approvalId, { status: 'approved', resolvedBy: 'finance-reviewer' });
  const invoice = ledger.createInvoice(f.job.id, { billingMilestoneId: milestone.id });
  ledger.resolveApproval(invoice.approvalId, { status: 'approved', resolvedBy: 'finance-reviewer' });
  ledger.prepareInvoiceIssuePackage(f.job.id, invoice.id);
  f.command('link', { id: delivery, inspectionIds: [], milestoneIds: [milestone.id] });

  const assessment = closeout.assess(f.job.id);
  const pack = assessment.sections.workPackages.records.find(row => row.id === f.pack.id);
  assert.equal(pack.balanceStatus, 'current');
  assert.deepEqual(pack.remainingRows.map(row => ({ completed: row.completedQuantity, remaining: row.remainingQuantity })), [{ completed: 1, remaining: 1 }]);
  assert.equal(pack.deliveries[0].physicalStatus, 'reported');
  assert.equal(pack.deliveries[0].inspectionStatus, 'not_linked');
  assert.equal(pack.deliveries[0].customerResponseStatus, 'accepted_with_reservations');
  assert.equal(pack.deliveries[0].financeStatus, 'outstanding');
  assert.deepEqual(pack.deliveries[0].invoiceIds, [invoice.id]);
  assert.deepEqual(pack.deliveries[0].financeMilestones.map(({ id, total, currency, invoiceId }) => ({ id, total, currency, invoiceId })),
    [{ id: milestone.id, total: 121, currency: 'EUR', invoiceId: invoice.id }]);
  assert.equal(pack.deliveries[0].invoiceBalances[0].invoiceTotal, 121);
  assert.equal(pack.deliveries[0].invoiceBalances[0].outstandingAmount, 121);
  assert.equal(assessment.determinations.contractualClosure, 'not_determined');
  assert.equal(assessment.readOnly, true);
});
test('backup verification rejects changed delivery snapshots and removed allocation links', t => {
  const ledger = fixture(t), f = setupDelivery(ledger), id = f.command('retain', f.input).deliveryId;
  const { verifySqliteBackupDatabase } = require('../scripts/restore-local-backup');
  assert.equal(verifySqliteBackupDatabase(ledger.dbFile).valid, true);
  ledger.db.prepare('DELETE FROM work_delivery_production WHERE delivery_id = ?').run(id);
  assert.throws(() => verifySqliteBackupDatabase(ledger.dbFile), /uitvoeringskoppeling/);
});
