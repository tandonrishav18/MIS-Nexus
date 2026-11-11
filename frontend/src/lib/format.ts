export type EdiDocCode = '850' | '855' | '810' | '856'

export const DOC_TYPE_META: Record<
  EdiDocCode,
  { code: EdiDocCode; short: string; label: string }
> = {
  '850': { code: '850', short: 'PO', label: 'Purchase Order' },
  '855': { code: '855', short: 'POA', label: 'Order Acknowledgement' },
  '810': { code: '810', short: 'INV', label: 'Invoice' },
  '856': { code: '856', short: 'ASN', label: 'Advance Shipping Notice' },
}

/** Format currency in Indian Rupee grouping (e.g., ₹45,00,000). */
export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

/** Compact INR display for tight chart axes (e.g., ₹45.0L). */
export function formatINRCompact(amount: number): string {
  if (amount >= 10000000) {
    return `₹${(amount / 10000000).toFixed(2)}Cr`
  }
  if (amount >= 100000) {
    return `₹${(amount / 100000).toFixed(1)}L`
  }
  return formatINR(amount)
}

export function formatShortDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(date)
}

export function formatDateTime(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) return isoDate
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date)
}

