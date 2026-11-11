import { DOC_TYPE_META, formatINR, type EdiDocCode } from '@/lib/format'
import { generateX12Payload } from '@/lib/ediEngine'
import type {
  AiBusinessInsight,
  AppSettingsState,
  DocDistributionItem,
  EdiMappingRule,
  LineItem,
  NotificationItem,
  PartnerActivityItem,
  ProcessingEvent,
  TradingPartnerSummary,
  TransactionRecord,
  ValidationCheckItem,
  VolumeTrendPoint,
} from '@/types/edi'

export const DEMO_PARTNERS: TradingPartnerSummary[] = [
  {
    id: 'ptr-metro',
    name: 'Metro Retail',
    role: 'Buyer',
    partnerCode: 'METRO',
    isaQualifier: 'ZZ',
    isaId: 'METRORETAIL01',
    gsId: 'METROPROC',
    supportedDocs: ['850', '855', '810', '856'],
    active: true,
    isDemoSeed: true,
    gstin: '29AABCM4821K1Z4',
    city: 'Bengaluru',
    state: 'Karnataka',
    contactName: 'Rohan Deshmukh',
    contactEmail: 'edi-ops@metroretail.example',
    contactPhone: '+91 80 4120 8900',
    slaAckHours: 4,
    notes: 'Primary retail procurement hub issuing X12 850 purchase orders.',
  },
  {
    id: 'ptr-abc',
    name: 'ABC Components',
    role: 'Supplier',
    partnerCode: 'ABCCOMP',
    isaQualifier: 'ZZ',
    isaId: 'ABCCOMPONENTS',
    gsId: 'ABCSALES',
    supportedDocs: ['850', '855', '810', '856'],
    active: true,
    isDemoSeed: true,
    gstin: '27AADCA9104E1Z9',
    city: 'Pune',
    state: 'Maharashtra',
    contactName: 'Neha Kulkarni',
    contactEmail: 'billing-edi@abccomponents.example',
    contactPhone: '+91 20 6721 3340',
    slaAckHours: 6,
    notes: 'Enterprise IT hardware supplier fulfilling laptops, monitors, and docks.',
  },
  {
    id: 'ptr-kaveri',
    name: 'Kaveri Logistics',
    role: 'Logistics',
    partnerCode: 'KAVERI3PL',
    isaQualifier: 'ZZ',
    isaId: 'KAVERIFREIGHT',
    gsId: 'KAVLOG',
    supportedDocs: ['856', '810'],
    active: true,
    isDemoSeed: true,
    gstin: '33AAACK6420M1Z2',
    city: 'Chennai',
    state: 'Tamil Nadu',
    contactName: 'Suresh Subramanian',
    contactEmail: 'dispatch@kaverilogistics.example',
    contactPhone: '+91 44 2819 7710',
    slaAckHours: 12,
    notes: 'Regional 3PL freight carrier emitting X12 856 ASNs and freight invoices.',
  },
]

function buildSeedPassChecks(docNum: string, sender: string, receiver: string, amt: number): ValidationCheckItem[] {
  return [
    {
      id: 'chk-req',
      ruleCode: 'REQ_HEADER',
      label: 'Document Header & Routing Completeness',
      status: 'pass',
      detail: `${docNum} routed from ${sender} to ${receiver}.`,
    },
    {
      id: 'chk-partner',
      ruleCode: 'PARTNER_ELIGIBLE',
      label: 'Trading Partner Status & X12 Capability',
      status: 'pass',
      detail: 'Sender and receiver active and enabled for this ANSI X12 message type.',
    },
    {
      id: 'chk-lines',
      ruleCode: 'LINE_POSITIVE',
      label: 'Line-Item Quantities & Unit Pricing',
      status: 'pass',
      detail: 'All line items contain positive quantities and positive unit rates.',
    },
    {
      id: 'chk-math',
      ruleCode: 'TOTAL_RECONCILE',
      label: 'Subtotal, Tax & Grand Total Arithmetic',
      status: 'pass',
      detail: `Reconciled total verified at ${formatINR(amt)}.`,
    },
  ]
}

