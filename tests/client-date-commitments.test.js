const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { ClientDateCommitments } = require('../client-date-commitments');
const { OperationalRecovery } = require('../operational-recovery');
const { stableJson } = require('../backup-manifest');
const { approveLowRiskRegister } = require('./risk-register-fixture');

function fixture(t) {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  t.after(() => ledger.close());
  const job = ledger.createIntake({ title: 'Contractuele einddatum', client: { name: 'Klant' }, status: 'scheduled', targetCompletion: '2030-03-31', assignAutomatically: false }, { actor: 'office' });
  const scope = ledger.requestCommercialScopeRevision(job.id, { entryKey: 'contract-dates-scope-0001', title: 'Dakrenovatie',
    scopeSummary: 'De afgesproken dakrenovatie volgens de vastgelegde contractstukken.', inclusions: ['Dakbedekking vervangen.'],
    assumptions: ['Toegang tot het dak is beschikbaar.'], exclusions: ['Onvoorzien houtrot.'], clientResponsibilities: ['Toegang verzorgen.'],
    contractorResponsibilities: ['Werk uitvoeren en opleveren.'], allowanceMode: 'none', noAllowanceReason: 'Er zijn geen stelposten.',
    reason: 'Scope vastleggen voor offerte.' }, { actor: 'office' });
  ledger.resolveApproval(scope.approval.id, { status: 'approved', resolvedBy: 'approver' });
  const currentScope = ledger.getCommercialScopeRevision(scope.revision.id);
  approveLowRiskRegister(ledger, job.id, currentScope, 'contract-dates-risk-0001');
  const quote = ledger.createQuote(job.id, { commercialScopeRevisionId: currentScope.id, lineItems: [{ description: 'Dakrenovatie', quantity: 1, unitPrice: 1000 }] }, { actor: 'office' });
  ledger.resolveApproval(quote.approvalId, { status: 'approved', resolvedBy: 'approver' });
  const acceptance = ledger.requestQuoteAcceptance(job.id, quote.id, { acceptedAt: '2026-09-24', evidenceReference: 'ondertekende-offerte-17', notes: 'Ondertekende offerte ontvangen.' }, { actor: 'office' });
  ledger.resolveApproval(acceptance.approval.id, { status: 'approved', resolvedBy: 'contract-approver' });
  ledger.createIncidentRecord(job.id, { title: 'Toegang tijdelijk geblokkeerd', severity: 'low', status: 'reported', incidentType: 'other' }, { actor: 'office' });
  return { ledger, job, quote, dates: new ClientDateCommitments(ledger), recovery: new OperationalRecovery(ledger) };
}

function command(view, quote, overrides = {}) {
  return { action: 'record', commandKey: 'client-date-record-001', entryKey: 'definitieve-oplevering', sourceType: 'quote', sourceId: quote.id,
    acceptedSourceHash: view.acceptedSources[0].sourceHash, sourceHash: view.sourceHash, dateKind: 'complete_by', date: '2030-04-30',
    label: 'Definitieve oplevering', contractWording: 'De aannemer levert het werk uiterlijk op 30 april 2030 op.',
    evidenceReference: 'ondertekende-offerte-17, artikel 8.1', ...overrides };
}

test('only an accepted and independently verified client contract source can ground a commitment', t => {
  const { ledger, job, quote, dates } = fixture(t);
  const view = dates.view(job.id);
  assert.equal(view.acceptedSources.length, 1);
  assert.equal(view.acceptedSources[0].id, quote.id);
  assert.equal(view.acceptedSources[0].approvalId, ledger.getJobDetail(job.id).quotes[0].data.acceptance.approvalId);
  assert.throws(() => dates.command(job.id, command(view, quote, { acceptedSourceHash: 'not-the-current-accepted-source' }), 'office'), error => error.code === 'client_date_commitment_source_invalid');
  assert.equal(ledger.getJobDetail(job.id).targetCompletion, '2030-03-31');
});

test('contract dates are append-only, source-bound, idempotent and do not move internal schedule dates', t => {
  const { ledger, job, quote, dates } = fixture(t);
  const view = dates.view(job.id), request = command(view, quote);
  const first = dates.command(job.id, request, 'office');
  assert.equal(first.replayed, false);
  assert.equal(first.date, '2030-04-30');
  assert.equal(first.source.type, 'quote');
  assert.equal(dates.command(job.id, request, 'office').replayed, true);
  assert.throws(() => dates.command(job.id, command(view, quote, { date: '2030-05-01' }), 'office'), error => error.code === 'client_date_commitment_replay_conflict');
  const current = dates.view(job.id).commitments[0];
  assert.equal(current.sourceCurrent, true);
  assert.equal(current.revision, 1);
  assert.throws(() => dates.command(job.id, command(view, quote, { commandKey: 'other-source-check', entryKey: 'other-milestone' }), 'office'), error => error.code === 'client_date_commitment_source_changed');
  assert.equal(ledger.getJobDetail(job.id).targetCompletion, '2030-03-31');
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
});

