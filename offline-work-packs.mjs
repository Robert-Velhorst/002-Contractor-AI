import { bytesToBase64, base64ToBytes } from './offline-drawings.mjs';
import { companyHeaders, parseCompanyScope } from './company-scope.mjs';
const DATABASE = 'contractor-work-pack-vault';
const STORE = 'vault';
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const TTL = 7 * 24 * 60 * 60 * 1000;
const PHOTO_PHASES = ['before', 'during', 'after'];
const PHOTO_TYPES = new Map([
  ['image/jpeg', { extension: '.jpg', valid: bytes => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff }],
  ['image/png', { extension: '.png', valid: bytes => [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value) }],
  ['image/webp', { extension: '.webp', valid: bytes => bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 && String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP' }]
]);
const aad = record => encoder.encode(JSON.stringify([record.format, record.expiresAt, record.salt]));
async function keyFor(password, salt) {
  if (typeof password !== 'string' || password.length < 10 || password.length > 200) throw new Error('Use an offline passphrase of 10-200 characters.');
  const seed = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: Uint8Array.from(salt), iterations: 600000, hash: 'SHA-256' }, seed, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
async function encrypt(data, key, record) {
  const bytes = encoder.encode(JSON.stringify(data));
  if (bytes.length > 24 * 1024 * 1024) throw new Error('The offline vault exceeds 24 MB, including drawings.');
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(record) }, key, bytes);
  return { ...record, iv: [...iv], ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}
export async function sealVault(data, password) {
  const salt = [...crypto.getRandomValues(new Uint8Array(16))];
  const record = { format: 'contractor-offline-vault/v1', salt, expiresAt: Date.now() + TTL };
  return encrypt(data, await keyFor(password, salt), record);
}
export async function openVault(record, password, { recoverExpired = false } = {}) {
  if (!record || record.format !== 'contractor-offline-vault/v1' || (!recoverExpired && record.expiresAt <= Date.now()) || record.expiresAt > Date.now() + TTL + 60000) throw new Error('Offline storage expired or unavailable. Reconnect and unlock with the original account to recover unsent responses.');
  const key = await keyFor(password, record.salt);
  try {
    const ciphertext = typeof record.ciphertext === 'string' ? base64ToBytes(record.ciphertext) : Uint8Array.from(record.ciphertext);
    const bytes = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(record.iv), additionalData: aad(record) }, key, ciphertext);
    return { data: JSON.parse(decoder.decode(bytes)), key, record };
  } catch { throw new Error('The offline passphrase is incorrect or the stored data is damaged.'); }
}
async function databaseAction(mode, callback, transform) {
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open(DATABASE, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = callback(tx.objectStore(STORE));
      let result;
      req.onsuccess = () => {
        result = req.result;
        if (transform) {
          try { transform(tx.objectStore(STORE), result); } catch { tx.abort(); }
        }
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error || new Error('Offline transaction aborted.'));
    });
  } finally { db.close(); }
}
export const listVaultScopes = () => databaseAction('readonly', store => store.getAllKeys());
export const readVault = (scope = 'current') => databaseAction('readonly', store => store.get(scope));
const writeVault = (value, expected, scope) => databaseAction('readwrite', store => store.get(scope), (store, current) => {
  if (JSON.stringify(current) !== JSON.stringify(expected)) throw new Error('Offline storage changed in another window.');
  store.put(value, scope);
});
export const eraseVault = (scope = 'current') => databaseAction('readwrite', store => store.delete(scope));
export function snapshotWorkerNotifications(inbox) {
  const notifications = (Array.isArray(inbox?.notifications) ? inbox.notifications : []).slice(0, 100).flatMap(item => {
    if (!item || typeof item.id !== 'string' || typeof item.title !== 'string' || typeof item.body !== 'string') return [];
    return [{
      id: item.id.slice(0, 200), type: ['standby_callout', 'position_offer', 'position_assigned'].includes(item.type) ? item.type : 'update',
      title: item.title.slice(0, 200), body: item.body.slice(0, 1200), createdAt: typeof item.createdAt === 'string' ? item.createdAt.slice(0, 40) : null,
      readAt: typeof item.readAt === 'string' ? item.readAt.slice(0, 40) : null
    }];
  });
  return { savedAt: new Date().toISOString(), unreadCount: Number.isSafeInteger(inbox?.unreadCount) && inbox.unreadCount >= 0 ? inbox.unreadCount : 0, notifications };
}
export async function updateVault(unlocked) {
  const scope = parseCompanyScope(unlocked.data.scope) ? unlocked.data.scope : 'current';
  const current = await readVault(scope);
  if (JSON.stringify(current) !== JSON.stringify(unlocked.record)) throw new Error('Offline storage changed in another window. Lock and unlock again before saving.');
  const record = await encrypt(unlocked.data, unlocked.key, unlocked.record);
  await writeVault(record, unlocked.record, scope); unlocked.record = record;
}
export async function downloadWorkPack(pack, password, scope, inbox = {}) {
  if (parseCompanyScope(scope)?.role !== 'field_worker') throw new Error('A named field worker and verified company environment are required.');
  const notifications = snapshotWorkerNotifications(inbox);
  const existing = await readVault(scope);
  if (existing) {
    const unlocked = await openVault(existing, password);
    if (unlocked.data.scope !== scope) throw new Error('This device vault belongs to another account. Remove it explicitly before using another account.');
    const packs = unlocked.data.packs.filter(item => item.job.id !== pack.job.id);
    if (packs.length >= 20) throw new Error('At most 20 work packs can be saved offline.');
    unlocked.data.packs = [...packs, { ...pack, savedAt: new Date().toISOString() }];
    unlocked.data.notifications = notifications;
    await updateVault(unlocked);
  } else await writeVault(await sealVault({ scope, packs: [{ ...pack, savedAt: new Date().toISOString() }], queue: [], notifications }, password), undefined, scope);
}
export function queueResponse(data, jobId, kind, body) {
  const pack = data.packs.find(item => item.job.id === jobId);
  if (!pack || !['questions', 'acknowledgments', 'progress'].includes(kind)) throw new Error('Invalid offline response.');
  if (data.queue.length >= 100) throw new Error('The offline response queue is full.');
  let payload;
  if (kind === 'questions') {
    payload = { message: String(body.message || '').trim() };
    if (payload.message.length < 3 || payload.message.length > 4000) throw new Error('Complete the response first.');
  } else if (kind === 'acknowledgments') {
    payload = { understood: body.understood === true };
    if (!payload.understood) throw new Error('Complete the response first.');
  } else {
    const taskId = String(body.taskId || '').trim();
    payload = { taskId, status: body.status, progressPercent: body.progressPercent, note: String(body.note || '').trim() };
    if (!pack.do?.some(task => task.id === taskId)) throw new Error('Kies een taak uit dit opgeslagen werkpakket.');
    if (!['in_progress', 'blocked'].includes(payload.status) || typeof payload.progressPercent !== 'number' || !Number.isFinite(payload.progressPercent) || payload.progressPercent < 0 || payload.progressPercent > 100 || payload.note.length < 3 || payload.note.length > 2000) throw new Error('Vul een geldige voortgang, status en toelichting in.');
    if (body.equipmentIssue) {
      const issue = body.equipmentIssue;
      const reservationId = typeof issue.reservationId === 'string' ? issue.reservationId.trim() : '';
      if (payload.status !== 'blocked' || !['malfunction', 'damaged', 'unsafe'].includes(issue.issueType)
        || String(issue.note || '').trim().length < 8 || String(issue.note || '').trim() !== payload.note
        || !pack.have?.equipment?.some(item => item.id === reservationId && item.taskId === taskId
          && item.custody?.status === 'checked_out' && item.custody.heldByYou === true)) {
        throw new Error('Kies alleen materieel dat in deze werkmap aan jou en deze taak is uitgegeven, en beschrijf de blokkade.');
      }
      payload.equipmentIssue = { reservationId, issueType: issue.issueType, note: payload.note };
    }
  }
  data.queue.push({ jobId, kind, payload: { ...payload, sourceHash: pack.sourceHash, entryKey: crypto.randomUUID() }, state: 'pending', createdAt: new Date().toISOString() });
}

