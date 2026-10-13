import { useEffect, useRef, useState } from 'react'
import { cancellableRead } from '../cancellable-read.mjs'
import { ArrowDownToLine, ClipboardCheck, Link2, Plus, RefreshCw, RotateCcw, Save, X } from 'lucide-react'
import { companyApiUrl } from '../company-request.mjs'
import { coverageLabels } from '../inspection-coverage-labels.mjs'
import './WorkContextControl.css'
import './WorkDeliveryControl.css'

const physicalLabels = { reported: 'Uitvoering gemeld', source_changed: 'Bron gewijzigd', voided: 'Gecorrigeerd' }
const inspectionLabels = { not_linked: 'Geen keuring gekoppeld', linked_checks_passed: 'Gekoppelde keuringen akkoord', review_required: 'Keuring te beoordelen' }
const responseLabels = { not_verified: 'Niet geverifieerd', accepted: 'Geaccepteerd', accepted_with_reservations: 'Met voorbehoud geaccepteerd', disputed: 'Betwist', source_changed: 'Bron gewijzigd; opnieuw beoordelen', voided: 'Gecorrigeerd' }
const financeLabels = { not_linked: 'Geen termijn gekoppeld', not_invoiced: 'Nog niet gefactureerd', outstanding: 'Openstaand', paid: 'Gekoppelde facturen betaald', settled_with_adjustment: 'Afgewikkeld met credit / afboeking', allocation_conflict: 'Termijn dubbel gekoppeld; bedragen niet getoond' }
const money = (value, currency) => new Intl.NumberFormat('nl-NL', { style: 'currency', currency }).format(value)

