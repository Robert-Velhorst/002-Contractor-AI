import { formatCurrency } from "../dashboard-format"



function rateMoney(value, currencyCode = 'EUR') {
  return formatCurrency(value, currencyCode)
}

function pricingModelLabel(value) {
  if (value === 'fixed_price') return 'Fixed price'
  if (value === 'time_and_materials') return 'Time and materials'
  return 'Review required'
}



export { pricingModelLabel, rateMoney }
