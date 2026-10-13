import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SupplierPerformanceControl from '../components/SupplierPerformanceControl'
import { operatorText } from '../operator-locale'

describe('SupplierPerformanceControl', () => {
  it('shows the retained evidence denominator and keeps missing requested dates out of punctuality', async () => {
    const request = vi.fn().mockResolvedValue({ suppliers: [{ supplierId: 'supplier-1', name: 'Dakmaterialen BV', orderCount: 4,
      receivedOrders: 4, completeOrders: 3, ratedOrders: 2, onTimeCompleteOrders: 1, completedWithoutRequiredDate: 1,
      damagedOrders: 1, openShortageOrders: 1, onTimeCompleteRatePercent: 50 }] })
    render(<SupplierPerformanceControl request={request} locale="nl-NL" t={(text, values = {}) => operatorText('nl-NL', text, values)} />)
    expect(await screen.findByText('Dakmaterialen BV')).toBeTruthy()
    expect(screen.getByText('50% · 1/2')).toBeTruthy()
    expect(screen.getByText('1 compleet ontvangen bestelling(en) hadden geen gevraagde datum en tellen niet mee voor tijdigheid.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Leveranciersprestaties vernieuwen' }))
    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
  })

  it('keeps API failures visible instead of presenting an empty scorecard', async () => {
    render(<SupplierPerformanceControl request={vi.fn().mockRejectedValue(new Error('Alleen kantoor.'))} />)
    expect((await screen.findByRole('alert')).textContent).toContain('Alleen kantoor.')
  })

  it('shows a historical delivery-date risk and opens the linked project', async () => {
    const onOpenJob = vi.fn()
    const request = vi.fn().mockResolvedValue({ suppliers: [{ supplierId: 'supplier-risk', name: 'Gevelbouw BV', orderCount: 4,
      receivedOrders: 3, completeOrders: 3, ratedOrders: 3, onTimeCompleteOrders: 2, completedWithoutRequiredDate: 0,
      damagedOrders: 0, openShortageOrders: 1, awaitingReceiptOrders: 1, onTimeCompleteRatePercent: 67,
      historicalLeadTimeP75Days: 8, leadTimeSampleSize: 3, leadTimeRiskCount: 1,
      leadTimeRisks: [{ purchaseOrderId: 'po-late', jobId: 'job-late', status: 'historical_lead_time_exceeds_required_date',
        requiredBy: '2030-06-07T00:00:00.000Z', historicalP75EquivalentCompletionAt: '2030-06-09T00:00:00.000Z', historicalLeadTimeDays: 8, sampleSize: 3 }] }] })
    render(<SupplierPerformanceControl request={request} locale="en-GB" onOpenJob={onOpenJob} />)
    expect(await screen.findByText('Historical P75 lead time')).toBeTruthy()
    expect(screen.getByText(/Delivery-date risk: po-late/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open project' }))
    expect(onOpenJob).toHaveBeenCalledWith({ id: 'job-late' })
  })
})
