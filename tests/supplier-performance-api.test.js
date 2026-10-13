const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'supplier-performance-api-'));
const tokens = { owner: 'supplier-scorecard-owner-token-at-least-32-characters',
  office_operator: 'supplier-scorecard-office-token-at-least-32-characters',
  field_worker: { token: 'supplier-scorecard-field-token-at-least-32-characters', workerId: 'supplier-scorecard-worker' } };
Object.assign(process.env, { NODE_ENV: 'test', CONTRACTOR_AI_RUNTIME_MODE: 'local', CONTRACTOR_AI_STORAGE_MODE: 'local', CONTRACTOR_AI_REQUIRE_AUTH: 'true',
  CONTRACTOR_AI_ROLE_TOKENS: JSON.stringify(tokens), STATE_FILE: path.join(directory, 'state.json'),
  LEDGER_DB_FILE: path.join(directory, 'ledger.sqlite'), UPLOAD_DIR: path.join(directory, 'uploads') });

const ledger = new ContractorOperatingLedger({ dbFile: process.env.LEDGER_DB_FILE });
const job = ledger.createIntake({ title: 'Supplier scorecard API', client: { name: 'Client' }, assignAutomatically: false });
const material = ledger.addMaterialRequirement(job.id, { name: 'Dakrollen', quantity: 4, unit: 'rollen', status: 'needed' });
const purchaseOrder = ledger.createPurchaseOrder(job.id, { supplier: 'Dakmaterialen BV', status: 'draft', requiredBy: '2030-06-10T12:00:00.000Z',
  items: [{ lineKey: 'roofing', materialRequirementId: material.id, name: material.name, quantity: 4, unit: 'rollen' }] });
ledger.createMaterialReceipt(job.id, { purchaseOrderId: purchaseOrder.id, receiptReference: 'PAK-API-1', evidenceReference: 'pakbon:PAK-API-1',
  deliveredAt: new Date().toISOString(), receivedBy: 'Magazijn', finalDelivery: true, entryKey: 'supplier-scorecard-api-receipt',
  lines: [{ lineKey: 'roofing', materialRequirementId: material.id, itemName: material.name, unit: 'rollen', orderedQuantity: 4, receivedQuantity: 4, acceptedQuantity: 4 }] });
ledger.close();

const app = require('../server');

test('supplier performance is an authenticated office-only read of retained receipt evidence', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await app.locals.runtimeControl.shutdown({ server, signal: 'supplier_performance_api_test' });
    assert.ok(path.basename(directory).startsWith('supplier-performance-api-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  const url = `http://127.0.0.1:${server.address().port}/api/ledger/supplier-performance`;
  const request = async token => {
    const response = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
    return { status: response.status, body: await response.json() };
  };
  assert.equal((await request()).status, 401);
  const office = await request(tokens.office_operator);
  assert.equal(office.status, 200);
  assert.equal(office.body.externalCommitments, 0);
  assert.deepEqual(office.body.suppliers[0], {
    supplierId: 'dakmaterialen bv', name: 'Dakmaterialen BV', orderCount: 1, receivedOrders: 1,
    completeOrders: 1, ratedOrders: 1, onTimeCompleteOrders: 1, completedWithoutRequiredDate: 0,
    damagedOrders: 0, openShortageOrders: 0, awaitingReceiptOrders: 0, historicalLeadTimeP75Days: null,
    leadTimeSampleSize: 0, leadTimeRiskCount: 0, leadTimeRisks: [], onTimeCompleteRatePercent: 100
  });
  assert.equal((await request(tokens.field_worker.token)).status, 403);
});
