const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ContractorOperatingLedger } = require('../operating-ledger');

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-dashboard-cache-'));
  const dbFile = path.join(directory, 'ledger.sqlite');
  const ledger = new ContractorOperatingLedger({ dbFile });
  t.after(() => {
    ledger.close();
    const resolved = path.resolve(directory);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith('contractor-ai-dashboard-cache-'));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return { ledger, dbFile };
}

const key = crypto.createHash('sha256').update('dashboard-cache-security-contract').digest('hex');

test('durable API and authentication counters retain an unchanged local dashboard without weakening limits', t => {
  const { ledger } = fixture(t);
  const summary = ledger.dashboardSummary();
  const revision = ledger.mutationRevision;
  for (let index = 1; index <= 4; index++) {
    const state = ledger.recordApiRateLimitRequest(key, { limit: 3 });
    assert.equal(state.requestCount, index);
    assert.equal(state.remaining, Math.max(0, 3 - index));
    assert.equal(state.limited, index > 3);
    assert.equal(ledger.dashboardSummary(), summary);
  }
  ledger.recordAuthenticationFailure(key, { limit: 2 });
  assert.equal(ledger.recordAuthenticationFailure(key, { limit: 2 }).limited, true);
  assert.equal(ledger.dashboardSummary(), summary);
  assert.equal(ledger.mutationRevision, revision + 6);
  assert.equal(ledger.db.prepare('SELECT request_count FROM api_rate_limits WHERE key_hash = ?').get(key).request_count, 4);
  assert.equal(ledger.db.prepare('SELECT attempt_count FROM auth_rate_limits WHERE key_hash = ?').get(key).attempt_count, 2);
});

test('business changes still invalidate the dashboard', t => {
  const { ledger } = fixture(t);
  const before = ledger.dashboardSummary();
  ledger.createIntake({ title: 'Fresh job', service: 'maintenance', clientName: 'Client' });
  const after = ledger.dashboardSummary();
  assert.notEqual(after, before);
  assert.equal(after.metrics.jobs, before.metrics.jobs + 1);
  assert.equal(ledger.recordApiRateLimitRequest(key).limited, false);
  assert.equal(ledger.dashboardSummary(), after);
});

test('a second SQLite connection cannot hide committed business changes behind a retained security-counter cache', t => {
  const { ledger, dbFile } = fixture(t);
  const other = new ContractorOperatingLedger({ dbFile });
  try {
    const before = ledger.dashboardSummary();
    other.createIntake({ title: 'Other connection', service: 'maintenance', clientName: 'Other client' });
    ledger.recordApiRateLimitRequest(key);
    const after = ledger.dashboardSummary();
    assert.notEqual(after, before);
    assert.equal(after.metrics.jobs, before.metrics.jobs + 1);
  } finally { other.close(); }
});

test('nested business transactions invalidate even inside a dashboard-read-only security transaction', t => {
  const { ledger } = fixture(t);
  const before = ledger.dashboardSummary();
  ledger.transaction(() => {
    ledger.transaction(() => ledger.db.prepare("INSERT INTO clients (id, name, created_at, updated_at) VALUES ('nested', 'Nested client', '2026-10-01', '2026-10-01')").run());
  }, { dashboardReadOnly: true });
  const after = ledger.dashboardSummary();
  assert.notEqual(after, before);
  assert.equal(after.metrics.clients, before.metrics.clients + 1);
});

test('uncommitted dashboard reads are fresh but never replace the committed cache after rollback', t => {
  const { ledger } = fixture(t);
  const before = ledger.dashboardSummary();
  assert.throws(() => ledger.transaction(() => {
    ledger.db.prepare("INSERT INTO clients (id, name, created_at, updated_at) VALUES ('rollback', 'Rolled back client', '2026-10-01', '2026-10-01')").run();
    const uncommitted = ledger.dashboardSummary();
    assert.equal(uncommitted.metrics.clients, before.metrics.clients + 1);
    throw new Error('Rollback');
  }), /Rollback/);
  assert.equal(ledger.dashboardSummary(), before);
  assert.equal(ledger.transactionDepth, 0);
});

test('rollback preserves the committed cache and does not persist a failed counter write', t => {
  const { ledger } = fixture(t);
  const before = ledger.dashboardSummary(), revision = ledger.mutationRevision;
  assert.throws(() => ledger.transaction(() => {
    ledger.recordApiRateLimitRequest(key);
    throw new Error('Rollback');
  }, { dashboardReadOnly: true }), /Rollback/);
  assert.equal(ledger.dashboardSummary(), before);
  assert.equal(ledger.mutationRevision, revision);
  assert.equal(ledger.count('api_rate_limits'), 0);
});

test('expired cached summaries are rebuilt even when only security counters changed', t => {
  const { ledger } = fixture(t);
  const before = ledger.dashboardSummary();
  ledger.dashboardSummaryCache.createdAtMs = 0;
  ledger.recordApiRateLimitRequest(key);
  assert.notEqual(ledger.dashboardSummary(), before);
});

test('hosted mode remains conservatively invalidated on security writes', t => {
  const { ledger } = fixture(t);
  const before = ledger.dashboardSummary();
  // Exercise the hosted cache policy with SQLite; this is not live PostgreSQL proof.
  ledger.databaseMode = 'postgres';
  ledger.recordApiRateLimitRequest(key);
  assert.equal(ledger.dashboardSummaryCache, null);
  assert.notEqual(ledger.dashboardSummary(), before);
});