function makeSeedTimeline(
  isoDate: string,
  docNum: string,
  sender: string,
  status: TransactionRecord['status'],
  extraNote?: string
): ProcessingEvent[] {
  const baseMs = new Date(isoDate).getTime()
  const t1 = new Date(baseMs).toISOString()
  const t2 = new Date(baseMs + 2 * 60000).toISOString()
  const t3 = new Date(baseMs + 5 * 60000).toISOString()

  const events: ProcessingEvent[] = [
    {
      id: 'ev-1',
      timestamp: t1,
      step: 'Document Registered',
      actor: sender,
      status: 'completed',
      note: `${docNum} entered EDI Nexus gateway.`,
    },
    {
      id: 'ev-2',
      timestamp: t2,
      step: 'Deterministic Validation',
      actor: 'Validation Engine',
      status: status === 'Rejected' ? 'error' : 'completed',
      note: extraNote ?? 'Schema, partner eligibility, and financial arithmetic passed.',
    },
  ]

  if (status === 'Accepted') {
    events.push({
      id: 'ev-3',
      timestamp: t3,
      step: 'Interchange Accepted',
      actor: 'EDI Gateway',
      status: 'completed',
      note: 'ANSI X12 payload generated and cleared for business ledger.',
    })
  } else if (status === 'Pending') {
    events.push({
      id: 'ev-3',
      timestamp: t3,
      step: 'Awaiting Partner Acknowledgement',
      actor: 'Workflow Monitor',
      status: 'warning',
      note: 'Dispatched X12 850; awaiting supplier 855 confirmation.',
    })
  } else if (status === 'Rejected') {
    events.push({
      id: 'ev-3',
      timestamp: t3,
      step: 'Exception Flagged for Review',
      actor: 'PO Matching Engine',
      status: 'error',
      note: extraNote ?? 'Validation exception requires human operator review.',
    })
  }

  return events
}

const RAW_DEMO_TRANSACTIONS: Array<
  Omit<TransactionRecord, 'ediPayload' | 'validationResults' | 'timeline'> & {
    customChecks?: ValidationCheckItem[]
    customTimeline?: ProcessingEvent[]
  }
