import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Code2,
  Copy,
  Download,
  Edit3,
  FileCheck2,
  FileScan,
  RefreshCw,
  Send,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Upload,
  XCircle,
} from 'lucide-react'
import { DocTypeBadge } from '@/components/shared/DocTypeBadge'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useToast } from '@/components/shared/ToastProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useEdiStore } from '@/context/EdiStoreContext'
import {
  ediApi,
  type DocumentAiExplainResponse,
  type DocumentUploadExtractResponse,
} from '@/lib/api'
import { DOC_TYPE_META, formatDateTime, formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { LineItem } from '@/types/edi'

export function DocumentProcessingPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const {
    transactions,
    partners,
    backendConnected,
    createDocument,
    validateTransaction,
    generateEdiForTransaction,
    simulateSupplierReceipt,
    simulateAck855,
    approveTransaction,
    rejectTransaction,
    correctTransactionLines,
    reprocessTransaction,
  } = useEdiStore()
  const { pushToast } = useToast()

  const activeTxn = useMemo(() => {
    if (id) {
      const found = transactions.find(
        (t) => t.transactionId.toLowerCase() === id.toLowerCase()
      )
      if (found) return found
    }
    return transactions[0]
  }, [id, transactions])

  // Modal state for Reject & Correction
  const [rejectModalOpen, setRejectModalOpen] = useState(false)
  const [rejectReason, setRejectReason] = useState('')
  const [correctModalOpen, setCorrectModalOpen] = useState(false)
  const [editLines, setEditLines] = useState<LineItem[]>([])
  const [editTaxRate, setEditTaxRate] = useState(0)
  const [correctionNote, setCorrectionNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [activeTab, setActiveTab] = useState('document')

  // Phase 4: AI Exception Explanation
  const [aiExplain, setAiExplain] = useState<DocumentAiExplainResponse | null>(null)
  const [explaining, setExplaining] = useState(false)

  // Phase 4: Local Document Upload & Human-Confirmed Extraction
  const [uploadRes, setUploadRes] = useState<DocumentUploadExtractResponse | null>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [revDocType, setRevDocType] = useState<'850' | '810'>('850')
  const [revDocNumber, setRevDocNumber] = useState('')
  const [revDocDate, setRevDocDate] = useState('2026-11-11')
  const [revBuyer, setRevBuyer] = useState('Metro Retail')
  const [revSupplier, setRevSupplier] = useState('ABC Components')
  const [revRefPo, setRevRefPo] = useState('')
  const [revSku, setRevSku] = useState('LPT-PRO-15')
  const [revDesc, setRevDesc] = useState('')
  const [revQty, setRevQty] = useState('1')
  const [revPrice, setRevPrice] = useState('45000')
  const [revTaxRate, setRevTaxRate] = useState('0')

  useEffect(() => {
    setAiExplain(null)
    if (!activeTxn || !backendConnected) return
    if (activeTxn.status === 'Rejected') {
      let cancelled = false
      setExplaining(true)
      ediApi
        .explainDocumentAi(activeTxn.transactionId)
        .then((res) => {
          if (!cancelled) setAiExplain(res)
        })
        .catch(() => {})
        .finally(() => {
          if (!cancelled) setExplaining(false)
        })
      return () => {
        cancelled = true
      }
    }
  }, [activeTxn?.transactionId, activeTxn?.status, backendConnected])

  const handleRunAiExplain = async () => {
    if (!activeTxn) return
    setExplaining(true)
    try {
      const res = await ediApi.explainDocumentAi(activeTxn.transactionId)
      setAiExplain(res)
    } catch (err) {
      pushToast({
        tone: 'danger',
        title: 'Explanation Failed',
        description: err instanceof Error ? err.message : 'Could not fetch exception explanation.',
      })
    } finally {
      setExplaining(false)
    }
  }

  const handleFileUpload = async (file: File | undefined) => {
    if (!file) return
    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!['pdf', 'png', 'jpg', 'jpeg'].includes(ext)) {
      setUploadError('Unsupported file format. Allowed formats: PDF, PNG, JPG, JPEG.')
      return
    }
    if (file.size > 10 * 1024 * 1024) {
      setUploadError('File exceeds 10 MB size limit.')
      return
    }

    setUploadError(null)
    setUploading(true)
    try {
      const res = await ediApi.uploadDocumentExtract(file, true)
      setUploadRes(res)
      const st = res.structured
      setRevDocType(st.document_type === '810' ? '810' : '850')
      setRevDocNumber(st.document_number ?? '')
      setRevDocDate(st.document_date ?? '2026-11-11')
      setRevBuyer(st.buyer && partners.some((p) => p.name === st.buyer) ? st.buyer : 'Metro Retail')
      setRevSupplier(
        st.supplier && partners.some((p) => p.name === st.supplier)
          ? st.supplier
          : 'ABC Components'
      )
      setRevRefPo(st.reference_po ?? '')
      const firstLine = st.line_items[0]
      setRevSku(firstLine?.sku ?? '')
      setRevDesc(firstLine?.description ?? '')
      setRevQty(firstLine?.quantity ? String(firstLine.quantity) : '')
      setRevPrice(firstLine?.unit_price ? String(firstLine.unit_price) : '')
      setRevTaxRate('0')
      pushToast({
        tone: res.warning ? 'warning' : 'success',
        title: 'Document Text & Fields Extracted',
        description: `Method: ${res.extractionMethod}. Review and confirm before saving.`,
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Document extraction failed.'
      setUploadError(msg)
      pushToast({ tone: 'danger', title: 'Upload Extraction Error', description: msg })
    } finally {
      setUploading(false)
    }
  }

  const handleConfirmSaveExtracted = async () => {
    const qty = Number(revQty)
    const price = Number(revPrice)
    if (!revDocNumber.trim() || !revSku.trim() || !revDesc.trim() || qty <= 0 || price <= 0) {
      pushToast({
        tone: 'danger',
        title: 'Incomplete Extracted Fields',
        description: 'Document number, SKU, description, positive quantity, and unit price are required.',
      })
      return
    }
    setBusy(true)
    try {
      const sender = revDocType === '850' ? revBuyer : revSupplier
      const receiver = revDocType === '850' ? revSupplier : revBuyer
      const created = await createDocument({
        documentType: revDocType,
        documentNumber: revDocNumber.trim(),
        documentDate: revDocDate || '2026-11-11',
        sender,
        receiver,
        referencePo: revDocType === '810' ? revRefPo.trim() || undefined : undefined,
        taxRatePct: Number(revTaxRate) || 0,
        summary: `Imported via ${uploadRes?.extractionMethod ?? 'Upload'}: ${revDesc.trim()}`,
        lineItems: [
          {
            id: `ext-${Date.now()}`,
            sku: revSku.trim(),
            description: revDesc.trim(),
            quantity: qty,
            unitPrice: price,
            lineTotal: Math.round(qty * price),
          },
        ],
        mode: 'submit',
      })
      pushToast({
        tone: created.status === 'Rejected' ? 'warning' : 'success',
        title: `Confirmed & Registered ${created.transactionId}`,
        description: `${created.documentNumber} persisted to SQLite ledger.`,
      })
      setUploadRes(null)
      setActiveTab('document')
      navigate(`/processing/${created.transactionId}`)
    } catch (err) {
      pushToast({
        tone: 'danger',
        title: 'Failed to Register Document',
        description: err instanceof Error ? err.message : 'Could not save document.',
      })
    } finally {
      setBusy(false)
    }
  }

  if (!activeTxn) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Document Processing"
          description="No transactions are currently available in the workspace."
        />
      </div>
    )
  }

  const senderPartner = partners.find((p) => p.name === activeTxn.sender)
  const receiverPartner = partners.find((p) => p.name === activeTxn.receiver)

  const referencedPo = activeTxn.referencePo
    ? transactions.find(
        (t) =>
          t.documentType === '850' &&
          t.documentNumber.toUpperCase() === activeTxn.referencePo?.toUpperCase()
      )
    : undefined

  const invoiceVariance =
    activeTxn.documentType === '810' && referencedPo
      ? activeTxn.amount - referencedPo.amount
      : null

  const openCorrectionModal = () => {
    setEditLines(activeTxn.lineItems.map((item) => ({ ...item })))
    setEditTaxRate(activeTxn.taxRatePct)
    setCorrectionNote(
      referencedPo && invoiceVariance && invoiceVariance !== 0
        ? `Aligned unit pricing to ${referencedPo.documentNumber} (${formatINR(referencedPo.amount)}) after supplier credit confirmation.`
        : 'Operator line-item review & adjustment.'
    )
    setCorrectModalOpen(true)
  }

  const handleSaveCorrection = async (andReprocess: boolean) => {
    const cleaned: LineItem[] = editLines.map((l) => {
      const qty = Math.max(1, Number(l.quantity) || 1)
      const price = Math.max(1, Number(l.unitPrice) || 1)
      return {
        ...l,
        quantity: qty,
        unitPrice: price,
        lineTotal: Math.round(qty * price),
      }
    })

    setBusy(true)
    try {
      await correctTransactionLines(activeTxn.transactionId, cleaned, editTaxRate, correctionNote)

      if (andReprocess) {
        const passed = await reprocessTransaction(activeTxn.transactionId)
        pushToast({
          tone: passed ? 'success' : 'warning',
          title: passed ? 'Corrected & Reprocessed' : 'Corrected — Validation Exception Remains',
          description: passed
            ? `${activeTxn.documentNumber} passed deterministic validation and is now Accepted.`
            : 'Updated figures still triggered a validation exception.',
        })
      } else {
        pushToast({
          tone: 'info',
          title: 'Document Figures Updated',
          description: 'Click Reprocess to re-run deterministic validation.',
        })
      }
      setCorrectModalOpen(false)
    } catch (err) {
      pushToast({
        tone: 'danger',
        title: 'Correction Failed',
        description: err instanceof Error ? err.message : 'Unable to save corrected figures.',
      })
    } finally {
      setBusy(false)
    }
  }

  const handleCopyEdi = async () => {
    try {
      await navigator.clipboard.writeText(activeTxn.ediPayload)
      pushToast({
        tone: 'success',
        title: 'ANSI X12 Payload Copied',
        description: `${activeTxn.documentNumber} X12 segments copied to clipboard.`,
      })
    } catch {
      pushToast({
        tone: 'warning',
        title: 'Clipboard Unavailable',
        description: 'Use Download .EDI to save the generated X12 file.',
      })
    }
  }

  const handleDownloadEdi = () => {
    const blob = new Blob([activeTxn.ediPayload], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${activeTxn.transactionId}-${activeTxn.documentType}.edi`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const handleSimulate855 = async () => {
    setBusy(true)
    try {
      const ackTxn = await simulateAck855(activeTxn.transactionId)
      if (ackTxn) {
        pushToast({
          tone: 'success',
          title: `EDI 855 Received (${ackTxn.documentNumber})`,
          description: `${activeTxn.documentNumber} status updated to Accepted across SQLite & dashboard.`,
        })
      }
    } catch (err) {
      pushToast({
        tone: 'danger',
        title: 'Acknowledgement Simulation Failed',
        description: err instanceof Error ? err.message : 'Unable to simulate 855 ack.',
      })
    } finally {
      setBusy(false)
    }
  }

  const passCount = activeTxn.validationResults.filter((v) => v.status === 'pass').length
  const failCount = activeTxn.validationResults.filter((v) => v.status === 'fail').length

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Document Processing · ${activeTxn.transactionId}`}
        description={`${DOC_TYPE_META[activeTxn.documentType].label} (${activeTxn.documentNumber}) between ${activeTxn.sender} and ${activeTxn.receiver}`}
        badge={<StatusBadge status={activeTxn.status} />}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="txn-switcher" className="sr-only">
              Select transaction
            </label>
            <select
              id="txn-switcher"
              value={activeTxn.transactionId}
              onChange={(e) => navigate(`/processing/${e.target.value}`)}
              className="h-8 max-w-[260px] rounded-control border border-[#E2E7EE] bg-white px-2.5 font-mono text-[12px] text-[#172B4D] focus:border-[#1E4E8C] focus:outline-none"
            >
              {transactions.map((t) => (
                <option key={t.id} value={t.transactionId}>
                  {t.transactionId} · {t.documentNumber} ({t.status})
                </option>
              ))}
            </select>
          </div>
        }
      />

      {/* Action Control Strip */}
      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await validateTransaction(activeTxn.transactionId)
                  pushToast({
                    tone: 'info',
                    title: 'Deterministic Validation Executed',
                    description: 'Rule checks refreshed against SQLite ledger and partners.',
                  })
                } catch (err) {
                  pushToast({
                    tone: 'danger',
                    title: 'Validation Failed',
                    description: err instanceof Error ? err.message : 'Unable to validate transaction.',
                  })
                } finally {
                  setBusy(false)
                }
              }}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              Validate Document
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await generateEdiForTransaction(activeTxn.transactionId)
                  pushToast({
                    tone: 'info',
                    title: `ANSI X12 ${activeTxn.documentType} Generated`,
                    description: 'Interchange segments regenerated from SQLite document data.',
                  })
                } catch (err) {
                  pushToast({
                    tone: 'danger',
                    title: 'EDI Generation Failed',
                    description: err instanceof Error ? err.message : 'Unable to generate EDI.',
                  })
                } finally {
                  setBusy(false)
                }
              }}
            >
              <Code2 className="h-3.5 w-3.5" />
              Generate EDI
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={busy || activeTxn.status === 'Accepted'}
              onClick={openCorrectionModal}
            >
              <Edit3 className="h-3.5 w-3.5" />
              Correct Figures
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => setActiveTab('upload')}
            >
              <Upload className="h-3.5 w-3.5" />
              Upload PDF / Image
            </Button>

            <Button
              variant="outline"
              size="sm"
              disabled={busy || activeTxn.status === 'Accepted'}
              onClick={async () => {
                setBusy(true)
                try {
                  const ok = await reprocessTransaction(activeTxn.transactionId)
                  pushToast({
                    tone: ok ? 'success' : 'danger',
                    title: ok ? 'Reprocessing Succeeded' : 'Reprocessing Failed',
                    description: ok
                      ? `${activeTxn.documentNumber} passed validation.`
                      : 'Validation exception still active; inspect checks below.',
                  })
                } catch (err) {
                  pushToast({
                    tone: 'danger',
                    title: 'Reprocess Failed',
                    description: err instanceof Error ? err.message : 'Unable to reprocess transaction.',
                  })
                } finally {
                  setBusy(false)
                }
              }}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reprocess
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() => {
                setRejectReason(activeTxn.exceptionReason ?? '')
                setRejectModalOpen(true)
              }}
            >
              <XCircle className="h-3.5 w-3.5" />
              Reject
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy || activeTxn.status === 'Accepted' || activeTxn.status === 'Draft'}
              onClick={async () => {
                setBusy(true)
                try {
                  await approveTransaction(activeTxn.transactionId)
                  pushToast({
                    tone: 'success',
                    title: 'Transaction Approved',
                    description: `${activeTxn.transactionId} marked as Accepted in SQLite.`,
                  })
                } catch (err) {
                  pushToast({
                    tone: 'danger',
                    title: 'Approval Blocked',
                    description: err instanceof Error ? err.message : 'Unable to approve transaction.',
                  })
                } finally {
                  setBusy(false)
                }
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              Approve
            </Button>
          </div>
        </div>
      </Card>

      {/* Scenario 2: PO vs Invoice Discrepancy Banner (Deterministic) */}
      {activeTxn.documentType === '810' && referencedPo && invoiceVariance !== null && invoiceVariance !== 0 ? (
        <Card className="border-[#F3C2C0] bg-[#FDF1F1]/70 p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-[#D9534F]" />
                <span className="text-[13.5px] font-semibold text-[#172B4D]">
                  Two-Way Purchase Order Match Exception Detected
                </span>
                <Badge variant="danger">
                  Variance: {invoiceVariance > 0 ? '+' : '-'}
                  {formatINR(Math.abs(invoiceVariance))}
                </Badge>
              </div>
              <p className="text-[12.5px] text-[#42526E]">
                Supplier invoice <span className="font-mono font-semibold">{activeTxn.documentNumber}</span> totals{' '}
                <span className="font-mono font-semibold text-[#D9534F]">{formatINR(activeTxn.amount)}</span>, while
                referenced purchase order <span className="font-mono font-semibold">{referencedPo.documentNumber}</span>{' '}
                authorizes <span className="font-mono font-semibold text-[#168568]">{formatINR(referencedPo.amount)}</span>.
                {activeTxn.lineItems[0] && referencedPo.lineItems[0]
                  ? ` Line unit rate billed at ${formatINR(activeTxn.lineItems[0].unitPrice)}/unit vs PO contracted rate ${formatINR(referencedPo.lineItems[0].unitPrice)}/unit across ${activeTxn.lineItems[0].quantity} units.`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" disabled={explaining} onClick={() => void handleRunAiExplain()}>
                <Sparkles className="h-3.5 w-3.5" />
                {explaining ? 'Analyzing...' : 'Explain with AI'}
              </Button>
              <Button variant="outline" size="sm" onClick={openCorrectionModal}>
                <Edit3 className="h-3.5 w-3.5" />
                Correct Invoice Amount
              </Button>
            </div>
          </div>

          {aiExplain ? (
            <div className="mt-3 rounded-control border border-[#E2E7EE] bg-white p-3.5 text-[12.5px]">
              <div className="mb-1.5 flex flex-wrap items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-semibold text-[#172B4D]">
                  <Sparkles className="h-3.5 w-3.5 text-[#1E4E8C]" />
                  AI Exception Analysis & Recommendation
                </span>
                <Badge variant={aiExplain.ollamaUsed ? 'success' : 'neutral'}>
                  {aiExplain.engineLabel}
                </Badge>
              </div>
              <p className="text-[#172B4D]">{aiExplain.explanation}</p>
              <p className="mt-1.5 font-medium text-[#1E4E8C]">{aiExplain.recommendation}</p>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* Top 4 Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="p-4">
          <span className="block text-[11.5px] font-medium text-[#6B778C]">Document & Type</span>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="font-mono text-[15px] font-semibold text-[#172B4D]">
              {activeTxn.documentNumber}
            </span>
            <DocTypeBadge code={activeTxn.documentType} />
          </div>
          <span className="mt-1 block text-[12px] text-[#6B778C]">
            {formatDateTime(activeTxn.transactionDate)}
          </span>
        </Card>

        <Card className="p-4">
          <span className="block text-[11.5px] font-medium text-[#6B778C]">Interchange Route</span>
          <p className="mt-1.5 text-[14px] font-semibold text-[#172B4D]">
            {activeTxn.sender} → {activeTxn.receiver}
          </p>
          <span className="mt-1 block font-mono text-[11.5px] text-[#6B778C]">
            {senderPartner?.isaId ?? 'SENDER'} → {receiverPartner?.isaId ?? 'RECEIVER'}
          </span>
        </Card>

        <Card className="p-4">
          <span className="block text-[11.5px] font-medium text-[#6B778C]">Document Value</span>
          <p className="mt-1.5 font-mono text-[20px] font-semibold text-[#172B4D] tabular-nums">
            {formatINR(activeTxn.amount)}
          </p>
          <span className="mt-1 block text-[12px] text-[#6B778C] tabular-nums">
            Subtotal {formatINR(activeTxn.subtotal)} · Tax {formatINR(activeTxn.taxAmount)}
          </span>
        </Card>

        <Card className="p-4">
          <span className="block text-[11.5px] font-medium text-[#6B778C]">
            Validation & Ack Status
          </span>
          <div className="mt-1.5 flex items-center gap-2">
            <StatusBadge status={activeTxn.status} />
            <Badge variant={failCount > 0 ? 'danger' : 'neutral'}>
              {passCount}/{activeTxn.validationResults.length || 0} checks
            </Badge>
          </div>
          <span className="mt-1 block text-[12px] text-[#6B778C]">
            Ack: {activeTxn.ackStatus}
            {activeTxn.referencePo ? ` · Ref ${activeTxn.referencePo}` : ''}
          </span>
        </Card>
      </div>

      {/* Main Processing Workspace */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">
        {/* Left 8 Cols: Document, Extracted Fields, Validation, X12 Preview */}
        <div className="min-w-0 space-y-5 xl:col-span-8">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start overflow-x-auto">
              <TabsTrigger value="document">Original Document & Comparison</TabsTrigger>
              <TabsTrigger value="extracted">Extracted Fields</TabsTrigger>
              <TabsTrigger value="validation">
                Validation Results ({passCount} Pass / {failCount} Fail)
              </TabsTrigger>
              <TabsTrigger value="edi">ANSI X12 Preview</TabsTrigger>
              <TabsTrigger value="upload">Upload & Extract (PDF/OCR)</TabsTrigger>
            </TabsList>

            {/* Tab 1: Original Document */}
            <TabsContent value="document" className="space-y-4">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Original Document Payload & Line Items</CardTitle>
                    <CardDescription>{activeTxn.summary}</CardDescription>
                  </div>
                </CardHeader>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>SKU</TableHead>
                      <TableHead>Item Description</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {activeTxn.lineItems.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-mono text-[12px] font-semibold text-[#172B4D]">
                          {item.sku}
                        </TableCell>
                        <TableCell>{item.description}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {item.quantity}
                        </TableCell>
                        <TableCell className="text-right font-mono tabular-nums">
                          {formatINR(item.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right font-mono font-semibold text-[#172B4D] tabular-nums">
                          {formatINR(item.lineTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <div className="flex flex-wrap justify-end gap-6 border-t border-[#EDF1F5] bg-[#F9FAFB] px-5 py-3 text-[12.5px]">
                  <span className="text-[#6B778C]">
                    Subtotal:{' '}
                    <strong className="font-mono text-[#172B4D]">
                      {formatINR(activeTxn.subtotal)}
                    </strong>
                  </span>
                  <span className="text-[#6B778C]">
                    Tax ({activeTxn.taxRatePct}%):{' '}
                    <strong className="font-mono text-[#172B4D]">
                      {formatINR(activeTxn.taxAmount)}
                    </strong>
                  </span>
                  <span className="text-[#172B4D]">
                    Document Total:{' '}
                    <strong className="font-mono text-[14px]">
                      {formatINR(activeTxn.amount)}
                    </strong>
                  </span>
                </div>
              </Card>

              {referencedPo ? (
                <Card>
                  <CardHeader>
                    <div>
                      <CardTitle>Purchase Order Reconciliation ({referencedPo.documentNumber})</CardTitle>
                      <CardDescription>
                        Side-by-side comparison against buyer purchase order {referencedPo.transactionId}
                      </CardDescription>
                    </div>
                    <Badge variant={invoiceVariance === 0 ? 'success' : 'danger'}>
                      {invoiceVariance === 0
                        ? 'Exact Match'
                        : `Discrepancy ${invoiceVariance && invoiceVariance > 0 ? '+' : '-'}${formatINR(
                            Math.abs(invoiceVariance ?? 0)
                          )}`}
                    </Badge>
                  </CardHeader>
                  <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div className="rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-3">
                      <span className="block text-[11px] text-[#6B778C]">PO Contracted Total</span>
                      <span className="mt-1 block font-mono text-[16px] font-semibold text-[#172B4D] tabular-nums">
                        {formatINR(referencedPo.amount)}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-[#6B778C]">
                        {referencedPo.lineItems[0]?.quantity ?? 0} units @{' '}
                        {formatINR(referencedPo.lineItems[0]?.unitPrice ?? 0)}
                      </span>
                    </div>
                    <div className="rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-3">
                      <span className="block text-[11px] text-[#6B778C]">Submitted Invoice Total</span>
                      <span
                        className={cn(
                          'mt-1 block font-mono text-[16px] font-semibold tabular-nums',
                          invoiceVariance === 0 ? 'text-[#168568]' : 'text-[#D9534F]'
                        )}
                      >
                        {formatINR(activeTxn.amount)}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-[#6B778C]">
                        {activeTxn.lineItems[0]?.quantity ?? 0} units @{' '}
                        {formatINR(activeTxn.lineItems[0]?.unitPrice ?? 0)}
                      </span>
                    </div>
                    <div className="rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-3">
                      <span className="block text-[11px] text-[#6B778C]">Net Variance</span>
                      <span
                        className={cn(
                          'mt-1 block font-mono text-[16px] font-semibold tabular-nums',
                          invoiceVariance === 0 ? 'text-[#168568]' : 'text-[#D9534F]'
                        )}
                      >
                        {invoiceVariance === 0
                          ? '₹0'
                          : `${invoiceVariance && invoiceVariance > 0 ? '+' : '-'}${formatINR(
                              Math.abs(invoiceVariance ?? 0)
                            )}`}
                      </span>
                      <span className="mt-0.5 block text-[11.5px] text-[#6B778C]">
                        {invoiceVariance === 0 ? 'Cleared for settlement' : 'Blocked pending review'}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </TabsContent>

            {/* Tab 2: Extracted / Structured Fields */}
            <TabsContent value="extracted">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Extracted Structured Business Fields</CardTitle>
                    <CardDescription>
                      Normalized document attributes ready for ANSI X12 mapping and validation
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {[
                      ['Transaction ID', activeTxn.transactionId],
                      ['Document Number', activeTxn.documentNumber],
                      ['X12 Message Set', `${activeTxn.documentType} (${DOC_TYPE_META[activeTxn.documentType].label})`],
                      ['Document Date', formatDateTime(activeTxn.transactionDate)],
                      ['Sender ISA ID', `${senderPartner?.isaQualifier ?? 'ZZ'}:${senderPartner?.isaId ?? activeTxn.sender}`],
                      ['Receiver ISA ID', `${receiverPartner?.isaQualifier ?? 'ZZ'}:${receiverPartner?.isaId ?? activeTxn.receiver}`],
                      ['Reference Purchase Order', activeTxn.referencePo ?? 'N/A'],
                      ['Currency & Grand Total', `INR · ${formatINR(activeTxn.amount)}`],
                      ['Primary SKU', activeTxn.lineItems[0]?.sku ?? '—'],
                      ['Total Ordered / Billed Units', String(activeTxn.lineItems.reduce((s, i) => s + i.quantity, 0))],
                    ].map(([label, val]) => (
                      <div
                        key={label}
                        className="flex items-center justify-between gap-3 rounded-control border border-[#EDF1F5] bg-[#F9FAFB] px-3.5 py-2.5 text-[12.5px]"
                      >
                        <span className="text-[#6B778C]">{label}</span>
                        <span className="font-mono font-medium text-[#172B4D] text-right">{val}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 3: Validation Results */}
            <TabsContent value="validation">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Deterministic Validation Checks</CardTitle>
                    <CardDescription>
                      Rule-based verification executed in TypeScript (independent of AI inference)
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2.5">
                  {activeTxn.validationResults.length === 0 ? (
                    <p className="text-[13px] text-[#6B778C]">
                      No validation checks executed yet. Click &ldquo;Validate Document&rdquo; above.
                    </p>
                  ) : (
                    activeTxn.validationResults.map((chk) => (
                      <div
                        key={chk.id}
                        className={cn(
                          'flex items-start justify-between gap-3 rounded-control border p-3.5',
                          chk.status === 'pass' && 'border-[#B8E2D4] bg-[#ECF7F3]/40',
                          chk.status === 'warning' && 'border-[#F1DBA8] bg-[#FDF7EB]/50',
                          chk.status === 'fail' && 'border-[#F3C2C0] bg-[#FDF1F1]/70'
                        )}
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-[11px] font-semibold text-[#6B778C]">
                              {chk.ruleCode}
                            </span>
                            <span className="text-[13px] font-semibold text-[#172B4D]">
                              {chk.label}
                            </span>
                          </div>
                          <p className="text-[12.5px] text-[#42526E]">{chk.detail}</p>
                        </div>
                        <Badge
                          variant={
                            chk.status === 'pass'
                              ? 'success'
                              : chk.status === 'warning'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {chk.status.toUpperCase()}
                        </Badge>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 4: ANSI X12 Preview */}
            <TabsContent value="edi">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Representative ANSI X12 {activeTxn.documentType} Payload</CardTitle>
                    <CardDescription>
                      Generated interchange envelope (ISA / GS / ST / SE / GE / IEA)
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={handleCopyEdi}>
                      <Copy className="h-3.5 w-3.5" />
                      Copy X12
                    </Button>
                    <Button variant="outline" size="sm" onClick={handleDownloadEdi}>
                      <Download className="h-3.5 w-3.5" />
                      Download .EDI
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {activeTxn.ediPayload ? (
                    <pre className="overflow-x-auto rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-4 font-mono text-[12px] leading-6 text-[#172B4D]">
                      {activeTxn.ediPayload}
                    </pre>
                  ) : (
                    <div className="rounded-control border border-dashed border-[#CBD5E1] p-6 text-center text-[13px] text-[#6B778C]">
                      EDI payload not generated yet (Draft). Click &ldquo;Generate EDI&rdquo; to build ANSI X12 output.
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Tab 5: Local Document Upload, PDF/OCR Extraction & Human-Confirmed Review */}
            <TabsContent value="upload" className="space-y-4">
              <Card>
                <CardHeader>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <FileScan className="h-4 w-4 text-[#1E4E8C]" />
                      Upload Business Document (PDF / PNG / JPG / JPEG)
                    </CardTitle>
                    <CardDescription>
                      Extracts text locally using PyMuPDF (selectable PDF) or Pillow + Tesseract OCR. Extracted fields require explicit human confirmation before saving to SQLite.
                    </CardDescription>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-dashed border-[#CBD5E1] bg-[#F9FAFB] p-4">
                    <div>
                      <label htmlFor="doc-upload-input" className="block text-[13px] font-medium text-[#172B4D]">
                        Select PDF or scanned image file (max 10 MB)
                      </label>
                      <p className="mt-0.5 text-[12px] text-[#6B778C]">
                        Processed strictly locally without uploading to any external service.
                      </p>
                    </div>
                    <input
                      id="doc-upload-input"
                      type="file"
                      accept=".pdf,.png,.jpg,.jpeg"
                      disabled={uploading}
                      onChange={(e) => void handleFileUpload(e.target.files?.[0])}
                      className="text-[12.5px] text-[#172B4D] file:mr-3 file:rounded-control file:border file:border-[#E2E7EE] file:bg-white file:px-3 file:py-1.5 file:text-[12.5px] file:font-medium file:text-[#172B4D] hover:file:bg-[#F1F4F8]"
                    />
                  </div>

                  {uploading ? (
                    <div className="rounded-control border border-[#C5D7EE] bg-[#EFF4FB] p-3 text-[12.5px] text-[#172B4D]">
                      Extracting text and structured fields locally...
                    </div>
                  ) : null}

                  {uploadError ? (
                    <div role="alert" className="rounded-control border border-[#F3C2C0] bg-[#FDF1F1] p-3 text-[12.5px] text-[#D9534F]">
                      {uploadError}
                    </div>
                  ) : null}

                  {uploadRes ? (
                    <div className="space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border border-[#E2E7EE] bg-[#F9FAFB] px-3.5 py-2.5 text-[12.5px]">
                        <div>
                          <span className="font-mono font-semibold text-[#172B4D]">{uploadRes.filename}</span>
                          <span className="ml-2 text-[#6B778C]">
                            ({Math.max(1, Math.round(uploadRes.fileSizeBytes / 1024))} KB · {uploadRes.pageCount} page{uploadRes.pageCount === 1 ? '' : 's'})
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="info">{uploadRes.extractionMethod}</Badge>
                          <Badge variant="neutral">{uploadRes.structured.extraction_source}</Badge>
                        </div>
                      </div>

                      {uploadRes.warning ? (
                        <div className="rounded-control border border-[#F1DBA8] bg-[#FDF7EB] p-3 text-[12.5px] text-[#9A6B16]">
                          <strong>Extraction Notice:</strong> {uploadRes.warning}
                        </div>
                      ) : null}

                      {uploadRes.structured.warnings.map((w) => (
                        <div key={w} className="rounded-control border border-[#F1DBA8] bg-[#FDF7EB] p-3 text-[12px] text-[#9A6B16]">
                          {w}
                        </div>
                      ))}

                      <div>
                        <p className="mb-1.5 text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[#6B778C]">
                          Extracted Document Text
                        </p>
                        <pre className="max-h-40 overflow-y-auto rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-3 font-mono text-[11.5px] text-[#42526E] whitespace-pre-wrap">
                          {uploadRes.extractedText || 'No readable text extracted — fill fields manually below.'}
                        </pre>
                      </div>

                      {/* Structured Review Form Requiring Explicit Human Confirmation */}
                      <div className="rounded-control border border-[#E2E7EE] p-4 space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <p className="text-[13px] font-semibold text-[#172B4D]">
                            Extracted Fields Review (Requires Human Confirmation)
                          </p>
                          {uploadRes.structured.uncertain_fields.length > 0 ? (
                            <Badge variant="warning">
                              {uploadRes.structured.uncertain_fields.length} uncertain/missing field(s)
                            </Badge>
                          ) : (
                            <Badge variant="success">All Core Fields Identified</Badge>
                          )}
                        </div>

                        {uploadRes.structured.uncertain_fields.length > 0 ? (
                          <p className="text-[12px] text-[#9A6B16]">
                            Flagged as missing/uncertain: <span className="font-mono">{uploadRes.structured.uncertain_fields.join(', ')}</span>
                          </p>
                        ) : null}

                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <div>
                            <label htmlFor="rev-type" className="mb-1 block text-[11.5px] font-medium">
                              Document Type
                            </label>
                            <select
                              id="rev-type"
                              value={revDocType}
                              onChange={(e) => setRevDocType(e.target.value as '850' | '810')}
                              className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-2.5 text-[12.5px]"
                            >
                              <option value="850">850 · Purchase Order</option>
                              <option value="810">810 · Invoice</option>
                            </select>
                          </div>
                          <div>
                            <label htmlFor="rev-num" className="mb-1 block text-[11.5px] font-medium">
                              Document Number *
                            </label>
                            <Input
                              id="rev-num"
                              value={revDocNumber}
                              onChange={(e) => setRevDocNumber(e.target.value)}
                              className="font-mono"
                              placeholder="PO-MTR-2026-..."
                            />
                          </div>
                          <div>
                            <label htmlFor="rev-date" className="mb-1 block text-[11.5px] font-medium">
                              Document Date *
                            </label>
                            <Input
                              id="rev-date"
                              type="date"
                              value={revDocDate}
                              onChange={(e) => setRevDocDate(e.target.value)}
                            />
                          </div>
                          <div>
                            <label htmlFor="rev-buyer" className="mb-1 block text-[11.5px] font-medium">
                              Buyer
                            </label>
                            <select
                              id="rev-buyer"
                              value={revBuyer}
                              onChange={(e) => setRevBuyer(e.target.value)}
                              className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-2.5 text-[12.5px]"
                            >
                              {partners.map((p) => (
                                <option key={p.id} value={p.name}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor="rev-supplier" className="mb-1 block text-[11.5px] font-medium">
                              Supplier
                            </label>
                            <select
                              id="rev-supplier"
                              value={revSupplier}
                              onChange={(e) => setRevSupplier(e.target.value)}
                              className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-2.5 text-[12.5px]"
                            >
                              {partners.map((p) => (
                                <option key={p.id} value={p.name}>{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <label htmlFor="rev-po" className="mb-1 block text-[11.5px] font-medium">
                              Reference PO (for 810)
                            </label>
                            <Input
                              id="rev-po"
                              value={revRefPo}
                              onChange={(e) => setRevRefPo(e.target.value)}
                              className="font-mono"
                              placeholder="PO-MTR-2026-441"
                            />
                          </div>
                          <div>
                            <label htmlFor="rev-sku" className="mb-1 block text-[11.5px] font-medium">
                              SKU *
                            </label>
                            <Input id="rev-sku" value={revSku} onChange={(e) => setRevSku(e.target.value)} className="font-mono" />
                          </div>
                          <div className="sm:col-span-2">
                            <label htmlFor="rev-desc" className="mb-1 block text-[11.5px] font-medium">
                              Item Description *
                            </label>
                            <Input id="rev-desc" value={revDesc} onChange={(e) => setRevDesc(e.target.value)} />
                          </div>
                          <div>
                            <label htmlFor="rev-qty" className="mb-1 block text-[11.5px] font-medium">
                              Quantity *
                            </label>
                            <Input id="rev-qty" type="number" min="1" value={revQty} onChange={(e) => setRevQty(e.target.value)} className="font-mono" />
                          </div>
                          <div>
                            <label htmlFor="rev-price" className="mb-1 block text-[11.5px] font-medium">
                              Unit Price (₹) *
                            </label>
                            <Input id="rev-price" type="number" min="1" value={revPrice} onChange={(e) => setRevPrice(e.target.value)} className="font-mono" />
                          </div>
                          <div>
                            <label htmlFor="rev-tax" className="mb-1 block text-[11.5px] font-medium">
                              Tax Rate (%)
                            </label>
                            <Input id="rev-tax" type="number" min="0" value={revTaxRate} onChange={(e) => setRevTaxRate(e.target.value)} className="font-mono" />
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#EDF1F5] pt-3">
                          <Button variant="outline" size="sm" onClick={() => setUploadRes(null)}>
                            Discard Extraction
                          </Button>
                          <Button variant="primary" size="sm" disabled={busy} onClick={() => void handleConfirmSaveExtracted()}>
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Confirm & Register Document in SQLite
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right 4 Cols: Acknowledgement Workflow + Processing Timeline */}
        <div className="min-w-0 space-y-5 xl:col-span-4">
          {/* Acknowledgement & Partner Simulation */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-[#1E4E8C]" />
                  Acknowledgement Status
                </CardTitle>
                <CardDescription>Supplier receipt & X12 855 confirmation</CardDescription>
              </div>
              <Badge
                variant={
                  activeTxn.ackStatus === 'Acknowledged'
                    ? 'success'
                    : activeTxn.ackStatus === 'Exception'
                    ? 'danger'
                    : 'warning'
                }
              >
                {activeTxn.ackStatus}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3 text-[12.5px]">
              {activeTxn.acknowledgement ? (
                <div className="rounded-control border border-[#B8E2D4] bg-[#ECF7F3]/50 p-3 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-semibold text-[#172B4D]">
                      {activeTxn.acknowledgement.ackDocNumber}
                    </span>
                    <Badge variant="success">Code: {activeTxn.acknowledgement.ackCode}</Badge>
                  </div>
                  <p className="text-[#42526E]">{activeTxn.acknowledgement.note}</p>
                  <p className="text-[11px] text-[#6B778C]">
                    Confirmed {formatDateTime(activeTxn.acknowledgement.ackDate)}
                  </p>
                </div>
              ) : (
                <p className="text-[#42526E]">
                  {activeTxn.documentType === '850'
                    ? 'Supplier EDI 855 Order Acknowledgement has not been received yet.'
                    : `Acknowledgement state: ${activeTxn.ackStatus}.`}
                </p>
              )}

              {activeTxn.documentType === '850' ? (
                <div className="space-y-2 border-t border-[#EDF1F5] pt-3">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B778C]">
                    Scenario 1 Supplier Simulation
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    disabled={
                      busy ||
                      Boolean(activeTxn.supplierReceiptSimulated) ||
                      activeTxn.status === 'Draft' ||
                      activeTxn.status === 'Rejected'
                    }
                    onClick={async () => {
                      setBusy(true)
                      try {
                        await simulateSupplierReceipt(activeTxn.transactionId)
                        pushToast({
                          tone: 'info',
                          title: 'Supplier Receipt Simulated',
                          description: `${activeTxn.receiver} confirmed receipt of X12 850 envelope.`,
                        })
                      } catch (err) {
                        pushToast({
                          tone: 'danger',
                          title: 'Receipt Simulation Failed',
                          description: err instanceof Error ? err.message : 'Unable to simulate receipt.',
                        })
                      } finally {
                        setBusy(false)
                      }
                    }}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {activeTxn.supplierReceiptSimulated
                      ? 'Supplier Receipt Confirmed (997)'
                      : 'Simulate Supplier Receipt'}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    className="w-full justify-start"
                    disabled={
                      busy ||
                      activeTxn.ackStatus === 'Acknowledged' ||
                      activeTxn.status === 'Draft' ||
                      activeTxn.status === 'Rejected'
                    }
                    onClick={() => void handleSimulate855()}
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {activeTxn.ackStatus === 'Acknowledged'
                      ? 'EDI 855 Acknowledgement Recorded'
                      : 'Simulate Supplier EDI 855 Ack'}
                  </Button>
                </div>
              ) : null}

              {activeTxn.reviewerNotes ? (
                <div className="rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-3">
                  <span className="block text-[11px] font-semibold uppercase text-[#6B778C]">
                    Operator Note
                  </span>
                  <p className="mt-1 text-[12px] text-[#172B4D]">{activeTxn.reviewerNotes}</p>
                </div>
              ) : null}
            </CardContent>
          </Card>

          {/* Processing Timeline */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Processing Timeline</CardTitle>
                <CardDescription>Immutable audit history of transaction events</CardDescription>
              </div>
              <Clock className="h-4 w-4 text-[#6B778C]" />
            </CardHeader>
            <CardContent>
              <ol className="space-y-4">
                {activeTxn.timeline.map((ev, index) => (
                  <li key={ev.id} className="relative flex gap-3">
                    {index < activeTxn.timeline.length - 1 ? (
                      <span
                        aria-hidden="true"
                        className="absolute left-[7px] top-5 bottom-[-16px] w-px bg-[#E2E7EE]"
                      />
                    ) : null}
                    <span
                      className={cn(
                        'mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2 bg-white',
                        ev.status === 'completed' && 'border-[#168568]',
                        ev.status === 'warning' && 'border-[#D69A35]',
                        ev.status === 'error' && 'border-[#D9534F]',
                        ev.status === 'info' && 'border-[#1E4E8C]'
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-[12.5px] font-semibold text-[#172B4D]">
                          {ev.step}
                        </span>
                        <span className="text-[11px] text-[#6B778C] tabular-nums">
                          {formatDateTime(ev.timestamp)}
                        </span>
                      </div>
                      <p className="mt-0.5 text-[12px] text-[#42526E]">{ev.note}</p>
                      <span className="mt-0.5 block text-[11px] text-[#6B778C]">
                        Actor: {ev.actor}
                      </span>
                    </div>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Reject Modal */}
      <Dialog open={rejectModalOpen} onOpenChange={setRejectModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Reject Document {activeTxn.documentNumber}</DialogTitle>
            <DialogDescription>
              Record an audit reason explaining why this interchange is rejected.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <label htmlFor="reject-reason" className="block text-[12px] font-medium">
              Rejection Reason *
            </label>
            <textarea
              id="reject-reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="e.g., Invoice amount ₹46,00,000 exceeds approved PO amount ₹45,00,000."
              className="w-full rounded-control border border-[#E2E7EE] p-3 text-[13px] text-[#172B4D] focus:border-[#1E4E8C] focus:outline-none"
            />
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setRejectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={async () => {
                setBusy(true)
                try {
                  await rejectTransaction(activeTxn.transactionId, rejectReason)
                  setRejectModalOpen(false)
                  pushToast({
                    tone: 'danger',
                    title: 'Document Rejected',
                    description: `${activeTxn.transactionId} marked Rejected with audit note.`,
                  })
                } finally {
                  setBusy(false)
                }
              }}
            >
              Confirm Rejection
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Human Review & Correction Modal */}
      <Dialog open={correctModalOpen} onOpenChange={setCorrectModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Human Review & Line-Item Correction</DialogTitle>
            <DialogDescription>
              Adjust quantities or unit pricing after supplier confirmation and reprocess deterministically.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-4">
            {referencedPo ? (
              <div className="flex items-center justify-between rounded-control border border-[#C5D7EE] bg-[#EFF4FB] px-3.5 py-2.5 text-[12.5px]">
                <span className="flex items-center gap-2 text-[#172B4D]">
                  <AlertTriangle className="h-4 w-4 text-[#1E4E8C]" />
                  Target PO {referencedPo.documentNumber}:{' '}
                  <strong className="font-mono">{formatINR(referencedPo.amount)}</strong>
                </span>
                <span className="font-mono text-[12px] text-[#42526E]">
                  {referencedPo.lineItems[0]?.quantity} ×{' '}
                  {formatINR(referencedPo.lineItems[0]?.unitPrice ?? 0)}
                </span>
              </div>
            ) : null}

            <div className="space-y-2.5">
              {editLines.map((line, idx) => (
                <div
                  key={line.id}
                  className="grid grid-cols-1 gap-2.5 rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-3 sm:grid-cols-12"
                >
                  <div className="sm:col-span-5">
                    <span className="block text-[11px] text-[#6B778C]">
                      Item #{idx + 1} ({line.sku})
                    </span>
                    <span className="text-[12.5px] font-medium text-[#172B4D]">
                      {line.description}
                    </span>
                  </div>
                  <div className="sm:col-span-3">
                    <label
                      htmlFor={`corr-qty-${line.id}`}
                      className="mb-1 block text-[11px] text-[#6B778C]"
                    >
                      Quantity
                    </label>
                    <Input
                      id={`corr-qty-${line.id}`}
                      type="number"
                      min="1"
                      value={line.quantity}
                      onChange={(e) => {
                        const qty = Number(e.target.value) || 0
                        setEditLines((prev) =>
                          prev.map((p) =>
                            p.id === line.id
                              ? { ...p, quantity: qty, lineTotal: Math.round(qty * p.unitPrice) }
                              : p
                          )
                        )
                      }}
                      className="font-mono"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <label
                      htmlFor={`corr-price-${line.id}`}
                      className="mb-1 block text-[11px] text-[#6B778C]"
                    >
                      Unit Price (₹)
                    </label>
                    <Input
                      id={`corr-price-${line.id}`}
                      type="number"
                      min="1"
                      value={line.unitPrice}
                      onChange={(e) => {
                        const price = Number(e.target.value) || 0
                        setEditLines((prev) =>
                          prev.map((p) =>
                            p.id === line.id
                              ? { ...p, unitPrice: price, lineTotal: Math.round(p.quantity * price) }
                              : p
                          )
                        )
                      }}
                      className="font-mono"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div>
              <label htmlFor="corr-note" className="mb-1 block text-[12px] font-medium">
                Reviewer Audit Note
              </label>
              <Input
                id="corr-note"
                value={correctionNote}
                onChange={(e) => setCorrectionNote(e.target.value)}
              />
            </div>

            <div className="flex items-center justify-between border-t border-[#EDF1F5] pt-3 text-[13px]">
              <span className="text-[#6B778C]">Recalculated Document Total</span>
              <span className="font-mono text-[15px] font-semibold text-[#172B4D]">
                {formatINR(
                  Math.round(
                    editLines.reduce((s, l) => s + l.quantity * l.unitPrice, 0) *
                      (1 + editTaxRate / 100)
                  )
                )}
              </span>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setCorrectModalOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={busy}
              onClick={() => void handleSaveCorrection(false)}
            >
              Save Changes Only
            </Button>
            <Button
              variant="primary"
              size="sm"
              disabled={busy}
              onClick={() => void handleSaveCorrection(true)}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Save & Reprocess
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

