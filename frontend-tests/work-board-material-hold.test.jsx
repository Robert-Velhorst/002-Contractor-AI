import { afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import WorkBoard from '../WorkBoard'

afterEach(() => { vi.unstubAllGlobals(); window.sessionStorage.clear() })

it('shows the schedule and duration of the placed position in its assigned work pack', async () => {
  window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
  const position = { id: 'position-assigned', title: 'Keukenmontage', jobId: 'job-1', city: 'Arnhem', startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z' }
  const pack = { positionId: position.id, positionAssignment: { role: 'Timmerman', scheduledStart: '2030-06-01T08:00:00Z', scheduledEnd: '2030-06-01T16:00:00Z', allocationHours: 8 }, job: { title: position.title, address: 'Teststraat 1', city: 'Arnhem' }, do: [], know: { workContext: null, instructions: [] }, have: { materials: [], equipment: [] }, can: [], checks: { quality: [], photos: [] }, sourceHash: 'a'.repeat(64) }
  const json = value => ({ ok: true, status: 200, headers: new Headers(), json: async () => value })
  vi.stubGlobal('fetch', vi.fn(async url => {
    if (url === '/api/session') return json({ identity: null })
    if (url.endsWith('/me')) return json({ account: { id: 'account-own', name: 'Rosa', status: 'admitted' }, applications: [{ id: 'app-1', positionId: position.id, status: 'assigned', position }] })
    if (url.endsWith('/positions')) return json({ positions: [] })
    if (url.endsWith('/availability')) return json({ availability: { periods: [], conflicts: [] } })
    if (url.endsWith(`/positions/${position.id}/pack`)) return json({ pack })
    return json({})
  }))
  render(<WorkBoard />)
  fireEvent.click(await screen.findByRole('button', { name: 'Werkpakket openen' }))
  expect(await screen.findByRole('heading', { name: 'Mijn ingeplande dienst' })).toBeTruthy()
  expect(screen.getByText('8 toegewezen uren')).toBeTruthy()
  expect(screen.getByText(/Timmerman/)).toBeTruthy()
})

it('shows pre-enrollment blockers without submitting an application', async () => {
  window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
  const position = { id: 'position-conflict', title: 'Dakisolatie', city: 'Arnhem', role: 'Carpenter', startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, rate: 45, capacity: 1, filled: 0, description: 'Dak voorbereiden', materials: 'Aannemer levert', equipment: 'Handgereedschap', prerequisites: 'Controleer materiaal', revision: 'revision-1', materialsReady: true, workPackageCurrent: true }
  const json = value => ({ ok: true, status: 200, headers: new Headers(), json: async () => value })
  const fetcher = vi.fn(async url => {
    if (url === '/api/session') return json({ identity: null })
    if (url.endsWith('/me')) return json({ account: { id: 'account-own', name: 'Rosa', status: 'admitted' }, applications: [] })
    if (url.endsWith('/positions')) return json({ positions: [position] })
    if (url.endsWith('/enrollment-check')) return json({ check: { canApply: false, revision: position.revision, blockers: ['Deze periode overlapt met een andere opdracht in je planning.'], advisories: [] } })
    return json({})
  })
  vi.stubGlobal('fetch', fetcher)
  render(<WorkBoard />)

  fireEvent.click(await screen.findByRole('button', { name: 'Voorwaarden accepteren en inschrijven' }))
  expect(await screen.findByText(/overlapt met een andere opdracht in je planning/)).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Opnieuw controleren' })).toBeTruthy()
  expect(fetcher).toHaveBeenCalledWith('/api/work-board/positions/position-conflict/enrollment-check', expect.objectContaining({ method: 'GET' }))
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/enroll'))).toBe(false)
})

it('blocks interest when the published work package needs owner review', async () => {
  window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
  const position = { id: 'position-stale', title: 'Dakisolatie', city: 'Arnhem', role: 'Carpenter', startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, rate: 45, capacity: 1, filled: 0, description: 'Dak voorbereiden', materials: 'Isolatie: 10 m2', equipment: 'Handgereedschap', prerequisites: 'Controleer materiaal', revision: 'revision-1', materialsReady: true, workPackageCurrent: false }
  const json = value => ({ ok: true, status: 200, headers: new Headers(), json: async () => value })
  const fetcher = vi.fn(async url => {
    if (url === '/api/session') return json({ identity: null })
    if (url.endsWith('/me')) return json({ account: { name: 'Rosa', status: 'admitted' }, applications: [] })
    if (url.endsWith('/positions')) return json({ positions: [position] })
    return json({})
  })
  vi.stubGlobal('fetch', fetcher)
  render(<WorkBoard />)

  expect(await screen.findByText(/De gekoppelde werkzaamheid of het werkpakket is gewijzigd/)).toBeTruthy()
  const enroll = screen.getByRole('button', { name: 'Wacht op herbeoordeling' })
  expect(enroll.closest('fieldset').disabled).toBe(true)
  expect(enroll.matches(':disabled')).toBe(true)
  expect(fetcher.mock.calls.some(([url]) => String(url).endsWith('/enroll'))).toBe(false)
})

it('explains that interest is not placement while linked materials remain unverified', async () => {
  window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
  let submitted = false
  const position = { id: 'position-1', title: 'Dakisolatie', city: 'Arnhem', role: 'Carpenter', startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, rate: 45, capacity: 1, filled: 0, description: 'Dak voorbereiden', materials: 'Isolatie: 10 m2', equipment: 'Handgereedschap', prerequisites: 'Controleer materiaal', revision: 'revision-1', materialsReady: false }
  const json = value => ({ ok: true, status: 200, headers: new Headers(), json: async () => value })
  const fetcher = vi.fn(async url => {
    if (url === '/api/session') return json({ identity: null })
    if (url.endsWith('/enrollment-check')) return json({ check: { canApply: true, revision: position.revision, blockers: [], advisories: [] } })
    if (url.endsWith('/enroll')) { submitted = true; return json({ application: { status: 'interested', holdReason: 'materials_or_source' } }) }
    if (url.endsWith('/me')) return json({ account: { name: 'Rosa', status: 'admitted' }, applications: submitted ? [{ id: 'app-1', positionId: position.id, status: 'interested', holdReason: 'materials_or_source', position }] : [] })
    if (url.endsWith('/positions')) return json({ positions: [position] })
    return json({})
  })
  vi.stubGlobal('fetch', fetcher)
  render(<WorkBoard />)

  expect(await screen.findByText(/Materialen of opdrachtbron worden nog gecontroleerd/)).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: /Voorwaarden accepteren en inschrijven/ }))
  expect(await screen.findByText(/De aannemer kan je plaatsen zodra materialen en opdrachtinformatie gecontroleerd zijn/)).toBeTruthy()
  expect(await screen.findByText(/plaatsing wacht op gecontroleerde materialen of bijgewerkte opdrachtinformatie/)).toBeTruthy()
})

