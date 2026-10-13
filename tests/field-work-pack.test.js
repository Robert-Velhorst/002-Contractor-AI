const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { FieldWorkPack } = require('../field-work-pack');
const { ClientConversation, hash } = require('../client-conversation');

test('offline drawing downloads bind the assigned worker to a current approved checksummed PDF', t => {
  const { ledger, service, job, worker, other } = fixture(t);
  const pdf = ledger.addDocument(job.id, { type: 'drawing', filename: 'detail.pdf', mimeType: 'application/pdf', sizeBytes: 100,
    storageRef: 'private/detail.pdf', data: { contentHash: 'a'.repeat(64) } });
  const drawing = ledger.createDrawingRevision(job.id, { entryKey: 'offline-drawing-001', sourceDocumentId: pdf.id,
    sheetNumber: 'A-01', revision: 'A', title: 'Opening detail', issueDate: '2026-01-01', revisionReason: 'First issue' });
  assert.throws(() => service.drawingFile(job.id, worker.id, drawing.id), { statusCode: 409 });
  ledger.resolveApproval(drawing.approval.id, { status: 'approved' });
  const pack = service.read(job.id, worker.id);
  assert.equal(pack.know.drawings[0].file.sha256, 'a'.repeat(64));
  assert.equal(JSON.stringify(pack).includes('private/detail.pdf'), false);
  assert.equal(service.drawingFile(job.id, worker.id, drawing.id, pack.sourceHash).sha256, 'a'.repeat(64));
  assert.throws(() => service.drawingFile(job.id, other.id, drawing.id, pack.sourceHash), { statusCode: 403 });
  assert.throws(() => service.drawingFile(job.id, worker.id, drawing.id, 'b'.repeat(64)), { statusCode: 409 });
  ledger.db.prepare("UPDATE assignments SET status = 'cancelled' WHERE job_id = ? AND worker_id = ?").run(job.id, worker.id);
  assert.throws(() => service.drawingFile(job.id, worker.id, drawing.id, pack.sourceHash), { statusCode: 403 });
});

test('a position-scoped work pack includes only drawings linked to its visible tasks', t => {
  const { ledger, service, worker, job } = fixture(t);
  const selectedTask = job.tasks[0];
  const unrelatedTask = ledger.addTask(job.id, { title: 'Install electrical panel' });
  const assignment = ledger.db.prepare('SELECT id, data_json FROM assignments WHERE job_id = ? AND worker_id = ?').get(job.id, worker.id);
  ledger.db.prepare('UPDATE assignments SET data_json = ? WHERE id = ?')
    .run(JSON.stringify({ ...JSON.parse(assignment.data_json), workBoardPositionId: 'position-drawing-scope', workBoardTaskIds: [selectedTask.id] }), assignment.id);

  function addDrawing(suffix, sheetNumber, linkedTaskIds) {
    const pdf = ledger.addDocument(job.id, { type: 'drawing', filename: `${suffix}.pdf`, mimeType: 'application/pdf', size: 100,
      storageRef: `private/${suffix}.pdf`, data: { contentHash: 'c'.repeat(64) } });
    const revision = ledger.createDrawingRevision(job.id, { entryKey: `pack-drawing-${suffix}`, sourceDocumentId: pdf.id,
      sheetNumber, revision: 'A', title: `${suffix} detail`, issueDate: '2026-01-01', revisionReason: 'Approved work detail', linkedTaskIds });
    ledger.resolveApproval(revision.approval.id, { status: 'approved' });
    return revision;
  }

  const selectedDrawing = addDrawing('selected-task', 'A-11', [selectedTask.id]);
  const unrelatedDrawing = addDrawing('other-task', 'A-12', [unrelatedTask.id]);
  const wholeJobDrawing = addDrawing('whole-job', 'A-13', []);
  const pack = service.read(job.id, worker.id);
  assert.deepEqual(pack.do.map(task => task.id), [selectedTask.id]);
  assert.deepEqual(pack.know.drawings.map(drawing => drawing.id), [selectedDrawing.id]);
  const selectedRecord = ledger.getDrawingRevision(selectedDrawing.id, { jobId: job.id });
  assert.equal(selectedRecord.current, true);
  assert.equal(selectedRecord.integrityValid, true);
  assert.equal(selectedRecord.mimeType, 'application/pdf');
  assert.ok(selectedRecord.sizeBytes > 0);
  assert.match(selectedRecord.data.sourceDocumentChecksum, /^[a-f0-9]{64}$/);
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(selectedRecord.approvalId).status, 'approved');
  assert.equal(service.drawingFile(job.id, worker.id, selectedDrawing.id, pack.sourceHash).document.id, selectedDrawing.id);
  assert.throws(() => service.drawingFile(job.id, worker.id, unrelatedDrawing.id), error => error.statusCode === 404);
  assert.throws(() => service.drawingFile(job.id, worker.id, wholeJobDrawing.id), error => error.statusCode === 404);
});

test('a position-scoped work pack exposes only approved task submittals and their bound same-job PDFs', t => {
  const { ledger, service, worker, job } = fixture(t);
  const selectedTask = job.tasks[0];
  const unrelatedTask = ledger.addTask(job.id, { title: 'Install electrical panel' });
  const assignment = ledger.db.prepare('SELECT id, data_json FROM assignments WHERE job_id = ? AND worker_id = ?').get(job.id, worker.id);
  ledger.db.prepare('UPDATE assignments SET data_json = ? WHERE id = ?')
    .run(JSON.stringify({ ...JSON.parse(assignment.data_json), workBoardPositionId: 'position-submittal-scope', workBoardTaskIds: [selectedTask.id] }), assignment.id);
  const digest = 'd'.repeat(64);
  const document = ledger.addDocument(job.id, { type: 'submittal', filename: 'approved-specification.pdf', mimeType: 'application/pdf', sizeBytes: 128,
    storageRef: 'private/approved-specification.pdf', data: { contentHash: digest } });
  const selected = ledger.createSubmittalRecord(job.id, { title: 'Window specification', packageName: 'Windows', status: 'approved',
    taskIds: [selectedTask.id], attachments: [document.id] });
  assert.deepEqual(selected.approval.data.attachmentManifest, [{ id: document.id, filename: 'approved-specification.pdf', mimeType: 'application/pdf', sizeBytes: 128, sha256: digest }]);
  ledger.resolveApproval(selected.approval.id, { status: 'approved', reason: 'Specification checked.' });
  const peerDocument = ledger.addDocument(job.id, { type: 'submittal', filename: 'peer-specification.pdf', mimeType: 'application/pdf', sizeBytes: 128,
    storageRef: 'private/peer-specification.pdf', data: { contentHash: 'e'.repeat(64) } });
  const peerTask = ledger.createSubmittalRecord(job.id, { title: 'Electrical specification', status: 'approved',
    taskIds: [unrelatedTask.id], attachments: [peerDocument.id] });
  ledger.resolveApproval(peerTask.approval.id, { status: 'approved', reason: 'Peer task.' });
  const pending = ledger.createSubmittalRecord(job.id, { title: 'Pending option', status: 'approved', taskIds: [selectedTask.id] });

  const pack = service.read(job.id, worker.id);
  assert.deepEqual(pack.know.submittals.map(item => item.id), [selected.id]);
  assert.deepEqual(pack.know.submittals[0].taskIds, [selectedTask.id]);
  assert.deepEqual(pack.know.submittals[0].attachments.map(file => file.id), [document.id]);
  assert.equal(JSON.stringify(pack).includes('private/approved-specification.pdf'), false);
  assert.equal(service.submittalFile(job.id, worker.id, selected.id, document.id, pack.sourceHash).sha256, digest);
  assert.throws(() => service.submittalFile(job.id, worker.id, peerTask.id, peerDocument.id, pack.sourceHash), { statusCode: 404 });
  assert.throws(() => service.submittalFile(job.id, worker.id, selected.id, document.id, 'f'.repeat(64)), { statusCode: 409 });
  assert.equal(pack.know.submittals.some(item => item.id === pending.id), false);

  ledger.db.prepare('UPDATE submittal_records SET attachments_json = ? WHERE id = ?').run(JSON.stringify([peerDocument.id]), selected.id);
  const tampered = service.read(job.id, worker.id);
  assert.equal(tampered.know.submittals.some(item => item.id === selected.id), false);
  assert.throws(() => service.submittalFile(job.id, worker.id, selected.id, document.id, pack.sourceHash), { statusCode: 409 });
});

