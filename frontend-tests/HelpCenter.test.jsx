import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import HelpCenter from '../components/HelpCenter'

it('shows Dutch contractor guidance and links the relevant topic to an available workspace', () => {
  const onNavigate = vi.fn()
  render(<HelpCenter locale="nl-NL" destinations={['pipeline', 'resources']} onNavigate={onNavigate} />)

  expect(screen.getByRole('tab', { name: 'Aannemer' }).getAttribute('aria-selected')).toBe('true')
  const topic = screen.getByText('Posities en uitvoerenden plannen').closest('details')
  fireEvent.click(within(topic).getByText('Posities en uitvoerenden plannen'))
  fireEvent.click(within(topic).getByRole('button', { name: 'Open dit werkgebied' }))
  expect(onNavigate).toHaveBeenCalledWith('resources')

  fireEvent.change(screen.getByRole('searchbox', { name: 'Hulp doorzoeken' }), { target: { value: 'asbest' } })
  expect(screen.getByText('Geen onderwerpen gevonden. Probeer een ander woord.')).toBeTruthy()
})

it('limits field-scoped users to operational field guidance', () => {
  render(<HelpCenter locale="en-GB" fieldScoped destinations={['field', 'operations']} onNavigate={() => {}} />)

  expect(screen.getByRole('tablist', { name: 'Choose a help audience' }).querySelectorAll('[role="tab"]')).toHaveLength(1)
  expect(screen.getByRole('tab', { name: 'Field worker' }).getAttribute('aria-selected')).toBe('true')
  expect(screen.getByText('Start checks, safety, and quality')).toBeTruthy()
  expect(screen.queryByText('Turn an enquiry into ready-to-deliver work')).toBeNull()
})

it('provides client guidance without exposing office decisions or project data', () => {
  render(<HelpCenter locale="en-GB" destinations={['clients']} onNavigate={() => {}} />)
  fireEvent.click(screen.getByRole('tab', { name: 'Client' }))

  expect(screen.getByText('Open the client conversation securely')).toBeTruthy()
  expect(screen.getByText('Confirm a choice or change')).toBeTruthy()
  expect(screen.queryByText('TeamAccessControl')).toBeNull()
})
