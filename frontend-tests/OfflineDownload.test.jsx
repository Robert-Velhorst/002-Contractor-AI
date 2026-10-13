import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import OfflineDownload from '../OfflineDownload'

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(), files: vi.fn(), vault: vi.fn(), register: vi.fn(),
  pdfModule: vi.fn(), vaultModule: vi.fn()
}))
vi.mock('../company-request.mjs', () => ({ companyFetch: mocks.fetch }))
vi.mock('../offline-drawings.mjs', () => {
  mocks.pdfModule()
  return { downloadWorkPackFiles: mocks.files }
})
vi.mock('../offline-work-packs.mjs', () => {
  mocks.vaultModule()
  return { downloadWorkPack: mocks.vault }
})

const pack = { job: { id: 'job-1' }, sourceHash: 'a'.repeat(64), know: { drawings: [] } }
const operator = { authenticated: true, role: 'field_worker', workerId: 'worker-1', id: 'field-user',
  companyId: 'company-1', ledgerId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa' }
function respond(body) { return { ok: true, json: async () => body } }
function startSave() {
  fireEvent.click(screen.getByText('Offline work folder'))
  const input = screen.getByLabelText('Offline passphrase (at least 10 characters)')
  fireEvent.change(input, { target: { value: 'A strong offline passphrase' } })
  fireEvent.submit(input.closest('form'))
  return input
}

beforeEach(() => {
  mocks.fetch.mockReset().mockImplementation(async path => respond(path === '/api/session'
    ? { operator } : path === '/api/work-board/notifications' ? { rows: [] } : { pack }))
  mocks.files.mockReset().mockResolvedValue([{ drawingId: 'drawing-1', base64: 'verified-by-download-module' }])
  mocks.vault.mockReset().mockResolvedValue({})
  mocks.register.mockReset().mockResolvedValue({})
  vi.stubGlobal('navigator', { serviceWorker: { register: mocks.register, ready: Promise.resolve({}) } })
})
afterEach(() => vi.unstubAllGlobals())

it('does not initialize the PDF or encrypted vault modules merely by opening the work folder', () => {
  render(<OfflineDownload pack={pack} locale="en-GB" />)
  fireEvent.click(screen.getByText('Offline work folder'))
  expect(mocks.pdfModule).not.toHaveBeenCalled()
  expect(mocks.vaultModule).not.toHaveBeenCalled()
  expect(mocks.fetch).not.toHaveBeenCalled()
})

it('loads verified files on demand and saves only after the live source is rechecked', async () => {
  render(<OfflineDownload pack={pack} locale="en-GB" />)
  const input = startSave()
  await screen.findByText('Encrypted and saved for up to 7 days.')
  expect(mocks.pdfModule).toHaveBeenCalledOnce()
  expect(mocks.vaultModule).toHaveBeenCalledOnce()
  expect(mocks.files).toHaveBeenCalledWith(pack, mocks.fetch)
  expect(mocks.fetch.mock.calls.map(([path]) => path)).toEqual([
    '/api/session', '/api/ledger/jobs/job-1/work-pack', '/api/ledger/jobs/job-1/work-pack', '/api/work-board/notifications'
  ])
  expect(mocks.vault).toHaveBeenCalledOnce()
  expect(mocks.vault.mock.calls[0][0]).toEqual({ ...pack, offlineFiles: await mocks.files.mock.results[0].value })
  expect(mocks.vault.mock.calls[0][1]).toBe('A strong offline passphrase')
  expect(mocks.vault.mock.calls[0][2]).toBe(`company:${operator.companyId}:ledger:${operator.ledgerId}:field_worker:${operator.id}`)
  expect(mocks.register).toHaveBeenCalledWith('/field-sw.js')
  expect(input.value).toBe('')
  expect(input.disabled).toBe(false)
})

it('blocks duplicate submissions and freezes the passphrase until the single save finishes', async () => {
  let release
  mocks.files.mockImplementation(() => new Promise(resolve => { release = resolve }))
  render(<OfflineDownload pack={pack} locale="en-GB" />)
  const input = startSave()
  fireEvent.submit(input.closest('form'))
  await waitFor(() => expect(mocks.files).toHaveBeenCalledOnce())
  expect(input.disabled).toBe(true)
  expect(screen.getByRole('button', { name: 'Save work pack offline' }).disabled).toBe(true)
  release([])
  await screen.findByText('Encrypted and saved for up to 7 days.')
  expect(mocks.vault).toHaveBeenCalledOnce()
})

it('refuses an encrypted save when the approved source changed during the downloads', async () => {
  let reads = 0
  mocks.fetch.mockImplementation(async path => respond(path === '/api/session' ? { operator }
    : { pack: ++reads === 1 ? pack : { ...pack, sourceHash: 'b'.repeat(64) } }))
  render(<OfflineDownload pack={pack} locale="en-GB" />)
  const input = startSave()
  await screen.findByText('Werkpakket gewijzigd tijdens downloaden. Probeer opnieuw.')
  expect(mocks.vault).not.toHaveBeenCalled()
  expect(mocks.register).not.toHaveBeenCalled()
  expect(input.value).toBe('A strong offline passphrase')
  expect(input.disabled).toBe(false)
})

it('keeps the passphrase and permits a fresh retry after download failure', async () => {
  mocks.files.mockRejectedValueOnce(new Error('Verified PDF unavailable'))
  render(<OfflineDownload pack={pack} locale="en-GB" />)
  const input = startSave()
  await screen.findByText('Verified PDF unavailable')
  expect(mocks.vault).not.toHaveBeenCalled()
  expect(input.disabled).toBe(false)
  fireEvent.submit(input.closest('form'))
  await screen.findByText('Encrypted and saved for up to 7 days.')
  expect(mocks.files).toHaveBeenCalledTimes(2)
  expect(mocks.vault).toHaveBeenCalledOnce()
})

it('does not fetch documents or save a vault for an office account', async () => {
  mocks.fetch.mockResolvedValue(respond({ operator: { ...operator, role: 'owner' } }))
  render(<OfflineDownload pack={pack} locale="en-GB" />)
  const input = startSave()
  await screen.findByText('Meld je aan als uitvoerende.')
  expect(mocks.files).not.toHaveBeenCalled()
  expect(mocks.vault).not.toHaveBeenCalled()
  expect(input.disabled).toBe(false)
})
