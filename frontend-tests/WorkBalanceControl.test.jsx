import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import WorkBalanceControl from '../components/WorkBalanceControl'
import { readSessionDraft, writeSessionDraft } from '../draft-recovery'

const source = { sourceHash: 'a'.repeat(64), state: 'allocation_required', enabled: false, planVersion: null, activePlanId: null, history: [], lines: [], unassignedEntries: [],
  options: { baseline: { lines: [{ lineKey: 'door', description: 'Deuren', plannedQuantity: 2, plannedLaborHours: 8, unit: 'st' }] },
    packages: [{ id: 'package-1', code: 'WP-01', title: 'Montage', taskIds: ['task-1'], places: [] }] }, packages: [] }

async function prepare() {
  await screen.findByText('Werkverdeling ontbreekt')
  await userEvent.click(screen.getByRole('button', { name: 'Werkverdeling opstellen' }))
  const quantity = screen.getByLabelText('Hoeveelheid (st)')
  await userEvent.clear(quantity)
  await userEvent.type(quantity, '1')
  expect(screen.getByRole('button', { name: 'Ter beoordeling indienen' }).disabled).toBe(true)
  await userEvent.clear(quantity)
  await userEvent.type(quantity, '2')
  await userEvent.clear(screen.getByLabelText('Afbakening en bron'))
  await userEvent.type(screen.getByLabelText('Afbakening en bron'), 'Grondslag en werkpakket WP-01')
  await userEvent.clear(screen.getByLabelText('Onderbouwing voor beoordelaar'))
  await userEvent.type(screen.getByLabelText('Onderbouwing voor beoordelaar'), 'Volledige hoeveelheid per werkpakket')
  await userEvent.click(screen.getByRole('checkbox', { name: /de volledige productiegrondslag/i }))
}

it('submits the exact reviewed split and keeps the same idempotent request after an unknown result', async () => {
  let fail = true
  const api = vi.fn(async (url, options) => { if (options?.method === "POST" && fail) throw new Error('Verbinding onderbroken'); return source })
  const changed = vi.fn()
  const draftScope = 'company:example:operator:balance-retry-test'
  const first = render(<WorkBalanceControl api={api} jobId="job-1" canEdit draftScope={draftScope} onChanged={changed} />)
  await prepare()
  await userEvent.click(screen.getByRole('button', { name: 'Ter beoordeling indienen' }))
  await screen.findByText('Verbinding onderbroken')
  window.dispatchEvent(new Event('pagehide'))
  first.unmount()

  render(<WorkBalanceControl api={api} jobId="job-1" canEdit draftScope={draftScope} onChanged={changed} />)
  await screen.findByRole('button', { name: 'Dezelfde wijziging opnieuw proberen' })
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Dezelfde wijziging opnieuw proberen' }))
  await screen.findByText('Werkverdeling naar Goedkeuringen gestuurd.')
  const writes = api.mock.calls.filter(([, options]) => options?.method === "POST")
  expect(writes[0][1].body).toBe(writes[1][1].body)
  const command = JSON.parse(writes[0][1].body)
  expect(command.record.scopeConfirmed).toBe(true)
  expect(command.record.allocations).toEqual([{ lineKey: 'door', packageId: 'package-1', plannedQuantity: '2' }])
  expect(changed).toHaveBeenCalledOnce()
})

it('shows source and execution states read-only and renders user text as text', async () => {
  const data = { ...source, state: 'reconciliation_required', history: [{ id: 'plan', sequence: 1, status: 'approved', sourceCurrent: false,
    reason: '<img src=x onerror=alert(1)>', reference: 'Grondslag', scope: [{ lineKey: 'door', packageId: 'package-1', packageCode: 'WP-01', packageTitle: 'Montage', description: 'Deuren', plannedQuantity: 2, unit: 'st' }] }],
    packages: [{ id: 'package-1', code: 'WP-01', title: 'Montage', state: 'source_changed', taskScopeMismatch: false, rows: [], taskOnly: true, remainingLaborEstimate: null }],
    unassignedEntries: [{ id: 'entry' }] }
  render(<WorkBalanceControl api={vi.fn().mockResolvedValue(data)} jobId="job-1" />)
  await screen.findByText('Uitvoering of toerekening controleren')
  expect(screen.getByText('<img src=x onerror=alert(1)>')).toBeTruthy()
  expect(document.querySelector('img')).toBeNull()
  expect(screen.getByText(/productiemeting\(en\) moeten nog aan de goedgekeurde verdeling/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Werkverdeling herzien' })).toBeNull()
})

it('restores a work-balance draft only when its authenticated scope and source revision still match', async () => {
  const scope = 'company:example:operator:balance-recovery-test'
  const name = 'work-balance:job-1'
  const recoveredRecord = {
    sourceHash: source.sourceHash,
    allocations: [{ lineKey: 'door', packageId: 'package-1', plannedQuantity: '1.5' }],
    reference: 'Approved baseline and package WP-01',
    reason: 'Split retained for review',
    scopeConfirmed: false,
  }
  writeSessionDraft(window.sessionStorage, scope, name, { sourceHash: source.sourceHash, record: recoveredRecord, pending: null })

  const api = vi.fn().mockResolvedValue(source)
  const { rerender } = render(<WorkBalanceControl api={api} jobId="job-1" canEdit draftScope={scope} />)
  expect(await screen.findByDisplayValue('1.5')).toBeTruthy()
  expect(screen.getByDisplayValue('Approved baseline and package WP-01')).toBeTruthy()

  const changedSource = { ...source, sourceHash: 'b'.repeat(64) }
  api.mockResolvedValue(changedSource)
  rerender(<WorkBalanceControl api={api} jobId="job-1" canEdit draftScope={scope} refreshKey="changed-source" />)
  await waitFor(() => expect(screen.queryByDisplayValue('1.5')).toBeNull())
  expect(screen.getByRole('button', { name: 'Werkverdeling opstellen' })).toBeTruthy()
  await waitFor(() => expect(readSessionDraft(window.sessionStorage, scope, name).found).toBe(false))
})
