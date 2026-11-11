import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Download,
  Eye,
  FilePlus2,
  RotateCcw,
  Search,
  Workflow,
} from 'lucide-react'
import { DocTypeBadge } from '@/components/shared/DocTypeBadge'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useToast } from '@/components/shared/ToastProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
import { ediApi } from '@/lib/api'
import { downloadCsv } from '@/lib/csv'
import { DOC_TYPE_META, formatDateTime, formatINR, formatShortDate } from '@/lib/format'
import type { TransactionRecord } from '@/types/edi'

type SortField = 'transactionId' | 'documentType' | 'sender' | 'transactionDate' | 'amount' | 'status'
type SortDir = 'asc' | 'desc'

interface TransactionsPageProps {
  globalSearch: string
}

export function TransactionsPage({ globalSearch }: TransactionsPageProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { transactions, partners, backendConnected } = useEdiStore()
  const { pushToast } = useToast()

  const [searchText, setSearchText] = useState(searchParams.get('q') ?? '')
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') ?? 'ALL')
  const [docTypeFilter, setDocTypeFilter] = useState<string>('ALL')
  const [partnerFilter, setPartnerFilter] = useState<string>('ALL')
  const [sortField, setSortField] = useState<SortField>('transactionDate')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)
  const [selectedDetail, setSelectedDetail] = useState<TransactionRecord | null>(null)

  useEffect(() => {
    const paramQ = searchParams.get('q')
    const paramStatus = searchParams.get('status')
    if (paramQ !== null) setSearchText(paramQ)
    if (paramStatus !== null) setStatusFilter(paramStatus)
  }, [searchParams])

  const effectiveQuery = (searchText || globalSearch).trim().toLowerCase()

  const filteredAndSorted = useMemo(() => {
    const filtered = transactions.filter((t) => {
      const matchesStatus = statusFilter === 'ALL' || t.status === statusFilter
      const matchesDocType = docTypeFilter === 'ALL' || t.documentType === docTypeFilter
      const matchesPartner =
        partnerFilter === 'ALL' || t.sender === partnerFilter || t.receiver === partnerFilter
      const docMeta = DOC_TYPE_META[t.documentType]
      const matchesSearch =
        !effectiveQuery ||
        t.transactionId.toLowerCase().includes(effectiveQuery) ||
        t.documentNumber.toLowerCase().includes(effectiveQuery) ||
        t.sender.toLowerCase().includes(effectiveQuery) ||
        t.receiver.toLowerCase().includes(effectiveQuery) ||
        t.documentType.toLowerCase().includes(effectiveQuery) ||
        docMeta.label.toLowerCase().includes(effectiveQuery) ||
        docMeta.short.toLowerCase().includes(effectiveQuery) ||
        t.summary.toLowerCase().includes(effectiveQuery)

      return matchesStatus && matchesDocType && matchesPartner && matchesSearch
    })

    const sorted = [...filtered].sort((a, b) => {
      let cmp = 0
      if (sortField === 'amount') {
        cmp = a.amount - b.amount
      } else if (sortField === 'transactionDate') {
        cmp = new Date(a.transactionDate).getTime() - new Date(b.transactionDate).getTime()
      } else {
        cmp = String(a[sortField]).localeCompare(String(b[sortField]))
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return sorted
  }, [transactions, statusFilter, docTypeFilter, partnerFilter, effectiveQuery, sortField, sortDir])

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / pageSize))
  const safePage = Math.min(page, totalPages)
  const paginatedRows = useMemo(() => {
    const start = (safePage - 1) * pageSize
    return filteredAndSorted.slice(start, start + pageSize)
  }, [filteredAndSorted, safePage, pageSize])

  const toggleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortField(field)
      setSortDir(field === 'amount' || field === 'transactionDate' ? 'desc' : 'asc')
    }
    setPage(1)
  }

  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-[#94A3B8]" />
    return sortDir === 'asc' ? (
      <ArrowUp className="h-3 w-3 text-[#172B4D]" />
    ) : (
      <ArrowDown className="h-3 w-3 text-[#172B4D]" />
    )
  }

  const handleResetFilters = () => {
    setSearchText('')
    setStatusFilter('ALL')
    setDocTypeFilter('ALL')
    setPartnerFilter('ALL')
    setPage(1)
  }

  const handleExportCsv = () => {
    if (backendConnected) {
      const url = ediApi.getReportsExportUrl({
        status: statusFilter,
        doc_type: docTypeFilter,
        partner: partnerFilter,
        search: effectiveQuery || undefined,
      })
      window.location.assign(url)
      pushToast({
        tone: 'success',
        title: 'CSV Export Requested',
        description: `Downloading ${filteredAndSorted.length} record(s) directly from SQLite backend.`,
      })
      return
    }
    downloadCsv(
      `edi-nexus-transactions-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Transaction ID',
        'Document Number',
        'Document Type',
        'Sender',
        'Receiver',
        'Document Date',
        'Amount (INR)',
        'Status',
        'Ack Status',
        'Reference PO',
        'Exception Reason',
      ],
      filteredAndSorted.map((t) => [
        t.transactionId,
        t.documentNumber,
        `${t.documentType} (${DOC_TYPE_META[t.documentType].label})`,
        t.sender,
        t.receiver,
        formatShortDate(t.transactionDate),
        t.amount,
        t.status,
        t.ackStatus,
        t.referencePo ?? '',
        t.exceptionReason ?? '',
      ])
    )
    pushToast({
      tone: 'success',
      title: 'CSV Export Downloaded',
      description: `Exported ${filteredAndSorted.length} filtered transaction record(s).`,
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Transaction Register"
        description="Searchable operational ledger of Purchase Orders (850), Acknowledgements (855), Invoices (810), and ASNs (856)."
        badge={<Badge variant="neutral">{filteredAndSorted.length} matching records</Badge>}
        actions={
          <>
            <Button variant="outline" size="sm" onClick={handleExportCsv}>
              <Download className="h-3.5 w-3.5" />
              Export CSV
            </Button>
            <Button variant="primary" size="sm" onClick={() => navigate('/create-document')}>
              <FilePlus2 className="h-3.5 w-3.5" />
              Create Document
            </Button>
          </>
        }
      />

      {/* Filter Toolbar */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="relative md:col-span-5">
            <label htmlFor="txn-search" className="sr-only">
              Search transactions
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B778C]" />
            <Input
              id="txn-search"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value)
                setPage(1)
              }}
              placeholder="Search by TXN ID, doc number, company, or type..."
              className="pl-9"
            />
          </div>

          <div className="md:col-span-2">
            <label htmlFor="filter-status" className="sr-only">
              Filter by status
            </label>
            <select
              id="filter-status"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value)
                setPage(1)
              }}
              className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-2.5 text-[13px] text-[#172B4D] focus:border-[#1E4E8C] focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="Accepted">Accepted</option>
              <option value="Pending">Pending</option>
              <option value="Processing">Processing</option>
              <option value="Rejected">Rejected</option>
              <option value="Draft">Draft</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="filter-doctype" className="sr-only">
              Filter by document type
            </label>
            <select
              id="filter-doctype"
              value={docTypeFilter}
              onChange={(e) => {
                setDocTypeFilter(e.target.value)
                setPage(1)
              }}
              className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-2.5 text-[13px] text-[#172B4D] focus:border-[#1E4E8C] focus:outline-none"
            >
              <option value="ALL">All Doc Types</option>
              <option value="850">850 · Purchase Order</option>
              <option value="855">855 · Acknowledgement</option>
              <option value="810">810 · Invoice</option>
              <option value="856">856 · Shipping Notice</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="filter-partner" className="sr-only">
              Filter by partner
            </label>
            <select
              id="filter-partner"
              value={partnerFilter}
              onChange={(e) => {
                setPartnerFilter(e.target.value)
                setPage(1)
              }}
              className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-2.5 text-[13px] text-[#172B4D] focus:border-[#1E4E8C] focus:outline-none"
            >
              <option value="ALL">All Partners</option>
              {partners.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end md:col-span-1">
            <Button
              type="button"
              variant="outline"
              size="md"
              onClick={handleResetFilters}
              title="Reset all filters"
              className="w-full"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </Card>

      {/* Register Data Table */}
      <Card>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-[#F9FAFB]">
              <TableHead className="px-3">
                <button
                  type="button"
                  onClick={() => toggleSort('transactionId')}
                  className="inline-flex items-center gap-1 font-semibold uppercase hover:text-[#172B4D]"
                >
                  Transaction ID {renderSortIcon('transactionId')}
                </button>
              </TableHead>
              <TableHead className="px-2.5">
                <button
                  type="button"
                  onClick={() => toggleSort('documentType')}
                  className="inline-flex items-center gap-1 font-semibold uppercase hover:text-[#172B4D]"
                >
                  Doc Type {renderSortIcon('documentType')}
                </button>
              </TableHead>
              <TableHead className="px-2.5">
                <button
                  type="button"
                  onClick={() => toggleSort('sender')}
                  className="inline-flex items-center gap-1 font-semibold uppercase hover:text-[#172B4D]"
                >
                  Sender {renderSortIcon('sender')}
                </button>
              </TableHead>
              <TableHead className="px-2.5">Receiver</TableHead>
              <TableHead className="px-2.5">
                <button
                  type="button"
                  onClick={() => toggleSort('transactionDate')}
                  className="inline-flex items-center gap-1 font-semibold uppercase hover:text-[#172B4D]"
                >
                  Date {renderSortIcon('transactionDate')}
                </button>
              </TableHead>
              <TableHead className="px-2.5 text-right">
                <button
                  type="button"
                  onClick={() => toggleSort('amount')}
                  className="inline-flex items-center justify-end gap-1 font-semibold uppercase hover:text-[#172B4D]"
                >
                  Amount {renderSortIcon('amount')}
                </button>
              </TableHead>
              <TableHead className="px-2.5">
                <button
                  type="button"
                  onClick={() => toggleSort('status')}
                  className="inline-flex items-center gap-1 font-semibold uppercase hover:text-[#172B4D]"
                >
                  Status {renderSortIcon('status')}
                </button>
              </TableHead>
              <TableHead className="px-3 text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginatedRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} className="py-12 text-center">
                  <p className="text-[13.5px] font-medium text-[#172B4D]">
                    No transactions match the selected criteria
                  </p>
                  <p className="mt-1 text-[12.5px] text-[#6B778C]">
                    Adjust search terms or reset filters to view all ledger records.
                  </p>
                  <Button variant="outline" size="sm" className="mt-3" onClick={handleResetFilters}>
                    Reset Filters
                  </Button>
                </TableCell>
              </TableRow>
            ) : (
              paginatedRows.map((txn) => (
                <TableRow key={txn.id}>
                  <TableCell className="px-3 py-2.5 whitespace-nowrap">
                    <div className="font-mono text-[12.5px] font-semibold text-[#172B4D]">
                      {txn.transactionId}
                    </div>
                    <div className="text-[11.5px] text-[#6B778C]">{txn.documentNumber}</div>
                  </TableCell>
                  <TableCell className="px-2.5 py-2.5 whitespace-nowrap" title={DOC_TYPE_META[txn.documentType].label}>
                    <DocTypeBadge code={txn.documentType} />
                  </TableCell>
                  <TableCell className="px-2.5 py-2.5 font-medium text-[#172B4D] whitespace-nowrap">
                    {txn.sender}
                  </TableCell>
                  <TableCell className="px-2.5 py-2.5 whitespace-nowrap">{txn.receiver}</TableCell>
                  <TableCell className="px-2.5 py-2.5 whitespace-nowrap text-[12.5px] tabular-nums">
                    {formatShortDate(txn.transactionDate)}
                  </TableCell>
                  <TableCell className="px-2.5 py-2.5 text-right font-mono text-[12.5px] font-semibold text-[#172B4D] tabular-nums whitespace-nowrap">
                    {formatINR(txn.amount)}
                  </TableCell>
                  <TableCell className="px-2.5 py-2.5 whitespace-nowrap">
                    <StatusBadge status={txn.status} />
                  </TableCell>
                  <TableCell className="px-3 py-2.5 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-[12px]"
                        onClick={() => setSelectedDetail(txn)}
                        aria-label={`View details for ${txn.transactionId}`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        Details
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-[12px]"
                        onClick={() => navigate(`/processing/${txn.transactionId}`)}
                      >
                        <Workflow className="h-3.5 w-3.5" />
                        Process
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {/* Pagination Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EDF1F5] bg-[#F9FAFB] px-4 py-3 text-[12.5px] text-[#42526E]">
          <div className="flex items-center gap-2">
            <span>Rows per page:</span>
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value))
                setPage(1)
              }}
              className="h-7 rounded-control border border-[#E2E7EE] bg-white px-2 text-[12px] text-[#172B4D]"
            >
              <option value={8}>8</option>
              <option value={12}>12</option>
              <option value={25}>25</option>
            </select>
            <span className="ml-2 tabular-nums">
              {filteredAndSorted.length === 0
                ? '0 results'
                : `Showing ${(safePage - 1) * pageSize + 1}–${Math.min(
                    safePage * pageSize,
                    filteredAndSorted.length
                  )} of ${filteredAndSorted.length}`}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="sm"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <span className="px-2 font-medium text-[#172B4D] tabular-nums">
              Page {safePage} of {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      </Card>

      {/* Transaction Quick Detail Modal */}
      <Dialog open={Boolean(selectedDetail)} onOpenChange={(open) => !open && setSelectedDetail(null)}>
        <DialogContent>
          {selectedDetail ? (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center gap-2">
                  <DialogTitle className="font-mono">{selectedDetail.transactionId}</DialogTitle>
                  <DocTypeBadge code={selectedDetail.documentType} showFullLabel />
                  <StatusBadge status={selectedDetail.status} />
                </div>
                <DialogDescription>
                  Document {selectedDetail.documentNumber} · {formatDateTime(selectedDetail.transactionDate)}
                </DialogDescription>
              </DialogHeader>
              <DialogBody className="space-y-4">
                <div className="grid grid-cols-2 gap-3 rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-3.5 text-[12.5px] sm:grid-cols-3">
                  <div>
                    <span className="block text-[11px] text-[#6B778C]">Sender</span>
                    <span className="font-semibold text-[#172B4D]">{selectedDetail.sender}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-[#6B778C]">Receiver</span>
                    <span className="font-semibold text-[#172B4D]">{selectedDetail.receiver}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-[#6B778C]">Acknowledgement</span>
                    <span className="font-semibold text-[#172B4D]">{selectedDetail.ackStatus}</span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-[#6B778C]">Reference PO</span>
                    <span className="font-mono text-[#172B4D]">
                      {selectedDetail.referencePo ?? '—'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-[#6B778C]">Grand Total</span>
                    <span className="font-mono font-semibold text-[#172B4D] tabular-nums">
                      {formatINR(selectedDetail.amount)}
                    </span>
                  </div>
                  <div>
                    <span className="block text-[11px] text-[#6B778C]">Validation Checks</span>
                    <span className="font-medium text-[#172B4D]">
                      {selectedDetail.validationResults.filter((c) => c.status === 'pass').length}/
                      {selectedDetail.validationResults.length} passed
                    </span>
                  </div>
                </div>

                {selectedDetail.exceptionReason ? (
                  <div className="rounded-control border border-[#F3C2C0] bg-[#FDF1F1] p-3 text-[12.5px] text-[#D9534F]">
                    <span className="font-semibold">Exception: </span>
                    {selectedDetail.exceptionReason}
                  </div>
                ) : null}

                <div>
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#6B778C]">
                    Line Items
                  </p>
                  <div className="rounded-control border border-[#E2E7EE] overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>SKU</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Unit Price</TableHead>
                          <TableHead className="text-right">Total</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedDetail.lineItems.map((item) => (
                          <TableRow key={item.id}>
                            <TableCell className="font-mono text-[12px]">{item.sku}</TableCell>
                            <TableCell>{item.description}</TableCell>
                            <TableCell className="text-right tabular-nums">{item.quantity}</TableCell>
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
                  </div>
                </div>
              </DialogBody>
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setSelectedDetail(null)}>
                  Close
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => {
                    const id = selectedDetail.transactionId
                    setSelectedDetail(null)
                    navigate(`/processing/${id}`)
                  }}
                >
                  <Workflow className="h-3.5 w-3.5" />
                  Open Document Processing
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  )
}

