const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { WorkBalance, TABLES, verifyWorkBalance } = require('../work-balance');
const { setupDelivery } = require('./work-delivery-contract');

const { postgresTestDatabaseUrl, connectVerifiedPostgresClient } = require('./postgres-test-database');
const connectionString = postgresTestDatabaseUrl();
test('PostgreSQL work allocation matches SQLite approval, execution and authority invariants', { skip: !connectionString }, async t => {
  const admin = new Client({ connectionString }); await connectVerifiedPostgresClient(admin);
  const name = `contractor_work_balance_${randomBytes(8).toString('hex')}`; await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(connectionString); url.pathname = `/${name}`; let ledger;
  t.after(async () => { ledger?.close(); try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); } finally { await admin.end(); } });
  ledger = new ContractorOperatingLedger({ databaseUrl: url.toString() });
  const f = setupDelivery(ledger), balance = new WorkBalance(ledger), view = balance.read(f.job.id);
  const input = { action: 'plan', entryKey: 'postgres-work-balance-plan', sourceHash: view.sourceHash,
    record: { scopeConfirmed: true, reference: 'Approved production basis and package WP-01', reason: 'Allocate exact line quantity.', allocations: [{ lineKey: 'doors', packageId: f.pack.id, plannedQuantity: '2.0000' }] } };
  const pending = balance.command(f.job.id, input, 'postgres-office');
  assert.equal(balance.command(f.job.id, input, 'postgres-office').replayed, true);
  ledger.resolveApproval(pending.approvalId, { status: 'approved', resolvedBy: 'postgres-reviewer' });
  assert.equal(balance.read(f.job.id).state, 'reconciliation_required');
  const delivery = f.command('retain', f.input);
  assert.ok(delivery.deliveryId);
  assert.equal(balance.read(f.job.id).state, 'current');
  assert.equal(verifyWorkBalance(ledger.db), true);
  ledger.db.exec("INSERT INTO company_authority (id,environment_id,generation,status,public_key,details_json,updated_at) VALUES ('current','fixture',1,'frozen','fixture','{}','fixture')");
  for (const table of TABLES) assert.throws(() => ledger.db.exec(`TRUNCATE ${table} CASCADE`), /company_authority_blocked/);
});
