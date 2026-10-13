import { Suspense, lazy, useEffect, useState } from 'react'
import { Download, LockKeyhole, RefreshCw, Trash2 } from 'lucide-react'
import { eraseVault, listVaultScopes, openVault, queuePhotoEvidence, queueResponse, queueSiteIssueReceipt, readVault, snapshotWorkerNotifications, synchronizeVault, updateVault } from './offline-work-packs.mjs'
import { fieldOutboxOperatorScope } from './field-outbox'
import { parseCompanyScope } from './company-scope.mjs'
import { companyFetch } from './company-request.mjs'
import { base64ToBytes } from './offline-drawings.mjs'
import './components/Conversation.css'

const OfflineDownload = lazy(() => import('./OfflineDownload.jsx'))
const OfflineSafetyDossier = lazy(() => import('./components/OfflineSafetyDossier.jsx'))

async function request(path, options = {}) {
  const isForm = typeof FormData !== 'undefined' && options.body instanceof FormData
  const response = await companyFetch(path, { ...options, headers: { ...(options.body && !isForm ? { 'Content-Type': 'application/json' } : {}), ...options.headers } })
  const result = await response.json()
  if (!response.ok) throw Object.assign(new Error(result.error?.message || 'Aanmelden vereist.'), { status: response.status })
  return result
}
function OfflinePdf({ file }) {
  const [url, setUrl] = useState('')
  useEffect(() => {
    if (!file) return
    const value = URL.createObjectURL(new Blob([base64ToBytes(file.base64)], { type: 'application/pdf' }))
    setUrl(value)
    return () => URL.revokeObjectURL(value)
  }, [file])
  return file && url ? <><a href={url} target="_blank" rel="noreferrer">PDF openen: {file.filename}</a> <a href={url} download={file.filename} style={{ display: 'inline-flex', minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center', verticalAlign: 'middle' }} aria-label={`PDF downloaden: ${file.filename}`} title={`PDF downloaden: ${file.filename}`}><Download size={18} /></a></> : <span>Bestand niet offline opgeslagen</span>
}

export default function OfflineField() {
  const [scopes, setScopes] = useState([])
  const [selectedScope, setSelectedScope] = useState('current')
  const [password, setPassword] = useState('')
  const [vault, setVault] = useState(null)
  const [jobId, setJobId] = useState('')
  const [tab, setTab] = useState('do')
  const [body, setBody] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [progressStatus, setProgressStatus] = useState('in_progress')
  const [progressTaskId, setProgressTaskId] = useState('')
  const [progressPercent, setProgressPercent] = useState('0')
  const [progressNote, setProgressNote] = useState('')
  const [equipmentConcernReservationId, setEquipmentConcernReservationId] = useState('')
  const [equipmentConcernType, setEquipmentConcernType] = useState('malfunction')
  const [photoSetId, setPhotoSetId] = useState('')
  const [photoNotes, setPhotoNotes] = useState('')
  const [photoFile, setPhotoFile] = useState(null)
  const [photoInputKey, setPhotoInputKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState('')
  const [erase, setErase] = useState(false)
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    let active = true
    listVaultScopes().then(keys => { if (active) { setScopes(keys); setSelectedScope(keys[0] || 'current') } }).catch(error => { if (active) setNotice(error.message) })
    return () => { active = false }
  }, [])
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const expired = Boolean(vault && vault.record.expiresAt <= now)
  const pack = expired ? null : vault?.data.packs.find(item => item.job.id === jobId)
  const progressTasks = pack?.do.filter(task => ['open', 'in_progress', 'blocked'].includes(task.status)) || []
  const selectedProgressTaskId = progressTasks.some(task => task.id === progressTaskId) ? progressTaskId : progressTasks[0]?.id || ''
  const heldEquipmentForTask = pack?.have?.equipment.filter(item => item.taskId === selectedProgressTaskId
    && item.custody?.status === 'checked_out' && item.custody.heldByYou) || []
  const photoSets = pack?.checks?.photos || []
  const selectedPhotoSetId = photoSets.some(item => item.id === photoSetId) ? photoSetId : photoSets[0]?.id || ''
  const selectedPhotoSet = photoSets.find(item => item.id === selectedPhotoSetId)
  const queuedPhotoEntries = vault?.data.queue.filter(item => item.kind === 'evidence' && item.jobId === jobId && item.payload.setId === selectedPhotoSetId) || []
  const conflictedPhoto = queuedPhotoEntries.some(item => item.state === 'conflict')
  const knownPhotoPhases = [...(selectedPhotoSet?.capturedPhases || []), ...queuedPhotoEntries.filter(item => item.state !== 'conflict').map(item => item.payload.phase)]
  const nextPhotoPhase = (selectedPhotoSet?.requiredPhases || []).find(phase => !knownPhotoPhases.includes(phase))
  async function action(fn) {
    if (busy) return
    setBusy(true); setNotice('')
    try { await fn() } catch (error) { setNotice(error.message) }
    finally { setBusy(false) }
  }
  const persist = async updated => {
    try { await updateVault(updated); setVault({ ...updated, data: structuredClone(updated.data) }) }
    catch (error) { setVault(null); setPassword(''); throw new Error(`${error.message} Ontgrendel opnieuw om de daadwerkelijk opgeslagen wachtrij te laden.`, { cause: error }) }
  }
  async function unlock() {
    const stored = await readVault(selectedScope)
    const expired = stored?.expiresAt <= Date.now()
    const session = expired ? await request('/api/session') : null
    if (expired && !session.operator?.authenticated) throw new Error('Meld je online aan om verlopen opslag en niet-verzonden reacties te herstellen.')
    const unlocked = await openVault(stored, password, { recoverExpired: expired })
    if (selectedScope !== 'current' && unlocked.data.scope !== selectedScope) throw new Error('De opgeslagen werkmap hoort bij een andere bedrijfsomgeving.')
    if (expired && fieldOutboxOperatorScope(session.operator) !== unlocked.data.scope) throw new Error('Herstel vereist het oorspronkelijke uitvoerdersaccount.')
    setVault(unlocked); setPassword(''); setJobId(unlocked.data.packs[0]?.job.id || '')
  }
  async function queue(kind) {
    if (vault.record.expiresAt <= Date.now()) throw new Error('Offline toegang verlopen. Herstel de wachtrij online.')
    const updated = { ...vault, data: structuredClone(vault.data) }
    const payload = kind === 'questions' ? { message: body } : kind === 'acknowledgments' ? { understood } : {
      taskId: selectedProgressTaskId, status: progressStatus, progressPercent: Number(progressPercent), note: progressNote,
      ...(equipmentConcernReservationId && progressStatus === 'blocked' ? { equipmentIssue: {
        reservationId: equipmentConcernReservationId, issueType: equipmentConcernType, note: progressNote
      } } : {})
    }
    queueResponse(updated.data, jobId, kind, payload)
    await persist(updated); setBody(''); setUnderstood(false); setProgressNote(''); setEquipmentConcernReservationId(''); setNotice('Op dit apparaat bewaard; nog niet door kantoor ontvangen.')
  }
  async function queuePhoto() {
    if (!photoFile) throw new Error('Maak een foto of kies eerst een afbeeldingsbestand.')
    if (photoFile.size > 2 * 1024 * 1024) throw new Error('De foto is groter dan 2 MB. Verklein de foto en probeer opnieuw.')
    const bytes = new Uint8Array(await photoFile.arrayBuffer())
    const updated = { ...vault, data: structuredClone(vault.data) }
    queuePhotoEvidence(updated.data, jobId, { setId: selectedPhotoSetId, phase: nextPhotoPhase, capturedAt: new Date().toISOString(), notes: photoNotes, filename: photoFile.name, mimeType: photoFile.type, bytes })
    await persist(updated)
    setPhotoFile(null); setPhotoInputKey(value => value + 1); setPhotoNotes(''); setNotice('De foto is versleuteld op dit apparaat opgeslagen. Kantoor heeft deze nog niet ontvangen of beoordeeld.')
  }
  async function queueSiteReceipt(issue, event) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const updated = { ...vault, data: structuredClone(vault.data) }
    queueSiteIssueReceipt(updated.data, jobId, issue.id, {
      receivedQuantity: Number(fields.get('receivedQuantity')), acceptedQuantity: Number(fields.get('acceptedQuantity')),
      damagedQuantity: Number(fields.get('damagedQuantity') || 0), receiptReference: fields.get('receiptReference'),
      evidenceReference: fields.get('evidenceReference'), location: fields.get('location')
    })
    await persist(updated)
    setNotice('Aankomst versleuteld op dit apparaat bewaard; magazijn- en bouwplaatsvoorraad zijn nog niet bijgewerkt.')
  }
  async function sync() {
    const session = await request('/api/session')
    if (!session.operator?.authenticated) throw new Error('Meld je eerst online aan met je eigen uitvoerdersaccount.')
    const updated = { ...vault, data: structuredClone(vault.data) }
    await synchronizeVault(updated.data, fieldOutboxOperatorScope(session.operator), request, () => persist(updated))
    try {
      updated.data.notifications = snapshotWorkerNotifications(await request('/api/work-board/notifications'))
      await persist(updated)
      setNotice(updated.data.queue.length ? 'Meldingen bijgewerkt. Niet alle reacties zijn verwerkt; controleer de wachtrij.' : 'Alle bewaarde reacties zijn ontvangen en de offline meldingen zijn bijgewerkt.')
    } catch (error) {
      setNotice(updated.data.queue.length ? 'Niet alle reacties zijn verwerkt. Controleer de wachtrij. Meldingen konden niet worden bijgewerkt.' : `Alle bewaarde reacties zijn door de server ontvangen. Meldingen konden niet worden bijgewerkt: ${error.message}`)
    }
  }
  return <main className="conversation offline-field" style={{ minHeight: '100vh' }}>
    <header><h1>Contractor.AI</h1><a href="/">Online omgeving</a></header><h2>Offline werkmap</h2>
      <p role="status">{notice}</p>
    {!vault ? <form onSubmit={event => { event.preventDefault(); void action(unlock) }}>
      <label>Bedrijfswerkmap<select value={selectedScope} disabled={busy} onChange={event => { setSelectedScope(event.target.value); setPassword(''); setErase(false) }}>{scopes.length ? scopes.map(scope => { const company = parseCompanyScope(scope); return <option key={scope} value={scope}>{company ? `${company.id} | ${company.principalId}` : 'Oude werkmap (bedrijf niet vastgelegd)'}</option> }) : <option value="current">Geen opgeslagen werkmap</option>}</select></label>
      <label>Offline wachtzin<input type="password" required minLength={10} value={password} onChange={event => setPassword(event.target.value)} /></label><button disabled={busy}><LockKeyhole size={18} />Ontgrendelen</button>
    </form> : <>
      <p>Opgeslagen kopie. Toegang en wijzigingen op kantoor kunnen offline niet worden gecontroleerd. Geen veiligheidsvrijgave.</p>
      <p>Beschikbaar tot {new Date(vault.record.expiresAt).toLocaleString('nl-NL')}</p>
      {expired ? <p>Offline toegang verlopen. Alleen herstel van niet-verzonden reacties is nog beschikbaar.</p> : null}
      {vault.data.notifications ? <section aria-labelledby="offline-notifications-title"><h3 id="offline-notifications-title">Opgeslagen meldingen</h3><p>Momentopname van {new Date(vault.data.notifications.savedAt).toLocaleString('nl-NL')}. Offline kunnen nieuwe meldingen of wijzigingen niet worden opgehaald. Controleer online vóór je vertrekt of handelt.</p>{vault.data.notifications.notifications.length ? <ul>{vault.data.notifications.notifications.map(item => <li key={item.id}><strong>{item.title}</strong> · {item.readAt ? 'Gelezen bij opslaan' : 'Ongelezen bij opslaan'}<p>{item.body}</p>{item.createdAt ? <time dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString('nl-NL')}</time> : null}</li>)}</ul> : <p>Geen meldingen opgeslagen.</p>}</section> : null}
      <button disabled={busy} onClick={() => { setVault(null); setBody(''); setUnderstood(false) }}><LockKeyhole size={18} />Vergrendelen</button>
      {!expired ? <label>Opgeslagen opdracht<select value={jobId} disabled={busy} onChange={event => { setJobId(event.target.value); setBody(''); setUnderstood(false) }}>{vault.data.packs.map(item => <option key={item.job.id} value={item.job.id}>{item.job.title}</option>)}</select></label> : null}
      {pack ? <>
        <h3>{pack.job.title}</h3><p>{pack.job.address} {pack.job.city}</p>
        <h4>Mijn ingeplande diensten</h4>
        {pack.assignments?.length ? <ul>{pack.assignments.map(assignment => <li key={assignment.id}><strong>{assignment.role || 'Uitvoering'}</strong><p>{assignment.scheduledStart ? new Date(assignment.scheduledStart).toLocaleString('nl-NL') : 'Starttijd niet vastgelegd'} - {assignment.scheduledEnd ? new Date(assignment.scheduledEnd).toLocaleString('nl-NL') : 'Eindtijd niet vastgelegd'}</p>{Number(assignment.allocationHours) > 0 ? <p>{assignment.allocationHours} toegewezen uren</p> : null}</li>)}</ul> : <p>Geen diensttijden opgeslagen. Neem vóór vertrek contact op met kantoor.</p>}
        <p>Projectplanning: {pack.job.scheduledStart ? new Date(pack.job.scheduledStart).toLocaleString('nl-NL') : 'Niet ingepland'} | Opgeslagen: {new Date(pack.savedAt).toLocaleString('nl-NL')} | Versie {pack.sourceHash.slice(0, 10)}</p>
        <nav aria-label="Werkpakketonderdelen">{[['can', 'Kunnen'], ['know', 'Weten'], ['have', 'Hebben'], ['do', 'Doen']].map(([key, label]) => <button key={key} aria-pressed={tab === key} onClick={() => setTab(key)}>{label}</button>)}</nav>
        {tab === 'know' ? <><p>{pack.job.description}</p><FieldWorkContext context={pack.know.workContext} />{pack.know.instructions.map(item => <article key={item.id}><h4>{item.title}</h4><p className="conversation-body">{item.body}</p></article>)}
          {pack.know.recoveryInstructions?.length ? <section aria-label="Bijgewerkte taakinstructies">
            <h4>Bijgewerkte taakinstructies van kantoor</h4>
            {pack.know.recoveryInstructions.map(instruction => <article key={instruction.id}>
              <strong>{pack.do.find(task => task.id === instruction.taskId)?.title || 'Taak'}</strong>
              <p className="conversation-body">{instruction.text}</p>
              <small>Vastgelegd: {new Date(instruction.recordedAt).toLocaleString('nl-NL')}</small>
            </article>)}
            <p>Leesbevestiging en hervattingsmelding worden met deze opgeslagen werkpakketversie versleuteld bewaard. De genoemde taak moet ook bij de voortgangsmelding worden gekozen. Tot synchronisatie heeft kantoor niets ontvangen. Dit is geen veiligheidsvrijgave.</p>
          </section> : null}
          <h4>Tekeningen</h4>{pack.know.drawings.map(item => <article key={item.id}><p>{item.title} | {item.revision} | {item.status}</p><OfflinePdf file={pack.offlineFiles?.find(file => file.drawingId === item.id)} /></article>)}
          <h4>Goedgekeurde submittals</h4>{(pack.know.submittals || []).length ? pack.know.submittals.map(item => <article key={item.id}>
            <p><strong>{item.title}</strong>{item.packageName ? ` | ${item.packageName}` : ''}</p>
            <p>{item.taskScope === 'tasks' ? `Gekoppelde taken: ${item.taskIds.map(taskId => pack.do.find(task => task.id === taskId)?.title).filter(Boolean).join('; ') || 'de geselecteerde taken'}` : 'Geldt voor de hele opdracht'}</p>
            {(item.attachments || []).map(attachment => <section key={attachment.id} aria-label={attachment.filename}>
              <p>{attachment.filename} | Goedgekeurde technische informatie; wijzigt geen opdracht, prijs, planning of startvrijgave.</p>
              <OfflinePdf file={pack.offlineFiles?.find(file => file.submittalId === item.id && file.documentId === attachment.id)} />
            </section>)}
            {!item.attachments?.length ? <p>Geen geverifieerde PDF-bijlage beschikbaar in deze werkmap.</p> : null}
          </article>) : <p>Geen goedgekeurde submittals voor deze werkmap.</p>}
          <h4>Veiligheidsinformatiebladen</h4>{(pack.know.sdsSheets || []).map(item => <article key={item.id}><p>{item.material} | {item.manufacturer} | revisie {item.revisionNumber}</p>{item.linkedMaterials?.length ? <p>Gekoppelde materialen: {item.linkedMaterials.map(material => material.name).join('; ')}</p> : null}<p>Gevaren: {(item.hazardClasses || []).join('; ')} | PBM: {(item.requiredPpe || []).join('; ')}</p><OfflinePdf file={pack.offlineFiles?.find(file => file.sdsSheetId === item.id)} /></article>)}
          {(pack.know.sdsReadiness?.items || []).length ? <section><h4>Beoordeling SDS per materiaal</h4>{pack.know.sdsReadiness.items.map(item => <p key={item.materialRequirementId} className={!item.ready ? 'work-pack-warning' : ''}><strong>{item.material}:</strong> {item.requirement === 'required' ? (item.ready ? 'Actueel veiligheidsblad en veiligheidsplan gekoppeld' : !item.sheetIds.length ? 'Verplicht veiligheidsblad ontbreekt' : 'Veiligheidsblad ontbreekt in het veiligheidsplan') : item.requirement === 'not_required' ? 'SDS niet vereist volgens vastgelegde beoordeling' : 'Beoordeling nog niet vastgelegd'}</p>)}</section> : null}
          <Suspense fallback={<p role="status">Veiligheidsdossier laden...</p>}><OfflineSafetyDossier know={pack.know} /></Suspense></> : tab === 'have' ? <>
          <h4>Benodigde materialen</h4><ul>{pack.have.materials.map(item => <li key={item.id}><strong>{item.name}</strong><p>{item.quantity} {item.unit} | {item.status}</p></li>)}</ul>
          <h4>Verwachte magazijnleveringen</h4>
          {(pack.have.siteIssues || []).map(issue => {
            const queued = vault.data.queue.filter(entry => entry.kind === 'site_receipt' && entry.issueId === issue.id)
            const queuedReceived = queued.filter(entry => entry.state !== 'conflict').reduce((total, entry) => total + Number(entry.payload.receivedQuantity || 0), 0)
            const openQuantity = Math.max(0, Number(issue.remainingQuantity || 0) - queuedReceived)
            return <article key={issue.id}>
              <strong>{issue.materialName}: {issue.receivedQuantity} / {issue.quantity} {issue.unit}</strong>
              <p>Transport: {issue.dispatchReference} | Verwachte aankomst: {new Date(issue.expectedArrivalAt).toLocaleString('nl-NL')}</p>
              <p>Geaccepteerd op bouwplaats: {issue.acceptedQuantity} {issue.unit} | Nog onderweg volgens opgeslagen werkpakket: {issue.remainingQuantity} {issue.unit}</p>
              {queued.map(entry => <p key={entry.payload.entryKey} role="status">{entry.state === 'conflict' ? 'Controle nodig' : 'Lokaal bewaard, nog niet gesynchroniseerd'}: {entry.payload.receivedQuantity} {issue.unit} ontvangen, {entry.payload.acceptedQuantity} geaccepteerd, {entry.payload.damagedQuantity} beschadigd.</p>)}
              {openQuantity > 0 && !queued.some(entry => entry.state === 'conflict') ? <form onSubmit={event => { void action(() => queueSiteReceipt(issue, event)) }}>
                <label>Ontvangen hoeveelheid<input name="receivedQuantity" type="number" min="0.0001" max={openQuantity} step="0.0001" required disabled={busy || expired} /></label>
                <label>Geaccepteerde hoeveelheid<input name="acceptedQuantity" type="number" min="0" max={openQuantity} step="0.0001" defaultValue={openQuantity} required disabled={busy || expired} /></label>
                <label>Beschadigde hoeveelheid<input name="damagedQuantity" type="number" min="0" max={openQuantity} step="0.0001" defaultValue="0" disabled={busy || expired} /></label>
                <label>Ontvangstreferentie<input name="receiptReference" minLength="3" maxLength="240" required disabled={busy || expired} /></label>
                <label>Bewijsreferentie<input name="evidenceReference" minLength="3" maxLength="240" required disabled={busy || expired} /></label>
                <label>Ontvangen op locatie<input name="location" minLength="2" maxLength="240" defaultValue={[pack.job.address, pack.job.city].filter(Boolean).join(', ')} required disabled={busy || expired} /></label>
                <button disabled={busy || expired || openQuantity <= 0}>Aankomst versleuteld bewaren</button>
              </form> : null}
              {queued.some(entry => entry.state === 'conflict') ? <p role="alert">Deze levering is gewijzigd sinds de werkmap is opgeslagen. Laat kantoor de actuele levering controleren voordat je verder registreert.</p> : null}
            </article>
          })}
          {!pack.have.siteIssues?.length ? <p>Geen magazijnleveringen opgeslagen voor deze opdracht.</p> : null}
          <h4>Gereserveerd materieel</h4><ul>{pack.have.equipment.map(item => <li key={item.id}><strong>{item.toolName}</strong><p>{item.status}</p></li>)}</ul>
          <p>Aankomstregistraties worden versleuteld bewaard en pas na synchronisatie verwerkt. Verwachte of lokaal vastgelegde aantallen zijn nog geen bevestigde bouwplaatsvoorraad.</p>
        </> : <ul>{(tab === 'can' ? pack.can : [...pack.do, ...pack.checks.quality, ...pack.checks.photos]).map(item => <li key={item.id}><strong>{item.title || item.name || item.toolName}</strong><p className="conversation-body">{item.description}</p><p>{item.status} {item.quantity} {item.unit} {item.expiresOn}</p></li>)}</ul>}
        <label><input type="checkbox" checked={understood} onChange={event => setUnderstood(event.target.checked)} />Ik heb deze opgeslagen versie gelezen</label>
        <button disabled={busy || !understood} onClick={() => action(() => queue('acknowledgments'))}>Leesbevestiging lokaal bewaren</button>
        <form onSubmit={event => { event.preventDefault(); void action(() => queue('progress')) }}>
          <label>Taak<select required value={selectedProgressTaskId} onChange={event => { setProgressTaskId(event.target.value); setEquipmentConcernReservationId('') }}><option value="">Selecteer een taak</option>{progressTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
          <label>Voortgangsstatus<select value={progressStatus} onChange={event => { setProgressStatus(event.target.value); if (event.target.value !== 'blocked') setEquipmentConcernReservationId('') }}><option value="in_progress">In uitvoering</option><option value="blocked">Geblokkeerd</option></select></label>
          {progressStatus === 'blocked' && heldEquipmentForTask.length ? <>
            <label>Materieel met storing<select value={equipmentConcernReservationId} onChange={event => setEquipmentConcernReservationId(event.target.value)}>
              <option value="">Geen materieelstoring melden</option>{heldEquipmentForTask.map(item => <option key={item.id} value={item.id}>{item.toolName}</option>)}
            </select></label>
            {equipmentConcernReservationId ? <>
              <label>Soort melding<select value={equipmentConcernType} onChange={event => setEquipmentConcernType(event.target.value)}>
                <option value="malfunction">Storing</option><option value="damaged">Beschadigd</option><option value="unsafe">Onveilig</option>
              </select></label>
              <p className="work-pack-warning" role="status">Stop met het materieel en meld dit bij je uitvoerder. Bij synchroniseren wordt het materieel geblokkeerd totdat inspectie of herstel is vastgelegd.</p>
            </> : null}
          </> : null}
          <label>Voortgang (%)<input type="number" min="0" max="100" step="1" required value={progressPercent} onChange={event => setProgressPercent(event.target.value)} /></label>
          <label>{progressStatus === 'blocked' ? 'Blokkade en benodigde hulp' : 'Voortgang en bijzonderheden'}<textarea required minLength={3} maxLength={2000} value={progressNote} onChange={event => setProgressNote(event.target.value)} /></label>
          <button disabled={busy || !selectedProgressTaskId || Boolean(equipmentConcernReservationId) && progressNote.trim().length < 8}>Voortgang lokaal bewaren</button>
          <p>Wordt versleuteld op dit apparaat bewaard en pas na synchroniseren door kantoor ontvangen.</p>
        </form>
        {photoSets.length && nextPhotoPhase && !conflictedPhoto ? <form onSubmit={event => { event.preventDefault(); void action(queuePhoto) }}>
          <h3>Fotobewijs vastleggen</h3>
          <label>Werkcontrole<select required value={selectedPhotoSetId} disabled={busy} onChange={event => setPhotoSetId(event.target.value)}>{photoSets.map(item => <option key={item.id} value={item.id}>{item.title} · {item.workLocation}</option>)}</select></label>
          {selectedPhotoSet ? <p>Werkzaamheid: {pack.do.find(task => task.id === selectedPhotoSet.taskId)?.title || 'zie opdracht'} | Locatie: {selectedPhotoSet.workLocation} | Volgende fase: {nextPhotoPhase === 'before' ? 'Voor' : nextPhotoPhase === 'during' ? 'Tijdens' : 'Na'}</p> : null}
          <label>Foto (JPEG, PNG of WebP, maximaal 2 MB)<input key={photoInputKey} type="file" accept="image/jpeg,image/png,image/webp" capture="environment" required disabled={busy} onChange={event => setPhotoFile(event.target.files?.[0] || null)} /></label>
          <label>Toelichting (optioneel)<textarea maxLength={1000} value={photoNotes} disabled={busy} onChange={event => setPhotoNotes(event.target.value)} /></label>
          <button disabled={busy || !selectedPhotoSetId || !photoFile}>Foto versleuteld bewaren</button>
          <p>Fase en tijd komen van de opgeslagen opdracht en dit apparaat en zijn offline niet onafhankelijk bevestigd. Kantoor ontvangt en beoordeelt de foto pas na synchroniseren.</p>
        </form> : photoSets.length && conflictedPhoto ? <p role="status">Een fotofase wacht op controle. Verwijder of herstel eerst de conflicterende reactie.</p> : photoSets.length ? <p role="status">Alle fotofasen voor deze opgeslagen werkcontrole zijn vastgelegd; kantoor moet de reeks nog beoordelen.</p> : <p>Er zijn geen fotocontroles aan deze opgeslagen opdracht gekoppeld.</p>}
        <form onSubmit={event => { event.preventDefault(); void action(() => queue('questions')) }}><label>Vraag of blokkade<textarea required minLength={3} maxLength={4000} value={body} onChange={event => setBody(event.target.value)} /></label><button disabled={busy}>Vraag lokaal bewaren</button></form>
      </> : null}
      <h3>Wachtrij ({vault.data.queue.length})</h3><button disabled={busy} onClick={() => action(sync)}><RefreshCw size={18} />Synchroniseren</button>
      <ul>{vault.data.queue.map(entry => <li key={entry.payload.entryKey}><p>{entry.kind === 'evidence' ? `Foto ${entry.payload.phase === 'before' ? 'voor' : entry.payload.phase === 'during' ? 'tijdens' : 'na'} het werk: ${entry.payload.filename}${entry.payload.notes ? ` | ${entry.payload.notes}` : ''}` : entry.kind === 'site_receipt' ? `Materiaalaankomst ${entry.payload.receivedQuantity} ontvangen, ${entry.payload.acceptedQuantity} geaccepteerd, ${entry.payload.damagedQuantity} beschadigd (${entry.payload.receiptReference})` : entry.kind === 'progress' ? `${entry.payload.status === 'blocked' ? 'Geblokkeerd' : 'Voortgang'}: ${entry.payload.progressPercent}% | ${entry.payload.note}` : entry.payload.message || 'Leesbevestiging'} | {entry.state === 'conflict' ? 'Bron gewijzigd of fase niet meer beschikbaar; kantoor controleren' : 'Nog niet ontvangen'}</p>{entry.error ? <p>{entry.error}</p> : null}<button disabled={busy} onClick={() => action(() => persist({ ...vault, data: { ...vault.data, queue: vault.data.queue.filter(item => item !== entry) } }))}>Deze lokale reactie verwijderen</button></li>)}</ul>
    </>}
    <details><summary>Lokale gegevens verwijderen</summary><label><input type="checkbox" checked={erase} onChange={event => setErase(event.target.checked)} />Ook niet-verzonden reacties uit deze werkmap verwijderen</label><button disabled={!erase || busy} onClick={() => action(async () => { await eraseVault(selectedScope); const keys = await listVaultScopes(); setScopes(keys); setSelectedScope(keys[0] || 'current'); setVault(null); setPassword(''); setErase(false); setNotice('Geselecteerde werkmap verwijderd. Andere bedrijfswerkmappen zijn behouden.') })}><Trash2 size={18} />Werkmap verwijderen</button></details>
  </main>
}
import FieldWorkContext from './components/FieldWorkContext'
