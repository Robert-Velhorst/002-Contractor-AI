const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { VariationImplementation } = require('../variation-implementation');

function temporaryLedger(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-variation-implementation-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return ledger;
}

function acceptVariation(ledger) {
  ledger.updateOrganizationProfile({
    legalName: 'Implementation Test Contractor B.V.',
    tradingName: 'Implementation Test Contractor',
    registrationNumber: '12345678',
    vatNumber: 'NL123456789B01',
    email: 'office@implementation.example',
    phone: '+31 20 555 0100',
    address: 'Teststraat 1',
    postalCode: '1012 AB',
    city: 'Amsterdam',
    country: 'NL',
    iban: 'NL91 ABNA 0417 1643 00',
    defaultPaymentTermsDays: 30,
    defaultQuoteValidityDays: 30,
    quoteTerms: 'No changed work without client acceptance.'
  }, { actor: 'owner' });
  const job = ledger.createIntake({
    title: 'Accepted variation implementation test',
    client: { name: 'Test Client', email: 'client@implementation.example', address: 'Clientstraat 2', city: 'Amsterdam', country: 'NL' },
    address: 'Projectstraat 3', city: 'Amsterdam', country: 'NL', contractValue: 1000, assignAutomatically: false
  }, { actor: 'intake' });
  const changeOrder = ledger.createChangeOrder(job.id, {
    entryKey: 'implementation-variation-entry-0001',
    title: 'Additional wall protection',
    scopeDelta: 'Install protective panels on the retained corridor wall.',
    variationType: 'client_request', initiatedBy: 'client',
    cause: 'The client requested protection during the occupied-site works.',
    justification: 'This work is not in the accepted base scope.',
    contractReference: 'Contract section 2', noticeReference: 'CLIENT-REQ-12',
    requestedAt: '2026-07-21', responseDueAt: '2026-07-28',
    scheduleDeltaDays: 1, scheduleImpactNarrative: 'One day of additional work.',
    riskImpact: 'low', riskImpactStatement: 'Protection reduces surface damage risk.',
    assumptions: ['The corridor is accessible.'], exclusions: ['Out of hours work.'],
    evidenceReferences: ['CLIENT-REQ-12'], taxRate: 21,
    lineItems: [{ description: 'Protection panels', quantity: 1, unitPrice: 100 }]
  }, { actor: 'commercial-operator' });
  ledger.resolveApproval(changeOrder.approvalId, { status: 'approved', resolvedBy: 'commercial-approver' });
  const issue = ledger.prepareChangeOrderIssuePackage(job.id, changeOrder.id, {}, { actor: 'commercial-operator' });
  ledger.resolveApproval(issue.approval.id, { status: 'approved', resolvedBy: 'delivery-approver' });
  ledger.recordCommunicationDelivery(issue.communication.id, {
    integration: 'verified-client-provider', providerMessageId: 'provider-message-1', receipt: { status: 'accepted-by-provider' }
  }, { actor: 'verified-provider' });
  const acceptance = ledger.requestChangeOrderAcceptance(job.id, changeOrder.id, {
    acceptedAt: '2026-07-22T10:00:00.000Z', evidenceReference: 'signed-variation-12'
  }, { actor: 'commercial-operator' });
  ledger.resolveApproval(acceptance.approval.id, { status: 'approved', resolvedBy: 'acceptance-approver' });
  return { job, changeOrder: ledger.getJobDetail(job.id).changeOrders.find(item => item.id === changeOrder.id) };
}

const planPayload = (entryKey = 'variation-plan-entry-0001') => ({
  entryKey,
  tasks: [
    { title: 'Measure and prepare corridor wall', description: 'Check wall surface and prepare protection fixings.', durationHours: 2, materials: [{ name: 'Masking tape', quantity: 3, unit: 'rol' }] },
    { title: 'Install protective panels', description: 'Fit panels to the client-accepted corridor wall.', durationHours: 4, materials: [{ name: 'Protective panel', quantity: 6, unit: 'stuk' }] }
  ]
});

