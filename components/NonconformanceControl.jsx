import './JobWorkspaceControls.css'
import { useEffect, useState } from 'react'
import { BadgeCheck, ClipboardPenLine, Plus, ShieldCheck } from 'lucide-react'
import { createFieldEvidenceDraftId } from '../field-outbox'
import { EMPTY_LIST, formatDate, formatDateTime, formatStatus, futureDateInput, toIsoDateTime, toLocalDateTimeInput } from '../dashboard-format'
import { operatorText } from '../operator-locale'



function emptyNonconformanceDraft(operatorName = '') {
  return {
    entryKey: createFieldEvidenceDraftId(),
    severity: 'medium',
    discipline: 'quality',
    title: '',
    description: '',
    location: '',
    detectedAt: toLocalDateTimeInput(new Date()),
    raisedBy: operatorName,
    requirementReference: '',
    immediateContainment: '',
    responsibleParty: '',
    dueAt: futureDateInput(2),
    sourceInspectionId: '',
    sourceObservationId: '',
    evidenceDocumentId: '',
    notes: '',
  }
}

function emptyNonconformanceCorrection(record = null) {
  return {
    rootCause: '',
    correctiveAction: '',
    responsibleParty: record?.correctiveAction?.responsibleParty || record?.responsibleParty || '',
    dueAt: record?.correctiveAction?.dueAt || record?.dueAt || futureDateInput(2),
    evidenceReference: '',
    evidenceDocumentId: '',
    notes: '',
  }
}

function emptyNonconformanceClosure(operatorName = '') {
  return {
    verificationResult: 'passed',
    verificationEvidence: '',
    evidenceDocumentId: '',
    verifiedBy: operatorName,
    verifiedAt: toLocalDateTimeInput(new Date()),
    notes: '',
  }
}

