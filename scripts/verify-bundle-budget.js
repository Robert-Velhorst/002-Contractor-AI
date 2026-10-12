const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const budgets = {
  largestJavaScriptBytes: 600_000,
  largestCssBytes: 300_000,
  initialGzipBytes: 250_000,
  initialBrotliBytes: 195_000,
  completeProductGzipBytes: 725_000,
  completeProductBrotliBytes: 620_000,
  offlineFieldGzipBytes: 11_000,
  identityGzipBytes: 10_000,
  fieldWorkContextGzipBytes: 7_000,
  workContextGzipBytes: 6_000,
  workDeliveryGzipBytes: 4_500,
  assetHistoryGzipBytes: 4_500,
  inspectionCoverageGzipBytes: 4_500,
  clientDeliveryGzipBytes: 8_500,
  workBalanceGzipBytes: 5_000,
  // Task-linked recovery closure now selects auditable worker-resumption evidence.
  operationalRecoveryGzipBytes: 4_100,
  operationalRecoveryCaseGzipBytes: 3_000,
  operationalReplacementPlanGzipBytes: 1_600,
  operationalRecoveryActionsGzipBytes: 900,
  supplierRecoveryLogGzipBytes: 1_850,
  supplierRecoveryFormGzipBytes: 1_800,
  // Evidence-bound customer-message selection and retained source display.
  clientAppointmentImpactGzipBytes: 2_100,
  clientAppointmentReviewGzipBytes: 2_100,
  clientDateCommitmentsGzipBytes: 2_700,
  clientDateImpactReviewGzipBytes: 2_200
};

const surfaces = {
  identityGzipBytes: /^(IdentityPortal|Identity-|CompanyMembershipControl)/,
  workContextGzipBytes: /^WorkContextControl/,
  fieldWorkContextGzipBytes: /^FieldWorkContext/,
  offlineFieldGzipBytes: /^OfflineField/,
  workDeliveryGzipBytes: /^WorkDeliveryControl/,
  assetHistoryGzipBytes: /^AssetHistoryControl/,
  inspectionCoverageGzipBytes: /^(InspectionCoverageControl|inspection-coverage-labels)/,
  clientDeliveryGzipBytes: /^(ClientDelivery|client-delivery-labels)/,
  workBalanceGzipBytes: /^WorkBalanceControl/,
  operationalRecoveryGzipBytes: /^OperationalRecoveryControl/,
  operationalRecoveryCaseGzipBytes: /^OperationalRecoveryCase/,
  operationalReplacementPlanGzipBytes: /^OperationalReplacementPlan/,
  operationalRecoveryActionsGzipBytes: /^OperationalRecoveryActions/,
  supplierRecoveryLogGzipBytes: /^SupplierRecoveryLog/,
  supplierRecoveryFormGzipBytes: /^SupplierRecoveryForm/,
  clientAppointmentImpactGzipBytes: /^ClientAppointmentImpact/,
  clientAppointmentReviewGzipBytes: /^ClientAppointmentReview/,
  clientDateCommitmentsGzipBytes: /^ClientDateCommitmentsControl/,
  clientDateImpactReviewGzipBytes: /^ClientDateImpactReview/
};

const sharedSurfaceDependencies = Object.fromEntries([
  'workContextGzipBytes', 'workDeliveryGzipBytes', 'assetHistoryGzipBytes',
  'inspectionCoverageGzipBytes', 'workBalanceGzipBytes', 'operationalRecoveryGzipBytes'
].map(name => [name, /^cancellable-read-/]));
sharedSurfaceDependencies.clientDeliveryGzipBytes = /^(cancellable-read-|ConversationPhoto-|conversation-request-)/;

const requiredEntryScreens = ['PipelineWorkspace', 'BidPackageWorkspace', 'PortfolioScheduleWorkspace', 'DispatchWorkspace', 'ClientConversationInbox', 'OpportunityEditor'];

