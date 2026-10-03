import { lazy, Suspense, useEffect, useState } from 'react'
import { companyFetch } from './company-request.mjs'
import { CalendarDays, CircleAlert, CircleCheckBig, Download, FileSignature, FileText, HardHat, ListChecks, LoaderCircle, MessageSquareText, PackageCheck, RefreshCw, ShieldCheck, Star } from 'lucide-react'
import { draftScopeFingerprint, useSessionDraftRecovery } from './draft-recovery'
import { readClientSnapshot, removeClientSnapshot, saveClientSnapshot } from './client-message-outbox.mjs'
import { DEFAULT_PORTAL_LOCALE, normalizeLocale, portalText, SUPPORTED_LOCALES } from './locale'
import './ClientPortal.css'
import Conversation from './components/Conversation'
const ClientDeliveryResponses = lazy(() => import('./components/ClientDeliveryResponses'))

function formatPortalDate(value, locale) {
  if (!value) return portalText(locale, 'Nog niet gepland')
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return portalText(locale, 'Nog niet gepland')
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: String(value).includes('T') ? 'short' : undefined
  }).format(date)
}

const PORTAL_STATUS_LABELS = {
  'nl-NL': {
    active: 'actief', approved: 'goedgekeurd', changes_requested: 'aanpassing gevraagd', completed: 'afgerond',
    in_progress: 'in uitvoering', issued: 'uitgegeven', open: 'open', pending: 'in behandeling',
    pending_client: 'wacht op klant', pending_review: 'wacht op controle', planned: 'gepland', recorded: 'verwerkt',
    rejected: 'afgewezen', rejected_by_client: 'afgewezen door klant', scheduled: 'gepland'
  }
}

function formatPortalStatus(value, locale, fallback = 'in behandeling') {
  const status = String(value || fallback).toLowerCase().replace(/[ -]+/g, '_')
  return PORTAL_STATUS_LABELS[locale]?.[status] || status.replace(/_/g, ' ')
}

function createResponseId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  return `response-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function portalRequest(token, path = '', options = {}) {
  return companyFetch(`/api/client-portal${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  })
}

function attachmentFilename(response, fallback) {
  const disposition = response.headers.get('content-disposition') || ''
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1]
  if (!encoded) return fallback
  try {
    return decodeURIComponent(encoded)
  } catch {
    return fallback
  }
}

function formatPortalMoney(value, currency = 'EUR', locale = DEFAULT_PORTAL_LOCALE) {
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(Number(value || 0))
  } catch {
    return `${Number(value || 0).toFixed(2)} ${currency}`
  }
}

function emptySelectionDraft(selection) {
  return {
    decision: '',
    selectedOption: selection.options?.[0] || '',
    note: '',
    responseId: createResponseId()
  }
}

function emptyVariationDraft() {
  return {
    decision: '',
    signerName: '',
    authorityConfirmed: false,
    note: '',
    responseId: createResponseId()
  }
}

function emptyFeedbackDraft() {
  return {
    npsScore: '',
    csatScore: '',
    effortScore: '',
    comment: '',
    followUpConsent: false,
    testimonialConsent: false,
    responseId: createResponseId()
  }
}

function PortalList({ items, empty, render }) {
  if (!items?.length) return <p className="client-portal-empty">{empty}</p>
  return <ul className="client-portal-list">{items.map((item, index) => <li key={item.id || `${index}-${render(item)}`}>{render(item)}</li>)}</ul>
}

function SelectionResponseState({ response, t }) {
  if (!response) return null
  const recorded = response.status === 'recorded'
  const pending = response.status === 'pending_review'
  return <div className={`client-selection-response client-selection-response-${response.status}`} role="status">
    {recorded ? <CircleCheckBig size={18} /> : <CircleAlert size={18} />}
    <div>
      <strong>{recorded ? t('Reactie verwerkt') : pending ? t('Wacht op interne controle') : t('Reactie kan opnieuw worden ingediend')}</strong>
      <span>{response.decision === 'accepted'
        ? `${t('Keuze')}: ${response.selectedOption || t('bevestigd')}`
        : response.note || t('Uw verzoek om aanpassing is vastgelegd.')}</span>
    </div>
  </div>
}

