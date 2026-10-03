const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { captureBrowserCandidate, verifyBrowserCandidate } = require('../scripts/browser-candidate');
const { executeBrowserBatches } = require('../scripts/run-browser-tests');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-browser-candidate-'));
  t.after(() => {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('contractor-ai-browser-candidate-'));
    fs.rmSync(root, { recursive: true, force: true });
  });
  for (const directory of ['dist/assets', 'scripts', 'e2e', 'components', 'docs', 'tests']) fs.mkdirSync(path.join(root, directory), { recursive: true });
  const sources = {
    'dist/index.html': '<script src="/assets/app.js"></script>',
    'dist/assets/app.js': 'export const title = "Contractor.AI";',
    'dist/assets/app.js.br': 'compressed fixture',
    'App.jsx': 'export default function App() { return null; }',
    'App.css': 'body { color: black; }',
    'components/Example.jsx': 'export default function Example() { return null; }',
    'server.js': 'require("./helper");',
    'helper.js': 'module.exports = {};',
    'package.json': '{}', 'package-lock.json': '{}',
    'Dockerfile': 'FROM node:22 AS runtime\nCOPY server.js helper.js package*.json ./\nCOPY docs/guide.md ./docs/\n',
    'scripts/build-windows-standalone.js': 'const runtimeFiles = ["server.js", "helper.js", "package.json", "package-lock.json", "docs/guide.md"];',
    'docs/guide.md': 'Packaged operator guidance.',
    'scripts/run-browser-tests.js': 'module.exports = {};',
    'scripts/browser-candidate.js': 'module.exports = {};',
    'scripts/browser-coverage-reporter.js': 'module.exports = {};',
    'playwright.config.js': 'module.exports = {};',
    'e2e/fixture.spec.js': 'test("one workflow", () => {});',
    'e2e/helpers.js': 'module.exports = require("../tests/image-fixtures");',
    'tests/image-fixtures.js': 'module.exports = {};'
  };
  for (const [file, source] of Object.entries(sources)) fs.writeFileSync(path.join(root, file), source);
  return root;
}

test('browser candidate binds served files, compression sidecars, runtime closure and exact browser sources', t => {
  const root = fixture(t);
  const candidate = captureBrowserCandidate(root);
  assert.match(candidate.sha256, /^[a-f0-9]{64}$/);
  assert.deepEqual(candidate.build.map(item => item.path), ['dist/assets/app.js', 'dist/assets/app.js.br', 'dist/index.html']);
  assert.ok(candidate.runtime.some(item => item.path === 'helper.js'));
  assert.ok(candidate.runtime.some(item => item.path === 'docs/guide.md'));
  assert.ok(candidate.frontend.some(item => item.path === 'App.jsx'));
  assert.ok(candidate.frontend.some(item => item.path === 'components/Example.jsx'));
  assert.ok(candidate.browser.some(item => item.path === 'e2e/helpers.js'));
  assert.ok(candidate.browser.some(item => item.path === 'tests/image-fixtures.js'));
  assert.ok(candidate.browser.some(item => item.path === 'scripts/browser-coverage-reporter.js'));
  assert.deepEqual(captureBrowserCandidate(root), candidate);
  assert.doesNotThrow(() => verifyBrowserCandidate(candidate));
});

for (const file of ['dist/index.html', 'dist/assets/app.js', 'dist/assets/app.js.br', 'server.js', 'helper.js',
  'package-lock.json', 'docs/guide.md', 'App.jsx', 'App.css', 'components/Example.jsx',
  'e2e/fixture.spec.js', 'e2e/helpers.js', 'tests/image-fixtures.js', 'playwright.config.js', 'scripts/browser-coverage-reporter.js']) {
  test(`browser verification refuses changed candidate bytes in ${file}`, t => {
    const root = fixture(t);
    const candidate = captureBrowserCandidate(root);
    fs.appendFileSync(path.join(root, file), '\n// changed');
    assert.throws(() => verifyBrowserCandidate(candidate), error => error.code === 'browser_candidate_changed'
      && error.changedFiles.filter(changed => changed === file).length === 1);
  });
}

test('browser verification refuses added build files and deleted compression sidecars', t => {
  const root = fixture(t);
  const candidate = captureBrowserCandidate(root);
  fs.writeFileSync(path.join(root, 'dist/assets/second.js'), 'new build');
  assert.throws(() => verifyBrowserCandidate(candidate), /dist\/assets\/second.js/);
  fs.unlinkSync(path.join(root, 'dist/assets/second.js'));
  fs.unlinkSync(path.join(root, 'dist/assets/app.js.br'));
  assert.throws(() => verifyBrowserCandidate(candidate), /dist\/assets\/app.js.br/);
});

test('browser verification refuses missing served entry, runtime dependency or browser source', t => {
  const root = fixture(t);
  const candidate = captureBrowserCandidate(root);
  for (const file of ['dist/index.html', 'helper.js', 'scripts/browser-coverage-reporter.js']) {
    const filename = path.join(root, file);
    const bytes = fs.readFileSync(filename);
    fs.unlinkSync(filename);
    assert.throws(() => verifyBrowserCandidate(candidate));
    fs.writeFileSync(filename, bytes);
  }
});

test('browser candidate excludes live ledgers, uploads and unpackaged documentation changes', t => {
  const root = fixture(t);
  const candidate = captureBrowserCandidate(root);
  for (const directory of ['data', 'uploads']) fs.mkdirSync(path.join(root, directory));
  fs.writeFileSync(path.join(root, 'data/ledger.sqlite'), 'private state');
  fs.writeFileSync(path.join(root, 'uploads/evidence.pdf'), 'private evidence');
  fs.writeFileSync(path.join(root, 'docs/verification.md'), 'updated notes');
  assert.deepEqual(captureBrowserCandidate(root), candidate);
});

for (const directory of ['dist', 'e2e', 'scripts', 'components']) {
  test(`browser verification rejects a linked ${directory} directory`, t => {
    const root = fixture(t);
    const candidate = captureBrowserCandidate(root);
    const original = path.join(root, directory);
    const target = path.join(root, `${directory}-linked-target`);
    fs.renameSync(original, target);
    fs.symlinkSync(target, original, 'junction');
    assert.throws(() => verifyBrowserCandidate(candidate), /ordinary directory|linked or invalid parent/);
    fs.unlinkSync(original);
    fs.renameSync(target, original);
  });
}

test('browser batches stop on candidate mutation before launch or after completion, even in audit mode', async t => {
  const root = fixture(t);
  const candidate = captureBrowserCandidate(root);
  const batches = [['first'], ['second']];
  let calls = 0;
  await assert.rejects(executeBrowserBatches(batches, { continueOnFailure: true, outputRoot: root,
    verifyCandidate: () => verifyBrowserCandidate(candidate),
    runBatch: async () => { calls += 1; fs.writeFileSync(path.join(root, 'dist/assets/new.js'), 'changed'); return 0; }
  }), /candidate changed/);
  assert.equal(calls, 1);
  await assert.rejects(executeBrowserBatches(batches, { continueOnFailure: true, outputRoot: root,
    verifyCandidate: () => verifyBrowserCandidate(candidate), runBatch: async () => { calls += 1; return 0; }
  }), /candidate changed/);
  assert.equal(calls, 1);
});

test('browser verification rejects an empty audit or empty batch instead of reporting success', async () => {
  for (const batches of [[], [[]], [['first'], []]]) {
    await assert.rejects(executeBrowserBatches(batches, { outputRoot: os.tmpdir(),
      runBatch: async () => assert.fail('No empty audit should launch a batch') }), /non-empty/);
  }
});
