const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { ClientConversation, hash } = require('../client-conversation');
const { ConversationAnalysisQueue, MAX_ATTEMPTS, verifyConversationAnalysisQueue } = require('../conversation-analysis-queue');
const { validateAnalysis, analysisConfig, checkLocalAnalysisModel, analyzeSources, runDurableConversationAnalysisBatch } = require('../conversation-analysis');

test('analysis rejects invented quotes, source IDs and actionable instructions without evidence', () => {
  const sources = [{ id: 'message-1', body: 'De deur moet niet worden verplaatst.' }];
  const result = { findings: [{ sourceId: 'message-1', quote: 'De deur moet niet worden verplaatst.', category: 'request', suggestion: 'Vraag om bevestiging van de bestaande plaats.', uncertainty: 'Context ontbreekt.' }] };
  assert.equal(validateAnalysis(result, sources).findings.length, 1);
  assert.throws(() => validateAnalysis({ findings: [{ ...result.findings[0], quote: 'De deur moet worden verplaatst.' }] }, sources));
  assert.throws(() => validateAnalysis({ findings: [{ ...result.findings[0], sourceId: 'private-other-job' }] }, sources));
  assert.throws(() => validateAnalysis({ ...result, execute: true }, sources));
  const observation = { sourceId: 'message-1', sha256: 'a'.repeat(64), observation: 'Mogelijke beschadiging zichtbaar.', uncertainty: 'Niet te meten uit deze foto.' };
  assert.throws(() => validateAnalysis({ ...result, observations: [observation] }, sources));
  assert.equal(validateAnalysis({ ...result, observations: [observation] }, sources, [{ sourceId: 'message-1', sha256: 'a'.repeat(64) }]).imageContentAnalyzed, true);
});

test('analysis rejects a proposal that reverses explicit customer non-approval', () => {
  const sources = [{ id: 'm-refusal', body: 'Ik geef GEEN akkoord op de meerprijs van 1200 euro.' }];
  const finding = { sourceId: 'm-refusal', quote: sources[0].body, category: 'request',
    suggestion: 'Verzoek de klant om de meerprijs van 1200 euro te accepteren.',
    uncertainty: 'De klant heeft geen akkoord gegeven op de meerprijs.' };
  assert.throws(() => validateAnalysis({ findings: [finding] }, sources), error =>
    error.code === 'explicit_non_approval_conflict' && error.statusCode === 502);
  const safe = { ...finding, category: 'contradiction', suggestion: 'Leg vast dat de klant geen akkoord geeft op de meerprijs. Zet deze niet als geaccepteerd klaar en laat kantoor de vervolgstap beoordelen.' };
  assert.equal(validateAnalysis({ findings: [safe] }, sources).findings[0].suggestion, safe.suggestion);
});

test('AI configuration is disabled by default and cannot silently transmit to remote hosts', () => {
  assert.equal(analysisConfig({}).enabled, false);
  assert.throws(() => analysisConfig({ CONTRACTOR_AI_CHAT_AI_ENABLED: 'true', CONTRACTOR_AI_CHAT_AI_MODEL: 'local-model', CONTRACTOR_AI_CHAT_AI_URL: 'https://external.example' }));
});

test('local API launcher opt-in pins analysis to loopback and leaves automation and vision off', () => {
  const { configureLocalAi } = require('../scripts/local-ai-launch');
  const unchanged = {};
  assert.equal(configureLocalAi(unchanged), null);
  assert.deepEqual(unchanged, {});
  const environment = { CONTRACTOR_AI_LOCAL_MODEL: 'qwen3:4b' };
  const settings = configureLocalAi(environment, { requested: true });
  assert.deepEqual(settings, { model: 'qwen3:4b', url: 'http://127.0.0.1:11434', contextTokens: 4096,
    automaticAnalysis: false, imageAnalysis: false });
  assert.equal(environment.CONTRACTOR_AI_CHAT_AI_ENABLED, 'true');
  assert.equal(environment.CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE, 'false');
  assert.throws(() => configureLocalAi({ CONTRACTOR_AI_RUNTIME_MODE: 'hosted' }, { requested: true }), /only available in local/);
  assert.throws(() => configureLocalAi({ CONTRACTOR_AI_LOCAL_MODEL: 'qwen-cloud:latest' }, { requested: true }), /valid installed local model/);
});

