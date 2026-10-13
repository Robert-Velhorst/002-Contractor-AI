import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import WorkBoard from '../WorkBoard'
import { draftScopeFingerprint, readSessionDraft, removeSessionDraft } from '../draft-recovery'

const respond = body => ({ ok: true, status: 200, headers: new Headers(), json: async () => body })

describe('worker standby call-outs', () => {
  afterEach(() => {
    removeSessionDraft(window.sessionStorage, `worker:${draftScopeFingerprint('availability-draft-worker')}`, 'availability-report')
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('lets an assigned worker request a reviewed release without sharing personal details', async () => {
    window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
    let releaseRequest = null
    const application = { id: 'application-assigned', positionId: 'position-assigned', status: 'assigned', assignmentId: 'assignment-own',
      assignmentStatus: 'planned', position: { id: 'position-assigned', title: 'Dak repareren', startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', city: 'Arnhem' } }
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      calls.push({ url, options })
      if (url === '/api/session') return respond({})
      if (url === '/api/work-board/me' && options.method === 'GET') return respond({ success: true,
        account: { id: 'account-own', name: 'Rosa', status: 'admitted' },
        applications: [{ ...application, releaseRequest }], standbyCallouts: [] })
      if (url === '/api/work-board/positions') return respond({ success: true, positions: [] })
      if (url === '/api/work-board/availability') return respond({ success: true, availability: { periods: [], conflicts: [] } })
      if (url === `/api/work-board/applications/${application.id}/release-request`) {
        releaseRequest = { id: 'approval-own', status: 'pending', reasonCategory: 'family_care' }
        return respond({ success: true, request: releaseRequest })
      }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<WorkBoard />)
    const form = await screen.findByRole('form', { name: 'Verzoek wijziging Dak repareren' })
    fireEvent.change(screen.getByLabelText('Reden'), { target: { value: 'family_care' } })
    fireEvent.submit(form)
    expect(await screen.findByText(/Je verzoek tot vrijgave wacht op beoordeling/)).toBeTruthy()
    const submitted = calls.find(call => call.url.endsWith('/release-request'))
    expect(JSON.parse(submitted.options.body)).toEqual({ reasonCategory: 'family_care' })
    expect(screen.getByText(/plaatsing blijft actief totdat de aannemer het verzoek heeft beoordeeld/)).toBeTruthy()
  })

  it('shows the durable worker inbox and marks an item read without losing it', async () => {
    window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
    const notification = { id: 'notice-field-reply-1', type: 'field_reply', title: 'Antwoord op je werkvraag', href: '/work-board.html#applications',
      body: 'Badkamer renovatie · Gebruik de vrijgegeven tekening revisie B.',
      createdAt: '2026-09-26T10:00:00.000Z', readAt: null }
    let read = false
    const fetchMock = vi.fn(async (url, options = {}) => {
      if (url === '/api/session') return respond({})
      if (url === '/api/work-board/me') return respond({ success: true,
        account: { id: 'account-own', name: 'Rosa', status: 'admitted' }, applications: [], standbyCallouts: [],
        notifications: { notifications: [{ ...notification, readAt: read ? '2026-09-26T10:01:00.000Z' : null }], unreadCount: read ? 0 : 1 } })
      if (url === '/api/work-board/positions') return respond({ success: true, positions: [] })
      if (url === '/api/work-board/availability') return respond({ success: true, availability: { periods: [], conflicts: [] } })
      if (url === `/api/work-board/notifications/${notification.id}/read` && options.method === 'POST') { read = true; return respond({ success: true, notification: { ...notification, readAt: '2026-09-26T10:01:00.000Z' } }) }
      if (url === '/api/work-board/notifications') return respond({ success: true,
        notifications: [{ ...notification, readAt: read ? '2026-09-26T10:01:00.000Z' : null }], unreadCount: read ? 0 : 1 })
      throw new Error(`Unexpected request: ${url}`)
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<WorkBoard />)
    expect(await screen.findByText('Antwoord op je werkvraag')).toBeTruthy()
    expect(screen.getByText('1 ongelezen')).toBeTruthy()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Markeer als gelezen: Antwoord op je werkvraag' })) })
    expect(await screen.findByText('0 ongelezen')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Markeer als gelezen: Antwoord op je werkvraag' })).toBeNull()
    expect(screen.getByText(notification.body)).toBeTruthy()
    expect(screen.getByRole('link', { name: notification.title }).getAttribute('href')).toBe('/work-board.html#applications')
  })

  it('refreshes new call-outs and open positions while the worker board is visible', async () => {
    window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
    let changed = false
    let poll
    const callout = { id: 'callout-new', jobTitle: 'Roof repair', city: 'Arnhem', role: 'Carpenter', status: 'offered', expiresAt: '2030-06-01T07:00:00Z', snapshot: { scheduledStart: '2030-06-01T08:00:00Z', scheduledEnd: '2030-06-01T12:00:00Z' } }
    const position = { id: 'position-new', title: 'New roof position', city: 'Arnhem', role: 'Carpenter', startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, rate: 45,
      description: 'Install roof battens', materials: 'On site', equipment: 'Hand tools', prerequisites: 'Read the work pack', capacity: 1, filled: 0, materialsReady: true, revision: 'revision-1', status: 'open' }
    vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible')
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
    vi.spyOn(window, 'setInterval').mockImplementation(callback => { poll = callback; return 1 })
    vi.spyOn(window, 'clearInterval').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (url === '/api/session') return respond({})
      if (url === '/api/work-board/me') return respond({ success: true, account: { id: 'account-own', name: 'Rosa', status: 'admitted' }, applications: [], standbyCallouts: changed ? [callout] : [] })
      if (url === '/api/work-board/positions') return respond({ success: true, positions: changed ? [position] : [] })
      if (url === '/api/work-board/availability') return respond({ success: true, availability: { periods: [], conflicts: [] } })
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<WorkBoard />)
    expect(await screen.findByRole('heading', { name: 'Beschikbaar werk' })).toBeTruthy()
    expect(poll).toBeTypeOf('function')
    expect(document.visibilityState).toBe('visible')
    expect(navigator.onLine).toBe(true)
    changed = true
    await act(async () => { await poll() })
    expect(await screen.findByRole('heading', { name: 'New roof position' }, { timeout: 5000 })).toBeTruthy()
    expect(screen.getByText(/Nieuwe afroep ontvangen: Roof repair · Carpenter/)).toBeTruthy()
    expect(screen.getByText(/Nieuwe open positie: New roof position · Arnhem/)).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith('/api/work-board/me', expect.objectContaining({ method: 'GET' }))
    expect(fetch).toHaveBeenCalledWith('/api/work-board/positions', expect.objectContaining({ method: 'GET' }))
  })

  it('shows only the signed-in worker call-out and records explicit acceptance', async () => {
    window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
    let state = 'offered'
    const callout = { id: 'callout-own', jobTitle: 'Kitchen installation', city: 'Arnhem', role: 'Carpenter', status: state, expiresAt: '2030-06-01T07:00:00Z', snapshot: { role: 'Carpenter', scheduledStart: '2030-06-01T08:00:00Z', scheduledEnd: '2030-06-01T12:00:00Z' }, reason: 'Requested help.' }
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/session') return respond({})
      if (url === '/api/work-board/me' && options.method === 'POST') { state = 'accepted'; return respond({ success: true, callout: { ...callout, status: state } }) }
      if (url === '/api/work-board/me') return respond({ success: true, account: { id: 'account-own', name: 'Rosa', status: 'admitted' }, applications: [], standbyCallouts: [{ ...callout, status: state }] })
      if (url === '/api/work-board/positions') return respond({ success: true, positions: [] })
      if (url === '/api/work-board/availability') return respond({ success: true, availability: { periods: [], conflicts: [] } })
      if (url === '/api/work-board/standby-callouts/callout-own/respond') { state = 'accepted'; return respond({ success: true, callout: { ...callout, status: state } }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<WorkBoard />)
    expect(await screen.findByRole('heading', { name: 'Kitchen installation · Carpenter' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Accepteren' }))
    expect(await screen.findByText('Geaccepteerd; wacht op voorstel van de aannemer.')).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith('/api/work-board/standby-callouts/callout-own/respond', expect.objectContaining({ method: 'POST' }))
  })

  it('lets an admitted worker retain a minimum notice requirement on standby', async () => {
    window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      calls.push({ url, options })
      if (url === '/api/session') return respond({})
      if (url === '/api/work-board/me') return respond({ success: true, account: { id: 'account-own', name: 'Rosa', status: 'admitted' }, applications: [], standbyCallouts: [] })
      if (url === '/api/work-board/positions') return respond({ success: true, positions: [] })
      if (url === '/api/work-board/availability' && options.method === 'POST') return respond({ success: true, period: { id: 'standby-24h', minimumNoticeHours: 24 }, conflicts: [] })
      if (url === '/api/work-board/availability') return respond({ success: true, availability: { periods: [], conflicts: [] } })
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<WorkBoard />)
    expect(await screen.findByRole('heading', { name: 'Beschikbaarheid melden' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Standby op afroep' }))
    expect(screen.queryByLabelText('Ik weet nog niet wanneer ik terug ben')).toBeNull()
    fireEvent.change(screen.getByLabelText('Minimale aankondigingstijd'), { target: { value: '24' } })
    fireEvent.click(screen.getByRole('button', { name: 'Standby vastleggen' }))
    await waitFor(() => expect(calls.some(call => call.url === '/api/work-board/availability' && call.options.method === 'POST')).toBe(true))
    const submitted = calls.find(call => call.url === '/api/work-board/availability' && call.options.method === 'POST')
    expect(JSON.parse(submitted.options.body)).toMatchObject({ mode: 'standby', minimumNoticeHours: 24 })
  })

  it('explains when a sudden unavailability invalidates an accepted standby call-out', async () => {
    window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/session') return respond({})
      if (url === '/api/work-board/me') return respond({ success: true, account: { id: 'account-own', name: 'Rosa', status: 'admitted' }, applications: [], standbyCallouts: [] })
      if (url === '/api/work-board/positions') return respond({ success: true, positions: [] })
      if (url === '/api/work-board/availability' && options.method === 'POST') return respond({ success: true, period: { id: 'absence-new' }, conflicts: [], invalidatedCallouts: [{ calloutId: 'callout-old', approvalId: 'approval-old' }] })
      if (url === '/api/work-board/availability') return respond({ success: true, availability: { periods: [], conflicts: [] } })
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<WorkBoard />)
    expect(await screen.findByRole('heading', { name: 'Beschikbaarheid melden' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Vanaf'), { target: { value: '2030-06-01T08:00' } })
    fireEvent.change(screen.getByLabelText('Tot'), { target: { value: '2030-06-01T16:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Verhindering melden' }))
    expect(await screen.findByText(/1 open standby-oproep is ingetrokken; de aannemer moet opnieuw naar de bezetting kijken/)).toBeTruthy()
  })

  it('shows a concrete position offer and does not allow re-enrollment while waiting for a response', async () => {
    window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
    const position = { id: 'position-offer', title: 'Dakwerk', city: 'Arnhem', role: 'Carpenter', startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, rate: 45,
      description: 'Dakpannen leggen', materials: 'Op locatie', equipment: 'Gereedschap', prerequisites: 'Dagstart', capacity: 1, filled: 0, materialsReady: true, revision: 'revision-offer', status: 'open' }
    let status = 'offer_pending'
    const application = { id: 'application-offer', positionId: position.id, status, assignmentId: null, offer: { status: 'offered', expiresAt: new Date(Date.now() + 3600000).toISOString() }, position }
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/session') return respond({})
      if (url === '/api/work-board/me' && options.method === 'POST') { status = 'assigned'; return respond({ success: true, application: { ...application, status, assignmentId: 'assignment-offer', offer: { ...application.offer, status: 'accepted' } } }) }
      if (url === '/api/work-board/me') return respond({ success: true, account: { id: 'account-own', name: 'Rosa', status: 'admitted' }, applications: [{ ...application, status, assignmentId: status === 'assigned' ? 'assignment-offer' : null }], standbyCallouts: [] })
      if (url === '/api/work-board/positions') return respond({ success: true, positions: [{ ...position, filled: status === 'assigned' ? 1 : 0 }] })
      if (url === '/api/work-board/availability') return respond({ success: true, availability: { periods: [], conflicts: [] } })
      if (url === `/api/work-board/applications/${application.id}/offer/respond`) { status = 'assigned'; return respond({ success: true, application: { ...application, status, assignmentId: 'assignment-offer', offer: { ...application.offer, status: 'accepted' } } }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<WorkBoard />)
    expect(await screen.findByText(/Je hebt een concreet aanbod/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Aanbod accepteren' }).disabled).toBe(false)
    expect(screen.getByRole('button', { name: 'Concreet aanbod ontvangen' }).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Aanbod accepteren' }))
    expect(await screen.findByText(/Aanbod geaccepteerd en intern gepland/)).toBeTruthy()
    expect(await screen.findByRole('button', { name: 'Werkpakket openen' })).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith(`/api/work-board/applications/${application.id}/offer/respond`, expect.objectContaining({ method: 'POST' }))
  })

  it('lets the signed-in worker withdraw open interest without changing an assignment', async () => {
    window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
    let status = 'interested'
    const application = { id: 'application-own', positionId: 'position-1', status, assignmentId: null,
      position: { title: 'Temporary carpenter', startsAt: '2030-06-01T08:00:00Z', city: 'Arnhem', revision: 'revision-1', status: 'open' } }
    const position = { ...application.position, id: application.positionId, role: 'Carpenter', endsAt: '2030-06-01T16:00:00Z', hours: 8, rate: 45,
      description: 'Temporary installation', materials: 'Provided', equipment: 'Tools', prerequisites: 'Read work pack', capacity: 1, filled: 0, materialsReady: true }
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/session') return respond({})
      if (url === '/api/work-board/me' && options.method === 'POST') { status = 'withdrawn'; return respond({ success: true, application: { ...application, status } }) }
      if (url === '/api/work-board/me') return respond({ success: true, account: { id: 'account-own', name: 'Rosa', status: 'admitted' },
        applications: [{ ...application, status }], standbyCallouts: [] })
      if (url === '/api/work-board/positions') return respond({ success: true, positions: [{ ...position, filled: status === 'assigned' ? 1 : 0 }] })
      if (url === '/api/work-board/availability') return respond({ success: true, availability: { periods: [], conflicts: [] } })
      if (url === '/api/work-board/applications/application-own/withdraw') { status = 'withdrawn'; return respond({ success: true, application: { ...application, status } }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<WorkBoard />)
    await screen.findAllByRole('heading', { name: 'Temporary carpenter' })
    fireEvent.click(screen.getByRole('button', { name: 'Belangstelling intrekken' }))
    expect(await screen.findByText(/Je belangstelling is ingetrokken/)).toBeTruthy()
    expect(await screen.findByText(/Belangstelling ingetrokken/)).toBeTruthy()
    expect(fetch).toHaveBeenCalledWith('/api/work-board/applications/application-own/withdraw', expect.objectContaining({ method: 'POST' }))
  })

  it('shows the worker their waitlist rank and lets them leave the queue', async () => {
    window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
    let status = 'waitlisted'
    const application = { id: 'application-queue', positionId: 'position-full', status, waitlistPosition: 2, assignmentId: null,
      position: { title: 'Roof repair', startsAt: '2030-06-01T08:00:00Z', city: 'Arnhem', revision: 'revision-queue', status: 'open' } }
    const position = { ...application.position, id: application.positionId, role: 'Carpenter', endsAt: '2030-06-01T16:00:00Z', hours: 8, rate: 45,
      description: 'Repair', materials: 'Provided', equipment: 'Tools', prerequisites: 'Read work pack', capacity: 1, filled: 1, materialsReady: true }
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/session') return respond({})
      if (url === '/api/work-board/me') return respond({ success: true, account: { id: 'account-own', name: 'Rosa', status: 'admitted' },
        applications: [{ ...application, status }], standbyCallouts: [] })
      if (url === '/api/work-board/positions') return respond({ success: true, positions: [position] })
      if (url === '/api/work-board/availability') return respond({ success: true, availability: { periods: [], conflicts: [] } })
      if (url === '/api/work-board/applications/application-queue/withdraw' && options.method === 'POST') { status = 'withdrawn'; return respond({ success: true, application: { ...application, status } }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<WorkBoard />)
    expect(await screen.findByText(/Op de wachtlijst · plek 2/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Wachtlijst verlaten' }))
    expect(await screen.findByText('Je wachtlijstplek is ingetrokken.')).toBeTruthy()
    expect(await screen.findByText(/Belangstelling ingetrokken/)).toBeTruthy()
  })

  it('reports task-linked blockers from the assigned worker work pack', async () => {
    window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
    const application = { id: 'application-assigned', positionId: 'position-1', status: 'assigned', assignmentId: 'assignment-1',
      position: { title: 'Roof repair', startsAt: '2030-06-01T08:00:00Z', city: 'Arnhem', revision: 'revision-1', status: 'open' } }
    const pack = { positionId: 'position-1', sourceHash: 'a'.repeat(64), job: { id: 'job-1', title: 'Roof repair', address: 'Worksite 4', city: 'Arnhem' },
      do: [{ id: 'task-1', title: 'Roof battens', description: 'Install the released detail.', status: 'open' }],
      know: { instructions: [], workContext: { balance: [], installedAssets: [], deliveries: [], places: [], contacts: [], packages: [] } },
      have: { materials: [], equipment: [] } }
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      if (url === '/api/session') return respond({})
      if (url === '/api/work-board/me') return respond({ success: true, account: { id: 'account-own', name: 'Rosa', status: 'admitted' }, applications: [application], standbyCallouts: [] })
      if (url === '/api/work-board/positions') return respond({ success: true, positions: [] })
      if (url === '/api/work-board/availability') return respond({ success: true, availability: { periods: [], conflicts: [] } })
      if (url === '/api/work-board/positions/position-1/pack') return respond({ success: true, pack })
      if (url === '/api/work-board/positions/position-1/progress' && options.method === 'POST') { calls.push(JSON.parse(options.body)); return respond({ success: true, replayed: false, record: { progress: { taskId: 'task-1' } } }) }
      throw new Error(`Unexpected request: ${url}`)
    }))
    render(<WorkBoard />)
    fireEvent.click(await screen.findByRole('button', { name: 'Werkpakket openen' }))
    expect(await screen.findByRole('heading', { name: 'Voortgang of blokkade melden' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Geblokkeerd' }))
    fireEvent.change(screen.getByLabelText('Wat houdt het werk tegen?'), { target: { value: 'De bestelde bevestigingsmaterialen ontbreken.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Blokkade melden' }))
    expect(await screen.findByText('Blokkade vastgelegd voor de aannemer. De opdrachtstatus is niet automatisch gewijzigd.')).toBeTruthy()
    expect(calls[0]).toMatchObject({ taskId: 'task-1', status: 'blocked', sourceHash: pack.sourceHash, note: 'De bestelde bevestigingsmaterialen ontbreken.' })
    expect(calls[0].entryKey).toMatch(/^[a-f0-9-]{36}$/)
  })

  it('lets an admitted worker request an early return without clearing the availability block', async () => {
    window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
    let status = 'active'
    const period = { id: 'availability-own', workerId: 'account-own', periodType: 'unavailable', title: 'Niet beschikbaar', status,
      startsAt: '2030-06-01T08:00:00.000Z', endsAt: '2030-06-02T08:00:00.000Z', returnUnknown: false }
    const calls = []
    vi.stubGlobal('fetch', vi.fn(async (url, options = {}) => {
      calls.push({ url, options })
      if (url === '/api/session') return respond({})
      if (url === '/api/work-board/me') return respond({ success: true, account: { id: 'account-own', name: 'Rosa', status: 'admitted' }, applications: [], standbyCallouts: [] })
      if (url === '/api/work-board/positions') return respond({ success: true, positions: [] })
      if (url === '/api/work-board/availability' && options.method !== 'POST') return respond({ success: true, availability: {
        periods: [{ ...period, status, cancellationApprovalId: status === 'pending_cancellation' ? 'approval-own' : null }],
        conflicts: [{ periodId: period.id, assignmentId: 'assignment-own', jobTitle: 'Dakrenovatie', status }]
      } })
      if (url === `/api/work-board/availability/${period.id}/request-cancellation` && options.method === 'POST') {
        status = 'pending_cancellation'
        return respond({ success: true, period: { ...period, status }, approvalId: 'approval-own', replayed: false })
      }
      throw new Error(`Unexpected request: ${url}`)
    }))

    render(<WorkBoard />)
    expect(await screen.findByRole('heading', { name: 'Beschikbaarheid melden' })).toBeTruthy()
    fireEvent.click(screen.getByText('Gemelde beschikbaarheidsperioden'))
    fireEvent.click(screen.getByRole('button', { name: 'Eerder beschikbaar melden' }))
    expect(await screen.findByText(/blijft actief totdat de aannemer de wijziging heeft beoordeeld/)).toBeTruthy()
    expect(screen.getByText(/wijziging in beoordeling/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Eerder beschikbaar melden' })).toBeNull()
    expect(calls.some(call => call.url === `/api/work-board/availability/${period.id}/request-cancellation` && call.options.method === 'POST')).toBe(true)
  })

  it('restores an unfinished availability report after the worker board reloads', async () => {
    const workerId = 'availability-draft-worker'
    const scope = `worker:${draftScopeFingerprint(workerId)}`
    removeSessionDraft(window.sessionStorage, scope, 'availability-report')
    window.sessionStorage.setItem('contractor.work-board.session', 'worker-session')
    vi.spyOn(window, 'setInterval').mockImplementation(() => 1)
    vi.spyOn(window, 'clearInterval').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async url => {
      if (url === '/api/session') return respond({})
      if (url === '/api/work-board/me') return respond({ success: true, account: { id: workerId, name: 'Rosa', status: 'admitted' }, applications: [], standbyCallouts: [] })
      if (url === '/api/work-board/positions') return respond({ success: true, positions: [] })
      if (url === '/api/work-board/availability') return respond({ success: true, availability: { periods: [], conflicts: [] } })
      throw new Error(`Unexpected request: ${url}`)
    }))

    const first = render(<WorkBoard />)
    expect(await screen.findByRole('heading', { name: 'Beschikbaarheid melden' })).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Vanaf'), { target: { value: '2030-06-01T08:00' } })
    fireEvent.click(screen.getByLabelText('Ik weet nog niet wanneer ik terug ben'))
    fireEvent.change(screen.getByLabelText('Wanneer opnieuw afstemmen'), { target: { value: '2030-06-02T09:00' } })
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 220)) })
    expect(readSessionDraft(window.sessionStorage, scope, 'availability-report').value).toMatchObject({ mode: 'unavailable', startsAt: '2030-06-01T08:00', returnUnknown: true, reviewAt: '2030-06-02T09:00' })
    first.unmount()

    render(<WorkBoard />)
    await waitFor(() => {
      expect(screen.getByLabelText('Vanaf').value).toBe('2030-06-01T08:00')
      expect(screen.getByLabelText('Ik weet nog niet wanneer ik terug ben').checked).toBe(true)
      expect(screen.getByLabelText('Wanneer opnieuw afstemmen').value).toBe('2030-06-02T09:00')
    })
    removeSessionDraft(window.sessionStorage, scope, 'availability-report')
  })
})
