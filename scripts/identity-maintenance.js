const { parseArgs } = require('node:util');
const { IdentityRegistry, fail, registryOptions } = require('../identity-registry');
const { createRegistryBackup, decodeRegistryBackup, readRegistryBackup, restoreRegistryBackup, rotateRegistryKeys, writePrivateExclusive } = require('../identity-recovery');

function needed(values, key) { if (!values[key]?.trim()) fail('identity_maintenance_argument', `--${key} is required.`); return values[key]; }
function confirmation(values, expected) { if (values.confirm !== expected) fail('identity_maintenance_confirmation', `Use --confirm ${expected} only after reviewing the documented recovery effects.`); }

async function main(args = process.argv.slice(2), env = process.env) {
  const { values, positionals } = parseArgs({ args, allowPositionals: true, strict: true, options: { help: { type: 'boolean' }, ...Object.fromEntries([
    'output', 'backup-file', 'actor', 'reference', 'expected-registry-id', 'bindings-output', 'person-id', 'login-name', 'delivery-reference', 'request-id', 'confirm',
  ].map(name => [name, { type: 'string' }])) } });
  if (values.help) return { commands: ['status', 'find-person', 'backup', 'verify', 'restore', 'rotate-keys', 'recover-person', 'revoke-recovery'], guide: 'docs/IDENTITY_RECOVERY.md',
    boundary: 'Registry OS administrators only. No public/company recovery bypass. Keys come from private environment configuration; output files must be new and protected.' };
  const command = positionals[0];
  if (positionals.length !== 1 || !['status', 'find-person', 'backup', 'verify', 'restore', 'rotate-keys', 'recover-person', 'revoke-recovery'].includes(command)) {
    fail('identity_maintenance_command', 'Use --help for registry maintenance commands. See docs/IDENTITY_RECOVERY.md.');
  }
  if (command === 'verify') {
    const { summary } = decodeRegistryBackup(readRegistryBackup(needed(values, 'backup-file')), env.CONTRACTOR_IDENTITY_BACKUP_KEY, { allowLoopback: env.CONTRACTOR_IDENTITY_MODE === 'local' });
    return { valid: true, ...summary };
  }
  const options = registryOptions(env);
  if (command === 'status') {
    const registry = new IdentityRegistry({ ...options, requireExisting: true });
    try {
      const binding = registry.assertCurrent();
      return { registryId: registry.id, issuer: registry.issuer, epoch: registry.epoch, ready: binding.ready !== false,
        audit: registry.verifyAudit(), migrations: registry.db.prepare('SELECT version FROM registry_migrations ORDER BY version').all().map(row => row.version) };
    } finally { registry.close(); }
  }
  const actor = needed(values, 'actor'), reference = needed(values, 'reference');
  if (command === 'restore') {
    confirmation(values, 'RESTORE_REGISTRY_WITHOUT_ACCESS');
    const envelope = readRegistryBackup(needed(values, 'backup-file')), bindingFile = needed(values, 'bindings-output');
    const { registry, receipt } = restoreRegistryBackup({ envelope, backupKey: env.CONTRACTOR_IDENTITY_BACKUP_KEY,
      target: options, expectedRegistryId: needed(values, 'expected-registry-id'), actor, reference,
      prepareBindings: bindings => writePrivateExclusive(bindingFile, bindings) });
    registry.close(); return receipt;
  }
  const registry = new IdentityRegistry({ ...options, requireExisting: true });
  try {
    registry.assertCurrent({ forServing: true });
    if (command === 'find-person') {
      const login = needed(values, 'login-name').trim().toLowerCase();
      if (login.length > 100) fail('identity_maintenance_argument', 'Login name is too long.');
      return registry.transaction(() => {
        const person = registry.db.prepare('SELECT id, login_name, status, created_at FROM registry_identities WHERE login_name = ?').get(login);
        if (!person) fail('identity_recovery_person_missing', 'No exact login name found.', 404);
        registry.audit(null, person.id, 'identity_recovery_lookup', actor, { reference });
        return { personId: person.id, loginName: person.login_name, status: person.status, createdAt: person.created_at };
      });
    }
    if (command === 'backup') {
      const { envelope } = createRegistryBackup(registry, { backupKey: env.CONTRACTOR_IDENTITY_BACKUP_KEY, actor, reference });
      const filename = writePrivateExclusive(needed(values, 'output'), envelope);
      const { summary } = decodeRegistryBackup(readRegistryBackup(filename), env.CONTRACTOR_IDENTITY_BACKUP_KEY, { allowLoopback: options.allowLoopback });
      return { valid: true, action: 'registry_backup_verified', filename, ...summary };
    }
    if (command === 'rotate-keys') {
      confirmation(values, 'ROTATE_REGISTRY_KEYS_AND_SESSIONS');
      if (needed(values, 'expected-registry-id') !== registry.id) fail('identity_rotation_scope_mismatch', 'The registry ID does not match.', 409);
      const bindingFile = needed(values, 'bindings-output');
      return rotateRegistryKeys(registry, { envelope: readRegistryBackup(needed(values, 'backup-file')), backupKey: env.CONTRACTOR_IDENTITY_BACKUP_KEY,
        newKey: env.CONTRACTOR_IDENTITY_NEW_ENCRYPTION_KEY, actor, reference,
        prepareBindings: bindings => writePrivateExclusive(bindingFile, bindings) });
    }
    if (command === 'recover-person') {
      confirmation(values, 'AUTHORIZE_PERSON_RECOVERY');
      const filename = needed(values, 'output');
      return registry.transaction(() => {
        const recovery = registry.issueAssistedRecovery(needed(values, 'person-id'), { expectedLoginName: needed(values, 'login-name'), reference,
          deliveryReference: needed(values, 'delivery-reference'), confirmation: values.confirm }, actor);
        const recoveryFile = writePrivateExclusive(filename, recovery);
        return { valid: true, action: 'person_recovery_authorized', personId: recovery.personId, requestId: recovery.id, expiresAt: recovery.expiresAt, recoveryFile };
      });
    }
    confirmation(values, 'REVOKE_PERSON_RECOVERY');
    return registry.revokeAssistedRecovery(needed(values, 'person-id'), needed(values, 'request-id'), reference, actor);
  } finally { registry.close(); }
}

if (require.main === module) main().then(result => process.stdout.write(`${JSON.stringify(result)}\n`)).catch(error => {
  // Secrets, SQL parameters and connection strings must not become terminal logs.
  process.stderr.write(`Identity maintenance failed: ${error.code || 'operation_failed'}. No success is claimed; retain any output files and verify the database before retrying.\n`);
  process.exitCode = 1;
});

module.exports = { main, registryOptions };
