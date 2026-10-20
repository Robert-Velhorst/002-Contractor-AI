const assert = require('node:assert/strict');
const vm = require('node:vm');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { transformSync } = require('esbuild');
const path = require('node:path');

function evaluate(source, options = {}, runtimeRequire = require) {
  const { code } = transformSync(source, { loader: 'jsx', format: 'cjs', target: 'es2022', ...options });
  const module = { exports: {} };
  vm.runInNewContext(code, { require: runtimeRequire, module, exports: module.exports });
  return module.exports;
}

const fixtures = [
  'export default data => <span>{data.text}</span>',
  'export default data => <>{data.text}<span>{data.text}</span></>',
  'export default data => <button {...data.props} onClick={data.onClick}>{data.text}</button>',
  'export default data => <input ref={data.ref} disabled={data.disabled} value={data.text} onChange={data.onClick}/>',
  'export default data => <section>{data.values.map(value => <span key={value}>{value}</span>)}</section>',
  'export default data => <button key="fixed" {...data.props}>{data.text}</button>',
  'export default data => <button {...data.props} key="fixed">{data.text}</button>',
  'const Card = props => <aside role={props.role}>{props.children}</aside>; Card.defaultProps = {role:"note"}; export default data => <Card>{data.text}</Card>',
  'const _jsx = "local", _jsxs = "locals"; export default data => <><span>{_jsx}</span><span>{_jsxs}</span><span>{data.text}</span></>',
];

function normalized(element) {
  if (Array.isArray(element)) return Array.from(element, normalized);
  if (React.isValidElement(element)) return {
    type: typeof element.type === 'function' ? element.type.name : String(element.type),
    key: element.key,
    props: Object.fromEntries(Object.entries(element.props).map(([key, value]) => [key, normalized(value)])),
  };
  if (typeof element === 'function') return element.name;
  if (element && typeof element === 'object') return Object.fromEntries(Object.entries(element).map(([key, value]) => [key, normalized(value)]));
  return element;
}

for (const [index, source] of fixtures.entries()) {
  test(`automatic production bridge preserves JSX props, keys, children and markup: fixture ${index + 1}`, async () => {
    const { JSX_BRIDGE_IMPORT_SOURCE, JSX_BRIDGE_ID, JSX_BRIDGE_SOURCE } = await import('../jsx-runtime-bridge.mjs');
    const bridge = evaluate(JSX_BRIDGE_SOURCE);
    const automatic = evaluate(source, { jsx: 'automatic' }).default;
    const production = evaluate(source, { jsx: 'automatic', jsxImportSource: JSX_BRIDGE_IMPORT_SOURCE },
      id => [JSX_BRIDGE_ID, JSX_BRIDGE_IMPORT_SOURCE].includes(id) ? bridge : require(id)).default;
    const data = { text: 'Alpha & <beta>', disabled: true, values: ['one', 'two'],
      props: { key: 'spread-key', title: 'Checked', children: 'overridden' }, ref: { current: null }, onClick() {} };
    const before = automatic(data), after = production(data);
    assert.deepEqual(normalized(after), normalized(before));
    assert.equal(renderToStaticMarkup(after), renderToStaticMarkup(before));
    if (after.props.onClick) assert.equal(after.props.onClick, data.onClick);
    if (after.props.ref) assert.equal(after.props.ref, data.ref);
  });
}

test('bridge exports the real installed React functions, not wrapper or replacement behavior', async () => {
  const { JSX_BRIDGE_SOURCE } = await import('../jsx-runtime-bridge.mjs');
  const bridge = evaluate(JSX_BRIDGE_SOURCE);
  const runtime = require('react/jsx-runtime');
  assert.equal(bridge.jsx, runtime.jsx);
  assert.equal(bridge.jsxs, runtime.jsxs);
  assert.equal(bridge.Fragment, runtime.Fragment);
  assert.equal(bridge.createElement, React.createElement);
});

test('bridge resolves only its exact virtual module and never reads source paths', async () => {
  const { jsxRuntimeBridgePlugin, JSX_BRIDGE_IMPORT_SOURCE, JSX_BRIDGE_ID, JSX_BRIDGE_INTERNAL_ID, JSX_BRIDGE_SOURCE } = await import('../jsx-runtime-bridge.mjs');
  const plugin = jsxRuntimeBridgePlugin();
  assert.equal(plugin.apply, 'build');
  assert.equal(plugin.resolveId(JSX_BRIDGE_ID), JSX_BRIDGE_INTERNAL_ID);
  assert.equal(plugin.resolveId(JSX_BRIDGE_IMPORT_SOURCE), JSX_BRIDGE_INTERNAL_ID);
  assert.equal(plugin.load(JSX_BRIDGE_INTERNAL_ID), JSX_BRIDGE_SOURCE);
  assert.equal(plugin.resolveId(`${JSX_BRIDGE_ID}/../server.js`), null);
  assert.equal(plugin.load('/server.js'), null);
});

