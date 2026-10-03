const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { TABLES } = require('../work-context');
const { verifyContract } = require('./work-context-contract');
const { postgresTestDatabaseUrl, connectVerifiedPostgresClient } = require('./postgres-test-database');
const connectionString = postgresTestDatabaseUrl();

test('PostgreSQL shared work contract and new-table write guards match SQLite', { skip: !connectionString }, async t => {
  const admin = new Client({ connectionString }); await connectVerifiedPostgresClient(admin);
  const name = `contractor_context_${randomBytes(8).toString('hex')}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(connectionString); url.pathname = `/${name}`;
  let ledger;
  t.after(async () => { ledger?.close(); try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); } finally { await admin.end(); } });
  ledger = new ContractorOperatingLedger({ databaseUrl: url.toString() });
  verifyContract(ledger);
  ledger.db.exec("INSERT INTO company_authority (id,environment_id,generation,status,public_key,details_json,updated_at) VALUES ('current','fixture',1,'frozen','fixture','{}','fixture')");
  for (const table of TABLES) assert.throws(() => ledger.db.exec(`TRUNCATE ${table} CASCADE`), /company_authority_blocked/);
});
