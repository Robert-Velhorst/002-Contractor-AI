import './JobWorkspaceControls.css'
import { useEffect, useState } from 'react'
import { Activity, Plus, RefreshCw, Ruler, ShieldCheck, X } from 'lucide-react'
import { createFieldEvidenceDraftId } from '../field-outbox'
import { EMPTY_LIST, formatDate, formatStatus, futureDateInput, roundDisplay } from '../dashboard-format'
import { operatorText } from '../operator-locale'
import Empty from './EmptyState'



function emptyProductionBaselineLine(index = 0) {
  return {
    lineKey: `production-line-${index + 1}`,
    costCode: 'PRODUCTION',
    description: '',
    unit: 'unit',
    taskId: '',
    plannedQuantity: '',
    plannedLaborHours: '',
  }
}

function emptyProductionEntry(baselineId = '', lineKey = '') {
  return {
    entryKey: createFieldEvidenceDraftId(),
    baselineId,
    lineKey,
    workDate: futureDateInput(0),
    quantity: '',
    crewHours: '',
    note: '',
  }
}

function ProductionControl({
  job,
  locale,
  canCoordinate,
  canReport,
  canApprove,
  submitting,
  outboxPending,
  outboxSyncing,
  onRequestBaseline,
  onRecordEntry,
  onRequestReversal,
  onOpenApprovals,
  onSyncOutbox,
}) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const production = job.productionControl || {}
  const activeBaseline = production.activeBaseline || null
  const activeBaselineId = activeBaseline?.id || ''
  const firstProductionLineKey = activeBaseline?.snapshot?.lines?.[0]?.lineKey || ''
  const pendingBaseline = production.pendingBaseline || null
  const lines = production.lines || EMPTY_LIST
  const entries = production.entries || job.productionEntries || EMPTY_LIST
  const productionTasks = (job.tasks || EMPTY_LIST).filter((task) => !['completed', 'cancelled', 'canceled', 'deleted'].includes(String(task.status || '').toLowerCase()))
  const [editingBaseline, setEditingBaseline] = useState(false)
  const [baselineLines, setBaselineLines] = useState(() => [emptyProductionBaselineLine(0)])
  const [baselineNotes, setBaselineNotes] = useState('')
  const [entryDraft, setEntryDraft] = useState(() => emptyProductionEntry(activeBaselineId, firstProductionLineKey))
  const [reversalEntryId, setReversalEntryId] = useState(null)
  const [reversalReason, setReversalReason] = useState('')

  useEffect(() => {
    setEntryDraft(emptyProductionEntry(activeBaselineId, firstProductionLineKey))
    setEditingBaseline(false)
    setReversalEntryId(null)
    setReversalReason('')
  }, [job.id, activeBaselineId, firstProductionLineKey])

  function beginBaselineRevision() {
    const retainedLines = activeBaseline?.snapshot?.lines || EMPTY_LIST
    setBaselineLines(retainedLines.length
      ? retainedLines.map((line) => ({
          lineKey: line.lineKey,
          costCode: line.costCode,
          description: line.description,
          unit: line.unit,
          taskId: line.taskId || '',
          plannedQuantity: String(line.plannedQuantity),
          plannedLaborHours: String(line.plannedLaborHours),
        }))
      : [emptyProductionBaselineLine(0)])
    setBaselineNotes('')
    setEditingBaseline(true)
  }

  function updateBaselineLine(index, patch) {
    setBaselineLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line))
  }

  async function submitBaseline(event) {
    event.preventDefault()
    const retainedLines = baselineLines.map((line) => ({
      ...line,
      plannedQuantity: Number(line.plannedQuantity),
      plannedLaborHours: Number(line.plannedLaborHours),
    }))
    if (retainedLines.some((line) => !line.description.trim() || !(line.plannedQuantity > 0) || !(line.plannedLaborHours > 0))) return
    const retained = await onRequestBaseline({ lines: retainedLines, notes: baselineNotes.trim() })
    if (retained) setEditingBaseline(false)
  }

  async function submitEntry(event) {
    event.preventDefault()
    const quantity = Number(entryDraft.quantity)
    const crewHours = Number(entryDraft.crewHours)
    if (!entryDraft.lineKey || !(quantity > 0) || !(crewHours >= 0) || entryDraft.note.trim().length < 3) return
    const retained = await onRecordEntry({
      ...entryDraft,
      quantity,
      crewHours,
      note: entryDraft.note.trim(),
      source: 'job_workspace',
    })
    if (retained) setEntryDraft(emptyProductionEntry(activeBaselineId, firstProductionLineKey))
  }

  async function submitReversal(event) {
    event.preventDefault()
    if (!reversalEntryId || reversalReason.trim().length < 5) return
    const retained = await onRequestReversal(reversalEntryId, reversalReason.trim())
    if (retained) {
      setReversalEntryId(null)
      setReversalReason('')
    }
  }

  const summary = production.summary || {}
  const performanceStatus = summary.performanceFactor === null || summary.performanceFactor === undefined
    ? t('Not rated')
    : roundDisplay(summary.performanceFactor)

  return (
    <section className="job-workspace-section production-control" data-testid="production-control">
      <div className="section-heading production-heading">
        <Activity size={18} />
        <div>
          <h3>{t('Production control')}</h3>
          <p>{t('Compare measured installed output and crew hours with one approved production baseline.')}</p>
        </div>
        {canCoordinate && !pendingBaseline && !editingBaseline ? (
          <button type="button" className="secondary-button" disabled={submitting} onClick={beginBaselineRevision}>
            <Ruler size={15} />
            {activeBaseline ? t('Revise baseline') : t('Create baseline')}
          </button>
        ) : null}
      </div>

      <div className="production-summary" aria-label={t('Production performance summary')}>
        <div><span>{t('Quantity progress')}</span><strong>{roundDisplay(summary.quantityProgressPercent || 0)}%</strong></div>
        <div><span>{t('Earned / crew hours')}</span><strong>{roundDisplay(summary.earnedHours || 0)} / {roundDisplay(summary.crewHours || 0)}</strong></div>
        <div><span>{t('Performance factor')}</span><strong>{performanceStatus}</strong></div>
        <div><span>{t('At-risk lines')}</span><strong>{summary.atRiskLines || 0}</strong></div>
      </div>

      {pendingBaseline ? (
        <div className="production-pending" role="status">
          <ShieldCheck size={16} />
          <span>{t('Baseline v{version} is awaiting approval. Output remains bound to the current approved baseline.', { version: pendingBaseline.versionNumber })}</span>
          {canApprove ? (
            <button type="button" className="secondary-button" onClick={() => onOpenApprovals({ approvalId: pendingBaseline.approvalId, jobId: job.id, jobTitle: job.title })}>
              {t('Review approval')}
            </button>
          ) : null}
        </div>
      ) : null}

      {editingBaseline ? (
        <form className="production-baseline-editor" data-testid="production-baseline-form" onSubmit={submitBaseline}>
          <div className="production-editor-heading">
            <div>
              <strong>{activeBaseline ? t('Revised production baseline') : t('Initial production baseline')}</strong>
              <small>{t('Keep existing line keys and units when revising lines with retained output.')}</small>
            </div>
            <button type="button" className="icon-button" aria-label={t('Cancel production baseline')} onClick={() => setEditingBaseline(false)}><X size={16} /></button>
          </div>
          <div className="production-baseline-lines">
            {baselineLines.map((line, index) => (
              <div className="production-baseline-line" key={index}>
                <label>{t('Line key')}<input required minLength="2" maxLength="100" value={line.lineKey} onChange={(event) => updateBaselineLine(index, { lineKey: event.target.value })} /></label>
                <label>{t('Cost code')}<input required minLength="2" maxLength="80" value={line.costCode} onChange={(event) => updateBaselineLine(index, { costCode: event.target.value })} /></label>
                <label className="production-description">{t('Description')}<input required minLength="2" maxLength="300" value={line.description} onChange={(event) => updateBaselineLine(index, { description: event.target.value })} /></label>
                <label>{t('Linked task')}<select value={line.taskId || ''} onChange={(event) => updateBaselineLine(index, { taskId: event.target.value })}>
                  <option value="">{t('Office-only (not available in field app)')}</option>
                  {productionTasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                </select></label>
                <label>{t('Unit')}<input required maxLength="30" value={line.unit} onChange={(event) => updateBaselineLine(index, { unit: event.target.value })} /></label>
                <label>{t('Planned quantity')}<input required type="number" min="0.0001" step="0.0001" value={line.plannedQuantity} onChange={(event) => updateBaselineLine(index, { plannedQuantity: event.target.value })} /></label>
                <label>{t('Labor hours')}<input required type="number" min="0.01" step="0.01" value={line.plannedLaborHours} onChange={(event) => updateBaselineLine(index, { plannedLaborHours: event.target.value })} /></label>
                {baselineLines.length > 1 ? (
                  <button type="button" className="icon-button production-remove-line" aria-label={t('Remove production line {number}', { number: index + 1 })} onClick={() => setBaselineLines((current) => current.filter((_, lineIndex) => lineIndex !== index))}><X size={15} /></button>
                ) : null}
              </div>
            ))}
          </div>
          <label className="production-notes">{t('Reviewer context')}<textarea maxLength="4000" value={baselineNotes} onChange={(event) => setBaselineNotes(event.target.value)} placeholder={t('Record measurement basis, crew assumptions, and retained references.')} /></label>
          <div className="modal-actions">
            <button type="button" className="secondary-button" disabled={submitting || baselineLines.length >= 200} onClick={() => setBaselineLines((current) => [...current, emptyProductionBaselineLine(current.length)])}><Plus size={15} />{t('Line')}</button>
            <button className="primary-button" disabled={submitting}><ShieldCheck size={15} />{submitting ? t('Retaining...') : t('Request baseline approval')}</button>
          </div>
        </form>
      ) : null}

      {activeBaseline ? (
        <div className="production-line-register" role="table" aria-label={t('Production baseline lines')}>
          {lines.map((line) => (
            <div className={`production-line-row ${line.atRisk ? 'production-line-risk' : ''}`} role="row" key={line.lineKey}>
              <div className="production-line-copy" role="cell"><strong>{line.description}</strong><small>{line.costCode} / {line.lineKey}</small></div>
              <div role="cell"><span>{t('Installed')}</span><strong>{roundDisplay(line.installedQuantity)} / {roundDisplay(line.plannedQuantity)} {line.unit}</strong></div>
              <div role="cell"><span>{t('Earned / crew')}</span><strong>{roundDisplay(line.earnedHours)} / {roundDisplay(line.crewHours)} h</strong></div>
              <div role="cell"><span>{t('Factor')}</span><strong>{line.performanceFactor === null ? t('Not rated') : roundDisplay(line.performanceFactor)}</strong></div>
            </div>
          ))}
        </div>
      ) : !editingBaseline ? (
        <Empty title={t('No approved production baseline')} detail={t('An office operator must retain measured plan quantities and labor hours before field output can be recorded.')} />
      ) : null}

      {activeBaseline && canReport ? (
        <form className="production-entry-form" data-testid="production-entry-form" onSubmit={submitEntry}>
          <div className="production-entry-heading">
            <div className="production-entry-copy"><strong>{t('Record installed output')}</strong><small>{t('Operational crew hours support productivity review and do not replace payroll time cards.')}</small></div>
            <div className="production-outbox-status" aria-live="polite">
              {outboxPending ? (
                <button type="button" className="secondary-button" disabled={outboxSyncing || navigator.onLine === false} onClick={onSyncOutbox}>
                  <RefreshCw size={14} className={outboxSyncing ? 'spin' : ''} />
                  {outboxSyncing ? t('Syncing...') : t('{count} queued', { count: outboxPending })}
                </button>
              ) : (
                <span className="tag tag-green">{t('Outbox clear')}</span>
              )}
            </div>
          </div>
          <div className="form-grid">
            <label>{t('Production line')}<select required value={entryDraft.lineKey} onChange={(event) => setEntryDraft({ ...entryDraft, lineKey: event.target.value })}>{lines.map((line) => <option key={line.lineKey} value={line.lineKey}>{line.description} ({line.unit})</option>)}</select></label>
            <label>{t('Work date')}<input required type="date" value={entryDraft.workDate} onChange={(event) => setEntryDraft({ ...entryDraft, workDate: event.target.value })} /></label>
            <label>{t('Installed quantity')}<input required type="number" min="0.0001" step="0.0001" value={entryDraft.quantity} onChange={(event) => setEntryDraft({ ...entryDraft, quantity: event.target.value })} /></label>
            <label>{t('Crew hours')}<input required type="number" min="0" max="12000" step="0.01" value={entryDraft.crewHours} onChange={(event) => setEntryDraft({ ...entryDraft, crewHours: event.target.value })} /></label>
            <label className="form-span">{t('Field note')}<textarea required minLength="3" maxLength="4000" value={entryDraft.note} onChange={(event) => setEntryDraft({ ...entryDraft, note: event.target.value })} placeholder={t('Record measured area, work location, crew conditions, and evidence reference.')} /></label>
          </div>
          <div className="modal-actions"><button className="primary-button" disabled={submitting}><Activity size={15} />{submitting ? t('Recording...') : navigator.onLine === false ? t('Save output offline') : t('Record output')}</button></div>
        </form>
      ) : null}

      {entries.length ? (
        <div className="production-entry-register" aria-label={t('Recent production entries')}>
          {entries.slice(0, 10).map((entry) => {
            const line = (activeBaseline?.snapshot?.lines || EMPTY_LIST).find((item) => item.lineKey === entry.lineKey)
            return (
              <div className="production-entry-row" key={entry.id}>
                <div><strong>{line?.description || entry.lineKey}</strong><small>{formatDate(entry.workDate)} / {entry.note || t('No note')}</small></div>
                <div><span>{roundDisplay(entry.quantity)} {line?.unit || t('unit')}</span><span>{roundDisplay(entry.crewHours)} h</span><span className={`status status-${entry.status}`}>{t(formatStatus(entry.status))}</span></div>
                {canCoordinate && entry.status === 'recorded' ? <button type="button" className="icon-button" aria-label={t('Request reversal for {line}', { line: line?.description || entry.lineKey })} onClick={() => { setReversalEntryId(entry.id); setReversalReason('') }}><RefreshCw size={15} /></button> : null}
              </div>
            )
          })}
        </div>
      ) : null}

      {reversalEntryId ? (
        <form className="production-reversal-form" data-testid="production-reversal-form" onSubmit={submitReversal}>
          <label>{t('Reversal reason')}<textarea autoFocus required minLength="5" maxLength="2000" value={reversalReason} onChange={(event) => setReversalReason(event.target.value)} /></label>
          <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setReversalEntryId(null)}>{t('Cancel')}</button><button className="primary-button" disabled={submitting || reversalReason.trim().length < 5}><ShieldCheck size={15} />{t('Request reversal approval')}</button></div>
        </form>
      ) : null}

      <p className="workflow-note">{t('Baseline approval, field capture, and reversals stay internal. Contractor.AI does not alter payroll, budget, schedule, scope, or external commitments from these records.')}</p>
    </section>
  )
}



export default ProductionControl

export { ProductionControl }
