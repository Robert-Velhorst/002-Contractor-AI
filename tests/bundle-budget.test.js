const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { budgets, bundleArguments, inspectBundleBudget, verifyBundleBudget } = require('../scripts/verify-bundle-budget');
const { withVerifiedWebBuild } = require('../scripts/build-windows-standalone');
const { verifyPackagedBundle } = require('../scripts/verify-windows-standalone');
const { bundleFixture, writeAsset } = require('./bundle-budget-fixture');

test('bundle report measures the selected build once with verifiable source and Brotli identities', t => {
  const directory = bundleFixture(t);
  const report = verifyBundleBudget({ distDirectory: directory });
  assert.equal(report.valid, true);
  assert.equal(report.assetCount, 38);
  assert.deepEqual(report.failures, []);
  for (const asset of report.assets) {
    const bytes = fs.readFileSync(path.join(directory, 'assets', asset.name));
    assert.equal(asset.bytes, bytes.length);
    assert.equal(asset.gzipBytes, zlib.gzipSync(bytes, { level: 9 }).length);
    assert.equal(asset.brotliBytes, fs.statSync(path.join(directory, 'assets', `${asset.name}.br`)).size);
    assert.match(asset.sha256, /^[a-f0-9]{64}$/);
    assert.match(asset.brotliSha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(report.measurements.totalGzipBytes, report.assets.reduce((sum, asset) => sum + asset.gzipBytes, 0));
  assert.equal(report.measurements.totalBrotliBytes, report.assets.reduce((sum, asset) => sum + asset.brotliBytes, 0));
  assert.deepEqual(report.initialAssets.map(asset => asset.name).sort(),
    ['App-fixture.css', 'App-fixture.js', 'icons-fixture.js', 'index-fixture.css', 'index-fixture.js']);
  assert.ok(!report.initialAssets.some(asset => asset.name.startsWith('PipelineWorkspace-')));
  assert.ok(report.routeAssets.worker.some(asset => asset.name.startsWith('OfflineField-')));
  assert.ok(report.routeAssets.workBoard.some(asset => asset.name.startsWith('WorkBoard-')));
  assert.ok(report.routeAssets.client.some(asset => asset.name.startsWith('ClientPortal-')));
  assert.equal(report.measurements.initialGzipBytes, report.initialAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0));
  assert.equal(report.measurements.initialBrotliBytes, report.initialAssets.reduce((sum, asset) => sum + asset.brotliBytes, 0));
  assert.equal(report.measurements.completeProductGzipBytes, report.measurements.totalGzipBytes);
  assert.equal(report.measurements.completeProductBrotliBytes, report.measurements.totalBrotliBytes);
});

test('bundle gate fails closed when the static entry manifest is absent, malformed or escapes the asset directory', t => {
  const directory = bundleFixture(t), manifest = path.join(directory, '.vite', 'manifest.json');
  fs.unlinkSync(manifest);
  assert.match(inspectBundleBudget({ distDirectory: directory }).failures.join(' '), /manifest is missing/);
  fs.writeFileSync(manifest, '{');
  assert.match(inspectBundleBudget({ distDirectory: directory }).failures.join(' '), /manifest is invalid/);
  fs.writeFileSync(manifest, JSON.stringify({ 'index.html': {
    file: 'assets/index-fixture.js', src: 'index.html', isEntry: true, imports: ['icons.jsx'], dynamicImports: ['_App-outside.js']
  }, '_App-outside.js': { file: '../outside.js', imports: [], css: [] },
  'WorkBoard.jsx': { file: 'assets/WorkBoard-fixture.js', src: 'WorkBoard.jsx', imports: [], css: [] },
  'OfflineField.jsx': { file: 'assets/OfflineField-fixture.js', src: 'OfflineField.jsx', imports: [], css: [] },
  'ClientPortal.jsx': { file: 'assets/ClientPortal-fixture.js', src: 'ClientPortal.jsx', imports: [], css: [] } }));
  assert.match(inspectBundleBudget({ distDirectory: directory }).failures.join(' '), /outside the asset directory/);
});

test('incomplete builds cannot pass by measuring missing product surfaces as zero', t => {
  const directory = bundleFixture(t);
  fs.unlinkSync(path.join(directory, 'assets', 'OperationalRecoveryCase-fixture.js'));
  const report = inspectBundleBudget({ distDirectory: directory });
  assert.equal(report.valid, false);
  assert.ok(report.missingAssets.includes('operationalRecoveryCaseGzipBytes'));
  assert.throws(() => verifyBundleBudget({ distDirectory: directory }), error => error.code === 'BUNDLE_BUDGET_FAILED' && error.report.valid === false);
});

test('separately loaded entry screens remain required release assets', t => {
  const directory = bundleFixture(t);
  for (const name of ['PipelineWorkspace', 'BidPackageWorkspace', 'PortfolioScheduleWorkspace', 'DispatchWorkspace', 'ClientConversationInbox', 'OpportunityEditor']) {
    fs.unlinkSync(path.join(directory, 'assets', `${name}-fixture.js`));
    const report = inspectBundleBudget({ distDirectory: directory });
    assert.equal(report.valid, false);
    assert.ok(report.missingAssets.includes(name));
  }
});

test('shared read code counts for each dependent surface without masking an absent component', t => {
  const directory = bundleFixture(t);
  const report = verifyBundleBudget({ distDirectory: directory });
  const shared = report.assets.find(asset => asset.name === 'cancellable-read-fixture.js').gzipBytes;
  for (const [key, surface] of Object.entries({ workContextGzipBytes: 'WorkContextControl',
    workDeliveryGzipBytes: 'WorkDeliveryControl', assetHistoryGzipBytes: 'AssetHistoryControl',
    inspectionCoverageGzipBytes: 'InspectionCoverageControl',
    workBalanceGzipBytes: 'WorkBalanceControl' })) {
    assert.equal(report.measurements[key], shared + report.assets.find(asset => asset.name === `${surface}-fixture.js`).gzipBytes);
  }
  const recovery = report.assets.find(asset => asset.name === 'OperationalRecoveryControl-fixture.js');
  assert.equal(report.measurements.operationalRecoveryGzipBytes, recovery.gzipBytes + shared);
  const photoDependencies = report.assets.filter(asset => /^(ClientDeliveryControl-|ConversationPhoto-|conversation-request-|cancellable-read-)/.test(asset.name));
  assert.equal(report.measurements.clientDeliveryGzipBytes, photoDependencies.reduce((total, asset) => total + asset.gzipBytes, 0));
  fs.unlinkSync(path.join(directory, 'assets', 'WorkContextControl-fixture.js'));
  const incomplete = inspectBundleBudget({ distDirectory: directory });
  assert.ok(incomplete.missingAssets.includes('workContextGzipBytes'));
  assert.equal(incomplete.measurements.workContextGzipBytes, shared);
  assert.equal(incomplete.valid, false);
});

test('missing, invalid and mismatched Brotli assets block verification', t => {
  const directory = bundleFixture(t), filename = path.join(directory, 'assets', 'App-fixture.js.br');
  fs.unlinkSync(filename);
  assert.match(inspectBundleBudget({ distDirectory: directory }).failures.join(' '), /Brotli asset is missing/);
  fs.writeFileSync(filename, 'invalid brotli');
  assert.match(inspectBundleBudget({ distDirectory: directory }).failures.join(' '), /cannot be verified/);
  fs.writeFileSync(filename, zlib.brotliCompressSync(Buffer.from('different')));
  assert.match(inspectBundleBudget({ distDirectory: directory }).failures.join(' '), /does not match its source/);
  fs.writeFileSync(filename, zlib.brotliCompressSync(Buffer.alloc(1024 * 1024)));
  assert.match(inspectBundleBudget({ distDirectory: directory }).failures.join(' '), /cannot be verified/);
});

test('oversized staged builds never reach package replacement or installation', t => {
  const directory = bundleFixture(t);
  writeAsset(directory, 'App-fixture.js', Buffer.alloc(budgets.largestJavaScriptBytes + 1, 47));
  const protectedFile = path.join(directory, 'previous-package.txt');
  fs.writeFileSync(protectedFile, 'retained previous package');
  let installed = false;
  assert.throws(() => withVerifiedWebBuild(directory, () => {
    installed = true; fs.unlinkSync(protectedFile);
  }), /largestJavaScriptBytes/);
  assert.equal(installed, false);
  assert.equal(fs.readFileSync(protectedFile, 'utf8'), 'retained previous package');
});

test('accepted staged builds pass their exact budget evidence to packaging', t => {
  const directory = bundleFixture(t);
  const report = withVerifiedWebBuild(directory, report => report);
  assert.deepEqual(report, inspectBundleBudget({ distDirectory: directory }));
});

test('package verification rejects absent evidence, changed assets and altered reported limits', t => {
  const directory = bundleFixture(t), report = verifyBundleBudget({ distDirectory: directory });
  fs.mkdirSync(path.join(directory, 'dist'));
  fs.renameSync(path.join(directory, 'assets'), path.join(directory, 'dist', 'assets'));
  fs.renameSync(path.join(directory, '.vite'), path.join(directory, 'dist', '.vite'));
  const build = { bundleBudget: { valid: true, assetCount: report.assetCount, measurements: report.measurements } };
  assert.throws(() => verifyPackagedBundle(directory, {}), /verified bundle-budget evidence/);
  assert.throws(() => verifyPackagedBundle(directory, build), /ENOENT/);
  const evidenceFile = path.join(directory, 'BUNDLE_BUDGET.json');
  fs.writeFileSync(evidenceFile, JSON.stringify(report));
  assert.deepEqual(verifyPackagedBundle(directory, build), report);
  const changedLimits = { ...report, budgets: { ...report.budgets, totalGzipBytes: report.budgets.totalGzipBytes + 1 } };
  fs.writeFileSync(evidenceFile, JSON.stringify(changedLimits));
  assert.throws(() => verifyPackagedBundle(directory, build), /must match their retained bundle evidence/);
  fs.writeFileSync(evidenceFile, JSON.stringify(report));
  writeAsset(path.join(directory, 'dist'), 'App-fixture.js', 'export const fixture = 2;');
  assert.throws(() => verifyPackagedBundle(directory, build), /must match their retained bundle evidence/);
});

test('failed budget CLI writes a structured report while preserving its nonzero exit', t => {
  const directory = bundleFixture(t), reportFile = path.join(directory, 'report', 'budget.json');
  writeAsset(directory, 'App-fixture.js', Buffer.alloc(budgets.largestJavaScriptBytes + 1, 47));
  const result = spawnSync(process.execPath, [path.resolve(__dirname, '../scripts/verify-bundle-budget.js'), '--dist', directory, '--report', reportFile], { encoding: 'utf8' });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Bundle budget failed/);
  const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
  assert.equal(report.valid, false);
  assert.ok(report.failures.some(failure => failure.includes('largestJavaScriptBytes')));
  assert.equal(report.measurements.largestJavaScriptBytes, budgets.largestJavaScriptBytes + 1);
  assert.equal(JSON.stringify(report).includes(directory), false);
});

