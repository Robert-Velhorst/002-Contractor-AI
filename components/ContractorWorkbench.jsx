import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, ClipboardPen, LoaderCircle, RefreshCw, Search, ShieldCheck, TriangleAlert } from 'lucide-react'
import { operatorText } from '../operator-locale'
import { formatStatus } from '../dashboard-format'
import { cancellableRead } from '../cancellable-read.mjs'
import './ContractorWorkbench.css'

const AREAS = [
  ['all', 'All work areas'], ['approval', 'Approvals'], ['dispatch', 'Planning and dispatch'],
  ['workforce', 'People'], ['inventory', 'Materials and equipment'], ['field_assurance', 'Site, safety and quality'],
  ['finance', 'Financial'], ['client_success', 'Clients and aftercare'], ['capability', 'Job setup'],
  ['operations', 'Business operations'], ['learning', 'Learning'],
]
const DECISIONS = [['all', 'All decisions'], ['safe', 'Internal drafts'], ['approval', 'Approval required'], ['blocked', 'Blocked']]
const PAGE_SIZE = 20

export default function ContractorWorkbench({ api, locale = 'en-GB', refreshKey, canAutomate = false, canResolveAttendance = false, suspended = false, onOpenAction, onChanged, formatMessage }) {
  const t = (key, values = {}) => operatorText(locale, key, values)
  const [filters, setFilters] = useState({ stream: 'all', mode: 'all', search: '', offset: 0 })
  const [search, setSearch] = useState('')
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
  const mounted = useRef(true)
  const automationPaused = suspended || result?.automationSuspended === true

  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  useEffect(() => {
    setLoading(true)
    setError('')
    const query = new URLSearchParams({ limit: String(PAGE_SIZE), jobLimit: '12', ...filters })
    return cancellableRead(api, `/api/ledger/command-plan?${query}`, setResult,
      requestError => setError(requestError.message), () => setLoading(false))
  }, [api, filters, refreshKey, revision])

  function changeFilter(key, value) {
    setMessage('')
    setFilters(current => ({ ...current, [key]: value, offset: 0 }))
  }

  async function prepareDraft(action) {
    if (saveLock.current || !canAutomate || automationPaused || !action.safeDraftable || action.blocked) return
    saveLock.current = true
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await api('/api/ledger/command-plan', {
        method: 'POST',
        body: JSON.stringify({ actionId: action.id, ...(action.jobId ? { jobId: action.jobId } : {}), limit: 1, jobLimit: 12 }),
      })
      if (!mounted.current) return
      setMessage(t('{applied} internal record(s) prepared; {skipped} skipped. No external commitments.', {
        applied: response.summary?.applied || 0, skipped: response.summary?.skipped || 0,
      }))
      setFilters(current => ({ ...current, offset: 0 }))
      // Saving succeeded even if the surrounding dashboard cannot be refreshed.
      void Promise.resolve(onChanged?.()).catch(() => {})
    } catch (requestError) {
      if (mounted.current) setError(requestError.message)
    } finally {
      saveLock.current = false
      if (mounted.current) setSaving(false)
    }
  }

  async function confirmMissingCheckin(action) {
    if (saveLock.current || !canResolveAttendance || action.data?.actionKind !== 'worker_checkin_missing') return
    const confirmed = window.confirm(t('Only continue after you have contacted the worker or verified their status with the site lead. Confirm they cannot attend this scheduled shift? This records unavailability and may start the position’s opt-in standby call-out process. No replacement is placed automatically.'))
    if (!confirmed) return
    saveLock.current = true
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const response = await api(`/api/ledger/jobs/${encodeURIComponent(action.jobId)}/assignments/${encodeURIComponent(action.data?.assignmentId || action.assignmentId)}/confirm-missing-checkin-unavailable`, {
        method: 'POST',
        body: JSON.stringify({ sourceHash: action.data?.sourceHash || action.sourceHash }),
      })
      if (!mounted.current) return
      setMessage(response.replayed
        ? t('This verified unavailability was already recorded; no duplicate period was created.')
        : t('Verified unavailability recorded for this shift. The original assignment remains unchanged; review any standby response separately.'))
      setFilters(current => ({ ...current, offset: 0 }))
      void Promise.resolve(onChanged?.()).catch(() => {})
    } catch (requestError) {
      if (mounted.current) setError(requestError.message)
    } finally {
      saveLock.current = false
      if (mounted.current) setSaving(false)
    }
  }

  const summary = result?.matchingSummary || {}
  const pagination = result?.pagination
  const rows = result?.actions || []
  const unavailable = loading || Boolean(error)
  return (
    <section className="contractor-workbench" data-testid="contractor-workbench" aria-labelledby="contractor-workbench-heading">
      <header className="workbench-heading">
        <h2 id="contractor-workbench-heading">{t('Daily workbench')}</h2>
        <button type="button" className="icon-button" title={t('Refresh work')} aria-label={t('Refresh work')} disabled={loading || saving} onClick={() => setRevision(value => value + 1)}>
          <RefreshCw size={18} />
        </button>
      </header>
      <form className="workbench-filters" onSubmit={event => { event.preventDefault(); changeFilter('search', search.trim()) }}>
        <label>{t('Work area')}
          <select value={filters.stream} disabled={saving} onChange={event => changeFilter('stream', event.target.value)}>
            {AREAS.map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
          </select>
        </label>
        <label>{t('Decision')}
          <select value={filters.mode} disabled={saving} onChange={event => changeFilter('mode', event.target.value)}>
            {DECISIONS.map(([key, label]) => <option key={key} value={key}>{t(label)}</option>)}
          </select>
        </label>
        <label className="workbench-search">{t('Search work')}
          <span><input type="search" value={search} disabled={saving} onChange={event => setSearch(event.target.value)} />
            <button className="icon-button" type="submit" title={t('Search work')} aria-label={t('Search work')} disabled={saving}><Search size={18} /></button>
          </span>
        </label>
      </form>
      {message ? <p className="workbench-message" role="status">{message}</p> : null}
      {automationPaused ? <p className="workbench-scope">{t('Autonomous work is suspended.')}</p> : null}
      {loading ? <p className="workbench-state" role="status"><LoaderCircle className="spin" size={18} />{t('Loading work plan...')}</p> : null}
      {error ? <div className="workbench-state" role="alert"><TriangleAlert size={18} /><span>{error}</span><button type="button" className="secondary-button" disabled={saving} onClick={() => setRevision(value => value + 1)}>{t('Retry')}</button></div> : null}
      {!unavailable && result ? <>
        <dl className="workbench-counts">
          {[[t('High priority'), summary.highPriority], [t('Internal drafts'), summary.runnableDrafts], [t('Approval required'), summary.approvalRequired], [t('Blocked'), summary.blocked]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || 0}</dd></div>)}
        </dl>
        <p className="workbench-scope">{t('Readiness sample: {checked} of {total} dossiers. Other ledger monitors have their own limits; this is not a complete audit.', { checked: result.scope?.consideredJobs || 0, total: result.scope?.eligibleJobs || 0 })}</p>
        <div className="workbench-list">
          {rows.map(action => <article className="workbench-row" key={action.id} data-action-id={action.id}>
            <span className={`severity severity-${action.severity || 'medium'}`} title={t(formatStatus(action.severity || 'medium'))}><TriangleAlert size={15} /></span>
            <div className="workbench-copy">
              <strong>{action.jobTitle || t(AREAS.find(([key]) => key === action.stream)?.[1] || 'Business operations')}</strong>
              <p>{formatMessage ? formatMessage(action) : action.message}</p>
              <small>{t(AREAS.find(([key]) => key === action.stream)?.[1] || 'Business operations')} / {t(formatStatus(action.actionType))}</small>
              <div className="workbench-flags">
                {action.actionType === 'review_daily_cycle' && action.data?.actionKind === 'worker_checkin_missing'
                  ? <span className="tag tag-amber">{t('Check required')}</span>
                  : null}
                {action.requiresApproval ? <span className="tag tag-amber">{t('Approval required')}</span> : null}
                {action.blocked ? <span className="tag">{t('Blocked')}</span> : null}
                {!action.blocked && action.safeDraftable ? <span className="tag tag-green">{t('Internal draft')}</span> : null}
              </div>
            </div>
            <div className="workbench-actions">
              {canAutomate && action.safeDraftable && !action.blocked ? <button type="button" className="secondary-button" disabled={saving || automationPaused} onClick={() => prepareDraft(action)}><ClipboardPen size={16} />{t('Prepare internal draft')}</button> : null}
              {canResolveAttendance && action.data?.actionKind === 'worker_checkin_missing' ? <button type="button" className="secondary-button" disabled={saving} onClick={() => confirmMissingCheckin(action)}>{t('Confirm verified unavailability')}</button> : null}
              <button type="button" className="icon-button" title={t(action.approvalId ? 'Review approval for {title}' : 'Open {title}', { title: action.jobTitle || t('linked work') })} aria-label={t(action.approvalId ? 'Review approval for {title}' : 'Open {title}', { title: action.jobTitle || t('linked work') })} disabled={saving} onClick={() => onOpenAction(action)}>
                {action.approvalId ? <ShieldCheck size={18} /> : <ArrowUpRight size={18} />}
              </button>
            </div>
          </article>)}
          {!rows.length ? <p className="workbench-state">{t('No matching work')}</p> : null}
        </div>
        <footer className="workbench-pagination">
          <span>{t('{from}-{to} of {total} matching actions', { from: rows.length ? filters.offset + 1 : 0, to: rows.length ? filters.offset + rows.length : 0, total: pagination?.matching || 0 })}</span>
          <button type="button" className="icon-button" title={t('Previous page')} aria-label={t('Previous page')} disabled={saving || !filters.offset} onClick={() => setFilters(current => ({ ...current, offset: Math.max(0, current.offset - PAGE_SIZE) }))}><ArrowLeft size={18} /></button>
          <button type="button" className="icon-button" title={t('Next page')} aria-label={t('Next page')} disabled={saving || !pagination?.hasMore} onClick={() => setFilters(current => ({ ...current, offset: current.offset + PAGE_SIZE }))}><ArrowRight size={18} /></button>
        </footer>
      </> : null}
    </section>
  )
}
