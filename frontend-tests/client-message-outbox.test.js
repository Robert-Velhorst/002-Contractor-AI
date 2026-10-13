import { webcrypto } from 'node:crypto'
import { expect, it } from 'vitest'
import { decryptQueuedClientMessage, encryptQueuedClientMessage, CLIENT_MESSAGE_OUTBOX_LIMITS } from '../client-message-outbox.mjs'

const token = 'high-entropy-client-portal-token-for-offline-test'
const scope = 'client-portal:verified-fingerprint:conversation'
const message = () => ({
  entryKey: 'same-entry-key-0001', body: 'De levering komt morgen?', replyTo: 'chat_previous', analysisOrigin: null,
  attachment: { name: 'detail.png', type: 'image/png', lastModified: 1234, size: 14, bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 1, 2, 3]) }
})

it('encrypts queued conversation text, reply reference and original photo bytes with token-bound scope', async () => {
  const payload = message()
  const sealed = await encryptQueuedClientMessage(payload, token, scope, webcrypto)
  expect(sealed.scope).toBe(scope)
  expect(sealed.ciphertext).not.toBeInstanceOf(Uint8Array)
  const raw = new TextDecoder().decode(sealed.ciphertext)
  expect(raw).not.toContain(token)
  expect(raw).not.toContain(payload.body)
  const opened = await decryptQueuedClientMessage(sealed, token, webcrypto)
  expect(opened.entryKey).toBe(payload.entryKey)
  expect(opened.body).toBe(payload.body)
  expect(opened.replyTo).toBe(payload.replyTo)
  expect([...opened.attachment.bytes]).toEqual([...payload.attachment.bytes])
})

it('fails closed when a different portal token or altered ciphertext is used', async () => {
  const sealed = await encryptQueuedClientMessage(message(), token, scope, webcrypto)
  await expect(decryptQueuedClientMessage(sealed, 'another-high-entropy-client-token-0000', webcrypto)).rejects.toThrow()
  const altered = { ...sealed, ciphertext: sealed.ciphertext.slice(0) }
  new Uint8Array(altered.ciphertext)[0] ^= 1
  await expect(decryptQueuedClientMessage(altered, token, webcrypto)).rejects.toThrow()
})

it('retains expired records for clear review but marks them unsendable', async () => {
  const sealed = await encryptQueuedClientMessage(message(), token, scope, webcrypto)
  const opened = await decryptQueuedClientMessage({ ...sealed, expiresAt: 1 }, token, webcrypto)
  expect(opened.expired).toBe(true)
})

it('bounds the offline message count and encrypted payload size', () => {
  expect(CLIENT_MESSAGE_OUTBOX_LIMITS).toMatchObject({ maxMessages: 10, maxTotalBytes: 20 * 1024 * 1024, maxPhotoBytes: 5 * 1024 * 1024, retentionMs: 7 * 24 * 60 * 60 * 1000 })
})