function ClientSelection({ selection, draft, result, submitting, onDraftChange, onSubmit, locale, t }) {
  return <article className="client-portal-selection">
    <div className="client-selection-heading">
      <div><h3>{selection.title || t('Projectkeuze')}</h3><p>{selection.dueAt ? t('Reageer uiterlijk {date}', { date: formatPortalDate(selection.dueAt, locale) }) : t('Geen reactiedatum ingesteld')}</p></div>
      <span className={`client-selection-status client-selection-status-${selection.status}`}>{formatPortalStatus(selection.status, locale, 'open')}</span>
    </div>
    {selection.options?.length ? <div className="client-selection-options" aria-label={t('Beschikbare opties')}>{selection.options.map(option => <span key={option}>{option}</span>)}</div> : null}
    {selection.selectedOption && !selection.responseAllowed ? <p className="client-selection-confirmed"><strong>{t('Vastgelegde keuze:')}</strong> {selection.selectedOption}</p> : null}
    <SelectionResponseState response={selection.response} t={t} />
    {selection.responseAllowed && draft ? <form className="client-selection-form" onSubmit={event => onSubmit(event, selection)}>
      <fieldset>
        <legend>{t('Uw reactie')}</legend>
        <label><input type="radio" name={`decision-${selection.id}`} value="accepted" checked={draft.decision === 'accepted'} onChange={event => onDraftChange(selection.id, { decision: event.target.value })} />{t('Ik bevestig deze keuze')}</label>
        <label><input type="radio" name={`decision-${selection.id}`} value="changes_requested" checked={draft.decision === 'changes_requested'} onChange={event => onDraftChange(selection.id, { decision: event.target.value })} />{t('Ik wil een aanpassing')}</label>
      </fieldset>
      {draft.decision === 'accepted' && selection.options?.length ? <label>{t('Gekozen optie')}<select required aria-label={t('Gekozen optie voor {title}', { title: selection.title })} value={draft.selectedOption} onChange={event => onDraftChange(selection.id, { selectedOption: event.target.value })}>{selection.options.map(option => <option key={option} value={option}>{option}</option>)}</select></label> : null}
      <label>{draft.decision === 'changes_requested' ? t('Welke aanpassing wilt u?') : t('Toelichting (optioneel)')}<textarea required={draft.decision === 'changes_requested'} maxLength="2000" value={draft.note} onChange={event => onDraftChange(selection.id, { note: event.target.value })} /></label>
      <p className="client-portal-note">{t('Uw reactie wordt eerst intern gecontroleerd. Hiermee wijzigt u geen prijs, planning, opdracht of bestelling.')}</p>
      <div className="client-portal-submit"><button type="submit" disabled={submitting || !draft.decision || (draft.decision === 'changes_requested' && !draft.note.trim())}><ShieldCheck size={16} />{submitting ? t('Indienen...') : t('Ter beoordeling indienen')}</button><span aria-live="polite">{result}</span></div>
    </form> : null}
  </article>
}

function VariationResponseState({ response, t }) {
  if (!response) return null
  const recorded = response.status === 'recorded'
  const pending = response.status === 'pending_review'
  const label = response.decision === 'accepted'
    ? t('Akkoord geregistreerd')
    : response.decision === 'changes_requested'
      ? t('Aanpassing gevraagd')
      : t('Voorstel afgewezen')
  return <div className={`client-selection-response client-selection-response-${response.status}`} role="status">
    {recorded ? <CircleCheckBig size={18} /> : <CircleAlert size={18} />}
    <div>
      <strong>{pending ? t('Wacht op interne verificatie') : recorded ? label : t('Reactie kan opnieuw worden ingediend')}</strong>
      <span>{response.note || (response.signerName ? t('Ondertekend door {name}', { name: response.signerName }) : t('Uw reactie is vastgelegd.'))}</span>
    </div>
  </div>
}

function ClientVariation({ variation, draft, result, submitting, downloading, onDownload, onDraftChange, onSubmit, locale, t }) {
  const identity = `${variation.variationNumber || t('Variatie')} / R${variation.revisionNumber || 1}`
  const responseDueAt = variation.formalControl?.responseDueAt
  return <article className="client-portal-selection client-portal-variation">
    <div className="client-selection-heading">
      <div><h3>{identity} - {variation.title}</h3><p>{responseDueAt ? t('Reageer uiterlijk {date}', { date: formatPortalDate(responseDueAt, locale) }) : t('Geen reactiedatum ingesteld')}</p></div>
      <span className={`client-selection-status client-selection-status-${variation.status}`}>{formatPortalStatus(variation.status, locale, 'uitgegeven')}</span>
    </div>
    <p className="client-variation-scope">{variation.scopeDelta}</p>
    <div className="client-variation-facts">
      <span><small>{t('Bedrag incl. btw')}</small><strong>{formatPortalMoney(variation.total, variation.currency, locale)}</strong></span>
      <span><small>{t('Planning')}</small><strong>{Number(variation.scheduleDeltaDays || 0) === 0 ? t('Geen wijziging') : t('{days} kalenderdag(en)', { days: variation.scheduleDeltaDays })}</strong></span>
      <span><small>{t('Type')}</small><strong>{formatPortalStatus(variation.formalControl?.variationType, locale, t('scopewijziging'))}</strong></span>
    </div>
    <button type="button" className="client-variation-download" disabled={downloading} onClick={() => onDownload(variation)}><Download size={16} />{downloading ? t('Download voorbereiden...') : t('Download genummerd voorstel')}</button>
    <VariationResponseState response={variation.response} t={t} />
    {result ? <p className="client-variation-result" role="status" aria-live="polite">{result}</p> : null}
    {variation.responseAllowed && draft ? <form className="client-selection-form" onSubmit={event => onSubmit(event, variation)}>
      <fieldset>
        <legend>{t('Uw besluit')}</legend>
        <label><input type="radio" name={`variation-decision-${variation.id}`} value="accepted" checked={draft.decision === 'accepted'} onChange={event => onDraftChange(variation.id, { decision: event.target.value })} />{t('Ik ga akkoord')}</label>
        <label><input type="radio" name={`variation-decision-${variation.id}`} value="changes_requested" checked={draft.decision === 'changes_requested'} onChange={event => onDraftChange(variation.id, { decision: event.target.value })} />{t('Ik vraag een aanpassing')}</label>
        <label><input type="radio" name={`variation-decision-${variation.id}`} value="rejected" checked={draft.decision === 'rejected'} onChange={event => onDraftChange(variation.id, { decision: event.target.value })} />{t('Ik wijs dit voorstel af')}</label>
      </fieldset>
      <div className="client-variation-response-fields">
        {draft.decision === 'accepted' ? <>
          <label>{t('Naam bevoegde ondertekenaar')}<input required maxLength="160" value={draft.signerName} onChange={event => onDraftChange(variation.id, { signerName: event.target.value })} /></label>
          <label className="client-variation-authority"><input type="checkbox" checked={draft.authorityConfirmed} onChange={event => onDraftChange(variation.id, { authorityConfirmed: event.target.checked })} />{t('Ik ben bevoegd om dit voorstel namens de opdrachtgever te accepteren.')}</label>
        </> : null}
        <label>{draft.decision === 'accepted' ? t('Toelichting (optioneel)') : t('Reden en gewenste wijziging')}<textarea required={draft.decision !== 'accepted'} maxLength="2000" value={draft.note} onChange={event => onDraftChange(variation.id, { note: event.target.value })} /></label>
      </div>
      <p className="client-portal-note">{t('Uw besluit wordt eerst intern geverifieerd tegen het genummerde voorstel. Tot die verificatie wijzigt geen contractsom en is het extra werk niet geautoriseerd.')}</p>
      <div className="client-portal-submit"><button type="submit" disabled={submitting || !draft.decision || (draft.decision === 'accepted' && (!draft.signerName.trim() || !draft.authorityConfirmed)) || (draft.decision !== 'accepted' && draft.note.trim().length < 5)}><ShieldCheck size={16} />{submitting ? t('Indienen...') : t('Besluit indienen')}</button></div>
    </form> : null}
  </article>
}