test('automatic analysis is an independent opt-in and remains off by default', () => {
  assert.equal(analysisConfig({ CONTRACTOR_AI_CHAT_AI_ENABLED: 'true', CONTRACTOR_AI_CHAT_AI_MODEL: 'local-model' }).autoAnalyze, false);
  assert.equal(analysisConfig({ CONTRACTOR_AI_CHAT_AI_ENABLED: 'true', CONTRACTOR_AI_CHAT_AI_MODEL: 'local-model', CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE: 'true' }).autoAnalyze, true);
  assert.equal(analysisConfig({ CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE: 'true' }).autoAnalyze, false);
});

test('local model check reads only runtime status and reports a missing model without sending customer data', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    const payload = String(url).endsWith('/api/version') ? { version: '0.33.3' } : { models: [{ name: 'another-model:latest' }] };
    return new Response(JSON.stringify(payload), { headers: { 'content-type': 'application/json' } });
  };
  const result = await checkLocalAnalysisModel({ enabled: true, url: 'http://127.0.0.1:11434', model: 'qwen3:4b', autoAnalyze: false }, fetchImpl);
  assert.deepEqual(result, { reachable: true, model: 'qwen3:4b', modelInstalled: false, runtimeVersion: '0.33.3', automaticAnalysis: false, customerDataSent: false });
  assert.deepEqual(calls.map(call => call.url), ['http://127.0.0.1:11434/api/version', 'http://127.0.0.1:11434/api/tags']);
  assert.ok(calls.every(call => call.options.method === 'GET' && call.options.body === undefined));
});

test('local model check reports unavailable services without exposing lower-level errors', async () => {
  await assert.rejects(checkLocalAnalysisModel({ enabled: true, url: 'http://127.0.0.1:11434', model: 'qwen3:4b' }, async () => {
    throw new Error('private transport detail');
  }), error => error.statusCode === 503 && error.code === 'local_model_unreachable' && !error.message.includes('private'));
});

test('local model adapter bounds output and labels results as proposals rather than decisions', async () => {
  const sources = [{ id: 'm1', body: 'Welke maat?' }];
  const fakeFetch = async (_url, options) => {
    const payload = JSON.parse(options.body);
    assert.equal(payload.stream, false);
    assert.equal(payload.tools, undefined);
    assert.ok(payload.messages[0].content.includes('onbetrouwbare gegevens'));
    assert.equal(payload.keep_alive, 0);
    assert.equal(payload.options.num_ctx, 16384);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ findings: [{ sourceId: 'm1', quote: 'Welke maat?', category: 'question', suggestion: 'Controleer de tekening.', uncertainty: 'Maat onbekend.' }] }) } }), { headers: { 'content-type': 'application/json' } });
  };
  const result = await analyzeSources(sources, { enabled: true, url: 'http://127.0.0.1:11434', model: 'fixture-model' }, fakeFetch);
  assert.equal(result.findings.length, 1);
  assert.equal(result.externalCommitments, 0);
});