test('submittal approval rejects a PDF whose retained digest changes while approval is pending', t => {
  const { ledger, job } = fixture(t);
  const task = job.tasks[0];
  const document = ledger.addDocument(job.id, { type: 'submittal', filename: 'pending-specification.pdf', mimeType: 'application/pdf', sizeBytes: 128,
    storageRef: 'private/pending-specification.pdf', data: { contentHash: 'a'.repeat(64) } });
  const submittal = ledger.createSubmittalRecord(job.id, { title: 'Pending specification', status: 'draft', taskIds: [task.id] });
  const transition = ledger.transitionLifecycleRecord(job.id, 'submittal', submittal.id, { status: 'approved', notes: 'Checked specification.', attachments: [document.id] });
  assert.deepEqual(transition.approval.data.attachmentManifest[0].sha256, 'a'.repeat(64));
  ledger.db.prepare('UPDATE documents SET data_json = ? WHERE id = ?').run(JSON.stringify({ contentHash: 'b'.repeat(64) }), document.id);
  assert.throws(() => ledger.resolveApproval(transition.approval.id, { status: 'approved', reason: 'Approved after review.' }),
    error => error.code === 'submittal_approval_documents_changed' && error.statusCode === 409);
  assert.equal(ledger.db.prepare('SELECT status FROM approvals WHERE id = ?').get(transition.approval.id).status, 'pending');
});

test('a position-scoped work pack includes only active equipment reservations linked to visible tasks', t => {
  const { ledger, service, worker, job } = fixture(t);
  const selectedTask = job.tasks[0];
  const unrelatedTask = ledger.addTask(job.id, { title: 'Install electrical panel' });
  const assignment = ledger.db.prepare('SELECT id, data_json FROM assignments WHERE job_id = ? AND worker_id = ?').get(job.id, worker.id);
  ledger.db.prepare('UPDATE assignments SET data_json = ? WHERE id = ?')
    .run(JSON.stringify({ ...JSON.parse(assignment.data_json), workBoardPositionId: 'position-equipment-scope', workBoardTaskIds: [selectedTask.id] }), assignment.id);
  const window = {
    neededFrom: new Date(Date.now() + 60 * 60_000).toISOString(),
    neededUntil: new Date(Date.now() + 4 * 60 * 60_000).toISOString()
  };
  const reserve = (toolName, taskId, toolId) => ledger.reserveTool(job.id, { toolName, taskId, toolId, ...window });
  const selectedTool = ledger.upsertTool({ name: 'Selected task laser level', category: 'measurement', status: 'available' });
  const selectedReservation = reserve(selectedTool.name, selectedTask.id, selectedTool.id);
  const otherWorker = ledger.upsertWorker({ name: 'Peer tool operator', role: 'Carpenter', status: 'available' });
  ledger.addAssignment(job.id, { workerId: otherWorker.id, role: 'Carpenter', status: 'assigned' });
  const peerTool = ledger.upsertTool({ name: 'Peer task mixer', category: 'mixing', status: 'available' });
  const peerReservation = reserve(peerTool.name, selectedTask.id, peerTool.id);
  reserve('Other task cable tester', unrelatedTask.id);
  reserve('Unlinked site generator', undefined);
  const releasedReservation = reserve('Returned task mixer', selectedTask.id);
  ledger.releaseToolReservation(job.id, releasedReservation.id, { status: 'returned', reason: 'Returned to the depot.' });
  const checkedOutAt = new Date(Date.now() - 60_000).toISOString();
  const dueBackAt = new Date(Date.now() + 3 * 60 * 60_000).toISOString();
  for (const [reservation, custodian, entryKey] of [
    [selectedReservation, worker, 'position-scope-own-tool'],
    [peerReservation, otherWorker, 'position-scope-peer-tool']
  ]) {
    ledger.checkoutEquipment(job.id, {
      reservationId: reservation.id,
      workerId: custodian.id,
      checkedOutAt,
      dueBackAt,
      checkedOutBy: custodian.name,
      condition: 'good',
      location: 'Project gate',
      evidenceReference: `handoff:${entryKey}`,
      entryKey
    });
  }

  const pack = service.read(job.id, worker.id);
  assert.deepEqual(pack.have.equipment.map(item => item.id), [selectedReservation.id, peerReservation.id]);
  assert.equal(pack.have.equipment[0].taskTitle, selectedTask.title);
  assert.deepEqual(pack.have.equipment[0].custody, { status: 'checked_out', dueBackAt, heldByYou: true });
  assert.deepEqual(pack.have.equipment[1].custody, { status: 'checked_out', dueBackAt, heldByYou: false });
  assert.equal(JSON.stringify(pack.have.equipment).includes(otherWorker.name), false);
  assert.equal(JSON.stringify(pack.have.equipment).includes(otherWorker.id), false);
});

test('supervised work shows its named lead and blocks release until that lead is qualified, assigned and on site', t => {
  const { ledger, service, worker, job } = fixture(t);
  const supervisor = ledger.upsertWorker({ name: 'Lead carpenter', role: 'Lead Carpenter', status: 'available' });
  const supervisorTwo = ledger.upsertWorker({ name: 'Second lead carpenter', role: 'Lead Carpenter', status: 'available' });
  const plannedStart = '2026-10-02T07:30:00.000Z';
  const plannedEnd = '2026-10-02T09:30:00.000Z';
  const assignment = ledger.addAssignment(job.id, { workerId: supervisor.id, role: 'Lead Carpenter', status: 'assigned',
    scheduledStart: '2026-10-02T07:30:00.000Z', scheduledEnd: '2026-10-02T15:30:00.000Z', allocationHours: 8 });
  ledger.addAssignment(job.id, { workerId: supervisorTwo.id, role: 'Lead Carpenter', status: 'assigned',
    scheduledStart: '2026-10-02T07:30:00.000Z', scheduledEnd: '2026-10-02T15:30:00.000Z', allocationHours: 8 });
  const task = ledger.addTask(job.id, { title: 'Supervised joinery', status: 'open', assigneeId: worker.id,
    requiredTrade: 'Carpenter', supervisorWorkerIds: [supervisor.id, supervisorTwo.id], supervisorTrade: 'Lead Carpenter',
    supervisionRatio: { workersPerSupervisor: 1 }, plannedStart, plannedEnd, durationHours: 2 });
  const apprenticePack = service.read(job.id, worker.id);
  const supervisedTask = apprenticePack.do.find(item => item.id === task.id);
  assert.equal(supervisedTask.supervision.workerName, supervisor.name);
  assert.equal(supervisedTask.supervision.role, 'Lead Carpenter');
  assert.equal(supervisedTask.supervision.assignmentCurrent, true);
  assert.equal(supervisedTask.supervision.shiftCoversTask, true);
  assert.equal(supervisedTask.supervision.qualificationReady, true);
  assert.equal(supervisedTask.supervision.checkedIn, false);
  assert.deepEqual(supervisedTask.supervisions.map(item => item.workerId), [supervisor.id, supervisorTwo.id]);
  assert.equal(supervisedTask.supervision.requiredSupervisorCount, 1);
  assert.ok(apprenticePack.startReleaseEligibility[0].blockers.some(blocker => blocker.includes('must check in on site')));

  const supervisorPack = service.read(job.id, supervisor.id);
  const sharedTask = supervisorPack.do.find(item => item.id === task.id);
  assert.equal(sharedTask.supervisingOnly, true);
  const secondSupervisorPack = service.read(job.id, supervisorTwo.id);
  assert.equal(secondSupervisorPack.do.find(item => item.id === task.id).supervisingOnly, true);
  assert.equal(supervisorPack.startReleaseEligibility[0].eligible, false);
  assert.ok(assignment.id);
});

test('a non-lead crew member receives the task in their field pack and can reach its own release checks', t => {
  const { ledger, service, worker, job } = fixture(t);
  const crewMember = ledger.upsertWorker({ name: 'Second carpenter', role: 'Carpenter', status: 'available' });
  ledger.addAssignment(job.id, { workerId: crewMember.id, role: 'Carpenter', status: 'assigned',
    scheduledStart: '2026-10-02T07:30:00.000Z', scheduledEnd: '2026-10-02T15:30:00.000Z', allocationHours: 8 });
  const task = ledger.addTask(job.id, { title: 'Lift and fit shared panels', status: 'open', assigneeId: worker.id,
    requiredTrade: 'Carpenter', requiredCrewSize: 2, data: { crewWorkerIds: [worker.id, crewMember.id],
      crewWorkerAssignments: [{ workerId: worker.id, role: 'Carpenter' }, { workerId: crewMember.id, role: 'Carpenter' }] } });

  const pack = service.read(job.id, crewMember.id);
  const crewTask = pack.do.find(item => item.id === task.id);
  assert.ok(crewTask);
  assert.equal(crewTask.supervisingOnly, false);
  assert.deepEqual(crewTask.crewWorkerIds, [worker.id, crewMember.id]);
  assert.deepEqual(crewTask.crew.map(member => [member.workerName, member.role]).sort(), [['Assigned carpenter', 'Carpenter'], ['Second carpenter', 'Carpenter']]);
  const eligibility = service.startReleaseEligibility(pack, pack.assignments[0].id);
  assert.equal(eligibility.blockers.includes('No open, unblocked task remains in this worker work pack.'), false);
  assert.ok(eligibility.blockers.some(blocker => blocker.includes('planning readiness')));
});