export default function WorkDeliveryControl({ api, jobId, canEdit = false, refreshKey = '', onChanged }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [version, setVersion] = useState(0)
  const [editor, setEditor] = useState(null), [record, setRecord] = useState({}), [pending, setPending] = useState(null)
  const locked = useRef(false), alive = useRef(true)
  const url = `/api/ledger/jobs/${encodeURIComponent(jobId)}/work-deliveries`
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    setLoading(true)
    return cancellableRead(api, url, result => { setData(result); setError('') },
      reason => setError(reason.message), () => setLoading(false))
  }, [api, url, version, refreshKey])
  const disabled = busy || loading || Boolean(pending)
  const set = (key, value) => setRecord(previous => ({ ...previous, [key]: value }))
  function edit(action, values) { setEditor(action); setRecord(values); setError(''); setNotice('') }
  async function submit(retry) {
    if (locked.current || !canEdit || !data || loading || (pending && !retry)) return
    const command = retry || { action: editor, record, entryKey: crypto.randomUUID(), sourceHash: data.sourceHash }
    locked.current = true; setBusy(true); setPending(command); setError(''); setNotice('')
    try {
      const result = await api(url, { method: 'POST', body: JSON.stringify(command) })
      if (!alive.current) return
      setPending(null); setEditor(null); setVersion(value => value + 1)
      setNotice(result.approvalId ? 'Beoordeling toegevoegd aan Goedkeuringen.' : 'Deeloplevering bijgewerkt.')
      onChanged?.()
    } catch (reason) {
      if (!alive.current) return
      setError(reason.message)
      if ([400, 403, 404, 409, 413, 423].includes(reason.status || reason.statusCode)) setPending(null)
    } finally { locked.current = false; if (alive.current) setBusy(false) }
  }
  function exportData() {
    const link = document.createElement('a'), address = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    link.href = address; link.download = `deelopleveringen-${jobId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(address), 1000)
  }
  const input = (key, label, { max = 200, multiline = false, type = 'text' } = {}) => <label>{label}{multiline
    ? <textarea required maxLength={max} value={record[key] || ''} onChange={event => set(key, event.target.value)} />
    : <input required type={type} maxLength={max} value={record[key] || ''} onChange={event => set(key, event.target.value)} />}</label>
  const checks = (key, label, rows, display = row => row.title, disabledIds = new Set()) => <fieldset><legend>{label}</legend><div className="context-checks">{rows.map(row => {
    const checked = (record[key] || []).includes(row.id), linkedElsewhere = disabledIds.has(row.id)
    return <label key={row.id}><input type="checkbox" checked={checked} disabled={linkedElsewhere && !checked} onChange={event => set(key, event.target.checked ? [...record[key], row.id] : record[key].filter(id => id !== row.id))} />{display(row)}{linkedElsewhere && <small>{checked ? 'Dubbele bestaande koppeling; vink uit om te corrigeren' : 'Al gekoppeld aan een andere deeloplevering'}</small>}</label>
  })}</div>{!rows.length && <p>Geen beschikbare registraties.</p>}</fieldset>
  const claimedEntries = new Set(data?.records.filter(row => row.status === 'retained').flatMap(row => row.entryIds) || [])
  const claimedTasks = new Set(data?.records.filter(row => row.status === 'retained').flatMap(row => row.taskIds) || [])
  return <section className="work-context work-delivery job-workspace-section" aria-label="Deelopleveringen">
    <header><h3>Deelopleveringen</h3><div className="context-actions">
      <button type="button" className="icon-button" title="Deelopleveringen verversen" aria-label="Deelopleveringen verversen" disabled={disabled} onClick={() => setVersion(value => value + 1)}><RefreshCw size={18} /></button>
      <button type="button" className="icon-button" title="Deelopleveringen exporteren" aria-label="Deelopleveringen exporteren" disabled={!data || disabled} onClick={exportData}><ArrowDownToLine size={18} /></button>
      {canEdit && <button type="button" className="secondary-button" disabled={!data || disabled} onClick={() => edit('retain', { packageId: '', title: '', scope: '', entryIds: [], taskIds: [] })}><Plus size={16} />Uitgevoerd deel vastleggen</button>}
    </div></header>
    {loading && <p role="status">Deelopleveringen laden...</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {pending && !busy && canEdit && <button type="button" className="secondary-button" onClick={() => submit(pending)}><RefreshCw size={16} />Dezelfde wijziging opnieuw controleren</button>}
    {data && !data.records.length && <p>Nog geen deelopleveringen vastgelegd.</p>}
    {data?.records.map(item => <article className="delivery-record" key={item.id} aria-label={item.title}>
      <h4>{item.title}</h4><p className="delivery-scope">{item.scope}</p>
      <dl className="delivery-states"><div><dt>Uitvoering</dt><dd>{physicalLabels[item.physical.status]}</dd></div><div><dt>Keuring</dt><dd>{inspectionLabels[item.inspection.status]}</dd></div><div><dt>Klantreactie</dt><dd>{responseLabels[item.response.status]}{item.response.pending && <small>Beoordeling openstaand</small>}</dd></div><div><dt>Financieel</dt><dd>{financeLabels[item.finance.status]}</dd></div></dl>
      <ul>{item.physical.entries.map(entry => <li key={entry.id}>{entry.description}: {entry.quantity} {entry.unit}</li>)}{item.physical.tasks.map(task => <li key={task.id}>{task.title}: voltooiing gemeld</li>)}</ul>
      {item.inspection.records.length > 0 && <p>Keuringen: {item.inspection.records.map(row => row.title).join(', ')}</p>}
      {item.inspectionCoverage && <p>Keuringsdekking: {coverageLabels[item.inspectionCoverage.status]}</p>}
      {item.finance.status === 'allocation_conflict' && <p role="alert">Een of meer factuurtermijnen zijn aan meerdere actieve deelopleveringen gekoppeld. Bedragen zijn verborgen totdat de koppeling is hersteld.</p>}
      {item.finance.milestones.map(milestone => <p key={milestone.id}>Termijn {milestone.title}: {money(milestone.total, milestone.currency)} incl. btw{milestone.invoiceId ? ` / factuur ${milestone.invoiceId}` : ' / nog niet gefactureerd'}</p>)}
      {item.finance.invoices.map(invoice => <p key={invoice.id}>Factuur {invoice.id}: ontvangen {money(invoice.receivedAmount, invoice.currency)}; openstaand {money(invoice.outstandingAmount, invoice.currency)}{invoice.creditedAmount > 0 && `; gecrediteerd ${money(invoice.creditedAmount, invoice.currency)}`}{invoice.writtenOffAmount > 0 && `; afgeboekt ${money(invoice.writtenOffAmount, invoice.currency)}`}</p>)}
      {item.decisions.length > 0 && <details><summary>Beoordelingsgeschiedenis ({item.decisions.length})</summary><ul>{item.decisions.map(decision => { const evidence = data.options.documents.find(row => row.id === decision.evidenceDocumentId); return <li key={decision.id}>{decision.kind === 'void' ? 'Correctie' : responseLabels[decision.outcome]}: {({ pending: 'Openstaand', approved: 'Goedgekeurd', rejected: 'Afgewezen', cancelled: 'Geannuleerd' })[decision.status]}{decision.respondent && ` / ${decision.respondent}`}<p>{decision.reason}</p>{decision.respondedAt && <p>{decision.respondedAt} / {decision.authorityReference}</p>}{evidence?.contentAvailable ? <a href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(evidence.id)}/content`)}>Bronbestand: {evidence.title}</a> : decision.evidenceDocumentId && <p>Bronregistratie: {evidence?.title || decision.evidenceDocumentId}{evidence?.reference && ` / ${evidence.reference}`}</p>}</li> })}</ul></details>}
      {canEdit && item.status === 'retained' && <div className="context-actions">
        <button type="button" className="secondary-button" disabled={disabled || item.response.pending} onClick={() => edit('link', { id: item.id, inspectionIds: item.inspection.records.map(row => row.id), milestoneIds: item.finance.milestones.map(row => row.id) })}><Link2 size={16} />Keuringen en termijnen koppelen</button>
        <button type="button" className="secondary-button" disabled={disabled || item.response.pending || !item.physical.current} onClick={() => edit('request_response', { id: item.id, outcome: 'accepted', respondent: '', authorityReference: '', respondedAt: '', evidenceDocumentId: '', reason: '' })}><ClipboardCheck size={16} />Klantreactie ter beoordeling</button>
        <button type="button" className="secondary-button" disabled={disabled || item.response.pending} onClick={() => edit('request_void', { id: item.id, reason: '' })}><RotateCcw size={16} />Correctie aanvragen</button>
      </div>}
    </article>)}
    {editor && canEdit && data && <form aria-label="Deeloplevering bewerken" onSubmit={event => { event.preventDefault(); void submit() }}><fieldset disabled={disabled}>
      <legend>{({ retain: 'Uitgevoerd deel', link: 'Gekoppelde registraties', request_response: 'Klantreactie', request_void: 'Correctie' })[editor]}</legend>
      {editor === 'retain' && <><label>Werkpakket<select required value={record.packageId} onChange={event => { set('packageId', event.target.value); set('taskIds', []) }}><option value="">Selecteer werkpakket</option>{data.options.packages.map(item => <option key={item.id} value={item.id}>{item.code} / {item.title}</option>)}</select></label>{input('title', 'Titel deeloplevering')}{input('scope', 'Uitgevoerd deel en resterend werk', { multiline: true, max: 4000 })}
        {checks('entryIds', 'Bestaande productiemetingen', data.options.entries.filter(row => !claimedEntries.has(row.id)), row => `${row.lineKey}: ${row.quantity} ${row.unit} (${row.workDate}) / ${row.note}`)}
        {checks('taskIds', 'Volledig uitgevoerde taken', data.options.tasks.filter(task => !claimedTasks.has(task.id) && data.options.packages.find(item => item.id === record.packageId)?.taskIds.includes(task.id)))}</>}
      {editor === 'link' && <>{checks('inspectionIds', 'Keuringen', data.options.inspections)}{checks('milestoneIds', 'Factuurtermijnen', data.options.milestones, row => `${row.title} / ${row.status}`, new Set(data.records.filter(other => other.id !== record.id && other.status === 'retained').flatMap(other => other.finance.milestones.map(milestone => milestone.id))) )}</>}
      {editor === 'request_response' && <><label>Klantreactie<select value={record.outcome} onChange={event => set('outcome', event.target.value)}>{['accepted', 'accepted_with_reservations', 'disputed'].map(key => <option key={key} value={key}>{responseLabels[key]}</option>)}</select></label>
        <div className="context-fields">{input('respondent', 'Naam klant / vertegenwoordiger')}{input('respondedAt', 'Datum klantreactie', { type: 'date' })}</div>
        {input('authorityReference', 'Onderbouwing bevoegdheid', { max: 1000 })}<label>Klantbewijs<select required value={record.evidenceDocumentId} onChange={event => set('evidenceDocumentId', event.target.value)}><option value="">Selecteer dossierdocument</option>{data.options.documents.map(document => <option key={document.id} value={document.id}>{document.title}</option>)}</select></label></>}
      {['request_response', 'request_void'].includes(editor) && input('reason', 'Toelichting / voorbehoud', { multiline: true, max: 2000 })}
      <div className="context-actions"><button type="submit" className="primary-button"><Save size={16} />{editor.startsWith('request_') ? 'Ter beoordeling indienen' : 'Opslaan'}</button><button type="button" className="secondary-button" onClick={() => setEditor(null)}><X size={16} />Annuleren</button></div>
    </fieldset></form>}
  </section>
}
