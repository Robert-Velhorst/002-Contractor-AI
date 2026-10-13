import { render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import LmraControl from '../components/LmraControl'

const cases = [
  { name: 'expired stop-work evidence in English', expired: true, caption: 'Reassessment required', forbidden: 'expired' },
  { name: 'current stop-work evidence in English', expired: false, caption: 'Reassessment required', forbidden: 'expired' },
  { name: 'expired stop-work evidence in Dutch', locale: 'nl-NL', expired: true, caption: 'Herbeoordeling vereist', forbidden: 'verlopen' },
  { name: 'current stop-work evidence in Dutch', locale: 'nl-NL', expired: false, caption: 'Herbeoordeling vereist', forbidden: 'verlopen' },
  { name: 'expired ready evidence', outcome: 'ready', expired: true, caption: 'expired', forbidden: 'Reassessment required' },
  { name: 'current ready evidence', outcome: 'ready', readyForHazardousWork: true, expired: false, caption: /^until /, forbidden: 'expired' },
  { name: 'superseded ready evidence', outcome: 'ready', isLatestForWorkerPlan: false, expired: true, caption: 'Superseded assessment', forbidden: 'expired' },
  { name: 'superseded stop-work evidence', isLatestForWorkerPlan: false, expired: true, caption: 'Superseded assessment', forbidden: 'Reassessment required' },
]

it.each(cases)('labels $name without changing retained safety evidence', async fixture => {
  const assessment = {
    id: 'lmra-status', preTaskPlanId: 'plan-status', activity: 'Retained assessment',
    workerName: 'Field worker', workArea: 'Work area', assessedAt: '2026-10-01T08:00:00Z',
    validUntil: '2030-01-01T12:00:00Z', outcome: 'stop_work',
    readyForHazardousWork: false, isLatestForWorkerPlan: true,
    ...fixture,
  }
  const apiRequest = vi.fn(async url => {
    if (url === '/api/ledger/jobs/job-status/lmra?limit=100') return { lmraAssessments: [assessment] }
    if (url === '/api/ledger/jobs/job-status') return { job: {
      id: 'job-status', title: 'Safety job', tasks: [],
      preTaskPlans: [{ id: 'plan-status', title: 'Work plan', readyForWork: true, steps: [] }],
    } }
    throw new Error(`Unexpected request: ${url}`)
  })
  const recordFieldOperation = vi.fn()
  render(<LmraControl
    locale={fixture.locale || 'en-GB'}
    jobs={[{ id: 'job-status', title: 'Safety job', status: 'active' }]}
    fieldScoped
    apiRequest={apiRequest}
    recordFieldOperation={recordFieldOperation}
    notify={vi.fn()}
    refresh={vi.fn()}
    outboxScope="field:status"
    refreshOutboxState={vi.fn()}
  />)
  const row = (await screen.findByText('Retained assessment')).closest('.lmra-row')
  expect(within(row).getByText(fixture.caption, { exact: true })).toBeTruthy()
  expect(within(row).queryByText(fixture.forbidden, { exact: true })).toBeNull()
  if (assessment.outcome === 'stop_work') {
    expect(within(row).getByText(fixture.locale === 'nl-NL' ? 'werkstop' : 'stop work', { exact: true })).toBeTruthy()
  }
  expect(recordFieldOperation).not.toHaveBeenCalled()
  expect(assessment.outcome).toBe(fixture.outcome || 'stop_work')
})
