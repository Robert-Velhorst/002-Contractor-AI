import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cancellableRead } from '../cancellable-read.mjs'
import { ArrowDownToLine, Check, Plus, RefreshCw, Save, X } from 'lucide-react'
import ConversationPhoto from './ConversationPhoto'
import ClientDeliveryPhotos from './ClientDeliveryPhotos'
import { clientDeliveryLabel as label } from '../client-delivery-labels.mjs'
import './WorkContextControl.css'
import './ClientDelivery.css'

const OPEN_OFFER_STATES = new Set(['pending', 'available', 'expired', 'source_changed'])

export default function ClientDeliveryControl({ api, jobId, canEdit = false, refreshKey = '', onChanged, locale = 'nl-NL' }) {
  const [data, setData] = useState(null), [loading, setLoading] = useState(true), [loadError, setLoadError] = useState('')
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [version, setVersion] = useState(0)
  const [editor, setEditor] = useState(null), [record, setRecord] = useState({}), [busy, setBusy] = useState(false), [pending, setPending] = useState(null)
  const [photos, setPhotos] = useState([]), [photoError, setPhotoError] = useState(''), [photoLoading, setPhotoLoading] = useState(false)
  const [photoCursor, setPhotoCursor] = useState(null), [photoVersion, setPhotoVersion] = useState(0)
  const locked = useRef(false), alive = useRef(true), photoEpoch = useRef(0)
  const url = `/api/ledger/jobs/${encodeURIComponent(jobId)}/client-deliveries`
  const chatBase = record.accessId ? `/api/ledger/jobs/${encodeURIComponent(jobId)}/conversations/${encodeURIComponent(record.accessId)}` : ''
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    setLoading(true)
    return cancellableRead(api, url, result => { setData(result); setLoadError('') },
      reason => setLoadError(reason.message), () => setLoading(false))
  }, [api, url, version, refreshKey])
  useEffect(() => {
    ++photoEpoch.current
    setPhotos([]); setPhotoError(''); setPhotoCursor(null)
    if (!chatBase || editor?.action !== 'offer') { setPhotoLoading(false); return undefined }
    setPhotoLoading(true)
    return cancellableRead(api, `${chatBase}?limit=50`, result => { setPhotos(result.messages); setPhotoCursor(result.nextCursor) },
      reason => setPhotoError(reason.message), () => setPhotoLoading(false))
  }, [api, chatBase, editor?.action, photoVersion])
  const stale = Boolean(editor && data && editor.sourceHash !== data.sourceHash)
  const disabled = loading || busy || Boolean(pending) || Boolean(loadError)
  const editing = Boolean(editor), sourceHash = data?.sourceHash
  const set = useCallback((key, value) => setRecord(previous => ({ ...previous, [key]: value })), [])
  const open = useCallback((action, item) => {
    setError(''); setNotice(''); setEditor({ action, sourceHash })
    setRecord(action === 'offer' ? { deliveryId: item.id, accessId: '', recipientName: '', authorityReference: '', title: item.title, scope: item.scope, expiresAt: '', photoIds: [], scopeConfirmed: false, reason: '' }
      : { id: item.id, reason: '' })
  }, [sourceHash])
  const olderPhotos = useCallback(async () => {
    if (photoLoading || !photoCursor) return
    const base = chatBase, cursor = photoCursor, epoch = photoEpoch.current; setPhotoLoading(true); setPhotoError('')
    try { const result = await api(`${base}?limit=50&before=${encodeURIComponent(cursor)}`); if (alive.current && epoch === photoEpoch.current) { const incomingIds = new Set(result.messages.map(item => item.id)); setPhotos(previous => [...result.messages, ...previous.filter(row => !incomingIds.has(row.id))]); setPhotoCursor(result.nextCursor) } }
    catch (reason) { if (alive.current && epoch === photoEpoch.current) setPhotoError(reason.message) }
    finally { if (alive.current && epoch === photoEpoch.current) setPhotoLoading(false) }
  }, [api, chatBase, photoCursor, photoLoading])
  async function submit(retry) {
    if (locked.current || !canEdit || !data || (!retry && (loading || loadError || pending || stale))) return
    const command = retry || { action: editor.action, record: editor.action === 'offer' ? { ...record, expiresAt: new Date(record.expiresAt).toISOString() } : record, entryKey: crypto.randomUUID(), sourceHash: editor.sourceHash }
    locked.current = true; setBusy(true); setPending(command); setError(''); setNotice('')
    try {
      await api(url, { method: 'POST', body: JSON.stringify(command) })
      if (!alive.current) return
      setPending(null); setEditor(null); setVersion(value => value + 1); setNotice(command.action === 'offer' ? 'Publicatie toegevoegd aan Goedkeuringen.' : 'Aanbod ingetrokken.'); onChanged?.()
    } catch (reason) { if (alive.current) { setError(reason.message); if ([400, 403, 404, 409, 413, 423].includes(reason.status || reason.statusCode)) setPending(null) } }
    finally { locked.current = false; if (alive.current) setBusy(false) }
  }
  function exportData() {
    const link = document.createElement('a'), address = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    link.href = address; link.download = `klantopleveringen-${jobId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(address), 1000)
  }
  const visiblePhotos = useMemo(() => photos.filter(row => row.attachment && (row.direction === 'inbound' || row.status === 'published')), [photos])
  const chosen = useMemo(() => data?.options.deliveries.find(row => row.id === record.deliveryId), [data, record.deliveryId])
  const offers = data?.offers, deliveries = data?.options.deliveries, accessCount = data?.options.accesses.length || 0
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone
  // Form typing does not change retained history or its current action gates.
  const history = useMemo(() => offers?.map(item => {
    const photoBase = `/api/ledger/jobs/${jobId}/conversations/${item.accessId}`
    return <article key={item.id} className="client-delivery-record" aria-label={`Klantaanbod ${item.version}: ${item.title}`}>
      <h4>{item.title}</h4><p>{item.scope}</p><p><strong>{item.state === 'available' && item.response ? 'Beantwoord' : label(item.state)}</strong> / versie {item.version}</p>
      <p>{item.recipientName} / {new Date(item.expiresAt).toLocaleString('nl-NL', { timeZone })}</p>
      {item.response && <div className="client-delivery-response"><strong>{label(item.response.status)}</strong><p>{label(item.response.outcome)} / {item.response.respondent}</p><p>{item.response.note}</p>
        <ClientDeliveryPhotos photos={item.response.photos} base={photoBase} locale={locale} />
      </div>}
      <details><summary>Publicatiegegevens</summary><p>{item.authorityReference}</p><p>{item.reason}</p><p>{label(item.coverageStatus, 'nl-NL', true)}</p>
        <ul>{item.quantities.map((row, index) => <li key={index}>{row.quantity} {row.unit} / {row.description}</li>)}</ul>
        <ClientDeliveryPhotos photos={item.photos} base={photoBase} locale={locale} />
        {item.withdrawnReason && <p>{item.withdrawnReason}</p>}
      </details>
      {canEdit && OPEN_OFFER_STATES.has(item.state) && <button type="button" className="secondary-button" disabled={disabled || editing} onClick={() => open('withdraw', item)}><X size={16} />Aanbod intrekken</button>}
    </article>
  }), [offers, canEdit, disabled, editing, open, jobId, locale, timeZone])
  const candidates = useMemo(() => {
    if (!canEdit || !deliveries || editing) return null
    const offeredIds = new Set()
    for (const offer of offers || []) if (OPEN_OFFER_STATES.has(offer.state)) offeredIds.add(offer.deliveryId)
    return <div className="client-delivery-candidates">{deliveries.filter(item => item.status === 'retained').map(item => <div key={item.id}><span>{item.title}</span><button type="button" className="secondary-button" disabled={disabled || !item.current || item.pending || !accessCount || offeredIds.has(item.id)} onClick={() => open('offer', item)}><Plus size={16} />Aan klant aanbieden</button></div>)}
      {!accessCount && <p>Geen goedgekeurde, actieve klanttoegang.</p>}
    </div>
  }, [canEdit, deliveries, editing, offers, disabled, accessCount, open])
  const accessId = record.accessId, selectedPhotoIds = record.photoIds
  const photoPicker = useMemo(() => accessId && <fieldset><legend>Reeds gedeelde gespreksfoto&apos;s</legend>{photoLoading && <p role="status">Foto&apos;s laden...</p>}{photoError && <p role="alert">{photoError}<button type="button" className="icon-button" aria-label="Gespreksfoto's opnieuw laden" title="Gespreksfoto's opnieuw laden" onClick={() => setPhotoVersion(value => value + 1)}><RefreshCw size={16} /></button></p>}
    {!photoLoading && !photoError && !visiblePhotos.length && <p>Geen gedeelde foto&apos;s in deze berichten.</p>}
    <div className="context-checks">{visiblePhotos.map(photo => <div key={photo.id}><label><input type="checkbox" checked={selectedPhotoIds.includes(photo.id)} disabled={!selectedPhotoIds.includes(photo.id) && selectedPhotoIds.length >= 10} onChange={event => set('photoIds', event.target.checked ? [...selectedPhotoIds, photo.id] : selectedPhotoIds.filter(id => id !== photo.id))} />{photo.attachment.filename}</label>{selectedPhotoIds.includes(photo.id) && <ConversationPhoto base={chatBase} message={photo} label={photo.attachment.filename} locale={locale} />}</div>)}</div>
    {photoCursor && <button type="button" className="secondary-button" disabled={photoLoading} onClick={olderPhotos}>Oudere gespreksfoto&apos;s</button>}
  </fieldset>, [accessId, photoLoading, photoError, visiblePhotos, selectedPhotoIds, chatBase, locale, photoCursor, olderPhotos, set])
  return <section className="work-context client-deliveries job-workspace-section" aria-label="Opleveren aan klant">
    <header><h3>Opleveren aan klant</h3><div className="context-actions">
      <button type="button" className="icon-button" title="Klantopleveringen verversen" aria-label="Klantopleveringen verversen" disabled={busy || loading} onClick={() => { setNotice(''); setError(''); setVersion(value => value + 1); onChanged?.() }}><RefreshCw size={18} /></button>
      <button type="button" className="icon-button" title="Klantopleveringen exporteren" aria-label="Klantopleveringen exporteren" disabled={!data || disabled} onClick={exportData}><ArrowDownToLine size={18} /></button>
    </div></header>
    {loading && <p role="status">Klantopleveringen laden...</p>}{loadError && <p role="alert">{loadError}</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {pending && !busy && canEdit && <button type="button" className="secondary-button" onClick={() => submit(pending)}><RefreshCw size={16} />Dezelfde wijziging opnieuw controleren</button>}
    {data && !data.offers.length && <p>Nog geen werk aan een klant aangeboden.</p>}
    {history}
    {candidates}
    {editor && canEdit && data && <form aria-label="Klantaanbod bewerken" onSubmit={event => { event.preventDefault(); void submit() }}><fieldset disabled={disabled}>
      <legend>{editor.action === 'offer' ? 'Klantaanbod voorbereiden' : 'Aanbod intrekken'}</legend>
      {stale && <div role="status"><p>Dossier gewijzigd sinds het openen van dit concept.</p>{chosen && <p>Actueel uitgevoerd deel: {chosen.scope}</p>}<button type="button" className="secondary-button" onClick={() => setEditor(previous => ({ ...previous, sourceHash: data.sourceHash }))}><Check size={16} />Actuele scope bevestigd</button></div>}
      {editor.action === 'offer' && <>
        <label>Klanttoegang<select required value={record.accessId} disabled={photoLoading} onChange={event => setRecord(previous => ({ ...previous, accessId: event.target.value, photoIds: [] }))}><option value="">Selecteer klanttoegang</option>{data.options.accesses.map(row => <option key={row.id} value={row.id}>{row.label || row.id}</option>)}</select></label>
        <div className="context-fields"><label>Beoogde ontvanger<input required maxLength={200} value={record.recipientName} onChange={event => set('recipientName', event.target.value)} /></label><label>Reageren tot<input required type="datetime-local" value={record.expiresAt} onChange={event => set('expiresAt', event.target.value)} /></label></div>
        <label>Te controleren bevoegdheidsgrond<textarea required maxLength={2000} value={record.authorityReference} onChange={event => set('authorityReference', event.target.value)} /></label>
        <label>Titel voor klant<input required maxLength={200} value={record.title} onChange={event => set('title', event.target.value)} /></label>
        <label>Uitgevoerd deel voor klant<textarea required maxLength={4000} value={record.scope} onChange={event => set('scope', event.target.value)} /></label>
        {photoPicker}
        <label className="context-check"><input type="checkbox" required checked={record.scopeConfirmed} onChange={event => set('scopeConfirmed', event.target.checked)} />Klantbeschrijving betreft uitsluitend dit uitgevoerde deel</label>
      </>}
      <label>{editor.action === 'offer' ? 'Onderbouwing voor beoordelaar' : 'Reden intrekken'}<textarea required maxLength={2000} value={record.reason} onChange={event => set('reason', event.target.value)} /></label>
      <div className="context-actions"><button type="submit" className="primary-button" disabled={stale || photoLoading}><Save size={16} />{editor.action === 'offer' ? 'Publicatie ter beoordeling indienen' : 'Aanbod intrekken bevestigen'}</button><button type="button" className="secondary-button" onClick={() => setEditor(null)}><X size={16} />Annuleren</button></div>
    </fieldset></form>}
  </section>
}
