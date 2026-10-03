const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { WorkBoard } = require('../work-board');
const { FieldWorkPack } = require('../field-work-pack');
const { ClientConversation, hash } = require('../client-conversation');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-board-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(dir, 'ledger.sqlite') });
  t.after(() => { ledger.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  return { ledger, board: new WorkBoard(ledger) };
}
const profile = (email = 'new@example.test') => ({ name: 'New Carpenter', email, password: 'A long private password 123!', phone: '0612345678', skills: ['Carpenter'], region: 'Arnhem', privacyAccepted: true });
const terms = { entryKey: 'first-publication', title: 'Carpenter needed', role: 'Carpenter', city: 'Arnhem', startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, capacity: 1, rate: 45, description: 'Fit approved doors', materials: 'Provided on site', equipment: 'Own hand tools', prerequisites: 'Read current work pack', confirmPublication: true };

test('positions admit only eligible workers, preserve terms, and create one scoped assignment', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Private customer project', address: 'Secretstraat 12', client: { name: 'Private Client' }, assignAutomatically: false });
  const applicant = await board.register(profile());
  const position = board.publish(job.id, terms, 'owner');
  assert.equal(board.publish(job.id, terms, 'owner').id, position.id);
  assert.throws(() => board.publish(job.id, { ...terms, rate: 100 }, 'owner'), { statusCode: 409 });
  assert.equal(JSON.stringify(board.positions()).includes('Secretstraat'), false);
  assert.equal(board.enroll(applicant.id, position.id, position.revision).status, 'interested');
  board.admit(applicant.id, { reference: 'Contact and professional background checked' }, 'owner');
  assert.throws(() => board.enroll(applicant.id, position.id, 'stale'), { statusCode: 409 });
  const placed = board.enroll(applicant.id, position.id, position.revision);
  assert.equal(placed.status, 'assigned');
  assert.equal(board.enroll(applicant.id, position.id, position.revision).assignmentId, placed.assignmentId);
  const notificationInbox = board.workerNotifications(applicant.id);
  assert.equal(notificationInbox.unreadCount, 1);
  assert.equal(notificationInbox.notifications[0].type, 'position_assigned');
  assert.equal(notificationInbox.notifications[0].title, 'Je bent geplaatst');
  assert.match(notificationInbox.notifications[0].body, /Secretstraat 12, Arnhem/);
  assert.match(notificationInbox.notifications[0].body, /8 uur/);
  assert.match(notificationInbox.notifications[0].body, /startvrijgave/);
  assert.equal(notificationInbox.notifications[0].href, '/work-board.html#applications');
  const readNotification = board.markWorkerNotificationRead(applicant.id, notificationInbox.notifications[0].id);
  assert.ok(readNotification.readAt);
  assert.equal(board.workerNotifications(applicant.id).unreadCount, 0);
  assert.equal(board.markWorkerNotificationRead(applicant.id, notificationInbox.notifications[0].id).readAt, readNotification.readAt);
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 1);
  const second = await board.register(profile('second@example.test'));
  board.admit(second.id, { reference: 'Contact checked' }, 'owner');
  assert.throws(() => board.markWorkerNotificationRead(second.id, notificationInbox.notifications[0].id), { statusCode: 404 });
  assert.equal(board.enroll(second.id, position.id, position.revision).status, 'waitlisted');
  const overlapping = board.publish(job.id, { ...terms, entryKey: 'second-position' }, 'owner');
  assert.throws(() => board.enroll(applicant.id, overlapping.id, overlapping.revision), { statusCode: 409 });
  board.close(position.id, 'owner');
  assert.equal(board.positions().some(item => item.id === position.id), false);
});

test('approved client RFI creates a task-scoped worker alert without copying conversation content', t => {
  const { board, ledger } = fixture(t);
  const worker = ledger.upsertWorker({ name: 'Frame carpenter', role: 'Carpenter', status: 'available' });
  const peer = ledger.upsertWorker({ name: 'Electrical worker', role: 'Electrician', status: 'available' });
  const job = ledger.createIntake({ title: 'Frame installation', client: { name: 'Private client' }, tasks: [{ title: 'Install window frame' }], assignAutomatically: false });
  const task = ledger.getJobDetail(job.id).tasks[0];
  const peerTask = ledger.addTask(job.id, { title: 'Install electrical circuit', assigneeId: peer.id });
  const assignment = ledger.addAssignment(job.id, { workerId: worker.id, role: 'Carpenter', status: 'assigned' });
  const peerAssignment = ledger.addAssignment(job.id, { workerId: peer.id, role: 'Electrician', status: 'assigned' });
  ledger.db.prepare('UPDATE assignments SET data_json = ? WHERE id = ?')
    .run(JSON.stringify({ workBoardPositionId: 'frame-position', workBoardTaskIds: [task.id] }), assignment.id);
  ledger.db.prepare('UPDATE assignments SET data_json = ? WHERE id = ?')
    .run(JSON.stringify({ workBoardPositionId: 'electric-position', workBoardTaskIds: [peerTask.id] }), peerAssignment.id);

  const access = ledger.createClientPortalAccess(job.id);
  ledger.resolveApproval(access.approval.id, { status: 'approved' });
  const chat = new ClientConversation(ledger);
  const source = chat.create(access.id, { entryKey: 'client-to-field-message-01', body: 'Please confirm that the opening is 900 mm.' }, { direction: 'inbound' });
  const identity = hash('client-to-field-analysis');
  const quote = source.body;
  const aiSuggestion = 'Check the approved drawing before fitting.';
  chat.record('conversation_analysis', access.id, job.id, 'retain_conversation_analysis', {
    identity, sourceHash: hash(chat.analysisSources(access.id)),
    findings: [{ sourceId: source.id, quote, category: 'question', suggestion: aiSuggestion, uncertainty: 'The current opening measurement needs verification.' }]
  }, 'local_model');
  const rfi = chat.createRfiFromFinding(access.id, {
    entryKey: 'client-to-field-rfi-01', analysisIdentity: identity, sourceId: source.id, quote, category: 'question',
    title: 'Confirm opening dimension', question: 'Check the released drawing and record the opening measurement.',
    responsible: 'Project engineer', dueAt: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
    shareWithField: true, fieldTaskIds: [task.id]
  }, 'office-operator').rfi;
  const transition = ledger.transitionLifecycleRecord(job.id, 'rfi', rfi.id, {
    status: 'answered', response: 'Verified: 900 mm. Use drawing A-12 for the fitting.'
  }, { actor: 'office-operator' });
  ledger.resolveApproval(transition.approval.id, { status: 'approved', reason: 'Checked against the released drawing.' }, { actor: 'approver' });

  const noticeIds = board.notifyWorkerRfiResponse(rfi.id, transition.approval.id);
  assert.equal(noticeIds.length, 1);
  board.notifyWorkerRfiResponse(rfi.id, transition.approval.id);
  const inbox = board.workerNotificationsForWorker(worker.id);
  assert.equal(inbox.notifications.filter(item => item.type === 'field_reply').length, 1);
  assert.equal(inbox.notifications[0].title, 'Nieuwe goedgekeurde klantinformatie');
  assert.match(inbox.notifications[0].body, /Install window frame/);
  assert.doesNotMatch(inbox.notifications[0].body, /900 mm|drawing A-12|opening is 900|Check the approved drawing/);
  assert.equal(board.workerNotificationsForWorker(peer.id).notifications.length, 0);

  chat.create(access.id, { entryKey: 'client-to-field-followup-01', body: 'The opening may differ on site.' }, { direction: 'inbound' });
  const staleNotice = board.workerNotificationsForWorker(worker.id).notifications[0];
  assert.equal(staleNotice.title, 'Klantinformatie gewijzigd');
  assert.match(staleNotice.body, /niet meer actueel/);
  assert.doesNotMatch(staleNotice.body, /900 mm|drawing A-12/);
});

test('public position release blocks known client identity, contact details, and exact addresses', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Private customer work', address: 'Kerkstraat 12A, Arnhem',
    client: { name: 'Familie De Vries', email: 'marie@example.test', phone: '+31 6 1234 5678', address: 'Kerkstraat 12A, Arnhem' },
    assignAutomatically: false });
  const leakedFields = [
    { description: 'Vraag Familie De Vries naar de sleutel.' },
    { materials: 'Bestelbon naar MARIE@example.test sturen.' },
    { prerequisites: 'Bel +31 (6) 1234-5678 voor aankomst.' },
    { equipment: 'Verzamelplaats: Kerkstraat 12A, Arnhem.' }
  ];

  for (const [index, override] of leakedFields.entries()) {
    assert.throws(() => board.publish(job.id, { ...terms, ...override, entryKey: `private-position-${index}` }, 'owner'), error => {
      assert.equal(error.statusCode, 400);
      assert.match(error.message, /mogelijk privégegevens/);
      assert.doesNotMatch(error.message, /Familie De Vries|marie@example\.test|1234 5678|Kerkstraat 12A/);
      return true;
    });
  }
  assert.equal(board.positions({ jobId: job.id, office: true }).filter(position => position.status === 'open').length, 0);

  const safe = board.publish(job.id, { ...terms, entryKey: 'privacy-safe-position', city: 'Arnhem',
    description: 'Werk op locatie volgens het toegewezen werkpakket.',
    prerequisites: 'Meld je op de afgesproken tijd bij de uitvoerder.' }, 'owner');
  assert.equal(safe.status, 'open');
  assert.equal(board.positions().some(position => position.id === safe.id), true);
});

test('company-targeted positions require owner-verified subcontractor membership', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Company scoped work', client: { name: 'Client' }, assignAutomatically: false });
  const partnerA = ledger.upsertTradePartner({ name: 'Dakbouw Noord', partnerType: 'subcontractor' }, { actor: 'owner' });
  const partnerB = ledger.upsertTradePartner({ name: 'Dakbouw Zuid', partnerType: 'subcontractor' }, { actor: 'owner' });
  const supplier = ledger.upsertTradePartner({ name: 'Only Supplies', partnerType: 'supplier' }, { actor: 'owner' });
  const a = await board.register({ ...profile('a@company.test'), company: partnerA.name, tradePartnerId: partnerB.id });
  const b = await board.register({ ...profile('b@company.test'), company: partnerB.name });
  const independent = await board.register(profile('independent@company.test'));
  const tradingName = await board.register({ ...profile('trade-name@company.test'), company: 'Dakbouw Noord Services' });
  assert.equal(a.verifiedTradePartner, null, 'a registration-supplied partner ID has no authority');
  assert.throws(() => board.admit(a.id, { reference: 'Identity checked', tradePartnerId: partnerB.id }, 'owner'), { statusCode: 409 },
    'a self-declared company mismatch must be reviewed');
  assert.throws(() => board.admit(a.id, { reference: 'Identity checked', tradePartnerId: supplier.id }, 'owner'), { statusCode: 409 },
    'supplier records cannot be used as subcontractor memberships');
  board.admit(a.id, { reference: 'KVK and identity matched', tradePartnerId: partnerA.id }, 'owner');
  board.admit(b.id, { reference: 'KVK and identity matched', tradePartnerId: partnerB.id }, 'owner');
  board.admit(independent.id, { reference: 'Identity checked' }, 'owner');
  assert.throws(() => board.admit(tradingName.id, { reference: 'Checked', tradePartnerId: partnerA.id }, 'owner'), { statusCode: 409 });
  const verifiedTradingName = board.admit(tradingName.id, { reference: 'KVK and trading name independently checked',
    tradePartnerId: partnerA.id, companyMismatchReviewed: true }, 'owner');
  assert.equal(verifiedTradingName.verifiedTradePartner.id, partnerA.id);
  const retainedVerification = JSON.parse(ledger.db.prepare('SELECT data_json FROM work_board_accounts WHERE id = ?').get(tradingName.id).data_json);
  assert.equal(retainedVerification.companyNameMismatchReviewed, true);
  assert.equal(retainedVerification.tradePartnerVerificationReference, 'KVK and trading name independently checked');
  assert.equal(Object.hasOwn(verifiedTradingName, 'tradePartnerVerificationReference'), false,
    'private verification evidence is retained internally but not returned in a worker account projection');

  const forA = board.publish(job.id, { ...terms, entryKey: 'company-a', targetTradePartnerId: partnerA.id }, 'owner');
  const forB = board.publish(job.id, { ...terms, entryKey: 'company-b', targetTradePartnerId: partnerB.id }, 'owner');
  const open = board.publish(job.id, { ...terms, entryKey: 'company-open' }, 'owner');
  assert.deepEqual(board.positionsForAccount(a.id).map(item => item.id).sort(), [forA.id, open.id].sort());
  assert.deepEqual(board.positionsForAccount(b.id).map(item => item.id).sort(), [forB.id, open.id].sort());
  assert.deepEqual(board.positionsForAccount(independent.id).map(item => item.id), [open.id]);
  assert.throws(() => board.enrollmentCheck(independent.id, forA.id), { statusCode: 404 });
  assert.throws(() => board.enroll(independent.id, forA.id, forA.revision), { statusCode: 404 });
  assert.equal(board.enrollmentCheck(a.id, forA.id).canApply, true);

  board.admit(independent.id, { reference: 'Employer verified', tradePartnerId: partnerA.id }, 'owner');
  assert.equal(board.positionsForAccount(independent.id).some(item => item.id === forA.id), true,
    'an existing admitted worker can be explicitly linked by the owner');
  ledger.upsertTradePartner({ status: 'on_hold' }, { id: partnerA.id, actor: 'owner' });
  assert.equal(board.positionsForAccount(a.id).some(item => item.id === forA.id), false,
    'an inactive employer link stops granting access');
});

