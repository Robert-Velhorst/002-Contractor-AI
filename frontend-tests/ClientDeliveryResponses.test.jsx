import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import ClientDeliveryResponses from '../components/ClientDeliveryResponses'
import { companyFetch } from '../company-request.mjs'
vi.mock('../company-request.mjs', () => ({ companyFetch: vi.fn() }))
vi.mock('../components/ConversationPhoto', () => ({ default: () => null }))
beforeEach(() => {
  companyFetch.mockReset()
  if (!File.prototype.arrayBuffer) Object.defineProperty(File.prototype, 'arrayBuffer', { configurable: true, value() {
    return new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsArrayBuffer(this) })
  } })
  Object.defineProperty(window.crypto, 'subtle', { configurable: true, value: { digest: async (_algorithm, input) => {
    const bytes = new Uint8Array(input), digest = new Uint8Array(32)
    bytes.forEach((byte, index) => { digest[index % digest.length] = (digest[index % digest.length] * 31 + byte + index) & 255 })
    return digest.buffer
  } } })
})
const offer = { id: 'o', sourceHash: 'retained', title: 'Eerste deur', scope: 'Tweede deur uitgesloten', version: 1, state: 'available', expiresAt: '2099-01-01T00:00:00Z', responseAllowed: true,
  quantities: [{ description: 'Deur', quantity: 1, unit: 'st' }], tasks: [], photos: [], coverageStatus: 'not_configured', response: null }
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } })
async function draft() {
  await userEvent.selectOptions(await screen.findByLabelText('Reactie', { exact: true }), 'accepted_with_reservations')
  await userEvent.type(screen.getByLabelText('Uw naam'), 'Klantnaam')
  await userEvent.type(screen.getByLabelText('Toelichting en eventuele voorbehouden'), 'Kras nog herstellen')
  await userEvent.click(screen.getByRole('checkbox'))
}
it('submits scoped client response and refreshes the connected conversation only after receipt', async () => {
  const onResponse = vi.fn(); let received = false
  companyFetch.mockImplementation(async (_, options) => { if (options.method === 'POST') { received = true; return json({ response: { id: 'response' } }) }
    return json({ offers: [{ ...offer, response: received ? { status: 'pending_review', outcome: 'accepted_with_reservations', respondent: 'Klantnaam', note: 'Kras nog herstellen', photos: [] } : null }] }) })
  render(<ClientDeliveryResponses token="scoped-token" onResponse={onResponse} />)
  await draft(); await userEvent.click(screen.getByRole('button', { name: 'Reactie versturen' }))
  await screen.findByText('Reactie ter beoordeling'); expect(onResponse).toHaveBeenCalledTimes(1)
  expect(screen.getByText('Beantwoord')).toBeTruthy(); expect(screen.queryByText('Reactie mogelijk')).toBeNull()
  const [url, options] = companyFetch.mock.calls.find(([, options]) => options.method === 'POST')
  expect(url).toBe('/api/client-portal/deliveries/o/responses'); expect(options.headers.Authorization).toBe('Bearer scoped-token')
  expect(JSON.parse(options.body)).toMatchObject({ sourceHash: 'retained', outcome: 'accepted_with_reservations', authorityConfirmed: true, photoIds: [] })
})
it('retries an uncertain customer response exactly without uploading an acknowledged photo twice', async () => {
  let failed = true
  companyFetch.mockImplementation(async (url, options) => {
    if (options.method !== 'POST') return json({ offers: [offer] })
    if (url.endsWith('/messages')) return json({ message: { id: 'photo' } })
    if (failed) { failed = false; throw new Error('Verbinding onderbroken') }
    return json({ response: { id: 'response' } })
  })
  render(<ClientDeliveryResponses token="scoped-token" />); await draft()
  await userEvent.upload(screen.getByLabelText('Foto bij reactie (max. 5 MB)'), new File(['fixture'], 'detail.png', { type: 'image/png' }))
  await userEvent.click(screen.getByRole('button', { name: 'Reactie versturen' })); await screen.findByText('Verbinding onderbroken')
  expect(screen.getByLabelText('Uw naam').matches(':disabled')).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Dezelfde reactie opnieuw controleren' }))
  await waitFor(() => expect(companyFetch.mock.calls.filter(([url, options]) => options.method === 'POST' && url.endsWith('/responses'))).toHaveLength(2))
  const replies = companyFetch.mock.calls.filter(([url, options]) => options.method === 'POST' && url.endsWith('/responses'))
  expect(replies[0][1].body).toBe(replies[1][1].body); expect(JSON.parse(replies[0][1].body).photoIds).toEqual(['photo'])
  expect(companyFetch.mock.calls.filter(([url]) => url.endsWith('/messages'))).toHaveLength(1)
})
it('freezes uncertain photo bytes, entry key and caption even when language changes', async () => {
  let failed = true
  companyFetch.mockImplementation(async (url, options) => {
    if (options.method !== 'POST') return json({ offers: [offer] })
    if (url.endsWith('/messages') && failed) { failed = false; throw new Error('Upload onbekend') }
    return json(url.endsWith('/messages') ? { message: { id: 'photo' } } : { response: { id: 'response' } })
  })
  const { rerender } = render(<ClientDeliveryResponses token="scoped-token" />); await draft()
  await userEvent.upload(screen.getByLabelText('Foto bij reactie (max. 5 MB)'), new File(['fixture'], 'detail.png', { type: 'image/png' }))
  await userEvent.click(screen.getByRole('button', { name: 'Reactie versturen' })); await screen.findByText('Upload onbekend')
  rerender(<ClientDeliveryResponses token="scoped-token" locale="en-GB" />)
  await userEvent.click(screen.getByRole('button', { name: 'Check the same response again' }))
  await waitFor(() => expect(companyFetch.mock.calls.filter(([url]) => url.endsWith('/messages'))).toHaveLength(2))
  const uploads = companyFetch.mock.calls.filter(([url]) => url.endsWith('/messages'))
  for (const key of ['entryKey', 'body', 'evidenceFile']) expect(uploads[0][1].body.get(key)).toBe(uploads[1][1].body.get(key))
})
it('preserves a mounted client draft when access expires and escapes server text', async () => {
  let revoked = false
  companyFetch.mockImplementation(async () => revoked ? json({ error: { message: 'Toegang ingetrokken' } }, 403) : json({ offers: [{ ...offer, scope: '<img src=x onerror=alert(1)>' }] }))
  render(<ClientDeliveryResponses token="scoped-token" />); await draft()
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy(); expect(document.querySelector('img')).toBeNull()
  revoked = true; await userEvent.click(screen.getByRole('button', { name: 'Aangeboden werk verversen' }))
  await screen.findByText('Toegang ingetrokken'); expect(screen.getByLabelText('Uw naam').value).toBe('Klantnaam'); expect(screen.getByLabelText('Uw naam').matches(':disabled')).toBe(true)
  expect(companyFetch.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false)
})
it('restores the same offer draft only for the same client link after remount', async () => {
  let currentOffer = offer
  companyFetch.mockImplementation(async () => json({ offers: [currentOffer] }))
  const first = render(<ClientDeliveryResponses token="same-scoped-client-link" />)
  await draft(); window.dispatchEvent(new Event('pagehide')); first.unmount()
  const restored = render(<ClientDeliveryResponses token="same-scoped-client-link" />)
  await waitFor(() => expect(screen.getByLabelText('Uw naam').value).toBe('Klantnaam'))
  expect(screen.getByLabelText('Toelichting en eventuele voorbehouden').value).toBe('Kras nog herstellen')
  restored.unmount()
  currentOffer = { ...offer, sourceHash: 'new-source-version' }
  const changedSource = render(<ClientDeliveryResponses token="same-scoped-client-link" />)
  await waitFor(() => expect(screen.getByLabelText('Uw naam').value).toBe(''))
  changedSource.unmount()
  const second = render(<ClientDeliveryResponses token="different-client-link" />)
  await waitFor(() => expect(screen.getByLabelText('Uw naam').value).toBe(''))
  second.unmount()
})
it('retries an uncertain response across remount using the exact retained command', async () => {
  let responseCalls = 0
  companyFetch.mockImplementation(async (url, options) => {
    if (options.method !== 'POST') return json({ offers: [offer] })
    if (url.endsWith('/messages')) return json({ message: { id: 'retained-photo' } })
    responseCalls += 1
    if (responseCalls === 1) throw new Error('Verbinding onderbroken')
    return json({ response: { id: 'response' } })
  })
  const first = render(<ClientDeliveryResponses token="same-scoped-client-link" />)
  await draft()
  await userEvent.upload(screen.getByLabelText('Foto bij reactie (max. 5 MB)'), new File(['fixture'], 'detail.png', { type: 'image/png' }))
  await userEvent.click(screen.getByRole('button', { name: 'Reactie versturen' }))
  await screen.findByText('Verbinding onderbroken'); window.dispatchEvent(new Event('pagehide')); first.unmount()
  render(<ClientDeliveryResponses token="same-scoped-client-link" />)
  await userEvent.click(await screen.findByRole('button', { name: 'Dezelfde reactie opnieuw controleren' }))
  await waitFor(() => expect(responseCalls).toBe(2))
  const replies = companyFetch.mock.calls.filter(([url, options]) => options.method === 'POST' && url.endsWith('/responses'))
  expect(replies).toHaveLength(2); expect(replies[0][1].body).toBe(replies[1][1].body)
  expect(JSON.parse(replies[1][1].body).photoIds).toEqual(['retained-photo'])
  expect(companyFetch.mock.calls.filter(([url]) => url.endsWith('/messages'))).toHaveLength(1)
})
it('requires the exact original photo before retrying an uncertain upload after remount', async () => {
  let uploadCalls = 0
  companyFetch.mockImplementation(async (url, options) => {
    if (options.method !== 'POST') return json({ offers: [offer] })
    if (url.endsWith('/messages')) {
      uploadCalls += 1
      if (uploadCalls === 1) throw new Error('Upload onbekend')
      return json({ message: { id: 'retained-photo' } })
    }
    return json({ response: { id: 'response' } })
  })
  const original = new File(['original photo'], 'detail.png', { type: 'image/png' })
  const first = render(<ClientDeliveryResponses token="same-scoped-client-link" />); await draft()
  await userEvent.upload(screen.getByLabelText('Foto bij reactie (max. 5 MB)'), original)
  await userEvent.click(screen.getByRole('button', { name: 'Reactie versturen' })); await screen.findByText('Upload onbekend')
  window.dispatchEvent(new Event('pagehide'))
  const savedDraft = Array.from({ length: window.sessionStorage.length }, (_, index) => window.sessionStorage.getItem(window.sessionStorage.key(index))).join('\n')
  expect(savedDraft).not.toContain('same-scoped-client-link'); expect(savedDraft).not.toContain('original photo')
  expect(savedDraft).toContain('"hasPhoto":true')
  expect(savedDraft).toContain('"photoSha256":')
  first.unmount()
  render(<ClientDeliveryResponses token="same-scoped-client-link" />)
  const retry = await screen.findByRole('button', { name: 'Dezelfde reactie opnieuw controleren' })
  expect(retry.matches(':disabled')).toBe(true)
  const photoPicker = screen.getByLabelText('Selecteer dezelfde foto voor de onzekere upload')
  await userEvent.upload(photoPicker, new File(['different photo'], 'detail.png', { type: 'image/png' }))
  expect(await screen.findByText('Dit is niet dezelfde foto. Kies het oorspronkelijk geselecteerde bestand.')).toBeTruthy()
  expect(uploadCalls).toBe(1)
  await userEvent.upload(photoPicker, original)
  await waitFor(() => expect(screen.getByRole('button', { name: 'Dezelfde reactie opnieuw controleren' }).matches(':disabled')).toBe(false))
  await userEvent.click(screen.getByRole('button', { name: 'Dezelfde reactie opnieuw controleren' }))
  await waitFor(() => expect(uploadCalls).toBe(2))
  const uploads = companyFetch.mock.calls.filter(([url]) => url.endsWith('/messages'))
  expect(uploads[0][1].body.get('entryKey')).toBe(uploads[1][1].body.get('entryKey'))
  expect(uploads[0][1].body.get('body')).toBe(uploads[1][1].body.get('body'))
})
