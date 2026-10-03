const DATABASE_NAME = 'contractor-ai-client-message-outbox'
const DATABASE_VERSION = 2
const STORE_NAME = 'messages'
const SNAPSHOT_STORE_NAME = 'snapshots'
const FORMAT = 'contractor-client-message/v1'
const SNAPSHOT_FORMAT = 'contractor-client-snapshot/v1'
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000
const MAX_MESSAGES = 10
const MAX_TOTAL_BYTES = 20 * 1024 * 1024
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const MAX_SNAPSHOT_BYTES = 2 * 1024 * 1024

function requireCrypto(cryptoImpl) {
  if (!cryptoImpl?.subtle || !cryptoImpl?.getRandomValues) throw new Error('De versleutelde offline berichtenwachtrij is niet beschikbaar in deze browser.')
  return cryptoImpl
}

async function deriveKey(token, cryptoImpl = globalThis.crypto) {
  requireCrypto(cryptoImpl)
  const credential = String(token || '')
  if (credential.length < 32) throw new Error('Offline berichten bewaren vereist een volledige, geldige klanttoegang.')
  const material = await cryptoImpl.subtle.digest('SHA-256', new TextEncoder().encode(credential))
  return cryptoImpl.subtle.importKey('raw', material, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

function pack(payload) {
  const attachment = payload.attachment || null
  const bytes = attachment?.bytes instanceof Uint8Array ? attachment.bytes : new Uint8Array()
  if (attachment && (!['image/jpeg', 'image/png', 'image/webp'].includes(attachment.type) || bytes.length < 12 || bytes.length > MAX_PHOTO_BYTES || Number(attachment.size) !== bytes.length)) {
    throw new Error('Offline klantfoto moet een geldige JPEG-, PNG- of WebP-foto van maximaal 5 MB zijn.')
  }
  const body = String(payload.body || '')
  const replyTo = String(payload.replyTo || '')
  if (body.length > 5000 || replyTo.length > 200 || (!body.trim() && !attachment)) throw new Error('Het klantbericht is leeg of overschrijdt de toegestane lengte.')
  if (typeof payload.entryKey !== 'string' || !/^[\w.:-]{8,200}$/.test(payload.entryKey)) throw new Error('Het klantbericht mist een geldige herhaalsleutel.')
  const header = new TextEncoder().encode(JSON.stringify({
    version: 1,
    entryKey: payload.entryKey,
    body,
    replyTo,
    analysisOrigin: payload.analysisOrigin || null,
    attachment: attachment ? { name: String(attachment.name || 'klantfoto').slice(0, 160), type: attachment.type, lastModified: Number(attachment.lastModified || 0), size: bytes.length } : null
  }))
  const result = new Uint8Array(4 + header.length + bytes.length)
  new DataView(result.buffer).setUint32(0, header.length, false)
  result.set(header, 4)
  result.set(bytes, 4 + header.length)
  return result
}

function unpack(bytes) {
  if (bytes.length < 4) throw new Error('Het versleutelde klantbericht is onvolledig.')
  const headerLength = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, false)
  if (headerLength < 2 || headerLength > 16_384 || 4 + headerLength > bytes.length) throw new Error('Het versleutelde klantbericht heeft een ongeldig formaat.')
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + headerLength)))
  if (header.version !== 1 || typeof header.entryKey !== 'string' || typeof header.body !== 'string') throw new Error('Het versleutelde klantbericht gebruikt een onbekend formaat.')
  const fileBytes = bytes.slice(4 + headerLength)
  if (header.attachment) {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(header.attachment.type) || fileBytes.length !== header.attachment.size || fileBytes.length > MAX_PHOTO_BYTES) throw new Error('De versleutelde klantfoto kan niet worden gecontroleerd.')
    header.attachment.bytes = fileBytes
  } else if (fileBytes.length) throw new Error('Het versleutelde klantbericht bevat onverwachte fotodata.')
  return header
}

export async function encryptQueuedClientMessage(payload, token, scope, cryptoImpl = globalThis.crypto) {
  const crypto = requireCrypto(cryptoImpl)
  const normalizedScope = String(scope || '')
  if (!normalizedScope || normalizedScope.length > 240) throw new Error('De klanttoegang kan niet veilig aan deze offline wachtrij worden gekoppeld.')
  const id = String(payload.entryKey)
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const aad = new TextEncoder().encode(`${FORMAT}:${normalizedScope}:${id}`)
  const plaintext = pack(payload)
  const key = await deriveKey(token, crypto)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plaintext)
  return { id, scope: normalizedScope, format: FORMAT, createdAt: new Date().toISOString(), expiresAt: Date.now() + RETENTION_MS,
    iv: [...iv], ciphertext, sizeBytes: plaintext.length }
}

