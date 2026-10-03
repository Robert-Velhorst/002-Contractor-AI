const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const assert = require('node:assert/strict');

function writeAsset(directory, name, source = 'export const fixture = 1;') {
  const bytes = Buffer.from(source);
  fs.writeFileSync(path.join(directory, 'assets', name), bytes);
  fs.writeFileSync(path.join(directory, 'assets', `${name}.br`), zlib.brotliCompressSync(bytes, {
    params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 10 }
  }));
  return bytes;
}

function bundleFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-bundle-fixture-'));
  t.after(() => {
    assert.equal(path.dirname(directory), path.resolve(os.tmpdir()));
    assert.ok(path.basename(directory).startsWith('contractor-bundle-fixture-'));
    fs.rmSync(directory, { recursive: true, force: true });
  });
  fs.mkdirSync(path.join(directory, 'assets'));
  const surfaces = ['App', 'IdentityPortal', 'WorkContextControl', 'FieldWorkContext', 'OfflineField',
    'WorkDeliveryControl', 'AssetHistoryControl', 'InspectionCoverageControl', 'ClientDeliveryControl',
    'WorkBalanceControl', 'OperationalRecoveryControl', 'OperationalRecoveryCase', 'OperationalReplacementPlan',
    'OperationalRecoveryActions', 'SupplierRecoveryLog', 'SupplierRecoveryForm', 'ClientAppointmentImpact',
    'ClientAppointmentReview', 'ClientDateCommitmentsControl', 'ClientDateImpactReview', 'cancellable-read',
    'PipelineWorkspace', 'BidPackageWorkspace', 'PortfolioScheduleWorkspace', 'DispatchWorkspace',
    'ClientConversationInbox', 'ConversationPhoto', 'conversation-request', 'OpportunityEditor'];
  for (const surface of surfaces) writeAsset(directory, `${surface}-fixture.js`);
  writeAsset(directory, 'App-fixture.css', 'body { color: black; }');
  writeAsset(directory, 'ClientConversationInbox-fixture.css', '.client-inbox-row { display: flex; }');
  writeAsset(directory, 'ConversationPhoto-fixture.css', '.conversation-photo { max-width: 100%; }');
  return directory;
}

module.exports = { bundleFixture, writeAsset };
