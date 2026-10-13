import { act, fireEvent, render, screen } from '@testing-library/react'
import { lazy, Suspense, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import FinanceActionDialog from '../components/FinanceActionDialog'
import ResourceActionDialog from '../components/ResourceActionDialog'
import DialogLoading from '../components/DialogLoading'
import DialogBoundary from '../components/DialogBoundary'

describe('deferred dashboard dialogs', () => {
  it('keeps exact budget values, required evidence, disabled submission and parent callbacks', () => {
    const submit = vi.fn(event => event.preventDefault()), close = vi.fn()
    const initial = { amount: '1234.50', forecastAmount: '1234.50', notes: '', category: 'general', costCode: 'RETAINED-1', description: 'Verified scope' }
    function Form() {
      const [draft, setDraft] = useState(initial)
      return <FinanceActionDialog financeAction={{ label: 'Budget baseline', item: { money: {}, jobTitle: 'Retained job' }, action: { type: 'create_budget_line' } }}
        financeActionDraft={draft} setFinanceActionDraft={setDraft} closeFinanceControl={close}
        submitFinanceControl={submit} financeControlAmount={1234.5} workers={[]} roundMoney={Math.round} />
    }
    render(<Form />)
    expect(screen.getByLabelText('Budget amount (EUR)').value).toBe('1234.50')
    fireEvent.change(screen.getByLabelText('Budget amount (EUR)'), { target: { value: '1500.25' } })
    expect(screen.getByLabelText('Budget amount (EUR)').value).toBe('1500.25')
    expect(screen.getByRole('button', { name: 'Request approver review' }).disabled).toBe(true)
    const notes = screen.getByLabelText('Internal evidence and notes')
    expect(notes.required).toBe(true)
    fireEvent.change(notes, { target: { value: 'Verified budget evidence' } })
    const save = screen.getByRole('button', { name: 'Request approver review' })
    expect(save.disabled).toBe(false)
    fireEvent.click(save)
    expect(submit).toHaveBeenCalledOnce()
    fireEvent.click(screen.getByRole('button', { name: 'Close finance control' }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('retains material quantity and timestamp edits without changing approval boundaries', () => {
    const change = vi.fn(), submit = vi.fn(event => event.preventDefault())
    const draft = { materialStatus: 'needed', availableQuantity: '2.50', location: 'Warehouse', expectedAvailableAt: '', reference: 'COUNT-1', notes: 'Verified count' }
    render(<ResourceActionDialog resourceAction={{ label: 'Material check', item: { jobTitle: 'Retained job' }, action: { type: 'review_material_status' } }}
      resourceActionDraft={draft} setResourceActionDraft={change} submitResourceControl={submit}
      closeResourceControl={vi.fn()} tradePartners={[]} ot={key => key} />)
    expect(screen.getByLabelText('Verified quantity').value).toBe('2.50')
    fireEvent.change(screen.getByLabelText('Verified quantity'), { target: { value: '3.75' } })
    expect(change).toHaveBeenLastCalledWith({ ...draft, availableQuantity: '3.75' })
    expect(screen.getByLabelText('Verification reference').required).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Record internal evidence' }))
    expect(submit).toHaveBeenCalledOnce()
  })

  it.each(['nl-NL', 'en-GB'])('lets the operator close the loading state in %s', locale => {
    const close = vi.fn()
    render(<DialogLoading locale={locale} title="Retained action" onClose={close} />)
    expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('true')
    expect(screen.getByRole('status')).not.toBeNull()
    fireEvent.click(screen.getByRole('button', { name: locale === 'nl-NL' ? 'Sluiten' : 'Close' }))
    expect(close).toHaveBeenCalledOnce()
  })

  it('unmounts a pending form on close without losing parent drafts or causing an action', async () => {
    let complete
    const renderForm = vi.fn(() => <div>Loaded form</div>)
    const Deferred = lazy(() => new Promise(resolve => { complete = resolve }))
    function Host() {
      const [open, setOpen] = useState(true)
      return <><input aria-label="Retained draft" defaultValue="Evidence stays here" />{open && <Suspense fallback={<DialogLoading locale="en-GB" title="Retained action" onClose={() => setOpen(false)} />}><Deferred /></Suspense>}</>
    }
    render(<Host />)
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await act(async () => complete({ default: renderForm }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(renderForm).not.toHaveBeenCalled()
    expect(screen.getByLabelText('Retained draft').value).toBe('Evidence stays here')
  })

  it('contains a form loading failure while keeping the dashboard and its drafts mounted', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const Deferred = lazy(() => Promise.reject(new Error('Missing chunk')))
      function Host() {
        const [open, setOpen] = useState(true)
        return <><input aria-label="Retained draft" defaultValue="Unsent evidence" />{open && <DialogBoundary locale="en-GB" title="Retained action" onClose={() => setOpen(false)}><Suspense fallback={<DialogLoading locale="en-GB" title="Retained action" onClose={() => setOpen(false)} />}><Deferred /></Suspense></DialogBoundary>}</>
      }
      render(<Host />)
      expect(await screen.findByRole('alert')).toHaveProperty('textContent', 'The form could not load.')
      expect(screen.getByRole('dialog').getAttribute('aria-busy')).toBe('false')
      fireEvent.click(screen.getByRole('button', { name: 'Close' }))
      expect(screen.queryByRole('dialog')).toBeNull()
      expect(screen.getByLabelText('Retained draft').value).toBe('Unsent evidence')
    } finally { consoleError.mockRestore() }
  })
})
