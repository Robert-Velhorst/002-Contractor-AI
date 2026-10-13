const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { WorkContext, TABLES } = require('../work-context');
const { WorkBoard } = require('../work-board');
const { setup, hierarchy, packageInput, verifyContract } = require('./work-context-contract');

function fixture(t) {
  const ledger = new ContractorOperatingLedger({ dbFile: ':memory:' });
  t.after(() => ledger.close()); return ledger;
}

test('SQLite shared context connects physical hierarchy, roles, tasks, quantities, field privacy and source-bound review', t => verifyContract(fixture(t)));

test('work context exact replay is retained and stale or reused commands make no writes', t => {
  const ledger = fixture(t), { context, job } = setup(ledger);
  const input = { action: 'save_place', entryKey: 'place-command', sourceHash: context.read(job.id).sourceHash, record: { type: 'site', name: 'New site' } };
  const first = context.command(job.id, input, 'owner');
  assert.equal(new WorkContext(ledger).command(job.id, input, 'owner').replayed, true);
  assert.equal(context.read(job.id).places.length, 1);
  assert.throws(() => context.command(job.id, { ...input, record: { type: 'site', name: 'Different' } }, 'owner'), { statusCode: 409 });
  assert.throws(() => context.command(job.id, { ...input, entryKey: 'stale-write' }, 'owner'), { statusCode: 409 });
  assert.equal(context.read(job.id).sourceHash, first.sourceHash);
  assert.equal(ledger.db.prepare('SELECT COUNT(*) AS n FROM work_context_commands').get().n, 1);
});

test('work context tables retain all native authority fences', t => {
  const ledger = fixture(t);
  for (const table of TABLES) for (const operation of ['insert', 'update', 'delete']) assert.ok(ledger.db.prepare("SELECT name FROM sqlite_master WHERE type = 'trigger' AND name = ?").get(`authority_${table}_${operation}`));
  ledger.db.exec("INSERT INTO company_authority (id,environment_id,generation,status,public_key,details_json,updated_at) VALUES ('current','fixture',1,'frozen','fixture','{}','fixture')");
  assert.throws(() => ledger.db.exec("UPDATE work_context_control SET revision = 2"), /company_authority_blocked/);
});

test('backup verification retains work context and rejects a missing control table or native guard', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'context-backup-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(root, 'ledger.sqlite') });
  t.after(() => { ledger.close(); assert.equal(path.dirname(root), fs.realpathSync(os.tmpdir())); assert.ok(path.basename(root).startsWith('context-backup-')); fs.rmSync(root, { recursive: true, force: true }); });
  const { verifySqliteBackupDatabase } = require('../scripts/restore-local-backup');
  const f = setup(ledger); hierarchy(f);
  assert.equal(verifySqliteBackupDatabase(ledger.dbFile).valid, true);
  ledger.db.exec('DROP TRIGGER authority_work_places_update');
  assert.throws(() => verifySqliteBackupDatabase(ledger.dbFile), /write guard is missing: work_places.update/);
  ledger.db.exec("CREATE TRIGGER authority_work_places_update BEFORE UPDATE ON work_places WHEN EXISTS (SELECT 1 FROM company_authority WHERE status <> 'active') BEGIN SELECT RAISE(ABORT, 'company_authority_blocked'); END;");
  ledger.db.exec('DROP TABLE work_context_control');
  assert.throws(() => verifySqliteBackupDatabase(ledger.dbFile), /work context table is missing: work_context_control/);
});

test('package source changes block new placement, retain existing interests and require reviewed republication', async t => {
  const ledger = fixture(t), f = setup(ledger), { context, command, job } = f;
  const { room } = hierarchy(f), item = command('save_package', packageInput(f, room.id)).record;
  const board = new WorkBoard(ledger);
  const person = await board.register({ email: 'work-context@example.test', password: 'test-password-at-least-12', name: 'Applicant', phone: '0612345678', region: 'NL', skills: ['Carpenter'], privacyAccepted: true });
  const starts = new Date(Date.now() + 10 * 86400000), ends = new Date(starts.getTime() + 8 * 3600000);
  const input = { entryKey: randomUUID(), title: 'Door installation', role: 'Carpenter', city: 'Arnhem', description: 'Install doors', materials: 'Provided', equipment: 'Hand tools', prerequisites: 'Check dimensions', startsAt: starts.toISOString(), endsAt: ends.toISOString(), hours: 8, rate: 50, capacity: 2, sourceTaskIds: item.taskIds, workPackageId: item.id, workPackageSourceHash: context.packageBasis(job.id, item.id).sourceHash, confirmPublication: true };
  const position = board.publish(job.id, input, 'owner');
  assert.equal(position.workPackageCurrent, true);
  assert.equal(board.enroll(person.id, position.id, position.revision).status, 'interested');
  command('save_package', { ...item, outcome: 'Three doors instead of two' });
  assert.equal(board.position(position.id).workPackageCurrent, false);
  assert.throws(() => board.enroll(person.id, position.id, position.revision), { statusCode: 409 });
  assert.equal(board.applications(person.id).length, 1);
  assert.equal(board.publish(job.id, input, 'owner').id, position.id);
  assert.throws(() => board.publish(job.id, { ...input, entryKey: randomUUID() }, 'owner'), { statusCode: 409 });
  assert.equal(board.publish(job.id, { ...input, entryKey: randomUUID(), workPackageSourceHash: context.packageBasis(job.id, item.id).sourceHash }, 'owner').workPackageCurrent, true);
  ledger.db.prepare("UPDATE job_tasks SET status = 'completed' WHERE id = ?").run(job.tasks[0].id);
  assert.throws(() => context.packageBasis(job.id, item.id), { statusCode: 409 });
});
