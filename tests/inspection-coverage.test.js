const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { TABLES, verifyInspectionCoverage } = require('../inspection-coverage');
const { setupCoverage, verifyCoverageContract } = require('./inspection-coverage-contract');
function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'inspection-coverage-test-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => { ledger.close(); assert.equal(path.dirname(directory), fs.realpathSync(os.tmpdir())); assert.ok(path.basename(directory).startsWith('inspection-coverage-test-')); fs.rmSync(directory, { recursive: true, force: true }); });
  return ledger;
}
test('reviewed complete inspection coverage connects deliveries, evidence, revisions and field privacy', t => verifyCoverageContract(fixture(t)));
test('coverage retries retain receipts and changed evidence blocks pending and approved assessments', t => {
  const ledger = fixture(t), f = setupCoverage(ledger);
  const input = { action: 'plan', record: f.coveragePlan, entryKey: 'retained-plan', sourceHash: f.coverage.read(f.job.id).sourceHash };
  const first = f.coverage.command(f.job.id, input, 'office');
  assert.equal(f.coverage.command(f.job.id, input, 'office').decisionId, first.decisionId);
  assert.equal(f.coverage.command(f.job.id, input, 'office').replayed, true);
  assert.throws(() => f.coverage.command(f.job.id, { ...input, record: { ...input.record, reason: 'Changed' } }, 'office'), { statusCode: 409 });
  ledger.resolveApproval(first.approvalId, { status: 'approved' }, { actor: 'reviewer' });
  const pending = f.coverageCommand('assessment', f.coverageAssessment(first.decisionId));
  ledger.db.prepare("UPDATE inspection_records SET result = 'failed' WHERE id = ?").run(f.inspection.id);
  assert.throws(() => ledger.resolveApproval(pending.approvalId, { status: 'approved' }, { actor: 'reviewer' }), { statusCode: 409 });
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(pending.approvalId).status, 'pending');
  ledger.resolveApproval(pending.approvalId, { status: 'rejected' }, { actor: 'reviewer' });
  assert.throws(() => f.coverageCommand('assessment', f.coverageAssessment(first.decisionId)), { statusCode: 409 });
});
test('current proof, foreign sources, private documents and malformed plans fail closed', t => {
  const ledger = fixture(t), f = verifyCoverageContract(ledger);
  const foreign = ledger.addDocument(f.other.id, { title: 'Other job', data: { reference: 'Foreign' } });
  assert.throws(() => f.coverageCommand('plan', { ...f.coveragePlan, documentIds: [foreign.id] }), { statusCode: 409 });
  assert.throws(() => f.coverageCommand('plan', { ...f.coveragePlan, scopeConfirmed: false }), { statusCode: 400 });
  assert.throws(() => f.coverageCommand('plan', { ...f.coveragePlan, checks: [] }), { statusCode: 400 });
  ledger.db.prepare("UPDATE documents SET status = 'quarantined' WHERE id = ?").run(f.coverageDocument.id);
  assert.equal(f.coverage.summary(f.job.id, f.deliveryId).status, 'source_changed');
  assert.ok(f.coverage.privateEvidenceIds(f.job.id).has(f.coverageDocument.id));
  assert.ok(new (require('../contractor-review').ContractorReview)(ledger).inspect(f.job.id).issues.some(issue => issue.code === 'inspection_coverage_incomplete'));
});
test('coverage backup integrity and native company-authority guards cover the new records', t => {
  const ledger = fixture(t), f = verifyCoverageContract(ledger);
  const { verifySqliteBackupDatabase } = require('../scripts/restore-local-backup');
  assert.equal(verifySqliteBackupDatabase(ledger.dbFile).valid, true);
  ledger.db.prepare("UPDATE inspection_coverage_decisions SET snapshot_hash = 'wrong' WHERE delivery_id = ?").run(f.deliveryId);
  assert.throws(() => verifySqliteBackupDatabase(ledger.dbFile), /controlesom/);
  ledger.db.exec("INSERT INTO company_authority (id,environment_id,generation,status,public_key,details_json,updated_at) VALUES ('current','fixture',1,'frozen','fixture','{}','fixture')");
  for (const table of TABLES) assert.throws(() => ledger.db.exec(`DELETE FROM ${table}`), /company_authority_blocked/);
});

