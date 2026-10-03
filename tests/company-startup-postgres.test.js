const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { PostgresSyncDatabase } = require('../postgres-sync-database');
const { postgresTestDatabaseUrl } = require('./postgres-test-database');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { readCompanyRuntime } = require('../company-runtime');
const { migrateCompanyAuthority, generateAuthorityKey } = require('../company-authority');
const { registerCompanyStartupContract, seedIdentity, snapshot } = require('./company-startup-contract');

const connectionString = postgresTestDatabaseUrl();
async function createDatabase(t) {
  const admin = new Client({ connectionString });
  await admin.connect();
  const name = `contractor_company_startup_${crypto.randomBytes(8).toString('hex')}`;
  let created = false, db;
  t.after(async () => {
    try {
      db?.close();
      if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally { await admin.end(); }
  });
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  const url = new URL(connectionString);
  url.pathname = `/${name}`;
  const databaseUrl = url.toString();
  db = new PostgresSyncDatabase({ connectionString: databaseUrl });
  return { db, options: { databaseUrl } };
}

registerCompanyStartupContract(test, { prefix: 'PostgreSQL company startup', skip: !connectionString, createDatabase });

for (const searchPath of ['owned', 'public,owned']) {
  test(`PostgreSQL company startup: refuses noncanonical search_path=${searchPath} without changing retained ownership`, { skip: !connectionString }, async t => {
    for (const mismatch of ['configured company', 'expected company', 'expected ledger']) {
      await t.test(mismatch, async t => {
        const fixture = await createDatabase(t);
        fixture.db.exec('CREATE SCHEMA owned');
        fixture.db.exec('SET search_path TO owned');
        const company = { id: 'company-owned', ledgerId: crypto.randomUUID(), createdAt: '2026-01-01T00:00:00.000Z' };
        seedIdentity(fixture.db, company);
        assert.deepEqual(readCompanyRuntime(fixture.db), company);
        const before = snapshot(fixture.db);
        const url = new URL(fixture.options.databaseUrl);
        url.searchParams.set('options', `-c search_path=${searchPath}`);
        const options = mismatch === 'configured company' ? { companyId: 'company-other' }
          : { companyId: undefined, expectedCompany: { ...company,
            ...(mismatch === 'expected company' ? { id: 'company-other' } : { ledgerId: crypto.randomUUID() }) } };
        assert.throws(() => new ContractorOperatingLedger({ databaseUrl: url.toString(), ...options }), { code: 'postgres_schema_unsupported' });
        assert.deepEqual(snapshot(fixture.db), before, 'Neither the visible company schema nor the public fallback may change');
      });
    }
  });
}

test('PostgreSQL namespace preflight fences hidden frozen authority even for maintenance and direct adapters', { skip: !connectionString }, async t => {
  const fixture = await createDatabase(t);
  fixture.db.exec('CREATE SCHEMA owned');
  fixture.db.exec('SET search_path TO owned');
  const company = { id: 'company-owned', ledgerId: crypto.randomUUID(), createdAt: '2026-01-01T00:00:00.000Z' };
  seedIdentity(fixture.db, company);
  migrateCompanyAuthority(fixture.db);
  const key = generateAuthorityKey();
  fixture.db.prepare("INSERT INTO company_authority (id, environment_id, generation, status, public_key, transfer_id, details_json, updated_at) VALUES ('current', ?, 1, 'frozen', ?, NULL, ?, ?)")
    .run(key.environmentId, key.publicKey, JSON.stringify({ mode: 'hosted', origin: 'https://example.test' }), company.createdAt);
  const before = snapshot(fixture.db);
  const url = new URL(fixture.options.databaseUrl);
  url.searchParams.set('options', '-c search_path=owned');
  assert.throws(() => new PostgresSyncDatabase({ connectionString: url.toString() }), { code: 'postgres_schema_unsupported' });
  for (const authorityMaintenance of [false, true]) {
    assert.throws(() => new ContractorOperatingLedger({ databaseUrl: url.toString(), companyId: company.id, authorityMaintenance }), { code: 'postgres_schema_unsupported' });
  }
  assert.deepEqual(snapshot(fixture.db), before);
});

test('PostgreSQL connections pin public before a later role schema can shadow its tables', { skip: !connectionString }, async t => {
  const fixture = await createDatabase(t);
  const company = { id: 'company-owned', ledgerId: crypto.randomUUID(), createdAt: '2026-01-01T00:00:00.000Z' };
  seedIdentity(fixture.db, company);
  assert.equal(fixture.db.prepare('SHOW search_path').get().search_path, 'public');
  const role = fixture.db.prepare('SELECT current_user AS role').get().role;
  const identifier = `"${role.replaceAll('"', '""')}"`;
  fixture.db.exec(`CREATE SCHEMA ${identifier}`);
  fixture.db.exec(`CREATE TABLE ${identifier}.company_runtime AS SELECT * FROM public.company_runtime`);
  fixture.db.prepare(`UPDATE ${identifier}.company_runtime SET company_id = ?`).run('company-shadow');
  assert.deepEqual(readCompanyRuntime(fixture.db), company);
  assert.throws(() => new PostgresSyncDatabase({ connectionString: fixture.options.databaseUrl }), { code: 'postgres_schema_unsupported' });
  const url = new URL(fixture.options.databaseUrl);
  url.searchParams.set('options', '-c search_path=public');
  const explicitPublic = new PostgresSyncDatabase({ connectionString: url.toString() });
  try { assert.deepEqual(readCompanyRuntime(explicitPublic), company); } finally { explicitPublic.close(); }
});
