import { useCallback, useEffect, useRef, useState } from 'react'
import { cancellableRead } from '../cancellable-read.mjs'
import { ArrowDownToLine, Plus, RefreshCw, Save, Trash2 } from 'lucide-react'
import { useSessionDraftRecovery } from '../draft-recovery'
import './WorkContextControl.css'
import './WorkBalance.css'

const labels = {
  baseline_required: 'Goedgekeurde productiegrondslag nodig', allocation_required: 'Werkverdeling ontbreekt', current: 'Actueel',
  source_changed: 'Bron gewijzigd; herbeoordeling nodig', review_pending: 'Werkverdeling wacht op beoordeling',
  reconciliation_required: 'Uitvoering of toerekening controleren', pending: 'Wacht op beoordeling', approved: 'Goedgekeurd',
  superseded: 'Vervangen door een nieuwere verdeling', rejected: 'Afgewezen'
}
const units = new Intl.NumberFormat('nl-NL', { maximumFractionDigits: 4 })
const initialRecord = data => ({ sourceHash: data?.sourceHash, allocations: data?.options?.baseline?.lines.map(line => ({ lineKey: line.lineKey,
  packageId: data.options.packages.find(pack => pack.taskIds.length && !pack.places.some(place => place.archived))?.id || '', plannedQuantity: String(line.plannedQuantity) })) || [],
  reference: '', reason: '', scopeConfirmed: false })

