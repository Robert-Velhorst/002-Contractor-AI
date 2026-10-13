const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const documentKinds = [
  { name: 'drawing', download: 'downloadDrawingFiles', know: file => ({ drawings: [{ id: 'drawing/1', file }] }), route: 'drawings/drawing%2F1', identity: { drawingId: 'drawing/1' } },
  { name: 'safety sheet', download: 'downloadSafetyDataSheetFiles', know: file => ({ sdsSheets: [{ id: 'sheet/1', file }] }), route: 'sds/sheet%2F1', identity: { sdsSheetId: 'sheet/1' } },
  { name: 'submittal', download: 'downloadSubmittalFiles', know: file => ({ submittals: [{ id: 'submittal/1', attachments: [file] }] }), route: 'submittals/submittal%2F1/documents/file%2F1', identity: { submittalId: 'submittal/1', documentId: 'file/1' } }
];

function pdfFixture(kind, bytes = Buffer.from('%PDF-1.7\nVerified offline document\n%%EOF')) {
  const file = { id: 'file/1', filename: 'verified.pdf', mimeType: 'application/pdf', sizeBytes: bytes.length,
    sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
  return { bytes, file, pack: { job: { id: 'job/1' }, sourceHash: 'source+hash', know: kind.know(file) } };
}

for (const kind of documentKinds) {
  test(`offline ${kind.name} verifies progressive chunks, encoded scope and download policy`, async () => {
    const { [kind.download]: download } = await import('../offline-drawings.mjs');
    const { bytes, file, pack } = pdfFixture(kind);
    const stream = new ReadableStream({ start(controller) {
      for (let offset = 0; offset < bytes.length; offset += 3) controller.enqueue(bytes.subarray(offset, offset + 3));
      controller.close();
    } });
    const result = await download(pack, async (url, options) => {
      assert.equal(url, `/api/ledger/jobs/job%2F1/work-pack/${kind.route}/content?sourceHash=source%2Bhash`);
      assert.equal(options.redirect, 'error');
      assert.ok(options.signal instanceof AbortSignal);
      assert.equal(options.signal.aborted, false);
      return new Response(stream, { headers: { 'Content-Type': 'application/pdf; charset=binary' } });
    });
    assert.deepEqual(result, [{ ...kind.identity, ...file, base64: bytes.toString('base64') }]);
    assert.equal(stream.locked, false);
  });

  test(`offline ${kind.name} rejects invalid approved metadata before fetching`, async () => {
    const { [kind.download]: download } = await import('../offline-drawings.mjs');
    const { file, pack } = pdfFixture(kind);
    const fetchImpl = async () => assert.fail('Invalid document metadata must not reach the network');
    for (const change of [{ mimeType: 'text/html' }, { sizeBytes: 0 }, { sizeBytes: -1 }, { sizeBytes: 1.5 },
      { sizeBytes: 8 * 1024 * 1024 + 1 }, { sizeBytes: NaN }, { sha256: 'unverified' }]) {
      await assert.rejects(download({ ...pack, know: kind.know({ ...file, ...change }) }, fetchImpl), /verified PDF/);
    }
  });

  test(`offline ${kind.name} rejects HTTP failures, wrong MIME and missing bodies`, async () => {
    const { [kind.download]: download } = await import('../offline-drawings.mjs');
    const { bytes, pack } = pdfFixture(kind);
    await assert.rejects(download(pack, async () => new Response('Denied', { status: 403 })), /download failed \(403\)/);
    await assert.rejects(download(pack, async () => new Response(bytes, { headers: { 'Content-Type': 'text/html' } })), /not a PDF/);
    await assert.rejects(download(pack, async () => new Response(null, { headers: { 'Content-Type': 'application/pdf' } })), /no PDF body/);
  });

  test(`offline ${kind.name} cancels and unlocks an oversized stream`, async () => {
    const { [kind.download]: download } = await import('../offline-drawings.mjs');
    const { bytes, pack } = pdfFixture(kind);
    let cancelled = false;
    const stream = new ReadableStream({ start(controller) {
      controller.enqueue(bytes.subarray(0, 5));
      controller.enqueue(Buffer.alloc(bytes.length));
    }, cancel() { cancelled = true; } });
    await assert.rejects(download(pack, async () => new Response(stream, { headers: { 'Content-Type': 'application/pdf' } })), /exceeds the retained source/);
    assert.equal(cancelled, true);
    assert.equal(stream.locked, false);
  });

  test(`offline ${kind.name} rejects truncation, corruption and a non-PDF with a matching hash`, async () => {
    const { [kind.download]: download } = await import('../offline-drawings.mjs');
    const { bytes, pack } = pdfFixture(kind);
    for (const corrupt of [bytes.subarray(0, bytes.length - 1), Buffer.alloc(bytes.length, 65)]) {
      await assert.rejects(download(pack, async () => new Response(corrupt, { headers: { 'Content-Type': 'application/pdf' } })), /checksum or size/);
    }
    const fake = pdfFixture(kind, Buffer.from('<html>A disguised file</html>'));
    await assert.rejects(download(fake.pack, async () => new Response(fake.bytes, { headers: { 'Content-Type': 'application/pdf' } })), /checksum or size/);
  });

  test(`offline ${kind.name} releases the stream lock even if reading or cancellation fails`, async () => {
    const { [kind.download]: download } = await import('../offline-drawings.mjs');
    const { pack } = pdfFixture(kind);
    for (const failure of ['read', 'cancel']) {
      let released = false;
      let cancelled = false;
      const reader = {
        async read() { if (failure === 'read') throw new Error('stream read failed'); return { done: true }; },
        async cancel() { cancelled = true; if (failure === 'cancel') throw new Error('stream cancel failed'); },
        releaseLock() { released = true; }
      };
      await assert.rejects(download(pack, async () => ({ ok: true, headers: new Headers({ 'Content-Type': 'application/pdf' }),
        body: { getReader: () => reader } })), new RegExp(`stream ${failure} failed`));
      assert.equal(cancelled, true);
      assert.equal(released, true);
    }
  });
}

test('offline combined count and size limits reject the entire pack before any download', async () => {
  const { downloadWorkPackFiles } = await import('../offline-drawings.mjs');
  const fetchImpl = async () => assert.fail('A pack exceeding the combined limit must not download');
  const fixture = pdfFixture(documentKinds[0]);
  await assert.rejects(downloadWorkPackFiles({ ...fixture.pack, know: { drawings: Array.from({ length: 49 }, (_, id) => ({ id, file: fixture.file })),
    sdsSheets: [{ id: 'sheet', file: fixture.file }], submittals: [{ attachments: [fixture.file] }] } }, fetchImpl), /50 PDFs/);
  await assert.rejects(downloadWorkPackFiles({ ...fixture.pack, know: { drawings: [{ file: { ...fixture.file, sizeBytes: 8 * 1024 * 1024 } }],
    sdsSheets: [{ file: { ...fixture.file, sizeBytes: 3 * 1024 * 1024 } }], submittals: [{ attachments: [{ ...fixture.file, sizeBytes: 2 * 1024 * 1024 }] }] } }, fetchImpl), /12 MB/);
});

test('offline PDFs are fetched from scoped routes, bounded and checksum verified before retaining bytes', async () => {
  const { downloadDrawingFiles } = await import('../offline-drawings.mjs');
  const bytes = Buffer.from('%PDF-1.7\nfixture drawing\n%%EOF');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const pack = { job: { id: 'job-test' }, sourceHash: 'a'.repeat(64), know: { drawings: [{ id: 'drawing-test', file: { filename: 'detail.pdf', mimeType: 'application/pdf', sizeBytes: bytes.length, sha256 } }] } };
  const calls = [];
  const result = await downloadDrawingFiles(pack, async url => { calls.push(url); return new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } }); });
  assert.equal(calls[0], `/api/ledger/jobs/job-test/work-pack/drawings/drawing-test/content?sourceHash=${pack.sourceHash}`);
  assert.equal(Buffer.from(result[0].base64, 'base64').equals(bytes), true);
  await assert.rejects(downloadDrawingFiles(pack, async () => new Response('%PDF-wrong', { headers: { 'Content-Type': 'application/pdf' } })), /checksum|size/i);
  await assert.rejects(downloadDrawingFiles(pack, async () => new Response(bytes, { headers: { 'Content-Type': 'text/html' } })), /PDF/);
  await assert.rejects(downloadDrawingFiles({ ...pack, know: { drawings: [{ id: 'x', file: { ...pack.know.drawings[0].file, sizeBytes: 9 * 1024 * 1024 } }] } }, async () => { throw new Error('must not fetch'); }), /limit/);
});

