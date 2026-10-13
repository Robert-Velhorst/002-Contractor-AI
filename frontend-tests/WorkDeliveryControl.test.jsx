import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import WorkDeliveryControl from '../components/WorkDeliveryControl'

const source = { sourceHash: 'a'.repeat(64), records: [], options: { packages: [{ id: 'p', title: 'Montage', code: 'WP-1', taskIds: [] }], entries: [{ id: 'e', lineKey: 'deuren', quantity: 1, unit: 'st', workDate: '2026-09-01', note: 'Eerste deur' }], tasks: [], inspections: [], milestones: [], documents: [] } }
async function draft() {
  await screen.findByText('Nog geen deelopleveringen vastgelegd.')
  await userEvent.click(screen.getByRole('button', { name: 'Uitgevoerd deel vastleggen' }))
  await userEvent.selectOptions(screen.getByLabelText('Werkpakket'), 'p')
  await userEvent.type(screen.getByLabelText('Titel deeloplevering'), 'Eerste deur')
  await userEvent.type(screen.getByLabelText('Uitgevoerd deel en resterend werk'), 'Tweede deur moet nog')
  await userEvent.click(screen.getByRole('checkbox', { name: /deuren: 1 st/ }))
}
it('keeps the same command across an unknown network outcome', async () => {
  let fail = true
  const api = vi.fn(async (url, options) => { if (options?.method === "POST" && fail) throw new Error('Verbinding onderbroken'); return source })
  const changed = vi.fn()
  render(<WorkDeliveryControl api={api} jobId="job" canEdit onChanged={changed} />)
  await draft(); await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
  await screen.findByText('Verbinding onderbroken')
  expect(screen.getByRole('button', { name: 'Deelopleveringen verversen' }).disabled).toBe(true)
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Dezelfde wijziging opnieuw controleren' }))
  await screen.findByText('Deeloplevering bijgewerkt.')
  const writes = api.mock.calls.filter(([, options]) => options?.method === "POST")
  expect(writes[0][1].body).toBe(writes[1][1].body)
  expect(JSON.parse(writes[0][1].body).record.entryIds).toEqual(['e'])
  expect(changed).toHaveBeenCalledOnce()
})
it('keeps a conflict draft for explicit refresh and hides it when edit access is revoked', async () => {
  const api = vi.fn(async (url, options) => { if (options?.method === "POST") throw Object.assign(new Error('Bron gewijzigd'), { status: 409 }); return source })
  const { rerender } = render(<WorkDeliveryControl api={api} jobId="job" canEdit />)
  await draft(); await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
  await screen.findByText('Bron gewijzigd')
  await userEvent.click(screen.getByRole('button', { name: 'Deelopleveringen verversen' }))
  await waitFor(() => expect(screen.queryByText('Bron gewijzigd')).toBeNull())
  expect(screen.getByLabelText('Titel deeloplevering').value).toBe('Eerste deur')
  rerender(<WorkDeliveryControl api={api} jobId="job" canEdit={false} />)
  expect(screen.queryByRole('button', { name: 'Opslaan' })).toBeNull()
})
it('read-only users can recover a failed initial read but cannot create deliveries', async () => {
  const api = vi.fn().mockRejectedValueOnce(new Error('Niet bereikbaar')).mockResolvedValue(source)
  render(<WorkDeliveryControl api={api} jobId="job" />)
  await screen.findByText('Niet bereikbaar')
  await userEvent.click(screen.getByRole('button', { name: 'Deelopleveringen verversen' }))
  await screen.findByText('Nog geen deelopleveringen vastgelegd.')
  expect(screen.queryByRole('button', { name: 'Uitgevoerd deel vastleggen' })).toBeNull()
})
it('renders contradictory closure states separately and never treats text as HTML', async () => {
  const row = { id: 'd', title: '<img src=x onerror=alert(1)>', scope: 'Gedeelte uitgevoerd', entryIds: ['e'], taskIds: [], status: 'retained', physical: { status: 'reported', current: true, entries: [], tasks: [] }, inspection: { status: 'review_required', records: [] }, response: { status: 'accepted', pending: false }, finance: { status: 'outstanding', invoices: [{ id: 'invoice-1', receivedAmount: 0, outstandingAmount: 121, currency: 'EUR' }], milestones: [{ id: 'milestone-1', title: 'Deeltermijn deur', total: 121, currency: 'EUR', invoiceId: 'invoice-1' }] }, decisions: [] }
  const api = vi.fn().mockResolvedValue({ ...source, records: [row] })
  render(<WorkDeliveryControl api={api} jobId="job" />)
  await screen.findByText('Geaccepteerd')
  expect(screen.getByText('Keuring te beoordelen')).toBeTruthy()
  expect(screen.getByText('Openstaand')).toBeTruthy()
  const article = screen.getByRole('article', { name: row.title })
  expect(article.textContent).toContain('Deeltermijn deur')
  expect(article.textContent).toContain('121,00 incl. btw')
  expect(article.textContent).toContain('openstaand')
  expect(screen.getByText(row.title)).toBeTruthy()
  expect(document.querySelector('img')).toBeNull()
})

it('prevents office assignment of a milestone already linked to another active delivery', async () => {
  const milestone = { id: 'm-1', title: 'Deurtermijn', status: 'invoiced', total: 121, currency: 'EUR', invoiceId: 'invoice-1' }
  const record = (id, milestones) => ({ id, title: id, scope: 'Scope', entryIds: [], taskIds: [], status: 'retained',
    physical: { status: 'reported', current: true, entries: [], tasks: [] }, inspection: { status: 'not_linked', records: [] },
    response: { status: 'not_verified', pending: false }, finance: { status: milestones.length ? 'outstanding' : 'not_linked', invoices: [], milestones }, decisions: [] })
  const data = { ...source, records: [record('d-1', [milestone]), record('d-2', [])], options: { ...source.options, milestones: [milestone] } }
  const api = vi.fn().mockResolvedValue(data)
  const { rerender } = render(<WorkDeliveryControl api={api} jobId="job" canEdit />)
  await screen.findByRole('article', { name: 'd-2' })
  await userEvent.click(screen.getAllByRole('button', { name: 'Keuringen en termijnen koppelen' })[1])
  expect(screen.getByRole('checkbox', { name: /Deurtermijn.*Al gekoppeld aan een andere deeloplevering/ }).disabled).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
  const duplicateApi = vi.fn().mockResolvedValue({ ...data, records: [record('d-1', [milestone]), record('d-2', [milestone])] })
  rerender(<WorkDeliveryControl api={duplicateApi} jobId="job" canEdit />)
  await screen.findByRole('article', { name: 'd-2' })
  await userEvent.click(screen.getAllByRole('button', { name: 'Keuringen en termijnen koppelen' })[0])
  const existingLink = screen.getByRole('checkbox', { name: /Deurtermijn.*Dubbele bestaande koppeling/ })
  expect(existingLink.disabled).toBe(false)
  await userEvent.click(existingLink)
  expect(existingLink.checked).toBe(false)
})
