import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import WorkBoard from '../WorkBoard'

vi.mock('../company-request.mjs', () => ({ companyFetch: vi.fn() }))
vi.mock('../OfflineDownload', () => ({ default: () => <div>Versleutelde offline werkmap</div> }))

import { companyFetch } from '../company-request.mjs'

const pack = {
  positionId: 'position-1', sourceHash: 'a'.repeat(64), job: { id: 'job-1', title: 'Dak repareren', address: 'Teststraat 1', city: 'Arnhem' },
  do: [], know: { workContext: null, instructions: [] }, have: { materials: [], equipment: [] }
}

function response(path, identity) {
  if (path === '/api/session') return { authentication: { method: identity ? 'identity' : 'work_board' }, identity: { enabled: true, accountUrl: '/identity.html', signInUrl: '/identity.html' }, operator: { role: identity ? 'field_worker' : 'owner' } }
  if (path === '/api/work-board/me') return { account: { name: 'Uitvoerder', status: 'admitted' }, applications: [{ id: 'application-1', positionId: 'position-1', status: 'assigned', position: { title: 'Dak repareren', startsAt: '2030-01-01T08:00:00Z', city: 'Arnhem' } }], standbyCallouts: [] }
  if (path === '/api/work-board/positions') return { positions: [] }
  if (path === '/api/work-board/privacy/requests') return { requests: [] }
  if (path === '/api/work-board/availability') return { availability: { periods: [], conflicts: [] } }
  if (path === '/api/work-board/positions/position-1/pack') return { pack }
  throw new Error(`Unexpected request: ${path}`)
}

beforeEach(() => {
  sessionStorage.clear()
  companyFetch.mockImplementation(async path => ({ ok: true, status: 200, json: async () => response(path, true) }))
})

it('offers encrypted offline access from a personal-identity worker assignment', async () => {
  render(<WorkBoard />)
  await userEvent.click(await screen.findByRole('button', { name: 'Werkpakket openen' }))
  expect(await screen.findByText('Versleutelde offline werkmap')).toBeTruthy()
})

it('does not offer offline sync to a legacy work-board login', async () => {
  sessionStorage.setItem('contractor.work-board.session', 'legacy-token')
  companyFetch.mockImplementation(async path => ({ ok: true, status: 200, json: async () => response(path, false) }))
  render(<WorkBoard />)
  await userEvent.click(await screen.findByRole('button', { name: 'Werkpakket openen' }))
  expect(await screen.findByText(/Offline bewaren is beschikbaar na aanmelden met je persoonlijke bedrijfsaccount/)).toBeTruthy()
  expect(screen.queryByText('Versleutelde offline werkmap')).toBeNull()
})

it('submits weekly availability with selected local weekdays and a bounded end date', async () => {
  let submitted
  companyFetch.mockImplementation(async (path, options = {}) => {
    if (path === '/api/work-board/availability' && options.method === 'POST') submitted = JSON.parse(options.body)
    return { ok: true, status: 200, json: async () => response(path, true) }
  })
  render(<WorkBoard />)
  await userEvent.click(await screen.findByRole('button', { name: 'Niet beschikbaar' }))
  await userEvent.click(screen.getByLabelText('Wekelijks herhalen'))
  const monday = screen.getByLabelText('ma')
  if (!monday.checked) await userEvent.click(monday)
  const until = new Date()
  until.setDate(until.getDate() + 30)
  await userEvent.type(screen.getByLabelText('Laatste dag'), until.toISOString().slice(0, 10))
  await userEvent.click(screen.getByRole('button', { name: 'Verhindering melden' }))
  await vi.waitFor(() => expect(submitted).toBeTruthy())
  expect(submitted.recurrence.frequency).toBe('weekly')
  expect(submitted.recurrence.daysOfWeek).toContain(1)
  expect(submitted.recurrence.timeZone).toBeTruthy()
  expect(submitted.recurrence.until).toBe(until.toISOString().slice(0, 10))
})
