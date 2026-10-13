const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ContractorOperatingLedger } = require('../operating-ledger');

function createLedger(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-job-register-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  });
  return ledger;
}

function seedJobs(ledger, count) {
  const source = ledger.createIntake({
    title: 'Seed job',
    client: { name: 'Job Register Pagination Client' },
  }, { jobId: 'job-register-seed' });
  const insert = ledger.db.prepare(`
    INSERT INTO jobs (id, client_id, title, job_type, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  for (let index = 0; index < count; index += 1) {
    const id = `job-register-${String(index).padStart(4, '0')}`;
    const updatedAt = new Date(Date.UTC(2026, 0, 1, 0, 0, Math.floor(index / 2))).toISOString();
    insert.run(id, source.clientId, `Register job ${index}`, 'renovation', updatedAt, updatedAt);
  }
  return source;
}

test('job cursor pages cover every matching record beyond 500 without duplicate or skipped rows', t => {
  const ledger = createLedger(t);
  seedJobs(ledger, 505);
  const visited = [];
  let afterUpdatedAt;
  let afterJobId;

  for (;;) {
    const page = ledger.listJobs({ limit: 100, afterUpdatedAt, afterJobId });
    visited.push(...page.map(job => job.id));
    if (page.length < 100) break;
    const last = page.at(-1);
    afterUpdatedAt = last.updatedAt;
    afterJobId = last.id;
  }

  assert.equal(visited.length, 506);
  assert.equal(new Set(visited).size, visited.length);
  assert.equal(visited[0], 'job-register-seed');
  assert.equal(visited.at(-1), 'job-register-0000');
});

test('job cursor ordering is deterministic for identical update timestamps', t => {
  const ledger = createLedger(t);
  const { clientId } = ledger.createIntake({ title: 'Tie seed', client: { name: 'Tie cursor client' } }, { jobId: 'tie-seed' });
  const timestamp = '2026-09-25T08:00:00.000Z';
  const insert = ledger.db.prepare('INSERT INTO jobs (id, client_id, title, created_at, updated_at) VALUES (?, ?, ?, ?, ?)');
  for (const id of ['tie-a', 'tie-b', 'tie-c']) insert.run(id, clientId, id, timestamp, timestamp);

  const first = ledger.listJobs({ limit: 2 });
  const second = ledger.listJobs({
    limit: 2,
    afterUpdatedAt: first.at(-1).updatedAt,
    afterJobId: first.at(-1).id,
  });
  assert.deepEqual(first.slice(0, 2).map(job => job.id), ['tie-seed', 'tie-c']);
  assert.deepEqual(second.map(job => job.id), ['tie-b', 'tie-a']);
});

test('field-worker ledger filters apply before cursor pagination and exclude released placements', t => {
  const ledger = createLedger(t);
  const { clientId } = seedJobs(ledger, 505);
  ledger.upsertWorker({ id: 'job-register-worker', name: 'Pagination worker', status: 'available' }, { actor: 'pagination_test' });
  const timestamp = '2026-09-25T08:00:00.000Z';
  const insertAssignment = ledger.db.prepare(`
    INSERT INTO assignments (id, job_id, worker_id, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  insertAssignment.run('assignment-current-old', 'job-register-0000', 'job-register-worker', 'planned', timestamp, timestamp);
  insertAssignment.run('assignment-current-new', 'job-register-0504', 'job-register-worker', 'in_progress', timestamp, timestamp);
  insertAssignment.run('assignment-released', 'job-register-0002', 'job-register-worker', 'released', timestamp, timestamp);

  const first = ledger.listJobs({ workerId: 'job-register-worker', workerScopeRequired: true, limit: 1 });
  assert.deepEqual(first.map(job => job.id), ['job-register-0504']);
  const second = ledger.listJobs({
    workerId: 'job-register-worker', workerScopeRequired: true, limit: 1,
    afterUpdatedAt: first[0].updatedAt,
    afterJobId: first[0].id,
  });
  assert.deepEqual(second.map(job => job.id), ['job-register-0000']);
  assert.deepEqual(ledger.listJobs({ workerScopeRequired: true, limit: 10 }), []);
  assert.deepEqual(ledger.listJobs({ workerId: 'other-worker', workerScopeRequired: true, limit: 10 }), []);
  assert.equal(clientId, ledger.getJobDetail('job-register-0000').client.id);
});

test('incomplete job cursors are rejected rather than silently changing the result set', t => {
  const ledger = createLedger(t);
  seedJobs(ledger, 1);
  assert.throws(
    () => ledger.listJobs({ afterUpdatedAt: '2026-09-25T08:00:00.000Z' }),
    error => error.code === 'job_list_cursor_invalid' && error.statusCode === 400,
  );
});
