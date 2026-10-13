import { useState } from 'react'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import OperationalRecoveryCase from '../components/OperationalRecoveryCase'

vi.mock('../components/OperationalRecoveryActions', () => ({ default: () => null }))
vi.mock('../components/ClientDateImpactReview', () => ({ default: () => null }))
vi.mock('../components/RecoveryCostImpactReview', () => ({ default: () => null }))

afterEach(() => vi.restoreAllMocks())

function props(sources, resolution = {}) {
  return { item: { id: 'case-perf', status: 'open', sourceCurrent: true, sources,
    owner: 'Planner', recoveryAction: 'Herstel controleren', dueAt: null },
  data: { sourceHash: 'current' }, resolution, canEdit: true,
  api: vi.fn(), setResolution: vi.fn(), submit: vi.fn(), onChanged: vi.fn(),
  onNotice: vi.fn(), onError: vi.fn() }
}

it('does not rebuild source impacts while the operator types a retained field instruction', async () => {
  let titleReads = 0, quantityReads = 0
  const sources = Array.from({ length: 40 }, (_, index) => ({
    id: `receipt-${index}`, type: 'material_receipt',
    get title() { titleReads++; return `Levering ${index}` },
    impact: { materialLines: [{ itemName: `Beugels ${index}`, unit: 'stuks',
      get shortfallQuantity() { quantityReads++; return 2 } }] },
  }))
  sources.push({ id: 'blocked-task', type: 'field_progress_blocker', title: 'Montage geblokkeerd',
    impact: { taskId: 'task-montage', workerId: 'worker-montage' } })
  const input = props(sources)
  function Editor() {
    const [resolution, setResolution] = useState({})
    return <OperationalRecoveryCase {...input} resolution={resolution} setResolution={setResolution} timeZone="Europe/Amsterdam" />
  }
  await act(async () => { render(<Editor />) })
  const before = { titleReads, quantityReads }
  const text = 'Controleer de nieuwe beugels op locatie.'
  await userEvent.type(screen.getByLabelText('Bijgewerkte instructie voor uitvoerder worker-montage'), text)
  expect(screen.getByLabelText('Bijgewerkte instructie voor uitvoerder worker-montage').value).toBe(text)
  console.log(JSON.stringify({ recoveryInstructionTyping: { before, after: { titleReads, quantityReads }, characters: text.length } }))
  expect({ titleReads, quantityReads }).toEqual(before)
  expect(input.api).not.toHaveBeenCalled()
  expect(input.submit).not.toHaveBeenCalled()
})

it('refreshes memoized impacts for new source arrays, material authority and explicit time-zone changes', async () => {
  const sources = [{ id: 'tool', type: 'equipment_unavailable', title: 'Kraan buiten gebruik', impact: {
    affectedReservations: [{ reservationId: 'reservation', jobTitle: 'Dakmontage',
      neededFrom: '2026-10-01T08:00:00Z', neededUntil: '2026-10-01T10:00:00Z' }],
  } }]
  const input = props(sources)
  const firstReadiness = vi.fn(source => <span>{source.id}: actuele materiaalcontrole</span>)
  let view
  await act(async () => { view = render(<OperationalRecoveryCase {...input} timeZone="Europe/Amsterdam" renderMaterialReadiness={firstReadiness} />) })
  const firstDate = screen.getByText(/Dakmontage \/ /).textContent
  expect(firstReadiness).toHaveBeenCalledTimes(1)
  await act(async () => view.rerender(<OperationalRecoveryCase {...input} resolution={{ 'case-perf': 'Concept' }} timeZone="Europe/Amsterdam" renderMaterialReadiness={firstReadiness} />))
  expect(firstReadiness).toHaveBeenCalledTimes(1)
  await act(async () => view.rerender(<OperationalRecoveryCase {...input} timeZone="America/New_York" renderMaterialReadiness={firstReadiness} />))
  expect(screen.getByText(/Dakmontage \/ /).textContent).not.toBe(firstDate)
  const readonlyReadiness = vi.fn(source => <span>{source.id}: alleen lezen</span>)
  await act(async () => view.rerender(<OperationalRecoveryCase {...input} canEdit={false} timeZone="America/New_York" renderMaterialReadiness={readonlyReadiness} />))
  expect(screen.getByText('tool: alleen lezen')).toBeTruthy()
  expect(screen.queryByLabelText('Bewijs van herstel')).toBeNull()
  const nextSources = [{ ...sources[0], title: '<img src=x onerror=alert(1)>', impact: { ...sources[0].impact, affectedReservations: [] } }]
  await act(async () => view.rerender(<OperationalRecoveryCase {...input} item={{ ...input.item, sources: nextSources, sourceCurrent: false }} timeZone="America/New_York" renderMaterialReadiness={readonlyReadiness} />))
  expect(screen.getByText(/Materieel niet inzetbaar: <img/)).toBeTruthy()
  expect(screen.queryByText(/Dakmontage \/ /)).toBeNull()
  expect(screen.queryByLabelText('Bewijs van herstel')).toBeNull()
  expect(view.container.querySelector('img')).toBeNull()
  expect(input.api).not.toHaveBeenCalled()
  expect(input.submit).not.toHaveBeenCalled()
})