test('subcontractor-targeted replacements and standby callouts stay inside the verified company', async t => {
  const { board, ledger } = fixture(t);
  const startsAt = new Date(Date.now() + 4 * 86_400_000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 4 * 3600000).toISOString();
  const job = ledger.createIntake({ title: 'Targeted replacement work', status: 'scheduled', scheduledStart: startsAt,
    scheduledEnd: endsAt, assignAutomatically: false });
  const partnerA = ledger.upsertTradePartner({ name: 'Replacement North', partnerType: 'subcontractor' }, { actor: 'owner' });
  const partnerB = ledger.upsertTradePartner({ name: 'Replacement South', partnerType: 'subcontractor' }, { actor: 'owner' });
  const makeMember = async (email, partner) => {
    const account = await board.register({ ...profile(email), company: partner.name });
    return board.admit(account.id, { reference: 'Business and worker identity checked', tradePartnerId: partner.id }, 'owner');
  };
  const original = await makeMember('replacement-original@example.test', partnerA);
  const standbyA = await makeMember('replacement-standby-a@example.test', partnerA);
  const standbyB = await makeMember('replacement-standby-b@example.test', partnerB);
  const availableA = await makeMember('replacement-available-a@example.test', partnerA);
  const availableB = await makeMember('replacement-available-b@example.test', partnerB);
  const position = board.publish(job.id, { ...terms, entryKey: 'company-bound-replacement', targetTradePartnerId: partnerA.id,
    startsAt, endsAt, hours: 4 }, 'owner');
  const placed = board.enroll(original.id, position.id, position.revision);
  const assignment = ledger.db.prepare('SELECT * FROM assignments WHERE id = ?').get(placed.assignmentId);
  assert.equal(JSON.parse(assignment.data_json).requiredTradePartnerId, partnerA.id);
  const unavailable = ledger.createWorkerAvailabilityPeriod(original.workerId, { periodType: 'unavailable', startsAt, endsAt },
    { actor: `worker:${original.workerId}` });
  ledger.createWorkerAvailabilityPeriod(standbyA.workerId, { periodType: 'standby', startsAt, endsAt },
    { actor: `worker:${standbyA.workerId}` });
  ledger.createWorkerAvailabilityPeriod(standbyB.workerId, { periodType: 'standby', startsAt, endsAt },
    { actor: `worker:${standbyB.workerId}` });

  assert.deepEqual(board.standbyCalloutCandidates(job.id, assignment.id).map(candidate => candidate.id), [standbyA.workerId]);
  assert.throws(() => ledger.requestAssignmentReplacement(job.id, assignment.id, {
    workerId: availableB.workerId, availabilityPeriodId: unavailable.period.id, reason: 'Replace with another firm worker.'
  }, { actor: 'owner' }), { code: 'assignment_replacement_candidate_stale' });
  const proposal = ledger.requestAssignmentReplacement(job.id, assignment.id, {
    workerId: availableA.workerId, availabilityPeriodId: unavailable.period.id, reason: 'Replace with same firm worker.'
  }, { actor: 'owner' });
  ledger.upsertTradePartner({ status: 'on_hold' }, { id: partnerA.id, actor: 'owner' });
  assert.throws(() => ledger.resolveApproval(proposal.approval.id, {
    status: 'approved', resolvedBy: 'approver', reason: 'Recheck current subcontractor verification.'
  }), { code: 'assignment_replacement_candidate_stale' }, 'the verified company must still be active at approval time');
  assert.equal(ledger.getJobDetail(job.id).assignments.find(item => item.id === assignment.id).status, 'planned');
});

test('placed workers lose company-targeted work-pack and notice details when verification is put on hold', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Company access lifecycle', status: 'scheduled',
    scheduledStart: '2030-06-01T08:00:00Z', scheduledEnd: '2030-06-01T16:00:00Z',
    client: { name: 'Client' }, assignAutomatically: false });
  const partner = ledger.upsertTradePartner({ name: 'Verified Roofing Ltd', partnerType: 'subcontractor' }, { actor: 'owner' });
  const account = await board.register({ ...profile('company-access@example.test'), company: partner.name });
  const admitted = board.admit(account.id, { reference: 'Business and worker identity checked', tradePartnerId: partner.id }, 'owner');
  const position = board.publish(job.id, { ...terms, entryKey: 'company-access-lifecycle', targetTradePartnerId: partner.id }, 'owner');
  const application = board.enroll(account.id, position.id, position.revision);
  const packs = new FieldWorkPack(ledger);
  assert.ok(packs.list({ workerId: admitted.workerId }).rows.some(row => row.id === job.id));
  assert.equal(packs.read(job.id, admitted.workerId).job.id, job.id);

  ledger.upsertTradePartner({ status: 'on_hold' }, { id: partner.id, actor: 'owner' });
  assert.equal(packs.list({ workerId: admitted.workerId }).rows.some(row => row.id === job.id), false);
  assert.throws(() => packs.read(job.id, admitted.workerId), { statusCode: 403 });
  const inbox = board.workerNotifications(account.id);
  assert.match(inbox.notifications[0].body, /Neem contact op met de aannemer/);
  const own = board.applications(account.id).find(row => row.id === application.id);
  assert.equal(board.workerApplicationPosition(own).reviewRequired, true);
});

test('legacy public positions with dossier data are hidden and blocked without changing existing placements', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Private customer work', address: 'Kerkstraat 12A, Arnhem',
    client: { name: 'Familie De Vries', email: 'marie@example.test', phone: '+31 6 1234 5678', address: 'Kerkstraat 12A, Arnhem' },
    assignAutomatically: false });
  const placedWorker = await board.register(profile('legacy-assigned@example.test'));
  const position = board.publish(job.id, { ...terms, entryKey: 'legacy-position', capacity: 2 }, 'owner');
  board.admit(placedWorker.id, { reference: 'Contact checked' }, 'owner');
  const existingPlacement = board.enroll(placedWorker.id, position.id, position.revision);
  assert.equal(existingPlacement.status, 'assigned');

  const applicant = await board.register(profile('legacy-applicant@example.test'));
  const interest = board.enroll(applicant.id, position.id, position.revision);
  assert.equal(interest.status, 'interested');
  board.admit(applicant.id, { reference: 'Contact checked' }, 'owner');
  const secondApplicant = await board.register(profile('legacy-second-applicant@example.test'));
  const secondInterest = board.enroll(secondApplicant.id, position.id, position.revision);
  assert.equal(secondInterest.status, 'interested');
  const offer = board.createPositionOffer(interest.id, { expiresAt: new Date(Date.now() + 3600000).toISOString() }, 'owner');
  assert.equal(offer.status, 'offer_pending');

  const stored = JSON.parse(ledger.db.prepare('SELECT data_json FROM work_board_positions WHERE id = ?').get(position.id).data_json);
  const { revision: _oldRevision, publishedBy: _publishedBy, draftedBy: _draftedBy, ...publishedTerms } = stored;
  publishedTerms.description = 'Meet Familie De Vries at Kerkstraat 12A, Arnhem.';
  const revision = require('node:crypto').createHash('sha256').update(JSON.stringify(publishedTerms)).digest('hex');
  ledger.db.prepare('UPDATE work_board_positions SET data_json = ? WHERE id = ?')
    .run(JSON.stringify({ ...publishedTerms, revision, publishedBy: stored.publishedBy }), position.id);

  assert.equal(board.positions().some(item => item.id === position.id), false, 'worker board excludes the legacy unsafe release');
  const officePosition = board.positions({ jobId: job.id, office: true }).find(item => item.id === position.id);
  assert.equal(officePosition.privacyReviewRequired, true);
  assert.deepEqual(officePosition.privacyWarnings, ['het exacte adres', 'de klantnaam']);
  assert.equal(board.enrollmentCheck(applicant.id, position.id).canApply, false);
  assert.match(board.enrollmentCheck(applicant.id, position.id).blockers.join(' '), /mogelijk dossiergegevens/);
  assert.throws(() => board.enroll(applicant.id, position.id, revision), { statusCode: 409 });
  const pausedNotice = board.workerNotifications(applicant.id).notifications.find(item => item.type === 'position_offer');
  assert.equal(pausedNotice.title, 'Aanbod tijdelijk in hercontrole');
  assert.doesNotMatch(pausedNotice.body, /Familie De Vries|Kerkstraat 12A/);
  assert.throws(() => board.respondPositionOffer(applicant.id, interest.id, 'accept'), error => {
    assert.equal(error.statusCode, 409);
    assert.match(error.message, /opnieuw op privacy/);
    return true;
  });
  assert.throws(() => board.confirmApplication(interest.id), error => error.statusCode === 409 && /uitvoerende moet dit zelf accepteren/.test(error.message));
  board.admit(secondApplicant.id, { reference: 'Contact checked' }, 'owner');
  assert.throws(() => board.createPositionOffer(secondInterest.id, { expiresAt: new Date(Date.now() + 3600000).toISOString() }, 'owner'), { statusCode: 409 });

  const applicantView = board.workerApplicationPosition(board.applications(applicant.id)[0]);
  assert.equal(applicantView.reviewRequired, true);
  assert.equal(applicantView.reviewReason, 'privacy');
  assert.equal(applicantView.title, 'Opdracht wordt opnieuw gecontroleerd');
  assert.doesNotMatch(JSON.stringify(applicantView), /Familie De Vries|Kerkstraat 12A/);
  const originalPlacement = board.applications(placedWorker.id)[0];
  assert.equal(originalPlacement.status, 'assigned');
  assert.equal(originalPlacement.assignmentId, existingPlacement.assignmentId);
  assert.match(originalPlacement.position.description, /Familie De Vries/);
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 1, 'the pre-existing placement remains intact');
});

test('closing a position revokes pending offers but preserves existing assignments and interest', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Close position safely', client: { name: 'Client' }, assignAutomatically: false });
  const existingWorker = await board.register(profile('close-assigned@example.test'));
  const position = board.publish(job.id, { ...terms, entryKey: 'close-position', capacity: 2 }, 'owner');
  board.admit(existingWorker.id, { reference: 'Contact checked' }, 'owner');
  const existingPlacement = board.enroll(existingWorker.id, position.id, position.revision);
  assert.equal(existingPlacement.status, 'assigned');

  const applicant = await board.register(profile('close-offer@example.test'));
  const interest = board.enroll(applicant.id, position.id, position.revision);
  board.admit(applicant.id, { reference: 'Contact checked' }, 'owner');
  const offer = board.createPositionOffer(interest.id, { expiresAt: new Date(Date.now() + 3600000).toISOString() }, 'owner');
  assert.equal(offer.status, 'offer_pending');

  board.close(position.id, 'owner');

  assert.equal(ledger.db.prepare('SELECT status FROM work_board_position_offers WHERE id = ?').get(offer.offer.id).status, 'revoked');
  assert.equal(board.applications(applicant.id)[0].status, 'interested', 'original worker interest is retained');
  assert.equal(board.workerApplicationPosition(board.applications(applicant.id)[0]).reviewReason, 'closed');
  const notice = board.workerNotifications(applicant.id).notifications.find(item => item.type === 'position_offer');
  assert.equal(notice.title, 'Aanbod ingetrokken');
  assert.match(notice.body, /positie gesloten/);
  assert.throws(() => board.respondPositionOffer(applicant.id, interest.id, 'accept'), { statusCode: 409 });
  assert.equal(board.applications(existingWorker.id)[0].assignmentId, existingPlacement.assignmentId);
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 1, 'closing enrollment does not alter an existing placement');
});

