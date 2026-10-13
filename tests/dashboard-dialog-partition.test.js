const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { createHash } = require('node:crypto');
const { parse } = require('@babel/parser');

const root = path.resolve(__dirname, '..');
const dialogs = {
  FinanceActionDialog: 'e5cc0bb7c187ae8e111f3a10fb06ee7eb99c5f2ffea8ae9225e27df0f00c3ac4',
  ResourceActionDialog: 'f0be1569ec754899747fe6b55d7bbe4ab3912483be064976ffb37e4cbd1e4869',
};

function withoutSourcePositions(value) {
  if (Array.isArray(value)) return value.map(withoutSourcePositions);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => !['start', 'end', 'loc', 'extra', 'leadingComments', 'trailingComments', 'innerComments'].includes(key))
    .map(([key, child]) => [key, withoutSourcePositions(child)]));
}

test('finance and resource dialogs preserve every original JSX field and callback after extraction', () => {
  for (const [name, expected] of Object.entries(dialogs)) {
    const source = fs.readFileSync(path.join(root, 'components', `${name}.jsx`), 'utf8');
    const ast = parse(source, { sourceType: 'module', plugins: ['jsx'] });
    const component = ast.program.body.find(node => node.type === 'ExportDefaultDeclaration').declaration;
    const jsx = component.body.body.find(node => node.type === 'ReturnStatement').argument;
    assert.equal(createHash('sha256').update(JSON.stringify(withoutSourcePositions(jsx))).digest('hex'), expected,
      `${name} must retain the original controls, constraints, source labels and handlers.`);
  }
});

test('dashboard dialog code is exclusively reached through cached dynamic loaders', () => {
  const app = fs.readFileSync(path.join(root, 'App.jsx'), 'utf8');
  const chunks = fs.readFileSync(path.join(root, 'dashboard-chunks.js'), 'utf8');
  for (const name of Object.keys(dialogs)) {
    assert.match(chunks, new RegExp(`load${name} = moduleLoader\\(\\(\\) => import\\('\\./components/${name}'\\)\\)`));
    assert.match(app, new RegExp(`const ${name} = lazy\\(load${name}\\)`));
    assert.doesNotMatch(app, new RegExp(`import ${name} from`));
    assert.doesNotMatch(app, /<section\s+className="modal (finance-control|resource-control)-modal"/);
  }
});
