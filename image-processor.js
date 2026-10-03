const sharp = require('sharp');
const { createHash } = require('node:crypto');

const imageLimits = Object.freeze({ pixels: 64_000_000, edge: 16384, previewEdge: 960,
  previewBytes: 512 * 1024, retainedInputBytes: 32 * 1024 * 1024,
  jobs: 4, cacheBytes: 8 * 1024 * 1024, cacheEntries: 64, cacheTtlMs: 300000 });
const formats = new Map([['image/jpeg', 'jpeg'], ['image/png', 'png'], ['image/webp', 'webp']]);

// One native worker per image; the application queue bounds simultaneous images.
sharp.concurrency(1);
sharp.cache({ memory: 8, files: 0, items: 32 });

class ImageProcessingError extends Error {
  constructor(statusCode, code, message) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

async function renderPreview(bytes, mimeType) {
  const options = { failOn: 'warning', limitInputPixels: imageLimits.pixels, limitInputChannels: 4, pages: 1 };
  try {
    const metadata = await sharp(bytes, options).metadata();
    if (metadata.format !== formats.get(mimeType)) throw new ImageProcessingError(415,
      'invalid_image_content', 'The image decoder does not match the declared photo format.');
    if (!Number.isSafeInteger(metadata.width) || !Number.isSafeInteger(metadata.height)
        || metadata.width < 1 || metadata.height < 1 || metadata.width > imageLimits.edge
        || metadata.height > imageLimits.edge || metadata.width * metadata.height > imageLimits.pixels) {
      throw new ImageProcessingError(415, 'image_dimensions_exceeded', 'Photos must be at most 64 megapixels and 16384 pixels per edge.');
    }
    let result;
    for (const edge of [imageLimits.previewEdge, 640]) {
      result = await sharp(bytes, options).autoOrient()
        .resize({ width: edge, height: edge, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 75, effort: 3 }).timeout({ seconds: 5 }).toBuffer({ resolveWithObject: true });
      if (result.data.length <= imageLimits.previewBytes) break;
    }
    if (result.data.length > imageLimits.previewBytes) throw new ImageProcessingError(415,
      'image_preview_too_large', 'The photo cannot be converted to a bounded preview.');
    return Object.freeze({ buffer: result.data, mimeType: 'image/webp', width: result.info.width,
      height: result.info.height, sourceWidth: metadata.width, sourceHeight: metadata.height });
  } catch (error) {
    if (error instanceof ImageProcessingError) throw error;
    if (/exceeds pixel limit/i.test(error.message)) throw new ImageProcessingError(415,
      'image_dimensions_exceeded', 'Photos must be at most 64 megapixels and 16384 pixels per edge.');
    throw new ImageProcessingError(415, 'invalid_image_content', 'The photo is malformed, truncated, or cannot be safely decoded.');
  }
}

function createImageProcessor({ render = renderPreview, now = Date.now } = {}) {
  const queue = [], cache = new Map(), inFlight = new Map();
  let active = 0, inputBytes = 0, cacheBytes = 0, renders = 0, hits = 0;
  function remove(key) {
    const entry = cache.get(key);
    if (entry) { cacheBytes -= entry.value.buffer.length; cache.delete(key); }
  }
  function prune() {
    for (const [key, entry] of cache) if (entry.expiresAt <= now()) remove(key);
  }
  function remember(key, value) {
    remove(key);
    while (cache.size >= imageLimits.cacheEntries || cacheBytes + value.buffer.length > imageLimits.cacheBytes) {
      remove(cache.keys().next().value);
    }
    cache.set(key, { value, expiresAt: now() + imageLimits.cacheTtlMs });
    cacheBytes += value.buffer.length;
  }
  function start() {
    if (active || !queue.length) return;
    const job = queue.shift();
    active = 1;
    (async () => {
      try { job.resolve(await job.run()); }
      catch (error) { job.reject(error); }
      finally { inputBytes -= job.size; active = 0; start(); }
    })();
  }
  function run(size, action) {
    if (active + queue.length >= imageLimits.jobs || inputBytes + size > imageLimits.retainedInputBytes) {
      throw new ImageProcessingError(503, 'image_processing_busy', 'Photo processing is busy. Retry shortly.');
    }
    inputBytes += size;
    return new Promise((resolve, reject) => { queue.push({ size, run: action, resolve, reject }); start(); });
  }
  async function preview(bytes, mimeType) {
    if (!Buffer.isBuffer(bytes) || !bytes.length || !formats.has(mimeType)) {
      throw new ImageProcessingError(415, 'invalid_image_content', 'A JPEG, PNG or WebP photo is required.');
    }
    if (bytes.length > imageLimits.retainedInputBytes) throw new ImageProcessingError(413,
      'image_input_too_large', 'The encoded photo exceeds the processing byte limit.');
    const key = `${mimeType}:${createHash('sha256').update(bytes).digest('hex')}`;
    prune();
    const cached = cache.get(key);
    if (cached) { cache.delete(key); cache.set(key, cached); hits += 1; return cached.value; }
    if (inFlight.has(key)) { hits += 1; return inFlight.get(key); }
    const conversion = run(bytes.length, async () => {
      // Another queued request may already have converted these exact bytes.
      prune();
      const existing = cache.get(key);
      if (existing) { hits += 1; return existing.value; }
      renders += 1;
      const result = await render(bytes, mimeType);
      if (!Buffer.isBuffer(result.buffer) || !result.buffer.length || result.buffer.length > imageLimits.previewBytes
          || result.mimeType !== 'image/webp' || !Number.isSafeInteger(result.width) || !Number.isSafeInteger(result.height)
          || result.width < 1 || result.height < 1 || result.width > imageLimits.previewEdge || result.height > imageLimits.previewEdge) {
        throw new ImageProcessingError(415, 'invalid_image_preview', 'The preview exceeds the resource policy.');
      }
      remember(key, result);
      return result;
    });
    inFlight.set(key, conversion);
    try { return await conversion; }
    finally { if (inFlight.get(key) === conversion) inFlight.delete(key); }
  }
  return {
    preview,
    async validate(bytes, mimeType) {
      try { await preview(bytes, mimeType); return { valid: true }; }
      catch (error) {
        if (!(error instanceof ImageProcessingError)) throw error;
        return { valid: false, statusCode: error.statusCode, code: error.code, message: error.message };
      }
    },
    stats() { prune(); return { active, queued: queue.length, inputBytes, cacheBytes, cacheEntries: cache.size, renders, hits }; }
  };
}

module.exports = { createImageProcessor, imageLimits, ImageProcessingError };
