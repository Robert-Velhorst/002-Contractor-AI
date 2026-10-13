import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import OperationalRecoveryPortfolio from '../components/OperationalRecoveryPortfolio'

const cases = [
  { id: 'case-current', jobId: 'job-1', jobTitle: 'Badkamer renovatie', status: 'open', integrityValid: true,
    sourceCurrent: true, owner: 'Planner', dueAt: '2035-06-01T10:00:00.000Z',
    triage: { priority: 'plan', action: 'secure_material' },
    sources: [{ type: 'material_requirement_shortfall', title: 'Kabelgoten' }], affectedJobs: [] },
  { id: 'case-stale', jobId: 'job-2', jobTitle: 'Dakherstel', status: 'monitoring', integrityValid: true,
    sourceCurrent: false, owner: 'Robert', dueAt: '2035-06-03T10:00:00.000Z',
    sources: [{ type: 'worker_availability', title: 'Uitvoerder' }], affectedJobs: [{ id: 'job-3', title: 'Schuur' }] },
  { id: 'source:job-3:material_requirement_shortfall:material-3', kind: 'unassigned_source',
    jobId: 'job-3', jobTitle: 'Keukenrenovatie', status: 'unassigned', integrityValid: true, sourceCurrent: true,
    owner: null, dueAt: null, sourceType: 'material_requirement_shortfall', sourceId: 'material-3',
    sources: [{ type: 'material_requirement_shortfall', title: 'Materiaaltekort', operationalImpact: {
      materialLines: [{ itemName: 'Tegellijm', unit: 'zakken', shortfallQuantity: 4, neededBy: '2035-05-25T10:00:00Z' }]
    } }], affectedJobs: [] },
  { id: 'case-safety', jobId: 'job-4', jobTitle: 'Werkplaats', status: 'open', integrityValid: true,
    sourceCurrent: true, owner: 'Planner', dueAt: '2035-06-08T10:00:00.000Z',
    triage: { priority: 'immediate', action: 'safety_review' },
    sources: [{ type: 'safety_incident', title: 'Veiligheidsmelding', severity: 'high', operationalImpact: { safetyReviewRequired: true } }],
    affectedJobs: [] },
  { id: 'case-monitor', jobId: 'job-5', jobTitle: 'Gepland herstel', status: 'monitoring', integrityValid: true,
    sourceCurrent: true, owner: 'Planner', dueAt: '2035-06-12T10:00:00.000Z',
    sources: [{ type: 'worker_availability', title: 'Beschikbaarheid gecontroleerd', operationalImpact: {} }], affectedJobs: [] },
  { id: 'case-quality', jobId: 'job-6', jobTitle: 'Open kwaliteitsafwijking', status: 'open', integrityValid: true,
    sourceCurrent: true, owner: 'Inspecteur', dueAt: '2035-06-14T10:00:00.000Z',
    sources: [{ type: 'quality_nonconformance', title: 'Onafhankelijke controle', operationalImpact: { qualityReviewRequired: true } }], affectedJobs: [] },
  { id: 'case-equipment', jobId: 'job-7', jobTitle: 'Materieel geblokkeerd', status: 'open', integrityValid: true,
    sourceCurrent: true, owner: 'Werkvoorbereider', dueAt: '2035-06-15T10:00:00.000Z',
    sources: [{ type: 'equipment_unavailable', title: 'Onveilig materieel', operationalImpact: { equipment: { fieldSafetyHoldOpen: true } } }], affectedJobs: [] },
]

