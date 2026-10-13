import { expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import ResourcesWorkspace from '../components/ResourcesWorkspace'

it('shows receipt shortfall and affected work in the operator receiving view', () => {
  render(
    <ResourcesWorkspace
      locale="nl-NL"
      view="receiving"
      onViewChange={() => {}}
      materialReceiving={{
        summary: { total: 1, discrepancies: 1, openOrders: 1, acceptedQuantity: 6 },
        purchaseOrders: [],
        receipts: [{
          id: 'receipt-short', status: 'discrepancy', receiptReference: 'GR-SHORT-1', jobTitle: 'Roof repair',
          receivedBy: 'Site receiver', deliveredAt: '2026-09-24T08:00:00.000Z',
          lines: [{ itemName: 'Roof membrane', acceptedQuantity: 6, unit: 'rolls' }],
          exceptions: [{ message: 'The final delivery was short.' }],
          operationalImpact: {
            materialLines: [{
              materialRequirementId: 'material-roof', itemName: 'Roof membrane', unit: 'rolls', shortfallQuantity: 4,
              affectedTasks: [{ taskId: 'task-install', title: 'Install roof membrane' }]
            }],
            schedule: { status: 'blocked' }
          }
        }],
        actions: []
      }}
    />
  )

  const impact = screen.getByText(/Roof membrane: 4 rolls tekort/)
  expect(impact.textContent).toContain('Roof membrane: 4 rolls tekort')
  expect(impact.textContent).toContain('(Install roof membrane)')
  expect(impact.textContent).toContain('Geblokkeerd')
})
