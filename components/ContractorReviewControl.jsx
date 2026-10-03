import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, ArrowUpRight, Calculator, ChevronDown, ClipboardCheck, Play, RefreshCw, Save, X } from 'lucide-react'
import { operatorText } from '../operator-locale'
import './ContractorReviewControl.css'

const CHECK_LABELS = {
  no_active_tasks: 'No active work tasks', planned_start_required: 'Work-plan start missing',
  task_durations_required: 'Task durations missing', target_exceeded: 'Customer target exceeded',
  material_availability_unresolved: 'Material availability unresolved', material_requirement_missing: 'Linked material requirement missing',
  pending_approvals: 'Pending approvals', forecast_over_budget: 'Forecast exceeds budget',
  approved_scope_missing: 'Approved scope missing', review_failed: 'Review failed',
}
const MATERIAL_READINESS_LABELS = {
  covered_by_stock_and_issued_orders: 'Covered by accepted stock and issued orders',
  additional_supply_confirmation_required: 'Additional supply needs confirmation before linked work can proceed',
  existing_supplier_eta_applies: 'Existing supplier ETA applies to the current requirement',
  work_already_material_blocked: 'Linked work is already blocked by material availability',
  no_linked_active_task: 'No active work steps are explicitly linked to this material requirement',
}

function ClientDecisionImpactLinks({ api, jobId, decision, targets, locale, canEdit, onSaved }) {
  const t = (key, values) => operatorText(locale, key, values)
  const [links, setLinks] = useState(decision.impactLinks || [])
  const [targetType, setTargetType] = useState('task')
  const choices = useMemo(() => ({ task: targets.tasks || [], material_requirement: targets.materialRequirements || [], takeoff_item: targets.takeoffItems || [], drawing_revision: targets.drawingRevisions || [] })[targetType] || [], [targetType, targets])
  const [targetId, setTargetId] = useState(choices[0]?.id || '')
  const [rationale, setRationale] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const initial = JSON.stringify(decision.impactLinks || [])
  const dirty = JSON.stringify(links) !== initial

  useEffect(() => { setTargetId(choices[0]?.id || '') }, [choices])

  async function save(event) {
    event.preventDefault()
    if (!canEdit || busy || !dirty) return
    setBusy(true)
    setError('')
    try {
      await api(`/api/ledger/jobs/${encodeURIComponent(jobId)}/client-selections/${encodeURIComponent(decision.id)}/impact-links`, {
        method: 'POST', body: JSON.stringify({ links })
      })
      await onSaved()
    } catch (reason) { setError(reason.message) }
    finally { setBusy(false) }
  }

  return <details className="decision-impact-links">
    <summary>{t('Work linked to this choice')} ({decision.impactLinks.length})</summary>
    {decision.impactLinks.length ? <ul>{decision.impactLinks.map((link, index) => <li key={`${link.targetType}:${link.targetId}`}>
      <strong>{link.targetTitle || t('Linked record unavailable')}</strong> ({t(({ task: 'Work step', material_requirement: 'Material requirement', takeoff_item: 'Takeoff item', drawing_revision: 'Drawing revision' })[link.targetType] || 'Linked record unavailable')})
      {!link.targetCurrent ? <span className="review-warning"> · {t('Target is no longer available in this job')}</span> : null}
      <p>{link.rationale}</p>
      {canEdit ? <button type="button" className="icon-button" aria-label={t('Remove link {number}', { number: index + 1 })} title={t('Remove link')} disabled={busy} onClick={() => setLinks(current => current.filter((_, row) => row !== index))}><X size={16} /></button> : null}
    </li>)}</ul> : <p>{t('No work is explicitly linked to this choice.')}</p>}
    {canEdit ? <form className="decision-link-form" onSubmit={save}>
      <label>{t('Linked record type')}<select value={targetType} onChange={event => setTargetType(event.target.value)}>
        <option value="task">{t('Work step')}</option><option value="material_requirement">{t('Material requirement')}</option>
        <option value="takeoff_item">{t('Takeoff item')}</option><option value="drawing_revision">{t('Drawing revision')}</option>
      </select></label>
      <label>{t('Linked record')}<select value={targetId} onChange={event => setTargetId(event.target.value)} required disabled={!choices.length}>
        {choices.map(choice => <option key={choice.id} value={choice.id}>{choice.title}{choice.unit ? ` (${choice.unit})` : ''}</option>)}
      </select></label>
      <label>{t('Why is this choice linked?')}<input value={rationale} maxLength={500} onChange={event => setRationale(event.target.value)} /></label>
      <button type="button" className="secondary-button" disabled={!targetId || rationale.trim().length < 3 || links.some(link => link.targetType === targetType && link.targetId === targetId)} onClick={() => {
        setLinks(current => [...current, { targetType, targetId, rationale: rationale.trim() }])
        setRationale('')
      }}>{t('Add work link')}</button>
      {choices.length === 0 ? <p>{t('No active records of this type are available in this job.')}</p> : null}
      <button type="submit" className="secondary-button" disabled={busy || !dirty}>{t('Save decision links')}</button>
    </form> : null}
    {error ? <p role="alert">{error}</p> : null}
  </details>
}