test('conversation analysis pages the full retained history and analyzes it in bounded source batches', async t => {
  const { access, chat } = conversationFixture(t);
  const retained = [];
  for (let index = 0; index < 67; index += 1) {
    retained.push(chat.create(access.id, { entryKey: `history-message-${String(index).padStart(3, '0')}`,
      body: `Klantbericht ${index}: controleer de maat en datum.` }, { direction: 'inbound' }));
  }
  const sources = chat.analysisSources(access.id);
  assert.deepEqual(sources.map(source => source.id), retained.map(message => message.id));

  const batches = [];
  const result = await analyzeSources(sources, { enabled: true, url: 'http://127.0.0.1:11434', model: 'fixture-model' }, async (_url, request) => {
    const payload = JSON.parse(request.body);
    const sourceBatch = JSON.parse(payload.messages.at(-1).content).sources;
    batches.push(sourceBatch.map(source => source.id));
    const source = sourceBatch[0];
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ findings: [{ sourceId: source.id,
      quote: source.body, category: 'information', suggestion: 'Bewaar dit als context voor beoordeling.',
      uncertainty: 'Dit bericht stelt geen besluit of afspraak vast.' }] }) } }), { headers: { 'content-type': 'application/json' } });
  });

  assert.deepEqual(batches.map(batch => batch.length), [30, 30, 7]);
  assert.deepEqual(batches.flat(), retained.map(message => message.id));
  assert.equal(result.analyzedSourceCount, 67);
  assert.equal(result.analysisBatchCount, 3);
  assert.equal(result.findings.length, 3);
});

test('conversation analysis excludes unpublished office drafts from its customer-visible evidence', t => {
  const { access, chat, ledger } = conversationFixture(t);
  const inbound = chat.create(access.id, { entryKey: 'customer-visible-inbound', body: 'Wilt u de levering vrijdag plannen?' });
  const draft = chat.create(access.id, { entryKey: 'private-office-draft', body: 'Interne prijsnotitie: eerst leverancier bellen.' }, { direction: 'outbound' });
  const approval = ledger.db.prepare('SELECT id FROM approvals WHERE target_id = ?').get(draft.id);
  ledger.resolveApproval(approval.id, { status: 'approved', resolvedBy: 'approver', reason: 'Reviewed reply.' });
  chat.publish(access.id, draft.id, draft.sourceHash, 'office_operator');
  const sources = chat.analysisSources(access.id);
  assert.deepEqual(sources.map(source => source.id), [inbound.id, draft.id]);

  const privateDraft = chat.create(access.id, { entryKey: 'still-private-office-draft', body: 'Internal draft excluded.' }, { direction: 'outbound' });
  assert.deepEqual(chat.analysisSources(access.id).map(source => source.id), [inbound.id, draft.id]);
  assert.equal(chat.analysisSources(access.id).some(source => source.id === privateDraft.id), false);
});

test('conversation source retention fails closed at the message and evidence-size limits', () => {
  const overMessageLimit = Object.create(ClientConversation.prototype);
  let pageNumber = 0;
  overMessageLimit.list = () => {
    const current = pageNumber++;
    return { messages: Array.from({ length: 50 }, (_, index) => ({ id: `${current}-${index}`, body: 'x', direction: 'inbound' })),
      nextCursor: current < 20 ? String(current + 1) : null };
  };
  assert.throws(() => overMessageLimit.analysisSources('access'), { code: 'conversation_analysis_source_limit', statusCode: 413 });

  const overEvidenceLimit = Object.create(ClientConversation.prototype);
  overEvidenceLimit.list = () => ({ messages: [{ id: 'large-message', body: 'x'.repeat(2 * 1024 * 1024), direction: 'inbound' }], nextCursor: null });
  assert.throws(() => overEvidenceLimit.analysisSources('access'), { code: 'conversation_analysis_evidence_limit', statusCode: 413 });
});

test('small local contexts reject oversized sources before contacting the model', async () => {
  for (const value of ['0', '4095', '32769', 'NaN']) assert.throws(() => analysisConfig({ CONTRACTOR_AI_CHAT_AI_ENABLED: 'true', CONTRACTOR_AI_CHAT_AI_MODEL: 'local-model', CONTRACTOR_AI_CHAT_AI_CONTEXT_TOKENS: value }));
  let calls = 0;
  await assert.rejects(analyzeSources([{ id: 'm1', body: 'x'.repeat(1200) }], { enabled: true, contextTokens: 4096 }, async () => { calls++; }), /context budget/);
  assert.equal(calls, 0);
});

