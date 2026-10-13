const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const host = 'assets/host-hash.js', shared = 'assets/shared-hash.js', child = 'assets/child-hash.js';
function chunk(fileName, imports = [], dynamicImports = []) {
  return { type: 'chunk', fileName, imports, dynamicImports, code: `export const name=${JSON.stringify(fileName)};` };
}

async function fixture(build = {}, format = 'es', factory) {
  const create = factory || (await import('../loaded-preload-filter.mjs')).loadedPreloadFilterPlugin;
  const plugin = create(), contribution = plugin.config({ build });
  const resolved = { build: { minify: 'terser', ...build,
    ...(contribution?.build || {}), modulePreload: contribution?.build.modulePreload || build.modulePreload } };
  plugin.configResolved(resolved);
  plugin.renderStart({ format });
  return { plugin, resolve: resolved.build.modulePreload?.resolveDependencies };
}

test('only exact statically loaded JavaScript leaves the preload list; new modules, CSS and unknown files remain', async () => {
  const { plugin, resolve } = await fixture();
  const graph = { [host]: chunk(host, [shared], [child]), [shared]: chunk(shared, ['assets/transitive.js']),
    'assets/transitive.js': chunk('assets/transitive.js', [host]), [child]: chunk(child, ['assets/new-shared.js']),
    'assets/new-shared.js': chunk('assets/new-shared.js'), 'assets/shared-hash.css': { type: 'asset', source: 'body{}' } };
  const original = JSON.stringify(graph);
  plugin.generateBundle.handler({ format: 'es' }, graph);
  const deps = [child, shared, 'assets/transitive.js', 'assets/new-shared.js', 'assets/shared-hash.css',
    'https://example.invalid/shared-hash.js', 'other/shared-hash.js', 'assets/shared-hash.js?v=1', 'assets/unknown.js'];
  const before = [...deps];
  assert.deepEqual(resolve(child, deps, { hostType: 'js', hostId: host }), [child, 'assets/new-shared.js',
    'assets/shared-hash.css', 'https://example.invalid/shared-hash.js', 'other/shared-hash.js',
    'assets/shared-hash.js?v=1', 'assets/unknown.js']);
  assert.deepEqual(deps, before);
  assert.equal(JSON.stringify(graph), original);
});

test('HTML, missing graph, unknown importer and non-JavaScript output retain their lists unchanged', async () => {
  const { plugin, resolve } = await fixture(), deps = [shared];
  assert.equal(resolve(child, deps, { hostType: 'js', hostId: host }), deps);
  plugin.generateBundle.handler({ format: 'es' }, { [host]: chunk(host, [shared]), [shared]: chunk(shared) });
  for (const context of [{ hostType: 'html', hostId: host }, { hostType: 'js', hostId: 'unknown.js' }]) {
    assert.equal(resolve(child, deps, context), deps);
  }
  plugin.generateBundle.handler({ format: 'cjs' }, { [host]: chunk(host, [shared]), [shared]: chunk(shared) });
  assert.equal(resolve(child, deps, { hostType: 'js', hostId: host }), deps);
});

test('live graph removals and repeated watch/output builds cannot reuse stale static dependencies', async () => {
  const { plugin, resolve } = await fixture(), deps = [shared], context = { hostType: 'js', hostId: host };
  const graph = { [host]: chunk(host, [shared]), [shared]: chunk(shared) };
  plugin.generateBundle.handler({ format: 'es' }, graph);
  assert.deepEqual(resolve(child, deps, context), []);
  delete graph[shared];
  assert.equal(resolve(child, deps, context), deps);
  graph[shared] = chunk(shared);
  plugin.buildStart();
  assert.equal(resolve(child, deps, context), deps);
  plugin.generateBundle.handler({ format: 'es' }, graph);
  plugin.renderStart({ format: 'es' });
  assert.equal(resolve(child, deps, context), deps);
  plugin.generateBundle.handler({ format: 'es' }, { [host]: chunk(host), [shared]: chunk(shared) });
  assert.equal(resolve(child, deps, context), deps);
});

test('explicitly disabled and custom preload policies are not overridden', async () => {
  const { loadedPreloadFilterPlugin } = await import('../loaded-preload-filter.mjs');
  const custom = (_filename, deps) => deps;
  for (const modulePreload of [false, { resolveDependencies: custom, polyfill: false }]) {
    const plugin = loadedPreloadFilterPlugin();
    assert.equal(plugin.config({ build: { modulePreload } }), undefined);
    const { plugin: resolved } = await fixture({ modulePreload });
    assert.equal(resolved.augmentChunkHash(chunk(host, [], [child])), undefined);
  }
});

test('debug, alternative minifiers, server, library and non-ES builds are not filtered or salted', async () => {
  for (const build of [{ sourcemap: true }, { sourcemap: 'hidden' }, { minify: false }, { minify: 'esbuild' },
    { ssr: true }, { lib: { entry: 'library.js' } }]) {
    const { plugin, resolve } = await fixture(build), deps = [shared];
    plugin.generateBundle.handler({ format: 'es' }, { [host]: chunk(host, [shared]), [shared]: chunk(shared) });
    assert.equal(resolve(child, deps, { hostType: 'js', hostId: host }), deps);
    assert.equal(plugin.augmentChunkHash(chunk(host, [], [child])), undefined);
  }
  for (const format of ['cjs', 'iife', 'umd']) {
    const { plugin, resolve } = await fixture({}, format), deps = [shared];
    plugin.generateBundle.handler({ format }, { [host]: chunk(host, [shared]), [shared]: chunk(shared) });
    assert.equal(resolve(child, deps, { hostType: 'js', hostId: host }), deps);
    assert.equal(plugin.augmentChunkHash(chunk(host, [], [child])), undefined);
  }
});

