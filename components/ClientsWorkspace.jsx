import { memo, useMemo, useState } from 'react'
import { companyApiUrl } from '../company-request.mjs'
import { Archive, ArrowUpRight, BadgeCheck, Building2, ClipboardCheck, FileDown, MessageSquareText, PackageCheck, Pencil, Plus, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { currency, EMPTY_LIST, formatStatus } from '../dashboard-format'
import { operatorText } from '../operator-locale'
import Empty from './EmptyState'
import ListPagination from './ListPagination'
import './JobWorkspaceControls.css'

function ClientDirectoryWorkspace({ directory, locale, canCoordinate, submitting, onCreate, onEdit, onOpen }) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(25)
  const clients = directory?.clients || EMPTY_LIST
  const summary = directory?.summary || {}
  const normalizedQuery = query.trim().toLowerCase()
  const searchEnabled = Boolean(normalizedQuery)
  const searchIndex = useMemo(() => searchEnabled
    ? new Map(clients.map(client => [client, [
        client.name,
        client.company,
        client.email,
        client.phone,
        client.address,
        client.city,
        client.data?.billingEmail,
        client.data?.registrationNumber,
      ].map(value => String(value || '').toLowerCase())]))
    : null, [clients, searchEnabled])
  const rows = useMemo(() => searchEnabled
    ? clients.filter(client => searchIndex.get(client).some(value => value.includes(normalizedQuery)))
    : clients, [clients, normalizedQuery, searchEnabled, searchIndex])
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const currentPage = Math.min(page, pageCount - 1)
  if (page !== currentPage) setPage(currentPage)
  const pageRows = rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize)

  return (
    <section className="panel page-panel client-directory" data-testid="client-directory">
      <div className="panel-heading client-directory-heading">
        <div>
          <h2>{t('Client directory')}</h2>
          <p>{t('Maintain one retained identity for project communication, commercial packages, invoicing, and aftercare.')}</p>
        </div>
        {canCoordinate ? (
          <button type="button" className="primary-button" disabled={submitting} onClick={onCreate}>
            <Plus size={16} />
            {t('New client')}
          </button>
        ) : <span className="count-badge">{clients.length}</span>}
      </div>
      <div className="client-directory-summary" aria-label={t('Client directory summary')}>
        <div><span>{t('Clients')}</span><strong>{summary.total || 0}</strong></div>
        <div><span>{t('Contact ready')}</span><strong>{summary.contactReady || 0}</strong></div>
        <div><span>{t('Invoice ready')}</span><strong>{summary.invoiceReady || 0}</strong></div>
        <div><span>{t('Peppol profile')}</span><strong>{summary.structuredInvoiceReady || 0}</strong></div>
        <div><span>{t('Active jobs')}</span><strong>{summary.activeJobs || 0}</strong></div>
        <div><span>{t('Receivable')}</span><strong>{currency.format(summary.outstandingReceivable || 0)}</strong></div>
      </div>
      <div className="client-directory-filter">
        <Search size={16} aria-hidden="true" />
        <label htmlFor="client-directory-search">{t('Search clients')}</label>
        <input
          id="client-directory-search"
          type="search"
          value={query}
          onChange={(event) => { setQuery(event.target.value); setPage(0) }}
          placeholder={t('Name, company, email, city, or registration')}
        />
        <span>{t('{count} shown', { count: pageRows.length })}</span>
      </div>
      <div className="client-directory-list">
        {pageRows.map(client => (
          <ClientDirectoryRow key={client.id} client={client} locale={locale} canCoordinate={canCoordinate}
            submitting={submitting} onOpen={onOpen} onEdit={onEdit} />
        ))}
        {!rows.length ? (
          <Empty
            title={t(clients.length ? 'No matching clients' : 'No retained clients')}
            detail={t(clients.length ? 'Change the directory search to review another retained client.' : 'Create a client identity before preparing commercial or invoicing records.')}
          />
        ) : null}
        <ListPagination t={t} total={rows.length} page={currentPage} pageCount={pageCount} pageSize={pageSize}
          setPage={setPage}
          setPageSize={value => { setPageSize(value); setPage(0) }} />
      </div>
    </section>
  )
}