test('accepted variation implementation waits for approval and creates only linked unassigned work and material needs', t => {
  const ledger = temporaryLedger(t);
  const { job, changeOrder } = acceptVariation(ledger);
  const service = new VariationImplementation(ledger);
  const before = ledger.getJobDetail(job.id);
  const prepared = service.prepare(job.id, changeOrder.id, planPayload(), { actor: 'office-operator' });
  assert.equal(prepared.approval.status, 'pending');
  assert.equal(prepared.approval.targetType, 'variation_implementation_plan');
  assert.equal(ledger.getJobDetail(job.id).tasks.length, before.tasks.length);
  assert.equal(ledger.getJobDetail(job.id).materials.length, before.materials.length);
  assert.equal(prepared.approval.decision.preview.taskCount, 2);
  assert.equal(prepared.approval.decision.preview.materialCount, 2);
  assert.ok(prepared.approval.decision.safeguards.some(item => /does not set dates, assign workers/i.test(item)));

  ledger.resolveApproval(prepared.approval.id, {
    status: 'approved', resolvedBy: 'independent-approver', reason: 'Scope and linked material needs checked.'
  }, { enforceSeparation: true, actor: 'independent-approver' });
  const after = ledger.getJobDetail(job.id);
  assert.equal(after.tasks.length, before.tasks.length + 2);
  assert.equal(after.materials.length, before.materials.length + 2);
  const approval = ledger.mapApproval(ledger.db.prepare('SELECT * FROM approvals WHERE id = ?').get(prepared.approval.id));
  assert.equal(approval.data.application.taskIds.length, 2);
  assert.equal(approval.data.application.materialRequirementIds.length, 2);
  const createdTasks = approval.data.application.taskIds.map(id => after.tasks.find(task => task.id === id));
  for (const task of createdTasks) {
    assert.equal(task.status, 'open');
    assert.equal(task.assigneeId, null);
    assert.equal(task.dueAt, null);
    assert.equal(task.plannedStart, null);
    assert.equal(task.plannedEnd, null);
    assert.equal(task.data.source, 'variation_implementation_plan');
  }
  for (const id of approval.data.application.materialRequirementIds) {
    const material = after.materials.find(item => item.id === id);
    assert.equal(material.status, 'needed');
    assert.equal(material.supplier, null);
    assert.equal(material.cost, 0);
    assert.equal(material.neededBy, null);
  }
  assert.equal(ledger.db.prepare('SELECT COUNT(*) AS count FROM purchase_orders WHERE job_id = ?').get(job.id).count, 0);
  const workBoard = new (require('../work-board').WorkBoard)(ledger).suggest(job.id);
  for (const task of createdTasks) {
    const suggestion = workBoard.suggestions.find(item => item.sourceTaskId === task.id);
    assert.equal(suggestion.sourceType, 'accepted_variation_implementation');
    assert.equal(suggestion.variationNumber, changeOrder.variationNumber);
    assert.equal(suggestion.hours, task.durationHours);
    assert.match(suggestion.materialsText, /levering te bevestigen/);
  }
  const publishTerms = {
    entryKey: 'accepted-variation-position-0001', title: 'Install protective panels', role: 'Timmerman', city: 'Amsterdam',
    startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 4, capacity: 1, rate: 45,
    description: 'Fit panels to the client-accepted corridor wall.', materials: 'Protective panel: 6 stuk (levering te bevestigen)',
    equipment: 'Standard hand tools', prerequisites: 'Confirm material delivery before arrival.', confirmPublication: true,
    sourceTaskIds: [createdTasks[1].id]
  };
  const published = new (require('../work-board').WorkBoard)(ledger).publish(job.id, publishTerms, 'owner');
  assert.deepEqual(published.sourceTaskIds, [createdTasks[1].id]);

  const tamperedTask = ledger.db.prepare('SELECT data_json FROM job_tasks WHERE id = ?').get(createdTasks[1].id);
  const tamperedTaskData = JSON.parse(tamperedTask.data_json);
  tamperedTaskData.source = 'job_task';
  ledger.db.prepare('UPDATE job_tasks SET data_json = ? WHERE id = ?').run(JSON.stringify(tamperedTaskData), createdTasks[1].id);
  const tamperedBoard = new (require('../work-board').WorkBoard)(ledger);
  assert.equal(tamperedBoard.suggest(job.id).suggestions.some(item => item.sourceTaskId === createdTasks[1].id), false);
  assert.throws(
    () => tamperedBoard.publish(job.id, { ...publishTerms, entryKey: 'tampered-variation-position-0001' }, 'owner'),
    error => error.statusCode === 409
  );
  assert.equal(ledger.verifyAuditIntegrity().valid, true);

  ledger.db.prepare("UPDATE change_orders SET snapshot_hash = 'tampered' WHERE id = ?").run(changeOrder.id);
  const staleSuggestions = new (require('../work-board').WorkBoard)(ledger).suggest(job.id).suggestions;
  assert.equal(createdTasks.some(task => staleSuggestions.some(item => item.sourceTaskId === task.id)), false);
});