function NonconformanceControl({
  job,
  locale = 'en-GB',
  canReport,
  canCoordinate,
  canApprove,
  fieldScoped,
  operator,
  submitting,
  onCreate,
  onRequestCorrection,
  onRequestClosure,
  onOpenApprovals,
}) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const records = job.nonconformances || EMPTY_LIST
  const [editor, setEditor] = useState(null)
  const [draft, setDraft] = useState(() => emptyNonconformanceDraft(operator?.name || ''))
  const [online, setOnline] = useState(() => navigator.onLine !== false)

  useEffect(() => {
    setEditor(null)
    setDraft(emptyNonconformanceDraft(operator?.name || ''))
  }, [job.id, operator?.name])

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

  const pendingCorrection = records.filter((record) => record.status === 'pending_correction_approval').length
  const pendingClosure = records.filter((record) => record.status === 'pending_closure_approval').length
  const overdue = records.filter((record) => {
    const dueAt = record.correctiveAction?.dueAt || record.dueAt
    return record.status !== 'closed' && dueAt && dueAt < futureDateInput(0)
  }).length
  const open = records.filter((record) => record.status !== 'closed').length

  const beginCreate = () => {
    setDraft(emptyNonconformanceDraft(operator?.name || ''))
    setEditor({ type: 'create', record: null })
  }

  const beginCorrection = (record) => {
    setDraft(emptyNonconformanceCorrection(record))
    setEditor({ type: 'correction', record })
  }

  const beginClosure = (record) => {
    setDraft(emptyNonconformanceClosure(operator?.name || ''))
    setEditor({ type: 'closure', record })
  }

  async function submit(event) {
    event.preventDefault()
    if (!editor) return
    let result = null
    if (editor.type === 'create') {
      result = await onCreate({ ...draft, detectedAt: toIsoDateTime(draft.detectedAt) })
    } else if (editor.type === 'correction') {
      result = await onRequestCorrection(editor.record.id, draft)
    } else {
      result = await onRequestClosure(editor.record.id, { ...draft, verifiedAt: toIsoDateTime(draft.verifiedAt) })
    }
    if (result) setEditor(null)
  }

  const createInvalid = editor?.type === 'create' && (
    draft.title.trim().length < 3
    || draft.description.trim().length < 4
    || draft.raisedBy.trim().length < 2
    || draft.requirementReference.trim().length < 3
    || draft.immediateContainment.trim().length < 4
    || draft.responsibleParty.trim().length < 2
    || !toIsoDateTime(draft.detectedAt)
  )
  const correctionInvalid = editor?.type === 'correction' && (
    draft.rootCause.trim().length < 4
    || draft.correctiveAction.trim().length < 4
    || draft.responsibleParty.trim().length < 2
    || draft.evidenceReference.trim().length < 3
  )
  const closureInvalid = editor?.type === 'closure' && (
    draft.verificationResult !== 'passed'
    || draft.verificationEvidence.trim().length < 3
    || draft.verifiedBy.trim().length < 2
    || !toIsoDateTime(draft.verifiedAt)
  )

  return (
    <section className="job-workspace-section field-risk-control nonconformance-control" data-testid="nonconformance-control">
      <div className="section-heading field-risk-heading">
        <ClipboardPenLine size={18} />
        <div>
          <h3>{t('Nonconformance register')}</h3>
          <p>{t('Quality deviations, containment, corrective action, and independent verification.')}</p>
        </div>
        {canReport ? <button type="button" className="secondary-button" disabled={submitting} onClick={beginCreate}><Plus size={15} />{t('New NCR')}</button> : null}
      </div>

      <div className="field-risk-summary" aria-label={t('Nonconformance summary')}>
        <div><span>{t('Open NCRs')}</span><strong>{open}</strong></div>
        <div><span>{t('Correction review')}</span><strong>{pendingCorrection}</strong></div>
        <div><span>{t('Closure review')}</span><strong>{pendingClosure}</strong></div>
        <div><span>{t('Overdue')}</span><strong>{overdue}</strong></div>
      </div>

      {editor ? (
        <form className="field-risk-form form-grid compact-form" data-testid={`nonconformance-${editor.type}-form`} onSubmit={submit}>
          {editor.type === 'create' ? (
            <>
              <label>{t('Severity')}<select value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: event.target.value })}><option value="low">{t('Low')}</option><option value="medium">{t('Medium')}</option><option value="high">{t('High')}</option><option value="critical">{t('Critical')}</option></select></label>
              <label>{t('Discipline')}<input required minLength="2" maxLength="80" value={draft.discipline} onChange={(event) => setDraft({ ...draft, discipline: event.target.value })} placeholder={t('Quality, structural, MEP')} /></label>
              <label className="form-span">{t('NCR title')}<input autoFocus required minLength="3" maxLength="240" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={t('Observed deviation from retained requirement')} /></label>
              <label>{t('Detected at')}<input required type="datetime-local" value={draft.detectedAt} onChange={(event) => setDraft({ ...draft, detectedAt: event.target.value })} /></label>
              <label>{t('Raised by')}<input required minLength="2" maxLength="160" value={draft.raisedBy} onChange={(event) => setDraft({ ...draft, raisedBy: event.target.value })} /></label>
              <label className="form-span">{t('Observed condition')}<textarea required minLength="4" maxLength="4000" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
              <label>{t('Location')}<input maxLength="500" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} /></label>
              <label>{t('Corrective due date')}<input required type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label>
              <label className="form-span">{t('Requirement reference')}<textarea required minLength="3" maxLength="500" value={draft.requirementReference} onChange={(event) => setDraft({ ...draft, requirementReference: event.target.value })} placeholder={t('Drawing, specification, approved sample, method, or acceptance criterion')} /></label>
              <label className="form-span">{t('Immediate containment')}<textarea required minLength="4" maxLength="4000" value={draft.immediateContainment} onChange={(event) => setDraft({ ...draft, immediateContainment: event.target.value })} /></label>
              <label>{t('Responsible party')}<input required minLength="2" maxLength="160" value={draft.responsibleParty} onChange={(event) => setDraft({ ...draft, responsibleParty: event.target.value })} /></label>
              <label>{t('Source inspection')}<select value={draft.sourceInspectionId} onChange={(event) => setDraft({ ...draft, sourceInspectionId: event.target.value })}><option value="">{t('No source inspection')}</option>{(job.inspections || EMPTY_LIST).map((inspection) => <option key={inspection.id} value={inspection.id}>{inspection.title}</option>)}</select></label>
              <label>{t('Source observation')}<select value={draft.sourceObservationId} onChange={(event) => setDraft({ ...draft, sourceObservationId: event.target.value })}><option value="">{t('No source observation')}</option>{(job.observations || EMPTY_LIST).map((observation) => <option key={observation.id} value={observation.id}>{observation.title}</option>)}</select></label>
              <label>{t('Evidence document')}<select value={draft.evidenceDocumentId} onChange={(event) => setDraft({ ...draft, evidenceDocumentId: event.target.value })}><option value="">{t('No linked document')}</option>{(job.documents || EMPTY_LIST).map((document) => <option key={document.id} value={document.id}>{document.title || document.filename || document.id}</option>)}</select></label>
              <label className="form-span">{t('Notes')}<textarea maxLength="2000" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
            </>
          ) : editor.type === 'correction' ? (
            <>
              <div className="form-span workflow-note"><strong>{editor.record.ncrNumber}</strong> / {editor.record.title}</div>
              <label className="form-span">{t('Root cause')}<textarea autoFocus required minLength="4" maxLength="4000" value={draft.rootCause} onChange={(event) => setDraft({ ...draft, rootCause: event.target.value })} /></label>
              <label className="form-span">{t('Corrective action')}<textarea required minLength="4" maxLength="4000" value={draft.correctiveAction} onChange={(event) => setDraft({ ...draft, correctiveAction: event.target.value })} /></label>
              <label>{t('Responsible party')}<input required minLength="2" maxLength="160" value={draft.responsibleParty} onChange={(event) => setDraft({ ...draft, responsibleParty: event.target.value })} /></label>
              <label>{t('Corrective due date')}<input required type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label>
              <label className="form-span">{t('Evidence reference')}<input required minLength="3" maxLength="500" value={draft.evidenceReference} onChange={(event) => setDraft({ ...draft, evidenceReference: event.target.value })} placeholder={t('Method review, test plan, drawing, or retained internal reference')} /></label>
              <label>{t('Evidence document')}<select value={draft.evidenceDocumentId} onChange={(event) => setDraft({ ...draft, evidenceDocumentId: event.target.value })}><option value="">{t('No linked document')}</option>{(job.documents || EMPTY_LIST).map((document) => <option key={document.id} value={document.id}>{document.title || document.filename || document.id}</option>)}</select></label>
              <label>{t('Review notes')}<textarea maxLength="2000" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
            </>
          ) : (
            <>
              <div className="form-span workflow-note"><strong>{editor.record.ncrNumber}</strong> / {t('approved correction')}: {editor.record.correctiveAction?.correctiveAction}</div>
              <label>{t('Verification result')}<select value={draft.verificationResult} onChange={(event) => setDraft({ ...draft, verificationResult: event.target.value })}><option value="passed">{t('Passed')}</option></select></label>
              <label>{t('Verified at')}<input required type="datetime-local" value={draft.verifiedAt} onChange={(event) => setDraft({ ...draft, verifiedAt: event.target.value })} /></label>
              <label>{t('Verified by')}<input required minLength="2" maxLength="160" value={draft.verifiedBy} onChange={(event) => setDraft({ ...draft, verifiedBy: event.target.value })} /></label>
              <label>{t('Evidence document')}<select value={draft.evidenceDocumentId} onChange={(event) => setDraft({ ...draft, evidenceDocumentId: event.target.value })}><option value="">{t('No linked document')}</option>{(job.documents || EMPTY_LIST).map((document) => <option key={document.id} value={document.id}>{document.title || document.filename || document.id}</option>)}</select></label>
              <label className="form-span">{t('Verification evidence')}<input autoFocus required minLength="3" maxLength="500" value={draft.verificationEvidence} onChange={(event) => setDraft({ ...draft, verificationEvidence: event.target.value })} placeholder={t('Inspection, test, survey, or retained evidence reference')} /></label>
              <label className="form-span">{t('Verification notes')}<textarea maxLength="2000" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
            </>
          )}
          <p className="workflow-note form-span">{t('NCR closure remains separate from inspection sign-off, client acceptance, contract completion, and external communication.')}</p>
          <div className="form-actions form-span">
            <button className="primary-button" disabled={submitting || createInvalid || correctionInvalid || closureInvalid || (editor.type !== 'create' && !online)}><ShieldCheck size={15} />{editor.type === 'create' ? (online ? t('Retain NCR') : t('Save NCR offline')) : editor.type === 'correction' ? t('Request correction approval') : t('Request closure approval')}</button>
            <button type="button" className="secondary-button" onClick={() => setEditor(null)}>{t('Cancel')}</button>
          </div>
        </form>
      ) : null}

      <div className="field-risk-register">
        {records.length ? records.map((record) => {
          const approvalId = record.status === 'pending_closure_approval' ? record.closureApprovalId : record.correctionApprovalId
          const pending = (job.approvals || EMPTY_LIST).find((approval) => approval.id === approvalId && approval.status === 'pending')
          const correctionReady = ['open', 'correction_rejected'].includes(record.status)
          const closureReady = record.status === 'correction_approved'
          return (
            <article className={`field-risk-row field-risk-${record.severity}`} key={record.id} data-testid={`nonconformance-${record.id}`}>
              <div className="field-risk-row-copy">
                <div><strong>{record.ncrNumber} / {record.title}</strong><span className={`status status-${record.status}`}>{t(formatStatus(record.status))}</span></div>
                <small>{t(formatStatus(record.discipline))} / {t(formatStatus(record.severity))} / {t('detected {detected} / due {due}', { detected: formatDateTime(record.detectedAt), due: formatDate(record.correctiveAction?.dueAt || record.dueAt) })}</small>
                <p>{record.description}</p>
                {record.correctiveAction ? <p><strong>{t('Correction')}:</strong> {record.correctiveAction.correctiveAction}</p> : null}
                {record.closure ? <p><strong>{t('Verified')}:</strong> {record.closure.verificationEvidence}</p> : null}
              </div>
              <div className="field-risk-row-actions">
                {pending ? <span className="tag tag-amber">{t('Approval pending')}</span> : null}
                {pending && canApprove ? <button type="button" className="secondary-button" onClick={() => onOpenApprovals({ approvalId: pending.id })}><ShieldCheck size={14} />{t('Review')}</button> : null}
                {!pending && canCoordinate && correctionReady ? <button type="button" className="secondary-button" disabled={submitting || !online} onClick={() => beginCorrection(record)}><ClipboardPenLine size={14} />{t('Corrective action')}</button> : null}
                {!pending && canCoordinate && closureReady ? <button type="button" className="secondary-button" disabled={submitting || !online} onClick={() => beginClosure(record)}><BadgeCheck size={14} />{t('Verify closure')}</button> : null}
              </div>
            </article>
          )
        }) : <p className="workflow-note">{t('No nonconformance records are retained for this job.')}</p>}
      </div>
      {fieldScoped ? <p className="workflow-note">{t('Assigned field workers can capture retained facts and containment. Corrective action and closure remain office and approver controlled.')}</p> : null}
    </section>
  )
}



export default NonconformanceControl

export { NonconformanceControl }
