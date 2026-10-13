import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import ClientDeliveryControl from '../components/ClientDeliveryControl'
vi.mock('../components/ConversationPhoto', () => ({ default: props => <span data-testid="delivery-photo" data-locale={props.locale}>{props.label}</span> }))
const source = { sourceHash: 'first', offers: [], options: { deliveries: [{ id: 'd', title: 'Eerste deur', scope: 'Tweede deur uitgesloten', status: 'retained', current: true, pending: false }], accesses: [{ id: 'a', label: 'Opdrachtgever', expiresAt: '2099-01-01T00:00:00Z' }] } }
async function draft() {
  await userEvent.click(await screen.findByRole('button', { name: 'Aan klant aanbieden', exact: true }))
  await userEvent.selectOptions(screen.getByLabelText('Klanttoegang', { exact: true }), 'a')
  await userEvent.type(screen.getByLabelText('Beoogde ontvanger'), 'Klantnaam')
  fireEvent.change(screen.getByLabelText('Reageren tot'), { target: { value: '2098-01-01T12:00' } })
  await userEvent.type(screen.getByLabelText('Te controleren bevoegdheidsgrond'), 'Afzonderlijk opdrachtcontract')
  await userEvent.type(screen.getByLabelText('Onderbouwing voor beoordelaar'), 'Publieke scope gecontroleerd')
  await userEvent.click(screen.getByRole('checkbox', { name: 'Klantbeschrijving betreft uitsluitend dit uitgevoerde deel' }))
}
it('retains the exact uncertain publication command and never silently changes its reviewed source', async () => {
  let failed = true
  const api = vi.fn(async (url, options) => { if (url.includes('conversations')) return { messages: [], nextCursor: null }; if (options?.method === "POST" && failed) throw new Error('Verbinding onderbroken'); return source })
  const onChanged = vi.fn(); render(<ClientDeliveryControl api={api} jobId="j" canEdit onChanged={onChanged} />)
  await draft(); await userEvent.click(screen.getByRole('button', { name: 'Publicatie ter beoordeling indienen' })); await screen.findByText('Verbinding onderbroken')
  expect(screen.getByLabelText('Beoogde ontvanger').matches(':disabled')).toBe(true)
  failed = false; await userEvent.click(screen.getByRole('button', { name: 'Dezelfde wijziging opnieuw controleren' }))
  await screen.findByText('Publicatie toegevoegd aan Goedkeuringen.')
  const writes = api.mock.calls.filter(([, options]) => options?.method === "POST"); expect(writes).toHaveLength(2); expect(writes[0][1].body).toBe(writes[1][1].body)
  expect(JSON.parse(writes[0][1].body).record.scope).toBe('Tweede deur uitgesloten'); expect(onChanged).toHaveBeenCalledTimes(1)
})
it('preserves conflict drafts, requires explicit source reconfirmation and removes writes after role loss', async () => {
  let current = source
  const api = vi.fn(async (url, options) => { if (url.includes('conversations')) return { messages: [] }; if (options?.method === "POST") throw Object.assign(new Error('Scope gewijzigd'), { status: 409 }); return current })
  const { rerender } = render(<ClientDeliveryControl api={api} jobId="j" canEdit />)
  await draft(); await userEvent.click(screen.getByRole('button', { name: 'Publicatie ter beoordeling indienen' })); await screen.findByText('Scope gewijzigd')
  current = { ...source, sourceHash: 'revised' }; await userEvent.click(screen.getByRole('button', { name: 'Klantopleveringen verversen' }))
  await screen.findByText('Dossier gewijzigd sinds het openen van dit concept.')
  expect(screen.getByLabelText('Beoogde ontvanger').value).toBe('Klantnaam'); expect(screen.getByRole('button', { name: 'Publicatie ter beoordeling indienen' }).disabled).toBe(true)
  await userEvent.click(screen.getByRole('button', { name: 'Actuele scope bevestigd' }))
  await waitFor(() => expect(screen.getByRole('button', { name: 'Publicatie ter beoordeling indienen' }).disabled).toBe(false))
  rerender(<ClientDeliveryControl api={api} jobId="j" />); expect(screen.queryByRole('button', { name: 'Publicatie ter beoordeling indienen' })).toBeNull()
})
it('supports empty read recovery and safe read-only history', async () => {
  const unsafe = '<img src=x onerror=alert(1)>'
  const api = vi.fn().mockRejectedValueOnce(new Error('Geen verbinding')).mockResolvedValue({ ...source, offers: [{ id: 'o', title: unsafe, scope: 'Beperkt deel', version: 1,
    state: 'withdrawn', recipientName: 'Klant', expiresAt: '2099-01-01T00:00:00Z', quantities: [], photos: [], coverageStatus: 'not_configured' }] })
  render(<ClientDeliveryControl api={api} jobId="j" />)
  await screen.findByText('Geen verbinding'); await userEvent.click(screen.getByRole('button', { name: 'Klantopleveringen verversen' }))
  await screen.findByText(unsafe); expect(document.querySelector('img')).toBeNull(); expect(screen.queryByRole('button', { name: 'Aan klant aanbieden' })).toBeNull()
})

it('selects a shared photo without losing the publication form and supplies its default language', async () => {
  const api = vi.fn(async url => url.includes('conversations') ? { messages: [{ id: 'p', direction: 'inbound', attachment: { filename: 'door.png' } }], nextCursor: null } : source)
  render(<ClientDeliveryControl api={api} jobId="j" canEdit />)
  await userEvent.click(await screen.findByRole('button', { name: 'Aan klant aanbieden', exact: true }))
  await userEvent.selectOptions(screen.getByLabelText('Klanttoegang', { exact: true }), 'a')
  const checkbox = await screen.findByRole('checkbox', { name: 'door.png', exact: true })
  expect(screen.queryByTestId('delivery-photo')).toBeNull()
  await userEvent.click(checkbox)
  expect(checkbox.checked).toBe(true)
  expect(screen.getByTestId('delivery-photo').getAttribute('data-locale')).toBe('nl-NL')
  expect(screen.getByRole('form', { name: 'Klantaanbod bewerken' })).not.toBeNull()
  await userEvent.click(checkbox)
  expect(screen.queryByTestId('delivery-photo')).toBeNull()
})

it.each(['nl-NL', 'en-GB'])('renders retained publication and response photos in %s without a render failure', async locale => {
  const api = vi.fn().mockResolvedValue({ ...source, offers: [{ id: 'o', accessId: 'a', title: 'Door offer', scope: 'One door', version: 1,
    state: 'available', recipientName: 'Client', expiresAt: '2099-01-01T00:00:00Z', quantities: [], coverageStatus: 'not_configured',
    photos: [{ id: 'p', filename: 'offered.png' }], response: { status: 'pending', outcome: 'accepted_with_reservations', respondent: 'Client', note: 'Check hinge', photos: [{ id: 'r', filename: 'response.png' }] } }] })
  render(<ClientDeliveryControl api={api} jobId="j" locale={locale} />)
  await screen.findByText('Door offer')
  const photos = screen.getAllByTestId('delivery-photo')
  expect(photos).toHaveLength(2)
  expect(photos.map(photo => photo.textContent)).toEqual(['response.png', 'offered.png'])
  expect(photos.every(photo => photo.getAttribute('data-locale') === locale)).toBe(true)
})