export async function decryptQueuedClientMessage(record, token, cryptoImpl = globalThis.crypto, now = Date.now()) {
  const crypto = requireCrypto(cryptoImpl)
  if (!record || record.format !== FORMAT || !Array.isArray(record.iv) || record.iv.length !== 12
    || !Number.isFinite(record.expiresAt) || !record.scope || !record.id) {
    throw new Error('Dit offline klantbericht is niet beschikbaar; het is niet verzonden.')
  }
  const key = await deriveKey(token, crypto)
  const aad = new TextEncoder().encode(`${FORMAT}:${record.scope}:${record.id}`)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(record.iv), additionalData: aad }, key, record.ciphertext)
  const payload = unpack(new Uint8Array(plaintext))
  if (payload.entryKey !== record.id) throw new Error('De herhaalsleutel van het offline klantbericht komt niet overeen.')
  return { ...payload, createdAt: record.createdAt, expiresAt: record.expiresAt, expired: record.expiresAt <= now }
}

function openDatabase() {
  if (typeof indexedDB === 'undefined') throw new Error('Offline klantberichten kunnen niet in deze browser worden bewaard. Laat het bericht open en probeer opnieuw zodra je verbinding hebt.')
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) request.result.createObjectStore(STORE_NAME, { keyPath: 'id' })
      if (!request.result.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) request.result.createObjectStore(SNAPSHOT_STORE_NAME, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('De offline klantberichtenwachtrij kan niet worden geopend.'))
  })
}

export async function enqueueClientMessage(payload, token, scope, cryptoImpl = globalThis.crypto) {
  const record = await encryptQueuedClientMessage(payload, token, scope, cryptoImpl)
  const database = await openDatabase()
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const read = store.getAll()
      let failure = null
      read.onsuccess = () => {
        const scoped = read.result.filter(item => item.scope === record.scope)
        if (scoped.some(item => item.id === record.id)) { failure = new Error('Dit bericht staat al in de offline wachtrij.'); transaction.abort(); return }
        const totalBytes = scoped.reduce((sum, item) => sum + Number(item.sizeBytes || 0), record.sizeBytes)
        if (scoped.length >= MAX_MESSAGES || totalBytes > MAX_TOTAL_BYTES) { failure = new Error('De offline klantberichtenwachtrij is vol. Maak eerst verbinding en synchroniseer of verwijder een lokaal bericht.'); transaction.abort(); return }
        store.add(record)
      }
      read.onerror = () => { failure = read.error || new Error('De offline klantberichtenwachtrij kan niet worden gelezen.'); transaction.abort() }
      transaction.oncomplete = resolve
      transaction.onabort = () => reject(failure || transaction.error || new Error('Het offline klantbericht kon niet worden bewaard.'))
      transaction.onerror = () => reject(failure || transaction.error || new Error('Het offline klantbericht kon niet worden bewaard.'))
    })
  } finally { database.close() }
  return { id: record.id, createdAt: record.createdAt, expiresAt: record.expiresAt }
}

export async function listClientMessages(token, scope, cryptoImpl = globalThis.crypto) {
  const database = await openDatabase()
  let records
  try {
    records = await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readonly')
      const request = transaction.objectStore(STORE_NAME).getAll()
      request.onsuccess = () => resolve(request.result.filter(item => item.scope === scope).sort((left, right) => left.createdAt.localeCompare(right.createdAt)))
      request.onerror = () => reject(request.error || new Error('De offline klantberichtenwachtrij kan niet worden gelezen.'))
    })
  } finally { database.close() }
  return Promise.all(records.map(async record => ({ ...await decryptQueuedClientMessage(record, token, cryptoImpl), id: record.id })))
}

export async function removeClientMessage(id) {
  const database = await openDatabase()
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, 'readwrite')
      transaction.objectStore(STORE_NAME).delete(String(id))
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error || new Error('Het offline klantbericht kon niet worden verwijderd.'))
      transaction.onabort = () => reject(transaction.error || new Error('Het offline klantbericht kon niet worden verwijderd.'))
    })
  } finally { database.close() }
}