function ImpactReview({ api, job, locale, canEdit, onOpenJob, refreshKey }) {
  const t = (key, values) => operatorText(locale, key, values)
  const [detail, setDetail] = useState(null)
  const [form, setForm] = useState({ taskId: '', durationHours: '8', costDelta: '0', revenueDelta: '0', quantityChanges: [], materialChanges: [], drawingChanges: [], reason: '' })
  const [preview, setPreview] = useState(null)
  const [entryKey, setEntryKey] = useState('')
  const [variationReviewId, setVariationReviewId] = useState('')
  const [variationForm, setVariationForm] = useState({ title: '', scopeDelta: '', amount: '', scheduleDeltaDays: '0', variationType: 'other', initiatedBy: 'contractor' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [revision, setRevision] = useState(0)
  const lock = useRef(false)
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    let current = true
    setDetail(null)
    setError('')
    setPreview(null)
    api(`/api/ledger/jobs/${encodeURIComponent(job.id)}/change-impact`).then(result => {
      if (!current) return
      setDetail(result)
      setForm(value => ({ ...value, taskId: result.schedule.tasks[0]?.id || '', durationHours: String(result.schedule.tasks[0]?.durationHours || 8) }))
    }).catch(reason => { if (current) setError(reason.message) })
    return () => { current = false }
  }, [api, job.id, refreshKey, revision])

  function edit(key, value) {
    setPreview(null)
    setMessage('')
    setForm(current => ({ ...current, [key]: value, ...(key === 'taskId' ? { durationHours: String(detail.schedule.tasks.find(task => task.id === value)?.durationHours || 8) } : {}) }))
  }
  async function refreshDecisionLinks() {
    setPreview(null)
    setMessage(t('Decision links saved; prior impact analyses are now stale.'))
    setRevision(value => value + 1)
  }
  const takeoffItems = (detail?.takeoffs || []).flatMap(takeoff => takeoff.status === 'cancelled' || takeoff.integrityValid === false ? []
    : takeoff.items.map(item => ({ ...item, takeoffId: takeoff.id, takeoffTitle: takeoff.title, takeoffStatus: takeoff.status, currency: takeoff.currency })))
  function addQuantityChange() {
    const item = takeoffItems.find(candidate => !form.quantityChanges.some(change => change.itemId === candidate.id))
    if (!item) return
    edit('quantityChanges', [...form.quantityChanges, { itemId: item.id, quantity: String(item.quantity) }])
  }
  const materialRequirements = detail?.materialRequirements || []
  function addMaterialChange() {
    const requirement = materialRequirements.find(candidate => !form.materialChanges.some(change => change.requirementId === candidate.id))
    if (!requirement) return
    edit('materialChanges', [...form.materialChanges, { requirementId: requirement.id, quantity: String(requirement.quantity) }])
  }
  async function submit(mode) {
    if (lock.current || !canEdit || (mode === 'retain' && !preview)) return
    lock.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const payload = mode === 'retain' ? { ...preview.scenario, sourceHash: preview.sourceHash, entryKey } : { ...form, currency: 'EUR' }
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(job.id)}/change-impact`, { method: 'POST', body: JSON.stringify({ ...payload, mode }) })
      if (!mounted.current) return
      if (mode === 'preview') {
        setPreview(result.review)
        setEntryKey(crypto.randomUUID())
      } else {
        setPreview(null)
        setDetail(current => ({ ...current, reviews: [result.review, ...current.reviews.filter(row => row.id !== result.review.id)].slice(0, 20) }))
        setMessage('Analysis retained. Agreements unchanged.')
      }
    } catch (reason) {
      if (mounted.current) { setError(reason.message); if (reason.status === 409) setPreview(null) }
    } finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  async function prepareVariation(review) {
    if (lock.current || !canEdit || !review?.sourceCurrent || !variationForm.title.trim() || variationForm.scopeDelta.trim().length < 3 || variationForm.amount === '') return
    lock.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await api(`/api/ledger/jobs/${encodeURIComponent(job.id)}/change-impact`, {
        method: 'POST',
        body: JSON.stringify({
          mode: 'prepare_variation',
          reviewId: review.id,
          sourceHash: review.sourceHash,
          entryKey: crypto.randomUUID(),
          ...variationForm,
          title: variationForm.title.trim(),
          scopeDelta: variationForm.scopeDelta.trim(),
          amount: Number(variationForm.amount),
          scheduleDeltaDays: Number(variationForm.scheduleDeltaDays)
        })
      })
      if (!mounted.current) return
      setVariationReviewId('')
      setVariationForm({ title: '', scopeDelta: '', amount: '', scheduleDeltaDays: '0', variationType: 'other', initiatedBy: 'contractor' })
      setMessage(`${result.changeOrder.variationNumber} revision ${result.changeOrder.revisionNumber} retained as a draft; internal approval is pending.`)
      setRevision(value => value + 1)
    } catch (reason) {
      if (mounted.current) setError(reason.message)
    } finally { lock.current = false; if (mounted.current) setBusy(false) }
  }
  const date = value => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : t('Unknown')
  const amount = value => new Intl.NumberFormat(locale, { style: 'currency', currency: preview?.financial.currency || 'EUR' }).format(value)
  const amountAs = (value, currency) => new Intl.NumberFormat(locale, { style: 'currency', currency }).format(value)
  const contractualContext = detail?.contractualContext || preview?.contractualContext || { scope: { state: 'missing', current: null, pending: null }, clientDecisions: [] }
  const decisionContextSection = detail?.contractualContext ? <section aria-label={t('Contract and client decision context')}>
    <h4>{t('Contract and client decision context')}</h4>
    <p>{t('Client choices and approved scope are context for manual review. The system does not infer which choice changes which task, quantity, or contract term.')}</p>
    <p><strong>{t('Approved scope')}: </strong>{t(({ current: 'Current source', source_changed: 'Source changed', approval_pending: 'Approval pending', missing: 'Not recorded' })[contractualContext.scope.state] || 'Not recorded')}</p>
    {contractualContext.scope.current ? <div>
      <p>{contractualContext.scope.current.title} · v{contractualContext.scope.current.versionNumber} · {t(contractualContext.scope.current.integrityValid ? 'snapshot verified' : 'snapshot invalid')}</p>
      {contractualContext.scope.current.terms?.scopeSummary ? <p>{contractualContext.scope.current.terms.scopeSummary}</p> : null}
      {contractualContext.scope.current.terms?.inclusions?.length ? <p>{t('Inclusions')}: {contractualContext.scope.current.terms.inclusions.join('; ')}</p> : null}
      {contractualContext.scope.current.terms?.exclusions?.length ? <p>{t('Exclusions')}: {contractualContext.scope.current.terms.exclusions.join('; ')}</p> : null}
    </div> : null}
    {contractualContext.scope.pending ? <p className="review-warning">{t('Pending scope revision')}: {contractualContext.scope.pending.title} · v{contractualContext.scope.pending.versionNumber}</p> : null}
    {contractualContext.scope.state === 'source_changed' ? <p className="review-warning">{t('The approved scope no longer matches current job, drawing, survey, or client-selection evidence. Re-establish the contract basis before relying on it.')}</p> : null}
    <h4>{t('Client decisions to review')} ({contractualContext.clientDecisions.length})</h4>
    {!contractualContext.clientDecisions.length ? <p>{t('No client decisions are recorded for this job.')}</p> : <ul>
      {contractualContext.clientDecisions.map(decision => <li key={decision.id}>
        <strong>{decision.title}</strong> · {t(decision.status)}{decision.selectedOption ? ` · ${t('Selected')}: ${decision.selectedOption}` : ''}
        {decision.dueAt ? <p>{t('Decision due')}: {date(decision.dueAt)}</p> : null}
        {decision.approvalStatus === 'pending' ? <p className="review-warning">{t('Internal approval is still pending.')}</p> : null}
        {decision.open ? <p className="review-warning">{t('Client decision remains open; resolve it before treating related work as settled.')}</p> : null}
        <ClientDecisionImpactLinks key={decision.id} api={api} jobId={job.id} decision={decision} targets={contractualContext.impactTargets || { tasks: [], materialRequirements: [], takeoffItems: [], drawingRevisions: [] }} locale={locale} canEdit={canEdit} onSaved={refreshDecisionLinks} />
      </li>)}
    </ul>}
  </section> : null
  return <div className="impact-review">
    <header><h3>{job.title}</h3><button type="button" className="icon-button" title={t('Open dossier')} aria-label={t('Open dossier')} disabled={busy} onClick={() => onOpenJob?.(job)}><ArrowUpRight size={18} /></button></header>
    {error ? <div role="alert"><p>{error}</p><button type="button" className="secondary-button" disabled={busy} onClick={() => setRevision(value => value + 1)}>{t('Retry')}</button></div> : null}
    {!detail && !error ? <p role="status">{t('Loading...')}</p> : null}
    {message ? <p role="status">{t(message)}</p> : null}
    {detail ? <>
      {canEdit && detail.schedule.tasks.length ? <form onSubmit={event => { event.preventDefault(); void submit('preview') }}>
        <fieldset disabled={busy} className="impact-form">
          <legend>{t('Change impact')}</legend>
          <label>{t('Work task')}<select value={form.taskId} onChange={event => edit('taskId', event.target.value)}>{detail.schedule.tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
          <label>{t('Proposed duration (hours)')}<input type="number" min="0.01" max="100000" step="0.01" required value={form.durationHours} onChange={event => edit('durationHours', event.target.value)} /></label>
          <label>{t('Cost change (EUR)')}<input type="number" min="-1000000000" max="1000000000" step="0.01" required value={form.costDelta} onChange={event => edit('costDelta', event.target.value)} /></label>
          <label>{t('Revenue change (EUR)')}<input type="number" min="-1000000000" max="1000000000" step="0.01" required value={form.revenueDelta} onChange={event => edit('revenueDelta', event.target.value)} /></label>
          {takeoffItems.length ? <section className="impact-quantity-changes" aria-label={t('Measured quantity changes')}>
            <h4>{t('Measured quantity changes')}</h4>
            <p>{t('Existing takeoff rates calculate the proposed quantity cost and revenue delta. No takeoff record is changed.')}</p>
            <p>{t('Manual cost and revenue estimates are added to same-currency measured quantity deltas.')}</p>
            {form.quantityChanges.map((change, index) => <div className="impact-quantity-row" key={`${change.itemId}:${index}`}>
              <label>{t('Takeoff item')}<select aria-label={`${t('Takeoff item')} ${index + 1}`} value={change.itemId} onChange={event => {
                const item = takeoffItems.find(candidate => candidate.id === event.target.value)
                edit('quantityChanges', form.quantityChanges.map((current, row) => row === index ? { itemId: event.target.value, quantity: String(item?.quantity ?? '') } : current))
              }}>{takeoffItems.filter(item => item.id === change.itemId || !form.quantityChanges.some((other, row) => row !== index && other.itemId === item.id)).map(item => <option key={item.id} value={item.id}>{item.takeoffTitle} / {item.description} ({item.quantity} {item.unit})</option>)}</select></label>
              <label>{t('Proposed quantity')}<input aria-label={`${t('Proposed quantity')} ${index + 1}`} type="number" min="0" max="1000000000" step="0.000001" value={change.quantity} onChange={event => edit('quantityChanges', form.quantityChanges.map((current, row) => row === index ? { ...current, quantity: event.target.value } : current))} /></label>
              <button type="button" className="icon-button" title={t('Remove quantity change')} aria-label={`${t('Remove quantity change')} ${index + 1}`} onClick={() => edit('quantityChanges', form.quantityChanges.filter((_, row) => row !== index))}><X size={16} /></button>
            </div>)}
            <button type="button" className="secondary-button" disabled={form.quantityChanges.length >= Math.min(takeoffItems.length, 50)} onClick={addQuantityChange}>{t('Add measured quantity')}</button>
          </section> : null}
          {materialRequirements.length ? <section className="impact-quantity-changes" aria-label={t('Material requirement changes')}>
            <h4>{t('Material requirement changes')}</h4>
            <p>{t('Compare proposed need with accepted stock and linked undelivered purchase quantities. This is a simulation; no order is created.')}</p>
            {form.materialChanges.map((change, index) => {
              const requirement = materialRequirements.find(item => item.id === change.requirementId)
              return <div className="impact-quantity-row" key={`${change.requirementId}:${index}`}>
                <label>{t('Material requirement')}<select aria-label={`${t('Material requirement')} ${index + 1}`} value={change.requirementId} onChange={event => {
                  const selectedRequirement = materialRequirements.find(item => item.id === event.target.value)
                  edit('materialChanges', form.materialChanges.map((current, row) => row === index ? { requirementId: event.target.value, quantity: String(selectedRequirement?.quantity ?? '') } : current))
                }}>{materialRequirements.filter(item => item.id === change.requirementId || !form.materialChanges.some((other, row) => row !== index && other.requirementId === item.id)).map(item => <option key={item.id} value={item.id}>{item.name} ({item.quantity} {item.unit})</option>)}</select></label>
                <label>{t('Proposed quantity')}<input aria-label={`${t('Proposed quantity')} ${index + 1}`} type="number" min="0" max="1000000000" step="0.0001" value={change.quantity} onChange={event => edit('materialChanges', form.materialChanges.map((current, row) => row === index ? { ...current, quantity: event.target.value } : current))} /></label>
                <button type="button" className="icon-button" title={t('Remove material change')} aria-label={`${t('Remove material change')} ${index + 1}`} onClick={() => edit('materialChanges', form.materialChanges.filter((_, row) => row !== index))}><X size={16} /></button>
                {requirement ? <small>{t('Linked work steps')}: {requirement.linkedTasks?.length || 0}</small> : null}
              </div>
            })}
            <button type="button" className="secondary-button" disabled={form.materialChanges.length >= Math.min(materialRequirements.length, 50)} onClick={addMaterialChange}>{t('Add material quantity')}</button>
          </section> : null}
          {contractualContext.impactTargets?.drawingReplacements?.length ? <section className="impact-quantity-changes" aria-label={t('Drawing revision replacements')}>
            <h4>{t('Drawing revision replacements')}</h4>
            <p>{t('A proposed revision remains pending internal approval. This preview does not publish or replace a drawing.')}</p>
            {form.drawingChanges.map((change, index) => <div className="impact-quantity-row" key={`${change.currentDrawingId}:${index}`}>
              <label>{t('Proposed drawing replacement')}<select aria-label={`${t('Proposed drawing replacement')} ${index + 1}`} value={change.proposedDrawingId} onChange={event => {
                const pair = contractualContext.impactTargets.drawingReplacements.find(item => item.proposedDrawingId === event.target.value)
                edit('drawingChanges', form.drawingChanges.map((current, row) => row === index ? { currentDrawingId: pair.currentDrawingId, proposedDrawingId: pair.proposedDrawingId } : current))
              }}>{contractualContext.impactTargets.drawingReplacements.filter(item => item.proposedDrawingId === change.proposedDrawingId || !form.drawingChanges.some((other, row) => row !== index && other.currentDrawingId === item.currentDrawingId)).map(item => <option key={item.proposedDrawingId} value={item.proposedDrawingId}>{item.title}</option>)}</select></label>
              <button type="button" className="icon-button" title={t('Remove drawing change')} aria-label={`${t('Remove drawing change')} ${index + 1}`} onClick={() => edit('drawingChanges', form.drawingChanges.filter((_, row) => row !== index))}><X size={16} /></button>
            </div>)}
            <button type="button" className="secondary-button" disabled={form.drawingChanges.length >= Math.min(contractualContext.impactTargets.drawingReplacements.length, 50)} onClick={() => {
              const pair = contractualContext.impactTargets.drawingReplacements.find(item => !form.drawingChanges.some(change => change.currentDrawingId === item.currentDrawingId))
              if (pair) edit('drawingChanges', [...form.drawingChanges, { currentDrawingId: pair.currentDrawingId, proposedDrawingId: pair.proposedDrawingId }])
            }}>{t('Add drawing replacement')}</button>
          </section> : null}
          <label className="impact-reason">{t('Change reason')}<textarea required maxLength={2000} value={form.reason} onChange={event => edit('reason', event.target.value)} /></label>
          <button type="submit" className="secondary-button"><Calculator size={16} />{t('Preview impact')}</button>
        </fieldset>
      </form> : <p>{t(detail.schedule.tasks.length ? 'Read-only analysis' : 'No active work tasks')}</p>}
      {decisionContextSection}
      {preview ? <section className="impact-result" aria-label={t('Impact result')}>
        <p>{t('Internal estimate. No agreements or payments changed.')}</p>
        {!preview.schedule.ready ? <p role="status">{t('Schedule incomplete; time impact unknown.')}</p> : <dl>
          <div><dt>{t('Current finish')}</dt><dd>{date(preview.schedule.beforeEnd)}</dd></div>
          <div><dt>{t('Proposed finish')}</dt><dd>{date(preview.schedule.afterEnd)}</dd></div>
          <div><dt>{t('Difference (elapsed hours)')}</dt><dd>{preview.schedule.finishDeltaHours}</dd></div>
        </dl>}
        {preview.schedule.targetExceeded ? <p className="review-warning">{t('Customer target exceeded')}</p> : null}
        <dl>{[['Cost change', 'costDelta'], ['Revenue change', 'revenueDelta'], ['Margin change', 'marginDelta']].map(([label, key]) => <div key={key}><dt>{t(label)}</dt><dd>{amount(preview.financial[key])}</dd></div>)}</dl>
        {preview.financial.currencyMismatch ? <p className="review-warning">{t('Mixed currencies: amounts are not consolidated.')}</p> : null}
        {preview.quantityImpact?.changes?.length ? <>
          <h4>{t('Measured quantity impact')}</h4>
          <ul>{preview.quantityImpact.changes.map(change => <li key={change.itemId}>
            <strong>{change.description}</strong>: {change.currentQuantity} {change.unit} {' > '} {change.proposedQuantity} {change.unit} ({change.quantityDelta > 0 ? '+' : ''}{change.quantityDelta})
            <p>{t('Takeoff cost delta')}: {amountAs(change.costDelta, change.currency)}; {t('Takeoff revenue delta')}: {amountAs(change.revenueDelta, change.currency)}; {change.wbsCode} / {change.workPackage}</p>
          </li>)}</ul>
          <p>{t(preview.quantityImpact.currencyMismatch ? 'Takeoff currency differs from the scenario; quantity deltas are shown separately and excluded from consolidated totals.' : 'Measured quantity deltas are included in the totals above using the existing takeoff rates.')}</p>
        </> : null}
        {preview.drawingImpact?.length ? <section aria-label={t('Drawing revision impact')}>
          <h4>{t('Drawing revision impact')}</h4>
          <ul>{preview.drawingImpact.map(change => <li key={change.proposedDrawingId}>
            <strong>{change.sheetNumber}</strong>: {t('Current revision')} {change.currentRevision} {' > '} {t('Proposed revision')} {change.proposedRevision} · {t('Internal approval')}: {t(change.approvalStatus)}
            <p className="review-warning">{t('This replacement is only a proposal. The current drawing stays in force until approval.')}</p>
          </li>)}</ul>
        </section> : null}
        {preview.materialImpact?.changes?.length ? <section aria-label={t('Material availability impact')}>
          <h4>{t('Material availability impact')}</h4>
          <ul>{preview.materialImpact.changes.map(change => <li key={change.requirementId}>
            <strong>{change.name}</strong>: {change.currentQuantity} {change.unit} {' > '} {change.proposedQuantity} {change.unit}
            <p>{t('Accepted stock')}: {change.availableQuantity} {change.unit}; {t('Open linked orders')}: {change.incomingQuantity} {change.unit}</p>
            <p>{t('Current uncovered quantity')}: {change.currentShortfall} {change.unit}; {t('Proposed uncovered quantity')}: {change.proposedShortfall} {change.unit}</p>
            <p className={change.readiness === 'additional_supply_confirmation_required' || change.readiness === 'work_already_material_blocked' ? 'review-warning' : ''}>{t(MATERIAL_READINESS_LABELS[change.readiness] || 'Material readiness is unknown')}</p>
            {change.neededBy ? <p>{t('Needed by')}: {date(change.neededBy)}</p> : null}
            <section aria-label={t('Linked supplier order lines')}>
              <h5>{t('Linked supplier order lines')}</h5>
              {change.linkedPurchaseOrders?.length ? <ul>{change.linkedPurchaseOrders.map((order, index) => <li key={`${order.purchaseOrderId}:${index}`}>
                <strong>{order.orderReference}</strong> · {order.supplier || t('Supplier not recorded')} · {t(order.status)}
                <p>{t('Ordered')}: {order.orderedQuantity} {change.unit}; {t('Received')}: {order.receivedQuantity} {change.unit}; {t('Accepted quantity')}: {order.acceptedQuantity} {change.unit}; {t('Still outstanding')}: {order.remainingQuantity} {change.unit}</p>
                <p>{t(order.orderIssued && order.externalCommitments === 1 ? 'External supplier commitment recorded' : 'No external supplier commitment recorded')}</p>
                {order.requiredBy ? <p>{t('Required by')}: {date(order.requiredBy)}</p> : null}
              </li>)}</ul> : <p>{t('No explicitly linked supplier order lines')}</p>}
              <p>{t('Supplier order lines are shown from explicit material links. This analysis never changes an order.')}</p>
            </section>
            {change.affectedTasks.length ? <p>{t('Linked work steps')}: {change.affectedTasks.map(task => task.title).join(', ')}</p> : <p>{t('No active work steps are explicitly linked to this material requirement.')}</p>}
          </li>)}</ul>
          <p>{t('Material quantities are not included in financial totals; review supplier prices, delivery dates and wastage separately.')}</p>
        </section> : null}
        {preview.affectedClientDecisions?.length ? <section aria-label={t('Client decisions affected by this proposal')}>
          <h4>{t('Client decisions affected by this proposal')}</h4>
          <ul>{preview.affectedClientDecisions.map(decision => <li key={decision.id}>
            <strong>{decision.title}</strong> · {t(decision.status)}{decision.selectedOption ? ` · ${t('Selected')}: ${decision.selectedOption}` : ''}
            <ul>{decision.links.map(link => <li key={`${link.targetType}:${link.targetId}`}>{link.targetTitle} · {link.rationale}</li>)}</ul>
          </li>)}</ul>
          <p>{t('Review the customer decision and confirm whether a scope, schedule, or supply action is needed. No action is taken automatically.')}</p>
        </section> : null}
        <ul>{preview.schedule.affectedTasks.map(task => <li key={task.id}>{task.title}: {date(task.beforeEnd)} {' > '} {date(task.afterEnd)}</li>)}</ul>
        {preview.schedule.affectedDependencies?.length ? <section aria-label={t('Affected task dependencies')}>
          <h4>{t('Affected task dependencies')}</h4>
          <ul>{preview.schedule.affectedDependencies.map(dependency => <li key={dependency.id}>
            {dependency.predecessorTitle} {' > '} {dependency.successorTitle} ({t(dependency.dependencyType)}, {dependency.lagHours} {t('hours lag')})
          </li>)}</ul>
        </section> : null}
        {preview.schedule.contractualCompletionDates?.length ? <>
          <h4>{t('Contractual completion dates')}</h4>
          <ul aria-label={t('Contractual completion dates')}>
            {preview.schedule.contractualCompletionDates.map(item => {
              const status = value => t(({ within_date: 'Within contractual date', projected_late: 'Projected after contractual date', contract_source_changed: 'Contract evidence changed', unknown: 'Unknown from current schedule' })[value] || 'Unknown')
              const late = value => value.daysLate > 0 ? ` (${t(value.daysLate === 1 ? '1 calendar day late' : '{days} calendar days late', { days: value.daysLate })})` : ''
              return <li key={item.entryKey}>
                <strong>{item.label}: {new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${item.date}T00:00:00.000Z`))}</strong>
                <p>{t('Current schedule forecast')}: {status(item.currentForecast.status)}{late(item.currentForecast)}</p>
                <p>{t('Proposed schedule forecast')}: {status(item.proposedForecast.status)}{late(item.proposedForecast)}</p>
                {!item.sourceCurrent ? <p className="review-warning">{t('Contract evidence changed; verify before relying on this comparison.')}</p> : null}
                <small>{item.evidenceReference}</small>
              </li>
            })}
          </ul>
        </> : null}
        <h4>{t('Linked records to review')}</h4>
        <dl>{[['Assignments', 'assignments'], ['Purchases', 'purchases'], ['Billing milestones', 'milestones'], ['Scope revisions', 'scopes'], ['Client decisions', 'clientDecisions'], ['Change orders', 'changes'], ['Quantity takeoffs', 'takeoffs'], ['Pending approvals', 'pendingApprovals']].map(([label, key]) => <div key={key}><dt>{t(label)}</dt><dd>{(preview.linked[key] || []).length}</dd></div>)}</dl>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => submit('retain')}><Save size={16} />{t('Retain analysis')}</button>
      </section> : null}
      <h4>{t('Recent retained analyses')}</h4>
      {!detail.reviews.length ? <p>{t('No retained analyses')}</p> : <ul className="retained-reviews">{detail.reviews.map((review, index) => <li key={review.id || index}>
        <details><summary>{review.scenario.reason}; {t(review.sourceCurrent ? 'Source current' : 'Source changed')}</summary>
          <p>{date(review.retainedAt)}</p><p>{t('Difference (elapsed hours)')}: {review.schedule.finishDeltaHours ?? t('Unknown')}</p>
          <p>{t('Cost change')}: {review.financial.costDelta} {review.financial.currency}; {t('Revenue change')}: {review.financial.revenueDelta} {review.financial.currency}</p>
          {review.relatedVariations?.length ? <ul>{review.relatedVariations.map(variation => <li key={variation.id}>{variation.variationNumber} R{variation.revisionNumber}: {t(variation.status)} / {t('Internal approval')}: {t(variation.approvalStatus || 'not requested')} / {variation.workAuthorized ? t('Work authorized') : t('Work not authorized')}</li>)}</ul> : null}
          {canEdit && review.sourceCurrent && !review.relatedVariations?.length ? <>
            {variationReviewId === review.id ? <form className="impact-form impact-variation-form" onSubmit={event => { event.preventDefault(); void prepareVariation(review) }}>
              <strong className="impact-form-title">{t('Prepare internal variation draft')}</strong>
              <p className="impact-reason">{t('Price and calendar days are operator inputs, not inferred from the scenario. Internal approval and verified client acceptance remain separate; work is not authorized.')}</p>
              <label>{t('Variation title')}<input required minLength="2" maxLength="240" value={variationForm.title} onChange={event => setVariationForm(current => ({ ...current, title: event.target.value }))} /></label>
              <label>{t('Variation type')}<select value={variationForm.variationType} onChange={event => setVariationForm(current => ({ ...current, variationType: event.target.value }))}><option value="client_request">{t('Client request')}</option><option value="design_change">{t('Design change')}</option><option value="unforeseen_condition">{t('Unforeseen condition')}</option><option value="regulatory_change">{t('Regulatory change')}</option><option value="contractor_proposal">{t('Contractor proposal')}</option><option value="other">{t('Other')}</option></select></label>
              <label className="impact-reason">{t('Proposed scope')}<textarea required minLength="3" maxLength="4000" value={variationForm.scopeDelta} onChange={event => setVariationForm(current => ({ ...current, scopeDelta: event.target.value }))} /></label>
              <label>{t('Net variation amount')}<input required type="number" min="-1000000000" max="1000000000" step="0.01" value={variationForm.amount} onChange={event => setVariationForm(current => ({ ...current, amount: event.target.value }))} /></label>
              <label>{t('Proposed calendar days')}<input required type="number" min="-3650" max="3650" step="1" value={variationForm.scheduleDeltaDays} onChange={event => setVariationForm(current => ({ ...current, scheduleDeltaDays: event.target.value }))} /></label>
              <label>{t('Initiated by')}<select value={variationForm.initiatedBy} onChange={event => setVariationForm(current => ({ ...current, initiatedBy: event.target.value }))}><option value="client">{t('Client')}</option><option value="contractor">{t('Contractor')}</option><option value="designer">{t('Designer')}</option><option value="authority">{t('Authority')}</option><option value="supplier">{t('Supplier')}</option><option value="site_condition">{t('Site condition')}</option><option value="other">{t('Other')}</option></select></label>
              <button className="secondary-button" disabled={busy}>{t('Create governed variation draft')}</button>
              <button type="button" className="secondary-button" disabled={busy} onClick={() => setVariationReviewId('')}>{t('Cancel')}</button>
            </form> : <button type="button" className="secondary-button" disabled={busy || !review.schedule?.ready} onClick={() => { setVariationForm(current => ({ ...current, title: `Change: ${review.scenario.reason}`, scopeDelta: review.scenario.reason })); setVariationReviewId(review.id) }}>{t('Prepare variation draft')}</button>}
          </> : null}
        </details>
      </li>)}</ul>}
    </> : null}
  </div>
}

