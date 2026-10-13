const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');

async function fixture(build = {}, format = 'es', factory) {
  const preloadChunkMinifierPlugin = factory || (await import('../preload-chunk-minifier.mjs')).preloadChunkMinifierPlugin;
  const plugin = preloadChunkMinifierPlugin();
  plugin.configResolved({ build: { minify: 'terser', sourcemap: false,
    terserOptions: { ecma: 2022, compress: { passes: 10 } }, ...build } });
  plugin.renderStart({ format });
  return plugin;
}

function source() {
  const files = Array.from({ length: 30 }, (_, index) => `/assets/retained-screen-${index}-${index * 7919}.js`);
  return `const __vite__mapDeps = (indexes, retained = __vite__mapDeps,
    dependencies = (retained.f || (retained.f = ${JSON.stringify(files)}))) => indexes.map(index => dependencies[index]);
    export function read(indexes) { return [__vite__mapDeps(indexes), __vite__mapDeps([0, 1]), __vite__mapDeps([])]; }
    export const evidence = '<img src=x> & \u00e9\u20ac';
    export const status = 'approval_pending';`;
}

function chunk(code = source()) {
  return { type: 'chunk', fileName: 'assets/screen-hash.js', code, map: null,
    imports: ['assets/runtime-hash.js'], dynamicImports: ['assets/child-hash.js'],
    exports: ['read', 'evidence', 'status'], viteMetadata: { importedCss: new Set(['assets/screen-hash.css']) } };
}

function bytes(code) {
  return { raw: Buffer.byteLength(code), gzip: zlib.gzipSync(code, { level: 9 }).length,
    brotli: Math.min(...[10, 11].map(quality => zlib.brotliCompressSync(code,
      { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality } }).length)) };
}

