const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-work-board-registration-'));
process.env.NODE_ENV = 'test';
process.env.STATE_FILE = path.join(directory, 'state.json');
process.env.LEDGER_DB_FILE = path.join(directory, 'ledger.sqlite');
process.env.UPLOAD_DIR = path.join(directory, 'uploads');
process.env.CONTRACTOR_AI_REQUIRE_AUTH = 'false';
process.env.CONTRACTOR_AI_WORK_BOARD_ENABLED = 'true';
process.env.CONTRACTOR_AI_WORK_BOARD_REGISTRATION_ENABLED = 'false';

const app = require('../server');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { WorkBoard } = require('../work-board');
const { resolveWorkBoardSettings } = require('../work-board-routes');

test('registration defaults closed outside local development and requires an independent opt-in', () => {
  assert.deepEqual(resolveWorkBoardSettings({ isProduction: true, runtimeMode: 'hosted' }), { enabled: false, registrationEnabled: false });
  assert.deepEqual(resolveWorkBoardSettings({ isProduction: true, runtimeMode: 'hosted', enabled: 'true' }), { enabled: true, registrationEnabled: false });
  assert.deepEqual(resolveWorkBoardSettings({ isProduction: true, runtimeMode: 'hosted', enabled: 'true', registrationEnabled: 'true' }), { enabled: true, registrationEnabled: true });
  assert.deepEqual(resolveWorkBoardSettings({ isProduction: false, runtimeMode: 'local' }), { enabled: true, registrationEnabled: true });
  assert.deepEqual(resolveWorkBoardSettings({ isProduction: false, runtimeMode: 'local', enabled: 'false', registrationEnabled: 'true' }), { enabled: false, registrationEnabled: false });
});

test('closed public registration does not disable login for existing worker accounts', async () => {
  const fixtureLedger = new ContractorOperatingLedger({ dbFile: process.env.LEDGER_DB_FILE });
  await new WorkBoard(fixtureLedger).register({
    name: 'Existing worker', email: 'existing-worker@example.test', phone: '0612345678',
    region: 'Utrecht', skills: ['Carpenter'], password: 'Existing worker passphrase 123', privacyAccepted: true
  });
  fixtureLedger.close();

  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  try {
    const baseUrl = `http://127.0.0.1:${server.address().port}`;
    const configResponse = await fetch(`${baseUrl}/api/work-board/config`);
    assert.equal(configResponse.status, 200);
    assert.match(configResponse.headers.get('cache-control') || '', /no-store/);
    assert.deepEqual(await configResponse.json(), { success: true, enabled: true, registrationEnabled: false });

    const registrationResponse = await fetch(`${baseUrl}/api/work-board/register`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'New worker', email: 'new-worker@example.test', phone: '0612345678', region: 'Utrecht', skills: ['Carpenter'], password: 'New worker passphrase 123', privacyAccepted: true })
    });
    assert.equal(registrationResponse.status, 503);
    assert.equal((await registrationResponse.json()).error.code, 'work_board_registration_disabled');

    const loginResponse = await fetch(`${baseUrl}/api/work-board/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'existing-worker@example.test', password: 'Existing worker passphrase 123' })
    });
    assert.equal(loginResponse.status, 200);
    assert.equal((await loginResponse.json()).account.email, 'existing-worker@example.test');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
