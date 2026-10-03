import { useCallback, useState } from 'react'
import { useSessionDraftRecovery } from '../draft-recovery'
import { useRecoveryCommand } from '../recovery-command'

const EMPTY_FORM = Object.freeze({ quantity: '', sourceReference: '', dispatchReference: '', evidenceReference: '', expectedArrivalAt: '', note: '', pending: null })

export default function WarehouseMaterialRecovery({ api, canEdit, source, recoveryCase, sourceHash, draftScope, onSubmitted, onError }) {
  const [form, setForm] = useState(EMPTY_FORM)
  const { busy, execute } = useRecoveryCommand({ api, jobId: recoveryCase.jobId, canEdit,
    pending: form.pending, setPending: value => setForm(current => ({ ...current, pending: value })), onError })
  const line = source.impact?.materialLines?.find(item => item.materialRequirementId === source.id)
  const restoreForm = useCallback(value => setForm(value || EMPTY_FORM), [])
  const hasContent = Object.entries(form).some(([key, value]) => key !== 'pending' && Boolean(value)) || Boolean(form.pending)
  useSessionDraftRecovery({ enabled: Boolean(draftScope), scope: draftScope,
    name: `warehouse-recovery:${recoveryCase.id}:${source.id}`,
    value: hasContent ? form : null, setValue: restoreForm })

  if (!line || Number(line.shortfallQuantity) <= 0) return null
  const linked = Boolean(line.warehouseMaterialId && line.warehouseUnitMatches)
  const canSubmit = canEdit && recoveryCase.sourceCurrent && ['open', 'monitoring'].includes(recoveryCase.status)
    && linked && Number(line.warehouseAvailableQuantity) > 0

  async function submit(event, retry = null) {
    event.preventDefault()
    const amount = Number(form.quantity)
    if (!canEdit || busy) return
    if (!retry && (!canSubmit || !Number.isFinite(amount) || amount <= 0 || amount > Number(line.warehouseAvailableQuantity)
      || amount > Number(line.shortfallQuantity) || !form.sourceReference.trim() || !form.dispatchReference.trim()
      || !form.evidenceReference.trim() || !form.expectedArrivalAt)) return
    const command = retry || form.pending || { action: 'warehouse_material_issue', entryKey: crypto.randomUUID(),
      caseId: recoveryCase.id, caseHash: recoveryCase.caseHash, sourceHash, sourceId: source.id, quantity: amount,
      sourceReference: form.sourceReference.trim(), dispatchReference: form.dispatchReference.trim(),
      evidenceReference: form.evidenceReference.trim(), expectedArrivalAt: new Date(form.expectedArrivalAt).toISOString(),
      note: form.note.trim() || undefined }
    await execute(command, result => { setForm(EMPTY_FORM); onSubmitted?.(result) })
  }

  return <section className="work-context" aria-label={`Magazijnvoorraad voor ${line.itemName}`}>
    <h5>Eigen magazijn</h5>
    <p>Tekort: {line.shortfallQuantity} {line.unit} / onderweg uit magazijn: {line.warehouseInTransitQuantity || 0} {line.unit}
      {line.undeliveredOrderQuantity > 0 ? ` / onderweg van leverancier: ${line.undeliveredOrderQuantity} ${line.unit}` : ''}</p>
    {!linked ? <p>Koppel eerst deze materiaalbehoefte aan een magazijnartikel met dezelfde eenheid.</p>
      : <p>Vrije voorraad: {line.warehouseAvailableQuantity} {line.unit}. Na uitgifte wordt dit pas beschikbaar voor het werk na ontvangstregistratie op locatie.</p>}
    {canEdit && recoveryCase.sourceCurrent && ['open', 'monitoring'].includes(recoveryCase.status) && linked && <form className="form-grid" onSubmit={event => void submit(event)}>
      <fieldset disabled={!canSubmit || busy || Boolean(form.pending)}>
        <label>Uit te geven hoeveelheid<input required type="number" min="0.0001" step="0.0001" max={Math.min(line.shortfallQuantity, line.warehouseAvailableQuantity)}
          value={form.quantity} onChange={event => setForm(current => ({ ...current, quantity: event.target.value }))} /></label>
        <label>Voorraadtelreferentie<input required minLength={2} maxLength={240} value={form.sourceReference}
          onChange={event => setForm(current => ({ ...current, sourceReference: event.target.value }))} /></label>
        <label>Uitgifte- of transportreferentie<input required minLength={2} maxLength={240} value={form.dispatchReference}
          onChange={event => setForm(current => ({ ...current, dispatchReference: event.target.value }))} /></label>
        <label>Bewijsreferentie<input required minLength={2} maxLength={240} value={form.evidenceReference}
          onChange={event => setForm(current => ({ ...current, evidenceReference: event.target.value }))} /></label>
        <label>Verwachte aankomst op locatie<input required type="datetime-local" value={form.expectedArrivalAt}
          onChange={event => setForm(current => ({ ...current, expectedArrivalAt: event.target.value }))} /></label>
        <label>Toelichting (optioneel)<textarea maxLength={1000} value={form.note}
          onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></label>
        <button type="submit" className="secondary-button" disabled={!canSubmit || busy || Boolean(form.pending)
          || !form.quantity || Number(form.quantity) <= 0 || Number(form.quantity) > Number(line.shortfallQuantity)
          || Number(form.quantity) > Number(line.warehouseAvailableQuantity) || !form.sourceReference.trim()
          || !form.dispatchReference.trim() || !form.evidenceReference.trim() || !form.expectedArrivalAt}>
          {busy ? 'Magazijnuitgifte vastleggen...' : 'Voorraad naar bouwplaats uitgeven'}
        </button>
      </fieldset>
    </form>}
    {form.pending && !busy && <button type="button" className="secondary-button" disabled={!canEdit} onClick={event => void submit(event, form.pending)}>
      Dezelfde uitgifte opnieuw proberen
    </button>}
  </section>
}
