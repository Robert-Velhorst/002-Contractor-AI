const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { identityFixture, Agent } = require('./identity-fixture');
const { WorkBoard } = require('../work-board');


async function signIn(agent, runtime, issuer, csrf) {
  let response = await agent.request(`${runtime.origin}/api/auth/identity/start`), callback;
  for (let step = 0; step < 12; step += 1) {
    assert.ok([302, 303].includes(response.status), `sign-in step ${step}: ${response.status} ${await response.clone().text()}`);
    const url = new URL(response.headers.get('location'), response.url);
    if (url.origin === runtime.origin && url.pathname === '/') return callback;
    if (url.pathname === '/identity.html') {
      const id = url.searchParams.get('interaction');
      const info = await agent.json(`${issuer}/api/identity/interactions/${id}`);
      assert.equal(info.status, 200, JSON.stringify(info.value));
      assert.equal(info.value.eligible, true);
      const continued = await agent.json(`${issuer}/api/identity/interactions/${id}/continue`, {}, { 'X-Identity-CSRF': csrf });
      assert.equal(continued.status, 200, JSON.stringify(continued.value));
      response = await agent.request(continued.value.redirectTo);
    } else {
      if (url.origin === runtime.origin && url.pathname.endsWith('/callback')) callback = url.href;
      response = await agent.request(url.href);
    }
  }
  assert.fail('OIDC flow exceeded its bounded redirect sequence.');
}

test('real OIDC code flow binds two companies, enforces admission, revocation, recovery, role and origin boundaries', { timeout: 120000 }, async t => {
  const fixture = await identityFixture(t), { registry, issuer, runtimes: [a, b] } = fixture;
  const owner = new Agent(), person = new Agent();
  const ownerHeaders = runtime => ({ 'X-Contractor-AI-Token': runtime.ownerKey });
  const identity = await person.json(`${issuer}/api/identity/session`), csrf = identity.value.csrf;
  const account = { loginName: 'person-one', name: 'Shared person', password: 'a strong personal password', privacyAccepted: true };
  const registered = await person.json(`${issuer}/api/identity/register`, account, { 'X-Identity-CSRF': csrf });
  assert.equal(registered.status, 201, JSON.stringify(registered.value));
  const logged = await person.json(`${issuer}/api/identity/login`, account, { 'X-Identity-CSRF': csrf });
  assert.equal(logged.status, 200);
  assert.equal((await person.json(`${issuer}/api/identity/register`, { ...account, loginName: 'csrf-bypass' })).status, 403);
  const members = [];
  for (const runtime of [a, b]) {
    const invited = await owner.json(`${runtime.origin}/api/operations/identity/invitations`, { role: 'field_worker', workerId: runtime.worker.id, reference: 'Reviewed worker invitation' }, ownerHeaders(runtime));
    assert.equal(invited.status, 201, JSON.stringify(invited.value));
    const token = new URL(invited.value.invitationUrl).hash.split('=')[1];
    const claimed = await person.json(`${issuer}/api/identity/invitations/claim`, { token }, { 'X-Identity-CSRF': csrf });
    assert.equal(claimed.status, 201, JSON.stringify(claimed.value));
    assert.equal(registry.activeMembership(runtime.company.id, logged.value.identity.id), null);
    const admitted = await owner.json(`${runtime.origin}/api/operations/identity/memberships/${claimed.value.id}/decision`, { status: 'active', expectedVersion: claimed.value.version, reference: 'Identity and worker record checked' }, ownerHeaders(runtime));
    assert.equal(admitted.status, 200, JSON.stringify(admitted.value));
    members.push(admitted.value.membership);
    const callback = await signIn(person, runtime, issuer, csrf);
    assert.equal((await person.request(callback)).status, 401, 'a consumed OIDC callback cannot be replayed');
    const session = await person.json(`${runtime.origin}/api/session`);
    assert.equal(session.value.authentication.method, 'identity', JSON.stringify(session.value));
    assert.equal(session.value.operator.role, 'field_worker');
    assert.equal(session.value.operator.worker.id, runtime.worker.id);
    assert.equal((await person.json(`${runtime.origin}/api/operations/identity`)).status, 403);
    assert.equal((await person.json(`${runtime.origin}/api/work-board/me`)).value.account.authSource, 'identity');
    assert.equal((await person.json(`${runtime.origin}/api/work-board/positions`)).status, 200);
    const unavailableStart = new Date(Date.now() + 90 * 86_400_000).toISOString();
    const unavailableEnd = new Date(Date.parse(unavailableStart) + 4 * 3_600_000).toISOString();
    const affectedJob = await owner.json(`${runtime.origin}/api/ledger/intake`, {
      title: `Availability report ${runtime.company.id}`, client: { name: 'Identity API client' }, assignAutomatically: false
    }, ownerHeaders(runtime));
    assert.equal(affectedJob.status, 201, JSON.stringify(affectedJob.value));
    const assignment = await owner.json(`${runtime.origin}/api/ledger/jobs/${affectedJob.value.job.id}/assignments`, {
      workerId: runtime.worker.id, role: 'Timmerman', status: 'planned', scheduledStart: unavailableStart,
      scheduledEnd: unavailableEnd
    }, ownerHeaders(runtime));
    assert.equal(assignment.status, 201, JSON.stringify(assignment.value));
    const availability = await person.json(`${runtime.origin}/api/work-board/availability`, {
      workerId: 'another-company-worker', startsAt: unavailableStart, endsAt: unavailableEnd
    });
    assert.equal(availability.status, 200, JSON.stringify(availability.value));
    assert.equal(availability.value.period.workerId, runtime.worker.id, 'identity access can only report for its reviewed company worker');
    assert.equal(availability.value.period.periodType, 'unavailable');
    assert.equal(availability.value.conflicts.length, 1);
    assert.equal(availability.value.conflicts[0].jobTitle, affectedJob.value.job.title);
    const availabilityReplay = await person.json(`${runtime.origin}/api/work-board/availability`, {
      workerId: 'another-company-worker', startsAt: unavailableStart, endsAt: unavailableEnd, entryKey: 'offline-retry-1'
    });
    assert.equal(availabilityReplay.status, 200, JSON.stringify(availabilityReplay.value));
    assert.equal(availabilityReplay.value.replayed, true, 'offline retry after an ambiguous response must return the same report');
    assert.equal(availabilityReplay.value.period.id, availability.value.period.id);
    assert.equal((await person.json(`${runtime.origin}/api/preferences`, { locale: 'nl-NL' }, { Origin: 'https://untrusted.example' })).status, 403);
  }
  const revoked = await owner.json(`${a.origin}/api/operations/identity/memberships/${members[0].id}/decision`, { status: 'revoked', expectedVersion: members[0].version, reference: 'Company A access ended' }, ownerHeaders(a));
  assert.equal(revoked.status, 200);
  assert.equal((await person.json(`${a.origin}/api/work-board/me`)).status, 401);
  assert.equal((await person.json(`${b.origin}/api/work-board/me`)).status, 200);
  await fixture.restartIdentity();
  assert.equal((await person.json(`${b.origin}/api/work-board/me`)).status, 200, 'provider restart preserves verified sessions and signing keys');
  const recovered = await person.json(`${issuer}/api/identity/recover`, { loginName: account.loginName, password: 'another strong password for recovery', recoveryCode: registered.value.recoveryCodes[0] }, { 'X-Identity-CSRF': csrf });
  assert.equal(recovered.status, 200);
  assert.equal((await person.json(`${b.origin}/api/work-board/me`)).status, 401);
  assert.equal(registry.activeMembership(b.company.id, logged.value.identity.id).id, members[1].id);
  assert.equal(registry.verifyAudit().valid, true);
  await fixture.stopIdentity();
  assert.equal((await person.json(`${b.origin}/api/work-board/me`)).status, 503, 'unavailable registry cannot grant identity access');
  assert.equal((await owner.json(`${a.origin}/api/ledger/jobs`, undefined, ownerHeaders(a))).status, 200, 'bootstrap owner survives registry outage');
});

