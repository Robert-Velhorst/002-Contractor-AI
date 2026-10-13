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
    'ClientConversationInbox', 'ConversationPhoto', 'conversation-request', 'ClientDeliveryResponses', 'OpportunityEditor', 'icons',
    'WorkBoard', 'OfflineField', 'ClientPortal'];
  for (const surface of surfaces) writeAsset(directory, `${surface}-fixture.js`);
  writeAsset(directory, 'App-fixture.css', 'body { color: black; }');
  writeAsset(directory, 'index-fixture.js');
  writeAsset(directory, 'index-fixture.css', 'html { color-scheme: light; }');
  writeAsset(directory, 'PipelineWorkspace-fixture.css', '.pipeline { display: grid; }');
  writeAsset(directory, 'ClientConversationInbox-fixture.css', '.client-inbox-row { display: flex; }');
  writeAsset(directory, 'ConversationPhoto-fixture.css', '.conversation-photo { max-width: 100%; }');
  fs.mkdirSync(path.join(directory, '.vite'));
  fs.writeFileSync(path.join(directory, '.vite', 'manifest.json'), JSON.stringify({
    'index.html': { file: 'assets/index-fixture.js', src: 'index.html', isEntry: true,
      imports: ['icons.jsx'], dynamicImports: ['_App-fixture.js', 'WorkBoard.jsx', 'OfflineField.jsx', 'ClientPortal.jsx', 'PipelineWorkspace.jsx'], css: ['assets/index-fixture.css'] },
    '_App-fixture.js': { file: 'assets/App-fixture.js', imports: ['icons.jsx'], dynamicImports: [], css: ['assets/App-fixture.css'] },
    'WorkBoard.jsx': { file: 'assets/WorkBoard-fixture.js', src: 'WorkBoard.jsx', imports: ['icons.jsx'], dynamicImports: [], css: [] },
    'OfflineField.jsx': { file: 'assets/OfflineField-fixture.js', src: 'OfflineField.jsx', imports: ['icons.jsx'], dynamicImports: [], css: [] },
    'ClientPortal.jsx': { file: 'assets/ClientPortal-fixture.js', src: 'ClientPortal.jsx', imports: ['icons.jsx'], dynamicImports: [], css: [] },
    'icons.jsx': { file: 'assets/icons-fixture.js', imports: [], css: [] },
    'PipelineWorkspace.jsx': { file: 'assets/PipelineWorkspace-fixture.js', imports: [], css: ['assets/PipelineWorkspace-fixture.css'] }
  }, null, 2));
  return directory;
}

module.exports = { bundleFixture, writeAsset };
