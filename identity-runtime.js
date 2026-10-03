const crypto = require('node:crypto');
const { fail, hash, equal, originUrl, keyBuffer, ROLES } = require('./identity-registry');

function identityRuntimeConfiguration(env, { local, authenticationRequired }) {
  const keys = ['ISSUER', 'CLIENT_ID', 'CLIENT_SECRET', 'SESSION_KEY', 'PUBLIC_ORIGIN'];
  const values = Object.fromEntries(keys.map(key => [key, String(env[`CONTRACTOR_AI_IDENTITY_${key}`] || '').trim()]));
  if (keys.every(key => !values[key])) return null;
  if (keys.some(key => !values[key]) || !authenticationRequired) fail('identity_configuration_incomplete', 'Shared identity requires all five identity settings and authenticated company access.');
  if (!/^[A-Za-z0-9._-]{3,120}$/.test(values.CLIENT_ID) || values.CLIENT_SECRET.length < 32) fail('identity_client_invalid', 'Use a valid client identifier and independent secret of at least 32 characters.');
  const issuer = originUrl(values.ISSUER, local), origin = originUrl(values.PUBLIC_ORIGIN, local);
  if (issuer === origin) fail('identity_origin_conflict', 'Registry and company require separate origins.');
  return { issuer, origin, clientId: values.CLIENT_ID, clientSecret: values.CLIENT_SECRET, key: keyBuffer(values.SESSION_KEY), allowLoopback: local };
}