test('replacement worker receives only a current exact-shift briefing and start release blocks until re-briefed', t => {
  const { ledger, service, worker, job } = fixture(t);
  const scheduledStart = '2026-10-02T07:30:00.000Z';
  const scheduledEnd = '2026-10-02T15:30:00.000Z';
  const retainHuddle = (workerId, key, shiftLabel, plan) => ledger.createDailyStartHuddle(job.id, {
    entryKey: key, workDate: scheduledStart.slice(0, 10), shiftLabel, facilitator: 'Site lead',
    leadWorkerId: workerId, workerIds: [workerId], plannedWork: plan,
    productionTarget: 'Complete the assigned installation and verify its hold points.',
    weather: 'Dry', siteConditions: 'Keep the shared access route clear.',
    safetyFocus: 'Use the task-linked lifting controls and stop if access changes.',
    qualityHoldPoints: ['Check level before final fixing'], constraints: ['Confirm delivery before closing the wall'],
    evidenceReference: `briefing:${key}`
  }, { actor: 'site_lead' }).cycle;

  const prior = retainHuddle(worker.id, 'replacement-prior-huddle', 'day',
    'Install the original crew work zone; keep this private original-only detail.');
  assert.equal(prior.huddleIntegrityValid, true);
  const replacement = ledger.upsertWorker({ name: 'Replacement carpenter', role: 'Carpenter', status: 'available' });
  const replacementAssignment = ledger.addAssignment(job.id, { workerId: replacement.id, role: 'Carpenter', status: 'scheduled',
    scheduledStart, scheduledEnd, allocationHours: 8 });

  const awaitingBriefing = service.read(job.id, replacement.id);
  const briefingGate = awaitingBriefing.assignments.find(item => item.id === replacementAssignment.id).dailyBriefing;
  assert.equal(briefingGate.status, 'crew_update_required');
  assert.ok(awaitingBriefing.startReleaseEligibility.find(item => item.assignmentId === replacementAssignment.id)
    .blockers.some(message => message.includes('does not include this worker assignment')));
  assert.equal(JSON.stringify(briefingGate).includes('original-only detail'), false);

  const currentPlan = 'Brief the replacement carpenter on the wall sequence, updated access route, and current lifting controls.';
  retainHuddle(replacement.id, 'replacement-current-huddle', 'replacement', currentPlan);
  assert.equal(service.read(job.id, replacement.id).assignments.find(item => item.id === replacementAssignment.id)
    .dailyBriefing.status, 'ready');
  const laterCrewChange = retainHuddle(worker.id, 'replacement-later-crew-change', 'later-crew-change',
    'A later overlapping briefing changes the work sequence and crew.');
  assert.equal(laterCrewChange.huddleIntegrityValid, true);
  assert.equal(service.read(job.id, replacement.id).assignments.find(item => item.id === replacementAssignment.id)
    .dailyBriefing.status, 'crew_update_required', 'a later overlapping huddle without the replacement supersedes its old briefing');
  retainHuddle(replacement.id, 'replacement-final-huddle', 'replacement-final', currentPlan);
  const updatedPack = service.read(job.id, replacement.id);
  const briefing = updatedPack.assignments.find(item => item.id === replacementAssignment.id).dailyBriefing;
  assert.equal(briefing.status, 'ready');
  assert.equal(briefing.plannedWork, currentPlan);
  assert.equal(briefing.safetyFocus, 'Use the task-linked lifting controls and stop if access changes.');
  assert.equal(JSON.stringify(briefing).includes(worker.name), false);
  assert.equal(updatedPack.startReleaseEligibility.find(item => item.assignmentId === replacementAssignment.id)
    .blockers.some(message => message.includes('does not include this worker assignment')), false);

  ledger.db.prepare('UPDATE assignments SET scheduled_end = ? WHERE id = ?')
    .run('2026-10-02T16:30:00.000Z', replacementAssignment.id);
  assert.equal(service.read(job.id, replacement.id).assignments.find(item => item.id === replacementAssignment.id)
    .dailyBriefing.status, 'needs_review', 'a schedule change after briefing requires a fresh review');
});

test('a shift crossing UTC midnight finds the huddle retained on its local work date', t => {
  const { ledger, service, worker, job } = fixture(t);
  const scheduledStart = '2026-10-02T22:30:00.000Z';
  const scheduledEnd = '2026-10-03T06:30:00.000Z';
  const assignment = ledger.db.prepare('SELECT id FROM assignments WHERE job_id = ? AND worker_id = ?').get(job.id, worker.id);
  ledger.db.prepare('UPDATE assignments SET scheduled_start = ?, scheduled_end = ? WHERE id = ?')
    .run(scheduledStart, scheduledEnd, assignment.id);
  ledger.createDailyStartHuddle(job.id, {
    entryKey: 'field-pack-local-date-huddle', workDate: '2026-10-03', shiftLabel: 'night',
    facilitator: 'Site lead', leadWorkerId: worker.id, workerIds: [worker.id],
    plannedWork: 'Complete the overnight service installation.', productionTarget: 'Test the installed service.',
    weather: 'Dry', siteConditions: 'Use the signed night access route.', safetyFocus: 'Keep the access route lit.',
    qualityHoldPoints: ['Record the pressure test'], constraints: ['Quiet hours after 23:00'],
    evidenceReference: 'night-huddle-evidence'
  }, { actor: 'site_lead' });

  const pack = service.read(job.id, worker.id);
  assert.equal(pack.assignments[0].dailyBriefing.status, 'ready');
  assert.equal(pack.assignments[0].dailyBriefing.workDate, '2026-10-03');
  assert.equal(pack.startReleaseEligibility[0].blockers.some(blocker => blocker.includes('A released start huddle')), false);
});

function fixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'field-pack-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  t.after(() => { ledger.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const worker = ledger.upsertWorker({ name: 'Assigned carpenter', role: 'Carpenter', hourlyRate: 97, status: 'available' });
  const other = ledger.upsertWorker({ name: 'Other worker', role: 'Electrician', status: 'available' });
  const job = ledger.createIntake({ title: 'Phone work pack', client: { name: 'Client', email: 'private@example.test' }, tasks: [{ title: 'Shared preparation' }], assignAutomatically: false });
  ledger.addAssignment(job.id, { workerId: worker.id, role: 'Carpenter', status: 'assigned',
    scheduledStart: '2026-10-02T07:30:00.000Z', scheduledEnd: '2026-10-02T15:30:00.000Z', allocationHours: 8 });
  ledger.addTask(job.id, { title: 'Other private task', assigneeId: other.id });
  ledger.createQualificationRequirement(job.id, { credentialType: 'vca', title: 'Current VCA', role: 'Carpenter' });
  return { ledger, worker, other, job, service: new FieldWorkPack(ledger) };
}

test('start release fails closed on unreviewed planning, qualifications and safety records', t => {
  const { service, worker, job } = fixture(t);
  const pack = service.read(job.id, worker.id);
  assert.equal(pack.startRelease.status, 'not_issued');
  assert.equal(pack.startRelease.permissionToStart, false);
  assert.equal(pack.assignments[0].startRelease.status, 'not_issued');
  assert.equal(pack.startReleaseEligibility[0].eligible, false);
  assert.ok(pack.startReleaseEligibility[0].blockers.some(blocker => blocker.includes('A released start huddle')));
  assert.ok(pack.startReleaseEligibility[0].blockers.some(blocker => blocker.includes('No current assignment-linked safety plan')));
  assert.ok(pack.startReleaseEligibility[0].blockers.some(blocker => blocker.includes('qualifications')));
  assert.throws(() => service.issueStartRelease(job.id, worker.id, {
    entryKey: 'start-release-blocked', assignmentId: pack.assignments[0].id, sourceHash: pack.sourceHash,
    reason: 'Supervisor checked the work area.', evidenceReference: 'briefing:morning',
    checks: ['siteConditionsChecked', 'methodAndControlsReviewed', 'requiredPermitsConfirmed', 'crewAndQualificationsChecked', 'equipmentAndPpeAvailable', 'emergencyArrangementsKnown'],
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString()
  }, 'role:approver'), error => error.code === 'start_release_blocked' && error.details.blockers.length > 0);
});

