const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function copyEvidenceBackup(sourceRoot, backupDir) {
  const source = path.resolve(sourceRoot), targetRoot = path.resolve(backupDir, 'evidence');
  if (targetRoot.startsWith(`${source}${path.sep}`) || source.startsWith(`${targetRoot}${path.sep}`) || source === targetRoot) throw new Error('Evidence and backup directories must not overlap.');
  const copied = [], entries = [];
  if (!fs.existsSync(source)) return { copied, entries };
  if (fs.lstatSync(source).isSymbolicLink()) throw new Error('Evidence backup refuses a symbolic-link root.');
  fs.mkdirSync(targetRoot, { recursive: true, mode: 0o700 });
  const visit = (directory, relativeDirectory = '') => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) throw new Error(`Evidence backup refuses symbolic link: ${entry.name}`);
      const relative = path.join(relativeDirectory, entry.name), sourcePath = path.join(directory, entry.name);
      if (entry.isDirectory()) { visit(sourcePath, relative); continue; }
      if (!entry.isFile() || entry.name.startsWith('.')) continue;
      const target = path.resolve(targetRoot, relative);
      if (!target.startsWith(`${targetRoot}${path.sep}`)) throw new Error('Evidence backup path could not be resolved safely.');
      fs.mkdirSync(path.dirname(target), { recursive: true, mode: 0o700 });
      fs.copyFileSync(sourcePath, target, fs.constants.COPYFILE_EXCL);
      const file = path.posix.join('evidence', relative.replace(/\\/g, '/'));
      copied.push(path.relative(__dirname, target).replace(/\\/g, '/'));
      entries.push({ file, bytes: fs.statSync(target).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(target)).digest('hex') });
    }
  };
  visit(source);
  return { copied, entries };
}

module.exports = { copyEvidenceBackup };
