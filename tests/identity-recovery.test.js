const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { IdentityRegistry } = require('../identity-registry');
const { registryAdapter } = require('../identity-oidc-adapter');
const { createIdentityApp } = require('../identity-server');
const { createRegistryBackup, decodeRegistryBackup, restoreRegistryBackup, rotateRegistryKeys, writePrivateExclusive } = require('../identity-recovery');
const { main, registryOptions } = require('../scripts/identity-maintenance');

const input = { loginName: 'recovery-person', name: 'Recovery Person', email: 'private@test.invalid', password: 'long original personal password', privacyAccepted: true };
const authorization = { confirmation: 'AUTHORIZE_PERSON_RECOVERY', expectedLoginName: input.loginName, reference: 'Fixture independently checked identity', deliveryReference: 'Fixture previously verified private channel' };
async function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-identity-recovery-'));
  const options = { dbFile: path.join(root, 'registry.sqlite'), encryptionKey: crypto.randomBytes(32), issuer: 'https://identity.example.test' };
  const registry = new IdentityRegistry(options), backupKey = crypto.randomBytes(32);
  const cleanups = [() => registry.close()];
  t.after(async () => {
    const errors = [];
    for (const cleanup of cleanups.reverse()) try { await cleanup(); } catch (error) { errors.push(error); }
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
    assert.ok(path.basename(root).startsWith('contractor-identity-recovery-'));
    fs.rmSync(root, { recursive: true, force: true, maxRetries: 5, retryDelay: 250 });
    if (errors.length) throw new globalThis.AggregateError(errors, 'Recovery fixture cleanup failed.');
  });
  const person = await registry.register(input), memberships = [];
  for (const id of ['alpha', 'bravo']) {
    registry.configureCompany({ id, ledgerId: crypto.randomUUID(), name: id, origin: `https://${id}.example.test`, clientId: id, clientSecret: crypto.randomBytes(40).toString('base64url') });
    const invite = registry.createInvitation(id, { role: 'field_worker', workerId: 'worker-same-id', reference: 'Invitation fixture' }, 'registry-test');
    const member = registry.claimInvitation(new URL(invite.invitationUrl).hash.split('=')[1], person.identity.id);
    memberships.push(registry.decideMembership(id, member.id, { status: 'active', expectedVersion: member.version, reference: 'Admission fixture' }, 'registry-test'));
  }
  return { root, options, registry, backupKey, person, memberships, cleanup: fn => cleanups.push(fn) };
}
const backup = f => createRegistryBackup(f.registry, { backupKey: f.backupKey, actor: 'registry-test', reference: 'Checked encrypted recovery fixture' });

