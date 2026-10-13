const MAX_SUBMITTAL_PDF_BYTES = 8 * 1024 * 1024;

function attachmentDigest(document) {
  return String(document?.data?.analysis?.upload?.sha256
    || document?.data?.sourceDocumentChecksum
    || document?.data?.contentHash
    || '').toLowerCase();
}

function submittalAttachmentManifest(documents = [], jobId, attachmentIds = []) {
  const requestedIds = [...new Set((Array.isArray(attachmentIds) ? attachmentIds : []).map(String))].sort();
  const byId = new Map(documents.filter(document => document.jobId === jobId).map(document => [document.id, document]));
  return requestedIds.flatMap(id => {
    const document = byId.get(id);
    const sha256 = attachmentDigest(document);
    if (!document || document.mimeType !== 'application/pdf' || !document.storageRef
      || !Number.isSafeInteger(document.sizeBytes) || document.sizeBytes < 1 || document.sizeBytes > MAX_SUBMITTAL_PDF_BYTES
      || !/^[a-f0-9]{64}$/.test(sha256)
      || ['cancelled', 'rejected', 'superseded', 'void'].includes(String(document.status || '').toLowerCase())) return [];
    return [{
      id: document.id,
      filename: document.filename || 'submittal.pdf',
      mimeType: document.mimeType,
      sizeBytes: document.sizeBytes,
      sha256
    }];
  });
}

function normalizeSubmittalAttachmentManifest(value) {
  if (!Array.isArray(value)) return null;
  return value.map(item => ({
    id: String(item?.id || ''),
    filename: String(item?.filename || ''),
    mimeType: String(item?.mimeType || ''),
    sizeBytes: Number(item?.sizeBytes),
    sha256: String(item?.sha256 || '').toLowerCase()
  })).sort((left, right) => left.id.localeCompare(right.id));
}

module.exports = { MAX_SUBMITTAL_PDF_BYTES, attachmentDigest, normalizeSubmittalAttachmentManifest, submittalAttachmentManifest };