function conversationFixture(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'conversation-analysis-queue-'));
  const ledgerFile = path.join(directory, 'ledger.sqlite');
  const ledger = new ContractorOperatingLedger({ dbFile: ledgerFile });
  t.after(() => { ledger.close(); fs.rmSync(directory, { recursive: true, force: true }); });
  const job = ledger.createIntake({ title: 'Analysis queue job', client: { name: 'Queue client' }, assignAutomatically: false });
  const access = ledger.createClientPortalAccess(job.id);
  ledger.resolveApproval(access.approval.id, { status: 'approved' });
  return { ledger, ledgerFile, job, access, chat: new ClientConversation(ledger) };
}

const localOptIn = { CONTRACTOR_AI_CHAT_AI_ENABLED: 'true', CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE: 'true', CONTRACTOR_AI_CHAT_AI_MODEL: 'queue-fixture-model' };

test('durable analysis queue is idempotent, leased, retryable and stores no message body', t => {
  const { ledger, ledgerFile, job, access, chat } = conversationFixture(t);
  const source = chat.create(access.id, { entryKey: 'queue-source-0001', body: 'Please confirm the delivery date.' }, { direction: 'inbound' });
  const queue = new ConversationAnalysisQueue(ledger);
  const sourceHash = hash(chat.analysisSources(access.id));
  const identity = hash(['analysis-identity']);
  const now = new Date('2026-09-25T12:00:00.000Z');
  const first = queue.enqueue({ accessId: access.id, jobId: job.id, sourceHash, identity, now });
  assert.equal(queue.enqueue({ accessId: access.id, jobId: job.id, sourceHash, identity, now }).id, first.id);
  assert.equal(JSON.stringify(first).includes(source.body), false);
  const claimed = queue.claimNext({ now });
  assert.equal(claimed.status, 'processing');
  assert.equal(queue.claimNext({ now }), null);
  const retry = queue.retry(claimed.id, claimed.leaseId, 'model_unavailable', now);
  assert.equal(retry.status, 'retry_wait');
  assert.equal(retry.nextAttemptAt, '2026-09-25T12:00:30.000Z');
  assert.equal(queue.claimNext({ now }), null);
  const resumed = queue.claimNext({ now: new Date('2026-09-25T12:00:31.000Z') });
  assert.equal(resumed.attemptCount, 2);
  assert.equal(queue.finish(resumed.id, resumed.leaseId, identity, new Date('2026-09-25T12:00:32.000Z')).status, 'completed');
  assert.equal(queue.claimNext({ now: new Date('2026-09-25T12:02:00.000Z') }), null);
  const second = queue.enqueue({ accessId: access.id, jobId: job.id, sourceHash, identity: hash(['retry-exhaustion']), now });
  let attempt = queue.claimNext({ now });
  assert.equal(attempt.id, second.id);
  while (attempt.attemptCount < MAX_ATTEMPTS) {
    const delayed = queue.retry(attempt.id, attempt.leaseId, 'model_unavailable', new Date(attempt.updatedAt));
    if (delayed.status === 'dead_letter') break;
    attempt = queue.claimNext({ now: new Date(delayed.nextAttemptAt) });
  }
  const exhausted = queue.retry(attempt.id, attempt.leaseId, 'model_unavailable', new Date(attempt.updatedAt));
  assert.equal(exhausted.status, 'dead_letter');
  assert.deepEqual(verifyConversationAnalysisQueue(ledger.db), { valid: true, queuedJobs: 2 });
  const reopened = new ContractorOperatingLedger({ dbFile: ledgerFile });
  assert.equal(new ConversationAnalysisQueue(reopened).get(first.id).status, 'completed');
  assert.equal(new ConversationAnalysisQueue(reopened).get(second.id).status, 'dead_letter');
  reopened.close();
});

