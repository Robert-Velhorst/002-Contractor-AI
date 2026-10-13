const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');
const { ContractorOperatingLedger } = require('../operating-ledger');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'conversation-api-'));
process.env.LEDGER_DB_FILE = path.join(directory, 'ledger.sqlite');
process.env.STATE_FILE = path.join(directory, 'state.json');
process.env.UPLOAD_DIR = path.join(directory, 'uploads');
process.env.CONTRACTOR_AI_REQUIRE_AUTH = 'true';
const owner = 'conversation-owner-token-at-least-32-characters';
const field = 'conversation-field-token-at-least-32-characters';
const officeOperator = 'conversation-office-token-at-least-32-characters';
  let modelInstalled = true;
process.env.CONTRACTOR_AI_ROLE_TOKENS = JSON.stringify({ owner, office_operator: officeOperator, field_worker: { token: field, workerId: 'field' } });
const ledger = new ContractorOperatingLedger({ dbFile: process.env.LEDGER_DB_FILE });
const job = ledger.createIntake({ title: 'Conversation API', client: { name: 'Client' }, contractValue: 12000, assignAutomatically: false });
const access = ledger.createClientPortalAccess(job.id);
ledger.resolveApproval(access.approval.id, { status: 'approved' });
const other = ledger.createClientPortalAccess(job.id);
ledger.resolveApproval(other.approval.id, { status: 'approved' });
ledger.close();
const app = require('../server');
const { png, oversizedPng } = require('./image-fixtures');