test('offline SDS PDFs use the current work-pack route and share the document-size budget', async () => {
  const { downloadSafetyDataSheetFiles, downloadWorkPackFiles } = await import('../offline-drawings.mjs');
  const bytes = Buffer.from('%PDF-1.7\nfixture safety sheet\n%%EOF');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const file = { filename: 'adhesive-sds.pdf', mimeType: 'application/pdf', sizeBytes: bytes.length, sha256 };
  const pack = { job: { id: 'job-test' }, sourceHash: 'b'.repeat(64), know: { drawings: [], sdsSheets: [{ id: 'sds-test', file }] } };
  const calls = [];
  const result = await downloadSafetyDataSheetFiles(pack, async url => { calls.push(url); return new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } }); });
  assert.equal(calls[0], `/api/ledger/jobs/job-test/work-pack/sds/sds-test/content?sourceHash=${pack.sourceHash}`);
  assert.equal(result[0].sdsSheetId, 'sds-test');
  assert.equal(Buffer.from(result[0].base64, 'base64').equals(bytes), true);
  await assert.rejects(downloadSafetyDataSheetFiles(pack, async () => new Response('%PDF-wrong', { headers: { 'Content-Type': 'application/pdf' } })), /checksum|size/i);
  await assert.rejects(downloadWorkPackFiles({ ...pack, know: { drawings: [{ file: { sizeBytes: 8 * 1024 * 1024 } }], sdsSheets: [{ file: { sizeBytes: 5 * 1024 * 1024 } }] } }, async () => { throw new Error('must not fetch'); }), /12 MB/);
});

