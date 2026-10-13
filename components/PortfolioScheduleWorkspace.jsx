import { useState, useCallback, useMemo } from "react"
import { toLocalDateTimeInput, EMPTY_LIST, formatDateTime, formatDate, formatStatus } from "../dashboard-format"
import { MapPin, Search, ShieldCheck, ArrowUpRight } from "lucide-react"
import Empty from "./EmptyState"

const PORTFOLIO_SCHEDULE_FILTERS = [
  ['all', 'Look-ahead'],
  ['risk', 'At risk'],
  ['conflict', 'Conflicts'],
  ['overdue', 'Overdue'],
  ['unscheduled', 'Unscheduled'],
  ['baseline', 'Baselines'],
]

function PortfolioScheduleWorkspace({ api, schedule, jobs, canApprove, onOpenApprovals, onOpenDispatch, onOpen }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [horizonDays, setHorizonDays] = useState(30)
  const [portfolioJobIds, setPortfolioJobIds] = useState([])
  const [portfolioStart, setPortfolioStart] = useState(() => toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)))
  const [portfolioPlan, setPortfolioPlan] = useState(null)
  const [portfolioBusy, setPortfolioBusy] = useState(false)
  const [portfolioMessage, setPortfolioMessage] = useState('')
  const [portfolioError, setPortfolioError] = useState('')
  const rows = schedule?.jobs || EMPTY_LIST
  const referenceAt = schedule?.window?.referenceAt || new Date().toISOString()
  const referenceMs = Date.parse(referenceAt)
  const horizonEndMs = referenceMs + horizonDays * 24 * 60 * 60 * 1000
  const horizonEnd = new Date(horizonEndMs).toISOString()
  const rowInWindow = useCallback((row) => {
    const start = Date.parse(row.plannedStart || '')
    const end = Date.parse(row.plannedEnd || row.targetCompletion || '')
    return Number.isFinite(start) && Number.isFinite(end) && end >= referenceMs && start <= horizonEndMs
  }, [horizonEndMs, referenceMs])
  const rowAtRisk = useCallback((row) => (
    row.flags?.conflict || row.flags?.overdue || row.flags?.baselineStale || row.flags?.invalidPlan
  ), [])
  const visibleRows = useMemo(() => {
    const search = query.trim().toLowerCase()
    return rows.filter((row) => {
      const inWindow = rowInWindow(row)
      if (filter === 'all' && !(inWindow || rowAtRisk(row) || row.flags?.unscheduled || row.flags?.baselinePending)) return false
      if (filter === 'risk' && !rowAtRisk(row)) return false
      if (filter === 'conflict' && !row.flags?.conflict) return false
      if (filter === 'overdue' && !row.flags?.overdue) return false
      if (filter === 'unscheduled' && !(row.flags?.unscheduled || row.flags?.invalidPlan)) return false
      if (filter === 'baseline' && !(row.flags?.baselinePending || row.flags?.baselineStale)) return false
      if (!search) return true
      return JSON.stringify({
        jobTitle: row.jobTitle,
        clientName: row.clientName,
        address: row.address,
        phase: row.phase,
        tasks: row.tasks?.map((task) => task.title),
      }).toLowerCase().includes(search)
    })
  }, [filter, query, rowAtRisk, rowInWindow, rows])
  const summary = useMemo(() => rows.reduce((result, row) => {
    if (rowInWindow(row)) result.inWindow += 1
    if (row.flags?.conflict) result.conflicts += 1
    if (row.flags?.overdue) result.overdue += 1
    if (row.flags?.unscheduled || row.flags?.invalidPlan) result.unscheduled += 1
    if (row.flags?.baselinePending || row.flags?.baselineStale) result.baselinePending += 1
    result.openTasks += Number(row.counts?.openTasks || 0)
    return result
  }, { inWindow: 0, conflicts: 0, overdue: 0, unscheduled: 0, baselinePending: 0, openTasks: 0 }), [rowInWindow, rows])
  const timelineTicks = useMemo(() => Array.from({ length: 5 }, (_, index) => (
    new Date(referenceMs + ((horizonEndMs - referenceMs) * index) / 4).toISOString()
  )), [horizonEndMs, referenceMs])

  const togglePortfolioJob = (jobId) => {
    setPortfolioPlan(null)
    setPortfolioError('')
    setPortfolioMessage('')
    setPortfolioJobIds((current) => current.includes(jobId)
      ? current.filter((id) => id !== jobId)
      : current.length < 8 ? [...current, jobId] : current)
  }

  const calculatePortfolioPlan = async (event) => {
    event.preventDefault()
    setPortfolioBusy(true)
    setPortfolioError('')
    setPortfolioMessage('')
    setPortfolioPlan(null)
    try {
      const result = await api('/api/ledger/work-plan/portfolio/resource-preview', {
        method: 'POST',
        body: JSON.stringify({ jobIds: portfolioJobIds, plannedStart: new Date(portfolioStart).toISOString(), horizonDays: 21 }),
      })
      setPortfolioPlan(result.plan)
      if (!result.plan.ready) setPortfolioError(result.plan.issues?.map((issue) => issue.message).filter(Boolean).join(' ')
        || 'Met de geregistreerde informatie kan nog geen gezamenlijk voorstel worden berekend.')
    } catch (error) {
      setPortfolioError(error.message || 'Het gezamenlijke voorstel kon niet worden berekend.')
    } finally {
      setPortfolioBusy(false)
    }
  }

  const requestPortfolioApproval = async () => {
    if (!portfolioPlan?.ready) return
    setPortfolioBusy(true)
    setPortfolioError('')
    try {
      const result = await api('/api/ledger/work-plan/portfolio/resource-approval', {
        method: 'POST',
        body: JSON.stringify({ plan: portfolioPlan, reason: 'Joint portfolio resource plan reviewed by the contractor.' }),
      })
      setPortfolioMessage(result.idempotent ? 'Dit voorstel staat al in de goedkeuringswachtrij.' : 'Het gezamenlijke voorstel staat in de goedkeuringswachtrij. Er is nog niets vastgelegd.')
      onOpenApprovals({ approvalId: result.approval.id })
    } catch (error) {
      setPortfolioError(error.message || 'Het voorstel kon niet naar de goedkeuringswachtrij worden gestuurd.')
    } finally {
      setPortfolioBusy(false)
    }
  }

  const timelineGeometry = (row) => {
    const start = Date.parse(row.plannedStart || '')
    const end = Date.parse(row.plannedEnd || row.targetCompletion || '')
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null
    const span = Math.max(1, horizonEndMs - referenceMs)
    const left = Math.max(0, Math.min(100, ((start - referenceMs) / span) * 100))
    const right = Math.max(0, Math.min(100, ((end - referenceMs) / span) * 100))
    return { left: `${left}%`, width: `${Math.max(2, right - left)}%` }
  }

  return (
    <section className="panel page-panel portfolio-schedule" data-testid="portfolio-schedule">
      <div className="panel-heading portfolio-schedule-heading">
        <div>
          <h2>Portfolio schedule</h2>
          <p>One retained look-ahead across task plans, baselines, overdue work, and current resource conflicts.</p>
        </div>
        {summary.conflicts ? (
          <button className="secondary-button" onClick={onOpenDispatch}>
            <MapPin size={16} />
            Review dispatch
          </button>
        ) : <span className="count-badge">{visibleRows.length}</span>}
      </div>
      <div className="portfolio-schedule-summary" aria-label="Portfolio schedule summary">
        <div><span>In look-ahead</span><strong>{summary.inWindow}</strong></div>
        <div><span>Conflicts</span><strong>{summary.conflicts}</strong></div>
        <div><span>Overdue</span><strong>{summary.overdue}</strong></div>
        <div><span>Unscheduled</span><strong>{summary.unscheduled}</strong></div>
        <div><span>Baseline review</span><strong>{summary.baselinePending}</strong></div>
        <div><span>Open tasks</span><strong>{summary.openTasks}</strong></div>
      </div>
      <div className="portfolio-schedule-toolbar">
        <div className="tab-switch portfolio-schedule-filters" role="tablist" aria-label="Schedule view">
          {PORTFOLIO_SCHEDULE_FILTERS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={filter === key}
              className={filter === key ? 'tab-active' : ''}
              onClick={() => setFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="search-control portfolio-schedule-search">
          <Search size={16} />
          <span>Search schedule</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Job, client, location, or task"
          />
        </label>
        <label className="portfolio-horizon-control">
          <span>Horizon</span>
          <select value={horizonDays} onChange={(event) => setHorizonDays(Number(event.target.value))}>
            <option value="14">14 days</option>
            <option value="30">30 days</option>
            <option value="60">60 days</option>
            <option value="90">90 days</option>
            <option value="180">180 days</option>
          </select>
        </label>
      </div>
      <form className="portfolio-resource-planner" data-testid="portfolio-resource-planner" onSubmit={calculatePortfolioPlan}>
        <div className="portfolio-resource-heading">
          <div>
            <h3>Joint crew planning</h3>
            <p>Coordinate selected jobs against shared workers, existing commitments, qualifications and recorded travel times.</p>
          </div>
          <span>{portfolioJobIds.length}/8 jobs</span>
        </div>
        <div className="portfolio-resource-controls">
          <fieldset className="portfolio-resource-jobs">
            <legend>Select jobs</legend>
            {rows.map((row) => (
              <label key={row.jobId}>
                <input type="checkbox" checked={portfolioJobIds.includes(row.jobId)} onChange={() => togglePortfolioJob(row.jobId)} disabled={portfolioBusy || (!portfolioJobIds.includes(row.jobId) && portfolioJobIds.length >= 8)} />
                <span><strong>{row.jobTitle}</strong><small>{row.address || row.clientName || 'Location not recorded'}</small></span>
              </label>
            ))}
            {!rows.length ? <p>No jobs are available in the current schedule.</p> : null}
          </fieldset>
          <div className="portfolio-resource-action">
            <label>
              <span>Shared planning start</span>
              <input type="datetime-local" value={portfolioStart} onChange={(event) => { setPortfolioStart(event.target.value); setPortfolioPlan(null) }} required />
            </label>
            <button type="submit" className="primary-button" disabled={portfolioBusy || portfolioJobIds.length < 2}>
              {portfolioBusy ? 'Calculating...' : 'Calculate joint plan'}
            </button>
            {portfolioJobIds.length < 2 ? <small>Select at least two jobs.</small> : null}
          </div>
        </div>
        {portfolioError ? <p className="portfolio-resource-alert" role="alert">{portfolioError}</p> : null}
        {portfolioMessage ? <p className="portfolio-resource-success" role="status">{portfolioMessage}</p> : null}
        {portfolioPlan?.ready ? (
          <div className="portfolio-resource-result" aria-live="polite">
            <div className="portfolio-resource-result-heading">
              <div><strong>{portfolioPlan.tasks.length} task allocations</strong><span>{portfolioPlan.heldTasks?.length || 0} held for material or predecessor constraints</span></div>
              <button type="button" className="primary-button" onClick={requestPortfolioApproval} disabled={portfolioBusy}>Request independent approval</button>
            </div>
            <div className="portfolio-resource-task-list">
              {portfolioPlan.tasks.map((task) => (
                <article key={task.taskId}>
                  <div><strong>{task.title}</strong><span>{task.jobTitle}</span></div>
                  <div>{(task.workers || []).map((worker) => `${worker.workerName} (${worker.role})`).join(', ')}</div>
                  <time>{formatDateTime(task.plannedStart)} to {formatDateTime(task.plannedEnd)}</time>
                  {(task.supervisors || []).length ? <small>Supervisor: {task.supervisors.map((worker) => worker.workerName).join(', ')}</small> : null}
                </article>
              ))}
            </div>
            <div className="portfolio-resource-routes">
              <strong>Travel assumptions</strong>
              {(portfolioPlan.travelRouteEvidence || []).map((route) => (
                <span key={`${route.fromJobId}:${route.toJobId}`}>
                  {rows.find((row) => row.jobId === route.fromJobId)?.jobTitle || route.fromJobId} to {rows.find((row) => row.jobId === route.toJobId)?.jobTitle || route.toJobId}: {route.minutesForward} min / {route.minutesReverse} min ({route.sourceType.replaceAll('_', ' ')})
                </span>
              ))}
            </div>
            <small className="portfolio-resource-note">This is a proposal only. Assignments change only after a different authorized operator approves it and all source records still match.</small>
          </div>
        ) : null}
      </form>
      <div className="portfolio-timeline-heading" aria-hidden="true">
        <span>Job and plan state</span>
        <div>
          {timelineTicks.map((tick) => <span key={tick}>{formatDate(tick)}</span>)}
        </div>
      </div>
      <div className="portfolio-schedule-list">
        {visibleRows.map((item) => {
          const job = jobs.find((candidate) => candidate.id === item.jobId) || {
            id: item.jobId,
            title: item.jobTitle || 'Ledger job',
          }
          const geometry = timelineGeometry(item)
          const visibleTasks = (item.tasks || [])
            .filter((task) => task.overdue || task.inWindow || rowInWindow({ plannedStart: task.plannedStart, plannedEnd: task.plannedEnd || task.dueAt }))
            .sort((left, right) => String(left.plannedStart || left.dueAt || '').localeCompare(String(right.plannedStart || right.dueAt || '')))
            .slice(0, 3)
          return (
            <article className={`portfolio-schedule-row schedule-${item.scheduleStatus}`} key={item.jobId}>
              <div className="portfolio-schedule-copy">
                <div className="portfolio-schedule-title">
                  <div>
                    <h3>{item.jobTitle}</h3>
                    <p>{item.clientName || 'Client not set'} / {item.address || formatStatus(item.phase)}</p>
                  </div>
                  <span className={`status status-${item.scheduleStatus}`}>{formatStatus(item.scheduleStatus)}</span>
                </div>
                <div className="portfolio-schedule-flags">
                  {item.baseline ? (
                    <span className={item.flags?.baselineStale ? 'tag tag-amber' : 'tag tag-green'}>
                      Baseline v{item.baseline.versionNumber} {item.flags?.baselineStale ? 'stale' : formatStatus(item.baseline.status)}
                    </span>
                  ) : <span className="tag">No baseline</span>}
                  {item.counts?.criticalTasks ? <span className="tag tag-red">{item.counts.criticalTasks} critical</span> : null}
                  {item.counts?.overdueTasks ? <span className="tag tag-amber">{item.counts.overdueTasks} overdue</span> : null}
                  {item.counts?.workerConflicts ? <span className="tag tag-red">Crew conflict</span> : null}
                  {item.counts?.toolConflicts ? <span className="tag tag-red">Equipment conflict</span> : null}
                </div>
                <p className="portfolio-schedule-action">{item.planError?.message || item.nextAction}</p>
                <div className="portfolio-task-list">
                  {visibleTasks.map((task) => (
                    <div key={task.id}>
                      <span className={task.critical ? 'portfolio-task-critical' : ''}>{task.title}</span>
                      <small>{task.plannedStart ? `${formatDate(task.plannedStart)} to ${formatDate(task.plannedEnd || task.dueAt)}` : 'Date not retained'}</small>
                    </div>
                  ))}
                </div>
              </div>
              <div className="portfolio-timeline-cell">
                <div className="portfolio-timeline-track">
                  {geometry ? (
                    <span
                      className={`portfolio-timeline-span timeline-${item.scheduleStatus}`}
                      style={geometry}
                      title={`${formatDateTime(item.plannedStart)} to ${formatDateTime(item.plannedEnd)}`}
                    />
                  ) : <span className="portfolio-timeline-empty">Not scheduled</span>}
                </div>
                <div className="portfolio-timeline-dates">
                  <span>{item.plannedStart ? formatDate(item.plannedStart) : 'No start'}</span>
                  <span>{item.plannedEnd ? formatDate(item.plannedEnd) : 'No finish'}</span>
                </div>
                <div className="portfolio-schedule-actions">
                  {item.flags?.baselinePending && item.baseline?.approvalId && canApprove ? (
                    <button
                      className="secondary-button"
                      onClick={() => onOpenApprovals({
                        jobId: item.jobId,
                        jobTitle: item.jobTitle,
                        approvalId: item.baseline.approvalId,
                      })}
                    >
                      <ShieldCheck size={15} />
                      Review baseline
                    </button>
                  ) : null}
                  <button className="secondary-button" onClick={() => onOpen(job)}>
                    <ArrowUpRight size={15} />
                    Open job
                  </button>
                </div>
              </div>
            </article>
          )
        })}
        {!visibleRows.length ? (
          <Empty
            title="No schedule rows match"
            detail={`No retained work matches this filter between ${formatDate(referenceAt)} and ${formatDate(horizonEnd)}.`}
          />
        ) : null}
      </div>
    </section>
  )
}

export { PortfolioScheduleWorkspace }
export default PortfolioScheduleWorkspace
