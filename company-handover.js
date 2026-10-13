const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { signBackupManifest } = require('./backup-manifest');
const { copyEvidenceBackup } = require('./backup-evidence');
const { readAuthority, authorityKey, digest, sealSourcePackage } = require('./company-authority');

function privateOutput(filename, value) {
  const descriptor = fs.openSync(filename, 'wx', 0o600);
  try { fs.writeFileSync(descriptor, `${JSON.stringify(value, null, 2)}\n`); fs.fsyncSync(descriptor); }
  finally { fs.closeSync(descriptor); }
  return path.resolve(filename);
}
function readDocument(filename) {
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 65536) throw new Error('Choose a bounded handover document.');
  return JSON.parse(fs.readFileSync(filename, 'utf8'));
}
function createHandoverPackage(db, { key, dataDir, uploadDir, signingKey, ledgerFilename = 'contractor-ledger.sqlite' }) {
  const state = readAuthority(db), identity = authorityKey(key);
  if (!state || state.status !== 'frozen' || state.publicKey !== identity.publicKey || state.environmentId !== identity.environmentId) throw new Error('Package only the frozen source with its matching private key.');
  if (state.details.permit) throw new Error('This transfer already has a sealed package. Export its retained permit; do not create a second package.');
  if (!/^[A-Za-z0-9._-]+\.(?:sqlite3?|db)$/.test(ledgerFilename)) throw new Error('Choose a simple SQLite ledger filename.');
  signBackupManifest({}, signingKey);
  const root = path.resolve(dataDir, 'backups');
  fs.mkdirSync(root, { recursive: true, mode: 0o700 });
  const backupId = `handover-${state.transferId}-${crypto.randomBytes(4).toString('hex')}`;
  const directory = path.join(root, backupId);
  fs.mkdirSync(directory, { mode: 0o700 });
  // The source is fenced before the copy. Failed attempts remain available for diagnosis.
  const databaseFile = path.join(directory, ledgerFilename);
  db.prepare('VACUUM INTO ?').run(databaseFile);
  const files = [{ file: ledgerFilename, bytes: fs.statSync(databaseFile).size, sha256: digest(fs.readFileSync(databaseFile)) }];
  const evidence = copyEvidenceBackup(uploadDir, directory);
  files.push(...evidence.entries);
  const manifest = signBackupManifest({ company: state.details.company, backupId, createdAt: new Date().toISOString(),
    databaseMode: 'sqlite', database: { engine: 'sqlite', file: ledgerFilename }, evidence: { included: true, fileCount: evidence.entries.length }, files }, signingKey);
  const manifestFile = path.join(directory, 'manifest.json');
  privateOutput(manifestFile, manifest);
  const verification = require('./scripts/migrate-local-backup-to-hosted').verifyBackupDirectory(directory, { signingKey });
  const permit = sealSourcePackage(db, { key: identity, backupId, manifestSha256: verification.manifestHash });
  return { backupId, directory, permit, evidenceFiles: evidence.entries.length, verified: true, encrypted: false };
}

module.exports = { createHandoverPackage, privateOutput, readDocument };
