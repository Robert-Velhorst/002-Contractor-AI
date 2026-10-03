import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import ContractorWorkbench from '../components/ContractorWorkbench'
import WorkContextControl from '../components/WorkContextControl'
import WorkDeliveryControl from '../components/WorkDeliveryControl'
import AssetHistoryControl from '../components/AssetHistoryControl'
import InspectionCoverageControl from '../components/InspectionCoverageControl'
import WorkBalanceControl from '../components/WorkBalanceControl'
import ClientDeliveryControl from '../components/ClientDeliveryControl'

it.each([ContractorWorkbench, WorkContextControl, WorkDeliveryControl, AssetHistoryControl,
  InspectionCoverageControl, WorkBalanceControl, ClientDeliveryControl].map(Component => [Component.name, Component]))('cancels the abandoned %s read without starting a write', (_name, Component) => {
  const api = vi.fn(() => new Promise(() => {}))
  const view = render(<Component api={api} jobId="job-cancellation" />)
  expect(api).toHaveBeenCalledTimes(1)
  const options = api.mock.calls[0][1]
  expect(options?.signal).toBeInstanceOf(AbortSignal)
  expect(options.signal.aborted).toBe(false)
  expect(options.method).toBeUndefined()
  view.unmount()
  expect(options.signal.aborted).toBe(true)
  expect(api).toHaveBeenCalledTimes(1)
})

it('a newer workbench refresh cancels the old read and keeps its late failure off the screen', async () => {
  let rejectOld
  const api = vi.fn().mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
    .mockResolvedValue({ actions: [], scope: {}, matchingSummary: {}, pagination: {} })
  const view = render(<ContractorWorkbench api={api} onOpenAction={vi.fn()} />)
  const oldSignal = api.mock.calls[0][1]?.signal
  await act(async () => view.rerender(<ContractorWorkbench api={api} refreshKey="new" onOpenAction={vi.fn()} />))
  expect(oldSignal?.aborted).toBe(true)
  const newSignal = api.mock.calls[1][1].signal
  expect(newSignal).not.toBe(oldSignal)
  expect(newSignal.aborted).toBe(false)
  await act(async () => rejectOld(new Error('Failure from an obsolete read')))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.getByText('No matching work')).toBeTruthy()
  view.unmount()
  expect(newSignal.aborted).toBe(true)
})

it('leaves a pending save independent from abandoned reads without replaying the command', async () => {
  const source = { sourceHash: 'retained', places: [], links: [], parties: [], packages: [], tasks: [], quantities: [] }
  let resolveWrite
  const api = vi.fn((_url, options) => options?.method === 'POST'
    ? new Promise(resolve => { resolveWrite = resolve }) : Promise.resolve(source))
  const changed = vi.fn()
  const view = render(<WorkContextControl api={api} jobId="j" canEdit onChanged={changed} />)
  await userEvent.click(await screen.findByRole('button', { name: 'Locatie toevoegen' }))
  await userEvent.type(screen.getByLabelText('Locatienaam'), 'Woning')
  await userEvent.click(screen.getByRole('button', { name: 'Opslaan' }))
  const writes = api.mock.calls.filter(([, options]) => options?.method === 'POST')
  expect(writes).toHaveLength(1)
  expect(writes[0][1].signal).toBeUndefined()
  expect(JSON.parse(writes[0][1].body).sourceHash).toBe(source.sourceHash)
  view.unmount()
  expect(api.mock.calls[0][1].signal.aborted).toBe(true)
  await act(async () => resolveWrite(source))
  expect(api.mock.calls.filter(([, options]) => options?.method === 'POST')).toHaveLength(1)
  expect(changed).not.toHaveBeenCalled()
})

it('closing the client offer cancels its photo read and suppresses its obsolete failure', async () => {
  const source = { sourceHash: 'retained', offers: [], options: {
    deliveries: [{ id: 'd', title: 'Deur', scope: 'Eerste deur', status: 'retained', current: true, pending: false }],
    accesses: [{ id: 'a', label: 'Klant', expiresAt: '2099-01-01T00:00:00Z' }]
  } }
  let rejectPhotos
  const api = vi.fn(url => url.includes('/conversations/')
    ? new Promise((_resolve, reject) => { rejectPhotos = reject }) : Promise.resolve(source))
  render(<ClientDeliveryControl api={api} jobId="j" canEdit />)
  await userEvent.click(await screen.findByRole('button', { name: 'Aan klant aanbieden' }))
  await userEvent.selectOptions(screen.getByLabelText('Klanttoegang', { exact: true }), 'a')
  const signal = api.mock.calls.find(([url]) => url.includes('/conversations/'))[1].signal
  expect(signal.aborted).toBe(false)
  await userEvent.click(screen.getByRole('button', { name: 'Annuleren' }))
  expect(signal.aborted).toBe(true)
  await act(async () => rejectPhotos(new Error('Obsolete photo failure')))
  expect(screen.queryByRole('alert')).toBeNull()
  expect(screen.queryByRole('form', { name: 'Klantaanbod bewerken' })).toBeNull()
  expect(api.mock.calls.every(([, options]) => !options.method)).toBe(true)
})