test('budget CLI accepts only unambiguous known options', () => {
  assert.deepEqual(bundleArguments([]), {});
  assert.deepEqual(bundleArguments(['--dist', 'dist', '--report', 'report.json']), { distDirectory: path.resolve('dist'), reportFile: path.resolve('report.json') });
  for (const args of [['--dist'], ['--dist', '--report'], ['--force', 'yes'], ['--report', 'a', '--report', 'b'], ['unexpected']]) {
    assert.throws(() => bundleArguments(args), /Usage:/);
  }
});

test('initial-route and complete-product budgets retain explicit headroom limits', () => {
  assert.equal(budgets.largestJavaScriptBytes, 600000);
  assert.equal(budgets.initialGzipBytes, 250000);
  assert.equal(budgets.initialBrotliBytes, 195000);
  assert.equal(budgets.completeProductGzipBytes, 725000);
  assert.equal(budgets.completeProductBrotliBytes, 620000);
  assert.equal(budgets.fieldWorkContextGzipBytes, 7000);
  assert.equal(budgets.clientDeliveryGzipBytes, 8500);
  assert.equal(budgets.operationalRecoveryGzipBytes, 4100);
  assert.equal(budgets.operationalRecoveryCaseGzipBytes, 3000);
  assert.equal(budgets.operationalReplacementPlanGzipBytes, 1600);
  assert.equal(budgets.operationalRecoveryActionsGzipBytes, 900);
});
