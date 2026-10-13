import { afterEach, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WorkBoard from '../WorkBoard'

afterEach(() => vi.unstubAllGlobals())

it('offers the administrator route without submitting enabled worker registration', async () => {
  vi.stubGlobal('fetch', vi.fn(async url => ({
    ok: true,
    status: 200,
    json: async () => url === '/api/session'
      ? {}
      : { success: true, enabled: true, registrationEnabled: true }
  })))
  sessionStorage.clear()
  render(<WorkBoard />)
  const entry = screen.getByRole('link', { name: 'Verder als beheerder' })
  expect(entry.getAttribute('href')).toBe('/')
  expect(entry.closest('form')).toBeNull()
  fireEvent.click(await screen.findByRole('button', { name: 'Registreren', exact: true }))
  expect(screen.getByRole('link', { name: 'Verder als beheerder' }).getAttribute('href')).toBe('/')
  expect(sessionStorage.getItem('contractor.work-board.session')).toBeNull()
})
