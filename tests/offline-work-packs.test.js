const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('the Android offline field screen renders recovery instructions against their assigned task', () => {
  const source = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/nl/contractorai/field/MainActivity.java'), 'utf8');
  assert.match(source, /optJSONArray\("recoveryInstructions"\)/);
  assert.match(source, /taskTitle\(pack, instruction\.optString\("taskId"\)\)/);
  assert.match(source, /text\(instruction\.optString\("text"\), 16\)/);
  assert.match(source, /meld hervatting bij dezelfde taak/);
});

test('the Android offline field screen renders only the assignment-bound daily briefing and stale-crew warning', () => {
  const source = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/nl/contractorai/field/MainActivity.java'), 'utf8');
  assert.match(source, /private void dailyBriefings\(JSONArray assignments\)/);
  assert.match(source, /assignment\.optJSONObject\("dailyBriefing"\)/);
  assert.match(source, /briefing\.optString\("plannedWork"\)/);
  assert.match(source, /briefing\.optJSONArray\("qualityHoldPoints"\)/);
  assert.match(source, /crew_update_required.*needs_review/s);
  assert.match(source, /dailyBriefings\(assignments\)/);
});

test('the native field app refreshes only its authenticated assigned-job reply feed while the pack is visible', () => {
  const root = path.join(__dirname, '../android/app/src/main');
  const activity = fs.readFileSync(path.join(root, 'java/nl/contractorai/field/MainActivity.java'), 'utf8');
  const manifest = fs.readFileSync(path.join(root, 'AndroidManifest.xml'), 'utf8');
  assert.match(manifest, /android\.permission\.ACCESS_NETWORK_STATE/);
  assert.match(activity, /postDelayed\(refreshReplies, 30_000L\)/);
  assert.match(activity, /!activityVisible \|\| !packVisible \|\| data == null \|\| store\.token\.isEmpty\(\)/);
  assert.match(activity, /\/work-pack\/replies/);
  assert.match(activity, /store\.save\(updated\); data = updated/);
  assert.match(activity, /Nieuw goedgekeurd antwoord van kantoor op/);
  assert.match(activity, /setAccessibilityLiveRegion\(View\.ACCESSIBILITY_LIVE_REGION_POLITE\)/);
  assert.match(activity, /onPause\(\).*replyHandler\.removeCallbacks\(refreshReplies\)/s);
  assert.match(activity, /onDestroy\(\).*replyHandler\.removeCallbacks\(refreshReplies\)/s);
  assert.doesNotMatch(activity, /startForegroundService|WorkManager|NotificationManager/);
});

