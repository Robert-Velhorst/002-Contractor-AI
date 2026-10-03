import { it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import WorkBoard from '../WorkBoard'

it('offers the existing administrator route without submitting worker registration', () => {
  sessionStorage.clear()
  render(<WorkBoard />)
  const entry = screen.getByRole('link', { name: 'Verder als beheerder' })
  expect(entry.getAttribute('href')).toBe('/')
  expect(entry.closest('form')).toBeNull()
  fireEvent.click(screen.getByRole('button', { name: 'Registreren', exact: true }))
  expect(screen.getByRole('link', { name: 'Verder als beheerder' }).getAttribute('href')).toBe('/')
  expect(sessionStorage.getItem('contractor.work-board.session')).toBeNull()
})