it('shows the cross-job recovery queue, filters attention cases and opens their job', () => {
  const onOpen = vi.fn()
  render(<OperationalRecoveryPortfolio data={{ cases, total: 7 }} locale="nl-NL" onOpen={onOpen} />)
  expect(screen.getByText('Badkamer renovatie')).toBeTruthy()
  expect(screen.getByText('Dakherstel')).toBeTruthy()
  expect(screen.getByText('Keukenrenovatie')).toBeTruthy()
  expect(screen.getByText('Werkplaats')).toBeTruthy()
  expect(screen.getByText('Direct beoordelen')).toBeTruthy()
  expect(screen.getByText('Eerstvolgende controle: Veiligheid direct beoordelen')).toBeTruthy()
  expect(screen.getByText('Inplannen')).toBeTruthy()
  expect(screen.getByText('Eerstvolgende controle: Materiaalbeschikbaarheid en alternatief controleren')).toBeTruthy()
  expect(screen.getAllByRole('article')[0].textContent).toContain('Werkplaats')
  expect(screen.getByText('Tegellijm: 4 zakken tekort; nodig 25 mei 2035')).toBeTruthy()
  expect(screen.getByText('Bron gewijzigd; herbeoordeling nodig')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Actie nodig' }))
  expect(screen.queryByText('Badkamer renovatie')).toBeNull()
  expect(screen.getByText('Werkplaats')).toBeTruthy()
  expect(screen.queryByText('Gepland herstel')).toBeNull()
  expect(screen.getByText('Open kwaliteitsafwijking')).toBeTruthy()
  expect(screen.getByText('Materieel geblokkeerd')).toBeTruthy()
  expect(screen.getByText('Menselijke veiligheidsbeoordeling vereist (high)')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Open opdracht: Dakherstel' }))
  expect(onOpen).toHaveBeenCalledWith(cases[1])
  fireEvent.click(screen.getByRole('button', { name: 'Monitoren' }))
  expect(screen.getByText('Badkamer renovatie')).toBeTruthy()
  expect(screen.getByText('Gepland herstel')).toBeTruthy()
  expect(screen.queryByText('Werkplaats')).toBeNull()
  expect(screen.queryByText('Open kwaliteitsafwijking')).toBeNull()
  expect(screen.queryByText('Materieel geblokkeerd')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Alles' }))
  expect(screen.getByText('Badkamer renovatie')).toBeTruthy()
  expect(screen.getByText('Ook geraakt: Schuur')).toBeTruthy()
})

it('renders a recovery-integrity problem as urgent and supports English labels', () => {
  const corrupted = { id: 'case-corrupt', jobId: 'job-x', jobTitle: 'Extension', status: 'open',
    integrityValid: false, sourceCurrent: null, sources: [], affectedJobs: [] }
  render(<OperationalRecoveryPortfolio data={{ cases: [corrupted], total: 1 }} locale="en-GB" />)
  expect(screen.getByText('Integrity check failed')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Needs action' }))
  expect(screen.getByText('Extension')).toBeTruthy()
})

it('puts overdue follow-ups ahead of newer non-critical disruptions, while keeping immediate safety first', () => {
  const overdue = { id: 'case-overdue', jobId: 'job-overdue', jobTitle: 'Verlopen materiaalactie', status: 'open',
    integrityValid: true, sourceCurrent: true, dueAt: '2000-01-01T10:00:00.000Z',
    triage: { priority: 'plan', action: 'secure_material' },
    sources: [{ type: 'material_requirement_shortfall', title: 'Materiaaltekort' }], affectedJobs: [] }
  const newer = { id: 'case-newer', jobId: 'job-newer', jobTitle: 'Nieuwe roostercontrole', status: 'open',
    integrityValid: true, sourceCurrent: true, dueAt: '2099-01-01T10:00:00.000Z',
    triage: { priority: 'today', action: 'confirm_workforce_coverage' },
    sources: [{ type: 'worker_availability', title: 'Uitvoerder afwezig' }], affectedJobs: [] }
  render(<OperationalRecoveryPortfolio data={{ cases: [newer, overdue, cases[3]], total: 3 }} locale="nl-NL" />)
  const rows = screen.getAllByRole('article')
  expect(rows[0].textContent).toContain('Werkplaats')
  expect(rows[1].textContent).toContain('Verlopen materiaalactie')
  expect(rows[1].textContent).toContain('Opvolgdatum verstreken')
  expect(rows[2].textContent).toContain('Nieuwe roostercontrole')
})

it('shows quality due date and independent-closure state with localized labels', () => {
  const qualityCase = { id: 'quality-case', jobId: 'job-quality', jobTitle: 'Gevelherstel', status: 'open',
    integrityValid: true, sourceCurrent: true, sources: [{ type: 'quality_nonconformance',
      title: 'Kwaliteitsafwijking', severity: 'critical', status: 'pending_closure_approval',
      operationalImpact: { qualityReviewRequired: true, qualityDueAt: '2035-05-25',
        qualityIntegrityValid: true, qualityCorrectionIntegrityValid: true, qualityClosureIntegrityValid: true } }],
    affectedJobs: [] }
  render(<OperationalRecoveryPortfolio data={{ cases: [qualityCase], total: 1 }} locale="nl-NL" />)
  expect(screen.getByText('Kwaliteitsafwijking')).toBeTruthy()
  expect(screen.getByText('Onafhankelijke kwaliteitsafsluiting vereist; termijn 25 mei 2035')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Actie nodig' }))
  expect(screen.getByText('Gevelherstel')).toBeTruthy()
})
