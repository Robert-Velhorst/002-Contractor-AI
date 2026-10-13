export default function SupplierPerformanceSignal({ supplier, state, locale = 'nl-NL', text }) {
  const t = text || ((key) => key)
  if (state.status === 'loading') return <small role="status">{t('Loading supplier history')}</small>
  if (state.status === 'error') return <small role="status">{t('Supplier history unavailable; use the retained tender evidence.')}</small>

  const supplierId = String(supplier?.id || '').trim().toLocaleLowerCase('en-US')
  const record = supplierId && state.suppliers.find(item => String(item.supplierId || '').trim().toLocaleLowerCase('en-US') === supplierId)
  if (!record) return <small data-testid="supplier-history-none">{t('No linked delivery history; no reliability rate is inferred.')}</small>

  const rate = record.ratedOrders > 0
    ? new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(record.onTimeCompleteOrders / record.ratedOrders)
    : t('No dated complete orders')
  const leadTime = Number.isFinite(record.historicalLeadTimeP75Days)
    ? t('Historical P75 complete lead time: {days} days ({count} completed issued orders)', {
      days: new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(record.historicalLeadTimeP75Days),
      count: record.leadTimeSampleSize
    })
    : t('No P75 lead-time history yet')
  return <small data-testid="supplier-history-signal">
    {t('Company delivery history')}: {rate} ({record.onTimeCompleteOrders}/{record.ratedOrders} {t('rated')}; {record.orderCount} {t('orders')}) / {leadTime} / {t('Open orders with historical lead-time risk')}: {record.leadTimeRiskCount || 0} / {t('open short deliveries')}: {record.openShortageOrders} / {t('orders with damage')}: {record.damagedOrders}
  </small>
}
