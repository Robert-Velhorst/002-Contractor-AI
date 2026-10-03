import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ClientDeliveryResponses from '../components/ClientDeliveryResponses'
import { companyFetch } from '../company-request.mjs'
import { DRAFT_STORAGE_PREFIX } from '../draft-recovery'

const photoWork = vi.hoisted(() => ({ renders: 0 }))
vi.mock('../company-request.mjs', () => ({ companyFetch: vi.fn() }))
vi.mock('../conversation-photo-reader.mjs', () => ({ readConversationPhoto: vi.fn() }))
vi.mock('../conversation-photo-visibility.mjs', () => ({
  observeConversationPhoto: vi.fn(() => { photoWork.renders++; return () => {} }),
  prioritizeConversationPhoto: vi.fn(),
}))

beforeEach(() => { companyFetch.mockReset(); photoWork.renders = 0 })
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks() })

const retainedOffer = (photos = []) => ({ id: 'offer', sourceHash: 'current', title: 'Retained door',
  scope: 'Only this door', version: 1, state: 'available', expiresAt: '2099-01-01T00:00:00Z',
  responseAllowed: true, quantities: [], tasks: [], photos, coverageStatus: 'not_configured', response: null })
const result = offers => ({ ok: true, json: async () => ({ offers }) })

it('does not reread retained photo labels while typing a customer response', async () => {
  let reads = 0
  const photos = Array.from({ length: 40 }, (_, index) => ({ id: `photo-${index}`,
    get filename() { reads++; return `retained-${index}.png` } }))
  companyFetch.mockResolvedValue(result([retainedOffer(photos)]))
  render(<ClientDeliveryResponses token="scoped-photo-reader" />)
  await screen.findByRole('button', { name: 'Foto laden: retained-39.png', exact: true })
  await waitFor(() => expect(photoWork.renders).toBe(photos.length))
  const before = reads, requestCount = companyFetch.mock.calls.length, leases = photoWork.renders
  await userEvent.type(screen.getByLabelText('Uw naam'), 'Retained customer')
  await userEvent.type(screen.getByLabelText('Toelichting en eventuele voorbehouden'), 'Check this exact door')
  expect(reads).toBe(before)
  expect(companyFetch).toHaveBeenCalledTimes(requestCount)
  expect(photoWork.renders).toBe(leases)
  expect(screen.getByLabelText('Uw naam').value).toBe('Retained customer')
  expect(companyFetch.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false)
  console.log(JSON.stringify({ retainedClientPhotoTyping: { photos: photos.length, before, after: reads,
    additionalPhotoLabelReads: reads - before, typedCharacters: 38, inputWrites: 0 } }))
})

it('updates fresh photo lists and language while retaining the customer draft', async () => {
  let offers = [retainedOffer([{ id: 'first', filename: 'original.png' }])]
  companyFetch.mockImplementation(async () => result(offers))
  const { rerender } = render(<ClientDeliveryResponses token="scoped-photo-reader" />)
  await screen.findByRole('button', { name: 'Foto laden: original.png', exact: true })
  await userEvent.type(screen.getByLabelText('Uw naam'), 'Kept draft')
  rerender(<ClientDeliveryResponses token="scoped-photo-reader" locale="en-GB" />)
  expect(screen.getByRole('button', { name: 'Load photo: original.png', exact: true })).toBeTruthy()
  offers = [retainedOffer([{ id: 'second', filename: 'fresh.png' }])]
  await userEvent.click(screen.getByRole('button', { name: 'Refresh offered work' }))
  await screen.findByRole('button', { name: 'Load photo: fresh.png', exact: true })
  expect(screen.queryByRole('button', { name: 'Load photo: original.png', exact: true })).toBeNull()
  await waitFor(() => expect(screen.getByLabelText('Your name').value).toBe('Kept draft'))
  expect(companyFetch.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false)
})

it('batches ordinary customer input but pagehide retains the exact latest draft immediately', async () => {
  companyFetch.mockResolvedValue(result([retainedOffer()]))
  const firstRender = render(<ClientDeliveryResponses token="scoped-photo-reader" />)
  const name = await screen.findByLabelText('Uw naam')
  const storageWrite = vi.spyOn(Storage.prototype, 'setItem')
  const storageRead = vi.spyOn(Storage.prototype, 'getItem')
  vi.useFakeTimers()
  for (const [input, text] of [[name, 'Exact final customer draft'],
    [screen.getByLabelText('Toelichting en eventuele voorbehouden'), 'Retain after interrupted navigation']]) {
    for (let index = 1; index <= text.length; index++) fireEvent.change(input, { target: { value: text.slice(0, index) } })
  }
  expect(storageWrite).not.toHaveBeenCalled()
  expect(storageRead).not.toHaveBeenCalled()
  act(() => window.dispatchEvent(new Event('pagehide')))
  const writes = storageWrite.mock.calls.filter(([key]) => key.startsWith(DRAFT_STORAGE_PREFIX))
  expect(writes).toHaveLength(1)
  expect(JSON.parse(writes[0][1]).value).toMatchObject({ respondent: 'Exact final customer draft', note: 'Retain after interrupted navigation', pendingAttempt: null })
  expect(writes[0][1]).not.toContain('scoped-photo-reader')
  console.log(JSON.stringify({ customerDraftWork: { typedCharacters: name.value.length + screen.getByLabelText('Toelichting en eventuele voorbehouden').value.length,
    inputWrites: 0, inputInventoryReads: 0, pagehideWrites: writes.length } }))
  firstRender.unmount()
  vi.useRealTimers()
  render(<ClientDeliveryResponses token="scoped-photo-reader" />)
  await waitFor(() => expect(screen.getByLabelText('Uw naam').value).toBe('Exact final customer draft'))
  expect(screen.getByLabelText('Toelichting en eventuele voorbehouden').value).toBe('Retain after interrupted navigation')
  expect(companyFetch.mock.calls.some(([, options]) => options.method === 'POST')).toBe(false)
})

it('automatically saves ordinary customer input once after the shared quiet interval', async () => {
  companyFetch.mockResolvedValue(result([retainedOffer()]))
  render(<ClientDeliveryResponses token="scoped-photo-reader" />)
  const name = await screen.findByLabelText('Uw naam'), storageWrite = vi.spyOn(Storage.prototype, 'setItem')
  vi.useFakeTimers()
  for (const value of ['A', 'Al', 'Ali', 'Alice']) fireEvent.change(name, { target: { value } })
  expect(storageWrite).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(179))
  expect(storageWrite).not.toHaveBeenCalled()
  act(() => vi.advanceTimersByTime(1))
  expect(storageWrite).toHaveBeenCalledTimes(1)
  expect(JSON.parse(storageWrite.mock.calls[0][1]).value.respondent).toBe('Alice')
  act(() => vi.advanceTimersByTime(1000))
  expect(storageWrite).toHaveBeenCalledTimes(1)
})
