import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, expect, it, vi } from 'vitest'
import OfflineField from '../OfflineField'
import * as offline from '../offline-work-packs.mjs'
import { companyFetch } from '../company-request.mjs'

const scope = 'company:company-a:ledger:11111111-1111-4111-8111-111111111111:field_worker:worker-1'
const record = { format: 'contractor-offline-vault/v1', expiresAt: Date.now() + 60_000 }
const instruction = { id: 'recovery-instruction-1', taskId: 'task-1', text: 'Check the replacement bracket and resume the roof fixing.', recordedAt: '2026-09-24T09:00:00.000Z' }
const pack = { sourceHash: 'e'.repeat(64), savedAt: '2026-09-24T08:00:00.000Z', job: { id: 'job-1', title: 'Roof repair', address: 'Teststraat 1', description: 'Repair the roof.' },
  assignments: [], can: [], know: { instructions: [], recoveryInstructions: [instruction], drawings: [], safetyPlans: [], lmraAssessments: [], workContext: null },
  have: { materials: [], siteIssues: [], equipment: [] }, do: [{ id: 'task-1', title: 'Fix roof brackets', status: 'open' }], checks: { photos: [], quality: [] }, questions: [] }
const initialNotifications = { savedAt: '2026-09-24T08:01:00.000Z', unreadCount: 1,
  notifications: [{ id: 'notice-1', type: 'position_assigned', title: 'Je bent geplaatst', body: 'Teststraat 1 · Arnhem', createdAt: '2026-09-24T08:00:00.000Z', readAt: null }] }
const vaultData = { scope, packs: [pack], queue: [], notifications: initialNotifications }

vi.mock('../offline-work-packs.mjs', () => ({
  downloadWorkPack: vi.fn(), eraseVault: vi.fn(), listVaultScopes: vi.fn(), openVault: vi.fn(),
  queuePhotoEvidence: vi.fn(), queueResponse: vi.fn(), queueSiteIssueReceipt: vi.fn(), readVault: vi.fn(),
  snapshotWorkerNotifications: vi.fn(inbox => ({ ...inbox, savedAt: new Date().toISOString() })),
  synchronizeVault: vi.fn(), updateVault: vi.fn()
}))
vi.mock('../company-request.mjs', () => ({ companyFetch: vi.fn() }))

beforeEach(() => {
  vi.clearAllMocks()
  offline.listVaultScopes.mockResolvedValue([scope])
  offline.readVault.mockResolvedValue(record)
  offline.openVault.mockResolvedValue({ data: structuredClone(vaultData), record, key: {} })
  companyFetch.mockImplementation(async path => ({ ok: true, status: 200, json: async () => path === '/api/work-board/notifications' ? initialNotifications : { operator: { authenticated: true, role: 'field_worker' } } }))
})

it('shows versioned recovery instructions in the encrypted offline worker Know view', async () => {
  render(<OfflineField />)
  await screen.findByRole('option', { name: 'company-a | worker-1' })
  await userEvent.type(screen.getByLabelText('Offline wachtzin'), 'offline test passphrase')
  await userEvent.click(screen.getByRole('button', { name: 'Ontgrendelen' }))
  await screen.findByRole('heading', { name: 'Roof repair' })
  await userEvent.click(screen.getByRole('button', { name: 'Weten' }))
  const section = await screen.findByRole('region', { name: 'Bijgewerkte taakinstructies' })
  expect(section.textContent).toContain('Fix roof brackets')
  expect(section.textContent).toContain(instruction.text)
  expect(section.textContent).toContain('Tot synchronisatie heeft kantoor niets ontvangen.')
  expect(section.textContent).toContain('geen veiligheidsvrijgave')
})

it('shows offline notices as a dated snapshot and explicitly warns that it may be stale', async () => {
  render(<OfflineField />)
  await userEvent.type(screen.getByLabelText('Offline wachtzin'), 'offline test passphrase')
  await userEvent.click(screen.getByRole('button', { name: 'Ontgrendelen' }))
  await screen.findByRole('heading', { name: 'Roof repair' })
  const inbox = await screen.findByRole('region', { name: 'Opgeslagen meldingen' })
  expect(inbox.textContent).toContain('Momentopname van')
  expect(inbox.textContent).toContain('Offline kunnen nieuwe meldingen of wijzigingen niet worden opgehaald.')
  expect(inbox.textContent).toContain('Je bent geplaatst')
  expect(inbox.textContent).toContain('Ongelezen bij opslaan')
})