it('checks selected resumption reports without quadratic source-id scans', async () => {
  let idReads = 0
  const size = 200, resolution = { 'case-perf': 'Actueel herstelbewijs' }
  const sources = Array.from({ length: size }, (_, index) => {
    const id = `source-${index}`, progressId = `progress-${index}`
    resolution[`progress:${id}`] = progressId
    return { get id() { idReads++; return id }, type: 'field_progress_blocker',
      title: `Blokkade ${index}`, impact: { followUpReports: [{ id: progressId,
        note: 'Werk hervat na controle', reportedAt: null }] } }
  })
  await act(async () => { render(<OperationalRecoveryCase {...props(sources, resolution)} />) })
  expect(screen.getByRole('button', { name: 'Afronden met bewijs' }).disabled).toBe(false)
  expect(idReads).toBeLessThan(size * 20)
})

it('keeps an unmatched report blocked rather than accepting another source report', async () => {
  const sources = [{ id: 'source-1', type: 'field_progress_blocker', title: 'Blokkade',
    impact: { followUpReports: [{ id: 'report-1', note: 'Hervat', reportedAt: null }] } }]
  await act(async () => { render(<OperationalRecoveryCase {...props(sources,
    { 'case-perf': 'Herstelbewijs', 'progress:source-1': 'report-other-source' })} />) })
  expect(screen.getByRole('button', { name: 'Afronden met bewijs' }).disabled).toBe(true)
})

it('retains material category order, units and unavailable-inspection wording with one quantity read per line', async () => {
  const reads = { shortfallQuantity: 0, pendingInspectionQuantity: 0, siteDamagedQuantity: 0 }
  const quantities = { shortfallQuantity: 2, pendingInspectionQuantity: 3, siteDamagedQuantity: 1 }
  const line = { itemName: 'Dakrollen', unit: 'rollen' }
  for (const key of Object.keys(reads)) Object.defineProperty(line, key, {
    get() { reads[key]++; return quantities[key] }
  })
  const source = { id: 'receipt-1', type: 'material_receipt', title: 'Levering GR-11',
    impact: { materialLines: [line, { itemName: 'Geen tekort', unit: 'stuks', shortfallQuantity: 0,
      pendingInspectionQuantity: -1, siteDamagedQuantity: null }] } }
  await act(async () => { render(<OperationalRecoveryCase {...props([source])} />) })
  const text = screen.getByText(/Materiaaltekort of leveringsafwijking: Levering GR-11/).textContent
  expect(text).toContain(' / tekort Dakrollen: 2 rollen / wacht op inspectie Dakrollen: 3 rollen (niet beschikbaar) / beschadigd Dakrollen: 1 rollen')
  expect(text).not.toContain('Geen tekort')
  expect(reads).toEqual({ shortfallQuantity: 1, pendingInspectionQuantity: 1, siteDamagedQuantity: 1 })
})

it('indexes instructions once and keeps the last retained instruction, not timestamp order', async () => {
  let sourceReads = 0
  const size = 80
  const sources = Array.from({ length: size }, (_, index) => ({ id: `source-${index}`,
    type: 'field_progress_blocker', title: `Blokkade ${index}`, impact: { taskId: `task-${index}`, workerId: `worker-${index}` } }))
  const instructions = [0, 1].flatMap(version => sources.map((source, index) => ({
    get sourceId() { sourceReads++; return source.id }, text: `Instructie ${version}:${index}`,
    createdAt: version ? '2026-01-01' : '2026-10-01',
  })))
  const input = props(sources)
  input.item.fieldInstructions = instructions
  Object.freeze(instructions)
  let view
  await act(async () => { view = render(<OperationalRecoveryCase {...input} />) })
  expect(sourceReads).toBeLessThanOrEqual(instructions.length * 2)
  expect(screen.getByText('Laatste instructie voor uitvoerder worker-0: Instructie 1:0')).toBeTruthy()
  expect(screen.queryByText(/Laatste instructie.*Instructie 0:/)).toBeNull()
  await act(async () => view.rerender(<OperationalRecoveryCase {...input} item={{ ...input.item,
    fieldInstructions: [...instructions, { sourceId: 'source-0', text: 'Nieuw vastgelegde instructie' }] }} />))
  expect(screen.getByText('Laatste instructie voor uitvoerder worker-0: Nieuw vastgelegde instructie')).toBeTruthy()
  expect(input.submit).not.toHaveBeenCalled()
})

