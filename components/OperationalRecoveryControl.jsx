import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cancellableRead } from '../cancellable-read.mjs'
import { RefreshCw, Save } from 'lucide-react'
import { useSessionDraftRecovery } from '../draft-recovery'
import { createDateFormatter, formatDate } from '../format-date.mjs'
import './WorkContextControl.css'

const TYPE = { worker_availability: 'Beschikbaarheid uitvoerder', field_progress_blocker: 'Blokkade uitvoerende', material_receipt: 'Materiaaltekort of leveringsafwijking', material_requirement_shortfall: 'Materiaaltekort', safety_incident: 'Veiligheidsmelding', quality_nonconformance: 'Kwaliteitsafwijking', equipment_unavailable: 'Materieel niet inzetbaar' }
const ACTION = { replace_worker: 'Vervangende uitvoerder beoordelen', resequence_work: 'Werkvolgorde beoordelen', recover_material: 'Materiaalherstel onderzoeken', recover_equipment: 'Materieelherstel onderzoeken', stop_and_review: 'Werk stilleggen en beoordelen', review_only: 'Situatie beoordelen', other: 'Anders' }
const OperationalRecoveryCase = lazy(() => import('./OperationalRecoveryCase'))
const MATERIAL_READINESS = { covered: 'tekort gedekt', expected_by_task_start: 'beschikbaar voor start',
  expected_after_task_start: 'beschikbaar na start', availability_unknown: 'leverdatum onbekend',
  task_not_scheduled: 'taak niet ingepland', not_comparable: 'planning onbekend' }

function MaterialReadinessSummary({ source, jobId, canEdit }) {
  return (source.impact?.scheduleProjection?.materialReadiness || []).map(line => <span key={`${source.id}:${line.materialRequirementId}`}>
    {line.tasks.map(task => <span key={task.taskId}> / {line.itemName}: {MATERIAL_READINESS[task.status] || 'onbekend'} / {task.title}
      {task.plannedStart ? ` start ${formatDate(task.plannedStart)}` : ''}
      {line.expectedAvailableAt ? ` / verwacht ${formatDate(line.expectedAvailableAt)}${line.evidenceReference ? ` [${line.evidenceReference}]` : ''}` : ''}
    </span>)}
    {line.supplierLeadTimeRisks?.map(risk => <small className="context-source-note" key={`${source.id}:${risk.supplier}:${risk.requiredBy}`}>
      Historisch leverrisico voor {risk.supplier}: P75 {risk.historicalLeadTimeDays} dagen op basis van {risk.sampleSize} afgeronde bestellingen;
      vergelijkingsdatum {formatDate(risk.historicalP75EquivalentCompletionAt)} ligt na benodigd {formatDate(risk.requiredBy)}. Dit is geen actuele ETA.
    </small>)}
    {canEdit && line.tasks.some(task => ['expected_after_task_start', 'availability_unknown', 'task_not_scheduled', 'not_comparable'].includes(task.status)) &&
      <button type="button" className="secondary-button" onClick={() => window.dispatchEvent(new CustomEvent('contractor:dossier-navigate', {
        detail: { area: 'planning', targetId: 'job-task-control', jobId, runResourcePreview: true }
      }))}>Bekijk herstelplanning</button>}
  </span>)
}

