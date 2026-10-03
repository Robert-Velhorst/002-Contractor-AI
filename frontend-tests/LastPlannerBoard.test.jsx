import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import LastPlannerBoard from '../components/LastPlannerBoard'

const boardFor = weekStart => ({ week: { weekStart }, summary: {}, candidates: [], constraints: [], plans: [], commitments: [] })

it('preserves an edited week when the initial board arrives late', async () => {
  const onLoadWeek = vi.fn()
  const view = render(<LastPlannerBoard onLoadWeek={onLoadWeek} />)
  fireEvent.change(screen.getByLabelText('Week starts'), { target: { value: '2026-10-05' } })
  view.rerender(<LastPlannerBoard board={boardFor('2026-09-28')} onLoadWeek={onLoadWeek} />)
  expect(screen.getByLabelText('Week starts').value).toBe('2026-10-05')
  await userEvent.click(screen.getByRole('button', { name: 'Load week' }))
  expect(onLoadWeek).toHaveBeenCalledExactlyOnceWith('2026-10-05')
})

it('accepts the requested week but does not overwrite a newer edit with a late response', async () => {
  const onLoadWeek = vi.fn()
  const view = render(<LastPlannerBoard board={boardFor('2026-09-28')} onLoadWeek={onLoadWeek} />)
  fireEvent.change(screen.getByLabelText('Week starts'), { target: { value: '2026-10-05' } })
  await userEvent.click(screen.getByRole('button', { name: 'Load week' }))
  fireEvent.change(screen.getByLabelText('Week starts'), { target: { value: '2026-10-12' } })
  view.rerender(<LastPlannerBoard board={boardFor('2026-10-05')} onLoadWeek={onLoadWeek} />)
  expect(screen.getByLabelText('Week starts').value).toBe('2026-10-12')
  await userEvent.click(screen.getByRole('button', { name: 'Load week' }))
  view.rerender(<LastPlannerBoard board={boardFor('2026-10-12')} onLoadWeek={onLoadWeek} />)
  await waitFor(() => expect(screen.getByLabelText('Week starts').value).toBe('2026-10-12'))
  view.rerender(<LastPlannerBoard board={boardFor('2026-10-19')} onLoadWeek={onLoadWeek} />)
  await waitFor(() => expect(screen.getByLabelText('Week starts').value).toBe('2026-10-19'))
})

it('loads previous and next weeks from the displayed board rather than an unsaved edit', async () => {
  const onLoadWeek = vi.fn()
  render(<LastPlannerBoard board={boardFor('2026-10-05')} onLoadWeek={onLoadWeek} />)
  fireEvent.change(screen.getByLabelText('Week starts'), { target: { value: '2026-11-02' } })
  await userEvent.click(screen.getByRole('button', { name: 'Previous week' }))
  expect(onLoadWeek).toHaveBeenLastCalledWith('2026-09-28')
  await userEvent.click(screen.getByRole('button', { name: 'Next week' }))
  expect(onLoadWeek).toHaveBeenLastCalledWith('2026-10-12')
})
