import './JobWorkspaceControls.css'
import { useEffect, useState } from 'react'
import { ArrowUpRight, BadgeCheck, ClipboardPenLine, Plus, ReceiptEuro, RefreshCw, ShieldCheck, X } from 'lucide-react'
import { createFieldEvidenceDraftId } from '../field-outbox'
import { currency, EMPTY_LIST, formatDate, formatStatus, futureDateInput, roundDisplay, toIsoDateTime, toLocalDateTimeInput } from '../dashboard-format'
import { operatorText } from '../operator-locale'
import Empty from './EmptyState'



function emptyDayworkLine(type = 'labor') {
  return {
    lineKey: `daywork-line-${createFieldEvidenceDraftId()}`.slice(0, 80),
    lineType: type,
    description: '',
    quantity: '',
    unit: ['labor', 'equipment'].includes(type) ? 'hour' : 'unit',
    costCode: `DAYWORK_${type.toUpperCase()}`,
    sourceReference: '',
  }
}

function emptyDayworkDraft() {
  return {
    entryKey: createFieldEvidenceDraftId(),
    workerId: '',
    workDate: futureDateInput(0),
    title: '',
    description: '',
    reason: '',
    evidenceReference: '',
    notes: '',
    lines: [emptyDayworkLine()],
  }
}

function emptyDayworkAcknowledgement() {
  return {
    evidenceReference: '',
    acknowledgedBy: '',
    acknowledgedAt: toLocalDateTimeInput(new Date()),
    notes: '',
  }
}

