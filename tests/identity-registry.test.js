const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { IdentityRegistry } = require('../identity-registry');
const { registryAdapter } = require('../identity-oidc-adapter');

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-registry-'));
  const options = { dbFile: path.join(root, 'identity.sqlite'), issuer: 'https://identity.example.test', encryptionKey: crypto.randomBytes(32) };
  const registry = new IdentityRegistry(options);
  t.after(() => { registry.close(); fs.rmSync(root, { force: true, recursive: true }); });
  return { registry, options, root };
}
const person = (name = 'one') => ({ loginName: `person-${name}`, name: `Person ${name}`, email: 'shared@example.test', password: 'correct horse battery staple', privacyAccepted: true });
function company(registry, id) {
  return registry.configureCompany({ id, ledgerId: crypto.randomUUID(), name: id, origin: `https://${id}.example.test`, clientId: id, clientSecret: `secret-for-${id}-${'z'.repeat(32)}` });
}
function invite(registry, companyId, role = 'field_worker', workerId = 'worker-one') {
  const result = registry.createInvitation(companyId, { role, workerId, reference: 'Reviewed invitation', confirmation: 'INVITE_COMPANY_OWNER' }, 'owner:configured');
  return new URL(result.invitationUrl).hash.split('=')[1];
}
const decide = (registry, member, status = 'active') => registry.decideMembership(member.companyId, member.id, {
  status, expectedVersion: member.version, reference: 'Identity and worker documents reviewed', confirmation: 'ADMIT_COMPANY_OWNER'
}, 'owner:reviewer');

test('registry identities are not merged by email; invitations require separate admission in each company', async t => {
  const { registry } = fixture(t);
  const a = company(registry, 'alpha'), b = company(registry, 'bravo');
  const first = await registry.register(person()), second = await registry.register(person('two'));
  assert.notEqual(first.identity.id, second.identity.id);
  assert.equal(first.identity.emailVerified, false);
  const token = invite(registry, a.id);
  let ma = registry.claimInvitation(token, first.identity.id);
  assert.equal(ma.status, 'requested');
  assert.equal(registry.activeMembership(a.id, first.identity.id), null);
  assert.throws(() => registry.claimInvitation(token, second.identity.id), { code: 'identity_invitation_unavailable' });
  assert.throws(() => registry.membership(b.id, ma.id), { code: 'identity_membership_missing' });
  assert.throws(() => registry.decideMembership(a.id, ma.id, { status: 'active', expectedVersion: 0, reference: 'stale' }, 'owner'), { code: 'identity_membership_stale' });
  ma = decide(registry, ma);
  const mb = decide(registry, registry.claimInvitation(invite(registry, b.id), first.identity.id));
  const duplicate = registry.claimInvitation(invite(registry, a.id), second.identity.id);
  assert.throws(() => decide(registry, duplicate), { code: 'identity_worker_already_linked' });
  const Adapter = registryAdapter(registry), tokens = new Adapter('AccessToken');
  await tokens.upsert('a', { accountId: first.identity.id, clientId: a.clientId }, 3600);
  await tokens.upsert('b', { accountId: first.identity.id, clientId: b.clientId }, 3600);
  decide(registry, ma, 'revoked');
  assert.equal(await tokens.find('a'), undefined);
  assert.ok(await tokens.find('b'));
  assert.equal(registry.activeMembership(a.id, first.identity.id), null);
  assert.equal(registry.activeMembership(b.id, first.identity.id).id, mb.id);
  assert.equal(registry.verifyAudit().valid, true);
});