test('position-specific declared skills are visible, immutable, and rechecked before placement', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Bathroom renovation', client: { name: 'Client' }, assignAutomatically: false });
  const account = await board.register(profile('skills@example.test'));
  const position = board.publish(job.id, { ...terms, entryKey: 'position-extra-skills', requiredSkills: ['Tegelzetten', 'Waterdichting', ' tegelzetten '] }, 'owner');

  assert.deepEqual(position.requiredSkills, ['Tegelzetten', 'Waterdichting']);
  assert.deepEqual(board.positions().find(item => item.id === position.id).requiredSkills, position.requiredSkills);
  assert.equal(board.enrollmentCheck(account.id, position.id).canApply, true);
  assert.match(board.enrollmentCheck(account.id, position.id).advisories.join(' '), /Tegelzetten, Waterdichting/);
  assert.equal(board.enroll(account.id, position.id, position.revision).status, 'interested');

  const admitted = board.admit(account.id, { reference: 'Identity and base trade reviewed' }, 'owner');
  assert.equal(board.enrollmentCheck(account.id, position.id).canApply, false);
  assert.match(board.enrollmentCheck(account.id, position.id).blockers.join(' '), /aanvullende vaardigheden/);
  const applicationId = ledger.db.prepare('SELECT id FROM work_board_applications WHERE account_id = ?').get(account.id).id;
  assert.throws(() => board.createPositionOffer(applicationId, { expiresAt: new Date(Date.now() + 3600000).toISOString() }, 'owner'), { statusCode: 409 });
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 0);

  ledger.upsertWorker({ id: admitted.workerId, skills: ['Carpenter', 'Tegelzetten', 'Waterdichting'] }, { actor: 'owner' });
  const accountData = JSON.parse(ledger.db.prepare('SELECT data_json FROM work_board_accounts WHERE id = ?').get(account.id).data_json);
  ledger.db.prepare('UPDATE work_board_accounts SET data_json = ? WHERE id = ?')
    .run(JSON.stringify({ ...accountData, skills: ['Carpenter', 'Tegelzetten', 'Waterdichting'] }), account.id);
  assert.equal(board.enrollmentCheck(account.id, position.id).canApply, true);
  assert.equal(board.enroll(account.id, position.id, position.revision).status, 'assigned', 'the admitted worker explicitly accepts the current position by enrolling');
});

test('admitted workers can propose profile skills but only owner review updates the matchable worker profile', async t => {
  const { board, ledger } = fixture(t);
  const applicant = await board.register(profile('profile-change@example.test'));
  assert.deepEqual(board.updateSkills(applicant.id, { skills: ['Carpenter', 'Tiler', 'tiler'] }).account.skills, ['Carpenter', 'Tiler']);
  const admitted = board.admit(applicant.id, { reference: 'Identity and primary trade checked' }, 'owner');

  const rejected = board.updateSkills(applicant.id, { skills: ['Carpenter', 'Tiler', 'Waterproofing'] });
  assert.equal(rejected.reviewRequired, true);
  assert.deepEqual(rejected.account.skills, ['Carpenter', 'Tiler']);
  assert.deepEqual(ledger.getWorker(admitted.workerId).skills, ['Carpenter', 'Tiler']);
  const ownerList = board.accounts().find(item => item.id === applicant.id);
  assert.deepEqual(ownerList.pendingSkillsChange.skills, ['Carpenter', 'Tiler', 'Waterproofing']);
  assert.equal(board.updateSkills(applicant.id, { skills: ['Carpenter', 'Tiler'] }).withdrawn, true);
  assert.equal(board.account(applicant.id).pendingSkillsChange, undefined);
  board.updateSkills(applicant.id, { skills: ['Carpenter', 'Tiler', 'Waterproofing'] });

  const afterReject = board.reviewSkillsChange(applicant.id, { decision: 'reject', reference: 'No evidence reviewed' }, 'owner');
  assert.deepEqual(afterReject.skills, ['Carpenter', 'Tiler']);
  assert.equal(afterReject.pendingSkillsChange, undefined);
  const secondProposal = board.updateSkills(applicant.id, { skills: ['Carpenter', 'Tiler', 'Waterproofing'] });
  const approved = board.reviewSkillsChange(applicant.id, { decision: 'approve', reference: 'Practical experience discussed and approved' }, 'owner');
  assert.equal(secondProposal.reviewRequired, true);
  assert.deepEqual(approved.skills, ['Carpenter', 'Tiler', 'Waterproofing']);
  assert.deepEqual(ledger.getWorker(admitted.workerId).skills, approved.skills);
  assert.deepEqual(ledger.listAudit({ entityType: 'work_board_account', entityId: applicant.id, limit: 20 })
    .map(event => event.action).filter(action => action.includes('skills')).sort(), [
    'update_applicant_declared_skills', 'propose_worker_skills_change', 'withdraw_worker_skills_change',
    'propose_worker_skills_change', 'reject_worker_skills_change', 'propose_worker_skills_change', 'approve_worker_skills_change'
  ].sort());
});

test('work-region preferences warn on place-name mismatch without blocking interest', async t => {
  const { board, ledger } = fixture(t);
  const applicant = await board.register(profile('regions@example.test'));
  const job = ledger.createIntake({ title: 'Work in Nijmegen', city: 'Nijmegen', client: { name: 'Client' }, assignAutomatically: false });
  const position = board.publish(job.id, { ...terms, entryKey: 'region-signal', city: 'Nijmegen' }, 'owner');

  const initialCheck = board.enrollmentCheck(applicant.id, position.id);
  assert.equal(initialCheck.canApply, true);
  assert.match(initialCheck.advisories.join(' '), /staat niet in je opgegeven werkgebieden/);
  assert.equal(board.enroll(applicant.id, position.id, position.revision).status, 'interested');
  assert.match(board.jobApplications(job.id)[0].placementReview.advisories.join(' '), /Nijmegen/);

  const updated = board.updateWorkRegions(applicant.id, { regions: ['Nijmegen', 'nijmegen'] });
  assert.deepEqual(updated.account.workRegions, ['Nijmegen']);
  assert.equal(updated.account.region, 'Nijmegen');
  assert.doesNotMatch(board.enrollmentCheck(applicant.id, position.id).advisories.join(' '), /opgegeven werkgebieden/);
  assert.equal(board.enrollmentCheck(applicant.id, position.id).canApply, true);

  board.updateWorkRegions(applicant.id, { allRegions: true });
  assert.equal(board.account(applicant.id).allRegions, true);
  assert.doesNotMatch(board.enrollmentCheck(applicant.id, position.id).advisories.join(' '), /opgegeven werkgebieden/);
});

test('position task links persist into the worker pack and hide unrelated shared job tasks', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Scoped field package', client: { name: 'Private Client' }, assignAutomatically: false });
  const linkedMaterial = ledger.addMaterialRequirement(job.id, { name: 'Approved door set', quantity: 2, unit: 'pieces', status: 'available' });
  const unrelatedMaterial = ledger.addMaterialRequirement(job.id, { name: 'Electrical cable', quantity: 30, unit: 'm', status: 'needed' });
  const linkedTask = ledger.addTask(job.id, { title: 'Install the listed door set', requiredTrade: 'Carpenter', materialRequirementIds: [linkedMaterial.id] });
  const unrelatedTask = ledger.addTask(job.id, { title: 'Finish the electrical riser', requiredTrade: 'Electrician' });
  const otherWorker = ledger.upsertWorker({ name: 'Different trade', role: 'Electrician', status: 'available' });
  const privateTask = ledger.addTask(job.id, { title: 'Other trade private detail', assigneeId: otherWorker.id });
  const account = await board.register(profile('task-scope-worker@example.test'));
  const admitted = board.admit(account.id, { reference: 'Worker identity and trade reviewed' }, 'owner');
  const position = board.publish(job.id, { ...terms, entryKey: 'task-scoped-position', sourceTaskIds: [linkedTask.id] }, 'owner');
  const enrollment = board.enroll(account.id, position.id, position.revision);
  const assignment = ledger.getJobDetail(job.id).assignments.find(row => row.id === enrollment.assignmentId);

  assert.equal(assignment.data.workBoardPositionId, position.id);
  assert.deepEqual(assignment.data.workBoardTaskIds, [linkedTask.id]);
  const pack = new FieldWorkPack(ledger).read(job.id, admitted.workerId);
  assert.deepEqual(pack.do.map(task => task.id), [linkedTask.id]);
  assert.deepEqual(pack.have.materials.map(material => material.id), [linkedMaterial.id]);
  assert.equal(pack.do.some(task => task.id === unrelatedTask.id || task.id === privateTask.id), false);
  assert.equal(JSON.stringify(pack).includes('Finish the electrical riser'), false);
  assert.equal(JSON.stringify(pack).includes('Electrical cable'), false);
  assert.equal(pack.have.materials.some(material => material.id === unrelatedMaterial.id), false);
});

test('a position can require an acknowledged start release for only its linked tasks', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Controlled roof repair', client: { name: 'Client' }, assignAutomatically: false });
  const task = ledger.addTask(job.id, { title: 'Replace roof edge', requiredTrade: 'Carpenter' });
  assert.throws(() => board.publish(job.id, { ...terms, entryKey: 'release-without-task', startReleaseRequired: true }, 'owner'), { statusCode: 400 });
  const position = board.publish(job.id, { ...terms, entryKey: 'release-required-position', sourceTaskIds: [task.id], startReleaseRequired: true }, 'owner');
  assert.equal(position.startReleaseRequired, true);
  const account = await board.register(profile('release-worker@example.test'));
  board.admit(account.id, { reference: 'Identity and trade checked' }, 'owner');
  const enrollment = board.enroll(account.id, position.id, position.revision);
  const assignment = ledger.getJobDetail(job.id).assignments.find(row => row.id === enrollment.assignmentId);
  assert.equal(assignment.data.startReleaseRequired, true);
  assert.equal(assignment.data.workBoardPositionId, position.id);
  assert.deepEqual(assignment.data.workBoardTaskIds, [task.id]);
});

test('task trade requirements flow into position suggestions without inferring missing trades', t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Trade-linked task', city: 'Arnhem', client: { name: 'Client' }, assignAutomatically: false });
  const carpenter = ledger.addTask(job.id, { title: 'Fit internal doors', durationHours: 6, requiredTrade: 'Timmerman' });
  const unspecified = ledger.addTask(job.id, { title: 'Inspect existing opening', durationHours: 2 });

  assert.throws(() => board.publish(job.id, { ...terms, role: 'Elektricien', sourceTaskIds: [carpenter.id] }, 'owner'), { statusCode: 409 });

  const suggestions = board.suggest(job.id).suggestions;
  assert.equal(suggestions.find(item => item.sourceTaskId === carpenter.id).role, 'Timmerman');
  assert.equal(suggestions.find(item => item.sourceTaskId === unspecified.id).role, null);
  assert.ok(board.suggest(job.id).missing.includes('role'));
  const fullySpecifiedJob = ledger.createIntake({ title: 'Specified-trade task', client: { name: 'Client' }, assignAutomatically: false });
  const electrician = ledger.addTask(fullySpecifiedJob.id, { title: 'Wire circuit', requiredTrade: 'Elektricien' });
  const fullySpecified = board.suggest(fullySpecifiedJob.id);
  assert.equal(fullySpecified.suggestions.find(item => item.sourceTaskId === electrician.id).role, 'Elektricien');
  assert.equal(fullySpecified.missing.includes('role'), fullySpecified.suggestions.some(item => !item.role));
  assert.throws(() => ledger.addTask(job.id, { title: 'Invalid trade label', requiredTrade: 'x'.repeat(81) }), { code: 'task_required_trade_too_long' });
});

