import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import OperationalRecoveryControl from '../components/OperationalRecoveryControl'
import { removeSessionDraft } from '../draft-recovery'

const payload = { sourceHash: 'a'.repeat(64), sources: [
  { type: 'worker_availability', id: 'absence-1', title: 'Dakdekker: Niet beschikbaar', impact: { schedule: { ready: false } } },
  { type: 'material_receipt', id: 'receipt-1', title: 'Levering GR-11', impact: { materialLines: [{ itemName: 'Dakrollen', unit: 'rollen', shortfallQuantity: 2 }] } }
], cases: [], externalCommitments: 0 }

it('selects a retained quality deviation requested from the same job dossier without writing', async () => {
  const source = { type: 'quality_nonconformance', id: 'ncr-1', title: 'Waterdichte aansluiting controleren', impact: {} }
  const api = vi.fn().mockResolvedValue({ ...payload, sources: [source] })
  render(<OperationalRecoveryControl api={api} jobId="job-quality-recovery" canEdit />)
  await screen.findByText(/Waterdichte aansluiting controleren/)
  await act(async () => {
    window.dispatchEvent(new CustomEvent('contractor:dossier-navigate', { detail: {
      targetId: 'job-operational-recovery', jobId: 'job-quality-recovery',
      sourceType: source.type, sourceId: source.id,
    } }))
  })
  expect(screen.getByRole('checkbox').checked).toBe(true)
  expect(screen.getByRole('checkbox', { name: /Kwaliteitsafwijking/ })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Herstelcasus aanmaken' }).disabled).toBe(false)
  expect(api.mock.calls.every(([, options]) => !options?.method)).toBe(true)
})

it('waits for refreshed case evidence after a child cost review before allowing closure', async () => {
  const item = { id: 'case-cost-refresh', jobId: 'job-cost-refresh', status: 'open', sourceCurrent: true,
    caseHash: 'b'.repeat(64), owner: 'Planner', dueAt: null, recoveryAction: 'Herstel beoordelen', sources: [], resolutionBlockers: [] }
  const original = { ...payload, sources: [], cases: [item] }
  let costRetained = false
  let finishCostWrite
  let finishRefresh
  const api = vi.fn(async (_url, options) => {
    if (options?.method === 'POST') {
      const command = JSON.parse(options.body)
      if (command.action === 'cost_impact_review') {
        return new Promise(resolve => { finishCostWrite = () => { costRetained = true; resolve({ caseId: item.id }) } })
      }
      return { caseId: item.id }
    }
    if (costRetained) return new Promise(resolve => { finishRefresh = resolve })
    return original
  })
  render(<OperationalRecoveryControl api={api} jobId={item.jobId} canEdit />)
  await userEvent.click(await screen.findByText('Kostenimpact beoordelen'))
  await userEvent.type(screen.getByLabelText('Indicatieve raming in euro'), '60')
  await userEvent.type(screen.getByLabelText('Onderbouwing'), 'Kosten op basis van een goedgekeurde bon.')
  await userEvent.type(screen.getByLabelText('Bewijsbron kostenimpact'), 'bon:GR-11')
  await userEvent.click(screen.getByRole('button', { name: 'Kostenimpact vastleggen' }))
  await waitFor(() => expect(finishCostWrite).toBeTypeOf('function'))
  expect(screen.queryByRole('button', { name: 'Afronden met bewijs' })).toBeNull()
  expect(screen.getByText('Herstelwijziging wordt opgeslagen...')).toBeTruthy()
  await act(async () => finishCostWrite())
  await waitFor(() => expect(finishRefresh).toBeTypeOf('function'))
  expect(screen.queryByRole('button', { name: 'Afronden met bewijs' })).toBeNull()
  expect(screen.getByText('Verstoringen laden...')).toBeTruthy()
  await act(async () => finishRefresh({ ...original, cases: [{ ...item, caseHash: 'c'.repeat(64) }] }))
  await userEvent.type(await screen.findByLabelText('Bewijs van herstel'), 'Bron en kosten opnieuw gecontroleerd.')
  await userEvent.click(screen.getByRole('button', { name: 'Afronden met bewijs' }))
  const closure = api.mock.calls.filter(([, options]) => options?.method === 'POST')
    .map(([, options]) => JSON.parse(options.body)).find(command => command.status === 'resolved')
  expect(closure.caseHash).toBe('c'.repeat(64))
  await act(async () => finishRefresh(original))
})

it('removes stale case actions after a failed refresh and permits a fresh read retry', async () => {
  const data = { ...payload, sources: [], cases: [{ id: 'case-failed-refresh', status: 'open', sourceCurrent: true,
    owner: 'Planner', dueAt: null, recoveryAction: 'Controleer herstel', sources: [], resolutionBlockers: [] }] }
  const api = vi.fn().mockResolvedValue(data)
  render(<OperationalRecoveryControl api={api} jobId="job-failed-refresh" canEdit />)
  await userEvent.type(await screen.findByLabelText('Bewijs van herstel'), 'Conceptbewijs blijft bewaard.')
  api.mockRejectedValueOnce(new Error('Actuele casus niet beschikbaar'))
  await userEvent.click(screen.getByRole('button', { name: 'Herstelcasussen verversen' }))
  await screen.findByText('Actuele casus niet beschikbaar')
  expect(screen.queryByRole('button', { name: 'Afronden met bewijs' })).toBeNull()
  expect(screen.getByRole('button', { name: 'Herstelcasussen verversen' }).disabled).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: 'Herstelcasussen verversen' }))
  await screen.findByDisplayValue('Conceptbewijs blijft bewaard.')
  expect(screen.queryByText('Actuele casus niet beschikbaar')).toBeNull()
})

