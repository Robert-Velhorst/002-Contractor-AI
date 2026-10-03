const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { ClientConversation, hash } = require('../client-conversation');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'field-pack-api-'));
process.env.LEDGER_DB_FILE = path.join(directory, 'ledger.sqlite');
process.env.STATE_FILE = path.join(directory, 'state.json');
process.env.UPLOAD_DIR = path.join(directory, 'uploads');
process.env.CONTRACTOR_AI_REQUIRE_AUTH = 'true';
const tokens = { owner: 'work-pack-owner-token-at-least-32-characters', field_worker: { token: 'work-pack-field-token-at-least-32-characters', workerId: 'pack-worker' }, office_operator: 'work-pack-office-token-at-least-32-characters' };
process.env.CONTRACTOR_AI_ROLE_TOKENS = JSON.stringify(tokens);
const ledger = new ContractorOperatingLedger({ dbFile: process.env.LEDGER_DB_FILE });
const worker = ledger.upsertWorker({ id: 'pack-worker', name: 'Field worker', role: 'Carpenter', status: 'available', hourlyRate: 83 });
const peerWorker = ledger.upsertWorker({ id: 'peer-worker', name: 'Peer worker', role: 'Electrician', status: 'available', hourlyRate: 91 });
const job = ledger.createIntake({ title: 'Scoped work pack', client: { name: 'Client' }, assignAutomatically: false });
const other = ledger.createIntake({ title: 'Unassigned private job', client: { name: 'Private' }, assignAutomatically: false });
const foreignTask = ledger.addTask(other.id, { title: 'Foreign task' });
assert.throws(
  () => ledger.createSubmittalRecord(job.id, { title: 'Invalid cross-job submittal', taskIds: [foreignTask.id] }),
  error => error.code === 'submittal_task_not_in_job' && error.statusCode === 400,
);
const assignment = ledger.addAssignment(job.id, { workerId: worker.id, status: 'assigned', role: 'Carpenter' });
const peerAssignment = ledger.addAssignment(job.id, { workerId: peerWorker.id, status: 'assigned', role: 'Electrician' });
const unscopedDocument = ledger.addDocument(job.id, { title: 'Unscoped project attachment', type: 'document', filename: 'shared-reference.pdf' });
const visibleMaterial = ledger.addMaterialRequirement(job.id, { name: 'Visible fixings', quantity: 12, unit: 'pcs' });
const privateMaterial = ledger.addMaterialRequirement(job.id, { name: 'Private finish material', quantity: 3, unit: 'pcs' });
const task = ledger.addTask(job.id, { title: 'Install frame', assigneeId: worker.id, durationHours: 4, materialRequirementIds: [visibleMaterial.id] });
const privateTask = ledger.addTask(job.id, { title: 'Private task', assigneeId: peerWorker.id, materialRequirementIds: [privateMaterial.id] });
const peerInspection = ledger.createInspectionRecord(job.id, { title: 'Peer-only inspection' });
ledger.db.prepare('UPDATE inspection_records SET data_json = ? WHERE id = ?')
  .run(JSON.stringify({ ...peerInspection.data, taskId: privateTask.id }), peerInspection.id);
const peerNonconformance = ledger.createNonconformance(job.id, {
  entryKey: 'peer-task-ncr-api-fixture',
  workerId: peerWorker.id,
  workerName: peerWorker.name,
  taskId: privateTask.id,
  severity: 'medium',
  discipline: 'electrical',
  title: 'Peer task quality finding',
  description: 'Quality evidence belongs to the peer task.',
  location: 'Level 2, peer work area',
  detectedAt: new Date().toISOString(),
  raisedBy: peerWorker.name,
  requirementReference: 'Peer task specification',
  immediateContainment: 'Peer work held for review.',
  responsibleParty: 'Peer supervisor',
  dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}).nonconformance;
ledger.db.prepare('UPDATE assignments SET data_json = ? WHERE id = ?').run(JSON.stringify({ workBoardPositionId: 'position-api-scope', workBoardTaskIds: [task.id] }), assignment.id);
const ownOrientation = ledger.createWorkerOrientation(job.id, { assignmentId: assignment.id, status: 'scheduled' });
ledger.createWorkerOrientation(job.id, { assignmentId: peerAssignment.id, status: 'scheduled' });
ledger.createSiteAccessLog(job.id, { assignmentId: assignment.id, status: 'blocked', workerName: worker.name });
ledger.createSiteAccessLog(job.id, { assignmentId: peerAssignment.id, status: 'blocked', workerName: peerWorker.name });
const ownSafetyMeeting = ledger.createSafetyMeeting(job.id, { title: 'Own toolbox talk', assignmentIds: [assignment.id], topics: ['Own task hazard'] });
  const peerSafetyMeeting = ledger.createSafetyMeeting(job.id, { title: 'Peer toolbox talk', assignmentIds: [peerAssignment.id], topics: ['Peer task hazard'] });
const closedTask = ledger.addTask(job.id, { title: 'Already completed task', assigneeId: worker.id });
ledger.db.prepare("UPDATE job_tasks SET status = 'completed' WHERE id = ?").run(closedTask.id);
const draftSubmittal = ledger.createSubmittalRecord(job.id, {
  title: 'Unreviewed finish specification', status: 'draft', reviewer: 'Private reviewer',
  attachments: ['private-document-draft']
});
const approvedSubmittal = ledger.createSubmittalRecord(job.id, {
  title: 'Approved frame specification', packageName: 'Frame package', status: 'approved',
  responsible: 'Private supplier contact', reviewer: 'Private technical reviewer',
  attachments: ['private-approved-document']
});
assert.deepEqual(approvedSubmittal.approval.decision.preview.taskScope, ['Entire job']);
ledger.resolveApproval(approvedSubmittal.approval.id, {
  status: 'approved', resolvedBy: 'Test approver', reason: 'Field-use specification reviewed.'
});
const taskLinkedSubmittal = ledger.createSubmittalRecord(job.id, {
  title: 'Approved frame installation specification', status: 'approved', taskIds: [task.id]
});
assert.deepEqual(taskLinkedSubmittal.approval.decision.preview.taskScope, [task.title]);
ledger.resolveApproval(taskLinkedSubmittal.approval.id, { status: 'approved', reason: 'Verified for frame installation.' });
const peerTaskSubmittal = ledger.createSubmittalRecord(job.id, {
  title: 'Peer electrical specification', status: 'approved', taskIds: [privateTask.id]
});
ledger.resolveApproval(peerTaskSubmittal.approval.id, { status: 'approved', reason: 'Verified for electrical installation.' });
const changedScopeSubmittal = ledger.createSubmittalRecord(job.id, {
  title: 'Scope change during review', status: 'approved', taskIds: [task.id]
});
ledger.db.prepare('UPDATE submittal_records SET data_json = ? WHERE id = ?')
  .run(JSON.stringify({ ...changedScopeSubmittal.data, taskIds: [] }), changedScopeSubmittal.id);
