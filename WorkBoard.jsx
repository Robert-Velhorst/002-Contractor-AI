import { useCallback, useEffect, useRef, useState } from 'react'
import { companyFetch } from './company-request.mjs'
import { maxWeeklyAvailabilityDate, toIsoDateTimeInTimeZone } from './dashboard-format'
import { draftScopeFingerprint, useSessionDraftRecovery } from './draft-recovery'
import { HardHat, LogOut, RefreshCw, MapPin, Clock, Check, ArrowLeft, ShieldCheck } from 'lucide-react'
import OfflineDownload from './OfflineDownload'
import './components/WorkBoard.css'

const date = value => new Intl.DateTimeFormat('nl-NL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
const money = value => new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(value)
const areaKey = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase()
const localDateTime = value => {
  const date = new Date(value)
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}
const availabilityForm = () => {
  const start = new Date()
  start.setSeconds(0, 0)
  const end = new Date(start.getTime() + 8 * 60 * 60 * 1000)
  const review = new Date(start.getTime() + 24 * 60 * 60 * 1000)
  return { mode: 'unavailable', startsAt: localDateTime(start), endsAt: localDateTime(end), returnUnknown: false, reviewAt: localDateTime(review), minimumNoticeHours: '0', repeatWeekly: false, recurrenceDays: [start.getDay()], recurrenceUntil: '', recurrenceTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Amsterdam' }
}
const WEEKDAYS = ['zo', 'ma', 'di', 'wo', 'do', 'vr', 'za']
const AVAILABILITY_TIME_ZONES = ['Europe/Amsterdam', 'Europe/Brussels', 'Europe/Berlin', 'Europe/Paris', 'Europe/London', 'Europe/Dublin', 'Europe/Madrid', 'Europe/Rome', 'Europe/Warsaw', 'Europe/Athens', 'UTC']
const BOARD_REFRESH_INTERVAL_MS = 30_000
const calloutStatus = status => ({ offered: 'nieuw', accepted: 'geaccepteerd', declined: 'afgewezen', pending_approval: 'wacht op goedkeuring', placed: 'geplaatst', revoked: 'ingetrokken', expired: 'verlopen' }[status] || 'bijgewerkt')

export default function WorkBoard() {
  const [token, setToken] = useState(() => sessionStorage.getItem('contractor.work-board.session') || '')
  const [identity, setIdentity] = useState(null), [identitySignedIn, setIdentitySignedIn] = useState(false)
  const [accessChecked, setAccessChecked] = useState(false)
  const [mode, setMode] = useState('login'), [self, setSelf] = useState(null), [positions, setPositions] = useState([]), [pack, setPack] = useState(null)
  const [positionChecks, setPositionChecks] = useState({})
  const [positionSearch, setPositionSearch] = useState('')
  const [positionRoleFilter, setPositionRoleFilter] = useState('')
  const [availability, setAvailability] = useState({ periods: [], conflicts: [] }), [availabilityFormState, setAvailabilityFormState] = useState(availabilityForm)
  const availabilityFormBaseline = useRef(availabilityFormState)
  const resetAvailabilityForm = useCallback(() => {
    const next = availabilityForm()
    availabilityFormBaseline.current = next
    setAvailabilityFormState(next)
  }, [])
  const [workUpdate, setWorkUpdate] = useState({ taskId: '', status: 'in_progress', progressPercent: '0', note: '' })
  const [error, setError] = useState(''), [notice, setNotice] = useState(''), [busy, setBusy] = useState(false)
  const boardSnapshot = useRef({ self: null, positions: [] })
  const activityEpoch = useRef(0)
  const accountId = self?.account?.id || ''
  const accountSkills = (self?.account?.pendingSkillsChange?.skills || self?.account?.skills || []).join(', ')
  const accountAcceptsAllRegions = self?.account?.allRegions === true || (!Array.isArray(self?.account?.workRegions) && String(self?.account?.region || '').trim().toLocaleLowerCase() === 'heel nederland')
  const accountRegions = accountAcceptsAllRegions ? ''
    : (self?.account?.workRegions || (self?.account?.region || '').split(/[;,]/)).join(', ')
  const [skillsEdit, setSkillsEdit] = useState(null)
  const [regionsEdit, setRegionsEdit] = useState(null)
  const skillsDraft = skillsEdit?.accountId === accountId && skillsEdit.source === accountSkills ? skillsEdit.value : accountSkills
  const matchingRegions = regionsEdit?.accountId === accountId && regionsEdit.sourceRegions === accountRegions && regionsEdit.sourceAll === accountAcceptsAllRegions
  const regionsDraft = matchingRegions ? regionsEdit.regions : accountRegions
  const allRegionsDraft = matchingRegions ? regionsEdit.allRegions : accountAcceptsAllRegions
  const setSkillsDraft = value => setSkillsEdit({ accountId, source: accountSkills, value })
  function updateRegionDraft(field, value) {
    setRegionsEdit(current => {
      const matches = current?.accountId === accountId && current.sourceRegions === accountRegions && current.sourceAll === accountAcceptsAllRegions
      return { ...(matches ? current : { accountId, sourceRegions: accountRegions,
        sourceAll: accountAcceptsAllRegions, regions: accountRegions, allRegions: accountAcceptsAllRegions }), [field]: value }
    })
  }
  const setRegionsDraft = value => updateRegionDraft('regions', value)
  const setAllRegionsDraft = value => updateRegionDraft('allRegions', value)
  const hasPack = Boolean(pack)
  const availabilityDraftScope = accountId ? `worker:${draftScopeFingerprint(accountId)}` : ''
  const restoreAvailabilityForm = useCallback(value => {
    setAvailabilityFormState({ ...availabilityFormBaseline.current, ...(value || {}) })
  }, [])
  const hasAvailabilityFormDraft = Object.keys(availabilityFormState)
    .some(key => availabilityFormState[key] !== availabilityFormBaseline.current[key])
  useSessionDraftRecovery({
    enabled: Boolean(availabilityDraftScope && self?.account?.status === 'admitted'),
    scope: availabilityDraftScope,
    name: 'availability-report',
    value: hasAvailabilityFormDraft ? availabilityFormState : null,
    setValue: restoreAvailabilityForm,
  })
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', region: '', allRegions: false, skills: '', company: '', privacyAccepted: false })
  const [privacyRequests, setPrivacyRequests] = useState([])
  const [privacyRequestsLoaded, setPrivacyRequestsLoaded] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadNotifications, setUnreadNotifications] = useState(0)
  const [privacyRequestType, setPrivacyRequestType] = useState('access')
  const [privacyDetails, setPrivacyDetails] = useState('')
  const api = useCallback(async (route, body) => {
    const response = await companyFetch(`/api/work-board${route}`, { method: body ? 'POST' : 'GET', headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
    const result = await response.json()
    if (!response.ok) { if (response.status === 401) { sessionStorage.removeItem('contractor.work-board.session'); setToken(''); setSelf(null); setPack(null); setIdentitySignedIn(false); setPrivacyRequests([]); setPrivacyRequestsLoaded(false); resetAvailabilityForm() } throw new Error(result.error?.message || 'Aanvraag mislukt.') }
    return result
  }, [resetAvailabilityForm, token])
  const loadNotifications = useCallback(async () => {
    const inbox = await api('/notifications')
    setNotifications(inbox.notifications || [])
    setUnreadNotifications(inbox.unreadCount || 0)
  }, [api])
  const load = useCallback(async () => {
    const [me, board] = await Promise.all([api('/me'), api('/positions')])
    const inbox = me.notifications || { notifications: [], unreadCount: 0 }
    setSelf(me); setPositions(board.positions); setNotifications(inbox.notifications || []); setUnreadNotifications(inbox.unreadCount || 0)
    setPositionChecks(current => Object.fromEntries(Object.entries(current).filter(([id, check]) => board.positions.some(position => position.id === id && position.revision === check.revision))))
    if (me.account.status === 'admitted') setAvailability((await api('/availability')).availability || { periods: [], conflicts: [] })
  }, [api])
  const loadPrivacyRequests = useCallback(async () => {
    const result = await api('/privacy/requests')
    setPrivacyRequests(result.requests || [])
    setPrivacyRequestsLoaded(true)
  }, [api])
  useEffect(() => { let live = true; companyFetch('/api/session').then(response => response.json()).then(result => {
    if (!live) return
    setIdentity(result.identity || null); setIdentitySignedIn(result.authentication?.method === 'identity' && result.operator?.role === 'field_worker')
    if (result.authentication?.method === 'identity') { sessionStorage.removeItem('contractor.work-board.session'); setToken('') }
  }).catch(reason => { if (live) setError(reason.message) }).finally(() => { if (live) setAccessChecked(true) }); return () => { live = false } }, [])
  useEffect(() => { if (!accessChecked || !token && !identitySignedIn) return; let live = true; Promise.all([api('/me'), api('/positions')]).then(async ([me, board]) => { const inbox = me.notifications || { notifications: [], unreadCount: 0 }; const currentAvailability = me.account.status === 'admitted' ? (await api('/availability')).availability || { periods: [], conflicts: [] } : { periods: [], conflicts: [] }; if (live) { setSelf(me); setPositions(board.positions); setNotifications(inbox.notifications || []); setUnreadNotifications(inbox.unreadCount || 0); setAvailability(currentAvailability) } }).catch(reason => { if (live) { setError(reason.message); setSelf(null); setPack(null); setIdentitySignedIn(false); resetAvailabilityForm() } }); return () => { live = false } }, [api, token, identitySignedIn, accessChecked, resetAvailabilityForm])
  useEffect(() => { boardSnapshot.current = { self, positions } }, [self, positions])
  useEffect(() => {
    if (!accessChecked || !accountId || hasPack) return undefined
    let live = true
    let pending = false
    const refresh = async () => {
      if (!live || pending || document.visibilityState === 'hidden' || !navigator.onLine) return
      pending = true
      const epoch = activityEpoch.current
      try {
        const [me, board] = await Promise.all([api('/me'), api('/positions')])
        if (!live || epoch !== activityEpoch.current) return
        const previous = boardSnapshot.current
        const priorCallouts = new Map((previous.self?.standbyCallouts || []).map(item => [item.id, item]))
        const freshCallouts = me.standbyCallouts || []
        const notices = []
        for (const item of freshCallouts) {
          const prior = priorCallouts.get(item.id)
          if (item.status === 'offered' && !prior) notices.push(`Nieuwe afroep ontvangen: ${item.jobTitle} · ${item.role}.`)
          else if (prior && prior.status !== item.status && ['revoked', 'expired', 'declined', 'pending_approval', 'placed'].includes(item.status)) {
            notices.push(`Status van je afroep voor ${item.jobTitle} is bijgewerkt: ${calloutStatus(item.status)}.`)
          }
        }
        const priorApplications = new Map((previous.self?.applications || []).map(item => [item.id, item]))
        for (const item of me.applications || []) {
          const prior = priorApplications.get(item.id)
          if (prior && (prior.status !== item.status || prior.waitlistPosition !== item.waitlistPosition)) {
            notices.push(`Je inschrijving voor ${item.position?.title || 'een positie'} is bijgewerkt.`)
          }
          if (prior && prior.releaseRequest?.status !== item.releaseRequest?.status && item.releaseRequest?.status) {
            const status = item.releaseRequest.status === 'pending' ? 'wacht op beoordeling'
              : item.releaseRequest.status === 'approved' ? 'goedgekeurd' : 'afgewezen'
            notices.push(`Je vrijgaveverzoek voor ${item.position?.title || 'een positie'} is ${status}.`)
          }
        }
        const priorPositions = new Map((previous.positions || []).map(item => [item.id, item]))
        for (const item of board.positions || []) {
          const prior = priorPositions.get(item.id)
          if (!prior) notices.push(`Nieuwe open positie: ${item.title} · ${item.city}.`)
          else if (prior.revision !== item.revision) notices.push(`De voorwaarden van ${item.title} zijn gewijzigd. Controleer ze opnieuw.`)
        }
        if ((previous.positions || []).some(item => !(board.positions || []).some(current => current.id === item.id))) {
          notices.push('Een of meer eerder getoonde posities zijn niet meer beschikbaar.')
        }
        boardSnapshot.current = { self: me, positions: board.positions || [] }
        setSelf(me)
        setPositions(board.positions || [])
        setNotifications(me.notifications?.notifications || [])
        setUnreadNotifications(me.notifications?.unreadCount || 0)
        setPositionChecks(current => Object.fromEntries(Object.entries(current).filter(([id, check]) => (board.positions || []).some(position => position.id === id && position.revision === check.revision))))
        if (notices.length) setNotice(notices.join(' '))
      } catch {
        // Keep the current board available; the visible refresh control reports errors.
      } finally {
        pending = false
      }
    }
    const timer = window.setInterval(() => { void refresh() }, BOARD_REFRESH_INTERVAL_MS)
    return () => { live = false; window.clearInterval(timer) }
  }, [accessChecked, accountId, api, hasPack])
  async function act(fn) { if (busy) return; activityEpoch.current += 1; setBusy(true); setError(''); setNotice(''); try { await fn() } catch (reason) { setError(reason.message) } finally { setBusy(false) } }
  async function enroll(position) {
    const { check } = await api(`/positions/${position.id}/enrollment-check`)
    if (check.revision !== position.revision) {
      setPositionChecks(current => ({ ...current, [position.id]: { canApply: false, revision: check.revision, blockers: ['De voorwaarden zijn gewijzigd. Lees de bijgewerkte positie opnieuw voordat je inschrijft.'], advisories: [] } }))
      await load()
      return
    }
    if (!check.canApply) {
      setPositionChecks(current => ({ ...current, [position.id]: check }))
      return
    }
    const result = await api(`/positions/${position.id}/enroll`, { revision: check.revision })
    await load()
    setPositionChecks(current => { const next = { ...current }; delete next[position.id]; return next })
    setNotice(result.application.status === 'assigned' ? 'Je bent geplaatst. Je werkpakket staat bij Mijn inschrijvingen.' : result.application.status === 'waitlisted' ? `De positie is vol. Je staat op de wachtlijst${result.application.waitlistPosition ? ` op plek ${result.application.waitlistPosition}` : ''}; de aannemer beoordeelt de volgorde zodra ruimte ontstaat.` : result.application.holdReason === 'standby_confirmation_required' ? 'Belangstelling vastgelegd. De aannemer beoordeelt de inschrijving vanwege je standby-periode.' : result.application.holdReason === 'materials_or_source' ? 'Belangstelling ontvangen. De aannemer kan je plaatsen zodra materialen en opdrachtinformatie gecontroleerd zijn.' : 'Belangstelling ontvangen. Je toelating moet nog worden afgerond.')
  }
  const change = event => setForm(current => ({ ...current, [event.target.name]: event.target.type === 'checkbox' ? event.target.checked : event.target.value }))
  const standbyPeriodIds = new Set(availability.periods.filter(period => period.periodType === 'standby').map(period => period.id))
  const reportableTasks = (pack?.do || []).filter(task => ['open', 'in_progress', 'blocked'].includes(task.status))
  const positionRoles = [...new Set(positions.map(position => position.role).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl'))
  const normalizedPositionSearch = areaKey(positionSearch)
  const visiblePositions = positions.filter(position => {
    if (positionRoleFilter && position.role !== positionRoleFilter) return false
    if (!normalizedPositionSearch) return true
    const searchable = [position.title, position.role, position.city, position.description, position.materials,
      position.equipment, position.prerequisites, ...(position.requiredSkills || [])].map(areaKey).join(' ')
    return searchable.includes(normalizedPositionSearch)
  })
  return <main className="worker-board" lang="nl">
    <header><div><HardHat size={26} /><strong>Contractor.AI</strong></div><span>Uitvoerenden</span>{(token || identitySignedIn) && <button title="Uitloggen" aria-label="Uitloggen" disabled={busy} onClick={() => act(async () => {
      if (identitySignedIn) { const response = await companyFetch('/api/auth/logout', { method: 'POST' }); if (!response.ok) throw new Error('Uitloggen is niet gelukt.') }
      else await api('/logout', {})
      sessionStorage.removeItem('contractor.work-board.session'); setToken(''); setIdentitySignedIn(false); setSelf(null); setPack(null); setPrivacyRequests([]); setPrivacyRequestsLoaded(false); resetAvailabilityForm()
    })}><LogOut size={20} /></button>}</header>
    <div className="wb-body">
      {error && <p className="wb-error" role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
      {identity?.enabled && <p><a href={identity.accountUrl}>Mijn account en bedrijven</a>{!identitySignedIn && <> | <a href={`${identity.signInUrl}?returnTo=/work-board.html`}>Inloggen met persoonlijk account</a></>}</p>}
      {self && notifications.length > 0 && <section className="wb-notifications" aria-labelledby="wb-notifications-title">
        <div className="wb-heading"><h2 id="wb-notifications-title">Meldingen</h2><span aria-live="polite">{unreadNotifications} ongelezen</span></div>
        <ol>{notifications.map(notification => <li key={notification.id} data-read={notification.readAt ? 'true' : 'false'}>
          <div><a href={notification.href}><strong>{notification.title}</strong></a><time dateTime={notification.createdAt}>{date(notification.createdAt)}</time><p>{notification.body}</p></div>
          {!notification.readAt && <button type="button" aria-label={`Markeer als gelezen: ${notification.title}`} disabled={busy} onClick={() => act(async () => { await api(`/notifications/${encodeURIComponent(notification.id)}/read`, {}); await loadNotifications() })}><Check size={17} />Gelezen</button>}
        </li>)}</ol>
      </section>}
      {!token && !identitySignedIn ? <section className="wb-auth"><h1>{mode === 'login' ? 'Inloggen' : 'Aanmelden als uitvoerende'}</h1>
        <div className="wb-tabs" role="group" aria-label="Account"><button aria-pressed={mode === 'login'} onClick={() => setMode('login')}>Inloggen</button><button aria-pressed={mode === 'register'} onClick={() => setMode('register')}>Registreren</button></div>
        <form onSubmit={event => { event.preventDefault(); void act(async () => {
          if (mode === 'register') { await api('/register', { ...form, skills: form.skills.split(',').map(value => value.trim()).filter(Boolean) }); setMode('login'); setNotice('Aanmelding ontvangen. Log in om posities te bekijken. Toelating door de aannemer is nodig voor plaatsing.'); setForm(current => ({ ...current, password: '' })); return }
          const result = await api('/login', { email: form.email, password: form.password }); sessionStorage.setItem('contractor.work-board.session', result.token); setToken(result.token); setForm(current => ({ ...current, password: '' }))
        }) }}>
          {mode === 'register' && <><label>Naam<input name="name" required value={form.name} onChange={change} autoComplete="name" /></label><label>Telefoon<input name="phone" required type="tel" value={form.phone} onChange={change} autoComplete="tel" /></label><label>Plaatsen of gebieden<input name="region" required={!form.allRegions} disabled={form.allRegions} value={form.region} onChange={change} /></label><label className="wb-check"><input name="allRegions" type="checkbox" checked={form.allRegions} onChange={change} />Ik neem opdrachten in heel Nederland aan</label><label>Vakgebieden (gescheiden door komma's)<input name="skills" required value={form.skills} onChange={change} /></label><label>Bedrijf (optioneel)<input name="company" value={form.company} onChange={change} autoComplete="organization" /></label></>}
          <label>E-mailadres<input name="email" required type="email" value={form.email} onChange={change} autoComplete="username" /></label>
          <label>Wachtwoord<input name="password" required type="password" minLength={mode === 'register' ? 12 : undefined} maxLength={200} value={form.password} onChange={change} autoComplete={mode === 'register' ? 'new-password' : 'current-password'} /></label>
          {mode === 'register' && <label className="wb-check"><input name="privacyAccepted" required type="checkbox" checked={form.privacyAccepted} onChange={change} />Ik geef mijn gegevens aan deze aannemer voor toelating en planning van werk.</label>}
          <button className="wb-primary" disabled={busy}>{busy ? 'Bezig...' : mode === 'register' ? 'Account aanmaken' : 'Inloggen'}</button>
        </form>
        <a className="wb-admin-entry" href="/"><ShieldCheck size={18} aria-hidden="true" />Verder als beheerder</a>
      </section> : !self ? <p role="status">Profiel laden...</p> : pack ? <section><button onClick={() => setPack(null)}><ArrowLeft size={17} />Terug naar posities</button><h1>{pack.job.title}</h1><p><MapPin size={17} />{pack.job.address}, {pack.job.city}</p>
        <section aria-label="Mijn ingeplande dienst"><h2>Mijn ingeplande dienst</h2><p><strong>{pack.positionAssignment?.role || 'Uitvoering'}</strong></p><p><Clock size={17} />{pack.positionAssignment?.scheduledStart ? date(pack.positionAssignment.scheduledStart) : 'Starttijd niet vastgelegd'} tot {pack.positionAssignment?.scheduledEnd ? date(pack.positionAssignment.scheduledEnd) : 'Eindtijd niet vastgelegd'}</p>{Number(pack.positionAssignment?.allocationHours) > 0 ? <p>{pack.positionAssignment.allocationHours} toegewezen uren</p> : null}</section>
        <h2>Werkzaamheden</h2>{pack.do.length ? <ul>{pack.do.map(task => <li key={task.id}><strong>{task.title}</strong><p>{task.description}</p></li>)}</ul> : <p>Nog geen taken vastgelegd.</p>}
        <section aria-labelledby="wb-task-report-title">
          <h2 id="wb-task-report-title">Voortgang of blokkade melden</h2>
          {reportableTasks.length ? <form onSubmit={event => { event.preventDefault(); void act(async () => {
            const result = await api(`/positions/${pack.positionId}/progress`, { ...workUpdate,
              taskId: workUpdate.taskId || reportableTasks[0].id, progressPercent: Number(workUpdate.progressPercent),
              sourceHash: pack.sourceHash, entryKey: crypto.randomUUID() })
            setPack((await api(`/positions/${pack.positionId}/pack`)).pack)
            setWorkUpdate(current => ({ ...current, note: '' }))
            setNotice(result.replayed ? 'Deze voortgang stond al in de opdracht.' : workUpdate.status === 'blocked' ? 'Blokkade vastgelegd voor de aannemer. De opdrachtstatus is niet automatisch gewijzigd.' : 'Voortgang vastgelegd voor de gekozen werkzaamheid.')
          }) }}>
            <label>Werkzaamheid<select required value={workUpdate.taskId || reportableTasks[0].id} onChange={event => setWorkUpdate(current => ({ ...current, taskId: event.target.value }))}>{reportableTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
            <div className="wb-mode-options" role="group" aria-label="Meldingstype">
              <button type="button" aria-pressed={workUpdate.status === 'in_progress'} onClick={() => setWorkUpdate(current => ({ ...current, status: 'in_progress' }))}>Voortgang</button>
              <button type="button" aria-pressed={workUpdate.status === 'blocked'} onClick={() => setWorkUpdate(current => ({ ...current, status: 'blocked' }))}>Geblokkeerd</button>
            </div>
            <label>Voortgang<input required type="number" min="0" max="100" step="1" value={workUpdate.progressPercent} onChange={event => setWorkUpdate(current => ({ ...current, progressPercent: event.target.value }))} /></label>
            <label>{workUpdate.status === 'blocked' ? 'Wat houdt het werk tegen?' : 'Wat is er gedaan?'}<textarea required minLength="3" maxLength="2000" value={workUpdate.note} onChange={event => setWorkUpdate(current => ({ ...current, note: event.target.value }))} /></label>
            <button className="wb-primary" disabled={busy}>{workUpdate.status === 'blocked' ? 'Blokkade melden' : 'Voortgang melden'}</button>
          </form> : <p>Er zijn geen open werkzaamheden om te melden.</p>}
          <p role="note">Een melding rondt geen opdracht af en geeft geen toestemming om te starten.</p>
        </section>
        <FieldWorkContext context={pack.know.workContext} />
        <h2>Instructies</h2>{pack.know.instructions.length ? pack.know.instructions.map(item => <article key={item.id}><h3>{item.title}</h3><p>{item.body}</p></article>) : <p>Nog geen vrijgegeven instructies.</p>}
        <h2>Materialen en gereedschap</h2><ul>{pack.have.materials.map(item => <li key={item.id}>{item.name}: {item.quantity} {item.unit}</li>)}{pack.have.equipment.map(item => <li key={item.id}>{item.toolName}</li>)}</ul>
        {identitySignedIn ? <OfflineDownload pack={pack} locale="nl-NL" /> : <p className="wb-note">Offline bewaren is beschikbaar na aanmelden met je persoonlijke bedrijfsaccount. Deze oudere werkbordaanmelding kan opdrachten nog niet veilig synchroniseren.</p>}
        <p role="status">Plaatsing is geen toestemming om te starten. Controleer de actuele start- en veiligheidsvoorwaarden met de aannemer.</p>
      </section> : <>
        <div className="wb-heading"><div><h1>Beschikbaar werk</h1><p>{self.account.name} | {self.account.status === 'admitted' ? 'Toegelaten' : 'Toelating in behandeling'}</p></div><button title="Posities verversen" aria-label="Posities verversen" disabled={busy} onClick={() => act(load)}><RefreshCw size={20} /></button></div>
        {self.account.status !== 'admitted' && <p className="wb-note">Je kunt belangstelling aangeven. Na toelating kun je je definitief inschrijven op een passende open positie.</p>}
        <section aria-labelledby="wb-skills-title">
          <h2 id="wb-skills-title">Mijn vaardigheden</h2>
          <p>Vermeld je vakgebieden en aanvullende vaardigheden eerlijk. Dit is geen bewijs van verplichte certificaten of diploma's.</p>
          {self.account.authSource === 'identity'
            ? <p className="wb-note">Je personeelsprofiel wordt door je bedrijf beheerd. Neem contact op met de aannemer om een wijziging te laten beoordelen.</p>
            : <form onSubmit={event => { event.preventDefault(); void act(async () => {
              const skills = skillsDraft.split(',').map(value => value.trim()).filter(Boolean)
              const result = await api('/profile/skills', { skills })
              await load()
              setNotice(result.reviewRequired
                ? 'Je wijzigingsvoorstel is naar de aannemer gestuurd. Je goedgekeurde profiel blijft actief totdat de wijziging is beoordeeld.'
                : result.withdrawn ? 'Je openstaande wijzigingsvoorstel is ingetrokken. Je goedgekeurde profiel blijft actief.'
                : 'Je opgegeven vaardigheden zijn bijgewerkt. Toelating en plaatsing blijven afzonderlijk gecontroleerd.')
            }) }}>
              {self.account.pendingSkillsChange && <p role="status">Voorstel wacht op beoordeling: {self.account.pendingSkillsChange.skills.join(', ')}</p>}
              <label>Vaardigheden, gescheiden door komma's<input required maxLength={1638} value={skillsDraft} onChange={event => setSkillsDraft(event.target.value)} /></label>
              <button disabled={busy}>Vaardigheden bijwerken</button>
          </form>}
        </section>
        <section aria-labelledby="wb-regions-title">
          <h2 id="wb-regions-title">Mijn werkgebied</h2>
          <p>Dit is een voorkeur, geen reisafstand. Je kunt ook op werk buiten deze plaatsen reageren.</p>
          <form onSubmit={event => { event.preventDefault(); void act(async () => {
            const regions = regionsDraft.split(/[;,]/).map(value => value.trim()).filter(Boolean)
            await api('/profile/regions', { regions, allRegions: allRegionsDraft })
            await load()
            setNotice('Je werkgebiedvoorkeur is bijgewerkt. Afstand of reistijd wordt hiermee niet berekend.')
          }) }}>
            <label>Plaatsen of gebieden, gescheiden door komma's<input aria-label="Werkgebieden" maxLength={1638} required={!allRegionsDraft} disabled={allRegionsDraft} value={regionsDraft} onChange={event => setRegionsDraft(event.target.value)} /></label>
            <label className="wb-check"><input aria-label="Heel Nederland" type="checkbox" checked={allRegionsDraft} onChange={event => setAllRegionsDraft(event.target.checked)} />Ik neem opdrachten in heel Nederland aan</label>
            <button disabled={busy}>Werkgebied bijwerken</button>
          </form>
        </section>
        <details className="wb-privacy" onToggle={event => { if (event.currentTarget.open && !privacyRequestsLoaded) void loadPrivacyRequests().catch(reason => setError(reason.message)) }}>
          <summary id="wb-privacy-title">Mijn gegevens en privacyverzoeken</summary>
          <p>Je kunt een verzoek over je persoonsgegevens indienen en volgen. De aannemer controleert je identiteit en beoordeelt het verzoek; exports worden pas na controle van gegevens van anderen verstrekt.</p>
          <form onSubmit={event => { event.preventDefault(); void act(async () => {
            const result = await api('/privacy/requests', { requestType: privacyRequestType, details: privacyDetails })
            setPrivacyDetails('')
            await loadPrivacyRequests()
            setNotice(`Je verzoek is geregistreerd. Referentie: ${result.request.id}. De aannemer moet je identiteit en verzoek nog beoordelen.`)
          }) }}>
            <div className="wb-fields">
              <label>Verzoek<select value={privacyRequestType} onChange={event => setPrivacyRequestType(event.target.value)}>
                <option value="access">Inzage in mijn gegevens</option>
                <option value="portability">Een export van mijn gegevens</option>
                <option value="rectification">Gegevens laten corrigeren</option>
                <option value="restriction">Verwerking beperken</option>
                <option value="objection">Bezwaar maken tegen verwerking</option>
                <option value="erasure">Verwijdering laten beoordelen</option>
              </select></label>
              <label>Toelichting (optioneel)<textarea value={privacyDetails} onChange={event => setPrivacyDetails(event.target.value)} maxLength={1000} /></label>
            </div>
            <button className="wb-primary" disabled={busy}>Verzoek indienen</button>
          </form>
          {privacyRequests.length === 0 ? <p>Nog geen privacyverzoeken.</p> : <ul className="wb-privacy-list">{privacyRequests.map(request => <li key={request.id}>
            <span><strong>{({ access: 'Inzage', portability: 'Gegevensexport', rectification: 'Correctie', restriction: 'Beperking', objection: 'Bezwaar', erasure: 'Verwijdering' })[request.requestType] || 'Privacyverzoek'}</strong> · {({ open: 'Ontvangen', in_review: 'In beoordeling', pending_approval: 'Wacht op goedkeuring', completed: 'Afgerond', partially_completed: 'Gedeeltelijk afgerond', rejected: 'Afgewezen', cancelled: 'Geannuleerd' })[request.status] || request.status} · {({ unverified: 'Identiteit controleren', verified: 'Identiteit bevestigd', rejected: 'Identiteit niet bevestigd' })[request.identity?.status] || 'Identiteitsstatus onbekend'} · Uiterlijk {new Date(request.dueAt).toLocaleDateString('nl-NL')}</span>
          </li>)}</ul>}
        </details>
        {self.account.status === 'admitted' && <section className="wb-availability" aria-labelledby="wb-availability-title">
          <h2 id="wb-availability-title">Beschikbaarheid melden</h2>
          <div className="wb-mode-options" role="group" aria-label="Beschikbaarheidsvorm">
            <button type="button" aria-pressed={availabilityFormState.mode === 'unavailable'} onClick={() => setAvailabilityFormState(current => ({ ...current, mode: 'unavailable' }))}>Niet beschikbaar</button>
            <button type="button" aria-pressed={availabilityFormState.mode === 'standby'} onClick={() => setAvailabilityFormState(current => ({ ...current, mode: 'standby', returnUnknown: false }))}>Standby op afroep</button>
          </div>
          <p>{availabilityFormState.mode === 'standby'
            ? 'Geef aan wanneer je mogelijk werk kunt aannemen, maar nog geen vaste plaatsing kunt toezeggen. Bij een overlappende positie beoordeelt de aannemer je belangstelling.'
            : 'Meld wanneer je niet kunt werken, bijvoorbeeld door ziekte of zorgtaken. Een reden is niet nodig; er worden geen medische details gevraagd.'}</p>
          <form onSubmit={event => { event.preventDefault(); void act(async () => {
            const payload = { mode: availabilityFormState.mode, startsAt: new Date(availabilityFormState.startsAt).toISOString(), returnUnknown: availabilityFormState.returnUnknown,
              ...(availabilityFormState.mode === 'standby' ? { minimumNoticeHours: Number(availabilityFormState.minimumNoticeHours) } : {}) }
            if (availabilityFormState.returnUnknown) payload.reviewAt = new Date(availabilityFormState.reviewAt).toISOString()
            else payload.endsAt = new Date(availabilityFormState.endsAt).toISOString()
            if (availabilityFormState.repeatWeekly && !availabilityFormState.returnUnknown) {
              payload.startsAt = toIsoDateTimeInTimeZone(availabilityFormState.startsAt, availabilityFormState.recurrenceTimeZone)
              payload.endsAt = toIsoDateTimeInTimeZone(availabilityFormState.endsAt, availabilityFormState.recurrenceTimeZone)
              payload.recurrence = {
              frequency: 'weekly', daysOfWeek: availabilityFormState.recurrenceDays,
              timeZone: availabilityFormState.recurrenceTimeZone,
              until: availabilityFormState.recurrenceUntil
              }
            }
            const result = await api('/availability', payload)
            setAvailability((await api('/availability')).availability)
            resetAvailabilityForm()
            setNotice(availabilityFormState.mode === 'standby'
              ? `Standby geregistreerd. ${result.conflicts.length ? `${result.conflicts.length} bestaande geplande ${result.conflicts.length === 1 ? 'opdracht overlapt' : 'opdrachten overlappen'} met deze periode; bespreek een wijziging met de aannemer.` : 'Inschrijvingen op overlappende posities wachten op beoordeling door de aannemer.'}`
              : `${result.invalidatedCallouts?.length ? `${result.invalidatedCallouts.length} open standby-oproep${result.invalidatedCallouts.length === 1 ? ' is' : 'en zijn'} ingetrokken; de aannemer moet opnieuw naar de bezetting kijken. ` : ''}${result.conflicts.length ? `Verhindering gemeld. ${result.conflicts.length} geplande ${result.conflicts.length === 1 ? 'opdracht is' : 'opdrachten zijn'} geraakt; de aannemer moet de bezetting beoordelen.` : 'Verhindering gemeld. De aannemer ziet je aangepaste beschikbaarheid.'}`)
          }) }}>
            <div className="wb-fields">
              <label>Vanaf<input required type="datetime-local" value={availabilityFormState.startsAt} onChange={event => setAvailabilityFormState(current => ({ ...current, startsAt: event.target.value }))} /></label>
              {!availabilityFormState.returnUnknown && <label>Tot<input required type="datetime-local" value={availabilityFormState.endsAt} onChange={event => setAvailabilityFormState(current => ({ ...current, endsAt: event.target.value }))} /></label>}
              {availabilityFormState.returnUnknown && <label>Wanneer opnieuw afstemmen<input required type="datetime-local" value={availabilityFormState.reviewAt} onChange={event => setAvailabilityFormState(current => ({ ...current, reviewAt: event.target.value }))} /></label>}
              {!availabilityFormState.returnUnknown && <label className="wb-check"><input type="checkbox" checked={availabilityFormState.repeatWeekly} onChange={event => setAvailabilityFormState(current => ({ ...current, repeatWeekly: event.target.checked, recurrenceDays: current.recurrenceDays.length ? current.recurrenceDays : [new Date(current.startsAt).getDay()] }))} />Wekelijks herhalen</label>}
              {availabilityFormState.repeatWeekly && !availabilityFormState.returnUnknown && <>
                <fieldset className="wb-weekdays"><legend>Herhaal op</legend>{WEEKDAYS.map((day, index) => <label key={day}><input type="checkbox" checked={availabilityFormState.recurrenceDays.includes(index)} onChange={event => setAvailabilityFormState(current => ({ ...current, recurrenceDays: event.target.checked ? [...new Set([...current.recurrenceDays, index])].sort() : current.recurrenceDays.filter(item => item !== index) }))} />{day}</label>)}</fieldset>
                <label>Laatste dag<input required type="date" min={availabilityFormState.startsAt.slice(0, 10)} max={maxWeeklyAvailabilityDate(availabilityFormState.startsAt)} value={availabilityFormState.recurrenceUntil} onChange={event => setAvailabilityFormState(current => ({ ...current, recurrenceUntil: event.target.value }))} /></label>
                <label>Tijdzone<select value={availabilityFormState.recurrenceTimeZone} onChange={event => setAvailabilityFormState(current => ({ ...current, recurrenceTimeZone: event.target.value }))}>{[...new Set([...AVAILABILITY_TIME_ZONES, availabilityFormState.recurrenceTimeZone])].map(zone => <option key={zone} value={zone}>{zone}</option>)}</select></label>
                <p className="wb-form-note">Dagen en tijden volgen deze tijdzone. De hele reeks is één melding; annuleren vraagt beoordeling van de volledige reeks.</p>
              </>}
              {availabilityFormState.mode === 'standby' && <label>Minimale aankondigingstijd<select value={availabilityFormState.minimumNoticeHours} onChange={event => setAvailabilityFormState(current => ({ ...current, minimumNoticeHours: event.target.value }))}>
                <option value="0">Geen minimum</option><option value="2">2 uur</option><option value="4">4 uur</option><option value="8">8 uur</option><option value="12">12 uur</option><option value="24">24 uur</option><option value="48">48 uur</option>
              </select></label>}
            </div>
            {availabilityFormState.mode !== 'standby' && <label className="wb-check"><input type="checkbox" checked={availabilityFormState.returnUnknown} onChange={event => setAvailabilityFormState(current => ({ ...current, returnUnknown: event.target.checked, repeatWeekly: event.target.checked ? false : current.repeatWeekly }))} />Ik weet nog niet wanneer ik terug ben</label>}
            <button className="wb-primary" disabled={busy || (availabilityFormState.repeatWeekly && (!availabilityFormState.recurrenceUntil || !availabilityFormState.recurrenceDays.length))}>{availabilityFormState.mode === 'standby' ? 'Standby vastleggen' : 'Verhindering melden'}</button>
          </form>
          {!!availability.conflicts.length && <div className="wb-conflicts" role="status"><strong>Opdrachten die aandacht vragen</strong>{availability.conflicts.map(item => <article key={`${item.periodId}-${item.assignmentId}`}><h3>{item.jobTitle}</h3><p>{item.scheduledStart && item.scheduledEnd ? `${date(item.scheduledStart)} – ${date(item.scheduledEnd)}` : 'Planning wordt nog afgestemd'}</p></article>)}<p>{availability.conflicts.some(item => standbyPeriodIds.has(item.periodId)) ? 'Een standby-periode wijzigt bestaande plaatsingen niet. Bespreek een mogelijke roosterwijziging rechtstreeks met de aannemer.' : 'De aannemer beoordeelt de bezetting. Een vervanging wordt pas na controle en goedkeuring vastgelegd.'}</p></div>}
          {!!availability.periods.length && <details><summary>Gemelde beschikbaarheidsperioden</summary>{availability.periods.map(period => <div key={period.id}><p>{period.periodType === 'standby' ? `Standby op afroep${period.minimumNoticeHours ? ` · minimaal ${period.minimumNoticeHours} uur aankondiging` : ''}` : 'Niet beschikbaar'}: {date(period.startsAt)} – {period.returnUnknown ? 'tot nader bericht' : date(period.endsAt)}{period.recurrence ? ` · wekelijks t/m ${new Date(`${period.recurrence.until}T12:00:00`).toLocaleDateString('nl-NL')}${period.nextOccurrence ? ` · volgende keer ${date(period.nextOccurrence.startsAt)}` : ''}` : ''} ({period.status === 'pending_cancellation' ? 'wijziging in beoordeling' : period.status === 'cancelled' ? 'beëindigd' : 'geregistreerd'})</p>{period.status === 'active' && (period.recurrence || Date.parse(period.endsAt) > Date.now()) && <button type="button" disabled={busy} onClick={() => act(async () => {
            await api(`/availability/${encodeURIComponent(period.id)}/request-cancellation`, {})
            setAvailability((await api('/availability')).availability)
            setNotice(period.recurrence ? 'Je verzoek is vastgelegd. De volledige wekelijkse reeks blijft actief totdat de aannemer de wijziging heeft beoordeeld.' : 'Je verzoek is vastgelegd. De beschikbaarheidsperiode blijft actief totdat de aannemer de wijziging heeft beoordeeld.')
          })}>{period.recurrence ? 'Wekelijkse reeks beëindigen aanvragen' : period.periodType === 'standby' ? 'Standby beëindigen aanvragen' : 'Eerder beschikbaar melden'}</button>}</div>)}</details>}
        </section>}
        {self.account.status === 'admitted' && !!self.standbyCallouts?.length && <section id="callouts" aria-labelledby="wb-callouts-title">
          <h2 id="wb-callouts-title">Oproepen die op jou wachten</h2>
          <p>Een geaccepteerde oproep is nog geen plaatsing. De aannemer controleert de opdracht; een onafhankelijke goedkeurder beslist over de vervanging.</p>
          {self.standbyCallouts.map(callout => <article key={callout.id}>
            <h3>{callout.jobTitle} · {callout.role || callout.snapshot?.role}</h3>
            <p><MapPin size={16} />{callout.city || 'Plaats wordt nog afgestemd'}</p>
            <p><Clock size={16} />{date(callout.snapshot?.scheduledStart)} tot {date(callout.snapshot?.scheduledEnd)}</p>
            <p>Reageren voor {date(callout.expiresAt)}</p>
            {callout.status === 'offered' && <div className="wb-mode-options">
              <button type="button" disabled={busy} onClick={() => act(async () => { await api(`/standby-callouts/${callout.id}/respond`, { decision: 'accept' }); await load(); setNotice('Oproep geaccepteerd. Je bent nog niet geplaatst; de aannemer moet een voorstel indienen en laten goedkeuren.') })}><Check size={17} />Accepteren</button>
              <button type="button" disabled={busy} onClick={() => act(async () => { await api(`/standby-callouts/${callout.id}/respond`, { decision: 'decline' }); await load(); setNotice('Oproep afgewezen.') })}>Afwijzen</button>
            </div>}
            {callout.status !== 'offered' && <p role="status">{callout.status === 'accepted' ? 'Geaccepteerd; wacht op voorstel van de aannemer.' : callout.status === 'pending_approval' ? 'Je reactie is vastgelegd; de vervanging wacht op onafhankelijke goedkeuring.' : callout.status === 'placed' ? 'De vervanging is goedgekeurd. Open je werkpakket voor de actuele opdrachtinformatie.' : callout.status === 'declined' ? 'Afgewezen.' : callout.status === 'expired' ? 'Deze oproep is verlopen.' : 'Deze oproep is ingetrokken.'}</p>}
          </article>)}
        </section>}
        <h2 id="applications">Mijn inschrijvingen</h2>{self.applications.length === 0 ? <p>Nog geen inschrijvingen.</p> : self.applications.map(application => <article key={application.id}><h3>{application.position.title}</h3><p>{application.position.reviewRequired
          ? application.position.reviewReason === 'privacy' ? 'De aannemer controleert de opdrachtinformatie opnieuw. Je hoeft nu niets te doen en kunt niet op deze voorwaarden worden geplaatst.'
            : application.position.reviewReason === 'closed' ? 'De aannemer heeft deze positie gesloten. Je kunt dit aanbod niet meer accepteren.'
              : 'De gekoppelde werkzaamheden zijn gewijzigd. De aannemer controleert de positie opnieuw voordat je hierop kunt worden geplaatst.'
          : application.status === 'assigned' ? 'Geplaatst (intern gepland)' : application.status === 'released' ? 'Plaatsing door de aannemer vrijgegeven' : application.status === 'offer_pending' && Date.parse(application.offer?.expiresAt || 0) <= Date.now() ? 'Het concrete aanbod is verlopen. Je oorspronkelijke belangstelling blijft bewaard; de aannemer kan een nieuw aanbod sturen.' : application.status === 'offer_pending' ? `Je hebt een concreet aanbod. Reageer voor ${date(application.offer.expiresAt)}; er is nog geen plaatsing.` : application.status === 'waitlisted' ? `Op de wachtlijst${application.waitlistPosition ? ` · plek ${application.waitlistPosition}` : ''}. Ververs het werkbord om een vrijgekomen plek te zien.` : application.status === 'withdrawn' ? 'Belangstelling ingetrokken. Je kunt je opnieuw inschrijven zolang de positie open is.' : application.holdReasons?.includes('standby_confirmation_required') ? 'Je beschikbaarheid staat op standby voor deze periode. De aannemer beoordeelt je belangstelling voordat er een plaatsing komt.' : application.holdReason === 'materials_or_source' ? 'Belangstelling ontvangen; plaatsing wacht op gecontroleerde materialen of bijgewerkte opdrachtinformatie.' : 'Belangstelling ontvangen; toelating door de aannemer is nog nodig.'}</p>{!application.position.reviewRequired && <p>{date(application.position.startsAt)} | {application.position.city}</p>}{application.status === 'offer_pending' && !application.position.reviewRequired && Date.parse(application.offer?.expiresAt || 0) > Date.now() && <div className="wb-mode-options"><button type="button" disabled={busy} onClick={() => act(async () => { const result = await api(`/applications/${application.id}/offer/respond`, { decision: 'accept' }); await load(); if (result.application.status === 'assigned') setNotice('Aanbod geaccepteerd en intern gepland. Controleer de startvoorwaarden; dit is geen starttoestemming.') })}><Check size={17} />Aanbod accepteren</button><button type="button" disabled={busy} onClick={() => act(async () => { await api(`/applications/${application.id}/offer/respond`, { decision: 'decline' }); await load(); setNotice('Aanbod geweigerd. Je oorspronkelijke belangstelling of wachtlijstplek blijft behouden.') })}>Weigeren</button></div>}{application.status === 'assigned' && <>
          {application.releaseRequest?.status === 'pending' ? <p role="status">Je verzoek tot vrijgave wacht op beoordeling. Je plaatsing blijft actief tot er een besluit is.</p>
            : application.releaseRequest?.status === 'rejected' ? <p role="status">Je vorige vrijgaveverzoek is afgewezen. Neem contact op met de aannemer als de situatie is veranderd.</p> : null}
          {application.assignmentStatus !== 'released' && application.releaseRequest?.status !== 'pending' && <form aria-label={`Verzoek wijziging ${application.position.title}`} onSubmit={event => {
            event.preventDefault()
            const reasonCategory = event.currentTarget.elements.reasonCategory.value
            void act(async () => {
              await api(`/applications/${application.id}/release-request`, { reasonCategory })
              await load()
              setNotice('Je verzoek is vastgelegd. De plaatsing blijft actief totdat de aannemer het verzoek heeft beoordeeld.')
            })
          }}>
            <p>Kun je onverwacht niet werken? Vraag hier om beoordeling van je plaatsing. Deel geen medische details; een reden is niet verplicht buiten de categorie.</p>
            <label>Reden<select name="reasonCategory" defaultValue="sudden_unavailability">
              <option value="sudden_unavailability">Onverwachte verhindering</option>
              <option value="family_care">Zorg voor gezin of naaste</option>
              <option value="travel_or_site_issue">Reis- of locatieprobleem</option>
              <option value="other">Anders</option>
            </select></label>
            <button type="submit" disabled={busy}>Vrijgave aanvragen</button>
          </form>}
          {application.assignmentStatus !== 'released' && <button disabled={busy} onClick={() => act(async () => setPack((await api(`/positions/${application.positionId}/pack`)).pack))}>Werkpakket openen</button>}
        </>}{['interested', 'waitlisted'].includes(application.status) && <button type="button" disabled={busy} onClick={() => act(async () => { await api(`/applications/${application.id}/withdraw`, {}); await load(); setNotice(application.status === 'waitlisted' ? 'Je wachtlijstplek is ingetrokken.' : 'Je belangstelling is ingetrokken. Een bestaande plaatsing wordt hierdoor niet gewijzigd.') })}>{application.status === 'waitlisted' ? 'Wachtlijst verlaten' : 'Belangstelling intrekken'}</button>}</article>)}
        <h2>Open posities</h2>{positions.length === 0 && <p>Er zijn momenteel geen open posities.</p>}
        {positions.length > 0 && <>
          <div className="wb-position-filters">
            <label>Zoek op opdracht of plaats<input type="search" value={positionSearch} onChange={event => setPositionSearch(event.target.value)} /></label>
            <label>Vakgebied<select value={positionRoleFilter} onChange={event => setPositionRoleFilter(event.target.value)}><option value="">Alle vakgebieden</option>{positionRoles.map(role => <option key={role} value={role}>{role}</option>)}</select></label>
          </div>
          <p role="status">{visiblePositions.length} van {positions.length} open {positions.length === 1 ? 'positie' : 'posities'}</p>
          {visiblePositions.length === 0 && <p>Geen open posities gevonden. Pas je zoekterm of vakgebied aan.</p>}
        </>}
        <div className="wb-positions">{visiblePositions.map(position => {
          const application = self.applications.find(row => row.positionId === position.id)
          const staleWorkPackage = position.workPackageCurrent === false
          const positionCheck = positionChecks[position.id]
          const preferredRegions = accountAcceptsAllRegions ? []
            : Array.isArray(self.account.workRegions) ? self.account.workRegions
              : (self.account.region || '').split(/[;,]/).filter(Boolean)
          const outsidePreferredRegion = !accountAcceptsAllRegions && preferredRegions.length > 0
            && !preferredRegions.some(region => areaKey(region) === areaKey(position.city))
          const positionButtonLabel = application?.status === 'assigned' ? 'Geplaatst' : application?.status === 'offer_pending' ? 'Concreet aanbod ontvangen' : application?.status === 'waitlisted' ? position.filled >= position.capacity ? `Wachtlijst · plek ${application.waitlistPosition || '?'}` : 'Plek vrij · aannemer beoordeelt wachtlijst' : staleWorkPackage ? 'Wacht op herbeoordeling' : positionCheck ? 'Opnieuw controleren' : application?.status === 'interested' && application.holdReasons?.includes('standby_confirmation_required') ? 'Standby, beoordeling vereist' : application?.status === 'interested' && application.holdReason === 'materials_or_source' ? 'In afwachting' : position.filled >= position.capacity ? 'Vol · op wachtlijst' : self.account.status === 'admitted' ? 'Voorwaarden accepteren en inschrijven' : 'Belangstelling aangeven'
          return <article key={position.id}><div className="wb-heading"><h3>{position.title}</h3><span>{position.capacity - position.filled} vrij</span></div><p><MapPin size={16} />{position.city} | {position.role}</p><p><Clock size={16} />{date(position.startsAt)} tot {date(position.endsAt)}</p><p>{position.hours} uur per persoon | {money(position.rate)} / uur excl. btw</p><p>{position.description}</p>{position.requiredSkills?.length > 0 && <p><strong>Aanvullende vaardigheden:</strong> {position.requiredSkills.join(', ')}</p>}{outsidePreferredRegion && <p className="wb-note" role="note">Deze plaats staat niet in je opgegeven werkgebied. Je kunt alsnog belangstelling tonen; reistijd wordt niet berekend.</p>}{position.startReleaseRequired && <p className="wb-note">Voor aanvang is een startvrijgave van de aannemer nodig, die jij daarna in je werkpakket bevestigt.</p>}
            {staleWorkPackage && <p className="wb-note" role="status">De gekoppelde werkzaamheid of het werkpakket is gewijzigd. De aannemer beoordeelt de positie opnieuw; inschrijven kan zodra de bijgewerkte voorwaarden zijn vrijgegeven.</p>}
            {!position.materialsReady && <p className="wb-note" role="status">Materialen of opdrachtbron worden nog gecontroleerd. Je kunt belangstelling tonen; dit maakt nog geen plaatsing.</p>}
            {positionCheck && <div className="wb-note" role="status"><strong>Je kunt deze positie nog niet aanvragen.</strong><ul>{[...positionCheck.blockers, ...positionCheck.advisories].map((item, index) => <li key={`${position.id}-check-${index}`}>{item}</li>)}</ul></div>}
            <details><summary>Benodigdheden en voorwaarden</summary><h4>Materialen</h4><p>{position.materials}</p><h4>Gereedschap</h4><p>{position.equipment}</p><h4>Startvoorwaarden</h4><p>{position.prerequisites}</p></details>
            <fieldset disabled={staleWorkPackage} className="wb-enrollment-action"><legend>Inschrijving op deze positie</legend>
            <button className="wb-primary" disabled={busy || staleWorkPackage || ['offer_pending', 'waitlisted', 'assigned'].includes(application?.status) || (application?.status === 'interested' && self.account.status !== 'admitted' && position.filled < position.capacity)} onClick={() => act(() => enroll(position))}><Check size={17} />{positionButtonLabel}</button>
            </fieldset>
          </article>
        })}</div>
      </>}
    </div>
  </main>
}
import FieldWorkContext from './components/FieldWorkContext'
