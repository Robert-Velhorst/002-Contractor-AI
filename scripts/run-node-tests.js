const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { postgresTestDatabaseUrl } = require('../tests/postgres-test-database');

const projectRoot = path.resolve(__dirname, '..');
const tempRoot = fs.realpathSync(os.tmpdir());
const runtimePrefix = 'contractor-ai-node-tests-';

function createRuntimeDirectory() {
  return fs.mkdtempSync(path.join(tempRoot, runtimePrefix));
}

function cleanupRuntimeDirectory(runtimeDirectory) {
  const resolved = path.resolve(runtimeDirectory);
  if (!resolved.startsWith(`${tempRoot}${path.sep}`) || !path.basename(resolved).startsWith(runtimePrefix)) {
    throw new Error(`Refusing to remove an unexpected Node test runtime directory: ${resolved}`);
  }
  fs.rmSync(resolved, { recursive: true, force: true, maxRetries: 10, retryDelay: 250 });
}

function allTestFiles() {
  return fs.readdirSync(path.join(projectRoot, 'tests'), { withFileTypes: true })
    .filter(entry => entry.isFile() && entry.name.endsWith('.test.js'))
    .map(entry => path.posix.join('tests', entry.name))
    .sort((left, right) => left.localeCompare(right));
}

function postgresTestFiles(testFiles = allTestFiles()) {
  return testFiles.filter(file => fs.readFileSync(path.join(projectRoot, file), 'utf8')
    .match(/CONTRACTOR_AI_POSTGRES_TEST_URL|require\('\.\/postgres-test-database'\)/));
}

function withTestConcurrency(args, concurrency) {
  const normalized = [];
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--test-concurrency') {
      index += 1;
      continue;
    }
    if (argument.startsWith('--test-concurrency=')) continue;
    normalized.push(argument);
  }
  return [`--test-concurrency=${concurrency}`, ...normalized];
}

function nodeTestEnvironment(env = process.env) {
  const platformKeys = new Set([
    'PATH', 'PATHEXT', 'SYSTEMROOT', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR',
    'HOME', 'USERPROFILE', 'HOMEDRIVE', 'HOMEPATH', 'APPDATA', 'LOCALAPPDATA',
    'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'XDG_CACHE_HOME',
    'XDG_RUNTIME_DIR', 'LANG', 'LC_ALL', 'LC_CTYPE', 'TZ', 'CI',
    'FORCE_COLOR', 'NO_COLOR', 'TERM', 'COLORTERM'
  ]);
  const connectionString = postgresTestDatabaseUrl(env.CONTRACTOR_AI_POSTGRES_TEST_URL ?? '');
  return {
    ...Object.fromEntries(Object.entries(env).filter(([key]) => platformKeys.has(key.toUpperCase()))),
    ...(connectionString ? {
      CONTRACTOR_AI_POSTGRES_TEST_URL: connectionString,
      ...(env.NODE_EXTRA_CA_CERTS ? { NODE_EXTRA_CA_CERTS: env.NODE_EXTRA_CA_CERTS } : {})
    } : {}),
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

function executeTests(testArguments, runtimeDirectory) {
  return spawnSync(process.execPath, ['--require', path.join(__dirname, 'node-test-runtime.js'), '--test', ...testArguments], {
    cwd: projectRoot,
    env: {
      ...nodeTestEnvironment(),
      CONTRACTOR_AI_NODE_TEST_RUNTIME_DIR: runtimeDirectory,
      TEMP: runtimeDirectory,
      TMP: runtimeDirectory,
      TMPDIR: runtimeDirectory
    },
    stdio: 'inherit'
  });
}

function runNodeTests(args = process.argv.slice(2)) {
  postgresTestDatabaseUrl();
  const runtimeDirectory = createRuntimeDirectory();
  const hasExplicitTestFile = args.some(argument => /(?:^|[\\/])[^\\/]+\.test\.js$/i.test(argument));
  let result;
  try {
    const discovered = hasExplicitTestFile ? [] : allTestFiles();
    const sharedPostgresFiles = process.env.CONTRACTOR_AI_POSTGRES_TEST_URL && !hasExplicitTestFile
      ? postgresTestFiles(discovered)
      : [];
    if (sharedPostgresFiles.length) {
      const sharedSet = new Set(sharedPostgresFiles);
      const parallelFiles = discovered.filter(file => !sharedSet.has(file));
      console.log(`Running ${parallelFiles.length} isolated test files in parallel, then ${sharedPostgresFiles.length} shared PostgreSQL files serially.`);
      result = executeTests([...args, ...parallelFiles], runtimeDirectory);
      if (!result.error && result.status === 0) {
        result = executeTests([...withTestConcurrency(args, 1), ...sharedPostgresFiles], runtimeDirectory);
      }
    } else {
      const testArguments = hasExplicitTestFile ? args : [...args, ...discovered];
      result = executeTests(testArguments, runtimeDirectory);
    }
  } finally {
    cleanupRuntimeDirectory(runtimeDirectory);
  }

  if (result.error) throw result.error;
  return Number.isInteger(result.status) ? result.status : 1;
}

if (require.main === module) {
  try {
    process.exitCode = runNodeTests();
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}

module.exports = {
  allTestFiles,
  cleanupRuntimeDirectory,
  createRuntimeDirectory,
  nodeTestEnvironment,
  postgresTestFiles,
  runNodeTests,
  withTestConcurrency
};
