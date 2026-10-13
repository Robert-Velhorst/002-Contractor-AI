const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { SharedMaterialStock } = require('../shared-material-stock');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'operational-recovery-api-'));
const tokens = { owner: 'recovery-owner-token-at-least-32-characters', office_operator: 'recovery-office-token-at-least-32-characters',
  approver: 'recovery-approver-token-at-least-32-characters', field_worker: 'recovery-field-token-at-least-32-characters' };
Object.assign(process.env, { STATE_FILE: path.join(directory, 'state.json'), LEDGER_DB_FILE: path.join(directory, 'ledger.sqlite'),
  UPLOAD_DIR: path.join(directory, 'uploads'), CONTRACTOR_AI_REQUIRE_AUTH: 'true' });
const ledger = new ContractorOperatingLedger({ dbFile: process.env.LEDGER_DB_FILE });
const job = ledger.createIntake({ title: 'API herstelcasus', client: { name: 'Klant' } });
const counted = new SharedMaterialStock(ledger).count({ name: 'Kabelgoot', unit: 'm', countedQuantity: 6,
  reference: 'TEL-API-01', note: 'API testvoorraad', entryKey: 'api-stock-count-01' });
const material = ledger.addMaterialRequirement(job.id, { name: 'Kabelgoot', materialId: counted.material.id, quantity: 12, unit: 'm', status: 'needed' });
ledger.createIncidentRecord(job.id, { title: 'Onveilige situatie gemeld', severity: 'low', status: 'reported', incidentType: 'near_miss' }, { actor: 'field_worker' });
Object.assign(process.env, { CONTRACTOR_AI_ROLE_TOKENS: JSON.stringify({ ...tokens, field_worker: { token: tokens.field_worker, workerId: 'field-only-worker' } }) });
ledger.close();
const app = require('../server');

