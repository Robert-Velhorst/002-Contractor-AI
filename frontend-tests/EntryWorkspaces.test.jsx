import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import PortfolioScheduleWorkspace from '../components/PortfolioScheduleWorkspace'
import DispatchWorkspace from '../components/DispatchWorkspace'

it('joint planning uses the supplied company API and only requests approval after explicit review', async () => {
  const plan = { ready: true, tasks: [], heldTasks: [], travelRouteEvidence: [] }
  const api = vi.fn().mockResolvedValueOnce({ plan }).mockResolvedValueOnce({ approval: { id: 'approval-retained' } })
  const onOpenApprovals = vi.fn()
  const jobs = [{ id: 'a', title: 'Job A' }, { id: 'b', title: 'Job B' }]
  render(<PortfolioScheduleWorkspace api={api} jobs={jobs} canApprove onOpenApprovals={onOpenApprovals}
    schedule={{ window: { referenceAt: '2026-10-01T08:00:00Z' }, jobs: jobs.map(job => ({ jobId: job.id, jobTitle: job.title, flags: {}, tasks: [] })) }} />)
  expect(api).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('checkbox', { name: /Job A/ }))
  fireEvent.click(screen.getByRole('checkbox', { name: /Job B/ }))
  fireEvent.change(screen.getByLabelText('Shared planning start'), { target: { value: '2026-10-02T08:00' } })
  fireEvent.click(screen.getByRole('button', { name: 'Calculate joint plan' }))
  await screen.findByRole('button', { name: 'Request independent approval' })
  expect(api).toHaveBeenCalledTimes(1)
  expect(api.mock.calls[0][0]).toBe('/api/ledger/work-plan/portfolio/resource-preview')
  expect(api.mock.calls[0][1].method).toBe('POST')
  expect(JSON.parse(api.mock.calls[0][1].body)).toEqual({ jobIds: ['a', 'b'], plannedStart: new Date('2026-10-02T08:00').toISOString(), horizonDays: 21 })
  expect(onOpenApprovals).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Request independent approval' }))
  await waitFor(() => expect(onOpenApprovals).toHaveBeenCalledWith({ approvalId: 'approval-retained' }))
  expect(api).toHaveBeenCalledTimes(2)
  expect(api.mock.calls[1][0]).toBe('/api/ledger/work-plan/portfolio/resource-approval')
  expect(JSON.parse(api.mock.calls[1][1].body).plan).toEqual(plan)
})

it('dispatch retains source objects and separates read-only inspection from coordination commands', () => {
  const job = { id: 'job-retained', title: 'Retained job' }
  const item = { jobId: job.id, jobTitle: job.title, readinessStatus: 'blocked', blockers: [], nextActions: [], counts: {} }
  const onOpen = vi.fn(), onPrepare = vi.fn()
  const props = { jobs: [job], dispatch: { jobs: [item] }, onOpen, onPrepare }
  const view = render(<DispatchWorkspace {...props} />)
  expect(screen.queryByRole('button', { name: 'Prepare internal pack for Retained job' })).toBeNull()
  expect(onPrepare).not.toHaveBeenCalled()
  fireEvent.click(screen.getByRole('button', { name: 'Open Retained job' }))
  expect(onOpen).toHaveBeenCalledWith(job)
  view.rerender(<DispatchWorkspace {...props} canCoordinate />)
  fireEvent.click(screen.getByRole('button', { name: 'Prepare internal pack for Retained job' }))
  expect(onPrepare).toHaveBeenCalledWith(item)
  expect(onPrepare).toHaveBeenCalledTimes(1)
})
