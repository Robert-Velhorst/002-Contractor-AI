const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { parse } = require('@babel/parser');
const { pathToFileURL } = require('node:url');

const projectRoot = path.resolve(__dirname, '..');

test('production compaction shortens only literal translator keys and preserves runtime labels', async () => {
  const { createOperatorLocaleCompaction } = await import('../operator-locale-compact.mjs');
  const compaction = createOperatorLocaleCompaction(projectRoot);
  assert.ok(compaction.compactTokens.size > 1000);
  const literalToken = compaction.compactTokens.get('Shared warehouse stock');
  assert.ok(literalToken);
  const closeToken = compaction.compactTokens.get('Close job workspace');
  assert.ok(closeToken);
  assert.ok(compaction.fallbackOnlyKeys.has('Close job workspace'));
  assert.equal(compaction.compactTokens.has('available'), false);

  const calls = compaction.transformCallSites(`const title = t('Shared warehouse stock');
const status = t(statusValue);
const current = operatorText(locale, 'available');`, path.join(projectRoot, 'compact-fixture.jsx'));
  assert.match(calls, new RegExp(`t\\(${JSON.stringify(literalToken)}, \\{\\}, "Shared warehouse stock"\\)`));
  assert.match(calls, /t\(statusValue\)/);
  assert.match(calls, /operatorText\(locale, 'available'\)/);
  const accessibilitySource = "const closeLabel = ot('Close job workspace');"
  const accessibleLabel = compaction.transformCallSites(accessibilitySource, path.join(projectRoot, 'compact-accessibility-fixture.jsx')) || accessibilitySource
  assert.match(accessibleLabel, new RegExp(`ot\\(${JSON.stringify(closeToken)}, \\{\\}, "Close job workspace"\\)`));

  const catalog = compaction.transformCatalog(fs.readFileSync(path.join(projectRoot, 'operator-locale.js'), 'utf8'));
  assert.doesNotMatch(catalog, /'Shared warehouse stock':/);
  const compactDeclaration = parse(catalog, { sourceType: 'module' }).program.body.flatMap(statement => statement.declarations || [])
    .find(declaration => declaration.id.name === 'OPERATOR_NL_COMPACT');
  const compactValues = compactDeclaration.init.elements;
  assert.equal(compactValues[Number.parseInt(literalToken.slice(1), 36)].value, 'Gedeelde magazijnvoorraad');
  assert.equal(compactValues[Number.parseInt(closeToken.slice(1), 36)].value, 'Opdrachtwerkruimte sluiten');
  assert.doesNotMatch(catalog, /OPERATOR_EN_COMPACT/);
  assert.match(catalog, /'available': 'beschikbaar'/);
  const wrapper = compaction.transformCallSites(`const t = (key, variables = {}) => operatorText(locale, key, variables)\nconst label = t('Shared warehouse stock')`, path.join(projectRoot, 'compact-wrapper.jsx'));
  assert.match(wrapper, /englishFallback = key/);
  assert.match(wrapper, /operatorText\(locale, key, variables, englishFallback\)/);
  assert.match(wrapper, new RegExp(`t\\(${JSON.stringify(literalToken)}, \\{\\}, "Shared warehouse stock"\\)`));
});

