import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ClientConversationInbox from '../components/ClientConversationInbox'

let hidden, online
const empty = { messages: [], unreadCount: 0, truncated: false }
const message = { messageId: 'm1', jobId: 'j1', accessId: 'a1', clientName: 'Klantnaam', jobTitle: 'Deurmontage', createdAt: '2026-10-02T08:00:00Z' }
function pending() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}
const settle = async callback => { await act(async () => { callback?.(); await Promise.resolve() }) }
beforeEach(() => {
  vi.useFakeTimers()
  hidden = false; online = true
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden)
  vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online)
})
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

it('retains bounded read-only messages, locale and the exact opening target', async () => {
  const api = vi.fn().mockResolvedValue({ messages: [message], unreadCount: 51, truncated: true }), onOpen = vi.fn()
  const view = render(<ClientConversationInbox api={api} locale="nl-NL" onOpen={onOpen} />)
  await settle()
  expect(api).toHaveBeenCalledOnce()
  expect(api.mock.calls[0][0]).toBe('/api/ledger/client-conversations/inbox?limit=50')
  expect(api.mock.calls[0][1].signal.aborted).toBe(false)
  expect(screen.getByText('51 niet bekeken')).toBeTruthy()
  expect(screen.getByText('Er zijn meer berichten; de lijst toont de 50 nieuwste.')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Klantnaam/ }))
  expect(onOpen).toHaveBeenCalledWith(message)
  view.rerender(<ClientConversationInbox api={api} locale="en-GB" onOpen={onOpen} />)
  expect(screen.getByRole('heading', { name: 'Client messages' })).toBeTruthy()
  expect(api).toHaveBeenCalledOnce()
})

it('never overlaps slow reads and waits thirty seconds after completion', async () => {
  const read = pending(), api = vi.fn().mockReturnValueOnce(read.promise).mockResolvedValue(empty)
  render(<ClientConversationInbox api={api} locale="nl-NL" />)
  await act(async () => { await vi.advanceTimersByTimeAsync(90000) })
  fireEvent(document, new Event('visibilitychange'))
  fireEvent(window, new Event('online'))
  expect(api).toHaveBeenCalledOnce()
  await settle(() => read.resolve(empty))
  await act(async () => { await vi.advanceTimersByTimeAsync(29999) })
  expect(api).toHaveBeenCalledOnce()
  await act(async () => { await vi.advanceTimersByTimeAsync(1) })
  expect(api).toHaveBeenCalledTimes(2)
})

it('aborts a hidden read and ignores its late reply after returning', async () => {
  const first = pending(), second = pending(), api = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
  render(<ClientConversationInbox api={api} locale="nl-NL" />)
  hidden = true; fireEvent(document, new Event('visibilitychange'))
  expect(api.mock.calls[0][1].signal.aborted).toBe(true)
  await act(async () => { await vi.advanceTimersByTimeAsync(90000) })
  expect(api).toHaveBeenCalledOnce()
  hidden = false; fireEvent(document, new Event('visibilitychange'))
  expect(api).toHaveBeenCalledTimes(2)
  await settle(() => second.resolve({ messages: [message], unreadCount: 1, truncated: false }))
  await settle(() => first.resolve(empty))
  expect(screen.getByText('1 niet bekeken')).toBeTruthy()
})

it('stops settled polling while offline and obtains fresh data on reconnection', async () => {
  const api = vi.fn().mockResolvedValue(empty)
  render(<ClientConversationInbox api={api} locale="nl-NL" />)
  await settle()
  online = false; fireEvent(window, new Event('offline'))
  await act(async () => { await vi.advanceTimersByTimeAsync(90000) })
  expect(api).toHaveBeenCalledOnce()
  online = true; fireEvent(window, new Event('online'))
  await settle()
  expect(api).toHaveBeenCalledTimes(2)
})

it.each(['hidden', 'offline'])('does not make an initial read while %s', async state => {
  hidden = state === 'hidden'; online = state !== 'offline'
  const api = vi.fn().mockResolvedValue(empty)
  render(<ClientConversationInbox api={api} locale="nl-NL" />)
  await act(async () => { await vi.advanceTimersByTimeAsync(90000) })
  expect(api).not.toHaveBeenCalled()
  hidden = false; online = true
  fireEvent(document, new Event('visibilitychange')); fireEvent(window, new Event('online'))
  await settle()
  expect(api).toHaveBeenCalledOnce()
})

it('retries a failed read without discarding retained unread messages', async () => {
  const api = vi.fn().mockResolvedValueOnce({ messages: [message], unreadCount: 1, truncated: false })
    .mockRejectedValueOnce(new Error('Geen verbinding')).mockResolvedValue(empty)
  render(<ClientConversationInbox api={api} locale="nl-NL" />)
  await settle()
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(screen.getByText('Klantnaam')).toBeTruthy()
  expect(screen.getByRole('alert').textContent).toBe('Geen verbinding')
  await act(async () => { await vi.advanceTimersByTimeAsync(30000) })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByText('Klantnaam')).toBeNull()
})

it('aborts replaced APIs and unmounted reads without installing new timers', async () => {
  const first = pending(), second = pending(), api = vi.fn().mockReturnValue(first.promise), nextApi = vi.fn().mockReturnValue(second.promise)
  const view = render(<ClientConversationInbox api={api} locale="nl-NL" />)
  view.rerender(<ClientConversationInbox api={nextApi} locale="nl-NL" />)
  expect(api.mock.calls[0][1].signal.aborted).toBe(true)
  await settle(() => first.reject(new Error('Oud antwoord')))
  expect(screen.queryByRole('alert')).toBeNull()
  view.unmount()
  expect(nextApi.mock.calls[0][1].signal.aborted).toBe(true)
  await settle(() => second.resolve(empty))
  await act(async () => { await vi.advanceTimersByTimeAsync(90000) })
  fireEvent(document, new Event('visibilitychange')); fireEvent(window, new Event('online'))
  expect(api).toHaveBeenCalledOnce(); expect(nextApi).toHaveBeenCalledOnce()
  expect(vi.getTimerCount()).toBe(0)
})
