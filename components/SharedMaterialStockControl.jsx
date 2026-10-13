import { useCallback, useEffect, useState } from 'react'
import { ArrowDownToLine, PackagePlus, RefreshCw, Undo2 } from 'lucide-react'

const empty = { materials: [], allocations: [], requirements: [], movements: [], summary: {} }
const newKey = () => window.crypto?.randomUUID?.() || `stock-${Date.now()}-${Math.random().toString(36).slice(2)}`

export default function SharedMaterialStockControl({ request, locale = 'nl-NL', canCoordinate, submitting, t }) {
  const [stock, setStock] = useState(empty)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [count, setCount] = useState({ materialId: '', name: '', unit: '', countedQuantity: '', reference: '', note: '' })
  const [reservation, setReservation] = useState({ requirementId: '', quantity: '', sourceReference: '', note: '' })
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 4 })
  const dateTime = value => Number.isFinite(Date.parse(value || ''))
    ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : t('Unknown date')
  const load = useCallback(async () => {
    setBusy(true)
    try {
      setStock(await request('/api/ledger/material-stock'))
      setError('')
    } catch (cause) {
      setError(cause.message || t('Stock data could not be loaded'))
    } finally {
      setBusy(false)
    }
  }, [request, t])
  useEffect(() => { load() }, [load])

  async function submitCount(event) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    setError(''); setMessage('')
    try {
      const result = await request('/api/ledger/material-stock/counts', {
        method: 'POST', body: JSON.stringify({ materialId: count.materialId || undefined, name: fields.get('name'), unit: fields.get('unit'),
          countedQuantity: Number(fields.get('countedQuantity')), reference: fields.get('reference'), note: fields.get('note'), entryKey: newKey() }),
      })
      setStock(result); form.reset(); setCount({ materialId: '', name: '', unit: '', countedQuantity: '', reference: '', note: '' })
      setMessage(t('Stock count retained; active reservations were protected.'))
    } catch (cause) { setError(cause.message || t('The stock count could not be saved')) }
  }

  async function submitReservation(event) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const requirementId = String(fields.get('requirementId') || '')
    const requirement = stock.requirements.find((item) => item.id === requirementId)
    if (!requirement) return
    setError(''); setMessage('')
    try {
      const result = await request(`/api/ledger/jobs/${encodeURIComponent(requirement.jobId)}/material-stock-reservations`, {
        method: 'POST', body: JSON.stringify({ materialRequirementId: requirement.id, quantity: Number(fields.get('quantity')),
          sourceReference: fields.get('sourceReference'), note: fields.get('note'), entryKey: newKey() }),
      })
      setStock(result); form.reset(); setReservation({ requirementId: '', quantity: '', sourceReference: '', note: '' })
      setMessage(t('Material reserved for the selected job.'))
    } catch (cause) { setError(cause.message || t('The material could not be reserved')) }
  }

  async function transition(allocation, action, values = {}) {
    setError(''); setMessage('')
    const body = { entryKey: newKey(), note: values.note || (action === 'release' ? t('Reservation released after office review.') : t('Material used on the job.')) }
    if (action === 'consume') {
      body.quantity = Number(values.quantity)
      body.evidenceReference = values.reference
    }
    try {
      if (action === 'issue') {
        body.quantity = Number(values.quantity)
        body.dispatchReference = values.dispatchReference
        body.evidenceReference = values.evidenceReference
        body.expectedArrivalAt = new Date(values.expectedArrivalAt).toISOString()
      }
      const result = await request(`/api/ledger/material-stock-reservations/${encodeURIComponent(allocation.id)}/${action}`, {
        method: 'POST', body: JSON.stringify(body),
      })
      setStock(result); setMessage(action === 'release' ? t('Reservation released; stock is available to other jobs.')
        : action === 'issue' ? t('Material issued to the job; warehouse stock reduced and arrival estimate linked to the work plan.')
          : t('Material use recorded and stock reduced.'))
    } catch (cause) { setError(cause.message || t('The reservation could not be updated')) }
  }

  async function reviewSiteReceipt(issue, receipt, event) {
    event.preventDefault()
    const form = event.currentTarget
    const fields = new FormData(form)
    const acceptedQuantity = Number(fields.get('acceptedQuantity') || 0)
    const damagedQuantity = Number(fields.get('damagedQuantity') || 0)
    if (acceptedQuantity + damagedQuantity <= 0) {
      setError(t('Classify at least one inspected unit as accepted or damaged.'))
      return
    }
    if (acceptedQuantity + damagedQuantity > receipt.pendingInspectionQuantity + 0.000001) {
      setError(t('The inspection decision cannot exceed the quantity awaiting inspection.'))
      return
    }
    setError(''); setMessage('')
    try {
      const result = await request(`/api/ledger/jobs/${encodeURIComponent(issue.jobId)}/material-stock-site-issues/${encodeURIComponent(issue.id)}/receipts/${encodeURIComponent(receipt.id)}/reviews`, {
        method: 'POST', body: JSON.stringify({ acceptedQuantity, damagedQuantity,
          expectedPendingInspectionQuantity: receipt.pendingInspectionQuantity,
          reviewReference: fields.get('reviewReference'), evidenceReference: fields.get('evidenceReference'),
          note: fields.get('note'), entryKey: newKey() }),
      })
      setStock(result)
      setMessage(t('Site receipt inspection retained; only accepted units increased job availability.'))
      form.reset()
    } catch (cause) { setError(cause.message || t('The site receipt inspection could not be saved')) }
  }

  const openAllocations = stock.allocations.filter((item) => item.status === 'reserved')
  const pendingSiteReceipts = (stock.siteIssues || []).flatMap(issue => (issue.receipts || [])
    .filter(receipt => receipt.pendingInspectionQuantity > 0).map(receipt => ({ issue, receipt })))
  const reviewedSiteReceipts = (stock.siteIssues || []).flatMap(issue => (issue.receipts || [])
    .filter(receipt => receipt.reviews?.length).map(receipt => ({ issue, receipt })))
  return (
    <section className="shared-stock-control" aria-labelledby="shared-stock-heading" data-testid="shared-material-stock">
      <div className="shared-stock-heading">
        <div><h3 id="shared-stock-heading">{t('Shared warehouse stock')}</h3><p>{t('One counted balance shared across jobs. Active allocations are deducted before another job can reserve stock.')}</p></div>
        <button type="button" className="icon-button" aria-label={t('Refresh stock')} onClick={load} disabled={busy}><RefreshCw size={16} /></button>
      </div>
      <div className="shared-stock-summary">
        <div><span>{t('Stock items')}</span><strong>{stock.summary.materials || 0}</strong></div>
        <div><span>{t('Active reservations')}</span><strong>{stock.summary.activeAllocations || 0}</strong></div>
        <div><span>{t('Below reorder point')}</span><strong>{stock.summary.shortItems || 0}</strong></div>
        <div><span>{t('Receipts awaiting inspection')}</span><strong>{pendingSiteReceipts.length}</strong></div>
      </div>
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {busy ? <p role="status">{t('Loading shared stock…')}</p> : null}
      <div className="shared-stock-grid">
        <div className="shared-stock-table-wrap">
          <h4>{t('Available by material')}</h4>
          <div className="shared-stock-table" role="table" aria-label={t('Shared material stock')} tabIndex={0}>
            <div className="shared-stock-row shared-stock-row-header" role="row"><span role="columnheader">{t('Material')}</span><span role="columnheader">{t('On hand')}</span><span role="columnheader">{t('Reserved')}</span><span role="columnheader">{t('Free')}</span></div>
            {stock.materials.map((item) => <div className="shared-stock-row" role="row" key={item.id}>
              <span role="cell"><strong>{item.name}</strong><small>{item.sku || item.unit}</small></span>
              <span role="cell">{number.format(item.stockQuantity)} {item.unit}</span><span role="cell">{number.format(item.reservedQuantity)} {item.unit}</span><strong role="cell">{number.format(item.availableQuantity)} {item.unit}</strong>
            </div>)}
            {!stock.materials.length && !busy ? <p className="shared-stock-empty">{t('No warehouse stock has been counted yet.')}</p> : null}
          </div>
        </div>
        {canCoordinate ? (
          <div className="shared-stock-forms">
            <form className="shared-stock-form" onSubmit={submitCount}>
              <h4><PackagePlus size={16} />{t('Count or add stock')}</h4>
              <label>{t('Existing stock item')}<select value={count.materialId} onChange={(event) => setCount((current) => ({ ...current, materialId: event.target.value, name: '', unit: '' }))}><option value="">{t('New material…')}</option>{stock.materials.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select></label>
              {!count.materialId ? <div className="shared-stock-inline-fields"><label>{t('Material name')}<input name="name" required /></label><label>{t('Unit')}<input name="unit" required placeholder={t('e.g. rolls')} /></label></div> : null}
              <label>{t('Counted quantity')}<input name="countedQuantity" type="number" min="0" step="0.0001" required /></label>
              <label>{t('Count reference')}<input name="reference" required placeholder={t('Stocktake or evidence reference')} /></label>
              <label>{t('Note')}<input name="note" required /></label>
              <button className="primary-button" disabled={submitting || busy}><PackagePlus size={15} />{t('Save stock count')}</button>
            </form>
            <form className="shared-stock-form" onSubmit={submitReservation}>
              <h4><PackagePlus size={16} />{t('Reserve for a job')}</h4>
              <label>{t('Material requirement')}<select name="requirementId" required value={reservation.requirementId} onChange={(event) => setReservation((current) => ({ ...current, requirementId: event.target.value }))}><option value="">{t('Select a linked job requirement')}</option>{stock.requirements.map((item) => <option key={item.id} value={item.id}>{item.jobTitle} · {item.materialName} · {number.format(item.quantity)} {item.unit}</option>)}</select></label>
              <label>{t('Quantity')}<input name="quantity" type="number" min="0.0001" step="0.0001" required /></label>
              <label>{t('Stock count reference')}<input name="sourceReference" required /></label>
              <label>{t('Note')}<input name="note" /></label>
              <button className="secondary-button" disabled={submitting || busy}><PackagePlus size={15} />{t('Reserve stock')}</button>
            </form>
          </div>
        ) : null}
      </div>
      <div className="shared-stock-allocation-list">
        <h4>{t('Job allocations')}</h4>
        {openAllocations.map((allocation) => {
          return <article className="shared-stock-allocation" key={allocation.id}>
            <div><strong>{allocation.materialName}</strong><span>{allocation.jobTitle} · {number.format(allocation.remainingQuantity)} {allocation.unit} · {t('Reference')} {allocation.sourceReference}</span></div>
            {canCoordinate ? <form className="shared-stock-allocation-actions" onSubmit={(event) => {
              event.preventDefault()
              const fields = new FormData(event.currentTarget)
              transition(allocation, 'consume', { quantity: Number(fields.get('quantity')), reference: fields.get('reference') })
            }}>
              <label>{t('Used quantity')}<input name="quantity" aria-label={t('Used quantity for {job}', { job: allocation.jobTitle })} type="number" min="0.0001" max={allocation.remainingQuantity} step="0.0001" required /></label>
              <label>{t('Use evidence')}<input name="reference" aria-label={t('Use evidence for {job}', { job: allocation.jobTitle })} required /></label>
              <button className="secondary-button" type="submit" disabled={submitting}><ArrowDownToLine size={15} />{t('Record use')}</button>
              <button className="icon-button" type="button" aria-label={t('Release reservation for {job}', { job: allocation.jobTitle })} disabled={submitting} onClick={() => transition(allocation, 'release')}><Undo2 size={16} /></button>
            </form> : null}
            {canCoordinate ? <details className="shared-stock-issue">
              <summary>{t('Issue reserved stock to job site')}</summary>
              <form className="form-grid" onSubmit={(event) => {
                event.preventDefault()
                const fields = new FormData(event.currentTarget)
                transition(allocation, 'issue', { quantity: fields.get('quantity'), dispatchReference: fields.get('dispatchReference'),
                  evidenceReference: fields.get('evidenceReference'), expectedArrivalAt: fields.get('expectedArrivalAt'), note: fields.get('note') })
              }}>
                <label>{t('Issued quantity')}<input name="quantity" type="number" min="0.0001" max={allocation.remainingQuantity} step="0.0001" required /></label>
                <label>{t('Expected arrival at job site')}<input name="expectedArrivalAt" type="datetime-local" required /></label>
                <label>{t('Dispatch reference')}<input name="dispatchReference" minLength="3" maxLength="240" required /></label>
                <label>{t('Issue evidence reference')}<input name="evidenceReference" minLength="3" maxLength="240" required /></label>
                <label>{t('Note')}<input name="note" maxLength="1000" /></label>
                <button className="secondary-button" type="submit" disabled={submitting}><ArrowDownToLine size={15} />{t('Issue to job site')}</button>
              </form>
            </details> : null}
          </article>
        })}
        {!openAllocations.length ? <p className="shared-stock-empty">{t('There are no active job allocations.')}</p> : null}
      </div>
      <div className="shared-stock-allocation-list">
        <h4>{t('Site receipts awaiting inspection')}</h4>
        {pendingSiteReceipts.map(({ issue, receipt }) => <article className="shared-stock-allocation" key={receipt.id}>
          <div><strong>{issue.materialName} · {issue.jobTitle}</strong><span>{t('Receipt')}: {receipt.receiptReference} · {number.format(receipt.pendingInspectionQuantity)} {issue.unit} · {receipt.location}</span>
            <small>{t('Received by')}: {receipt.receivedBy} · {t('Arrival evidence reference')}: {receipt.evidenceReference}</small></div>
          {canCoordinate ? <form className="shared-stock-allocation-actions is-inspection-review" aria-label={t('Inspect site receipt {reference}', { reference: receipt.receiptReference })}
            onSubmit={event => void reviewSiteReceipt(issue, receipt, event)}>
            <label>{t('Accepted after inspection')}<input name="acceptedQuantity" type="number" min="0" max={receipt.pendingInspectionQuantity} step="0.0001" /></label>
            <label>{t('Damaged after inspection')}<input name="damagedQuantity" type="number" min="0" max={receipt.pendingInspectionQuantity} step="0.0001" /></label>
            <label>{t('Inspection reference')}<input name="reviewReference" minLength="3" maxLength="240" required /></label>
            <label>{t('Inspection evidence reference')}<input name="evidenceReference" minLength="3" maxLength="500" required /></label>
            <label>{t('Inspection note')}<input name="note" maxLength="1000" /></label>
            <button className="secondary-button" type="submit" disabled={submitting}>{t('Save inspection decision')}</button>
          </form> : <p>{t('Office review is required before these units become available.')}</p>}
        </article>)}
        {!pendingSiteReceipts.length ? <p className="shared-stock-empty">{t('No site receipt quantities are waiting for inspection.')}</p> : null}
      </div>
      <div className="shared-stock-allocation-list">
        <h4>{t('Recent site receipt inspection decisions')}</h4>
        {reviewedSiteReceipts.flatMap(({ issue, receipt }) => receipt.reviews.map(review => ({ issue, receipt, review })))
          .slice(-20).reverse().map(({ issue, receipt, review }) => <article className="shared-stock-allocation" key={review.id}>
            <div><strong>{issue.materialName} · {issue.jobTitle}</strong>
              <span>{t('Receipt')}: {receipt.receiptReference} · {t('Inspection reference')}: {review.reviewReference}</span>
              <small>{t('Accepted after inspection')}: {number.format(review.acceptedQuantity)} {issue.unit} · {t('Damaged after inspection')}: {number.format(review.damagedQuantity)} {issue.unit} · {t('Reviewed by')}: {review.reviewedBy} · {dateTime(review.reviewedAt)}</small>
              <small>{t('Inspection evidence reference')}: {review.evidenceReference}{review.note ? ` · ${review.note}` : ''}</small>
            </div>
          </article>)}
        {!reviewedSiteReceipts.length ? <p className="shared-stock-empty">{t('No site receipt inspection decisions have been recorded.')}</p> : null}
      </div>
      <div className="shared-stock-allocation-list">
        <h4>{t('Recent stock movements')}</h4>
        {stock.movements.slice(0, 12).map((movement) => {
          const item = stock.materials.find((material) => material.id === movement.materialId)
          return <div className="shared-stock-movement" key={movement.id}>
            <span><strong>{item?.name || t('Material')}</strong><small>{movement.type === 'stocktake' ? t('Stock count') : movement.type === 'consumption' ? t('Job consumption') : movement.type === 'site_issue' ? t('Issue to job site') : movement.type === 'receipt' ? t('Warehouse receipt') : movement.type === 'receipt_reversal' ? t('Warehouse receipt reversal') : t('Reservation release')} · {movement.reference}</small></span>
            <span>{movement.quantityDelta > 0 ? '+' : ''}{number.format(movement.quantityDelta)} {item?.unit || ''}</span>
            <small>{t('Balance')} {number.format(movement.quantityAfter)} {item?.unit || ''}</small>
          </div>
        })}
        {!stock.movements.length ? <p className="shared-stock-empty">{t('No stock movements have been recorded yet.')}</p> : null}
      </div>
      <p className="timesheet-policy">{t('This is an internal stock record only. It does not create a supplier order, approve spending, or change a job commitment.')}</p>
      <p className="timesheet-policy">{t('Warehouse stock is not job-site material. Record an evidenced issue and expected arrival; the field receipt must confirm the same dispatch reference before received quantities count as available.')}</p>
    </section>
  )
}
