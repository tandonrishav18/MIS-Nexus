import { useState, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Topbar } from '@/components/layout/Topbar'
import { Button } from '@/components/ui/button'
import { useEdiStore } from '@/context/EdiStoreContext'

interface AppShellProps {
  searchQuery: string
  onSearchChange: (q: string) => void
  children: ReactNode
}

export function AppShell({ searchQuery, onSearchChange, children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false)
  const { isLoading, isSyncing, backendError, refreshAll } = useEdiStore()

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#F6F8FA] text-[#172B4D]">
      <Sidebar mobileOpen={mobileOpen} onCloseMobile={() => setMobileOpen(false)} />

      <div className="flex min-h-screen min-w-0 flex-col lg:pl-[248px]">
        <Topbar
          onOpenMobileMenu={() => setMobileOpen(true)}
          searchQuery={searchQuery}
          onSearchChange={onSearchChange}
        />
        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[1440px] px-4 py-5 sm:px-6 lg:py-6">
            {backendError ? (
              <div
                role="alert"
                className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-[#F3C2C0] bg-[#FDF1F1] px-4 py-3 text-[12.5px] text-[#172B4D]"
              >
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-[#D9534F]" />
                  <span>
                    <strong>Backend Connection Unavailable:</strong> {backendError}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={isSyncing}
                  onClick={() => void refreshAll()}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  Retry Connection
                </Button>
              </div>
            ) : null}

            {isLoading ? (
              <div className="flex min-h-[320px] items-center justify-center rounded-card border border-[#E2E7EE] bg-white p-8 text-[13px] text-[#6B778C]">
                Loading EDI Nexus records from SQLite backend...
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

