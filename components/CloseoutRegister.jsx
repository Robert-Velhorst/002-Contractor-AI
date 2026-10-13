import './JobWorkspaceControls.css'
import { useCallback, useEffect, useState } from 'react'
import { ClipboardCheck, PackageCheck, Plus, ShieldCheck } from 'lucide-react'
import { createFieldEvidenceDraftId } from '../field-outbox'
import { EMPTY_LIST, formatCurrency, formatDate, formatDateTime, formatStatus, futureDateInput } from '../dashboard-format'
import { operatorText } from '../operator-locale'



function emptyCloseoutDraft(type = 'punch_item') {
  if (type === 'warranty_claim') {
    return {
      warrantyType: 'workmanship',
      title: '',
      severity: 'medium',
      dueAt: futureDateInput(7),
      issue: '',
    }
  }
  if (type === 'aftercare') {
    return {
      type: 'client_follow_up',
      title: '',
      owner: '',
      dueAt: futureDateInput(7),
      channel: 'portal',
      notes: '',
    }
  }
  if (type === 'client_feedback') {
    return {
      entryKey: createFieldEvidenceDraftId(),
      surveyType: 'project_experience',
      respondentName: '',
      npsScore: '',
      csatScore: '',
      effortScore: '',
      evidenceReference: '',
      comment: '',
      followUpConsent: false,
      testimonialConsent: false,
    }
  }
  return {
    entryKey: createFieldEvidenceDraftId(),
    title: '',
    severity: 'medium',
    assignee: '',
    dueAt: futureDateInput(3),
    location: '',
    description: '',
    evidenceDocumentId: '',
    clientVisible: false,
  }
}