it('refreshes and encrypts the worker inbox only after explicit online synchronization', async () => {
  const latest = { unreadCount: 2, notifications: [
    { id: 'notice-2', type: 'position_offer', title: 'Nieuw aanbod', body: 'Arnhem · 8 uur', createdAt: '2026-09-24T09:00:00.000Z', readAt: null }
  ] }
  companyFetch.mockImplementation(async path => ({ ok: true, status: 200, json: async () => path === '/api/work-board/notifications' ? latest : { operator: { authenticated: true, role: 'field_worker' } } }))
  render(<OfflineField />)
  await userEvent.type(screen.getByLabelText('Offline wachtzin'), 'offline test passphrase')
  await userEvent.click(screen.getByRole('button', { name: 'Ontgrendelen' }))
  await screen.findByRole('heading', { name: 'Roof repair' })
  await userEvent.click(screen.getByRole('button', { name: 'Synchroniseren' }))
  expect(await screen.findByText(/offline meldingen zijn bijgewerkt/)).toBeTruthy()
  expect(screen.getByText('Nieuw aanbod')).toBeTruthy()
  expect(offline.updateVault).toHaveBeenCalled()
})

it('saves a held-equipment fault against a blocked task in the encrypted offline queue', async () => {
  const offlinePack = {
    ...structuredClone(pack),
    have: { ...structuredClone(pack.have), equipment: [{ id: 'reservation-1', taskId: 'task-1', toolName: 'Mixer', custody: { status: 'checked_out', heldByYou: true } }] }
  }
  offline.openVault.mockResolvedValue({
    data: { ...structuredClone(vaultData), packs: [offlinePack] }, record, key: {}
  })
  render(<OfflineField />)
  await userEvent.type(screen.getByLabelText('Offline wachtzin'), 'offline test passphrase')
  await userEvent.click(screen.getByRole('button', { name: 'Ontgrendelen' }))
  await screen.findByRole('heading', { name: 'Roof repair' })
  await userEvent.selectOptions(screen.getByLabelText('Taak'), 'task-1')
  await userEvent.selectOptions(screen.getByLabelText('Voortgangsstatus'), 'blocked')
  await userEvent.selectOptions(screen.getByLabelText('Materieel met storing'), 'reservation-1')
  await userEvent.selectOptions(screen.getByLabelText('Soort melding'), 'unsafe')
  const note = 'Mixer cable insulation is split near the plug.'
  await userEvent.type(screen.getByLabelText('Blokkade en benodigde hulp'), note)
  await userEvent.click(screen.getByRole('button', { name: 'Voortgang lokaal bewaren' }))
  expect(await screen.findByText('Op dit apparaat bewaard; nog niet door kantoor ontvangen.')).toBeTruthy()
  expect(offline.queueResponse).toHaveBeenCalledWith(expect.any(Object), 'job-1', 'progress', expect.objectContaining({
    taskId: 'task-1', status: 'blocked',
    equipmentIssue: { reservationId: 'reservation-1', issueType: 'unsafe', note }
  }))
})


it('retains a progress draft while a question finishes saving', async () => {
  let finishSave
  const saved = new Promise(resolve => { finishSave = resolve })
  offline.updateVault.mockImplementationOnce(() => saved)
  render(<OfflineField />)
  await userEvent.type(screen.getByLabelText('Offline wachtzin'), 'offline test passphrase')
  await userEvent.click(screen.getByRole('button', { name: 'Ontgrendelen' }))
  await screen.findByRole('heading', { name: 'Roof repair' })
  await userEvent.type(screen.getByLabelText('Vraag of blokkade'), 'Confirm the opening dimensions.')
  await userEvent.click(screen.getByRole('button', { name: 'Vraag lokaal bewaren' }))
  await userEvent.selectOptions(screen.getByLabelText('Voortgangsstatus'), 'blocked')
  const note = 'Waiting for verified opening dimensions.'
  await userEvent.type(screen.getByLabelText('Blokkade en benodigde hulp'), note)
  await act(async () => { finishSave(record); await saved })
  expect(screen.getByLabelText('Blokkade en benodigde hulp').value).toBe(note)
  await userEvent.click(screen.getByRole('button', { name: 'Voortgang lokaal bewaren' }))
  expect(offline.queueResponse).toHaveBeenCalledWith(expect.any(Object), 'job-1', 'progress', expect.objectContaining({ note, status: 'blocked' }))
})
