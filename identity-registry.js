const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { promisify } = require('node:util');
const { DatabaseSync } = require('node:sqlite');
const { PostgresSyncDatabase, resolvePostgresConnectionOptions } = require('./postgres-sync-database');
const { normalizeCompanyId } = require('./company-runtime');

const derive = promisify(crypto.scrypt);
const ROLES = new Set(['owner', 'approver', 'office_operator', 'field_worker']);
const MEMBER_STATES = new Set(['active', 'suspended', 'revoked']);
const VERSION = '002_registry_recovery';
const REGISTRY_LOCK = 82371019;
const now = () => new Date().toISOString();
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const equal = (left, right) => typeof left === 'string' && typeof right === 'string'
  && Buffer.byteLength(left) === Buffer.byteLength(right) && crypto.timingSafeEqual(Buffer.from(left), Buffer.from(right));
function fail(code, message, statusCode = 400) { throw Object.assign(new Error(message), { code, statusCode }); }
function required(value, label, max = 200) {
  if (typeof value !== 'string' || !value.trim() || value.length > max || [...value].some(character => character.charCodeAt(0) < 32)) fail('identity_input_invalid', `${label} is missing or invalid.`);
  return value.trim();
}
function password(value) {
  if (typeof value !== 'string' || [...value].length < 16 || value.length > 200) fail('identity_password_invalid', 'Use a password of 16 to 200 characters.');
  return value;
}
function loginName(value) {
  const name = required(value, 'Login name', 100).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._@+-]{2,99}$/.test(name)) fail('identity_login_invalid', 'Use 3 to 100 letters, digits or . _ @ + - for the login name.');
  return name;
}
function safeIdentity(row) {
  return row ? { id: row.id, loginName: row.login_name, name: row.name, email: row.email, emailVerified: false, status: row.status, createdAt: row.created_at } : null;
}
function originUrl(value, allowLoopback = false) {
  let url;
  try { url = new URL(value); } catch { fail('identity_origin_invalid', 'An explicit application origin is required.'); }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash
    || (url.protocol !== 'https:' && !(allowLoopback && local && url.protocol === 'http:'))) {
    fail('identity_origin_invalid', 'Use HTTPS, or an explicitly allowed loopback HTTP origin.');
  }
  return url.origin;
}
function keyBuffer(value) {
  if (!Buffer.isBuffer(value) && !/^[A-Za-z0-9+/]{43}=$/.test(String(value || ''))) fail('identity_key_required', 'A canonical base64-encoded 32-byte encryption key is required.');
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(String(value || ''), 'base64');
  if (bytes.length !== 32) fail('identity_key_required', 'A 32-byte registry encryption key is required.');
  return bytes;
}
function tableExists(db, table) {
  return Boolean(db.prepare(typeof db.query === 'function'
    ? "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ?"
    : "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(table));
}

function registryOptions(env) {
  const mode = env.CONTRACTOR_IDENTITY_MODE;
  if (!['local', 'hosted'].includes(mode)) fail('identity_mode_required', 'Choose local or hosted identity mode.');
  const local = mode === 'local', databaseUrl = env.CONTRACTOR_IDENTITY_DATABASE_URL || undefined;
  const dbFile = env.CONTRACTOR_IDENTITY_DB_FILE || undefined;
  if (local && (databaseUrl || !dbFile || dbFile === ':memory:')) fail('identity_local_database_required', 'Local registry operation requires one persistent SQLite path and no PostgreSQL URL.');
  if (!local) {
    if (!databaseUrl || dbFile || env.CONTRACTOR_IDENTITY_EU_REGION_CONFIRMED !== 'true' || !env.CONTRACTOR_IDENTITY_DPA_REFERENCE?.trim()) {
      fail('identity_hosted_requirements', 'Hosted registry operation requires only a PostgreSQL URL, EU confirmation and DPA reference.');
    }
    const tls = resolvePostgresConnectionOptions(databaseUrl);
    if (!tls.ssl || !tls.rejectUnauthorized || tls.sslMode !== 'verify-full') fail('identity_database_tls_required', 'Hosted registry operation requires verified database TLS.');
  }
  return { dbFile, databaseUrl, issuer: originUrl(env.CONTRACTOR_IDENTITY_ISSUER, local), encryptionKey: keyBuffer(env.CONTRACTOR_IDENTITY_ENCRYPTION_KEY), allowLoopback: local };
}

class IdentityRegistry {
  constructor({ dbFile, databaseUrl, issuer, encryptionKey, allowLoopback = false, requireEmpty = false, requireExisting = false, initialReady = true } = {}) {
    this.issuer = originUrl(issuer, allowLoopback);
    this.key = keyBuffer(encryptionKey);
    this.allowLoopback = allowLoopback;
    this.passwordWork = 0;
    if (!databaseUrl && !dbFile) fail('identity_database_required', 'A separate persistent registry database is required.');
    if (requireExisting && !databaseUrl && (dbFile === ':memory:' || !fs.existsSync(dbFile))) fail('identity_database_missing', 'Choose an existing registry database.', 404);
    if (!databaseUrl && dbFile !== ':memory:') fs.mkdirSync(path.dirname(path.resolve(dbFile)), { recursive: true, mode: 0o700 });
    this.db = databaseUrl ? new PostgresSyncDatabase({ connectionString: databaseUrl }) : new DatabaseSync(dbFile);
    this.postgres = Boolean(databaseUrl);
    try {
      if (['jobs', 'company_runtime', 'ledger_schema_migrations', 'schema_migrations'].some(table => tableExists(this.db, table))) {
        fail('identity_database_conflict', 'The registry cannot use a company ledger database.', 409);
      }
      if (requireExisting && !tableExists(this.db, 'registry_meta')) fail('identity_database_missing', 'The configured database is not an existing registry.', 404);
      if (tableExists(this.db, 'registry_meta')) {
        const retained = this.db.prepare('SELECT value FROM registry_meta WHERE key = ?').get('binding');
        if (!retained || this.open(retained.value, 'binding').issuer !== this.issuer) fail('identity_issuer_mismatch', 'The existing registry binding cannot be verified.', 409);
      }
      if (!this.postgres) this.db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
      this.transaction(() => {
        if (requireEmpty) {
          const tables = this.db.prepare(this.postgres
            ? "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public'"
            : "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
          if (tables.length) fail('identity_restore_target_not_empty', 'Registry recovery requires a new empty database.', 409);
        }
        this.migrate();
        const retained = this.db.prepare('SELECT value FROM registry_meta WHERE key = ?').get('binding');
        if (retained) {
          const binding = this.open(retained.value, 'binding');
          if (binding.issuer !== this.issuer) fail('identity_issuer_mismatch', 'This registry belongs to a different identity issuer.', 409);
          this.id = binding.id;
          this.epoch = Number(binding.epoch || 1);
        } else {
          this.id = `registry_${crypto.randomUUID()}`;
          this.epoch = 1;
          this.db.prepare('INSERT INTO registry_meta (key, value) VALUES (?, ?)').run('binding', this.seal({ id: this.id, issuer: this.issuer, epoch: this.epoch, ready: initialReady }, 'binding'));
        }
      });
    } catch (error) { this.db.close(); throw error; }
  }
  migrate() {
    this.transaction(() => {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS registry_migrations (version TEXT PRIMARY KEY, applied_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS registry_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS registry_identities (
          id TEXT PRIMARY KEY, login_name TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
          email TEXT, password_hash TEXT NOT NULL, salt TEXT NOT NULL,
          credential_version INTEGER NOT NULL, status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS registry_recovery_codes (
          id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES registry_identities(id), code_hash TEXT NOT NULL UNIQUE,
          used_at TEXT, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS registry_sessions (
          token_hash TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES registry_identities(id),
          credential_version INTEGER NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS registry_companies (
          id TEXT PRIMARY KEY, ledger_id TEXT NOT NULL UNIQUE, name TEXT NOT NULL, origin TEXT NOT NULL UNIQUE,
          client_id TEXT NOT NULL UNIQUE, client_secret_hash TEXT NOT NULL, sealed_client_secret TEXT NOT NULL,
          status TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS registry_memberships (
          id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES registry_companies(id),
          person_id TEXT NOT NULL REFERENCES registry_identities(id), status TEXT NOT NULL, role TEXT NOT NULL,
          worker_id TEXT, version INTEGER NOT NULL, reference TEXT, admitted_at TEXT,
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL, UNIQUE(company_id, person_id)
        );
        CREATE UNIQUE INDEX IF NOT EXISTS registry_active_worker ON registry_memberships(company_id, worker_id)
          WHERE worker_id IS NOT NULL AND status = 'active';
        CREATE TABLE IF NOT EXISTS registry_invitations (
          id TEXT PRIMARY KEY, company_id TEXT NOT NULL REFERENCES registry_companies(id), token_hash TEXT NOT NULL UNIQUE,
          role TEXT NOT NULL, worker_id TEXT, contact_hint TEXT, reference TEXT NOT NULL,
          status TEXT NOT NULL, expires_at TEXT NOT NULL, claimed_by TEXT REFERENCES registry_identities(id),
          created_at TEXT NOT NULL, updated_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS registry_oidc_models (
          model TEXT NOT NULL, id TEXT NOT NULL, sealed_payload TEXT NOT NULL, expires_at TEXT NOT NULL,
          uid TEXT, user_code TEXT, grant_id TEXT, account_id TEXT, client_id TEXT,
          PRIMARY KEY(model, id)
        );
        CREATE INDEX IF NOT EXISTS registry_oidc_grants ON registry_oidc_models(grant_id);
        CREATE INDEX IF NOT EXISTS registry_oidc_account ON registry_oidc_models(account_id, client_id);
        CREATE INDEX IF NOT EXISTS registry_oidc_uid ON registry_oidc_models(model, uid);
        CREATE TABLE IF NOT EXISTS registry_rate_windows (key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires_at TEXT NOT NULL);
        CREATE TABLE IF NOT EXISTS registry_audit (
          sequence INTEGER PRIMARY KEY, company_id TEXT, entity_id TEXT NOT NULL, action TEXT NOT NULL,
          actor TEXT NOT NULL, details_json TEXT NOT NULL, created_at TEXT NOT NULL, previous_hash TEXT NOT NULL, hash TEXT NOT NULL
        );
      `);
      this.db.prepare('INSERT INTO registry_migrations (version, applied_at) VALUES (?, ?) ON CONFLICT(version) DO NOTHING').run('001_shared_identity_registry', now());
      this.db.exec(`CREATE TABLE IF NOT EXISTS registry_assisted_recovery (
        id TEXT PRIMARY KEY, person_id TEXT NOT NULL REFERENCES registry_identities(id), token_hash TEXT NOT NULL UNIQUE,
        credential_version INTEGER NOT NULL, status TEXT NOT NULL, actor TEXT NOT NULL, reference TEXT NOT NULL,
        delivery_reference TEXT NOT NULL, expires_at TEXT NOT NULL, created_at TEXT NOT NULL, used_at TEXT
      ); CREATE INDEX IF NOT EXISTS registry_assisted_recovery_person ON registry_assisted_recovery(person_id, status);`);
      this.db.prepare('INSERT INTO registry_migrations (version, applied_at) VALUES (?, ?) ON CONFLICT(version) DO NOTHING').run(VERSION, now());
    });
  }
  transaction(fn) {
    if (this.inTransaction) return fn();
    this.db.exec('BEGIN IMMEDIATE');
    this.inTransaction = true;
    try {
      if (this.postgres) this.db.prepare('SELECT pg_advisory_xact_lock(?)').get(REGISTRY_LOCK);
      if (this.id) this.assertCurrent();
      const result = fn();
      if (result?.then) throw new Error('Registry transactions must be synchronous.');
      this.db.exec('COMMIT');
      return result;
    } catch (error) { try { this.db.exec('ROLLBACK'); } catch { /* Preserve the initiating error. */ } throw error; }
    finally { this.inTransaction = false; }
  }
  assertCurrent({ forServing = false } = {}) {
    let binding;
    try {
      const row = this.db.prepare('SELECT value FROM registry_meta WHERE key = ?').get('binding');
      binding = row && this.open(row.value, 'binding');
    } catch { fail('identity_runtime_stale', 'Restart the account service with its current verified configuration.', 503); }
    if (!binding || binding.id !== this.id || binding.issuer !== this.issuer || Number(binding.epoch || 1) !== this.epoch
      || (forServing && binding.ready === false)) fail('identity_runtime_stale', 'The account service configuration is not current or recovery is incomplete.', 503);
    return binding;
  }
  seal(value, purpose, key = this.key) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(`${this.issuer}\0${purpose}`));
    const body = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]).toString('base64');
  }
  open(value, purpose) {
    try {
      const bytes = Buffer.from(value, 'base64');
      const decipher = crypto.createDecipheriv('aes-256-gcm', this.key, bytes.subarray(0, 12));
      decipher.setAAD(Buffer.from(`${this.issuer}\0${purpose}`));
      decipher.setAuthTag(bytes.subarray(12, 28));
      return JSON.parse(Buffer.concat([decipher.update(bytes.subarray(28)), decipher.final()]).toString('utf8'));
    } catch { fail('identity_cipher_invalid', 'Registry secrets could not be verified with this issuer and key.', 409); }
  }
  audit(companyId, entityId, action, actor, details = {}) {
    const previous = this.db.prepare('SELECT sequence, hash FROM registry_audit ORDER BY sequence DESC LIMIT 1').get();
    const event = { sequence: Number(previous?.sequence || 0) + 1, companyId: companyId || null, entityId,
      action, actor: required(actor, 'Actor', 300), details, at: now(), previousHash: previous?.hash || '0'.repeat(64) };
    this.db.prepare('INSERT INTO registry_audit (sequence, company_id, entity_id, action, actor, details_json, created_at, previous_hash, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(event.sequence, event.companyId, entityId, action, event.actor, JSON.stringify(details), event.at, event.previousHash, hash(JSON.stringify(event)));
  }
  identityRow(id) { return this.db.prepare('SELECT * FROM registry_identities WHERE id = ?').get(id); }
  identity(id) { return safeIdentity(this.identityRow(id)); }
  verifyAudit() {
    let previousHash = '0'.repeat(64), sequence = 0;
    for (const row of this.db.prepare('SELECT * FROM registry_audit ORDER BY sequence').all()) {
      const event = { sequence: Number(row.sequence), companyId: row.company_id, entityId: row.entity_id, action: row.action,
        actor: row.actor, details: JSON.parse(row.details_json), at: row.created_at, previousHash: row.previous_hash };
      if (event.sequence !== ++sequence || event.previousHash !== previousHash || hash(JSON.stringify(event)) !== row.hash) return { valid: false, sequence };
      previousHash = row.hash;
    }
    return { valid: true, events: sequence, head: previousHash };
  }
  async derivePassword(value, salt) {
    if (this.passwordWork >= 2) fail('identity_busy', 'Please try again shortly.', 429);
    this.passwordWork += 1;
    try { return (await derive(value, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 })).toString('hex'); }
    finally { this.passwordWork -= 1; }
  }
  issueRecoveryCodes(personId) {
    this.db.prepare('DELETE FROM registry_recovery_codes WHERE person_id = ? AND used_at IS NULL').run(personId);
    const codes = Array.from({ length: 8 }, () => crypto.randomBytes(16).toString('hex'));
    for (const code of codes) this.db.prepare('INSERT INTO registry_recovery_codes (id, person_id, code_hash, created_at) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), personId, hash(`recovery\0${personId}\0${code}`), now());
    return codes.map(code => code.match(/.{1,4}/g).join('-'));
  }
  async register(input) {
    const login = loginName(input.loginName);
    const name = required(input.name, 'Name', 150);
    const email = input.email ? required(input.email, 'Contact email', 254) : null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('identity_email_invalid', 'Contact email is invalid.');
    if (input.privacyAccepted !== true) fail('identity_privacy_required', 'Confirm processing of your account details.');
    const salt = crypto.randomBytes(24).toString('hex');
    const digest = await this.derivePassword(password(input.password), salt);
    return this.transaction(() => {
      if (this.db.prepare('SELECT id FROM registry_identities WHERE login_name = ?').get(login)) fail('identity_registration_unavailable', 'This login name cannot be registered.', 409);
      const id = crypto.randomUUID(), at = now();
      this.db.prepare('INSERT INTO registry_identities (id, login_name, name, email, password_hash, salt, credential_version, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)')
        .run(id, login, name, email, digest, salt, 'active', at, at);
      const recoveryCodes = this.issueRecoveryCodes(id);
      this.audit(null, id, 'identity_registered', `person:${id}`, { privacyAcceptedAt: at });
      return { identity: this.identity(id), recoveryCodes };
    });
  }
  async checkPassword(login, suppliedPassword) {
    const normalized = loginName(login);
    const row = this.db.prepare('SELECT * FROM registry_identities WHERE login_name = ?').get(normalized);
    const candidate = typeof suppliedPassword === 'string' && suppliedPassword.length <= 200 ? suppliedPassword : '';
    const digest = await this.derivePassword(candidate, row?.salt || 'invalid-identity-constant-salt');
    if (!row || row.status !== 'active' || !equal(digest, row.password_hash)) fail('identity_login_failed', 'Sign-in failed.', 401);
    return row;
  }
  async login(input) {
    const verified = await this.checkPassword(input.loginName, input.password);
    return this.transaction(() => {
      const current = this.identityRow(verified.id);
      if (!current || current.status !== 'active' || current.password_hash !== verified.password_hash) fail('identity_login_failed', 'Sign-in failed.', 401);
      const token = crypto.randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 8 * 3600000).toISOString();
      this.db.prepare('DELETE FROM registry_sessions WHERE expires_at <= ?').run(now());
      this.db.prepare('INSERT INTO registry_sessions (token_hash, person_id, credential_version, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
        .run(hash(token), current.id, current.credential_version, expiresAt, now());
      this.audit(null, current.id, 'identity_signed_in', `person:${current.id}`);
      return { token, expiresAt, identity: safeIdentity(current) };
    });
  }
  session(token) {
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(token)) return null;
    const session = this.db.prepare('SELECT * FROM registry_sessions WHERE token_hash = ? AND expires_at > ?').get(hash(token), now());
    const identity = session && this.identityRow(session.person_id);
    return identity?.status === 'active' && Number(identity.credential_version) === Number(session.credential_version) ? safeIdentity(identity) : null;
  }
  logout(token) { if (typeof token === 'string') this.db.prepare('DELETE FROM registry_sessions WHERE token_hash = ?').run(hash(token)); }
  revokeIdentitySessions(personId) {
    this.db.prepare('DELETE FROM registry_sessions WHERE person_id = ?').run(personId);
    this.db.prepare('DELETE FROM registry_oidc_models WHERE account_id = ?').run(personId);
  }
  async recover(input) {
    const login = loginName(input.loginName);
    const assisted = String(input.recoveryCode || '').trim().match(/^CIR\.([a-f0-9-]{36})\.([A-Za-z0-9_-]{43})$/);
    if (assisted) return this.redeemAssistedRecovery(login, input.password, assisted[1], assisted[2]);
    const code = String(input.recoveryCode || '').replaceAll('-', '').toLowerCase();
    if (!/^[a-f0-9]{32}$/.test(code)) fail('identity_recovery_failed', 'Account recovery failed.', 401);
    const row = this.db.prepare('SELECT * FROM registry_identities WHERE login_name = ?').get(login);
    const retained = row && this.db.prepare('SELECT id FROM registry_recovery_codes WHERE person_id = ? AND code_hash = ? AND used_at IS NULL').get(row.id, hash(`recovery\0${row.id}\0${code}`));
    const salt = crypto.randomBytes(24).toString('hex');
    const digest = await this.derivePassword(password(input.password), salt);
    return this.transaction(() => {
      const current = row && this.identityRow(row.id);
      if (!retained || current?.status !== 'active' || current.credential_version !== row.credential_version
        || this.db.prepare('UPDATE registry_recovery_codes SET used_at = ? WHERE id = ? AND used_at IS NULL').run(now(), retained.id).changes !== 1) {
        fail('identity_recovery_failed', 'Account recovery failed.', 401);
      }
      this.db.prepare('UPDATE registry_identities SET password_hash = ?, salt = ?, credential_version = credential_version + 1, updated_at = ? WHERE id = ?').run(digest, salt, now(), row.id);
      this.revokeIdentitySessions(row.id);
      this.db.prepare("UPDATE registry_assisted_recovery SET status = 'revoked' WHERE person_id = ? AND status = 'open'").run(row.id);
      this.audit(null, row.id, 'identity_recovered', `person:${row.id}`, { sessionsRevoked: true, membershipChanges: false });
      return { recovered: true };
    });
  }
  issueAssistedRecovery(personId, input, actor) {
    const reference = required(input.reference, 'Independent identity-verification reference', 1000);
    const deliveryReference = required(input.deliveryReference, 'Verified private delivery-channel reference', 1000);
    const operator = required(actor, 'Registry recovery operator', 200);
    if (input.confirmation !== 'AUTHORIZE_PERSON_RECOVERY') fail('identity_recovery_confirmation', 'Explicitly authorize the person recovery.');
    const expectedLogin = loginName(input.expectedLoginName);
    return this.transaction(() => {
      const row = this.identityRow(personId);
      if (!row || row.login_name !== expectedLogin || !['active', 'recovery_required'].includes(row.status)) fail('identity_recovery_person_invalid', 'Review the exact person ID and login name before issuing recovery.', 409);
      this.db.prepare("UPDATE registry_assisted_recovery SET status = 'revoked' WHERE person_id = ? AND status = 'open'").run(personId);
      const id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('base64url'), createdAt = now();
      const expiresAt = new Date(Date.now() + 30 * 60000).toISOString();
      this.db.prepare(`INSERT INTO registry_assisted_recovery
        (id, person_id, token_hash, credential_version, status, actor, reference, delivery_reference, expires_at, created_at)
        VALUES (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`).run(id, personId, hash(`assisted\0${personId}\0${token}`), row.credential_version, operator, reference, deliveryReference, expiresAt, createdAt);
      this.audit(null, personId, 'assisted_recovery_authorized', operator, { recoveryId: id, reference, deliveryReference, expiresAt, credentialVersion: row.credential_version });
      return { id, personId, loginName: row.login_name, recoveryCode: `CIR.${id}.${token}`, expiresAt, shownOnce: true };
    });
  }
  async redeemAssistedRecovery(login, suppliedPassword, id, token) {
    const row = this.db.prepare('SELECT * FROM registry_identities WHERE login_name = ?').get(login);
    const salt = crypto.randomBytes(24).toString('hex'), digest = await this.derivePassword(password(suppliedPassword), salt);
    return this.transaction(() => {
      const current = row && this.identityRow(row.id);
      const request = current && this.db.prepare("SELECT * FROM registry_assisted_recovery WHERE id = ? AND person_id = ? AND token_hash = ? AND status = 'open' AND expires_at > ?")
        .get(id, current.id, hash(`assisted\0${current.id}\0${token}`), now());
      if (!request || !['active', 'recovery_required'].includes(current.status) || request.credential_version !== current.credential_version
        || this.db.prepare("UPDATE registry_assisted_recovery SET status = 'used', used_at = ? WHERE id = ? AND status = 'open'").run(now(), id).changes !== 1) {
        fail('identity_recovery_failed', 'Account recovery failed.', 401);
      }
      this.db.prepare("UPDATE registry_identities SET password_hash = ?, salt = ?, credential_version = credential_version + 1, status = 'active', updated_at = ? WHERE id = ?")
        .run(digest, salt, now(), current.id);
      this.revokeIdentitySessions(current.id);
      this.db.prepare("UPDATE registry_assisted_recovery SET status = 'revoked' WHERE person_id = ? AND status = 'open'").run(current.id);
      const recoveryCodes = this.issueRecoveryCodes(current.id);
      this.audit(null, current.id, 'assisted_recovery_completed', `person:${current.id}`, { recoveryId: id, sessionsRevoked: true, membershipChanges: false });
      return { recovered: true, recoveryCodes };
    });
  }
  revokeAssistedRecovery(personId, id, reference, actor) {
    const reason = required(reference, 'Recovery revocation reference', 1000), operator = required(actor, 'Recovery operator', 200);
    return this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM registry_assisted_recovery WHERE id = ? AND person_id = ?').get(id, personId);
      if (!row) fail('identity_recovery_request_missing', 'Recovery request not found for this person.', 404);
      if (row.status === 'open') {
        this.db.prepare("UPDATE registry_assisted_recovery SET status = 'revoked' WHERE id = ?").run(id);
        this.audit(null, personId, 'assisted_recovery_revoked', operator, { recoveryId: id, reference: reason });
      }
      return { id, status: row.status === 'open' ? 'revoked' : row.status };
    });
  }
  company(id) {
    const row = this.db.prepare('SELECT * FROM registry_companies WHERE id = ?').get(id);
    if (!row) fail('identity_company_missing', 'Company environment was not found.', 404);
    return { id: row.id, ledgerId: row.ledger_id, name: row.name, origin: row.origin, clientId: row.client_id, status: row.status };
  }
  companyForClient(clientId) {
    const row = this.db.prepare("SELECT id FROM registry_companies WHERE client_id = ? AND status = 'active'").get(clientId);
    return row ? this.company(row.id) : null;
  }
  configureCompany(input, actor = 'registry_configuration') {
    const id = normalizeCompanyId(input.id);
    if (!id) fail('identity_company_invalid', 'Company id is required.');
    const ledgerId = required(input.ledgerId, 'Ledger id', 36);
    if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/.test(ledgerId)) fail('identity_company_invalid', 'Ledger id is invalid.');
    const origin = originUrl(input.origin, this.allowLoopback);
    if (origin === this.issuer) fail('identity_origin_conflict', 'Identity and company environments require separate origins.');
    const name = required(input.name, 'Company name', 150), clientId = required(input.clientId, 'OIDC client id', 120);
    if (!/^[A-Za-z0-9._-]{3,120}$/.test(clientId)) fail('identity_client_invalid', 'Use a valid company client identifier.');
    const secret = required(input.clientSecret, 'OIDC client secret', 300);
    if (secret.length < 32) fail('identity_client_secret_invalid', 'Use an independent client secret of at least 32 characters.');
    return this.transaction(() => {
      const existing = this.db.prepare('SELECT * FROM registry_companies WHERE id = ?').get(id);
      if (existing) {
        if (existing.ledger_id !== ledgerId || existing.origin !== origin || existing.client_id !== clientId || !equal(existing.client_secret_hash, hash(secret))) {
          fail('identity_company_binding_conflict', 'Company binding cannot be silently replaced. Use a reviewed migration.', 409);
        }
        return this.company(id);
      }
      this.db.prepare('INSERT INTO registry_companies (id, ledger_id, name, origin, client_id, client_secret_hash, sealed_client_secret, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, ledgerId, name, origin, clientId, hash(secret), this.seal(secret, `client:${clientId}`), 'active', now(), now());
      this.audit(id, id, 'company_registered', actor, { ledgerId, origin, clientId });
      return this.company(id);
    });
  }
  authenticateCompany(clientId, secret) {
    const row = this.db.prepare('SELECT * FROM registry_companies WHERE client_id = ?').get(String(clientId || ''));
    if (!row || row.status !== 'active' || !equal(row.client_secret_hash, hash(String(secret || '')))) fail('identity_service_unauthorized', 'Company authentication failed.', 401);
    return this.company(row.id);
  }
  oidcClients() {
    return this.db.prepare("SELECT * FROM registry_companies WHERE status = 'active' ORDER BY id").all().map(row => ({
      client_id: row.client_id, client_secret: this.open(row.sealed_client_secret, `client:${row.client_id}`),
      client_name: row.name, redirect_uris: [`${row.origin}/api/auth/identity/callback`],
      grant_types: ['authorization_code'], response_types: ['code'], token_endpoint_auth_method: 'client_secret_basic',
    }));
  }
  access(role, workerId) {
    if (!ROLES.has(role)) fail('identity_role_invalid', 'Select a supported company role.');
    if (role === 'field_worker') return { role, workerId: required(workerId, 'Reviewed worker id', 150) };
    if (workerId) fail('identity_scope_invalid', 'Only field membership can bind a worker record.');
    return { role, workerId: null };
  }
  invitation(row, includeContact = false) {
    return { id: row.id, company: this.company(row.company_id), role: row.role, workerId: includeContact ? row.worker_id : undefined,
      contactHint: includeContact ? row.contact_hint : undefined, status: row.status, expiresAt: row.expires_at, createdAt: row.created_at };
  }
  createInvitation(companyId, input, actor) {
    this.company(companyId);
    const access = this.access(input.role, input.workerId);
    const reference = required(input.reference, 'Invitation verification reference', 1000);
    if (access.role === 'owner' && input.confirmation !== 'INVITE_COMPANY_OWNER') fail('identity_owner_confirmation', 'Confirm the owner invitation explicitly.');
    const contact = input.contactHint ? required(input.contactHint, 'Contact hint', 254) : null;
    return this.transaction(() => {
      const id = crypto.randomUUID(), token = crypto.randomBytes(32).toString('base64url');
      const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
      this.db.prepare('INSERT INTO registry_invitations (id, company_id, token_hash, role, worker_id, contact_hint, reference, status, expires_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .run(id, companyId, hash(token), access.role, access.workerId, contact, reference, 'open', expiresAt, now(), now());
      this.audit(companyId, id, 'invitation_created', actor, { role: access.role, workerId: access.workerId, reference });
      return { invitation: this.invitation(this.db.prepare('SELECT * FROM registry_invitations WHERE id = ?').get(id), true),
        invitationUrl: `${this.issuer}/identity.html#invite=${token}`, shownOnce: true };
    });
  }
  invitationByToken(token) {
    if (typeof token !== 'string' || !/^[a-zA-Z0-9_-]{43}$/.test(token)) fail('identity_invitation_unavailable', 'The invitation is invalid or no longer available.', 404);
    const row = this.db.prepare('SELECT * FROM registry_invitations WHERE token_hash = ?').get(hash(token));
    if (!row || row.status !== 'open' || row.expires_at <= now() || this.company(row.company_id).status !== 'active') fail('identity_invitation_unavailable', 'The invitation is invalid or no longer available.', 404);
    return row;
  }
  inspectInvitation(token) { return this.invitation(this.invitationByToken(token)); }
  claimInvitation(token, personId) {
    return this.transaction(() => {
      if (this.identity(personId)?.status !== 'active') fail('identity_login_required', 'Sign in first.', 401);
      const invite = this.invitationByToken(token);
      if (this.db.prepare('SELECT id FROM registry_memberships WHERE company_id = ? AND person_id = ?').get(invite.company_id, personId)) {
        fail('identity_membership_exists', 'This company relationship already exists. Ask the company to review its status.', 409);
      }
      const id = crypto.randomUUID(), at = now();
      this.db.prepare('INSERT INTO registry_memberships (id, company_id, person_id, status, role, worker_id, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)')
        .run(id, invite.company_id, personId, 'requested', invite.role, invite.worker_id, at, at);
      this.db.prepare('UPDATE registry_invitations SET status = ?, claimed_by = ?, updated_at = ? WHERE id = ?').run('claimed', personId, at, invite.id);
      this.audit(invite.company_id, id, 'membership_requested', `person:${personId}`, { invitationId: invite.id, role: invite.role });
      return this.membership(invite.company_id, id);
    });
  }
  membership(companyId, id) {
    const row = this.db.prepare('SELECT * FROM registry_memberships WHERE id = ? AND company_id = ?').get(id, companyId);
    if (!row) fail('identity_membership_missing', 'Membership was not found in this company.', 404);
    return { id: row.id, companyId: row.company_id, identity: this.identity(row.person_id), status: row.status, role: row.role,
      workerId: row.worker_id, version: Number(row.version), reference: row.reference, admittedAt: row.admitted_at, updatedAt: row.updated_at };
  }
  companyRegister(companyId) {
    return { company: this.company(companyId), memberships: this.db.prepare('SELECT id FROM registry_memberships WHERE company_id = ? ORDER BY created_at DESC LIMIT 500').all(companyId).map(row => this.membership(companyId, row.id)),
      invitations: this.db.prepare('SELECT * FROM registry_invitations WHERE company_id = ? ORDER BY created_at DESC LIMIT 500').all(companyId).map(row => this.invitation(row, true)) };
  }
  memberships(personId) {
    return this.db.prepare('SELECT id, company_id FROM registry_memberships WHERE person_id = ? ORDER BY created_at LIMIT 500').all(personId).map(row => {
      const member = this.membership(row.company_id, row.id);
      return { id: member.id, company: this.company(row.company_id), status: member.status, role: member.role, version: member.version };
    });
  }
  activeMembership(companyId, personId) {
    const row = this.db.prepare("SELECT id FROM registry_memberships WHERE company_id = ? AND person_id = ? AND status = 'active'").get(companyId, personId);
    return row && this.company(companyId).status === 'active' && this.identity(personId)?.status === 'active' ? this.membership(companyId, row.id) : null;
  }
  decideMembership(companyId, id, input, actor) {
    const reference = required(input.reference, 'Admission or revocation evidence', 1000);
    if (!MEMBER_STATES.has(input.status)) fail('identity_membership_status_invalid', 'Select active, suspended or revoked.');
    return this.transaction(() => {
      const previous = this.membership(companyId, id);
      if (!Number.isInteger(input.expectedVersion) || previous.version !== input.expectedVersion) fail('identity_membership_stale', 'Membership changed. Refresh before deciding.', 409);
      if (previous.identity.status !== 'active') fail('identity_person_inactive', 'The identity is not active.', 409);
      const access = this.access(input.role || previous.role, input.workerId === undefined ? previous.workerId : input.workerId);
      if (input.status === 'active' && access.role === 'owner' && input.confirmation !== 'ADMIT_COMPANY_OWNER') fail('identity_owner_confirmation', 'Confirm owner admission explicitly.');
      if (input.status === 'active' && access.workerId) {
        const occupied = this.db.prepare("SELECT id FROM registry_memberships WHERE company_id = ? AND worker_id = ? AND status = 'active' AND id <> ?").get(companyId, access.workerId, id);
        if (occupied) fail('identity_worker_already_linked', 'This worker record already has an active person membership.', 409);
      }
      const at = now();
      this.db.prepare('UPDATE registry_memberships SET status = ?, role = ?, worker_id = ?, version = version + 1, reference = ?, admitted_at = ?, updated_at = ? WHERE id = ?')
        .run(input.status, access.role, access.workerId, reference, input.status === 'active' ? at : previous.admittedAt, at, id);
      const company = this.company(companyId);
      this.db.prepare('DELETE FROM registry_oidc_models WHERE client_id = ? AND account_id = ? AND model <> ?').run(company.clientId, previous.identity.id, 'Session');
      this.audit(companyId, id, `membership_${input.status}`, actor, { previousStatus: previous.status, role: access.role, workerId: access.workerId, version: previous.version + 1, reference });
      return this.membership(companyId, id);
    });
  }
  revokeInvitation(companyId, id, actor) {
    return this.transaction(() => {
      const row = this.db.prepare('SELECT * FROM registry_invitations WHERE id = ? AND company_id = ?').get(id, companyId);
      if (!row) fail('identity_invitation_unavailable', 'Invitation not found.', 404);
      if (row.status === 'open') {
        this.db.prepare('UPDATE registry_invitations SET status = ?, updated_at = ? WHERE id = ?').run('revoked', now(), id);
        this.audit(companyId, id, 'invitation_revoked', actor);
      }
      return { revoked: row.status !== 'claimed', alreadyClaimed: row.status === 'claimed' };
    });
  }
  rateLimit(subject, limit = 20) {
    const key = crypto.createHmac('sha256', this.key).update(subject).digest('hex');
    return this.transaction(() => {
      const at = now();
      this.db.prepare('DELETE FROM registry_rate_windows WHERE expires_at <= ?').run(at);
      const row = this.db.prepare('SELECT * FROM registry_rate_windows WHERE key = ?').get(key);
      if (row && Number(row.count) >= limit) return false;
      if (!row && Number(this.db.prepare('SELECT COUNT(*) AS n FROM registry_rate_windows').get().n) >= 10000) return false;
      this.db.prepare('INSERT INTO registry_rate_windows (key, count, expires_at) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = registry_rate_windows.count + 1')
        .run(key, new Date(Date.now() + 10 * 60000).toISOString());
      return true;
    });
  }
  close() { this.db.close(); }
}

module.exports = { IdentityRegistry, VERSION, ROLES, fail, hash, equal, originUrl, keyBuffer, tableExists, registryOptions };
