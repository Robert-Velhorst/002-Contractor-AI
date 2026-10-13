import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { ProductionControl } from '../components/JobWorkspaceControls'

it('links a production baseline line to a live job task', async () => {
  const onRequestBaseline = vi.fn(async () => true)
  render(
    <ProductionControl
      job={{ id: 'job-1', tasks: [{ id: 'task-1', title: 'Install floor finish', status: 'open' }], productionControl: {} }}
      locale="en"
      canCoordinate
      canReport={false}
      canApprove={false}
      submitting={false}
      outboxPending={0}
      outboxSyncing={false}
      onRequestBaseline={onRequestBaseline}
      onRecordEntry={vi.fn()}
      onRequestReversal={vi.fn()}
      onOpenApprovals={vi.fn()}
      onSyncOutbox={vi.fn()}
    />,
  )

  await userEvent.click(screen.getByRole('button', { name: 'Create baseline' }))
  await userEvent.clear(screen.getByLabelText('Line key'))
  await userEvent.type(screen.getByLabelText('Line key'), 'floor-finish')
  await userEvent.type(screen.getByLabelText('Description'), 'Install floor finish')
  await userEvent.selectOptions(screen.getByLabelText('Linked task'), 'task-1')
  await userEvent.type(screen.getByLabelText('Planned quantity'), '40')
  await userEvent.type(screen.getByLabelText('Labor hours'), '32')
  await userEvent.click(screen.getByRole('button', { name: 'Request baseline approval' }))

  expect(onRequestBaseline).toHaveBeenCalledWith(expect.objectContaining({
    lines: [expect.objectContaining({ taskId: 'task-1', lineKey: 'floor-finish', plannedQuantity: 40, plannedLaborHours: 32 })],
  }))
})
