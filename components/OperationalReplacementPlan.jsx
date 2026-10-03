import { useCallback, useState } from 'react'
import { useSessionDraftRecovery } from '../draft-recovery'
import { formatDate } from '../format-date.mjs'
import { useRecoveryCommand } from '../recovery-command'


export default function OperationalReplacementPlan({ api, canEdit, source, recoveryCase, draftScope, onSubmitted, onError }) {
  const [selections, setSelections] = useState({}), [reason, setReason] = useState(recoveryCase.recoveryAction || '')
  const [pending, setPending] = useState(null)
  const { busy, execute } = useRecoveryCommand({ api, canEdit, pending, setPending, onError,
    url: `/api/ledger/workers/${encodeURIComponent(source.workerId)}/availability/${encodeURIComponent(source.id)}/replacement-plan` })
  const restoreDraft = useCallback(value => {
    setSelections(value?.selections || {})
    setReason(value?.reason ?? recoveryCase.recoveryAction ?? '')
    setPending(value?.pending || null)
  }, [recoveryCase.recoveryAction])
  const hasDraft = pending || Object.keys(selections).length > 0 || reason !== (recoveryCase.recoveryAction || '')
  useSessionDraftRecovery({ enabled: Boolean(draftScope), scope: draftScope,
    name: `replacement-plan:${recoveryCase.id}:${source.id}:${source.sourceFingerprint || 'current'}`,
    value: hasDraft ? { selections, reason, pending } : null, setValue: restoreDraft })
  const conflicts = source.impact?.crossJobConflicts || []
  const complete = conflicts.every(conflict => selections[conflict.assignmentId])
  const validReason = reason.trim().length > 7
  const candidatesComplete = conflicts.every(conflict => conflict.replacementCandidates?.length)

  async function submit() {
    if (!canEdit || busy || !source.workerId || !source.impact?.crossJobConflictListComplete || !conflicts.length
      || (!pending && (!complete || !validReason || !candidatesComplete))) return
    const command = pending || { assignments: conflicts.map(conflict => ({ assignmentId: conflict.assignmentId, workerId: selections[conflict.assignmentId] })), reason: reason.trim() }
    await execute(command, result => { setSelections({}); setReason(recoveryCase.recoveryAction || ''); onSubmitted(result) })
  }

  return <section className="work-context" aria-label="Vervanging over opdrachten">
    <h5>Bezetting herstellen over opdrachten heen</h5>
    {source.impact?.replacementPlan ? <p role="status">Vervangingsplan ingediend voor onafhankelijke goedkeuring: {source.impact.replacementPlan.id}. Bezetting blijft ongewijzigd tot besluit.</p>
      : !source.impact?.crossJobConflictListComplete ? <p role="status">De volledige lijst met geraakte opdrachten kon niet worden bevestigd. Open de personeelsplanning om de volledige vervangingsronde te beoordelen.</p>
        : conflicts.map(conflict => <div className="context-actions" key={conflict.assignmentId}>
          <label>{conflict.jobTitle} / {formatDate(conflict.scheduledStart)} tot {formatDate(conflict.scheduledEnd)}
            <select aria-label={`Vervanger voor ${conflict.jobTitle}`} disabled={!canEdit || busy || Boolean(pending)} value={selections[conflict.assignmentId] || ''}
              onChange={event => setSelections(current => ({ ...current, [conflict.assignmentId]: event.target.value }))}>
              <option value="">Kies een geschikte vervanger</option>
              {(conflict.replacementCandidates || []).map(candidate => <option key={candidate.worker.id} value={candidate.worker.id}>
                {candidate.worker.name} / {candidate.worker.role}{candidate.matchedSkills?.length ? ` / ${candidate.matchedSkills.join(', ')}` : ''}
              </option>)}
            </select>
          </label>
          {!conflict.replacementCandidates?.length && <p>Geen beschikbare, rol- en kwalificatiegeschikte vervanger gevonden. Beoordeel de werkvolgorde of capaciteit handmatig.</p>}
        </div>)}
    {!source.impact?.replacementPlan && source.impact?.crossJobConflictListComplete && conflicts.length > 0 && <>
      <label>Reden voor de gecoördineerde vervanging<textarea maxLength={1000} disabled={!canEdit || busy || Boolean(pending)} value={reason} onChange={event => setReason(event.target.value)} /></label>
      <button type="button" className="secondary-button" disabled={!canEdit || busy || Boolean(pending) || !complete || !validReason || !candidatesComplete} onClick={() => void submit()}>
        {busy ? 'Vervangingsplan indienen...' : `Alle ${conflicts.length} opdracht(en) als één plan ter goedkeuring indienen`}
      </button>
      {pending && !busy && <button type="button" className="secondary-button" disabled={!canEdit} onClick={() => void submit()}>Hetzelfde vervangingsplan opnieuw proberen</button>}
      <p>Alle opdrachten worden samen opnieuw gecontroleerd. Een tweede bevoegde persoon moet het plan goedkeuren; dit verstuurt geen klantbericht en wijzigt nog geen rooster.</p>
    </>}
  </section>
}
