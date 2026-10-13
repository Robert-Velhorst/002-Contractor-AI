const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { Client } = require('pg');
const {
  ContractorOperatingLedger,
  AUDIT_CHAIN_ID,
  AUDIT_CHAIN_GENESIS_HASH,
  auditEventHash,
  auditEventFromRow,
  verifyAuditChainRows,
  builtInInspectionTemplateRows
} = require('../operating-ledger');
const { createEvidenceStorage } = require('../evidence-storage');
const { PostgresSyncDatabase, resolvePostgresConnectionOptions } = require('../postgres-sync-database');
const { BACKUP_MANIFEST_V3, verifyBackupManifestAuthenticity } = require('../backup-manifest');
const { assertSameCompany, normalizeCompanyId, readCompanyRuntime } = require('../company-runtime');
const { readAuthority, validatePreparedPackage, authorityRecord, authorityHistoryRecord, retainTargetVerification, readPrivateKeyFile, verifyAuthorityHistory } = require('../company-authority');
const { readDocument, privateOutput } = require('../company-handover');

const projectRoot = path.resolve(__dirname, '..');
const MIGRATION_LOCK_ID = 2_024_070_013;
const OPERATOR_SESSION_TABLE = 'operator_sessions';
const MANAGED_OPERATOR_TABLE = 'managed_operator_accounts';
const AUTH_RATE_LIMIT_TABLE = 'auth_rate_limits';
const API_RATE_LIMIT_TABLE = 'api_rate_limits';

function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith('--')) continue;
    const key = value.slice(2);
    parsed[key] = values[index + 1] && !values[index + 1].startsWith('--') ? values[++index] : true;
  }
  return parsed;
}

function sha256Buffer(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function sha256File(file) {
  return sha256Buffer(fs.readFileSync(file));
}

function safeManifestTarget(root, manifestPath) {
  const normalized = String(manifestPath || '').replace(/\\/g, '/');
  const segments = normalized.split('/');
  if (!normalized || path.posix.isAbsolute(normalized) || segments.some(segment => !segment || segment === '.' || segment === '..')) {
    throw new Error(`Backup manifest contains an unsafe file path: ${manifestPath}`);
  }
  const target = path.resolve(root, ...segments);
  if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) {
    throw new Error(`Backup manifest contains an unsafe file path: ${manifestPath}`);
  }
  return target;
}

function isSqliteFile(file) {
  const descriptor = fs.openSync(file, 'r');
  try {
    const header = Buffer.alloc(16);
    return fs.readSync(descriptor, header, 0, header.length, 0) === header.length
      && header.equals(Buffer.from('SQLite format 3\0', 'binary'));
  } finally {
    fs.closeSync(descriptor);
  }
}

function verifyBackupDirectory(backupDirectory, options = {}) {
  const backupDir = path.resolve(backupDirectory);
  const manifestFile = path.join(backupDir, 'manifest.json');
  if (!fs.existsSync(manifestFile)) throw new Error('Backup manifest was not found.');
  const manifest = JSON.parse(fs.readFileSync(manifestFile, 'utf8'));
  if (![BACKUP_MANIFEST_V3, 'contractor-ai-backup-manifest/v2'].includes(manifest?.format) || manifest.databaseMode !== 'sqlite' || !Array.isArray(manifest.files)) {
    throw new Error('Hosted migration requires a signed SQLite contractor-ai-backup-manifest/v3 package.');
  }
  verifyBackupManifestAuthenticity(
    manifest,
    options.signingKey || process.env.CONTRACTOR_AI_BACKUP_SIGNING_KEY,
    { allowLegacyUnsigned: options.allowLegacyUnsigned === true }
  );
  const files = [];
  const seen = new Set();
  for (const entry of manifest.files) {
    const file = String(entry?.file || '').replace(/\\/g, '/');
    if (seen.has(file)) throw new Error(`Backup manifest contains a duplicate file path: ${file}`);
    seen.add(file);
    const target = safeManifestTarget(backupDir, file);
    if (!fs.existsSync(target)) throw new Error(`Backup file is missing: ${file}`);
    const stats = fs.lstatSync(target);
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error(`Backup file type is unsafe: ${file}`);
    if (stats.size !== Number(entry.bytes) || sha256File(target) !== entry.sha256) {
      throw new Error(`Backup checksum failed: ${file}`);
    }
    files.push({ ...entry, file, target });
  }
  const evidenceFiles = files.filter(entry => entry.file.startsWith('evidence/'));
  if (manifest.evidence?.included !== true || Number(manifest.evidence?.fileCount) !== evidenceFiles.length) {
    throw new Error('Backup evidence manifest is incomplete.');
  }
  const sqliteFiles = files.filter(entry => !entry.file.includes('/') && isSqliteFile(entry.target));
  if (sqliteFiles.length !== 1) throw new Error('Backup must contain exactly one top-level SQLite ledger database.');
  const source = new DatabaseSync(sqliteFiles[0].target, { readOnly: true });
  let company;
  try { company = readCompanyRuntime(source); } finally { source.close(); }
  if (manifest.company) assertSameCompany(manifest.company, company);
  return {
    company,
    backupDir,
    manifest,
    manifestHash: sha256File(manifestFile),
    files,
    evidenceFiles,
    ledgerFile: sqliteFiles[0].target
  };
}

function safeIdentifier(value) {
  const identifier = String(value || '');
  if (!/^[a-z_][a-z0-9_]*$/i.test(identifier)) throw new Error(`Unsafe database identifier: ${identifier}`);
  return identifier;
}

function quotedIdentifier(value) {
  return `"${safeIdentifier(value)}"`;
}

