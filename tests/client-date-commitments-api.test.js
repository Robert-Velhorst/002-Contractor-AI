const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { approveLowRiskRegister } = require('./risk-register-fixture');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'client-date-commitments-api-'));
const tokens = { owner: 'dates-owner-token-at-least-32-characters', office_operator: 'dates-office-token-at-least-32-characters',
  approver: 'dates-approver-token-at-least-32-characters', field_worker: 'dates-field-token-at-least-32-characters' };
Object.assign(process.env, { STATE_FILE: path.join(directory, 'state.json'), LEDGER_DB_FILE: path.join(directory, 'ledger.sqlite'),
  UPLOAD_DIR: path.join(directory, 'uploads'), CONTRACTOR_AI_REQUIRE_AUTH: 'true',
  CONTRACTOR_AI_ROLE_TOKENS: JSON.stringify({ ...tokens, field_worker: { token: tokens.field_worker, workerId: 'field-only-worker' } }) });
const ledger = new ContractorOperatingLedger({ dbFile: process.env.LEDGER_DB_FILE });
const job = ledger.createIntake({ title: 'Contractdata API', client: { name: 'Klant' }, targetCompletion: '2030-03-31' });
const scope = ledger.requestCommercialScopeRevision(job.id, { entryKey: 'api-client-dates-scope', title: 'Dakrenovatie', scopeSummary: 'Vervang de dakbedekking volgens de offerte.',
  inclusions: ['Dakbedekking vervangen.'], assumptions: ['Toegang is beschikbaar.'], exclusions: ['Onvoorzien houtrot.'], clientResponsibilities: ['Toegang verzorgen.'],
  contractorResponsibilities: ['Werk uitvoeren.'], allowanceMode: 'none', noAllowanceReason: 'Geen stelposten.', reason: 'Offertegrondslag.' }, { actor: 'office_operator' });
ledger.resolveApproval(scope.approval.id, { status: 'approved', resolvedBy: 'approver' });
approveLowRiskRegister(ledger, job.id, ledger.getCommercialScopeRevision(scope.revision.id), 'api-client-dates-risk');
const quote = ledger.createQuote(job.id, { commercialScopeRevisionId: scope.revision.id, lineItems: [{ description: 'Dakrenovatie', quantity: 1, unitPrice: 1000 }] }, { actor: 'office_operator' });
ledger.resolveApproval(quote.approvalId, { status: 'approved', resolvedBy: 'approver' });
const acceptance = ledger.requestQuoteAcceptance(job.id, quote.id, { acceptedAt: '2026-09-24', evidenceReference: 'offerte-17-ondertekend' }, { actor: 'office_operator' });
ledger.resolveApproval(acceptance.approval.id, { status: 'approved', resolvedBy: 'contract-approver' });
ledger.createIncidentRecord(job.id, { title: 'Werkplek tijdelijk niet toegankelijk', severity: 'low', status: 'reported', incidentType: 'other' }, { actor: 'office_operator' });
ledger.close();
const app = require('../server');

test('client contract-date API is readable by office and owner but not field workers or approvers', async t => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await app.locals.runtimeControl.shutdown({ server, signal: 'client_date_commitments_api_test' });
    assert.ok(path.basename(directory).startsWith('client-date-commitments-api-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`, route = `/api/ledger/jobs/${job.id}/client-date-commitments`;
  const request = async (token, payload) => {
    const response = await fetch(base + route, { method: payload ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(payload ? { body: JSON.stringify(payload) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await request()).status, 401);
  assert.equal((await request(tokens.field_worker)).status, 403);
  assert.equal((await request(tokens.approver)).status, 200);
  const initial = await request(tokens.office_operator);
  assert.equal(initial.body.acceptedSources.length, 1);
  assert.equal((await request(tokens.owner)).body.commitments.length, 0);
  assert.equal((await request(tokens.approver, { action: 'record' })).status, 403);
  assert.equal((await request(tokens.field_worker, { action: 'record' })).status, 403);
  const source = initial.body.acceptedSources[0], command = { action: 'record', commandKey: 'api-client-date-record-1', entryKey: 'api-finish-date', sourceType: source.type, sourceId: source.id,
    acceptedSourceHash: source.sourceHash, sourceHash: initial.body.sourceHash, dateKind: 'complete_by', date: '2030-04-30', label: 'Oplevering',
    contractWording: 'Het werk wordt uiterlijk op 30 april 2030 opgeleverd.', evidenceReference: 'offerte-17, artikel 8.1' };
  const created = await request(tokens.office_operator, command);
  assert.equal(created.status, 201);
  assert.equal(created.body.date, '2030-04-30');
  assert.equal((await request(tokens.office_operator, command)).body.replayed, true);
  const retained = await request(tokens.owner);
  assert.equal(retained.body.commitments[0].sourceCurrent, true);
  assert.equal(retained.body.commitments[0].source.approvalId, source.approvalId);
  const detail = await fetch(`${base}/api/ledger/jobs/${job.id}`, { headers: { Authorization: `Bearer ${tokens.office_operator}` } });
  assert.equal(detail.status, 200);
  assert.equal((await detail.json()).job.targetCompletion, '2030-03-31');

  const recoveryRoute = `/api/ledger/jobs/${job.id}/operational-recovery`;
  const recoveryRequest = async (token, payload) => {
    const response = await fetch(base + recoveryRoute, { method: payload ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
      ...(payload ? { body: JSON.stringify(payload) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const sources = await recoveryRequest(tokens.office_operator), disruption = sources.body.sources[0];
  const newCase = await recoveryRequest(tokens.office_operator, { action: 'create', entryKey: 'api-contract-impact-case-1', sourceHash: sources.body.sourceHash,
    sources: [{ type: disruption.type, id: disruption.id }], owner: 'Werkvoorbereider', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'review_only', recoveryAction: 'Beoordeel de contractuele opleverdatum.' });
  assert.equal(newCase.status, 201);
  const recoveryView = await recoveryRequest(tokens.office_operator), recoveryCase = recoveryView.body.cases[0];
  const currentCommitment = retained.body.commitments[0];
  const impactReview = { action: 'client_date_impact_review', entryKey: 'api-contract-impact-review-1', caseId: recoveryCase.id,
    caseHash: recoveryCase.caseHash, sourceHash: recoveryView.body.sourceHash, commitmentEntryKey: currentCommitment.entryKey,
    commitmentHash: currentCommitment.commitmentHash, reviewStatus: 'at_risk', summary: 'De huidige verstoring kan de afgesproken oplevering raken.',
    nextFollowUpAt: new Date(Date.now() + 2 * 86_400_000).toISOString() };
  assert.equal((await recoveryRequest(tokens.approver, impactReview)).status, 403);
  const savedReview = await recoveryRequest(tokens.office_operator, impactReview);
  assert.equal(savedReview.status, 201);
  assert.equal((await recoveryRequest(tokens.office_operator, impactReview)).body.replayed, true);
  const reviewedCase = (await recoveryRequest(tokens.owner)).body.cases[0];
  assert.equal(reviewedCase.clientDateImpactReviews[0].current, true);
  assert.equal(reviewedCase.clientDateImpactReviews[0].commitment.date, '2030-04-30');
  assert.equal(reviewedCase.clientDateImpactReviews[0].status, 'at_risk');
});
