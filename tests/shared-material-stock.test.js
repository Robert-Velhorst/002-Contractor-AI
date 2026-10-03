const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { SharedMaterialStock } = require('../shared-material-stock');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-shared-stock-'));
  const dbFile = path.join(directory, 'ledger.sqlite');
  const ledger = new ContractorOperatingLedger({ dbFile });
  const otherLedger = new ContractorOperatingLedger({ dbFile });
  t.after(() => { otherLedger.close(); ledger.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { ledger, stock: new SharedMaterialStock(ledger), otherStock: new SharedMaterialStock(otherLedger) };
}

function job(ledger, suffix) {
  const result = ledger.createIntake({ title: `Shared stock job ${suffix}`, client: { name: `Stock client ${suffix}` }, status: 'scheduled', assignAutomatically: false });
  return result.id;
}

test('site receipt inspection reviews upgrade a 090 database through the ledger migration', t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-site-inspection-migration-'));
  const dbFile = path.join(directory, 'ledger.sqlite');
  const legacy = new ContractorOperatingLedger({ dbFile });
  legacy.db.exec('DROP TABLE shared_material_site_issue_receipt_reviews');
  legacy.db.prepare("DELETE FROM ledger_schema_migrations WHERE version='091_site_receipt_inspection_reviews'").run();
  legacy.close();
  const upgraded = new ContractorOperatingLedger({ dbFile });
  t.after(() => { upgraded.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  assert.equal(upgraded.migrationStatus().currentVersion, '096_loading_read_indexes');
  assert.ok(upgraded.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='shared_material_site_issue_receipt_reviews'").get());
  const indexes = upgraded.db.prepare('PRAGMA index_list(shared_material_site_issue_receipt_reviews)').all();
  assert.ok(indexes.some(index => index.unique && upgraded.db.prepare(`PRAGMA index_info("${index.name.replace(/"/g, '""')}")`).all()
    .map(row => row.name).join(',') === 'entry_key'));
});

test('shared material stock prevents cross-job over-allocation and retains release and partial consumption', t => {
  const { ledger, stock, otherStock } = fixture(t);
  const counted = stock.count({ name: 'Fastener box', unit: 'boxes', countedQuantity: 10, reference: 'STOCKTAKE-100', note: 'Physical warehouse count', entryKey: 'stocktake-fastener-100' }, { actor: 'storekeeper' });
  assert.equal(counted.material.stockQuantity, 10);
  const firstJob = job(ledger, 'A'), secondJob = job(ledger, 'B');
  const firstReq = ledger.addMaterialRequirement(firstJob, { name: 'Fastener box', materialId: counted.material.id, quantity: 8, unit: 'boxes' });
  const secondReq = ledger.addMaterialRequirement(secondJob, { name: 'Fastener box', materialId: counted.material.id, quantity: 8, unit: 'boxes' });
  const first = stock.reserve(firstJob, { materialRequirementId: firstReq.id, quantity: 8, sourceReference: 'STOCKTAKE-100', entryKey: 'reserve-job-a' }, { actor: 'planner' });
  assert.equal(first.allocation.status, 'reserved');
  assert.equal(stock.list().materials[0].availableQuantity, 2);
  assert.throws(() => otherStock.reserve(secondJob, { materialRequirementId: secondReq.id, quantity: 8, sourceReference: 'STOCKTAKE-100', entryKey: 'reserve-job-b' }), error => error.code === 'material_stock_insufficient' && error.statusCode === 409);
  assert.throws(() => stock.count({ materialId: counted.material.id, countedQuantity: 7, reference: 'STOCKTAKE-101', note: 'Counted again', entryKey: 'stocktake-fastener-101' }), error => error.code === 'material_stock_below_reservations');

  const released = stock.transition(first.allocation.id, 'release', { entryKey: 'release-job-a', note: 'Crew plan changed; stock returned to shelf.' }, { actor: 'planner' });
  assert.equal(released.allocation.status, 'released');
  assert.equal(stock.transition(first.allocation.id, 'release', { entryKey: 'release-job-a', note: 'Crew plan changed; stock returned to shelf.' }).replayed, true);
  const second = otherStock.reserve(secondJob, { materialRequirementId: secondReq.id, quantity: 8, sourceReference: 'STOCKTAKE-100', entryKey: 'reserve-job-b' });
  const consumed = stock.transition(second.allocation.id, 'consume', { quantity: 3, evidenceReference: 'PICK-TICKET-33', note: 'Three boxes issued to the site.', entryKey: 'consume-three-boxes' });
  assert.equal(consumed.allocation.status, 'reserved');
  assert.equal(consumed.allocation.remainingQuantity, 5);
  assert.equal(stock.list().materials[0].stockQuantity, 7);
  assert.equal(stock.list().materials[0].reservedQuantity, 5);
  assert.equal(stock.list().materials[0].availableQuantity, 2);
  assert.equal(stock.transition(second.allocation.id, 'consume', { quantity: 3, evidenceReference: 'PICK-TICKET-33', note: 'Three boxes issued to the site.', entryKey: 'consume-three-boxes' }).replayed, true);
  assert.throws(() => stock.transition(second.allocation.id, 'consume', { quantity: 3, note: 'Missing evidence', entryKey: 'consume-without-evidence' }), error => error.code === 'material_stock_input_invalid');
  assert.equal(ledger.migrationStatus().currentVersion, '096_loading_read_indexes');
});

test('warehouse issue and field arrival evidence move stock into job-site availability without double counting', t => {
  const { ledger, stock } = fixture(t);
  stock.count({ name: 'Roofing membrane', unit: 'rolls', countedQuantity: 8, reference: 'COUNT-ISSUE-1', note: 'Central store count', entryKey: 'issue-count-1' });
  const jobId = job(ledger, 'site-issue');
  const requirement = ledger.addMaterialRequirement(jobId, { name: 'Roofing membrane', quantity: 6, unit: 'rolls' });
  ledger.addTask(jobId, { title: 'Install roofing membrane', durationHours: 4, materialRequirementIds: [requirement.id] });
  const now = Date.now(), plannedStart = new Date(now + 60_000).toISOString();
  const blocked = ledger.calculateJobSchedule(jobId, { plannedStart });
  assert.equal(blocked.ready, false);

  const allocation = stock.reserve(jobId, { requirementId: requirement.id, quantity: 5, sourceReference: 'COUNT-ISSUE-1', entryKey: 'reserve-site-issue-1' }).allocation;
  const firstArrival = new Date(now + 86_400_000).toISOString();
  const dispatch = { quantity: 5, dispatchReference: 'PICK-SITE-ISSUE-1', evidenceReference: 'signed-pick-ticket-1', expectedArrivalAt: firstArrival, note: 'Loaded for the site.', entryKey: 'dispatch-site-issue-1' };
  const issued = stock.issue(allocation.id, dispatch, { actor: 'storekeeper' });
  assert.equal(stock.issue(allocation.id, dispatch, { actor: 'retry' }).replayed, true);
  assert.equal(stock.list().materials[0].stockQuantity, 3);
  assert.equal(stock.list().siteIssues[0].status, 'in_transit');
  let material = ledger.getJobDetail(jobId).materials.find(item => item.id === requirement.id);
  assert.equal(material.data.availableQuantity, 0);
  assert.equal(material.data.expectedAvailableAt, firstArrival);
  let planned = ledger.calculateJobSchedule(jobId, { plannedStart });
  assert.equal(planned.ready, false);
  assert.equal(planned.materialBlockers[0].reason, 'in_transit_quantity_insufficient');
  assert.equal(planned.materialBlockers[0].inTransitQuantity, 5);
  assert.equal(planned.materialConstraints[0].availableQuantity, 0);

  const firstReceipt = { receivedQuantity: 3, acceptedQuantity: 2, damagedQuantity: 1, receiptReference: 'SITE-REC-1A',
    receivedBy: 'Field worker', location: 'Roof level', evidenceReference: 'photo:site-receipt-1a', entryKey: 'site-receipt-1a',
    expectedDispatchReference: 'PICK-SITE-ISSUE-1', expectedRemainingQuantity: 5 };
  assert.throws(() => stock.receiveAtJobSite(jobId, issued.issueId, { ...firstReceipt, expectedRemainingQuantity: 4, entryKey: 'site-receipt-stale-offline' }),
    error => error.code === 'material_site_issue_changed' && error.statusCode === 409);
  assert.equal(stock.list().siteIssues[0].receivedQuantity, 0);
  stock.receiveAtJobSite(jobId, issued.issueId, firstReceipt, { actor: 'field_worker' });
  assert.equal(stock.receiveAtJobSite(jobId, issued.issueId, firstReceipt, { actor: 'retry' }).replayed, true);
  assert.equal(stock.list().siteIssues[0].remainingQuantity, 2);
  material = ledger.getJobDetail(jobId).materials.find(item => item.id === requirement.id);
  assert.equal(material.data.availableQuantity, 2);
  assert.equal(material.data.expectedAvailableAt, firstArrival);
  assert.equal(ledger.calculateJobSchedule(jobId, { plannedStart }).ready, false);

  stock.receiveAtJobSite(jobId, issued.issueId, { receivedQuantity: 2, acceptedQuantity: 2, damagedQuantity: 0,
    receiptReference: 'SITE-REC-1B', receivedBy: 'Field worker', location: 'Roof level', evidenceReference: 'photo:site-receipt-1b', entryKey: 'site-receipt-1b',
    expectedDispatchReference: 'PICK-SITE-ISSUE-1', expectedRemainingQuantity: 2 });
  material = ledger.getJobDetail(jobId).materials.find(item => item.id === requirement.id);
  assert.equal(material.data.availableQuantity, 4);
  assert.equal(material.data.expectedAvailableAt, null);
  assert.equal(ledger.calculateJobSchedule(jobId, { plannedStart }).ready, false);

  const finalAllocation = stock.reserve(jobId, { requirementId: requirement.id, quantity: 2, sourceReference: 'COUNT-ISSUE-1', entryKey: 'reserve-site-issue-final' }).allocation;
  const finalDispatch = stock.issue(finalAllocation.id, { quantity: 2, dispatchReference: 'PICK-SITE-ISSUE-2', evidenceReference: 'signed-pick-ticket-2',
    expectedArrivalAt: firstArrival, entryKey: 'dispatch-site-issue-2' });
  stock.receiveAtJobSite(jobId, finalDispatch.issueId, { receivedQuantity: 2, acceptedQuantity: 2, damagedQuantity: 0,
    receiptReference: 'SITE-REC-2', receivedBy: 'Field worker', location: 'Roof level', evidenceReference: 'photo:site-receipt-2', entryKey: 'site-receipt-2' });
  material = ledger.getJobDetail(jobId).materials.find(item => item.id === requirement.id);
  assert.equal(material.data.availableQuantity, 6);
  assert.equal(material.status, 'available');
  assert.equal(ledger.calculateJobSchedule(jobId, { plannedStart }).ready, true);
  assert.deepEqual(stock.list().movements.filter(item => item.type === 'site_issue').map(item => item.reference).sort(), ['PICK-SITE-ISSUE-1', 'PICK-SITE-ISSUE-2']);
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
  assert.equal(ledger.diagnose().valid, true);
});

test('unclassified site receipt quantity remains unavailable and creates an operational review signal', t => {
  const { ledger, stock } = fixture(t);
  stock.count({ name: 'Inspection tile', unit: 'boxes', countedQuantity: 4, reference: 'COUNT-INSP-1', note: 'Warehouse count', entryKey: 'count-inspection-1' });
  const jobId = job(ledger, 'inspection');
  const requirement = ledger.addMaterialRequirement(jobId, { name: 'Inspection tile', quantity: 2, unit: 'boxes' });
  const allocation = stock.reserve(jobId, { requirementId: requirement.id, quantity: 2, sourceReference: 'COUNT-INSP-1', entryKey: 'reserve-inspection-1' }).allocation;
  const issue = stock.issue(allocation.id, { quantity: 2, dispatchReference: 'PICK-INSP-1', evidenceReference: 'pick-proof-INSP-1',
    expectedArrivalAt: new Date(Date.now() + 60_000).toISOString(), entryKey: 'dispatch-inspection-1' });
  stock.receiveAtJobSite(jobId, issue.issueId, { receivedQuantity: 2, acceptedQuantity: 1, damagedQuantity: 0,
    receiptReference: 'SITE-INSP-1', receivedBy: 'Field worker', location: 'Site store', evidenceReference: 'photo-INSP-1', entryKey: 'receipt-inspection-1' });

  const siteIssue = stock.list().siteIssues.find(item => item.id === issue.issueId);
  assert.equal(siteIssue.pendingInspectionQuantity, 1);
  assert.equal(siteIssue.receipts[0].pendingInspectionQuantity, 1);
  assert.equal(ledger.getJobDetail(jobId).materials.find(item => item.id === requirement.id).data.availableQuantity, 1,
    'only accepted units count as job-site availability');
  const source = new (require('../operational-recovery').OperationalRecovery)(ledger).list(jobId).sources
    .find(item => item.type === 'material_requirement_shortfall' && item.id === requirement.id);
  assert.equal(source.impact.materialLines[0].pendingInspectionQuantity, 1);

  const firstReview = { acceptedQuantity: 0.5, damagedQuantity: 0.25, expectedPendingInspectionQuantity: 1,
    reviewReference: 'INSPECT-INSP-1A', evidenceReference: 'photo:inspection-INSP-1A', note: 'Checked against approved specification.',
    entryKey: 'inspect-site-receipt-1a' };
  const reviewed = stock.reviewAtJobSite(jobId, issue.issueId, siteIssue.receipts[0].id, firstReview, { actor: 'office_operator:planner' });
  assert.equal(reviewed.issue.pendingInspectionQuantity, 0.25);
  assert.equal(reviewed.issue.acceptedQuantity, 1.5);
  assert.equal(reviewed.issue.damagedQuantity, 0.25);
  assert.equal(ledger.getJobDetail(jobId).materials.find(item => item.id === requirement.id).data.availableQuantity, 1.5,
    'only the office-accepted inspection quantity increases availability');
  assert.equal(stock.reviewAtJobSite(jobId, issue.issueId, siteIssue.receipts[0].id, firstReview).replayed, true);
  assert.throws(() => stock.reviewAtJobSite(jobId, issue.issueId, siteIssue.receipts[0].id, {
    ...firstReview, entryKey: 'inspect-site-receipt-stale', acceptedQuantity: 0.25
  }), error => error.code === 'material_site_receipt_review_stale' && error.statusCode === 409);

  const finalReview = stock.reviewAtJobSite(jobId, issue.issueId, siteIssue.receipts[0].id, {
    acceptedQuantity: 0.25, damagedQuantity: 0, expectedPendingInspectionQuantity: 0.25,
    reviewReference: 'INSPECT-INSP-1B', evidenceReference: 'photo:inspection-INSP-1B', entryKey: 'inspect-site-receipt-1b'
  }, { actor: 'office_operator:planner' });
  assert.equal(finalReview.issue.pendingInspectionQuantity, 0);
  assert.equal(finalReview.issue.acceptedQuantity, 1.75);
  assert.equal(ledger.getJobDetail(jobId).materials.find(item => item.id === requirement.id).data.availableQuantity, 1.75);
  const reviewedSource = new (require('../operational-recovery').OperationalRecovery)(ledger).list(jobId).sources
    .find(item => item.type === 'material_requirement_shortfall' && item.id === requirement.id);
  assert.equal(reviewedSource.impact.materialLines[0].pendingInspectionQuantity, 0);
  assert.equal(reviewedSource.impact.materialLines[0].siteDamagedQuantity, 0.25);
  assert.equal(reviewedSource.impact.materialLines[0].discrepancyReceipts[0].reviews.length, 2);
  assert.equal(reviewedSource.impact.materialLines[0].discrepancyReceipts[0].reviews[0].evidenceReference, 'photo:inspection-INSP-1A');
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
});

test('work plan exposes shared warehouse commitments and only schedules when evidenced transit covers the shortfall', t => {
  const { ledger, stock } = fixture(t);
  const item = stock.count({ name: 'Thermal insulation board', unit: 'boards', countedQuantity: 8, reference: 'COUNT-PLAN-1', note: 'Warehouse count', entryKey: 'plan-stock-count' }).material;
  const jobA = job(ledger, 'plan-A'), jobB = job(ledger, 'plan-B');
  const requirementA = ledger.addMaterialRequirement(jobA, { name: item.name, materialId: item.id, quantity: 6, unit: item.unit });
  const requirementB = ledger.addMaterialRequirement(jobB, { name: item.name, materialId: item.id, quantity: 2, unit: item.unit });
  const task = ledger.addTask(jobA, { title: 'Install insulation', durationHours: 4, materialRequirementIds: [requirementA.id] });
  const eta = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const plannedStart = new Date(Date.now() + 60 * 1000).toISOString();

  stock.reserve(jobB, { requirementId: requirementB.id, quantity: 2, sourceReference: 'COUNT-PLAN-1', entryKey: 'plan-reserve-job-b' });
  const beforeOwnReservation = ledger.calculateJobSchedule(jobA, { plannedStart });
  assert.equal(beforeOwnReservation.ready, false);
  assert.equal(beforeOwnReservation.materialBlockers[0].warehouseAvailableQuantity, 6);
  assert.equal(beforeOwnReservation.materialBlockers[0].warehouseReservedForOtherJobs, 2);
  assert.equal(stock.list().allocations.filter(allocation => allocation.status === 'reserved').length, 1);

  const ownAllocation = stock.reserve(jobA, { requirementId: requirementA.id, quantity: 3, sourceReference: 'COUNT-PLAN-1', entryKey: 'plan-reserve-job-a-first' }).allocation;
  const reservedPlan = ledger.calculateJobSchedule(jobA, { plannedStart });
  assert.notEqual(reservedPlan.planningHash, beforeOwnReservation.planningHash);
  assert.equal(reservedPlan.materialBlockers[0].warehouseReservedForRequirement, 3);
  assert.equal(reservedPlan.materialBlockers[0].warehouseAvailableQuantity, 3);
  assert.equal(reservedPlan.materialBlockers[0].inTransitQuantity, 0);
  assert.equal(reservedPlan.ready, false);

  const firstIssue = stock.issue(ownAllocation.id, { quantity: 3, dispatchReference: 'PLAN-PICK-A1', evidenceReference: 'signed-pick-A1', expectedArrivalAt: eta, entryKey: 'plan-issue-a-first' });
  const partialPlan = ledger.calculateJobSchedule(jobA, { plannedStart });
  assert.equal(partialPlan.ready, false);
  assert.equal(partialPlan.materialBlockers[0].reason, 'in_transit_quantity_insufficient');
  assert.equal(partialPlan.materialBlockers[0].inTransitQuantity, 3);
  assert.equal(partialPlan.materialBlockers[0].warehouseReservedForOtherJobs, 2);

  const remainingAllocation = stock.reserve(jobA, { requirementId: requirementA.id, quantity: 3, sourceReference: 'COUNT-PLAN-1', entryKey: 'plan-reserve-job-a-second' }).allocation;
  stock.issue(remainingAllocation.id, { quantity: 3, dispatchReference: 'PLAN-PICK-A2', evidenceReference: 'signed-pick-A2', expectedArrivalAt: eta, entryKey: 'plan-issue-a-second' });
  const coveredPlan = ledger.calculateJobSchedule(jobA, { plannedStart });
  assert.equal(coveredPlan.ready, true);
  assert.equal(coveredPlan.materialConstraints[0].inTransitQuantity, 6);
  assert.equal(coveredPlan.tasks.find(item => item.id === task.id).plannedStart, eta);
  assert.equal(stock.list().siteIssues.find(issue => issue.id === firstIssue.issueId).status, 'in_transit');
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
});

test('shared stock count and reservation commands reject conflicting entry-key replays', t => {
  const { ledger, stock } = fixture(t);
  const item = stock.count({ name: 'Membrane roll', unit: 'rolls', countedQuantity: 4, reference: 'COUNT-1', note: 'Counted', entryKey: 'count-replay' });
  const replay = stock.count({ name: 'Membrane roll', unit: 'rolls', countedQuantity: 4, reference: 'COUNT-1', note: 'Counted', entryKey: 'count-replay' });
  assert.equal(replay.replayed, true);
  assert.equal(replay.material.id, item.material.id);
  assert.throws(() => stock.count({ name: 'Membrane roll', unit: 'rolls', countedQuantity: 5, reference: 'COUNT-1', note: 'Changed count', entryKey: 'count-replay' }), error => error.code === 'material_stock_replay_conflict' && error.statusCode === 409);
  assert.equal(ledger.migrationStatus().pending.length, 0);
});
