import { useCallback, useState } from 'react'
import { useSessionDraftRecovery } from '../draft-recovery'
import { useRecoveryCommand } from '../recovery-command'

const STATUS = {
  estimate: 'Kostenraming vastgelegd',
  no_additional_cost: 'Geen extra kosten onderbouwd',
  unknown: 'Kostenimpact nog onbekend'
}
const date = value => value ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : ''
const money = cents => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(cents / 100)

export default function RecoveryCostImpactReview({ api, canEdit, recoveryCase, actualCostSources = [], sourceHash, draftScope = '', onSubmitted, onError }) {
  const [reviewStatus, setReviewStatus] = useState('estimate'), [amount, setAmount] = useState(''), [summary, setSummary] = useState('')
  const [actualSource, setActualSource] = useState(''), [actualAmount, setActualAmount] = useState(''), [actualRationale, setActualRationale] = useState('')
  const [reverseTarget, setReverseTarget] = useState('')
  const [evidenceReference, setEvidenceReference] = useState(''), [nextFollowUpAt, setNextFollowUpAt] = useState('')
  const [pending, setPending] = useState(null), [error, setError] = useState('')
  const { busy, execute } = useRecoveryCommand({ api, jobId: recoveryCase.jobId, canEdit, pending, setPending,
    onError: reason => { setError(reason.message || 'De kostenimpact kon niet worden vastgelegd.'); onError?.(reason) } })
  const commandDisabled = busy || Boolean(pending)
  const restoreDraft = useCallback(value => {
    setReviewStatus(value?.reviewStatus || 'estimate'); setAmount(value?.amount || '')
    setSummary(value?.summary || ''); setEvidenceReference(value?.evidenceReference || '')
    setNextFollowUpAt(value?.nextFollowUpAt || ''); setPending(value?.pending || null)
    setActualSource(value?.actualSource || ''); setActualAmount(value?.actualAmount || '')
    setActualRationale(value?.actualRationale || ''); setReverseTarget(value?.reverseTarget || '')
  }, [])
  const hasDraft = Boolean(amount || summary || evidenceReference || nextFollowUpAt || reviewStatus !== 'estimate' || pending
    || actualSource || actualAmount || actualRationale || reverseTarget)
  useSessionDraftRecovery({ enabled: Boolean(draftScope), scope: draftScope, name: `recovery-cost-impact:${recoveryCase.id}:${sourceHash}`,
    value: hasDraft ? { reviewStatus, amount, summary, evidenceReference, nextFollowUpAt, pending,
      actualSource, actualAmount, actualRationale, reverseTarget } : null, setValue: restoreDraft })
  const reviews = recoveryCase.costImpactReviews || []
  const currentActualCents = (recoveryCase.actualCostAttributions || [])
    .filter(item => !item.reversed && item.sourceCurrent).reduce((total, item) => total + item.amountCents, 0)
  const latestEstimate = [...reviews].reverse().find(item => item.current && item.status === 'estimate')

  async function submit(event) {
    event?.preventDefault()
    if (!canEdit || commandDisabled || !recoveryCase.sourceCurrent || summary.trim().length < 3) return
    const command = pending || { action: 'cost_impact_review', entryKey: crypto.randomUUID(), caseId: recoveryCase.id,
      caseHash: recoveryCase.caseHash, sourceHash, reviewStatus,
      ...(reviewStatus === 'estimate' ? { amount: Number(amount) } : {}),
      summary: summary.trim(), evidenceReference: evidenceReference.trim() || null,
      nextFollowUpAt: reviewStatus === 'unknown' && nextFollowUpAt ? new Date(nextFollowUpAt).toISOString() : null }
    await submitCommand(command)
  }

  async function submitActualCost(action, attributionId = null) {
    if (!canEdit || commandDisabled || !recoveryCase.sourceCurrent) return
    const source = actualCostSources.find(item => `${item.type}:${item.id}` === actualSource)
    if (action === 'actual_cost_attribution' && (!source || !actualRationale.trim())) return
    if (action === 'actual_cost_reversal' && !actualRationale.trim()) return
    const command = { action, entryKey: crypto.randomUUID(), caseId: recoveryCase.id,
      caseHash: recoveryCase.caseHash, sourceHash, rationale: actualRationale.trim(),
      ...(action === 'actual_cost_attribution' ? { sourceType: source.type, sourceId: source.id,
        sourceFingerprint: source.sourceFingerprint, amount: Number(actualAmount) } : { attributionId }) }
    await submitCommand(command)
  }

  async function submitCommand(command) {
    setError('')
    await execute(command, result => {
      if (command.action === 'cost_impact_review') {
        setAmount(''); setSummary(''); setEvidenceReference(''); setNextFollowUpAt('')
      } else {
        setActualRationale(''); setActualAmount(''); setReverseTarget('')
      }
      onSubmitted?.(result)
    })
  }

  return <section className="work-context" aria-label={`Kostenimpact ${recoveryCase.id}`}>
    <h5>Kosten van deze verstoring</h5>
    <p>Leg een indicatieve raming of onderbouwde nulimpact vast. Dit is geen boeking, factuur, betaalopdracht of klanttoezegging.</p>
    {reviews.length > 0 && <ol aria-label="Kostenbeoordelingsgeschiedenis">{reviews.map(review => <li key={review.id}>
      <strong>{STATUS[review.status]}{review.status === 'estimate' ? ` / ${money(review.amountCents)}` : ''}</strong>
      {review.current ? '' : ' / historische beoordeling; bron gewijzigd'}
      <p>{review.summary}{review.evidenceReference ? ` / bewijs: ${review.evidenceReference}` : ''}
        {review.nextFollowUpAt ? ` / opnieuw beoordelen ${date(review.nextFollowUpAt)}` : ''}</p>
      <small>Vastgelegd door {review.recordedBy} op {date(review.recordedAt)}</small>
    </li>)}</ol>}
    {latestEstimate && <p aria-label="Vergelijking raming en werkelijke kosten">
      Actuele raming: {money(latestEstimate.amountCents)}. Goedgekeurd en aan deze casus toegerekend tot nu toe: {money(currentActualCents)}.
      {' '}Verschil tot de raming: {money(latestEstimate.amountCents - currentActualCents)}. Dit is een tussentijdse vergelijking, geen eindafrekening.
    </p>}
    {(recoveryCase.actualCostAttributions || []).length > 0 && <div>
      <h6>Toegerekende goedgekeurde kosten</h6>
      <ul aria-label="Werkelijke kosten-toerekeningen">{recoveryCase.actualCostAttributions.map(item => <li key={item.id}>
        <strong>{money(item.amountCents)}</strong> van {item.sourceType === 'expense' ? 'onkostendeclaratie' : 'leveranciersfactuur'} {item.sourceId}
        {item.reversed ? ' / teruggedraaid' : !item.sourceCurrent ? ' / bron niet meer actueel goedgekeurd' : ''} <span>{item.rationale}</span>
        {!item.reversed && canEdit && recoveryCase.sourceCurrent && ['open', 'monitoring'].includes(recoveryCase.status) && <button type="button" className="secondary-button"
          disabled={commandDisabled} onClick={() => { setReverseTarget(item.id); setActualRationale('') }}>Toerekening corrigeren</button>}
      </li>)}</ul>
      {reverseTarget && <form className="form-grid" onSubmit={event => { event.preventDefault(); void submitActualCost('actual_cost_reversal', reverseTarget) }}>
        <fieldset disabled={!canEdit || commandDisabled}>
        <label>Reden correctie<textarea required minLength={3} maxLength={1000} value={actualRationale} onChange={event => setActualRationale(event.target.value)} /></label>
        <button type="submit" className="secondary-button" disabled={busy || actualRationale.trim().length < 3}>Toerekening terugdraaien</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => setReverseTarget('')}>Annuleren</button>
        </fieldset>
      </form>}
    </div>}
    {canEdit && recoveryCase.sourceCurrent && ['open', 'monitoring'].includes(recoveryCase.status) && actualCostSources.some(item => item.availableCents > 0) && <details>
      <summary>Goedgekeurde werkelijke kosten toerekenen</summary>
      <p>Alleen goedgekeurde kosten uit deze opdracht. Toerekenen maakt geen nieuwe boeking en verandert de bronpost niet. Bedragen zijn in euro; buitenlandse valuta kunnen pas na een controleerbare omrekening worden verdeeld.</p>
      <form className="form-grid" onSubmit={event => { event.preventDefault(); void submitActualCost('actual_cost_attribution') }}>
        <fieldset disabled={commandDisabled}>
          <label>Kostenpost<select required aria-label="Kostenpost voor toerekening" value={actualSource} onChange={event => setActualSource(event.target.value)}>
            <option value="">Selecteer een goedgekeurde kostenpost</option>
            {actualCostSources.filter(item => item.availableCents > 0).map(item => <option key={`${item.type}:${item.id}`} value={`${item.type}:${item.id}`}>
              {item.label} / beschikbaar {money(item.availableCents)}
            </option>)}
          </select></label>
          <label>Toegerekend bedrag<input aria-label="Toegerekend bedrag" required type="number" min="0.01" step="0.01" max={actualCostSources.find(item => `${item.type}:${item.id}` === actualSource)?.availableCents / 100 || undefined}
            value={actualAmount} onChange={event => setActualAmount(event.target.value)} /></label>
          <label>Reden van toerekening<textarea aria-label="Reden van toerekening" required minLength={3} maxLength={1000} value={actualRationale} onChange={event => setActualRationale(event.target.value)} /></label>
          <button type="submit" className="secondary-button" disabled={busy || !actualSource || !actualAmount || Number(actualAmount) <= 0 || actualRationale.trim().length < 3}>
            {busy ? 'Toerekening vastleggen...' : 'Werkelijke kosten toerekenen'}
          </button>
        </fieldset>
      </form>
    </details>}
    {canEdit && recoveryCase.sourceCurrent && ['open', 'monitoring'].includes(recoveryCase.status) && <details>
      <summary>Kostenimpact beoordelen</summary>
      <form className="form-grid" onSubmit={submit}>
        <fieldset disabled={busy || Boolean(pending)}>
          <label>Beoordeling<select aria-label="Beoordeling kostenimpact" value={reviewStatus} onChange={event => setReviewStatus(event.target.value)}>
            {Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </select></label>
          {reviewStatus === 'estimate' && <label>Indicatieve raming in euro<input aria-label="Indicatieve raming in euro" type="number" min="0" max="100000000" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} /></label>}
          <label>Onderbouwing<textarea required minLength={3} maxLength={1000} value={summary} onChange={event => setSummary(event.target.value)} /></label>
          {reviewStatus !== 'unknown' && <label>Bewijsbron kostenimpact<input required maxLength={500} value={evidenceReference} onChange={event => setEvidenceReference(event.target.value)} /></label>}
          {reviewStatus === 'unknown' && <label>Opnieuw beoordelen op<input required type="datetime-local" value={nextFollowUpAt} onChange={event => setNextFollowUpAt(event.target.value)} /></label>}
          <button type="submit" className="secondary-button" disabled={busy || summary.trim().length < 3
            || (reviewStatus === 'estimate' && (amount === '' || !Number.isFinite(Number(amount)) || Number(amount) < 0))
            || (reviewStatus !== 'unknown' && !evidenceReference.trim()) || (reviewStatus === 'unknown' && !nextFollowUpAt)}>
            {busy ? 'Beoordeling vastleggen...' : 'Kostenimpact vastleggen'}
          </button>
        </fieldset>
      </form>
    </details>}
    {error && <p role="alert">{error}</p>}
    {pending && !busy && <button type="button" className="secondary-button" disabled={!canEdit} onClick={() => void submitCommand(pending)}>
      {pending.action === 'cost_impact_review' ? 'Dezelfde beoordeling opnieuw proberen' : 'Dezelfde kostentoerekening opnieuw proberen'}
    </button>}
  </section>
}
