import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BotMessageSquare,
  Database,
  Info,
  RotateCcw,
  Send,
  Sparkles,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
import { useToast } from '@/components/shared/ToastProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useEdiStore } from '@/context/EdiStoreContext'
import { deriveDashboardMetrics } from '@/data/demoDashboardData'
import { ediApi, type AiCapabilitiesResponse } from '@/lib/api'
import { SUGGESTED_ASSISTANT_QUESTIONS } from '@/lib/assistantEngine'
import { formatDateTime } from '@/lib/format'
import { cn } from '@/lib/utils'

export function AiAssistantPage() {
  const navigate = useNavigate()
  const {
    transactions,
    partners,
    assistantMessages,
    backendConnected,
    sendAssistantQuestion,
    clearAssistantHistory,
  } = useEdiStore()
  const [promptInput, setPromptInput] = useState('')
  const [querying, setQuerying] = useState(false)
  const [aiCaps, setAiCaps] = useState<AiCapabilitiesResponse | null>(null)
  const { pushToast } = useToast()

  useEffect(() => {
    if (!backendConnected) return
    ediApi
      .getAiHealth()
      .then(setAiCaps)
      .catch(() => setAiCaps(null))
  }, [backendConnected])

  const metrics = deriveDashboardMetrics(transactions)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!promptInput.trim() || querying) return
    const q = promptInput
    setPromptInput('')
    setQuerying(true)
    try {
      await sendAssistantQuestion(q)
    } catch (err) {
      pushToast({
        tone: 'danger',
        title: 'Assistant Query Failed',
        description: err instanceof Error ? err.message : 'Unable to reach assistant endpoint.',
      })
    } finally {
      setQuerying(false)
    }
  }

  const handleSuggested = async (q: string) => {
    if (querying) return
    setQuerying(true)
    try {
      await sendAssistantQuestion(q)
    } catch (err) {
      pushToast({
        tone: 'danger',
        title: 'Assistant Query Failed',
        description: err instanceof Error ? err.message : 'Unable to reach assistant endpoint.',
      })
    } finally {
      setQuerying(false)
    }
  }

  const ollamaStatus = aiCaps?.ollama.overallStatus ?? 'Unavailable'
  const ollamaConnected = ollamaStatus === 'Connected'

  return (
    <div className="space-y-5">
      <PageHeader
        title="AI Assistant"
        description="Operational query workspace inspecting live SQLite transaction, exception, and partner metrics."
        badge={
          <Badge variant={ollamaConnected ? 'success' : 'warning'}>
            {ollamaConnected
              ? `Ollama Connected · ${aiCaps?.ollama.selectedModel}`
              : `Ollama: ${ollamaStatus} · Deterministic SQLite Fallback`}
          </Badge>
        }
        actions={
          <Button variant="outline" size="sm" onClick={clearAssistantHistory}>
            <RotateCcw className="h-3.5 w-3.5" />
            Clear Conversation
          </Button>
        }
      />

      {/* Explicit Transparency Notice */}
      <div className="flex items-start gap-2.5 rounded-card border border-[#F1DBA8] bg-[#FDF7EB] px-4 py-3 text-[12.5px] text-[#172B4D]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#D69A35]" />
        <p>
          {ollamaConnected ? (
            <>
              <strong>Local Ollama Inference Active ({aiCaps?.ollama.selectedModel}):</strong> Answers are grounded strictly in live SQLite records. The model cannot modify database amounts or override deterministic Python validation.
            </>
          ) : (
            <>
              <strong>Deterministic SQLite Fallback Active (Ollama: {ollamaStatus}):</strong> Local Ollama is currently {ollamaStatus.toLowerCase()}. Queries are answered deterministically from live SQLite records with zero external API calls.
            </>
          )}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Main Chat Area */}
        <Card className="flex min-h-[540px] flex-col lg:col-span-8">
          <CardHeader>
            <div>
              <CardTitle className="flex items-center gap-2">
                <BotMessageSquare className="h-4 w-4 text-[#1E4E8C]" />
                MIS Query Console
              </CardTitle>
              <CardDescription>
                Ask about pending orders, rejected invoices, partner error counts, or specific TXN IDs
              </CardDescription>
            </div>
            <Badge variant="neutral">Live SQLite Context</Badge>
          </CardHeader>

          {/* Messages */}
          <div className="flex-1 space-y-4 overflow-y-auto p-5">
            {assistantMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  'flex flex-col gap-1.5',
                  msg.role === 'user' ? 'items-end' : 'items-start'
                )}
              >
                <div className="flex items-center gap-2 text-[11px] text-[#6B778C]">
                  <span className="font-semibold text-[#172B4D]">
                    {msg.role === 'user' ? 'Operator' : 'EDI Nexus Assistant'}
                  </span>
                  <span>·</span>
                  <span>{msg.engineLabel}</span>
                  <span>·</span>
                  <span className="tabular-nums">{formatDateTime(msg.timestamp)}</span>
                </div>

                <div
                  className={cn(
                    'max-w-[92%] rounded-card border px-4 py-3 text-[13px] leading-relaxed whitespace-pre-line',
                    msg.role === 'user'
                      ? 'border-[#172B4D] bg-[#172B4D] text-white'
                      : 'border-[#E2E7EE] bg-[#F9FAFB] text-[#172B4D]'
                  )}
                >
                  {msg.content}

                  {msg.relatedTransactionIds && msg.relatedTransactionIds.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-1.5 border-t border-[#E2E7EE] pt-2.5">
                      {msg.relatedTransactionIds.map((txnId) => (
                        <button
                          key={txnId}
                          type="button"
                          onClick={() => navigate(`/processing/${txnId}`)}
                          className="rounded-badge border border-[#C5D7EE] bg-white px-2 py-0.5 font-mono text-[11.5px] font-medium text-[#1E4E8C] hover:bg-[#EFF4FB]"
                        >
                          Inspect {txnId} →
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
          </div>

          {/* Input Bar */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-[#EDF1F5] bg-white p-4"
          >
            <label htmlFor="assistant-input" className="sr-only">
              Ask a question about EDI transactions
            </label>
            <Input
              id="assistant-input"
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              placeholder="Ask e.g. 'Which documents require human review?' or 'TXN-2026-1014'..."
            />
            <Button type="submit" variant="primary" disabled={querying || !promptInput.trim()}>
              <Send className="h-4 w-4" />
              {querying ? 'Querying...' : 'Ask'}
            </Button>
          </form>
        </Card>

        {/* Right Context & Suggested Prompts */}
        <div className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-[#1E4E8C]" />
                  Suggested Questions
                </CardTitle>
                <CardDescription>Click any prompt to query live SQLite records</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2">
              {SUGGESTED_ASSISTANT_QUESTIONS.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={querying}
                  onClick={() => void handleSuggested(q)}
                  className="w-full rounded-control border border-[#E2E7EE] bg-white px-3 py-2.5 text-left text-[12.5px] font-medium text-[#172B4D] transition-colors hover:border-[#1E4E8C] hover:bg-[#F9FAFB]"
                >
                  {q}
                </button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-1.5">
                  <Database className="h-4 w-4 text-[#6B778C]" />
                  Active Context Snapshot
                </CardTitle>
                <CardDescription>Shared workspace telemetry read by queries</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-2.5 text-[12.5px]">
              <div className="flex justify-between">
                <span className="text-[#6B778C]">Indexed Transactions</span>
                <span className="font-mono font-semibold text-[#172B4D] tabular-nums">
                  {metrics.totalTransactions}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B778C]">Pending / In-Progress</span>
                <span className="font-mono font-semibold text-[#D69A35] tabular-nums">
                  {metrics.pendingTransactions}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B778C]">Rejected / Exceptions</span>
                <span className="font-mono font-semibold text-[#D9534F] tabular-nums">
                  {metrics.rejectedDocuments}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#6B778C]">Registered Partners</span>
                <span className="font-mono font-semibold text-[#172B4D] tabular-nums">
                  {partners.length}
                </span>
              </div>
              <div className="border-t border-[#EDF1F5] pt-2.5 text-[11.5px] text-[#6B778C]">
                Local Ollama Status:{' '}
                <span
                  className={cn(
                    'font-medium',
                    ollamaConnected ? 'text-[#168568]' : 'text-[#D69A35]'
                  )}
                >
                  {ollamaStatus}
                </span>
                <br />
                Fallback Layer:{' '}
                <span className="font-medium text-[#172B4D]">Deterministic SQLite Queries</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
