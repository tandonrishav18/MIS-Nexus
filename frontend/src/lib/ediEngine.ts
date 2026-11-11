import { formatINR } from '@/lib/format'
import type {
  EdiMappingRule,
  LineItem,
  TradingPartnerSummary,
  TransactionRecord,
  ValidationCheckItem,
} from '@/types/edi'

function padRight(value: string, len: number): string {
  return value.slice(0, len).padEnd(len, ' ')
}

function toX12Date(isoDate: string): string {
  const d = new Date(isoDate)
  if (Number.isNaN(d.getTime())) return '20261111'
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

function toX12ShortDate(isoDate: string): string {
  return toX12Date(isoDate).slice(2)
}

export function calculateTotals(
  lineItems: Array<{ quantity: number; unitPrice: number }>,
  taxRatePct: number
): { subtotal: number; taxAmount: number; grandTotal: number } {
  const subtotal = Math.round(
    lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  )
  const taxAmount = Math.round((subtotal * taxRatePct) / 100)
  return {
    subtotal,
    taxAmount,
    grandTotal: subtotal + taxAmount,
  }
}

export interface ValidationOutcome {
  passed: boolean
  checks: ValidationCheckItem[]
  exceptionReason?: string
  matchedPo?: TransactionRecord
  varianceAmount?: number
}

/**
 * Deterministic EDI & financial validation engine.
 * Never alters invoice amounts silently and never uses AI for financial checks.
 */
export function validateTransactionDeterministic(
  txn: TransactionRecord,
  allTransactions: TransactionRecord[],
  partners: TradingPartnerSummary[]
): ValidationOutcome {
  const checks: ValidationCheckItem[] = []

  // 1. Required fields
  const hasRequired =
    txn.documentNumber.trim().length > 0 &&
    txn.sender.trim().length > 0 &&
    txn.receiver.trim().length > 0 &&
    txn.sender !== txn.receiver

  checks.push({
    id: 'chk-req',
    ruleCode: 'REQ_HEADER',
    label: 'Document Header & Routing Completeness',
    status: hasRequired ? 'pass' : 'fail',
    detail: hasRequired
      ? `${txn.documentNumber} routed from ${txn.sender} to ${txn.receiver}.`
      : 'Missing required document number or invalid sender/receiver pair.',
  })

  // 2. Partner directory & active status
  const senderPartner = partners.find((p) => p.name === txn.sender)
  const receiverPartner = partners.find((p) => p.name === txn.receiver)
  const partnersValid =
    Boolean(senderPartner?.active) &&
    Boolean(receiverPartner?.active) &&
    Boolean(senderPartner?.supportedDocs.includes(txn.documentType)) &&
    Boolean(receiverPartner?.supportedDocs.includes(txn.documentType))

  checks.push({
    id: 'chk-partner',
    ruleCode: 'PARTNER_ELIGIBLE',
    label: 'Trading Partner Status & X12 Capability',
    status: partnersValid ? 'pass' : 'fail',
    detail: partnersValid
      ? `Both ${senderPartner?.partnerCode} and ${receiverPartner?.partnerCode} are active for X12 ${txn.documentType}.`
      : 'One or more trading partners are inactive or not enabled for this X12 message type.',
  })

  // 3. Line item positive checks
  const hasItems = txn.lineItems.length > 0
  const allPositive =
    hasItems &&
    txn.lineItems.every(
      (item) =>
        item.sku.trim().length > 0 &&
        item.description.trim().length > 0 &&
        Number.isFinite(item.quantity) &&
        item.quantity > 0 &&
        Number.isFinite(item.unitPrice) &&
        item.unitPrice > 0
    )

  checks.push({
    id: 'chk-lines',
    ruleCode: 'LINE_POSITIVE',
    label: 'Line-Item Quantities & Unit Pricing',
    status: allPositive ? 'pass' : 'fail',
    detail: allPositive
      ? `${txn.lineItems.length} line item(s) verified with positive quantities and unit prices.`
      : 'Line items must include SKU, description, quantity > 0, and unit price > 0.',
  })

  // 4. Financial arithmetic reconciliation
  const computedSubtotal = Math.round(
    txn.lineItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0)
  )
  const expectedTotal = computedSubtotal + Math.round(txn.taxAmount)
  const mathDelta = Math.abs(txn.amount - expectedTotal)
  const mathValid = mathDelta <= 1 && txn.amount > 0

  checks.push({
    id: 'chk-math',
    ruleCode: 'TOTAL_RECONCILE',
    label: 'Subtotal, Tax & Grand Total Arithmetic',
    status: mathValid ? 'pass' : 'fail',
    detail: mathValid
      ? `Line subtotal (${formatINR(computedSubtotal)}) + tax (${formatINR(txn.taxAmount)}) equals ${formatINR(txn.amount)}.`
      : `Line item sum + tax (${formatINR(expectedTotal)}) does not match document total (${formatINR(txn.amount)}).`,
  })

  // 5. Purchase Order Matching for 810 Invoices
  let matchedPo: TransactionRecord | undefined
  let varianceAmount: number | undefined
  let exceptionReason: string | undefined

  if (txn.documentType === '810') {
    if (!txn.referencePo || !txn.referencePo.trim()) {
      checks.push({
        id: 'chk-po-ref',
        ruleCode: 'PO_REFERENCE',
        label: 'Purchase Order Reference Check',
        status: 'warning',
        detail: 'No Purchase Order number referenced; routed for manual buyer verification.',
      })
    } else {
      matchedPo = allTransactions.find(
        (candidate) =>
          candidate.documentType === '850' &&
          candidate.documentNumber.toUpperCase() === txn.referencePo?.trim().toUpperCase()
      )

      if (!matchedPo) {
        checks.push({
          id: 'chk-po-match',
          ruleCode: 'PO_EXISTS',
          label: 'Referenced Purchase Order Lookup',
          status: 'fail',
          detail: `Referenced Purchase Order ${txn.referencePo} was not found in EDI ledger.`,
        })
        exceptionReason = `Referenced Purchase Order ${txn.referencePo} was not found.`
      } else {
        varianceAmount = txn.amount - matchedPo.amount
        const absDiff = Math.abs(varianceAmount)
        const pct =
          matchedPo.amount > 0 ? ((absDiff / matchedPo.amount) * 100).toFixed(2) : '0.00'

        if (absDiff === 0) {
          checks.push({
            id: 'chk-po-match',
            ruleCode: 'PO_AMOUNT_MATCH',
            label: 'Two-Way PO to Invoice Amount Match',
            status: 'pass',
            detail: `Invoice ${formatINR(txn.amount)} matches ${matchedPo.documentNumber} (${formatINR(matchedPo.amount)}) exactly.`,
          })
        } else {
          const direction = varianceAmount > 0 ? 'exceeds' : 'is below'
          const signedDiff =
            varianceAmount > 0 ? `+${formatINR(absDiff)}` : `-${formatINR(absDiff)}`
          exceptionReason = `Amount mismatch: Invoice ${formatINR(txn.amount)} ${direction} ${matchedPo.documentNumber} (${formatINR(matchedPo.amount)}) by ${signedDiff} (${pct}%).`
          checks.push({
            id: 'chk-po-match',
            ruleCode: 'PO_AMOUNT_MATCH',
            label: 'Two-Way PO to Invoice Amount Match',
            status: 'fail',
            detail: exceptionReason,
          })
        }
      }
    }
  }

  if (!exceptionReason) {
    const firstFail = checks.find((c) => c.status === 'fail')
    if (firstFail) {
      exceptionReason = firstFail.detail
    }
  }

  const passed = checks.every((c) => c.status !== 'fail')
  return {
    passed,
    checks,
    exceptionReason,
    matchedPo,
    varianceAmount,
  }
}

