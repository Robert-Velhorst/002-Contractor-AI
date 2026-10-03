import { useCallback, useEffect, useRef, useState } from 'react'
import { conversationRequest as request } from '../conversation-request.mjs'
import { ArchiveRestore, Camera, CheckCheck, ChevronUp, History, MessageSquareText, RefreshCw, Reply, Send, X } from 'lucide-react'
import { browserDraftStorage, readSessionDraft, useSessionDraftRecovery } from '../draft-recovery'
import { enqueueClientMessage, listClientMessages, readClientSnapshot, removeClientMessage, removeClientSnapshot, saveClientSnapshot } from '../client-message-outbox.mjs'
import './Conversation.css'
import ConversationOperations from './ConversationOperations'
import ConversationPhoto from './ConversationPhoto'
export { default as ConversationPhoto } from './ConversationPhoto'
export { default as ClientConversationInbox } from './ClientConversationInbox'

function emptyConversationDraft() { return { body: '', replyTo: '', analysisOrigin: null, retry: null } }

function normalizeConversationDraft(value) {
  if (!value || typeof value !== 'object') return emptyConversationDraft()
  return {
    body: typeof value.body === 'string' ? value.body.slice(0, 5000) : '',
    replyTo: typeof value.replyTo === 'string' ? value.replyTo.slice(0, 200) : '',
    analysisOrigin: value.analysisOrigin && typeof value.analysisOrigin === 'object' ? value.analysisOrigin : null,
    retry: value.retry && typeof value.retry.id === 'string' && typeof value.retry.signature === 'string' ? value.retry : null
  }
}

function hasConversationDraft(value) {
  return Boolean(value.body || value.replyTo || value.analysisOrigin)
}