assert.throws(
  () => ledger.resolveApproval(changedScopeSubmittal.approval.id, { status: 'approved' }),
  error => error.code === 'submittal_approval_scope_changed' && error.statusCode === 409,
);
assert.equal(ledger.mapApproval(ledger.db.prepare('SELECT * FROM approvals WHERE id = ?').get(changedScopeSubmittal.approval.id)).status, 'pending');
const draftJha = ledger.createJhaRecord(job.id, {
  title: 'Unreviewed demolition method', status: 'draft', riskLevel: 'high',
  hazards: ['Dust'], controls: ['Extraction'], assignee: 'Private safety reviewer',
  notes: 'Internal review notes must not reach the field.'
});
const approvedJha = ledger.createJhaRecord(job.id, {
  title: 'Approved frame installation', status: 'approved', riskLevel: 'medium',
  hazards: ['Manual handling'], controls: ['Team lift'], assignee: 'Private safety reviewer',
  workMethod: 'Install from stable platform.', ppe: ['Safety footwear'],
  stopWorkTriggers: ['Platform movement'], linkedTaskIds: [task.id], notes: 'Internal acceptance notes must not reach the field.'
});
ledger.resolveApproval(approvedJha.approval.id, {
  status: 'approved', resolvedBy: 'Test approver', reason: 'Hazards and controls verified for field use.'
});
const privateTaskJha = ledger.createJhaRecord(job.id, {
  title: 'Peer-only electrical isolation JHA', status: 'approved', riskLevel: 'high',
  hazards: ['Live electrical equipment'], controls: ['Isolate and prove dead'], linkedTaskIds: [privateTask.id]
});
ledger.resolveApproval(privateTaskJha.approval.id, { status: 'approved', reason: 'Verified for the separate electrical task.' });
const unscopedLegacyJha = ledger.createJhaRecord(job.id, {
  title: 'Legacy job-wide JHA', status: 'approved', riskLevel: 'medium', hazards: ['Access'], controls: ['Check access']
});
ledger.resolveApproval(unscopedLegacyJha.approval.id, { status: 'approved', reason: 'Legacy record retained for migration coverage.' });
const tamperedJha = ledger.createJhaRecord(job.id, {
  title: 'JHA with changed approved source', status: 'approved', riskLevel: 'medium',
  hazards: ['Manual handling'], controls: ['Team lift'], linkedTaskIds: [task.id]
});
ledger.resolveApproval(tamperedJha.approval.id, { status: 'approved', reason: 'Source verified before deliberate tampering test.' });
ledger.db.prepare('UPDATE jha_records SET controls_json = ? WHERE id = ?').run(JSON.stringify(['Changed after approval']), tamperedJha.id);
const unapprovedCurrentSds = ledger.createSdsSheet(job.id, {
  material: 'Unreviewed solvent', status: 'current', requiresApproval: false,
  hazardClasses: ['Flammable liquid'], requiredPpe: ['Gloves']
});
const approvedSds = ledger.createSdsSheet(job.id, {
  material: 'Approved frame adhesive', manufacturer: 'Example manufacturer', productCode: 'FA-100',
  status: 'current', documentReference: 'frame-adhesive-sds.pdf', language: 'nl', issuedOn: '2026-01-01',
  expiresAt: '2027-01-01T00:00:00.000Z', hazardClasses: ['Skin irritation'],
  requiredPpe: ['Protective gloves'], firstAidMeasures: 'Rinse with water.',
  fireMeasures: 'Use foam extinguisher.', handlingStorage: 'Keep container closed.',
  spillResponse: 'Absorb with inert material.', disposal: 'Dispose via approved collector.',
  emergencyContact: 'Site emergency desk'
});
ledger.resolveApproval(approvedSds.approval.id, {
  status: 'approved', resolvedBy: 'Test approver', reason: 'Current manufacturer SDS verified.'
});
const unrelatedRfi = ledger.createRfi(job.id, { title: 'Office-only question', question: 'Internal review item', response: 'Internal response', status: 'answered', source: 'office' }, { actor: 'office_operator' });
ledger.close();
const app = require('../server');

