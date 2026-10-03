import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import { CommercialControl } from '../components/JobWorkspaceControls'

const acceptedVariation = {
  id: 'change-1',
  variationNumber: 'VAR-2026-000001',
  revisionNumber: 1,
  title: 'Extra wandbescherming',
  status: 'accepted',
  amount: 125,
  scheduleDeltaDays: 1,
  scopeDelta: 'Breng beschermpanelen aan op de gangwand.',
  integrityValid: true,
  sourceCurrent: false,
  workAuthorized: true,
  formalControl: { variationType: 'client_request', initiatedBy: 'client', riskImpact: 'low' },
  data: { acceptance: { evidenceReference: 'signed-variation-1' } },
}

it('lets an office operator submit linked variation work steps for independent approval', async () => {
  const user = userEvent.setup()
  const submit = vi.fn().mockResolvedValue({ approval: { id: 'approval-1' } })
  render(<CommercialControl
    job={{ id: 'job-1', title: 'Badkamer renovatie', changeOrders: [acceptedVariation], approvals: [], quotes: [], documents: [], communications: [] }}
    locale="nl-NL"
    canCoordinate
    canApprove={false}
    submitting={false}
    onPrepareVariationImplementation={submit}
    onOpenApprovals={vi.fn()}
  />)

  await user.click(screen.getByRole('button', { name: 'Werkstappen voorbereiden' }))
  const editor = screen.getByRole('form')
  expect(within(editor).getByDisplayValue('Uitvoering: Extra wandbescherming')).toBeTruthy()
  await user.click(within(editor).getByRole('button', { name: 'Materiaal toevoegen' }))
  await user.type(within(editor).getByLabelText('Materiaal'), 'Beschermpaneel')
  await user.clear(within(editor).getByLabelText('Hoeveelheid'))
  await user.type(within(editor).getByLabelText('Hoeveelheid'), '4')
  await user.click(within(editor).getByRole('button', { name: 'Ter goedkeuring indienen' }))

  expect(submit).toHaveBeenCalledOnce()
  const [variation, payload] = submit.mock.calls[0]
  expect(variation.id).toBe('change-1')
  expect(payload.tasks).toEqual([expect.objectContaining({
    title: 'Uitvoering: Extra wandbescherming',
    description: 'Breng beschermpanelen aan op de gangwand.',
    materials: [{ name: 'Beschermpaneel', quantity: '4', unit: 'stuk' }],
  })])
  expect(payload.entryKey).toMatch(/^variation-implementation-change-1-/)
})

it('offers no execution workflow for an unaccepted or integrity-invalid scope', () => {
  render(<CommercialControl
    job={{ id: 'job-1', changeOrders: [{ ...acceptedVariation, status: 'issued', workAuthorized: false }, { ...acceptedVariation, id: 'change-2', integrityValid: false }], approvals: [], quotes: [], documents: [], communications: [] }}
    locale="nl-NL"
    canCoordinate
    canApprove={false}
    submitting={false}
    onPrepareVariationImplementation={vi.fn()}
    onOpenApprovals={vi.fn()}
  />)
  expect(screen.queryByRole('button', { name: 'Werkstappen voorbereiden' })).toBeNull()
})
