import { useState, useEffect, useMemo } from "react"
import { Plus, Search, ClipboardList, ArrowUpRight, Users, ShieldCheck, ReceiptEuro, PackageCheck, MailCheck, X, FileDown } from "lucide-react"
import { formatDate, currency, shortHash } from "../dashboard-format"
import Empty from "./EmptyState"
import { companyApiUrl } from "../company-request.mjs"
import SupplierPerformanceSignal from "./SupplierPerformanceSignal"

function BidPackageWorkspace({
  request,
  locale,
  text,
  bidPackages,
  selectedBidPackage,
  canCoordinate,
  canApprove,
  submitting,
  onCreate,
  onSelect,
  onAddBidders,
  onRecordReturn,
  onRequestSelection,
  onReviewApproval,
  onPrepareCommitment,
  onReviewCommitment,
  onPrepareOrderPackage,
  onReviewOrderDelivery,
  onRecordOrderDelivery,
}) {
  const t = text || ((value, variables = {}, englishFallback = value) => Object.entries(variables).reduce((result, [name, item]) => result.replaceAll(`{${name}}`, String(item)), englishFallback))
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('open')
  const [supplierHistory, setSupplierHistory] = useState({ status: 'loading', suppliers: [] })
  useEffect(() => {
    let current = true
    request('/api/ledger/supplier-performance')
      .then(result => { if (current) setSupplierHistory({ status: 'ready', suppliers: result.suppliers || [] }) })
      .catch(() => { if (current) setSupplierHistory({ status: 'error', suppliers: [] }) })
    return () => { current = false }
  }, [request])
  const normalizedQuery = query.trim().toLowerCase()
  useEffect(() => {
    if (selectedBidPackage?.status === 'selected') setStatus('selected')
  }, [selectedBidPackage?.id, selectedBidPackage?.status])
  const eligible = useMemo(
    () => bidPackages.filter(bidPackage => status === 'all' || (status === 'open'
      ? !['selected', 'closed', 'cancelled'].includes(bidPackage.status)
      : bidPackage.status === status)),
    [bidPackages, status],
  )
  const searching = Boolean(normalizedQuery)
  const searchText = useMemo(() => searching ? eligible.map(row => JSON.stringify(row).toLowerCase()) : null, [eligible, searching])
  const rows = useMemo(() => searchText ? eligible.filter((_, index) => searchText[index].includes(normalizedQuery)) : eligible,
    [eligible, normalizedQuery, searchText])

  return (
    <>
      <section className="panel bid-register" data-testid="bid-package-workspace">
        <div className="panel-heading pipeline-heading">
          <div>
            <h2>{t('Bid package register')}</h2>
            <p>{t('Compare retained trade-partner returns before a preferred bidder enters approval.')}</p>
          </div>
          {canCoordinate ? (
            <button className="primary-button" onClick={onCreate}>
              <Plus size={16} />
              {t('New bid package')}
            </button>
          ) : null}
        </div>
        <div className="pipeline-toolbar">
          <label className="search-control">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('Search package, client, trade or bidder')} />
          </label>
          <div className="pipeline-stage-tabs bid-status-tabs" role="group" aria-label={t('Filter bid packages by status')}>
            {['open', 'under_review', 'pending_selection_approval', 'selected', 'all'].map((option) => (
              <button key={option} className={status === option ? 'active' : ''} onClick={() => setStatus(option)}>
                {t(String(option).replaceAll('_', ' '))}
              </button>
            ))}
          </div>
        </div>
        {rows.length ? (
          <div className="bid-package-list">
            {rows.map((bidPackage) => (
              <article className={`bid-package-row ${selectedBidPackage?.id === bidPackage.id ? 'bid-package-row-selected' : ''}`} key={bidPackage.id}>
                <button className="bid-package-main" onClick={() => onSelect(bidPackage)}>
                  <span className="visually-hidden">{t('Open bid package')}</span>
                  <span className="bid-package-icon"><ClipboardList size={17} /></span>
                  <span>
                    <span className="pipeline-title">
                      <strong>{bidPackage.packageNumber} / {bidPackage.title}</strong>
                      <span className={`status status-${bidPackage.status}`}>{t(String(bidPackage.status || 'draft').replaceAll('_', ' '))}</span>
                    </span>
                    <small>{bidPackage.client?.name || t('Client pending')} / {bidPackage.trade} / {bidPackage.opportunity?.title || t('Opportunity pending')}</small>
                  </span>
                </button>
                <dl className="bid-package-values">
                  <div><dt>{t('Due')}</dt><dd className={bidPackage.flags?.overdue ? 'pipeline-overdue' : ''}>{bidPackage.dueAt ? formatDate(bidPackage.dueAt) : t('Not set')}</dd></div>
                  <div><dt>{t('Returns')}</dt><dd>{bidPackage.comparison?.returned || 0} / {bidPackage.comparison?.invited || 0}</dd></div>
                  <div><dt>{t('Lowest')}</dt><dd>{bidPackage.comparison?.returned ? currency.format(bidPackage.comparison.lowestTotal || 0) : t('Pending')}</dd></div>
                </dl>
                <button className="icon-button table-action" aria-label={t('Open bid package details for {number}', { number: bidPackage.packageNumber })} onClick={() => onSelect(bidPackage)}>
                  <ArrowUpRight size={16} />
                </button>
              </article>
            ))}
          </div>
        ) : (
          <Empty title={t('No bid packages in this view')} detail={t('Adjust the status filter or retain a new internal tender package.')} />
        )}
      </section>

      {selectedBidPackage ? (
        <section className="panel bid-package-detail" aria-live="polite">
          <div className="panel-heading">
            <div>
              <h2>{selectedBidPackage.packageNumber} / {selectedBidPackage.title}</h2>
              <p>
                {selectedBidPackage.trade} / {t(String(selectedBidPackage.status || 'draft').replaceAll('_', ' '))} /{' '}
                {(selectedBidPackage.comparison?.returned || 0) === 1
                  ? t('{count} retained return', { count: selectedBidPackage.comparison?.returned || 0 })
                  : t('{count} retained returns', { count: selectedBidPackage.comparison?.returned || 0 })}
              </p>
            </div>
            <div className="bid-package-heading-actions">
              {canCoordinate && ['draft', 'open_for_returns', 'under_review'].includes(selectedBidPackage.status) ? (
                <button className="secondary-button" onClick={() => onAddBidders(selectedBidPackage)}>
                  <Users size={15} /> {t('Add bidders')}
                </button>
              ) : null}
              {selectedBidPackage.approvalId && selectedBidPackage.status === 'pending_selection_approval' && canApprove ? (
                <button className="primary-button" onClick={() => onReviewApproval(selectedBidPackage)}>
                  <ShieldCheck size={15} /> {t('Review approval')}
                </button>
              ) : null}
              {selectedBidPackage.status === 'selected' && canCoordinate && (!selectedBidPackage.commitment || selectedBidPackage.flags?.commitmentRejected) ? (
                <button
                  className="primary-button"
                  disabled={!selectedBidPackage.jobId || submitting}
                  title={selectedBidPackage.jobId ? t('Prepare the selected return for purchasing approval') : t('Convert the opportunity to a job first')}
                  onClick={() => onPrepareCommitment(selectedBidPackage)}
                >
                  <ReceiptEuro size={15} /> {selectedBidPackage.flags?.commitmentRejected ? t('Revise commitment') : selectedBidPackage.jobId ? t('Prepare commitment') : t('Job required')}
                </button>
              ) : null}
              {selectedBidPackage.commitment?.status === 'pending_approval' && canApprove ? (
                <button className="primary-button" onClick={() => onReviewCommitment(selectedBidPackage)}>
                  <ShieldCheck size={15} /> {t('Review commitment')}
                </button>
              ) : null}
              {selectedBidPackage.flags?.orderPackageReady && canCoordinate ? (
                <button className="primary-button" disabled={submitting} onClick={() => onPrepareOrderPackage(selectedBidPackage)}>
                  <PackageCheck size={15} /> {t('Prepare order package')}
                </button>
              ) : null}
              {selectedBidPackage.flags?.orderDeliveryApprovalPending && canApprove ? (
                <button className="primary-button" disabled={submitting} onClick={() => onReviewOrderDelivery(selectedBidPackage)}>
                  <ShieldCheck size={15} /> {t('Review transmission')}
                </button>
              ) : null}
              {selectedBidPackage.flags?.orderDeliveryApproved && canCoordinate ? (
                <button className="primary-button" disabled={submitting} onClick={() => onRecordOrderDelivery(selectedBidPackage)}>
                  <MailCheck size={15} /> {t('Record delivery receipt')}
                </button>
              ) : null}
              <button className="icon-button" aria-label={t('Close bid package detail')} onClick={() => onSelect(null)}><X size={17} /></button>
            </div>
          </div>
          <div className="bid-package-summary">
            <div><span>{t('Scope')}</span><strong>{selectedBidPackage.scope}</strong></div>
            <div><span>{t('Comparison')}</span><strong>{selectedBidPackage.comparison?.returned ? t('{lowest} to {highest}', { lowest: currency.format(selectedBidPackage.comparison.lowestTotal), highest: currency.format(selectedBidPackage.comparison.highestTotal) }) : t('No returns retained')}</strong></div>
            <div>
              <span>{t('Control')}</span>
              <strong>
                {selectedBidPackage.flags?.orderIssued
                  ? t('Order issued with verified provider receipt')
                  : selectedBidPackage.flags?.orderDeliveryApproved
                    ? t('Transmission approved; provider receipt required')
                    : selectedBidPackage.flags?.orderDeliveryApprovalPending
                      ? t('Order package retained; transmission approval pending')
                      : selectedBidPackage.commitment?.status === 'ready_to_order'
                        ? t('Purchasing envelope approved; no award sent')
                  : selectedBidPackage.commitment?.status === 'pending_approval'
                    ? t('Commitment approval pending; no award sent')
                    : selectedBidPackage.flags?.commitmentRejected
                      ? t('Commitment rejected; retained for revision')
                      : selectedBidPackage.status === 'selected'
                        ? t('Preferred bidder retained; no commitment prepared')
                        : t('Internal only; no invitations sent')}
              </strong>
            </div>
          </div>
          {selectedBidPackage.commitment ? (
            <div className={`bid-commitment ${selectedBidPackage.commitment.integrityValid ? '' : 'bid-commitment-invalid'}`} data-testid="bid-commitment">
              <div className="bid-commitment-heading">
                <div>
                  <span className="eyebrow">{t('Purchasing commitment')}</span>
                  <strong>{selectedBidPackage.commitment.purchaseOrder.supplier}</strong>
                </div>
                <div className="bid-commitment-tags">
                  <span className={`status status-${selectedBidPackage.commitment.status}`}>{t(String(selectedBidPackage.commitment.status || 'pending_approval').replaceAll('_', ' '))}</span>
                  <span className={`tag ${selectedBidPackage.commitment.integrityValid ? 'tag-green' : 'tag-red'}`}>
                    {selectedBidPackage.commitment.integrityValid ? t('Source verified') : t('Integrity failed')}
                  </span>
                </div>
              </div>
              <dl className="bid-commitment-values">
                <div><dt>{t('Net envelope')}</dt><dd>{currency.format(selectedBidPackage.commitment.purchaseOrder.amount || 0)}</dd></div>
                <div><dt>{t('Required by')}</dt><dd>{formatDate(selectedBidPackage.commitment.purchaseOrder.requiredBy)}</dd></div>
                <div><dt>{t('Cost code')}</dt><dd>{selectedBidPackage.commitment.purchaseOrder.data?.source?.terms?.costCode || 'SUBCONTRACT'}</dd></div>
                <div><dt>{t('Hash')}</dt><dd><code>{shortHash(selectedBidPackage.commitmentHash)}</code></dd></div>
              </dl>
              <p>
                {selectedBidPackage.commitment.orderIssued
                  ? t('The retained order was issued only after transmission approval and a configured provider receipt. No payment or subcontract signature was performed.')
                  : <>{selectedBidPackage.commitment.spendAuthorized
                    ? t('The exact internal spend envelope is approved and ready for a separate ordering action.')
                    : t('Approval is required before this exact internal spend envelope becomes ready to order.')}{' '}
                    {t('No supplier contact, award, order transmission, subcontract signature, or payment occurred.')}</>}
              </p>
              {selectedBidPackage.commitment.issuePackage ? (
                <div className="bid-order-package" data-testid="bid-order-package">
                  <div>
                    <span className="eyebrow">{t('Controlled order package')}</span>
                    <strong>{selectedBidPackage.commitment.issuePackage.issueReference}</strong>
                    <small>
                      {selectedBidPackage.commitment.issuePackage.communication?.data?.recipient || t('Supplier recipient retained')} / {t(String(selectedBidPackage.commitment.issuePackage.transportStatus || 'draft').replaceAll('_', ' '))}
                    </small>
                  </div>
                  <div className="bid-order-package-actions">
                    <span className={`tag ${selectedBidPackage.commitment.orderIssued ? 'tag-green' : 'tag-amber'}`}>
                      {selectedBidPackage.commitment.orderIssued ? t('Provider receipt retained') : t(String(selectedBidPackage.commitment.issuePackage.communicationStatus || 'draft').replaceAll('_', ' '))}
                    </span>
                    <a
                      className="secondary-button"
                      aria-label={t('Download {title}', { title: `${t('Order')} ${selectedBidPackage.commitment.issuePackage.issueReference}` })}
                      href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(selectedBidPackage.commitment.issuePackage.htmlDocumentId)}/issue-package`)}
                      download
                    >
                      <FileDown size={15} /> {t('Order')}
                    </a>
                    <a
                      className="secondary-button"
                      aria-label={t('Download {title}', { title: `${t('Order UBL')} ${selectedBidPackage.commitment.issuePackage.issueReference}` })}
                      href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(selectedBidPackage.commitment.issuePackage.ublDocumentId)}/issue-package`)}
                      download
                    >
                      <FileDown size={15} /> {t('Order UBL')}
                    </a>
                  </div>
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="bid-participant-list">
            {selectedBidPackage.participants.map((participant) => {
              const canEditReturn = canCoordinate && ['open_for_returns', 'under_review'].includes(selectedBidPackage.status)
              const canSelect = canCoordinate && participant.status === 'returned' && ['open_for_returns', 'under_review'].includes(selectedBidPackage.status)
              return (
                <article className="bid-participant-row" key={participant.id}>
                  <div className="bid-participant-copy">
                    <span className="pipeline-title">
                      <strong>{participant.partner?.name || t('Trade partner unavailable')}</strong>
                      <span className={`status status-${participant.status}`}>{t(String(participant.status || 'internal_invite').replaceAll('_', ' '))}</span>
                    </span>
                    <small>{t(String(participant.partner?.compliance?.status || 'needs_review').replaceAll('_', ' '))} {t('compliance')} / {participant.data?.deliveryStatus === 'not_sent' ? t('internal invite only') : t('retained record')}</small>
                    <SupplierPerformanceSignal supplier={participant.partner} state={supplierHistory} locale={locale} text={t} />
                    {participant.evidenceReference ? <p>{t('Evidence')}: {participant.evidenceReference}</p> : null}
                  </div>
                  <dl className="bid-participant-values">
                    <div><dt>{t('Total')}</dt><dd>{participant.status === 'internal_invite' ? t('Awaiting return') : currency.format(participant.total || 0)}</dd></div>
                    <div><dt>{t('Duration')}</dt><dd>{participant.durationDays === null ? t('Not retained') : t('{count} days', { count: participant.durationDays })}</dd></div>
                    <div><dt>{t('Valid until')}</dt><dd>{participant.validUntil ? formatDate(participant.validUntil) : t('Not retained')}</dd></div>
                  </dl>
                  <div className="bid-participant-actions">
                    {canEditReturn && ['internal_invite', 'returned'].includes(participant.status) ? (
                      <button className="secondary-button" disabled={submitting} onClick={() => onRecordReturn(selectedBidPackage, participant)}>
                        <ReceiptEuro size={15} /> {participant.status === 'returned' ? t('Update return') : t('Record return')}
                      </button>
                    ) : null}
                    {canSelect ? (
                      <button className="primary-button" disabled={submitting || participant.partner?.compliance?.compliant !== true} onClick={() => onRequestSelection(selectedBidPackage, participant)}>
                        <ShieldCheck size={15} /> {t('Request selection approval')}
                      </button>
                    ) : null}
                    {participant.status === 'selected' ? <span className="tag tag-green">{t('Preferred / no award sent')}</span> : null}
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      ) : null}
    </>
  )
}

export { BidPackageWorkspace }
export default BidPackageWorkspace
