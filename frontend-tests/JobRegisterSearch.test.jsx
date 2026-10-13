import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import JobRegisterSearch from '../components/JobRegisterSearch'

const t = (key, variables = {}) => Object.entries(variables).reduce(
  (value, [name, item]) => value.replaceAll(`{${name}}`, String(item)),
  key,
)
const initialJobs = [{ id: 'job-current', title: 'Current job' }]
const initialPagination = { limit: 100, hasMore: true, nextCursor: { updatedAt: '2026-09-01T00:00:00.000Z', jobId: 'job-current' } }
const jobRows = jobs => <ul>{jobs.map(job => <li key={job.id}>{job.title}</li>)}</ul>

it('searches the server and pages forward and backward through older matches', async () => {
  const api = vi.fn()
    .mockResolvedValueOnce({
      jobs: [{ id: 'job-match-1', title: 'Roof repair' }],
      pagination: { limit: 100, hasMore: true, nextCursor: { updatedAt: '2026-08-01T00:00:00.000Z', jobId: 'job-match-1' } },
    })
    .mockResolvedValueOnce({ jobs: [{ id: 'job-match-2', title: 'Roof repair phase two' }], pagination: { limit: 100, hasMore: false, nextCursor: null } })
    .mockResolvedValueOnce({
      jobs: [{ id: 'job-match-1', title: 'Roof repair' }],
      pagination: { limit: 100, hasMore: true, nextCursor: { updatedAt: '2026-08-01T00:00:00.000Z', jobId: 'job-match-1' } },
    })
  render(<JobRegisterSearch api={api} initialJobs={initialJobs} initialPagination={initialPagination} t={t}>{jobRows}</JobRegisterSearch>)

  await userEvent.type(screen.getByRole('searchbox', { name: 'Search jobs' }), 'roof & gutter')
  await userEvent.click(screen.getByRole('button', { name: 'Search jobs' }))
  await waitFor(() => expect(api).toHaveBeenCalledWith('/api/ledger/jobs?limit=100&search=roof+%26+gutter', { signal: expect.any(AbortSignal) }))
  expect(api.mock.calls[0][1].signal.aborted).toBe(false)
  expect(screen.getByText('Roof repair')).not.toBeNull()
  expect(screen.getByRole('status').textContent).toContain('Search page 1: 1 results.')

  await userEvent.click(screen.getByRole('button', { name: 'Next page' }))
  await waitFor(() => expect(api).toHaveBeenLastCalledWith('/api/ledger/jobs?limit=100&search=roof+%26+gutter&afterUpdatedAt=2026-08-01T00%3A00%3A00.000Z&afterJobId=job-match-1', { signal: expect.any(AbortSignal) }))
  expect(api.mock.calls[0][1].signal.aborted).toBe(true)
  expect(api.mock.calls[1][1].signal.aborted).toBe(false)
  expect(screen.getByText('Roof repair phase two')).not.toBeNull()
  expect(screen.getByRole('status').textContent).toContain('Search page 2: 1 results.')

  await userEvent.click(screen.getByRole('button', { name: 'Previous page' }))
  await waitFor(() => expect(api).toHaveBeenLastCalledWith('/api/ledger/jobs?limit=100&search=roof+%26+gutter', { signal: expect.any(AbortSignal) }))
  expect(api).toHaveBeenCalledTimes(3)
  expect(api.mock.calls[1][1].signal.aborted).toBe(true)
  expect(api.mock.calls[2][1].signal.aborted).toBe(false)
  expect(screen.getByText('Roof repair')).not.toBeNull()
})

it('announces an empty search and restores the latest local page when cleared', async () => {
  const api = vi.fn().mockResolvedValue({ jobs: [], pagination: { limit: 100, hasMore: false, nextCursor: null } })
  render(<JobRegisterSearch api={api} initialJobs={initialJobs} initialPagination={initialPagination} t={t}>{jobRows}</JobRegisterSearch>)

  await userEvent.type(screen.getByRole('searchbox', { name: 'Search jobs' }), 'missing')
  await userEvent.click(screen.getByRole('button', { name: 'Search jobs' }))
  expect((await screen.findByRole('status')).textContent).toContain('No jobs match this search.')
  expect(screen.queryByText('Current job')).toBeNull()

  await userEvent.click(screen.getByRole('button', { name: 'Clear search' }))
  expect(screen.getByText('Current job')).not.toBeNull()
  expect(screen.getByRole('status').textContent).toContain('Page 1: 1 jobs.')
  expect(api).toHaveBeenCalledTimes(1)
})

it('reports search failures without dropping the existing list', async () => {
  const api = vi.fn().mockRejectedValue(new Error('private provider detail'))
  render(<JobRegisterSearch api={api} initialJobs={initialJobs} initialPagination={initialPagination} t={t}>{jobRows}</JobRegisterSearch>)

  await userEvent.type(screen.getByRole('searchbox', { name: 'Search jobs' }), 'roof')
  await userEvent.click(screen.getByRole('button', { name: 'Search jobs' }))
  expect((await screen.findByRole('alert')).textContent).toContain('Job search failed.')
  expect(screen.queryByText('private provider detail')).toBeNull()
  expect(screen.getByText('Current job')).not.toBeNull()
})
