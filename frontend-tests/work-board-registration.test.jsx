import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import WorkBoard from '../WorkBoard'

const response = body => ({ ok: true, status: 200, json: async () => body })

afterEach(() => {
  vi.unstubAllGlobals()
  window.sessionStorage.removeItem('contractor.work-board.session')
})

it('hides public registration when the runtime reports it disabled', async () => {
  vi.stubGlobal('fetch', vi.fn(async url => url === '/api/session'
    ? response({})
    : response({ success: true, enabled: true, registrationEnabled: false })))

  render(<WorkBoard />)

  expect(await screen.findByText('Registratie van nieuwe uitvoerenden is momenteel gesloten. Neem contact op met de aannemer.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Registreren', exact: true })).toBeNull()
  expect(within(screen.getByRole('group', { name: 'Account' })).getByRole('button', { name: 'Inloggen', exact: true })).toBeTruthy()
})

it('shows public registration only after the runtime explicitly enables it', async () => {
  const fetcher = vi.fn(async url => url === '/api/session'
    ? response({})
    : response({ success: true, enabled: true, registrationEnabled: true }))
  vi.stubGlobal('fetch', fetcher)

  render(<WorkBoard />)

  const register = await screen.findByRole('button', { name: 'Registreren', exact: true })
  expect(register).toBeTruthy()
  expect(fetcher.mock.calls.some(([url]) => url === '/api/work-board/config')).toBe(true)
  expect(screen.queryByText('Registratie van nieuwe uitvoerenden is momenteel gesloten. Neem contact op met de aannemer.')).toBeNull()
})
