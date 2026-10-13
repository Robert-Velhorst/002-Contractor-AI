import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import SharedMaterialStockControl from '../components/SharedMaterialStockControl'

const translate = (key, variables = {}) => Object.entries(variables).reduce((value, [name, replacement]) => value.replaceAll(`{${name}}`, String(replacement)), key)
const stock = {
  materials: [{ id: 'mat-1', name: 'Fastener box', unit: 'boxes', stockQuantity: 10, reservedQuantity: 6, availableQuantity: 4 }],
  allocations: [{ id: 'allocation-1', jobId: 'job-1', jobTitle: 'Roof repair', requirementId: 'req-1', materialName: 'Fastener box', unit: 'boxes', quantity: 6, remainingQuantity: 6, status: 'reserved', sourceReference: 'COUNT-1' }],
  requirements: [{ id: 'req-2', jobId: 'job-2', jobTitle: 'Extension', materialId: 'mat-1', materialName: 'Fastener box', quantity: 4, unit: 'boxes' }],
  movements: [], summary: { materials: 1, activeAllocations: 1, shortItems: 0 },
}

it('shows shared balances and saves a referenced warehouse stock count', async () => {
  const request = vi.fn().mockResolvedValueOnce(stock).mockResolvedValueOnce(stock)
  render(<SharedMaterialStockControl request={request} canCoordinate submitting={false} t={translate} />)
  expect((await screen.findAllByText('Fastener box')).length).toBeGreaterThan(0)
  expect(screen.getByText('4 boxes')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Material name'), { target: { value: 'Cable ties' } })
  fireEvent.change(screen.getByLabelText('Unit'), { target: { value: 'bags' } })
  fireEvent.change(screen.getByLabelText('Counted quantity'), { target: { value: '3' } })
  fireEvent.change(screen.getByLabelText('Count reference'), { target: { value: 'COUNT-2' } })
  fireEvent.change(screen.getAllByLabelText('Note')[0], { target: { value: 'Counted on shelf A' } })
  fireEvent.click(screen.getByRole('button', { name: 'Save stock count' }))
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  const [route, options] = request.mock.calls[1]
  expect(route).toBe('/api/ledger/material-stock/counts')
  expect(JSON.parse(options.body)).toMatchObject({ name: 'Cable ties', unit: 'bags', countedQuantity: 3, reference: 'COUNT-2', note: 'Counted on shelf A' })
})

it('keeps stock mutation controls out of the read-only view', async () => {
  const request = vi.fn().mockResolvedValue(stock)
  render(<SharedMaterialStockControl request={request} canCoordinate={false} submitting={false} t={translate} />)
  expect((await screen.findAllByText('Fastener box')).length).toBeGreaterThan(0)
  expect(screen.queryByRole('button', { name: 'Save stock count' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Reserve stock' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Record use' })).toBeNull()
})

it('lets office staff classify a pending site receipt with evidence and idempotency key', async () => {
  const pendingStock = { ...stock, siteIssues: [{ id: 'issue-1', jobId: 'job-1', jobTitle: 'Roof repair', materialName: 'Fastener box', unit: 'boxes', receipts: [{
    id: 'receipt-1', receiptReference: 'SITE-1', receivedQuantity: 4, acceptedQuantity: 2, damagedQuantity: 0,
    pendingInspectionQuantity: 2, receivedBy: 'Field worker', location: 'Site store', evidenceReference: 'photo:arrival-1', reviews: []
  }] }] }
  const reviewedStock = { ...pendingStock, siteIssues: [{ ...pendingStock.siteIssues[0], acceptedQuantity: 3.5, damagedQuantity: 0.5,
    pendingInspectionQuantity: 0, receipts: [{ ...pendingStock.siteIssues[0].receipts[0], acceptedQuantity: 3.5, damagedQuantity: 0.5,
      pendingInspectionQuantity: 0, reviews: [{ id: 'review-1', acceptedQuantity: 1.5, damagedQuantity: 0.5,
        reviewReference: 'QC-SITE-1', evidenceReference: 'photo:inspection-1', reviewedBy: 'office_operator:local', reviewedAt: '2026-09-25T10:00:00.000Z' }] }] }] }
  const request = vi.fn().mockResolvedValueOnce(pendingStock).mockResolvedValueOnce(reviewedStock)
  render(<SharedMaterialStockControl request={request} canCoordinate submitting={false} t={translate} />)
  const form = await screen.findByRole('form', { name: 'Inspect site receipt SITE-1' })
  fireEvent.change(screen.getByLabelText('Accepted after inspection'), { target: { value: '1.5' } })
  fireEvent.change(screen.getByLabelText('Damaged after inspection'), { target: { value: '0.5' } })
  fireEvent.change(screen.getByLabelText('Inspection reference'), { target: { value: 'QC-SITE-1' } })
  fireEvent.change(screen.getByLabelText('Inspection evidence reference'), { target: { value: 'photo:inspection-1' } })
  fireEvent.submit(form)
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  const [route, options] = request.mock.calls[1]
  expect(route).toBe('/api/ledger/jobs/job-1/material-stock-site-issues/issue-1/receipts/receipt-1/reviews')
  expect(JSON.parse(options.body)).toMatchObject({ acceptedQuantity: 1.5, damagedQuantity: 0.5,
    expectedPendingInspectionQuantity: 2, reviewReference: 'QC-SITE-1', evidenceReference: 'photo:inspection-1' })
  expect(JSON.parse(options.body).entryKey).toBeTruthy()
  expect(await screen.findByText(/QC-SITE-1/)).toBeTruthy()
  expect(screen.getByText(/photo:inspection-1/)).toBeTruthy()
})

it('shows pending site inspections to read-only office viewers without exposing review controls', async () => {
  const pendingStock = { ...stock, siteIssues: [{ id: 'issue-1', jobId: 'job-1', jobTitle: 'Roof repair', materialName: 'Fastener box', unit: 'boxes', receipts: [{
    id: 'receipt-1', receiptReference: 'SITE-1', pendingInspectionQuantity: 2, location: 'Site store',
    receivedBy: 'Field worker', evidenceReference: 'photo:arrival-1', reviews: []
  }] }] }
  const request = vi.fn().mockResolvedValue(pendingStock)
  render(<SharedMaterialStockControl request={request} canCoordinate={false} submitting={false} t={translate} />)
  expect(await screen.findByText('Site receipts awaiting inspection')).toBeTruthy()
  expect(screen.getByText(/2 boxes/)).toBeTruthy()
  expect(screen.getByText('Office review is required before these units become available.')).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Save inspection decision' })).toBeNull()
})