export function queueSiteIssueReceipt(data, jobId, issueId, body = {}) {
  const pack = data.packs.find(item => item.job.id === jobId);
  const issue = pack?.have?.siteIssues?.find(item => item.id === issueId);
  if (!pack || !issue || !Number.isFinite(Number(issue.remainingQuantity)) || Number(issue.remainingQuantity) <= 0) {
    throw new Error('Deze levering staat niet open in het opgeslagen werkpakket.');
  }
  if (data.queue.length >= 100) throw new Error('De offline wachtrij is vol. Synchroniseer bestaande reacties eerst.');
  const parseQuantity = (value, allowZero = false) => {
    if (value === '' || value === null || value === undefined || !Number.isFinite(Number(value))) throw new Error('Vul geldige aantallen in.');
    const amount = Number(value), scaled = Math.round(amount * 10000);
    if (amount < 0 || (!allowZero && amount === 0) || Math.abs(scaled / 10000 - amount) > Math.max(1e-9, amount * Number.EPSILON)) throw new Error('Aantallen moeten positief zijn met maximaal vier decimalen.');
    return Math.round(amount * 10000) / 10000;
  };
  const receivedQuantity = parseQuantity(body.receivedQuantity);
  const acceptedQuantity = parseQuantity(body.acceptedQuantity, true);
  const damagedQuantity = parseQuantity(body.damagedQuantity ?? 0, true);
  const existingReceipts = data.queue.filter(item => item.kind === 'site_receipt' && item.issueId === issueId);
  if (existingReceipts.some(item => item.state === 'conflict')) throw new Error('Deze levering heeft een synchronisatieconflict. Laat kantoor eerst de actuele hoeveelheid controleren.');
  const unqueuedRemaining = Number(issue.remainingQuantity)
    - existingReceipts.reduce((total, item) => total + Number(item.payload.receivedQuantity || 0), 0);
  if (unqueuedRemaining <= 0) throw new Error('Volgens de opgeslagen werkmap staat geen hoeveelheid meer open voor deze levering.');
  const expectedRemainingQuantity = parseQuantity(unqueuedRemaining);
  if (receivedQuantity > expectedRemainingQuantity + 0.000001 || acceptedQuantity + damagedQuantity > receivedQuantity + 0.000001) {
    throw new Error('Controleer dat ontvangen, geaccepteerde en beschadigde aantallen binnen de open levering vallen.');
  }
  const reference = (value, label, max = 240) => {
    if (typeof value !== 'string' || value.trim().length < 3 || value.trim().length > max || [...value].some(char => char.charCodeAt(0) < 32 && !'\t\r\n'.includes(char))) throw new Error(`Vul een geldige ${label} in.`);
    return value.trim();
  };
  const payload = {
    receivedQuantity, acceptedQuantity, damagedQuantity,
    receiptReference: reference(body.receiptReference, 'ontvangstreferentie'),
    evidenceReference: reference(body.evidenceReference, 'bewijsreferentie'),
    location: reference(body.location, 'ontvangstlocatie'),
    expectedDispatchReference: issue.dispatchReference,
    expectedRemainingQuantity,
    sourceHash: pack.sourceHash,
    entryKey: crypto.randomUUID()
  };
  data.queue.push({ jobId, kind: 'site_receipt', issueId, payload, state: 'pending', createdAt: new Date().toISOString() });
  return payload.entryKey;
}

