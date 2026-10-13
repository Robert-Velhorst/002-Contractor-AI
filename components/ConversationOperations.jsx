import { useCallback, useEffect, useRef, useState } from 'react'
import { BrainCircuit, Link2, Send } from 'lucide-react'
import { companyFetch } from '../company-request.mjs'
import { toIsoDateTime } from '../dashboard-format'

export default function ConversationOperations({ base, isOwner, fieldTasks = [], onDraft, onApprovals, onRevealSource, onMessagesChanged, messages, locale = 'nl-NL' }) {
  const nl = locale.startsWith('nl')
  const t = (dutch, english) => nl ? dutch : english
  const localizeStatus = reason => {
    if (!nl) return reason
    if (reason === 'Local analysis is disabled.') return 'Lokale AI-analyse is uitgeschakeld.'
    if (reason === 'WhatsApp is disabled.') return 'WhatsApp is niet ingeschakeld.'
    if (reason === 'Configured; real provider acceptance requires operator evidence.') return 'Ingesteld; daadwerkelijke providerwerking moet nog door een beheerder worden gecontroleerd.'
    return reason
  }
  const [analysis, setAnalysis] = useState(null)
  const [approvedRfiResponses, setApprovedRfiResponses] = useState([])
  const [fieldReports, setFieldReports] = useState([])
  const [photoEvidence, setPhotoEvidence] = useState([])
  const [fieldReportDraft, setFieldReportDraft] = useState({ reportId: '', sourceHash: '', body: '' })
  const [fieldReportNotice, setFieldReportNotice] = useState('')
  const [photoEvidenceDraft, setPhotoEvidenceDraft] = useState({ captureId: '', origin: null, body: '' })
  const [photoEvidenceNotice, setPhotoEvidenceNotice] = useState('')
  const [modelCheck, setModelCheck] = useState(null)
  const [channel, setChannel] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [phone, setPhone] = useState('')
  const [consent, setConsent] = useState('')
  const [identity, setIdentity] = useState('')
  const [confirmation, setConfirmation] = useState(false)
  const [rfiDraft, setRfiDraft] = useState(null)
  const [variationDraft, setVariationDraft] = useState(null)
  const [selectionDraft, setSelectionDraft] = useState(null)
  const [rfiNotice, setRfiNotice] = useState('')
  const [variationNotice, setVariationNotice] = useState('')
  const [selectionNotice, setSelectionNotice] = useState('')
  const rfiCommand = useRef(null)
  const variationCommand = useRef(null)
  const selectionCommand = useRef(null)
  const fieldReportCommand = useRef(null)
  const photoEvidenceCommand = useRef(null)
  const apiAt = useCallback(async (url, payload) => {
    const response = await companyFetch(url, payload ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) } : {})
    const result = await response.json()
    if (!response.ok) throw new Error(result.error?.message || (nl ? 'Aanvraag mislukt.' : 'The request failed.'))
    return result
  }, [nl])
  const api = useCallback((suffix, payload) => apiAt(base + suffix, payload), [apiAt, base])
  const refresh = useCallback(async () => {
    const [nextAnalysis, nextChannel, nextRfiResponses, nextFieldReports, nextPhotoEvidence] = await Promise.all([
      api('/analysis'), api('/whatsapp'), api('/analysis/rfi-responses'), api('/field-reports'), api('/photo-evidence')
    ])
    setAnalysis(nextAnalysis)
    setChannel(nextChannel)
    setApprovedRfiResponses(nextRfiResponses.responses || [])
    setFieldReports(nextFieldReports.reports || [])
    setPhotoEvidence(nextPhotoEvidence.photos || [])
  }, [api])
  useEffect(() => {
    let current = true
    let timer
    const loadAnalysis = async () => {
      try {
        const value = await api('/analysis')
        if (!current) return
        setAnalysis(value)
        const waiting = ['queued', 'processing', 'retry_wait'].includes(value.queue?.status)
        const unreviewed = messages.some(message => message.direction === 'inbound' && !message.reviewedAt)
        const terminal = ['dead_letter', 'superseded'].includes(value.queue?.status)
        if (value.capability?.autoAnalyze && !terminal && (waiting || (!value.queue && unreviewed && !value.analysis?.current))) {
          timer = window.setTimeout(() => void loadAnalysis(), 5000)
        }
      } catch (reason) {
        if (current) setError(reason.message)
      }
    }
    void loadAnalysis()
    api('/whatsapp').then(value => { if (current) setChannel(value) }).catch(reason => { if (current) setError(reason.message) })
    api('/analysis/rfi-responses').then(value => { if (current) setApprovedRfiResponses(value.responses || []) }).catch(reason => { if (current) setError(reason.message) })
    api('/field-reports').then(value => { if (current) setFieldReports(value.reports || []) }).catch(reason => { if (current) setError(reason.message) })
    api('/photo-evidence').then(value => { if (current) setPhotoEvidence(value.photos || []) }).catch(reason => { if (current) setError(reason.message) })
    return () => { current = false; if (timer) window.clearTimeout(timer) }
  }, [api, messages])
  async function action(fn) { if (busy) return; setBusy(true); setError(''); try { await fn(); await refresh() } catch (reason) { setError(reason.message) } finally { setBusy(false) } }
  function startRfi(finding, identity) {
    rfiCommand.current = null; setRfiNotice('')
    setRfiDraft({ evidenceKind: 'message_finding', analysisIdentity: identity, sourceId: finding.sourceId, quote: finding.quote, category: finding.category,
      title: `${t('Klantbericht opvolgen', 'Follow up client message')}: ${finding.quote.slice(0, 120)}`, question: finding.suggestion, responsible: '', dueAt: '', shareWithField: false, fieldTaskIds: [] })
  }
  function startPhotoRfi(item, identity) {
    rfiCommand.current = null; setRfiNotice('')
    setRfiDraft({ evidenceKind: 'photo_observation', analysisIdentity: identity, sourceId: item.sourceId, photoSha256: item.sha256,
      observation: item.observation, uncertainty: item.uncertainty, title: `${t('Foto beoordelen', 'Review photo')}: ${item.observation.slice(0, 100)}`,
      question: t('Beoordeel deze waarneming op locatie en leg vast of interne opvolging nodig is.', 'Check this observation on site and record whether internal follow-up is needed.'), responsible: '', dueAt: '', shareWithField: false, fieldTaskIds: [] })
  }
  function startVariation(finding, identity) {
    variationCommand.current = null; setVariationNotice('')
    setVariationDraft({ analysisIdentity: identity, sourceId: finding.sourceId, quote: finding.quote,
      title: finding.suggestion.slice(0, 160), scopeDelta: finding.suggestion, justification: finding.suggestion,
      amount: '', scheduleDeltaDays: '', scheduleImpactNarrative: '', riskImpact: 'medium', riskImpactStatement: '' })
  }
  function startSelection(finding, identity) {
    selectionCommand.current = null; setSelectionNotice('')
    const due = new Date(Date.now() + 7 * 86400000)
    setSelectionDraft({ analysisIdentity: identity, sourceId: finding.sourceId, quote: finding.quote, category: finding.category,
      title: finding.quote.slice(0, 160), optionsText: '', dueAt: due.toISOString().slice(0, 10),
      rationale: finding.suggestion })
  }
  async function createRfi(event) {
    event.preventDefault()
    if (!rfiDraft || busy) return
    const signature = JSON.stringify(rfiDraft)
    if (rfiCommand.current?.signature !== signature) rfiCommand.current = { signature, entryKey: crypto.randomUUID() }
    const command = { ...rfiDraft, dueAt: toIsoDateTime(rfiDraft.dueAt), entryKey: rfiCommand.current.entryKey }
    await action(async () => {
      const route = command.evidenceKind === 'photo_observation' ? 'observations' : 'findings'
      const result = await api(`/analysis/${route}/${encodeURIComponent(command.sourceId)}/rfi`, command)
      setRfiNotice(t(`RFI ${result.rfi.title} is aan de interne opvolging toegevoegd. Er is geen bericht verzonden.`, `RFI ${result.rfi.title} was added to internal follow-up. No message was sent.`))
      setRfiDraft(null); rfiCommand.current = null
    })
  }
  async function createVariation(event) {
    event.preventDefault()
    if (!variationDraft || busy) return
    const signature = JSON.stringify(variationDraft)
    if (variationCommand.current?.signature !== signature) variationCommand.current = { signature, entryKey: crypto.randomUUID() }
    const command = { ...variationDraft, amount: Number(variationDraft.amount), scheduleDeltaDays: Number(variationDraft.scheduleDeltaDays), entryKey: variationCommand.current.entryKey }
    const jobBase = base.replace(/\/conversations\/[^/]+$/, '')
    if (jobBase === base) { setError(t('De opdrachtkoppeling voor dit wijzigingsconcept ontbreekt.', 'The job link for this variation draft is missing.')); return }
    await action(async () => {
      const result = await apiAt(`${jobBase}/change-orders`, command)
      setVariationNotice(t(`Wijzigingsconcept ${result.changeOrder.variationNumber} is aangemaakt en wacht op interne goedkeuring. Niet naar de klant verstuurd; werk is niet vrijgegeven.`, `Variation draft ${result.changeOrder.variationNumber} was created and awaits internal approval. It was not sent to the client; work has not been released.`))
      setVariationDraft(null); variationCommand.current = null
    })
  }
  async function createSelection(event) {
    event.preventDefault()
    if (!selectionDraft || busy) return
    const commandValue = { ...selectionDraft, options: selectionDraft.optionsText.split(/\r?\n/).map(value => value.trim()).filter(Boolean) }
    const signature = JSON.stringify(commandValue)
    if (selectionCommand.current?.signature !== signature) selectionCommand.current = { signature, entryKey: crypto.randomUUID() }
    const jobBase = base.replace(/\/conversations\/[^/]+$/, '')
    if (jobBase === base) { setError(t('De opdrachtkoppeling voor dit klantbesluit ontbreekt.', 'The job link for this customer decision is missing.')); return }
    await action(async () => {
      const result = await api(`/analysis/findings/${encodeURIComponent(commandValue.sourceId)}/client-selection`, { ...commandValue, entryKey: selectionCommand.current.entryKey })
      setSelectionNotice(t(`Klantkeuze ${result.selection.title} is opgeslagen als niet-zichtbaar concept en wacht op interne goedkeuring.`, `Customer choice ${result.selection.title} was saved as an unpublished draft and awaits internal approval.`))
      setSelectionDraft(null); selectionCommand.current = null
    })
  }
  async function createFieldReportDraft(event) {
    event.preventDefault()
    const signature = JSON.stringify(fieldReportDraft)
    if (!fieldReportDraft.reportId || !fieldReportDraft.sourceHash || fieldReportDraft.body.trim().length < 3) return
    if (fieldReportCommand.current?.signature !== signature) fieldReportCommand.current = { signature, entryKey: crypto.randomUUID() }
    await action(async () => {
      const result = await api(`/field-reports/${encodeURIComponent(fieldReportDraft.reportId)}/draft`, {
        sourceHash: fieldReportDraft.sourceHash, body: fieldReportDraft.body, entryKey: fieldReportCommand.current.entryKey
      })
      setFieldReportNotice(t('Klantupdate opgeslagen als privé concept op basis van het goedgekeurde dagrapport. Vraag daarna goedkeuring aan en publiceer afzonderlijk.', 'Client update saved as a private draft from the approved daily report. Request approval, then publish it separately.'))
      setFieldReportDraft({ reportId: '', sourceHash: '', body: '' }); fieldReportCommand.current = null
      onMessagesChanged?.()
      return result
    })
  }
  async function createPhotoEvidenceDraft(event) {
    event.preventDefault()
    if (!photoEvidenceDraft.captureId || !photoEvidenceDraft.origin || photoEvidenceDraft.body.trim().length < 3) return
    const signature = JSON.stringify(photoEvidenceDraft)
    if (photoEvidenceCommand.current?.signature !== signature) photoEvidenceCommand.current = { signature, entryKey: crypto.randomUUID() }
    await action(async () => {
      await api(`/photo-evidence/${encodeURIComponent(photoEvidenceDraft.captureId)}/draft`, {
        origin: photoEvidenceDraft.origin, body: photoEvidenceDraft.body, entryKey: photoEvidenceCommand.current.entryKey
      })
      setPhotoEvidenceNotice(t('Klantbericht met vrijgegeven werkfoto opgeslagen als privé concept. Goedkeuring en publicatie zijn aparte stappen; er is niets verzonden.', 'Client message with released work photo saved as a private draft. Approval and publication remain separate steps; nothing was sent.'))
      setPhotoEvidenceDraft({ captureId: '', origin: null, body: '' }); photoEvidenceCommand.current = null
      onMessagesChanged?.()
    })
  }
  return <div>
    {error ? <p role="alert">{error}</p> : null}
    <details><summary>{t('Brongekoppelde analyse', 'Source-linked analysis')}</summary>
      <p>{analysis?.capability?.enabled ? t(`Lokaal model: ${analysis.capability.model}`, `Local model: ${analysis.capability.model}`) : analysis?.capability?.reason ? localizeStatus(analysis.capability.reason) : t('Modelinstellingen laden...', 'Loading model settings...')}</p>
      {!nl && analysis?.capability?.enabled ? <p>Model-generated suggestions are currently written in Dutch.</p> : null}
      {analysis?.capability?.autoAnalyze ? <p role="status">{t('Onbeoordeelde klantberichten worden duurzaam lokaal verwerkt. De uitkomsten zijn uitsluitend interne voorstellen.', 'Unreviewed client messages are processed locally through the durable queue. Results are internal proposals only.')}</p> : null}
      <button type="button" disabled={busy || !analysis?.capability?.enabled} onClick={() => action(async () => { const result = await api('/analysis/check', {}); setModelCheck(result.check) })}>{t('Lokale modelverbinding testen', 'Test local model connection')}</button>
      {modelCheck ? <p role="status">{modelCheck.modelInstalled
        ? t(`Lokaal model bereikbaar: ${modelCheck.model} (Ollama ${modelCheck.runtimeVersion}). Er zijn geen klantgegevens verstuurd. Automatische analyse ${modelCheck.automaticAnalysis ? 'staat aan' : 'staat uit'}.`, `Local model reachable: ${modelCheck.model} (Ollama ${modelCheck.runtimeVersion}). No customer data was sent. Automatic analysis is ${modelCheck.automaticAnalysis ? 'on' : 'off'}.`)
        : t(`Ollama ${modelCheck.runtimeVersion} is bereikbaar, maar model ${modelCheck.model} is niet geïnstalleerd. Er zijn geen klantgegevens verstuurd.`, `Ollama ${modelCheck.runtimeVersion} is reachable, but model ${modelCheck.model} is not installed. No customer data was sent.`)}</p> : null}
      {analysis?.queue?.status === 'queued' ? <p role="status">{t('Klantgesprek staat in de analysewachtrij.', 'Client conversation is waiting in the analysis queue.')}</p> : null}
      {analysis?.queue?.status === 'processing' ? <p role="status">{t('Klantgesprek wordt lokaal geanalyseerd.', 'Client conversation is being analysed locally.')}</p> : null}
      {analysis?.queue?.status === 'retry_wait' ? <p role="status">{t('Lokale analyse wordt opnieuw geprobeerd. Volgende poging:', 'Local analysis will retry. Next attempt:')} {new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(analysis.queue.nextAttemptAt))}.</p> : null}
      {analysis?.queue?.status === 'dead_letter' ? <p role="alert">{t(`Automatische analyse is na meerdere pogingen gestopt (${analysis.queue.lastErrorCode || 'onbekende fout'}). Controleer de lokale modelinstellingen of analyseer handmatig.`, `Automatic analysis stopped after several attempts (${analysis.queue.lastErrorCode || 'unknown error'}). Check local model settings or analyse manually.`)}</p> : null}
      <button disabled={busy || !analysis?.capability?.enabled} onClick={() => action(() => api('/analysis', {}))}><BrainCircuit size={18} />{t('Gesprek analyseren', 'Analyse conversation')}</button>
      {rfiNotice ? <p role="status">{rfiNotice}</p> : null}
      {variationNotice ? <p role="status">{variationNotice}</p> : null}
      {selectionNotice ? <p role="status">{selectionNotice}</p> : null}
      {approvedRfiResponses.length ? <section aria-label={t('Goedgekeurde RFI-antwoorden', 'Approved RFI responses')}>
        <h4>{t('Goedgekeurde interne antwoorden', 'Approved internal answers')}</h4>
        <p>{t('Deze antwoorden zijn intern goedgekeurd. Klaarzetten maakt alleen een klantconcept; publicatie vereist een aparte controle.', 'These answers have internal approval. Preparing one creates only a customer draft; publishing requires a separate review.')}</p>
        <ul>{approvedRfiResponses.map(item => <li key={item.id}>
          <strong>{item.title}</strong><blockquote>{item.sourceQuote}</blockquote><p>{item.response}</p>
          <button type="button" disabled={busy} onClick={() => action(async () => {
            const result = await api(`/analysis/rfi-responses/${encodeURIComponent(item.id)}/draft`, {})
            await onMessagesChanged?.()
            setRfiNotice(result.replayed
              ? t('Het bestaande klantconcept bij dit goedgekeurde RFI-antwoord is behouden; er is geen duplicaat gemaakt.', 'The existing customer draft for this approved RFI response was retained; no duplicate was created.')
              : t('Klantconcept klaargezet met koppeling naar de vraag en het goedgekeurde RFI-antwoord. Een bevoegde medewerker moet dit concept nog afzonderlijk goedkeuren en publiceren.', 'Customer draft prepared and linked to the question and approved RFI response. An authorized approver must separately approve and publish it.'))
          })}>{t('Klaarzetten als klantconcept', 'Prepare customer reply draft')}</button>
        </li>)}</ul>
      </section> : null}
      {analysis?.analysis ? <><p>{analysis.analysis.current ? t('Bronversie actueel', 'Source version current') : t('Gesprek gewijzigd; opnieuw analyseren', 'Conversation changed; analyse again')} | {t(`${analysis.analysis.sources.length} bronberichten`, `${analysis.analysis.sources.length} source messages`)} | {t(`${analysis.analysis.analysisBatchCount || 1} begrensde modelvensters`, `${analysis.analysis.analysisBatchCount || 1} bounded model batches`)} | {t(`${analysis.analysis.submittedPhotoCount || 0} foto's aan lokaal model aangeboden`, `${analysis.analysis.submittedPhotoCount || 0} photos submitted to the local model`)}</p><ul className="conversation-analysis-list">{analysis.analysis.findings.map((finding, index) => <li key={index}><blockquote>{finding.quote}</blockquote><p>{finding.suggestion}</p><p>{t('Onzekerheid:', 'Uncertainty:')} {finding.uncertainty}</p><div className="conversation-analysis-actions"><a href={`#message-${finding.sourceId}`} onClick={event => { event.preventDefault(); onRevealSource(finding.sourceId) }}>{t('Bronbericht', 'Source message')}</a><button disabled={!analysis.analysis.current} onClick={() => onDraft(finding.suggestion, { identity: analysis.analysis.identity, sourceId: finding.sourceId, quote: finding.quote })}>{t('Als conceptantwoord overnemen', 'Use as reply draft')}</button>
        {analysis.analysis.current && ['question', 'request', 'issue', 'contradiction'].includes(finding.category) ? <button type="button" disabled={busy} onClick={() => startRfi(finding, analysis.analysis.identity)}>{t('Als kantoor-RFI opvolgen', 'Create internal RFI')}</button> : null}
        {analysis.analysis.current && finding.category === 'request' ? <button type="button" disabled={busy} onClick={() => startVariation(finding, analysis.analysis.identity)}>{t('Wijzigingsconcept voorbereiden', 'Prepare variation draft')}</button> : null}
        {analysis.analysis.current && finding.category === 'request' ? <button type="button" disabled={busy} onClick={() => startSelection(finding, analysis.analysis.identity)}>{t('Klantkeuze voorbereiden', 'Prepare customer choice')}</button> : null}
      </div></li>)}</ul>
      <ul className="conversation-analysis-list">{analysis.analysis.observations?.map((item, index) => <li key={`${item.sourceId}:${item.sha256}:${index}`}>
        <p>{item.observation}</p><p>{t('AI-waarneming, geen vastgesteld feit. Onzekerheid:', 'AI observation, not an established fact. Uncertainty:')} {item.uncertainty}</p><div className="conversation-analysis-actions"><a href={`#message-${item.sourceId}`} onClick={event => { event.preventDefault(); onRevealSource(item.sourceId) }}>{t('Bronfoto openen', 'Open source photo')}</a>
        {analysis.analysis.current && messages.some(message => message.id === item.sourceId && message.direction === 'inbound' && message.attachment?.sha256 === item.sha256)
          ? <button type="button" disabled={busy} onClick={() => startPhotoRfi(item, analysis.analysis.identity)}>{t('Als foto-RFI opvolgen', 'Create photo-based RFI')}</button> : null}
      </div></li>)}</ul></> : null}
      {rfiDraft ? <form onSubmit={createRfi} aria-label={t('Klantbewijs omzetten naar interne RFI', 'Convert client evidence into an internal RFI')}>
        <h4>{t('Interne RFI voorbereiden', 'Prepare internal RFI')}</h4>
        {rfiDraft.evidenceKind === 'photo_observation' ? <><p>{t('AI-waarneming, geen vastgesteld feit:', 'AI observation, not an established fact:')} {rfiDraft.observation}</p><p>{t('Onzekerheid:', 'Uncertainty:')} {rfiDraft.uncertainty}</p><a href={`#message-${rfiDraft.sourceId}`} onClick={event => { event.preventDefault(); onRevealSource(rfiDraft.sourceId) }}>{t('Bronfoto openen', 'Open source photo')}</a></> : <blockquote>{rfiDraft.quote}</blockquote>}
        <label>{t('Titel', 'Title')}<input required maxLength={160} value={rfiDraft.title} onChange={event => setRfiDraft({ ...rfiDraft, title: event.target.value })} /></label>
        <label>{t('Vraag voor interne opvolging', 'Internal follow-up question')}<textarea required maxLength={2000} value={rfiDraft.question} onChange={event => setRfiDraft({ ...rfiDraft, question: event.target.value })} /></label>
        <label>{t('Verantwoordelijke', 'Responsible person')}<input required maxLength={160} value={rfiDraft.responsible} onChange={event => setRfiDraft({ ...rfiDraft, responsible: event.target.value })} /></label>
        <label>{t('Opvolgen voor', 'Follow up by')}<input required type="datetime-local" value={rfiDraft.dueAt} onChange={event => setRfiDraft({ ...rfiDraft, dueAt: event.target.value })} /></label>
        {fieldTasks.length ? <fieldset>
          <legend>{t('Uitvoerder informeren na goedkeuring', 'Inform field workers after approval')}</legend>
          <label><input type="checkbox" checked={rfiDraft.shareWithField} onChange={event => setRfiDraft({ ...rfiDraft, shareWithField: event.target.checked, fieldTaskIds: event.target.checked ? rfiDraft.fieldTaskIds : [] })} />{t('Deel het goedgekeurde antwoord met betrokken uitvoerders', 'Share the approved answer with affected field workers')}</label>
          {rfiDraft.shareWithField ? <div className="conversation-field-task-list">{fieldTasks.filter(task => !['completed', 'cancelled', 'canceled', 'deleted'].includes(String(task.status || '').toLowerCase())).map(task => <label key={task.id}>
            <input type="checkbox" checked={rfiDraft.fieldTaskIds.includes(task.id)} onChange={event => setRfiDraft({ ...rfiDraft, fieldTaskIds: event.target.checked ? [...rfiDraft.fieldTaskIds, task.id] : rfiDraft.fieldTaskIds.filter(id => id !== task.id) })} />
            {task.title}
          </label>)}</div> : null}
          <p>{t('Antwoord verschijnt pas na interne goedkeuring, alleen in werkpakketten met deze taken. AI-notities en het klantcitaat blijven intern.', 'The answer appears only after internal approval and only in work packs containing these tasks. AI notes and the client quotation remain internal.')}</p>
        </fieldset> : null}
        <p>{t('Bronbewijs en onzekerheid blijven gekoppeld. Alleen interne opvolging wordt aangemaakt; er wordt niets naar de klant verstuurd.', 'Source evidence and uncertainty stay linked. This creates internal follow-up only; nothing is sent to the client.')}</p>
        <button disabled={busy || (rfiDraft.shareWithField && !rfiDraft.fieldTaskIds.length)}>{t('Interne RFI aanmaken', 'Create internal RFI')}</button><button type="button" disabled={busy} onClick={() => { setRfiDraft(null); rfiCommand.current = null }}>{t('Annuleren', 'Cancel')}</button>
      </form> : null}
      {variationDraft ? <form onSubmit={createVariation} aria-label={t('Klantverzoek omzetten naar wijzigingsconcept', 'Convert client request into a variation draft')}>
        <h4>{t('Wijzigingsconcept beoordelen', 'Review variation draft')}</h4><blockquote>{variationDraft.quote}</blockquote>
        <p>{t('AI-voorstel, geen vastgestelde scope: controleer en pas alle gevolgen hieronder zelf aan. Onzekerheid:', 'AI proposal, not an agreed scope: review and adjust all impacts below. Uncertainty:')} {analysis.analysis.findings.find(item => item.sourceId === variationDraft.sourceId && item.quote === variationDraft.quote)?.uncertainty}</p>
        <label>{t('Titel', 'Title')}<input required minLength={2} maxLength={160} value={variationDraft.title} onChange={event => setVariationDraft({ ...variationDraft, title: event.target.value })} /></label>
        <label>{t('Voorgestelde scope', 'Proposed scope')}<textarea required minLength={8} maxLength={4000} value={variationDraft.scopeDelta} onChange={event => setVariationDraft({ ...variationDraft, scopeDelta: event.target.value })} /></label>
        <label>{t('Onderbouwing kantoor', 'Office justification')}<textarea required minLength={8} maxLength={2000} value={variationDraft.justification} onChange={event => setVariationDraft({ ...variationDraft, justification: event.target.value })} /></label>
        <label>{t('Raming meer-/minderprijs excl. btw (€)', 'Estimated price increase/decrease excl. VAT (€)')}<input required type="number" step="0.01" min="-10000000" max="10000000" value={variationDraft.amount} onChange={event => setVariationDraft({ ...variationDraft, amount: event.target.value })} /></label>
        <label>{t('Geschatte planningsimpact (kalenderdagen)', 'Estimated schedule impact (calendar days)')}<input required type="number" step="0.5" min="-3650" max="3650" value={variationDraft.scheduleDeltaDays} onChange={event => setVariationDraft({ ...variationDraft, scheduleDeltaDays: event.target.value })} /></label>
        <label>{t('Toelichting planningsimpact', 'Schedule impact details')}<textarea required minLength={8} maxLength={2000} value={variationDraft.scheduleImpactNarrative} onChange={event => setVariationDraft({ ...variationDraft, scheduleImpactNarrative: event.target.value })} /></label>
        <label>{t('Risico-impact', 'Risk impact')}<select required value={variationDraft.riskImpact} onChange={event => setVariationDraft({ ...variationDraft, riskImpact: event.target.value })}><option value="none">{t('Geen extra risico vastgesteld', 'No additional risk identified')}</option><option value="low">{t('Laag', 'Low')}</option><option value="medium">{t('Gemiddeld', 'Medium')}</option><option value="high">{t('Hoog', 'High')}</option><option value="critical">{t('Kritiek', 'Critical')}</option></select></label>
        <label>{t('Toelichting risico', 'Risk details')}<textarea required minLength={8} maxLength={2000} value={variationDraft.riskImpactStatement} onChange={event => setVariationDraft({ ...variationDraft, riskImpactStatement: event.target.value })} /></label>
        <p>{t('Voorwaarde: er moet een geaccepteerde offerte of vastgelegde contractbasis zijn. Aanmaken maakt alleen een intern te beoordelen concept; goedkeuring, klantversturing en vrijgave voor uitvoering blijven afzonderlijke stappen.', 'An accepted quote or retained contract basis is required. This creates an internal review draft only; approval, sending to the client and release for execution remain separate steps.')}</p>
        <button disabled={busy}>{t('Intern wijzigingsconcept aanmaken', 'Create internal variation draft')}</button><button type="button" disabled={busy} onClick={() => { setVariationDraft(null); variationCommand.current = null }}>{t('Annuleren', 'Cancel')}</button>
      </form> : null}
      {selectionDraft ? <form onSubmit={createSelection} aria-label={t('Klantkeuze uit verzoek voorbereiden', 'Prepare customer choice from request')}>
        <h4>{t('Klantkeuze voorbereiden', 'Prepare customer choice')}</h4><blockquote>{selectionDraft.quote}</blockquote>
        <p>{t('AI-voorstel, geen afspraak. Formuleer de klantvraag en opties zelf. Het concept blijft onzichtbaar voor de klant totdat een bevoegde medewerker het goedkeurt.', 'AI suggestion, not an agreement. Write the customer question and options yourself. The draft stays hidden from the client until an authorized approver approves it.')}</p>
        <label>{t('Klantvraag', 'Customer question')}<input required minLength={3} maxLength={160} value={selectionDraft.title} onChange={event => setSelectionDraft({ ...selectionDraft, title: event.target.value })} /></label>
        <label>{t('Antwoordopties, één per regel', 'Answer options, one per line')}<textarea required minLength={3} maxLength={1600} value={selectionDraft.optionsText} onChange={event => setSelectionDraft({ ...selectionDraft, optionsText: event.target.value })} /></label>
        <label>{t('Uiterste reactiedatum', 'Response deadline')}<input required type="date" min={new Date(Date.now() + 86400000).toISOString().slice(0, 10)} value={selectionDraft.dueAt} onChange={event => setSelectionDraft({ ...selectionDraft, dueAt: event.target.value })} /></label>
        <label>{t('Reden en interne controle', 'Rationale and internal review')}<textarea required minLength={3} maxLength={1000} value={selectionDraft.rationale} onChange={event => setSelectionDraft({ ...selectionDraft, rationale: event.target.value })} /></label>
        <button disabled={busy}>{t('Niet-zichtbaar concept ter goedkeuring indienen', 'Submit unpublished draft for approval')}</button><button type="button" disabled={busy} onClick={() => { setSelectionDraft(null); selectionCommand.current = null }}>{t('Annuleren', 'Cancel')}</button>
      </form> : null}
    </details>
    <details><summary>{t('Goedgekeurd dagrapport met klant delen', 'Share an approved daily report with the client')}</summary>
      <p>{t('Kies alleen een rapport dat kantoor al als klantzichtbaar heeft goedgekeurd. Jij schrijft de klanttekst; het bericht blijft privé tot aparte goedkeuring en publicatie.', 'Choose only a report already approved by the office for client visibility. Write the client-facing text yourself; the message stays private until separately approved and published.')}</p>
      {fieldReports.length ? <form onSubmit={createFieldReportDraft} aria-label={t('Klantupdate uit dagrapport maken', 'Create client update from daily report')}>
        <label>{t('Goedgekeurd dagrapport', 'Approved daily report')}<select required value={fieldReportDraft.reportId} onChange={event => {
          const report = fieldReports.find(item => item.id === event.target.value)
          fieldReportCommand.current = null
          setFieldReportDraft({ reportId: report?.id || '', sourceHash: report?.sourceHash || '', body: report?.workCompleted || '' })
        }}><option value="">{t('Selecteer een rapport', 'Select a report')}</option>{fieldReports.map(report => <option key={report.id} value={report.id}>{report.reportDate} · {report.workCompleted.slice(0, 100) || t('Geen voortgangstekst', 'No progress text')}</option>)}</select></label>
        <label>{t('Bericht aan de klant', 'Message to the client')}<textarea required minLength={3} maxLength={5000} value={fieldReportDraft.body} onChange={event => { fieldReportCommand.current = null; setFieldReportDraft({ ...fieldReportDraft, body: event.target.value }) }} /></label>
        <button disabled={busy || !fieldReportDraft.reportId || fieldReportDraft.body.trim().length < 3}>{t('Privé klantconcept aanmaken', 'Create private client draft')}</button>
      </form> : <p>{t('Geen actueel goedgekeurd klantzichtbaar dagrapport voor dit gesprek.', 'No current approved client-visible daily report is available for this conversation.')}</p>}
      {fieldReportNotice ? <p role="status">{fieldReportNotice}</p> : null}
    </details>
    <details><summary>{t('Vrijgegeven werkfoto met klant delen', 'Share a released work photo with the client')}</summary>
      <p>{t('Alleen door kantoor vrijgegeven foto’s van deze opdracht zijn beschikbaar. De klanttekst blijft een privé concept tot afzonderlijke goedkeuring en publicatie.', 'Only office-released photos from this job are available. The client message stays private until separately approved and published.')}</p>
      {photoEvidence.length ? <form onSubmit={createPhotoEvidenceDraft} aria-label={t('Klantbericht met vrijgegeven werkfoto maken', 'Create client message with released work photo')}>
        <label>{t('Vrijgegeven werkfoto', 'Released work photo')}<select required value={photoEvidenceDraft.captureId} onChange={event => {
          const photo = photoEvidence.find(item => item.id === event.target.value)
          photoEvidenceCommand.current = null
          setPhotoEvidenceDraft({ captureId: photo?.id || '', origin: photo?.origin || null, body: photo?.caption ? `${photo.caption}` : '' })
        }}><option value="">{t('Selecteer een foto', 'Select a photo')}</option>{photoEvidence.map(photo => <option key={photo.id} value={photo.id}>{photo.taskTitle || photo.title} · {photo.phase} · {new Date(photo.capturedAt).toLocaleDateString(locale)}</option>)}</select></label>
        {photoEvidenceDraft.captureId ? <p>{photoEvidence.find(item => item.id === photoEvidenceDraft.captureId)?.caption}</p> : null}
        <label>{t('Bericht aan de klant', 'Message to the client')}<textarea required minLength={3} maxLength={5000} value={photoEvidenceDraft.body} onChange={event => { photoEvidenceCommand.current = null; setPhotoEvidenceDraft({ ...photoEvidenceDraft, body: event.target.value }) }} /></label>
        <button disabled={busy || !photoEvidenceDraft.captureId || photoEvidenceDraft.body.trim().length < 3}>{t('Privé klantconcept met foto aanmaken', 'Create private client draft with photo')}</button>
      </form> : <p>{t('Geen actuele vrijgegeven werkfoto beschikbaar voor dit gesprek.', 'No current released work photo is available for this conversation.')}</p>}
      {photoEvidenceNotice ? <p role="status">{photoEvidenceNotice}</p> : null}
    </details>
    <details><summary>WhatsApp</summary><p>{channel?.reason ? localizeStatus(channel.reason) : t('Kanaalinstellingen laden...', 'Loading channel settings...')}</p>
      {isOwner ? <form onSubmit={event => { event.preventDefault(); void action(() => api('/whatsapp/binding', { phone, consentReference: consent, identityReference: identity })) }}>
        <label>{t('Geverifieerd klantnummer', 'Verified client number')}<input type="tel" required value={phone} onChange={event => setPhone(event.target.value)} /></label>
        <label>{t('Referentie toestemming', 'Consent reference')}<input required minLength={8} maxLength={1000} value={consent} onChange={event => setConsent(event.target.value)} /></label>
        <label>{t('Referentie identiteitscontrole', 'Identity-check reference')}<input required minLength={8} maxLength={1000} value={identity} onChange={event => setIdentity(event.target.value)} /></label>
        <button disabled={busy}><Link2 size={18} />{t('Koppeling ter goedkeuring', 'Submit binding for approval')}</button><button type="button" disabled={busy || !phone} onClick={() => action(() => api('/whatsapp/revoke', { phone }))}>{t('Koppeling intrekken', 'Revoke binding')}</button>
      </form> : null}
      {onApprovals ? <button onClick={onApprovals}>{t('Naar goedkeuringen', 'Open approvals')}</button> : null}
      {isOwner ? <><label><input type="checkbox" checked={confirmation} onChange={event => setConfirmation(event.target.checked)} />{t('Ik bevestig externe verzending aan de gekoppelde klant', 'I confirm external sending to the linked client')}</label>
        {messages.filter(message => message.direction === 'outbound' && message.status === 'published').map(message => <div key={message.id}><p>{message.body.slice(0, 160)}</p><button disabled={!channel?.enabled || busy || !confirmation || channel.receipts.some(receipt => receipt.messageId === message.id)} onClick={() => action(async () => { await api(`/messages/${message.id}/whatsapp`, { confirmExternalSend: true }); setConfirmation(false) })}><Send size={18} />{t('Via WhatsApp verzenden', 'Send via WhatsApp')}</button></div>)}
      </> : null}
      <ul>{channel?.receipts.map(receipt => <li key={receipt.messageId}>{receipt.messageId.slice(-10)}: {receipt.delivery?.status || receipt.dispatch.state}</li>)}</ul>
    </details>
  </div>
}