export async function saveClientSnapshot(kind, value, token, scope, cryptoImpl = globalThis.crypto) {
  if (!['portal', 'conversation'].includes(kind)) throw new Error('Onbekend type klantmomentopname.')
  const normalizedScope = String(scope || '')
  if (!normalizedScope || normalizedScope.length > 240) throw new Error('De klanttoegang kan niet veilig aan deze lokale momentopname worden gekoppeld.')
  const plaintext = new TextEncoder().encode(JSON.stringify(value))
  if (plaintext.length > MAX_SNAPSHOT_BYTES) throw new Error('De lokale klantmomentopname is groter dan 2 MB en wordt niet bewaard.')
  const crypto = requireCrypto(cryptoImpl), id = `${normalizedScope}:${kind}`
  const iv = crypto.getRandomValues(new Uint8Array(12)), key = await deriveKey(token, crypto)
  const aad = new TextEncoder().encode(`${SNAPSHOT_FORMAT}:${normalizedScope}:${id}`)
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, key, plaintext)
  const record = { id, scope: normalizedScope, kind, format: SNAPSHOT_FORMAT, iv: [...iv], ciphertext, updatedAt: new Date().toISOString(), expiresAt: Date.now() + RETENTION_MS }
  const database = await openDatabase()
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(SNAPSHOT_STORE_NAME, 'readwrite')
      transaction.objectStore(SNAPSHOT_STORE_NAME).put(record)
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error || new Error('De beveiligde klantmomentopname kon niet worden bewaard.'))
      transaction.onabort = () => reject(transaction.error || new Error('De beveiligde klantmomentopname kon niet worden bewaard.'))
    })
  } finally { database.close() }
  return { updatedAt: record.updatedAt, expiresAt: record.expiresAt }
}

export async function readClientSnapshot(kind, token, scope, cryptoImpl = globalThis.crypto, now = Date.now()) {
  if (!['portal', 'conversation'].includes(kind)) throw new Error('Onbekend type klantmomentopname.')
  const normalizedScope = String(scope || ''), id = `${normalizedScope}:${kind}`
  const database = await openDatabase()
  let record
  try {
    record = await new Promise((resolve, reject) => {
      const transaction = database.transaction(SNAPSHOT_STORE_NAME, 'readonly')
      const request = transaction.objectStore(SNAPSHOT_STORE_NAME).get(id)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error || new Error('De lokale klantmomentopname kan niet worden gelezen.'))
    })
  } finally { database.close() }
  if (!record) return null
  if (record.format !== SNAPSHOT_FORMAT || record.scope !== normalizedScope || record.kind !== kind) throw new Error('De lokale klantmomentopname is ongeldig.')
  if (record.expiresAt <= now) { await removeClientSnapshot(kind, scope); return null }
  const crypto = requireCrypto(cryptoImpl), key = await deriveKey(token, crypto)
  const aad = new TextEncoder().encode(`${SNAPSHOT_FORMAT}:${normalizedScope}:${id}`)
  const plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: Uint8Array.from(record.iv), additionalData: aad }, key, record.ciphertext)
  return { value: JSON.parse(new TextDecoder().decode(plaintext)), updatedAt: record.updatedAt, expiresAt: record.expiresAt }
}

export async function removeClientSnapshot(kind, scope) {
  if (!['portal', 'conversation'].includes(kind)) throw new Error('Onbekend type klantmomentopname.')
  const database = await openDatabase()
  try {
    await new Promise((resolve, reject) => {
      const transaction = database.transaction(SNAPSHOT_STORE_NAME, 'readwrite')
      transaction.objectStore(SNAPSHOT_STORE_NAME).delete(`${String(scope || '')}:${kind}`)
      transaction.oncomplete = resolve
      transaction.onerror = () => reject(transaction.error || new Error('De lokale klantmomentopname kon niet worden verwijderd.'))
      transaction.onabort = () => reject(transaction.error || new Error('De lokale klantmomentopname kon niet worden verwijderd.'))
    })
  } finally { database.close() }
}

export const CLIENT_MESSAGE_OUTBOX_LIMITS = Object.freeze({ maxMessages: MAX_MESSAGES, maxTotalBytes: MAX_TOTAL_BYTES, maxPhotoBytes: MAX_PHOTO_BYTES, maxSnapshotBytes: MAX_SNAPSHOT_BYTES, retentionMs: RETENTION_MS })
