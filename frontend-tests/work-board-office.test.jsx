import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import WorkBoardOffice from '../components/WorkBoardOffice'

describe('position publication controls', () => {
  it('publishes a position restricted to a registered subcontractor', async () => {
    const api = vi.fn().mockResolvedValue({ positions: [], suggestions: [], applications: [], workPackages: [],
      tradePartners: [{ id: 'partner-north', name: 'Dakbouw Noord' }] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)
    fireEvent.click(await screen.findByText('Positie vrijgeven', { selector: 'summary' }))
    fireEvent.change(screen.getByLabelText('Voor wie is deze positie?'), { target: { value: 'partner-north' } })
    fireEvent.click(screen.getByRole('button', { name: 'Concept bewaren' }))
    await screen.findByText(/Concept veilig opgeslagen/)
    const payload = JSON.parse(api.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
    expect(payload.targetTradePartnerId).toBe('partner-north')
  })

  it('requires an owner reference to link a worker to an existing subcontractor', async () => {
    const api = vi.fn().mockResolvedValue({ accounts: [{ id: 'worker-2', name: 'Sam Uitvoerder', email: 'sam@example.test', phone: '0612345678',
      skills: ['Carpenter'], region: 'Arnhem', company: 'Dakbouw Noord', status: 'pending' }],
    tradePartners: [{ id: 'partner-north', name: 'Dakbouw Noord' }] })
    render(<WorkBoardOffice api={api} isOwner />)
    const select = await screen.findByLabelText('Geverifieerd onderaannemersbedrijf')
    fireEvent.change(select, { target: { value: 'partner-north' } })
    fireEvent.change(screen.getByLabelText('Referentie contact- en toelatingscontrole'), { target: { value: 'Bedrijf en identiteit gecontroleerd' } })
    fireEvent.click(screen.getByRole('button', { name: 'Toelaten' }))
    await screen.findByText(/Uitvoerende toegelaten/)
    expect(api).toHaveBeenCalledWith('/api/ledger/work-board/accounts/worker-2/admit', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ reference: 'Bedrijf en identiteit gecontroleerd', companyMismatchReviewed: false, tradePartnerId: 'partner-north' })
    }))
  })

  it('requires an explicit extra identity check when the declared company name differs', async () => {
    const api = vi.fn().mockResolvedValue({ accounts: [{ id: 'worker-3', name: 'Alex', email: 'alex@example.test', phone: '0612345678',
      skills: ['Carpenter'], region: 'Arnhem', company: 'Dakbouw Noord Services', status: 'pending' }],
    tradePartners: [{ id: 'partner-north', name: 'Dakbouw Noord' }] })
    render(<WorkBoardOffice api={api} isOwner />)
    fireEvent.change(await screen.findByLabelText('Geverifieerd onderaannemersbedrijf'), { target: { value: 'partner-north' } })
    fireEvent.change(screen.getByLabelText('Referentie contact- en toelatingscontrole'), { target: { value: 'KVK en handelsnaam gecontroleerd' } })
    const admit = screen.getByRole('button', { name: 'Toelaten' })
    expect(admit.disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /opgegeven bedrijfsnaam wijkt af/i }))
    expect(admit.disabled).toBe(false)
    fireEvent.click(admit)
    await screen.findByText(/Uitvoerende toegelaten/)
    const payload = JSON.parse(api.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
    expect(payload.companyMismatchReviewed).toBe(true)
  })

  it('requires a review reference before applying an admitted worker skill proposal', async () => {
    const data = { accounts: [{ id: 'worker-1', name: 'Jan Timmerman', email: 'jan@example.test', phone: '0612345678',
      skills: ['Carpenter'], region: 'Arnhem', company: '', status: 'admitted',
      pendingSkillsChange: { skills: ['Carpenter', 'Tiler'], submittedAt: '2030-01-01T10:00:00Z' } }] }
    const api = vi.fn().mockResolvedValue(data)
    render(<WorkBoardOffice api={api} isOwner />)
    await screen.findByText('Voorgesteld: Carpenter, Tiler')
    const approve = screen.getByRole('button', { name: /Goedkeuren en profiel bijwerken/ })
    expect(approve.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Referentie beoordeling'), { target: { value: 'Besproken werkervaring' } })
    expect(approve.disabled).toBe(false)
    fireEvent.click(approve)
    await screen.findByText('Vaardigheden gecontroleerd en profiel bijgewerkt.')
    expect(api).toHaveBeenCalledWith('/api/ledger/work-board/accounts/worker-1/review-skills', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ decision: 'approve', reference: 'Besproken werkervaring' })
    }))
  })

  it('accepts whole-person capacity and rejects fractional places', async () => {
    const api = vi.fn().mockResolvedValue({ positions: [], suggestions: [] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)
    await screen.findByText('Nog geen posities vrijgegeven.')
    const capacity = screen.getByLabelText('Aantal personen')
    expect(capacity.checkValidity()).toBe(false)
    fireEvent.change(capacity, { target: { value: '2' } })
    expect(capacity.checkValidity()).toBe(true)
    fireEvent.change(capacity, { target: { value: '1.5' } })
    expect(capacity.checkValidity()).toBe(false)
  })

  it('stores additional declared skills with an owner-only position draft', async () => {
    const api = vi.fn().mockResolvedValue({ positions: [], suggestions: [], applications: [], workPackages: [] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)
    fireEvent.click(await screen.findByText('Positie vrijgeven', { selector: 'summary' }))
    fireEvent.change(screen.getByLabelText('Aanvullende vereiste vaardigheden'), { target: { value: 'tegelzetten, badkamerafdichting' } })
    fireEvent.click(screen.getByRole('button', { name: 'Concept bewaren' }))
    await screen.findByText(/Concept veilig opgeslagen/)
    const payload = JSON.parse(api.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
    expect(payload.requiredSkills).toEqual(['tegelzetten', 'badkamerafdichting'])
    expect(payload.confirmPublication).not.toBe(true)
  })

  it('offers an explicit position-level start-release rule', async () => {
    const api = vi.fn().mockResolvedValue({ positions: [], suggestions: [{ sourceTaskId: 'task-1', title: 'Roof repair', role: 'Timmerman',
      city: 'Arnhem', description: 'Repair the roof edge.', hours: 4, startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T12:00:00Z' }], applications: [], workPackages: [] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)
    fireEvent.click(await screen.findByText('Positie vrijgeven', { selector: 'summary' }))
    const policy = screen.getByRole('checkbox', { name: /Werk mag pas als in uitvoering worden gemeld/ })
    fireEvent.click(policy)
    expect(policy.checked).toBe(true)
    expect(screen.getByText(/Koppel hiervoor minstens één concrete werkzaamheid/)).toBeTruthy()
    const publish = screen.getByRole('button', { name: 'Positie vrijgeven' })
    expect(publish.disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Uit bestaande werkzaamheid'), { target: { value: 'task-1' } })
    expect(publish.disabled).toBe(false)
  })

  it('makes automatic waitlist offers an explicit opt-in saved with the draft', async () => {
    const api = vi.fn().mockResolvedValue({ positions: [], suggestions: [], applications: [], workPackages: [] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)
    fireEvent.click(await screen.findByText('Positie vrijgeven', { selector: 'summary' }))
    const policy = screen.getByRole('checkbox', { name: /Als een plek vrijkomt/ })
    expect(policy.checked).toBe(false)
    fireEvent.click(policy)
    fireEvent.click(screen.getByRole('button', { name: 'Concept bewaren' }))
    await screen.findByText(/Concept veilig opgeslagen/)
    const payload = JSON.parse(api.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
    expect(payload.waitlistOfferPolicy).toBe('automatic_once')
    expect(payload.confirmPublication).not.toBe(true)
  })

  it('keeps automatic standby callouts off by default and saves the owner opt-in', async () => {
    const api = vi.fn().mockResolvedValue({ positions: [], suggestions: [], applications: [], workPackages: [] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)
    fireEvent.click(await screen.findByText('Positie vrijgeven', { selector: 'summary' }))
    const policy = screen.getByRole('checkbox', { name: /^Bij een gemelde verhindering/ })
    expect(policy.closest('label').textContent).toContain('maximaal drie geschikte uitvoerenden')
    expect(policy.closest('label').textContent).toContain('steeds één tegelijk')
    expect(policy.closest('label').textContent).toContain('acceptatie en aparte goedkeuring blijven nodig')
    expect(policy.checked).toBe(false)
    fireEvent.click(policy)
    fireEvent.click(screen.getByRole('button', { name: 'Concept bewaren' }))
    await screen.findByText(/Concept veilig opgeslagen/)
    const payload = JSON.parse(api.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
    expect(payload.automaticStandbyCallouts).toBe(true)
    expect(payload.confirmPublication).not.toBe(true)
  })

  it('shows the automatic queue pause for owner review', async () => {
    const api = vi.fn().mockResolvedValue({ positions: [{ id: 'position-1', title: 'Dakwerk', role: 'Timmerman', city: 'Arnhem',
      filled: 0, capacity: 1, status: 'open', startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, rate: 45,
      waitlistOfferPolicy: 'automatic_once', waitlistAutomation: { status: 'owner_review', reason: 'De eerste kandidaat moet eerst door de aannemer worden toegelaten.' } }],
    applications: [], suggestions: [], workPackages: [] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)
    expect((await screen.findByRole('alert')).textContent).toMatch(/automatisering wacht op controle: De eerste kandidaat moet eerst door de aannemer worden toegelaten/)
    expect(screen.getByText(/nooit automatisch overgeslagen of definitief geplaatst/i)).toBeTruthy()
  })

  it('keeps a multi-trade package position scoped to selected tasks for one role', async () => {
    const user = userEvent.setup()
    const data = {
      positions: [], applications: [], materials: '', equipment: '',
      workPackages: [{ id: 'package-1', code: 'WP-01', title: 'Gevelwerk', sourceHash: 'package-hash',
        taskIds: ['task-carpentry-1', 'task-carpentry-2', 'task-electric'] }],
      suggestions: [
        { sourceTaskId: 'task-carpentry-1', title: 'Regelwerk plaatsen', role: 'Timmerman' },
        { sourceTaskId: 'task-carpentry-2', title: 'Gevelbekleding monteren', role: 'Timmerman' },
        { sourceTaskId: 'task-electric', title: 'Buitenverlichting aansluiten', role: 'Elektricien' }
      ]
    }
    const api = vi.fn().mockResolvedValue(data)
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)
    fireEvent.click(await screen.findByText('Positie vrijgeven', { selector: 'summary' }))

    await user.selectOptions(screen.getByLabelText('Werkpakket'), 'package-1')
    const tasks = screen.getByLabelText('Werkzaamheden voor deze positie')
    expect(tasks.selectedOptions).toHaveLength(0)
    await user.type(screen.getByLabelText('Vakgebied'), 'Timmerman')
    expect(screen.getByRole('option', { name: /Buitenverlichting aansluiten · Elektricien · andere vakrol/ }).disabled).toBe(true)
    await user.selectOptions(tasks, ['task-carpentry-1', 'task-carpentry-2'])
    expect(Array.from(tasks.selectedOptions, option => option.value)).toEqual(['task-carpentry-1', 'task-carpentry-2'])

    await user.clear(screen.getByLabelText('Vakgebied'))
    await user.type(screen.getByLabelText('Vakgebied'), 'Elektricien')
    expect(tasks.selectedOptions).toHaveLength(0)
    await user.selectOptions(tasks, 'task-electric')
    expect(Array.from(tasks.selectedOptions, option => option.value)).toEqual(['task-electric'])
  })

  it('prepares one private, incomplete draft per uncovered open task without publishing or assigning', async () => {
    const data = {
      positions: [{ id: 'position-current', status: 'open', workPackageCurrent: true, sourceTaskIds: ['task-covered'] }],
      applications: [], materials: '', equipment: '',
      workPackages: [{ id: 'package-1', code: 'WP-01', title: 'Gevelwerk', sourceHash: 'package-hash', taskIds: ['task-covered', 'task-new'] }],
      suggestions: [
        { sourceTaskId: 'task-covered', title: 'Bestaand metselwerk', role: 'Metselaar' },
        { sourceTaskId: 'task-new', title: 'Aanvullend metselwerk', role: 'Metselaar', description: 'Voeg het gevelvlak.',
          city: 'Arnhem', hours: 6, startsAt: '2030-06-01T08:00:00.000Z', endsAt: '2030-06-01T16:00:00.000Z',
          linkedMaterials: [{ id: 'material-1', name: 'Gevelsteen', quantity: 20, unit: 'stuks' }] }
      ]
    }
    const api = vi.fn(async (_route, options) => {
      if (options?.method === 'POST') {
        const draft = JSON.parse(options.body)
        data.positions.push({ id: 'position-draft', status: 'draft', ...draft, workPackageCurrent: true })
      }
      return data
    })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)

    await userEvent.click(await screen.findByRole('button', { name: 'Concepten voorbereiden uit 1 open werkzaamheid/werkzaamheden' }))
    expect(await screen.findByText(/1 positieconcept\(en\) klaargezet; niet gepubliceerd en niet toegewezen\./)).toBeTruthy()
    const payload = JSON.parse(api.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
    expect(payload).toMatchObject({
      intent: 'save_draft', entryKey: 'task-suggestion:task-new', role: 'Metselaar',
      sourceTaskIds: ['task-new'], workPackageId: 'package-1', workPackageSourceHash: 'package-hash',
      capacity: '', rate: '', materials: 'Gevelsteen: 20 stuks (levering te bevestigen)'
    })
    expect(payload.confirmPublication).not.toBe(true)
    expect(data.positions.filter(position => position.status === 'draft')).toHaveLength(1)
  })

  it('keeps task-derived concepts private and lets the owner resume them', async () => {
    const draft = { id: 'position-draft', entryKey: 'draft-key', status: 'draft', title: 'Dakwerk', role: 'Timmerman', city: 'Arnhem',
      startsAt: null, endsAt: null, hours: null, capacity: null, rate: null, missingFields: ['startmoment', 'eindmoment', 'aantal personen', 'uurvergoeding'],
      workPackageCurrent: true, sourceTaskIds: ['task-1'] }
    const api = vi.fn().mockResolvedValue({ positions: [draft], suggestions: [], applications: [], workPackages: [] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)

    expect(await screen.findByText('Positieconcepten')).toBeTruthy()
    expect(screen.getByText(/Ontbreekt nog: startmoment, eindmoment, aantal personen, uurvergoeding/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Concept verder bewerken' }))
    expect(screen.getByLabelText('Aantal personen').value).toBe('')
    expect(screen.getByLabelText('Uurvergoeding (EUR, excl. btw)').value).toBe('')
  })

  it('saves a task-derived position as a private draft instead of publishing it', async () => {
    const suggestion = { sourceTaskId: 'task-1', title: 'Dakisolatie plaatsen', role: 'Isolatiemonteur', city: 'Arnhem',
      description: 'Plaats de isolatie volgens het werkpakket.', hours: 6, startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z' }
    const data = { positions: [], suggestions: [suggestion], applications: [], workPackages: [], materials: '', equipment: '' }
    const api = vi.fn(async (_route, options) => {
      if (options?.method === 'POST') {
        const payload = JSON.parse(options.body)
        data.positions = [{ id: 'position-draft', status: 'draft', ...payload, missingFields: ['aantal personen', 'uurvergoeding'], workPackageCurrent: true }]
      }
      return data
    })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)

    fireEvent.click(await screen.findByText('Positie vrijgeven', { selector: 'summary' }))
    fireEvent.change(screen.getByLabelText('Uit bestaande werkzaamheid'), { target: { value: 'task-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Concept bewaren' }))

    expect(await screen.findByText('Concept veilig opgeslagen. Het staat nog niet op het uitvoerdersbord.')).toBeTruthy()
    const saveCall = api.mock.calls.find(([, options]) => options?.method === 'POST')
    const saved = JSON.parse(saveCall[1].body)
    expect(saved.intent).toBe('save_draft')
    expect(saved.sourceTaskIds).toEqual(['task-1'])
    expect(saved.rate).toBe('')
    expect(saved.capacity).toBe('')
    expect(data.positions[0].status).toBe('draft')
  })

  it('names stale positions and lets the owner close their enrollment without releasing assignments', async () => {
    let status = 'open'
    const position = { id: 'position-stale', title: 'Dakisolatie', role: 'Carpenter', city: 'Arnhem', startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, rate: 45, capacity: 2, filled: 1, status, workPackageCurrent: false }
    const api = vi.fn(async route => {
      if (route.endsWith('/positions/position-stale/close')) { status = 'closed'; return {} }
      return { positions: [{ ...position, status }], applications: [], suggestions: [], workPackages: [], standbyCallouts: [], replacementOpportunities: [] }
    })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)

    expect((await screen.findByText(/Gekoppelde werkzaamheden of werkpakketten zijn gewijzigd voor: Dakisolatie\./)).getAttribute('role')).toBe('status')
    fireEvent.click(screen.getByRole('button', { name: 'Inschrijving sluiten' }))
    expect((await screen.findByText('Inschrijving gesloten. Bestaande plaatsingen blijven behouden.')).textContent).toContain('Bestaande plaatsingen blijven behouden.')
    expect(api).toHaveBeenCalledWith('/api/ledger/work-board/positions/position-stale/close', expect.objectContaining({ method: 'POST' }))
    expect(screen.getByText(/Gesloten/)).toBeTruthy()
  })

  it('only lets the owner offer an admitted applicant a ready position', async () => {
    const application = { id: 'app-1', status: 'interested', holdReason: null, readiness: { ready: true, blockers: [] }, applicant: { name: 'Rosa', skills: ['Carpenter'], region: 'Arnhem', status: 'admitted' }, position: { title: 'Roof repair' } }
    const api = vi.fn().mockResolvedValue({ positions: [], applications: [application], suggestions: [], workPackages: [] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)
    const offer = await screen.findByRole('button', { name: 'Concreet aanbod sturen' })
    expect(offer.disabled).toBe(false)
    fireEvent.click(offer)
    await screen.findByRole('status')
    expect(api).toHaveBeenCalledWith('/api/ledger/work-board/applications/app-1/offer', expect.objectContaining({ method: 'POST' }))
  })

  it('shows live placement blockers and disables a premature offer', async () => {
    const application = { id: 'app-blocked', status: 'interested', holdReason: null, readiness: { ready: true, blockers: [] },
      placementReview: { blockers: ['Deze periode overlapt met een andere opdracht in je planning.'], advisories: ['Je staat in deze periode op standby.'] },
      applicant: { name: 'Rosa', skills: ['Carpenter'], region: 'Arnhem', status: 'admitted' }, position: { title: 'Roof repair', filled: 0, capacity: 1 } }
    const api = vi.fn().mockResolvedValue({ positions: [], applications: [application], suggestions: [], workPackages: [] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)
    expect(await screen.findByText('Deze periode overlapt met een andere opdracht in je planning.')).toBeTruthy()
    expect(screen.getByText('Je staat in deze periode op standby.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Concreet aanbod sturen' }).disabled).toBe(true)
    expect(api).not.toHaveBeenCalledWith('/api/ledger/work-board/applications/app-blocked/offer', expect.anything())
  })

  it('requires an explicit owner decision for interest overlapping a standby window', async () => {
    const application = { id: 'app-standby', status: 'interested', holdReason: 'standby_confirmation_required', holdReasons: ['standby_confirmation_required'], readiness: { ready: true, blockers: [] }, applicant: { name: 'Rosa', skills: ['Carpenter'], region: 'Arnhem', status: 'admitted' }, position: { title: 'Roof repair' } }
    const api = vi.fn().mockResolvedValue({ positions: [], applications: [application], suggestions: [], workPackages: [] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)
    expect(await screen.findByText(/op afroep voor de positieperiode/)).toBeTruthy()
    const offer = screen.getByRole('button', { name: 'Concreet aanbod sturen' })
    expect(offer.disabled).toBe(false)
    fireEvent.click(offer)
    await screen.findByRole('status')
    expect(api).toHaveBeenCalledWith('/api/ledger/work-board/applications/app-standby/offer', expect.objectContaining({ method: 'POST' }))
  })

  it('shows a ranked waitlist and keeps placement disabled until capacity opens', async () => {
    const application = { id: 'app-waitlisted', status: 'waitlisted', waitlistPosition: 2, holdReason: null,
      readiness: { ready: true, blockers: [] }, applicant: { name: 'Rosa', skills: ['Carpenter'], region: 'Arnhem', status: 'admitted' },
      position: { title: 'Roof repair', filled: 1, capacity: 1 } }
    const api = vi.fn().mockResolvedValue({ positions: [], applications: [application], suggestions: [], workPackages: [] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)
    expect(await screen.findByText('Wachtlijstplek 2 · positie bezet 1/1. Een aanbod kan pas als er ruimte is.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Concreet aanbod sturen' }).disabled).toBe(true)
  })

  it('requires worker acceptance before the owner proposes a standby replacement', async () => {
    const callout = { id: 'callout-1', assignmentId: 'assignment-1', workerId: 'worker-1', standbyPeriodId: 'standby-1', status: 'accepted' }
    const opportunity = { assignmentId: 'assignment-1', availabilityPeriodId: 'absence-1', originalWorkerName: 'Sam', role: 'Carpenter', scheduledStart: '2030-06-01T08:00:00Z', scheduledEnd: '2030-06-01T12:00:00Z', candidates: [{ id: 'worker-1', name: 'Rosa', role: 'Carpenter', standbyPeriodId: 'standby-1', standbyStartsAt: '2030-06-01T08:00:00Z', standbyEndsAt: '2030-06-01T12:00:00Z', minimumNoticeHours: 24 }] }
    const api = vi.fn().mockResolvedValue({ positions: [], applications: [], suggestions: [], workPackages: [], replacementOpportunities: [opportunity], standbyCallouts: [callout] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)
    expect(await screen.findByText(/minimaal 24 uur aankondiging/)).toBeTruthy()
    const request = await screen.findByRole('button', { name: 'Vervanging ter goedkeuring voorstellen' })
    fireEvent.click(request)
    await screen.findByText(/onafhankelijke goedkeurder beslist/)
    expect(api).toHaveBeenCalledWith('/api/ledger/work-board/standby-callouts/callout-1/request-replacement', expect.objectContaining({ method: 'POST' }))
  })

  it('shows affected shifts with no standby candidates and links to operational recovery', async () => {
    const opportunity = { assignmentId: 'assignment-outage', availabilityPeriodId: 'absence-1', originalWorkerName: 'Sam', role: 'Carpenter',
      scheduledStart: '2030-06-01T08:00:00Z', scheduledEnd: '2030-06-01T12:00:00Z', availabilityStartsAt: '2030-06-01T09:00:00Z',
      availabilityEndsAt: '2030-06-01T11:00:00Z', availabilityReturnUnknown: false, availabilityStatus: 'active', candidates: [] }
    const api = vi.fn().mockResolvedValue({ positions: [], applications: [], suggestions: [], workPackages: [], replacementOpportunities: [opportunity], standbyCallouts: [] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)
    expect(await screen.findByRole('region', { name: 'Uitval en vervanging' })).toBeTruthy()
    expect(screen.getByText(/Geen geschikte standby-uitvoerder gevonden/)).toBeTruthy()
    const navigation = vi.spyOn(window, 'dispatchEvent')
    fireEvent.click(screen.getByRole('button', { name: 'Open verstoringen en herstel' }))
    expect(navigation.mock.calls[0][0]).toMatchObject({ type: 'contractor:dossier-navigate', detail: {
      area: 'planning', targetId: 'job-operational-recovery', jobId: 'job-one', sourceType: 'worker_availability', sourceId: 'absence-1'
    } })
  })

  it('alerts the owner when a legacy public release is hidden for privacy review', async () => {
    const position = { id: 'position-private', title: 'Dakwerk', role: 'Carpenter', city: 'Arnhem',
      startsAt: '2030-06-01T08:00:00Z', endsAt: '2030-06-01T16:00:00Z', hours: 8, rate: 45,
      capacity: 1, filled: 0, status: 'open', privacyReviewRequired: true, privacyWarnings: ['de klantnaam'] }
    const api = vi.fn().mockResolvedValue({ positions: [position], applications: [], suggestions: [], workPackages: [] })
    render(<WorkBoardOffice api={api} jobId="job-one" isOwner />)

    expect((await screen.findByRole('alert')).textContent).toMatch(/Deze posities zijn verborgen voor nieuwe uitvoerenden/)
    expect(screen.getByRole('alert').textContent).toContain('Dakwerk')
  })
})
