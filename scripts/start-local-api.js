const path = require('node:path');

const localAi = require('./local-ai-launch').configureLocalAi(process.env, { requested: process.argv.includes('--local-ai') });
if (localAi) console.info(`Local conversation analysis enabled for ${localAi.model}; automatic analysis and image analysis are off.`);

if (!process.env.PORT) process.env.PORT = '3001';
if (!process.env.CONTRACTOR_AI_BIND_HOST) process.env.CONTRACTOR_AI_BIND_HOST = '127.0.0.1';
if (!process.env.CONTRACTOR_AI_DATA_DIR) process.env.CONTRACTOR_AI_DATA_DIR = path.resolve(__dirname, '..', 'data', 'dev-runtime');
const app = require('../server.js');
const runtime = app.locals.runtimeControl;

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => runtime.shutdown({ signal }).then(() => { process.exitCode = 0; }));
}

runtime.start().catch(error => {
  console.error('Contractor.AI local API failed to start:', error.message);
  runtime.shutdown({ signal: 'startup_failed' }).catch(() => {}).finally(() => { process.exitCode = 1; });
});