> = [
  {
    id: '1',
    transactionId: 'TXN-2026-1014',
    documentNumber: 'INV-ABC-8824',
    documentType: '810',
    sender: 'ABC Components',
    receiver: 'Metro Retail',
    transactionDate: '2026-11-11T14:20:00+05:30',
    subtotal: 4600000,
    taxRatePct: 0,
    taxAmount: 0,
    amount: 4600000,
    status: 'Rejected',
    referencePo: 'PO-MTR-2026-441',
    ackStatus: 'Exception',
    summary: 'Invoice for 100 Enterprise Laptops — ₹1,00,000 above PO amount',
    exceptionReason:
      'Amount mismatch: Invoice ₹46,00,000 exceeds PO-MTR-2026-441 (₹45,00,000) by +₹1,00,000 (2.22%).',
    lineItems: [
      {
        id: 'li-1014-1',
        sku: 'LPT-PRO-15',
        description: 'Enterprise Laptop 15" i7 / 16GB / 512GB SSD',
        quantity: 100,
        unitPrice: 46000,
        lineTotal: 4600000,
      },
    ],
    customChecks: [
      ...buildSeedPassChecks('INV-ABC-8824', 'ABC Components', 'Metro Retail', 4600000),
      {
        id: 'chk-po-match',
        ruleCode: 'PO_AMOUNT_MATCH',
        label: 'Two-Way PO to Invoice Amount Match',
        status: 'fail',
        detail:
          'Amount mismatch: Invoice ₹46,00,000 exceeds PO-MTR-2026-441 (₹45,00,000) by +₹1,00,000 (2.22%).',
      },
    ],
    isDemoSeed: true,
  },
  {
    id: '2',
    transactionId: 'TXN-2026-1013',
    documentNumber: 'PO-MTR-2026-445',
    documentType: '850',
    sender: 'Metro Retail',
    receiver: 'ABC Components',
    transactionDate: '2026-11-11T11:05:00+05:30',
    subtotal: 1850000,
    taxRatePct: 0,
    taxAmount: 0,
    amount: 1850000,
    status: 'Pending',
    ackStatus: 'Awaiting Ack',
    summary: '50 Docking Stations & USB-C Hubs — awaiting supplier 855 POA',
    lineItems: [
      {
        id: 'li-1013-1',
        sku: 'DCK-THB-04',
        description: 'Thunderbolt 4 Enterprise Docking Station',
        quantity: 50,
        unitPrice: 37000,
        lineTotal: 1850000,
      },
    ],
    supplierReceiptSimulated: true,
    isDemoSeed: true,
  },
  {
    id: '3',
    transactionId: 'TXN-2026-1012',
    documentNumber: 'ASN-ABC-3109',
    documentType: '856',
    sender: 'ABC Components',
    receiver: 'Metro Retail',
    transactionDate: '2026-11-10T17:45:00+05:30',
    subtotal: 4500000,
    taxRatePct: 0,
    taxAmount: 0,
    amount: 4500000,
    status: 'Accepted',
    referencePo: 'PO-MTR-2026-441',
    ackStatus: 'Acknowledged',
    summary: 'Shipment dispatch notice for 100 Laptops via Kaveri Logistics',
    lineItems: [
      {
        id: 'li-1012-1',
        sku: 'LPT-PRO-15',
        description: 'Enterprise Laptop 15" i7 / 16GB / 512GB SSD',
        quantity: 100,
        unitPrice: 45000,
        lineTotal: 4500000,
      },
    ],
    isDemoSeed: true,
  },
  {
    id: '4',
    transactionId: 'TXN-2026-1011',
    documentNumber: 'POA-ABC-4410',
    documentType: '855',
    sender: 'ABC Components',
    receiver: 'Metro Retail',
    transactionDate: '2026-11-10T10:15:00+05:30',
    subtotal: 4500000,
    taxRatePct: 0,
    taxAmount: 0,
    amount: 4500000,
    status: 'Accepted',
    referencePo: 'PO-MTR-2026-441',
    ackStatus: 'Acknowledged',
    summary: 'Order acknowledgement confirming full delivery of 100 Laptops',
    lineItems: [
      {
        id: 'li-1011-1',
        sku: 'LPT-PRO-15',
        description: 'Enterprise Laptop 15" i7 / 16GB / 512GB SSD',
        quantity: 100,
        unitPrice: 45000,
        lineTotal: 4500000,
      },
    ],
    acknowledgement: {
      ackDocNumber: 'POA-ABC-4410',
      ackDate: '2026-11-10T10:15:00+05:30',
      ackCode: 'AC',
      note: 'Supplier confirmed full acceptance of 100 units at ₹45,000/unit.',
    },
    isDemoSeed: true,
  },
  {
    id: '5',
    transactionId: 'TXN-2026-1010',
    documentNumber: 'PO-MTR-2026-441',
    documentType: '850',
    sender: 'Metro Retail',
    receiver: 'ABC Components',
    transactionDate: '2026-11-10T09:12:00+05:30',
    subtotal: 4500000,
    taxRatePct: 0,
    taxAmount: 0,
    amount: 4500000,
    status: 'Accepted',
    ackStatus: 'Acknowledged',
    summary: 'Purchase order for 100 Enterprise Laptops @ ₹45,000 unit price',
    lineItems: [
      {
        id: 'li-1010-1',
        sku: 'LPT-PRO-15',
        description: 'Enterprise Laptop 15" i7 / 16GB / 512GB SSD',
        quantity: 100,
        unitPrice: 45000,
        lineTotal: 4500000,
      },
    ],
    supplierReceiptSimulated: true,
    acknowledgement: {
      ackDocNumber: 'POA-ABC-4410',
      ackDate: '2026-11-10T10:15:00+05:30',
      ackCode: 'AC',
      note: 'Acknowledged via X12 855 (POA-ABC-4410) for 100 units.',
    },
    isDemoSeed: true,
  },
  {
    id: '6',
    transactionId: 'TXN-2026-1009',
    documentNumber: 'PO-MTR-2026-439',
    documentType: '850',
    sender: 'Metro Retail',
    receiver: 'ABC Components',
    transactionDate: '2026-11-09T15:30:00+05:30',
    subtotal: 1240000,
    taxRatePct: 0,
    taxAmount: 0,
    amount: 1240000,
    status: 'Pending',
    ackStatus: 'Awaiting Ack',
    summary: '40 Dual-Band Enterprise Monitors — awaiting supplier 855 POA',
    lineItems: [
      {
        id: 'li-1009-1',
        sku: 'MON-U27-4K',
        description: '27" 4K IPS USB-C Enterprise Monitor',
        quantity: 40,
        unitPrice: 31000,
        lineTotal: 1240000,
      },
    ],
    supplierReceiptSimulated: true,
    isDemoSeed: true,
  },
  {
    id: '7',
    transactionId: 'TXN-2026-1008',
    documentNumber: 'INV-KAV-2190',
    documentType: '810',
    sender: 'Kaveri Logistics',
    receiver: 'Metro Retail',
    transactionDate: '2026-11-09T12:10:00+05:30',
    subtotal: 145000,
    taxRatePct: 0,
    taxAmount: 0,
    amount: 145000,
    status: 'Accepted',
    referencePo: 'PO-MTR-2026-434',
    ackStatus: 'Acknowledged',
    summary: 'Freight settlement invoice for regional warehouse transfer',
    lineItems: [
      {
        id: 'li-1008-1',
        sku: 'FRT-FTL-BLR',
        description: 'Dedicated FTL Linehaul Pune → Bengaluru Hub',
        quantity: 1,
        unitPrice: 145000,
        lineTotal: 145000,
      },
    ],
    isDemoSeed: true,
  },
  {
    id: '8',
    transactionId: 'TXN-2026-1007',
    documentNumber: 'INV-ABC-8791',
    documentType: '810',
    sender: 'ABC Components',
    receiver: 'Metro Retail',
    transactionDate: '2026-11-08T16:40:00+05:30',
    subtotal: 2250000,
    taxRatePct: 0,
    taxAmount: 0,
    amount: 2250000,
    status: 'Accepted',
    referencePo: 'PO-MTR-2026-432',
    ackStatus: 'Acknowledged',
    summary: 'Matched invoice for 50 Pro Workstations',
    lineItems: [
      {
        id: 'li-1007-1',
        sku: 'WKS-PRO-32',
        description: 'Pro Workstation Tower Xeon / 32GB ECC',
        quantity: 50,
        unitPrice: 45000,
        lineTotal: 2250000,
      },
    ],
    customChecks: [
      ...buildSeedPassChecks('INV-ABC-8791', 'ABC Components', 'Metro Retail', 2250000),
      {
        id: 'chk-po-match',
        ruleCode: 'PO_AMOUNT_MATCH',
        label: 'Two-Way PO to Invoice Amount Match',
        status: 'pass',
        detail: 'Invoice ₹22,50,000 matches PO-MTR-2026-432 (₹22,50,000) exactly.',
      },
    ],
    isDemoSeed: true,
  },
  {
    id: '9',
    transactionId: 'TXN-2026-1006',
    documentNumber: 'POA-ABC-4320',
    documentType: '855',
    sender: 'ABC Components',
    receiver: 'Metro Retail',
    transactionDate: '2026-11-07T14:05:00+05:30',
    subtotal: 2250000,
    taxRatePct: 0,
    taxAmount: 0,
    amount: 2250000,
    status: 'Accepted',
    referencePo: 'PO-MTR-2026-432',
    ackStatus: 'Acknowledged',
    summary: 'Full acceptance for 50 Pro Workstations',
    lineItems: [
      {
        id: 'li-1006-1',
        sku: 'WKS-PRO-32',
        description: 'Pro Workstation Tower Xeon / 32GB ECC',
        quantity: 50,
        unitPrice: 45000,
        lineTotal: 2250000,
      },
    ],
    acknowledgement: {
      ackDocNumber: 'POA-ABC-4320',
      ackDate: '2026-11-07T14:05:00+05:30',
      ackCode: 'AC',
      note: 'Full quantity accepted.',
    },
    isDemoSeed: true,
  },
  {
    id: '10',
    transactionId: 'TXN-2026-1005',
    documentNumber: 'PO-MTR-2026-432',
    documentType: '850',
    sender: 'Metro Retail',
    receiver: 'ABC Components',
    transactionDate: '2026-11-07T10:20:00+05:30',
    subtotal: 2250000,
    taxRatePct: 0,
    taxAmount: 0,
    amount: 2250000,
    status: 'Accepted',
    ackStatus: 'Acknowledged',
    summary: 'Purchase order for 50 Pro Workstations',
    lineItems: [
      {
        id: 'li-1005-1',
        sku: 'WKS-PRO-32',
        description: 'Pro Workstation Tower Xeon / 32GB ECC',
        quantity: 50,
        unitPrice: 45000,
        lineTotal: 2250000,
      },
    ],
    supplierReceiptSimulated: true,
    acknowledgement: {
      ackDocNumber: 'POA-ABC-4320',
      ackDate: '2026-11-07T14:05:00+05:30',
      ackCode: 'AC',
      note: 'Acknowledged via POA-ABC-4320.',
    },
    isDemoSeed: true,
  },
  {
    id: '11',
    transactionId: 'TXN-2026-1004',
    documentNumber: 'ASN-KAV-1102',
    documentType: '856',
    sender: 'Kaveri Logistics',
    receiver: 'Metro Retail',
    transactionDate: '2026-11-06T18:00:00+05:30',
    subtotal: 980000,
    taxRatePct: 0,
    taxAmount: 0,
    amount: 980000,
    status: 'Accepted',
    referencePo: 'PO-MTR-2026-428',
    ackStatus: 'Acknowledged',
    summary: 'Palletized delivery notice for Bengaluru hub',
    lineItems: [
      {
        id: 'li-1004-1',
        sku: 'NET-SW-48P',
        description: '48-Port Managed Enterprise PoE+ Switch',
        quantity: 20,
        unitPrice: 49000,
        lineTotal: 980000,
      },
    ],
    isDemoSeed: true,
  },
  {
    id: '12',
    transactionId: 'TXN-2026-1003',
    documentNumber: 'INV-ABC-8760',
    documentType: '810',
    sender: 'ABC Components',
    receiver: 'Metro Retail',
    transactionDate: '2026-11-05T13:15:00+05:30',
    subtotal: 980000,
    taxRatePct: 0,
    taxAmount: 0,
    amount: 995000,
    status: 'Rejected',
    referencePo: 'PO-MTR-2026-428',
    ackStatus: 'Exception',
    summary: 'Duplicate tax line item rejected during X12 810 validation',
    exceptionReason: 'Line item sum ₹9,80,000 does not match invoice total ₹9,95,000',
    lineItems: [
      {
        id: 'li-1003-1',
        sku: 'NET-SW-48P',
        description: '48-Port Managed Enterprise PoE+ Switch',
        quantity: 20,
        unitPrice: 49000,
        lineTotal: 980000,
      },
    ],
    customChecks: [
      {
        id: 'chk-req',
        ruleCode: 'REQ_HEADER',
        label: 'Document Header & Routing Completeness',
        status: 'pass',
        detail: 'INV-ABC-8760 routed from ABC Components to Metro Retail.',
      },
      {
        id: 'chk-math',
        ruleCode: 'TOTAL_RECONCILE',
        label: 'Subtotal, Tax & Grand Total Arithmetic',
        status: 'fail',
        detail: 'Line item sum ₹9,80,000 does not match invoice total ₹9,95,000 (+₹15,000 unexplained surcharge).',
      },
    ],
    isDemoSeed: true,
  },
]

