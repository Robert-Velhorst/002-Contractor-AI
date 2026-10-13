import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import OperationalReplacementPlan from '../components/OperationalReplacementPlan'
import OperationalRecoveryControl from '../components/OperationalRecoveryControl'

const source = { type: 'worker_availability', id: 'absence-retry', workerId: 'worker-original', sourceFingerprint: 'fingerprint', impact: {
  crossJobConflictListComplete: true, crossJobConflicts: [{ assignmentId: 'assignment-retry', jobTitle: 'Dakherstel',
    scheduledStart: '2030-01-02T09:00:00.000Z', scheduledEnd: '2030-01-02T11:00:00.000Z',
    replacementCandidates: [{ worker: { id: 'worker-replacement', name: 'Vervanger', role: 'Dakdekker' } }] }]
} }
const recoveryCase = { id: 'case-retry', status: 'open', sourceCurrent: true, recoveryAction: 'Vervang de afwezige uitvoerder.', sources: [source] }
const props = () => ({ source, recoveryCase, canEdit: true, onSubmitted: vi.fn(), onError: vi.fn() })
const submitButton = () => screen.getByRole('button', { name: /Alle 1 opdracht/ })
const reasonField = () => screen.getByLabelText('Reden voor de gecoördineerde vervanging')
const choiceField = () => screen.getByRole('combobox', { name: 'Vervanger voor Dakherstel' })

it('freezes all fields and rejects duplicate submissions until the write completes', async () => {
  let finish
  const api = vi.fn(() => new Promise(resolve => { finish = resolve }))
  const callbacks = props()
  render(<OperationalReplacementPlan {...callbacks} api={api} />)
  await userEvent.selectOptions(choiceField(), 'worker-replacement')
  const button = submitButton()
  fireEvent.click(button)
  fireEvent.click(button)
  expect(api).toHaveBeenCalledTimes(1)
  expect(reasonField().disabled).toBe(true)
  expect(choiceField().disabled).toBe(true)
  await act(async () => finish({ approval: { id: 'approval-retry' } }))
  expect(callbacks.onSubmitted).toHaveBeenCalledWith({ approval: { id: 'approval-retry' } })
  expect(reasonField().disabled).toBe(false)
})

it('restores and retries the exact uncertain request after a reload without editing it', async () => {
  const api = vi.fn().mockRejectedValueOnce(new Error('Response lost')).mockResolvedValueOnce({ replayed: true })
  const callbacks = props()
  const first = render(<OperationalReplacementPlan {...callbacks} api={api} draftScope="owner:replacement-retry" />)
  await userEvent.selectOptions(choiceField(), 'worker-replacement')
  await userEvent.clear(reasonField())
  await userEvent.type(reasonField(), 'Alleen deze vervanger is gecontroleerd.')
  await userEvent.click(submitButton())
  await screen.findByRole('button', { name: 'Hetzelfde vervangingsplan opnieuw proberen' })
  expect(reasonField().disabled).toBe(true)
  expect(choiceField().disabled).toBe(true)
  const originalBody = api.mock.calls[0][1].body
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 230)) })
  first.unmount()
  render(<OperationalReplacementPlan {...callbacks} api={api} draftScope="owner:replacement-retry" />)
  await userEvent.click(await screen.findByRole('button', { name: 'Hetzelfde vervangingsplan opnieuw proberen' }))
  expect(api).toHaveBeenCalledTimes(2)
  expect(api.mock.calls[1][1].body).toBe(originalBody)
  expect(callbacks.onSubmitted).toHaveBeenCalledWith({ replayed: true })
  expect(screen.queryByText('Hetzelfde vervangingsplan opnieuw proberen')).toBeNull()
})

it('unlocks rejected requests for correction without discarding the operator selections', async () => {
  const api = vi.fn().mockRejectedValue(Object.assign(new Error('Candidate changed'), { status: 409 }))
  const callbacks = props()
  render(<OperationalReplacementPlan {...callbacks} api={api} />)
  await userEvent.selectOptions(choiceField(), 'worker-replacement')
  await userEvent.click(submitButton())
  await waitFor(() => expect(callbacks.onError).toHaveBeenCalledTimes(1))
  expect(reasonField().disabled).toBe(false)
  expect(choiceField().value).toBe('worker-replacement')
  expect(screen.queryByText('Hetzelfde vervangingsplan opnieuw proberen')).toBeNull()
})

it('keeps read-only replacement plans completely non-editable', async () => {
  const api = vi.fn()
  render(<OperationalReplacementPlan {...props()} api={api} canEdit={false} />)
  expect(reasonField().disabled).toBe(true)
  expect(choiceField().disabled).toBe(true)
  fireEvent.click(submitButton())
  expect(api).not.toHaveBeenCalled()
})

it.each([
  ['resolved', true], ['cancelled', true], ['open', false],
])('disables replacement and impact actions for case status %s with current source %s', async (status, sourceCurrent) => {
  const item = { ...recoveryCase, status, sourceCurrent }
  const api = vi.fn().mockResolvedValue({ sourceHash: 'a'.repeat(64), sources: [], cases: [item] })
  render(<OperationalRecoveryControl api={api} jobId="job-retry" canEdit />)
  await screen.findByText('Bezetting herstellen over opdrachten heen')
  expect(reasonField().disabled).toBe(true)
  expect(choiceField().disabled).toBe(true)
  expect(screen.queryByRole('button', { name: 'Kostenimpact beoordelen' })).toBeNull()
  fireEvent.click(submitButton())
  expect(api.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
})
