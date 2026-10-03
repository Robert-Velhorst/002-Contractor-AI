const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { bindCompanyDirectories, COMPANY_MARKER, readCompanyRuntime } = require('../company-runtime');
const { signBackupManifest, BACKUP_MANIFEST_V3 } = require('../backup-manifest');
const { restore, verifySqliteBackupDatabase } = require('../scripts/restore-local-backup');
const { migrateLocalBackupToHosted } = require('../scripts/migrate-local-backup-to-hosted');

function directory(t, dispose = () => {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-company-'));
  t.after(() => { dispose(); fs.rmSync(root, { recursive: true, force: true }); });
  return root;
}

test('a local ledger acquires one durable company identity without changing existing records', t => {
  const dbFile = path.join(directory(t), 'ledger.sqlite');
  const legacy = new ContractorOperatingLedger({ dbFile });
  legacy.db.prepare("INSERT INTO clients (id, name, created_at, updated_at) VALUES ('same-id', 'Existing client', ?, ?)").run(new Date().toISOString(), new Date().toISOString());
  legacy.close();
  const first = new ContractorOperatingLedger({ dbFile, companyId: undefined });
  const company = first.company;
  assert.ok(company.id.startsWith('company_'));
  assert.equal(first.db.prepare('SELECT name FROM clients WHERE id = ?').get('same-id').name, 'Existing client');
  first.close();
  const restarted = new ContractorOperatingLedger({ dbFile, companyId: undefined });
  assert.deepEqual(restarted.company, company);
  restarted.close();
  assert.throws(() => new ContractorOperatingLedger({ dbFile, companyId: 'other-company' }), { code: 'company_runtime_mismatch' });
  const check = new DatabaseSync(dbFile, { readOnly: true });
  assert.deepEqual(readCompanyRuntime(check), company);
  assert.equal(check.prepare('SELECT COUNT(*) AS count FROM clients').get().count, 1);
  check.close();
});

test('separate companies retain independent records even when their record IDs overlap', t => {
  let a, b;
  const root = directory(t, () => { a?.close(); b?.close(); });
  a = new ContractorOperatingLedger({ dbFile: path.join(root, 'a.sqlite'), companyId: 'company-a' });
  b = new ContractorOperatingLedger({ dbFile: path.join(root, 'b.sqlite'), companyId: 'company-b' });
  for (const [ledger, name] of [[a, 'Private A'], [b, 'Private B']]) {
    ledger.db.prepare("INSERT INTO clients (id, name, created_at, updated_at) VALUES ('same-id', ?, ?, ?)").run(name, new Date().toISOString(), new Date().toISOString());
  }
  assert.notEqual(a.company.ledgerId, b.company.ledgerId);
  assert.equal(a.db.prepare('SELECT name FROM clients').get().name, 'Private A');
  assert.equal(b.db.prepare('SELECT name FROM clients').get().name, 'Private B');
  const uploads = path.join(root, 'uploads');
  bindCompanyDirectories(a.company, [uploads]);
  bindCompanyDirectories(a.company, [uploads]);
  assert.throws(() => bindCompanyDirectories(b.company, [uploads]), { code: 'company_runtime_mismatch' });
  fs.writeFileSync(path.join(uploads, COMPANY_MARKER), '{}');
  assert.throws(() => bindCompanyDirectories(a.company, [uploads]), { code: 'company_marker_invalid' });
});

test('invalid configured identities fail before creating a database', t => {
  const dbFile = path.join(directory(t), 'ledger.sqlite');
  for (const companyId of ['../outside', 'UPPER', 'with spaces', 'x'.repeat(65), 12]) {
    assert.throws(() => new ContractorOperatingLedger({ dbFile, companyId }), { code: 'invalid_company_id' });
    assert.equal(fs.existsSync(dbFile), false);
  }
});

test('a mismatched retained directory prevents legacy data import before business rows are written', t => {
  const root = directory(t);
  const dbFile = path.join(root, 'ledger.sqlite');
  let imported = false;
  assert.throws(() => new ContractorOperatingLedger({
    dbFile, companyId: 'company-b',
    expectedCompany: { id: 'company-a', ledgerId: crypto.randomUUID() },
    stateProvider: () => { imported = true; return { jobs: [], workers: [], tools: [] }; }
  }), { code: 'company_runtime_mismatch' });
  assert.equal(imported, false);
  const db = new DatabaseSync(dbFile, { readOnly: true });
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'").get().count, 0);
  db.close();
});

test('signed backups retain company identity and cannot overwrite another company', async t => {
  const root = directory(t);
  const signingKey = 'company-backup-test-signing-key-at-least-32-bytes';
  const target = path.join(root, 'ledger.sqlite');
  const backupId = 'company-bound-backup';
  const backupDir = path.join(root, 'backups', backupId);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, 'ledger.sqlite');
  const a = new ContractorOperatingLedger({ dbFile: target, companyId: 'company-a' });
  const companyA = a.company;
  a.createIntake({ title: 'Company A retained work', client: { name: 'Company A client' } }, { actor: 'test' });
  bindCompanyDirectories(a.company, [root, path.join(root, 'uploads')]);
  a.close();
  fs.copyFileSync(target, backupFile);
  function manifest(company) {
    fs.writeFileSync(path.join(backupDir, 'manifest.json'), JSON.stringify(signBackupManifest({
      format: BACKUP_MANIFEST_V3, backupId, company, createdAt: new Date().toISOString(), databaseMode: 'sqlite',
      database: { engine: 'sqlite', file: 'ledger.sqlite' }, evidence: { included: true, fileCount: 0 },
      files: [{ file: 'ledger.sqlite', bytes: fs.statSync(backupFile).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex') }]
    }, signingKey)));
  }
  manifest(companyA);
  assert.deepEqual(verifySqliteBackupDatabase(backupFile).company, companyA);
  await assert.rejects(migrateLocalBackupToHosted({
    backupDir, signingKey, companyId: companyA.id,
    databaseUrl: 'postgresql://unused:unused@127.0.0.1:1/unused?sslmode=verify-full',
    storage: { prefix: 'companies/foreign-company/evidence' }
  }), { code: 'company_storage_scope_mismatch' });
  const args = { 'data-dir': root, 'ledger-db-file': target, 'backup-id': backupId, 'signing-key': signingKey, confirm: `RESTORE_${backupId}` };
  assert.equal(restore(args).success, true);
  const restored = new ContractorOperatingLedger({ dbFile: target, companyId: 'company-a' });
  assert.deepEqual(restored.company, companyA);
  restored.close();
  // A validly signed but foreign package must fail before making any safety swap.
  const foreignFile = path.join(root, 'foreign.sqlite');
  const b = new ContractorOperatingLedger({ dbFile: foreignFile, companyId: 'company-b' });
  const companyB = b.company;
  b.close();
  fs.copyFileSync(foreignFile, backupFile);
  manifest(companyB);
  const before = crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  assert.throws(() => restore(args), { code: 'company_runtime_mismatch' });
  assert.equal(crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex'), before);
});