test('late preload minification preserves public exports, exact paths and metadata while reducing transfer', async () => {
  const plugin = await fixture(), entry = chunk(), original = entry.code;
  const retained = { fileName: entry.fileName, imports: entry.imports, dynamicImports: entry.dynamicImports,
    exports: entry.exports, viteMetadata: entry.viteMetadata };
  await plugin.generateBundle.handler({ format: 'es' }, { [entry.fileName]: entry });
  assert.notEqual(entry.code, original);
  const before = bytes(original), after = bytes(entry.code);
  assert.ok(after.raw < before.raw);
  assert.ok(after.gzip < before.gzip);
  assert.ok(after.brotli <= before.brotli);
  for (const [key, value] of Object.entries(retained)) assert.equal(entry[key], value);
  const [sourceModule, compressedModule] = await Promise.all([original, entry.code]
    .map(code => import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`)));
  assert.deepEqual(Object.keys(compressedModule), Object.keys(sourceModule));
  for (const indexes of [[29, 0, 2], [], [1, 1, 0]]) assert.deepEqual(compressedModule.read(indexes), sourceModule.read(indexes));
  assert.equal(compressedModule.evidence, sourceModule.evidence);
  assert.equal(compressedModule.status, sourceModule.status);
});

test('preload minification has deterministic code and a policy-bound hash before names are finalized', async () => {
  const first = await fixture(), second = await fixture(), entry = chunk(), repeated = chunk();
  const identity = first.augmentChunkHash(entry);
  assert.match(identity, /^[a-f0-9]{64}$/);
  assert.equal(second.augmentChunkHash(repeated), identity);
  const changed = await fixture({ terserOptions: { ecma: 2022, compress: { passes: 2 } } });
  assert.notEqual(changed.augmentChunkHash(entry), identity);
  assert.equal(first.augmentChunkHash({ ...entry, dynamicImports: [] }), undefined);
  await first.generateBundle.handler({ format: 'es' }, { entry });
  await second.generateBundle.handler({ format: 'es' }, { entry: repeated });
  assert.equal(repeated.code, entry.code);
});

test('cache identity follows Node and both compression runtimes used to choose the retained code', async t => {
  const descriptors = Object.fromEntries(['node', 'zlib', 'brotli'].map(key => [key, Object.getOwnPropertyDescriptor(process.versions, key)]));
  t.after(() => Object.defineProperties(process.versions, descriptors));
  const current = (await fixture()).augmentChunkHash(chunk());
  for (const key of Object.keys(descriptors)) {
    Object.defineProperty(process.versions, key, { ...descriptors[key], value: `fixture-${key}-version` });
    assert.notEqual((await fixture()).augmentChunkHash(chunk()), current, `${key} changes the compression selection policy`);
    Object.defineProperty(process.versions, key, descriptors[key]);
  }
});

test('a compiler version change also invalidates the late-minified chunk identity', async t => {
  const metadata = require('terser/package.json'), version = metadata.version;
  t.after(() => { metadata.version = version; });
  const current = (await fixture()).augmentChunkHash(chunk());
  metadata.version = `fixture-${version}`;
  const { preloadChunkMinifierPlugin } = await import('../preload-chunk-minifier.mjs?compiler-version-proof');
  assert.notEqual((await fixture({}, 'es', preloadChunkMinifierPlugin)).augmentChunkHash(chunk()), current);
});

test('static runtime, CSS, absent maps and already compact code are not rewritten', async () => {
  const plugin = await fixture();
  const bundle = { runtime: { ...chunk(), dynamicImports: [] },
    plain: chunk('export const source = "exact retained value";'),
    compact: chunk('export const x="__vite__mapDeps";'),
    css: { type: 'asset', fileName: 'assets/screen.css', source: 'body{color:green}' } };
  const before = Object.fromEntries(Object.entries(bundle).map(([key, value]) => [key, value.code ?? value.source]));
  await plugin.generateBundle.handler({ format: 'es' }, bundle);
  for (const [key, value] of Object.entries(bundle)) assert.equal(value.code ?? value.source, before[key]);
});

test('debug source maps, alternative minifiers, server and library builds retain their original code and hashes', async () => {
  for (const build of [{ sourcemap: true }, { sourcemap: 'hidden' }, { minify: false }, { minify: 'esbuild' }, { ssr: true }, { lib: { entry: 'library.js' } }]) {
    const plugin = await fixture(build), entry = chunk(), original = entry.code;
    assert.equal(plugin.augmentChunkHash(entry), undefined);
    await plugin.generateBundle.handler({ format: 'es' }, { entry });
    assert.equal(entry.code, original);
  }
  const plugin = await fixture(), entry = { ...chunk(), map: { version: 3 } }, original = entry.code;
  await plugin.generateBundle.handler({ format: 'es' }, { entry });
  assert.equal(entry.code, original);
});

test('non-ES output is never assumed to have a private module top level', async () => {
  for (const format of ['cjs', 'iife', 'umd']) {
    const plugin = await fixture({}, format), entry = chunk(), original = entry.code;
    assert.equal(plugin.augmentChunkHash(entry), undefined);
    await plugin.generateBundle.handler({ format }, { entry });
    assert.equal(entry.code, original);
  }
});

test('compiler failures stop the build rather than quietly accepting malformed output', async () => {
  const plugin = await fixture(), entry = chunk('const __vite__mapDeps = ;');
  await assert.rejects(plugin.generateBundle.handler({ format: 'es' }, { entry }));
  assert.equal(entry.code, 'const __vite__mapDeps = ;');
});

test('preload minification refuses unresolved configuration and runs after Vite finalizes its dependency map', async () => {
  const { preloadChunkMinifierPlugin } = await import('../preload-chunk-minifier.mjs');
  const plugin = preloadChunkMinifierPlugin();
  assert.equal(plugin.apply, 'build');
  assert.equal(plugin.enforce, 'post');
  assert.equal(plugin.generateBundle.order, 'post');
  assert.throws(() => plugin.renderStart({ format: 'es' }), /resolved build configuration/);
  await assert.rejects(plugin.generateBundle.handler({ format: 'es' }, {}), /resolved build configuration/);
});
