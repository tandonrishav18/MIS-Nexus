import { useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import {
  Bell,
  ChevronDown,
  Menu,
  Search,
  Building2,
  Settings,
  AlertCircle,
  Clock,
  FilePlus2,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { deriveNotifications } from '@/data/demoDashboardData'
import { useEdiStore } from '@/context/EdiStoreContext'
import { formatDateTime, formatINR } from '@/lib/format'
import { cn } from '@/lib/utils'

interface TopbarProps {
  onOpenMobileMenu: () => void
  searchQuery: string
  onSearchChange: (q: string) => void
}

const ROUTE_TITLES: Array<{ match: (path: string) => boolean; title: string; group: string }> = [
  { match: (p) => p === '/', title: 'Executive Dashboard', group: 'Overview' },
  { match: (p) => p.startsWith('/transactions'), title: 'Transaction Register', group: 'Transaction Management' },
  { match: (p) => p.startsWith('/create-document'), title: 'Create Document', group: 'Transaction Management' },
  { match: (p) => p.startsWith('/processing'), title: 'Document Processing', group: 'Transaction Management' },
  { match: (p) => p.startsWith('/partners'), title: 'Trading Partners', group: 'Business Network' },
  { match: (p) => p.startsWith('/mapping'), title: 'EDI Mapping Studio', group: 'Business Network' },
  { match: (p) => p.startsWith('/assistant'), title: 'AI Assistant', group: 'Intelligence' },
  { match: (p) => p.startsWith('/reports'), title: 'Reports & Analytics', group: 'Intelligence' },
  { match: (p) => p.startsWith('/settings'), title: 'System Settings', group: 'System' },
]

export function Topbar({ onOpenMobileMenu, searchQuery, onSearchChange }: TopbarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const { transactions } = useEdiStore()
  const [searchFocused, setSearchFocused] = useState(false)

  const activeRoute =
    ROUTE_TITLES.find((r) => r.match(location.pathname)) ?? {
      title: 'EDI NEXUS',
      group: 'Workspace',
    }

  const notifications = useMemo(() => deriveNotifications(transactions), [transactions])

  const quickMatches = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    if (!q) return []
    return transactions.filter(
      (t) =>
        t.transactionId.toLowerCase().includes(q) ||
        t.documentNumber.toLowerCase().includes(q) ||
        t.sender.toLowerCase().includes(q) ||
        t.receiver.toLowerCase().includes(q) ||
        t.summary.toLowerCase().includes(q)
    ).slice(0, 5)
  }, [transactions, searchQuery])

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (quickMatches.length > 0) {
      navigate(`/processing/${quickMatches[0].transactionId}`)
      setSearchFocused(false)
    } else if (searchQuery.trim()) {
      navigate(`/transactions?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchFocused(false)
    }
  }

  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-[#E2E7EE] bg-white px-4 lg:px-6">
      {/* Left: Mobile toggle + current page context */}
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenMobileMenu}
          aria-label="Open navigation menu"
          className="inline-flex h-8 w-8 items-center justify-center rounded-control border border-[#E2E7EE] bg-white text-[#42526E] hover:bg-[#F9FAFB] hover:text-[#172B4D] lg:hidden"
        >
          <Menu className="h-4 w-4" />
        </button>

        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="hidden text-[12px] text-[#6B778C] sm:inline">
              {activeRoute.group}
            </span>
            <span className="hidden text-[12px] text-[#CBD5E1] sm:inline">/</span>
            <span className="truncate text-[14px] font-semibold text-[#172B4D]">
              {activeRoute.title}
            </span>
          </div>
        </div>
      </div>

      {/* Right: Search, Notifications, Quick Action, Profile */}
      <div className="flex items-center gap-2 sm:gap-2.5">
        {/* Global Search */}
        <form onSubmit={handleSearchSubmit} className="relative hidden md:block w-[240px] lg:w-[300px]">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#6B778C]" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setTimeout(() => setSearchFocused(false), 160)}
            placeholder="Search TXN ID, PO, partner..."
            aria-label="Global transaction search"
            className="h-8 w-full rounded-control border border-[#E2E7EE] bg-[#F9FAFB] pl-8 pr-3 text-[12.5px] text-[#172B4D] placeholder:text-[#6B778C] transition-colors focus:border-[#1E4E8C] focus:bg-white focus:outline-none"
          />
          {searchFocused && searchQuery.trim().length > 0 ? (
            <div className="absolute left-0 right-0 top-9 z-40 rounded-card border border-[#E2E7EE] bg-white p-1.5 shadow-popover">
              {quickMatches.length > 0 ? (
                <>
                  <p className="px-2 py-1 text-[10.5px] font-semibold uppercase tracking-[0.05em] text-[#6B778C]">
                    Matching Transactions
                  </p>
                  {quickMatches.map((txn) => (
                    <button
                      key={txn.id}
                      type="button"
                      onMouseDown={() => {
                        navigate(`/processing/${txn.transactionId}`)
                        setSearchFocused(false)
                      }}
                      className="flex w-full items-center justify-between gap-2 rounded-control px-2 py-1.5 text-left text-[12px] hover:bg-[#F1F4F8]"
                    >
                      <div className="min-w-0">
                        <p className="truncate font-mono font-medium text-[#172B4D]">
                          {txn.transactionId} · {txn.documentNumber}
                        </p>
                        <p className="truncate text-[11px] text-[#6B778C]">
                          {txn.sender} → {txn.receiver}
                        </p>
                      </div>
                      <span className="shrink-0 font-mono text-[11.5px] font-medium text-[#172B4D] tabular-nums">
                        {formatINR(txn.amount)}
                      </span>
                    </button>
                  ))}
                </>
              ) : (
                <p className="px-2.5 py-2 text-[12px] text-[#6B778C]">
                  No matching demo transactions for &ldquo;{searchQuery}&rdquo;.
                </p>
              )}
            </div>
          ) : null}
        </form>

        <Button
          size="sm"
          variant="primary"
          onClick={() => navigate('/create-document')}
          className="hidden sm:inline-flex"
        >
          <FilePlus2 className="h-3.5 w-3.5" />
          New Document
        </Button>

        {/* Notifications */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Open alerts and notifications"
              className="relative inline-flex h-8 w-8 items-center justify-center rounded-control border border-[#E2E7EE] bg-white text-[#42526E] transition-colors hover:bg-[#F9FAFB] hover:text-[#172B4D]"
            >
              <Bell className="h-4 w-4" strokeWidth={1.75} />
              {notifications.length > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-[#D9534F] px-1 text-[10px] font-semibold text-white tabular-nums">
                  {notifications.length}
                </span>
              ) : null}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[340px]">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Operational Alerts</span>
              <span className="font-normal normal-case text-[#6B778C]">
                {notifications.length} active
              </span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onSelect={() => navigate(n.targetPath)}
                className="flex-col items-start gap-1 py-2.5"
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-[12.5px] font-semibold text-[#172B4D]">
                    {n.severity === 'danger' ? (
                      <AlertCircle className="h-3.5 w-3.5 text-[#D9534F]" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-[#D69A35]" />
                    )}
                    {n.title}
                  </span>
                </div>
                <p className="line-clamp-2 text-[11.5px] text-[#42526E]">{n.detail}</p>
                <span className="text-[11px] text-[#6B778C] tabular-nums">
                  {formatDateTime(n.timestamp)}
                </span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Operator Profile */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={cn(
                'flex items-center gap-2 rounded-control border border-[#E2E7EE] bg-white px-2 py-1 text-left transition-colors hover:bg-[#F9FAFB]'
              )}
            >
              <span className="flex h-6 w-6 items-center justify-center rounded-[4px] bg-[#172B4D] text-[11px] font-semibold text-white">
                AM
              </span>
              <span className="hidden text-left leading-tight xl:block">
                <span className="block text-[12px] font-medium text-[#172B4D]">Arjun Mehta</span>
                <span className="block text-[10.5px] text-[#6B778C]">EDI Ops Lead</span>
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-[#6B778C]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-[220px]">
            <DropdownMenuLabel>
              <div className="text-[12px] font-semibold normal-case tracking-normal text-[#172B4D]">
                Arjun Mehta
              </div>
              <div className="text-[11px] font-normal normal-case tracking-normal text-[#6B778C]">
                Metro Retail · Hub Admin
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate('/partners')}>
              <Building2 className="h-3.5 w-3.5 text-[#6B778C]" />
              Trading Partners
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate('/settings')}>
              <Settings className="h-3.5 w-3.5 text-[#6B778C]" />
              System Settings
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}

