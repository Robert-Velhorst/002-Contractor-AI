const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('node:stream');

const STORAGE_READINESS_PAYLOAD = Buffer.from('contractor-ai-storage-readiness/v1', 'utf8');

class EvidenceStorageError extends Error {
  constructor(code, message, statusCode = 503) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

function safeStorageName(originalName, operationId = null) {
  const extension = path.extname(String(originalName || '')).slice(0, 20);
  const stem = path.basename(String(originalName || 'evidence'), extension)
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'evidence';
  if (operationId) {
    const stableId = crypto.createHash('sha256').update(String(operationId)).digest('hex').slice(0, 32);
    return `${stableId}-${stem}${extension}`;
  }
  return `${Date.now()}-${crypto.randomBytes(8).toString('hex')}-${stem}${extension}`;
}

function encodeS3Path(value) {
  return String(value || '').split('/').map(segment => encodeURIComponent(segment)).join('/');
}

function hasUnsafeS3Characters(value) {
  return [...String(value || '')].some(character => {
    const code = character.charCodeAt(0);
    return character === '\\' || code < 32 || code === 127;
  });
}

function normalizeS3Prefix(value) {
  const prefix = String(value || '').replace(/^\/+|\/+$/g, '');
  const segments = prefix.split('/');
  if (!prefix || segments.some(segment => !segment || segment === '.' || segment === '..' || hasUnsafeS3Characters(segment))) {
    throw new EvidenceStorageError('invalid_s3_prefix', 'S3 evidence storage requires a non-empty object prefix without traversal segments.');
  }
  return segments.join('/');
}

function normalizeS3ObjectKey(value) {
  const key = String(value || '');
  const segments = key.split('/');
  if (!key || key.startsWith('/') || segments.some(segment => !segment || segment === '.' || segment === '..' || hasUnsafeS3Characters(segment))) {
    throw new EvidenceStorageError('invalid_storage_reference', 'Evidence object key is outside the configured private prefix.', 404);
  }
  return segments.join('/');
}

function parseS3Endpoint(value) {
  let endpoint;
  try {
    endpoint = new URL(value);
  } catch {
    throw new EvidenceStorageError('invalid_s3_endpoint', 'S3 evidence storage requires a valid HTTP or HTTPS endpoint.');
  }
  if (!['http:', 'https:'].includes(endpoint.protocol)
      || endpoint.username
      || endpoint.password
      || endpoint.search
      || endpoint.hash) {
    throw new EvidenceStorageError('invalid_s3_endpoint', 'S3 evidence storage endpoint must be an HTTP or HTTPS URL without credentials, query parameters, or a fragment.');
  }
  endpoint.pathname = endpoint.pathname.replace(/\/$/, '');
  return endpoint;
}

function hmac(key, value) {
  return crypto.createHmac('sha256', key).update(value, 'utf8').digest();
}

class LocalEvidenceStorage {
  constructor({ rootDir, projectRoot }) {
    this.rootDir = path.resolve(rootDir);
    this.projectRoot = path.resolve(projectRoot);
    fs.mkdirSync(this.rootDir, { recursive: true });
  }

  referenceFor(file, { operationId = null } = {}) {
    const storageName = safeStorageName(file.originalName, operationId);
    const target = path.resolve(this.rootDir, storageName);
    if (!target.startsWith(`${this.rootDir}${path.sep}`)) {
      throw new EvidenceStorageError('invalid_upload_path', 'Evidence storage path could not be resolved safely.', 400);
    }
    return path.relative(this.projectRoot, target).replace(/\\/g, '/');
  }

  async store(file, { operationId = null } = {}) {
    const storageName = safeStorageName(file.originalName, operationId);
    const sha256 = crypto.createHash('sha256').update(file.buffer).digest('hex');
    const target = path.resolve(this.rootDir, storageName);
    if (!target.startsWith(`${this.rootDir}${path.sep}`)) {
      throw new EvidenceStorageError('invalid_upload_path', 'Evidence storage path could not be resolved safely.', 400);
    }
    if (operationId) {
      try {
        const retained = await this.read(this.referenceFor(file, { operationId }), {
          maxBytes: file.buffer.length, expectedSize: file.buffer.length, expectedSha256: sha256
        });
        if (!retained.equals(file.buffer)) throw new EvidenceStorageError('evidence_retention_unverified', 'The existing local evidence does not match the retried upload.');
        return { filename: storageName, storageRef: this.referenceFor(file, { operationId }), size: file.buffer.length,
          mimeType: file.mimeType, sha256, reused: true };
      } catch (error) {
        if (error.code !== 'evidence_not_available' && error.code !== 'ENOENT') throw error;
      }
    }
    const temporary = path.join(this.rootDir, `.${storageName}.${crypto.randomBytes(4).toString('hex')}.tmp`);
    try {
      await fs.promises.writeFile(temporary, file.buffer, { flag: 'wx' });
      await fs.promises.rename(temporary, target);
    } catch (error) {
      await fs.promises.rm(temporary, { force: true }).catch(() => {});
      throw error;
    }
    return {
      filename: storageName,
      storageRef: path.relative(this.projectRoot, target).replace(/\\/g, '/'),
      size: file.size,
      mimeType: file.mimeType,
      sha256,
      reused: false
    };
  }

