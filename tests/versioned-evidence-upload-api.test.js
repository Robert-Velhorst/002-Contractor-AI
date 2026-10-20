const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { ContractorOperatingLedger } = require('../operating-ledger');
const { jpegFixture } = require('./image-fixtures');

test('a rejected versioned evidence upload cleans the reserved object without releasing retained evidence', async t => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-versioned-upload-'));
  const objects = new Map();
  const deletedVersions = [];
  let inspection;
  let nextVersion = 0;
  const storageServer = http.createServer(async (req, res) => {
    const target = new URL(req.url, 'http://storage.test');
    if (req.method === 'GET' && target.searchParams.has('versions')) {
      const prefix = `/contractor-private/${target.searchParams.get('prefix')}`;
      const versions = [...objects.entries()].filter(([key]) => key === prefix).map(([key, value]) =>
        `<Version><Key>${key.slice('/contractor-private/'.length)}</Key><VersionId>${value.versionId}</VersionId></Version>`);
      res.end(`<ListVersionsResult>${versions.join('')}<IsTruncated>false</IsTruncated></ListVersionsResult>`);
      return;
    }
    if (req.method === 'PUT') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const versionId = `version-${++nextVersion}`;
      objects.set(target.pathname, { versionId, body: Buffer.concat(chunks) });
      res.writeHead(200, { 'x-amz-version-id': versionId });
      res.end();
      return;
    }
    const stored = objects.get(target.pathname);
    if (req.method === 'GET' && stored && (!target.searchParams.has('versionId')
        || target.searchParams.get('versionId') === stored.versionId)) {
      res.writeHead(200, { 'x-amz-version-id': stored.versionId });
      res.end(stored.body);
      return;
    }
    if (req.method === 'DELETE') {
      if (stored && target.searchParams.get('versionId') === stored.versionId) {
        deletedVersions.push(stored.versionId);
        objects.delete(target.pathname);
      }
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise(resolve => storageServer.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { storageServer.close(resolve); storageServer.closeAllConnections(); }));
  Object.assign(process.env, {
    NODE_ENV: 'test', CONTRACTOR_AI_RUNTIME_MODE: 'local', CONTRACTOR_AI_STORAGE_MODE: 's3',
    CONTRACTOR_AI_REQUIRE_AUTH: 'false', CONTRACTOR_AI_AUTONOMOUS_SCHEDULER_ENABLED: 'false',
    CONTRACTOR_AI_S3_ENDPOINT: `http://127.0.0.1:${storageServer.address().port}`,
    CONTRACTOR_AI_S3_BUCKET: 'contractor-private', CONTRACTOR_AI_S3_REGION: 'eu-central-1',
    CONTRACTOR_AI_S3_ACCESS_KEY_ID: 'test-access', CONTRACTOR_AI_S3_SECRET_ACCESS_KEY: 'test-secret',
    STATE_FILE: path.join(directory, 'state.json'), LEDGER_DB_FILE: path.join(directory, 'ledger.sqlite'),
    UPLOAD_DIR: path.join(directory, 'uploads')
  });
  const app = require('../server');
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  t.after(async () => {
    await app.locals.runtimeControl.shutdown({ server, signal: 'versioned_evidence_test' });
    inspection?.close();
    fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 });
  });
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const intakeResponse = await fetch(`${baseUrl}/api/ledger/intake`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: 'Versioned evidence project', client: { name: 'Test client' } })
  });
  assert.equal(intakeResponse.status, 201);
  const intake = await intakeResponse.json();
  const upload = async entryKey => {
    const form = new FormData();
    form.append('jobId', intake.job.id);
    form.append('evidenceFile', new Blob([jpegFixture(entryKey)], { type: 'image/jpeg' }), 'proof.jpg');
    return fetch(`${baseUrl}/api/ledger/upload`, { method: 'POST', body: form });
  };

  const accepted = await upload('accepted');
  assert.equal(accepted.status, 200);
  const retained = await accepted.json();
  assert.match(retained.uploadedFile.storageRef, /\?versionId=version-\d+$/);
  const keptVersion = new URL(retained.uploadedFile.storageRef).searchParams.get('versionId');

  inspection = new ContractorOperatingLedger({ dbFile: process.env.LEDGER_DB_FILE });
  inspection.db.exec("CREATE TRIGGER reject_evidence_fixture BEFORE INSERT ON documents BEGIN SELECT RAISE(ABORT, 'fixture_document_write_rejected'); END");
  const rejected = await upload('rejected');
  assert.equal(rejected.status, 500);
  await rejected.json();
  const reservations = inspection.db.prepare('SELECT status FROM evidence_storage_reservations ORDER BY created_at').all();
  assert.deepEqual(reservations.map(row => row.status).sort(), ['committed', 'released']);
  assert.equal(deletedVersions.includes(keptVersion), false);
  assert.equal([...objects.values()].filter(value => value.versionId === keptVersion).length, 1);
  assert.equal([...objects.keys()].filter(key => key.includes('/uploads/')).length, 1);
});
