import { useEffect, useRef, useState } from 'react'
import { cancellableRead } from '../cancellable-read.mjs'
import { ArrowDownToLine, ArrowLeftRight, ExternalLink, Link2, Pencil, Plus, RefreshCw, RotateCcw, Save, Share2, X } from 'lucide-react'
import { companyApiUrl } from '../company-request.mjs'
import './WorkContextControl.css'
import './AssetHistoryControl.css'

const assetEventLabels = { installed: 'Montage gemeld', serviced: 'Onderhoud gemeld', repaired: 'Reparatie gemeld', inspected: 'Inspectiewerk gemeld', removed: 'Demontage gemeld', prior_record: 'Historisch bronstuk' }
const relationLabels = { warranty: 'Garantie', aftercare: 'Nazorg', recurring: 'Terugkerend onderhoud' }

export default function AssetHistoryControl({ api, jobId, canEdit = false, refreshKey, onChanged, onOpenJob }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [version, setVersion] = useState(0), [selectedId, setSelectedId] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false)
  const [action, setAction] = useState(null), [record, setRecord] = useState({}), [pending, setPending] = useState(null)
  const locked = useRef(false), alive = useRef(true), url = `/api/ledger/jobs/${encodeURIComponent(jobId)}/asset-history`
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    setLoading(true)
    return cancellableRead(api, url, result => { setData(result); setError('') },
      reason => setError(reason.message), () => setLoading(false))
  }, [api, url, version, refreshKey])
  const selected = data?.records.find(row => row.asset.id === selectedId) || data?.records[0], disabled = busy || loading || Boolean(pending)
  const set = (key, value) => setRecord(prior => ({ ...prior, [key]: value }))
  function edit(next, values = {}) { setAction(next); setRecord({ assetId: selected.asset.id, ...values }); setError(''); setNotice('') }
  async function submit(retry) {
    if (!canEdit || locked.current || !data || loading || (pending && !retry)) return
    const command = retry || { action, record, sourceHash: data.sourceHash, entryKey: crypto.randomUUID() }
    locked.current = true; setBusy(true); setPending(command); setError(''); setNotice('')
    try {
      const result = await api(url, { method: 'POST', body: JSON.stringify(command) })
      if (!alive.current) return
      setPending(null); setAction(null); setVersion(value => value + 1); setNotice(result.preparedJobId ? 'Onderhoudsdossier beschikbaar.' : 'Installatiehistorie bijgewerkt.'); onChanged?.()
    } catch (reason) {
      if (!alive.current) return
      setError(reason.message)
      if ([400, 403, 404, 409, 413, 423].includes(reason.status || reason.statusCode)) setPending(null)
    } finally { locked.current = false; if (alive.current) setBusy(false) }
  }
  function exportData() {
    const link = document.createElement('a'), url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    link.href = url; link.download = `installatiehistorie-${jobId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const input = (key, label, { optional = false, multiline = false, type = 'text', max = 200 } = {}) => <label>{label}{multiline
    ? <textarea required={!optional} maxLength={max} value={record[key] || ''} onChange={event => set(key, event.target.value)} />
    : <input required={!optional} type={type} maxLength={max} value={record[key] || ''} onChange={event => set(key, event.target.value)} />}</label>
  return <section className="work-context asset-history job-workspace-section" aria-label="Installatiehistorie">
    <header><h3>Installatiehistorie</h3><div className="context-actions">
      <button className="icon-button" type="button" title="Installatiehistorie verversen" aria-label="Installatiehistorie verversen" disabled={disabled} onClick={() => setVersion(value => value + 1)}><RefreshCw size={18} /></button>
      <button className="icon-button" type="button" title="Installatiehistorie exporteren" aria-label="Installatiehistorie exporteren" disabled={!data || disabled} onClick={exportData}><ArrowDownToLine size={18} /></button>
    </div></header>
    {loading && <p role="status">Installatiehistorie laden...</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {pending && !busy && canEdit && <button type="button" className="secondary-button" onClick={() => submit(pending)}><RefreshCw size={16} />Dezelfde wijziging opnieuw controleren</button>}
    {data && !selected && <p>Geen installaties gekoppeld.</p>}
    {selected && <><label>Installatie<select disabled={disabled || Boolean(action)} value={selected.asset.id} onChange={event => setSelectedId(event.target.value)}>{data.records.map(row => <option key={row.asset.id} value={row.asset.id}>{row.asset.name}{row.profile?.serialNumber ? ` / ${row.profile.serialNumber}` : ''}{row.asset.archived ? ' (gearchiveerd)' : ''}</option>)}</select></label>
      <dl className="asset-identity"><div><dt>Fabrikant</dt><dd>{selected.profile?.manufacturer || 'Niet vastgelegd'}</dd></div><div><dt>Model</dt><dd>{selected.profile?.model || 'Niet vastgelegd'}</dd></div><div><dt>Serienummer</dt><dd>{selected.profile?.serialNumber || 'Niet vastgelegd'}</dd></div></dl>
      {canEdit && !selected.asset.archived && <div className="context-actions">
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => edit('profile', { ...selected.profile, reason: '' })}><Pencil size={16} />Identiteit vastleggen</button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => edit('record', { kind: 'serviced', summary: '', performedAt: '', deliveryId: '', documentId: '' })}><Plus size={16} />Werk vastleggen</button>
        <button type="button" className="secondary-button" disabled={disabled || data.records.length < 2} onClick={() => edit('replace', { summary: '', performedAt: '', deliveryId: '', replacementAssetId: '' })}><ArrowLeftRight size={16} />Vervanging vastleggen</button>
        <button type="button" className="secondary-button" disabled={disabled} onClick={() => edit('link', { kind: 'aftercare', recordIds: selected.links.filter(row => row.active && row.kind === 'aftercare' && row.jobId === jobId).map(row => row.record.id) })}><Link2 size={16} />Vervolgacties koppelen</button>
      </div>}
      {!selected.events.length && <p>Nog geen werkhistorie vastgelegd.</p>}
      <ol className="context-rows">{selected.events.map(event => <li key={event.id}><div><strong>{event.performedAt} / {assetEventLabels[event.kind]}</strong><p>{event.summary}</p>
        <span>{event.status === 'voided' ? 'Gecorrigeerd' : event.sourceCurrent ? 'Bron actueel' : 'Bron gewijzigd; afstemming nodig'}</span>
        {event.pairedAssetId && <p>Vervanging: {data.records.find(row => row.asset.id === event.pairedAssetId)?.asset.name || event.pairedAssetId}</p>}
        <p>Bron: {event.source.title}</p>
        {event.source.type === 'document' && event.sourceCurrent && data.options.documents.find(row => row.id === event.source.id)?.contentAvailable && <a href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(event.source.id)}/content`)}>Bronbestand openen</a>}
        {event.sharing.enabled && <p>Gedeeld met uitvoerenden: {event.sharing.summary}</p>}
        {event.correction.reason && <p>Correctie: {event.correction.reason}</p>}
        <div className="context-actions">
          {event.jobId !== jobId && onOpenJob && <button type="button" className="secondary-button" disabled={disabled || Boolean(action)} onClick={() => onOpenJob(event.jobId)}><ExternalLink size={16} />Bronopdracht openen</button>}
          {canEdit && event.jobId === jobId && <><button type="button" className="secondary-button" disabled={disabled || (event.status === 'voided' && !event.sharing.enabled)} onClick={() => edit('share', { id: event.id, enabled: event.status === 'retained' && event.sharing.enabled, fieldSummary: event.sharing.summary })}><Share2 size={16} />Delen met uitvoerenden</button>
            {event.status === 'retained' && <button type="button" className="secondary-button" disabled={disabled} onClick={() => edit('void', { id: event.id, reason: '' })}><RotateCcw size={16} />Registratie corrigeren</button>}</>}
        </div>
      </div></li>)}</ol>
      {selected.links.some(link => link.active) && <section aria-label="Gekoppelde installatieacties"><h4>Vervolgacties</h4><ul className="context-rows">{selected.links.filter(link => link.active).map(link => <li key={link.id}><div><strong>{relationLabels[link.kind]} / {link.record.title || link.record.service}</strong><p>{link.record.status}{(link.record.dueAt || link.record.nextDueAt) && ` / ${link.record.dueAt || link.record.nextDueAt}`}</p>{link.jobId !== jobId && onOpenJob && <button type="button" className="secondary-button" disabled={disabled || Boolean(action)} onClick={() => onOpenJob(link.jobId)}><ExternalLink size={16} />Bronopdracht openen</button>}</div></li>)}</ul></section>}
    </>}
    {selected && canEdit && selected.links.filter(link => link.active && link.kind === 'recurring' && link.jobId === jobId && link.record.status === 'active').map(link => <div key={link.id} className="context-actions"><button type="button" className="secondary-button" disabled={disabled || Boolean(action)} onClick={() => { void submit({ action: 'prepare_recurring', record: { assetId: selected.asset.id, planId: link.record.id }, sourceHash: data.sourceHash, entryKey: crypto.randomUUID() }) }}><Plus size={16} />Onderhoudsdossier voorbereiden</button>{link.record.lastCreatedJobId && onOpenJob && <button type="button" className="secondary-button" disabled={disabled || Boolean(action)} onClick={() => onOpenJob(link.record.lastCreatedJobId)}><ExternalLink size={16} />Voorbereid onderhoud openen</button>}</div>)}
    {action && data && selected && canEdit && <form aria-label="Installatiehistorie bewerken" onSubmit={event => { event.preventDefault(); void submit() }}><fieldset disabled={disabled}>
      <legend>{({ profile: 'Installatie-identiteit', record: 'Werkregistratie', replace: 'Vervanging', link: 'Vervolgacties', share: 'Operationele samenvatting', void: 'Correctie' })[action]}</legend>
      {action === 'profile' && <><div className="context-fields">{input('manufacturer', 'Fabrikant', { optional: true })}{input('model', 'Model', { optional: true })}{input('serialNumber', 'Serienummer', { optional: true })}</div>{input('reason', 'Bron / reden identiteitscorrectie', { max: 1000 })}</>}
      {action === 'record' && <label>Werksoort<select value={record.kind} onChange={event => { set('kind', event.target.value); set('deliveryId', ''); set('documentId', '') }}>{Object.entries(assetEventLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>}
      {action === 'replace' && <label>Vervangende installatie<select required value={record.replacementAssetId} onChange={event => set('replacementAssetId', event.target.value)}><option value="">Selecteer installatie</option>{data.records.filter(row => row.asset.id !== record.assetId && !row.asset.archived).map(row => <option key={row.asset.id} value={row.asset.id}>{row.asset.name}</option>)}</select></label>}
      {['record', 'replace'].includes(action) && <>{input('performedAt', 'Werkdatum / datum bronstuk', { type: 'date' })}{input('summary', 'Uitgevoerd werk / bronbeschrijving', { multiline: true, max: 3000 })}
        {record.kind === 'prior_record' ? <label>Historisch bronstuk<select required value={record.documentId} onChange={event => set('documentId', event.target.value)}><option value="">Selecteer bronstuk</option>{data.options.documents.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>
          : <label>Uitvoeringsbron<select required value={record.deliveryId} onChange={event => set('deliveryId', event.target.value)}><option value="">Selecteer deeloplevering</option>{data.options.deliveries.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>}</>}
      {action === 'link' && <><label>Register<select value={record.kind} onChange={event => { set('kind', event.target.value); set('recordIds', selected.links.filter(row => row.active && row.kind === event.target.value && row.jobId === jobId).map(row => row.record.id)) }}>{Object.entries(relationLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <div className="context-checks">{data.options[record.kind].map(row => <label key={row.id}><input type="checkbox" checked={record.recordIds.includes(row.id)} onChange={event => set('recordIds', event.target.checked ? [...record.recordIds, row.id] : record.recordIds.filter(id => id !== row.id))} />{row.title || row.service}</label>)}</div>{!data.options[record.kind].length && <p>Geen registraties in deze opdracht.</p>}</>}
      {action === 'share' && <><label className="context-check"><input type="checkbox" checked={record.enabled} onChange={event => set('enabled', event.target.checked)} />Delen met toegewezen uitvoerenden</label>{record.enabled && input('fieldSummary', 'Operationele samenvatting', { multiline: true, max: 1500 })}</>}
      {action === 'void' && input('reason', 'Reden correctie', { multiline: true, max: 1500 })}
      <div className="context-actions"><button type="submit" className="primary-button"><Save size={16} />Opslaan</button><button type="button" className="secondary-button" onClick={() => setAction(null)}><X size={16} />Annuleren</button></div>
    </fieldset></form>}
  </section>
}