export const DEFAULT_MAPPING_RULES: EdiMappingRule[] = [
  {
    id: 'map-1',
    documentType: '850',
    sourceField: 'Purchase Order Number',
    sourcePath: 'documentNumber',
    ediSegment: 'BEG',
    ediElement: 'BEG03',
    ediDescription: 'Purchase Order Reference Identifier',
    transformRule: 'UPPER(TRIM(value))',
    status: 'Mapped',
    required: true,
  },
  {
    id: 'map-2',
    documentType: '850',
    sourceField: 'Document Date',
    sourcePath: 'transactionDate',
    ediSegment: 'BEG',
    ediElement: 'BEG05',
    ediDescription: 'Date expressed as CCYYMMDD',
    transformRule: 'FORMAT_DATE(YYYYMMDD)',
    status: 'Mapped',
    required: true,
  },
  {
    id: 'map-3',
    documentType: '850',
    sourceField: 'Buyer Identifier',
    sourcePath: 'sender.partnerCode',
    ediSegment: 'N1',
    ediElement: 'N104 (BY)',
    ediDescription: 'Buying Party Identification Code',
    transformRule: 'PARTNER_CODE_LOOKUP(BY)',
    status: 'Mapped',
    required: true,
  },
  {
    id: 'map-4',
    documentType: '850',
    sourceField: 'Supplier Identifier',
    sourcePath: 'receiver.partnerCode',
    ediSegment: 'N1',
    ediElement: 'N104 (SE)',
    ediDescription: 'Selling Party Identification Code',
    transformRule: 'PARTNER_CODE_LOOKUP(SE)',
    status: 'Mapped',
    required: true,
  },
  {
    id: 'map-5',
    documentType: '850',
    sourceField: 'Item SKU',
    sourcePath: 'lineItems[].sku',
    ediSegment: 'LIN',
    ediElement: 'LIN03',
    ediDescription: 'Vendor Product / Item SKU',
    transformRule: 'DIRECT_STRING(VP)',
    status: 'Mapped',
    required: true,
  },
  {
    id: 'map-6',
    documentType: '850',
    sourceField: 'Quantity',
    sourcePath: 'lineItems[].quantity',
    ediSegment: 'PO1',
    ediElement: 'PO102',
    ediDescription: 'Quantity Ordered (Numeric)',
    transformRule: 'INTEGER(value)',
    status: 'Mapped',
    required: true,
  },
  {
    id: 'map-7',
    documentType: '850',
    sourceField: 'Unit Price',
    sourcePath: 'lineItems[].unitPrice',
    ediSegment: 'PO1',
    ediElement: 'PO104',
    ediDescription: 'Unit Price in INR',
    transformRule: 'DECIMAL(2)',
    status: 'Mapped',
    required: true,
  },
  {
    id: 'map-8',
    documentType: '850',
    sourceField: 'Line Item Count',
    sourcePath: 'lineItems.length',
    ediSegment: 'CTT',
    ediElement: 'CTT01',
    ediDescription: 'Transaction Line Item Hash Total',
    transformRule: 'COUNT(lineItems)',
    status: 'Mapped',
    required: true,
  },
  {
    id: 'map-9',
    documentType: '810',
    sourceField: 'Invoice Number',
    sourcePath: 'documentNumber',
    ediSegment: 'BIG',
    ediElement: 'BIG02',
    ediDescription: 'Invoice Identification Number',
    transformRule: 'UPPER(TRIM(value))',
    status: 'Mapped',
    required: true,
  },
  {
    id: 'map-10',
    documentType: '810',
    sourceField: 'Reference Purchase Order',
    sourcePath: 'referencePo',
    ediSegment: 'BIG',
    ediElement: 'BIG04',
    ediDescription: 'Matched Buyer PO Reference',
    transformRule: 'PO_LOOKUP(value)',
    status: 'Mapped',
    required: true,
  },
  {
    id: 'map-11',
    documentType: '810',
    sourceField: 'Billed Quantity',
    sourcePath: 'lineItems[].quantity',
    ediSegment: 'IT1',
    ediElement: 'IT102',
    ediDescription: 'Quantity Invoiced',
    transformRule: 'INTEGER(value)',
    status: 'Mapped',
    required: true,
  },
  {
    id: 'map-12',
    documentType: '810',
    sourceField: 'Invoice Total (Paise)',
    sourcePath: 'amount',
    ediSegment: 'TDS',
    ediElement: 'TDS01',
    ediDescription: 'Total Monetary Value Summary',
    transformRule: 'MULTIPLY(100)',
    status: 'Mapped',
    required: true,
  },
]

