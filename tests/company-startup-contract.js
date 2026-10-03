const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { migrateCompanyRuntime, readCompanyRuntime } = require('../company-runtime');

function retainedCompany() {
  return { id: 'company-owned', ledgerId: crypto.randomUUID(), createdAt: '2026-01-01T00:00:00.000Z' };
}

function seedIdentity(db, company, identityTable = true) {
  if (identityTable) {
    migrateCompanyRuntime(db);
    if (company) db.prepare("INSERT INTO company_runtime (id, company_id, ledger_id, created_at) VALUES ('current', ?, ?, ?)")
      .run(company.id, company.ledgerId, company.createdAt);
  }
  db.exec('CREATE TABLE startup_retained_records (id TEXT PRIMARY KEY, note TEXT NOT NULL)');
  db.prepare('INSERT INTO startup_retained_records (id, note) VALUES (?, ?)').run('retained', 'Do not modify on rejected startup');
}

function snapshot(db) {
  const hosted = typeof db.query === 'function';
  const schema = hosted ? {
    columns: db.prepare("SELECT table_schema, table_name, column_name, ordinal_position, data_type, column_default, is_nullable FROM information_schema.columns WHERE table_schema <> 'information_schema' AND table_schema NOT LIKE 'pg_%' ORDER BY table_schema, table_name, ordinal_position").all(),
    indexes: db.prepare("SELECT schemaname, tablename, indexname, indexdef FROM pg_indexes WHERE schemaname <> 'information_schema' AND schemaname NOT LIKE 'pg_%' ORDER BY schemaname, tablename, indexname").all(),
    constraints: db.prepare("SELECT table_schema, table_name, constraint_name, constraint_type FROM information_schema.table_constraints WHERE table_schema <> 'information_schema' AND table_schema NOT LIKE 'pg_%' ORDER BY table_schema, table_name, constraint_name").all()
  } : db.prepare("SELECT type, name, tbl_name, sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type, name").all();
  const tables = db.prepare(hosted
    ? "SELECT table_schema AS schema, table_name AS name FROM information_schema.tables WHERE table_schema <> 'information_schema' AND table_schema NOT LIKE 'pg_%' AND table_type = 'BASE TABLE' ORDER BY table_schema, table_name"
    : "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all();
  const rows = tables.map(({ schema, name }) => {
    const quote = value => `"${value.replaceAll('"', '""')}"`;
    const identifier = schema ? `${quote(schema)}.${quote(name)}` : quote(name);
    return { schema, name, rows: db.prepare(`SELECT * FROM ${identifier}`).all().map(row => JSON.stringify(row)).sort() };
  });
  const digest = value => crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
  return { schemaDigest: digest(schema), recordsDigest: digest(rows), journalMode: hosted ? null : db.prepare('PRAGMA journal_mode').get().journal_mode };
}

function registerCompanyStartupContract(test, { prefix, createDatabase, skip = false }) {
  const cases = [
    { name: 'configured foreign company', options: () => ({ companyId: 'company-other' }) },
    { name: 'foreign directory company', options: company => ({ companyId: company.id, expectedCompany: { ...company, id: 'company-other' } }) },
    { name: 'same company with a foreign ledger identity', options: company => ({ companyId: company.id, expectedCompany: { ...company, ledgerId: crypto.randomUUID() } }) },
    { name: 'orphaned directory with an unbound database', unbound: true, options: company => ({ companyId: company.id, expectedCompany: company }) },
    { name: 'orphaned directory with no identity table', unbound: true, identityTable: false, options: company => ({ companyId: company.id, expectedCompany: company }) },
    { name: 'expected identity without company binding', options: company => ({ expectedCompany: company }) },
    { name: 'automatic company selection with a foreign ledger identity', options: company => ({ companyId: undefined, expectedCompany: { ...company, ledgerId: crypto.randomUUID() } }) },
    { name: 'explicit null company selection with a foreign directory', options: company => ({ companyId: null, expectedCompany: { ...company, id: 'company-other' } }) },
    { name: 'foreign company in authority maintenance', options: () => ({ companyId: 'company-other', authorityMaintenance: true }) },
    { name: 'invalid retained identity', invalid: true, options: () => ({ companyId: undefined }), code: 'company_runtime_invalid' }
  ];
  for (const scenario of cases) {
    test(`${prefix}: rejects ${scenario.name} before changing schema, rows or journal mode`, { skip }, async t => {
      const fixture = await createDatabase(t);
      const company = retainedCompany();
      seedIdentity(fixture.db, scenario.unbound ? null : scenario.invalid ? { ...company, ledgerId: 'invalid-ledger' } : company, scenario.identityTable !== false);
      const before = snapshot(fixture.db);
      let imported = false;
      assert.throws(() => new ContractorOperatingLedger({ ...fixture.options, ...scenario.options(company),
        stateProvider: () => { imported = true; return { jobs: [], workers: [], tools: [] }; }
      }), { code: scenario.code || 'company_runtime_mismatch' });
      assert.equal(imported, false, 'Rejected startup must not read legacy business data');
      assert.deepEqual(snapshot(fixture.db), before, 'Rejected startup must leave all retained schema and records unchanged');
    });
  }

  test(`${prefix}: adopts an unbound legacy ledger and preserves its existing records`, { skip }, async t => {
    const fixture = await createDatabase(t);
    seedIdentity(fixture.db, null);
    const ledger = new ContractorOperatingLedger({ ...fixture.options, companyId: undefined });
    try {
      assert.ok(ledger.company.id.startsWith('company_'));
      assert.deepEqual(readCompanyRuntime(fixture.db), ledger.company);
      assert.equal(ledger.db.prepare('SELECT note FROM startup_retained_records').get().note, 'Do not modify on rejected startup');
      assert.equal(ledger.migrationStatus().currentVersion, '096_loading_read_indexes');
    } finally { ledger.close(); }
  });

  test(`${prefix}: upgrades and restarts the matching environment with its retained identity`, { skip }, async t => {
    const fixture = await createDatabase(t);
    const company = retainedCompany();
    seedIdentity(fixture.db, company);
    const options = { ...fixture.options, companyId: company.id, expectedCompany: { ...company, createdAt: '2026-02-01T00:00:00.000Z' } };
    let imported = false;
    const ledger = new ContractorOperatingLedger({ ...options,
      stateProvider: () => { imported = true; return { jobs: [], workers: [], tools: [] }; }
    });
    try {
      assert.equal(imported, true);
      assert.deepEqual(ledger.company, company);
      assert.equal(ledger.migrationStatus().currentVersion, '096_loading_read_indexes');
      assert.equal(ledger.db.prepare('SELECT id FROM startup_retained_records').all().length, 1);
    } finally { ledger.close(); }
    const restarted = new ContractorOperatingLedger(options);
    try {
      assert.deepEqual(restarted.company, company);
      assert.equal(restarted.db.prepare('SELECT note FROM startup_retained_records').get().note, 'Do not modify on rejected startup');
    } finally { restarted.close(); }
  });

  test(`${prefix}: binds a legacy database without an identity table when null selection is explicit`, { skip }, async t => {
    const fixture = await createDatabase(t);
    seedIdentity(fixture.db, null, false);
    assert.equal(readCompanyRuntime(fixture.db), null);
    const ledger = new ContractorOperatingLedger({ ...fixture.options, companyId: null });
    try {
      assert.ok(ledger.company.id.startsWith('company_'));
      assert.deepEqual(readCompanyRuntime(fixture.db), ledger.company);
      assert.equal(ledger.db.prepare('SELECT id FROM startup_retained_records').all().length, 1);
    } finally { ledger.close(); }
  });

  test(`${prefix}: preserves omitted company binding for maintenance and migration callers`, { skip }, async t => {
    const fixture = await createDatabase(t);
    const company = retainedCompany();
    seedIdentity(fixture.db, company);
    const ledger = new ContractorOperatingLedger({ ...fixture.options, authorityMaintenance: true });
    try {
      assert.equal(ledger.company, null);
      assert.deepEqual(readCompanyRuntime(fixture.db), company);
      assert.equal(ledger.db.prepare('SELECT id FROM startup_retained_records').all().length, 1);
    } finally { ledger.close(); }
  });
}

module.exports = { registerCompanyStartupContract, seedIdentity, snapshot };