test('a JHA in a plan scoped to another task does not satisfy the selected task release gate', t => {
  const { ledger, service, worker, job } = fixture(t);
  const task = job.tasks[0];
  const otherTask = ledger.addTask(job.id, { title: 'Install the adjacent trim' });
  const assignment = ledger.db.prepare('SELECT id, data_json FROM assignments WHERE job_id = ? AND worker_id = ?').get(job.id, worker.id);
  ledger.db.prepare('UPDATE assignments SET data_json = ? WHERE id = ?')
    .run(JSON.stringify({ ...JSON.parse(assignment.data_json), workBoardPositionId: 'position-safety-plan-scope', workBoardTaskIds: [task.id] }), assignment.id);
  ledger.setTaskJhaApplicability(job.id, task.id, {
    status: 'required', reason: 'Manual lifting and pinch hazards require task-specific controls.', entryKey: 'pack-task-jha-scope-01'
  }, { actor: 'safety-approver' });
  const jha = ledger.createJhaRecord(job.id, {
    title: 'Door frame and trim JHA', status: 'approved', riskLevel: 'medium',
    hazards: ['Manual lifting'], controls: ['Use a two-person lift'], linkedTaskIds: [task.id, otherTask.id]
  });
  ledger.resolveApproval(jha.approval.id, { status: 'approved', reason: 'Controls reviewed for both linked tasks.' });
  const plan = ledger.createPreTaskPlan(job.id, {
    entryKey: 'pack-safety-plan-scope-01', workDate: new Date().toISOString().slice(0, 10),
    shiftLabel: 'Day shift', title: 'Install adjacent trim', location: 'Level one', preparedBy: 'Site supervisor',
    jhaId: jha.id, linkedTaskIds: [otherTask.id], assignmentIds: [assignment.id], evidenceReference: 'method:trim-task',
    steps: [{ stepKey: 'fit-trim', description: 'Fit the adjacent trim', hazards: ['Manual lifting'], controls: ['Use a two-person lift'] }]
  });

  const pack = service.read(job.id, worker.id);
  assert.equal(pack.know.jhas.find(item => item.id === jha.id).linkedTaskIds[0], task.id);
  assert.equal(pack.know.safetyPlans.find(item => item.id === plan.plan.id).jhaId, jha.id);
  assert.deepEqual(pack.know.safetyPlans.find(item => item.id === plan.plan.id).linkedTaskIds, []);
  assert.ok(pack.startReleaseEligibility[0].blockers.some(blocker => blocker.includes('safety plan that covers this task')));
});

test('a start release requires current worker acknowledgment, is idempotent, and expires when its source changes', t => {
  const { service, worker, job } = fixture(t);
  const assignment = service.snapshot(job.id, worker.id).assignments[0];
  let sourceHash = 'a'.repeat(64);
  let readiness = 'ready';
  let sdsReadiness = { status: 'ready', items: [], blockers: [] };
  const pack = () => ({
    format: 'contractor-field-work-pack/v1', sourceHash,
    worker: { id: worker.id, name: worker.name },
    assignments: [
      { ...assignment, dailyBriefing: { status: 'ready' }, scheduledStart: new Date(Date.now() - 60_000).toISOString(), scheduledEnd: new Date(Date.now() + 6 * 60 * 60_000).toISOString() },
      { ...assignment, dailyBriefing: { status: 'ready' }, id: `${assignment.id}-second`, role: 'Electrician', scheduledStart: new Date(Date.now() - 60_000).toISOString(), scheduledEnd: new Date(Date.now() + 6 * 60 * 60_000).toISOString() }
    ],
    job: { id: job.id, title: job.title, status: 'in_progress', scheduledStart: new Date(Date.now() - 60_000).toISOString(), scheduledEnd: new Date(Date.now() + 6 * 60 * 60_000).toISOString() },
    planningReadiness: { status: readiness, blockerCount: readiness === 'ready' ? 0 : 1, missingCount: 0, warningCount: 0 },
    can: [], do: [{ id: 'task-current', status: 'open' }], know: {
      scopeChangeReviewRequired: [],
      safetyPlans: [{ id: 'plan-current', planNumber: 'PTP-CURRENT', recordChecksPassed: true,
        definitionIntegrityValid: true, prerequisitesCurrent: true,
        ownAcknowledgement: { status: 'acknowledged', integrityValid: true }, permit: null }],
      lmraAssessments: [{ planId: 'plan-current', isLatestForWorkerPlan: true, recordChecksPassed: true,
        outcome: 'ready', sourceCurrent: true, expired: false }],
      sdsReadiness
    },
    have: {}, checks: {}
  });
  service.snapshot = () => pack();
  const current = service.read(job.id, worker.id);
  service.acknowledge(job.id, worker.id, { entryKey: 'start-release-read', sourceHash: current.sourceHash, understood: true }, 'role:field_worker');
  const request = {
    entryKey: 'start-release-issued', assignmentId: assignment.id, sourceHash: current.sourceHash,
    reason: 'Supervisor checked the current site and method.', evidenceReference: 'briefing:morning',
    checks: ['siteConditionsChecked', 'methodAndControlsReviewed', 'requiredPermitsConfirmed', 'crewAndQualificationsChecked', 'equipmentAndPpeAvailable', 'emergencyArrangementsKnown'],
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString()
  };
  const issued = service.issueStartRelease(job.id, worker.id, request, 'role:approver');
  assert.equal(issued.release.status, 'awaiting_worker');
  assert.equal(issued.release.permissionToStart, false);
  assert.equal(service.read(job.id, worker.id).assignments[0].startRelease.status, 'awaiting_worker');
  const replay = service.issueStartRelease(job.id, worker.id, request, 'role:approver');
  assert.equal(replay.replayed, true);
  const secondRequest = { ...request, entryKey: 'second-shift-release', assignmentId: `${assignment.id}-second` };
  const secondIssued = service.issueStartRelease(job.id, worker.id, secondRequest, 'role:approver');
  assert.equal(secondIssued.release.status, 'awaiting_worker');
  const pending = service.read(job.id, worker.id);
  assert.equal(pending.assignments[0].startRelease.status, 'awaiting_worker');
  assert.equal(pending.assignments[1].startRelease.id, secondIssued.release.id);
  const acknowledged = service.acknowledgeStartRelease(job.id, worker.id, {
    entryKey: 'start-release-received', releaseId: issued.release.id, sourceHash: pending.sourceHash, understood: true
  }, 'role:field_worker');
  assert.equal(acknowledged.release.status, 'active');
  assert.equal(acknowledged.release.permissionToStart, true);
  assert.equal(service.read(job.id, worker.id).assignments[0].startRelease.permissionToStart, true);
  assert.equal(service.acknowledgeStartRelease(job.id, worker.id, {
    entryKey: 'second-shift-release-received', releaseId: secondIssued.release.id, sourceHash: pending.sourceHash, understood: true
  }, 'role:field_worker').release.permissionToStart, true);
  assert.equal(service.acknowledgeStartRelease(job.id, worker.id, {
    entryKey: 'start-release-received', releaseId: issued.release.id, sourceHash: pending.sourceHash, understood: true
  }, 'role:field_worker').replayed, true);
  const revoked = service.revokeStartRelease(job.id, worker.id, issued.release.id, 'start-release-stop', 'Changed site conditions.', 'role:field_worker');
  assert.equal(revoked.release.status, 'revoked');
  assert.equal(service.read(job.id, worker.id).assignments[1].startRelease.permissionToStart, true);
  readiness = 'blocked';
  const blocked = service.read(job.id, worker.id);
  assert.equal(blocked.startRelease.status, 'not_ready');
  assert.equal(blocked.startRelease.permissionToStart, false);
  assert.equal(blocked.assignments[0].startRelease.status, 'revoked');
  assert.equal(blocked.assignments[1].startRelease.status, 'not_ready');
  readiness = 'ready';
  sourceHash = 'b'.repeat(64);
  const stale = service.read(job.id, worker.id);
  assert.equal(stale.startRelease.status, 'outdated');
  assert.equal(stale.startRelease.permissionToStart, false);
  assert.equal(stale.assignments[0].startRelease.status, 'revoked');
  assert.equal(stale.assignments[1].startRelease.status, 'outdated');
  assert.equal(service.revokeStartRelease(job.id, worker.id, issued.release.id, 'start-release-stop', 'Changed site conditions.', 'role:field_worker').replayed, true);
  assert.equal(service.read(job.id, worker.id).assignments[1].startRelease.status, 'outdated');
  assert.equal(service.read(job.id, worker.id).assignments[0].startRelease.status, 'revoked');
  sdsReadiness = { status: 'blocked', items: [{ material: 'Frame adhesive', requirement: 'required', ready: false }],
    blockers: [{ type: 'material_sds_missing', message: 'A current approved SDS PDF is missing for Frame adhesive.' }] };
  sourceHash = 'c'.repeat(64);
  const sdsChanged = service.read(job.id, worker.id);
  assert.equal(sdsChanged.assignments[1].startRelease.status, 'outdated');
  assert.equal(sdsChanged.assignments[1].startRelease.permissionToStart, false);
  assert.ok(sdsChanged.startReleaseEligibility.find(item => item.assignmentId === `${assignment.id}-second`)
    .blockers.some(blocker => blocker.includes('current approved SDS PDF is missing')));
});