  async read(storageRef, options = {}) {
    const target = path.resolve(this.projectRoot, String(storageRef || ''));
    if (!target.startsWith(`${this.rootDir}${path.sep}`) || !fs.existsSync(target)) {
      throw new EvidenceStorageError('evidence_not_available', 'The retained evidence file is not available from this runtime.', 404);
    }
    const { maxBytes, expectedSize, expectedSha256 } = normalizeReadOptions(options, 10 * 1024 * 1024);
    const stat = await fs.promises.stat(target);
    assertDeclaredSize(stat.size, maxBytes, expectedSize);
    return readStreamBounded(fs.createReadStream(target), { maxBytes, expectedSize, expectedSha256 });
  }

  async remove(storageRef) {
    const target = path.resolve(this.projectRoot, String(storageRef || ''));
    if (!target.startsWith(`${this.rootDir}${path.sep}`)) {
      throw new EvidenceStorageError('invalid_storage_reference', 'Evidence storage reference does not match the configured private directory.', 404);
    }
    try {
      await fs.promises.unlink(target);
      return true;
    } catch (error) {
      if (error?.code === 'ENOENT') return false;
      throw new EvidenceStorageError('evidence_cleanup_failed', 'The unreferenced evidence file could not be removed.');
    }
  }

  async verify() {
    try {
      await fs.promises.access(this.rootDir, fs.constants.R_OK | fs.constants.W_OK);
      return { ready: true, mode: 'local', checkedAt: new Date().toISOString() };
    } catch {
      throw new EvidenceStorageError('local_storage_unavailable', 'The local evidence directory is not readable and writable.');
    }
  }
}

class S3EvidenceStorage {
  constructor({ endpoint, bucket, region, accessKeyId, secretAccessKey, prefix = 'contractor-ai/evidence', timeoutMs = 5000,
    maxReadBytes = 10 * 1024 * 1024, fetchFn = global.fetch }) {
    if (!endpoint || !bucket || !region || !accessKeyId || !secretAccessKey) {
      throw new EvidenceStorageError('s3_configuration_required', 'S3 evidence storage requires endpoint, bucket, region, access key, and secret key.');
    }
    if (typeof fetchFn !== 'function') {
      throw new EvidenceStorageError('s3_fetch_unavailable', 'S3 evidence storage requires a fetch implementation.');
    }
    this.endpoint = parseS3Endpoint(endpoint);
    this.bucket = String(bucket).trim();
    if (!this.bucket || this.bucket.includes('/') || hasUnsafeS3Characters(this.bucket)) {
      throw new EvidenceStorageError('invalid_s3_bucket', 'S3 evidence storage requires a bucket name without path separators.');
    }
    this.region = region;
    this.accessKeyId = accessKeyId;
    this.secretAccessKey = secretAccessKey;
    this.prefix = normalizeS3Prefix(prefix);
    this.timeoutMs = Math.max(500, Number(timeoutMs) || 5000);
    this.maxReadBytes = Number(maxReadBytes);
    if (!Number.isSafeInteger(this.maxReadBytes) || this.maxReadBytes < 1) {
      throw new EvidenceStorageError('invalid_s3_read_limit', 'S3 evidence storage requires a positive bounded read limit.');
    }
    this.fetch = fetchFn;
  }

  objectKey(storageName) {
    const month = new Date().toISOString().slice(0, 7);
    return `${this.prefix}/${month}/${storageName}`;
  }

  referenceFor(file, { operationId = null } = {}) {
    if (!operationId) return `s3://${this.bucket}/${this.objectKey(safeStorageName(file.originalName))}`;
    const storageName = safeStorageName(file.originalName, operationId);
    return `s3://${this.bucket}/${this.prefix}/uploads/${storageName}`;
  }

