const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { TABLES } = require('../inspection-coverage');
const { setupCoverage, verifyCoverageContract } = require('./inspection-coverage-contract');
const { postgresTestDatabaseUrl, connectVerifiedPostgresClient } = require('./postgres-test-database');
const connectionString = postgresTestDatabaseUrl();
test('PostgreSQL inspection coverage and independent approval match SQLite', { skip: !connectionString }, async t => {
  const admin = new Client({ connectionString }); await connectVerifiedPostgresClient(admin);
  const name = `contractor_coverage_${randomBytes(8).toString('hex')}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(connectionString); url.pathname = `/${name}`;
  let ledger;
  t.after(async () => { ledger?.close(); try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); } finally { await admin.end(); } });
  ledger = new ContractorOperatingLedger({ databaseUrl: url.toString() });
  verifyCoverageContract(ledger);
  await t.test('concurrent coverage replicas retain one plan and reuse the exact receipt', async () => {
    const fixture = setupCoverage(ledger);
    const input = { action: 'plan', record: fixture.coveragePlan, entryKey: 'coverage-concurrent', sourceHash: fixture.coverage.read(fixture.job.id).sourceHash };
    function replica(command) {
      const script = `const {ContractorOperatingLedger}=require('./operating-ledger');const {InspectionCoverage}=require('./inspection-coverage');
        const l=new ContractorOperatingLedger({databaseUrl:process.env.COVERAGE_DATABASE});console.log('READY');
        process.stdin.once('data',()=>{try{console.log(JSON.stringify({ok:true,...new InspectionCoverage(l).command(process.env.COVERAGE_JOB,JSON.parse(process.env.COVERAGE_COMMAND),'replica')}));}
        catch(e){console.log(JSON.stringify({ok:false,status:e.statusCode}));}finally{l.close();process.stdin.destroy();}});`;
      const child = spawn(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), windowsHide: true,
        env: { ...process.env, COVERAGE_DATABASE: url.toString(), COVERAGE_JOB: fixture.job.id, COVERAGE_COMMAND: JSON.stringify(command) }, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '', readyResolve, rejectReady;
      const ready = new Promise((resolve, reject) => { readyResolve = resolve; rejectReady = reject; });
      const timer = setTimeout(() => child.kill(), 60000);
      child.stdout.on('data', bytes => { output += bytes.toString(); if (output.includes('READY\n')) readyResolve(); }); child.stderr.resume();
      const result = new Promise((resolve, reject) => {
        child.once('error', error => { clearTimeout(timer); rejectReady(error); reject(error); });
        child.once('exit', code => { clearTimeout(timer); if (code !== 0) { const error = new Error(`Coverage replica exited ${code}`); rejectReady(error); reject(error); }
          else { try { resolve(JSON.parse(output.trim().split('\n').at(-1))); } catch (error) { reject(error); } } });
      });
      return { child, ready, result };
    }
    const replicas = [replica(input), replica(input)];
    await Promise.all(replicas.map(row => row.ready)); replicas.forEach(row => row.child.stdin.end('go'));
    const results = await Promise.all(replicas.map(row => row.result));
    assert.ok(results.every(row => row.ok)); assert.equal(results[0].decisionId, results[1].decisionId);
    assert.equal(results.filter(row => row.replayed).length, 1);
    assert.equal(Number(ledger.db.prepare('SELECT count(*) AS n FROM inspection_coverage_decisions WHERE delivery_id = ?').get(fixture.deliveryId).n), 1);
  });
  ledger.db.exec("INSERT INTO company_authority (id,environment_id,generation,status,public_key,details_json,updated_at) VALUES ('current','fixture',1,'frozen','fixture','{}','fixture')");
  for (const table of TABLES) assert.throws(() => ledger.db.exec(`TRUNCATE ${table} CASCADE`), /company_authority_blocked/);
});
