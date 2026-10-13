import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import WorkContextControl from '../components/WorkContextControl'

const source = { sourceHash: 'a'.repeat(64), places: [], links: [], parties: [], packages: [], tasks: [], quantities: [] }

it('uses the retained source and one command key after an unknown write outcome', async () => {
  let fail = true
  const api = vi.fn(async (url, options) => { if (options?.method === "POST" && fail) throw new Error('Connection lost'); return source })
  const changed = vi.fn()
  render(<WorkContextControl api={api} jobId="job-1" canEdit onChanged={changed} />)
  await screen.findByText('Nog geen locaties gekoppeld.')
  await userEvent.click(screen.getByRole('button', { name: 'Locatie toevoegen' }))
  await userEvent.type(screen.getByLabelText('Locatienaam'), 'Woning')
  await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
  await screen.findByText('Connection lost')
  expect(screen.getByRole('button', { name: 'Werkdossier verversen' }).disabled).toBe(true)
  fail = false
  await userEvent.click(screen.getByRole('button', { name: 'Dezelfde wijziging opnieuw controleren' }))
  await screen.findByText('Werkdossier bijgewerkt.')
  const writes = api.mock.calls.filter(([, options]) => options?.method === "POST")
  expect(writes).toHaveLength(2)
  expect(writes[0][1].body).toBe(writes[1][1].body)
  expect(JSON.parse(writes[0][1].body).sourceHash).toBe(source.sourceHash)
  expect(changed).toHaveBeenCalledOnce()
})

it('keeps a stale draft for review and permits explicit refresh after a conflict', async () => {
  const api = vi.fn(async (url, options) => { if (options?.method === "POST") throw Object.assign(new Error('Changed'), { status: 409 }); return source })
  render(<WorkContextControl api={api} jobId="job-1" canEdit />)
  await screen.findByText('Nog geen locaties gekoppeld.')
  await userEvent.click(screen.getByRole('button', { name: 'Locatie toevoegen' }))
  await userEvent.type(screen.getByLabelText('Locatienaam'), 'Mijn invoer')
  await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
  await screen.findByText('Changed')
  await userEvent.click(screen.getByRole('button', { name: 'Werkdossier verversen' }))
  await waitFor(() => expect(screen.queryByText('Changed')).toBeNull())
  expect(screen.getByLabelText('Locatienaam').value).toBe('Mijn invoer')
})

it('read-only roles have no edit controls and failed initial reads can retry', async () => {
  const api = vi.fn().mockRejectedValueOnce(new Error('Offline')).mockResolvedValue(source)
  render(<WorkContextControl api={api} jobId="job-1" />)
  await screen.findByText('Offline')
  await userEvent.click(screen.getByRole('button', { name: 'Werkdossier verversen' }))
  await screen.findByText('Nog geen locaties gekoppeld.')
  expect(screen.queryByRole('button', { name: 'Locatie toevoegen' })).toBeNull()
})

it('removes an open editor when the operator becomes read-only', async () => {
  const api = vi.fn().mockResolvedValue(source)
  const { rerender } = render(<WorkContextControl api={api} jobId="job-1" canEdit />)
  await screen.findByText('Nog geen locaties gekoppeld.')
  await userEvent.click(screen.getByRole('button', { name: 'Locatie toevoegen' }))
  expect(screen.getByRole('button', { name: 'Opslaan' })).toBeTruthy()
  rerender(<WorkContextControl api={api} jobId="job-1" canEdit={false} />)
  expect(screen.queryByRole('button', { name: 'Opslaan' })).toBeNull()
})