test('persistent sessions and single-use recovery preserve memberships and revoke all account sessions', async t => {
  const { registry, options } = fixture(t);
  const account = await registry.register(person());
  const c = company(registry, 'alpha');
  const member = decide(registry, registry.claimInvitation(invite(registry, c.id), account.identity.id));
  const login = await registry.login(person());
  const reopened = new IdentityRegistry(options);
  assert.equal(reopened.session(login.token).id, account.identity.id);
  reopened.close();
  const Adapter = registryAdapter(registry);
  await new Adapter('Session').upsert('s', { accountId: account.identity.id, uid: 's-uid' }, 500);
  const recovery = { loginName: person().loginName, recoveryCode: account.recoveryCodes[0], password: 'another secure long password' };
  await registry.recover(recovery);
  assert.equal(registry.session(login.token), null);
  assert.equal(await new Adapter('Session').find('s'), undefined);
  assert.deepEqual(registry.activeMembership(c.id, account.identity.id), member);
  await assert.rejects(registry.recover(recovery), { code: 'identity_recovery_failed' });
  await assert.rejects(registry.login(person()), { code: 'identity_login_failed' });
  assert.ok((await registry.login({ ...person(), password: recovery.password })).token);
  const audits = JSON.stringify(registry.db.prepare('SELECT * FROM registry_audit').all());
  assert.ok(!audits.includes(login.token) && !audits.includes(account.recoveryCodes[0]) && !audits.includes(person().password));
  assert.equal(registry.verifyAudit().valid, true);
});

test('registry refuses ledger databases, wrong keys/origins, invalid scopes and expired invitations', async t => {
  const { registry, options, root } = fixture(t);
  assert.throws(() => new IdentityRegistry({ ...options, encryptionKey: crypto.randomBytes(32) }), { code: 'identity_cipher_invalid' });
  assert.throws(() => new IdentityRegistry({ ...options, issuer: 'https://other.example.test' }), { code: 'identity_cipher_invalid' });
  assert.throws(() => new IdentityRegistry({ ...options, issuer: 'http://remote.example.test' }), { code: 'identity_origin_invalid' });
  for (const marker of ['jobs', 'company_runtime', 'ledger_schema_migrations', 'schema_migrations']) {
    const other = path.join(root, `${marker}.sqlite`), db = new DatabaseSync(other);
    db.exec(`CREATE TABLE ${marker} (id TEXT)`); db.close();
    assert.throws(() => new IdentityRegistry({ ...options, dbFile: other }), { code: 'identity_database_conflict' });
    const retained = new DatabaseSync(other, { readOnly: true });
    assert.equal(retained.prepare("SELECT name FROM sqlite_master WHERE name = 'registry_meta'").get(), undefined);
    retained.close();
  }
  const c = company(registry, 'alpha');
  assert.throws(() => registry.configureCompany({ ...c, clientId: 'invalid:client', clientSecret: 'z'.repeat(40) }), { code: 'identity_client_invalid' });
  assert.throws(() => invite(registry, c.id, 'field_worker', null), { code: 'identity_input_invalid' });
  assert.throws(() => invite(registry, c.id, 'owner', 'worker'), { code: 'identity_scope_invalid' });
  const token = invite(registry, c.id);
  registry.db.prepare('UPDATE registry_invitations SET expires_at = ?').run('2000-01-01T00:00:00.000Z');
  assert.throws(() => registry.inspectInvitation(token), { code: 'identity_invitation_unavailable' });
  assert.equal(registry.rateLimit('ip:one', 1), true);
  assert.equal(registry.rateLimit('ip:one', 1), false);
  assert.equal(registry.rateLimit('ip:two', 1), true);
});

test('OIDC adapter encrypts data, enforces expiry and atomic one-use grants', async t => {
  const { registry } = fixture(t);
  const Adapter = registryAdapter(registry), adapter = new Adapter('AuthorizationCode');
  await adapter.upsert('code', { uid: 'one', userCode: 'human', grantId: 'grant', accountId: 'person', secret: 'sensitive-payload' }, 60);
  assert.equal((await adapter.findByUid('one')).secret, 'sensitive-payload');
  assert.equal((await adapter.findByUserCode('human')).grantId, 'grant');
  assert.ok(!JSON.stringify(registry.db.prepare('SELECT * FROM registry_oidc_models').all()).includes('sensitive-payload'));
  await adapter.consume('code');
  await assert.rejects(adapter.consume('code'), { code: 'invalid_grant' });
  await adapter.upsert('code', { grantId: 'grant' }, 60);
  assert.ok((await adapter.find('code')).consumed);
  await adapter.revokeByGrantId('grant');
  assert.equal(await adapter.find('code'), undefined);
  await adapter.upsert('expired', {}, -1);
  assert.equal(await adapter.find('expired'), undefined);
});