test('a revised or withdrawn milestone retains every version and never edits the accepted source', t => {
  const { job, quote, dates } = fixture(t);
  const firstView = dates.view(job.id), firstRequest = command(firstView, quote);
  dates.command(job.id, firstRequest, 'office');
  const secondView = dates.view(job.id), current = secondView.commitments[0];
  const revision = dates.command(job.id, command(secondView, quote, { commandKey: 'client-date-revision-001', date: '2030-05-15', expectedCommitmentHash: current.commitmentHash }), 'office');
  assert.equal(revision.revision, 2);
  const thirdView = dates.view(job.id), revised = thirdView.commitments[0];
  const withdrawal = dates.command(job.id, { action: 'withdraw', commandKey: 'client-date-withdrawal-001', entryKey: revised.entryKey, sourceHash: thirdView.sourceHash,
    expectedCommitmentHash: revised.commitmentHash, withdrawalReason: 'Partijen hebben een nieuwe contractversie opgesteld.' }, 'office');
  assert.equal(withdrawal.status, 'withdrawn');
  const history = dates.view(job.id).commitments[0].history;
  assert.deepEqual(history.map(item => [item.revision, item.status, item.date]), [[1, 'active', '2030-04-30'], [2, 'active', '2030-05-15'], [3, 'withdrawn', '2030-05-15']]);
});

test('formally accepted variations are usable only while the exact issued package and delivery receipt remain valid', t => {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  t.after(() => ledger.close());
  ledger.updateOrganizationProfile({ legalName: 'Voorbeeld Aannemer B.V.', tradingName: 'Voorbeeld Aannemer', registrationNumber: '12345678',
    vatNumber: 'NL123456789B01', email: 'office@example.test', phone: '+31 20 123 4567', address: 'Werkstraat 1', postalCode: '1011 AA',
    city: 'Amsterdam', country: 'NL', iban: 'NL91ABNA0417164300', bic: 'ABNANL2A', defaultPaymentTermsDays: 30, defaultQuoteValidityDays: 30,
    quoteTerms: 'Wijzigingen starten na geverifieerd akkoord.' }, { actor: 'owner' });
  const job = ledger.createIntake({ title: 'Formele contractwijziging', client: { name: 'Klant', email: 'client@example.test' }, contractValue: 1000, assignAutomatically: false });
  const change = ledger.createChangeOrder(job.id, { title: 'Extra dakisolatie', scopeDelta: 'Aanvullende dakisolatie aanbrengen.', lineItems: [{ description: 'Isolatie', quantity: 1, unitPrice: 250 }] }, { actor: 'office' });
  ledger.resolveApproval(change.approvalId, { status: 'approved', resolvedBy: 'approver' });
  const issue = ledger.prepareChangeOrderIssuePackage(job.id, change.id, {}, { actor: 'office' });
  ledger.resolveApproval(issue.approval.id, { status: 'approved', resolvedBy: 'delivery-approver' });
  ledger.recordCommunicationDelivery(issue.communication.id, { integration: 'test-provider', providerMessageId: 'provider-message-change-1', receipt: { status: 'accepted-by-provider' } }, { actor: 'verified-integration' });
  const acceptance = ledger.requestChangeOrderAcceptance(job.id, change.id, { acceptedAt: '2026-09-24', evidenceReference: 'getekende-wijziging-3' }, { actor: 'office' });
  ledger.resolveApproval(acceptance.approval.id, { status: 'approved', resolvedBy: 'contract-approver' });
  const dates = new ClientDateCommitments(ledger), source = dates.view(job.id).acceptedSources.find(item => item.type === 'change_order');
  assert.ok(source, JSON.stringify(dates.view(job.id)));
  assert.equal(source.id, change.id);
  ledger.db.prepare("UPDATE communication_records SET data_json = REPLACE(data_json, 'provider-message-change-1', 'tampered-message-id') WHERE id = ?").run(issue.communication.id);
  assert.equal(dates.view(job.id).acceptedSources.some(item => item.id === change.id), false);
});

