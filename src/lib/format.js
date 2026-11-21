const fmts = new Map()
function nf(currency) {
  if (!fmts.has(currency)) {
    try {
      fmts.set(currency, new Intl.NumberFormat(undefined, { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }))
    } catch {
      fmts.set(currency, new Intl.NumberFormat(undefined, { style: 'currency', currency: 'SGD' }))
    }
  }
  return fmts.get(currency)
}

export const money = (cents, currency) => nf(currency).format((cents || 0) / 100)
export const symbol = (currency) => nf(currency).formatToParts(0).find((p) => p.type === 'currency')?.value || '$'

// Value for an editable input, e.g. 120050 -> "1200.50"
export const centsToInput = (c) => (c ? (c / 100).toFixed(2).replace(/\.00$/, '') : '')

export const CURRENCIES = ['SGD', 'MYR', 'USD', 'EUR', 'GBP', 'AUD', 'JPY', 'THB', 'IDR', 'HKD', 'KRW', 'CNY', 'TWD', 'VND', 'PHP', 'INR', 'NZD', 'CAD']

const BY_REGION = { SG: 'SGD', MY: 'MYR', US: 'USD', GB: 'GBP', AU: 'AUD', JP: 'JPY', TH: 'THB', ID: 'IDR', HK: 'HKD', KR: 'KRW', CN: 'CNY', TW: 'TWD', VN: 'VND', PH: 'PHP', IN: 'INR', NZ: 'NZD', CA: 'CAD', DE: 'EUR', FR: 'EUR', NL: 'EUR', ES: 'EUR', IT: 'EUR', IE: 'EUR' }
export function defaultCurrency() {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region
    return BY_REGION[region] || 'SGD'
  } catch {
    return 'SGD'
  }
}

export function shortDate(iso) {
  const d = new Date(iso)
  const now = new Date()
  const days = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() && { year: 'numeric' }) })
}