export default function ContractorReviewControl({ api, locale = 'en-GB', refreshKey, canAutomate = false, canEdit = false, suspended = false, onOpenJob }) {
  const t = (key, values) => operatorText(locale, key, values)
  const [expanded, setExpanded] = useState(false)
  const [data, setData] = useState(null)
  const [cursors, setCursors] = useState([''])
  const [selected, setSelected] = useState(null)
  const [revision, setRevision] = useState(0)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [clock, setClock] = useState(Date.now())
  const lock = useRef(false)
  const after = cursors.at(-1)
  useEffect(() => {
    if (!expanded) return
    let current = true
    setLoading(true)
    setError('')
    api(`/api/ledger/portfolio-review?${new URLSearchParams({ after, limit: '10' })}`).then(result => { if (current) setData(result) }).catch(reason => { if (current) setError(reason.message) }).finally(() => { if (current) setLoading(false) })
    return () => { current = false }
  }, [api, after, expanded, refreshKey, revision])
  useEffect(() => {
    if (!expanded) return
    const timer = setInterval(() => setClock(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [expanded])
  async function runBatch() {
    if (lock.current || !canAutomate || suspended || data?.automationSuspended) return
    lock.current = true
    setBusy(true)
    setError('')
    try {
      await api('/api/ledger/portfolio-review', { method: 'POST', body: JSON.stringify({ batchSize: 10 }) })
      setRevision(value => value + 1)
    } catch (reason) { setError(reason.message) }
    finally { lock.current = false; setBusy(false) }
  }
  const progress = data?.progress
  const waiting = data?.nextDueAt && Date.parse(data.nextDueAt) > clock
  return <section className="contractor-review" data-testid="contractor-review">
    <header><h2><button type="button" aria-expanded={expanded} aria-controls="dossier-review-body" disabled={busy} onClick={() => setExpanded(value => !value)}><ClipboardCheck size={20} />{t('Dossier review')}<ChevronDown size={18} /></button></h2></header>
    {expanded ? <div id="dossier-review-body">
      <div className="review-toolbar">
        {canAutomate ? <button type="button" className="secondary-button" disabled={loading || busy || waiting || suspended || data?.automationSuspended || (data?.running && Date.parse(data.leaseUntil) > clock)} onClick={runBatch}><Play size={16} />{t('Review next batch')}</button> : null}
        <button type="button" className="icon-button" title={t('Refresh reviews')} aria-label={t('Refresh reviews')} disabled={busy || loading} onClick={() => setRevision(value => value + 1)}><RefreshCw size={18} /></button>
        {waiting ? <span role="status">{t('Next batch in {seconds}s', { seconds: Math.ceil((Date.parse(data.nextDueAt) - clock) / 1000) })}</span> : null}
      </div>
      {loading ? <p role="status">{t('Loading...')}</p> : null}
      {error ? <div role="alert"><p>{error}</p><button type="button" className="secondary-button" disabled={busy} onClick={() => setRevision(value => value + 1)}>{t('Retry')}</button></div> : null}
      {!loading && !error && data ? <>
        {data.automationSuspended || suspended ? <p>{t('Autonomous work is suspended.')}</p> : null}
        <p>{progress ? t('{checked} of {total} dossiers checked; {issues} findings; {failed} failed.', { checked: progress.checked, total: progress.total, issues: progress.issueCount, failed: progress.failed }) : t('No control round retained yet.')}</p>
        <p>{t(progress?.complete ? 'Coverage complete for this round; findings still need review.' : progress?.finished ? 'Round ended with incomplete coverage. Start a new round.' : 'Coverage is still incomplete.')}</p>
        {progress?.coverageIncomplete > 0 ? <p role="alert">{t('{count} dossier reports lack complete source coverage evidence.', { count: progress.coverageIncomplete })}</p> : null}
        <p className="review-scope">{t('Coverage manifest v{version}: {tables} source tables, {derived} derived sources, {checks} evaluated checks. Not a certification.', {
          version: data.coverage.version, tables: data.coverage.sourceTables.length, derived: data.coverage.derivedSources.length, checks: data.coverage.checks.length
        })}</p>
        {progress?.lastBatch?.length ? <details><summary>{t('Last batch findings')}</summary><ul>{progress.lastBatch.map(row => <li key={row.jobId}><button type="button" className="text-button" onClick={() => setSelected({ id: row.jobId, title: row.title || row.jobId })}>{row.title || row.jobId}</button>: {row.issues.map(issue => t(CHECK_LABELS[issue.code] || issue.code)).join('; ') || t('No findings in these checks')}</li>)}</ul></details> : null}
        <div className="review-layout"><div className="review-dossiers">
          <h3>{t('All dossiers')}</h3>
          {data.dossiers.rows.length ? <ul>{data.dossiers.rows.map(job => <li key={job.id}><button type="button" aria-label={t('Analyse {title}', { title: job.title })} aria-pressed={selected?.id === job.id} onClick={() => setSelected(job)}>{job.title}<Calculator size={16} /></button></li>)}</ul> : <p>{t('No dossiers')}</p>}
          <div className="review-toolbar"><button type="button" className="icon-button" title={t('Previous dossiers')} aria-label={t('Previous dossiers')} disabled={cursors.length === 1 || busy} onClick={() => setCursors(value => value.slice(0, -1))}><ArrowLeft size={18} /></button><button type="button" className="icon-button" title={t('Next dossiers')} aria-label={t('Next dossiers')} disabled={!data.dossiers.nextCursor || busy} onClick={() => setCursors(value => [...value, data.dossiers.nextCursor])}><ArrowRight size={18} /></button></div>
        </div>{selected ? <ImpactReview key={selected.id} api={api} job={selected} locale={locale} canEdit={canEdit} onOpenJob={onOpenJob} refreshKey={refreshKey} /> : null}</div>
      </> : null}
    </div> : null}
  </section>
}