test('encrypted registry recovery preserves relationships and audit but never restores old credentials or admissions', async t => {
  const f = await fixture(t), { registry, person, memberships } = f;
  const session = await registry.login(input);
  const invitation = registry.createInvitation('alpha', { role: 'office_operator', reference: 'Unclaimed fixture' }, 'registry-test');
  const assisted = registry.issueAssistedRecovery(person.identity.id, authorization, 'recovery-operator');
  const adapter = new (registryAdapter(registry))('AccessToken');
  await adapter.upsert('old-provider-token', { accountId: person.identity.id, clientId: 'alpha' }, 3600);
  const oldClient = registry.oidcClients()[0], { envelope, summary } = backup(f);
  const serialized = JSON.stringify(envelope);
  for (const secret of [input.name, input.email, input.password, session.token, person.recoveryCodes[0], oldClient.client_secret]) assert.ok(!serialized.includes(secret));
  const decoded = decodeRegistryBackup(envelope, f.backupKey);
  assert.equal(decoded.summary.credentialsIncluded, false);
  assert.ok(!JSON.stringify(decoded.snapshot).includes('password_hash'));
  assert.equal(summary.counts.registry_memberships, 2);
  await registry.recover({ loginName: input.loginName, password: 'new password after old backup', recoveryCode: person.recoveryCodes[0] });
  registry.decideMembership('alpha', memberships[0].id, { status: 'revoked', expectedVersion: memberships[0].version, reference: 'Revoked after snapshot' }, 'registry-test');
  const restoredKey = crypto.randomBytes(32), target = { ...f.options, dbFile: path.join(f.root, 'recovered.sqlite'), encryptionKey: restoredKey };
  let newBindings;
  const restored = restoreRegistryBackup({ envelope, backupKey: f.backupKey, target, expectedRegistryId: registry.id,
    actor: 'recovery-operator', reference: 'Verified recovery drill', prepareBindings: rows => { newBindings = rows; return writePrivateExclusive(path.join(f.root, 'bindings.json'), rows); } });
  f.cleanup(() => restored.registry.close());
  const next = restored.registry;
  assert.equal(next.id, registry.id);
  assert.equal(next.identity(person.identity.id).status, 'recovery_required');
  await assert.rejects(next.login(input), { code: 'identity_login_failed' });
  await assert.rejects(next.recover({ loginName: input.loginName, password: 'replay old backup credential', recoveryCode: person.recoveryCodes[0] }), { code: 'identity_recovery_failed' });
  await assert.rejects(next.recover({ loginName: input.loginName, password: 'replay old assisted credential', recoveryCode: assisted.recoveryCode }), { code: 'identity_recovery_failed' });
  assert.equal(next.session(session.token), null);
  assert.equal(next.activeMembership('alpha', person.identity.id), null);
  assert.equal(next.activeMembership('bravo', person.identity.id), null);
  assert.equal(next.db.prepare('SELECT COUNT(*) AS n FROM registry_oidc_models').get().n, 0);
  assert.throws(() => next.inspectInvitation(new URL(invitation.invitationUrl).hash.split('=')[1]), { code: 'identity_invitation_unavailable' });
  assert.throws(() => next.authenticateCompany(oldClient.client_id, oldClient.client_secret), { code: 'identity_service_unauthorized' });
  assert.equal(next.authenticateCompany(newBindings[0].clientId, newBindings[0].clientSecret).id, newBindings[0].id);
  const code = next.issueAssistedRecovery(person.identity.id, authorization, 'independently-verified-operator');
  const recovered = await next.recover({ loginName: input.loginName, password: 'new verified recovery password', recoveryCode: code.recoveryCode });
  assert.equal(recovered.recoveryCodes.length, 8);
  assert.ok((await next.login({ ...input, password: 'new verified recovery password' })).token);
  assert.equal(next.activeMembership('alpha', person.identity.id), null, 'Person recovery cannot readmit any company membership.');
  const pending = next.membership('bravo', memberships[1].id);
  next.decideMembership('bravo', pending.id, { status: 'active', expectedVersion: pending.version, reference: 'New company review after disaster' }, 'bravo-owner');
  assert.ok(next.activeMembership('bravo', person.identity.id));
  assert.equal(next.activeMembership('alpha', person.identity.id), null);
  assert.equal(next.verifyAudit().valid, true);
  assert.ok(next.verifyAudit().events > summary.audit.events);
});

test('assisted recovery requires exact person review, expires, revokes, resists replay and does not lock accounts on request', async t => {
  const { registry, person } = await fixture(t), session = await registry.login(input);
  assert.throws(() => registry.issueAssistedRecovery(person.identity.id, { ...authorization, expectedLoginName: 'other-person' }, 'operator'), { code: 'identity_recovery_person_invalid' });
  assert.throws(() => registry.issueAssistedRecovery(person.identity.id, { ...authorization, confirmation: '' }, 'operator'), { code: 'identity_recovery_confirmation' });
  const first = registry.issueAssistedRecovery(person.identity.id, authorization, 'operator');
  assert.ok(registry.session(session.token), 'An unredeemed recovery request cannot lock out the person.');
  const second = registry.issueAssistedRecovery(person.identity.id, authorization, 'operator');
  const recover = code => registry.recover({ loginName: input.loginName, password: 'replacement verified password', recoveryCode: code });
  await assert.rejects(recover(first.recoveryCode), { code: 'identity_recovery_failed' });
  registry.revokeAssistedRecovery(person.identity.id, second.id, 'Wrong channel cancelled', 'operator');
  await assert.rejects(recover(second.recoveryCode), { code: 'identity_recovery_failed' });
  const expired = registry.issueAssistedRecovery(person.identity.id, authorization, 'operator');
  registry.db.prepare('UPDATE registry_assisted_recovery SET expires_at = ? WHERE id = ?').run('2000-01-01T00:00:00.000Z', expired.id);
  await assert.rejects(recover(expired.recoveryCode), { code: 'identity_recovery_failed' });
  const current = registry.issueAssistedRecovery(person.identity.id, authorization, 'operator');
  const attempts = await Promise.allSettled([recover(current.recoveryCode), recover(current.recoveryCode)]);
  assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(registry.session(session.token), null);
  assert.ok(registry.activeMembership('alpha', person.identity.id));
  assert.ok(!JSON.stringify(registry.db.prepare('SELECT * FROM registry_audit').all()).includes(current.recoveryCode));
  assert.ok(!JSON.stringify(registry.db.prepare('SELECT * FROM registry_assisted_recovery').all()).includes(current.recoveryCode));
});