test('intake coordination checklist tasks do not become worker position suggestions', t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Intake checklist exclusion', client: { name: 'Client' }, assignAutomatically: false });
  const defaults = ledger.getJobDetail(job.id).tasks;
  assert.equal(defaults.length, 4);
  assert.ok(defaults.every(task => task.data.source === 'job_intake_default'
    && task.data.workforcePositionEligible === false
    && task.data.excludeFromResourcePlan === true
    && task.data.excludeFromWorkPlan !== true));
  assert.equal(board.suggest(job.id).suggestions.length, 0);
  assert.throws(() => board.saveDraft(job.id, { entryKey: 'intake-task-as-draft', title: defaults[0].title,
    sourceTaskIds: [defaults[0].id] }, 'owner'), { statusCode: 409 });
  assert.throws(() => board.publish(job.id, { ...terms, entryKey: 'intake-task-as-position',
    sourceTaskIds: [defaults[0].id] }, 'owner'), { statusCode: 409 });

  const legacy = defaults[0];
  ledger.db.prepare('UPDATE job_tasks SET data_json = ? WHERE id = ?')
    .run(JSON.stringify({ materialRequirementIds: [], requiredTrade: null, source: null }), legacy.id);
  assert.equal(board.suggest(job.id).suggestions.some(item => item.sourceTaskId === legacy.id), false,
    'the exact legacy intake-task signature is also excluded');

  const realWork = ledger.addTask(job.id, { title: legacy.title, description: 'Install and seal the specified roof edge.',
    requiredTrade: 'Dakdekker', durationHours: 6 });
  assert.deepEqual(board.suggest(job.id).suggestions.map(item => item.sourceTaskId), [realWork.id],
    'a real executable task with the same title remains eligible');
});

test('published task-linked positions become stale when their source task schedule changes', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Source-controlled position', client: { name: 'Client' }, assignAutomatically: false });
  const task = ledger.addTask(job.id, { title: 'Install roof battens', durationHours: 8, requiredTrade: 'Carpenter' });
  const applicant = await board.register(profile('stale-source@example.test'));
  const position = board.publish(job.id, { ...terms, entryKey: 'stale-task-source', sourceTaskIds: [task.id] }, 'owner');
  assert.equal(position.sourceTasksCurrent, true);
  assert.equal(board.enrollmentCheck(applicant.id, position.id).canApply, true);
  board.enroll(applicant.id, position.id, position.revision);

  ledger.updateTaskSchedule(job.id, task.id, { plannedStart: '2030-06-02T08:00:00Z', plannedEnd: '2030-06-02T16:00:00Z', durationHours: 8 });
  const stale = board.position(position.id);
  assert.equal(stale.sourceTasksCurrent, false);
  assert.equal(stale.workPackageCurrent, false);
  assert.equal(board.positions().some(item => item.id === position.id), false, 'stale published work is hidden from new workers');
  const applicantView = board.workerApplicationPosition(board.applications(applicant.id)[0]);
  assert.equal(applicantView.reviewRequired, true);
  assert.equal(applicantView.reviewReason, 'source');
  assert.equal(board.enrollmentCheck(applicant.id, position.id).canApply, false);
  assert.match(board.enrollmentCheck(applicant.id, position.id).blockers.join(' '), /gekoppelde werkzaamheid/);
  assert.throws(() => board.enroll(applicant.id, position.id, position.revision), { statusCode: 409 });
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 0);
});

test('position drafts persist privately, resume by publication key, and become visible only on release', t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Position draft lifecycle', city: 'Arnhem', client: { name: 'Client' }, assignAutomatically: false });
  const task = ledger.addTask(job.id, { title: 'Install roof battens', durationHours: 8, requiredTrade: 'Carpenter' });
  const draft = board.saveDraft(job.id, { ...terms, entryKey: 'durable-position-draft', title: task.title,
    sourceTaskIds: [task.id], capacity: '', rate: '' }, 'owner');

  assert.equal(draft.status, 'draft');
  assert.ok(draft.missingFields.includes('aantal personen'));
  assert.ok(draft.missingFields.includes('uurvergoeding'));
  assert.equal(board.positions().some(position => position.id === draft.id), false);
  assert.equal(board.positions({ jobId: job.id, office: true }).find(position => position.id === draft.id).status, 'draft');
  assert.equal(board.saveDraft(job.id, { ...terms, entryKey: draft.entryKey, title: 'Revised roof battens',
    sourceTaskIds: [task.id], capacity: '', rate: '' }, 'owner').id, draft.id);

  ledger.updateTaskSchedule(job.id, task.id, { plannedStart: '2030-06-02T08:00:00Z', plannedEnd: '2030-06-02T16:00:00Z', durationHours: 8 });
  assert.equal(board.position(draft.id).workPackageCurrent, false);
  assert.throws(() => board.publish(job.id, { ...terms, entryKey: draft.entryKey, sourceTaskIds: [task.id], confirmPublication: true }, 'owner'), { statusCode: 409 });
  assert.equal(board.saveDraft(job.id, { ...terms, entryKey: draft.entryKey, sourceTaskIds: [task.id], capacity: '', rate: '' }, 'owner').workPackageCurrent, true);

  const published = board.publish(job.id, { ...terms, entryKey: draft.entryKey, title: 'Roof battens installation',
    sourceTaskIds: [task.id], confirmPublication: true }, 'owner');
  assert.equal(published.id, draft.id);
  assert.equal(published.status, 'open');
  assert.equal(board.positions().some(position => position.id === draft.id), true);
  assert.throws(() => board.saveDraft(job.id, { ...terms, entryKey: draft.entryKey, sourceTaskIds: [task.id] }, 'owner'), { statusCode: 409 });
});

test('enrollment check explains admission and current schedule blockers without changing records', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Eligibility check position', client: { name: 'Client' }, assignAutomatically: false });
  const applicant = await board.register(profile('eligibility@example.test'));
  const position = board.publish(job.id, { ...terms, entryKey: 'eligibility-check-position' }, 'owner');

  const pending = board.enrollmentCheck(applicant.id, position.id);
  assert.equal(pending.canApply, true, 'pending workers may still express interest');
  assert.match(pending.advisories.join(' '), /toelating afronden/);
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 0);
  board.enroll(applicant.id, position.id, position.revision);
  const pendingOfficeReview = board.jobApplications(job.id)[0].placementReview;
  assert.deepEqual(pendingOfficeReview.blockers, []);
  assert.match(pendingOfficeReview.advisories.join(' '), /toelating afronden/);

  const admitted = board.admit(applicant.id, { reference: 'Contact and trade checked' }, 'owner');
  assert.equal(board.enrollmentCheck(applicant.id, position.id).canApply, true);
  const otherJob = ledger.createIntake({ title: 'Conflicting existing work', client: { name: 'Other client' }, assignAutomatically: false });
  ledger.addAssignment(otherJob.id, { workerId: admitted.workerId, role: 'Carpenter', status: 'planned',
    scheduledStart: position.startsAt, scheduledEnd: position.endsAt });
  const conflict = board.enrollmentCheck(applicant.id, position.id);
  assert.equal(conflict.canApply, false);
  assert.match(conflict.blockers.join(' '), /overlapt met een andere opdracht/);
  assert.match(board.jobApplications(job.id)[0].placementReview.blockers.join(' '), /overlapt met een andere opdracht/);
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 0, 'eligibility checks never create placements');
});

test('overlapping standby interest is held for the owner while confirmed commitments remain unchanged', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Standby applicant work', client: { name: 'Client' }, assignAutomatically: false });
  const applicant = await board.register(profile('standby@example.test'));
  const admitted = board.admit(applicant.id, { reference: 'Contact and trade checked' }, 'owner');
  const position = board.publish(job.id, { ...terms, entryKey: 'standby-position' }, 'owner');
  const period = ledger.createWorkerAvailabilityPeriod(admitted.workerId, {
    periodType: 'standby', title: 'Available on call', startsAt: position.startsAt, endsAt: position.endsAt
  }, { actor: `worker:${admitted.workerId}` });

  const interest = board.enroll(applicant.id, position.id, position.revision);
  assert.equal(interest.status, 'interested');
  assert.equal(interest.assignmentId, null);
  assert.equal(interest.holdReason, 'standby_confirmation_required');
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 0);
  const officeApplication = board.jobApplications(job.id)[0];
  assert.ok(officeApplication.holdReasons.includes('standby_confirmation_required'));

  assert.throws(() => board.confirmApplication(interest.id), error => error.statusCode === 409 && /concreet aanbod/.test(error.message));
  board.createPositionOffer(interest.id, { expiresAt: new Date(Date.now() + 3600000).toISOString() }, 'owner');
  const placement = board.respondPositionOffer(applicant.id, interest.id, 'accept');
  assert.equal(placement.status, 'assigned');
  assert.ok(placement.assignmentId);
  assert.equal(board.confirmApplication(interest.id).assignmentId, placement.assignmentId);
  assert.equal(ledger.getWorkerAvailabilityPeriod(period.period.id).status, 'active');
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 1);
  assert.equal(ledger.diagnose().valid, true);
});

test('position offers respect standby notice at issue and at the final acceptance deadline', async t => {
  const { board, ledger } = fixture(t);
  const workerAccount = await board.register(profile('standby-notice-position@example.test'));
  const admitted = board.admit(workerAccount.id, { reference: 'Contact and trade checked' }, 'owner');
  const startsAt = new Date(Date.now() + 72 * 3600000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 8 * 3600000).toISOString();
  const job = ledger.createIntake({ title: 'Notice-bound position', client: { name: 'Client' }, assignAutomatically: false });
  const position = board.publish(job.id, { ...terms, entryKey: 'standby-minimum-notice-position', startsAt, endsAt }, 'owner');
  ledger.createWorkerAvailabilityPeriod(admitted.workerId, {
    periodType: 'standby', title: 'Available on call', startsAt, endsAt, minimumNoticeHours: 24
  }, { actor: `worker:${admitted.workerId}` });

  const interest = board.enroll(workerAccount.id, position.id, position.revision);
  assert.equal(interest.status, 'interested');
  const afterDeadline = new Date(Date.parse(startsAt) - 12 * 3600000).toISOString();
  assert.throws(() => board.createPositionOffer(interest.id, { expiresAt: afterDeadline }, 'owner'),
    error => error.statusCode === 400 && error.code === 'worker_standby_offer_expiry_after_notice');

  const withinDeadline = new Date(Date.parse(startsAt) - 25 * 3600000).toISOString();
  board.createPositionOffer(interest.id, { expiresAt: withinDeadline }, 'owner');
  const accepted = board.respondPositionOffer(workerAccount.id, interest.id, 'accept');
  assert.equal(accepted.status, 'assigned');
  assert.ok(accepted.assignmentId);

  const shortStart = new Date(Date.now() + 36 * 3600000).toISOString();
  const shortEnd = new Date(Date.parse(shortStart) + 8 * 3600000).toISOString();
  const shortJob = ledger.createIntake({ title: 'Too-late standby position', client: { name: 'Client' }, assignAutomatically: false });
  const shortPosition = board.publish(shortJob.id, { ...terms, entryKey: 'standby-notice-too-late-position', startsAt: shortStart, endsAt: shortEnd }, 'owner');
  const secondAccount = await board.register(profile('standby-notice-too-late@example.test'));
  const secondWorker = board.admit(secondAccount.id, { reference: 'Contact and trade checked' }, 'owner');
  ledger.createWorkerAvailabilityPeriod(secondWorker.workerId, {
    periodType: 'standby', title: 'Available on call', startsAt: shortStart, endsAt: shortEnd, minimumNoticeHours: 48
  }, { actor: `worker:${secondWorker.workerId}` });
  const secondInterest = board.enroll(secondAccount.id, shortPosition.id, shortPosition.revision);
  assert.equal(secondInterest.status, 'interested');
  assert.throws(() => board.createPositionOffer(secondInterest.id, {
    expiresAt: new Date(Date.now() + 3600000).toISOString()
  }, 'owner'), error => error.statusCode === 409 && error.code === 'worker_standby_notice_insufficient');
  assert.equal(ledger.getJobDetail(shortJob.id).assignments.length, 0);
});

