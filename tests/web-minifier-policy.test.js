const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { minify } = require('terser');
const { transformSync } = require('esbuild');
const { renderToStaticMarkup } = require('react-dom/server');

let policy;
function options() {
  policy ??= import('../vite.config.js').then(({ default: configuration }) => {
    const { build } = configuration({ command: 'build', mode: 'production' });
    return { target: build.target, ...build.terserOptions, module: true, safari10: true };
  });
  return policy;
}

async function namespaces(source) {
  const { target: _target, ...configuration } = await options();
  const compressed = (await minify(source, configuration)).code;
  return Promise.all([source, compressed].map(code => import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)));
}

test('the web minifier matches the existing ES2022 target without enabling unsafe assumptions', async () => {
  const { target, ecma, compress, mangle } = await options();
  assert.equal(target, 'es2022');
  assert.equal(ecma, 2022);
  assert.equal(compress.passes, 10);
  for (const key of ['unsafe', 'unsafe_math', 'unsafe_comps', 'unsafe_arrows', 'unsafe_methods',
    'unsafe_proto', 'unsafe_regexp', 'unsafe_undefined', 'pure_new', 'builtins_pure', 'drop_console',
    'booleans_as_integers']) assert.notEqual(compress[key], true, key);
  assert.equal(compress.pure_funcs, undefined);
  assert.notEqual(compress.pure_getters, true);
  assert.notEqual(compress.keep_fargs, false);
  assert.equal(mangle?.properties, undefined);
});

test('minification retains API keys, Unicode evidence and strict boolean/null values', async () => {
  const [original, compiled] = await namespaces(`
    export function command(value) {
      const entryKey = 'bron-\u00e9\u20ac-001';
      const sourceHash = 'a'.repeat(64);
      return { action: 'update', entryKey, sourceHash, caseId: value.id,
        reassess: value.reassess === true, resolutionEvidence: value.note,
        optional: value.optional ?? null, zero: value.zero, hidden: undefined };
    }
  `);
  for (const value of [{ id: 'case-1', reassess: true, note: '<img src=x> & bewijs', zero: -0 },
    { id: 'case-2', reassess: 1, note: 'Gecontroleerd', optional: false, zero: 0 }]) {
    assert.deepEqual(compiled.command(value), original.command(value));
    assert.equal(JSON.stringify(compiled.command(value)), JSON.stringify(original.command(value)));
  }
});

test('minification preserves used getter and coercion order rather than assuming pure access', async () => {
  const [original, compiled] = await namespaces(`
    export function read(source, left, right) {
      const title = source.title;
      const amount = source.amount;
      return [title, amount, left < right, left <= right];
    }
  `);
  function run(namespace) {
    const reads = [];
    const result = namespace.read({ get title() { reads.push('title'); return 'Bron'; },
      get amount() { reads.push('amount'); return 12.1; } },
    { valueOf() { reads.push('left'); return 2; } }, { valueOf() { reads.push('right'); return 3; } });
    return { result, reads };
  }
  assert.deepEqual(run(compiled), run(original));
});

test('minification keeps finance arithmetic, NaN and negative zero behavior', async () => {
  const [original, compiled] = await namespaces(`
    export function finance(value) {
      return [Math.round(value * 100), (value * 0.1) * 3, value < NaN, Object.is(value, -0), value === false];
    }
  `);
  for (const value of [1.005, 0.1, 999999999999.99, -0, NaN, Infinity, false]) {
    assert.deepEqual(compiled.finance(value), original.finance(value));
  }
});

test('minification retains constructor, this, arity and exception behavior', async () => {
  const [original, compiled] = await namespaces(`
    export function inspect(value) {
      function Constructor(input, unused) { this.value = input; }
      const instance = new Constructor(value);
      const receiver = { value, read: function(unused) { return this.value; } };
      let message;
      try { if (value < 0) throw new Error('Bron gewijzigd'); } catch (error) { message = error.message; }
      return [instance.value, instance instanceof Constructor, Constructor.length,
        receiver.read(), receiver.read.length, message];
    }
  `);
  for (const value of [-1, 0, 4]) assert.deepEqual(compiled.inspect(value), original.inspect(value));
});

test('minification retains read cancellation and exact independent write options', async () => {
  const [original, compiled] = await namespaces(`
    export async function cycle(api, signal, command) {
      const response = await api('/read', { signal });
      if (signal.aborted) return null;
      await api('/write', { method: 'POST', body: JSON.stringify(command) });
      return response;
    }
  `);
  async function run(namespace, abort) {
    const controller = new AbortController(), calls = [];
    const command = { entryKey: 'exact-retry-001', sourceHash: 'b'.repeat(64), approved: false };
    const value = await namespace.cycle(async (url, configuration) => {
      calls.push({ url, configuration });
      if (abort) controller.abort();
      return 'current-source';
    }, controller.signal, command);
    assert.equal(calls[0].configuration.signal, controller.signal);
    if (!abort) assert.equal(Object.hasOwn(calls[1].configuration, 'signal'), false);
    return { value, calls: calls.map(({ url, configuration }) => ({ url,
      method: configuration.method, body: configuration.body, aborted: configuration.signal?.aborted })) };
  }
  for (const abort of [false, true]) assert.deepEqual(await run(compiled, abort), await run(original, abort));
});

test('minification preserves actual React props, handlers, child order and escaped markup', async () => {
  const { target, ...configuration } = await options();
  const source = transformSync(`export default data => <section aria-label="Herstel"><button disabled={data.disabled}
    onClick={data.onClick}>{data.text}</button><input ref={data.ref} value={data.text} onChange={data.onClick}/>
    {data.rows.map(row => <span key={row.id}>{row.title}</span>)}</section>`,
  { loader: 'jsx', jsx: 'automatic', format: 'cjs', target }).code;
  const compressed = (await minify(source, configuration)).code;
  function evaluate(code) {
    const module = { exports: {} };
    vm.runInNewContext(code, { module, exports: module.exports, require });
    return module.exports.default;
  }
  const data = { disabled: true, onClick() {}, ref: { current: null }, text: '<img src=x> & bewijs',
    rows: [{ id: 'second', title: 'Tweede' }, { id: 'first', title: 'Eerste' }] };
  const original = evaluate(source)(data), compiled = evaluate(compressed)(data);
  assert.equal(renderToStaticMarkup(compiled), renderToStaticMarkup(original));
  assert.equal(compiled.props.children[0].props.onClick, data.onClick);
  assert.equal(compiled.props.children[0].props.disabled, true);
  assert.equal(compiled.props.children[1].props.ref, data.ref);
  assert.deepEqual(Array.from(compiled.props.children[2], child => child.key), ['second', 'first']);
});
