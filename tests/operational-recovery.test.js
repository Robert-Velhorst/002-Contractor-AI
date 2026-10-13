const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ContractorOperatingLedger } = require('../operating-ledger');

test('material readiness compares evidence-backed availability with linked task starts only on a current approved baseline', t => {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  t.after(() => ledger.close());
  const recovery = new OperationalRecovery(ledger);
  const control = { baselineCurrent: true, activeBaseline: { status: 'approved', id: 'baseline-1', versionNumber: 2, plannedEnd: '2026-10-10' },
    tasks: [
      { id: 'task-early', title: 'Montage vroeg', plannedStart: '2026-10-05T07:00:00.000Z', critical: true, totalFloatHours: 0 },
      { id: 'task-later', title: 'Montage later', plannedStart: '2026-10-07T07:00:00.000Z', critical: false, totalFloatHours: 16 }
    ] };
  const source = { impact: { materialLines: [{ materialRequirementId: 'mat-1', itemName: 'Gevelprofielen', unit: 'stuks', shortfallQuantity: 3,
    expectedAvailableAt: '2026-10-06T12:00:00.000Z', expectedAvailableAtReference: 'leveranciersmail-123',
    affectedTasks: [{ id: 'task-early' }, { id: 'task-later' }] }] } };

  const projection = recovery.scheduleProjection(source, control, []);
  assert.deepEqual(projection.materialReadiness[0].tasks.map(task => task.status), ['expected_after_task_start', 'expected_by_task_start']);
  assert.equal(projection.materialReadiness[0].evidenceReference, 'leveranciersmail-123');
  assert.equal(projection.materialReadiness[0].tasks[0].critical, true);

  const staleProjection = recovery.scheduleProjection(source, { ...control, baselineCurrent: false }, []);
  assert.deepEqual(staleProjection.materialReadiness[0].tasks.map(task => task.status), ['not_comparable', 'not_comparable']);
  const unknownProjection = recovery.scheduleProjection({ impact: { materialLines: [{ ...source.impact.materialLines[0], expectedAvailableAt: null }] } }, control, []);
  assert.deepEqual(unknownProjection.materialReadiness[0].tasks.map(task => task.status), ['availability_unknown', 'availability_unknown']);
});
const { OperationalRecovery, verifyOperationalRecovery } = require('../operational-recovery');
const { FieldWorkPack } = require('../field-work-pack');
const { stableJson } = require('../backup-manifest');
const { approveLowRiskRegister } = require('./risk-register-fixture');

function fixture(t) {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  t.after(() => ledger.close());
  const startsAt = new Date(Date.now() + 8 * 86_400_000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 4 * 3_600_000).toISOString();
  const job = ledger.createIntake({ title: 'Dakherstel', client: { name: 'Klant' }, status: 'scheduled', scheduledStart: startsAt, scheduledEnd: endsAt });
  const material = ledger.addMaterialRequirement(job.id, { name: 'Dakrollen', quantity: 4, unit: 'rollen', status: 'needed' });
  const worker = ledger.upsertWorker({ name: 'Uitvoerder', role: 'Dakdekker', status: 'available' });
  const task = ledger.addTask(job.id, { title: 'Dakbedekking aanbrengen', durationHours: 4, assigneeId: worker.id, materialRequirementIds: [material.id] });
  const assignment = ledger.addAssignment(job.id, { workerId: worker.id, role: 'Dakdekker', status: 'assigned', scheduledStart: startsAt, scheduledEnd: endsAt });
  const absence = ledger.createWorkerAvailabilityPeriod(worker.id, { periodType: 'leave', title: 'Niet beschikbaar', startsAt, endsAt }, { actor: 'field_worker' });
  const receipt = ledger.createMaterialReceipt(job.id, {
    receiptReference: 'LEVERING-TEKORT-01', evidenceReference: 'bewijs:LEVERING-TEKORT-01', deliveredAt: new Date().toISOString(),
    receivedBy: 'Uitvoerder', finalDelivery: true, entryKey: 'short-delivery-001',
    lines: [{ lineKey: 'roof', materialRequirementId: material.id, itemName: material.name, unit: 'rollen', orderedQuantity: 4, receivedQuantity: 2, acceptedQuantity: 2 }]
  }, { actor: 'field_worker' });
  return { ledger, recovery: new OperationalRecovery(ledger), fieldPacks: new FieldWorkPack(ledger), job, material, task, worker, assignment,
    absence: absence.period, receipt: receipt.receipt };
}

test('one recovery case links worker absence and short delivery with current schedule impact', t => {
  const { ledger, recovery, job, absence, receipt } = fixture(t);
  const view = recovery.list(job.id);
  const selected = view.sources.filter(source => [absence.id, receipt.id].includes(source.id));
  assert.equal(selected.length, 2);
  assert.ok(selected.some(source => source.type === 'worker_availability' && source.impact.schedule.ready === false));
  assert.ok(selected.some(source => source.type === 'material_receipt' && source.impact.materialLines[0].shortfallQuantity === 2));

  const request = { action: 'create', entryKey: 'case-create-001', sourceHash: view.sourceHash,
    sources: selected.map(({ type, id }) => ({ type, id })), owner: 'Planner', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'resequence_work', recoveryAction: 'Controleer vervangende capaciteit en bevestig leverdatum bij de leverancier.' };
  const created = recovery.command(job.id, request, 'office_operator');
  assert.equal(created.replayed, false);
  assert.equal(recovery.command(job.id, request, 'office_operator').replayed, true);
  const retained = recovery.list(job.id).cases.find(item => item.id === created.caseId);
  assert.equal(retained.sourceCurrent, true);
  assert.equal(retained.sources.length, 2);
  assert.equal(retained.customerCommitmentReview, 'required_before_any_customer_date_change');
  assert.equal(retained.customerCommunication, 'not_sent');
  assert.deepEqual(retained.resolutionBlockers.map(blocker => blocker.code).sort(), ['availability_conflicts_open', 'material_shortfall_open']);
  assert.throws(() => recovery.command(job.id, { action: 'update', entryKey: 'case-close-open-disruptions', caseId: retained.id,
    caseHash: retained.caseHash, sourceHash: view.sourceHash, status: 'resolved', resolutionEvidence: 'Herstel gecontroleerd.' }, 'office_operator'),
  { code: 'operational_recovery_resolution_blocked' });
  assert.equal(ledger.diagnose().valid, true);
});

