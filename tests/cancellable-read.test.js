const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: settle } = require('node:timers/promises');

test('active reads retain success, failure and settled callbacks with read-only options', async () => {
  const { cancellableRead } = await import('../cancellable-read.mjs');
  for (const fail of [false, true]) {
    const result = { sourceHash: 'retained' }, error = new Error('Unavailable'), events = [];
    let options;
    const dispose = cancellableRead((url, input) => {
      assert.equal(url, '/api/ledger/jobs/job/work-context'); options = input;
      return fail ? Promise.reject(error) : Promise.resolve(result);
    }, '/api/ledger/jobs/job/work-context', value => events.push(['result', value]),
    value => events.push(['error', value]), () => events.push(['settled']));
    assert.deepEqual(Object.keys(options), ['signal']);
    assert.equal(options.signal.aborted, false);
    await settle();
    assert.deepEqual(events, [[fail ? 'error' : 'result', fail ? error : result], ['settled']]);
    dispose(); dispose();
    assert.equal(options.signal.aborted, true);
    assert.equal(events.length, 2);
  }
});

test('disposed reads ignore late success and rejection even when a transport ignores its signal', async () => {
  const { cancellableRead } = await import('../cancellable-read.mjs');
  for (const fail of [false, true]) {
    let resolve, reject, signal;
    const events = [];
    const dispose = cancellableRead((_url, options) => {
      signal = options.signal;
      return new Promise((yes, no) => { resolve = yes; reject = no; });
    }, '/api/ledger/read', value => events.push(value), value => events.push(value), () => events.push('settled'));
    dispose();
    assert.equal(signal.aborted, true);
    if (fail) reject(new Error('Obsolete failure')); else resolve({ obsolete: true });
    await settle();
    assert.deepEqual(events, []);
  }
});

test('overlapping reads have independent cancellation and a disposed callback cannot settle UI state', async () => {
  const { cancellableRead } = await import('../cancellable-read.mjs');
  const signals = [], events = [];
  const api = (_url, options) => { signals.push(options.signal); return Promise.resolve('current'); };
  const disposeFirst = cancellableRead(api, '/first', () => events.push('obsolete'), assert.fail, assert.fail);
  let disposeSecond;
  disposeSecond = cancellableRead(api, '/second', value => { events.push(value); disposeSecond(); }, assert.fail, assert.fail);
  assert.notEqual(signals[0], signals[1]);
  disposeFirst();
  assert.equal(signals[0].aborted, true);
  assert.equal(signals[1].aborted, false);
  await settle();
  assert.deepEqual(events, ['current']);
  assert.equal(signals[1].aborted, true);
});
