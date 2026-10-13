const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { LocalEvidenceStorage } = require('../evidence-storage');

function fixture() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-evidence-reservations-'));
  const dbFile = path.join(directory, 'ledger.sqlite');
  const ledgers = [];
  return {
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