export function queuePhotoEvidence(data, jobId, { setId, phase, capturedAt, notes, filename, mimeType, bytes }) {
  const pack = data.packs.find(item => item.job.id === jobId);
  const set = pack?.checks?.photos?.find(item => item.id === setId);
  const type = PHOTO_TYPES.get(String(mimeType || '').toLowerCase());
  const content = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const note = String(notes || '').trim();
  const timestamp = Date.parse(capturedAt);
  if (!pack || !set || !type) throw new Error('Kies een fotocontrole uit dit opgeslagen werkpakket en een ondersteund afbeeldingsbestand.');
  if (!PHOTO_PHASES.includes(phase) || !set.requiredPhases?.includes(phase)) throw new Error('Kies een vereiste fase: voor, tijdens of na het werk.');
  if (!Number.isFinite(timestamp) || timestamp > Date.now() + 5 * 60 * 1000) throw new Error('De opnametijd van dit apparaat is ongeldig.');
  if (content.length < 12 || content.length > 2 * 1024 * 1024 || !type.valid(content)) throw new Error('Gebruik een echte JPEG-, PNG- of WebP-foto van maximaal 2 MB.');
  if (note.length > 1000) throw new Error('De toelichting mag maximaal 1.000 tekens bevatten.');
  if (data.queue.length >= 100) throw new Error('De offline wachtrij is vol. Synchroniseer bestaande reacties eerst.');
  const pendingPhotos = data.queue.filter(item => item.kind === 'evidence' && item.jobId === jobId);
  const pendingBytes = pendingPhotos.reduce((total, item) => total + Number(item.payload.sizeBytes || 0), 0);
  if (pendingPhotos.length >= 20 || pendingBytes + content.length > 8 * 1024 * 1024) throw new Error('De fotowachtrij is vol. Synchroniseer bestaande foto’s voordat je meer toevoegt.');
  const phases = [...(set.capturedPhases || []), ...pendingPhotos.filter(item => item.payload.setId === setId).map(item => item.payload.phase)];
  const nextPhase = PHOTO_PHASES.find(item => !phases.includes(item));
  if (!nextPhase) throw new Error('Alle fotofasen zijn al vastgelegd voor deze werkcyclus.');
  if (phase !== nextPhase) throw new Error(`Leg eerst de fase “${nextPhase === 'before' ? 'voor' : nextPhase === 'during' ? 'tijdens' : 'na'}” vast.`);
  const safeBase = String(filename || 'werkfoto').split(/[\\/]/).pop().replace(/\.[^.]*$/, '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80) || 'werkfoto';
  const entryKey = crypto.randomUUID();
  data.queue.push({
    jobId, kind: 'evidence',
    payload: { setId, phase, capturedAt: new Date(timestamp).toISOString(), notes: note, filename: `${safeBase}${type.extension}`, mimeType, sizeBytes: content.length, fileBase64: bytesToBase64(content), sourceHash: pack.sourceHash, entryKey },
    state: 'pending', createdAt: new Date().toISOString()
  });
  return entryKey;
}

function photoUploadForm(entry) {
  const { payload } = entry;
  const form = new FormData();
  form.append('evidenceFile', new Blob([base64ToBytes(payload.fileBase64)], { type: payload.mimeType }), payload.filename);
  form.append('jobId', entry.jobId);
  form.append('category', 'governed_field_photo');
  form.append('photoEvidenceSetId', payload.setId);
  form.append('photoEvidencePhase', payload.phase);
  form.append('photoEvidenceEntryKey', payload.entryKey);
  form.append('capturedAt', payload.capturedAt);
  form.append('notes', payload.notes);
  return form;
}

export async function synchronizeVault(data, currentScope, request, persist = async () => {}) {
  const headers = companyHeaders(data.scope);
  if (currentScope !== data.scope) throw new Error('Open de oorspronkelijke bedrijfsomgeving en meld je aan als de oorspronkelijke uitvoerende voordat je synchroniseert.');
  const priority = entry => entry.kind === 'site_receipt' ? 2 : entry.kind === 'evidence' ? 1 : 0;
  const orderedQueue = data.queue.map((entry, index) => ({ entry, index })).sort((left, right) => priority(left.entry) - priority(right.entry) || left.index - right.index).map(item => item.entry);
  for (const entry of orderedQueue) {
    if (entry.state === 'conflict') continue;
    try {
      if (entry.kind === 'evidence') {
        await request('/api/ledger/upload', { method: 'POST', headers: { ...headers, 'Idempotency-Key': entry.payload.entryKey }, body: photoUploadForm(entry) });
        const pack = data.packs.find(item => item.job.id === entry.jobId);
        const set = pack?.checks?.photos?.find(item => item.id === entry.payload.setId);
        if (set) set.capturedPhases = [...new Set([...(set.capturedPhases || []), entry.payload.phase])];
      } else if (entry.kind === 'site_receipt') {
        const result = await request(`/api/ledger/jobs/${encodeURIComponent(entry.jobId)}/material-stock-site-issues/${encodeURIComponent(entry.issueId)}/receipts`, {
          method: 'POST', headers: { ...headers, 'Idempotency-Key': entry.payload.entryKey }, body: JSON.stringify(entry.payload)
        });
        const pack = data.packs.find(item => item.job.id === entry.jobId);
        const issue = pack?.have?.siteIssues?.find(item => item.id === entry.issueId);
        if (issue && result?.issue) Object.assign(issue, result.issue);
      } else {
        const result = await request(`/api/ledger/jobs/${encodeURIComponent(entry.jobId)}/work-pack/${entry.kind}`, { method: 'POST', headers, body: JSON.stringify(entry.payload) });
        if (entry.kind === 'questions' && result?.record) {
          const pack = data.packs.find(item => item.job.id === entry.jobId);
          if (pack) {
            pack.questions ||= [];
            if (!pack.questions.some(item => item.id === result.record.id)) {
              pack.questions = [{ ...result.record, replyStatus: 'open', response: null, repliedAt: null }, ...pack.questions].slice(0, 20);
            }
          }
        }
      }
      data.queue = data.queue.filter(item => item !== entry);
    } catch (error) {
      entry.error = error.message;
      if ([401, 403].includes(error.status)) { await persist(); throw error; }
      entry.state = error.status === 409 ? 'conflict' : 'pending';
    }
    await persist();
  }
}
