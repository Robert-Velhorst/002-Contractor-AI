import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import OperationalRecoveryControl from '../components/OperationalRecoveryControl'
import { writeSessionDraft } from '../draft-recovery'

vi.mock('../components/OperationalRecoveryActions', () => ({ default: () => null }))
vi.mock('../components/ClientDateImpactReview', () => ({ default: () => null }))
vi.mock('../components/RecoveryCostImpactReview', () => ({ default: () => null }))

afterEach(() => vi.restoreAllMocks())

const sourceHash = 'a'.repeat(64)
const dossier = (sources = [], cases = []) => ({ sourceHash, sources, cases })
const recoveryCase = (id, title = `Casus ${id}`) => ({ id, status: 'open', sourceCurrent: true,
  owner: 'Planner', dueAt: '2026-10-01T08:00:00Z', recoveryAction: title, sources: [], resolutionBlockers: [] })

it('keeps current source rows and retained cases unchanged during recovery-draft typing', async () => {
  let titleReads = 0, caseReads = 0
  const sources = Array.from({ length: 40 }, (_, index) => ({ type: 'safety_incident', id: `source-${index}`,
    get title() { titleReads++; return `Bron ${index}` } }))
  const cases = Array.from({ length: 24 }, (_, index) => ({ ...recoveryCase(`case-${index}`),
    get recoveryAction() { caseReads++; return `Casus ${index}` } }))
  const api = vi.fn(async () => dossier(sources, cases))
  render(<OperationalRecoveryControl api={api} jobId="job-perf" canEdit />)
  await screen.findByText('Casus 23')
  await userEvent.click(screen.getByRole('checkbox', { name: /Bron 0$/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Herstelcasus aanmaken' }))
  const before = { titleReads, caseReads }
  await userEvent.type(screen.getByLabelText('Verantwoordelijke'), 'Werkvoorbereider')
  await userEvent.type(screen.getByLabelText('Wat moet worden uitgezocht of voorbereid?'), 'Controleer alle behouden brongegevens.')
  expect({ titleReads, caseReads }).toEqual(before)
  expect(screen.getByLabelText('Verantwoordelijke').value).toBe('Werkvoorbereider')
  expect(screen.getByRole('checkbox', { name: /Bron 0$/ }).checked).toBe(true)
  expect(api.mock.calls.some(([, options]) => options?.method)).toBe(false)
  console.log(JSON.stringify({ recoveryTypingReads: { before, after: { titleReads, caseReads } } }))
})

it('indexes selected source identities linearly while preserving every restored checkbox', async () => {
  let idReads = 0
  const size = 80, selected = Array.from({ length: 40 }, (_, index) => ({ type: 'safety_incident', id: `source-${index}` }))
  const sources = Array.from({ length: size }, (_, index) => ({ type: 'safety_incident', title: `Bron ${index}`,
    get id() { idReads++; return `source-${index}` } }))
  const scope = 'owner:recovery-source-performance', jobId = 'job-source-performance'
  writeSessionDraft(window.sessionStorage, scope, `operational-recovery:${jobId}`, { sourceHash, selected })
  let data = dossier(sources)
  const api = vi.fn(async () => data)
  const props = { api, jobId, canEdit: true, draftScope: scope }
  const view = render(<OperationalRecoveryControl {...props} />)
  await screen.findByRole('checkbox', { name: /Bron 79$/ })
  await waitFor(() => expect(screen.getAllByRole('checkbox').filter(input => input.checked)).toHaveLength(40))
  idReads = 0
  data = dossier([...sources])
  view.rerender(<OperationalRecoveryControl {...props} canEdit={false} refreshKey="new-source-array" />)
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Herstelcasussen verversen' }).disabled).toBe(false))
  const inputs = screen.getAllByRole('checkbox')
  expect(inputs.every((input, index) => input.checked === (index < 40))).toBe(true)
  expect(inputs.every(input => input.closest('fieldset').disabled)).toBe(true)
  expect(idReads).toBeLessThanOrEqual(size * 6)
  expect(api.mock.calls.some(([, options]) => options?.method)).toBe(false)
  console.log(JSON.stringify({ recoverySelectionIdentityReads: idReads, sources: size, selections: selected.length }))
})

it('keeps source type and id separate rather than accepting a delimiter collision from a restored draft', async () => {
  const jobId = 'job-exact-source', scope = 'owner:exact-source'
  writeSessionDraft(window.sessionStorage, scope, `operational-recovery:${jobId}`, {
    sourceHash, selected: [{ type: 'worker_availability:x', id: 'y' }]
  })
  const api = vi.fn(async () => dossier([{ type: 'worker_availability', id: 'x:y', title: 'Exacte bron' }]))
  render(<OperationalRecoveryControl api={api} jobId={jobId} canEdit draftScope={scope} />)
  expect((await screen.findByRole('checkbox', { name: /Exacte bron/ })).checked).toBe(false)
  expect(api.mock.calls.some(([, options]) => options?.method)).toBe(false)
})

it('refreshes retained case actions, dates and material navigation on authority, time-zone and source changes', async () => {
  const OriginalFormatter = Intl.DateTimeFormat
  let timeZone = 'Europe/Amsterdam'
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locale, options) {
    return new OriginalFormatter(locale, { ...options, timeZone })
  })
  const source = { type: 'material_requirement_shortfall', id: 'material', title: 'Materiaalbron', impact: {
    scheduleProjection: { baselineStatus: 'approved_current', pathStatus: 'critical_path_affected', affectedTasks: [],
      contractComparisons: [], materialReadiness: [{ materialRequirementId: 'material', itemName: 'Beugels',
        tasks: [{ taskId: 'task', title: 'Montage', status: 'availability_unknown' }] }] }
  } }
  let data = dossier([source], [{ ...recoveryCase('case'), sources: [source] }])
  const api = vi.fn(async () => data), navigation = vi.fn()
  const props = { api, jobId: 'job-original', canEdit: true }
  const view = render(<OperationalRecoveryControl {...props} />)
  await screen.findByLabelText('Bewijs van herstel')
  const originalDate = screen.getByText(/^Eigenaar: Planner/).textContent
  view.rerender(<OperationalRecoveryControl {...props} canEdit={false} />)
  expect(screen.queryByLabelText('Bewijs van herstel')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Bekijk herstelplanning' })).toBeNull()
  timeZone = 'America/New_York'
  view.rerender(<OperationalRecoveryControl {...props} />)
  expect(screen.getByText(/^Eigenaar: Planner/).textContent).not.toBe(originalDate)
  window.addEventListener('contractor:dossier-navigate', navigation)
  try {
    view.rerender(<OperationalRecoveryControl {...props} jobId="job-current" />)
    await waitFor(() => expect(screen.getByRole('button', { name: 'Herstelcasussen verversen' }).disabled).toBe(false))
    await userEvent.click(screen.getByRole('button', { name: 'Bekijk herstelplanning' }))
    expect(navigation).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.objectContaining({ jobId: 'job-current' }) }))
    data = { ...data, sourceHash: 'b'.repeat(64), cases: [{ ...data.cases[0], sourceCurrent: false, recoveryAction: 'Nieuwe bron beoordelen' }] }
    await userEvent.click(screen.getByRole('button', { name: 'Herstelcasussen verversen' }))
    await screen.findByText('Nieuwe bron beoordelen')
    expect(screen.queryByLabelText('Bewijs van herstel')).toBeNull()
    expect(screen.getByLabelText('Beoordeling van gewijzigde bron')).toBeTruthy()
    expect(api.mock.calls.some(([, options]) => options?.method)).toBe(false)
  } finally { window.removeEventListener('contractor:dossier-navigate', navigation) }
})

