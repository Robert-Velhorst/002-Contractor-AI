const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { generateAuthorityKey, targetDescription, prepareSource, readAuthority, retireSource, activateTarget, abortSource, verifyAuthorityHistory } = require('../company-authority');
const { createHandoverPackage, privateOutput } = require('../company-handover');
const { migrateLocalBackupToHosted } = require('../scripts/migrate-local-backup-to-hosted');
const { main } = require('../scripts/company-handover');

const { postgresTestDatabaseUrl, connectVerifiedPostgresClient } = require('./postgres-test-database');
const connectionString = postgresTestDatabaseUrl();

test('real PostgreSQL transfer retains evidence and company records, blocks staged writes and activates only after source retirement', { skip: !connectionString }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-handover-postgres-'));
  const admin = new Client({ connectionString }); await connectVerifiedPostgresClient(admin);
  const name = `contractor_handover_${crypto.randomBytes(8).toString('hex')}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const databaseNames = [name];
  const url = new URL(connectionString); url.pathname = `/${name}`;
  const databaseUrl = url.toString(), handles = [];
  t.after(async () => {
    for (const handle of handles.reverse()) handle.close();
    try { for (const databaseName of databaseNames) await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`); }
    finally { await admin.end(); assert.ok(path.basename(root).startsWith('contractor-handover-postgres-')); fs.rmSync(root, { recursive: true, force: true }); }
  });
  const dataDir = path.join(root, 'source'), uploadDir = path.join(dataDir, 'uploads'); fs.mkdirSync(uploadDir, { recursive: true });
  const sourceFile = path.join(dataDir, 'ledger.sqlite');
  const source = new ContractorOperatingLedger({ dbFile: sourceFile, companyId: 'company-handover-fixture' }); handles.push(source);
  const job = source.createIntake({ title: 'Migration repair', client: { name: 'Scoped customer' } }, { actor: 'fixture' });
  const shared = require('./work-context-contract').setup(source);
  const location = require('./work-context-contract').hierarchy(shared);
  shared.command('save_package', require('./work-context-contract').packageInput(shared, location.room.id));
  const sharedSource = shared.context.read(shared.job.id);
  const deliveryFixture = require('./work-delivery-contract').setupDelivery(source);
  deliveryFixture.command('retain', deliveryFixture.input);
  const deliveriesSource = deliveryFixture.delivery.source(deliveryFixture.job.id);
  const { WorkBalance, verifyWorkBalance } = require('../work-balance');
  const balance = new WorkBalance(source), balanceView = balance.read(deliveryFixture.job.id);
  const plannedBalance = balance.command(deliveryFixture.job.id, { action: 'plan', entryKey: 'handover-work-balance', sourceHash: balanceView.sourceHash,
    record: { scopeConfirmed: true, reference: 'Approved production fixture and retained delivery', reason: 'Transfer immutable approved work allocation.',
      allocations: [{ lineKey: 'doors', packageId: deliveryFixture.pack.id, plannedQuantity: 2 }] } }, 'handover-fixture');
  source.resolveApproval(plannedBalance.approvalId, { status: 'approved', resolvedBy: 'handover-reviewer' });
  const workBalanceSource = balance.read(deliveryFixture.job.id);
  const assetFixture = require('./asset-history-contract').setupAssetHistory(source);
  assetFixture.command('profile', { assetId: assetFixture.asset.id, serialNumber: 'TRANSFER-001', reason: 'Transfer fixture identity' });
  assetFixture.command('record', assetFixture.input);
  const installedAssetSource = assetFixture.history.source(assetFixture.job.id);
  const coverageFixture = require('./inspection-coverage-contract').verifyCoverageContract(source);
  const coverageSource = coverageFixture.coverage.read(coverageFixture.job.id);
  const clientDeliveryFixture = require('./client-delivery-contract').verifyClientDeliveryContract(source, {
    offer: { authorityReference: 'uploads/proof.jpg' }, response: { note: 'uploads/proof.jpg' }
  });
  const clientDeliverySource = clientDeliveryFixture.clients.exportRecords();
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Buffer.from('handover-evidence')]);
  fs.writeFileSync(path.join(uploadDir, 'proof.jpg'), bytes);
  const document = source.addDocument(job.id, { type: 'field_photo', title: 'Retained photo', filename: 'proof.jpg', mimeType: 'image/jpeg', size: bytes.length, storageRef: 'uploads/proof.jpg' }, { actor: 'fixture' });
  const key = generateAuthorityKey(), targetKey = generateAuthorityKey();
  const target = targetDescription({ key: targetKey, origin: 'https://contractor.example.test' });
  prepareSource(source.db, { key, target, company: source.company, actor: 'fixture', reason: 'Reviewed test handover' });
  const signingKey = 'postgres-handover-fixture-signing-key-long-enough';
  const artifact = createHandoverPackage(source.db, { key, dataDir, uploadDir, signingKey, ledgerFilename: 'ledger.sqlite' });
  const objects = new Map();
  const storage = {
    prefix: `companies/${source.company.id}/evidence`,
    async verify() { return { valid: true }; },
    async store({ buffer }) { const filename = `${crypto.randomUUID()}.jpg`, storageRef = `s3://fixture/${this.prefix}/${filename}`; objects.set(storageRef, Buffer.from(buffer)); return { filename, storageRef }; },
    async read(ref) { if (!objects.has(ref)) throw new Error('Missing fixture object'); return objects.get(ref); },
    async remove(ref) { objects.delete(ref); }
  };
  await assert.rejects(migrateLocalBackupToHosted({ backupDir: artifact.directory, databaseUrl, companyId: source.company.id, storage, signingKey }), { code: 'authority_permit_required' });
  const result = await migrateLocalBackupToHosted({ backupDir: artifact.directory, databaseUrl, companyId: source.company.id, storage, signingKey, handover: { permit: artifact.permit, key: targetKey } });
  assert.equal(result.authorityStatus, 'staged');
  assert.equal(result.success, true);
  assert.equal(result.evidenceFiles, 1);
  const retained = new ContractorOperatingLedger({ databaseUrl, authorityMaintenance: true }); handles.push(retained);
  assert.equal(readAuthority(retained.db).status, 'staged');
  assert.equal(retained.getJobRow(job.id).title, 'Migration repair');
  assert.deepEqual(new (require('../work-context').WorkContext)(retained).read(shared.job.id), sharedSource);
  assert.deepEqual(new (require('../work-delivery').WorkDelivery)(retained).source(deliveryFixture.job.id), deliveriesSource);
  assert.deepEqual(new (require('../work-balance').WorkBalance)(retained).read(deliveryFixture.job.id), workBalanceSource);
  assert.equal(verifyWorkBalance(retained.db), true);
  assert.deepEqual(new (require('../asset-history').AssetHistory)(retained).source(assetFixture.job.id), installedAssetSource);
  assert.deepEqual(new (require('../inspection-coverage').InspectionCoverage)(retained).read(coverageFixture.job.id), coverageSource);
  assert.deepEqual(new (require('../client-delivery').ClientDelivery)(retained).exportRecords(), clientDeliverySource);
  assert.equal(require('../client-delivery').verifyClientDelivery(retained.db), true);
  assert.equal(new (require('../work-delivery').WorkDelivery)(retained).source(clientDeliveryFixture.job.id)[0].response.status, 'accepted_with_reservations');
  const hostedRef = retained.db.prepare('SELECT storage_ref FROM documents WHERE id = ?').get(document.id).storage_ref;
  assert.deepEqual(await storage.read(hostedRef), bytes);
  assert.throws(() => retained.db.prepare('UPDATE jobs SET title = ? WHERE id = ?').run('blocked', job.id), /company_authority_blocked/);
  assert.throws(() => retained.db.exec('TRUNCATE jobs CASCADE'), /company_authority_blocked/);
  assert.throws(() => new ContractorOperatingLedger({ databaseUrl, authorityKey: targetKey }), { code: 'company_authority_blocked' });
  const keyFile = path.join(root, 'target-key.json'); privateOutput(keyFile, targetKey);
  const receiptFile = path.join(root, 'recovered-receipt.json');
  await main(['export-receipt', '--company-id', source.company.id, '--ledger-id', source.company.ledgerId,
    '--actor', 'fixture', '--reference', 'Recover missed receipt output', '--output', receiptFile], {
    CONTRACTOR_AI_RUNTIME_MODE: 'hosted', CONTRACTOR_AI_DATABASE_URL: databaseUrl, CONTRACTOR_AI_AUTHORITY_KEY_FILE: keyFile
  });
  assert.deepEqual(JSON.parse(fs.readFileSync(receiptFile, 'utf8')), result.handoverReceipt);
  const release = retireSource(source.db, { key, receipt: result.handoverReceipt, actor: 'fixture', reason: 'Target verified' });
  assert.equal(readAuthority(source.db).status, 'retired');
  assert.equal(activateTarget(retained.db, { key: targetKey, release, actor: 'fixture', reason: 'Source retired' }).status, 'active');
  assert.throws(() => new ContractorOperatingLedger({ databaseUrl, authorityKey: key }), { code: 'authority_key_mismatch' });
  const active = new ContractorOperatingLedger({ databaseUrl, authorityKey: targetKey, companyId: source.company.id }); handles.push(active);
  assert.deepEqual(active.company, source.company);
  const next = active.createIntake({ title: 'New hosted work', client: { name: 'New hosted customer' } }, { actor: 'fixture' });
  assert.ok(next.id);
  assert.throws(() => source.createIntake({ title: 'Old source write', client: { name: 'blocked' } }, { actor: 'fixture' }), /company_authority_blocked/);
  assert.equal(verifyAuthorityHistory(retained.db).valid, true);
  assert.equal(verifyAuthorityHistory(source.db).valid, true);
  await t.test('lost commit acknowledgement preserves staged data and evidence and permits only an unreleased-source abort', async () => {
    const nextName = `contractor_handover_${crypto.randomBytes(8).toString('hex')}`;
    await admin.query(`CREATE DATABASE "${nextName}"`); databaseNames.push(nextName);
    const nextUrl = new URL(databaseUrl); nextUrl.pathname = `/${nextName}`;
    const nextDir = path.join(root, 'uncertain-source'), nextUploads = path.join(nextDir, 'uploads'); fs.mkdirSync(nextUploads, { recursive: true });
    const nextSource = new ContractorOperatingLedger({ dbFile: path.join(nextDir, 'ledger.sqlite'), companyId: source.company.id }); handles.push(nextSource);
    const nextJob = nextSource.createIntake({ title: 'Uncertain transfer', client: { name: 'Retained customer' } }, { actor: 'fixture' });
    fs.writeFileSync(path.join(nextUploads, 'proof.jpg'), bytes);
    nextSource.addDocument(nextJob.id, { type: 'field_photo', title: 'Retained photo', filename: 'proof.jpg', mimeType: 'image/jpeg', size: bytes.length, storageRef: 'uploads/proof.jpg' }, { actor: 'fixture' });
    const sourceKey = generateAuthorityKey(), destinationKey = generateAuthorityKey();
    prepareSource(nextSource.db, { key: sourceKey, target: targetDescription({ key: destinationKey, origin: 'https://uncertain.example.test' }),
      company: nextSource.company, actor: 'fixture', reason: 'Uncertain commit fixture' });
    const prepared = createHandoverPackage(nextSource.db, { key: sourceKey, dataDir: nextDir, uploadDir: nextUploads, signingKey, ledgerFilename: 'ledger.sqlite' });
    const countBefore = objects.size, originalQuery = Client.prototype.query;
    let lostAcknowledgement = false;
    Client.prototype.query = async function (...args) {
      const response = await originalQuery.apply(this, args);
      if (args[0] === 'COMMIT' && !lostAcknowledgement) { lostAcknowledgement = true; throw new Error('Fixture connection lost after COMMIT'); }
      return response;
    };
    try {
      await assert.rejects(migrateLocalBackupToHosted({ backupDir: prepared.directory, databaseUrl: nextUrl.toString(), companyId: nextSource.company.id,
        storage, signingKey, handover: { permit: prepared.permit, key: destinationKey } }), { code: 'migration_commit_unknown' });
    } finally { Client.prototype.query = originalQuery; }
    assert.equal(lostAcknowledgement, true);
    assert.equal(objects.size, countBefore + 1, 'An uncertain commit cannot delete evidence that the database may already reference.');
    const uncertainTarget = new ContractorOperatingLedger({ databaseUrl: nextUrl.toString(), authorityMaintenance: true }); handles.push(uncertainTarget);
    assert.equal(readAuthority(uncertainTarget.db).status, 'staged');
    assert.equal(uncertainTarget.getJobRow(nextJob.id).title, 'Uncertain transfer');
    assert.throws(() => activateTarget(uncertainTarget.db, { key: destinationKey, release: {}, actor: 'fixture', reason: 'Forbidden unverified activation' }), { code: 'authority_target_unverified' });
    assert.equal(abortSource(nextSource.db, { key: sourceKey, actor: 'fixture', reason: 'Unreleased source remains authoritative' }).status, 'active');
    assert.throws(() => retireSource(nextSource.db, { key: sourceKey, receipt: {}, actor: 'fixture', reason: 'Old transfer cannot be released' }), { code: 'authority_source_not_frozen' });
  });
  t.diagnostic(`TLS ${admin.connection.stream.getProtocol()}, certificate authorized; object storage is a local test double.`);
});
