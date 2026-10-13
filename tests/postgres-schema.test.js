const test = require('node:test');
const assert = require('node:assert/strict');
const { assertPostgresSchemaPath } = require('../postgres-sync-database');

test('PostgreSQL namespace preflight accepts only the canonical application schema', () => {
  for (const schemas of [['public'], ['public', 'pg_catalog']]) {
    assert.doesNotThrow(() => assertPostgresSchemaPath(schemas));
  }
});

test('PostgreSQL namespace preflight rejects missing, redirected and ambiguous application schemas', () => {
  for (const schemas of [undefined, null, 'public', [], ['owned'], ['owned', 'public'],
    ['public', 'owned'], ['pg_catalog', 'public'], ['pg_catalog'], ['public', 'pg_temp_1'], ['public', null]]) {
    assert.throws(() => assertPostgresSchemaPath(schemas), { code: 'postgres_schema_unsupported' });
  }
});
