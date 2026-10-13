const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { IdentityRegistry } = require('../identity-registry');
const { registryAdapter } = require('../identity-oidc-adapter');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { createRegistryBackup, restoreRegistryBackup, rotateRegistryKeys } = require('../identity-recovery');

const { postgresTestDatabaseUrl } = require('./postgres-test-database');
const connectionString = postgresTestDatabaseUrl();

test('PostgreSQL registry retains identity/admission/recovery semantics without sharing ledger tables', { skip: !connectionString, timeout: 90000 }, async t => {
  const admin = new Client({ connectionString });
  await admin.connect();
  const name = `contractor_identity_test_${crypto.randomBytes(8).toString('hex')}`;
  await admin.query(`CREATE DATABASE "${name}"`);
  const url = new URL(connectionString); url.pathname = `/${name}`;
  const options = { databaseUrl: url.href, issuer: 'https://identity.example.test', encryptionKey: crypto.randomBytes(32) };
  let registry;
  t.after(async () => { registry?.close(); await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`); await admin.end(); });
  registry = new IdentityRegistry(options);
  if (admin.connection.stream.encrypted) {
    assert.equal(admin.connection.stream.authorized, true);
    t.diagnostic(`Registry contract TLS: ${admin.connection.stream.getProtocol()}, certificate authorized`);
  }
  const a = registry.configureCompany({ id: 'alpha', ledgerId: crypto.randomUUID(), name: 'Alpha', origin: 'https://alpha.example.test', clientId: 'alpha', clientSecret: crypto.randomBytes(32).toString('hex') });
  const b = registry.configureCompany({ id: 'bravo', ledgerId: crypto.randomUUID(), name: 'Bravo', origin: 'https://bravo.example.test', clientId: 'bravo', clientSecret: crypto.randomBytes(32).toString('hex') });
  const input = { loginName: 'shared-person', name: 'Shared person', email: 'same@test.invalid', password: 'strong database contract password', privacyAccepted: true };
  const first = await registry.register(input), second = await registry.register({ ...input, loginName: 'different-person' });
  assert.notEqual(first.identity.id, second.identity.id);
  const memberships = [];
  for (const company of [a, b]) {
    const invite = registry.createInvitation(company.id, { role: 'field_worker', workerId: 'same-worker-id', reference: 'Independent company review' }, 'owner:test');
    const member = registry.claimInvitation(new URL(invite.invitationUrl).hash.split('=')[1], first.identity.id);
    assert.equal(registry.activeMembership(company.id, first.identity.id), null);
    memberships.push(registry.decideMembership(company.id, member.id, { status: 'active', expectedVersion: member.version, reference: 'Admission evidence' }, 'owner:test'));
  }
  const session = await registry.login(input), registryId = registry.id;
  registry.close(); registry = new IdentityRegistry(options);
  assert.equal(registry.id, registryId);
  assert.equal(registry.session(session.token).id, first.identity.id);
  const Adapter = registryAdapter(registry), codes = new Adapter('AuthorizationCode');
  await codes.upsert('code', { grantId: 'grant', accountId: first.identity.id, clientId: a.clientId }, 60);
  await codes.consume('code');
  await assert.rejects(codes.consume('code'), { code: 'invalid_grant' });
  registry.decideMembership(a.id, memberships[0].id, { status: 'revoked', expectedVersion: memberships[0].version, reference: 'Only company A access ended' }, 'owner:test');
  assert.equal(registry.activeMembership(a.id, first.identity.id), null);
  assert.deepEqual(registry.activeMembership(b.id, first.identity.id), memberships[1]);
  await registry.recover({ loginName: input.loginName, recoveryCode: first.recoveryCodes[0], password: 'new recovered database password' });
  assert.equal(registry.session(session.token), null);
  assert.equal(await codes.find('code'), undefined);
  assert.deepEqual(registry.activeMembership(b.id, first.identity.id), memberships[1]);
  assert.throws(() => new ContractorOperatingLedger({ databaseUrl: url.href, companyId: a.id }), /cannot use the shared identity registry/);
  assert.equal(registry.verifyAudit().valid, true);
});

test('PostgreSQL registry recovery and key rotation reject stale authority and preserve the same no-access restore contract', { skip: !connectionString, timeout: 90000 }, async t => {
  const admin = new Client({ connectionString });
  await admin.connect();
  const names = [], registries = [];
  t.after(async () => {
    for (const registry of registries.reverse()) registry.close();
    for (const name of names.reverse()) await admin.query(`DROP DATABASE "${name}" WITH (FORCE)`);
    await admin.end();
  });
  const urls = [];
  for (const part of ['source', 'restore']) {
    const name = `contractor_recovery_${part}_${crypto.randomBytes(8).toString('hex')}`;
    await admin.query(`CREATE DATABASE "${name}"`); names.push(name);
    const url = new URL(connectionString); url.pathname = `/${name}`; urls.push(url.href);
  }
  const options = { databaseUrl: urls[0], issuer: 'https://identity.example.test', encryptionKey: crypto.randomBytes(32) };
  const source = new IdentityRegistry(options); registries.push(source);
  const personInput = { loginName: 'recovered-person', name: 'Recovery contract', password: 'recovery contract password', privacyAccepted: true };
  const person = await source.register(personInput);
  source.configureCompany({ id: 'alpha', ledgerId: crypto.randomUUID(), name: 'Alpha', origin: 'https://alpha.example.test', clientId: 'alpha', clientSecret: crypto.randomBytes(32).toString('hex') });
  const invitation = source.createInvitation('alpha', { role: 'office_operator', reference: 'Invitation fixture' }, 'fixture');
  const member = source.claimInvitation(new URL(invitation.invitationUrl).hash.split('=')[1], person.identity.id);
  source.decideMembership('alpha', member.id, { status: 'active', expectedVersion: member.version, reference: 'Admission fixture' }, 'fixture');
  const session = await source.login(personInput), backupKey = crypto.randomBytes(32);
  const { envelope } = createRegistryBackup(source, { backupKey, actor: 'fixture', reference: 'Verified PostgreSQL checkpoint' });
  const replica = new IdentityRegistry(options); registries.push(replica);
  const nextKey = crypto.randomBytes(32);
  rotateRegistryKeys(source, { envelope, backupKey, newKey: nextKey, actor: 'fixture', reference: 'TLS rotation drill', prepareBindings: () => 'retained-fixture-bindings' });
  assert.throws(() => replica.transaction(() => assert.fail('Stale process must not write')), { code: 'identity_runtime_stale' });
  assert.equal(source.session(session.token), null);
  const target = { ...options, databaseUrl: urls[1], encryptionKey: crypto.randomBytes(32) };
  const restored = restoreRegistryBackup({ envelope, backupKey, target, expectedRegistryId: source.id,
    actor: 'fixture', reference: 'TLS recovery drill', prepareBindings: () => 'retained-recovery-bindings' });
  const next = restored.registry; registries.push(next);
  assert.equal(next.id, source.id);
  assert.equal(next.activeMembership('alpha', person.identity.id), null);
  await assert.rejects(next.login(personInput), { code: 'identity_login_failed' });
  const issued = next.issueAssistedRecovery(person.identity.id, { expectedLoginName: personInput.loginName, reference: 'Independent identity fixture',
    deliveryReference: 'Previously verified channel fixture', confirmation: 'AUTHORIZE_PERSON_RECOVERY' }, 'fixture');
  const codeInput = { loginName: personInput.loginName, recoveryCode: issued.recoveryCode, password: 'a fresh recovered password' };
  assert.equal((await next.recover(codeInput)).recoveryCodes.length, 8);
  await assert.rejects(next.recover(codeInput), { code: 'identity_recovery_failed' });
  assert.equal(next.activeMembership('alpha', person.identity.id), null);
  const head = next.verifyAudit();
  assert.equal(head.valid, true);
  assert.throws(() => restoreRegistryBackup({ envelope, backupKey, target, expectedRegistryId: source.id, actor: 'fixture', reference: 'Existing target refused', prepareBindings: () => assert.fail('No file for an occupied target') }), { code: 'identity_restore_target_not_empty' });
  assert.deepEqual(next.verifyAudit(), head);
  if (admin.connection.stream.encrypted) {
    assert.equal(admin.connection.stream.authorized, true);
    t.diagnostic(`Registry recovery TLS: ${admin.connection.stream.getProtocol()}, certificate authorized`);
  }
});