export default function OperationalRecoveryControl({ api, jobId, canEdit = false, refreshKey = '', draftScope = '', onChanged }) {
  const [data, setData] = useState(null), [selected, setSelected] = useState([]), [draft, setDraft] = useState(null)
  const [resolution, setResolution] = useState({}), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [version, setVersion] = useState(0), [pending, setPending] = useState(null)
  const [requestedSource, setRequestedSource] = useState(null)
  const [draftSourceHash, setDraftSourceHash] = useState('')
  const [childWriting, setChildWriting] = useState(false)
  const childWriteLocked = useRef(false)
  const loadGeneration = useRef(0), refreshing = useRef(true)
  const locked = useRef(false), url = `/api/ledger/jobs/${encodeURIComponent(jobId)}/operational-recovery`
  const caseApi = useCallback(async (path, options) => {
    if (!options?.method || ['GET', 'HEAD'].includes(options.method.toUpperCase())) return api(path, options)
    if (childWriteLocked.current || locked.current || refreshing.current) {
      throw Object.assign(new Error('Een herstelwijziging wordt nog verwerkt. Wacht op de actuele casus voordat je verdergaat.'), { status: 409 })
    }
    childWriteLocked.current = true
    setChildWriting(true); setNotice(''); setError('')
    try { return await api(path, options) }
    finally { childWriteLocked.current = false; setChildWriting(false) }
  }, [api])
  const restoreDraft = useCallback(value => {
    setDraftSourceHash(value?.sourceHash || '')
    setSelected(Array.isArray(value?.selected) ? value.selected : [])
    setDraft(value?.draft || null)
    setResolution(value?.resolution || {})
    setPending(value?.pending || null)
  }, [])
  const recoverableDraft = selected.length || draft || Object.keys(resolution).length || pending
    ? { sourceHash: data?.sourceHash || draftSourceHash, selected, draft, resolution, pending }
    : null
  useSessionDraftRecovery({ enabled: Boolean(draftScope), scope: draftScope, name: `operational-recovery:${jobId}`,
    value: recoverableDraft, setValue: restoreDraft })
  useEffect(() => { const generation = ++loadGeneration.current; refreshing.current = true; setLoading(true)
    const current = () => generation === loadGeneration.current
    return cancellableRead(api, url,
      value => { if (current()) { setData(value); setError('') } },
      reason => { if (current()) { setData(null); setError(reason.message) } },
      () => { if (current()) { refreshing.current = false; setLoading(false) } })
  }, [api, url, version, refreshKey])
  useEffect(() => {
    if (!data?.sourceHash) return
    if (!draftSourceHash) { setDraftSourceHash(data.sourceHash); return }
    if (draftSourceHash !== data.sourceHash) {
      setSelected([]); setDraft(null); setResolution({}); setDraftSourceHash(data.sourceHash)
    }
  }, [data?.sourceHash, draftSourceHash])
  useEffect(() => {
    const requestSource = event => {
      const detail = event.detail || {}
      if (detail.targetId === 'job-operational-recovery' && detail.jobId === jobId
          && Object.hasOwn(TYPE, detail.sourceType) && typeof detail.sourceId === 'string') {
        setRequestedSource({ type: detail.sourceType, id: detail.sourceId })
      }
    }
    window.addEventListener('contractor:dossier-navigate', requestSource)
    return () => window.removeEventListener('contractor:dossier-navigate', requestSource)
  }, [jobId])
  useEffect(() => {
    if (!requestedSource || !data) return
    const exists = data.sources.some(source => source.type === requestedSource.type && source.id === requestedSource.id)
    if (exists) {
      setSelected(current => current.some(source => source.type === requestedSource.type && source.id === requestedSource.id)
        ? current : [...current, requestedSource])
      setNotice(requestedSource.type === 'worker_availability'
        ? 'De gemelde verhindering is geselecteerd. Controleer de actuele bron en opdrachtimpact voordat je herstel vastlegt.'
        : 'De verstoringsbron is geselecteerd. Controleer de actuele bron en opdrachtimpact voordat je herstel vastlegt.')
    } else {
      setError('De gemelde verhindering is inmiddels gewijzigd of niet meer actief. Ververs de herstelbronnen en beoordeel opnieuw.')
    }
    setRequestedSource(null)
  }, [data, requestedSource])
  const update = (key, value) => setDraft(previous => ({ ...previous, [key]: value }))
  const refresh = useCallback(() => {
    // A prior read must not re-enable commands before the new effect starts.
    loadGeneration.current += 1
    refreshing.current = true
    setLoading(true)
    setVersion(value => value + 1)
  }, [])
  const submit = useCallback(async command => {
    if (locked.current || childWriteLocked.current || refreshing.current || !canEdit || !data) return
    locked.current = true; setBusy(true); setPending(command); setError(''); setNotice('')
    try {
      await api(url, { method: 'POST', body: JSON.stringify(command) })
      setPending(null); setDraft(null); setSelected([]); setResolution({}); refresh(); setNotice('Herstelcasus is bijgewerkt.'); onChanged?.()
    } catch (reason) { setError(reason.message); if ([400, 403, 404, 409, 413, 423].includes(reason.status || reason.statusCode)) setPending(null) }
    finally { locked.current = false; setBusy(false) }
  }, [api, url, canEdit, data, onChanged, refresh])
  function create() {
    if (!draft || selected.length === 0 || !draft.owner || !draft.dueAt || !draft.recoveryAction) return
    void submit(pending || { action: 'create', entryKey: crypto.randomUUID(), sourceHash: data.sourceHash, sources: selected,
      owner: draft.owner, dueAt: new Date(draft.dueAt).toISOString(), actionType: draft.actionType, recoveryAction: draft.recoveryAction })
  }
  const commandButtonDisabled = busy || childWriting || loading || Boolean(pending)
  const caseOnChanged = useCallback(result => { refresh(); onChanged?.(result) }, [refresh, onChanged])
  const caseOnError = useCallback(reason => setError(reason.message), [])
  const renderMaterialReadiness = useCallback(source => <MaterialReadinessSummary source={source} jobId={jobId} canEdit={canEdit} />, [jobId, canEdit])
  const sources = data?.sources, timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  // Reuse only the current source view; type and id remain separate identities.
  const sourceRows = useMemo(() => {
    const formatDate = createDateFormatter(timeZone)
    const identities = new Map()
    for (const row of selected) {
      if (!identities.has(row.type)) identities.set(row.type, new Set())
      identities.get(row.type).add(row.id)
    }
    return sources?.map(source => <label className="balance-confirm" key={`${source.type}:${source.id}`}>
      <input type="checkbox" checked={identities.get(source.type)?.has(source.id) || false} onChange={event => setSelected(current => event.target.checked
        ? [...current, { type: source.type, id: source.id }] : current.filter(row => row.type !== source.type || row.id !== source.id))} />
      <span><strong>{TYPE[source.type] || source.type}</strong>: {source.title}{source.impact?.note ? <small className="context-source-note">{source.impact.note}</small> : null}
        {source.type === 'equipment_unavailable' && <small className="context-source-note">
          {source.impact.taskId ? `Taak: ${source.impact.affectedScheduleTasks?.[0]?.title || source.impact.taskId} / ` : ''}
          {formatDate(source.impact.neededFrom)} - {formatDate(source.impact.neededUntil)} / status {source.impact.toolStatus} / keuring {source.impact.inspectionStatus}
        </small>}
        {source.impact?.clientAppointments?.length > 0 && <small className="context-source-note">{source.impact.clientAppointments.length} goedgekeurde klantafspraak/afspraken binnen deze afwezigheidsperiode{source.impact.clientAppointmentsComplete ? '' : ' / lijst onvolledig'}</small>}
      </span>
    </label>)
  }, [sources, selected, timeZone])
  const caseViews = useMemo(() => data?.cases.map(item => <Suspense key={item.id} fallback={<article className="balance-package" role="status">Herstelcasus laden...</article>}>
    <OperationalRecoveryCase item={item} data={data} api={caseApi} canEdit={canEdit && !commandButtonDisabled} draftScope={draftScope} commandButtonDisabled={commandButtonDisabled} timeZone={timeZone}
      renderMaterialReadiness={renderMaterialReadiness}
      resolution={resolution} setResolution={setResolution} submit={submit}
      onChanged={caseOnChanged} onError={caseOnError} onNotice={setNotice} />
  </Suspense>), [data, caseApi, canEdit, commandButtonDisabled, draftScope, renderMaterialReadiness, resolution, submit, caseOnChanged, caseOnError, timeZone])
  return <section id="job-operational-recovery" className="work-context job-workspace-section" aria-label="Operationele herstelcasussen">
    <header><h3>Verstoringen en herstel</h3><div className="context-actions"><button type="button" className="icon-button" title="Herstelcasussen verversen" aria-label="Herstelcasussen verversen" disabled={commandButtonDisabled} onClick={refresh}><RefreshCw size={18} /></button></div></header>
    <p>Koppel een verstoring aan een eigenaar, opvolgdatum en herstelrichting. Klantafspraken, bestellingen en roosters wijzigen hierdoor niet automatisch.</p>
    {loading && <p role="status">Verstoringen laden...</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {childWriting && <p role="status">Herstelwijziging wordt opgeslagen...</p>}
    {pending && !busy && canEdit && <button type="button" className="secondary-button" disabled={loading || childWriting} onClick={() => void submit(pending)}>Dezelfde wijziging opnieuw proberen</button>}
    {data && <>
      {!data.sources.length && <p>Geen actieve verstoringen uit beschikbaarheid, uitvoerdersmeldingen, materialen, materieel, leveringen of veiligheidsregistraties gevonden.</p>}
      {data.sources.length > 0 && <fieldset disabled={!canEdit || commandButtonDisabled}><legend>Actieve bronregistraties</legend>
        {sourceRows}
      </fieldset>}
      {canEdit && selected.length > 0 && !draft && <button type="button" className="secondary-button" disabled={commandButtonDisabled} onClick={() => setDraft({ owner: '', dueAt: '', actionType: 'review_only', recoveryAction: '' })}>Herstelcasus aanmaken</button>}
      {canEdit && draft && <form aria-label="Herstelcasus aanmaken" onSubmit={event => { event.preventDefault(); create() }}><fieldset disabled={commandButtonDisabled}><legend>Herstel plannen</legend>
        <label>Verantwoordelijke<input required maxLength={160} value={draft.owner} onChange={event => update('owner', event.target.value)} /></label>
        <label>Opvolgen voor<input required type="datetime-local" value={draft.dueAt} onChange={event => update('dueAt', event.target.value)} /></label>
        <label>Herstelrichting<select value={draft.actionType} onChange={event => update('actionType', event.target.value)}>{Object.entries(ACTION).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Wat moet worden uitgezocht of voorbereid?<textarea required maxLength={1000} value={draft.recoveryAction} onChange={event => update('recoveryAction', event.target.value)} /></label>
        <div className="context-actions"><button type="submit" className="primary-button" disabled={selected.length === 0}><Save size={16} />Herstel vastleggen</button><button type="button" className="secondary-button" onClick={() => setDraft(null)}>Annuleren</button></div>
      </fieldset></form>}
      {caseViews}
    </>}
  </section>
}
