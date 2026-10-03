const fs = require('node:fs');
const path = require('node:path');
const { parseArgs } = require('node:util');
const { DatabaseSync } = require('node:sqlite');
const { PostgresSyncDatabase, resolvePostgresConnectionOptions } = require('../postgres-sync-database');
const { acquireLedgerRuntimeLock, acquireRuntimeLock } = require('../runtime-lock');
const { readCompanyRuntime, assertSameCompany } = require('../company-runtime');
const { generateAuthorityKey, readPrivateKeyFile, targetDescription, prepareSource, retireSource, activateTarget, abortSource, readAuthority,
  readAuthorityMarker, retainAuthorityMarker, assertAuthorityMarker, verifyAuthorityHistory } = require('../company-authority');
const { createHandoverPackage, privateOutput, readDocument } = require('../company-handover');

function required(values, name) { if (!values[name]?.trim()) throw new Error(`--${name} is required.`); return values[name]; }
function confirm(values, expected) { if (values.confirm !== expected) throw new Error(`Review the operation and supply --confirm ${expected}.`); }
async function main(args = process.argv.slice(2), env = process.env) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { help: { type: 'boolean' },
    ...Object.fromEntries(['output', 'origin', 'company-id', 'ledger-id', 'actor', 'reference', 'target-file', 'receipt-file', 'release-file', 'confirm'].map(name => [name, { type: 'string' }])) } });
  const commands = ['keygen', 'describe-target', 'status', 'freeze', 'package', 'export-permit', 'export-receipt', 'retire', 'activate', 'abort'];
  if (values.help) return { commands, guide: 'docs/COMPANY_HANDOVER.md', automaticExternalActions: false };
  const command = positionals[0];
  if (positionals.length !== 1 || !commands.includes(command)) throw new Error('Choose a documented handover command.');
  if (command === 'keygen') {
    confirm(values, 'CREATE_ENVIRONMENT_KEY');
    const key = generateAuthorityKey();
    return { environmentId: key.environmentId, keyFile: privateOutput(required(values, 'output'), key) };
  }
  const key = readPrivateKeyFile(env.CONTRACTOR_AI_AUTHORITY_KEY_FILE);
  if (command === 'describe-target') return { targetFile: privateOutput(required(values, 'output'), targetDescription({ key, origin: required(values, 'origin') })) };
  const mode = env.CONTRACTOR_AI_RUNTIME_MODE || 'local';
  if (!['local', 'hosted'].includes(mode)) throw new Error('Choose local or hosted mode.');
  const dataDir = path.resolve(env.CONTRACTOR_AI_DATA_DIR || (env.STATE_FILE ? path.dirname(path.resolve(env.STATE_FILE)) : path.resolve(__dirname, '..', 'data')));
  const ledgerFile = path.resolve(env.LEDGER_DB_FILE || path.join(dataDir, 'contractor-ledger.sqlite'));
  let db;
  const locks = [];
  try {
    if (mode === 'local') {
      if (env.CONTRACTOR_AI_DATABASE_URL || !fs.existsSync(ledgerFile)) throw new Error('Choose an existing local SQLite ledger and no PostgreSQL URL.');
      locks.push(acquireRuntimeLock(dataDir, { purpose: 'handover' }));
      locks.push(acquireLedgerRuntimeLock(ledgerFile, { purpose: 'handover' }));
      db = new DatabaseSync(ledgerFile);
      db.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
    } else {
      const url = env.CONTRACTOR_AI_DATABASE_URL;
      if (!url || resolvePostgresConnectionOptions(url).sslMode !== 'verify-full') throw new Error('Hosted handover requires a PostgreSQL database with verified TLS.');
      db = new PostgresSyncDatabase({ connectionString: url });
    }
    const company = readCompanyRuntime(db);
    if (!company) throw new Error('The configured database is not a bound company ledger.');
    const sourceMarker = mode === 'local' ? readAuthorityMarker(ledgerFile) : null;
    if (command === 'status') return { company, authority: readAuthority(db), history: verifyAuthorityHistory(db), sourceMarker };
    assertAuthorityMarker(db, sourceMarker);
    const beforeCommit = state => retainAuthorityMarker(ledgerFile, state);
    assertSameCompany({ id: required(values, 'company-id'), ledgerId: required(values, 'ledger-id') }, company);
    const actor = required(values, 'actor'), reason = required(values, 'reference');
    if (['freeze', 'package', 'retire', 'abort', 'export-permit'].includes(command) && mode !== 'local') throw new Error('This command requires the stopped local source.');
    if (command === 'freeze') {
      confirm(values, 'FREEZE_LOCAL_SOURCE');
      const state = prepareSource(db, { key, company, target: readDocument(required(values, 'target-file')), actor, reason, beforeCommit });
      return { status: state.status, transferId: state.transferId, sourceStopped: true };
    }
    if (command === 'package') {
      confirm(values, 'PACKAGE_FROZEN_SOURCE');
      const output = required(values, 'output');
      const result = createHandoverPackage(db, { key, dataDir, uploadDir: env.UPLOAD_DIR || path.join(dataDir, 'uploads'),
        signingKey: env.CONTRACTOR_AI_BACKUP_SIGNING_KEY, ledgerFilename: path.basename(ledgerFile) });
      return { backupId: result.backupId, directory: result.directory, permitFile: privateOutput(output, result.permit), verified: result.verified, encrypted: false };
    }
    if (command === 'export-permit') {
      const state = readAuthority(db);
      if (!state?.details.permit) throw new Error('No completed source package is retained.');
      return { permitFile: privateOutput(required(values, 'output'), state.details.permit) };
    }
    if (command === 'export-receipt') {
      const state = readAuthority(db);
      if (!key || state?.environmentId !== key.environmentId || state?.publicKey !== key.publicKey || !state?.details.receipt) throw new Error('No verified target receipt is retained for this private environment key.');
      return { receiptFile: privateOutput(required(values, 'output'), state.details.receipt) };
    }
    if (command === 'retire') {
      confirm(values, 'RETIRE_LOCAL_SOURCE');
      const output = required(values, 'output');
      const release = retireSource(db, { key, receipt: readDocument(required(values, 'receipt-file')), actor, reason, beforeCommit });
      return { sourceStatus: 'retired', releaseFile: privateOutput(output, release) };
    }
    if (command === 'activate') {
      if (mode !== 'hosted') throw new Error('Activate only the verified hosted target.');
      confirm(values, 'ACTIVATE_VERIFIED_TARGET');
      const state = activateTarget(db, { key, release: readDocument(required(values, 'release-file')), actor, reason });
      return { status: state.status, environmentId: state.environmentId, generation: state.generation };
    }
    confirm(values, 'ABORT_UNRELEASED_HANDOVER');
    const state = abortSource(db, { key, actor, reason, beforeCommit });
    return { status: state.status, generation: state.generation, targetCanActivate: false };
  } finally { db?.close(); for (const lock of locks.reverse()) lock.release(); }
}
if (require.main === module) main().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => {
  process.stderr.write(`Company handover failed: ${error.code || 'operation_failed'}. Retain all outputs and inspect status before retrying.\n`);
  process.exitCode = 1;
});
module.exports = { main };
