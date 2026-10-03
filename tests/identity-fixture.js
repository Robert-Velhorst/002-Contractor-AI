const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { IdentityRegistry } = require('../identity-registry');
const { createIdentityApp } = require('../identity-server');

async function freePort() {
  const server = net.createServer(); server.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
class Agent {
  constructor() { this.cookies = new Map(); }
  async request(url, options = {}) {
    const headers = { Cookie: [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '), ...options.headers };
    const response = await fetch(url, { ...options, headers, redirect: 'manual' });
    for (const entry of response.headers.getSetCookie()) {
      const pair = entry.split(';')[0], index = pair.indexOf('=');
      if (entry.includes('Max-Age=0')) this.cookies.delete(pair.slice(0, index));
      else this.cookies.set(pair.slice(0, index), pair.slice(index + 1));
    }
    return response;
  }
  async json(url, body, headers = {}) {
    const response = await this.request(url, { ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}), headers: { ...(body ? { 'Content-Type': 'application/json', Origin: new URL(url).origin } : {}), ...headers } });
    const value = response.status === 204 ? {} : await response.json();
    return { status: response.status, value, response };
  }
}

async function identityFixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-identity-api-')), previousEnv = { ...process.env }, runtimes = [];
  const registryPort = await freePort(), issuer = `http://127.0.0.1:${registryPort}`;
  const registryOptions = { dbFile: path.join(root, 'registry.sqlite'), issuer, allowLoopback: true, encryptionKey: crypto.randomBytes(32) };
  const registry = new IdentityRegistry(registryOptions);
  let identityServer;
  t.after(async () => {
    if (identityServer?.listening) await new Promise(resolve => identityServer.close(resolve));
    for (const runtime of runtimes) await runtime.app.locals.runtimeControl.shutdown({ server: runtime.server });
    registry.close();
    for (const key of Object.keys(process.env)) if (!Object.hasOwn(previousEnv, key)) delete process.env[key];
    Object.assign(process.env, previousEnv);
    fs.rmSync(root, { recursive: true, force: true });
  });
  for (const id of ['alpha', 'bravo']) {
    const port = await freePort(), origin = `http://127.0.0.1:${port}`, dataDir = path.join(root, id), dbFile = path.join(dataDir, 'ledger.sqlite');
    const ledger = new ContractorOperatingLedger({ companyId: id, dbFile });
    const worker = ledger.upsertWorker({ name: `Worker ${id}`, email: `${id}@test.invalid`, skills: ['timmerman'], status: 'available' }, { actor: 'fixture' });
    const company = ledger.company;
    ledger.close();
    const secret = crypto.randomBytes(40).toString('base64url'), ownerKey = `test-owner-secret-${id}-${'k'.repeat(32)}`;
    registry.configureCompany({ id, ledgerId: company.ledgerId, name: `Company ${id}`, origin, clientId: id, clientSecret: secret });
    Object.assign(process.env, { NODE_ENV: 'test', CONTRACTOR_AI_RUNTIME_MODE: 'local', CONTRACTOR_AI_STORAGE_MODE: 'local', CONTRACTOR_AI_REQUIRE_AUTH: 'true',
      CONTRACTOR_AI_AUTH_TOKEN: ownerKey, CONTRACTOR_AI_ROLE_TOKENS: '', CONTRACTOR_AI_COMPANY_ID: id, CONTRACTOR_AI_DATA_DIR: dataDir, LEDGER_DB_FILE: dbFile,
      STATE_FILE: path.join(dataDir, 'state.json'), UPLOAD_DIR: path.join(dataDir, 'uploads'), CONTRACTOR_AI_AUTONOMOUS_SCHEDULER_ENABLED: 'false', WEATHER_PROVIDER_ENABLED: 'false',
      CONTRACTOR_AI_IDENTITY_ISSUER: issuer, CONTRACTOR_AI_IDENTITY_CLIENT_ID: id, CONTRACTOR_AI_IDENTITY_CLIENT_SECRET: secret,
      CONTRACTOR_AI_IDENTITY_SESSION_KEY: crypto.randomBytes(32).toString('base64'), CONTRACTOR_AI_IDENTITY_PUBLIC_ORIGIN: origin,
      CONTRACTOR_AI_BACKUP_SIGNING_KEY: 'identity-tests-independent-backup-signing-key' });
    delete require.cache[require.resolve('../server')];
    const app = require('../server'), server = app.listen(port, '127.0.0.1');
    runtimes.push({ app, server, origin, company, worker, ownerKey, dbFile });
    await new Promise(resolve => server.once('listening', resolve));
  }
  const app = await createIdentityApp({ registry });
  identityServer = app.listen(registryPort, '127.0.0.1');
  await new Promise(resolve => identityServer.once('listening', resolve));
  return { registry, issuer, runtimes, stopIdentity: () => new Promise(resolve => identityServer.close(resolve)), restartIdentity: async () => {
    await new Promise(resolve => identityServer.close(resolve));
    const next = await createIdentityApp({ registry });
    identityServer = next.listen(registryPort, '127.0.0.1');
    await new Promise(resolve => identityServer.once('listening', resolve));
  } };
}

module.exports = { identityFixture, Agent };
