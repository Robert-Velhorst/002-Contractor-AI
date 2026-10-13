import { useLayoutEffect, useMemo, useRef } from 'react'

export const DRAFT_STORAGE_PREFIX = 'contractor-ai:draft:v1:'
export const DRAFT_SCHEMA_VERSION = 1
export const DRAFT_TTL_MS = 12 * 60 * 60 * 1000
export const MAX_DRAFT_BYTES = 128 * 1024
export const MAX_DRAFT_STORAGE_BYTES = 1024 * 1024

const SENSITIVE_KEY = /access[_-]?key|authorization|cookie|password|secret|token/i
const coordinators = new WeakMap()

function cleanSegment(value, fallback) {
  const normalized = String(value || '').trim().replace(/[^A-Za-z0-9._:-]/g, '_').slice(0, 180)
  return normalized || fallback
}

export function draftScopeFingerprint(value) {
  const input = String(value || '')
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < input.length; index += 1) {
    const code = input.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193) >>> 0
    second = Math.imul(second ^ (code + index), 0x85ebca6b) >>> 0
  }
  return `${first.toString(16).padStart(8, '0')}${second.toString(16).padStart(8, '0')}`
}

export function draftStorageKey(scope, name) {
  return `${DRAFT_STORAGE_PREFIX}${cleanSegment(scope, 'unscoped')}:${cleanSegment(name, 'draft')}`
}

export function browserDraftStorage() {
  try {
    return typeof window !== 'undefined' ? window.sessionStorage : null
  } catch {
    return null
  }
}

function draftJson(value) {
  return JSON.stringify(value, (key, item) => {
    if (SENSITIVE_KEY.test(key)) return undefined
    if (typeof File !== 'undefined' && item instanceof File) return undefined
    if (typeof Blob !== 'undefined' && item instanceof Blob) return undefined
    if (item instanceof ArrayBuffer || ArrayBuffer.isView(item)) return undefined
    return item
  })
}

function entryBytes(key, value) {
  return (String(key).length + String(value).length) * 2
}

function draftEntries(storage) {
  const entries = []
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index)
    if (!key?.startsWith(DRAFT_STORAGE_PREFIX)) continue
    const raw = storage.getItem(key)
    let updatedAt = 0
    try {
      updatedAt = Number(JSON.parse(raw)?.updatedAt || 0)
    } catch {
      updatedAt = 0
    }
    entries.push({ key, raw: raw || '', updatedAt, bytes: entryBytes(key, raw || '') })
  }
  return entries
}

export function readSessionDraft(storage, scope, name, now = Date.now()) {
  if (!storage) return { found: false, value: null }
  const key = draftStorageKey(scope, name)
  try {
    const raw = storage.getItem(key)
    if (!raw) return { found: false, value: null }
    const entry = JSON.parse(raw)
    if (entry?.version !== DRAFT_SCHEMA_VERSION || !Number.isFinite(entry.updatedAt) || now - entry.updatedAt > DRAFT_TTL_MS) {
      storage.removeItem(key)
      return { found: false, value: null }
    }
    return { found: true, value: entry.value, updatedAt: entry.updatedAt }
  } catch {
    try { storage.removeItem(key) } catch { /* Storage can be unavailable in private browser modes. */ }
    return { found: false, value: null }
  }
}

export function writeSessionDraftBatch(storage, drafts, now = Date.now()) {
  const written = new Set(), pending = new Map()
  if (!storage) return written
  for (const { scope, name, value } of drafts) {
    const key = draftStorageKey(scope, name)
    try {
      const raw = draftJson({ version: DRAFT_SCHEMA_VERSION, updatedAt: now, value })
      const bytes = entryBytes(key, raw)
      pending.delete(key)
      if (!raw || bytes > MAX_DRAFT_BYTES) storage.removeItem(key)
      else pending.set(key, { key, raw, bytes, updatedAt: now })
    } catch { /* A cyclic value or unavailable storage cannot prevent other drafts from saving. */ }
  }
  if (!pending.size) return written
  let retainedBytes = 0
  const inventory = new Map()
  try {
    // Read and parse the inventory once for the whole flush, not once per form.
    for (const entry of draftEntries(storage)) {
      if (!entry.updatedAt || now - entry.updatedAt > DRAFT_TTL_MS) storage.removeItem(entry.key)
      else { inventory.set(entry.key, entry); retainedBytes += entry.bytes }
    }
  } catch { return written }
  for (const entry of pending.values()) {
    try {
      const previousBytes = inventory.get(entry.key)?.bytes || 0
      if (retainedBytes - previousBytes + entry.bytes > MAX_DRAFT_STORAGE_BYTES) {
        const oldest = [...inventory.values()].filter(item => item.key !== entry.key).sort((a, b) => a.updatedAt - b.updatedAt)
        for (const old of oldest) {
          if (retainedBytes - previousBytes + entry.bytes <= MAX_DRAFT_STORAGE_BYTES) break
          storage.removeItem(old.key)
          inventory.delete(old.key)
          written.delete(old.key)
          retainedBytes -= old.bytes
        }
      }
      if (retainedBytes - previousBytes + entry.bytes > MAX_DRAFT_STORAGE_BYTES) continue
      storage.setItem(entry.key, entry.raw)
      retainedBytes += entry.bytes - previousBytes
      inventory.set(entry.key, entry)
      written.add(entry.key)
    } catch { /* Retain the UI value for a later explicit page-hide retry. */ }
  }
  return written
}