test('combined absence, material, contract-date and cost recovery closes only after each source is reviewed', t => {
  const { ledger, recovery, job, material, worker, assignment, absence } = fixture(t);
  const scope = ledger.requestCommercialScopeRevision(job.id, { entryKey: 'integrated-recovery-scope-001', title: 'Dakherstel',
    scopeSummary: 'Vervang de vastgelegde dakbedekking.', inclusions: ['Dakbedekking vervangen.'], assumptions: ['Veilige toegang is beschikbaar.'],
    exclusions: ['Onvoorzien constructieherstel.'], clientResponsibilities: ['Toegang verzorgen.'], contractorResponsibilities: ['Dakbedekking uitvoeren en opleveren.'],
    allowanceMode: 'none', noAllowanceReason: 'Geen stelposten.', reason: 'Accepted scope for the integrated recovery scenario.' }, { actor: 'office_operator' });
  ledger.resolveApproval(scope.approval.id, { status: 'approved', resolvedBy: 'scope_approver' });
  approveLowRiskRegister(ledger, job.id, ledger.getCommercialScopeRevision(scope.revision.id), 'integrated-recovery-risk-001');
  const quote = ledger.createQuote(job.id, { commercialScopeRevisionId: scope.revision.id,
    lineItems: [{ description: 'Dakherstel', quantity: 1, unitPrice: 5_000 }] }, { actor: 'office_operator' });
  ledger.resolveApproval(quote.approvalId, { status: 'approved', resolvedBy: 'quote_approver' });
  const acceptance = ledger.requestQuoteAcceptance(job.id, quote.id, { acceptedAt: '2026-09-24', evidenceReference: 'signed-roof-repair-001' }, { actor: 'office_operator' });
  ledger.resolveApproval(acceptance.approval.id, { status: 'approved', resolvedBy: 'contract_approver' });
  const { ClientDateCommitments } = require('../client-date-commitments');
  const dates = new ClientDateCommitments(ledger), dateView = dates.view(job.id), acceptedSource = dateView.acceptedSources[0];
  dates.command(job.id, { action: 'record', commandKey: 'integrated-client-date-001', entryKey: 'roof-completion-2030',
    sourceType: acceptedSource.type, sourceId: acceptedSource.id, acceptedSourceHash: acceptedSource.sourceHash, sourceHash: dateView.sourceHash,
    dateKind: 'complete_by', date: '2030-04-30', label: 'Dakwerk gereed', contractWording: 'Het dakwerk is uiterlijk 30 april 2030 gereed.',
    evidenceReference: 'signed-roof-repair-001, clause 4' }, 'office_operator');
  const expense = ledger.createExpenseReceipt(job.id, { entryKey: 'integrated-recovery-expense-001', expenseDate: new Date().toISOString().slice(0, 10),
    workerId: worker.id, workerName: worker.name, category: 'materials', vendor: 'Bouwmarkt', receiptReference: 'BON-INT-001',
    totalAmount: 121, taxAmount: 21, taxTreatment: 'recoverable', paymentMethod: 'company_card', costCode: 'REC-MAT-01', currency: 'EUR' }, { actor: 'field_worker' });
  ledger.resolveApproval(expense.approval.id, { status: 'approved', resolvedBy: 'expense_approver', reason: 'Bon en projecttoewijzing gecontroleerd.' });

  let view = recovery.list(job.id);
  const availabilitySource = view.sources.find(source => source.type === 'worker_availability' && source.id === absence.id);
  const materialSource = view.sources.find(source => source.type === 'material_receipt');
  const created = recovery.command(job.id, { action: 'create', entryKey: 'integrated-recovery-case-001', sourceHash: view.sourceHash,
    sources: [{ type: availabilitySource.type, id: availabilitySource.id }, { type: materialSource.type, id: materialSource.id }],
    owner: 'Werkvoorbereider', dueAt: new Date(Date.now() + 86_400_000).toISOString(), actionType: 'resequence_work',
    recoveryAction: 'Herstel personeelsdekking en materiaalbeschikbaarheid; controleer klantdatum en meerkosten.' }, 'office_operator');
  let item = recovery.list(job.id).cases.find(row => row.id === created.caseId);
  assert.ok(item.resolutionBlockers.some(blocker => blocker.code === 'availability_conflicts_open'));
  assert.ok(item.resolutionBlockers.some(blocker => blocker.code === 'material_shortfall_open'));
  assert.ok(item.resolutionBlockers.some(blocker => blocker.code === 'contract_date_unresolved'));

  const replacement = ledger.upsertWorker({ name: 'Vervangende dakdekker', role: 'Dakdekker', status: 'available' });
  const replacementRequest = ledger.requestAssignmentReplacement(job.id, assignment.id, { workerId: replacement.id,
    availabilityPeriodId: absence.id, reason: 'Approved coverage after retained worker unavailability.' }, { actor: 'office_operator' });
  ledger.resolveApproval(replacementRequest.approval.id, { status: 'approved', resolvedBy: 'independent_approver', reason: 'Role, availability and assignment coverage verified.' });
  ledger.createMaterialReceipt(job.id, { receiptReference: 'LEVERING-AANVULLING-INTEGRATED', evidenceReference: 'bewijs:LEVERING-AANVULLING-INTEGRATED',
    deliveredAt: new Date().toISOString(), receivedBy: 'Vervangende dakdekker', entryKey: 'integrated-recovery-receipt-002',
    lines: [{ lineKey: 'roof', materialRequirementId: material.id, itemName: material.name, unit: 'rollen', orderedQuantity: 4, receivedQuantity: 2, acceptedQuantity: 2 }] },
  { actor: 'field_worker' });

  view = recovery.list(job.id);
  item = view.cases.find(row => row.id === created.caseId);
  assert.equal(item.sourceCurrent, false, 'replacement and accepted replenishment require explicit case reassessment');
  const reassess = recovery.command(job.id, { action: 'update', entryKey: 'integrated-recovery-reassess-001', caseId: item.id,
    caseHash: item.caseHash, sourceHash: view.sourceHash, reassess: true, reviewNote: 'Vervangende dekking en volledige geaccepteerde aanvulling zijn bronmatig gecontroleerd.',
    status: 'open', owner: item.owner, dueAt: item.dueAt, recoveryAction: item.recoveryAction }, 'office_operator');
  view = recovery.list(job.id);
  item = view.cases.find(row => row.id === created.caseId);
  assert.equal(item.sourceCurrent, true);
  assert.notEqual(reassess.sourceHash, '');

  const commitment = dates.view(job.id).commitments[0];
  recovery.command(job.id, { action: 'client_date_impact_review', entryKey: 'integrated-date-review-001', caseId: item.id,
    caseHash: item.caseHash, sourceHash: view.sourceHash, commitmentEntryKey: commitment.entryKey, commitmentHash: commitment.commitmentHash,
    reviewStatus: 'not_impacted', summary: 'De geaccordeerde vervanger en geaccepteerde aanvulling behouden ruimte binnen de overeengekomen datum.',
    nextFollowUpAt: null }, 'office_operator');
  view = recovery.list(job.id);
  item = view.cases.find(row => row.id === created.caseId);
  assert.deepEqual(item.resolutionBlockers, []);
  const actual = view.actualCostSources.find(source => source.type === 'expense' && source.id === expense.expense.id);
  assert.equal(actual.availableCents, 10_000);
  recovery.command(job.id, { action: 'actual_cost_attribution', entryKey: 'integrated-cost-attribution-001', caseId: item.id,
    caseHash: item.caseHash, sourceHash: view.sourceHash, sourceType: actual.type, sourceId: actual.id,
    sourceFingerprint: actual.sourceFingerprint, amount: 60, rationale: 'Aantoonbaar deel van de extra herstelmaterialen.' }, 'office_operator');
  view = recovery.list(job.id);
  item = view.cases.find(row => row.id === created.caseId);
  recovery.command(job.id, { action: 'cost_impact_review', entryKey: 'integrated-cost-review-001', caseId: item.id,
    caseHash: item.caseHash, sourceHash: view.sourceHash, reviewStatus: 'estimate', amount: 60,
    summary: 'Werkelijke herstelkosten voorlopig toegerekend; nacalculatie volgt.', evidenceReference: 'BON-INT-001' }, 'office_operator');
  view = recovery.list(job.id);
  item = view.cases.find(row => row.id === created.caseId);
  assert.equal(item.clientDateImpactReviews[0].current, true);
  assert.equal(item.actualCostAttributions[0].amountCents, 6_000);
  assert.equal(item.costImpactReviews[0].current, true);
  assert.equal(item.sources.find(source => source.type === 'material_receipt').impact.materialLines[0].shortfallQuantity, 0);

  recovery.command(job.id, { action: 'update', entryKey: 'integrated-recovery-close-001', caseId: item.id,
    caseHash: item.caseHash, sourceHash: view.sourceHash, status: 'resolved',
    resolutionEvidence: 'Vervangende uitvoerder ingezet, ontbrekende rollen geaccepteerd, contractdatum beoordeeld en herstelkosten aan bronbon gekoppeld.' }, 'office_operator');
  const closed = recovery.list(job.id).cases.find(row => row.id === created.caseId);
  assert.equal(closed.status, 'resolved');
  assert.deepEqual(closed.resolutionBlockers, []);
  assert.equal(closed.resolutionReview.checkedBy, 'office_operator');
  assert.equal(closed.resolutionReview.sources.some(source => source.materialShortfalls.length > 0), false);
  assert.equal(closed.actualCostAttributions.reduce((total, row) => total + row.amountCents, 0), 6_000);
  assert.equal(closed.customerCommunication, 'not_sent');
  assert.equal(closed.externalCommitments, 0);
  assert.equal(ledger.diagnose().valid, true);
});

test('cost impact reviews retain source-bound euro estimates and unknown follow-up without posting finance entries', t => {
  const { ledger, recovery, job, absence, receipt } = fixture(t);
  const view = recovery.list(job.id);
  const created = recovery.command(job.id, { action: 'create', entryKey: 'cost-case-create-001', sourceHash: view.sourceHash,
    sources: [{ type: 'worker_availability', id: absence.id }, { type: 'material_receipt', id: receipt.id }],
    owner: 'Planner', dueAt: new Date(Date.now() + 86_400_000).toISOString(), actionType: 'review_only', recoveryAction: 'Herstel en kosten impact volgen.' }, 'office_operator');
  let item = recovery.list(job.id).cases.find(row => row.id === created.caseId);
  const estimate = { action: 'cost_impact_review', entryKey: 'cost-review-estimate-001', caseId: item.id, caseHash: item.caseHash,
    sourceHash: view.sourceHash, reviewStatus: 'estimate', amount: 1250.35, summary: 'Extra inzet en nalevering indicatief geraamd.', evidenceReference: 'offerte:HERSTEL-17' };
  assert.throws(() => recovery.command(job.id, { ...estimate, entryKey: 'cost-review-invalid-amount', amount: 1.001 }, 'office_operator'),
    { code: 'operational_recovery_cost_amount_invalid' });
  assert.throws(() => recovery.command(job.id, { ...estimate, entryKey: 'cost-review-missing-amount', amount: undefined }, 'office_operator'),
    { code: 'operational_recovery_cost_amount_invalid' });
  assert.throws(() => recovery.command(job.id, { ...estimate, entryKey: 'cost-review-missing-proof', evidenceReference: '' }, 'office_operator'),
    { code: 'operational_recovery_cost_evidence_required' });
  const saved = recovery.command(job.id, estimate, 'office_operator');
  assert.equal(saved.replayed, false);
  assert.equal(recovery.command(job.id, estimate, 'office_operator').replayed, true);
  item = recovery.list(job.id).cases.find(row => row.id === item.id);
  assert.equal(item.costImpactReviews[0].status, 'estimate');
  assert.equal(item.costImpactReviews[0].currency, 'EUR');
  assert.equal(item.costImpactReviews[0].amountCents, 125035);
  assert.equal(item.costImpactReviews[0].evidenceReference, 'offerte:HERSTEL-17');
  assert.equal(item.costImpactReviews[0].accountingPosted, false);
  assert.equal(item.costImpactReviews[0].externalCommitments, 0);
  assert.equal(item.costImpactReviews[0].current, true);

  const unknown = { action: 'cost_impact_review', entryKey: 'cost-review-unknown-001', caseId: item.id, caseHash: item.caseHash,
    sourceHash: view.sourceHash, reviewStatus: 'unknown', summary: 'Wacht op urenstaat van de vervanger.',
    nextFollowUpAt: new Date(Date.now() + 2 * 86_400_000).toISOString() };
  recovery.command(job.id, unknown, 'office_operator');
  const latest = recovery.list(job.id).cases.find(row => row.id === item.id);
  assert.deepEqual(latest.costImpactReviews.map(review => review.status), ['estimate', 'unknown']);
  assert.equal(latest.costImpactReviews[1].amountCents, null);
  assert.equal(latest.costImpactReviews[1].current, true);
  assert.equal(ledger.db.prepare("SELECT COUNT(*) AS count FROM audit_events WHERE action LIKE 'operational_recovery_cost_impact_review'").get().count, 2);
  assert.equal(verifyOperationalRecovery(ledger.db), true);
  assert.equal(ledger.diagnose().valid, true);
});

