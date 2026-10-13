import { useState } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createMemoryStorage } from './memory-storage'
import { DRAFT_STORAGE_PREFIX, DRAFT_TTL_MS, MAX_DRAFT_BYTES, MAX_DRAFT_STORAGE_BYTES,
  clearSessionDraftScope, draftStorageKey, readSessionDraft, removeSessionDraft,
  useSessionDraftRecovery, writeSessionDraft, writeSessionDraftBatch } from '../draft-recovery'

function Field({ name, scope = 'owner:one', delayMs = 180, enabled = true }) {
  const [value, setValue] = useState('')
  useSessionDraftRecovery({ enabled, scope, name, value, setValue, delayMs })
  return <label>{name}<input value={value} onChange={event => setValue(event.target.value)} /></label>
}
const change = (name, value) => fireEvent.change(screen.getByLabelText(name), { target: { value } })
const hide = () => act(() => window.dispatchEvent(new Event('pagehide')))

describe('shared draft recovery scheduling', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(window, 'sessionStorage', { configurable: true, value: createMemoryStorage() })
  })
  afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks() })

  it('uses one listener and timer for 32 forms and scans their storage inventory only once per flush', () => {
    const names = Array.from({ length: 32 }, (_, index) => `form-${index}`)
    writeSessionDraftBatch(window.sessionStorage, names.map(name => ({ scope: 'owner:one', name, value: 'stored' })))
    const add = vi.spyOn(window, 'addEventListener'), remove = vi.spyOn(window, 'removeEventListener')
    const keys = vi.spyOn(window.sessionStorage, 'key'), writes = vi.spyOn(window.sessionStorage, 'setItem')
    const view = render(<>{names.map(name => <Field key={name} name={name} />)}</>)
    act(() => names.forEach((name, index) => change(name, `latest-${index}`)))
    act(() => vi.advanceTimersByTime(0))
    expect(add.mock.calls.filter(([name]) => name === 'pagehide')).toHaveLength(1)
    expect(vi.getTimerCount()).toBe(1)
    expect(keys).not.toHaveBeenCalled()
    act(() => vi.advanceTimersByTime(181))
    expect(keys).toHaveBeenCalledTimes(32)
    expect(writes).toHaveBeenCalledTimes(32)
    names.forEach((name, index) => expect(readSessionDraft(window.sessionStorage, 'owner:one', name).value).toBe(`latest-${index}`))
    writes.mockClear(); keys.mockClear()
    hide()
    expect(writes).not.toHaveBeenCalled()
    expect(keys).not.toHaveBeenCalled()
    expect(vi.getTimerCount()).toBe(0)
    view.unmount()
    expect(remove.mock.calls.filter(([name]) => name === 'pagehide')).toHaveLength(1)
  })

  it('debounces recent edits independently without adding listeners or losing the next deadline', () => {
    const add = vi.spyOn(window, 'addEventListener')
    render(<><Field name="fast" delayMs={20} /><Field name="slow" delayMs={100} /></>)
    change('fast', 'one'); change('slow', 'first')
    act(() => vi.advanceTimersByTime(21))
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'fast').value).toBe('one')
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'slow').found).toBe(false)
    change('slow', 'latest')
    act(() => vi.advanceTimersByTime(80))
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'slow').found).toBe(false)
    expect(vi.getTimerCount()).toBe(1)
    act(() => vi.advanceTimersByTime(21))
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'slow').value).toBe('latest')
    expect(add.mock.calls.filter(([name]) => name === 'pagehide')).toHaveLength(1)
  })

  it('flushes all latest values immediately on pagehide and cancels the scheduled flush', () => {
    render(<><Field name="a" /><Field name="b" /></>)
    act(() => { change('a', 'first'); change('a', 'latest'); change('b', 'other') })
    hide()
    act(() => vi.advanceTimersByTime(0))
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'a').value).toBe('latest')
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'b').value).toBe('other')
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not recreate a cleared scope from an outstanding autosave or immediate pagehide', () => {
    render(<><Field name="a" /><Field name="b" scope="owner:two" /></>)
    change('a', 'private'); change('b', 'retained')
    expect(clearSessionDraftScope(window.sessionStorage, 'owner:one')).toBe(0)
    hide()
    act(() => vi.advanceTimersByTime(1000))
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'a').found).toBe(false)
    expect(readSessionDraft(window.sessionStorage, 'owner:two', 'b').value).toBe('retained')
  })

  it('cancels an explicitly removed draft without cancelling a different form in the same scope', () => {
    render(<><Field name="a" /><Field name="b" /></>)
    change('a', 'closed'); change('b', 'open')
    removeSessionDraft(window.sessionStorage, 'owner:one', 'a')
    hide()
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'a').found).toBe(false)
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'b').value).toBe('open')
  })

  it('cancels a removed component while other active components retain their pending writes', () => {
    const view = render(<><Field key="a" name="a" /><Field key="b" name="b" /></>)
    change('a', 'abandoned'); change('b', 'retained')
    view.rerender(<Field key="b" name="b" />)
    hide()
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'a').found).toBe(false)
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'b').value).toBe('retained')
  })

  it('does not carry pending values across a keyed operator/company scope change', () => {
    const view = render(<Field key="one" name="a" />)
    change('a', 'old private')
    view.rerender(<Field key="two" name="a" scope="owner:two" />)
    expect(screen.getByLabelText('a').value).toBe('')
    hide()
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'a').found).toBe(false)
    expect(readSessionDraft(window.sessionStorage, 'owner:two', 'a').found).toBe(false)
  })

  it('retries a failed write on pagehide without a timer loop and does not repeat successful writes', () => {
    const original = window.sessionStorage.setItem
    const write = vi.spyOn(window.sessionStorage, 'setItem').mockImplementationOnce(() => { throw new Error('Temporarily full') })
    render(<Field name="a" />)
    change('a', 'retained in UI')
    act(() => vi.advanceTimersByTime(181))
    expect(write).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
    write.mockImplementation(original)
    hide()
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'a').value).toBe('retained in UI')
    expect(write).toHaveBeenCalledTimes(2)
    hide()
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('never registers persistence work for a disabled form', () => {
    const add = vi.spyOn(window, 'addEventListener')
    render(<Field name="a" enabled={false} />)
    change('a', 'not persisted'); hide()
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'a').found).toBe(false)
    expect(add.mock.calls.filter(([name]) => name === 'pagehide')).toHaveLength(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})