const ClientDirectoryRow = memo(function ClientDirectoryRow({ client, locale, canCoordinate, submitting, onOpen, onEdit }) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const missing = client.readiness?.missing?.structuredInvoice || EMPTY_LIST
  const latestJob = client.latestJobs?.[0]
  return (
    <article className="client-directory-row" data-testid={`client-directory-${client.id}`}>
      <div className="client-directory-identity">
        <div className="client-directory-title">
          <span className="client-directory-icon"><Building2 size={17} /></span>
          <div>
            <h3>{client.company || client.name}</h3>
            <p>{client.company ? client.name : t(formatStatus(client.data?.clientType || 'consumer'))}</p>
          </div>
        </div>
        <div className="client-directory-contact">
          <span>{client.email || client.data?.billingEmail || t('No email retained')}</span>
          <span>{client.phone || t('No phone retained')}</span>
          <span>{[client.address, client.data?.postalCode, client.city, client.country].filter(Boolean).join(', ') || t('No address retained')}</span>
        </div>
        <div className="client-flags">
          <span className={client.readiness?.contactReady ? 'tag tag-green' : 'tag tag-amber'}>{t(client.readiness?.contactReady ? 'Contact ready' : 'Contact incomplete')}</span>
          <span className={client.readiness?.invoiceReady ? 'tag tag-green' : 'tag tag-amber'}>{t(client.readiness?.invoiceReady ? 'Invoice ready' : 'Invoice incomplete')}</span>
          <span className={client.readiness?.structuredInvoiceReady ? 'tag tag-green' : 'tag tag-amber'}>{t(client.readiness?.structuredInvoiceReady ? 'Peppol ready' : 'Peppol incomplete')}</span>
        </div>
        {!client.readiness?.structuredInvoiceReady && missing.length ? (
          <small className="client-directory-missing">{t('Missing: {items}{extra}', { items: missing.slice(0, 3).map((item) => t(item.label)).join(', '), extra: missing.length > 3 ? ` +${missing.length - 3}` : '' })}</small>
        ) : null}
      </div>
      <div className="client-directory-metrics" aria-label={t('Operating context for {name}', { name: client.company || client.name })}>
        <div><span>{t('Active jobs')}</span><strong>{client.metrics?.activeJobs || 0}</strong></div>
        <div><span>{t('Pipeline')}</span><strong>{client.metrics?.openOpportunities || 0}</strong></div>
        <div><span>{t('Contract value')}</span><strong>{currency.format(client.metrics?.acceptedContractValue || 0)}</strong></div>
        <div><span>{t('Receivable')}</span><strong>{currency.format(client.metrics?.outstandingReceivable || 0)}</strong></div>
      </div>
      <div className="client-directory-actions">
        {latestJob ? (
          <button type="button" className="secondary-button" onClick={() => onOpen(latestJob)}>
            <ArrowUpRight size={15} />
            {t('Open latest job')}
          </button>
        ) : null}
        {canCoordinate ? (
          <button type="button" className="secondary-button" disabled={submitting} onClick={() => onEdit(client)}>
            <Pencil size={15} />
            {t('Edit client')}
          </button>
        ) : null}
      </div>
    </article>
  )
})

function ClientsWorkspace({ directory, onCreateClient, onEditClient, locale, ...props }) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const [view, setView] = useState('work')
  const workCount = props.clients?.jobs?.length || 0
  const directoryCount = directory?.clients?.length || 0
  return (
    <>
      <div className="client-view-switch" role="tablist" aria-label={t('Client workspace view')}>
        <button type="button" role="tab" aria-selected={view === 'work'} className={view === 'work' ? 'active' : ''} onClick={() => setView('work')}>
          {t('Client work')} <span>{workCount}</span>
        </button>
        <button type="button" role="tab" aria-selected={view === 'directory'} className={view === 'directory' ? 'active' : ''} onClick={() => setView('directory')}>
          {t('Directory')} <span>{directoryCount}</span>
        </button>
      </div>
      {view === 'directory' ? (
        <ClientDirectoryWorkspace
          directory={directory}
          locale={locale}
          canCoordinate={props.canCoordinate}
          submitting={props.submitting}
          onCreate={onCreateClient}
          onEdit={onEditClient}
          onOpen={props.onOpen}
        />
      ) : <ClientSuccessWorkspace {...props} locale={locale} />}
    </>
  )
}