test('equipment outage links its reserved work to recovery and requires current equipment readiness before closure', t => {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  t.after(() => ledger.close());
  const recovery = new OperationalRecovery(ledger);
  const job = ledger.createIntake({ title: 'Materieelstoring dakwerk', status: 'scheduled', client: { name: 'Klant' } });
  const task = ledger.addTask(job.id, { title: 'Dakplaten zagen en monteren', durationHours: 6 });
  const tool = ledger.upsertTool({ name: 'Accuzaag dakploeg', category: 'power_tool', status: 'available' });
  assert.throws(() => ledger.reserveTool(job.id, { toolId: tool.id, taskId: 'task-from-another-job', neededFrom: new Date().toISOString() }),
    { code: 'tool_reservation_task_invalid' });
  const reservation = ledger.reserveTool(job.id, { toolId: tool.id, taskId: task.id,
    neededFrom: new Date(Date.now() + 86_400_000).toISOString(), neededUntil: new Date(Date.now() + 2 * 86_400_000).toISOString() });
  assert.equal(reservation.data.taskId, task.id);

  ledger.upsertTool({ id: tool.id, name: tool.name, category: tool.category, status: 'maintenance' });
  let view = recovery.list(job.id);
  let source = view.sources.find(item => item.type === 'equipment_unavailable' && item.id === reservation.id);
  assert.ok(source);
  assert.equal(source.impact.unresolved, true);
  assert.equal(source.impact.taskId, task.id);
  assert.equal(source.impact.scheduleProjection.affectedTasks[0].taskId, task.id);
  assert.equal(source.impact.toolStatus, 'maintenance');

  const created = recovery.command(job.id, { action: 'create', entryKey: 'equipment-outage-case-create', sourceHash: view.sourceHash,
    sources: [{ type: source.type, id: source.id }], owner: 'Materieelbeheer', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'recover_equipment', recoveryAction: 'Laat de zaag inspecteren, herstellen en opnieuw vrijgeven voor deze taak.' }, 'office_operator');
  let item = recovery.list(job.id).cases.find(row => row.id === created.caseId);
  assert.equal(item.actionType, 'recover_equipment');
  assert.throws(() => recovery.command(job.id, { action: 'update', entryKey: 'equipment-outage-close-before-repair', caseId: item.id,
    caseHash: item.caseHash, sourceHash: view.sourceHash, status: 'resolved', resolutionEvidence: 'Controle uitgevoerd.' }, 'office_operator'),
  { code: 'operational_recovery_resolution_blocked' });

  ledger.recordToolMaintenance(tool.id, { outcome: 'completed', maintenanceType: 'repair', performedBy: 'Werkplaats monteur',
    performedAt: new Date().toISOString(), notes: 'Voedingsschakelaar vervangen en werking gecontroleerd.', reference: 'onderhoudsbon:ZAAG-104' });
  view = recovery.list(job.id);
  item = view.cases.find(row => row.id === created.caseId);
  assert.equal(item.sourceCurrent, false, 'equipment status changes require explicit source reassessment');
  const reassessed = recovery.command(job.id, { action: 'update', entryKey: 'equipment-outage-reassess-after-repair', caseId: item.id,
    caseHash: item.caseHash, sourceHash: view.sourceHash, reassess: true,
    reviewNote: 'Werkplaatsbewijs gecontroleerd; materieel en gekoppelde taak opnieuw beoordeeld.',
    status: 'open', owner: item.owner, dueAt: item.dueAt, recoveryAction: item.recoveryAction }, 'office_operator');
  view = recovery.list(job.id);
  item = view.cases.find(row => row.id === created.caseId);
  assert.equal(item.sourceCurrent, true);
  assert.equal(item.sources[0].impact.unresolved, false);
  assert.deepEqual(item.resolutionBlockers, []);
  recovery.command(job.id, { action: 'update', entryKey: 'equipment-outage-close-after-repair', caseId: item.id,
    caseHash: item.caseHash, sourceHash: view.sourceHash, status: 'resolved', resolutionEvidence: `Hersteld en gecontroleerd; herbeoordeling ${reassessed.sourceHash.slice(0, 12)}.` }, 'office_operator');
  item = recovery.list(job.id).cases.find(row => row.id === created.caseId);
  assert.equal(item.status, 'resolved');
  assert.equal(item.resolutionReview.sources[0].equipmentAvailability.unresolved, false);
  assert.equal(verifyOperationalRecovery(ledger.db), true);
  assert.equal(ledger.diagnose().valid, true);
});

test('equipment outage exposes cross-job reservations and only conservative same-category replacement candidates', t => {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  t.after(() => ledger.close());
  const recovery = new OperationalRecovery(ledger);
  const firstJob = ledger.createIntake({ title: 'Dakherstel noord', status: 'scheduled' });
  const secondJob = ledger.createIntake({ title: 'Dakherstel zuid', status: 'scheduled' });
  const unavailable = ledger.upsertTool({ name: 'Defecte zaag', category: 'power_tool', status: 'available' });
  const date = (day, hour = '08') => `2030-03-${String(day).padStart(2, '0')}T${hour}:00:00.000Z`;
  const firstReservation = ledger.reserveTool(firstJob.id, { toolId: unavailable.id, neededFrom: date(10), neededUntil: date(10, '12') });
  ledger.reserveTool(secondJob.id, { toolId: unavailable.id, neededFrom: date(11), neededUntil: date(11, '12') });
  const freeCandidate = ledger.upsertTool({ name: 'Vrije zaag', category: 'power_tool', status: 'available', currentLocation: 'Werkplaats' });
  const occupiedCandidate = ledger.upsertTool({ name: 'Ingeplande zaag', category: 'power_tool', status: 'available' });
  const otherCategory = ledger.upsertTool({ name: 'Vrije boor', category: 'drill', status: 'available' });
  ledger.reserveTool(secondJob.id, { toolId: occupiedCandidate.id, neededFrom: date(10, '10'), neededUntil: date(10, '14') });
  ledger.upsertTool({ id: unavailable.id, name: unavailable.name, category: unavailable.category, status: 'maintenance' });

  const source = recovery.list(firstJob.id).sources.find(item => item.type === 'equipment_unavailable' && item.id === firstReservation.id);
  assert.ok(source);
  assert.equal(source.impact.affectedReservationCount, 2);
  assert.equal(source.impact.affectedReservationListComplete, true);
  assert.deepEqual(source.impact.affectedReservations.map(item => item.jobTitle).sort(), ['Dakherstel noord', 'Dakherstel zuid']);
  assert.equal(source.impact.replacementWindowKnown, true);
  assert.deepEqual(source.impact.replacementCandidates.map(item => item.toolId), [freeCandidate.id]);
  assert.equal(source.impact.replacementCompatibilityVerified, false);
  assert.equal(source.impact.replacementAssessment.requiresHumanFitCheck, true);
  assert.equal(source.impact.replacementCandidates[0].windowAvailable, true);
  assert.notEqual(source.impact.replacementCandidates[0].toolId, otherCategory.id);
});

test('open quality nonconformance is centrally discoverable, privacy-safe, and cannot be closed by recovery workflow', t => {
  const { ledger, recovery, job, worker } = fixture(t);
  const ncr = ledger.createNonconformance(job.id, {
    entryKey: 'recovery-quality-ncr-001', workerId: worker.id, severity: 'critical', discipline: 'structural',
    title: 'PRIVATE: client wall defect at a named address',
    description: 'Private evidence details stay in the NCR record and are not copied to the recovery portfolio.',
    location: 'Private address and room details', detectedAt: new Date(Date.now() - 60_000).toISOString(),
    raisedBy: worker.name, requirementReference: 'Controlled drawing revision B',
    immediateContainment: 'Isolate the affected work pending quality review.',
    responsibleParty: 'Named subcontract lead', dueAt: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
    notes: 'Private internal note.'
  }, { actor: 'quality_test' }).nonconformance;

  const portfolio = recovery.portfolio();
  const unassigned = portfolio.cases.find(item => item.kind === 'unassigned_source' && item.sourceId === ncr.id);
  assert.ok(unassigned, 'company portfolio discovers an unassigned open NCR');
  assert.equal(unassigned.sources[0].title, 'Kwaliteitsafwijking');
  assert.equal(unassigned.sources[0].severity, 'critical');
  assert.equal(unassigned.sources[0].operationalImpact.qualityDueAt, ncr.dueAt);
  assert.equal(JSON.stringify(unassigned).includes('PRIVATE'), false);
  assert.equal(JSON.stringify(unassigned).includes('Private evidence'), false);

  const view = recovery.list(job.id);
  const source = view.sources.find(item => item.type === 'quality_nonconformance' && item.id === ncr.id);
  assert.ok(source);
  assert.equal(source.title, 'Kwaliteitsafwijking');
  const created = recovery.command(job.id, { action: 'create', entryKey: 'quality-recovery-case-001', sourceHash: view.sourceHash,
    sources: [{ type: source.type, id: source.id }], owner: 'Kwaliteitsverantwoordelijke',
    dueAt: new Date(Date.now() + 86_400_000).toISOString(), actionType: 'stop_and_review',
    recoveryAction: 'Volg corrigerende actie en onafhankelijke sluitingscontrole.' }, 'office_operator');
  const item = recovery.list(job.id).cases.find(row => row.id === created.caseId);
  assert.ok(item.resolutionBlockers.some(blocker => blocker.code === 'quality_nonconformance_open'));
  assert.throws(() => recovery.command(job.id, { action: 'update', entryKey: 'quality-close-before-independent-review',
    caseId: item.id, caseHash: item.caseHash, sourceHash: view.sourceHash, status: 'resolved',
    resolutionEvidence: 'Recovery operator attempted to close quality issue.' }, 'office_operator'),
  { code: 'operational_recovery_resolution_blocked' });
  assert.equal(ledger.getNonconformance(ncr.id).status, 'open', 'recovery workflow does not alter the NCR lifecycle');
});

