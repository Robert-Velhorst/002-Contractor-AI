import { render, screen } from '@testing-library/react'
import { beforeEach, expect, it, vi } from 'vitest'
import ClientDeliveryPhotos from '../components/ClientDeliveryPhotos'
import ConversationPhoto from '../components/ConversationPhoto'

vi.mock('../components/ConversationPhoto', () => ({ default: vi.fn(props =>
  <span data-testid="delivery-photo" data-base={props.base} data-token={props.token} data-locale={props.locale}>{props.label}</span>
) }))
beforeEach(() => vi.clearAllMocks())

const first = { id: 'first', filename: 'first.png' }, second = { id: 'second', filename: 'second.png' }

it('preserves the exact private photo props and skips an unchanged list', () => {
  const photos = [first, second], props = { photos, base: '/api/client-portal/conversation', token: 'private-link', locale: 'nl-NL' }
  const { rerender } = render(<ClientDeliveryPhotos {...props} />)
  expect(ConversationPhoto).toHaveBeenCalledTimes(2)
  for (const [index, photo] of photos.entries()) expect(ConversationPhoto.mock.calls[index][0]).toEqual({
    base: props.base, token: props.token, locale: props.locale, message: photo, label: photo.filename,
  })
  rerender(<ClientDeliveryPhotos {...props} />)
  expect(ConversationPhoto).toHaveBeenCalledTimes(2)
  expect(screen.getAllByTestId('delivery-photo').map(element => element.textContent)).toEqual(['first.png', 'second.png'])
})

it('invalidates the list for a different credential, authority path or language', () => {
  const photos = [first]
  const { rerender } = render(<ClientDeliveryPhotos photos={photos} base="/api/client-portal/conversation" token="first-link" locale="nl-NL" />)
  rerender(<ClientDeliveryPhotos photos={photos} base="/api/client-portal/conversation" token="second-link" locale="nl-NL" />)
  expect(screen.getByTestId('delivery-photo').dataset.token).toBe('second-link')
  rerender(<ClientDeliveryPhotos photos={photos} base="/api/ledger/jobs/new/conversations/access" locale="nl-NL" />)
  expect(screen.getByTestId('delivery-photo').dataset.base).toBe('/api/ledger/jobs/new/conversations/access')
  expect(screen.getByTestId('delivery-photo').dataset.token).toBeUndefined()
  rerender(<ClientDeliveryPhotos photos={photos} base="/api/ledger/jobs/new/conversations/access" locale="en-GB" />)
  expect(screen.getByTestId('delivery-photo').dataset.locale).toBe('en-GB')
  expect(ConversationPhoto).toHaveBeenCalledTimes(4)
})

it('retains incoming order, updated labels, removal and empty-list behavior', () => {
  const { rerender } = render(<ClientDeliveryPhotos photos={[first, second]} base="/private" locale="nl-NL" />)
  const updated = { ...first, filename: '<img src=x onerror=alert(1)>' }
  rerender(<ClientDeliveryPhotos photos={[second, updated]} base="/private" locale="nl-NL" />)
  expect(screen.getAllByTestId('delivery-photo').map(element => element.textContent)).toEqual(['second.png', updated.filename])
  expect(document.querySelector('img')).toBeNull()
  rerender(<ClientDeliveryPhotos photos={[updated]} base="/private" locale="nl-NL" />)
  expect(screen.getAllByTestId('delivery-photo')).toHaveLength(1)
  rerender(<ClientDeliveryPhotos photos={[]} base="/private" locale="nl-NL" />)
  expect(screen.queryByTestId('delivery-photo')).toBeNull()
  expect(document.querySelector('.client-delivery-photos')).toBeTruthy()
})