test('recovery refuses tampered backups, wrong registry, reused keys and existing targets before replacing data', async t => {
  const f = await fixture(t), { envelope } = backup(f);
  const tampered = structuredClone(envelope); tampered.header.registryId = `registry_${crypto.randomUUID()}`;
  assert.throws(() => decodeRegistryBackup(tampered, f.backupKey), { code: 'identity_backup_unverified' });
  assert.throws(() => decodeRegistryBackup(envelope, crypto.randomBytes(32)), { code: 'identity_backup_unverified' });
  assert.throws(() => createRegistryBackup(f.registry, { backupKey: f.options.encryptionKey, actor: 'operator', reference: 'unsafe reuse' }), { code: 'identity_backup_key_reuse' });
  const target = { ...f.options, dbFile: path.join(f.root, 'new.sqlite'), encryptionKey: crypto.randomBytes(32) };
  const opts = { envelope, backupKey: f.backupKey, target, expectedRegistryId: f.registry.id, actor: 'operator', reference: 'fixture', prepareBindings: () => 'retained-by-test' };
  assert.throws(() => restoreRegistryBackup({ ...opts, expectedRegistryId: 'wrong-registry' }), { code: 'identity_restore_scope_mismatch' });
  assert.equal(fs.existsSync(target.dbFile), false);
  assert.throws(() => restoreRegistryBackup({ ...opts, target: { ...target, encryptionKey: f.options.encryptionKey } }), { code: 'identity_restore_fresh_key_required' });
  assert.equal(fs.existsSync(target.dbFile), false);
  fs.writeFileSync(target.dbFile, 'existing protected data');
  assert.throws(() => restoreRegistryBackup(opts), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(target.dbFile, 'utf8'), 'existing protected data');
});

test('key rotation uses a current checkpoint, preserves membership and makes old running replicas fail closed', async t => {
  const f = await fixture(t), replica = new IdentityRegistry(f.options);
  f.cleanup(() => replica.close());
  const app = await createIdentityApp({ registry: replica }), server = app.listen(0, '127.0.0.1');
  f.cleanup(() => new Promise(resolve => server.close(resolve)));
  await new Promise(resolve => server.once('listening', resolve));
  const session = await f.registry.login(input), oldClient = f.registry.oidcClients()[0];
  const { envelope } = backup(f), newKey = crypto.randomBytes(32);
  let bindings;
  const receipt = rotateRegistryKeys(f.registry, { envelope, backupKey: f.backupKey, newKey, actor: 'operator', reference: 'planned key rotation', prepareBindings: rows => { bindings = rows; return 'fixture-bindings'; } });
  assert.equal(receipt.sessionsRevoked, true);
  assert.equal(f.registry.session(session.token), null);
  assert.equal(f.registry.verifyAudit().valid, true);
  assert.ok(f.registry.activeMembership('alpha', f.person.identity.id));
  assert.ok((await f.registry.login(input)).token, 'Routine key rotation preserves personal password login.');
  assert.throws(() => replica.transaction(() => replica.audit(null, 'unsafe', 'stale_write', 'old-process')), { code: 'identity_runtime_stale' });
  assert.equal((await fetch(`http://127.0.0.1:${server.address().port}/health/ready`)).status, 503);
  assert.throws(() => new IdentityRegistry(f.options), { code: 'identity_cipher_invalid' });
  const reopened = new IdentityRegistry({ ...f.options, encryptionKey: newKey });
  f.cleanup(() => reopened.close());
  assert.equal(reopened.epoch, 2);
  assert.throws(() => reopened.authenticateCompany(oldClient.client_id, oldClient.client_secret), { code: 'identity_service_unauthorized' });
  assert.ok(reopened.authenticateCompany(bindings[0].clientId, bindings[0].clientSecret));
  assert.equal(reopened.db.prepare("SELECT value FROM registry_meta WHERE key = 'oidc_jwks'").get(), undefined);
  const stale = backup(f);
  f.registry.db.prepare('UPDATE registry_identities SET name = ? WHERE id = ?').run('Changed while preparing rotation', f.person.identity.id);
  assert.throws(() => rotateRegistryKeys(f.registry, { envelope: stale.envelope, backupKey: f.backupKey, newKey: crypto.randomBytes(32), actor: 'operator', reference: 'stale checkpoint', prepareBindings: () => assert.fail('No key output on stale data') }), { code: 'identity_rotation_checkpoint_stale' });
});