test('recovery cases allocate only approved actual project costs and support audited compensating corrections', t => {
  const { ledger, recovery, job, worker, absence } = fixture(t);
  const expense = ledger.createExpenseReceipt(job.id, { entryKey: 'recovery-actual-expense-01', expenseDate: new Date().toISOString().slice(0, 10),
    workerId: worker.id, workerName: worker.name, category: 'materials', vendor: 'Bouwmarkt', receiptReference: 'BON-REC-01',
    totalAmount: 121, taxAmount: 21, taxTreatment: 'recoverable', paymentMethod: 'personal_card', costCode: 'MAT-REC', currency: 'EUR' }, { actor: 'field_worker' });
  ledger.resolveApproval(expense.approval.id, { status: 'approved', resolvedBy: 'office_operator', reason: 'Bon en projecttoewijzing gecontroleerd.' });
  const view = recovery.list(job.id), actual = view.actualCostSources.find(item => item.type === 'expense' && item.id === expense.expense.id);
  assert.equal(actual.amountCents, 10000, 'only the approved net cost is recognized');
  const source = view.sources.find(item => item.type === 'worker_availability' && item.id === absence.id);
  const created = recovery.command(job.id, { action: 'create', entryKey: 'recovery-actual-case-01', sourceHash: view.sourceHash,
    sources: [{ type: source.type, id: source.id }], owner: 'Planner', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'review_only', recoveryAction: 'Extra materiaalkosten na verstoring beoordelen.' }, 'office_operator');
  let item = recovery.list(job.id).cases.find(row => row.id === created.caseId);
  const allocation = { action: 'actual_cost_attribution', entryKey: 'recovery-actual-allocation-01', caseId: item.id,
    caseHash: item.caseHash, sourceHash: view.sourceHash, sourceType: actual.type, sourceId: actual.id,
    sourceFingerprint: actual.sourceFingerprint, amount: 60, rationale: 'De helft betreft materiaal voor dit herstel.' };
  assert.throws(() => recovery.command(job.id, { ...allocation, entryKey: 'recovery-actual-over-allocation', amount: 100.01 }, 'office_operator'),
    { code: 'operational_recovery_actual_cost_exceeds_source' });
  const first = recovery.command(job.id, allocation, 'office_operator');
  item = recovery.list(job.id).cases.find(row => row.id === created.caseId);
  const second = recovery.command(job.id, { ...allocation, entryKey: 'recovery-actual-allocation-02', caseHash: item.caseHash,
    amount: 40, rationale: 'Resterend deel betreft aanvullende inzet op deze herstelactie.' }, 'office_operator');
  assert.ok(first.actualCostRecordId);
  assert.ok(second.actualCostRecordId);
  assert.equal(recovery.list(job.id).actualCostSources.find(row => row.id === actual.id).availableCents, 0);
  item = recovery.list(job.id).cases.find(row => row.id === created.caseId);
  recovery.command(job.id, { action: 'actual_cost_reversal', entryKey: 'recovery-actual-reversal-01', caseId: item.id,
    caseHash: item.caseHash, sourceHash: view.sourceHash, attributionId: first.actualCostRecordId,
    rationale: 'Correctie: een deel hoort bij regulier onderhoud.' }, 'office_operator');
  assert.equal(recovery.list(job.id).actualCostSources.find(row => row.id === actual.id).availableCents, 6000);
  item = recovery.list(job.id).cases.find(row => row.id === created.caseId);
  assert.equal(item.actualCostAttributions.find(row => row.id === first.actualCostRecordId).reversed, true);
  assert.equal(verifyOperationalRecovery(ledger.db), true);
  assert.equal(ledger.diagnose().valid, true);
});

test('availability recovery carries cross-job replacement options into one independent portfolio approval', t => {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  t.after(() => ledger.close());
  const worker = ledger.upsertWorker({ name: 'Afwezige vakman', role: 'Dakdekker', status: 'available' });
  const replacement = ledger.upsertWorker({ name: 'Beschikbare vervanger', role: 'Dakdekker', status: 'available', skills: ['dakwerk'] });
  const firstStart = new Date(Date.now() + 8 * 86_400_000), firstEnd = new Date(firstStart.getTime() + 2 * 3_600_000);
  const secondStart = new Date(firstStart.getTime() + 4 * 3_600_000), secondEnd = new Date(secondStart.getTime() + 2 * 3_600_000);
  const firstJob = ledger.createIntake({ title: 'Dakwerk woning A', client: { name: 'Klant A' }, status: 'scheduled', scheduledStart: firstStart.toISOString(), scheduledEnd: firstEnd.toISOString(), assignAutomatically: false });
  const secondJob = ledger.createIntake({ title: 'Dakwerk woning B', client: { name: 'Klant B' }, status: 'scheduled', scheduledStart: secondStart.toISOString(), scheduledEnd: secondEnd.toISOString(), assignAutomatically: false });
  ledger.addAssignment(firstJob.id, { workerId: worker.id, role: 'Dakdekker', status: 'planned', scheduledStart: firstStart.toISOString(), scheduledEnd: firstEnd.toISOString() });
  ledger.addAssignment(secondJob.id, { workerId: worker.id, role: 'Dakdekker', status: 'planned', scheduledStart: secondStart.toISOString(), scheduledEnd: secondEnd.toISOString() });
  const absence = ledger.createWorkerAvailabilityPeriod(worker.id, { periodType: 'leave', title: 'Niet beschikbaar', startsAt: firstStart.toISOString(), endsAt: secondEnd.toISOString() }, { actor: 'field_worker' });
  const recovery = new OperationalRecovery(ledger), view = recovery.list(firstJob.id);
  const source = view.sources.find(item => item.id === absence.period.id);
  assert.equal(source.workerId, worker.id);
  assert.equal(source.impact.crossJobConflictListComplete, true);
  assert.deepEqual(source.impact.crossJobConflicts.map(item => item.jobId).sort(), [firstJob.id, secondJob.id].sort());
  assert.ok(source.impact.crossJobConflicts.every(item => item.replacementCandidates.some(candidate => candidate.worker.id === replacement.id)));
  const portfolioItem = recovery.portfolio().cases.find(item => item.jobId === firstJob.id && item.sourceId === absence.period.id);
  assert.deepEqual(portfolioItem.triage, { priority: 'plan', action: 'confirm_workforce_coverage' });
  const listAvailability = ledger.listWorkerAvailabilityRegister.bind(ledger);
  ledger.listWorkerAvailabilityRegister = filters => ({ ...listAvailability(filters), conflictListComplete: false });
  const incompleteSource = recovery.list(firstJob.id).sources.find(item => item.id === absence.period.id);
  assert.equal(incompleteSource.impact.crossJobConflictListComplete, false);
  ledger.listWorkerAvailabilityRegister = listAvailability;
  const plan = ledger.requestWorkerAvailabilityReplacementPlan(worker.id, absence.period.id, {
    reason: 'Vervanging vanwege gemelde onbeschikbaarheid op twee opdrachten.',
    assignments: source.impact.crossJobConflicts.map(item => ({ assignmentId: item.assignmentId, workerId: replacement.id }))
  }, { actor: 'office_operator' });
  assert.equal(plan.approval.status, 'pending');
  assert.equal(plan.approval.targetType, 'assignment_replacement_plan');
  assert.equal(ledger.getJobDetail(firstJob.id).assignments.filter(item => item.workerId === worker.id).length, 1);
  assert.equal(ledger.getJobDetail(secondJob.id).assignments.filter(item => item.workerId === worker.id).length, 1);
  assert.equal(ledger.diagnose().valid, true);
});

