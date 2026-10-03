import { useCallback, useState } from 'react'
import { useSessionDraftRecovery } from '../draft-recovery'
import { useRecoveryCommand } from '../recovery-command'

const STATUS = {
  not_impacted: 'Contractdatum niet geraakt',
  at_risk: 'Contractdatum loopt risico',
  decision_required: 'Besluit nodig over contractdatum'
}
const date = value => value ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: value.length > 10 ? 'short' : undefined }).format(new Date(value)) : 'Niet gepland'

export default function ClientDateImpactReview({ api, canEdit, recoveryCase, sourceHash, draftScope = '', onSubmitted, onError }) {
  const commitments = [...new Map(recoveryCase.sources.flatMap(source => source.impact?.clientDateCommitments || [])
    .filter(item => item.status === 'active' && item.sourceCurrent).map(item => [item.entryKey, item])).values()]
  const firstCommitmentEntryKey = commitments[0]?.entryKey || ''
  const reviews = recoveryCase.clientDateImpactReviews || []
  const [entryKey, setEntryKey] = useState(firstCommitmentEntryKey), [reviewStatus, setReviewStatus] = useState('at_risk')
  const [summary, setSummary] = useState(''), [nextFollowUpAt, setNextFollowUpAt] = useState(''), [pending, setPending] = useState(null), [error, setError] = useState('')
  const { busy, execute } = useRecoveryCommand({ api, jobId: recoveryCase.jobId, canEdit, pending, setPending,
    onError: reason => { setError(reason.message || 'De contractimpact kon niet worden vastgelegd.'); onError?.(reason) } })
  const restoreForm = useCallback(value => {
    setEntryKey(value?.entryKey || firstCommitmentEntryKey)
    setReviewStatus(value?.reviewStatus || 'at_risk')
    setSummary(value?.summary || '')
    setNextFollowUpAt(value?.nextFollowUpAt || '')
    setPending(value?.pending || null)
  }, [firstCommitmentEntryKey])
  const hasFormDraft = Boolean(summary || nextFollowUpAt || reviewStatus !== 'at_risk' || pending)
  useSessionDraftRecovery({ enabled: Boolean(draftScope), scope: draftScope, name: `client-date-impact:${recoveryCase.id}:${sourceHash}`,
    value: hasFormDraft ? { entryKey, reviewStatus, summary, nextFollowUpAt, pending } : null, setValue: restoreForm })
  if (!commitments.length && !reviews.length) return null
  const commitment = commitments.find(item => item.entryKey === entryKey)
  const statusLabel = review => `${STATUS[review.status] || review.status}${review.current ? '' : ' / historische beoordeling; bron of contractversie gewijzigd'}`

  async function submit(event) {
    event?.preventDefault()
    if (!canEdit || busy || !recoveryCase.sourceCurrent || !commitment || summary.trim().length < 3
      || (reviewStatus !== 'not_impacted' && !nextFollowUpAt)) return
    const command = pending || { action: 'client_date_impact_review', entryKey: crypto.randomUUID(), caseId: recoveryCase.id,
      caseHash: recoveryCase.caseHash, sourceHash, commitmentEntryKey: commitment.entryKey, commitmentHash: commitment.commitmentHash,
      reviewStatus, summary: summary.trim(), nextFollowUpAt: nextFollowUpAt || null }
    setError('')
    await execute(command, result => { setSummary(''); setNextFollowUpAt(''); onSubmitted?.(result) })
  }

  return <section className="work-context" aria-label={`Contractimpact ${recoveryCase.id}`}>
    <h5>Impact op contractuele klantdatums</h5>
    <p>Beoordeel per vastgelegde mijlpaal wat deze verstoring betekent. Dit wijzigt geen contract, planning of klantbericht.</p>
    {commitments.length > 0 && <ul aria-label="Actuele contractuele klantdatums">{commitments.map(item => <li key={item.entryKey}>
      <strong>{item.label}: {date(item.date)}</strong> / revisie {item.revision} / {item.source.title} / {item.evidenceReference}
    </li>)}</ul>}
    {reviews.length > 0 && <ul>{reviews.map(review => <li key={review.id}>
      <strong>{review.commitment.label}: {date(review.commitment.date)}</strong> / {statusLabel(review)}
      <p>{review.summary}{review.nextFollowUpAt ? ` / opnieuw beoordelen ${date(review.nextFollowUpAt)}` : ''}</p>
      <p>Contracttekst: “{review.commitment.contractWording}” / {review.commitment.evidenceReference} / beoordeling door {review.recordedBy} op {date(review.recordedAt)}</p>
    </li>)}</ul>}
    {canEdit && recoveryCase.sourceCurrent && ['open', 'monitoring'].includes(recoveryCase.status) && commitments.length > 0 && <details>
      <summary>Contractimpact beoordelen</summary>
      {error && <p role="alert">{error}</p>}
      <form className="form-grid" onSubmit={submit}>
        <fieldset disabled={busy || Boolean(pending)}>
        <label>Contractuele mijlpaal<select required value={entryKey} onChange={event => setEntryKey(event.target.value)}>
          {commitments.map(item => <option key={item.entryKey} value={item.entryKey}>{item.label} / {date(item.date)} / revisie {item.revision}</option>)}
        </select></label>
        {commitment && <blockquote>{commitment.contractWording}<br /><small>{commitment.evidenceReference} / bron {commitment.source.title}</small></blockquote>}
        <label>Beoordeling<select aria-label="Beoordeling contractimpact" value={reviewStatus} onChange={event => setReviewStatus(event.target.value)}>
          {Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
        </select></label>
        <label>Waarom is deze mijlpaal wel of niet geraakt?<textarea required minLength={3} maxLength={1000} value={summary} onChange={event => setSummary(event.target.value)} /></label>
        {reviewStatus !== 'not_impacted' && <label>Opnieuw beoordelen op<input required type="datetime-local" value={nextFollowUpAt} onChange={event => setNextFollowUpAt(event.target.value)} /></label>}
        <button type="submit" className="secondary-button" disabled={busy || summary.trim().length < 3 || !commitment
          || (reviewStatus !== 'not_impacted' && !nextFollowUpAt)}>{busy ? 'Beoordeling vastleggen...' : 'Contractimpact vastleggen'}</button>
        </fieldset>
      </form>
      {pending && !busy && <button type="button" className="secondary-button" onClick={() => void submit()}>Dezelfde beoordeling opnieuw proberen</button>}
      <p>De vastgelegde contracttekst blijft ongewijzigd. Er wordt geen klantbericht verstuurd en geen datum aangepast.</p>
    </details>}
  </section>
}
