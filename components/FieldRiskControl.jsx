import './JobWorkspaceControls.css'
import { useEffect, useState } from 'react'
import { ClipboardCheck, Plus, ShieldCheck, TriangleAlert } from 'lucide-react'
import { createFieldEvidenceDraftId } from '../field-outbox'
import { EMPTY_LIST, formatDate, formatDateTime, formatStatus, futureDateInput, toIsoDateTime, toLocalDateTimeInput } from '../dashboard-format'
import { operatorText } from '../operator-locale'



function emptyFieldRiskDraft(type = 'observation') {
  if (type === 'incident') {
    return {
      entryKey: createFieldEvidenceDraftId(),
      incidentType: 'near_miss',
      title: '',
      severity: 'medium',
      occurredAt: toLocalDateTimeInput(new Date()),
      reportedBy: '',
      responsible: '',
      dueAt: '',
      description: '',
      immediateAction: '',
      correctiveAction: '',
      witnesses: '',
      evidenceDocumentId: '',
      reportable: false,
    }
  }
  return {
    entryKey: createFieldEvidenceDraftId(),
    category: 'quality',
    title: '',
    severity: 'medium',
    responsible: '',
    dueAt: futureDateInput(2),
    notes: '',
    correctiveAction: '',
    evidenceDocumentId: '',
  }
}