export function writeSessionDraft(storage, scope, name, value, now = Date.now()) {
  return writeSessionDraftBatch(storage, [{ scope, name, value }], now).has(draftStorageKey(scope, name))
}

function cancelPendingDrafts(storage, matches) {
  const coordinator = coordinators.get(storage)
  if (!coordinator) return
  for (const entry of coordinator.entries) {
    if (matches(entry.key)) { entry.dirty = false; entry.failed = false; entry.value = undefined }
  }
  coordinator.reschedule()
}

export function removeSessionDraft(storage, scope, name) {
  if (!storage) return
  const key = draftStorageKey(scope, name)
  cancelPendingDrafts(storage, candidate => candidate === key)
  try { storage.removeItem(key) } catch { /* Ledger writes do not depend on draft storage. */ }
}

export function clearSessionDraftScope(storage, scope) {
  if (!storage) return 0
  const prefix = `${DRAFT_STORAGE_PREFIX}${cleanSegment(scope, 'unscoped')}:`
  cancelPendingDrafts(storage, key => key.startsWith(prefix))
  const keys = []
  let removed = 0
  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    for (const key of keys) { storage.removeItem(key); removed += 1 }
  } catch { /* Return only the number actually removed. */ }
  return removed
}

function registerDraft(storage, scope, name) {
  let coordinator = coordinators.get(storage)
  if (!coordinator) {
    const entries = new Set()
    let timer = null, scheduledAt = Infinity
    function arm(deadline) {
      if (deadline >= scheduledAt) return
      if (timer !== null) clearTimeout(timer)
      scheduledAt = deadline
      timer = setTimeout(() => flush(false), Math.max(0, deadline - Date.now()))
    }
    function reschedule() {
      if (timer !== null) clearTimeout(timer)
      timer = null; scheduledAt = Infinity
      for (const entry of entries) if (entry.dirty) arm(entry.deadline)
    }
    function flush(all) {
      if (timer !== null) clearTimeout(timer)
      timer = null; scheduledAt = Infinity
      const now = Date.now()
      const pending = [...entries].filter(entry => (entry.dirty && (all || entry.deadline <= now)) || (all && entry.failed))
      const written = writeSessionDraftBatch(storage, pending, now)
      for (const entry of pending) {
        entry.dirty = false; entry.failed = !written.has(entry.key)
        if (!entry.failed) entry.value = undefined
      }
      reschedule()
    }
    const hide = () => flush(true)
    coordinator = { entries, arm, reschedule, hide }
    coordinators.set(storage, coordinator)
    window.addEventListener('pagehide', hide)
  }
  const entry = { scope, name, key: draftStorageKey(scope, name), dirty: false, failed: false, value: undefined, deadline: Infinity }
  coordinator.entries.add(entry)
  return {
    update(value, delayMs) {
      if (value === null || value === false || value === undefined) { removeSessionDraft(storage, scope, name); return }
      entry.value = value; entry.dirty = true; entry.failed = false
      entry.deadline = Date.now() + delayMs
      coordinator.arm(entry.deadline)
    },
    dispose() {
      coordinator.entries.delete(entry)
      entry.value = undefined
      coordinator.reschedule()
      if (!coordinator.entries.size) {
        window.removeEventListener('pagehide', coordinator.hide)
        coordinators.delete(storage)
      }
    },
  }
}

export function useSessionDraftRecovery({ enabled, scope, name, value, setValue, delayMs = 180 }) {
  const storage = useMemo(() => browserDraftStorage(), [])
  const key = enabled && scope ? draftStorageKey(scope, name) : ''
  const hydratedKeyRef = useRef('')
  const skipPersistRef = useRef(false)
  const entryRef = useRef(null)

  useLayoutEffect(() => {
    hydratedKeyRef.current = ''
    if (!key || !storage) return
    const restored = readSessionDraft(storage, scope, name)
    hydratedKeyRef.current = key
    skipPersistRef.current = true
    if (restored.found) setValue(restored.value)
  }, [key, name, scope, setValue, storage])

  useLayoutEffect(() => {
    if (!key || !storage) return undefined
    const entry = registerDraft(storage, scope, name)
    entryRef.current = entry
    return () => { entry.dispose(); entryRef.current = null }
  }, [key, name, scope, storage])

  // Register the current flush before navigation can observe an older committed value.
  useLayoutEffect(() => {
    if (!key || !storage || hydratedKeyRef.current !== key) return
    if (skipPersistRef.current) {
      skipPersistRef.current = false
      return
    }
    entryRef.current?.update(value, delayMs)
  }, [delayMs, key, name, scope, storage, value])
}