async function conversationSignature(draft, file) {
  let photoHash = ''
  if (file) {
    if (!window.crypto?.subtle || typeof file.arrayBuffer !== 'function') throw new Error('Deze browser kan de foto niet veilig vastleggen voor een exacte herhaling.')
    const digest = await window.crypto.subtle.digest('SHA-256', await file.arrayBuffer())
    photoHash = [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('')
  }
  return JSON.stringify([draft.body, draft.replyTo, draft.analysisOrigin, photoHash])
}

export default function Conversation({ base, token, locale = 'nl-NL', office = false, canApprove = false, isOwner = false, onApprovals, refreshKey = 0, draftScope = '', offlineShellReady = false, fieldTasks = [] }) {
  const nl = locale.startsWith('nl')
  const t = useCallback((dutch, english) => nl ? dutch : english, [nl])
  const draftName = `conversation:${base}`
  const [initialDraftRecovery] = useState(() => draftScope
    ? readSessionDraft(browserDraftStorage(), draftScope, draftName)
    : { found: false, value: null })
  const initialDraft = initialDraftRecovery.found ? normalizeConversationDraft(initialDraftRecovery.value) : emptyConversationDraft()
  const [messages, setMessages] = useState([])
  const [queuedMessages, setQueuedMessages] = useState([])
  const [cursor, setCursor] = useState(null)
  const cursorRef = useRef(null)
  const [draft, setDraft] = useState(initialDraft)
  const [file, setFile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(() => initialDraftRecovery.found && hasConversationDraft(initialDraft)
    ? 'Concept hersteld uit deze browsersessie. Foto’s moet je opnieuw toevoegen.' : '')
  const [newMessageIds, setNewMessageIds] = useState([])
  const [offlineHistoryAt, setOfflineHistoryAt] = useState('')
  const [snapshotState, setSnapshotState] = useState({ scope: '', ready: false, error: '' })
  const [showLegacyMessages, setShowLegacyMessages] = useState(false)
  const [legacyMessages, setLegacyMessages] = useState([])
  const [legacyCursor, setLegacyCursor] = useState(null)
  const [legacyLoading, setLegacyLoading] = useState(false)
  const [legacyError, setLegacyError] = useState('')
  const [legacyImportingId, setLegacyImportingId] = useState('')
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const [outboxError, setOutboxError] = useState('')
  const locked = useRef(false)
  const outboxLocked = useRef(false)
  const fileInput = useRef(null)
  const loadSequence = useRef(0)
  const knownMessageIds = useRef(new Set())
  const clientOutboxEnabled = !office && Boolean(draftScope) && token.length >= 32
    && offlineShellReady && typeof window !== 'undefined' && Boolean(window.indexedDB && window.crypto?.subtle)
  const snapshotScope = `${base}:${draftScope}`
  const snapshotReady = snapshotState.scope === snapshotScope && snapshotState.ready
  const snapshotError = snapshotState.scope === snapshotScope ? snapshotState.error : ''
  const restoreDraft = useCallback(value => {
    if (!value || typeof value !== 'object') return
    const restored = normalizeConversationDraft(value)
    setDraft(restored)
    if (hasConversationDraft(restored)) setNotice('Concept hersteld uit deze browsersessie. Foto’s moet je opnieuw toevoegen.')
  }, [])
  const hasDraft = hasConversationDraft(draft)
  useSessionDraftRecovery({ enabled: Boolean(draftScope), scope: draftScope, name: draftName,
    value: hasDraft ? draft : null, setValue: restoreDraft, delayMs: 0 })
  const load = useCallback(async (before = '', signal, { quiet = false, poll = false } = {}) => {
    const sequence = ++loadSequence.current
    if (!quiet) setError('')
    try {
      const result = await (await request(base, token, before ? `?before=${encodeURIComponent(before)}` : '', { signal })).json()
      if (signal?.aborted || sequence !== loadSequence.current) return
      if (clientOutboxEnabled && !before) {
        void saveClientSnapshot('conversation', result, token, draftScope).then(() => {
          if (!signal?.aborted && sequence === loadSequence.current) setSnapshotState({ scope: snapshotScope, ready: true, error: '' })
        }).catch(() => {
          if (!signal?.aborted && sequence === loadSequence.current) setSnapshotState({ scope: snapshotScope, ready: false,
            error: 'De gesprekssnapshot kon niet lokaal worden opgeslagen. Eerdere berichten zijn mogelijk niet beschikbaar zonder verbinding.' })
        })
      }
      if (!before) setOfflineHistoryAt('')
      const unseen = poll ? result.messages.filter(message => !knownMessageIds.current.has(message.id)
        && (office ? message.direction === 'inbound' : message.direction === 'outbound')) : []
      for (const message of result.messages) knownMessageIds.current.add(message.id)
      setMessages(current => {
        const combined = before ? [...result.messages, ...current] : [...current, ...result.messages]
        const byId = new Map(combined.map(message => [message.id, message]))
        const ordered = [...byId.values()].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
        return ordered.length === current.length && ordered.every((message, index) => message.id === current[index]?.id && message.status === current[index]?.status && message.sourceHash === current[index]?.sourceHash && message.reviewedAt === current[index]?.reviewedAt)
          ? current : ordered
      })
      cursorRef.current = result.nextCursor
      setCursor(result.nextCursor)
      if (unseen.length) setNewMessageIds(current => [...new Set([...current, ...unseen.map(message => message.id)])])
      return result
    } catch (reason) {
      if (signal?.aborted || sequence !== loadSequence.current) return
      if (!office && !before && clientOutboxEnabled && (navigator.onLine === false || !Number.isInteger(reason.status))) {
        try {
          const cached = await readClientSnapshot('conversation', token, draftScope)
          if (cached) {
            setMessages(cached.value.messages || [])
            setCursor(cached.value.nextCursor || null)
            setOfflineHistoryAt(cached.updatedAt)
            setSnapshotState({ scope: snapshotScope, ready: true, error: '' })
            setError('')
            return
          }
        } catch { /* Keep the explicit network error if the encrypted snapshot is unavailable. */ }
      }
      if (!office && [401, 403].includes(reason.status)) {
        setSnapshotState({ scope: snapshotScope, ready: false, error: '' })
        await removeClientSnapshot('conversation', draftScope).catch(() => {})
      }
      if (!quiet) setError(reason.message)
    }
    finally { if (!signal?.aborted && sequence === loadSequence.current) setLoading(false) }
  }, [base, clientOutboxEnabled, draftScope, office, snapshotScope, token])
  const revealSource = useCallback(async messageId => {
    const scrollToSource = () => {
      const element = document.getElementById(`message-${messageId}`)
      if (!element) return false
      element.scrollIntoView({ behavior: 'smooth', block: 'center' })
      element.focus?.({ preventScroll: true })
      return true
    }
    if (scrollToSource()) return
    while (cursorRef.current) {
      const page = await load(cursorRef.current)
      if (!page) return
      if (page.messages.some(message => message.id === messageId)) {
        requestAnimationFrame(scrollToSource)
        return
      }
    }
  }, [load])
  const syncQueuedMessages = useCallback(async () => {
    if (!clientOutboxEnabled || navigator.onLine === false || outboxLocked.current) return
    outboxLocked.current = true
    let delivered = 0
    try {
      const queued = await listClientMessages(token, draftScope)
      setQueuedMessages(queued)
      for (const item of queued) {
        if (item.expired) continue
        const form = new FormData()
        form.set('entryKey', item.entryKey); form.set('body', item.body); form.set('replyTo', item.replyTo || '')
        if (item.analysisOrigin) form.set('analysisOrigin', JSON.stringify(item.analysisOrigin))
        if (item.attachment) form.set('evidenceFile', new File([item.attachment.bytes], item.attachment.name, { type: item.attachment.type, lastModified: item.attachment.lastModified }))
        await request(base, token, '/messages', { method: 'POST', body: form })
        await removeClientMessage(item.id)
        delivered += 1
      }
      setQueuedMessages(await listClientMessages(token, draftScope))
      setOutboxError(queued.some(item => item.expired) ? t('Een offline bericht is verlopen en niet verzonden. Verwijder het of controleer de klanttoegang.', 'An offline message expired and was not sent. Remove it or check the client access.') : '')
      if (delivered) {
        setNotice(t(`${delivered} offline ${delivered === 1 ? 'bericht is' : 'berichten zijn'} door de aannemer ontvangen.`, `${delivered} offline message${delivered === 1 ? ' was' : 's were'} received by the contractor.`))
        await load('', undefined, { quiet: true })
      }
    } catch (reason) {
      setOutboxError(reason.message || t('De offline berichten zijn nog niet ontvangen.', 'Offline messages have not been received yet.'))
      try { setQueuedMessages(await listClientMessages(token, draftScope)) } catch { /* Keep the last readable local queue state. */ }
    } finally { outboxLocked.current = false }
  }, [base, clientOutboxEnabled, draftScope, load, token, t])
  const refreshQueuedMessages = useCallback(async () => {
    if (!clientOutboxEnabled) return
    try { setQueuedMessages(await listClientMessages(token, draftScope)); setOutboxError('') }
    catch (reason) { setOutboxError(reason.message) }
  }, [clientOutboxEnabled, draftScope, token])
  useEffect(() => {
    knownMessageIds.current = new Set(); setNewMessageIds([])
    const controller = new AbortController()
    void load('', controller.signal)
    return () => controller.abort()
  }, [load, refreshKey])
  useEffect(() => {
    const poll = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) void load('', undefined, { quiet: true, poll: true })
    }
    const timer = window.setInterval(poll, 20_000)
    window.addEventListener('online', poll)
    return () => { window.clearInterval(timer); window.removeEventListener('online', poll) }
  }, [load])
  useEffect(() => {
    const updateConnection = () => {
      const connected = navigator.onLine !== false
      setOnline(connected)
      if (connected) void syncQueuedMessages()
    }
    window.addEventListener('online', updateConnection)
    window.addEventListener('offline', updateConnection)
    void refreshQueuedMessages().then(() => { if (navigator.onLine !== false) void syncQueuedMessages() })
    return () => { window.removeEventListener('online', updateConnection); window.removeEventListener('offline', updateConnection) }
  }, [refreshQueuedMessages, syncQueuedMessages])
  async function submit(event) {
    event.preventDefault()
    if (locked.current) return
    locked.current = true; setBusy(true); setNotice(''); setError('')
    try {
      const signature = await conversationSignature(draft, file)
      const retry = draft.retry?.signature === signature ? draft.retry : { signature, id: crypto.randomUUID() }
      if (draft.retry !== retry) setDraft(current => ({ ...current, retry }))
      if (!office && navigator.onLine === false) {
        if (!clientOutboxEnabled) throw new Error(t('Offline berichten bewaren is niet beschikbaar voor deze klanttoegang. Laat het bericht open en probeer opnieuw zodra je verbinding hebt.', 'Offline message storage is unavailable for this client access. Keep the message open and retry when connected.'))
        const attachment = file ? { name: file.name, type: file.type, lastModified: file.lastModified, size: file.size, bytes: new Uint8Array(await file.arrayBuffer()) } : null
        const queued = { entryKey: retry.id, body: draft.body, replyTo: draft.replyTo, analysisOrigin: draft.analysisOrigin, attachment }
        const receipt = await enqueueClientMessage(queued, token, draftScope)
        setQueuedMessages(current => [...current.filter(item => item.id !== receipt.id), { ...queued, id: receipt.id, createdAt: receipt.createdAt, expiresAt: receipt.expiresAt, expired: false }])
        setDraft(emptyConversationDraft()); setFile(null); if (fileInput.current) fileInput.current.value = ''
        setNotice(t('Alleen lokaal bewaard; nog niet door de aannemer ontvangen. Verzendt zodra je weer online bent.', 'Saved on this device only; not received by the contractor. It will send when you are online.'))
        return
      }
      const form = new FormData()
      form.set('entryKey', retry.id); form.set('body', draft.body); form.set('replyTo', draft.replyTo)
      if (draft.analysisOrigin) form.set('analysisOrigin', JSON.stringify(draft.analysisOrigin))
      if (file) form.set('evidenceFile', file)
      await request(base, token, '/messages', { method: 'POST', body: form })
      setDraft(emptyConversationDraft()); setFile(null); if (fileInput.current) fileInput.current.value = ''
      setNotice(t(office ? 'Concept opgeslagen; goedkeuring vereist.' : 'Bericht ontvangen.', office ? 'Draft retained; approval required.' : 'Message received.'))
      await load()
    } catch (reason) { setError(reason.message) }
    finally { locked.current = false; setBusy(false) }
  }
  async function removeQueuedMessage(item) {
    try {
      await removeClientMessage(item.id)
      setQueuedMessages(current => current.filter(message => message.id !== item.id))
      setOutboxError('')
    } catch (reason) { setOutboxError(reason.message) }
  }
  async function publish(message) {
    if (locked.current) return
    locked.current = true; setBusy(true); setError('')
    try {
      await request(base, token, `/messages/${message.id}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sourceHash: message.sourceHash }) })
      await load()
    } catch (reason) { setError(reason.message) }
    finally { locked.current = false; setBusy(false) }
  }
  async function markLoadedInboundReviewed() {
    const pending = messages.filter(message => message.direction === 'inbound' && !message.reviewedAt).slice(0, 50)
    if (!office || !pending.length || locked.current) return
    locked.current = true; setBusy(true); setError('')
    try {
      await request(base, token, '/messages/reviewed', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ messages: pending.map(({ id, sourceHash }) => ({ id, sourceHash })) }) })
      await load()
    } catch (reason) { setError(reason.message) }
    finally { locked.current = false; setBusy(false) }
  }
  useEffect(() => {
    if (!office || !showLegacyMessages) return undefined
    const controller = new AbortController()
    setLegacyLoading(true); setLegacyError('')
    request(base, token, '/legacy-messages?limit=30', { signal: controller.signal })
      .then(response => response.json())
      .then(result => { if (!controller.signal.aborted) { setLegacyMessages(result.messages || []); setLegacyCursor(result.nextCursor || null) } })
      .catch(reason => { if (!controller.signal.aborted) setLegacyError(reason.message) })
      .finally(() => { if (!controller.signal.aborted) setLegacyLoading(false) })
    return () => controller.abort()
  }, [base, office, showLegacyMessages, token])
  async function loadMoreLegacyMessages() {
    if (!legacyCursor || legacyLoading) return
    setLegacyLoading(true); setLegacyError('')
    try {
      const result = await (await request(base, token, `/legacy-messages?limit=30&before=${encodeURIComponent(legacyCursor)}`)).json()
      setLegacyMessages(current => [...current, ...(result.messages || [])])
      setLegacyCursor(result.nextCursor || null)
    } catch (reason) { setLegacyError(reason.message) }
    finally { setLegacyLoading(false) }
  }
  async function importLegacyMessage(message) {
    if (!canApprove || legacyImportingId) return
    setLegacyImportingId(message.id); setLegacyError('')
    try {
      await request(base, token, `/legacy-messages/${encodeURIComponent(message.id)}/import`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}'
      })
      setLegacyMessages(current => current.filter(item => item.id !== message.id))
      setNotice(t('Oud klantbericht aan het gesprek gekoppeld. Er is niets naar de klant verzonden.', 'Historical client message linked to the conversation. Nothing was sent to the client.'))
      await load()
    } catch (reason) { setLegacyError(reason.message) }
    finally { setLegacyImportingId('') }
  }
  return <section className="conversation" aria-label={t('Klantgesprek', 'Client conversation')}>
    <header><h2><MessageSquareText size={20} />{t('Klantgesprek', 'Client conversation')}</h2><button type="button" title={t('Gesprek vernieuwen', 'Refresh conversation')} aria-label={t('Gesprek vernieuwen', 'Refresh conversation')} disabled={busy} onClick={() => load()}><RefreshCw size={18} /></button></header>
    {newMessageIds.length ? <p role="status">{nl ? `${newMessageIds.length} ${newMessageIds.length === 1 ? 'nieuw bericht' : 'nieuwe berichten'}` : `${newMessageIds.length} new message${newMessageIds.length === 1 ? '' : 's'}`} <button type="button" onClick={() => { document.getElementById(`message-${newMessageIds.at(-1)}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); setNewMessageIds([]) }}>{t('Bekijken', 'View')}</button></p> : null}
    {loading ? <p role="status">{t('Gesprek laden...', 'Loading conversation...')}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    {offlineHistoryAt ? <p role="status">{t('Versleutelde gesprekssnapshot van', 'Encrypted conversation snapshot from')} {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(offlineHistoryAt))}. {t('Berichten na dit tijdstip ontbreken mogelijk.', 'Messages after this time may be missing.')}</p> : null}
    {!office && draftScope ? <p role="status">{online ? t('Online', 'Online') : t('Offline', 'Offline')}{!offlineShellReady || clientOutboxEnabled && !snapshotReady && !snapshotError ? ` / ${t('Offline opslag wordt voorbereid', 'Preparing offline storage')}` : ''}{snapshotReady ? ` / ${t('Gesprek offline bewaard', 'Conversation saved offline')}` : ''}{queuedMessages.length ? ` / ${queuedMessages.length} ${t('lokaal bewaard, niet ontvangen', 'saved locally, not received')}` : ''}</p> : null}
    {snapshotError ? <p role="alert">{t(snapshotError, 'The conversation snapshot could not be saved on this device. Earlier messages may be unavailable without a connection.')}</p> : null}
    {outboxError ? <p role="alert">{outboxError}</p> : null}
    {queuedMessages.length ? <section className="conversation-local-outbox" aria-label={t('Lokaal bewaarde berichten', 'Locally saved messages')}>
      <h3>{t('Nog te verzenden', 'Waiting to send')}</h3>
      <ul>{queuedMessages.map(item => <li key={item.id}>
        <strong>{item.expired ? t('Verlopen; niet verzonden', 'Expired; not sent') : t('Alleen op dit apparaat bewaard', 'Saved on this device only')}</strong>
        {item.body ? <p>{item.body}</p> : null}{item.attachment ? <p>{t('Foto', 'Photo')}: {item.attachment.name}</p> : null}
        <time dateTime={item.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.createdAt))}</time>
        {!item.expired && online ? <button type="button" disabled={busy} onClick={() => void syncQueuedMessages()}>{t('Opnieuw synchroniseren', 'Retry sync')}</button> : null}
        <button type="button" disabled={busy} onClick={() => void removeQueuedMessage(item)}>{t('Verwijderen', 'Remove')}</button>
      </li>)}</ul>
    </section> : null}
    {cursor ? <button type="button" disabled={busy} onClick={() => load(cursor)}><ChevronUp size={18} />{t('Oudere berichten', 'Older messages')}</button> : null}
    {!loading && !messages.length && !error ? <p>{t('Nog geen berichten in dit gesprek.', 'No messages in this conversation yet.')}</p> : null}
    {office && messages.some(message => message.direction === 'inbound' && !message.reviewedAt) ? <button type="button" disabled={busy} onClick={() => void markLoadedInboundReviewed()}><CheckCheck size={16} />{nl ? `Geladen klantberichten als bekeken markeren (${Math.min(50, messages.filter(message => message.direction === 'inbound' && !message.reviewedAt).length)})` : `Mark loaded client messages as reviewed (${Math.min(50, messages.filter(message => message.direction === 'inbound' && !message.reviewedAt).length)})`}</button> : null}
    {office ? <section className="conversation-legacy">
      <button type="button" aria-expanded={showLegacyMessages} disabled={busy} onClick={() => setShowLegacyMessages(open => !open)}><History size={17} />{t('Oudere klantberichten controleren', 'Review older client messages')}</button>
      {showLegacyMessages ? <>
        <p>{t('Alleen oudere berichten die aantoonbaar met deze actieve klanttoegang zijn verzonden. Opnemen koppelt het bestaande bericht aan dit gesprek; er wordt niets verzonden.', 'Only older messages proven to have been submitted through this exact active client access. Import links the existing message to this conversation; it does not send anything.')}</p>
        {!canApprove ? <p>{t('Een eigenaar of goedkeurder kan deze berichten opnemen.', 'An owner or approver can import these messages.')}</p> : null}
        {legacyLoading && !legacyMessages.length ? <p role="status">{t('Oudere berichten zoeken...', 'Searching older messages...')}</p> : null}
        {legacyError ? <p role="alert">{legacyError}</p> : null}
        {!legacyLoading && !legacyMessages.length && !legacyError ? <p>{t('Geen oudere berichten met aantoonbare klanttoegang gevonden.', 'No older messages with verified client-access provenance found.')}</p> : null}
        <ol className="conversation-legacy-list">{legacyMessages.map(message => <li key={message.id}>
          <time dateTime={message.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(message.createdAt))}</time>
          <p>{message.body}</p>
          {canApprove ? <button type="button" disabled={Boolean(legacyImportingId)} onClick={() => importLegacyMessage(message)}><ArchiveRestore size={17} />{legacyImportingId === message.id ? t('Opnemen...', 'Importing...') : t('In dit gesprek opnemen', 'Import into this conversation')}</button> : null}
        </li>)}</ol>
        {legacyCursor ? <button type="button" disabled={legacyLoading} onClick={loadMoreLegacyMessages}>{t('Oudere berichten laden', 'Load older messages')}</button> : null}
      </> : null}
    </section> : null}
    <ol className="conversation-timeline">{messages.map(message => <li key={message.id} id={`message-${message.id}`} className={`conversation-message ${message.direction === 'outbound' ? 'from-office' : 'from-client'}`}>
      <div className="conversation-meta"><strong>{message.direction === 'inbound' ? t('Klant', 'Client') : t('Aannemer', 'Contractor')}</strong>{office && message.sourceReference?.type === 'field_report' ? <span>{t('Gebaseerd op goedgekeurd dagrapport', 'Based on approved daily report')}</span> : null}<time dateTime={message.createdAt}>{new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(message.createdAt))}</time></div>
      {message.replyTo ? <p className="conversation-reference">{t('Reactie op', 'Reply to')}: {messages.find(item => item.id === message.replyTo)?.body?.slice(0, 100) || message.replyTo.slice(-12)}</p> : null}
      <p className="conversation-body">{message.body}</p>
      {message.attachment ? <ConversationPhoto base={base} token={token} message={message} label={message.attachment.filename} locale={locale} /> : null}
      <footer><span>{message.status === 'published' ? t('Gepubliceerd', 'Published') : message.direction === 'inbound' ? (message.reviewedAt ? t('Bekeken', 'Reviewed') : t('Ontvangen', 'Received')) : t('Concept', 'Draft')}</span><button type="button" title={t('Reageren', 'Reply')} aria-label={t('Reageren', 'Reply')} onClick={() => setDraft(current => ({ ...current, replyTo: message.id }))}><Reply size={16} /></button>
        {office && message.direction === 'outbound' && message.status !== 'published' ? <>{onApprovals ? <button type="button" onClick={onApprovals}>{t('Naar goedkeuringen', 'Open approvals')}</button> : null}{canApprove ? <button type="button" disabled={busy} onClick={() => publish(message)}><CheckCheck size={16} />{t('Goedgekeurd bericht publiceren', 'Publish approved message')}</button> : null}</> : null}
      </footer>
    </li>)}</ol>
    <form onSubmit={submit}>
      {draft.analysisOrigin ? <p>{t('Concept op basis van analyse', 'Draft based on analysis')}<button type="button" onClick={() => setDraft(current => ({ ...current, analysisOrigin: null }))}>{t('Bronkoppeling verwijderen', 'Remove source link')}</button></p> : null}
      {draft.replyTo ? <div className="conversation-reference">{t('Antwoord geselecteerd', 'Reply selected')}<button type="button" aria-label={t('Antwoord annuleren', 'Cancel reply')} onClick={() => setDraft(current => ({ ...current, replyTo: '' }))}><X size={16} /></button></div> : null}
      <label>{t('Bericht', 'Message')}<textarea required={!file} maxLength={5000} value={draft.body} disabled={busy} onChange={event => setDraft(current => ({ ...current, body: event.target.value }))} /></label>
      {draftScope ? <small>{t('Concepttekst blijft maximaal 12 uur in deze browsersessie. Offline verzonden berichten en foto’s worden maximaal 7 dagen versleuteld op dit apparaat bewaard.', 'Draft text stays in this browser session for up to 12 hours. Offline messages and photos are encrypted on this device for up to 7 days.')}</small> : null}
      <label className="conversation-file"><Camera size={18} />{t('Foto toevoegen (max. 5 MB)', 'Add photo (max. 5 MB)')}<input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={event => { const selected = event.target.files?.[0]; if (selected && (selected.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png', 'image/webp'].includes(selected.type))) { setError(t('Kies een JPEG-, PNG- of WebP-foto van maximaal 5 MB.', 'Choose a JPEG, PNG or WebP photo no larger than 5 MB.')); event.target.value = ''; setFile(null) } else setFile(selected || null) }} /></label>
      <button type="submit" disabled={busy || (!draft.body.trim() && !file)}><Send size={18} />{t(office ? 'Conceptantwoord bewaren' : 'Verstuur bericht', office ? 'Save draft reply' : 'Send message')}</button>
    </form>
    {office ? <ConversationOperations base={base} isOwner={isOwner} fieldTasks={fieldTasks} onDraft={(text, origin) => setDraft(current => ({ ...current, body: text, analysisOrigin: origin }))} onApprovals={onApprovals} onRevealSource={revealSource} onMessagesChanged={() => load('', undefined, { quiet: true })} messages={messages} locale={locale} /> : null}
  </section>
}

export function OfficeConversations({ jobs, api, locale, canApprove, isOwner, onApprovals, draftScope = '', target = null }) {
  const [jobId, setJobId] = useState(target?.jobId || '')
  const [accessId, setAccessId] = useState(target?.accessId || '')
  const [accesses, setAccesses] = useState([])
  const [jobTasks, setJobTasks] = useState([])
  const [error, setError] = useState('')
  const nl = locale.startsWith('nl')
  useEffect(() => {
    if (!target) return
    setJobId(target.jobId)
    setAccessId(target.accessId)
  }, [target])
  useEffect(() => {
    let current = true
    setAccessId(''); setAccesses([]); setError('')
    if (jobId) api(`/api/ledger/jobs/${jobId}/client-portal-access`).then(result => { if (current) {
      const active = (result.access || result.accesses || []).filter(item => item.status === 'active')
      setAccesses(active)
      if (target?.jobId === jobId && active.some(item => item.id === target.accessId)) setAccessId(target.accessId)
    } }).catch(reason => { if (current) setError(reason.message) })
    return () => { current = false }
  }, [api, jobId, target])
  useEffect(() => {
    let current = true
    setJobTasks([])
    if (jobId) api(`/api/ledger/jobs/${jobId}`).then(result => {
      if (current) setJobTasks(result.job?.tasks || [])
    }).catch(reason => { if (current) setError(reason.message) })
    return () => { current = false }
  }, [api, jobId])
  return <section className="office-conversations"><h2>{nl ? 'Klantgesprekken' : 'Client conversations'}</h2>
    <label>{nl ? 'Opdracht voor gesprek' : 'Conversation job'}<select value={jobId} onChange={event => setJobId(event.target.value)}><option value="">{nl ? 'Selecteer opdracht' : 'Select job'}</option>{jobs.map(job => <option key={job.id} value={job.id}>{job.title}</option>)}</select></label>
    {error ? <p role="alert">{error}</p> : null}
    {jobId ? <label>{nl ? 'Klanttoegang' : 'Client access'}<select value={accessId} onChange={event => setAccessId(event.target.value)}><option value="">{nl ? 'Selecteer actieve klanttoegang' : 'Select active client access'}</option>{accesses.map(access => <option key={access.id} value={access.id}>{access.label || access.data?.label || access.id}</option>)}</select></label> : null}
    {accessId ? <Conversation key={accessId} base={`/api/ledger/jobs/${jobId}/conversations/${accessId}`} office locale={locale} canApprove={canApprove} isOwner={isOwner} onApprovals={onApprovals} fieldTasks={jobTasks} draftScope={draftScope ? `${draftScope}:conversation:${jobId}:${accessId}` : ''} /> : null}
  </section>
}