function FieldRiskControl({
  job,
  locale = 'en-GB',
  canReport,
  canCoordinate,
  canApprove,
  fieldScoped,
  operator,
  submitting,
  onCreate,
  onReview,
  onOpenApprovals,
}) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const [view, setView] = useState('observation')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(() => emptyFieldRiskDraft('observation'))
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  const observations = job.observations || EMPTY_LIST
  const incidents = job.incidents || EMPTY_LIST
  const records = view === 'incident' ? incidents : observations
  const activeStatuses = view === 'incident'
    ? new Set(['reported', 'under_review', 'escalated', 'pending_approval'])
    : new Set(['open', 'in_progress', 'pending_approval'])
  const openObservations = observations.filter((record) => ['open', 'in_progress', 'pending_approval'].includes(record.status)).length
  const openIncidents = incidents.filter((record) => ['reported', 'under_review', 'escalated', 'pending_approval'].includes(record.status)).length
  const highRiskOpen = [...observations, ...incidents].filter((record) =>
    ['high', 'critical'].includes(record.severity) && !['resolved', 'closed'].includes(record.status),
  ).length
  const pendingApprovals = (job.approvals || EMPTY_LIST).filter((approval) =>
    approval.status === 'pending' && ['observation_record', 'incident_record'].includes(approval.targetType),
  ).length

  useEffect(() => {
    setView('observation')
    setCreating(false)
    setDraft(emptyFieldRiskDraft('observation'))
  }, [job.id])

  useEffect(() => {
    const handleOnline = () => setOnline(true)
    const handleOffline = () => setOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  const selectView = (nextView) => {
    setView(nextView)
    setCreating(false)
    setDraft(emptyFieldRiskDraft(nextView))
  }

  const beginCreate = () => {
    setDraft({
      ...emptyFieldRiskDraft(view),
      ...(view === 'incident' ? { reportedBy: operator?.name || '', responsible: fieldScoped ? '' : operator?.name || '' } : { responsible: operator?.name || '' }),
    })
    setCreating(true)
  }

  async function submitRisk(event) {
    event.preventDefault()
    const result = await onCreate(view, draft)
    if (result) {
      setCreating(false)
      setDraft(emptyFieldRiskDraft(view))
    }
  }

  const openLifecycleReview = (record) => {
    const status = view === 'incident' && record.status === 'reported' ? 'under_review' : 'resolved'
    onReview(
      { jobId: job.id, jobTitle: job.title },
      {
        type: view,
        recordId: record.id,
        record,
        label: status === 'under_review' ? t('Start incident review') : t('Resolve {recordType}', { recordType: t(view) }),
        status,
      },
    )
  }

  return (
    <section className="job-workspace-section field-risk-control" data-testid="field-risk-control">
      <div className="section-heading field-risk-heading">
        <TriangleAlert size={18} />
        <div>
          <h3>{t('Field risk register')}</h3>
          <p>{t('Observed quality, safety, environmental, and access conditions with retained evidence and accountable review.')}</p>
        </div>
        {canReport ? <button type="button" className="secondary-button" disabled={submitting} onClick={beginCreate}><Plus size={15} />{view === 'incident' ? t('Report incident') : t('New observation')}</button> : null}
      </div>

      <div className="field-risk-summary" aria-label={t('Field risk summary')}>
        <div><span>{t('Open observations')}</span><strong>{openObservations}</strong></div>
        <div><span>{t('Open incidents')}</span><strong>{openIncidents}</strong></div>
        <div><span>{t('High risk')}</span><strong>{highRiskOpen}</strong></div>
        <div><span>{t('Pending review')}</span><strong>{pendingApprovals}</strong></div>
      </div>

      <div className="field-risk-tabs" role="tablist" aria-label={t('Field risk record type')}>
        <button type="button" role="tab" aria-selected={view === 'observation'} className={view === 'observation' ? 'active' : ''} onClick={() => selectView('observation')}>{t('Observations')} <span>{observations.length}</span></button>
        <button type="button" role="tab" aria-selected={view === 'incident'} className={view === 'incident' ? 'active' : ''} onClick={() => selectView('incident')}>{t('Incidents')} <span>{incidents.length}</span></button>
      </div>

      {creating ? (
        <form className="field-risk-form form-grid compact-form" data-testid={`field-${view}-form`} onSubmit={submitRisk}>
          {view === 'observation' ? (
            <>
              <label>{t('Category')}<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}><option value="quality">{t('Quality')}</option><option value="safety">{t('Safety')}</option><option value="environmental">{t('Environmental')}</option><option value="access">{t('Access')}</option><option value="coordination">{t('Coordination')}</option></select></label>
              <label>{t('Severity')}<select value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: event.target.value })}><option value="low">{t('Low')}</option><option value="medium">{t('Medium')}</option><option value="high">{t('High')}</option><option value="critical">{t('Critical')}</option></select></label>
              <label className="form-span">{t('Observation title')}<input autoFocus required minLength="3" maxLength="240" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={t('Observed condition or deviation')} /></label>
              <label>{t('Responsible person')}<input required minLength="2" maxLength="160" value={draft.responsible} onChange={(event) => setDraft({ ...draft, responsible: event.target.value })} /></label>
              <label>{t('Corrective due date')}<input required type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label>
              <label className="form-span">{t('Observed facts')}<textarea required minLength="4" maxLength="4000" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder={t('Location, condition, and direct observations')} /></label>
              <label className="form-span">{t('Immediate control or corrective action')}<textarea maxLength="4000" value={draft.correctiveAction} onChange={(event) => setDraft({ ...draft, correctiveAction: event.target.value })} /></label>
            </>
          ) : (
            <>
              <label>{t('Incident type')}<select value={draft.incidentType} onChange={(event) => setDraft({ ...draft, incidentType: event.target.value })}><option value="near_miss">{t('Near miss')}</option><option value="injury">{t('Injury')}</option><option value="property_damage">{t('Property damage')}</option><option value="environmental">{t('Environmental')}</option><option value="security">{t('Security')}</option><option value="unsafe_condition">{t('Unsafe condition')}</option></select></label>
              <label>{t('Severity')}<select value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: event.target.value })}><option value="low">{t('Low')}</option><option value="medium">{t('Medium')}</option><option value="high">{t('High')}</option><option value="critical">{t('Critical')}</option></select></label>
              <label className="form-span">{t('Incident title')}<input autoFocus required minLength="3" maxLength="240" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={t('Concise factual incident title')} /></label>
              <label>{t('Occurred at')}<input required type="datetime-local" value={draft.occurredAt} onChange={(event) => setDraft({ ...draft, occurredAt: event.target.value })} /></label>
              <label>{t('Reported by')}<input required minLength="2" maxLength="160" value={draft.reportedBy} onChange={(event) => setDraft({ ...draft, reportedBy: event.target.value })} /></label>
              {!fieldScoped ? <label>{t('Responsible person')}<input maxLength="160" value={draft.responsible} onChange={(event) => setDraft({ ...draft, responsible: event.target.value })} /></label> : null}
              {!fieldScoped ? <label>{t('Corrective due date')}<input type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label> : null}
              <label className="form-span">{t('Incident facts')}<textarea required minLength="4" maxLength="4000" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder={t('What happened, where, and what was directly observed')} /></label>
              <label className="form-span">{t('Immediate action')}<textarea required minLength="4" maxLength="4000" value={draft.immediateAction} onChange={(event) => setDraft({ ...draft, immediateAction: event.target.value })} placeholder={t('Isolation, stop-work, first aid, or other action already taken')} /></label>
              <label>{t('Corrective action')}<textarea maxLength="4000" value={draft.correctiveAction} onChange={(event) => setDraft({ ...draft, correctiveAction: event.target.value })} /></label>
              <label>{t('Witnesses')}<textarea maxLength="2000" value={draft.witnesses} onChange={(event) => setDraft({ ...draft, witnesses: event.target.value })} placeholder={t('One name per line')} /></label>
              <label className="checkbox-label form-span"><input type="checkbox" checked={draft.reportable} onChange={(event) => setDraft({ ...draft, reportable: event.target.checked })} />{t('Potentially reportable; requires specialist review')}</label>
            </>
          )}
          <label className="form-span">{t('Linked evidence')}<select value={draft.evidenceDocumentId} onChange={(event) => setDraft({ ...draft, evidenceDocumentId: event.target.value })}><option value="">{t('No linked document')}</option>{(job.documents || EMPTY_LIST).map((document) => <option value={document.id} key={document.id}>{document.title || document.filename || document.id}</option>)}</select></label>
          <p className="workflow-note form-span">{t('This retains an internal report and review gate only. It does not notify external parties, clear a hazard, authorize work, or make a statutory filing.')}</p>
          <div className="form-actions form-span"><button className="primary-button" disabled={submitting || draft.title.trim().length < 3 || (view === 'observation' ? draft.notes.trim().length < 4 || draft.responsible.trim().length < 2 : draft.description.trim().length < 4 || draft.immediateAction.trim().length < 4 || draft.reportedBy.trim().length < 2 || !toIsoDateTime(draft.occurredAt))}><ShieldCheck size={15} />{online ? (view === 'incident' ? t('Retain incident') : t('Retain observation')) : view === 'incident' ? t('Save incident offline') : t('Save observation offline')}</button><button type="button" className="secondary-button" onClick={() => setCreating(false)}>{t('Cancel')}</button></div>
        </form>
      ) : null}

      <div className="field-risk-register">
        {records.length ? records.map((record) => {
          const pending = (job.approvals || EMPTY_LIST).find((approval) => approval.id === record.approvalId && approval.status === 'pending')
          const detail = view === 'incident' ? record.data?.description : record.data?.notes
          return (
            <article className={`field-risk-row field-risk-${record.severity}`} key={record.id} data-testid={`field-risk-${record.id}`}>
              <div className="field-risk-row-copy"><div><strong>{record.title}</strong><span className={`status status-${record.status}`}>{t(formatStatus(record.status))}</span></div><small>{t(formatStatus(view === 'incident' ? record.incidentType : record.category))} / {t(formatStatus(record.severity))} / {view === 'incident' ? formatDateTime(record.occurredAt) : t('due {date}', { date: formatDate(record.dueAt) })}</small>{detail ? <p>{detail}</p> : null}{view === 'incident' && (record.responsible || record.dueAt) ? <small>{record.responsible ? `${t('Responsible person')}: ${record.responsible}` : ''}{record.responsible && record.dueAt ? ' / ' : ''}{record.dueAt ? t('due {date}', { date: formatDate(record.dueAt) }) : ''}</small> : null}{view === 'incident' && record.status === 'resolved' ? <p><strong>{t('Corrective action')}: </strong>{record.data.lifecycleTransition.correctiveAction}</p> : null}</div>
              <div className="field-risk-row-actions">
                {pending ? <span className="tag tag-amber">{t('Approval pending')}</span> : null}
                {pending && canApprove ? <button type="button" className="secondary-button" onClick={() => onOpenApprovals({ approvalId: pending.id })}><ShieldCheck size={14} />{t('Review')}</button> : null}
                {!pending && canCoordinate && activeStatuses.has(record.status) ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => openLifecycleReview(record)}><ClipboardCheck size={14} />{view === 'incident' && record.status === 'reported' ? t('Start review') : t('Resolve')}</button> : null}
              </div>
            </article>
          )
        }) : <p className="workflow-note">{t('No {recordType} records are retained for this job.', { recordType: t(view === 'incident' ? 'incident' : 'observation') })}</p>}
      </div>
      {fieldScoped ? <p className="workflow-note">{t('Assigned field workers can report observed facts. Resolution and approval remain office-controlled.')}</p> : null}
    </section>
  )
}



export default FieldRiskControl

export { FieldRiskControl }
