import { act, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import IntakeDialog from '../components/IntakeDialog'
import { readSessionDraft, writeSessionDraft } from '../draft-recovery'

function props(overrides = {}) {
  return { open: true, scope: 'owner:one', enabled: true, submitting: false,
    onClose: vi.fn(), onSave: vi.fn().mockResolvedValue(true), onCreated: vi.fn(), ...overrides }
}

describe('isolated intake input', () => {
  it('does not render dashboard siblings for any of 100 typed characters', async () => {
    const dashboardRender = vi.fn()
    function DashboardSibling() { dashboardRender(); return <div>Dashboard</div> }
    function Dashboard() {
      const [open, setOpen] = useState(true)
      return <><DashboardSibling /><IntakeDialog {...props()} open={open} onClose={() => setOpen(false)} /></>
    }
    render(<Dashboard />)
    const initial = dashboardRender.mock.calls.length
    const title = 'abcdefghij'.repeat(10)
    await userEvent.type(screen.getByLabelText('Job title'), title)
    expect(screen.getByLabelText('Job title').value).toBe(title)
    expect(dashboardRender).toHaveBeenCalledTimes(initial)
  })

  it('preserves all fields in batched input changes and submits the exact current draft once', async () => {
    const input = props()
    render(<IntakeDialog {...input} />)
    act(() => {
      fireEvent.change(screen.getByLabelText('Client name'), { target: { value: 'Client' } })
      fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Kitchen' } })
      fireEvent.change(screen.getByLabelText('Service'), { target: { value: 'Renovation' } })
      fireEvent.change(screen.getByLabelText('Location'), { target: { value: 'Arnhem' } })
      fireEvent.change(screen.getByLabelText('Priority'), { target: { value: 'high' } })
      fireEvent.change(screen.getByLabelText('Scope'), { target: { value: 'Install kitchen' } })
    })
    await userEvent.click(screen.getByRole('button', { name: 'Create intake' }))
    expect(input.onSave).toHaveBeenCalledExactlyOnceWith({ clientName: 'Client', title: 'Kitchen',
      service: 'Renovation', address: 'Arnhem', description: 'Install kitchen', priority: 'high' })
    expect(input.onCreated).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Job title').value).toBe('')
  })

  it('keeps required-field browser validation', async () => {
    const input = props()
    render(<IntakeDialog {...input} />)
    await userEvent.click(screen.getByRole('button', { name: 'Create intake' }))
    expect(input.onSave).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Client name').required).toBe(true)
    expect(screen.getByLabelText('Job title').required).toBe(true)
  })

  it('retains failed saves and permits a later retry', async () => {
    const input = props({ onSave: vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true) })
    render(<IntakeDialog {...input} />)
    fireEvent.change(screen.getByLabelText('Client name'), { target: { value: 'Client' } })
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Retained' } })
    await userEvent.click(screen.getByRole('button', { name: 'Create intake' }))
    expect(screen.getByLabelText('Job title').value).toBe('Retained')
    expect(input.onCreated).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Create intake' }))
    expect(input.onSave).toHaveBeenCalledTimes(2)
    expect(input.onCreated).toHaveBeenCalledOnce()
  })

  it('keeps the draft across close, immediate pagehide and component reload', () => {
    const input = props()
    const view = render(<IntakeDialog {...input} />)
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Unfinished' } })
    view.rerender(<IntakeDialog {...input} open={false} />)
    expect(screen.queryByRole('dialog')).toBeNull()
    act(() => window.dispatchEvent(new Event('pagehide')))
    expect(readSessionDraft(window.sessionStorage, input.scope, 'intake').value.title).toBe('Unfinished')
    view.unmount()
    render(<IntakeDialog {...input} />)
    expect(screen.getByLabelText('Job title').value).toBe('Unfinished')
  })

  it('restores existing intake drafts under the unchanged storage key', () => {
    writeSessionDraft(window.sessionStorage, 'owner:one', 'intake', {
      clientName: 'Existing', title: 'Recovered', service: '', address: '', description: '', priority: 'critical',
    })
    render(<IntakeDialog {...props()} />)
    expect(screen.getByLabelText('Client name').value).toBe('Existing')
    expect(screen.getByLabelText('Job title').value).toBe('Recovered')
    expect(screen.getByLabelText('Priority').value).toBe('critical')
  })

  it('does not carry a previous operator draft across the keyed scope boundary used by the dashboard', () => {
    const input = props()
    const view = render(<IntakeDialog key={input.scope} {...input} />)
    fireEvent.change(screen.getByLabelText('Job title'), { target: { value: 'Private' } })
    view.rerender(<IntakeDialog key="owner:two" {...input} scope="owner:two" />)
    expect(screen.getByLabelText('Job title').value).toBe('')
    expect(readSessionDraft(window.sessionStorage, 'owner:two', 'intake').found).toBe(false)
  })

  it('blocks duplicate submits before the parent can publish its busy state', async () => {
    let finish
    const input = props({ onSave: vi.fn(() => new Promise(resolve => { finish = resolve })) })
    const view = render(<IntakeDialog {...input} />)
    const form = view.container.querySelector('form')
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(input.onSave).toHaveBeenCalledOnce()
    await act(async () => finish(true))
    expect(input.onCreated).toHaveBeenCalledOnce()
  })

  it('disables editing and closing while a save is pending', () => {
    const input = props({ submitting: true })
    const view = render(<IntakeDialog {...input} />)
    expect(view.container.querySelector('fieldset').disabled).toBe(true)
    for (const button of screen.getAllByRole('button')) expect(button.disabled).toBe(true)
    fireEvent.submit(view.container.querySelector('form'))
    expect(input.onSave).not.toHaveBeenCalled()
  })

  it('does not refresh or close a new operator workspace when an old unmounted save resolves', async () => {
    let finish
    const input = props({ onSave: vi.fn(() => new Promise(resolve => { finish = resolve })) })
    const view = render(<IntakeDialog {...input} />)
    fireEvent.submit(view.container.querySelector('form'))
    view.unmount()
    await act(async () => finish(true))
    expect(input.onCreated).not.toHaveBeenCalled()
  })
})
