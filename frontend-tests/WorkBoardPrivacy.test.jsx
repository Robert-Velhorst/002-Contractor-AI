import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import WorkBoard from '../WorkBoard'

vi.mock('../company-request.mjs', () => ({ companyFetch: vi.fn() }))

import { companyFetch } from '../company-request.mjs'

const requests = []
let profileSkills = ['Carpenter']
let profileRegions = ['Arnhem']
let allRegions = false
let boardPositions = []
let boardApplications = []
const createdRequest = {
  id: 'privacy-applicant-1', subjectType: 'worker', subjectId: 'applicant-1', requestType: 'access',
  status: 'open', dueAt: '2026-10-25T00:00:00.000Z', identity: { status: 'unverified' }
}

function response(path, options = {}) {
  if (path === '/api/session') return { authentication: { method: 'work_board' }, operator: { role: 'unauthenticated' } }
  if (path === '/api/work-board/me') return { account: { id: 'applicant-1', name: 'Uitvoerder', status: 'pending', skills: profileSkills,
    region: allRegions ? 'Heel Nederland' : profileRegions.join(', '), workRegions: allRegions ? [] : profileRegions, allRegions }, applications: boardApplications, standbyCallouts: [] }
  if (path === '/api/work-board/positions') return { positions: boardPositions }
  if (path === '/api/work-board/profile/skills' && options.method === 'POST') {
    profileSkills = JSON.parse(options.body).skills
    return { account: { id: 'applicant-1', name: 'Uitvoerder', status: 'pending', skills: profileSkills }, reviewRequired: false }
  }
  if (path === '/api/work-board/profile/regions' && options.method === 'POST') {
    const body = JSON.parse(options.body)
    profileRegions = body.regions
    allRegions = body.allRegions
    return { account: { id: 'applicant-1', name: 'Uitvoerder', status: 'pending', region: allRegions ? 'Heel Nederland' : profileRegions.join(', '), workRegions: allRegions ? [] : profileRegions, allRegions } }
  }
  if (path === '/api/work-board/privacy/requests' && options.method === 'POST') {
    const body = JSON.parse(options.body)
    expect(body).toMatchObject({ requestType: 'access' })
    expect(body).not.toHaveProperty('subjectId')
    expect(body).not.toHaveProperty('actor')
    requests.unshift(createdRequest)
    return { request: createdRequest }
  }
  if (path === '/api/work-board/privacy/requests') return { requests: [...requests] }
  throw new Error(`Unexpected request: ${path}`)
}

beforeEach(() => {
  sessionStorage.clear()
  sessionStorage.setItem('contractor.work-board.session', 'valid-worker-session')
  requests.length = 0
  profileSkills = ['Carpenter']
  profileRegions = ['Arnhem']
  allRegions = false
  boardPositions = []
  boardApplications = []
  companyFetch.mockImplementation(async (path, options = {}) => ({ ok: true, status: 200, json: async () => response(path, options) }))
})

it('lets an authenticated applicant submit a self-scoped privacy request and follow its status', async () => {
  const user = userEvent.setup()
  render(<WorkBoard />)

  await user.click(await screen.findByText('Mijn gegevens en privacyverzoeken'))
  await user.selectOptions(screen.getByLabelText('Verzoek'), 'access')
  fireEvent.change(screen.getByLabelText('Toelichting (optioneel)'), {
    target: { value: 'Please provide my registration details.' }
  })
  await user.click(screen.getByRole('button', { name: 'Verzoek indienen' }))

  expect(await screen.findByText(/privacy-applicant-1/)).toBeTruthy()
  expect((await screen.findByText('Inzage')).closest('li').textContent).toContain('Ontvangen')
  expect((await screen.findByText('Inzage')).closest('li').textContent).toContain('Identiteit controleren')
  await waitFor(() => expect(companyFetch).toHaveBeenCalledWith('/api/work-board/privacy/requests', expect.objectContaining({ method: 'POST' })))
})

