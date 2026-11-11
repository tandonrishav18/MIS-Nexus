import type {
  AiBusinessInsight,
  AppSettingsState,
  DocDistributionItem,
  EdiMappingRule,
  LineItem,
  PartnerActivityItem,
  TradingPartnerSummary,
  TransactionRecord,
  VolumeTrendPoint,
} from '@/types/edi'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function apiRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const isFormData = typeof FormData !== 'undefined' && init?.body instanceof FormData
  let response: Response
  try {
    response = await fetch(path, {
      headers: {
        ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
        ...(init?.headers ?? {}),
      },
      ...init,
    })
  } catch {
    throw new ApiError(
      0,
      'Cannot reach EDI Nexus API server (/api). Ensure FastAPI backend is running on port 8000.'
    )
  }

  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const data = (await response.json()) as { detail?: string }
      if (data?.detail) detail = data.detail
    } catch {
      // ignore non-JSON body
    }
    throw new ApiError(response.status, detail)
  }

  if (response.status === 204) {
    return undefined as T
  }
  return (await response.json()) as T
}

export interface DashboardSummaryResponse {
  totalTransactions: number
  acceptedDocuments: number
  pendingTransactions: number
  rejectedDocuments: number
  totalVolumeAmount: number
  acceptanceRate: number
  pendingAlerts: TransactionRecord[]
  insights: AiBusinessInsight[]
  partnerActivity: PartnerActivityItem[]
}

export interface PaginatedTransactionsResponse {
  items: TransactionRecord[]
  total: number
  page: number
  pageSize: number
  totalPages: number
}

export interface CreateDocumentPayload {
  documentType: '850' | '810'
  documentNumber: string
  documentDate: string
  sender: string
  receiver: string
  referencePo?: string
  taxRatePct: number
  summary: string
  lineItems: Array<{
    sku: string
    description: string
    quantity: number
    unitPrice: number
  }>
  mode: 'draft' | 'submit'
}

export interface ReportsSummaryResponse {
  totalTransactions: number
  acceptedDocuments: number
  pendingTransactions: number
  rejectedDocuments: number
  totalVolumeAmount: number
  acceptanceRate: number
  volumeTrend: VolumeTrendPoint[]
  docDistribution: DocDistributionItem[]
}

export interface AssistantQueryResponse {
  reply: string
  engineLabel: string
  relatedTransactionIds: string[]
  ollamaUsed?: boolean
}

export type HonestServiceStatus =
  | 'Connected'
  | 'Not Installed'
  | 'Not Running'
  | 'Model Not Downloaded'
  | 'Unavailable'

export interface AiCapabilitiesResponse {
  ollama: {
    installationStatus: 'Installed' | 'Not Installed'
    serviceStatus: 'Connected' | 'Not Running' | 'Unavailable'
    modelStatus: 'Connected' | 'Model Not Downloaded' | 'Unavailable'
    overallStatus: HonestServiceStatus
    endpoint: string
    selectedModel: string
    installedModels: string[]
    binaryPath: string | null
    error: string | null
  }
  ocr: {
    installationStatus: 'Connected' | 'Not Installed'
    ocrAvailability: 'Connected' | 'Unavailable'
    available: boolean
    binaryPath: string | null
    message: string
  }
}

export interface DocumentAiExplainResponse {
  explanation: string
  recommendation: string
  engineLabel: string
  ollamaUsed: boolean
  invoiceTotal: string | null
  purchaseOrderTotal: string | null
  difference: string | null
}

export interface StructuredExtractionData {
  document_type: '850' | '855' | '810' | '856' | 'UNKNOWN'
  document_number: string | null
  document_date: string | null
  buyer: string | null
  supplier: string | null
  reference_po: string | null
  line_items: Array<{
    sku: string | null
    description: string | null
    quantity: number | null
    unit_price: number | null
  }>
  subtotal: number | null
  tax_amount: number | null
  grand_total: number | null
  uncertain_fields: string[]
  warnings: string[]
  extraction_source: string
}

export interface DocumentUploadExtractResponse {
  filename: string
  fileExtension: string
  fileSizeBytes: number
  pageCount: number
  extractionMethod: string
  ocrUsed: boolean
  ocrAvailable: boolean
  extractedText: string
  warning: string | null
  structured: StructuredExtractionData
}

function buildQuery(params: Record<string, string | number | undefined>): string {
  const qs = new URLSearchParams()
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') qs.set(k, String(v))
  })
  const str = qs.toString()
  return str ? `?${str}` : ''
}

