const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { Client } = require('pg');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { TABLES } = require('../asset-history');
const { verifyAssetContract } = require('./asset-history-contract');
const { postgresTestDatabaseUrl, connectVerifiedPostgresClient } = require('./postgres-test-database');
const connectionString = postgresTestDatabaseUrl();

test('PostgreSQL installed asset history and recurring inheritance match SQLite and retain native guards', { skip: !connectionString }, async t => {
  const admin = new Client({ connectionString }); await connectVerifiedPostgresClient(admin);
  const name = `contractor_asset_${randomBytes(8).toString('hex')}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(connectionString); url.pathname = `/${name}`;
  let ledger;
  t.after(async () => { ledger?.close(); try { await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); } finally { await admin.end(); } });
  ledger = new ContractorOperatingLedger({ databaseUrl: url.toString() });
  const fixture = verifyAssetContract(ledger);
  await t.test('concurrent history replicas serialize exact retries and competing writes', async () => {
    const children = [];
    function replica(input) {
      const script = `const {ContractorOperatingLedger}=require('./operating-ledger'); const {AssetHistory}=require('./asset-history');
        const ledger=new ContractorOperatingLedger({databaseUrl:process.env.ASSET_DATABASE}); console.log('READY');
        process.stdin.once('data',()=>{try{console.log(JSON.stringify({ok:true,...new AssetHistory(ledger).command(process.env.ASSET_JOB,JSON.parse(process.env.ASSET_COMMAND),'replica')}));}
        catch(e){console.log(JSON.stringify({ok:false,status:e.statusCode}));}finally{ledger.close();process.stdin.destroy();}});`;
      const child = spawn(process.execPath, ['-e', script], { cwd: path.resolve(__dirname, '..'), windowsHide: true,
        env: { ...process.env, ASSET_DATABASE: url.toString(), ASSET_JOB: fixture.job.id, ASSET_COMMAND: JSON.stringify(input) }, stdio: ['pipe', 'pipe', 'pipe'] });
      children.push(child);
      let output = '', readyResolve, readyReject;
      const ready = new Promise((resolve, reject) => { readyResolve = resolve; readyReject = reject; });
      const timer = setTimeout(() => child.kill(), 60000);
      child.stdout.on('data', bytes => { output += bytes.toString(); if (output.includes('READY\n')) readyResolve(); }); child.stderr.resume();
      const result = new Promise((resolve, reject) => {
        child.once('error', error => { clearTimeout(timer); readyReject(error); reject(error); });
        child.once('exit', code => { clearTimeout(timer); if (code !== 0) { const error = new Error(`Asset replica exited ${code}`); readyReject(error); reject(error); }
          else { try { resolve(JSON.parse(output.trim().split('\n').at(-1))); } catch (error) { reject(error); } } });
      });
      return { child, ready, result };
    }
    try {
      const command = { action: 'profile', record: { assetId: fixture.asset.id, manufacturer: 'Fixture', model: 'Vent-1', serialNumber: 'UNIT-001', reason: 'Concurrent verified identity' }, entryKey: 'concurrent-profile', sourceHash: fixture.history.read(fixture.job.id).sourceHash };
      const retry = [replica(command), replica(command)];
      await Promise.all(retry.map(row => row.ready)); retry.forEach(row => row.child.stdin.end('go'));
      const results = await Promise.all(retry.map(row => row.result));
      assert.ok(results.every(row => row.ok)); assert.equal(results.filter(row => row.replayed).length, 1);
      const sourceHash = fixture.history.read(fixture.job.id).sourceHash;
      const competing = ['claim-one', 'claim-two'].map(entryKey => replica({ ...command, sourceHash, entryKey }));
      await Promise.all(competing.map(row => row.ready)); competing.forEach(row => row.child.stdin.end('go'));
      const claims = await Promise.all(competing.map(row => row.result));
      assert.equal(claims.filter(row => row.ok).length, 1); assert.equal(claims.find(row => !row.ok).status, 409);
    } finally { for (const child of children) if (child.exitCode == null) child.kill(); }
  });
  ledger.db.exec("INSERT INTO company_authority (id,environment_id,generation,status,public_key,details_json,updated_at) VALUES ('current','fixture',1,'frozen','fixture','{}','fixture')");
  for (const table of TABLES) assert.throws(() => ledger.db.exec(`TRUNCATE ${table} CASCADE`), /company_authority_blocked/);
});
