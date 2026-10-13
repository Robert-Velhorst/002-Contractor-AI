import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import BidDecisionControl from '../components/BidDecisionControl'

const opportunity = {
  opportunity: { id: 'opportunity-1', title: 'Panel installation', stage: 'new', client: { name: 'Client' }, service: 'Installation' },
  evaluation: {
    recommendation: 'review',
    criteria: [
      { key: 'market_fit', label: 'Market fit', source: 'market_fit', status: 'match', awardedWeight: 35 },
      { key: 'delivery', label: 'Delivery capability', source: 'operator', weight: 20, minimumRating: 2 },
    ],
    gates: [{ key: 'scope', label: 'Scope understood', status: 'yes' }],
    marketFit: { current: true, score: 80 },
    capacityAssessment: {
      configured: true,
      status: 'shortfall',
      window: { start: '2030-01-07', end: '2030-01-07' },
      trades: [{
        role: 'Site Supervisor', demandKind: 'supervision', requiredHours: 16, knownRemainingHours: 8,
        supervisionFor: [{ crewRole: 'Installer', crewSize: 8, workersPerSupervisor: 4, supervisorsRequired: 2, requiredHours: 16 }],
        dailyDemandAssessment: [{ date: '2030-01-07', requiredHours: 16, knownAvailableHours: 8, observedShortfall: true }],
      }],
      gaps: [],
      scopeLimits: ['supervision_is_an_estimated_distinct_role'],
    },
    materialReadiness: { configured: false },
  },
}

it('shows derived supervision demand and its limits in the pursuit review', async () => {
  render(<BidDecisionControl
    locale="en-GB"
    canCoordinate
    bidDecisions={{
      policy: { activePolicy: { policyName: 'Pursuit policy', versionNumber: 1, snapshot: { policy: { bidThreshold: 70, noBidThreshold: 45 }, criteria: [] } } },
      opportunities: [opportunity],
      criteria: [],
    }}
    onRequestDecision={vi.fn()}
  />)

  await userEvent.click(screen.getByRole('button', { name: 'Score pursuit' }))

  const capacity = screen.getByTestId('bid-capacity-check')
  expect(capacity.textContent).toContain('Site Supervisor')
  expect(capacity.textContent).toContain('Installer: 8 workers / 4 per supervisor / 2 supervisors / 16 h')
  expect(capacity.textContent).toContain('legal supervision rules are not checked')
  expect(capacity.textContent).toContain('does not reserve or assign workers')
})