export const ediApi = {
  health: () => apiRequest<{ status: string; database: string }>('/api/health'),

  // Dashboard
  getDashboardSummary: (partner?: string, q?: string) =>
    apiRequest<DashboardSummaryResponse>(
      `/api/dashboard/summary${buildQuery({ partner, q })}`
    ),
  getDashboardTrends: (partner?: string, q?: string) =>
    apiRequest<VolumeTrendPoint[]>(
      `/api/dashboard/trends${buildQuery({ partner, q })}`
    ),
  getDocumentDistribution: (partner?: string, q?: string) =>
    apiRequest<DocDistributionItem[]>(
      `/api/dashboard/document-distribution${buildQuery({ partner, q })}`
    ),

  // Transactions & Documents
  listTransactions: (params?: {
    search?: string
    status?: string
    doc_type?: string
    partner?: string
    sort_by?: string
    sort_dir?: string
    page?: number
    page_size?: number
  }) =>
    apiRequest<PaginatedTransactionsResponse>(
      `/api/transactions${buildQuery(params ?? {})}`
    ),
  getTransaction: (id: string) =>
    apiRequest<TransactionRecord>(`/api/transactions/${encodeURIComponent(id)}`),
  createDocument: (payload: CreateDocumentPayload) =>
    apiRequest<TransactionRecord>('/api/documents', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  updateTransactionFigures: (
    id: string,
    payload: {
      lineItems: LineItem[]
      taxRatePct: number
      reviewerNotes: string
    }
  ) =>
    apiRequest<TransactionRecord>(`/api/transactions/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({
        lineItems: payload.lineItems.map((l) => ({
          sku: l.sku,
          description: l.description,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
        })),
        taxRatePct: payload.taxRatePct,
        reviewerNotes: payload.reviewerNotes,
      }),
    }),
  validateDocument: (id: string) =>
    apiRequest<TransactionRecord>(
      `/api/documents/${encodeURIComponent(id)}/validate`,
      { method: 'POST' }
    ),
  generateEdi: (id: string) =>
    apiRequest<TransactionRecord>(
      `/api/documents/${encodeURIComponent(id)}/generate-edi`,
      { method: 'POST' }
    ),
  simulateReceipt: (id: string) =>
    apiRequest<TransactionRecord>(
      `/api/documents/${encodeURIComponent(id)}/simulate-receipt`,
      { method: 'POST' }
    ),
  simulateAck855: (id: string) =>
    apiRequest<{ po: TransactionRecord; ack: TransactionRecord }>(
      `/api/documents/${encodeURIComponent(id)}/simulate-ack`,
      { method: 'POST' }
    ),
  approveDocument: (id: string, note?: string) =>
    apiRequest<TransactionRecord>(
      `/api/documents/${encodeURIComponent(id)}/approve`,
      { method: 'POST', body: JSON.stringify({ note }) }
    ),
  rejectDocument: (id: string, reason: string) =>
    apiRequest<TransactionRecord>(
      `/api/documents/${encodeURIComponent(id)}/reject`,
      { method: 'POST', body: JSON.stringify({ reason }) }
    ),
  reprocessDocument: (id: string) =>
    apiRequest<{ passed: boolean; transaction: TransactionRecord }>(
      `/api/documents/${encodeURIComponent(id)}/reprocess`,
      { method: 'POST' }
    ),

  // Partners
  listPartners: () => apiRequest<TradingPartnerSummary[]>('/api/partners'),
  createPartner: (
    partner: Omit<TradingPartnerSummary, 'id' | 'isDemoSeed'>
  ) =>
    apiRequest<TradingPartnerSummary>('/api/partners', {
      method: 'POST',
      body: JSON.stringify(partner),
    }),
  updatePartner: (id: string, body: { active?: boolean }) =>
    apiRequest<TradingPartnerSummary>(`/api/partners/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  // Mappings
  listMappings: () => apiRequest<EdiMappingRule[]>('/api/mappings'),
  createMapping: (rule: Omit<EdiMappingRule, 'id'>) =>
    apiRequest<EdiMappingRule>('/api/mappings', {
      method: 'POST',
      body: JSON.stringify(rule),
    }),
  updateMapping: (id: string, rule: Partial<EdiMappingRule>) =>
    apiRequest<EdiMappingRule>(`/api/mappings/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify(rule),
    }),
  deleteMapping: (id: string) =>
    apiRequest<void>(`/api/mappings/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // Reports
  getReportsSummary: (from_date?: string, to_date?: string) =>
    apiRequest<ReportsSummaryResponse>(
      `/api/reports/summary${buildQuery({ from_date, to_date })}`
    ),
  getReportsPartners: (from_date?: string, to_date?: string) =>
    apiRequest<PartnerActivityItem[]>(
      `/api/reports/partners${buildQuery({ from_date, to_date })}`
    ),
  getReportsExceptions: (from_date?: string, to_date?: string) =>
    apiRequest<TransactionRecord[]>(
      `/api/reports/exceptions${buildQuery({ from_date, to_date })}`
    ),
  getReportsExportUrl: (params: Record<string, string | undefined>) =>
    `/api/reports/export${buildQuery(params)}`,

  // Assistant & Local AI / OCR
  getAiHealth: () => apiRequest<AiCapabilitiesResponse>('/api/ai/health'),
  testAiConnection: (endpoint?: string, model?: string) =>
    apiRequest<AiCapabilitiesResponse>('/api/ai/test-connection', {
      method: 'POST',
      body: JSON.stringify({ endpoint, model }),
    }),
  queryAssistant: (question: string) =>
    apiRequest<AssistantQueryResponse>('/api/assistant/query', {
      method: 'POST',
      body: JSON.stringify({ question }),
    }),
  explainDocumentAi: (id: string) =>
    apiRequest<DocumentAiExplainResponse>(
      `/api/documents/${encodeURIComponent(id)}/ai-explain`,
      { method: 'POST' }
    ),
  uploadDocumentExtract: (file: File, useAi: boolean = true) => {
    const fd = new FormData()
    fd.append('file', file)
    return apiRequest<DocumentUploadExtractResponse>(
      `/api/documents/upload?use_ai=${useAi ? 'true' : 'false'}`,
      { method: 'POST', body: fd }
    )
  },
  extractStructuredText: (extractedText: string, useAi: boolean = true) =>
    apiRequest<StructuredExtractionData>('/api/documents/extract-structured', {
      method: 'POST',
      body: JSON.stringify({ extractedText, useAi }),
    }),

  // Settings
  getSettings: () => apiRequest<AppSettingsState>('/api/settings'),
  updateSettings: (next: AppSettingsState) =>
    apiRequest<AppSettingsState>('/api/settings', {
      method: 'PATCH',
      body: JSON.stringify(next),
    }),
  resetDemo: () =>
    apiRequest<{ status: string; message: string }>('/api/settings/reset-demo', {
      method: 'POST',
    }),
}

