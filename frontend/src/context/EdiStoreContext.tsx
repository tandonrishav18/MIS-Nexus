import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { DEFAULT_APP_SETTINGS } from '@/data/demoDashboardData'
import { ediApi } from '@/lib/api'
import type {
  AppSettingsState,
  AssistantMessage,
  EdiMappingRule,
  LineItem,
  TradingPartnerSummary,
  TransactionRecord,
} from '@/types/edi'

const CHAT_PREF_KEY = 'edi_nexus_assistant_ui_history_v1'

export interface CreateDocumentInput {
  documentType: '850' | '810'
  documentNumber: string
  documentDate: string
  sender: string
  receiver: string
  referencePo?: string
  taxRatePct: number
  summary: string
  lineItems: LineItem[]
  mode: 'draft' | 'submit'
}

interface EdiStoreContextValue {
  transactions: TransactionRecord[]
  partners: TradingPartnerSummary[]
  mappingRules: EdiMappingRule[]
  settings: AppSettingsState
  assistantMessages: AssistantMessage[]
  isLoading: boolean
  isSyncing: boolean
  backendConnected: boolean
  backendError: string | null
  refreshAll: () => Promise<void>
  createDocument: (input: CreateDocumentInput) => Promise<TransactionRecord>
  validateTransaction: (transactionId: string) => Promise<void>
  generateEdiForTransaction: (transactionId: string) => Promise<void>
  simulateSupplierReceipt: (transactionId: string) => Promise<void>
  simulateAck855: (transactionId: string) => Promise<TransactionRecord | null>
  approveTransaction: (transactionId: string, note?: string) => Promise<void>
  rejectTransaction: (transactionId: string, reason: string) => Promise<void>
  correctTransactionLines: (
    transactionId: string,
    lineItems: LineItem[],
    taxRatePct: number,
    note: string
  ) => Promise<void>
  reprocessTransaction: (transactionId: string) => Promise<boolean>
  togglePartnerStatus: (partnerId: string) => Promise<void>
  addPartner: (partner: Omit<TradingPartnerSummary, 'id' | 'isDemoSeed'>) => Promise<void>
  addMappingRule: (rule: Omit<EdiMappingRule, 'id'>) => Promise<void>
  updateMappingRule: (rule: EdiMappingRule) => Promise<void>
  deleteMappingRule: (ruleId: string) => Promise<void>
  sendAssistantQuestion: (question: string) => Promise<void>
  clearAssistantHistory: () => void
  updateSettings: (next: AppSettingsState) => Promise<void>
  resetDemoData: () => Promise<void>
}

const INITIAL_ASSISTANT_MESSAGE: AssistantMessage = {
  id: 'msg-welcome',
  role: 'assistant',
  timestamp: new Date().toISOString(),
  engineLabel: 'SQLite & Local AI MIS Engine',
  content:
    'Connected to EDI Nexus SQLite database. Ask about pending acknowledgements, invoice discrepancies, partner error counts, or specific TXN IDs. Uses local Ollama Qwen inference when connected, with deterministic SQLite fallback when offline.',
}

function loadChatHistoryPref(): AssistantMessage[] {
  try {
    const raw = localStorage.getItem(CHAT_PREF_KEY)
    if (!raw) return [INITIAL_ASSISTANT_MESSAGE]
    const parsed = JSON.parse(raw) as AssistantMessage[]
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [INITIAL_ASSISTANT_MESSAGE]
  } catch {
    return [INITIAL_ASSISTANT_MESSAGE]
  }
}

const EdiStoreContext = createContext<EdiStoreContextValue | null>(null)

