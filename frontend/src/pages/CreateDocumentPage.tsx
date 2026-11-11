import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AlertCircle,
  CheckCircle2,
  FileCheck2,
  Plus,
  Save,
  Send,
  Trash2,
  Workflow,
} from 'lucide-react'
import { DocTypeBadge } from '@/components/shared/DocTypeBadge'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useToast } from '@/components/shared/ToastProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useEdiStore } from '@/context/EdiStoreContext'
import { calculateTotals } from '@/lib/ediEngine'
import { formatINR } from '@/lib/format'
import type { LineItem, TransactionRecord } from '@/types/edi'

interface DraftLineItem {
  id: string
  sku: string
  description: string
  quantity: string
  unitPrice: string
}

function makeEmptyLine(index: number): DraftLineItem {
  return {
    id: `line-${Date.now()}-${index}`,
    sku: '',
    description: '',
    quantity: '1',
    unitPrice: '0',
  }
}

export function CreateDocumentPage() {
  const navigate = useNavigate()
  const { partners, transactions, settings, createDocument } = useEdiStore()
  const { pushToast } = useToast()

  const existingPos = useMemo(
    () => transactions.filter((t) => t.documentType === '850'),
    [transactions]
  )

  const nextDocNumber = (prefix: string, startNum: number) => {
    let n = startNum + transactions.length
    while (transactions.some((t) => t.documentNumber === `${prefix}${n}`)) {
      n += 1
    }
    return `${prefix}${n}`
  }

  const [documentType, setDocumentType] = useState<'850' | '810'>('850')
  const [documentNumber, setDocumentNumber] = useState(() =>
    nextDocNumber('PO-MTR-2026-', 450)
  )
  const [documentDate, setDocumentDate] = useState('2026-11-11')
  const [buyerName, setBuyerName] = useState('Metro Retail')
  const [supplierName, setSupplierName] = useState('ABC Components')
  const [referencePo, setReferencePo] = useState('PO-MTR-2026-441')
  const [taxRatePct, setTaxRatePct] = useState<number>(settings.defaultTaxRatePct)
  const [summary, setSummary] = useState('')
  const [lineItems, setLineItems] = useState<DraftLineItem[]>([
    {
      id: 'line-init-1',
      sku: 'LPT-PRO-15',
      description: 'Enterprise Laptop 15" i7 / 16GB / 512GB SSD',
      quantity: '100',
      unitPrice: '45000',
    },
  ])
  const [errors, setErrors] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [createdResult, setCreatedResult] = useState<TransactionRecord | null>(null)

  const parsedLines: LineItem[] = useMemo(
    () =>
      lineItems.map((item) => {
        const qty = Number(item.quantity) || 0
        const price = Number(item.unitPrice) || 0
        return {
          id: item.id,
          sku: item.sku.trim(),
          description: item.description.trim(),
          quantity: qty,
          unitPrice: price,
          lineTotal: Math.round(qty * price),
        }
      }),
    [lineItems]
  )

  const totals = useMemo(
    () => calculateTotals(parsedLines, taxRatePct),
    [parsedLines, taxRatePct]
  )

  const applyScenario1Preset = () => {
    setDocumentType('850')
    setDocumentNumber(nextDocNumber('PO-MTR-2026-', 450))
    setDocumentDate('2026-11-11')
    setBuyerName('Metro Retail')
    setSupplierName('ABC Components')
    setTaxRatePct(0)
    setSummary('Scenario 1: Purchase Order for 100 Enterprise Laptops')
    setLineItems([
      {
        id: `sc1-${Date.now()}`,
        sku: 'LPT-PRO-15',
        description: 'Enterprise Laptop 15" i7 / 16GB / 512GB SSD',
        quantity: '100',
        unitPrice: '45000',
      },
    ])
    setErrors([])
    setCreatedResult(null)
    pushToast({
      tone: 'info',
      title: 'Scenario 1 Preset Loaded',
      description: 'Metro Retail Purchase Order for 100 laptops @ ₹45,000 (₹45,00,000).',
    })
  }

  const applyScenario2Preset = () => {
    const targetPo =
      existingPos.find((po) => po.amount === 4500000)?.documentNumber ??
      existingPos[0]?.documentNumber ??
      'PO-MTR-2026-441'
    setDocumentType('810')
    setDocumentNumber(nextDocNumber('INV-ABC-', 8830))
    setDocumentDate('2026-11-11')
    setBuyerName('Metro Retail')
    setSupplierName('ABC Components')
    setReferencePo(targetPo)
    setTaxRatePct(0)
    setSummary(`Scenario 2: Supplier Invoice against ${targetPo} (₹46,00,000 billing)`)
    setLineItems([
      {
        id: `sc2-${Date.now()}`,
        sku: 'LPT-PRO-15',
        description: 'Enterprise Laptop 15" i7 / 16GB / 512GB SSD',
        quantity: '100',
        unitPrice: '46000',
      },
    ])
    setErrors([])
    setCreatedResult(null)
    pushToast({
      tone: 'warning',
      title: 'Scenario 2 Preset Loaded',
      description: `Invoice ₹46,00,000 referencing ${targetPo} (₹45,00,000) to test discrepancy detection.`,
    })
  }

  const handleDocTypeSwitch = (nextType: '850' | '810') => {
    setDocumentType(nextType)
    if (nextType === '850' && documentNumber.startsWith('INV-')) {
      setDocumentNumber(nextDocNumber('PO-MTR-2026-', 450))
    } else if (nextType === '810' && documentNumber.startsWith('PO-')) {
      setDocumentNumber(nextDocNumber('INV-ABC-', 8830))
    }
    setErrors([])
  }

  const updateLine = (id: string, field: keyof DraftLineItem, value: string) => {
    setLineItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: value } : item))
    )
  }

  const removeLine = (id: string) => {
    if (lineItems.length <= 1) return
    setLineItems((prev) => prev.filter((item) => item.id !== id))
  }

  const validateForm = (): string[] => {
    const errs: string[] = []
    if (!documentNumber.trim()) errs.push('Document number is required.')
    if (!documentDate) errs.push('Document date is required.')
    if (!buyerName || !supplierName) errs.push('Both Buyer and Supplier must be selected.')
    if (buyerName === supplierName) errs.push('Buyer and Supplier cannot be the same partner.')
    if (documentType === '810' && !referencePo.trim()) {
      errs.push('Reference Purchase Order number is required for EDI 810 invoices.')
    }
    if (lineItems.length === 0) {
      errs.push('At least one product line item is required.')
    }
    lineItems.forEach((item, index) => {
      const idxLabel = `Line ${index + 1}`
      if (!item.sku.trim()) errs.push(`${idxLabel}: SKU is required.`)
      if (!item.description.trim()) errs.push(`${idxLabel}: Item description is required.`)
      const qty = Number(item.quantity)
      const price = Number(item.unitPrice)
      if (!Number.isFinite(qty) || qty <= 0) {
        errs.push(`${idxLabel}: Quantity must be greater than 0.`)
      }
      if (!Number.isFinite(price) || price <= 0) {
        errs.push(`${idxLabel}: Unit price must be greater than 0.`)
      }
    })
    return errs
  }

  const handleAction = async (mode: 'draft' | 'submit') => {
    const formErrors = validateForm()
    if (formErrors.length > 0) {
      setErrors(formErrors)
      pushToast({
        tone: 'danger',
        title: 'Validation Required',
        description: formErrors[0],
      })
      return
    }
    setErrors([])

    // Direction: for 850 PO, Buyer sends to Supplier; for 810 Invoice, Supplier sends to Buyer.
    const sender = documentType === '850' ? buyerName : supplierName
    const receiver = documentType === '850' ? supplierName : buyerName

    setSubmitting(true)
    try {
      const created = await createDocument({
        documentType,
        documentNumber: documentNumber.trim(),
        documentDate,
        sender,
        receiver,
        referencePo: documentType === '810' ? referencePo.trim() : undefined,
        taxRatePct,
        summary: summary.trim(),
        lineItems: parsedLines,
        mode,
      })

      setCreatedResult(created)

      if (mode === 'draft') {
        pushToast({
          tone: 'info',
          title: 'Saved as Draft',
          description: `${created.transactionId} (${created.documentNumber}) saved in SQLite.`,
        })
      } else if (created.status === 'Rejected') {
        pushToast({
          tone: 'danger',
          title: 'Validation Exception Flagged',
          description: created.exceptionReason ?? 'Document failed deterministic validation.',
        })
      } else {
        pushToast({
          tone: 'success',
          title: `${created.documentNumber} Submitted`,
          description: `Assigned ${created.transactionId} (${formatINR(created.amount)}).`,
        })
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save document to backend.'
      setErrors([msg])
      pushToast({
        tone: 'danger',
        title: 'Backend Request Failed',
        description: msg,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Create Document"
        description="Author structured Purchase Orders (X12 850) and Invoices (X12 810) with live deterministic totals."
        badge={<Badge variant="info">EDI 850 / 810</Badge>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={applyScenario1Preset}>
              Load Scenario 1 (PO ₹45L)
            </Button>
            <Button variant="outline" size="sm" onClick={applyScenario2Preset}>
              Load Scenario 2 (Invoice ₹46L)
            </Button>
          </div>
        }
      />

      {/* Submission Confirmation Banner */}
      {createdResult ? (
        <Card className="border-[#B8E2D4] bg-[#ECF7F3]/50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                {createdResult.status === 'Rejected' ? (
                  <AlertCircle className="h-4 w-4 text-[#D9534F]" />
                ) : (
                  <CheckCircle2 className="h-4 w-4 text-[#168568]" />
                )}
                <span className="text-[13.5px] font-semibold text-[#172B4D]">
                  Document Recorded: {createdResult.transactionId} ({createdResult.documentNumber})
                </span>
                <DocTypeBadge code={createdResult.documentType} />
                <StatusBadge status={createdResult.status} />
              </div>
              <p className="text-[12.5px] text-[#42526E]">
                {createdResult.sender} → {createdResult.receiver} · Grand Total{' '}
                <span className="font-mono font-semibold text-[#172B4D]">
                  {formatINR(createdResult.amount)}
                </span>
                {createdResult.exceptionReason
                  ? ` — Exception: ${createdResult.exceptionReason}`
                  : ''}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <Button variant="outline" size="sm" onClick={() => navigate('/transactions')}>
                View in Register
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={() => navigate(`/processing/${createdResult.transactionId}`)}
              >
                <Workflow className="h-3.5 w-3.5" />
                Open in Document Processing
              </Button>
            </div>
          </div>
        </Card>
      ) : null}

      {/* Inline Validation Errors */}
      {errors.length > 0 ? (
        <div
          role="alert"
          className="rounded-card border border-[#F3C2C0] bg-[#FDF1F1] p-4 text-[12.5px] text-[#D9534F]"
        >
          <p className="font-semibold">Please resolve the following fields before continuing:</p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-5">
            {errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Main Form */}
        <div className="space-y-5 lg:col-span-8">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Document Header & Trading Parties</CardTitle>
                <CardDescription>
                  Select ANSI X12 message type, business identifiers, and routing direction
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Document Type Selector */}
              <div>
                <span className="block text-[12px] font-medium text-[#172B4D] mb-2">
                  Document Type
                </span>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => handleDocTypeSwitch('850')}
                    className={`flex items-center justify-between rounded-control border p-3 text-left transition-colors ${
                      documentType === '850'
                        ? 'border-[#172B4D] bg-[#F1F4F8]'
                        : 'border-[#E2E7EE] bg-white hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <div>
                      <span className="block text-[13px] font-semibold text-[#172B4D]">
                        Purchase Order
                      </span>
                      <span className="block text-[11.5px] text-[#6B778C]">
                        Buyer → Supplier outbound order
                      </span>
                    </div>
                    <Badge variant={documentType === '850' ? 'info' : 'neutral'}>850 PO</Badge>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDocTypeSwitch('810')}
                    className={`flex items-center justify-between rounded-control border p-3 text-left transition-colors ${
                      documentType === '810'
                        ? 'border-[#172B4D] bg-[#F1F4F8]'
                        : 'border-[#E2E7EE] bg-white hover:bg-[#F9FAFB]'
                    }`}
                  >
                    <div>
                      <span className="block text-[13px] font-semibold text-[#172B4D]">
                        Commercial Invoice
                      </span>
                      <span className="block text-[11.5px] text-[#6B778C]">
                        Supplier → Buyer billing & PO match
                      </span>
                    </div>
                    <Badge variant={documentType === '810' ? 'info' : 'neutral'}>810 INV</Badge>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="doc-number"
                    className="mb-1.5 block text-[12px] font-medium text-[#172B4D]"
                  >
                    Document Number *
                  </label>
                  <Input
                    id="doc-number"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    className="font-mono"
                    placeholder={documentType === '850' ? 'PO-MTR-2026-450' : 'INV-ABC-8830'}
                  />
                </div>

                <div>
                  <label
                    htmlFor="doc-date"
                    className="mb-1.5 block text-[12px] font-medium text-[#172B4D]"
                  >
                    Document Date *
                  </label>
                  <Input
                    id="doc-date"
                    type="date"
                    value={documentDate}
                    onChange={(e) => setDocumentDate(e.target.value)}
                  />
                </div>

                <div>
                  <label
                    htmlFor="doc-buyer"
                    className="mb-1.5 block text-[12px] font-medium text-[#172B4D]"
                  >
                    Buyer *
                  </label>
                  <select
                    id="doc-buyer"
                    value={buyerName}
                    onChange={(e) => setBuyerName(e.target.value)}
                    className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-3 text-[13px] text-[#172B4D] focus:border-[#1E4E8C] focus:outline-none"
                  >
                    {partners.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name} ({p.role})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="doc-supplier"
                    className="mb-1.5 block text-[12px] font-medium text-[#172B4D]"
                  >
                    Supplier *
                  </label>
                  <select
                    id="doc-supplier"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-3 text-[13px] text-[#172B4D] focus:border-[#1E4E8C] focus:outline-none"
                  >
                    {partners.map((p) => (
                      <option key={p.id} value={p.name}>
                        {p.name} ({p.role})
                      </option>
                    ))}
                  </select>
                </div>

                {documentType === '810' ? (
                  <div className="sm:col-span-2">
                    <label
                      htmlFor="doc-ref-po"
                      className="mb-1.5 block text-[12px] font-medium text-[#172B4D]"
                    >
                      Reference Purchase Order (for 2-Way Validation Match) *
                    </label>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <select
                        id="doc-ref-po"
                        value={referencePo}
                        onChange={(e) => setReferencePo(e.target.value)}
                        className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-3 font-mono text-[12.5px] text-[#172B4D] focus:border-[#1E4E8C] focus:outline-none"
                      >
                        {existingPos.map((po) => (
                          <option key={po.id} value={po.documentNumber}>
                            {po.documentNumber} · {formatINR(po.amount)} ({po.status})
                          </option>
                        ))}
                      </select>
                      <Input
                        aria-label="Custom Reference PO Number"
                        value={referencePo}
                        onChange={(e) => setReferencePo(e.target.value)}
                        className="font-mono"
                        placeholder="PO-MTR-2026-441"
                      />
                    </div>
                  </div>
                ) : null}

                <div className="sm:col-span-2">
                  <label
                    htmlFor="doc-summary"
                    className="mb-1.5 block text-[12px] font-medium text-[#172B4D]"
                  >
                    Business Reference / Description
                  </label>
                  <Input
                    id="doc-summary"
                    value={summary}
                    onChange={(e) => setSummary(e.target.value)}
                    placeholder="e.g., Q4 Corporate IT Hardware Procurement"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Line Items Card */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Product Line Items</CardTitle>
                <CardDescription>
                  Enter SKUs, descriptions, quantities, and INR unit rates
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  setLineItems((prev) => [...prev, makeEmptyLine(prev.length + 1)])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add Line Item
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {lineItems.map((item, idx) => {
                const qty = Number(item.quantity) || 0
                const price = Number(item.unitPrice) || 0
                const rowTotal = Math.round(qty * price)
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-1 gap-3 rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-3.5 sm:grid-cols-12"
                  >
                    <div className="sm:col-span-3">
                      <label
                        htmlFor={`sku-${item.id}`}
                        className="mb-1 block text-[11px] font-medium text-[#6B778C]"
                      >
                        SKU #{idx + 1} *
                      </label>
                      <Input
                        id={`sku-${item.id}`}
                        value={item.sku}
                        onChange={(e) => updateLine(item.id, 'sku', e.target.value)}
                        className="font-mono text-[12.5px]"
                        placeholder="LPT-PRO-15"
                      />
                    </div>
                    <div className="sm:col-span-4">
                      <label
                        htmlFor={`desc-${item.id}`}
                        className="mb-1 block text-[11px] font-medium text-[#6B778C]"
                      >
                        Item Description *
                      </label>
                      <Input
                        id={`desc-${item.id}`}
                        value={item.description}
                        onChange={(e) => updateLine(item.id, 'description', e.target.value)}
                        placeholder="Enterprise Laptop"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor={`qty-${item.id}`}
                        className="mb-1 block text-[11px] font-medium text-[#6B778C]"
                      >
                        Quantity *
                      </label>
                      <Input
                        id={`qty-${item.id}`}
                        type="number"
                        min="1"
                        step="1"
                        value={item.quantity}
                        onChange={(e) => updateLine(item.id, 'quantity', e.target.value)}
                        className="font-mono tabular-nums"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label
                        htmlFor={`price-${item.id}`}
                        className="mb-1 block text-[11px] font-medium text-[#6B778C]"
                      >
                        Unit Price (₹) *
                      </label>
                      <Input
                        id={`price-${item.id}`}
                        type="number"
                        min="1"
                        step="1"
                        value={item.unitPrice}
                        onChange={(e) => updateLine(item.id, 'unitPrice', e.target.value)}
                        className="font-mono tabular-nums"
                      />
                    </div>
                    <div className="flex items-end justify-between gap-2 sm:col-span-1 sm:justify-end">
                      <span className="text-[11.5px] font-mono font-semibold text-[#172B4D] sm:hidden">
                        {formatINR(rowTotal)}
                      </span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        disabled={lineItems.length <= 1}
                        onClick={() => removeLine(item.id)}
                        aria-label={`Remove line ${idx + 1}`}
                        className="text-[#6B778C] hover:text-[#D9534F]"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="hidden sm:col-span-12 sm:flex sm:items-center sm:justify-end sm:border-t sm:border-[#EDF1F5] sm:pt-2">
                      <span className="text-[12px] text-[#6B778C]">
                        Line Total:{' '}
                        <span className="font-mono font-semibold text-[#172B4D] tabular-nums">
                          {formatINR(rowTotal)}
                        </span>
                      </span>
                    </div>
                  </div>
                )
              })}
            </CardContent>
          </Card>
        </div>

        {/* Summary & Actions Sidebar */}
        <div className="space-y-4 lg:col-span-4">
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-[#1E4E8C]" />
                  Financial Summary
                </CardTitle>
                <CardDescription>Auto-calculated INR totals</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label
                  htmlFor="tax-rate"
                  className="mb-1.5 block text-[12px] font-medium text-[#172B4D]"
                >
                  GST / Tax Rate
                </label>
                <select
                  id="tax-rate"
                  value={taxRatePct}
                  onChange={(e) => setTaxRatePct(Number(e.target.value))}
                  className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-3 text-[13px] text-[#172B4D] focus:border-[#1E4E8C] focus:outline-none"
                >
                  <option value={0}>0% (Tax Exempt / Inclusive)</option>
                  <option value={5}>5% GST</option>
                  <option value={12}>12% GST</option>
                  <option value={18}>18% GST</option>
                </select>
              </div>

              <div className="space-y-2 border-t border-[#EDF1F5] pt-3 text-[13px]">
                <div className="flex items-center justify-between text-[#42526E]">
                  <span>Routing Direction</span>
                  <span className="font-medium text-[#172B4D]">
                    {documentType === '850'
                      ? `${buyerName} → ${supplierName}`
                      : `${supplierName} → ${buyerName}`}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[#42526E]">
                  <span>Line Items</span>
                  <span className="font-mono tabular-nums">{lineItems.length}</span>
                </div>
                <div className="flex items-center justify-between text-[#42526E]">
                  <span>Subtotal</span>
                  <span className="font-mono tabular-nums">{formatINR(totals.subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-[#42526E]">
                  <span>Tax ({taxRatePct}%)</span>
                  <span className="font-mono tabular-nums">{formatINR(totals.taxAmount)}</span>
                </div>
                <div className="flex items-center justify-between border-t border-[#E2E7EE] pt-2.5 text-[15px] font-semibold text-[#172B4D]">
                  <span>Grand Total</span>
                  <span className="font-mono tabular-nums">{formatINR(totals.grandTotal)}</span>
                </div>
              </div>

              <div className="space-y-2 pt-2">
                <Button
                  type="button"
                  variant="primary"
                  className="w-full"
                  disabled={submitting}
                  onClick={() => void handleAction('submit')}
                >
                  <Send className="h-4 w-4" />
                  {submitting ? 'Submitting...' : 'Submit for Processing'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  disabled={submitting}
                  onClick={() => void handleAction('draft')}
                >
                  <Save className="h-4 w-4" />
                  Save as Draft
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}

