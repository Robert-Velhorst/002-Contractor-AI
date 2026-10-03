const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { BACKUP_MANIFEST_V3, signBackupManifest } = require('../backup-manifest');
const { migrateLocalBackupToHosted } = require('../scripts/migrate-local-backup-to-hosted');

const { postgresTestDatabaseUrl } = require('./postgres-test-database');
const connectionString = postgresTestDatabaseUrl();

test('PostgreSQL preserves company-bound SQLite migration and keeps a second company independent', { skip: !connectionString }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-company-postgres-'));
  const admin = new Client({ connectionString });
  await admin.connect();
  const createdDatabases = [];
  t.after(async () => {
    try {
      for (const name of createdDatabases) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    } finally {
      await admin.end();
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
  async function isolatedDatabase() {
    const name = `contractor_company_test_${crypto.randomBytes(8).toString('hex')}`;
    await admin.query(`CREATE DATABASE "${name}"`);
    createdDatabases.push(name);
    const url = new URL(connectionString);
    url.pathname = `/${name}`;
    return url.toString();
  }
  const databaseUrl = await isolatedDatabase();
  const otherDatabaseUrl = await isolatedDatabase();
  const backupFile = path.join(root, 'ledger.sqlite');
  const local = new ContractorOperatingLedger({ dbFile: backupFile, companyId: 'company-original' });
  const company = local.company;
  const job = local.createIntake({ title: 'Retained local work', client: { name: 'Private original customer' } }, { actor: 'migration_test' });
  local.close();
  const signingKey = 'company-postgres-test-signing-key-at-least-32-bytes';
  fs.writeFileSync(path.join(root, 'manifest.json'), JSON.stringify(signBackupManifest({
    format: BACKUP_MANIFEST_V3, backupId: 'company-postgres-fixture', company,
    createdAt: new Date().toISOString(), databaseMode: 'sqlite', database: { engine: 'sqlite', file: 'ledger.sqlite' },
    evidence: { included: true, fileCount: 0 },
    files: [{ file: 'ledger.sqlite', bytes: fs.statSync(backupFile).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(backupFile)).digest('hex') }]
  }, signingKey)));
  await assert.rejects(migrateLocalBackupToHosted({ backupDir: root, databaseUrl, signingKey, companyId: 'wrong-company' }), { code: 'company_runtime_mismatch' });
  const result = await migrateLocalBackupToHosted({ backupDir: root, databaseUrl, signingKey, companyId: company.id });
  assert.equal(result.success, true);
  const hosted = new ContractorOperatingLedger({ databaseUrl, companyId: company.id });
  const other = new ContractorOperatingLedger({ databaseUrl: otherDatabaseUrl, companyId: 'company-other' });
  try {
    assert.deepEqual(hosted.company, company);
    assert.equal(hosted.getJobRow(job.id).title, 'Retained local work');
    assert.equal(other.getJobRow(job.id), undefined);
    assert.notEqual(other.company.ledgerId, hosted.company.ledgerId);
    assert.throws(() => new ContractorOperatingLedger({ databaseUrl, companyId: 'company-other' }), { code: 'company_runtime_mismatch' });
    assert.equal(hosted.migrationStatus().currentVersion, '096_loading_read_indexes');
  } finally { hosted.close(); other.close(); }
});
