const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { stableJson } = require('./backup-manifest');
const { readCompanyRuntime, assertSameCompany } = require('./company-runtime');

const FORMAT = 'contractor-company-handover/v1';
const KEY_FORMAT = 'contractor-company-authority-key/v1';
const STATES = new Set(['active', 'frozen', 'staged', 'retired']);
const UUID = /^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/;
const digest = value => crypto.createHash('sha256').update(typeof value === 'string' || Buffer.isBuffer(value) ? value : stableJson(value)).digest('hex');
function fail(code, message) { throw Object.assign(new Error(message), { code, statusCode: 409 }); }
function reference(value, label = 'Reference') {
  if (typeof value !== 'string' || !value.trim() || value.length > 1000 || [...value].some(c => c.charCodeAt(0) < 32)) fail('authority_input_invalid', `${label} is required.`);
  return value.trim();
}
function exists(db) {
  return Boolean(db.prepare(typeof db.query === 'function'
    ? "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'company_authority'"
    : "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'company_authority'").get());
}
function publicKey(pem) {
  let key;
  try { key = crypto.createPublicKey(pem); } catch { fail('authority_key_invalid', 'An Ed25519 authority key is required.'); }
  if (key.asymmetricKeyType !== 'ed25519') fail('authority_key_invalid', 'Use an Ed25519 authority key.');
  return key.export({ type: 'spki', format: 'pem' }).toString();
}
function authorityKey(value) {
  if (!value || value.format !== KEY_FORMAT || !UUID.test(value.environmentId)) fail('authority_key_invalid', 'Invalid private environment key.');
  let privateKey;
  try { privateKey = crypto.createPrivateKey(value.privateKey); } catch { fail('authority_key_invalid', 'Invalid private environment key.'); }
  if (privateKey.asymmetricKeyType !== 'ed25519') fail('authority_key_invalid', 'Use an Ed25519 authority key.');
  return { format: KEY_FORMAT, environmentId: value.environmentId, privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString(), publicKey: publicKey(privateKey) };
}
function generateAuthorityKey() {
  const { privateKey } = crypto.generateKeyPairSync('ed25519');
  return authorityKey({ format: KEY_FORMAT, environmentId: crypto.randomUUID(), privateKey: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() });
}
function readPrivateKeyFile(file) {
  if (!file) return null;
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) fail('authority_key_invalid', 'Select a bounded private authority key file.');
  return authorityKey(JSON.parse(fs.readFileSync(file, 'utf8')));
}
function sign(body, key) {
  return { body, signature: crypto.sign(null, Buffer.from(stableJson(body)), authorityKey(key).privateKey).toString('base64') };
}
function verify(document, expectedPublicKey, kind) {
  if (!document || document.body?.format !== FORMAT || document.body?.kind !== kind || typeof document.signature !== 'string'
    || document.signature.length > 128 || Buffer.byteLength(stableJson(document)) > 65536) fail('authority_document_invalid', 'The handover document is invalid.');
  let valid = false;
  try { valid = crypto.verify(null, Buffer.from(stableJson(document.body)), publicKey(expectedPublicKey), Buffer.from(document.signature, 'base64')); } catch { /* Refuse malformed signatures. */ }
  if (!valid) fail('authority_signature_invalid', 'The handover signature could not be verified.');
  return document.body;
}
function targetOrigin(origin) {
  let url;
  try { url = new URL(origin); } catch { fail('authority_target_invalid', 'Choose an exact HTTPS target origin.'); }
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) fail('authority_target_invalid', 'Choose an exact HTTPS target origin.');
  return url.origin;
}
function targetDescription({ key, origin }) {
  const identity = authorityKey(key);
  return sign({ format: FORMAT, kind: 'target', environmentId: identity.environmentId, publicKey: identity.publicKey, mode: 'hosted', origin: targetOrigin(origin) }, identity);
}
function authorityMarkerFile(dbFile) {
  if (!dbFile || dbFile === ':memory:') fail('authority_marker_invalid', 'A persistent local ledger path is required.');
  return `${fs.existsSync(dbFile) ? fs.realpathSync(dbFile) : path.resolve(dbFile)}.authority.json`;
}
function readAuthorityMarker(dbFile) {
  if (!dbFile || dbFile === ':memory:') return null;
  const file = authorityMarkerFile(dbFile);
  let stat;
  try { stat = fs.lstatSync(file); } catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 8192) fail('authority_marker_invalid', 'The retained source authority marker needs review.');
  let marker;
  try { marker = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { fail('authority_marker_invalid', 'The retained source authority marker needs review.'); }
  if (marker?.format !== 'contractor-company-authority-marker/v1' || !UUID.test(marker.environmentId)
    || !Number.isSafeInteger(marker.minimumGeneration) || marker.minimumGeneration < 1 || !marker.company?.id || !marker.company?.ledgerId
    || publicKey(marker.publicKey) !== marker.publicKey) fail('authority_marker_invalid', 'The retained source authority marker needs review.');
  return marker;
}
function assertAuthorityMarker(db, marker) {
  if (!marker) return;
  const current = readAuthority(db);
  if (!current || current.environmentId !== marker.environmentId || current.publicKey !== marker.publicKey
    || current.generation < marker.minimumGeneration) fail('authority_rollback_blocked', 'The database predates its retained source authority marker. Inspect the handover before recovery.');
  assertSameCompany(marker.company, readCompanyRuntime(db));
}
function retainAuthorityMarker(dbFile, state) {
  const previous = readAuthorityMarker(dbFile);
  if (previous) {
    assertSameCompany(previous.company, state.details.company);
    if (previous.environmentId !== state.environmentId || previous.publicKey !== state.publicKey || previous.minimumGeneration > state.generation) {
      fail('authority_rollback_blocked', 'A source authority marker cannot change identity or move backwards.');
    }
  }
  const marker = { format: 'contractor-company-authority-marker/v1', company: state.details.company,
    environmentId: state.environmentId, publicKey: state.publicKey, minimumGeneration: state.generation };
  const file = authorityMarkerFile(dbFile), pending = `${file}.${crypto.randomUUID()}.pending`;
  // Advance outside the DB transaction first: an interrupted commit must fail closed.
  const handle = fs.openSync(pending, 'wx', 0o600);
  try { fs.writeFileSync(handle, `${JSON.stringify(marker)}\n`); fs.fsyncSync(handle); } finally { fs.closeSync(handle); }
  fs.renameSync(pending, file);
  if (process.platform !== 'win32') {
    const directory = fs.openSync(path.dirname(file), 'r');
    try { fs.fsyncSync(directory); } finally { fs.closeSync(directory); }
  }
  return marker;
}
function readAuthority(db) {
  if (!exists(db)) return null;
  const rows = db.prepare('SELECT * FROM company_authority').all();
  if (!rows.length) return null;
  const row = rows[0];
  if (rows.length !== 1 || row.id !== 'current' || !UUID.test(row.environment_id) || !STATES.has(row.status)
    || !Number.isSafeInteger(Number(row.generation)) || Number(row.generation) < 1) fail('authority_state_invalid', 'The environment authority record is invalid.');
  return { environmentId: row.environment_id, generation: Number(row.generation), status: row.status,
    publicKey: publicKey(row.public_key), transferId: row.transfer_id, details: JSON.parse(row.details_json), updatedAt: row.updated_at };
}
function assertAuthorityRuntime(db, key, mode, marker = null) {
  assertAuthorityMarker(db, marker);
  const current = readAuthority(db);
  if (!current) {
    if (key) fail('authority_binding_missing', 'A private environment key is configured but this database has no matching authority binding.');
    return null;
  }
  if (current.status !== 'active') fail('company_authority_blocked', `This environment is ${current.status}; use the documented handover procedure before starting it.`);
  const identity = key && authorityKey(key);
  if (!identity || identity.environmentId !== current.environmentId || identity.publicKey !== current.publicKey) fail('authority_key_mismatch', 'The private environment key does not match this ledger.');
  if (mode && current.details.mode !== mode) fail('authority_mode_mismatch', 'The ledger authority belongs to another operating mode.');
  if (!verifyAuthorityHistory(db).valid) fail('authority_history_invalid', 'The retained handover history could not be verified.');
  return current;
}
function migrateCompanyAuthority(db) {
  db.exec(`CREATE TABLE IF NOT EXISTS company_authority (
    id TEXT PRIMARY KEY CHECK(id = 'current'), environment_id TEXT NOT NULL,
    generation INTEGER NOT NULL, status TEXT NOT NULL, public_key TEXT NOT NULL,
    transfer_id TEXT, details_json TEXT NOT NULL, updated_at TEXT NOT NULL
  );`);
  db.exec(`CREATE TABLE IF NOT EXISTS company_authority_history (
    sequence INTEGER PRIMARY KEY, snapshot_json TEXT NOT NULL, previous_hash TEXT NOT NULL, event_hash TEXT NOT NULL
  );`);
  ensureAuthorityGuards(db);
}
function ensureAuthorityGuards(db) {
  if (!exists(db)) return false;
  const tables = db.prepare(typeof db.query === 'function'
    ? "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE'"
    : "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all();
  installAuthorityGuards(db, tables.map(row => row.name));
  return true;
}
function installAuthorityGuards(db, tables) {
  const postgres = typeof db.query === 'function';
  if (postgres) db.exec(`CREATE OR REPLACE FUNCTION contractor_company_write_guard() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF EXISTS (SELECT 1 FROM company_authority WHERE status <> 'active') THEN
        RAISE EXCEPTION 'company_authority_blocked' USING ERRCODE = '55000';
      END IF;
      RETURN NULL;
    END;
  $$;`);
  for (const name of tables) {
    if (['company_authority', 'company_authority_history', 'ledger_schema_migrations'].includes(name)) continue;
    if (!/^[a-z][a-z0-9_]*$/.test(name)) fail('authority_schema_invalid', 'An unexpected ledger table needs review.');
    if (postgres) {
      const exists = db.prepare(`SELECT 1 FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
        WHERE t.tgname=? AND c.relname=? AND NOT t.tgisinternal`).get('contractor_authority_guard', name);
      if (!exists) db.exec(`CREATE TRIGGER contractor_authority_guard BEFORE INSERT OR UPDATE OR DELETE OR TRUNCATE ON "${name}"
        FOR EACH STATEMENT EXECUTE FUNCTION contractor_company_write_guard();`);
    } else {
      for (const operation of ['INSERT', 'UPDATE', 'DELETE']) db.exec(`CREATE TRIGGER IF NOT EXISTS authority_${name}_${operation.toLowerCase()} BEFORE ${operation} ON "${name}"
        WHEN EXISTS (SELECT 1 FROM company_authority WHERE status <> 'active')
        BEGIN SELECT RAISE(ABORT, 'company_authority_blocked'); END;`);
    }
  }
}
function authorityRecord(value) {
  return { id: 'current', environment_id: value.environmentId, generation: value.generation, status: value.status,
    public_key: value.publicKey, transfer_id: value.transferId || null, details_json: JSON.stringify(value.details), updated_at: new Date().toISOString() };
}
function authorityHistoryRecord(record, previous) {
  const entry = { sequence: Number(previous?.sequence || 0) + 1, snapshot_json: JSON.stringify(record), previous_hash: previous?.event_hash || '0'.repeat(64) };
  return { ...entry, event_hash: digest(entry) };
}
function verifyAuthorityHistory(db) {
  if (!exists(db)) return { valid: true, events: 0 };
  let previous;
  for (const row of db.prepare('SELECT * FROM company_authority_history ORDER BY sequence').all()) {
    const expected = authorityHistoryRecord(JSON.parse(row.snapshot_json), previous);
    if (stableJson(expected) !== stableJson(row)) return { valid: false, sequence: row.sequence };
    previous = row;
  }
  const current = db.prepare('SELECT * FROM company_authority').all();
  if (current.length > 1 || (previous ? stableJson(JSON.parse(previous.snapshot_json)) !== stableJson(current[0]) : current.length > 0)) {
    return { valid: false, reason: 'authority_head_mismatch' };
  }
  return { valid: true, events: Number(previous?.sequence || 0), head: previous?.event_hash || '0'.repeat(64) };
}
function persist(db, value) {
  const record = authorityRecord(value);
  db.prepare(`INSERT INTO company_authority (id, environment_id, generation, status, public_key, transfer_id, details_json, updated_at)
    VALUES ('current', ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET
    environment_id = excluded.environment_id, generation = excluded.generation, status = excluded.status,
    public_key = excluded.public_key, transfer_id = excluded.transfer_id, details_json = excluded.details_json, updated_at = excluded.updated_at`)
    .run(record.environment_id, record.generation, record.status, record.public_key, record.transfer_id, record.details_json, record.updated_at);
  const previous = db.prepare('SELECT * FROM company_authority_history ORDER BY sequence DESC LIMIT 1').get();
  const event = authorityHistoryRecord(record, previous);
  db.prepare('INSERT INTO company_authority_history (sequence, snapshot_json, previous_hash, event_hash) VALUES (?, ?, ?, ?)')
    .run(event.sequence, event.snapshot_json, event.previous_hash, event.event_hash);
}
function transaction(db, callback) {
  db.exec('BEGIN IMMEDIATE');
  try {
    if (typeof db.query === 'function') db.prepare('SELECT pg_advisory_xact_lock(?)').get(2026091203);
    if (!verifyAuthorityHistory(db).valid) fail('authority_history_invalid', 'The retained handover history could not be verified.');
    const result = callback();
    if (result?.then) throw new Error('Authority transitions must be synchronous.');
    db.exec('COMMIT');
    return result;
  } catch (error) { try { db.exec('ROLLBACK'); } catch { /* Keep the original outcome. */ } throw error; }
}
function prepareSource(db, { key, target, company, actor, reason, beforeCommit }) {
  const identity = authorityKey(key), destination = verify(target, target?.body?.publicKey, 'target');
  if (!UUID.test(destination.environmentId) || destination.environmentId === identity.environmentId || destination.mode !== 'hosted') fail('authority_target_invalid', 'The target must be a separate hosted environment.');
  if (targetOrigin(destination.origin) !== destination.origin || publicKey(destination.publicKey) !== destination.publicKey) fail('authority_target_invalid', 'Use a canonical signed target description.');
  reference(actor, 'Operator'); reference(reason);
  if (!exists(db)) fail('authority_schema_required', 'Upgrade and verify the local ledger before handover.');
  assertSameCompany(company, readCompanyRuntime(db));
  return transaction(db, () => {
    const current = readAuthority(db);
    if (current) assertAuthorityRuntime(db, identity, 'local');
    const state = { environmentId: identity.environmentId, generation: (current?.generation || 0) + 1,
      status: 'frozen', publicKey: identity.publicKey, transferId: crypto.randomUUID(),
      details: { mode: 'local', company, target, actor, reason, preparedAt: new Date().toISOString() } };
    beforeCommit?.(state);
    persist(db, state);
    return readAuthority(db);
  });
}
function sealSourcePackage(db, { key, manifestSha256, backupId }) {
  const identity = authorityKey(key);
  if (!/^[a-f0-9]{64}$/.test(manifestSha256)) fail('authority_manifest_invalid', 'Verify the prepared backup manifest.');
  return transaction(db, () => {
    const current = readAuthority(db);
    if (!current || current.status !== 'frozen' || current.publicKey !== identity.publicKey || current.environmentId !== identity.environmentId) fail('authority_source_mismatch', 'Use the frozen source environment and its key.');
    if (current.details.permit) {
      if (current.details.permit.body.manifestSha256 !== manifestSha256) fail('authority_package_already_sealed', 'This transfer is already bound to another package.');
      return current.details.permit;
    }
    const permit = sign({ format: FORMAT, kind: 'prepared', company: current.details.company,
      transferId: current.transferId, generation: current.generation, sourceEnvironmentId: current.environmentId,
      sourcePublicKey: current.publicKey, target: current.details.target, manifestSha256, backupId }, identity);
    persist(db, { ...current, details: { ...current.details, permit } });
    return permit;
  });
}
function validatePreparedPackage({ sourceDb, permit, key, company, manifestSha256 }) {
  const frozen = readAuthority(sourceDb), identity = authorityKey(key);
  if (!frozen || frozen.status !== 'frozen') fail('authority_source_not_frozen', 'A handover needs a frozen source snapshot.');
  const prepared = verify(permit, frozen.publicKey, 'prepared');
  assertSameCompany(company, prepared.company);
  const target = verify(prepared.target, prepared.target?.body?.publicKey, 'target');
  if (prepared.transferId !== frozen.transferId || prepared.generation !== frozen.generation || prepared.sourceEnvironmentId !== frozen.environmentId
    || prepared.sourcePublicKey !== frozen.publicKey || prepared.manifestSha256 !== manifestSha256
    || digest(prepared.target) !== digest(frozen.details.target) || target.environmentId !== identity.environmentId || target.publicKey !== identity.publicKey) {
    fail('authority_package_mismatch', 'The transfer, snapshot or private target key does not match.');
  }
  return { environmentId: identity.environmentId, generation: frozen.generation + 1, status: 'staged', publicKey: identity.publicKey,
    transferId: frozen.transferId, details: { mode: 'hosted', origin: target.origin, company, permit } };
}
function retainTargetVerification(db, { key, result }) {
  return transaction(db, () => {
    const state = readAuthority(db), identity = authorityKey(key);
    if (!state || state.status !== 'staged' || state.publicKey !== identity.publicKey || state.environmentId !== identity.environmentId
      || result.manifestSha256 !== state.details.permit.body.manifestSha256 || result.diagnostics?.valid !== true || result.auditIntegrity?.valid !== true) fail('authority_target_unverified', 'The staged target has not passed migration verification.');
    const receipt = sign({ format: FORMAT, kind: 'verified', transferId: state.transferId, company: state.details.company,
      targetEnvironmentId: state.environmentId, targetGeneration: state.generation, manifestSha256: result.manifestSha256,
      databaseSha256: result.databaseSha256, migrationReceiptId: result.receiptId, evidenceFiles: result.evidenceFiles }, identity);
    if (state.details.receipt) {
      if (digest(state.details.receipt) !== digest(receipt)) fail('authority_receipt_mismatch', 'The retained target verification belongs to another result.');
      return state.details.receipt;
    }
    persist(db, { ...state, details: { ...state.details, receipt } });
    return receipt;
  });
}
function retireSource(db, { key, receipt, actor, reason, beforeCommit }) {
  const identity = authorityKey(key); reference(actor, 'Operator'); reference(reason);
  return transaction(db, () => {
    const state = readAuthority(db);
    if (!state || state.publicKey !== identity.publicKey || state.environmentId !== identity.environmentId) fail('authority_source_mismatch', 'Use the retained source key.');
    if (state.status === 'retired' && state.details.release && digest(state.details.receipt) === digest(receipt)) return state.details.release;
    if (state.status !== 'frozen' || !state.details.permit) fail('authority_source_not_frozen', 'Only the frozen, packaged source can release the target.');
    const verified = verify(receipt, state.details.target.body.publicKey, 'verified');
    assertSameCompany(verified.company, state.details.company);
    if (verified.transferId !== state.transferId || verified.targetEnvironmentId !== state.details.target.body.environmentId
      || verified.targetGeneration !== state.generation + 1 || verified.manifestSha256 !== state.details.permit.body.manifestSha256) fail('authority_receipt_mismatch', 'The verified target receipt belongs to another transfer.');
    const release = sign({ format: FORMAT, kind: 'released', transferId: state.transferId, company: state.details.company,
      sourceEnvironmentId: state.environmentId, targetEnvironmentId: verified.targetEnvironmentId,
      targetGeneration: verified.targetGeneration, receiptSha256: digest(receipt), releasedAt: new Date().toISOString(), actor, reason }, identity);
    const retired = { ...state, status: 'retired', generation: state.generation + 1, details: { ...state.details, receipt, release } };
    beforeCommit?.(retired);
    persist(db, retired);
    return release;
  });
}
function activateTarget(db, { key, release, actor, reason }) {
  const identity = authorityKey(key); reference(actor, 'Operator'); reference(reason);
  return transaction(db, () => {
    const state = readAuthority(db);
    if (!state || state.environmentId !== identity.environmentId || state.publicKey !== identity.publicKey || !state.details.receipt) fail('authority_target_unverified', 'Use the verified target environment and its key.');
    if (state.status === 'active' && digest(state.details.release) === digest(release)) return readAuthority(db);
    if (state.status !== 'staged') fail('authority_target_not_staged', 'Only a staged environment can be activated.');
    const proof = verify(release, state.details.permit.body.sourcePublicKey, 'released');
    assertSameCompany(proof.company, state.details.company);
    if (proof.transferId !== state.transferId || proof.targetEnvironmentId !== state.environmentId || proof.targetGeneration !== state.generation
      || proof.sourceEnvironmentId !== state.details.permit.body.sourceEnvironmentId || proof.receiptSha256 !== digest(state.details.receipt)) fail('authority_release_mismatch', 'The source release does not authorize this verified target.');
    persist(db, { ...state, status: 'active', details: { ...state.details, release, activatedAt: new Date().toISOString(), activatedBy: actor, activationReference: reason } });
    return readAuthority(db);
  });
}
function abortSource(db, { key, actor, reason, beforeCommit }) {
  const identity = authorityKey(key); reference(actor, 'Operator'); reference(reason);
  return transaction(db, () => {
    const state = readAuthority(db);
    if (!state || state.status !== 'frozen' || state.environmentId !== identity.environmentId || state.publicKey !== identity.publicKey) fail('authority_abort_forbidden', 'A released source can never be reopened by aborting its transfer.');
    const active = { ...state, status: 'active', generation: state.generation + 1,
      details: { ...state.details, abortedAt: new Date().toISOString(), abortedBy: actor, abortReference: reason } };
    beforeCommit?.(active);
    persist(db, active);
    return readAuthority(db);
  });

}

module.exports = { FORMAT, KEY_FORMAT, generateAuthorityKey, authorityKey, readPrivateKeyFile, targetDescription, sign, verify, digest,
  authorityMarkerFile, readAuthorityMarker, retainAuthorityMarker, assertAuthorityMarker,
  migrateCompanyAuthority, ensureAuthorityGuards, installAuthorityGuards, readAuthority, assertAuthorityRuntime, persist, authorityRecord, authorityHistoryRecord, verifyAuthorityHistory, prepareSource, sealSourcePackage,
  validatePreparedPackage, retainTargetVerification, retireSource, activateTarget, abortSource };
