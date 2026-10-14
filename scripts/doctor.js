const DEFAULT_TIMEOUT_MS = 8_000;
const { assessNodeCompatibility } = require('./node-compatibility');

function parseArguments(args = process.argv.slice(2)) {
  const options = {
    baseUrl: process.env.CONTRACTOR_AI_DOCTOR_URL || `http://127.0.0.1:${process.env.PORT || 3000}`,
    token: process.env.CONTRACTOR_AI_DOCTOR_TOKEN || process.env.CONTRACTOR_AI_AUTH_TOKEN || '',
    timeoutMs: DEFAULT_TIMEOUT_MS
  };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === '--url') options.baseUrl = args[++index] || '';
    else if (value === '--token') options.token = args[++index] || '';
    else if (value === '--timeout-ms') options.timeoutMs = Number(args[++index] || DEFAULT_TIMEOUT_MS);
    else throw new Error(`Unsupported doctor option: ${value}`);
  }
  const parsed = new URL(options.baseUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('Doctor URL must use HTTP or HTTPS.');
  options.baseUrl = parsed.origin;
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 1_000 || options.timeoutMs > 60_000) {
    throw new Error('Doctor timeout must be between 1,000 and 60,000 milliseconds.');
  }
  return options;
}

async function readJson(baseUrl, route, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}${route}`, {
      headers: options.token ? { Authorization: `Bearer ${options.token}` } : {},
      signal: controller.signal
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  } catch (error) {
    return {
      ok: false,
      status: null,
      payload: {},
      error: error?.name === 'AbortError' ? 'timeout' : 'connection_failed'
    };
  } finally {
    clearTimeout(timeout);
  }
}

async function runDoctor(options = parseArguments()) {
  const [readiness, support] = await Promise.all([
    readJson(options.baseUrl, '/api/health/ready', options),
    readJson(options.baseUrl, '/api/operations/support-bundle', options)
  ]);
  const node = assessNodeCompatibility(support.payload?.application?.node);
  const runtimeReady = readiness.ok && support.ok
    && support.payload?.readiness?.runtimeReady === true && node.supported;
  const runtimeMode = support.payload?.application?.runtimeMode || 'unknown';
  const databaseMode = support.payload?.database?.mode || 'unknown';
  const storageMode = support.payload?.readiness?.storage?.mode || 'unknown';
  const hostedRuntimeIssues = [];
  if (!runtimeReady) hostedRuntimeIssues.push('runtime_not_ready');
  if (runtimeMode !== 'hosted') hostedRuntimeIssues.push('hosted_runtime_required');
  if (databaseMode !== 'postgres') hostedRuntimeIssues.push('postgresql_required');
  if (storageMode !== 's3') hostedRuntimeIssues.push('s3_object_storage_required');
  const report = {
    checkedAt: new Date().toISOString(),
    target: options.baseUrl,
    ready: runtimeReady,
    hostedRuntimeReady: hostedRuntimeIssues.length === 0,
    hostedRuntimeIssues,
    endpointFailures: [
      readiness.error ? { endpoint: '/api/health/ready', code: readiness.error } : null,
      support.error ? { endpoint: '/api/operations/support-bundle', code: support.error } : null
    ].filter(Boolean),
    runtimeCompatibility: {
      doctorCli: assessNodeCompatibility(process.version),
      node
    },
    deployment: { mode: runtimeMode, databaseMode, storageMode },
    readiness: {
      httpStatus: readiness.status,
      status: readiness.error || readiness.payload?.status || readiness.payload?.error?.code || 'unavailable',
      checks: readiness.payload?.checks || null,
      requestId: readiness.payload?.requestId || null
    },
    support: support.ok ? {
      httpStatus: support.status,
      format: support.payload.format,
      application: support.payload.application,
      database: {
        mode: databaseMode,
        currentMigration: support.payload.database?.migrations?.currentVersion,
        pendingMigrations: support.payload.database?.migrations?.pending?.length || 0
      },
      storageMode,
      integrity: support.payload.integrity,
      automation: support.payload.control?.automation
    } : {
      httpStatus: support.status,
      status: support.error || support.payload?.error?.code || 'unavailable',
      requestId: support.payload?.error?.requestId || null
    }
  };
  return report;
}

if (require.main === module) {
  runDoctor()
    .then(report => {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      process.exitCode = report.ready ? 0 : 1;
    })
    .catch(error => {
      process.stderr.write(`${JSON.stringify({ ready: false, error: error.message }, null, 2)}\n`);
      process.exitCode = 1;
    });
}

module.exports = { parseArguments, readJson, runDoctor };
