import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import ClientsWorkspace from '../components/ClientsWorkspace'

function clientRows(count) {
  return Array.from({ length: count }, (_, index) => ({
    id: `client-${index + 1}`, name: `Client ${String(index + 1).padStart(3, '0')}`,
    email: `client-${index + 1}@example.test`, phone: '+31 20 555 0199',
    data: {}, metrics: {},
  }))
}

function openDirectory(clients, overrides = {}) {
  const props = { directory: { clients }, locale: 'en-GB', canCoordinate: true,
    onCreateClient: vi.fn(), onEditClient: vi.fn(), onOpen: vi.fn(), ...overrides }
  const view = render(<ClientsWorkspace {...props} />)
  fireEvent.click(screen.getByRole('tab', { name: /^Directory/ }))
  return { ...view, props, directory: screen.getByTestId('client-directory') }
}

it('bounds the client directory to 25 rows while keeping all retained identities reachable', () => {
  const clients = clientRows(101)
  const { directory, props } = openDirectory(clients)
  expect(within(directory).getAllByRole('article')).toHaveLength(25)
  expect(screen.getByText('Showing 1-25 of 101')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Previous' }).disabled).toBe(true)
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByText('Showing 26-50 of 101')).toBeTruthy()
  fireEvent.click(within(screen.getByTestId('client-directory-client-26')).getByRole('button', { name: 'Edit client' }))
  expect(props.onEditClient).toHaveBeenCalledWith(clients[25])
  fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '50' } })
  expect(within(directory).getAllByRole('article')).toHaveLength(50)
  expect(screen.getByText('Showing 1-50 of 101')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(within(directory).getAllByRole('article')).toHaveLength(1)
  expect(screen.getByText('Client 101')).toBeTruthy()
  expect(screen.getByRole('button', { name: 'Next' }).disabled).toBe(true)
  fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: 'client 003' } })
  expect(within(directory).getAllByRole('article')).toHaveLength(1)
  expect(screen.getByText('Client 003')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: '' } })
  expect(screen.getByText('Showing 1-50 of 101')).toBeTruthy()
  fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '10' } })
  expect(within(directory).getAllByRole('article')).toHaveLength(10)
  expect(props.onCreateClient).not.toHaveBeenCalled()
})

it('normalizes each search field once for 500 clients and does not redraw unchanged matching rows while typing', () => {
  let billingReads = 0, metricReads = 0
  const query = 'shared retained client directory registration'
  const clients = clientRows(500).map(client => ({ ...client, name: `${query} ${client.id}`,
    data: { get billingEmail() { billingReads += 1; return 'billing@example.test' } },
    metrics: { get activeJobs() { metricReads += 1; return 3 } },
  }))
  const { directory, props } = openDirectory(clients)
  expect(billingReads).toBe(0)
  expect(metricReads).toBe(25)
  const search = within(directory).getByRole('searchbox', { name: 'Search clients' })
  for (let length = 1; length <= query.length; length += 1) {
    fireEvent.change(search, { target: { value: query.slice(0, length) } })
    expect(search.value).toBe(query.slice(0, length))
    expect(within(directory).getAllByRole('article')).toHaveLength(25)
  }
  expect(billingReads).toBe(500)
  expect(metricReads).toBe(25)
  expect(props.onEditClient).not.toHaveBeenCalled()
  fireEvent.change(search, { target: { value: '' } })
  expect(billingReads).toBe(500)
  fireEvent.change(search, { target: { value: query } })
  expect(billingReads).toBe(1000)
  expect(metricReads).toBe(25)
})

