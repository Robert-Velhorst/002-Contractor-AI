import { useCallback, useState } from 'react'
import { useSessionDraftRecovery } from '../draft-recovery'
import { toIsoDateTime } from '../dashboard-format'
import { formatDate } from '../format-date.mjs'
import { useRecoveryCommand } from '../recovery-command'

const STATUS = {
  reviewed_unaffected: 'Afspraak blijft ongewijzigd',
  customer_follow_up_required: 'Klantafstemming nodig',
  awaiting_customer: 'Reactie van klant afwachten'
}
const VISIT = { site_survey: 'Opname op locatie', inspection: 'Inspectie', handover: 'Overdracht' }

export default function ClientAppointmentReview({ api, canEdit, source, recoveryCase, sourceHash, appointment, draftScope, onSubmitted, onError }) {
  const [reviewStatus, setReviewStatus] = useState('customer_follow_up_required'), [summary, setSummary] = useState('')
  const [messageId, setMessageId] = useState(''), [nextFollowUpAt, setNextFollowUpAt] = useState(''), [pending, setPending] = useState(null)
  const { busy, execute } = useRecoveryCommand({ api, jobId: recoveryCase.jobId, canEdit, pending, setPending, onError })
  const restoreForm = useCallback(value => {
    setReviewStatus(value?.reviewStatus || 'customer_follow_up_required')
    setSummary(value?.summary || '')
    setMessageId(value?.messageId || '')
    setNextFollowUpAt(value?.nextFollowUpAt || '')
    setPending(value?.pending || null)
  }, [])
  const hasFormDraft = Boolean(summary || messageId || nextFollowUpAt || reviewStatus !== 'customer_follow_up_required' || pending)
  useSessionDraftRecovery({ enabled: Boolean(draftScope), scope: draftScope,
    name: `client-appointment-impact:${recoveryCase.id}:${source.id}:${source.sourceFingerprint || 'current'}:${appointment.id}`,
    value: hasFormDraft ? { reviewStatus, summary, messageId, nextFollowUpAt, pending } : null, setValue: restoreForm })
  const reviews = (recoveryCase.clientImpactReviews || []).filter(item => item.appointment?.id === appointment.id)
  const messages = appointment.clientMessages || []
  const selectedMessage = messages.find(message => message.id === messageId)

  async function submit(event) {
    event.preventDefault()
    if (!canEdit || busy || !recoveryCase.sourceCurrent || (!pending && (summary.trim().length < 3 || !selectedMessage
      || (reviewStatus === 'reviewed_unaffected' && source.impact.clientAppointmentsComplete !== true)
      || (reviewStatus === 'awaiting_customer' && !nextFollowUpAt)))) return
    const command = pending || { action: 'client_impact_review', entryKey: crypto.randomUUID(), caseId: recoveryCase.id,
      caseHash: recoveryCase.caseHash, sourceHash, sourceId: source.id, appointmentId: appointment.id, reviewStatus,
      summary: summary.trim(), accessId: selectedMessage.accessId, messageId: selectedMessage.id, messageHash: selectedMessage.sourceHash,
      nextFollowUpAt: nextFollowUpAt ? toIsoDateTime(nextFollowUpAt) : null }
    await execute(command, result => {
      setReviewStatus('customer_follow_up_required'); setSummary(''); setMessageId(''); setNextFollowUpAt(''); onSubmitted?.(result)
    })
  }

  return <li>
    <strong>{VISIT[appointment.visitType] || appointment.visitType}</strong> / {appointment.jobTitle} / {formatDate(appointment.scheduledAt, 'Datum onbekend')}
    {` / bevestigd voor ${appointment.assignee} / goedkeuring ${appointment.approvalId}`}
    {reviews.length > 0 && <ul>{reviews.map(review => <li key={review.id}>
      <strong>{STATUS[review.status] || review.status}</strong>: {review.summary}
      {review.nextFollowUpAt ? ` / opvolgen ${formatDate(review.nextFollowUpAt)}` : ''}
      {review.messageEvidence ? ` / klantbericht ${formatDate(review.messageEvidence.createdAt, 'Datum onbekend')}: “${review.messageEvidence.excerpt}”` : ` / referentie: ${review.evidenceReference}`}
      {` / ${review.recordedBy}`}
    </li>)}</ul>}
    {canEdit && recoveryCase.sourceCurrent && ['open', 'monitoring'].includes(recoveryCase.status) && <details>
      <summary>Klantimpact beoordelen</summary>
      <form className="form-grid" onSubmit={submit}>
        <fieldset disabled={busy || Boolean(pending)}>
        <label>Beoordeling<select aria-label="Beoordeling klantimpact" value={reviewStatus} onChange={event => setReviewStatus(event.target.value)}>
          {Object.entries(STATUS).map(([key, label]) => <option key={key} value={key} disabled={key === 'reviewed_unaffected' && source.impact.clientAppointmentsComplete !== true}>{label}</option>)}
        </select></label>
        <label>Wat is afgesproken of moet worden opgevolgd?<textarea required minLength={3} maxLength={1000} value={summary} onChange={event => setSummary(event.target.value)} /></label>
        {reviewStatus === 'awaiting_customer' && <label>Opnieuw controleren op klantreactie<input required type="datetime-local" value={nextFollowUpAt} onChange={event => setNextFollowUpAt(event.target.value)} /></label>}
        {messages.length > 0 ? <label>Kies het klantbericht dat deze beoordeling onderbouwt<select required value={messageId} onChange={event => setMessageId(event.target.value)}>
          <option value="">Selecteer klantbericht</option>{messages.map(message => <option key={message.id} value={message.id}>{formatDate(message.createdAt, 'Datum onbekend')} / {message.excerpt}{message.hasMore ? '…' : ''}</option>)}
        </select></label> : <p role="status">Er is nog geen inkomend klantbericht beschikbaar. Registreer eerst de klantreactie in het bijbehorende klantgesprek.</p>}
        <button type="submit" className="secondary-button" disabled={busy || summary.trim().length < 3 || !selectedMessage
          || (reviewStatus === 'awaiting_customer' && !nextFollowUpAt)}>{busy ? 'Beoordeling vastleggen...' : 'Klantimpact vastleggen'}</button>
        </fieldset>
      </form>
      {pending && !busy && <button type="button" className="secondary-button" onClick={event => void submit(event)}>Dezelfde beoordeling opnieuw proberen</button>}
      <p>Dit legt jouw beoordeling vast. Er wordt geen klantbericht verstuurd en de afspraak wordt niet verplaatst.</p>
    </details>}
  </li>
}
