import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  FileCheck2,
  FilePlus2,
  Sparkles,
  XCircle,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { PageHeader } from '@/components/shared/PageHeader'
import { KpiCard } from '@/components/shared/KpiCard'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { DocTypeBadge } from '@/components/shared/DocTypeBadge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  deriveAiBusinessInsights,
  deriveDashboardMetrics,
  deriveDocDistribution,
  derivePartnerActivity,
  derivePendingAckAlerts,
  deriveVolumeTrend,
} from '@/data/demoDashboardData'
import { useEdiStore } from '@/context/EdiStoreContext'
import { ediApi, type DashboardSummaryResponse } from '@/lib/api'
import { formatINR, formatINRCompact, formatShortDate } from '@/lib/format'
import type { DocDistributionItem, VolumeTrendPoint } from '@/types/edi'
import { cn } from '@/lib/utils'

const DOC_BAR_COLORS: Record<string, string> = {
  '850': '#172B4D',
  '855': '#168568',
  '810': '#1E4E8C',
  '856': '#6B778C',
}

interface DashboardPageProps {
  globalSearch: string
}

export function DashboardPage({ globalSearch }: DashboardPageProps) {
  const navigate = useNavigate()
  const { transactions, partners, backendConnected } = useEdiStore()
  const [partnerFilter, setPartnerFilter] = useState<string>('ALL')
  const [apiSummary, setApiSummary] = useState<DashboardSummaryResponse | null>(null)
  const [apiTrends, setApiTrends] = useState<VolumeTrendPoint[] | null>(null)
  const [apiDist, setApiDist] = useState<DocDistributionItem[] | null>(null)

  useEffect(() => {
    if (!backendConnected) return
    let cancelled = false
    const pParam = partnerFilter === 'ALL' ? undefined : partnerFilter
    const qParam = globalSearch.trim() || undefined

    Promise.all([
      ediApi.getDashboardSummary(pParam, qParam),
      ediApi.getDashboardTrends(pParam, qParam),
      ediApi.getDocumentDistribution(pParam, qParam),
    ])
      .then(([sum, tr, dist]) => {
        if (cancelled) return
        setApiSummary(sum)
        setApiTrends(tr)
        setApiDist(dist)
      })
      .catch(() => {
        // Handled cleanly via local derived metrics fallback on transient error
      })

    return () => {
      cancelled = true
    }
  }, [backendConnected, transactions, partnerFilter, globalSearch])

  const scopedTransactions = useMemo(() => {
    const q = globalSearch.trim().toLowerCase()
    return transactions.filter((t) => {
      const matchesPartner =
        partnerFilter === 'ALL' || t.sender === partnerFilter || t.receiver === partnerFilter
      const matchesSearch =
        !q ||
        t.transactionId.toLowerCase().includes(q) ||
        t.documentNumber.toLowerCase().includes(q) ||
        t.sender.toLowerCase().includes(q) ||
        t.receiver.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q)
      return matchesPartner && matchesSearch
    })
  }, [transactions, partnerFilter, globalSearch])

  const fallbackMetrics = useMemo(
    () => deriveDashboardMetrics(scopedTransactions),
    [scopedTransactions]
  )
  const metrics = apiSummary ?? fallbackMetrics

  const volumeTrend = useMemo(
    () => apiTrends ?? deriveVolumeTrend(scopedTransactions),
    [apiTrends, scopedTransactions]
  )
  const docDistribution = useMemo(
    () => apiDist ?? deriveDocDistribution(scopedTransactions),
    [apiDist, scopedTransactions]
  )
  const partnerActivity = useMemo(
    () => apiSummary?.partnerActivity ?? derivePartnerActivity(partners, scopedTransactions),
    [apiSummary, partners, scopedTransactions]
  )
  const pendingAlerts = useMemo(
    () => apiSummary?.pendingAlerts ?? derivePendingAckAlerts(scopedTransactions),
    [apiSummary, scopedTransactions]
  )
  const insights = useMemo(
    () => apiSummary?.insights ?? deriveAiBusinessInsights(scopedTransactions),
    [apiSummary, scopedTransactions]
  )

  const recentTransactions = scopedTransactions.slice(0, 6)

  return (
    <div className="space-y-5">
      <PageHeader
        title="Executive Dashboard"
        description="Centralized visibility into B2B EDI document flow, validation exceptions, and partner acknowledgements."
        badge={
          <Badge variant={backendConnected ? 'success' : 'warning'}>
            {backendConnected ? 'SQLite Live Demo Dataset' : 'API Disconnected'}
          </Badge>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="partner-scope" className="sr-only">
              Filter by trading partner
            </label>
            <select
              id="partner-scope"
              value={partnerFilter}
              onChange={(e) => setPartnerFilter(e.target.value)}
              className="h-8 max-w-[200px] rounded-control border border-[#E2E7EE] bg-white px-2.5 text-[12.5px] font-medium text-[#172B4D] focus:border-[#1E4E8C] focus:outline-none"
            >
              <option value="ALL">All Trading Partners</option>
              {partners.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name} ({p.role})
                </option>
              ))}
            </select>
            <Button size="sm" variant="outline" onClick={() => navigate('/transactions')}>
              View Register
            </Button>
            <Button size="sm" variant="primary" onClick={() => navigate('/create-document')}>
              <FilePlus2 className="h-3.5 w-3.5" />
              Create Document
            </Button>
          </div>
        }
      />

      {/* Row 1: 4 Primary KPIs */}
      <section aria-label="Key performance indicators" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Total Transactions"
          value={metrics.totalTransactions}
          meta={`Cumulative value ${formatINRCompact(metrics.totalVolumeAmount)}`}
          icon={Activity}
          tone="default"
        />
        <KpiCard
          label="Accepted Documents"
          value={metrics.acceptedDocuments}
          meta={`${metrics.acceptanceRate}% straight-through acceptance`}
          icon={CheckCircle2}
          tone="success"
        />
        <KpiCard
          label="Pending Transactions"
          value={metrics.pendingTransactions}
          meta="Awaiting supplier 855 acknowledgement"
          icon={Clock}
          tone="warning"
        />
        <KpiCard
          label="Rejected Documents"
          value={metrics.rejectedDocuments}
          meta="Requires exception review & correction"
          icon={XCircle}
          tone="danger"
        />
      </section>

      {/* Row 2: Volume Trend + Document Type Distribution */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-7">
          <CardHeader>
            <div>
              <CardTitle>Transaction Volume Trend</CardTitle>
              <CardDescription>
                Daily EDI document throughput across accepted and exception states
              </CardDescription>
            </div>
            <div className="flex items-center gap-3 text-[11.5px] text-[#6B778C]">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[2px] bg-[#168568]" />
                Accepted
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-[2px] bg-[#D69A35]" />
                Pending / Rejected
              </span>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            <div className="h-[240px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={volumeTrend} barSize={22} margin={{ top: 6, right: 8, left: -16, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#EDF1F5" />
                  <XAxis
                    dataKey="dateLabel"
                    tick={{ fontSize: 11, fill: '#6B778C' }}
                    axisLine={{ stroke: '#E2E7EE' }}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 11, fill: '#6B778C' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#F9FAFB' }}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E7EE',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#172B4D',
                    }}
                    formatter={(value: number, name: string) => [
                      value,
                      name === 'accepted' ? 'Accepted' : 'Pending / Rejected',
                    ]}
                  />
                  <Bar dataKey="accepted" stackId="a" fill="#168568" radius={[0, 0, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="exceptions" stackId="a" fill="#D69A35" radius={[3, 3, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="lg:col-span-5">
          <CardHeader>
            <div>
              <CardTitle>Document Type Distribution</CardTitle>
              <CardDescription>
                Breakdown across ANSI X12 850, 855, 810, and 856 messages
              </CardDescription>
            </div>
            <FileCheck2 className="h-4 w-4 text-[#6B778C]" />
          </CardHeader>
          <CardContent className="space-y-4 pt-4">
            <div className="h-[138px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={docDistribution}
                  layout="vertical"
                  barSize={14}
                  margin={{ top: 0, right: 16, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#EDF1F5" />
                  <XAxis type="number" hide allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="code"
                    width={42}
                    tick={{ fontSize: 12, fill: '#172B4D', fontWeight: 600 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#F9FAFB' }}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #E2E7EE',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                    formatter={(value: number) => [`${value} documents`, 'Volume']}
                  />
                  <Bar dataKey="count" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                    {docDistribution.map((entry) => (
                      <Cell key={entry.code} fill={DOC_BAR_COLORS[entry.code] ?? '#172B4D'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="divide-y divide-[#EDF1F5] border-t border-[#EDF1F5] pt-2">
              {docDistribution.map((item) => (
                <div key={item.code} className="flex items-center justify-between py-2 text-[12.5px]">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2 w-2 rounded-[2px]"
                      style={{ backgroundColor: DOC_BAR_COLORS[item.code] }}
                    />
                    <span className="font-medium text-[#172B4D]">{item.label}</span>
                  </div>
                  <div className="flex items-center gap-3 tabular-nums">
                    <span className="font-semibold text-[#172B4D]">{item.count}</span>
                    <span className="w-9 text-right text-[#6B778C]">{item.sharePct}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Row 3: Recent Transactions + Pending Ack Alerts & AI Insights */}
      <section className="grid grid-cols-1 gap-4 xl:grid-cols-12">
        {/* Recent Transactions Table */}
        <Card className="xl:col-span-8">
          <CardHeader>
            <div>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>
                Latest interchanges routed between buyers, suppliers, and freight carriers
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/transactions')}>
              All Transactions
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-[#F9FAFB]">
                <TableHead className="px-3">Transaction</TableHead>
                <TableHead className="px-2.5">Type</TableHead>
                <TableHead className="px-2.5">Route</TableHead>
                <TableHead className="px-2.5">Date</TableHead>
                <TableHead className="px-2.5 text-right">Amount</TableHead>
                <TableHead className="px-2.5">Status</TableHead>
                <TableHead className="px-3 text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-8 text-center text-[13px] text-[#6B778C]">
                    No transactions match the current search or partner filter.
                  </TableCell>
                </TableRow>
              ) : (
                recentTransactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell className="px-3 py-2.5 whitespace-nowrap">
                      <div className="font-mono text-[12px] font-semibold text-[#172B4D]">
                        {txn.transactionId}
                      </div>
                      <div className="text-[11px] text-[#6B778C]">{txn.documentNumber}</div>
                    </TableCell>
                    <TableCell className="px-2.5 py-2.5 whitespace-nowrap">
                      <DocTypeBadge code={txn.documentType} />
                    </TableCell>
                    <TableCell className="px-2.5 py-2.5">
                      <div className="text-[12px] font-medium text-[#172B4D] whitespace-nowrap">{txn.sender}</div>
                      <div className="text-[11px] text-[#6B778C] whitespace-nowrap">to {txn.receiver}</div>
                    </TableCell>
                    <TableCell className="px-2.5 py-2.5 whitespace-nowrap text-[12px] tabular-nums">
                      {formatShortDate(txn.transactionDate)}
                    </TableCell>
                    <TableCell className="px-2.5 py-2.5 text-right font-mono text-[12px] font-medium text-[#172B4D] tabular-nums whitespace-nowrap">
                      {formatINR(txn.amount)}
                    </TableCell>
                    <TableCell className="px-2.5 py-2.5 whitespace-nowrap">
                      <StatusBadge status={txn.status} />
                    </TableCell>
                    <TableCell className="px-3 py-2.5 text-right whitespace-nowrap">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2.5 text-[11.5px]"
                        onClick={() => navigate(`/processing/${txn.transactionId}`)}
                      >
                        Inspect
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </Card>

        {/* Right Column: Pending Acknowledgement Alerts + AI Business Insights */}
        <div className="min-w-0 space-y-4 xl:col-span-4">
          {/* Pending Acknowledgement Alerts */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Pending Acknowledgement Alerts</CardTitle>
                <CardDescription>Open orders awaiting X12 855 confirmation</CardDescription>
              </div>
              <Badge variant="warning">{pendingAlerts.length} open</Badge>
            </CardHeader>
            <CardContent className="space-y-2.5 p-4">
              {pendingAlerts.length === 0 ? (
                <p className="text-[12.5px] text-[#6B778C]">
                  All purchase orders in scope have been acknowledged.
                </p>
              ) : (
                pendingAlerts.map((alert) => (
                  <button
                    key={alert.id}
                    type="button"
                    onClick={() => navigate(`/processing/${alert.transactionId}`)}
                    className="flex w-full items-start justify-between gap-3 rounded-control border border-[#F1DBA8] bg-[#FDF7EB]/60 p-3 text-left transition-colors hover:bg-[#FDF7EB]"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 shrink-0 text-[#D69A35]" />
                        <span className="truncate font-mono text-[12px] font-semibold text-[#172B4D]">
                          {alert.documentNumber}
                        </span>
                      </div>
                      <p className="mt-1 truncate text-[12px] text-[#42526E]">
                        {alert.sender} → {alert.receiver}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[#6B778C]">
                        {formatShortDate(alert.transactionDate)}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <span className="block font-mono text-[12px] font-semibold text-[#172B4D] tabular-nums">
                        {formatINR(alert.amount)}
                      </span>
                      <span className="mt-1 inline-block text-[11px] font-medium text-[#1E4E8C]">
                        Process →
                      </span>
                    </div>
                  </button>
                ))
              )}
            </CardContent>
          </Card>

          {/* AI Business Insights */}
          <Card>
            <CardHeader>
              <div>
                <CardTitle className="flex items-center gap-1.5">
                  <Sparkles className="h-4 w-4 text-[#1E4E8C]" />
                  AI Business Insights
                </CardTitle>
                <CardDescription>
                  Derived from active transaction telemetry (Ollama integration in Phase 5)
                </CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 p-4">
              {insights.map((ins) => (
                <div
                  key={ins.id}
                  className={cn(
                    'rounded-control border p-3',
                    ins.severity === 'danger' && 'border-[#F3C2C0] bg-[#FDF1F1]/60',
                    ins.severity === 'warning' && 'border-[#F1DBA8] bg-[#FDF7EB]/60',
                    ins.severity === 'success' && 'border-[#B8E2D4] bg-[#ECF7F3]/50',
                    ins.severity === 'info' && 'border-[#E2E7EE] bg-[#F9FAFB]'
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B778C]">
                      {ins.category}
                    </span>
                    {ins.severity === 'danger' ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-[#D9534F]" />
                    ) : null}
                  </div>
                  <p className="mt-1 text-[12.5px] font-semibold text-[#172B4D]">{ins.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-[#42526E]">{ins.detail}</p>
                  <button
                    type="button"
                    onClick={() => navigate(ins.targetPath)}
                    className="mt-2 inline-flex items-center gap-1 text-[12px] font-medium text-[#1E4E8C] hover:underline"
                  >
                    {ins.actionLabel}
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Row 4: Trading Partner Activity Summary */}
      <section>
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Trading Partner Activity</CardTitle>
              <CardDescription>
                Active EDI interchange metrics across preloaded business network partners
              </CardDescription>
            </div>
            <Button variant="ghost" size="sm" onClick={() => navigate('/partners')}>
              Manage Partners
              <ArrowRight className="h-3.5 w-3.5" />
            </Button>
          </CardHeader>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-[#F9FAFB]">
                <TableHead>Partner</TableHead>
                <TableHead>Partner Code</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="text-right">Sent</TableHead>
                <TableHead className="text-right">Received</TableHead>
                <TableHead className="text-right">Accepted</TableHead>
                <TableHead className="text-right">Exceptions</TableHead>
                <TableHead className="text-right">Total Volume</TableHead>
                <TableHead>Network Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {partnerActivity.map((pa) => (
                <TableRow key={pa.partnerCode}>
                  <TableCell className="font-semibold text-[#172B4D]">{pa.partnerName}</TableCell>
                  <TableCell className="font-mono text-[12px] text-[#42526E]">{pa.partnerCode}</TableCell>
                  <TableCell>{pa.role}</TableCell>
                  <TableCell className="text-right tabular-nums">{pa.sentCount}</TableCell>
                  <TableCell className="text-right tabular-nums">{pa.receivedCount}</TableCell>
                  <TableCell className="text-right font-medium text-[#168568] tabular-nums">
                    {pa.acceptedCount}
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-medium tabular-nums',
                      pa.errorCount > 0 ? 'text-[#D9534F]' : 'text-[#6B778C]'
                    )}
                  >
                    {pa.errorCount}
                  </TableCell>
                  <TableCell className="text-right font-mono text-[12.5px] font-medium text-[#172B4D] tabular-nums">
                    {formatINR(pa.totalValue)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={pa.active ? 'success' : 'neutral'}>
                      <span
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          pa.active ? 'bg-[#168568]' : 'bg-[#6B778C]'
                        )}
                      />
                      {pa.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </section>
    </div>
  )
}