it('aborts abandoned reads and ignores their late settlement without unlocking a replacement read', async () => {
  const pending = []
  const api = vi.fn((url, options) => new Promise((resolve, reject) => pending.push({ url, options, resolve, reject })))
  const props = { api, jobId: 'job-old', canEdit: true }
  const view = render(<OperationalRecoveryControl {...props} />)
  await waitFor(() => expect(pending).toHaveLength(1))
  expect(pending[0].options?.signal).toBeInstanceOf(AbortSignal)
  view.rerender(<OperationalRecoveryControl {...props} jobId="job-new" />)
  await waitFor(() => expect(pending).toHaveLength(2))
  expect(pending[0].options.signal.aborted).toBe(true)
  await act(async () => pending[0].reject(new Error('Oude bron mag niet verschijnen')))
  expect(screen.queryByText('Oude bron mag niet verschijnen')).toBeNull()
  expect(screen.getByText('Verstoringen laden...')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Herstelcasussen verversen' }).disabled).toBe(true)
  await act(async () => pending[1].resolve(dossier([{ type: 'safety_incident', id: 'new', title: 'Nieuwe bron' }])))
  fireEvent.click(await screen.findByRole('checkbox', { name: /Nieuwe bron/ }))
  expect(screen.getByRole('button', { name: 'Herstelcasus aanmaken' }).disabled).toBe(false)
  view.unmount()
  expect(pending[1].options.signal.aborted).toBe(true)
  expect(api.mock.calls.some(([, options]) => options?.method)).toBe(false)
})

it('navigation cancels only the read, not an already submitted exact recovery command', async () => {
  let finishWrite
  const data = dossier([{ type: 'safety_incident', id: 'incident', title: 'Bron voor herstel' }])
  const api = vi.fn((url, options) => options?.method === 'POST'
    ? new Promise(resolve => { finishWrite = resolve }) : Promise.resolve(data))
  const onChanged = vi.fn()
  const view = render(<OperationalRecoveryControl api={api} jobId="job-write" canEdit onChanged={onChanged} />)
  await userEvent.click(await screen.findByRole('checkbox', { name: /Bron voor herstel/ }))
  await userEvent.click(screen.getByRole('button', { name: 'Herstelcasus aanmaken' }))
  fireEvent.change(screen.getByLabelText('Verantwoordelijke'), { target: { value: 'Planner' } })
  fireEvent.change(screen.getByLabelText('Opvolgen voor'), { target: { value: '2030-01-02T09:00' } })
  fireEvent.change(screen.getByLabelText('Wat moet worden uitgezocht of voorbereid?'), { target: { value: 'Beoordeel het actuele bewijs.' } })
  await userEvent.click(screen.getByRole('button', { name: 'Herstel vastleggen' }))
  await waitFor(() => expect(finishWrite).toBeTypeOf('function'))
  const reads = api.mock.calls.filter(([, options]) => !options?.method)
  const writes = api.mock.calls.filter(([, options]) => options?.method === 'POST')
  expect(writes).toHaveLength(1)
  expect(JSON.parse(writes[0][1].body)).toMatchObject({ action: 'create', sourceHash,
    sources: [{ type: 'safety_incident', id: 'incident' }], owner: 'Planner', recoveryAction: 'Beoordeel het actuele bewijs.' })
  expect(writes[0][1].signal).toBeUndefined()
  view.unmount()
  expect(reads[0][1].signal.aborted).toBe(true)
  await act(async () => finishWrite({ caseId: 'retained' }))
  expect(onChanged).toHaveBeenCalledTimes(1)
  expect(api.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
})