test('absence recovery identifies only approved appointments for the affected person and retains a customer-impact review', t => {
  const { ledger, recovery, job, worker, absence } = fixture(t);
  const scheduledAt = new Date(Date.parse(absence.startsAt) + 60 * 60_000).toISOString();
  const appointment = ledger.createSiteVisit(job.id, { visitType: 'site_survey', status: 'confirmed', scheduledAt, assignee: worker.name }, { actor: 'office_operator' });
  assert.equal(appointment.status, 'pending_approval');
  ledger.resolveApproval(appointment.approvalId, { status: 'approved', resolvedBy: 'independent_approver', reason: 'Bezoek met klant bevestigd.' });
  const access = ledger.createClientPortalAccess(job.id, { label: 'Afspraak klantgesprek' });
  ledger.resolveApproval(access.approval.id, { status: 'approved' });
  const clientMessage = recovery.chat.create(access.id, { entryKey: 'appointment-client-message-01', body: 'Ik kan de afspraak op dinsdag bevestigen.' }, { direction: 'inbound' });
  const unrelatedWorkerAppointment = ledger.createSiteVisit(job.id, { visitType: 'site_survey', status: 'confirmed', scheduledAt, assignee: 'Andere uitvoerder' }, { actor: 'office_operator' });
  ledger.resolveApproval(unrelatedWorkerAppointment.approvalId, { status: 'approved', resolvedBy: 'independent_approver', reason: 'Andere uitvoerder bevestigd.' });
  const unapprovedAppointment = ledger.createSiteVisit(job.id, { visitType: 'site_survey', status: 'confirmed', scheduledAt, assignee: worker.name }, { actor: 'office_operator' });
  const recoveryView = recovery.list(job.id), source = recoveryView.sources.find(item => item.type === 'worker_availability' && item.id === absence.id);
  assert.equal(source.impact.clientAppointmentsComplete, true);
  assert.deepEqual(source.impact.clientAppointments.map(item => item.id), [appointment.id]);
  assert.equal(source.impact.clientAppointments[0].clientMessages[0].id, clientMessage.id);
  const created = recovery.command(job.id, { action: 'create', entryKey: 'appointment-recovery-case-01', sourceHash: recoveryView.sourceHash,
    sources: [{ type: source.type, id: source.id }], owner: 'Planner', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'replace_worker', recoveryAction: 'Beoordeel de klantafspraak die overlapt met de afwezigheid.' }, 'office_operator');
  const item = recovery.list(job.id).cases.find(row => row.id === created.caseId);
  recovery.chat.create(access.id, { entryKey: 'appointment-client-message-02', body: 'Mijn voorkeur is woensdagochtend.' }, { direction: 'inbound' });
  const staleView = recovery.list(job.id), staleReviewCase = staleView.cases.find(row => row.id === item.id);
  assert.equal(staleReviewCase.sourceCurrent, false);
  const staleReview = { action: 'client_impact_review', entryKey: 'appointment-impact-review-stale-chat', caseId: item.id, caseHash: item.caseHash,
    sourceHash: staleView.sourceHash, sourceId: source.id, appointmentId: appointment.id, reviewStatus: 'awaiting_customer',
    summary: 'Klantreactie afwachten.', accessId: access.id, messageId: clientMessage.id, messageHash: clientMessage.sourceHash,
    nextFollowUpAt: new Date(Date.now() + 2 * 86_400_000).toISOString() };
  assert.throws(() => recovery.command(job.id, staleReview, 'office_operator'), { code: 'operational_recovery_source_changed' });
  recovery.command(job.id, { action: 'update', entryKey: 'appointment-recovery-reassess-chat', caseId: item.id, caseHash: staleReviewCase.caseHash,
    sourceHash: staleView.sourceHash, reassess: true, reviewNote: 'Nieuw inkomend klantbericht gelezen; beoordeling opnieuw op huidige chat baseren.',
    status: item.status, owner: item.owner, dueAt: item.dueAt, recoveryAction: item.recoveryAction }, 'office_operator');
  const current = recovery.list(job.id), currentCase = current.cases.find(row => row.id === item.id), communicationCount = ledger.getJobDetail(job.id).communications.length;
  assert.equal(currentCase.sourceCurrent, true);
  const command = { action: 'client_impact_review', entryKey: 'appointment-impact-review-01', caseId: item.id, caseHash: currentCase.caseHash,
    sourceHash: current.sourceHash, sourceId: source.id, appointmentId: appointment.id, reviewStatus: 'awaiting_customer',
    summary: 'De klantreactie is vastgelegd; alternatieve uitvoerder afstemmen.', accessId: access.id,
    messageId: clientMessage.id, messageHash: clientMessage.sourceHash,
    nextFollowUpAt: new Date(Date.now() + 2 * 86_400_000).toISOString() };
  const recorded = recovery.command(job.id, command, 'office_operator');
  assert.ok(recorded.reviewId);
  assert.equal(recovery.command(job.id, command, 'office_operator').replayed, true);
  const retained = recovery.list(job.id).cases.find(row => row.id === item.id);
  assert.equal(retained.sourceCurrent, true);
  assert.equal(retained.clientImpactReviews.length, 1);
  assert.equal(retained.clientImpactReviews[0].appointment.approvalId, appointment.approvalId);
  assert.equal(retained.clientImpactReviews[0].messageEvidence.messageId, clientMessage.id);
  assert.equal(retained.clientImpactReviews[0].messageEvidence.messageHash, clientMessage.sourceHash);
  const afterReview = recovery.list(job.id), afterReviewCase = afterReview.cases.find(row => row.id === item.id);
  assert.throws(() => recovery.command(job.id, { ...command, entryKey: 'appointment-impact-review-fake', caseHash: afterReviewCase.caseHash,
    sourceHash: afterReview.sourceHash, messageId: 'invented-message', messageHash: 'f'.repeat(64) }, 'office_operator'),
    { code: 'operational_recovery_client_message_invalid' });
  assert.equal(ledger.getJobDetail(job.id).siteVisits.find(row => row.id === appointment.id).scheduledAt, scheduledAt);
  assert.equal(ledger.getJobDetail(job.id).siteVisits.find(row => row.id === unapprovedAppointment.id).status, 'pending_approval');
  assert.equal(ledger.getJobDetail(job.id).communications.length, communicationCount);
  ledger.db.prepare('UPDATE site_visits SET scheduled_at = ? WHERE id = ?').run(new Date(Date.parse(scheduledAt) + 86_400_000).toISOString(), appointment.id);
  const stale = recovery.list(job.id), staleCase = stale.cases.find(row => row.id === item.id);
  assert.equal(staleCase.sourceCurrent, false);
  assert.throws(() => recovery.command(job.id, { ...command, entryKey: 'appointment-impact-review-stale', caseHash: staleCase.caseHash,
    sourceHash: stale.sourceHash }, 'office_operator'), { code: 'operational_recovery_source_changed' });
  assert.equal(ledger.diagnose().valid, true);
  assert.equal(unapprovedAppointment.status, 'pending_approval');
  const conversationEvent = ledger.db.prepare("SELECT after_json FROM audit_events WHERE entity_type = 'conversation_source' AND entity_id = ? ORDER BY sequence_number DESC LIMIT 1").get(clientMessage.id);
  const tamperedMessage = JSON.parse(conversationEvent.after_json); tamperedMessage.body = 'Gewijzigd klantbericht';
  ledger.db.prepare("UPDATE audit_events SET after_json = ? WHERE entity_type = 'conversation_source' AND entity_id = ?").run(JSON.stringify(tamperedMessage), clientMessage.id);
  assert.throws(() => verifyOperationalRecovery(ledger.db), /bewaarde inkomende klantbericht/);
});

test('material recovery retains evidence-backed supplier follow-up without changing dates or sending messages', t => {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  t.after(() => ledger.close());
  const job = ledger.createIntake({ title: 'Materiaalherstel met leverancier', client: { name: 'Klant' }, assignAutomatically: false });
  const material = ledger.addMaterialRequirement(job.id, { name: 'Dakrollen', quantity: 4, unit: 'rollen', status: 'needed' });
  const requiredBy = new Date(Date.now() + 9 * 86_400_000).toISOString();
  const purchaseOrder = ledger.createPurchaseOrder(job.id, { status: 'draft', approvalThreshold: 10000, supplier: 'Dakmaterialen BV', amount: 400,
    requiredBy, items: [{ lineKey: 'roofing', materialRequirementId: material.id, name: material.name, quantity: 4, unit: 'rollen' }] });
  const receipt = ledger.createMaterialReceipt(job.id, { purchaseOrderId: purchaseOrder.id, receiptReference: 'LEVERING-TEKORT-55',
    evidenceReference: 'pakbon:LEVERING-TEKORT-55', deliveredAt: new Date().toISOString(), receivedBy: 'Uitvoerder', finalDelivery: true,
    entryKey: 'supplier-follow-up-receipt-55', lines: [{ lineKey: 'roofing', materialRequirementId: material.id, itemName: material.name,
      unit: 'rollen', receivedQuantity: 2, acceptedQuantity: 2 }] });
  const recovery = new OperationalRecovery(ledger), initial = recovery.list(job.id), source = initial.sources.find(item => item.id === receipt.receipt.id);
  assert.equal(source.impact.purchaseOrder.id, purchaseOrder.id);
  assert.equal(source.impact.purchaseOrder.supplier, 'Dakmaterialen BV');
  const created = recovery.command(job.id, { action: 'create', entryKey: 'supplier-recovery-case-55', sourceHash: initial.sourceHash,
    sources: [{ type: source.type, id: source.id }], owner: 'Werkvoorbereider', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'recover_material', recoveryAction: 'Vraag de ontbrekende dakrollen en leverdatum na.' }, 'office_operator');
  const current = recovery.list(job.id), item = current.cases.find(row => row.id === created.caseId);
  const communicationCountBeforeFollowUp = ledger.getJobDetail(job.id).communications.length;
  const input = { action: 'supplier_follow_up', entryKey: 'supplier-follow-up-eta-55', caseId: item.id, caseHash: item.caseHash,
    sourceHash: current.sourceHash, sourceId: receipt.receipt.id, followUpStatus: 'delivery_date_confirmed', summary: 'Leverancier bevestigt aanvulling van twee rollen.',
    evidenceReference: 'leverancier-email:2026-09-24-55', expectedAt: new Date(Date.now() + 12 * 86_400_000).toISOString() };
  assert.throws(() => recovery.command(job.id, { ...input, entryKey: 'supplier-follow-up-unissued-55', applyExpectedAvailability: true, materialRequirementId: material.id }, 'office_operator'),
    { code: 'operational_recovery_supplier_order_not_issued' });
  const recorded = recovery.command(job.id, input, 'office_operator');
  assert.ok(recorded.followUpId);
  assert.equal(recovery.command(job.id, input, 'office_operator').replayed, true);
  const retained = recovery.list(job.id).cases.find(row => row.id === item.id);
  assert.equal(retained.sourceCurrent, true);
  assert.equal(retained.supplierFollowUps.length, 1);
  assert.equal(retained.supplierFollowUps[0].purchaseOrderId, purchaseOrder.id);
  assert.equal(retained.supplierFollowUps[0].evidenceReference, 'leverancier-email:2026-09-24-55');
  assert.equal(ledger.getPurchaseOrder(purchaseOrder.id).requiredBy, requiredBy);
  assert.equal(ledger.getJobDetail(job.id).communications.length, communicationCountBeforeFollowUp);
  assert.equal(ledger.diagnose().valid, true);
});

test('supplier no-response follow-up requires a future review and current source version', t => {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  t.after(() => ledger.close());
  const job = ledger.createIntake({ title: 'Geen leveranciersreactie', client: { name: 'Klant' }, assignAutomatically: false });
  const material = ledger.addMaterialRequirement(job.id, { name: 'Kabelgoot', quantity: 10, unit: 'm', status: 'needed' });
  const po = ledger.createPurchaseOrder(job.id, { status: 'draft', approvalThreshold: 10000, supplier: 'Installatiehandel', amount: 100,
    items: [{ lineKey: 'tray', materialRequirementId: material.id, name: material.name, quantity: 10, unit: 'm' }] });
  const receipt = ledger.createMaterialReceipt(job.id, { purchaseOrderId: po.id, receiptReference: 'LEVERING-TEKORT-56', evidenceReference: 'pakbon:LEVERING-TEKORT-56',
    deliveredAt: new Date().toISOString(), receivedBy: 'Uitvoerder', entryKey: 'supplier-follow-up-receipt-56', lines: [{ lineKey: 'tray', materialRequirementId: material.id,
      itemName: material.name, unit: 'm', receivedQuantity: 6, acceptedQuantity: 6 }] });
  const recovery = new OperationalRecovery(ledger), initial = recovery.list(job.id), source = initial.sources.find(item => item.id === receipt.receipt.id);
  const created = recovery.command(job.id, { action: 'create', entryKey: 'supplier-recovery-case-56', sourceHash: initial.sourceHash,
    sources: [{ type: source.type, id: source.id }], owner: 'Werkvoorbereider', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'recover_material', recoveryAction: 'Vraag de ontbrekende kabelgoot na.' }, 'office_operator');
  const current = recovery.list(job.id), item = current.cases.find(row => row.id === created.caseId);
  const followUp = { action: 'supplier_follow_up', entryKey: 'supplier-no-response-56', caseId: item.id, caseHash: item.caseHash, sourceHash: current.sourceHash,
    sourceId: receipt.receipt.id, followUpStatus: 'no_response', summary: 'Geen reactie ontvangen; opnieuw contact opnemen.', evidenceReference: 'belnotitie:2026-09-24-56' };
  assert.throws(() => recovery.command(job.id, followUp, 'office_operator'), { code: 'operational_recovery_supplier_follow_up_required' });
  followUp.nextFollowUpAt = new Date(Date.now() + 2 * 86_400_000).toISOString();
  assert.equal(recovery.command(job.id, followUp, 'office_operator').status, 'open');
  const retained = recovery.list(job.id).cases.find(row => row.id === item.id);
  assert.equal(retained.supplierFollowUps[0].status, 'no_response');
  assert.ok(retained.supplierFollowUps[0].nextFollowUpAt);
});