test('work-pack API binds field identity, filters dossiers and blocks impersonation', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const apiLedger = new ContractorOperatingLedger({ dbFile: process.env.LEDGER_DB_FILE });
  t.after(async () => { await app.locals.runtimeControl.shutdown({ server, signal: 'field_work_pack_test' }); apiLedger.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, token, data, method) {
    const response = await fetch(base + route, { method: method || (data ? 'POST' : 'GET'), headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, ...(data ? { body: JSON.stringify(data) } : {}) });
    return { status: response.status, body: await response.json() };
  }
  async function patch(route, token, data) {
    const response = await fetch(base + route, { method: 'PATCH', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    return { status: response.status, body: await response.json() };
  }
  const field = tokens.field_worker.token;
  const route = `/api/ledger/jobs/${job.id}/work-pack`;
  const taskJhaRoute = `/api/ledger/jobs/${job.id}/tasks/${task.id}/jha-applicability`;
  const officeCannotWaiveTaskJha = await patch(taskJhaRoute, tokens.office_operator, {
    status: 'not_required', reason: 'Task review confirms no task-specific hazards need a JHA.', entryKey: 'jha-scope-office-001'
  });
  assert.equal(officeCannotWaiveTaskJha.status, 403);
  const fieldCannotReviewTaskJha = await patch(taskJhaRoute, field, {
    status: 'required', reason: 'The task includes manual frame lifting and fall exposure.', entryKey: 'jha-scope-field-001'
  });
  assert.equal(fieldCannotReviewTaskJha.status, 403);
  const requiredTaskJha = await patch(taskJhaRoute, tokens.office_operator, {
    status: 'required', reason: 'The task includes manual frame lifting and fall exposure.', entryKey: 'jha-scope-required-001'
  });
  assert.equal(requiredTaskJha.status, 200, JSON.stringify(requiredTaskJha.body));
  assert.equal(requiredTaskJha.body.task.jhaApplicability.status, 'required');
  const replayedTaskJha = await patch(taskJhaRoute, tokens.office_operator, {
    status: 'required', reason: 'The task includes manual frame lifting and fall exposure.', entryKey: 'jha-scope-required-001'
  });
  assert.equal(replayedTaskJha.body.replayed, true);
  const ownerWaivesTaskJha = await patch(taskJhaRoute, tokens.owner, {
    status: 'not_required', reason: 'Reviewed simple placement with no additional task hazards.', entryKey: 'jha-scope-waiver-001'
  });
  assert.equal(ownerWaivesTaskJha.status, 200);
  assert.equal(ownerWaivesTaskJha.body.task.jhaApplicability.status, 'not_required');
  await patch(taskJhaRoute, tokens.office_operator, {
    status: 'required', reason: 'The task includes manual frame lifting and fall exposure.', entryKey: 'jha-scope-required-002'
  });
  const foreignJha = await request(`/api/ledger/jobs/${job.id}/jhas`, tokens.office_operator, {
    title: 'Cross-job JHA', status: 'draft', hazards: ['Access'], controls: ['Verify access'], linkedTaskIds: [foreignTask.id]
  });
  assert.equal(foreignJha.status, 409);
  assert.equal((await request('/api/ledger/work-packs')).status, 401);
  const list = await request('/api/ledger/work-packs', field);
  assert.deepEqual(list.body.rows.map(row => row.id), [job.id]);
  assert.equal((await request(`/api/ledger/jobs/${other.id}/work-pack`, field)).status, 403);
  assert.equal((await request(`${route}?workerId=someone-else`, field)).status, 403);
  const unbriefedPack = (await request(`${route}?workerId=${worker.id}`, tokens.owner)).body.pack;
  const unbriefedRelease = await request(`${route}/start-release`, tokens.owner, {
    entryKey: 'missing-huddle-api-release', workerId: worker.id, assignmentId: assignment.id,
    sourceHash: unbriefedPack.sourceHash, reason: 'Supervisor reviewed the work area.',
    evidenceReference: 'site-check:before-huddle',
    checks: ['siteConditionsChecked', 'methodAndControlsReviewed', 'requiredPermitsConfirmed',
      'crewAndQualificationsChecked', 'equipmentAndPpeAvailable', 'emergencyArrangementsKnown'],
    expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  });
  assert.equal(unbriefedRelease.status, 409);
  assert.equal(unbriefedRelease.body.error.code, 'start_release_blocked');
  assert.ok(unbriefedRelease.body.error.details.blockers.some(message => message.includes('A released start huddle')));
  const shiftStart = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  shiftStart.setUTCHours(7, 0, 0, 0);
  const shiftEnd = new Date(shiftStart.getTime() + 8 * 60 * 60 * 1000);
  apiLedger.db.prepare('UPDATE assignments SET scheduled_start = ?, scheduled_end = ? WHERE id = ?')
    .run(shiftStart.toISOString(), shiftEnd.toISOString(), assignment.id);
  const huddleDate = shiftStart.toISOString().slice(0, 10);
  apiLedger.createDailyStartHuddle(job.id, {
    entryKey: 'field-pack-api-own-shift-huddle', workDate: huddleDate, shiftLabel: 'day',
    facilitator: 'Site lead', leadWorkerId: worker.id, workerIds: [worker.id],
    plannedWork: 'Complete only this worker\'s released task scope.', productionTarget: 'Inspect the completed frame.',
    weather: 'Dry', siteConditions: 'Use the marked access route.', safetyFocus: 'Keep the route clear.',
    qualityHoldPoints: ['Verify level before fixing'], constraints: ['Confirm materials at arrival'],
    evidenceReference: 'api-huddle-signoff'
  }, { actor: 'site_lead' });
  const pack = (await request(route, field)).body.pack;
  assert.equal(pack.worker.id, worker.id);
  assert.equal(pack.assignments[0].dailyBriefing.status, 'ready');
  assert.equal(pack.assignments[0].dailyBriefing.plannedWork, 'Complete only this worker\'s released task scope.');
  assert.equal(pack.startReleaseEligibility[0].blockers.some(message => message.includes('A released start huddle')), false);
  assert.equal(JSON.stringify(pack).includes('crewSchedule'), false);
  assert.equal(JSON.stringify(pack).includes(peerWorker.name), false);
  assert.equal(JSON.stringify(pack).includes('hourlyRate'), false);
  assert.deepEqual(pack.know.jhaApplicability, [{ taskId: task.id, title: task.title, status: 'required' }]);
  assert.ok(pack.startReleaseEligibility[0].blockers.some(message => message.includes('not included in a safety plan that covers this task')), JSON.stringify(pack.startReleaseEligibility[0]));
  assert.deepEqual(pack.know.sdsSheets, [], 'task-scoped workers must not receive an SDS with no explicit material link');
  assert.deepEqual(pack.know.jhas.map(item => item.id), [approvedJha.id], 'the work pack must include only intact approved JHAs linked to visible tasks');
  assert.deepEqual(pack.know.jhas[0].linkedTaskIds, [task.id]);
  const payload = { entryKey: 'api-work-pack-ack', sourceHash: pack.sourceHash, understood: true, actor: 'spoofed', workerId: 'someone-else' };
  for (const token of [tokens.owner, tokens.office_operator]) assert.equal((await request(`${route}/acknowledgments`, token, payload)).status, 403);
  const result = await request(`${route}/acknowledgments`, field, payload);
  assert.equal(result.status, 201);
  assert.equal(result.body.record.workerId, worker.id);
  assert.equal(result.body.record.snapshot.sourceHash, pack.sourceHash);
  assert.equal((await request(`${route}/acknowledgments`, field, payload)).body.replayed, true);
  const question = await request(`${route}/questions`, field, { sourceHash: pack.sourceHash, entryKey: 'api-work-pack-question', message: 'Which drawing revision should I follow?' });
  assert.equal(question.status, 201);
  assert.equal(question.body.report.status, 'pending_approval');
  assert.ok(question.body.record.rfiId);
  const officeReply = await fetch(`${base}/api/ledger/jobs/${job.id}/lifecycle/rfi/${question.body.record.rfiId}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${tokens.office_operator}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ status: 'answered', response: 'Use the currently approved drawing revision.', notes: 'Verified against the drawing register.' })
  });
  const pendingReply = await officeReply.json();
  assert.equal(officeReply.status, 200);
  assert.equal(pendingReply.record.status, 'pending_approval');
  assert.equal((await request('/api/work-board/notifications', field)).body.notifications.some(item => item.type === 'field_reply'), false);
  const pendingJobResponse = await request(`/api/ledger/jobs/${job.id}`, field);
  assert.equal(pendingJobResponse.status, 200, JSON.stringify(pendingJobResponse.body));
  const pendingJob = pendingJobResponse.body.job;
  assert.equal(pendingJob.inspections.some(item => item.id === peerInspection.id), false);
  const peerInspectionSubmission = await request(
    `/api/ledger/jobs/${job.id}/inspections/${peerInspection.id}/checklist-submissions`,
    field,
    {}
  );
  assert.equal(peerInspectionSubmission.status, 403);
  assert.equal(peerInspectionSubmission.body.error.code, 'field_inspection_scope_forbidden');
  assert.ok(pendingJob.tasks.some(item => item.id === task.id));
  assert.equal(pendingJob.tasks.some(item => item.id === privateTask.id), false);
  const peerTaskTransition = await patch(`/api/ledger/jobs/${job.id}/lifecycle/task/${privateTask.id}`, field, { status: 'blocked', notes: 'Attempt to edit a peer task.' });
  assert.equal(peerTaskTransition.status, 403);
  assert.equal(peerTaskTransition.body.error.code, 'field_task_scope_forbidden');
  const peerTaskProgress = await request(`/api/ledger/jobs/${job.id}/progress`, field, {
    entryKey: 'field-peer-task-progress', taskId: privateTask.id, status: 'blocked', progressPercent: 25, note: 'Peer task update attempt.'
  });
  assert.equal(peerTaskProgress.status, 403);
  assert.equal(peerTaskProgress.body.error.code, 'field_task_scope_forbidden');
  const peerPhotoUpload = await request('/api/ledger/upload', field, {
    jobId: job.id, photoEvidenceSetId: 'peer-photo-workflow', title: 'Unauthorized peer photo'
  });
  assert.equal(peerPhotoUpload.status, 403);
  assert.equal(peerPhotoUpload.body.error.code, 'field_photo_evidence_scope_forbidden');
  const peerMaterialReceipt = await request(`/api/ledger/jobs/${job.id}/material-receipts`, field, {
    entryKey: 'field-peer-material-receipt', receiptReference: 'PEER-DELIVERY-001', evidenceReference: 'peer-delivery-ticket',
    receivedBy: 'Spoofed receiver', lines: [{ materialRequirementId: privateMaterial.id, itemName: 'Private finish material', unit: 'pcs', receivedQuantity: 3, acceptedQuantity: 3 }]
  });
  assert.equal(peerMaterialReceipt.status, 403);
  assert.equal(peerMaterialReceipt.body.error.code, 'field_material_scope_forbidden');
  assert.deepEqual(pendingJob.assignments.map(item => item.id), [assignment.id]);
  assert.deepEqual(pendingJob.materials.map(item => item.id), [visibleMaterial.id]);
  assert.deepEqual(new Set(pendingJob.submittals.map(item => item.id)), new Set([taskLinkedSubmittal.id, approvedSubmittal.id]));
  assert.equal(pendingJob.submittals.some(item => item.id === peerTaskSubmittal.id), false);
  assert.equal(pendingJob.submittals.some(item => item.id === draftSubmittal.id), false);
  assert.equal(pendingJob.submittals[0].attachments, undefined);
  assert.equal(pendingJob.submittals[0].responsible, undefined);
  assert.equal(pendingJob.submittals[0].reviewer, undefined);
  assert.equal(pendingJob.submittals[0].approvalId, undefined);
  assert.deepEqual(pendingJob.submittals[0].taskIds, undefined, 'task linkage stays internal to the field projection');
  assert.deepEqual(pendingJob.jhas.map(item => item.id), [approvedJha.id]);
  assert.equal(pendingJob.jhas.some(item => item.id === draftJha.id), false);
  assert.deepEqual(pendingJob.jhas[0].hazards, ['Manual handling']);
  assert.deepEqual(pendingJob.jhas[0].controls, ['Team lift']);
  assert.equal(pendingJob.jhas[0].workMethod, 'Install from stable platform.');
  assert.deepEqual(pendingJob.jhas[0].ppe, ['Safety footwear']);
  assert.deepEqual(pendingJob.jhas[0].stopWorkTriggers, ['Platform movement']);
  assert.equal(pendingJob.jhas[0].assignee, undefined);
  assert.equal(pendingJob.jhas[0].approvalId, undefined);
  assert.equal(JSON.stringify(pendingJob.jhas).includes('Internal acceptance notes'), false);
  assert.deepEqual(pendingJob.jhas[0].linkedTaskIds, [task.id]);
  assert.deepEqual(pendingJob.sdsSheets, [], 'the generic field job detail must apply the same SDS material scope');
  assert.equal(pendingJob.sdsSheets.some(item => item.id === unapprovedCurrentSds.id), false);
  assert.deepEqual(pendingJob.orientations.map(item => item.id), [ownOrientation.id]);
  assert.deepEqual(pendingJob.siteAccessLogs.map(item => item.workerName), [worker.name]);
  assert.deepEqual(pendingJob.safetyMeetings.map(item => item.id), [ownSafetyMeeting.id]);
  assert.equal(JSON.stringify(pendingJob).includes(peerWorker.name), false);
  const peerTaskFindings = await request(`/api/ledger/jobs/${job.id}/nonconformances`, field);
  assert.equal(peerTaskFindings.status, 200);
  assert.equal(peerTaskFindings.body.nonconformances.some(item => item.id === peerNonconformance.id), false);
  const directBriefings = await request(`/api/ledger/jobs/${job.id}/safety-meetings`, field);
  assert.deepEqual(directBriefings.body.safetyMeetings.map(item => item.id), [ownSafetyMeeting.id]);
  const peerBriefingAcknowledgment = await request(`/api/ledger/jobs/${job.id}/safety-meetings/${peerSafetyMeeting.id}/acknowledgments`, field, {
    acknowledged: true, briefingContentHash: 'a'.repeat(64), evidenceReference: 'peer-briefing-evidence', entryKey: 'field-peer-briefing-ack'
  });
  assert.equal(peerBriefingAcknowledgment.status, 403);
  assert.equal(peerBriefingAcknowledgment.body.error.code, 'field_safety_briefing_scope_forbidden');
  const briefingFeed = await request(`/api/ledger/safety-briefings?jobId=${job.id}`, field);
  assert.deepEqual(briefingFeed.body.safetyMeetings.map(item => item.id), [ownSafetyMeeting.id]);
  assert.equal(pendingJob.rfis.find(item => item.id === question.body.record.rfiId).response, null);
  let fieldQuestions = (await request(route, field)).body.pack.questions;
  assert.equal(fieldQuestions[0].replyStatus, 'pending_approval');
  assert.equal(fieldQuestions[0].response, null);
  const replyFeed = await request(`${route}/replies`, field);
  assert.equal(replyFeed.status, 200);
  assert.equal(replyFeed.body.questions[0].response, null);
  assert.equal((await request(`/api/ledger/jobs/${other.id}/work-pack/replies`, field)).status, 403);
  const approved = await request(`/api/ledger/approvals/${pendingReply.approval.id}/resolve`, tokens.owner, { status: 'approved', reason: 'Confirmed against released drawing.' });
  assert.equal(approved.status, 200);
  const replyInbox = await request('/api/work-board/notifications', field);
  assert.equal(replyInbox.body.notifications[0].type, 'field_reply');
  assert.equal(replyInbox.body.notifications[0].title, 'Antwoord op je werkvraag');
  assert.match(replyInbox.body.notifications[0].body, /Use the currently approved drawing revision\./);
  assert.equal(replyInbox.body.notifications[0].body.includes('Confirmed against released drawing.'), false);
  assert.equal((await request('/api/work-board/notifications', tokens.office_operator)).status, 401);
  const duplicateApproval = await request(`/api/ledger/approvals/${pendingReply.approval.id}/resolve`, tokens.owner, { status: 'approved' });
  assert.equal(duplicateApproval.status, 200);
  assert.equal((await request('/api/work-board/notifications', field)).body.notifications.filter(item => item.type === 'field_reply').length, 1);
  assert.equal((await request(`/api/ledger/approvals/${unrelatedRfi.approvalId}/resolve`, tokens.owner, { status: 'approved' })).status, 200);
  assert.equal((await request('/api/work-board/notifications', field)).body.notifications.filter(item => item.type === 'field_reply').length, 1);
  fieldQuestions = (await request(route, field)).body.pack.questions;
  assert.equal(fieldQuestions[0].replyStatus, 'answered');
  assert.equal(fieldQuestions[0].response, 'Use the currently approved drawing revision.');
  const approvedFeed = await request(`${route}/replies`, field);
  assert.equal(approvedFeed.body.questions[0].replyStatus, 'answered');
  assert.equal(approvedFeed.body.questions[0].response, fieldQuestions[0].response);
  const fieldProjectBeforeClientShare = (await request(`/api/ledger/jobs/${job.id}`, field)).body.job;
  assert.equal(fieldProjectBeforeClientShare.rfis.some(item => item.id === unrelatedRfi.id), false,
    'office-only RFI content must not be exposed in field project detail');

  const peerIncident = apiLedger.createIncidentRecord(job.id, {
    entryKey: 'api-peer-incident-scope', title: 'Peer task incident', severity: 'low',
    taskId: privateTask.id, reporterWorkerId: peerWorker.id, reportedBy: peerWorker.name,
    description: 'Private incident detail belonging to another worker.'
  }, { actor: 'office-operator' });
  const ownIncidentResponse = await request(`/api/ledger/jobs/${job.id}/incidents`, field, {
    entryKey: 'api-own-incident-scope', title: 'Own task near miss', severity: 'low',
    incidentType: 'near_miss', taskId: task.id, reporterWorkerId: peerWorker.id,
    reportedBy: peerWorker.name, description: 'A panel shifted inside my work area.'
  });
  assert.equal(ownIncidentResponse.status, 201, JSON.stringify(ownIncidentResponse.body));
  assert.equal(ownIncidentResponse.body.incident.reportedBy, worker.name,
    'the API must replace a client-supplied reporter name with the authenticated worker identity');
  assert.equal(ownIncidentResponse.body.incident.data, undefined,
    'field incident writes must not echo private ledger data');
  const ownIncidentId = ownIncidentResponse.body.incident.id;
  const fieldIncidentDetail = (await request(`/api/ledger/jobs/${job.id}`, field)).body.job;
  assert.ok(fieldIncidentDetail.incidents.some(row => row.id === ownIncidentId));
  assert.equal(fieldIncidentDetail.incidents.some(row => row.id === peerIncident.id), false,
    'incident detail for a colleague and peer-only task must remain hidden');
  assert.equal(JSON.stringify(fieldIncidentDetail.incidents).includes('Private incident detail'), false);
  const officeIncidentDetail = (await request(`/api/ledger/jobs/${job.id}`, tokens.office_operator)).body.job;
  assert.ok(officeIncidentDetail.incidents.some(row => row.id === peerIncident.id),
    'office users retain visibility of the complete incident register');

  const crossJobIncident = await request(`/api/ledger/jobs/${job.id}/incidents`, field, {
    entryKey: 'api-cross-job-incident', title: 'Invalid cross-job incident', severity: 'low', taskId: foreignTask.id
  });
  assert.equal(crossJobIncident.status, 403);
  assert.equal(crossJobIncident.body.error.code, 'field_task_scope_forbidden');

  const portal = apiLedger.createClientPortalAccess(job.id);
  apiLedger.resolveApproval(portal.approval.id, { status: 'approved', reason: 'Client portal access reviewed.' });
  const conversation = new ClientConversation(apiLedger);
  const customerMessage = conversation.create(portal.id, {
    entryKey: 'api-client-field-message', body: 'Please verify the frame opening before installation.'
  }, { direction: 'inbound' });
  const analysisIdentity = hash('api-client-field-analysis');
  conversation.record('conversation_analysis', portal.id, job.id, 'retain_conversation_analysis', {
    identity: analysisIdentity,
    sourceHash: hash(conversation.analysisSources(portal.id)),
    findings: [{ sourceId: customerMessage.id, quote: customerMessage.body, category: 'question',
      suggestion: 'Compare the approved drawing to the measured opening.', uncertainty: 'The measurement is not yet confirmed.' }]
  }, 'local_model');
  const clientRfi = conversation.createRfiFromFinding(portal.id, {
    entryKey: 'api-client-field-rfi', analysisIdentity, sourceId: customerMessage.id,
    quote: customerMessage.body, category: 'question', title: 'Verify frame opening',
    question: 'Measure the opening and compare it with the released drawing.', responsible: 'Site lead',
    dueAt: new Date(Date.now() + 48 * 60 * 60_000).toISOString(),
    shareWithField: true, fieldTaskIds: [task.id]
  }, 'office-operator').rfi;
  assert.equal((await request(`/api/ledger/jobs/${job.id}`, field)).body.job.rfis.some(item => item.id === clientRfi.id), false,
    'a client question must remain hidden until its exact answer is approved for the visible task');
  const clientAnswer = apiLedger.transitionLifecycleRecord(job.id, 'rfi', clientRfi.id, {
    status: 'answered', response: 'Verified on site: 900 mm; follow drawing A-12.'
  }, { actor: 'office-operator' });
  const clientApproval = await request(`/api/ledger/approvals/${clientAnswer.approval.id}/resolve`, tokens.owner,
    { status: 'approved', reason: 'Measurement checked against the released drawing.' });
  assert.equal(clientApproval.status, 200, JSON.stringify(clientApproval.body));
  const approvedFieldRfi = (await request(`/api/ledger/jobs/${job.id}`, field)).body.job.rfis.find(item => item.id === clientRfi.id);
  assert.equal(approvedFieldRfi.response, 'Verified on site: 900 mm; follow drawing A-12.');
  assert.equal(Object.hasOwn(approvedFieldRfi, 'data'), false);
  const peerSharedRfi = apiLedger.createRfi(job.id, {
    title: 'Peer electrical detail', question: 'Check the electrical route.', status: 'open', source: 'client_conversation_analysis',
    fieldShareEnabled: true, fieldTaskIds: [privateTask.id]
  }, { actor: 'office-operator' });
  const peerAnswer = apiLedger.transitionLifecycleRecord(job.id, 'rfi', peerSharedRfi.id, {
    status: 'answered', response: 'Route is marked on drawing E-04.'
  }, { actor: 'office-operator' });
  assert.equal((await request(`/api/ledger/approvals/${peerAnswer.approval.id}/resolve`, tokens.owner,
    { status: 'approved', reason: 'Peer electrical route verified.' })).status, 200);
  assert.equal((await request(`/api/ledger/jobs/${job.id}`, field)).body.job.rfis.some(item => item.id === peerSharedRfi.id), false,
    'an approved answer shared to a peer-only task must stay outside this worker projection');
  const clientNoticeResponse = await request('/api/work-board/notifications', field);
  const clientNotice = clientNoticeResponse.body.notifications.find(item => item.sourceId === clientRfi.id);
  assert.ok(clientNotice, JSON.stringify(clientNoticeResponse.body));
  assert.equal(clientNotice.title, 'Nieuwe goedgekeurde klantinformatie');
  assert.match(clientNotice.body, /Install frame/);
  assert.doesNotMatch(clientNotice.body, /900 mm|A-12|Please verify|Compare the approved drawing|not yet confirmed/);
  assert.equal(clientNoticeResponse.body.notifications.some(item => item.sourceId === clientRfi.id && item.type !== 'field_reply'), false);

  const currentPack = (await request(route, field)).body.pack;
  assert.notEqual(currentPack.sourceHash, pack.sourceHash, 'approved customer information advances the work-pack source version');
  const progressRoute = `${route}/progress`;
  const beforeTaskProgress = (await request(`/api/ledger/jobs/${job.id}`, tokens.owner)).body.job;
  const progressPayload = { sourceHash: currentPack.sourceHash, entryKey: 'api-work-pack-progress', taskId: task.id, status: 'in_progress', progressPercent: 35, note: 'Kabelgoten op verdieping een geplaatst.' };
  assert.equal((await request(progressRoute, tokens.owner, progressPayload)).status, 403);
  assert.equal((await request(`/api/ledger/jobs/${other.id}/work-pack/progress`, field, progressPayload)).status, 403);
  assert.equal((await request(progressRoute, field, { ...progressPayload, entryKey: 'api-work-pack-empty', progressPercent: '' })).status, 400);
  const progress = await request(progressRoute, field, progressPayload);
  assert.equal(progress.status, 201);
  assert.equal(progress.body.record.workerId, worker.id);
  assert.equal(progress.body.record.progress.status, 'in_progress');
  assert.equal(progress.body.record.progress.progressPercent, 35);
  const retainedTaskProgress = (await request(`/api/ledger/jobs/${job.id}`, tokens.owner)).body.job.progress.find(item => item.id === progress.body.record.progress.id);
  assert.equal(retainedTaskProgress.data.taskId, task.id);
  assert.equal((await request(progressRoute, field, { ...progressPayload, entryKey: 'api-work-pack-private-task', taskId: privateTask.id })).status, 409);
  assert.equal((await request(progressRoute, field, { ...progressPayload, entryKey: 'api-work-pack-closed-task', taskId: closedTask.id })).status, 409);
  assert.equal((await request(progressRoute, field, progressPayload)).body.replayed, true);
  assert.equal((await request(progressRoute, field, { ...progressPayload, note: 'Andere inhoud mag deze sleutel niet hergebruiken.' })).status, 409);
  const blockedProgress = await request(progressRoute, field, { ...progressPayload, entryKey: 'api-work-pack-block', status: 'blocked', note: 'Onderdeel ontbreekt op de bouwplaats.' });
  assert.equal(blockedProgress.status, 201);
  assert.equal(blockedProgress.body.record.progress.status, 'blocked');
  const recovery = await request(`/api/ledger/jobs/${job.id}/operational-recovery`, tokens.office_operator);
  const recoveryBlocker = recovery.body.sources.find(source => source.id === blockedProgress.body.record.progress.id);
  assert.equal(recovery.status, 200);
  assert.equal(recoveryBlocker.type, 'field_progress_blocker');
  assert.equal(recoveryBlocker.impact.note, 'Onderdeel ontbreekt op de bouwplaats.');
  assert.equal(recoveryBlocker.impact.taskId, task.id);
  assert.ok(recoveryBlocker.impact.scheduleProjection.affectedTasks.some(item => item.taskId === task.id && item.title === task.title));
  const mixer = apiLedger.upsertTool({ name: 'API site mixer', category: 'mixer', status: 'available' });
  const checkedOutAt = new Date(Date.now() - 60_000).toISOString();
  const mixerReservation = apiLedger.reserveTool(job.id, { toolId: mixer.id, taskId: task.id,
    neededFrom: checkedOutAt, neededUntil: new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString() });
  const mixerCheckout = apiLedger.checkoutEquipment(job.id, { reservationId: mixerReservation.id, workerId: worker.id,
    checkedOutAt,
    checkedOutBy: worker.name, condition: 'good', evidenceReference: 'handoff:API-MIX-1', location: 'Site store', entryKey: 'api-mixer-checkout' });
  const equipmentPack = (await request(route, field)).body.pack;
  assert.equal(equipmentPack.have.equipment.find(item => item.id === mixerReservation.id).custody.heldByYou, true);
  const equipmentReport = await request(progressRoute, field, {
    sourceHash: equipmentPack.sourceHash, entryKey: 'api-mixer-fault', taskId: task.id,
    status: 'blocked', progressPercent: 35, note: 'Mixer trips after a few seconds under load.',
    equipmentIssue: { reservationId: mixerReservation.id, issueType: 'malfunction', note: 'Mixer trips after a few seconds under load.' }
  });
  assert.equal(equipmentReport.status, 201);
  assert.equal(apiLedger.listTools({ search: 'API site mixer' })[0].status, 'maintenance');
  apiLedger.returnEquipment(job.id, mixerCheckout.custody.id, {
    returnedBy: worker.name, condition: 'serviceable', evidenceReference: 'return:API-MIX-1',
    location: 'Site store', entryKey: 'api-mixer-return', notes: 'Returned after fault report.'
  });
  const bypass = await request(`/api/ledger/tools/${mixer.id}`, tokens.owner, { name: mixer.name, status: 'available' }, 'PUT');
  assert.equal(bypass.status, 409);
  assert.equal(bypass.body.error.code, 'tool_field_safety_hold_open');
  const recoveryWithEquipment = await request(`/api/ledger/jobs/${job.id}/operational-recovery`, tokens.office_operator);
  const equipmentSource = recoveryWithEquipment.body.sources.find(source => source.id === mixerReservation.id && source.type === 'equipment_unavailable');
  assert.equal(equipmentSource.impact.fieldSafetyHold.status, 'open');
  assert.equal(equipmentSource.impact.fieldSafetyHold.note, 'Mixer trips after a few seconds under load.');
  assert.equal(equipmentSource.impact.unresolved, true);
  const inspection = await request(`/api/ledger/tools/${mixer.id}/inspections`, tokens.owner, {
    result: 'passed', inspector: 'API equipment inspector', reference: 'inspection:API-MIX-1', inspectedAt: new Date().toISOString()
  });
  assert.equal(inspection.status, 201);
  assert.equal(inspection.body.tool.status, 'available');
  assert.equal(inspection.body.tool.data.fieldSafetyHold.status, 'resolved');
  const afterTaskProgress = (await request(`/api/ledger/jobs/${job.id}`, tokens.owner)).body.job;
  assert.equal(afterTaskProgress.status, beforeTaskProgress.status);
  assert.equal(afterTaskProgress.progressPercent, beforeTaskProgress.progressPercent);
  assert.equal((await request(`/api/ledger/jobs/${job.id}/operational-recovery`, field)).status, 403);
  assert.equal((await request(progressRoute, field, { ...progressPayload, entryKey: 'api-work-pack-close', status: 'completed' })).status, 400);
  const detail = (await request(`/api/ledger/jobs/${job.id}`, tokens.owner)).body.job;
  assert.ok(detail.audit.some(event => event.action === 'retain_work_pack_acknowledgment' && event.actor !== 'spoofed'));
  assert.equal(detail.fieldReports.length, 1);

  const bytes = Buffer.from('%PDF-1.7\nScoped drawing\n%%EOF');
  const form = new FormData();
  form.set('jobId', job.id);
  form.set('category', 'drawing_pdf');
  form.set('evidenceFile', new Blob([bytes], { type: 'application/pdf' }), 'offline.pdf');
  const upload = await fetch(base + '/api/ledger/upload', { method: 'POST', headers: { Authorization: `Bearer ${tokens.owner}`, 'Idempotency-Key': 'field-drawing-upload-1' }, body: form });
  assert.equal(upload.status, 200);
  const document = (await upload.json()).ledgerDocument;
  const revision = await request(`/api/ledger/jobs/${job.id}/drawing-revisions`, tokens.owner, { entryKey: 'field-drawing-revision-1', sourceDocumentId: document.id, sheetNumber: 'A-01', revision: 'A', title: 'Scoped PDF', issueDate: '2026-01-01', revisionReason: 'First issue', linkedTaskIds: [task.id] });
  assert.equal(revision.status, 201);
  const drawing = revision.body.drawing;
  const fileRoute = `${route}/drawings/${drawing.id}/content`;
  assert.equal((await request(`${fileRoute}?sourceHash=${pack.sourceHash}`, field)).status, 409);
  await request(`/api/ledger/approvals/${drawing.approval.id}/resolve`, tokens.owner, { status: 'approved' });
  const createdSubmittal = await request(`/api/ledger/jobs/${job.id}/submittals`, tokens.office_operator, {
    title: 'Window installation specification', status: 'approved', taskIds: [task.id], attachments: [document.id]
  });
  assert.equal(createdSubmittal.status, 201);
  const scopedFileSubmittal = createdSubmittal.body.submittal;
  await request(`/api/ledger/approvals/${scopedFileSubmittal.approval.id}/resolve`, tokens.owner, { status: 'approved' });
  const freshPack = (await request(route, field)).body.pack;
  const fieldSubmittal = freshPack.know.submittals.find(item => item.id === scopedFileSubmittal.id);
  assert.ok(fieldSubmittal);
  assert.deepEqual(fieldSubmittal.taskIds, [task.id]);
  assert.deepEqual(fieldSubmittal.attachments.map(item => item.id), [document.id]);
  assert.equal(JSON.stringify(freshPack).includes(document.storageRef), false);
  const submittalUrl = `${route}/submittals/${scopedFileSubmittal.id}/documents/${document.id}/content?sourceHash=${freshPack.sourceHash}`;
  assert.equal((await request(submittalUrl)).status, 401);
  assert.equal((await request(`${route}/submittals/${scopedFileSubmittal.id}/documents/${document.id}/content?sourceHash=${freshPack.sourceHash}&workerId=someone-else`, field)).status, 403);
  const submittalDownload = await fetch(base + submittalUrl, { headers: { Authorization: `Bearer ${field}` } });
  assert.equal(submittalDownload.status, 200);
  assert.match(submittalDownload.headers.get('cache-control'), /no-store/);
  assert.deepEqual(Buffer.from(await submittalDownload.arrayBuffer()), bytes);
  const genericSubmittalDownload = await fetch(`${base}/api/ledger/documents/${document.id}/content`, { headers: { Authorization: `Bearer ${field}` } });
  assert.equal(genericSubmittalDownload.status, 404, 'attached source PDFs must use the approved, task-scoped route');
  const url = `${fileRoute}?sourceHash=${freshPack.sourceHash}`;
  assert.equal((await request(url)).status, 401);
  assert.equal((await request(`${url}&workerId=someone-else`, field)).status, 403);
  assert.equal((await request(`${fileRoute}?sourceHash=${pack.sourceHash}`, field)).status, 409);
  const download = await fetch(base + url, { headers: { Authorization: `Bearer ${field}` } });
  assert.equal(download.status, 200);
  assert.match(download.headers.get('cache-control'), /no-store/);
  assert.match(download.headers.get('content-type'), /application\/pdf/);
  assert.deepEqual(Buffer.from(await download.arrayBuffer()), bytes);
  const genericDownload = await fetch(`${base}/api/ledger/documents/${drawing.id}/content`, { headers: { Authorization: `Bearer ${field}` } });
  assert.equal(genericDownload.status, 200);
  assert.deepEqual(Buffer.from(await genericDownload.arrayBuffer()), bytes);
  const hiddenForm = new FormData();
  hiddenForm.set('jobId', job.id);
  hiddenForm.set('category', 'drawing_pdf');
  hiddenForm.set('evidenceFile', new Blob([bytes], { type: 'application/pdf' }), 'private.pdf');
  const hiddenUpload = await fetch(base + '/api/ledger/upload', { method: 'POST', headers: { Authorization: `Bearer ${tokens.owner}`, 'Idempotency-Key': 'field-drawing-upload-private' }, body: hiddenForm });
  assert.equal(hiddenUpload.status, 200);
  const hiddenDocument = (await hiddenUpload.json()).ledgerDocument;
  const hiddenRevision = await request(`/api/ledger/jobs/${job.id}/drawing-revisions`, tokens.owner, { entryKey: 'field-drawing-revision-private', sourceDocumentId: hiddenDocument.id, sheetNumber: 'A-02', revision: 'A', title: 'Other trade PDF', issueDate: '2026-01-01', revisionReason: 'Other trade issue', linkedTaskIds: [privateTask.id] });
  assert.equal(hiddenRevision.status, 201);
  await request(`/api/ledger/approvals/${hiddenRevision.body.drawing.approval.id}/resolve`, tokens.owner, { status: 'approved' });
  const hiddenDrawingDownload = await fetch(`${base}/api/ledger/documents/${hiddenRevision.body.drawing.id}/content`, { headers: { Authorization: `Bearer ${field}` } });
  assert.equal(hiddenDrawingDownload.status, 404);
  const genericDocumentDownload = await fetch(`${base}/api/ledger/documents/${unscopedDocument.id}/content`, { headers: { Authorization: `Bearer ${field}` } });
  assert.equal(genericDocumentDownload.status, 404, 'unscoped project files require a dedicated field-safe download route');
  const scopedJob = (await request(`/api/ledger/jobs/${job.id}`, field)).body.job;
  assert.equal(scopedJob.tasks.find(item => item.id === task.id).jhaApplicability, undefined, 'generic field job detail must not expose office rationale or review metadata');
  assert.equal(scopedJob.drawings.some(row => row.id === hiddenRevision.body.drawing.id), false);
  assert.equal(scopedJob.drawings.some(row => row.id === drawing.id), true);
  assert.equal(scopedJob.documents.some(row => row.id === unscopedDocument.id), false, 'unscoped attachments are omitted from field job metadata');
  const tamperedSubmittalData = { ...taskLinkedSubmittal.data, taskIds: [] };
  const scopeTamperLedger = new ContractorOperatingLedger({ dbFile: process.env.LEDGER_DB_FILE });
  scopeTamperLedger.db.prepare('UPDATE submittal_records SET data_json = ? WHERE id = ?').run(JSON.stringify(tamperedSubmittalData), taskLinkedSubmittal.id);
  scopeTamperLedger.close();
  const afterSubmittalScopeTampering = (await request(`/api/ledger/jobs/${job.id}`, field)).body.job;
  assert.equal(afterSubmittalScopeTampering.submittals.some(row => row.id === taskLinkedSubmittal.id), false,
    'field visibility fails closed when approved task scope no longer matches its decision');
  const scopedDrawingList = await request(`/api/ledger/drawings?jobId=${job.id}`, field);
  assert.equal(scopedDrawingList.body.drawings.some(row => row.id === hiddenRevision.body.drawing.id), false);
  assert.equal(scopedDrawingList.body.drawings.some(row => row.id === drawing.id), true);
  assert.equal(requiredTaskJha.body.task.jhaApplicability.status, 'required');
  const update = new ContractorOperatingLedger({ dbFile: process.env.LEDGER_DB_FILE });
  update.db.prepare('UPDATE job_tasks SET description = ? WHERE id = ?').run('Changed task scope after applicability review.', task.id);
  const staleTaskPack = (await request(route, field)).body.pack;
  assert.equal(staleTaskPack.know.jhaApplicability.find(item => item.taskId === task.id).status, 'needs_review');
  assert.ok(staleTaskPack.startReleaseEligibility[0].blockers.some(message => message.includes('JHA applicability')));
  update.db.prepare("UPDATE assignments SET status = 'cancelled' WHERE job_id = ? AND worker_id = ?").run(job.id, worker.id);
  update.close();
  assert.equal((await request(url, field)).status, 403);
});
