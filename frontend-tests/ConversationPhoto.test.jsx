import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ConversationPhoto from '../components/ConversationPhoto'
import ClientConversationInbox from '../components/ClientConversationInbox'
import { ConversationPhoto as compatiblePhoto, ClientConversationInbox as compatibleInbox } from '../components/Conversation'

const props = { base: '/api/client-portal/conversation', token: 'scoped-photo-token', message: { id: 'photo /1' }, label: 'Deurdetail' }
let createUrl, revokeUrl
beforeEach(() => {
  createUrl = vi.fn().mockReturnValue('blob:local-photo')
  revokeUrl = vi.fn()
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl })
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('keeps existing named imports compatible with the independent components', () => {
  expect(compatiblePhoto).toBe(ConversationPhoto)
  expect(compatibleInbox).toBe(ClientConversationInbox)
})

it('loads scoped bytes without public evidence URLs and revokes their object URL', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(new Blob(['photo'], { type: 'image/png' })))
  vi.stubGlobal('fetch', fetch)
  const view = render(<ConversationPhoto {...props} />)
  const image = await screen.findByRole('img', { name: 'Deurdetail' })
  expect(fetch.mock.calls[0][0]).toBe('/api/client-portal/conversation/messages/photo%20%2F1/photo?preview=1')
  expect(new Headers(fetch.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer scoped-photo-token')
  expect(image.getAttribute('src')).toBe('blob:local-photo')
  expect(screen.getByRole('link').getAttribute('rel')).toBe('noreferrer')
  view.unmount()
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
  expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:local-photo')
})

it('does not create a URL for bytes received after unmount', async () => {
  let resolve
  vi.stubGlobal('fetch', vi.fn(() => new Promise(yes => { resolve = yes })))
  const view = render(<ConversationPhoto {...props} />)
  view.unmount()
  await act(async () => { resolve(new Response(new Blob(['late']))); await Promise.resolve() })
  expect(createUrl).not.toHaveBeenCalled()
})

it('aborts obsolete message reads and hides their late errors', async () => {
  let reject
  const fetch = vi.fn().mockReturnValueOnce(new Promise((_yes, no) => { reject = no }))
    .mockResolvedValue(new Response(new Blob(['current'])))
  vi.stubGlobal('fetch', fetch)
  const view = render(<ConversationPhoto {...props} />)
  view.rerender(<ConversationPhoto {...props} message={{ id: 'new-photo' }} />)
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
  await act(async () => { reject(new Error('Oude foto mislukt')); await Promise.resolve() })
  await screen.findByRole('img')
  expect(screen.queryByRole('alert')).toBeNull()
  expect(createUrl).toHaveBeenCalledOnce()
})

it('shows a denied scoped read without constructing an image URL', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Geen toegang tot deze foto' } }), { status: 403 })))
  render(<ConversationPhoto {...props} />)
  expect((await screen.findByRole('alert')).textContent).toBe('Geen toegang tot deze foto')
  expect(createUrl).not.toHaveBeenCalled()
})

it('revokes old bytes before loading a different scope or token', async () => {
  const fetch = vi.fn().mockImplementation(async () => new Response(new Blob(['photo'])))
  vi.stubGlobal('fetch', fetch)
  const view = render(<ConversationPhoto {...props} />)
  await screen.findByRole('img')
  view.rerender(<ConversationPhoto {...props} base="/api/ledger/jobs/j/conversations/a" token={undefined} />)
  expect(revokeUrl).toHaveBeenCalledWith('blob:local-photo')
  await screen.findByRole('img')
  expect(new Headers(fetch.mock.calls[1][1].headers).has('Authorization')).toBe(false)
})

