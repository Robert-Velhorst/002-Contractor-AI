const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { LocalEvidenceStorage } = require('../evidence-storage');
const { postgresTestDatabaseUrl, connectVerifiedPostgresClient } = require('./postgres-test-database');

const connectionString = postgresTestDatabaseUrl();

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-evidence-reservations-'));
  const dbFile = path.join(directory, 'ledger.sqlite');
  const ledgers = [];
  return {
    dbFile,
    open() {
      const ledger = new ContractorOperatingLedger({ dbFile });
      ledgers.push(ledger);
      return ledger;
    },
    cleanup() {
      for (const ledger of ledgers) {
        try { ledger.close(); } catch { /* A test may explicitly restart its fixture ledger. */ }
      }
      fs.rmSync(directory, { recursive: true, force: true });
    }
  };
}

function reservation(overrides = {}) {
  return {
    reservationId: 'reservation-1', requestHash: 'request-1', ownerLeaseId: 'owner-1',
    leaseUntil: new Date(Date.now() + 60_000).toISOString(), bytes: 6, maxBytes: 10,
    ...overrides
  };
}

test('separate SQLite ledger instances share and serialize evidence quota reservations', () => {
  const store = fixture();
  try {
    const first = store.open();
    const second = store.open();
    first.reserveEvidenceStorage(reservation());
    assert.throws(() => second.reserveEvidenceStorage(reservation({
      reservationId: 'reservation-2', requestHash: 'request-2', ownerLeaseId: 'owner-2', bytes: 5
    })), error => error.code === 'evidence_storage_quota_exceeded');
    assert.deepEqual(second.evidenceStorageReservationsUsage(), { bytes: 6, reservations: 1 });
  } finally {
    store.cleanup();
  }
});

test('concurrent SQLite upload processes cannot reserve more than the shared quota', async () => {
  const store = fixture();
  const setup = store.open();
  const dbFile = setup.dbFile;
  setup.close();
  const source = `
    const { ContractorOperatingLedger } = require('./operating-ledger');
    const ledger = new ContractorOperatingLedger({ dbFile: process.argv[1] });
    process.stdout.write('READY\\n');
    process.stdin.once('data', () => {
      try {
        ledger.reserveEvidenceStorage({
          reservationId: process.argv[2], requestHash: process.argv[2], ownerLeaseId: process.argv[2],
          leaseUntil: new Date(Date.now() + 60000).toISOString(), bytes: 6, maxBytes: 10
        });
        process.stdout.write('RESULT:accepted\\n');
      } catch (error) {
        process.stdout.write('RESULT:' + error.code + '\\n');
      } finally { ledger.close(); }
    });
  `;
  const children = ['process-reservation-a', 'process-reservation-b'].map(reservationId => spawn(process.execPath,
    ['-e', source, dbFile, reservationId], { cwd: path.resolve(__dirname, '..'), env: process.env }));
  try {
    let outputs = children.map(() => '');
    const ready = children.map((child, index) => new Promise((resolve, reject) => {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', chunk => {
        outputs[index] += chunk;
        if (outputs[index].includes('READY\n')) resolve();
      });
      child.stderr.on('data', chunk => { outputs[index] += chunk; });
      child.once('error', reject);
      child.once('exit', code => {
        if (!outputs[index].includes('READY\n')) reject(new Error(`Reservation worker exited before readiness (${code}): ${outputs[index]}`));
      });
    }));
    await Promise.all(ready);
    for (const child of children) child.stdin.end('go');
    const exits = await Promise.all(children.map((child, index) => new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', code => resolve({ code, output: outputs[index] }));
    })));
    assert.deepEqual(exits.map(exit => exit.code), [0, 0]);
    assert.equal(exits.filter(exit => exit.output.includes('RESULT:accepted')).length, 1);
    assert.equal(exits.filter(exit => exit.output.includes('RESULT:evidence_storage_quota_exceeded')).length, 1);
    const verify = store.open();
    try { assert.deepEqual(verify.evidenceStorageReservationsUsage(), { bytes: 6, reservations: 1 }); }
    finally { verify.close(); }
  } finally {
    for (const child of children) if (child.exitCode === null) child.kill();
    store.cleanup();
  }
});

