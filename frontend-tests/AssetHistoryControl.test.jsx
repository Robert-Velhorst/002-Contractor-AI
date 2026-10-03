import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import AssetHistoryControl from '../components/AssetHistoryControl'
const asset = { asset: { id: 'a', name: 'Ventilatie-unit', archived: false }, profile: null, events: [], links: [] }
const source = { sourceHash: 'a'.repeat(64), records: [asset], options: { deliveries: [{ id: 'd', title: 'Ventilatie geplaatst' }], documents: [], warranty: [], aftercare: [], recurring: [] } }
async function draft() {
  await screen.findByText('Nog geen werkhistorie vastgelegd.')
  await userEvent.click(screen.getByRole('button', { name: 'Werk vastleggen' }))
  await userEvent.type(screen.getByLabelText('Werkdatum / datum bronstuk'), '2026-09-02')
  await userEvent.type(screen.getByLabelText('Uitgevoerd werk / bronbeschrijving'), 'Filter gecontroleerd')
  await userEvent.selectOptions(screen.getByLabelText('Uitvoeringsbron'), 'd')
}
it('retains an exact pending command across an uncertain write', async () => {
  let fail = true
  const api = vi.fn(async (url, options) => { if (options?.method === "POST" && fail) throw new Error('Verbinding onderbroken'); return source })
  render(<AssetHistoryControl api={api} jobId="job" canEdit />)
  await draft(); await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
  await screen.findByText('Verbinding onderbroken')
  expect(screen.getByRole('button', { name: 'Installatiehistorie verversen' }).disabled).toBe(true)
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Dezelfde wijziging opnieuw controleren' }))
  await screen.findByText('Installatiehistorie bijgewerkt.')
  const writes = api.mock.calls.filter(([, options]) => options?.method === "POST")
  expect(writes[0][1].body).toBe(writes[1][1].body)
})
it('keeps a stale draft for refresh and removes editing after authority loss', async () => {
  const api = vi.fn(async (url, options) => { if (options?.method === "POST") throw Object.assign(new Error('Bron gewijzigd'), { status: 409 }); return source })
  const { rerender } = render(<AssetHistoryControl api={api} jobId="job" canEdit />)
  await draft(); await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
  await screen.findByText('Bron gewijzigd')
  await userEvent.click(screen.getByRole('button', { name: 'Installatiehistorie verversen' }))
  await waitFor(() => expect(screen.queryByText('Bron gewijzigd')).toBeNull())
  expect(screen.getByLabelText('Uitgevoerd werk / bronbeschrijving').value).toBe('Filter gecontroleerd')
  rerender(<AssetHistoryControl api={api} jobId="job" />)
  expect(screen.queryByRole('button', { name: 'Opslaan' })).toBeNull()
})
it('supports read-only load recovery and escapes retained event text', async () => {
  const text = '<img src=x onerror=alert(1)>'
  const events = [{ id: 'e', jobId: 'job', kind: 'inspected', summary: text, performedAt: '2026-09-02', status: 'retained', sourceCurrent: false, source: { type: 'delivery', title: 'Inspection report' }, sharing: { enabled: false }, correction: {} }]
  const api = vi.fn().mockRejectedValueOnce(new Error('Niet bereikbaar')).mockResolvedValue({ ...source, records: [{ ...asset, events }] })
  render(<AssetHistoryControl api={api} jobId="job" />)
  await screen.findByText('Niet bereikbaar')
  await userEvent.click(screen.getByRole('button', { name: 'Installatiehistorie verversen' }))
  await screen.findByText('Bron gewijzigd; afstemming nodig')
  expect(screen.getByText(text)).toBeTruthy()
  expect(document.querySelector('img')).toBeNull()
  expect(screen.queryByRole('button', { name: 'Werk vastleggen' })).toBeNull()
})
it('records explicit field sharing separately from the private report', async () => {
  const events = [{ id: 'e', jobId: 'job', kind: 'serviced', summary: 'Private claim discussion', performedAt: '2026-09-02', status: 'retained', sourceCurrent: true, source: { type: 'delivery', title: 'Service' }, sharing: { enabled: false, summary: '' }, correction: {} }]
  const api = vi.fn().mockResolvedValue({ ...source, records: [{ ...asset, events }] })
  render(<AssetHistoryControl api={api} jobId="job" canEdit />)
  await screen.findByText('Private claim discussion')
  await userEvent.click(screen.getByRole('button', { name: 'Delen met uitvoerenden' }))
  await userEvent.click(screen.getByRole('checkbox', { name: 'Delen met toegewezen uitvoerenden' }))
  await userEvent.type(screen.getByLabelText('Operationele samenvatting'), 'Filter gecontroleerd')
  await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
  await screen.findByText('Installatiehistorie bijgewerkt.')
  const input = JSON.parse(api.mock.calls.find(([, options]) => options?.method === "POST")[1].body)
  expect(input.record).toEqual({ assetId: 'a', id: 'e', enabled: true, fieldSummary: 'Filter gecontroleerd' })
})
it('prepares maintenance directly from the linked plan without losing another open edit', async () => {
  const links = [{ id: 'l', kind: 'recurring', jobId: 'job', active: true, record: { id: 'plan', service: 'Ventilation service', status: 'active', nextDueAt: '2026-10-01' } }]
  const api = vi.fn(async (url, options) => options?.method === "POST" ? { preparedJobId: 'next-job' } : { ...source, records: [{ ...asset, links }] })
  render(<AssetHistoryControl api={api} jobId="job" canEdit />)
  await screen.findByRole('button', { name: 'Onderhoudsdossier voorbereiden' })
  await userEvent.click(screen.getByRole('button', { name: 'Identiteit vastleggen' }))
  expect(screen.getByRole('button', { name: 'Onderhoudsdossier voorbereiden' }).disabled).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
  await userEvent.click(screen.getByRole('button', { name: 'Onderhoudsdossier voorbereiden' }))
  await screen.findByText('Onderhoudsdossier beschikbaar.')
  const input = JSON.parse(api.mock.calls.find(([, options]) => options?.method === "POST")[1].body)
  expect(input.action).toBe('prepare_recurring')
  expect(input.record).toEqual({ assetId: 'a', planId: 'plan' })
})
