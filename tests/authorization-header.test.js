const assert = require('node:assert/strict');
const test = require('node:test');
const { authorizationPayload } = require('../authorization-header');

test('authorization parsing accepts standard case-insensitive schemes and whitespace', () => {
  assert.equal(authorizationPayload('Bearer abc.def', 'Bearer'), 'abc.def');
  assert.equal(authorizationPayload('bEaReR   abc.def  ', 'Bearer'), 'abc.def');
  assert.equal(authorizationPayload('Basic dXNlcjpwYXNz', 'Basic'), 'dXNlcjpwYXNz');
});

test('authorization parsing rejects malformed and oversized headers', () => {
  assert.equal(authorizationPayload(' Bearer token', 'Bearer'), '');
  assert.equal(authorizationPayload('Bearer', 'Bearer'), '');
  assert.equal(authorizationPayload('Bearer\ttoken', 'Bearer'), 'token');
  assert.equal(authorizationPayload('Token secret', 'Bearer'), '');
  assert.equal(authorizationPayload(`Bearer ${'x'.repeat(8192)}`, 'Bearer'), '');
});