test('a reclaimed idempotency lease excludes its stale upload owner', () => {
  const store = fixture();
  try {
    const ledger = store.open();
    const keyHash = 'retry-key-hash';
    const requestHash = 'same-upload-request';
    const firstClaim = ledger.claimIdempotentRequest({ keyHash, scope: 'upload', requestHash });
    assert.equal(firstClaim.claimed, true);
    ledger.reserveEvidenceStorage(reservation({ reservationId: 'retry-reservation', requestHash,
      idempotencyKeyHash: keyHash, ownerLeaseId: firstClaim.leaseId, leaseUntil: firstClaim.leaseUntil }));
    ledger.setEvidenceStorageReservationObject('retry-reservation', firstClaim.leaseId, 'local/evidence.bin', 'a'.repeat(64));
    ledger.db.prepare('UPDATE idempotency_records SET lease_until = ? WHERE key_hash = ?')
      .run(new Date(Date.now() - 1_000).toISOString(), keyHash);
    ledger.db.prepare('UPDATE evidence_storage_reservations SET lease_until = ? WHERE reservation_id = ?')
      .run(new Date(Date.now() - 1_000).toISOString(), 'retry-reservation');

    const nextClaim = ledger.claimIdempotentRequest({ keyHash, scope: 'upload', requestHash });
    assert.equal(nextClaim.claimed, true);
    ledger.reserveEvidenceStorage(reservation({ reservationId: 'retry-reservation', requestHash,
      idempotencyKeyHash: keyHash, ownerLeaseId: nextClaim.leaseId, leaseUntil: nextClaim.leaseUntil }));
    assert.equal(ledger.commitEvidenceStorageReservation('retry-reservation', firstClaim.leaseId), false);
    assert.equal(ledger.setEvidenceStorageReservationObject('retry-reservation', firstClaim.leaseId, 'local/old.bin', 'b'.repeat(64)), false);
    assert.equal(ledger.setEvidenceStorageReservationObject('retry-reservation', nextClaim.leaseId, 'local/evidence.bin', 'a'.repeat(64)), true);
    assert.equal(ledger.commitEvidenceStorageReservation('retry-reservation', nextClaim.leaseId), true);
  } finally {
    store.cleanup();
  }
});

test('expired reservations survive cleanup failures and are recoverable after ledger restart', () => {
  const store = fixture();
  try {
    let ledger = store.open();
    ledger.reserveEvidenceStorage(reservation({ reservationId: 'orphan-1', ownerLeaseId: 'orphan-owner',
      leaseUntil: new Date(Date.now() + 60_000).toISOString() }));
    ledger.setEvidenceStorageReservationObject('orphan-1', 'orphan-owner', 'local/orphan.bin', 'c'.repeat(64));
    ledger.db.prepare('UPDATE evidence_storage_reservations SET lease_until = ? WHERE reservation_id = ?')
      .run(new Date(Date.now() - 1_000).toISOString(), 'orphan-1');
    const [claim] = ledger.claimEvidenceStorageCleanup({ reservationId: 'orphan-1', limit: 1 });
    assert.ok(claim);
    assert.equal(ledger.finishEvidenceStorageCleanup('orphan-1', claim.cleanupLeaseId, {
      removed: false, errorCode: 'storage_temporarily_unavailable'
    }), true);
    assert.deepEqual(ledger.evidenceStorageReservationsUsage(), { bytes: 6, reservations: 1 });
    ledger.close();
    ledger = store.open();
    const [recovered] = ledger.claimEvidenceStorageCleanup({ reservationId: 'orphan-1', limit: 1 });
    assert.ok(recovered);
    assert.equal(ledger.finishEvidenceStorageCleanup('orphan-1', recovered.cleanupLeaseId, { removed: true }), true);
    assert.deepEqual(ledger.evidenceStorageReservationsUsage(), { bytes: 0, reservations: 0 });
  } finally {
    store.cleanup();
  }
});

