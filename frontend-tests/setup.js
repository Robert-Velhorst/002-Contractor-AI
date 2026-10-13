import { afterEach } from 'vitest'
import { cleanup } from '@testing-library/react'
import { createMemoryStorage } from './memory-storage'

Object.defineProperty(window, 'localStorage', { configurable: true, value: createMemoryStorage() })

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
  window.localStorage.clear()
})
