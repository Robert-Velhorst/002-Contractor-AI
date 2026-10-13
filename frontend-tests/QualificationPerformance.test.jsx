import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import ResourcesWorkspace from '../components/ResourcesWorkspace'

const empty = []
const base = { locale: 'en-GB', view: 'workforce', workers: empty, jobs: empty, canCoordinate: true, canApprove: true, onViewChange: vi.fn() }

function records(count = 101) {
  return Array.from({ length: count }, (_, index) => ({
    worker: { id: `qualified-${index}`, name: `Qualified ${String(index + 1).padStart(3, '0')}`, role: 'Installer', status: 'available' },
    qualification: { status: 'current', approved: true, credentials: [{ id: `credential-${index}`, status: 'approved', title: 'VCA', issuer: 'SSVV', credentialNumber: `proof-${index}` }] },
  }))
}

function open(props) {
  const view = render(<ResourcesWorkspace {...base} {...props} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Qualifications' }))
  const workspace = screen.getByTestId('qualification-workspace')
  return { view, workspace, section: within(workspace.querySelector('.qualification-worker-list')) }
}

it('bounds qualification rows, reaches the last record, and resets after search, status, and page-size changes', () => {
  const rows = records()
  rows[0].qualification.status = 'missing'
  const add = vi.fn()
  const { workspace, section } = open({ qualificationRegister: { workers: rows }, onAddCredential: add })
  expect(section.getAllByRole('article')).toHaveLength(25)
  fireEvent.change(section.getByRole('combobox', { name: 'Rows per page' }), { target: { value: '50' } })
  expect(section.getAllByRole('article')).toHaveLength(50)
  fireEvent.click(section.getByRole('button', { name: 'Next' }))
  fireEvent.click(section.getByRole('button', { name: 'Next' }))
  expect(section.getAllByRole('article')).toHaveLength(1)
  expect(section.getByText('Qualified 101')).toBeTruthy()
  fireEvent.click(section.getByRole('button', { name: 'Add revision' }))
  expect(add).toHaveBeenCalledWith(rows[100].worker)
  fireEvent.change(within(workspace).getByRole('searchbox'), { target: { value: 'PROOF-50' } })
  expect(section.getByText('Qualified 051')).toBeTruthy()
  expect(section.queryByRole('navigation')).toBeNull()
  fireEvent.change(within(workspace).getByRole('searchbox'), { target: { value: '' } })
  fireEvent.click(section.getByRole('button', { name: 'Next' }))
  fireEvent.click(within(workspace).getByRole('tab', { name: 'Missing' }))
  expect(section.getByText('Qualified 001')).toBeTruthy()
  expect(section.queryAllByRole('article')).toHaveLength(1)
})

it('serializes 500 qualifications once during 45 keystrokes and reuses unchanged visible rows', () => {
  const rows = records(500)
  let searches = 0, renderedRows = 0
  const needle = 'a'.repeat(45)
  for (const row of rows) {
    Object.defineProperty(row.qualification.credentials[0], 'credentialNumber', { get() { searches++; return needle } })
    Object.defineProperty(row.qualification, 'approved', { get() { renderedRows++; return true } })
  }
  const { workspace, section } = open({ qualificationRegister: { workers: rows } })
  expect(searches).toBe(0)
  expect(renderedRows).toBe(25)
  for (let index = 1; index <= needle.length; index++) {
    fireEvent.change(within(workspace).getByRole('searchbox'), { target: { value: needle.slice(0, index) } })
  }
  expect(section.getAllByRole('article')).toHaveLength(25)
  expect(searches).toBe(500)
  expect(renderedRows).toBe(25)
  fireEvent.change(within(workspace).getByRole('searchbox'), { target: { value: '' } })
  fireEvent.change(within(workspace).getByRole('searchbox'), { target: { value: needle } })
  expect(searches).toBe(1000)
  expect(renderedRows).toBe(25)
})

it('keeps fallback worker rows stable during searching and rebuilds them after refreshed records', () => {
  let searches = 0
  const row = records(1)[0]
  Object.defineProperty(row.qualification.credentials[0], 'credentialNumber', { get() { searches++; return 'fallback-proof' } })
  const workers = [row.worker]
  workers[0].qualification = row.qualification
  const { view, workspace } = open({ workers })
  for (const value of ['f', 'fa', 'fal', 'fall']) fireEvent.change(within(workspace).getByRole('searchbox'), { target: { value } })
  expect(searches).toBe(1)
  const refreshed = [{ ...workers[0], name: 'Refreshed', qualification: { ...row.qualification, credentials: [{ id: 'new-proof', title: 'New proof', issuer: 'SSVV', status: 'approved', credentialNumber: 'fallback-new' }] } }]
  view.rerender(<ResourcesWorkspace {...base} workers={refreshed} />)
  expect(within(workspace).getByText('Refreshed')).toBeTruthy()
  expect(within(workspace).getByText('New proof')).toBeTruthy()
  expect(within(workspace).queryByText('Qualified 001')).toBeNull()
})

it('does not retain stale credentials, callbacks, permissions, submitting state, or locale in memoized rows', () => {
  const rows = records(1)
  rows[0].qualification.credentials.push({ id: 'pending', title: 'Revision', status: 'pending_approval', approvalId: 'approval-one' })
  const register = { workers: rows }
  const first = vi.fn(), second = vi.fn(), approvals = vi.fn()
  const { view, section } = open({ qualificationRegister: register, onAddCredential: first, onOpenApprovals: approvals })
  fireEvent.click(section.getByRole('button', { name: 'Review' }))
  expect(approvals).toHaveBeenCalledWith({ approvalId: 'approval-one' })
  view.rerender(<ResourcesWorkspace {...base} qualificationRegister={register} onAddCredential={second} submitting />)
  expect(section.getByRole('button', { name: 'Add revision' }).disabled).toBe(true)
  view.rerender(<ResourcesWorkspace {...base} qualificationRegister={register} onAddCredential={second} />)
  fireEvent.click(section.getByRole('button', { name: 'Add revision' }))
  expect(first).not.toHaveBeenCalled()
  expect(second).toHaveBeenCalledWith(rows[0].worker)
  view.rerender(<ResourcesWorkspace {...base} qualificationRegister={register} canApprove={false} canCoordinate={false} />)
  expect(section.queryByRole('button', { name: 'Review' })).toBeNull()
  expect(section.queryByRole('button', { name: 'Add revision' })).toBeNull()
  view.rerender(<ResourcesWorkspace {...base} locale="nl-NL" qualificationRegister={register} onAddCredential={second} />)
  expect(section.queryByRole('button', { name: 'Add revision' })).toBeNull()
  expect(section.getByRole('button', { name: 'Herziening toevoegen' })).toBeTruthy()
  const refreshed = records(1)
  refreshed[0].qualification.credentials[0].title = 'Refreshed proof'
  view.rerender(<ResourcesWorkspace {...base} qualificationRegister={{ workers: refreshed }} />)
  expect(section.getByText('Refreshed proof')).toBeTruthy()
  expect(section.queryByText('Revision')).toBeNull()
})

it('clamps shrunk pages, does not resurrect an old page, and handles empty results', () => {
  const rows = records(51)
  const { view, section, workspace } = open({ qualificationRegister: { workers: rows } })
  fireEvent.click(section.getByRole('button', { name: 'Next' }))
  fireEvent.click(section.getByRole('button', { name: 'Next' }))
  expect(section.getByText('Qualified 051')).toBeTruthy()
  view.rerender(<ResourcesWorkspace {...base} qualificationRegister={{ workers: rows.slice(0, 2) }} />)
  expect(section.getAllByRole('article')).toHaveLength(2)
  expect(section.getByText('Qualified 001')).toBeTruthy()
  view.rerender(<ResourcesWorkspace {...base} qualificationRegister={{ workers: rows }} />)
  expect(section.getByText('Showing 1-25 of 51')).toBeTruthy()
  fireEvent.change(within(workspace).getByRole('searchbox'), { target: { value: 'not-a-retained-proof' } })
  expect(section.queryAllByRole('article')).toHaveLength(0)
  expect(section.getByText('No matching qualification records')).toBeTruthy()
  expect(section.queryByRole('combobox')).toBeNull()
})

it('reuses the availability search index while preserving current and cancellation filters', () => {
  let searches = 0
  const stringify = JSON.stringify
  const serialization = vi.spyOn(JSON, 'stringify').mockImplementation((value, ...args) => {
    if (value?.workerName?.startsWith('Worker ') && value.periodType === 'Leave') searches++
    return stringify(value, ...args)
  })
  const periods = Array.from({ length: 500 }, (_, index) => ({
    id: `absence-${index}`, workerName: `Worker ${index}`, workerRole: 'Installer', title: 'Leave', periodLabel: 'Leave',
    phase: index === 0 ? 'current' : 'upcoming', status: index === 0 ? 'pending_cancellation' : 'active',
    data: { operationalNotes: 'a'.repeat(45) },
  }))
  render(<ResourcesWorkspace {...base} availabilityRegister={{ periods, conflicts: empty, conflictListComplete: true }} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Availability' }))
  const workspace = screen.getByTestId('availability-workspace')
  expect(searches).toBe(0)
  for (let index = 1; index <= 45; index++) fireEvent.change(within(workspace).getByRole('searchbox'), { target: { value: 'a'.repeat(index) } })
  expect(searches).toBe(500)
  fireEvent.click(within(workspace).getByRole('tab', { name: 'Current' }))
  expect(within(workspace).getByText('Worker 0', { exact: true })).toBeTruthy()
  expect(within(workspace).queryByText('Worker 1', { exact: true })).toBeNull()
  fireEvent.click(within(workspace).getByRole('tab', { name: 'Pending' }))
  expect(within(workspace).getByText('Worker 0', { exact: true })).toBeTruthy()
  expect(searches).toBe(500)
  serialization.mockRestore()
})