test('required start release gates only linked task progress and permits blocker reports', t => {
  const { ledger, service, worker, job } = fixture(t);
  const task = job.tasks[0];
  const row = ledger.db.prepare('SELECT data_json FROM assignments WHERE job_id = ? AND worker_id = ?').get(job.id, worker.id);
  const data = JSON.parse(row.data_json);
  ledger.db.prepare('UPDATE assignments SET data_json = ? WHERE job_id = ? AND worker_id = ?')
    .run(JSON.stringify({ ...data, startReleaseRequired: true, workBoardPositionId: 'position-controlled', workBoardTaskIds: [task.id] }), job.id, worker.id);
  const pack = service.read(job.id, worker.id);
  service.acknowledge(job.id, worker.id, { entryKey: 'policy-pack-read', sourceHash: pack.sourceHash, understood: true }, 'field_worker');
  assert.throws(() => service.progress(job.id, worker.id, {
    entryKey: 'policy-start-denied', sourceHash: pack.sourceHash, taskId: task.id, status: 'in_progress', progressPercent: 10, note: 'Beginning the roof work.'
  }, 'field_worker'), error => error.statusCode === 409 && /start release is required/i.test(error.message));
  assert.equal(service.progress(job.id, worker.id, {
    entryKey: 'policy-blocker-allowed', sourceHash: pack.sourceHash, taskId: task.id, status: 'blocked', progressPercent: 0, note: 'The access area is not safe yet.'
  }, 'field_worker').record.progress.status, 'blocked');
});

test('an acknowledged current start release permits in-progress reporting for its assigned task', t => {
  const { ledger, service, worker, job } = fixture(t);
  const task = job.tasks[0];
  const row = ledger.db.prepare('SELECT data_json FROM assignments WHERE job_id = ? AND worker_id = ?').get(job.id, worker.id);
  const data = JSON.parse(row.data_json);
  ledger.db.prepare('UPDATE assignments SET data_json = ? WHERE job_id = ? AND worker_id = ?')
    .run(JSON.stringify({ ...data, startReleaseRequired: true, workBoardPositionId: 'position-controlled', workBoardTaskIds: [task.id] }), job.id, worker.id);
  let sourceHash = 'a'.repeat(64);
  let readiness = 'ready';
  const assignment = service.snapshot(job.id, worker.id).assignments[0];
  service.snapshot = () => ({
    format: 'contractor-field-work-pack/v1', sourceHash,
    worker: { id: worker.id, name: worker.name },
    assignments: [{ ...assignment, dailyBriefing: { status: 'ready' }, scheduledStart: new Date(Date.now() - 60_000).toISOString(), scheduledEnd: new Date(Date.now() + 6 * 60 * 60_000).toISOString() }],
    job: { id: job.id, title: job.title, status: 'in_progress', scheduledStart: new Date(Date.now() - 60_000).toISOString(), scheduledEnd: new Date(Date.now() + 6 * 60 * 60_000).toISOString() },
    planningReadiness: { status: readiness, blockerCount: readiness === 'ready' ? 0 : 1, missingCount: 0, warningCount: 0 },
    can: [], do: [{ id: task.id, status: 'open' }], know: {
      scopeChangeReviewRequired: [],
      safetyPlans: [{ id: 'plan-current', planNumber: 'PTP-CURRENT', recordChecksPassed: true,
        definitionIntegrityValid: true, prerequisitesCurrent: true,
        ownAcknowledgement: { status: 'acknowledged', integrityValid: true }, permit: null }],
      lmraAssessments: [{ planId: 'plan-current', isLatestForWorkerPlan: true, recordChecksPassed: true,
        outcome: 'ready', sourceCurrent: true, expired: false }]
    }, have: {}, checks: {}
  });
  const pack = service.read(job.id, worker.id);
  service.acknowledge(job.id, worker.id, { entryKey: 'required-pack-read', sourceHash: pack.sourceHash, understood: true }, 'field_worker');
  const issued = service.issueStartRelease(job.id, worker.id, {
    entryKey: 'required-release-issued', assignmentId: assignment.id, sourceHash: pack.sourceHash,
    reason: 'Supervisor reviewed the site and task method.', evidenceReference: 'briefing:controlled-task',
    checks: ['siteConditionsChecked', 'methodAndControlsReviewed', 'requiredPermitsConfirmed', 'crewAndQualificationsChecked', 'equipmentAndPpeAvailable', 'emergencyArrangementsKnown'],
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString()
  }, 'role:approver');
  const acknowledgedRelease = service.acknowledgeStartRelease(job.id, worker.id, {
    entryKey: 'required-release-received', releaseId: issued.release.id, sourceHash: pack.sourceHash, understood: true
  }, 'field_worker');
  assert.equal(acknowledgedRelease.release.permissionToStart, true, JSON.stringify(acknowledgedRelease.release));
  const current = service.read(job.id, worker.id);
  assert.equal(current.startRelease.status, 'active', JSON.stringify(current.startRelease));
  assert.equal(current.startReleaseEligibility.find(item => item.assignmentId === assignment.id)?.eligible, true, JSON.stringify(current.startReleaseEligibility));
  assert.equal(service.progress(job.id, worker.id, {
    entryKey: 'required-task-start', sourceHash: pack.sourceHash, taskId: task.id, status: 'in_progress', progressPercent: 10, note: 'Starting the approved roof work.'
  }, 'field_worker').record.progress.status, 'in_progress');
  service.revokeStartRelease(job.id, worker.id, issued.release.id, 'required-release-revoked', 'Site conditions changed.', 'role:approver');
  assert.throws(() => service.progress(job.id, worker.id, {
    entryKey: 'revoked-task-start', sourceHash: pack.sourceHash, taskId: task.id, status: 'in_progress', progressPercent: 12, note: 'Continuing after the release was revoked.'
  }, 'field_worker'), error => error.statusCode === 409);
  sourceHash = 'b'.repeat(64);
  assert.throws(() => service.progress(job.id, worker.id, {
    entryKey: 'stale-task-start', sourceHash, taskId: task.id, status: 'in_progress', progressPercent: 12, note: 'Trying after the instructions changed.'
  }, 'field_worker'), error => error.statusCode === 409);
});

test('work pack exposes only scoped work and no commercial records or other workers', t => {
  const { service, worker, other, job } = fixture(t);
  const pack = service.read(job.id, worker.id);
  assert.equal(pack.worker.id, worker.id);
  assert.deepEqual(pack.assignments.map(({ role, scheduledStart, scheduledEnd, allocationHours }) => ({ role, scheduledStart, scheduledEnd, allocationHours })), [{
    role: 'Carpenter', scheduledStart: '2026-10-02T07:30:00.000Z', scheduledEnd: '2026-10-02T15:30:00.000Z', allocationHours: 8
  }]);
  assert.equal(pack.can[0].status, 'missing');
  assert.equal(typeof pack.planningReadiness.status, 'string');
  assert.equal(pack.planningReadiness.authorizationGranted, false);
  assert.equal(Number.isInteger(pack.planningReadiness.blockerCount), true);
  assert.equal(Number.isInteger(Date.parse(pack.planningReadiness.checkedAt)), true);
  assert.equal(service.snapshot(job.id, worker.id).sourceHash, pack.sourceHash);
  assert.equal(pack.do.some(task => task.title === 'Other private task'), false);
  assert.equal(pack.safetyClearance, false);
  assert.equal(pack.acknowledgment, null);
  const encoded = JSON.stringify(pack);
  for (const secret of ['hourlyRate', 'estimatedCost', 'contractValue', 'private@example.test', other.name]) assert.equal(encoded.includes(secret), false);
  assert.throws(() => service.read(job.id, other.id), { statusCode: 403 });
});

