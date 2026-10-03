import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import ContractorWorkbench from '../components/ContractorWorkbench'

const action = { id: 'cmd-1', jobId: 'job-1', jobTitle: 'Roof repair', stream: 'finance', actionType: 'draft_invoice', message: 'Prepare invoice draft', safeDraftable: true }
const plan = {
  actions: [action], summary: { total: 41, streams: { finance: 41 } },
  matchingSummary: { highPriority: 2, runnableDrafts: 4, approvalRequired: 3, blocked: 1 },
  pagination: { offset: 0, limit: 20, returned: 1, matching: 41, hasMore: true },
  scope: { consideredJobs: 12, eligibleJobs: 30 },
}
function props(overrides = {}) {
  return { api: vi.fn().mockResolvedValue(plan), locale: 'en-GB', onOpenAction: vi.fn(), onChanged: vi.fn(), ...overrides }
}

it('loads real work, combines server-side filters and navigates to its source', async () => {
  const p = props()
  render(<ContractorWorkbench {...p} />)
  await screen.findByText(action.message)
  await userEvent.selectOptions(screen.getByLabelText('Work area'), 'finance')
  await userEvent.selectOptions(screen.getByLabelText('Decision'), 'approval')
  await userEvent.type(screen.getByRole('searchbox', { name: 'Search work' }), 'roof')
  await userEvent.click(screen.getByRole('button', { name: 'Search work', exact: true }))
  await waitFor(() => expect(p.api.mock.calls.at(-1)[0]).toContain('search=roof'))
  expect(p.api.mock.calls.at(-1)[0]).toContain('stream=finance')
  expect(p.api.mock.calls.at(-1)[0]).toContain('mode=approval')
  await userEvent.click(screen.getByRole('button', { name: 'Open Roof repair' }))
  expect(p.onOpenAction).toHaveBeenCalledWith(action)
  expect(screen.queryByRole('button', { name: 'Prepare internal draft' })).toBeNull()
})

it('routes a returned client variation to its job without offering autonomous draft creation', async () => {
  const returnedVariation = {
    id: 'cmd-returned-variation',
    actionType: 'prepare_client_variation_revision',
    jobId: 'job-client-returned',
    jobTitle: 'Bathroom refurbishment',
    stream: 'client_success',
    message: 'The client requested changes to VAR-2026-000014 revision 1.',
    data: { changeOrderId: 'change-order-14', clientResponseApprovalId: 'approval-response-14' },
    safeDraftable: false,
    requiresApproval: false,
  }
  const p = props({ canAutomate: true, api: vi.fn().mockResolvedValue({ ...plan, actions: [returnedVariation] }) })
  render(<ContractorWorkbench {...p} />)

  await screen.findByText(returnedVariation.message)
  expect(screen.queryByRole('button', { name: 'Prepare internal draft' })).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Open Bathroom refurbishment' }))
  expect(p.onOpenAction).toHaveBeenCalledWith(returnedVariation)
})

it('pages beyond the first result set without treating a sample as a complete audit', async () => {
  const p = props()
  render(<ContractorWorkbench {...p} />)
  await screen.findByText(action.message)
  expect(screen.getByText(/12 of 30 dossiers/)).toBeTruthy()
  await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
  await waitFor(() => expect(p.api.mock.calls.at(-1)[0]).toContain('offset=20'))
})

it('prepares only the selected internal draft for an owner and refreshes after saving', async () => {
  const p = props({ canAutomate: true })
  p.api.mockImplementation(async (_url, options) => options?.method === 'POST'
    ? { summary: { applied: 1, skipped: 0 } } : plan)
  render(<ContractorWorkbench {...p} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Prepare internal draft' }))
  await screen.findByText('1 internal record(s) prepared; 0 skipped. No external commitments.')
  const post = p.api.mock.calls.find(([, options]) => options?.method === 'POST')
  expect(JSON.parse(post[1].body)).toEqual({ actionId: 'cmd-1', jobId: 'job-1', limit: 1, jobLimit: 12 })
  expect(p.onChanged).toHaveBeenCalledTimes(1)
})

it('records a missing-check-in absence only after office confirmation and uses the current source hash', async () => {
  const missingCheckin = {
    id: 'cmd-missing-checkin', jobId: 'job-crew', jobTitle: 'Roof repair', stream: 'workforce',
    actionType: 'review_daily_cycle', message: 'No site check-in is recorded.', safeDraftable: false,
    data: { actionKind: 'worker_checkin_missing', assignmentId: 'assignment-crew', sourceHash: 'a'.repeat(64) },
  }
  const p = props({ canResolveAttendance: true, api: vi.fn().mockImplementation(async (_url, options) => options?.method === 'POST'
    ? { replayed: false } : { ...plan, actions: [missingCheckin] }) })
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
  render(<ContractorWorkbench {...p} />)

  await userEvent.click(await screen.findByRole('button', { name: 'Confirm verified unavailability' }))
  await screen.findByText(/Verified unavailability recorded for this shift/)
  expect(confirm).toHaveBeenCalledOnce()
  const [url, options] = p.api.mock.calls.find(([, request]) => request?.method === 'POST')
  expect(url).toBe('/api/ledger/jobs/job-crew/assignments/assignment-crew/confirm-missing-checkin-unavailable')
  expect(JSON.parse(options.body)).toEqual({ sourceHash: 'a'.repeat(64) })
  expect(p.onChanged).toHaveBeenCalledOnce()
  confirm.mockRestore()
})

it('keeps blocked work and suspended automation out of the draft action', async () => {
  const p = props({ canAutomate: true, api: vi.fn().mockResolvedValue({ ...plan, automationSuspended: true }) })
  render(<ContractorWorkbench {...p} />)
  expect((await screen.findByRole('button', { name: 'Prepare internal draft' })).disabled).toBe(true)
})

it('shows an error with retry instead of a false empty queue', async () => {
  const p = props()
  p.api.mockRejectedValueOnce(new Error('Connection unavailable'))
  render(<ContractorWorkbench {...p} />)
  await screen.findByRole('alert')
  expect(screen.queryByText('No matching work')).toBeNull()
  await userEvent.click(screen.getByRole('button', { name: 'Retry' }))
  await screen.findByText(action.message)
})

it('ignores late responses from an older filter request', async () => {
  let finishOld
  const p = props()
  p.api.mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve }))
  render(<ContractorWorkbench {...p} />)
  await userEvent.selectOptions(screen.getByLabelText('Work area'), 'finance')
  await screen.findByText(action.message)
  await act(async () => finishOld({ ...plan, actions: [{ ...action, message: 'Stale result' }] }))
  expect(screen.queryByText('Stale result')).toBeNull()
})
