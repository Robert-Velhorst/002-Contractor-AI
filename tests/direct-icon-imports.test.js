const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { parse } = require('@babel/parser');

test('icon exports use the installed package mapping, including aliases', async () => {
  const { iconExportMap } = await import('../direct-icon-imports.mjs');
  const exports = iconExportMap("export {default as Check, default as CheckIcon} from './icons/check.js'; export {default as createLucideIcon} from './createLucideIcon.js'; const icons={}; export {icons};");
  assert.equal(exports.get('Check'), 'lucide-react/dist/esm/icons/check.js');
  assert.equal(exports.get('CheckIcon'), exports.get('Check'));
  assert.equal(exports.has('icons'), false);
  assert.equal(exports.has('createLucideIcon'), false);
});

test('named icon imports retain local aliases and JSX without a barrel dependency', async () => {
  const { iconExportMap, rewriteIconImports } = await import('../direct-icon-imports.mjs');
  const exports = iconExportMap("export {default as Check} from './icons/check.js'; export {default as X} from './icons/x.js';");
  const result = rewriteIconImports("import {Check as Done, X} from 'lucide-react'; const element=<Done aria-hidden />;", exports);
  assert.match(result, /import Done from "lucide-react\/dist\/esm\/icons\/check.js"/);
  assert.match(result, /import X from "lucide-react\/dist\/esm\/icons\/x.js"/);
  assert.match(result, /<Done aria-hidden \/>/);
  assert.doesNotMatch(result, /from 'lucide-react'/);
  parse(result, { sourceType: 'module', plugins: ['jsx'] });
});

test('non-icon, namespace, default, side-effect and direct imports keep their API', async () => {
  const { rewriteIconImports } = await import('../direct-icon-imports.mjs');
  const exports = new Map([['Check', 'lucide-react/dist/esm/icons/check.js']]);
  for (const source of ["import * as Icons from 'lucide-react';", "import Lucide from 'lucide-react';", "import 'lucide-react';", "import Check from 'lucide-react/dist/esm/icons/check.js';"]) {
    assert.equal(rewriteIconImports(source, exports), null);
  }
  const result = rewriteIconImports("import Lucide, {Check, icons as registry} from 'lucide-react';", exports);
  assert.match(result, /import Lucide,\{icons as registry\} from 'lucide-react'/);
  parse(result, { sourceType: 'module' });
});

test('multiple declarations are replaced without changing strings and comments', async () => {
  const { rewriteIconImports } = await import('../direct-icon-imports.mjs');
  const exports = new Map([['Check', 'lucide-react/dist/esm/icons/check.js']]);
  const result = rewriteIconImports("// lucide-react comment\nimport { Check } from 'lucide-react';\nconst label='lucide-react';\nimport { Check as Alias } from 'lucide-react';", exports);
  assert.match(result, /\/\/ lucide-react comment/);
  assert.match(result, /const label='lucide-react'/);
  assert.match(result, /import Alias from/);
  parse(result, { sourceType: 'module' });
});

test('plugin ignores dependency and non-JavaScript files on Windows and POSIX', async () => {
  const { directIconImportsPlugin } = await import('../direct-icon-imports.mjs');
  const plugin = directIconImportsPlugin();
  const source = "import { Check } from 'lucide-react';";
  for (const id of ['C:\\app\\node_modules\\package\\index.jsx', '/app/node_modules/package/index.jsx', '/app/styles.css', '/app/component.tsx']) {
    assert.equal(plugin.transform(source, id), null);
  }
  assert.match(plugin.transform(source, 'C:\\app\\view.jsx?query').code, /icons\/check.js/);
});

test('every installed icon alias resolves to an existing module and original default export', async () => {
  const { iconExportMap } = await import('../direct-icon-imports.mjs');
  const packageRoot = path.dirname(require.resolve('lucide-react/package.json'));
  const metadata = JSON.parse(fs.readFileSync(path.join(packageRoot, 'package.json'), 'utf8'));
  const exports = iconExportMap(fs.readFileSync(path.join(packageRoot, metadata.module), 'utf8'));
  const packageApi = require('lucide-react');
  assert.ok(exports.size > 1000);
  for (const [name, target] of exports) {
    const absolutePath = path.join(packageRoot, target.slice('lucide-react/'.length));
    assert.ok(fs.existsSync(absolutePath), name);
    assert.ok(packageApi[name], name);
  }
  assert.equal(exports.get('CircleHelp'), exports.get('HelpCircle'));
});