test('maintenance CLI writes private verified outputs and never recreates or overrides an existing source', async t => {
  const f = await fixture(t), backupFile = path.join(f.root, 'backup.json');
  const env = { CONTRACTOR_IDENTITY_MODE: 'local', CONTRACTOR_IDENTITY_DB_FILE: f.options.dbFile, CONTRACTOR_IDENTITY_ISSUER: 'http://127.0.0.1:3010',
    CONTRACTOR_IDENTITY_ENCRYPTION_KEY: f.options.encryptionKey.toString('base64'), CONTRACTOR_IDENTITY_BACKUP_KEY: f.backupKey.toString('base64') };
  env.CONTRACTOR_IDENTITY_ISSUER = f.options.issuer;
  const result = await main(['backup', '--output', backupFile, '--actor', 'operator', '--reference', 'backup drill'], env);
  assert.equal(result.valid, true);
  assert.equal((await main(['verify', '--backup-file', backupFile], env)).registryId, f.registry.id);
  await assert.rejects(main(['backup', '--output', backupFile, '--actor', 'operator', '--reference', 'do not overwrite'], env), { code: 'EEXIST' });
  const absent = path.join(f.root, 'absent.sqlite');
  await assert.rejects(main(['backup', '--output', path.join(f.root, 'bad.json'), '--actor', 'operator', '--reference', 'missing source'], { ...env, CONTRACTOR_IDENTITY_DB_FILE: absent }), { code: 'identity_database_missing' });
  assert.equal(fs.existsSync(absent), false);
  const recoveryFile = path.join(f.root, 'recovery.json');
  const issued = await main(['recover-person', '--person-id', f.person.identity.id, '--login-name', input.loginName,
    '--output', recoveryFile, '--actor', 'operator', '--reference', 'identity reviewed', '--delivery-reference', 'verified contact', '--confirm', 'AUTHORIZE_PERSON_RECOVERY'], env);
  const code = JSON.parse(fs.readFileSync(recoveryFile, 'utf8'));
  assert.equal(issued.requestId, code.id);
  assert.ok(!JSON.stringify(issued).includes(code.recoveryCode));
  assert.throws(() => registryOptions({ ...env, CONTRACTOR_IDENTITY_DATABASE_URL: 'postgres://localhost/unknown' }), { code: 'identity_local_database_required' });
});