export function EdiStoreProvider({ children }: { children: ReactNode }) {
  const [transactions, setTransactions] = useState<TransactionRecord[]>([])
  const [partners, setPartners] = useState<TradingPartnerSummary[]>([])
  const [mappingRules, setMappingRules] = useState<EdiMappingRule[]>([])
  const [settings, setSettings] = useState<AppSettingsState>(DEFAULT_APP_SETTINGS)
  const [assistantMessages, setAssistantMessages] = useState<AssistantMessage[]>(() =>
    loadChatHistoryPref()
  )
  const [isLoading, setIsLoading] = useState<boolean>(true)
  const [isSyncing, setIsSyncing] = useState<boolean>(false)
  const [backendConnected, setBackendConnected] = useState<boolean>(false)
  const [backendError, setBackendError] = useState<string | null>(null)

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_PREF_KEY, JSON.stringify(assistantMessages))
    } catch {
      // Non-critical UI chat preference only
    }
  }, [assistantMessages])

  const refreshAll = useCallback(async () => {
    setIsSyncing(true)
    try {
      const [txnPage, partnerList, mappingList, appCfg] = await Promise.all([
        ediApi.listTransactions({ page: 1, page_size: 500 }),
        ediApi.listPartners(),
        ediApi.listMappings(),
        ediApi.getSettings(),
      ])
      setTransactions(txnPage.items)
      setPartners(partnerList)
      setMappingRules(mappingList)
      setSettings(appCfg)
      setBackendConnected(true)
      setBackendError(null)
    } catch (err) {
      setBackendConnected(false)
      setBackendError(
        err instanceof Error
          ? err.message
          : 'Failed to load data from EDI Nexus backend.'
      )
    } finally {
      setIsLoading(false)
      setIsSyncing(false)
    }
  }, [])

  useEffect(() => {
    void refreshAll()
  }, [refreshAll])

  const upsertTxn = useCallback((updated: TransactionRecord) => {
    setTransactions((prev) => {
      const exists = prev.some((t) => t.transactionId === updated.transactionId)
      if (!exists) return [updated, ...prev]
      return prev.map((t) =>
        t.transactionId === updated.transactionId ? updated : t
      )
    })
  }, [])

  const createDocument = useCallback(
    async (input: CreateDocumentInput): Promise<TransactionRecord> => {
      setIsSyncing(true)
      try {
        const created = await ediApi.createDocument({
          documentType: input.documentType,
          documentNumber: input.documentNumber,
          documentDate: input.documentDate,
          sender: input.sender,
          receiver: input.receiver,
          referencePo: input.referencePo,
          taxRatePct: input.taxRatePct,
          summary: input.summary,
          lineItems: input.lineItems.map((l) => ({
            sku: l.sku,
            description: l.description,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
          })),
          mode: input.mode,
        })
        upsertTxn(created)
        const partnerList = await ediApi.listPartners()
        setPartners(partnerList)
        setBackendConnected(true)
        setBackendError(null)
        return created
      } finally {
        setIsSyncing(false)
      }
    },
    [upsertTxn]
  )

  const validateTransaction = useCallback(
    async (transactionId: string) => {
      setIsSyncing(true)
      try {
        const updated = await ediApi.validateDocument(transactionId)
        upsertTxn(updated)
      } finally {
        setIsSyncing(false)
      }
    },
    [upsertTxn]
  )

  const generateEdiForTransaction = useCallback(
    async (transactionId: string) => {
      setIsSyncing(true)
      try {
        const updated = await ediApi.generateEdi(transactionId)
        upsertTxn(updated)
      } finally {
        setIsSyncing(false)
      }
    },
    [upsertTxn]
  )

  const simulateSupplierReceipt = useCallback(
    async (transactionId: string) => {
      setIsSyncing(true)
      try {
        const updated = await ediApi.simulateReceipt(transactionId)
        upsertTxn(updated)
      } finally {
        setIsSyncing(false)
      }
    },
    [upsertTxn]
  )

  const simulateAck855 = useCallback(
    async (transactionId: string): Promise<TransactionRecord | null> => {
      setIsSyncing(true)
      try {
        const { po, ack } = await ediApi.simulateAck855(transactionId)
        upsertTxn(po)
        upsertTxn(ack)
        const partnerList = await ediApi.listPartners()
        setPartners(partnerList)
        return ack
      } finally {
        setIsSyncing(false)
      }
    },
    [upsertTxn]
  )

  const approveTransaction = useCallback(
    async (transactionId: string, note?: string) => {
      setIsSyncing(true)
      try {
        const updated = await ediApi.approveDocument(transactionId, note)
        upsertTxn(updated)
        const partnerList = await ediApi.listPartners()
        setPartners(partnerList)
      } finally {
        setIsSyncing(false)
      }
    },
    [upsertTxn]
  )

  const rejectTransaction = useCallback(
    async (transactionId: string, reason: string) => {
      setIsSyncing(true)
      try {
        const updated = await ediApi.rejectDocument(transactionId, reason)
        upsertTxn(updated)
        const partnerList = await ediApi.listPartners()
        setPartners(partnerList)
      } finally {
        setIsSyncing(false)
      }
    },
    [upsertTxn]
  )

  const correctTransactionLines = useCallback(
    async (
      transactionId: string,
      lineItems: LineItem[],
      taxRatePct: number,
      note: string
    ) => {
      setIsSyncing(true)
      try {
        const updated = await ediApi.updateTransactionFigures(transactionId, {
          lineItems,
          taxRatePct,
          reviewerNotes: note,
        })
        upsertTxn(updated)
      } finally {
        setIsSyncing(false)
      }
    },
    [upsertTxn]
  )

  const reprocessTransaction = useCallback(
    async (transactionId: string): Promise<boolean> => {
      setIsSyncing(true)
      try {
        const { passed, transaction } = await ediApi.reprocessDocument(transactionId)
        upsertTxn(transaction)
        const partnerList = await ediApi.listPartners()
        setPartners(partnerList)
        return passed
      } finally {
        setIsSyncing(false)
      }
    },
    [upsertTxn]
  )

  const togglePartnerStatus = useCallback(async (partnerId: string) => {
    setIsSyncing(true)
    try {
      const target = partners.find((p) => p.id === partnerId)
      if (!target) return
      const updated = await ediApi.updatePartner(partnerId, {
        active: !target.active,
      })
      setPartners((prev) => prev.map((p) => (p.id === partnerId ? updated : p)))
    } finally {
      setIsSyncing(false)
    }
  }, [partners])

  const addPartner = useCallback(
    async (partner: Omit<TradingPartnerSummary, 'id' | 'isDemoSeed'>) => {
      setIsSyncing(true)
      try {
        const created = await ediApi.createPartner(partner)
        setPartners((prev) => [...prev, created])
      } finally {
        setIsSyncing(false)
      }
    },
    []
  )

  const addMappingRule = useCallback(async (rule: Omit<EdiMappingRule, 'id'>) => {
    setIsSyncing(true)
    try {
      const created = await ediApi.createMapping(rule)
      setMappingRules((prev) => [...prev, created])
    } finally {
      setIsSyncing(false)
    }
  }, [])

  const updateMappingRule = useCallback(async (rule: EdiMappingRule) => {
    setIsSyncing(true)
    try {
      const updated = await ediApi.updateMapping(rule.id, rule)
      setMappingRules((prev) => prev.map((r) => (r.id === rule.id ? updated : r)))
    } finally {
      setIsSyncing(false)
    }
  }, [])

  const deleteMappingRule = useCallback(async (ruleId: string) => {
    setIsSyncing(true)
    try {
      await ediApi.deleteMapping(ruleId)
      setMappingRules((prev) => prev.filter((r) => r.id !== ruleId))
    } finally {
      setIsSyncing(false)
    }
  }, [])

  const sendAssistantQuestion = useCallback(async (question: string) => {
    const trimmed = question.trim()
    if (!trimmed) return

    const userMsg: AssistantMessage = {
      id: `msg-u-${Date.now()}`,
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
      engineLabel: 'Operator Query',
    }
    setAssistantMessages((prev) => [...prev, userMsg])

    try {
      const res = await ediApi.queryAssistant(trimmed)
      const assistantMsg: AssistantMessage = {
        id: `msg-a-${Date.now() + 1}`,
        role: 'assistant',
        content: res.reply,
        timestamp: new Date().toISOString(),
        engineLabel: res.engineLabel,
        relatedTransactionIds: res.relatedTransactionIds,
      }
      setAssistantMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      const errMsg: AssistantMessage = {
        id: `msg-err-${Date.now() + 1}`,
        role: 'assistant',
        content:
          err instanceof Error
            ? `Database query failed: ${err.message}`
            : 'Unable to reach assistant endpoint.',
        timestamp: new Date().toISOString(),
        engineLabel: 'Connection Error',
      }
      setAssistantMessages((prev) => [...prev, errMsg])
    }
  }, [])

  const clearAssistantHistory = useCallback(() => {
    setAssistantMessages([INITIAL_ASSISTANT_MESSAGE])
  }, [])

  const updateSettings = useCallback(async (next: AppSettingsState) => {
    setIsSyncing(true)
    try {
      const updated = await ediApi.updateSettings(next)
      setSettings(updated)
    } finally {
      setIsSyncing(false)
    }
  }, [])

  const resetDemoData = useCallback(async () => {
    setIsSyncing(true)
    try {
      await ediApi.resetDemo()
      await refreshAll()
      setAssistantMessages([INITIAL_ASSISTANT_MESSAGE])
    } finally {
      setIsSyncing(false)
    }
  }, [refreshAll])

  return (
    <EdiStoreContext.Provider
      value={{
        transactions,
        partners,
        mappingRules,
        settings,
        assistantMessages,
        isLoading,
        isSyncing,
        backendConnected,
        backendError,
        refreshAll,
        createDocument,
        validateTransaction,
        generateEdiForTransaction,
        simulateSupplierReceipt,
        simulateAck855,
        approveTransaction,
        rejectTransaction,
        correctTransactionLines,
        reprocessTransaction,
        togglePartnerStatus,
        addPartner,
        addMappingRule,
        updateMappingRule,
        deleteMappingRule,
        sendAssistantQuestion,
        clearAssistantHistory,
        updateSettings,
        resetDemoData,
      }}
    >
      {children}
    </EdiStoreContext.Provider>
  )
}

export function useEdiStore(): EdiStoreContextValue {
  const ctx = useContext(EdiStoreContext)
  if (!ctx) {
    throw new Error('useEdiStore must be used within an EdiStoreProvider')
  }
  return ctx
}
