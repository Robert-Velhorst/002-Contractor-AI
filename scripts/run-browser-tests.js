const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const espree = require('espree');
const { captureBrowserCandidate, verifyBrowserCandidate } = require('./browser-candidate');

const projectRoot = path.resolve(__dirname, '..');
const tempRoot = path.resolve(os.tmpdir());
const viteCli = path.join(path.dirname(require.resolve('vite/package.json')), 'bin', 'vite.js');
const defaultBatchSize = 4;

function reserveFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen({ host: '127.0.0.1', port: 0, exclusive: true }, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(error => {
        if (error) reject(error);
        else if (!port) reject(new Error('Could not allocate a browser test port.'));
        else resolve(port);
      });
    });
  });
}

async function main() {
  // Exercise the same production bundle that Express serves to operators.
  const buildResult = spawnSync(process.execPath, [viteCli, 'build'], {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit'
  });
  if (buildResult.error) throw buildResult.error;
  if (buildResult.status !== 0) process.exit(Number.isInteger(buildResult.status) ? buildResult.status : 1);

  const { continueOnFailure, requestedTests } = browserRunOptions(process.argv.slice(2));
  const batches = requestedTests.length
    ? [requestedTests]
    : chunkBrowserTests(discoverBrowserCases(), configuredBatchSize());
  const outputRoot = fs.mkdtempSync(path.join(tempRoot, 'contractor-ai-browser-results-'));
  const candidate = captureBrowserCandidate(projectRoot);
  fs.writeFileSync(path.join(outputRoot, 'candidate.json'), JSON.stringify(candidate));
  console.log(JSON.stringify({ browserCandidate: candidate.sha256, outputRoot,
    files: { build: candidate.build.length, runtime: candidate.runtime.length,
      frontend: candidate.frontend.length, browser: candidate.browser.length } }));
  const summary = await executeBrowserBatches(batches, {
    continueOnFailure, outputRoot, runBatch: runBrowserBatch,
    verifyCandidate: () => verifyBrowserCandidate(candidate),
    onBatch: (index, selectors) => console.log(`Browser test batch ${index + 1}/${batches.length} (${selectors.length} selectors)`)
  });
  if (!summary.valid) process.exitCode = summary.failedBatches[0].status;
  fs.writeFileSync(path.join(outputRoot, 'summary.json'), JSON.stringify(summary));
  console.log(JSON.stringify(summary));
}

async function executeBrowserBatches(batches, { continueOnFailure = false, outputRoot, runBatch,
  onBatch = () => {}, verifyCandidate = () => {} }) {
  if (!batches.length || batches.some(batch => !Array.isArray(batch) || !batch.length)) {
    throw new Error('Browser verification requires a non-empty set of non-empty batches.');
  }
  const failedBatches = [];
  let executedBatches = 0;
  for (let index = 0; index < batches.length; index += 1) {
    onBatch(index, batches[index]);
    await verifyCandidate();
    const outputDirectory = path.join(outputRoot, `batch-${String(index + 1).padStart(3, '0')}`);
    const status = await runBatch(batches[index], outputDirectory);
    executedBatches += 1;
    await verifyCandidate();
    if (status !== 0) {
      failedBatches.push({ batch: index + 1, status, selectors: batches[index], outputDirectory });
      if (!continueOnFailure) break;
    }
  }
  return { valid: failedBatches.length === 0, plannedBatches: batches.length, executedBatches,
    continueOnFailure, failedBatches, outputRoot };
}

function browserRunOptions(args) {
  return { continueOnFailure: args.includes('--continue-on-failure'),
    requestedTests: args.filter(value => value !== '--continue-on-failure') };
}

function configuredBatchSize() {
  const configured = Number(process.env.CONTRACTOR_AI_BROWSER_BATCH_SIZE || defaultBatchSize);
  if (!Number.isInteger(configured) || configured < 1 || configured > 25) {
    throw new Error('CONTRACTOR_AI_BROWSER_BATCH_SIZE must be an integer from 1 through 25.');
  }
  return configured;
}

function visitAst(node, visitor) {
  if (!node || typeof node !== 'object') return;
  visitor(node);
  for (const [key, value] of Object.entries(node)) {
    if (['loc', 'range', 'tokens', 'comments'].includes(key)) continue;
    if (Array.isArray(value)) value.forEach(item => visitAst(item, visitor));
    else visitAst(value, visitor);
  }
}