test('real conversation routes enforce access, safely retain photos and release approved replies', async t => {
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const priorAiEnv = Object.fromEntries(['CONTRACTOR_AI_CHAT_AI_ENABLED', 'CONTRACTOR_AI_CHAT_AI_URL', 'CONTRACTOR_AI_CHAT_AI_MODEL', 'CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE', 'CONTRACTOR_AI_CHAT_AI_VISION_ENABLED'].map(key => [key, process.env[key]]));
  const modelServer = http.createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/version') {
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ version: '0.33.3' })); return;
    }
    if (req.method === 'GET' && req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ models: modelInstalled ? [{ name: 'api-fixture-model' }] : [] })); return;
    }
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => {
      const modelRequest = JSON.parse(Buffer.concat(chunks).toString());
      const { sources, imageOrder } = JSON.parse(modelRequest.messages.at(-1).content);
      const source = sources.find(row => row.direction === 'inbound');
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ message: { content: JSON.stringify({ findings: [{ sourceId: source.id, quote: source.body, category: 'request', suggestion: 'Beoordeel of de opening breder kan worden.', uncertainty: 'Gewenste maat, constructieve haalbaarheid en contractimpact zijn niet vastgesteld.' }], observations: imageOrder.map(photo => ({ ...photo, observation: 'Mogelijke kier zichtbaar rond de sparing.', uncertainty: 'Afmeting en oorzaak zijn niet uit deze foto vast te stellen.' })) }) } }));
    });
  });
  modelServer.listen(0, '127.0.0.1');
  await new Promise(resolve => modelServer.once('listening', resolve));
  process.env.CONTRACTOR_AI_CHAT_AI_ENABLED = 'true';
  process.env.CONTRACTOR_AI_CHAT_AI_URL = `http://127.0.0.1:${modelServer.address().port}`;
  process.env.CONTRACTOR_AI_CHAT_AI_MODEL = 'api-fixture-model';
  process.env.CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE = 'false';
  process.env.CONTRACTOR_AI_CHAT_AI_VISION_ENABLED = 'true';
  t.after(async () => {
    for (const [key, value] of Object.entries(priorAiEnv)) value === undefined ? delete process.env[key] : process.env[key] = value;
    await new Promise(resolve => modelServer.close(resolve));
    await app.locals.runtimeControl.shutdown({ server, signal: 'conversation_api_test' }); fs.rmSync(directory, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  const call = (route, token, options = {}) => fetch(base + route, { ...options, headers: { ...options.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
  const portal = '/api/client-portal/conversation';
  const office = `/api/ledger/jobs/${job.id}/conversations/${access.id}`;
  const inboxRoute = '/api/ledger/client-conversations/inbox';
  const legacyMessagesRoute = `${office}/legacy-messages`;
  assert.equal((await (await call(`${office}/analysis`, owner)).json()).capability.autoAnalyze, false);
  assert.equal((await (await call(`${office}/analysis`, owner)).json()).capability.durableQueue, false);
  process.env.CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE = 'true';
  assert.equal((await (await call(`${office}/analysis`, owner)).json()).capability.autoAnalyze, true);
  assert.equal((await (await call(`${office}/analysis`, owner)).json()).capability.durableQueue, true);
  process.env.CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE = 'false';
  assert.equal((await call(portal)).status, 401);
  assert.equal((await call(office, field)).status, 403);
  assert.equal((await call(`${office}/photo-evidence`, field)).status, 403);
  const releasedPhotos = await call(`${office}/photo-evidence`, owner);
  assert.equal(releasedPhotos.status, 200);
  assert.deepEqual((await releasedPhotos.json()).photos, []);
  assert.equal((await call(`${office}/photo-evidence/missing-capture/draft`, field, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
  })).status, 403);
  assert.equal((await call(`${office}/analysis/check`, field, { method: 'POST' })).status, 403);
  assert.equal((await call(`${office}/analysis/check`, null, { method: 'POST' })).status, 401);
  const modelCheckResponse = await call(`${office}/analysis/check`, owner, { method: 'POST' });
  assert.equal(modelCheckResponse.status, 200);
  assert.deepEqual((await modelCheckResponse.json()).check, { reachable: true, model: 'api-fixture-model', modelInstalled: true,
    runtimeVersion: '0.33.3', automaticAnalysis: false, customerDataSent: false });
  modelInstalled = false;
  const missingModel = await call(`${office}/analysis/check`, owner, { method: 'POST' });
  assert.equal(missingModel.status, 409);
  assert.equal((await missingModel.json()).error.code, 'local_model_not_installed');
  modelInstalled = true;
  assert.equal((await call(inboxRoute, field)).status, 403);
  assert.equal((await call(inboxRoute)).status, 401);
  assert.equal((await call(legacyMessagesRoute, field)).status, 403);
  assert.deepEqual((await (await call(legacyMessagesRoute, owner)).json()).messages, []);
  assert.equal((await call(`${legacyMessagesRoute}/missing-message/import`, officeOperator, { method: 'POST' })).status, 403);
  const form = () => { const body = new FormData(); body.set('body', 'Is this opening wide enough?'); body.set('entryKey', 'client-api-photo-001'); body.set('evidenceFile', new Blob([png], { type: 'image/png' }), 'opening.png'); return body; };
  const createdResponse = await call(`${portal}/messages`, access.portalToken, { method: 'POST', body: form() });
  assert.equal(createdResponse.status, 201);
  const created = (await createdResponse.json()).message;
  const inboxBeforeReview = await (await call(inboxRoute, owner)).json();
  assert.equal(inboxBeforeReview.unreadCount, 1);
  assert.equal(inboxBeforeReview.messages[0].jobId, job.id);
  assert.equal(inboxBeforeReview.messages[0].accessId, access.id);
  assert.equal(Object.hasOwn(inboxBeforeReview.messages[0], 'body'), false);
  const reviewed = await call(`${office}/messages/reviewed`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ id: created.id, sourceHash: created.sourceHash }] }) });
  assert.equal(reviewed.status, 200);
  assert.equal((await (await call(inboxRoute, owner)).json()).unreadCount, 0);
  assert.equal((await (await call('/api/ledger/communications', owner)).json()).summary.inboundUnread, 0);
  const replayedReview = await call(`${office}/messages/reviewed`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: [{ id: created.id, sourceHash: created.sourceHash }] }) });
  assert.equal(replayedReview.status, 200);
  assert.ok((await (await call(office, owner)).json()).messages.find(message => message.id === created.id).reviewedAt);
  assert.equal((await call('/api/ledger/dashboard', field)).status, 403);
  assert.equal((await (await call(`${portal}/messages`, access.portalToken, { method: 'POST', body: form() })).json()).message.id, created.id);
  const content = await call(`${portal}/messages/${created.id}/photo`, access.portalToken);
  assert.equal(content.status, 200);
  assert.deepEqual(Buffer.from(await content.arrayBuffer()), png);
  assert.equal(content.headers.get('cache-control'), 'no-store');
  const filesBeforeHugePhoto = fs.readdirSync(process.env.UPLOAD_DIR).sort();
  const hugePhoto = new FormData();
  hugePhoto.set('body', 'Oversized image must not be retained.');
  hugePhoto.set('entryKey', 'oversized-photo-pixels-01');
  hugePhoto.set('evidenceFile', new Blob([oversizedPng()], { type: 'image/png' }), 'large-dimensions.png');
  const rejectedPixels = await call(`${portal}/messages`, access.portalToken, { method: 'POST', body: hugePhoto });
  assert.equal(rejectedPixels.status, 415);
  assert.equal((await rejectedPixels.json()).error.code, 'image_dimensions_exceeded');
  assert.deepEqual(fs.readdirSync(process.env.UPLOAD_DIR).sort(), filesBeforeHugePhoto);
  assert.equal((await (await call(portal, access.portalToken)).json()).messages.length, 1);
  const previewRoute = `${portal}/messages/${created.id}/photo?preview=1`;
  const preview = await call(previewRoute, access.portalToken);
  assert.equal(preview.status, 200);
  assert.equal(preview.headers.get('content-type'), 'image/webp');
  assert.equal(preview.headers.get('cache-control'), 'no-store');
  assert.equal(preview.headers.get('x-content-type-options'), 'nosniff');
  assert.equal((await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).width, 2);
  assert.equal((await call(previewRoute)).status, 401);
  assert.equal((await call(previewRoute, other.portalToken)).status, 404);
  assert.equal((await call(`${office}/messages/${created.id}/photo?preview=1`, field)).status, 403);
  assert.equal((await call(`${office}/messages/${created.id}/photo?preview=1`, owner)).status, 200);
  assert.equal((await call(`${portal}/messages/${created.id}/photo?preview=0`, access.portalToken)).status, 400);
  assert.equal((await call(`${previewRoute}&preview=1`, access.portalToken)).status, 400);
  const retainedFiles = fs.readdirSync(process.env.UPLOAD_DIR).filter(name => name.endsWith('-opening.png'));
  assert.equal(retainedFiles.length, 1);
  const retainedPath = path.join(process.env.UPLOAD_DIR, retainedFiles[0]);
  assert.deepEqual(fs.readFileSync(retainedPath), png);
  try {
    fs.writeFileSync(retainedPath, Buffer.from('changed retained bytes'));
    assert.equal((await call(previewRoute, access.portalToken)).status, 409);
    assert.equal((await call(`${portal}/messages/${created.id}/photo`, access.portalToken)).status, 409);
  } finally { fs.writeFileSync(retainedPath, png); }
  assert.equal((await call(`${portal}/messages/${created.id}/photo`, other.portalToken)).status, 404);
  const bad = new FormData(); bad.set('entryKey', 'bad-photo-type-01'); bad.set('evidenceFile', new Blob(['<svg/>'], { type: 'image/svg+xml' }), 'bad.svg');
  assert.equal((await call(`${portal}/messages`, access.portalToken, { method: 'POST', body: bad })).status, 415);
  const replyResponse = await call(`${office}/messages`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entryKey: 'office-api-reply-1', body: 'We will inspect the measurement.', replyTo: created.id }) });
  assert.equal(replyResponse.status, 201);
  const reply = (await replyResponse.json()).message;
  assert.equal((await (await call(portal, access.portalToken)).json()).messages.length, 1);
  const approval = await call(`/api/ledger/approvals/${reply.approvalId}/resolve`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) });
  assert.equal(approval.status, 200);
  const published = await call(`${office}/messages/${reply.id}/publish`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceHash: reply.sourceHash }) });
  assert.equal(published.status, 200);
  assert.equal((await (await call(portal, access.portalToken)).json()).messages.length, 2);
  const analyzed = await call(`${office}/analysis`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(analyzed.status, 200);
  const analysis = (await analyzed.json()).analysis;
  const finding = analysis.findings[0];
  const findingRoute = `${office}/analysis/findings/${encodeURIComponent(finding.sourceId)}/rfi`;
  const rfiCommand = { entryKey: 'conversation-rfi-api-01', analysisIdentity: analysis.identity, sourceId: finding.sourceId, quote: finding.quote, category: finding.category,
    title: 'Klantvraag over sparing', question: 'Beoordeel de genoemde maat op locatie.', responsible: 'Werkvoorbereider', dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() };
  assert.equal((await call(findingRoute, field, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rfiCommand) })).status, 403);
  const createdRfiResponse = await call(findingRoute, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rfiCommand) });
  assert.equal(createdRfiResponse.status, 201);
  const createdRfi = (await createdRfiResponse.json()).rfi;
  assert.equal(createdRfi.data.conversationOrigin.messageId, created.id);
  assert.equal(createdRfi.data.conversationOrigin.quote, created.body);
  assert.equal(createdRfi.data.conversationOrigin.uncertainty, 'Gewenste maat, constructieve haalbaarheid en contractimpact zijn niet vastgesteld.');
  const replayedRfi = await call(findingRoute, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(rfiCommand) });
  assert.equal((await replayedRfi.json()).rfi.id, createdRfi.id);
  assert.equal((await call(findingRoute, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rfiCommand, title: 'Andere inhoud' }) })).status, 409);
  const approvedReplyRfiResponse = await call(`/api/ledger/jobs/${job.id}/rfis`, owner,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    title: 'Beoordeel klantvraag over sparing', status: 'answered', question: 'Controleer de maat.',
    response: 'De actuele revisietekening geeft 90 cm aan; laat de opening op locatie nameten.',
    responsible: 'Werkvoorbereider', dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), requiresApproval: true,
    conversationOrigin: createdRfi.data.conversationOrigin
    }) });
  assert.equal(approvedReplyRfiResponse.status, 201);
  const approvedReplyRfi = (await approvedReplyRfiResponse.json()).rfi;
  assert.equal((await call(`${office}/analysis/rfi-responses`, field)).status, 403);
  assert.equal((await call(`/api/ledger/approvals/${approvedReplyRfi.approvalId}/resolve`, owner,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved', reason: 'Drawing source checked.' }) })).status, 200);
  const availableReplies = await (await call(`${office}/analysis/rfi-responses`, owner)).json();
  assert.ok(availableReplies.responses.some(item => item.id === approvedReplyRfi.id && item.sourceMessageId === created.id));
  assert.equal((await call(`${office}/analysis/rfi-responses/${approvedReplyRfi.id}/draft`, field, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const replyDraftResponse = await call(`${office}/analysis/rfi-responses/${approvedReplyRfi.id}/draft`, owner,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(replyDraftResponse.status, 201);
  const replyDraft = (await replyDraftResponse.json()).message;
  assert.equal(replyDraft.status, 'draft');
  assert.equal(replyDraft.replyTo, created.id);
  assert.equal(replyDraft.body, approvedReplyRfi.response);
  assert.equal((await (await call(`${office}/analysis/rfi-responses/${approvedReplyRfi.id}/draft`, owner,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).message.id, replyDraft.id);
  assert.equal((await (await call(portal, access.portalToken)).json()).messages.some(message => message.id === replyDraft.id), false);
  assert.equal((await call(`${office}/messages/${replyDraft.id}/publish`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceHash: replyDraft.sourceHash }) })).status, 409);
  const observation = analysis.observations[0];
  const observationRoute = `${office}/analysis/observations/${encodeURIComponent(observation.sourceId)}/rfi`;
  const photoRfiCommand = { entryKey: 'conversation-photo-rfi-01', analysisIdentity: analysis.identity, sourceId: observation.sourceId,
    photoSha256: observation.sha256, observation: observation.observation, uncertainty: observation.uncertainty,
    title: 'Controleer kier rond sparing', question: 'Controleer ter plaatse of afdichting ontbreekt.', responsible: 'Uitvoerder', dueAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() };
  assert.equal((await call(observationRoute, field, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(photoRfiCommand) })).status, 403);
  const photoRfiResponse = await call(observationRoute, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(photoRfiCommand) });
  assert.equal(photoRfiResponse.status, 201);
  const photoRfi = (await photoRfiResponse.json()).rfi;
  assert.deepEqual(photoRfi.data.conversationOrigin, { evidenceKind: 'photo_observation', accessId: access.id, messageId: created.id,
    messageSourceHash: created.sourceHash, photoSha256: observation.sha256, observation: observation.observation,
    uncertainty: observation.uncertainty, analysisIdentity: analysis.identity });
  assert.equal((await (await call(observationRoute, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(photoRfiCommand) })).json()).rfi.id, photoRfi.id);
  assert.equal((await call(observationRoute, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...photoRfiCommand, observation: 'Andere waarneming' }) })).status, 409);
  const selectionRoute = `${office}/analysis/findings/${encodeURIComponent(finding.sourceId)}/client-selection`;
  const selectionCommand = { entryKey: 'conversation-selection-api-01', analysisIdentity: analysis.identity, sourceId: finding.sourceId,
    quote: finding.quote, category: finding.category, title: 'Kies de breedte van de deuropening',
    options: ['Standaardbreedte', '90 centimeter'], dueAt: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
    rationale: 'Werkvoorbereiding moet de maat voor bestelling en uitvoering bevestigen.' };
  assert.equal((await call(selectionRoute, field, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selectionCommand) })).status, 403);
  const selectionResponse = await call(selectionRoute, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selectionCommand) });
  assert.equal(selectionResponse.status, 201);
  const selection = (await selectionResponse.json()).selection;
  assert.equal(selection.status, 'pending_approval');
  assert.equal(selection.data.clientVisible, false);
  const selectionApprovalPreview = (await (await call('/api/ledger/approvals', owner)).json()).approvals.find(item => item.id === selection.approvalId);
  assert.equal(selectionApprovalPreview.decision.preview.title, selection.title);
  assert.deepEqual(selectionApprovalPreview.decision.preview.options, selection.options);
  assert.equal(selectionApprovalPreview.decision.preview.rationale, selection.data.conversationOrigin.rationale);
  assert.equal(selectionApprovalPreview.decision.preview.conversationOrigin.quote, finding.quote);
  assert.ok(selectionApprovalPreview.decision.safeguards.some(item => item.includes('No WhatsApp')));
  const selectionApproval = await call(`/api/ledger/approvals/${selection.approvalId}/resolve`, owner,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved', reason: 'Question and options verified for customer.' }) });
  assert.equal(selectionApproval.status, 200);
  const selectionReplay = await call(selectionRoute, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(selectionCommand) });
  assert.equal((await selectionReplay.json()).selection.id, selection.id);
  const publicChoice = await (await call(`/api/client-portal`, access.portalToken)).json();
  const visibleChoice = publicChoice.job.selections.find(item => item.id === selection.id);
  assert.equal(visibleChoice.responseAllowed, true);
  assert.deepEqual(visibleChoice.options, selection.options);
  assert.equal(Object.hasOwn(visibleChoice, 'data'), false);
  assert.doesNotMatch(JSON.stringify(visibleChoice), /Werkvoorbereiding moet|conversationOrigin|analysisIdentity|sourceHash/);
  const responsePayload = { responseId: 'conversation-selection-portal-response-01', decision: 'accepted',
    selectedOption: '90 centimeter', note: 'Deze maat sluit aan bij het dagelijks gebruik.' };
  const submittedClientResponse = await call(`/api/client-portal/selections/${selection.id}/responses`, access.portalToken,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(responsePayload) });
  assert.equal(submittedClientResponse.status, 201);
  const pendingClientResponse = await submittedClientResponse.json();
  assert.equal(pendingClientResponse.approvalRequired, true);
  assert.equal(pendingClientResponse.externalCommitments, 0);
  assert.equal(pendingClientResponse.response.status, 'pending_review');
  assert.equal(Object.hasOwn(pendingClientResponse.selection, 'data'), false);
  assert.doesNotMatch(JSON.stringify(pendingClientResponse), /Werkvoorbereiding moet|conversationOrigin|analysisIdentity|sourceHash/);
  const unresolvedChoice = await (await call(`/api/client-portal`, access.portalToken)).json();
  assert.equal(unresolvedChoice.job.selections.find(item => item.id === selection.id).responseAllowed, false);
  const responseApproval = await call(`/api/ledger/approvals/${pendingClientResponse.approval.id}/resolve`, owner,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved', reason: 'Keuze en klantbevoegdheid gecontroleerd.' }) });
  assert.equal(responseApproval.status, 200);
  const reviewedJob = await (await call(`/api/ledger/jobs/${job.id}`, owner)).json();
  const reviewedSelection = reviewedJob.job.clientSelections.find(item => item.id === selection.id);
  assert.equal(reviewedSelection.status, 'client_confirmed');
  assert.equal(reviewedSelection.data.selectedOption, '90 centimeter');
  assert.equal(reviewedSelection.data.clientResponse.status, 'approved');
  const recordedPortalResponse = await (await call(`/api/client-portal`, access.portalToken)).json();
  const recordedChoice = recordedPortalResponse.job.selections.find(item => item.id === selection.id);
  assert.equal(recordedChoice.status, 'client_confirmed');
  assert.equal(recordedChoice.selectedOption, '90 centimeter');
  assert.equal(recordedChoice.response.status, 'recorded');
  const variationRoute = `${office}/analysis/findings/${encodeURIComponent(finding.sourceId)}/variation`;
  const variationCommand = { entryKey: 'conversation-variation-api-01', analysisIdentity: analysis.identity, sourceId: finding.sourceId,
    quote: finding.quote, title: 'Verbreding deuropening', scopeDelta: 'Verbreden van de bestaande deuropening na maatcontrole op locatie.',
    justification: 'Klant heeft gevraagd om een bredere deuropening.', amount: 450, scheduleDeltaDays: 1,
    scheduleImpactNarrative: 'Reserveer een extra kalenderdag na constructieve controle.', riskImpact: 'medium',
    riskImpactStatement: 'Laat draagconstructie en tijdelijke ondersteuning vooraf beoordelen.' };
  assert.equal((await call(variationRoute, field, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(variationCommand) })).status, 403);
  const variationResponse = await call(variationRoute, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(variationCommand) });
  assert.equal(variationResponse.status, 201);
  const changeOrder = (await variationResponse.json()).changeOrder;
  assert.equal(changeOrder.status, 'draft');
  assert.equal(changeOrder.integrityValid, true);
  assert.equal(changeOrder.workAuthorized, false);
  assert.equal(changeOrder.amount, 450);
  assert.equal(changeOrder.scheduleDeltaDays, 1);
  assert.deepEqual(changeOrder.data.conversationOrigin, { evidenceKind: 'message_finding', accessId: access.id, messageId: created.id,
    messageSourceHash: created.sourceHash, quote: finding.quote, category: 'request', suggestion: finding.suggestion,
    uncertainty: finding.uncertainty, analysisIdentity: analysis.identity });
  assert.deepEqual(changeOrder.formalControl.evidenceReferences, ['Customer request received via secure conversation']);
  assert.deepEqual(changeOrder.snapshot.conversationOrigin, changeOrder.data.conversationOrigin);
  const variationApproval = (await (await call('/api/ledger/approvals', owner)).json()).approvals.find(item => item.id === changeOrder.approvalId);
  assert.equal(variationApproval.status, 'pending');
  assert.deepEqual(variationApproval.decision.preview.conversationOrigin, changeOrder.data.conversationOrigin);
  assert.ok(variationApproval.decision.safeguards.some(item => item.includes('not proof')));
  const variationReplay = await call(variationRoute, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(variationCommand) });
  assert.equal((await variationReplay.json()).changeOrder.id, changeOrder.id);
  assert.equal((await call(variationRoute, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...variationCommand, amount: 900 }) })).status, 409);

  const reportResponse = await call(`/api/ledger/jobs/${job.id}/field-reports`, officeOperator,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      entryKey: 'conversation-api-client-field-report', reportDate: '2026-09-27', status: 'client_visible',
      clientVisible: true, workCompleted: 'Kozijn geplaatst en passing gecontroleerd.', manpower: 3
    }) });
  assert.equal(reportResponse.status, 201);
  const fieldReport = (await reportResponse.json()).fieldReport;
  assert.equal(fieldReport.status, 'pending_approval');
  assert.equal((await call(`${office}/field-reports`, field)).status, 403);
  const fieldReportApproval = await call(`/api/ledger/approvals/${fieldReport.approvalId}/resolve`, owner,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved', reason: 'Rapport gecontroleerd op klantzichtbaarheid.' }) });
  assert.equal(fieldReportApproval.status, 200);
  const eligibleReports = await (await call(`${office}/field-reports`, officeOperator)).json();
  const eligibleReport = eligibleReports.reports.find(item => item.id === fieldReport.id);
  assert.ok(eligibleReport);
  assert.equal(Object.hasOwn(eligibleReport, 'manpower'), false);
  const fieldReportDraftResponse = await call(`${office}/field-reports/${fieldReport.id}/draft`, officeOperator,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      entryKey: 'conversation-api-field-report-draft', sourceHash: eligibleReport.sourceHash,
      body: 'Het kozijn is geplaatst en de passing is gecontroleerd.'
    }) });
  assert.equal(fieldReportDraftResponse.status, 201);
  const fieldReportDraft = (await fieldReportDraftResponse.json()).message;
  assert.deepEqual(fieldReportDraft.sourceReference, { type: 'field_report', id: fieldReport.id });
  assert.equal((await (await call(portal, access.portalToken)).json()).messages.some(message => message.id === fieldReportDraft.id), false);
  const fieldReportMessageApproval = (await (await call('/api/ledger/approvals', owner)).json()).approvals.find(item => item.id === fieldReportDraft.approvalId);
  assert.equal(fieldReportMessageApproval.decision.preview.fieldReportSource.reportDate, fieldReport.reportDate);
  assert.match(fieldReportMessageApproval.decision.preview.fieldReportSource.workCompleted, /passing gecontroleerd/);
  assert.ok(fieldReportMessageApproval.decision.safeguards.some(item => item.includes('field report must remain unchanged')));
  assert.equal((await call(`/api/ledger/approvals/${fieldReportDraft.approvalId}/resolve`, owner,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) })).status, 200);
  assert.equal((await call(`${office}/messages/${fieldReportDraft.id}/publish`, owner,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceHash: fieldReportDraft.sourceHash }) })).status, 200);
  const customerTimeline = await (await call(portal, access.portalToken)).json();
  assert.ok(customerTimeline.messages.some(message => message.id === fieldReportDraft.id && message.body === fieldReportDraft.body));
  assert.equal(customerTimeline.messages.find(message => message.id === fieldReportDraft.id).sourceReference, undefined);

  const staleReportResponse = await call(`/api/ledger/jobs/${job.id}/field-reports`, officeOperator,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      entryKey: 'conversation-api-stale-client-report', reportDate: '2026-09-27', status: 'client_visible',
      clientVisible: true, workCompleted: 'Aanvankelijke rapporttekst.'
    }) });
  const staleReport = (await staleReportResponse.json()).fieldReport;
  assert.equal(staleReportResponse.status, 201);
  assert.equal((await call(`/api/ledger/approvals/${staleReport.approvalId}/resolve`, owner,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) })).status, 200);
  const staleReportSource = (await (await call(`${office}/field-reports`, owner)).json()).reports.find(item => item.id === staleReport.id);
  const otherOffice = `/api/ledger/jobs/${job.id}/conversations/${other.id}`;
  const staleReportDraft = (await (await call(`${otherOffice}/field-reports/${staleReport.id}/draft`, owner,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
      entryKey: 'conversation-api-stale-report-draft', sourceHash: staleReportSource.sourceHash, body: 'Werkzaamheden zijn vandaag afgerond.'
    }) })).json()).message;
  assert.equal((await call(`/api/ledger/client-portal-access/${other.id}/revoke`, owner,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 200);
  assert.equal((await call(`/api/ledger/approvals/${staleReportDraft.approvalId}/resolve`, owner,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) })).status, 403);

  const changedChat = new FormData(); changedChat.set('entryKey', 'client-api-after-analysis'); changedChat.set('body', 'Kan ik ook een andere maat kiezen?');
  assert.equal((await call(`${portal}/messages`, access.portalToken, { method: 'POST', body: changedChat })).status, 201);
  assert.equal((await (await call(inboxRoute, owner)).json()).unreadCount, 1);
  assert.equal((await (await call('/api/ledger/communications', owner)).json()).summary.inboundUnread, 1);
  assert.equal((await call(findingRoute, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...rfiCommand, entryKey: 'conversation-rfi-stale-1' }) })).status, 409);
  assert.equal((await call(observationRoute, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...photoRfiCommand, entryKey: 'conversation-photo-stale-1' }) })).status, 409);
  assert.equal((await call(variationRoute, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...variationCommand, entryKey: 'conversation-variation-stale-1' }) })).status, 409);
  assert.equal((await call('/api/integrations/whatsapp/webhook')).status, 503);
  await call(`/api/ledger/client-portal-access/${access.id}/revoke`, owner, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal((await call(`${portal}/messages/${created.id}/photo`, access.portalToken)).status, 404);
  assert.equal((await call(previewRoute, access.portalToken)).status, 404);
});
