const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'standby-callout-api-'));
process.env.LEDGER_DB_FILE = path.join(dir, 'ledger.sqlite');
process.env.STATE_FILE = path.join(dir, 'state.json');
process.env.UPLOAD_DIR = path.join(dir, 'uploads');
process.env.CONTRACTOR_AI_REQUIRE_AUTH = 'true';
const owner = 'standby-callout-owner-long-token-at-least-32-characters';
const approver = 'standby-callout-approver-long-token-at-least-32-characters';
process.env.CONTRACTOR_AI_ROLE_TOKENS = JSON.stringify({ owner, approver });
const app = require('../server');

test('standby call-out needs the named worker response and separate approval before replacing coverage', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await app.locals.runtimeControl.shutdown({ server, signal: 'standby_callout_test' }); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`, suffix = Date.now();
  const call = (route, token, body) => fetch(base + route, { method: body ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const createAdmitted = async label => {
    const profile = { name: `${label} ${suffix}`, email: `${label.toLowerCase()}-${suffix}@example.test`, phone: '0612345678', region: 'Arnhem', skills: ['Carpenter'], password: 'A really long passphrase 123', privacyAccepted: true };
    const created = await call('/api/work-board/register', null, profile);
    assert.equal(created.status, 200);
    const loggedIn = await call('/api/work-board/login', null, profile);
    const { token } = await loggedIn.json();
    const account = await created.json();
    const admitted = await call(`/api/ledger/work-board/accounts/${account.account.id}/admit`, owner, { reference: 'Identity and contact checked for integration test' });
    assert.equal(admitted.status, 200);
    return { token, account: (await admitted.json()).account };
  };
  const original = await createAdmitted('Original');
  const originalTwo = await createAdmitted('OriginalTwo');
  const standbyWorker = await createAdmitted('Standby');
  const startsAt = new Date(Date.now() + 35 * 86_400_000), endsAt = new Date(startsAt.getTime() + 6 * 3_600_000);
  const jobResponse = await call('/api/ledger/intake', owner, { title: `Standby call-out ${suffix}`, city: 'Arnhem', client: { name: 'Private client' }, status: 'scheduled', scheduledStart: startsAt.toISOString(), scheduledEnd: endsAt.toISOString(), assignAutomatically: false });
  const job = (await jobResponse.json()).job;
  const assignmentResponse = await call(`/api/ledger/jobs/${job.id}/assignments`, owner, { workerId: original.account.workerId, role: 'Carpenter', status: 'planned', scheduledStart: startsAt.toISOString(), scheduledEnd: endsAt.toISOString() });
  const assignment = (await assignmentResponse.json()).assignment;
  const secondJobResponse = await call('/api/ledger/intake', owner, { title: `Overlapping standby call-out ${suffix}`, city: 'Arnhem', client: { name: 'Another private client' }, status: 'scheduled', scheduledStart: new Date(startsAt.getTime() + 60 * 60_000).toISOString(), scheduledEnd: new Date(endsAt.getTime() + 60 * 60_000).toISOString(), assignAutomatically: false });
  const secondJob = (await secondJobResponse.json()).job;
  const secondAssignmentResponse = await call(`/api/ledger/jobs/${secondJob.id}/assignments`, owner, { workerId: originalTwo.account.workerId, role: 'Carpenter', status: 'planned', scheduledStart: new Date(startsAt.getTime() + 60 * 60_000).toISOString(), scheduledEnd: new Date(endsAt.getTime() + 60 * 60_000).toISOString() });
  const secondAssignment = (await secondAssignmentResponse.json()).assignment;
  const unavailableResponse = await call('/api/work-board/availability', original.token, { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
  assert.equal(unavailableResponse.status, 200);
  const unavailable = (await unavailableResponse.json()).period;
  const secondUnavailableResponse = await call('/api/work-board/availability', originalTwo.token, { startsAt: new Date(startsAt.getTime() + 60 * 60_000).toISOString(), endsAt: new Date(endsAt.getTime() + 60 * 60_000).toISOString() });
  assert.equal(secondUnavailableResponse.status, 200);
  const secondUnavailable = (await secondUnavailableResponse.json()).period;
  const standbyResponse = await call('/api/work-board/availability', standbyWorker.token, { mode: 'standby', startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString(), minimumNoticeHours: 24 });
  assert.equal(standbyResponse.status, 200);
  const standby = (await standbyResponse.json()).period;
  assert.equal(standby.minimumNoticeHours, 24);
  const office = await call(`/api/ledger/jobs/${job.id}/work-board`, owner);
  const opportunity = (await office.json()).replacementOpportunities.find(item => item.assignmentId === assignment.id);
  assert.ok(opportunity.candidates.some(item => item.id === standbyWorker.account.workerId));
  const offerResponse = await call(`/api/ledger/jobs/${job.id}/assignments/${assignment.id}/standby-callouts`, owner, {
    workerId: standbyWorker.account.workerId, standbyPeriodId: standby.id, availabilityPeriodId: unavailable.id,
    reason: 'Help requested for this exact planned shift after a capacity change.', expiresAt: new Date(startsAt.getTime() - 60_000).toISOString()
  });
  assert.equal(offerResponse.status, 200);
  const callout = (await offerResponse.json()).callout;
  const standbyInbox = await (await call('/api/work-board/notifications', standbyWorker.token)).json();
  assert.equal(standbyInbox.unreadCount, 1);
  assert.equal(standbyInbox.notifications[0].type, 'standby_callout');
  assert.equal(JSON.stringify(standbyInbox).includes('private health'), false);
  const overlappingOfferResponse = await call(`/api/ledger/jobs/${secondJob.id}/assignments/${secondAssignment.id}/standby-callouts`, owner, {
    workerId: standbyWorker.account.workerId, standbyPeriodId: standby.id, availabilityPeriodId: secondUnavailable.id,
    reason: 'A second overlapping shift needs cover.', expiresAt: new Date(startsAt.getTime() - 60_000).toISOString()
  });
  assert.equal(overlappingOfferResponse.status, 200);
  const overlappingCallout = (await overlappingOfferResponse.json()).callout;
  const endStandby = await call(`/api/work-board/availability/${standby.id}/request-cancellation`, standbyWorker.token, {});
  assert.equal(endStandby.status, 409, 'standby cannot end while an offer still needs a response');
  assert.match((await endStandby.json()).error.message, /open afroep/);
  assert.ok((await (await call('/api/work-board/me', standbyWorker.token)).json()).standbyCallouts.some(item => item.id === callout.id));
  assert.equal((await call(`/api/work-board/standby-callouts/${callout.id}/respond`, original.token, { decision: 'accept' })).status, 404);
  assert.equal((await call(`/api/ledger/work-board/standby-callouts/${callout.id}/request-replacement`, owner, {})).status, 409);
  assert.equal((await call(`/api/work-board/standby-callouts/${callout.id}/respond`, standbyWorker.token, { decision: 'accept' })).status, 200);
  const overlappingAcceptance = await call(`/api/work-board/standby-callouts/${overlappingCallout.id}/respond`, standbyWorker.token, { decision: 'accept' });
  assert.equal(overlappingAcceptance.status, 409, 'an accepted call-out reserves the worker against overlapping call-outs');
  assert.match((await overlappingAcceptance.json()).error.message, /overlappende periode/);
  const declineOverlap = await call(`/api/work-board/standby-callouts/${overlappingCallout.id}/respond`, standbyWorker.token, { decision: 'decline' });
  assert.equal(declineOverlap.status, 200, 'declining an offer stays available when accepting it would double-book the worker');
  assert.equal((await declineOverlap.json()).callout.status, 'declined');
  const proposal = await call(`/api/ledger/work-board/standby-callouts/${callout.id}/request-replacement`, owner, {});
  assert.equal(proposal.status, 200);
  const proposalData = await proposal.json();
  assert.equal((await call(`/api/ledger/approvals/${proposalData.approval.id}/resolve`, owner, { status: 'approved' })).status, 409, 'requester cannot approve their own replacement');
  const decision = await call(`/api/ledger/approvals/${proposalData.approval.id}/resolve`, approver, { status: 'approved', reason: 'Independent reviewer confirmed consent, schedule and replacement coverage.' });
  assert.equal(decision.status, 200);
  const final = await call(`/api/ledger/jobs/${job.id}`, owner);
  const assignments = (await final.json()).job.assignments;
  assert.equal(assignments.find(item => item.id === assignment.id).status, 'released');
  assert.equal(assignments.find(item => item.id === proposalData.assignment.id).status, 'planned');
  assert.equal((await (await call('/api/work-board/me', standbyWorker.token)).json()).standbyCallouts.find(item => item.id === callout.id).status, 'placed');

  const nextStartsAt = new Date(startsAt.getTime() + 10 * 86_400_000), nextEndsAt = new Date(nextStartsAt.getTime() + 6 * 3_600_000);
  const recoveryJobResponse = await call('/api/ledger/intake', owner, { title: `Next standby window ${suffix}`, city: 'Arnhem', client: { name: 'Private client' }, status: 'scheduled', scheduledStart: nextStartsAt.toISOString(), scheduledEnd: nextEndsAt.toISOString(), assignAutomatically: false });
  const recoveryJob = (await recoveryJobResponse.json()).job;
  const recoveryAssignmentResponse = await call(`/api/ledger/jobs/${recoveryJob.id}/assignments`, owner, { workerId: original.account.workerId, role: 'Carpenter', status: 'planned', scheduledStart: nextStartsAt.toISOString(), scheduledEnd: nextEndsAt.toISOString() });
  const recoveryAssignment = (await recoveryAssignmentResponse.json()).assignment;
  const recoveryAbsence = await call('/api/work-board/availability', original.token, { startsAt: nextStartsAt.toISOString(), endsAt: nextEndsAt.toISOString() });
  assert.equal(recoveryAbsence.status, 200);
  const recoveryStandby = await call('/api/work-board/availability', standbyWorker.token, { mode: 'standby', startsAt: nextStartsAt.toISOString(), endsAt: nextEndsAt.toISOString() });
  assert.equal(recoveryStandby.status, 200);
  const recoveryStandbyPeriod = (await recoveryStandby.json()).period;
  const recoveryOfferResponse = await call(`/api/ledger/jobs/${recoveryJob.id}/assignments/${recoveryAssignment.id}/standby-callouts`, owner, {
    workerId: standbyWorker.account.workerId, standbyPeriodId: recoveryStandbyPeriod.id,
    availabilityPeriodId: (await recoveryAbsence.json()).period.id,
    reason: 'Sensitive availability reason must stay private.', expiresAt: new Date(nextStartsAt.getTime() - 60_000).toISOString()
  });
  assert.equal(recoveryOfferResponse.status, 200);
  const recoveryCallout = (await recoveryOfferResponse.json()).callout;
  const changedAvailability = await call('/api/work-board/availability', standbyWorker.token, { startsAt: nextStartsAt.toISOString(), endsAt: nextEndsAt.toISOString() });
  assert.equal(changedAvailability.status, 200);
  const changedAvailabilityData = await changedAvailability.json();
  assert.equal(changedAvailabilityData.invalidatedCallouts.length, 1);
  assert.equal(changedAvailabilityData.invalidatedCallouts[0].calloutId, recoveryCallout.id);
  assert.equal((await (await call('/api/work-board/me', standbyWorker.token)).json()).standbyCallouts.find(item => item.id === recoveryCallout.id).status, 'revoked');
  const updatedInbox = await (await call('/api/work-board/notifications', standbyWorker.token)).json();
  const revokedNotice = updatedInbox.notifications.find(item => item.sourceId === recoveryCallout.id && item.title === 'Standby-oproep ingetrokken');
  assert.ok(revokedNotice);
  assert.match(revokedNotice.body, /beschikbaarheid is gewijzigd/);
  assert.equal(JSON.stringify(revokedNotice).includes('Sensitive availability reason'), false);
});