it('preserves per-field case-insensitive search without matching field names or joining adjacent fields', () => {
  const client = { ...clientRows(1)[0], name: 'Eva', company: 'Bouw', email: 'eva@example.test',
    phone: '+31 20 555 0135', address: 'Straat 125', city: 'Arnhem',
    data: { billingEmail: 'rekening@example.test', registrationNumber: 87654321 } }
  const { directory } = openDirectory([client])
  const search = within(directory).getByRole('searchbox', { name: 'Search clients' })
  for (const query of [' EVA ', 'BOUW', 'EXAMPLE.TEST', '555 0135', 'STRAAT 125', 'ARNHEM', 'REKENING', '87654321']) {
    fireEvent.change(search, { target: { value: query } })
    expect(within(directory).getAllByRole('article')).toHaveLength(1)
  }
  for (const query of ['eva bouw', 'registrationNumber', 'billingEmail', 'definitely missing']) {
    fireEvent.change(search, { target: { value: query } })
    expect(within(directory).queryAllByRole('article')).toHaveLength(0)
    expect(screen.getByText('No matching clients')).toBeTruthy()
  }
})

it('rebuilds search from refreshed records and keeps fresh callback, locale and authority props', () => {
  const original = { ...clientRows(1)[0], data: { registrationNumber: 'old-reference' }, latestJobs: [{ id: 'job-original' }] }
  const { rerender, props, directory } = openDirectory([original])
  fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: 'old-reference' } })
  const refreshed = { ...original, name: 'Refreshed client', data: { registrationNumber: 'new-reference' }, latestJobs: [{ id: 'job-refreshed' }] }
  const onEditClient = vi.fn(), onOpen = vi.fn()
  const next = { ...props, directory: { clients: [refreshed] }, onEditClient, onOpen }
  rerender(<ClientsWorkspace {...next} />)
  expect(within(directory).queryAllByRole('article')).toHaveLength(0)
  fireEvent.change(screen.getByLabelText('Search clients'), { target: { value: 'new-reference' } })
  fireEvent.click(screen.getByRole('button', { name: 'Edit client' }))
  fireEvent.click(screen.getByRole('button', { name: 'Open latest job' }))
  expect(onEditClient).toHaveBeenCalledWith(refreshed)
  expect(onOpen).toHaveBeenCalledWith(refreshed.latestJobs[0])
  expect(props.onEditClient).not.toHaveBeenCalled()
  expect(props.onOpen).not.toHaveBeenCalled()
  rerender(<ClientsWorkspace {...next} locale="nl-NL" submitting />)
  expect(screen.getByRole('button', { name: 'Klant bewerken' }).disabled).toBe(true)
  expect(screen.getByLabelText('Klanten zoeken').value).toBe('new-reference')
  rerender(<ClientsWorkspace {...next} canCoordinate={false} />)
  expect(screen.queryByRole('button', { name: 'Edit client' })).toBeNull()
  expect(screen.queryByRole('button', { name: 'New client' })).toBeNull()
})

it('clamps a retained page when fresh data shrinks and handles an empty directory', () => {
  const clients = clientRows(101)
  const { rerender, props, directory } = openDirectory(clients)
  for (let page = 0; page < 4; page += 1) fireEvent.click(screen.getByRole('button', { name: 'Next' }))
  expect(screen.getByText('Client 101')).toBeTruthy()
  rerender(<ClientsWorkspace {...props} directory={{ clients: clients.slice(0, 30) }} />)
  expect(screen.getByText('Showing 26-30 of 30')).toBeTruthy()
  expect(within(directory).getAllByRole('article')).toHaveLength(5)
  rerender(<ClientsWorkspace {...props} />)
  expect(screen.getByText('Showing 26-50 of 101')).toBeTruthy()
  fireEvent.click(screen.getByRole('button', { name: 'Previous' }))
  expect(screen.getByText('Showing 1-25 of 101')).toBeTruthy()
  rerender(<ClientsWorkspace {...props} directory={{ clients: [] }} />)
  expect(screen.getByText('No retained clients')).toBeTruthy()
  expect(screen.queryByRole('navigation', { name: 'List pages' })).toBeNull()
  expect(props.onEditClient).not.toHaveBeenCalled()
})
