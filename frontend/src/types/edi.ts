import type { EdiDocCode } from '@/lib/format'

export type TransactionStatus = 'Accepted' | 'Pending' | 'Rejected' | 'Processing' | 'Draft'

export type AckStatus = 'Acknowledged' | 'Awaiting Ack' | 'Not Required' | 'Exception'

export interface LineItem {
  id: string
  sku: string
  description: string
  quantity: number
  unitPrice: number
  lineTotal: number
}

export interface ValidationCheckItem {
  id: string
  ruleCode: string
  label: string
  status: 'pass' | 'warning' | 'fail'
  detail: string
}

export interface ProcessingEvent {
  id: string
  timestamp: string
  step: string
  actor: string
  status: 'completed' | 'warning' | 'error' | 'info'
  note: string
}

export interface AcknowledgementInfo {
  ackDocNumber: string
  ackDate: string
  ackCode: 'AC' | 'AD' | 'RD'
  note: string
}

export interface TradingPartnerSummary {
  id: string
  name: string
  role: 'Buyer' | 'Supplier' | 'Logistics'
  partnerCode: string
  isaQualifier: string
  isaId: string
  gsId: string
  supportedDocs: EdiDocCode[]
  active: boolean
  isDemoSeed: boolean
  gstin: string
  city: string
  state: string
  contactName: string
  contactEmail: string
  contactPhone: string
  slaAckHours: number
  notes: string
}

export interface TransactionRecord {
  id: string
  transactionId: string
  documentNumber: string
  documentType: EdiDocCode
  sender: string
  receiver: string
  transactionDate: string
  subtotal: number
  taxRatePct: number
  taxAmount: number
  amount: number
  status: TransactionStatus
  referencePo?: string
  ackStatus: AckStatus
  summary: string
  exceptionReason?: string
  reviewerNotes?: string
  lineItems: LineItem[]
  validationResults: ValidationCheckItem[]
  ediPayload: string
  timeline: ProcessingEvent[]
  acknowledgement?: AcknowledgementInfo
  supplierReceiptSimulated?: boolean
  isDemoSeed: boolean
}

export interface EdiMappingRule {
  id: string
  documentType: '850' | '810'
  sourceField: string
  sourcePath: string
  ediSegment: string
  ediElement: string
  ediDescription: string
  transformRule: string
  status: 'Mapped' | 'Conditional' | 'Custom'
  required: boolean
}

export interface AssistantMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
  engineLabel: string
  relatedTransactionIds?: string[]
}

export interface AppSettingsState {
  organizationName: string
  hubCode: string
  hubGstin: string
  adminEmail: string
  defaultTaxRatePct: number
  autoValidateOnSubmit: boolean
  ediStandardVersion: string
  segmentTerminator: string
  elementSeparator: string
  ollamaEndpoint: string
  ollamaModel: string
}

export interface VolumeTrendPoint {
  dateLabel: string
  total: number
  accepted: number
  exceptions: number
  valueLakhs: number
}

export interface DocDistributionItem {
  code: EdiDocCode
  label: string
  count: number
  sharePct: number
}

export interface PartnerActivityItem {
  partnerName: string
  role: string
  partnerCode: string
  sentCount: number
  receivedCount: number
  acceptedCount: number
  rejectedCount: number
  errorCount: number
  totalValue: number
  active: boolean
}

export interface NotificationItem {
  id: string
  title: string
  detail: string
  severity: 'warning' | 'danger' | 'info'
  timestamp: string
  targetPath: string
}

export interface AiBusinessInsight {
  id: string
  category: 'Exception' | 'Compliance' | 'Liquidity' | 'Partner SLA'
  severity: 'danger' | 'warning' | 'success' | 'info'
  title: string
  detail: string
  actionLabel: string
  targetPath: string
}
