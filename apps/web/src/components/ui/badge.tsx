"use client"

import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset",
  {
    variants: {
      variant: {
        default:     "bg-primary/10 text-primary ring-primary/20",
        secondary:   "bg-secondary text-secondary-foreground ring-secondary",
        destructive: "bg-destructive/10 text-destructive ring-destructive/20",
        outline:     "bg-transparent text-foreground ring-border",
        enterprise:  "bg-violet-50 text-violet-700 ring-violet-200",
        growth:      "bg-blue-50 text-blue-700 ring-blue-200",
        starter:     "bg-slate-50 text-slate-600 ring-slate-200",
        high:        "bg-red-50 text-red-700 ring-red-200",
        medium:      "bg-amber-50 text-amber-700 ring-amber-200",
        low:         "bg-green-50 text-green-700 ring-green-200",
        new:         "bg-blue-50 text-blue-700 ring-blue-200",
        assigned:    "bg-violet-50 text-violet-700 ring-violet-200",
        resolved:    "bg-green-50 text-green-700 ring-green-200",
        archived:    "bg-slate-50 text-slate-500 ring-slate-200",
      },
    },
    defaultVariants: { variant: "default" },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}