function migrateIdentityRuntime(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS identity_runtime_sessions (
    kind TEXT NOT NULL, id_hash TEXT NOT NULL, sealed_payload TEXT NOT NULL, expires_at TEXT NOT NULL,
    PRIMARY KEY(kind, id_hash), CHECK(kind IN ('login', 'session'))
  ); CREATE INDEX IF NOT EXISTS idx_identity_runtime_expiry ON identity_runtime_sessions(expires_at);`);
  const columns = new Set((typeof db.query === 'function'
    ? db.prepare("SELECT column_name AS name FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'work_board_accounts'").all()
    : db.prepare('PRAGMA table_info(work_board_accounts)').all()).map(row => row.name));
  if (!columns.has('auth_source')) db.exec("ALTER TABLE work_board_accounts ADD COLUMN auth_source TEXT NOT NULL DEFAULT 'password';");
  if (!columns.has('membership_id')) db.exec('ALTER TABLE work_board_accounts ADD COLUMN membership_id TEXT;');
  if (!columns.has('person_id')) db.exec('ALTER TABLE work_board_accounts ADD COLUMN person_id TEXT;');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_work_board_membership ON work_board_accounts(membership_id) WHERE membership_id IS NOT NULL;');
}

class IdentityRuntime {
  constructor(ledger, config) {
    this.ledger = ledger; this.config = config;
    this.scope = `${ledger.company.id}\0${ledger.company.ledgerId}\0${config.issuer}\0${config.clientId}`;
    const suffix = hash(this.scope).slice(0, 16);
    this.cookieName = `contractor_sso_${suffix}`;
    this.flowCookieName = `contractor_sso_flow_${suffix}`;
  }
  cookie(req, name = this.cookieName) {
    const matches = String(req.headers.cookie || '').split(';').map(value => value.trim()).filter(value => value.startsWith(`${name}=`));
    const value = matches.length === 1 ? matches[0].slice(name.length + 1) : '';
    return /^[\w-]{43}$/.test(value) ? value : '';
  }
  setCookie(res, name, value, seconds) {
    res.append('Set-Cookie', `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${seconds}${this.config.origin.startsWith('https:') ? '; Secure' : ''}`);
  }
  seal(value, purpose) {
    const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', this.config.key, iv);
    cipher.setAAD(Buffer.from(`${this.scope}\0${purpose}`));
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }
  open(value, purpose) {
    try {
      const bytes = Buffer.from(value, 'base64'), cipher = crypto.createDecipheriv('aes-256-gcm', this.config.key, bytes.subarray(0, 12));
      cipher.setAAD(Buffer.from(`${this.scope}\0${purpose}`)); cipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString('utf8'));
    } catch { fail('identity_session_invalid', 'Meld je opnieuw aan bij deze bedrijfsomgeving.', 401); }
  }
  put(kind, token, value, seconds) {
    const id = hash(token), expires = new Date(Date.now() + seconds * 1000).toISOString();
    this.ledger.db.prepare('DELETE FROM identity_runtime_sessions WHERE expires_at <= ?').run(new Date().toISOString());
    this.ledger.db.prepare('INSERT INTO identity_runtime_sessions (kind, id_hash, sealed_payload, expires_at) VALUES (?, ?, ?, ?)')
      .run(kind, id, this.seal(value, `${kind}:${id}`), expires);
  }
  get(kind, token, consume = false) {
    if (!token) return null;
    return this.ledger.transaction(() => {
      const id = hash(token), row = this.ledger.db.prepare('SELECT * FROM identity_runtime_sessions WHERE kind = ? AND id_hash = ? AND expires_at > ?')
        .get(kind, id, new Date().toISOString());
      if (!row) return null;
      if (consume && this.ledger.db.prepare('DELETE FROM identity_runtime_sessions WHERE kind = ? AND id_hash = ?').run(kind, id).changes !== 1) return null;
      return this.open(row.sealed_payload, `${kind}:${id}`);
    });
  }
  async client() {
    if (!this.discovery) this.discovery = (async () => {
      const client = await import('openid-client');
      const restrictedFetch = (url, options) => {
        if (new URL(url).origin !== this.config.issuer) fail('identity_endpoint_forbidden', 'Identity endpoints must belong to the configured issuer.', 503);
        return fetch(url, { ...options, redirect: 'error', signal: AbortSignal.timeout(5000) });
      };
      const config = await client.discovery(new URL(this.config.issuer), this.config.clientId, undefined,
        client.ClientSecretBasic(this.config.clientSecret), { timeout: 5, [client.customFetch]: restrictedFetch,
          execute: this.config.allowLoopback ? [client.allowInsecureRequests] : [] });
      config[client.customFetch] = restrictedFetch;
      return { client, config };
    })().catch(error => { this.discovery = null; throw error; });
    return this.discovery;
  }
  async begin(req, res) {
    const returnTo = typeof req.query.returnTo === 'string' ? req.query.returnTo : '/';
    if (!['/', '/work-board.html', '/field-offline.html'].includes(returnTo)) fail('identity_return_invalid', 'Unknown company destination.');
    const { client, config } = await this.client();
    const state = client.randomState(), verifier = client.randomPKCECodeVerifier(), nonce = client.randomNonce();
    this.put('login', state, { verifier, nonce, returnTo }, 600);
    this.setCookie(res, this.flowCookieName, state, 600);
    const url = client.buildAuthorizationUrl(config, { redirect_uri: `${this.config.origin}/api/auth/identity/callback`,
      scope: 'openid profile contractor_membership', state, nonce, code_challenge: await client.calculatePKCECodeChallenge(verifier), code_challenge_method: 'S256', prompt: 'login' });
    res.redirect(303, url.href);
  }
  validateClaims(claims) {
    if (claims.company_id !== this.ledger.company.id || claims.ledger_id !== this.ledger.company.ledgerId || !ROLES.has(claims.role)
        || typeof claims.sub !== 'string' || typeof claims.membership_id !== 'string' || !Number.isInteger(claims.membership_version)
        || (claims.role === 'field_worker' && typeof claims.worker_id !== 'string') || (claims.role !== 'field_worker' && claims.worker_id)) {
      fail('identity_membership_scope_invalid', 'De toegang hoort niet bij deze bedrijfsomgeving.', 403);
    }
    if (claims.role === 'field_worker') {
      this.ledger.getWorker(claims.worker_id);
      const linked = this.ledger.db.prepare("SELECT id FROM work_board_accounts WHERE membership_id = ? AND person_id = ? AND worker_id = ? AND auth_source = 'identity' AND status = 'admitted'")
        .get(claims.membership_id, claims.sub, claims.worker_id);
      if (!linked) fail('identity_worker_link_pending', 'De lokale koppeling met je uitvoerdersprofiel is nog niet afgerond.', 403);
    }
    return claims;
  }
  async callback(req, res, onSuccess = () => {}) {
    const state = typeof req.query.state === 'string' ? req.query.state : '';
    if (!state || !equal(state, this.cookie(req, this.flowCookieName))) fail('identity_state_invalid', 'De aanmelding is verlopen of hoort bij een ander venster.', 401);
    const retained = this.get('login', state, true);
    this.setCookie(res, this.flowCookieName, '', 0);
    if (!retained) fail('identity_state_invalid', 'Begin de aanmelding opnieuw.', 401);
    const { client, config } = await this.client();
    const tokens = await client.authorizationCodeGrant(config, new URL(req.originalUrl, this.config.origin), {
      pkceCodeVerifier: retained.verifier, expectedState: state, expectedNonce: retained.nonce, idTokenExpected: true });
    const claims = this.validateClaims(await client.fetchUserInfo(config, tokens.access_token, tokens.claims().sub));
    const token = crypto.randomBytes(32).toString('base64url');
    this.ledger.transaction(() => {
      this.put('session', token, { accessToken: tokens.access_token, sub: claims.sub, membershipId: claims.membership_id, version: claims.membership_version }, Math.min(28800, tokens.expires_in || 28800));
      this.ledger.audit({ entityType: 'identity_membership', entityId: claims.membership_id, action: 'identity_sign_in', actor: `role:${claims.role}:identity:${claims.sub}`, after: { version: claims.membership_version } });
    });
    await this.logout(req, res);
    onSuccess();
    this.setCookie(res, this.cookieName, token, Math.min(28800, tokens.expires_in || 28800));
    res.redirect(303, retained.returnTo);
  }
  async authenticate(req) {
    const retained = this.get('session', this.cookie(req));
    if (!retained) return null;
    const { client, config } = await this.client();
    const claims = this.validateClaims(await client.fetchUserInfo(config, retained.accessToken, retained.sub));
    if (claims.membership_id !== retained.membershipId || claims.membership_version !== retained.version) fail('identity_membership_changed', 'Je bedrijfsrechten zijn gewijzigd. Meld je opnieuw aan.', 401);
    return { id: `identity:${claims.sub}`, name: claims.name, role: claims.role,
      scope: claims.role === 'field_worker' ? { workerId: claims.worker_id } : null, source: 'identity', authMethod: 'identity',
      personId: claims.sub, membershipId: claims.membership_id, membershipVersion: claims.membership_version };
  }
  async logout(req, res) {
    const token = this.cookie(req);
    if (token) this.ledger.db.prepare("DELETE FROM identity_runtime_sessions WHERE kind = 'session' AND id_hash = ?").run(hash(token));
    this.setCookie(res, this.cookieName, '', 0);
  }
  async service(route, req, body) {
    if (!req.operator?.authenticated || req.operator.role !== 'owner') fail('identity_owner_required', 'Alleen een aangemelde eigenaar kan bedrijfstoegang beheren.', 403);
    const response = await fetch(`${this.config.issuer}/registry/service${route}`, {
      method: body ? 'POST' : 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
      headers: { Authorization: `Basic ${Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString('base64')}`,
        'X-Contractor-Actor': `role:owner:${req.operator.id}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.json();
    if (!response.ok) fail(value.error?.code || 'identity_service_failed', value.error?.message || 'Accountservice niet beschikbaar.', response.status);
    if (route === '/company' && (value.company?.id !== this.ledger.company.id || value.company?.ledgerId !== this.ledger.company.ledgerId || value.company?.origin !== this.config.origin)) {
      fail('identity_company_binding_invalid', 'De accountservice verwijst naar een andere bedrijfsomgeving.', 409);
    }
    return value;
  }
}

module.exports = { IdentityRuntime, identityRuntimeConfiguration, migrateIdentityRuntime };
