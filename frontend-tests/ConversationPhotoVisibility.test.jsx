import { StrictMode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import ConversationPhoto from '../components/ConversationPhoto'
import { MAX_ACTIVE_PHOTO_PREVIEWS } from '../conversation-photo-visibility.mjs'

const props = { base: '/api/client-portal/conversation', token: 'private-scoped-token', message: { id: 'photo-one' }, label: 'Door detail' }
let observers, fetch, createUrl, revokeUrl

beforeEach(() => {
  observers = []
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback, options) {
      this.callback = callback; this.options = options; this.targets = new Set()
      this.observe = vi.fn(node => this.targets.add(node))
      this.unobserve = vi.fn(node => this.targets.delete(node))
      this.disconnect = vi.fn(() => this.targets.clear())
      observers.push(this)
    }
  })
  fetch = vi.fn(async () => new Response(new Blob(['private photo'], { type: 'image/png' })))
  createUrl = vi.fn().mockReturnValue('blob:private-photo')
  revokeUrl = vi.fn()
  vi.stubGlobal('fetch', fetch)
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl })
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks() })

function enter(observer, target = [...observer.targets][0], isIntersecting = true, width = 320) {
  act(() => observer.callback([{ target, isIntersecting, boundingClientRect: { width, height: 240 } }]))
}

it('shares one observer across 32 photos without downloading offscreen private bytes', async () => {
  const view = render(<>{Array.from({ length: 32 }, (_, id) => <ConversationPhoto key={id} {...props} message={{ id: `photo-${id}` }} label={`Photo ${id}`} />)}</>)
  expect(fetch).not.toHaveBeenCalled()
  expect(observers).toHaveLength(1)
  expect(observers[0].targets.size).toBe(32)
  expect(observers[0].options).toEqual({ rootMargin: '256px 0px' })
  enter(observers[0])
  const image = await screen.findByRole('img', { name: 'Photo 0' })
  expect(fetch).toHaveBeenCalledOnce()
  expect(fetch.mock.calls[0][0]).toBe('/api/client-portal/conversation/messages/photo-0/photo?preview=1')
  expect(new Headers(fetch.mock.calls[0][1].headers).get('Authorization')).toBe('Bearer private-scoped-token')
  expect(image.getAttribute('decoding')).toBe('async')
  expect(observers[0].targets.size).toBe(32)
  view.unmount()
  expect(observers[0].disconnect).toHaveBeenCalled()
  expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:private-photo')
})

it('ignores invisible or zero-sized entries and keeps a revealed photo observed without duplicate reads', async () => {
  const view = render(<ConversationPhoto {...props} />)
  const observer = observers[0], target = [...observer.targets][0]
  enter(observer, target, false)
  enter(observer, target, true, 0)
  expect(fetch).not.toHaveBeenCalled()
  enter(observer, target)
  await screen.findByRole('img')
  enter(observer, target)
  expect(fetch).toHaveBeenCalledOnce()
  expect(observer.unobserve).not.toHaveBeenCalled()
  expect(observer.disconnect).not.toHaveBeenCalled()
  view.unmount()
  expect(observer.unobserve).toHaveBeenCalledExactlyOnceWith(target)
  expect(observer.disconnect).toHaveBeenCalledOnce()
})

it('removes an unseen photo without accepting a queued visibility notification', () => {
  const view = render(<ConversationPhoto {...props} />)
  const observer = observers[0], target = [...observer.targets][0]
  view.unmount()
  enter(observer, target)
  expect(fetch).not.toHaveBeenCalled()
  expect(observer.targets.size).toBe(0)
})

it('unmounting one unseen photo keeps the other photo observed', async () => {
  const view = render(<><ConversationPhoto key="one" {...props} /><ConversationPhoto key="two" {...props} message={{ id: 'two' }} label="Other detail" /></>)
  view.rerender(<ConversationPhoto key="two" {...props} message={{ id: 'two' }} label="Other detail" />)
  expect(observers).toHaveLength(1)
  expect(observers[0].targets.size).toBe(1)
  enter(observers[0])
  await screen.findByRole('img', { name: 'Other detail' })
  expect(fetch.mock.calls[0][0]).toMatch(/\/messages\/two\/photo\?preview=1$/)
})