test('work pack carries only assignment-linked safety records and never grants start authorization', t => {
  const { ledger, service, worker, other, job } = fixture(t);
  ledger.addAssignment(job.id, { workerId: other.id, role: 'Electrician', status: 'assigned' });
  const jha = ledger.createJhaRecord(job.id, {
    title: 'Electrical isolation', status: 'approved', riskLevel: 'high',
    hazards: ['Stored energy'], controls: ['Lock out and verify dead'], stopWorkTriggers: ['Isolation changes']
  });
  ledger.resolveApproval(jha.approval.id, { status: 'approved', reason: 'Reviewed source hazards.' });
  const permitResult = ledger.createWorkPermit(job.id, {
    entryKey: 'field-pack-permit-001', permitType: 'electrical_isolation', title: 'Plant room isolation', holder: 'Supervisor',
    location: 'Plant room', validFrom: new Date(Date.now() - 60_000).toISOString(),
    expiresAt: new Date(Date.now() + 60 * 60_000).toISOString(), hazards: ['Stored energy'],
    controls: ['Lock out and verify dead'], conditions: ['Stop if isolation boundary changes'], evidenceReference: 'permit:field-pack'
  });
  ledger.resolveApproval(permitResult.approval.id, { status: 'approved', reason: 'Permit conditions reviewed.' });
  for (const [index, person] of [worker, other].entries()) ledger.acknowledgeWorkPermit(job.id, permitResult.permit.id, {
    entryKey: `field-pack-permit-ack-${index}`, workerId: person.id, workerName: person.name,
    acknowledged: true, evidenceReference: `permit-device-${index}`
  });
  const planResult = ledger.createPreTaskPlan(job.id, {
    entryKey: 'field-pack-plan-001', workDate: new Date().toISOString().slice(0, 10), title: 'Replace distribution panel',
    shiftLabel: 'Day shift', location: 'Plant room', preparedBy: 'Supervisor', responsibleWorkerId: worker.id,
    jhaId: jha.id, workPermitId: permitResult.permit.id, evidenceReference: 'method:field-pack',
    emergencyArrangements: 'Use the east stair and report to the assembly point.',
    stopWorkTriggers: ['Isolation changes', 'Unexpected live services'],
    steps: [{ stepKey: 'isolate', description: 'Verify and isolate the supply', hazards: ['Stored energy'], controls: ['Lock out and test'] }]
  });
  ledger.resolveApproval(planResult.approval.id, { status: 'approved', reason: 'Plan and permit verified.' });
  for (const [index, person] of [worker, other].entries()) ledger.acknowledgePreTaskPlan(job.id, planResult.plan.id, {
    entryKey: `field-pack-plan-ack-${index}`, workerId: person.id, acknowledged: true,
    evidenceReference: `plan-device-${index}`, attestation: 'I reviewed the work steps and controls.'
  });
  const checks = { task_understood: true, work_area_safe: true, controls_in_place: true, ppe_ready: true, equipment_ready: true, emergency_ready: true, no_changed_conditions: true };
  for (const [index, person] of [worker, other].entries()) ledger.createLmraAssessment(job.id, {
    entryKey: `field-pack-lmra-${index}`, workerId: person.id, workerName: person.name,
    preTaskPlanId: planResult.plan.id, workPermitId: permitResult.permit.id, workArea: 'Plant room',
    activity: 'Replace distribution panel', clientCapturedAt: new Date().toISOString(), validForMinutes: 120,
    checks, safeToStart: true, observedHazards: index ? ['Open cable route'] : [],
    evidenceReference: `lmra-device-${index}`
  });

  const pack = service.read(job.id, worker.id);
  assert.equal(pack.know.safetyPlans.length, 1);
  assert.equal(pack.know.safetyPlans[0].ownAcknowledgement.status, 'acknowledged');
  assert.equal(pack.know.safetyPlans[0].steps[0].controls[0], 'Lock out and test');
  assert.equal(pack.know.safetyPlans[0].permit.title, 'Plant room isolation');
  assert.equal(pack.know.safetyPlans[0].permit.ownAcknowledgement.status, 'acknowledged');
  assert.equal(pack.know.lmraAssessments.length, 1);
  assert.deepEqual(pack.know.lmraAssessments[0].observedHazards, []);
  assert.equal(pack.know.safetyReview.authorizationGranted, false);
  assert.equal(pack.safetyClearance, false);
  const encoded = JSON.stringify(pack);
  for (const secret of [other.name, 'Open cable route', 'attendeeName', 'snapshotHash', 'entryKey']) assert.equal(encoded.includes(secret), false);
  assert.equal(pack.know.safetyPlans[0].sourceHash, undefined);

  const priorHash = pack.sourceHash;
  ledger.db.prepare('UPDATE lmra_assessments SET stop_work_reason = ? WHERE id = ?').run('Unexpected condition recorded.', pack.know.lmraAssessments[0].id);
  const changedLmra = service.read(job.id, worker.id);
  assert.notEqual(changedLmra.sourceHash, priorHash);
  assert.equal(changedLmra.know.lmraAssessments[0].integrityValid, false);
  assert.equal(changedLmra.safetyClearance, false);
  ledger.db.prepare('UPDATE pre_task_plans SET location = ? WHERE id = ?').run('Updated plant room', planResult.plan.id);
  const changed = service.read(job.id, worker.id);
  assert.notEqual(changed.sourceHash, changedLmra.sourceHash);
  assert.equal(changed.safetyClearance, false);
});