export const DEFAULT_APP_SETTINGS: AppSettingsState = {
  organizationName: 'Metro Retail Supply Chain Hub',
  hubCode: 'METRO-HUB-01',
  hubGstin: '29AABCM4821K1Z4',
  adminEmail: 'edi-ops@metroretail.example',
  defaultTaxRatePct: 0,
  autoValidateOnSubmit: true,
  ediStandardVersion: 'ANSI X12 · 004010',
  segmentTerminator: '~',
  elementSeparator: '*',
  ollamaEndpoint: 'http://localhost:11434',
  ollamaModel: 'qwen2.5:7b',
}

export const DEMO_TRANSACTIONS: TransactionRecord[] = RAW_DEMO_TRANSACTIONS.map((raw) => {
  const baseTxn: TransactionRecord = {
    ...raw,
    validationResults:
      raw.customChecks ??
      buildSeedPassChecks(raw.documentNumber, raw.sender, raw.receiver, raw.amount),
    timeline:
      raw.customTimeline ??
      makeSeedTimeline(
        raw.transactionDate,
        raw.documentNumber,
        raw.sender,
        raw.status,
        raw.exceptionReason
      ),
    ediPayload: '',
  }
  baseTxn.ediPayload = generateX12Payload(baseTxn, DEMO_PARTNERS, DEFAULT_MAPPING_RULES)
  return baseTxn
})

