const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { IdentityRegistry, VERSION, fail, hash, keyBuffer, originUrl } = require('./identity-registry');

const FORMAT = 'contractor-identity-recovery/v1';
const MAX_PLAIN_BYTES = 64 * 1024 * 1024;
const FIELDS = {
  registry_companies: ['id', 'ledger_id', 'name', 'origin', 'client_id', 'status', 'created_at', 'updated_at'],
  registry_identities: ['id', 'login_name', 'name', 'email', 'credential_version', 'status', 'created_at', 'updated_at'],
  registry_memberships: ['id', 'company_id', 'person_id', 'status', 'role', 'worker_id', 'version', 'reference', 'admitted_at', 'created_at', 'updated_at'],
  registry_invitations: ['id', 'company_id', 'role', 'worker_id', 'contact_hint', 'reference', 'status', 'expires_at', 'claimed_by', 'created_at', 'updated_at'],
  registry_audit: ['sequence', 'company_id', 'entity_id', 'action', 'actor', 'details_json', 'created_at', 'previous_hash', 'hash'],
};
const HEADER_FIELDS = ['format', 'snapshotId', 'registryId', 'issuer', 'version', 'epoch', 'createdAt', 'sourceKeyId'];
const MEMBERSHIP_STATES = new Set(['requested', 'active', 'suspended', 'revoked']);
const ROLES = new Set(['owner', 'approver', 'office_operator', 'field_worker']);
const COUNTERS = new Set(['sequence', 'credential_version', 'version']);
const NULLABLE = new Set(['email', 'worker_id', 'reference', 'admitted_at', 'contact_hint', 'claimed_by', 'company_id']);
function textInput(value, name, maximum = 1000) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum || [...value].some(character => character.charCodeAt(0) < 32)) fail('identity_recovery_input', `${name} is required.`);
  return value.trim();
}
function sameKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value) && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...keys].sort());
}
function auditHead(rows) {
  let previousHash = '0'.repeat(64), sequence = 0;
  for (const row of rows) {
    const event = { sequence: Number(row.sequence), companyId: row.company_id, entityId: row.entity_id,
      action: row.action, actor: row.actor, details: JSON.parse(row.details_json), at: row.created_at, previousHash: row.previous_hash };
    if (event.sequence !== ++sequence || event.previousHash !== previousHash || hash(JSON.stringify(event)) !== row.hash) fail('identity_backup_audit_invalid', 'The registry audit chain is invalid.', 409);
    previousHash = row.hash;
  }
  return { events: sequence, head: previousHash };
}
function counts(tables) { return Object.fromEntries(Object.entries(tables).map(([table, rows]) => [table, rows.length])); }
function headerBytes(header) { return Buffer.from(JSON.stringify(Object.fromEntries(HEADER_FIELDS.map(key => [key, header[key]])))); }
function readRecoveryTables(registry) {
  let bytes = 0;
  return Object.fromEntries(Object.entries(FIELDS).map(([table, fields]) => {
    const rows = [], cursorField = table === 'registry_audit' ? 'sequence' : 'id';
    let cursor;
    while (true) {
      const batch = registry.db.prepare(`SELECT ${fields.join(', ')} FROM ${table}${cursor === undefined ? '' : ` WHERE ${cursorField} > ?`} ORDER BY ${cursorField} LIMIT 256`)
        .all(...(cursor === undefined ? [] : [cursor]));
      for (const row of batch) {
        if (row[cursorField] == null) fail('identity_backup_identity_invalid', 'A registry row has no identity.');
        bytes += Buffer.byteLength(JSON.stringify(row)) + 1;
        if (bytes > MAX_PLAIN_BYTES) fail('identity_backup_too_large', 'Registry recovery data exceeds 64 MiB; no partial backup was created.', 413);
        rows.push(row);
      }
      if (batch.length < 256) break;
      cursor = batch.at(-1)[cursorField];
    }
    return [table, rows];
  }));
}