it('cancels a visible obsolete request and never constructs a URL for its late bytes', async () => {
  let resolve
  fetch.mockImplementationOnce(() => new Promise(yes => { resolve = yes }))
  const view = render(<ConversationPhoto {...props} />)
  enter(observers[0])
  view.rerender(<ConversationPhoto {...props} message={{ id: 'current' }} />)
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
  await act(async () => { resolve(new Response(new Blob(['obsolete']))); await Promise.resolve() })
  expect(createUrl).not.toHaveBeenCalled()
  expect(fetch).toHaveBeenCalledOnce()
  enter(observers[1])
  await screen.findByRole('img')
  expect(createUrl).toHaveBeenCalledOnce()
  expect(fetch.mock.calls[1][0]).toMatch(/\/messages\/current\/photo\?preview=1$/)
})

it('hides and revokes old bytes on a token or company-path change before loading the new scope', async () => {
  const view = render(<ConversationPhoto {...props} />)
  enter(observers[0]); await screen.findByRole('img')
  view.rerender(<ConversationPhoto {...props} base="/api/ledger/jobs/other/conversations/access" token={undefined} />)
  expect(screen.queryByRole('img')).toBeNull()
  expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:private-photo')
  expect(fetch).toHaveBeenCalledOnce()
  enter(observers[1]); await screen.findByRole('img')
  expect(new Headers(fetch.mock.calls[1][1].headers).has('Authorization')).toBe(false)
  expect(fetch.mock.calls[1][0]).toMatch(/^\/api\/ledger\/jobs\/other\//)
})

it('does not announce a denied private read until needed and never creates an image for it', async () => {
  fetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Photo access denied' } }), { status: 403 }))
  render(<ConversationPhoto {...props} />)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(fetch).not.toHaveBeenCalled()
  enter(observers[0])
  expect((await screen.findByRole('alert')).textContent).toBe('Photo access denied')
  expect(createUrl).not.toHaveBeenCalled()
})

it('keeps images available when observer construction fails', async () => {
  vi.stubGlobal('IntersectionObserver', class { constructor() { throw new Error('Unavailable') } })
  render(<ConversationPhoto {...props} />)
  await screen.findByRole('img')
  expect(fetch).toHaveBeenCalledOnce()
})

it('releases replayed StrictMode observers before accepting a current visibility event', async () => {
  render(<StrictMode><ConversationPhoto {...props} /></StrictMode>)
  expect(fetch).not.toHaveBeenCalled()
  expect(observers).toHaveLength(2)
  expect(observers[0].targets.size).toBe(0)
  enter(observers[1])
  await screen.findByRole('img')
  expect(fetch).toHaveBeenCalledOnce()
})

it('releases an offscreen preview and reauthorizes the same photo on reentry without shifting its slot', async () => {
  createUrl.mockReturnValueOnce('blob:first').mockReturnValueOnce('blob:second')
  const view = render(<ConversationPhoto {...props} />)
  const observer = observers[0], target = [...observer.targets][0]
  enter(observer, target)
  await screen.findByRole('img')
  enter(observer, target, false)
  expect(screen.queryByRole('img')).toBeNull()
  expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:first')
  expect(fetch.mock.calls[0][1].signal.aborted).toBe(true)
  expect(target.isConnected).toBe(true)
  enter(observer, target)
  expect((await screen.findByRole('img')).getAttribute('src')).toBe('blob:second')
  expect(fetch).toHaveBeenCalledTimes(2)
  expect(fetch.mock.calls.every(([, options]) => new Headers(options.headers).get('Authorization') === 'Bearer private-scoped-token')).toBe(true)
  view.unmount()
  expect(revokeUrl).toHaveBeenCalledWith('blob:second')
})

it('keeps at most eight previews across mounted viewers and gives an explicitly chosen waiting photo a slot', async () => {
  const view = render(<>{Array.from({ length: 32 }, (_, id) => <ConversationPhoto key={id} {...props}
    base={id < 16 ? props.base : '/api/ledger/jobs/other/conversations/allowed'} token={id < 16 ? props.token : undefined}
    message={{ id: `bounded-${id}` }} label={`Bounded ${id}`} />)}</>)
  const observer = observers[0], targets = [...observer.targets]
  act(() => observer.callback(targets.map(target => ({ target, isIntersecting: true, boundingClientRect: { width: 320, height: 240, top: 0 } }))))
  await vi.waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(8))
  expect(MAX_ACTIVE_PHOTO_PREVIEWS).toBe(8)
  expect(fetch).toHaveBeenCalledTimes(8)
  fireEvent.click(screen.getByRole('button', { name: 'Foto laden: Bounded 31' }))
  await screen.findByRole('img', { name: 'Bounded 31' })
  expect(screen.getAllByRole('img')).toHaveLength(8)
  expect(revokeUrl).toHaveBeenCalledOnce()
  expect(fetch).toHaveBeenCalledTimes(9)
  expect(fetch.mock.calls[8][0]).toMatch(/^\/api\/ledger\/jobs\/other\//)
  expect(new Headers(fetch.mock.calls[8][1].headers).has('Authorization')).toBe(false)
  expect(observer.targets.size).toBe(32)
  view.unmount()
  await act(async () => { await Promise.resolve() })
  expect(fetch).toHaveBeenCalledTimes(9)
})

it('does not let late aborted bytes overwrite a newly reentered preview', async () => {
  let resolve
  fetch.mockImplementationOnce(() => new Promise(yes => { resolve = yes }))
  createUrl.mockReturnValueOnce('blob:current')
  render(<ConversationPhoto {...props} />)
  const observer = observers[0], target = [...observer.targets][0]
  enter(observer, target)
  enter(observer, target, false)
  enter(observer, target)
  await screen.findByRole('img')
  await act(async () => { resolve(new Response(new Blob(['obsolete']))); await Promise.resolve() })
  expect(createUrl).toHaveBeenCalledOnce()
  expect(screen.getByRole('img').getAttribute('src')).toBe('blob:current')
})

it('does not reuse a released preview when access is denied on reentry', async () => {
  fetch.mockResolvedValueOnce(new Response(new Blob(['allowed'])))
    .mockResolvedValueOnce(new Response(JSON.stringify({ error: { message: 'Access revoked' } }), { status: 403 }))
  render(<ConversationPhoto {...props} />)
  const observer = observers[0], target = [...observer.targets][0]
  enter(observer, target)
  await screen.findByRole('img')
  enter(observer, target, false)
  enter(observer, target)
  expect((await screen.findByRole('alert')).textContent).toBe('Access revoked')
  expect(screen.queryByRole('img')).toBeNull()
  expect(createUrl).toHaveBeenCalledOnce()
  expect(revokeUrl).toHaveBeenCalledOnce()
  expect(fetch).toHaveBeenCalledTimes(2)
})

it('keeps the eight-preview ceiling when the observer is unavailable and allows manual selection', async () => {
  vi.stubGlobal('IntersectionObserver', undefined)
  render(<>{Array.from({ length: 16 }, (_, id) => <ConversationPhoto key={id} {...props} message={{ id: `fallback-${id}` }} label={`Fallback ${id}`} />)}</>)
  await vi.waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(8))
  expect(fetch).toHaveBeenCalledTimes(8)
  fireEvent.click(screen.getByRole('button', { name: 'Foto laden: Fallback 15' }))
  await screen.findByRole('img', { name: 'Fallback 15' })
  expect(screen.getAllByRole('img')).toHaveLength(8)
  expect(fetch).toHaveBeenCalledTimes(9)
  expect(revokeUrl).toHaveBeenCalledOnce()
})

it('does not cancel an explicit original download when only its preview leaves the viewport', async () => {
  let resolve
  fetch.mockImplementationOnce(async () => new Response(new Blob(['preview'])))
    .mockImplementationOnce(() => new Promise(yes => { resolve = yes }))
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
  render(<ConversationPhoto {...props} />)
  const observer = observers[0], target = [...observer.targets][0]
  enter(observer, target)
  await screen.findByRole('img')
  fireEvent.click(screen.getByRole('button', { name: 'Origineel downloaden: Door detail' }))
  enter(observer, target, false)
  expect(fetch.mock.calls[1][1].signal.aborted).toBe(false)
  expect(screen.queryByRole('img')).toBeNull()
  await act(async () => { resolve(new Response(new Blob(['original']))) })
  expect(click).toHaveBeenCalledOnce()
  expect(createUrl).toHaveBeenCalledTimes(2)
})