test('coverage requires an intact approved checklist and reopens for corrective observations', t => {
  const ledger = fixture(t), f = setupCoverage(ledger);
  const template = ledger.createInspectionTemplate({ name: 'Door checklist', templateKey: 'coverage_door',
    items: [{ key: 'closure', prompt: 'Sluiting gecontroleerd', required: true, allowNotApplicable: false },
      { key: 'finish', prompt: 'Afwerking gecontroleerd', required: true, allowNotApplicable: false }] });
  const inspection = ledger.createInspectionFromTemplate(f.job.id, { templateId: template.id, entryKey: 'coverage-checklist-schedule' });
  const submit = key => ledger.submitInspectionChecklist(f.job.id, inspection.id, { entryKey: key,
    responses: [{ itemKey: 'closure', result: 'pass' }, { itemKey: 'finish', result: 'pass' }] }, { actor: 'inspector' });
  assert.throws(() => f.coverage.inspection(f.job.id, inspection.id), { statusCode: 409 });
  const first = submit('coverage-checklist-first');
  ledger.resolveApproval(first.approval.id, { status: 'approved' }, { actor: 'quality-reviewer' });
  assert.equal(f.coverage.inspection(f.job.id, inspection.id).id, inspection.id);
  const plan = f.coverageCommand('plan', f.coveragePlan);
  ledger.resolveApproval(plan.approvalId, { status: 'approved' }, { actor: 'reviewer' });
  const assessment = () => ({ ...f.coverageAssessment(plan.decisionId), responses: f.coverageAssessment(plan.decisionId).responses
    .map(row => row.outcome === 'passed' ? { ...row, inspectionId: inspection.id } : row) });
  const mapping = f.coverageCommand('assessment', assessment());
  ledger.resolveApproval(mapping.approvalId, { status: 'approved' }, { actor: 'reviewer' });
  assert.equal(f.coverage.summary(f.job.id, f.deliveryId).status, 'covered');
  const savedHash = ledger.db.prepare('SELECT snapshot_hash FROM inspection_checklist_submissions WHERE id = ?').get(first.submission.id).snapshot_hash;
  ledger.db.prepare("UPDATE inspection_checklist_submissions SET snapshot_hash = 'tampered' WHERE id = ?").run(first.submission.id);
  assert.equal(f.coverage.summary(f.job.id, f.deliveryId).status, 'source_changed');
  assert.throws(() => f.coverage.inspection(f.job.id, inspection.id), { statusCode: 409 });
  ledger.db.prepare('UPDATE inspection_checklist_submissions SET snapshot_hash = ? WHERE id = ?').run(savedHash, first.submission.id);
  assert.equal(f.coverage.summary(f.job.id, f.deliveryId).status, 'covered');
  ledger.createObservationRecord(f.job.id, { title: 'Sluiting opnieuw controleren', sourceInspectionId: inspection.id, severity: 'medium' });
  assert.equal(f.coverage.summary(f.job.id, f.deliveryId).status, 'source_changed');
  assert.throws(() => f.coverageCommand('assessment', assessment()), { statusCode: 409 });
});

