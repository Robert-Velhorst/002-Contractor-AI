import { useEffect, useId, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, BookOpen, Camera, CheckCheck, ClipboardList, Download, GraduationCap, HardHat, MapPin, PackageCheck, RefreshCw, Send, WifiOff } from 'lucide-react'
import { operatorText } from '../operator-locale'
import { formatStatus } from '../dashboard-format'
import './FieldWorkPack.css'
import OfflineDownload from '../OfflineDownload'
import FieldWorkContext from './FieldWorkContext'
import { companyFetch } from '../company-request.mjs'

const TABS = [['can', 'Be qualified', GraduationCap], ['know', 'Know', BookOpen], ['have', 'Have', PackageCheck], ['do', 'Do', ClipboardList]]
const SECTION_LABELS = { job: 'Job', assignments: 'Assignments', can: 'Be qualified', know: 'Know', have: 'Have', do: 'Do', checks: 'Checks' }
const REPLY_REFRESH_INTERVAL_MS = 30_000

const START_RELEASE_CHECKS = [
  ['siteConditionsChecked', 'Current site conditions checked'],
  ['methodAndControlsReviewed', 'Work method and controls reviewed'],
  ['requiredPermitsConfirmed', 'Required permits confirmed'],
  ['crewAndQualificationsChecked', 'Crew and qualifications checked'],
  ['equipmentAndPpeAvailable', 'Equipment and PPE available'],
  ['emergencyArrangementsKnown', 'Emergency arrangements known']
]