test('implementation request replay is idempotent and approval fails closed on changed job state', t => {
  const ledger = temporaryLedger(t);
  const { job, changeOrder } = acceptVariation(ledger);
  const service = new VariationImplementation(ledger);
  const taskCountBefore = ledger.getJobDetail(job.id).tasks.length;
  const first = service.prepare(job.id, changeOrder.id, planPayload(), { actor: 'office-operator' });
  const replay = service.prepare(job.id, changeOrder.id, planPayload(), { actor: 'retrying-operator' });
  assert.equal(replay.replayed, true);
  assert.equal(replay.approval.id, first.approval.id);
  assert.throws(
    () => service.prepare(job.id, changeOrder.id, { ...planPayload(), tasks: [{ ...planPayload().tasks[0], title: 'Changed after retry' }] }, { actor: 'office-operator' }),
    error => error.code === 'variation_implementation_replay_conflict'
  );

  ledger.addTask(job.id, { title: 'Concurrent operator task' }, { actor: 'another-operator' });
  assert.throws(
    () => ledger.resolveApproval(first.approval.id, { status: 'approved', resolvedBy: 'reviewer' }),
    error => error.code === 'variation_implementation_operational_state_changed' && error.statusCode === 409
  );
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(first.approval.id).status, 'pending');
  assert.equal(ledger.getJobDetail(job.id).tasks.length, taskCountBefore + 1);
});

test('implementation approval enforces authenticated separation and blocks tampered plans atomically', t => {
  const ledger = temporaryLedger(t);
  const { job, changeOrder } = acceptVariation(ledger);
  const taskCountBefore = ledger.getJobDetail(job.id).tasks.length;
  const materialCountBefore = ledger.getJobDetail(job.id).materials.length;
  const prepared = new VariationImplementation(ledger).prepare(job.id, changeOrder.id, planPayload(), { actor: 'same-operator' });
  assert.throws(
    () => ledger.resolveApproval(prepared.approval.id, { status: 'approved', resolvedBy: 'same-operator' }, { enforceSeparation: true, actor: 'same-operator' }),
    error => error.code === 'variation_implementation_independent_approval_required'
  );
  const data = JSON.parse(ledger.db.prepare('SELECT data_json FROM approvals WHERE id = ?').get(prepared.approval.id).data_json);
  data.tasks[0].title = 'Tampered after approval request';
  ledger.db.prepare('UPDATE approvals SET data_json = ? WHERE id = ?').run(JSON.stringify(data), prepared.approval.id);
  assert.throws(
    () => ledger.resolveApproval(prepared.approval.id, { status: 'approved', resolvedBy: 'independent-reviewer' }),
    error => error.code === 'variation_implementation_integrity_invalid'
  );
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(prepared.approval.id).status, 'pending');
  assert.equal(ledger.getJobDetail(job.id).tasks.length, taskCountBefore);
  assert.equal(ledger.getJobDetail(job.id).materials.length, materialCountBefore);
});
