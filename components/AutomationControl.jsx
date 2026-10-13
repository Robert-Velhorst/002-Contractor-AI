import { Activity, ArrowUpRight, Check, ClipboardCheck, LoaderCircle, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { EMPTY_LIST, formatDate, formatStatus } from '../dashboard-format'
import Empty from './EmptyState'
import './JobWorkspaceControls.css'

function AutomationControl({
  commandPlan,
  scheduler,
  jobs,
  loading,
  error,
  view,
  selectedIds,
  submitting,
  onViewChange,
  onToggle,
  onSelectVisible,
  onApply,
  onRun,
  onRetry,
  onOpenApprovals,
  onOpen,
}) {
  const allActions = commandPlan?.actions || EMPTY_LIST
  const actions = allActions.filter((action) => {
    if (view === 'safe') return action.safeDraftable
    if (view === 'approval') return action.requiresApproval
    if (view === 'blocked') return action.blocked
    return true
  })
  const selected = new Set(selectedIds)
  const visibleSafeIds = actions.filter((action) => action.safeDraftable && !action.blocked).map((action) => action.id)
  const allVisibleSafeSelected = visibleSafeIds.length > 0 && visibleSafeIds.every((id) => selected.has(id))
  const summary = commandPlan?.summary || {}
  const schedulerJob = scheduler?.job || null

  return (
    <section className="panel page-panel automation-panel" data-testid="automation-control">
      <div className="panel-heading automation-heading">
        <div>
          <h2>Automation control</h2>
          <p>Prioritized ledger work, retained drafts, and durable scheduler outcomes.</p>
        </div>
        <span className={`status ${schedulerJob?.status === 'running' ? 'status-attention' : 'status-ready'}`}>
          {schedulerJob?.status || 'idle'}
        </span>
      </div>
      <div className="automation-summary" aria-label="Automation summary">
        <div>
          <span>Safe drafts</span>
          <strong>{summary.safeDraftable || 0}</strong>
        </div>
        <div>
          <span>Approval gates</span>
          <strong>{summary.approvalRequired || 0}</strong>
        </div>
        <div>
          <span>Blocked</span>
          <strong>{summary.blocked || 0}</strong>
        </div>
        <div>
          <span>External commitments</span>
          <strong>{summary.externalCommitments || 0}</strong>
        </div>
      </div>
      <div className="automation-toolbar">
        <div className="automation-tabs" role="tablist" aria-label="Automation action view">
          {[
            ['all', 'All'],
            ['safe', 'Safe drafts'],
            ['approval', 'Approvals'],
            ['blocked', 'Blocked'],
          ].map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={view === key}
              className={view === key ? 'automation-tab-active' : ''}
              onClick={() => onViewChange(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="automation-commands">
          <button
            className="secondary-button"
            disabled={submitting || loading || !visibleSafeIds.length}
            onClick={() => onSelectVisible(allVisibleSafeSelected ? [] : visibleSafeIds)}
          >
            {allVisibleSafeSelected ? <X size={15} /> : <Check size={15} />}
            {allVisibleSafeSelected ? 'Clear visible' : 'Select safe'}
          </button>
          <button className="primary-button" disabled={submitting || loading || !selectedIds.length} onClick={onApply}>
            <ClipboardCheck size={16} />
            {selectedIds.length ? `Apply ${selectedIds.length} draft${selectedIds.length === 1 ? '' : 's'}` : 'Apply selected'}
          </button>
          <button className="secondary-button" disabled={submitting || loading || schedulerJob?.status === 'running'} onClick={onRun}>
            <Activity size={16} />
            Run due cycle
          </button>
        </div>
      </div>
      {schedulerJob ? (
        <div className="automation-run-state">
          <span>Last completed</span>
          <strong>{formatDate(schedulerJob.lastCompletedAt)}</strong>
          <span>
            {schedulerJob.lastResult?.actionCount || 0} action(s), {schedulerJob.lastResult?.blockedCount || 0} blocked
          </span>
        </div>
      ) : null}
      <div className="automation-list">
        {loading && !commandPlan ? (
          <div className="loading" role="status">
            <LoaderCircle className="spin" size={22} />
            Preparing the bounded command plan
          </div>
        ) : null}
        {error && !commandPlan ? (
          <div className="audit-history-error" role="alert">
            <TriangleAlert size={16} />
            <span>{error}</span>
            <button className="secondary-button" onClick={onRetry}>Retry</button>
          </div>
        ) : null}
        {actions.map((action) => {
          const job =
            jobs.find((candidate) => candidate.id === action.jobId) ||
            (action.jobId ? { id: action.jobId, title: action.jobTitle || 'Ledger job' } : null)
          const selectable = action.safeDraftable && !action.blocked
          return (
            <article className="automation-item" key={action.id} data-action-id={action.id} data-job-id={action.jobId || ''}>
              <label className="automation-select">
                <input
                  type="checkbox"
                  disabled={!selectable || submitting}
                  checked={selectable && selected.has(action.id)}
                  onChange={(event) => onToggle(action.id, event.target.checked)}
                />
                <span className="visually-hidden">Select {action.message}</span>
              </label>
              <span className={`severity severity-${action.severity || 'medium'}`}>
                <Activity size={14} />
              </span>
              <div className="automation-copy">
                <strong>{action.jobTitle || formatStatus(action.actionType)}</strong>
                <p>{action.message}</p>
                <small>
                  {formatStatus(action.stream)} · {formatStatus(action.actionType)}
                </small>
              </div>
              <div className="automation-flags">
                {action.safeDraftable ? <span className="tag tag-green">Safe draft</span> : null}
                {action.requiresApproval ? <span className="tag tag-amber">Approval</span> : null}
                {action.blocked ? <span className="tag">Blocked</span> : null}
              </div>
              {action.approvalId ? (
                <button
                  className="icon-button table-action"
                  aria-label={`Review approval for ${action.jobTitle || 'ledger action'}`}
                  onClick={() => onOpenApprovals({ jobId: action.jobId, jobTitle: action.jobTitle, approvalId: action.approvalId })}
                >
                  <ShieldCheck size={16} />
                </button>
              ) : job ? (
                <button className="icon-button table-action" aria-label={`Open ${job.title}`} onClick={() => onOpen(job)}>
                  <ArrowUpRight size={16} />
                </button>
              ) : (
                <span className="automation-action-spacer" />
              )}
            </article>
          )
        })}
        {!loading && !error && !actions.length ? (
          <Empty title="No matching automation work" detail="The selected command-plan view has no retained action waiting." />
        ) : null}
      </div>
    </section>
  )
}

export { AutomationControl as default, AutomationControl }