  async request(method, key, body = null, contentType = null, {
    maxResponseBytes = this.maxReadBytes, allowMissing = false, expectedSize = null, expectedSha256 = null
  } = {}) {
    const objectKey = normalizeS3ObjectKey(key);
    const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
    const dateStamp = timestamp.slice(0, 8);
    const payload = body ? Buffer.from(body) : Buffer.alloc(0);
    const payloadHash = crypto.createHash('sha256').update(payload).digest('hex');
    const basePath = this.endpoint.pathname.replace(/\/$/, '');
    const canonicalUri = `${basePath}/${encodeURIComponent(this.bucket)}/${encodeS3Path(objectKey)}`;
    const headers = {
      host: this.endpoint.host,
      'x-amz-content-sha256': payloadHash,
      'x-amz-date': timestamp
    };
    if (contentType) headers['content-type'] = contentType;
    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames.map(name => `${name}:${headers[name]}\n`).join('');
    const signedHeaders = signedHeaderNames.join(';');
    const canonicalRequest = [method, canonicalUri, '', canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', timestamp, credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.secretAccessKey}`, dateStamp), this.region), 's3'), 'aws4_request');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
    const url = new URL(this.endpoint.toString());
    url.pathname = canonicalUri;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(url, {
        method,
        headers: {
          ...headers,
          authorization: `AWS4-HMAC-SHA256 Credential=${this.accessKeyId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`
        },
        body: body ? payload : undefined,
        signal: controller.signal
      });
      if (allowMissing && method === 'GET' && response.status === 404) {
        return { response, body: null, missing: true };
      }
      if (!response.ok) {
        throw new EvidenceStorageError('object_storage_request_failed', `Object storage returned ${response.status}.`);
      }
      return {
        response,
        body: method === 'GET' ? await readResponseBounded(response, { maxBytes: maxResponseBytes, expectedSize, expectedSha256 }) : null,
        missing: false
      };
    } catch (error) {
      if (error instanceof EvidenceStorageError) throw error;
      if (error?.name === 'AbortError') {
        throw new EvidenceStorageError('object_storage_timeout', 'Object storage did not respond within the configured timeout.');
      }
      throw new EvidenceStorageError('object_storage_unavailable', 'Object storage could not be reached.');
    } finally {
      clearTimeout(timeout);
    }
  }

  async store(file, { operationId = null } = {}) {
    const payload = Buffer.from(file.buffer || []);
    if (!payload.length || payload.length > this.maxReadBytes) {
      throw new EvidenceStorageError('evidence_size_invalid', 'Evidence upload is empty or exceeds the configured storage read limit.', 413);
    }
    const storageName = safeStorageName(file.originalName, operationId);
    const key = operationId ? `${this.prefix}/uploads/${storageName}` : this.objectKey(storageName);
    const storageRef = `s3://${this.bucket}/${key}`;
    const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
    if (operationId) {
      const existing = await this.request('GET', key, null, null, { maxResponseBytes: payload.length, allowMissing: true });
      if (!existing.missing) {
        assertRetainedObject(existing.body, payload, sha256);
        return {
          filename: storageName,
          storageRef,
          size: payload.length,
          mimeType: file.mimeType,
          sha256,
          reused: true
        };
      }
    }
    await this.request('PUT', key, payload, file.mimeType || 'application/octet-stream');
    const retained = await this.request('GET', key, null, null, { maxResponseBytes: payload.length, allowMissing: true });
    if (retained.missing) {
      throw new EvidenceStorageError('evidence_retention_unverified', 'Object storage acknowledged the upload but the retained evidence is not yet readable.');
    }
    assertRetainedObject(retained.body, payload, sha256);
    return {
      filename: storageName,
      storageRef,
      size: payload.length,
      mimeType: file.mimeType,
      sha256,
      reused: false
    };
  }

  async read(storageRef, options = {}) {
    const limits = normalizeReadOptions(options, this.maxReadBytes);
    const result = await this.request('GET', this.keyFromStorageRef(storageRef), null, null, {
      maxResponseBytes: limits.maxBytes,
      expectedSize: limits.expectedSize,
      expectedSha256: limits.expectedSha256
    });
    return result.body;
  }

  async remove(storageRef) {
    await this.request('DELETE', this.keyFromStorageRef(storageRef));
    return true;
  }

  keyFromStorageRef(storageRef) {
    const expectedPrefix = `s3://${this.bucket}/${this.prefix}/`;
    const reference = String(storageRef || '');
    if (!reference.startsWith(expectedPrefix)) {
      throw new EvidenceStorageError('invalid_storage_reference', 'Evidence storage reference does not match the configured private object prefix.', 404);
    }
    const key = normalizeS3ObjectKey(reference.slice(`s3://${this.bucket}/`.length));
    if (!key.startsWith(`${this.prefix}/`)) {
      throw new EvidenceStorageError('invalid_storage_reference', 'Evidence object key is outside the configured private prefix.', 404);
    }
    return key;
  }

