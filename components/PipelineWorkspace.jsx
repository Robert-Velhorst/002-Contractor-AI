import { useState, useMemo, lazy } from "react"
import Metric from "./DashboardMetric"
import { Target, ReceiptEuro, Timer, BriefcaseBusiness, ClipboardList, ShieldCheck, Plus, Search, Pencil, MessageSquareText, ArrowUpRight, X, ClipboardCheck, Check } from "lucide-react"
import { currency, formatStatus, formatDate } from "../dashboard-format"
import LazyControlBoundary from "./LazyControlBoundary"
import Empty from "./EmptyState"
import { loadBidPackages } from "../dashboard-chunks"

const MarketFitControl = lazy(() => import('./MarketFitControl'))
const BidDecisionControl = lazy(() => import('./BidDecisionControl'))
const SiteSurveyControl = lazy(() => import('./SiteSurveyControl'))
const BidPackageWorkspace = lazy(loadBidPackages)

function PipelineWorkspace({
  request,
  locale,
  text,
  view,
  onViewChange,
  opportunities,
  forecast,
  marketFit,
  bidDecisions,
  bidPackages,
  bidSummary,
  selectedBidPackage,
  selectedOpportunity,
  canCoordinate,
  canManagePolicy,
  canApprove,
  submitting,
  onCreate,
  onEdit,
  onSelect,
  onFollowUp,
  onCompleteActivity,
  onConvert,
  onRequestMarketFitPolicy,
  onRetainMarketFitAssessment,
  onRequestBidDecisionPolicy,
  onRequestBidDecision,
  onPlanSiteSurvey,
  onUploadSiteSurveyEvidence,
  onSubmitSiteSurvey,
  onReviewSiteSurveyApproval,
  onOpenJob,
  onCreateBidPackage,
  onSelectBidPackage,
  onAddBidders,
  onRecordBidReturn,
  onRequestBidSelection,
  onReviewBidApproval,
  onPrepareBidCommitment,
  onReviewBidCommitment,
  onPrepareBidOrderPackage,
  onReviewBidOrderDelivery,
  onRecordBidOrderDelivery,
}) {
  const t = text || ((value, variables = {}, englishFallback = value) => Object.entries(variables).reduce((result, [name, item]) => result.replaceAll(`{${name}}`, String(item)), englishFallback))
  const [query, setQuery] = useState('')
  const [stage, setStage] = useState('open')
  const normalizedQuery = query.trim().toLowerCase()
  const eligible = useMemo(
    () => view === 'opportunities' ? opportunities.filter(opportunity =>
      stage === 'all' || (stage === 'open'
        ? !['won', 'lost', 'archived'].includes(opportunity.stage)
        : opportunity.stage === stage)) : [],
    [opportunities, stage, view],
  )
  const searching = Boolean(normalizedQuery)
  // Keep exact nested JSON matching, without serializing dossiers per keystroke.
  const searchText = useMemo(() => searching ? eligible.map(row => JSON.stringify(row).toLowerCase()) : null, [eligible, searching])
  const rows = useMemo(() => searchText ? eligible.filter((_, index) => searchText[index].includes(normalizedQuery)) : eligible,
    [eligible, normalizedQuery, searchText])
  const summary = forecast?.summary || {}
  const tenderSummary = bidSummary || {}

  return (
    <section className="page-grid pipeline-workspace" data-testid="pipeline-workspace">
      <div className="metrics-grid pipeline-metrics">
        {view === 'opportunities' ? (
          <>
            <Metric icon={Target} label="Open opportunities" value={summary.open || 0} hint={`${summary.total || 0} retained leads`} />
            <Metric icon={ReceiptEuro} label="Weighted forecast" value={currency.format(summary.weightedValue || 0)} hint={`${currency.format(summary.estimatedValue || 0)} unweighted`} tone="green" />
            <Metric icon={Timer} label="Follow-ups due" value={summary.overdueFollowUps || 0} hint="Internal action required" tone={summary.overdueFollowUps ? 'amber' : 'green'} />
            <Metric icon={BriefcaseBusiness} label="Converted" value={summary.converted || 0} hint={`${summary.won || 0} verified wins`} tone="blue" />
          </>
        ) : (
          <>
            <Metric icon={ClipboardList} label={t('Bid packages')} value={tenderSummary.total || 0} hint={t('{count} internal bidders', { count: tenderSummary.invited || 0 })} />
            <Metric icon={ReceiptEuro} label={t('Returns retained')} value={tenderSummary.returns || 0} hint={t('Comparable evidence')} tone="green" />
            <Metric icon={Timer} label={t('Overdue')} value={tenderSummary.overdue || 0} hint={t('Return deadline passed')} tone={tenderSummary.overdue ? 'amber' : 'green'} />
            <Metric icon={ShieldCheck} label={t('Selections')} value={tenderSummary.selected || 0} hint={t('{count} awaiting approval', { count: tenderSummary.pendingApproval || 0 })} tone="blue" />
          </>
        )}
      </div>

      <div className="pipeline-view-tabs" role="tablist" aria-label={t('Preconstruction views')}>
        <button role="tab" aria-selected={view === 'opportunities'} className={view === 'opportunities' ? 'active' : ''} onClick={() => onViewChange('opportunities')}>
          <Target size={15} /> {t('Opportunities')}
        </button>
        <button role="tab" aria-selected={view === 'bids'} className={view === 'bids' ? 'active' : ''} onClick={() => onViewChange('bids')}>
          <ClipboardList size={15} /> {t('Bid packages')}
        </button>
      </div>

      {view === 'opportunities' ? (
        <>

      <LazyControlBoundary label="market-fit controls">
        <MarketFitControl
          locale={locale}
          marketFit={marketFit}
          canManagePolicy={canManagePolicy}
          canCoordinate={canCoordinate}
          submitting={submitting}
          onRequestPolicy={onRequestMarketFitPolicy}
          onRetainAssessment={onRetainMarketFitAssessment}
        />
      </LazyControlBoundary>

      <LazyControlBoundary label="bid/no-bid controls">
        <BidDecisionControl
          locale={locale}
          bidDecisions={bidDecisions}
          canManagePolicy={canManagePolicy}
          canCoordinate={canCoordinate}
          submitting={submitting}
          onRequestPolicy={onRequestBidDecisionPolicy}
          onRequestDecision={onRequestBidDecision}
        />
      </LazyControlBoundary>

      <section className="panel pipeline-panel">
        <div className="panel-heading pipeline-heading">
          <div>
            <h2>Preconstruction pipeline</h2>
            <p>Qualify demand before work enters planning, resources, or finance.</p>
          </div>
          {canCoordinate ? (
            <button className="primary-button" onClick={onCreate}>
              <Plus size={16} />
              New opportunity
            </button>
          ) : null}
        </div>
        <div className="pipeline-toolbar">
          <label className="search-control">
            <Search size={15} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search client, scope or location" />
          </label>
          <div className="pipeline-stage-tabs" role="group" aria-label="Filter opportunities by stage">
            {['open', 'proposal', 'negotiating', 'won', 'lost', 'all'].map((option) => (
              <button key={option} className={stage === option ? 'active' : ''} onClick={() => setStage(option)}>
                {formatStatus(option)}
              </button>
            ))}
          </div>
        </div>
        {rows.length ? (
          <div className="pipeline-list">
            {rows.map((opportunity) => {
              const overdue =
                opportunity.nextFollowUpAt &&
                Date.parse(opportunity.nextFollowUpAt) <= Date.now() &&
                !['won', 'lost', 'archived'].includes(opportunity.stage)
              return (
                <article
                  className={`pipeline-row ${selectedOpportunity?.id === opportunity.id ? 'pipeline-row-selected' : ''}`}
                  key={opportunity.id}
                >
                  <button className="pipeline-row-main" onClick={() => onSelect(opportunity)}>
                    <span className="visually-hidden">{t('Open')}</span>{' '}
                    <span className={`pipeline-stage-marker pipeline-stage-${opportunity.stage}`} aria-hidden="true" />
                    <span className="pipeline-copy">
                      <span className="pipeline-title">
                        <strong>{opportunity.title}</strong>{' '}
                        <span className={`status status-${opportunity.stage}`}>{formatStatus(opportunity.stage)}</span>
                      </span>{' '}
                      <small>
                        {opportunity.client?.name || 'Client pending'} / {opportunity.service || 'Service pending'} /{' '}
                        {opportunity.city || opportunity.address || 'Location pending'}
                      </small>
                    </span>
                  </button>
                  <dl className="pipeline-values">
                    <div>
                      <dt>Value</dt>
                      <dd>{currency.format(opportunity.estimatedValue || 0)}</dd>
                    </div>
                    <div>
                      <dt>Weighted</dt>
                      <dd>{currency.format(opportunity.weightedValue || 0)}</dd>
                    </div>
                    <div>
                      <dt>Follow-up</dt>
                      <dd className={overdue ? 'pipeline-overdue' : ''}>
                        {opportunity.nextFollowUpAt ? formatDate(opportunity.nextFollowUpAt) : 'Not planned'}
                      </dd>
                    </div>
                  </dl>
                  <div className="pipeline-actions">
                    {canCoordinate ? (
                      <button className="secondary-button" onClick={() => onEdit(opportunity)}>
                        <Pencil size={15} />
                        Edit
                      </button>
                    ) : null}
                    {canCoordinate && !['won', 'lost', 'archived'].includes(opportunity.stage) ? (
                      <button className="secondary-button" onClick={() => onFollowUp(opportunity)}>
                        <MessageSquareText size={15} />
                        Follow-up
                      </button>
                    ) : null}
                    {opportunity.convertedJobId ? (
                      <button className="icon-button table-action" aria-label={`Open linked job for ${opportunity.title}`} onClick={() => onOpenJob(opportunity)}>
                        <ArrowUpRight size={16} />
                      </button>
                    ) : canCoordinate && !['won', 'lost', 'archived'].includes(opportunity.stage) ? (
                      <button className="primary-button" disabled={submitting} onClick={() => onConvert(opportunity)}>
                        <BriefcaseBusiness size={15} />
                        Create job
                      </button>
                    ) : null}
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <Empty title="No opportunities in this view" detail="Adjust the stage filter or retain a new qualified inquiry." />
        )}
      </section>

      {selectedOpportunity ? (
        <section className="panel pipeline-detail" aria-live="polite">
          <div className="panel-heading">
            <div>
              <h2>{selectedOpportunity.title}</h2>
              <p>
                {selectedOpportunity.client?.name || 'Client pending'} / {formatStatus(selectedOpportunity.stage)} /{' '}
                {selectedOpportunity.probabilityPercent}% probability
              </p>
            </div>
            <button className="icon-button" aria-label="Close opportunity detail" onClick={() => onSelect(null)}>
              <X size={17} />
            </button>
          </div>
          <div className="pipeline-detail-grid">
            <div>
              <span>Owner</span>
              <strong>{selectedOpportunity.ownerName || 'Unassigned'}</strong>
            </div>
            <div>
              <span>Decision target</span>
              <strong>{selectedOpportunity.targetDecisionAt ? formatDate(selectedOpportunity.targetDecisionAt) : 'Not set'}</strong>
            </div>
            <div>
              <span>Source</span>
              <strong>{formatStatus(selectedOpportunity.sourceChannel)}</strong>
            </div>
            <div>
              <span>Linked job</span>
              <strong>{selectedOpportunity.convertedJob?.title || 'Not converted'}</strong>
            </div>
          </div>
          {selectedOpportunity.marketFit ? (
            <div className={`pipeline-market-fit status-${selectedOpportunity.marketFit.recommendation || 'review'}`}>
              <Target size={15} />
              <strong>{formatStatus(selectedOpportunity.marketFit.recommendation || 'review')}</strong>
              <span>
                {selectedOpportunity.marketFit.score !== null && selectedOpportunity.marketFit.score !== undefined && Number.isFinite(Number(selectedOpportunity.marketFit.score))
                  ? `${selectedOpportunity.marketFit.score}% fit`
                  : 'Policy setup required'}
                {selectedOpportunity.marketFit.evidenceGaps?.length ? ` / ${selectedOpportunity.marketFit.evidenceGaps.length} evidence gap(s)` : ''}
              </span>
            </div>
          ) : null}
          {selectedOpportunity.bidDecision ? (
            <div className={`pipeline-market-fit status-${selectedOpportunity.bidDecision.evaluation?.recommendation || 'review'}`}>
              <ClipboardCheck size={15} />
              <strong>{formatStatus(selectedOpportunity.bidDecision.currentDecision?.proposedDecision || selectedOpportunity.bidDecision.pendingDecision?.proposedDecision || 'review')}</strong>
              <span>
                {selectedOpportunity.bidDecision.evaluation?.score !== null && selectedOpportunity.bidDecision.evaluation?.score !== undefined && Number.isFinite(Number(selectedOpportunity.bidDecision.evaluation.score))
                  ? `${selectedOpportunity.bidDecision.evaluation.score}% pursuit score`
                  : 'Scorecard evidence required'}
                {selectedOpportunity.bidDecision.pendingDecision ? ' / approval pending' : ''}
                {selectedOpportunity.bidDecision.stale ? ' / evidence stale' : ''}
              </span>
            </div>
          ) : null}
          <LazyControlBoundary label="site survey controls">
            <SiteSurveyControl
              locale={locale}
              opportunity={selectedOpportunity}
              canCoordinate={canCoordinate}
              canApprove={canApprove}
              submitting={submitting}
              onPlan={onPlanSiteSurvey}
              onUploadEvidence={onUploadSiteSurveyEvidence}
              onSubmit={onSubmitSiteSurvey}
              onReviewApproval={onReviewSiteSurveyApproval}
            />
          </LazyControlBoundary>
          {selectedOpportunity.description ? <p className="pipeline-description">{selectedOpportunity.description}</p> : null}
          <div className="pipeline-activity-heading">
            <div>
              <h3>Activity</h3>
              <p>Internal notes and follow-up drafts; no external delivery occurs here.</p>
            </div>
            {canCoordinate && !['won', 'lost', 'archived'].includes(selectedOpportunity.stage) ? (
              <button className="secondary-button" onClick={() => onFollowUp(selectedOpportunity)}>
                <Plus size={15} />
                Add activity
              </button>
            ) : null}
          </div>
          {selectedOpportunity.activities?.length ? (
            <div className="pipeline-activity-list">
              {selectedOpportunity.activities.map((activity) => (
                <div className="pipeline-activity" key={activity.id}>
                  <span className={`status status-${activity.status}`}>{formatStatus(activity.status)}</span>
                  <div>
                    <strong>{activity.summary}</strong>
                    <small>
                      {formatStatus(activity.activityType)} / {activity.dueAt ? `due ${formatDate(activity.dueAt)}` : formatDate(activity.createdAt)}
                    </small>
                    {activity.notes ? <p>{activity.notes}</p> : null}
                  </div>
                  {canCoordinate && !['completed', 'cancelled'].includes(activity.status) ? (
                    <button className="secondary-button" disabled={submitting} onClick={() => onCompleteActivity(selectedOpportunity, activity)}>
                      <Check size={15} />
                      Complete
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <Empty title="No retained activity" detail="Add the next internal follow-up or qualification note." />
          )}
        </section>
      ) : null}
        </>
      ) : (
        <LazyControlBoundary label="bid packages">
        <BidPackageWorkspace
          request={request}
          locale={locale}
          text={t}
          bidPackages={bidPackages}
          selectedBidPackage={selectedBidPackage}
          canCoordinate={canCoordinate}
          canApprove={canApprove}
          submitting={submitting}
          onCreate={onCreateBidPackage}
          onSelect={onSelectBidPackage}
          onAddBidders={onAddBidders}
          onRecordReturn={onRecordBidReturn}
          onRequestSelection={onRequestBidSelection}
          onReviewApproval={onReviewBidApproval}
          onPrepareCommitment={onPrepareBidCommitment}
          onReviewCommitment={onReviewBidCommitment}
          onPrepareOrderPackage={onPrepareBidOrderPackage}
          onReviewOrderDelivery={onReviewBidOrderDelivery}
          onRecordOrderDelivery={onRecordBidOrderDelivery}
        />
        </LazyControlBoundary>
      )}
    </section>
  )
}

export { PipelineWorkspace }
export default PipelineWorkspace