function sourceTableNames(database) {
  return database.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name <> 'ledger_schema_migrations'
    ORDER BY name
  `).all().map(row => safeIdentifier(row.name));
}

function sourceColumns(database, table) {
  return database.prepare(`PRAGMA table_info(${quotedIdentifier(table)})`).all().map(row => safeIdentifier(row.name));
}

function orderedSourceTables(database, tables) {
  const tableSet = new Set(tables);
  const dependencies = new Map(tables.map(table => [
    table,
    new Set(database.prepare(`PRAGMA foreign_key_list(${quotedIdentifier(table)})`).all()
      .map(row => safeIdentifier(row.table))
      .filter(dependency => dependency !== table && tableSet.has(dependency)))
  ]));
  const ordered = [];
  const pending = new Set(tables);
  while (pending.size) {
    const ready = [...pending].filter(table => [...dependencies.get(table)].every(dependency => !pending.has(dependency))).sort();
    if (!ready.length) throw new Error(`Ledger schema contains a foreign-key cycle: ${[...pending].sort().join(', ')}`);
    for (const table of ready) {
      ordered.push(table);
      pending.delete(table);
    }
  }
  return ordered;
}

function orderedSelfReferentialRows(database, table, rows) {
  const foreignKeys = database.prepare(`PRAGMA foreign_key_list(${quotedIdentifier(table)})`).all()
    .filter(row => safeIdentifier(row.table) === table)
    .map(row => ({ from: safeIdentifier(row.from), to: safeIdentifier(row.to) }));
  if (!foreignKeys.length || rows.length < 2) return rows;

  const dependencies = new Map(rows.map((row, index) => [index, new Set()]));
  for (const [index, row] of rows.entries()) {
    for (const foreignKey of foreignKeys) {
      const reference = row[foreignKey.from];
      if (reference === null || reference === undefined) continue;
      const dependencyIndex = rows.findIndex(candidate => candidate[foreignKey.to] === reference);
      if (dependencyIndex >= 0 && dependencyIndex !== index) dependencies.get(index).add(dependencyIndex);
    }
  }

  const ordered = [];
  const pending = new Set(rows.map((_, index) => index));
  while (pending.size) {
    const ready = [...pending].filter(index =>
      [...dependencies.get(index)].every(dependencyIndex => !pending.has(dependencyIndex))
    );
    if (!ready.length) throw new Error(`Ledger table ${table} contains a self-referential foreign-key cycle.`);
    for (const index of ready) {
      ordered.push(rows[index]);
      pending.delete(index);
    }
  }
  return ordered;
}

const PORTABLE_INTEGER_COLUMNS = new Set([
  'audit_chain_state.event_count',
  'audit_events.sequence_number'
]);

function canonicalValue(value, columnKey = '') {
  if (value === null || value === undefined) return null;
  if (PORTABLE_INTEGER_COLUMNS.has(columnKey) && /^\d+$/.test(String(value))) {
    const integer = Number(value);
    if (!Number.isSafeInteger(integer)) throw new Error(`Portable ledger integer exceeds the safe range: ${columnKey}`);
    return integer;
  }
  if (typeof value === 'bigint') return value.toString();
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) return `base64:${Buffer.from(value).toString('base64')}`;
  if (typeof value === 'number' && Object.is(value, -0)) return 0;
  return value;
}

function tableDigest(table, columns, rows) {
  const encodedRows = rows.map(row => JSON.stringify(columns.map(column => canonicalValue(row[column], `${table}.${column}`)))).sort();
  return sha256Buffer(Buffer.from(encodedRows.join('\n'), 'utf8'));
}

const RECONCILIATION_EXCLUDED_TABLES = new Set(['audit_events', 'audit_chain_state', 'company_authority', 'company_authority_history']);

function migrationReceiptId(backupId, manifestHash) {
  return `migration_${sha256Buffer(Buffer.from(`${backupId}\0${manifestHash}`)).slice(0, 24)}`;
}

async function verifyCommittedHostedMigration({ backupDir, databaseUrl, companyId, storage = null, signingKey, handover }) {
  if (!databaseUrl) throw new Error('A hosted PostgreSQL database URL is required.');
  const connection = resolvePostgresConnectionOptions(databaseUrl);
  if (connection.sslMode !== 'verify-full') throw new Error('Hosted migration verification requires PostgreSQL certificate and hostname verification with sslmode=verify-full.');
  const verification = verifyBackupDirectory(backupDir, { signingKey });
  const scopeCheck = new DatabaseSync(verification.ledgerFile, { readOnly: true });
  let targetAuthority;
  try {
    targetAuthority = validatePreparedPackage({ sourceDb: scopeCheck, permit: handover?.permit, key: handover?.key,
      company: verification.company, manifestSha256: verification.manifestHash });
  } finally { scopeCheck.close(); }
  assertSameCompany({ id: companyId || verification.company?.id, ledgerId: verification.company?.ledgerId }, verification.company);
  assertHostedCompanyStorage(companyId || verification.company?.id, storage);

  const ledger = new ContractorOperatingLedger({ databaseUrl, authorityMaintenance: true });
  try {
    const company = readCompanyRuntime(ledger.db);
    assertSameCompany(verification.company, company);
    const authority = readAuthority(ledger.db);
    if (!authority || authority.status !== 'staged' || authority.environmentId !== targetAuthority.environmentId
      || authority.publicKey !== targetAuthority.publicKey || authority.transferId !== targetAuthority.transferId
      || authority.generation !== targetAuthority.generation || authority.details.permit?.body?.manifestSha256 !== verification.manifestHash) {
      throw Object.assign(new Error('The hosted database is not the exact staged target for this signed backup and permit.'), { code: 'hosted_target_mismatch' });
    }
    if (!verifyAuthorityHistory(ledger.db).valid) throw Object.assign(new Error('Hosted authority history failed verification.'), { code: 'authority_history_invalid' });

    const receiptId = migrationReceiptId(verification.manifest.backupId, verification.manifestHash);
    const migrationEvent = ledger.db.prepare("SELECT * FROM audit_events WHERE id = ? AND entity_type = 'operational_migration' AND action = 'migrate_local_backup_to_hosted'").get(receiptId);
    if (!migrationEvent) throw Object.assign(new Error('The committed migration audit receipt was not found.'), { code: 'migration_receipt_missing' });
    const metadata = JSON.parse(migrationEvent.metadata_json || '{}');
    if (metadata.sourceBackupId !== verification.manifest.backupId || metadata.manifestSha256 !== verification.manifestHash
      || metadata.tables !== metadata.tableDigests?.length || !Array.isArray(metadata.evidenceSha256)) {
      throw Object.assign(new Error('The retained migration audit receipt does not bind complete reconciliation evidence.'), { code: 'migration_receipt_incomplete' });
    }
    const digestMaterial = metadata.tableDigests.map(item => `${item.table}:${item.rows}:${item.sha256}`).join('\n');
    if (sha256Buffer(Buffer.from(digestMaterial)) !== metadata.databaseSha256) throw Object.assign(new Error('The retained migration table-digest summary is invalid.'), { code: 'migration_receipt_invalid' });

    for (const item of metadata.tableDigests) {
      if (RECONCILIATION_EXCLUDED_TABLES.has(item.table)) continue;
      if (!/^[a-z][a-z0-9_]*$/.test(item.table) || !Array.isArray(item.columns) || !item.columns.length
        || item.columns.some(column => !/^[a-z][a-z0-9_]*$/.test(column)) || !Number.isSafeInteger(item.rows) || item.rows < 0
        || !/^[a-f0-9]{64}$/.test(item.sha256)) throw Object.assign(new Error('The retained per-table migration evidence is invalid.'), { code: 'migration_receipt_invalid' });
      const rows = ledger.db.prepare(`SELECT ${item.columns.map(quotedIdentifier).join(', ')} FROM ${quotedIdentifier(item.table)}`).all();
      if (rows.length !== item.rows || tableDigest(item.table, item.columns, rows) !== item.sha256) {
        throw Object.assign(new Error(`Hosted table reconciliation failed: ${item.table}.`), { code: 'migration_table_mismatch' });
      }
    }

    if (metadata.evidenceSha256.length && (!storage || typeof storage.read !== 'function')) {
      throw Object.assign(new Error('Hosted evidence verification requires the configured object-storage reader.'), { code: 'migration_evidence_verifier_required' });
    }
    for (const item of metadata.evidenceSha256) {
      if (typeof item.storageRef !== 'string' || !Number.isSafeInteger(item.bytes) || !/^[a-f0-9]{64}$/.test(item.sha256)) {
        throw Object.assign(new Error('The retained evidence migration record is invalid.'), { code: 'migration_receipt_invalid' });
      }
      const bytes = Buffer.from(await storage.read(item.storageRef));
      if (bytes.length !== item.bytes || sha256Buffer(bytes) !== item.sha256) {
        throw Object.assign(new Error(`Hosted evidence reconciliation failed: ${item.source || 'unknown source'}.`), { code: 'migration_evidence_mismatch' });
      }
    }

    const diagnostics = ledger.diagnose();
    if (!diagnostics.valid) throw Object.assign(new Error('Hosted ledger diagnostics failed during migration reconciliation.'), { code: 'migration_diagnostics_failed' });
    const auditIntegrity = ledger.verifyAuditIntegrity();
    if (!auditIntegrity.valid) throw Object.assign(new Error('Hosted audit-chain verification failed during migration reconciliation.'), { code: 'migration_audit_invalid' });
    const result = { manifestSha256: verification.manifestHash, databaseSha256: metadata.databaseSha256,
      receiptId, evidenceFiles: metadata.evidenceSha256.length, diagnostics: { valid: true }, auditIntegrity };
    const handoverReceipt = retainTargetVerification(ledger.db, { key: handover.key, result });
    return { success: true, reconciled: true, backupId: verification.manifest.backupId, receiptId,
      tablesVerified: metadata.tableDigests.length - metadata.tableDigests.filter(item => RECONCILIATION_EXCLUDED_TABLES.has(item.table)).length,
      evidenceFilesVerified: metadata.evidenceSha256.length, authorityStatus: authority.status, handoverReceipt };
  } finally { ledger.close(); }
}

function inferMimeType(filename) {
  const extension = path.extname(filename).toLowerCase();
  return {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  }[extension] || 'application/octet-stream';
}

function storageBasename(value) {
  return path.posix.basename(String(value || '').replace(/\\/g, '/'));
}

function replaceRetainedReferences(value, replacements) {
  if (typeof value === 'string') return replacements.get(value) || value;
  if (Array.isArray(value)) return value.map(item => replaceRetainedReferences(item, replacements));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, replaceRetainedReferences(item, replacements)]));
  }
  return value;
}

const IMMUTABLE_ISSUE_PACKAGE_TYPES = new Set([
  'quote_issue_package',
  'invoice_issue_package',
  'invoice_ubl_package',
  'credit_note_issue_package',
  'credit_note_ubl_package',
  'purchase_order_issue_package',
  'purchase_order_ubl_package',
  'change_order_issue_package',
  'handover_issue_package',
  'drawing_revision'
]);

const IMMUTABLE_SOURCE_JSON_COLUMNS = new Map([
  ['operational_recovery_cases', new Set(['snapshot_json'])],
  ['operational_recovery_commands', new Set(['response_json'])],
  ['work_balance_plans', new Set(['snapshot_json'])],
  ['work_balance_commands', new Set(['response_json'])],
  ['client_delivery_offers', new Set(['snapshot_json'])],
  ['client_delivery_responses', new Set(['snapshot_json'])],
  ['client_delivery_commands', new Set(['response_json'])],
  ['sds_sheets', new Set(['data_json', 'snapshot_json'])],
  ['work_deliveries', new Set(['snapshot_json'])],
  ['inspection_coverage_decisions', new Set(['snapshot_json'])],
  ['inspection_coverage_commands', new Set(['response_json'])],
  ['work_delivery_decisions', new Set(['snapshot_json'])],
  ['work_delivery_commands', new Set(['response_json'])],
  ['asset_service_events', new Set(['snapshot_json'])],
  ['asset_history_commands', new Set(['response_json'])]
]);

function rewriteRowReferences(table, row, columns, replacements) {
  const rewritten = { ...row };
  if (typeof rewritten.storage_ref === 'string' && replacements.has(rewritten.storage_ref)) {
    rewritten.storage_ref = replacements.get(rewritten.storage_ref);
  }
  const immutablePayload = table === 'documents' && IMMUTABLE_ISSUE_PACKAGE_TYPES.has(String(rewritten.type || '').toLowerCase());
  if (immutablePayload) return rewritten;
  const immutableColumns = IMMUTABLE_SOURCE_JSON_COLUMNS.get(table) || new Set();
  const sealedApproval = table === 'approvals' && ['client_delivery_offer', 'work_delivery_decision', 'inspection_coverage_decision', 'work_balance_plan'].includes(row.target_type);
  const sealedConversation = table === 'audit_events' && ['conversation_source', 'conversation_publication', 'conversation_analysis', 'client_delivery_offer', 'client_delivery_response'].includes(row.entity_type);
  for (const column of columns.filter(name => name.endsWith('_json') && !immutableColumns.has(name))) {
    // These values are reviewed content, not live storage pointers, even if text equals a filename.
    if ((sealedApproval && column === 'data_json') || sealedConversation) continue;
    if (typeof rewritten[column] !== 'string' || !rewritten[column].trim()) continue;
    try {
      rewritten[column] = JSON.stringify(replaceRetainedReferences(JSON.parse(rewritten[column]), replacements));
    } catch {
      throw new Error(`Ledger table contains invalid JSON in ${column}.`);
    }
  }
  return rewritten;
}

function invalidateWorkerSessionRows(rows, timestamp) {
  const activeCount = rows.filter(row => !row.revoked_at).length;
  return {
    activeCount,
    rows: rows.map(row => row.revoked_at ? row : ({
      ...row,
      revoked_at: timestamp,
      revocation_reason: 'hosted_environment_migration',
      updated_at: timestamp
    }))
  };
}

function postgresClientOptions(connectionString) {
  const resolved = resolvePostgresConnectionOptions(connectionString);
  return {
    connectionString: resolved.connectionString,
    ssl: resolved.ssl === false ? false : { rejectUnauthorized: resolved.rejectUnauthorized !== false }
  };
}

async function destinationTableNames(client) {
  const result = await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE' AND table_name <> 'ledger_schema_migrations'
    ORDER BY table_name
  `);
  return result.rows.map(row => safeIdentifier(row.table_name));
}

