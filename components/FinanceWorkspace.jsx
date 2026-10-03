import { lazy } from 'react'
import { ArrowUpRight, ClipboardCheck, FileDown, Gauge, PackageCheck, ReceiptEuro, ShieldCheck } from 'lucide-react'
import { companyApiUrl } from '../company-request.mjs'
import { currency, EMPTY_LIST, formatDate, formatStatus } from '../dashboard-format'
import { FINANCE_ACTION_LABELS } from '../finance-actions'
import Empty from './EmptyState'
import LazyControlBoundary from './LazyControlBoundary'

const CashFlowForecastControl = lazy(() => import('./CashFlowForecastControl'))

function localizedFinanceActionLabel(action, t) {
  if (!action) return t('Finance records are stable.')
  if (action.type === 'draft_invoice' && action.billingMilestoneId) {
    return action.billingMilestoneSequence
      ? t('Draft milestone {sequence} invoice', { sequence: action.billingMilestoneSequence })
      : t('Draft milestone invoice')
  }
  return t(action.label || FINANCE_ACTION_LABELS[action.type] || 'Finance records are stable.')
}

function localizedCostForecastWarning(warning, t, formatCurrency) {
  const count = Number(warning?.count
    ?? warning?.costCodes?.length
    ?? warning?.timeLogIds?.length
    ?? warning?.expenseIds?.length
    ?? warning?.supplierInvoiceIds?.length
    ?? 0)
  if (warning?.code === 'reported_cost_totals_differ') {
    return count === 1
      ? t('{count} budget line has reported actual or commitment totals that differ from linked ledger evidence.', { count })
      : t('{count} budget lines have reported actual or commitment totals that differ from linked ledger evidence.', { count })
  }
  if (warning?.code === 'unbudgeted_costs_present') {
    return count === 1
      ? t('{count} cost code contains actual or committed cost without an approved budget.', { count })
      : t('{count} cost codes contain actual or committed cost without an approved budget.', { count })
  }
  if (warning?.code === 'labor_awaiting_timesheet_approval') {
    return count === 1
      ? t('{count} time log remains unreviewed until its exact source lines are covered by an approved weekly timesheet.', { count })
      : t('{count} time logs remain unreviewed until their exact source lines are covered by approved weekly timesheets.', { count })
  }
  if (warning?.code === 'expense_evidence_unreviewed') {
    return count === 1
      ? t('{count} expense record is included in EAC but excluded from approved actual cost until governed receipt review is complete.', { count })
      : t('{count} expense records are included in EAC but excluded from approved actual cost until governed receipt review is complete.', { count })
  }
  if (warning?.code === 'supplier_invoice_unreviewed') {
    return count === 1
      ? t('{count} supplier invoice is included in EAC but excluded from approved actual cost until approval is complete.', { count })
      : t('{count} supplier invoices are included in EAC but excluded from approved actual cost until approval is complete.', { count })
  }
  if (warning?.code === 'purchase_commitment_unreviewed') {
    return t('{amount} of retained purchase-order exposure is included in EAC but is not recognized as an approved commitment.', {
      amount: formatCurrency(Number(warning.amount || 0)),
    })
  }
  return warning?.message || ''
}