function localDateTimeInput(value) {
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return ''
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function startReleaseBlockerText(locale, message) {
  const patterns = [
    [/^Safety plan (.+) is not current and ready\.$/, 'Safety plan {plan} is not current and ready.'],
    [/^Worker acknowledgment for safety plan (.+) is missing or unverified\.$/, 'Worker acknowledgement for safety plan {plan} is missing or unverified.'],
    [/^Linked permit for safety plan (.+) is not ready or acknowledged\.$/, 'Linked permit for safety plan {plan} is not ready or acknowledged.'],
    [/^A current positive on-site LMRA is required for safety plan (.+)\.$/, 'A current positive on-site LMRA is required for safety plan {plan}.']
  ]
  for (const [pattern, key] of patterns) {
    const match = message.match(pattern)
    if (match) return operatorText(locale, key, { plan: match[1] })
  }
  return operatorText(locale, message)
}

function WorkPackDetail({ api, jobId, canRespond, canIssueStartRelease, locale, onOpenJob, onCapture, refreshKey, pollIntervalMs }) {
  const t = (key, values) => operatorText(locale, key, values)
  const id = useId()
  const [workerId, setWorkerId] = useState('')
  const [result, setResult] = useState(null)
  const [tab, setTab] = useState('do')
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [downloadingSheetId, setDownloadingSheetId] = useState('')
  const [downloadingSubmittalId, setDownloadingSubmittalId] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [question, setQuestion] = useState('')
  const [progressTaskId, setProgressTaskId] = useState('')
  const [progressStatus, setProgressStatus] = useState('in_progress')
  const [progressPercent, setProgressPercent] = useState('0')
  const [progressNote, setProgressNote] = useState('')
  const [equipmentConcernReservationId, setEquipmentConcernReservationId] = useState('')
  const [equipmentConcernType, setEquipmentConcernType] = useState('malfunction')
  const [releaseAssignmentId, setReleaseAssignmentId] = useState('')
  const [releaseReason, setReleaseReason] = useState('')
  const [releaseEvidence, setReleaseEvidence] = useState('')
  const [releaseExpiresAt, setReleaseExpiresAt] = useState('')
  const [releaseChecks, setReleaseChecks] = useState([])
  const [releaseUnderstood, setReleaseUnderstood] = useState({})
  const [releaseStopReason, setReleaseStopReason] = useState({})
  const [siteReceiptDrafts, setSiteReceiptDrafts] = useState({})
  const [message, setMessage] = useState('')
  const [online, setOnline] = useState(() => navigator.onLine)
  const entryKeys = useRef({})
  const locked = useRef(false)
  const mounted = useRef(true)
  const polling = useRef(false)
  const resultRef = useRef(null)
  useEffect(() => { resultRef.current = result }, [result])
  useEffect(() => {
    const assignments = result?.pack?.assignments || []
    if (!assignments.some(item => item.id === releaseAssignmentId) && assignments[0]) setReleaseAssignmentId(assignments[0].id)
    if (!releaseExpiresAt && assignments[0]) {
      const shiftEnd = Date.parse(assignments[0].scheduledEnd || result.pack.job.scheduledEnd || '')
      const suggested = Math.min(Date.now() + 4 * 60 * 60 * 1000, Number.isFinite(shiftEnd) ? shiftEnd : Date.now())
      setReleaseExpiresAt(localDateTimeInput(suggested))
    }
  }, [result, releaseAssignmentId, releaseExpiresAt])
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    return () => { window.removeEventListener('online', update); window.removeEventListener('offline', update) }
  }, [])
  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    setUnderstood(false)
    api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/work-pack${workerId ? `?workerId=${encodeURIComponent(workerId)}` : ''}`).then(data => {
      if (!current) return
      setResult(data)
    }).catch(reason => { if (current) setError(reason.message) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api, jobId, workerId, revision, refreshKey])
  useEffect(() => {
    if (!canRespond || !online) return undefined
    let active = true
    const pollReplies = async () => {
      if (polling.current || document.visibilityState === 'hidden') return
      polling.current = true
      try {
        const fresh = await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/work-pack/replies`)
        if (!active || !Array.isArray(fresh?.questions)) return
        const currentQuestions = resultRef.current?.pack?.questions || []
        const answeredIds = new Set(currentQuestions.filter(item => item.replyStatus === 'answered').map(item => item.id))
        const questions = fresh.questions
        const newReplies = questions.filter(item => item.replyStatus === 'answered' && !answeredIds.has(item.id))
        if (newReplies.length) setMessage(newReplies.length === 1 ? 'A new approved office reply is available.' : 'New approved office replies are available.')
        setResult(current => current?.pack ? { ...current, pack: { ...current.pack, questions } } : current)
      } catch {
        // Keep the last verified pack visible; manual refresh reports actionable errors.
      } finally {
        polling.current = false
      }
    }
    const timer = window.setInterval(() => { void pollReplies() }, pollIntervalMs || REPLY_REFRESH_INTERVAL_MS)
    return () => { active = false; window.clearInterval(timer) }
  }, [api, canRespond, jobId, online, pollIntervalMs])
  const pack = result?.pack
  const progressTasks = pack?.do.filter(task => !task.supervisingOnly && ['open', 'in_progress', 'blocked'].includes(task.status)) || []
  const selectedProgressTaskId = progressTasks.some(task => task.id === progressTaskId) ? progressTaskId : progressTasks[0]?.id || ''
  const heldEquipmentForTask = pack?.have?.equipment.filter(item => item.taskId === selectedProgressTaskId
    && item.custody?.status === 'checked_out' && item.custody.heldByYou) || []
  const selectedTaskReleaseAssignments = pack?.assignments?.filter(assignment => assignment.startReleaseRequired
    && assignment.workBoardTaskIds?.includes(selectedProgressTaskId)) || []
  const selectedTaskReleaseActive = selectedTaskReleaseAssignments.length > 0
    && selectedTaskReleaseAssignments.every(assignment => assignment.startRelease?.permissionToStart === true)
  const startReleaseBlocksProgress = selectedTaskReleaseAssignments.length > 0 && !selectedTaskReleaseActive
  const location = [pack?.job.address, pack?.job.city].filter(Boolean).join(', ')
    || pack?.know.workContext?.places.filter(place => place.type === 'site' && !place.archived).map(place => [place.name, place.address].filter(Boolean).join(', ')).join(' / ')
  async function retain(kind) {
    if (locked.current || !canRespond || !online || !pack || loading || error) return
    if (kind === 'acknowledgments' && !understood) return
    const body = { sourceHash: pack.sourceHash, ...(kind === 'questions' ? { message: question.trim() }
      : kind === 'progress' ? { taskId: selectedProgressTaskId, status: progressStatus,
        progressPercent: Number(progressPercent), note: progressNote.trim(),
        ...(equipmentConcernReservationId && progressStatus === 'blocked' ? { equipmentIssue: {
          reservationId: equipmentConcernReservationId, issueType: equipmentConcernType, note: progressNote.trim()
        } } : {}) }
        : { understood: true }) }
    const signature = JSON.stringify(body)
    if (entryKeys.current[kind]?.signature !== signature) entryKeys.current[kind] = { signature, key: crypto.randomUUID() }
    locked.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/work-pack/${kind}`, { method: 'POST', body: JSON.stringify({ ...body, entryKey: entryKeys.current[kind].key }) })
      if (!mounted.current) return
      setMessage(kind === 'questions' ? 'Question retained for office review.' : kind === 'progress'
        ? equipmentConcernReservationId && progressStatus === 'blocked'
          ? 'Equipment has been put on hold and the task blocker sent to the office. An inspection is still required.'
          : 'Task update sent for office review.' : 'Read confirmation retained. This is not safety clearance.')
      if (kind === 'questions') setQuestion('')
      if (kind === 'progress') { setProgressNote(''); setEquipmentConcernReservationId('') }
      setRevision(value => value + 1)
    } catch (reason) { if (mounted.current) setError(reason.message) }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  async function downloadSafetySheet(sheet) {
    if (!pack || !sheet?.file || downloadingSheetId) return
    setDownloadingSheetId(sheet.id)
    setError('')
    try {
      const { base64ToBytes, downloadSafetyDataSheetFiles } = await import('../offline-drawings.mjs')
      const [file] = await downloadSafetyDataSheetFiles({ job: pack.job, sourceHash: pack.sourceHash, know: { sdsSheets: [sheet] } }, companyFetch)
      if (!file) throw new Error('The approved safety data sheet PDF is unavailable.')
      const url = URL.createObjectURL(new Blob([base64ToBytes(file.base64)], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.download = file.filename || 'safety-data-sheet.pdf'
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('Verified safety data sheet downloaded.')
    } catch (reason) { setError(reason.message) }
    finally { setDownloadingSheetId('') }
  }
  async function downloadSubmittal(submittal, attachment) {
    if (!pack || !attachment || downloadingSubmittalId) return
    setDownloadingSubmittalId(`${submittal.id}:${attachment.id}`)
    setError('')
    try {
      const { base64ToBytes, downloadSubmittalFiles } = await import('../offline-drawings.mjs')
      const [file] = await downloadSubmittalFiles({ job: pack.job, sourceHash: pack.sourceHash,
        know: { submittals: [{ ...submittal, attachments: [attachment] }] } }, companyFetch)
      if (!file) throw new Error('The approved submittal PDF is unavailable.')
      const url = URL.createObjectURL(new Blob([base64ToBytes(file.base64)], { type: 'application/pdf' }))
      const link = document.createElement('a')
      link.href = url
      link.download = file.filename || 'submittal.pdf'
      document.body.append(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      setMessage('Verified approved submittal downloaded.')
    } catch (reason) { setError(reason.message) }
    finally { setDownloadingSubmittalId('') }
  }
  async function receiveSiteIssue(issue, event) {
    event.preventDefault()
    if (locked.current || !canRespond || !online || !pack || loading || error) return
    const fields = new FormData(event.currentTarget)
    const body = { sourceHash: pack.sourceHash, receivedQuantity: Number(fields.get('receivedQuantity')),
      acceptedQuantity: Number(fields.get('acceptedQuantity')), damagedQuantity: Number(fields.get('damagedQuantity') || 0),
      receiptReference: String(fields.get('receiptReference') || '').trim(), evidenceReference: String(fields.get('evidenceReference') || '').trim(),
      location: String(fields.get('location') || '').trim() }
    if (body.acceptedQuantity + body.damagedQuantity > body.receivedQuantity + 0.000001) {
      setError(t('Accepted and damaged quantities cannot exceed the quantity received.'))
      return
    }
    const kind = `site-receipt:${issue.id}`, signature = JSON.stringify(body)
    if (entryKeys.current[kind]?.signature !== signature) entryKeys.current[kind] = { signature, key: crypto.randomUUID() }
    locked.current = true; setBusy(true); setError(''); setMessage('')
    try {
      await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/material-stock-site-issues/${encodeURIComponent(issue.id)}/receipts`, {
        method: 'POST', body: JSON.stringify({ ...body, entryKey: entryKeys.current[kind].key })
      })
      if (!mounted.current) return
      delete entryKeys.current[kind]
      setSiteReceiptDrafts(current => { const next = { ...current }; delete next[issue.id]; return next })
      setMessage('Material arrival recorded for office review.')
      setRevision(value => value + 1)
    } catch (reason) { if (mounted.current) setError(reason.message) }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  async function sendStartRelease(event) {
    event.preventDefault()
    if (!canIssueStartRelease || !online || busy || !pack) return
    const body = {
      workerId: pack.worker.id, assignmentId: releaseAssignmentId, sourceHash: pack.sourceHash,
      reason: releaseReason.trim(), evidenceReference: releaseEvidence.trim(), checks: releaseChecks,
      expiresAt: new Date(releaseExpiresAt).toISOString()
    }
    const signature = JSON.stringify(body)
    if (entryKeys.current.startRelease?.signature !== signature) entryKeys.current.startRelease = { signature, key: crypto.randomUUID() }
    locked.current = true; setBusy(true); setError(''); setMessage('')
    try {
      await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/work-pack/start-release`, {
        method: 'POST', body: JSON.stringify({ ...body, entryKey: entryKeys.current.startRelease.key })
      })
      if (!mounted.current) return
      setMessage('Supervisor release issued. The worker must confirm receipt.')
      setReleaseReason(''); setReleaseEvidence(''); setReleaseChecks([])
      setRevision(value => value + 1)
    } catch (reason) { if (mounted.current) setError(reason.message) }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  async function acknowledgeStartRelease(release) {
    if (!canRespond || !online || busy || !release?.id || !releaseUnderstood[release.id]) return
    const body = { releaseId: release.id, sourceHash: pack.sourceHash, understood: true }
    const entryKeyName = `startReleaseAcknowledgment:${release.id}`
    if (!entryKeys.current[entryKeyName]) entryKeys.current[entryKeyName] = { key: crypto.randomUUID() }
    locked.current = true; setBusy(true); setError(''); setMessage('')
    try {
      await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/work-pack/start-release/acknowledgment`, {
        method: 'POST', body: JSON.stringify({ ...body, entryKey: entryKeys.current[entryKeyName].key })
      })
      if (!mounted.current) return
      setMessage('Supervisor release receipt confirmed. Stop and contact the supervisor if conditions differ.')
      setReleaseUnderstood(current => ({ ...current, [release.id]: false })); setRevision(value => value + 1)
    } catch (reason) { if (mounted.current) setError(reason.message) }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  async function stopStartRelease(event, release) {
    event.preventDefault()
    const reason = releaseStopReason[release?.id] || ''
    if (!online || busy || !release?.id || reason.trim().length < 3) return
    const body = { releaseId: release.id, reason: reason.trim(), ...(canRespond ? {} : { workerId: pack.worker.id }) }
    const signature = JSON.stringify(body)
    const entryKeyName = `startReleaseStop:${release.id}`
    if (entryKeys.current[entryKeyName]?.signature !== signature) entryKeys.current[entryKeyName] = { signature, key: crypto.randomUUID() }
    locked.current = true; setBusy(true); setError(''); setMessage('')
    try {
      await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/work-pack/start-release/revoke`, {
        method: 'POST', body: JSON.stringify({ ...body, entryKey: entryKeys.current[entryKeyName].key })
      })
      if (!mounted.current) return
      setMessage('Start release stopped and retained for review.')
      setReleaseStopReason(current => ({ ...current, [release.id]: '' })); setRevision(value => value + 1)
    } catch (reason) { if (mounted.current) setError(reason.message) }
    finally { locked.current = false; if (mounted.current) setBusy(false) }
  }
  const date = value => value && Number.isFinite(Date.parse(value)) ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : t('Not scheduled')
  const status = value => t(formatStatus(value))
  const empty = label => <p className="work-pack-empty">{t(label)}</p>
  const selectedReleaseEligibility = pack?.startReleaseEligibility?.find(item => item.assignmentId === releaseAssignmentId)
  const selectedRelease = pack?.assignments?.find(item => item.id === releaseAssignmentId)?.startRelease
  return <div className="work-pack-detail">
    {!canRespond && result?.workers?.length ? <label className="work-pack-worker">{t('Preview for worker')}<select value={workerId} disabled={busy} onChange={event => { setWorkerId(event.target.value); setMessage(''); setQuestion('') }}><option value="">{t('Select worker')}</option>{result.workers.map(worker => <option key={worker.id} value={worker.id}>{worker.name}</option>)}</select></label> : null}
    {!online ? <p className="work-pack-warning" role="status"><WifiOff size={18} />{t('Offline. Read confirmations, questions and task updates require a connection.')}</p> : null}
    {loading ? <p role="status">{t('Loading work pack...')}</p> : null}
    {message ? <p role="status">{t(message)}</p> : null}
    {error ? <div role="alert"><p>{error}</p><button className="secondary-button" type="button" disabled={busy} onClick={() => setRevision(value => value + 1)}>{t('Retry')}</button></div> : null}
    {!loading && !error && !pack ? empty(result?.workers?.length ? 'Select a worker to preview their work pack.' : 'No active named-worker assignment.') : null}
    {!loading && !error && pack ? <>
      <header><div><h3>{pack.job.title}</h3><p><MapPin size={16} />{location || t('Location missing')}</p></div><button type="button" className="icon-button" title={t('Refresh work pack')} aria-label={t('Refresh work pack')} disabled={busy} onClick={() => setRevision(value => value + 1)}><RefreshCw size={18} /></button></header>
      <div className="work-pack-summary"><span>{pack.worker.name}</span><span>{t('Project schedule')}: {date(pack.job.scheduledStart)}</span><span>{t('Version')} {pack.sourceHash.slice(0, 10)}</span></div>
      <section className="work-pack-shifts" aria-label={t('My scheduled shifts')}>
        <h4>{t('My scheduled shifts')}</h4>
        {pack.assignments?.length ? <ul>{pack.assignments.map(assignment => <li key={assignment.id}>
          <strong>{assignment.role || t('Assigned work')}</strong>
          <span>{date(assignment.scheduledStart)} - {date(assignment.scheduledEnd)}</span>
          {Number(assignment.allocationHours) > 0 ? <span>{t('{hours} allocated hours', { hours: assignment.allocationHours })}</span> : null}
          {assignment.startReleaseRequired ? <span>{t('Supervisor start release')}: {status(assignment.startRelease?.status || 'not_issued')}</span> : null}
        </li>)}</ul> : empty('No shift times recorded. Contact the office before travelling to site.')}
      </section>
      {pack.planningReadiness ? <section className={`work-pack-readiness work-pack-readiness-${pack.planningReadiness.status}`} aria-label={t('Work planning readiness')}>
        <div><h4>{t('Work planning readiness')}</h4><strong>{status(pack.planningReadiness.status)}</strong></div>
        <p>{t('{blockers} blockers, {missing} missing items, {warnings} warnings', {
          blockers: pack.planningReadiness.blockerCount, missing: pack.planningReadiness.missingCount, warnings: pack.planningReadiness.warningCount
        })}</p>
        <small>{t('Checked')}: {date(pack.planningReadiness.checkedAt)}</small>
        <p className="work-pack-warning">{t('Planning status only. It is not permission to start; follow the supervisor and site release process.')}</p>
      </section> : null}
      <section className={`work-pack-start-release work-pack-start-release-${pack.startRelease?.status || 'not_issued'}`} aria-label={t('Supervisor start release')}>
        <h4>{t('Supervisor start release')}: {status(pack.startRelease?.status || 'not_issued')}</h4>
        {pack.startRelease?.permissionToStart ? <p className="work-pack-read">{t('The current supervisor release is active for this shift until {time}.', { time: date(pack.startRelease.expiresAt) })}</p> : null}
        {pack.startRelease?.status === 'awaiting_worker' ? <p>{t('A current supervisor release is waiting for your receipt confirmation.')}</p> : null}
        {pack.startRelease?.reason ? <p>{t('Supervisor note')}: {pack.startRelease.reason}</p> : null}
        {(canIssueStartRelease && selectedReleaseEligibility?.blockers?.length ? selectedReleaseEligibility.blockers : pack.startRelease?.blockers || []).length ? <ul>{(canIssueStartRelease && selectedReleaseEligibility?.blockers?.length ? selectedReleaseEligibility.blockers : pack.startRelease.blockers).map((item, index) => <li className="work-pack-warning" key={`release-blocker-${index}`}>{startReleaseBlockerText(locale, item)}</li>)}</ul> : null}
        {pack.startReleaseEligibility?.length && !pack.startRelease?.permissionToStart ? <p>{t('Start release requires a current read confirmation, fully ready planning, current assignment-linked safety records and a positive on-site LMRA.')}</p> : null}
        {canIssueStartRelease && !['active', 'awaiting_worker'].includes(selectedRelease?.status) ? <form className="work-pack-start-release-form" onSubmit={event => void sendStartRelease(event)}>
          <label>{t('Worker assignment')}<select value={releaseAssignmentId} required disabled={busy || !online} onChange={event => setReleaseAssignmentId(event.target.value)}>
            {pack.assignments.map(assignment => <option key={assignment.id} value={assignment.id}>{assignment.role || t('Assigned work')} · {date(assignment.scheduledStart)}</option>)}
          </select></label>
          <fieldset><legend>{t('Supervisor confirms these checks')}</legend>{START_RELEASE_CHECKS.map(([key, label]) => <label className="work-pack-check" key={key}>
            <input type="checkbox" checked={releaseChecks.includes(key)} disabled={busy || !online} onChange={event => setReleaseChecks(current => event.target.checked ? [...current, key] : current.filter(item => item !== key))} />{t(label)}
          </label>)}</fieldset>
          <label>{t('Reason for release')}<textarea required minLength={5} maxLength={1000} value={releaseReason} disabled={busy || !online} onChange={event => setReleaseReason(event.target.value)} /></label>
          <label>{t('Site check or briefing reference')}<input required minLength={3} maxLength={240} value={releaseEvidence} disabled={busy || !online} onChange={event => setReleaseEvidence(event.target.value)} /></label>
          <label>{t('Release expires at')}<input type="datetime-local" required value={releaseExpiresAt} disabled={busy || !online} onChange={event => setReleaseExpiresAt(event.target.value)} /></label>
          <button type="submit" className="secondary-button" disabled={busy || !online || !selectedReleaseEligibility?.eligible || releaseChecks.length !== START_RELEASE_CHECKS.length || releaseReason.trim().length < 5 || releaseEvidence.trim().length < 3 || !releaseAssignmentId}><CheckCheck size={17} />{t('Issue supervisor release')}</button>
        </form> : null}
        {canRespond ? pack.assignments.filter(assignment => assignment.startRelease?.status === 'awaiting_worker').map(assignment => <div className="work-pack-start-release-confirm" key={`confirm-${assignment.startRelease.id}`}>
          <strong>{assignment.role || t('Assigned work')} · {date(assignment.scheduledStart)}</strong>
          {assignment.startRelease.reason ? <p>{t('Supervisor note')}: {assignment.startRelease.reason}</p> : null}
          <label className="work-pack-check"><input type="checkbox" checked={Boolean(releaseUnderstood[assignment.startRelease.id])} disabled={busy || !online} onChange={event => setReleaseUnderstood(current => ({ ...current, [assignment.startRelease.id]: event.target.checked }))} />{t('I received this release and will stop if site conditions or controls differ.')}</label>
          <button type="button" className="secondary-button" disabled={busy || !online || !releaseUnderstood[assignment.startRelease.id]} onClick={() => void acknowledgeStartRelease(assignment.startRelease)}><CheckCheck size={17} />{t('Confirm release received')}</button>
        </div>) : null}
        {pack.assignments.filter(assignment => assignment.startRelease?.id && (['active', 'awaiting_worker'].includes(assignment.startRelease.status)
          || canRespond && ['not_ready', 'outdated', 'expired'].includes(assignment.startRelease.status))).map(assignment => {
          const release = assignment.startRelease
          const reason = releaseStopReason[release.id] || ''
          return <form className="work-pack-start-release-stop" key={`stop-${release.id}`} onSubmit={event => void stopStartRelease(event, release)}>
            <strong>{assignment.role || t('Assigned work')} · {date(assignment.scheduledStart)} · {status(release.status)}</strong>
            <label>{t(canRespond ? (release.status === 'awaiting_worker' ? 'Decline release or report a changed condition' : 'Stop work: reason or changed condition') : 'Revoke release: reason')}<textarea required minLength={3} maxLength={1000} value={reason} disabled={busy || !online} onChange={event => setReleaseStopReason(current => ({ ...current, [release.id]: event.target.value }))} /></label>
            <button type="submit" className="secondary-button" disabled={busy || !online || reason.trim().length < 3}>{t(canRespond ? (release.status === 'awaiting_worker' ? 'Decline release and notify office' : 'Stop and notify office') : 'Revoke start release')}</button>
          </form>
        })}
        <p className="work-pack-warning">{t('A release records a human decision only. It never overrides law, permits, site rules, changed conditions or a worker stop.')}</p>
      </section>
      {pack.acknowledgment ? <p className={pack.acknowledgment.current ? 'work-pack-read' : 'work-pack-warning'}>{t(pack.acknowledgment.current ? 'This version has been read.' : 'Work pack changed since your last read confirmation.')}{!pack.acknowledgment.current ? ` ${pack.changedSections.map(key => t(SECTION_LABELS[key])).join(', ')}` : ''}</p> : null}
      <div className="work-pack-tabs" role="tablist" aria-label={t('Work-pack sections')}>
        {TABS.map(([key, label, Icon], index) => <button type="button" role="tab" id={`${id}-${key}`} aria-controls={`${id}-panel`} aria-selected={tab === key} tabIndex={tab === key ? 0 : -1} key={key} onClick={() => setTab(key)} onKeyDown={event => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const next = event.key === 'Home' ? 0 : event.key === 'End' ? 3 : (index + (event.key === 'ArrowRight' ? 1 : 3)) % 4
          setTab(TABS[next][0]); document.getElementById(`${id}-${TABS[next][0]}`)?.focus()
        }}><Icon size={20} /><span>{t(label)}</span></button>)}
      </div>
      <div role="tabpanel" id={`${id}-panel`} aria-labelledby={`${id}-${tab}`} className="work-pack-panel" tabIndex={0}>
        {tab === 'can' ? <>
          <h4>{t('Required qualifications')}</h4>
          {pack.can.length ? <ul>{pack.can.map(item => <li key={item.id}><strong>{item.title}</strong><span className={['missing', 'expired', 'integrity_failed', 'pending_approval'].includes(item.status) ? 'work-pack-warning' : ''}>{status(item.status)}{item.mandatory ? `; ${t('Required')}` : ''}</span>{item.expiresOn ? <small>{t('Expires')}: {item.expiresOn}</small> : null}</li>)}</ul> : empty('No qualification requirements recorded. Confirm the job requirements.')}
        </> : null}
        {tab === 'know' ? <>
          <h4>{t('Work description')}</h4><p>{pack.job.description || t('No work description recorded.')}</p>
          {pack.know.scopeChangeReviewRequired?.length ? <p className="work-pack-warning" role="alert">{t('Accepted scope change needs office review. Pause changed work pending review.')}</p> : null}
          {pack.know.scopeChanges?.length ? <>
            <h4>{t('Accepted scope changes')}</h4>
            <ul>{pack.know.scopeChanges.map(change => <li key={change.id}>
              <strong>{change.variationNumber} R{change.revisionNumber}: {change.title}</strong>
              <p className="work-pack-verbatim">{change.scope}</p>
              {change.acceptedAt ? <small>{t('Client accepted')}: {date(change.acceptedAt)}</small> : null}
            </li>)}</ul>
            <p>{t('Scope context only. Tasks, materials and dates stay separate; ask the office if plans differ.')}</p>
          </> : null}
          <FieldWorkContext context={pack.know.workContext} />
          {pack.know.recoveryInstructions?.length ? <section aria-label={t('Updated task instructions')}>
            <h4>{t('Updated task instructions')}</h4>
            {pack.know.recoveryInstructions.map(instruction => <article className="work-pack-safety-record" key={instruction.id}>
              <strong>{pack.do.find(task => task.id === instruction.taskId)?.title || t('Assigned work')}</strong>
              <p className="work-pack-verbatim">{instruction.text}</p>
              <small>{t('Issued by office')}: {date(instruction.recordedAt)}</small>
            </article>)}
            <p className="work-pack-warning">{t('These instructions do not release a permit, safety hold or work stop.')}</p>
          </section> : null}
          {pack.know.clientUpdates?.length ? <section aria-label={t('Approved client updates')}>
            <h4>{t('Approved client updates')}</h4>
            {pack.know.clientUpdates.map((update, index) => <article className="work-pack-safety-record" key={`${update.title}:${update.answeredAt}:${index}`}>
              <strong>{update.title}</strong>
              {update.taskTitles.length ? <p>{t('Applies to')}: {update.taskTitles.join('; ')}</p> : null}
              <p className="work-pack-verbatim">{update.response}</p>
              <small>{t('Office-reviewed answer')}: {date(update.answeredAt)}</small>
            </article>)}
            <p className="work-pack-warning">{t('This answer does not itself change task scope, dates, safety controls or permission to start. Check the current work pack and ask the office if it conflicts with site conditions.')}</p>
          </section> : null}
          <h4>{t('Approved submittals')}</h4>{pack.know.submittals?.length ? pack.know.submittals.map(submittal => <article className="work-pack-safety-record" key={submittal.id}>
            <h5>{submittal.title}{submittal.packageName ? ` · ${submittal.packageName}` : ''}</h5>
            <p>{t(submittal.taskScope === 'tasks' ? 'Applies to your assigned tasks' : 'Applies to the whole job')}{submittal.taskIds?.length ? `: ${submittal.taskIds.map(taskId => pack.do.find(task => task.id === taskId)?.title).filter(Boolean).join('; ')}` : ''}</p>
            {submittal.attachments.length ? submittal.attachments.map(file => <p key={file.id}><strong>{file.filename}</strong> · {(file.sizeBytes / 1024 / 1024).toFixed(1)} MB <button type="button" className="secondary-button" disabled={Boolean(downloadingSubmittalId)} onClick={() => void downloadSubmittal(submittal, file)}>
              <Download size={17} />{t(downloadingSubmittalId === `${submittal.id}:${file.id}` ? 'Downloading approved submittal...' : 'Download approved submittal PDF')}
            </button></p>) : <p>{t('No verified PDF attachment is available.')}</p>}
            <p>{t('Approved technical information only. It does not change your task, price, dates or permission to start.')}</p>
          </article>) : empty('No approved submittals apply to this work pack.')}
          <section className="work-pack-safety-review" aria-label={t('Daily shift briefing')}>
            <h4>{t('Daily shift briefing')}</h4>
            {pack.assignments?.some(assignment => assignment.dailyBriefing?.status === 'ready') ? pack.assignments.filter(assignment => assignment.dailyBriefing?.status === 'ready').map(assignment => {
              const briefing = assignment.dailyBriefing
              return <article className="work-pack-safety-record" key={briefing.cycleId}>
                <h5>{assignment.role || t('Assigned work')} · {briefing.workDate}{briefing.shiftLabel ? ` · ${briefing.shiftLabel}` : ''}</h5>
                <p><strong>{t('Planned work')}:</strong> {briefing.plannedWork}</p>
                <p><strong>{t('Production target')}:</strong> {briefing.productionTarget}</p>
                {briefing.weather ? <p><strong>{t('Weather')}:</strong> {briefing.weather}</p> : null}
                {briefing.siteConditions ? <p><strong>{t('Site conditions')}:</strong> {briefing.siteConditions}</p> : null}
                <p><strong>{t('Safety focus')}:</strong> {briefing.safetyFocus}</p>
                {briefing.qualityHoldPoints?.length ? <p><strong>{t('Quality hold points')}:</strong> {briefing.qualityHoldPoints.join('; ')}</p> : null}
                {briefing.constraints?.length ? <p><strong>{t('Constraints')}:</strong> {briefing.constraints.join('; ')}</p> : null}
                <small>{t('Briefing reference')}: {briefing.evidenceReference}</small>
              </article>
            }) : null}
            {pack.assignments?.some(assignment => ['crew_update_required', 'needs_review'].includes(assignment.dailyBriefing?.status))
              ? <p className="work-pack-warning">{t('The retained start huddle does not cover this exact worker shift. Ask the site lead to brief the current crew and retain an updated huddle before starting.')}</p>
              : null}
            {pack.assignments?.every(assignment => ['not_recorded', undefined].includes(assignment.dailyBriefing?.status))
              ? <p className="work-pack-warning">{t('No start huddle is recorded for this shift yet.')}</p> : null}
          </section>
          <h4>{t('Released instructions')}</h4>{pack.know.instructions.length ? <ul>{pack.know.instructions.map(item => <li key={item.id}><strong>{item.title}</strong><p className="work-pack-verbatim">{item.body}</p></li>)}</ul> : empty('No released personal instructions recorded.')}
          <h4>{t('Current drawings')}</h4>{pack.know.drawings.length ? <ul>{pack.know.drawings.map(item => <li key={item.id}><strong>{item.title}</strong><span>{item.documentNumber} / {item.revision}</span></li>)}</ul> : empty('No current drawings recorded.')}
          <h4>{t('Current safety data sheets')}</h4>{pack.know.sdsSheets?.length ? pack.know.sdsSheets.map(sheet => <article className="work-pack-safety-record" key={sheet.id}>
            <h5>{sheet.material}{sheet.manufacturer ? ` · ${sheet.manufacturer}` : ''}{sheet.productCode ? ` · ${sheet.productCode}` : ''}</h5>
            {sheet.linkedMaterials?.length ? <p><strong>{t('Linked job materials')}:</strong> {sheet.linkedMaterials.map(item => item.name).join('; ')}</p> : null}
            {sheet.hazardClasses.length ? <p className="work-pack-warning"><strong>{t('Hazard classes')}:</strong> {sheet.hazardClasses.join('; ')}</p> : null}
            {sheet.requiredPpe.length ? <p><strong>{t('Required PPE')}:</strong> {sheet.requiredPpe.join('; ')}</p> : null}
            {sheet.firstAidMeasures ? <p><strong>{t('First-aid measures')}:</strong> {sheet.firstAidMeasures}</p> : null}
            {sheet.fireMeasures ? <p><strong>{t('Fire measures')}:</strong> {sheet.fireMeasures}</p> : null}
            {sheet.handlingStorage ? <p><strong>{t('Handling and storage')}:</strong> {sheet.handlingStorage}</p> : null}
            {sheet.spillResponse ? <p><strong>{t('Spill response')}:</strong> {sheet.spillResponse}</p> : null}
            {sheet.disposal ? <p><strong>{t('Disposal')}:</strong> {sheet.disposal}</p> : null}
            {sheet.emergencyContact ? <p><strong>{t('Emergency contact')}:</strong> {sheet.emergencyContact}</p> : null}
            <small>{t('Revision')} {sheet.revisionNumber} · {t('Expires')}: {date(sheet.expiresAt)}</small>
            {sheet.file ? <button type="button" className="secondary-button" disabled={Boolean(downloadingSheetId)} onClick={() => void downloadSafetySheet(sheet)}>
              <Download size={17} />{t(downloadingSheetId === sheet.id ? 'Downloading safety data sheet...' : 'Download approved safety data sheet PDF')}
            </button> : <p>{t('Approved PDF is not available for offline download.')}</p>}
          </article>) : empty('No current approved safety data sheets recorded.')}
          {pack.know.sdsReadiness?.items?.length ? <section className="work-pack-safety-review" aria-label={t('Material SDS readiness')}>
            <h4>{t('Material SDS applicability')}</h4>
            {pack.know.sdsReadiness.items.map(item => <p key={item.materialRequirementId} className={item.ready ? '' : 'work-pack-warning'}>
              <strong>{item.material}:</strong> {t(item.requirement === 'required' ? (item.ready ? 'Current SDS and safety-plan link verified' : !item.sheetIds.length ? 'Required SDS unavailable' : 'Required SDS missing from the safety plan') : item.requirement === 'not_required' ? 'Recorded as not required' : 'Applicability not reviewed')}
            </p>)}
          </section> : null}
          <section className="work-pack-safety-review" aria-label={t('Safety dossier review')}>
            <h4>{t('Safety dossier for review')}</h4>
            <p className="work-pack-warning">{t(pack.know.safetyReview?.notice || 'Dossier information only. This is not permission to start or a safety release.')}</p>
            {pack.know.jhaApplicability?.length ? <section aria-label={t('Task JHA applicability')}>
              <h5>{t('Task JHA applicability')}</h5>
              {pack.know.jhaApplicability.map(item => <p key={item.taskId}>
                <strong>{item.title}:</strong> {t(item.status === 'required' ? 'A task-specific JHA is required.' : item.status === 'not_required' ? 'A JHA was reviewed as not required.' : 'Task JHA applicability requires office review.')}
              </p>)}
            </section> : null}
            <h5>{t('Approved job hazard analyses')}</h5>
            {pack.know.jhas?.length ? pack.know.jhas.map(jha => <article className="work-pack-safety-record" key={jha.id}>
              <h6>{jha.title}</h6>
              <p>{t('Risk level')}: {status(jha.riskLevel)}{jha.dueAt ? ` · ${t('Due')}: ${date(jha.dueAt)}` : ''}</p>
              {jha.linkedTaskIds?.length ? <p><strong>{t('Linked tasks')}:</strong> {jha.linkedTaskIds.map(id => pack.do.find(task => task.id === id)?.title).filter(Boolean).join('; ')}</p> : null}
              {jha.workMethod ? <p><strong>{t('Work method')}:</strong> {jha.workMethod}</p> : null}
              {jha.hazards?.length ? <p className="work-pack-warning"><strong>{t('Hazards')}:</strong> {jha.hazards.join('; ')}</p> : null}
              {jha.controls?.length ? <p><strong>{t('Controls')}:</strong> {jha.controls.join('; ')}</p> : null}
              {jha.ppe?.length ? <p><strong>{t('Required PPE')}:</strong> {jha.ppe.join('; ')}</p> : null}
              {jha.stopWorkTriggers?.length ? <p className="work-pack-warning"><strong>{t('Stop-work triggers')}:</strong> {jha.stopWorkTriggers.join('; ')}</p> : null}
            </article>) : empty('No approved JHA is linked to the tasks in this work pack. Check with the office before relying on other job records.')}
            {pack.know.safetyPlans?.length ? pack.know.safetyPlans.map(plan => <article className="work-pack-safety-record" key={plan.id}>
              <h5>{plan.planNumber} R{plan.revisionNumber}: {plan.title}</h5>
              <p>{plan.workDate}{plan.shiftLabel ? ` · ${plan.shiftLabel}` : ''} · {plan.location}</p>
              <p>{t('Record status')}: {status(plan.status)} · {t('Integrity')}: {plan.definitionIntegrityValid ? t('Verified') : t('Needs review')} · {t('Linked sources')}: {plan.prerequisitesCurrent ? t('Current') : t('Changed or incomplete')}</p>
              <p>{t('My acknowledgement')}: {status(plan.ownAcknowledgement?.status || 'not_recorded')}{plan.ownAcknowledgement?.acknowledgedAt ? ` · ${date(plan.ownAcknowledgement.acknowledgedAt)}` : ''}{plan.ownAcknowledgement ? ` · ${plan.ownAcknowledgement.integrityValid ? t('Verified') : t('Needs review')}` : ''}</p>
              {plan.steps?.length ? <><h6>{t('Steps, hazards and controls')}</h6><ol>{plan.steps.map((step, index) => <li key={step.stepKey || index}><strong>{step.description}</strong>{step.hazards?.length ? <p>{t('Hazards')}: {step.hazards.join('; ')}</p> : null}{step.controls?.length ? <p>{t('Controls')}: {step.controls.join('; ')}</p> : null}</li>)}</ol></> : null}
              {plan.emergencyArrangements ? <p><strong>{t('Emergency arrangements')}:</strong> {plan.emergencyArrangements}</p> : null}
              {plan.stopWorkTriggers?.length ? <p className="work-pack-warning"><strong>{t('Stop-work triggers')}:</strong> {plan.stopWorkTriggers.join('; ')}</p> : null}
              {plan.blockers?.length ? <ul>{plan.blockers.map((item, index) => <li className="work-pack-warning" key={`${plan.id}-blocker-${index}`}>{item}</li>)}</ul> : null}
              {plan.permit ? <div><h6>{t('Linked work permit')}: {plan.permit.title}</h6><p>{status(plan.permit.status)} · {t('My acknowledgement')}: {status(plan.permit.ownAcknowledgement?.status || 'not_recorded')}{plan.permit.ownAcknowledgement ? ` · ${plan.permit.ownAcknowledgement.integrityValid ? t('Verified') : t('Needs review')}` : ''}</p>{[...plan.permit.hazards.map(item => `${t('Hazard')}: ${item}`), ...plan.permit.controls.map(item => `${t('Control')}: ${item}`), ...plan.permit.conditions.map(item => `${t('Condition')}: ${item}`)].map((item, index) => <p key={`${plan.permit.id}-detail-${index}`}>{item}</p>)}{plan.permit.blockers.map((item, index) => <p className="work-pack-warning" key={`${plan.permit.id}-blocker-${index}`}>{item}</p>)}</div> : null}
            </article>) : empty('No safety plan is linked to your active assignment. Check with the office whether one applies.')}
            {pack.know.lmraAssessments?.length ? <><h5>{t('My LMRA assessments')}</h5>{pack.know.lmraAssessments.map(assessment => <article className="work-pack-safety-record" key={assessment.id}>
              <p><strong>{assessment.workArea}: {assessment.activity}</strong></p><p>{t('Outcome')}: {status(assessment.outcome)} · {t('Recorded')}: {date(assessment.assessedAt)} · {t('Valid until')}: {date(assessment.validUntil)}</p>
              <p>{t('Source status')}: {assessment.sourceCurrent ? t('Current') : t('Changed or unavailable')} · {t('Assessment integrity')}: {assessment.integrityValid ? t('Verified') : t('Needs review')} · {assessment.isLatestForWorkerPlan ? t('Latest for this plan') : t('Superseded')}{assessment.expired ? ` · ${t('Expired')}` : ''}</p>
              {assessment.stopWorkReason ? <p className="work-pack-warning">{assessment.stopWorkReason}</p> : null}
              {assessment.observedHazards?.length ? <p className="work-pack-warning"><strong>{t('Observed hazards')}:</strong> {assessment.observedHazards.join('; ')}</p> : null}
              <ul>{Object.entries(assessment.checks || {}).map(([name, passed]) => <li key={name}>{t(name)}: {passed ? t('Confirmed') : t('Not confirmed')}</li>)}</ul>
              {assessment.blockers.map((item, index) => <p className="work-pack-warning" key={`${assessment.id}-blocker-${index}`}>{item}</p>)}
            </article>)}</> : <p>{t('No personal LMRA assessment is recorded for these plans. Follow site procedure and contact the supervisor if one is required.')}</p>}
          </section>
        </> : null}
        {tab === 'have' ? <>
          <h4>{t('Materials')}</h4>{pack.have.materials.length ? <ul>{pack.have.materials.map(item => <li key={item.id}><strong>{item.name}</strong><span>{item.quantity} {item.unit}; {status(item.status)}</span></li>)}</ul> : empty('No materials recorded.')}
          <section className="work-pack-site-issues" aria-label={t('Material deliveries to site')}>
            <h4>{t('Material deliveries to site')}</h4>
            {pack.have.siteIssues?.length ? pack.have.siteIssues.map(issue => <article key={issue.id}>
              <strong>{issue.materialName}: {issue.receivedQuantity} / {issue.quantity} {issue.unit}</strong>
              <p>{t(issue.status === 'received' ? 'Arrival received' : issue.status === 'partial' ? 'Partially received' : 'In transit')} · {t('Expected arrival')}: {date(issue.expectedArrivalAt)}</p>
              <p>{t('Dispatch reference')}: {issue.dispatchReference} · {t('Accepted')}: {issue.acceptedQuantity} {issue.unit}</p>
              {issue.pendingInspectionQuantity > 0 ? <p className="work-pack-warning" role="status">{t('Awaiting inspection')}: {issue.pendingInspectionQuantity} {issue.unit}. {t('Not available until accepted.')}</p> : null}
              {issue.receipts?.length ? <ul>{issue.receipts.map(receipt => <li key={receipt.id}>{receipt.receiptReference}: {receipt.acceptedQuantity} {issue.unit} accepted, {receipt.damagedQuantity} {issue.unit} damaged{receipt.pendingInspectionQuantity > 0 ? `, ${receipt.pendingInspectionQuantity} ${issue.unit} awaiting inspection` : ''} · {receipt.location} · {receipt.receivedBy}
                {receipt.reviews?.map(review => <small key={review.id}>{t('Office inspection')}: {review.acceptedQuantity} {issue.unit} accepted, {review.damagedQuantity} {issue.unit} damaged · {review.reviewReference} · {review.evidenceReference}</small>)}</li>)}</ul> : null}
              {canRespond && issue.remainingQuantity > 0 ? <form className="work-pack-site-receipt" aria-label={t('Confirm material arrival for {material}', { material: issue.materialName })}
                onSubmit={event => void receiveSiteIssue(issue, event)}>
                {(() => {
                  const draft = siteReceiptDrafts[issue.id] || { received: '', accepted: String(issue.remainingQuantity), damaged: '0', acceptedEdited: false }
                  const received = Number(draft.received || 0), accepted = Number(draft.accepted || 0), damaged = Number(draft.damaged || 0)
                  const invalid = accepted + damaged > received + 0.000001
                  const update = (field, value) => setSiteReceiptDrafts(current => {
                    const previous = current[issue.id] || { received: '', accepted: String(issue.remainingQuantity), damaged: '0', acceptedEdited: false }
                    const next = { ...previous, [field]: value }
                    if (field === 'accepted') next.acceptedEdited = true
                    if (field === 'received' && !previous.acceptedEdited && Number(value) >= 0) next.accepted = value
                    return { ...current, [issue.id]: next }
                  })
                  return <>
                    <label>{t('Quantity received')}<input name="receivedQuantity" type="number" min="0.0001" max={issue.remainingQuantity} step="0.0001" required value={draft.received} onChange={event => update('received', event.target.value)} disabled={busy || !online} /></label>
                    <label>{t('Quantity accepted')}<input name="acceptedQuantity" type="number" min="0" max={issue.remainingQuantity} step="0.0001" required value={draft.accepted} onChange={event => update('accepted', event.target.value)} disabled={busy || !online} /></label>
                    <label>{t('Quantity damaged')}<input name="damagedQuantity" type="number" min="0" max={issue.remainingQuantity} step="0.0001" value={draft.damaged} onChange={event => update('damaged', event.target.value)} disabled={busy || !online} /></label>
                    {!invalid && received > accepted + damaged ? <p role="status">{t('Awaiting inspection')}: {Number((received - accepted - damaged).toFixed(4))} {issue.unit}. {t('Not available until accepted.')}</p> : null}
                    {invalid ? <p className="work-pack-warning" role="alert">{t('Accepted and damaged quantities cannot exceed the quantity received.')}</p> : null}
                  </>
                })()}
                <label>{t('Receipt reference')}<input name="receiptReference" minLength="3" maxLength="240" required disabled={busy || !online} /></label>
                <label>{t('Arrival evidence reference')}<input name="evidenceReference" minLength="3" maxLength="240" required disabled={busy || !online} /></label>
                <label>{t('Received at')}<input name="location" minLength="2" maxLength="240" defaultValue={location || ''} required disabled={busy || !online} /></label>
                <button type="submit" className="secondary-button" disabled={busy || !online || Number((siteReceiptDrafts[issue.id]?.accepted || 0)) + Number((siteReceiptDrafts[issue.id]?.damaged || 0)) > Number((siteReceiptDrafts[issue.id]?.received || 0)) + 0.000001}><PackageCheck size={17} />{t('Confirm arrival at site')}</button>
              </form> : null}
            </article>) : empty('No material deliveries from the company warehouse are expected.')}
            {canRespond && !online ? <p>{t('Reconnect to confirm a material delivery. The quantity has not been received until this is recorded.')} <a href="/field-offline.html">{t('Open the encrypted offline work pack to save an arrival for later sync.')}</a></p> : null}
          </section>
          <h4>{t('Equipment')}</h4>{pack.have.equipment.length ? <ul>{pack.have.equipment.map(item => <li key={item.id}><strong>{item.toolName}</strong><span>{status(item.status)}{item.taskTitle ? ` · ${item.taskTitle}` : ''}</span>{item.custody ? <span className={item.custody.status === 'exception' ? 'work-pack-warning' : ''}>{status(item.custody.status)}{item.custody.heldByYou ? ` · ${t('In your custody')}` : ''}{item.custody.dueBackAt ? ` · ${date(item.custody.dueBackAt)}` : ''}</span> : null}</li>)}</ul> : empty('No equipment reservations recorded.')}
          <p>{t('Recorded requirements do not confirm delivery or availability on site.')}</p>
        </> : null}
        {tab === 'do' ? <>
          <h4>{t('My tasks and shared preparation')}</h4>{pack.do.length ? <ol>{pack.do.map(item => {
            const requiredReleases = pack.assignments.filter(assignment => assignment.startReleaseRequired && assignment.workBoardTaskIds?.includes(item.id))
            return <li key={item.id}><strong>{item.title}</strong>{item.description ? <p className="work-pack-verbatim">{item.description}</p> : null}<span>{status(item.status)}{item.plannedStart ? `; ${date(item.plannedStart)}` : ''}</span>{item.crew?.length ? <span>{t('Crew: {members}', { members: item.crew.map(member => `${member.workerName} · ${member.role}`).join(', ') })}</span> : null}{item.supervisions?.length ? item.supervisions.map(supervisor => <span key={`${item.id}-${supervisor.workerId}`} className={supervisor.checkedIn ? 'work-pack-read' : 'work-pack-warning'}>{t('Supervision: {name} · {role} · {status}', { name: supervisor.workerName || t('Assigned supervisor'), role: supervisor.role || t('Role needs review'), status: supervisor.checkedIn ? t('Checked in on site') : t('Supervisor not checked in') })}</span>) : item.supervision?.required ? <span className={item.supervision.checkedIn ? 'work-pack-read' : 'work-pack-warning'}>{t('Supervision: {name} · {role} · {status}', { name: item.supervision.workerName || t('Assigned supervisor'), role: item.supervision.role || t('Role needs review'), status: item.supervision.checkedIn ? t('Checked in on site') : t('Supervisor not checked in') })}</span> : null}{item.supervision?.ratio ? <span>{t('Required supervision ratio: one per {count} workers', { count: item.supervision.ratio.workersPerSupervisor })} · {t('Required supervisors checked in: {checkedIn} of {required}', { checkedIn: (item.supervisions || []).filter(supervisor => supervisor.checkedIn).length, required: item.supervision.requiredSupervisorCount })}</span> : null}{item.supervisingOnly ? <span>{t('You are the designated supervisor for this task. Progress reports belong to its assigned worker.')}</span> : null}{requiredReleases.map(assignment => <span className="work-pack-warning" key={`${item.id}-${assignment.id}`}>{t('Supervisor start release')}: {status(assignment.startRelease?.status || 'not_issued')}</span>)}</li>
          })}</ol> : empty('No work tasks assigned.')}
          {canRespond && progressTasks.length > 0 ? <form className="work-pack-progress" aria-label={t('Task progress and blockers')} onSubmit={event => { event.preventDefault(); void retain('progress') }}>
            <h4>{t('Task progress and blockers')}</h4>
            {startReleaseBlocksProgress ? <p className="work-pack-warning" role="status">{t('A current supervisor start release and your receipt confirmation are required before this task can be reported in progress. You can still report a blocker.')}</p> : null}
            <label>{t('Task')}<select required value={selectedProgressTaskId} disabled={busy || !online} onChange={event => { setProgressTaskId(event.target.value); setEquipmentConcernReservationId('') }}>
              <option value="">{t('Select a task')}</option>{progressTasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}
            </select></label>
            <label>{t('Progress status')}<select value={progressStatus} disabled={busy || !online} onChange={event => { setProgressStatus(event.target.value); if (event.target.value !== 'blocked') setEquipmentConcernReservationId('') }}>
              <option value="in_progress">{t('In progress')}</option><option value="blocked">{t('Blocked')}</option>
            </select></label>
            {progressStatus === 'blocked' && heldEquipmentForTask.length ? <>
              <label>{t('Equipment condition')}<select value={equipmentConcernReservationId} disabled={busy || !online} onChange={event => setEquipmentConcernReservationId(event.target.value)}>
                <option value="">{t('No equipment fault to report')}</option>{heldEquipmentForTask.map(item => <option key={item.id} value={item.id}>{item.toolName}</option>)}
              </select></label>
              {equipmentConcernReservationId ? <>
                <label>{t('Concern type')}<select value={equipmentConcernType} disabled={busy || !online} onChange={event => setEquipmentConcernType(event.target.value)}>
                  <option value="malfunction">{t('Malfunction')}</option><option value="damaged">{t('Damaged')}</option><option value="unsafe">{t('Unsafe')}</option>
                </select></label>
                <p className="work-pack-warning" role="status">{t('Stop using the equipment and tell the supervisor. This report holds it from new reservations; inspection or repair must be recorded separately.')}</p>
              </> : null}
            </> : null}
            <label>{t('Progress (%)')}<input type="number" inputMode="numeric" min="0" max="100" step="1" required value={progressPercent} disabled={busy || !online} onChange={event => setProgressPercent(event.target.value)} /></label>
            <label>{t('What changed or blocks this task?')}<textarea required minLength={3} maxLength={2000} value={progressNote} disabled={busy || !online} onChange={event => setProgressNote(event.target.value)} /></label>
            <button type="submit" className="secondary-button" disabled={busy || !online || !selectedProgressTaskId || progressNote.trim().length < (equipmentConcernReservationId ? 8 : 3) || (progressStatus === 'in_progress' && startReleaseBlocksProgress)}><Send size={17} />{t('Report to office')}</button>
          </form> : canRespond ? <p>{t('No open task available for progress reporting.')}</p> : null}
          <h4>{t('Required checks and evidence')}</h4>{[...pack.checks.quality, ...pack.checks.photos].length ? <ul>{[...pack.checks.quality, ...pack.checks.photos].map(item => <li key={item.id}><strong>{item.title || t('Evidence')}</strong><span>{status(item.status)}</span></li>)}</ul> : empty('No personal quality or photo controls recorded.')}
          <div className="work-pack-actions"><button type="button" className="secondary-button" onClick={() => onOpenJob?.(pack.job)}><ArrowUpRight size={17} />{t('Open execution')}</button>{onCapture ? <button type="button" className="secondary-button" onClick={() => onCapture(pack.job)}><Camera size={17} />{t('Capture photo or field update')}</button> : null}</div>
        </> : null}
      </div>
      <p className="work-pack-safety">{t('Reading this pack does not release permits, safety checks or work holds.')}</p>
      {canRespond ? <OfflineDownload pack={pack} locale={locale} /> : null}
      {canRespond ? <div className="work-pack-response">
        {!pack.acknowledgment?.current ? <><label className="work-pack-check"><input type="checkbox" checked={understood} disabled={busy || !online} onChange={event => setUnderstood(event.target.checked)} />{t('I have read this work-pack version')}</label><button type="button" className="secondary-button" disabled={!understood || busy || !online} onClick={() => retain('acknowledgments')}><CheckCheck size={17} />{t('Record read confirmation')}</button></> : null}
        <form onSubmit={event => { event.preventDefault(); void retain('questions') }}><label>{t('Question or blocker')}<textarea minLength={3} maxLength={4000} required value={question} disabled={busy} onChange={event => setQuestion(event.target.value)} /></label><button type="submit" className="secondary-button" disabled={question.trim().length < 3 || busy || !online}><Send size={17} />{t('Send to office review')}</button></form>
      </div> : <p>{t('Office preview. Only the assigned worker can confirm reading or submit a personal response.')}</p>}
      {pack.questions.length ? <><h4>{t('My recent questions')}</h4><ul className="work-pack-questions">{pack.questions.map(item => <li key={item.id}><p>{item.message}</p><small>{date(item.recordedAt)} · {t(item.replyStatus === 'answered' ? 'Office replied' : item.replyStatus === 'pending_approval' ? 'Office reply pending approval' : item.replyStatus === 'review_required' ? 'Office reply needs review' : 'Waiting for office reply')}</small>{item.response ? <p className="work-pack-verbatim">{item.response}</p> : null}</li>)}</ul></> : null}
    </> : null}
  </div>
}

export default function FieldWorkPack({ api, locale = 'en-GB', canRespond = false, canIssueStartRelease = false, refreshKey, onOpenJob, onCapture, pollIntervalMs }) {
  const t = (key, values) => operatorText(locale, key, values)
  const [selected, setSelected] = useState(null)
  const [cursors, setCursors] = useState([''])
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [revision, setRevision] = useState(0)
  const after = cursors.at(-1)
  useEffect(() => {
    let current = true
    setLoading(true)
    setError('')
    api(`/api/ledger/work-packs?${new URLSearchParams({ after, limit: '20' })}`).then(data => { if (current) setResult(data) }).catch(reason => { if (current) setError(reason.message) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api, after, refreshKey, revision])
  return <section className="field-work-pack" data-testid="field-work-pack" aria-label={t('Work packs')}>
    <header className="work-pack-heading"><h2><HardHat size={21} />{t(canRespond ? 'My work packs' : 'Worker work packs')}</h2>{selected ? <button type="button" className="secondary-button" onClick={() => setSelected(null)}><ArrowLeft size={17} />{t('Work packs')}</button> : null}</header>
    {selected ? <WorkPackDetail key={selected} api={api} jobId={selected} canRespond={canRespond} canIssueStartRelease={canIssueStartRelease} locale={locale} onOpenJob={onOpenJob} onCapture={onCapture} refreshKey={refreshKey} pollIntervalMs={pollIntervalMs} /> : <>
      {loading ? <p role="status">{t('Loading work packs...')}</p> : null}
      {error ? <div role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={() => setRevision(value => value + 1)}>{t('Retry')}</button></div> : null}
      {!loading && !error && result ? <>
        {!result.rows.length ? <p>{t('No work packs available for this account.')}</p> : <ul className="work-pack-list">{result.rows.map(job => <li key={job.id}><button type="button" onClick={() => setSelected(job.id)}><span className="visually-hidden">{t('Open work pack')}</span>{' '}<div><strong>{job.title}</strong>{' '}<span>{[job.address, job.city].filter(Boolean).join(', ')}</span></div><ArrowRight size={19} /></button></li>)}</ul>}
        <footer><button className="icon-button" type="button" title={t('Previous work packs')} aria-label={t('Previous work packs')} disabled={cursors.length === 1} onClick={() => setCursors(value => value.slice(0, -1))}><ArrowLeft size={18} /></button><button className="icon-button" type="button" title={t('Next work packs')} aria-label={t('Next work packs')} disabled={!result.nextCursor} onClick={() => setCursors(value => [...value, result.nextCursor])}><ArrowRight size={18} /></button></footer>
      </> : null}
    </>}
  </section>
}