describe('bounded batch draft storage', () => {
  it('retains privacy filtering and isolates a cyclic draft from valid neighbours', () => {
    const cyclic = {}; cyclic.self = cyclic
    const written = writeSessionDraftBatch(window.sessionStorage, [
      { scope: 'owner:one', name: 'a', value: { title: 'retain', authorization: 'secret', file: new Blob(['private']),
        nested: { apiSecret: 'secret', note: 'retain too' } } },
      { scope: 'owner:one', name: 'bad', value: cyclic },
      { scope: 'owner:two', name: 'b', value: 'also retained' },
    ])
    expect(written.size).toBe(2)
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'a').value).toEqual({ title: 'retain', nested: { note: 'retain too' } })
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'bad').found).toBe(false)
    expect(readSessionDraft(window.sessionStorage, 'owner:two', 'b').value).toBe('also retained')
  })

  it('enforces per-draft and total limits while preserving unrelated browser storage', () => {
    window.sessionStorage.setItem('unrelated', 'keep')
    const written = writeSessionDraftBatch(window.sessionStorage, Array.from({ length: 20 }, (_, index) => ({
      scope: 'owner:one', name: `large-${index}`, value: 'x'.repeat(40 * 1024),
    })))
    let bytes = 0, count = 0
    for (let index = 0; index < window.sessionStorage.length; index += 1) {
      const key = window.sessionStorage.key(index), value = window.sessionStorage.getItem(key)
      if (!key.startsWith(DRAFT_STORAGE_PREFIX)) continue
      const size = (key.length + value.length) * 2
      expect(size).toBeLessThanOrEqual(MAX_DRAFT_BYTES)
      bytes += size; count += 1
    }
    expect(bytes).toBeLessThanOrEqual(MAX_DRAFT_STORAGE_BYTES)
    expect(count).toBe(written.size)
    expect(count).toBeLessThan(20)
    expect(written.has(draftStorageKey('owner:one', 'large-19'))).toBe(true)
    expect(window.sessionStorage.getItem('unrelated')).toBe('keep')
    expect(writeSessionDraft(window.sessionStorage, 'owner:one', 'oversized', 'x'.repeat(MAX_DRAFT_BYTES))).toBe(false)
  })

  it('expires old drafts once and retains the newest valid duplicate value', () => {
    const now = Date.now()
    writeSessionDraft(window.sessionStorage, 'owner:one', 'expired', 'stale', now - DRAFT_TTL_MS - 1)
    writeSessionDraft(window.sessionStorage, 'owner:one', 'recent', 'keep', now - 1)
    const cyclic = {}; cyclic.self = cyclic
    const written = writeSessionDraftBatch(window.sessionStorage, [
      { scope: 'owner:one', name: 'a', value: 'first' },
      { scope: 'owner:one', name: 'a', value: 'latest' },
      { scope: 'owner:one', name: 'a', value: cyclic },
    ], now)
    expect(written.size).toBe(1)
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'a').value).toBe('latest')
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'expired').found).toBe(false)
    expect(readSessionDraft(window.sessionStorage, 'owner:one', 'recent').value).toBe('keep')
  })

  it('fails safely when browser storage access or removal throws', () => {
    const storage = { getItem() { throw new Error('Blocked') }, removeItem() { throw new Error('Blocked') },
      get length() { throw new Error('Blocked') } }
    expect(readSessionDraft(storage, 'owner:one', 'a')).toEqual({ found: false, value: null })
    expect(writeSessionDraft(storage, 'owner:one', 'a', 'keep')).toBe(false)
    expect(() => removeSessionDraft(storage, 'owner:one', 'a')).not.toThrow()
    expect(clearSessionDraftScope(storage, 'owner:one')).toBe(0)
    expect(writeSessionDraftBatch(null, [{ scope: 'owner:one', name: 'a', value: 'keep' }]).size).toBe(0)
  })
})
