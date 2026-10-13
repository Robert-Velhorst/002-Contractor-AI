const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createHash } = require('node:crypto');
const { parse } = require('@babel/parser');
const traverse = require('@babel/traverse').default;

const root = path.resolve(__dirname, '..');
const baseline = require('./operator-dialog-identity.json');
const source = fs.readFileSync(path.join(root, 'components/OperatorActionDialogs.jsx'), 'utf8');
const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
function withoutSourcePositions(value) {
  if (Array.isArray(value)) return value.map(withoutSourcePositions);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['start', 'end', 'loc', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(key))
    .map(([key, child]) => [key, withoutSourcePositions(child)]));
}

test('all 42 action forms retain exact original fields, constraints, translations and callbacks', () => {
  assert.equal(baseline.format, 'contractor-dialog-identity/v1');
  assert.equal(baseline.dialogs.length, 42);
  const components = ast.program.body.filter(node => node.type === 'ExportNamedDeclaration').map(node => node.declaration);
  assert.deepEqual(components.map(node => node.id.name), baseline.dialogs.map(item => item.name));
  for (const expected of baseline.dialogs) {
    const component = components.find(node => node.id.name === expected.name);
    const jsx = component.body.body.find(node => node.type === 'ReturnStatement').argument;
    assert.equal(createHash('sha256').update(JSON.stringify(withoutSourcePositions(jsx))).digest('hex'), expected.jsxSha256, expected.name);
    assert.deepEqual(component.params[0].properties.map(property => property.key.name).sort(), expected.props, expected.name);
  }
});

test('every extracted form reference resolves to its exact parent prop, module import or local binding', () => {
  const unbound = new Set();
  const globals = new Set(['window', 'document', 'Number', 'String', 'Boolean', 'Math', 'Object', 'Array', 'Date', 'Set', 'Map',
    'JSON', 'Intl', 'undefined', 'NaN', 'Infinity', 'encodeURIComponent']);
  traverse(ast, { ReferencedIdentifier(ref) {
    if (!ref.scope.getBinding(ref.node.name) && !globals.has(ref.node.name)) unbound.add(ref.node.name);
  } });
  assert.deepEqual([...unbound], []);
  assert.doesNotMatch(source, /from\s+['"]\.\.\/App(?:\.jsx)?['"]/);
});

test('each original condition still gates its cached form with local loading and error boundaries', () => {
  const appSource = fs.readFileSync(path.join(root, 'App.jsx'), 'utf8');
  const appAst = parse(appSource, { sourceType: 'module', plugins: ['jsx'] });
  const app = appAst.program.body.find(node => node.type === 'FunctionDeclaration' && node.id.name === 'App');
  const view = app.body.body.filter(node => node.type === 'ReturnStatement').at(-1).argument;
  for (const expected of baseline.dialogs) {
    const expression = view.children.map(node => node.expression).find(node => node?.type === 'ConditionalExpression'
      && appSource.slice(node.test.start, node.test.end) === expected.condition);
    assert.ok(expression, expected.name);
    assert.equal(expression.alternate.type, 'NullLiteral');
    const boundary = expression.consequent;
    assert.equal(boundary.openingElement.name.name, 'DeferredActionDialog');
    const form = boundary.children.find(node => node.type === 'JSXElement');
    assert.equal(form.openingElement.name.name, expected.name);
    assert.deepEqual(form.openingElement.attributes.map(prop => [prop.name.name, prop.value.expression.name]),
      expected.props.map(name => [name, name]), expected.name);
    assert.match(appSource, new RegExp(`const ${expected.name} = lazy\\(\\(\\) => loadOperatorActionDialogs\\(\\)\\.then`));
  }
  assert.match(fs.readFileSync(path.join(root, 'dashboard-chunks.js'), 'utf8'),
    /loadOperatorActionDialogs = moduleLoader\(\(\) => import\('\.\/components\/OperatorActionDialogs'\)\)/);
  assert.doesNotMatch(appSource, /import\s+.*from\s+['"]\.\/components\/OperatorActionDialogs['"]/);
  const shell = fs.readFileSync(path.join(root, 'components/DeferredActionDialog.jsx'), 'utf8');
  assert.match(shell, /<DialogBoundary locale=\{locale\} title=\{title\} onClose=\{onClose\}>/);
  assert.match(shell, /<Suspense fallback=\{<DialogLoading locale=\{locale\} title=\{title\} onClose=\{onClose\} \/>\}>/);
});