export function deriveDashboardMetrics(transactions: TransactionRecord[]) {
  const totalTransactions = transactions.length
  const acceptedDocuments = transactions.filter((t) => t.status === 'Accepted').length
  const pendingTransactions = transactions.filter(
    (t) => t.status === 'Pending' || t.status === 'Processing' || t.status === 'Draft'
  ).length
  const rejectedDocuments = transactions.filter((t) => t.status === 'Rejected').length
  const totalVolumeAmount = transactions.reduce((sum, t) => sum + t.amount, 0)
  const acceptanceRate =
    totalTransactions > 0 ? Math.round((acceptedDocuments / totalTransactions) * 100) : 0

  return {
    totalTransactions,
    acceptedDocuments,
    pendingTransactions,
    rejectedDocuments,
    totalVolumeAmount,
    acceptanceRate,
  }
}

export function deriveVolumeTrend(transactions: TransactionRecord[]): VolumeTrendPoint[] {
  const byDay = new Map<
    string,
    { accepted: number; exceptions: number; total: number; value: number }
  >()

  const sorted = [...transactions].sort(
    (a, b) => new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
  )

  for (const txn of sorted) {
    const d = new Date(txn.transactionDate)
    const key = new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short' }).format(d)
    const entry = byDay.get(key) ?? { accepted: 0, exceptions: 0, total: 0, value: 0 }
    entry.total += 1
    entry.value += txn.amount
    if (txn.status === 'Accepted') entry.accepted += 1
    if (txn.status === 'Rejected' || txn.status === 'Pending' || txn.status === 'Processing')
      entry.exceptions += 1
    byDay.set(key, entry)
  }

  return Array.from(byDay.entries()).map(([dateLabel, stats]) => ({
    dateLabel,
    total: stats.total,
    accepted: stats.accepted,
    exceptions: stats.exceptions,
    valueLakhs: Number((stats.value / 100000).toFixed(1)),
  }))
}

