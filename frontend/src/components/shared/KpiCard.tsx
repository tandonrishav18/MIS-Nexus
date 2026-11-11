import type { LucideIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface KpiCardProps {
  label: string
  value: string | number
  meta: string
  icon: LucideIcon
  tone?: 'default' | 'success' | 'warning' | 'danger'
}

const TONE_ICON_STYLE: Record<NonNullable<KpiCardProps['tone']>, string> = {
  default: 'bg-[#F1F4F8] text-[#172B4D] border-[#E2E7EE]',
  success: 'bg-[#ECF7F3] text-[#168568] border-[#B8E2D4]',
  warning: 'bg-[#FDF7EB] text-[#D69A35] border-[#F1DBA8]',
  danger: 'bg-[#FDF1F1] text-[#D9534F] border-[#F3C2C0]',
}

const TONE_META_STYLE: Record<NonNullable<KpiCardProps['tone']>, string> = {
  default: 'text-[#6B778C]',
  success: 'text-[#168568]',
  warning: 'text-[#9A6B16]',
  danger: 'text-[#D9534F]',
}

export function KpiCard({ label, value, meta, icon: Icon, tone = 'default' }: KpiCardProps) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[#6B778C]">{label}</p>
          <p className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.02em] text-[#172B4D] tabular-nums">
            {value}
          </p>
        </div>
        <div
          className={cn(
            'flex h-8 w-8 shrink-0 items-center justify-center rounded-control border',
            TONE_ICON_STYLE[tone]
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
      </div>
      <p className={cn('mt-3 text-[12px] font-medium', TONE_META_STYLE[tone])}>{meta}</p>
    </Card>
  )
}

