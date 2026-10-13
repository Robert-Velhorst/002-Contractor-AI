import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import ClientDeliveryControl from '../components/ClientDeliveryControl'

vi.mock('../components/ConversationPhoto', () => ({ default: props => <span data-testid="retained-photo" data-base={props.base} data-locale={props.locale}>{props.label}</span> }))
afterEach(() => vi.restoreAllMocks())

function delivery(id = 'delivery') {
  return { id, title: `Work ${id}`, scope: 'Only the retained door', status: 'retained', current: true, pending: false }
}

function offer(id = 'offer', state = 'withdrawn') {
  return { id, title: `Offer ${id}`, scope: 'Retained work', state, version: 1, accessId: 'access',
    deliveryId: 'other-delivery', recipientName: 'Customer', expiresAt: '2099-01-01T00:00:00Z',
    quantities: [], photos: [], coverageStatus: 'not_configured' }
}

function dossier(offers = [], deliveries = [delivery()]) {
  return { sourceHash: 'current', offers, options: { deliveries, accesses: [{ id: 'access', label: 'Customer' }] } }
}

it('does not reread retained history or photo choices during unrelated form typing', async () => {
  const reads = { titles: 0, attachments: 0, deliveryIds: 0 }
  const offers = Array.from({ length: 40 }, (_, index) => ({ ...offer(`offer-${index}`),
    get title() { reads.titles++; return `Offer ${index}` } }))
  const messages = Array.from({ length: 40 }, (_, index) => ({ id: `photo-${index}`, direction: 'inbound',
    get attachment() { reads.attachments++; return { filename: `detail-${index}.png` } } }))
  const item = { ...delivery(), get id() { reads.deliveryIds++; return 'delivery' } }
  const source = dossier(offers, [item])
  const api = vi.fn(async url => url.includes('conversations') ? { messages, nextCursor: null } : source)
  render(<ClientDeliveryControl api={api} jobId="job" canEdit />)
  await userEvent.click(await screen.findByRole('button', { name: 'Aan klant aanbieden', exact: true }))
  await userEvent.selectOptions(screen.getByLabelText('Klanttoegang', { exact: true }), 'access')
  await screen.findByRole('checkbox', { name: 'detail-39.png', exact: true })
  const before = { ...reads }, callCount = api.mock.calls.length
  await userEvent.type(screen.getByLabelText('Beoogde ontvanger'), 'Klant met een volledig adres')
  await userEvent.type(screen.getByLabelText('Onderbouwing voor beoordelaar'), 'Beoordeling van het uitgevoerde deel')
  expect(reads).toEqual(before)
  console.log(JSON.stringify({ retainedTypingWork: { offers: offers.length, photos: messages.length,
    typedCharacters: screen.getByLabelText('Beoogde ontvanger').value.length + screen.getByLabelText('Onderbouwing voor beoordelaar').value.length,
    additionalReads: Object.fromEntries(Object.keys(reads).map(key => [key, reads[key] - before[key]])) } }))
  expect(api).toHaveBeenCalledTimes(callCount)
  expect(screen.getByLabelText('Beoogde ontvanger').value).toBe('Klant met een volledig adres')
  expect(screen.getByLabelText('Uitgevoerd deel voor klant').value).toBe('Only the retained door')
  expect(screen.getByRole('button', { name: 'Publicatie ter beoordeling indienen' }).disabled).toBe(false)
})

it('indexes active offer identities linearly and preserves every blocking state', async () => {
  let identityReads = 0
  const states = ['pending', 'available', 'expired', 'source_changed', 'withdrawn', 'rejected']
  const size = 60
  const offers = Array.from({ length: size }, (_, index) => ({ ...offer(`offer-${index}`, states[index % states.length]),
    get deliveryId() { identityReads++; return `delivery-${index}` } }))
  const source = dossier(offers, Array.from({ length: size }, (_, index) => delivery(`delivery-${index}`)))
  render(<ClientDeliveryControl api={vi.fn(async () => source)} jobId="job" canEdit />)
  await screen.findByText('Work delivery-59')
  const buttons = screen.getAllByRole('button', { name: 'Aan klant aanbieden', exact: true })
  await waitFor(() => expect(buttons.at(-1).disabled).toBe(false))
  expect(buttons).toHaveLength(size)
  for (let index = 0; index < size; index++) expect(buttons[index].disabled).toBe(index % states.length < 4)
  expect(identityReads).toBeLessThanOrEqual(size * 4)
  console.log(JSON.stringify({ candidateIdentityReads: identityReads, offers: size, candidates: size }))
})

