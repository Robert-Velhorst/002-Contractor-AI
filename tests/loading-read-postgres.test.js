const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const test = require('node:test');
const { Client } = require('pg');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { registerLoadingReadContract } = require('./loading-read-contract');
const { postgresTestDatabaseUrl, connectVerifiedPostgresClient } = require('./postgres-test-database');
const connectionString = postgresTestDatabaseUrl();

registerLoadingReadContract(test, { prefix: 'PostgreSQL', skip: !connectionString, async createLedger(t) {
  const admin = await connectVerifiedPostgresClient(new Client({ connectionString }));
  const name = `contractor_ai_test_loading_${crypto.randomBytes(8).toString('hex')}`;
  assert.match(name, /^contractor_ai_test_loading_[a-f0-9]{16}$/);
  let created = false;
  let current;
  t.after(async () => {
    try { current?.close(); if (created) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); }
    finally { await admin.end(); }
  });
  await admin.query(`CREATE DATABASE "${name}"`);
  created = true;
  const url = new URL(connectionString); url.pathname = `/${name}`;
  const options = { databaseUrl: postgresTestDatabaseUrl(url.href) };
  current = new ContractorOperatingLedger(options);
  return { ledger: current, reopen() { current = new ContractorOperatingLedger(options); return current; } };
} });
