import './JobWorkspaceControls.css'
import { useEffect, useRef, useState } from 'react'
import PreconstructionDateReview from './PreconstructionDateReview'
import { Activity, Ban, CalendarDays, Calculator, Check, ChevronRight, GitBranch, PackageCheck, PackagePlus, Plus, RefreshCw, ShieldCheck, Timer, TriangleAlert, X } from 'lucide-react'
import { EMPTY_LIST, formatDate, formatDateTime, formatStatus, roundDisplay, toIsoDateTime, toLocalDateTimeInput } from '../dashboard-format'
import { operatorText } from '../operator-locale'



const SITE_ACCESS_WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

function WorkPlanControl({
  job,
  refreshScheduleKey = 0,
  locale = 'en-GB',
  canCoordinate,
  canApprove,
  fieldScoped,
  operator,
  submitting,
  taskDraft,
  setTaskDraft,
  assignees,
  onCreateTask,
  onTaskTransition,
  onUpdateTaskSchedule,
  onAddDependency,
  onCancelDependency,
  onCalculate,
  onReserveWarehouseMaterial,
  onIssueWarehouseMaterial,
  onCalculateResources,
  onSaveSiteAccessCalendar,
  onSaveTravelRoute,
  onRequestResourceApproval,
  onRequestBaseline,
  onOpenApprovals,
}) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const fallbackStartRef = useRef(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())
  const initialStart =
    job.scheduleControl?.pendingBaseline?.plannedStart ||
    job.scheduleControl?.activeBaseline?.plannedStart ||
    job.scheduleControl?.plannedStart ||
    job.scheduledStart ||
    fallbackStartRef.current
  const [plannedStart, setPlannedStart] = useState(() => toLocalDateTimeInput(initialStart))
  const [plan, setPlan] = useState(job.scheduleControl || null)
  const preconstructionCapacityForecast = job.data?.preconstructionCapacityForecast || null
  const refreshScheduleRef = useRef({ plannedStart, onCalculate })
  refreshScheduleRef.current = { plannedStart, onCalculate }
  const [resourcePlan, setResourcePlan] = useState(null)
  const resourcePreviewRef = useRef({ plannedStart, onCalculateResources })
  resourcePreviewRef.current = { plannedStart, onCalculateResources }
  const [resourceApproval, setResourceApproval] = useState(null)
  const [travelRouteDrafts, setTravelRouteDrafts] = useState({})
  const [editingTravelJobId, setEditingTravelJobId] = useState(null)
  const [siteCalendarDraft, setSiteCalendarDraft] = useState(() => ({
    timeZone: job.data?.siteAccessCalendar?.timeZone || 'Europe/Amsterdam',
    sourceType: job.data?.siteAccessCalendar?.sourceType || 'customer_confirmed',
    note: job.data?.siteAccessCalendar?.note || '',
    weeklyWindows: Object.fromEntries(SITE_ACCESS_WEEKDAYS.map(day => [day, (job.data?.siteAccessCalendar?.weeklyWindows?.[day] || []).map(window => ({ ...window }))]))
  }))
  const [dependencyDraft, setDependencyDraft] = useState({ predecessorTaskId: '', successorTaskId: '', lagHours: '0' })
  const [reservationDrafts, setReservationDrafts] = useState({})
  const [reservationStatus, setReservationStatus] = useState('')
  const [issueDrafts, setIssueDrafts] = useState({})
  const [issueStatus, setIssueStatus] = useState('')
  const [defaultIssueArrival] = useState(() => toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()))
  const [durationEdits, setDurationEdits] = useState(() =>
    Object.fromEntries((job.tasks || EMPTY_LIST).map((task) => [task.id, String(task.durationHours || '')])),
  )

  useEffect(() => {
    const control = job.scheduleControl || null
    setPlan(control)
    setReservationDrafts({})
    setReservationStatus('')
    setIssueDrafts({})
    setIssueStatus('')
    setResourcePlan(null)
    setResourceApproval(null)
    setTravelRouteDrafts({})
    setEditingTravelJobId(null)
    const calendar = job.data?.siteAccessCalendar
    setSiteCalendarDraft({
      timeZone: calendar?.timeZone || 'Europe/Amsterdam',
      sourceType: calendar?.sourceType || 'customer_confirmed',
      note: calendar?.note || '',
      weeklyWindows: Object.fromEntries(SITE_ACCESS_WEEKDAYS.map(day => [day, (calendar?.weeklyWindows?.[day] || []).map(window => ({ ...window }))]))
    })
    setPlannedStart(
      toLocalDateTimeInput(
        control?.pendingBaseline?.plannedStart ||
          control?.activeBaseline?.plannedStart ||
          control?.plannedStart ||
          job.scheduledStart ||
          initialStart,
      ),
    )
    setDurationEdits(Object.fromEntries((job.tasks || EMPTY_LIST).map((task) => [task.id, String(task.durationHours || '')])))
    setDependencyDraft({ predecessorTaskId: '', successorTaskId: '', lagHours: '0' })
  }, [initialStart, job])

  useEffect(() => {
    if (!refreshScheduleKey) return
    let active = true
    const current = refreshScheduleRef.current
    current.onCalculate({ plannedStart: toIsoDateTime(current.plannedStart), horizonDays: 14 }).then(result => {
      if (active && result) setPlan(result)
    })
    return () => { active = false }
  }, [refreshScheduleKey])

  useEffect(() => {
    let active = true
    const openResourcePreview = event => {
      const detail = event.detail || {}
      if (detail.targetId !== 'job-task-control' || detail.jobId !== job.id || detail.runResourcePreview !== true) return
      const current = resourcePreviewRef.current
      if (typeof current.onCalculateResources !== 'function' || !current.plannedStart) return
      current.onCalculateResources({ plannedStart: toIsoDateTime(current.plannedStart), horizonDays: 14 })
        .then(result => { if (active) { setResourcePlan(result); setResourceApproval(null) } })
    }
    window.addEventListener('contractor:dossier-navigate', openResourcePreview)
    return () => { active = false; window.removeEventListener('contractor:dossier-navigate', openResourcePreview) }
  }, [job.id])

  const tasks = job.tasks || EMPTY_LIST
  const activeTasks = tasks.filter((task) => !['completed', 'cancelled'].includes(task.status))
  const dependencies = (job.taskDependencies || EMPTY_LIST).filter((dependency) => dependency.status === 'active')
  const taskById = new Map(tasks.map((task) => [task.id, task]))
  const calculatedById = new Map((plan?.tasks || EMPTY_LIST).map((task) => [task.id, task]))
  const pendingBaseline = job.scheduleControl?.pendingBaseline || null
  const activeBaseline = job.scheduleControl?.activeBaseline || null
  const baselineState = pendingBaseline
    ? { label: t('Baseline v{version} pending', { version: pendingBaseline.versionNumber }), className: 'tag-amber' }
    : job.scheduleControl?.baselineStale
      ? { label: t('Baseline v{version} stale', { version: activeBaseline?.versionNumber || '?' }), className: 'tag-amber' }
      : job.scheduleControl?.baselineCurrent
        ? { label: t('Baseline v{version} current', { version: activeBaseline?.versionNumber }), className: 'tag-green' }
        : { label: t('No approved baseline'), className: '' }
  const totalDuration = activeTasks.reduce((sum, task) => sum + Number(task.durationHours || 0), 0)

  async function calculate(event) {
    event.preventDefault()
    const result = await onCalculate({ plannedStart: toIsoDateTime(plannedStart), horizonDays: 14 })
    if (result) setPlan(result)
  }

  async function reserveWarehouseMaterial(event, constraint) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    setReservationStatus('')
    const allocation = await onReserveWarehouseMaterial(constraint, {
      quantity: Number(fields.get('quantity')),
      sourceReference: fields.get('sourceReference'),
      note: fields.get('note'),
    })
    if (!allocation) return
    setReservationDrafts(current => {
      const next = { ...current }
      delete next[constraint.materialRequirementId]
      return next
    })
    setReservationStatus(t('Warehouse stock reserved for this job. Site issue and arrival are still required before the task is ready.'))
    const refreshedPlan = await onCalculate({ plannedStart: toIsoDateTime(plannedStart), horizonDays: 14 })
    if (refreshedPlan) setPlan(refreshedPlan)
  }

  async function issueWarehouseMaterial(event, constraint) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setIssueStatus('')
    const result = await onIssueWarehouseMaterial(constraint, {
      quantity: Number(fields.get('quantity')),
      expectedArrivalAt: fields.get('expectedArrivalAt'),
      dispatchReference: fields.get('dispatchReference'),
      evidenceReference: fields.get('evidenceReference'),
      note: fields.get('note'),
    })
    if (!result) return
    setIssueDrafts(current => {
      const next = { ...current }
      delete next[constraint.materialRequirementId]
      return next
    })
    setIssueStatus(t('Warehouse issue recorded. The work plan now uses its referenced arrival estimate; confirm receipt at the site.'))
    const refreshedPlan = await onCalculate({ plannedStart: toIsoDateTime(plannedStart), horizonDays: 14 })
    if (refreshedPlan) setPlan(refreshedPlan)
  }

  function updateIssueDraft(requirementId, field, value) {
    setIssueDrafts(current => ({
      ...current,
      [requirementId]: { ...current[requirementId], [field]: value },
    }))
  }

  function updateReservationDraft(requirementId, field, value) {
    setReservationDrafts(current => ({
      ...current,
      [requirementId]: { ...current[requirementId], [field]: value },
    }))
  }

  async function calculateResources() {
    const result = await onCalculateResources({ plannedStart: toIsoDateTime(plannedStart), horizonDays: 14 })
    setResourcePlan(result)
    setResourceApproval(null)
  }

  function addSiteAccessWindow(day) {
    setSiteCalendarDraft(current => ({
      ...current,
      weeklyWindows: {
        ...current.weeklyWindows,
        [day]: [...current.weeklyWindows[day], { start: '08:00', end: '17:00' }]
      }
    }))
  }

  function updateSiteAccessWindow(day, index, field, value) {
    setSiteCalendarDraft(current => ({
      ...current,
      weeklyWindows: {
        ...current.weeklyWindows,
        [day]: current.weeklyWindows[day].map((window, windowIndex) => windowIndex === index ? { ...window, [field]: value } : window)
      }
    }))
  }

  function removeSiteAccessWindow(day, index) {
    setSiteCalendarDraft(current => ({
      ...current,
      weeklyWindows: {
        ...current.weeklyWindows,
        [day]: current.weeklyWindows[day].filter((_, windowIndex) => windowIndex !== index)
      }
    }))
  }

  async function saveSiteAccessCalendar(event) {
    event.preventDefault()
    const calendar = await onSaveSiteAccessCalendar(siteCalendarDraft)
    if (calendar) setSiteCalendarDraft({
      timeZone: calendar.timeZone,
      sourceType: calendar.sourceType,
      note: calendar.note,
      weeklyWindows: Object.fromEntries(SITE_ACCESS_WEEKDAYS.map(day => [day, calendar.weeklyWindows[day].map(window => ({ ...window }))]))
    })
  }

  function travelDraftFor(issue) {
    const existing = issue.existingRoute
    const sourceType = existing?.sourceType === 'same_site' && !issue.sameSite
      ? 'map_reference'
      : existing?.sourceType || (issue.sameSite ? 'same_site' : 'map_reference')
    return travelRouteDrafts[issue.externalJobId] || {
      minutesToExternal: String(sourceType === 'same_site' ? 0 : Number(existing?.minutesToExternal) || 15),
      minutesFromExternal: String(sourceType === 'same_site' ? 0 : Number(existing?.minutesFromExternal) || 15),
      sourceType,
      note: existing?.note || ''
    }
  }

  function updateTravelDraft(jobId, field, value) {
    setTravelRouteDrafts(current => ({ ...current, [jobId]: { ...travelDraftFor({ externalJobId: jobId, existingRoute: null }), ...current[jobId], [field]: value } }))
  }

  async function saveTravelRoute(event, issue) {
    event.preventDefault()
    const draft = travelDraftFor(issue)
    const saved = await onSaveTravelRoute({
      externalJobId: issue.externalJobId,
      minutesToExternal: Number(draft.minutesToExternal),
      minutesFromExternal: Number(draft.minutesFromExternal),
      sourceType: draft.sourceType,
      note: draft.note
    })
    if (!saved) return
    setTravelRouteDrafts(current => ({ ...current, [issue.externalJobId]: {
      minutesToExternal: String(saved.minutesToExternal),
      minutesFromExternal: String(saved.minutesFromExternal),
      sourceType: saved.sourceType,
      note: saved.note
    } }))
    setEditingTravelJobId(null)
    const refreshed = await onCalculateResources({ plannedStart: toIsoDateTime(plannedStart), horizonDays: 14 })
    setResourcePlan(refreshed)
    setResourceApproval(null)
  }

  function editTravelRoute(route) {
    setTravelRouteDrafts(current => ({ ...current, [route.externalJobId]: {
      minutesToExternal: String(route.minutesToExternal),
      minutesFromExternal: String(route.minutesFromExternal),
      sourceType: route.sourceType,
      note: route.note
    } }))
    setEditingTravelJobId(route.externalJobId)
  }

  async function requestResourceApproval() {
    const result = await onRequestResourceApproval(resourcePlan)
    if (result?.approval) setResourceApproval(result.approval)
  }

  async function requestBaseline() {
    const result = await onRequestBaseline({ plannedStart: toIsoDateTime(plannedStart) })
    if (result?.plan) setPlan(result.plan)
  }

  async function addDependency(event) {
    event.preventDefault()
    const result = await onAddDependency({ ...dependencyDraft, lagHours: Number(dependencyDraft.lagHours || 0) })
    if (result) setDependencyDraft({ predecessorTaskId: '', successorTaskId: '', lagHours: '0' })
  }

  async function saveDuration(task) {
    const durationHours = Number(durationEdits[task.id])
    if (!Number.isFinite(durationHours) || durationHours <= 0) return
    await onUpdateTaskSchedule(task, { durationHours })
  }

  return (
    <section id="job-task-control" className="job-workspace-section work-plan-control" data-testid="job-task-control">
      <div className="section-heading work-plan-heading">
        <GitBranch size={18} />
        <div>
          <h3>{t('Work plan')}</h3>
          <p>
            {t('{active} active / {dependencies} dependencies', {
              active: activeTasks.length,
              dependencies: dependencies.length,
            })}
          </p>
        </div>
        <span className={`tag ${baselineState.className}`}>{baselineState.label}</span>
      </div>

      <div className="work-plan-metrics" aria-label={t('Work plan summary')}>
        <div>
          <span>{t('Active work')}</span>
          <strong>{activeTasks.length}</strong>
        </div>
        <div>
          <span>{t('Task hours')}</span>
          <strong>{roundDisplay(totalDuration)}h</strong>
        </div>
        <div>
          <span>{t('Plan span')}</span>
          <strong>{plan?.ready ? `${roundDisplay(plan.projectDurationHours)}h` : t('Incomplete')}</strong>
        </div>
        <div>
          <span>{t('Critical tasks')}</span>
          <strong>{plan?.criticalPathTaskIds?.length || 0}</strong>
        </div>
      </div>

      {preconstructionCapacityForecast?.forecast?.trades?.length ? <details className="work-plan-preconstruction-forecast" data-testid="preconstruction-capacity-forecast">
        <summary>{t('Preconstruction crew estimate')} · {t('not yet assigned')}</summary>
        <p>{t('Carried from an opportunity as a planning basis. Recheck it against the accepted scope and current work plan.')}</p>
        <ul>{preconstructionCapacityForecast.forecast.trades.map((trade, index) => <li key={`${trade.role}-${index}`}>
          <strong>{trade.role}</strong><span>{t('{hours} h estimated', { hours: roundDisplay(trade.hours) })}</span>
          {trade.requiredQualifications?.length ? <small>{t('Required qualifications')}: {trade.requiredQualifications.join(', ')}</small> : null}
          {trade.supervision ? <small>{t('Supervision')}: {trade.supervision.role} / {t('maximum {count} workers per supervisor', { count: trade.supervision.workersPerSupervisor })} / {t('{count} supervision day(s)', { count: trade.supervision.dailyDemand.length })}</small> : null}
          {trade.dailyDemand?.length ? <small>{trade.dailyDemand.map(day => `${day.date}: ${roundDisplay(day.hours)} h`).join(' · ')}</small> : null}
          {trade.supervision?.dailyDemand?.length ? <small>{trade.supervision.dailyDemand.map(day => `${day.date}: ${day.crewSize} ${t('workers')} / ${Math.ceil(day.crewSize / trade.supervision.workersPerSupervisor)} ${t('supervisors')} × ${roundDisplay(day.supervisorShiftHours)} h`).join(' · ')}</small> : null}
        </li>)}</ul>
        <small>{t('Planning estimate only. It does not create tasks, assign workers, validate statutory ratios, or replace approval.')}</small>
      </details> : null}

      {plan?.reason === 'material_availability_unresolved' ? (
        <div className="notice notice-warning" role="alert">
          <strong>{t('Material availability blocks this internal plan')}</strong>
          <p>{t('Record verified stock or a referenced expected availability date. Estimates only; no supplier order or customer commitment.')}</p>
          {(plan.materialBlockers || []).map((blocker) => (
            <div key={`${blocker.taskId}-${blocker.materialRequirementId}`} className="work-plan-material-blocker">
              <small>
                {blocker.taskTitle}: {blocker.materialName} missing ({blocker.availableQuantity}/{blocker.requiredQuantity || '?'} {blocker.unit || ''})
              </small>
              {Number.isFinite(blocker.warehouseStockQuantity) ? (
                <small>
                  {t('Warehouse position')}: {t('free')} {blocker.warehouseAvailableQuantity} / {t('reserved for this job')} {blocker.warehouseReservedForRequirement} / {t('reserved for other jobs')} {blocker.warehouseReservedForOtherJobs} / {t('in transit')} {blocker.inTransitQuantity} {blocker.unit || ''}
                </small>
              ) : null}
              {blocker.reason === 'in_transit_quantity_insufficient' ? (
                <small>{t('The quantity currently in transit does not cover the remaining requirement; confirm another evidenced delivery before planning this task.')}</small>
              ) : null}
              {canCoordinate && Number.isFinite(blocker.warehouseStockQuantity)
                && Number(blocker.warehouseAvailableQuantity) > 0
                && Number(blocker.warehouseReservedForRequirement) <= 0
                && (plan.materialBlockers || []).findIndex(item => item.materialRequirementId === blocker.materialRequirementId) === (plan.materialBlockers || []).indexOf(blocker) ? (
                <details className="work-plan-stock-reservation">
                  <summary>{t('Reserve free warehouse stock')}</summary>
                  <form className="form-grid compact-form" onSubmit={event => reserveWarehouseMaterial(event, blocker)}>
                    <label>
                      {t('Quantity to reserve')} ({blocker.unit || ''})
                      <input
                        name="quantity"
                        type="number"
                        min="0.0001"
                        max={blocker.warehouseAvailableQuantity}
                        step="0.0001"
                        required
                        value={reservationDrafts[blocker.materialRequirementId]?.quantity
                          ?? String(Math.min(Number(blocker.shortfall || 0), Number(blocker.warehouseAvailableQuantity)))}
                        onChange={event => updateReservationDraft(blocker.materialRequirementId, 'quantity', event.target.value)}
                      />
                    </label>
                    <label>
                      {t('Stock count or source reference')}
                      <input
                        name="sourceReference"
                        required
                        maxLength={240}
                        value={reservationDrafts[blocker.materialRequirementId]?.sourceReference || ''}
                        onChange={event => updateReservationDraft(blocker.materialRequirementId, 'sourceReference', event.target.value)}
                      />
                    </label>
                    <label>
                      {t('Reservation note')}
                      <input
                        name="note"
                        maxLength={1000}
                        value={reservationDrafts[blocker.materialRequirementId]?.note || ''}
                        onChange={event => updateReservationDraft(blocker.materialRequirementId, 'note', event.target.value)}
                      />
                    </label>
                    <button type="submit" className="secondary-button" disabled={submitting}>
                      <PackagePlus size={15} />{t('Confirm warehouse reservation')}
                    </button>
                  </form>
                </details>
                ) : null}
              {canCoordinate && Number(blocker.warehouseReservedForRequirement) > 0
                && blocker.warehouseAllocationId
                && (plan.materialBlockers || []).findIndex(item => item.materialRequirementId === blocker.materialRequirementId) === (plan.materialBlockers || []).indexOf(blocker) ? (
                <details className="work-plan-stock-reservation">
                  <summary>{t('Issue reserved stock to the job site')}</summary>
                  <form className="form-grid compact-form" onSubmit={event => issueWarehouseMaterial(event, blocker)}>
                    <label>
                      {t('Quantity to issue')} ({blocker.unit || ''})
                      <input
                        name="quantity"
                        type="number"
                        min="0.0001"
                        max={blocker.warehouseReservedForRequirement}
                        step="0.0001"
                        required
                        value={issueDrafts[blocker.materialRequirementId]?.quantity
                          ?? String(Math.min(Number(blocker.shortfall || 0), Number(blocker.warehouseReservedForRequirement)))}
                        onChange={event => updateIssueDraft(blocker.materialRequirementId, 'quantity', event.target.value)}
                      />
                    </label>
                    <label>
                      {t('Expected arrival at job site')}
                      <input
                        name="expectedArrivalAt"
                        type="datetime-local"
                        required
                        value={issueDrafts[blocker.materialRequirementId]?.expectedArrivalAt ?? defaultIssueArrival}
                        onChange={event => updateIssueDraft(blocker.materialRequirementId, 'expectedArrivalAt', event.target.value)}
                      />
                    </label>
                    <label>
                      {t('Dispatch reference')}
                      <input
                        name="dispatchReference"
                        required
                        maxLength={240}
                        value={issueDrafts[blocker.materialRequirementId]?.dispatchReference || ''}
                        onChange={event => updateIssueDraft(blocker.materialRequirementId, 'dispatchReference', event.target.value)}
                      />
                    </label>
                    <label>
                      {t('Issue evidence reference')}
                      <input
                        name="evidenceReference"
                        required
                        maxLength={240}
                        value={issueDrafts[blocker.materialRequirementId]?.evidenceReference || ''}
                        onChange={event => updateIssueDraft(blocker.materialRequirementId, 'evidenceReference', event.target.value)}
                      />
                    </label>
                    <label>
                      {t('Reservation note')}
                      <input
                        name="note"
                        maxLength={1000}
                        value={issueDrafts[blocker.materialRequirementId]?.note || ''}
                        onChange={event => updateIssueDraft(blocker.materialRequirementId, 'note', event.target.value)}
                      />
                    </label>
                    <button type="submit" className="secondary-button" disabled={submitting}>
                      <PackageCheck size={15} />{t('Record issue to the job site')}
                    </button>
                  </form>
                </details>
                ) : null}
            </div>
          ))}
        </div>
      ) : null}
      {reservationStatus ? <p className="form-success" role="status">{reservationStatus}</p> : null}
      {issueStatus ? <p className="form-success" role="status">{issueStatus}</p> : null}
      {plan?.ready && plan.materialConstraints?.length ? (
        <div className="notice notice-warning" role="status">
          <strong>{t('Plan uses estimated material availability')}</strong>
          <p>{t('Affected tasks are scheduled from retained estimates. This is internal planning only, not a supplier order or customer commitment.')}</p>
        </div>
      ) : null}

      {canCoordinate ? (
        <form className="form-grid compact-form task-create-form work-plan-task-form" onSubmit={onCreateTask}>
          <label className="form-span">
            {t('Task title')}
            <input
              required
              value={taskDraft.title}
              onChange={(event) => setTaskDraft({ ...taskDraft, title: event.target.value })}
              placeholder={t('Work item')}
            />
          </label>
          <label>
            {t('Duration (hours)')}
            <input
              required
              type="number"
              min="0.25"
              max="10000"
              step="0.25"
              value={taskDraft.durationHours}
              onChange={(event) => setTaskDraft({ ...taskDraft, durationHours: event.target.value })}
            />
          </label>
          <label>
            {t('Priority')}
            <select value={taskDraft.priority} onChange={(event) => setTaskDraft({ ...taskDraft, priority: event.target.value })}>
              <option value="low">{t('Low')}</option>
              <option value="medium">{t('Medium')}</option>
              <option value="high">{t('High')}</option>
              <option value="critical">{t('Critical')}</option>
            </select>
          </label>
          <label>
            {t('Due date')}
            <input type="date" value={taskDraft.dueAt} onChange={(event) => setTaskDraft({ ...taskDraft, dueAt: event.target.value })} />
          </label>
          <label>
            {t('Predecessor')}
            <select
              value={taskDraft.predecessorTaskId}
              onChange={(event) => setTaskDraft({ ...taskDraft, predecessorTaskId: event.target.value })}
            >
              <option value="">{t('No predecessor')}</option>
              {activeTasks.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.title}
                </option>
              ))}
            </select>
          </label>
          <label className="form-span">
            {t('Assignee')}
            <select value={taskDraft.assigneeId} onChange={(event) => setTaskDraft({ ...taskDraft, assigneeId: event.target.value })}>
              <option value="">{t('Unassigned')}</option>
              {assignees.map((assignee) => (
                <option key={assignee.id} value={assignee.id}>
                  {assignee.name}
                </option>
              ))}
            </select>
          </label>
          {(taskDraft.requiredCrewRequirements || [{ role: taskDraft.requiredTrade || '', count: taskDraft.requiredCrewSize || '1' }]).map((requirement, index, requirements) => (
            <div className="task-crew-requirement form-span" key={`crew-requirement-${index}`}>
              <label>
                {t('Trade group {number}', { number: index + 1 })}
                <input
                  required
                  maxLength={80}
                  value={requirement.role || ''}
                  onChange={event => setTaskDraft({ ...taskDraft, requiredCrewRequirements: requirements.map((item, itemIndex) => itemIndex === index ? { ...item, role: event.target.value } : item) })}
                  placeholder={t('For example, carpenter or electrician')}
                />
              </label>
              <label>
                {t('Workers in group {number}', { number: index + 1 })}
                <input
                  required
                  type="number"
                  min="1"
                  max="12"
                  step="1"
                  value={requirement.count || '1'}
                  onChange={event => setTaskDraft({ ...taskDraft, requiredCrewRequirements: requirements.map((item, itemIndex) => itemIndex === index ? { ...item, count: event.target.value } : item) })}
                />
              </label>
              {requirements.length > 1 ? (
                <button type="button" className="icon-button" aria-label={t('Remove trade group {number}', { number: index + 1 })}
                  title={t('Remove trade group {number}', { number: index + 1 })}
                  onClick={() => setTaskDraft({ ...taskDraft, requiredCrewRequirements: requirements.filter((_, itemIndex) => itemIndex !== index) })}>
                  <X size={15} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          ))}
          {(taskDraft.requiredCrewRequirements || []).length < 8 ? (
            <button type="button" className="secondary-button form-span" onClick={() => setTaskDraft({
              ...taskDraft,
              requiredCrewRequirements: [...(taskDraft.requiredCrewRequirements || [{ role: taskDraft.requiredTrade || '', count: taskDraft.requiredCrewSize || '1' }]), { role: '', count: '1' }]
            })}>
              <Plus size={15} aria-hidden="true" />{t('Add trade group')}
            </button>
          ) : null}
          <div className="task-supervision-settings form-span">
            <label>
              {t('Workers per supervisor')}
              <input type="number" min="1" max="12" step="1" value={taskDraft.workersPerSupervisor || ''}
                aria-label={t('Workers per supervisor')}
                onChange={event => setTaskDraft({ ...taskDraft, workersPerSupervisor: event.target.value })}
                placeholder={t('No ratio set')} />
            </label>
            <label>
              {t('Named supervisors')}
              <select multiple required={Boolean(taskDraft.workersPerSupervisor)} value={taskDraft.supervisorWorkerIds || []} aria-label={t('Named supervisors')}
                onChange={event => setTaskDraft({ ...taskDraft, supervisorWorkerIds: Array.from(event.target.selectedOptions, option => option.value) })}>
                {assignees.filter(assignee => assignee.id !== taskDraft.assigneeId).map(assignee => (
                  <option key={assignee.id} value={assignee.id}>{assignee.name} · {assignee.role || t('Assigned worker')}</option>
                ))}
              </select>
            </label>
            <small>{taskDraft.workersPerSupervisor
              ? t('Ratio requires {required} supervisors; {selected} selected', {
                required: Math.ceil(Math.max(1, (taskDraft.requiredCrewRequirements || []).reduce((sum, item) => sum + Number(item.count || 0), 0)) / Number(taskDraft.workersPerSupervisor)),
                selected: (taskDraft.supervisorWorkerIds || []).length,
              })
              : t('When a ratio is set, the named qualified supervisors must cover the crew and task window.')}</small>
          </div>
          {(job.materials || EMPTY_LIST).length ? (
            <label className="form-span">
              {t('Required materials')}
              <select
                multiple
                value={taskDraft.materialRequirementIds || []}
                aria-label={t('Required materials')}
                onChange={(event) => setTaskDraft({
                  ...taskDraft,
                  materialRequirementIds: Array.from(event.target.selectedOptions, (option) => option.value),
                })}
              >
                {job.materials.map((material) => (
                  <option key={material.id} value={material.id}>
                    {material.name} ({material.quantity} {material.unit})
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="form-actions form-span">
            <button className="secondary-button" disabled={submitting || !taskDraft.title.trim() || Number(taskDraft.durationHours) <= 0}>
              <Plus size={16} />
              {t('Add task')}
            </button>
          </div>
        </form>
      ) : null}

      {tasks.length ? (
        <div className="work-plan-task-list" role="list">
          {tasks.map((task) => {
            const terminal = ['completed', 'cancelled'].includes(task.status)
            const scheduled = calculatedById.get(task.id) || task
            const assignedWorker = assignees.find((assignee) => assignee.id === task.assigneeId)
            const canUpdateTask = canCoordinate || (fieldScoped && (!task.assigneeId || task.assigneeId === operator.worker?.id))
            return (
              <article
                className={`work-plan-task ${scheduled.critical ? 'is-critical' : ''} ${terminal ? 'is-terminal' : ''}`}
                key={task.id}
                role="listitem"
                data-testid={`job-task-${task.id}`}
              >
                <div className="work-plan-task-index" aria-hidden="true">
                  <span />
                </div>
                <div className="work-plan-task-copy">
                  <div>
                    <strong>{task.title}</strong>
                    {scheduled.critical ? <span className="tag tag-red">{t('Critical')}</span> : null}
                    {!terminal && Number(scheduled.totalFloatHours) > 0 ? (
                      <span className="tag">{t('{hours}h float', { hours: roundDisplay(scheduled.totalFloatHours) })}</span>
                    ) : null}
                  </div>
                  <small>
                    {t('{assignee} / {priority} / due {date}', {
                      assignee: assignedWorker?.name || (task.assigneeId ? t('Assigned crew') : t('Unassigned')),
                      priority: t(formatStatus(task.priority)),
                      date: formatDate(task.dueAt),
                    })}
                  </small>
                  {(task.data?.supervisorWorkerIds?.length || task.data?.supervisorWorkerId) ? (
                    <small className="work-plan-supervisor">{t('Supervised by {name} · {role}', {
                      name: (task.data.supervisorWorkerIds || [task.data.supervisorWorkerId]).map(id => assignees.find(item => item.id === id)?.name || t('Assigned supervisor')).join(', '),
                      role: task.data.supervisorTrade || t('Role needs review'),
                    })}{task.data.supervisionRatio ? ` · ${t('Required supervision ratio: one per {count} workers', { count: task.data.supervisionRatio.workersPerSupervisor })}` : ''}</small>
                  ) : null}
                  {scheduled.plannedStart && scheduled.plannedEnd ? (
                    <span className="work-plan-window">
                      <CalendarDays size={14} />
                      {t('{start} to {end}', {
                        start: formatDateTime(scheduled.plannedStart),
                        end: formatDateTime(scheduled.plannedEnd),
                      })}
                    </span>
                  ) : null}
                  {task.data?.replacementScheduleReviewRequired ? (
                    <div className="work-plan-replacement-review" role="note" data-testid={`replacement-schedule-review-${task.id}`}>
                      <strong>{t('Replacement schedule review required')}</strong>
                      <small>{t('This task moved to a replacement worker. Retain a complete schedule before allocating hours.')}</small>
                      {canCoordinate ? (
                        <button type="button" className="secondary-button" disabled={submitting} onClick={calculateResources}>
                          <CalendarDays size={14} />{t('Review replacement schedule')}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {scheduled.materialConstraints?.length ? (
                    <small className="work-plan-material-constraints">
                      {scheduled.materialConstraints.map((constraint) => (
                        <span key={constraint.materialRequirementId}>
                          <span className={`tag ${constraint.blocker ? 'tag-red' : 'tag-amber'}`}>
                            {constraint.materialName}: {constraint.availableQuantity}/{constraint.requiredQuantity} {constraint.unit || ''}
                            {constraint.expectedAvailableAt ? ` / ETA ${formatDateTime(constraint.expectedAvailableAt)}` : ` / ${t('date needed')}`}
                          </span>
                          {Number.isFinite(constraint.warehouseStockQuantity) ? (
                            <small className="work-plan-material-stock-position">
                              {t('Warehouse')}: {constraint.warehouseAvailableQuantity} {t('free')}, {constraint.warehouseReservedForRequirement} {t('reserved for this job')}, {constraint.warehouseReservedForOtherJobs} {t('reserved for other jobs')}, {constraint.inTransitQuantity} {t('in transit')} {constraint.unit || ''}
                            </small>
                          ) : null}
                        </span>
                      ))}
                    </small>
                  ) : null}
                </div>
                <div className="work-plan-duration">
                  {canCoordinate && !terminal ? (
                    <>
                      <label>
                        <span className="visually-hidden">{t('Duration hours for {task}', { task: task.title })}</span>
                        <input
                          type="number"
                          min="0.25"
                          max="10000"
                          step="0.25"
                          value={durationEdits[task.id] ?? ''}
                          onChange={(event) => setDurationEdits({ ...durationEdits, [task.id]: event.target.value })}
                        />
                      </label>
                      <button
                        type="button"
                        className="icon-button"
                        title={t('Save duration')}
                        aria-label={t('Save duration for {task}', { task: task.title })}
                        disabled={
                          submitting || Number(durationEdits[task.id]) <= 0 || Number(durationEdits[task.id]) === Number(task.durationHours)
                        }
                        onClick={() => saveDuration(task)}
                      >
                        <Check size={15} />
                      </button>
                    </>
                  ) : (
                    <strong>{roundDisplay(task.durationHours)}h</strong>
                  )}
                </div>
                <div className="task-actions work-plan-task-actions">
                  <span className={`status status-${task.status}`}>{formatStatus(task.status)}</span>
                  {canUpdateTask && !terminal && task.status !== 'in_progress' ? (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={submitting}
                      aria-label={t('Start {task}', { task: task.title })}
                      onClick={() => onTaskTransition(task, 'in_progress')}
                    >
                      <Activity size={15} />
                      {t('Start')}
                    </button>
                  ) : null}
                  {canUpdateTask && !terminal ? (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={submitting}
                      aria-label={t('Complete {task}', { task: task.title })}
                      onClick={() => onTaskTransition(task, 'completed')}
                    >
                      <Check size={15} />
                      {t('Complete')}
                    </button>
                  ) : null}
                  {canUpdateTask && !terminal && task.status !== 'blocked' ? (
                    <button
                      type="button"
                      className="icon-button"
                      disabled={submitting}
                      title={t('Block task')}
                      aria-label={t('Block {task}', { task: task.title })}
                      onClick={() => onTaskTransition(task, 'blocked')}
                    >
                      <TriangleAlert size={15} />
                    </button>
                  ) : null}
                  {canCoordinate && !terminal ? (
                    <button
                      type="button"
                      className="icon-button"
                      disabled={submitting}
                      title={t('Cancel task')}
                      aria-label={t('Cancel {task}', { task: task.title })}
                      onClick={() => onTaskTransition(task, 'cancelled')}
                    >
                      <Ban size={15} />
                    </button>
                  ) : null}
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <p className="workflow-note task-empty">{t('No retained tasks for this job.')}</p>
      )}

      {canCoordinate && activeTasks.length > 1 ? (
        <div className="work-plan-dependencies">
          <div className="work-plan-subheading">
            <div>
              <GitBranch size={16} />
              <h4>{t('Dependencies')}</h4>
            </div>
            <span>{t('{count} active', { count: dependencies.length })}</span>
          </div>
          <form className="dependency-form" onSubmit={addDependency}>
            <label>
              {t('Predecessor')}
              <select
                required
                value={dependencyDraft.predecessorTaskId}
                onChange={(event) => setDependencyDraft({ ...dependencyDraft, predecessorTaskId: event.target.value })}
              >
                <option value="">{t('Select task')}</option>
                {activeTasks.map((task) => (
                  <option key={task.id} value={task.id}>
                    {task.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {t('Successor')}
              <select
                required
                value={dependencyDraft.successorTaskId}
                onChange={(event) => setDependencyDraft({ ...dependencyDraft, successorTaskId: event.target.value })}
              >
                <option value="">{t('Select task')}</option>
                {activeTasks
                  .filter((task) => task.id !== dependencyDraft.predecessorTaskId)
                  .map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.title}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              {t('Lag (hours)')}
              <input
                type="number"
                min="-1000"
                max="10000"
                step="0.25"
                value={dependencyDraft.lagHours}
                onChange={(event) => setDependencyDraft({ ...dependencyDraft, lagHours: event.target.value })}
              />
            </label>
            <button
              className="secondary-button"
              disabled={submitting || !dependencyDraft.predecessorTaskId || !dependencyDraft.successorTaskId}
            >
              <Plus size={15} />
              {t('Add link')}
            </button>
          </form>
          {dependencies.length ? (
            <div className="dependency-list">
              {dependencies.map((dependency) => (
                <div key={dependency.id}>
                  <span>{taskById.get(dependency.predecessorTaskId)?.title || t('Task')}</span>
                  <ChevronRight size={15} />
                  <strong>{taskById.get(dependency.successorTaskId)?.title || t('Task')}</strong>
                  {dependency.lagHours ? (
                    <small>
                      {dependency.lagHours > 0 ? '+' : ''}
                      {roundDisplay(dependency.lagHours)}h
                    </small>
                  ) : null}
                  <button
                    type="button"
                    className="icon-button"
                    title={t('Remove dependency')}
                    aria-label={t('Remove dependency to {task}', {
                      task: taskById.get(dependency.successorTaskId)?.title || t('task'),
                    })}
                    disabled={submitting}
                    onClick={() => onCancelDependency(dependency)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {canCoordinate ? (
        <div className="work-plan-baseline">
          <div className="work-plan-subheading">
            <div>
              <Timer size={16} />
              <h4>{t('Baseline control')}</h4>
            </div>
            <span className="tag">{t('Elapsed-hour basis')}</span>
          </div>
          <form className="baseline-form" onSubmit={calculate}>
            <label>
              {t('Plan start')}
              <input required type="datetime-local" value={plannedStart} onChange={(event) => setPlannedStart(event.target.value)} />
            </label>
            <div className="form-actions">
              <button className="secondary-button" disabled={submitting || !plannedStart}>
                <RefreshCw size={15} />
                {t('Calculate')}
              </button>
              <button type="button" className="secondary-button" disabled={submitting || !plannedStart} onClick={calculateResources}>
                <Calculator size={15} />
                {t('Preview resource plan')}
              </button>
              <button
                type="button"
                className="primary-button"
                data-testid="request-work-plan-baseline"
                disabled={submitting || !plan?.ready || Boolean(pendingBaseline)}
                title={pendingBaseline ? t('Resolve the pending baseline first') : !plan?.ready ? t('Complete task durations first') : undefined}
                onClick={requestBaseline}
              >
                <ShieldCheck size={15} />
                {t('Request baseline')}
              </button>
            </div>
          </form>
          <details className="site-access-calendar" data-testid="site-access-calendar">
            <summary>{t('Site access hours')}{job.data?.siteAccessCalendar ? ` · ${t('Verified schedule saved')}` : ` · ${t('Not recorded')}`}</summary>
            <p>{t('Use site-confirmed access times. Each task must fit completely inside one daily access window; existing task times remain protected.')}</p>
            <form onSubmit={saveSiteAccessCalendar}>
              <label>
                {t('Site time zone')}
                <input required maxLength={80} value={siteCalendarDraft.timeZone} onChange={event => setSiteCalendarDraft(current => ({ ...current, timeZone: event.target.value }))} />
              </label>
              <label>
                {t('Hours source')}
                <select required value={siteCalendarDraft.sourceType} onChange={event => setSiteCalendarDraft(current => ({ ...current, sourceType: event.target.value }))}>
                  <option value="customer_confirmed">{t('Confirmed by customer')}</option>
                  <option value="site_document">{t('Site document')}</option>
                  <option value="contractor_verified">{t('Verified by contractor')}</option>
                </select>
              </label>
              <label>
                {t('Confirmation or source note')}
                <textarea required minLength={8} maxLength={1000} value={siteCalendarDraft.note} onChange={event => setSiteCalendarDraft(current => ({ ...current, note: event.target.value }))} />
              </label>
              <div className="site-access-days">
                {SITE_ACCESS_WEEKDAYS.map(day => (
                  <fieldset key={day}>
                    <legend>{t(day[0].toUpperCase() + day.slice(1))}</legend>
                    {siteCalendarDraft.weeklyWindows[day].map((window, index) => (
                      <div className="site-access-window" key={`${day}-${index}`}>
                        <label>{t('Access starts')}<input required aria-label={`${t(day[0].toUpperCase() + day.slice(1))} ${t('Access starts')}`} type="time" value={window.start} onChange={event => updateSiteAccessWindow(day, index, 'start', event.target.value)} /></label>
                        <label>{t('Access ends')}<input required aria-label={`${t(day[0].toUpperCase() + day.slice(1))} ${t('Access ends')}`} type="time" value={window.end} onChange={event => updateSiteAccessWindow(day, index, 'end', event.target.value)} /></label>
                        <button className="icon-button" type="button" title={t('Remove access interval')} aria-label={`${t('Remove access interval')} ${t(day[0].toUpperCase() + day.slice(1))}`} onClick={() => removeSiteAccessWindow(day, index)}><X size={15} /></button>
                      </div>
                    ))}
                    {siteCalendarDraft.weeklyWindows[day].length < 3 ? (
                      <button className="secondary-button site-access-add" type="button" onClick={() => addSiteAccessWindow(day)}><Plus size={14} />{t('Add access interval')}</button>
                    ) : null}
                  </fieldset>
                ))}
              </div>
              <button className="secondary-button" type="submit" disabled={submitting}><Check size={15} />{t('Save site access hours')}</button>
            </form>
          </details>
          {!plan?.ready ? (
            <div className="work-plan-alert" role="status">
              <TriangleAlert size={16} />
              <span>
                {plan?.reason === 'planned_start_required'
                  ? t('Set the plan start.')
                  : t('{count} task duration(s) missing.', {
                      count: plan?.unscheduledTasks?.length || activeTasks.filter((task) => !Number(task.durationHours)).length,
                    })}
              </span>
            </div>
          ) : (
            <div className="work-plan-result" aria-live="polite">
              <div>
                <span>{t('Calculated finish')}</span>
                <strong>{formatDateTime(plan.plannedEnd)}</strong>
              </div>
              <div>
                <span>{t('Critical path')}</span>
                <strong>{t('{count} tasks', { count: plan.criticalPathTaskIds?.length || 0 })}</strong>
              </div>
              <div>
                <span>{t('14-day look-ahead')}</span>
                <strong>{t('{count} tasks', { count: plan.lookAhead?.length || 0 })}</strong>
              </div>
            </div>
          )}
          {resourcePlan ? (
            <div className={`notice resource-plan-preview ${resourcePlan.status === 'feasible_under_recorded_constraints' ? 'is-feasible' : 'notice-warning'}`} role="status" aria-live="polite" data-testid="resource-plan-preview">
              <strong>
                {resourcePlan.status === 'feasible_under_recorded_constraints' && resourcePlan.partial
                  ? t('Partial resource plan; material-dependent tasks are held')
                  : resourcePlan.status === 'feasible_under_recorded_constraints'
                  ? t('Proposed allocation under recorded constraints')
                  : resourcePlan.status === 'infeasible'
                    ? t('Recorded constraints conflict')
                    : resourcePlan.status === 'timed_out'
                      ? t('Resource calculation timed out')
                      : ['solver_error', 'solver_unknown'].includes(resourcePlan.status)
                        ? t('Resource calculation needs retry')
                      : t('Resource plan needs more information')}
              </strong>
              {resourcePlan.limitations?.includes('site_access_hours_not_recorded') ? (
                <p role="status">{t('No verified site access hours are recorded. This preview does not constrain work to site opening windows.')}</p>
              ) : null}
              {resourcePlan.preconstructionReconciliation ? (
                <div className="work-plan-forecast-reconciliation" data-testid="preconstruction-reconciliation">
                  <strong>{t('Pursuit estimate versus planned hours')}</strong>
                  <p>{t('Review total hours and dated work against the accepted scope before applying the plan.')}</p>
                  <ul>{resourcePlan.preconstructionReconciliation.trades.map((item, index) => <li key={`trade-${item.role}-${index}`}>
                    <strong>{item.role}</strong>
                    <span>{t('{estimated} h estimated · {planned} h planned · variance {variance} h', {
                      estimated: roundDisplay(item.estimatedHours),
                      planned: roundDisplay(item.plannedHours),
                      variance: `${item.varianceHours > 0 ? '+' : ''}${roundDisplay(item.varianceHours)}`
                    })}</span>
                    {item.status === 'below_estimate' ? <small>{t('Planned crew hours are below the pursuit estimate.')}</small> : null}
                    {item.status === 'above_estimate' ? <small>{t('Planned crew hours exceed the pursuit estimate.')}</small> : null}
                    {item.status === 'not_in_work_plan' ? <small>{t('This estimated trade has no task in the current work plan.')}</small> : null}
                  </li>)}
                  {resourcePlan.preconstructionReconciliation.additionalPlannedTrades.map((item, index) => <li key={`additional-trade-${item.role}-${index}`}>
                    <strong>{item.role}</strong><span>{t('{hours} h planned with no pursuit estimate', { hours: roundDisplay(item.plannedHours) })}</span>
                  </li>)}</ul>
                  {resourcePlan.preconstructionReconciliation.supervision.length ? (
                    <ul>{resourcePlan.preconstructionReconciliation.supervision.map((item, index) => <li key={`supervision-${item.role}-${item.crewRole}-${index}`}>
                      <strong>{t('Supervision')}: {item.role}</strong>
                      <span>{t('{estimated} h estimated · {planned} h planned · variance {variance} h', {
                        estimated: roundDisplay(item.estimatedHours),
                        planned: roundDisplay(item.plannedHours),
                        variance: `${item.varianceHours > 0 ? '+' : ''}${roundDisplay(item.varianceHours)}`
                      })}</span>
                      {item.status === 'not_configured_in_work_plan' ? <small>{t('Task-level supervision is not configured for this forecast role.')}</small> : null}
                      {item.status === 'below_estimate' ? <small>{t('Planned supervision hours are below the pursuit estimate.')}</small> : null}
                      {item.status === 'above_estimate' ? <small>{t('Planned supervision hours exceed the pursuit estimate.')}</small> : null}
                    </li>)}</ul>
                  ) : null}
                  {resourcePlan.preconstructionReconciliation.additionalPlannedSupervision.map((item, index) => <p key={`additional-supervision-${item.role}-${index}`}>
                    {t('Additional planned supervision: {role}, {hours} h, with no pursuit estimate.', { role: item.role, hours: roundDisplay(item.plannedHours) })}
                  </p>)}
                  <PreconstructionDateReview comparison={resourcePlan.preconstructionReconciliation.datedComparison} t={t} />
                </div>
              ) : null}
              {resourcePlan.heldTasks?.length ? (
                <div className="work-plan-held-tasks" data-testid="resource-plan-held-tasks">
                  <strong>{t('Not included in this proposal')}</strong>
                  <p>{t('These tasks and their dependent work remain unchanged until material availability is verified.')}</p>
                  <ul>{resourcePlan.heldTasks.map(task => <li key={task.taskId}>
                    <strong>{task.title}</strong>
                    {task.reasons.map((reason, index) => <span key={`${reason.code}:${reason.materialRequirementId || reason.blockedByTaskId || index}`}>
                      {reason.code === 'material_availability_unresolved'
                        ? t('No verified or dated availability for {material}', { material: reason.materialName })
                        : reason.code === 'material_after_planning_horizon'
                          ? t('{material} is expected after this planning horizon', { material: reason.materialName })
                          : t('Waiting on material-blocked task: {task}', { task: reason.blockedByTaskTitle })}
                    </span>)}
                  </li>)}</ul>
                </div>
              ) : null}
              {resourcePlan.tasks?.length ? (
                <div className="work-plan-task-list" role="list">
                  {resourcePlan.tasks.map((item) => (
                    <div className="work-plan-result" role="listitem" key={item.taskId}>
                      <div><span>{item.title}</span><strong>{(item.workers || [{ workerName: item.workerName, role: item.requiredTrade }]).map(worker => `${worker.workerName}${worker.role ? ` · ${worker.role}` : ''}`).filter(Boolean).join(', ')}</strong>{item.supervisors?.length ? <small className="work-plan-supervisor">{t('Supervised by {name} · {role}', { name: item.supervisors.map(supervisor => supervisor.workerName).join(', '), role: item.supervisorTrade || t('Role needs review') })}{item.supervisionRatio ? ` · ${t('Required supervision ratio: one per {count} workers', { count: item.supervisionRatio.workersPerSupervisor })}` : ''}</small> : null}</div>
                      <div><span>{formatDateTime(item.plannedStart)}</span><strong>{formatDateTime(item.plannedEnd)}</strong></div>
                      {item.scheduleProtected ? <small>{t('Existing schedule protected')}</small> : null}
                      {item.durationRoundedUp ? <small>{t('Duration rounded up to {hours} hours', { hours: item.durationHours })}</small> : null}
                    </div>
                  ))}
                </div>
              ) : null}
              {resourcePlan.issues?.map((issue, index) => {
                if (!['travel_route_required', 'travel_route_stale', 'travel_route_site_address_required'].includes(issue.code)) {
                  return <p key={`${issue.code}-${issue.taskId || index}`}>{issue.message}</p>
                }
                const draft = travelDraftFor(issue)
                const canEditRoute = issue.siteAddressesReady && canCoordinate
                return (
                  <div className="travel-route-issue" key={`${issue.code}-${issue.externalJobId || index}`} data-testid={`travel-route-${issue.externalJobId}`}>
                    <p>{issue.message}</p>
                    {canEditRoute ? (
                      <form className="travel-route-form" onSubmit={event => saveTravelRoute(event, issue)}>
                        <strong>{t('Travel between {job} and {otherJob}', { job: job.title, otherJob: issue.externalJobTitle })}</strong>
                        <div className="travel-route-fields">
                          <label>{t('Minutes from this site to other job')}<input required type="number" min={draft.sourceType === 'same_site' ? 0 : 1} max="480" step="1" value={draft.minutesToExternal} disabled={draft.sourceType === 'same_site'} onChange={event => updateTravelDraft(issue.externalJobId, 'minutesToExternal', event.target.value)} /></label>
                          <label>{t('Minutes from other job to this site')}<input required type="number" min={draft.sourceType === 'same_site' ? 0 : 1} max="480" step="1" value={draft.minutesFromExternal} disabled={draft.sourceType === 'same_site'} onChange={event => updateTravelDraft(issue.externalJobId, 'minutesFromExternal', event.target.value)} /></label>
                          <label>{t('Route basis')}<select required value={draft.sourceType} onChange={event => {
                            const sourceType = event.target.value
                            setTravelRouteDrafts(current => ({ ...current, [issue.externalJobId]: {
                              ...travelDraftFor(issue),
                              sourceType,
                              ...(sourceType === 'same_site' ? { minutesToExternal: '0', minutesFromExternal: '0' } : {
                                minutesToExternal: String(Number(travelDraftFor(issue).minutesToExternal) || 15),
                                minutesFromExternal: String(Number(travelDraftFor(issue).minutesFromExternal) || 15)
                              })
                            } }))
                          }}>
                            <option value="map_reference">{t('Map reference')}</option>
                            <option value="contractor_verified">{t('Verified by contractor')}</option>
                            {issue.sameSite ? <option value="same_site">{t('Same recorded site')}</option> : null}
                          </select></label>
                        </div>
                        <label>{t('Route source or verification note')}<textarea required minLength="8" maxLength="1000" value={draft.note} onChange={event => updateTravelDraft(issue.externalJobId, 'note', event.target.value)} placeholder={t('For example, map route checked on the day this estimate was recorded.')} /></label>
                        <button type="submit" className="secondary-button" disabled={submitting}><Check size={15} />{t('Save route and recalculate')}</button>
                      </form>
                    ) : null}
                  </div>
                )
              })}
              {job.data?.travelRoutes?.length ? (
                <details className="recorded-travel-routes">
                  <summary>{t('Recorded routes')} · {job.data.travelRoutes.length}</summary>
                  {job.data.travelRoutes.map(route => (
                    <div className="recorded-travel-route" key={route.externalJobId}>
                      <span>{t('To {job}: {outbound} min there, {inbound} min back', { job: route.externalJobTitle, outbound: route.minutesToExternal, inbound: route.minutesFromExternal })}</span>
                      {canCoordinate ? <button type="button" className="secondary-button" onClick={() => editTravelRoute(route)}>{t('Edit route')}</button> : null}
                      {editingTravelJobId === route.externalJobId ? (
                        <form className="travel-route-form" onSubmit={event => saveTravelRoute(event, {
                          externalJobId: route.externalJobId,
                          externalJobTitle: route.externalJobTitle,
                          existingRoute: route,
                          sameSite: JSON.stringify(route.fromSite) === JSON.stringify(route.toSite),
                          siteAddressesReady: Boolean(route.fromSite?.address && route.toSite?.address)
                        })}>
                          <div className="travel-route-fields">
                            <label>{t('Minutes from this site to other job')}<input required type="number" min={travelRouteDrafts[route.externalJobId]?.sourceType === 'same_site' ? 0 : 1} max="480" step="1" value={travelRouteDrafts[route.externalJobId]?.minutesToExternal ?? route.minutesToExternal} disabled={travelRouteDrafts[route.externalJobId]?.sourceType === 'same_site'} onChange={event => updateTravelDraft(route.externalJobId, 'minutesToExternal', event.target.value)} /></label>
                            <label>{t('Minutes from other job to this site')}<input required type="number" min={travelRouteDrafts[route.externalJobId]?.sourceType === 'same_site' ? 0 : 1} max="480" step="1" value={travelRouteDrafts[route.externalJobId]?.minutesFromExternal ?? route.minutesFromExternal} disabled={travelRouteDrafts[route.externalJobId]?.sourceType === 'same_site'} onChange={event => updateTravelDraft(route.externalJobId, 'minutesFromExternal', event.target.value)} /></label>
                            <label>{t('Route basis')}<select required value={travelRouteDrafts[route.externalJobId]?.sourceType || route.sourceType} onChange={event => {
                              const sourceType = event.target.value
                              setTravelRouteDrafts(current => ({ ...current, [route.externalJobId]: {
                                ...travelDraftFor({ externalJobId: route.externalJobId, existingRoute: route, sameSite: JSON.stringify(route.fromSite) === JSON.stringify(route.toSite) }),
                                sourceType,
                                ...(sourceType === 'same_site' ? { minutesToExternal: '0', minutesFromExternal: '0' } : {
                                  minutesToExternal: String(Number(travelRouteDrafts[route.externalJobId]?.minutesToExternal ?? route.minutesToExternal) || 15),
                                  minutesFromExternal: String(Number(travelRouteDrafts[route.externalJobId]?.minutesFromExternal ?? route.minutesFromExternal) || 15)
                                })
                              } }))
                            }}>
                              <option value="map_reference">{t('Map reference')}</option>
                              <option value="contractor_verified">{t('Verified by contractor')}</option>
                              {JSON.stringify(route.fromSite) === JSON.stringify(route.toSite) ? <option value="same_site">{t('Same recorded site')}</option> : null}
                            </select></label>
                          </div>
                          <label>{t('Route source or verification note')}<textarea required minLength="8" maxLength="1000" value={travelRouteDrafts[route.externalJobId]?.note ?? route.note} onChange={event => updateTravelDraft(route.externalJobId, 'note', event.target.value)} /></label>
                          <div className="form-actions">
                            <button type="submit" className="secondary-button" disabled={submitting}><Check size={15} />{t('Save route and recalculate')}</button>
                            <button type="button" className="icon-button" title={t('Cancel route edit')} aria-label={t('Cancel route edit')} onClick={() => setEditingTravelJobId(null)}><X size={15} /></button>
                          </div>
                        </form>
                      ) : null}
                    </div>
                  ))}
                </details>
              ) : null}
              {resourcePlan.reason ? <p>{resourcePlan.reason}</p> : null}
              {resourcePlan.status === 'incomplete_input'
                && resourcePlan.issues?.some(issue => ['crew_missing', 'no_qualified_resource'].includes(issue.code))
                && !resourcePlan.issues?.some(issue => issue.code === 'required_trade_missing') ? (
                  <a className="secondary-button" href={`#work-board-positions-${job.id}`}>
                    {t('Review positions and worker applications')}
                  </a>
                ) : null}
              {resourcePlan.status === 'feasible_under_recorded_constraints' && canCoordinate && !resourceApproval ? (
                <button type="button" className="secondary-button" disabled={submitting} onClick={requestResourceApproval}>
                  <ShieldCheck size={15} />{t('Request independent approval')}
                </button>
              ) : null}
              {resourceApproval && canApprove ? (
                <button type="button" className="secondary-button" onClick={() => onOpenApprovals({ jobId: job.id, jobTitle: job.title, approvalId: resourceApproval.id })}>
                  <ShieldCheck size={15} />{t('Review resource proposal')}
                </button>
              ) : null}
              <small>{t('Preview only. Applying a plan requires an independent approval and a fresh source check. This never changes customer commitments. Existing task schedules stay fixed. Travel between recorded job assignments is blocked only when a sourced route is retained; home-to-first-job, return trips, and travel within one site are not modeled. Site access hours apply only when a verified calendar is recorded. Day and shift constraints apply only when a worker capacity profile records them.')}</small>
            </div>
          ) : null}
          {pendingBaseline && canApprove ? (
            <button
              type="button"
              className="secondary-button baseline-review-button"
              onClick={() => onOpenApprovals({ jobId: job.id, jobTitle: job.title, approvalId: pendingBaseline.approvalId })}
            >
              <ShieldCheck size={15} />
              {t('Review baseline v{version}', { version: pendingBaseline.versionNumber })}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}



export default WorkPlanControl

export { WorkPlanControl }
