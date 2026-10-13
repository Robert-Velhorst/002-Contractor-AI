const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { IdentityRegistry, VERSION, fail, equal, hash, registryOptions } = require('./identity-registry');
const { registryAdapter } = require('./identity-oidc-adapter');
const { authorizationPayload } = require('./authorization-header');

function cookie(req, name) {
  const entries = String(req.headers.cookie || '').split(';').map(item => item.trim()).filter(item => item.startsWith(`${name}=`));
  return entries.length === 1 ? entries[0].slice(name.length + 1) : '';
}

async function createIdentityApp({ registry, distDir = path.join(__dirname, 'dist'), trustProxy = false } = {}) {
  const { Provider } = await import('oidc-provider');
  const secure = new URL(registry.issuer).protocol === 'https:';
  const suffix = hash(registry.issuer).slice(0, 12);
  const sessionName = `contractor_identity_${suffix}`, csrfName = `contractor_identity_csrf_${suffix}`;
  const makeCookie = (name, value, seconds = 28800) => `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure ? '; Secure' : ''}`;
  const jwks = registry.transaction(() => {
    const saved = registry.db.prepare('SELECT value FROM registry_meta WHERE key = ?').get('oidc_jwks');
    if (saved) return registry.open(saved.value, 'oidc_jwks');
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const result = { keys: [{ ...privateKey.export({ format: 'jwk' }), kid: crypto.randomUUID(), alg: 'RS256', use: 'sig' }] };
    registry.db.prepare('INSERT INTO registry_meta (key, value) VALUES (?, ?)').run('oidc_jwks', registry.seal(result, 'oidc_jwks'));
    return result;
  });
  function currentMember(clientId, personId) {
    const company = registry.companyForClient(clientId);
    return company && registry.activeMembership(company.id, personId);
  }
  const provider = new Provider(registry.issuer, {
    adapter: registryAdapter(registry), clients: registry.oidcClients(), jwks,
    cookies: { keys: [crypto.createHmac('sha256', registry.key).update('oidc-cookie').digest('base64url')],
      names: { session: `oidc_session_${suffix}`, interaction: `oidc_interaction_${suffix}`, resume: `oidc_resume_${suffix}` },
      long: { secure, httpOnly: true, sameSite: 'lax' }, short: { secure, httpOnly: true, sameSite: 'lax', path: '/' } },
    claims: { openid: ['sub'], profile: ['name'], contractor_membership: ['company_id', 'ledger_id', 'membership_id', 'membership_version', 'role', 'worker_id'] },
    scopes: ['openid', 'profile', 'contractor_membership'],
    pkce: { required: () => true },
    features: {
      devInteractions: { enabled: false },
      introspection: { enabled: true, allowedPolicy: (_ctx, client, token) => token.clientId === client.clientId && Boolean(currentMember(token.clientId, token.accountId)) },
      revocation: { enabled: true, allowedPolicy: (_ctx, client, token) => token.clientId === client.clientId },
    },
    ttl: { AccessToken: 28800, IdToken: 3600, AuthorizationCode: 60, Grant: 28800, Interaction: 600, Session: 28800 },
    interactions: { url: (_ctx, interaction) => `/identity.html?interaction=${interaction.uid}` },
    findAccount: async (ctx, id, token) => {
      const clientId = token?.clientId || ctx.oidc.client?.clientId;
      const member = currentMember(clientId, id);
      if (!member) return undefined;
      return { accountId: id, async claims() {
        const current = currentMember(clientId, id);
        if (!current) fail('identity_membership_inactive', 'Company membership is no longer active.', 401);
        return { sub: id, name: current.identity.name, company_id: current.companyId,
          ledger_id: registry.company(current.companyId).ledgerId, membership_id: current.id,
          membership_version: current.version, role: current.role, worker_id: current.workerId };
      } };
    },
    renderError: async ctx => { ctx.type = 'text/plain'; ctx.body = 'Aanmelden is niet gelukt. Open je bedrijfsomgeving en begin opnieuw.'; },
  });
  provider.proxy = Boolean(trustProxy);
  const app = express();
  app.disable('x-powered-by');
  if (trustProxy) app.set('trust proxy', trustProxy);
  app.use((req, res, next) => {
    res.set({ 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy': "default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; object-src 'none'" });
    if (secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    registry.assertCurrent({ forServing: true });
    const healthRead = req.path === '/health/ready' && ['GET', 'HEAD'].includes(req.method);
    if (!healthRead && (req.get('host') !== new URL(registry.issuer).host || (secure && !req.secure))) return res.status(400).json({ error: { code: 'identity_origin_mismatch', message: 'Use the configured identity origin.' } });
    if (req.method === 'OPTIONS') return res.sendStatus(403);
    if (req.path !== '/health/ready' && !req.path.startsWith('/assets/') && !registry.rateLimit(`request:ip:${req.ip}`, 20000)) {
      res.set('Retry-After', '600');
      return res.status(429).json({ error: { code: 'identity_rate_limited', message: 'Accountservice ontvangt te veel aanvragen. Probeer later opnieuw.' } });
    }
    next();
  });
  app.get('/health/ready', (_req, res) => {
    // Internal health probes have no public issuer origin or proxy TLS headers.
    const migration = registry.db.prepare('SELECT version FROM registry_migrations WHERE version = ?').get(VERSION);
    if (!migration) fail('identity_not_ready', 'Registry migration is unavailable.', 503);
    res.json({ ready: true, version: VERSION });
  });
  // The provider parses its own protocol forms; never consume those bodies with Express first.
  const api = express.Router();
  api.use(express.json({ limit: '16kb', strict: true }));
  api.use((req, res, next) => {
    if (!['GET', 'HEAD'].includes(req.method)) {
      if (req.get('origin') !== registry.issuer || !req.is('application/json')
          || !equal(cookie(req, csrfName), req.get('x-identity-csrf') || '') || !/^[\w-]{43}$/.test(cookie(req, csrfName))) {
        return res.status(403).json({ error: { code: 'identity_csrf_failed', message: 'Open de accountpagina opnieuw en probeer het nogmaals.' } });
      }
    }
    req.person = registry.session(cookie(req, sessionName));
    next();
  });
  function personRequired(req) { if (!req.person) fail('identity_login_required', 'Meld je eerst aan.', 401); return req.person; }
  function limit(req, action, count = 20) {
    if (!registry.rateLimit(`${action}:ip:${req.ip}`, count)) fail('identity_rate_limited', 'Te veel pogingen. Probeer het over tien minuten opnieuw.', 429);
  }
  api.get('/session', (req, res) => {
    let csrf = cookie(req, csrfName);
    if (!/^[\w-]{43}$/.test(csrf)) { csrf = crypto.randomBytes(32).toString('base64url'); res.append('Set-Cookie', makeCookie(csrfName, csrf)); }
    res.json({ identity: req.person, csrf, memberships: req.person ? registry.memberships(req.person.id) : [] });
  });
  api.post('/register', async (req, res) => { limit(req, 'register', 10); res.status(201).json(await registry.register(req.body)); });
  api.post('/login', async (req, res) => {
    limit(req, 'login');
    const login = await registry.login(req.body);
    registry.logout(cookie(req, sessionName));
    res.append('Set-Cookie', makeCookie(sessionName, login.token));
    res.json({ identity: login.identity, expiresAt: login.expiresAt });
  });
  api.post('/logout', (req, res) => {
    registry.logout(cookie(req, sessionName)); res.append('Set-Cookie', makeCookie(sessionName, '', 0)); res.status(204).end();
  });
  api.post('/recover', async (req, res) => { limit(req, 'recovery', 10); res.json(await registry.recover(req.body)); });
  api.post('/invitations/inspect', (req, res) => { limit(req, 'invite', 60); res.json(registry.inspectInvitation(req.body.token)); });
  api.post('/invitations/claim', (req, res) => {
    limit(req, 'claim', 30); res.status(201).json(registry.claimInvitation(req.body.token, personRequired(req).id));
  });
  async function interaction(req, res) {
    const details = await provider.interactionDetails(req, res);
    if (details.uid !== req.params.id) fail('identity_interaction_invalid', 'Deze aanmelding is niet meer geldig.', 409);
    const company = registry.companyForClient(details.params.client_id);
    if (!company) fail('identity_company_missing', 'Bedrijfsomgeving niet beschikbaar.', 404);
    return { details, company };
  }
  api.get('/interactions/:id', async (req, res) => {
    const { details, company } = await interaction(req, res);
    res.json({ company, prompt: details.prompt.name, eligible: Boolean(req.person && registry.activeMembership(company.id, req.person.id)) });
  });
  api.post('/interactions/:id/continue', async (req, res) => {
    const person = personRequired(req), { details, company } = await interaction(req, res);
    if (!registry.activeMembership(company.id, person.id)) fail('identity_membership_required', 'Je hebt nog geen actieve toelating bij dit bedrijf.', 403);
    let result;
    if (details.prompt.name === 'login') result = { login: { accountId: person.id } };
    else if (details.prompt.name === 'consent') {
      if (details.session?.accountId !== person.id) fail('identity_account_changed', 'Je account is gewijzigd. Begin opnieuw vanuit de bedrijfsomgeving.', 409);
      const grant = details.grantId ? await provider.Grant.find(details.grantId) : new provider.Grant({ accountId: person.id, clientId: company.clientId });
      if (!grant || grant.accountId !== person.id || grant.clientId !== company.clientId) fail('identity_grant_invalid', 'Begin de aanmelding opnieuw.', 409);
      grant.addOIDCScope('openid profile contractor_membership');
      result = { consent: { grantId: await grant.save() } };
    } else fail('identity_prompt_unsupported', 'Begin de aanmelding opnieuw.', 409);
    const redirectTo = await provider.interactionResult(req, res, result, { mergeWithLastSubmission: details.prompt.name !== 'login' });
    registry.transaction(() => registry.audit(company.id, person.id, 'company_sign_in_confirmed', `person:${person.id}`, { prompt: details.prompt.name }));
    res.json({ redirectTo });
  });
  api.post('/interactions/:id/cancel', async (req, res) => {
    await interaction(req, res);
    res.json({ redirectTo: await provider.interactionResult(req, res, { error: 'access_denied', error_description: 'The person cancelled sign-in.' }) });
  });
  app.use('/api/identity', api);

  const service = express.Router();
  service.use(express.json({ limit: '16kb', strict: true }));
  service.use((req, _res, next) => {
    // Server-to-server only. Browsers cannot send company secrets or request a CORS exception.
    if (req.headers.origin || req.headers['sec-fetch-site']) fail('identity_service_browser_forbidden', 'Company service requests cannot originate in a browser.', 403);
    const basic = authorizationPayload(req.get('authorization') || '', 'Basic');
    const decoded = basic && /^[A-Za-z0-9+/=]+$/.test(basic) ? Buffer.from(basic, 'base64').toString('utf8') : '';
    const separator = decoded ? decoded.indexOf(':') : -1;
    req.company = registry.authenticateCompany(separator < 0 ? '' : decoded.slice(0, separator), separator < 0 ? '' : decoded.slice(separator + 1));
    req.actor = String(req.get('x-contractor-actor') || '');
    if (!/^role:owner:[\w:.-]{1,200}$/.test(req.actor)) fail('identity_service_actor_required', 'An authenticated owner actor is required.', 403);
    next();
  });
  service.get('/company', (req, res) => res.json(registry.companyRegister(req.company.id)));
  service.post('/invitations', (req, res) => res.status(201).json(registry.createInvitation(req.company.id, req.body, req.actor)));
  service.post('/invitations/:id/revoke', (req, res) => res.json(registry.revokeInvitation(req.company.id, req.params.id, req.actor)));
  service.post('/memberships/:id/decision', (req, res) => res.json(registry.decideMembership(req.company.id, req.params.id, req.body, req.actor)));
  app.use('/registry/service', service);

  app.get('/', (_req, res) => res.redirect(302, '/identity.html'));
  app.get('/identity.html', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
  app.use('/assets', express.static(path.join(distDir, 'assets'), { index: false, dotfiles: 'deny', maxAge: '1y', immutable: true }));
  app.use(provider.callback());
  app.use((error, _req, res, _next) => {
    if (res.headersSent) return _next(error);
    const status = error.statusCode || error.status || 500;
    res.status(status).json({ error: { code: status >= 500 ? 'identity_unavailable' : error.code || 'identity_request_failed',
      message: status >= 500 ? 'Accountservice tijdelijk niet beschikbaar.' : error.message } });
  });
  app.locals.registry = registry;
  app.locals.provider = provider;
  return app;
}

async function startIdentityServer(env = process.env) {
  const local = env.CONTRACTOR_IDENTITY_MODE === 'local';
  if (!local && env.CONTRACTOR_IDENTITY_MODE !== 'hosted') fail('identity_mode_required', 'Set CONTRACTOR_IDENTITY_MODE to local or hosted.');
  const host = env.CONTRACTOR_IDENTITY_HOST || '127.0.0.1', port = Number(env.CONTRACTOR_IDENTITY_PORT || 3010);
  if (!Number.isInteger(port) || port < 1 || port > 65535) fail('identity_port_invalid', 'Identity port is invalid.');
  if (local && !['127.0.0.1', '::1'].includes(host)) fail('identity_local_binding_invalid', 'Local identity service must bind to loopback.');
  const options = registryOptions(env);
  if (!env.CONTRACTOR_IDENTITY_COMPANIES_FILE) fail('identity_companies_required', 'Configure a private company bindings JSON file.');
  const companies = JSON.parse(fs.readFileSync(env.CONTRACTOR_IDENTITY_COMPANIES_FILE, 'utf8'));
  if (!Array.isArray(companies) || companies.length > 1000) fail('identity_companies_invalid', 'Company bindings must be an array, with at most 1000 companies.');
  const registry = new IdentityRegistry(options);
  try {
    registry.assertCurrent({ forServing: true });
    for (const company of companies) registry.configureCompany(company);
    const app = await createIdentityApp({ registry, trustProxy: env.CONTRACTOR_IDENTITY_TRUST_PROXY || false });
    const server = app.listen(port, host);
    await new Promise((resolve, reject) => { server.once('listening', resolve); server.once('error', reject); });
    return { app, server, registry };
  } catch (error) { registry.close(); throw error; }
}

if (require.main === module) startIdentityServer().then(({ server, registry }) => {
  process.stdout.write('Contractor.AI identity service ready.\n');
  let stopping = false;
  for (const signal of ['SIGTERM', 'SIGINT']) process.once(signal, () => {
    if (stopping) return; stopping = true;
    server.close(() => { registry.close(); process.exitCode = 0; });
  });
}).catch(error => { process.stderr.write(`Identity startup failed: ${error.code || 'configuration_error'}\n`); process.exitCode = 1; });

module.exports = { createIdentityApp, startIdentityServer, cookie };