export function deriveDocDistribution(transactions: TransactionRecord[]): DocDistributionItem[] {
  const codes: EdiDocCode[] = ['850', '855', '810', '856']
  const total = transactions.length || 1
  return codes.map((code) => {
    const count = transactions.filter((t) => t.documentType === code).length
    return {
      code,
      label: `${code} · ${DOC_TYPE_META[code].label}`,
      count,
      sharePct: Math.round((count / total) * 100),
    }
  })
}

export function derivePartnerActivity(
  partners: TradingPartnerSummary[],
  transactions: TransactionRecord[]
): PartnerActivityItem[] {
  return partners.map((p) => {
    const sent = transactions.filter((t) => t.sender === p.name)
    const received = transactions.filter((t) => t.receiver === p.name)
    const involved = [...sent, ...received]
    const rejectedCount = sent.filter((t) => t.status === 'Rejected').length
    return {
      partnerName: p.name,
      role: p.role,
      partnerCode: p.partnerCode,
      sentCount: sent.length,
      receivedCount: received.length,
      acceptedCount: involved.filter((t) => t.status === 'Accepted').length,
      rejectedCount,
      errorCount: rejectedCount,
      totalValue: involved.reduce((sum, t) => sum + t.amount, 0),
      active: p.active,
    }
  })
}

