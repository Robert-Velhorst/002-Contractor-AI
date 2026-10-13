import './JobWorkspaceControls.css'
import { useState } from 'react'
import { CalendarDays, Check, ClipboardCheck, ClipboardList, FileUp, MailCheck, MessageSquareText, Plus, Send, ShieldCheck, X } from 'lucide-react'
import { EMPTY_LIST, formatDate, formatDateTime, formatStatus, futureDateInput, toIsoDateTime, toLocalDateTimeInput } from '../dashboard-format'
import { operatorText } from '../operator-locale'



const PROJECT_CONTROL_VALUE_LABELS = Object.freeze({
  general: 'General',
  architectural: 'Architectural',
  structural: 'Structural',
  mechanical: 'Mechanical',
  electrical: 'Electrical',
  civil: 'Civil',
  construction: 'For construction',
  review: 'For review',
  coordination: 'Coordination',
  record: 'Record / as-built',
  for_information: 'For information',
  for_review: 'For review',
  for_approval: 'For approval',
  for_construction: 'For construction',
  as_built: 'As built',
  progress: 'Progress',
  design: 'Design',
  client: 'Client',
  commercial: 'Commercial',
  handover: 'Handover',
  kickoff: 'Kickoff',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
})

function emptyRfiDraft() {
  return {
    title: '',
    question: '',
    responsible: '',
    discipline: 'general',
    dueAt: futureDateInput(3),
  }
}

function emptySubmittalDraft() {
  return {
    title: '',
    packageName: '',
    material: '',
    responsible: '',
    reviewer: '',
    dueAt: futureDateInput(7),
    attachmentDocumentIds: [],
    taskIds: [],
  }
}

function emptyControlledDocumentDraft() {
  return {
    title: '',
    documentNumber: '',
    revision: 'P01',
    discipline: 'general',
    purpose: 'construction',
    sourceReference: '',
    revisionReason: '',
  }
}

function emptyTransmittalDraft() {
  return {
    subject: '',
    purpose: 'for_information',
    dueAt: futureDateInput(7),
    recipients: '',
    documentIds: [],
    message: '',
  }
}