test('recording a client commitment makes already-open disruption recovery require fresh review', t => {
  const { ledger, job, quote, dates, recovery } = fixture(t);
  const initial = recovery.list(job.id), incident = initial.sources.find(source => source.type === 'safety_incident');
  const created = recovery.command(job.id, { action: 'create', entryKey: 'date-impact-recovery-case', sourceHash: initial.sourceHash,
    sources: [{ type: incident.type, id: incident.id }], owner: 'Werkvoorbereider', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'review_only', recoveryAction: 'Beoordeel of de verstoring de geaccepteerde contractdatum raakt.' }, 'office');
  const contractView = dates.view(job.id);
  dates.command(job.id, command(contractView, quote), 'office');
  const current = recovery.list(job.id), savedCase = current.cases.find(item => item.id === created.caseId);
  assert.equal(savedCase.sourceCurrent, false);
  assert.match(savedCase.staleReason, /opnieuw/);
  assert.equal(savedCase.sources[0].impact.clientDateCommitments[0].date, '2030-04-30');
  assert.throws(() => recovery.command(job.id, { action: 'update', entryKey: 'resolve-stale-date-case', caseId: savedCase.id,
    caseHash: savedCase.caseHash, sourceHash: current.sourceHash, status: 'resolved', resolutionEvidence: 'Afgerond.' }, 'office'),
  error => error.code === 'operational_recovery_source_changed');
  assert.equal(ledger.diagnose().valid, true);
});

test('recovery sources compare disrupted critical work with current approved schedule and contract dates', t => {
  const { ledger, job, quote, dates, recovery } = fixture(t);
  const task = ledger.addTask(job.id, { title: 'Dakbedekking plaatsen', durationHours: 8 });
  const baseline = ledger.requestScheduleBaseline(job.id, { plannedStart: '2030-04-29T08:00:00.000Z', reason: 'Goedgekeurde uitvoeringsbasis.' });
  ledger.resolveApproval(baseline.approval.id, { status: 'approved', resolvedBy: 'planner' });
  const worker = ledger.upsertWorker({ name: 'Dakdekker voor hersteltest', role: 'Dakdekker', status: 'available' });
  ledger.addAssignment(job.id, { workerId: worker.id, role: 'Dakdekker', status: 'planned',
    scheduledStart: '2030-04-29T08:00:00.000Z', scheduledEnd: '2030-04-29T16:00:00.000Z' });
  const absence = ledger.createWorkerAvailabilityPeriod(worker.id, { periodType: 'leave', title: 'Niet beschikbaar',
    startsAt: '2030-04-29T08:00:00.000Z', endsAt: '2030-04-29T16:00:00.000Z' }, { actor: 'office' });
  const dateView = dates.view(job.id);
  dates.command(job.id, command(dateView, quote), 'office');

  let source = recovery.list(job.id).sources.find(item => item.type === 'worker_availability' && item.id === absence.period.id);
  assert.equal(source.impact.scheduleProjection.baselineStatus, 'approved_current');
  assert.equal(source.impact.scheduleProjection.pathStatus, 'critical_path_affected');
  assert.ok(source.impact.scheduleProjection.affectedTasks.some(item => item.taskId === task.id));
  assert.equal(source.impact.scheduleProjection.contractComparisons[0].relation, 'baseline_on_or_before_date');

  ledger.transitionLifecycleRecord(job.id, 'task', task.id, { status: 'open', durationHours: 12 });
  source = recovery.list(job.id).sources.find(item => item.type === 'worker_availability' && item.id === absence.period.id);
  assert.equal(source.impact.scheduleProjection.baselineStatus, 'approved_stale');
  assert.equal(source.impact.scheduleProjection.pathStatus, 'not_comparable');
  assert.equal(ledger.diagnose().valid, true);
});

