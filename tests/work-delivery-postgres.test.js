const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { TABLES } = require('../work-delivery');
const { verifyDeliveryContract } = require('./work-delivery-contract');
const { postgresTestDatabaseUrl, connectVerifiedPostgresClient } = require('./postgres-test-database');
const connectionString = postgresTestDatabaseUrl();
test('PostgreSQL partial-delivery lifecycle and native guards match SQLite', { skip: !connectionString }, async t => {
  const admin = new Client({ connectionString }); await connectVerifiedPostgresClient(admin);
  const name = `contractor_delivery_${randomBytes(8).toString('hex')}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(connectionString); url.pathname = `/${name}`;
  let ledger;
  t.after(async () => { ledger?.close(); try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); } finally { await admin.end(); } });
  ledger = new ContractorOperatingLedger({ databaseUrl: url.toString() });
  const fixture = verifyDeliveryContract(ledger);
  await t.test('concurrent replicas retain one allocation and exact retries recover the same result', async () => {
    const entry = fixture.produce('concurrent');
    const command = { action: 'retain', record: { ...fixture.input, entryIds: [entry.id] }, entryKey: 'concurrent-delivery', sourceHash: fixture.delivery.read(fixture.job.id).sourceHash };
    function replica(input) {
      const script = `const {ContractorOperatingLedger}=require('./operating-ledger'); const {WorkDelivery}=require('./work-delivery');
        const l=new ContractorOperatingLedger({databaseUrl:process.env.DELIVERY_DATABASE}); console.log('READY');
        process.stdin.once('data',()=>{try{console.log(JSON.stringify({ok:true,...new WorkDelivery(l).command(process.env.DELIVERY_JOB,JSON.parse(process.env.DELIVERY_COMMAND),'replica')}));}
        catch(e){console.log(JSON.stringify({ok:false,status:e.statusCode}));}finally{l.close();process.stdin.destroy();}});`;
      const child = spawn(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), windowsHide: true,
        env: { ...process.env, DELIVERY_DATABASE: url.toString(), DELIVERY_JOB: fixture.job.id, DELIVERY_COMMAND: JSON.stringify(input) }, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '', readyResolve, rejectReady;
      const ready = new Promise((resolve, reject) => { readyResolve = resolve; rejectReady = reject; });
      const timer = setTimeout(() => child.kill(), 60000);
      child.stdout.on('data', bytes => { output += bytes.toString(); if (output.includes('READY\n')) readyResolve(); });
      child.stderr.resume();
      const result = new Promise((resolve, reject) => {
        child.once('error', error => { clearTimeout(timer); rejectReady(error); reject(error); });
        child.once('exit', code => { clearTimeout(timer); if (code !== 0) { const error = new Error(`Delivery replica exited ${code}`); rejectReady(error); reject(error); }
          else { try { resolve(JSON.parse(output.trim().split('\n').at(-1))); } catch (error) { reject(error); } } });
      });
      return { child, ready, result };
    }
    const replicas = [replica(command), replica(command)];
    await Promise.all(replicas.map(row => row.ready)); replicas.forEach(row => row.child.stdin.end('go'));
    const results = await Promise.all(replicas.map(row => row.result));
    assert.ok(results.every(row => row.ok));
    assert.equal(results[0].deliveryId, results[1].deliveryId);
    assert.equal(results.filter(row => row.replayed).length, 1);
    const next = fixture.produce('concurrent-competing'), sourceHash = fixture.delivery.read(fixture.job.id).sourceHash;
    const competing = ['first-claim', 'second-claim'].map(entryKey => replica({ ...command, sourceHash, entryKey, record: { ...fixture.input, entryIds: [next.id] } }));
    await Promise.all(competing.map(row => row.ready)); competing.forEach(row => row.child.stdin.end('go'));
    const claims = await Promise.all(competing.map(row => row.result));
    assert.equal(claims.filter(row => row.ok).length, 1);
    assert.equal(claims.find(row => !row.ok).status, 409);
  });
  ledger.db.exec("INSERT INTO company_authority (id,environment_id,generation,status,public_key,details_json,updated_at) VALUES ('current','fixture',1,'frozen','fixture','{}','fixture')");
  for (const table of TABLES) assert.throws(() => ledger.db.exec(`TRUNCATE ${table} CASCADE`), /company_authority_blocked/);
});
