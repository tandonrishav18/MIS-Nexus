import { Badge } from '@/components/ui/badge'
import type { TransactionStatus } from '@/types/edi'
import { cn } from '@/lib/utils'

interface StatusBadgeProps {
  status: TransactionStatus
}

const STATUS_MAP: Record<
  TransactionStatus,
  { variant: 'success' | 'warning' | 'danger' | 'info' | 'neutral'; dotColor: string }
> = {
  Accepted: { variant: 'success', dotColor: 'bg-[#168568]' },
  Pending: { variant: 'warning', dotColor: 'bg-[#D69A35]' },
  Rejected: { variant: 'danger', dotColor: 'bg-[#D9534F]' },
  Processing: { variant: 'info', dotColor: 'bg-[#1E4E8C]' },
  Draft: { variant: 'neutral', dotColor: 'bg-[#6B778C]' },
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const cfg = STATUS_MAP[status]
  return (
    <Badge variant={cfg.variant}>
      <span className={cn('h-1.5 w-1.5 rounded-full', cfg.dotColor)} />
      {status}
    </Badge>
  )
}

