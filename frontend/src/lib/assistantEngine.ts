import { formatINR } from '@/lib/format'
import type { TradingPartnerSummary, TransactionRecord } from '@/types/edi'

export interface AssistantQueryResult {
  reply: string
  relatedTransactionIds: string[]
}

export const SUGGESTED_ASSISTANT_QUESTIONS = [
  'How many transactions are pending?',
  'Which invoices have discrepancies?',
  'Which trading partner has the most rejected documents?',
  "Summarize this month's transaction activity.",
  'Which documents require human review?',
  'What is the reason for rejecting transaction TXN-2026-1014?',
]

/**
 * Phase 2 deterministic MIS query layer reading shared frontend state.
 * Clearly separated so a local Ollama LLM adapter can replace or augment this in later phases.
 */
export function queryMisDeterministic(
  question: string,
  transactions: TransactionRecord[],
  partners: TradingPartnerSummary[]
): AssistantQueryResult {
  const q = question.trim().toLowerCase()

  // 1. Lookup specific TXN ID or Document Number mentioned in question
  const directMatch = transactions.find(
    (t) =>
      q.includes(t.transactionId.toLowerCase()) ||
      q.includes(t.documentNumber.toLowerCase())
  )
  if (directMatch) {
    const issueNote = directMatch.exceptionReason
      ? ` Exception detail: ${directMatch.exceptionReason}`
      : ''
    const poRef = directMatch.referencePo ? ` (refers to ${directMatch.referencePo})` : ''
    return {
      reply:
        `${directMatch.transactionId} (${directMatch.documentNumber}, X12 ${directMatch.documentType}) ` +
        `is currently ${directMatch.status.toUpperCase()} · Ack: ${directMatch.ackStatus}. ` +
        `Route: ${directMatch.sender} → ${directMatch.receiver}. ` +
        `Amount: ${formatINR(directMatch.amount)}${poRef}.${issueNote}`,
      relatedTransactionIds: [directMatch.transactionId],
    }
  }

  // 2. Pending transactions
  if (q.includes('pending') || q.includes('awaiting') || q.includes('acknowledg')) {
    const pending = transactions.filter(
      (t) => t.status === 'Pending' || t.status === 'Processing' || t.status === 'Draft'
    )
    if (pending.length === 0) {
      return {
        reply: 'There are currently 0 pending transactions in the ledger. All active documents have reached Accepted or Rejected status.',
        relatedTransactionIds: [],
      }
    }
    const totalPendingAmt = pending.reduce((sum, t) => sum + t.amount, 0)
    const lines = pending.map(
      (t) =>
        `• ${t.transactionId} (${t.documentNumber}) — ${t.sender} → ${t.receiver}, ${formatINR(t.amount)} [${t.ackStatus}]`
    )
    return {
      reply:
        `There are ${pending.length} pending transaction(s) totaling ${formatINR(totalPendingAmt)}:\n` +
        lines.join('\n'),
      relatedTransactionIds: pending.map((t) => t.transactionId),
    }
  }

  // 3. Invoice discrepancies / rejected invoices
  if (
    q.includes('discrepanc') ||
    q.includes('mismatch') ||
    q.includes('invoice') ||
    q.includes('why') ||
    q.includes('810')
  ) {
    const flaggedInvoices = transactions.filter(
      (t) => t.documentType === '810' && (t.status === 'Rejected' || Boolean(t.exceptionReason))
    )
    if (flaggedInvoices.length === 0) {
      return {
        reply: 'All 810 invoices in the current ledger match their referenced purchase orders without active discrepancies.',
        relatedTransactionIds: [],
      }
    }
    const lines = flaggedInvoices.map(
      (inv) =>
        `• ${inv.transactionId} (${inv.documentNumber}) from ${inv.sender}: ${formatINR(inv.amount)} — ${inv.exceptionReason ?? inv.summary}`
    )
    return {
      reply:
        `Found ${flaggedInvoices.length} invoice(s) with validation exceptions or PO discrepancies:\n` +
        lines.join('\n') +
        `\nRecommended action: Open Document Processing to compare line items against the PO and either reject or correct & reprocess.`,
      relatedTransactionIds: flaggedInvoices.map((i) => i.transactionId),
    }
  }

  // 4. Partner with most rejected documents / errors
  if (q.includes('partner') || q.includes('most reject') || q.includes('error') || q.includes('supplier')) {
    const counts = partners.map((p) => {
      const rejectedBySender = transactions.filter(
        (t) => t.sender === p.name && t.status === 'Rejected'
      )
      return {
        partner: p,
        rejectedCount: rejectedBySender.length,
        txns: rejectedBySender,
      }
    })
    counts.sort((a, b) => b.rejectedCount - a.rejectedCount)
    const top = counts[0]
    if (!top || top.rejectedCount === 0) {
      return {
        reply: 'No trading partner currently has rejected documents in the active dataset.',
        relatedTransactionIds: [],
      }
    }
    const summaryLines = counts
      .filter((c) => c.rejectedCount > 0)
      .map(
        (c) =>
          `• ${c.partner.name} (${c.partner.role}): ${c.rejectedCount} rejected document(s) — ` +
          c.txns.map((t) => t.documentNumber).join(', ')
      )
    return {
      reply:
        `${top.partner.name} currently has the highest rejected document count (${top.rejectedCount}):\n` +
        summaryLines.join('\n'),
      relatedTransactionIds: top.txns.map((t) => t.transactionId),
    }
  }

  // 5. General summary / activity overview
  const total = transactions.length
  const accepted = transactions.filter((t) => t.status === 'Accepted').length
  const pending = transactions.filter(
    (t) => t.status === 'Pending' || t.status === 'Processing' || t.status === 'Draft'
  ).length
  const rejected = transactions.filter((t) => t.status === 'Rejected').length
  const totalValue = transactions.reduce((s, t) => s + t.amount, 0)
  const activePartners = partners.filter((p) => p.active).length
  const latest = transactions.slice(0, 3)

  return {
    reply:
      `Active EDI Summary across ${total} transactions (${formatINR(totalValue)} total value) and ${activePartners} active trading partners:\n` +
      `• Accepted: ${accepted} (${total > 0 ? Math.round((accepted / total) * 100) : 0}%)\n` +
      `• Pending / In Progress: ${pending}\n` +
      `• Rejected / Exceptions: ${rejected}\n` +
      `Most recent activity:\n` +
      latest
        .map(
          (t) =>
            `• ${t.transactionId} (${t.documentType} · ${t.documentNumber}): ${t.sender} → ${t.receiver}, ${formatINR(t.amount)} [${t.status}]`
        )
        .join('\n'),
    relatedTransactionIds: latest.map((t) => t.transactionId),
  }
}