function validateSnapshot(snapshot, allowLoopback) {
  if (!sameKeys(snapshot, ['header', 'actor', 'reference', 'tables', 'audit']) || !sameKeys(snapshot.header, HEADER_FIELDS)
    || snapshot.header.format !== FORMAT || snapshot.header.version !== VERSION || !sameKeys(snapshot.tables, Object.keys(FIELDS))) {
    fail('identity_backup_format_invalid', 'Unsupported or incomplete registry recovery backup.');
  }
  const header = snapshot.header;
  if (!/^registry_[a-f0-9-]{36}$/.test(header.registryId) || !/^[a-f0-9-]{36}$/.test(header.snapshotId)
    || !/^[a-f0-9]{64}$/.test(header.sourceKeyId) || !Number.isSafeInteger(header.epoch) || header.epoch < 1
    || header.epoch >= 2147483646 || !Number.isFinite(Date.parse(header.createdAt)) || originUrl(header.issuer, allowLoopback) !== header.issuer) {
    fail('identity_backup_header_invalid', 'Registry recovery header is invalid.');
  }
  textInput(snapshot.actor, 'Recovery backup operator', 200); textInput(snapshot.reference, 'Backup reference');
  for (const [table, fields] of Object.entries(FIELDS)) {
    const rows = snapshot.tables[table];
    if (!Array.isArray(rows) || rows.length > 1000000) fail('identity_backup_rows_invalid', 'Registry recovery row count is invalid.');
    const ids = new Set();
    for (const row of rows) {
      if (!sameKeys(row, fields)) fail('identity_backup_columns_invalid', `Unexpected columns in ${table}.`);
      for (const [key, value] of Object.entries(row)) {
        if (COUNTERS.has(key) ? !Number.isSafeInteger(value) || value < 1 || value >= 2147483646
          : value === null ? !NULLABLE.has(key) || (key === 'company_id' && table !== 'registry_audit') : typeof value !== 'string') {
          fail('identity_backup_value_invalid', `Invalid registry value in ${table}.${key}.`);
        }
      }
      const id = table === 'registry_audit' ? row.sequence : row.id;
      if (id === null || ids.has(id)) fail('identity_backup_identity_invalid', 'Missing or duplicate recovery row identity.');
      ids.add(id);
    }
  }
  const companies = new Set(snapshot.tables.registry_companies.map(row => row.id));
  const people = new Set(snapshot.tables.registry_identities.map(row => row.id));
  for (const row of snapshot.tables.registry_companies) {
    if (!['active', 'suspended', 'revoked'].includes(row.status) || originUrl(row.origin, allowLoopback) !== row.origin
      || row.origin === header.issuer || !/^[A-Za-z0-9._-]{3,120}$/.test(row.client_id)) fail('identity_backup_company_invalid', 'Review the company bindings in this backup.');
  }
  for (const row of snapshot.tables.registry_identities) {
    if (!['active', 'recovery_required', 'suspended', 'revoked'].includes(row.status)) fail('identity_backup_person_invalid', 'Unsupported person state.');
  }
  for (const row of snapshot.tables.registry_memberships) {
    if (!companies.has(row.company_id) || !people.has(row.person_id) || !MEMBERSHIP_STATES.has(row.status) || !ROLES.has(row.role)
      || (row.role === 'field_worker' ? !row.worker_id : row.worker_id !== null)) fail('identity_backup_membership_invalid', 'A company membership is incomplete or inconsistent.');
  }
  for (const row of snapshot.tables.registry_invitations) {
    if (!companies.has(row.company_id) || (row.claimed_by && !people.has(row.claimed_by)) || !ROLES.has(row.role)
      || !['open', 'claimed', 'revoked'].includes(row.status)) fail('identity_backup_invitation_invalid', 'An invitation is inconsistent.');
  }
  const audit = auditHead(snapshot.tables.registry_audit);
  if (!sameKeys(snapshot.audit, ['events', 'head']) || audit.events !== snapshot.audit.events || audit.head !== snapshot.audit.head) fail('identity_backup_audit_invalid', 'The declared audit head does not match the backup.', 409);
  return { ...header, counts: counts(snapshot.tables), audit, credentialsIncluded: false, admissionRestored: false };
}

