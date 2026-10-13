const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { ContractorReview } = require('../contractor-review');
const { ClientDateCommitments } = require('../client-date-commitments');
const { approveLowRiskRegister } = require('./risk-register-fixture');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-review-'));
  const dbFile = path.join(directory, 'ledger.sqlite');
  let ledger = new ContractorOperatingLedger({ dbFile });
  t.after(() => { ledger.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  return { get ledger() { return ledger; }, reopen() { ledger.close(); ledger = new ContractorOperatingLedger({ dbFile }); return ledger; } };
}

function job(ledger) {
  const result = ledger.createIntake({ client: { name: 'Review customer', country: 'NL' }, title: 'Extension', tasks: [{ title: 'Foundation', durationHours: 8 }, { title: 'Walls', durationHours: 8 }], assignAutomatically: false });
  ledger.db.prepare('UPDATE jobs SET scheduled_start = ?, target_completion = ? WHERE id = ?').run('2026-09-07T08:00:00.000Z', '2026-09-08T00:00:00.000Z', result.id);
  ledger.addTaskDependency(result.id, { predecessorTaskId: result.tasks[0].id, successorTaskId: result.tasks[1].id });
  return result;
}

function acceptedQuote(ledger, jobId) {
  const scope = ledger.requestCommercialScopeRevision(jobId, { entryKey: 'review-scope-contract-date', title: 'Approved work scope',
    scopeSummary: 'The measured building work.', inclusions: ['Complete the listed building work.'], assumptions: ['Site access is available.'],
    exclusions: ['Unforeseen structural defects.'], clientResponsibilities: ['Provide access.'], contractorResponsibilities: ['Complete the listed work.'],
    allowanceMode: 'none', noAllowanceReason: 'No allowances apply.', reason: 'Establish the quoted contract scope.' }, { actor: 'office' });
  ledger.resolveApproval(scope.approval.id, { status: 'approved', resolvedBy: 'commercial-approver' });
  const currentScope = ledger.getCommercialScopeRevision(scope.revision.id);
  approveLowRiskRegister(ledger, jobId, currentScope, 'review-risk-contract-date');
  const quote = ledger.createQuote(jobId, { commercialScopeRevisionId: currentScope.id, lineItems: [{ description: 'Building work', quantity: 1, unitPrice: 1000 }] }, { actor: 'office' });
  ledger.resolveApproval(quote.approvalId, { status: 'approved', resolvedBy: 'commercial-approver' });
  const acceptance = ledger.requestQuoteAcceptance(jobId, quote.id, { acceptedAt: '2026-09-24', evidenceReference: 'signed-quote-17', notes: 'Signed quote received.' }, { actor: 'office' });
  ledger.resolveApproval(acceptance.approval.id, { status: 'approved', resolvedBy: 'contract-approver' });
  return quote;
}

test('portfolio sweep includes every dossier beyond 500 and resumes after restart', t => {
  const f = fixture(t);
  const original = job(f.ledger);
  f.ledger.transaction(() => {
    const insert = f.ledger.db.prepare('INSERT INTO jobs (id, client_id, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (let n = 0; n < 505; n++) insert.run(`older-${String(n).padStart(4, '0')}`, original.clientId, `Dossier ${n}`, n % 3 === 0 ? 'archived' : n % 2 ? 'completed' : 'draft', '2020-01-01', '2020-01-01');
  });
  let service = new ContractorReview(f.ledger);
  let result = service.runBatch({ batchSize: 50, now: '2026-09-04T10:00:00Z' });
  assert.equal(result.progress.checked, 50);
  assert.equal(result.progress.total, 506);
  assert.equal(result.progress.complete, false);
  assert.equal(service.runBatch({ now: '2026-09-04T10:00:01Z' }).ran, false);
  service = new ContractorReview(f.reopen());
  assert.equal(service.status().progress.checked, 50);
  for (let n = 1; n <= 10; n++) result = service.runBatch({ batchSize: 50, now: new Date(Date.parse('2026-09-04T10:00:00Z') + n * 31000).toISOString() });
  assert.equal(result.progress.checked, 506);
  assert.equal(result.progress.complete, true);
  assert.equal(result.progress.failed, 0);
  assert.equal(result.progress.coverageVersion, 1);
  assert.equal(result.progress.coverageIncomplete, 0);
  const ids = f.ledger.db.prepare("SELECT entity_id FROM audit_events WHERE entity_type = 'dossier_review'").all();
  assert.equal(ids.length, 506);
  assert.equal(new Set(ids.map(row => row.entity_id)).size, 506);
  const report = JSON.parse(f.ledger.db.prepare("SELECT after_json FROM audit_events WHERE entity_type = 'dossier_review' ORDER BY sequence_number LIMIT 1").get().after_json);
  assert.equal(report.coverage.complete, true);
  assert.equal(report.coverage.sourceTables.length, 15);
  assert.ok(report.coverage.sourceTables.every(item => item.scanned && Number.isSafeInteger(item.rowCount)));
  assert.equal(report.coverage.derivedSources.length, 7);
  assert.equal(report.coverage.checks.length, 10);
});

test('portfolio membership changes and review failures never report complete coverage', t => {
  const f = fixture(t);
  const original = job(f.ledger);
  const service = new ContractorReview(f.ledger);
  f.ledger.db.prepare('INSERT INTO jobs (id, client_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('zzz-tail', original.clientId, 'Tail', '2020-01-01', '2020-01-01');
  service.runBatch({ batchSize: 1, now: '2026-09-04T10:00:00Z' });
  f.ledger.db.prepare('INSERT INTO jobs (id, client_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)').run('000-added', original.clientId, 'Added', '2020-01-01', '2020-01-01');
  const inspect = service.inspect.bind(service);
  service.inspect = id => { if (id === 'zzz-tail') throw new Error('read failure'); return inspect(id); };
  const result = service.runBatch({ batchSize: 10, now: '2026-09-04T10:01:00Z' });
  assert.equal(result.progress.finished, true);
  assert.equal(result.progress.complete, false);
  assert.equal(result.progress.membershipChanged, true);
  assert.equal(result.progress.failed, 1);
  assert.equal(result.progress.coverageIncomplete, 1);
});

test('unfinished review rounds without the current coverage manifest restart from the first dossier', t => {
  const f = fixture(t);
  job(f.ledger);
  f.ledger.createIntake({ title: 'Second dossier', client: { name: 'Client' }, assignAutomatically: false });
  const firstId = f.ledger.db.prepare('SELECT id FROM jobs ORDER BY id LIMIT 1').get().id;
  const service = new ContractorReview(f.ledger);
  const first = service.runBatch({ batchSize: 1, now: '2026-09-04T10:00:00.000Z' });
  assert.equal(first.progress.checked, 1);
  f.ledger.db.prepare('UPDATE scheduled_jobs SET last_result_json = ? WHERE job_key = ?')
    .run(JSON.stringify({ success: true, progress: { ...first.progress, coverageVersion: undefined, coverageIncomplete: undefined } }), 'portfolio_dossier_review');
  const rerun = service.runBatch({ batchSize: 1, now: '2026-09-04T10:00:31.000Z' });
  assert.notEqual(rerun.progress.runId, first.progress.runId);
  assert.equal(rerun.progress.coverageVersion, 1);
  assert.equal(rerun.progress.checked, 1);
  assert.equal(rerun.progress.cursor, firstId);
});

test('impact preview propagates dependency delay without changing retained records', t => {
  const f = fixture(t);
  const current = job(f.ledger);
  const service = new ContractorReview(f.ledger);
  const before = service.source(current.id);
  const result = service.preview(current.id, { taskId: current.tasks[0].id, durationHours: 16, costDelta: 300, revenueDelta: 450, reason: 'Additional excavation' });
  assert.equal(result.schedule.finishDeltaHours, 8);
  assert.equal(result.schedule.affectedTasks.length, 2);
  assert.equal(result.schedule.affectedDependencies.length, 1);
  assert.equal(result.schedule.affectedDependencies[0].predecessorTaskId, current.tasks[0].id);
  assert.equal(result.schedule.affectedDependencies[0].successorTaskId, current.tasks[1].id);
  assert.equal(result.schedule.targetExceeded, true);
  assert.equal(result.financial.marginDelta, 150);
  assert.equal(result.externalActions, false);
  assert.deepEqual(service.source(current.id), before);
  assert.throws(() => service.preview(current.id, { taskId: 'foreign', durationHours: 8, reason: 'Changed' }), { statusCode: 400 });
  assert.throws(() => service.preview(current.id, { taskId: current.tasks[0].id, durationHours: -1, reason: 'Changed' }), { statusCode: 400 });
});

test('impact context binds client decisions, exposes the approved scope basis, and stales after a decision is resolved', t => {
  const f = fixture(t);
  const current = job(f.ledger);
  acceptedQuote(f.ledger, current.id);
  const selection = f.ledger.createClientSelection(current.id, {
    title: 'Bathroom tile finish', category: 'finish', options: ['Light stone', 'Dark slate'],
    selectedOption: 'Dark slate', status: 'selected', dueAt: '2026-09-08T00:00:00.000Z'
  }, { actor: 'office' });
  assert.equal(selection.status, 'pending_approval');
  const service = new ContractorReview(f.ledger);
  const scenario = { taskId: current.tasks[0].id, durationHours: 12, reason: 'Tile selection may affect the installation sequence' };
  const preview = service.preview(current.id, scenario);
  assert.equal(preview.contractualContext.scope.state, 'current');
  assert.equal(preview.contractualContext.scope.current.integrityValid, true);
  assert.equal(preview.contractualContext.scope.current.sourceCurrent, true);
  assert.equal(preview.contractualContext.clientDecisions.length, 1);
  assert.equal(preview.contractualContext.clientDecisions[0].id, selection.id);
  assert.equal(preview.contractualContext.clientDecisions[0].open, true);
  assert.equal(preview.contractualContext.clientDecisions[0].approvalStatus, 'pending');
  assert.equal(preview.linked.clientDecisions[0].id, selection.id);
  assert.ok(preview.limitations.includes('client_decision_links_are_explicit_operator_assertions_not_automatic_scope_or_cost_changes'));

  const retained = service.retain(current.id, { ...scenario, sourceHash: preview.sourceHash, entryKey: 'impact-client-choice' }, 'office').review;
  f.ledger.resolveApproval(selection.approval.id, { status: 'approved', resolvedBy: 'client-decision-reviewer', reason: 'Recorded customer option.' });
  const afterDecision = service.detail(current.id);
  assert.equal(afterDecision.reviews.find(review => review.id === retained.id).sourceCurrent, false);
  assert.equal(afterDecision.contractualContext.scope.state, 'source_changed');
  assert.equal(afterDecision.contractualContext.clientDecisions[0].status, 'selected');
  assert.equal(afterDecision.contractualContext.clientDecisions[0].selectedOption, 'Dark slate');
  assert.equal(afterDecision.contractualContext.clientDecisions[0].open, false);
  assert.equal(service.preview(current.id, scenario).contractualContext.mapping, 'operator_review_required_no_automatic_relation_inferred');
});

test('explicit customer decision links are audited, validated, invalidate prior analyses, and surface only on matching changes', t => {
  const f = fixture(t);
  const current = job(f.ledger);
  const selection = f.ledger.createClientSelection(current.id, {
    title: 'Bathroom tile finish', options: ['Light stone', 'Dark slate'], status: 'pending_client'
  }, { actor: 'office' });
  const material = f.ledger.addMaterialRequirement(current.id, { name: 'Bathroom tiles', quantity: 20, unit: 'm2' }, { actor: 'office' });
  const service = new ContractorReview(f.ledger);
  const scenario = { taskId: current.tasks[1].id, durationHours: 10, reason: 'Install selected bathroom finish',
    materialChanges: [{ requirementId: material.id, quantity: 24 }] };
  const retained = service.retain(current.id, { ...scenario, sourceHash: service.preview(current.id, scenario).sourceHash, entryKey: 'decision-links-before' }, 'office').review;
  const links = [
    { targetType: 'task', targetId: current.tasks[1].id, rationale: 'Selected tile controls the bathroom installation task.' },
    { targetType: 'material_requirement', targetId: material.id, rationale: 'The chosen tile finish determines this material quantity.' }
  ];
  const linked = service.setClientDecisionImpacts(current.id, selection.id, { links }, 'office');
  assert.equal(linked.changed, true);
  assert.deepEqual(linked.selection.data.impactLinks, links);
  assert.equal(service.setClientDecisionImpacts(current.id, selection.id, { links }, 'office').changed, false);
  const detail = service.detail(current.id);
  assert.equal(detail.reviews.find(review => review.id === retained.id).sourceCurrent, false);
  assert.deepEqual(detail.contractualContext.clientDecisions[0].impactLinks.map(link => ({
    targetType: link.targetType, targetTitle: link.targetTitle, targetCurrent: link.targetCurrent
  })), [
    { targetType: 'task', targetTitle: 'Walls', targetCurrent: true },
    { targetType: 'material_requirement', targetTitle: 'Bathroom tiles', targetCurrent: true }
  ]);
  assert.equal(detail.contractualContext.impactTargets.tasks.some(task => task.id === current.tasks[1].id), true);
  const preview = service.preview(current.id, scenario);
  assert.equal(preview.affectedClientDecisions.length, 1);
  assert.deepEqual(preview.affectedClientDecisions[0].links.map(link => link.targetType), ['task', 'material_requirement']);
  assert.throws(() => service.setClientDecisionImpacts(current.id, selection.id, { links: [
    ...links, { targetType: 'task', targetId: current.tasks[1].id, rationale: 'duplicate relation' }
  ] }, 'office'), { statusCode: 400 });
  assert.throws(() => service.setClientDecisionImpacts(current.id, selection.id, { links: [
    { targetType: 'task', targetId: 'task-from-another-job', rationale: 'Incorrectly linked work.' }
  ] }, 'office'), { statusCode: 409 });
  assert.equal(f.ledger.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE entity_type = 'client_selection' AND entity_id = ? AND action = 'update_client_selection_impact_links'").get(selection.id).count, 1);
});

test('material impact traces exact purchase-order lines and receipts without counting uncommitted orders as supply', t => {
  const f = fixture(t);
  const current = job(f.ledger);
  const material = f.ledger.addMaterialRequirement(current.id, { name: 'Roof tiles', quantity: 10, unit: 'm2' }, { actor: 'office' });
  const linkedOrder = f.ledger.createPurchaseOrder(current.id, {
    status: 'draft', supplier: 'Roof Supply B.V.', currency: 'EUR', requiredBy: '2026-10-01',
    items: [{ lineKey: 'roof-tiles', materialRequirementId: material.id, name: material.name, quantity: 10, unit: 'm2', unitCost: 12 }]
  }, { actor: 'office' });
  f.ledger.createPurchaseOrder(current.id, {
    status: 'draft', supplier: 'Other Supplier B.V.', currency: 'EUR',
    items: [{ lineKey: 'same-name', name: material.name, quantity: 50, unit: 'm2', unitCost: 9 }]
  }, { actor: 'office' });
  const service = new ContractorReview(f.ledger);
  const beforeReceipt = service.source(current.id);
  const scenario = {
    taskId: current.tasks[0].id, durationHours: 8, reason: 'Increase roof tile allowance',
    materialChanges: [{ requirementId: material.id, quantity: 14 }]
  };
  const priorPreview = service.preview(current.id, scenario);
  const retained = service.retain(current.id, { ...scenario, sourceHash: priorPreview.sourceHash, entryKey: 'roof-tile-impact-before-receipt' }, 'office').review;
  const now = new Date().toISOString();
  f.ledger.db.prepare(`
    INSERT INTO material_receipts (
      id, job_id, purchase_order_id, receipt_reference, status, delivered_at, received_by,
      evidence_reference, entry_key, entry_fingerprint, data_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, 'discrepancy', ?, ?, ?, ?, ?, '{}', ?, ?)
  `).run('receipt-impact-test', current.id, linkedOrder.id, 'GR-ROOF-1', now, 'Site receiver',
    'photo:GR-ROOF-1', 'receipt-impact-test-key', 'receipt-impact-test-fingerprint', now, now);
  f.ledger.db.prepare(`
    INSERT INTO material_receipt_lines (
      id, receipt_id, line_key, material_requirement_id, item_name, unit,
      ordered_quantity, received_quantity, accepted_quantity, damaged_quantity,
      data_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '{}', ?, ?)
  `).run('receipt-impact-line-test', 'receipt-impact-test', 'roof-tiles', material.id,
    material.name, 'm2', 10, 3, 2, 1, now, now);
  const source = service.source(current.id);
  assert.notDeepEqual(source.records.material_receipts, beforeReceipt.records.material_receipts);
  assert.notDeepEqual(source.records.material_receipt_lines, beforeReceipt.records.material_receipt_lines);
  assert.equal(service.detail(current.id).reviews.find(review => review.id === retained.id).sourceCurrent, false);
  assert.equal(source.records.material_receipts.length, 1);
  assert.equal(source.records.material_receipt_lines.length, 1);

  const preview = service.preview(current.id, scenario);
  const change = preview.materialImpact.changes[0];
  assert.equal(change.incomingQuantity, 0);
  assert.deepEqual(change.linkedPurchaseOrders.map(order => ({
    purchaseOrderId: order.purchaseOrderId, supplier: order.supplier, status: order.status,
    orderedQuantity: order.orderedQuantity, receivedQuantity: order.receivedQuantity,
    acceptedQuantity: order.acceptedQuantity, damagedQuantity: order.damagedQuantity,
    remainingQuantity: order.remainingQuantity, orderIssued: order.orderIssued, externalCommitments: order.externalCommitments
  })), [{
    purchaseOrderId: linkedOrder.id, supplier: 'Roof Supply B.V.', status: 'draft',
    orderedQuantity: 10, receivedQuantity: 3, acceptedQuantity: 2, damagedQuantity: 1,
    remainingQuantity: 7, orderIssued: false, externalCommitments: 0
  }]);
});

test('impact preview compares the proposed finish with current accepted contract dates and invalidates on revision', t => {
  const f = fixture(t);
  const current = job(f.ledger);
  const quote = acceptedQuote(f.ledger, current.id);
  const dates = new ClientDateCommitments(f.ledger);
  const dateSource = dates.view(current.id);
  const commitment = dates.command(current.id, {
    action: 'record', commandKey: 'review-contract-date-record-1', entryKey: 'contractual-completion-1',
    sourceType: 'quote', sourceId: quote.id, acceptedSourceHash: dateSource.acceptedSources[0].sourceHash,
    sourceHash: dateSource.sourceHash, dateKind: 'complete_by', date: '2026-09-08', label: 'Contract completion',
    contractWording: 'Complete the works no later than 8 September 2026.', evidenceReference: 'signed-quote-17, clause 8'
  }, 'office');
  const service = new ContractorReview(f.ledger);
  const scenario = { taskId: current.tasks[0].id, durationHours: 32, reason: 'Repair additional foundation damage' };
  const preview = service.preview(current.id, scenario);
  assert.deepEqual(preview.schedule.contractualCompletionDates.map(item => ({
    entryKey: item.entryKey, sourceCurrent: item.sourceCurrent, current: item.currentForecast, proposed: item.proposedForecast
  })), [{
    entryKey: commitment.entryKey, sourceCurrent: true,
    current: { status: 'within_date', daysLate: 0 }, proposed: { status: 'projected_late', daysLate: 1 }
  }]);
  assert.ok(preview.limitations.includes('contract_completion_compared_by_calendar_day'));
  const retained = service.retain(current.id, { ...scenario, sourceHash: preview.sourceHash, entryKey: 'review-with-contract-date' }, 'office').review;
  const currentDate = dates.view(current.id).commitments[0];
  const updatedView = dates.view(current.id);
  dates.command(current.id, {
    action: 'record', commandKey: 'review-contract-date-revise-1', entryKey: commitment.entryKey,
    expectedCommitmentHash: currentDate.commitmentHash, sourceType: 'quote', sourceId: quote.id,
    acceptedSourceHash: updatedView.acceptedSources[0].sourceHash, sourceHash: updatedView.sourceHash,
    dateKind: 'complete_by', date: '2026-09-10', label: 'Contract completion',
    contractWording: 'Complete the works no later than 10 September 2026.', evidenceReference: 'signed-quote-17, clause 8 revision'
  }, 'office');
  assert.equal(service.detail(current.id).reviews.find(item => item.id === retained.id).sourceCurrent, false);
});

test('impact preview derives takeoff quantity cost and revenue changes from current rates and stales after takeoff edits', t => {
  const f = fixture(t);
  const current = job(f.ledger);
  const takeoff = f.ledger.createTakeoff(current.id, { title: 'Foundation quantities', items: [
    { description: 'Concrete pads', measurementType: 'manual', quantity: 4, unit: 'm3', unitCost: 120, unitPrice: 210, costCode: 'CON-100', wbsCode: '01.20', workPackage: 'Foundations' }
  ] }, { actor: 'estimator' });
  const item = takeoff.items[0];
  const service = new ContractorReview(f.ledger);
  const scenario = { taskId: current.tasks[0].id, durationHours: 16, costDelta: 100, revenueDelta: 150,
    quantityChanges: [{ itemId: item.id, quantity: 6 }], reason: 'Additional foundation volume' };
  const preview = service.preview(current.id, scenario);
  assert.deepEqual(preview.quantityImpact.changes.map(change => ({
    currentQuantity: change.currentQuantity, proposedQuantity: change.proposedQuantity, quantityDelta: change.quantityDelta,
    costDelta: change.costDelta, revenueDelta: change.revenueDelta, wbsCode: change.wbsCode
  })), [{ currentQuantity: 4, proposedQuantity: 6, quantityDelta: 2, costDelta: 240, revenueDelta: 420, wbsCode: '01.20' }]);
  assert.equal(preview.financial.costDelta, 340);
  assert.equal(preview.financial.revenueDelta, 570);
  assert.equal(preview.financial.marginDelta, 230);
  assert.equal(preview.externalActions, false);
  assert.deepEqual(f.ledger.getTakeoff(current.id, takeoff.id).items[0].quantity, 4);
  const gbpTakeoff = f.ledger.createTakeoff(current.id, { title: 'Imported GBP estimate', currency: 'GBP', items: [
    { description: 'Specialist fitting', measurementType: 'manual', quantity: 1, unit: 'ea', unitCost: 40, unitPrice: 70, costCode: 'SP-100', wbsCode: '05.10', workPackage: 'Specialist work' }
  ] }, { actor: 'estimator' });
  const mixedCurrency = service.preview(current.id, { ...scenario, costDelta: 100, quantityChanges: [{ itemId: gbpTakeoff.items[0].id, quantity: 2 }] });
  assert.equal(mixedCurrency.financial.costDelta, 100);
  assert.equal(mixedCurrency.financial.takeoffCostDelta, null);
  assert.equal(mixedCurrency.financial.currencyMismatch, true);
  assert.equal(mixedCurrency.quantityImpact.changes[0].costDelta, 40);
  assert.equal(mixedCurrency.quantityImpact.changes[0].currency, 'GBP');
  assert.throws(() => service.preview(current.id, { ...scenario, quantityChanges: [{ itemId: 'foreign-takeoff-item', quantity: 2 }] }), { statusCode: 409 });
  assert.throws(() => service.preview(current.id, { ...scenario, quantityChanges: [
    { itemId: item.id, quantity: 5 }, { itemId: item.id, quantity: 6 }
  ] }), { statusCode: 400 });

  const retainedPreview = service.preview(current.id, scenario);
  const retained = service.retain(current.id, { ...scenario, sourceHash: retainedPreview.sourceHash, entryKey: 'quantity-impact-retain' }, 'office').review;
  f.ledger.updateTakeoffItem(current.id, takeoff.id, item.id, { quantity: 5 }, { actor: 'estimator' });
  assert.equal(service.detail(current.id).reviews.find(review => review.id === retained.id).sourceCurrent, false);
});

test('client decisions link to measured items and controlled drawing replacements stay approval-gated', t => {
  const f = fixture(t);
  const current = job(f.ledger);
  const selection = f.ledger.createClientSelection(current.id, { title: 'Opening dimensions', options: ['Standard', 'Wide'], status: 'pending_client' });
  const takeoff = f.ledger.createTakeoff(current.id, { title: 'Openings', items: [
    { description: 'Window opening', measurementType: 'manual', quantity: 1, unit: 'ea', unitCost: 800, unitPrice: 1200 }
  ] }, { actor: 'estimator' });
  const addPdf = suffix => {
    const bytes = Buffer.from(`%PDF-1.7\\nDrawing ${suffix}\\n%%EOF`);
    const checksum = crypto.createHash('sha256').update(bytes).digest('hex');
    return f.ledger.addDocument(current.id, { type: 'drawing_pdf', title: `Drawing ${suffix}`, filename: `${suffix}.pdf`,
      mimeType: 'application/pdf', size: bytes.length, storageRef: `uploads/${suffix}.pdf`, status: 'stored',
      analysis: { upload: { sha256: checksum, signatureVerified: true } } }, { actor: 'office' });
  };
  const createDrawing = (suffix, revision, supersedesDrawingId = null) => {
    const pdf = addPdf(suffix);
    return f.ledger.createDrawingRevision(current.id, { entryKey: `review-drawing-${suffix}`, sheetNumber: 'A-101', revision,
      title: 'Window plan', discipline: 'architecture', purpose: 'for_construction', issueDate: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
      sourceDocumentId: pdf.id, revisionReason: 'Window dimensions coordinated with the client selection.', supersedesDrawingId }, { actor: 'office' });
  };
  const first = createDrawing('p01', 'P01');
  f.ledger.resolveApproval(first.approval.id, { status: 'approved', resolvedBy: 'approver', reason: 'Verified controlled PDF revision.' });
  const second = createDrawing('p02', 'P02', first.id);
  const service = new ContractorReview(f.ledger);
  const links = [
    { targetType: 'takeoff_item', targetId: takeoff.items[0].id, rationale: 'The chosen opening changes this measured quantity.' },
    { targetType: 'drawing_revision', targetId: first.id, rationale: 'This choice is shown on the current controlled sheet.' }
  ];
  service.setClientDecisionImpacts(current.id, selection.id, { links }, 'office');
  const scenario = { taskId: current.tasks[0].id, durationHours: 8, reason: 'Review client opening change',
    quantityChanges: [{ itemId: takeoff.items[0].id, quantity: 2 }], drawingChanges: [{ currentDrawingId: first.id, proposedDrawingId: second.id }] };
  const preview = service.preview(current.id, scenario);
  assert.deepEqual(preview.affectedClientDecisions.map(item => item.links.map(link => link.targetType)), [['takeoff_item', 'drawing_revision']]);
  assert.equal(preview.drawingImpact[0].status, 'pending_approval');
  assert.equal(preview.drawingImpact[0].approvalStatus, 'pending');
  assert.equal(preview.externalActions, false);
  assert.throws(() => service.preview(current.id, { ...scenario, drawingChanges: [{ currentDrawingId: second.id, proposedDrawingId: first.id }] }), { statusCode: 409 });
  assert.throws(() => service.setClientDecisionImpacts(current.id, selection.id, { links: [
    { targetType: 'drawing_revision', targetId: second.id, rationale: 'Pending replacement must not be represented as current.' }
  ] }, 'office'), { statusCode: 409 });
  const retained = service.retain(current.id, { ...scenario, sourceHash: preview.sourceHash, entryKey: 'drawing-replacement-review' }, 'office').review;
  f.ledger.resolveApproval(second.approval.id, { status: 'approved', resolvedBy: 'approver', reason: 'Verified updated controlled PDF revision.' });
  assert.equal(service.detail(current.id).reviews.find(item => item.id === retained.id).sourceCurrent, false);
  assert.equal(service.detail(current.id).contractualContext.impactTargets.drawingRevisions.some(item => item.id === second.id), true);
});

test('material quantity impact accounts for accepted stock, explicitly linked open orders and affected work steps', t => {
  const f = fixture(t);
  const current = job(f.ledger);
  const requirement = f.ledger.addMaterialRequirement(current.id, { name: 'Concrete bags', quantity: 12, unit: 'bags', status: 'needed' });
  const task = f.ledger.addTask(current.id, { title: 'Pour footing', durationHours: 8, materialRequirementIds: [requirement.id] });
  f.ledger.db.prepare('UPDATE material_requirements SET data_json = ? WHERE id = ?').run(JSON.stringify({ availableQuantity: 3 }), requirement.id);
  f.ledger.db.prepare(`INSERT INTO purchase_orders
    (id,job_id,supplier,status,currency,amount,required_by,approval_id,items_json,data_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run('po-material-impact', current.id, 'Supplier', 'ordered', 'EUR', 100, null, null,
    JSON.stringify([{ lineKey: 'concrete-bags', materialRequirementId: requirement.id, name: requirement.name, quantity: 5, unit: requirement.unit }]),
    JSON.stringify({ orderIssued: true, externalCommitments: 1 }), '2026-09-01', '2026-09-01');
  f.ledger.db.prepare(`INSERT INTO purchase_orders
    (id,job_id,supplier,status,currency,amount,required_by,approval_id,items_json,data_json,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run('po-material-draft', current.id, 'Supplier', 'draft', 'EUR', 100, null, null,
    JSON.stringify([{ lineKey: 'unissued-concrete-bags', materialRequirementId: requirement.id, name: requirement.name, quantity: 100, unit: requirement.unit }]),
    '{}', '2026-09-01', '2026-09-01');
  const service = new ContractorReview(f.ledger);
  const before = service.source(current.id);
  const preview = service.preview(current.id, { taskId: current.tasks[0].id, durationHours: 8, reason: 'More concrete required',
    materialChanges: [{ requirementId: requirement.id, quantity: 16 }] });
  assert.deepEqual(preview.materialImpact.changes[0], {
    requirementId: requirement.id, name: 'Concrete bags', unit: 'bags', status: 'needed',
    currentQuantity: 12, proposedQuantity: 16, quantityDelta: 4, availableQuantity: 3, incomingQuantity: 5,
    currentShortfall: 4, proposedShortfall: 8, neededBy: null, supplier: null,
    readiness: 'additional_supply_confirmation_required',
    affectedTasks: [{ id: task.id, title: 'Pour footing', status: 'open', plannedStart: null, currentMaterialBlocker: true }],
    linkedPurchaseOrders: [
      { purchaseOrderId: 'po-material-draft', orderReference: 'po-material-draft', supplier: 'Supplier', status: 'draft', currency: 'EUR', requiredBy: null,
        orderIssued: false, externalCommitments: 0, orderedQuantity: 100, receivedQuantity: 0, acceptedQuantity: 0, damagedQuantity: 0, remainingQuantity: 100 },
      { purchaseOrderId: 'po-material-impact', orderReference: 'po-material-impact', supplier: 'Supplier', status: 'ordered', currency: 'EUR', requiredBy: null,
        orderIssued: true, externalCommitments: 1, orderedQuantity: 5, receivedQuantity: 0, acceptedQuantity: 0, damagedQuantity: 0, remainingQuantity: 5 }
    ]
  });
  assert.equal(preview.materialImpact.affectedTaskCount, 1);
  assert.deepEqual(service.source(current.id), before);
  assert.throws(() => service.preview(current.id, { taskId: current.tasks[0].id, durationHours: 8, reason: 'Foreign need',
    materialChanges: [{ requirementId: 'foreign-requirement', quantity: 1 }] }), { statusCode: 409 });
});

test('retained impact is idempotent, source-bound and does not approve or apply a change', t => {
  const f = fixture(t);
  const current = job(f.ledger);
  const service = new ContractorReview(f.ledger);
  const scenario = { taskId: current.tasks[0].id, durationHours: 16, costDelta: 300, revenueDelta: 450, reason: 'Additional excavation' };
  const preview = service.preview(current.id, scenario);
  const request = { ...scenario, sourceHash: preview.sourceHash, entryKey: 'operator-review-1' };
  const retained = service.retain(current.id, request, 'owner');
  assert.equal(retained.review.status, 'internal_analysis');
  assert.equal(service.retain(current.id, request, 'owner').replayed, true);
  assert.equal(f.ledger.verifyAuditIntegrity().valid, true);
  assert.throws(() => service.retain(current.id, { ...request, costDelta: 1 }, 'owner'), { statusCode: 409 });
  f.ledger.db.prepare('UPDATE jobs SET target_completion = ? WHERE id = ?').run('2026-09-12', current.id);
  assert.equal(service.detail(current.id).reviews[0].sourceCurrent, false);
  assert.throws(() => service.retain(current.id, { ...request, entryKey: 'new-review' }, 'owner'), { statusCode: 409 });
  assert.equal(f.ledger.calculateJobSchedule(current.id).projectDurationHours, 16);
  const reopened = new ContractorReview(f.reopen());
  assert.equal(reopened.detail(current.id).reviews[0].id, retained.review.id);
  assert.equal(reopened.detail(current.id).reviews[0].sourceCurrent, false);
});

test('current retained impact can prepare one source-linked approval-gated variation draft', t => {
  const f = fixture(t);
  const current = job(f.ledger);
  f.ledger.db.prepare('UPDATE jobs SET contract_value = ? WHERE id = ?').run(10_000, current.id);
  const service = new ContractorReview(f.ledger);
  const scenario = { taskId: current.tasks[0].id, durationHours: 16, costDelta: 300, revenueDelta: 450, reason: 'Additional excavation' };
  const preview = service.preview(current.id, scenario);
  const retained = service.retain(current.id, { ...scenario, sourceHash: preview.sourceHash, entryKey: 'impact-to-variation-1' }, 'owner').review;
  const request = {
    reviewId: retained.id,
    sourceHash: retained.sourceHash,
    entryKey: 'variation-from-impact-1',
    title: 'Additional excavation variation',
    scopeDelta: 'Excavate and remove the additional material beyond the measured foundation footprint.',
    amount: 900,
    scheduleDeltaDays: 1,
    variationType: 'unforeseen_condition',
    initiatedBy: 'site_condition'
  };

  const prepared = service.prepareVariation(current.id, request, 'owner');
  assert.equal(prepared.replayed, false);
  assert.equal(prepared.changeOrder.status, 'draft');
  assert.equal(prepared.changeOrder.amount, 900);
  assert.equal(prepared.changeOrder.workAuthorized, false);
  assert.equal(prepared.changeOrder.data.externalCommitments, 0);
  assert.ok(prepared.changeOrder.formalControl.evidenceReferences.includes(`change-impact:${retained.id}:${retained.sourceHash}`));
  assert.equal(prepared.changeOrder.data.source.reviewId, retained.id);
  assert.equal(f.ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(prepared.changeOrder.approvalId).status, 'pending');

  const replay = service.prepareVariation(current.id, request, 'retrying-owner');
  assert.equal(replay.replayed, true);
  assert.equal(replay.changeOrder.id, prepared.changeOrder.id);
  const currentReview = service.detail(current.id).reviews.find(item => item.id === retained.id);
  assert.equal(currentReview.sourceCurrent, true);
  assert.equal(currentReview.relatedVariations.length, 1);
  assert.equal(currentReview.relatedVariations[0].approvalStatus, 'pending');

  f.ledger.resolveApproval(prepared.changeOrder.approvalId, {
    status: 'approved',
    resolvedBy: 'commercial-approver',
    reason: 'Variation source, pricing, scope, and schedule checked.'
  });
  const approvedReview = service.detail(current.id).reviews.find(item => item.id === retained.id);
  assert.equal(approvedReview.sourceCurrent, true);
  assert.equal(approvedReview.relatedVariations[0].approvalStatus, 'approved');
  assert.equal(approvedReview.relatedVariations[0].workAuthorized, false);
  f.ledger.db.prepare('UPDATE jobs SET target_completion = ? WHERE id = ?').run('2026-09-15', current.id);
  assert.equal(service.detail(current.id).reviews.find(item => item.id === retained.id).sourceCurrent, false);

  assert.throws(() => service.prepareVariation(current.id, { ...request, entryKey: 'variation-from-impact-2' }, 'owner'), { statusCode: 409 });
  assert.equal(f.ledger.db.prepare('SELECT COUNT(*) AS count FROM change_orders WHERE job_id = ?').get(current.id).count, 1);
});

test('variation preparation rejects impact analysis after underlying dossier data changes', t => {
  const f = fixture(t);
  const current = job(f.ledger);
  f.ledger.db.prepare('UPDATE jobs SET contract_value = ? WHERE id = ?').run(10_000, current.id);
  const service = new ContractorReview(f.ledger);
  const scenario = { taskId: current.tasks[0].id, durationHours: 16, reason: 'Additional excavation' };
  const preview = service.preview(current.id, scenario);
  const retained = service.retain(current.id, { ...scenario, sourceHash: preview.sourceHash, entryKey: 'impact-to-stale-variation' }, 'owner').review;
  f.ledger.db.prepare('UPDATE jobs SET target_completion = ? WHERE id = ?').run('2026-10-01', current.id);
  assert.throws(() => service.prepareVariation(current.id, {
    reviewId: retained.id,
    sourceHash: retained.sourceHash,
    entryKey: 'stale-impact-variation',
    title: 'Stale change',
    scopeDelta: 'Add the revised foundation excavation.',
    amount: 100,
    scheduleDeltaDays: 0
  }, 'owner'), { statusCode: 409 });
  assert.equal(f.ledger.db.prepare('SELECT COUNT(*) AS count FROM change_orders WHERE job_id = ?').get(current.id).count, 0);
});

test('schedule float absorbs non-critical changes and source counts have no 500-row window', t => {
  const f = fixture(t);
  const current = job(f.ledger);
  const parallel = f.ledger.addTask(current.id, { title: 'Parallel preparation', durationHours: 4 });
  f.ledger.transaction(() => {
    const insert = f.ledger.db.prepare('INSERT INTO budget_lines (id, job_id, description, currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
    for (let n = 0; n < 505; n++) insert.run(`budget-${n}`, current.id, `Budget ${n}`, n === 504 ? 'GBP' : 'EUR', '2026-09-04', '2026-09-04');
  });
  const service = new ContractorReview(f.ledger);
  const preview = service.preview(current.id, { taskId: parallel.id, durationHours: 12, reason: 'More parallel preparation' });
  assert.equal(preview.schedule.finishDeltaHours, 0);
  assert.equal(preview.schedule.affectedTasks.length, 1);
  assert.equal(preview.financial.currencyMismatch, true);
  assert.equal(service.inspect(current.id).sources.budget_lines, 505);
});

test('suspension blocks a sweep and a lost lease rolls back its reports and cursor', t => {
  const f = fixture(t);
  job(f.ledger);
  const service = new ContractorReview(f.ledger);
  f.ledger.setAutomationControl({ status: 'suspended', reason: 'Owner stopped automatic drafting' });
  assert.throws(() => service.runBatch(), { statusCode: 423 });
  assert.equal(service.status().progress, null);
  f.ledger.setAutomationControl({ status: 'active', reason: 'Owner resumed automatic drafting' });
  const complete = f.ledger.completeScheduledJob.bind(f.ledger);
  f.ledger.completeScheduledJob = () => ({ completed: false });
  assert.throws(() => service.runBatch(), { statusCode: 409 });
  assert.equal(service.status().progress, null);
  assert.equal(f.ledger.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE entity_type = 'dossier_review'").get().count, 0);
  f.ledger.completeScheduledJob = complete;
});

test('an expired interrupted batch can be resumed by the operator', t => {
  const f = fixture(t);
  job(f.ledger);
  f.ledger.claimScheduledJob('portfolio_dossier_review', { intervalSeconds: 30, leaseSeconds: 10, now: new Date(Date.now() - 60000).toISOString() });
  const service = new ContractorReview(f.ledger);
  assert.equal(service.status().running, false);
  assert.equal(service.runBatch().progress.complete, true);
});