test('production compaction removes unused translations but keeps dynamically selected labels', async t => {
  const { createOperatorLocaleCompaction } = await import('../operator-locale-compact.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-locale-compaction-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'operator-locale.js'), `const OPERATOR_NL = {
  'Literal label': 'Vaste tekst',
  'Dynamic status': 'Dynamische status',
  'Unused label': 'Ongebruikte tekst',
}
export function operatorText(locale, key) { return OPERATOR_NL[key] || key }
const OPERATOR_NL_COMPACT = []
`);
  fs.writeFileSync(path.join(root, 'entry.jsx'), `const a = t('Literal label')
const status = 'Dynamic status'
const b = operatorText(locale, status)
`);
  const compaction = createOperatorLocaleCompaction(root);
  assert.ok(compaction.unusedKeys.has('Unused label'));
  const catalog = compaction.transformCatalog(fs.readFileSync(path.join(root, 'operator-locale.js'), 'utf8'));
  const literalToken = compaction.compactTokens.get('Literal label');
  const compactDeclaration = parse(catalog, { sourceType: 'module' }).program.body.flatMap(statement => statement.declarations || [])
    .find(declaration => declaration.id.name === 'OPERATOR_NL_COMPACT');
  assert.doesNotMatch(catalog, /Unused label|Ongebruikte tekst/);
  assert.match(catalog, /'Dynamic status': 'Dynamische status'/);
  assert.doesNotMatch(catalog.slice(0, catalog.indexOf('const OPERATOR_NL_COMPACT = ')), /Literal label|Vaste tekst/);
  assert.equal(compactDeclaration.init.elements[Number.parseInt(literalToken.slice(1), 36)].value, 'Vaste tekst');
});

test('normalized API statuses remain translated after production catalog compaction', async t => {
  const { createOperatorLocaleCompaction } = await import('../operator-locale-compact.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-locale-status-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const catalog = `const OPERATOR_NL = {'cost review required':'kostenbeoordeling vereist','review pending':'beoordeling open','Unused label':'Ongebruikte tekst'};
const OPERATOR_NL_COMPACT = [];
export function operatorText(locale, key) { return OPERATOR_NL[key] || key; }`;
  fs.writeFileSync(path.join(root, 'operator-locale.js'), catalog);
  fs.writeFileSync(path.join(root, 'runtime.js'), "const status = 'cost_review_required'; const statuses = {review_pending: 1}; t(status.replaceAll('_', ' '));");
  const compaction = createOperatorLocaleCompaction(root);
  const transformed = compaction.transformCatalog(catalog);
  const { operatorText } = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`);
  assert.equal(operatorText('nl-NL', 'cost review required'), 'kostenbeoordeling vereist');
  assert.equal(operatorText('nl-NL', 'review pending'), 'beoordeling open');
  assert.equal(compaction.unusedKeys.has('Unused label'), true);
  assert.equal(compaction.compactTokens.has('cost review required'), false);
  assert.equal(compaction.compactTokens.has('review pending'), false);
});

