const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { verifyBundleBudget } = require('./verify-bundle-budget');

const root = path.resolve(__dirname, '..');
const releaseRoot = path.join(root, 'release');
const defaultTarget = path.join(releaseRoot, 'ContractorAI-windows-x64');
const target = resolvePackageTarget();

function resolvePackageTarget(directory = process.env.CONTRACTOR_AI_WINDOWS_PACKAGE_DIR || defaultTarget) {
  const resolved = path.resolve(root, directory);
  if (path.dirname(resolved) !== path.resolve(releaseRoot)) {
    throw new Error('Windows packages must be direct child directories of the workspace release directory.');
  }
  for (const candidate of [releaseRoot, resolved]) {
    if (fs.lstatSync(candidate, { throwIfNoEntry: false })?.isSymbolicLink()) {
      throw new Error('Refusing to build or verify a Windows package through a symbolic link or junction.');
    }
  }
  return resolved;
}
const runtimeFiles = [
  'image-processor.js',
  'backup-manifest.js',
  'company-runtime.js',
  'company-authority.js',
  'company-handover.js',
  'backup-evidence.js',
  'identity-registry.js',
  'identity-runtime.js',
  'identity-server.js',
  'identity-oidc-adapter.js',
  'identity-recovery.js',
  'docs/IDENTITY_AND_MEMBERSHIP.md',
  'docs/IDENTITY_RECOVERY.md',
  'docs/TOTAL_SOLUTION_DELIVERY.md',
  'docs/COMPANY_ENVIRONMENTS.md',
  'docs/COMPANY_HANDOVER.md',
  'docs/EU_HOSTING.md',
  'docs/adr/0001-separate-identity-registry.md',
  'docs/adr/0002-registry-recovery-does-not-restore-access.md',
  'docs/adr/0003-company-authority-handover.md',
  'bounded-json.js',
  'contractor-framework-catalog.json',
  'contractor-review.js',
  'work-context.js',
  'work-delivery.js',
  'work-balance.js',
  'client-date-commitments.js',
  'operational-recovery.js',
  'variation-implementation.js',
  'asset-history.js',
  'inspection-coverage.js',
  'client-delivery.js',
  'client-completion-review.js',
  'contractual-closeout.js',
  'conversation-analysis-queue.js',
  'field-safety-projection.js',
  'field-task-scope.js',
  'jha-safety-definition.js',
  'task-jha-applicability.js',
  'resource-planner.js',
  'resource-planner-worker.js',
  'shared-material-stock.js',
  'supplier-performance.js',
  'submittal-attachment-manifest.js',
  'work-board-company-scope.js',
  'worker-availability-recurrence.js',
  'docs/INSTALLED_ASSET_HISTORY.md',
  'docs/INSPECTION_COVERAGE.md',
  'docs/CLIENT_DELIVERIES.md',
  'docs/WORK_BALANCE.md',
  'docs/SHARED_WORK_MODEL.md',
  'docs/WORK_DELIVERIES.md',
  'field-work-pack.js',
  'client-conversation.js',
  'conversation-routes.js',
  'work-board.js',
  'work-board-routes.js',
  'conversation-analysis.js',
  'whatsapp-channel.js',
  'csv-safety.js',
  'evidence-storage.js',
  'framework-catalog.js',
  'hai-connector.js',
  'multipart-parser.js',
  'operating-ledger.js',
  'authorization-header.js',
  'trusted-proxy.js',
  'email-validation.js',
  'package.json',
  'package-lock.json',
  'postgres-sync-database.js',
  'postgres-sync-worker.js',
  'runtime-lock.js',
  'server.js',
  'standalone-export-hai.js',
  'standalone-launcher.js',
  'standalone-runtime.js',
  'weather-service.js',
  'scripts/export-hai-feed.js',
  'scripts/migrate-local-backup-to-hosted.js',
  'scripts/restore-local-backup.js',
  'scripts/node-compatibility.js',
  'scripts/runtime-healthcheck.js',
  'scripts/identity-maintenance.js',
  'scripts/company-handover.js'
];

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status}.`);
}

function assertBuildHost() {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('The standalone package must be built on Windows x64.');
  const major = Number(process.versions.node.split('.')[0]);
  if (major !== 26) throw new Error('The standalone package must be built with Node.js 26.x.');
}

function copyRuntimeFile(relative) {
  const source = path.join(root, relative);
  const destination = path.join(target, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function writeLaunchers() {
  const launchers = {
    'ContractorAI.cmd': '@echo off\r\ncd /d "%~dp0"\r\nruntime\\node.exe standalone-launcher.js\r\nif errorlevel 1 pause\r\n',
    'ContractorAI-Export-HAI.cmd': '@echo off\r\ncd /d "%~dp0"\r\nruntime\\node.exe standalone-export-hai.js\r\nif errorlevel 1 pause\r\n'
  };
  for (const [name, contents] of Object.entries(launchers)) fs.writeFileSync(path.join(target, name), contents, 'ascii');
}

function isReusableRuntimeLockError(error, platform = process.platform) {
  return platform === 'win32' && ['EBUSY', 'EPERM'].includes(error?.code);
}

function assertPackageDataAbsent(directory) {
  if (!fs.existsSync(directory)) return;
  const retained = fs.readdirSync(directory).filter(name => ['data', 'uploads', 'backups', 'runtime.json', 'server-state.json', 'identity-companies.json'].includes(name.toLowerCase())
    || name.toLowerCase().startsWith('.env') || /\.(sqlite3?|db)(?:-(?:shm|wal))?$/i.test(name)
    || /\.authority(?:-key)?\.json(?:\..*\.pending)?$/i.test(name));
  if (retained.length) throw new Error(`Refusing to rebuild a package containing operator data or private configuration: ${retained.join(', ')}. Preserve it outside the generated release directory first.`);
}

function prepareTarget(resolvedTarget) {
  assertPackageDataAbsent(resolvedTarget);
  try {
    fs.rmSync(resolvedTarget, { recursive: true, force: true });
    return false;
  } catch (error) {
    const bundledNode = path.join(resolvedTarget, 'runtime', 'node.exe');
    if (!isReusableRuntimeLockError(error) || !fs.existsSync(bundledNode)) throw error;
    const version = spawnSync(bundledNode, ['--version'], { encoding: 'utf8', windowsHide: true });
    if (version.status !== 0 || version.stdout.trim() !== process.version) {
      throw new Error(`Locked packaged runtime cannot be reused; expected ${process.version}.`, { cause: error });
    }
    for (const entry of fs.readdirSync(resolvedTarget, { withFileTypes: true })) {
      const entryPath = path.join(resolvedTarget, entry.name);
      if (entry.name !== 'runtime') fs.rmSync(entryPath, { recursive: true, force: true });
    }
    for (const entry of fs.readdirSync(path.join(resolvedTarget, 'runtime'), { withFileTypes: true })) {
      if (entry.name.toLowerCase() !== 'node.exe') {
        fs.rmSync(path.join(resolvedTarget, 'runtime', entry.name), { recursive: true, force: true });
      }
    }
    return true;
  }
}

function copyProductionDependencies() {
  const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  const packageEntries = Object.entries(lock.packages || {})
    .filter(([relative, metadata]) => relative.startsWith('node_modules/') && metadata.dev !== true)
    .sort(([left], [right]) => left.split('/').length - right.split('/').length || left.localeCompare(right));
  let copied = 0;
  for (const [relative, metadata] of packageEntries) {
    const source = path.join(root, relative);
    if (!fs.existsSync(source)) {
      if (metadata.optional) continue;
      throw new Error(`Required production dependency is missing from the verified root install: ${relative}`);
    }
    const destination = path.join(target, relative);
    fs.mkdirSync(path.dirname(destination), { recursive: true });
    fs.cpSync(source, destination, { recursive: true, dereference: true });
    copied += 1;
  }
  for (const dependency of Object.keys(require(path.join(root, 'package.json')).dependencies || {})) {
    if (!fs.existsSync(path.join(target, 'node_modules', ...dependency.split('/')))) {
      throw new Error(`Packaged production dependency is missing: ${dependency}`);
    }
  }
  return copied;
}

function removeStagedWebBuild(directory) {
  const resolved = resolvePackageTarget(directory);
  if (!path.basename(resolved).startsWith('.contractor-web-build-')) {
    throw new Error('Refusing to remove an unexpected web build staging directory.');
  }
  assertPackageDataAbsent(resolved);
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

function withStagedWebBuild(build) {
  resolvePackageTarget(path.join(releaseRoot, '.contractor-web-build-stage'));
  fs.mkdirSync(releaseRoot, { recursive: true });
  const stagingDirectory = fs.mkdtempSync(path.join(releaseRoot, '.contractor-web-build-'));
  try {
    return build(stagingDirectory);
  } finally {
    removeStagedWebBuild(stagingDirectory);
  }
}

function withVerifiedWebBuild(distDirectory, install) {
  const report = verifyBundleBudget({ distDirectory });
  return install(report);
}

function buildWindowsStandalone() {
  assertBuildHost();
  const resolvedTarget = resolvePackageTarget(target);
  assertPackageDataAbsent(resolvedTarget);
  withStagedWebBuild(stagingDirectory => {
    const stagedDist = path.join(stagingDirectory, 'dist');
    run(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--outDir', stagedDist]);
    withVerifiedWebBuild(stagedDist, bundleBudget => {
      resolvePackageTarget(resolvedTarget);
      const reusedLockedRuntime = prepareTarget(resolvedTarget);
      fs.mkdirSync(path.join(target, 'runtime'), { recursive: true });
      fs.cpSync(stagedDist, path.join(target, 'dist'), { recursive: true });
      for (const file of runtimeFiles) copyRuntimeFile(file);
      if (!reusedLockedRuntime) fs.copyFileSync(process.execPath, path.join(target, 'runtime', 'node.exe'));
      writeLaunchers();
      const productionDependencyCount = copyProductionDependencies();
      fs.writeFileSync(path.join(target, 'BUNDLE_BUDGET.json'), `${JSON.stringify(bundleBudget, null, 2)}\n`);
      fs.writeFileSync(path.join(target, 'BUILD.json'), `${JSON.stringify({
        format: 'contractor-ai-windows-package/v1',
        architecture: process.arch,
        node: process.versions.node,
        version: require(path.join(root, 'package.json')).version,
        productionDependencyCount,
        bundleBudget: { valid: true, assetCount: bundleBudget.assetCount, measurements: bundleBudget.measurements },
        builtAt: new Date().toISOString()
      }, null, 2)}\n`);
    });
  });
  process.stdout.write(`${JSON.stringify({ success: true, target })}\n`);
  return target;
}

if (require.main === module) {
  try { buildWindowsStandalone(); } catch (error) {
    process.stderr.write(`Windows standalone build failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { assertBuildHost, assertPackageDataAbsent, buildWindowsStandalone, copyProductionDependencies, isReusableRuntimeLockError, prepareTarget, removeStagedWebBuild, resolvePackageTarget, runtimeFiles, withStagedWebBuild, withVerifiedWebBuild };
