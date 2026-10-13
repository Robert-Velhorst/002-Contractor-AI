import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import RecoveryCostImpactReview from '../components/RecoveryCostImpactReview'
import { removeSessionDraft } from '../draft-recovery'

const recoveryCase = { id: 'case-1', jobId: 'job-1', caseHash: 'b'.repeat(64), sourceCurrent: true, status: 'open', costImpactReviews: [] }

it('records an evidenced indicative euro estimate without suggesting a ledger posting', async () => {
  const api = vi.fn().mockResolvedValue({ reviewId: 'review-1' })
  const onSubmitted = vi.fn()
  render(<RecoveryCostImpactReview api={api} canEdit recoveryCase={recoveryCase} sourceHash={'a'.repeat(64)} onSubmitted={onSubmitted} />)
  expect(screen.getByText(/geen boeking, factuur, betaalopdracht of klanttoezegging/)).toBeTruthy()
  await userEvent.type(screen.getByLabelText('Indicatieve raming in euro'), '245.50')
  await userEvent.type(screen.getByLabelText('Onderbouwing'), 'Extra uren door gewijzigde werkvolgorde.')
  await userEvent.type(screen.getByLabelText('Bewijsbron kostenimpact'), 'urenstaat:U-55')
  await userEvent.click(screen.getByRole('button', { name: 'Kostenimpact vastleggen' }))
  expect(api).toHaveBeenCalledOnce()
  const body = JSON.parse(api.mock.calls[0][1].body)
  expect(body).toMatchObject({ action: 'cost_impact_review', caseId: 'case-1', sourceHash: 'a'.repeat(64),
    reviewStatus: 'estimate', amount: 245.5, evidenceReference: 'urenstaat:U-55' })
  expect(onSubmitted).toHaveBeenCalledOnce()
})

it('requires a future review date when the cost impact is unknown', async () => {
  const api = vi.fn().mockResolvedValue({ reviewId: 'review-2' })
  render(<RecoveryCostImpactReview api={api} canEdit recoveryCase={recoveryCase} sourceHash={'a'.repeat(64)} />)
  await userEvent.selectOptions(screen.getByLabelText('Beoordeling kostenimpact'), 'unknown')
  await userEvent.type(screen.getByLabelText('Onderbouwing'), 'Nog geen urenstaat ontvangen.')
  const button = screen.getByRole('button', { name: 'Kostenimpact vastleggen' })
  expect(button.disabled).toBe(true)
  await userEvent.type(screen.getByLabelText('Opnieuw beoordelen op'), '2030-01-02T09:00')
  expect(button.disabled).toBe(false)
})

it('attributes approved project actuals to a recovery and submits a reasoned correction', async () => {
  const api = vi.fn().mockResolvedValue({ actualCostRecordId: 'attribution-1' })
  const source = { type: 'expense', id: 'expense-1', label: 'Onkostendeclaratie MAT-1', amountCents: 10000,
    allocatedCents: 0, availableCents: 10000, currency: 'EUR', sourceFingerprint: 'c'.repeat(64) }
  render(<RecoveryCostImpactReview api={api} canEdit recoveryCase={{ ...recoveryCase, costImpactReviews: [{ id: 'estimate-1', status: 'estimate', amountCents: 5000, current: true }],
    actualCostAttributions: [{ id: 'attribution-1', sourceType: 'expense', sourceId: 'expense-1', amountCents: 2500,
      rationale: 'Herstelmateriaal', reversed: false, sourceCurrent: true }] }} actualCostSources={[source]} sourceHash={'a'.repeat(64)} />)
  expect(screen.getByLabelText('Vergelijking raming en werkelijke kosten').textContent).toContain('Verschil tot de raming: € 25,00')
  await userEvent.click(screen.getByText('Goedgekeurde werkelijke kosten toerekenen'))
  await userEvent.selectOptions(screen.getByLabelText('Kostenpost voor toerekening'), 'expense:expense-1')
  await userEvent.type(screen.getByLabelText('Toegerekend bedrag'), '25')
  await userEvent.type(screen.getByLabelText('Reden van toerekening'), 'Gebruikt voor extra materiaal na de verstoring.')
  await userEvent.click(screen.getByRole('button', { name: 'Werkelijke kosten toerekenen' }))
  expect(JSON.parse(api.mock.calls[0][1].body)).toMatchObject({ action: 'actual_cost_attribution', sourceId: 'expense-1', amount: 25 })
  await userEvent.click(screen.getByRole('button', { name: 'Toerekening corrigeren' }))
  await userEvent.type(screen.getByLabelText('Reden correctie'), 'De bon blijkt regulier materiaal te betreffen.')
  await userEvent.click(screen.getByRole('button', { name: 'Toerekening terugdraaien' }))
  expect(JSON.parse(api.mock.calls[1][1].body)).toMatchObject({ action: 'actual_cost_reversal', attributionId: 'attribution-1' })
})

it('restores an interrupted actual-cost attribution only for the same operator and current recovery source', async () => {
  const scope = 'owner:recovery-cost-draft', sourceHash = 'd'.repeat(64), name = `recovery-cost-impact:${recoveryCase.id}:${sourceHash}`
  removeSessionDraft(window.sessionStorage, scope, name)
  const source = { type: 'expense', id: 'expense-draft-1', label: 'Onkostendeclaratie MAT-DRAFT', amountCents: 10000,
    allocatedCents: 0, availableCents: 10000, currency: 'EUR', sourceFingerprint: 'e'.repeat(64) }
  const props = { api: vi.fn().mockResolvedValue({ actualCostRecordId: 'attribution-draft-1' }), canEdit: true, recoveryCase,
    actualCostSources: [source], sourceHash, draftScope: scope }
  const first = render(<RecoveryCostImpactReview {...props} />)
  await userEvent.click(screen.getByText('Goedgekeurde werkelijke kosten toerekenen'))
  await userEvent.selectOptions(screen.getByLabelText('Kostenpost voor toerekening'), 'expense:expense-draft-1')
  await userEvent.type(screen.getByLabelText('Toegerekend bedrag'), '37.50')
  await userEvent.type(screen.getByLabelText('Reden van toerekening'), 'Aanvullend herstelmateriaal volgens bon.')
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 230)) })
  first.unmount()

  render(<RecoveryCostImpactReview {...props} />)
  await userEvent.click(screen.getByText('Goedgekeurde werkelijke kosten toerekenen'))
  expect(screen.getByLabelText('Kostenpost voor toerekening').value).toBe('expense:expense-draft-1')
  expect(screen.getByLabelText('Toegerekend bedrag').value).toBe('37.5')
  expect(screen.getByLabelText('Reden van toerekening').value).toBe('Aanvullend herstelmateriaal volgens bon.')
  await userEvent.click(screen.getByRole('button', { name: 'Werkelijke kosten toerekenen' }))
  expect(JSON.parse(props.api.mock.calls[0][1].body)).toMatchObject({ action: 'actual_cost_attribution', sourceId: 'expense-draft-1', amount: 37.5,
    rationale: 'Aanvullend herstelmateriaal volgens bon.' })
  removeSessionDraft(window.sessionStorage, scope, name)
})