test('field work pack exposes only accepted verified variation scope and invalidates an old read confirmation', t => {
  const { ledger, service, worker, job } = fixture(t);
  ledger.updateOrganizationProfile({
    legalName: 'Field Pack Contractor BV', tradingName: 'Field Pack Contractor', registrationNumber: '12345678',
    vatNumber: 'NL123456789B01', email: 'office@field-pack.example', phone: '+31 20 555 0199',
    address: 'Contractstraat 9', postalCode: '1012 AB', city: 'Amsterdam', country: 'NL',
    iban: 'NL91 ABNA 0417 1643 00', defaultPaymentTermsDays: 30, defaultQuoteValidityDays: 30,
    quoteTerms: 'Changed work starts only after verified client acceptance.'
  }, { actor: 'owner' });
  ledger.db.prepare('UPDATE jobs SET contract_value = 1000 WHERE id = ?').run(job.id);
  const original = service.read(job.id, worker.id);
  const acknowledgment = service.acknowledge(job.id, worker.id, {
    sourceHash: original.sourceHash, entryKey: 'field-pack-scope-ack-1', understood: true
  }, 'field-worker');
  assert.equal(acknowledgment.replayed, false);
  assert.equal(service.read(job.id, worker.id).acknowledgment.current, true);
  ledger.db.prepare('UPDATE assignments SET scheduled_end = ? WHERE job_id = ? AND worker_id = ?')
    .run('2026-10-02T16:30:00.000Z', job.id, worker.id);
  const rescheduled = service.read(job.id, worker.id);
  assert.equal(rescheduled.acknowledgment.current, false);
  assert.ok(rescheduled.changedSections.includes('assignments'));
  assert.equal(rescheduled.assignments[0].allocationHours, 8);
  assert.equal(service.acknowledge(job.id, worker.id, {
    sourceHash: rescheduled.sourceHash, entryKey: 'phone-ack-rescheduled', understood: true
  }, 'trusted-field').replayed, false);

  const requestedAt = new Date().toISOString().slice(0, 10);
  const responseDueAt = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  const variation = ledger.createChangeOrder(job.id, {
    entryKey: 'field-pack-scope-variation-1',
    title: 'Revised access protection',
    scopeDelta: 'Install retained floor protection along the revised occupied-building access route.',
    variationType: 'client_request',
    initiatedBy: 'client',
    cause: 'The client requested a revised access route.',
    justification: 'The changed route requires additional protection.',
    contractReference: 'Contract section 3.2',
    noticeReference: 'CLIENT-ROUTE-CHANGE-1',
    requestedAt,
    responseDueAt,
    scheduleDeltaDays: 0,
    scheduleImpactNarrative: 'No change to the agreed schedule.',
    riskImpact: 'medium',
    riskImpactStatement: 'Internal commercial risk statement that must not reach field workers.',
    assumptions: ['The route remains available during working hours.'],
    exclusions: ['Out-of-hours access is excluded.'],
    evidenceReferences: ['CLIENT-ROUTE-CHANGE-1'],
    taxRate: 21,
    status: 'submitted',
    lineItems: [{ description: 'Floor protection', quantity: 5, unitPrice: 25, costCode: 'PRIVATE-CODE' }]
  }, { actor: 'office' });
  ledger.resolveApproval(variation.approvalId, {
    status: 'approved', resolvedBy: 'commercial-approver', reason: 'Scope, contract baseline, schedule and price verified.'
  });
  const issue = ledger.prepareChangeOrderIssuePackage(job.id, variation.id, {}, { actor: 'office' });
  ledger.resolveApproval(issue.approval.id, {
    status: 'approved', resolvedBy: 'delivery-approver', reason: 'Exact client package and recipient verified.'
  });
  ledger.recordCommunicationDelivery(issue.communication.id, {
    integration: 'field-pack-test-provider', providerMessageId: `field-pack-${variation.id}`,
    receipt: { status: 'accepted-by-provider' }
  }, { actor: 'verified-test-provider' });
  const acceptedAt = new Date().toISOString();
  const acceptance = ledger.requestChangeOrderAcceptance(job.id, variation.id, {
    acceptedAt, evidenceReference: 'private-portal-reference'
  }, { actor: 'office' });
  ledger.resolveApproval(acceptance.approval.id, {
    status: 'approved', resolvedBy: 'contract-approver', reason: 'Client acceptance and exact delivered revision verified.'
  });
  const retainedVariation = ledger.getJobDetail(job.id).changeOrders.find(row => row.id === variation.id);
  assert.equal(retainedVariation.workAuthorized, true);
  const afterAcceptance = service.read(job.id, worker.id);
  assert.notEqual(afterAcceptance.sourceHash, original.sourceHash);
  assert.equal(afterAcceptance.acknowledgment.current, false);

  ledger.createChangeOrder(job.id, {
    entryKey: 'field-pack-scope-variation-draft',
    title: 'Draft-only work',
    scopeDelta: 'Not accepted and not for field distribution.',
    requestedAt: '2026-09-10'
  }, { actor: 'office' });
  const current = service.read(job.id, worker.id);
  assert.equal(current.sourceHash, afterAcceptance.sourceHash);
  assert.equal(current.acknowledgment.current, false);
  assert.deepEqual(current.know.scopeChanges.map(change => ({
    variationNumber: change.variationNumber,
    revisionNumber: change.revisionNumber,
    title: change.title,
    scope: change.scope,
    acceptedAt: change.acceptedAt
  })), [{
    variationNumber: variation.variationNumber,
    revisionNumber: variation.revisionNumber,
    title: 'Revised access protection',
    scope: 'Install retained floor protection along the revised occupied-building access route.',
    acceptedAt
  }]);
  const serialized = JSON.stringify(current);
  for (const secret of ['PRIVATE-CODE', 'Internal commercial risk', 'private-portal-reference', 'Not accepted']) {
    assert.equal(serialized.includes(secret), false);
  }
  assert.equal(current.amount, undefined);
  assert.equal(current.contractValue, undefined);
  assert.equal(serialized.includes('"amount":125'), false);
  assert.equal(serialized.includes('"unitPrice":25'), false);

  ledger.db.prepare('UPDATE change_orders SET scope_delta = ? WHERE id = ?').run('Tampered and unverified scope text.', variation.id);
  const held = service.read(job.id, worker.id);
  const tamperedVariation = ledger.getJobDetail(job.id).changeOrders.find(change => change.id === variation.id);
  assert.equal(tamperedVariation.integrityValid, false);
  assert.equal(tamperedVariation.workAuthorized, false);
  assert.equal(held.know.scopeChanges.length, 0);
  assert.equal(held.know.scopeChangeReviewRequired[0].variationNumber, variation.variationNumber);
  assert.ok(held.startReleaseEligibility[0].blockers.includes('An accepted scope change still requires office review.'));
  assert.equal(JSON.stringify(held).includes('Tampered and unverified'), false);
  assert.equal(held.acknowledgment.current, false);
});

test('read acknowledgment is replay-safe, scoped and invalidated by a changed work instruction', t => {
  const { service, worker, job, ledger } = fixture(t);
  const pack = service.read(job.id, worker.id);
  const payload = { sourceHash: pack.sourceHash, entryKey: 'phone-ack-001', understood: true };
  const result = service.acknowledge(job.id, worker.id, payload, 'trusted-field');
  assert.equal(result.replayed, false);
  assert.equal(service.acknowledge(job.id, worker.id, payload, 'trusted-field').replayed, true);
  assert.equal(service.read(job.id, worker.id).acknowledgment.current, true);
  ledger.db.prepare('UPDATE job_tasks SET description = ? WHERE id = ?').run('Use revised installation sequence', job.tasks[0].id);
  const changed = service.read(job.id, worker.id);
  assert.notEqual(changed.sourceHash, pack.sourceHash);
  assert.equal(changed.acknowledgment.current, false);
  assert.throws(() => service.acknowledge(job.id, worker.id, { ...payload, entryKey: 'phone-ack-002' }, 'trusted-field'), { statusCode: 409 });
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
});

test('questions retain one field report and approval with their exact work-pack source', t => {
  const { service, worker, job, ledger } = fixture(t);
  const pack = service.read(job.id, worker.id);
  const payload = { entryKey: 'phone-question-1', sourceHash: pack.sourceHash, message: 'The opening dimension differs from the drawing.' };
  const first = service.question(job.id, worker.id, payload, 'trusted-field');
  const replay = service.question(job.id, worker.id, payload, 'trusted-field');
  assert.equal(first.report.status, 'pending_approval');
  assert.ok(first.record.rfiId);
  const questionRfi = ledger.getJobDetail(job.id).rfis.find(row => row.id === first.record.rfiId);
  assert.equal(questionRfi.status, 'open');
  assert.equal(questionRfi.question, payload.message);
  assert.equal(questionRfi.data.workerId, worker.id);
  assert.equal(questionRfi.data.sourceReportId, first.report.id);
  assert.equal(replay.report.id, first.report.id);
  assert.equal(replay.record.rfiId, first.record.rfiId);
  assert.equal(ledger.getJobDetail(job.id).fieldReports.length, 1);
  assert.equal(service.read(job.id, worker.id).questions[0].replyStatus, 'open');
  assert.equal(service.read(job.id, worker.id).questions[0].response, null);
  const transition = ledger.transitionLifecycleRecord(job.id, 'rfi', first.record.rfiId, { status: 'answered', response: 'Use drawing revision B.', notes: 'Checked against the approved current revision.' }, { actor: 'office-operator' });
  assert.equal(transition.record.status, 'pending_approval');
  assert.ok(transition.approvalRequired);
  assert.equal(service.read(job.id, worker.id).questions[0].response, null);
  ledger.resolveApproval(transition.approval.id, { status: 'approved', reason: 'Verified current approved drawing.' }, { actor: 'approver' });
  const answered = service.read(job.id, worker.id).questions[0];
  assert.equal(answered.replyStatus, 'answered');
  assert.equal(answered.response, 'Use drawing revision B.');
  const secondWorker = ledger.upsertWorker({ id: 'second-question-worker', name: 'Second worker', role: 'Carpenter', status: 'available' });
  ledger.addAssignment(job.id, { workerId: secondWorker.id, status: 'assigned', role: 'Carpenter' });
  assert.equal(service.read(job.id, secondWorker.id).questions.length, 0);
  assert.throws(() => service.question(job.id, worker.id, { ...payload, message: 'Different message' }, 'trusted-field'), { statusCode: 409 });
  assert.equal(service.read(job.id, worker.id).sourceHash, pack.sourceHash);
});

