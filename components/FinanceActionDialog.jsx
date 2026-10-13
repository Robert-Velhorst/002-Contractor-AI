import { ShieldCheck, X } from "lucide-react"
import { currency, formatDate, formatStatus, futureDateInput } from "../dashboard-format"

export default function FinanceActionDialog({
  financeAction,
  closeFinanceControl,
  submitFinanceControl,
  financeActionDraft,
  setFinanceActionDraft,
  financeCreditTaxRate,
  financeControlAmount,
  financeCreditTax,
  financeCreditTotal,
  financeSupplierTax,
  financeSupplierTotal,
  financeControlHours,
  workers,
  financeControlExpense,
  roundMoney,
  submitting,
}) {
  return (
    <div className="modal-backdrop" role="presentation">
          <section
            className="modal finance-control-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finance-control-title"
            data-testid="finance-control-modal"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Retained finance control</p>
                <h2 id="finance-control-title">{financeAction.label}</h2>
                <p>
                  {financeAction.item.jobTitle} / {financeAction.item.clientName || 'Client finance record'}
                </p>
              </div>
              <button className="icon-button" aria-label="Close finance control" onClick={closeFinanceControl}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitFinanceControl}>
              <div className="form-grid">
                <div className="field-record-context form-span">
                  <span>Ledger context</span>
                  <strong>{formatStatus(financeAction.item.financeStatus)}</strong>
                  <p>
                    Contract {currency.format(financeAction.item.money?.contractValue || 0)} / unpaid{' '}
                    {currency.format(financeAction.item.money?.unpaidValue || 0)} / received{' '}
                    {currency.format(financeAction.item.money?.receivedValue || 0)}
                  </p>
                </div>

                {financeAction.action.type === 'request_expense_reversal' ? (
                  <div className="invoice-preview form-span" aria-label="Expense reversal context">
                    <span>
                      Receipt <strong>{financeAction.action.receiptReference || financeAction.action.expenseId}</strong>
                    </span>
                    <span>
                      Vendor <strong>{financeAction.action.vendor || 'Retained vendor'}</strong>
                    </span>
                    <span>
                      Gross total <strong>{currency.format(financeAction.action.totalAmount || 0)}</strong>
                    </span>
                    <span>
                      Recognized cost <strong>{currency.format(financeAction.action.amount || 0)}</strong>
                    </span>
                  </div>
                ) : null}

                {financeAction.action.type === 'create_credit_note' ? (
                  <>
                    <label>
                      Net credit amount (EUR)
                      <input
                        required
                        type="number"
                        min="0.01"
                        max={financeAction.action.availableNetAmount || undefined}
                        step="0.01"
                        value={financeActionDraft.amount}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, amount: event.target.value })}
                      />
                    </label>
                    <label>
                      VAT rate (%)
                      <input readOnly value={financeCreditTaxRate} />
                    </label>
                    <label className="form-span">
                      Credit-line description
                      <input
                        maxLength={500}
                        value={financeActionDraft.description}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, description: event.target.value })}
                        placeholder={`Correction for invoice ${financeAction.action.invoiceReference || ''}`}
                      />
                    </label>
                    <div className="invoice-preview form-span" aria-label="Credit note calculation">
                      <span>
                        Net credit <strong>{currency.format(financeControlAmount)}</strong>
                      </span>
                      <span>
                        VAT correction <strong>{currency.format(financeCreditTax)}</strong>
                      </span>
                      <span>
                        Total credit <strong>{currency.format(financeCreditTotal)}</strong>
                      </span>
                    </div>
                    <p className="workflow-note form-span">
                      Available invoice balance: {currency.format(financeAction.action.availableAmount || 0)}. The draft reserves that
                      amount against concurrent payment or credit requests; only approved immutable package preparation reduces the
                      receivable. Delivery and Peppol transport remain separately gated.
                    </p>
                  </>
                ) : null}

                {financeAction.action.type === 'record_supplier_invoice' ? (
                  <>
                    <label>
                      Supplier
                      <input
                        required
                        maxLength={240}
                        value={financeActionDraft.vendor}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, vendor: event.target.value })}
                      />
                    </label>
                    <label>
                      Supplier invoice number
                      <input
                        required
                        maxLength={120}
                        value={financeActionDraft.invoiceNumber}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, invoiceNumber: event.target.value })}
                      />
                    </label>
                    <label>
                      Invoice date
                      <input
                        required
                        type="date"
                        value={financeActionDraft.invoiceDate}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, invoiceDate: event.target.value })}
                      />
                    </label>
                    <label>
                      Due date
                      <input
                        required
                        type="date"
                        min={financeActionDraft.invoiceDate}
                        value={financeActionDraft.dueAt}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, dueAt: event.target.value })}
                      />
                    </label>
                    <label>
                      Net amount (EUR)
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={financeActionDraft.amount}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, amount: event.target.value })}
                      />
                    </label>
                    <label>
                      VAT amount (EUR)
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={financeActionDraft.taxAmount}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, taxAmount: event.target.value })}
                      />
                    </label>
                    {financeAction.action.materialReceipts?.length ? (
                      <label className="form-span">
                        Retained goods receipt
                        <select
                          value={financeActionDraft.materialReceiptId}
                          onChange={(event) => {
                            const receipt = financeAction.action.materialReceipts.find((item) => item.id === event.target.value)
                            setFinanceActionDraft({
                              ...financeActionDraft,
                              materialReceiptId: event.target.value,
                              deliveryReference: receipt?.receiptReference || financeActionDraft.deliveryReference,
                            })
                          }}
                        >
                          <option value="">Use service or other retained evidence</option>
                          {financeAction.action.materialReceipts.map((receipt) => (
                            <option key={receipt.id} value={receipt.id} disabled={receipt.status !== 'received'}>
                              {receipt.receiptReference} / {formatDate(receipt.deliveredAt)} / {formatStatus(receipt.status)}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : null}
                    <label className="form-span">
                      Delivery or service evidence reference
                      <input
                        required={!financeActionDraft.materialReceiptId}
                        maxLength={240}
                        value={financeActionDraft.deliveryReference}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, deliveryReference: event.target.value })}
                        placeholder="Goods receipt, signed work ticket, or retained document reference"
                      />
                    </label>
                    <div className="invoice-preview form-span" aria-label="Supplier invoice calculation">
                      <span>
                        Purchase commitment <strong>{currency.format(financeAction.action.committedAmount || 0)}</strong>
                      </span>
                      <span>
                        Net invoice <strong>{currency.format(financeControlAmount)}</strong>
                      </span>
                      <span>
                        VAT <strong>{currency.format(financeSupplierTax)}</strong>
                      </span>
                      <span>
                        Total payable <strong>{currency.format(financeSupplierTotal)}</strong>
                      </span>
                    </div>
                    <p className="workflow-note form-span">
                      A current retained goods receipt enables a verified three-way match. Free-text service evidence is retained as an
                      explicit matching exception. Supplier, currency, amount, duplicate invoice, and compliance checks still apply.
                    </p>
                  </>
                ) : null}

                {financeAction.action.type === 'record_supplier_payment' ? (
                  <>
                    <div className="field-record-context form-span">
                      <span>Supplier payable</span>
                      <strong>{financeAction.action.supplierInvoiceNumber || financeAction.action.supplierInvoiceId}</strong>
                      <p>
                        {financeAction.action.supplier || 'Retained supplier'} / available{' '}
                        {currency.format(financeAction.action.availableAmount || financeAction.action.outstandingAmount || 0)}
                      </p>
                    </div>
                    <label>
                      Payment amount (EUR)
                      <input
                        required
                        type="number"
                        min="0.01"
                        max={financeAction.action.availableAmount || financeAction.action.outstandingAmount || undefined}
                        step="0.01"
                        value={financeActionDraft.amount}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, amount: event.target.value })}
                      />
                    </label>
                    <label>
                      Payment date
                      <input
                        required
                        type="date"
                        value={financeActionDraft.paidAt}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, paidAt: event.target.value })}
                      />
                    </label>
                    <label>
                      Payment method
                      <select
                        value={financeActionDraft.method}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, method: event.target.value })}
                      >
                        <option value="bank_transfer">Bank transfer</option>
                        <option value="direct_debit">Direct debit</option>
                        <option value="card">Card</option>
                        <option value="cash">Cash</option>
                        <option value="other">Other retained evidence</option>
                      </select>
                    </label>
                    <label>
                      Bank or bookkeeping reference
                      <input
                        required
                        maxLength={240}
                        value={financeActionDraft.reference}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, reference: event.target.value })}
                      />
                    </label>
                    <p className="workflow-note form-span">
                      This confirms evidence of a payment made outside Contractor.AI. Approval is required before the payable balance
                      changes; this action cannot initiate or schedule funds movement.
                    </p>
                  </>
                ) : null}

                {financeAction.action.type === 'record_payment_reconciliation' ? (
                  <>
                    <label>
                      Reconciliation type
                      <select
                        value={financeActionDraft.outcome}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, outcome: event.target.value })}
                      >
                        <option value="received">Payment received</option>
                        <option value="written_off">Approved write-off request</option>
                      </select>
                    </label>
                    <label>
                      Settlement amount (EUR)
                      <input
                        required
                        type="number"
                        min="0.01"
                        max={financeAction.action.availableAmount || financeAction.action.outstandingAmount || undefined}
                        step="0.01"
                        value={financeActionDraft.amount}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, amount: event.target.value })}
                      />
                    </label>
                    {financeActionDraft.outcome === 'received' ? (
                      <>
                        <label>
                          Received date
                          <input
                            required
                            type="date"
                            value={financeActionDraft.paidAt}
                            onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, paidAt: event.target.value })}
                          />
                        </label>
                        <label>
                          Payment method
                          <select
                            value={financeActionDraft.method}
                            onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, method: event.target.value })}
                          >
                            <option value="bank_transfer">Bank transfer</option>
                            <option value="card">Card</option>
                            <option value="cash">Cash</option>
                            <option value="direct_debit">Direct debit</option>
                            <option value="other">Other retained evidence</option>
                          </select>
                        </label>
                      </>
                    ) : null}
                    <label className="form-span">
                      Payment or authority reference
                      <input
                        required
                        maxLength={240}
                        value={financeActionDraft.reference}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, reference: event.target.value })}
                        placeholder="Bank statement ID or approved write-off authority"
                      />
                    </label>
                    <p className="workflow-note form-span">
                      Available to reconcile:{' '}
                      {currency.format(financeAction.action.availableAmount || financeAction.action.outstandingAmount || 0)}. Approval
                      updates the invoice to partially paid, paid, or settled; duplicate references and overpayments are refused.
                    </p>
                  </>
                ) : null}

                {financeAction.action.type === 'record_payment_follow_up' ? (
                  <>
                    <label>
                      Outcome
                      <select
                        value={financeActionDraft.outcome}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, outcome: event.target.value })}
                      >
                        <option value="follow_up_recorded">Internal collection note</option>
                        <option value="received">Confirm payment received</option>
                        <option value="written_off">Request write-off</option>
                      </select>
                    </label>
                    <label>
                      Receivable amount (EUR)
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={financeActionDraft.amount}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, amount: event.target.value })}
                      />
                    </label>
                    <label>
                      Next follow-up date
                      <input
                        required
                        type="date"
                        value={financeActionDraft.dueAt}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, dueAt: event.target.value })}
                      />
                    </label>
                    <label>
                      Internal channel
                      <select
                        value={financeActionDraft.followUpChannel}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, followUpChannel: event.target.value })}
                      >
                        <option value="internal">Internal review</option>
                        <option value="phone">Phone evidence</option>
                        <option value="email">Email evidence</option>
                        <option value="portal">Portal evidence</option>
                      </select>
                    </label>
                    {financeActionDraft.outcome !== 'follow_up_recorded' ? (
                      <label className="form-span">
                        Payment or authority reference
                        <input
                          required
                          value={financeActionDraft.reference}
                          onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, reference: event.target.value })}
                          placeholder="Bank reference, statement ID, or approved write-off authority"
                        />
                      </label>
                    ) : null}
                  </>
                ) : null}

                {financeAction.action.type === 'prepare_finance_handoff' ? (
                  <>
                    <label>
                      Bookkeeping target
                      <select
                        value={financeActionDraft.targetSystem}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, targetSystem: event.target.value })}
                      >
                        <option value="FAB">FAB</option>
                        <option value="Exact Online">Exact Online</option>
                        <option value="Twinfield">Twinfield</option>
                        <option value="AFAS">AFAS</option>
                        <option value="Internal accounting">Internal accounting</option>
                      </select>
                    </label>
                    <label>
                      Package format
                      <select
                        value={financeActionDraft.exportFormat}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, exportFormat: event.target.value })}
                      >
                        <option value="json">Structured JSON</option>
                        <option value="csv">CSV package</option>
                        <option value="ubl">UBL metadata</option>
                      </select>
                    </label>
                  </>
                ) : null}

                {financeAction.action.type === 'record_time_expense' ? (
                  <>
                    <label>
                      Record date
                      <input
                        required
                        type="date"
                        max={futureDateInput(0)}
                        value={financeActionDraft.dueAt}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, dueAt: event.target.value })}
                      />
                    </label>
                    <label>
                      Cost code
                      <input
                        value={financeActionDraft.costCode}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, costCode: event.target.value })}
                      />
                    </label>
                    <label>
                      Hours
                      <input
                        type="number"
                        min="0"
                        max="24"
                        step="0.25"
                        value={financeActionDraft.hours}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, hours: event.target.value })}
                      />
                    </label>
                    {financeControlHours > 0 ? (
                      <label>
                        Worker
                        <select
                          required
                          value={financeActionDraft.workerId}
                          onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, workerId: event.target.value })}
                        >
                          <option value="">Select active worker</option>
                          {workers
                            .filter((worker) => !['retired', 'inactive'].includes(worker.status))
                            .map((worker) => (
                              <option key={worker.id} value={worker.id}>
                                {worker.name} / {worker.role || formatStatus(worker.status)}
                              </option>
                            ))}
                        </select>
                      </label>
                    ) : null}
                    <label>
                      Hourly rate (EUR)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={financeActionDraft.rate}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, rate: event.target.value })}
                      />
                    </label>
                    <label>
                      Expense amount (EUR)
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={financeActionDraft.expenseAmount}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, expenseAmount: event.target.value })}
                      />
                    </label>
                    <label>
                      Expense category
                      <select
                        value={financeActionDraft.category}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, category: event.target.value })}
                      >
                        <option value="materials">Materials</option>
                        <option value="equipment">Equipment</option>
                        <option value="subcontractor">Subcontractor</option>
                        <option value="travel">Travel</option>
                        <option value="general">General</option>
                      </select>
                    </label>
                    {financeControlExpense > 0 ? (
                      <>
                        <label>
                          Vendor
                          <input
                            required
                            value={financeActionDraft.vendor}
                            onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, vendor: event.target.value })}
                          />
                        </label>
                        <label>
                          Receipt reference
                          <input
                            required
                            minLength="3"
                            maxLength="240"
                            value={financeActionDraft.reference}
                            onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, reference: event.target.value })}
                          />
                        </label>
                        <label>
                          VAT amount (EUR)
                          <input
                            required
                            type="number"
                            min="0"
                            max={financeActionDraft.expenseAmount || undefined}
                            step="0.01"
                            value={financeActionDraft.taxAmount}
                            onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, taxAmount: event.target.value })}
                          />
                        </label>
                        <label>
                          VAT treatment
                          <select
                            value={financeActionDraft.taxTreatment}
                            onChange={(event) => setFinanceActionDraft({
                              ...financeActionDraft,
                              taxTreatment: event.target.value,
                              taxAmount: ['exempt', 'reverse_charge'].includes(event.target.value) ? '0' : financeActionDraft.taxAmount,
                            })}
                          >
                            <option value="recoverable">Recoverable VAT</option>
                            <option value="non_recoverable">Non-recoverable VAT</option>
                            <option value="exempt">VAT exempt</option>
                            <option value="reverse_charge">Reverse charge</option>
                          </select>
                        </label>
                        <label>
                          Payment method
                          <select value={financeActionDraft.paymentMethod} onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, paymentMethod: event.target.value })}>
                            <option value="company_card">Company card</option>
                            <option value="personal_card">Personal card</option>
                            <option value="cash">Cash</option>
                            <option value="bank_transfer">Bank transfer</option>
                            <option value="direct_debit">Direct debit</option>
                            <option value="other">Other</option>
                          </select>
                        </label>
                      </>
                    ) : null}
                  </>
                ) : null}

                {financeAction.action.type === 'create_budget_line' ? (
                  <>
                    <label>
                      Budget amount (EUR)
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={financeActionDraft.amount}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, amount: event.target.value })}
                      />
                    </label>
                    <label>
                      Forecast amount (EUR)
                      <input
                        required
                        type="number"
                        min="0"
                        step="0.01"
                        value={financeActionDraft.forecastAmount}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, forecastAmount: event.target.value })}
                      />
                    </label>
                    <label>
                      Cost code
                      <input
                        required
                        value={financeActionDraft.costCode}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, costCode: event.target.value })}
                      />
                    </label>
                    <label>
                      Category
                      <select
                        value={financeActionDraft.category}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, category: event.target.value })}
                      >
                        <option value="general">General</option>
                        <option value="labor">Labor</option>
                        <option value="materials">Materials</option>
                        <option value="equipment">Equipment</option>
                        <option value="subcontractor">Subcontractor</option>
                      </select>
                    </label>
                    <label className="form-span">
                      Budget description
                      <input
                        required
                        value={financeActionDraft.description}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, description: event.target.value })}
                      />
                    </label>
                  </>
                ) : null}

                {financeAction.action.type === 'create_billing_milestone' ? (
                  <>
                    <label>
                      Net milestone (EUR)
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={financeActionDraft.amount}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, amount: event.target.value })}
                      />
                    </label>
                    <label>
                      VAT rate (%)
                      <input
                        required
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={financeActionDraft.taxRate}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, taxRate: event.target.value })}
                      />
                    </label>
                    <label>
                      Planned invoice date
                      <input
                        required
                        type="date"
                        value={financeActionDraft.plannedIssueAt}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, plannedIssueAt: event.target.value })}
                      />
                    </label>
                    <label>
                      Payment due date
                      <input
                        required
                        type="date"
                        value={financeActionDraft.dueAt}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, dueAt: event.target.value })}
                      />
                    </label>
                    <label className="form-span">
                      Milestone description
                      <input
                        required
                        value={financeActionDraft.description}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, description: event.target.value })}
                      />
                    </label>
                    <div className="invoice-preview form-span" aria-label="Billing milestone calculation">
                      <span>
                        Net <strong>{currency.format(financeControlAmount)}</strong>
                      </span>
                      <span>
                        VAT{' '}
                        <strong>
                          {currency.format(roundMoney((financeControlAmount * (Number(financeActionDraft.taxRate) || 0)) / 100))}
                        </strong>
                      </span>
                      <span>
                        Total{' '}
                        <strong>
                          {currency.format(roundMoney(financeControlAmount * (1 + (Number(financeActionDraft.taxRate) || 0) / 100)))}
                        </strong>
                      </span>
                    </div>
                  </>
                ) : null}

                {financeAction.action.type === 'create_draw_request' ? (
                  <>
                    <label>
                      Draw amount (EUR)
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={financeActionDraft.amount}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, amount: event.target.value })}
                      />
                    </label>
                    <label>
                      Work complete (%)
                      <input
                        required
                        type="number"
                        min="0"
                        max="100"
                        step="1"
                        value={financeActionDraft.percentComplete}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, percentComplete: event.target.value })}
                      />
                    </label>
                    <label>
                      Review due date
                      <input
                        required
                        type="date"
                        value={financeActionDraft.dueAt}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, dueAt: event.target.value })}
                      />
                    </label>
                  </>
                ) : null}

                {financeAction.action.type === 'request_lien_waiver' ? (
                  <>
                    <label>
                      Waiver amount (EUR)
                      <input
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={financeActionDraft.amount}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, amount: event.target.value })}
                      />
                    </label>
                    <label>
                      Supplier or party
                      <input
                        required
                        value={financeActionDraft.vendor}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, vendor: event.target.value })}
                      />
                    </label>
                    <label>
                      Waiver type
                      <select
                        value={financeActionDraft.waiverType}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, waiverType: event.target.value })}
                      >
                        <option value="conditional">Conditional</option>
                        <option value="unconditional">Unconditional</option>
                      </select>
                    </label>
                    <label>
                      Request due date
                      <input
                        required
                        type="date"
                        value={financeActionDraft.dueAt}
                        onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, dueAt: event.target.value })}
                      />
                    </label>
                  </>
                ) : null}

                <label className="form-span">
                  Internal evidence and notes
                  <textarea
                    required
                    value={financeActionDraft.notes}
                    onChange={(event) => setFinanceActionDraft({ ...financeActionDraft, notes: event.target.value })}
                    placeholder="Record the source evidence, calculation, collection history, receipt, or review basis."
                    minLength={financeAction.action.type === 'request_expense_reversal' ? 8 : undefined}
                  />
                </label>
                <p className="workflow-note form-span">
                  This screen only changes the retained ledger. It cannot move funds, contact a client or supplier, submit a draw, release a
                  waiver, or export bookkeeping data.
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeFinanceControl}>
                  Cancel
                </button>
                <button className="primary-button" disabled={submitting || !financeActionDraft.notes.trim()}>
                  <ShieldCheck size={16} />
                  {submitting
                    ? 'Recording...'
                    : financeAction.action.type === 'create_credit_note'
                      ? 'Request credit-note approval'
                      : financeAction.action.type === 'request_expense_reversal'
                        ? 'Request expense reversal'
                      : financeAction.action.type === 'record_supplier_invoice'
                        ? 'Request payable approval'
                        : financeAction.action.type === 'record_supplier_payment'
                          ? 'Request payment confirmation'
                          : financeAction.action.type === 'create_billing_milestone'
                            ? 'Request milestone approval'
                            : financeAction.action.type === 'record_time_expense'
                              ? 'Record ledger costs'
                              : financeAction.action.type === 'request_lien_waiver'
                                ? 'Retain waiver request'
                                : financeAction.action.type === 'record_payment_follow_up' &&
                                    financeActionDraft.outcome === 'follow_up_recorded'
                                  ? 'Record internal follow-up'
                                  : 'Request approver review'}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}
