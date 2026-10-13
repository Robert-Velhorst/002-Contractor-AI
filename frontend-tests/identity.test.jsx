import { afterEach, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import IdentityPortal from '../IdentityPortal'
import CompanyMembershipControl from '../components/CompanyMembershipControl'
import WorkBoard from '../WorkBoard'

afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState(null, '', '/') })
const json = value => ({ ok: true, status: 200, headers: new Headers(), json: async () => value })

it('registration shows recovery codes once, rejects mismatched passwords and retains no credentials in web storage', async () => {
  window.history.replaceState(null, '', '/identity.html')
  const fetcher = vi.fn(async url => json(url.endsWith('/register') ? { recoveryCodes: ['a-private-one-use-code'] } : { csrf: 'test-csrf', identity: null, memberships: [] }))
  vi.stubGlobal('fetch', fetcher)
  render(<IdentityPortal />)
  fireEvent.click(await screen.findByRole('button', { name: 'Registreren', exact: true }))
  fireEvent.change(screen.getByLabelText('Naam', { exact: true }), { target: { value: 'Person' } })
  fireEvent.change(screen.getByLabelText('Gebruikersnaam'), { target: { value: 'unique-person' } })
  fireEvent.change(screen.getByLabelText('Wachtwoord', { exact: true }), { target: { value: 'long secret phrase' } })
  fireEvent.change(screen.getByLabelText('Herhaal wachtwoord'), { target: { value: 'different secret phrase' } })
  fireEvent.click(screen.getByRole('checkbox'))
  fireEvent.submit(screen.getByRole('button', { name: 'Account aanmaken', exact: true }).closest('form'))
  expect((await screen.findByRole('alert')).textContent).toContain('komen niet overeen')
  expect(fetcher.mock.calls.filter(([url]) => url.endsWith('/register'))).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('Herhaal wachtwoord'), { target: { value: 'long secret phrase' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Account aanmaken', exact: true }).closest('form'))
  expect(await screen.findByText('a-private-one-use-code')).toBeTruthy()
  expect(window.localStorage.length).toBe(0)
  expect(window.sessionStorage.length).toBe(0)
  expect(screen.getByLabelText('Wachtwoord', { exact: true }).value).toBe('')
  fireEvent.click(screen.getByRole('button', { name: 'Veilig bewaard', exact: true }))
  expect(screen.queryByText('a-private-one-use-code')).toBeNull()
})

it('an uncertain invitation outcome is not automatically retried or presented as a successful invitation', async () => {
  const api = vi.fn(async (_url, options) => { if (options?.method === 'POST') throw new Error('Resultaat niet bevestigd'); return { company: { name: 'A' }, memberships: [], invitations: [], accountUrl: '/identity.html' } })
  render(<CompanyMembershipControl api={api} workers={[{ id: 'worker-1', name: 'Worker' }]} />)
  await screen.findByText('A', { exact: true })
  fireEvent.click(screen.getByText('Nieuwe bedrijfsuitnodiging'))
  fireEvent.change(screen.getByLabelText('Uitvoerdersprofiel', { exact: true }), { target: { value: 'worker-1' } })
  fireEvent.change(screen.getByLabelText('Referentie uitnodigingscontrole'), { target: { value: 'Contact verified' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Uitnodiging aanmaken' }).closest('form'))
  expect((await screen.findByRole('alert')).textContent).toContain('Resultaat niet bevestigd')
  expect(api.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  expect(screen.queryByLabelText('Persoonlijke uitnodigingslink (eenmalig zichtbaar)')).toBeNull()
})

it('assisted recovery shows fresh backup codes once and clears the supplied recovery credential', async () => {
  window.history.replaceState(null, '', '/identity.html')
  vi.stubGlobal('fetch', vi.fn(async url => json(url.endsWith('/recover')
    ? { recovered: true, recoveryCodes: ['fresh-private-recovery-code'] }
    : { csrf: 'test-csrf', identity: null, memberships: [] })))
  render(<IdentityPortal />)
  fireEvent.click(await screen.findByRole('button', { name: 'Herstellen', exact: true }))
  const code = screen.getByLabelText('Eenmalige herstelcode')
  expect(code.type).toBe('password')
  fireEvent.change(screen.getByLabelText('Gebruikersnaam'), { target: { value: 'reviewed-person' } })
  fireEvent.change(code, { target: { value: 'CIR.private-one-use-code' } })
  fireEvent.change(screen.getByLabelText('Nieuw wachtwoord'), { target: { value: 'new verified password' } })
  fireEvent.change(screen.getByLabelText('Herhaal wachtwoord'), { target: { value: 'new verified password' } })
  fireEvent.submit(screen.getByRole('button', { name: 'Wachtwoord herstellen' }).closest('form'))
  expect(await screen.findByText('fresh-private-recovery-code')).toBeTruthy()
  expect(screen.getByLabelText('Wachtwoord', { exact: true }).value).toBe('')
  expect(window.sessionStorage.length).toBe(0)
  expect(window.localStorage.length).toBe(0)
  fireEvent.click(screen.getByRole('button', { name: 'Veilig bewaard' }))
  expect(screen.queryByText('fresh-private-recovery-code')).toBeNull()
})

it('shared field sign-in replaces a stale legacy browser token before loading the work board', async () => {
  window.sessionStorage.setItem('contractor.work-board.session', 'stale-legacy-token')
  const fetcher = vi.fn(async url => json(url === '/api/session'
    ? { identity: { enabled: true, accountUrl: '/identity.html', signInUrl: '/api/auth/identity/start' }, authentication: { method: 'identity' }, operator: { role: 'field_worker' } }
    : url.endsWith('/me') ? { account: { name: 'Verified worker', status: 'admitted', authSource: 'identity' }, applications: [] } : { positions: [] }))
  vi.stubGlobal('fetch', fetcher)
  render(<WorkBoard />)
  expect(await screen.findByRole('heading', { name: 'Beschikbaar werk' })).toBeTruthy()
  await waitFor(() => expect(window.sessionStorage.getItem('contractor.work-board.session')).toBeNull())
  const calls = fetcher.mock.calls.filter(([url]) => url.startsWith('/api/work-board/'))
  expect(calls.length).toBeGreaterThan(0)
  for (const [, options] of calls) expect(new Headers(options?.headers).get('Authorization')).toBeNull()
})
