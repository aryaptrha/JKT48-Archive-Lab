'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { cn } from '@/lib/utils'

/**
 * A navigation link that knows whether it is the current section.
 *
 * Client-side because `usePathname` is, and because the alternative — passing the
 * pathname down from a layout — is not available to a layout in the App Router
 * without reading headers and opting the whole tree out of static rendering.
 *
 * `match` exists because the visible link and the section root differ: History
 * points at `/history/timeline` but should stay marked while the reader is on
 * `/history/time-machine`.
 */
export function NavLink({
  href,
  match,
  exact = false,
  children,
  className,
}: {
  href: string
  match?: string
  /**
   * Match the path exactly.
   *
   * Needed by any nav where one link is the parent of the others: `/me` would
   * otherwise stay marked while the reader is on `/me/mastery`, leaving two links
   * claiming to be the current page.
   */
  exact?: boolean
  children: React.ReactNode
  className?: string
}) {
  const pathname = usePathname()
  const prefix = match ?? href
  const isActive = exact
    ? pathname === prefix
    : pathname === prefix || pathname.startsWith(`${prefix}/`)

  return (
    <Link
      href={href}
      aria-current={isActive ? 'page' : undefined}
      className={cn(
        'relative rounded-sm px-2.5 py-1.5 text-sm transition-colors duration-(--duration-fast)',
        isActive
          ? 'font-medium text-ink-strong'
          : 'text-ink-muted hover:bg-ground-sunk hover:text-ink',
        // The current section is marked with a rule beneath it, matching the
        // tab treatment elsewhere rather than inventing a second active state.
        isActive &&
          'after:absolute after:inset-x-2.5 after:-bottom-1.5 after:h-0.5 after:bg-accent after:content-[""]',
        className,
      )}
    >
      {children}
    </Link>
  )
}
