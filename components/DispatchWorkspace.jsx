import { EMPTY_LIST, formatStatus } from "../dashboard-format"
import { ShieldCheck, ClipboardCheck, Users, Wrench, PackageCheck, ArrowUpRight } from "lucide-react"
import Empty from "./EmptyState"

function DispatchWorkspace({
  dispatch,
  jobs,
  canCoordinate,
  canApprove,
  submitting,
  onPrepare,
  onControl,
  onReviewWorkforce,
  onReviewEquipment,
  onOpenApprovals,
  onOpen,
}) {
  const rows = dispatch?.jobs || dispatch?.rows || dispatch?.dispatch || EMPTY_LIST
  const summary = dispatch?.summary || {}
  return (
    <section className="panel page-panel dispatch-workspace" data-testid="dispatch-workspace">
      <div className="panel-heading">
        <div>
          <h2>Dispatch readiness</h2>
          <p>Mobilization stays blocked until assignments, access, safety, equipment, and approval controls are ready.</p>
        </div>
        <span className="count-badge">{rows.length}</span>
      </div>
      <div className="dispatch-summary" aria-label="Dispatch summary">
        <div>
          <span>Ready</span>
          <strong>{summary.ready || 0}</strong>
        </div>
        <div>
          <span>Needs plan</span>
          <strong>{summary.needsPlan || 0}</strong>
        </div>
        <div>
          <span>Blocked</span>
          <strong>{summary.blocked || 0}</strong>
        </div>
        <div>
          <span>Approvals</span>
          <strong>{summary.pendingApprovals || 0}</strong>
        </div>
      </div>
      <div className="dispatch-list">
        {rows.map((item) => {
          const job = jobs.find((candidate) => candidate.id === item.jobId) || {
            id: item.jobId,
            title: item.jobTitle || item.title || 'Ledger job',
          }
          const controlActions = (item.nextActions || []).filter((action) => action.recordType && action.recordId)
          const workforceBlocker = (item.blockers || []).find((blocker) =>
            ['worker_record_missing', 'worker_retirement_pending', 'worker_unavailable', 'worker_conflict'].includes(blocker.type),
          )
          const equipmentBlocker = (item.blockers || []).find((blocker) =>
            ['tool_record_missing', 'tool_retirement_pending', 'tool_inspection_readiness', 'tool_unavailable'].includes(blocker.type),
          )
          return (
            <article className="dispatch-item" key={item.jobId || item.id}>
              <div className="dispatch-copy">
                <div className="dispatch-title">
                  <h3>{item.jobTitle || item.title || 'Ledger job'}</h3>
                  <span className={`status status-${item.readinessStatus || item.status}`}>
                    {formatStatus(item.readinessStatus || item.status)}
                  </span>
                </div>
                <p>{item.nextAction || item.summary || item.message || 'Review readiness controls before dispatch.'}</p>
                <div className="dispatch-flags">
                  {item.blockers?.length ? (
                    <span className="tag tag-amber">
                      {item.blockers.length} blocker{item.blockers.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                  {item.missing?.length ? (
                    <span className="tag">
                      {item.missing.length} plan gap{item.missing.length === 1 ? '' : 's'}
                    </span>
                  ) : null}
                  {item.counts?.activeAssignments ? <span className="tag tag-green">{item.counts.activeAssignments} assigned</span> : null}
                </div>
              </div>
              <div className="dispatch-actions">
                {item.counts?.pendingApprovals && canApprove ? (
                  <button
                    className="secondary-button"
                    aria-label={`Review approvals for ${job.title}`}
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
                    Review approval
                  </button>
                ) : null}
                {canCoordinate
                  ? controlActions.map((action) => {
                      const actionLabel = action.actionLabel || 'Resolve dispatch control'
                      return (
                        <button
                          key={`${action.type}-${action.recordType}-${action.recordId}`}
                          className="secondary-button"
                          aria-label={`${actionLabel} for ${job.title}`}
                          disabled={submitting}
                          onClick={() => onControl(item, action)}
                        >
                          <ClipboardCheck size={16} />
                          {actionLabel}
                        </button>
                      )
                    })
                  : null}
                {workforceBlocker ? (
                  <button
                    className="secondary-button"
                    aria-label={`Review crew for ${job.title}`}
                    disabled={submitting}
                    onClick={() => onReviewWorkforce(workforceBlocker)}
                  >
                    <Users size={16} />
                    Review crew
                  </button>
                ) : null}
                {equipmentBlocker ? (
                  <button
                    className="secondary-button"
                    aria-label={`Review equipment for ${job.title}`}
                    disabled={submitting}
                    onClick={() => onReviewEquipment(equipmentBlocker)}
                  >
                    <Wrench size={16} />
                    Review equipment
                  </button>
                ) : null}
                {canCoordinate ? (
                  <button
                    className="secondary-button"
                    aria-label={`Prepare internal pack for ${job.title}`}
                    disabled={submitting}
                    onClick={() => onPrepare(item)}
                  >
                    <PackageCheck size={16} />
                    Prepare internal pack
                  </button>
                ) : null}
                <button className="icon-button table-action" aria-label={`Open ${job.title}`} onClick={() => onOpen(job)}>
                  <ArrowUpRight size={16} />
                </button>
              </div>
            </article>
          )
        })}
        {!rows.length ? (
          <Empty title="No active dispatch work" detail="Active ledger jobs will appear here with their retained readiness controls." />
        ) : null}
      </div>
    </section>
  )
}

export { DispatchWorkspace }
export default DispatchWorkspace