it('hides changed position terms from an existing unplaced applicant and disables an old offer', async () => {
  boardApplications = [{ id: 'application-old', positionId: 'position-old', status: 'offer_pending',
    offer: { expiresAt: '2030-06-01T00:00:00.000Z' },
    position: { id: 'position-old', jobId: 'job-old', status: 'open', revision: 'revision-1', reviewRequired: true,
      reviewReason: 'source', title: 'Opdracht wordt opnieuw gecontroleerd' } }]
  render(<WorkBoard />)

  expect(await screen.findByText(/De gekoppelde werkzaamheden zijn gewijzigd/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Aanbod accepteren' })).toBeNull()
  expect(screen.queryByText('2030-06-01 | undefined')).toBeNull()
})

it('shows that a closed position offer is no longer actionable', async () => {
  boardApplications = [{ id: 'application-closed', positionId: 'position-closed', status: 'offer_pending',
    offer: { expiresAt: '2030-06-01T00:00:00.000Z' },
    position: { id: 'position-closed', jobId: 'job-closed', status: 'closed', revision: 'revision-1', reviewRequired: true,
      reviewReason: 'closed', title: 'Opdracht wordt opnieuw gecontroleerd' } }]
  render(<WorkBoard />)

  expect(await screen.findByText(/De aannemer heeft deze positie gesloten/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Aanbod accepteren' })).toBeNull()
})

it('lets an applicant update declared skills from the worker portal', async () => {
  const user = userEvent.setup()
  render(<WorkBoard />)

  const skills = await screen.findByLabelText("Vaardigheden, gescheiden door komma's")
  expect(skills.value).toBe('Carpenter')
  fireEvent.change(skills, { target: { value: 'Carpenter, Tiler' } })
  await user.click(screen.getByRole('button', { name: 'Vaardigheden bijwerken' }))

  expect(await screen.findByText('Je opgegeven vaardigheden zijn bijgewerkt. Toelating en plaatsing blijven afzonderlijk gecontroleerd.')).toBeTruthy()
  await waitFor(() => expect(companyFetch).toHaveBeenCalledWith('/api/work-board/profile/skills', expect.objectContaining({ method: 'POST' })))
  expect(profileSkills).toEqual(['Carpenter', 'Tiler'])
})

it('lets an applicant update preferred work regions or choose nationwide availability', async () => {
  const user = userEvent.setup()
  render(<WorkBoard />)

  const regions = await screen.findByLabelText('Werkgebieden')
  await waitFor(() => expect(regions.value).toBe('Arnhem'))
  fireEvent.change(regions, { target: { value: 'Nijmegen, Lent' } })
  await user.click(screen.getByRole('button', { name: 'Werkgebied bijwerken' }))

  expect(await screen.findByText('Je werkgebiedvoorkeur is bijgewerkt. Afstand of reistijd wordt hiermee niet berekend.')).toBeTruthy()
  expect(profileRegions).toEqual(['Nijmegen', 'Lent'])
  await waitFor(() => expect(companyFetch).toHaveBeenCalledWith('/api/work-board/profile/regions', expect.objectContaining({
    method: 'POST', body: JSON.stringify({ regions: ['Nijmegen', 'Lent'], allRegions: false })
  })))

  await user.click(screen.getByLabelText('Heel Nederland'))
  expect(screen.getByLabelText('Werkgebieden').disabled).toBe(true)
  await user.click(screen.getByRole('button', { name: 'Werkgebied bijwerken' }))
  expect(await screen.findByText('Je werkgebiedvoorkeur is bijgewerkt. Afstand of reistijd wordt hiermee niet berekend.')).toBeTruthy()
  expect(allRegions).toBe(true)
})

it('filters open positions by free-text and trade without hiding the full offer permanently', async () => {
  boardPositions = [
    { id: 'position-1', title: 'Keukenmontage', role: 'Timmerman', city: 'Nijmegen', description: 'Keuken plaatsen', startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, rate: 45, capacity: 1, filled: 0, materials: 'Aanwezig', equipment: 'Eigen gereedschap', prerequisites: 'Dagstart', revision: 'r1', materialsReady: true },
    { id: 'position-2', title: 'Elektrisch onderhoud', role: 'Elektricien', city: 'Arnhem', description: 'Groepenkast inspecteren', startsAt: '2030-06-02T08:00:00Z', endsAt: '2030-06-02T12:00:00Z', hours: 4, rate: 48, capacity: 1, filled: 0, materials: 'Aanwezig', equipment: 'Meetgereedschap', prerequisites: 'VCA', revision: 'r2', materialsReady: true }
  ]
  const user = userEvent.setup()
  render(<WorkBoard />)

  expect(await screen.findByText('Keukenmontage')).toBeTruthy()
  expect(screen.getByText('Elektrisch onderhoud')).toBeTruthy()
  await user.selectOptions(screen.getByLabelText('Vakgebied'), 'Timmerman')
  expect(screen.getByText('Keukenmontage')).toBeTruthy()
  expect(screen.queryByText('Elektrisch onderhoud')).toBeNull()
  await user.clear(screen.getByLabelText('Zoek op opdracht of plaats'))
  await user.type(screen.getByLabelText('Zoek op opdracht of plaats'), 'Arnhem')
  expect(screen.getByText('Geen open posities gevonden. Pas je zoekterm of vakgebied aan.')).toBeTruthy()
  await user.selectOptions(screen.getByLabelText('Vakgebied'), '')
  expect(screen.getByText('Elektrisch onderhoud')).toBeTruthy()
  expect(screen.queryByText('Keukenmontage')).toBeNull()
})
