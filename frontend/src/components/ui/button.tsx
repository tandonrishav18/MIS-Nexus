import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-control text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1E4E8C]/30 disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary: 'bg-[#172B4D] text-white hover:bg-[#223B66] border border-[#172B4D]',
        secondary: 'bg-[#F1F4F8] text-[#172B4D] hover:bg-[#E5EBF2] border border-[#E2E7EE]',
        outline: 'bg-white text-[#172B4D] hover:bg-[#F9FAFB] border border-[#E2E7EE]',
        ghost: 'bg-transparent text-[#42526E] hover:bg-[#F1F4F8] hover:text-[#172B4D]',
        danger: 'bg-[#D9534F] text-white hover:bg-[#C64541] border border-[#D9534F]',
      },
      size: {
        sm: 'h-8 px-2.5 text-[12px]',
        md: 'h-9 px-3.5',
        lg: 'h-10 px-4',
        icon: 'h-8 w-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

