const test = require('node:test');
const assert = require('node:assert/strict');
const sharp = require('sharp');
const { createHash } = require('node:crypto');
const { createImageProcessor, imageLimits } = require('../image-processor');
const { png, jpegFixture, oversizedPng, animatedPngFixture } = require('./image-fixtures');

const result = (bytes = Buffer.from('preview')) => ({ buffer: bytes, width: 2, height: 2, mimeType: 'image/webp' });
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };

test('real JPEG, PNG and WebP decode to bounded still previews without changing original bytes', async () => {
  const processor = createImageProcessor();
  const jpeg = jpegFixture('A legitimate retained photo');
  const webp = await sharp(png).webp().toBuffer();
  for (const [bytes, mime] of [[jpeg, 'image/jpeg'], [png, 'image/png'], [webp, 'image/webp']]) {
    const original = Buffer.from(bytes);
    const preview = await processor.preview(bytes, mime);
    assert.equal(preview.mimeType, 'image/webp');
    assert.equal((await sharp(preview.buffer).metadata()).format, 'webp');
    assert.ok(preview.width <= imageLimits.previewEdge && preview.height <= imageLimits.previewEdge);
    assert.ok(preview.buffer.length <= imageLimits.previewBytes);
    assert.deepEqual(bytes, original);
    assert.deepEqual(await processor.validate(bytes, mime), { valid: true });
  }
  assert.equal(processor.stats().renders, 3);
  assert.equal(processor.stats().hits, 3);
});