test('contract impact reviews bind an exact contract revision and disruption snapshot', t => {
  const { ledger, job, quote, dates, recovery } = fixture(t);
  const contractView = dates.view(job.id), recordedCommitment = dates.command(job.id, command(contractView, quote), 'office');
  const currentCommitment = dates.view(job.id).commitments[0];
  const view = recovery.list(job.id), incident = view.sources.find(source => source.type === 'safety_incident');
  const created = recovery.command(job.id, { action: 'create', entryKey: 'contract-impact-case-001', sourceHash: view.sourceHash,
    sources: [{ type: incident.type, id: incident.id }], owner: 'Werkvoorbereider', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'review_only', recoveryAction: 'Beoordeel het effect op de overeengekomen opleverdatum.' }, 'office');
  const current = recovery.list(job.id), item = current.cases.find(row => row.id === created.caseId);
  const review = { action: 'client_date_impact_review', entryKey: 'contract-impact-review-001', caseId: item.id, caseHash: item.caseHash,
    sourceHash: current.sourceHash, commitmentEntryKey: recordedCommitment.entryKey, commitmentHash: currentCommitment.commitmentHash,
    reviewStatus: 'at_risk', summary: 'De materiaalblokkade raakt de beschikbare uitvoeringsperiode.',
    nextFollowUpAt: new Date(Date.now() + 2 * 86_400_000).toISOString() };
  assert.throws(() => recovery.command(job.id, { ...review, entryKey: 'contract-impact-review-no-date', nextFollowUpAt: null }, 'office'),
    { code: 'operational_recovery_contract_follow_up_required' });
  assert.throws(() => recovery.command(job.id, { ...review, entryKey: 'contract-impact-review-fake', commitmentHash: 'f'.repeat(64) }, 'office'),
    { code: 'operational_recovery_contract_commitment_invalid' });
  const saved = recovery.command(job.id, review, 'office');
  assert.equal(recovery.command(job.id, review, 'office').replayed, true);
  let retained = recovery.list(job.id).cases.find(row => row.id === item.id);
  assert.equal(retained.clientDateImpactReviews.length, 1);
  assert.equal(retained.clientDateImpactReviews[0].current, true);
  assert.equal(retained.clientDateImpactReviews[0].commitment.date, '2030-04-30');
  assert.equal(retained.clientDateImpactReviews[0].status, 'at_risk');
  assert.equal(saved.status, 'open');

  const beforeRevision = dates.view(job.id), active = beforeRevision.commitments[0];
  dates.command(job.id, command(beforeRevision, quote, { commandKey: 'contract-date-revised-after-impact', date: '2030-05-15',
    expectedCommitmentHash: active.commitmentHash }), 'office');
  const changed = recovery.list(job.id), stale = changed.cases.find(row => row.id === item.id);
  assert.equal(stale.sourceCurrent, false);
  assert.equal(stale.clientDateImpactReviews[0].current, false);
  assert.throws(() => recovery.command(job.id, { ...review, entryKey: 'contract-impact-review-stale', caseHash: stale.caseHash,
    sourceHash: changed.sourceHash }, 'office'), { code: 'operational_recovery_source_changed' });
  recovery.command(job.id, { action: 'update', entryKey: 'contract-impact-reassess', caseId: stale.id, caseHash: stale.caseHash,
    sourceHash: changed.sourceHash, reassess: true, reviewNote: 'De contractdatum is herzien; de herstelimpact wordt opnieuw beoordeeld.',
    status: 'open', owner: stale.owner, dueAt: stale.dueAt, recoveryAction: stale.recoveryAction }, 'office');
  const reassessed = recovery.list(job.id), currentCase = reassessed.cases.find(row => row.id === item.id);
  const revisedCommitment = dates.view(job.id).commitments[0];
  recovery.command(job.id, { ...review, entryKey: 'contract-impact-review-revision-2', caseHash: currentCase.caseHash,
    sourceHash: reassessed.sourceHash, commitmentHash: revisedCommitment.commitmentHash,
    summary: 'De herziene contractdatum past na beoordeling weer bij het herstelplan.', nextFollowUpAt: null,
    reviewStatus: 'not_impacted' }, 'office');
  retained = recovery.list(job.id).cases.find(row => row.id === item.id);
  assert.deepEqual(retained.clientDateImpactReviews.map(row => row.current), [false, true]);
  assert.equal(ledger.getJobDetail(job.id).targetCompletion, '2030-03-31');
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
  assert.equal(ledger.diagnose().valid, true);
  const stored = ledger.db.prepare('SELECT snapshot_json FROM operational_recovery_cases WHERE id = ?').get(item.id);
  const tampered = JSON.parse(stored.snapshot_json); tampered.clientDateImpactReviews[0].summary = 'Niet de vastgelegde beoordeling.';
  const tamperedHash = crypto.createHash('sha256').update(stableJson(tampered)).digest('hex');
  ledger.db.prepare('UPDATE operational_recovery_cases SET snapshot_json = ?, snapshot_hash = ? WHERE id = ?').run(JSON.stringify(tampered), tamperedHash, item.id);
  assert.throws(() => require('../operational-recovery').verifyOperationalRecovery(ledger.db), /onveranderlijke auditregistratie/);
});