test('development keeps its automatic runtime and production caches the bridge in the measured React asset', async () => {
  const { default: config } = await import('../vite.config.js');
  const { JSX_BRIDGE_INTERNAL_ID, JSX_BRIDGE_IMPORT_SOURCE } = await import('../jsx-runtime-bridge.mjs');
  const development = config({ command: 'serve', mode: 'development' });
  const production = config({ command: 'build', mode: 'production' });
  assert.equal(development.esbuild, undefined);
  assert.equal(production.esbuild, undefined);
  const partition = production.build.rolldownOptions.output.codeSplitting.groups[0].name;
  assert.equal(partition(JSX_BRIDGE_INTERNAL_ID), 'react');
  assert.equal(partition('\0commonjsHelpers.js'), 'react');
  assert.equal(partition('\0unrelated-virtual-module'), null);
  const reactPlugin = build => build.plugins.flat(Infinity).find(plugin => plugin.name === 'vite:react-babel');
  assert.equal(reactPlugin(development).config().esbuild.jsx, 'automatic');
  assert.equal(reactPlugin(development).config().esbuild.jsxImportSource, undefined);
  assert.equal(reactPlugin(production).config().esbuild.jsx, 'automatic');
  assert.equal(reactPlugin(production).config().esbuild.jsxImportSource, JSX_BRIDGE_IMPORT_SOURCE);
});

test('a screen-only change preserves the built React cache identity without an entry import cycle', async () => {
  const { build } = await import('vite');
  const { default: config } = await import('../vite.config.js');
  const production = config({ command: 'build', mode: 'production' });
  const entryId = path.resolve(__dirname, '../cache-contract-entry.jsx');
  const screenId = path.resolve(__dirname, '../cache-contract-screen.jsx');
  const warnings = [];
  async function fixture(variant) {
    const screenSources = {
      first: 'export default function Screen() { return <main>First screen</main> }',
      changed: 'export default function Screen() { return <main>Changed screen</main> }',
    };
    const screenSource = screenSources[variant];
    assert.ok(screenSource, 'fixture uses a known static screen source');
    const result = await build({
      configFile: false, root: path.resolve(__dirname, '..'), logLevel: 'silent',
      plugins: [
        { name: 'react-cache-contract-fixture',
          resolveId(id) { if (id === entryId || id === screenId) return id; },
          load(id) {
            if (id === entryId) return `import { lazy } from 'react'; import { createRoot } from 'react-dom/client'; const Screen = lazy(() => import(${JSON.stringify(screenId)})); createRoot(document.getElementById('root')).render(<Screen />);`;
            if (id === screenId) return screenSource;
          }
        },
        ...production.plugins.flat(Infinity).filter(plugin =>
          ['contractor-jsx-runtime-bridge', 'contractor-preload-chunk-minifier', 'vite:react-babel', 'vite:react-refresh'].includes(plugin.name))
      ],
      build: { ...production.build, write: false, rolldownOptions: {
        ...production.build.rolldownOptions, input: entryId,
        onwarn(warning) { warnings.push(warning); }
      } }
    });
    const chunks = result.output.filter(item => item.type === 'chunk');
    const react = chunks.find(item => item.name === 'react');
    const entry = chunks.find(item => item.isEntry);
    assert.ok(react && entry);
    assert.ok(Object.hasOwn(react.modules, '\0commonjsHelpers.js'));
    assert.equal(react.imports.includes(entry.fileName), false, 'cached runtime must not import the changing entry');
    assert.ok(entry.imports.includes(react.fileName), 'entry uses the same real React runtime');
    return { react, screen: chunks.find(item => item.name === 'cache-contract-screen') };
  }
  const before = await fixture('first');
  const after = await fixture('changed');
  assert.notEqual(before.screen.code, after.screen.code);
  assert.notEqual(before.screen.fileName, after.screen.fileName);
  assert.equal(before.react.code, after.react.code);
  assert.equal(before.react.fileName, after.react.fileName);
  assert.deepEqual(warnings.filter(warning => warning.code === 'CIRCULAR_CHUNK'), []);
});
