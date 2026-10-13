import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import DrawingRegisterControl from '../components/DrawingRegisterControl'
import { draftStorageKey, writeSessionDraft } from '../draft-recovery'

afterEach(() => {
  cleanup()
  window.sessionStorage.clear()
})

function renderRegister(draftScope) {
  const apiRequest = vi.fn(async route => (
    route.endsWith('/drawings?limit=250')
      ? { drawings: [] }
      : { job: {
        documents: [{ id: 'pdf-roof', mimeType: 'application/pdf', status: 'stored', filename: 'Roof plan.pdf', data: { analysis: { upload: { sha256: 'a'.repeat(64) } } } }],
        tasks: [{ id: 'task-roof', title: 'Roofing' }],
      } }
  ))
  return render(
    <DrawingRegisterControl
      jobs={[{ id: 'job-roof', title: 'Roof project', status: 'active' }]}
      fieldScoped={false}
      canCoordinate
      apiRequest={apiRequest}
      notify={vi.fn()}
      refresh={vi.fn()}
      onOpenApprovals={vi.fn()}
      draftScope={draftScope}
    />,
  )
}

it('restores drawing revision metadata only in its operator session and job', async () => {
  const draft = {
    entryKey: 'revision-draft-1',
    supersedesDrawingId: 'drawing-current',
    sheetNumber: 'A-101',
    revision: 'C02',
    title: 'Updated roof plan',
    discipline: 'architecture',
    purpose: 'for_construction',
    issueDate: '2026-09-25',
    scale: '1:50',
    zone: 'Block A',
    sourceDocumentId: 'pdf-roof',
    linkedTaskIds: ['task-roof'],
    revisionReason: 'Roof opening dimensions were corrected.',
    reviewNotes: 'Verify the opening before installation.',
  }
  writeSessionDraft(window.sessionStorage, 'operator:session-a', 'drawing-revision:job-roof', draft)
  writeSessionDraft(window.sessionStorage, 'operator:session-b', 'drawing-revision:job-roof', { ...draft, title: 'Other operator draft' })

  renderRegister('operator:session-a')

  expect(await screen.findByDisplayValue('Updated roof plan')).toBeTruthy()
  expect(screen.getByDisplayValue('A-101')).toBeTruthy()
  expect(screen.getByDisplayValue('C02')).toBeTruthy()
  expect(screen.getByRole('checkbox', { name: 'Roofing' }).checked).toBe(true)
  expect(screen.getByRole('combobox', { name: 'Retained drawing PDF' }).value).toBe('')
  expect(screen.getByRole('status').textContent).toMatch(/PDF is not saved in the browser/i)
  expect(window.sessionStorage.getItem(draftStorageKey('operator:session-b', 'drawing-revision:job-roof'))).not.toBeNull()
  expect(document.body.textContent).not.toContain('Other operator draft')
})

it('does not restore drafts when recovery is disabled', async () => {
  writeSessionDraft(window.sessionStorage, 'operator:session-a', 'drawing-revision:job-roof', {
    title: 'Private unfinished title',
    linkedTaskIds: [],
  })

  renderRegister('')

  expect((await screen.findByRole('combobox', { name: 'Drawing job' })).value).toBe('job-roof')
  expect(screen.queryByDisplayValue('Private unfinished title')).toBeNull()
  expect(screen.queryByRole('status')).toBeNull()
})
