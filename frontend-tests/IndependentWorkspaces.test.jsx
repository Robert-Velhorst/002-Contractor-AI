import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { loadAutomation, loadCapabilitySetup, loadClients } from '../dashboard-chunks'
import * as dashboardChunks from '../dashboard-chunks'

vi.mock('../components/JobWorkspaceControls', () => {
  throw new Error('Independent screens must not evaluate the aggregate dossier module.')
})

describe('independent workspace modules', () => {
  it.each([
    ['clients', loadClients], ['automation', loadAutomation], ['setup', loadCapabilitySetup],
    ['pipeline', dashboardChunks.loadPipeline], ['bid packages', dashboardChunks.loadBidPackages],
    ['portfolio schedule', dashboardChunks.loadSchedule], ['dispatch', dashboardChunks.loadDispatch],
    ['finance dialog', dashboardChunks.loadFinanceActionDialog], ['resource dialog', dashboardChunks.loadResourceActionDialog],
  ])('loads and caches the %s screen without importing the aggregate dossier module', async (_name, load) => {
    const pending = load()
    expect(load()).toBe(pending)
    const module = await pending
    expect(typeof module.default).toBe('function')
    expect(await load()).toBe(module)
  })

  it.each(['CloseoutRegister', 'CommercialControl', 'DayworkControl',
    'FieldAssuranceWorkspace', 'FieldRiskControl', 'InspectionChecklistControl',
    'NonconformanceControl', 'PhotoEvidenceControl', 'ProductionControl',
    'ProjectControls', 'TakeoffControl', 'WorkPlanControl'])('loads and caches %s directly without evaluating the compatibility module', async name => {
    const load = dashboardChunks[`load${name}`]
    const pending = load()
    expect(load()).toBe(pending)
    const module = await pending
    expect(typeof module.default).toBe('function')
    expect(module[name]).toBe(module.default)
    expect(await load()).toBe(module)
  })

  it('retains client directory search, edit authority and existing client identifiers', async () => {
    const { default: ClientsWorkspace } = await loadClients()
    const onEdit = vi.fn(), onCreate = vi.fn(), onOpen = vi.fn()
    const client = { id: 'client-retained', name: 'Retained client', email: 'client@example.test' }
    const props = { directory: { clients: [client] }, locale: 'en-GB', canCoordinate: false,
      onEditClient: onEdit, onCreateClient: onCreate, onOpen, submitting: false }
    const view = render(<ClientsWorkspace {...props} />)
    fireEvent.click(screen.getByRole('tab', { name: /^Directory/ }))
    expect(screen.getByText('Retained client')).not.toBeNull()
    expect(screen.queryByRole('button', { name: 'New client' })).toBeNull()
    expect(onEdit).not.toHaveBeenCalled()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search clients' }), { target: { value: 'missing' } })
    expect(screen.queryByText('Retained client')).toBeNull()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search clients' }), { target: { value: 'Retained' } })
    view.rerender(<ClientsWorkspace {...props} canCoordinate />)
    fireEvent.click(screen.getByRole('button', { name: 'Edit client' }))
    expect(onEdit).toHaveBeenCalledWith(client)
  })

  it('keeps safe setup selection separate from manual evidence and never writes on loading', async () => {
    const { default: CapabilitySetupControl } = await loadCapabilitySetup()
    const onApply = vi.fn().mockResolvedValue({ retained: true })
    const job = { id: 'job-retained', capabilities: [{ label: 'Safety', requirements: [
      { key: 'internal', label: 'Internal draft', safeDraftable: true },
      { key: 'manual', label: 'Verified permit', safeDraftable: false },
    ] }] }
    const props = { job, onApply, locale: 'en-GB', submitting: false }
    const view = render(<CapabilitySetupControl {...props} canCoordinate={false} />)
    expect(screen.getByRole('checkbox').disabled).toBe(true)
    expect(onApply).not.toHaveBeenCalled()
    view.rerender(<CapabilitySetupControl {...props} canCoordinate />)
    fireEvent.click(screen.getByRole('button', { name: 'Select safe drafts' }))
    fireEvent.click(screen.getByTestId('apply-capability-setup'))
    await waitFor(() => expect(onApply).toHaveBeenCalledWith(['internal']))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('manual-capability-manual')).not.toBeNull()
  })

  it('automation selects only unblocked internal drafts and leaves consequential actions unselected', async () => {
    const { default: AutomationControl } = await loadAutomation()
    const onSelectVisible = vi.fn(), onRun = vi.fn(), onApply = vi.fn()
    render(<AutomationControl jobs={[]} selectedIds={[]} view="all" onSelectVisible={onSelectVisible}
      onRun={onRun} onApply={onApply} commandPlan={{ actions: [
        { id: 'safe', title: 'Retained internal draft', safeDraftable: true },
        { id: 'blocked', title: 'Blocked draft', safeDraftable: true, blocked: true },
        { id: 'approval', title: 'Supplier commitment', requiresApproval: true },
      ] }} />)
    expect(onRun).not.toHaveBeenCalled()
    expect(onApply).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Select safe' }))
    expect(onSelectVisible).toHaveBeenCalledWith(['safe'])
  })
})
