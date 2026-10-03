const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { ClientConversation, hash } = require('../client-conversation');
const { ConversationAnalysisQueue } = require('../conversation-analysis-queue');

const { postgresTestDatabaseUrl, connectVerifiedPostgresClient } = require('./postgres-test-database');
const connectionString = postgresTestDatabaseUrl();

test('PostgreSQL durable conversation-analysis queue preserves idempotent leases and retry state', { skip: !connectionString }, async t => {
  const admin = new Client({ connectionString });
  await connectVerifiedPostgresClient(admin);
  const name = `contractor_chat_analysis_${randomBytes(8).toString('hex')}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(connectionString); url.pathname = `/${name}`;
  let ledger;
  t.after(async () => { ledger?.close(); try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); } finally { await admin.end(); } });

  ledger = new ContractorOperatingLedger({ databaseUrl: url.toString() });
  assert.equal(ledger.migrationStatus().currentVersion, '096_loading_read_indexes');
  const job = ledger.createIntake({ title: 'Queue Postgres contract', client: { name: 'Queue client' }, assignAutomatically: false });
  const access = ledger.createClientPortalAccess(job.id);
  ledger.resolveApproval(access.approval.id, { status: 'approved' });
  const chat = new ClientConversation(ledger);
  const message = chat.create(access.id, { entryKey: 'postgres-queue-message', body: 'Controleer de leverdatum.' }, { direction: 'inbound' });
  const sourceHash = hash(chat.analysisSources(access.id));
  const identity = hash(['postgres-queue-analysis']);
  const queue = new ConversationAnalysisQueue(ledger);
  const now = new Date('2026-09-25T12:00:00.000Z');
  const queued = queue.enqueue({ accessId: access.id, jobId: job.id, sourceHash, identity, now });
  assert.equal(queue.enqueue({ accessId: access.id, jobId: job.id, sourceHash, identity, now }).id, queued.id);
  const claimed = queue.claimNext({ now });
  assert.equal(claimed.status, 'processing');
  const retried = queue.retry(claimed.id, claimed.leaseId, 'model_unavailable', now);
  assert.equal(retried.status, 'retry_wait');
  assert.equal(retried.attemptCount, 1);
  assert.equal(ledger.db.prepare('SELECT body FROM communication_records WHERE id = ?').get(message.id).body, message.body);
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
});
