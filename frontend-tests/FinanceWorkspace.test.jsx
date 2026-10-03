import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import FinanceWorkspace from '../components/FinanceWorkspace'
import { operatorText } from '../operator-locale'
import { companyFetch } from '../company-request.mjs'

afterEach(() => vi.unstubAllGlobals())

vi.mock('../components/CashFlowForecastControl', () => ({
  default: ({ request }) => <button onClick={() => request('/api/ledger/cash-flow')}>Fixture cash-flow refresh</button>,
}))

const job = { id: 'job-a', title: 'Retained source title' }
const draftAction = { type: 'draft_invoice' }
const orderAction = { type: 'prepare_purchase_order_package', purchaseOrderId: 'order-a' }
const row = { jobId: job.id, jobTitle: job.title, financeStatus: 'stable', flags: {},
  nextActions: [draftAction, orderAction], latest: { invoice: { data: { issuePackage: { htmlDocumentId: 'private-doc' } } } } }

function props(overrides = {}) {
  return { locale: 'en-GB', finance: { jobs: [row] }, jobs: [job], canCoordinate: true,
    canApprove: true, submitting: false, request: vi.fn().mockResolvedValue({}),
    onDraftInvoice: vi.fn(), onPreparePackage: vi.fn(), onAction: vi.fn(),
    onOpenApprovals: vi.fn(), onOpen: vi.fn(), onCashFlowChange: vi.fn(), ...overrides }
}

describe('separate finance workspace', () => {
  it('retains exact source actions, private downloads and the supplied request boundary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { headers: {
      'X-Contractor-Company': 'finance-fixture',
      'X-Contractor-Ledger': '00000000-0000-0000-0000-000000000001',
    } })))
    await companyFetch('/api/session')
    const supplied = props()
    render(<FinanceWorkspace {...supplied} />)
    fireEvent.click(screen.getByRole('button', { name: `Draft invoice for ${job.title}` }))
    expect(supplied.onDraftInvoice).toHaveBeenCalledWith(row, draftAction)
    fireEvent.click(screen.getByRole('button', { name: `Prepare purchase order package for ${job.title}` }))
    expect(supplied.onPreparePackage).toHaveBeenCalledWith(row, orderAction)
    fireEvent.click(screen.getByRole('button', { name: `Open ${job.title}` }))
    expect(supplied.onOpen).toHaveBeenCalledWith(job)
    const href = screen.getByRole('link', { name: `Download invoice for ${job.title}` }).getAttribute('href')
    expect(href).toContain('/api/ledger/documents/private-doc/issue-package')
    expect(href).toContain('__company=finance-fixture')
    expect(href).toContain('__ledger=00000000-0000-0000-0000-000000000001')
    fireEvent.click(await screen.findByRole('button', { name: 'Fixture cash-flow refresh' }))
    expect(supplied.request).toHaveBeenCalledWith('/api/ledger/cash-flow')
  })

  it('keeps pending approval separate from coordinating actions and preserves retained text in Dutch', () => {
    const pending = { ...row, flags: { approvalRequired: true }, nextActions: [{ type: 'review_finance_approval', approvalId: 'approval-a' }] }
    const supplied = props({ locale: 'nl-NL', text: (key, values) => operatorText('nl-NL', key, values), finance: { jobs: [pending] } })
    render(<FinanceWorkspace {...supplied} />)
    expect(screen.getByRole('heading', { name: 'Financiele gereedheid' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: job.title })).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Draft invoice/ })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Goedkeuring beoordelen' }))
    expect(supplied.onOpenApprovals).toHaveBeenCalledWith({ jobId: job.id, jobTitle: job.title, approvalId: 'approval-a' })
    expect(within(screen.getByTestId('finance-workspace')).queryByRole('button', { name: /Prepare purchase order/ })).toBeNull()
  })
})
