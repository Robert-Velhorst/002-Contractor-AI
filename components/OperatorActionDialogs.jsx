import { X, Archive, RefreshCw, ShieldCheck, LockKeyhole, TriangleAlert, CalendarOff, Ban, ArrowUpRight, PackageCheck, ClipboardCheck, Wrench, BadgeCheck, Ruler, GitBranch, ClipboardList, Plus, MailCheck, Check, ReceiptEuro, Undo2, Users } from "lucide-react"
import { formatStatus, EMPTY_LIST, maxWeeklyAvailabilityDate, formatDate, formatDateTime, toLocalDateTimeInput, currency, futureDateInput, roundDisplay } from "../dashboard-format"
import ConversationEvidenceReview from "./ConversationEvidenceReview"

export function JobLifecycleModalDialog({ closeJobLifecycle, jobLifecycleAction, jobLifecycleReason, setJobLifecycleReason, submitJobLifecycle, submitting }) {
  return (
<div className="modal-backdrop job-lifecycle-backdrop" role="presentation">
          <section
            className="modal job-lifecycle-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-lifecycle-title"
            data-testid="job-lifecycle-modal"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Approval-gated lifecycle</p>
                <h2 id="job-lifecycle-title">{jobLifecycleAction.mode === 'archive' ? 'Request job archive' : 'Request job restore'}</h2>
                <p>
                  {jobLifecycleAction.job.title} · {jobLifecycleAction.job.clientName || 'Client record'}
                </p>
              </div>
              <button className="icon-button" aria-label="Close job lifecycle request" onClick={closeJobLifecycle}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitJobLifecycle}>
              <div className="job-lifecycle-body">
                <div className="job-lifecycle-effect">
                  <Archive size={20} />
                  <div>
                    <strong>
                      {jobLifecycleAction.mode === 'archive'
                        ? 'Remove from active operations'
                        : `Return to ${formatStatus(jobLifecycleAction.job.data?.archive?.previousStatus || 'retained state')}`}
                    </strong>
                    <p>
                      {jobLifecycleAction.mode === 'archive'
                        ? 'Schedules, queues, conflicts, automation, and rollups stop including this job only after approval.'
                        : 'Applicable internal queues include the job again only after approval and current operating checks still apply.'}
                    </p>
                  </div>
                </div>
                <ul className="job-lifecycle-safeguards">
                  <li>The complete job ledger, evidence, finance, field, client, resource, and audit history remains retained.</li>
                  <li>No message, cancellation, supplier order, payment, safety clearance, or schedule commitment is triggered.</li>
                  {jobLifecycleAction.mode === 'archive' ? (
                    <li>Approval makes the job read-only and revokes active client portal links. Restore never reactivates those links.</li>
                  ) : null}
                  <li>
                    {jobLifecycleAction.mode === 'archive'
                      ? 'Returning the job later requires a separate restore approval.'
                      : 'The archive and restore decisions remain visible in the audit history.'}
                  </li>
                </ul>
                <label>
                  Operational reason
                  <textarea
                    required
                    minLength="8"
                    value={jobLifecycleReason}
                    onChange={(event) => setJobLifecycleReason(event.target.value)}
                    placeholder={
                      jobLifecycleAction.mode === 'archive'
                        ? 'Explain why this job should leave active operations.'
                        : 'Explain why this retained job should return to operations.'
                    }
                  />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeJobLifecycle}>
                  Cancel
                </button>
                <button
                  className={jobLifecycleAction.mode === 'archive' ? 'danger-button' : 'primary-button'}
                  disabled={submitting || jobLifecycleReason.trim().length < 8}
                >
                  {jobLifecycleAction.mode === 'archive' ? <Archive size={16} /> : <RefreshCw size={16} />}
                  {submitting
                    ? 'Submitting...'
                    : jobLifecycleAction.mode === 'archive'
                      ? 'Request archive approval'
                      : 'Request restore approval'}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function WorkerEditorDialog({ closeWorkerEditor, ot, saveWorker, setWorkerDraft, submitting, workerDraft }) {
  return (
<div className="modal-backdrop worker-backdrop" role="presentation">
          <section
            className="modal worker-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="worker-editor-title"
            data-testid="worker-editor"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeWorkerEditor()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Retained crew record')}</p>
                <h2 id="worker-editor-title">{workerDraft.id ? ot('Edit {name}', { name: workerDraft.name || ot('crew member') }) : ot('Add crew member')}</h2>
                <p>{ot('Identity, availability, skills, and internal cost evidence for resource planning.')}</p>
              </div>
              <button className="icon-button" aria-label={ot('Close crew member editor')} onClick={closeWorkerEditor}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveWorker}>
              <div className="form-grid worker-form">
                <label className="form-span">
                  {ot('Full name')}
                  <input
                    autoFocus
                    required
                    minLength="2"
                    value={workerDraft.name}
                    onChange={(event) => setWorkerDraft({ ...workerDraft, name: event.target.value })}
                  />
                </label>
                <label>
                  {ot('Role or trade')}
                  <input
                    value={workerDraft.role}
                    onChange={(event) => setWorkerDraft({ ...workerDraft, role: event.target.value })}
                    placeholder={ot('Carpenter, site lead, electrician')}
                  />
                </label>
                <label>
                  {ot('Availability status')}
                  <select value={workerDraft.status} onChange={(event) => setWorkerDraft({ ...workerDraft, status: event.target.value })}>
                    <option value="available">{ot('Available')}</option>
                    <option value="busy">{ot('Busy')}</option>
                    <option value="traveling">{ot('Traveling')}</option>
                    <option value="offline">{ot('Offline')}</option>
                    <option value="on_leave">{ot('On leave')}</option>
                    <option value="on_hold">{ot('On hold')}</option>
                    <option value="inactive">{ot('Inactive')}</option>
                  </select>
                </label>
                <label>
                  {ot('Email')}
                  <input
                    type="email"
                    value={workerDraft.email}
                    onChange={(event) => setWorkerDraft({ ...workerDraft, email: event.target.value })}
                  />
                </label>
                <label>
                  {ot('Phone')}
                  <input value={workerDraft.phone} onChange={(event) => setWorkerDraft({ ...workerDraft, phone: event.target.value })} />
                </label>
                <label>
                  {ot('Home region')}
                  <input
                    value={workerDraft.homeRegion}
                    onChange={(event) => setWorkerDraft({ ...workerDraft, homeRegion: event.target.value })}
                    placeholder="Utrecht, Randstad, Noord-Brabant"
                  />
                </label>
                <label>
                  {ot('Hourly cost rate (EUR)')}
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={workerDraft.hourlyRate}
                    onChange={(event) => setWorkerDraft({ ...workerDraft, hourlyRate: event.target.value })}
                  />
                </label>
                <label className="form-span">
                  {ot('Skills')}
                  <input
                    value={workerDraft.skills}
                    onChange={(event) => setWorkerDraft({ ...workerDraft, skills: event.target.value })}
                    placeholder={ot('Carpentry, renovation, electrical installation')}
                  />
                </label>
                <label className="form-span">
                  {ot('Internal notes')}
                  <textarea
                    value={workerDraft.notes}
                    onChange={(event) => setWorkerDraft({ ...workerDraft, notes: event.target.value })}
                    placeholder={ot('Record restrictions or resource planning context. Use Qualifications for certificate evidence.')}
                  />
                </label>
                <p className="workflow-note form-span">
                  {ot('Saving this record does not contact the crew member, submit payroll, clear site access, or commit a schedule.')}
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeWorkerEditor}>
                  {ot('Cancel')}
                </button>
                <button
                  className="primary-button"
                  disabled={
                    submitting ||
                    workerDraft.name.trim().length < 2 ||
                    (workerDraft.hourlyRate !== '' && Number(workerDraft.hourlyRate) < 0)
                  }
                >
                  <ShieldCheck size={16} />
                  {submitting ? ot('Saving...') : ot('Save retained crew member')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function WorkerRetirementModalDialog({ closeWorkerRetirement, ot, requestWorkerRetirement, setWorkerRetirementReason, submitting, workerRetirement, workerRetirementReason }) {
  return (
<div className="modal-backdrop worker-backdrop" role="presentation">
          <section
            className="modal worker-retirement-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="worker-retirement-title"
            data-testid="worker-retirement-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeWorkerRetirement()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Approval-gated lifecycle')}</p>
                <h2 id="worker-retirement-title">{ot('Request crew retirement')}</h2>
                <p>
                  {workerRetirement.name} / {workerRetirement.role || ot('Role not retained')}
                </p>
              </div>
              <button className="icon-button" aria-label={ot('Close crew retirement request')} onClick={closeWorkerRetirement}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={requestWorkerRetirement}>
              <div className="job-lifecycle-body">
                <div className="job-lifecycle-effect">
                  <Archive size={20} />
                  <div>
                    <strong>{ot('Block this crew member from new assignments')}</strong>
                    <p>
                      {ot('The retained status changes to retired only after approval and after all operational assignments have been released or reassigned.')}
                    </p>
                  </div>
                </div>
                <ul className="job-lifecycle-safeguards">
                  <li>{ot('The complete crew, assignment, time, approval, and audit history remains retained.')}</li>
                  <li>{ot('New assignments are blocked as soon as this request enters the approval queue.')}</li>
                  <li>
                    {workerRetirement.activeAssignmentCount > 0
                      ? ot('Approval cannot complete while {count} operational assignment(s) remain.', { count: workerRetirement.activeAssignmentCount })
                      : ot('No operational assignments currently block this retirement.')}
                  </li>
                  {workerRetirement.dormantAssignmentCount > 0 ? (
                    <li>
                      {ot(
                        workerRetirement.dormantAssignmentCount === 1
                          ? 'Approval will release {count} dormant assignment retained on inactive jobs, so any later job restore requires reassignment.'
                          : 'Approval will release {count} dormant assignments retained on inactive jobs, so any later job restore requires reassignment.',
                        { count: workerRetirement.dormantAssignmentCount },
                      )}
                    </li>
                  ) : null}
                  <li>{ot('No crew member, client, payroll provider, or site contact is notified.')}</li>
                </ul>
                <label>
                  Operational reason
                  <textarea
                    autoFocus
                    required
                    minLength="8"
                    value={workerRetirementReason}
                    onChange={(event) => setWorkerRetirementReason(event.target.value)}
                    placeholder={ot('Explain why this person should no longer be selected for new work.')}
                  />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeWorkerRetirement}>
                  Cancel
                </button>
                <button className="danger-button" disabled={submitting || workerRetirementReason.trim().length < 8}>
                  <Archive size={16} />
                  {submitting ? 'Submitting...' : 'Request retirement approval'}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function CredentialEditorDialog({ closeCredentialEditor, credentialDraft, credentialEditor, data, ot, setCredentialDraft, submitWorkerCredential, submitting }) {
  return (
<div className="modal-backdrop worker-backdrop" role="presentation">
          <section
            className="modal qualification-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="credential-editor-title"
            data-testid="credential-editor"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeCredentialEditor()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Approval-backed qualification evidence')}</p>
                <h2 id="credential-editor-title">{ot('Add credential for {name}', { name: credentialEditor.name })}</h2>
                <p>{ot('Retain the source identity and validity dates. Approval verifies this revision before readiness can rely on it.')}</p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close credential editor')} onClick={closeCredentialEditor}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitWorkerCredential}>
              <div className="form-grid qualification-form">
                <label>
                  {ot('Credential type')}
                  <select autoFocus value={credentialDraft.credentialType} onChange={(event) => setCredentialDraft({ ...credentialDraft, credentialType: event.target.value })}>
                    {(data.qualificationRegister?.catalog?.credentials || EMPTY_LIST).map((item) => <option key={item.key} value={item.key}>{ot(item.label)}</option>)}
                  </select>
                </label>
                <label>
                  {ot('Retained title')}
                  <input value={credentialDraft.title} onChange={(event) => setCredentialDraft({ ...credentialDraft, title: event.target.value })} placeholder={ot('Uses the credential type when blank')} />
                </label>
                <label>
                  {ot('Issuer')}
                  <input value={credentialDraft.issuer} onChange={(event) => setCredentialDraft({ ...credentialDraft, issuer: event.target.value })} placeholder={ot('Training or examination authority')} />
                </label>
                <label>
                  {ot('Credential number')}
                  <input value={credentialDraft.credentialNumber} onChange={(event) => setCredentialDraft({ ...credentialDraft, credentialNumber: event.target.value })} />
                </label>
                <label>
                  {ot('Issued on')}
                  <input type="date" max={new Date().toISOString().slice(0, 10)} value={credentialDraft.issuedOn} onChange={(event) => setCredentialDraft({ ...credentialDraft, issuedOn: event.target.value })} />
                </label>
                <label>
                  {ot('Expires on')}
                  <input type="date" min={credentialDraft.issuedOn || undefined} value={credentialDraft.expiresOn} onChange={(event) => setCredentialDraft({ ...credentialDraft, expiresOn: event.target.value })} />
                </label>
                <label className="form-span">
                  {ot('Evidence reference')}
                  <textarea required minLength="4" maxLength="500" value={credentialDraft.evidenceReference} onChange={(event) => setCredentialDraft({ ...credentialDraft, evidenceReference: event.target.value })} placeholder={ot('Certificate file, provider register reference, or retained verification source')} />
                </label>
                <p className="workflow-note form-span">{ot('Submitting creates an immutable pending revision. Contractor.AI does not issue, renew, or contact a certificate authority.')}</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeCredentialEditor}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || credentialDraft.evidenceReference.trim().length < 4}>
                  <ShieldCheck size={16} />
                  {submitting ? ot('Submitting...') : ot('Request evidence verification')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function QualificationRequirementEditorDialog({ closeQualificationRequirementEditor, data, jobs, ot, qualificationRequirementDraft, setQualificationRequirementDraft, submitQualificationRequirement, submitting }) {
  return (
<div className="modal-backdrop worker-backdrop" role="presentation">
          <section
            className="modal qualification-requirement-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qualification-requirement-title"
            data-testid="qualification-requirement-editor"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeQualificationRequirementEditor()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Job readiness control')}</p>
                <h2 id="qualification-requirement-title">{ot('Add qualification requirement')}</h2>
                <p>{ot('This immediately adds a retained readiness gate for matching assigned roles.')}</p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close qualification requirement editor')} onClick={closeQualificationRequirementEditor}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitQualificationRequirement}>
              <div className="form-grid qualification-form">
                <label className="form-span">
                  {ot('Job')}
                  <select autoFocus required value={qualificationRequirementDraft.jobId} onChange={(event) => setQualificationRequirementDraft({ ...qualificationRequirementDraft, jobId: event.target.value })}>
                    <option value="">{ot('Select a retained job')}</option>
                    {jobs.filter((job) => !['archived', 'cancelled', 'rejected'].includes(job.status)).map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                  </select>
                </label>
                <label>
                  {ot('Requirement type')}
                  <select value={qualificationRequirementDraft.credentialType} onChange={(event) => setQualificationRequirementDraft({ ...qualificationRequirementDraft, credentialType: event.target.value })}>
                    {(data.qualificationRegister?.catalog?.requirements || EMPTY_LIST).map((item) => <option key={item.key} value={item.key}>{ot(item.label)}</option>)}
                  </select>
                </label>
                <label>
                  {ot('Applies to role')}
                  <input value={qualificationRequirementDraft.role} onChange={(event) => setQualificationRequirementDraft({ ...qualificationRequirementDraft, role: event.target.value })} placeholder={ot('Blank means all assigned roles')} />
                </label>
                <label className="form-span">
                  {ot('Requirement title')}
                  <input value={qualificationRequirementDraft.title} onChange={(event) => setQualificationRequirementDraft({ ...qualificationRequirementDraft, title: event.target.value })} placeholder={ot('Uses the requirement type when blank')} />
                </label>
                <label className="checkbox-control form-span">
                  <input type="checkbox" checked={qualificationRequirementDraft.mandatory} onChange={(event) => setQualificationRequirementDraft({ ...qualificationRequirementDraft, mandatory: event.target.checked })} />
                  <span>{ot('Block dispatch, site access, and attendance when evidence is missing or expired')}</span>
                </label>
                <p className="workflow-note form-span">{ot('Removing a retained requirement later needs an approval and does not delete credential history.')}</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeQualificationRequirementEditor}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || !qualificationRequirementDraft.jobId}>
                  <LockKeyhole size={16} />
                  {submitting ? ot('Saving...') : ot('Enforce requirement')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function QualificationRetirementModalDialog({ closeQualificationRequirementRetirement, ot, qualificationRequirementRetirement, qualificationRequirementRetirementReason, requestQualificationRequirementRetirement, setQualificationRequirementRetirementReason, submitting }) {
  return (
<div className="modal-backdrop worker-backdrop" role="presentation">
          <section
            className="modal qualification-retirement-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="qualification-retirement-title"
            data-testid="qualification-retirement-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeQualificationRequirementRetirement()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Approval-gated safety change')}</p>
                <h2 id="qualification-retirement-title">{ot('Request requirement removal')}</h2>
                <p>{qualificationRequirementRetirement.title} / {qualificationRequirementRetirement.jobTitle}</p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close qualification removal request')} onClick={closeQualificationRequirementRetirement}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={requestQualificationRequirementRetirement}>
              <div className="job-lifecycle-body">
                <div className="job-lifecycle-effect">
                  <TriangleAlert size={20} />
                  <div>
                    <strong>{ot('Stop enforcing this readiness gate after approval')}</strong>
                    <p>{ot('The requirement remains active while the decision is pending. Rejection or cancellation restores its normal active state.')}</p>
                  </div>
                </div>
                <label>
                  {ot('Operational reason')}
                  <textarea autoFocus required minLength="8" value={qualificationRequirementRetirementReason} onChange={(event) => setQualificationRequirementRetirementReason(event.target.value)} placeholder={ot('Reference the accepted scope or safety-plan change.')} />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeQualificationRequirementRetirement}>{ot('Cancel')}</button>
                <button className="danger-button" disabled={submitting || qualificationRequirementRetirementReason.trim().length < 8}>
                  <Archive size={16} />
                  {submitting ? ot('Submitting...') : ot('Request removal approval')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function AvailabilityEditorDialog({ AVAILABILITY_TIME_ZONES, availabilityDraft, closeAvailabilityEditor, data, ot, setAvailabilityDraft, submitWorkerAvailability, submitting, workerAvailabilityReviewMinimum }) {
  return (
<div className="modal-backdrop worker-backdrop" role="presentation">
          <section
            className="modal availability-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="availability-editor-title"
            data-testid="availability-editor"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeAvailabilityEditor()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Operational capacity ledger')}</p>
                <h2 id="availability-editor-title">{ot('Add worker unavailability')}</h2>
                <p>{ot('The retained time window blocks overlapping scheduling immediately without creating a message, payroll record, or HR case.')}</p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close availability editor')} onClick={closeAvailabilityEditor}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitWorkerAvailability}>
              <div className="form-grid availability-form">
                <label className="form-span">
                  {ot('Worker')}
                  <select autoFocus required value={availabilityDraft.workerId} onChange={(event) => setAvailabilityDraft({ ...availabilityDraft, workerId: event.target.value })}>
                    <option value="">{ot('Select retained worker')}</option>
                    {(data.workers || EMPTY_LIST).filter((worker) => worker.status !== 'retired' && !worker.retirementApprovalId).map((worker) => (
                      <option key={worker.id} value={worker.id}>{worker.name} / {worker.role || ot('Role not retained')}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {ot('Operational type')}
                  <select value={availabilityDraft.periodType} onChange={(event) => setAvailabilityDraft({ ...availabilityDraft, periodType: event.target.value })}>
                    {(data.availabilityRegister?.catalog || EMPTY_LIST).map((item) => <option key={item.key} value={item.key}>{ot(item.label)}</option>)}
                  </select>
                </label>
                <label>
                  {ot('Display title')}
                  <input maxLength="160" value={availabilityDraft.title} onChange={(event) => setAvailabilityDraft({ ...availabilityDraft, title: event.target.value })} placeholder={ot('Uses the operational type when blank')} />
                </label>
                <label>
                  {ot('Starts')}
                  <input required type="datetime-local" value={availabilityDraft.startsAt} onChange={(event) => setAvailabilityDraft({ ...availabilityDraft, startsAt: event.target.value })} />
                </label>
                <label className="checkbox-control form-span">
                  <input type="checkbox" checked={availabilityDraft.returnUnknown} onChange={(event) => setAvailabilityDraft({ ...availabilityDraft, returnUnknown: event.target.checked, repeatWeekly: event.target.checked ? false : availabilityDraft.repeatWeekly })} />
                  <span>{ot('Return date is unknown')}</span>
                </label>
                {availabilityDraft.returnUnknown ? (
                  <label>
                    {ot('Review availability by')}
                    <input required type="date" min={workerAvailabilityReviewMinimum(availabilityDraft.startsAt)} value={availabilityDraft.reviewAt} onChange={(event) => setAvailabilityDraft({ ...availabilityDraft, reviewAt: event.target.value })} />
                  </label>
                ) : (
                  <label>
                    {ot('Ends')}
                    <input required type="datetime-local" min={availabilityDraft.startsAt || undefined} value={availabilityDraft.endsAt} onChange={(event) => setAvailabilityDraft({ ...availabilityDraft, endsAt: event.target.value })} />
                  </label>
                )}
                {!availabilityDraft.returnUnknown ? (
                  <>
                    <label className="checkbox-control form-span">
                      <input type="checkbox" checked={availabilityDraft.repeatWeekly} onChange={(event) => setAvailabilityDraft({ ...availabilityDraft, repeatWeekly: event.target.checked })} />
                      <span>{ot('Repeat weekly')}</span>
                    </label>
                    {availabilityDraft.repeatWeekly ? <>
                      <fieldset className="availability-weekdays form-span"><legend>{ot('Repeat on')}</legend>{['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map((day, index) => <label key={day}><input type="checkbox" checked={availabilityDraft.recurrenceDays.includes(index)} onChange={(event) => setAvailabilityDraft(current => ({ ...current, recurrenceDays: event.target.checked ? [...new Set([...current.recurrenceDays, index])].sort() : current.recurrenceDays.filter(item => item !== index) }))} />{ot(day)}</label>)}</fieldset>
                      <label>{ot('Last day')}<input required type="date" min={availabilityDraft.startsAt.slice(0, 10)} max={maxWeeklyAvailabilityDate(availabilityDraft.startsAt)} value={availabilityDraft.recurrenceUntil} onChange={(event) => setAvailabilityDraft({ ...availabilityDraft, recurrenceUntil: event.target.value })} /></label>
                      <label>{ot('Time zone')}<select value={availabilityDraft.recurrenceTimeZone} onChange={(event) => setAvailabilityDraft({ ...availabilityDraft, recurrenceTimeZone: event.target.value })}>{[...new Set([...AVAILABILITY_TIME_ZONES, availabilityDraft.recurrenceTimeZone])].map(zone => <option key={zone} value={zone}>{zone}</option>)}</select></label>
                      <p className="workflow-note form-span">{ot('Days and times follow this time zone. The whole series is one availability record. A cancellation request applies to the whole series; record an exception as a separate one-off period.')}</p>
                    </> : null}
                  </>
                ) : null}
                <label className="form-span">
                  {ot('Operational note')}
                  <textarea maxLength="1000" value={availabilityDraft.notes} onChange={(event) => setAvailabilityDraft({ ...availabilityDraft, notes: event.target.value })} placeholder={ot('Capacity or planning context only')} />
                </label>
                <p className="workflow-note form-span">{ot('Do not enter diagnosis, illness, medical details, payroll entitlement, HR case information, or location tracking data.')}</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeAvailabilityEditor}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || !availabilityDraft.workerId || !availabilityDraft.startsAt || (availabilityDraft.repeatWeekly && (!availabilityDraft.recurrenceUntil || !availabilityDraft.recurrenceDays.length)) || (availabilityDraft.returnUnknown ? !availabilityDraft.reviewAt : !availabilityDraft.endsAt)}>
                  <CalendarOff size={16} />
                  {submitting ? ot('Saving...') : ot('Block availability window')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function AvailabilityCancellationModalDialog({ availabilityCancellation, availabilityCancellationReason, closeAvailabilityCancellation, ot, requestAvailabilityCancellation, setAvailabilityCancellationReason, submitting }) {
  return (
<div className="modal-backdrop worker-backdrop" role="presentation">
          <section
            className="modal availability-cancellation-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="availability-cancellation-title"
            data-testid="availability-cancellation-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeAvailabilityCancellation()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Approval-backed capacity change')}</p>
                <h2 id="availability-cancellation-title">{ot('Request availability cancellation')}</h2>
                <p>{availabilityCancellation.workerName} / {availabilityCancellation.title}</p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close availability cancellation')} onClick={closeAvailabilityCancellation}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={requestAvailabilityCancellation}>
              <div className="job-lifecycle-body">
                <div className="job-lifecycle-effect">
                  <TriangleAlert size={20} />
                  <div>
                    <strong>{ot('Remove this scheduling block only after approval')}</strong>
                    <p>{availabilityCancellation.recurrence
                      ? ot('This is a weekly series through {date}. It remains in force for every occurrence until the cancellation is reviewed.', { date: formatDate(availabilityCancellation.recurrence.until) })
                      : availabilityCancellation.returnUnknown
                      ? ot('No return date is recorded; this scheduling block remains until cancellation is approved.')
                      : ot('{start} to {end} remains unavailable while review is pending.', { start: formatDateTime(availabilityCancellation.startsAt), end: formatDateTime(availabilityCancellation.endsAt) })}</p>
                  </div>
                </div>
                <label>
                  {ot('Operational reason')}
                  <textarea autoFocus required minLength="8" maxLength="1000" value={availabilityCancellationReason} onChange={(event) => setAvailabilityCancellationReason(event.target.value)} placeholder={ot('Explain the verified planning change.')} />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeAvailabilityCancellation}>{ot('Cancel')}</button>
                <button className="danger-button" disabled={submitting || availabilityCancellationReason.trim().length < 8}>
                  <Ban size={16} />
                  {submitting ? ot('Submitting...') : ot('Request cancellation approval')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function EquipmentEditorDialog({ closeEquipmentEditor, equipmentDraft, equipmentEditor, ot, saveEquipment, setEquipmentDraft, submitting }) {
  return (
<div className="modal-backdrop equipment-backdrop" role="presentation">
          <section
            className="modal equipment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="equipment-editor-title"
            data-testid="equipment-editor"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeEquipmentEditor()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Retained equipment record')}</p>
                <h2 id="equipment-editor-title">{equipmentDraft.id ? ot('Edit {name}', { name: equipmentDraft.name || ot('equipment') }) : ot('Add equipment')}</h2>
                <p>{ot('Identity, condition, location, inspection, and internal reference evidence for resource planning.')}</p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close equipment editor')} onClick={closeEquipmentEditor}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveEquipment}>
              <div className="form-grid equipment-form">
                <label className="form-span">
                  {ot('Equipment name')}
                  <input
                    autoFocus
                    required
                    minLength="2"
                    value={equipmentDraft.name}
                    onChange={(event) => setEquipmentDraft({ ...equipmentDraft, name: event.target.value })}
                    placeholder={ot('Site laser, tower scaffold, service van')}
                  />
                </label>
                <label>
                  {ot('Category')}
                  <input
                    required
                    value={equipmentDraft.category}
                    onChange={(event) => setEquipmentDraft({ ...equipmentDraft, category: event.target.value })}
                    placeholder={ot('Measurement, access, vehicle')}
                  />
                </label>
                <label>
                  {ot('Operational status')}
                  <select
                    value={equipmentDraft.status}
                    disabled={Boolean(equipmentEditor?.activeCustody)}
                    onChange={(event) => setEquipmentDraft({ ...equipmentDraft, status: event.target.value })}
                  >
                    <option value="available">{ot('Available')}</option>
                    <option value="in_use" disabled={!equipmentEditor?.activeCustody}>{ot('In use (custody controlled)')}</option>
                    <option value="maintenance">{ot('Maintenance')}</option>
                    <option value="inspection_due">{ot('Inspection due')}</option>
                    <option value="inactive">{ot('Inactive')}</option>
                    <option value="lost">{ot('Lost')}</option>
                  </select>
                </label>
                <label>
                  {ot('Home location')}
                  <input
                    value={equipmentDraft.homeLocation}
                    onChange={(event) => setEquipmentDraft({ ...equipmentDraft, homeLocation: event.target.value })}
                    placeholder={ot('Utrecht depot')}
                  />
                </label>
                <label>
                  {ot('Current location')}
                  <input
                    disabled={Boolean(equipmentEditor?.activeCustody)}
                    value={equipmentDraft.currentLocation}
                    onChange={(event) => setEquipmentDraft({ ...equipmentDraft, currentLocation: event.target.value })}
                    placeholder={ot('Depot, site, or vehicle')}
                  />
                </label>
                <label>
                  {ot('Serial or asset reference')}
                  <input
                    value={equipmentDraft.serialNumber}
                    onChange={(event) => setEquipmentDraft({ ...equipmentDraft, serialNumber: event.target.value })}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={equipmentDraft.inspectionRequired}
                    onChange={(event) =>
                      setEquipmentDraft({
                        ...equipmentDraft,
                        inspectionRequired: event.target.checked,
                        inspectionDueAt: event.target.checked ? equipmentDraft.inspectionDueAt : '',
                      })
                    }
                  />
                  {ot('Inspection required before reservation')}
                </label>
                <label>
                  {ot('Inspection due')}
                  <input
                    type="date"
                    required={equipmentDraft.inspectionRequired}
                    disabled={!equipmentDraft.inspectionRequired}
                    value={equipmentDraft.inspectionDueAt}
                    onChange={(event) => setEquipmentDraft({ ...equipmentDraft, inspectionDueAt: event.target.value })}
                  />
                </label>
                <label className="form-span">
                  {ot('Internal notes')}
                  <textarea
                    value={equipmentDraft.notes}
                    onChange={(event) => setEquipmentDraft({ ...equipmentDraft, notes: event.target.value })}
                    placeholder={ot('Record condition, restrictions, certificates, or planning context.')}
                  />
                </label>
                <p className="workflow-note form-span">
                  {ot('Saving this record does not reserve, dispatch, inspect, purchase, or assign equipment.')}
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeEquipmentEditor}>
                  {ot('Cancel')}
                </button>
                <button
                  className="primary-button"
                  disabled={
                    submitting ||
                    equipmentDraft.name.trim().length < 2 ||
                    !equipmentDraft.category.trim() ||
                    (equipmentDraft.inspectionRequired && !equipmentDraft.inspectionDueAt)
                  }
                >
                  <ShieldCheck size={16} />
                  {submitting ? ot('Saving...') : ot('Save retained equipment')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function EquipmentCheckoutModalDialog({ closeEquipmentCheckout, equipmentCheckoutDraft, equipmentCheckoutPlans, jobs, ot, saveEquipmentCheckout, selectEquipmentCheckoutJob, selectEquipmentCheckoutPlan, selectedEquipmentCheckoutPlan, setEquipmentCheckoutDraft, submitting }) {
  return (
<div className="modal-backdrop equipment-backdrop" role="presentation">
          <section
            className="modal equipment-custody-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="equipment-checkout-title"
            data-testid="equipment-checkout-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeEquipmentCheckout()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Physical custody')}</p>
                <h2 id="equipment-checkout-title">{ot('Check out reserved equipment')}</h2>
                <p>{ot('Reservation-linked handoff evidence')}</p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close equipment checkout')} onClick={closeEquipmentCheckout}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveEquipmentCheckout}>
              <div className="form-grid equipment-custody-form">
                <label>
                  {ot('Job')}
                  <select autoFocus required disabled={submitting} value={equipmentCheckoutDraft.jobId} onChange={(event) => void selectEquipmentCheckoutJob(event.target.value)}>
                    <option value="">{ot('Select an active job')}</option>
                    {jobs.filter((job) => !['archived', 'completed', 'cancelled', 'rejected'].includes(job.status)).map((job) => (
                      <option key={job.id} value={job.id}>{job.title}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {ot('Reservation')}
                  <select required disabled={!equipmentCheckoutDraft.jobId || submitting} value={equipmentCheckoutDraft.reservationId} onChange={(event) => selectEquipmentCheckoutPlan(event.target.value)}>
                    <option value="">{ot('Select checkout-ready equipment')}</option>
                    {equipmentCheckoutPlans.map((plan) => (
                      <option key={plan.reservation.id} value={plan.reservation.id} disabled={!plan.checkoutReady}>
                        {plan.tool.name} / {plan.checkoutReady ? ot('ready') : plan.activeCustody ? ot('already checked out') : ot('{status} - blocked', { status: ot(plan.tool.status.replaceAll('_', ' ')) })}
                      </option>
                    ))}
                  </select>
                </label>
                {selectedEquipmentCheckoutPlan ? (
                  <dl className="equipment-custody-preview form-span">
                    <div><dt>{ot('Equipment')}</dt><dd>{selectedEquipmentCheckoutPlan.tool.name}</dd></div>
                    <div><dt>{ot('Current location')}</dt><dd>{selectedEquipmentCheckoutPlan.tool.currentLocation || ot('Not retained')}</dd></div>
                    <div><dt>{ot('Reservation until')}</dt><dd>{selectedEquipmentCheckoutPlan.reservation.neededUntil ? formatDateTime(selectedEquipmentCheckoutPlan.reservation.neededUntil) : ot('Open')}</dd></div>
                  </dl>
                ) : equipmentCheckoutDraft.jobId && !submitting ? (
                  <p className="workflow-note form-span">{ot('No checkout-ready retained equipment reservation is available for this job.')}</p>
                ) : null}
                <label>
                  {ot('Physical custodian')}
                  <input required minLength="2" maxLength="160" value={equipmentCheckoutDraft.checkedOutBy} onChange={(event) => setEquipmentCheckoutDraft({ ...equipmentCheckoutDraft, checkedOutBy: event.target.value })} />
                </label>
                <label>
                  {ot('Checkout condition')}
                  <select value={equipmentCheckoutDraft.condition} onChange={(event) => setEquipmentCheckoutDraft({ ...equipmentCheckoutDraft, condition: event.target.value })}>
                    <option value="good">{ot('Good')}</option>
                    <option value="serviceable">{ot('Serviceable')}</option>
                  </select>
                </label>
                <label>
                  {ot('Checked out at')}
                  <input required type="datetime-local" max={toLocalDateTimeInput(new Date())} value={equipmentCheckoutDraft.checkedOutAt} onChange={(event) => setEquipmentCheckoutDraft({ ...equipmentCheckoutDraft, checkedOutAt: event.target.value })} />
                </label>
                <label>
                  {ot('Due back')}
                  <input type="datetime-local" min={equipmentCheckoutDraft.checkedOutAt} value={equipmentCheckoutDraft.dueBackAt} onChange={(event) => setEquipmentCheckoutDraft({ ...equipmentCheckoutDraft, dueBackAt: event.target.value })} />
                </label>
                <label>
                  {ot('Handoff location')}
                  <input maxLength="240" value={equipmentCheckoutDraft.location} onChange={(event) => setEquipmentCheckoutDraft({ ...equipmentCheckoutDraft, location: event.target.value })} placeholder={ot('Depot, yard, or project gate')} />
                </label>
                <label>
                  {ot('Meter')}
                  <input type="number" min="0" step="any" inputMode="decimal" value={equipmentCheckoutDraft.meter} onChange={(event) => setEquipmentCheckoutDraft({ ...equipmentCheckoutDraft, meter: event.target.value })} />
                </label>
                <label className="form-span">
                  {ot('Handoff evidence reference')}
                  <input required minLength="3" maxLength="240" value={equipmentCheckoutDraft.evidenceReference} onChange={(event) => setEquipmentCheckoutDraft({ ...equipmentCheckoutDraft, evidenceReference: event.target.value })} placeholder={ot('Photo, checklist, or signed handoff')} />
                </label>
                <label className="form-span">
                  {ot('Handoff note')}
                  <textarea maxLength="2000" value={equipmentCheckoutDraft.notes} onChange={(event) => setEquipmentCheckoutDraft({ ...equipmentCheckoutDraft, notes: event.target.value })} placeholder={ot('Keys, accessories, restrictions, or visible condition')} />
                </label>
                <p className="workflow-note form-span">{ot('Checkout changes equipment availability and reservation state atomically. It creates no purchase, hire, or external communication.')}</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeEquipmentCheckout}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || !selectedEquipmentCheckoutPlan?.checkoutReady || equipmentCheckoutDraft.checkedOutBy.trim().length < 2 || equipmentCheckoutDraft.evidenceReference.trim().length < 3}>
                  <ArrowUpRight size={16} />
                  {submitting ? ot('Recording...') : ot('Retain checkout')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function EquipmentReturnModalDialog({ closeEquipmentReturn, equipmentReturnDraft, equipmentReturnEditor, ot, saveEquipmentReturn, setEquipmentReturnDraft, submitting }) {
  return (
<div className="modal-backdrop equipment-backdrop" role="presentation">
          <section
            className="modal equipment-return-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="equipment-return-title"
            data-testid="equipment-return-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeEquipmentReturn()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Physical custody')}</p>
                <h2 id="equipment-return-title">{ot('Return {name}', { name: equipmentReturnEditor.toolName })}</h2>
                <p>{equipmentReturnEditor.jobTitle} / {equipmentReturnEditor.workerName || equipmentReturnEditor.checkedOutBy}</p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close equipment return')} onClick={closeEquipmentReturn}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveEquipmentReturn}>
              <div className="form-grid equipment-custody-form">
                <dl className="equipment-custody-preview form-span">
                  <div><dt>{ot('Checked out')}</dt><dd>{formatDateTime(equipmentReturnEditor.checkedOutAt)}</dd></div>
                  <div><dt>{ot('Due back')}</dt><dd>{equipmentReturnEditor.dueBackAt ? formatDateTime(equipmentReturnEditor.dueBackAt) : ot('Open')}</dd></div>
                  <div><dt>{ot('Checkout condition')}</dt><dd>{ot(equipmentReturnEditor.checkoutCondition.replaceAll('_', ' '))}</dd></div>
                </dl>
                <label>
                  {ot('Returned at')}
                  <input autoFocus required type="datetime-local" max={toLocalDateTimeInput(new Date())} value={equipmentReturnDraft.returnedAt} onChange={(event) => setEquipmentReturnDraft({ ...equipmentReturnDraft, returnedAt: event.target.value })} />
                </label>
                <label>
                  {ot('Returned by')}
                  <input required minLength="2" maxLength="160" value={equipmentReturnDraft.returnedBy} onChange={(event) => setEquipmentReturnDraft({ ...equipmentReturnDraft, returnedBy: event.target.value })} />
                </label>
                <label>
                  {ot('Return condition')}
                  <select value={equipmentReturnDraft.condition} onChange={(event) => setEquipmentReturnDraft({ ...equipmentReturnDraft, condition: event.target.value })}>
                    <option value="serviceable">{ot('Serviceable')}</option>
                    <option value="good">{ot('Good')}</option>
                    <option value="damaged">{ot('Damaged')}</option>
                    <option value="unsafe">{ot('Unsafe')}</option>
                    <option value="lost">{ot('Lost')}</option>
                  </select>
                </label>
                <label>
                  {ot('Return location')}
                  <input maxLength="240" value={equipmentReturnDraft.location} onChange={(event) => setEquipmentReturnDraft({ ...equipmentReturnDraft, location: event.target.value })} placeholder={ot('Depot, yard, or quarantine bay')} />
                </label>
                <label>
                  {ot('Meter')}
                  <input type="number" min={equipmentReturnEditor.checkoutMeter ?? 0} step="any" inputMode="decimal" value={equipmentReturnDraft.meter} onChange={(event) => setEquipmentReturnDraft({ ...equipmentReturnDraft, meter: event.target.value })} />
                </label>
                <label className="form-span">
                  {ot('Return evidence reference')}
                  <input required minLength="3" maxLength="240" value={equipmentReturnDraft.evidenceReference} onChange={(event) => setEquipmentReturnDraft({ ...equipmentReturnDraft, evidenceReference: event.target.value })} placeholder={ot('Photo, checklist, or signed handoff')} />
                </label>
                <label className="form-span">
                  {ot('Return findings')}
                  <textarea required={['damaged', 'unsafe', 'lost'].includes(equipmentReturnDraft.condition)} minLength={['damaged', 'unsafe', 'lost'].includes(equipmentReturnDraft.condition) ? 8 : undefined} maxLength="2000" value={equipmentReturnDraft.notes} onChange={(event) => setEquipmentReturnDraft({ ...equipmentReturnDraft, notes: event.target.value })} placeholder={ot('Condition, missing parts, or isolation detail')} />
                </label>
                <p className="workflow-note form-span">{ot('Damaged, unsafe, and lost returns are quarantined automatically and create an internal review action. No supplier or finance action is executed.')}</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeEquipmentReturn}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || equipmentReturnDraft.returnedBy.trim().length < 2 || equipmentReturnDraft.evidenceReference.trim().length < 3 || (['damaged', 'unsafe', 'lost'].includes(equipmentReturnDraft.condition) && equipmentReturnDraft.notes.trim().length < 8)}>
                  <PackageCheck size={16} />
                  {submitting ? ot('Recording...') : ot('Retain return')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function EquipmentInspectionModalDialog({ closeEquipmentInspection, equipmentInspection, equipmentInspectionDraft, ot, recordEquipmentInspection, setEquipmentInspectionDraft, submitting }) {
  return (
<div className="modal-backdrop equipment-backdrop" role="presentation">
          <section
            className="modal equipment-inspection-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="equipment-inspection-title"
            data-testid="equipment-inspection-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeEquipmentInspection()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Internal inspection evidence')}</p>
                <h2 id="equipment-inspection-title">{ot('Record equipment inspection')}</h2>
                <p>
                  {equipmentInspection.name} / {ot(equipmentInspection.category || 'general')}
                </p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close equipment inspection')} onClick={closeEquipmentInspection}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={recordEquipmentInspection}>
              <div className="form-grid equipment-inspection-form">
                <label>
                  {ot('Inspection result')}
                  <select
                    autoFocus
                    value={equipmentInspectionDraft.result}
                    onChange={(event) => setEquipmentInspectionDraft({ ...equipmentInspectionDraft, result: event.target.value })}
                  >
                    <option value="passed">{ot('Passed')}</option>
                    <option value="limited">{ot('Limited')}</option>
                    <option value="failed">{ot('Failed')}</option>
                  </select>
                </label>
                <label>
                  {ot('Inspection date')}
                  <input
                    type="date"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                    value={equipmentInspectionDraft.inspectedAt}
                    onChange={(event) => setEquipmentInspectionDraft({ ...equipmentInspectionDraft, inspectedAt: event.target.value })}
                  />
                </label>
                <label>
                  {ot('Inspector or internal reference')}
                  <input
                    required
                    minLength="2"
                    value={equipmentInspectionDraft.inspector}
                    onChange={(event) => setEquipmentInspectionDraft({ ...equipmentInspectionDraft, inspector: event.target.value })}
                    placeholder={ot('Name or retained staff reference')}
                  />
                </label>
                <label>
                  {ot('Next inspection due')}
                  <input
                    type="date"
                    required={equipmentInspection.inspection?.required && equipmentInspectionDraft.result === 'passed'}
                    disabled={equipmentInspectionDraft.result !== 'passed'}
                    min={equipmentInspectionDraft.inspectedAt}
                    value={equipmentInspectionDraft.nextDueAt}
                    onChange={(event) => setEquipmentInspectionDraft({ ...equipmentInspectionDraft, nextDueAt: event.target.value })}
                  />
                </label>
                <label className="form-span">
                  {ot('Evidence reference')}
                  <input
                    value={equipmentInspectionDraft.reference}
                    onChange={(event) => setEquipmentInspectionDraft({ ...equipmentInspectionDraft, reference: event.target.value })}
                    placeholder={ot('Checklist, document, or service reference')}
                  />
                </label>
                <label className="form-span">
                  {ot('Findings')}
                  <textarea
                    required={equipmentInspectionDraft.result !== 'passed'}
                    minLength={equipmentInspectionDraft.result !== 'passed' ? 8 : undefined}
                    value={equipmentInspectionDraft.notes}
                    onChange={(event) => setEquipmentInspectionDraft({ ...equipmentInspectionDraft, notes: event.target.value })}
                    placeholder={ot('Retain findings, restrictions, or follow-up work.')}
                  />
                </label>
                <p className="workflow-note form-span">
                  {ot('This creates internal operational evidence only. It does not claim statutory inspection, certification, supplier service, or external approval. Failed and limited results block new reservations.')}
                  {['failed', 'limited'].includes(equipmentInspection.inspection?.status)
                    ? ` ${ot('Retain completed maintenance before recording a passing reinspection.')}`
                    : equipmentInspection.inspection?.status === 'reinspection_required'
                      ? ` ${ot('Completed maintenance is retained; record a passing reinspection before reservation readiness can return.')}`
                      : ''}
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeEquipmentInspection}>
                  {ot('Cancel')}
                </button>
                <button
                  className="primary-button"
                  disabled={
                    submitting ||
                    equipmentInspectionDraft.inspector.trim().length < 2 ||
                    !equipmentInspectionDraft.inspectedAt ||
                    (equipmentInspection.inspection?.required &&
                      equipmentInspectionDraft.result === 'passed' &&
                      !equipmentInspectionDraft.nextDueAt) ||
                    (equipmentInspectionDraft.result !== 'passed' && equipmentInspectionDraft.notes.trim().length < 8)
                  }
                >
                  <ClipboardCheck size={16} />
                  {submitting ? ot('Recording...') : ot('Record inspection')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function EquipmentMaintenanceModalDialog({ closeEquipmentMaintenance, equipmentMaintenance, equipmentMaintenanceDraft, ot, recordEquipmentMaintenance, setEquipmentMaintenanceDraft, submitting }) {
  return (
<div className="modal-backdrop equipment-backdrop" role="presentation">
          <section
            className="modal equipment-maintenance-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="equipment-maintenance-title"
            data-testid="equipment-maintenance-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeEquipmentMaintenance()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Internal maintenance evidence')}</p>
                <h2 id="equipment-maintenance-title">{ot('Record equipment maintenance')}</h2>
                <p>
                  {equipmentMaintenance.name} / {ot(equipmentMaintenance.category || 'general')}
                </p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close equipment maintenance')} onClick={closeEquipmentMaintenance}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={recordEquipmentMaintenance}>
              <div className="form-grid equipment-maintenance-form">
                <label>
                  {ot('Maintenance outcome')}
                  <select
                    autoFocus
                    value={equipmentMaintenanceDraft.outcome}
                    onChange={(event) => setEquipmentMaintenanceDraft({ ...equipmentMaintenanceDraft, outcome: event.target.value })}
                  >
                    <option value="completed">{ot('Completed')}</option>
                    <option value="follow_up_required">{ot('Follow up required')}</option>
                  </select>
                </label>
                <label>
                  {ot('Maintenance type')}
                  <select
                    value={equipmentMaintenanceDraft.maintenanceType}
                    onChange={(event) =>
                      setEquipmentMaintenanceDraft({ ...equipmentMaintenanceDraft, maintenanceType: event.target.value })
                    }
                  >
                    <option value="corrective">{ot('Corrective')}</option>
                    <option value="preventive">{ot('Preventive')}</option>
                    <option value="repair">{ot('Repair')}</option>
                    <option value="service">{ot('Service')}</option>
                  </select>
                </label>
                <label>
                  {ot('Maintenance date')}
                  <input
                    type="date"
                    required
                    max={new Date().toISOString().slice(0, 10)}
                    value={equipmentMaintenanceDraft.performedAt}
                    onChange={(event) => setEquipmentMaintenanceDraft({ ...equipmentMaintenanceDraft, performedAt: event.target.value })}
                  />
                </label>
                <label>
                  {ot('Person or internal reference')}
                  <input
                    required
                    minLength="2"
                    value={equipmentMaintenanceDraft.performedBy}
                    onChange={(event) => setEquipmentMaintenanceDraft({ ...equipmentMaintenanceDraft, performedBy: event.target.value })}
                    placeholder={ot('Name or retained staff reference')}
                  />
                </label>
                <label className="form-span">
                  {ot('Evidence reference')}
                  <input
                    value={equipmentMaintenanceDraft.reference}
                    onChange={(event) => setEquipmentMaintenanceDraft({ ...equipmentMaintenanceDraft, reference: event.target.value })}
                    placeholder={ot('Work order, checklist, or internal reference')}
                  />
                </label>
                <label className="form-span">
                  {ot('Work performed')}
                  <textarea
                    required
                    minLength="8"
                    value={equipmentMaintenanceDraft.notes}
                    onChange={(event) => setEquipmentMaintenanceDraft({ ...equipmentMaintenanceDraft, notes: event.target.value })}
                    placeholder={ot('Retain the work completed, remaining defect, or follow-up requirement.')}
                  />
                </label>
                <p className="workflow-note form-span">
                  {ot('This retains internal maintenance evidence only. It does not place a supplier order, commit spend, claim external service, or clear a failed inspection. A passing reinspection is required after failed or limited inspection evidence.')}
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeEquipmentMaintenance}>
                  {ot('Cancel')}
                </button>
                <button
                  className="primary-button"
                  disabled={
                    submitting ||
                    equipmentMaintenanceDraft.performedBy.trim().length < 2 ||
                    !equipmentMaintenanceDraft.performedAt ||
                    equipmentMaintenanceDraft.notes.trim().length < 8
                  }
                >
                  <Wrench size={16} />
                  {submitting ? ot('Recording...') : ot('Record maintenance')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function EquipmentRetirementModalDialog({ closeEquipmentRetirement, equipmentRetirement, equipmentRetirementReason, ot, requestEquipmentRetirement, setEquipmentRetirementReason, submitting }) {
  return (
<div className="modal-backdrop equipment-backdrop" role="presentation">
          <section
            className="modal equipment-retirement-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="equipment-retirement-title"
            data-testid="equipment-retirement-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeEquipmentRetirement()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Approval-gated lifecycle')}</p>
                <h2 id="equipment-retirement-title">{ot('Request equipment retirement')}</h2>
                <p>
                  {equipmentRetirement.name} / {ot(equipmentRetirement.category || 'general')}
                </p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={ot('Close equipment retirement request')}
                onClick={closeEquipmentRetirement}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={requestEquipmentRetirement}>
              <div className="job-lifecycle-body">
                <div className="job-lifecycle-effect">
                  <Archive size={20} />
                  <div>
                    <strong>{ot('Block this equipment from new reservations')}</strong>
                    <p>
                      {ot('The retained status changes to retired only after approval and after every operational reservation has been released.')}
                    </p>
                  </div>
                </div>
                <ul className="job-lifecycle-safeguards">
                  <li>{ot('The complete equipment, reservation, approval, and audit history remains retained.')}</li>
                  <li>{ot('New reservations are blocked as soon as this request enters the approval queue.')}</li>
                  <li>
                    {equipmentRetirement.activeReservationCount > 0
                      ? ot('Approval cannot complete while {count} operational reservations remain.', { count: equipmentRetirement.activeReservationCount })
                      : ot('No operational reservations currently block this retirement.')}
                  </li>
                  {equipmentRetirement.dormantReservationCount > 0 ? (
                    <li>
                      {ot('Approval will release {count} dormant reservations retained on inactive jobs, so any later job restore requires a new reservation.', {
                        count: equipmentRetirement.dormantReservationCount,
                      })}
                    </li>
                  ) : null}
                  <li>{ot('No crew member, client, supplier, finance provider, or site contact is notified.')}</li>
                </ul>
                <label>
                  {ot('Operational reason')}
                  <textarea
                    autoFocus
                    required
                    minLength="8"
                    value={equipmentRetirementReason}
                    onChange={(event) => setEquipmentRetirementReason(event.target.value)}
                    placeholder={ot('Explain why this equipment should no longer be selected for work.')}
                  />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeEquipmentRetirement}>
                  {ot('Cancel')}
                </button>
                <button className="danger-button" disabled={submitting || equipmentRetirementReason.trim().length < 8}>
                  <Archive size={16} />
                  {submitting ? ot('Submitting...') : ot('Request retirement approval')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function TradePartnerEditorDialog({ closeTradePartnerEditor, ot, saveTradePartner, setTradePartnerDraft, submitting, tradePartnerDraft }) {
  return (
<div className="modal-backdrop trade-partner-backdrop" role="presentation">
          <section
            className="modal trade-partner-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trade-partner-editor-title"
            data-testid="trade-partner-editor"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Retained commercial evidence</p>
                <h2 id="trade-partner-editor-title">
                  {tradePartnerDraft.id ? `Edit ${tradePartnerDraft.name || 'trade partner'}` : 'Add trade partner'}
                </h2>
                <p>Identity and compliance evidence used by approval-gated purchasing.</p>
              </div>
              <button className="icon-button" aria-label="Close trade partner editor" onClick={closeTradePartnerEditor}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={saveTradePartner}>
              <div className="form-grid trade-partner-form">
                <label className="form-span">
                  Legal or trading name
                  <input
                    required
                    value={tradePartnerDraft.name}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, name: event.target.value })}
                  />
                </label>
                <label>
                  Partner type
                  <select
                    value={tradePartnerDraft.partnerType}
                    onChange={(event) => {
                      const partnerType = event.target.value
                      setTradePartnerDraft({
                        ...tradePartnerDraft,
                        partnerType,
                        requiresInsurance: tradePartnerDraft.requiresInsurance || ['subcontractor', 'both'].includes(partnerType),
                      })
                    }}
                  >
                    <option value="supplier">Supplier</option>
                    <option value="subcontractor">Subcontractor</option>
                    <option value="both">Supplier and subcontractor</option>
                  </select>
                </label>
                <label>
                  Internal status
                  <select
                    value={tradePartnerDraft.status}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, status: event.target.value })}
                  >
                    <option value="active">Active</option>
                    <option value="on_hold">On hold</option>
                  </select>
                </label>
                <label>
                  Contact name
                  <input
                    value={tradePartnerDraft.contactName}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, contactName: event.target.value })}
                  />
                </label>
                <label>
                  Email
                  <input
                    type="email"
                    value={tradePartnerDraft.email}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, email: event.target.value })}
                  />
                </label>
                <label>
                  Phone
                  <input
                    value={tradePartnerDraft.phone}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, phone: event.target.value })}
                  />
                </label>
                <label>
                  City
                  <input
                    value={tradePartnerDraft.city}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, city: event.target.value })}
                  />
                </label>
                <label>
                  Country
                  <input
                    required
                    maxLength="2"
                    value={tradePartnerDraft.country}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, country: event.target.value.toUpperCase() })}
                    placeholder="NL"
                  />
                </label>
                <label>
                  Registration / KVK
                  <input
                    value={tradePartnerDraft.registrationNumber}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, registrationNumber: event.target.value })}
                  />
                </label>
                <label>
                  VAT number
                  <input
                    disabled={tradePartnerDraft.vatExempt}
                    value={tradePartnerDraft.vatNumber}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, vatNumber: event.target.value })}
                  />
                </label>
                <label className="form-span checkbox-label">
                  <input
                    type="checkbox"
                    checked={tradePartnerDraft.vatExempt}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, vatExempt: event.target.checked })}
                  />
                  VAT exemption has been verified
                </label>
                <label className="form-span">
                  Specialties
                  <input
                    value={tradePartnerDraft.specialties}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, specialties: event.target.value })}
                    placeholder="Roofing, electrical, timber"
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={tradePartnerDraft.requiresInsurance}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, requiresInsurance: event.target.checked })}
                  />
                  Insurance evidence required
                </label>
                <label>
                  Insurance expiry
                  <input
                    type="date"
                    disabled={!tradePartnerDraft.requiresInsurance}
                    required={tradePartnerDraft.requiresInsurance}
                    value={tradePartnerDraft.insuranceExpiresAt}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, insuranceExpiresAt: event.target.value })}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={tradePartnerDraft.requiresVca}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, requiresVca: event.target.checked })}
                  />
                  VCA evidence required
                </label>
                <label>
                  VCA expiry
                  <input
                    type="date"
                    disabled={!tradePartnerDraft.requiresVca}
                    required={tradePartnerDraft.requiresVca}
                    value={tradePartnerDraft.vcaExpiresAt}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, vcaExpiresAt: event.target.value })}
                  />
                </label>
                <label>
                  Verification reference
                  <input
                    value={tradePartnerDraft.verificationReference}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, verificationReference: event.target.value })}
                    placeholder="Registry check or evidence record"
                  />
                </label>
                <label>
                  Verified on
                  <input
                    type="date"
                    value={tradePartnerDraft.verifiedAt}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, verifiedAt: event.target.value })}
                  />
                </label>
                <label className="form-span">
                  Internal notes
                  <textarea
                    value={tradePartnerDraft.notes}
                    onChange={(event) => setTradePartnerDraft({ ...tradePartnerDraft, notes: event.target.value })}
                    placeholder="Record scope, restrictions, or evidence context."
                  />
                </label>
                <p className="workflow-note form-span">
                  Saving this record does not contact the partner, place an order, commit spend, or approve site access.
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeTradePartnerEditor}>
                  {ot('Cancel')}
                </button>
                <button className="primary-button" disabled={submitting || !tradePartnerDraft.name.trim()}>
                  <ShieldCheck size={16} />
                  {submitting ? 'Saving...' : 'Save retained partner'}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function TradePartnerRetirementModalDialog({ closeTradePartnerRetirement, ot, requestTradePartnerRetirement, setTradePartnerRetirementReason, submitting, tradePartnerRetirement, tradePartnerRetirementReason }) {
  return (
<div className="modal-backdrop trade-partner-backdrop" role="presentation">
          <section
            className="modal trade-partner-retirement-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="trade-partner-retirement-title"
            data-testid="trade-partner-retirement-modal"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Approval-gated lifecycle</p>
                <h2 id="trade-partner-retirement-title">Request partner retirement</h2>
                <p>
                  {tradePartnerRetirement.name} / {formatStatus(tradePartnerRetirement.partnerType)}
                </p>
              </div>
              <button className="icon-button" aria-label="Close trade partner retirement request" onClick={closeTradePartnerRetirement}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={requestTradePartnerRetirement}>
              <div className="job-lifecycle-body">
                <div className="job-lifecycle-effect">
                  <Archive size={20} />
                  <div>
                    <strong>Block this partner from new procurement</strong>
                    <p>The status changes to retired only after approval. Open work remains visible for operator review.</p>
                  </div>
                </div>
                <ul className="job-lifecycle-safeguards">
                  <li>All identity, compliance, purchasing, approval, and audit history remains retained.</li>
                  <li>No open order, contract, payment, delivery, or site assignment is cancelled.</li>
                  <li>No partner, supplier, client, or worker is contacted from this action.</li>
                </ul>
                <label>
                  Operational reason
                  <textarea
                    required
                    minLength="8"
                    value={tradePartnerRetirementReason}
                    onChange={(event) => setTradePartnerRetirementReason(event.target.value)}
                    placeholder="Explain why this partner should no longer be selected for new work."
                  />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeTradePartnerRetirement}>
                  Cancel
                </button>
                <button className="danger-button" disabled={submitting || tradePartnerRetirementReason.trim().length < 8}>
                  <Archive size={16} />
                  {submitting ? ot('Submitting...') : ot('Request retirement approval')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function ApprovalReviewModalDialog({ approvalReason, approvalReview, closeApprovalReview, ot, resolveApproval, setApprovalReason, submitting }) {
  return (
<div className="modal-backdrop" role="presentation">
          <section
            className="modal approval-review-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="approval-review-title"
            data-testid="approval-review-modal"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Retained decision review</p>
                <h2 id="approval-review-title">{approvalReview.status === 'approved' ? 'Approve decision' : 'Reject decision'}</h2>
                <p>{approvalReview.item.summary || formatStatus(approvalReview.item.targetType)}</p>
              </div>
              <button className="icon-button" aria-label="Close approval review" onClick={closeApprovalReview}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={resolveApproval}>
              <div className="approval-review-body">
                <div className="approval-review-primary">
                  <TriangleAlert size={20} />
                  <div>
                    <span className={`tag tag-${approvalReview.item.decision?.riskLevel === 'high' ? 'amber' : 'green'}`}>
                      {approvalReview.item.decision?.riskLevel || 'review'} risk
                    </span>
                    <strong>
                      {approvalReview.item.decision?.primaryEffect ||
                        approvalReview.item.reason ||
                        'Resolve this retained ledger decision.'}
                    </strong>
                  </div>
                </div>
                {approvalReview.item.targetType === 'client_selection' ? (
                  <section className="approval-review-section" data-testid="client-choice-approval-preview">
                    <h3>{ot('Customer choice preview')}</h3>
                    {approvalReview.item.decision?.preview?.title ? <p><strong>{approvalReview.item.decision.preview.title}</strong></p> : null}
                    {approvalReview.item.decision?.preview?.options?.length ? (
                      <ul>{approvalReview.item.decision.preview.options.map((option) => <li key={option}>{option}</li>)}</ul>
                    ) : <p>{ot('No response options are available; do not approve until the proposal is corrected.')}</p>}
                    {approvalReview.item.decision?.preview?.dueAt ? <p>{ot('Response deadline: {date}', { date: approvalReview.item.decision.preview.dueAt })}</p> : null}
                    {approvalReview.item.decision?.preview?.rationale ? <p>{ot('Internal rationale: {rationale}', { rationale: approvalReview.item.decision.preview.rationale })}</p> : null}
                    <p>{ot('This publishes a choice in the client portal after approval. It does not send a message or record customer agreement.')}</p>
                  </section>
                ) : null}
                {approvalReview.item.targetType === 'submittal_record' ? (
                  <section className="approval-review-section" data-testid="submittal-approval-preview">
                    <h3>Submittal scope preview</h3>
                    {approvalReview.item.decision?.preview?.title ? <p><strong>{approvalReview.item.decision.preview.title}</strong></p> : null}
                    {approvalReview.item.decision?.preview?.packageName ? <p>{approvalReview.item.decision.preview.packageName}</p> : null}
                    <p><strong>Applies to:</strong> {(approvalReview.item.decision?.preview?.taskScope || []).join(', ') || 'Entire job'}</p>
                    <p>The exact task scope is rechecked before approval and controls which assigned field workers can see this approved reference.</p>
                  </section>
                ) : null}
                <ConversationEvidenceReview
                  origin={approvalReview.item.decision?.preview?.conversationOrigin}
                  revisionOrigin={approvalReview.item.decision?.preview?.revisionOrigin}
                  t={ot}
                />
                {approvalReview.item.decision?.effects?.length ? (
                  <div className="approval-review-section">
                    <h3>Ledger effects</h3>
                    <ul>
                      {approvalReview.item.decision.effects.map((effect) => (
                        <li key={effect}>{effect}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {approvalReview.item.decision?.preview?.completionReadiness ? (
                  <div className="approval-review-section" data-testid="operational-completion-review">
                    <h3>Operational completion review</h3>
                    <p>
                      {approvalReview.item.decision.preview.completionReadiness.ready
                        ? 'No current operational blockers were found in the completion check.'
                        : 'Completion is blocked until the listed operational issues are resolved.'}
                    </p>
                    {approvalReview.item.decision.preview.completionReadiness.blockers?.length ? (
                      <ul>
                        {approvalReview.item.decision.preview.completionReadiness.blockers.map((blocker) => (
                          <li key={`${blocker.code}:${(blocker.recordIds || []).join(',')}`}>{blocker.label}</li>
                        ))}
                      </ul>
                    ) : null}
                    {approvalReview.item.decision.preview.completionReadiness.warnings?.length ? (
                      <>
                        <h4>Separate handover or commercial follow-up</h4>
                        <ul>
                          {approvalReview.item.decision.preview.completionReadiness.warnings.map((warning) => (
                            <li key={`${warning.code}:${(warning.recordIds || []).join(',')}`}>{warning.label}</li>
                          ))}
                        </ul>
                      </>
                    ) : null}
                    <p>Customer acceptance, handover delivery, invoicing, and payment are tracked separately.</p>
                  </div>
                ) : null}
                {Object.keys(approvalReview.item.decision?.preview || {}).length ? (
                  <div className="approval-review-section">
                    <h3>Submitted details</h3>
                    <dl>
                      {Object.entries(approvalReview.item.decision.preview)
                        .filter(([key, value]) => key !== 'completionReadiness'
                          && !(approvalReview.item.targetType === 'submittal_record'
                            && ['title', 'packageName', 'taskScope'].includes(key))
                          && !(approvalReview.item.targetType === 'client_selection'
                            && ['title', 'options', 'dueAt', 'rationale', 'clientVisibleAfterApproval', 'sourceBound', 'conversationOrigin'].includes(key))
                          && value !== null && value !== undefined && value !== '')
                        .map(([key, value]) => (
                          <div key={key}>
                            <dt>{formatStatus(key)}</dt>
                            <dd>{typeof value === 'object' ? JSON.stringify(value) : String(value)}</dd>
                          </div>
                        ))}
                    </dl>
                  </div>
                ) : null}
                {approvalReview.item.decision?.safeguards?.length ? (
                  <div className="approval-review-section approval-review-safeguards">
                    <h3>Safeguards</h3>
                    <ul>
                      {approvalReview.item.decision.safeguards.map((safeguard) => (
                        <li key={safeguard}>{safeguard}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                <label className="approval-review-reason">
                  Reviewer reason
                  {approvalReview.status === 'rejected' || approvalReview.item.data?.requiresExceptionOverride ? ' (required)' : ''}
                  <textarea
                    required={approvalReview.status === 'rejected' || approvalReview.item.data?.requiresExceptionOverride === true}
                    value={approvalReason}
                    onChange={(event) => setApprovalReason(event.target.value)}
                    placeholder={
                      approvalReview.status === 'rejected'
                        ? 'Explain what must change before this can be resubmitted.'
                        : approvalReview.item.data?.requiresExceptionOverride
                          ? 'Explain why the retained match exceptions are accepted.'
                          : 'Record what was verified before approval.'
                    }
                  />
                </label>
                <p className="workflow-note">
                  This action updates the local ledger and audit trail only. The listed safeguards remain in force after resolution.
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeApprovalReview}>
                  Cancel
                </button>
                <button
                  className={approvalReview.status === 'approved' ? 'primary-button' : 'danger-button'}
                  disabled={
                    submitting ||
                    ((approvalReview.status === 'rejected' || approvalReview.item.data?.requiresExceptionOverride === true) &&
                      !approvalReason.trim())
                  }
                >
                  <ShieldCheck size={16} />
                  {submitting ? 'Resolving...' : approvalReview.status === 'approved' ? 'Confirm approval' : 'Confirm rejection'}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function ClientEditorModalDialog({ clientDraft, clientEditor, closeClientEditor, ot, setClientDraft, submitClientEditor, submitting }) {
  return (
<div className="modal-backdrop" role="presentation">
          <section
            className="modal client-editor-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-editor-title"
            data-testid="client-editor-modal"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Retained client identity')}</p>
                <h2 id="client-editor-title">{clientEditor.mode === 'edit' ? ot('Edit client') : ot('New client')}</h2>
                <p>{ot('Contact, billing, and electronic invoicing data used by future controlled records.')}</p>
              </div>
              <button className="icon-button" type="button" aria-label={ot('Close client editor')} onClick={closeClientEditor}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitClientEditor}>
              <div className="form-grid client-editor-form">
                <label>
                  {ot('Contact name')}
                  <input autoFocus required minLength="2" maxLength="160" value={clientDraft.name} onChange={(event) => setClientDraft({ ...clientDraft, name: event.target.value })} />
                </label>
                <label>
                  {ot('Client type')}
                  <select value={clientDraft.clientType} onChange={(event) => setClientDraft({ ...clientDraft, clientType: event.target.value })}>
                    <option value="business">{ot('Business')}</option>
                    <option value="consumer">{ot('Consumer')}</option>
                    <option value="public">{ot('Public body')}</option>
                    <option value="property_manager">{ot('Property manager')}</option>
                    <option value="other">{ot('Other')}</option>
                  </select>
                </label>
                <label className="form-span">
                  {ot('Legal or company name')}
                  <input maxLength="200" value={clientDraft.company} onChange={(event) => setClientDraft({ ...clientDraft, company: event.target.value })} />
                </label>
                <label>
                  {ot('Contact email')}
                  <input type="email" maxLength="254" value={clientDraft.email} onChange={(event) => setClientDraft({ ...clientDraft, email: event.target.value })} />
                </label>
                <label>
                  {ot('Billing email')}
                  <input type="email" maxLength="254" value={clientDraft.billingEmail} onChange={(event) => setClientDraft({ ...clientDraft, billingEmail: event.target.value })} />
                </label>
                <label>
                  {ot('Phone')}
                  <input type="tel" maxLength="80" value={clientDraft.phone} onChange={(event) => setClientDraft({ ...clientDraft, phone: event.target.value })} />
                </label>
                <label>
                  {ot('Preferred language')}
                  <select value={clientDraft.preferredLanguage} onChange={(event) => setClientDraft({ ...clientDraft, preferredLanguage: event.target.value })}>
                    <option value="nl">{ot('Dutch')}</option>
                    <option value="en">{ot('English')}</option>
                    <option value="de">{ot('German')}</option>
                    <option value="fr">{ot('French')}</option>
                  </select>
                </label>
                <label className="form-span">
                  {ot('Street address')}
                  <input maxLength="300" value={clientDraft.address} onChange={(event) => setClientDraft({ ...clientDraft, address: event.target.value })} />
                </label>
                <label>
                  {ot('Postal code')}
                  <input maxLength="30" value={clientDraft.postalCode} onChange={(event) => setClientDraft({ ...clientDraft, postalCode: event.target.value })} />
                </label>
                <label>
                  City
                  <input maxLength="120" value={clientDraft.city} onChange={(event) => setClientDraft({ ...clientDraft, city: event.target.value })} />
                </label>
                <label>
                  {ot('Country code')}
                  <input required minLength="2" maxLength="2" value={clientDraft.country} onChange={(event) => setClientDraft({ ...clientDraft, country: event.target.value.toUpperCase() })} />
                </label>
                <label>
                  {ot('KVK / registration number')}
                  <input maxLength="80" value={clientDraft.registrationNumber} onChange={(event) => setClientDraft({ ...clientDraft, registrationNumber: event.target.value })} />
                </label>
                <label>
                  {ot('VAT number')}
                  <input maxLength="80" value={clientDraft.vatNumber} onChange={(event) => setClientDraft({ ...clientDraft, vatNumber: event.target.value })} />
                </label>
                <label>
                  {ot('Electronic address scheme')}
                  <input maxLength="20" placeholder="0106 for KVK or 0190 for OIN" value={clientDraft.electronicAddressScheme} onChange={(event) => setClientDraft({ ...clientDraft, electronicAddressScheme: event.target.value })} />
                </label>
                <label>
                  {ot('Electronic address')}
                  <input maxLength="120" value={clientDraft.electronicAddress} onChange={(event) => setClientDraft({ ...clientDraft, electronicAddress: event.target.value })} />
                </label>
                <label className="form-span">
                  {ot('Internal notes')}
                  <textarea maxLength="4000" value={clientDraft.notes} onChange={(event) => setClientDraft({ ...clientDraft, notes: event.target.value })} />
                </label>
                <p className="workflow-note form-span">
                  {ot('Saving changes the client master only. Existing quote, invoice, handover, and communication snapshots remain unchanged, and no external action is performed.')}
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeClientEditor}>{ot('Cancel')}</button>
                <button
                  className="primary-button"
                  disabled={
                    submitting
                    || clientDraft.name.trim().length < 2
                    || clientDraft.country.trim().length !== 2
                    || Boolean(clientDraft.electronicAddressScheme.trim()) !== Boolean(clientDraft.electronicAddress.trim())
                  }
                >
                  <BadgeCheck size={16} />
                  {submitting ? ot('Retaining...') : clientEditor.mode === 'edit' ? ot('Update client') : ot('Retain client')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function TakeoffCreateModalDialog({ closeTakeoffDialog, ot, selectedJob, setTakeoffDraft, submitTakeoff, submitting, takeoffDraft }) {
  return (
<div className="modal-backdrop commercial-backdrop" role="presentation">
          <section
            className="modal takeoff-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="takeoff-create-title"
            data-testid="takeoff-create-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeTakeoffDialog()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Measured scope')}</p>
                <h2 id="takeoff-create-title">{ot('New quantity takeoff')}</h2>
                <p>{selectedJob?.title} / {ot('internal draft')}</p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close quantity takeoff')} onClick={closeTakeoffDialog}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitTakeoff}>
              <div className="takeoff-modal-body form-grid">
                <label className="form-span">
                  {ot('Takeoff title')}
                  <input
                    autoFocus
                    required
                    minLength="2"
                    maxLength="160"
                    value={takeoffDraft.title}
                    onChange={(event) => setTakeoffDraft({ ...takeoffDraft, title: event.target.value })}
                  />
                </label>
                <label>
                  {ot('VAT rate (%)')}
                  <input
                    required
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={takeoffDraft.taxRate}
                    onChange={(event) => setTakeoffDraft({ ...takeoffDraft, taxRate: event.target.value })}
                  />
                </label>
                <label className="form-span">
                  {ot('Internal notes')}
                  <textarea
                    maxLength="4000"
                    value={takeoffDraft.notes}
                    onChange={(event) => setTakeoffDraft({ ...takeoffDraft, notes: event.target.value })}
                    placeholder={ot('Record drawing revisions, survey assumptions, exclusions, or estimator context.')}
                  />
                </label>
                <p className="workflow-note form-span">{ot('This creates an empty internal measurement sheet. It does not create or issue an estimate.')}</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeTakeoffDialog}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || takeoffDraft.title.trim().length < 2}>
                  <Ruler size={16} />
                  {submitting ? ot('Saving...') : ot('Retain takeoff')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function TakeoffItemModalDialog({ changeTakeoffMeasurementType, closeTakeoffDialog, ot, setTakeoffItemDraft, submitTakeoffItem, submitting, takeoffDialog, takeoffItemDraft, takeoffItemDraftReady, takeoffPreviewCost, takeoffPreviewQuantity, takeoffPreviewSell }) {
  return (
<div className="modal-backdrop commercial-backdrop" role="presentation">
          <section
            className="modal takeoff-item-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="takeoff-item-title"
            data-testid="takeoff-item-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeTakeoffDialog()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Server-calculated measurement')}</p>
                <h2 id="takeoff-item-title">{takeoffDialog.mode === 'edit_item' ? ot('Edit measurement') : ot('Add measurement')}</h2>
                <p>{takeoffDialog.takeoff.title}</p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close takeoff measurement')} onClick={closeTakeoffDialog}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitTakeoffItem}>
              <div className="takeoff-modal-body">
                <div className="form-grid takeoff-item-form">
                  <label className="form-span">
                    {ot('Description')}
                    <input
                      autoFocus
                      required
                      minLength="2"
                      maxLength="240"
                      value={takeoffItemDraft.description}
                      onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, description: event.target.value })}
                    />
                  </label>
                  <label>
                    {ot('Category')}
                    <select value={takeoffItemDraft.category} onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, category: event.target.value })}>
                      <option value="material">{ot('Material')}</option>
                      <option value="labor">{ot('Labor')}</option>
                      <option value="equipment">{ot('Equipment')}</option>
                      <option value="subcontract">{ot('Subcontract')}</option>
                      <option value="other">{ot('Other')}</option>
                    </select>
                  </label>
                  <label>
                    {ot('Measurement type')}
                    <select value={takeoffItemDraft.measurementType} onChange={(event) => changeTakeoffMeasurementType(event.target.value)}>
                      <option value="count">{ot('Count')}</option>
                      <option value="linear">{ot('Linear')}</option>
                      <option value="area">{ot('Area')}</option>
                      <option value="volume">{ot('Volume')}</option>
                      <option value="manual">{ot('Manual quantity')}</option>
                    </select>
                  </label>
                  {takeoffItemDraft.measurementType === 'manual' ? (
                    <label>
                      {ot('Quantity')}
                      <input required type="number" min="0.0001" max="1000000000" step="0.0001" value={takeoffItemDraft.quantity} onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, quantity: event.target.value })} />
                    </label>
                  ) : (
                    <label>
                      {ot('Count')}
                      <input required type="number" min="0.0001" max="1000000" step="0.0001" value={takeoffItemDraft.count} onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, count: event.target.value })} />
                    </label>
                  )}
                  {['linear', 'area', 'volume'].includes(takeoffItemDraft.measurementType) ? (
                    <label>
                      {ot('Length (m)')}
                      <input required type="number" min="0.0001" max="1000000" step="0.0001" value={takeoffItemDraft.length} onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, length: event.target.value })} />
                    </label>
                  ) : null}
                  {['area', 'volume'].includes(takeoffItemDraft.measurementType) ? (
                    <label>
                      {ot('Width (m)')}
                      <input required type="number" min="0.0001" max="1000000" step="0.0001" value={takeoffItemDraft.width} onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, width: event.target.value })} />
                    </label>
                  ) : null}
                  {takeoffItemDraft.measurementType === 'volume' ? (
                    <label>
                      {ot('Height (m)')}
                      <input required type="number" min="0.0001" max="1000000" step="0.0001" value={takeoffItemDraft.height} onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, height: event.target.value })} />
                    </label>
                  ) : null}
                  <label>
                    {ot('Waste (%)')}
                    <input required type="number" min="0" max="1000" step="0.01" value={takeoffItemDraft.wastePercent} onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, wastePercent: event.target.value })} />
                  </label>
                  <label>
                    {ot('Unit')}
                    <input required maxLength="24" value={takeoffItemDraft.unit} onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, unit: event.target.value })} />
                  </label>
                  <label>
                    {ot('Unit cost')}
                    <input required type="number" min="0" max="1000000000" step="0.01" value={takeoffItemDraft.unitCost} onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, unitCost: event.target.value })} />
                  </label>
                  <label>
                    {ot('Unit sell price')}
                    <input required type="number" min="0" max="1000000000" step="0.01" value={takeoffItemDraft.unitPrice} onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, unitPrice: event.target.value })} />
                  </label>
                  <label>
                    {ot('Cost code')}
                    <input maxLength="80" value={takeoffItemDraft.costCode} onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, costCode: event.target.value })} />
                  </label>
                  <label>
                    {ot('WBS code')}
                    <input
                      required
                      maxLength="80"
                      pattern="[A-Za-z0-9][A-Za-z0-9\-]{0,11}(\.[A-Za-z0-9][A-Za-z0-9\-]{0,11}){0,7}"
                      title={ot('Use one to eight dot-separated work-breakdown segments, for example 01.20.')}
                      value={takeoffItemDraft.wbsCode}
                      onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, wbsCode: event.target.value })}
                    />
                  </label>
                  <label>
                    {ot('Work package')}
                    <input
                      required
                      minLength="2"
                      maxLength="120"
                      value={takeoffItemDraft.workPackage}
                      onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, workPackage: event.target.value })}
                    />
                  </label>
                  <label>
                    {ot('Drawing / source reference')}
                    <input maxLength="240" value={takeoffItemDraft.sourceReference} onChange={(event) => setTakeoffItemDraft({ ...takeoffItemDraft, sourceReference: event.target.value })} />
                  </label>
                </div>
                <div className="takeoff-preview" aria-label={ot('Calculated measurement preview')}>
                  <div><span>{ot('Quantity')}</span><strong>{takeoffPreviewQuantity || 0} {takeoffItemDraft.unit}</strong></div>
                  <div><span>{ot('Extended cost')}</span><strong>{currency.format(takeoffPreviewCost)}</strong></div>
                  <div><span>{ot('Extended sell')}</span><strong>{currency.format(takeoffPreviewSell)}</strong></div>
                </div>
                <p className="workflow-note">{ot('The ledger recalculates quantity, cost, and sell totals. Browser preview values are not authoritative.')}</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeTakeoffDialog}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || !takeoffItemDraftReady}>
                  <Ruler size={16} />
                  {submitting ? ot('Saving...') : takeoffDialog.mode === 'edit_item' ? ot('Recalculate measurement') : ot('Retain measurement')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function TakeoffRemoveModalDialog({ closeTakeoffDialog, ot, removeTakeoffItem, submitting, takeoffDialog }) {
  return (
<div className="modal-backdrop commercial-backdrop" role="presentation">
          <section
            className="modal takeoff-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="takeoff-remove-title"
            data-testid="takeoff-remove-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeTakeoffDialog()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Draft correction')}</p>
                <h2 id="takeoff-remove-title">{ot('Remove measurement?')}</h2>
                <p>{takeoffDialog.item.description}</p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close measurement removal')} onClick={closeTakeoffDialog}><X size={18} /></button>
            </div>
            <div className="takeoff-modal-body">
              <p className="workflow-note">{ot('The draft sheet will be recalculated. This does not affect any converted estimate.')}</p>
            </div>
            <div className="modal-actions">
              <button type="button" className="secondary-button" onClick={closeTakeoffDialog}>{ot('Cancel')}</button>
              <button type="button" className="danger-button" disabled={submitting} onClick={removeTakeoffItem}>
                <X size={16} />
                {submitting ? ot('Removing...') : ot('Remove measurement')}
              </button>
            </div>
          </section>
        </div>
  )
}

export function TakeoffConvertModalDialog({ closeTakeoffDialog, convertTakeoff, ot, selectedJob, setTakeoffConversionDraft, submitting, takeoffConversionDraft, takeoffDialog }) {
  return (
<div className="modal-backdrop commercial-backdrop" role="presentation">
          <section
            className="modal takeoff-confirm-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="takeoff-convert-title"
            data-testid="takeoff-convert-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeTakeoffDialog()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Immutable estimate basis')}</p>
                <h2 id="takeoff-convert-title">{ot('Prepare estimate')}</h2>
                <p>{takeoffDialog.takeoff.title}</p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close estimate preparation')} onClick={closeTakeoffDialog}><X size={18} /></button>
            </div>
            <form onSubmit={convertTakeoff}>
              <div className="takeoff-modal-body">
                <div className="commercial-draft-pricing" data-testid="takeoff-conversion-pricing-basis">
                  <GitBranch size={16} />
                  <div>
                    <strong>{ot(formatStatus(selectedJob?.pricingBasis?.currentDecision?.selectedModel || 'review'))}</strong>
                    <span>{ot('Decision v{version} / {score}% fixed-price readiness / source current', { version: selectedJob?.pricingBasis?.currentDecision?.versionNumber || '-', score: selectedJob?.pricingBasis?.currentDecision?.score || 0 })}</span>
                  </div>
                </div>
                <div className="takeoff-preview takeoff-convert-preview">
                  <div><span>{ot('Work packages')}</span><strong>{takeoffDialog.takeoff.workBreakdown?.packageCount || 0}</strong></div>
                  <div><span>{ot('Measurements')}</span><strong>{takeoffDialog.takeoff.itemCount}</strong></div>
                  <div><span>{ot('Cost')}</span><strong>{currency.format(takeoffDialog.takeoff.totalCost || 0)}</strong></div>
                  <div><span>{ot('Estimate net')}</span><strong>{currency.format(takeoffDialog.takeoff.subtotal || 0)}</strong></div>
                </div>
                <div className="form-grid">
                  <label>
                    {ot('Valid until')}
                    <input autoFocus required type="date" min={new Date().toISOString().slice(0, 10)} value={takeoffConversionDraft.validUntil} onChange={(event) => setTakeoffConversionDraft({ ...takeoffConversionDraft, validUntil: event.target.value })} />
                  </label>
                  <label className="form-span">
                    {ot('Estimate notes')}
                    <textarea maxLength="4000" value={takeoffConversionDraft.notes} onChange={(event) => setTakeoffConversionDraft({ ...takeoffConversionDraft, notes: event.target.value })} placeholder={ot('Add reviewer context, exclusions, or estimate assumptions.')} />
                  </label>
                </div>
                <p className="workflow-note">{ot('Conversion seals the WBS, measurements, and package rollups with a SHA-256 snapshot and makes them read-only. It creates an internal quote approval only.')}</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeTakeoffDialog}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || !takeoffConversionDraft.validUntil}>
                  <ShieldCheck size={16} />
                  {submitting ? ot('Preparing...') : ot('Seal and prepare estimate')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function CommercialDraftModalDialog({ activeCommercialDraft, addCommercialLineItem, changeOrderDraft, closeCommercialDialog, commercialDraftMode, commercialDraftNet, commercialDraftReady, commercialDraftTax, commercialDraftTotal, ot, quoteDraft, removeCommercialLineItem, selectedJob, setChangeOrderDraft, setQuoteDraft, submitCommercialDraft, submitting, updateCommercialLineItem }) {
  return (
<div className="modal-backdrop commercial-backdrop" role="presentation">
          <section
            className="modal commercial-draft-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="commercial-draft-title"
            data-testid="commercial-draft-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeCommercialDialog()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Approval-gated commercial record')}</p>
                <h2 id="commercial-draft-title">
                  {commercialDraftMode === 'quote'
                    ? selectedJob?.pricingBasis?.currentDecision?.selectedModel === 'time_and_materials' ? ot('New T&M budget estimate') : ot('New fixed-price estimate')
                    : ot('New scope change')}
                </h2>
                <p>{selectedJob?.title} / {ot('server-derived totals')}</p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close commercial draft')} onClick={closeCommercialDialog}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitCommercialDraft}>
              <div className="commercial-draft-body">
                {commercialDraftMode === 'quote' ? (
                  <>
                    <div className="commercial-draft-pricing" data-testid="commercial-draft-scope">
                      <ClipboardList size={16} />
                      <div>
                        <strong>{selectedJob?.commercialScope?.currentRevision?.title || ot('Commercial scope required')}</strong>
                        <span>
                          {ot('Revision v{version} / {inclusions} inclusions / {exclusions} exclusions / {allowances} allowances / source current', { version: selectedJob?.commercialScope?.currentRevision?.versionNumber || '-', inclusions: selectedJob?.commercialScope?.currentRevision?.snapshot?.inclusions?.length || 0, exclusions: selectedJob?.commercialScope?.currentRevision?.snapshot?.exclusions?.length || 0, allowances: selectedJob?.commercialScope?.currentRevision?.snapshot?.allowances?.length || 0 })}
                        </span>
                      </div>
                    </div>
                    <div className="commercial-draft-pricing" data-testid="commercial-draft-pricing-basis">
                      <GitBranch size={16} />
                      <div>
                        <strong>{ot(formatStatus(selectedJob?.pricingBasis?.currentDecision?.selectedModel || 'review'))}</strong>
                        <span>
                          {selectedJob?.pricingBasis?.currentDecision?.selectedModel === 'time_and_materials'
                            ? ot('Amounts form a budget estimate; actual billing requires retained time, material, rate, and work evidence.')
                            : ot('The price applies to the stated scope, assumptions, exclusions, and allowances; approved changes remain separate.')}
                        </span>
                      </div>
                    </div>
                    <div className="form-grid compact-form">
                      <label>
                        {ot('Valid until')}
                        <input
                          autoFocus
                          required
                          type="date"
                          min={new Date().toISOString().slice(0, 10)}
                          value={quoteDraft.validUntil}
                          onChange={(event) => setQuoteDraft({ ...quoteDraft, validUntil: event.target.value })}
                        />
                      </label>
                      <label>
                        {ot('VAT rate (%)')}
                        <input
                          required
                          type="number"
                          min="0"
                          max="100"
                          step="0.01"
                          value={quoteDraft.taxRate}
                          onChange={(event) => setQuoteDraft({ ...quoteDraft, taxRate: event.target.value })}
                        />
                      </label>
                    </div>
                  </>
                ) : (
                  <div className="form-grid compact-form">
                    <label className="form-span">
                      {ot('Change title')}
                      <input
                        autoFocus
                        required
                        minLength="2"
                        value={changeOrderDraft.title}
                        onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, title: event.target.value })}
                        placeholder={ot('Describe the commercial decision')}
                      />
                    </label>
                    <label className="form-span">
                      {ot('Scope change')}
                      <textarea
                        required
                        minLength="3"
                        value={changeOrderDraft.scopeDelta}
                        onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, scopeDelta: event.target.value })}
                        placeholder={ot('Record added, omitted, or revised scope.')}
                      />
                    </label>
                    {changeOrderDraft.supersedesChangeOrderId ? (
                      <div className="form-span commercial-source-notice" role="status">
                        <ShieldCheck size={16} />
                        <div>
                          <span>{ot('Preparing the next formal revision of the client-returned variation. The prior revision is superseded only after this revision is approved.')}</span>
                          {changeOrderDraft.clientRevisionRequest ? <blockquote><strong>{ot(changeOrderDraft.clientRevisionDecision === 'rejected' ? 'Client rejected' : 'Client requested changes')}</strong>{changeOrderDraft.clientRevisionRequest}</blockquote> : null}
                        </div>
                      </div>
                    ) : null}
                    <label>
                      {ot('Variation type')}
                      <select value={changeOrderDraft.variationType} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, variationType: event.target.value })}>
                        <option value="client_request">{ot('Client request')}</option>
                        <option value="design_change">{ot('Design change')}</option>
                        <option value="unforeseen_condition">{ot('Unforeseen condition')}</option>
                        <option value="regulatory_change">{ot('Regulatory change')}</option>
                        <option value="allowance_reconciliation">{ot('Allowance reconciliation')}</option>
                        <option value="contractor_proposal">{ot('Contractor proposal')}</option>
                        <option value="error_correction">{ot('Error correction')}</option>
                        <option value="other">{ot('Other')}</option>
                      </select>
                    </label>
                    <label>
                      {ot('Initiated by')}
                      <select value={changeOrderDraft.initiatedBy} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, initiatedBy: event.target.value })}>
                        <option value="client">{ot('Client')}</option>
                        <option value="contractor">{ot('Contractor')}</option>
                        <option value="designer">{ot('Designer')}</option>
                        <option value="authority">{ot('Authority')}</option>
                        <option value="supplier">{ot('Supplier')}</option>
                        <option value="site_condition">{ot('Site condition')}</option>
                        <option value="other">{ot('Other')}</option>
                      </select>
                    </label>
                    <label className="form-span">
                      {ot('Cause')}
                      <textarea required minLength="8" maxLength="2000" value={changeOrderDraft.cause} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, cause: event.target.value })} placeholder={ot('What event or instruction created this variation?')} />
                    </label>
                    <label className="form-span">
                      {ot('Contractual justification')}
                      <textarea required minLength="8" maxLength="2000" value={changeOrderDraft.justification} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, justification: event.target.value })} placeholder={ot('Why is this outside or different from the retained contract scope?')} />
                    </label>
                    <label>
                      {ot('Reference quote')}
                      <select
                        value={changeOrderDraft.quoteId}
                        onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, quoteId: event.target.value })}
                      >
                        <option value="">{ot('Current retained contract')}</option>
                        {(selectedJob?.quotes || [])
                          .filter((quote) => quote.status === 'accepted')
                          .map((quote) => (
                            <option key={quote.id} value={quote.id}>
                              {ot(formatStatus(quote.status))} / {currency.format(quote.subtotal || 0)} {ot('net')}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label>
                      {ot('Contract / clause reference')}
                      <input required minLength="3" maxLength="240" value={changeOrderDraft.contractReference} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, contractReference: event.target.value })} />
                    </label>
                    <label>
                      {ot('Notice reference')}
                      <input maxLength="240" value={changeOrderDraft.noticeReference} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, noticeReference: event.target.value })} placeholder={ot('Instruction, RFI, email, or notice ID')} />
                    </label>
                    <label>
                      {ot('If no notice, explain why')}
                      <input required={!changeOrderDraft.noticeReference.trim()} minLength="8" maxLength="500" value={changeOrderDraft.noticeNotApplicableReason} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, noticeNotApplicableReason: event.target.value })} />
                    </label>
                    <label>
                      {ot('Requested on')}
                      <input required type="date" value={changeOrderDraft.requestedAt} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, requestedAt: event.target.value })} />
                    </label>
                    <label>
                      {ot('Response due')}
                      <input type="date" min={changeOrderDraft.requestedAt} value={changeOrderDraft.responseDueAt} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, responseDueAt: event.target.value })} />
                    </label>
                    <label>
                      {ot('Schedule impact (days)')}
                      <input
                        required
                        type="number"
                        min="-3650"
                        max="3650"
                        step="1"
                        value={changeOrderDraft.scheduleDeltaDays}
                        onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, scheduleDeltaDays: event.target.value })}
                      />
                    </label>
                    <label className="form-span">
                      {ot('Schedule impact basis')}
                      <textarea required minLength="8" maxLength="2000" value={changeOrderDraft.scheduleImpactNarrative} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, scheduleImpactNarrative: event.target.value })} placeholder={ot('Explain the proposed effect or why no date change is needed.')} />
                    </label>
                    <label>
                      {ot('Risk impact')}
                      <select aria-label={ot('Risk impact')} value={changeOrderDraft.riskImpact} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, riskImpact: event.target.value })}>
                        <option value="none">{ot('None')}</option>
                        <option value="low">{ot('Low')}</option>
                        <option value="medium">{ot('Medium')}</option>
                        <option value="high">{ot('High')}</option>
                        <option value="critical">{ot('Critical')}</option>
                      </select>
                    </label>
                    <label>
                      {ot('VAT rate (%)')}
                      <input
                        required
                        type="number"
                        min="0"
                        max="100"
                        step="0.01"
                        value={changeOrderDraft.taxRate}
                        onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, taxRate: event.target.value })}
                      />
                    </label>
                    <label className="form-span">
                      {ot('Risk impact statement')}
                      <textarea required minLength="8" maxLength="2000" value={changeOrderDraft.riskImpactStatement} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, riskImpactStatement: event.target.value })} />
                    </label>
                    <label>
                      {ot('Assumptions (one per line)')}
                      <textarea required value={changeOrderDraft.assumptions} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, assumptions: event.target.value })} />
                    </label>
                    <label>
                      {ot('Exclusions (one per line)')}
                      <textarea required value={changeOrderDraft.exclusions} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, exclusions: event.target.value })} />
                    </label>
                    <label className="form-span">
                      {ot('Evidence references (one per line)')}
                      <textarea value={changeOrderDraft.evidenceReferences} onChange={(event) => setChangeOrderDraft({ ...changeOrderDraft, evidenceReferences: event.target.value })} placeholder={ot('Drawing revision, instruction, site photo, RFI, or retained document reference')} />
                    </label>
                  </div>
                )}
                <div className="commercial-line-heading">
                  <div>
                    <h3>{ot('Line items')}</h3>
                    <p>{ot('Amounts are recalculated by the ledger.')}</p>
                  </div>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={(activeCommercialDraft.lineItems || []).length >= 50}
                    onClick={() => addCommercialLineItem(commercialDraftMode)}
                  >
                    <Plus size={15} />
                    {ot('Add line')}
                  </button>
                </div>
                <div className="commercial-line-items">
                  {activeCommercialDraft.lineItems.map((item, index) => (
                    <div className="commercial-line-item" key={index}>
                      <label>
                        {ot('Description')}
                        <input
                          required
                          minLength="2"
                          maxLength="240"
                          value={item.description}
                          onChange={(event) => updateCommercialLineItem(commercialDraftMode, index, 'description', event.target.value)}
                        />
                      </label>
                      <label>
                        {ot('Quantity')}
                        <input
                          required
                          type="number"
                          min="0.01"
                          max="1000000"
                          step="0.01"
                          value={item.quantity}
                          onChange={(event) => updateCommercialLineItem(commercialDraftMode, index, 'quantity', event.target.value)}
                        />
                      </label>
                      <label>
                        {ot('Unit price')}
                        <input
                          required
                          type="number"
                          min={commercialDraftMode === 'quote' ? '0' : '-1000000000'}
                          max="1000000000"
                          step="0.01"
                          value={item.unitPrice}
                          onChange={(event) => updateCommercialLineItem(commercialDraftMode, index, 'unitPrice', event.target.value)}
                        />
                      </label>
                      <label>
                        {ot('Cost code')}
                        <input
                          maxLength="80"
                          value={item.costCode}
                          onChange={(event) => updateCommercialLineItem(commercialDraftMode, index, 'costCode', event.target.value)}
                        />
                      </label>
                      <button
                        type="button"
                        className="icon-button commercial-line-remove"
                        aria-label={ot('Remove line {number}', { number: index + 1 })}
                        disabled={activeCommercialDraft.lineItems.length === 1}
                        onClick={() => removeCommercialLineItem(commercialDraftMode, index)}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="commercial-total-strip" aria-label={ot('Commercial totals')}>
                  <span>
                    {commercialDraftMode === 'quote' && selectedJob?.pricingBasis?.currentDecision?.selectedModel === 'time_and_materials' ? ot('Budget net') : ot('Net')} <strong>{currency.format(commercialDraftNet)}</strong>
                  </span>
                  <span>
                    {ot('VAT')} <strong>{currency.format(commercialDraftTax)}</strong>
                  </span>
                  <span>
                    {commercialDraftMode === 'quote' && selectedJob?.pricingBasis?.currentDecision?.selectedModel === 'time_and_materials' ? ot('Budget gross') : ot('Gross')} <strong>{currency.format(commercialDraftTotal)}</strong>
                  </span>
                </div>
                <label>
                  {ot('Internal notes')}
                  <textarea
                    maxLength="4000"
                    value={activeCommercialDraft.notes}
                    onChange={(event) =>
                      commercialDraftMode === 'quote'
                        ? setQuoteDraft({ ...quoteDraft, notes: event.target.value })
                        : setChangeOrderDraft({ ...changeOrderDraft, notes: event.target.value })
                    }
                    placeholder={ot('Record assumptions, exclusions, and reviewer context.')}
                  />
                </label>
                <p className="workflow-note">
                  {ot('Saving creates an internal approval request. It does not send a quote, commit scope, alter contract value, or contact the client.')}
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeCommercialDialog}>
                  {ot('Cancel')}
                </button>
                <button className="primary-button" disabled={submitting || !commercialDraftReady}>
                  <ShieldCheck size={16} />
                  {submitting
                    ? ot('Saving...')
                    : commercialDraftMode === 'quote'
                      ? selectedJob?.pricingBasis?.currentDecision?.selectedModel === 'time_and_materials' ? ot('Retain T&M budget') : ot('Retain fixed-price estimate')
                      : ot('Request change approval')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function CommercialAcceptanceModalDialog({ closeCommercialDialog, commercialAcceptance, commercialAcceptanceDraft, ot, setCommercialAcceptanceDraft, submitCommercialAcceptance, submitting }) {
  return (
<div className="modal-backdrop commercial-backdrop" role="presentation">
          <section
            className="modal commercial-acceptance-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="commercial-acceptance-title"
            data-testid="commercial-acceptance-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeCommercialDialog()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Client evidence verification')}</p>
                <h2 id="commercial-acceptance-title">{ot('Record client acceptance')}</h2>
                <p>
                  {commercialAcceptance.type === 'quote'
                    ? ot('Quote {amount} net', { amount: currency.format(commercialAcceptance.record.subtotal || 0) })
                    : commercialAcceptance.record.title}
                </p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close client acceptance')} onClick={closeCommercialDialog}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitCommercialAcceptance}>
              <div className="form-grid commercial-acceptance-form">
                <label>
                  {ot('Accepted on')}
                  <input
                    autoFocus
                    required
                    type="date"
                    max={new Date().toISOString().slice(0, 10)}
                    value={commercialAcceptanceDraft.acceptedAt}
                    onChange={(event) => setCommercialAcceptanceDraft({ ...commercialAcceptanceDraft, acceptedAt: event.target.value })}
                  />
                </label>
                <label className="form-span">
                  {ot('Evidence reference')}
                  <input
                    required
                    minLength="3"
                    maxLength="240"
                    value={commercialAcceptanceDraft.evidenceReference}
                    onChange={(event) =>
                      setCommercialAcceptanceDraft({ ...commercialAcceptanceDraft, evidenceReference: event.target.value })
                    }
                    placeholder={ot('Signed quote, portal decision, email, or document reference')}
                  />
                </label>
                <label className="form-span">
                  {ot('Verification notes')}
                  <textarea
                    maxLength="2000"
                    value={commercialAcceptanceDraft.notes}
                    onChange={(event) => setCommercialAcceptanceDraft({ ...commercialAcceptanceDraft, notes: event.target.value })}
                    placeholder={ot('Record where the evidence is retained and any conditions.')}
                  />
                </label>
                <p className="workflow-note form-span">
                  {ot('This request does not claim acceptance by itself. Contract value changes only after a separate approver verifies the retained evidence.')}
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeCommercialDialog}>
                  {ot('Cancel')}
                </button>
                <button className="primary-button" disabled={submitting || commercialAcceptanceDraft.evidenceReference.trim().length < 3}>
                  <ShieldCheck size={16} />
                  {submitting ? ot('Recording...') : ot('Request verification')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function CommercialDeliveryModalDialog({ closeCommercialDialog, commercialDelivery, commercialDeliveryDraft, ot, setCommercialDeliveryDraft, submitChangeOrderDelivery, submitting }) {
  return (
<div className="modal-backdrop commercial-backdrop" role="presentation">
          <section
            className="modal commercial-delivery-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="commercial-delivery-title"
            data-testid="commercial-delivery-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeCommercialDialog()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Verified delivery evidence')}</p>
                <h2 id="commercial-delivery-title">{ot('Record change-order delivery')}</h2>
                <p>
                  {commercialDelivery.changeOrder.data?.issuePackage?.issueReference || commercialDelivery.changeOrder.title} /{' '}
                  {commercialDelivery.communication.data?.recipient}
                </p>
              </div>
              <button type="button" className="icon-button" aria-label={ot('Close change-order delivery')} onClick={closeCommercialDialog}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitChangeOrderDelivery}>
              <div className="form-grid commercial-acceptance-form">
                <label>
                  {ot('Configured integration ID')}
                  <input
                    autoFocus
                    required
                    minLength="2"
                    maxLength="120"
                    value={commercialDeliveryDraft.integration}
                    onChange={(event) =>
                      setCommercialDeliveryDraft({ ...commercialDeliveryDraft, integration: event.target.value })
                    }
                    placeholder="verified_client_gateway"
                  />
                </label>
                <label>
                  {ot('Provider message ID')}
                  <input
                    required
                    minLength="3"
                    maxLength="240"
                    value={commercialDeliveryDraft.providerMessageId}
                    onChange={(event) =>
                      setCommercialDeliveryDraft({ ...commercialDeliveryDraft, providerMessageId: event.target.value })
                    }
                    placeholder="provider-change-000123"
                  />
                </label>
                <label>
                  {ot('Provider sent at')}
                  <input
                    required
                    type="datetime-local"
                    value={commercialDeliveryDraft.sentAt}
                    onChange={(event) => setCommercialDeliveryDraft({ ...commercialDeliveryDraft, sentAt: event.target.value })}
                  />
                </label>
                <p className="workflow-note form-span">
                  {ot('Record this only after the configured provider returns evidence for the approved recipient and exact package. Delivery does not authorize the work or alter contract value.')}
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" disabled={submitting} onClick={closeCommercialDialog}>
                  {ot('Cancel')}
                </button>
                <button
                  className="primary-button"
                  disabled={
                    submitting ||
                    commercialDeliveryDraft.integration.trim().length < 2 ||
                    commercialDeliveryDraft.providerMessageId.trim().length < 3 ||
                    !commercialDeliveryDraft.sentAt
                  }
                >
                  <MailCheck size={15} /> {submitting ? ot('Recording...') : ot('Record verified receipt')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function TaskActionModalDialog({ setTaskAction, setTaskActionNote, submitTaskTransition, submitting, taskAction, taskActionNote }) {
  return (
<div className="modal-backdrop task-action-backdrop" role="presentation">
          <section
            className="modal task-action-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="task-action-title"
            data-testid="task-action-modal"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Retained task lifecycle</p>
                <h2 id="task-action-title">{formatStatus(taskAction.status)} task</h2>
                <p>{taskAction.task.title}</p>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label="Close task action"
                disabled={submitting}
                onClick={() => {
                  setTaskAction(null)
                  setTaskActionNote('')
                }}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitTaskTransition}>
              <div className="form-grid">
                <label className="form-span">
                  Evidence and outcome
                  <textarea
                    required
                    minLength="4"
                    autoFocus
                    value={taskActionNote}
                    onChange={(event) => setTaskActionNote(event.target.value)}
                    placeholder="Record the work, blocker, or cancellation basis"
                  />
                </label>
              </div>
              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={submitting}
                  onClick={() => {
                    setTaskAction(null)
                    setTaskActionNote('')
                  }}
                >
                  Cancel
                </button>
                <button
                  className={taskAction.status === 'cancelled' ? 'danger-button' : 'primary-button'}
                  disabled={submitting || taskActionNote.trim().length < 4}
                >
                  {taskAction.status === 'completed' ? (
                    <Check size={16} />
                  ) : taskAction.status === 'blocked' ? (
                    <TriangleAlert size={16} />
                  ) : (
                    <Ban size={16} />
                  )}
                  {submitting ? 'Saving...' : `Mark ${formatStatus(taskAction.status)}`}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function OpportunityActivityModalDialog({ opportunityActivity, opportunityActivityDraft, setOpportunityActivity, setOpportunityActivityDraft, submitOpportunityActivity, submitting }) {
  return (
<div className="modal-backdrop opportunity-activity-backdrop" role="presentation">
          <section
            className="modal opportunity-activity-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="opportunity-activity-title"
            data-testid="opportunity-activity-modal"
          >
            <div className="modal-heading">
              <div>
                <h2 id="opportunity-activity-title">Add pipeline activity</h2>
                <p>{opportunityActivity.title} / internal ledger only</p>
              </div>
              <button className="icon-button" aria-label="Close opportunity activity" onClick={() => setOpportunityActivity(null)}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitOpportunityActivity}>
              <div className="form-grid opportunity-activity-form">
                <label>
                  Activity type
                  <select
                    value={opportunityActivityDraft.activityType}
                    onChange={(event) => setOpportunityActivityDraft({ ...opportunityActivityDraft, activityType: event.target.value })}
                  >
                    <option value="follow_up">Follow-up</option>
                    <option value="qualification">Qualification</option>
                    <option value="site_visit">Site visit</option>
                    <option value="estimate_review">Estimate review</option>
                    <option value="note">Note</option>
                  </select>
                </label>
                <label>
                  Due
                  <input
                    type="datetime-local"
                    value={opportunityActivityDraft.dueAt}
                    onChange={(event) => setOpportunityActivityDraft({ ...opportunityActivityDraft, dueAt: event.target.value })}
                  />
                </label>
                <label className="form-span">
                  Summary
                  <input
                    required
                    minLength="3"
                    value={opportunityActivityDraft.summary}
                    onChange={(event) => setOpportunityActivityDraft({ ...opportunityActivityDraft, summary: event.target.value })}
                    placeholder="Confirm site visit availability"
                  />
                </label>
                <label className="form-span">
                  Internal notes
                  <textarea
                    value={opportunityActivityDraft.notes}
                    onChange={(event) => setOpportunityActivityDraft({ ...opportunityActivityDraft, notes: event.target.value })}
                    placeholder="Context for the office. This does not send a message."
                  />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setOpportunityActivity(null)}>
                  Cancel
                </button>
                <button className="primary-button" disabled={submitting || opportunityActivityDraft.summary.trim().length < 3}>
                  {submitting ? 'Saving...' : 'Retain activity'}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function BidPackageModalDialog({ bidPackageDraft, data, ot, setBidPackageDraft, setBidPackageEditor, submitBidPackage, submitting }) {
  return (
<div className="modal-backdrop bid-package-backdrop" role="presentation">
          <section className="modal bid-package-modal" role="dialog" aria-modal="true" aria-labelledby="bid-package-modal-title" data-testid="bid-package-modal">
            <div className="modal-heading">
              <div>
                <h2 id="bid-package-modal-title">{ot('New bid package')}</h2>
                <p>{ot('Retain an internal tender comparison. No invitations are sent from this workflow.')}</p>
              </div>
              <button className="icon-button" aria-label={ot('Close bid package')} onClick={() => setBidPackageEditor(false)}><X size={18} /></button>
            </div>
            <form onSubmit={submitBidPackage}>
              <div className="form-grid bid-package-form">
                <label className="form-span">
                  {ot('Opportunity')}
                  <select required value={bidPackageDraft.opportunityId} onChange={(event) => setBidPackageDraft({ ...bidPackageDraft, opportunityId: event.target.value })}>
                    <option value="">{ot('Select an open opportunity')}</option>
                    {(data.opportunities || EMPTY_LIST).filter((opportunity) => !['won', 'lost', 'archived'].includes(opportunity.stage)).map((opportunity) => (
                      <option key={opportunity.id} value={opportunity.id}>{opportunity.title} / {opportunity.client?.name || ot('Client pending')}</option>
                    ))}
                  </select>
                </label>
                <label>
                  {ot('Package title')}
                  <input required minLength="2" value={bidPackageDraft.title} onChange={(event) => setBidPackageDraft({ ...bidPackageDraft, title: event.target.value })} placeholder={ot('Electrical installation package')} />
                </label>
                <label>
                  {ot('Trade')}
                  <input required minLength="2" value={bidPackageDraft.trade} onChange={(event) => setBidPackageDraft({ ...bidPackageDraft, trade: event.target.value })} placeholder={ot('Electrical')} />
                </label>
                <label>
                  {ot('Return due')}
                  <input required type="date" min={futureDateInput(1)} value={bidPackageDraft.dueAt} onChange={(event) => setBidPackageDraft({ ...bidPackageDraft, dueAt: event.target.value })} />
                </label>
                <label>
                  {ot('Owner')}
                  <input value={bidPackageDraft.ownerName} onChange={(event) => setBidPackageDraft({ ...bidPackageDraft, ownerName: event.target.value })} />
                </label>
                <label className="form-span">
                  {ot('Scope')}
                  <textarea required minLength="5" value={bidPackageDraft.scope} onChange={(event) => setBidPackageDraft({ ...bidPackageDraft, scope: event.target.value })} placeholder={ot('Retained scope, interfaces, evidence, assumptions, and return requirements.')} />
                </label>
                <fieldset className="form-span bid-partner-picker">
                  <legend>{ot('Internal bidder list')}</legend>
                  {(data.tradePartners || EMPTY_LIST).filter((partner) => partner.status === 'active').length ? (
                    <div>
                      {(data.tradePartners || EMPTY_LIST).filter((partner) => partner.status === 'active').map((partner) => (
                        <label key={partner.id}>
                          <input
                            type="checkbox"
                            checked={bidPackageDraft.tradePartnerIds.includes(partner.id)}
                            onChange={(event) => setBidPackageDraft({
                              ...bidPackageDraft,
                              tradePartnerIds: event.target.checked
                                ? [...bidPackageDraft.tradePartnerIds, partner.id]
                                : bidPackageDraft.tradePartnerIds.filter((id) => id !== partner.id),
                            })}
                          />
                          <span><strong>{partner.name}</strong><small>{ot(String(partner.partnerType || 'supplier').replaceAll('_', ' '))} / {ot(String(partner.compliance?.status || 'needs_review').replaceAll('_', ' '))}</small></span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p>{ot('No active trade partners are retained. Add and verify partners in Resources first.')}</p>
                  )}
                </fieldset>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setBidPackageEditor(false)}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || !bidPackageDraft.opportunityId || bidPackageDraft.title.trim().length < 2 || bidPackageDraft.trade.trim().length < 2 || bidPackageDraft.scope.trim().length < 5 || !bidPackageDraft.tradePartnerIds.length}>
                  {submitting ? ot('Saving...') : ot('Retain bid package')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function BidReturnModalDialog({ bidPackageAction, bidReturnDraft, ot, setBidPackageAction, setBidReturnDraft, submitBidReturn, submitting }) {
  return (
<div className="modal-backdrop bid-package-backdrop" role="presentation">
          <section className="modal bid-return-modal" role="dialog" aria-modal="true" aria-labelledby="bid-return-modal-title" data-testid="bid-return-modal">
            <div className="modal-heading">
              <div>
                <h2 id="bid-return-modal-title">{ot('Record bid return')}</h2>
                <p>{bidPackageAction.participant.partner?.name} / {bidPackageAction.bidPackage.packageNumber}</p>
              </div>
              <button className="icon-button" aria-label={ot('Close bid return')} onClick={() => setBidPackageAction(null)}><X size={18} /></button>
            </div>
            <form onSubmit={submitBidReturn}>
              <div className="form-grid bid-return-form">
                <label>
                  {ot('Net amount')}
                  <input required type="number" min="0.01" step="0.01" value={bidReturnDraft.netAmount} onChange={(event) => setBidReturnDraft({ ...bidReturnDraft, netAmount: event.target.value })} />
                </label>
                <label>
                  {ot('VAT rate')}
                  <input required type="number" min="0" max="100" step="0.01" value={bidReturnDraft.taxRate} onChange={(event) => setBidReturnDraft({ ...bidReturnDraft, taxRate: event.target.value })} />
                </label>
                <label>
                  {ot('Received date')}
                  <input required type="date" max={futureDateInput(1)} value={bidReturnDraft.receivedAt} onChange={(event) => setBidReturnDraft({ ...bidReturnDraft, receivedAt: event.target.value })} />
                </label>
                <label>
                  {ot('Valid until')}
                  <input type="date" min={bidReturnDraft.receivedAt || futureDateInput(0)} value={bidReturnDraft.validUntil} onChange={(event) => setBidReturnDraft({ ...bidReturnDraft, validUntil: event.target.value })} />
                </label>
                <label>
                  {ot('Duration days')}
                  <input type="number" min="0" max="3650" step="1" value={bidReturnDraft.durationDays} onChange={(event) => setBidReturnDraft({ ...bidReturnDraft, durationDays: event.target.value })} />
                </label>
                <label>
                  {ot('Evidence reference')}
                  <input required minLength="3" value={bidReturnDraft.evidenceReference} onChange={(event) => setBidReturnDraft({ ...bidReturnDraft, evidenceReference: event.target.value })} placeholder={ot('Email, document or receipt reference')} />
                </label>
                <label className="form-span">
                  {ot('Exclusions')}
                  <textarea value={bidReturnDraft.exclusions} onChange={(event) => setBidReturnDraft({ ...bidReturnDraft, exclusions: event.target.value })} placeholder={ot('One exclusion per line')} />
                </label>
                <label className="form-span">
                  {ot('Qualifications')}
                  <textarea value={bidReturnDraft.qualifications} onChange={(event) => setBidReturnDraft({ ...bidReturnDraft, qualifications: event.target.value })} placeholder={ot('One qualification per line')} />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setBidPackageAction(null)}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || Number(bidReturnDraft.netAmount) <= 0 || bidReturnDraft.evidenceReference.trim().length < 3}>
                  {submitting ? ot('Saving...') : ot('Retain return evidence')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function BidSelectionModalDialog({ bidPackageAction, bidSelectionRationale, ot, setBidPackageAction, setBidSelectionRationale, submitBidSelection, submitting }) {
  return (
<div className="modal-backdrop bid-package-backdrop" role="presentation">
          <section className="modal bid-selection-modal" role="dialog" aria-modal="true" aria-labelledby="bid-selection-modal-title" data-testid="bid-selection-modal">
            <div className="modal-heading">
              <div>
                <h2 id="bid-selection-modal-title">{ot('Request preferred-bidder approval')}</h2>
                <p>{bidPackageAction.participant.partner?.name} / {currency.format(bidPackageAction.participant.total || 0)}</p>
              </div>
              <button className="icon-button" aria-label={ot('Close bid selection')} onClick={() => setBidPackageAction(null)}><X size={18} /></button>
            </div>
            <form onSubmit={submitBidSelection}>
              <div className="bid-selection-review">
                <div><span>{ot('Package')}</span><strong>{bidPackageAction.bidPackage.packageNumber} / {bidPackageAction.bidPackage.title}</strong></div>
                <div><span>{ot('Comparison')}</span><strong>{ot('{count} returns, {amount} spread', { count: bidPackageAction.bidPackage.comparison.returned, amount: currency.format(bidPackageAction.bidPackage.comparison.spread || 0) })}</strong></div>
                <div><span>{ot('Safeguard')}</span><strong>{ot('Approval records preference only; it cannot award, order, spend, or send.')}</strong></div>
              </div>
              <div className="form-grid bid-selection-form">
                <label className="form-span">
                  {ot('Selection rationale')}
                  <textarea required minLength="8" maxLength="1000" value={bidSelectionRationale} onChange={(event) => setBidSelectionRationale(event.target.value)} placeholder={ot('Compare price, scope, exclusions, programme, quality, risk, and compliance.')} />
                </label>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setBidPackageAction(null)}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || bidSelectionRationale.trim().length < 8}>
                  {submitting ? ot('Requesting...') : ot('Request selection approval')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function BidCommitmentModalDialog({ bidCommitmentDraft, bidPackageAction, ot, setBidCommitmentDraft, setBidPackageAction, submitBidCommitment, submitting }) {
  return (
<div className="modal-backdrop bid-package-backdrop" role="presentation">
          <section
            className="modal bid-commitment-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bid-commitment-modal-title"
            data-testid="bid-commitment-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !submitting) setBidPackageAction(null)
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Selected-bid control')}</p>
                <h2 id="bid-commitment-modal-title">{ot('Prepare purchasing commitment')}</h2>
                <p>{bidPackageAction.bidPackage.packageNumber} / {bidPackageAction.bidPackage.selectedParticipant?.partner?.name}</p>
              </div>
              <button className="icon-button" aria-label={ot('Close purchasing commitment')} onClick={() => setBidPackageAction(null)}><X size={18} /></button>
            </div>
            <form onSubmit={submitBidCommitment}>
              <div className="bid-commitment-review">
                <div><span>{ot('Selected net')}</span><strong>{currency.format(bidPackageAction.bidPackage.selectedParticipant?.netAmount || 0)}</strong></div>
                <div><span>{ot('VAT / gross')}</span><strong>{bidPackageAction.bidPackage.selectedParticipant?.taxRate || 0}% / {currency.format(bidPackageAction.bidPackage.selectedParticipant?.total || 0)}</strong></div>
                <div><span>{ot('Scope')}</span><strong>{bidPackageAction.bidPackage.scope}</strong></div>
                <div><span>{ot('Source')}</span><strong>{bidPackageAction.bidPackage.selectedParticipant?.evidenceReference}</strong></div>
              </div>
              <div className="form-grid bid-commitment-form">
                <label>
                  {ot('Required by')}
                  <input autoFocus required type="date" min={futureDateInput(1)} value={bidCommitmentDraft.requiredBy} onChange={(event) => setBidCommitmentDraft({ ...bidCommitmentDraft, requiredBy: event.target.value })} />
                </label>
                <label>
                  {ot('Cost code')}
                  <input required minLength="2" maxLength="80" value={bidCommitmentDraft.costCode} onChange={(event) => setBidCommitmentDraft({ ...bidCommitmentDraft, costCode: event.target.value })} />
                </label>
                <label className="form-span">
                  {ot('Purchasing notes')}
                  <textarea maxLength="4000" value={bidCommitmentDraft.notes} onChange={(event) => setBidCommitmentDraft({ ...bidCommitmentDraft, notes: event.target.value })} placeholder={ot('Record interfaces, required evidence, exclusions, qualifications, and reviewer context.')} />
                </label>
                <p className="workflow-note form-span">
                  {ot('The selected return, scope, exclusions, qualifications, partner, amount, date, and cost code will be frozen behind SHA-256 verification. This creates an internal approval only; it cannot contact the supplier, issue an award or order, sign a subcontract, or move money.')}
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" disabled={submitting} onClick={() => setBidPackageAction(null)}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || !bidCommitmentDraft.requiredBy || bidCommitmentDraft.costCode.trim().length < 2}>
                  <ShieldCheck size={15} /> {submitting ? ot('Preparing...') : ot('Freeze and request approval')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function BidOrderPackageModalDialog({ bidOrderDraft, bidPackageAction, ot, setBidOrderDraft, setBidPackageAction, submitBidOrderPackage, submitting }) {
  return (
<div className="modal-backdrop bid-package-backdrop" role="presentation">
          <section
            className="modal bid-order-package-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bid-order-package-modal-title"
            data-testid="bid-order-package-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !submitting) setBidPackageAction(null)
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Controlled order issue')}</p>
                <h2 id="bid-order-package-modal-title">{ot('Prepare purchase-order package')}</h2>
                <p>{bidPackageAction.bidPackage.packageNumber} / {bidPackageAction.bidPackage.commitment?.purchaseOrder?.supplier}</p>
              </div>
              <button className="icon-button" aria-label={ot('Close purchase-order package')} onClick={() => setBidPackageAction(null)}><X size={18} /></button>
            </div>
            <form onSubmit={submitBidOrderPackage}>
              <div className="bid-commitment-review">
                <div><span>{ot('Approved net')}</span><strong>{currency.format(bidPackageAction.bidPackage.commitment?.purchaseOrder?.amount || 0)}</strong></div>
                <div><span>{ot('Required by')}</span><strong>{formatDate(bidPackageAction.bidPackage.commitment?.purchaseOrder?.requiredBy)}</strong></div>
                <div><span>{ot('Source')}</span><strong>{bidPackageAction.bidPackage.commitment?.purchaseOrder?.data?.source?.terms?.costCode || 'SUBCONTRACT'}</strong></div>
                <div><span>{ot('Integrity')}</span><strong>{bidPackageAction.bidPackage.commitment?.integrityValid ? ot('Current source verified') : ot('Source verification failed')}</strong></div>
              </div>
              <div className="form-grid bid-commitment-form">
                <label>
                  {ot('Supplier recipient')}
                  <input
                    autoFocus
                    required
                    type="email"
                    value={bidOrderDraft.recipient}
                    onChange={(event) => setBidOrderDraft({ ...bidOrderDraft, recipient: event.target.value })}
                    placeholder="orders@supplier.example"
                  />
                </label>
                <label>
                  {ot('Delivery channel')}
                  <select value={bidOrderDraft.channel} onChange={(event) => setBidOrderDraft({ ...bidOrderDraft, channel: event.target.value })}>
                    <option value="email">{ot('Email integration')}</option>
                    <option value="supplier_portal">{ot('Supplier portal integration')}</option>
                  </select>
                </label>
                <p className="workflow-note form-span">
                  {ot('This freezes a durable PO number plus human-readable HTML and generic OASIS UBL 2.1 Order attachments. It creates a separate transmission approval and does not send, certify Peppol delivery, sign a subcontract, or move money.')}
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" disabled={submitting} onClick={() => setBidPackageAction(null)}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || !bidOrderDraft.recipient.trim()}>
                  <PackageCheck size={15} /> {submitting ? ot('Preparing...') : ot('Freeze package and request approval')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function BidOrderDeliveryModalDialog({ bidOrderDeliveryDraft, bidPackageAction, ot, setBidOrderDeliveryDraft, setBidPackageAction, submitBidOrderDelivery, submitting }) {
  return (
<div className="modal-backdrop bid-package-backdrop" role="presentation">
          <section
            className="modal bid-order-delivery-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="bid-order-delivery-modal-title"
            data-testid="bid-order-delivery-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !submitting) setBidPackageAction(null)
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Verified delivery evidence')}</p>
                <h2 id="bid-order-delivery-modal-title">{ot('Record provider receipt')}</h2>
                <p>{bidPackageAction.bidPackage.commitment?.issuePackage?.issueReference} / {bidPackageAction.bidPackage.commitment?.issuePackage?.communication?.data?.recipient}</p>
              </div>
              <button className="icon-button" aria-label={ot('Close provider receipt')} onClick={() => setBidPackageAction(null)}><X size={18} /></button>
            </div>
            <form onSubmit={submitBidOrderDelivery}>
              <div className="form-grid bid-commitment-form">
                <label>
                  {ot('Configured integration ID')}
                  <input
                    autoFocus
                    required
                    minLength="2"
                    maxLength="120"
                    value={bidOrderDeliveryDraft.integration}
                    onChange={(event) => setBidOrderDeliveryDraft({ ...bidOrderDeliveryDraft, integration: event.target.value })}
                    placeholder="verified_supplier_gateway"
                  />
                </label>
                <label>
                  {ot('Provider message ID')}
                  <input
                    required
                    minLength="3"
                    maxLength="240"
                    value={bidOrderDeliveryDraft.providerMessageId}
                    onChange={(event) => setBidOrderDeliveryDraft({ ...bidOrderDeliveryDraft, providerMessageId: event.target.value })}
                    placeholder="provider-order-000123"
                  />
                </label>
                <label>
                  {ot('Provider sent at')}
                  <input
                    required
                    type="datetime-local"
                    value={bidOrderDeliveryDraft.sentAt}
                    onChange={(event) => setBidOrderDeliveryDraft({ ...bidOrderDeliveryDraft, sentAt: event.target.value })}
                  />
                </label>
                <p className="workflow-note form-span">
                  {ot('Record this only after the configured provider has returned delivery evidence for the approved recipient and package. This action marks the purchase order as externally committed; it does not perform the delivery itself or initiate payment.')}
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" disabled={submitting} onClick={() => setBidPackageAction(null)}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || bidOrderDeliveryDraft.integration.trim().length < 2 || bidOrderDeliveryDraft.providerMessageId.trim().length < 3 || !bidOrderDeliveryDraft.sentAt}>
                  <MailCheck size={15} /> {submitting ? ot('Recording...') : ot('Record verified receipt')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function BidAddParticipantsModalDialog({ bidAddPartnerIds, bidPackageAction, data, ot, setBidAddPartnerIds, setBidPackageAction, submitBidParticipants, submitting }) {
  return (
<div className="modal-backdrop bid-package-backdrop" role="presentation">
          <section className="modal bid-add-participants-modal" role="dialog" aria-modal="true" aria-labelledby="bid-add-participants-title" data-testid="bid-add-participants-modal">
            <div className="modal-heading">
              <div>
                <h2 id="bid-add-participants-title">{ot('Add internal bidders')}</h2>
                <p>{bidPackageAction.bidPackage.packageNumber} / {ot('no invitation or message will be sent')}</p>
              </div>
              <button className="icon-button" aria-label={ot('Close add bidders')} onClick={() => setBidPackageAction(null)}><X size={18} /></button>
            </div>
            <form onSubmit={submitBidParticipants}>
              <fieldset className="bid-partner-picker bid-add-partner-picker">
                <legend>{ot('Available trade partners')}</legend>
                <div>
                  {(data.tradePartners || EMPTY_LIST)
                    .filter((partner) => partner.status === 'active' && !bidPackageAction.bidPackage.participants.some((participant) => participant.tradePartnerId === partner.id))
                    .map((partner) => (
                      <label key={partner.id}>
                        <input
                          type="checkbox"
                          checked={bidAddPartnerIds.includes(partner.id)}
                          onChange={(event) => setBidAddPartnerIds((current) => event.target.checked ? [...current, partner.id] : current.filter((id) => id !== partner.id))}
                        />
                        <span><strong>{partner.name}</strong><small>{ot(String(partner.partnerType || 'supplier').replaceAll('_', ' '))} / {ot(String(partner.compliance?.status || 'needs_review').replaceAll('_', ' '))}</small></span>
                      </label>
                    ))}
                </div>
              </fieldset>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setBidPackageAction(null)}>{ot('Cancel')}</button>
                <button className="primary-button" disabled={submitting || !bidAddPartnerIds.length}>{submitting ? ot('Adding...') : ot('Add bidders internally')}</button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function MaterialReceiptModalDialog({ activeJobs, closeMaterialReceiptEditor, emptyMaterialReceiptLine, materialReceiptDraft, saveMaterialReceipt, setMaterialReceiptDraft, submitting }) {
  return (
<div className="modal-backdrop" role="presentation">
          <section className="modal material-receipt-modal" role="dialog" aria-modal="true" aria-labelledby="material-receipt-title" data-testid="material-receipt-modal">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Immutable goods-receipt evidence</p>
                <h2 id="material-receipt-title">Record material delivery</h2>
                <p>Accepted quantities update material readiness; every exception remains visible to operations and finance.</p>
              </div>
              <button type="button" className="icon-button" aria-label="Close material receipt" onClick={closeMaterialReceiptEditor}><X size={18} /></button>
            </div>
            <form onSubmit={saveMaterialReceipt}>
              <div className="form-grid">
                <label>
                  Job
                  <select required disabled={Boolean(materialReceiptDraft.purchaseOrderId)} value={materialReceiptDraft.jobId} onChange={(event) => setMaterialReceiptDraft({ ...materialReceiptDraft, jobId: event.target.value })}>
                    <option value="">Select an active job</option>
                    {activeJobs.map((job) => <option key={job.id} value={job.id}>{job.title}</option>)}
                  </select>
                </label>
                <label>
                  Delivery-note reference
                  <input autoFocus required minLength="3" maxLength="160" value={materialReceiptDraft.receiptReference} onChange={(event) => setMaterialReceiptDraft({ ...materialReceiptDraft, receiptReference: event.target.value })} />
                </label>
                <label>
                  Delivered at
                  <input required type="datetime-local" max={toLocalDateTimeInput(new Date())} value={materialReceiptDraft.deliveredAt} onChange={(event) => setMaterialReceiptDraft({ ...materialReceiptDraft, deliveredAt: event.target.value })} />
                </label>
                <label>
                  Received by
                  <input required minLength="2" maxLength="160" value={materialReceiptDraft.receivedBy} onChange={(event) => setMaterialReceiptDraft({ ...materialReceiptDraft, receivedBy: event.target.value })} />
                </label>
                <label>
                  Location
                  <input required={materialReceiptDraft.stockDestination === 'company_warehouse'} minLength={materialReceiptDraft.stockDestination === 'company_warehouse' ? 2 : undefined} maxLength="240" value={materialReceiptDraft.location} onChange={(event) => setMaterialReceiptDraft({ ...materialReceiptDraft, location: event.target.value })} />
                </label>
                <label>
                  Delivery destination
                  <select value={materialReceiptDraft.stockDestination} onChange={(event) => setMaterialReceiptDraft({ ...materialReceiptDraft, stockDestination: event.target.value })}>
                    <option value="job_site">Job site / direct to project</option>
                    <option value="company_warehouse">Company warehouse</option>
                  </select>
                  {materialReceiptDraft.stockDestination === 'company_warehouse' ? <small>Only accepted quantities linked to a shared catalogue item are added to company stock.</small> : null}
                </label>
                <label className="form-span">
                  Evidence reference
                  <input required minLength="3" maxLength="240" value={materialReceiptDraft.evidenceReference} onChange={(event) => setMaterialReceiptDraft({ ...materialReceiptDraft, evidenceReference: event.target.value })} placeholder="Signed ticket, photo, or private document reference" />
                </label>
                <div className="form-span material-receipt-lines">
                  <div className="panel-heading">
                    <div><h3>Delivered lines</h3><p>Accepted plus damaged cannot exceed the physically received quantity.</p></div>
                    <button type="button" className="secondary-button" onClick={() => setMaterialReceiptDraft({ ...materialReceiptDraft, lines: [...materialReceiptDraft.lines, emptyMaterialReceiptLine()] })}><Plus size={15} /> Add line</button>
                  </div>
                  {materialReceiptDraft.lines.map((line, index) => (
                    <div className="form-grid material-receipt-line" key={`${line.lineKey || 'manual'}-${index}`}>
                      <label>Item<input required minLength="2" maxLength="240" value={line.itemName} onChange={(event) => setMaterialReceiptDraft({ ...materialReceiptDraft, lines: materialReceiptDraft.lines.map((item, itemIndex) => itemIndex === index ? { ...item, itemName: event.target.value } : item) })} /></label>
                      <label>Unit<input required maxLength="40" value={line.unit} onChange={(event) => setMaterialReceiptDraft({ ...materialReceiptDraft, lines: materialReceiptDraft.lines.map((item, itemIndex) => itemIndex === index ? { ...item, unit: event.target.value } : item) })} /></label>
                      <label>Received<input required type="number" min="0.000001" step="any" value={line.receivedQuantity} onChange={(event) => setMaterialReceiptDraft({ ...materialReceiptDraft, lines: materialReceiptDraft.lines.map((item, itemIndex) => itemIndex === index ? { ...item, receivedQuantity: event.target.value } : item) })} /></label>
                      <label>Accepted<input required type="number" min="0" step="any" value={line.acceptedQuantity} onChange={(event) => setMaterialReceiptDraft({ ...materialReceiptDraft, lines: materialReceiptDraft.lines.map((item, itemIndex) => itemIndex === index ? { ...item, acceptedQuantity: event.target.value } : item) })} /></label>
                      <label>Damaged<input required type="number" min="0" step="any" value={line.damagedQuantity} onChange={(event) => setMaterialReceiptDraft({ ...materialReceiptDraft, lines: materialReceiptDraft.lines.map((item, itemIndex) => itemIndex === index ? { ...item, damagedQuantity: event.target.value } : item) })} /></label>
                      {materialReceiptDraft.lines.length > 1 ? <button type="button" className="icon-button" title="Remove line" aria-label={`Remove delivery line ${index + 1}`} onClick={() => setMaterialReceiptDraft({ ...materialReceiptDraft, lines: materialReceiptDraft.lines.filter((_, itemIndex) => itemIndex !== index) })}><X size={16} /></button> : null}
                    </div>
                  ))}
                </div>
                <label className="form-span">Notes<textarea maxLength="4000" value={materialReceiptDraft.notes} onChange={(event) => setMaterialReceiptDraft({ ...materialReceiptDraft, notes: event.target.value })} /></label>
                <label className="checkbox-label form-span"><input type="checkbox" checked={materialReceiptDraft.finalDelivery} onChange={(event) => setMaterialReceiptDraft({ ...materialReceiptDraft, finalDelivery: event.target.checked })} /> This is the final delivery against the order</label>
                <p className="workflow-note form-span">Saving retains the ticket and derives discrepancy evidence. It does not contact a supplier, accept commercial terms, or authorize payment.</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" disabled={submitting} onClick={closeMaterialReceiptEditor}>Cancel</button>
                <button className="primary-button" disabled={submitting}><PackageCheck size={15} /> {submitting ? 'Recording...' : 'Retain delivery'}</button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function MaterialReceiptReversalDialog({ materialReceiptReversal, materialReceiptReversalReason, requestMaterialReceiptReversal, setMaterialReceiptReversal, setMaterialReceiptReversalReason, submitting }) {
  return (
<div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="material-receipt-reversal-title">
            <div className="modal-heading">
              <div><p className="eyebrow">Compensating ledger action</p><h2 id="material-receipt-reversal-title">Request receipt reversal</h2><p>{materialReceiptReversal.receiptReference} / {materialReceiptReversal.jobTitle}</p></div>
              <button type="button" className="icon-button" aria-label="Close receipt reversal" onClick={() => setMaterialReceiptReversal(null)}><X size={18} /></button>
            </div>
            <form onSubmit={requestMaterialReceiptReversal}>
              <label>Reason<textarea autoFocus required minLength="8" maxLength="1000" value={materialReceiptReversalReason} onChange={(event) => setMaterialReceiptReversalReason(event.target.value)} placeholder="Explain the wrong allocation, duplicate ticket, or corrected evidence." /></label>
              <p className="workflow-note">The original ticket remains in history. Quantities stay active until an approver accepts the reversal, and active supplier payables block reversal.</p>
              <div className="modal-actions"><button type="button" className="secondary-button" disabled={submitting} onClick={() => setMaterialReceiptReversal(null)}>Cancel</button><button className="danger-button" disabled={submitting || materialReceiptReversalReason.trim().length < 8}><ShieldCheck size={15} /> {submitting ? 'Requesting...' : 'Request reversal'}</button></div>
            </form>
          </section>
        </div>
  )
}

export function InvoiceDraftModalDialog({ closeInvoiceDraft, createInvoiceDraft, invoiceAmount, invoiceDraft, invoiceJob, invoiceTaxAmount, invoiceTotal, setInvoiceDraft, submitting }) {
  return (
<div className="modal-backdrop" role="presentation">
          <section
            className="modal invoice-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="invoice-draft-title"
            data-testid="invoice-draft-modal"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Approval-gated finance</p>
                <h2 id="invoice-draft-title">{invoiceJob.billingMilestone ? 'Draft milestone invoice' : 'Draft invoice'}</h2>
                <p>
                  {invoiceJob.jobTitle} / {invoiceJob.clientName || 'Client not set'}
                </p>
              </div>
              <button className="icon-button" aria-label="Close invoice draft" onClick={closeInvoiceDraft}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={createInvoiceDraft}>
              <div className="form-grid">
                {invoiceJob.billingMilestone ? (
                  <div className="workflow-result form-span" data-testid="invoice-milestone-source">
                    <div>
                      <strong>
                        Milestone {invoiceJob.billingMilestone.sequenceNumber}: {invoiceJob.billingMilestone.title}
                      </strong>
                      <span>The approved net amount, VAT rate, and payment date are locked to this retained billing plan.</span>
                    </div>
                    <span className="tag tag-green">Approved source</span>
                  </div>
                ) : null}
                <label>
                  Net amount (EUR)
                  <input
                    required
                    readOnly={Boolean(invoiceDraft.billingMilestoneId)}
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={invoiceDraft.amount}
                    onChange={(event) => setInvoiceDraft({ ...invoiceDraft, amount: event.target.value })}
                  />
                </label>
                <label>
                  VAT rate (%)
                  <input
                    required
                    readOnly={Boolean(invoiceDraft.billingMilestoneId)}
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={invoiceDraft.taxRate}
                    onChange={(event) => setInvoiceDraft({ ...invoiceDraft, taxRate: event.target.value })}
                  />
                </label>
                <label>
                  Due date
                  <input
                    required
                    readOnly={Boolean(invoiceDraft.billingMilestoneId)}
                    type="date"
                    value={invoiceDraft.dueAt}
                    onChange={(event) => setInvoiceDraft({ ...invoiceDraft, dueAt: event.target.value })}
                  />
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={invoiceDraft.peppolReady}
                    onChange={(event) => setInvoiceDraft({ ...invoiceDraft, peppolReady: event.target.checked })}
                  />
                  Prepare Peppol BIS / UBL 2.1 export
                </label>
                {invoiceDraft.peppolReady ? (
                  <>
                    <label>
                      Buyer reference
                      <input
                        required={!invoiceDraft.purchaseOrderReference.trim()}
                        value={invoiceDraft.buyerReference}
                        onChange={(event) => setInvoiceDraft({ ...invoiceDraft, buyerReference: event.target.value })}
                        placeholder="Reference supplied by the buyer"
                      />
                    </label>
                    <label>
                      Purchase-order reference
                      <input
                        required={!invoiceDraft.buyerReference.trim()}
                        value={invoiceDraft.purchaseOrderReference}
                        onChange={(event) => setInvoiceDraft({ ...invoiceDraft, purchaseOrderReference: event.target.value })}
                      />
                    </label>
                    <label className="form-span">
                      Buyer legal name
                      <input
                        required
                        value={invoiceDraft.buyerLegalName}
                        onChange={(event) => setInvoiceDraft({ ...invoiceDraft, buyerLegalName: event.target.value })}
                      />
                    </label>
                    <label>
                      Buyer KVK / OIN
                      <input
                        value={invoiceDraft.buyerRegistrationNumber}
                        onChange={(event) => setInvoiceDraft({ ...invoiceDraft, buyerRegistrationNumber: event.target.value })}
                      />
                    </label>
                    <label>
                      Endpoint scheme
                      <input
                        required
                        value={invoiceDraft.buyerEndpointScheme}
                        onChange={(event) => setInvoiceDraft({ ...invoiceDraft, buyerEndpointScheme: event.target.value })}
                        placeholder="0106 for KVK"
                      />
                    </label>
                    <label>
                      Buyer electronic address
                      <input
                        required
                        value={invoiceDraft.buyerEndpointId}
                        onChange={(event) => setInvoiceDraft({ ...invoiceDraft, buyerEndpointId: event.target.value })}
                      />
                    </label>
                    <label className="form-span">
                      Buyer street address
                      <input
                        required
                        value={invoiceDraft.buyerAddress}
                        onChange={(event) => setInvoiceDraft({ ...invoiceDraft, buyerAddress: event.target.value })}
                      />
                    </label>
                    <label>
                      Buyer postal code
                      <input
                        required
                        value={invoiceDraft.buyerPostalCode}
                        onChange={(event) => setInvoiceDraft({ ...invoiceDraft, buyerPostalCode: event.target.value })}
                      />
                    </label>
                    <label>
                      Buyer city
                      <input
                        required
                        value={invoiceDraft.buyerCity}
                        onChange={(event) => setInvoiceDraft({ ...invoiceDraft, buyerCity: event.target.value })}
                      />
                    </label>
                    <label>
                      Buyer country
                      <input
                        required
                        maxLength="2"
                        value={invoiceDraft.buyerCountry}
                        onChange={(event) => setInvoiceDraft({ ...invoiceDraft, buyerCountry: event.target.value.toUpperCase() })}
                      />
                    </label>
                  </>
                ) : null}
                <label className="form-span">
                  Internal finance note
                  <textarea
                    value={invoiceDraft.notes}
                    onChange={(event) => setInvoiceDraft({ ...invoiceDraft, notes: event.target.value })}
                  />
                </label>
                <div className="invoice-preview form-span" aria-label="Invoice calculation">
                  <span>
                    Net <strong>{currency.format(invoiceAmount)}</strong>
                  </span>
                  <span>
                    VAT <strong>{currency.format(invoiceTaxAmount)}</strong>
                  </span>
                  <span>
                    Total <strong>{currency.format(invoiceTotal)}</strong>
                  </span>
                </div>
                <p className="workflow-note form-span">
                  This creates a retained draft and approval record only. Structured export is generated after invoice approval; delivery
                  and Peppol transport remain blocked until separately verified.
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeInvoiceDraft}>
                  Cancel
                </button>
                <button className="primary-button" disabled={submitting || invoiceAmount <= 0}>
                  <ReceiptEuro size={16} />
                  {submitting ? 'Creating...' : 'Create approval-gated draft'}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function ClientLifecycleModalDialog({ clientAction, clientActionNotes, clientActionOption, clientActionReference, closeClientLifecycle, ot, setClientActionNotes, setClientActionOption, setClientActionReference, submitClientLifecycle, submitting }) {
  return (
<div className="modal-backdrop" role="presentation">
          <section
            className="modal client-action-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="client-action-title"
            data-testid="client-lifecycle-modal"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Retained client lifecycle')}</p>
                <h2 id="client-action-title">{clientAction.label}</h2>
                <p>
                  {clientAction.item.jobTitle} / {clientAction.item.clientName || ot('Client record')}
                </p>
              </div>
              <button className="icon-button" aria-label={ot('Close client lifecycle review')} onClick={closeClientLifecycle}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitClientLifecycle}>
              <div className="form-grid">
                {clientAction.type === 'selection' ? (
                  <>
                    <label>
                      {ot('Retained option')}
                      <select required value={clientActionOption} onChange={(event) => setClientActionOption(event.target.value)}>
                        <option value="">{ot('Select the confirmed option')}</option>
                        {(clientAction.record?.options || []).map((option) => (
                          <option key={option} value={option}>
                            {option}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      {ot('Client confirmation reference')}
                      <input
                        required
                        value={clientActionReference}
                        onChange={(event) => setClientActionReference(event.target.value)}
                        placeholder={ot('Portal reply, signed form, email, or call record')}
                      />
                    </label>
                  </>
                ) : null}
                <label className="form-span">
                  {ot('Evidence and outcome')}
                  <textarea
                    required
                    value={clientActionNotes}
                    onChange={(event) => setClientActionNotes(event.target.value)}
                    placeholder={ot('Record what was inspected, completed, agreed, or still needs review.')}
                  />
                </label>
                <p className="workflow-note form-span">
                  {clientAction.type === 'aftercare'
                    ? ot('Completing aftercare updates the internal ledger only. It does not send a client message.')
                    : clientAction.type === 'selection'
                      ? ot('The selected option remains pending until an approver reviews the confirmation evidence. No procurement, scope, price, or schedule commitment is made here.')
                      : ot('The requested resolution remains pending until an approver reviews it. No acceptance or warranty commitment is communicated from this screen.')}
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeClientLifecycle}>
                  Cancel
                </button>
                <button
                  className="primary-button"
                  data-testid="client-lifecycle-submit"
                  disabled={
                    submitting ||
                    !clientActionNotes.trim() ||
                    (clientAction.type === 'selection' && (!clientActionOption || !clientActionReference.trim()))
                  }
                >
                  <ShieldCheck size={16} />
                  {submitting
                    ? 'Recording...'
                    : clientAction.type === 'aftercare'
                      ? ot('Complete internal follow-up')
                      : clientAction.type === 'selection'
                        ? ot('Request selection approval')
                        : ot('Request resolution approval')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function FinanceOrderDeliveryModalDialog({ closeFinanceOrderDelivery, financeOrderDelivery, financeOrderDeliveryDraft, ot, setFinanceOrderDeliveryDraft, submitFinanceOrderDelivery, submitting }) {
  return (
<div className="modal-backdrop" role="presentation">
          <section
            className="modal finance-order-delivery-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="finance-order-delivery-title"
            data-testid="finance-order-delivery-modal"
            onKeyDown={(event) => {
              if (event.key === 'Escape' && !submitting) closeFinanceOrderDelivery()
            }}
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Verified supplier delivery</p>
                <h2 id="finance-order-delivery-title">Record provider receipt</h2>
                <p>
                  {financeOrderDelivery.action.issueReference || 'Purchase order'} /{' '}
                  {financeOrderDelivery.action.recipient || financeOrderDelivery.action.supplier || 'retained supplier'}
                </p>
              </div>
              <button className="icon-button" aria-label="Close order delivery" onClick={closeFinanceOrderDelivery}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitFinanceOrderDelivery}>
              <div className="form-grid">
                <label>
                  Configured integration ID
                  <input
                    autoFocus
                    required
                    minLength="2"
                    maxLength="120"
                    value={financeOrderDeliveryDraft.integration}
                    onChange={(event) =>
                      setFinanceOrderDeliveryDraft({ ...financeOrderDeliveryDraft, integration: event.target.value })
                    }
                    placeholder="verified_supplier_gateway"
                  />
                </label>
                <label>
                  Provider message ID
                  <input
                    required
                    minLength="3"
                    maxLength="240"
                    value={financeOrderDeliveryDraft.providerMessageId}
                    onChange={(event) =>
                      setFinanceOrderDeliveryDraft({ ...financeOrderDeliveryDraft, providerMessageId: event.target.value })
                    }
                    placeholder="provider-order-000123"
                  />
                </label>
                <label>
                  Provider sent at
                  <input
                    required
                    type="datetime-local"
                    value={financeOrderDeliveryDraft.sentAt}
                    onChange={(event) =>
                      setFinanceOrderDeliveryDraft({ ...financeOrderDeliveryDraft, sentAt: event.target.value })
                    }
                  />
                </label>
                <p className="workflow-note form-span">
                  Record this only after the configured provider has returned delivery evidence for the approved recipient and immutable
                  order attachments. This records an existing delivery receipt; it does not contact the supplier or initiate payment.
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" disabled={submitting} onClick={closeFinanceOrderDelivery}>
                  {ot('Cancel')}
                </button>
                <button
                  className="primary-button"
                  disabled={
                    submitting ||
                    financeOrderDeliveryDraft.integration.trim().length < 2 ||
                    financeOrderDeliveryDraft.providerMessageId.trim().length < 3 ||
                    !financeOrderDeliveryDraft.sentAt
                  }
                >
                  <MailCheck size={15} /> {submitting ? 'Recording...' : 'Record verified receipt'}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function EnvironmentalReversalModalDialog({ environmentalReversal, environmentalReversalReason, setEnvironmentalReversal, setEnvironmentalReversalReason, submitEnvironmentalReversal, submitting }) {
  return (
<div className="modal-backdrop" role="presentation">
          <section className="modal" role="dialog" aria-modal="true" aria-labelledby="environmental-reversal-title" data-testid="environmental-reversal-modal">
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Compensating correction</p>
                <h2 id="environmental-reversal-title">Reverse environmental activity</h2>
                <p>{environmentalReversal.description}</p>
              </div>
              <button type="button" className="icon-button" aria-label="Close environmental reversal" onClick={() => {
                setEnvironmentalReversal(null)
                setEnvironmentalReversalReason('')
              }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitEnvironmentalReversal}>
              <div className="form-grid">
                <div className="field-record-context form-span">
                  <span>Recognized source</span>
                  <strong>{roundDisplay(environmentalReversal.emissionsKgCo2e)} kg CO2e</strong>
                  <p>{roundDisplay(environmentalReversal.quantity)} {environmentalReversal.unit} / {environmentalReversal.factorSource}</p>
                </div>
                <label className="form-span">
                  Correction reason
                  <textarea required minLength="8" maxLength="1000" autoFocus value={environmentalReversalReason} onChange={(event) => setEnvironmentalReversalReason(event.target.value)} placeholder="Identify the corrected source or allocation evidence." />
                </label>
                <p className="workflow-note form-span">Approval removes this amount from the current recognized register only. The original activity, source evidence, factor provenance, and historical report packages remain retained.</p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" disabled={submitting} onClick={() => {
                  setEnvironmentalReversal(null)
                  setEnvironmentalReversalReason('')
                }}>Cancel</button>
                <button className="primary-button" disabled={submitting || environmentalReversalReason.trim().length < 8}>
                  <Undo2 size={16} />
                  {submitting ? 'Requesting...' : 'Request reversal approval'}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function FieldAssuranceModalDialog({ closeFieldReview, fieldAction, fieldActionDate, fieldActionNotes, fieldActionReference, ot, setFieldActionDate, setFieldActionNotes, setFieldActionReference, submitFieldReview, submitting }) {
  return (
<div className="modal-backdrop" role="presentation">
          <section
            className="modal field-action-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="field-action-title"
            data-testid="field-assurance-modal"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">{ot('Retained assurance review')}</p>
                <h2 id="field-action-title">{fieldAction.label}</h2>
                <p>
                  {fieldAction.item.jobTitle} /{' '}
                  {fieldAction.record?.title ||
                    fieldAction.record?.material ||
                    fieldAction.record?.workerName ||
                    ot(formatStatus(fieldAction.type))}
                </p>
              </div>
              <button className="icon-button" aria-label={ot('Close assurance review')} onClick={closeFieldReview}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={submitFieldReview}>
              <div className="form-grid">
                <div className="field-record-context form-span">
                  <span>{ot('Current state')}</span>
                  <strong>{ot(formatStatus(fieldAction.record?.status))}</strong>
                  {fieldAction.record?.question ? <p>{fieldAction.record.question}</p> : null}
                  {fieldAction.record?.workerName ? (
                    <p>
                      {ot('Worker')}: {fieldAction.record.workerName}
                      {fieldAction.record.company ? ' / ' + fieldAction.record.company : ''}
                    </p>
                  ) : null}
                  {fieldAction.record?.hazards?.length ? (
                    <p>
                      {fieldAction.record.hazards.length === 1
                        ? ot('{count} hazard retained with controls for review.', { count: fieldAction.record.hazards.length })
                        : ot('{count} hazards retained with controls for review.', { count: fieldAction.record.hazards.length })}
                    </p>
                  ) : null}
                  {fieldAction.record?.defects?.length ? (
                    <p>
                      {fieldAction.record.defects.length === 1
                        ? ot('{count} retained defect requires resolution evidence.', { count: fieldAction.record.defects.length })
                        : ot('{count} retained defects require resolution evidence.', { count: fieldAction.record.defects.length })}
                    </p>
                  ) : null}
                  {fieldAction.record?.expiresAt ? <p>{ot('Current expiry')}: {formatDate(fieldAction.record.expiresAt)}</p> : null}
                </div>
                {['permit', 'sds'].includes(fieldAction.type) ? (
                  <label>
                    {fieldAction.type === 'sds' ? ot('SDS expiry') : ot('Proposed expiry')}
                    <input required type="date" value={fieldActionDate} onChange={(event) => setFieldActionDate(event.target.value)} />
                  </label>
                ) : null}
                {fieldAction.type === 'sds' ? (
                  <label className="form-span">
                    {ot('SDS document reference')}
                    <input
                      required
                      value={fieldActionReference}
                      onChange={(event) => setFieldActionReference(event.target.value)}
                      placeholder={ot('Storage reference, controlled document ID, or verified source')}
                    />
                  </label>
                ) : null}
                {fieldAction.type === 'safety_meeting' ? (
                  <label className="form-span">
                    {ot('Attendees')}
                    <input
                      required
                      value={fieldActionReference}
                      onChange={(event) => setFieldActionReference(event.target.value)}
                      placeholder={ot('Names or retained attendance reference')}
                    />
                  </label>
                ) : null}
                {fieldAction.type === 'orientation' ? (
                  <label className="form-span">
                    {ot('Verification reference')}
                    <input
                      required
                      value={fieldActionReference}
                      onChange={(event) => setFieldActionReference(event.target.value)}
                      placeholder={ot('Induction record, credential, or checked evidence reference')}
                    />
                  </label>
                ) : null}
                {fieldAction.type === 'document' ? (
                  <label className="form-span">
                    {ot('Document review reference')}
                    <input
                      required
                      value={fieldActionReference}
                      onChange={(event) => setFieldActionReference(event.target.value)}
                      placeholder={ot('Controlled document revision, reviewer record, or storage reference')}
                    />
                  </label>
                ) : null}
                <label className="form-span">
                  {fieldAction.type === 'rfi' ? ot('Response and evidence') : fieldAction.type === 'incident' && fieldAction.status === 'resolved' ? ot('Corrective action') : ot('Evidence and decision')}
                  <textarea
                    required
                    minLength={fieldAction.type === 'incident' && fieldAction.status === 'resolved' ? 4 : undefined}
                    value={fieldActionNotes}
                    onChange={(event) => setFieldActionNotes(event.target.value)}
                    placeholder={ot('Record the source, inspection, corrective work, or decision evidence an approver should rely on.')}
                  />
                </label>
                <p className="workflow-note form-span">
                  {ot('This records a proposed lifecycle transition. Field reliance, acceptance, publication, and external commitments remain blocked until the approval is resolved.')}
                </p>
              </div>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={closeFieldReview}>
                  {ot('Cancel')}
                </button>
                <button
                  className="primary-button"
                  disabled={
                    submitting ||
                    !fieldActionNotes.trim() ||
                    (['permit', 'sds'].includes(fieldAction.type) && !fieldActionDate) ||
                    (['sds', 'safety_meeting', 'orientation', 'document'].includes(fieldAction.type) && !fieldActionReference.trim())
                  }
                >
                  <ShieldCheck size={16} />
                  {submitting ? ot('Recording...') : ot('Request approver review')}
                </button>
              </div>
            </form>
          </section>
        </div>
  )
}

export function ResourcePlannerDialog({ assignWorker, releaseAssignment, releaseToolReservation, reserveTool, resourceDraft, resourceOptions, scheduleDraft, selectedJob, setResourceDraft, setShowResourcePlanner, submitting }) {
  return (
<div className="modal-backdrop resource-backdrop" role="presentation">
          <section
            className="modal resource-planner"
            role="dialog"
            aria-modal="true"
            aria-labelledby="resource-planner-title"
            data-testid="resource-planner"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Internal work plan</p>
                <h2 id="resource-planner-title">Crew and equipment</h2>
                <p>
                  {selectedJob.title} · {formatDate(scheduleDraft.plannedStart)}
                </p>
              </div>
              <button className="icon-button" aria-label="Close resource planner" onClick={() => setShowResourcePlanner(false)}>
                <X size={18} />
              </button>
            </div>
            <div className="resource-planner-body">
              <p className="workflow-note">
                Planning remains internal. Conflicts become approval records; this screen cannot contact crew, suppliers, or clients.
              </p>
              <div className="resource-forms">
                <form className="form-grid compact-form" onSubmit={assignWorker}>
                  <label className="form-span">
                    Crew member
                    <select
                      aria-label="Crew member"
                      required
                      value={resourceDraft.workerId}
                      onChange={(event) => setResourceDraft({ ...resourceDraft, workerId: event.target.value })}
                    >
                      <option value="">Select a ledger worker</option>
                      {resourceOptions.workers.map((worker) => (
                        <option key={worker.id} value={worker.id}>
                          {worker.name} · {worker.role || 'Contractor'} · {formatStatus(worker.status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="form-actions form-span">
                    <button className="secondary-button" disabled={submitting || !resourceOptions.workers.length}>
                      <Users size={16} />
                      Add crew assignment
                    </button>
                  </div>
                </form>
                <form className="form-grid compact-form" onSubmit={reserveTool}>
                  <label className="form-span">
                    Equipment
                    <select
                      aria-label="Equipment"
                      required
                      value={resourceDraft.toolId}
                      onChange={(event) => setResourceDraft({ ...resourceDraft, toolId: event.target.value })}
                    >
                      <option value="">Select registered equipment</option>
                      {resourceOptions.tools.map((tool) => (
                        <option key={tool.id} value={tool.id}>
                          {tool.name} · {tool.category || 'Equipment'} · {formatStatus(tool.status)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="form-span">
                    Related task (optional)
                    <select
                      aria-label="Related equipment task"
                      value={resourceDraft.toolTaskId}
                      onChange={(event) => setResourceDraft({ ...resourceDraft, toolTaskId: event.target.value })}
                    >
                      <option value="">No specific task</option>
                      {(selectedJob.tasks || []).filter((task) => !['completed', 'cancelled', 'canceled', 'rejected', 'void'].includes(task.status)).map((task) => (
                        <option key={task.id} value={task.id}>{task.title}</option>
                      ))}
                    </select>
                  </label>
                  <div className="form-actions form-span">
                    <button className="secondary-button" disabled={submitting || !resourceOptions.tools.length}>
                      <Wrench size={16} />
                      Reserve equipment
                    </button>
                  </div>
                </form>
              </div>
              <div className="resource-ledger">
                <section>
                  <h3>Crew plan</h3>
                  {selectedJob.assignments?.length ? (
                    <div className="activity-list">
                      {selectedJob.assignments.map((assignment) => (
                        <div className="activity-row" key={assignment.id}>
                          <div>
                            <strong>
                              {assignment.workerName || 'Ledger worker'} · {assignment.role || 'Contractor'}
                            </strong>
                            <small>
                              {formatDate(assignment.scheduledStart)} · {formatStatus(assignment.status)}
                              {assignment.requiresApproval ? ' · approval required' : ''}
                            </small>
                          </div>
                          {!['released', 'cancelled', 'completed', 'closed', 'rejected', 'declined'].includes(assignment.status) ? (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={submitting}
                              aria-label={`Release assignment for ${assignment.workerName || 'worker'}`}
                              onClick={() => releaseAssignment(assignment.id)}
                            >
                              <Ban size={15} />
                              Release
                            </button>
                          ) : (
                            <span className={`status status-${assignment.status}`}>{formatStatus(assignment.status)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="workflow-note">No crew member is allocated to this job window.</p>
                  )}
                </section>
                <section>
                  <h3>Equipment plan</h3>
                  {selectedJob.tools?.length ? (
                    <div className="activity-list">
                      {selectedJob.tools.map((reservation) => (
                        <div className="activity-row" key={reservation.id}>
                          <div>
                            <strong>{reservation.toolName}</strong>
                            <small>
                              {formatDate(reservation.neededFrom)} · {formatStatus(reservation.status)}
                              {reservation.data?.taskId ? ` · ${selectedJob.tasks?.find((task) => task.id === reservation.data.taskId)?.title || 'Task linked'}` : ''}
                              {reservation.requiresApproval ? ' · approval required' : ''}
                            </small>
                          </div>
                          {!['released', 'returned', 'cancelled', 'rejected', 'declined', 'completed', 'closed'].includes(
                            reservation.status,
                          ) ? (
                            <button
                              type="button"
                              className="secondary-button"
                              disabled={submitting}
                              aria-label={`Release ${reservation.toolName}`}
                              onClick={() => releaseToolReservation(reservation.id)}
                            >
                              <Ban size={15} />
                              Release
                            </button>
                          ) : (
                            <span className={`status status-${reservation.status}`}>{formatStatus(reservation.status)}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="workflow-note">No equipment is reserved for this job window.</p>
                  )}
                </section>
              </div>
            </div>
          </section>
        </div>
  )
}