it('lets an admitted worker report unavailability and shows affected assignments', async () => {
  window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
  const conflict = { assignmentId: 'assignment-1', periodId: 'period-1', jobTitle: 'Badkamer renovatie', scheduledStart: '2030-06-01T08:00:00Z', scheduledEnd: '2030-06-01T16:00:00Z' }
  const fetcher = vi.fn(async (url, options = {}) => {
    if (url === '/api/session') return json({ identity: null })
    if (url.endsWith('/me')) return json({ account: { name: 'Rosa', status: 'admitted' }, applications: [] })
    if (url.endsWith('/positions')) return json({ positions: [] })
    if (url.endsWith('/availability') && options.method === 'POST') return json({ period: { id: 'period-1' }, conflicts: [conflict] })
    if (url.endsWith('/availability')) return json({ availability: { periods: [], conflicts: [conflict] } })
    return json({})
  })
  vi.stubGlobal('fetch', fetcher)
  render(<WorkBoard />)

  fireEvent.change(await screen.findByLabelText('Vanaf'), { target: { value: '2030-06-01T08:00' } })
  fireEvent.change(screen.getByLabelText('Tot'), { target: { value: '2030-06-01T16:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Verhindering melden' }))

  expect(await screen.findByText('Badkamer renovatie')).toBeTruthy()
  expect(await screen.findByText(/1 geplande opdracht is geraakt/)).toBeTruthy()
  expect(fetcher).toHaveBeenCalledWith('/api/work-board/availability', expect.objectContaining({ method: 'POST' }))
  expect(await screen.findByText(/geen medische details gevraagd/)).toBeTruthy()
})

it('records a standby window and holds overlapping position interest for contractor review', async () => {
  window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
  let applied = false
  const position = { id: 'position-standby', title: 'Keukenmontage', city: 'Arnhem', role: 'Carpenter', startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, rate: 45, capacity: 1, filled: 0, description: 'Monteren', materials: 'Op locatie', equipment: 'Eigen gereedschap', prerequisites: 'Dagstart', revision: 'revision-standby', materialsReady: true }
  const fetcher = vi.fn(async (url, options = {}) => {
    if (url === '/api/session') return json({ identity: null })
    if (url.endsWith('/enrollment-check')) return json({ check: { canApply: true, revision: position.revision, blockers: [], advisories: ['Je staat in deze periode op standby; de aannemer moet je belangstelling beoordelen.'] } })
    if (url.endsWith('/me')) return json({ account: { name: 'Rosa', status: 'admitted' }, applications: applied ? [{ id: 'app-standby', positionId: position.id, status: 'interested', holdReason: 'standby_confirmation_required', holdReasons: ['standby_confirmation_required'], position }] : [] })
    if (url.endsWith('/positions')) return json({ positions: [position] })
    if (url.endsWith('/availability') && options.method === 'POST') return json({ period: { id: 'standby-period', periodType: 'standby' }, conflicts: [] })
    if (url.endsWith('/availability')) return json({ availability: { periods: [{ id: 'standby-period', periodType: 'standby', startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', status: 'active' }], conflicts: [] } })
    if (url.endsWith('/enroll')) { applied = true; return json({ application: { status: 'interested', holdReason: 'standby_confirmation_required' } }) }
    return json({})
  })
  vi.stubGlobal('fetch', fetcher)
  render(<WorkBoard />)

  fireEvent.click(await screen.findByRole('button', { name: 'Standby op afroep' }))
  fireEvent.change(screen.getByLabelText('Vanaf'), { target: { value: '2030-06-01T08:00' } })
  fireEvent.change(screen.getByLabelText('Tot'), { target: { value: '2030-06-01T16:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Standby vastleggen' }))
  expect(await screen.findByText(/Standby geregistreerd/)).toBeTruthy()
  expect(fetcher).toHaveBeenCalledWith('/api/work-board/availability', expect.objectContaining({ method: 'POST', body: expect.stringContaining('"mode":"standby"') }))

  fireEvent.click(screen.getByRole('button', { name: 'Voorwaarden accepteren en inschrijven' }))
  expect(await screen.findByText(/De aannemer beoordeelt je belangstelling voordat er een plaatsing komt/)).toBeTruthy()
  expect(await screen.findByRole('button', { name: 'Standby, beoordeling vereist' })).toBeTruthy()
})

function json(value) { return { ok: true, status: 200, headers: new Headers(), json: async () => value } }
