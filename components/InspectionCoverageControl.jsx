import { useEffect, useRef, useState } from 'react'
import { cancellableRead } from '../cancellable-read.mjs'
import { ArrowDownToLine, ClipboardCheck, Plus, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { companyApiUrl } from '../company-request.mjs'
import { coverageLabels, checkLabels } from '../inspection-coverage-labels.mjs'
import './WorkContextControl.css'
import './InspectionCoverageControl.css'

const statuses = { pending: 'Openstaand', approved: 'Goedgekeurd', rejected: 'Afgewezen', cancelled: 'Geannuleerd' }
const blankCheck = () => ({ key: `check-${crypto.randomUUID()}`, title: '', criterion: '', fieldInstruction: '', allowNotApplicable: false })
export default function InspectionCoverageControl({ api, jobId, canEdit = false, refreshKey = '', onChanged }) {
  const [data, setData] = useState(null), [error, setError] = useState(''), [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [version, setVersion] = useState(0)
  const [editor, setEditor] = useState(null), [record, setRecord] = useState({}), [pending, setPending] = useState(null)
  const locked = useRef(false), alive = useRef(true), url = `/api/ledger/jobs/${encodeURIComponent(jobId)}/inspection-coverage`
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  useEffect(() => {
    setLoading(true)
    return cancellableRead(api, url, result => { setData(result); setError('') },
      reason => setError(reason.message), () => setLoading(false))
  }, [api, url, version, refreshKey])
  const disabled = busy || loading || Boolean(pending)
  const set = (key, value) => setRecord(previous => ({ ...previous, [key]: value }))
  function edit(item, action) {
    const plan = item.history.find(row => row.id === item.coverage.planId)
    setEditor(action); setError(''); setNotice('')
    setRecord(action === 'plan' ? { deliveryId: item.id, scopeReference: plan?.scopeReference || '', reason: '', documentIds: [...(plan?.documentIds || [])], scopeConfirmed: false,
      checks: plan ? plan.checks.map(check => ({ ...check })) : [blankCheck()] }
      : { deliveryId: item.id, planId: plan.id, reason: '', responses: plan.checks.map(check => ({ key: check.key, outcome: 'passed', inspectionId: '', scopeReference: '', documentIds: [] })) })
  }
  async function submit(retry) {
    if (locked.current || !canEdit || !data || loading || (pending && !retry)) return
    const command = retry || { action: editor, record, entryKey: crypto.randomUUID(), sourceHash: data.sourceHash }
    locked.current = true; setBusy(true); setPending(command); setError(''); setNotice('')
    try {
      await api(url, { method: 'POST', body: JSON.stringify(command) })
      if (!alive.current) return
      setPending(null); setEditor(null); setVersion(value => value + 1); setNotice('Beoordeling toegevoegd aan Goedkeuringen.'); onChanged?.()
    } catch (reason) {
      if (!alive.current) return
      setError(reason.message)
      if ([400, 403, 404, 409, 413, 423].includes(reason.status || reason.statusCode)) setPending(null)
    } finally { locked.current = false; if (alive.current) setBusy(false) }
  }
  function exportData() {
    const link = document.createElement('a'), address = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    link.href = address; link.download = `keuringsdekking-${jobId}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(address), 1000)
  }
  const input = (label, value, update, max = 1500) => <label>{label}<textarea required maxLength={max} value={value || ''} onChange={event => update(event.target.value)} /></label>
  const evidence = (values, update) => <fieldset><legend>Afzonderlijke bronstukken</legend><div className="context-checks">{data.options.documents.filter(row => row.contentAvailable || row.reference).map(document => <label key={document.id}><input type="checkbox" checked={values.includes(document.id)} onChange={event => update(event.target.checked ? [...values, document.id] : values.filter(id => id !== document.id))} />{document.title}</label>)}</div>{!data.options.documents.some(row => row.contentAvailable || row.reference) && <p>Geen bronstukken met bestand of externe registratie beschikbaar.</p>}</fieldset>
  const currentDelivery = data?.records.find(row => row.id === record.deliveryId), currentPlan = currentDelivery?.history.find(row => row.id === record.planId)
  return <section className="work-context inspection-coverage job-workspace-section" aria-label="Keuringsdekking">
    <header><h3>Keuringsdekking</h3><div className="context-actions">
      <button type="button" className="icon-button" title="Keuringsdekking verversen" aria-label="Keuringsdekking verversen" disabled={disabled} onClick={() => { setNotice(''); setVersion(value => value + 1); onChanged?.() }}><RefreshCw size={18} /></button>
      <button type="button" className="icon-button" title="Keuringsdekking exporteren" aria-label="Keuringsdekking exporteren" disabled={!data || disabled} onClick={exportData}><ArrowDownToLine size={18} /></button>
    </div></header>
    {loading && <p role="status">Keuringsdekking laden...</p>}{error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {pending && !busy && canEdit && <button type="button" className="secondary-button" onClick={() => submit(pending)}><RefreshCw size={16} />Dezelfde wijziging opnieuw controleren</button>}
    {data && !data.records.length && <p>Nog geen deelopleveringen voor een controleplan.</p>}
    {data?.records.map(item => <article key={item.id} className="coverage-record" aria-label={item.title}>
      <h4>{item.title}</h4><p>{item.scope}</p><p><strong>{coverageLabels[item.coverage.status]}</strong> / {item.coverage.covered} van {item.coverage.total} controles</p>
      <ul>{item.coverage.checks.map(check => <li key={check.key}><strong>{check.title}</strong><p>{check.fieldInstruction}</p><p>{checkLabels[check.status]}</p></li>)}</ul>
      {item.history.length > 0 && <details><summary>Controleplannen en beoordelingen ({item.history.length})</summary>{item.history.map(decision => <section key={decision.id} aria-label={`Beoordeling ${decision.sequence}`}>
        <h5>{decision.kind === 'plan' ? 'Controleplan' : 'Dekkingsbeoordeling'} {decision.sequence}: {statuses[decision.status]}</h5><p>{decision.reason}</p>{!decision.sourceCurrent && <p>Scope of bewijs gewijzigd</p>}
        {decision.scopeReference && <p>{decision.scopeReference}</p>}{decision.checks?.map(check => <p key={check.key}>{check.title}: {check.criterion}</p>)}
        {decision.responses?.map(response => <p key={response.key}>{response.key}: {checkLabels[response.outcome]} / {response.scopeReference}</p>)}
        {[...new Set([...(decision.documentIds || []), ...(decision.responses || []).flatMap(response => response.documentIds)])].map(id => { const document = data.options.documents.find(row => row.id === id); return document?.contentAvailable
          ? <p key={id}><a href={companyApiUrl(`/api/ledger/documents/${encodeURIComponent(id)}/content`)}>Bronbestand: {document.title}</a></p>
          : <p key={id}>Bronregistratie: {document?.title || id}{document?.reference && ` / ${document.reference}`}</p> })}
      </section>)}</details>}
      {canEdit && item.status === 'retained' && <div className="context-actions"><button type="button" className="secondary-button" disabled={disabled || Boolean(editor) || item.coverage.pending} onClick={() => edit(item, 'plan')}><Plus size={16} />{item.coverage.planId ? 'Controleplan herzien' : 'Controleplan opstellen'}</button>
        {item.coverage.planId && <button type="button" className="secondary-button" disabled={disabled || Boolean(editor) || item.coverage.pending || !item.history.find(row => row.id === item.coverage.planId)?.sourceCurrent} onClick={() => edit(item, 'assessment')}><ClipboardCheck size={16} />Bewijs per controle beoordelen</button>}</div>}
    </article>)}
    {editor && canEdit && data && <form aria-label="Keuringsdekking bewerken" onSubmit={event => { event.preventDefault(); void submit() }}><fieldset disabled={disabled}>
      <legend>{editor === 'plan' ? 'Controleplan' : 'Bewijs per controle'} / {currentDelivery?.title}</legend>
      {editor === 'plan' && <>{input('Afbakening controlescope', record.scopeReference, value => set('scopeReference', value), 2000)}
        {record.checks.map((check, index) => { const update = (key, value) => set('checks', record.checks.map((row, at) => at === index ? { ...row, [key]: value } : row)); return <fieldset className="coverage-check" key={check.key}>
          <legend>Controle {index + 1}</legend><label>Controletitel voor uitvoerende<input required maxLength={200} value={check.title} onChange={event => update('title', event.target.value)} /></label>
          {input('Acceptatiecriterium', check.criterion, value => update('criterion', value))}{input('Instructie voor uitvoerende', check.fieldInstruction, value => update('fieldInstruction', value))}
          <label><input type="checkbox" checked={check.allowNotApplicable} onChange={event => update('allowNotApplicable', event.target.checked)} />Niet-toepasselijkheid mag met bewijs worden beoordeeld</label>
          <button type="button" className="icon-button" title={`Controle ${index + 1} verwijderen`} aria-label={`Controle ${index + 1} verwijderen`} disabled={record.checks.length === 1} onClick={() => set('checks', record.checks.filter((_, at) => at !== index))}><Trash2 size={18} /></button>
        </fieldset> })}
        <button type="button" className="secondary-button" disabled={record.checks.length >= 50} onClick={() => set('checks', [...record.checks, blankCheck()])}><Plus size={16} />Controle toevoegen</button>
        {evidence(record.documentIds, value => set('documentIds', value))}
        <label><input type="checkbox" required checked={record.scopeConfirmed} onChange={event => set('scopeConfirmed', event.target.checked)} />Alle vereiste controles voor dit beschreven deel zijn opgenomen</label>
      </>}
      {editor === 'assessment' && record.responses.map((response, index) => { const check = currentPlan?.checks.find(row => row.key === response.key); const update = (key, value) => set('responses', record.responses.map((row, at) => at === index ? { ...row, [key]: value } : row)); return <fieldset className="coverage-check" key={response.key}>
        <legend>{check?.title || response.key}</legend><p>{check?.criterion}</p><label>Uitkomst<select value={response.outcome} onChange={event => update('outcome', event.target.value)}><option value="passed">Akkoord met inspectiebewijs</option>{check?.allowNotApplicable && <option value="not_applicable">Niet van toepassing</option>}</select></label>
        {response.outcome === 'passed' && <label>Goedgekeurde keuring<select required value={response.inspectionId} onChange={event => update('inspectionId', event.target.value)}><option value="">Selecteer keuring</option>{data.options.inspections.filter(row => row.eligible).map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>}
        {input('Bewijs voor dit uitgevoerde deel', response.scopeReference, value => update('scopeReference', value), 2000)}{evidence(response.documentIds, value => update('documentIds', value))}
      </fieldset> })}
      {input('Onderbouwing voor beoordelaar', record.reason, value => set('reason', value), 2000)}
      <div className="context-actions"><button type="submit" className="primary-button"><Save size={16} />Ter beoordeling indienen</button><button type="button" className="secondary-button" onClick={() => setEditor(null)}><X size={16} />Annuleren</button></div>
    </fieldset></form>}
  </section>
}
