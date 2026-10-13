import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import { CloseoutRegister } from '../components/JobWorkspaceControls'

afterEach(() => vi.unstubAllGlobals())

const assessment = {
  status: 'follow_up_required',
  sections: {
    operational: { status: 'ready', blockers: [] },
    handover: { status: 'delivery_required', currentPackageId: null, missing: [], blockers: [] },
    client: { state: 'office_review_required', latestDisposition: null },
    commercial: { status: 'open_items', openVariations: [{ id: 'var-1' }], openSelections: [] },
    workPackages: { status: 'reported', records: [{ id: 'pack-1', code: 'WP-01', title: 'Deuren', balanceStatus: 'current',
      remainingRows: [{ description: 'Deuren', completedQuantity: 1, plannedQuantity: 2, remainingQuantity: 1, unit: 'st' }],
      tasks: [{ id: 'task-1', status: 'open' }], deliveries: [{ id: 'delivery-1', title: 'Eerste deur', physicalStatus: 'reported',
        inspectionStatus: 'not_linked', customerResponseStatus: 'accepted_with_reservations', financeStatus: 'outstanding', invoiceIds: ['invoice-1'],
        financeMilestones: [{ id: 'milestone-1', title: 'Deelbetaling eerste deur', total: 121, currency: 'EUR', invoiceId: 'invoice-1' }],
        invoiceBalances: [{ id: 'invoice-1', receivedAmount: 0, outstandingAmount: 121, currency: 'EUR' }] }] }] },
    finance: { status: 'balances_open', receivables: [{ id: 'invoice-1' }], supplierPayables: [], receivableTotals: [{ currency: 'EUR', amount: 250 }], payableTotals: [] },
    aftercare: { status: 'no_open_items', warrantyClaims: [], followUps: [] },
  },
  warnings: [
    { code: 'client_response_unreviewed', label: 'The latest client response needs an office review.' },
    { code: 'commercial_items_open', variationCount: 1, selectionCount: 0, label: 'Open commercial item.' },
  ],
}

function renderRegister(overrides = {}) {
  return render(<CloseoutRegister
    job={{ id: 'job-1', punchItems: [], warrantyClaims: [], aftercare: [], clientFeedback: [], approvals: [], documents: [] }}
    locale="nl-NL"
    canReportPunch={false}
    canCoordinate={false}
    canApprove={false}
    fieldScoped={false}
    operator={{ name: 'Reviewer' }}
    submitting={false}
    onCreate={vi.fn()}
    onLifecycle={vi.fn()}
    onOpenApprovals={vi.fn()}
    {...overrides}
  />)
}

it('renders separate closeout domains and the legal/financial decision boundary', async () => {
  const fetchMock = vi.fn(async url => ({
    ok: true,
    json: async () => String(url).includes('closeout-assessment') ? { assessment } : { responses: [] },
  }))
  vi.stubGlobal('fetch', fetchMock)
  renderRegister({ canCoordinate: true })

  expect(await screen.findByText('Overzicht contractuele oplevering')).toBeTruthy()
  expect(screen.getByText('Uitvoering')).toBeTruthy()
  expect(screen.getByText('Overdracht')).toBeTruthy()
  expect(screen.getByText('Klantreactie')).toBeTruthy()
  expect(screen.getByText('Commercieel')).toBeTruthy()
  expect(screen.getByText('Financiën')).toBeTruthy()
  expect(screen.getAllByText('Nazorg').length).toBeGreaterThan(1)
  expect(screen.getByText('Dit is een overzicht van vastgelegde gegevens, geen juridische acceptatie, contractsluiting of vrijgave van betaling.')).toBeTruthy()
  await userEvent.click(screen.getByText('Bekijk opleverpunten en blokkades'))
  expect(screen.getByText('WP-01 / Deuren')).toBeTruthy()
  expect(screen.getByText(/1 \/ 2 st/)).toBeTruthy()
  expect(screen.getByText(/Facturen: invoice-1/)).toBeTruthy()
  expect(screen.getByText(/Deelbetaling eerste deur/)).toBeTruthy()
  expect(screen.getByTestId('closeout-delivery-balance-invoice-1').textContent).toContain('121')
  await userEvent.click(screen.getByRole('button', { name: 'Oplevering opnieuw beoordelen' }))
  await waitFor(() => expect(fetchMock.mock.calls.filter(([url]) => String(url).includes('closeout-assessment'))).toHaveLength(2))
})

it('allows designated approvers to inspect while keeping field-scoped workspaces away from office data', async () => {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ assessment, responses: [] }) }))
  vi.stubGlobal('fetch', fetchMock)
  const { rerender } = renderRegister({ canApprove: true })
  expect(await screen.findByTestId('closeout-assessment')).toBeTruthy()
  expect(fetchMock).toHaveBeenCalledWith('/api/ledger/jobs/job-1/closeout-assessment', expect.objectContaining({ credentials: 'same-origin' }))

  rerender(<CloseoutRegister
    job={{ id: 'job-2', punchItems: [], warrantyClaims: [], aftercare: [], clientFeedback: [], approvals: [], documents: [] }}
    locale="nl-NL" fieldScoped canReportPunch onCreate={vi.fn()} onLifecycle={vi.fn()} onOpenApprovals={vi.fn()}
    operator={{ name: 'Field worker' }} submitting={false}
  />)
  await waitFor(() => expect(screen.queryByTestId('closeout-assessment')).toBeNull())
  expect(fetchMock.mock.calls.every(([url]) => !String(url).includes('/api/ledger/jobs/job-2/'))).toBe(true)
})
