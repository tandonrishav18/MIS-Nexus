import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: string
  description: string
  badge?: ReactNode
  actions?: ReactNode
}

export function PageHeader({ title, description, badge, actions }: PageHeaderProps) {
  return (
    <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="text-[20px] font-semibold tracking-[-0.02em] text-[#172B4D]">
            {title}
          </h1>
          {badge}
        </div>
        <p className="mt-1 text-[13px] text-[#6B778C]">{description}</p>
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2 lg:shrink-0">{actions}</div> : null}
    </div>
  )
}

