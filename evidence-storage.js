const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { Readable } = require('node:stream');
const { SaxesParser } = require('saxes');

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

function encodeS3Query(query = {}) {
  const encode = value => encodeURIComponent(String(value)).replace(/[!'()*]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
  return Object.entries(query)
    .filter(([, value]) => value !== undefined && value !== null)
    .map(([name, value]) => [encode(name), encode(value)])
    .sort(([leftName, leftValue], [rightName, rightValue]) => {
      const nameOrder = leftName < rightName ? -1 : leftName > rightName ? 1 : 0;
      return nameOrder || (leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0);
    })
    .map(([name, value]) => `${name}=${value}`)
    .join('&');
}

function makeS3StorageRef(bucket, key, versionId = null) {
  const reference = `s3://${bucket}/${key}`;
  return versionId === null || versionId === undefined
    ? reference
    : `${reference}?versionId=${encodeURIComponent(String(versionId))}`;
}

function parseS3VersionPage(xml) {
  const parser = new SaxesParser({ xmlns: false });
  const stack = [];
  const versions = [];
  const fields = new Map();
  let current = null;
  let rootSeen = false;
  const pageFields = new Set(['IsTruncated', 'NextKeyMarker', 'NextVersionIdMarker']);
  const entryFields = new Map([['Key', 'key'], ['VersionId', 'versionId']]);
  const invalid = () => new EvidenceStorageError('object_storage_version_listing_invalid',
    'Object storage did not return a complete, unambiguous version listing; cleanup was not completed.');

  parser.on('opentag', node => {
    stack.push(node.name);
    if (stack.length === 1) {
      if (node.name !== 'ListVersionsResult') throw invalid();
      rootSeen = true;
    }
    if (node.name === 'Version' || node.name === 'DeleteMarker') {
      if (stack.length !== 2 || current) throw invalid();
      current = { key: null, versionId: null };
    }
    if (pageFields.has(node.name)) {
      if (stack.length !== 2 || fields.has(node.name)) throw invalid();
      fields.set(node.name, '');
    }
    if (entryFields.has(node.name)) {
      const field = entryFields.get(node.name);
      if (stack.length !== 3 || !current || current[field] !== null) throw invalid();
      current[field] = '';
    }
    if (pageFields.has(stack.at(-2)) || entryFields.has(stack.at(-2))) {
      throw invalid();
    }
  });
  const text = value => {
    const name = stack.at(-1);
    if (current && stack.length === 3 && entryFields.has(name)) {
      current[entryFields.get(name)] += value;
    } else if (stack.length === 2 && pageFields.has(name)) {
      fields.set(name, fields.get(name) + value);
    }
  };
  parser.on('text', text);
  parser.on('cdata', text);
  parser.on('doctype', () => { throw invalid(); });
  parser.on('closetag', node => {
    const name = node.name;
    if ((name === 'Version' || name === 'DeleteMarker') && stack.length === 2) {
      if (!current?.key || !current.versionId) throw invalid();
      versions.push(current);
      current = null;
    }
    stack.pop();
  });
  try {
    parser.write(Buffer.isBuffer(xml) ? xml.toString('utf8') : String(xml)).close();
  } catch {
    throw invalid();
  }
  const truncated = fields.get('IsTruncated')?.trim();
  if (!rootSeen || !['true', 'false'].includes(truncated)) throw invalid();
  return {
    versions,
    isTruncated: truncated === 'true',
    nextKeyMarker: fields.get('NextKeyMarker') || null,
    nextVersionIdMarker: fields.get('NextVersionIdMarker') || null
  };
}

function decodeSseCustomerKey(value) {
  if (value === undefined || value === null || value === '') return null;
  const encoded = String(value).trim();
  const key = Buffer.from(encoded, 'base64');
  if (key.length !== 32 || key.toString('base64') !== encoded) {
    throw new EvidenceStorageError('invalid_s3_sse_c_key', 'S3 SSE-C requires a canonical base64-encoded 32-byte key.');
  }
  return key;
}

function isValidSseCustomerKey(value) {
  try {
    return Boolean(decodeSseCustomerKey(value));
  } catch {
    return false;
  }
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
    maxReadBytes = 10 * 1024 * 1024, sseCustomerKey = null, fetchFn = global.fetch }) {
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
    this.sseCustomerKey = decodeSseCustomerKey(sseCustomerKey);
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
    maxResponseBytes = this.maxReadBytes, allowMissing = false, expectedSize = null, expectedSha256 = null,
    query = null, allowBucketRequest = false
  } = {}) {
    const objectKey = allowBucketRequest && !key ? '' : normalizeS3ObjectKey(key);
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
    if (this.sseCustomerKey && !allowBucketRequest && ['GET', 'PUT'].includes(method)) {
      headers['x-amz-server-side-encryption-customer-algorithm'] = 'AES256';
      headers['x-amz-server-side-encryption-customer-key'] = this.sseCustomerKey.toString('base64');
      headers['x-amz-server-side-encryption-customer-key-md5'] = crypto.createHash('md5').update(this.sseCustomerKey).digest('base64');
    }
    if (contentType) headers['content-type'] = contentType;
    const signedHeaderNames = Object.keys(headers).sort();
    const canonicalHeaders = signedHeaderNames.map(name => `${name}:${headers[name]}\n`).join('');
    const signedHeaders = signedHeaderNames.join(';');
    const canonicalQuery = encodeS3Query(query || {});
    const canonicalRequest = [method, canonicalUri, canonicalQuery, canonicalHeaders, signedHeaders, payloadHash].join('\n');
    const credentialScope = `${dateStamp}/${this.region}/s3/aws4_request`;
    const stringToSign = ['AWS4-HMAC-SHA256', timestamp, credentialScope, crypto.createHash('sha256').update(canonicalRequest).digest('hex')].join('\n');
    const signingKey = hmac(hmac(hmac(hmac(`AWS4${this.secretAccessKey}`, dateStamp), this.region), 's3'), 'aws4_request');
    const signature = crypto.createHmac('sha256', signingKey).update(stringToSign, 'utf8').digest('hex');
    const url = new URL(this.endpoint.toString());
    url.pathname = canonicalUri;
    url.search = canonicalQuery;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    let response;
    try {
      response = await this.fetch(url, {
        method,
        redirect: 'manual',
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
      if (response?.body && !response.bodyUsed && !response.body.locked) {
        controller.abort();
        try { await response.body.cancel(); } catch { /* The abort may already have closed the provider body. */ }
      }
    }
  }

  async store(file, { operationId = null } = {}) {
    const payload = Buffer.from(file.buffer || []);
    if (!payload.length || payload.length > this.maxReadBytes) {
      throw new EvidenceStorageError('evidence_size_invalid', 'Evidence upload is empty or exceeds the configured storage read limit.', 413);
    }
    const storageName = safeStorageName(file.originalName, operationId);
    const key = operationId ? `${this.prefix}/uploads/${storageName}` : this.objectKey(storageName);
    const sha256 = crypto.createHash('sha256').update(payload).digest('hex');
    if (operationId) {
      const existing = await this.request('GET', key, null, null, { maxResponseBytes: payload.length, allowMissing: true });
      if (!existing.missing) {
        assertRetainedObject(existing.body, payload, sha256);
        const versionId = existing.response.headers?.get?.('x-amz-version-id') || null;
        return {
          filename: storageName,
          storageRef: makeS3StorageRef(this.bucket, key, versionId),
          size: payload.length,
          mimeType: file.mimeType,
          sha256,
          reused: true
        };
      }
    }
    const uploaded = await this.request('PUT', key, payload, file.mimeType || 'application/octet-stream');
    const uploadedVersionId = uploaded.response.headers?.get?.('x-amz-version-id') || null;
    const retained = await this.request('GET', key, null, null, {
      maxResponseBytes: payload.length,
      allowMissing: true,
      query: uploadedVersionId === null ? null : { versionId: uploadedVersionId }
    });
    if (retained.missing) {
      throw new EvidenceStorageError('evidence_retention_unverified', 'Object storage acknowledged the upload but the retained evidence is not yet readable.');
    }
    const retainedVersionId = retained.response.headers?.get?.('x-amz-version-id') || null;
    if (uploadedVersionId !== null && retainedVersionId !== uploadedVersionId) {
      throw new EvidenceStorageError('evidence_retention_unverified', 'Object storage did not return the exact version created by the upload.');
    }
    assertRetainedObject(retained.body, payload, sha256);
    return {
      filename: storageName,
      storageRef: makeS3StorageRef(this.bucket, key, uploadedVersionId ?? retainedVersionId),
      size: payload.length,
      mimeType: file.mimeType,
      sha256,
      reused: false
    };
  }

  async read(storageRef, options = {}) {
    const limits = normalizeReadOptions(options, this.maxReadBytes);
    const key = this.keyFromStorageRef(storageRef);
    const versionId = this.versionFromStorageRef(storageRef);
    const result = await this.request('GET', key, null, null, {
      maxResponseBytes: limits.maxBytes,
      expectedSize: limits.expectedSize,
      expectedSha256: limits.expectedSha256,
      query: versionId === null ? null : { versionId }
    });
    if (versionId !== null && result.response.headers?.get?.('x-amz-version-id') !== versionId) {
      throw new EvidenceStorageError('evidence_integrity_failed', 'Object storage did not return the retained evidence version from its ledger reference.', 409);
    }
    return result.body;
  }

  async remove(storageRef) {
    const key = this.keyFromStorageRef(storageRef);
    const versionId = this.versionFromStorageRef(storageRef);
    if (versionId !== null) {
      await this.request('DELETE', key, null, null, { query: { versionId } });
      return true;
    }
    const versions = [];
    let keyMarker = null;
    let versionIdMarker = null;
    let pages = 0;
    let listingComplete = false;
    while (!listingComplete && pages < 1000) {
      const page = await this.request('GET', '', null, null, {
        allowBucketRequest: true,
        maxResponseBytes: 1024 * 1024,
        query: {
          versions: '',
          prefix: key,
          'max-keys': '100',
          'key-marker': keyMarker,
          'version-id-marker': versionIdMarker
        }
      });
      const parsed = parseS3VersionPage(page.body);
      versions.push(...parsed.versions.filter(version => version.key === key));
      if (versions.length > 1000) {
        throw new EvidenceStorageError('object_storage_version_limit_exceeded', 'The orphan has too many retained object versions for automatic cleanup.');
      }
      pages += 1;
      if (!parsed.isTruncated) {
        listingComplete = true;
        break;
      }
      const nextKeyMarker = parsed.nextKeyMarker || key;
      const nextVersionIdMarker = parsed.nextVersionIdMarker || null;
      if (nextKeyMarker === keyMarker && nextVersionIdMarker === versionIdMarker) {
        throw new EvidenceStorageError('object_storage_version_listing_incomplete', 'Object storage did not return safe version-list pagination markers.');
      }
      keyMarker = nextKeyMarker;
      versionIdMarker = nextVersionIdMarker;
    }
    if (!listingComplete) {
      throw new EvidenceStorageError('object_storage_version_listing_incomplete', 'Object storage returned too many version-list pages for automatic cleanup.');
    }

    if (versions.length) {
      for (const version of versions) {
        if (!version.versionId) {
          throw new EvidenceStorageError('object_storage_version_id_missing', 'Object storage returned a version without an identifier; cleanup was not completed.');
        }
        await this.request('DELETE', key, null, null, { query: { versionId: version.versionId } });
      }
    } else {
      await this.request('DELETE', key);
    }
    return true;
  }

  keyFromStorageRef(storageRef) {
    const expectedPrefix = `s3://${this.bucket}/${this.prefix}/`;
    const reference = String(storageRef || '');
    const queryIndex = reference.indexOf('?');
    const baseReference = queryIndex < 0 ? reference : reference.slice(0, queryIndex);
    if (!baseReference.startsWith(expectedPrefix) || reference.includes('#')) {
      throw new EvidenceStorageError('invalid_storage_reference', 'Evidence storage reference does not match the configured private object prefix.', 404);
    }
    const key = normalizeS3ObjectKey(baseReference.slice(`s3://${this.bucket}/`.length));
    if (!key.startsWith(`${this.prefix}/`)) {
      throw new EvidenceStorageError('invalid_storage_reference', 'Evidence object key is outside the configured private prefix.', 404);
    }
    return key;
  }

  versionFromStorageRef(storageRef) {
    const reference = String(storageRef || '');
    const queryIndex = reference.indexOf('?');
    if (queryIndex < 0) return null;
    const query = reference.slice(queryIndex + 1);
    const parameters = new URLSearchParams(query);
    const versions = parameters.getAll('versionId');
    if (parameters.size !== 1 || versions.length !== 1 || !versions[0]) {
      throw new EvidenceStorageError('invalid_storage_reference', 'Evidence storage reference contains invalid object-version metadata.', 404);
    }
    return versions[0];
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
      await this.remove(`s3://${this.bucket}/${key}`);
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

function s3SigningRegion(region, runtimeMode) {
  // Keep existing local S3/AWS configurations compatible. Hosted mode requires
  // an explicit region and must never silently select a provider's region.
  return region || (runtimeMode === 'hosted' ? '' : 'eu-central-1');
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
  isValidSseCustomerKey,
  s3SigningRegion,
  normalizeS3ObjectKey,
  normalizeS3Prefix,
  parseS3Endpoint
};