it('refreshes retained history, source confirmation, photo locale and action rights', async () => {
  let current = dossier([{ ...offer('offered', 'available'), photos: [{ id: 'published-photo', filename: 'published.png' }] }])
  const api = vi.fn(async () => current)
  const { rerender } = render(<ClientDeliveryControl api={api} jobId="job" canEdit locale="nl-NL" />)
  await userEvent.click(await screen.findByRole('button', { name: 'Aan klant aanbieden', exact: true }))
  await userEvent.type(screen.getByLabelText('Beoogde ontvanger'), 'Original draft')
  rerender(<ClientDeliveryControl api={api} jobId="job" canEdit locale="en-GB" />)
  expect(screen.getByTestId('retained-photo').getAttribute('data-locale')).toBe('en-GB')
  current = { ...current, sourceHash: 'changed', offers: [{ ...offer('updated', 'available'), title: 'Updated retained offer' }],
    options: { ...current.options, deliveries: [{ ...delivery(), scope: 'New separately reviewed scope' }] } }
  await userEvent.click(screen.getByRole('button', { name: 'Klantopleveringen verversen' }))
  await screen.findByText('Updated retained offer')
  expect(screen.queryByText('Offer offered')).toBeNull()
  expect(screen.queryByTestId('retained-photo')).toBeNull()
  expect(screen.getByText('Actueel uitgevoerd deel: New separately reviewed scope')).toBeTruthy()
  expect(screen.getByLabelText('Beoogde ontvanger').value).toBe('Original draft')
  expect(screen.getByRole('button', { name: 'Publicatie ter beoordeling indienen' }).disabled).toBe(true)
  rerender(<ClientDeliveryControl api={api} jobId="job" locale="en-GB" />)
  expect(screen.queryByRole('form', { name: 'Klantaanbod bewerken' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'Aanbod intrekken' })).toBeNull()
  expect(api.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
})

it('merges older photos with incoming precedence and linear identity reads', async () => {
  const size = 100, incomingSize = 50
  let incomingReads = 0
  const recent = Array.from({ length: size }, (_, index) => ({ id: `photo-${index}`, direction: 'inbound', attachment: { filename: `recent-${index}.png` } }))
  const older = Array.from({ length: incomingSize }, (_, index) => ({
    get id() { incomingReads++; return `photo-${index}` }, direction: 'inbound', attachment: { filename: `older-${index}.png` }
  }))
  const api = vi.fn(async url => !url.includes('conversations') ? dossier()
    : url.includes('before=') ? { messages: older, nextCursor: null } : { messages: recent, nextCursor: 'cursor' })
  render(<ClientDeliveryControl api={api} jobId="job" canEdit />)
  await userEvent.click(await screen.findByRole('button', { name: 'Aan klant aanbieden', exact: true }))
  await userEvent.selectOptions(screen.getByLabelText('Klanttoegang', { exact: true }), 'access')
  await screen.findByRole('checkbox', { name: 'recent-99.png', exact: true })
  await userEvent.click(screen.getByRole('button', { name: "Oudere gespreksfoto's" }))
  await screen.findByRole('checkbox', { name: 'older-0.png', exact: true })
  expect(screen.queryByRole('checkbox', { name: 'recent-0.png', exact: true })).toBeNull()
  const photoChoices = screen.getAllByRole('checkbox').filter(element => !element.required)
  expect(photoChoices).toHaveLength(size)
  expect(photoChoices[0].closest('label').textContent).toBe('older-0.png')
  expect(photoChoices[49].closest('label').textContent).toBe('older-49.png')
  expect(photoChoices[50].closest('label').textContent).toBe('recent-50.png')
  expect(incomingReads).toBeLessThanOrEqual(incomingSize * 8)
  console.log(JSON.stringify({ olderPhotoIdentityReads: incomingReads, incoming: incomingSize, retained: size }))
  await userEvent.click(photoChoices[0])
  expect(screen.getByTestId('retained-photo').textContent).toBe('older-0.png')
  fireEvent.change(screen.getByLabelText('Titel voor klant'), { target: { value: 'Updated title' } })
  expect(photoChoices[0].checked).toBe(true)
})

it('retains the ten-photo cap, updates selected-photo locale and ignores a late older page after cancellation', async () => {
  let finishOlder
  const messages = Array.from({ length: 11 }, (_, index) => ({ id: `photo-${index}`, direction: 'inbound', attachment: { filename: `detail-${index}.png` } }))
  const api = vi.fn(async url => !url.includes('conversations') ? dossier()
    : url.includes('before=') ? new Promise(resolve => { finishOlder = resolve }) : { messages, nextCursor: 'older' })
  const { rerender } = render(<ClientDeliveryControl api={api} jobId="job" canEdit locale="nl-NL" />)
  await userEvent.click(await screen.findByRole('button', { name: 'Aan klant aanbieden', exact: true }))
  await userEvent.selectOptions(screen.getByLabelText('Klanttoegang', { exact: true }), 'access')
  await screen.findByRole('checkbox', { name: 'detail-10.png', exact: true })
  for (let index = 0; index < 10; index++) await userEvent.click(screen.getByRole('checkbox', { name: `detail-${index}.png`, exact: true }))
  expect(screen.getByRole('checkbox', { name: 'detail-10.png', exact: true }).disabled).toBe(true)
  expect(screen.getByRole('checkbox', { name: 'detail-0.png', exact: true }).disabled).toBe(false)
  rerender(<ClientDeliveryControl api={api} jobId="job" canEdit locale="en-GB" />)
  expect(screen.getAllByTestId('retained-photo').every(element => element.getAttribute('data-locale') === 'en-GB')).toBe(true)
  await userEvent.click(screen.getByRole('checkbox', { name: 'detail-0.png', exact: true }))
  expect(screen.getByRole('checkbox', { name: 'detail-10.png', exact: true }).disabled).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: "Oudere gespreksfoto's" }))
  await userEvent.click(screen.getByRole('button', { name: 'Annuleren', exact: true }))
  await userEvent.click(screen.getByRole('button', { name: 'Aan klant aanbieden', exact: true }))
  await userEvent.selectOptions(screen.getByLabelText('Klanttoegang', { exact: true }), 'access')
  await screen.findByRole('checkbox', { name: 'detail-10.png', exact: true })
  finishOlder({ messages: [{ id: 'late', direction: 'inbound', attachment: { filename: 'late-old-context.png' } }], nextCursor: null })
  await waitFor(() => expect(api).toHaveBeenCalledTimes(4))
  expect(screen.queryByRole('checkbox', { name: 'late-old-context.png', exact: true })).toBeNull()
  expect(screen.getByRole('checkbox', { name: 'detail-10.png', exact: true }).checked).toBe(false)
  expect(api.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
})

it('reformats retained dates when the system time zone changes with unchanged dossier data', async () => {
  const OriginalFormatter = Intl.DateTimeFormat
  let timeZone = 'Europe/Amsterdam'
  vi.spyOn(Intl, 'DateTimeFormat').mockImplementation(function (locale, options) {
    return new OriginalFormatter(locale, { ...options, timeZone })
  })
  const row = offer('time-zone')
  const api = vi.fn(async () => dossier([row]))
  const { rerender } = render(<ClientDeliveryControl api={api} jobId="job" />)
  await screen.findByText('Offer time-zone')
  const expected = zone => new Date(row.expiresAt).toLocaleString('nl-NL', { timeZone: zone })
  expect(screen.getByText(`Customer / ${expected(timeZone)}`)).toBeTruthy()
  timeZone = 'America/New_York'
  rerender(<ClientDeliveryControl api={api} jobId="job" />)
  expect(screen.getByText(`Customer / ${expected(timeZone)}`)).toBeTruthy()
  expect(screen.queryByText(`Customer / ${expected('Europe/Amsterdam')}`)).toBeNull()
})
