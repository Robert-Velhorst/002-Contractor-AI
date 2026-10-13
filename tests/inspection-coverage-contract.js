const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { setupDelivery } = require('./work-delivery-contract');
const { InspectionCoverage, verifyInspectionCoverage } = require('../inspection-coverage');

function setupCoverage(ledger) {
  const f = setupDelivery(ledger), deliveryId = f.command('retain', f.input).deliveryId, coverage = new InspectionCoverage(ledger);
  const document = ledger.addDocument(f.job.id, { title: 'Private coverage report', type: 'inspection_coverage_evidence', data: { reference: 'Private office report R1' } });
  const inspection = ledger.createInspectionRecord(f.job.id, { title: 'Deur gecontroleerd', status: 'passed', result: 'passed', completedAt: '2026-09-02T12:00:00Z', inspector: 'Retained inspector' }, { actor: 'inspector' });
  ledger.resolveApproval(inspection.approval.id, { status: 'approved' }, { actor: 'inspection-reviewer' });
  const command = (action, record) => coverage.command(f.job.id, { action, record, entryKey: randomUUID(), sourceHash: coverage.read(f.job.id).sourceHash }, 'coverage-office');
  const plan = { deliveryId, scopeReference: 'Private assessment scope: first installed door only', reason: 'Reviewed project controls', documentIds: [document.id], scopeConfirmed: true,
    checks: [{ key: 'door', title: 'Sluiting deur', criterion: 'Private technical acceptance criterion', fieldInstruction: 'Controleer de sluiting van de eerste deur.', allowNotApplicable: false },
      { key: 'closer', title: 'Deurdranger', criterion: 'Deurdranger waar aanwezig', fieldInstruction: 'Controleer of een deurdranger aanwezig is.', allowNotApplicable: true }] };
  const assessment = planId => ({ deliveryId, planId, reason: 'Private verification of coverage', responses: [
    { key: 'door', outcome: 'passed', inspectionId: inspection.id, documentIds: [document.id], scopeReference: 'Private field report covers the first installed door, not the unfinished second door.' },
    { key: 'closer', outcome: 'not_applicable', documentIds: [document.id], scopeReference: 'Retained report confirms no closer in this delivered scope.' }] });
  return { ...f, deliveryId, coverage, coverageCommand: command, coveragePlan: plan, coverageAssessment: assessment, coverageDocument: document, inspection };
}
function verifyCoverageContract(ledger) {
  const f = setupCoverage(ledger), { coverage, coverageCommand: command, job, deliveryId } = f;
  assert.equal(coverage.summary(job.id, deliveryId).status, 'not_configured');
  const requested = command('plan', f.coveragePlan);
  assert.equal(coverage.summary(job.id, deliveryId).status, 'pending_review');
  assert.throws(() => ledger.resolveApproval(requested.approvalId, { status: 'approved' }, { actor: 'coverage-office' }), { statusCode: 409 });
  ledger.resolveApproval(requested.approvalId, { status: 'approved' }, { actor: 'coverage-reviewer' });
  assert.equal(coverage.summary(job.id, deliveryId).status, 'evidence_required');
  const input = f.coverageAssessment(requested.decisionId);
  assert.throws(() => command('assessment', { ...input, responses: input.responses.slice(0, 1) }), { statusCode: 400 });
  assert.throws(() => command('assessment', { ...input, responses: input.responses.map(row => ({ ...row, outcome: 'not_applicable' })) }), { statusCode: 400 });
  assert.throws(() => command('assessment', { ...input, responses: input.responses.map(row => ({ ...row, documentIds: [] })) }), { statusCode: 400 });
  const request = command('assessment', input);
  ledger.resolveApproval(request.approvalId, { status: 'approved' }, { actor: 'coverage-reviewer' });
  const summary = coverage.summary(job.id, deliveryId);
  assert.equal(summary.status, 'covered'); assert.equal(summary.covered, 2); assert.equal(summary.grantsSafetyPermission, false);
  assert.equal(f.delivery.source(job.id)[0].response.status, 'not_verified');
  assert.equal(f.delivery.source(job.id)[0].finance.status, 'not_linked');
  const field = f.field.read(job.id, f.worker.id).know.workContext.deliveries[0];
  assert.equal(field.inspectionCoverage.status, 'covered');
  assert.equal(field.inspectionCoverage.checks[0].fieldInstruction, f.coveragePlan.checks[0].fieldInstruction);
  for (const secret of ['Private', f.coverageDocument.id, f.inspection.id, 'coverage-reviewer']) assert.equal(JSON.stringify(field).includes(secret), false);
  const revised = command('plan', { ...f.coveragePlan, reason: 'Updated required controls' });
  assert.equal(coverage.summary(job.id, deliveryId).status, 'pending_review');
  ledger.resolveApproval(revised.approvalId, { status: 'rejected' }, { actor: 'coverage-reviewer' });
  assert.equal(coverage.summary(job.id, deliveryId).status, 'covered');
  const second = command('plan', { ...f.coveragePlan, reason: 'Revised checklist approved' });
  ledger.resolveApproval(second.approvalId, { status: 'approved' }, { actor: 'coverage-reviewer' });
  assert.equal(coverage.summary(job.id, deliveryId).status, 'evidence_required');
  const final = command('assessment', f.coverageAssessment(second.decisionId));
  ledger.resolveApproval(final.approvalId, { status: 'approved' }, { actor: 'coverage-reviewer' });
  assert.equal(verifyInspectionCoverage(ledger.db), true);
  const correction = f.command('request_void', { id: deliveryId, reason: 'Wrong physical scope retained' });
  assert.equal(coverage.summary(job.id, deliveryId).status, 'source_changed');
  ledger.resolveApproval(correction.approvalId, { status: 'rejected' }, { actor: 'correction-reviewer' });
  assert.equal(coverage.summary(job.id, deliveryId).status, 'covered');
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
  return f;
}
module.exports = { setupCoverage, verifyCoverageContract };
