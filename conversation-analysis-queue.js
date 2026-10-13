const { createHash, randomUUID } = require('node:crypto');

const MAX_ATTEMPTS = 8;
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');

function migrateConversationAnalysisQueue(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS conversation_analysis_jobs (
      id TEXT PRIMARY KEY,
      job_id TEXT NOT NULL REFERENCES jobs(id),
      access_id TEXT NOT NULL REFERENCES client_portal_access(id),
      source_hash TEXT NOT NULL,
      identity TEXT NOT NULL,
      status TEXT NOT NULL CHECK(status IN ('queued', 'processing', 'retry_wait', 'completed', 'superseded', 'dead_letter')),
      attempt_count INTEGER NOT NULL DEFAULT 0,
      next_attempt_at TEXT NOT NULL,
      lease_id TEXT,
      lease_until TEXT,
      result_hash TEXT,
      last_error_code TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(access_id, source_hash, identity)
    );
    CREATE INDEX IF NOT EXISTS idx_conversation_analysis_jobs_due
      ON conversation_analysis_jobs(status, next_attempt_at, created_at);
    CREATE INDEX IF NOT EXISTS idx_conversation_analysis_jobs_access
      ON conversation_analysis_jobs(access_id, created_at DESC);
  `);
  require('./company-authority').installAuthorityGuards(db, ['conversation_analysis_jobs']);
}

function mapJob(row) {
  if (!row) return null;
  return {
    id: row.id, jobId: row.job_id, accessId: row.access_id, sourceHash: row.source_hash, identity: row.identity,
    status: row.status, attemptCount: Number(row.attempt_count), nextAttemptAt: row.next_attempt_at,
    leaseId: row.lease_id, leaseUntil: row.lease_until, resultHash: row.result_hash,
    lastErrorCode: row.last_error_code, createdAt: row.created_at, updatedAt: row.updated_at
  };
}

function verifyConversationAnalysisQueue(db) {
  const tables = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map(row => row.name));
  const indexes = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type = 'index'").all().map(row => row.name));
  if (!tables.has('conversation_analysis_jobs')) throw new Error('Conversation analysis queue table is missing.');
  for (const name of ['idx_conversation_analysis_jobs_due', 'idx_conversation_analysis_jobs_access']) {
    if (!indexes.has(name)) throw new Error(`Conversation analysis queue index is missing: ${name}.`);
  }
  const rows = db.prepare('SELECT * FROM conversation_analysis_jobs').all();
  for (const row of rows) {
    if (!/^[a-f0-9]{64}$/.test(row.source_hash) || !/^[a-f0-9]{64}$/.test(row.identity)
      || !['queued', 'processing', 'retry_wait', 'completed', 'superseded', 'dead_letter'].includes(row.status)
      || !Number.isInteger(Number(row.attempt_count)) || Number(row.attempt_count) < 0 || Number(row.attempt_count) > MAX_ATTEMPTS
      || !Number.isFinite(Date.parse(row.created_at)) || !Number.isFinite(Date.parse(row.updated_at))) {
      throw new Error(`Conversation analysis queue row is invalid: ${row.id}.`);
    }
    if (row.status === 'processing' ? (!row.lease_id || !Number.isFinite(Date.parse(row.lease_until || '')))
      : Boolean(row.lease_id || row.lease_until)) throw new Error(`Conversation analysis queue lease is inconsistent: ${row.id}.`);
  }
  return { valid: true, queuedJobs: rows.length };
}

class ConversationAnalysisQueue {
  constructor(ledger) { this.ledger = ledger; }

  get(id) {
    return mapJob(this.ledger.db.prepare('SELECT * FROM conversation_analysis_jobs WHERE id = ?').get(id));
  }

  latestForAccess(accessId, identity = null) {
    const row = identity
      ? this.ledger.db.prepare('SELECT * FROM conversation_analysis_jobs WHERE access_id = ? AND identity = ? ORDER BY created_at DESC LIMIT 1').get(accessId, identity)
      : this.ledger.db.prepare('SELECT * FROM conversation_analysis_jobs WHERE access_id = ? ORDER BY created_at DESC LIMIT 1').get(accessId);
    return mapJob(row);
  }

  enqueue({ accessId, jobId, sourceHash, identity, now = new Date() }) {
    if (!accessId || !jobId || !/^[a-f0-9]{64}$/.test(sourceHash || '') || !/^[a-f0-9]{64}$/.test(identity || '')) {
      throw new Error('A scoped conversation source and analysis identity are required.');
    }
    const timestamp = new Date(now).toISOString();
    const id = `conversation_analysis_job_${hash([accessId, sourceHash, identity])}`;
    return this.ledger.transaction(() => {
      this.ledger.db.prepare(`UPDATE conversation_analysis_jobs SET status = 'superseded', lease_id = NULL, lease_until = NULL, updated_at = ?
        WHERE access_id = ? AND status IN ('queued', 'retry_wait') AND (source_hash <> ? OR identity <> ?)`)
        .run(timestamp, accessId, sourceHash, identity);
      this.ledger.db.prepare(`INSERT INTO conversation_analysis_jobs
        (id, job_id, access_id, source_hash, identity, status, attempt_count, next_attempt_at, lease_id, lease_until,
          result_hash, last_error_code, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, NULL, NULL, NULL, NULL, ?, ?)
        ON CONFLICT(access_id, source_hash, identity) DO NOTHING`)
        .run(id, jobId, accessId, sourceHash, identity, timestamp, timestamp, timestamp);
      return this.get(id);
    });
  }

  claimNext({ now = new Date(), leaseSeconds = 180 } = {}) {
    const timestamp = new Date(now).toISOString();
    const leaseUntil = new Date(Date.parse(timestamp) + Math.max(30, Number(leaseSeconds) || 180) * 1000).toISOString();
    return this.ledger.transaction(() => {
      if (this.ledger.databaseMode === 'postgres') this.ledger.db.prepare('SELECT pg_advisory_xact_lock(?)').get(2026092501);
      const row = this.ledger.db.prepare(`SELECT * FROM conversation_analysis_jobs
        WHERE attempt_count < ? AND (
          (status IN ('queued', 'retry_wait') AND next_attempt_at <= ?)
          OR (status = 'processing' AND COALESCE(lease_until, '') <= ?)
        ) ORDER BY next_attempt_at, created_at, id LIMIT 1`).get(MAX_ATTEMPTS, timestamp, timestamp);
      if (!row) return null;
      const leaseId = randomUUID();
      const changed = this.ledger.db.prepare(`UPDATE conversation_analysis_jobs
        SET status = 'processing', attempt_count = attempt_count + 1, lease_id = ?, lease_until = ?, updated_at = ?
        WHERE id = ? AND attempt_count = ? AND (status IN ('queued', 'retry_wait') OR (status = 'processing' AND COALESCE(lease_until, '') <= ?))`)
        .run(leaseId, leaseUntil, timestamp, row.id, row.attempt_count, timestamp);
      return Number(changed.changes || 0) === 1 ? this.get(row.id) : null;
    });
  }

  finish(id, leaseId, resultHash, now = new Date()) {
    if (!/^[a-f0-9]{64}$/.test(resultHash || '')) throw new Error('A retained analysis identity is required.');
    const timestamp = new Date(now).toISOString();
    return this.ledger.transaction(() => {
      const changed = this.ledger.db.prepare(`UPDATE conversation_analysis_jobs SET status = 'completed', lease_id = NULL,
        lease_until = NULL, result_hash = ?, last_error_code = NULL, updated_at = ? WHERE id = ? AND status = 'processing' AND lease_id = ?`)
        .run(resultHash, timestamp, id, leaseId);
      return Number(changed.changes || 0) === 1 ? this.get(id) : null;
    });
  }

  supersede(id, leaseId, now = new Date()) {
    const timestamp = new Date(now).toISOString();
    return this.ledger.transaction(() => {
      const changed = this.ledger.db.prepare(`UPDATE conversation_analysis_jobs SET status = 'superseded', lease_id = NULL,
        lease_until = NULL, last_error_code = 'source_changed', updated_at = ? WHERE id = ? AND status = 'processing' AND lease_id = ?`)
        .run(timestamp, id, leaseId);
      return Number(changed.changes || 0) === 1 ? this.get(id) : null;
    });
  }

  retry(id, leaseId, errorCode = 'analysis_unavailable', now = new Date(), permanent = false) {
    const timestamp = new Date(now).toISOString();
    return this.ledger.transaction(() => {
      const current = this.get(id);
      if (!current || current.status !== 'processing' || current.leaseId !== leaseId) return null;
      const terminal = permanent || current.attemptCount >= MAX_ATTEMPTS;
      const delaySeconds = Math.min(3600, 30 * (2 ** Math.max(0, current.attemptCount - 1)));
      const nextAttemptAt = new Date(Date.parse(timestamp) + delaySeconds * 1000).toISOString();
      const changed = this.ledger.db.prepare(`UPDATE conversation_analysis_jobs SET status = ?, next_attempt_at = ?,
        lease_id = NULL, lease_until = NULL, last_error_code = ?, updated_at = ? WHERE id = ? AND status = 'processing' AND lease_id = ?`)
        .run(terminal ? 'dead_letter' : 'retry_wait', nextAttemptAt, String(errorCode).slice(0, 80), timestamp, id, leaseId);
      return Number(changed.changes || 0) === 1 ? this.get(id) : null;
    });
  }
}

module.exports = { ConversationAnalysisQueue, MAX_ATTEMPTS, migrateConversationAnalysisQueue, verifyConversationAnalysisQueue };
