import { DOC_TYPE_META, type EdiDocCode } from '@/lib/format'

interface DocTypeBadgeProps {
  code: EdiDocCode
  showFullLabel?: boolean
}

export function DocTypeBadge({ code, showFullLabel = false }: DocTypeBadgeProps) {
  const meta = DOC_TYPE_META[code]
  return (
    <span className="inline-flex items-center gap-1.5 rounded-badge border border-[#E2E7EE] bg-[#F9FAFB] px-2 py-0.5 text-[11px] font-medium text-[#172B4D]">
      <span className="font-mono font-semibold text-[#1E4E8C]">{meta.code}</span>
      <span className="text-[#6B778C]">·</span>
      <span>{showFullLabel ? meta.label : meta.short}</span>
    </span>
  )
}

