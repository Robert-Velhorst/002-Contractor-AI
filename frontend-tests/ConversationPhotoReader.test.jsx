import { act } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { createPhotoReadQueue, readConversationPhoto } from '../conversation-photo-reader.mjs'

const deferred = () => { let resolve; const promise = new Promise(yes => { resolve = yes }); return { promise, resolve } }
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

it('keeps only two photo bodies in flight and prioritizes an explicit original download', async () => {
  const queue = createPhotoReadQueue(), gates = [], starts = []
  function action(id) { return () => { starts.push(id); const gate = deferred(); gates.push(gate); return gate.promise } }
  const signal = new AbortController().signal
  const first = queue.read(action('first'), signal), second = queue.read(action('second'), signal)
  const background = queue.read(action('background'), signal), original = queue.read(action('original'), signal, true)
  expect(starts).toEqual(['first', 'second'])
  expect(queue.stats()).toEqual({ active: 2, queued: 2 })
  gates[0].resolve('first'); await first
  expect(starts).toEqual(['first', 'second', 'original'])
  gates[1].resolve('second'); await second
  gates[2].resolve('original'); gates[3].resolve('background')
  await Promise.all([background, original])
  expect(queue.stats()).toEqual({ active: 0, queued: 0 })
})

it('removes an abandoned queued photo without fetching it or retaining its abort listener', async () => {
  const queue = createPhotoReadQueue(), gate = deferred(), signal = new AbortController().signal
  const active = [queue.read(() => gate.promise, signal), queue.read(() => gate.promise, signal)]
  const controller = new AbortController(), action = vi.fn()
  const abandoned = queue.read(action, controller.signal)
  const refused = expect(abandoned).rejects.toHaveProperty('name', 'AbortError')
  controller.abort(); await refused
  expect(action).not.toHaveBeenCalled()
  expect(queue.stats().queued).toBe(0)
  gate.resolve('done'); await Promise.all(active)
  expect(queue.stats().active).toBe(0)
})

it('bounds the pending queue and releases capacity even when an active read fails', async () => {
  const queue = createPhotoReadQueue(), gate = deferred(), signal = new AbortController().signal
  const active = [queue.read(() => gate.promise, signal), queue.read(() => gate.promise, signal)]
  const queued = Array.from({ length: 64 }, () => queue.read(async () => 'photo', signal))
  await expect(queue.read(vi.fn(), signal)).rejects.toThrow('queue is full')
  expect(queue.stats()).toEqual({ active: 2, queued: 64 })
  gate.resolve('done'); await Promise.all([...active, ...queued])
  await expect(queue.read(async () => { throw new Error('read failed') }, signal)).rejects.toThrow('read failed')
  expect(queue.stats()).toEqual({ active: 0, queued: 0 })
})

it('retries only the transient image-processing admission error, retaining the private scope', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ error: { code: 'image_processing_busy', message: 'Busy' } }), { status: 503 }))
    .mockResolvedValueOnce(new Response(new Blob(['private preview'])))
  vi.stubGlobal('fetch', fetch)
  const signal = new AbortController().signal
  const reading = readConversationPhoto('/api/client-portal/conversation', 'private-token', 'photo-one', signal)
  await act(async () => { await vi.advanceTimersByTimeAsync(200) })
  expect((await reading).size).toBeGreaterThan(0)
  expect(fetch).toHaveBeenCalledTimes(2)
  for (const [url, options] of fetch.mock.calls) {
    expect(url).toBe('/api/client-portal/conversation/messages/photo-one/photo?preview=1')
    expect(new Headers(options.headers).get('Authorization')).toBe('Bearer private-token')
  }
})

it('does not retry authorization failures or unrelated provider/service unavailability', async () => {
  for (const [status, code] of [[403, 'forbidden'], [404, 'not_found'], [503, 'storage_unavailable']]) {
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code, message: 'Denied' } }), { status }))
    vi.stubGlobal('fetch', fetch)
    await expect(readConversationPhoto('/api/client-portal/conversation', 'token', 'id', new AbortController().signal)).rejects.toMatchObject({ status, code })
    expect(fetch).toHaveBeenCalledOnce()
  }
})

it('cancels a transient retry before another private request is sent', async () => {
  vi.useFakeTimers()
  const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: { code: 'image_processing_busy', message: 'Busy' } }), { status: 503 }))
  vi.stubGlobal('fetch', fetch)
  const controller = new AbortController()
  const reading = readConversationPhoto('/api/client-portal/conversation', 'token', 'id', controller.signal)
  const stopped = expect(reading).rejects.toHaveProperty('name', 'AbortError')
  await act(async () => { await vi.advanceTimersByTimeAsync(0) })
  controller.abort(); await stopped
  await vi.advanceTimersByTimeAsync(1000)
  expect(fetch).toHaveBeenCalledOnce()
})
