'use client'

import * as TabsPrimitive from '@radix-ui/react-tabs'
import type { ComponentProps } from 'react'

import { cn } from '@/lib/utils'

/**
 * Tabs, styled as a ruled index rather than a segmented control.
 *
 * The active tab is marked by a rule underneath it — the same device a printed
 * index uses — because a filled rounded pill is the SaaS convention the brief
 * asks us to avoid (PRD §22).
 */

export const Tabs = TabsPrimitive.Root

export function TabsList({ className, ...props }: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'flex w-full items-stretch gap-1 overflow-x-auto border-b border-rule',
        className,
      )}
      {...props}
    />
  )
}

export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'relative -mb-px shrink-0 border-b-2 border-transparent px-3 py-2',
        'font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted',
        'transition-colors duration-(--duration-fast)',
        'hover:text-ink',
        'data-[state=active]:border-accent data-[state=active]:text-ink-strong',
        className,
      )}
      {...props}
    />
  )
}

export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      className={cn('animate-rise pt-5 focus-visible:outline-none', className)}
      {...props}
    />
  )
}
