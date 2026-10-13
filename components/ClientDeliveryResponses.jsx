import { useEffect, useRef, useState } from 'react'
import { Camera, RefreshCw, Send } from 'lucide-react'
import { companyFetch } from '../company-request.mjs'
import { browserDraftStorage, draftScopeFingerprint, removeSessionDraft, useSessionDraftRecovery, writeSessionDraft } from '../draft-recovery'
import ClientDeliveryPhotos from './ClientDeliveryPhotos'
import { clientDeliveryLabel as label } from '../client-delivery-labels.mjs'
import './ClientDelivery.css'

async function request(token, path, options = {}) {
  const response = await companyFetch(path, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw Object.assign(new Error(result?.error?.message || `Request failed (${response.status})`), { status: response.status })
  if (!result) throw new Error('Response unavailable')
  return result
}
const base = '/api/client-portal/deliveries', chatBase = '/api/client-portal/conversation'
const emptyResponseDraft = () => ({ outcome: '', respondent: '', note: '', authority: false, pendingAttempt: null })
async function photoHash(file) {
  const bytes = await file.arrayBuffer(), digest = await window.crypto.subtle.digest('SHA-256', bytes)
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
}
function DeliveryResponse({ offer, token, locale, canSubmit, onReceived, draftScope }) {
  const nl = locale.startsWith('nl'), t = (dutch, english) => nl ? dutch : english
  const storageScope = draftScope || `client-portal:${draftScopeFingerprint(token)}`
  const draftName = `delivery-response:${draftScopeFingerprint(`${offer.id}:${offer.sourceHash}`)}`
  const [draft, setDraft] = useState(emptyResponseDraft)
  useSessionDraftRecovery({ enabled: Boolean(storageScope), scope: storageScope, name: draftName, value: draft, setValue: setDraft })
  const values = draft && typeof draft === 'object' ? draft : emptyResponseDraft()
  const pending = values.pendingAttempt && typeof values.pendingAttempt === 'object' ? values.pendingAttempt : null
  const [file, setFile] = useState(null), [checkingPhoto, setCheckingPhoto] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('')
  const [draftHash] = useState(offer.sourceHash)
  const locked = useRef(false), alive = useRef(true), fileInput = useRef(null)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const current = offer.sourceHash === draftHash, disabled = busy || Boolean(pending) || !canSubmit || !current
  function persist(next) {
    setDraft(next)
    if (!storageScope) return
    if (next === null) removeSessionDraft(browserDraftStorage(), storageScope, draftName)
    else writeSessionDraft(browserDraftStorage(), storageScope, draftName, next)
  }
  function change(key, value) { setDraft({ ...values, [key]: value }) }
  function safeAttempt(attempt) {
    return { command: attempt.command, photoKey: attempt.photoKey || null, photoBody: attempt.photoBody || '',
      photoId: attempt.photoId || null, hasPhoto: attempt.hasPhoto === true, photoSha256: attempt.photoSha256 || '' }
  }
  async function submit(retry) {
    if (locked.current || !canSubmit || (!retry && (pending || !current || !offer.responseAllowed))) return
    const attempt = retry || { command: { entryKey: crypto.randomUUID(), sourceHash: draftHash, outcome: values.outcome,
      respondent: values.respondent, note: values.note, authorityConfirmed: values.authority, photoIds: [] },
    file, hasPhoto: Boolean(file), photoKey: file ? crypto.randomUUID() : null,
    photoBody: file ? `${t('Foto bij deeloplevering', 'Photo for partial delivery')}: ${offer.title}` : '', photoId: null, photoSha256: '' }
    if (attempt.hasPhoto && !attempt.photoId && !file) {
      setError(t('Selecteer dezelfde foto om de onzekere upload opnieuw te controleren.', 'Select the same photo to check the uncertain upload again.'))
      return
    }
    locked.current = true; setBusy(true); setError('')
    try {
      if (attempt.hasPhoto && !attempt.photoSha256) attempt.photoSha256 = await photoHash(file)
      persist({ ...values, pendingAttempt: safeAttempt(attempt) })
      if (attempt.hasPhoto && !attempt.photoId) {
        const form = new FormData(); form.set('entryKey', attempt.photoKey); form.set('evidenceFile', file)
        form.set('body', attempt.photoBody)
        const uploaded = await request(token, `${chatBase}/messages`, { method: 'POST', body: form })
        if (!uploaded.message?.id) throw new Error(t('Foto-ontvangst nog onbekend.', 'Photo receipt is still unknown.'))
        attempt.photoId = uploaded.message.id
        persist({ ...values, pendingAttempt: safeAttempt(attempt) })
      }
      attempt.command.photoIds = attempt.photoId ? [attempt.photoId] : []
      persist({ ...values, pendingAttempt: safeAttempt(attempt) })
      await request(token, `${base}/${encodeURIComponent(offer.id)}/responses`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(attempt.command) })
      if (!alive.current) return
      persist(null); setFile(null); if (fileInput.current) fileInput.current.value = ''
      onReceived()
    } catch (reason) {
      if (!alive.current) return
      setError(reason.message)
      if ([400, 401, 403, 404, 409, 413, 415, 423].includes(reason.status)) persist({ ...values, pendingAttempt: null })
    } finally { locked.current = false; if (alive.current) setBusy(false) }
  }
  async function selectRetryPhoto(selected) {
    if (!selected) return
    if (selected.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(selected.type)) {
      setError(t('Kies een JPEG-, PNG- of WebP-foto van maximaal 5 MB.', 'Choose a JPEG, PNG or WebP photo no larger than 5 MB.')); return
    }
    setCheckingPhoto(true); setError('')
    try {
      if (pending?.hasPhoto && !pending.photoId && await photoHash(selected) !== pending.photoSha256) {
        setFile(null); setError(t('Dit is niet dezelfde foto. Kies het oorspronkelijk geselecteerde bestand.', 'This is not the same photo. Select the originally chosen file.')); return
      }
      setFile(selected)
    } catch { setFile(null); setError(t('De foto kan niet worden gecontroleerd in deze browser.', 'This browser could not verify the photo.')) }
    finally { setCheckingPhoto(false) }
  }
  return <article className="client-delivery-record" aria-label={offer.title}>
    <header><h3>{offer.title}</h3><span>{offer.state === 'available' && offer.response ? t('Beantwoord', 'Answered') : label(offer.state, locale)}</span></header>
    <p className="client-delivery-scope">{offer.scope}</p>
    <p>{t('Versie', 'Version')} {offer.version} / {t('Reageren tot', 'Respond by')} <time dateTime={offer.expiresAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(offer.expiresAt))}</time></p>
    <ul>{offer.quantities.map((row, index) => <li key={index}>{row.quantity} {row.unit} / {row.description}</li>)}{offer.tasks.map((task, index) => <li key={`task-${index}`}>{task.title}</li>)}</ul>
    <p>{label(offer.coverageStatus, locale, true)}</p>
    <ClientDeliveryPhotos photos={offer.photos} base={chatBase} token={token} locale={locale} />
    {offer.response && <div className="client-delivery-response" role="status"><strong>{label(offer.response.status, locale)}</strong><p>{label(offer.response.outcome, locale)} / {offer.response.respondent}</p><p>{offer.response.note}</p>
      <ClientDeliveryPhotos photos={offer.response.photos} base={chatBase} token={token} locale={locale} />
    </div>}
    {error && <p role="alert">{error}</p>}
    {pending?.hasPhoto && !pending.photoId && !file && !offer.response && <label className="client-delivery-retry-photo">{t('Selecteer dezelfde foto voor de onzekere upload', 'Select the same photo for the uncertain upload')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy || checkingPhoto} onChange={event => { void selectRetryPhoto(event.target.files?.[0] || null) }} />{checkingPhoto && <span role="status">{t('Foto controleren...', 'Checking photo...')}</span>}</label>}
    {pending && !busy && !offer.response && <button type="button" disabled={!canSubmit || checkingPhoto || (pending.hasPhoto && !pending.photoId && !file)} onClick={() => submit(pending)}><RefreshCw size={16} />{t('Dezelfde reactie opnieuw controleren', 'Check the same response again')}</button>}
    {!current && !offer.response && <p role="alert">{t('Dit aanbod is gewijzigd. Uw concept is niet verzonden.', 'This offer has changed. Your draft has not been sent.')}</p>}
    {offer.responseAllowed && !offer.response && <form aria-label={t('Reactie op deeloplevering', 'Partial delivery response')} onSubmit={event => { event.preventDefault(); void submit() }}><fieldset disabled={disabled}>
      <legend>{t('Uw reactie op dit uitgevoerde deel', 'Your response to this completed portion')}</legend>
      <label>{t('Reactie', 'Response')}<select required value={values.outcome || ''} onChange={event => change('outcome', event.target.value)}><option value="">{t('Kies uw reactie', 'Select your response')}</option>{['accepted', 'accepted_with_reservations', 'disputed'].map(value => <option key={value} value={value}>{label(value, locale)}</option>)}</select></label>
      <label>{t('Uw naam', 'Your name')}<input required autoComplete="name" maxLength={200} value={values.respondent || ''} onChange={event => change('respondent', event.target.value)} /></label>
      <label>{t('Toelichting en eventuele voorbehouden', 'Comments and any reservations')}<textarea required maxLength={2000} value={values.note || ''} onChange={event => change('note', event.target.value)} /></label>
      <label className="client-delivery-check"><input type="checkbox" required checked={values.authority === true} onChange={event => change('authority', event.target.checked)} />{t('Ik ben de opdrachtgever of bevoegd om namens de opdrachtgever over dit deel te reageren.', 'I am the client or authorised to respond on the client\'s behalf about this portion.')}</label>
      <label><span><Camera size={18} />{t('Foto bij reactie (max. 5 MB)', 'Response photo (max. 5 MB)')}</span><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
        void selectRetryPhoto(event.target.files?.[0] || null)
      }} /></label>
      <button type="submit"><Send size={18} />{t('Reactie versturen', 'Send response')}</button>
    </fieldset></form>}
  </article>
}
export default function ClientDeliveryResponses({ token, locale = 'nl-NL', onResponse }) {
  const [offers, setOffers] = useState([]), [loading, setLoading] = useState(true), [error, setError] = useState(''), [version, setVersion] = useState(0)
  const nl = locale.startsWith('nl')
  const draftScope = `client-portal:${draftScopeFingerprint(token)}`
  useEffect(() => {
    const controller = new AbortController(); setLoading(true)
    request(token, base, { signal: controller.signal }).then(result => { if (!controller.signal.aborted) { setOffers(result.offers); setError('') } })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message) }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [token, version])
  return <section className="client-deliveries client-delivery-portal" aria-label={nl ? 'Aangeboden werk' : 'Offered work'}>
    <header><h2>{nl ? 'Aangeboden werk' : 'Offered work'}</h2><button type="button" disabled={loading} aria-label={nl ? 'Aangeboden werk verversen' : 'Refresh offered work'} title={nl ? 'Aangeboden werk verversen' : 'Refresh offered work'} onClick={() => setVersion(value => value + 1)}><RefreshCw size={18} /></button></header>
    {loading && <p role="status">{nl ? 'Aangeboden werk laden...' : 'Loading offered work...'}</p>}{error && <p role="alert">{error}</p>}
    {!loading && !error && !offers.length && <p>{nl ? 'Nog geen werk ter beoordeling aangeboden.' : 'No completed work offered for review yet.'}</p>}
    {offers.map(offer => <DeliveryResponse key={`${offer.id}:${offer.sourceHash}:${draftScope}`} offer={offer} token={token} locale={locale} canSubmit={!loading && !error} draftScope={draftScope} onReceived={() => { setVersion(value => value + 1); onResponse?.() }} />)}
  </section>
}
