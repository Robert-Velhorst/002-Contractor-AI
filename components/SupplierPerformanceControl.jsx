import { useCallback, useEffect, useState } from 'react'
import { ArrowUpRight, RefreshCw, TriangleAlert } from 'lucide-react'
import './SupplierPerformanceControl.css'

const EMPTY = { suppliers: [] }

export default function SupplierPerformanceControl({ request, locale = 'nl-NL', t = value => value, onOpenJob }) {
  const [data, setData] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const load = useCallback(async () => {
    setLoading(true)
    try {
      setData(await request('/api/ledger/supplier-performance'))
      setError('')
    } catch (cause) {
      setError(cause.message || 'Supplier performance could not be loaded')
    } finally {
      setLoading(false)
    }
  }, [request])
  useEffect(() => { load() }, [load])

  const percent = new Intl.NumberFormat(locale, { maximumFractionDigits: 0, style: 'percent' })
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 })
  const dateTime = value => value ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : t('Date unavailable')
  const suppliers = data.suppliers || []
  return <section className="supplier-performance" aria-label={t('Supplier delivery performance')} data-testid="supplier-performance">
    <header className="supplier-performance-header">
      <div><h3>{t('Delivery performance')}</h3><p>{t('Only issued orders or orders with retained receipt evidence are included. Results use accepted delivery receipts; missing evidence does not become a supplier rating.')}</p>
        <p>{t('Lead-time risk is a historical P75 signal from at least three fully accepted issued orders, not a delivery promise.')}</p></div>
      <button type="button" className="icon-button" title={t('Refresh supplier performance')} aria-label={t('Refresh supplier performance')} disabled={loading} onClick={() => void load()}><RefreshCw size={17} /></button>
    </header>
    {loading && <p role="status">{t('Loading supplier performance')}</p>}
    {error && <p role="alert">{error}</p>}
    {!loading && !error && suppliers.length === 0 && <p>{t('No issued supplier orders with measurable, retained receipt lines yet.')}</p>}
    {!loading && !error && suppliers.length > 0 && <>
      <p className="supplier-performance-note"><TriangleAlert size={15} />{t('On-time and complete counts only fully accepted orders with a requested delivery date. Results describe this company’s retained records, not a general supplier guarantee.')}</p>
      <div className="supplier-performance-list" role="list">
        {suppliers.map(supplier => <article className="supplier-performance-row" key={supplier.supplierId} role="listitem">
          <div className="supplier-performance-name"><strong>{supplier.name}</strong><span>{t('{count} order(s) with measurable lines', { count: supplier.orderCount })}</span></div>
          <div><span>{t('On time and complete')}</span><strong>{supplier.onTimeCompleteRatePercent === null
            ? t('Not enough date evidence') : `${percent.format(supplier.onTimeCompleteRatePercent / 100)} · ${supplier.onTimeCompleteOrders}/${supplier.ratedOrders}`}</strong></div>
          <div><span>{t('Historical P75 lead time')}</span><strong>{!Number.isFinite(supplier.historicalLeadTimeP75Days)
            ? t('Not enough date evidence') : t('{days} days from {count} completed issued orders', {
              days: number.format(supplier.historicalLeadTimeP75Days), count: supplier.leadTimeSampleSize })}</strong></div>
          <div><span>{t('Fully received orders')}</span><strong>{supplier.completeOrders}/{supplier.orderCount}</strong></div>
          <div className={supplier.awaitingReceiptOrders ? 'supplier-performance-warning' : ''}><span>{t('Awaiting first receipt')}</span><strong>{supplier.awaitingReceiptOrders}</strong></div>
          <div className={supplier.openShortageOrders ? 'supplier-performance-warning' : ''}><span>{t('Open short deliveries')}</span><strong>{supplier.openShortageOrders}</strong></div>
          <div className={supplier.damagedOrders ? 'supplier-performance-warning' : ''}><span>{t('Orders with damaged goods')}</span><strong>{supplier.damagedOrders}</strong></div>
          {supplier.leadTimeRisks?.length > 0 && <ul className="supplier-performance-risks" aria-label={t('Delivery-date risks')}>
            {supplier.leadTimeRisks.map(risk => <li key={risk.purchaseOrderId}>
              <span><strong>{t('Delivery-date risk')}: {risk.purchaseOrderId}</strong>
                <small>{t('P75 completion-date indicator {signal} falls after the requested date {required}; based on {count} completed orders.', {
                  signal: dateTime(risk.historicalP75EquivalentCompletionAt), required: dateTime(risk.requiredBy), count: risk.sampleSize })}</small></span>
              {onOpenJob && <button type="button" className="secondary-button" onClick={() => onOpenJob({ id: risk.jobId })}>
                <ArrowUpRight size={15} />{t('Open project')}
              </button>}
            </li>)}
          </ul>}
          {supplier.completedWithoutRequiredDate > 0 && <small>{t('{count} completed order(s) had no requested date and are excluded from punctuality.', { count: supplier.completedWithoutRequiredDate })}</small>}
        </article>)}
      </div>
    </>}
  </section>
}
