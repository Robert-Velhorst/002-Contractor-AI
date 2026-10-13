import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import OperationalRecoveryControl from '../components/OperationalRecoveryControl'
import RecoveryCostImpactReview from '../components/RecoveryCostImpactReview'
import WarehouseMaterialRecovery from '../components/WarehouseMaterialRecovery'

const recoveryCase = { id: 'case-safety', jobId: 'job-safety', caseHash: 'b'.repeat(64),
  sourceCurrent: true, status: 'open', owner: 'Planner', recoveryAction: 'Herstel onderzoeken' }
const stockSource = { id: 'material-safety', type: 'material_requirement_shortfall', impact: { materialLines: [
  { materialRequirementId: 'material-safety', itemName: 'Kabel', unit: 'm', shortfallQuantity: 7,
    warehouseMaterialId: 'catalog-safety', warehouseAvailableQuantity: 5, warehouseUnitMatches: true }
] } }
const costSource = { type: 'expense', id: 'expense-safety', label: 'Bon herstelmateriaal', availableCents: 10000,
  sourceFingerprint: 'c'.repeat(64) }

it('keeps a supplier form mounted through the parent write lock and retries the identical uncertain command', async () => {
  const source = { type: 'material_receipt', id: 'receipt-safety', title: 'Afwijkende levering', impact: {
    purchaseOrder: { id: 'order-safety', orderIssued: true, externalCommitments: 1 }
  } }
  const data = { sourceHash: 'a'.repeat(64), sources: [source], cases: [{ ...recoveryCase, sources: [source] }] }
  let rejectWrite
  const api = vi.fn((_url, options) => options?.method === 'POST'
    ? new Promise((_resolve, reject) => { rejectWrite = reject }) : Promise.resolve(data))
  render(<OperationalRecoveryControl api={api} jobId={recoveryCase.jobId} canEdit />)
  await userEvent.click(await screen.findByText('Leverancierscontact registreren'))
  await userEvent.type(await screen.findByLabelText('Wat is besproken of bevestigd?'), 'Leverancier controleert het tekort.')
  await userEvent.type(screen.getByLabelText(/Bewijsreferentie \(bijv/), 'mail:leverancier-01')
  await userEvent.click(screen.getByRole('button', { name: 'Opvolging vastleggen' }))
  await waitFor(() => expect(rejectWrite).toBeTypeOf('function'))
  expect(screen.getByLabelText('Wat is besproken of bevestigd?').value).toBe('Leverancier controleert het tekort.')
  await act(async () => rejectWrite(new Error('Antwoord verloren')))
  await screen.findByRole('button', { name: 'Dezelfde opvolging opnieuw proberen' })
  await userEvent.click(screen.getByText('Leverancierscontact registreren'))
  await userEvent.click(screen.getByText('Leverancierscontact registreren'))
  const retry = await screen.findByRole('button', { name: 'Dezelfde opvolging opnieuw proberen' })
  const original = api.mock.calls.find(([, options]) => options?.method === 'POST')[1].body
  await userEvent.click(retry)
  expect(api.mock.calls.filter(([, options]) => options?.method === 'POST').map(([, options]) => options.body)).toEqual([original, original])
  await act(async () => rejectWrite(Object.assign(new Error('Bron opnieuw beoordelen'), { status: 409 })))
})

it.each(['actual_cost_attribution', 'actual_cost_reversal'])('retains %s after a lost response and a reload', async action => {
  const api = vi.fn().mockRejectedValueOnce(new Error('Antwoord verloren')).mockResolvedValueOnce({ replayed: true })
  const item = { ...recoveryCase, actualCostAttributions: [{ id: 'attribution-safety', sourceType: 'expense',
    sourceId: costSource.id, amountCents: 2500, rationale: 'Herstelmateriaal', sourceCurrent: true }] }
  const props = { api, recoveryCase: item, actualCostSources: [costSource], sourceHash: 'a'.repeat(64),
    canEdit: true, draftScope: `owner:cost-safety:${action}` }
  const view = render(<RecoveryCostImpactReview {...props} />)
  if (action === 'actual_cost_attribution') {
    await userEvent.click(screen.getByText('Goedgekeurde werkelijke kosten toerekenen'))
    await userEvent.selectOptions(screen.getByLabelText('Kostenpost voor toerekening'), `expense:${costSource.id}`)
    await userEvent.type(screen.getByLabelText('Toegerekend bedrag'), '25')
    await userEvent.type(screen.getByLabelText('Reden van toerekening'), 'Materiaal voor herstel volgens bon.')
    await userEvent.click(screen.getByRole('button', { name: 'Werkelijke kosten toerekenen' }))
  } else {
    await userEvent.click(screen.getByRole('button', { name: 'Toerekening corrigeren' }))
    await userEvent.type(screen.getByLabelText('Reden correctie'), 'Deze bon hoort bij regulier werk.')
    await userEvent.click(screen.getByRole('button', { name: 'Toerekening terugdraaien' }))
  }
  await screen.findByRole('button', { name: 'Dezelfde kostentoerekening opnieuw proberen' })
  const original = api.mock.calls[0][1].body
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 230)) })
  view.unmount()
  render(<RecoveryCostImpactReview {...props} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Dezelfde kostentoerekening opnieuw proberen' }))
  expect(api.mock.calls.map(([, options]) => options.body)).toEqual([original, original])
  expect(JSON.parse(original).action).toBe(action)
})

it('blocks a retained stock retry after edit rights have been withdrawn', async () => {
  const api = vi.fn().mockRejectedValue(new Error('Antwoord verloren'))
  const props = { api, recoveryCase, source: stockSource, sourceHash: 'a'.repeat(64), canEdit: true, onError: vi.fn() }
  const view = render(<WarehouseMaterialRecovery {...props} />)
  await userEvent.type(screen.getByLabelText('Uit te geven hoeveelheid'), '3')
  await userEvent.type(screen.getByLabelText('Voorraadtelreferentie'), 'TEL-01')
  await userEvent.type(screen.getByLabelText('Uitgifte- of transportreferentie'), 'RIT-01')
  await userEvent.type(screen.getByLabelText('Bewijsreferentie'), 'bon:01')
  await userEvent.type(screen.getByLabelText('Verwachte aankomst op locatie'), '2030-01-02T09:00')
  await userEvent.click(screen.getByRole('button', { name: 'Voorraad naar bouwplaats uitgeven' }))
  await screen.findByRole('button', { name: 'Dezelfde uitgifte opnieuw proberen' })
  view.rerender(<WarehouseMaterialRecovery {...props} canEdit={false} />)
  const retry = screen.getByRole('button', { name: 'Dezelfde uitgifte opnieuw proberen' })
  fireEvent.click(retry)
  expect(api).toHaveBeenCalledTimes(1)
  expect(retry.disabled).toBe(true)
})
