import * as React from 'react'
import { cn } from '@/lib/utils'

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type = 'text', ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex h-9 w-full rounded-control border border-[#E2E7EE] bg-white px-3 py-1.5 text-[13px] text-[#172B4D] placeholder:text-[#6B778C] transition-colors focus:border-[#1E4E8C] focus:outline-none focus:ring-2 focus:ring-[#1E4E8C]/15 disabled:cursor-not-allowed disabled:bg-[#F9FAFB] disabled:opacity-60',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

