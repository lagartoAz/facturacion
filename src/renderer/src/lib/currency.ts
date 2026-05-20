export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD'
  }).format(amount)
}

export function formatVES(amount: number): string {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'VES',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount)
}

export function formatCOP(amount: number): string {
  return new Intl.NumberFormat('es-CO', {
    style: 'currency',
    currency: 'COP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount)
}

export function convertCurrency(amountUSD: number, rate: number): number {
  return amountUSD * rate
}

export type PaidCurrency = 'USD' | 'VES' | 'COP'

interface PaidCurrencyInput {
  payment_method: string
  cash_currency: string | null
  payment_amount_ves: number | null
  payment_amount_cop: number | null
}

export function getPaidCurrency(inv: PaidCurrencyInput): PaidCurrency {
  if (inv.payment_method === 'cash') {
    if (inv.cash_currency === 'VES') return 'VES'
    if (inv.cash_currency === 'COP') return 'COP'
    return 'USD'
  }
  if (inv.payment_method === 'card') {
    return inv.payment_amount_ves ? 'VES' : 'USD'
  }
  if (inv.payment_method === 'transfer') {
    if (inv.payment_amount_ves) return 'VES'
    if (inv.payment_amount_cop) return 'COP'
    return 'USD'
  }
  return 'USD'
}

export function formatAmountIn(
  amountUsd: number,
  currency: PaidCurrency,
  rateVes: number | null,
  rateCop: number | null
): string {
  if (currency === 'VES' && rateVes) return formatVES(amountUsd * rateVes)
  if (currency === 'COP' && rateCop) return formatCOP(amountUsd * rateCop)
  return formatUSD(amountUsd)
}

// Plain-text variant for receipt printing (no Intl symbols / locale punctuation).
export function plainAmountIn(
  amountUsd: number,
  currency: PaidCurrency,
  rateVes: number | null,
  rateCop: number | null
): string {
  if (currency === 'VES' && rateVes) return `Bs. ${(amountUsd * rateVes).toFixed(2)}`
  if (currency === 'COP' && rateCop) return `COP ${Math.round(amountUsd * rateCop)}`
  return `$${amountUsd.toFixed(2)}`
}
