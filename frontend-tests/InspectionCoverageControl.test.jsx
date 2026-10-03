import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import InspectionCoverageControl from '../components/InspectionCoverageControl'
import FieldWorkContext from '../components/FieldWorkContext'
const check = { key: 'door', title: 'Sluiting deur', criterion: 'Private tolerance', fieldInstruction: 'Controleer de sluiting.', allowNotApplicable: true }
const source = { sourceHash: 'a'.repeat(64), records: [{ id: 'd', title: 'Eerste deur', scope: 'Alleen de eerste deur', status: 'retained',
  coverage: { status: 'not_configured', total: 0, covered: 0, pending: false, checks: [], planId: null }, history: [] }],
options: { documents: [{ id: 'doc', title: 'Meetrapport', reference: 'Private archive R1' }], inspections: [{ id: 'i', title: 'Deurcontrole', eligible: true }] } }
const planned = { ...source, records: [{ ...source.records[0], coverage: { status: 'evidence_required', total: 1, covered: 0, pending: false, checks: [{ ...check, status: 'review_required' }], planId: 'p' },
  history: [{ id: 'p', kind: 'plan', sequence: 1, status: 'approved', sourceCurrent: true, scopeReference: 'First door', checks: [check], documentIds: [] }] }] }
async function planDraft() {
  await userEvent.click(await screen.findByRole('button', { name: 'Controleplan opstellen' }))
  await userEvent.type(screen.getByLabelText('Afbakening controlescope'), 'Eerste deur, tweede deur uitgesloten')
  await userEvent.type(screen.getByLabelText('Controletitel voor uitvoerende'), 'Sluiting deur')
  await userEvent.type(screen.getByLabelText('Acceptatiecriterium'), 'Conform gecontroleerde werkinstructie')
  await userEvent.type(screen.getByLabelText('Instructie voor uitvoerende'), 'Controleer de sluiting.')
  await userEvent.click(screen.getByRole('checkbox', { name: 'Alle vereiste controles voor dit beschreven deel zijn opgenomen' }))
  await userEvent.type(screen.getByLabelText('Onderbouwing voor beoordelaar'), 'Controlelijst voor dit uitgevoerde deel')
}
it('retains exactly one uncertain plan command and prevents changing another record', async () => {
  let fail = true
  const api = vi.fn(async (_, options) => { if (options?.method === "POST" && fail) throw new Error('Verbinding onderbroken'); return source })
  render(<InspectionCoverageControl api={api} jobId="j" canEdit />)
  await planDraft(); await userEvent.click(screen.getByRole('button', { name: 'Ter beoordeling indienen' }))
  await screen.findByText('Verbinding onderbroken')
  expect(screen.getByRole('button', { name: 'Keuringsdekking verversen' }).disabled).toBe(true)
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Dezelfde wijziging opnieuw controleren' }))
  await screen.findByText('Beoordeling toegevoegd aan Goedkeuringen.')
  const writes = api.mock.calls.filter(([, options]) => options?.method === "POST")
  expect(writes).toHaveLength(2); expect(writes[0][1].body).toBe(writes[1][1].body)
  expect(JSON.parse(writes[0][1].body).record.scopeConfirmed).toBe(true)
}, 15000)
it('keeps conflict input while refreshing and removes editing after authority loss', async () => {
  const api = vi.fn(async (_, options) => { if (options?.method === "POST") throw Object.assign(new Error('Scope gewijzigd'), { status: 409 }); return source })
  const { rerender } = render(<InspectionCoverageControl api={api} jobId="j" canEdit />)
  await planDraft(); await userEvent.click(screen.getByRole('button', { name: 'Ter beoordeling indienen' }))
  await screen.findByText('Scope gewijzigd'); await userEvent.click(screen.getByRole('button', { name: 'Keuringsdekking verversen' }))
  await waitFor(() => expect(screen.queryByText('Scope gewijzigd')).toBeNull())
  expect(screen.getByLabelText('Afbakening controlescope').value).toContain('tweede deur uitgesloten')
  rerender(<InspectionCoverageControl api={api} jobId="j" />)
  expect(screen.queryByRole('button', { name: 'Ter beoordeling indienen' })).toBeNull()
}, 15000)
it('submits a complete explicit assessment with an existing inspection and retained source', async () => {
  const api = vi.fn().mockResolvedValue(planned)
  render(<InspectionCoverageControl api={api} jobId="j" canEdit />)
  await userEvent.click(await screen.findByRole('button', { name: 'Bewijs per controle beoordelen' }))
  await userEvent.selectOptions(screen.getByLabelText('Goedgekeurde keuring'), 'i')
  await userEvent.type(screen.getByLabelText('Bewijs voor dit uitgevoerde deel'), 'Rapport regel 1 beschrijft de eerste deur')
  await userEvent.click(screen.getByRole('checkbox', { name: 'Meetrapport' }))
  await userEvent.type(screen.getByLabelText('Onderbouwing voor beoordelaar'), 'Alle controlepunten onderbouwd')
  await userEvent.click(screen.getByRole('button', { name: 'Ter beoordeling indienen' }))
  await screen.findByText('Beoordeling toegevoegd aan Goedkeuringen.')
  const command = JSON.parse(api.mock.calls.find(([, options]) => options?.method === "POST")[1].body)
  expect(command.record.planId).toBe('p'); expect(command.record.responses[0].documentIds).toEqual(['doc'])
  expect(command.record.responses[0].inspectionId).toBe('i')
})
it('supports read recovery, escaped source text and read-only history', async () => {
  const unsafe = '<img src=x onerror=alert(1)>'
  const onChanged = vi.fn()
  const api = vi.fn().mockRejectedValueOnce(new Error('Niet bereikbaar')).mockResolvedValue({ ...planned, records: [{ ...planned.records[0], scope: unsafe }] })
  render(<InspectionCoverageControl api={api} jobId="j" onChanged={onChanged} />)
  await screen.findByText('Niet bereikbaar'); await userEvent.click(screen.getByRole('button', { name: 'Keuringsdekking verversen' }))
  await screen.findByText(unsafe); expect(document.querySelector('img')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Controleplan herzien' })).toBeNull()
  expect(onChanged).toHaveBeenCalledTimes(1)
})
it('renders current field coverage and remains compatible with older offline packs', () => {
  const context = { places: [], contacts: [], packages: [], deliveries: [{ id: 'd', title: 'Eerste deur', scope: 'Deur', physicalStatus: 'reported', inspectionStatus: 'not_linked', quantities: [], inspectionCoverage: planned.records[0].coverage }] }
  const { rerender } = render(<FieldWorkContext context={context} />)
  expect(screen.getByText('Bewijs per controle ontbreekt')).toBeTruthy()
  expect(screen.getByText('Controleer de sluiting.')).toBeTruthy()
  const legacy = { ...context.deliveries[0] }; delete legacy.inspectionCoverage
  rerender(<FieldWorkContext context={{ ...context, deliveries: [legacy] }} />)
  expect(screen.queryByText('Controleer de sluiting.')).toBeNull()
})
