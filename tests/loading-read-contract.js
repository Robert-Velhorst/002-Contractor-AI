const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const espree = require('espree');

// Read the actual nextActions statement; the former query is only an oracle.
const ast = espree.parse(fs.readFileSync(path.join(__dirname, '../operating-ledger.js'), 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' });
const statements = [];
function visit(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id.name === 'jobsWithoutLoading') {
    const template = node.init.callee.object.arguments[0];
    assert.equal(template.type, 'TemplateLiteral');
    assert.equal(template.expressions.length, 0);
    statements.push(template.quasis[0].value.cooked);
  }
  for (const child of Object.values(node)) {
    if (Array.isArray(child)) child.forEach(visit);
    else if (child && typeof child === 'object') visit(child);
  }
}
visit(ast);
assert.equal(statements.length, 1);
const loadingSql = statements[0];
const legacySql = `
  SELECT jobs.id, MAX(jobs.title) AS title,
    COUNT(DISTINCT tool_reservations.id) AS tools,
    COUNT(DISTINCT material_requirements.id) AS materials
  FROM jobs
  LEFT JOIN tool_reservations ON tool_reservations.job_id = jobs.id AND tool_reservations.status NOT IN ('cancelled', 'released')
  LEFT JOIN material_requirements ON material_requirements.job_id = jobs.id AND material_requirements.status NOT IN ('cancelled')
  LEFT JOIN loading_plans ON loading_plans.job_id = jobs.id AND loading_plans.status NOT IN ('cancelled', 'rejected')
  WHERE jobs.status IN ('planned', 'scheduled', 'in_progress')
  GROUP BY jobs.id
  HAVING COUNT(loading_plans.id) = 0
    AND (COUNT(DISTINCT tool_reservations.id) > 0 OR COUNT(DISTINCT material_requirements.id) > 0)
  ORDER BY MAX(jobs.updated_at) DESC, jobs.id ASC LIMIT 5`;
const indexes = ['idx_tool_reservations_job_status_id', 'idx_material_requirements_job_status_id'];
const rows = (db, sql) => db.prepare(sql).all().map(row => ({ ...row, tools: Number(row.tools), materials: Number(row.materials) }));
const snapshot = db => ['jobs', 'tool_reservations', 'material_requirements', 'loading_plans', 'approvals', 'audit_events']
  .map(table => db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());

function seed(db) {
  db.prepare('INSERT INTO clients (id,name,created_at,updated_at) VALUES (?,?,?,?)').run('loading-client', 'Synthetic loading client', '2099-01-01', '2099-01-01');
  const job = db.prepare('INSERT INTO jobs (id,client_id,title,status,created_at,updated_at) VALUES (?,?,?,?,?,?)');
  const tool = db.prepare('INSERT INTO tool_reservations (id,job_id,tool_name,status,created_at,updated_at) VALUES (?,?,?,?,?,?)');
  const material = db.prepare('INSERT INTO material_requirements (id,job_id,name,status,created_at,updated_at) VALUES (?,?,?,?,?,?)');
  const plan = db.prepare('INSERT INTO loading_plans (id,job_id,status,created_at,updated_at) VALUES (?,?,?,?,?)');
  for (let i = 0; i < 12; i++) {
    const id = `loading-${String(i).padStart(2, '0')}`;
    job.run(id, 'loading-client', id, i === 11 ? 'archived' : ['planned', 'scheduled', 'in_progress'][i % 3], '2099-01-01', i < 3 ? '2099-01-03' : '2099-01-02');
    if (i === 9) continue;
    const count = i === 3 ? 100 : 2;
    for (let n = 0; n < count; n++) {
      tool.run(`${id}-tool-${n}`, id, 'Synthetic tool', i === 10 ? 'released' : 'reserved', '2099-01-01', '2099-01-01');
      material.run(`${id}-material-${n}`, id, 'Synthetic material', i === 10 ? 'cancelled' : 'needed', '2099-01-01', '2099-01-01');
    }
    if (i < 3) for (let n = 0; n < 3; n++) plan.run(`${id}-plan-${n}`, id, ['draft', 'approved', 'loading'][n], '2099-01-01', '2099-01-01');
    else plan.run(`${id}-plan`, id, i % 2 ? 'cancelled' : 'rejected', '2099-01-01', '2099-01-01');
  }
}

function registerLoadingReadContract(test, { prefix, createLedger, skip = false }) {
  test(`${prefix} loading candidates avoid fanout and preserve scope, counts, ties and the newest five`, { skip }, async t => {
    const { ledger } = await createLedger(t);
    seed(ledger.db);
    const before = snapshot(ledger.db);
    const candidates = rows(ledger.db, loadingSql);
    assert.deepEqual(candidates, rows(ledger.db, legacySql));
    assert.deepEqual(candidates.map(row => row.id), ['loading-03', 'loading-04', 'loading-05', 'loading-06', 'loading-07']);
    assert.deepEqual(candidates[0], { id: 'loading-03', title: 'loading-03', tools: 100, materials: 100 });
    const actions = ledger.nextActions().filter(action => action.type === 'create_loading_plan');
    assert.deepEqual(actions.map(action => action.jobId), candidates.map(row => row.id));
    assert.equal(actions[0].message, 'loading-03 needs a loading checklist for 100 tool(s) and 100 material need(s).');
    assert.deepEqual(snapshot(ledger.db), before, 'candidate and dashboard reads must not write business records');
    ledger.db.prepare("UPDATE jobs SET updated_at = '2099-01-04' WHERE id = 'loading-08'").run();
    assert.deepEqual(rows(ledger.db, loadingSql).map(row => row.id), ['loading-08', 'loading-03', 'loading-04', 'loading-05', 'loading-06']);
    ledger.db.prepare("DELETE FROM tool_reservations WHERE job_id = 'loading-08'").run();
    assert.equal(rows(ledger.db, loadingSql)[0].tools, 0, 'materials alone still need a loading plan');
    ledger.db.prepare("DELETE FROM material_requirements WHERE job_id = 'loading-08'").run();
    assert.equal(rows(ledger.db, loadingSql).some(row => row.id === 'loading-08'), false);
  });

  test(`${prefix} loading indexes migrate from head 095, preserve records and reopen idempotently`, { skip }, async t => {
    const fixture = await createLedger(t);
    let ledger = fixture.ledger;
    seed(ledger.db);
    for (const index of indexes) ledger.db.exec(`DROP INDEX ${index}`);
    ledger.db.prepare("DELETE FROM ledger_schema_migrations WHERE version IN ('096_loading_read_indexes', '097_durable_evidence_storage_reservations')").run();
    ledger.db.exec('DROP TABLE IF EXISTS evidence_storage_reservations; DROP TABLE IF EXISTS evidence_storage_quota_lock;');
    assert.equal(ledger.migrationStatus().applied.at(-1).version, '095_field_reply_notifications');
    assert.deepEqual(ledger.migrationStatus().pending, [
      '096_loading_read_indexes',
      '097_durable_evidence_storage_reservations'
    ]);
    const before = snapshot(ledger.db);
    ledger.close();
    ledger = fixture.reopen();
    assert.equal(ledger.migrationStatus().currentVersion, '097_durable_evidence_storage_reservations');
    assert.deepEqual(ledger.migrationStatus().pending, []);
    assert.deepEqual(snapshot(ledger.db), before);
    const schema = ledger.databaseMode === 'postgres'
      ? ledger.db.prepare("SELECT indexname AS name, indexdef AS sql FROM pg_indexes WHERE schemaname = 'public'").all()
      : ledger.db.prepare("SELECT name, sql FROM sqlite_master WHERE type = 'index'").all();
    for (const index of indexes) assert.match(schema.find(row => row.name === index)?.sql || '', /\(job_id, status, id\)/);
    const migrations = ledger.migrationStatus().applied;
    ledger.close();
    ledger = fixture.reopen();
    assert.deepEqual(ledger.migrationStatus().applied, migrations);
    assert.deepEqual(snapshot(ledger.db), before);
    assert.deepEqual(rows(ledger.db, loadingSql), rows(ledger.db, legacySql));
  });
}

module.exports = { loadingSql, legacySql, rows, registerLoadingReadContract };
