import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-badge border px-2 py-0.5 text-[11px] font-medium leading-4 whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral: 'border-[#E2E7EE] bg-[#F9FAFB] text-[#42526E]',
        success: 'border-[#B8E2D4] bg-[#ECF7F3] text-[#168568]',
        warning: 'border-[#F1DBA8] bg-[#FDF7EB] text-[#9A6B16]',
        danger: 'border-[#F3C2C0] bg-[#FDF1F1] text-[#D9534F]',
        info: 'border-[#C5D7EE] bg-[#EFF4FB] text-[#1E4E8C]',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />
}