function discoverBrowserCases() {
  const directory = path.join(projectRoot, 'e2e');
  const locations = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.spec.js')) continue;
    const source = fs.readFileSync(path.join(directory, entry.name), 'utf8');
    const tree = espree.parse(source, { ecmaVersion: 'latest', sourceType: 'script', loc: true });
    visitAst(tree, node => {
      if (node.type !== 'CallExpression' || node.callee?.type !== 'Identifier' || node.callee.name !== 'test') return;
      if (node.arguments?.[0]?.type !== 'Literal' || typeof node.arguments[0].value !== 'string') return;
      locations.push({ file: `e2e/${entry.name}`, line: node.loc.start.line, title: node.arguments[0].value });
    });
  }
  const cases = locations.sort((left, right) => `${left.file}:${left.line}`.localeCompare(`${right.file}:${right.line}`, 'en', { numeric: true }));
  const identities = cases.map(item => JSON.stringify([item.file, item.title]));
  if (new Set(identities).size !== identities.length) throw new Error('Automatic browser batches require unique test titles within each file.');
  return cases;
}

function discoverBrowserTests() {
  return discoverBrowserCases().map(item => `${item.file}:${item.line}`);
}

function browserCaseList(cases) {
  return cases.map(item => {
    if (!item.file.startsWith('e2e/') || /[\r\n\u203A]/.test(item.title)) throw new Error('Invalid stable browser test description.');
    return `${item.file.slice(4)} \u203A ${item.title}`;
  }).join('\n');
}

function chunkBrowserTests(locations, batchSize) {
  const batches = [];
  for (let index = 0; index < locations.length; index += batchSize) {
    batches.push(locations.slice(index, index + batchSize));
  }
  return batches;
}

function cleanupRuntime(runtimeDirectory) {
  const resolved = path.resolve(runtimeDirectory);
  if (!resolved.startsWith(`${tempRoot}${path.sep}`) || !path.basename(resolved).startsWith('contractor-ai-browser-')) {
    throw new Error(`Refusing to remove an unexpected browser runtime directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

function browserTestEnvironment(env = process.env) {
  const platformKeys = new Set([
    'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR',
    'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
    'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'XDG_CACHE_HOME',
    'XDG_RUNTIME_DIR', 'DISPLAY', 'WAYLAND_DISPLAY', 'LANG', 'LC_ALL', 'LC_CTYPE',
    'TZ', 'CI', 'FORCE_COLOR', 'NO_COLOR', 'TERM', 'COLORTERM',
    'PLAYWRIGHT_BROWSERS_PATH', 'PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD',
    'CONTRACTOR_AI_VISUAL_QA_DIR'
  ]);
  // Scrub the Playwright parent too: its web servers inherit that environment.
  return {
    ...Object.fromEntries(Object.entries(env).filter(([key]) => platformKeys.has(key.toUpperCase()))),
    NODE_ENV: 'test',
    CONTRACTOR_AI_RUNTIME_MODE: 'local',
    CONTRACTOR_AI_STORAGE_MODE: 'local',
    CONTRACTOR_AI_BIND_HOST: '127.0.0.1',
    CONTRACTOR_AI_AUTONOMOUS_SCHEDULER_ENABLED: 'false',
    CONTRACTOR_AI_CHAT_AI_ENABLED: 'false',
    CONTRACTOR_AI_WHATSAPP_ENABLED: 'false',
    WEATHER_PROVIDER_ENABLED: 'false'
  };
}

async function runBrowserBatch(testLocations, outputDirectory) {
  const runtimeDirectory = fs.mkdtempSync(path.join(tempRoot, 'contractor-ai-browser-'));
  fs.mkdirSync(path.join(runtimeDirectory, 'local'));
  fs.mkdirSync(path.join(runtimeDirectory, 'auth'));
  const localPort = await reserveFreePort();
  let authPort = await reserveFreePort();
  while (authPort === localPort) authPort = await reserveFreePort();
  let result;
  try {
    const automatic = testLocations.every(item => typeof item === 'object');
    const caseListPath = path.join(runtimeDirectory, 'test-list.txt');
    if (automatic) fs.writeFileSync(caseListPath, browserCaseList(testLocations));
    const selectors = automatic ? ['--test-list', caseListPath,
      '--reporter', `line,${path.join(__dirname, 'browser-coverage-reporter.js')}`] : testLocations;
    result = spawnSync(process.execPath, [require.resolve('@playwright/test/cli'), 'test', ...selectors,
      ...(outputDirectory ? ['--output', outputDirectory] : [])], {
      cwd: projectRoot,
      env: {
        ...browserTestEnvironment(),
        CONTRACTOR_AI_BROWSER_EXPECTED_CASES: automatic ? JSON.stringify(testLocations) : '',
        CONTRACTOR_AI_BROWSER_RUNTIME_DIR: runtimeDirectory,
        CONTRACTOR_AI_BROWSER_LOCAL_PORT: String(localPort),
        CONTRACTOR_AI_BROWSER_AUTH_PORT: String(authPort)
      },
      stdio: 'inherit'
    });
  } finally {
    cleanupRuntime(runtimeDirectory);
  }
  if (result.error) throw result.error;
  return Number.isInteger(result.status) ? result.status : 1;
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { browserCaseList, browserRunOptions, browserTestEnvironment, chunkBrowserTests, configuredBatchSize, discoverBrowserCases, discoverBrowserTests, executeBrowserBatches, runBrowserBatch };
