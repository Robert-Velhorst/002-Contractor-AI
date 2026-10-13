import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import ClientDateImpactReview from '../components/ClientDateImpactReview'

const commitment = { entryKey: 'completion', revision: 1, status: 'active', sourceCurrent: true, commitmentHash: 'a'.repeat(64),
  dateKind: 'complete_by', date: '2030-04-30', label: 'Oplevering', contractWording: 'Uiterlijk 30 april 2030 opleveren.', evidenceReference: 'offerte-17, artikel 8.1', source: { title: 'Offerte Q-17' } }
const recoveryCase = { id: 'case-1', jobId: 'job-1', status: 'open', sourceCurrent: true, caseHash: 'b'.repeat(64),
  sources: [{ type: 'safety_incident', id: 'incident-1', sourceFingerprint: 'c'.repeat(64), impact: { clientDateCommitments: [commitment] } }],
  clientDateImpactReviews: [] }

it('records an evidence-bound contract date risk and retries the identical command after an unknown result', async () => {
  let fail = true
  const api = vi.fn(async () => {
    if (fail) throw Object.assign(new Error('Verbinding onderbroken'), { status: 503 })
    return { reviewId: 'review-1' }
  })
  render(<ClientDateImpactReview api={api} canEdit recoveryCase={recoveryCase} sourceHash={'d'.repeat(64)} />)
  await userEvent.click(screen.getByText('Contractimpact beoordelen'))
  await userEvent.selectOptions(screen.getByLabelText('Beoordeling contractimpact'), 'at_risk')
  await userEvent.type(screen.getByLabelText('Waarom is deze mijlpaal wel of niet geraakt?'), 'De veiligheidsblokkade houdt het werk stil.')
  await userEvent.type(screen.getByLabelText('Opnieuw beoordelen op'), '2030-04-20T09:00')
  await userEvent.click(screen.getByRole('button', { name: 'Contractimpact vastleggen' }))
  await screen.findByText('Verbinding onderbroken')
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Dezelfde beoordeling opnieuw proberen' }))
  const writes = api.mock.calls.filter(([, options]) => options)
  expect(writes).toHaveLength(2)
  expect(writes[0][1].body).toBe(writes[1][1].body)
  expect(JSON.parse(writes[0][1].body)).toMatchObject({ action: 'client_date_impact_review', caseId: 'case-1', commitmentEntryKey: 'completion',
    commitmentHash: commitment.commitmentHash, reviewStatus: 'at_risk', nextFollowUpAt: new Date('2030-04-20T09:00').toISOString() })
})

it('keeps the review read-only for non-office roles', () => {
  const data = { ...recoveryCase, clientDateImpactReviews: [{ id: 'review-0', commitmentEntryKey: 'completion', commitmentHash: commitment.commitmentHash,
    commitment, status: 'at_risk', summary: 'Planning opnieuw controleren.', nextFollowUpAt: '2030-04-20T09:00:00.000Z', current: false, recordedBy: 'Planner', recordedAt: '2030-04-18T09:00:00.000Z' }] }
  render(<ClientDateImpactReview api={vi.fn()} canEdit={false} recoveryCase={data} sourceHash={'d'.repeat(64)} />)
  expect(screen.getByText(/historische beoordeling; bron of contractversie gewijzigd/)).toBeTruthy()
  expect(screen.getByText(/Uiterlijk 30 april 2030 opleveren/)).toBeTruthy()
  expect(screen.queryByText('Contractimpact beoordelen')).toBeNull()
})
