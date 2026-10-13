const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const test = require('node:test');
const { ContractorOperatingLedger } = require('../operating-ledger');

function fixture(t) {
  const db = new DatabaseSync(':memory:');
  t.after(() => db.close());
  db.exec(`
    CREATE TABLE jobs (id TEXT PRIMARY KEY, request_id TEXT, status TEXT);
    CREATE TABLE job_requests (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE job_tasks (id TEXT PRIMARY KEY, job_id TEXT, status TEXT);
    CREATE TABLE documents (id TEXT PRIMARY KEY, job_id TEXT, status TEXT, type TEXT);
    CREATE TABLE job_qualification_requirements (id TEXT PRIMARY KEY, job_id TEXT, status TEXT, credential_type TEXT);
    CREATE TABLE worker_availability_periods (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE audit_events (id TEXT PRIMARY KEY, job_id TEXT);
    CREATE TABLE lmra_assessments (id TEXT PRIMARY KEY, job_id TEXT, outcome TEXT);
    INSERT INTO job_requests VALUES
      ('unlinked', 'open'), ('multiple', 'open'), ('mixed', 'open'),
      ('terminal', 'closed'), ('null-status', 'open'), (NULL, 'open');
    INSERT INTO jobs VALUES
      ('active-a', 'multiple', 'intake'), ('active-b', 'multiple', 'scheduled'),
      ('active-c', 'mixed', 'intake'), ('archived', 'mixed', 'archived'),
      ('cancelled', 'terminal', 'cancelled'), ('unknown', 'null-status', NULL),
      (NULL, NULL, 'intake');
    INSERT INTO job_tasks VALUES
      ('active', 'active-a', 'open'), ('closed', 'active-b', 'closed'),
      ('global', NULL, 'open'), ('archived', 'archived', 'open'),
      ('cancelled', 'cancelled', 'open'), ('null-status', 'unknown', 'open'),
      ('orphan', 'missing', 'open'), ('unknown', 'active-c', NULL),
      (NULL, 'active-a', 'open');
    INSERT INTO documents VALUES
      ('active', 'active-a', 'draft', 'photo'),
      ('ready', 'active-a', 'reviewed', 'photo'),
      ('other-type', 'active-b', 'draft', 'drawing'),
      ('global', NULL, 'draft', 'photo'),
      ('archived', 'archived', 'draft', 'photo'),
      ('orphan', 'missing', 'draft', 'photo'),
      ('unknown', 'active-c', NULL, 'photo'),
      (NULL, 'active-a', 'draft', 'photo');
    INSERT INTO job_qualification_requirements VALUES
      ('active', 'active-a', 'draft', 'safety'), ('ready', 'active-a', 'reviewed', 'safety'),
      ('global', NULL, 'draft', 'safety'), ('other', 'active-b', 'draft', 'trade'),
      ('archived', 'archived', 'draft', 'safety'), (NULL, 'active-a', 'draft', 'safety');
    INSERT INTO worker_availability_periods VALUES
      ('active', 'open'), ('ready', 'reviewed'), ('closed', 'closed'), (NULL, 'open');
    INSERT INTO audit_events VALUES ('active', 'active-a'), ('global', NULL), ('archived', 'archived'), (NULL, NULL);
    INSERT INTO lmra_assessments VALUES ('active', 'active-a', 'pending'), ('closed', 'active-a', 'closed'), ('archived', 'archived', 'pending'), (NULL, 'active-a', 'pending');
  `);
  const statements = [];
  const ledger = Object.create(ContractorOperatingLedger.prototype);
  ledger.db = { prepare(sql) { statements.push(sql); return db.prepare(sql); } };
  // Recreate the old DISTINCT query on the identical scope, data and parameters.
  const legacy = Object.create(ContractorOperatingLedger.prototype);
  legacy.db = { prepare(sql) { return db.prepare(sql.replaceAll('COUNT(records.id)', 'COUNT(DISTINCT records.id)')); } };
  return { ledger, legacy, statements };
}

