import { act, fireEvent, render, screen } from '@testing-library/react'
import { lazy, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { WorkerEditorDialog, JobLifecycleModalDialog, ApprovalReviewModalDialog } from '../components/OperatorActionDialogs'
import { loadOperatorActionDialogs } from '../dashboard-chunks'
import DeferredActionDialog from '../components/DeferredActionDialog'

const text = (key, variables = {}) => key.replace(/\{(\w+)\}/g, (_, name) => variables[name] ?? `{${name}}`)
const worker = { name: '', role: 'Installer', status: 'available', email: '', phone: '', homeRegion: '', skills: '',
  hourlyRate: '42.50', notes: '' }

describe('on-demand operator action forms', () => {
  it('shares the exact module across all 42 independently rendered forms', async () => {
    const pending = loadOperatorActionDialogs()
    expect(loadOperatorActionDialogs()).toBe(pending)
    const module = await pending
    expect(Object.keys(module)).toHaveLength(42)
    expect(module.WorkerEditorDialog).toBe(WorkerEditorDialog)
    expect(await loadOperatorActionDialogs()).toBe(module)
  })

  it('preserves parent-owned crew input, exact decimal strings, validation and submit/close callbacks', () => {
    const submit = vi.fn(event => event.preventDefault()), close = vi.fn()
    function Form() {
      const [draft, setDraft] = useState(worker)
      return <WorkerEditorDialog workerDraft={draft} setWorkerDraft={setDraft} ot={text}
        saveWorker={submit} closeWorkerEditor={close} submitting={false} />
    }
    render(<Form />)
    const name = screen.getByLabelText('Full name')
    expect(name.required).toBe(true)
    expect(name.minLength).toBe(2)
    fireEvent.change(name, { target: { value: 'Retained worker' } })
    expect(name.value).toBe('Retained worker')
    expect(screen.getByLabelText('Hourly cost rate (EUR)').value).toBe('42.50')
    fireEvent.click(screen.getByRole('button', { name: 'Save retained crew member' }))
    expect(submit).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Close crew member editor' }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('retains the original crew command lock', () => {
    render(<WorkerEditorDialog workerDraft={{ ...worker, name: 'Retained worker' }} setWorkerDraft={vi.fn()} ot={text}
      saveWorker={vi.fn()} closeWorkerEditor={vi.fn()} submitting />)
    expect(screen.getByRole('button', { name: 'Saving...' }).disabled).toBe(true)
  })

  it('keeps lifecycle approval evidence required and blocks short or pending requests', () => {
    const props = { jobLifecycleAction: { mode: 'archive', job: { title: 'Retained job', clientName: 'Client', status: 'completed' } },
      jobLifecycleReason: 'Short', setJobLifecycleReason: vi.fn(), closeJobLifecycle: vi.fn(), submitJobLifecycle: vi.fn(), submitting: false }
    const view = render(<JobLifecycleModalDialog {...props} />)
    expect(screen.getByRole('button', { name: 'Request archive approval' }).disabled).toBe(true)
    view.rerender(<JobLifecycleModalDialog {...props} jobLifecycleReason="Verified completion evidence" submitting />)
    expect(screen.getByRole('button', { name: 'Submitting...' }).disabled).toBe(true)
  })

  it('retains the original exception-evidence requirement rather than treating loaded code as approval', () => {
    render(<ApprovalReviewModalDialog approvalReview={{ status: 'approved', item: { title: 'Current review', targetType: 'assignment',
      data: { requiresExceptionOverride: true } } }}
      approvalReason="" setApprovalReason={vi.fn()} closeApprovalReview={vi.fn()} resolveApproval={vi.fn()}
      submitting={false} ot={text} />)
    expect(screen.getByRole('textbox').required).toBe(true)
    expect(screen.getByRole('button', { name: 'Confirm approval' }).disabled).toBe(true)
  })

  it('closes a pending module without discarding parent input or rendering a late form', async () => {
    let resolve
    const body = vi.fn(() => <div>Loaded action form</div>)
    const Form = lazy(() => new Promise(done => { resolve = done }))
    function Host() {
      const [open, setOpen] = useState(true)
      return <><input aria-label="Parent evidence" defaultValue="Unsent source evidence" />
        {open && <DeferredActionDialog locale="en-GB" title="Retained action" onClose={() => setOpen(false)}><Form /></DeferredActionDialog>}</>
    }
    render(<Host />)
    expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await act(async () => resolve({ default: body }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(body).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Parent evidence').value).toBe('Unsent source evidence')
  })

  it('contains module failure while retaining the parent workspace and close control', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const Form = lazy(() => Promise.reject(new Error('Expected test download failure')))
      function Host() {
        const [open, setOpen] = useState(true)
        return <><input aria-label="Parent evidence" defaultValue="Unsent source evidence" />
          {open && <DeferredActionDialog locale="en-GB" title="Retained action" onClose={() => setOpen(false)}><Form /></DeferredActionDialog>}</>
      }
      render(<Host />)
      expect((await screen.findByRole('alert')).textContent).toBe('The form could not load.')
      expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('false')
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.getByLabelText('Parent evidence').value).toBe('Unsent source evidence')
    } finally { consoleError.mockRestore() }
  })
})
