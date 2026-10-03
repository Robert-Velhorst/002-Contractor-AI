import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import ProductBoundary from '../components/ProductBoundary'

afterEach(() => vi.restoreAllMocks())

function BrokenProduct() {
  throw new Error('Private provider diagnostic must not appear in the interface')
}

it('keeps the working product mounted without a recovery prompt', () => {
  render(<ProductBoundary><label>Work note<input defaultValue="Retained draft" /></label></ProductBoundary>)
  expect(screen.getByRole('textbox', { name: 'Work note' }).value).toBe('Retained draft')
  expect(screen.queryByRole('alert')).toBeNull()
})

it('shows a safe error, retains browser storage and reloads only on request', async () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  const onReload = vi.fn()
  sessionStorage.setItem('boundary-retained-draft', 'Do not erase')
  render(<ProductBoundary locale="en-GB" onReload={onReload}><BrokenProduct /></ProductBoundary>)
  expect(screen.getByRole('alert')).toBeTruthy()
  expect(screen.getByRole('heading', { name: 'The workspace could not load' })).toBeTruthy()
  expect(screen.queryByText(/Private provider diagnostic/)).toBeNull()
  expect(sessionStorage.getItem('boundary-retained-draft')).toBe('Do not erase')
  expect(onReload).not.toHaveBeenCalled()
  await userEvent.click(screen.getByRole('button', { name: 'Reload workspace' }))
  expect(onReload).toHaveBeenCalledOnce()
})

it('provides the Dutch recovery state and warns about unsaved input', () => {
  vi.spyOn(console, 'error').mockImplementation(() => {})
  render(<ProductBoundary locale="nl-NL"><BrokenProduct /></ProductBoundary>)
  expect(screen.getByRole('heading', { name: 'De werkruimte kon niet worden geladen' })).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Werkruimte herladen' })).toBeTruthy()
  expect(screen.getByText(/Niet-opgeslagen invoer kan verloren zijn/)).toBeTruthy()
})