function ClientSuccessWorkspace({
  clients,
  jobs,
  locale,
  canCoordinate,
  canApprove,
  submitting,
  onPrepareCloseout,
  onPrepareHandover,
  onDraftFollowup,
  onDraftRecurring,
  onLifecycle,
  onOpenApprovals,
  onOpen,
}) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const rows = clients?.jobs || EMPTY_LIST
  const summary = clients?.summary || {}
  return (
    <section className="panel page-panel client-workspace" data-testid="client-workspace">
      <div className="panel-heading">
        <div>
          <h2>{t('Client success')}</h2>
          <p>{t('Coordinate decisions, handover, punch, warranty, aftercare, and recurring service through retained approval gates.')}</p>
        </div>
        <span className="count-badge">{rows.length}</span>
      </div>
      <div className="client-summary" aria-label={t('Client success summary')}>
        <div>
          <span>{t('Waiting client')}</span>
          <strong>{summary.waitingClient || 0}</strong>
        </div>
        <div>
          <span>{t('Handover ready')}</span>
          <strong>{summary.handoverReady || 0}</strong>
        </div>
        <div>
          <span>{t('Closeout ready')}</span>
          <strong>{summary.closeoutReady || 0}</strong>
        </div>
        <div>
          <span>{t('Punch / warranty')}</span>
          <strong>{summary.punchWarranty || 0}</strong>
        </div>
        <div>
          <span>{t('Aftercare due')}</span>
          <strong>{summary.aftercareDue || 0}</strong>
        </div>
      </div>
      <div className="client-list">
        {rows.map((item) => {
          const job = jobs.find((candidate) => candidate.id === item.jobId) || { id: item.jobId, title: item.jobTitle || t('Ledger job') }
          const action = (type) => item.nextActions?.find((candidate) => candidate.type === type)
          const canAct = canCoordinate && !item.flags?.approvalRequired
          const canPrepareCloseout = canAct && item.flags?.closeoutReady
          const handoverAction = action('prepare_handover_package')
          const canPrepareHandover = canAct && Boolean(handoverAction)
          const followupAction = action('selection_follow_up') || action('client_reply_follow_up')
          const canDraftFollowup = canAct && Boolean(followupAction) && !item.counts?.outboundDrafts
          const selectionAction = canAct ? action('review_client_selection') : null
          const punchAction = canAct ? action('resolve_punch_item') : null
          const warrantyAction = canAct ? action('resolve_warranty_claim') : null
          const aftercareAction = canAct ? action('complete_aftercare') : null
          const canDraftRecurring = canAct && !item.counts?.recurringPlans && Boolean(action('propose_recurring_plan'))
          return (
            <article className="client-item" key={item.jobId}>
              <div className="client-copy">
                <div className="client-title">
                  <h3>{item.jobTitle || t('Ledger job')}</h3>
                  <span className={`status status-${item.clientStatus}`}>{t(formatStatus(item.clientStatus))}</span>
                </div>
                <p>{t(item.nextAction || 'Client records are stable.')}</p>
                <div className="client-values">
                  <span>
                    {t('Client value')} <strong>{currency.format(item.money?.clientValue || 0)}</strong>
                  </span>
                  <span>
                    {t('Selections')} <strong>{item.counts?.pendingSelections || 0}</strong>
                  </span>
                  <span>
                    {t('Waiting replies')} <strong>{item.counts?.waitingReplies || 0}</strong>
                  </span>
                  <span>
                    {t('Open service')}{' '}
                    <strong>
                      {(item.counts?.openPunchItems || 0) + (item.counts?.openWarrantyClaims || 0) + (item.counts?.openAftercare || 0)}
                    </strong>
                  </span>
                </div>
                <div className="client-flags">
                  {item.counts?.pendingApprovals ? (
                    <span className="tag tag-amber">
                      {item.counts.pendingApprovals === 1
                        ? t('{count} approval', { count: item.counts.pendingApprovals })
                        : t('{count} approvals', { count: item.counts.pendingApprovals })}
                    </span>
                  ) : null}
                  {item.counts?.overdueSelections ? (
                    <span className="tag tag-amber">{item.counts.overdueSelections === 1
                      ? t('{count} selection overdue', { count: item.counts.overdueSelections })
                      : t('{count} selections overdue', { count: item.counts.overdueSelections })}</span>
                  ) : null}
                  {item.counts?.overdueReplies ? <span className="tag tag-amber">{item.counts.overdueReplies === 1
                    ? t('{count} reply overdue', { count: item.counts.overdueReplies })
                    : t('{count} replies overdue', { count: item.counts.overdueReplies })}</span> : null}
                  {item.counts?.dueAftercare ? <span className="tag">{t('{count} aftercare due', { count: item.counts.dueAftercare })}</span> : null}
                  {item.counts?.handoverBlockers ? (
                    <span className="tag tag-amber">
                      {item.counts.handoverBlockers === 1
                        ? t('{count} handover blocker', { count: item.counts.handoverBlockers })
                        : t('{count} handover blockers', { count: item.counts.handoverBlockers })}
                    </span>
                  ) : null}
                  {item.counts?.handoverMissing ? (
                    <span className="tag">
                      {item.counts.handoverMissing === 1
                        ? t('{count} handover requirement', { count: item.counts.handoverMissing })
                        : t('{count} handover requirements', { count: item.counts.handoverMissing })}
                    </span>
                  ) : null}
                  {item.latest?.handoverPackage ? (
                    <span className={item.handoverReadiness?.currentPackageId ? 'tag tag-green' : 'tag tag-amber'}>
                      {item.handoverReadiness?.currentPackageId ? t('Dossier current') : t('Dossier refresh due')}
                    </span>
                  ) : null}
                  {item.counts?.handoverDelivered ? <span className="tag tag-green">{t('Handover delivered')}</span> : null}
                </div>
              </div>
              <div className="client-actions">
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
                {canPrepareCloseout ? (
                  <button
                    className="secondary-button"
                    aria-label={t('Prepare closeout for {job}', { job: job.title })}
                    disabled={submitting}
                    onClick={() => onPrepareCloseout(item)}
                  >
                    <Archive size={16} />
                    {t('Prepare closeout')}
                  </button>
                ) : null}
                {canPrepareHandover ? (
                  <button
                    className="primary-button"
                    aria-label={t('Prepare handover dossier for {job}', { job: job.title })}
                    disabled={submitting}
                    onClick={() => onPrepareHandover(item)}
                  >
                    <PackageCheck size={16} />
                    {t('Prepare dossier')}
                  </button>
                ) : null}
                {item.latest?.handoverPackage ? (
                  <a
                    className="secondary-button"
                    aria-label={t('Download handover dossier for {job}', { job: job.title })}
                    href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(item.latest.handoverPackage.id)}/issue-package`)}
                    download
                  >
                    <FileDown size={16} />
                    {t('Download dossier')}
                  </a>
                ) : null}
                {canDraftFollowup ? (
                  <button
                    className="secondary-button"
                    aria-label={t('Draft client follow-up for {job}', { job: job.title })}
                    disabled={submitting}
                    onClick={() => onDraftFollowup(item)}
                  >
                    <MessageSquareText size={16} />
                    {t('Draft follow-up')}
                  </button>
                ) : null}
                {selectionAction ? (
                  <button
                    className="secondary-button"
                    aria-label={t('Record client selection for {job}', { job: job.title })}
                    disabled={submitting}
                    onClick={() => onLifecycle(item, 'selection', selectionAction.selectionId)}
                  >
                    <ClipboardCheck size={16} />
                    {t('Record selection')}
                  </button>
                ) : null}
                {punchAction ? (
                  <button
                    className="secondary-button"
                    aria-label={t('Request punch resolution for {job}', { job: job.title })}
                    disabled={submitting}
                    onClick={() => onLifecycle(item, 'punch_item', punchAction.punchItemId)}
                  >
                    <ShieldCheck size={16} />
                    {t('Punch review')}
                  </button>
                ) : null}
                {warrantyAction ? (
                  <button
                    className="secondary-button"
                    aria-label={t('Request warranty resolution for {job}', { job: job.title })}
                    disabled={submitting}
                    onClick={() => onLifecycle(item, 'warranty_claim', warrantyAction.warrantyClaimId)}
                  >
                    <ShieldCheck size={16} />
                    {t('Warranty review')}
                  </button>
                ) : null}
                {aftercareAction ? (
                  <button
                    className="secondary-button"
                    aria-label={t('Complete aftercare for {job}', { job: job.title })}
                    disabled={submitting}
                    onClick={() => onLifecycle(item, 'aftercare', aftercareAction.aftercareId)}
                  >
                    <BadgeCheck size={16} />
                    {t('Complete aftercare')}
                  </button>
                ) : null}
                {canDraftRecurring ? (
                  <button
                    className="secondary-button"
                    aria-label={t('Draft recurring plan for {job}', { job: job.title })}
                    disabled={submitting}
                    onClick={() => onDraftRecurring(item)}
                  >
                    <RefreshCw size={16} />
                    {t('Service plan')}
                  </button>
                ) : null}
                <button className="icon-button table-action" aria-label={t('Open {job}', { job: job.title })} onClick={() => onOpen(job)}>
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </article>
          )
        })}
        {!rows.length ? (
          <Empty
            title={t('No client work')}
            detail={t('Client decisions, closeout, warranty, and aftercare records will appear here when action is needed.')}
          />
        ) : null}
      </div>
    </section>
  )
}

export { ClientsWorkspace as default, ClientsWorkspace, ClientSuccessWorkspace }
