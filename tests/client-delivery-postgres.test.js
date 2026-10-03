const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { TABLES } = require('../client-delivery');
const { setupClientDelivery, verifyClientDeliveryContract } = require('./client-delivery-contract');
const { postgresTestDatabaseUrl, connectVerifiedPostgresClient } = require('./postgres-test-database');
const connectionString = postgresTestDatabaseUrl();
test('PostgreSQL client offers and reviewed responses match SQLite', { skip: !connectionString }, async t => {
  const admin = new Client({ connectionString }); await connectVerifiedPostgresClient(admin);
  const name = `contractor_client_delivery_${randomBytes(8).toString('hex')}`; await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(connectionString); url.pathname = `/${name}`; let ledger;
  t.after(async () => { ledger?.close(); try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); } finally { await admin.end(); } });
  ledger = new ContractorOperatingLedger({ databaseUrl: url.toString() }); verifyClientDeliveryContract(ledger);
  await t.test('concurrent client retries retain one response, one conversation entry and one review', async () => {
    const f = setupClientDelivery(ledger), offered = f.clientCommand('offer', f.offer);
    ledger.resolveApproval(offered.approvalId, { status: 'approved' }); const input = f.clientResponse(offered.offerId);
    function replica() {
      const script = `const {ContractorOperatingLedger}=require('./operating-ledger');const {ClientDelivery}=require('./client-delivery');
        const l=new ContractorOperatingLedger({databaseUrl:process.env.DELIVERY_DATABASE});console.log('READY');
        process.stdin.once('data',()=>{try{console.log(JSON.stringify({ok:true,...new ClientDelivery(l).submit(process.env.DELIVERY_ACCESS,process.env.DELIVERY_OFFER,JSON.parse(process.env.DELIVERY_INPUT))}));}
        catch(e){console.log(JSON.stringify({ok:false,status:e.statusCode,message:e.message}));}finally{l.close();process.stdin.destroy();}});`;
      const child = spawn(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), windowsHide: true,
        env: { ...process.env, DELIVERY_DATABASE: url.toString(), DELIVERY_ACCESS: f.access.id, DELIVERY_OFFER: offered.offerId, DELIVERY_INPUT: JSON.stringify(input) }, stdio: ['pipe', 'pipe', 'pipe'] });
      let output = '', readyResolve, rejectReady;
      const ready = new Promise((resolve, reject) => { readyResolve = resolve; rejectReady = reject; });
      const timer = setTimeout(() => child.kill(), 90000);
      child.stdout.on('data', bytes => { output += bytes.toString(); if (output.includes('READY\n')) readyResolve(); }); child.stderr.resume();
      const result = new Promise((resolve, reject) => {
        child.once('error', error => { clearTimeout(timer); rejectReady(error); reject(error); });
        child.once('exit', code => { clearTimeout(timer); if (code !== 0) { const error = new Error(`Client response replica exited ${code}`); rejectReady(error); reject(error); }
          else { try { resolve(JSON.parse(output.trim().split('\n').at(-1))); } catch (error) { reject(error); } } });
      });
      return { child, ready, result };
    }
    const replicas = [replica(), replica()]; await Promise.all(replicas.map(row => row.ready)); replicas.forEach(row => row.child.stdin.end('go'));
    const results = await Promise.all(replicas.map(row => row.result));
    assert.ok(results.every(row => row.ok), JSON.stringify(results)); assert.equal(results[0].response.id, results[1].response.id);
    assert.equal(results.filter(row => row.replayed).length, 1);
    assert.equal(Number(ledger.db.prepare('SELECT count(*) AS n FROM client_delivery_responses WHERE offer_id = ?').get(offered.offerId).n), 1);
    assert.equal(f.clients.chat.list(f.access.id).messages.length, 1);
    assert.equal(Number(ledger.db.prepare("SELECT count(*) AS n FROM work_delivery_decisions WHERE delivery_id = ? AND status = 'pending'").get(f.deliveryId).n), 1);
  });
  ledger.db.exec("INSERT INTO company_authority (id,environment_id,generation,status,public_key,details_json,updated_at) VALUES ('current','fixture',1,'frozen','fixture','{}','fixture')");
  for (const table of TABLES) assert.throws(() => ledger.db.exec(`TRUNCATE ${table} CASCADE`), /company_authority_blocked/);
});