test('standby call-outs honor the worker minimum notice and reject changed notice terms', async t => {
  const { board, ledger } = fixture(t);
  const startsAt = new Date(Date.now() + 36 * 3600000).toISOString();
  const endsAt = new Date(Date.parse(startsAt) + 4 * 3600000).toISOString();
  const job = ledger.createIntake({ title: 'Notice-bound replacement', client: { name: 'Client' },
    status: 'scheduled', scheduledStart: startsAt, scheduledEnd: endsAt, assignAutomatically: false });
  const original = await board.register(profile('notice-original@example.test'));
  const originalWorker = board.admit(original.id, { reference: 'Identity and trade checked' }, 'owner');
  const assignment = ledger.addAssignment(job.id, { workerId: originalWorker.workerId, role: 'Carpenter', status: 'planned', scheduledStart: startsAt, scheduledEnd: endsAt });
  const unavailable = ledger.createWorkerAvailabilityPeriod(originalWorker.workerId, {
    periodType: 'unavailable', startsAt, endsAt
  }, { actor: `worker:${originalWorker.workerId}` });
  const tooLittleNotice = await board.register(profile('notice-48@example.test'));
  const shortNoticeWorker = board.admit(tooLittleNotice.id, { reference: 'Identity and trade checked' }, 'owner');
  const longStandby = ledger.createWorkerAvailabilityPeriod(shortNoticeWorker.workerId, {
    periodType: 'standby', startsAt, endsAt, minimumNoticeHours: 48
  }, { actor: `worker:${shortNoticeWorker.workerId}` });
  const enoughNotice = await board.register(profile('notice-24@example.test'));
  const enoughNoticeWorker = board.admit(enoughNotice.id, { reference: 'Identity and trade checked' }, 'owner');
  const standby = ledger.createWorkerAvailabilityPeriod(enoughNoticeWorker.workerId, {
    periodType: 'standby', startsAt, endsAt, minimumNoticeHours: 24
  }, { actor: `worker:${enoughNoticeWorker.workerId}` });

  const candidates = board.standbyCalloutCandidates(job.id, assignment.id);
  assert.deepEqual(candidates.map(item => item.id), [enoughNoticeWorker.workerId]);
  assert.equal(candidates[0].minimumNoticeHours, 24);
  assert.throws(() => board.createStandbyCallout(job.id, assignment.id, {
    workerId: shortNoticeWorker.workerId, standbyPeriodId: longStandby.period.id,
    availabilityPeriodId: unavailable.period.id, reason: 'Coverage needed for a changed worker schedule.',
    expiresAt: new Date(Date.parse(startsAt) - 3600000).toISOString()
  }, 'owner'), { statusCode: 409 });

  const callout = board.createStandbyCallout(job.id, assignment.id, {
    workerId: enoughNoticeWorker.workerId, standbyPeriodId: standby.period.id,
    availabilityPeriodId: unavailable.period.id, reason: 'Coverage needed for a changed worker schedule.',
    expiresAt: new Date(Date.parse(startsAt) - 3600000).toISOString()
  }, 'owner');
  assert.equal(callout.snapshot.minimumNoticeHours, 24);
  const tamperedData = JSON.parse(ledger.db.prepare('SELECT data_json FROM worker_availability_periods WHERE id = ?').get(standby.period.id).data_json);
  tamperedData.minimumNoticeHours = 48;
  ledger.db.prepare('UPDATE worker_availability_periods SET data_json = ? WHERE id = ?').run(JSON.stringify(tamperedData), standby.period.id);
  assert.throws(() => board.respondToStandbyCallout(enoughNoticeWorker.workerId, callout.id, 'accept'), { statusCode: 409 });
  assert.equal(board.mapStandbyCallout(callout.id).status, 'offered');

  tamperedData.minimumNoticeHours = 24;
  ledger.db.prepare('UPDATE worker_availability_periods SET data_json = ? WHERE id = ?').run(JSON.stringify(tamperedData), standby.period.id);
  assert.equal(board.respondToStandbyCallout(enoughNoticeWorker.workerId, callout.id, 'accept').status, 'accepted');
  const replacement = ledger.requestAssignmentReplacement(job.id, assignment.id, {
    workerId: enoughNoticeWorker.workerId, availabilityPeriodId: unavailable.period.id,
    standbyCalloutId: callout.id, reason: 'Original worker cannot cover the recorded shift.'
  }, { actor: 'owner' });
  tamperedData.minimumNoticeHours = 48;
  ledger.db.prepare('UPDATE worker_availability_periods SET data_json = ? WHERE id = ?').run(JSON.stringify(tamperedData), standby.period.id);
  assert.throws(() => ledger.resolveApproval(replacement.approval.id, {
    status: 'approved', resolvedBy: 'independent_approver', reason: 'Recheck accepted standby terms before replacement.'
  }), { statusCode: 409 });
  assert.equal(ledger.getJobDetail(job.id).assignments.find(item => item.id === assignment.id).status, 'planned');
});

test('a later weekly standby occurrence survives offer, acceptance, and replacement approval checks', async t => {
  const { board, ledger } = fixture(t);
  const firstStart = new Date(Date.now() + 36 * 3600000);
  const firstEnd = new Date(firstStart.getTime() + 4 * 3600000);
  const shiftStart = new Date(firstStart.getTime() + 7 * 24 * 3600000);
  const shiftEnd = new Date(firstEnd.getTime() + 7 * 24 * 3600000);
  const originalAccount = await board.register(profile('weekly-callout-original@example.test'));
  const originalWorker = board.admit(originalAccount.id, { reference: 'Identity and trade checked' }, 'owner');
  const standbyAccount = await board.register(profile('weekly-callout-standby@example.test'));
  const standbyWorker = board.admit(standbyAccount.id, { reference: 'Identity and trade checked' }, 'owner');
  const job = ledger.createIntake({ title: 'Second weekly standby shift', client: { name: 'Client' },
    status: 'scheduled', scheduledStart: shiftStart.toISOString(), scheduledEnd: shiftEnd.toISOString(), assignAutomatically: false });
  const assignment = ledger.addAssignment(job.id, { workerId: originalWorker.workerId, role: 'Carpenter', status: 'planned',
    scheduledStart: shiftStart.toISOString(), scheduledEnd: shiftEnd.toISOString() });
  const unavailable = ledger.createWorkerAvailabilityPeriod(originalWorker.workerId, {
    periodType: 'unavailable', startsAt: shiftStart.toISOString(), endsAt: shiftEnd.toISOString()
  }, { actor: `field_worker:${originalWorker.workerId}` });
  const standby = ledger.createWorkerAvailabilityPeriod(standbyWorker.workerId, {
    periodType: 'standby', startsAt: firstStart.toISOString(), endsAt: firstEnd.toISOString(), minimumNoticeHours: 24,
    recurrence: { frequency: 'weekly', daysOfWeek: [firstStart.getUTCDay()], timeZone: 'UTC', until: new Date(firstStart.getTime() + 8 * 24 * 3600000).toISOString().slice(0, 10) }
  }, { actor: `field_worker:${standbyWorker.workerId}` });

  const candidates = board.standbyCalloutCandidates(job.id, assignment.id);
  assert.deepEqual(candidates.map(item => item.id), [standbyWorker.workerId]);
  const callout = board.createStandbyCallout(job.id, assignment.id, {
    workerId: standbyWorker.workerId, standbyPeriodId: standby.period.id, availabilityPeriodId: unavailable.period.id,
    reason: 'Coverage needed for a recorded weekly commitment.',
    expiresAt: new Date(shiftStart.getTime() - 30 * 3600000).toISOString()
  }, 'owner');
  assert.equal(board.respondToStandbyCallout(standbyWorker.workerId, callout.id, 'accept').status, 'accepted');
  const replacement = ledger.requestAssignmentReplacement(job.id, assignment.id, {
    workerId: standbyWorker.workerId, availabilityPeriodId: unavailable.period.id,
    standbyCalloutId: callout.id, reason: 'Original worker cannot cover the recorded weekly shift.'
  }, { actor: 'owner' });
  const approved = ledger.resolveApproval(replacement.approval.id, {
    status: 'approved', resolvedBy: 'independent_approver', reason: 'Weekly occurrence and worker notice verified.'
  });
  assert.equal(approved.status, 'approved');
  assert.equal(ledger.getJobDetail(job.id).assignments.find(item => item.id === assignment.id).status, 'released');
});

test('new overlapping unavailability revokes a standby callout and cancels its pending replacement atomically', async t => {
  const { board, ledger } = fixture(t);
  const startsAt = new Date(Date.now() + 10 * 86_400_000);
  const endsAt = new Date(startsAt.getTime() + 4 * 3_600_000);
  const laterStart = new Date(startsAt.getTime() + 24 * 3_600_000);
  const laterEnd = new Date(laterStart.getTime() + 4 * 3_600_000);
  const makeWorker = async email => {
    const account = await board.register(profile(email));
    return board.admit(account.id, { reference: 'Identity and trade checked' }, 'owner');
  };
  const original = await makeWorker('sudden-absence-original@example.test');
  const secondOriginal = await makeWorker('sudden-absence-second@example.test');
  const substitute = await makeWorker('sudden-absence-substitute@example.test');
  const firstJob = ledger.createIntake({ title: 'First replacement job', client: { name: 'Client' },
    status: 'scheduled', scheduledStart: startsAt.toISOString(), scheduledEnd: endsAt.toISOString(), assignAutomatically: false });
  const secondJob = ledger.createIntake({ title: 'Later replacement job', client: { name: 'Client' },
    status: 'scheduled', scheduledStart: laterStart.toISOString(), scheduledEnd: laterEnd.toISOString(), assignAutomatically: false });
  const firstAssignment = ledger.addAssignment(firstJob.id, { workerId: original.workerId, role: 'Carpenter', status: 'planned', scheduledStart: startsAt.toISOString(), scheduledEnd: endsAt.toISOString() });
  const secondAssignment = ledger.addAssignment(secondJob.id, { workerId: secondOriginal.workerId, role: 'Carpenter', status: 'planned', scheduledStart: laterStart.toISOString(), scheduledEnd: laterEnd.toISOString() });
  const firstUnavailable = ledger.createWorkerAvailabilityPeriod(original.workerId, { periodType: 'unavailable', startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }, { actor: `field_worker:${original.workerId}` });
  const secondUnavailable = ledger.createWorkerAvailabilityPeriod(secondOriginal.workerId, { periodType: 'unavailable', startsAt: laterStart.toISOString(), endsAt: laterEnd.toISOString() }, { actor: `field_worker:${secondOriginal.workerId}` });
  const standby = ledger.createWorkerAvailabilityPeriod(substitute.workerId, { periodType: 'standby', startsAt: startsAt.toISOString(), endsAt: laterEnd.toISOString() }, { actor: `field_worker:${substitute.workerId}` });
  const createCallout = (job, assignment, unavailable, start) => board.createStandbyCallout(job.id, assignment.id, {
    workerId: substitute.workerId, standbyPeriodId: standby.period.id, availabilityPeriodId: unavailable.period.id,
    reason: 'Coverage requested for a recorded absence.', expiresAt: new Date(start.getTime() - 60_000).toISOString()
  }, 'owner');
  const firstCallout = createCallout(firstJob, firstAssignment, firstUnavailable, startsAt);
  const laterCallout = createCallout(secondJob, secondAssignment, secondUnavailable, laterStart);
  board.respondToStandbyCallout(substitute.workerId, firstCallout.id, 'accept');
  const replacement = ledger.requestAssignmentReplacement(firstJob.id, firstAssignment.id, {
    workerId: substitute.workerId, availabilityPeriodId: firstUnavailable.period.id,
    standbyCalloutId: firstCallout.id, reason: 'Accepted substitute became unavailable before the shift.'
  }, { actor: 'owner' });

  const suddenUnavailability = ledger.createWorkerAvailabilityPeriod(substitute.workerId, {
    periodType: 'unavailable',
    startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString()
  }, { actor: `field_worker:${substitute.workerId}` });

  assert.deepEqual(suddenUnavailability.invalidatedCallouts, [{ calloutId: firstCallout.id, approvalId: replacement.approval.id }]);
  assert.equal(board.mapStandbyCallout(firstCallout.id).status, 'revoked');
  assert.equal(board.mapStandbyCallout(laterCallout.id).status, 'offered', 'a non-overlapping later offer remains current');
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(replacement.approval.id).status, 'cancelled');
  assert.equal(ledger.getJobDetail(firstJob.id).assignments.find(item => item.id === firstAssignment.id).status, 'planned');
  assert.equal(ledger.getJobDetail(firstJob.id).assignments.find(item => item.id === replacement.assignment.id).status, 'cancelled');
  assert.equal(ledger.diagnose().valid, true);
  assert.ok(ledger.db.prepare('SELECT action FROM audit_events WHERE entity_type = ? AND entity_id = ?')
    .all('approval', replacement.approval.id).some(event => event.action === 'cancel_stale_standby_replacement_approval'));
  board.suspend(substitute.id, 'owner');
  assert.equal(board.mapStandbyCallout(laterCallout.id).status, 'revoked', 'suspension uses the same callout and approval cleanup');
});

