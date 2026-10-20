const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-brotli-output-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test('Brotli compression follows relative build output without rewriting the served assets', async t => {
  const { brotliAssetsPlugin } = await import('../brotli-assets-plugin.mjs');
  const root = fixture(t);
  const activeAssets = path.join(root, 'dist', 'assets');
  const stagedAssets = path.join(root, 'candidate', 'assets');
  fs.mkdirSync(activeAssets, { recursive: true });
  fs.mkdirSync(stagedAssets, { recursive: true });
  fs.writeFileSync(path.join(activeAssets, 'current.js'), 'current served asset');
  fs.writeFileSync(path.join(activeAssets, 'current.js.br'), 'do not replace');
  const sources = { 'entry.js': 'export const answer = 42;', 'screen.css': 'body{color:green}', 'notes.txt': 'not a web asset' };
  for (const [name, source] of Object.entries(sources)) fs.writeFileSync(path.join(stagedAssets, name), source);
  const plugin = brotliAssetsPlugin();
  plugin.configResolved({ root, build: { outDir: 'candidate' } });
  plugin.closeBundle();
  for (const name of ['entry.js', 'screen.css']) {
    assert.equal(zlib.brotliDecompressSync(fs.readFileSync(path.join(stagedAssets, `${name}.br`))).toString(), sources[name]);
  }
  assert.equal(fs.existsSync(path.join(stagedAssets, 'notes.txt.br')), false);
  assert.equal(fs.readFileSync(path.join(activeAssets, 'current.js.br'), 'utf8'), 'do not replace');
  assert.deepEqual(fs.readdirSync(activeAssets).sort(), ['current.js', 'current.js.br']);
});

test('Brotli compression supports an absolute staged output and a missing asset directory', async t => {
  const { brotliAssetsPlugin } = await import('../brotli-assets-plugin.mjs');
  const root = fixture(t);
  const outDir = path.join(root, 'isolated', 'web');
  const plugin = brotliAssetsPlugin();
  plugin.configResolved({ root: path.join(root, 'different-root'), build: { outDir } });
  assert.doesNotThrow(() => plugin.closeBundle());
  fs.mkdirSync(path.join(outDir, 'assets'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'assets', 'entry.js'), 'absolute output');
  plugin.closeBundle();
  assert.equal(zlib.brotliDecompressSync(fs.readFileSync(path.join(outDir, 'assets', 'entry.js.br'))).toString(), 'absolute output');
});

test('Brotli compression refuses to guess an output path before Vite configuration resolves', async () => {
  const { brotliAssetsPlugin } = await import('../brotli-assets-plugin.mjs');
  assert.throws(() => brotliAssetsPlugin().closeBundle(), /build output must be resolved/);
});

test('precompression selects the smaller lossless representation per asset, not blindly the highest quality', async t => {
  const { brotliAssetsPlugin } = await import('../brotli-assets-plugin.mjs');
  const root = fixture(t), assets = path.join(root, 'candidate', 'assets');
  fs.mkdirSync(assets, { recursive: true });
  const sources = {
    'records.js': 'export const rows=' + JSON.stringify(Array.from({ length: 700 }, (_, i) => ({
      id: `job-${i}`, role: ['installer', 'supervisor', 'carpenter'][i % 3],
      title: `Retained construction job ${i}`, stage: 'review_pending', reference: `source-reference-${i}`, approved: false,
    }))) + ';',
    'labels.js': 'export const labels=' + JSON.stringify(Array.from({ length: 45 }, (_, i) => `job-${i * 7919 % 503}-review-${i % 7}`)) + ';',
  };
  for (const [name, source] of Object.entries(sources)) fs.writeFileSync(path.join(assets, name), source);
  const plugin = brotliAssetsPlugin();
  plugin.configResolved({ root, build: { outDir: 'candidate' } });
  plugin.closeBundle();
  for (const [name, source] of Object.entries(sources)) {
    const choices = [10, 11].map(quality => zlib.brotliCompressSync(source, {
      params: { [zlib.constants.BROTLI_PARAM_QUALITY]: quality },
    }));
    const selected = choices[1].length < choices[0].length ? choices[1] : choices[0];
    if (name === 'records.js') assert.ok(choices[1].length < choices[0].length, 'fixture exercises higher compression');
    else assert.ok(choices[0].length < choices[1].length, 'fixture exercises fallback to the smaller baseline');
    const actual = fs.readFileSync(path.join(assets, `${name}.br`));
    assert.deepEqual(actual, selected);
    assert.deepEqual(zlib.brotliDecompressSync(actual), Buffer.from(source));
    assert.deepEqual(fs.readFileSync(path.join(assets, name)), Buffer.from(source));
  }
});