/**
 * Generates a representative ANSI X12 interchange payload (004010)
 * for 850 (PO), 855 (POA), 810 (Invoice), or 856 (ASN).
 */
export function generateX12Payload(
  txn: TransactionRecord,
  partners: TradingPartnerSummary[],
  customMappings?: EdiMappingRule[]
): string {
  const senderPartner = partners.find((p) => p.name === txn.sender)
  const receiverPartner = partners.find((p) => p.name === txn.receiver)

  const senderQual = senderPartner?.isaQualifier ?? 'ZZ'
  const senderIsa = padRight(senderPartner?.isaId ?? 'SENDER01', 15)
  const receiverQual = receiverPartner?.isaQualifier ?? 'ZZ'
  const receiverIsa = padRight(receiverPartner?.isaId ?? 'RECEIVER01', 15)
  const senderGs = senderPartner?.gsId ?? 'SENDERGS'
  const receiverGs = receiverPartner?.gsId ?? 'RECEIVERGS'

  const shortDate = toX12ShortDate(txn.transactionDate)
  const fullDate = toX12Date(txn.transactionDate)
  const controlNum = txn.transactionId.replace(/\D/g, '').slice(-9).padStart(9, '0')
  const stControl = txn.transactionId.replace(/\D/g, '').slice(-4).padStart(4, '0')

  const gsFunctionalCode: Record<TransactionRecord['documentType'], string> = {
    '850': 'PO',
    '855': 'PR',
    '810': 'IN',
    '856': 'SH',
  }

  const bodySegments: string[] = []

  if (txn.documentType === '850') {
    bodySegments.push(`BEG*00*NE*${txn.documentNumber}**${fullDate}~`)
    bodySegments.push(`CUR*BY*INR~`)
    bodySegments.push(
      `N1*BY*${txn.sender}*92*${senderPartner?.partnerCode ?? 'BUYER'}~`
    )
    bodySegments.push(
      `N1*SE*${txn.receiver}*92*${receiverPartner?.partnerCode ?? 'SUPPLIER'}~`
    )
    txn.lineItems.forEach((item: LineItem, idx: number) => {
      bodySegments.push(
        `PO1*${idx + 1}*${item.quantity}*EA*${item.unitPrice}*PE*VP*${item.sku}~`
      )
      bodySegments.push(`LIN*${idx + 1}*VP*${item.sku}~`)
      bodySegments.push(`PID*F****${item.description}~`)
    })
    bodySegments.push(`CTT*${txn.lineItems.length}~`)
    bodySegments.push(`AMT*TT*${txn.amount}~`)
  } else if (txn.documentType === '855') {
    bodySegments.push(
      `BAK*00*AC*${txn.referencePo ?? txn.documentNumber}*${fullDate}*****${fullDate}~`
    )
    bodySegments.push(`REF*PO*${txn.referencePo ?? txn.documentNumber}~`)
    bodySegments.push(
      `N1*SE*${txn.sender}*92*${senderPartner?.partnerCode ?? 'SUPPLIER'}~`
    )
    bodySegments.push(
      `N1*BY*${txn.receiver}*92*${receiverPartner?.partnerCode ?? 'BUYER'}~`
    )
    txn.lineItems.forEach((item, idx) => {
      bodySegments.push(
        `PO1*${idx + 1}*${item.quantity}*EA*${item.unitPrice}**VP*${item.sku}~`
      )
      bodySegments.push(`ACK*IA*${item.quantity}*EA*010*${fullDate}~`)
    })
    bodySegments.push(`CTT*${txn.lineItems.length}~`)
  } else if (txn.documentType === '810') {
    bodySegments.push(
      `BIG*${fullDate}*${txn.documentNumber}*${fullDate}*${txn.referencePo ?? ''}~`
    )
    bodySegments.push(`CUR*SE*INR~`)
    if (txn.referencePo) {
      bodySegments.push(`REF*PO*${txn.referencePo}~`)
    }
    bodySegments.push(
      `N1*RE*${txn.sender}*92*${senderPartner?.partnerCode ?? 'SUPPLIER'}~`
    )
    bodySegments.push(
      `N1*BT*${txn.receiver}*92*${receiverPartner?.partnerCode ?? 'BUYER'}~`
    )
    txn.lineItems.forEach((item, idx) => {
      bodySegments.push(
        `IT1*${idx + 1}*${item.quantity}*EA*${item.unitPrice}**VP*${item.sku}~`
      )
      bodySegments.push(`PID*F****${item.description}~`)
    })
    bodySegments.push(`TDS*${Math.round(txn.amount * 100)}~`)
    bodySegments.push(`CTT*${txn.lineItems.length}~`)
  } else {
    bodySegments.push(`BSN*00*${txn.documentNumber}*${fullDate}*1400~`)
    bodySegments.push(`HL*1**S~`)
    bodySegments.push(`REF*PO*${txn.referencePo ?? ''}~`)
    bodySegments.push(
      `N1*SF*${txn.sender}*92*${senderPartner?.partnerCode ?? 'CARRIER'}~`
    )
    bodySegments.push(
      `N1*ST*${txn.receiver}*92*${receiverPartner?.partnerCode ?? 'BUYER'}~`
    )
    txn.lineItems.forEach((item, idx) => {
      bodySegments.push(`HL*${idx + 2}*1*I~`)
      bodySegments.push(`LIN*${idx + 1}*VP*${item.sku}~`)
      bodySegments.push(`SN1*${idx + 1}*${item.quantity}*EA~`)
    })
    bodySegments.push(`CTT*${txn.lineItems.length + 1}~`)
  }

  // Note custom mapping tags if user added custom rules in Mapping Studio
  const customRules = (customMappings ?? []).filter(
    (r) => r.documentType === txn.documentType && r.status === 'Custom'
  )
  for (const rule of customRules) {
    bodySegments.push(`N9*ZZ*${rule.ediSegment}_${rule.ediElement}*${rule.sourcePath}~`)
  }

  const seCount = bodySegments.length + 2
  const lines = [
    `ISA*00*          *00*          *${senderQual}*${senderIsa}*${receiverQual}*${receiverIsa}*${shortDate}*1030*U*00401*${controlNum}*0*P*>~`,
    `GS*${gsFunctionalCode[txn.documentType]}*${senderGs}*${receiverGs}*${fullDate}*1030*1*X*004010~`,
    `ST*${txn.documentType}*${stControl}~`,
    ...bodySegments,
    `SE*${seCount}*${stControl}~`,
    `GE*1*1~`,
    `IEA*1*${controlNum}~`,
  ]

  return lines.join('\n')
}