  async verify() {
    const key = `${this.prefix}/.readiness-${crypto.randomBytes(12).toString('hex')}`;
    let verificationError = null;
    try {
      await this.request('PUT', key, STORAGE_READINESS_PAYLOAD, 'application/octet-stream');
      const result = await this.request('GET', key, null, null, { maxResponseBytes: STORAGE_READINESS_PAYLOAD.length });
      if (!result.body?.equals(STORAGE_READINESS_PAYLOAD)) {
        throw new EvidenceStorageError('object_storage_verification_failed', 'Object storage did not return the readiness marker that was written.');
      }
    } catch (error) {
      verificationError = error;
    }
    try {
      await this.request('DELETE', key);
    } catch {
      if (!verificationError) {
        throw new EvidenceStorageError('object_storage_cleanup_failed', 'Object storage could not remove its readiness marker.');
      }
    }
    if (verificationError) {
      throw verificationError;
    }
    return { ready: true, mode: 's3', checkedAt: new Date().toISOString() };
  }
}

function normalizeReadOptions(options, defaultMaxBytes) {
  const maxBytes = options.maxBytes === undefined ? defaultMaxBytes : Number(options.maxBytes);
  const expectedSize = options.expectedSize === undefined || options.expectedSize === null
    ? null : Number(options.expectedSize);
  const expectedSha256 = options.expectedSha256 ? String(options.expectedSha256).trim().toLowerCase() : null;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
    throw new EvidenceStorageError('invalid_storage_read_limit', 'Evidence read requires valid bounded size and checksum constraints.');
  }
  if (expectedSize !== null && (!Number.isSafeInteger(expectedSize) || expectedSize < 0)) {
    throw new EvidenceStorageError('evidence_integrity_failed', 'Evidence ledger size metadata is invalid.', 409);
  }
  if (expectedSize !== null && expectedSize > maxBytes) {
    throw new EvidenceStorageError('evidence_response_too_large', 'Evidence ledger size exceeds the permitted download boundary.', 413);
  }
  if (expectedSha256 && !/^[a-f0-9]{64}$/.test(expectedSha256)) {
    throw new EvidenceStorageError('evidence_integrity_failed', 'Evidence ledger checksum metadata is invalid.', 409);
  }
  return { maxBytes, expectedSize, expectedSha256 };
}

function assertDeclaredSize(size, maxBytes, expectedSize) {
  if (size > maxBytes || (expectedSize !== null && size !== expectedSize)) {
    throw new EvidenceStorageError(size > maxBytes ? 'evidence_response_too_large' : 'evidence_integrity_failed',
      'Retained evidence size does not match the bounded ledger record.', size > maxBytes ? 413 : 409);
  }
}

async function readResponseBounded(response, limits) {
  const declaredLength = response.headers?.get('content-length');
  if (declaredLength && /^\d+$/.test(declaredLength)) {
    const size = Number(declaredLength);
    assertDeclaredSize(size, limits.maxBytes, limits.expectedSize);
  }
  return readStreamBounded(response.body || Readable.from([]), limits);
}

async function readStreamBounded(stream, { maxBytes, expectedSize, expectedSha256 }) {
  const chunks = [];
  const hash = crypto.createHash('sha256');
  let size = 0;
  for await (const value of stream) {
    const chunk = Buffer.from(value);
    size += chunk.length;
    if (size > maxBytes || (expectedSize !== null && size > expectedSize)) {
      stream.destroy?.();
      throw new EvidenceStorageError('evidence_response_too_large', 'Evidence provider returned more bytes than the verified upload allows.', 413);
    }
    chunks.push(chunk);
    hash.update(chunk);
  }
  if (expectedSize !== null && size !== expectedSize) {
    throw new EvidenceStorageError('evidence_integrity_failed', 'Evidence byte count does not match the retained ledger record.', 409);
  }
  if (expectedSha256 && hash.digest('hex') !== expectedSha256) {
    throw new EvidenceStorageError('evidence_integrity_failed', 'Evidence checksum does not match the retained ledger record.', 409);
  }
  return Buffer.concat(chunks, size);
}

function assertRetainedObject(actual, expected, expectedSha256) {
  if (!actual || actual.length !== expected.length
      || crypto.createHash('sha256').update(actual).digest('hex') !== expectedSha256) {
    throw new EvidenceStorageError('evidence_retention_unverified', 'Object storage did not retain the exact evidence bytes that were uploaded.');
  }
}

function createEvidenceStorage({ mode, rootDir, projectRoot, s3 = {} }) {
  if (mode === 'local') return new LocalEvidenceStorage({ rootDir, projectRoot });
  if (mode === 's3') return new S3EvidenceStorage(s3);
  throw new EvidenceStorageError('invalid_storage_mode', 'Evidence storage mode must be local or s3.');
}

module.exports = {
  EvidenceStorageError,
  LocalEvidenceStorage,
  S3EvidenceStorage,
  createEvidenceStorage,
  normalizeS3ObjectKey,
  normalizeS3Prefix,
  parseS3Endpoint
};
