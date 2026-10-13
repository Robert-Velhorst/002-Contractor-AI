const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { DatabaseSync } = require('node:sqlite');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { loadingSql, legacySql, rows, registerLoadingReadContract } = require('./loading-read-contract');

registerLoadingReadContract(test, { prefix: 'SQLite', createLedger(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-loading-read-'));
  const options = { dbFile: path.join(root, 'ledger.sqlite') };
  let current = new ContractorOperatingLedger(options);
  t.after(() => { current.close(); fs.rmSync(root, { recursive: true, force: true }); });
  return { ledger: current, reopen() { current = new ContractorOperatingLedger(options); return current; } };
} });

test('loading query preserves nullable legacy IDs/statuses, orphaned resources and single-resource jobs', t => {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE jobs (id TEXT PRIMARY KEY, title TEXT, status TEXT, updated_at TEXT);
    CREATE TABLE tool_reservations (id TEXT PRIMARY KEY, job_id TEXT, status TEXT);
    CREATE TABLE material_requirements (id TEXT PRIMARY KEY, job_id TEXT, status TEXT);
    CREATE TABLE loading_plans (id TEXT PRIMARY KEY, job_id TEXT, status TEXT);
    CREATE INDEX idx_tool_reservations_job_status_id ON tool_reservations(job_id,status,id);
    CREATE INDEX idx_material_requirements_job_status_id ON material_requirements(job_id,status,id);
    CREATE INDEX idx_loading_plans_job ON loading_plans(job_id);
    INSERT INTO jobs VALUES ('a','Tools','planned','2026-01-02'),('b','Materials','scheduled','2026-01-01'),
      ('c','Null only','in_progress','2026-01-01'),('d','Excluded','archived','2026-01-01'),
      ('e','Unknown',NULL,'2026-01-01'),(NULL,'Null ID','planned','2026-01-01'),(NULL,'Another null ID','planned','2026-01-01');
    INSERT INTO tool_reservations VALUES ('a','a','reserved'),('released','a','released'),('cancelled','a','cancelled'),
      ('null-status','a',NULL),(NULL,'c','reserved'),('null-job',NULL,'reserved'),('orphan','missing','reserved'),
      ('archived','d','reserved'),('unknown-job','e','reserved');
    INSERT INTO material_requirements VALUES ('b','b','needed'),('cancelled','b','cancelled'),('null-status','b',NULL),(NULL,'c','needed');
    INSERT INTO loading_plans VALUES (NULL,'a','draft'),('null-status','b',NULL),('cancelled','b','cancelled'),('rejected','b','rejected');
  `);
  assert.deepEqual(rows(db, loadingSql), rows(db, legacySql));
  assert.deepEqual(rows(db, loadingSql), [
    { id: 'a', title: 'Tools', tools: 1, materials: 0 },
    { id: 'b', title: 'Materials', tools: 0, materials: 1 }
  ]);
  const plan = db.prepare('EXPLAIN QUERY PLAN ' + loadingSql).all().map(row => row.detail).join('\n');
  assert.match(plan, /COVERING INDEX idx_tool_reservations_job_status_id/);
  assert.match(plan, /COVERING INDEX idx_material_requirements_job_status_id/);
  assert.match(plan, /INDEX idx_loading_plans_job/);
  assert.doesNotMatch(plan, /SCAN (tools|materials|plans)\b/);
  db.exec("INSERT INTO loading_plans VALUES ('active','a','draft')");
  assert.deepEqual(rows(db, loadingSql), rows(db, legacySql));
  assert.equal(rows(db, loadingSql).length, 1);
});
