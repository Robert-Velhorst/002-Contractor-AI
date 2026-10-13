import { useCallback, useState } from 'react'
import { useSessionDraftRecovery } from '../draft-recovery'
import { useRecoveryCommand } from '../recovery-command'
import { toIsoDateTimeInTimeZone } from '../dashboard-format'

const STATUS = {
  contact_recorded: 'Contactmoment vastgelegd',
  no_response: 'Nog geen reactie',
  delivery_date_confirmed: 'Leverdatum bevestigd door leverancier',
  alternative_proposed: 'Alternatief voorgesteld'
}
const EMPTY_FORM = Object.freeze({ followUpStatus: 'contact_recorded', summary: '', evidenceReference: '', expectedAt: '', nextFollowUpAt: '', applyExpectedAvailability: false, pending: null })

export default function SupplierRecoveryForm({ api, canEdit, source, recoveryCase, sourceHash, draftScope, onSubmitted, onError }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const { busy, execute } = useRecoveryCommand({ api, jobId: recoveryCase.jobId, canEdit,
    pending: form.pending, setPending: value => setForm(current => ({ ...current, pending: value })), onError })
  const restoreForm = useCallback(value => setForm(value || EMPTY_FORM), [])
  const formHasContent = form.followUpStatus !== 'contact_recorded' || form.summary || form.evidenceReference || form.expectedAt || form.nextFollowUpAt || form.applyExpectedAvailability || form.pending
  useSessionDraftRecovery({ enabled: Boolean(draftScope), scope: draftScope,
    name: `supplier-recovery:${recoveryCase.id}:${source.type}:${source.id}:${source.sourceFingerprint || 'current'}`, value: formHasContent ? form : null, setValue: restoreForm })
  const order = source.impact?.purchaseOrder
  const availabilityTargets = [...new Map((source.impact?.materialLines || [])
    .filter(line => Number(line.shortfallQuantity) > 0 && line.materialRequirementId)
    .map(line => [line.materialRequirementId, line])).values()]
  const availabilityTarget = availabilityTargets.length === 1 && order?.orderIssued === true && order?.externalCommitments === 1
    ? availabilityTargets[0] : null

  function update(key, value) {
    setForm(current => ({ ...current, [key]: value,
      ...(key === 'followUpStatus' && value !== 'delivery_date_confirmed' ? { applyExpectedAvailability: false } : {}) }))
  }

  async function submit(event, retry = null) {
    event.preventDefault()
    if (!canEdit || busy || !recoveryCase.sourceCurrent || !order || form.summary.trim().length < 3 || form.evidenceReference.trim().length < 3
      || (form.followUpStatus === 'no_response' && !form.nextFollowUpAt) || (form.followUpStatus === 'delivery_date_confirmed' && !form.expectedAt)) return
    const command = retry || form.pending || { action: 'supplier_follow_up', entryKey: crypto.randomUUID(), caseId: recoveryCase.id,
      caseHash: recoveryCase.caseHash, sourceHash, sourceId: source.id, followUpStatus: form.followUpStatus,
      summary: form.summary.trim(), evidenceReference: form.evidenceReference.trim(),
      expectedAt: form.expectedAt ? toIsoDateTimeInTimeZone(form.expectedAt, 'Europe/Amsterdam') : null,
      nextFollowUpAt: form.nextFollowUpAt ? toIsoDateTimeInTimeZone(form.nextFollowUpAt, 'Europe/Amsterdam') : null,
      applyExpectedAvailability: form.applyExpectedAvailability === true,
      materialRequirementId: form.applyExpectedAvailability ? availabilityTarget?.materialRequirementId || null : null }
    await execute(command, result => { setForm(EMPTY_FORM); onSubmitted?.(result) })
  }

  return <>
    <form className="form-grid" onSubmit={submit}>
      <fieldset disabled={!canEdit || busy || Boolean(form.pending)}>
      <label>Uitkomst<select value={form.followUpStatus} onChange={event => update('followUpStatus', event.target.value)}>
        {Object.entries(STATUS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label>Wat is besproken of bevestigd?<textarea required minLength={3} maxLength={1000} value={form.summary} onChange={event => update('summary', event.target.value)} /></label>
      {form.followUpStatus === 'delivery_date_confirmed' && <label>Door leverancier genoemde leverdatum<input required type="datetime-local" value={form.expectedAt} onChange={event => update('expectedAt', event.target.value)} /></label>}
      {form.followUpStatus === 'delivery_date_confirmed' && availabilityTarget && <>
        <label><input type="checkbox" checked={form.applyExpectedAvailability} onChange={event => update('applyExpectedAvailability', event.target.checked)} />Gebruik deze datum in de materiaalprognose voor deze gekoppelde behoefte</label>
        <p>Interne prognose; bestelling en klantplanning blijven staan. Resourceplan vereist aparte goedkeuring.</p>
      </>}
      {form.followUpStatus === 'no_response' && <label>Opnieuw contact opnemen op<input required type="datetime-local" value={form.nextFollowUpAt} onChange={event => update('nextFollowUpAt', event.target.value)} /></label>}
      <label>Bewijsreferentie (bijv. e-maildatum of gespreksnotitie)<input required minLength={3} maxLength={500} value={form.evidenceReference} onChange={event => update('evidenceReference', event.target.value)} /></label>
      <button type="submit" className="secondary-button" disabled={busy || Boolean(form.pending) || form.summary.trim().length < 3 || form.evidenceReference.trim().length < 3
        || (form.followUpStatus === 'no_response' && !form.nextFollowUpAt) || (form.followUpStatus === 'delivery_date_confirmed' && !form.expectedAt)}>
        {busy ? 'Opvolging vastleggen...' : 'Opvolging vastleggen'}
      </button>
      </fieldset>
    </form>
    {form.pending && !busy && <button type="button" className="secondary-button" disabled={!canEdit} onClick={event => void submit(event, form.pending)}>Dezelfde opvolging opnieuw proberen</button>}
  </>
}