function inspectBundleBudget({ distDirectory = path.join(root, 'dist') } = {}) {
  const resolvedDistDirectory = path.resolve(distDirectory);
  const assetsDirectory = path.join(resolvedDistDirectory, 'assets');
  if (!fs.existsSync(assetsDirectory)) throw new Error('Built assets are missing. Run npm run build first.');
  const compressionFailures = [];
  const assets = fs.readdirSync(assetsDirectory)
    .filter(name => /\.(?:js|css)$/.test(name))
    .sort()
    .map(name => {
      const bytes = fs.readFileSync(path.join(assetsDirectory, name));
      const brotliPath = path.join(assetsDirectory, `${name}.br`);
      const brotli = fs.existsSync(brotliPath) ? fs.readFileSync(brotliPath) : null;
      if (!brotli) compressionFailures.push(`Precompressed Brotli asset is missing: ${name}.`);
      else {
        try {
          if (!zlib.brotliDecompressSync(brotli, { maxOutputLength: bytes.length + 1 }).equals(bytes)) {
            compressionFailures.push(`Precompressed Brotli asset does not match its source: ${name}.`);
          }
        } catch { compressionFailures.push(`Precompressed Brotli asset cannot be verified: ${name}.`); }
      }
      return { name, sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length, gzipBytes: zlib.gzipSync(bytes, { level: 9 }).length,
        brotliBytes: brotli?.length ?? 0, brotliSha256: brotli ? createHash('sha256').update(brotli).digest('hex') : null };
    });
  const javascript = assets.filter(asset => asset.name.endsWith('.js'));
  const styles = assets.filter(asset => asset.name.endsWith('.css'));
  const measurements = { largestJavaScriptBytes: Math.max(0, ...javascript.map(asset => asset.bytes)),
    largestCssBytes: Math.max(0, ...styles.map(asset => asset.bytes)),
    totalGzipBytes: assets.reduce((sum, asset) => sum + asset.gzipBytes, 0),
    totalBrotliBytes: assets.reduce((sum, asset) => sum + asset.brotliBytes, 0) };
  const manifestPath = path.join(resolvedDistDirectory, '.vite', 'manifest.json');
  const manifestFailures = [];
  const assetByName = new Map(assets.map(asset => [asset.name, asset]));
  const routeNames = { contractor: '_App-', worker: 'OfflineField.jsx', workBoard: 'WorkBoard.jsx', client: 'ClientPortal.jsx' };
  const routeAssets = {};
  let manifest;
  if (!fs.existsSync(manifestPath)) {
    manifestFailures.push('Vite build manifest is missing.');
  } else {
    try { manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')); }
    catch { manifestFailures.push('Vite build manifest is invalid JSON.'); }
  }
  if (manifest) {
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      manifestFailures.push('Vite build manifest must be an object.');
    } else {
      const entry = manifest['index.html'] || Object.values(manifest)
        .find(item => item?.isEntry === true && item?.src === 'index.html');
      if (!entry || typeof entry !== 'object') {
        manifestFailures.push('Vite build manifest has no index.html entry.');
      } else {
        const entryKey = manifest['index.html'] ? 'index.html' : Object.keys(manifest)
          .find(key => manifest[key] === entry);
        const contractorKey = Object.keys(manifest).find(key => key.startsWith(routeNames.contractor))
          || Object.keys(manifest).find(key => path.basename(manifest[key]?.file || '').startsWith('App-'));
        const routeKeys = {
          contractor: contractorKey,
          worker: Object.keys(manifest).find(key => manifest[key]?.src === routeNames.worker),
          workBoard: Object.keys(manifest).find(key => manifest[key]?.src === routeNames.workBoard),
          client: Object.keys(manifest).find(key => manifest[key]?.src === routeNames.client)
        };
        const collect = (route, routeKey) => {
          if (!routeKey) {
            manifestFailures.push(`Vite build manifest has no ${route} route entry.`);
            return [];
          }
          const names = new Set();
          const visited = new Set();
          const visit = key => {
            if (visited.has(key)) return;
            visited.add(key);
            const chunk = manifest[key];
            if (!chunk || typeof chunk !== 'object' || typeof chunk.file !== 'string') {
              manifestFailures.push(`Vite build manifest contains an invalid static import: ${key}.`);
              return;
            }
            const files = [chunk.file, ...(Array.isArray(chunk.css) ? chunk.css : [])];
            for (const file of files) {
              if (!/\.(?:js|css)$/.test(file)) continue;
              const normalized = file.replaceAll('\\', '/');
              const resolvedFile = path.resolve(resolvedDistDirectory, normalized);
              const relative = path.relative(assetsDirectory, resolvedFile);
              if (!normalized.startsWith('assets/') || relative.startsWith('..') || path.isAbsolute(relative)) {
                manifestFailures.push(`Vite manifest asset is outside the asset directory: ${file}.`);
                continue;
              }
              const name = path.basename(resolvedFile);
              if (!assetByName.has(name)) {
                manifestFailures.push(`Vite manifest asset is missing from the build: ${file}.`);
                continue;
              }
              names.add(name);
            }
            if (!Array.isArray(chunk.imports ?? [])) {
              manifestFailures.push(`Vite build manifest imports are invalid: ${key}.`);
              return;
            }
            for (const imported of chunk.imports || []) {
              if (typeof imported !== 'string') manifestFailures.push(`Vite build manifest import is invalid: ${key}.`);
              else visit(imported);
            }
          };
          visit(entryKey);
          visit(routeKey);
          return [...names].map(name => assetByName.get(name)).sort((a, b) => a.name.localeCompare(b.name));
        };
        if (entryKey) {
          for (const [route, routeKey] of Object.entries(routeKeys)) {
            routeAssets[route] = collect(route, routeKey);
          }
        }
      }
    }
  }
  const initialAssets = routeAssets.contractor || [];
  measurements.initialGzipBytes = initialAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0);
  measurements.initialBrotliBytes = initialAssets.reduce((sum, asset) => sum + asset.brotliBytes, 0);
  measurements.workerRouteGzipBytes = (routeAssets.worker || []).reduce((sum, asset) => sum + asset.gzipBytes, 0);
  measurements.workerRouteBrotliBytes = (routeAssets.worker || []).reduce((sum, asset) => sum + asset.brotliBytes, 0);
  measurements.workBoardRouteGzipBytes = (routeAssets.workBoard || []).reduce((sum, asset) => sum + asset.gzipBytes, 0);
  measurements.workBoardRouteBrotliBytes = (routeAssets.workBoard || []).reduce((sum, asset) => sum + asset.brotliBytes, 0);
  measurements.clientRouteGzipBytes = (routeAssets.client || []).reduce((sum, asset) => sum + asset.gzipBytes, 0);
  measurements.clientRouteBrotliBytes = (routeAssets.client || []).reduce((sum, asset) => sum + asset.brotliBytes, 0);
  measurements.completeProductGzipBytes = measurements.totalGzipBytes;
  measurements.completeProductBrotliBytes = measurements.totalBrotliBytes;
  const missingAssets = [];
  if (!javascript.some(asset => /^App-/.test(asset.name))) missingAssets.push('App');
  for (const name of requiredEntryScreens) {
    if (!javascript.some(asset => asset.name.startsWith(`${name}-`))) missingAssets.push(name);
  }
  if (!styles.length) missingAssets.push('CSS');
  for (const [name, matcher] of Object.entries(surfaces)) {
    const matched = assets.filter(asset => matcher.test(asset.name));
    const dependencies = sharedSurfaceDependencies[name];
    const downloads = assets.filter(asset => matcher.test(asset.name) || dependencies?.test(asset.name));
    measurements[name] = downloads.reduce((sum, asset) => sum + asset.gzipBytes, 0);
    if (!matched.some(asset => asset.name.endsWith('.js'))) missingAssets.push(name);
  }
  const failures = Object.entries(budgets)
    .filter(([key, limit]) => measurements[key] > limit)
    .map(([key, limit]) => `${key} is ${measurements[key]} bytes; budget is ${limit}.`);
  failures.push(...missingAssets.map(name => `Required built surface is missing: ${name}.`));
  failures.push(...compressionFailures);
  failures.push(...manifestFailures);
  return { valid: failures.length === 0, budgets, measurements, failures, missingAssets,
    assetCount: assets.length, initialAssets, routeAssets, assets };
}

function verifyBundleBudget(options) {
  const report = inspectBundleBudget(options);
  if (!report.valid) throw Object.assign(new Error(report.failures.join(' ')), { code: 'BUNDLE_BUDGET_FAILED', report });
  return report;
}

function bundleArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = { '--dist': 'distDirectory', '--report': 'reportFile' }[args[index]];
    const value = args[index + 1];
    if (!key || !value || value.startsWith('--') || Object.hasOwn(options, key)) throw new Error('Usage: verify-bundle-budget.js [--dist directory] [--report file]');
    options[key] = path.resolve(value);
  }
  return options;
}

if (require.main === module) {
  try {
    const { reportFile, ...options } = bundleArguments(process.argv.slice(2));
    const report = inspectBundleBudget(options);
    if (reportFile) {
      fs.mkdirSync(path.dirname(reportFile), { recursive: true });
      fs.writeFileSync(reportFile, `${JSON.stringify(report, null, 2)}\n`);
    }
    if (!report.valid) throw new Error(report.failures.join(' '));
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } catch (error) {
    process.stderr.write(`Bundle budget failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = { budgets, bundleArguments, inspectBundleBudget, surfaces, verifyBundleBudget };