test('the actual maintenance process backs up, rotates, diagnoses and restores with no credentials in terminal output', async t => {
  const f = await fixture(t), script = path.resolve(__dirname, '../scripts/identity-maintenance.js');
  const nextKey = crypto.randomBytes(32).toString('base64');
  const environment = { ...process.env, CONTRACTOR_IDENTITY_MODE: 'local', CONTRACTOR_IDENTITY_DB_FILE: f.options.dbFile,
    CONTRACTOR_IDENTITY_DATABASE_URL: '', CONTRACTOR_IDENTITY_ISSUER: f.options.issuer,
    CONTRACTOR_IDENTITY_ENCRYPTION_KEY: f.options.encryptionKey.toString('base64'), CONTRACTOR_IDENTITY_BACKUP_KEY: f.backupKey.toString('base64'),
    CONTRACTOR_IDENTITY_NEW_ENCRYPTION_KEY: nextKey };
  function run(args, env = environment, expected = 0) {
    const result = spawnSync(process.execPath, [script, ...args], { env, encoding: 'utf8', timeout: 20000, windowsHide: true });
    assert.equal(result.status, expected, result.stderr);
    for (const secret of [env.CONTRACTOR_IDENTITY_ENCRYPTION_KEY, env.CONTRACTOR_IDENTITY_BACKUP_KEY, nextKey]) {
      assert.ok(!`${result.stdout}${result.stderr}`.includes(secret), 'Maintenance output must not contain keys.');
    }
    return result.status === 0 ? JSON.parse(result.stdout) : null;
  }
  const initial = run(['status']);
  assert.equal(initial.registryId, f.registry.id);
  const file = path.join(f.root, 'cli-backup.json'), bindings = path.join(f.root, 'cli-rotated-bindings.json');
  run(['backup', '--output', file, '--actor', 'fixture-operator', '--reference', 'Command drill']);
  const rotation = run(['rotate-keys', '--backup-file', file, '--expected-registry-id', initial.registryId, '--bindings-output', bindings,
    '--actor', 'fixture-operator', '--reference', 'Command rotation drill', '--confirm', 'ROTATE_REGISTRY_KEYS_AND_SESSIONS']);
  assert.equal(rotation.epoch, initial.epoch + 1);
  run(['status'], environment, 1);
  const rotatedEnv = { ...environment, CONTRACTOR_IDENTITY_ENCRYPTION_KEY: nextKey };
  assert.equal(run(['status'], rotatedEnv).epoch, rotation.epoch);
  const currentBackup = path.join(f.root, 'cli-current-backup.json');
  run(['backup', '--output', currentBackup, '--actor', 'fixture-operator', '--reference', 'Current command checkpoint'], rotatedEnv);
  const targetEnv = { ...rotatedEnv, CONTRACTOR_IDENTITY_DB_FILE: path.join(f.root, 'cli-restored.sqlite'), CONTRACTOR_IDENTITY_ENCRYPTION_KEY: crypto.randomBytes(32).toString('base64') };
  const receipt = run(['restore', '--backup-file', currentBackup, '--expected-registry-id', initial.registryId,
    '--bindings-output', path.join(f.root, 'cli-restored-bindings.json'), '--actor', 'fixture-operator', '--reference', 'Command restore drill',
    '--confirm', 'RESTORE_REGISTRY_WITHOUT_ACCESS'], targetEnv);
  assert.equal(receipt.credentialsRestored, false);
  assert.equal(receipt.admissionRestored, false);
  assert.equal(run(['status'], targetEnv).ready, true);
  const person = run(['find-person', '--login-name', input.loginName, '--actor', 'fixture-operator', '--reference', 'Exact identity lookup'], targetEnv);
  assert.equal(person.personId, f.person.identity.id);
  assert.equal(person.status, 'recovery_required');
});

test('failed private output preparation rolls back recovery issuance and leaves an incomplete restore unready', async t => {
  const f = await fixture(t), { envelope } = backup(f);
  const before = f.registry.verifyAudit();
  const filename = path.join(f.root, 'occupied-private-file'); fs.writeFileSync(filename, 'do not overwrite');
  const env = { CONTRACTOR_IDENTITY_MODE: 'local', CONTRACTOR_IDENTITY_DB_FILE: f.options.dbFile, CONTRACTOR_IDENTITY_ISSUER: f.options.issuer,
    CONTRACTOR_IDENTITY_ENCRYPTION_KEY: f.options.encryptionKey.toString('base64'), CONTRACTOR_IDENTITY_BACKUP_KEY: f.backupKey.toString('base64') };
  await assert.rejects(main(['recover-person', '--person-id', f.person.identity.id, '--login-name', input.loginName, '--output', filename,
    '--actor', 'operator', '--reference', 'Verified fixture', '--delivery-reference', 'Private fixture', '--confirm', 'AUTHORIZE_PERSON_RECOVERY'], env), { code: 'EEXIST' });
  assert.deepEqual(f.registry.verifyAudit(), before);
  assert.equal(f.registry.db.prepare('SELECT COUNT(*) AS n FROM registry_assisted_recovery').get().n, 0);
  const target = { ...f.options, dbFile: path.join(f.root, 'interrupted.sqlite'), encryptionKey: crypto.randomBytes(32) };
  assert.throws(() => restoreRegistryBackup({ envelope, backupKey: f.backupKey, target, expectedRegistryId: f.registry.id,
    actor: 'operator', reference: 'Private output failure', prepareBindings: () => { throw new Error('Simulated storage failure'); } }), /Simulated storage failure/);
  const incomplete = new IdentityRegistry(target); f.cleanup(() => incomplete.close());
  assert.equal(incomplete.assertCurrent().ready, false);
  assert.throws(() => incomplete.assertCurrent({ forServing: true }), { code: 'identity_runtime_stale' });
  assert.equal(incomplete.db.prepare('SELECT COUNT(*) AS n FROM registry_identities').get().n, 0);
  assert.deepEqual(f.registry.verifyAudit(), before);
  assert.equal(fs.readFileSync(filename, 'utf8'), 'do not overwrite');
});
