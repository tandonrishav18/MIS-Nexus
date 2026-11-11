import { useMemo, useState } from 'react'
import {
  ArrowRight,
  Copy,
  Edit3,
  GitCompareArrows,
  Info,
  Plus,
  Trash2,
} from 'lucide-react'
import { PageHeader } from '@/components/shared/PageHeader'
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
import { useEdiStore } from '@/context/EdiStoreContext'
import { generateX12Payload } from '@/lib/ediEngine'
import { formatINR } from '@/lib/format'
import type { EdiMappingRule } from '@/types/edi'

export function EdiMappingPage() {
  const {
    mappingRules,
    transactions,
    partners,
    addMappingRule,
    updateMappingRule,
    deleteMappingRule,
  } = useEdiStore()
  const { pushToast } = useToast()

  const poTransactions = useMemo(
    () => transactions.filter((t) => t.documentType === '850'),
    [transactions]
  )
  const [selectedTxnId, setSelectedTxnId] = useState<string>(
    poTransactions[0]?.transactionId ?? transactions[0]?.transactionId ?? ''
  )
  const [docTypeTab, setDocTypeTab] = useState<'850' | '810'>('850')

  // Add/Edit mapping dialog
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<EdiMappingRule | null>(null)
  const [sourceField, setSourceField] = useState('')
  const [sourcePath, setSourcePath] = useState('')
  const [ediSegment, setEdiSegment] = useState('REF')
  const [ediElement, setEdiElement] = useState('REF02')
  const [ediDescription, setEdiDescription] = useState('')
  const [transformRule, setTransformRule] = useState('DIRECT_STRING(value)')
  const [ruleStatus, setRuleStatus] = useState<EdiMappingRule['status']>('Custom')
  const [formErr, setFormErr] = useState('')

  const sampleTxn = useMemo(() => {
    return (
      transactions.find((t) => t.transactionId === selectedTxnId) ??
      poTransactions[0] ??
      transactions[0]
    )
  }, [transactions, poTransactions, selectedTxnId])

  const filteredRules = useMemo(
    () => mappingRules.filter((r) => r.documentType === docTypeTab),
    [mappingRules, docTypeTab]
  )

  const livePreviewX12 = useMemo(() => {
    if (!sampleTxn) return ''
    return generateX12Payload(sampleTxn, partners, mappingRules)
  }, [sampleTxn, partners, mappingRules])

  const openAddDialog = () => {
    setEditingRule(null)
    setSourceField('')
    setSourcePath('')
    setEdiSegment('REF')
    setEdiElement('REF02')
    setEdiDescription('')
    setTransformRule('DIRECT_STRING(value)')
    setRuleStatus('Custom')
    setFormErr('')
    setDialogOpen(true)
  }

  const openEditDialog = (rule: EdiMappingRule) => {
    setEditingRule(rule)
    setSourceField(rule.sourceField)
    setSourcePath(rule.sourcePath)
    setEdiSegment(rule.ediSegment)
    setEdiElement(rule.ediElement)
    setEdiDescription(rule.ediDescription)
    setTransformRule(rule.transformRule)
    setRuleStatus(rule.status)
    setFormErr('')
    setDialogOpen(true)
  }

  const handleSaveRule = async () => {
    if (!sourceField.trim() || !sourcePath.trim() || !ediSegment.trim() || !ediElement.trim()) {
      setFormErr('Source field, source path, EDI segment, and EDI element are required.')
      return
    }
    try {
      if (editingRule) {
        await updateMappingRule({
          ...editingRule,
          documentType: docTypeTab,
          sourceField: sourceField.trim(),
          sourcePath: sourcePath.trim(),
          ediSegment: ediSegment.trim().toUpperCase(),
          ediElement: ediElement.trim().toUpperCase(),
          ediDescription: ediDescription.trim() || 'Standard X12 data element',
          transformRule: transformRule.trim() || 'DIRECT_STRING',
          status: ruleStatus,
        })
        pushToast({
          tone: 'success',
          title: 'Mapping Rule Updated',
          description: `${sourceField.trim()} → ${ediElement.trim().toUpperCase()} saved to SQLite.`,
        })
      } else {
        await addMappingRule({
          documentType: docTypeTab,
          sourceField: sourceField.trim(),
          sourcePath: sourcePath.trim(),
          ediSegment: ediSegment.trim().toUpperCase(),
          ediElement: ediElement.trim().toUpperCase(),
          ediDescription: ediDescription.trim() || 'Custom mapped X12 field',
          transformRule: transformRule.trim() || 'DIRECT_STRING',
          status: ruleStatus,
          required: false,
        })
        pushToast({
          tone: 'success',
          title: 'Mapping Rule Added',
          description: `${sourceField.trim()} → ${ediElement.trim().toUpperCase()} saved to SQLite.`,
        })
      }
      setDialogOpen(false)
    } catch (err) {
      setFormErr(err instanceof Error ? err.message : 'Unable to save mapping rule.')
    }
  }

  const handleCopyPreview = async () => {
    try {
      await navigator.clipboard.writeText(livePreviewX12)
      pushToast({
        tone: 'success',
        title: 'ANSI X12 Preview Copied',
        description: 'Transformation output copied to clipboard.',
      })
    } catch {
      pushToast({
        tone: 'warning',
        title: 'Clipboard Unavailable',
        description: 'Select text directly from the preview panel.',
      })
    }
  }

  const resolveSampleValue = (path: string): string => {
    if (!sampleTxn) return '—'
    const senderPartner = partners.find((p) => p.name === sampleTxn.sender)
    const receiverPartner = partners.find((p) => p.name === sampleTxn.receiver)
    switch (path) {
      case 'documentNumber':
        return sampleTxn.documentNumber
      case 'transactionDate':
        return sampleTxn.transactionDate.slice(0, 10).replace(/-/g, '')
      case 'sender.partnerCode':
        return senderPartner?.partnerCode ?? sampleTxn.sender
      case 'receiver.partnerCode':
        return receiverPartner?.partnerCode ?? sampleTxn.receiver
      case 'lineItems[].sku':
        return sampleTxn.lineItems[0]?.sku ?? '—'
      case 'lineItems[].quantity':
        return String(sampleTxn.lineItems[0]?.quantity ?? 0)
      case 'lineItems[].unitPrice':
        return formatINR(sampleTxn.lineItems[0]?.unitPrice ?? 0)
      case 'lineItems.length':
        return String(sampleTxn.lineItems.length)
      case 'referencePo':
        return sampleTxn.referencePo ?? 'N/A'
      case 'amount':
        return formatINR(sampleTxn.amount)
      default:
        return sampleTxn.summary.slice(0, 28)
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="EDI Mapping Studio"
        description="Configure illustrative business-field to ANSI X12 segment mappings and inspect live transformation output."
        badge={<Badge variant="info">ANSI X12 · 004010</Badge>}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label="Select sample transaction for preview"
              value={sampleTxn?.transactionId ?? ''}
              onChange={(e) => setSelectedTxnId(e.target.value)}
              className="h-8 max-w-[260px] rounded-control border border-[#E2E7EE] bg-white px-2.5 font-mono text-[12px] text-[#172B4D]"
            >
              {transactions.map((t) => (
                <option key={t.id} value={t.transactionId}>
                  {t.transactionId} · {t.documentNumber} ({t.documentType})
                </option>
              ))}
            </select>
            <Button variant="primary" size="sm" onClick={openAddDialog}>
              <Plus className="h-3.5 w-3.5" />
              Add Mapping Rule
            </Button>
          </div>
        }
      />

      {/* Honest Scope Disclaimer */}
      <div className="flex items-start gap-2.5 rounded-card border border-[#C5D7EE] bg-[#EFF4FB] px-4 py-3 text-[12.5px] text-[#172B4D]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#1E4E8C]" />
        <p>
          <strong>Illustrative Mapping Studio:</strong> Rules below demonstrate deterministic field-to-segment transformation for representative ANSI X12 850/810 payloads. They are illustrative MIS mappings rather than a full commercial X12 EDI compliance translator.
        </p>
      </div>

      {/* Doc Set Switcher */}
      <div className="flex items-center gap-2">
        <Button
          variant={docTypeTab === '850' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setDocTypeTab('850')}
        >
          X12 850 · Purchase Order ({mappingRules.filter((r) => r.documentType === '850').length})
        </Button>
        <Button
          variant={docTypeTab === '810' ? 'primary' : 'outline'}
          size="sm"
          onClick={() => setDocTypeTab('810')}
        >
          X12 810 · Commercial Invoice ({mappingRules.filter((r) => r.documentType === '810').length})
        </Button>
      </div>

      {/* Source Fields & Target EDI Field Summary Panels */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-5">
          <CardHeader>
            <div>
              <CardTitle>Source Document Fields</CardTitle>
              <CardDescription>
                Live values sampled from {sampleTxn?.documentNumber ?? 'selected transaction'}
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredRules.length === 0 ? (
              <p className="text-[12.5px] text-[#6B778C]">
                No custom rules configured yet for X12 {docTypeTab}. Click &ldquo;Add Mapping Rule&rdquo; to define one.
              </p>
            ) : (
              filteredRules.map((rule) => (
                <div
                  key={`src-${rule.id}`}
                  className="flex items-center justify-between gap-2 rounded-control border border-[#EDF1F5] bg-[#F9FAFB] px-3 py-2 text-[12px]"
                >
                  <div className="min-w-0">
                    <span className="block font-medium text-[#172B4D]">{rule.sourceField}</span>
                    <span className="block font-mono text-[11px] text-[#6B778C]">
                      {rule.sourcePath}
                    </span>
                  </div>
                  <span className="shrink-0 font-mono text-[11.5px] font-semibold text-[#1E4E8C]">
                    {resolveSampleValue(rule.sourcePath)}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <div className="hidden lg:col-span-2 lg:flex lg:flex-col lg:items-center lg:justify-center lg:gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-[#E2E7EE] bg-white text-[#1E4E8C]">
            <GitCompareArrows className="h-4 w-4" />
          </div>
          <span className="text-[11px] font-medium text-[#6B778C] text-center">
            X12 004010 Transform
          </span>
        </div>

        <Card className="lg:col-span-5">
          <CardHeader>
            <div>
              <CardTitle>Standardized EDI Target Elements</CardTitle>
              <CardDescription>ANSI X12 segments and element qualifiers</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {filteredRules.length === 0 ? (
              <p className="text-[12.5px] text-[#6B778C]">
                Add mapping rules to populate target X12 elements.
              </p>
            ) : (
              filteredRules.map((rule) => (
                <div
                  key={`tgt-${rule.id}`}
                  className="flex items-center justify-between gap-2 rounded-control border border-[#EDF1F5] bg-[#F9FAFB] px-3 py-2 text-[12px]"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-semibold text-[#172B4D]">
                        {rule.ediSegment}
                      </span>
                      <ArrowRight className="h-3 w-3 text-[#6B778C]" />
                      <span className="font-mono font-semibold text-[#1E4E8C]">
                        {rule.ediElement}
                      </span>
                    </div>
                    <span className="block truncate text-[11px] text-[#6B778C]">
                      {rule.ediDescription}
                    </span>
                  </div>
                  <Badge variant={rule.required ? 'success' : 'info'}>
                    {rule.required ? 'Required' : rule.status}
                  </Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Mapping Connections Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Mapping Connections ({docTypeTab})</CardTitle>
            <CardDescription>
              Add, edit, or remove field-to-segment transformation rules
            </CardDescription>
          </div>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source Field</TableHead>
              <TableHead>Source Path</TableHead>
              <TableHead>EDI Target</TableHead>
              <TableHead>Transform Rule</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredRules.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-[#6B778C]">
                  No rules defined for X12 {docTypeTab}.
                </TableCell>
              </TableRow>
            ) : (
              filteredRules.map((rule) => (
                <TableRow key={rule.id}>
                  <TableCell className="font-medium text-[#172B4D]">{rule.sourceField}</TableCell>
                  <TableCell className="font-mono text-[12px]">{rule.sourcePath}</TableCell>
                  <TableCell className="font-mono text-[12px] font-semibold text-[#1E4E8C]">
                    {rule.ediSegment} → {rule.ediElement}
                  </TableCell>
                  <TableCell className="font-mono text-[11.5px] text-[#42526E]">
                    {rule.transformRule}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        rule.status === 'Mapped'
                          ? 'success'
                          : rule.status === 'Custom'
                          ? 'info'
                          : 'warning'
                      }
                    >
                      {rule.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(rule)}
                        aria-label={`Edit ${rule.sourceField}`}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={rule.required}
                        onClick={async () => {
                          try {
                            await deleteMappingRule(rule.id)
                            pushToast({
                              tone: 'info',
                              title: 'Mapping Deleted',
                              description: `Removed ${rule.sourceField} mapping.`,
                            })
                          } catch (err) {
                            pushToast({
                              tone: 'danger',
                              title: 'Delete Failed',
                              description: err instanceof Error ? err.message : 'Cannot delete mapping.',
                            })
                          }
                        }}
                        aria-label={`Delete ${rule.sourceField}`}
                        className="hover:text-[#D9534F]"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      {/* Live ANSI X12 Transformation Output */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>
              Representative ANSI X12 {sampleTxn?.documentType ?? '850'} Transformation Output
            </CardTitle>
            <CardDescription>
              Live generated output for {sampleTxn?.documentNumber ?? 'PO'} incorporating active custom rules
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleCopyPreview}>
            <Copy className="h-3.5 w-3.5" />
            Copy X12 Output
          </Button>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-4 font-mono text-[12px] leading-6 text-[#172B4D]">
            {livePreviewX12}
          </pre>
        </CardContent>
      </Card>

      {/* Add/Edit Mapping Modal */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingRule ? 'Edit Mapping Rule' : 'Add Mapping Rule'}</DialogTitle>
            <DialogDescription>
              Map a business document field to an ANSI X12 {docTypeTab} segment element.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3">
            {formErr ? (
              <div className="rounded-control border border-[#F3C2C0] bg-[#FDF1F1] px-3 py-2 text-[12px] text-[#D9534F]">
                {formErr}
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="map-src-field" className="mb-1 block text-[12px] font-medium">
                  Source Field Name *
                </label>
                <Input
                  id="map-src-field"
                  value={sourceField}
                  onChange={(e) => setSourceField(e.target.value)}
                  placeholder="Buyer GSTIN"
                />
              </div>
              <div>
                <label htmlFor="map-src-path" className="mb-1 block text-[12px] font-medium">
                  Source JSON Path *
                </label>
                <Input
                  id="map-src-path"
                  value={sourcePath}
                  onChange={(e) => setSourcePath(e.target.value)}
                  className="font-mono"
                  placeholder="buyer.gstin"
                />
              </div>
              <div>
                <label htmlFor="map-seg" className="mb-1 block text-[12px] font-medium">
                  EDI Segment *
                </label>
                <Input
                  id="map-seg"
                  value={ediSegment}
                  onChange={(e) => setEdiSegment(e.target.value)}
                  className="font-mono"
                  placeholder="REF"
                />
              </div>
              <div>
                <label htmlFor="map-elem" className="mb-1 block text-[12px] font-medium">
                  EDI Element *
                </label>
                <Input
                  id="map-elem"
                  value={ediElement}
                  onChange={(e) => setEdiElement(e.target.value)}
                  className="font-mono"
                  placeholder="REF02"
                />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="map-desc" className="mb-1 block text-[12px] font-medium">
                  Element Description
                </label>
                <Input
                  id="map-desc"
                  value={ediDescription}
                  onChange={(e) => setEdiDescription(e.target.value)}
                  placeholder="Tax registration reference"
                />
              </div>
              <div>
                <label htmlFor="map-rule" className="mb-1 block text-[12px] font-medium">
                  Transform Expression
                </label>
                <Input
                  id="map-rule"
                  value={transformRule}
                  onChange={(e) => setTransformRule(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div>
                <label htmlFor="map-status" className="mb-1 block text-[12px] font-medium">
                  Rule Status
                </label>
                <select
                  id="map-status"
                  value={ruleStatus}
                  onChange={(e) => setRuleStatus(e.target.value as EdiMappingRule['status'])}
                  className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-3 text-[13px]"
                >
                  <option value="Mapped">Mapped</option>
                  <option value="Conditional">Conditional</option>
                  <option value="Custom">Custom</option>
                </select>
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSaveRule}>
              Save Rule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