test('an expired owner cannot finalize a reservation before another worker reclaims it', () => {
  const store = fixture();
  try {
    const ledger = store.open();
    ledger.reserveEvidenceStorage(reservation({ leaseUntil: new Date(Date.now() - 1_000).toISOString() }));
    ledger.setEvidenceStorageReservationObject('reservation-1', 'owner-1', 'local/evidence.bin', 'd'.repeat(64));
    assert.equal(ledger.commitEvidenceStorageReservation('reservation-1', 'owner-1'), false);
  } finally {
    store.cleanup();
  }
});

test('local evidence retries resolve to one deterministic object and reject changed bytes', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-evidence-storage-retry-'));
  try {
    const storage = new LocalEvidenceStorage({ rootDir: path.join(directory, 'uploads'), projectRoot: directory });
    const file = { originalName: 'site-photo.jpg', mimeType: 'image/jpeg', size: 4, buffer: Buffer.from('same') };
    const ref = storage.referenceFor(file, { operationId: 'stable-operation' });
    const first = await storage.store(file, { operationId: 'stable-operation' });
    const retry = await storage.store(file, { operationId: 'stable-operation' });
    assert.equal(first.storageRef, ref);
    assert.equal(retry.storageRef, ref);
    assert.equal(retry.reused, true);
    await assert.rejects(storage.store({ ...file, buffer: Buffer.from('else') }, { operationId: 'stable-operation' }),
      error => error.code === 'evidence_integrity_failed'
        || error.code === 'evidence_retention_unverified');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('PostgreSQL ledger instances share quota locks and fence stale reservation owners', {
  skip: !connectionString
}, async t => {
  const admin = await connectVerifiedPostgresClient(new Client({ connectionString }));
  const databaseName = `contractor_ai_test_evidence_${randomBytes(8).toString('hex')}`;
  let first;
  let second;
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  const databaseUrl = new URL(connectionString);
  databaseUrl.pathname = `/${databaseName}`;
  t.after(async () => {
    first?.close();
    second?.close();
    try { await admin.query(`DROP DATABASE "${databaseName}" WITH (FORCE)`); }
    finally { await admin.end(); }
  });

  first = new ContractorOperatingLedger({ databaseUrl: databaseUrl.toString() });
  second = new ContractorOperatingLedger({ databaseUrl: databaseUrl.toString() });
  first.reserveEvidenceStorage(reservation());
  assert.throws(() => second.reserveEvidenceStorage(reservation({
    reservationId: 'reservation-2', requestHash: 'request-2', ownerLeaseId: 'owner-2', bytes: 5
  })), error => error.code === 'evidence_storage_quota_exceeded');

  const keyHash = 'postgres-retry-key-hash';
  const requestHash = 'postgres-upload-request';
  const firstClaim = first.claimIdempotentRequest({ keyHash, scope: 'upload', requestHash });
  first.reserveEvidenceStorage(reservation({ reservationId: 'postgres-reservation', requestHash,
    idempotencyKeyHash: keyHash, ownerLeaseId: firstClaim.leaseId, leaseUntil: firstClaim.leaseUntil, bytes: 1 }));
  assert.equal(first.setEvidenceStorageReservationObject('postgres-reservation', firstClaim.leaseId,
    's3://bucket/evidence/object.jpg', 'a'.repeat(64)), true);
  first.db.prepare('UPDATE idempotency_records SET lease_until = ? WHERE key_hash = ?')
    .run(new Date(Date.now() - 1_000).toISOString(), keyHash);
  first.db.prepare('UPDATE evidence_storage_reservations SET lease_until = ? WHERE reservation_id = ?')
    .run(new Date(Date.now() - 1_000).toISOString(), 'postgres-reservation');

  const nextClaim = second.claimIdempotentRequest({ keyHash, scope: 'upload', requestHash });
  assert.equal(nextClaim.claimed, true);
  second.reserveEvidenceStorage(reservation({ reservationId: 'postgres-reservation', requestHash,
    idempotencyKeyHash: keyHash, ownerLeaseId: nextClaim.leaseId, leaseUntil: nextClaim.leaseUntil, bytes: 1 }));
  assert.equal(first.commitEvidenceStorageReservation('postgres-reservation', firstClaim.leaseId), false);
  assert.equal(second.commitEvidenceStorageReservation('postgres-reservation', nextClaim.leaseId), true);
  assert.deepEqual(second.evidenceStorageReservationsUsage(), { bytes: 6, reservations: 1 });
});
