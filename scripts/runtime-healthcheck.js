function healthcheckUrl(env = process.env) {
  const identity = ['local', 'hosted'].includes(env.CONTRACTOR_IDENTITY_MODE);
  const port = Number(identity ? env.CONTRACTOR_IDENTITY_PORT || 3010 : env.PORT || 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid healthcheck port.');
  const configuredHost = identity ? env.CONTRACTOR_IDENTITY_HOST : env.CONTRACTOR_AI_BIND_HOST;
  const host = ['::1', '::'].includes(configuredHost) ? '[::1]' : '127.0.0.1';
  return `http://${host}:${port}${identity ? '/health/ready' : '/api/health/ready'}`;
}

async function runtimeHealthcheck(env = process.env) {
  const response = await fetch(healthcheckUrl(env), { redirect: 'error', signal: AbortSignal.timeout(4000) });
  if (!response.ok) return false;
  const value = await response.json();
  return ['local', 'hosted'].includes(env.CONTRACTOR_IDENTITY_MODE) ? value.ready === true : value.status === 'ready';
}

if (require.main === module) runtimeHealthcheck().then(ready => { process.exitCode = ready ? 0 : 1; }).catch(() => { process.exitCode = 1; });

module.exports = { healthcheckUrl, runtimeHealthcheck };