it('restores an interrupted recovery-case draft for the same signed-in operator and current sources', async () => {
  const scope = 'owner:recovery-draft-test'
  const jobId = 'job-draft-recovery'
  const name = `operational-recovery:${jobId}`
  removeSessionDraft(window.sessionStorage, scope, name)
  const props = { api: vi.fn().mockResolvedValue(payload), jobId, canEdit: true, draftScope: scope }
  const first = render(<OperationalRecoveryControl {...props} />)
  await screen.findByText(/Dakdekker: Niet beschikbaar/)
  await userEvent.click(screen.getByRole('checkbox', { name: /Beschikbaarheid uitvoerder/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Herstelcasus aanmaken' }))
  await userEvent.type(screen.getByLabelText('Verantwoordelijke'), 'Planner')
  await userEvent.type(screen.getByLabelText('Opvolgen voor'), '2030-01-02T09:00')
  await userEvent.type(screen.getByLabelText('Wat moet worden uitgezocht of voorbereid?'), 'Controleer vervanging na de gemelde afwezigheid.')
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 230)) })
  first.unmount()

  render(<OperationalRecoveryControl {...props} />)
  await screen.findByDisplayValue('Planner')
  expect(screen.getByRole('checkbox', { name: /Beschikbaarheid uitvoerder/ }).checked).toBe(true)
  expect(screen.getByLabelText('Opvolgen voor').value).toBe('2030-01-02T09:00')
  expect(screen.getByLabelText('Wat moet worden uitgezocht of voorbereid?').value)
    .toBe('Controleer vervanging na de gemelde afwezigheid.')
  removeSessionDraft(window.sessionStorage, scope, name)
})

it('retries the identical case command after a lost response and page reload', async () => {
  const scope = 'owner:recovery-pending-test'
  const jobId = 'job-pending-recovery'
  const name = `operational-recovery:${jobId}`
  removeSessionDraft(window.sessionStorage, scope, name)
  let fail = true
  const api = vi.fn(async (url, options) => {
    if (!options?.method) return payload
    if (fail) throw Object.assign(new Error('Verbinding onderbroken'), { status: 503 })
    return { caseId: 'case-recovered' }
  })
  const props = { api, jobId, canEdit: true, draftScope: scope }
  const first = render(<OperationalRecoveryControl {...props} />)
  await screen.findByText(/Dakdekker: Niet beschikbaar/)
  await userEvent.click(screen.getByRole('checkbox', { name: /Beschikbaarheid uitvoerder/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Herstelcasus aanmaken' }))
  await userEvent.type(screen.getByLabelText('Verantwoordelijke'), 'Planner')
  await userEvent.type(screen.getByLabelText('Opvolgen voor'), '2030-01-02T09:00')
  await userEvent.type(screen.getByLabelText('Wat moet worden uitgezocht of voorbereid?'), 'Controleer vervanging na uitval.')
  await userEvent.click(screen.getByRole('button', { name: 'Herstel vastleggen' }))
  await screen.findByText('Verbinding onderbroken')
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 230)) })
  const firstCommand = api.mock.calls.find(([, options]) => options?.method === 'POST')[1].body
  first.unmount()

  fail = false
  render(<OperationalRecoveryControl {...props} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Dezelfde wijziging opnieuw proberen' }))
  await screen.findByText('Herstelcasus is bijgewerkt.')
  const writes = api.mock.calls.filter(([, options]) => options?.method === 'POST')
  expect(writes).toHaveLength(2)
  expect(writes[1][1].body).toBe(firstCommand)
  removeSessionDraft(window.sessionStorage, scope, name)
})

