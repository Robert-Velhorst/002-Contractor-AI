import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import WarehouseMaterialRecovery from '../components/WarehouseMaterialRecovery'
import { removeSessionDraft } from '../draft-recovery'

const recoveryCase = { id: 'recovery-1', jobId: 'job-1', caseHash: 'c'.repeat(64), status: 'open', sourceCurrent: true }
const source = { id: 'material-1', sourceFingerprint: 'f'.repeat(64), impact: { materialLines: [{ materialRequirementId: 'material-1',
  itemName: 'Kabelgoot', unit: 'm', shortfallQuantity: 7, undeliveredOrderQuantity: 0, warehouseMaterialId: 'catalog-1',
  warehouseAvailableQuantity: 5, warehouseUnitMatches: true, warehouseInTransitQuantity: 0 }] } }

it('records a source-bound stock issue and retries the exact command after a lost response', async () => {
  const user = userEvent.setup()
  const draftScope = 'owner:warehouse-recovery-test'
  removeSessionDraft(window.sessionStorage, draftScope, 'warehouse-recovery:recovery-1:material-1')
  let fail = true
  const api = vi.fn(async () => {
    if (fail) throw Object.assign(new Error('Verbinding onderbroken'), { status: 503 })
    return { warehouseMaterialIssue: { issueId: 'issue-1' } }
  })
  const props = { api, canEdit: true, recoveryCase, source, sourceHash: 'a'.repeat(64), draftScope, onError: vi.fn() }
  const view = render(<WarehouseMaterialRecovery {...props} />)
  expect(screen.getByText(/Vrije voorraad: 5 m/)).toBeTruthy()
  await user.type(screen.getByLabelText('Uit te geven hoeveelheid'), '3')
  await user.type(screen.getByLabelText('Voorraadtelreferentie'), 'TEL-01')
  await user.type(screen.getByLabelText('Uitgifte- of transportreferentie'), 'RIT-01')
  await user.type(screen.getByLabelText('Bewijsreferentie'), 'bon:01')
  await user.type(screen.getByLabelText('Verwachte aankomst op locatie'), '2030-01-02T09:00')
  await user.click(screen.getByRole('button', { name: 'Voorraad naar bouwplaats uitgeven' }))
  await screen.findByRole('button', { name: 'Dezelfde uitgifte opnieuw proberen' })
  const firstRequest = api.mock.calls[0][1].body
  fail = false
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 230)) })
  view.unmount()
  render(<WarehouseMaterialRecovery {...props} recoveryCase={{ ...recoveryCase, sourceCurrent: false }}
    source={{ ...source, sourceFingerprint: 'changed' }} sourceHash={'b'.repeat(64)} />)
  await user.click(screen.getByRole('button', { name: 'Dezelfde uitgifte opnieuw proberen' }))
  await waitFor(() => expect(api).toHaveBeenCalledTimes(2))
  expect(api.mock.calls[1][1].body).toBe(firstRequest)
  expect(JSON.parse(firstRequest)).toMatchObject({ action: 'warehouse_material_issue', sourceId: 'material-1', quantity: 3,
    sourceReference: 'TEL-01', dispatchReference: 'RIT-01', evidenceReference: 'bon:01' })
  removeSessionDraft(window.sessionStorage, draftScope, 'warehouse-recovery:recovery-1:material-1')
})

it('does not offer an issue when warehouse catalog units do not match', () => {
  const mismatchSource = { ...source, impact: { materialLines: [
    { ...source.impact.materialLines[0], warehouseMaterialId: null, warehouseUnitMatches: false }
  ] } }
  render(<WarehouseMaterialRecovery api={vi.fn()} canEdit recoveryCase={recoveryCase} source={mismatchSource} sourceHash="hash" />)
  expect(screen.getByText(/Koppel eerst deze materiaalbehoefte/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Voorraad naar bouwplaats uitgeven' })).toBeNull()
})