test('offline approved submittal PDFs use their scoped route and remain within the combined pack budget', async () => {
  const { downloadSubmittalFiles, downloadWorkPackFiles } = await import('../offline-drawings.mjs');
  const bytes = Buffer.from('%PDF-1.7\nfixture approved submittal\n%%EOF');
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const file = { id: 'document-1', filename: 'window-spec.pdf', mimeType: 'application/pdf', sizeBytes: bytes.length, sha256 };
  const pack = { job: { id: 'job-test' }, sourceHash: 'c'.repeat(64), know: {
    drawings: [], sdsSheets: [], submittals: [{ id: 'submittal-1', attachments: [file] }]
  } };
  const calls = [];
  const result = await downloadSubmittalFiles(pack, async url => { calls.push(url); return new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } }); });
  assert.equal(calls[0], `/api/ledger/jobs/job-test/work-pack/submittals/submittal-1/documents/document-1/content?sourceHash=${pack.sourceHash}`);
  assert.equal(result[0].submittalId, 'submittal-1');
  assert.equal(result[0].documentId, 'document-1');
  assert.equal(Buffer.from(result[0].base64, 'base64').equals(bytes), true);
  await assert.rejects(downloadSubmittalFiles(pack, async () => new Response('%PDF-wrong', { headers: { 'Content-Type': 'application/pdf' } })), /checksum|size/i);
  await assert.rejects(downloadWorkPackFiles({ ...pack, know: { ...pack.know,
    drawings: [{ file: { sizeBytes: 8 * 1024 * 1024 } }],
    submittals: [{ attachments: [{ sizeBytes: 5 * 1024 * 1024 }] }]
  } }, async () => { throw new Error('must not fetch'); }), /12 MB/);
});
