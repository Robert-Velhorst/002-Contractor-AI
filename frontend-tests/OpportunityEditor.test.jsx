import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import OpportunityEditor from '../components/OpportunityEditor'
import { emptyOpportunityDraft, opportunityPayload } from '../opportunity-draft.mjs'
import { readSessionDraft, writeSessionDraft } from '../draft-recovery'

const ot = (key, variables = {}) => Object.entries(variables).reduce((text, [key, value]) => text.replaceAll(`{${key}}`, String(value)), key)
const emptyApi = vi.fn().mockResolvedValue({ materials: [], catalog: [] })
const props = (overrides = {}) => ({ editor: { mode: 'create', opportunity: null }, scope: 'owner:one', enabled: true,
  api: emptyApi, ot, submitting: false, onClose: vi.fn(), onSave: vi.fn().mockResolvedValue(false), ...overrides })
const fill = (label, value) => fireEvent.change(screen.getByLabelText(label), { target: { value } })

describe('isolated opportunity editor', () => {
  it('keeps 100 input characters out of dashboard sibling renders', async () => {
    const dashboardRender = vi.fn()
    const input = props()
    function DashboardSibling() { dashboardRender(); return <div>Dashboard</div> }
    function Dashboard() {
      const [open, setOpen] = useState(true)
      return <><DashboardSibling />{open ? <OpportunityEditor {...input} onClose={() => setOpen(false)} /> : null}</>
    }
    render(<Dashboard />)
    const initial = dashboardRender.mock.calls.length
    const title = 'abcdefghij'.repeat(10)
    await userEvent.type(screen.getByLabelText('Opportunity title'), title)
    expect(screen.getByLabelText('Opportunity title').value).toBe(title)
    expect(dashboardRender).toHaveBeenCalledTimes(initial)
  }, 30_000)

  it('preserves batched fields and sends their current normalized payload', async () => {
    const input = props()
    render(<OpportunityEditor {...input} />)
    act(() => {
      fill('Client name', 'Client')
      fill('Opportunity title', 'Kitchen')
      fill('Company', 'Client BV')
      fill('Estimated value', '1234.50')
      fill('Scope and qualification notes', 'Keep the scope')
      fill('City', 'Arnhem')
      fill('Stage', 'proposal')
    })
    await userEvent.click(screen.getByRole('button', { name: 'Retain opportunity' }))
    expect(input.onSave).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ title: 'Kitchen', clientName: 'Client',
      company: 'Client BV', estimatedValue: 1234.5, description: 'Keep the scope', city: 'Arnhem', stage: 'proposal', probabilityPercent: 65,
      capacityForecast: null, materialForecast: null }))
    expect(input.onClose).not.toHaveBeenCalled()
  })

  it('retains browser required-field validation', async () => {
    const input = props()
    render(<OpportunityEditor {...input} />)
    fill('Opportunity title', 'Kitchen')
    await userEvent.click(screen.getByRole('button', { name: 'Retain opportunity' }))
    expect(input.onSave).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Client name').required).toBe(true)
  })

  it('hydrates an existing draft under the unchanged opportunity storage key and flushes recent typing', () => {
    const input = props()
    writeSessionDraft(window.sessionStorage, input.scope, 'opportunity', { ...emptyOpportunityDraft(), title: 'Existing draft', clientName: 'Client' })
    render(<OpportunityEditor {...input} />)
    expect(screen.getByLabelText('Opportunity title').value).toBe('Existing draft')
    fill('Opportunity title', 'Latest committed draft')
    act(() => window.dispatchEvent(new Event('pagehide')))
    expect(readSessionDraft(window.sessionStorage, input.scope, 'opportunity').value.title).toBe('Latest committed draft')
  })

  it('resets draft ownership across the keyed company/operator boundary', () => {
    const input = props()
    const view = render(<OpportunityEditor key={input.scope} {...input} />)
    fill('Opportunity title', 'Private')
    view.rerender(<OpportunityEditor key="owner:two" {...input} scope="owner:two" />)
    expect(screen.getByLabelText('Opportunity title').value).toBe('')
    expect(readSessionDraft(window.sessionStorage, 'owner:two', 'opportunity').found).toBe(false)
  })

  it('keeps drafts after a failed save and permits retry without an unhandled rejection', async () => {
    const input = props({ onSave: vi.fn().mockRejectedValueOnce(new Error('Save failed')).mockResolvedValueOnce(false) })
    render(<OpportunityEditor {...input} />)
    fill('Client name', 'Client')
    fill('Opportunity title', 'Keep this')
    await userEvent.click(screen.getByRole('button', { name: 'Retain opportunity' }))
    expect(screen.getByRole('alert').textContent).toBe('Save failed')
    expect(screen.getByLabelText('Opportunity title').value).toBe('Keep this')
    await userEvent.click(screen.getByRole('button', { name: 'Retain opportunity' }))
    expect(input.onSave).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('blocks duplicate saves, editing and closing before the parent publishes its busy state', async () => {
    let finish
    const input = props({ onSave: vi.fn(() => new Promise(resolve => { finish = resolve })) })
    const view = render(<OpportunityEditor {...input} />)
    fill('Opportunity title', 'Current')
    fireEvent.submit(view.container.querySelector('form'))
    fireEvent.submit(view.container.querySelector('form'))
    expect(input.onSave).toHaveBeenCalledOnce()
    expect(view.container.querySelector('fieldset').disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Close opportunity' }).disabled).toBe(true)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(input.onClose).not.toHaveBeenCalled()
    await act(async () => finish(false))
    expect(view.container.querySelector('fieldset').disabled).toBe(false)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(input.onClose).toHaveBeenCalledOnce()
  })

  it('shows parent save errors inside the modal without clearing input', () => {
    const input = props()
    const view = render(<OpportunityEditor {...input} />)
    fill('Opportunity title', 'Retained')
    view.rerender(<OpportunityEditor {...input} error="Ledger denied this change" />)
    expect(screen.getByRole('alert').textContent).toBe('Ledger denied this change')
    expect(screen.getByLabelText('Opportunity title').value).toBe('Retained')
  })

  it('aborts parallel catalog reads on close and ignores late successes and failures', async () => {
    const requests = []
    const api = vi.fn((path, { signal }) => new Promise((resolve, reject) => requests.push({ path, signal, resolve, reject })))
    const view = render(<OpportunityEditor {...props({ api })} />)
    expect(requests.map(item => item.path)).toEqual(['/api/ledger/material-stock/catalog', '/api/ledger/qualifications/catalog'])
    expect(requests.every(item => !item.signal.aborted)).toBe(true)
    view.unmount()
    expect(requests.every(item => item.signal.aborted)).toBe(true)
    await act(async () => { requests[0].resolve({ materials: [] }); requests[1].reject(new Error('Obsolete failure')) })
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('cancels remaining catalog work if one catalog fails while leaving ordinary input usable', async () => {
    const requests = []
    const api = vi.fn((path, { signal }) => new Promise((resolve, reject) => requests.push({ path, signal, resolve, reject })))
    render(<OpportunityEditor {...props({ api })} />)
    await act(async () => requests[0].reject(new Error('Catalog unavailable')))
    expect(screen.getByRole('alert').textContent).toBe('Catalog unavailable')
    expect(requests.every(item => item.signal.aborted)).toBe(true)
    fill('Opportunity title', 'Still usable')
    expect(screen.getByLabelText('Opportunity title').value).toBe('Still usable')
  })

  it('preserves edit-only client and won-stage restrictions with independent form state', async () => {
    const opportunity = { title: 'Won work', stage: 'won', probabilityPercent: 100, client: { name: 'Verified client' } }
    render(<OpportunityEditor {...props({ editor: { mode: 'edit', opportunity } })} />)
    await waitFor(() => expect(screen.getByLabelText('Opportunity title').value).toBe('Won work'))
    expect(screen.getByLabelText('Client name').disabled).toBe(true)
    expect(screen.getByLabelText('Stage').disabled).toBe(true)
    expect(screen.getByRole('slider').disabled).toBe(true)
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeTruthy()
  })
})

describe('opportunity draft contract', () => {
  it('normalizes numbers and optional dates without changing input values', () => {
    const draft = { ...emptyOpportunityDraft(), estimatedValue: '100.25', probabilityPercent: '65' }
    const payload = opportunityPayload(draft)
    expect(payload).toMatchObject({ estimatedValue: 100.25, probabilityPercent: 65, capacityForecast: null, materialForecast: null,
      targetDecisionAt: null, nextFollowUpAt: null })
    expect(draft.estimatedValue).toBe('100.25')
  })

  it('roundtrips qualifications, skills, daily demand, supervision and material forecasts', () => {
    const forecast = { windowStart: '2026-11-02', windowEnd: '2026-11-06', trades: [{ role: 'Installer', hours: 32,
      requiredQualifications: ['vca'], requiredSkills: ['Dutch', 'Carpentry'], dailyDemand: [{ date: '2026-11-02', hours: 8 }],
      supervision: { role: 'Foreman', workersPerSupervisor: 5, requiredQualifications: ['vca-vol'],
        dailyDemand: [{ date: '2026-11-02', crewSize: 10, supervisorShiftHours: 8 }] } }] }
    const materials = [{ materialId: 'door', quantity: 2, unit: 'piece' }]
    const draft = emptyOpportunityDraft({ data: { capacityForecast: forecast, materialForecast: materials } })
    const payload = opportunityPayload(draft)
    expect(payload.capacityForecast).toEqual(forecast)
    expect(payload.materialForecast).toEqual(materials)
    expect(payload).not.toHaveProperty('capacityTrades')
    draft.capacityTrades[0].supervision.dailyDemand[0].crewSize = '11'
    expect(forecast.trades[0].supervision.dailyDemand[0].crewSize).toBe(10)
  })

  it('drops incomplete demand and material rows while preserving qualified trade rows', () => {
    const draft = emptyOpportunityDraft()
    draft.capacityWindowStart = '2026-11-02'
    draft.capacityWindowEnd = '2026-11-06'
    draft.capacityTrades = [{ role: 'Installer', hours: '8', requiredSkillsText: ' Dutch, , Carpentry ', requiredQualifications: [],
      dailyDemand: [{ date: '2026-11-02', hours: '8' }, { date: '', hours: '4' }], supervision: null },
    { role: '', hours: '', dailyDemand: [] }]
    draft.materialForecast = [{ materialId: 'door', quantity: '2', unit: 'piece' }, { materialId: '', quantity: '3' }]
    expect(opportunityPayload(draft)).toMatchObject({ capacityForecast: { trades: [{ role: 'Installer', hours: 8,
      requiredSkills: ['Dutch', 'Carpentry'], dailyDemand: [{ date: '2026-11-02', hours: 8 }] }] },
    materialForecast: [{ materialId: 'door', quantity: 2, unit: 'piece' }] })
  })
})
