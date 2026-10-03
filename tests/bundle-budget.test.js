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
  assert.equal(report.assetCount, 32);
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

test('release download limits are not increased by the report and packaging guard', () => {
  assert.equal(budgets.largestJavaScriptBytes, 600000);
  assert.equal(budgets.totalGzipBytes, 578500);
  assert.equal(budgets.totalBrotliBytes, 540000);
  assert.equal(budgets.fieldWorkContextGzipBytes, 7000);
  assert.equal(budgets.clientDeliveryGzipBytes, 8500);
  assert.equal(budgets.operationalRecoveryGzipBytes, 4100);
  assert.equal(budgets.operationalRecoveryCaseGzipBytes, 3000);
  assert.equal(budgets.operationalReplacementPlanGzipBytes, 1600);
  assert.equal(budgets.operationalRecoveryActionsGzipBytes, 900);
});