test('durable local analysis is opt-in, source-bound and remains an internal proposal', async t => {
  const { ledger, access, chat } = conversationFixture(t);
  const first = chat.create(access.id, { entryKey: 'queue-first-message', body: 'Wanneer wordt de vloer geleverd?' }, { direction: 'inbound' });
  const disabled = await runDurableConversationAnalysisBatch({ chat, env: { ...localOptIn, CONTRACTOR_AI_CHAT_AI_AUTO_ANALYZE: 'false' } });
  assert.equal(disabled.reason, 'auto_analysis_disabled');
  assert.equal(chat.event('conversation_analysis', access.id), null);

  let modelCalls = 0;
  const fetchImpl = async (_url, request) => {
    modelCalls += 1;
    const { sources } = JSON.parse(JSON.parse(request.body).messages.at(-1).content);
    const source = sources.find(item => item.id === first.id);
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ findings: [{ sourceId: source.id,
      quote: 'Wanneer wordt de vloer geleverd?', category: 'question', suggestion: 'Controleer de verwachte leverdatum.',
      uncertainty: 'Er is nog geen leverdatum bevestigd.' }] }) } }), { headers: { 'content-type': 'application/json' } });
  };
  const now = new Date('2026-09-25T13:00:00.000Z');
  const completed = await runDurableConversationAnalysisBatch({ chat, env: localOptIn, fetchImpl, now, maxJobs: 1 });
  assert.equal(completed.ran, true);
  assert.equal(completed.processed, 1);
  assert.equal(modelCalls, 1);
  const analysis = chat.event('conversation_analysis', access.id);
  assert.equal(analysis.identity.length, 64);
  assert.equal(analysis.findings[0].sourceId, first.id);
  assert.equal(analysis.automaticallyExecuted, false);
  assert.equal(analysis.externalCommitments, 0);
  const queue = new ConversationAnalysisQueue(ledger).latestForAccess(access.id, analysis.identity);
  assert.equal(queue.status, 'completed');
  assert.equal(queue.resultHash.length, 64);

  chat.create(access.id, { entryKey: 'queue-second-message', body: 'Kan het ook volgende week?' }, { direction: 'inbound' });
  const secondRun = await runDurableConversationAnalysisBatch({ chat, env: localOptIn, fetchImpl: async () => {
    throw new Error('stale sources must be enqueued only after a fresh conversation scan');
  }, now: new Date('2026-09-25T13:01:00.000Z'), maxJobs: 1 });
  assert.equal(secondRun.ran, true);
  assert.equal(secondRun.failed, 1);
  assert.equal(chat.event('conversation_analysis', access.id).sourceHash, analysis.sourceHash);
  assert.notEqual(chat.event('conversation_analysis', access.id).sourceHash, hash(chat.analysisSources(access.id)));
  const pending = new ConversationAnalysisQueue(ledger).latestForAccess(access.id);
  assert.equal(pending.status, 'retry_wait');
  assert.notEqual(pending.sourceHash, analysis.sourceHash);
  const changedConfiguration = await runDurableConversationAnalysisBatch({ chat,
    env: { ...localOptIn, CONTRACTOR_AI_CHAT_AI_MODEL: 'queue-fixture-model-v2' },
    fetchImpl: async () => { throw new Error('fixture model unavailable'); },
    now: new Date('2026-09-25T13:02:00.000Z'), maxJobs: 1
  });
  assert.equal(changedConfiguration.failed, 1);
  const replacement = new ConversationAnalysisQueue(ledger).latestForAccess(access.id);
  assert.notEqual(replacement.identity, pending.identity);
  assert.equal(replacement.sourceHash, pending.sourceHash);
  assert.equal(new ConversationAnalysisQueue(ledger).get(pending.id).status, 'superseded');
});

