const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { spawnSync } = require('node:child_process');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { generateAuthorityKey, targetDescription, prepareSource, readAuthority, validatePreparedPackage, retainTargetVerification,
  retireSource, activateTarget, abortSource, persist, verifyAuthorityHistory, authorityMarkerFile, readAuthorityMarker, retainAuthorityMarker, digest } = require('../company-authority');
const { signBackupManifest } = require('../backup-manifest');
const { createHandoverPackage, privateOutput } = require('../company-handover');
const { acquireLedgerRuntimeLock } = require('../runtime-lock');
const { verifyBackupDirectory } = require('../scripts/migrate-local-backup-to-hosted');
const { restore } = require('../scripts/restore-local-backup');
const { main } = require('../scripts/company-handover');

const actor = 'fixture-owner', reason = 'Reviewed relocation test';
const signingKey = 'handover-fixture-backup-signing-key-32-characters';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-handover-'));
  const dataDir = path.join(root, 'source'), uploadDir = path.join(dataDir, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const dbFile = path.join(dataDir, 'ledger.sqlite');
  const ledger = new ContractorOperatingLedger({ dbFile, companyId: 'handover-company' });
  const job = ledger.createIntake({ title: 'Retained repair', client: { name: 'Private fixture client' } }, { actor });
  const sourceKey = generateAuthorityKey(), targetKey = generateAuthorityKey();
  const target = targetDescription({ key: targetKey, origin: 'https://contractor.example.test' });
  const cleanups = [() => ledger.close()];
  t.after(() => {
    for (const cleanup of cleanups.reverse()) cleanup();
    assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('contractor-handover-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  return { root, dataDir, uploadDir, dbFile, ledger, job, sourceKey, targetKey, target, company: ledger.company, cleanup: fn => cleanups.push(fn) };
}
const freeze = f => prepareSource(f.ledger.db, { key: f.sourceKey, target: f.target, company: f.company, actor, reason,
  beforeCommit: state => retainAuthorityMarker(f.dbFile, state) });
const pack = f => createHandoverPackage(f.ledger.db, { key: f.sourceKey, dataDir: f.dataDir, uploadDir: f.uploadDir, signingKey, ledgerFilename: 'ledger.sqlite' });

test('frozen source rejects business writes from existing connections, generic restore and fresh runtime startup', t => {
  const f = fixture(t);
  const oldConnection = new DatabaseSync(f.dbFile); f.cleanup(() => oldConnection.close());
  freeze(f);
  assert.throws(() => oldConnection.prepare('UPDATE jobs SET title = ? WHERE id = ?').run('must not change', f.job.id), /company_authority_blocked/);
  assert.throws(() => oldConnection.prepare('DELETE FROM clients').run(), /company_authority_blocked/);
  assert.throws(() => oldConnection.prepare('UPDATE evidence_storage_quota_lock SET id = 2 WHERE id = 1').run(), /company_authority_blocked/);
  assert.throws(() => f.ledger.createIntake({ title: 'blocked', client: { name: 'blocked' } }, { actor }), /company_authority_blocked/);
  assert.equal(f.ledger.getJobRow(f.job.id).title, 'Retained repair');
  assert.throws(() => new ContractorOperatingLedger({ dbFile: f.dbFile, authorityKey: f.sourceKey }), { code: 'company_authority_blocked' });
  const artifact = pack(f);
  assert.equal(artifact.verified, true);
  assert.equal(artifact.encrypted, false);
  assert.equal(verifyBackupDirectory(artifact.directory, { signingKey }).manifest.backupId, artifact.backupId);
  assert.throws(() => restore({ 'data-dir': f.dataDir, 'backup-id': artifact.backupId, 'ledger-db-file': f.dbFile,
    'upload-dir': f.uploadDir, 'signing-key': signingKey, confirm: `RESTORE_${artifact.backupId}` }), { code: 'authority_restore_review_required' });
  assert.equal(readAuthority(f.ledger.db).status, 'frozen');
});

test('target remains fenced until its matching verified receipt retires the source; repeats are idempotent', t => {
  const f = fixture(t); freeze(f); const artifact = pack(f);
  const source = new DatabaseSync(path.join(artifact.directory, 'ledger.sqlite'), { readOnly: true }); f.cleanup(() => source.close());
  const verified = verifyBackupDirectory(artifact.directory, { signingKey });
  const staged = validatePreparedPackage({ sourceDb: source, permit: artifact.permit, key: f.targetKey, company: f.company, manifestSha256: verified.manifestHash });
  const targetFile = path.join(f.root, 'target.sqlite');
  const targetLedger = new ContractorOperatingLedger({ dbFile: targetFile, companyId: f.company.id }); f.cleanup(() => targetLedger.close());
  // This unit fixture exercises transitions; PostgreSQL integration verifies data migration separately.
  targetLedger.db.prepare('UPDATE company_runtime SET ledger_id = ?').run(f.company.ledgerId);
  targetLedger.transaction(() => persist(targetLedger.db, staged));
  assert.throws(() => targetLedger.createIntake({ title: 'too early', client: { name: 'blocked' } }, { actor }), /company_authority_blocked/);
  assert.throws(() => activateTarget(targetLedger.db, { key: f.targetKey, release: {}, actor, reason }), { code: 'authority_target_unverified' });
  const receipt = retainTargetVerification(targetLedger.db, { key: f.targetKey, result: {
    manifestSha256: verified.manifestHash, databaseSha256: 'b'.repeat(64), receiptId: 'fixture-receipt', evidenceFiles: 0, diagnostics: { valid: true }, auditIntegrity: { valid: true }
  } });
  const changed = structuredClone(receipt); changed.body.targetEnvironmentId = generateAuthorityKey().environmentId;
  assert.throws(() => retireSource(f.ledger.db, { key: f.sourceKey, receipt: changed, actor, reason }), { code: 'authority_signature_invalid' });
  const release = retireSource(f.ledger.db, { key: f.sourceKey, receipt, actor, reason });
  assert.equal(readAuthority(f.ledger.db).status, 'retired');
  assert.throws(() => abortSource(f.ledger.db, { key: f.sourceKey, actor, reason }), { code: 'authority_abort_forbidden' });
  assert.deepEqual(retireSource(f.ledger.db, { key: f.sourceKey, receipt, actor, reason }), release);
  const active = activateTarget(targetLedger.db, { key: f.targetKey, release, actor, reason });
  assert.equal(active.status, 'active');
  const events = verifyAuthorityHistory(targetLedger.db).events;
  assert.equal(activateTarget(targetLedger.db, { key: f.targetKey, release, actor, reason }).status, 'active');
  assert.equal(verifyAuthorityHistory(targetLedger.db).events, events);
  assert.equal(verifyAuthorityHistory(f.ledger.db).valid, true);
  assert.equal(verifyAuthorityHistory(targetLedger.db).valid, true);
  assert.throws(() => new ContractorOperatingLedger({ dbFile: targetFile }), { code: 'authority_key_mismatch' });
  assert.throws(() => new ContractorOperatingLedger({ dbFile: f.dbFile, authorityKey: f.sourceKey }), { code: 'company_authority_blocked' });
});

test('aborting an unreleased transfer restores only the source and prevents use of the previous transfer receipt', t => {
  const f = fixture(t); freeze(f); const artifact = pack(f);
  const oldTransferId = readAuthority(f.ledger.db).transferId;
  assert.equal(abortSource(f.ledger.db, { key: f.sourceKey, actor, reason }).status, 'active');
  assert.throws(() => new ContractorOperatingLedger({ dbFile: f.dbFile }), { code: 'authority_key_mismatch' });
  const reopened = new ContractorOperatingLedger({ dbFile: f.dbFile, companyId: f.company.id, authorityKey: f.sourceKey }); f.cleanup(() => reopened.close());
  assert.equal(reopened.getJobRow(f.job.id).title, 'Retained repair');
  freeze(f);
  assert.notEqual(readAuthority(f.ledger.db).transferId, oldTransferId);
  assert.notEqual(readAuthority(f.ledger.db).generation, artifact.permit.body.generation);
  assert.equal(verifyAuthorityHistory(f.ledger.db).events, 4);
});

test('wrong keys, companies, target origins and changed manifests fail before destination use', t => {
  const f = fixture(t);
  assert.throws(() => targetDescription({ key: f.targetKey, origin: 'http://example.test' }), { code: 'authority_target_invalid' });
  assert.throws(() => prepareSource(f.ledger.db, { key: f.sourceKey, target: f.target, company: { ...f.company, id: 'other-company' }, actor, reason }), { code: 'company_runtime_mismatch' });
  assert.equal(readAuthority(f.ledger.db), null);
  freeze(f); const artifact = pack(f);
  const sourceDb = new DatabaseSync(path.join(artifact.directory, 'ledger.sqlite')); f.cleanup(() => sourceDb.close());
  const verification = verifyBackupDirectory(artifact.directory, { signingKey });
  const options = { sourceDb, permit: artifact.permit, key: f.targetKey, company: f.company, manifestSha256: verification.manifestHash };
  assert.throws(() => validatePreparedPackage({ ...options, key: generateAuthorityKey() }), { code: 'authority_package_mismatch' });
  assert.throws(() => validatePreparedPackage({ ...options, manifestSha256: '0'.repeat(64) }), { code: 'authority_package_mismatch' });
  assert.throws(() => pack(f), /already has a sealed package/);
  const exported = fs.readFileSync(path.join(artifact.directory, 'manifest.json'), 'utf8');
  assert.ok(!exported.includes(f.sourceKey.privateKey));
});

test('real maintenance commands retain uncertain output and refuse an active ledger process lock', async t => {
  const f = fixture(t);
  const keyFile = path.join(f.root, 'source-key.json'), targetFile = path.join(f.root, 'target.json');
  privateOutput(keyFile, f.sourceKey); privateOutput(targetFile, f.target);
  const env = { ...process.env, CONTRACTOR_AI_RUNTIME_MODE: 'local', CONTRACTOR_AI_DATA_DIR: f.dataDir, LEDGER_DB_FILE: f.dbFile,
    UPLOAD_DIR: f.uploadDir, CONTRACTOR_AI_AUTHORITY_KEY_FILE: keyFile, CONTRACTOR_AI_BACKUP_SIGNING_KEY: signingKey };
  delete env.CONTRACTOR_AI_DATABASE_URL;
  const common = ['--company-id', f.company.id, '--ledger-id', f.company.ledgerId, '--actor', actor, '--reference', reason];
  const lock = acquireLedgerRuntimeLock(f.dbFile, { purpose: 'fixture-runtime' });
  try { await assert.rejects(main(['freeze', ...common, '--target-file', targetFile, '--confirm', 'FREEZE_LOCAL_SOURCE'], env), { code: 'contractor_ai_runtime_active' }); }
  finally { lock.release(); }
  const run = args => spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/company-handover.js'), ...args], { env, encoding: 'utf8', timeout: 30000, windowsHide: true });
  const frozen = run(['freeze', ...common, '--target-file', targetFile, '--confirm', 'FREEZE_LOCAL_SOURCE']);
  assert.equal(frozen.status, 0, frozen.stderr);
  assert.equal(JSON.parse(frozen.stdout).status, 'frozen');
  assert.equal(readAuthorityMarker(f.dbFile).minimumGeneration, 1);
  const existing = path.join(f.root, 'existing.json'); privateOutput(existing, { retain: true });
  const failed = run(['package', ...common, '--output', existing, '--confirm', 'PACKAGE_FROZEN_SOURCE']);
  assert.equal(failed.status, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(existing, 'utf8')), { retain: true });
  assert.ok(readAuthority(f.ledger.db).details.permit, 'Output-file failure must not erase the committed package permit.');
  const output = path.join(f.root, 'permit.json');
  const recovered = run(['export-permit', ...common, '--output', output]);
  assert.equal(recovered.status, 0, recovered.stderr);
  assert.equal(JSON.parse(fs.readFileSync(output, 'utf8')).body.transferId, readAuthority(f.ledger.db).transferId);
  assert.ok(![frozen.stdout, failed.stderr, recovered.stdout].join('').includes(f.sourceKey.privateKey));
});

test('retained authority marker refuses stale unbound and previously active snapshots', t => {
  const f = fixture(t), oldFile = path.join(f.root, 'old.sqlite'), activeFile = path.join(f.root, 'active.sqlite');
  f.ledger.db.prepare('VACUUM INTO ?').run(oldFile);
  freeze(f);
  abortSource(f.ledger.db, { key: f.sourceKey, actor, reason, beforeCommit: state => retainAuthorityMarker(f.dbFile, state) });
  f.ledger.db.prepare('VACUUM INTO ?').run(activeFile);
  freeze(f);
  for (const file of [oldFile, activeFile]) {
    fs.copyFileSync(authorityMarkerFile(f.dbFile), authorityMarkerFile(file));
    assert.throws(() => new ContractorOperatingLedger({ dbFile: file, authorityKey: f.sourceKey }), { code: 'authority_rollback_blocked' });
  }
  assert.equal(readAuthorityMarker(f.dbFile).minimumGeneration, 3);
});

test('marker advancement survives a failed database commit and blocks further CLI transitions', async t => {
  const f = fixture(t), keyFile = path.join(f.root, 'source-key.json');
  privateOutput(keyFile, f.sourceKey);
  assert.throws(() => prepareSource(f.ledger.db, { key: f.sourceKey, company: f.company, target: f.target, actor, reason,
    beforeCommit: state => { retainAuthorityMarker(f.dbFile, state); throw new Error('simulated storage interruption'); }
  }), /simulated storage interruption/);
  assert.equal(readAuthority(f.ledger.db), null);
  assert.equal(readAuthorityMarker(f.dbFile).minimumGeneration, 1);
  assert.throws(() => new ContractorOperatingLedger({ dbFile: f.dbFile }), { code: 'authority_rollback_blocked' });
  await assert.rejects(main(['abort', '--company-id', f.company.id, '--ledger-id', f.company.ledgerId, '--actor', actor,
    '--reference', reason, '--confirm', 'ABORT_UNRELEASED_HANDOVER'], {
    CONTRACTOR_AI_RUNTIME_MODE: 'local', CONTRACTOR_AI_DATA_DIR: f.dataDir, LEDGER_DB_FILE: f.dbFile, CONTRACTOR_AI_AUTHORITY_KEY_FILE: keyFile
  }), { code: 'authority_rollback_blocked' });
});

test('a source marker blocks generic restoration even when the current database is corrupt', t => {
  const f = fixture(t), backupId = 'pre-handover-fixture', backupDir = path.join(f.dataDir, 'backups', backupId);
  fs.mkdirSync(backupDir, { recursive: true });
  const backupFile = path.join(backupDir, 'ledger.sqlite');
  f.ledger.db.prepare('VACUUM INTO ?').run(backupFile);
  privateOutput(path.join(backupDir, 'manifest.json'), signBackupManifest({ backupId, company: f.company, createdAt: new Date().toISOString(),
    databaseMode: 'sqlite', database: { engine: 'sqlite', file: 'ledger.sqlite' }, evidence: { included: true, fileCount: 0 },
    files: [{ file: 'ledger.sqlite', bytes: fs.statSync(backupFile).size, sha256: digest(fs.readFileSync(backupFile)) }] }, signingKey));
  freeze(f);
  const corruptFile = path.join(f.root, 'ledger.sqlite');
  fs.writeFileSync(corruptFile, 'deliberately corrupt disposable fixture');
  fs.copyFileSync(authorityMarkerFile(f.dbFile), authorityMarkerFile(corruptFile));
  assert.throws(() => restore({ 'data-dir': f.dataDir, 'backup-id': backupId, 'ledger-db-file': corruptFile,
    'upload-dir': f.uploadDir, 'signing-key': signingKey, confirm: `RESTORE_${backupId}` }), { code: 'authority_restore_review_required' });
  assert.equal(fs.readFileSync(corruptFile, 'utf8'), 'deliberately corrupt disposable fixture');
});

test('authority history must describe the current retained state', t => {
  const f = fixture(t); freeze(f);
  f.ledger.db.prepare('UPDATE company_authority SET generation = generation + 1').run();
  assert.deepEqual(verifyAuthorityHistory(f.ledger.db), { valid: false, reason: 'authority_head_mismatch' });
  assert.throws(() => abortSource(f.ledger.db, { key: f.sourceKey, actor, reason }), { code: 'authority_history_invalid' });
});

test('operational API never advertises generic recovery for an authority-bound local company', async t => {
  const cleanups = [], f = fixture({ after: callback => cleanups.push(callback) }), originalEnv = { ...process.env };
  let app, server;
  t.after(async () => {
    if (app) await app.locals.runtimeControl.shutdown({ server });
    for (const name of Object.keys(process.env)) if (!Object.hasOwn(originalEnv, name)) delete process.env[name];
    Object.assign(process.env, originalEnv);
    for (const cleanup of cleanups) cleanup();
  });
  freeze(f);
  abortSource(f.ledger.db, { key: f.sourceKey, actor, reason, beforeCommit: state => retainAuthorityMarker(f.dbFile, state) });
  const keyFile = path.join(f.root, 'source.authority-key.json'); privateOutput(keyFile, f.sourceKey);
  const ownerKey = 'synthetic-handover-owner-token-at-least-32-characters';
  Object.assign(process.env, { NODE_ENV: 'test', CONTRACTOR_AI_RUNTIME_MODE: 'local', CONTRACTOR_AI_STORAGE_MODE: 'local',
    CONTRACTOR_AI_COMPANY_ID: f.company.id, CONTRACTOR_AI_DATA_DIR: f.dataDir, LEDGER_DB_FILE: f.dbFile,
    STATE_FILE: path.join(f.dataDir, 'state.json'), UPLOAD_DIR: f.uploadDir, CONTRACTOR_AI_REQUIRE_AUTH: 'true', CONTRACTOR_AI_AUTH_TOKEN: ownerKey,
    CONTRACTOR_AI_ROLE_TOKENS: '', CONTRACTOR_AI_AUTONOMOUS_SCHEDULER_ENABLED: 'false', WEATHER_PROVIDER_ENABLED: 'false',
    CONTRACTOR_AI_AUTHORITY_KEY_FILE: keyFile, CONTRACTOR_AI_BACKUP_SIGNING_KEY: signingKey });
  delete process.env.CONTRACTOR_AI_DATABASE_URL;
  delete require.cache[require.resolve('../server')];
  app = require('../server'); server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`, headers = { Authorization: `Bearer ${ownerKey}`, 'Content-Type': 'application/json' };
  const capabilities = await fetch(`${base}/api/operations/capabilities`, { headers }).then(response => response.json());
  assert.equal(capabilities.capabilities.restore.available, false);
  assert.equal(capabilities.capabilities.restore.authorityReviewRequired, true);
  assert.equal(capabilities.capabilities.hostedMigration.targetedPermitRequired, true);
  const response = await fetch(`${base}/api/operations/backup`, { method: 'POST', headers, body: '{}' });
  assert.equal(response.status, 201);
  const backup = (await response.json()).backup;
  const validation = await fetch(`${base}/api/operations/restore/validate`, { method: 'POST', headers, body: JSON.stringify({ backupId: backup.backupId }) });
  assert.equal(validation.status, 409);
  const result = await validation.json();
  assert.equal(result.restorable, false);
  assert.ok(result.verification.failures.some(failure => failure.reason === 'authority_restore_review_required'));
  assert.match(result.nextStep, /generic restore is blocked/);
});