export default function FinanceWorkspace({
  request,
  locale,
  text,
  finance,
  cashFlow,
  jobs,
  canCoordinate,
  canApprove,
  submitting,
  onDraftInvoice,
  onPreparePackage,
  onAction,
  onOpenApprovals,
  onOpen,
  onCashFlowChange,
}) {
  const t = text || ((value, variables = {}, englishFallback = value) => Object.entries(variables).reduce((result, [name, item]) => result.replaceAll(`{${name}}`, String(item)), englishFallback))
  const rows = finance?.jobs || EMPTY_LIST
  const summary = finance?.summary || {}
  return (
    <section className="panel page-panel finance-workspace" data-testid="finance-workspace">
      <div className="panel-heading">
        <div>
          <h2>{t('Finance readiness')}</h2>
          <p>{t('Review source-linked cost forecasts, commitments, receivables, supplier payables, and approval gates.')}</p>
        </div>
        <span className="count-badge">{rows.length}</span>
      </div>
      <LazyControlBoundary label={t('cash-flow forecast')}>
        <CashFlowForecastControl
          locale={locale}
          cashFlow={cashFlow}
          jobs={jobs}
          request={request}
          canCoordinate={canCoordinate}
          canApprove={canApprove}
          onChange={onCashFlowChange}
          onOpenApprovals={onOpenApprovals}
        />
      </LazyControlBoundary>
      <div className="finance-summary" aria-label={t('Finance summary')}>
        <div>
          <span>{t('Invoice ready')}</span>
          <strong>{summary.invoiceReady || 0}</strong>
        </div>
        <div>
          <span>{t('Planned billing')}</span>
          <strong>{currency.format(summary.plannedBillingValue || 0)}</strong>
        </div>
        <div>
          <span>{t('Uninvoiced net')}</span>
          <strong>{currency.format(summary.uninvoicedNetValue ?? summary.uninvoicedValue ?? 0)}</strong>
        </div>
        <div>
          <span>{t('Unpaid')}</span>
          <strong>{currency.format(summary.unpaidValue || 0)}</strong>
        </div>
        <div>
          <span>{t('Supplier payable')}</span>
          <strong>{currency.format(summary.supplierPayableValue || 0)}</strong>
        </div>
        <div>
          <span>{t('Forecast cost')}</span>
          <strong>{currency.format(summary.forecastCostValue || 0)}</strong>
        </div>
        <div>
          <span>{t('Approved actual')}</span>
          <strong>{currency.format(summary.actualCostValue || 0)}</strong>
        </div>
        <div>
          <span>{t('Unreviewed cost')}</span>
          <strong>{currency.format(summary.unreviewedCostValue || 0)}</strong>
        </div>
        <div>
          <span>{t('Cost to complete')}</span>
          <strong>{currency.format(summary.costToCompleteValue || 0)}</strong>
        </div>
        <div>
          <span>{t('Forecast margin')}</span>
          <strong>{currency.format(summary.forecastMarginValue || 0)}</strong>
        </div>
        <div>
          <span>{t('Approvals')}</span>
          <strong>{summary.pendingApprovals || 0}</strong>
        </div>
      </div>
      <div className="finance-list">
        {rows.map((item) => {
          const job = jobs.find((candidate) => candidate.id === item.jobId) || { id: item.jobId, title: item.jobTitle || t('Ledger job') }
          const costForecast = item.costForecast || {}
          const forecastSummary = costForecast.summary || {}
          const canAct = canCoordinate && !item.flags?.approvalRequired
          const draftInvoiceAction = canAct ? item.nextActions?.find((action) => action.type === 'draft_invoice') : null
          const canDraftInvoice = Boolean(draftInvoiceAction) && !item.counts?.draftInvoices
          const prepareAction = canAct
            ? item.nextActions?.find((action) =>
                ['prepare_invoice_package', 'prepare_credit_note_package', 'prepare_purchase_order_package'].includes(action.type),
              )
            : null
          const issuePackage = item.latest?.invoice?.data?.issuePackage
          const creditNotePackage = item.latest?.creditNote?.data?.issuePackage
          const purchaseOrderPackage = item.latest?.purchaseOrder?.issuePackage
          const forecastAction = canAct ? item.nextActions?.find((action) => action.type === 'prepare_cost_forecast') : null
          const forecastRiskLines = (costForecast.lines || [])
            .filter((line) => line.overBudget || line.unbudgeted)
            .sort((left, right) => Number(left.variance || 0) - Number(right.variance || 0))
            .slice(0, 3)
          const forecastHistory = (costForecast.snapshots || []).slice(0, 4)
          const financeActions = canAct
            ? item.nextActions
                ?.filter(
                  (action) =>
                    action.type !== 'review_finance_approval' &&
                    action.type !== 'draft_invoice' &&
                    action.type !== 'prepare_cost_forecast' &&
                    !['prepare_invoice_package', 'prepare_credit_note_package', 'prepare_purchase_order_package'].includes(action.type) &&
                    FINANCE_ACTION_LABELS[action.type],
                )
            : EMPTY_LIST
          return (
            <article className="finance-item" key={item.jobId}>
              <div className="finance-copy">
                <div className="finance-title">
                  <h3>{item.jobTitle || t('Ledger job')}</h3>
                  <span className={`status status-${item.financeStatus}`}>
                    {t(String(item.financeStatus || 'stable').replaceAll('_', ' '))}
                  </span>
                </div>
                <p>{localizedFinanceActionLabel(item.nextActions?.[0], t)}</p>
                <div className="finance-values">
                  <span>
                    {t('Contract net')} <strong>{currency.format(item.money?.contractValue || 0)}</strong>
                  </span>
                  <span>
                    {t('Planned billing')} <strong>{currency.format(item.money?.plannedBillingValue || 0)}</strong>
                  </span>
                  <span>
                    {t('Billing due')} <strong>{currency.format(item.money?.dueBillingValue || 0)}</strong>
                  </span>
                  <span>
                    {t('Unpaid gross')} <strong>{currency.format(item.money?.unpaidValue || 0)}</strong>
                  </span>
                  <span>
                    {t('Supplier payable')} <strong>{currency.format(item.money?.supplierPayableValue || 0)}</strong>
                  </span>
                  <span>
                    {t('Cost budget')} <strong>{currency.format(forecastSummary.budget || 0)}</strong>
                  </span>
                  <span>
                    {t('Approved actual')} <strong>{currency.format(forecastSummary.actual || 0)}</strong>
                  </span>
                  <span>
                    {t('Unreviewed cost')} <strong>{currency.format(forecastSummary.unreviewedCost || 0)}</strong>
                  </span>
                  <span>
                    {t('Incurred evidence')} <strong>{currency.format(forecastSummary.incurredCost || 0)}</strong>
                  </span>
                  <span>
                    {t('Issued commitments')} <strong>{currency.format(forecastSummary.externalCommitment || 0)}</strong>
                  </span>
                  <span>
                    {t('Authorized, not issued')} <strong>{currency.format(forecastSummary.authorizedNotIssued || 0)}</strong>
                  </span>
                  <span>
                    {t('Cost to complete')} <strong>{currency.format(forecastSummary.costToComplete || 0)}</strong>
                  </span>
                  <span>
                    EAC <strong>{currency.format(forecastSummary.estimateAtCompletion ?? forecastSummary.forecast ?? 0)}</strong>
                  </span>
                  <span>
                    VAC <strong>{currency.format(forecastSummary.varianceAtCompletion ?? forecastSummary.budgetVariance ?? 0)}</strong>
                  </span>
                  <span>
                    {t('Forecast margin')} <strong>{currency.format(forecastSummary.projectedMargin || 0)}</strong>
                  </span>
                </div>
                {forecastRiskLines.length ? (
                  <div className="cost-forecast-risks" aria-label={t('{job} cost forecast risks', { job: item.jobTitle })}>
                    {forecastRiskLines.map((line) => (
                      <span key={line.costCode}>
                        <code>{line.costCode}</code>
                        {line.unbudgeted
                          ? t('Unbudgeted')
                          : t('{amount} over', { amount: currency.format(Math.abs(line.variance || 0)) })}
                      </span>
                    ))}
                  </div>
                ) : null}
                {(costForecast.lines || []).length ? (
                  <details className="cost-forecast-detail">
                    <summary>
                      <span>{t('Cost-code review')}</span>
                      <small>
                        {(costForecast.lines || []).length === 1
                          ? t('{count} code', { count: (costForecast.lines || []).length })
                          : t('{count} codes', { count: (costForecast.lines || []).length })}
                        {' / '}
                        {t('{count} awaiting source review', { count: forecastSummary.reviewRequiredCostCodes || 0 })}
                      </small>
                    </summary>
                    <div
                      className="cost-forecast-table-wrap"
                      tabIndex={0}
                      aria-label={t('{job} cost forecast table', { job: item.jobTitle })}
                    >
                      <table className="cost-forecast-table">
                        <thead>
                          <tr>
                            <th scope="col">{t('Cost code')}</th>
                            <th scope="col">{t('Budget')}</th>
                            <th scope="col">{t('Approved')}</th>
                            <th scope="col">{t('Unreviewed')}</th>
                            <th scope="col">{t('Commitments')}</th>
                            <th scope="col">CTC</th>
                            <th scope="col">EAC</th>
                            <th scope="col">VAC</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(costForecast.lines || []).map((line) => (
                            <tr key={line.costCode}>
                              <th scope="row">
                                <code>{line.costCode}</code>
                                <small>{line.description}</small>
                              </th>
                              <td>{currency.format(line.budget || 0)}</td>
                              <td>{currency.format(line.actual || 0)}</td>
                              <td className={line.unreviewedExposure > 0 ? 'cost-review-required' : ''}>
                                {currency.format(line.unreviewedExposure || 0)}
                              </td>
                              <td>
                                {currency.format(
                                  Number(line.externalCommitment || 0)
                                  + Number(line.authorizedNotIssued || 0)
                                  + Number(line.unreviewedCommitment || 0),
                                )}
                              </td>
                              <td>{currency.format(line.costToComplete || 0)}</td>
                              <td>{currency.format(line.estimateAtCompletion ?? line.forecast ?? 0)}</td>
                              <td className={line.varianceAtCompletion < 0 ? 'cost-over-budget' : ''}>
                                {currency.format(line.varianceAtCompletion ?? line.variance ?? 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {(costForecast.warnings || []).length ? (
                      <ul className="cost-forecast-warnings" aria-label={t('{job} cost forecast warnings', { job: item.jobTitle })}>
                        {(costForecast.warnings || []).map((warning) => (
                          <li key={warning.code}>{localizedCostForecastWarning(warning, t, value => currency.format(value))}</li>
                        ))}
                      </ul>
                    ) : null}
                    {forecastHistory.length ? (
                      <div className="cost-forecast-history" aria-label={t('{job} retained cost forecast history', { job: item.jobTitle })}>
                        {forecastHistory.map((snapshot) => (
                          <span key={snapshot.id}>
                            <strong>{snapshot.forecastNumber}</strong>
                            <small>{t(formatStatus(snapshot.status))} / {formatDate(snapshot.asOfDate)}</small>
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <p className="cost-forecast-policy">
                      {t('Forecast approval freezes this review only. Timesheets, receipts, supplier invoices, and purchase commitments retain their own approval gates.')}
                    </p>
                  </details>
                ) : null}
                <div className="finance-flags">
                  {costForecast.activeSnapshot ? (
                    <span className={`tag ${costForecast.snapshotCurrent ? 'tag-green' : 'tag-amber'}`}>
                      {costForecast.activeSnapshot.forecastNumber} {costForecast.snapshotCurrent ? t('current') : t('stale')}
                    </span>
                  ) : null}
                  {costForecast.pendingSnapshot ? (
                    <span className="tag tag-amber">{t('{number} awaiting approval', { number: costForecast.pendingSnapshot.forecastNumber })}</span>
                  ) : null}
                  {forecastSummary.costPerformanceIndex != null ? (
                    <span className={`tag ${forecastSummary.costPerformanceIndex >= 1 ? 'tag-green' : 'tag-amber'}`}>
                      CPI {Number(forecastSummary.costPerformanceIndex).toFixed(2)}
                    </span>
                  ) : null}
                  {forecastSummary.unbudgetedCostCodes ? (
                    <span className="tag tag-amber">
                      {forecastSummary.unbudgetedCostCodes === 1
                        ? t('{count} unbudgeted cost code', { count: forecastSummary.unbudgetedCostCodes })
                        : t('{count} unbudgeted cost codes', { count: forecastSummary.unbudgetedCostCodes })}
                    </span>
                  ) : null}
                  {forecastSummary.reviewRequired ? (
                    <span className="tag tag-amber">
                      {t('{amount} awaiting source review', { amount: currency.format(forecastSummary.unreviewedExposure || 0) })}
                    </span>
                  ) : null}
                  {item.counts?.billingMilestones ? (
                    <span className="tag tag-green">
                      {item.counts.billingMilestones === 1
                        ? t('{count} billing milestone', { count: item.counts.billingMilestones })
                        : t('{count} billing milestones', { count: item.counts.billingMilestones })}
                    </span>
                  ) : null}
                  {item.counts?.dueBillingMilestones ? (
                    <span className="tag tag-amber">
                      {item.counts.dueBillingMilestones === 1
                        ? t('{count} milestone due', { count: item.counts.dueBillingMilestones })
                        : t('{count} milestones due', { count: item.counts.dueBillingMilestones })}
                    </span>
                  ) : null}
                  {item.money?.creditedValue > 0 ? (
                    <span className="tag tag-amber">{t('{amount} credited', { amount: currency.format(item.money.creditedValue) })}</span>
                  ) : null}
                  {item.money?.pendingCreditValue > 0 ? (
                    <span className="tag tag-amber">{t('{amount} credit pending', { amount: currency.format(item.money.pendingCreditValue) })}</span>
                  ) : null}
                  {item.money?.writtenOffValue > 0 ? (
                    <span className="tag tag-amber">{t('{amount} written off', { amount: currency.format(item.money.writtenOffValue) })}</span>
                  ) : null}
                  {item.money?.pendingPaymentValue > 0 ? (
                    <span className="tag tag-amber">{t('{amount} client payment pending', { amount: currency.format(item.money.pendingPaymentValue) })}</span>
                  ) : null}
                  {item.money?.pendingSupplierPaymentValue > 0 ? (
                    <span className="tag tag-amber">
                      {t('{amount} supplier payment pending', { amount: currency.format(item.money.pendingSupplierPaymentValue) })}
                    </span>
                  ) : null}
                  {item.counts?.dueSupplierInvoices ? (
                    <span className="tag tag-amber">
                      {item.counts.dueSupplierInvoices === 1
                        ? t('{count} supplier invoice due', { count: item.counts.dueSupplierInvoices })
                        : t('{count} supplier invoices due', { count: item.counts.dueSupplierInvoices })}
                    </span>
                  ) : null}
                  {item.counts?.timeLogs ? (
                    <span className="tag tag-green">
                      {item.counts.timeLogs === 1
                        ? t('{count} time log', { count: item.counts.timeLogs })
                        : t('{count} time logs', { count: item.counts.timeLogs })}
                    </span>
                  ) : null}
                  {item.counts?.expenses ? (
                    <span className="tag">
                      {item.counts.expenses === 1
                        ? t('{count} expense', { count: item.counts.expenses })
                        : t('{count} expenses', { count: item.counts.expenses })}
                    </span>
                  ) : null}
                  {item.counts?.pendingExpenses ? (
                    <span className="tag tag-amber">
                      {item.counts.pendingExpenses === 1
                        ? t('{count} expense receipt pending', { count: item.counts.pendingExpenses })
                        : t('{count} expense receipts pending', { count: item.counts.pendingExpenses })}
                    </span>
                  ) : null}
                  {item.latest?.expense ? (
                    <span className={`tag ${item.latest.expense.status === 'approved' ? 'tag-green' : 'tag-amber'}`}>
                      {item.latest.expense.receiptReference || t('Expense')} / {t(formatStatus(item.latest.expense.status))}
                    </span>
                  ) : null}
                  {item.latest?.invoice?.data?.structuredExportRequested ? (
                    <span className={`tag ${item.latest.invoice.data.structuredReadiness?.ready ? 'tag-green' : 'tag-amber'}`}>
                      UBL {item.latest.invoice.data.structuredReadiness?.ready ? t('ready') : t('incomplete')}
                    </span>
                  ) : null}
                  {issuePackage ? <span className="tag tag-green">{issuePackage.issueReference}</span> : null}
                  {creditNotePackage ? <span className="tag tag-green">{creditNotePackage.issueReference}</span> : null}
                  {purchaseOrderPackage ? (
                    <span className={`tag ${item.latest?.purchaseOrder?.orderIssued ? 'tag-green' : 'tag-amber'}`}>
                      {purchaseOrderPackage.issueReference} {item.latest?.purchaseOrder?.orderIssued ? t('issued') : t('prepared')}
                    </span>
                  ) : null}
                  {item.counts?.pendingApprovals ? (
                    <span className="tag tag-amber">
                      {item.counts.pendingApprovals === 1
                        ? t('{count} approval', { count: item.counts.pendingApprovals })
                        : t('{count} approvals', { count: item.counts.pendingApprovals })}
                    </span>
                  ) : null}
                </div>
              </div>
              <div className="finance-actions">
                {item.flags?.approvalRequired && canApprove ? (
                  <button
                    className="secondary-button"
                    disabled={submitting}
                    onClick={() =>
                      onOpenApprovals({
                        jobId: item.jobId,
                        jobTitle: job.title,
                        approvalId: item.nextActions?.find((action) => action.approvalId)?.approvalId || null,
                      })
                    }
                  >
                    <ShieldCheck size={16} />
                    {t('Review approval')}
                  </button>
                ) : null}
                {canDraftInvoice ? (
                  <button
                    className="secondary-button"
                    aria-label={t('Draft invoice for {job}', { job: job.title })}
                    disabled={submitting}
                    onClick={() => onDraftInvoice(item, draftInvoiceAction)}
                  >
                    <ReceiptEuro size={16} />
                    {draftInvoiceAction.billingMilestoneId ? t('Invoice milestone') : t('Draft invoice')}
                  </button>
                ) : null}
                {prepareAction ? (
                  <button
                    className="secondary-button"
                    aria-label={t('Prepare {packageType} package for {job}', {
                      packageType: t(
                        prepareAction.type === 'prepare_credit_note_package'
                          ? 'credit note'
                          : prepareAction.type === 'prepare_purchase_order_package'
                            ? 'purchase order'
                            : 'invoice',
                      ),
                      job: job.title,
                    })}
                    disabled={submitting}
                    onClick={() => onPreparePackage(item, prepareAction)}
                  >
                    <PackageCheck size={16} />
                    {prepareAction.type === 'prepare_credit_note_package'
                      ? t('Prepare credit')
                      : prepareAction.type === 'prepare_purchase_order_package'
                        ? t('Prepare order')
                        : t('Prepare package')}
                  </button>
                ) : null}
                {forecastAction ? (
                  <button
                    className="secondary-button"
                    aria-label={t('{action} for {job}', { action: localizedFinanceActionLabel(forecastAction, t), job: job.title })}
                    disabled={submitting}
                    onClick={() => onAction(item, forecastAction)}
                  >
                    <Gauge size={16} />
                    {localizedFinanceActionLabel(forecastAction, t)}
                  </button>
                ) : null}
                {issuePackage?.htmlDocumentId ? (
                  <a
                    className="secondary-button"
                    aria-label={t('Download invoice for {job}', { job: job.title })}
                    href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(issuePackage.htmlDocumentId)}/issue-package`)}
                    download
                  >
                    <FileDown size={16} />
                    {t('Invoice')}
                  </a>
                ) : null}
                {issuePackage?.ublDocumentId ? (
                  <a
                    className="secondary-button"
                    aria-label={t('Download UBL for {job}', { job: job.title })}
                    href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(issuePackage.ublDocumentId)}/issue-package`)}
                    download
                  >
                    <FileDown size={16} />
                    UBL
                  </a>
                ) : null}
                {creditNotePackage?.htmlDocumentId ? (
                  <a
                    className="secondary-button"
                    aria-label={t('Download credit note for {job}', { job: job.title })}
                    href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(creditNotePackage.htmlDocumentId)}/issue-package`)}
                    download
                  >
                    <FileDown size={16} />
                    {t('Credit note')}
                  </a>
                ) : null}
                {creditNotePackage?.ublDocumentId ? (
                  <a
                    className="secondary-button"
                    aria-label={t('Download credit note UBL for {job}', { job: job.title })}
                    href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(creditNotePackage.ublDocumentId)}/issue-package`)}
                    download
                  >
                    <FileDown size={16} />
                    {t('Credit UBL')}
                  </a>
                ) : null}
                {purchaseOrderPackage?.htmlDocumentId ? (
                  <a
                    className="secondary-button"
                    aria-label={t('Download purchase order {reference} for {job}', { reference: purchaseOrderPackage.issueReference, job: job.title })}
                    href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(purchaseOrderPackage.htmlDocumentId)}/issue-package`)}
                    download
                  >
                    <FileDown size={16} />
                    {t('Order')}
                  </a>
                ) : null}
                {purchaseOrderPackage?.ublDocumentId ? (
                  <a
                    className="secondary-button"
                    aria-label={t('Download purchase order UBL {reference} for {job}', { reference: purchaseOrderPackage.issueReference, job: job.title })}
                    href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(purchaseOrderPackage.ublDocumentId)}/issue-package`)}
                    download
                  >
                    <FileDown size={16} />
                    {t('Order UBL')}
                  </a>
                ) : null}
                {financeActions.map((action) => (
                  <button
                    className="secondary-button"
                    key={`${action.type}-${action.creditNoteId || action.supplierInvoiceId || action.purchaseOrderId || action.invoiceId || action.paymentId || action.expenseId || item.jobId}`}
                    aria-label={t('{action} for {job}', { action: t(FINANCE_ACTION_LABELS[action.type]), job: job.title })}
                    disabled={submitting}
                    onClick={() => action.type === 'review_cost_evidence' ? onOpen(job) : onAction(item, action)}
                  >
                    <ClipboardCheck size={16} />
                    {t(FINANCE_ACTION_LABELS[action.type])}
                  </button>
                ))}
                <button className="icon-button table-action" aria-label={t('Open {job}', { job: job.title })} onClick={() => onOpen(job)}>
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </article>
          )
        })}
        {!rows.length ? (
          <Empty title={t('No finance work')} detail={t('Active and completed ledger jobs will appear here with their finance readiness state.')} />
        ) : null}
      </div>
    </section>
  )
}
