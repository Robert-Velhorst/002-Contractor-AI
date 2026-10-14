const assert = require('node:assert/strict');
const test = require('node:test');
const { isValidEmailAddress } = require('../email-validation');

test('email validation is bounded and rejects malformed address structure', () => {
  assert.equal(isValidEmailAddress('new@example.test'), true);
  assert.equal(isValidEmailAddress('name+trade@sub.example.nl'), true);
  assert.equal(isValidEmailAddress('naam@bakkers-café.nl'), true);
  assert.equal(isValidEmailAddress(''), false);
  assert.equal(isValidEmailAddress('a..b@example.test'), false);
  assert.equal(isValidEmailAddress('a@@example.test'), false);
  assert.equal(isValidEmailAddress('a@example..test'), false);
  assert.equal(isValidEmailAddress('a@-example.test'), false);
  assert.equal(isValidEmailAddress(`a@${'x'.repeat(300)}.test`), false);
});
