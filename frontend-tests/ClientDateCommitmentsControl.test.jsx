import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { expect, it, vi } from 'vitest'
import ClientDateCommitmentsControl from '../components/ClientDateCommitmentsControl'

const source = { type: 'quote', id: 'quote-1', title: 'Offerte quote-1', acceptedAt: '2026-09-24T00:00:00.000Z',
  evidenceReference: 'ondertekende-offerte-17', approvalId: 'approval-1', sourceHash: 'source-hash-1' }
const empty = { jobId: 'job-1', acceptedSources: [source], commitments: [], sourceHash: 'view-hash-1', externalCommitments: 0 }

it('records an explicit contract date from accepted evidence and refreshes the retained register', async () => {
  const user = userEvent.setup(), changed = { ...empty, sourceHash: 'view-hash-2', commitments: [{ entryKey: 'oplevering', revision: 1, status: 'active', dateKind: 'complete_by', date: '2030-04-30', label: 'Oplevering',
    contractWording: 'Uiterlijk 30 april 2030.', evidenceReference: 'offerte pagina 4 artikel 8.1', source, sourceCurrent: true, commitmentHash: 'commitment-hash', recordedAt: '2030-01-01T00:00:00.000Z', recordedBy: 'kantoor', history: [{ revision: 1, date: '2030-04-30', status: 'active', recordedAt: '2030-01-01T00:00:00.000Z', recordedBy: 'kantoor' }] }] }
  const api = vi.fn(async (_url, options) => options ? { ...changed.commitments[0] } : api.mock.calls.filter(([, request]) => request).length ? changed : empty)
  render(<ClientDateCommitmentsControl api={api} jobId="job-1" canEdit />)
  await user.click(await screen.findByRole('button', { name: 'Contractdatum vastleggen' }))
  await user.type(screen.getByLabelText('Mijlpaalsleutel'), 'oplevering')
  await user.selectOptions(screen.getByLabelText('Soort datum'), 'complete_by')
  await user.type(screen.getByLabelText('Datum'), '2030-04-30')
  await user.type(screen.getByLabelText('Mijlpaal'), 'Oplevering')
  await user.type(screen.getByLabelText('Letterlijke contracttekst'), 'Uiterlijk 30 april 2030.')
  await user.type(screen.getByLabelText('Contractdocument en pagina / artikel'), 'offerte pagina 4 artikel 8.1')
  await user.click(screen.getByRole('button', { name: 'Datumversie vastleggen' }))
  await screen.findByText('Contractuele klantdatum is controleerbaar vastgelegd. De planning en klant zijn niet aangepast.')
  const write = JSON.parse(api.mock.calls.find(([, options]) => options)?.[1].body)
  expect(write).toMatchObject({ action: 'record', commandKey: expect.any(String), sourceType: 'quote', sourceId: 'quote-1', acceptedSourceHash: 'source-hash-1', date: '2030-04-30', dateKind: 'complete_by' })
  expect(screen.getByRole('region', { name: 'Contractuele klantdatums' })).toBeTruthy()
}, 15000)

it('does not expose date edits to read-only users and explains the evidence boundary', async () => {
  render(<ClientDateCommitmentsControl api={vi.fn().mockResolvedValue({ ...empty, acceptedSources: [] })} jobId="job-1" canEdit={false} />)
  expect(await screen.findByText(/geen controleerbare geaccepteerde offerte/)).toBeTruthy()
  expect(screen.queryByRole('button', { name: 'Contractdatum vastleggen' })).toBeNull()
  expect(screen.getByText(/Streefdatums, planning en chatberichten zijn geen contractuele toezegging/)).toBeTruthy()
})
