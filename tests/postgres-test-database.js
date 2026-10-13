const assert = require('node:assert/strict');
const ENVIRONMENT_KEY = 'CONTRACTOR_AI_POSTGRES_TEST_URL';

function postgresTestDatabaseUrl(value = process.env[ENVIRONMENT_KEY]) {
  if (value === undefined || value === '') return undefined;
  const refuse = () => {
    const error = new Error(`${ENVIRONMENT_KEY} must identify a loopback PostgreSQL database named contractor_ai_test (or contractor_ai_test_<suffix>). Test databases are disposable.`);
    error.code = 'unsafe_postgres_test_database';
    throw error;
  };
  let url;
  try { url = new URL(value); } catch { return refuse(); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
      || !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      || !/^\/contractor_ai_test(?:_[a-z0-9]+)*$/.test(url.pathname)
      || url.hash
      || [...url.searchParams.keys()].some(key => key !== 'sslmode')
      || url.searchParams.getAll('sslmode').length > 1) return refuse();
  return url.href;
}

async function connectVerifiedPostgresClient(client) {
  try {
    await client.connect();
    assert.equal(client.connection?.stream?.authorized, true, 'PostgreSQL test client must use verified TLS.');
    return client;
  } catch (error) {
    // Setup can fail before the caller registers database teardown.
    try { await client.end(); } catch { /* Preserve the original verification failure. */ }
    throw error;
  }
}

module.exports = { postgresTestDatabaseUrl, connectVerifiedPostgresClient };