test('dynamic chunk hashes include deterministic compiler and implementation identity before final names', async () => {
  const { plugin } = await fixture(), second = (await fixture()).plugin, entry = chunk(host, [], [child]);
  const identity = plugin.augmentChunkHash(entry);
  assert.match(identity, /^[a-f0-9]{64}$/);
  assert.equal(second.augmentChunkHash(entry), identity);
  assert.equal(plugin.augmentChunkHash(chunk(shared)), undefined);
  assert.equal(plugin.generateBundle.order, 'pre');
  const { loadedPreloadFilterPlugin } = await import('../loaded-preload-filter.mjs');
  const unresolved = loadedPreloadFilterPlugin();
  assert.throws(() => unresolved.renderStart({ format: 'es' }), /resolved build configuration/);
  assert.throws(() => unresolved.generateBundle.handler({ format: 'es' }, {}), /resolved build configuration/);
});

test('a Vite compiler upgrade invalidates the preload-policy cache identity', async t => {
  const metadata = require('vite/package.json'), version = metadata.version;
  t.after(() => { metadata.version = version; });
  const current = (await fixture()).plugin.augmentChunkHash(chunk(host, [], [child]));
  metadata.version = `fixture-${version}`;
  const { loadedPreloadFilterPlugin } = await import('../loaded-preload-filter.mjs?compiler-version-proof');
  assert.notEqual((await fixture({}, 'es', loadedPreloadFilterPlugin)).plugin.augmentChunkHash(chunk(host, [], [child])), current);
});

test('real Vite builds preserve CSS and new dependency preloads, and changed code never reuses a filename', async t => {
  const { build } = await import('vite');
  const { loadedPreloadFilterPlugin } = await import('../loaded-preload-filter.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-preload-fixture-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'index.html'), '<script type="module" src="/main.js"></script>');
  fs.writeFileSync(path.join(root, 'main.js'), 'import {shared} from "./shared.js";globalThis.shared=shared;globalThis.load=()=>import("./child.js");');
  fs.writeFileSync(path.join(root, 'shared.js'), 'export const shared="retained value";');
  fs.writeFileSync(path.join(root, 'child.js'), 'import {shared} from "./shared.js";import {fresh} from "./fresh.js";import "./child.css";export const value=shared+fresh;');
  fs.writeFileSync(path.join(root, 'fresh.js'), 'export const fresh=" new value";');
  fs.writeFileSync(path.join(root, 'child.css'), '.retained-child{color:rgb(23,145,61)}');
  async function compile(filtered) {
    const observations = [];
    const observer = { name: 'fixture-preload-observer', configResolved(config) {
      const resolve = config.build.modulePreload.resolveDependencies || ((_filename, deps) => deps);
      config.build.modulePreload.resolveDependencies = (filename, deps, context) => {
        const result = resolve(filename, deps, context);
        observations.push({ filename, deps: [...deps], result: [...result], context });
        return result;
      };
    } };
    const result = await build({ root, configFile: false, logLevel: 'silent', plugins: [...(filtered ? [loadedPreloadFilterPlugin()] : []), observer],
      build: { write: false, minify: 'terser', modulePreload: {}, rollupOptions: { output: {
        onlyExplicitManualChunks: true,
        manualChunks(id) { if (id.endsWith('/shared.js')) return 'shared'; if (id.endsWith('/fresh.js')) return 'fresh'; }
      } } } });
    return { output: result.output, observations };
  }
  const before = await compile(false), after = await compile(true), repeated = await compile(true);
  const rows = after.observations.filter(row => row.context.hostType === 'js');
  assert.equal(rows.length, 1);
  assert.ok(rows[0].deps.some(name => /\/shared-/.test(name)));
  assert.ok(!rows[0].result.some(name => /\/shared-/.test(name)));
  assert.ok(rows[0].result.some(name => /\/fresh-/.test(name)));
  assert.ok(rows[0].result.some(name => /\/child-/.test(name)));
  const css = output => output.filter(item => item.type === 'asset' && item.fileName.endsWith('.css'));
  assert.deepEqual(css(after.output), css(before.output));
  const dynamic = after.output.find(item => item.type === 'chunk' && item.dynamicImports.length);
  assert.ok(dynamic.code.includes(css(after.output)[0].fileName));
  const original = new Map(before.output.map(item => [item.fileName, item.code ?? item.source]));
  for (const item of after.output) {
    if (/\.(?:js|css)$/.test(item.fileName) && original.has(item.fileName)) {
      assert.equal(item.code ?? item.source, original.get(item.fileName), item.fileName);
    }
  }
  assert.notEqual(dynamic.fileName, before.output.find(item => item.type === 'chunk' && item.dynamicImports.length).fileName);
  assert.deepEqual(after.output.map(item => [item.fileName, item.code ?? item.source]),
    repeated.output.map(item => [item.fileName, item.code ?? item.source]));
  const childBefore = before.output.find(item => item.type === 'chunk' && item.name === 'child');
  const childAfter = after.output.find(item => item.type === 'chunk' && item.name === 'child');
  assert.deepEqual(childAfter.exports, childBefore.exports);
  assert.equal(childAfter.code, childBefore.code);
});