test('expired standby offers create one durable worker notice without retaining the call-out reason', async t => {
  const { board, ledger } = fixture(t);
  const startsAt = new Date(Date.now() + 10 * 86_400_000), endsAt = new Date(startsAt.getTime() + 4 * 3_600_000);
  const original = await board.register(profile('expired-callout-original@example.test'));
  const admittedOriginal = board.admit(original.id, { reference: 'Contact checked' }, 'owner');
  const substitute = await board.register(profile('expired-callout-substitute@example.test'));
  const admittedSubstitute = board.admit(substitute.id, { reference: 'Contact checked' }, 'owner');
  const job = ledger.createIntake({ title: 'Expired call-out', city: 'Arnhem', client: { name: 'Client' },
    status: 'scheduled', scheduledStart: startsAt.toISOString(), scheduledEnd: endsAt.toISOString(), assignAutomatically: false });
  const assignment = ledger.addAssignment(job.id, { workerId: admittedOriginal.workerId, role: 'Carpenter', status: 'planned',
    scheduledStart: startsAt.toISOString(), scheduledEnd: endsAt.toISOString() });
  const unavailable = ledger.createWorkerAvailabilityPeriod(admittedOriginal.workerId, { periodType: 'unavailable',
    startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }, { actor: `field_worker:${admittedOriginal.workerId}` });
  const standby = ledger.createWorkerAvailabilityPeriod(admittedSubstitute.workerId, { periodType: 'standby',
    startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }, { actor: `field_worker:${admittedSubstitute.workerId}` });
  const callout = board.createStandbyCallout(job.id, assignment.id, { workerId: admittedSubstitute.workerId,
    standbyPeriodId: standby.period.id, availabilityPeriodId: unavailable.period.id,
    reason: 'This internal reason must not appear in the worker notice.',
    expiresAt: new Date(startsAt.getTime() - 60_000).toISOString() }, 'owner');
  ledger.db.prepare('UPDATE standby_callouts SET expires_at = ? WHERE id = ?').run(new Date(0).toISOString(), callout.id);

  assert.equal(board.workerStandbyCallouts(admittedSubstitute.workerId)[0].status, 'expired');
  const inbox = board.workerNotifications(substitute.id);
  const notice = inbox.notifications.find(item => item.sourceId === callout.id && item.title === 'Standby-oproep verlopen');
  assert.ok(notice);
  assert.match(notice.body, /reactietermijn is verstreken/);
  assert.equal(JSON.stringify(notice).includes('internal reason'), false);
  board.workerStandbyCallouts(admittedSubstitute.workerId);
  assert.equal(board.workerNotifications(substitute.id).notifications.filter(item => item.title === 'Standby-oproep verlopen').length, 1);
});

test('position offers require explicit worker response and place only after a fresh eligibility check', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Offered position', client: { name: 'Client' }, assignAutomatically: false });
  const applicant = await board.register(profile('position-offer@example.test'));
  const admitted = board.admit(applicant.id, { reference: 'Contact and trade checked' }, 'owner');
  const position = board.publish(job.id, { ...terms, entryKey: 'position-offer' }, 'owner');
  ledger.createWorkerAvailabilityPeriod(admitted.workerId, {
    periodType: 'standby', title: 'Beschikbaar op afroep', startsAt: position.startsAt, endsAt: position.endsAt
  }, { actor: `worker:${admitted.workerId}` });
  const interest = board.enroll(applicant.id, position.id, position.revision);
  assert.equal(interest.status, 'interested');
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 0);

  const offered = board.createPositionOffer(interest.id, { expiresAt: new Date(Date.now() + 3600000).toISOString() }, 'owner');
  assert.equal(offered.status, 'offer_pending');
  assert.equal(offered.offer.status, 'offered');
  const offerInbox = board.workerNotifications(applicant.id);
  assert.equal(offerInbox.unreadCount, 1);
  assert.equal(offerInbox.notifications[0].type, 'position_offer');
  assert.match(offerInbox.notifications[0].body, /8 uur/);
  assert.match(offerInbox.notifications[0].body, /Arnhem/);
  assert.equal(offerInbox.notifications[0].href, '/work-board.html#applications');
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 0, 'sending an offer does not create a placement');
  assert.throws(() => board.createPositionOffer(interest.id, { expiresAt: new Date(Date.now() + 7200000).toISOString() }, 'owner'), { statusCode: 409 });

  const declined = board.respondPositionOffer(applicant.id, interest.id, 'decline');
  assert.equal(declined.status, 'interested');
  assert.equal(declined.offer.status, 'declined');
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 0);
  const secondOffer = board.createPositionOffer(interest.id, { expiresAt: new Date(Date.now() + 3600000).toISOString() }, 'owner');
  assert.equal(secondOffer.status, 'offer_pending');
  const accepted = board.respondPositionOffer(applicant.id, interest.id, 'accept');
  assert.equal(accepted.status, 'assigned');
  assert.equal(accepted.offer.status, 'accepted');
  assert.ok(accepted.assignmentId);
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 1);
  assert.equal(ledger.diagnose().valid, true);
});

test('position offer acceptance rechecks worker availability before placement', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Rechecked offer', client: { name: 'Client' }, assignAutomatically: false });
  const applicant = await board.register(profile('position-offer-recheck@example.test'));
  const admitted = board.admit(applicant.id, { reference: 'Contact and trade checked' }, 'owner');
  const position = board.publish(job.id, { ...terms, entryKey: 'position-offer-recheck' }, 'owner');
  ledger.createWorkerAvailabilityPeriod(admitted.workerId, {
    periodType: 'standby', title: 'Beschikbaar op afroep', startsAt: position.startsAt, endsAt: position.endsAt
  }, { actor: `worker:${admitted.workerId}` });
  const interest = board.enroll(applicant.id, position.id, position.revision);
  board.createPositionOffer(interest.id, { expiresAt: new Date(Date.now() + 3600000).toISOString() }, 'owner');
  ledger.createWorkerAvailabilityPeriod(admitted.workerId, {
    periodType: 'unavailable', title: 'Niet beschikbaar', startsAt: position.startsAt, endsAt: position.endsAt
  }, { actor: `worker:${admitted.workerId}` });
  assert.throws(() => board.respondPositionOffer(applicant.id, interest.id, 'accept'), { statusCode: 409 });
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 0);
  assert.equal(board.applications(applicant.id)[0].offer.status, 'offered', 'failed acceptance remains available for a fresh decision');
});

test('work-board recovery view retains every affected shift when no standby replacement exists', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Outage without standby', client: { name: 'Client' }, assignAutomatically: false });
  const applicant = await board.register(profile('outage@example.test'));
  const admitted = board.admit(applicant.id, { reference: 'Contact checked' }, 'owner');
  const assignment = ledger.addAssignment(job.id, { workerId: admitted.workerId, role: 'Carpenter', status: 'planned',
    scheduledStart: terms.startsAt, scheduledEnd: terms.endsAt });
  const unavailable = ledger.createWorkerAvailabilityPeriod(admitted.workerId, {
    periodType: 'unavailable', title: 'Niet beschikbaar', startsAt: '2030-06-01T10:00:00Z', endsAt: '2030-06-01T14:00:00Z', source: 'field_worker_portal'
  }, { actor: `field_worker:${admitted.workerId}` });

  const [opportunity] = board.replacementOpportunities(job.id);
  assert.equal(opportunity.assignmentId, assignment.id);
  assert.equal(opportunity.availabilityPeriodId, unavailable.period.id);
  assert.equal(opportunity.availabilityStartsAt, unavailable.period.startsAt);
  assert.equal(opportunity.availabilityEndsAt, unavailable.period.endsAt);
  assert.equal(opportunity.availabilityReturnUnknown, false);
  assert.deepEqual(opportunity.candidates, []);
});

test('verified missing check-in flows into opted-in standby call-out and still requires replacement approval', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Automated cover test', city: 'Arnhem', client: { name: 'Client' }, assignAutomatically: false });
  const originalAccount = await board.register(profile('auto-standby-original@example.test'));
  const original = board.admit(originalAccount.id, { reference: 'Contact and trade checked' }, 'owner');
  const standbyAccount = await board.register(profile('auto-standby-worker@example.test'));
  const standbyWorker = board.admit(standbyAccount.id, { reference: 'Contact and trade checked' }, 'owner');
  const position = board.publish(job.id, { ...terms, entryKey: 'auto-standby', automaticStandbyCallouts: true }, 'owner');
  assert.equal(board.positions().find(item => item.id === position.id).automaticStandbyCallouts, undefined);
  assert.equal(board.positionsForApplication(position.id).automaticStandbyCallouts, undefined);
  const assigned = board.enroll(originalAccount.id, position.id, position.revision);
  assert.equal(assigned.status, 'assigned');
  const scheduledStart = new Date(Date.now() - 45 * 60_000).toISOString();
  const scheduledEnd = new Date(Date.now() + 6 * 60 * 60_000).toISOString();
  ledger.db.prepare("UPDATE jobs SET status = 'scheduled' WHERE id = ?").run(job.id);
  ledger.db.prepare("UPDATE assignments SET status = 'scheduled', scheduled_start = ?, scheduled_end = ? WHERE id = ?")
    .run(scheduledStart, scheduledEnd, assigned.assignmentId);
  const cycle = ledger.createDailyStartHuddle(job.id, {
    entryKey: 'auto-standby-missing-checkin-huddle', workDate: new Date().toISOString().slice(0, 10),
    facilitator: 'Site lead', leadWorkerId: original.workerId, workerIds: [original.workerId],
    plannedWork: 'Fit and inspect the scheduled door frames.',
    productionTarget: 'Complete and inspect the retained frame installation.', weather: 'clear',
    siteConditions: 'Keep the shared access route unobstructed.',
    safetyFocus: 'Use the agreed manual-handling controls.',
    qualityHoldPoints: ['Check each frame before fixing'],
    constraints: ['Confirm the opening dimensions before installation.'], evidenceReference: 'auto-standby-huddle'
  }, { actor: `field_worker:${original.workerId}` }).cycle;
  assert.equal(cycle.status, 'released');
  ledger.createWorkerAvailabilityPeriod(standbyWorker.workerId, {
    periodType: 'standby', startsAt: scheduledStart, endsAt: scheduledEnd
  }, { actor: `field_worker:${standbyWorker.workerId}` });
  const noticeBoundAccount = await board.register(profile('auto-standby-notice-bound@example.test'));
  const noticeBoundWorker = board.admit(noticeBoundAccount.id, { reference: 'Contact and trade checked' }, 'owner');
  ledger.createWorkerAvailabilityPeriod(noticeBoundWorker.workerId, {
    periodType: 'standby', startsAt: scheduledStart, endsAt: scheduledEnd, minimumNoticeHours: 1
  }, { actor: `field_worker:${noticeBoundWorker.workerId}` });
  const checkInWarning = ledger.nextActions().find(action => action.actionKind === 'worker_checkin_missing'
    && action.assignmentId === assigned.assignmentId);
  assert.ok(checkInWarning, 'the released huddle must produce a review, not assume absence');
  const absence = ledger.confirmMissingCheckinUnavailability(job.id, assigned.assignmentId, checkInWarning.sourceHash,
    { actor: 'office_operator:verified-contact' });
  assert.equal(absence.period.data.source, 'office_confirmed_missing_checkin');
  assert.equal(absence.period.data.sourceReferenceHash, checkInWarning.sourceHash);
  assert.deepEqual(board.standbyCalloutCandidates(job.id, assigned.assignmentId, { availabilityPeriodId: absence.period.id })
    .map(candidate => candidate.id), [standbyWorker.workerId], 'a worker requiring advance notice is not called after shift start');
  assert.equal(ledger.nextActions().some(action => action.actionKind === 'worker_checkin_missing'
    && action.assignmentId === assigned.assignmentId), false);

  const sweep = board.runStandbyCalloutSweep({ actor: 'test_scheduler' });
  assert.equal(sweep.offered, 1);
  assert.equal(sweep.reviewRequired, 0);
  const callout = board.workerStandbyCallouts(standbyWorker.workerId)[0];
  assert.equal(callout.status, 'offered');
  assert.equal(callout.availabilityPeriodId, absence.period.id);
  assert.ok(Date.parse(callout.expiresAt) >= Date.now() + 15 * 60_000);
  assert.ok(Date.parse(callout.expiresAt) <= Date.parse(scheduledEnd));
  assert.equal(JSON.stringify(callout).includes('office_confirmed_missing_checkin'), false);
  assert.equal(board.runStandbyCalloutSweep({ actor: 'test_scheduler' }).offered, 0, 'repeated cycles do not send another callout');
  assert.equal(board.standbyCalloutAutomationStatus(job.id, assigned.assignmentId, absence.period.id).status, 'waiting_for_response');

  board.respondToStandbyCallout(standbyWorker.workerId, callout.id, 'accept');
  const replacement = ledger.requestAssignmentReplacement(job.id, assigned.assignmentId, {
    workerId: standbyWorker.workerId, availabilityPeriodId: absence.period.id,
    standbyCalloutId: callout.id, reason: 'Accepted internal offer; owner reviewed the changed cover.'
  }, { actor: 'owner' });
  assert.equal(board.mapStandbyCallout(callout.id).status, 'pending_approval');
  assert.equal(board.standbyCalloutAutomationStatus(job.id, assigned.assignmentId, absence.period.id).status, 'replacement_pending');
  assert.equal(ledger.getJobDetail(job.id).assignments.find(item => item.id === assigned.assignmentId).status, 'scheduled');
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(replacement.approval.id).status, 'pending');
  ledger.db.prepare('UPDATE standby_callouts SET expires_at = ? WHERE id = ?').run(new Date(0).toISOString(), callout.id);
  const approved = ledger.resolveApproval(replacement.approval.id, {
    status: 'approved', resolvedBy: 'independent_approver', reason: 'Worker accepted the in-progress shift call-out and cover was rechecked.'
  });
  assert.equal(approved.status, 'approved');
  assert.equal(ledger.getJobDetail(job.id).assignments.find(item => item.id === assigned.assignmentId).status, 'released');
  assert.equal(board.mapStandbyCallout(callout.id).status, 'placed');
});