function createRegistryBackup(registry, { backupKey, actor, reference }) {
  const key = keyBuffer(backupKey);
  if (hash(key) === hash(registry.key)) fail('identity_backup_key_reuse', 'Use a backup key independent from the registry encryption key.');
  const snapshot = registry.transaction(() => {
    registry.assertCurrent({ forServing: true });
    const migrations = registry.db.prepare('SELECT version FROM registry_migrations ORDER BY version').all().map(row => row.version);
    if (JSON.stringify(migrations) !== JSON.stringify(['001_shared_identity_registry', VERSION])) fail('identity_backup_version_unsupported', 'Registry migrations are not supported by this recovery format.', 409);
    const tables = readRecoveryTables(registry);
    return { header: { format: FORMAT, snapshotId: crypto.randomUUID(), registryId: registry.id, issuer: registry.issuer,
      version: VERSION, epoch: registry.epoch, createdAt: new Date().toISOString(), sourceKeyId: hash(registry.key) },
    actor: textInput(actor, 'Backup operator', 200), reference: textInput(reference, 'Backup reference'), tables, audit: auditHead(tables.registry_audit) };
  });
  const summary = validateSnapshot(snapshot, registry.allowLoopback), plain = Buffer.from(JSON.stringify(snapshot));
  if (plain.length > MAX_PLAIN_BYTES) fail('identity_backup_too_large', 'Registry recovery backup exceeds the 64 MiB limit; no partial backup was created.', 413);
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(headerBytes(snapshot.header));
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const envelope = { header: snapshot.header, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: encrypted.toString('base64') };
  plain.fill(0);
  return { envelope, summary };
}

function decodeRegistryBackup(envelope, backupKey, { allowLoopback = false } = {}) {
  if (Buffer.isBuffer(envelope) || typeof envelope === 'string') {
    if (Buffer.byteLength(envelope) > MAX_PLAIN_BYTES * 2) fail('identity_backup_too_large', 'Registry recovery file exceeds its limit.', 413);
    try { envelope = JSON.parse(envelope.toString()); } catch { fail('identity_backup_format_invalid', 'Registry recovery file is not valid JSON.'); }
  }
  if (!sameKeys(envelope, ['header', 'iv', 'tag', 'ciphertext']) || !sameKeys(envelope.header, HEADER_FIELDS)
    || typeof envelope.ciphertext !== 'string' || envelope.ciphertext.length > MAX_PLAIN_BYTES * 1.4) fail('identity_backup_format_invalid', 'Invalid recovery envelope.');
  let plain;
  try {
    const iv = Buffer.from(envelope.iv, 'base64'), tag = Buffer.from(envelope.tag, 'base64'), body = Buffer.from(envelope.ciphertext, 'base64');
    if (iv.length !== 12 || tag.length !== 16 || body.length > MAX_PLAIN_BYTES) throw new Error('Invalid encryption parameters.');
    const cipher = crypto.createDecipheriv('aes-256-gcm', keyBuffer(backupKey), iv);
    cipher.setAAD(headerBytes(envelope.header)); cipher.setAuthTag(tag);
    plain = Buffer.concat([cipher.update(body), cipher.final()]);
  } catch { fail('identity_backup_unverified', 'The registry recovery backup or its key could not be authenticated.', 409); }
  let snapshot;
  try { snapshot = JSON.parse(plain.toString('utf8')); } catch { fail('identity_backup_format_invalid', 'The decrypted recovery document is invalid.'); }
  finally { plain.fill(0); }
  if (JSON.stringify(snapshot.header) !== JSON.stringify(envelope.header)) fail('identity_backup_header_invalid', 'The encrypted header does not match its envelope.');
  return { snapshot, summary: validateSnapshot(snapshot, allowLoopback) };
}

