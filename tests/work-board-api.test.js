const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-board-api-'));
process.env.LEDGER_DB_FILE = path.join(dir, 'ledger.sqlite');
process.env.STATE_FILE = path.join(dir, 'state.json');
process.env.UPLOAD_DIR = path.join(dir, 'uploads');
process.env.CONTRACTOR_AI_REQUIRE_AUTH = 'true';
const owner = 'work-board-owner-long-token-at-least-32-characters';
const field = 'work-board-field-long-token-at-least-32-characters';
process.env.CONTRACTOR_AI_ROLE_TOKENS = JSON.stringify({ owner, field_worker: { token: field, workerId: 'field' } });
const app = require('../server');

test('worker registration and enrollment never inherit implicit owner or another worker access', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => { await app.locals.runtimeControl.shutdown({ server, signal: 'work_board_test' }); fs.rmSync(dir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (route, token, body, headers = {}, method = body ? 'POST' : 'GET') => fetch(base + route, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const profile = { name: 'API Worker', email: 'api-worker@example.test', phone: '0612345678', region: 'Arnhem', skills: ['Carpenter'], password: 'A really long passphrase 123', privacyAccepted: true };
  assert.equal((await call('/api/work-board/positions')).status, 401);
  assert.equal((await call('/api/work-board/positions', owner)).status, 401);
  const scopedInbox = await call('/api/work-board/notifications', field);
  assert.equal(scopedInbox.status, 200, 'a named company field-worker session can load its own offline inbox');
  assert.deepEqual((await scopedInbox.json()).notifications, []);
  assert.equal((await call('/api/work-board/notifications', owner)).status, 401);
  assert.equal((await call('/api/work-board/register', null, [])).status, 400);
  assert.equal((await call('/api/work-board/register', null, profile, { Origin: 'https://evil.example' })).status, 403);
  const registered = await call('/api/work-board/register', null, profile);
  assert.equal(registered.status, 200);
  const account = (await registered.json()).account;
  const login = await call('/api/work-board/login', null, profile);
  assert.equal(login.status, 200);
  const { token } = await login.json();
  assert.equal((await call('/api/ledger/work-board/accounts', token)).status, 401);
  assert.equal((await call('/api/ledger/work-board/accounts', field)).status, 403);
  assert.equal((await call('/api/ledger/work-board/applications/missing/confirm', field, {})).status, 403);
  assert.equal((await call('/api/ledger/work-board/applications/missing/confirm', owner, {})).status, 404);
  const own = await call('/api/work-board/me', token);
  assert.equal(own.headers.get('cache-control'), 'no-store');
  assert.equal((await own.json()).account.id, account.id);
  assert.equal((await call('/api/work-board/profile/skills', null, { skills: ['Carpenter'] })).status, 401);
  assert.equal((await call('/api/work-board/profile/skills', token, { skills: [] })).status, 400);
  assert.equal((await call('/api/work-board/profile/regions', null, { regions: ['Arnhem'] })).status, 401);
  const regionUpdate = await call('/api/work-board/profile/regions', token, { regions: ['Nijmegen', 'nijmegen'] });
  assert.equal(regionUpdate.status, 200);
  assert.deepEqual((await regionUpdate.json()).account.workRegions, ['Nijmegen']);
  const privacyRequestResponse = await call('/api/work-board/privacy/requests', token, {
    requestType: 'access', subjectId: 'another-worker', details: 'Please provide the information linked to my account.'
  });
  assert.equal(privacyRequestResponse.status, 200);
  const privacyRequest = (await privacyRequestResponse.json()).request;
  assert.equal(privacyRequest.subjectId, account.id, 'self-service privacy requests ignore a caller-supplied subject ID');
  assert.equal(privacyRequest.request.channel, 'work_board');
  assert.equal((await (await call('/api/work-board/privacy/requests', token)).json()).requests[0].id, privacyRequest.id);
  assert.equal((await call('/api/work-board/availability', token)).status, 403, 'unadmitted applicants cannot report worker availability');
  assert.equal((await call('/api/work-board/positions/unknown/pack', token)).status, 403);

  const positionJob = await call('/api/ledger/intake', owner, { title: 'Withdraw interest API', client: { name: 'Test client' }, assignAutomatically: false });
  const interestJob = (await positionJob.json()).job;
  const draftResponse = await call(`/api/ledger/jobs/${interestJob.id}/work-board`, owner, {
    intent: 'save_draft', entryKey: 'api-private-draft', title: 'Roof work draft'
  });
  assert.equal(draftResponse.status, 200);
  const draft = (await draftResponse.json()).position;
  assert.equal(draft.status, 'draft');
  const workerPositions = await call('/api/work-board/positions', token);
  assert.equal((await workerPositions.json()).positions.some(item => item.id === draft.id), false);
  assert.equal((await call(`/api/ledger/jobs/${interestJob.id}/work-board`, field, {
    intent: 'save_draft', entryKey: 'field-cannot-create-draft', title: 'Unauthorized'
  })).status, 403);
  const publishedDraftResponse = await call(`/api/ledger/jobs/${interestJob.id}/work-board`, owner, {
    entryKey: draft.entryKey, title: 'Roof work', role: 'Carpenter', city: 'Arnhem',
    startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, capacity: 1, rate: 45,
    description: 'Install roof battens.', materials: 'Provided on site.', equipment: 'Hand tools.', prerequisites: 'Read the current work pack.',
    confirmPublication: true
  });
  assert.equal(publishedDraftResponse.status, 200);
  assert.equal((await publishedDraftResponse.json()).position.id, draft.id);
  assert.equal((await (await call('/api/work-board/positions', token)).json()).positions.some(item => item.id === draft.id), true);
  const positionResponse = await call(`/api/ledger/jobs/${interestJob.id}/work-board`, owner, { entryKey: 'withdraw-interest-api', title: 'Temporary carpenter', role: 'Carpenter', city: 'Arnhem',
    startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, capacity: 1, rate: 45, description: 'Temporary work', materials: 'Provided',
    equipment: 'Hand tools', prerequisites: 'Read the work pack', confirmPublication: true });
  assert.equal(positionResponse.status, 200);
  const position = (await positionResponse.json()).position;
  const partnerResponse = await call('/api/ledger/trade-partners', owner, { name: 'API Dakbouw', partnerType: 'subcontractor' });
  assert.equal(partnerResponse.status, 201);
  const partner = (await partnerResponse.json()).partner;
  const targetedJobResponse = await call('/api/ledger/intake', owner, { title: 'Targeted API job', client: { name: 'Client' }, assignAutomatically: false });
  const targetedJob = (await targetedJobResponse.json()).job;
  const targetedPositionResponse = await call(`/api/ledger/jobs/${targetedJob.id}/work-board`, owner, {
    entryKey: 'api-targeted-position', targetTradePartnerId: partner.id, title: 'Targeted carpenter', role: 'Carpenter', city: 'Arnhem',
    startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, capacity: 1, rate: 45,
    description: 'Install roof battens.', materials: 'Provided on site.', equipment: 'Hand tools.', prerequisites: 'Read the current work pack.',
    confirmPublication: true
  });
  assert.equal(targetedPositionResponse.status, 200);
  const targetedPosition = (await targetedPositionResponse.json()).position;
  const targetedProfile = { ...profile, name: 'Targeted Applicant', email: 'targeted-applicant@example.test', company: partner.name, tradePartnerId: partner.id };
  const targetedRegistration = await call('/api/work-board/register', null, targetedProfile);
  assert.equal(targetedRegistration.status, 200);
  const targetedAccount = (await targetedRegistration.json()).account;
  assert.equal(targetedAccount.verifiedTradePartner, null, 'public registration cannot self-assign an employer identity');
  const targetedLogin = await call('/api/work-board/login', null, targetedProfile);
  const targetedToken = (await targetedLogin.json()).token;
  assert.equal((await (await call('/api/work-board/positions', targetedToken)).json()).positions.some(item => item.id === targetedPosition.id), false);
  assert.equal((await call(`/api/work-board/positions/${targetedPosition.id}/enrollment-check`, targetedToken)).status, 404);
  assert.equal((await call(`/api/work-board/positions/${targetedPosition.id}/enroll`, targetedToken, { revision: targetedPosition.revision })).status, 404);
  const linkedResponse = await call(`/api/ledger/work-board/accounts/${targetedAccount.id}/admit`, owner,
    { reference: 'Business identity independently verified', tradePartnerId: partner.id });
  assert.equal(linkedResponse.status, 200);
  const linkedAccount = (await linkedResponse.json()).account;
  assert.equal(linkedAccount.verifiedTradePartner.id, partner.id);
  assert.equal(Object.hasOwn(linkedAccount, 'tradePartnerVerificationReference'), false, 'verification evidence must not leak from the account projection');
  const linkedProfile = (await (await call('/api/work-board/me', targetedToken)).json()).account;
  assert.equal(Object.hasOwn(linkedProfile, 'tradePartnerVerificationReference'), false, 'private owner verification remains hidden from the worker profile');
  assert.equal((await (await call('/api/work-board/positions', targetedToken)).json()).positions.some(item => item.id === targetedPosition.id), true);
  const targetedEnrollmentResponse = await call(`/api/work-board/positions/${targetedPosition.id}/enroll`, targetedToken, { revision: targetedPosition.revision });
  assert.equal(targetedEnrollmentResponse.status, 200);
  const targetedEnrollment = (await targetedEnrollmentResponse.json()).application;
  assert.equal(targetedEnrollment.status, 'assigned');
  assert.equal((await call(`/api/work-board/positions/${targetedPosition.id}/pack`, targetedToken)).status, 200);
  const partnerHold = await call(`/api/ledger/trade-partners/${partner.id}`, owner, { name: partner.name, partnerType: 'subcontractor', status: 'on_hold' }, {}, 'PUT');
  assert.equal(partnerHold.status, 200);
  assert.equal((await call(`/api/work-board/positions/${targetedPosition.id}/pack`, targetedToken)).status, 403,
    'work-pack reads recheck current verified company status after placement');
  const postHoldMe = await (await call('/api/work-board/me', targetedToken)).json();
  const maskedApplication = postHoldMe.applications.find(row => row.id === targetedEnrollment.id);
  assert.equal(maskedApplication.position.reviewRequired, true, 'assigned position details are masked after company verification lapses');
  const postHoldInbox = await (await call('/api/work-board/notifications', targetedToken)).json();
  assert.match(postHoldInbox.notifications[0].body, /Neem contact op met de aannemer/);
  const privateJobResponse = await call('/api/ledger/intake', owner, {
    title: 'Private address test', address: 'Kerkstraat 12A, Arnhem',
    client: { name: 'Familie De Vries', email: 'marie@example.test', phone: '+31 6 1234 5678', address: 'Kerkstraat 12A, Arnhem' },
    assignAutomatically: false
  });
  assert.equal(privateJobResponse.status, 201);
  const privateJob = (await privateJobResponse.json()).job;
  const privacyBlockedPublication = await call(`/api/ledger/jobs/${privateJob.id}/work-board`, owner, {
    entryKey: 'privacy-blocked-api-position', title: 'Carpenter needed', role: 'Carpenter', city: 'Arnhem',
    startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, capacity: 1, rate: 45,
    description: 'Meet Familie De Vries at Kerkstraat 12A, Arnhem.', materials: 'Provided', equipment: 'Hand tools',
    prerequisites: 'Read the work pack', confirmPublication: true
  });
  assert.equal(privacyBlockedPublication.status, 400);
  const privacyError = await privacyBlockedPublication.text();
  assert.match(privacyError, /mogelijk privégegevens/);
  assert.doesNotMatch(privacyError, /Familie De Vries|Kerkstraat 12A|marie@example\.test|1234 5678/);
  assert.equal((await (await call(`/api/ledger/jobs/${privateJob.id}/work-board`, owner)).json()).positions.length, 0);
  assert.equal((await call(`/api/work-board/positions/${position.id}/enrollment-check`)).status, 401);
  const enrollmentCheckResponse = await call(`/api/work-board/positions/${position.id}/enrollment-check`, token);
  assert.equal(enrollmentCheckResponse.status, 200);
  const enrollmentCheck = (await enrollmentCheckResponse.json()).check;
  assert.equal(enrollmentCheck.canApply, true, 'pending applicant can register interest before owner admission');
  assert.match(enrollmentCheck.advisories.join(' '), /toelating afronden/);
  const interestResponse = await call(`/api/work-board/positions/${position.id}/enroll`, token, { revision: position.revision });
  assert.equal((await interestResponse.json()).application.status, 'interested');
  const applicationId = (await (await call('/api/work-board/me', token)).json()).applications[0].id;
  const forcedPlacement = await call(`/api/ledger/work-board/applications/${applicationId}/confirm`, owner, {});
  assert.equal(forcedPlacement.status, 409);
  assert.match((await forcedPlacement.json()).error.message, /de uitvoerende moet dit zelf accepteren/i);
  assert.equal((await (await call('/api/work-board/me', token)).json()).applications[0].status, 'interested',
    'office confirmation cannot turn expressed interest into a placement');
  const officeBoard = await call(`/api/ledger/jobs/${interestJob.id}/work-board`, owner);
  assert.equal(officeBoard.status, 200);
  const officeInterest = (await officeBoard.json()).applications.find(item => item.id === applicationId);
  assert.match(officeInterest.placementReview.advisories.join(' '), /toelating afronden/);
  assert.match(officeInterest.placementReview.advisories.join(' '), /projectplaats Arnhem/);
  assert.deepEqual(officeInterest.placementReview.blockers, []);
  const otherProfile = { ...profile, email: 'other-api-worker@example.test' };
  await call('/api/work-board/register', null, otherProfile);
  const otherToken = (await (await call('/api/work-board/login', null, otherProfile)).json()).token;
  assert.equal((await call(`/api/work-board/privacy/requests/${privacyRequest.id}`, otherToken)).status, 404,
    'another account cannot inspect an applicant privacy request');
  assert.equal((await call(`/api/work-board/applications/${applicationId}/withdraw`, otherToken, {})).status, 404, 'another account cannot withdraw this application');
  assert.equal((await call(`/api/work-board/applications/${applicationId}/offer/respond`, otherToken, { decision: 'accept' })).status, 404, 'another account cannot respond to a worker offer');
  assert.equal((await call('/api/ledger/work-board/applications/missing/offer', field, { expiresAt: new Date(Date.now() + 3600000).toISOString() })).status, 403, 'field workers cannot issue position offers');
  assert.equal((await call('/api/ledger/work-board/applications/missing/offer', owner, { expiresAt: new Date(Date.now() + 3600000).toISOString() })).status, 404, 'owner offer endpoint resolves application scope');
  const withdrawn = await call(`/api/work-board/applications/${applicationId}/withdraw`, token, {});
  assert.equal(withdrawn.status, 200);
  assert.equal((await withdrawn.json()).application.status, 'withdrawn');
  assert.equal((await (await call('/api/work-board/me', token)).json()).applications[0].status, 'withdrawn');

  const admitted = await call(`/api/ledger/work-board/accounts/${account.id}/admit`, owner, { reference: 'Manual contact and admission check' });
  assert.equal(admitted.status, 200);
  const admittedAccount = (await admitted.json()).account;
  assert.equal(admittedAccount.workerId, account.id, 'admission preserves the privacy request subject ID');
  assert.equal((await (await call('/api/work-board/me', token)).json()).account.status, 'admitted');
  const skillsProposalResponse = await call('/api/work-board/profile/skills', token, { skills: ['Carpenter', 'Tile setter', 'Waterproofing'] });
  assert.equal(skillsProposalResponse.status, 200);
  const skillsProposal = await skillsProposalResponse.json();
  assert.equal(skillsProposal.reviewRequired, true);
  assert.equal(skillsProposal.account.admission, undefined, 'profile update responses do not reveal internal admission evidence');
  assert.deepEqual(skillsProposal.account.skills, ['Carpenter'], 'a proposed edit does not change the admitted profile');
  assert.deepEqual(skillsProposal.account.pendingSkillsChange.skills, ['Carpenter', 'Tile setter', 'Waterproofing']);
  const ownerAccounts = await call('/api/ledger/work-board/accounts', owner);
  assert.deepEqual((await ownerAccounts.json()).accounts.find(item => item.id === account.id).pendingSkillsChange.skills,
    ['Carpenter', 'Tile setter', 'Waterproofing']);
  assert.equal((await call(`/api/ledger/work-board/accounts/${account.id}/review-skills`, field, {
    decision: 'approve', reference: 'Profile reviewed'
  })).status, 403);
  const skillsApproval = await call(`/api/ledger/work-board/accounts/${account.id}/review-skills`, owner, {
    decision: 'approve', reference: 'Discussed experience and updated declared profile'
  });
  assert.equal(skillsApproval.status, 200);
  assert.deepEqual((await skillsApproval.json()).account.skills, ['Carpenter', 'Tile setter', 'Waterproofing']);
  const taskResponse = await call(`/api/ledger/jobs/${interestJob.id}/tasks`, owner, { title: 'Install roof battens', description: 'Follow the released detail.' });
  assert.equal(taskResponse.status, 201);
  const assignedTask = (await taskResponse.json()).task;

  const fullPositionResponse = await call(`/api/ledger/jobs/${interestJob.id}/work-board`, owner, { entryKey: 'waitlist-position-api', title: 'Carpenter backup', role: 'Carpenter', city: 'Arnhem',
    startsAt: '2030-07-01T08:00:00Z', endsAt: '2030-07-01T16:00:00Z', hours: 8, capacity: 1, rate: 45, description: 'Backup work', materials: 'Provided',
    equipment: 'Hand tools', prerequisites: 'Read the work pack', requiredSkills: ['Tile setter'], confirmPublication: true });
  const fullPosition = (await fullPositionResponse.json()).position;
  assert.equal((await call(`/api/work-board/positions/${fullPosition.id}/enroll`, token, { revision: fullPosition.revision })).status, 200);
  const pack = await (await call(`/api/work-board/positions/${fullPosition.id}/pack`, token)).json();
  assert.equal(pack.pack.positionAssignment.role, 'Carpenter');
  assert.equal(pack.pack.positionAssignment.scheduledStart, '2030-07-01T08:00:00.000Z');
  assert.equal(pack.pack.positionAssignment.scheduledEnd, '2030-07-01T16:00:00.000Z');
  assert.equal(pack.pack.positionAssignment.allocationHours, 8);
  const progressPayload = { sourceHash: pack.pack.sourceHash, entryKey: 'board-task-progress-api', taskId: assignedTask.id,
    status: 'in_progress', progressPercent: 30, note: 'De eerste helft van de battens is geplaatst.' };
  const taskProgress = await call(`/api/work-board/positions/${fullPosition.id}/progress`, token, progressPayload);
  assert.equal(taskProgress.status, 200);
  assert.equal((await taskProgress.json()).record.progress.taskId, assignedTask.id);
  const assignedApplication = (await (await call('/api/work-board/me', token)).json()).applications
    .find(application => application.positionId === fullPosition.id);
  assert.equal(assignedApplication.status, 'assigned');
  const workerInboxResponse = await call('/api/work-board/notifications', token);
  assert.equal(workerInboxResponse.status, 200);
  const workerInbox = await workerInboxResponse.json();
  assert.equal(workerInbox.unreadCount, 1);
  assert.equal(workerInbox.notifications[0].type, 'position_assigned');
  assert.equal((await call(`/api/work-board/notifications/${workerInbox.notifications[0].id}/read`, otherToken, {})).status, 404);
  const readNotice = await call(`/api/work-board/notifications/${workerInbox.notifications[0].id}/read`, token, {});
  assert.ok((await readNotice.json()).notification.readAt);
  assert.equal((await (await call('/api/work-board/notifications', token)).json()).unreadCount, 0);
  const releaseRequestResponse = await call(`/api/work-board/applications/${assignedApplication.id}/release-request`, token, {
    reasonCategory: 'family_care', notes: 'This private detail must not be retained.'
  });
  assert.equal(releaseRequestResponse.status, 200, JSON.stringify(await releaseRequestResponse.clone().json()));
  const releaseRequest = (await releaseRequestResponse.json()).request;
  assert.equal(releaseRequest.status, 'pending');
  const releaseReplay = await call(`/api/work-board/applications/${assignedApplication.id}/release-request`, token, { reasonCategory: 'family_care' });
  assert.equal((await releaseReplay.json()).request.id, releaseRequest.id, 'retry returns the existing pending review');
  const approvalData = (await (await call('/api/ledger/approvals?status=pending&limit=100', owner)).json()).approvals
    .find(item => item.id === releaseRequest.id);
  assert.equal(approvalData.data.reasonCategory, 'family_care');
  assert.equal(JSON.stringify(approvalData.data).includes('private detail'), false, 'free-text health or family details are not retained');
  assert.equal((await (await call(`/api/work-board/positions/${fullPosition.id}/pack`, token)).json()).pack.positionAssignment.id, assignedApplication.assignmentId,
    'the worker keeps the placement and work-pack access until office review');
  const foreignProgress = await call(`/api/work-board/positions/${fullPosition.id}/progress`, otherToken, { ...progressPayload, entryKey: 'foreign-board-task-progress' });
  assert.equal(foreignProgress.status, 403);
  const pendingWaitlist = await call(`/api/work-board/positions/${fullPosition.id}/enroll`, otherToken, { revision: fullPosition.revision });
  assert.equal(pendingWaitlist.status, 200);
  assert.equal((await pendingWaitlist.json()).application.status, 'waitlisted');
  const ownWaitlist = (await (await call('/api/work-board/me', otherToken)).json()).applications
    .find(application => application.positionId === fullPosition.id);
  assert.equal(ownWaitlist.waitlistPosition, 1);
  assert.equal((await call(`/api/work-board/applications/${ownWaitlist.id}/withdraw`, otherToken, {})).status, 200);
  const releaseDecision = await call(`/api/ledger/approvals/${releaseRequest.id}/resolve`, owner, { status: 'approved', reason: 'Coverage and handover reviewed.' });
  assert.equal(releaseDecision.status, 200, JSON.stringify(await releaseDecision.clone().json()));
  const afterReleaseApplication = (await (await call('/api/work-board/me', token)).json()).applications
    .find(application => application.id === assignedApplication.id);
  assert.equal(afterReleaseApplication.status, 'released');
  assert.equal(afterReleaseApplication.assignmentStatus, 'released');
  assert.equal((await call(`/api/work-board/positions/${fullPosition.id}/pack`, token)).status, 403,
    'released workers can no longer open the active work pack');

  const startsAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 8 * 3_600_000).toISOString();
  const jobResponse = await call('/api/ledger/intake', owner, { title: 'Worker availability impact', city: 'Arnhem', client: { name: 'Test client' }, status: 'scheduled', scheduledStart: startsAt, scheduledEnd: endsAt, assignAutomatically: false });
  const job = (await jobResponse.json()).job;
  const assignmentResponse = await call(`/api/ledger/jobs/${job.id}/assignments`, owner, { workerId: admittedAccount.workerId, role: 'Carpenter', status: 'planned', scheduledStart: startsAt, scheduledEnd: endsAt });
  assert.equal(assignmentResponse.status, 201, JSON.stringify(await assignmentResponse.clone().json()));
  const report = await call('/api/work-board/availability', token, { workerId: 'some-other-worker', periodType: 'leave', title: 'Private note ignored', startsAt, endsAt, medicalDetails: 'Never retained' });
  assert.equal(report.status, 200);
  const reported = (await report.json());
  assert.equal(reported.period.workerId, admittedAccount.workerId);
  assert.equal(reported.period.periodType, 'unavailable');
  assert.equal(reported.period.title, 'Niet beschikbaar');
  assert.equal(reported.period.data.operationalNotes, null);
  assert.equal(reported.conflicts.length, 1);
  assert.equal(reported.conflicts[0].jobTitle, 'Worker availability impact');
  assert.equal(Object.hasOwn(reported.conflicts[0], 'replacementCandidates'), false);
  const replay = await call('/api/work-board/availability', token, { startsAt, endsAt });
  assert.equal((await replay.json()).replayed, true);
  const otherAccounts = (await (await call('/api/ledger/work-board/accounts', owner)).json()).accounts;
  const otherAccount = otherAccounts.find(item => item.email === otherProfile.email);
  assert.ok(otherAccount);
  const admittedOther = await call(`/api/ledger/work-board/accounts/${otherAccount.id}/admit`, owner, { reference: 'Manual contact and admission check' });
  assert.equal(admittedOther.status, 200);
  assert.equal((await call(`/api/work-board/availability/${reported.period.id}/request-cancellation`, otherToken, {})).status, 404,
    'another admitted worker cannot request cancellation of this availability period');
  const cancellationRequest = await call(`/api/work-board/availability/${reported.period.id}/request-cancellation`, token, {});
  assert.equal(cancellationRequest.status, 200);
  const cancellationBody = await cancellationRequest.json();
  assert.equal(cancellationBody.period.status, 'pending_cancellation');
  assert.ok(cancellationBody.approvalId);
  const stillBlocked = await call('/api/work-board/availability', token);
  assert.equal((await stillBlocked.json()).availability.conflicts.some(item => item.periodId === reported.period.id), true);
  const cancellationReplay = await call(`/api/work-board/availability/${reported.period.id}/request-cancellation`, token, {});
  const replayedCancellation = await cancellationReplay.json();
  assert.equal(replayedCancellation.replayed, true);
  assert.equal(replayedCancellation.approvalId, cancellationBody.approvalId);
  const standbyStart = new Date(Date.now() + 45 * 86_400_000).toISOString();
  const standbyEnd = new Date(Date.parse(standbyStart) + 6 * 3_600_000).toISOString();
  const standby = await call('/api/work-board/availability', token, { mode: 'standby', startsAt: standbyStart, endsAt: standbyEnd });
  assert.equal(standby.status, 200);
  const standbyBody = await standby.json();
  assert.equal(standbyBody.period.periodType, 'standby');
  assert.equal(standbyBody.period.title, 'Beschikbaar op afroep');
  assert.equal(standbyBody.conflicts.length, 0);
  const myAvailability = await call('/api/work-board/availability', token);
  assert.equal((await myAvailability.json()).availability.periods.length, 2);
  assert.equal((await call('/api/work-board/logout', token, {})).status, 200);
  assert.equal((await call('/api/work-board/me', token)).status, 401);
});

test('disabled work board fails closed before registration or ledger access', async t => {
  const express = require('express');
  const { registerWorkBoardRoutes } = require('../work-board-routes');
  const isolated = express();
  isolated.use(express.json());
  registerWorkBoardRoutes(isolated, {
    ledger: {}, enabled: false, actor: () => 'owner', originAllowed: () => true,
    authLimit: (_req, _res, next) => next(),
    sendError: (_req, res, status) => res.status(status).json({ success: false })
  });
  const server = isolated.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(() => new Promise(resolve => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  assert.equal((await fetch(`${base}/api/work-board/positions`)).status, 503);
  assert.equal((await fetch(`${base}/api/work-board/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  })).status, 503);
});