test('standby automation offers at most three distinct workers sequentially after decline or expiry', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Sequential standby cover', city: 'Arnhem', client: { name: 'Client' }, assignAutomatically: false });
  const originalAccount = await board.register(profile('sequential-original@example.test'));
  const original = board.admit(originalAccount.id, { reference: 'Contact and trade checked' }, 'owner');
  const position = board.publish(job.id, { ...terms, entryKey: 'sequential-standby', automaticStandbyCallouts: true }, 'owner');
  const assigned = board.enroll(originalAccount.id, position.id, position.revision);
  const candidates = [];
  for (let index = 1; index <= 3; index += 1) {
    const account = await board.register(profile(`sequential-standby-${index}@example.test`));
    const worker = board.admit(account.id, { reference: 'Contact and trade checked' }, 'owner');
    candidates.push({ account, worker });
    ledger.createWorkerAvailabilityPeriod(worker.workerId, { periodType: 'standby',
      startsAt: position.startsAt, endsAt: position.endsAt }, { actor: `field_worker:${worker.workerId}` });
  }
  const absence = ledger.createWorkerAvailabilityPeriod(original.workerId, { periodType: 'unavailable',
    startsAt: position.startsAt, endsAt: position.endsAt }, { actor: `field_worker:${original.workerId}` });

  assert.equal(board.runStandbyCalloutSweep().offered, 1);
  const first = ledger.db.prepare("SELECT id, worker_id FROM standby_callouts WHERE assignment_id = ? AND status = 'offered'").get(assigned.assignmentId);
  assert.ok(first);
  board.respondToStandbyCallout(first.worker_id, first.id, 'decline');
  assert.equal(board.runStandbyCalloutSweep().offered, 1);
  const second = ledger.db.prepare("SELECT id, worker_id FROM standby_callouts WHERE assignment_id = ? AND status = 'offered'").get(assigned.assignmentId);
  assert.ok(second);

  ledger.db.prepare('UPDATE standby_callouts SET expires_at = ? WHERE id = ?').run(new Date(0).toISOString(), second.id);
  const thirdSweep = board.runStandbyCalloutSweep();
  assert.equal(thirdSweep.expired, 1);
  assert.equal(thirdSweep.offered, 1);
  assert.equal(board.mapStandbyCallout(second.id).status, 'expired');
  const secondCandidate = candidates.find(candidate => candidate.worker.workerId === second.worker_id);
  assert.ok(board.workerNotifications(secondCandidate.account.id).notifications.some(item => item.sourceId === second.id
    && item.title === 'Standby-oproep verlopen'));
  const third = ledger.db.prepare("SELECT id, worker_id FROM standby_callouts WHERE assignment_id = ? AND status = 'offered'").get(assigned.assignmentId);
  assert.ok(third);
  board.respondToStandbyCallout(third.worker_id, third.id, 'decline');

  const exhausted = board.runStandbyCalloutSweep();
  assert.equal(exhausted.offered, 0);
  assert.equal(exhausted.reviewRequired, 1);
  assert.equal(board.standbyCalloutAutomationStatus(job.id, assigned.assignmentId, absence.period.id).status, 'owner_review');
  assert.equal(ledger.db.prepare('SELECT COUNT(*) AS count FROM standby_callouts WHERE assignment_id = ?').get(assigned.assignmentId).count, 3);
  assert.equal(ledger.getJobDetail(job.id).assignments.find(item => item.id === assigned.assignmentId).status, 'planned');
  assert.equal(ledger.db.prepare('SELECT COUNT(*) AS count FROM assignments WHERE job_id = ?').get(job.id).count, 1);
});

test('standby automation does not overbook one worker with overlapping offers across jobs', async t => {
  const { board, ledger } = fixture(t);
  const substituteAccount = await board.register(profile('overlap-standby@example.test'));
  const substitute = board.admit(substituteAccount.id, { reference: 'Contact and trade checked' }, 'owner');
  const standbyPosition = ledger.createWorkerAvailabilityPeriod(substitute.workerId, {
    periodType: 'standby', startsAt: terms.startsAt, endsAt: terms.endsAt
  }, { actor: `field_worker:${substitute.workerId}` });
  const affected = [];
  for (const suffix of ['one', 'two']) {
    const job = ledger.createIntake({ title: `Overlapping assignment ${suffix}`, city: 'Arnhem', client: { name: 'Client' }, assignAutomatically: false });
    const originalAccount = await board.register(profile(`overlap-original-${suffix}@example.test`));
    const original = board.admit(originalAccount.id, { reference: 'Contact and trade checked' }, 'owner');
    const position = board.publish(job.id, { ...terms, entryKey: `overlap-${suffix}`, automaticStandbyCallouts: true }, 'owner');
    const application = board.enroll(originalAccount.id, position.id, position.revision);
    const absence = ledger.createWorkerAvailabilityPeriod(original.workerId, {
      periodType: 'unavailable', startsAt: position.startsAt, endsAt: position.endsAt
    }, { actor: `field_worker:${original.workerId}` });
    affected.push({ job, assignmentId: application.assignmentId, absence });
  }

  const result = board.runStandbyCalloutSweep({ actor: 'test_scheduler' });
  assert.equal(result.offered, 1);
  assert.equal(board.workerStandbyCallouts(substitute.workerId).filter(callout => callout.status === 'offered').length, 1);
  const offered = board.workerStandbyCallouts(substitute.workerId).find(callout => callout.status === 'offered');
  assert.equal(offered.standbyPeriodId, standbyPosition.period.id);
  assert.equal(board.respondToStandbyCallout(substitute.workerId, offered.id, 'accept').status, 'accepted');
  assert.equal(affected.length, 2);
});

test('registration requires owner admission and does not expose password hashes', async t => {
  const { board } = fixture(t);
  const account = await board.register(profile());
  assert.equal(account.status, 'pending');
  assert.equal(JSON.stringify(account).includes('password'), false);
  await assert.rejects(board.login({ email: account.email, password: 'incorrect' }), { statusCode: 401 });
  const signedIn = await board.login(profile());
  assert.equal(board.authenticate(signedIn.token).id, account.id);
  assert.throws(() => board.admit(account.id, { reference: '' }, 'owner'), { statusCode: 400 });
  const admitted = board.admit(account.id, { reference: 'Identity and contact reviewed in person' }, 'owner');
  assert.equal(admitted.status, 'admitted');
  assert.ok(admitted.workerId);
  assert.equal(board.authenticate(signedIn.token).status, 'admitted');
  board.suspend(account.id, 'owner');
  assert.throws(() => board.authenticate(signedIn.token), { statusCode: 401 });
  board.admit(account.id, { reference: 'Admission reviewed again' }, 'owner');
  assert.throws(() => board.authenticate(signedIn.token), { statusCode: 401 });
  assert.equal(Object.hasOwn((await board.login(profile())).account, 'admission'), false);
});

test('worker portal sessions survive ledger restarts and remain hash-only and revocable', async t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-board-session-'));
  const dbFile = path.join(dir, 'ledger.sqlite');
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const firstLedger = new ContractorOperatingLedger({ dbFile });
  const firstBoard = new WorkBoard(firstLedger);
  const account = await firstBoard.register(profile('durable-session@example.test'));
  const session = await firstBoard.login(profile('durable-session@example.test'));
  const sessionRecord = firstLedger.db.prepare('SELECT * FROM work_board_sessions').get();
  assert.ok(sessionRecord.token_hash);
  assert.equal(sessionRecord.token_hash.includes(session.token), false);
  assert.equal(sessionRecord.account_id, account.id);
  assert.equal(firstLedger.migrationStatus().currentVersion, '096_loading_read_indexes');
  firstLedger.close();

  const restartedLedger = new ContractorOperatingLedger({ dbFile });
  const restartedBoard = new WorkBoard(restartedLedger);
  assert.equal(restartedBoard.authenticate(session.token).id, account.id);
  assert.equal(restartedBoard.logout(session.token), true);
  assert.throws(() => restartedBoard.authenticate(session.token), { statusCode: 401 });
  assert.equal(restartedLedger.db.prepare('SELECT revocation_reason FROM work_board_sessions WHERE token_hash = ?')
    .get(require('node:crypto').createHash('sha256').update(session.token).digest('hex')).revocation_reason, 'worker_logout');
  restartedLedger.close();
});

