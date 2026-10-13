export function bytesToBase64(bytes) {
  const parts = [];
  for (let i = 0; i < bytes.length; i += 32768) parts.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
  return btoa(parts.join(''));
}
export function base64ToBytes(value) { return Uint8Array.from(atob(value), char => char.charCodeAt(0)); }

async function downloadVerifiedPdf(pack, file, route, subject, fetchImpl) {
  const document = subject === 'Submittal' ? `${subject} document` : subject;
  if (!file || file.mimeType !== 'application/pdf' || !Number.isSafeInteger(file.sizeBytes) || file.sizeBytes < 1
    || file.sizeBytes > 8 * 1024 * 1024 || !/^[a-f0-9]{64}$/.test(file.sha256 || '')) {
    throw new Error(`${document} requires a verified PDF within the 8 MB limit.`);
  }
  const response = await fetchImpl(`/api/ledger/jobs/${encodeURIComponent(pack.job.id)}/work-pack/${route}/content?sourceHash=${encodeURIComponent(pack.sourceHash)}`, {
    signal: AbortSignal.timeout(30000), redirect: 'error'
  });
  if (!response.ok) throw new Error(`${document} download failed (${response.status}).`);
  if (response.headers.get('content-type')?.split(';')[0] !== 'application/pdf') throw new Error(`The ${subject.toLowerCase()} response is not a PDF.`);
  if (!response.body) throw new Error(`The ${subject.toLowerCase()} response has no PDF body.`);
  // Allocate only the approved size instead of retaining every stream chunk too.
  const bytes = new Uint8Array(file.sizeBytes); let size = 0;
  const reader = response.body.getReader();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value.length > bytes.length - size) throw new Error(`${subject} size exceeds the retained source.`);
      bytes.set(value, size); size += value.length;
    }
  } finally {
    try { await reader.cancel(); } finally { reader.releaseLock(); }
  }
  const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(value => value.toString(16).padStart(2, '0')).join('');
  if (size !== file.sizeBytes || sha256 !== file.sha256 || new TextDecoder().decode(bytes.subarray(0, 5)) !== '%PDF-') {
    throw new Error(`${subject} checksum or size does not match the approved source.`);
  }
  return bytesToBase64(bytes);
}

export async function downloadDrawingFiles(pack, fetchImpl = fetch) {
  const drawings = pack.know.drawings;
  if (drawings.length > 50 || drawings.reduce((sum, item) => sum + (item.file?.sizeBytes || 0), 0) > 12 * 1024 * 1024) throw new Error('Offline drawing limit: 50 PDFs and 12 MB per work pack.');
  const files = [];
  for (const drawing of drawings) {
    const file = drawing.file;
    const base64 = await downloadVerifiedPdf(pack, file, `drawings/${encodeURIComponent(drawing.id)}`, 'Drawing', fetchImpl);
    files.push({ drawingId: drawing.id, ...file, base64 });
  }
  return files;
}

export async function downloadSafetyDataSheetFiles(pack, fetchImpl = fetch) {
  const sheets = (pack.know.sdsSheets || []).filter(item => item.file);
  if (sheets.length > 50 || sheets.reduce((sum, item) => sum + (item.file?.sizeBytes || 0), 0) > 12 * 1024 * 1024) throw new Error('Offline safety-sheet limit: 50 PDFs and 12 MB per work pack.');
  const files = [];
  for (const sheet of sheets) {
    const file = sheet.file;
    const base64 = await downloadVerifiedPdf(pack, file, `sds/${encodeURIComponent(sheet.id)}`, 'Safety data sheet', fetchImpl);
    files.push({ sdsSheetId: sheet.id, ...file, base64 });
  }
  return files;
}

export async function downloadSubmittalFiles(pack, fetchImpl = fetch) {
  const files = [];
  for (const submittal of pack.know.submittals || []) {
    for (const file of submittal.attachments || []) {
      const base64 = await downloadVerifiedPdf(pack, file, `submittals/${encodeURIComponent(submittal.id)}/documents/${encodeURIComponent(file.id)}`, 'Submittal', fetchImpl);
      files.push({ submittalId: submittal.id, documentId: file.id, ...file, base64 });
    }
  }
  return files;
}

export async function downloadWorkPackFiles(pack, fetchImpl = fetch) {
  const drawings = pack.know.drawings || [];
  const sheets = (pack.know.sdsSheets || []).filter(item => item.file);
  const submittalFiles = (pack.know.submittals || []).flatMap(item => item.attachments || []);
  const fileCount = drawings.length + sheets.length + submittalFiles.length;
  const byteCount = [...drawings, ...sheets].reduce((sum, item) => sum + (item.file?.sizeBytes || 0), 0)
    + submittalFiles.reduce((sum, item) => sum + (item.sizeBytes || 0), 0);
  if (fileCount > 50 || byteCount > 12 * 1024 * 1024) throw new Error('Offline documents are limited to 50 PDFs and 12 MB per work pack.');
  return [
    ...await downloadDrawingFiles(pack, fetchImpl),
    ...await downloadSafetyDataSheetFiles(pack, fetchImpl),
    ...await downloadSubmittalFiles(pack, fetchImpl)
  ];
}
