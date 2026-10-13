import { useCallback, useEffect, useRef, useState } from 'react'
import { CalendarDays, RefreshCw, Save, Undo2 } from 'lucide-react'

const kindLabel = { start_on: 'Start op', milestone_by: 'Mijlpaal uiterlijk', complete_by: 'Oplevering uiterlijk' }
const dateLabel = value => value ? new Intl.DateTimeFormat('nl-NL', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : 'Geen datum'

export default function ClientDateCommitmentsControl({ api, jobId, canEdit }) {
  const [data, setData] = useState(null), [draft, setDraft] = useState(null), [withdrawal, setWithdrawal] = useState({}), [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [version, setVersion] = useState(0)
  const locked = useRef(false), url = `/api/ledger/jobs/${encodeURIComponent(jobId)}/client-date-commitments`
  const refresh = useCallback(async () => {
    setLoading(true); setError('')
    try { setData(await api(url)); setDraft(null) } catch (reason) { setError(reason.message) } finally { setLoading(false) }
  }, [api, url])
  useEffect(() => { void refresh() }, [refresh, version])
  function update(key, value) { setDraft(current => ({ ...current, [key]: value })) }
  async function submit(command) {
    if (locked.current || !canEdit) return
    locked.current = true; setBusy(true); setError(''); setNotice('')
    try { await api(url, { method: 'POST', body: JSON.stringify(command) }); setVersion(value => value + 1); setNotice('Contractuele klantdatum is controleerbaar vastgelegd. De planning en klant zijn niet aangepast.') }
    catch (reason) { setError(reason.message) } finally { locked.current = false; setBusy(false) }
  }
  function record(event) {
    event.preventDefault()
    if (!draft || !data) return
    const current = data.commitments.find(item => item.entryKey === draft.entryKey)
    void submit({ action: 'record', commandKey: draft.requestKey, entryKey: draft.entryKey.trim(), sourceType: draft.sourceType, sourceId: draft.sourceId,
      acceptedSourceHash: data.acceptedSources.find(item => item.type === draft.sourceType && item.id === draft.sourceId)?.sourceHash,
      expectedCommitmentHash: current?.commitmentHash || null, sourceHash: data.sourceHash, dateKind: draft.dateKind,
      date: draft.date, label: draft.label, contractWording: draft.contractWording, evidenceReference: draft.evidenceReference })
  }
  function openNew(entry = null) {
    setDraft(entry ? { entryKey: entry.entryKey, sourceType: entry.source.type, sourceId: entry.source.id, dateKind: entry.dateKind,
      date: entry.date, label: entry.label, contractWording: entry.contractWording, evidenceReference: entry.evidenceReference }
      : { requestKey: crypto.randomUUID(), entryKey: '', sourceType: data?.acceptedSources?.[0]?.type || 'quote', sourceId: data?.acceptedSources?.[0]?.id || '',
        dateKind: 'milestone_by', date: '', label: '', contractWording: '', evidenceReference: '' })
  }
  return <section className="work-context" aria-label="Contractuele klantdatums">
    <header><h4><CalendarDays size={17} /> Contractuele klantdatums</h4><button type="button" className="icon-button" aria-label="Contractdatums verversen" title="Verversen" disabled={loading || busy} onClick={() => setVersion(value => value + 1)}><RefreshCw size={16} /></button></header>
    <p>Leg alleen datums vast die in de geaccepteerde contractstukken staan. Streefdatums, planning en chatberichten zijn geen contractuele toezegging.</p>
    {loading && <p role="status">Contractbronnen laden...</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {data && <>
      {!data.acceptedSources.length && <p>Er is nog geen controleerbare geaccepteerde offerte of wijziging als contractbron.</p>}
      {data.commitments.map(item => <article className="balance-package" key={item.entryKey}>
        <h5>{item.label} · {dateLabel(item.date)}</h5>
        <p>{kindLabel[item.dateKind]} · versie {item.revision} · {item.status === 'withdrawn' ? 'ingetrokken' : item.sourceCurrent ? 'bron actueel' : 'contractbron gewijzigd; controle vereist'}</p>
        <p>{item.contractWording}</p><small>Bron: {item.source.title} / {item.source.evidenceReference}; contractpassage: {item.evidenceReference}. Vastgelegd door {item.recordedBy} op {new Date(item.recordedAt).toLocaleString('nl-NL')}.</small>
        {item.history.length > 1 && <details><summary>Versiehistorie ({item.history.length})</summary><ol>{item.history.map(revision => <li key={`${item.entryKey}-${revision.revision}`}>v{revision.revision}: {dateLabel(revision.date)} / {revision.status} / {revision.recordedBy} / {new Date(revision.recordedAt).toLocaleString('nl-NL')}{revision.withdrawalReason ? ` / ${revision.withdrawalReason}` : ''}</li>)}</ol></details>}
        {canEdit && item.status === 'active' && <div className="context-actions">
          <button type="button" className="secondary-button" disabled={busy || loading} onClick={() => openNew(item)}><CalendarDays size={15} />Nieuwe contractversie</button>
          <label>Reden intrekking<input maxLength={500} value={withdrawal[item.entryKey]?.reason || ''} onChange={event => setWithdrawal(current => ({ ...current, [item.entryKey]: { reason: event.target.value, requestKey: current[item.entryKey]?.requestKey || crypto.randomUUID() } }))} /></label>
          <button type="button" className="secondary-button" disabled={busy || !(withdrawal[item.entryKey]?.reason || '').trim()} onClick={() => void submit({ action: 'withdraw', commandKey: withdrawal[item.entryKey]?.requestKey || crypto.randomUUID(), entryKey: item.entryKey,
            sourceHash: data.sourceHash, expectedCommitmentHash: item.commitmentHash, withdrawalReason: withdrawal[item.entryKey].reason })}><Undo2 size={15} />Intrekken</button>
        </div>}
      </article>)}
      {canEdit && data.acceptedSources.length > 0 && !draft && <button type="button" className="secondary-button" onClick={() => openNew()}><CalendarDays size={15} />Contractdatum vastleggen</button>}
      {canEdit && draft && <form aria-label="Contractuele datum vastleggen" onSubmit={record}><fieldset disabled={busy || loading}><legend>{data.commitments.some(item => item.entryKey === draft.entryKey) ? 'Nieuwe versie' : 'Contractuele afspraak'}</legend>
        <label>Mijlpaalsleutel<input required minLength={2} maxLength={120} value={draft.entryKey} onChange={event => update('entryKey', event.target.value)} placeholder="bijv. definitieve-oplevering" /></label>
        <label>Geaccepteerde contractbron<select required value={`${draft.sourceType}:${draft.sourceId}`} onChange={event => { const [sourceType, sourceId] = event.target.value.split(':'); update('sourceType', sourceType); update('sourceId', sourceId) }}>{data.acceptedSources.map(source => <option key={`${source.type}:${source.id}`} value={`${source.type}:${source.id}`}>{source.title} · geaccepteerd {dateLabel(source.acceptedAt?.slice(0, 10))} · {source.evidenceReference}</option>)}</select></label>
        <label>Soort datum<select value={draft.dateKind} onChange={event => update('dateKind', event.target.value)}>{Object.entries(kindLabel).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
        <label>Datum<input required type="date" value={draft.date} onChange={event => update('date', event.target.value)} /></label>
        <label>Mijlpaal<input required maxLength={160} value={draft.label} onChange={event => update('label', event.target.value)} /></label>
        <label>Letterlijke contracttekst<textarea required minLength={8} maxLength={1000} value={draft.contractWording} onChange={event => update('contractWording', event.target.value)} /></label>
        <label>Contractdocument en pagina / artikel<input required maxLength={300} value={draft.evidenceReference} onChange={event => update('evidenceReference', event.target.value)} placeholder="contract.pdf, pagina 4, artikel 7.2" /></label>
        <div className="context-actions"><button type="submit" className="primary-button" disabled={!draft.sourceId || busy}><Save size={15} />Datumversie vastleggen</button><button type="button" className="secondary-button" onClick={() => setDraft(null)}>Annuleren</button></div>
      </fieldset></form>}
    </>}
  </section>
}