test('material requirement shortfalls become owned recovery cases and accept evidence-backed supplier follow-up', t => {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  t.after(() => ledger.close());
  const job = ledger.createIntake({ title: 'Materiaaltekort zonder ontvangst', client: { name: 'Klant' }, assignAutomatically: false });
  const material = ledger.addMaterialRequirement(job.id, { name: 'Gevelprofielen', quantity: 8, unit: 'stuks', status: 'needed', supplier: 'Gevelbouw BV' });
  const worker = ledger.upsertWorker({ name: 'Monteur', role: 'Gevelmonteur', status: 'available' });
  const task = ledger.addTask(job.id, { title: 'Gevelprofielen monteren', durationHours: 5, assigneeId: worker.id, materialRequirementIds: [material.id] });
  const draftOrder = ledger.createPurchaseOrder(job.id, { status: 'draft', approvalThreshold: 10000, supplier: 'Gevelbouw BV', amount: 800,
    items: [{ lineKey: 'profiles', materialRequirementId: material.id, name: material.name, quantity: 8, unit: material.unit }] });
  const recovery = new OperationalRecovery(ledger);
  let view = recovery.list(job.id), source = view.sources.find(item => item.type === 'material_requirement_shortfall' && item.id === material.id);
  const draftOnlySourceHash = view.sourceHash;
  assert.ok(source);
  assert.equal(source.impact.materialLines[0].shortfallQuantity, 8, 'draft order is not delivery coverage');
  assert.equal(source.impact.materialLines[0].affectedTasks[0].id, task.id);
  assert.equal(source.impact.purchaseOrder, null);

  ledger.updateOrganizationProfile({ legalName: 'Herstelbedrijf B.V.', tradingName: 'Herstelbedrijf', registrationNumber: '12345678',
    vatNumber: 'NL123456789B01', email: 'orders@herstelbedrijf.example', phone: '+31 30 123 45 67', address: 'Werkstraat 1',
    postalCode: '3511 AA', city: 'Utrecht', country: 'NL', iban: 'NL91 ABNA 0417 1643 00', bic: 'ABNANL2A' }, { actor: 'office_operator' });
  const supplier = ledger.upsertTradePartner({ name: 'Gevelbouw BV', partnerType: 'supplier', contactName: 'Inkoop', email: 'inkoop@gevelbouw.example',
    phone: '+31 10 555 12 34', address: 'Leveranciersstraat 20', city: 'Rotterdam', country: 'NL', registrationNumber: '88776651',
    vatNumber: 'NL987654321B01', verificationReference: 'KVK-GEVEL-001', verifiedAt: new Date().toISOString() }, { actor: 'office_operator' });
  const issuedOrder = ledger.createPurchaseOrder(job.id, { status: 'ready_to_order', requiresApproval: true, tradePartnerId: supplier.id,
    supplier: supplier.name, amount: 500, requiredBy: new Date(Date.now() + 7 * 86_400_000).toISOString(),
    items: [{ lineKey: 'profiles-issued', materialRequirementId: material.id, name: material.name, quantity: 5, unit: material.unit, unitCost: 100 }] }, { actor: 'office_operator' });
  ledger.resolveApproval(issuedOrder.approval.id, { status: 'approved', resolvedBy: 'purchase_approver', reason: 'Leverancier, scope en bedrag gecontroleerd.' });
  const prepared = ledger.preparePurchaseOrderIssuePackage(job.id, issuedOrder.id, {}, { actor: 'office_operator' });
  ledger.resolveApproval(prepared.approval.id, { status: 'approved', resolvedBy: 'delivery_approver', reason: 'Bestelgegevens en ontvanger gecontroleerd.' });
  ledger.recordCommunicationDelivery(prepared.communication.id, { integration: 'verified-order-provider', providerMessageId: 'material-recovery-order-01',
    receipt: { status: 'accepted' } }, { actor: 'verified_integration' });
  const leadTimeRisk = { requiredBy: issuedOrder.requiredBy, historicalP75EquivalentCompletionAt: new Date(Date.now() + 10 * 86_400_000).toISOString(),
    historicalLeadTimeDays: 10, sampleSize: 4 };
  recovery.supplierLeadTimeRiskIndex = () => new Map([[issuedOrder.id, leadTimeRisk]]);
  view = recovery.list(job.id); source = view.sources.find(item => item.type === 'material_requirement_shortfall' && item.id === material.id);
  assert.notEqual(view.sourceHash, draftOnlySourceHash, 'issuing a linked order changes the source evidence hash');
  assert.equal(source.impact.materialLines[0].shortfallQuantity, 3);
  assert.equal(source.impact.materialLines[0].undeliveredOrderQuantity, 5);
  assert.equal(source.impact.purchaseOrder.id, issuedOrder.id);
  assert.deepEqual(source.impact.materialLines[0].supplierLeadTimeRisks, [{ supplier: supplier.name,
    requiredBy: issuedOrder.requiredBy, ...leadTimeRisk }]);

  const created = recovery.command(job.id, { action: 'create', entryKey: 'material-requirement-recovery-case-01', sourceHash: view.sourceHash,
    sources: [{ type: source.type, id: source.id }], owner: 'Werkvoorbereider', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'recover_material', recoveryAction: 'Vraag aanvulling van drie gevelprofielen en bevestig de leverdatum.' }, 'office_operator');
  let current = recovery.list(job.id); const item = current.cases.find(row => row.id === created.caseId);
  assert.equal(item.sources[0].type, 'material_requirement_shortfall');
  assert.ok(item.resolutionBlockers.some(blocker => blocker.code === 'material_shortfall_open'));
  const plannedStart = new Date(Date.now() + 86_400_000).toISOString();
  assert.equal(ledger.calculateJobSchedule(job.id, { plannedStart }).materialBlockers[0].reason, 'expected_availability_unknown');
  const expectedAt = new Date(Date.now() + 5 * 86_400_000).toISOString();
  const followUp = { action: 'supplier_follow_up', entryKey: 'material-requirement-supplier-follow-up-01', caseId: item.id,
    caseHash: item.caseHash, sourceHash: current.sourceHash, sourceId: material.id, followUpStatus: 'delivery_date_confirmed',
    summary: 'Leverancier bevestigt aanvulling van drie profielen.', evidenceReference: 'e-mail:gevelbouw:2026-09-24',
    expectedAt, applyExpectedAvailability: true, materialRequirementId: material.id };
  assert.throws(() => recovery.command(job.id, { ...followUp, entryKey: 'material-requirement-supplier-wrong-id', materialRequirementId: 'foreign-material' }, 'office_operator'),
    { code: 'operational_recovery_supplier_eta_scope_invalid' });
  const communicationCount = ledger.getJobDetail(job.id).communications.length;
  const recorded = recovery.command(job.id, followUp, 'office_operator');
  assert.ok(recorded.followUpId);
  assert.equal(recorded.materialAvailabilityUpdated, true);
  assert.equal(recorded.materialRequirementId, material.id);
  assert.equal(recorded.reassessmentRequired, true);
  assert.equal(recovery.command(job.id, followUp, 'office_operator').replayed, true);
  current = recovery.list(job.id);
  const retained = current.cases.find(row => row.id === item.id);
  assert.equal(retained.sourceCurrent, false, 'applying the supplier date invalidates the case source for explicit reassessment');
  assert.equal(retained.supplierFollowUps[0].sourceType, 'material_requirement_shortfall');
  assert.equal(retained.supplierFollowUps[0].sourceId, material.id);
  assert.equal(retained.supplierFollowUps[0].purchaseOrderId, issuedOrder.id);
  assert.equal(retained.supplierFollowUps[0].appliedToMaterialAvailability, true);
  const scheduled = ledger.calculateJobSchedule(job.id, { plannedStart });
  assert.equal(scheduled.ready, true);
  assert.equal(scheduled.materialConstraints[0].expectedAvailableAt, expectedAt);
  assert.equal(scheduled.tasks.find(row => row.id === task.id).plannedStart, expectedAt);
  assert.equal(ledger.getPurchaseOrder(draftOrder.id).orderIssued, false);
  assert.equal(ledger.getPurchaseOrder(issuedOrder.id).requiredBy, issuedOrder.requiredBy, 'the confirmed date does not rewrite the purchase order');
  assert.equal(ledger.getJobDetail(job.id).communications.length, communicationCount);
  assert.equal(ledger.diagnose().valid, true);
  const currentRiskHash = current.sourceHash;
  recovery.supplierLeadTimeRiskIndex = () => new Map([[issuedOrder.id, { ...leadTimeRisk, sampleSize: 5 }]]);
  const changedRisk = recovery.list(job.id);
  assert.notEqual(changedRisk.sourceHash, currentRiskHash, 'updated supplier history invalidates the displayed recovery source');
  assert.equal(changedRisk.cases.find(row => row.id === item.id).sourceCurrent, false);
});

