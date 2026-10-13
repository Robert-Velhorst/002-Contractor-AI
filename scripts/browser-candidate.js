const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { dockerRuntimeFiles, runtimeSourceClosure, windowsRuntimeFiles } = require('./runtime-source-inventory');

const digest = bytes => createHash('sha256').update(bytes).digest('hex');

function directoryFiles(root, relative) {
  const directory = path.join(root, relative);
  const stat = fs.lstatSync(directory);
  if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Browser candidate requires an ordinary directory: ${relative}`);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const child = path.posix.join(relative, entry.name);
    if (entry.isDirectory()) return directoryFiles(root, child);
    if (!entry.isFile()) throw new Error(`Browser candidate contains a link or special file: ${child}`);
    return [child];
  });
}

function fileHashes(root, files) {
  return [...new Set(files)].sort().map(relative => {
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(`${root}${path.sep}`)) throw new Error(`Browser candidate file leaves the project: ${relative}`);
    let parent = root;
    for (const part of path.relative(root, path.dirname(filename)).split(path.sep).filter(Boolean)) {
      parent = path.join(parent, part);
      const parentStat = fs.lstatSync(parent);
      if (parentStat.isSymbolicLink() || !parentStat.isDirectory()) throw new Error(`Browser candidate has a linked or invalid parent: ${relative}`);
    }
    const stat = fs.lstatSync(filename);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error(`Browser candidate requires an ordinary file: ${relative}`);
    const bytes = fs.readFileSync(filename);
    return { path: relative, bytes: bytes.length, sha256: digest(bytes) };
  });
}

function captureBrowserCandidate(projectRoot = path.resolve(__dirname, '..')) {
  const root = path.resolve(projectRoot);
  const build = fileHashes(root, directoryFiles(root, 'dist'));
  if (!build.some(file => file.path === 'dist/index.html')) throw new Error('The browser candidate has no built entry page.');
  const manifests = [...new Set([...dockerRuntimeFiles(root), ...windowsRuntimeFiles(root)])];
  const runtime = fileHashes(root, [...manifests,
    ...runtimeSourceClosure(root, manifests.filter(file => /\.[cm]?js$/.test(file))),
    'Dockerfile', 'scripts/build-windows-standalone.js']);
  const sourceExtension = /\.(?:[cm]?[jt]sx?|css|html)$/;
  const frontend = fileHashes(root, [
    ...fs.readdirSync(root).filter(file => sourceExtension.test(file)),
    ...directoryFiles(root, 'components').filter(file => sourceExtension.test(file))
  ]);
  const browserEntries = [...directoryFiles(root, 'e2e'),
    'playwright.config.js', 'scripts/run-browser-tests.js', 'scripts/browser-candidate.js',
    'scripts/browser-coverage-reporter.js'];
  const browser = fileHashes(root, [...browserEntries,
    ...runtimeSourceClosure(root, browserEntries.filter(file => /\.[cm]?js$/.test(file)))]);
  const identity = { format: 'contractor-browser-candidate/v1', build, runtime, frontend, browser };
  return { ...identity, projectRoot: root, sha256: digest(JSON.stringify(identity)) };
}

function verifyBrowserCandidate(expected) {
  const current = captureBrowserCandidate(expected.projectRoot);
  if (current.sha256 === expected.sha256) return;
  const groups = ['build', 'runtime', 'frontend', 'browser'];
  const changed = [...new Set(groups.flatMap(group => {
    const before = new Map(expected[group].map(file => [file.path, file.sha256]));
    const after = new Map(current[group].map(file => [file.path, file.sha256]));
    return [...new Set([...before.keys(), ...after.keys()])]
      .filter(file => before.get(file) !== after.get(file));
  }))].sort();
  const error = new Error(`Browser candidate changed during verification: ${changed.join(', ')}`);
  error.code = 'browser_candidate_changed';
  error.changedFiles = changed;
  throw error;
}

module.exports = { captureBrowserCandidate, verifyBrowserCandidate };