async function destinationColumns(client, table) {
  const result = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position
  `, [table]);
  return result.rows.map(row => safeIdentifier(row.column_name));
}

async function insertRows(client, table, columns, rows) {
  if (!rows.length) return;
  const batchSize = Math.max(1, Math.min(500, Math.floor(30_000 / Math.max(1, columns.length))));
  for (let offset = 0; offset < rows.length; offset += batchSize) {
    const batch = rows.slice(offset, offset + batchSize);
    const values = [];
    const tuples = batch.map(row => {
      const placeholders = columns.map(column => {
        values.push(row[column]);
        return `$${values.length}`;
      });
      return `(${placeholders.join(', ')})`;
    });
    await client.query(
      `INSERT INTO ${quotedIdentifier(table)} (${columns.map(quotedIdentifier).join(', ')}) VALUES ${tuples.join(', ')}`,
      values
    );
  }
}

const MIGRATION_SEED_COLUMNS = {
  evidence_storage_quota_lock: ['id'],
  work_context_control: ['id', 'revision'],
  inspection_templates: [
    'id',
    'template_key',
    'name',
    'inspection_type',
    'discipline',
    'version_number',
    'status',
    'items_json',
    'data_json'
  ]
};

async function prepareMigrationSeedTable(client, table, sourceIncludesTable) {
  const columns = MIGRATION_SEED_COLUMNS[table];
  if (!columns) return false;
  const destinationRows = (await client.query(
    `SELECT ${columns.map(quotedIdentifier).join(', ')} FROM ${quotedIdentifier(table)}`
  )).rows;
  if (!destinationRows.length) return false;
  const expectedRows = table === 'inspection_templates'
    ? builtInInspectionTemplateRows().map(row => Object.fromEntries(columns.map(column => [column, row[column]])))
    : table === 'evidence_storage_quota_lock' ? [{ id: 1 }]
    : table === 'work_context_control' ? [{ id: 'current', revision: 0 }] : [];
  const canonical = destinationRows.length === expectedRows.length
    && tableDigest(table, columns, destinationRows) === tableDigest(table, columns, expectedRows);
  if (!canonical) throw new Error(`Hosted migration target is not empty: ${table}`);
  if (sourceIncludesTable) await client.query(`DELETE FROM ${quotedIdentifier(table)}`);
  return true;
}

function verifySourceAuditChain(database) {
  const columns = sourceColumns(database, 'audit_events');
  if (!['sequence_number', 'previous_hash', 'event_hash'].every(column => columns.includes(column))) {
    return { supported: false, valid: null, status: 'legacy_unchained_backup' };
  }
  const retainedTables = new Set(sourceTableNames(database));
  const state = retainedTables.has('audit_chain_state')
    ? database.prepare('SELECT * FROM audit_chain_state WHERE chain_id = ?').get(AUDIT_CHAIN_ID) || null
    : null;
  const integrity = verifyAuditChainRows(database.prepare('SELECT * FROM audit_events').all(), state);
  if (!integrity.valid) {
    throw new Error(`Source backup audit chain failed integrity verification: ${integrity.failures.map(failure => failure.code).join(', ')}`);
  }
  return { supported: true, ...integrity };
}

async function rebuildHostedAuditChain(client) {
  const rows = (await client.query('SELECT * FROM audit_events ORDER BY created_at ASC, id ASC')).rows;
  await client.query('UPDATE audit_events SET sequence_number = NULL, previous_hash = NULL, event_hash = NULL');
  let previousHash = AUDIT_CHAIN_GENESIS_HASH;
  let sequenceNumber = 0;
  for (const row of rows) {
    sequenceNumber += 1;
    const eventHash = auditEventHash({
      ...auditEventFromRow(row),
      sequenceNumber,
      previousHash
    });
    await client.query(`
      UPDATE audit_events
      SET sequence_number = $1, previous_hash = $2, event_hash = $3
      WHERE id = $4
    `, [sequenceNumber, previousHash, eventHash, row.id]);
    previousHash = eventHash;
  }
  await client.query('DELETE FROM audit_chain_state WHERE chain_id = $1', [AUDIT_CHAIN_ID]);
  if (rows.length) {
    await client.query(`
      INSERT INTO audit_chain_state (chain_id, head_event_id, head_hash, event_count, updated_at)
      VALUES ($1, $2, $3, $4, $5)
    `, [AUDIT_CHAIN_ID, rows.at(-1).id, previousHash, sequenceNumber, new Date().toISOString()]);
  }
  return { eventCount: sequenceNumber, headEventId: rows.at(-1)?.id || null, headHash: previousHash };
}

async function appendHostedAuditEvent(client, event) {
  await client.query(`
    INSERT INTO audit_chain_state (chain_id, head_event_id, head_hash, event_count, updated_at)
    VALUES ($1, NULL, $2, 0, $3)
    ON CONFLICT (chain_id) DO NOTHING
  `, [AUDIT_CHAIN_ID, AUDIT_CHAIN_GENESIS_HASH, event.createdAt]);
  const state = (await client.query('SELECT * FROM audit_chain_state WHERE chain_id = $1 FOR UPDATE', [AUDIT_CHAIN_ID])).rows[0];
  if (!state) throw new Error('Hosted migration could not retain the audit chain state.');
  const sequenceNumber = Number(state.event_count || 0) + 1;
  const previousHash = state.head_hash || AUDIT_CHAIN_GENESIS_HASH;
  const eventHash = auditEventHash({ ...event, sequenceNumber, previousHash });
  await client.query(`
    INSERT INTO audit_events (
      id, entity_type, entity_id, job_id, action, actor,
      before_json, after_json, metadata_json, created_at,
      sequence_number, previous_hash, event_hash
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
  `, [
    event.id,
    event.entityType,
    event.entityId,
    event.jobId || null,
    event.action,
    event.actor,
    event.beforeJson,
    event.afterJson,
    event.metadataJson,
    event.createdAt,
    sequenceNumber,
    previousHash,
    eventHash
  ]);
  const advanced = await client.query(`
    UPDATE audit_chain_state
    SET head_event_id = $1, head_hash = $2, event_count = $3, updated_at = $4
    WHERE chain_id = $5 AND head_hash = $6 AND event_count = $7
  `, [event.id, eventHash, sequenceNumber, event.createdAt, AUDIT_CHAIN_ID, previousHash, Number(state.event_count || 0)]);
  if (advanced.rowCount !== 1) throw new Error('Hosted migration lost ownership of the audit chain head.');
  return { sequenceNumber, previousHash, eventHash };
}

async function migrateEvidence(verification, documents, storage, storedObjects = []) {
  if (!verification.evidenceFiles.length) return { replacements: new Map(), stored: storedObjects, files: [] };
  if (!storage || typeof storage.store !== 'function' || typeof storage.read !== 'function' || typeof storage.remove !== 'function') {
    throw new Error('Evidence migration requires a readable, writable, and removable hosted storage adapter.');
  }
  await storage.verify();
  const evidenceByBasename = new Map();
  for (const evidence of verification.evidenceFiles) {
    const basename = storageBasename(evidence.file);
    const matches = evidenceByBasename.get(basename) || [];
    matches.push(evidence);
    evidenceByBasename.set(basename, matches);
  }
  for (const document of documents) {
    if (!document.storage_ref || String(document.storage_ref).startsWith('s3://')) continue;
    const matches = evidenceByBasename.get(storageBasename(document.storage_ref)) || [];
    if (matches.length !== 1) throw new Error(`Document evidence could not be mapped uniquely: ${document.id}`);
  }

  const replacements = new Map();
  const files = [];
  for (const evidence of verification.evidenceFiles) {
    const relatedDocuments = documents.filter(document => storageBasename(document.storage_ref) === storageBasename(evidence.file));
    const originalName = relatedDocuments[0]?.filename || storageBasename(evidence.file);
    const mimeType = relatedDocuments[0]?.mime_type || inferMimeType(originalName);
    const buffer = fs.readFileSync(evidence.target);
    const result = await storage.store({ originalName, mimeType, size: buffer.length, buffer });
    storedObjects.push(result.storageRef);
    const retained = await storage.read(result.storageRef);
    if (!Buffer.from(retained).equals(buffer)) throw new Error(`Hosted evidence read-back verification failed: ${evidence.file}`);
    for (const document of relatedDocuments) {
      replacements.set(String(document.storage_ref), result.storageRef);
      replacements.set(storageBasename(document.storage_ref), result.filename);
    }
    files.push({ source: evidence.file, storageRef: result.storageRef, bytes: buffer.length, sha256: sha256Buffer(buffer) });
  }
  return { replacements, stored: storedObjects, files };
}

function assertHostedCompanyStorage(companyId, storage) {
  if (companyId && storage && !String(storage.prefix || '').startsWith(`companies/${companyId}/`)) {
    throw Object.assign(new Error('Hosted migration storage must use the source company object prefix.'), { code: 'company_storage_scope_mismatch' });
  }
}

function createHostedEvidenceStorageFromEnvironment(companyId) {
  const storage = createEvidenceStorage({
    mode: 's3',
    s3: {
      endpoint: process.env.CONTRACTOR_AI_S3_ENDPOINT,
      bucket: process.env.CONTRACTOR_AI_S3_BUCKET,
      region: process.env.CONTRACTOR_AI_S3_REGION || 'eu-central-1',
      accessKeyId: process.env.CONTRACTOR_AI_S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.CONTRACTOR_AI_S3_SECRET_ACCESS_KEY,
      prefix: process.env.CONTRACTOR_AI_S3_PREFIX || `companies/${companyId}/evidence`,
      timeoutMs: process.env.CONTRACTOR_AI_STORAGE_TIMEOUT_MS
    }
  });
  assertHostedCompanyStorage(companyId, storage);
  return storage;
}

async function migrateLocalBackupToHosted({ backupDir, databaseUrl, companyId, storage = null, actor = 'local_to_hosted_migration', signingKey, allowLegacyUnsigned = false, handover = null }) {
  if (!databaseUrl) throw new Error('A hosted PostgreSQL database URL is required.');
  const verification = verifyBackupDirectory(backupDir, { signingKey, allowLegacyUnsigned });
  const requiredCompanyId = normalizeCompanyId(companyId);
  if (requiredCompanyId && verification.company?.id !== requiredCompanyId) {
    throw Object.assign(new Error('The source backup is not bound to the configured hosted company. Upgrade and verify it locally before migration.'), { code: 'company_runtime_mismatch' });
  }
  assertHostedCompanyStorage(requiredCompanyId || verification.company?.id, storage);
  const scopeCheck = new DatabaseSync(verification.ledgerFile, { readOnly: true });
  let targetAuthority = null;
  try {
    if (handover) targetAuthority = validatePreparedPackage({ sourceDb: scopeCheck, permit: handover.permit, key: handover.key,
      company: verification.company, manifestSha256: verification.manifestHash });
    else if (readAuthority(scopeCheck)) throw Object.assign(new Error('A governed company snapshot requires its targeted handover permit.'), { code: 'authority_permit_required' });
  } finally { scopeCheck.close(); }
  const initializer = new ContractorOperatingLedger({ databaseUrl });
  const destinationMigrations = initializer.migrationStatus();
  initializer.close();

  const source = new DatabaseSync(verification.ledgerFile, { readOnly: true });
  const client = new Client(postgresClientOptions(databaseUrl));
  const uploadedObjects = [];
  let committed = false;
  let commitAttempted = false;
  try {
    const sourceAuditIntegrity = verifySourceAuditChain(source);
    const tables = orderedSourceTables(source, sourceTableNames(source));
    const sourceColumnsByTable = new Map(tables.map(table => [table, sourceColumns(source, table)]));
    const sourceRowsByTable = new Map(tables.map(table => [
      table,
      source.prepare(`SELECT * FROM ${quotedIdentifier(table)}`).all()
    ]));
    if (targetAuthority) sourceRowsByTable.set('company_authority', []);
    const invalidatedOperatorSessions = sourceRowsByTable.get(OPERATOR_SESSION_TABLE)?.length || 0;
    const invalidatedIdentitySessions = sourceRowsByTable.get('identity_runtime_sessions')?.length || 0;
    if (sourceRowsByTable.has('identity_runtime_sessions')) sourceRowsByTable.set('identity_runtime_sessions', []);
    if (sourceRowsByTable.has(OPERATOR_SESSION_TABLE)) {
      sourceRowsByTable.set(OPERATOR_SESSION_TABLE, []);
    }
    const clearedAuthenticationRateLimits = sourceRowsByTable.get(AUTH_RATE_LIMIT_TABLE)?.length || 0;
    if (sourceRowsByTable.has(AUTH_RATE_LIMIT_TABLE)) {
      sourceRowsByTable.set(AUTH_RATE_LIMIT_TABLE, []);
    }
    const clearedApiRateLimits = sourceRowsByTable.get(API_RATE_LIMIT_TABLE)?.length || 0;
    if (sourceRowsByTable.has(API_RATE_LIMIT_TABLE)) {
      sourceRowsByTable.set(API_RATE_LIMIT_TABLE, []);
    }
    const accessDeactivationTime = new Date().toISOString();
    const workerSessions = sourceRowsByTable.get('work_board_sessions') || [];
    const workerSessionInvalidation = invalidateWorkerSessionRows(workerSessions, accessDeactivationTime);
    const invalidatedWorkerSessions = workerSessionInvalidation.activeCount;
    if (sourceRowsByTable.has('work_board_sessions')) {
      sourceRowsByTable.set('work_board_sessions', workerSessionInvalidation.rows);
    }
    if (sourceRowsByTable.has('work_board_accounts')) {
      sourceRowsByTable.set('work_board_accounts', sourceRowsByTable.get('work_board_accounts').map(row => ({ ...row, status: 'suspended' })));
    }
    const deactivatedManagedOperators = (sourceRowsByTable.get(MANAGED_OPERATOR_TABLE) || [])
      .filter(row => row.status === 'active').length;
    if (sourceRowsByTable.has(MANAGED_OPERATOR_TABLE)) {
      sourceRowsByTable.set(MANAGED_OPERATOR_TABLE, sourceRowsByTable.get(MANAGED_OPERATOR_TABLE).map(row => ({
        ...row,
        status: 'deactivated',
        last_used_at: null,
        deactivated_at: row.status === 'active' ? accessDeactivationTime : row.deactivated_at,
        updated_at: row.status === 'active' ? accessDeactivationTime : row.updated_at
      })));
    }
    const documents = sourceRowsByTable.get('documents') || [];

    await client.connect();
    const lock = await client.query('SELECT pg_try_advisory_lock($1) AS locked', [MIGRATION_LOCK_ID]);
    if (lock.rows[0]?.locked !== true) throw new Error('Another Contractor.AI hosted migration is already running.');
    await client.query('BEGIN');
    const targetTables = await destinationTableNames(client);
    const targetSet = new Set(targetTables);
    const missingTables = tables.filter(table => !targetSet.has(table));
    if (missingTables.length) throw new Error(`Hosted schema is missing ledger tables: ${missingTables.join(', ')}`);
    if (targetTables.length) {
      await client.query(`LOCK TABLE ${targetTables.map(quotedIdentifier).join(', ')} IN ACCESS EXCLUSIVE MODE`);
    }
    for (const table of targetTables) {
      if (await prepareMigrationSeedTable(client, table, sourceRowsByTable.has(table))) continue;
      const count = await client.query(`SELECT COUNT(*)::bigint AS count FROM ${quotedIdentifier(table)}`);
      if (BigInt(count.rows[0].count) !== 0n) throw new Error(`Hosted migration target is not empty: ${table}`);
    }

    const evidence = await migrateEvidence(verification, documents, storage, uploadedObjects);
    const tableResults = [];
    for (const table of tables) {
      const columns = sourceColumnsByTable.get(table);
      const targetColumns = await destinationColumns(client, table);
      const missingColumns = columns.filter(column => !targetColumns.includes(column));
      if (missingColumns.length) throw new Error(`Hosted table ${table} is missing columns: ${missingColumns.join(', ')}`);
      const rows = orderedSelfReferentialRows(
        source,
        table,
        sourceRowsByTable.get(table).map(row => rewriteRowReferences(table, row, columns, evidence.replacements))
      );
      await insertRows(client, table, columns, rows);
      const destinationRows = (await client.query(
        `SELECT ${columns.map(quotedIdentifier).join(', ')} FROM ${quotedIdentifier(table)}`
      )).rows;
      const sourceDigest = tableDigest(table, columns, rows);
      const destinationDigest = tableDigest(table, columns, destinationRows);
      if (destinationRows.length !== rows.length || sourceDigest !== destinationDigest) {
        throw new Error(`Hosted verification failed for ledger table: ${table}`);
      }
      tableResults.push({ table, columns, rows: rows.length, sha256: sourceDigest });
    }

    const rebuiltAuditChain = await rebuildHostedAuditChain(client);
    const databaseDigest = sha256Buffer(Buffer.from(tableResults.map(result => `${result.table}:${result.rows}:${result.sha256}`).join('\n')));
    const receiptId = `migration_${sha256Buffer(Buffer.from(`${verification.manifest.backupId}\0${verification.manifestHash}`)).slice(0, 24)}`;
    const receiptMetadata = {
      sourceBackupId: verification.manifest.backupId,
      manifestSha256: verification.manifestHash,
      databaseSha256: databaseDigest,
      sourceRows: tableResults.reduce((total, result) => total + result.rows, 0),
      tables: tableResults.length,
      tableDigests: tableResults,
      invalidatedOperatorSessions,
      invalidatedIdentitySessions,
      invalidatedWorkerSessions,
      deactivatedManagedOperators,
      clearedAuthenticationRateLimits,
      clearedApiRateLimits,
      sourceAuditIntegrity: {
        supported: sourceAuditIntegrity.supported,
        verified: sourceAuditIntegrity.valid,
        eventCount: sourceAuditIntegrity.eventCount || 0
      },
      rebuiltAuditChain,
      evidenceFiles: evidence.files.length,
      evidenceSha256: evidence.files.map(file => ({ source: file.source, storageRef: file.storageRef, bytes: file.bytes, sha256: file.sha256 }))
    };
    await appendHostedAuditEvent(client, {
      id: receiptId,
      entityType: 'operational_migration',
      entityId: verification.manifest.backupId,
      jobId: null,
      action: 'migrate_local_backup_to_hosted',
      actor,
      beforeJson: '{}',
      afterJson: '{}',
      metadataJson: JSON.stringify(receiptMetadata),
      createdAt: new Date().toISOString()
    });
    if (targetAuthority) {
      const record = authorityRecord(targetAuthority);
      await insertRows(client, 'company_authority', Object.keys(record), [record]);
      const previous = (await client.query('SELECT * FROM company_authority_history ORDER BY sequence DESC LIMIT 1')).rows[0];
      const event = authorityHistoryRecord(record, previous);
      await insertRows(client, 'company_authority_history', Object.keys(event), [event]);
    }
    commitAttempted = true;
    await client.query('COMMIT');
    committed = true;

    const validationLedger = new ContractorOperatingLedger({ databaseUrl, authorityMaintenance: Boolean(targetAuthority) });
    try {
      const diagnostics = validationLedger.diagnose();
      if (!diagnostics.valid) {
        const issueSummary = (diagnostics.issues || [])
          .slice(0, 5)
          .map(issue => issue.message)
          .filter(Boolean)
          .join('; ');
        throw new Error(`Hosted ledger diagnostics reported ${diagnostics.issueCount} issue(s) after migration.${issueSummary ? ` ${issueSummary}` : ''}`);
      }
      const auditIntegrity = validationLedger.verifyAuditIntegrity();
      if (!auditIntegrity.valid) throw new Error('Hosted ledger audit chain failed verification after migration.');
      const receipt = validationLedger.listAudit({ entityType: 'operational_migration', limit: 100 })
        .find(event => event.id === receiptId);
      if (!receipt) throw new Error('Hosted migration receipt was not retained.');
      const result = {
        success: true,
        backupId: verification.manifest.backupId,
        manifestSha256: verification.manifestHash,
        databaseSha256: databaseDigest,
        tables: tableResults,
        sourceRows: receiptMetadata.sourceRows,
        invalidatedOperatorSessions,
        invalidatedIdentitySessions,
        invalidatedWorkerSessions,
        deactivatedManagedOperators,
        clearedAuthenticationRateLimits,
        clearedApiRateLimits,
        sourceAuditIntegrity,
        auditIntegrity,
        evidenceFiles: evidence.files.length,
        receiptId,
        migrationVersion: destinationMigrations.currentVersion,
        diagnostics: { valid: diagnostics.valid, issueCount: diagnostics.issueCount }
      };
      if (targetAuthority) {
        result.authorityStatus = 'staged';
        result.handoverReceipt = retainTargetVerification(validationLedger.db, { key: handover.key, result });
      }
      return result;
    } finally {
      validationLedger.close();
    }
  } catch (error) {
    if (!committed && !commitAttempted) {
      await client.query('ROLLBACK').catch(() => {});
      if (storage) {
        const cleanupFailures = [];
        for (const storageRef of [...uploadedObjects].reverse()) {
          try {
            await storage.remove(storageRef);
          } catch {
            cleanupFailures.push(storageRef);
          }
        }
        if (cleanupFailures.length) error.cleanupFailures = cleanupFailures.length;
      }
    }
    if (!committed && commitAttempted) {
      error.code = 'migration_commit_unknown';
      error.message = 'Migration commit acknowledgement was lost. Keep the database and uploaded evidence; inspect the retained migration receipt and authority before retrying.';
    }
    throw error;
  } finally {
    source.close();
    await client.end().catch(() => {});
  }
}

async function runCli() {
  const argumentsMap = parseArguments(process.argv.slice(2));
  const dataDir = path.resolve(argumentsMap['data-dir'] || process.env.CONTRACTOR_AI_DATA_DIR || path.join(projectRoot, 'data'));
  const backupId = String(argumentsMap['backup-id'] || '').trim();
  if (!/^[A-Za-z0-9._-]+$/.test(backupId) || backupId === '.' || backupId === '..') {
    throw new Error('Set --backup-id to a valid verified local backup id.');
  }
  const verifyExisting = argumentsMap['verify-existing'] === true;
  const expectedConfirmation = `${verifyExisting ? 'VERIFY_MIGRATION' : 'MIGRATE'}_${backupId}`;
  if (argumentsMap.confirm !== expectedConfirmation) {
    throw new Error(`Set --confirm ${expectedConfirmation} to ${verifyExisting ? 'reconcile the retained staged target without rerunning the migration' : 'migrate this verified backup into an empty hosted target'}.`);
  }
  const databaseUrl = String(argumentsMap['database-url'] || process.env.CONTRACTOR_AI_DATABASE_URL || '').trim();
  if (!databaseUrl) throw new Error('Set CONTRACTOR_AI_DATABASE_URL to the empty hosted PostgreSQL migration target.');
  const connection = resolvePostgresConnectionOptions(databaseUrl);
  if (connection.sslMode !== 'verify-full') {
    throw new Error('Hosted migration requires PostgreSQL certificate and hostname verification with sslmode=verify-full.');
  }
  const companyId = normalizeCompanyId(process.env.CONTRACTOR_AI_COMPANY_ID);
  if (!companyId) throw new Error('Set CONTRACTOR_AI_COMPANY_ID to the retained source company id before hosted migration.');
  if (!argumentsMap['permit-file'] || !argumentsMap['receipt-output']) throw new Error('Hosted transfer requires --permit-file and --receipt-output. Follow docs/COMPANY_HANDOVER.md; a copied backup alone cannot authorize activation.');
  const handover = { permit: readDocument(argumentsMap['permit-file']), key: readPrivateKeyFile(process.env.CONTRACTOR_AI_AUTHORITY_KEY_FILE) };
  const storage = createHostedEvidenceStorageFromEnvironment(companyId);
  if (argumentsMap['verify-existing'] === true) {
    const result = await verifyCommittedHostedMigration({ backupDir: path.join(dataDir, 'backups', backupId), databaseUrl,
      companyId, storage, signingKey: argumentsMap['signing-key'], handover });
    const receiptFile = privateOutput(argumentsMap['receipt-output'], result.handoverReceipt);
    const { handoverReceipt: _handoverReceipt, ...summary } = result;
    process.stdout.write(`${JSON.stringify({ ...summary, receiptFile, activationRequired: true })}\n`);
    return;
  }
  const result = await migrateLocalBackupToHosted({
    backupDir: path.join(dataDir, 'backups', backupId),
    databaseUrl,
    companyId,
    storage,
    actor: 'hosted_migration_cli',
    signingKey: argumentsMap['signing-key'],
    allowLegacyUnsigned: argumentsMap['allow-legacy-unsigned'] === true,
    handover
  });
  const receiptFile = privateOutput(argumentsMap['receipt-output'], result.handoverReceipt);
  const { handoverReceipt: _handoverReceipt, ...summary } = result;
  process.stdout.write(`${JSON.stringify({ ...summary, receiptFile, activationRequired: true })}\n`);
}

if (require.main === module) {
  runCli().catch(error => {
    process.stderr.write(`${error.message || 'Hosted migration failed.'}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  migrateLocalBackupToHosted,
  verifyCommittedHostedMigration,
  orderedSelfReferentialRows,
  orderedSourceTables,
  invalidateWorkerSessionRows,
  rewriteRowReferences,
  tableDigest,
  verifyBackupDirectory
};
