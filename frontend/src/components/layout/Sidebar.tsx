import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  ArrowLeftRight,
  FilePlus2,
  Workflow,
  Building2,
  GitCompareArrows,
  BotMessageSquare,
  BarChart3,
  Settings,
  X,
  ShieldCheck,
  type LucideIcon,
} from 'lucide-react'
import { useEdiStore } from '@/context/EdiStoreContext'
import { cn } from '@/lib/utils'

export interface NavItemConfig {
  label: string
  path: string
  icon: LucideIcon
}

export interface NavSectionConfig {
  section: string
  items: NavItemConfig[]
}

export const NAV_SECTIONS: NavSectionConfig[] = [
  {
    section: 'OVERVIEW',
    items: [{ label: 'Dashboard', path: '/', icon: LayoutDashboard }],
  },
  {
    section: 'TRANSACTION MANAGEMENT',
    items: [
      { label: 'All Transactions', path: '/transactions', icon: ArrowLeftRight },
      { label: 'Create Document', path: '/create-document', icon: FilePlus2 },
      { label: 'Document Processing', path: '/processing', icon: Workflow },
    ],
  },
  {
    section: 'BUSINESS NETWORK',
    items: [
      { label: 'Trading Partners', path: '/partners', icon: Building2 },
      { label: 'EDI Mapping', path: '/mapping', icon: GitCompareArrows },
    ],
  },
  {
    section: 'INTELLIGENCE',
    items: [
      { label: 'AI Assistant', path: '/assistant', icon: BotMessageSquare },
      { label: 'Reports & Analytics', path: '/reports', icon: BarChart3 },
    ],
  },
  {
    section: 'SYSTEM',
    items: [{ label: 'Settings', path: '/settings', icon: Settings }],
  },
]

interface SidebarProps {
  mobileOpen: boolean
  onCloseMobile: () => void
}

export function Sidebar({ mobileOpen, onCloseMobile }: SidebarProps) {
  const { backendConnected } = useEdiStore()
  const navContent = (
    <div className="flex h-full flex-col bg-white border-r border-[#E2E7EE]">
      {/* Brand header */}
      <div className="flex h-14 shrink-0 items-center justify-between border-b border-[#E2E7EE] px-4">
        <NavLink to="/" onClick={onCloseMobile} className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-control bg-[#172B4D] text-white">
            <ShieldCheck className="h-4 w-4" strokeWidth={2} />
          </div>
          <div className="leading-tight">
            <span className="block text-[13px] font-semibold tracking-[0.02em] text-[#172B4D]">
              EDI NEXUS
            </span>
            <span className="block text-[10px] font-medium uppercase tracking-[0.06em] text-[#6B778C]">
              Enterprise MIS
            </span>
          </div>
        </NavLink>
        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close navigation menu"
          className="rounded-control p-1 text-[#6B778C] hover:bg-[#F1F4F8] hover:text-[#172B4D] lg:hidden"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Navigation groups */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-5" aria-label="Main navigation">
        {NAV_SECTIONS.map((group) => (
          <div key={group.section}>
            <p className="px-2.5 mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.07em] text-[#6B778C]">
              {group.section}
            </p>
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon
                return (
                  <li key={item.path}>
                    <NavLink
                      to={item.path}
                      end={item.path === '/'}
                      onClick={onCloseMobile}
                      className={({ isActive }) =>
                        cn(
                          'group relative flex items-center gap-2.5 rounded-control px-2.5 py-2 text-[13px] transition-colors',
                          isActive
                            ? 'bg-[#F1F4F8] font-semibold text-[#172B4D]'
                            : 'font-medium text-[#42526E] hover:bg-[#F9FAFB] hover:text-[#172B4D]'
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive ? (
                            <span
                              aria-hidden="true"
                              className="absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-r bg-[#172B4D]"
                            />
                          ) : null}
                          <Icon
                            className={cn(
                              'h-4 w-4 shrink-0',
                              isActive ? 'text-[#172B4D]' : 'text-[#6B778C] group-hover:text-[#172B4D]'
                            )}
                            strokeWidth={1.75}
                          />
                          <span className="truncate">{item.label}</span>
                        </>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Network context footer */}
      <div className="shrink-0 border-t border-[#E2E7EE] bg-[#F9FAFB] px-4 py-3">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[#172B4D]">ANSI X12 · 004010</span>
          <span
            className={cn(
              'inline-flex items-center gap-1 text-[11px] font-medium',
              backendConnected ? 'text-[#168568]' : 'text-[#D69A35]'
            )}
          >
            <span
              className={cn(
                'h-1.5 w-1.5 rounded-full',
                backendConnected ? 'bg-[#168568]' : 'bg-[#D69A35]'
              )}
            />
            {backendConnected ? 'SQLite Live' : 'API Offline'}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-[#6B778C]">
          Metro Retail ⇄ ABC Components
        </p>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop fixed sidebar */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:block lg:w-[248px]">
        {navContent}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            className="fixed inset-0 bg-[#172B4D]/30"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="fixed inset-y-0 left-0 z-50 w-[264px] max-w-[85vw]">
            {navContent}
          </aside>
        </div>
      ) : null}
    </>
  )
}

