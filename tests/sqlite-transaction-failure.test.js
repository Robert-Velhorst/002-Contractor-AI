const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { ContractorOperatingLedger } = require('../operating-ledger');

function ledgerFor(db) {
  return Object.assign(Object.create(ContractorOperatingLedger.prototype), {
    db,
    databaseMode: 'sqlite',
    transactionDepth: 0,
    transactionAffectsDashboard: false,
    mutationRevision: 0,
    dashboardSummaryCache: { revision: 0 },
    authority: null,
    authorityKey: null,
    authorityMaintenance: false,
    transactionFailure: null
  });
}

test('preserves SQLITE_FULL after SQLite has already rolled back the transaction', () => {
  const db = new DatabaseSync(':memory:');
  const ledger = ledgerFor(db);
  try {
    db.exec("CREATE TABLE retained (id TEXT PRIMARY KEY, value TEXT); INSERT INTO retained VALUES ('one', 'before'); PRAGMA max_page_count = 3;");
    const cache = ledger.dashboardSummaryCache;
    let failure;

    try {
      ledger.transaction(() => {
        db.prepare('UPDATE retained SET value = ? WHERE id = ?').run('changed', 'one');
        db.prepare('INSERT INTO retained VALUES (?, ?)').run('two', 'x'.repeat(100_000));
      });
    } catch (error) {
      failure = error;
    }

    assert.equal(failure?.code, 'ERR_SQLITE_ERROR');
    assert.equal(failure?.errcode, 13);
    assert.match(failure?.message || '', /database or disk is full/i);
    assert.equal(db.isTransaction, false);
    assert.equal(db.prepare('SELECT value FROM retained WHERE id = ?').get('one').value, 'before');
    assert.equal(ledger.transactionDepth, 0);
    assert.equal(ledger.mutationRevision, 0);
    assert.equal(ledger.dashboardSummaryCache, cache);

    ledger.transaction(() => db.prepare('UPDATE retained SET value = ? WHERE id = ?').run('after', 'one'));
    assert.equal(db.prepare('SELECT value FROM retained WHERE id = ?').get('one').value, 'after');
    assert.equal(ledger.mutationRevision, 1);
    assert.equal(ledger.dashboardSummaryCache, null);
  } finally {
    db.close();
  }
});

test('keeps nested transactions in one outer commit', () => {
  const db = new DatabaseSync(':memory:');
  const ledger = ledgerFor(db);
  try {
    db.exec('CREATE TABLE retained (value TEXT); INSERT INTO retained VALUES (\'before\');');
    ledger.transaction(() => {
      ledger.transaction(() => db.prepare('UPDATE retained SET value = ?').run('after'));
    });

    assert.equal(db.prepare('SELECT value FROM retained').get().value, 'after');
    assert.equal(ledger.transactionDepth, 0);
    assert.equal(ledger.mutationRevision, 1);
  } finally {
    db.close();
  }
});

test('fails closed and preserves both errors when an active transaction cannot roll back', () => {
  const originalError = new Error('write failed');
  const rollbackError = new Error('rollback I/O failed');
  let active = false;
  const db = {
    closed: false,
    get isTransaction() { return active; },
    exec(sql) {
      if (sql === 'BEGIN IMMEDIATE') active = true;
      else if (sql === 'ROLLBACK') throw rollbackError;
    },
    close() { this.closed = true; }
  };
  const ledger = ledgerFor(db);
  let failure;

  try {
    ledger.transaction(() => { throw originalError; });
  } catch (error) {
    failure = error;
  }

  assert.ok(failure instanceof AggregateError);
  assert.deepEqual(failure.errors, [originalError, rollbackError]);
  assert.equal(ledger.transactionFailure, failure);
  assert.equal(db.closed, true);
  assert.equal(ledger.transactionDepth, 0);
  assert.throws(() => ledger.transaction(() => assert.fail('poisoned ledger must not run')), error => error === failure);
});
