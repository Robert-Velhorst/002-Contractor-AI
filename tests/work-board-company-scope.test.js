const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { jobHasCompanyTargetedWork, verifiedAssignmentsForWorker } = require('../work-board-company-scope');

function createScopeDatabase() {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE trade_partners (id TEXT PRIMARY KEY, partner_type TEXT NOT NULL, status TEXT NOT NULL);
    CREATE TABLE work_board_accounts (worker_id TEXT NOT NULL, status TEXT NOT NULL, data_json TEXT NOT NULL);
    CREATE TABLE work_board_positions (id TEXT PRIMARY KEY, job_id TEXT NOT NULL, status TEXT NOT NULL, data_json TEXT NOT NULL);
  `);
  return db;
}

test('field projections retain only active assignments whose company membership is current', t => {
  const db = createScopeDatabase();
  t.after(() => db.close());
  db.prepare('INSERT INTO trade_partners (id, partner_type, status) VALUES (?, ?, ?)').run('partner-a', 'subcontractor', 'active');
  db.prepare('INSERT INTO trade_partners (id, partner_type, status) VALUES (?, ?, ?)').run('partner-b', 'subcontractor', 'active');
  db.prepare('INSERT INTO work_board_accounts (worker_id, status, data_json) VALUES (?, ?, ?)')
    .run('worker-a', 'admitted', JSON.stringify({ verifiedTradePartnerId: 'partner-a' }));
  const assignments = [
    { id: 'own-company', workerId: 'worker-a', status: 'assigned', data: { requiredTradePartnerId: 'partner-a' } },
    { id: 'other-company', workerId: 'worker-a', status: 'assigned', data: { requiredTradePartnerId: 'partner-b' } },
    { id: 'unscoped', workerId: 'worker-a', status: 'planned', data: {} },
    { id: 'released', workerId: 'worker-a', status: 'completed', data: {} },
    { id: 'another-worker', workerId: 'worker-b', status: 'assigned', data: {} }
  ];

  assert.deepEqual(
    verifiedAssignmentsForWorker(db, assignments, 'worker-a').map(assignment => assignment.id),
    ['own-company', 'unscoped']
  );
  db.prepare('UPDATE trade_partners SET status = ? WHERE id = ?').run('on_hold', 'partner-a');
  assert.deepEqual(
    verifiedAssignmentsForWorker(db, assignments, 'worker-a').map(assignment => assignment.id),
    ['unscoped']
  );
});

test('legacy job allowlists are denied when an active company-targeted assignment or open position exists', t => {
  const db = createScopeDatabase();
  t.after(() => db.close());
  const normalAssignment = { id: 'normal', workerId: 'worker-a', status: 'assigned', data: {} };
  const targetedAssignment = { id: 'targeted', workerId: 'worker-a', status: 'active', data: { requiredTradePartnerId: 'partner-a' } };
  assert.equal(jobHasCompanyTargetedWork(db, 'job-a', [normalAssignment]), false);
  assert.equal(jobHasCompanyTargetedWork(db, 'job-a', [targetedAssignment]), true);

  db.prepare('INSERT INTO work_board_positions (id, job_id, status, data_json) VALUES (?, ?, ?, ?)')
    .run('open-targeted', 'job-a', 'open', JSON.stringify({ targetTradePartnerId: 'partner-a' }));
  assert.equal(jobHasCompanyTargetedWork(db, 'job-a', []), true);
  db.prepare('UPDATE work_board_positions SET status = ? WHERE id = ?').run('closed', 'open-targeted');
  assert.equal(jobHasCompanyTargetedWork(db, 'job-a', []), false);
});