test('client RFI answers enter only the linked current worker pack after exact approval', t => {
  const { ledger, service, worker, other, job } = fixture(t);
  const task = job.tasks[0];
  const access = ledger.createClientPortalAccess(job.id);
  ledger.resolveApproval(access.approval.id, { status: 'approved' });
  const chat = new ClientConversation(ledger);
  const source = chat.create(access.id, { entryKey: 'client-field-update-1', body: 'Please confirm the frame opening measurement.' }, { direction: 'inbound' });
  const identity = hash('client-field-analysis');
  const quote = source.body;
  chat.record('conversation_analysis', access.id, job.id, 'retain_conversation_analysis', {
    identity, sourceHash: hash(chat.analysisSources(access.id)),
    findings: [{ sourceId: source.id, quote, category: 'question', suggestion: 'Check the approved drawing.', uncertainty: 'Measurement needs office verification.' }]
  }, 'local_model');
  const created = chat.createRfiFromFinding(access.id, {
    entryKey: 'client-field-rfi-1', analysisIdentity: identity, sourceId: source.id, quote, category: 'question',
    title: 'Confirm frame opening', question: 'Check the latest approved drawing and confirm the opening size.',
    responsible: 'Project engineer', dueAt: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
    shareWithField: true, fieldTaskIds: [task.id]
  }, 'office-operator');
  assert.deepEqual(created.rfi.data.fieldTaskIds, [task.id]);
  const beforeAnswer = service.read(job.id, worker.id);
  assert.equal(beforeAnswer.know.clientUpdates.length, 0);
  service.acknowledge(job.id, worker.id, { sourceHash: beforeAnswer.sourceHash, entryKey: 'client-update-pack-ack-1', understood: true }, 'field-worker');
  const transition = ledger.transitionLifecycleRecord(job.id, 'rfi', created.rfi.id, {
    status: 'answered', response: 'Verified opening: 900 mm. Check drawing A-12 before fitting.'
  }, { actor: 'office-operator' });
  assert.equal(service.read(job.id, worker.id).know.clientUpdates.length, 0);
  assert.deepEqual(transition.approval.data.fieldTaskTitles, [task.title]);
  assert.match(transition.approval.summary, new RegExp(task.title));
  ledger.resolveApproval(transition.approval.id, { status: 'approved', reason: 'Confirmed against the current approved drawing.' }, { actor: 'approver' });
  const pack = service.read(job.id, worker.id);
  assert.equal(pack.know.clientUpdates.length, 1);
  assert.equal(pack.acknowledgment.current, false);
  assert.deepEqual(pack.know.clientUpdates[0].taskTitles, [task.title]);
  assert.equal(pack.know.clientUpdates[0].response, 'Verified opening: 900 mm. Check drawing A-12 before fitting.');
  assert.equal(JSON.stringify(pack.know.clientUpdates).includes(quote), false);
  assert.equal(JSON.stringify(pack.know.clientUpdates).includes('Check the approved drawing.'), false);

  const otherAssignment = ledger.addAssignment(job.id, { workerId: other.id, role: 'Electrician', status: 'assigned' });
  const otherTask = ledger.getJobDetail(job.id).tasks.find(item => item.title === 'Other private task');
  ledger.db.prepare('UPDATE assignments SET data_json = ? WHERE id = ?')
    .run(JSON.stringify({ workBoardPositionId: 'position-other-task', workBoardTaskIds: [otherTask.id] }), otherAssignment.id);
  assert.equal(service.read(job.id, other.id).know.clientUpdates.length, 0);
  chat.create(access.id, { entryKey: 'client-field-update-followup', body: 'The opening may be different on site.' }, { direction: 'inbound' });
  assert.equal(service.read(job.id, worker.id).know.clientUpdates.length, 0);
});

test('task progress is limited to the assigned work-pack task and stays a report for office recovery', t => {
  const { ledger, service, worker, other, job } = fixture(t);
  const task = job.tasks[0];
  const pack = service.read(job.id, worker.id);
  const payload = { entryKey: 'field-task-progress-001', sourceHash: pack.sourceHash, taskId: task.id, status: 'blocked', progressPercent: 35, note: 'The opening is wider than the released drawing.' };
  const before = ledger.getJobDetail(job.id);
  const retained = service.progress(job.id, worker.id, payload, 'field-worker');
  const after = ledger.getJobDetail(job.id);
  const retainedDetail = ledger.getJobDetail(job.id);
  assert.equal(retainedDetail.progress.find(item => item.id === retained.record.progress.id).data.taskId, task.id);
  assert.equal(after.status, before.status);
  assert.equal(after.progressPercent, before.progressPercent);
  assert.throws(() => service.progress(job.id, worker.id, { ...payload, entryKey: 'field-task-progress-002', taskId: other.id }, 'field-worker'), { statusCode: 409 });
  const replay = service.progress(job.id, worker.id, payload, 'field-worker');
  assert.equal(replay.replayed, true);
  assert.equal(replay.record.progress.id, retained.record.progress.id);
});

test('field-reported equipment faults create a durable hold tied to the checked-out tool and task', t => {
  const { ledger, service, worker, job } = fixture(t);
  const task = job.tasks[0];
  const tool = ledger.upsertTool({ name: 'Concrete mixer', category: 'mixer', status: 'available' });
  const checkedOutAt = new Date(Date.now() - 60_000).toISOString();
  const reservation = ledger.reserveTool(job.id, { toolId: tool.id, taskId: task.id,
    neededFrom: checkedOutAt, neededUntil: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() });
  const checkout = ledger.checkoutEquipment(job.id, { reservationId: reservation.id, workerId: worker.id,
    checkedOutAt,
    checkedOutBy: worker.name, condition: 'good', evidenceReference: 'handoff:MIX-44', location: 'Site store', entryKey: 'mixer-checkout-01' });
  const pack = service.read(job.id, worker.id);
  const equipment = pack.have.equipment.find(item => item.id === reservation.id);
  assert.equal(equipment.taskId, task.id);
  assert.equal(equipment.custody.heldByYou, true);

  const payload = { entryKey: 'mixer-fault-report-01', sourceHash: pack.sourceHash, taskId: task.id,
    status: 'blocked', progressPercent: 20, note: 'Mixer trips after a few seconds under load.',
    equipmentIssue: { reservationId: reservation.id, issueType: 'malfunction', note: 'Mixer trips after a few seconds under load.' } };
  const result = service.progress(job.id, worker.id, payload, 'trusted-field-worker');
  assert.equal(result.record.progress.status, 'blocked');
  assert.equal(result.record.progress.taskId, task.id);
  assert.equal(ledger.getEquipmentCustodySession(checkout.custody.id).status, 'checked_out');
  assert.equal(ledger.listTools({ search: 'Concrete mixer' })[0].status, 'maintenance');
  const recovery = new (require('../operational-recovery').OperationalRecovery)(ledger).list(job.id);
  const source = recovery.sources.find(item => item.type === 'equipment_unavailable' && item.id === reservation.id);
  assert.equal(source.impact.unresolved, true);
  assert.deepEqual(source.impact.fieldSafetyHold, {
    id: ledger.listTools({ search: 'Concrete mixer' })[0].data.fieldSafetyHold.id, status: 'open', issueType: 'malfunction',
    note: payload.note, taskId: task.id, workerId: worker.id, reportedAt: source.impact.fieldSafetyHold.reportedAt,
    custodySessionId: checkout.custody.id
  });
  ledger.returnEquipment(job.id, checkout.custody.id, {
    returnedBy: worker.name, condition: 'serviceable', evidenceReference: 'return:MIX-44',
    location: 'Site store', entryKey: 'mixer-return-01', notes: 'Returned after the equipment fault report.'
  });
  assert.equal(ledger.listTools({ search: 'Concrete mixer' })[0].status, 'maintenance');
  assert.throws(() => ledger.upsertTool({ id: tool.id, name: tool.name, status: 'available' }),
    { code: 'tool_field_safety_hold_open', statusCode: 409 });
  const inspection = ledger.recordToolInspection(tool.id, {
    result: 'passed', inspector: 'Site equipment inspector', reference: 'inspection:MIX-44', inspectedAt: new Date().toISOString()
  });
  assert.equal(inspection.tool.status, 'available');
  assert.equal(inspection.tool.data.fieldSafetyHold.status, 'resolved');
  assert.equal(service.progress(job.id, worker.id, payload, 'trusted-field-worker').replayed, true);
  assert.throws(() => service.progress(job.id, worker.id, { ...payload, entryKey: 'mixer-fault-other-task', taskId: 'not-in-this-work-pack' }, 'trusted-field-worker'),
    { statusCode: 409 });
  assert.throws(() => service.progress(job.id, worker.id, { ...payload, entryKey: 'mixer-fault-in-progress', status: 'in_progress' }, 'trusted-field-worker'),
    /reported as a task blocker/);
  assert.equal(ledger.verifyAuditIntegrity().valid, true);
});

test('assignment revocation removes access and list scope applies before pagination', t => {
  const { ledger, service, job, worker } = fixture(t);
  assert.equal(service.list({ workerId: worker.id }, {}).rows[0].id, job.id);
  assert.equal(service.list({ workerId: 'unassigned' }, {}).rows.length, 0);
  for (const status of ['released', 'declined', 'offline']) {
    ledger.db.prepare('UPDATE assignments SET status = ? WHERE job_id = ?').run(status, job.id);
    assert.throws(() => service.read(job.id, worker.id), { statusCode: 403 });
    assert.equal(service.list({ workerId: worker.id }, {}).rows.length, 0);
    assert.equal(service.workers(job.id).length, 0);
  }
  ledger.db.prepare("UPDATE assignments SET status = 'assigned' WHERE job_id = ?").run(job.id);
  for (const status of ['pending_archive_approval', 'rejected', 'archived']) {
    ledger.db.prepare('UPDATE jobs SET status = ? WHERE id = ?').run(status, job.id);
    assert.equal(service.list({ workerId: worker.id }, {}).rows.length, 0);
    assert.throws(() => service.read(job.id, worker.id), { statusCode: 409 });
  }
});
