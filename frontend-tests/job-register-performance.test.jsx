import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import JobRegisterSearch from '../components/JobRegisterSearch'

const translate = (key, variables = {}) => Object.entries(variables)
  .reduce((text, [name, value]) => text.replaceAll(`{${name}}`, String(value)), key)
const pagination = { limit: 100, hasMore: false }
const rows = [{ id: 'one', title: 'Original job' }]
const showRows = jobs => <ul>{jobs.map(job => <li key={job.id}>{job.title}</li>)}</ul>

it('preserves typed search intent when a fresh first-page response arrives', () => {
  const api = vi.fn()
  const view = render(<JobRegisterSearch api={api} initialJobs={rows} initialPagination={pagination} t={translate}>{showRows}</JobRegisterSearch>)
  const input = screen.getByRole('searchbox', { name: 'Search jobs' })
  fireEvent.change(input, { target: { value: 'roof renovation' } })
  view.rerender(<JobRegisterSearch api={api} initialJobs={[{ id: 'two', title: 'Fresh job' }]} initialPagination={{ ...pagination }} t={translate}>{showRows}</JobRegisterSearch>)
  expect(input.value).toBe('roof renovation')
  expect(screen.getByText('Fresh job')).toBeTruthy()
  expect(api).not.toHaveBeenCalled()
})

it('does not redraw the job table on each unsubmitted search keystroke', () => {
  const renderRows = vi.fn(showRows)
  render(<JobRegisterSearch api={vi.fn()} initialJobs={rows} initialPagination={pagination} t={translate}>{renderRows}</JobRegisterSearch>)
  const initialRenders = renderRows.mock.calls.length
  const input = screen.getByRole('searchbox', { name: 'Search jobs' })
  for (const value of ['r', 'ro', 'roo', 'roof']) fireEvent.change(input, { target: { value } })
  expect(input.value).toBe('roof')
  expect(renderRows).toHaveBeenCalledTimes(initialRenders)
})

it('does not apply a late search result after its source is replaced', async () => {
  let resolve
  const api = vi.fn(() => new Promise(done => { resolve = done }))
  const view = render(<JobRegisterSearch api={api} initialJobs={rows} initialPagination={pagination} t={translate}>{showRows}</JobRegisterSearch>)
  fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'roof' } })
  fireEvent.submit(screen.getByRole('search'))
  view.rerender(<JobRegisterSearch api={api} initialJobs={[{ id: 'two', title: 'Fresh job' }]} initialPagination={{ ...pagination }} t={translate}>{showRows}</JobRegisterSearch>)
  await act(async () => resolve({ jobs: [{ id: 'old', title: 'Outdated result' }], pagination }))
  expect(screen.queryByText('Outdated result')).toBeNull()
  expect(screen.getByText('Fresh job')).toBeTruthy()
  expect(screen.getByRole('searchbox').value).toBe('roof')
  expect(api.mock.calls[0][1].signal.aborted).toBe(true)
})

it('updates the result renderer when parent locale or authority changes', () => {
  const view = render(<JobRegisterSearch api={vi.fn()} initialJobs={rows} initialPagination={pagination} t={translate}>{showRows}</JobRegisterSearch>)
  view.rerender(<JobRegisterSearch api={vi.fn()} initialJobs={rows} initialPagination={pagination} t={translate}>{() => <p>Updated permission view</p>}</JobRegisterSearch>)
  expect(screen.getByText('Updated permission view')).toBeTruthy()
  expect(screen.queryByText('Original job')).toBeNull()
})