function emptyMeetingActionDraft() {
  return {
    key: `meeting-action-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    ownerName: '',
    dueAt: futureDateInput(7),
    priority: 'medium',
    description: '',
  }
}

function emptyProjectMeetingDraft() {
  return {
    title: '',
    meetingType: 'coordination',
    scheduledAt: toLocalDateTimeInput(new Date(Date.now() + 24 * 60 * 60 * 1000)),
    location: '',
    chair: '',
    attendees: '',
    agenda: '',
    minutesSummary: '',
    decisions: '',
    actions: [emptyMeetingActionDraft()],
  }
}

function emptyProjectControlReview() {
  return {
    type: '',
    record: null,
    status: '',
    notes: '',
    reference: '',
    receiptId: '',
    acknowledgedBy: '',
    actionId: '',
    completedBy: '',
    scheduledAt: '',
  }
}

function ProjectControls({
  job,
  locale = 'en-GB',
  canCoordinate,
  canApprove,
  submitting,
  onCreate,
  onTransition,
  onIssueTransmittal,
  onAcknowledgeTransmittal,
  onSubmitMeeting,
  onIssueMeeting,
  onCompleteMeetingAction,
  onCreateMeetingFollowUp,
  onOpenApprovals,
}) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const [view, setView] = useState('rfi')
  const [creating, setCreating] = useState(false)
  const [rfiDraft, setRfiDraft] = useState(emptyRfiDraft)
  const [submittalDraft, setSubmittalDraft] = useState(emptySubmittalDraft)
  const [documentDraft, setDocumentDraft] = useState(emptyControlledDocumentDraft)
  const [transmittalDraft, setTransmittalDraft] = useState(emptyTransmittalDraft)
  const [meetingDraft, setMeetingDraft] = useState(emptyProjectMeetingDraft)
  const [review, setReview] = useState(emptyProjectControlReview)
  const formatControlValue = (value) => t(PROJECT_CONTROL_VALUE_LABELS[value] || formatStatus(value))
  const rfis = job.rfis || EMPTY_LIST
  const submittals = job.submittals || EMPTY_LIST
  const submittalAttachmentOptions = (job.documents || EMPTY_LIST).filter((document) => {
    const checksum = document.data?.analysis?.upload?.sha256 || document.data?.sourceDocumentChecksum || document.data?.contentHash
    return document.jobId === job.id && document.mimeType === 'application/pdf' && document.storageRef
      && Number.isSafeInteger(document.sizeBytes) && document.sizeBytes > 0 && document.sizeBytes <= 8 * 1024 * 1024
      && /^[a-f0-9]{64}$/i.test(checksum || '')
      && !['cancelled', 'rejected', 'superseded', 'void'].includes(String(document.status || '').toLowerCase())
  })
  const documents = (job.documents || EMPTY_LIST).filter((document) => document.type === 'controlled_document')
  const drawings = job.drawings || EMPTY_LIST
  const currentDocumentOptions = [
    ...documents.filter((record) => record.status === 'approved' && record.data?.isCurrent === true),
    ...drawings.filter((record) => record.current === true),
  ]
  const transmittals = job.transmittals || EMPTY_LIST
  const meetings = job.projectMeetings || EMPTY_LIST
  const pendingApprovals = job.approvals?.filter((approval) => approval.status === 'pending') || EMPTY_LIST
  const records = view === 'rfi'
    ? rfis
    : view === 'submittal'
      ? submittals
      : view === 'document'
        ? documents
        : view === 'transmittal'
          ? transmittals
          : meetings
  const activeRfis = rfis.filter((record) => !['answered', 'resolved', 'closed', 'rejected'].includes(record.status)).length
  const activeSubmittals = submittals.filter((record) => !['approved', 'accepted', 'closed', 'rejected'].includes(record.status)).length
  const currentDocuments = documents.filter((record) => record.status === 'approved' && record.data?.isCurrent !== false).length
  const pendingTransmittalReceipts = transmittals.reduce(
    (count, record) => count + (record.receipts || EMPTY_LIST).filter((receipt) => receipt.status === 'awaiting_acknowledgment').length,
    0,
  )
  const openMeetingActions = meetings.reduce(
    (count, record) => count + (record.actions || EMPTY_LIST).filter((action) => action.status === 'open').length,
    0,
  )
  const pendingFor = (type, recordId) => {
    const targetType = type === 'rfi'
      ? 'rfi_record'
      : type === 'submittal'
        ? 'submittal_record'
        : type === 'document'
          ? 'document'
          : type === 'transmittal'
            ? 'document_transmittal'
            : 'project_meeting_minutes'
    return pendingApprovals.find((approval) => approval.targetType === targetType && approval.targetId === recordId)
  }

  function selectView(nextView) {
    setView(nextView)
    setCreating(false)
    setReview(emptyProjectControlReview())
  }

  function updateMeetingAction(key, patch) {
    setMeetingDraft((current) => ({
      ...current,
      actions: current.actions.map((action) => action.key === key ? { ...action, ...patch } : action),
    }))
  }

  function removeMeetingAction(key) {
    setMeetingDraft((current) => ({ ...current, actions: current.actions.filter((action) => action.key !== key) }))
  }

  async function submitCreate(event) {
    event.preventDefault()
    const draft = view === 'rfi'
      ? rfiDraft
      : view === 'submittal'
        ? submittalDraft
        : view === 'document'
          ? documentDraft
          : view === 'transmittal'
            ? transmittalDraft
            : meetingDraft
    const result = await onCreate(view, draft)
    if (!result) return
    if (view === 'rfi') setRfiDraft(emptyRfiDraft())
    else if (view === 'submittal') setSubmittalDraft(emptySubmittalDraft())
    else if (view === 'document') setDocumentDraft(emptyControlledDocumentDraft())
    else if (view === 'transmittal') setTransmittalDraft(emptyTransmittalDraft())
    else setMeetingDraft(emptyProjectMeetingDraft())
    setCreating(false)
  }

  async function submitReview(event) {
    event.preventDefault()
    if (!review.record) return
    const payload = { status: review.status, notes: review.notes.trim() }
    if (review.type === 'rfi') payload.response = review.notes.trim()
    if (review.type === 'document') payload.verificationReference = review.reference.trim()
    if (review.type === 'transmittal_issue') payload.deliveryReference = review.reference.trim()
    if (review.type === 'transmittal_ack') {
      payload.evidenceReference = review.reference.trim()
      payload.acknowledgedBy = review.acknowledgedBy.trim()
    }
    if (review.type === 'meeting_issue') payload.deliveryReference = review.reference.trim()
    if (review.type === 'meeting_action') {
      payload.evidenceReference = review.reference.trim()
      payload.completedBy = review.completedBy.trim()
    }
    if (review.type === 'meeting_followup') {
      payload.scheduledAt = toIsoDateTime(review.scheduledAt)
      payload.minutesSummary = review.notes.trim()
      payload.agenda = []
    }
    const result = review.type === 'transmittal_issue'
      ? await onIssueTransmittal(review.record, payload)
      : review.type === 'transmittal_ack'
        ? await onAcknowledgeTransmittal(review.record, review.receiptId, payload)
        : review.type === 'meeting_submit'
          ? await onSubmitMeeting(review.record, payload)
          : review.type === 'meeting_issue'
            ? await onIssueMeeting(review.record, payload)
            : review.type === 'meeting_action'
              ? await onCompleteMeetingAction(review.record, review.actionId, payload)
              : review.type === 'meeting_followup'
                ? await onCreateMeetingFollowUp(review.record, payload)
        : await onTransition(review.type, review.record, payload)
    if (result) setReview(emptyProjectControlReview())
  }

  function openReview(type, record, status, context = null) {
    setCreating(false)
    setReview({
      type,
      record,
      status,
      notes: type === 'submittal' && status === 'submitted'
        ? t('Package retained and ready for technical review.')
        : type === 'transmittal_issue'
          ? t('Delivery was performed outside Contractor.AI and the retained reference identifies the real issue evidence.')
          : type === 'transmittal_ack'
            ? t('Recipient acknowledgment evidence reviewed and retained.')
            : type === 'meeting_submit'
              ? t('Agenda, attendance, decisions, and assigned actions reviewed for approval.')
              : type === 'meeting_issue'
                ? t('Distribution was performed outside Contractor.AI and this reference identifies the retained delivery evidence.')
                : type === 'meeting_action'
                  ? t('Completion evidence reviewed against the assigned meeting action and linked task.')
                  : type === 'meeting_followup'
                    ? t('Review unresolved actions and retain the next coordination date.')
            : '',
      reference: '',
      receiptId: type === 'transmittal_ack' ? context?.id || '' : '',
      acknowledgedBy: type === 'transmittal_ack' ? context?.recipientName || '' : '',
      actionId: type === 'meeting_action' ? context?.id || '' : '',
      completedBy: type === 'meeting_action' ? context?.ownerName || '' : '',
      scheduledAt: type === 'meeting_followup' ? toLocalDateTimeInput(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)) : '',
    })
  }

  const reviewLabel = t(review.type === 'rfi'
    ? 'Request answer approval'
    : review.type === 'document'
      ? 'Request revision approval'
      : review.type === 'transmittal_issue'
        ? 'Record transmittal issue'
        : review.type === 'transmittal_ack'
          ? 'Record acknowledgment'
          : review.type === 'meeting_submit'
            ? 'Request minutes approval'
            : review.type === 'meeting_issue'
              ? 'Record minutes issue'
              : review.type === 'meeting_action'
                ? 'Complete action'
                : review.type === 'meeting_followup'
                  ? 'Create follow-up'
      : review.status === 'submitted'
        ? 'Mark submitted'
        : 'Request submittal approval')

  return (
    <section className="job-workspace-section project-controls" data-testid="project-controls">
      <div className="section-heading project-controls-heading">
        <ClipboardList size={18} />
        <div>
          <h3>{t('Project controls')}</h3>
          <p>{t('Control design questions, reviews, current revisions, distribution, meeting decisions, and assigned actions.')}</p>
        </div>
        {canCoordinate ? (
          <button
            type="button"
            className="secondary-button"
            disabled={submitting}
            aria-expanded={creating}
            onClick={() => {
              setReview(emptyProjectControlReview())
              setCreating((current) => !current)
            }}
          >
            <Plus size={15} />
            {t('New {record}', { record: t(view === 'rfi' ? 'RFI' : view === 'submittal' ? 'submittal' : view === 'document' ? 'revision' : view === 'transmittal' ? 'transmittal' : 'meeting') })}
          </button>
        ) : null}
      </div>
      <div className="project-control-metrics" aria-label={t('Project control status')}>
        <div><span>{t('Open RFIs')}</span><strong>{activeRfis}</strong></div>
        <div><span>{t('Submittal queue')}</span><strong>{activeSubmittals}</strong></div>
        <div><span>{t('Current revisions')}</span><strong>{currentDocuments}</strong></div>
        <div><span>{t('Receipt queue')}</span><strong>{pendingTransmittalReceipts}</strong></div>
        <div><span>{t('Open meeting actions')}</span><strong>{openMeetingActions}</strong></div>
      </div>
      <div className="segmented-control project-control-tabs" role="tablist" aria-label={t('Project control register')}>
        {[
          ['rfi', 'RFIs', rfis.length],
          ['submittal', 'Submittals', submittals.length],
          ['document', 'Documents', documents.length],
          ['transmittal', 'Transmittals', transmittals.length],
          ['meeting', 'Meetings', meetings.length],
        ].map(([key, label, count]) => (
          <button
            type="button"
            role="tab"
            aria-selected={view === key}
            className={view === key ? 'active' : ''}
            key={key}
            onClick={() => selectView(key)}
          >
            {t(label)}<span>{count}</span>
          </button>
        ))}
      </div>
      {creating && view === 'rfi' ? (
        <form className="project-control-form form-grid compact-form" data-testid="create-rfi-form" onSubmit={submitCreate}>
          <label className="form-span">{t('RFI subject')}<input required minLength="2" value={rfiDraft.title} onChange={(event) => setRfiDraft({ ...rfiDraft, title: event.target.value })} placeholder={t('Decision needed before work continues')} /></label>
          <label className="form-span">{t('Question')}<textarea required minLength="4" value={rfiDraft.question} onChange={(event) => setRfiDraft({ ...rfiDraft, question: event.target.value })} placeholder={t('State the condition, requested decision, and affected work.')} /></label>
          <label>{t('Responsible')}<input value={rfiDraft.responsible} onChange={(event) => setRfiDraft({ ...rfiDraft, responsible: event.target.value })} placeholder={t('Designer, client, or project lead')} /></label>
          <label>{t('Discipline')}<select value={rfiDraft.discipline} onChange={(event) => setRfiDraft({ ...rfiDraft, discipline: event.target.value })}><option value="general">{t('General')}</option><option value="architectural">{t('Architectural')}</option><option value="structural">{t('Structural')}</option><option value="mechanical">{t('Mechanical')}</option><option value="electrical">{t('Electrical')}</option><option value="civil">{t('Civil')}</option></select></label>
          <label>{t('Response due')}<input required type="date" value={rfiDraft.dueAt} onChange={(event) => setRfiDraft({ ...rfiDraft, dueAt: event.target.value })} /></label>
          <div className="form-actions form-span"><button className="primary-button" disabled={submitting}><Plus size={15} />{t('Retain RFI')}</button><button type="button" className="secondary-button" onClick={() => setCreating(false)}>{t('Cancel')}</button></div>
        </form>
      ) : null}
      {creating && view === 'submittal' ? (
        <form className="project-control-form form-grid compact-form" data-testid="create-submittal-form" onSubmit={submitCreate}>
          <label className="form-span">{t('Submittal title')}<input required minLength="2" value={submittalDraft.title} onChange={(event) => setSubmittalDraft({ ...submittalDraft, title: event.target.value })} placeholder={t('Product data, sample, or shop drawing package')} /></label>
          {(job.tasks || EMPTY_LIST).length ? <label className="form-span">{t('Linked work steps')} ({t('Optional; leave empty for job-wide use')})<select multiple value={submittalDraft.taskIds} onChange={(event) => setSubmittalDraft({ ...submittalDraft, taskIds: Array.from(event.target.selectedOptions, (option) => option.value) })}>{(job.tasks || EMPTY_LIST).map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label> : null}
          <label>{t('Package / spec section')}<input value={submittalDraft.packageName} onChange={(event) => setSubmittalDraft({ ...submittalDraft, packageName: event.target.value })} placeholder={t('09 91 00 / finishes')} /></label>
          <label>{t('Material')}<input value={submittalDraft.material} onChange={(event) => setSubmittalDraft({ ...submittalDraft, material: event.target.value })} placeholder={t('Retained material name')} /></label>
          <label>{t('Responsible')}<input value={submittalDraft.responsible} onChange={(event) => setSubmittalDraft({ ...submittalDraft, responsible: event.target.value })} placeholder={t('Supplier or project team')} /></label>
          <label>{t('Reviewer')}<input value={submittalDraft.reviewer} onChange={(event) => setSubmittalDraft({ ...submittalDraft, reviewer: event.target.value })} placeholder={t('Technical reviewer')} /></label>
          <label>{t('Decision due')}<input required type="date" value={submittalDraft.dueAt} onChange={(event) => setSubmittalDraft({ ...submittalDraft, dueAt: event.target.value })} /></label>
          <fieldset className="form-span document-selection">
            <legend>{t('Retained PDF attachments')}</legend>
            {submittalAttachmentOptions.length ? submittalAttachmentOptions.map((document) => (
              <label className="checkbox-label" key={document.id}>
                <input type="checkbox" checked={submittalDraft.attachmentDocumentIds.includes(document.id)}
                  onChange={(event) => setSubmittalDraft((current) => ({ ...current, attachmentDocumentIds: event.target.checked
                    ? [...current.attachmentDocumentIds, document.id]
                    : current.attachmentDocumentIds.filter((id) => id !== document.id) }))} />
                <span><strong>{document.title || document.filename}</strong><small>{document.filename} · {(document.sizeBytes / 1024 / 1024).toFixed(1)} MB</small></span>
              </label>
            )) : <p>{t('No verified same-job PDF documents are available. Upload and retain a PDF before attaching it to this submittal.')}</p>}
          </fieldset>
          <div className="form-actions form-span"><button className="primary-button" disabled={submitting}><Plus size={15} />{t('Retain submittal')}</button><button type="button" className="secondary-button" onClick={() => setCreating(false)}>{t('Cancel')}</button></div>
        </form>
      ) : null}
      {creating && view === 'document' ? (
        <form className="project-control-form form-grid compact-form" data-testid="create-controlled-document-form" onSubmit={submitCreate}>
          <label className="form-span">{t('Document title')}<input required minLength="2" value={documentDraft.title} onChange={(event) => setDocumentDraft({ ...documentDraft, title: event.target.value })} placeholder={t('Construction floor plan')} /></label>
          <label>{t('Document number')}<input required minLength="2" value={documentDraft.documentNumber} onChange={(event) => setDocumentDraft({ ...documentDraft, documentNumber: event.target.value })} placeholder="A-101" /></label>
          <label>{t('Revision')}<input required value={documentDraft.revision} onChange={(event) => setDocumentDraft({ ...documentDraft, revision: event.target.value })} placeholder="P01" /></label>
          <label>{t('Discipline')}<select value={documentDraft.discipline} onChange={(event) => setDocumentDraft({ ...documentDraft, discipline: event.target.value })}><option value="general">{t('General')}</option><option value="architectural">{t('Architectural')}</option><option value="structural">{t('Structural')}</option><option value="mechanical">{t('Mechanical')}</option><option value="electrical">{t('Electrical')}</option><option value="civil">{t('Civil')}</option></select></label>
          <label>{t('Purpose')}<select value={documentDraft.purpose} onChange={(event) => setDocumentDraft({ ...documentDraft, purpose: event.target.value })}><option value="construction">{t('For construction')}</option><option value="review">{t('For review')}</option><option value="coordination">{t('For coordination')}</option><option value="record">{t('Record / as-built')}</option></select></label>
          <label className="form-span">{t('Retained file or source reference')}<input required minLength="3" value={documentDraft.sourceReference} onChange={(event) => setDocumentDraft({ ...documentDraft, sourceReference: event.target.value })} placeholder={t('Private storage object, evidence ID, or controlled source reference')} /></label>
          <label className="form-span">{t('Revision reason')}<input value={documentDraft.revisionReason} onChange={(event) => setDocumentDraft({ ...documentDraft, revisionReason: event.target.value })} placeholder={t('Required when this document number already has a revision')} /></label>
          <div className="form-actions form-span"><button className="primary-button" disabled={submitting}><Plus size={15} />{t('Retain revision')}</button><button type="button" className="secondary-button" onClick={() => setCreating(false)}>{t('Cancel')}</button></div>
        </form>
      ) : null}
      {creating && view === 'transmittal' ? (
        <form className="project-control-form form-grid compact-form" data-testid="create-transmittal-form" onSubmit={submitCreate}>
          <label className="form-span">{t('Transmittal subject')}<input required minLength="3" value={transmittalDraft.subject} onChange={(event) => setTransmittalDraft({ ...transmittalDraft, subject: event.target.value })} placeholder={t('Construction issue package')} /></label>
          <label>{t('Purpose')}<select value={transmittalDraft.purpose} onChange={(event) => setTransmittalDraft({ ...transmittalDraft, purpose: event.target.value })}><option value="for_information">{t('For information')}</option><option value="for_review">{t('For review')}</option><option value="for_approval">{t('For approval')}</option><option value="for_construction">{t('For construction')}</option><option value="as_built">{t('As built')}</option></select></label>
          <label>{t('Acknowledgment due')}<input required type="date" value={transmittalDraft.dueAt} onChange={(event) => setTransmittalDraft({ ...transmittalDraft, dueAt: event.target.value })} /></label>
          <label className="form-span">{t('Recipients')}<textarea required minLength="5" value={transmittalDraft.recipients} onChange={(event) => setTransmittalDraft({ ...transmittalDraft, recipients: event.target.value })} placeholder={t('One recipient per line: Name <name@example.eu>')} /></label>
          <fieldset className="form-span document-selection">
            <legend>{t('Current documents and drawings')}</legend>
            {currentDocumentOptions.length ? currentDocumentOptions.map((document) => (
              <label className="checkbox-label" key={document.id}>
                <input
                  type="checkbox"
                  checked={transmittalDraft.documentIds.includes(document.id)}
                  onChange={(event) => setTransmittalDraft({
                    ...transmittalDraft,
                    documentIds: event.target.checked
                      ? [...transmittalDraft.documentIds, document.id]
                      : transmittalDraft.documentIds.filter((id) => id !== document.id),
                  })}
                />
                <span><strong>{t('{number} / rev {revision}', { number: document.documentNumber, revision: document.revision })}</strong><small>{document.title}</small></span>
              </label>
            )) : <p className="workflow-note">{t('Approve a controlled document or drawing revision before preparing a transmittal.')}</p>}
          </fieldset>
          <label className="form-span">{t('Message')}<textarea value={transmittalDraft.message} onChange={(event) => setTransmittalDraft({ ...transmittalDraft, message: event.target.value })} placeholder={t('Purpose, requested action, and response instructions')} /></label>
          <div className="form-actions form-span"><button className="primary-button" disabled={submitting || !currentDocumentOptions.length || !transmittalDraft.documentIds.length}><Send size={15} />{t('Prepare transmittal')}</button><button type="button" className="secondary-button" onClick={() => setCreating(false)}>{t('Cancel')}</button></div>
        </form>
      ) : null}
      {creating && view === 'meeting' ? (
        <form className="project-control-form meeting-form form-grid compact-form" data-testid="create-project-meeting-form" onSubmit={submitCreate}>
          <label className="form-span">{t('Meeting title')}<input required minLength="3" value={meetingDraft.title} onChange={(event) => setMeetingDraft({ ...meetingDraft, title: event.target.value })} placeholder={t('Weekly project coordination')} /></label>
          <label>{t('Meeting type')}<select value={meetingDraft.meetingType} onChange={(event) => setMeetingDraft({ ...meetingDraft, meetingType: event.target.value })}><option value="coordination">{t('Coordination')}</option><option value="progress">{t('Progress')}</option><option value="design">{t('Design')}</option><option value="client">{t('Client')}</option><option value="commercial">{t('Commercial')}</option><option value="closeout">{t('Closeout')}</option><option value="kickoff">{t('Kickoff')}</option></select></label>
          <label>{t('Scheduled date and time')}<input required type="datetime-local" value={meetingDraft.scheduledAt} onChange={(event) => setMeetingDraft({ ...meetingDraft, scheduledAt: event.target.value })} /></label>
          <label>{t('Chair')}<input value={meetingDraft.chair} onChange={(event) => setMeetingDraft({ ...meetingDraft, chair: event.target.value })} placeholder={t('Project manager')} /></label>
          <label>{t('Location')}<input value={meetingDraft.location} onChange={(event) => setMeetingDraft({ ...meetingDraft, location: event.target.value })} placeholder={t('Site office or retained meeting link')} /></label>
          <label className="form-span">{t('Attendees')}<textarea required minLength="2" value={meetingDraft.attendees} onChange={(event) => setMeetingDraft({ ...meetingDraft, attendees: event.target.value })} placeholder={t('One per line: Name or Name <name@example.eu>')} /></label>
          <label className="form-span">{t('Agenda')}<textarea required minLength="3" value={meetingDraft.agenda} onChange={(event) => setMeetingDraft({ ...meetingDraft, agenda: event.target.value })} placeholder={t('One agenda item per line')} /></label>
          <label className="form-span">{t('Minutes summary')}<textarea required minLength="4" value={meetingDraft.minutesSummary} onChange={(event) => setMeetingDraft({ ...meetingDraft, minutesSummary: event.target.value })} placeholder={t('Record progress, constraints, information reviewed, and the agreed path forward.')} /></label>
          <label className="form-span">{t('Decisions')}<textarea value={meetingDraft.decisions} onChange={(event) => setMeetingDraft({ ...meetingDraft, decisions: event.target.value })} placeholder={t('One retained decision per line')} /></label>
          <fieldset className="form-span meeting-action-editor">
            <legend>{t('Assigned action items')}</legend>
            {meetingDraft.actions.map((action, index) => (
              <div className="meeting-action-draft" key={action.key} data-testid={`meeting-action-draft-${index + 1}`}>
                <label>{t('Action')}<input required minLength="3" value={action.title} onChange={(event) => updateMeetingAction(action.key, { title: event.target.value })} placeholder={t('Confirm delivery window')} /></label>
                <label>{t('Owner')}<input required minLength="2" value={action.ownerName} onChange={(event) => updateMeetingAction(action.key, { ownerName: event.target.value })} placeholder={t('Named responsible person')} /></label>
                <label>{t('Due date')}<input type="date" value={action.dueAt} onChange={(event) => updateMeetingAction(action.key, { dueAt: event.target.value })} /></label>
                <label>{t('Priority')}<select value={action.priority} onChange={(event) => updateMeetingAction(action.key, { priority: event.target.value })}><option value="low">{t('Low')}</option><option value="medium">{t('Medium')}</option><option value="high">{t('High')}</option><option value="critical">{t('Critical')}</option></select></label>
                <label className="meeting-action-description">{t('Details')}<input value={action.description} onChange={(event) => updateMeetingAction(action.key, { description: event.target.value })} placeholder={t('Completion condition or retained context')} /></label>
                <button type="button" className="icon-button" aria-label={t('Remove action {number}', { number: index + 1 })} onClick={() => removeMeetingAction(action.key)}><X size={15} /></button>
              </div>
            ))}
            <button type="button" className="secondary-button meeting-action-add" onClick={() => setMeetingDraft((current) => ({ ...current, actions: [...current.actions, emptyMeetingActionDraft()] }))}><Plus size={15} />{t('Add action')}</button>
          </fieldset>
          <div className="form-actions form-span"><button className="primary-button" disabled={submitting}><ClipboardCheck size={15} />{t('Retain draft minutes')}</button><button type="button" className="secondary-button" onClick={() => setCreating(false)}>{t('Cancel')}</button></div>
        </form>
      ) : null}
      <div className="project-control-register" role="tabpanel">
        {records.length ? records.map((record) => {
          const pending = pendingFor(view, record.id)
          const recordTitle = view === 'transmittal' ? record.subject : record.title
          const isRfiOpen = view === 'rfi' && !['answered', 'resolved', 'closed', 'rejected', 'pending_approval'].includes(record.status)
          const isSubmittalDraft = view === 'submittal' && record.status === 'draft'
          const isSubmittalReview = view === 'submittal' && ['submitted', 'pending_review', 'revise_resubmit'].includes(record.status)
          const isDocumentReview = view === 'document' && ['draft', 'stored', 'needs_review', 'needs_update', 'expired'].includes(record.status)
          const canRecordTransmittalIssue = view === 'transmittal' && record.status === 'approved'
          const openReceipts = view === 'transmittal'
            ? (record.receipts || EMPTY_LIST).filter((receipt) => receipt.status === 'awaiting_acknowledgment')
            : EMPTY_LIST
          const meetingActions = view === 'meeting' ? record.actions || EMPTY_LIST : EMPTY_LIST
          const openMeetingItems = meetingActions.filter((action) => action.status === 'open')
          const canSubmitMeeting = view === 'meeting' && record.status === 'draft'
          const canIssueMeeting = view === 'meeting' && record.status === 'approved'
          const canFollowUpMeeting = view === 'meeting' && ['approved', 'issued'].includes(record.status) && openMeetingItems.length > 0
          return (
            <article className="project-control-row" key={record.id} data-testid={`project-control-${view}-${record.id}`}>
              <div className="project-control-copy">
                <div><strong>{recordTitle}</strong><span className={`status status-${record.status}`}>{formatStatus(record.status)}</span>{view === 'document' && record.status === 'approved' && record.data?.isCurrent !== false ? <span className="tag tag-green">{t('Current')}</span> : null}</div>
                <small>{view === 'rfi'
                  ? t('{discipline} / due {date}', { discipline: formatControlValue(record.data?.discipline || 'general'), date: formatDate(record.dueAt) })
                  : view === 'submittal'
                    ? t('{package} / due {date}', { package: record.packageName || record.data?.material || t('Package'), date: formatDate(record.dueAt) })
                    : view === 'document'
                      ? t('{number} / rev {revision} / {discipline}', { number: record.documentNumber || t('Unnumbered'), revision: record.revision || '-', discipline: formatControlValue(record.discipline || 'general') })
                      : view === 'transmittal'
                        ? t('{number} / {purpose} / {revisions} / {recipients}', {
                          number: record.transmittalNumber,
                          purpose: formatControlValue(record.purpose),
                          revisions: t((record.documents?.length || 0) === 1 ? '{count} revision' : '{count} revisions', { count: record.documents?.length || 0 }),
                          recipients: t((record.recipients?.length || 0) === 1 ? '{count} recipient' : '{count} recipients', { count: record.recipients?.length || 0 }),
                        })
                        : t('{number} / {type} / {date} / {attendees}', {
                          number: record.meetingNumber,
                          type: formatControlValue(record.meetingType),
                          date: formatDateTime(record.scheduledAt),
                          attendees: t((record.attendees?.length || 0) === 1 ? '{count} attendee' : '{count} attendees', { count: record.attendees?.length || 0 }),
                        })}</small>
                {view === 'submittal' ? <p>{record.data?.taskIds?.length
                  ? t('Linked to: {tasks}', { tasks: record.data.taskIds.map((taskId) => (job.tasks || EMPTY_LIST).find((task) => task.id === taskId)?.title).filter(Boolean).join(', ') || t('Unavailable task') })
                  : t('Applies to the entire job')}</p> : null}
                {view === 'rfi' ? <p>{record.response || record.question || t('Question details not retained.')}</p> : null}
                {view === 'document' ? <p>{record.data?.revisionReason || record.data?.sourceReference || t('Controlled source retained.')}</p> : null}
                {view === 'transmittal' ? <p>{record.issuedAt
                  ? t('Issued {date} / {receipts}', {
                    date: formatDateTime(record.issuedAt),
                    receipts: t(openReceipts.length === 1 ? '{count} receipt open' : '{count} receipts open', { count: openReceipts.length }),
                  })
                  : t('Approval and recorded delivery evidence are required before issue / due {date}', { date: formatDate(record.dueAt) })}</p> : null}
                {view === 'meeting' ? <p>{record.minutesSummary || t('Draft minutes have no retained summary.')}</p> : null}
                {view === 'meeting' && meetingActions.length ? (
                  <div className="meeting-action-register" aria-label={t('{number} action items', { number: record.meetingNumber })}>
                    {meetingActions.map((action) => (
                      <span key={action.id} className={`meeting-action-chip meeting-action-${action.status}`}>
                        <strong>{action.itemNumber}. {action.title}</strong>
                        <small>{t('{owner} / due {date} / {status}', { owner: action.ownerName, date: formatDate(action.dueAt), status: formatStatus(action.status) })}</small>
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="project-control-actions">
                {pending && canApprove ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => onOpenApprovals({ approvalId: pending.id })}><ShieldCheck size={14} />{t('Review decision')}</button> : null}
                {canCoordinate && !pending && isRfiOpen ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => openReview('rfi', record, 'answered')}><MessageSquareText size={14} />{t('Answer')}</button> : null}
                {canCoordinate && !pending && isSubmittalDraft ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => openReview('submittal', record, 'submitted')}><FileUp size={14} />{t('Submit')}</button> : null}
                {canCoordinate && !pending && isSubmittalReview ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => openReview('submittal', record, 'approved')}><ShieldCheck size={14} />{t('Request approval')}</button> : null}
                {canCoordinate && !pending && isDocumentReview ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => openReview('document', record, 'approved')}><ShieldCheck size={14} />{t('Review revision')}</button> : null}
                {canCoordinate && !pending && canRecordTransmittalIssue ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => openReview('transmittal_issue', record, 'issued')}><Send size={14} />{t('Record issue')}</button> : null}
                {canCoordinate && openReceipts.length ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => openReview('transmittal_ack', record, 'acknowledged', openReceipts[0])}><MailCheck size={14} />{t('Record receipt')}</button> : null}
                {canCoordinate && !pending && canSubmitMeeting ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => openReview('meeting_submit', record, 'pending_approval')}><ShieldCheck size={14} />{t('Submit minutes')}</button> : null}
                {canCoordinate && !pending && canIssueMeeting ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => openReview('meeting_issue', record, 'issued')}><Send size={14} />{t('Record issue')}</button> : null}
                {canCoordinate && openMeetingItems.length ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => openReview('meeting_action', record, 'completed', openMeetingItems[0])}><Check size={14} />{t('Complete action')}</button> : null}
                {canCoordinate && canFollowUpMeeting ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => openReview('meeting_followup', record, 'draft')}><CalendarDays size={14} />{t('Follow-up')}</button> : null}
              </div>
            </article>
          )
        }) : <p className="workflow-note">{t('No {records} have been retained for this job.', { records: t(view === 'rfi' ? 'RFIs' : view === 'submittal' ? 'submittals' : view === 'document' ? 'controlled document revisions' : view === 'transmittal' ? 'document transmittals' : 'project meeting minutes') })}</p>}
      </div>
      {review.record ? (
        <form className="project-control-review" data-testid="project-control-review-form" onSubmit={submitReview}>
          <div><strong>{reviewLabel}</strong><small>{t('{record} / target {status}', { record: review.record.title || review.record.subject, status: formatStatus(review.status) })}</small></div>
          {review.type === 'transmittal_ack' ? (
            <label>{t('Recipient receipt')}<select value={review.receiptId} onChange={(event) => {
              const receipt = (review.record.receipts || EMPTY_LIST).find((item) => item.id === event.target.value)
              setReview({ ...review, receiptId: event.target.value, acknowledgedBy: receipt?.recipientName || review.acknowledgedBy })
            }}>{(review.record.receipts || EMPTY_LIST).filter((receipt) => receipt.status === 'awaiting_acknowledgment').map((receipt) => <option value={receipt.id} key={receipt.id}>{receipt.recipientName} / {receipt.recipientEmail}</option>)}</select></label>
          ) : null}
          {review.type === 'meeting_action' ? (
            <label>{t('Open action')}<select value={review.actionId} onChange={(event) => {
              const action = (review.record.actions || EMPTY_LIST).find((item) => item.id === event.target.value)
              setReview({ ...review, actionId: event.target.value, completedBy: action?.ownerName || review.completedBy })
            }}>{(review.record.actions || EMPTY_LIST).filter((action) => action.status === 'open').map((action) => <option value={action.id} key={action.id}>{action.itemNumber}. {action.title} / {action.ownerName}</option>)}</select></label>
          ) : null}
          {review.type === 'meeting_followup' ? <label>{t('Follow-up date and time')}<input required type="datetime-local" value={review.scheduledAt} onChange={(event) => setReview({ ...review, scheduledAt: event.target.value })} /></label> : null}
          {['document', 'transmittal_issue', 'transmittal_ack', 'meeting_issue', 'meeting_action'].includes(review.type) ? <label>{t(review.type === 'document' ? 'Review reference' : review.type === 'transmittal_issue' || review.type === 'meeting_issue' ? 'Delivery evidence reference' : review.type === 'meeting_action' ? 'Completion evidence reference' : 'Acknowledgment evidence reference')}<input required minLength="3" value={review.reference} onChange={(event) => setReview({ ...review, reference: event.target.value })} placeholder={t(review.type === 'document' ? 'Checker record or retained review evidence' : 'Provider receipt, email evidence, signed record, or retained document ID')} /></label> : null}
          {review.type === 'transmittal_ack' ? <label>{t('Acknowledged by')}<input required minLength="2" value={review.acknowledgedBy} onChange={(event) => setReview({ ...review, acknowledgedBy: event.target.value })} placeholder={t('Recipient shown on the evidence')} /></label> : null}
          {review.type === 'meeting_action' ? <label>{t('Completed by')}<input required minLength="2" value={review.completedBy} onChange={(event) => setReview({ ...review, completedBy: event.target.value })} placeholder={t('Person verified on the completion evidence')} /></label> : null}
          <label>{t(review.type === 'rfi' ? 'Response and evidence' : review.type === 'meeting_followup' ? 'Follow-up minutes summary' : review.type.startsWith('transmittal_') || review.type.startsWith('meeting_') ? 'Evidence notes' : 'Review evidence')}<textarea required minLength="4" value={review.notes} onChange={(event) => setReview({ ...review, notes: event.target.value })} placeholder={t('Record the technical basis and evidence for this status change.')} /></label>
          <div className="form-actions"><button className="primary-button" disabled={submitting || review.notes.trim().length < 4 || (['document', 'transmittal_issue', 'transmittal_ack', 'meeting_issue', 'meeting_action'].includes(review.type) && review.reference.trim().length < 3) || (review.type === 'transmittal_ack' && (!review.receiptId || review.acknowledgedBy.trim().length < 2)) || (review.type === 'meeting_action' && (!review.actionId || review.completedBy.trim().length < 2)) || (review.type === 'meeting_followup' && !toIsoDateTime(review.scheduledAt))}><ShieldCheck size={15} />{reviewLabel}</button><button type="button" className="secondary-button" onClick={() => setReview(emptyProjectControlReview())}>{t('Cancel')}</button></div>
        </form>
      ) : null}
      {!canCoordinate ? <p className="workflow-note">{t('Field access is read-only for project controls. Design responses and revision status remain office-controlled.')}</p> : null}
    </section>
  )
}



export default ProjectControls

export { ProjectControls }