it('shares one formatter for an explicit zone and refreshes it when that zone changes', async () => {
  const original = Intl.DateTimeFormat
  const constructors = vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (...args) {
    return new original(...args)
  })
  const sources = [{ id: 'tool', type: 'equipment_unavailable', title: 'Kraan buiten gebruik', impact: {
    affectedReservations: Array.from({ length: 40 }, (_, index) => ({ reservationId: `reservation-${index}`,
      jobTitle: `Werk ${index}`, neededFrom: '2026-10-01T08:00:00Z', neededUntil: '2026-10-02T08:00:00Z' })),
  } }]
  const input = props(sources)
  let view
  await act(async () => { view = render(<OperationalRecoveryCase {...input} timeZone="Europe/Amsterdam" />) })
  expect(constructors).toHaveBeenCalledTimes(1)
  expect(screen.getByText(/Werk 39/)).toBeTruthy()
  await act(async () => view.rerender(<OperationalRecoveryCase {...input} item={{ ...input.item, owner: 'Nieuwe planner' }} timeZone="Europe/Amsterdam" />))
  expect(constructors).toHaveBeenCalledTimes(1)
  await act(async () => view.rerender(<OperationalRecoveryCase {...input} timeZone="America/New_York" />))
  expect(constructors).toHaveBeenCalledTimes(2)
})

it('detects a changed system time zone when a standalone caller does not pass one', async () => {
  const OriginalFormatter = Intl.DateTimeFormat
  let timeZone = 'Europe/Amsterdam'
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locale, options) {
    return new OriginalFormatter(locale, { ...options, timeZone: options?.timeZone || timeZone })
  })
  const input = props([])
  input.item.dueAt = '2026-10-01T08:00:00Z'
  let view
  await act(async () => { view = render(<OperationalRecoveryCase {...input} />) })
  const firstDate = screen.getByText(/^Eigenaar: Planner/).textContent
  timeZone = 'America/New_York'
  await act(async () => view.rerender(<OperationalRecoveryCase {...input} resolution={{ 'case-perf': 'Concept' }} />))
  expect(screen.getByText(/^Eigenaar: Planner/).textContent).not.toBe(firstDate)
})

it('retains every material inspection in source order and renders evidence as text', async () => {
  const review = (id, acceptedQuantity) => ({ reviewReference: id, acceptedQuantity,
    damagedQuantity: 1, evidenceReference: '<img src=x onerror=alert(1)>' })
  const input = props([{ id: 'receipt', type: 'material_receipt', title: 'Levering', impact: {
    materialLines: [{ itemName: 'Dakrollen', unit: 'rollen', discrepancyReceipts: [
      { receiptReference: 'GR-1', reviews: [review('I-1', 2), review('I-2', 3)] },
      { receiptReference: 'GR-2', reviews: [review('I-3', 4)] },
    ] }, { itemName: 'Planken', unit: 'stuks', discrepancyReceipts: [
      { receiptReference: 'GR-3', reviews: [review('I-4', 5)] },
    ] }, { itemName: 'Zonder inspectie', unit: 'stuks' }],
  } }])
  let view
  await act(async () => { view = render(<OperationalRecoveryCase {...input} />) })
  const notes = [...view.container.querySelectorAll('small.context-source-note')].map(note => note.textContent)
  expect(notes).toHaveLength(4)
  expect(notes.map(note => note.match(/inspectie (I-\d)/)[1])).toEqual(['I-1', 'I-2', 'I-3', 'I-4'])
  expect(notes[0]).toContain('2 rollen goedgekeurd, 1 rollen beschadigd')
  expect(notes[3]).toContain('Planken')
  expect(notes.every(note => note.includes('<img src=x onerror=alert(1)>'))).toBe(true)
  expect(view.container.querySelector('img')).toBeNull()
  expect(input.submit).not.toHaveBeenCalled()
})
