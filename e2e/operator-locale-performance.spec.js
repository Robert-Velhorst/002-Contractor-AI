const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { parse } = require('@babel/parser');

test('the served production catalog preserves every referenced translation and safe unknown-key fallbacks', async ({ page }, testInfo) => {
  const root = path.resolve(__dirname, '..');
  const { createOperatorLocaleCompaction } = await import(pathToFileURL(path.join(root, 'operator-locale-compact.mjs')));
  const compaction = createOperatorLocaleCompaction(root);
  const source = fs.readFileSync(path.join(root, 'operator-locale.js'), 'utf8');
  const dictionary = parse(source, { sourceType: 'module' }).program.body.flatMap(node => node.declarations || [])
    .find(node => node.id.name === 'OPERATOR_NL').init;
  const entries = dictionary.properties.filter(node => !compaction.unusedKeys.has(node.key.value)).map(node => ({
    key: node.key.value, lookup: compaction.compactTokens.get(node.key.value) || node.key.value, dutch: node.value.value
  }));
  expect(entries.length).toBeGreaterThan(4000);
  const assets = fs.readdirSync(path.join(root, 'dist/assets')).filter(name => /^operator-locale-.+\.js$/.test(name));
  expect(assets).toHaveLength(1);
  const errors = [], writes = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  page.on('request', request => {
    if (request.url().includes('/api/ledger/') && !['GET', 'HEAD'].includes(request.method())) writes.push(request.url());
  });
  await page.goto('/');
  await expect(page).toHaveTitle(/Contractor\.AI/);
  await expect(page.getByTestId('contractor-workbench')).toBeVisible();
  await expect(page.locator('vite-error-overlay')).toHaveCount(0);
  const observation = await page.evaluate(async ({ asset, entries }) => {
    const namespace = await import(asset);
    const functions = Object.values(namespace).filter(value => typeof value === 'function');
    if (functions.length !== 1) throw new Error('Expected the actual operator catalog translator export.');
    const [translate] = functions, failures = [];
    for (const entry of entries) {
      const variables = Object.fromEntries([...new Set([...entry.key.matchAll(/\{([^{}]+)\}/g)].map(match => match[1]))]
        .map(name => [name, `fixture-${name}`]));
      const interpolate = text => Object.entries(variables).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, value), text);
      if (translate('nl-NL', entry.lookup, variables, entry.key) !== interpolate(entry.dutch)) failures.push(`nl:${entry.key}`);
      if (translate('en-GB', entry.lookup, variables, entry.key) !== interpolate(entry.key)) failures.push(`en:${entry.key}`);
    }
    const unknown = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', '~zzzz', '~ZZZ', '~!'];
    for (const key of unknown) {
      if (translate('nl-NL', key, { count: 3 }) !== key) failures.push(`unknown-nl:${key}`);
      if (translate('en-GB', key, { count: 3 }, 'Explicit {count}') !== 'Explicit 3') failures.push(`unknown-en:${key}`);
    }
    return { checkedEntries: entries.length, checkedLanguageOutputs: entries.length * 2,
      unknownKeys: unknown.length, failures };
  }, { asset: `/assets/${assets[0]}`, entries });
  expect(observation.failures).toEqual([]);
  await page.getByLabel(/^(Language|Taal)$/).selectOption('en-GB');
  await expect(page.locator('.topbar h1')).toHaveText('Today');
  await page.getByLabel(/^(Language|Taal)$/).selectOption('nl-NL');
  await expect(page.locator('.topbar h1')).toHaveText('Vandaag');
  await page.screenshot({ path: testInfo.outputPath('catalog-dashboard-desktop.png') });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator('.side-nav')).toHaveCSS('visibility', 'hidden');
  await expect(page.getByTestId('contractor-workbench')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('catalog-dashboard-mobile.png') });
  expect(errors).toEqual([]);
  expect(writes).toEqual([]);
  fs.writeFileSync(testInfo.outputPath('catalog-observation.json'), JSON.stringify(observation, null, 2));
  console.log(JSON.stringify({ productionCatalog: observation }));
});
