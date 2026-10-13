// Serialized into each packaged runtime so imports resolve against the artifact, not the checkout.
async function handoverSmoke() {
  const assert = require('node:assert/strict');
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const { ContractorOperatingLedger } = require('./operating-ledger');
  const { readPrivateKeyFile, readAuthorityMarker } = require('./company-authority');
  const { main } = require('./scripts/company-handover');
  const { WorkContext } = require('./work-context');
  const { WorkDelivery } = require('./work-delivery');
  const { AssetHistory } = require('./asset-history');
  const { InspectionCoverage } = require('./inspection-coverage');
  const { ClientDelivery, verifyClientDelivery } = require('./client-delivery');
  const { WorkBalance, verifyWorkBalance } = require('./work-balance');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-packaged-handover-'));
  try {
    const dbFile = path.join(root, 'ledger.sqlite'), sourceKey = path.join(root, 'source.authority-key.json');
    const targetKey = path.join(root, 'target.authority-key.json'), targetFile = path.join(root, 'target.json');
    const ledger = new ContractorOperatingLedger({ dbFile, companyId: 'packaged-handover-fixture' });
    let company, job, workContext, workDeliveries, installedAssets, inspectionCoverage, clientDeliveries, workBalance;
    try {
      company = ledger.company;
      job = ledger.createIntake({ title: 'Retained fixture work', client: { name: 'Synthetic client' }, tasks: [{ title: 'Retained task' }], assignAutomatically: false }, { actor: 'package_fixture' });
      const context = new WorkContext(ledger);
      const place = context.command(job.id, { entryKey: 'packaged-place', sourceHash: context.read(job.id).sourceHash, action: 'save_place', record: { type: 'site', name: 'Package test site' } }, 'package_fixture').record;
      const asset = context.command(job.id, { entryKey: 'packaged-asset', sourceHash: context.read(job.id).sourceHash, action: 'save_place', record: { type: 'asset', name: 'Package installation', parentId: place.id } }, 'package_fixture').record;
      const workPackage = context.command(job.id, { entryKey: 'packaged-package', sourceHash: context.read(job.id).sourceHash, action: 'save_package', record: { code: 'PKG-1', title: 'Package work', outcome: 'Retained result', placeId: place.id, taskIds: [job.tasks[0].id], quantityIds: [] } }, 'package_fixture').record;
      const production = ledger.requestProductionBaseline(job.id, { lines: [{ lineKey: 'doors', description: 'Fixture units', costCode: 'INSTALL', unit: 'st', plannedQuantity: 2, plannedLaborHours: 6 }] });
      ledger.resolveApproval(production.approval.id, { status: 'approved', resolvedBy: 'package_reviewer' });
      ledger.db.prepare("UPDATE job_tasks SET status = 'completed' WHERE id = ?").run(job.tasks[0].id);
      const delivery = new WorkDelivery(ledger);
      delivery.command(job.id, { entryKey: 'packaged-delivery', sourceHash: delivery.read(job.id).sourceHash, action: 'retain', record: { packageId: workPackage.id, title: 'Completed fixture task', scope: 'Retained execution fixture', taskIds: [job.tasks[0].id], entryIds: [] } }, 'package_fixture');
      workDeliveries = delivery.source(job.id);
      const balance = new WorkBalance(ledger);
      const balanceView = balance.read(job.id);
      const plannedBalance = balance.command(job.id, { action: 'plan', entryKey: 'packaged-work-balance', sourceHash: balanceView.sourceHash,
        record: { scopeConfirmed: true, reference: 'Packaged approved work allocation', reason: 'Verify that the approved allocation survives handover.',
          allocations: [{ lineKey: 'doors', packageId: workPackage.id, plannedQuantity: 2 }] } }, 'package_fixture');
      ledger.resolveApproval(plannedBalance.approvalId, { status: 'approved' }, { actor: 'package_reviewer' });
      workBalance = balance.read(job.id);
      const history = new AssetHistory(ledger);
      history.command(job.id, { action: 'record', entryKey: 'packaged-asset-service', sourceHash: history.read(job.id).sourceHash, record: { assetId: asset.id, kind: 'serviced', performedAt: new Date().toISOString().slice(0, 10), deliveryId: workDeliveries[0].id, summary: 'Retained package fixture service' } }, 'package_fixture');
      installedAssets = history.source(job.id);
      const coverage = new InspectionCoverage(ledger);
      const planned = coverage.command(job.id, { action: 'plan', entryKey: 'packaged-control-plan', sourceHash: coverage.read(job.id).sourceHash,
        record: { deliveryId: workDeliveries[0].id, scopeReference: 'Retained package test only', scopeConfirmed: true, documentIds: [], reason: 'Package acceptance fixture',
          checks: [{ key: 'visual', title: 'Visual check', criterion: 'Recorded test fixture criterion', fieldInstruction: 'Retain the visual inspection result.', allowNotApplicable: false }] } }, 'package_fixture');
      ledger.resolveApproval(planned.approvalId, { status: 'approved' }, { actor: 'package_reviewer' });
      inspectionCoverage = coverage.read(job.id);
      const access = ledger.createClientPortalAccess(job.id);
      ledger.resolveApproval(access.approval.id, { status: 'approved' }, { actor: 'package_reviewer' });
      const clients = new ClientDelivery(ledger);
      const offered = clients.command(job.id, { action: 'offer', entryKey: 'packaged-client-offer', sourceHash: clients.read(job.id).sourceHash,
        record: { deliveryId: workDeliveries[0].id, accessId: access.id, recipientName: 'Synthetic client', authorityReference: 'Fixture authority reference',
          title: 'Completed fixture task', scope: 'This retained fixture portion only', expiresAt: new Date(Date.now() + 3600000).toISOString(), photoIds: [], scopeConfirmed: true, reason: 'Fixture publication review' } }, 'package_fixture');
      ledger.resolveApproval(offered.approvalId, { status: 'approved' }, { actor: 'package_reviewer' });
      clients.submit(access.id, offered.offerId, { entryKey: 'packaged-client-response', sourceHash: clients.portal(access.id).offers[0].sourceHash,
        outcome: 'accepted', respondent: 'Synthetic client', authorityConfirmed: true, note: 'Fixture completed portion confirmed', photoIds: [] });
      ledger.resolveApproval(clients.read(job.id).offers[0].response.approvalId, { status: 'approved', reason: 'Fixture response and authority reviewed' }, { actor: 'package_reviewer' });
      clientDeliveries = clients.exportRecords();
      inspectionCoverage = coverage.read(job.id);
      installedAssets = history.source(job.id);
      workDeliveries = delivery.source(job.id);
      workContext = context.read(job.id);
    }
    finally { ledger.close(); }
    for (const output of [sourceKey, targetKey]) await main(['keygen', '--output', output, '--confirm', 'CREATE_ENVIRONMENT_KEY'], {});
    await main(['describe-target', '--origin', 'https://fixture.example.test', '--output', targetFile], { CONTRACTOR_AI_AUTHORITY_KEY_FILE: targetKey });
    const env = { CONTRACTOR_AI_DATA_DIR: root, LEDGER_DB_FILE: dbFile, CONTRACTOR_AI_RUNTIME_MODE: 'local',
      CONTRACTOR_AI_AUTHORITY_KEY_FILE: sourceKey, CONTRACTOR_AI_BACKUP_SIGNING_KEY: 'synthetic-packaged-handover-backup-key-32-characters' };
    const common = ['--company-id', company.id, '--ledger-id', company.ledgerId, '--actor', 'package_fixture', '--reference', 'Isolated package acceptance'];
    await main(['freeze', ...common, '--target-file', targetFile, '--confirm', 'FREEZE_LOCAL_SOURCE'], env);
    const packed = await main(['package', ...common, '--output', path.join(root, 'permit.json'), '--confirm', 'PACKAGE_FROZEN_SOURCE'], env);
    assert.equal(packed.verified, true);
    assert.equal(packed.encrypted, false);
    const key = readPrivateKeyFile(sourceKey);
    assert.throws(() => new ContractorOperatingLedger({ dbFile, authorityKey: key }), { code: 'company_authority_blocked' });
    await main(['abort', ...common, '--confirm', 'ABORT_UNRELEASED_HANDOVER'], env);
    const reopened = new ContractorOperatingLedger({ dbFile, authorityKey: key });
    try { assert.equal(reopened.getJobRow(job.id).title, 'Retained fixture work'); assert.deepEqual(new WorkContext(reopened).read(job.id), workContext); assert.deepEqual(new WorkDelivery(reopened).source(job.id), workDeliveries); assert.deepEqual(new AssetHistory(reopened).source(job.id), installedAssets); assert.deepEqual(new InspectionCoverage(reopened).read(job.id), inspectionCoverage); assert.deepEqual(new ClientDelivery(reopened).exportRecords(), clientDeliveries); assert.equal(verifyClientDelivery(reopened.db), true); assert.deepEqual(new WorkBalance(reopened).read(job.id), workBalance); assert.equal(verifyWorkBalance(reopened.db), true); }
    finally { reopened.close(); }
    const status = await main(['status'], env);
    assert.equal(status.authority.status, 'active');
    assert.equal(status.history.valid, true);
    assert.equal(readAuthorityMarker(dbFile).minimumGeneration, 2);
    process.stdout.write(`${JSON.stringify({ valid: true, packagedWorkContext: true, packagedWorkDeliveries: true, packagedWorkBalance: true, packagedInstalledAssets: true, packagedInspectionCoverage: true, packagedClientDeliveries: true, packagedHandover: { freeze: true, signedPackage: true, startupFencing: true, abort: true, marker: true } })}\n`);
  } finally {
    assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('contractor-packaged-handover-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
}

module.exports = { handoverSmokeCode: `(${handoverSmoke.toString()})().catch(error => { console.error(error); process.exitCode = 1; })` };
