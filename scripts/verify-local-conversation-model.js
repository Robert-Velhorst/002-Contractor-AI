const { analysisConfig, runDurableConversationAnalysisBatch } = require('../conversation-analysis');
const { ConversationAnalysisQueue } = require('../conversation-analysis-queue');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { ClientConversation } = require('../client-conversation');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

async function verifyLocalModel() {
  const config = analysisConfig();
  if (!config.enabled) throw new Error('Configure the explicitly selected local model first.');
  const version = await (await fetch(`${config.url}/api/version`, { signal: AbortSignal.timeout(5000) })).json();
  const start = Date.now();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-local-ai-evaluation-'));
  const ledger = new ContractorOperatingLedger({ dbFile: path.join(directory, 'ledger.sqlite') });
  let analysis, durableRun, queueStatus, queueError;
  try {
    const job = ledger.createIntake({ title: 'Synthetic local AI evaluation', client: { name: 'Synthetic client' }, assignAutomatically: false });
    const access = ledger.createClientPortalAccess(job.id);
    ledger.resolveApproval(access.approval.id, { status: 'approved' });
    const chat = new ClientConversation(ledger);
    [
      chat.create(access.id, { entryKey: 'synthetic-refusal-0001', body: 'Ik geef GEEN akkoord op de meerprijs van 1200 euro.' }, { direction: 'inbound' }),
      chat.create(access.id, { entryKey: 'synthetic-question-0001', body: 'Welke maat heeft de deuropening?' }, { direction: 'inbound' })
    ];
    durableRun = await runDurableConversationAnalysisBatch({ chat, env: process.env, now: new Date(), maxJobs: 1 });
    analysis = chat.event('conversation_analysis', access.id);
    const queue = new ConversationAnalysisQueue(ledger);
    const queued = analysis ? queue.get(analysis.durableJobId) : queue.latestForAccess(access.id);
    queueStatus = queued?.status || null;
    queueError = queued?.lastErrorCode || null;
  } finally {
    ledger.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
  if (!analysis || durableRun.processed !== 1 || queueStatus !== 'completed') throw new Error(JSON.stringify({
    reason: durableRun.reason || durableRun.error || null, processed: durableRun.processed || 0, failed: durableRun.failed || 0,
    queueStatus, queueError, retainedAnalysis: Boolean(analysis)
  }));
  const refusal = analysis.findings.find(item => item.quote.includes('GEEN akkoord') && /geen akkoord|niet akkoord|ontbreekt|ontbreken|weigert|geweigerd|geen toestemming/i.test(item.suggestion));
  const question = analysis.findings.find(item => item.category === 'question' && item.quote.includes('maat'));
  const checks = { groundedFindings: analysis.findings.length > 0, refusalPreserved: Boolean(refusal), measurementQuestionRetained: Boolean(question), separateIntents: analysis.findings.length >= 2 };
  const passed = Object.values(checks).every(Boolean);
  return { format: 'contractor-local-model-evaluation/v1', runtime: version.version, model: config.model, contextTokens: config.contextTokens,
    passed, checks, queueStatus, retainedInTemporaryLedger: true, durationMs: Date.now() - start, syntheticSourcesOnly: true, actualModelRequest: true, externalCommitments: 0,
    interpretationRequiresHumanReview: true, findings: analysis.findings, observations: analysis.observations };
}
if (require.main === module) verifyLocalModel().then(result => { console.log(JSON.stringify(result)); if (!result.passed) process.exitCode = 1; }).catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { verifyLocalModel };
