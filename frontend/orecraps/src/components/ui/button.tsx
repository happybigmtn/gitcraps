import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * MSCHF-inspired button variants
 * - Snappy transitions (cubic-bezier for that satisfying feel)
 * - Active state scales for tactile feedback
 * - Sharp corners (technical aesthetic)
 * - Monospace font for primary actions
 */
const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded text-sm font-medium",
    "transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
    "active:scale-[0.97]",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0",
    "outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
    "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-primary text-primary-foreground font-mono font-bold uppercase tracking-wide",
          "hover:bg-foreground hover:text-background",
          "shadow-sm hover:shadow-md",
        ].join(" "),
        destructive: [
          "bg-destructive text-white font-mono",
          "hover:bg-destructive/80",
          "focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40",
        ].join(" "),
        outline: [
          "border border-border bg-transparent",
          "hover:border-primary hover:bg-primary/10 hover:text-primary",
        ].join(" "),
        secondary: [
          "bg-secondary text-secondary-foreground",
          "hover:bg-secondary/80",
        ].join(" "),
        ghost: [
          "hover:bg-primary/10 hover:text-primary",
        ].join(" "),
        link: "text-primary underline-offset-4 hover:underline",
        // MSCHF special variant - inverted on hover
        mschf: [
          "bg-primary text-primary-foreground font-mono font-bold uppercase tracking-widest",
          "border-2 border-primary",
          "hover:bg-background hover:text-primary",
          "shadow-[2px_2px_0_0_var(--foreground)] hover:shadow-[4px_4px_0_0_var(--foreground)]",
          "hover:translate-x-[-2px] hover:translate-y-[-2px]",
        ].join(" "),
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        sm: "h-8 rounded gap-1.5 px-3 text-xs has-[>svg]:px-2.5",
        lg: "h-11 rounded px-6 text-base has-[>svg]:px-4",
        icon: "size-9",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