export default function ClientPortal() {
  const [token] = useState(() => new URLSearchParams(window.location.hash.slice(1)).get('token') || '')
  const [offlineShellReady, setOfflineShellReady] = useState(false)
  const [offlineSnapshotAt, setOfflineSnapshotAt] = useState('')
  const [portalRefresh, setPortalRefresh] = useState(0)
  const [locale, setLocale] = useState(DEFAULT_PORTAL_LOCALE)
  const [localeSaving, setLocaleSaving] = useState(false)
  const [localeError, setLocaleError] = useState('')
  const [job, setJob] = useState(null)
  const [conversationRefresh, setConversationRefresh] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectionDrafts, setSelectionDrafts] = useState({})
  const [selectionResults, setSelectionResults] = useState({})
  const [selectionSubmitting, setSelectionSubmitting] = useState('')
  const [variationDrafts, setVariationDrafts] = useState({})
  const [variationResults, setVariationResults] = useState({})
  const [variationSubmitting, setVariationSubmitting] = useState('')
  const [variationDownloading, setVariationDownloading] = useState('')
  const [feedbackDraft, setFeedbackDraft] = useState(() => emptyFeedbackDraft())
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false)
  const [feedbackResult, setFeedbackResult] = useState('')
  const [completionReview, setCompletionReview] = useState(null)
  const [completionDraft, setCompletionDraft] = useState({ outcome: '', respondentName: '', authorityConfirmed: false, note: '' })
  const [completionBusy, setCompletionBusy] = useState(false)
  const [completionDownloading, setCompletionDownloading] = useState(false)
  const [completionResult, setCompletionResult] = useState('')
  const portalDraftScope = `client-portal:${draftScopeFingerprint(token)}`
  const portalDraftRecoveryEnabled = token.length >= 32
  const t = (key, variables) => portalText(locale, key, variables)

  useSessionDraftRecovery({ enabled: portalDraftRecoveryEnabled, scope: portalDraftScope, name: 'selections', value: selectionDrafts, setValue: setSelectionDrafts })
  useSessionDraftRecovery({ enabled: portalDraftRecoveryEnabled, scope: portalDraftScope, name: 'variations', value: variationDrafts, setValue: setVariationDrafts })
  useSessionDraftRecovery({ enabled: portalDraftRecoveryEnabled, scope: portalDraftScope, name: 'feedback', value: feedbackDraft, setValue: setFeedbackDraft })

  useEffect(() => {
    if (!portalDraftRecoveryEnabled || !('serviceWorker' in navigator)) return undefined
    let active = true
    const serviceWorker = navigator.serviceWorker
    const onControllerChange = () => { if (active && serviceWorker.controller) setOfflineShellReady(true) }
    serviceWorker.addEventListener('controllerchange', onControllerChange)
    serviceWorker.register('/field-sw.js').then(() => serviceWorker.ready).then(() => onControllerChange()).catch(() => {})
    onControllerChange()
    return () => { active = false; serviceWorker.removeEventListener('controllerchange', onControllerChange) }
  }, [portalDraftRecoveryEnabled])

  useEffect(() => {
    const previousTitle = document.title
    let robots = document.querySelector('meta[name="robots"]')
    const createdRobots = !robots
    if (!robots) {
      robots = document.createElement('meta')
      robots.name = 'robots'
      document.head.append(robots)
    }
    const previousRobots = robots.content
    document.title = `Contractor.AI - ${portalText(locale, 'Uw project')}`
    document.documentElement.lang = locale.slice(0, 2)
    robots.content = 'noindex, nofollow'
    return () => {
      document.title = previousTitle
      if (createdRobots) robots.remove()
      else robots.content = previousRobots
    }
  }, [locale])

  useEffect(() => {
    if (token.length < 32) {
      setError(portalText(DEFAULT_PORTAL_LOCALE, 'Deze projectlink is ongeldig of verlopen. Vraag om een nieuwe link.'))
      setLoading(false)
      return undefined
    }

    const controller = new AbortController()
    setLoading(true); setError('')
    const loadPortal = async () => {
      try {
        let response
        try { response = await portalRequest(token, '', { signal: controller.signal }) }
        catch (networkError) {
          if (networkError.name === 'AbortError') throw networkError
          const cached = await readClientSnapshot('portal', token, portalDraftScope).catch(() => null)
          if (!cached || controller.signal.aborted) throw networkError
          setLocale(normalizeLocale(cached.value.locale, DEFAULT_PORTAL_LOCALE))
          setJob(cached.value.job)
          setCompletionReview(null)
          setFeedbackSubmitted(cached.value.feedbackSubmitted === true)
          setOfflineSnapshotAt(cached.updatedAt)
          return
        }
        const payload = await response.json().catch(() => ({}))
        if (!response.ok) {
          if ([401, 403].includes(response.status)) await removeClientSnapshot('portal', portalDraftScope).catch(() => {})
          throw new Error(payload?.error?.message || portalText(DEFAULT_PORTAL_LOCALE, 'Deze projectlink is niet beschikbaar.'))
        }
        const retainedLocale = normalizeLocale(payload.portal?.locale, DEFAULT_PORTAL_LOCALE)
        setLocale(retainedLocale)
        setJob(payload.job)
        setCompletionReview(payload.portal?.completionReview || null)
        setFeedbackSubmitted(payload.portal?.feedback?.submitted === true)
        setOfflineSnapshotAt('')
        void saveClientSnapshot('portal', { job: payload.job, locale: retainedLocale, feedbackSubmitted: payload.portal?.feedback?.submitted === true }, token, portalDraftScope).catch(() => {})
        setSelectionDrafts(current => Object.fromEntries((payload.job?.selections || [])
          .filter(selection => selection.responseAllowed)
          .map(selection => [selection.id, { ...emptySelectionDraft(selection), ...(current[selection.id] || {}) }])))
        setVariationDrafts(current => Object.fromEntries((payload.job?.variations || [])
          .filter(variation => variation.responseAllowed)
          .map(variation => [variation.id, { ...emptyVariationDraft(), ...(current[variation.id] || {}) }])))
      } catch (requestError) {
        if (requestError.name !== 'AbortError') setError(requestError.message || portalText(DEFAULT_PORTAL_LOCALE, 'Deze projectlink is niet beschikbaar.'))
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    }
    loadPortal()
    return () => controller.abort()
  }, [portalDraftScope, portalRefresh, token])

  async function updatePortalLocale(nextLocale) {
    const normalized = normalizeLocale(nextLocale, DEFAULT_PORTAL_LOCALE)
    if (normalized === locale || localeSaving) return
    const previous = locale
    setLocaleError('')
    setLocale(normalized)
    setLocaleSaving(true)
    try {
      const response = await portalRequest(token, '/preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locale: normalized })
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error?.message || portalText(normalized, 'Deze projectlink is niet beschikbaar.'))
    } catch (requestError) {
      setLocale(previous)
      setLocaleError(requestError.message)
    } finally {
      setLocaleSaving(false)
    }
  }

  function updateSelectionDraft(selectionId, patch) {
    setSelectionDrafts(current => ({
      ...current,
      [selectionId]: { ...current[selectionId], ...patch }
    }))
    setSelectionResults(current => ({ ...current, [selectionId]: '' }))
  }

  async function submitSelectionResponse(event, selection) {
    event.preventDefault()
    const draft = selectionDrafts[selection.id]
    if (!draft?.decision || selectionSubmitting) return
    setSelectionSubmitting(selection.id)
    setSelectionResults(current => ({ ...current, [selection.id]: t('Uw reactie wordt opgeslagen...') }))
    try {
      const response = await portalRequest(token, `/selections/${encodeURIComponent(selection.id)}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error?.message || t('Uw reactie kon niet worden opgeslagen.'))
      setJob(current => ({
        ...current,
        selections: current.selections.map(item => item.id === selection.id
          ? { ...item, responseAllowed: false, response: { ...payload.response, status: 'pending_review' } }
          : item)
      }))
      setSelectionDrafts(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== selection.id)))
      setSelectionResults(current => ({ ...current, [selection.id]: t('Uw reactie wacht op interne controle.') }))
    } catch (requestError) {
      setSelectionResults(current => ({ ...current, [selection.id]: requestError.message || t('Uw reactie kon niet worden opgeslagen.') }))
    } finally {
      setSelectionSubmitting('')
    }
  }

  function updateVariationDraft(changeOrderId, patch) {
    setVariationDrafts(current => ({
      ...current,
      [changeOrderId]: { ...current[changeOrderId], ...patch }
    }))
    setVariationResults(current => ({ ...current, [changeOrderId]: '' }))
  }

  async function submitVariationResponse(event, variation) {
    event.preventDefault()
    const draft = variationDrafts[variation.id]
    if (!draft?.decision || variationSubmitting) return
    setVariationSubmitting(variation.id)
    setVariationResults(current => ({ ...current, [variation.id]: t('Uw besluit wordt veilig opgeslagen...') }))
    try {
      const response = await portalRequest(token, `/change-orders/${encodeURIComponent(variation.id)}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft)
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error?.message || t('Uw besluit kon niet worden opgeslagen.'))
      setJob(current => ({
        ...current,
        variations: current.variations.map(item => item.id === variation.id
          ? { ...item, responseAllowed: false, response: { ...payload.response, status: 'pending_review' } }
          : item)
      }))
      setVariationDrafts(current => Object.fromEntries(Object.entries(current).filter(([id]) => id !== variation.id)))
      setVariationResults(current => ({ ...current, [variation.id]: t('Uw besluit wacht op interne verificatie.') }))
    } catch (requestError) {
      setVariationResults(current => ({ ...current, [variation.id]: requestError.message || t('Uw besluit kon niet worden opgeslagen.') }))
    } finally {
      setVariationSubmitting('')
    }
  }

  async function downloadVariationPackage(variation) {
    if (variationDownloading) return
    setVariationDownloading(variation.id)
    setVariationResults(current => ({ ...current, [variation.id]: t('Download wordt voorbereid...') }))
    try {
      const response = await portalRequest(token, `/change-orders/${encodeURIComponent(variation.id)}/package`)
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error?.message || t('Het voorstel kon niet worden gedownload.'))
      }
      const objectUrl = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = objectUrl
      anchor.download = attachmentFilename(response, `${variation.variationNumber || 'variation'}-R${variation.revisionNumber || 1}.html`)
      document.body.append(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(objectUrl)
      setVariationResults(current => ({ ...current, [variation.id]: t('Download gestart.') }))
    } catch (requestError) {
      setVariationResults(current => ({ ...current, [variation.id]: requestError.message || t('Het voorstel kon niet worden gedownload.') }))
    } finally {
      setVariationDownloading('')
    }
  }

  async function submitFeedback(event) {
    event.preventDefault()
    if (feedbackSubmitting || feedbackSubmitted) return
    setFeedbackSubmitting(true)
    setFeedbackResult(t('Uw feedback wordt veilig opgeslagen...'))
    try {
      const response = await portalRequest(token, '/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedbackDraft)
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error?.message || t('Uw feedback kon niet worden opgeslagen.'))
      setFeedbackSubmitted(true)
      setFeedbackDraft(emptyFeedbackDraft())
      setFeedbackResult(t('Bedankt. Uw feedback is toegevoegd aan het projectdossier.'))
    } catch (requestError) {
      setFeedbackResult(requestError.message || t('Uw feedback kon niet worden opgeslagen.'))
    } finally {
      setFeedbackSubmitting(false)
    }
  }

  async function downloadCompletionPackage() {
    if (completionDownloading) return
    setCompletionDownloading(true)
    setCompletionResult(t('Het opleverdossier wordt voorbereid...'))
    try {
      const response = await portalRequest(token, '/handover-package')
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}))
        throw new Error(payload?.error?.message || t('Het opleverdossier kan niet worden gedownload.'))
      }
      const url = URL.createObjectURL(await response.blob())
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = attachmentFilename(response, 'opleverdossier.html')
      document.body.append(anchor); anchor.click(); anchor.remove(); URL.revokeObjectURL(url)
      setCompletionResult(t('Download gestart.'))
    } catch (requestError) {
      setCompletionResult(requestError.message || t('Het opleverdossier kan niet worden gedownload.'))
    } finally { setCompletionDownloading(false) }
  }

  async function submitCompletionReview(event) {
    event.preventDefault()
    if (completionBusy || !completionReview?.responseAllowed || !completionDraft.outcome) return
    setCompletionBusy(true)
    setCompletionResult(t('Uw opleverreactie wordt opgeslagen...'))
    try {
      const response = await portalRequest(token, '/completion-review', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...completionDraft, sourceHash: completionReview.sourceHash, entryKey: createResponseId() })
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(payload?.error?.message || t('Uw opleverreactie kon niet worden opgeslagen.'))
      setCompletionReview(current => ({ ...current, response: payload.response, responseAllowed: false, sourceCurrent: true }))
      setCompletionDraft({ outcome: '', respondentName: '', authorityConfirmed: false, note: '' })
      setCompletionResult(t('Uw reactie is ontvangen en wacht op interne beoordeling.'))
    } catch (requestError) {
      setCompletionResult(requestError.message || t('Uw opleverreactie kon niet worden opgeslagen.'))
    } finally { setCompletionBusy(false) }
  }

  return <div className="client-portal-shell">
    <header className="client-portal-header">
      <div><span className="client-portal-mark"><HardHat size={19} /></span><strong>Contractor.AI</strong></div>
      <div className="client-portal-header-actions">
        <p><ShieldCheck size={15} />{t('Veilige projectinzage')}</p>
        <label className="client-portal-locale">
          <span className="visually-hidden">{t('Taal')}</span>
          <select aria-label={t('Taal')} value={locale} disabled={localeSaving || loading || !job} onChange={event => updatePortalLocale(event.target.value)}>
            {SUPPORTED_LOCALES.map(option => <option key={option.value} value={option.value}>{option.shortLabel}</option>)}
          </select>
        </label>
        <span className="visually-hidden" role="status" aria-live="polite">{localeError}</span>
      </div>
    </header>
    <main className="client-portal-main">
      {loading ? <div className="client-portal-state" role="status"><LoaderCircle className="spin" size={24} />{t('Uw project wordt geladen...')}</div> : null}
      {!loading && error ? <div className="client-portal-state client-portal-error" role="alert"><ShieldCheck size={22} /><div><strong>{t('Projectlink niet beschikbaar')}</strong><p>{error}</p></div></div> : null}
      {!loading && !error && job ? <>
        {offlineSnapshotAt ? <>
          <section className="client-portal-intro" aria-labelledby="client-project-title">
            <div><span className="client-portal-kicker">{t('Offline projectweergave')}</span><h1 id="client-project-title">{job.title || t('Uw project')}</h1></div>
            <button type="button" disabled={!navigator.onLine} onClick={() => setPortalRefresh(value => value + 1)}><RefreshCw size={16} />{t('Project vernieuwen')}</button>
          </section>
          <p className="client-portal-note" role="status">{t('Dit is een versleutelde momentopname van')} {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(offlineSnapshotAt))}. {t('Projectgegevens en eerdere berichten kunnen verouderd zijn. Alleen klantberichten kunnen lokaal worden bewaard; keuzes en contractbesluiten zijn offline uitgeschakeld.')}</p>
          <Conversation base="/api/client-portal/conversation" token={token} locale={locale} refreshKey={conversationRefresh} draftScope={`${portalDraftScope}:conversation`} offlineShellReady={offlineShellReady} />
        </> : <>
        <section className="client-portal-intro" aria-labelledby="client-project-title">
          <div>
            <span className="client-portal-kicker">{t('Uw project')}</span>
            <h1 id="client-project-title">{job.title || t('Uw project')}</h1>
            <p>{job.description || t('Projectinformatie wordt bijgewerkt.')}</p>
          </div>
          <span className="client-portal-status">{formatPortalStatus(job.status, locale)}</span>
        </section>

        <section className="client-portal-facts" aria-label={t('Projectoverzicht')}>
          <div><span>{t('Werkadres')}</span><strong>{job.address || t('Wordt bevestigd')}</strong></div>
          <div><span>{t('Voortgang')}</span><strong>{Math.round(Number(job.progressPercent || 0))}%</strong></div>
          <div><span>{t('Gepland')}</span><strong>{job.scheduledStart ? `${formatPortalDate(job.scheduledStart, locale)}${job.scheduledEnd ? ` ${t('tot')} ${formatPortalDate(job.scheduledEnd, locale)}` : ''}` : t('Nog niet gepland')}</strong></div>
          <div><span>{t('Verwachte afronding')}</span><strong>{formatPortalDate(job.targetCompletion, locale)}</strong></div>
        </section>

        <div className="client-portal-grid">
          <div className="client-portal-wide"><Suspense fallback={<p role="status">{locale.startsWith('nl') ? 'Aangeboden werk laden...' : 'Loading offered work...'}</p>}><ClientDeliveryResponses token={token} locale={locale} onResponse={() => setConversationRefresh(value => value + 1)} /></Suspense></div>
          <div className="client-portal-wide"><Conversation base="/api/client-portal/conversation" token={token} locale={locale} refreshKey={conversationRefresh} draftScope={`${portalDraftScope}:conversation`} offlineShellReady={offlineShellReady} /></div>
          <section className="client-portal-panel">
            <div className="client-portal-panel-title"><CalendarDays size={18} /><h2>{t('Afspraken')}</h2></div>
            <PortalList items={job.siteVisits} empty={t('Nog geen afspraak gepland.')} render={item => `${item.visitType || t('Afspraak')}: ${formatPortalStatus(item.status, locale, 'gepland')} - ${formatPortalDate(item.scheduledAt, locale)}`} />
          </section>
          <section className="client-portal-panel">
            <div className="client-portal-panel-title"><ListChecks size={18} /><h2>{t('Besluitvorming')}</h2></div>
            <p className="client-portal-note">{t('Open keuzes kunnen hieronder worden bevestigd of teruggestuurd voor aanpassing.')}</p>
          </section>
          <section className="client-portal-panel client-portal-wide client-portal-selections">
            <div className="client-portal-panel-title"><ShieldCheck size={18} /><h2>{t('Projectkeuzes')}</h2></div>
            {job.selections?.length ? job.selections.map(selection => <ClientSelection
              key={selection.id}
              selection={selection}
              draft={selectionDrafts[selection.id]}
              result={selectionResults[selection.id] || ''}
              submitting={selectionSubmitting === selection.id}
              onDraftChange={updateSelectionDraft}
              onSubmit={submitSelectionResponse}
              locale={locale}
              t={t}
            />) : <p className="client-portal-empty">{t('Er staan geen keuzes open.')}</p>}
          </section>
          <section className="client-portal-panel client-portal-wide client-portal-selections">
            <div className="client-portal-panel-title"><FileSignature size={18} /><h2>{t('Meer- en minderwerk')}</h2></div>
            <p className="client-portal-note">{t('Bekijk steeds het genummerde voorstel voordat u akkoord geeft, een wijziging vraagt of het voorstel afwijst.')}</p>
            {job.variations?.length ? job.variations.map(variation => <ClientVariation
              key={variation.id}
              variation={variation}
              draft={variationDrafts[variation.id]}
              result={variationResults[variation.id] || ''}
              submitting={variationSubmitting === variation.id}
              downloading={variationDownloading === variation.id}
              onDownload={downloadVariationPackage}
              onDraftChange={updateVariationDraft}
              onSubmit={submitVariationResponse}
              locale={locale}
              t={t}
            />) : <p className="client-portal-empty client-portal-section-empty">{t('Er zijn geen uitgegeven voorstellen voor meer- of minderwerk.')}</p>}
          </section>
          <section className="client-portal-panel client-portal-wide">
            <div className="client-portal-panel-title"><MessageSquareText size={18} /><h2>{t('Projectupdates')}</h2></div>
            <PortalList items={job.updates} empty={t('Er zijn nog geen gepubliceerde projectupdates.')} render={item => `${item.subject || t('Projectupdate')}: ${item.body || ''}`} />
          </section>
          <section className="client-portal-panel client-portal-wide">
            <div className="client-portal-panel-title"><FileText size={18} /><h2>{t('Beschikbare documenten')}</h2></div>
            <PortalList items={job.documents} empty={t('Er zijn nog geen documenten beschikbaar.')} render={item => `${item.title || 'Document'} (${item.type || 'document'})`} />
          </section>
          <section className="client-portal-panel client-portal-wide client-completion-review" data-testid="client-completion-review">
            <div className="client-portal-panel-title"><PackageCheck size={18} /><h2>{t('Opleverdossier beoordelen')}</h2></div>
            {completionReview?.available ? <>
              <p className="client-portal-note">{t('Dossier {reference}, versie {hash}. Uw reactie wordt als verklaring vastgelegd en is geen elektronische handtekening. Contractor.AI beoordeelt de reactie intern. Dit wijzigt niet automatisch de contractstatus, contractsom of betaling.', { reference: completionReview.package.issueReference, hash: completionReview.package.packageHash.slice(0, 12) })}</p>
              <button type="button" className="client-completion-download" disabled={completionDownloading} onClick={downloadCompletionPackage}><Download size={16} />{completionDownloading ? t('Download voorbereiden...') : t('Download opleverdossier')}</button>
              {completionReview.response ? <div className="client-completion-received" role="status"><strong>{t('Opleverreactie ontvangen')}</strong><span>{t(completionReview.response.outcome)} / {completionReview.response.respondentName} / {formatPortalDate(completionReview.response.submittedAt, locale)}</span><p>{completionReview.response.note}</p><small>{completionReview.sourceCurrent === false ? t('De beoordeelde dossierbron is gewijzigd of niet meer actueel. Controle vereist.') : t('Wacht op interne beoordeling; er is nog geen automatische acceptatie verwerkt.')}</small></div> : null}
              {completionReview.responseAllowed ? <form className="client-completion-form" onSubmit={submitCompletionReview}>
                <fieldset><legend>{t('Uw reactie')}</legend>
                  <label><input required type="radio" name="completion-outcome" value="accepted" checked={completionDraft.outcome === 'accepted'} onChange={event => setCompletionDraft(value => ({ ...value, outcome: event.target.value }))} />{t('Ik accepteer het opleverdossier')}</label>
                  <label><input required type="radio" name="completion-outcome" value="accepted_with_items" checked={completionDraft.outcome === 'accepted_with_items'} onChange={event => setCompletionDraft(value => ({ ...value, outcome: event.target.value }))} />{t('Ik accepteer met restpunten')}</label>
                  <label><input required type="radio" name="completion-outcome" value="not_accepted" checked={completionDraft.outcome === 'not_accepted'} onChange={event => setCompletionDraft(value => ({ ...value, outcome: event.target.value }))} />{t('Ik accepteer het dossier niet')}</label>
                </fieldset>
                <label>{t('Uw naam')}<input required minLength="2" maxLength="160" value={completionDraft.respondentName} onChange={event => setCompletionDraft(value => ({ ...value, respondentName: event.target.value }))} /></label>
                {completionDraft.outcome && completionDraft.outcome !== 'not_accepted' ? <label className="client-completion-authority"><input type="checkbox" checked={completionDraft.authorityConfirmed} onChange={event => setCompletionDraft(value => ({ ...value, authorityConfirmed: event.target.checked }))} />{t('Ik verklaar bevoegd te zijn om namens de opdrachtgever te reageren.')}</label> : null}
                <label>{t(completionDraft.outcome === 'accepted' ? 'Toelichting (optioneel)' : 'Toelichting of restpunten')}<textarea required={completionDraft.outcome !== 'accepted'} minLength={completionDraft.outcome === 'accepted' ? undefined : 5} maxLength="2000" value={completionDraft.note} onChange={event => setCompletionDraft(value => ({ ...value, note: event.target.value }))} /></label>
                <p className="client-portal-note">{t('Dit is geen gekwalificeerde elektronische handtekening of juridisch oordeel. Bewaar belangrijke formele afspraken ook via de overeengekomen contractuele route.')}</p>
                <button type="submit" disabled={completionBusy || !completionDraft.outcome || completionDraft.respondentName.trim().length < 2 || (completionDraft.outcome !== 'not_accepted' && !completionDraft.authorityConfirmed) || (completionDraft.outcome !== 'accepted' && completionDraft.note.trim().length < 5)}><ShieldCheck size={16} />{completionBusy ? t('Indienen...') : t('Opleverreactie indienen')}</button>
              </form> : null}
              <p className="client-completion-result" role="status" aria-live="polite">{completionResult}</p>
            </> : completionReview?.response ? <div className="client-completion-received" role="status"><strong>{t('Eerdere opleverreactie')}</strong><span>{t(completionReview.response.outcome)} / {completionReview.response.respondentName} / {formatPortalDate(completionReview.response.submittedAt, locale)}</span><p>{completionReview.response.note}</p><small>{t('De bron is niet langer actueel. Neem contact op met de aannemer voor een nieuwe dossierbeoordeling.')}</small></div> : <p className="client-portal-empty">{t('Er is nog geen actueel, gecontroleerd en aan u verstrekt opleverdossier beschikbaar.')}</p>}
          </section>
          <section className="client-portal-panel client-portal-wide" data-testid="client-feedback-panel">
            <div className="client-portal-panel-title"><Star size={18} /><h2>{t('Uw ervaring')}</h2></div>
            {feedbackSubmitted ? <div className="client-feedback-thanks" role="status"><CircleCheckBig size={20} /><div><strong>{t('Feedback ontvangen')}</strong><p>{feedbackResult || t('Uw eerdere reactie is veilig vastgelegd in het projectdossier.')}</p></div></div> : <>
              <p className="client-portal-note">{t('Met drie korte scores helpt u ons de uitvoering en service te verbeteren. Een reactie wijzigt geen contract, planning of garantie.')}</p>
              <form className="client-portal-form client-feedback-form" onSubmit={submitFeedback}>
                <label>{t('Aanbeveling (0-10)')}<select required aria-label={t('Hoe waarschijnlijk is het dat u ons aanbeveelt?')} value={feedbackDraft.npsScore} onChange={event => setFeedbackDraft(current => ({ ...current, npsScore: Number(event.target.value) }))}><option value="" disabled>{t('Selecteer een score')}</option>{Array.from({ length: 11 }, (_, score) => <option key={score} value={score}>{score}{score === 0 ? ` - ${t('zeer onwaarschijnlijk')}` : score === 10 ? ` - ${t('zeer waarschijnlijk')}` : ''}</option>)}</select></label>
                <label>{t('Tevredenheid (1-5)')}<select required aria-label={t('Hoe tevreden bent u?')} value={feedbackDraft.csatScore} onChange={event => setFeedbackDraft(current => ({ ...current, csatScore: Number(event.target.value) }))}><option value="" disabled>{t('Selecteer een score')}</option>{[1, 2, 3, 4, 5].map(score => <option key={score} value={score}>{score}{score === 1 ? ` - ${t('zeer ontevreden')}` : score === 5 ? ` - ${t('zeer tevreden')}` : ''}</option>)}</select></label>
                <label>{t('Gemak (1-5)')}<select required aria-label={t('Hoe gemakkelijk was samenwerken?')} value={feedbackDraft.effortScore} onChange={event => setFeedbackDraft(current => ({ ...current, effortScore: Number(event.target.value) }))}><option value="" disabled>{t('Selecteer een score')}</option>{[1, 2, 3, 4, 5].map(score => <option key={score} value={score}>{score}{score === 1 ? ` - ${t('zeer moeilijk')}` : score === 5 ? ` - ${t('zeer gemakkelijk')}` : ''}</option>)}</select></label>
                <label className="client-feedback-comment">{t('Toelichting (optioneel)')}<textarea maxLength="4000" value={feedbackDraft.comment} onChange={event => setFeedbackDraft(current => ({ ...current, comment: event.target.value }))} placeholder={t('Wat ging goed en wat kan beter?')} /></label>
                <label className="client-feedback-consent"><input type="checkbox" checked={feedbackDraft.followUpConsent} onChange={event => setFeedbackDraft(current => ({ ...current, followUpConsent: event.target.checked }))} />{t('U mag contact met mij opnemen over deze feedback.')}</label>
                <label className="client-feedback-consent"><input type="checkbox" checked={feedbackDraft.testimonialConsent} onChange={event => setFeedbackDraft(current => ({ ...current, testimonialConsent: event.target.checked }))} />{t('Mijn reactie mag intern worden beoordeeld voor een mogelijke referentie. Publicatie vraagt altijd aparte afstemming.')}</label>
                <div className="client-portal-submit client-feedback-submit"><button type="submit" disabled={feedbackSubmitting}><ShieldCheck size={16} />{feedbackSubmitting ? t('Opslaan...') : t('Feedback opslaan')}</button><span role="status" aria-live="polite">{feedbackResult}</span></div>
              </form>
            </>}
          </section>
        </div>
        </>}
      </> : null}
    </main>
  </div>
}
