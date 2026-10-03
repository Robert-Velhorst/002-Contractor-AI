import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'

function memoryStorage() {
  const values = new Map()
  return {
    get length() { return values.size },
    clear: () => values.clear(),
    getItem: key => values.has(String(key)) ? values.get(String(key)) : null,
    key: index => [...values.keys()][index] ?? null,
    removeItem: key => values.delete(String(key)),
    setItem: (key, value) => values.set(String(key), String(value)),
  }
}

Object.defineProperty(window, 'localStorage', { configurable: true, value: memoryStorage() })

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  window.localStorage.clear()
})
