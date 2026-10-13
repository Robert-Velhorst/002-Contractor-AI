import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CalendarDays } from 'lucide-react'
import DashboardNavigation from '../components/DashboardNavigation'
import { intentPreloader, moduleLoader } from '../dashboard-chunks'
import { DRAFT_STORAGE_PREFIX, DRAFT_TTL_MS, MAX_DRAFT_STORAGE_BYTES, draftStorageKey, readSessionDraft, writeSessionDraft } from '../draft-recovery'

function storageFixture() {
  const values = new Map()
  return {
    get length() { return values.size },
    key: vi.fn(index => [...values.keys()][index] ?? null),
    getItem: vi.fn(key => values.get(key) ?? null),
    setItem: vi.fn((key, value) => values.set(key, String(value))),
    removeItem: vi.fn(key => values.delete(key)),
  }
}

describe('bounded dashboard work', () => {
  it('reuses the exact in-flight module and retries a failed import', async () => {
    const module = { default: () => null }
    const importer = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(module)
    const load = moduleLoader(importer)
    const first = load()
    expect(load()).toBe(first)
    await expect(first).rejects.toThrow('offline')
    await expect(load()).resolves.toBe(module)
    await expect(load()).resolves.toBe(module)
    expect(importer).toHaveBeenCalledTimes(2)
  })

  it.each([
    { onLine: false }, { connection: { saveData: true } },
    { connection: { effectiveType: '2g' } }, { connection: { effectiveType: 'slow-2g' } },
  ])('does not speculate on a constrained connection %j', environment => {
    const load = vi.fn()
    intentPreloader({ finance: load }, () => environment)('finance')
    expect(load).not.toHaveBeenCalled()
  })

  it('warms at most one module at a time, ignores unknown destinations and absorbs preload failure', async () => {
    let reject
    const finance = vi.fn(() => new Promise((_, fail) => { reject = fail }))
    const help = vi.fn().mockResolvedValue({})
    const warm = intentPreloader({ finance, help }, () => ({ onLine: true }))
    warm('not-authorized')
    warm('finance')
    warm('finance')
    warm('help')
    expect(finance).toHaveBeenCalledOnce()
    expect(help).not.toHaveBeenCalled()
    reject(new Error('network unavailable'))
    await new Promise(resolve => setTimeout(resolve, 0))
    warm('help')
    expect(help).toHaveBeenCalledOnce()
  })

  it('warms only a visible enabled destination on pointer or keyboard intent without navigating', () => {
    const onIntent = vi.fn(), onSelect = vi.fn()
    const props = { locale: 'en-GB', items: [['schedule', 'Schedule', CalendarDays]], onIntent, onSelect }
    const view = render(<DashboardNavigation {...props} />)
    const schedule = screen.getByRole('button', { name: 'Schedule' })
    fireEvent.pointerEnter(schedule)
    fireEvent.focus(schedule)
    expect(onIntent.mock.calls).toEqual([['schedule'], ['schedule']])
    expect(onSelect).not.toHaveBeenCalled()
    view.rerender(<DashboardNavigation {...props} loading />)
    fireEvent.pointerEnter(schedule)
    expect(onIntent).toHaveBeenCalledTimes(2)
  })
})

describe('linear draft storage maintenance', () => {
  it('scans and reads each of 36 drafts only once when editing a table cell', () => {
    const storage = storageFixture()
    for (let index = 0; index < 36; index++) writeSessionDraft(storage, 'owner', `form-${index}`, { value: index }, 1000)
    storage.getItem.mockClear()
    storage.key.mockClear()
    expect(writeSessionDraft(storage, 'owner', 'form-1', { value: 'latest', token: 'not retained' }, 1001)).toBe(true)
    expect(storage.key).toHaveBeenCalledTimes(36)
    expect(storage.getItem).toHaveBeenCalledTimes(36)
    expect(readSessionDraft(storage, 'owner', 'form-1', 1002).value).toEqual({ value: 'latest' })
  })

  it('retains the previous draft if storage refuses an overwrite', () => {
    const storage = storageFixture()
    writeSessionDraft(storage, 'owner', 'form', { value: 'retained' }, 1000)
    storage.setItem.mockImplementationOnce(() => { throw new Error('quota exceeded') })
    expect(writeSessionDraft(storage, 'owner', 'form', { value: 'replacement' }, 1001)).toBe(false)
    expect(readSessionDraft(storage, 'owner', 'form', 1002).value).toEqual({ value: 'retained' })
  })

  it('expires old drafts, evicts the oldest only when over budget and preserves unrelated storage', () => {
    const storage = storageFixture()
    storage.setItem('other-product', 'keep')
    writeSessionDraft(storage, 'owner', 'expired', { value: 'expired' }, 1)
    const now = DRAFT_TTL_MS + 2
    for (let index = 0; index < 10; index++) {
      expect(writeSessionDraft(storage, 'owner', `large-${index}`, { value: 'x'.repeat(59000) }, now + index)).toBe(true)
    }
    expect(readSessionDraft(storage, 'owner', 'expired', now).found).toBe(false)
    expect(storage.getItem(draftStorageKey('owner', 'large-0'))).toBeNull()
    expect(readSessionDraft(storage, 'owner', 'large-9', now + 10).found).toBe(true)
    const bytes = Array.from({ length: storage.length }, (_, index) => storage.key(index))
      .filter(key => key.startsWith(DRAFT_STORAGE_PREFIX))
      .reduce((total, key) => total + (key.length + storage.getItem(key).length) * 2, 0)
    expect(bytes).toBeLessThanOrEqual(MAX_DRAFT_STORAGE_BYTES)
    expect(storage.getItem('other-product')).toBe('keep')
  })
})