function CloseoutRegister({
  job,
  locale,
  canReportPunch,
  canCoordinate,
  canApprove,
  fieldScoped,
  operator,
  submitting,
  onCreate,
  onLifecycle,
  onOpenApprovals,
}) {
  const t = useCallback((key, variables = {}) => operatorText(locale, key, variables), [locale])
  const canReviewClientResponse = !fieldScoped && (canCoordinate || canApprove)
  const closeoutWarningLabel = warning => {
    if (warning.code === 'client_response_pending') return t('No client completion response has been recorded.')
    if (warning.code === 'client_response_stale') return t('The client response refers to an older handover evidence version.')
    if (warning.code === 'client_response_unreviewed') return t('The latest client response needs an office review.')
    if (warning.code === 'client_non_acceptance') return t('The client recorded that the work was not accepted.')
    if (warning.code === 'client_items_recorded') return t('The client recorded outstanding items; their resolution is not inferred from this response.')
    if (warning.code === 'client_follow_up_required') return t('The latest office review requires follow-up.')
    if (warning.code === 'commercial_items_open') return t('{variations} variation(s) and {selections} client selection(s) remain unresolved.', { variations: warning.variationCount, selections: warning.selectionCount })
    if (warning.code === 'receivables_open') return t('{count} client invoice(s) have outstanding balances.', { count: warning.count })
    if (warning.code === 'supplier_payables_open') return t('{count} supplier invoice(s) have outstanding balances.', { count: warning.count })
    if (warning.code === 'aftercare_open') return t('{warranty} warranty claim(s) and {followUps} aftercare item(s) remain open.', { warranty: warning.warrantyCount, followUps: warning.followUpCount })
    return warning.label
  }
  const [view, setView] = useState('punch_item')
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState(() => emptyCloseoutDraft('punch_item'))
  const [online, setOnline] = useState(() => navigator.onLine !== false)
  const [completionResponses, setCompletionResponses] = useState([])
  const [completionLoadError, setCompletionLoadError] = useState('')
  const [completionReviewDrafts, setCompletionReviewDrafts] = useState({})
  const [completionReviewErrors, setCompletionReviewErrors] = useState({})
  const [completionReviewBusy, setCompletionReviewBusy] = useState('')
  const [closeoutAssessment, setCloseoutAssessment] = useState(null)
  const [closeoutAssessmentError, setCloseoutAssessmentError] = useState('')
  const [closeoutAssessmentLoading, setCloseoutAssessmentLoading] = useState(false)
  const [closeoutAssessmentRevision, setCloseoutAssessmentRevision] = useState(0)
  const punchItems = job.punchItems || EMPTY_LIST
  const warrantyClaims = job.warrantyClaims || EMPTY_LIST
  const aftercare = job.aftercare || EMPTY_LIST
  const clientFeedback = job.clientFeedback || EMPTY_LIST
  const visibleViews = fieldScoped
    ? [{ key: 'punch_item', label: t('Punch'), count: punchItems.length }]
    : [
        { key: 'punch_item', label: t('Punch'), count: punchItems.length },
        { key: 'warranty_claim', label: t('Warranty'), count: warrantyClaims.length },
        { key: 'aftercare', label: t('Aftercare'), count: aftercare.length },
        { key: 'client_feedback', label: t('Feedback'), count: clientFeedback.length },
      ]
  const records = view === 'warranty_claim'
    ? warrantyClaims
    : view === 'aftercare'
      ? aftercare
      : view === 'client_feedback'
        ? clientFeedback
        : punchItems
  const canCreate = view === 'punch_item' ? canReportPunch : canCoordinate
  const activeStatuses = view === 'punch_item'
    ? new Set(['open', 'in_progress', 'pending_approval'])
    : view === 'warranty_claim'
      ? new Set(['open', 'under_review', 'pending_approval'])
      : view === 'aftercare'
        ? new Set(['open', 'planned', 'due'])
        : new Set()
  const openPunch = punchItems.filter((record) => !['closed', 'resolved', 'accepted', 'verified'].includes(record.status)).length
  const openWarranty = warrantyClaims.filter((record) => !['closed', 'resolved', 'accepted', 'rejected'].includes(record.status)).length
  const openAftercare = aftercare.filter((record) => !['completed', 'closed', 'cancelled'].includes(record.status)).length
  const feedbackRecoveryFor = (record) => aftercare.find((item) =>
    item.data?.feedbackRecovery === true && item.data?.feedbackId === record.id,
  ) || null
  const recoveryRequired = clientFeedback.filter((record) => {
    if (!record.followUpRequired) return false
    const recovery = feedbackRecoveryFor(record)
    return !recovery || !['completed', 'closed', 'cancelled'].includes(recovery.status)
  }).length
  const pendingReview = (job.approvals || EMPTY_LIST).filter((approval) =>
    approval.status === 'pending' && ['punch_item', 'warranty_claim'].includes(approval.targetType),
  ).length

  useEffect(() => {
    setView('punch_item')
    setCreating(false)
    setDraft(emptyCloseoutDraft('punch_item'))
  }, [job.id])

  useEffect(() => {
    if (!canReviewClientResponse) { setCompletionResponses([]); return undefined }
    const controller = new AbortController()
    setCompletionLoadError('')
    fetch(`/api/ledger/jobs/${encodeURIComponent(job.id)}/client-completion-reviews`, { credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error?.message || 'Client responses could not be loaded.')
        setCompletionResponses(payload.responses || [])
      })
      .catch(error => { if (error.name !== 'AbortError') setCompletionLoadError(error.message) })
    return () => controller.abort()
  }, [job.id, canReviewClientResponse])

  useEffect(() => {
    if (!canReviewClientResponse) { setCloseoutAssessment(null); return undefined }
    const controller = new AbortController()
    setCloseoutAssessmentLoading(true)
    setCloseoutAssessmentError('')
    fetch(`/api/ledger/jobs/${encodeURIComponent(job.id)}/closeout-assessment`, { credentials: 'same-origin', signal: controller.signal })
      .then(async response => {
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) throw new Error(payload?.error?.message || t('The closeout assessment could not be loaded.'))
        setCloseoutAssessment(payload.assessment || null)
      })
      .catch(error => { if (error.name !== 'AbortError') setCloseoutAssessmentError(error.message) })
      .finally(() => { if (!controller.signal.aborted) setCloseoutAssessmentLoading(false) })
    return () => controller.abort()
  }, [job.id, canReviewClientResponse, closeoutAssessmentRevision, t])

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
    setDraft(emptyCloseoutDraft(nextView))
  }

  const beginCreate = () => {
    setDraft({
      ...emptyCloseoutDraft(view),
      ...(view === 'punch_item'
        ? { assignee: operator?.name || '' }
        : view === 'aftercare'
          ? { owner: operator?.name || '' }
          : {}),
    })
    setCreating(true)
  }

  async function submitRecord(event) {
    event.preventDefault()
    const result = await onCreate(view, draft)
    if (result) {
      setCreating(false)
      setDraft(emptyCloseoutDraft(view))
    }
  }

  async function submitCompletionReview(event, response) {
    event.preventDefault()
    const draft = completionReviewDrafts[response.id] || { disposition: 'follow_up_required', note: '', confirmStaleSource: false }
    setCompletionReviewBusy(response.id)
    setCompletionReviewErrors(current => ({ ...current, [response.id]: '' }))
    try {
      const result = await fetch(`/api/ledger/jobs/${encodeURIComponent(job.id)}/client-completion-reviews/${encodeURIComponent(response.id)}/reviews`, {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...draft, entryKey: `office-review-${crypto.randomUUID()}` }),
      })
      const payload = await result.json().catch(() => ({}))
      if (!result.ok) throw new Error(payload?.error?.message || t('The client response could not be reviewed.'))
      setCompletionResponses(current => current.map(item => item.id === response.id
        ? { ...item, reviewActions: [...(item.reviewActions || []), payload.action] }
        : item))
      setCompletionReviewDrafts(current => ({ ...current, [response.id]: { disposition: 'follow_up_required', note: '', confirmStaleSource: false } }))
      setCloseoutAssessmentRevision(current => current + 1)
    } catch (error) {
      setCompletionReviewErrors(current => ({ ...current, [response.id]: error.message }))
    } finally {
      setCompletionReviewBusy('')
    }
  }

  const invalidDraft = view === 'client_feedback'
    ? draft.evidenceReference.trim().length < 4
      || !Number.isInteger(draft.npsScore)
      || draft.npsScore < 0
      || draft.npsScore > 10
      || !Number.isInteger(draft.csatScore)
      || draft.csatScore < 1
      || draft.csatScore > 5
      || !Number.isInteger(draft.effortScore)
      || draft.effortScore < 1
      || draft.effortScore > 5
    : draft.title.trim().length < 3
      || (view === 'punch_item' && (draft.description.trim().length < 4 || draft.assignee.trim().length < 2))
      || (view === 'warranty_claim' && draft.issue.trim().length < 4)
      || (view === 'aftercare' && (draft.notes.trim().length < 4 || draft.owner.trim().length < 2))

  return (
    <section className="job-workspace-section closeout-register" data-testid="closeout-register">
      <div className="section-heading closeout-register-heading">
        <PackageCheck size={18} />
        <div>
          <h3>{t('Closeout and aftercare')}</h3>
          <p>{t('Retain defects, warranty issues, and follow-up work without asserting acceptance or contacting the client.')}</p>
        </div>
        {canCreate ? <button type="button" className="secondary-button" data-testid="closeout-create-record" disabled={submitting} onClick={beginCreate}><Plus size={15} />{view === 'punch_item' ? t('New punch item') : view === 'warranty_claim' ? t('New warranty claim') : view === 'aftercare' ? t('New follow-up') : t('Record feedback')}</button> : null}
      </div>

      <div className="closeout-summary" aria-label={t('Closeout summary')}>
        <div><span>{t('Open punch')}</span><strong>{openPunch}</strong></div>
        <div><span>{t('Warranty')}</span><strong>{openWarranty}</strong></div>
        <div><span>{t('Aftercare')}</span><strong>{openAftercare}</strong></div>
        <div><span>{t('Feedback recovery')}</span><strong>{recoveryRequired}</strong></div>
        <div><span>{t('Pending review')}</span><strong>{pendingReview}</strong></div>
      </div>

      {canReviewClientResponse ? <section className="closeout-assessment" data-testid="closeout-assessment" aria-labelledby="closeout-assessment-title">
        <div className="closeout-assessment-heading">
          <div><h4 id="closeout-assessment-title">{t('Contractual closeout overview')}</h4>
            {closeoutAssessment ? <span className={`tag ${closeoutAssessment.status === 'operationally_blocked' ? 'tag-red' : closeoutAssessment.status === 'recorded_no_open_items' ? 'tag-green' : 'tag-amber'}`}>{t(closeoutAssessment.status)}</span> : null}
          </div>
          <button type="button" className="secondary-button" disabled={closeoutAssessmentLoading} onClick={() => setCloseoutAssessmentRevision(current => current + 1)}>{closeoutAssessmentLoading ? t('Refreshing...') : t('Refresh assessment')}</button>
        </div>
        {closeoutAssessmentError ? <p className="workflow-note" role="alert">{closeoutAssessmentError}</p> : null}
        {closeoutAssessmentLoading && !closeoutAssessment ? <p className="workflow-note" role="status">{t('Loading closeout status...')}</p> : null}
        {closeoutAssessment ? <>
          <div className="closeout-assessment-grid">
            <div><strong>{t('Execution')}</strong><span>{t(closeoutAssessment.sections.operational.status)}</span><small>{t('{count} open blocker(s)', { count: closeoutAssessment.sections.operational.blockers.length })}</small></div>
            <div><strong>{t('Handover')}</strong><span>{t(closeoutAssessment.sections.handover.status)}</span><small>{closeoutAssessment.sections.handover.currentPackageId || t('No current dossier')}</small></div>
            <div><strong>{t('Client response')}</strong><span>{t(closeoutAssessment.sections.client.state)}</span><small>{closeoutAssessment.sections.client.latestDisposition ? t(closeoutAssessment.sections.client.latestDisposition) : t('No office disposition')}</small></div>
            <div><strong>{t('Commercial')}</strong><span>{t(closeoutAssessment.sections.commercial.status)}</span><small>{t('{variations} variations / {selections} selections', { variations: closeoutAssessment.sections.commercial.openVariations.length, selections: closeoutAssessment.sections.commercial.openSelections.length })}</small></div>
            <div><strong>{t('Finance')}</strong><span>{t(closeoutAssessment.sections.finance.status)}</span><small>{t('{receivables} client balances / {payables} supplier balances', { receivables: closeoutAssessment.sections.finance.receivables.length, payables: closeoutAssessment.sections.finance.supplierPayables.length })}</small><small>{(closeoutAssessment.sections.finance.receivableTotals || []).map(item => formatCurrency(item.amount, item.currency)).join(' / ') || formatCurrency(0)} {t('to collect')} / {(closeoutAssessment.sections.finance.payableTotals || []).map(item => formatCurrency(item.amount, item.currency)).join(' / ') || formatCurrency(0)} {t('to pay')}</small></div>
            <div><strong>{t('Aftercare')}</strong><span>{t(closeoutAssessment.sections.aftercare.status)}</span><small>{t('{warranty} warranty / {followUps} follow-up', { warranty: closeoutAssessment.sections.aftercare.warrantyClaims.length, followUps: closeoutAssessment.sections.aftercare.followUps.length })}</small></div>
          </div>
          {closeoutAssessment.warnings.length ? <ul className="closeout-assessment-warnings">{closeoutAssessment.warnings.map(warning => <li key={warning.code}>{closeoutWarningLabel(warning)}</li>)}</ul> : <p className="workflow-note">{t('No open items are currently recorded across the assessed closeout areas.')}</p>}
          <details className="closeout-assessment-details">
            <summary>{t('View closeout records and blockers')}</summary>
            <div><strong>{t('Execution blockers')}</strong>{closeoutAssessment.sections.operational.blockers.length ? <ul>{closeoutAssessment.sections.operational.blockers.map((item, index) => <li key={`${item.code}-${index}`}>{t(item.label)}</li>)}</ul> : <p>{t('None recorded')}</p>}</div>
            <div><strong>{t('Handover requirements')}</strong>{[...closeoutAssessment.sections.handover.missing, ...closeoutAssessment.sections.handover.blockers].length ? <ul>{[...closeoutAssessment.sections.handover.missing, ...closeoutAssessment.sections.handover.blockers].map((item, index) => <li key={`${item.code}-${index}`}>{t(item.label)}</li>)}</ul> : <p>{t('None recorded')}</p>}</div>
            <div><strong>{t('Open commercial records')}</strong><ul>{[...closeoutAssessment.sections.commercial.openVariations, ...closeoutAssessment.sections.commercial.openSelections].map(item => <li key={item.id}>{item.title} / {t(item.status)}</li>)}</ul></div>
            <div><strong>{t('Work packages')}</strong>{closeoutAssessment.sections.workPackages?.records?.length ? <ul>{closeoutAssessment.sections.workPackages.records.map(pack => <li key={pack.id}>
              <strong>{pack.code} / {pack.title}</strong> / {t(pack.balanceStatus)}
              {pack.tasks.length ? <small>{t('{count} task(s)', { count: pack.tasks.filter(task => task.status !== 'completed').length })} {t('not completed')}</small> : null}
              {pack.remainingRows.map((row, index) => <small key={`${row.description}-${index}`}>{row.description}: {row.completedQuantity} / {row.plannedQuantity} {row.unit}; {row.remainingQuantity == null ? t('remaining amount unknown') : `${row.remainingQuantity} ${row.unit} ${t('remaining')}`}</small>)}
              {pack.deliveries.map(delivery => <div key={delivery.id}>
                <small>{delivery.title}: {t(delivery.physicalStatus)} / {t(delivery.inspectionStatus)} / {t(delivery.inspectionCoverageStatus)} / {t(delivery.customerResponseStatus)} / {t(delivery.financeStatus)}{delivery.invoiceIds.length ? ` / ${t('Invoices')}: ${delivery.invoiceIds.join(', ')}` : ''}</small>
                {delivery.financeStatus === 'allocation_conflict' ? <small role="alert">{t('Invoice milestone is linked to multiple active deliveries; balances are hidden until corrected.')}</small> : null}
                {delivery.financeMilestones.map(milestone => <small key={milestone.id}>{t('Billing milestone')}: {milestone.title} / {formatCurrency(milestone.total, milestone.currency)} {t('including tax')}{milestone.invoiceId ? ` / ${t('Invoice')}: ${milestone.invoiceId}` : ` / ${t('Not invoiced')}`}</small>)}
                {delivery.invoiceBalances.map(invoice => <small key={invoice.id} data-testid={`closeout-delivery-balance-${invoice.id}`}>{t('Received')}: {formatCurrency(invoice.receivedAmount, invoice.currency)} / {t('Outstanding')}: {formatCurrency(invoice.outstandingAmount, invoice.currency)}</small>)}
              </div>)}
            </li>)}</ul> : <p>{t('No active work packages are recorded.')}</p>}</div>
            <div><strong>{t('Open finance records')}</strong><ul>{[...closeoutAssessment.sections.finance.receivables, ...closeoutAssessment.sections.finance.supplierPayables].map(item => <li key={item.id}>{item.reference} / {t(item.status)} / {formatCurrency(item.outstandingAmount, item.currency)}</li>)}</ul></div>
            <div><strong>{t('Open warranty and aftercare records')}</strong><ul>{[...closeoutAssessment.sections.aftercare.warrantyClaims, ...closeoutAssessment.sections.aftercare.followUps].map(item => <li key={item.id}>{item.title} / {t(item.status)}{item.dueAt ? ` / ${formatDate(item.dueAt)}` : ''}</li>)}</ul></div>
          </details>
          <p className="workflow-note">{t('This is a record summary, not a legal acceptance, contractual closure, or payment-release decision.')}</p>
        </> : null}
      </section> : null}

      {!fieldScoped ? <section className="closeout-client-reviews" data-testid="client-completion-responses" aria-labelledby="client-completion-responses-title">
        <div className="closeout-client-reviews-heading"><h4 id="client-completion-responses-title">{t('Client handover responses')}</h4><span>{completionResponses.length}</span></div>
        {completionLoadError ? <p className="workflow-note" role="alert">{completionLoadError}</p> : completionResponses.length ? completionResponses.map(response => <article className="closeout-client-review" key={response.id}>
          <div><strong>{t(response.outcome)}</strong><span className={response.sourceCurrent ? 'tag tag-amber' : 'tag tag-red'}>{response.sourceCurrent ? t('Source current') : t('Source changed - review required')}</span></div>
          <small>{response.respondentName} / {response.packageReference || response.packageDocumentId} / {formatDateTime(response.submittedAt)}</small>
          {response.note ? <p>{response.note}</p> : null}
          {response.reviewActions?.length ? <div className="closeout-client-review-history" aria-label={t('Office review history')}>
            {response.reviewActions.map(action => <div key={action.id}>
              <strong>{t(action.disposition)}</strong><small>{formatDateTime(action.createdAt)} / {action.actor}</small>
              <p>{action.note}</p>
              {!action.sourceCurrent ? <span className="tag tag-red">{t('Reviewed against a changed dossier')}</span> : null}
            </div>)}
          </div> : <p className="workflow-note">{t('Received, not reviewed. This response does not itself change job status, contract value, or payment.')}</p>}
          {canReviewClientResponse ? <form className="closeout-client-review-form" onSubmit={event => submitCompletionReview(event, response)}>
            <label>{t('Office disposition')}<select
              value={(completionReviewDrafts[response.id] || {}).disposition || 'follow_up_required'}
              onChange={event => setCompletionReviewDrafts(current => ({ ...current, [response.id]: { ...(current[response.id] || { note: '', confirmStaleSource: false }), disposition: event.target.value } }))}>
              <option value="follow_up_required">{t('Follow-up required')}</option>
              <option value="no_follow_up_recorded">{t('Record without further action')}</option>
              {response.outcome === 'not_accepted' ? <option value="escalate_not_accepted">{t('Escalate non-acceptance')}</option> : null}
            </select></label>
            <label>{t('Review rationale')}<textarea required minLength={5} maxLength={2000} rows={2}
              value={(completionReviewDrafts[response.id] || {}).note || ''}
              onChange={event => setCompletionReviewDrafts(current => ({ ...current, [response.id]: { ...(current[response.id] || { disposition: 'follow_up_required', confirmStaleSource: false }), note: event.target.value } }))} /></label>
            {!response.sourceCurrent ? <label className="closeout-stale-confirm"><input type="checkbox"
              checked={Boolean((completionReviewDrafts[response.id] || {}).confirmStaleSource)}
              onChange={event => setCompletionReviewDrafts(current => ({ ...current, [response.id]: { ...(current[response.id] || { disposition: 'follow_up_required', note: '' }), confirmStaleSource: event.target.checked } }))} />
              {t('I understand that the handover dossier changed after this response.')}</label> : null}
            {completionReviewErrors[response.id] ? <p role="alert" className="workflow-note">{completionReviewErrors[response.id]}</p> : null}
            <button type="submit" className="secondary-button" disabled={completionReviewBusy === response.id || (completionReviewDrafts[response.id]?.note || '').trim().length < 5 || (!response.sourceCurrent && !completionReviewDrafts[response.id]?.confirmStaleSource)}>
              {completionReviewBusy === response.id ? t('Saving review...') : t('Record office review')}
            </button>
          </form> : null}
          <p className="workflow-note">{t('Office review is operational only and does not constitute legal acceptance or change job status, contract value, invoices, or payment.')}</p>
        </article>) : <p className="workflow-note">{t('No client handover responses have been received.')}</p>}
      </section> : null}

      <div className={`closeout-tabs ${visibleViews.length === 1 ? 'single-tab' : ''}`} role="tablist" aria-label={t('Closeout record type')}>
        {visibleViews.map((option) => (
          <button type="button" role="tab" data-testid={`closeout-tab-${option.key}`} aria-selected={view === option.key} className={view === option.key ? 'active' : ''} key={option.key} onClick={() => selectView(option.key)}>{option.label} <span>{option.count}</span></button>
        ))}
      </div>

      {creating ? (
        <form className="closeout-form form-grid compact-form" data-testid={`closeout-${view}-form`} onSubmit={submitRecord}>
          {view === 'punch_item' ? (
            <>
              <label>{t('Severity')}<select value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: event.target.value })}><option value="low">{t('Low')}</option><option value="medium">{t('Medium')}</option><option value="high">{t('High')}</option><option value="critical">{t('Critical')}</option></select></label>
              <label>{t('Corrective due date')}<input required type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label>
              <label className="form-span">{t('Punch title')}<input autoFocus required minLength="3" maxLength="240" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={t('Incomplete, defective, or unverified work')} /></label>
              <label>{t('Assigned to')}<input required minLength="2" maxLength="160" value={draft.assignee} onChange={(event) => setDraft({ ...draft, assignee: event.target.value })} /></label>
              <label>{t('Location')}<input maxLength="240" value={draft.location} onChange={(event) => setDraft({ ...draft, location: event.target.value })} placeholder={t('Room, elevation, grid, or asset')} /></label>
              <label className="form-span">{t('Observed condition')}<textarea required minLength="4" maxLength="4000" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder={t('Record the condition and completion criteria without assuming correction.')} /></label>
              <label className="form-span">{t('Linked evidence')}<select value={draft.evidenceDocumentId} onChange={(event) => setDraft({ ...draft, evidenceDocumentId: event.target.value })}><option value="">{t('No linked document')}</option>{(job.documents || EMPTY_LIST).map((document) => <option value={document.id} key={document.id}>{document.title || document.filename || document.id}</option>)}</select></label>
              {canCoordinate ? <label className="checkbox-label form-span"><input type="checkbox" checked={draft.clientVisible} onChange={(event) => setDraft({ ...draft, clientVisible: event.target.checked })} />{t('Prepare for client-visible review; approval remains required')}</label> : null}
            </>
          ) : view === 'warranty_claim' ? (
            <>
              <label>{t('Warranty type')}<select value={draft.warrantyType} onChange={(event) => setDraft({ ...draft, warrantyType: event.target.value })}><option value="workmanship">{t('Workmanship')}</option><option value="material">{t('Material')}</option><option value="manufacturer">{t('Manufacturer')}</option><option value="service">{t('Service')}</option><option value="other">{t('Other')}</option></select></label>
              <label>{t('Severity')}<select value={draft.severity} onChange={(event) => setDraft({ ...draft, severity: event.target.value })}><option value="low">{t('Low')}</option><option value="medium">{t('Medium')}</option><option value="high">{t('High')}</option><option value="critical">{t('Critical')}</option></select></label>
              <label className="form-span">{t('Claim title')}<input autoFocus required minLength="3" maxLength="240" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={t('Reported post-completion issue')} /></label>
              <label>{t('Review due date')}<input required type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label>
              <label className="form-span">{t('Reported issue')}<textarea required minLength="4" maxLength="4000" value={draft.issue} onChange={(event) => setDraft({ ...draft, issue: event.target.value })} placeholder={t('Retain the reported facts without admitting liability or promising a remedy.')} /></label>
            </>
          ) : view === 'aftercare' ? (
            <>
              <label>{t('Follow-up type')}<select value={draft.type} onChange={(event) => setDraft({ ...draft, type: event.target.value })}><option value="client_follow_up">{t('Client follow-up')}</option><option value="warranty_review">{t('Warranty review')}</option><option value="maintenance_review">{t('Maintenance review')}</option><option value="quality_check">{t('Quality check')}</option></select></label>
              <label>{t('Channel')}<select value={draft.channel} onChange={(event) => setDraft({ ...draft, channel: event.target.value })}><option value="portal">{t('Portal')}</option><option value="phone">{t('Phone')}</option><option value="email">{t('Email')}</option><option value="site_visit">{t('Site visit')}</option></select></label>
              <label className="form-span">{t('Follow-up title')}<input autoFocus required minLength="3" maxLength="240" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={t('Internal follow-up action')} /></label>
              <label>{t('Owner')}<input required minLength="2" maxLength="160" value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} /></label>
              <label>{t('Due date')}<input required type="date" value={draft.dueAt} onChange={(event) => setDraft({ ...draft, dueAt: event.target.value })} /></label>
              <label className="form-span">{t('Follow-up purpose')}<textarea required minLength="4" maxLength="4000" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} placeholder={t('What should be checked and what evidence should be retained?')} /></label>
            </>
          ) : (
            <>
              <label>{t('Survey point')}<select value={draft.surveyType} onChange={(event) => setDraft({ ...draft, surveyType: event.target.value })}><option value="project_experience">{t('Project experience')}</option><option value="handover">{t('Handover')}</option><option value="aftercare">{t('Aftercare')}</option><option value="warranty">{t('Warranty')}</option></select></label>
              <label>{t('Respondent')}<input maxLength="160" value={draft.respondentName} onChange={(event) => setDraft({ ...draft, respondentName: event.target.value })} placeholder={t('Optional name')} /></label>
              <label>{t('NPS (0-10)')}<input required type="number" min="0" max="10" step="1" value={draft.npsScore} onChange={(event) => setDraft({ ...draft, npsScore: event.target.value === '' ? '' : Number(event.target.value) })} /></label>
              <label>{t('Satisfaction (1-5)')}<input required type="number" min="1" max="5" step="1" value={draft.csatScore} onChange={(event) => setDraft({ ...draft, csatScore: event.target.value === '' ? '' : Number(event.target.value) })} /></label>
              <label>{t('Ease (1-5)')}<input required type="number" min="1" max="5" step="1" value={draft.effortScore} onChange={(event) => setDraft({ ...draft, effortScore: event.target.value === '' ? '' : Number(event.target.value) })} /></label>
              <label className="form-span">{t('Evidence reference')}<input autoFocus required minLength="4" maxLength="500" value={draft.evidenceReference} onChange={(event) => setDraft({ ...draft, evidenceReference: event.target.value })} placeholder={t('Call note, signed survey, message, or import reference')} /></label>
              <label className="form-span">{t('Client comment')}<textarea maxLength="4000" value={draft.comment} onChange={(event) => setDraft({ ...draft, comment: event.target.value })} placeholder={t("Retain the client's words without adding inferred sentiment.")} /></label>
              <label className="checkbox-label form-span"><input type="checkbox" checked={draft.followUpConsent} onChange={(event) => setDraft({ ...draft, followUpConsent: event.target.checked })} />{t('Client consented to feedback follow-up')}</label>
              <label className="checkbox-label form-span"><input type="checkbox" checked={draft.testimonialConsent} onChange={(event) => setDraft({ ...draft, testimonialConsent: event.target.checked })} />{t('Client consented to internal testimonial review; publication still requires separate coordination')}</label>
            </>
          )}
          <p className="workflow-note form-span">{t('This retains an internal record only. It does not certify completion, accept liability, authorize cost, book work, or contact the client.')}</p>
          <div className="form-actions form-span">
            <button className="primary-button" disabled={submitting || invalidDraft || (view !== 'punch_item' && !online)}><ClipboardCheck size={15} />{view === 'punch_item' && !online ? t('Save punch item offline') : view !== 'punch_item' && !online ? t('Reconnect to retain') : view === 'punch_item' ? t('Retain punch item') : view === 'warranty_claim' ? t('Retain warranty claim') : view === 'aftercare' ? t('Retain follow-up') : t('Retain feedback')}</button>
            <button type="button" className="secondary-button" onClick={() => setCreating(false)}>{t('Cancel')}</button>
          </div>
        </form>
      ) : null}

      <div className="closeout-records">
        {records.length ? records.map((record) => {
          const pending = (job.approvals || EMPTY_LIST).find((approval) => approval.id === record.approvalId && approval.status === 'pending')
          const feedbackRecovery = view === 'client_feedback' ? feedbackRecoveryFor(record) : null
          const feedbackRecoveryLabel = !record.followUpRequired
            ? null
            : !feedbackRecovery
              ? t('Internal recovery required')
              : ['completed', 'closed'].includes(feedbackRecovery.status)
                ? t('Recovery completed')
                : feedbackRecovery.status === 'cancelled'
                  ? t('Recovery closed')
                  : t('Recovery in progress')
          const feedbackRecoveryClass = !feedbackRecovery
            ? 'tag-amber'
            : ['completed', 'closed'].includes(feedbackRecovery.status)
              ? 'tag-green'
              : feedbackRecovery.status === 'cancelled'
                ? 'tag-amber'
                : 'tag-blue'
          const detail = view === 'punch_item'
            ? record.data?.description
            : view === 'warranty_claim'
              ? record.data?.issue
              : view === 'aftercare'
                ? record.notes
                : record.comment
          const meta = view === 'punch_item'
            ? t('{severity} / {assignee} / due {date}', { severity: t(formatStatus(record.severity)), assignee: record.assignee || t('Unassigned'), date: formatDate(record.dueAt) })
            : view === 'warranty_claim'
              ? t('{type} / {severity} / due {date}', { type: t(formatStatus(record.data?.warrantyType || 'workmanship')), severity: t(formatStatus(record.severity)), date: formatDate(record.dueAt) })
              : view === 'aftercare'
                ? t('{type} / {owner} / due {date}', { type: t(formatStatus(record.type)), owner: record.owner || t('Unassigned'), date: formatDate(record.dueAt) })
                : t('NPS {nps}/10 / satisfaction {csat}/5 / ease {effort}/5 / {date}', { nps: record.npsScore, csat: record.csatScore, effort: record.effortScore, date: formatDate(record.submittedAt) })
          const title = view === 'client_feedback'
            ? record.respondentName
              ? t('{type} feedback from {respondent}', { type: t(formatStatus(record.surveyType)), respondent: record.respondentName })
              : t('{type} feedback', { type: t(formatStatus(record.surveyType)) })
            : record.title
          return (
            <article className={`closeout-row ${!['aftercare', 'client_feedback'].includes(view) ? `closeout-${record.severity}` : ''}`} key={record.id} data-testid={`closeout-${record.id}`}>
              <div className="closeout-row-copy"><div><strong>{title}</strong><span className={`status status-${record.status}`}>{t(formatStatus(record.status))}</span></div><small>{meta}</small>{detail ? <p>{detail}</p> : null}{view === 'client_feedback' && feedbackRecoveryLabel ? <span className={`tag ${feedbackRecoveryClass}`}>{feedbackRecoveryLabel}</span> : null}</div>
              <div className="closeout-row-actions">
                {pending ? <span className="tag tag-amber">{t('Approval pending')}</span> : null}
                {pending && canApprove ? <button type="button" className="secondary-button" onClick={() => onOpenApprovals({ approvalId: pending.id })}><ShieldCheck size={14} />{t('Review')}</button> : null}
                {!pending && canCoordinate && activeStatuses.has(record.status) ? <button type="button" className="secondary-button" data-testid="closeout-lifecycle-action" disabled={submitting} onClick={() => onLifecycle(view, record)}><ClipboardCheck size={14} />{view === 'punch_item' ? t('Resolve punch') : view === 'warranty_claim' ? t('Resolve claim') : t('Complete follow-up')}</button> : null}
              </div>
            </article>
          )
        }) : <p className="workflow-note">{view === 'punch_item'
          ? t('No punch items are retained for this job.')
          : view === 'warranty_claim'
            ? t('No warranty claims are retained for this job.')
            : view === 'aftercare'
              ? t('No aftercare follow-ups are retained for this job.')
              : t('No client feedback is retained for this job.')}</p>}
      </div>
      {fieldScoped ? <p className="workflow-note">{t('Assigned field workers can capture punch evidence. Resolution, acceptance, and client visibility remain office-controlled.')}</p> : null}
    </section>
  )
}



export default CloseoutRegister

export { CloseoutRegister }