test('recovery cases are visible and writable only to coordinating operator roles', async t => {
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await app.locals.runtimeControl.shutdown({ server, signal: 'operational_recovery_api_test' });
    assert.ok(path.basename(directory).startsWith('operational-recovery-api-')); fs.rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`, route = `/api/ledger/jobs/${job.id}/operational-recovery`;
  const request = async (token, data) => {
    const response = await fetch(base + route, { method: data ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
    return { status: response.status, body: await response.json() };
  };
  const portfolioRequest = async token => {
    const response = await fetch(`${base}/api/ledger/operational-recovery?limit=200`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await request()).status, 401);
  assert.equal((await request(tokens.field_worker)).status, 403);
  assert.equal((await request(tokens.approver, { action: 'create' })).status, 403);
  assert.equal((await portfolioRequest(tokens.field_worker)).status, 403);
  const office = await request(tokens.office_operator);
  assert.equal(office.status, 200);
  assert.equal(office.body.cases.length, 0);
  assert.equal(office.body.externalCommitments, 0);
  const materialShortfall = office.body.sources.find(source => source.type === 'material_requirement_shortfall');
  assert.equal(materialShortfall.impact.materialLines[0].shortfallQuantity, 12);
  const incident = office.body.sources.find(source => source.type === 'safety_incident');
  const created = await request(tokens.office_operator, { action: 'create', entryKey: 'api-recovery-create-001', sourceHash: office.body.sourceHash,
    sources: [{ type: incident.type, id: incident.id }], owner: 'Kantoor', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'stop_and_review', recoveryAction: 'Laat de gemelde situatie door een bevoegde persoon beoordelen.' });
  assert.equal(created.status, 201);
  assert.equal(created.body.status, 'open');
  const portfolio = await portfolioRequest(tokens.office_operator);
  assert.equal(portfolio.status, 200);
  assert.equal(portfolio.body.total, 2);
  assert.equal(portfolio.body.caseCount, 1);
  assert.equal(portfolio.body.unassignedSourceCount, 1);
  assert.equal(portfolio.body.coverageComplete, true);
  assert.equal(portfolio.body.cases[0].jobId, job.id);
  assert.equal(portfolio.body.cases[0].integrityValid, true);
  assert.equal(portfolio.body.cases[0].sourceCurrent, true);
  assert.equal(portfolio.body.cases[0].sources[0].type, 'safety_incident');
  assert.equal(Object.hasOwn(portfolio.body.cases[0].sources[0], 'impact'), false);
  assert.equal(portfolio.body.cases[0].sources[0].operationalImpact.safetyReviewRequired, true);
  assert.equal(portfolio.body.cases[0].sources[0].title, 'Veiligheidsmelding');
  assert.equal(JSON.stringify(portfolio.body.cases[0]).includes('Onveilige situatie gemeld'), false);
  const unassigned = portfolio.body.cases.find(item => item.kind === 'unassigned_source');
  assert.equal(unassigned.sourceType, 'material_requirement_shortfall');
  assert.equal(unassigned.sourceCurrent, true);
  assert.equal(unassigned.owner, null);
  assert.equal(Object.hasOwn(unassigned.sources[0], 'impact'), false);
  assert.equal(unassigned.sources[0].operationalImpact.materialLines[0].shortfallQuantity, 12);
  assert.equal(Object.hasOwn(portfolio.body.cases[0], 'recoveryAction'), false);
  const ownerView = await request(tokens.owner);
  assert.equal(ownerView.body.cases.length, 1);
  const recoveryCase = ownerView.body.cases[0];
  const cost = await request(tokens.office_operator, { action: 'cost_impact_review', entryKey: 'api-cost-impact-001',
    caseId: recoveryCase.id, caseHash: recoveryCase.caseHash, sourceHash: ownerView.body.sourceHash,
    reviewStatus: 'estimate', amount: 245.5, summary: 'Extra inzet voor de veiligheidsinspectie geraamd.', evidenceReference: 'urenstaat:INSPECTIE-4' });
  assert.equal(cost.status, 201);
  const retained = (await request(tokens.owner)).body.cases[0].costImpactReviews[0];
  assert.equal(retained.amountCents, 24550);
  assert.equal(retained.currency, 'EUR');
  assert.equal(retained.accountingPosted, false);

  const current = await request(tokens.office_operator);
  const stockCaseSource = current.body.sources.find(source => source.type === 'material_requirement_shortfall' && source.id === material.id);
  assert.equal(stockCaseSource.impact.materialLines[0].warehouseAvailableQuantity, 6);
  const stockCase = await request(tokens.office_operator, { action: 'create', entryKey: 'api-warehouse-case-01', sourceHash: current.body.sourceHash,
    sources: [{ type: stockCaseSource.type, id: stockCaseSource.id }], owner: 'Magazijn', dueAt: new Date(Date.now() + 86_400_000).toISOString(),
    actionType: 'recover_material', recoveryAction: 'Geef kabelgoot uit aan de bouwplaats.' });
  assert.equal(stockCase.status, 201);
  const issueView = await request(tokens.office_operator);
  const issueCase = issueView.body.cases.find(item => item.id === stockCase.body.caseId);
  const issueCommand = { action: 'warehouse_material_issue', entryKey: 'api-warehouse-issue-01', caseId: issueCase.id,
    caseHash: issueCase.caseHash, sourceHash: issueView.body.sourceHash, sourceId: material.id, quantity: 4,
    sourceReference: 'TEL-API-01', dispatchReference: 'RIT-API-01', evidenceReference: 'bon:API-01',
    expectedArrivalAt: new Date(Date.now() + 86_400_000).toISOString() };
  assert.equal((await request(tokens.field_worker, issueCommand)).status, 403);
  const issued = await request(tokens.office_operator, issueCommand);
  assert.equal(issued.status, 201);
  assert.equal(issued.body.externalCommitments, 0);
  assert.equal(issued.body.warehouseMaterialIssue.quantity, 4);
  assert.equal((await request(tokens.office_operator, issueCommand)).body.replayed, true);
  const afterIssue = await request(tokens.owner);
  const afterSource = afterIssue.body.sources.find(source => source.type === 'material_requirement_shortfall' && source.id === material.id);
  assert.equal(afterSource.impact.materialLines[0].warehouseInTransitQuantity, 4);
  assert.equal(afterSource.impact.materialLines[0].shortfallQuantity, 8);
  assert.equal(afterSource.impact.materialLines[0].undeliveredOrderQuantity, 0);

  const tamperLedger = new ContractorOperatingLedger({ dbFile: process.env.LEDGER_DB_FILE });
  tamperLedger.db.prepare("UPDATE operational_recovery_cases SET snapshot_json = '{}' WHERE id = ?").run(recoveryCase.id);
  tamperLedger.close();
  const integrityPortfolio = await portfolioRequest(tokens.owner);
  const corruptedCase = integrityPortfolio.body.cases.find(item => item.id === recoveryCase.id);
  assert.equal(corruptedCase.integrityValid, false);
  assert.deepEqual(corruptedCase.sources, []);

  const verifyLedger = new ContractorOperatingLedger({ dbFile: process.env.LEDGER_DB_FILE });
  assert.equal(new SharedMaterialStock(verifyLedger).list().siteIssues.length, 1);
  verifyLedger.close();
});
