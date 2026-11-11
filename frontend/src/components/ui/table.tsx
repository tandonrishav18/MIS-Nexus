import * as React from 'react'
import { cn } from '@/lib/utils'

export const Table = React.forwardRef<HTMLTableElement, React.TableHTMLAttributes<HTMLTableElement>>(
  ({ className, ...props }, ref) => (
    <div className="w-full overflow-x-auto">
      <table
        ref={ref}
        className={cn('w-full border-collapse text-left text-[13px]', className)}
        {...props}
      />
    </div>
  )
)
Table.displayName = 'Table'

export const TableHeader = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <thead ref={ref} className={cn('bg-[#F9FAFB] border-b border-[#E2E7EE]', className)} {...props} />
))
TableHeader.displayName = 'TableHeader'

export const TableBody = React.forwardRef<
  HTMLTableSectionElement,
  React.HTMLAttributes<HTMLTableSectionElement>
>(({ className, ...props }, ref) => (
  <tbody ref={ref} className={cn('divide-y divide-[#EDF1F5] bg-white', className)} {...props} />
))
TableBody.displayName = 'TableBody'

export const TableRow = React.forwardRef<HTMLTableRowElement, React.HTMLAttributes<HTMLTableRowElement>>(
  ({ className, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn('transition-colors hover:bg-[#F9FAFB]', className)}
      {...props}
    />
  )
)
TableRow.displayName = 'TableRow'

export const TableHead = React.forwardRef<
  HTMLTableCellElement,
  React.ThHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <th
    ref={ref}
    className={cn(
      'h-9 px-4 text-left align-middle text-[11px] font-semibold uppercase tracking-[0.05em] text-[#6B778C] whitespace-nowrap',
      className
    )}
    {...props}
  />
))
TableHead.displayName = 'TableHead'

export const TableCell = React.forwardRef<
  HTMLTableCellElement,
  React.TdHTMLAttributes<HTMLTableCellElement>
>(({ className, ...props }, ref) => (
  <td
    ref={ref}
    className={cn('px-4 py-3 align-middle text-[#42526E]', className)}
    {...props}
  />
))
TableCell.displayName = 'TableCell'

