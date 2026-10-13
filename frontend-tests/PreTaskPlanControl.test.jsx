import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import PreTaskPlanControl from '../components/PreTaskPlanControl'

it('records a task-scoped JHA applicability decision from the office control', async () => {
  const user = userEvent.setup()
  let applicabilityStatus = 'unreviewed'
  const apiRequest = vi.fn().mockImplementation(async (url, options) => {
    if (url === '/api/ledger/jobs/job-1') return { job: {
      id: 'job-1', title: 'Safety job',
      tasks: [{ id: 'task-1', title: 'Install the stair flight', status: 'open', jhaApplicability: { status: applicabilityStatus } }],
      assignments: [], jhas: [], permits: [], sdsSheets: []
    } }
    if (url.endsWith('/pre-task-plans?limit=100')) return { preTaskPlans: [] }
    if (url.endsWith('/jha-applicability')) {
      const body = JSON.parse(options.body)
      applicabilityStatus = body.status
      return { replayed: false }
    }
    throw new Error(`Unexpected request: ${url}`)
  })
  const notify = vi.fn()
  const { container } = render(<PreTaskPlanControl
    jobs={[{ id: 'job-1', title: 'Safety job', status: 'active' }]}
    operator={{ name: 'Owner', role: 'owner' }}
    fieldScoped={false}
    canCoordinate
    apiRequest={apiRequest}
    recordFieldOperation={vi.fn()}
    notify={notify}
    refresh={vi.fn()}
    outboxScope="owner"
    refreshOutboxState={vi.fn()}
  />)

  await screen.findAllByText('Install the stair flight')
  await user.selectOptions(screen.getByLabelText('Assessment'), 'not_required')
  await user.type(screen.getByLabelText('Review rationale'), 'Simple access task; no additional task hazards identified.')
  await user.click(screen.getByRole('button', { name: 'Save task JHA review' }))

  await waitFor(() => expect(apiRequest).toHaveBeenCalledWith(
    '/api/ledger/jobs/job-1/tasks/task-1/jha-applicability',
    expect.objectContaining({ method: 'PATCH' })
  ))
  expect(notify).toHaveBeenCalledWith('Task JHA applicability review recorded in the audit trail.')
  await waitFor(() => expect(container.querySelector('.status-not_required')?.textContent).toBeTruthy())
})

it('keeps the not-required decision unavailable to an office operator', async () => {
  const apiRequest = vi.fn().mockImplementation(async url => url === '/api/ledger/jobs/job-1'
    ? { job: { id: 'job-1', title: 'Safety job', tasks: [{ id: 'task-1', title: 'Install the stair flight', status: 'open' }], assignments: [], jhas: [], permits: [], sdsSheets: [] } }
    : { preTaskPlans: [] })
  render(<PreTaskPlanControl
    jobs={[{ id: 'job-1', title: 'Safety job', status: 'active' }]}
    operator={{ name: 'Office', role: 'office_operator' }}
    canCoordinate
    apiRequest={apiRequest}
    recordFieldOperation={vi.fn()}
    notify={vi.fn()}
    refresh={vi.fn()}
    outboxScope="office"
    refreshOutboxState={vi.fn()}
  />)
  await screen.findByLabelText('Assessment')
  expect(screen.getByRole('option', { name: 'JHA not required (owner/approver)' }).disabled).toBe(true)
})

it('freezes task coverage from the selected task-linked JHA in the pre-task plan editor', async () => {
  const user = userEvent.setup()
  const apiRequest = vi.fn().mockImplementation(async url => url === '/api/ledger/jobs/job-1'
    ? { job: {
      id: 'job-1', title: 'Safety job',
      tasks: [{ id: 'task-1', title: 'Fit the frame', status: 'open' }, { id: 'task-2', title: 'Install trim', status: 'open' }],
      assignments: [],
      jhas: [{ id: 'jha-1', title: 'Frame JHA', status: 'approved', linkedTaskIds: ['task-1', 'task-2'] }],
      permits: [], sdsSheets: []
    } }
    : { preTaskPlans: [] })
  render(<PreTaskPlanControl
    jobs={[{ id: 'job-1', title: 'Safety job', status: 'active' }]}
    operator={{ name: 'Owner', role: 'owner' }}
    canCoordinate
    apiRequest={apiRequest}
    recordFieldOperation={vi.fn()}
    notify={vi.fn()}
    refresh={vi.fn()}
    outboxScope="owner"
    refreshOutboxState={vi.fn()}
  />)

  await screen.findByRole('option', { name: /Frame JHA/ })
  await user.selectOptions(screen.getByLabelText('Approved JHA'), 'jha-1')
  expect(screen.getByLabelText('Fit the frame').checked).toBe(true)
  expect(screen.getByLabelText('Install trim').checked).toBe(true)
  await user.click(screen.getByLabelText('Install trim'))
  expect(screen.getByLabelText('Fit the frame').checked).toBe(true)
  expect(screen.getByLabelText('Install trim').checked).toBe(false)
})
