import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import CashFlowForecastControl from '../components/CashFlowForecastControl'

const forecast = (overrides = {}) => ({ asOfDate: '2026-10-01', openingBalance: 0, currency: 'EUR', weeks: [], items: [], summary: {}, ready: true, ...overrides })
const props = () => ({ cashFlow: forecast(), request: vi.fn(), onChange: vi.fn(), canCoordinate: true })

it('shows a loading state instead of editable defaults and NaN totals before the first forecast arrives', () => {
  const current = props()
  const view = render(<CashFlowForecastControl {...current} cashFlow={undefined} />)
  expect(screen.queryByLabelText('Opening cash')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Recalculate' })).toBeNull()
  expect(screen.getByRole('status').textContent).toContain('Loading')
  expect(screen.getByTestId('cash-flow-control').textContent).not.toContain('NaN')
  expect(current.request).not.toHaveBeenCalled()
  view.rerender(<CashFlowForecastControl {...current} cashFlow={forecast({ openingBalance: 125 })} />)
  expect(screen.getByLabelText('Opening cash').value).toBe('125')
})

it('keeps edited opening cash when a background forecast arrives and recalculates the retained amount', async () => {
  const current = props(), { rerender } = render(<CashFlowForecastControl {...current} />)
  await userEvent.clear(screen.getByLabelText('Opening cash'))
  await userEvent.type(screen.getByLabelText('Opening cash'), '2500')
  rerender(<CashFlowForecastControl {...current} cashFlow={forecast({ openingBalance: 100 })} />)
  expect(screen.getByLabelText('Opening cash').value).toBe('2500')
  const response = forecast({ openingBalance: 2500 })
  current.request.mockResolvedValue({ cashFlow: response })
  await userEvent.click(screen.getByRole('button', { name: 'Recalculate' }))
  await waitFor(() => expect(current.onChange).toHaveBeenCalledWith(response))
  expect(new URL(current.request.mock.calls[0][0], 'http://localhost').searchParams.get('openingBalance')).toBe('2500')
})

it('keeps an edited date independent of unedited opening cash and blocks approval of mismatched displayed inputs', async () => {
  const current = props(), { rerender } = render(<CashFlowForecastControl {...current} />)
  await userEvent.clear(screen.getByLabelText('As of'))
  await userEvent.type(screen.getByLabelText('As of'), '2026-10-12')
  rerender(<CashFlowForecastControl {...current} cashFlow={forecast({ openingBalance: 100 })} />)
  expect(screen.getByLabelText('As of').value).toBe('2026-10-12')
  expect(screen.getByLabelText('Opening cash').value).toBe('100')
  expect(screen.getByRole('button', { name: 'Request approval' }).matches(':disabled')).toBe(true)
})

it('does not publish a late recalculation after the operator edits its inputs again', async () => {
  let complete
  const current = props()
  current.request.mockImplementation(() => new Promise(resolve => { complete = resolve }))
  render(<CashFlowForecastControl {...current} />)
  await userEvent.click(screen.getByRole('button', { name: 'Recalculate' }))
  await userEvent.clear(screen.getByLabelText('Opening cash'))
  await userEvent.type(screen.getByLabelText('Opening cash'), '1800')
  await act(async () => complete({ cashFlow: forecast() }))
  expect(current.onChange).not.toHaveBeenCalled()
  expect(screen.getByLabelText('Opening cash').value).toBe('1800')
})

it('refreshes untouched filters but never submits an empty amount or a forecast after unmount', async () => {
  let complete
  const current = props(), { rerender, unmount } = render(<CashFlowForecastControl {...current} />)
  rerender(<CashFlowForecastControl {...current} cashFlow={forecast({ asOfDate: '2026-10-08', openingBalance: 75 })} />)
  expect(screen.getByLabelText('As of').value).toBe('2026-10-08')
  expect(screen.getByLabelText('Opening cash').value).toBe('75')
  await userEvent.clear(screen.getByLabelText('Opening cash'))
  expect(screen.getByRole('button', { name: 'Recalculate' }).matches(':disabled')).toBe(true)
  expect(screen.getByRole('button', { name: 'Request approval' }).matches(':disabled')).toBe(true)
  await userEvent.type(screen.getByLabelText('Opening cash'), '75')
  current.request.mockImplementation(() => new Promise(resolve => { complete = resolve }))
  await userEvent.click(screen.getByRole('button', { name: 'Recalculate' }))
  unmount()
  await act(async () => complete({ cashFlow: forecast({ asOfDate: '2026-10-08', openingBalance: 75 }) }))
  expect(current.onChange).not.toHaveBeenCalled()
})

it('explains mismatched forecast inputs in Dutch without granting approval', async () => {
  const current = props()
  render(<CashFlowForecastControl {...current} locale="nl-NL" />)
  await userEvent.clear(screen.getByLabelText('Beginsaldo kas'))
  await userEvent.type(screen.getByLabelText('Beginsaldo kas'), '2500')
  expect(screen.getByText('De getoonde prognose gebruikt een andere peildatum of een ander beginsaldo.')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Goedkeuring aanvragen' }).matches(':disabled')).toBe(true)
  expect(current.request).not.toHaveBeenCalled()
})