export default function WorkBalanceControl({ api, jobId, canEdit = false, refreshKey = '', draftScope = '', onChanged }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [version, setVersion] = useState(0)
  const [record, setRecord] = useState(null), [pending, setPending] = useState(null)
  const locked = useRef(false), alive = useRef(true), url = `/api/ledger/jobs/${encodeURIComponent(jobId)}/work-balance`
  const restoreDraft = useCallback(value => {
    setRecord(value?.record || null)
    setPending(value?.pending || null)
  }, [])
  const recoverableDraft = record || pending
    ? { sourceHash: record?.sourceHash || pending?.sourceHash, record, pending }
    : null
  useSessionDraftRecovery({ enabled: Boolean(draftScope), scope: draftScope, name: `work-balance:${jobId}`, value: recoverableDraft, setValue: restoreDraft })
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    setLoading(true)
    return cancellableRead(api, url, result => { setData(result); setError('') },
      reason => setError(reason.message), () => setLoading(false))
  }, [api, url, version, refreshKey])
  useEffect(() => {
    if (!data) return
    const staleRecord = record && record.sourceHash !== data.sourceHash
    const staleCommand = pending && pending.sourceHash !== data.sourceHash
    if (staleRecord || staleCommand) {
      setRecord(null)
      setPending(null)
    }
  }, [data, pending, record])
  const set = (key, value) => setRecord(previous => ({ ...previous, [key]: value }))
  function patchRow(index, key, value) {
    setRecord(current => ({ ...current, allocations: current.allocations.map((row, at) => at === index ? { ...row, [key]: value } : row) }))
  }
  async function submit(retry) {
    if (locked.current || !canEdit || !data || loading || (pending && !retry) || (record && record.sourceHash !== data.sourceHash)) return
    const { sourceHash: _sourceHash, ...submittedRecord } = record || {}
    const command = retry || { action: 'plan', entryKey: crypto.randomUUID(), sourceHash: data.sourceHash, record: submittedRecord }
    locked.current = true; setBusy(true); setPending(command); setError(''); setNotice('')
    try {
      await api(url, { method: 'POST', body: JSON.stringify(command) })
      if (!alive.current) return
      setPending(null); setRecord(null); setVersion(value => value + 1); setNotice('Werkverdeling naar Goedkeuringen gestuurd.'); onChanged?.()
    } catch (reason) {
      if (!alive.current) return
      setError(reason.message)
      if ([400, 403, 404, 409, 413, 423].includes(reason.status || reason.statusCode)) setPending(null)
    } finally { locked.current = false; if (alive.current) setBusy(false) }
  }
  function exportData() {
    if (!data) return
    const link = document.createElement('a'), address = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    link.href = address; link.download = `werkbalans-${jobId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(address), 1000)
  }
  const disabled = busy || loading || Boolean(pending)
  const state = row => labels[row] || 'Controleren'
  const options = data?.options || { baseline: null, packages: [] }
  const totals = new Map((options.baseline?.lines || []).map(line => [line.lineKey, 0]))
  for (const row of record?.allocations || []) if (totals.has(row.lineKey) && Number.isFinite(Number(row.plannedQuantity))) totals.set(row.lineKey, totals.get(row.lineKey) + Number(row.plannedQuantity))
  const totalsMatch = Boolean(options.baseline?.lines.length && options.baseline.lines.every(line =>
    Math.round((totals.get(line.lineKey) || 0) * 10000) === Math.round(Number(line.plannedQuantity) * 10000)))
  return <section className="work-context work-balance job-workspace-section" aria-label="Werkbalans">
    <header><h3>Werkbalans</h3><div className="context-actions">
      <button type="button" className="icon-button" title="Werkbalans verversen" aria-label="Werkbalans verversen" disabled={disabled} onClick={() => { setNotice(''); setVersion(value => value + 1); onChanged?.() }}><RefreshCw size={18} /></button>
      <button type="button" className="icon-button" title="Werkbalans exporteren" aria-label="Werkbalans exporteren" disabled={!data || disabled} onClick={exportData}><ArrowDownToLine size={18} /></button>
    </div></header>
    <p>Verdeel de goedgekeurde productiehoeveelheden eenmalig over werkpakketten. Uitvoering en nieuwe posities volgen daarna dezelfde actuele verdeling.</p>
    {loading && <p role="status">Werkbalans laden...</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {pending && !busy && canEdit && <button type="button" className="secondary-button" onClick={() => submit(pending)}><RefreshCw size={16} />Dezelfde wijziging opnieuw proberen</button>}
    {data && <>
      <p><strong>{state(data.state)}</strong>{data.planVersion ? ` / versie ${data.planVersion}` : ''}</p>
      {data.state === 'baseline_required' && <p>Keuring, uren en hoeveelheden kunnen pas worden verdeeld nadat een productiegrondslag is goedgekeurd.</p>}
      {data.packages.length > 0 && <div className="balance-packages">{data.packages.map(pack => <article key={pack.id} className="balance-package">
        <h4>{pack.code} / {pack.title}</h4><p><strong>{state(pack.state)}</strong></p>
        {pack.rows.map((row, index) => <p key={`${row.lineKey}-${index}`}>{row.description}: {units.format(row.allocatedOutputQuantity)} van {units.format(row.plannedQuantity)} {row.unit} gemeld{row.remainingQuantity == null ? ' / resterend te controleren' : ` / ${units.format(row.remainingQuantity)} ${row.unit} resterend`}{row.excessQuantity > 0 ? ` / ${units.format(row.excessQuantity)} ${row.unit} extra gemeld` : ''}</p>)}
        {pack.taskScopeMismatch && <p>De hoeveelheid en taakstatus sluiten niet op elkaar aan. Controleer uitvoering en werkpakket.</p>}
        {pack.rows.some(row => row.remainingLaborEstimate != null) && <p>Resterende richturen: {units.format(pack.remainingLaborEstimate)}. Dit is geen ingeplande duur.</p>}
        {!pack.rows.length && <p>Geen gemeten hoeveelheid toegewezen.</p>}
      </article>)}</div>}
      {data.lines.length > 0 && <section className="balance-lines" aria-label="Productiegrondslag en toerekening"><h4>Geplande productie</h4>{data.lines.map(line => <p key={line.lineKey}>
        {line.description}: {units.format(line.plannedQuantity)} {line.unit} gepland; {units.format(line.reportedQuantity)} {line.unit} gemeld; {line.remainingQuantity == null ? 'resterend te controleren' : `${units.format(line.remainingQuantity)} ${line.unit} resterend`}{line.unallocatedQuantity > 0 ? `; ${units.format(line.unallocatedQuantity)} ${line.unit} nog niet toegerekend` : ''}{line.pendingCorrectionQuantity > 0 ? `; ${units.format(line.pendingCorrectionQuantity)} ${line.unit} in correctiebeoordeling` : ''}{line.excessQuantity > 0 ? `; ${units.format(line.excessQuantity)} ${line.unit} extra gemeld` : ''}
      </p>)}</section>}
      {data.unassignedEntries.length > 0 && <p role="status">{data.unassignedEntries.length} productiemeting(en) moeten nog aan de goedgekeurde verdeling worden toegerekend.</p>}
      {data.history.length > 0 && <details><summary>Eerdere verdelingen ({data.history.length})</summary>{data.history.map(plan => <article key={plan.id}>
        <h4>Versie {plan.sequence}: {state(plan.status)}{!plan.sourceCurrent ? ' / bron gewijzigd' : ''}</h4><p>{plan.reason}</p><p>{plan.reference}</p>
        <ul>{plan.scope.map((row, index) => <li key={`${row.lineKey}-${row.packageId}-${index}`}>{row.packageCode} / {row.packageTitle}: {row.description}, {units.format(row.plannedQuantity)} {row.unit}</li>)}</ul>
      </article>)}</details>}
      {canEdit && !record && <button type="button" className="secondary-button" disabled={disabled || !options.baseline || Boolean(data.history.some(row => row.status === 'pending'))}
        onClick={() => { setRecord(initialRecord(data)); setNotice(''); setError('') }}><Plus size={16} />{data.activePlanId ? 'Werkverdeling herzien' : 'Werkverdeling opstellen'}</button>}
      {canEdit && record && <form aria-label="Werkverdeling opstellen" onSubmit={event => { event.preventDefault(); void submit() }}>
        <fieldset disabled={disabled}><legend>Werkverdeling / versie {data.planVersion ? data.planVersion + 1 : 1}</legend>
          <p>Elke geplande regel moet volledig worden verdeeld. Controleer de verdeling met de opdrachtgever, werkpakketten en locatiegegevens.</p>
          {record.allocations.map((row, index) => {
            const line = options.baseline?.lines.find(item => item.lineKey === row.lineKey)
            return <fieldset className="balance-allocation" key={`${row.lineKey}-${index}`}><legend>Toerekening {index + 1}</legend>
              <label>Productieregel<select required value={row.lineKey} onChange={event => patchRow(index, 'lineKey', event.target.value)}>
                {options.baseline?.lines.map(item => <option key={item.lineKey} value={item.lineKey}>{item.description} / {item.plannedQuantity} {item.unit}</option>)}
              </select></label>
              <label>Werkpakket<select required value={row.packageId} onChange={event => patchRow(index, 'packageId', event.target.value)}>
                <option value="">Selecteer werkpakket</option>{options.packages.map(pack => <option key={pack.id} value={pack.id} disabled={!pack.taskIds.length || pack.places.some(place => place.archived)}>{pack.code} / {pack.title}{!pack.taskIds.length ? ' / geen gekoppelde werkzaamheden' : ''}</option>)}
              </select></label>
              <label>Hoeveelheid ({line?.unit || 'eenheid'})<input required type="number" min="0.0001" max={line?.plannedQuantity || 1000000000} step="0.0001" value={row.plannedQuantity} onChange={event => patchRow(index, 'plannedQuantity', event.target.value)} /></label>
              <button type="button" className="icon-button" title={`Toerekening ${index + 1} verwijderen`} aria-label={`Toerekening ${index + 1} verwijderen`} onClick={() => setRecord(current => ({ ...current, allocations: current.allocations.filter((_, at) => at !== index) }))}><Trash2 size={18} /></button>
            </fieldset>
          })}
          <div className="context-actions"><button type="button" className="secondary-button" disabled={!options.baseline?.lines.length || !options.packages.length}
            onClick={() => setRecord(current => ({ ...current, allocations: [...current.allocations, { lineKey: options.baseline.lines[0].lineKey, packageId: '', plannedQuantity: String(options.baseline.lines[0].plannedQuantity) }] }))}><Plus size={16} />Regel toevoegen</button></div>
          {options.baseline?.lines.map(line => <p key={line.lineKey}><strong>{line.description}:</strong> {units.format(totals.get(line.lineKey) || 0)} / {units.format(line.plannedQuantity)} {line.unit} verdeeld</p>)}
          {!totalsMatch && <p role="status">Verdeel per productieregel exact de volledige geplande hoeveelheid voordat je indient.</p>}
          <label>Afbakening en bron<textarea required maxLength={2000} value={record.reference} onChange={event => set('reference', event.target.value)} /></label>
          <label>Onderbouwing voor beoordelaar<textarea required maxLength={2000} value={record.reason} onChange={event => set('reason', event.target.value)} /></label>
          <label className="balance-confirm"><input type="checkbox" required checked={record.scopeConfirmed} onChange={event => set('scopeConfirmed', event.target.checked)} />De volledige productiegrondslag is precies eenmaal over de juiste werkpakketten verdeeld.</label>
          <div className="context-actions"><button type="submit" className="primary-button" disabled={!record.allocations.length || !totalsMatch || record.sourceHash !== data.sourceHash}><Save size={16} />Ter beoordeling indienen</button>
            <button type="button" className="secondary-button" onClick={() => setRecord(null)}>Annuleren</button></div>
        </fieldset>
      </form>}
    </>}
  </section>
}