test('coverage rejects stale installation references even after the task was released and completed', t => {
  const ledger = fixture(t), f = setupCoverage(ledger);
  const task = ledger.addTask(f.job.id, { title: 'Door fitting check', status: 'in_progress', assigneeId: f.worker.id });
  const assignment = ledger.db.prepare('SELECT id FROM assignments WHERE job_id = ? AND worker_id = ?').get(f.job.id, f.worker.id);
  const reference = ledger.addDocument(f.job.id, { title: 'Door specification', status: 'stored', data: { reference: 'Approved detail D1' } });
  const template = ledger.createInspectionTemplate({ name: 'Door installation', templateKey: 'coverage_installation', inspectionType: 'installation_qc',
    installationQc: true, items: [{ key: 'fit', prompt: 'Door fit checked', acceptanceCriteria: 'Conforms to retained detail', controlPoint: 'check' },
      { key: 'finish', prompt: 'Door finish checked', acceptanceCriteria: 'No visible damage', controlPoint: 'check' }] });
  const inspection = ledger.createInspectionFromTemplate(f.job.id, { templateId: template.id, entryKey: 'coverage-qc-schedule', taskId: task.id,
    assignmentId: assignment.id, assignedWorkerId: f.worker.id, workLocation: 'First door', installationStage: 'in_process', controlPoint: 'check',
    referenceBasis: 'Approved detail D1', referenceDocumentIds: [reference.id] });
  const submission = ledger.submitInspectionChecklist(f.job.id, inspection.id, { entryKey: 'coverage-qc-submit',
    capturedAt: new Date(Date.now() - 60000).toISOString(), responses: [{ itemKey: 'fit', result: 'pass' }, { itemKey: 'finish', result: 'pass' }] },
  { actor: `role:field_worker:${f.worker.id}`, workerId: f.worker.id, enforceWorkerScope: true });
  ledger.resolveApproval(submission.approval.id, { status: 'approved', reason: 'Checked current installation detail and retained responses.' }, { actor: 'quality-reviewer', enforceSeparation: true });
  assert.equal(f.coverage.inspection(f.job.id, inspection.id).id, inspection.id);
  ledger.transitionLifecycleRecord(f.job.id, 'task', task.id, { status: 'completed', notes: 'Installation complete with reviewed checklist evidence.' });
  ledger.db.prepare("UPDATE documents SET status = 'superseded' WHERE id = ?").run(reference.id);
  const qc = ledger.getInstallationQcControl(inspection.id);
  assert.equal(qc.taskCompleted, true);
  assert.equal(qc.readyForTaskCompletion, true);
  assert.equal(qc.referencesCurrent, false);
  assert.throws(() => f.coverage.inspection(f.job.id, inspection.id), { statusCode: 409 });
});

test('coverage approval content must match retained decisions before reliance and resolution', t => {
  const ledger = fixture(t), f = setupCoverage(ledger);
  const plan = f.coverageCommand('plan', f.coveragePlan);
  const saved = ledger.db.prepare('SELECT data_json FROM approvals WHERE id = ?').get(plan.approvalId).data_json;
  ledger.db.prepare('UPDATE approvals SET data_json = ? WHERE id = ?').run(JSON.stringify({ ...JSON.parse(saved), scopeReference: 'Different scope shown to reviewer' }), plan.approvalId);
  assert.throws(() => ledger.resolveApproval(plan.approvalId, { status: 'approved' }, { actor: 'reviewer' }), { statusCode: 409 });
  assert.throws(() => verifyInspectionCoverage(ledger.db), /beoordelingsketen/);
  ledger.db.prepare('UPDATE approvals SET data_json = ? WHERE id = ?').run(saved, plan.approvalId);
  ledger.resolveApproval(plan.approvalId, { status: 'approved' }, { actor: 'reviewer' });
  const mapping = f.coverageCommand('assessment', f.coverageAssessment(plan.decisionId));
  ledger.db.prepare('UPDATE approvals SET data_json = ? WHERE id = ?').run('{}', plan.approvalId);
  assert.throws(() => ledger.resolveApproval(mapping.approvalId, { status: 'approved' }, { actor: 'reviewer' }), { statusCode: 409 });
  ledger.resolveApproval(mapping.approvalId, { status: 'rejected' }, { actor: 'reviewer' });
  assert.equal(f.coverage.summary(f.job.id, f.deliveryId).status, 'source_changed');
});
