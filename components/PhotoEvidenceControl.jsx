import './JobWorkspaceControls.css'
import { useState } from 'react'
import { companyApiUrl } from '../company-request.mjs'
import { Camera, LockKeyhole, Plus, ShieldCheck, TriangleAlert, X } from 'lucide-react'
import { createFieldEvidenceDraftId } from '../field-outbox'
import { EMPTY_LIST, formatDateTime, formatStatus } from '../dashboard-format'
import { operatorText } from '../operator-locale'
import Empty from './EmptyState'



function emptyPhotoEvidenceSetDraft() {
  return {
    entryKey: createFieldEvidenceDraftId(),
    taskId: '',
    assignmentId: '',
    assignedWorkerId: '',
    title: '',
    workLocation: '',
    notes: '',
  }
}

function PhotoEvidenceControl({
  job,
  locale,
  canCoordinate,
  canApprove,
  submitting,
  onSchedule,
  onRequestReview,
  onOpenApprovals,
}) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const [scheduling, setScheduling] = useState(false)
  const [draft, setDraft] = useState(() => emptyPhotoEvidenceSetDraft())
  const sets = job.photoEvidenceSets || EMPTY_LIST
  const activeTasks = (job.tasks || EMPTY_LIST).filter(task =>
    !['completed', 'cancelled', 'canceled'].includes(task.status)
  )
  const activeAssignments = (job.assignments || EMPTY_LIST).filter(assignment =>
    !['released', 'cancelled', 'completed', 'closed', 'rejected', 'pending_approval'].includes(assignment.status)
  )
  const pending = sets.filter(set => set.status === 'pending_review').length
  const readyForReview = sets.filter(set => set.status === 'captures_complete' && set.complete).length
  const released = sets.filter(set => set.readyForTaskCompletion).length
  const blocked = sets.filter(set => !set.readyForTaskCompletion).length

  function selectTask(taskId) {
    const task = activeTasks.find(item => item.id === taskId)
    const assignment = activeAssignments.find(item => item.workerId === task?.assigneeId)
    setDraft({
      ...draft,
      taskId,
      assignmentId: assignment?.id || '',
      assignedWorkerId: assignment?.workerId || '',
      title: task ? t('{task} photographic evidence', { task: task.title }) : '',
    })
  }

  async function submitSchedule(event) {
    event.preventDefault()
    const result = await onSchedule({
      ...draft,
      requiredPhases: ['before', 'during', 'after'],
    })
    if (!result) return
    setDraft(emptyPhotoEvidenceSetDraft())
    setScheduling(false)
  }

  return (
    <section className="job-workspace-section field-risk-control photo-evidence-control" data-testid="photo-evidence-control">
      <div className="section-heading field-risk-heading">
        <Camera size={18} />
        <div>
          <h3>{t('Before, during, and after evidence')}</h3>
          <p>{t('Task-bound, checksum-protected field photos with independent release.')}</p>
        </div>
        {canCoordinate ? (
          <button type="button" className="secondary-button" disabled={submitting} onClick={() => setScheduling(current => !current)}>
            {scheduling ? <X size={15} /> : <Plus size={15} />}
            {scheduling ? t('Cancel') : t('Schedule set')}
          </button>
        ) : null}
      </div>

      <div className="field-risk-summary" aria-label={t('Photo evidence summary')}>
        <div><span>{t('Task holds')}</span><strong>{blocked}</strong></div>
        <div><span>{t('Ready for review')}</span><strong>{readyForReview}</strong></div>
        <div><span>{t('Pending review')}</span><strong>{pending}</strong></div>
        <div><span>{t('Released')}</span><strong>{released}</strong></div>
      </div>

      {scheduling ? (
        <form className="field-risk-form form-grid compact-form" data-testid="photo-evidence-schedule-form" onSubmit={submitSchedule}>
          <label>
            {t('Task')}
            <select required value={draft.taskId} onChange={(event) => selectTask(event.target.value)}>
              <option value="">{t('Select a task with an assigned worker')}</option>
              {activeTasks.map(task => (
                <option key={task.id} value={task.id}>{task.title}</option>
              ))}
            </select>
          </label>
          <label>
            {t('Assigned worker')}
            <select
              required
              value={draft.assignmentId}
              onChange={(event) => {
                const assignment = activeAssignments.find(item => item.id === event.target.value)
                setDraft({
                  ...draft,
                  assignmentId: event.target.value,
                  assignedWorkerId: assignment?.workerId || '',
                })
              }}
            >
              <option value="">{t('Select retained assignment')}</option>
              {activeAssignments.map(assignment => (
                <option key={assignment.id} value={assignment.id}>
                  {assignment.workerName || assignment.workerId} / {assignment.role}
                </option>
              ))}
            </select>
          </label>
          <label className="form-span">
            {t('Evidence title')}
            <input required minLength="3" maxLength="240" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} />
          </label>
          <label className="form-span">
            {t('Exact work location')}
            <input required minLength="2" maxLength="240" value={draft.workLocation} onChange={(event) => setDraft({ ...draft, workLocation: event.target.value })} placeholder={t('Building, level, room, grid, elevation, or asset')} />
          </label>
          <label className="form-span">
            {t('Field instructions')}
            <textarea maxLength="600" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder={t('Required viewpoints, visible references, or access constraints.')} />
          </label>
          <p className="workflow-note form-span">{t('Scheduling activates a task-completion hold. Only the assigned worker can capture the governed sequence; an independent approver must release it.')}</p>
          <div className="form-actions">
            <button className="primary-button" disabled={submitting || !draft.taskId || !draft.assignmentId || !draft.assignedWorkerId}>
              <Camera size={15} />{t('Schedule evidence set')}
            </button>
          </div>
        </form>
      ) : null}

      <div className="photo-evidence-register">
        {sets.length ? sets.map(set => (
          <article className={`photo-evidence-row photo-evidence-${set.effectiveStatus}`} key={set.id}>
            <div className="photo-evidence-row-heading">
              <div>
                <strong>{set.taskTitle || set.title}</strong>
                <small>{set.workLocation} / {set.assignedWorkerName || set.assignedWorkerId}</small>
              </div>
              <span className={`tag ${set.readyForTaskCompletion ? 'tag-green' : set.effectiveStatus === 'stale' || set.effectiveStatus === 'integrity_invalid' ? 'tag-red' : 'tag-amber'}`}>
                {t(formatStatus(set.effectiveStatus))}
              </span>
            </div>
            <div className="photo-evidence-phases" aria-label={t('{title} phase evidence', { title: set.title })}>
              {['before', 'during', 'after'].map(phase => {
                const capture = set.captures?.find(item => item.phase === phase)
                return (
                  <div className={capture ? 'complete' : 'missing'} key={phase}>
                    <span>{t(formatStatus(phase))}</span>
                    <strong>{capture ? formatDateTime(capture.capturedAt) : t('Missing')}</strong>
                    {capture ? (
                      <a href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(capture.documentId)}/content`)} target="_blank" rel="noreferrer">
                        {capture.document?.filename || t('Open photo')}
                      </a>
                    ) : null}
                  </div>
                )
              })}
            </div>
            {!set.sourceCurrent ? <p className="installation-qc-blocked"><TriangleAlert size={15} />{t('Task, assignment, worker, or location source changed. Release remains blocked.')}</p> : null}
            {!set.integrityValid || !set.captureIntegrityValid ? <p className="installation-qc-blocked"><TriangleAlert size={15} />{t('Retained evidence failed integrity verification.')}</p> : null}
            <div className="form-actions">
              {canCoordinate && set.status === 'captures_complete' && set.complete && set.sourceCurrent && set.integrityValid && set.captureIntegrityValid ? (
                <button type="button" className="primary-button" disabled={submitting} onClick={() => onRequestReview(set.id, { entryKey: createFieldEvidenceDraftId() })}>
                  <ShieldCheck size={15} />{t('Request independent review')}
                </button>
              ) : null}
              {canApprove && set.status === 'pending_review' && set.latestApprovalId ? (
                <button type="button" className="secondary-button" onClick={() => onOpenApprovals({ jobId: job.id, approvalId: set.latestApprovalId })}>
                  <LockKeyhole size={15} />{t('Open approval')}
                </button>
              ) : null}
            </div>
          </article>
        )) : <Empty title={t('No governed photo evidence')} detail={t('Schedule a before, during, and after set against a task with an active assigned worker.')} />}
      </div>
    </section>
  )
}



export default PhotoEvidenceControl

export { PhotoEvidenceControl }