test('field-reply notification migration preserves existing inbox records', t => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'work-board-reply-migration-'));
  const dbFile = path.join(dir, 'ledger.sqlite');
  let upgraded;
  t.after(() => { upgraded?.close(); fs.rmSync(dir, { recursive: true, force: true }); });
  const first = new ContractorOperatingLedger({ dbFile });
  const worker = first.upsertWorker({ id: 'migration-worker', name: 'Field worker', role: 'Carpenter', status: 'available' });
  const job = first.createIntake({ title: 'Migration inbox', client: { name: 'Client' }, assignAutomatically: false });
  first.db.exec(`DROP INDEX idx_work_board_notifications_worker_created;
    DROP INDEX idx_work_board_notifications_worker_unread;
    DROP TABLE work_board_notifications;
    CREATE TABLE work_board_notifications (
      id TEXT PRIMARY KEY, worker_id TEXT NOT NULL REFERENCES workers(id),
      job_id TEXT REFERENCES jobs(id) ON DELETE SET NULL,
      notification_type TEXT NOT NULL CHECK(notification_type IN ('standby_callout', 'position_offer', 'position_assigned')),
      source_id TEXT NOT NULL, source_hash TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL,
      href TEXT NOT NULL, created_at TEXT NOT NULL, read_at TEXT,
      UNIQUE(worker_id, notification_type, source_id, source_hash)
    );
    DELETE FROM ledger_schema_migrations WHERE version = '095_field_reply_notifications';`);
  first.db.prepare(`INSERT INTO work_board_notifications
    (id, worker_id, job_id, notification_type, source_id, source_hash, title, body, href, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run('legacy-notice', worker.id, job.id, 'position_assigned', 'legacy-source', 'legacy-hash', 'Bestaande melding', 'Bestaande tekst', '/work-board.html', '2026-09-01T00:00:00.000Z');
  first.close();

  upgraded = new ContractorOperatingLedger({ dbFile });
  const board = new WorkBoard(upgraded);
  assert.equal(board.workerNotificationsForWorker(worker.id).notifications[0].id, 'legacy-notice');
  board.notifyWorker({ workerId: worker.id, jobId: job.id, type: 'field_reply', sourceId: 'migration-rfi', sourceVersion: 'approved-answer', title: 'Antwoord op je werkvraag', body: 'Gebruik revisie B.', href: '/work-board.html#applications' });
  assert.equal(board.workerNotificationsForWorker(worker.id).notifications.length, 2);
  assert.equal(upgraded.migrationStatus().currentVersion, '096_loading_read_indexes');
});

test('workers can withdraw open interest but cannot silently cancel an existing placement', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Worker controlled interest', client: { name: 'Client' }, assignAutomatically: false });
  const applicant = await board.register(profile());
  const position = board.publish(job.id, { ...terms, entryKey: 'withdraw-interest-position' }, 'owner');
  const interest = board.enroll(applicant.id, position.id, position.revision);
  const withdrawn = board.withdrawInterest(applicant.id, interest.id);
  assert.equal(withdrawn.status, 'withdrawn');
  assert.equal(withdrawn.assignmentId, null);
  assert.equal(board.position(position.id).filled, 0);
  assert.equal(board.withdrawInterest(applicant.id, interest.id).status, 'withdrawn');
  assert.equal(ledger.listAudit({ entityType: 'work_board_application', entityId: interest.id, limit: 10 })
    .filter(event => event.action === 'withdraw_worker_interest').length, 1);
  assert.throws(() => board.withdrawInterest('another-account', interest.id), { statusCode: 404 });
  assert.equal(board.enroll(applicant.id, position.id, position.revision).status, 'interested');

  board.admit(applicant.id, { reference: 'Contact and trade checked' }, 'owner');
  const assignedPosition = board.publish(job.id, { ...terms, entryKey: 'withdraw-assigned-position' }, 'owner');
  const assigned = board.enroll(applicant.id, assignedPosition.id, assignedPosition.revision);
  assert.equal(assigned.status, 'assigned');
  assert.throws(() => board.withdrawInterest(applicant.id, assigned.id), { statusCode: 409 });
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 1);
  assert.equal(ledger.diagnose().valid, true);
});

test('full positions keep an ordered, withdrawable waitlist that can fill a released place', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Waitlist work', client: { name: 'Client' }, assignAutomatically: false });
  const position = board.publish(job.id, terms, 'owner');
  const first = await board.register(profile('first-waitlist@example.test'));
  board.admit(first.id, { reference: 'Contact and trade checked' }, 'owner');
  const placed = board.enroll(first.id, position.id, position.revision);
  assert.equal(placed.status, 'assigned');

  const second = await board.register(profile('second-waitlist@example.test'));
  const third = await board.register(profile('third-waitlist@example.test'));
  const secondEntry = board.enroll(second.id, position.id, position.revision);
  const thirdEntry = board.enroll(third.id, position.id, position.revision);
  assert.equal(secondEntry.status, 'waitlisted');
  assert.equal(secondEntry.waitlistPosition, 1);
  assert.equal(thirdEntry.waitlistPosition, 2);
  assert.equal(board.position(position.id).filled, 1);
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 1);

  board.withdrawInterest(second.id, secondEntry.id);
  assert.equal(board.applicationRecord(ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(thirdEntry.id)).waitlistPosition, 1);
  board.admit(third.id, { reference: 'Contact and trade checked' }, 'owner');
  ledger.releaseAssignment(job.id, placed.assignmentId, { status: 'cancelled', reason: 'Worker became unavailable' }, { actor: 'owner' });
  assert.equal(board.position(position.id).filled, 0);
  assert.throws(() => board.confirmApplication(thirdEntry.id), { statusCode: 409 });
  board.createPositionOffer(thirdEntry.id, { expiresAt: new Date(Date.now() + 3600000).toISOString() }, 'owner');
  const confirmed = board.respondPositionOffer(third.id, thirdEntry.id, 'accept');
  assert.equal(confirmed.status, 'assigned');
  assert.equal(board.position(position.id).filled, 1);
  assert.equal(ledger.listAudit({ entityType: 'work_board_application', entityId: thirdEntry.id, limit: 10 })
    .some(event => event.action === 'confirm_waitlist_placement'), true);
  assert.equal(ledger.listAudit({ entityType: 'work_board_position_offer', jobId: job.id, limit: 10 })
    .some(event => event.action === 'accept_position_offer' && event.actor === `worker:${third.id}`), true);
  assert.equal(ledger.diagnose().valid, true);
});

test('opt-in waitlist automation offers one expiring place to the oldest eligible worker only', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Automatic waitlist work', client: { name: 'Client' }, assignAutomatically: false });
  const position = board.publish(job.id, { ...terms, entryKey: 'automatic-waitlist', waitlistOfferPolicy: 'automatic_once' }, 'owner');
  assert.equal(Object.hasOwn(board.positions().find(item => item.id === position.id), 'waitlistOfferPolicy'), false);
  assert.equal(board.positions({ jobId: job.id, office: true }).find(item => item.id === position.id).waitlistAutomation.status, 'waiting_for_applicants');
  const incumbent = await board.register(profile('incumbent@example.test'));
  board.admit(incumbent.id, { reference: 'Checked' }, 'owner');
  const assignment = board.enroll(incumbent.id, position.id, position.revision);
  const first = await board.register(profile('first-auto-waitlist@example.test'));
  const second = await board.register(profile('second-auto-waitlist@example.test'));
  board.admit(first.id, { reference: 'Checked' }, 'owner');
  board.admit(second.id, { reference: 'Checked' }, 'owner');
  const firstEntry = board.enroll(first.id, position.id, position.revision);
  const secondEntry = board.enroll(second.id, position.id, position.revision);
  assert.equal(board.offerNextWaitlisted(position.id).status, 'waiting_for_vacancy');
  ledger.releaseAssignment(job.id, assignment.assignmentId, { status: 'cancelled', reason: 'Worker became unavailable' }, { actor: 'owner' });

  const sweep = board.runWaitlistOfferSweep();
  assert.equal(sweep.offered, 1);
  assert.equal(board.applicationRecord(ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(firstEntry.id)).status, 'offer_pending');
  assert.equal(board.applicationRecord(ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(secondEntry.id)).status, 'waitlisted');
  assert.equal(board.runWaitlistOfferSweep().offered, 0);
  assert.equal(board.waitlistAutomationStatus(board.position(position.id)).status, 'waiting_for_response');

  board.respondPositionOffer(first.id, firstEntry.id, 'decline');
  assert.equal(board.runWaitlistOfferSweep().offered, 0);
  assert.equal(board.waitlistAutomationStatus(board.position(position.id)).status, 'owner_review');
  assert.equal(board.applicationRecord(ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(secondEntry.id)).status, 'waitlisted');
  assert.equal(ledger.diagnose().valid, true);
});

test('automatic waitlist offers stop for an ineligible first candidate and stay opt-in', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Reviewed waitlist work', client: { name: 'Client' }, assignAutomatically: false });
  const manual = board.publish(job.id, { ...terms, entryKey: 'manual-waitlist' }, 'owner');
  assert.equal(manual.waitlistOfferPolicy, 'manual');
  assert.equal(board.offerNextWaitlisted(manual.id).status, 'manual');
  const position = board.publish(job.id, { ...terms, entryKey: 'automatic-waitlist-review', waitlistOfferPolicy: 'automatic_once' }, 'owner');
  const incumbent = await board.register(profile('review-incumbent@example.test'));
  board.admit(incumbent.id, { reference: 'Checked' }, 'owner');
  const assignment = board.enroll(incumbent.id, position.id, position.revision);
  const first = await board.register(profile('not-admitted@example.test'));
  const second = await board.register(profile('admitted-behind@example.test'));
  board.admit(second.id, { reference: 'Checked' }, 'owner');
  board.enroll(first.id, position.id, position.revision);
  const secondEntry = board.enroll(second.id, position.id, position.revision);
  ledger.releaseAssignment(job.id, assignment.assignmentId, { status: 'cancelled', reason: 'Worker became unavailable' }, { actor: 'owner' });
  const result = board.offerNextWaitlisted(position.id);
  assert.equal(result.status, 'owner_review');
  assert.match(result.reason, /eerst door de aannemer worden toegelaten/);
  assert.equal(board.applicationRecord(ledger.db.prepare('SELECT * FROM work_board_applications WHERE id = ?').get(secondEntry.id)).status, 'waitlisted');
});

test('mandatory credentials and inactive jobs block self-placement without any assignment', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Qualified work', client: { name: 'Client' }, assignAutomatically: false });
  const applicant = await board.register(profile());
  board.admit(applicant.id, { reference: 'Contact verified' }, 'owner');
  ledger.createQualificationRequirement(job.id, { credentialType: 'vca', title: 'Current VCA', role: 'Carpenter' });
  const position = board.publish(job.id, terms, 'owner');
  const eligibility = board.enrollmentCheck(applicant.id, position.id);
  assert.equal(eligibility.canApply, false);
  assert.match(eligibility.blockers.join(' '), /Current VCA ontbreekt/);
  assert.throws(() => board.enroll(applicant.id, position.id, position.revision), { statusCode: 409 });
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 0);
  board.close(position.id, 'owner');
  assert.throws(() => board.enroll(applicant.id, position.id, position.revision), { statusCode: 409 });
  assert.throws(() => board.publish(job.id, { ...terms, entryKey: 'invalid', hours: 9 }, 'owner'), { statusCode: 400 });
});

test('backup verification checks the new schema and persisted accounts survive a service replacement', async t => {
  const { board, ledger } = fixture(t);
  const account = await board.register(profile());
  const replacement = new WorkBoard(ledger);
  assert.equal((await replacement.login(profile())).account.id, account.id);
  assert.equal(ledger.migrationStatus().currentVersion, '096_loading_read_indexes');
  const { verifySqliteBackupDatabase } = require('../scripts/restore-local-backup');
  assert.equal(verifySqliteBackupDatabase(ledger.dbFile).valid, true);
});

test('position reads fail closed after stored terms are changed', t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Terms verification', client: { name: 'Client' }, assignAutomatically: false });
  const position = board.publish(job.id, terms, 'owner');
  const row = ledger.db.prepare('SELECT data_json FROM work_board_positions WHERE id = ?').get(position.id);
  const data = JSON.parse(row.data_json);
  data.rate = 999;
  ledger.db.prepare('UPDATE work_board_positions SET data_json = ? WHERE id = ?').run(JSON.stringify(data), position.id);
  assert.throws(() => board.position(position.id), { statusCode: 409 });
});

test('revoked worker skills block new placement despite the original application profile', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Current skills', client: { name: 'Client' }, assignAutomatically: false });
  const applicant = await board.register(profile());
  const admitted = board.admit(applicant.id, { reference: 'Contact checked' }, 'owner');
  const position = board.publish(job.id, terms, 'owner');
  ledger.upsertWorker({ id: admitted.workerId, skills: ['Painter'] }, { actor: 'owner' });
  assert.throws(() => board.enroll(applicant.id, position.id, position.revision), { statusCode: 409 });
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 0);
});

test('material-linked positions collect interest but block placement until full verified receipt', async t => {
  const { board, ledger } = fixture(t);
  const job = ledger.createIntake({ title: 'Material controlled work', client: { name: 'Client' }, assignAutomatically: false });
  const material = ledger.addMaterialRequirement(job.id, { name: 'Roof membrane', quantity: 10, unit: 'm2' });
  const task = ledger.addTask(job.id, { title: 'Install roof membrane', durationHours: 8, materialRequirementIds: [material.id] });
  const applicant = await board.register(profile());
  board.admit(applicant.id, { reference: 'Contact and trade checked' }, 'owner');
  const position = board.publish(job.id, { ...terms, entryKey: 'material-controlled-position', title: task.title,
    materials: 'Roof membrane: 10 m2; delivery to be verified', sourceTaskIds: [task.id] }, 'owner');

  assert.equal(board.positions().find(item => item.id === position.id).materialsReady, false);
  const interest = board.enroll(applicant.id, position.id, position.revision);
  assert.equal(interest.status, 'interested');
  assert.equal(interest.holdReason, 'materials_or_source');
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 0);
  assert.throws(() => board.confirmApplication(interest.id), { statusCode: 409 });
  assert.throws(() => board.createPositionOffer(interest.id, { expiresAt: new Date(Date.now() + 3600000).toISOString() }, 'owner'), { statusCode: 409 });

  ledger.updateMaterialRequirementStatus(job.id, material.id, {
    status: 'received', notes: 'Partial delivery checked on site.', verificationReference: 'delivery-note-17', availableQuantity: 6
  }, { actor: 'site-manager' });
  assert.throws(() => board.createPositionOffer(interest.id, { expiresAt: new Date(Date.now() + 3600000).toISOString() }, 'owner'), { statusCode: 409 });
  assert.equal(board.jobApplications(job.id)[0].readiness.ready, false);

  ledger.updateMaterialRequirementStatus(job.id, material.id, {
    status: 'received', notes: 'Remaining delivery checked on site.', verificationReference: 'delivery-note-18', availableQuantity: 10
  }, { actor: 'site-manager' });
  assert.equal(board.jobApplications(job.id)[0].readiness.ready, true);
  assert.throws(() => board.confirmApplication(interest.id), { statusCode: 409 });
  board.createPositionOffer(interest.id, { expiresAt: new Date(Date.now() + 3600000).toISOString() }, 'owner');
  const placed = board.respondPositionOffer(applicant.id, interest.id, 'accept');
  assert.equal(placed.status, 'assigned');
  assert.ok(placed.assignmentId);
  assert.equal(board.confirmApplication(interest.id).assignmentId, placed.assignmentId);
  assert.equal(ledger.getJobDetail(job.id).assignments.length, 1);
});
