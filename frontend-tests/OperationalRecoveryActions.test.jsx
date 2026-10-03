import { act, render } from '@testing-library/react'
import { Suspense } from 'react'
import { expect, it, vi } from 'vitest'
import OperationalRecoveryActions from '../components/OperationalRecoveryActions'

const controls = vi.hoisted(() => new Map())
vi.mock('../components/OperationalReplacementPlan', () => ({ default: props => {
  controls.set(`replacement:${props.source.id}`, props); return null
} }))
vi.mock('../components/ClientAppointmentImpact', () => ({ default: props => {
  controls.set(`appointment:${props.source.id}`, props); return null
} }))
vi.mock('../components/WarehouseMaterialRecovery', () => ({ default: props => {
  controls.set(`warehouse:${props.source.id}`, props); return null
} }))
vi.mock('../components/SupplierRecoveryLog', () => ({ default: props => {
  controls.set(`supplier:${props.source.id}`, props); return null
} }))

const sources = [
  { id: 'worker', type: 'worker_availability' },
  { id: 'receipt', type: 'material_receipt' },
  { id: 'shortfall', type: 'material_requirement_shortfall' },
  { id: 'quality', type: 'quality_nonconformance' },
]
async function mount(overrides = {}) {
  controls.clear()
  const props = { api: vi.fn(), canEdit: false, recoveryCase: { sources }, sourceHash: 'current',
    draftScope: 'owner:test', onError: vi.fn(), ...overrides }
  await act(async () => { render(<Suspense fallback={null}><OperationalRecoveryActions {...props} /></Suspense>) })
  return props
}

it('preserves action routing, source identities and shared edit/error context', async () => {
  const props = await mount()
  expect([...controls.keys()].sort()).toEqual([
    'appointment:worker', 'replacement:worker', 'supplier:receipt', 'supplier:shortfall', 'warehouse:shortfall',
  ])
  for (const control of controls.values()) {
    expect(control.api).toBe(props.api)
    expect(control.canEdit).toBe(false)
    expect(control.recoveryCase).toBe(props.recoveryCase)
    expect(control.source).toBe(sources.find(source => source.id === control.source.id))
    expect(control.sourceHash).toBe('current')
    expect(control.draftScope).toBe('owner:test')
    expect(control.onError).toBe(props.onError)
  }
})

it('keeps callback result arity and notices unchanged for every recovery action', async () => {
  const onNotice = vi.fn(), onChanged = vi.fn()
  await mount({ onNotice, onChanged })
  controls.get('replacement:worker').onSubmitted({ approval: { id: 'approval-1' } })
  controls.get('appointment:worker').onSubmitted({ appointmentId: 'appointment-1' })
  const warehouse = { warehouseMaterialIssue: { issueId: 'issue-1' } }
  const updated = { materialAvailabilityUpdated: true }, retained = { materialAvailabilityUpdated: false }
  controls.get('warehouse:shortfall').onSubmitted(warehouse)
  controls.get('supplier:receipt').onSubmitted(updated)
  controls.get('supplier:shortfall').onSubmitted(retained)
  expect(onChanged.mock.calls).toEqual([[], [], [warehouse], [updated], [retained]])
  expect(onNotice.mock.calls.flat()).toEqual([
    'Vervangingsplan wacht op goedkeuring (approval-1); bezetting niet gewijzigd.',
    'Klantimpact vastgelegd; geen bericht verstuurd of afspraak gewijzigd.',
    'Magazijnuitgifte issue-1; aankomst op locatie moet nog worden bevestigd.',
    'Prognose verwerkt; herbeoordeel verstoring en werkplan. Niets verstuurd.',
    'Leveranciersopvolging is brongebonden vastgelegd; er is niets verstuurd.',
  ])
})

it('permits optional completion listeners without manufacturing a write', async () => {
  const { api } = await mount()
  expect(() => controls.get('replacement:worker').onSubmitted({ approvalId: 'approval-2' })).not.toThrow()
  expect(() => controls.get('appointment:worker').onSubmitted({})).not.toThrow()
  expect(() => controls.get('supplier:receipt').onSubmitted({})).not.toThrow()
  expect(api).not.toHaveBeenCalled()
})
