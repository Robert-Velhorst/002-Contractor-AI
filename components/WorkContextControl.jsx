import { useEffect, useRef, useState } from 'react'
import { cancellableRead } from '../cancellable-read.mjs'
import { Archive, ArrowDownToLine, Link2, Pencil, Plus, RefreshCw, RotateCcw, Save, X } from 'lucide-react'
import './WorkContextControl.css'

const types = { site: 'Terrein / adres', building: 'Gebouw', floor: 'Verdieping', space: 'Ruimte', zone: 'Werkzone', asset: 'Vaste installatie' }
const roles = { customer: 'Opdrachtgever', owner: 'Eigenaar', resident: 'Bewoner', payer: 'Betaler', decision_maker: 'Beslisser', site_contact: 'Locatiecontact', designer: 'Ontwerper', inspector: 'Inspecteur' }
const fresh = kind => kind === 'place' ? { type: 'site', name: '', address: '', parentId: '' }
  : kind === 'party' ? { name: '', organization: '', roles: [], phone: '', email: '', reference: '', shareWithField: false }
    : { code: '', title: '', outcome: '', instructions: '', stopPoint: '', handover: '', placeId: '', taskIds: [], quantityIds: [] }

export default function WorkContextControl({ api, jobId, canEdit = false, onChanged }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [revision, setRevision] = useState(0)
  const [editor, setEditor] = useState(null), [record, setRecord] = useState({}), [pending, setPending] = useState(null)
  const [catalog, setCatalog] = useState(null), [search, setSearch] = useState(''), [placeId, setPlaceId] = useState('')
  const locked = useRef(false), alive = useRef(true)
  const url = `/api/ledger/jobs/${encodeURIComponent(jobId)}/work-context`
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    setLoading(true)
    return cancellableRead(api, url, result => { setData(result); setError('') },
      reason => setError(reason.message), () => setLoading(false))
  }, [api, url, revision])
  function edit(kind, value = fresh(kind)) { setEditor(kind); setRecord({ ...value }); setError(''); setNotice('') }
  async function submit(action, values, retry) {
    if (locked.current || !canEdit || loading || !data || (pending && !retry)) return
    const command = retry || { action, record: values, sourceHash: data.sourceHash, entryKey: crypto.randomUUID() }
    locked.current = true; setBusy(true); setError(''); setNotice(''); setPending(command)
    try {
      await api(url, { method: 'POST', body: JSON.stringify(command) })
      if (!alive.current) return
      setPending(null); setEditor(null); setNotice('Werkdossier bijgewerkt.'); setRevision(value => value + 1); onChanged?.()
    } catch (reason) {
      if (!alive.current) return
      setError(reason.message)
      if ([400, 403, 404, 409, 413, 423].includes(reason.status || reason.statusCode)) setPending(null)
    } finally { locked.current = false; if (alive.current) setBusy(false) }
  }
  async function searchPlaces(after = '') {
    if (locked.current || pending) return
    locked.current = true; setBusy(true); setError('')
    try {
      const result = await api(`/api/ledger/work-places?${new URLSearchParams({ search, after })}`)
      if (alive.current) setCatalog(previous => ({ ...result, places: after ? [...previous.places, ...result.places] : result.places }))
    } catch (reason) { if (alive.current) setError(reason.message) }
    finally { locked.current = false; if (alive.current) setBusy(false) }
  }
  function exportContext() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const link = document.createElement('a'); link.href = url; link.download = `werkdossier-${jobId}.json`; link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const disabled = busy || loading || Boolean(pending)
  const set = (key, value) => setRecord(previous => ({ ...previous, [key]: value }))
  const toggle = (key, value, checked) => set(key, checked ? [...record[key], value] : record[key].filter(item => item !== value))
  const field = (key, label, { multiline = false, required = false, max = 200, type = 'text' } = {}) => <label>{label}{multiline
    ? <textarea required={required} maxLength={max} value={record[key] || ''} onChange={event => set(key, event.target.value)} />
    : <input type={type} required={required} maxLength={max} value={record[key] || ''} onChange={event => set(key, event.target.value)} />}</label>
  const controls = (kind, item) => canEdit ? <span className="context-actions">
    {!item.archived && kind !== 'link' && <button type="button" className="icon-button" title={`${item.name || item.title}: bewerken`} aria-label={`${item.name || item.title}: bewerken`} disabled={disabled} onClick={() => edit(kind, item)}><Pencil size={16} /></button>}
    <button type="button" className="icon-button" title={item.archived ? 'Herstellen' : 'Archiveren'} aria-label={`${item.archived ? 'Herstellen' : 'Archiveren'} ${item.name || item.title || 'locatiekoppeling'}`} disabled={disabled} onClick={() => submit(`${item.archived ? 'restore' : 'archive'}_${kind}`, { id: item.id })}>{item.archived ? <RotateCcw size={16} /> : <Archive size={16} />}</button>
  </span> : null
  return <section className="work-context job-workspace-section" aria-label="Werkdossier">
    <header><h3>Werkdossier</h3><div className="context-actions"><button type="button" className="icon-button" title="Werkdossier verversen" aria-label="Werkdossier verversen" disabled={disabled} onClick={() => setRevision(value => value + 1)}><RefreshCw size={18} /></button><button type="button" className="icon-button" title="Werkdossier exporteren" aria-label="Werkdossier exporteren" disabled={!data || disabled} onClick={exportContext}><ArrowDownToLine size={18} /></button></div></header>
    {loading && <p role="status">Werkdossier laden...</p>}
    {error && <p role="alert">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {pending && !busy && canEdit && <button type="button" onClick={() => submit(null, null, pending)}><RefreshCw size={16} />Dezelfde wijziging opnieuw controleren</button>}
    {data && <>
      <section aria-label="Locaties"><header><h4>Locaties</h4>{canEdit && <button type="button" disabled={disabled} onClick={() => edit('place')}><Plus size={16} />Locatie toevoegen</button>}</header>
        {!data.links.length && <p>Nog geen locaties gekoppeld.</p>}
        <ul className="context-rows">{data.links.map(link => { const place = data.places.find(item => item.id === link.placeId); return <li key={link.id}><div><strong>{place.name}</strong><span>{types[place.type]}{place.parentId ? ` / ${data.places.find(item => item.id === place.parentId)?.name || ''}` : ''}</span><span>{place.address}</span><small>{link.archived ? 'Koppeling gearchiveerd' : place.archived ? 'Locatie gearchiveerd' : `Versie ${place.revision}`}</small></div>{controls('place', place)}{controls('link', link)}</li> })}</ul>
        {canEdit && <details><summary>Bestaande locatie koppelen</summary><form onSubmit={event => { event.preventDefault(); void searchPlaces() }}><fieldset disabled={disabled}><label>Locatienaam zoeken<input value={search} maxLength={120} onChange={event => { setSearch(event.target.value); setCatalog(null); setPlaceId('') }} /></label><button>Zoeken</button></fieldset></form>
          {catalog && <><label>Bestaande locatie<select value={placeId} disabled={disabled} onChange={event => setPlaceId(event.target.value)}><option value="">Selecteer locatie</option>{catalog.places.filter(item => !item.archived).map(item => <option key={item.id} value={item.id}>{item.name} ({types[item.type]})</option>)}</select></label><button type="button" disabled={disabled || !placeId} onClick={() => submit('link_place', { placeId })}><Link2 size={16} />Koppelen</button>{catalog.nextCursor && <button type="button" disabled={disabled} onClick={() => searchPlaces(catalog.nextCursor)}>Meer locaties</button>}{!catalog.places.length && <p>Geen locaties gevonden.</p>}</>}
        </details>}
      </section>
      <section aria-label="Betrokkenen"><header><h4>Betrokkenen</h4>{canEdit && <button type="button" disabled={disabled} onClick={() => edit('party')}><Plus size={16} />Betrokkene toevoegen</button>}</header>
        {!data.parties.length && <p>Nog geen afzonderlijke rollen vastgelegd.</p>}
        <ul className="context-rows">{data.parties.map(party => <li key={party.id}><div><strong>{party.name}</strong><span>{party.roles.map(role => roles[role]).join(', ')}{party.organization ? ` / ${party.organization}` : ''}</span><span>{[party.phone, party.email].filter(Boolean).join(' / ')}</span><small>{party.archived ? 'Gearchiveerd' : party.shareWithField ? 'Locatiecontact gedeeld met uitvoerenden' : 'Alleen kantoor'} | {party.reference}</small></div>{controls('party', party)}</li>)}</ul>
      </section>
      <section aria-label="Werkpakketten"><header><h4>Werkpakketten</h4>{canEdit && <button type="button" disabled={disabled} onClick={() => edit('package')}><Plus size={16} />Werkpakket toevoegen</button>}</header>
        {!data.packages.length && <p>Nog geen werkpakketten vastgelegd.</p>}
        <ul className="context-rows">{data.packages.map(item => <li key={item.id}><div><strong>{item.code} / {item.title}</strong><p>{item.outcome}</p><span>{data.places.find(place => place.id === item.placeId)?.name || 'Geen locatie gekoppeld'}</span><small>{item.taskIds.filter(id => data.tasks.find(task => task.id === id)?.status === 'completed').length}/{item.taskIds.length} taken gereed | {item.quantityIds.length} hoeveelheden | {item.archived ? 'Gearchiveerd' : `Versie ${item.revision}`}</small></div>{controls('package', item)}</li>)}</ul>
      </section>
    </>}
    {editor && canEdit && <form className="context-editor" aria-label={`${editor === 'place' ? 'Locatie' : editor === 'party' ? 'Betrokkene' : 'Werkpakket'} bewerken`} onSubmit={event => { event.preventDefault(); void submit(`save_${editor}`, record) }}>
      <fieldset disabled={disabled}>
        <legend>{editor === 'place' ? 'Locatie' : editor === 'party' ? 'Betrokkene' : 'Werkpakket'} {record.id ? 'bewerken' : 'toevoegen'}</legend>
        {editor === 'place' && <><div className="context-fields"><label>Locatietype<select value={record.type} disabled={Boolean(record.id)} onChange={event => set('type', event.target.value)}>{Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{field('name', 'Locatienaam', { required: true })}</div>
          <label>Bovenliggende locatie<select required={record.type !== 'site'} value={record.parentId || ''} onChange={event => set('parentId', event.target.value)}><option value="">Geen</option>{data.places.filter(place => !place.archived && place.id !== record.id).map(place => <option key={place.id} value={place.id}>{place.name} ({types[place.type]})</option>)}</select></label>{field('address', 'Locatieadres / aanduiding', { max: 500 })}</>}
        {editor === 'party' && <><div className="context-fields">{field('name', 'Naam betrokkene', { required: true })}{field('organization', 'Organisatie')}{field('phone', 'Telefoon', { type: 'tel', max: 50 })}{field('email', 'E-mail', { type: 'email', max: 254 })}</div>
          <fieldset><legend>Rollen bij deze opdracht</legend><div className="context-checks">{Object.entries(roles).map(([key, label]) => <label key={key}><input type="checkbox" checked={record.roles.includes(key)} onChange={event => toggle('roles', key, event.target.checked)} />{label}</label>)}</div></fieldset>
          {field('reference', 'Bron of afstemming over deze rol', { required: true, max: 1000 })}<label className="context-check"><input type="checkbox" checked={record.shareWithField} onChange={event => set('shareWithField', event.target.checked)} />Naam en contactgegevens als locatiecontact delen met toegewezen uitvoerenden</label></>}
        {editor === 'package' && <><div className="context-fields">{field('code', 'Werkpakketcode', { required: true, max: 80 })}{field('title', 'Werkpakketnaam', { required: true })}</div>
          <label>Werklocatie<select value={record.placeId || ''} onChange={event => set('placeId', event.target.value)}><option value="">Geen locatie</option>{data.links.filter(link => !link.archived && !data.places.find(place => place.id === link.placeId)?.archived).map(link => <option key={link.id} value={link.placeId}>{data.places.find(place => place.id === link.placeId)?.name}</option>)}</select></label>
          {field('outcome', 'Beoogd resultaat', { required: true, multiline: true, max: 3000 })}{field('instructions', 'Werkinstructie', { multiline: true, max: 4000 })}{field('stopPoint', 'Veilig stoppunt bij onderbreking', { multiline: true, max: 2000 })}{field('handover', 'Benodigde overdracht', { multiline: true, max: 2000 })}
          <fieldset><legend>Gekoppelde werkzaamheden</legend><div className="context-checks">{data.tasks.map(task => <label key={task.id}><input type="checkbox" checked={record.taskIds.includes(task.id)} onChange={event => toggle('taskIds', task.id, event.target.checked)} />{task.title}</label>)}</div>{!data.tasks.length && <p>Nog geen werkzaamheden vastgelegd.</p>}</fieldset>
          <fieldset><legend>Gekoppelde hoeveelheden</legend><div className="context-checks">{data.quantities.map(item => <label key={item.id}><input type="checkbox" checked={record.quantityIds.includes(item.id)} onChange={event => toggle('quantityIds', item.id, event.target.checked)} />{item.description}: {item.quantity} {item.unit}</label>)}</div>{!data.quantities.length && <p>Nog geen hoeveelheden vastgelegd.</p>}</fieldset></>}
        <div className="context-actions"><button type="submit"><Save size={16} />Opslaan</button><button type="button" onClick={() => setEditor(null)}><X size={16} />Annuleren</button></div>
      </fieldset>
    </form>}
  </section>
}
