import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import SupplierPerformanceSignal from '../components/SupplierPerformanceSignal'

const supplier = { id: 'TRADE-PARTNER-1' }
const text = (key, variables = {}) => Object.entries(variables).reduce((result, [name, value]) => result.replaceAll(`{${name}}`, String(value)), key)

describe('SupplierPerformanceSignal', () => {
  it('shows exact-ID history with denominator and unresolved evidence', () => {
    render(<SupplierPerformanceSignal supplier={supplier} locale="en-GB" text={text} state={{ status: 'ready', suppliers: [
      { supplierId: 'trade-partner-1', ratedOrders: 4, onTimeCompleteOrders: 3, orderCount: 7, openShortageOrders: 1, damagedOrders: 2,
        historicalLeadTimeP75Days: 6.5, leadTimeSampleSize: 5, leadTimeRiskCount: 2 },
      { supplierId: 'another-partner', ratedOrders: 20, onTimeCompleteOrders: 20, orderCount: 20, openShortageOrders: 0, damagedOrders: 0 },
    ] }} />)
    expect(screen.getByTestId('supplier-history-signal').textContent).toContain('75% (3/4 rated; 7 orders)')
    expect(screen.getByTestId('supplier-history-signal').textContent).toContain('open short deliveries: 1')
    expect(screen.getByTestId('supplier-history-signal').textContent).toContain('orders with damage: 2')
    expect(screen.getByTestId('supplier-history-signal').textContent).toContain('Historical P75 complete lead time: 6.5 days (5 completed issued orders)')
    expect(screen.getByTestId('supplier-history-signal').textContent).toContain('Open orders with historical lead-time risk: 2')
  })

  it('does not infer punctuality when completed orders lack date evidence', () => {
    render(<SupplierPerformanceSignal supplier={supplier} locale="en-GB" text={text} state={{ status: 'ready', suppliers: [
      { supplierId: 'trade-partner-1', ratedOrders: 0, onTimeCompleteOrders: 0, orderCount: 2, openShortageOrders: 0, damagedOrders: 0 },
    ] }} />)
    expect(screen.getByTestId('supplier-history-signal').textContent).toContain('No dated complete orders (0/0 rated; 2 orders)')
  })

  it('does not match a supplier name to an unrelated partner identity', () => {
    render(<SupplierPerformanceSignal supplier={{ id: 'trade-partner-1', name: 'Exact Match Ltd' }} locale="en-GB" text={text} state={{ status: 'ready', suppliers: [
      { supplierId: 'Exact Match Ltd', ratedOrders: 8, onTimeCompleteOrders: 8, orderCount: 8, openShortageOrders: 0, damagedOrders: 0 },
    ] }} />)
    expect(screen.getByTestId('supplier-history-none').textContent).toContain('no reliability rate is inferred')
  })

  it('keeps loading and API failure states non-blocking', () => {
    const { rerender } = render(<SupplierPerformanceSignal supplier={supplier} locale="en-GB" text={text} state={{ status: 'loading', suppliers: [] }} />)
    expect(screen.getByRole('status').textContent).toBe('Loading supplier history')
    rerender(<SupplierPerformanceSignal supplier={supplier} locale="en-GB" text={text} state={{ status: 'error', suppliers: [] }} />)
    expect(screen.getByRole('status').textContent).toContain('Supplier history unavailable')
  })
})