it('links selected cross-domain sources and retains the identical request for safe retry', async () => {
  let fail = true
  const api = vi.fn(async (url, options) => { if (options?.method === 'POST' && fail) throw Object.assign(new Error('Verbinding onderbroken'), { status: 503 }); return payload })
  render(<OperationalRecoveryControl api={api} jobId="job-1" canEdit />)
  await screen.findByText(/Dakdekker: Niet beschikbaar/)
  await userEvent.click(screen.getByRole('checkbox', { name: /Beschikbaarheid uitvoerder/ }))
  await userEvent.click(screen.getByRole('checkbox', { name: /Materiaaltekort of leveringsafwijking/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Herstelcasus aanmaken' }))
  await userEvent.type(screen.getByLabelText('Verantwoordelijke'), 'Planner')
  await userEvent.type(screen.getByLabelText('Opvolgen voor'), '2030-01-02T09:00')
  await userEvent.type(screen.getByLabelText('Wat moet worden uitgezocht of voorbereid?'), 'Controleer vervanging en materiaalherstel.')
  await userEvent.click(screen.getByRole('button', { name: 'Herstel vastleggen' }))
  await screen.findByText('Verbinding onderbroken')
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Dezelfde wijziging opnieuw proberen' }))
  await screen.findByText('Herstelcasus is bijgewerkt.')
  const writes = api.mock.calls.filter(([, options]) => options?.method === 'POST')
  expect(writes).toHaveLength(2)
  expect(writes[0][1].body).toBe(writes[1][1].body)
  expect(JSON.parse(writes[0][1].body).sources).toHaveLength(2)
  expect(JSON.parse(writes[0][1].body).dueAt).toBe(new Date('2030-01-02T09:00').toISOString())
})

it('selects the exact current availability source when navigated from an affected shift', async () => {
  render(<OperationalRecoveryControl api={vi.fn().mockResolvedValue(payload)} jobId="job-1" canEdit />)
  const checkbox = await screen.findByRole('checkbox', { name: /Beschikbaarheid uitvoerder/ })
  expect(checkbox.checked).toBe(false)
  await act(async () => window.dispatchEvent(new CustomEvent('contractor:dossier-navigate', {
    detail: { area: 'planning', targetId: 'job-operational-recovery', jobId: 'job-1', sourceType: 'worker_availability', sourceId: 'absence-1' }
  })))
  expect(checkbox.checked).toBe(true)
  expect(screen.getByText(/De gemelde verhindering is geselecteerd/)).toBeTruthy()
  expect(screen.queryByRole('form', { name: 'Herstelcasus aanmaken' })).toBeNull()
})

it('selects an unassigned material shortfall when opened from the company-wide disruption queue', async () => {
  const material = { type: 'material_requirement_shortfall', id: 'material-1', title: 'Tegellijm: 4 zakken tekort', status: 'shortfall', impact: {} }
  render(<OperationalRecoveryControl api={vi.fn().mockResolvedValue({ ...payload, sources: [material], cases: [] })} jobId="job-1" canEdit />)
  const checkbox = await screen.findByRole('checkbox', { name: /Materiaaltekort/ })
  await act(async () => window.dispatchEvent(new CustomEvent('contractor:dossier-navigate', {
    detail: { area: 'planning', targetId: 'job-operational-recovery', jobId: 'job-1', sourceType: material.type, sourceId: material.id }
  })))
  expect(checkbox.checked).toBe(true)
  expect(screen.getByText(/De verstoringsbron is geselecteerd/)).toBeTruthy()
})

it('shows impact and keeps customer and supplier actions clearly uncommitted', async () => {
  const data = { ...payload, sources: [], cases: [{ id: 'case-1', status: 'open', sourceCurrent: false, owner: 'Planner', dueAt: null,
    recoveryAction: 'Materiaaltekort opvolgen', sources: [{ type: 'material_receipt', id: 'receipt-1', title: '<img src=x>',
      impact: { schedule: { ready: false }, materialLines: [{ itemName: 'Dakrollen', unit: 'rollen', shortfallQuantity: 2 }],
        scheduleProjection: { baselineStatus: 'approved_current', pathStatus: 'critical_path_affected', affectedTasks: [{ title: 'Dakbedekking plaatsen', critical: true }],
          materialReadiness: [{ itemName: 'Dakrollen', expectedAvailableAt: '2030-01-04T12:00:00.000Z', evidenceReference: 'mail-123',
            supplierLeadTimeRisks: [{ supplier: 'Dakrollen BV', requiredBy: '2030-01-03T12:00:00.000Z', historicalP75EquivalentCompletionAt: '2030-01-05T12:00:00.000Z', historicalLeadTimeDays: 8, sampleSize: 4 }],
            tasks: [{ title: 'Dakbedekking plaatsen', status: 'expected_after_task_start' }] }],
          contractComparisons: [{ label: 'Oplevering', relation: 'baseline_after_date' }] } } }] }] }
  render(<OperationalRecoveryControl api={vi.fn().mockResolvedValue(data)} jobId="job-1" />)
  await screen.findByText(/bron gewijzigd; herbeoordeling vereist/)
  expect(screen.getByText(/<img src=x>/)).toBeTruthy()
  expect(document.querySelector('img')).toBeNull()
  expect(screen.getByText(/geen klant- of leveranciersbericht verstuurd/)).toBeTruthy()
  expect(screen.getByText(/Dakrollen: 2 rollen/)).toBeTruthy()
  expect(document.body.textContent).toMatch(/Dakrollen: beschikbaar na start \/ Dakbedekking plaatsen/)
  expect(document.body.textContent).toMatch(/verwacht .*\[mail-123\]/)
  expect(document.body.textContent).toMatch(/Historisch leverrisico voor Dakrollen BV: P75 8 dagen op basis van 4 afgeronde bestellingen/)
  expect(document.body.textContent).toMatch(/Dit is geen actuele ETA/)
  expect(screen.getByText(/actuele goedgekeurde basisplanning \/ kritieke pad geraakt \/ taken: Dakbedekking plaatsen \(kritiek pad\)/)).toBeTruthy()
  expect(screen.getByText(/Oplevering: basisplanning eindigt na deze contractdatum/)).toBeTruthy()
})

it('opens the work plan and requests a non-mutating resource preview for a material risk', async () => {
  const data = { ...payload, sources: [], cases: [{ id: 'case-material-plan', status: 'open', sourceCurrent: true, owner: 'Planner', dueAt: null,
    recoveryAction: 'Materiaal aanvullen', sources: [{ type: 'material_requirement_shortfall', id: 'mat-1', title: 'Materiaalbehoefte: Dakrollen',
      impact: { scheduleProjection: { pathStatus: 'critical_path_affected', affectedTasks: [], contractComparisons: [], materialReadiness: [{ materialRequirementId: 'mat-1', itemName: 'Dakrollen', tasks: [
        { taskId: 'task-1', title: 'Dakbedekking plaatsen', status: 'expected_after_task_start' }
      ] }] } } }] }] }
  const navigation = vi.fn()
  window.addEventListener('contractor:dossier-navigate', navigation)
  try {
    render(<OperationalRecoveryControl api={vi.fn().mockResolvedValue(data)} jobId="job-1" canEdit />)
    await userEvent.click(await screen.findByRole('button', { name: 'Bekijk herstelplanning' }))
    expect(navigation).toHaveBeenCalledWith(expect.objectContaining({ detail: {
      area: 'planning', targetId: 'job-task-control', jobId: 'job-1', runResourcePreview: true
    } }))
  } finally {
    window.removeEventListener('contractor:dossier-navigate', navigation)
  }
})

it('shows unresolved source checks and disables case closure until they are reviewed', async () => {
  const item = { id: 'case-open-checks', status: 'open', sourceCurrent: true, owner: 'Planner', dueAt: '2030-01-02T09:00:00.000Z',
    recoveryAction: 'Vervanging beoordelen', resolutionBlockers: [{ sourceId: 'absence-1', code: 'availability_conflicts_open',
      message: 'Er zijn nog ingeplande opdrachten tijdens de onbeschikbaarheid.' }], sources: [] }
  render(<OperationalRecoveryControl api={vi.fn().mockResolvedValue({ ...payload, sources: [], cases: [item] })} jobId="job-1" canEdit />)
  await screen.findByText('Er zijn nog ingeplande opdrachten tijdens de onbeschikbaarheid.')
  await userEvent.type(screen.getByLabelText('Bewijs van herstel'), 'Vervanging nog niet uitgevoerd.')
  expect(screen.getByRole('button', { name: 'Afronden met bewijs' }).disabled).toBe(true)
})

it('shows reserved equipment outage against its task and creates an equipment recovery case', async () => {
  const equipmentSource = { type: 'equipment_unavailable', id: 'reservation-saw-1', title: 'Accuzaag: equipment niet inzetbaar voor gereserveerd werk',
    status: 'reserved', impact: { unresolved: true, toolStatus: 'maintenance', inspectionStatus: 'not_required',
      neededFrom: '2030-01-02T08:00:00.000Z', neededUntil: '2030-01-02T14:00:00.000Z', taskId: 'task-cut-1',
      affectedScheduleTasks: [{ taskId: 'task-cut-1', title: 'Dakplaten zagen' }] } }
  const api = vi.fn(async (url, options) => options?.method === 'POST' ? { caseId: 'case-equipment-1' } : { ...payload, sources: [equipmentSource] })
  render(<OperationalRecoveryControl api={api} jobId="job-equipment-1" canEdit />)
  await screen.findByText(/Accuzaag: equipment niet inzetbaar/)
  expect(screen.getByText(/Taak: Dakplaten zagen/)).toBeTruthy()
  await userEvent.click(screen.getByRole('checkbox', { name: /Materieel niet inzetbaar/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Herstelcasus aanmaken' }))
  await userEvent.type(screen.getByLabelText('Verantwoordelijke'), 'Materieelbeheer')
  await userEvent.type(screen.getByLabelText('Opvolgen voor'), '2030-01-03T09:00')
  await userEvent.selectOptions(screen.getByLabelText('Herstelrichting'), 'recover_equipment')
  await userEvent.type(screen.getByLabelText('Wat moet worden uitgezocht of voorbereid?'), 'Zaag laten herstellen en opnieuw inspecteren.')
  await userEvent.click(screen.getByRole('button', { name: 'Herstel vastleggen' }))
  await screen.findByText('Herstelcasus is bijgewerkt.')
  const command = JSON.parse(api.mock.calls.find(([, options]) => options?.method === 'POST')[1].body)
  expect(command).toMatchObject({ action: 'create', actionType: 'recover_equipment',
    sources: [{ type: 'equipment_unavailable', id: 'reservation-saw-1' }] })
})

it('shows cross-job equipment impact and treats replacement tools as unverified suggestions', async () => {
  const equipmentSource = { type: 'equipment_unavailable', id: 'reservation-saw-2', title: 'Accuzaag: equipment niet inzetbaar', impact: {
    affectedReservationCount: 2, affectedReservationListComplete: true,
    affectedReservations: [
      { reservationId: 'reservation-1', jobId: 'job-1', jobTitle: 'Dakherstel noord', neededFrom: '2030-01-02T08:00:00.000Z', neededUntil: '2030-01-02T12:00:00.000Z' },
      { reservationId: 'reservation-2', jobId: 'job-2', jobTitle: 'Dakherstel zuid', neededFrom: '2030-01-03T08:00:00.000Z', neededUntil: '2030-01-03T12:00:00.000Z' }
    ],
    replacementWindowKnown: true, replacementCompatibilityVerified: false, replacementCandidateListComplete: true,
    replacementCandidates: [{ toolId: 'tool-candidate', name: 'Vrije zaag', category: 'power_tool', currentLocation: 'Werkplaats',
      inspectionStatus: 'not_required', windowAvailable: true }]
  } }
  const data = { ...payload, sources: [], cases: [{ id: 'case-equipment-impact', status: 'open', sourceCurrent: true, owner: 'Materieelbeheer',
    dueAt: '2030-01-04T09:00:00.000Z', recoveryAction: 'Alternatief controleren', sources: [equipmentSource] }] }
  render(<OperationalRecoveryControl api={vi.fn().mockResolvedValue(data)} jobId="job-1" canEdit />)
  const impact = await screen.findByRole('region', { name: 'Materieelimpact over opdrachten' })
  expect(impact.textContent).toContain('Dakherstel noord')
  expect(impact.textContent).toContain('Dakherstel zuid')
  expect(impact.textContent).toContain('Vrije zaag')
  expect(impact.textContent).toContain('Technische geschiktheid, toebehoren, staat, locatie en veiligheid zijn niet vastgesteld.')
  expect(impact.textContent).toContain('er wordt niets automatisch gereserveerd of omgeboekt')
})

it('submits every affected job as one approval-gated replacement plan', async () => {
  const absence = { type: 'worker_availability', id: 'absence-portfolio', workerId: 'worker-1', title: 'Dakdekker: Niet beschikbaar', impact: {
    crossJobConflictListComplete: true,
    crossJobConflicts: [
      { assignmentId: 'assignment-a', jobId: 'job-a', jobTitle: 'Dakherstel A', scheduledStart: '2030-01-02T09:00:00.000Z', scheduledEnd: '2030-01-02T11:00:00.000Z',
        replacementCandidates: [{ worker: { id: 'replacement-a', name: 'Vervanger A', role: 'Dakdekker' }, matchedSkills: ['dakwerk'] }] },
      { assignmentId: 'assignment-b', jobId: 'job-b', jobTitle: 'Dakherstel B', scheduledStart: '2030-01-02T12:00:00.000Z', scheduledEnd: '2030-01-02T14:00:00.000Z',
        replacementCandidates: [{ worker: { id: 'replacement-b', name: 'Vervanger B', role: 'Dakdekker' }, matchedSkills: ['dakwerk'] }] }
    ]
  } }
  const data = { ...payload, sources: [], cases: [{ id: 'case-portfolio', status: 'open', sourceCurrent: true, owner: 'Planner', dueAt: '2030-01-01T09:00:00.000Z',
    recoveryAction: 'Vervang de uitvoerder op beide opdrachten.', sources: [absence] }] }
  const api = vi.fn(async (url, options) => options?.method === 'POST' && url.includes('/replacement-plan')
    ? { approval: { id: 'approval-portfolio-1', status: 'pending' } } : data)
  render(<OperationalRecoveryControl api={api} jobId="job-a" canEdit />)
  await screen.findByText('Bezetting herstellen over opdrachten heen')
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Vervanger voor Dakherstel A' }), 'replacement-a')
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Vervanger voor Dakherstel B' }), 'replacement-b')
  await userEvent.click(screen.getByRole('button', { name: /Alle 2 opdracht\(en\)/ }))
  await screen.findByText(/approval-portfolio-1/)
  const submission = api.mock.calls.find(([url, options]) => options?.method === 'POST' && url.includes('/replacement-plan'))
  expect(submission[0]).toBe('/api/ledger/workers/worker-1/availability/absence-portfolio/replacement-plan')
  expect(JSON.parse(submission[1].body).assignments).toEqual([
    { assignmentId: 'assignment-a', workerId: 'replacement-a' },
    { assignmentId: 'assignment-b', workerId: 'replacement-b' }
  ])
})

it('records a supplier-confirmed date against a registered material-requirement shortfall', async () => {
  const source = { type: 'material_requirement_shortfall', id: 'material-supplier', title: 'Materiaalbehoefte: Dakrollen', status: 'shortfall',
    sourceFingerprint: 'source-fingerprint', impact: { purchaseOrder: { id: 'po-55', supplier: 'Dakmaterialen BV', status: 'ordered', orderIssued: true, externalCommitments: 1, requiredBy: '2030-01-08T09:00:00.000Z' },
      materialLines: [{ materialRequirementId: 'material-supplier', itemName: 'Dakrollen', unit: 'rollen', shortfallQuantity: 2 }] } }
  const item = { id: 'case-supplier', jobId: 'job-1', status: 'open', sourceCurrent: true, caseHash: 'b'.repeat(64), owner: 'Planner',
    sources: [source], supplierFollowUps: [] }
  const data = { ...payload, sources: [source], cases: [item] }
  const api = vi.fn(async (url, options) => options?.method === 'POST' ? { caseId: item.id, followUpId: 'follow-up-55', materialAvailabilityUpdated: true } : data)
  const onChanged = vi.fn()
  render(<OperationalRecoveryControl api={api} jobId="job-1" canEdit onChanged={onChanged} />)
  await screen.findByText('Leveranciersopvolging')
  await userEvent.click(screen.getByText('Leverancierscontact registreren', { exact: true }))
  await userEvent.selectOptions(await screen.findByRole('combobox', { name: 'Uitkomst' }), 'delivery_date_confirmed')
  await userEvent.type(screen.getByLabelText('Wat is besproken of bevestigd?'), 'Twee rollen komen op de beloofde datum na.')
  await userEvent.type(screen.getByLabelText('Door leverancier genoemde leverdatum'), '2030-01-12T10:30')
  await userEvent.click(screen.getByLabelText('Gebruik deze datum in de materiaalprognose voor deze gekoppelde behoefte'))
  await userEvent.type(screen.getByLabelText(/Bewijsreferentie/), 'e-mail:2026-09-24')
  await userEvent.click(screen.getByRole('button', { name: 'Opvolging vastleggen' }))
  await screen.findByText('Prognose verwerkt; herbeoordeel verstoring en werkplan. Niets verstuurd.')
  const submission = api.mock.calls.find(([, options]) => options?.method === 'POST')
  expect(submission[0]).toBe('/api/ledger/jobs/job-1/operational-recovery')
  expect(JSON.parse(submission[1].body)).toMatchObject({ action: 'supplier_follow_up', caseId: item.id, caseHash: item.caseHash,
    sourceHash: payload.sourceHash, sourceId: source.id, followUpStatus: 'delivery_date_confirmed', expectedAt: new Date('2030-01-12T10:30').toISOString(),
    evidenceReference: 'e-mail:2026-09-24', applyExpectedAvailability: true, materialRequirementId: source.id })
  expect(onChanged).toHaveBeenCalledWith(expect.objectContaining({ materialAvailabilityUpdated: true }))
})

it('records a customer-impact review linked to a retained incoming client message', async () => {
  const appointment = { id: 'visit-55', jobId: 'job-other', jobTitle: 'Dakherstel bij klant', visitType: 'site_survey', status: 'confirmed',
    scheduledAt: '2030-01-12T09:00:00.000Z', assignee: 'Dakdekker', approvalId: 'approval-visit-55', sourceFingerprint: 'visit-source-hash',
    clientMessages: [{ id: 'message-client-55', accessId: 'access-client-55', sourceHash: 'd'.repeat(64), createdAt: '2030-01-11T08:00:00.000Z',
      excerpt: 'Dinsdag past voor mij.', hasMore: false }] }
  const source = { type: 'worker_availability', id: 'absence-55', workerId: 'worker-1', title: 'Dakdekker: Afwezig',
    sourceFingerprint: 'absence-source-hash', impact: { clientAppointmentsComplete: true, clientAppointments: [appointment], crossJobConflictListComplete: true, crossJobConflicts: [] } }
  const item = { id: 'case-client-55', jobId: 'job-1', status: 'open', sourceCurrent: true, caseHash: 'c'.repeat(64), owner: 'Planner', sources: [source], clientImpactReviews: [] }
  const data = { ...payload, sources: [source], cases: [item] }
  const api = vi.fn(async (url, options) => options?.method === 'POST' ? { caseId: item.id, reviewId: 'review-client-55' } : data)
  render(<OperationalRecoveryControl api={api} jobId="job-1" canEdit />)
  await screen.findByText('Bevestigde klantafspraken tijdens afwezigheid')
  await userEvent.click(await screen.findByText('Klantimpact beoordelen', { exact: true }))
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Beoordeling klantimpact' }), 'awaiting_customer')
  await userEvent.type(screen.getByLabelText('Wat is afgesproken of moet worden opgevolgd?'), 'Klant om nieuw voorstel gevraagd.')
  await userEvent.type(screen.getByLabelText('Opnieuw controleren op klantreactie'), '2030-01-13T09:00')
  await userEvent.selectOptions(screen.getByLabelText(/Kies het klantbericht dat deze beoordeling onderbouwt/), 'message-client-55')
  await userEvent.click(screen.getByRole('button', { name: 'Klantimpact vastleggen' }))
  await screen.findByText('Klantimpact vastgelegd; geen bericht verstuurd of afspraak gewijzigd.')
  const submission = api.mock.calls.find(([, options]) => options?.method === 'POST')
  expect(JSON.parse(submission[1].body)).toMatchObject({ action: 'client_impact_review', caseId: item.id, caseHash: item.caseHash,
    sourceHash: payload.sourceHash, sourceId: source.id, appointmentId: appointment.id, reviewStatus: 'awaiting_customer',
    nextFollowUpAt: '2030-01-13T09:00', accessId: 'access-client-55', messageId: 'message-client-55', messageHash: 'd'.repeat(64) })
})

it('requires same-worker task resumption evidence and explicit reassessment after the source changes', async () => {
  const blocker = { type: 'field_progress_blocker', id: 'progress-blocked-1', title: 'Uitvoerder: materiaal ontbreekt',
    impact: { taskId: 'task-1', workerId: 'worker-1', followUpReports: [] } }
  const recoveryCase = { id: 'case-field-1', status: 'open', sourceCurrent: false, caseHash: 'e'.repeat(64), owner: 'Planner',
    dueAt: '2030-01-02T09:00:00.000Z', recoveryAction: 'Controleer aanvulling en hervatting.', sources: [blocker] }
  const refreshedBlocker = { ...blocker, sourceFingerprint: 'current-fingerprint', impact: { ...blocker.impact,
    followUpReports: [{ id: 'progress-resumed-1', taskId: 'task-1', workerId: 'worker-1', status: 'in_progress',
      reportedAt: '2030-01-01T11:00:00.000Z', note: 'Montage hervat na controle.' }] } }
  const data = { ...payload, sources: [], cases: [recoveryCase] }
  let reassessed = false
  const api = vi.fn(async (url, options) => {
    if (options?.method === 'POST') { reassessed = true; return { caseId: recoveryCase.id, status: 'open' } }
    return reassessed ? { ...data, cases: [{ ...recoveryCase, sourceCurrent: true, sources: [refreshedBlocker] }] } : data
  })
  render(<OperationalRecoveryControl api={api} jobId="job-1" canEdit />)
  await screen.findByText(/bron gewijzigd; herbeoordeling vereist/)
  expect(screen.queryByRole('button', { name: 'Afronden met bewijs' })).toBeNull()
  await userEvent.type(screen.getByLabelText('Beoordeling van gewijzigde bron'), 'De uitvoerder heeft de taak weer opgepakt.')
  await userEvent.click(screen.getByRole('button', { name: 'Bron opnieuw beoordelen' }))
  await screen.findByText('Herstelcasus is bijgewerkt.')
  await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Hervattingsmelding voor taak task-1' }), 'progress-resumed-1')
  await userEvent.type(screen.getByLabelText('Bewijs van herstel'), 'De montage is na levering en controle hervat.')
  await userEvent.click(screen.getByRole('button', { name: 'Afronden met bewijs' }))
  const closure = api.mock.calls.find(([, options]) => options?.method === 'POST' && JSON.parse(options.body).status === 'resolved')
  expect(JSON.parse(closure[1].body).resolutionReports).toEqual([{ sourceId: blocker.id, progressId: 'progress-resumed-1' }])
})

it('records a revised instruction against the exact active field-task blocker', async () => {
  const blocker = { type: 'field_progress_blocker', id: 'progress-blocked-instruction', title: 'Uitvoerder: materiaal ontbreekt',
    sourceFingerprint: 'blocker-fingerprint', impact: { taskId: 'task-instruction', workerId: 'worker-instruction', followUpReports: [] } }
  const recoveryCase = { id: 'case-field-instruction', status: 'open', sourceCurrent: true, caseHash: 'f'.repeat(64), owner: 'Planner',
    dueAt: '2030-01-02T09:00:00.000Z', recoveryAction: 'Controleer de ontbrekende onderdelen.', sources: [blocker] }
  const data = { ...payload, sources: [], cases: [recoveryCase] }
  const api = vi.fn().mockResolvedValue(data)
  render(<OperationalRecoveryControl api={api} jobId="job-1" canEdit />)
  await screen.findByRole('form', { name: 'Bijgewerkte instructie voor taak task-instruction' })
  await userEvent.type(screen.getByLabelText('Bijgewerkte instructie voor uitvoerder worker-instruction'), 'Controleer de levering en hervat dezelfde taak.')
  await userEvent.click(screen.getByRole('button', { name: 'Instructie in werkpakket zetten' }))
  await screen.findByText('Herstelcasus is bijgewerkt.')
  const command = api.mock.calls.find(([, options]) => options?.method === 'POST')
  expect(JSON.parse(command[1].body)).toMatchObject({ action: 'field_instruction', caseId: recoveryCase.id, caseHash: recoveryCase.caseHash,
    sourceHash: payload.sourceHash, sourceId: blocker.id, text: 'Controleer de levering en hervat dezelfde taak.' })
})
