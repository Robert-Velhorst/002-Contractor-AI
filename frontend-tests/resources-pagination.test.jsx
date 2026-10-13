import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it } from 'vitest'
import ResourcesWorkspace from '../components/ResourcesWorkspace'

it('paginates the crew directory and returns to the first page after searching', () => {
  const workers = Array.from({ length: 31 }, (_, index) => ({
    id: `worker-${index + 1}`,
    name: `Crew member ${String(index + 1).padStart(2, '0')}`,
    status: 'available',
    role: 'Carpenter',
    skills: [],
  }))

  render(
    <ResourcesWorkspace
      locale="en-GB"
      view="workforce"
      onViewChange={() => {}}
      workforce={{ jobs: [] }}
      inventory={{ jobs: [] }}
      workers={workers}
      jobs={[]}
    />,
  )

  fireEvent.click(screen.getByRole('tab', { name: 'Crew directory' }))
  const directory = screen.getByTestId('worker-directory')
  expect(within(directory).getAllByRole('article')).toHaveLength(25)
  expect(screen.getByText('Showing 1-25 of 31')).toBeTruthy()

  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(within(directory).getAllByRole('article')).toHaveLength(6)
  expect(within(directory).getByText('Crew member 31')).toBeTruthy()

  fireEvent.change(within(directory).getByRole('searchbox'), { target: { value: 'member 02' } })
  expect(within(directory).getAllByRole('article')).toHaveLength(1)
  expect(within(directory).getByText('Crew member 02')).toBeTruthy()
  expect(screen.queryByText('Showing 26-31 of 31')).toBeNull()
})

it('searches, sorts, and paginates material receipts', () => {
  const receipts = Array.from({ length: 31 }, (_, index) => ({
    id: `receipt-${index + 1}`,
    status: 'accepted',
    receiptReference: `GR-${String(index + 1).padStart(2, '0')}`,
    jobTitle: `Project ${index + 1}`,
    receivedBy: 'Site receiver',
    deliveredAt: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    lines: [],
    exceptions: [],
  }))

  render(
    <ResourcesWorkspace
      locale="nl-NL"
      view="receiving"
      onViewChange={() => {}}
      materialReceiving={{ summary: { total: 31 }, purchaseOrders: [], receipts }}
      jobs={[]}
    />,
  )

  const receiving = screen.getByTestId('material-receiving-workspace')
  expect(within(receiving).getAllByTestId(/^material-receipt-/)).toHaveLength(25)
  expect(within(receiving).getByText('Weergave 1-25 van 31')).toBeTruthy()
  expect(within(receiving).getByTestId('material-receipt-receipt-31').textContent).toContain('Project 31')

  fireEvent.change(within(receiving).getByRole('combobox', { name: 'Sorteren op datum' }), { target: { value: 'oldest' } })
  expect(within(receiving).getByTestId('material-receipt-receipt-1').textContent).toContain('Project 1')
  fireEvent.click(within(receiving).getByRole('button', { name: 'Volgende' }))
  expect(within(receiving).getByTestId('material-receipt-receipt-31').textContent).toContain('Project 31')

  fireEvent.change(within(receiving).getByRole('searchbox', { name: 'Materiaalontvangsten doorzoeken' }), { target: { value: 'GR-31' } })
  expect(within(receiving).getAllByTestId(/^material-receipt-/)).toHaveLength(1)
  expect(within(receiving).getByTestId('material-receipt-receipt-31').textContent).toContain('Project 31')
})

it('shows capped availability conflicts as incomplete and blocks portfolio replacement', () => {
  render(
    <ResourcesWorkspace
      locale="en-GB"
      view="workforce"
      onViewChange={() => {}}
      workforce={{ jobs: [] }}
      workers={[]}
      jobs={[]}
      availabilityRegister={{
        conflictListComplete: false,
        summary: { assignmentConflicts: 250 },
        periods: [{ id: 'absence-1', workerId: 'worker-1', workerName: 'Absent worker', workerRole: 'Carpenter',
          periodType: 'leave', periodLabel: 'Leave', phase: 'current', status: 'active', title: 'Unavailable',
          startsAt: '2030-01-02T09:00:00.000Z', endsAt: '2030-01-02T17:00:00.000Z' }],
        conflicts: ['job-a', 'job-b'].map((job, index) => ({ assignmentId: `assignment-${index + 1}`, jobId: job,
          jobTitle: job, scheduledStart: '2030-01-02T09:00:00.000Z', scheduledEnd: '2030-01-02T11:00:00.000Z',
          period: { id: 'absence-1' }, replacementCandidates: [{ worker: { id: `replacement-${index + 1}`, name: 'Replacement', role: 'Carpenter', status: 'available' }, matchedSkills: [], qualificationWarnings: [] }] })),
      }}
      canCoordinate
      onRequestAvailabilityReplacementPlan={() => {}}
    />,
  )

  fireEvent.click(screen.getByRole('tab', { name: 'Availability' }))
  expect(screen.getByText(/Only the first 250 availability conflicts are shown/)).toBeTruthy()
  expect(screen.getByText('250+')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Coordinate all 2 replacements' }).disabled).toBe(true)
})