function readRegistryBackup(filename) {
  const stat = fs.statSync(filename);
  if (!stat.isFile() || stat.size > MAX_PLAIN_BYTES * 2) fail('identity_backup_file_invalid', 'Select a bounded registry recovery file.');
  return fs.readFileSync(filename);
}
function writePrivateExclusive(filename, value) {
  const absolute = path.resolve(filename), descriptor = fs.openSync(absolute, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, typeof value === 'string' || Buffer.isBuffer(value) ? value : `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  return absolute;
}
function newCompanyBindings(rows) {
  return rows.map(row => ({ id: row.id, ledgerId: row.ledger_id, name: row.name, origin: row.origin,
    clientId: row.client_id, clientSecret: crypto.randomBytes(40).toString('base64url') }));
}
function insertRows(registry, table, rows) {
  for (const row of rows) {
    const fields = Object.keys(row);
    registry.db.prepare(`INSERT INTO ${table} (${fields.join(', ')}) VALUES (${fields.map(() => '?').join(', ')})`).run(...fields.map(field => row[field]));
  }
}

function restoreRegistryBackup({ envelope, backupKey, target, expectedRegistryId, actor, reference, prepareBindings }) {
  const { snapshot, summary } = decodeRegistryBackup(envelope, backupKey, { allowLoopback: target.allowLoopback });
  const key = keyBuffer(target.encryptionKey), operator = textInput(actor, 'Restore operator', 200), reason = textInput(reference, 'Restore verification reference');
  if (summary.registryId !== expectedRegistryId || originUrl(target.issuer, target.allowLoopback) !== summary.issuer) fail('identity_restore_scope_mismatch', 'Verify the exact registry and issuer before recovery.', 409);
  if (hash(key) === summary.sourceKeyId || hash(key) === hash(keyBuffer(backupKey))) fail('identity_restore_fresh_key_required', 'Recovery needs a new independent registry encryption key.');
  if (typeof prepareBindings !== 'function') fail('identity_restore_bindings_required', 'Retain new private company bindings before committing recovery.');
  if (!target.databaseUrl) {
    if (!target.dbFile || target.dbFile === ':memory:') fail('identity_restore_target_required', 'Choose a new persistent recovery database.');
    const descriptor = fs.openSync(path.resolve(target.dbFile), 'wx', 0o600); fs.closeSync(descriptor);
  }
  const registry = new IdentityRegistry({ ...target, requireEmpty: true, initialReady: false });
  try {
    const bindings = newCompanyBindings(snapshot.tables.registry_companies), epoch = summary.epoch + 1;
    const bindingPath = prepareBindings(bindings);
    registry.transaction(() => {
      const bindingById = new Map(bindings.map(binding => [binding.id, binding]));
      insertRows(registry, 'registry_companies', snapshot.tables.registry_companies.map(row => ({ ...row,
        client_secret_hash: hash(bindingById.get(row.id).clientSecret), sealed_client_secret: registry.seal(bindingById.get(row.id).clientSecret, `client:${row.client_id}`) })));
      insertRows(registry, 'registry_identities', snapshot.tables.registry_identities.map(row => ({ ...row,
        status: ['active', 'recovery_required'].includes(row.status) ? 'recovery_required' : row.status,
        credential_version: row.credential_version + 1, password_hash: crypto.randomBytes(64).toString('hex'), salt: crypto.randomBytes(24).toString('hex') })));
      insertRows(registry, 'registry_memberships', snapshot.tables.registry_memberships.map(row => ({ ...row,
        status: row.status === 'revoked' ? 'revoked' : 'suspended', version: row.version + 1 })));
      insertRows(registry, 'registry_invitations', snapshot.tables.registry_invitations.map(row => ({ ...row,
        status: row.status === 'claimed' ? 'claimed' : 'revoked', token_hash: hash(crypto.randomBytes(32)) })));
      insertRows(registry, 'registry_audit', snapshot.tables.registry_audit);
      registry.audit(null, summary.registryId, 'registry_recovered_without_access', operator, {
        snapshotId: summary.snapshotId, sourceAuditHead: summary.audit.head, reference: reason, epoch, counts: summary.counts,
        passwordsRestored: false, recoveryCodesRestored: false, sessionsRestored: false, activeMembershipsRestored: false });
      const integrity = registry.verifyAudit();
      if (!integrity.valid || integrity.events !== summary.audit.events + 1) fail('identity_restore_audit_invalid', 'Recovery audit verification failed.', 409);
      for (const [table, count] of Object.entries(summary.counts)) {
        if (Number(registry.db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count) !== count + (table === 'registry_audit' ? 1 : 0)) fail('identity_restore_counts_invalid', 'Recovery row verification failed.', 409);
      }
      registry.db.prepare('UPDATE registry_meta SET value = ? WHERE key = ?').run(registry.seal({ id: summary.registryId, issuer: summary.issuer, epoch, ready: true }, 'binding'), 'binding');
    });
    registry.id = summary.registryId; registry.epoch = epoch;
    registry.assertCurrent({ forServing: true });
    return { registry, receipt: { valid: true, action: 'registry_restored', registryId: registry.id, snapshotId: summary.snapshotId,
      epoch, counts: summary.counts, bindingPath, credentialsRestored: false, admissionRestored: false, audit: registry.verifyAudit() } };
  } catch (error) { registry.close(); throw error; }
}

function rotateRegistryKeys(registry, { envelope, backupKey, newKey, actor, reference, prepareBindings }) {
  const { snapshot, summary } = decodeRegistryBackup(envelope, backupKey, { allowLoopback: registry.allowLoopback });
  const key = keyBuffer(newKey), operator = textInput(actor, 'Rotation operator', 200), reason = textInput(reference, 'Rotation verification reference');
  if (hash(key) === hash(registry.key) || hash(key) === hash(keyBuffer(backupKey))) fail('identity_rotation_fresh_key_required', 'Choose a new independent registry encryption key.');
  if (typeof prepareBindings !== 'function') fail('identity_rotation_bindings_required', 'Retain replacement private company bindings.');
  let receipt;
  registry.transaction(() => {
    registry.assertCurrent({ forServing: true });
    if (summary.registryId !== registry.id || summary.issuer !== registry.issuer || summary.epoch !== registry.epoch
      || summary.sourceKeyId !== hash(registry.key) || summary.audit.head !== registry.verifyAudit().head) {
      fail('identity_rotation_checkpoint_stale', 'The verified checkpoint is not current. Create and verify a new backup before rotating.', 409);
    }
    if (JSON.stringify(readRecoveryTables(registry)) !== JSON.stringify(snapshot.tables)) fail('identity_rotation_checkpoint_stale', 'Registry data changed since the recovery checkpoint.', 409);
    if (registry.db.prepare('SELECT key FROM registry_meta').all().some(row => !['binding', 'oidc_jwks'].includes(row.key))) fail('identity_rotation_metadata_unsupported', 'Review unrecognized encrypted registry metadata before rotation.', 409);
    const rows = registry.db.prepare('SELECT * FROM registry_companies ORDER BY id').all(), bindings = newCompanyBindings(rows);
    const bindingPath = prepareBindings(bindings), epoch = registry.epoch + 1;
    for (const binding of bindings) registry.db.prepare('UPDATE registry_companies SET client_secret_hash = ?, sealed_client_secret = ?, updated_at = ? WHERE id = ?')
      .run(hash(binding.clientSecret), registry.seal(binding.clientSecret, `client:${binding.clientId}`, key), new Date().toISOString(), binding.id);
    registry.db.exec("DELETE FROM registry_sessions; DELETE FROM registry_oidc_models; DELETE FROM registry_rate_windows; DELETE FROM registry_meta WHERE key = 'oidc_jwks'; UPDATE registry_assisted_recovery SET status = 'revoked' WHERE status = 'open'; UPDATE registry_invitations SET status = 'revoked' WHERE status = 'open';");
    registry.audit(null, registry.id, 'registry_keys_rotated', operator, { reference: reason, snapshotId: summary.snapshotId,
      sourceAuditHead: summary.audit.head, epoch, clientSecretsRotated: bindings.length, sessionsRevoked: true, passwordsChanged: false, membershipChanges: false });
    registry.db.prepare('UPDATE registry_meta SET value = ? WHERE key = ?').run(registry.seal({ id: registry.id, issuer: registry.issuer, epoch, ready: true }, 'binding', key), 'binding');
    receipt = { valid: true, action: 'registry_keys_rotated', registryId: registry.id, epoch, snapshotId: summary.snapshotId, bindingPath, clientSecretsRotated: bindings.length, sessionsRevoked: true, membershipChanges: false };
  });
  registry.key = key; registry.epoch = receipt.epoch;
  registry.assertCurrent({ forServing: true });
  return receipt;
}

module.exports = { FORMAT, FIELDS, MAX_PLAIN_BYTES, createRegistryBackup, decodeRegistryBackup, readRegistryBackup,
  restoreRegistryBackup, rotateRegistryKeys, writePrivateExclusive, validateSnapshot };