test('valid signatures cannot admit truncated photos or mismatched decoder formats', async () => {
  const processor = createImageProcessor();
  for (const [bytes, mime] of [[Buffer.from([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg'],
    [png.subarray(0, 40), 'image/png'], [png, 'image/jpeg'], [Buffer.from('bad'), 'image/webp']]) {
    assert.equal((await processor.validate(bytes, mime)).code, 'invalid_image_content');
  }
  assert.equal(processor.stats().inputBytes, 0);
  assert.equal(processor.stats().cacheBytes, 0);
});

test('oversized PNG and JPEG headers are rejected before their declared pixels are decoded', async () => {
  const processor = createImageProcessor();
  const hugeJpeg = jpegFixture();
  const frame = hugeJpeg.indexOf(Buffer.from([0xff, 0xc0]));
  assert.ok(frame > 0);
  hugeJpeg.writeUInt16BE(20000, frame + 5);
  hugeJpeg.writeUInt16BE(20000, frame + 7);
  for (const [bytes, mime] of [[oversizedPng(), 'image/png'], [hugeJpeg, 'image/jpeg']]) {
    const refused = await processor.validate(bytes, mime);
    assert.equal(refused.statusCode, 415);
    assert.equal(refused.code, 'image_dimensions_exceeded');
  }
  assert.equal(processor.stats().cacheEntries, 0);
});

test('a real 12-megapixel fixture is oriented, metadata-stripped and substantially smaller', async t => {
  const original = await sharp({ create: { width: 4032, height: 3024, channels: 3,
    noise: { type: 'gaussian', mean: 128, sigma: 15 } } }).jpeg({ quality: 78 }).withMetadata({ orientation: 6 }).toBuffer();
  const sourceHash = createHash('sha256').update(original).digest('hex');
  const processor = createImageProcessor();
  const start = performance.now();
  const preview = await processor.preview(original, 'image/jpeg');
  const elapsedMs = performance.now() - start;
  const metadata = await sharp(preview.buffer).metadata();
  assert.equal(preview.width, 720);
  assert.equal(preview.height, 960);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.ok(preview.buffer.length < original.length / 4);
  assert.ok(original.length < 5 * 1024 * 1024);
  assert.equal(createHash('sha256').update(original).digest('hex'), sourceHash);
  t.diagnostic(JSON.stringify({ originalBytes: original.length, previewBytes: preview.buffer.length,
    originalPixels: 4032 * 3024, previewPixels: preview.width * preview.height, elapsedMs }));
});

test('an animated WebP source renders only one still frame and preserves its original bytes', async () => {
  const second = await sharp(png).negate().png().toBuffer();
  const bytes = await sharp([png, second], { join: { animated: true } }).webp().toBuffer();
  assert.equal((await sharp(bytes).metadata()).pages, 2);
  const original = Buffer.from(bytes);
  const preview = await createImageProcessor().preview(bytes, 'image/webp');
  assert.equal((await sharp(preview.buffer).metadata()).pages, undefined);
  assert.deepEqual(bytes, original);
});

test('APNG frames ignored by the input decoder cannot animate the re-encoded preview', async () => {
  const bytes = animatedPngFixture(), original = Buffer.from(bytes);
  assert.ok(bytes.includes(Buffer.from('acTL')) && bytes.includes(Buffer.from('fdAT')));
  assert.equal((await sharp(bytes).metadata()).pages, undefined);
  const preview = await createImageProcessor().preview(bytes, 'image/png');
  const metadata = await sharp(preview.buffer).metadata();
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.pages, undefined);
  assert.equal(metadata.width * metadata.height, 4);
  assert.deepEqual(bytes, original);
});

test('one native job runs at a time, admission is bounded and failures release capacity', async () => {
  const pending = [], started = [];
  const processor = createImageProcessor({ render: bytes => {
    started.push(bytes.toString()); const next = deferred(); pending.push(next); return next.promise;
  } });
  const tasks = Array.from({ length: 4 }, (_, index) => processor.preview(Buffer.from(`image-${index}`), 'image/png'));
  assert.equal(processor.stats().active, 1);
  assert.equal(processor.stats().queued, 3);
  await assert.rejects(processor.preview(Buffer.from('overflow'), 'image/png'), { statusCode: 503, code: 'image_processing_busy' });
  assert.deepEqual(started, ['image-0']);
  const failed = assert.rejects(tasks[0], /decode failed/);
  pending[0].reject(new Error('decode failed'));
  await failed;
  for (let index = 1; index < 4; index += 1) { pending[index].resolve(result()); await tasks[index]; }
  assert.equal(processor.stats().active, 0);
  assert.equal(processor.stats().queued, 0);
  assert.equal(processor.stats().inputBytes, 0);
  assert.deepEqual(started, ['image-0', 'image-1', 'image-2', 'image-3']);
});

test('queued encoded inputs have an independent byte ceiling', async () => {
  const gate = deferred();
  const processor = createImageProcessor({ render: () => gate.promise });
  const bytes = Buffer.alloc(12 * 1024 * 1024, 1);
  const first = processor.preview(bytes, 'image/png');
  const second = processor.preview(Buffer.alloc(bytes.length, 2), 'image/png');
  await assert.rejects(processor.preview(Buffer.alloc(bytes.length, 3), 'image/png'), { code: 'image_processing_busy' });
  assert.equal(processor.stats().inputBytes, 24 * 1024 * 1024);
  gate.resolve(result());
  await Promise.all([first, second]);
  assert.equal(processor.stats().inputBytes, 0);
  await assert.rejects(processor.preview(Buffer.alloc(imageLimits.retainedInputBytes + 1), 'image/png'), { code: 'image_input_too_large' });
});

test('eight identical simultaneous inputs share one admission and one native conversion', async () => {
  const gate = deferred();
  const processor = createImageProcessor({ render: () => gate.promise });
  const tasks = Array.from({ length: 8 }, () => processor.preview(png, 'image/png'));
  assert.equal(processor.stats().queued, 0);
  gate.resolve(result());
  await Promise.all(tasks);
  assert.equal(processor.stats().renders, 1);
  assert.equal(processor.stats().hits, 7);
  assert.equal(processor.stats().inputBytes, 0);
});

test('preview caches enforce both byte and entry ceilings and least-recently-used eviction', async () => {
  const big = createImageProcessor({ render: async () => result(Buffer.alloc(imageLimits.previewBytes)) });
  for (let index = 0; index < 20; index += 1) await big.preview(Buffer.from(`large-${index}`), 'image/png');
  assert.equal(big.stats().cacheBytes, imageLimits.cacheBytes);
  assert.equal(big.stats().cacheEntries, 16);
  const small = createImageProcessor({ render: async () => result(Buffer.from('x')) });
  for (let index = 0; index < 64; index += 1) await small.preview(Buffer.from(`small-${index}`), 'image/png');
  await small.preview(Buffer.from('small-0'), 'image/png');
  await small.preview(Buffer.from('small-64'), 'image/png');
  assert.equal(small.stats().cacheEntries, imageLimits.cacheEntries);
  const prior = small.stats().renders;
  await small.preview(Buffer.from('small-0'), 'image/png');
  assert.equal(small.stats().renders, prior);
  await small.preview(Buffer.from('small-1'), 'image/png');
  assert.equal(small.stats().renders, prior + 1);
});

test('expired previews are removed and reconverted without retaining original input buffers', async () => {
  let now = 0;
  const processor = createImageProcessor({ now: () => now, render: async () => result() });
  await processor.preview(png, 'image/png');
  now = imageLimits.cacheTtlMs;
  assert.equal(processor.stats().cacheEntries, 0);
  await processor.preview(png, 'image/png');
  assert.equal(processor.stats().renders, 2);
  assert.equal(processor.stats().inputBytes, 0);
});

test('invalid renderer output is never cached or served', async () => {
  for (const invalid of [{ ...result(), width: imageLimits.previewEdge + 1 },
    result(Buffer.alloc(imageLimits.previewBytes + 1)), { ...result(), mimeType: 'text/html' }]) {
    const processor = createImageProcessor({ render: async () => invalid });
    assert.equal((await processor.validate(png, 'image/png')).code, 'invalid_image_preview');
    assert.equal(processor.stats().cacheBytes, 0);
    assert.equal(processor.stats().inputBytes, 0);
  }
});