it('fetches the original only on explicit download, preserves the preview and releases download bytes', async () => {
  createUrl.mockReturnValueOnce('blob:preview').mockReturnValueOnce('blob:original')
  const fetch = vi.fn().mockImplementation(async () => new Response(new Blob(['photo'])))
  vi.stubGlobal('fetch', fetch)
  const downloads = []
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () { downloads.push({ href: this.href, name: this.download }) })
  const view = render(<ConversationPhoto {...props} locale="en-GB" />)
  const image = await screen.findByRole('img')
  expect(fetch).toHaveBeenCalledOnce()
  vi.useFakeTimers()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Download original: Deurdetail' })) })
  expect(fetch.mock.calls[1][0]).toBe('/api/client-portal/conversation/messages/photo%20%2F1/photo')
  expect(new Headers(fetch.mock.calls[1][1].headers).get('Authorization')).toBe('Bearer scoped-photo-token')
  expect(downloads).toEqual([{ href: 'blob:original', name: 'Deurdetail' }])
  expect(image.getAttribute('src')).toBe('blob:preview')
  expect(revokeUrl).not.toHaveBeenCalled()
  act(() => { vi.advanceTimersByTime(1000) })
  expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:original')
  view.unmount()
  expect(revokeUrl).toHaveBeenCalledWith('blob:preview')
})

it('aborts an original download on unmount without allocating late bytes', async () => {
  let resolve
  const fetch = vi.fn().mockResolvedValueOnce(new Response(new Blob(['preview'])))
    .mockImplementationOnce(() => new Promise(yes => { resolve = yes }))
  vi.stubGlobal('fetch', fetch)
  const view = render(<ConversationPhoto {...props} />)
  await screen.findByRole('img')
  fireEvent.click(screen.getByRole('button', { name: 'Origineel downloaden: Deurdetail' }))
  expect(screen.getByRole('button').disabled).toBe(true)
  view.unmount()
  expect(fetch.mock.calls[1][1].signal.aborted).toBe(true)
  await act(async () => { resolve(new Response(new Blob(['late original']))) })
  expect(createUrl).toHaveBeenCalledOnce()
})

it('retains the preview after a denied download and never constructs a download URL', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(new Blob(['preview'])))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Download revoked' } }), { status: 403 }))
  vi.stubGlobal('fetch', fetch)
  render(<ConversationPhoto {...props} />)
  await screen.findByRole('img')
  fireEvent.click(screen.getByRole('button'))
  expect((await screen.findByRole('alert')).textContent).toBe('Download revoked')
  expect(screen.getByRole('img').getAttribute('src')).toBe('blob:local-photo')
  expect(createUrl).toHaveBeenCalledOnce()
  expect(screen.getByRole('button').disabled).toBe(false)
})

it('an explicit photo retry keeps the scope and does not fetch original bytes', async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error('Busy'))
    .mockResolvedValueOnce(new Response(new Blob(['preview'])))
  vi.stubGlobal('fetch', fetch)
  render(<ConversationPhoto {...props} />)
  await screen.findByRole('alert')
  fireEvent.click(screen.getByRole('button', { name: 'Foto opnieuw laden' }))
  await screen.findByRole('img')
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls.every(([url]) => url.endsWith('/photo?preview=1'))).toBe(true)
  expect(new Headers(fetch.mock.calls[1][1].headers).get('Authorization')).toBe('Bearer scoped-photo-token')
  expect(screen.queryByRole('alert')).toBeNull()
})

it('keeps an explicit original download available for retained evidence whose preview is rejected', async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Legacy photo too large' } }), { status: 415 }))
    .mockResolvedValueOnce(new Response(new Blob(['retained original'])))
  vi.stubGlobal('fetch', fetch)
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  render(<ConversationPhoto {...props} />)
  await screen.findByRole('alert')
  expect(fetch).toHaveBeenCalledOnce()
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Origineel downloaden: Deurdetail' })) })
  expect(click).toHaveBeenCalledOnce()
  expect(fetch.mock.calls[1][0].endsWith('/photo')).toBe(true)
  expect(screen.getByRole('alert').textContent).toBe('Legacy photo too large')
})
