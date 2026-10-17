const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { EvidenceStorageError, LocalEvidenceStorage, S3EvidenceStorage, isValidSseCustomerKey } = require('../evidence-storage');

function expectedS3Authorization(url, headers, { accessKeyId, secretAccessKey, method = 'GET', region = 'eu-central-1' }) {
  const dateStamp = headers['x-amz-date'].slice(0, 8);
  const signedHeaderNames = Object.keys(headers).filter(name => name !== 'authorization').sort();
  const canonicalHeaders = signedHeaderNames.map(name => `${name}:${headers[name]}\n`).join('');
  const signedHeaders = signedHeaderNames.join(';');
  const canonicalRequest = [method, url.pathname, url.search.slice(1), canonicalHeaders, signedHeaders,
    headers['x-amz-content-sha256']].join('\n');
  const scope = `${dateStamp}/${region}/s3/aws4_request`;
  const hmac = (key, value) => crypto.createHmac('sha256', key).update(value, 'utf8').digest();
  const signingKey = hmac(hmac(hmac(hmac(`AWS4${secretAccessKey}`, dateStamp), region), 's3'), 'aws4_request');
  const stringToSign = ['AWS4-HMAC-SHA256', headers['x-amz-date'], scope,
    crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
  const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
  return `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
}

test('local evidence storage retains files under the configured private root', async t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-storage-project-'));
  const rootDir = path.join(projectRoot, 'data', 'uploads');
  const storage = new LocalEvidenceStorage({ rootDir, projectRoot });
  const stored = await storage.store({
    originalName: 'site proof.jpg',
    mimeType: 'image/jpeg',
    size: 4,
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0])
  });
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));

  assert.match(stored.storageRef, /^data\/uploads\//);
  assert.equal(stored.sha256, crypto.createHash('sha256').update(Buffer.from([0xff, 0xd8, 0xff, 0xe0])).digest('hex'));
  assert.deepEqual(await storage.read(stored.storageRef), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  assert.deepEqual(await storage.read(stored.storageRef, {
    maxBytes: 4, expectedSize: 4, expectedSha256: stored.sha256
  }), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));
  const verification = await storage.verify();
  assert.equal(verification.ready, true);
  assert.equal(verification.mode, 'local');
  assert.equal(await storage.remove(stored.storageRef), true);
  assert.equal(await storage.remove(stored.storageRef), false);
  await assert.rejects(() => storage.read('../outside.jpg'), error => error instanceof EvidenceStorageError && error.code === 'evidence_not_available');
  await assert.rejects(() => storage.remove('../outside.jpg'), error => error instanceof EvidenceStorageError && error.code === 'invalid_storage_reference');
});

test('local evidence rejects growth beyond its retained ledger size before reading it', async t => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'contractor-ai-storage-growth-'));
  const rootDir = path.join(projectRoot, 'uploads');
  const storage = new LocalEvidenceStorage({ rootDir, projectRoot });
  const stored = await storage.store({ originalName: 'proof.bin', mimeType: 'application/octet-stream', size: 4, buffer: Buffer.from('data') });
  t.after(() => fs.rmSync(projectRoot, { recursive: true, force: true }));
  await fs.promises.appendFile(path.join(rootDir, stored.filename), Buffer.from('unexpected'));
  await assert.rejects(() => storage.read(stored.storageRef, {
    maxBytes: 4, expectedSize: 4, expectedSha256: stored.sha256
  }), error => error instanceof EvidenceStorageError && error.code === 'evidence_response_too_large');
});

test('S3 evidence storage signs private object requests and requires full configuration', async () => {
  assert.throws(() => new S3EvidenceStorage({}), error => error instanceof EvidenceStorageError && error.code === 's3_configuration_required');
  assert.equal(isValidSseCustomerKey(Buffer.alloc(32, 0x42).toString('base64')), true);
  assert.equal(isValidSseCustomerKey(Buffer.alloc(31, 0x42).toString('base64')), false);
  assert.equal(isValidSseCustomerKey('not-a-key'), false);
  const requests = [];
  const retainedBodies = new Map();
  const sseCustomerKey = Buffer.alloc(32, 0x42);
  const storage = new S3EvidenceStorage({
    endpoint: 'https://s3.eu-central-1.example.test',
    bucket: 'contractor-private',
    region: 'eu-central-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    sseCustomerKey: sseCustomerKey.toString('base64'),
    fetchFn: async (url, options) => {
      requests.push({ url: String(url), options });
      const target = String(url);
      if (options.method === 'PUT') retainedBodies.set(target, Buffer.from(options.body));
      if (options.method === 'GET' && new URL(target).searchParams.has('versions')) {
        return new Response('<ListVersionsResult><IsTruncated>false</IsTruncated></ListVersionsResult>', { status: 200 });
      }
      if (options.method === 'DELETE') {
        const objectUrl = new URL(target);
        objectUrl.search = '';
        retainedBodies.delete(objectUrl.toString());
      }
      return new Response(options.method === 'GET' ? retainedBodies.get(target) : null, { status: 200 });
    }
  });
  const stored = await storage.store({ originalName: 'site proof.jpg', mimeType: 'image/jpeg', size: 4, buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]) });
  assert.match(stored.storageRef, /^s3:\/\/contractor-private\/contractor-ai\/evidence\//);
  assert.equal(stored.sha256, crypto.createHash('sha256').update(Buffer.from([0xff, 0xd8, 0xff, 0xe0])).digest('hex'));
  assert.match(requests[0].url, /contractor-private\/contractor-ai\/evidence\//);
  assert.match(requests[0].options.headers.authorization, /^AWS4-HMAC-SHA256 Credential=test-access\//);
  for (const request of requests.filter(item => item.options.method === 'PUT' || (item.options.method === 'GET' && !new URL(item.url).searchParams.has('versions')))) {
    assert.equal(request.options.headers['x-amz-server-side-encryption-customer-algorithm'], 'AES256');
    assert.equal(request.options.headers['x-amz-server-side-encryption-customer-key'], sseCustomerKey.toString('base64'));
    assert.equal(request.options.headers['x-amz-server-side-encryption-customer-key-md5'], crypto.createHash('md5').update(sseCustomerKey).digest('base64'));
    assert.equal(request.options.headers.authorization, expectedS3Authorization(new URL(request.url), request.options.headers, {
      accessKeyId: 'test-access', secretAccessKey: 'test-secret', method: request.options.method
    }));
  }
  assert.deepEqual(await storage.read(stored.storageRef), Buffer.from([0xff, 0xd8, 0xff, 0xe0]));

  const verification = await storage.verify();
  assert.equal(verification.ready, true);
  assert.equal(verification.mode, 's3');
  assert.deepEqual(requests.slice(-4).map(request => request.options.method), ['PUT', 'GET', 'GET', 'DELETE']);
  assert.match(requests.at(-1).url, /\/contractor-ai\/evidence\/.readiness-[a-f0-9]{24}$/);
  assert.equal(retainedBodies.has(requests.at(-1).url), false);
  assert.equal(await storage.remove(stored.storageRef), true);
  assert.equal(requests.at(-1).options.method, 'DELETE');
  const versionListing = requests.find(item => new URL(item.url).searchParams.has('versions'));
  assert.equal(versionListing.options.headers['x-amz-server-side-encryption-customer-key'], undefined);
});

test('S3 cleanup deletes every exact-key version and delete marker across listing pages', async () => {
  const requests = [];
  const pages = [
    `<ListVersionsResult>
      <Version><Key>contractor-ai/evidence/uploads/orphan.jpg</Key><VersionId>v1</VersionId></Version>
      <Version><Key>contractor-ai/evidence/uploads/orphan.jpg-suffix</Key><VersionId>unrelated</VersionId></Version>
      <IsTruncated>true</IsTruncated><NextKeyMarker>contractor-ai/evidence/uploads/orphan.jpg</NextKeyMarker><NextVersionIdMarker>v1</NextVersionIdMarker>
    </ListVersionsResult>`,
    `<ListVersionsResult>
      <DeleteMarker><Key>contractor-ai/evidence/uploads/orphan.jpg</Key><VersionId>marker-2</VersionId></DeleteMarker>
      <Version><Key>contractor-ai/evidence/uploads/orphan.jpg</Key><VersionId>v3</VersionId></Version>
      <IsTruncated>false</IsTruncated>
    </ListVersionsResult>`
  ];
  const storage = new S3EvidenceStorage({
    endpoint: 'https://s3.eu-central-1.example.test',
    bucket: 'contractor-private',
    region: 'eu-central-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    fetchFn: async (url, options) => {
      const parsed = new URL(String(url));
      requests.push({ url: parsed, options });
      if (options.method === 'GET' && parsed.searchParams.has('versions')) {
        const index = parsed.searchParams.has('version-id-marker') ? 1 : 0;
        return new Response(pages[index], { status: 200 });
      }
      return new Response(null, { status: 200 });
    }
  });

  assert.equal(await storage.remove('s3://contractor-private/contractor-ai/evidence/uploads/orphan.jpg'), true);
  const listing = requests.filter(request => request.options.method === 'GET');
  assert.equal(listing.length, 2);
  assert.equal(listing[0].url.searchParams.get('prefix'), 'contractor-ai/evidence/uploads/orphan.jpg');
  assert.equal(listing[0].options.headers.authorization, expectedS3Authorization(listing[0].url,
    listing[0].options.headers, { accessKeyId: 'test-access', secretAccessKey: 'test-secret' }));
  const deletions = requests.filter(request => request.options.method === 'DELETE');
  assert.deepEqual(deletions.map(request => request.url.searchParams.get('versionId')), ['v1', 'marker-2', 'v3']);
  assert.ok(deletions.every(request => request.url.pathname.endsWith('/contractor-ai/evidence/uploads/orphan.jpg')));
});

test('S3 cleanup fails closed on incomplete listings or version delete errors', async () => {
  const options = {
    endpoint: 'https://s3.eu-central-1.example.test',
    bucket: 'contractor-private',
    region: 'eu-central-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret'
  };
  const storageRef = 's3://contractor-private/contractor-ai/evidence/uploads/orphan.jpg';
  const incompleteRequests = [];
  const incomplete = new S3EvidenceStorage({
    ...options,
    fetchFn: async (url, request) => {
      incompleteRequests.push({ url: String(url), method: request.method });
      return new Response('<ListVersionsResult><IsTruncated>true</IsTruncated></ListVersionsResult>', { status: 200 });
    }
  });
  await assert.rejects(() => incomplete.remove(storageRef), error => error.code === 'object_storage_version_listing_incomplete');
  assert.ok(incompleteRequests.every(request => request.method === 'GET'));

  const failingDelete = new S3EvidenceStorage({
    ...options,
    fetchFn: async (_url, request) => {
      if (request.method === 'GET') {
        return new Response('<ListVersionsResult><Version><Key>contractor-ai/evidence/uploads/orphan.jpg</Key><VersionId>locked</VersionId></Version><IsTruncated>false</IsTruncated></ListVersionsResult>', { status: 200 });
      }
      return new Response(null, { status: 403 });
    }
  });
  await assert.rejects(() => failingDelete.remove(storageRef), error => error.code === 'object_storage_request_failed');
});

test('S3 upload is not accepted until bounded read-after-write bytes match exactly', async () => {
  const expected = Buffer.from('private-evidence-payload');
  for (const [retained, expectedCode] of [
    [Buffer.alloc(0), 'evidence_retention_unverified'],
    [Buffer.from('different-evidence'), 'evidence_retention_unverified'],
    [Buffer.from('private-evidence-payload-extra'), 'evidence_response_too_large']
  ]) {
    const storage = new S3EvidenceStorage({
      endpoint: 'https://s3.eu-central-1.example.test',
      bucket: 'contractor-private',
      region: 'eu-central-1',
      accessKeyId: 'test-access',
      secretAccessKey: 'test-secret',
      fetchFn: async (_url, options) => new Response(options.method === 'GET' ? retained : null, { status: 200 })
    });
    await assert.rejects(
      () => storage.store({ originalName: 'proof.bin', mimeType: 'application/octet-stream', size: expected.length, buffer: expected }),
      error => error instanceof EvidenceStorageError && error.code === expectedCode
    );
  }
});

test('S3 exact idempotent retry reuses a delayed but eventually retained object', async () => {
  const expected = Buffer.from('retryable-site-evidence');
  const retained = new Map();
  const requests = [];
  let delayedRead = true;
  const storage = new S3EvidenceStorage({
    endpoint: 'https://s3.eu-central-1.example.test',
    bucket: 'contractor-private',
    region: 'eu-central-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    fetchFn: async (url, options) => {
      const target = String(url);
      requests.push({ target, method: options.method });
      if (options.method === 'PUT') retained.set(target, Buffer.from(options.body));
      if (options.method === 'GET' && delayedRead && retained.has(target)) {
        delayedRead = false;
        return new Response(null, { status: 404 });
      }
      if (options.method === 'GET' && retained.has(target)) return new Response(retained.get(target), { status: 200 });
      if (options.method === 'GET') return new Response(null, { status: 404 });
      return new Response(null, { status: 200 });
    }
  });
  const input = { originalName: 'retry.jpg', mimeType: 'image/jpeg', size: expected.length, buffer: expected };
  await assert.rejects(() => storage.store(input, { operationId: 'stable-request-identity' }),
    error => error instanceof EvidenceStorageError && error.code === 'evidence_retention_unverified');
  const retried = await storage.store(input, { operationId: 'stable-request-identity' });

  assert.equal(retried.reused, true);
  assert.deepEqual(await storage.read(retried.storageRef), expected);
  assert.equal(requests.filter(request => request.method === 'PUT').length, 1);
  assert.equal(new Set(requests.filter(request => request.method !== 'DELETE').map(request => request.target)).size, 1);
});

test('S3 read-after-write rejects oversized provider responses before buffering them', async () => {
  const storage = new S3EvidenceStorage({
    endpoint: 'https://s3.eu-central-1.example.test',
    bucket: 'contractor-private',
    region: 'eu-central-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    maxReadBytes: 8,
    fetchFn: async (_url, options) => options.method === 'GET'
      ? new Response('012345678', { status: 200 })
      : new Response(null, { status: 200 })
  });
  await assert.rejects(
    () => storage.store({ originalName: 'proof.bin', mimeType: 'application/octet-stream', size: 4, buffer: Buffer.from('data') }),
    error => error instanceof EvidenceStorageError && error.code === 'evidence_response_too_large'
  );
});

test('S3 evidence reads validate declared size and abort chunked overruns incrementally', async () => {
  const payload = Buffer.from('good');
  const digest = crypto.createHash('sha256').update(payload).digest('hex');
  const verified = new S3EvidenceStorage({
    endpoint: 'https://s3.eu-central-1.example.test',
    bucket: 'contractor-private',
    region: 'eu-central-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    fetchFn: async () => new Response(payload)
  });
  assert.deepEqual(await verified.read('s3://contractor-private/contractor-ai/evidence/proof.jpg', {
    maxBytes: 16, expectedSize: payload.length, expectedSha256: digest
  }), payload);
  await assert.rejects(() => verified.read('s3://contractor-private/contractor-ai/evidence/proof.jpg', {
    maxBytes: 16, expectedSize: payload.length, expectedSha256: '0'.repeat(64)
  }), error => error instanceof EvidenceStorageError && error.code === 'evidence_integrity_failed');

  let declaredBodyReads = 0;
  const declaredMismatch = new S3EvidenceStorage({
    endpoint: 'https://s3.eu-central-1.example.test',
    bucket: 'contractor-private',
    region: 'eu-central-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    fetchFn: async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-length': '3' }),
      body: new ReadableStream({ pull(controller) { declaredBodyReads += 1; controller.enqueue(payload); controller.close(); } }, { highWaterMark: 0 })
    })
  });
  await assert.rejects(() => declaredMismatch.read('s3://contractor-private/contractor-ai/evidence/proof.jpg', {
    maxBytes: 16, expectedSize: payload.length, expectedSha256: digest
  }), error => error instanceof EvidenceStorageError && error.code === 'evidence_integrity_failed');
  assert.equal(declaredBodyReads, 0, 'A false declared length must be rejected before the body is read.');

  let cancelled = false;
  const chunkedOverrun = new S3EvidenceStorage({
    endpoint: 'https://s3.eu-central-1.example.test',
    bucket: 'contractor-private',
    region: 'eu-central-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    fetchFn: async () => new Response(new ReadableStream({
      start(controller) { controller.enqueue(Buffer.from('1234')); controller.enqueue(Buffer.from('5678')); },
      cancel() { cancelled = true; }
    }))
  });
  await assert.rejects(() => chunkedOverrun.read('s3://contractor-private/contractor-ai/evidence/proof.jpg', {
    maxBytes: 16, expectedSize: 4
  }), error => error instanceof EvidenceStorageError && error.code === 'evidence_response_too_large');
  assert.equal(cancelled, true, 'An oversized chunked response must cancel its stream.');
});

test('S3 evidence read aborts a stalled body at the configured timeout', async () => {
  const storage = new S3EvidenceStorage({
    endpoint: 'https://s3.eu-central-1.example.test',
    bucket: 'contractor-private',
    region: 'eu-central-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    timeoutMs: 500,
    fetchFn: async (_url, options) => {
      let streamController;
      const body = new ReadableStream({ start(controller) { streamController = controller; } });
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        streamController.error(error);
      }, { once: true });
      return { ok: true, status: 200, headers: new Headers(), body };
    }
  });
  await assert.rejects(() => storage.read('s3://contractor-private/contractor-ai/evidence/proof.jpg', { maxBytes: 8 }),
    error => error instanceof EvidenceStorageError && error.code === 'object_storage_timeout');
});

test('S3 readiness rejects an oversized marker response and still attempts cleanup', async () => {
  const methods = [];
  const storage = new S3EvidenceStorage({
    endpoint: 'https://s3.eu-central-1.example.test',
    bucket: 'contractor-private',
    region: 'eu-central-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    fetchFn: async (_url, options) => {
      methods.push(options.method);
      if (options.method === 'GET') return new Response('x'.repeat(256));
      return new Response(null, { status: 200 });
    }
  });
  await assert.rejects(() => storage.verify(), error => error instanceof EvidenceStorageError && error.code === 'evidence_response_too_large');
  assert.deepEqual(methods, ['PUT', 'GET', 'GET']);
});

test('S3 exact retry does not create another object version', async () => {
  const expected = Buffer.from('versioned-object-bytes');
  const retained = new Map();
  const requests = [];
  let versionCount = 0;
  const storage = new S3EvidenceStorage({
    endpoint: 'https://s3.eu-central-1.example.test',
    bucket: 'contractor-private',
    region: 'eu-central-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    fetchFn: async (url, options) => {
      const target = String(url);
      requests.push(options.method);
      if (options.method === 'PUT') {
        versionCount += 1;
        retained.set(target, Buffer.from(options.body));
        return new Response(null, { status: 200, headers: { 'x-amz-version-id': `version-${versionCount}` } });
      }
      if (options.method === 'GET') return new Response(retained.get(target) || null, { status: retained.has(target) ? 200 : 404 });
      return new Response(null, { status: 200 });
    }
  });
  const input = { originalName: 'versioned.pdf', mimeType: 'application/pdf', size: expected.length, buffer: expected };
  const first = await storage.store(input, { operationId: 'same-versioned-request' });
  const replay = await storage.store(input, { operationId: 'same-versioned-request' });
  assert.equal(first.reused, false);
  assert.equal(replay.reused, true);
  assert.equal(versionCount, 1);
  assert.equal(requests.filter(method => method === 'PUT').length, 1);
});

test('S3 evidence references remain inside the configured private prefix', async () => {
  const requests = [];
  const storage = new S3EvidenceStorage({
    endpoint: 'https://s3.eu-central-1.example.test/provider-root',
    bucket: 'contractor-private',
    region: 'eu-central-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    prefix: '/tenant-a/contractor-evidence/',
    fetchFn: async (url, options) => {
      requests.push({ url: String(url), options });
      return new Response(options.method === 'GET' ? 'retained' : null, { status: 200 });
    }
  });

  const validReference = 's3://contractor-private/tenant-a/contractor-evidence/2026-07/site-proof.jpg';
  assert.deepEqual(await storage.read(validReference), Buffer.from('retained'));
  assert.match(requests[0].url, /\/provider-root\/contractor-private\/tenant-a\/contractor-evidence\/2026-07\/site-proof.jpg$/);

  const invalidReferences = [
    's3://contractor-private/tenant-b/contractor-evidence/site-proof.jpg',
    's3://contractor-private/tenant-a/other/site-proof.jpg',
    's3://contractor-private/tenant-a/contractor-evidence/../private-payroll.csv',
    's3://different-bucket/tenant-a/contractor-evidence/site-proof.jpg'
  ];
  for (const reference of invalidReferences) {
    await assert.rejects(
      () => storage.read(reference),
      error => error instanceof EvidenceStorageError && error.code === 'invalid_storage_reference'
    );
  }
  assert.equal(requests.length, 1);
});

test('S3 configuration rejects ambiguous endpoints, buckets, and object prefixes', () => {
  const options = {
    endpoint: 'https://s3.eu-central-1.example.test',
    bucket: 'contractor-private',
    region: 'eu-central-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret',
    fetchFn: async () => new Response(null, { status: 200 })
  };
  for (const endpoint of [
    'ftp://s3.example.test',
    'https://user:secret@s3.example.test',
    'https://s3.example.test?tenant=contractor',
    'not-a-url'
  ]) {
    assert.throws(
      () => new S3EvidenceStorage({ ...options, endpoint }),
      error => error instanceof EvidenceStorageError && error.code === 'invalid_s3_endpoint'
    );
  }
  assert.throws(
    () => new S3EvidenceStorage({ ...options, bucket: 'contractor/private' }),
    error => error instanceof EvidenceStorageError && error.code === 'invalid_s3_bucket'
  );
  assert.throws(
    () => new S3EvidenceStorage({ ...options, prefix: 'contractor-ai/../private' }),
    error => error instanceof EvidenceStorageError && error.code === 'invalid_s3_prefix'
  );
});

test('S3 readiness fails closed on provider, network, timeout, and read-back errors', async () => {
  const baseOptions = {
    endpoint: 'https://s3.eu-central-1.example.test',
    bucket: 'contractor-private',
    region: 'eu-central-1',
    accessKeyId: 'test-access',
    secretAccessKey: 'test-secret'
  };

  const rejected = new S3EvidenceStorage({
    ...baseOptions,
    fetchFn: async () => new Response(null, { status: 403 })
  });
  await assert.rejects(() => rejected.verify(), error => error instanceof EvidenceStorageError && error.code === 'object_storage_request_failed');

  const unreachable = new S3EvidenceStorage({
    ...baseOptions,
    fetchFn: async () => { throw new TypeError('network unavailable'); }
  });
  await assert.rejects(() => unreachable.verify(), error => error instanceof EvidenceStorageError && error.code === 'object_storage_unavailable');

  const timedOut = new S3EvidenceStorage({
    ...baseOptions,
    timeoutMs: 500,
    fetchFn: async (url, options) => new Promise((resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    })
  });
  await assert.rejects(() => timedOut.verify(), error => error instanceof EvidenceStorageError && error.code === 'object_storage_timeout');

  const mismatched = new S3EvidenceStorage({
    ...baseOptions,
    fetchFn: async (url, options) => new Response(options.method === 'GET' ? 'wrong-marker' : null, { status: 200 })
  });
  await assert.rejects(() => mismatched.verify(), error => error instanceof EvidenceStorageError && error.code === 'object_storage_verification_failed');

  const cleanupRejected = new S3EvidenceStorage({
    ...baseOptions,
    fetchFn: async (url, options) => {
      if (options.method === 'DELETE') return new Response(null, { status: 403 });
      return new Response(options.method === 'GET' ? 'contractor-ai-storage-readiness/v1' : null, { status: 200 });
    }
  });
  await assert.rejects(() => cleanupRejected.verify(), error => error instanceof EvidenceStorageError && error.code === 'object_storage_cleanup_failed');
});