test('only one-to-many request scopes deduplicate counted primary keys', t => {
  const { ledger, statements } = fixture(t);
  for (const table of ['jobs', 'job_tasks', 'documents', 'worker_availability_periods', 'audit_events', 'lmra_assessments']) {
    ledger.countActiveRecords(table);
    assert.match(statements.at(-1), /COUNT\(records\.id\)/, table);
    assert.doesNotMatch(statements.at(-1), /DISTINCT/, table);
  }
  assert.equal(ledger.countActiveRecords('job_requests'), 3);
  assert.match(statements.at(-1), /COUNT\(DISTINCT records\.id\)/);
});

test('active counts preserve terminal, orphan, global, null and fanout semantics', t => {
  const { ledger, legacy } = fixture(t);
  const cases = [
    ['jobs', '1 = 1', [], 3], ['job_requests', '1 = 1', [], 3],
    ['job_tasks', '1 = 1', [], 4], ['job_tasks', 'records.status = ?', ['open'], 2],
    ['documents', '1 = 1', [], 5], ['documents', 'records.type = ?', ['photo'], 4],
    ['worker_availability_periods', '1 = 1', [], 3],
    ['audit_events', '1 = 1', [], 2], ['lmra_assessments', '1 = 1', [], 2],
    ['job_requests', 'records.status = ?', ['closed'], 0],
    ['job_tasks', 'records.status = ?', ['nonexistent'], 0]
  ];
  for (const [table, condition, params, expected] of cases) {
    assert.equal(ledger.countActiveRecords(table, condition, params), expected, table);
    assert.equal(ledger.countActiveRecords(table, condition, params), legacy.countActiveRecords(table, condition, params), table);
  }
});

test('capability coverage preserves status precedence, record types and request fanout', t => {
  const { ledger, legacy, statements } = fixture(t);
  const cases = [
    [{}, 0], [{ table: 'documents' }, 5],
    [{ table: 'documents', recordType: 'photo' }, 4],
    [{ table: 'documents', coverageStatuses: ['draft', 'reviewed'], recordType: 'drawing' }, 4],
    [{ table: 'documents', coverageStatuses: ['missing'] }, 0],
    [{ table: 'job_requests', coverageStatuses: ['open'] }, 3],
    [{ table: 'worker_availability_periods', coverageStatuses: ['reviewed'] }, 1]
  ];
  for (const [requirement, expected] of cases) {
    assert.equal(ledger.countCapabilityRequirement(requirement), expected);
    assert.equal(ledger.countCapabilityRequirement(requirement), legacy.countCapabilityRequirement(requirement));
    if (requirement.table) assert.equal(statements.at(-1).includes('DISTINCT'), requirement.table === 'job_requests');
  }
});

test('open capability counts preserve type, credential, ready-state and outcome filters', t => {
  const { ledger, legacy, statements } = fixture(t);
  const cases = [
    {}, { table: 'documents' }, { table: 'documents', recordType: 'photo' },
    { table: 'job_qualification_requirements', credentialType: 'safety', readyStatuses: ['reviewed', 'reviewed'] },
    { table: 'documents', recordType: 'drawing', credentialType: 'safety' },
    { table: 'job_requests' }, { table: 'jobs' }, { table: 'job_tasks' },
    { table: 'worker_availability_periods' }, { table: 'lmra_assessments' },
    { table: 'audit_events' }
  ];
  for (const requirement of cases) {
    assert.equal(ledger.countOpenCapabilityRequirement(requirement), legacy.countOpenCapabilityRequirement(requirement));
    if (requirement.table && requirement.table !== 'audit_events') {
      assert.equal(statements.at(-1).includes('DISTINCT'), requirement.table === 'job_requests');
    }
  }
  assert.equal(ledger.countOpenCapabilityRequirement({ table: 'job_qualification_requirements', credentialType: 'safety', readyStatuses: ['reviewed'] }), 2);
  assert.equal(ledger.countOpenCapabilityRequirement({ table: 'job_requests' }), 3);
  assert.equal(ledger.countOpenCapabilityRequirement({ table: 'audit_events' }), 0);
});