test('material shortfall can issue linked free warehouse stock atomically and count it as in transit', t => {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  t.after(() => ledger.close());
  const { SharedMaterialStock } = require('../shared-material-stock');
  const stock = new SharedMaterialStock(ledger);
  const counted = stock.count({ name: 'Kabelgoot', unit: 'm', countedQuantity: 10, reference: 'TEL-2026-09-25',
    note: 'Magazijntelling', entryKey: 'warehouse-recovery-count-01' }, { actor: 'warehouse_operator' });
  const job = ledger.createIntake({ title: 'Kabelgoot tekort', client: { name: 'Klant' }, assignAutomatically: false });
  const material = ledger.addMaterialRequirement(job.id, { name: 'Kabelgoot', materialId: counted.material.id, quantity: 8, unit: 'm', status: 'needed' });
  const recovery = new OperationalRecovery(ledger);
  let view = recovery.list(job.id);
  let source = view.sources.find(item => item.type === 'material_requirement_shortfall' && item.id === material.id);
  assert.equal(source.impact.materialLines[0].shortfallQuantity, 8);
  assert.equal(source.impact.materialLines[0].undeliveredOrderQuantity, 0);
  assert.equal(source.impact.materialLines[0].warehouseAvailableQuantity, 10);
  const created = recovery.command(job.id, { action: 'create', entryKey: 'warehouse-recovery-case-01', sourceHash: view.sourceHash,
    sources: [{ type: source.type, id: source.id }], owner: 'Magazijn', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'recover_material', recoveryAction: 'Geef de beschikbare kabelgoot naar de bouwplaats uit.' }, 'office_operator');
  view = recovery.list(job.id);
  const item = view.cases.find(row => row.id === created.caseId);
  const command = { action: 'warehouse_material_issue', entryKey: 'warehouse-recovery-issue-01', caseId: item.id, caseHash: item.caseHash,
    sourceHash: view.sourceHash, sourceId: material.id, quantity: 6, sourceReference: 'TEL-2026-09-25',
    dispatchReference: 'RIT-LOC-001', evidenceReference: 'bon:MAG-001',
    expectedArrivalAt: new Date(Date.now() + 86_400_000).toISOString(), note: 'Mee met de ochtendrit.' };
  assert.throws(() => recovery.command(job.id, { ...command, entryKey: 'warehouse-recovery-issue-too-much', quantity: 9 }, 'office_operator'),
    { code: 'operational_recovery_warehouse_quantity_invalid' });
  assert.equal(stock.list().materials[0].stockQuantity, 10, 'invalid quantity leaves inventory untouched');
  const issued = recovery.command(job.id, command, 'office_operator');
  assert.equal(issued.warehouseMaterialIssue.quantity, 6);
  assert.equal(issued.replayed, false);
  assert.equal(recovery.command(job.id, command, 'office_operator').replayed, true);
  assert.equal(stock.list().materials[0].stockQuantity, 4);
  assert.equal(stock.list().siteIssues[0].status, 'in_transit');
  const updated = recovery.list(job.id);
  const changedCase = updated.cases.find(row => row.id === item.id);
  const updatedSource = updated.sources.find(row => row.id === material.id && row.type === source.type);
  assert.equal(changedCase.sourceCurrent, false, 'warehouse movement requires explicit recovery reassessment');
  assert.equal(updatedSource.impact.materialLines[0].warehouseInTransitQuantity, 6);
  assert.equal(updatedSource.impact.materialLines[0].undeliveredOrderQuantity, 0, 'warehouse issue is not mislabeled as a supplier order');
  assert.equal(updatedSource.impact.materialLines[0].shortfallQuantity, 2);
  assert.equal(updatedSource.impact.materialLines[0].warehouseAvailableQuantity, 4);
  assert.equal(ledger.diagnose().valid, true);
});

test('recovery command rejects stale sources and cannot resolve without evidence', t => {
  const { recovery, job, absence } = fixture(t);
  const first = recovery.list(job.id);
  const source = first.sources.find(item => item.id === absence.id);
  const created = recovery.command(job.id, { action: 'create', entryKey: 'case-create-002', sourceHash: first.sourceHash,
    sources: [{ type: source.type, id: source.id }], owner: 'Planner', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'replace_worker', recoveryAction: 'Controleer geschikte vervanger.' }, 'office_operator');
  const current = recovery.list(job.id), row = current.cases.find(item => item.id === created.caseId);
  assert.throws(() => recovery.command(job.id, { action: 'update', entryKey: 'case-update-stale', caseId: row.id,
    caseHash: row.caseHash, sourceHash: 'stale', status: 'resolved' }, 'office_operator'), { code: 'operational_recovery_source_changed' });
  assert.throws(() => recovery.command(job.id, { action: 'update', entryKey: 'case-update-no-proof', caseId: row.id,
    caseHash: row.caseHash, sourceHash: current.sourceHash, status: 'resolved' }, 'office_operator'), /Bewijs van herstel/);
});

test('changed material impact requires an explicit reassessment before evidence-backed closure', t => {
  const { ledger, recovery, job, material, receipt } = fixture(t);
  const view = recovery.list(job.id), source = view.sources.find(item => item.id === receipt.id);
  const created = recovery.command(job.id, { action: 'create', entryKey: 'case-create-reassess', sourceHash: view.sourceHash,
    sources: [{ type: source.type, id: source.id }], owner: 'Planner', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'recover_material', recoveryAction: 'Levering aanvullen en planning opnieuw beoordelen.' }, 'office_operator');
  const openCase = recovery.list(job.id).cases.find(item => item.id === created.caseId);
  assert.ok(openCase.resolutionBlockers.some(blocker => blocker.code === 'material_shortfall_open'));
  assert.throws(() => recovery.command(job.id, { action: 'update', entryKey: 'case-close-short-material', caseId: openCase.id,
    caseHash: openCase.caseHash, sourceHash: recovery.list(job.id).sourceHash, status: 'resolved', resolutionEvidence: 'Tekort hersteld.' }, 'office_operator'),
  { code: 'operational_recovery_resolution_blocked' });
  ledger.createMaterialReceipt(job.id, { receiptReference: 'LEVERING-AANVULLING-01', evidenceReference: 'bewijs:LEVERING-AANVULLING-01',
    deliveredAt: new Date().toISOString(), receivedBy: 'Uitvoerder', entryKey: 'replacement-material-01',
    lines: [{ lineKey: 'roof', materialRequirementId: material.id, itemName: material.name, unit: 'rollen', orderedQuantity: 4, receivedQuantity: 2, acceptedQuantity: 2 }] }, { actor: 'field_worker' });
  const changed = recovery.list(job.id), row = changed.cases.find(item => item.id === created.caseId);
  assert.equal(row.sourceCurrent, false);
  assert.equal(row.sources[0].impact.materialLines[0].shortfallQuantity, 0);
  assert.throws(() => recovery.command(job.id, { action: 'update', entryKey: 'case-close-stale', caseId: row.id,
    caseHash: row.caseHash, sourceHash: changed.sourceHash, status: 'resolved', resolutionEvidence: 'Hersteld.' }, 'office_operator'), { code: 'operational_recovery_source_changed' });
  const reviewed = recovery.command(job.id, { action: 'update', entryKey: 'case-reassess-current', caseId: row.id, caseHash: row.caseHash,
    sourceHash: changed.sourceHash, reassess: true, reviewNote: 'De aanvullende levering is geaccepteerd; resterend tekort is nul.', status: 'open',
    owner: row.owner, dueAt: row.dueAt, recoveryAction: row.recoveryAction }, 'office_operator');
  const current = recovery.list(job.id).cases.find(item => item.id === row.id);
  assert.equal(current.sourceCurrent, true);
  assert.equal(current.sourceHash, reviewed.sourceHash);
  const closed = recovery.command(job.id, { action: 'update', entryKey: 'case-close-reviewed', caseId: row.id, caseHash: current.caseHash,
    sourceHash: recovery.list(job.id).sourceHash, status: 'resolved', resolutionEvidence: 'Aanvullende hoeveelheid is ontvangen en beschikbaar.' }, 'office_operator');
  assert.equal(closed.status, 'resolved');
  const resolvedCase = recovery.list(job.id).cases.find(item => item.id === created.caseId);
  assert.equal(resolvedCase.resolutionEvidence, 'Aanvullende hoeveelheid is ontvangen en beschikbaar.');
  assert.equal(resolvedCase.resolutionReview.sources[0].materialShortfalls.length, 0);
  assert.ok(resolvedCase.resolutionReview.checkedBy);
  assert.equal(ledger.diagnose().valid, true);
  const retainedRow = ledger.db.prepare('SELECT snapshot_json FROM operational_recovery_cases WHERE id = ?').get(created.caseId);
  const tamperedSnapshot = JSON.parse(retainedRow.snapshot_json);
  tamperedSnapshot.resolutionReview.checkedBy = 'unverified-editor';
  ledger.db.prepare('UPDATE operational_recovery_cases SET snapshot_json = ?,snapshot_hash = ? WHERE id = ?')
    .run(JSON.stringify(tamperedSnapshot), crypto.createHash('sha256').update(stableJson(tamperedSnapshot)).digest('hex'), created.caseId);
  assert.throws(() => verifyOperationalRecovery(ledger.db), { code: 'operational_recovery_integrity_failed' });
});

test('recovery cannot close a safety incident before its separate safety approval resolves it', t => {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  t.after(() => ledger.close());
  const job = ledger.createIntake({ title: 'Veiligheidsherstel', client: { name: 'Klant' }, assignAutomatically: false });
  const incident = ledger.createIncidentRecord(job.id, { title: 'Onveilige afscherming', severity: 'low', status: 'reported', incidentType: 'near_miss' }, { actor: 'office_operator' });
  const recovery = new OperationalRecovery(ledger), view = recovery.list(job.id);
  const source = view.sources.find(item => item.type === 'safety_incident' && item.id === incident.id);
  const created = recovery.command(job.id, { action: 'create', entryKey: 'incident-recovery-case-01', sourceHash: view.sourceHash,
    sources: [{ type: source.type, id: source.id }], owner: 'Veiligheidscoordinator', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'stop_and_review', recoveryAction: 'Laat de afscherming inspecteren en via de veiligheidsprocedure vrijgeven.' }, 'office_operator');
  const item = recovery.list(job.id).cases.find(row => row.id === created.caseId);
  assert.ok(item.resolutionBlockers.some(blocker => blocker.code === 'safety_review_open'));
  assert.throws(() => recovery.command(job.id, { action: 'update', entryKey: 'incident-case-close-early', caseId: item.id,
    caseHash: item.caseHash, sourceHash: recovery.list(job.id).sourceHash, status: 'resolved', resolutionEvidence: 'Situatie opgelost.' }, 'office_operator'),
  { code: 'operational_recovery_resolution_blocked' });
});