function DayworkControl({
  job,
  locale,
  canReport,
  canCoordinate,
  canApprove,
  submitting,
  outboxPending,
  outboxSyncing,
  onSubmit,
  onRequestAcknowledgement,
  onConvert,
  onOpenApprovals,
  onSyncOutbox,
}) {
  const t = (key, variables = {}) => operatorText(locale, key, variables)
  const tickets = job.dayworkTickets || EMPTY_LIST
  const pendingApprovals = job.approvals?.filter((approval) => approval.status === 'pending') || EMPTY_LIST
  const assignments = (job.assignments || EMPTY_LIST).filter((assignment) => !['released', 'cancelled', 'completed', 'closed', 'rejected'].includes(assignment.status))
  const [draft, setDraft] = useState(() => emptyDayworkDraft())
  const [acknowledgementTicketId, setAcknowledgementTicketId] = useState('')
  const [acknowledgement, setAcknowledgement] = useState(() => emptyDayworkAcknowledgement())
  const [pricingTicketId, setPricingTicketId] = useState('')
  const [prices, setPrices] = useState({})
  const [scheduleDeltaDays, setScheduleDeltaDays] = useState('0')
  const [online, setOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine !== false)
  const pendingCount = tickets.filter((ticket) => ['pending_approval', 'approved', 'acknowledged'].includes(ticket.status)).length
  const acknowledgedCount = tickets.filter((ticket) => ticket.acknowledgementReference || ticket.acknowledged).length
  const convertedCount = tickets.filter((ticket) => ticket.status === 'converted').length

  useEffect(() => {
    setDraft(emptyDayworkDraft())
    setAcknowledgementTicketId('')
    setAcknowledgement(emptyDayworkAcknowledgement())
    setPricingTicketId('')
    setPrices({})
    setScheduleDeltaDays('0')
  }, [job.id])

  useEffect(() => {
    const updateConnectivity = () => setOnline(navigator.onLine !== false)
    window.addEventListener('online', updateConnectivity)
    window.addEventListener('offline', updateConnectivity)
    return () => {
      window.removeEventListener('online', updateConnectivity)
      window.removeEventListener('offline', updateConnectivity)
    }
  }, [])

  function updateLine(index, patch) {
    setDraft((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line),
    }))
  }

  function changeLineType(index, lineType) {
    updateLine(index, {
      lineType,
      unit: ['labor', 'equipment'].includes(lineType) ? 'hour' : 'unit',
      costCode: `DAYWORK_${lineType.toUpperCase()}`,
    })
  }

  async function submitTicket(event) {
    event.preventDefault()
    const lines = draft.lines.map((line) => ({
      ...line,
      description: line.description.trim(),
      quantity: Number(line.quantity),
      unit: line.unit.trim(),
      costCode: line.costCode.trim(),
      sourceReference: line.sourceReference.trim() || null,
    }))
    if (
      draft.title.trim().length < 2
      || draft.description.trim().length < 3
      || draft.reason.trim().length < 3
      || draft.evidenceReference.trim().length < 3
      || lines.some((line) => line.description.length < 2 || !(line.quantity > 0) || !line.unit || line.costCode.length < 2)
    ) return
    const selectedAssignment = assignments.find((assignment) => assignment.workerId === draft.workerId)
    const retained = await onSubmit({
      ...draft,
      workerName: selectedAssignment?.workerName || null,
      title: draft.title.trim(),
      description: draft.description.trim(),
      reason: draft.reason.trim(),
      evidenceReference: draft.evidenceReference.trim(),
      notes: draft.notes.trim() || null,
      lines,
      source: 'job_workspace_daywork',
    })
    if (retained) setDraft(emptyDayworkDraft())
  }

  function beginAcknowledgement(ticket) {
    setPricingTicketId('')
    setAcknowledgementTicketId(ticket.id)
    setAcknowledgement(emptyDayworkAcknowledgement())
  }

  async function submitAcknowledgement(event) {
    event.preventDefault()
    if (
      !acknowledgementTicketId
      || acknowledgement.evidenceReference.trim().length < 3
      || acknowledgement.acknowledgedBy.trim().length < 2
      || !acknowledgement.acknowledgedAt
    ) return
    const retained = await onRequestAcknowledgement(acknowledgementTicketId, {
      evidenceReference: acknowledgement.evidenceReference.trim(),
      acknowledgedBy: acknowledgement.acknowledgedBy.trim(),
      acknowledgedAt: toIsoDateTime(acknowledgement.acknowledgedAt),
      notes: acknowledgement.notes.trim() || null,
    })
    if (retained) {
      setAcknowledgementTicketId('')
      setAcknowledgement(emptyDayworkAcknowledgement())
    }
  }

  function beginPricing(ticket) {
    setAcknowledgementTicketId('')
    setPricingTicketId(ticket.id)
    setPrices(Object.fromEntries((ticket.lines || EMPTY_LIST).map((line) => [line.lineKey, ''])))
    setScheduleDeltaDays('0')
  }

  async function submitPricing(event) {
    event.preventDefault()
    const ticket = tickets.find((item) => item.id === pricingTicketId)
    if (!ticket) return
    const retainedPrices = (ticket.lines || EMPTY_LIST).map((line) => ({
      lineKey: line.lineKey,
      unitPrice: Number(prices[line.lineKey]),
    }))
    if (retainedPrices.some((line) => !(line.unitPrice >= 0))) return
    const retained = await onConvert(ticket.id, {
      prices: retainedPrices,
      scheduleDeltaDays: Number(scheduleDeltaDays || 0),
      taxRate: 21,
      currency: 'EUR',
    })
    if (retained) {
      setPricingTicketId('')
      setPrices({})
      setScheduleDeltaDays('0')
    }
  }

  return (
    <section className="job-workspace-section daywork-control" data-testid="daywork-control">
      <div className="section-heading daywork-heading">
        <ClipboardPenLine size={18} />
        <div>
          <h3>{t('Daywork and extra work')}</h3>
          <p>{t('Retain observed site quantities first, then route acknowledgement and pricing through separate approval gates.')}</p>
        </div>
        <div className="daywork-outbox-status" aria-live="polite">
          {outboxPending ? (
            <button type="button" className="secondary-button" disabled={outboxSyncing || !online} onClick={onSyncOutbox}>
              <RefreshCw size={14} className={outboxSyncing ? 'spin' : ''} />
              {outboxSyncing ? t('Syncing...') : t('{count} queued', { count: outboxPending })}
            </button>
          ) : <span className="tag tag-green">{t('Outbox clear')}</span>}
        </div>
      </div>

      <div className="daywork-summary" aria-label={t('Daywork ticket summary')}>
        <div><span>{t('Tickets')}</span><strong>{tickets.length}</strong></div>
        <div><span>{t('Open control')}</span><strong>{pendingCount}</strong></div>
        <div><span>{t('Acknowledged')}</span><strong>{acknowledgedCount}</strong></div>
        <div><span>{t('Converted')}</span><strong>{convertedCount}</strong></div>
      </div>

      {canReport ? (
        <form className="daywork-entry-form" data-testid="daywork-entry-form" onSubmit={submitTicket}>
          <div className="daywork-form-heading">
            <div><strong>{t('Record observed extra work')}</strong><small>{t('Quantities and evidence are retained without price, scope acceptance, or external commitment.')}</small></div>
          </div>
          <div className="form-grid">
            <label>{t('Work date')}<input required type="date" value={draft.workDate} onChange={(event) => setDraft({ ...draft, workDate: event.target.value })} /></label>
            {canCoordinate ? (
              <label>{t('Responsible worker')}<select value={draft.workerId} onChange={(event) => setDraft({ ...draft, workerId: event.target.value })}><option value="">{t('Office record / unassigned')}</option>{assignments.map((assignment) => <option key={assignment.id} value={assignment.workerId}>{assignment.workerName || assignment.workerId}</option>)}</select></label>
            ) : null}
            <label className="form-span">{t('Title')}<input required minLength="2" maxLength="240" value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={t('Additional work observed')} /></label>
            <label className="form-span">{t('Work completed')}<textarea required minLength="3" maxLength="4000" value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} placeholder={t('Record location, completed work, and site conditions.')} /></label>
            <label className="form-span">{t('Reason')}<textarea required minLength="3" maxLength="2000" value={draft.reason} onChange={(event) => setDraft({ ...draft, reason: event.target.value })} placeholder={t('Record why this work was outside or changed from the retained basis.')} /></label>
            <label>{t('Evidence reference')}<input required minLength="3" maxLength="500" value={draft.evidenceReference} onChange={(event) => setDraft({ ...draft, evidenceReference: event.target.value })} placeholder={t('Photo set, drawing, instruction')} /></label>
            <label>{t('Internal note')}<input maxLength="2000" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} /></label>
          </div>
          <div className="daywork-lines" aria-label={t('Observed daywork quantities')}>
            {draft.lines.map((line, index) => (
              <div className="daywork-line-editor" key={line.lineKey}>
                <label>{t('Type')}<select value={line.lineType} onChange={(event) => changeLineType(index, event.target.value)}><option value="labor">{t('Labor')}</option><option value="material">{t('Material')}</option><option value="equipment">{t('Equipment')}</option><option value="subcontract">{t('Subcontract')}</option><option value="other">{t('Other')}</option></select></label>
                <label className="daywork-line-description">{t('Description')}<input required minLength="2" maxLength="240" value={line.description} onChange={(event) => updateLine(index, { description: event.target.value })} /></label>
                <label>{t('Quantity')}<input required type="number" min="0.0001" step="0.0001" value={line.quantity} onChange={(event) => updateLine(index, { quantity: event.target.value })} /></label>
                <label>{t('Unit')}<input required maxLength="24" value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value })} /></label>
                <label>{t('Cost code')}<input required minLength="2" maxLength="80" value={line.costCode} onChange={(event) => updateLine(index, { costCode: event.target.value })} /></label>
                <label>{t('Line evidence')}<input maxLength="240" value={line.sourceReference} onChange={(event) => updateLine(index, { sourceReference: event.target.value })} /></label>
                {draft.lines.length > 1 ? <button type="button" className="icon-button" aria-label={t('Remove daywork line {number}', { number: index + 1 })} onClick={() => setDraft((current) => ({ ...current, lines: current.lines.filter((_, lineIndex) => lineIndex !== index) }))}><X size={15} /></button> : <span className="daywork-line-spacer" />}
              </div>
            ))}
          </div>
          <div className="modal-actions">
            <button type="button" className="secondary-button" disabled={submitting || draft.lines.length >= 50} onClick={() => setDraft((current) => ({ ...current, lines: [...current.lines, emptyDayworkLine('material')] }))}><Plus size={15} />{t('Quantity line')}</button>
            <button className="primary-button" disabled={submitting}><ClipboardPenLine size={15} />{submitting ? t('Retaining...') : !online ? t('Save daywork offline') : t('Submit for review')}</button>
          </div>
        </form>
      ) : null}

      {tickets.length ? (
        <div className="daywork-register" aria-label={t('Retained daywork tickets')}>
          {tickets.map((ticket) => {
            const pendingTicketApproval = pendingApprovals.find((approval) => approval.targetType === 'daywork_ticket' && approval.targetId === ticket.id)
            const pendingAcknowledgementApproval = pendingApprovals.find((approval) => approval.targetType === 'daywork_acknowledgement' && approval.targetId === ticket.id)
            const isPricing = pricingTicketId === ticket.id
            const pricingTotal = (ticket.lines || EMPTY_LIST).reduce((sum, line) => sum + Number(line.quantity || 0) * Number(prices[line.lineKey] || 0), 0)
            return (
              <article className="daywork-ticket" key={ticket.id} data-testid={`daywork-ticket-${ticket.id}`}>
                <div className="daywork-ticket-heading">
                  <div><strong>{ticket.ticketNumber || ticket.title}</strong><span className={`status status-${ticket.status}`}>{t(formatStatus(ticket.status))}</span></div>
                  <small>{formatDate(ticket.workDate)} / {ticket.workerName || t('Office record')} / {t('{count} line(s)', { count: ticket.lineCount || ticket.lines?.length || 0 })}</small>
                </div>
                <div className="daywork-ticket-copy"><strong>{ticket.title}</strong><p>{ticket.description}</p><small>{t('Reason: {reason}', { reason: ticket.reason })}</small><small>{t('Evidence: {reference}', { reference: ticket.evidenceReference })}</small></div>
                <div className="daywork-ticket-lines">
                  {(ticket.lines || EMPTY_LIST).map((line) => <div key={line.lineKey}><span>{t(formatStatus(line.lineType))}</span><strong>{roundDisplay(line.quantity)} {line.unit}</strong><small>{line.description} / {line.costCode}</small></div>)}
                </div>
                <div className="daywork-ticket-actions">
                  {pendingTicketApproval && canApprove ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => onOpenApprovals({ approvalId: pendingTicketApproval.id, jobId: job.id, jobTitle: job.title })}><ShieldCheck size={15} />{t('Review quantities')}</button> : null}
                  {pendingAcknowledgementApproval && canApprove ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => onOpenApprovals({ approvalId: pendingAcknowledgementApproval.id, jobId: job.id, jobTitle: job.title })}><ShieldCheck size={15} />{t('Review acknowledgement')}</button> : null}
                  {canCoordinate && ticket.status === 'approved' && !pendingAcknowledgementApproval ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => beginAcknowledgement(ticket)}><BadgeCheck size={15} />{t('Record acknowledgement')}</button> : null}
                  {canCoordinate && ['approved', 'acknowledged'].includes(ticket.status) ? <button type="button" className="secondary-button" disabled={submitting} onClick={() => beginPricing(ticket)}><ReceiptEuro size={15} />{t('Price change')}</button> : null}
                </div>
                {acknowledgementTicketId === ticket.id ? (
                  <form className="daywork-inline-form" data-testid="daywork-acknowledgement-form" onSubmit={submitAcknowledgement}>
                    <div className="form-grid"><label>{t('Evidence reference')}<input required minLength="3" maxLength="500" value={acknowledgement.evidenceReference} onChange={(event) => setAcknowledgement({ ...acknowledgement, evidenceReference: event.target.value })} /></label><label>{t('Acknowledged by')}<input required minLength="2" maxLength="160" value={acknowledgement.acknowledgedBy} onChange={(event) => setAcknowledgement({ ...acknowledgement, acknowledgedBy: event.target.value })} /></label><label>{t('Date and time')}<input required type="datetime-local" value={acknowledgement.acknowledgedAt} onChange={(event) => setAcknowledgement({ ...acknowledgement, acknowledgedAt: event.target.value })} /></label><label>{t('Internal note')}<input maxLength="2000" value={acknowledgement.notes} onChange={(event) => setAcknowledgement({ ...acknowledgement, notes: event.target.value })} /></label></div>
                    <p className="workflow-note">{t('This records receipt of the site record only. It does not accept price or scope.')}</p>
                    <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setAcknowledgementTicketId('')}>{t('Cancel')}</button><button className="primary-button" disabled={submitting}><ShieldCheck size={15} />{t('Request evidence review')}</button></div>
                  </form>
                ) : null}
                {isPricing ? (
                  <form className="daywork-inline-form" data-testid="daywork-pricing-form" onSubmit={submitPricing}>
                    <div className="daywork-price-lines">{(ticket.lines || EMPTY_LIST).map((line) => <label key={line.lineKey}><span>{line.description}<small>{roundDisplay(line.quantity)} {line.unit}</small></span><input required type="number" min="0" max="1000000000" step="0.01" value={prices[line.lineKey] || ''} onChange={(event) => setPrices((current) => ({ ...current, [line.lineKey]: event.target.value }))} placeholder={t('Unit price')} /></label>)}</div>
                    <div className="daywork-price-summary"><label>{t('Schedule impact (days)')}<input type="number" min="-3650" max="3650" step="0.5" value={scheduleDeltaDays} onChange={(event) => setScheduleDeltaDays(event.target.value)} /></label><div><span>{t('Net change preview')}</span><strong>{currency.format(pricingTotal)}</strong></div></div>
                    <p className="workflow-note">{t('Conversion creates a separate approval-gated change order. It does not contact the client or change contract value.')}</p>
                    <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setPricingTicketId('')}>{t('Cancel')}</button><button className="primary-button" disabled={submitting || !(pricingTotal > 0)}><ArrowUpRight size={15} />{t('Prepare change order')}</button></div>
                  </form>
                ) : null}
              </article>
            )
          })}
        </div>
      ) : <Empty title={t('No daywork tickets')} detail={t('Observed extra work will appear here after field or office capture.')} />}

      <p className="workflow-note">{t('Autonomy may surface missing reviews, but it cannot invent quantities, acknowledgement, pricing, client acceptance, supplier spend, schedule commitments, invoices, payments, or funds movement.')}</p>
    </section>
  )
}



export default DayworkControl

export { DayworkControl }