test('explicit legacy worker conversion preserves applications and disables password and retained bearer sessions', { timeout: 20000 }, async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'identity-worker-link-'));
  const ledger = new ContractorOperatingLedger({ companyId: 'alpha', dbFile: path.join(root, 'ledger.sqlite') });
  t.after(() => { ledger.close(); fs.rmSync(root, { recursive: true, force: true }); });
  const board = new WorkBoard(ledger), input = { name: 'Worker', email: 'worker@test.invalid', password: 'strong worker password', phone: '0600000000', region: 'Test', skills: ['timmerman'], privacyAccepted: true };
  const account = await board.register(input), admitted = board.admit(account.id, { reference: 'Legacy admission' }, 'owner');
  const login = await board.login(input), member = { id: crypto.randomUUID(), identity: { id: crypto.randomUUID() }, status: 'active', role: 'field_worker', workerId: admitted.workerId, reference: 'Reviewed conversion' };
  assert.throws(() => board.bindIdentityMember(member, {}, 'owner'), { statusCode: 409 });
  const linked = board.bindIdentityMember(member, { legacyAccountId: account.id, retireLegacyLogin: true }, 'owner');
  assert.equal(linked.id, account.id);
  assert.equal(linked.email, null);
  assert.equal(linked.authSource, 'identity');
  assert.throws(() => board.authenticate(login.token), { statusCode: 401 });
  await assert.rejects(board.login(input), { statusCode: 401 });
  assert.equal(board.identityAccount({ authenticated: true, source: 'identity', role: 'field_worker', membershipId: member.id, personId: member.identity.id, scope: { workerId: member.workerId } }).id, account.id);
});