test('the native work pack exposes supervisor context but does not report another workers supervised task', () => {
  const source = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/nl/contractorai/field/MainActivity.java'), 'utf8');
  assert.match(source, /private void workTaskRows\(JSONArray tasks\)/);
  assert.match(source, /task\.optBoolean\("supervisingOnly"\)/);
  assert.match(source, /Begeleider: " \+ supervision\.optString\("workerName"/);
  assert.match(source, /Check-in in deze opgeslagen versie/);
  assert.match(source, /task\.optBoolean\("supervisingOnly"\) \|\| \(!status\.equals\("open"\)/);
  assert.match(source, /Jij bent de aangewezen begeleider[\s\S]*voortgang meldt de toegewezen uitvoerende/);
});

test('the native field app confirms required start releases online and fails closed for released-task progress', () => {
  const source = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/nl/contractorai/field/MainActivity.java'), 'utf8');
  assert.match(source, /startReleaseControls\(JSONObject workPack\)/);
  assert.match(source, /Ontvangst vrijgave bevestigen \(online\)/);
  assert.match(source, /Ik heb de vrijgave ontvangen en stop als de omstandigheden of maatregelen afwijken/);
  assert.match(source, /work-pack\/start-release\/acknowledgment/);
  assert.match(source, /startReleaseAcknowledgmentEntryKey/);
  assert.match(source, /"startReleaseAcknowledgmentEntryKey:" \+ release\.getString\("id"\)/);
  assert.match(source, /!confirmed\.optBoolean\("permissionToStart"\)/);
  assert.match(source, /Stop en meld aan uitvoerder \(online\)/);
  assert.match(source, /startReleaseStopEntryKey/);
  assert.match(source, /startReleaseStopReason/);
  assert.match(source, /"startReleaseStopEntryKey:" \+ release\.getString\("id"\)/);
  assert.match(source, /"startReleaseStopReason:" \+ release\.getString\("id"\)/);
  assert.match(source, /work-pack\/start-release\/revoke/);
  assert.match(source, /!"revoked"\.equals\(stopped\.optString\("status"\)\)/);
  assert.match(source, /hasAcknowledgedStartReleases\(taskId\)/);
  assert.match(source, /work-pack\/progress/);
  assert.match(source, /Voor deze taak is een actuele servercontrole vereist/);
  assert.match(source, /requiredStartReleases\(pack\(\), task\.optString\("id"\)\)/);
});

test('the native field app can report privacy-minimized unavailability or standby and shows server conflicts', () => {
  const source = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/nl/contractorai/field/MainActivity.java'), 'utf8');
  assert.match(source, /"Beschikbaarheid melden", this::showAvailability/);
  assert.match(source, /boolean standby = checkedId == standbyMode\.getId\(\)/);
  assert.match(source, /\.put\("mode", standby \? "standby" : "unavailable"\)/);
  assert.match(source, /payload\.put\("minimumNoticeHours", minimumNoticeHours\)/);
  assert.match(source, /boolean returnUnknown = unknownReturn\.isChecked\(\)/);
  assert.match(source, /put\("returnUnknown", returnUnknown\)/);
  assert.match(source, /setMinDate\(minimumDate\.getTimeInMillis\(\)\)/);
  assert.match(source, /endsAt\.getTimeInMillis\(\) <= startsAt\.getTimeInMillis\(\)/);
  assert.match(source, /payload\.put\("reviewAt"/);
  assert.match(source, /queueAvailability\(startsAtIso, endsAtIso, returnUnknown, reviewDate,\s*standbyMode\.isChecked\(\), minimumNoticeHours\[0\]\)/);
  assert.match(source, /Opdrachten die aandacht vragen/);
  assert.match(source, /bestaande opdrachten zijn niet gewijzigd/i);
  assert.match(source, /planningsconflicten vragen aandacht van de aannemer/);
  assert.match(source, /invalidatedCalloutCount/);
  assert.match(source, /open standby-oproep/);
  assert.match(source, /catch \(Exception ignored\) \{ return value; \}/);
  assert.doesNotMatch(source, /put\("(?:illness|diagnosis|medicalDetails|healthDetails)"/);
});

test('native unavailability reports persist encrypted while offline and show conflicts after scoped sync', () => {
  const source = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/nl/contractorai/field/MainActivity.java'), 'utf8');
  assert.match(source, /"Verhindering offline melden"[\s\S]*?this::showAvailability/);
  assert.match(source, /\.put\("kind", "availability"\)/);
  assert.match(source, /\.put\("entryKey", entryKey\)\.put\("mode", standby \? "standby" : "unavailable"\)/);
  assert.match(source, /payload\.put\("minimumNoticeHours", minimumNoticeHours\)/);
  assert.match(source, /store\.save\(updated\); data = updated;/);
  assert.match(source, /"availability"\.equals\(entry\.optString\("kind"\)\)/);
  assert.match(source, /store\.json\("\/api\/work-board\/availability", entry\.getJSONObject\("payload"\)\)/);
  assert.match(source, /confirmed\.put\(availabilityReceipt\(response\)\); updated\.put\("availabilitySyncResults", confirmed\)/);
  assert.match(source, /confirmed != null && confirmed\.length\(\) > 0\) showAvailabilityResults\(confirmed\)/);
  assert.match(source, /waitingReports >= 10/);
  assert.match(source, /Math\.min\(count, 50\)/);
  assert.match(source, /!scope\.equals\(data\.getString\("scope"\)\)/);
  assert.match(source, /Serverconflict\. Meld opnieuw aan en bespreek deze periode met kantoor/);
});

test('native field work pack queues equipment fault reports only for matching held equipment', () => {
  const source = fs.readFileSync(path.join(__dirname, '../android/app/src/main/java/nl/contractorai/field/MainActivity.java'), 'utf8');
  assert.match(source, /Materieeldefect \(optioneel, alleen bij geblokkeerde taak\)/);
  assert.match(source, /custody\.optBoolean\("heldByYou"\)/);
  assert.match(source, /taskId\.equals\(reservation\.optString\("taskId"\)\)/);
  assert.match(source, /payload\.put\("equipmentIssue", new JSONObject\(\)/);
  assert.match(source, /"malfunction", "damaged", "unsafe"/);
  assert.match(source, /MATERIEEL VASTGEHOUDEN/);
  assert.match(source, /store\.save\(updated\); data = updated;/);
});

test('offline vault encrypts all dossier data, rejects wrong passwords and expiry', async () => {
  const { sealVault, openVault } = await import('../offline-work-packs.mjs');
  const data = { scope: 'field_worker:alice', packs: [{ job: { title: 'Private address' } }], queue: [] };
  const sealed = await sealVault(data, 'long-test-passphrase');
  assert.equal(JSON.stringify(sealed).includes('Private address'), false);
  assert.deepEqual((await openVault(sealed, 'long-test-passphrase')).data, data);
  assert.equal(typeof sealed.ciphertext, 'string');
  const legacy = { ...sealed, ciphertext: Array.from(Buffer.from(sealed.ciphertext, 'base64')) };
  assert.deepEqual((await openVault(legacy, 'long-test-passphrase')).data, data);
  await assert.rejects(openVault(sealed, 'wrong-test-passphrase'));
  await assert.rejects(openVault({ ...sealed, expiresAt: 1 }, 'long-test-passphrase'));
  await assert.rejects(sealVault(data, '1234'));
});

test('offline responses keep stable source identities and refuse unrelated accounts on sync', async () => {
  const { queueResponse, synchronizeVault } = await import('../offline-work-packs.mjs');
  const scope = 'company:company-a:ledger:11111111-1111-4111-8111-111111111111:field_worker:alice';
  const data = { scope, packs: [{ job: { id: 'job1' }, sourceHash: 'a'.repeat(64), do: [{ id: 'task-1', title: 'Install frame' }], questions: [] }], queue: [] };
  queueResponse(data, 'job1', 'questions', { message: 'Which dimension?' });
  queueResponse(data, 'job1', 'progress', { taskId: 'task-1', status: 'blocked', progressPercent: 40, note: 'Material delivery is short by two units.' });
  assert.throws(() => queueResponse(data, 'job1', 'progress', { taskId: 'task-other', status: 'blocked', progressPercent: 40, note: 'Material delivery is short by two units.' }));
  assert.equal(data.queue[0].payload.sourceHash, 'a'.repeat(64));
  assert.equal(data.queue[1].payload.sourceHash, 'a'.repeat(64));
  assert.deepEqual({ taskId: data.queue[1].payload.taskId, status: data.queue[1].payload.status, progressPercent: data.queue[1].payload.progressPercent, note: data.queue[1].payload.note }, { taskId: 'task-1', status: 'blocked', progressPercent: 40, note: 'Material delivery is short by two units.' });
  const progressKey = data.queue[1].payload.entryKey;
  assert.throws(() => queueResponse(data, 'job1', 'progress', { taskId: 'task-1', status: 'complete', progressPercent: 100, note: 'Done.' }));
  assert.throws(() => queueResponse(data, 'job1', 'progress', { taskId: 'task-1', status: 'in_progress', progressPercent: '20', note: 'Progress.' }));
  assert.throws(() => queueResponse(data, 'job1', 'progress', { taskId: 'task-1', status: 'in_progress', progressPercent: 20, note: 'ok' }));
  let calls = 0;
  await assert.rejects(synchronizeVault(data, 'field_worker:bob', async () => { calls++; }));
  await assert.rejects(synchronizeVault(data, scope.replace('company-a', 'company-b'), async () => { calls++; }));
  assert.equal(calls, 0);
  await synchronizeVault(data, data.scope, async () => { throw Object.assign(new Error('Stale source'), { status: 409 }); });
  assert.equal(data.queue.find(item => item.payload.entryKey === progressKey).state, 'conflict');
  assert.equal(data.queue.find(item => item.payload.entryKey === progressKey).payload.entryKey, progressKey);
  const key = data.queue[0].payload.entryKey;
  data.queue[0].state = 'pending';
  data.queue[1].state = 'pending';
  let progressRequest;
  await synchronizeVault(data, data.scope, async (_path, options) => {
    const requestBody = JSON.parse(options.body);
    if (_path.endsWith('/progress')) progressRequest = { path: _path, body: requestBody };
    else assert.equal(requestBody.entryKey, key);
    assert.equal(options.headers['X-Contractor-Company'], 'company-a');
    assert.equal(options.headers['X-Contractor-Ledger'], '11111111-1111-4111-8111-111111111111');
    return _path.endsWith('/questions') ? { record: { id: 'question-1', message: 'Which dimension?', recordedAt: '2026-09-24T09:00:00.000Z' } } : {};
  });
  assert.equal(data.queue.length, 0);
  assert.equal(progressRequest.path, '/api/ledger/jobs/job1/work-pack/progress');
  assert.equal(progressRequest.body.entryKey, progressKey);
  assert.equal(progressRequest.body.status, 'blocked');
  assert.equal(progressRequest.body.progressPercent, 40);
  assert.equal(progressRequest.body.taskId, 'task-1');
  assert.deepEqual(data.packs[0].questions[0], {
    id: 'question-1', message: 'Which dimension?', recordedAt: '2026-09-24T09:00:00.000Z',
    replyStatus: 'open', response: null, repliedAt: null
  });
});

test('offline field equipment safety reports require a held tool from the same task and stay encrypted in the queue', async () => {
  const { queueResponse, sealVault, openVault } = await import('../offline-work-packs.mjs');
  const pack = { job: { id: 'job-equipment' }, sourceHash: 'b'.repeat(64), do: [{ id: 'task-1' }], have: { equipment: [
    { id: 'reservation-1', taskId: 'task-1', custody: { status: 'checked_out', heldByYou: true } }
  ] } };
  const data = { scope: 'field_worker:worker-1', packs: [pack], queue: [] };
  queueResponse(data, 'job-equipment', 'progress', {
    taskId: 'task-1', status: 'blocked', progressPercent: 20,
    note: 'The mixer stops under load.',
    equipmentIssue: { reservationId: 'reservation-1', issueType: 'malfunction', note: 'The mixer stops under load.' }
  });
  const queued = data.queue[0].payload;
  assert.deepEqual(queued.equipmentIssue, { reservationId: 'reservation-1', issueType: 'malfunction', note: 'The mixer stops under load.' });
  for (const invalid of [
    { taskId: 'task-1', status: 'in_progress', reservationId: 'reservation-1', issueType: 'unsafe', note: 'Unsafe tool report.' },
    { taskId: 'task-other', status: 'blocked', reservationId: 'reservation-1', issueType: 'unsafe', note: 'Unsafe tool report.' },
    { taskId: 'task-1', status: 'blocked', reservationId: 'other-reservation', issueType: 'unsafe', note: 'Unsafe tool report.' },
    { taskId: 'task-1', status: 'blocked', reservationId: 'reservation-1', issueType: 'made-up', note: 'Unsafe tool report.' },
    { taskId: 'task-1', status: 'blocked', reservationId: 'reservation-1', issueType: 'unsafe', note: 'Nope' }
  ]) {
    assert.throws(() => queueResponse(data, 'job-equipment', 'progress', {
      taskId: invalid.taskId, status: invalid.status, progressPercent: 20, note: invalid.note,
      equipmentIssue: { reservationId: invalid.reservationId, issueType: invalid.issueType, note: invalid.note }
    }));
  }
  const vault = await sealVault(data, 'long-offline-test-passphrase');
  assert.equal(JSON.stringify(vault).includes('The mixer stops under load.'), false);
  assert.deepEqual((await openVault(vault, 'long-offline-test-passphrase')).data.queue[0].payload.equipmentIssue, queued.equipmentIssue);
});

test('offline recovery instructions are encrypted with the pack and acknowledge before same-task resumption sync', async () => {
  const { queueResponse, sealVault, synchronizeVault } = await import('../offline-work-packs.mjs');
  const scope = 'company:company-a:ledger:11111111-1111-4111-8111-111111111111:field_worker:alice';
  const instruction = { id: 'recovery-instruction-1', taskId: 'task-roof', text: 'Check the replacement bracket and resume the roof fixing.', recordedAt: '2026-09-24T09:00:00.000Z' };
  const data = { scope, packs: [{ job: { id: 'job-recovery', title: 'Roof repair' }, sourceHash: 'e'.repeat(64),
    know: { recoveryInstructions: [instruction] }, do: [{ id: 'task-roof', title: 'Fix roof brackets' }] }], queue: [] };
  const sealed = await sealVault(data, 'offline-recovery-instruction-passphrase');
  assert.equal(JSON.stringify(sealed).includes(instruction.text), false);
  queueResponse(data, 'job-recovery', 'acknowledgments', { understood: true });
  queueResponse(data, 'job-recovery', 'progress', { taskId: instruction.taskId, status: 'in_progress', progressPercent: 55,
    note: 'The bracket is checked and the roof fixing has resumed.' });
  assert.deepEqual(data.queue.map(entry => entry.kind), ['acknowledgments', 'progress']);
  assert.ok(data.queue.every(entry => entry.payload.sourceHash === data.packs[0].sourceHash));
  assert.equal(data.queue[0].payload.understood, true);
  assert.equal(data.queue[1].payload.taskId, instruction.taskId);
  const sent = [];
  await synchronizeVault(data, scope, async (requestPath, options) => {
    sent.push({ path: requestPath, payload: JSON.parse(options.body) });
    return {};
  });
  assert.deepEqual(sent.map(item => item.path), [
    '/api/ledger/jobs/job-recovery/work-pack/acknowledgments',
    '/api/ledger/jobs/job-recovery/work-pack/progress'
  ]);
  assert.ok(sent.every(item => item.payload.sourceHash === data.packs[0].sourceHash));
  assert.equal(sent[0].payload.understood, true);
  assert.equal(sent[1].payload.taskId, instruction.taskId);
  assert.equal(data.queue.length, 0);
});

test('offline site receipts retain ordered quantity preconditions and become conflicts when the delivery changed', async () => {
  const { queueSiteIssueReceipt, synchronizeVault } = await import('../offline-work-packs.mjs');
  const data = {
    scope: 'company:company-a:ledger:11111111-1111-4111-8111-111111111111:field_worker:alice',
    packs: [{ job: { id: 'job-site' }, sourceHash: 'd'.repeat(64), have: { siteIssues: [{ id: 'issue-1', dispatchReference: 'VAN-77', remainingQuantity: 5 }] } }],
    queue: []
  };
  const firstKey = queueSiteIssueReceipt(data, 'job-site', 'issue-1', { receivedQuantity: 3, acceptedQuantity: 2, damagedQuantity: 1,
    receiptReference: 'SITE-77-A', evidenceReference: 'photo:site-77-a', location: 'Roof level' });
  const secondKey = queueSiteIssueReceipt(data, 'job-site', 'issue-1', { receivedQuantity: 2, acceptedQuantity: 2, damagedQuantity: 0,
    receiptReference: 'SITE-77-B', evidenceReference: 'photo:site-77-b', location: 'Roof level' });
  assert.equal(data.queue[0].payload.expectedRemainingQuantity, 5);
  assert.equal(data.queue[1].payload.expectedRemainingQuantity, 2);
  assert.equal(data.queue[0].payload.expectedDispatchReference, 'VAN-77');
  assert.equal(data.queue[0].payload.sourceHash, 'd'.repeat(64));
  assert.equal(data.queue[0].payload.entryKey, firstKey);
  assert.equal(data.queue[1].payload.entryKey, secondKey);
  assert.throws(() => queueSiteIssueReceipt(data, 'job-site', 'issue-1', { receivedQuantity: 0.1, acceptedQuantity: 0.1,
    damagedQuantity: 0, receiptReference: 'SITE-77-C', evidenceReference: 'photo:site-77-c', location: 'Roof level' }), /geen hoeveelheid meer open/);
  const sent = [];
  await synchronizeVault(data, data.scope, async (path, options) => {
    sent.push({ path, key: options.headers['Idempotency-Key'], body: JSON.parse(options.body) });
    return {};
  });
  assert.equal(sent.length, 2);
  assert.ok(sent.every(item => item.path === '/api/ledger/jobs/job-site/material-stock-site-issues/issue-1/receipts'));
  assert.deepEqual(sent.map(item => item.key), [firstKey, secondKey]);
  assert.deepEqual(sent.map(item => item.body.expectedRemainingQuantity), [5, 2]);
  assert.equal(data.queue.length, 0);

  const conflict = { scope: data.scope, packs: data.packs.map(pack => structuredClone(pack)), queue: [] };
  queueSiteIssueReceipt(conflict, 'job-site', 'issue-1', { receivedQuantity: 3, acceptedQuantity: 3, damagedQuantity: 0,
    receiptReference: 'SITE-77-D', evidenceReference: 'photo:site-77-d', location: 'Roof level' });
  await synchronizeVault(conflict, conflict.scope, async () => { throw Object.assign(new Error('Delivery changed.'), { status: 409 }); });
  assert.equal(conflict.queue[0].state, 'conflict');
  assert.throws(() => queueSiteIssueReceipt(conflict, 'job-site', 'issue-1', { receivedQuantity: 1, acceptedQuantity: 1, damagedQuantity: 0,
    receiptReference: 'SITE-77-E', evidenceReference: 'photo:site-77-e', location: 'Roof level' }), /synchronisatieconflict/);
});

test('offline photo captures are encrypted, size-bounded, and queued in before-during-after order', async () => {
  const { queuePhotoEvidence, sealVault, openVault } = await import('../offline-work-packs.mjs');
  const data = {
    scope: 'company:company-a:ledger:11111111-1111-4111-8111-111111111111:field_worker:alice',
    packs: [{ job: { id: 'job-photo' }, sourceHash: 'b'.repeat(64), checks: { photos: [{ id: 'set-photo', title: 'Roof outlet', workLocation: 'Roof / outlet 04', requiredPhases: ['before', 'during', 'after'], capturedPhases: [] }] } }],
    queue: []
  };
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode('private-photo-bytes')]);
  const capture = phase => queuePhotoEvidence(data, 'job-photo', {
    setId: 'set-photo', phase, capturedAt: new Date().toISOString(), notes: `Private ${phase} note`,
    filename: `${phase} roof.jpg`, mimeType: 'image/jpeg', bytes
  });
  assert.throws(() => capture('during'), /Leg eerst de fase “voor” vast/);
  capture('before'); capture('during'); capture('after');
  assert.equal(data.queue.length, 3);
  assert.deepEqual(data.queue.map(item => item.payload.phase), ['before', 'during', 'after']);
  assert.equal(data.queue[0].payload.filename, 'before_roof.jpg');
  assert.ok(data.queue.every(item => item.payload.sourceHash === 'b'.repeat(64)));
  assert.throws(() => capture('after'), /Alle fotofasen zijn al vastgelegd/);
  const sealed = await sealVault(data, 'offline-photo-test-passphrase');
  assert.equal(JSON.stringify(sealed).includes('private-photo-bytes'), false);
  assert.equal(JSON.stringify(sealed).includes('Private before note'), false);
  assert.deepEqual((await openVault(sealed, 'offline-photo-test-passphrase')).data, data);
  assert.throws(() => queuePhotoEvidence(data, 'job-photo', { setId: 'set-photo', phase: 'before', capturedAt: new Date().toISOString(), filename: 'fake.jpg', mimeType: 'image/jpeg', bytes: new TextEncoder().encode('not a real image') }));
});

test('offline photo synchronization sends scoped multipart evidence and retains phase conflicts', async () => {
  const { queuePhotoEvidence, synchronizeVault } = await import('../offline-work-packs.mjs');
  const data = {
    scope: 'company:company-a:ledger:11111111-1111-4111-8111-111111111111:field_worker:alice',
    packs: [{ job: { id: 'job-photo' }, sourceHash: 'c'.repeat(64), checks: { photos: [{ id: 'set-photo', requiredPhases: ['before', 'during', 'after'], capturedPhases: [] }] } }], queue: []
  };
  const bytes = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, ...new TextEncoder().encode('governed-photo')]);
  const entryKey = queuePhotoEvidence(data, 'job-photo', { setId: 'set-photo', phase: 'before', capturedAt: new Date().toISOString(), notes: 'Roof condition', filename: 'capture.jpg', mimeType: 'image/jpeg', bytes });
  let upload;
  await assert.rejects(synchronizeVault(data, data.scope.replace('company-a', 'company-b'), async () => { throw new Error('Must not send across companies.'); }));
  await synchronizeVault(data, data.scope, async (path, options) => {
    upload = { path, options, file: options.body.get('evidenceFile') };
    return {};
  });
  assert.equal(upload.path, '/api/ledger/upload');
  assert.equal(upload.options.headers['X-Contractor-Company'], 'company-a');
  assert.equal(upload.options.headers['X-Contractor-Ledger'], '11111111-1111-4111-8111-111111111111');
  assert.equal(upload.options.headers['Idempotency-Key'], entryKey);
  assert.equal(upload.options.body.get('photoEvidenceSetId'), 'set-photo');
  assert.equal(upload.options.body.get('photoEvidencePhase'), 'before');
  assert.equal(upload.options.body.get('photoEvidenceEntryKey'), entryKey);
  assert.equal(upload.options.body.get('category'), 'governed_field_photo');
  assert.equal(upload.file.name, 'capture.jpg');
  assert.equal(data.queue.length, 0);

  queuePhotoEvidence(data, 'job-photo', { setId: 'set-photo', phase: 'during', capturedAt: new Date().toISOString(), filename: 'capture.jpg', mimeType: 'image/jpeg', bytes });
  let persisted = 0;
  await synchronizeVault(data, data.scope, async () => { throw Object.assign(new Error('Phase changed on site.'), { status: 409 }); }, async () => { persisted += 1; });
  assert.equal(data.queue[0].state, 'conflict');
  assert.equal(persisted, 1);
});