test('durable queue permanently blocks an AI proposal that reverses a customer refusal', async t => {
  const { access, chat } = conversationFixture(t);
  const source = chat.create(access.id, { entryKey: 'explicit-refusal-source',
    body: 'Ik geef GEEN akkoord op de meerprijs van 1200 euro.' }, { direction: 'inbound' });
  const result = await runDurableConversationAnalysisBatch({ chat, env: localOptIn, maxJobs: 1,
    now: new Date('2026-09-25T16:00:00.000Z'),
    fetchImpl: async () => new Response(JSON.stringify({ message: { content: JSON.stringify({ findings: [{
      sourceId: source.id, quote: source.body, category: 'request',
      suggestion: 'Verzoek de klant om de meerprijs van 1200 euro te accepteren.',
      uncertainty: 'De klant heeft geen akkoord gegeven op de meerprijs.'
    }] }) } }), { headers: { 'content-type': 'application/json' } })
  });
  assert.equal(result.failed, 1);
  assert.equal(chat.event('conversation_analysis', access.id), null);
  const queued = new ConversationAnalysisQueue(chat.ledger).latestForAccess(access.id);
  assert.equal(queued.status, 'dead_letter');
  assert.equal(queued.lastErrorCode, 'explicit_non_approval_conflict');
});

test('durable inference is discarded if a new client message arrives while the model is running', async t => {
  const { ledger, access, chat } = conversationFixture(t);
  const source = chat.create(access.id, { entryKey: 'source-changes-during-model', body: 'Is de ruimte veilig?' }, { direction: 'inbound' });
  const fetchImpl = async (_url, request) => {
    const { sources } = JSON.parse(JSON.parse(request.body).messages.at(-1).content);
    assert.ok(sources.some(item => item.id === source.id));
    chat.create(access.id, { entryKey: 'arrived-during-model', body: 'De sleutel is nog niet beschikbaar.' }, { direction: 'inbound' });
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ findings: [{ sourceId: source.id,
      quote: source.body, category: 'question', suggestion: 'Controleer de geldende veiligheidsinstructie.',
      uncertainty: 'De actuele toestand op locatie is niet bevestigd.' }] }) } }), { headers: { 'content-type': 'application/json' } });
  };
  const result = await runDurableConversationAnalysisBatch({ chat, env: localOptIn, fetchImpl,
    now: new Date('2026-09-25T14:00:00.000Z'), maxJobs: 1 });
  assert.equal(result.superseded, 1);
  assert.equal(result.failed, 0);
  assert.equal(chat.event('conversation_analysis', access.id), null);
  const queue = new ConversationAnalysisQueue(ledger).latestForAccess(access.id);
  assert.equal(queue.status, 'superseded');
  assert.equal(queue.lastErrorCode, 'source_changed');
});

test('durable vision analysis verifies private inbound photo bytes before local submission', async t => {
  const { access, chat } = conversationFixture(t);
  const bytes = Buffer.from('fixture-private-image-bytes');
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const message = chat.create(access.id, { entryKey: 'queue-photo-message', body: 'Wat is zichtbaar?' }, { direction: 'inbound',
    attachment: { originalName: 'werk.jpg', mimeType: 'image/jpeg', size: bytes.length, sha256, storageRef: 'private/test-photo' } });
  const fakeFetch = async (_url, request) => {
    const payload = JSON.parse(request.body);
    const prompt = payload.messages.at(-1);
    assert.equal(prompt.images.length, 1);
    const { sources, imageOrder } = JSON.parse(prompt.content);
    assert.deepEqual(imageOrder, [{ sourceId: message.id, sha256 }]);
    assert.ok(sources.some(source => source.id === message.id));
    return new Response(JSON.stringify({ message: { content: JSON.stringify({ findings: [], observations: [{ sourceId: message.id, sha256,
      observation: 'Een mogelijk scheurtje is zichtbaar.', uncertainty: 'Diepte en oorzaak zijn niet uit deze foto vast te stellen.' }] }) } }),
    { headers: { 'content-type': 'application/json' } });
  };
  const result = await runDurableConversationAnalysisBatch({ chat,
    env: { ...localOptIn, CONTRACTOR_AI_CHAT_AI_VISION_ENABLED: 'true' }, readPhoto: async () => bytes,
    fetchImpl: fakeFetch, now: new Date('2026-09-25T15:00:00.000Z'), maxJobs: 1
  });
  assert.equal(result.processed, 1);
  const retained = chat.event('conversation_analysis', access.id);
  assert.equal(retained.observations[0].sha256, sha256);
  assert.equal(retained.submittedPhotoCount, 1);
});
