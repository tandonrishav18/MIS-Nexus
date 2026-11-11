import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart3, Download, RotateCcw, Workflow } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { DocTypeBadge } from '@/components/shared/DocTypeBadge'
import { PageHeader } from '@/components/shared/PageHeader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useToast } from '@/components/shared/ToastProvider'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
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
import {
  deriveDashboardMetrics,
  deriveDocDistribution,
  derivePartnerActivity,
  deriveVolumeTrend,
} from '@/data/demoDashboardData'
import { ediApi, type ReportsSummaryResponse } from '@/lib/api'
import { downloadCsv } from '@/lib/csv'
import { DOC_TYPE_META, formatINR, formatINRCompact, formatShortDate } from '@/lib/format'
import type { PartnerActivityItem, TransactionRecord } from '@/types/edi'

export function ReportsPage() {
  const navigate = useNavigate()
  const { transactions, partners, backendConnected } = useEdiStore()
  const { pushToast } = useToast()

  const [fromDate, setFromDate] = useState('')
  const [toDate, setToDate] = useState('')
  const [apiSummary, setApiSummary] = useState<ReportsSummaryResponse | null>(null)
  const [apiPartners, setApiPartners] = useState<PartnerActivityItem[] | null>(null)
  const [apiExceptions, setApiExceptions] = useState<TransactionRecord[] | null>(null)

  useEffect(() => {
    if (!backendConnected) return
    let cancelled = false
    const f = fromDate || undefined
    const t = toDate || undefined
    Promise.all([
      ediApi.getReportsSummary(f, t),
      ediApi.getReportsPartners(f, t),
      ediApi.getReportsExceptions(f, t),
    ])
      .then(([sum, pList, exList]) => {
        if (cancelled) return
        setApiSummary(sum)
        setApiPartners(pList)
        setApiExceptions(exList)
      })
      .catch(() => {
        // Fallback to local filter slice if transient request error occurs
      })
    return () => {
      cancelled = true
    }
  }, [backendConnected, transactions, fromDate, toDate])

  const filteredTxns = useMemo(() => {
    return transactions.filter((t) => {
      const dateStr = t.transactionDate.slice(0, 10)
      if (fromDate && dateStr < fromDate) return false
      if (toDate && dateStr > toDate) return false
      return true
    })
  }, [transactions, fromDate, toDate])

  const fallbackMetrics = useMemo(() => deriveDashboardMetrics(filteredTxns), [filteredTxns])
  const metrics = apiSummary ?? fallbackMetrics
  const volumeTrend = useMemo(
    () => apiSummary?.volumeTrend ?? deriveVolumeTrend(filteredTxns),
    [apiSummary, filteredTxns]
  )
  const docDist = useMemo(
    () => apiSummary?.docDistribution ?? deriveDocDistribution(filteredTxns),
    [apiSummary, filteredTxns]
  )
  const partnerPerf = useMemo(
    () => apiPartners ?? derivePartnerActivity(partners, filteredTxns),
    [apiPartners, partners, filteredTxns]
  )

  const statusDist = useMemo(
    () => [
      { status: 'Accepted', count: metrics.acceptedDocuments, color: '#168568' },
      { status: 'Pending', count: metrics.pendingTransactions, color: '#D69A35' },
      { status: 'Rejected', count: metrics.rejectedDocuments, color: '#D9534F' },
    ],
    [metrics]
  )

  const exceptions = useMemo(
    () =>
      apiExceptions ??
      filteredTxns.filter((t) => t.status === 'Rejected' || Boolean(t.exceptionReason)),
    [apiExceptions, filteredTxns]
  )

  const handleExportReportCsv = () => {
    if (backendConnected) {
      const url = ediApi.getReportsExportUrl({
        from_date: fromDate || undefined,
        to_date: toDate || undefined,
      })
      window.location.assign(url)
      pushToast({
        tone: 'success',
        title: 'Analytics CSV Export Requested',
        description: `Downloading ${metrics.totalTransactions} database record(s).`,
      })
      return
    }
    downloadCsv(
      `edi-nexus-analytics-${new Date().toISOString().slice(0, 10)}.csv`,
      [
        'Transaction ID',
        'Document Number',
        'Document Type',
        'Sender',
        'Receiver',
        'Date',
        'Subtotal (INR)',
        'Tax (INR)',
        'Total (INR)',
        'Status',
        'Ack Status',
        'Exception Detail',
      ],
      filteredTxns.map((t) => [
        t.transactionId,
        t.documentNumber,
        `${t.documentType} - ${DOC_TYPE_META[t.documentType].label}`,
        t.sender,
        t.receiver,
        formatShortDate(t.transactionDate),
        t.subtotal,
        t.taxAmount,
        t.amount,
        t.status,
        t.ackStatus,
        t.exceptionReason ?? '',
      ])
    )
    pushToast({
      tone: 'success',
      title: 'Analytics CSV Exported',
      description: `Downloaded ${filteredTxns.length} transaction record(s) matching selected date range.`,
    })
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Reports & Analytics"
        description="Operational metrics, partner performance comparisons, exception summaries, and CSV reporting."
        badge={<Badge variant="neutral">{filteredTxns.length} transactions in range</Badge>}
        actions={
          <Button variant="primary" size="sm" onClick={handleExportReportCsv}>
            <Download className="h-3.5 w-3.5" />
            Export CSV Report
          </Button>
        }
      />

      {/* Date Range Filter */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label htmlFor="rpt-from" className="mb-1 block text-[11.5px] font-medium text-[#6B778C]">
              From Date
            </label>
            <Input
              id="rpt-from"
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="w-[170px]"
            />
          </div>
          <div>
            <label htmlFor="rpt-to" className="mb-1 block text-[11.5px] font-medium text-[#6B778C]">
              To Date
            </label>
            <Input
              id="rpt-to"
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="w-[170px]"
            />
          </div>
          <Button
            variant="outline"
            size="md"
            onClick={() => {
              setFromDate('')
              setToDate('')
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Clear Dates
          </Button>

          <div className="ml-auto flex flex-wrap gap-5 text-[12.5px] tabular-nums">
            <div>
              <span className="block text-[11px] text-[#6B778C]">Total Value</span>
              <span className="font-mono font-semibold text-[#172B4D]">
                {formatINRCompact(metrics.totalVolumeAmount)}
              </span>
            </div>
            <div>
              <span className="block text-[11px] text-[#6B778C]">Acceptance Rate</span>
              <span className="font-semibold text-[#168568]">{metrics.acceptanceRate}%</span>
            </div>
            <div>
              <span className="block text-[11px] text-[#6B778C]">Exceptions</span>
              <span className="font-semibold text-[#D9534F]">{exceptions.length}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <div>
              <CardTitle>Transaction Volume Trend</CardTitle>
              <CardDescription>Daily count and status split across selected dates</CardDescription>
            </div>
            <BarChart3 className="h-4 w-4 text-[#6B778C]" />
          </CardHeader>
          <CardContent>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeTrend} barSize={22} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF1F5" />
                  <XAxis dataKey="dateLabel" tick={{ fontSize: 11, fill: '#6B778C' }} axisLine={{ stroke: '#E2E7EE' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B778C' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E7EE',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="accepted" name="Accepted" stackId="a" fill="#168568" isAnimationActive={false} />
                  <Bar dataKey="exceptions" name="Pending / Rejected" stackId="a" fill="#D69A35" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <div>
              <CardTitle>Acceptance vs Rejection Distribution</CardTitle>
              <CardDescription>Outcome breakdown for {filteredTxns.length} documents</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={statusDist} barSize={36} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF1F5" />
                  <XAxis dataKey="status" tick={{ fontSize: 12, fill: '#172B4D' }} axisLine={{ stroke: '#E2E7EE' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B778C' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E7EE',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" name="Documents" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                    {statusDist.map((entry) => (
                      <Cell key={entry.status} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2: Partner Comparison & Document Type Distribution */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <div>
              <CardTitle>Partner Performance Comparison</CardTitle>
              <CardDescription>Accepted interchanges vs rejected exceptions by trading partner</CardDescription>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-[230px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={partnerPerf} barSize={20} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF1F5" />
                  <XAxis dataKey="partnerName" tick={{ fontSize: 11.5, fill: '#172B4D' }} axisLine={{ stroke: '#E2E7EE' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B778C' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E7EE',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  />
                  <Legend wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="acceptedCount" name="Accepted" fill="#168568" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="rejectedCount" name="Rejected" fill="#D9534F" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <div>
              <CardTitle>Document-Type Distribution</CardTitle>
              <CardDescription>Volume share across X12 message sets</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="h-[130px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={docDist} barSize={28} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF1F5" />
                  <XAxis dataKey="code" tick={{ fontSize: 12, fill: '#172B4D', fontWeight: 600 }} axisLine={{ stroke: '#E2E7EE' }} tickLine={false} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B778C' }} axisLine={false} tickLine={false} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E7EE',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  />
                  <Bar dataKey="count" name="Count" fill="#1E4E8C" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="divide-y divide-[#EDF1F5] border-t border-[#EDF1F5] pt-1 text-[12.5px]">
              {docDist.map((d) => (
                <div key={d.code} className="flex items-center justify-between py-1.5">
                  <span className="font-medium text-[#172B4D]">{d.label}</span>
                  <span className="font-mono tabular-nums text-[#42526E]">
                    {d.count} ({d.sharePct}%)
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Exception Summary Table */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle>Processing Exception Summary</CardTitle>
            <CardDescription>
              Rejected interchanges and financial mismatches requiring operator resolution
            </CardDescription>
          </div>
          <Badge variant={exceptions.length > 0 ? 'danger' : 'success'}>
            {exceptions.length} exception(s)
          </Badge>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Transaction ID</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Sender → Receiver</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Exception Detail</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="text-right">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {exceptions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="py-8 text-center text-[#6B778C]">
                  No active validation exceptions in the selected date range.
                </TableCell>
              </TableRow>
            ) : (
              exceptions.map((ex) => (
                <TableRow key={ex.id}>
                  <TableCell className="whitespace-nowrap">
                    <div className="font-mono text-[12px] font-semibold text-[#172B4D]">
                      {ex.transactionId}
                    </div>
                    <div className="text-[11px] text-[#6B778C]">{ex.documentNumber}</div>
                  </TableCell>
                  <TableCell>
                    <DocTypeBadge code={ex.documentType} />
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-[12.5px]">
                    {ex.sender} → {ex.receiver}
                  </TableCell>
                  <TableCell className="text-right font-mono font-semibold text-[#172B4D] tabular-nums whitespace-nowrap">
                    {formatINR(ex.amount)}
                  </TableCell>
                  <TableCell className="max-w-md text-[12px] text-[#D9534F]">
                    {ex.exceptionReason ?? ex.summary}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={ex.status} />
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/processing/${ex.transactionId}`)}
                    >
                      <Workflow className="h-3.5 w-3.5" />
                      Resolve
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  )
}