test('compact catalogs execute in both languages with local fallbacks and preserve custom caller text', async t => {
  const { createOperatorLocaleCompaction } = await import('../operator-locale-compact.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-locale-runtime-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const catalog = fs.readFileSync(path.join(projectRoot, 'operator-locale.js'), 'utf8');
  const source = `export function labels(locale, customFallback) {
    const t = (key, variables = {}) => operatorText(locale, key, variables);
    const ot = (key, variables = {}, fallback = key) => operatorText(locale, key, variables, fallback);
    return [t('Close job workspace'), operatorText(locale, 'Download HAI feed'),
      ot('Shared warehouse stock', {}, customFallback), t('Worker: {worker}', {worker:'Robin'})];
  }`;
  const entry = path.join(root, 'entry.jsx');
  fs.writeFileSync(path.join(root, 'operator-locale.js'), catalog);
  fs.writeFileSync(entry, source);
  const compaction = createOperatorLocaleCompaction(root);
  assert.equal(compaction.compactTokens.has('Shared warehouse stock'), false);
  assert.ok(compaction.compactTokens.has('Close job workspace'));
  const transformed = compaction.transformCallSites(source, entry);
  assert.match(transformed, /"Close job workspace"/);
  assert.match(transformed, /"Download HAI feed"/);
  assert.match(transformed, /ot\('Shared warehouse stock', \{\}, customFallback\)/);
  const compiledCatalog = compaction.transformCatalog(catalog).replace("from './locale'", `from ${JSON.stringify(pathToFileURL(path.join(projectRoot, 'locale.js')).href)}`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiledCatalog + '\n' + transformed).toString('base64')}`);
  assert.deepEqual(module.labels('en-GB', 'Custom warehouse label'), ['Close job workspace', 'Download HAI feed', 'Custom warehouse label', 'Worker: Robin']);
  assert.deepEqual(module.labels('nl-NL', 'Custom warehouse label'), ['Opdrachtwerkruimte sluiten', 'HAI-feed downloaden', 'Gedeelde magazijnvoorraad', 'Medewerker: Robin']);
});

test('lazy operator shell renders English and interpolated labels before its Dutch catalog is loaded', async () => {
  const { createOperatorLocaleCompaction } = await import('../operator-locale-compact.mjs');
  const compaction = createOperatorLocaleCompaction(projectRoot);
  const source = `export function labels(operatorLocale, operatorTranslator = null) {
    const ot = (key, variables = {}, englishFallback = key) => operatorLocale === 'nl-NL' && operatorTranslator
      ? operatorTranslator(operatorLocale, key, variables, englishFallback)
      : Object.entries(variables).reduce((text, [name, value]) => text.replaceAll('{' + name + '}', String(value)), englishFallback);
    return [ot('Close job workspace'), ot('Worker: {worker}', {worker: 'Robin'})];
  }`;
  const transformed = compaction.transformCallSites(source, path.join(projectRoot, 'lazy-shell-fixture.jsx'));
  const shell = await import(`data:text/javascript;base64,${Buffer.from(transformed).toString('base64')}`);
  assert.deepEqual(shell.labels('en-GB'), ['Close job workspace', 'Worker: Robin']);
  assert.deepEqual(shell.labels('nl-NL'), ['Close job workspace', 'Worker: Robin']);
  const catalog = compaction.transformCatalog(fs.readFileSync(path.join(projectRoot, 'operator-locale.js'), 'utf8'))
    .replace("from './locale'", `from ${JSON.stringify(pathToFileURL(path.join(projectRoot, 'locale.js')).href)}`);
  const { operatorText } = await import(`data:text/javascript;base64,${Buffer.from(catalog).toString('base64')}`);
  assert.deepEqual(shell.labels('nl-NL', operatorText), ['Opdrachtwerkruimte sluiten', 'Medewerker: Robin']);
});

test('compact tokens keep their original identities while retained literal keys are sorted with exact token coupling', async t => {
  const { createOperatorLocaleCompaction } = await import('../operator-locale-compact.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-locale-order-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const catalog = `const OPERATOR_NL = {
    'Zulu literal': 'AAA', 'Alpha literal': 'Zulu', 'Beta literal': 'AAA',
    'Alpha retained': 'Zulu', 'Zulu retained': 'AAA'
  };
  const OPERATOR_NL_COMPACT = [];
  export function operatorText(locale, key, variables = {}, englishFallback = key) {
    return locale === 'nl-NL' ? (OPERATOR_NL_COMPACT[parseInt(key.slice(1), 36)] || OPERATOR_NL[key] || key) : englishFallback;
  }`;
  const entry = `export function labels(locale) {
    const t = (key, variables = {}) => operatorText(locale, key, variables);
    const retained = ['Alpha retained', 'Zulu retained'];
    return [t('Zulu literal'), t('Alpha literal'), t('Beta literal'), ...retained.map(key => operatorText(locale, key))];
  }`;
  const entryPath = path.join(root, 'entry.jsx');
  fs.writeFileSync(path.join(root, 'operator-locale.js'), catalog);
  fs.writeFileSync(entryPath, entry);
  const compaction = createOperatorLocaleCompaction(root);
  assert.deepEqual([...compaction.compactTokens.keys()], ['Zulu literal', 'Alpha literal', 'Beta literal']);
  const compiled = compaction.transformCatalog(catalog);
  const declarations = parse(compiled, { sourceType: 'module' }).program.body.flatMap(node => node.declarations || []);
  assert.deepEqual(declarations.find(node => node.id.name === 'OPERATOR_NL').init.properties.map(node => node.key.value), ['Alpha retained', 'Zulu retained']);
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiled + '\n' + compaction.transformCallSites(entry, entryPath)).toString('base64')}`);
  assert.deepEqual(module.labels('nl-NL'), ['AAA', 'Zulu', 'AAA', 'Zulu', 'AAA']);
  assert.deepEqual(module.labels('en-GB'), ['Zulu literal', 'Alpha literal', 'Beta literal', 'Alpha retained', 'Zulu retained']);
  const reordered = catalog.replace("'Zulu literal': 'AAA', 'Alpha literal': 'Zulu', 'Beta literal': 'AAA'", "'Alpha literal': 'Zulu', 'Beta literal': 'AAA', 'Zulu literal': 'AAA'");
  const alternate = await import(`data:text/javascript;base64,${Buffer.from(compaction.transformCatalog(reordered) + '\n' + compaction.transformCallSites(entry, entryPath)).toString('base64')}`);
  assert.deepEqual(alternate.labels('nl-NL'), module.labels('nl-NL'));
});

