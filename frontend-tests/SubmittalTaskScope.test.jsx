import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { ProjectControls } from '../components/JobWorkspaceControls'

it('submits explicit task links with a submittal and labels unlinked records as job-wide', async () => {
  const user = userEvent.setup()
  const onCreate = vi.fn(async () => true)
  render(
    <ProjectControls
      job={{
        id: 'job-1',
        tasks: [
          { id: 'task-frame', title: 'Install frame' },
          { id: 'task-finish', title: 'Apply finish' },
        ],
        documents: [{ id: 'document-spec', jobId: 'job-1', title: 'Window specification', filename: 'window-spec.pdf',
          mimeType: 'application/pdf', sizeBytes: 1024, storageRef: 'private/window-spec.pdf', status: 'stored', data: { contentHash: 'a'.repeat(64) } }],
        submittals: [{ id: 'legacy-submittal', title: 'General product schedule', status: 'approved', data: { taskIds: [] } }],
      }}
      locale="en"
      canCoordinate
      canApprove={false}
      submitting={false}
      onCreate={onCreate}
      onTransition={vi.fn()}
      onIssueTransmittal={vi.fn()}
      onAcknowledgeTransmittal={vi.fn()}
      onSubmitMeeting={vi.fn()}
      onIssueMeeting={vi.fn()}
      onCompleteMeetingAction={vi.fn()}
      onCreateMeetingFollowUp={vi.fn()}
      onOpenApprovals={vi.fn()}
    />,
  )

  await user.click(screen.getByRole('tab', { name: /Submittals/ }))
  expect(screen.getByText('Applies to the entire job')).toBeTruthy()
  await user.click(screen.getByRole('button', { name: /New submittal/ }))
  await user.type(screen.getByLabelText('Submittal title'), 'Frame installation data')
  await user.selectOptions(screen.getByLabelText(/Linked work steps/), ['task-frame'])
  await user.click(screen.getByRole('checkbox', { name: /window-spec\.pdf/ }))
  await user.click(screen.getByRole('button', { name: /Retain submittal/ }))

  expect(onCreate).toHaveBeenCalledWith('submittal', expect.objectContaining({
    title: 'Frame installation data',
    taskIds: ['task-frame'],
    attachmentDocumentIds: ['document-spec'],
  }))
})

it('offers only retained same-job verified PDFs for submittal attachments', async () => {
  const onCreate = vi.fn(async () => true)
  render(<ProjectControls
    job={{ id: 'job-1', tasks: [], documents: [
      { id: 'ok', jobId: 'job-1', filename: 'verified.pdf', mimeType: 'application/pdf', sizeBytes: 1024, storageRef: 'private/verified.pdf', data: { contentHash: 'b'.repeat(64) } },
      { id: 'foreign', jobId: 'job-2', filename: 'foreign.pdf', mimeType: 'application/pdf', sizeBytes: 1024, storageRef: 'private/foreign.pdf', data: { contentHash: 'c'.repeat(64) } },
      { id: 'unchecked', jobId: 'job-1', filename: 'unchecked.pdf', mimeType: 'application/pdf', sizeBytes: 1024, storageRef: 'private/unchecked.pdf', data: {} },
      { id: 'image', jobId: 'job-1', filename: 'photo.jpg', mimeType: 'image/jpeg', sizeBytes: 1024, storageRef: 'private/photo.jpg', data: { contentHash: 'd'.repeat(64) } },
    ] }}
    locale="en" canCoordinate canApprove={false} submitting={false} onCreate={onCreate}
    onTransition={vi.fn()} onIssueTransmittal={vi.fn()} onAcknowledgeTransmittal={vi.fn()}
    onSubmitMeeting={vi.fn()} onIssueMeeting={vi.fn()} onCompleteMeetingAction={vi.fn()}
    onCreateMeetingFollowUp={vi.fn()} onOpenApprovals={vi.fn()}
  />)
  await userEvent.click(screen.getByRole('tab', { name: /Submittals/ }))
  await userEvent.click(screen.getByRole('button', { name: /New submittal/ }))
  const section = screen.getByRole('group', { name: 'Retained PDF attachments' })
  expect(section.textContent).toContain('verified.pdf')
  expect(section.textContent).not.toContain('foreign.pdf')
  expect(section.textContent).not.toContain('unchecked.pdf')
  expect(section.textContent).not.toContain('photo.jpg')
})
