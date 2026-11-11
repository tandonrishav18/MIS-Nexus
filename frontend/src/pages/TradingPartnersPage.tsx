import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  CheckCircle2,
  Mail,
  MapPin,
  Phone,
  Plus,
  Power,
  Search,
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
import { useEdiStore } from '@/context/EdiStoreContext'
import { formatINR, formatShortDate, type EdiDocCode } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { TradingPartnerSummary } from '@/types/edi'

export function TradingPartnersPage() {
  const navigate = useNavigate()
  const { partners, transactions, togglePartnerStatus, addPartner } = useEdiStore()
  const { pushToast } = useToast()

  const [searchText, setSearchText] = useState('')
  const [roleFilter, setRoleFilter] = useState<string>('ALL')
  const [statusFilter, setStatusFilter] = useState<string>('ALL')
  const [selectedId, setSelectedId] = useState<string>(partners[0]?.id ?? 'ptr-metro')
  const [addModalOpen, setAddModalOpen] = useState(false)

  // Add Partner form state
  const [newName, setNewName] = useState('')
  const [newRole, setNewRole] = useState<TradingPartnerSummary['role']>('Supplier')
  const [newCode, setNewCode] = useState('')
  const [newIsaId, setNewIsaId] = useState('')
  const [newGsId, setNewGsId] = useState('')
  const [newCity, setNewCity] = useState('')
  const [newState, setNewState] = useState('')
  const [newGstin, setNewGstin] = useState('')
  const [newContactName, setNewContactName] = useState('')
  const [newContactEmail, setNewContactEmail] = useState('')
  const [newDocs, setNewDocs] = useState<EdiDocCode[]>(['850', '855', '810'])
  const [formError, setFormError] = useState('')

  const filteredPartners = useMemo(() => {
    const q = searchText.trim().toLowerCase()
    return partners.filter((p) => {
      const matchesRole = roleFilter === 'ALL' || p.role === roleFilter
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' && p.active) ||
        (statusFilter === 'INACTIVE' && !p.active)
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.partnerCode.toLowerCase().includes(q) ||
        p.isaId.toLowerCase().includes(q) ||
        p.city.toLowerCase().includes(q)
      return matchesRole && matchesStatus && matchesQuery
    })
  }, [partners, searchText, roleFilter, statusFilter])

  const selectedPartner =
    filteredPartners.find((p) => p.id === selectedId) ??
    partners.find((p) => p.id === selectedId) ??
    filteredPartners[0] ??
    partners[0]

  const getPartnerMetrics = (partnerName: string) => {
    const involved = transactions.filter(
      (t) => t.sender === partnerName || t.receiver === partnerName
    )
    const accepted = involved.filter((t) => t.status === 'Accepted').length
    const rejected = involved.filter((t) => t.status === 'Rejected').length
    const pending = involved.filter(
      (t) => t.status === 'Pending' || t.status === 'Processing' || t.status === 'Draft'
    ).length
    const totalVolume = involved.reduce((s, t) => s + t.amount, 0)
    return { involved, accepted, rejected, pending, totalVolume }
  }

  const selectedMetrics = selectedPartner ? getPartnerMetrics(selectedPartner.name) : null

  const handleToggleStatus = async (partner: TradingPartnerSummary) => {
    try {
      await togglePartnerStatus(partner.id)
      pushToast({
        tone: partner.active ? 'warning' : 'success',
        title: `${partner.name} ${partner.active ? 'Deactivated' : 'Activated'}`,
        description: partner.active
          ? 'Outbound/inbound validation will block this partner until reactivated.'
          : 'Partner restored to active EDI interchange network.',
      })
    } catch (err) {
      pushToast({
        tone: 'danger',
        title: 'Partner Update Failed',
        description: err instanceof Error ? err.message : 'Unable to update partner status.',
      })
    }
  }

  const toggleDocSupport = (code: EdiDocCode) => {
    setNewDocs((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    )
  }

  const handleCreatePartner = async () => {
    if (!newName.trim() || !newCode.trim() || !newIsaId.trim() || !newGsId.trim()) {
      setFormError('Partner name, partner code, ISA ID, and GS ID are required.')
      return
    }
    if (newDocs.length === 0) {
      setFormError('Select at least one supported EDI document type.')
      return
    }
    try {
      await addPartner({
        name: newName.trim(),
        role: newRole,
        partnerCode: newCode.trim().toUpperCase(),
        isaQualifier: 'ZZ',
        isaId: newIsaId.trim().toUpperCase(),
        gsId: newGsId.trim().toUpperCase(),
        supportedDocs: newDocs,
        active: true,
        gstin: newGstin.trim() || '29AAACP0000A1Z5',
        city: newCity.trim() || 'Mumbai',
        state: newState.trim() || 'Maharashtra',
        contactName: newContactName.trim() || 'EDI Operations Team',
        contactEmail: newContactEmail.trim() || 'edi@partner.example',
        contactPhone: '+91 22 4000 1200',
        slaAckHours: 8,
        notes: 'Added via Trading Partner Directory.',
      })
      setFormError('')
      setAddModalOpen(false)
      setNewName('')
      setNewCode('')
      setNewIsaId('')
      setNewGsId('')
      pushToast({
        tone: 'success',
        title: 'Trading Partner Added',
        description: `${newName.trim()} persisted in SQLite EDI network.`,
      })
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Unable to create partner.')
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Trading Partners"
        description="Manage business partner profiles, ANSI X12 ISA/GS identifiers, supported document types, and SLA metrics."
        badge={<Badge variant="neutral">{partners.length} registered partners</Badge>}
        actions={
          <Button variant="primary" size="sm" onClick={() => setAddModalOpen(true)}>
            <Plus className="h-3.5 w-3.5" />
            Add Partner
          </Button>
        }
      />

      {/* Search & Filters */}
      <Card className="p-4">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-12">
          <div className="relative md:col-span-6">
            <label htmlFor="partner-search" className="sr-only">
              Search trading partners
            </label>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B778C]" />
            <Input
              id="partner-search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search partner name, code, ISA ID, or city..."
              className="pl-9"
            />
          </div>
          <div className="md:col-span-3">
            <label htmlFor="partner-role-filter" className="sr-only">
              Filter by role
            </label>
            <select
              id="partner-role-filter"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-3 text-[13px] text-[#172B4D] focus:border-[#1E4E8C] focus:outline-none"
            >
              <option value="ALL">All Roles</option>
              <option value="Buyer">Buyer</option>
              <option value="Supplier">Supplier</option>
              <option value="Logistics">Logistics</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label htmlFor="partner-status-filter" className="sr-only">
              Filter by partner status
            </label>
            <select
              id="partner-status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-3 text-[13px] text-[#172B4D] focus:border-[#1E4E8C] focus:outline-none"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Master-Detail Grid */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Directory List */}
        <div className="space-y-3 lg:col-span-4">
          {filteredPartners.length === 0 ? (
            <Card className="p-6 text-center text-[13px] text-[#6B778C]">
              No trading partners match your search criteria.
            </Card>
          ) : (
            filteredPartners.map((partner) => {
              const stats = getPartnerMetrics(partner.name)
              const isSelected = selectedPartner?.id === partner.id
              return (
                <button
                  key={partner.id}
                  type="button"
                  onClick={() => setSelectedId(partner.id)}
                  className={cn(
                    'w-full rounded-card border bg-white p-4 text-left transition-colors',
                    isSelected
                      ? 'border-[#172B4D] ring-1 ring-[#172B4D]/15'
                      : 'border-[#E2E7EE] hover:bg-[#F9FAFB]'
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 shrink-0 text-[#1E4E8C]" />
                        <span className="truncate text-[14px] font-semibold text-[#172B4D]">
                          {partner.name}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-2 text-[12px] text-[#6B778C]">
                        <span className="font-mono font-medium text-[#42526E]">
                          {partner.partnerCode}
                        </span>
                        <span>·</span>
                        <span>{partner.role}</span>
                      </div>
                    </div>
                    <Badge variant={partner.active ? 'success' : 'neutral'}>
                      {partner.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>

                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {partner.supportedDocs.map((code) => (
                      <DocTypeBadge key={code} code={code} />
                    ))}
                  </div>

                  <div className="mt-3 grid grid-cols-3 gap-2 border-t border-[#EDF1F5] pt-2.5 text-[11.5px] tabular-nums">
                    <div>
                      <span className="block text-[#6B778C]">Total</span>
                      <span className="font-semibold text-[#172B4D]">{stats.involved.length}</span>
                    </div>
                    <div>
                      <span className="block text-[#6B778C]">Accepted</span>
                      <span className="font-semibold text-[#168568]">{stats.accepted}</span>
                    </div>
                    <div>
                      <span className="block text-[#6B778C]">Rejected</span>
                      <span className="font-semibold text-[#D9534F]">{stats.rejected}</span>
                    </div>
                  </div>
                </button>
              )
            })
          )}
        </div>

        {/* Partner Profile Detail */}
        {selectedPartner && selectedMetrics ? (
          <div className="space-y-4 lg:col-span-8">
            <Card>
              <CardHeader>
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <CardTitle className="text-[16px]">{selectedPartner.name}</CardTitle>
                    <Badge variant="info">{selectedPartner.role}</Badge>
                    <Badge variant={selectedPartner.active ? 'success' : 'neutral'}>
                      {selectedPartner.active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                  <CardDescription className="mt-1">{selectedPartner.notes}</CardDescription>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleToggleStatus(selectedPartner)}
                >
                  <Power className="h-3.5 w-3.5" />
                  {selectedPartner.active ? 'Set Inactive' : 'Activate Partner'}
                </Button>
              </CardHeader>

              <CardContent className="space-y-5">
                {/* Summary KPIs for selected partner */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <div className="rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-3">
                    <span className="block text-[11px] font-medium text-[#6B778C]">
                      Total Transactions
                    </span>
                    <span className="mt-1 block text-[20px] font-semibold text-[#172B4D] tabular-nums">
                      {selectedMetrics.involved.length}
                    </span>
                  </div>
                  <div className="rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-3">
                    <span className="block text-[11px] font-medium text-[#6B778C]">Accepted</span>
                    <span className="mt-1 block text-[20px] font-semibold text-[#168568] tabular-nums">
                      {selectedMetrics.accepted}
                    </span>
                  </div>
                  <div className="rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-3">
                    <span className="block text-[11px] font-medium text-[#6B778C]">Rejected</span>
                    <span className="mt-1 block text-[20px] font-semibold text-[#D9534F] tabular-nums">
                      {selectedMetrics.rejected}
                    </span>
                  </div>
                  <div className="rounded-control border border-[#E2E7EE] bg-[#F9FAFB] p-3">
                    <span className="block text-[11px] font-medium text-[#6B778C]">
                      Cumulative Value
                    </span>
                    <span className="mt-1 block font-mono text-[15px] font-semibold text-[#172B4D] tabular-nums">
                      {formatINR(selectedMetrics.totalVolume)}
                    </span>
                  </div>
                </div>

                {/* EDI Identifiers & Organization Details */}
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="rounded-control border border-[#E2E7EE] p-4 space-y-2.5">
                    <p className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[#6B778C]">
                      ANSI X12 EDI Identifiers
                    </p>
                    <dl className="space-y-2 text-[12.5px]">
                      <div className="flex justify-between gap-2">
                        <dt className="text-[#6B778C]">Partner Code</dt>
                        <dd className="font-mono font-semibold text-[#172B4D]">
                          {selectedPartner.partnerCode}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[#6B778C]">ISA Qualifier / ID</dt>
                        <dd className="font-mono font-semibold text-[#172B4D]">
                          {selectedPartner.isaQualifier} / {selectedPartner.isaId}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[#6B778C]">GS Functional Group ID</dt>
                        <dd className="font-mono font-semibold text-[#172B4D]">
                          {selectedPartner.gsId}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-2">
                        <dt className="text-[#6B778C]">Ack SLA Target</dt>
                        <dd className="font-medium text-[#172B4D] tabular-nums">
                          {selectedPartner.slaAckHours} hours
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-control border border-[#E2E7EE] p-4 space-y-2.5">
                    <p className="text-[11.5px] font-semibold uppercase tracking-[0.05em] text-[#6B778C]">
                      Business Contact & Compliance
                    </p>
                    <div className="space-y-2 text-[12.5px] text-[#42526E]">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-3.5 w-3.5 text-[#168568]" />
                        <span>
                          GSTIN: <span className="font-mono text-[#172B4D]">{selectedPartner.gstin}</span>
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-[#6B778C]" />
                        <span>
                          {selectedPartner.city}, {selectedPartner.state}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Mail className="h-3.5 w-3.5 text-[#6B778C]" />
                        <span>
                          {selectedPartner.contactName} ({selectedPartner.contactEmail})
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Phone className="h-3.5 w-3.5 text-[#6B778C]" />
                        <span className="tabular-nums">{selectedPartner.contactPhone}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Partner Transaction History */}
                <div>
                  <p className="mb-2 text-[12px] font-semibold uppercase tracking-[0.04em] text-[#6B778C]">
                    Partner Transaction History
                  </p>
                  <div className="rounded-control border border-[#E2E7EE] overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="px-2.5">TXN ID</TableHead>
                          <TableHead className="px-2">Type</TableHead>
                          <TableHead className="px-2">Counterparty</TableHead>
                          <TableHead className="px-2">Date</TableHead>
                          <TableHead className="px-2 text-right">Amount</TableHead>
                          <TableHead className="px-2">Status</TableHead>
                          <TableHead className="px-2.5 text-right">Process</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedMetrics.involved.length === 0 ? (
                          <TableRow>
                            <TableCell colSpan={7} className="py-6 text-center text-[#6B778C]">
                              No transactions recorded yet for this partner.
                            </TableCell>
                          </TableRow>
                        ) : (
                          selectedMetrics.involved.map((txn) => {
                            const direction =
                              txn.sender === selectedPartner.name
                                ? `To ${txn.receiver}`
                                : `From ${txn.sender}`
                            return (
                              <TableRow key={txn.id}>
                                <TableCell className="px-2.5 py-2 whitespace-nowrap">
                                  <div className="font-mono text-[12px] font-semibold text-[#172B4D]">
                                    {txn.transactionId}
                                  </div>
                                  <div className="text-[11px] text-[#6B778C]">
                                    {txn.documentNumber}
                                  </div>
                                </TableCell>
                                <TableCell className="px-2 py-2 whitespace-nowrap">
                                  <DocTypeBadge code={txn.documentType} />
                                </TableCell>
                                <TableCell className="px-2 py-2 text-[12px]">{direction}</TableCell>
                                <TableCell className="px-2 py-2 whitespace-nowrap text-[11.5px] tabular-nums">
                                  {formatShortDate(txn.transactionDate)}
                                </TableCell>
                                <TableCell className="px-2 py-2 text-right font-mono text-[12px] font-medium text-[#172B4D] tabular-nums whitespace-nowrap">
                                  {formatINR(txn.amount)}
                                </TableCell>
                                <TableCell className="px-2 py-2 whitespace-nowrap">
                                  <StatusBadge status={txn.status} />
                                </TableCell>
                                <TableCell className="px-2.5 py-2 text-right whitespace-nowrap">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-[11.5px]"
                                    onClick={() => navigate(`/processing/${txn.transactionId}`)}
                                  >
                                    Inspect
                                  </Button>
                                </TableCell>
                              </TableRow>
                            )
                          })
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </div>

      {/* Add Partner Modal */}
      <Dialog open={addModalOpen} onOpenChange={setAddModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Register Trading Partner</DialogTitle>
            <DialogDescription>
              Configure ANSI X12 routing identifiers and supported transaction sets.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-3.5">
            {formError ? (
              <div className="rounded-control border border-[#F3C2C0] bg-[#FDF1F1] px-3 py-2 text-[12.5px] text-[#D9534F]">
                {formError}
              </div>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="new-ptr-name" className="mb-1 block text-[12px] font-medium">
                  Company Name *
                </label>
                <Input
                  id="new-ptr-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nova Peripherals Ltd."
                />
              </div>
              <div>
                <label htmlFor="new-ptr-role" className="mb-1 block text-[12px] font-medium">
                  Network Role *
                </label>
                <select
                  id="new-ptr-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as TradingPartnerSummary['role'])}
                  className="h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-3 text-[13px]"
                >
                  <option value="Buyer">Buyer</option>
                  <option value="Supplier">Supplier</option>
                  <option value="Logistics">Logistics</option>
                </select>
              </div>
              <div>
                <label htmlFor="new-ptr-code" className="mb-1 block text-[12px] font-medium">
                  Partner Code *
                </label>
                <Input
                  id="new-ptr-code"
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  className="font-mono"
                  placeholder="NOVAPER"
                />
              </div>
              <div>
                <label htmlFor="new-ptr-isa" className="mb-1 block text-[12px] font-medium">
                  ISA Interchange ID *
                </label>
                <Input
                  id="new-ptr-isa"
                  value={newIsaId}
                  onChange={(e) => setNewIsaId(e.target.value)}
                  className="font-mono"
                  placeholder="NOVAPERIPH01"
                />
              </div>
              <div>
                <label htmlFor="new-ptr-gs" className="mb-1 block text-[12px] font-medium">
                  GS Functional Group ID *
                </label>
                <Input
                  id="new-ptr-gs"
                  value={newGsId}
                  onChange={(e) => setNewGsId(e.target.value)}
                  className="font-mono"
                  placeholder="NOVASALES"
                />
              </div>
              <div>
                <label htmlFor="new-ptr-gstin" className="mb-1 block text-[12px] font-medium">
                  GSTIN
                </label>
                <Input
                  id="new-ptr-gstin"
                  value={newGstin}
                  onChange={(e) => setNewGstin(e.target.value)}
                  className="font-mono"
                  placeholder="27AAACN1234F1Z1"
                />
              </div>
              <div>
                <label htmlFor="new-ptr-city" className="mb-1 block text-[12px] font-medium">
                  City
                </label>
                <Input
                  id="new-ptr-city"
                  value={newCity}
                  onChange={(e) => setNewCity(e.target.value)}
                  placeholder="Hyderabad"
                />
              </div>
              <div>
                <label htmlFor="new-ptr-state" className="mb-1 block text-[12px] font-medium">
                  State
                </label>
                <Input
                  id="new-ptr-state"
                  value={newState}
                  onChange={(e) => setNewState(e.target.value)}
                  placeholder="Telangana"
                />
              </div>
              <div>
                <label htmlFor="new-ptr-contact" className="mb-1 block text-[12px] font-medium">
                  Contact Name
                </label>
                <Input
                  id="new-ptr-contact"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="Priya Nair"
                />
              </div>
              <div>
                <label htmlFor="new-ptr-email" className="mb-1 block text-[12px] font-medium">
                  Contact Email
                </label>
                <Input
                  id="new-ptr-email"
                  value={newContactEmail}
                  onChange={(e) => setNewContactEmail(e.target.value)}
                  placeholder="edi@novaperipherals.example"
                />
              </div>
            </div>

            <div>
              <span className="mb-1.5 block text-[12px] font-medium">
                Supported EDI Document Types *
              </span>
              <div className="flex flex-wrap gap-2">
                {(['850', '855', '810', '856'] as EdiDocCode[]).map((code) => {
                  const selected = newDocs.includes(code)
                  return (
                    <button
                      key={code}
                      type="button"
                      onClick={() => toggleDocSupport(code)}
                      className={cn(
                        'rounded-control border px-3 py-1.5 text-[12px] font-medium transition-colors',
                        selected
                          ? 'border-[#172B4D] bg-[#172B4D] text-white'
                          : 'border-[#E2E7EE] bg-white text-[#42526E] hover:bg-[#F9FAFB]'
                      )}
                    >
                      X12 {code}
                    </button>
                  )
                })}
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setAddModalOpen(false)}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleCreatePartner}>
              Save Partner
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