test('every referenced real catalog entry preserves both languages and variable interpolation', async () => {
  const { createOperatorLocaleCompaction } = await import('../operator-locale-compact.mjs');
  const source = fs.readFileSync(path.join(projectRoot, 'operator-locale.js'), 'utf8');
  const compaction = createOperatorLocaleCompaction(projectRoot);
  const compiled = compaction.transformCatalog(source)
    .replace("from './locale'", `from ${JSON.stringify(pathToFileURL(path.join(projectRoot, 'locale.js')).href)}`);
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  const catalog = parse(source, { sourceType: 'module' }).program.body.flatMap(node => node.declarations || [])
    .find(node => node.id.name === 'OPERATOR_NL').init;
  let checked = 0;
  for (const property of catalog.properties) {
    const key = property.key.value, value = property.value.value;
    if (compaction.unusedKeys.has(key)) continue;
    const lookup = compaction.compactTokens.get(key) || key;
    const variables = Object.fromEntries([...new Set([...key.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]))].map(name => [name, `fixture-${name}`]));
    const interpolate = text => Object.entries(variables).reduce((result, [name, replacement]) => result.replaceAll(`{${name}}`, replacement), text);
    assert.equal(module.operatorText('nl-NL', lookup, variables, key), interpolate(value), key);
    assert.equal(module.operatorText('en-GB', lookup, variables, key), interpolate(key), key);
    checked++;
  }
  assert.ok(checked > 4000, 'entire referenced catalog, not a few chosen labels');
  process.stdout.write(`${JSON.stringify({ referencedCatalogEntries: checked, compactTokens: compaction.compactTokens.size })}\n`);
});

test('unknown prototype-like labels use their literal fallback rather than inherited object properties', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-locale-fallback-'));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const source = fs.readFileSync(path.join(projectRoot, 'operator-locale.js'), 'utf8')
    .replace("from './locale'", `from ${JSON.stringify(pathToFileURL(path.join(projectRoot, 'locale.js')).href)}`);
  const filename = path.join(directory, 'catalog.mjs');
  fs.writeFileSync(filename, source);
  const { operatorText } = await import(pathToFileURL(filename));
  for (const key of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.equal(operatorText('nl-NL', key, { count: 3 }), key);
    assert.equal(operatorText('en-GB', key, { count: 3 }, 'Literal {count}'), 'Literal 3');
  }
});

test('catalog ordering preserves non-literal property evaluation order', async t => {
  const { createOperatorLocaleCompaction } = await import('../operator-locale-compact.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-locale-evaluation-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = `export const seen = [];
    const mark = value => { seen.push(value); return value; };
    const OPERATOR_NL = {'Zulu': mark('first'), 'Alpha': mark('second'), 'Pure': 'AAA'};
    const OPERATOR_NL_COMPACT = [];
    export function operatorText(locale, key) { return OPERATOR_NL[key] || key; }`;
  fs.writeFileSync(path.join(root, 'operator-locale.js'), source);
  fs.writeFileSync(path.join(root, 'entry.js'), "const codes = ['Zulu', 'Alpha', 'Pure']; operatorText(locale, codes[0]);");
  const compiled = createOperatorLocaleCompaction(root).transformCatalog(source);
  const module = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
  assert.deepEqual(module.seen, ['first', 'second']);
  assert.equal(module.operatorText('nl-NL', 'Zulu'), 'first');
  assert.equal(module.operatorText('nl-NL', 'Alpha'), 'second');
});

test('compiled lookup preserves explicit own constructor labels and rejects unknown prototype and token keys', async t => {
  const { createOperatorLocaleCompaction } = await import('../operator-locale-compact.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-locale-own-key-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const original = fs.readFileSync(path.join(projectRoot, 'operator-locale.js'), 'utf8');
  const dictionary = parse(original, { sourceType: 'module' }).program.body.flatMap(node => node.declarations || [])
    .find(node => node.id.name === 'OPERATOR_NL').init;
  const source = original.slice(0, dictionary.start) + "{'constructor':'Bouwpersoon','Known literal':'Bekende tekst'}" + original.slice(dictionary.end);
  fs.writeFileSync(path.join(root, 'operator-locale.js'), source);
  fs.writeFileSync(path.join(root, 'entry.js'), "const status = 'constructor'; operatorText(locale, status); t('Known literal');");
  const compaction = createOperatorLocaleCompaction(root);
  const filename = path.join(root, 'compiled.mjs');
  fs.writeFileSync(filename, compaction.transformCatalog(source)
    .replace("from './locale'", `from ${JSON.stringify(pathToFileURL(path.join(projectRoot, 'locale.js')).href)}`));
  const { operatorText } = await import(pathToFileURL(filename));
  assert.equal(operatorText('nl-NL', 'constructor'), 'Bouwpersoon');
  assert.equal(operatorText('nl-NL', compaction.compactTokens.get('Known literal'), {}, 'Known literal'), 'Bekende tekst');
  for (const key of ['__proto__', 'toString', '~zzz', '~ZZZ', '~!']) {
    assert.equal(operatorText('nl-NL', key, { count: 3 }), key);
    assert.equal(operatorText('en-GB', key, { count: 3 }, 'Explicit {count}'), 'Explicit 3');
  }
});