export function derivePendingAckAlerts(transactions: TransactionRecord[]): TransactionRecord[] {
  return transactions.filter((t) => t.ackStatus === 'Awaiting Ack' || t.status === 'Pending')
}

export function deriveNotifications(transactions: TransactionRecord[]): NotificationItem[] {
  const alerts: NotificationItem[] = []

  for (const txn of transactions) {
    if (txn.status === 'Rejected') {
      alerts.push({
        id: `notif-${txn.id}`,
        title: `${txn.documentNumber} Rejected (${txn.documentType})`,
        detail: txn.exceptionReason ?? txn.summary,
        severity: 'danger',
        timestamp: txn.transactionDate,
        targetPath: `/processing/${txn.transactionId}`,
      })
    } else if (txn.ackStatus === 'Awaiting Ack') {
      alerts.push({
        id: `notif-${txn.id}`,
        title: `Awaiting 855 Ack · ${txn.documentNumber}`,
        detail: `${txn.sender} → ${txn.receiver} (${formatINR(txn.amount)})`,
        severity: 'warning',
        timestamp: txn.transactionDate,
        targetPath: `/processing/${txn.transactionId}`,
      })
    }
  }

  return alerts.slice(0, 6)
}

export function deriveAiBusinessInsights(transactions: TransactionRecord[]): AiBusinessInsight[] {
  const rejectedInvoices = transactions.filter(
    (t) => t.documentType === '810' && t.status === 'Rejected'
  )
  const pendingPos = transactions.filter(
    (t) => t.documentType === '850' && (t.ackStatus === 'Awaiting Ack' || t.status === 'Pending')
  )
  const acceptedCount = transactions.filter((t) => t.status === 'Accepted').length
  const totalCount = transactions.length
  const primaryMismatch = rejectedInvoices[0]

  const insights: AiBusinessInsight[] = []

  if (primaryMismatch) {
    insights.push({
      id: 'ins-mismatch',
      category: 'Exception',
      severity: 'danger',
      title: `PO-Invoice Variance Flagged on ${primaryMismatch.documentNumber}`,
      detail: `${primaryMismatch.sender} submitted ${formatINR(primaryMismatch.amount)} against ${primaryMismatch.referencePo ?? 'referenced PO'}. ${primaryMismatch.exceptionReason ?? 'Review variance before AP release.'}`,
      actionLabel: 'Inspect Exception',
      targetPath: `/processing/${primaryMismatch.transactionId}`,
    })
  }

  if (pendingPos.length > 0) {
    const pendingSum = pendingPos.reduce((s, p) => s + p.amount, 0)
    insights.push({
      id: 'ins-pending-ack',
      category: 'Partner SLA',
      severity: 'warning',
      title: `${pendingPos.length} Purchase Order(s) Awaiting 855 Acknowledgement`,
      detail: `${formatINR(pendingSum)} in open procurement orders has not yet received supplier 855 confirmation.`,
      actionLabel: 'Review Pending POs',
      targetPath: '/transactions?status=Pending',
    })
  }

  insights.push({
    id: 'ins-compliance',
    category: 'Compliance',
    severity: 'success',
    title: `${Math.round((acceptedCount / (totalCount || 1)) * 100)}% Straight-Through EDI Acceptance Rate`,
    detail: `${acceptedCount} of ${totalCount} ANSI X12 documents cleared deterministic validation across the trading network.`,
    actionLabel: 'Open Analytics',
    targetPath: '/reports',
  })

  return insights
}

export type { LineItem }