test('field work-pack blockers require same-worker task resumption evidence before office resolution', t => {
  const { ledger, recovery, fieldPacks, job, task, worker } = fixture(t);
  const pack = fieldPacks.read(job.id, worker.id);
  const blocked = fieldPacks.progress(job.id, worker.id, { sourceHash: pack.sourceHash, entryKey: 'field-blocker-report-01', taskId: task.id,
    status: 'blocked', progressPercent: 35, note: 'Twee bevestigingsbeugels ontbreken op locatie.' }, 'field_worker');
  const progress = ledger.getJobDetail(job.id).progress.find(item => item.id === blocked.record.progress.id);
  const view = recovery.list(job.id), blocker = view.sources.find(source => source.type === 'field_progress_blocker');
  assert.equal(blocker.id, progress.id);
  assert.equal(blocker.impact.note, 'Twee bevestigingsbeugels ontbreken op locatie.');
  assert.equal(blocker.impact.taskId, task.id);
  assert.equal(blocker.impact.followUpReports.length, 0);
  const created = recovery.command(job.id, { action: 'create', entryKey: 'field-blocker-case-01', sourceHash: view.sourceHash,
    sources: [{ type: blocker.type, id: blocker.id }], owner: 'Werkvoorbereider', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'recover_material', recoveryAction: 'Controleer de voorraad en regel de ontbrekende beugels.' }, 'office_operator');
  const otherWorker = ledger.upsertWorker({ name: 'Andere uitvoerder', role: 'Timmerman', status: 'available' });
  ledger.addAssignment(job.id, { workerId: otherWorker.id, role: 'Timmerman', status: 'assigned' });
  assert.deepEqual(fieldPacks.read(job.id, otherWorker.id).know.recoveryInstructions, []);
  assert.equal(recovery.list(job.id).sources.some(source => source.id === progress.id), false);
  const activeCase = recovery.list(job.id).cases.find(item => item.id === created.caseId);
  assert.equal(activeCase.sources[0].impact.note, 'Twee bevestigingsbeugels ontbreken op locatie.');
  const closeWithoutWorkerEvidence = { action: 'update', entryKey: 'field-blocker-close-without-proof', caseId: activeCase.id,
    caseHash: activeCase.caseHash, sourceHash: recovery.list(job.id).sourceHash, status: 'resolved',
    resolutionEvidence: 'De ontbrekende beugels zijn geleverd en gecontroleerd.' };
  assert.equal(activeCase.resolutionBlockers.some(blocker => blocker.code === 'field_instruction_missing'), true);
  const instruction = recovery.command(job.id, { action: 'field_instruction', entryKey: 'field-case-instruction-01', caseId: activeCase.id,
    caseHash: activeCase.caseHash, sourceHash: recovery.list(job.id).sourceHash, sourceId: progress.id,
    text: 'Controleer de aanvulling op locatie en hervat daarna dezelfde montage.' }, 'office_operator');
  const visibleInstruction = fieldPacks.read(job.id, worker.id);
  assert.deepEqual(visibleInstruction.know.recoveryInstructions.map(item => item.id), [instruction.fieldInstructionId]);
  assert.notEqual(visibleInstruction.sourceHash, pack.sourceHash);
  fieldPacks.progress(job.id, worker.id, { sourceHash: visibleInstruction.sourceHash,
    entryKey: 'field-blocker-premature-01', taskId: task.id, status: 'in_progress', progressPercent: 45,
    note: 'De montage is hervat.' }, 'field_worker');
  const pendingCase = recovery.list(job.id).cases.find(item => item.id === activeCase.id);
  assert.equal(pendingCase.resolutionBlockers.some(blocker => blocker.code === 'field_instruction_ack_pending'), true);
  fieldPacks.acknowledge(job.id, worker.id, { sourceHash: visibleInstruction.sourceHash, entryKey: 'field-instruction-read-01', understood: true }, 'field_worker');
  const resumed = fieldPacks.progress(job.id, worker.id, { sourceHash: fieldPacks.read(job.id, worker.id).sourceHash,
    entryKey: 'field-blocker-resumed-01', taskId: task.id, status: 'in_progress', progressPercent: 55,
    note: 'De nieuwe beugels zijn gecontroleerd en de montage is hervat.' }, 'field_worker');
  const changed = recovery.list(job.id), staleCase = changed.cases.find(item => item.id === activeCase.id);
  assert.equal(staleCase.sourceCurrent, false);
  assert.throws(() => recovery.command(job.id, { ...closeWithoutWorkerEvidence, entryKey: 'field-blocker-stale-close',
    caseHash: staleCase.caseHash, sourceHash: changed.sourceHash, resolutionReports: [{ sourceId: progress.id, progressId: resumed.record.progress.id }] }, 'office_operator'), { code: 'operational_recovery_source_changed' });
  const refreshed = recovery.command(job.id, { action: 'update', entryKey: 'field-blocker-reassess-after-resume', caseId: staleCase.id,
    caseHash: staleCase.caseHash, sourceHash: changed.sourceHash, reassess: true, reviewNote: 'Uitvoerder heeft op dezelfde taak gemeld dat het werk is hervat.',
    status: 'open', owner: staleCase.owner, dueAt: staleCase.dueAt, recoveryAction: staleCase.recoveryAction }, 'office_operator');
  assert.equal(refreshed.status, 'open');
  const currentCase = recovery.list(job.id).cases.find(item => item.id === staleCase.id);
  const acceptedReport = currentCase.sources[0].impact.followUpReports.find(item => item.id === resumed.record.progress.id);
  assert.ok(acceptedReport);
  const resolved = recovery.command(job.id, { ...closeWithoutWorkerEvidence, entryKey: 'field-blocker-resolved-01', caseId: currentCase.id,
    caseHash: currentCase.caseHash, sourceHash: recovery.list(job.id).sourceHash,
    resolutionReports: [{ sourceId: progress.id, progressId: acceptedReport.id }] }, 'office_operator');
  assert.equal(resolved.status, 'resolved');
  const after = recovery.list(job.id);
  assert.equal(after.sources.some(source => source.id === progress.id), false);
  assert.equal(after.cases.find(item => item.id === created.caseId).sourceCurrent, true);
  assert.equal(after.cases.find(item => item.id === created.caseId).resolutionEvidence, 'De ontbrekende beugels zijn geleverd en gecontroleerd.');
  assert.equal(after.cases.find(item => item.id === created.caseId).resolutionReports[0].taskId, task.id);
  assert.equal(recovery.command(job.id, { ...closeWithoutWorkerEvidence, entryKey: 'field-blocker-resolved-01', caseId: currentCase.id,
    caseHash: currentCase.caseHash, sourceHash: recovery.list(job.id).sourceHash,
    resolutionReports: [{ sourceId: progress.id, progressId: acceptedReport.id }] }, 'office_operator').replayed, true);
  assert.equal(ledger.diagnose().valid, true);
  const retainedRow = ledger.db.prepare('SELECT snapshot_json FROM operational_recovery_cases WHERE id = ?').get(created.caseId);
  const validSnapshot = JSON.parse(retainedRow.snapshot_json);
  const forgedSnapshot = structuredClone(validSnapshot);
  forgedSnapshot.resolutionReports[0].progressId = 'forged-worker-resumption';
  const serialized = JSON.stringify(forgedSnapshot), snapshotHash = crypto.createHash('sha256').update(stableJson(forgedSnapshot)).digest('hex');
  ledger.db.prepare('UPDATE operational_recovery_cases SET snapshot_json = ?,snapshot_hash = ? WHERE id = ?').run(serialized, snapshotHash, created.caseId);
  assert.throws(() => verifyOperationalRecovery(ledger.db), { code: 'operational_recovery_integrity_failed' });
  const forgedInstruction = structuredClone(validSnapshot);
  forgedInstruction.fieldInstructions[0].text = 'Tampered instruction';
  ledger.db.prepare('UPDATE operational_recovery_cases SET snapshot_json = ?,snapshot_hash = ? WHERE id = ?')
    .run(JSON.stringify(forgedInstruction), crypto.createHash('sha256').update(stableJson(forgedInstruction)).digest('hex'), created.caseId);
  assert.throws(() => verifyOperationalRecovery(ledger.db), { code: 'operational_recovery_integrity_failed' });
});

test('cancelling a recovery case returns its unresolved field blocker to the active source list', t => {
  const { ledger, recovery, job } = fixture(t);
  const progress = ledger.addProgressUpdate(job.id, { status: 'blocked', progressPercent: 15, note: 'De juiste bevestiger is nog niet beschikbaar.',
    source: 'field_work_pack', blockers: ['De juiste bevestiger is nog niet beschikbaar.'] }, { actor: 'field_worker:roofer-1' });
  const view = recovery.list(job.id), blocker = view.sources.find(source => source.id === progress.id);
  const created = recovery.command(job.id, { action: 'create', entryKey: 'field-blocker-cancel-01', sourceHash: view.sourceHash,
    sources: [{ type: blocker.type, id: blocker.id }], owner: 'Werkvoorbereider', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'recover_material', recoveryAction: 'Levering controleren.' }, 'office_operator');
  const linked = recovery.list(job.id).cases.find(item => item.id === created.caseId);
  recovery.command(job.id, { action: 'update', entryKey: 'field-blocker-cancelled-01', caseId: linked.id, caseHash: linked.caseHash,
    sourceHash: recovery.list(job.id).sourceHash, status: 'cancelled' }, 'office_operator');
  assert.equal(recovery.list(job.id).sources.some(source => source.id === progress.id), true);
});

test('recovery records fail closed if their retained snapshot changes', t => {
  const { ledger, recovery, job, absence } = fixture(t);
  const view = recovery.list(job.id), source = view.sources.find(item => item.id === absence.id);
  const created = recovery.command(job.id, { action: 'create', entryKey: 'case-create-003', sourceHash: view.sourceHash,
    sources: [{ type: source.type, id: source.id }], owner: 'Planner', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'review_only', recoveryAction: 'Opnieuw beoordelen.' }, 'office_operator');
  ledger.db.prepare("UPDATE operational_recovery_cases SET snapshot_json = '{}' WHERE id = ?").run(created.caseId);
  assert.throws(() => recovery.list(job.id), { code: 'operational_recovery_integrity_failed' });
  assert.equal(ledger.diagnose().valid, false);
});
