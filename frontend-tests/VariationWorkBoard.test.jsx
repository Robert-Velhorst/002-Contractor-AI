import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import WorkBoardOffice from '../components/WorkBoardOffice'

it('prefills only the approved variation task and its linked material needs for owner review', async () => {
  const user = userEvent.setup()
  const suggestion = {
    sourceTaskId: 'task-variation-1',
    sourceType: 'accepted_variation_implementation',
    variationNumber: 'VAR-2026-000001',
    variationRevision: 1,
    title: 'Install corridor protection',
    description: 'Fit protection to the client-accepted route.',
    hours: 4,
    role: 'Timmerman',
    startsAt: null,
    endsAt: null,
    city: 'Utrecht',
    materialsText: 'Protective panel: 6 stuk (levering te bevestigen)',
    linkedMaterials: [{ id: 'matreq-1', name: 'Protective panel', quantity: 6, unit: 'stuk', status: 'needed' }],
  }
  const api = vi.fn().mockResolvedValue({ positions: [], suggestions: [suggestion], workPackages: [], materials: 'Unrelated material: 3 unit', equipment: '' })
  render(<WorkBoardOffice api={api} jobId="job-1" isOwner />)
  await screen.findByText('Nog geen posities vrijgegeven.')
  await user.click(screen.getByText('Positie vrijgeven', { selector: 'summary' }))
  await user.selectOptions(screen.getByLabelText('Uit bestaande werkzaamheid'), 'task-variation-1')

  expect(screen.getByLabelText('Openbare titel').value).toBe('Install corridor protection')
  expect(screen.getByLabelText('Werkzaamheden').value).toBe('Fit protection to the client-accepted route.')
  expect(screen.getByLabelText('Plaats').value).toBe('Utrecht')
  expect(screen.getByLabelText('Arbeidsduur per persoon (uren)').value).toBe('4')
  expect(screen.getByLabelText('Start').value).toBe('')
  expect(screen.getByLabelText('Einde').value).toBe('')
  expect(screen.getByLabelText('Materialen en wie ze levert').value).toBe('Protective panel: 6 stuk (levering te bevestigen)')
  expect(screen.getByLabelText('Vakgebied').value).toBe('Timmerman')
  expect(screen.getByLabelText('Uurvergoeding (EUR, excl. btw)').value).toBe('')
  expect(screen.getByLabelText('Aantal personen').value).toBe('')
  expect(screen.getByLabelText('Ik heb de openbare inhoud gecontroleerd op klantgegevens en geef deze voorwaarden vrij voor automatische interne plaatsing.').checked).toBe(false)
})
