"use client"

import * as React from "react"
import * as TabsPrimitive from "@radix-ui/react-tabs"

import { cn } from "@/lib/utils"

/**
 * MSCHF-styled Tabs
 * - Snappy transitions
 * - Technical monospace labels
 * - Sharp corners
 */
function Tabs({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn("flex flex-col gap-2", className)}
      {...props}
    />
  )
}

function TabsList({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        "bg-secondary/50 text-muted-foreground inline-flex h-9 w-fit items-center justify-center rounded p-1 border border-border/30",
        className
      )}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        // Base styles
        "inline-flex h-full flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-1.5",
        "text-xs font-mono font-medium uppercase tracking-wide whitespace-nowrap",
        // Transitions
        "transition-all duration-150 ease-[cubic-bezier(0.2,0,0,1)]",
        // Inactive state
        "text-muted-foreground hover:text-foreground",
        // Active state
        "data-[state=active]:bg-background data-[state=active]:text-primary",
        "data-[state=active]:border data-[state=active]:border-border/50",
        "data-[state=active]:shadow-sm",
        // Focus
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        // Disabled
        "disabled:pointer-events-none disabled:opacity-50",
        // Icons
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-3.5",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
