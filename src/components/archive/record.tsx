import Image from 'next/image'
import Link from 'next/link'
import type { ReactNode } from 'react'

import { collectionForEntityType } from '@/domain/entity-taxonomy'
import { cn } from '@/lib/utils'
import type { EntityRef } from '@/types/graph'

/**
 * How a record appears in a list.
 *
 * The archive shows the same entity in four or five places, and it should be
 * recognisable in all of them: catalogue number, name, one line of context, and a
 * portrait when there is one. These components are the only place that decides
 * what "a record" looks like.
 */

/**
 * A catalogue number, derived rather than stored.
 *
 * The prefix comes from the collection the entity type belongs to and the suffix
 * from the last block of its UUID. It is not a stable accession number — it is a
 * *handle*, and it exists because identifiers are most of what separates a
 * reference work from a content feed (PRD §P5).
 */
export function catalogNumber(entity: Pick<EntityRef, 'entityType' | 'id'>): string {
  const prefix = collectionForEntityType(entity.entityType)?.catalogPrefix ?? 'REC'
  const tail = entity.id.replace(/-/g, '').slice(-4).toUpperCase()
  return `${prefix}-${tail}`
}

export function CatalogNumber({
  entity,
  className,
}: {
  entity: Pick<EntityRef, 'entityType' | 'id'>
  className?: string
}) {
  return <span className={cn('catalog-number', className)}>{catalogNumber(entity)}</span>
}

/**
 * A record's portrait, or its initials.
 *
 * Initials rather than a placeholder graphic: a young archive has many records
 * without images, and a wall of identical grey silhouettes looks broken where a
 * wall of set initials looks like an index.
 */
export function Portrait({
  entity,
  size = 'md',
  className,
  priority = false,
}: {
  entity: Pick<EntityRef, 'canonicalName' | 'imageUrl'>
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
  /**
   * Load this portrait eagerly. Set it only for an image that is the page's
   * largest above-the-fold element — the `xl` portrait in a record page header —
   * because every image marked this way competes with the others for the first
   * few connections.
   */
  priority?: boolean
}) {
  const dimensions = { sm: 32, md: 48, lg: 72, xl: 160 }[size]
  const initials = entity.canonicalName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase()

  return (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-sm border border-rule bg-ground-sunk',
        className,
      )}
      style={{ width: dimensions, height: dimensions }}
    >
      {entity.imageUrl ? (
        <Image
          src={entity.imageUrl}
          alt=""
          width={dimensions}
          height={dimensions}
          className="size-full object-cover"
          priority={priority}
          // Decorative: the name is always rendered as text beside it, so an
          // alt attribute here would be read twice.
          aria-hidden
        />
      ) : (
        <span
          aria-hidden
          className="flex size-full items-center justify-center font-display text-ink-faint"
          style={{ fontSize: dimensions / 2.6 }}
        >
          {initials}
        </span>
      )}
    </div>
  )
}

export type RecordCardProps = {
  entity: EntityRef
  meta?: string | null
  dateline?: string | null
  /** Zero-based position, used only to stagger the entrance animation. */
  index?: number
  className?: string
}

/**
 * The default record card.
 *
 * Whole-card link with the name as the accessible label, so a keyboard user gets
 * one stop per record instead of three.
 */
export function RecordCard({ entity, meta, dateline, index = 0, className }: RecordCardProps) {
  return (
    <Link
      href={entity.href}
      style={{ '--index': index } as React.CSSProperties}
      className={cn(
        'animate-rise stagger group flex gap-3.5 rounded-sm border border-rule bg-surface p-3.5',
        'transition-[border-color,background-color] duration-(--duration-base) ease-(--ease-editorial)',
        'hover:border-ink-faint hover:bg-surface-raised',
        className,
      )}
    >
      <Portrait entity={entity} size="lg" />
      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex items-baseline justify-between gap-2">
          <CatalogNumber entity={entity} />
          {dateline ? (
            <span className="font-mono text-catalog tabular-nums text-ink-faint">{dateline}</span>
          ) : null}
        </div>
        <h3 className="truncate text-base font-semibold transition-colors group-hover:text-accent">
          {entity.canonicalName}
        </h3>
        {meta ? <p className="truncate text-xs text-ink-muted">{meta}</p> : null}
        {entity.summary ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-ink-faint">{entity.summary}</p>
        ) : null}
      </div>
    </Link>
  )
}

/**
 * A record as one row in a ruled list.
 *
 * Used where density matters more than portraiture — related records, admin
 * pickers, search results.
 */
export function RecordRow({
  entity,
  meta,
  dateline,
  trailing,
  className,
}: RecordCardProps & { trailing?: ReactNode }) {
  return (
    <div className={cn('group flex items-center gap-3 px-4 py-3', className)}>
      <Portrait entity={entity} size="sm" />
      <div className="min-w-0 flex-1">
        <Link
          href={entity.href}
          className="block truncate text-sm font-medium text-ink transition-colors hover:text-accent"
        >
          {entity.canonicalName}
        </Link>
        {meta ? <p className="truncate text-xs text-ink-faint">{meta}</p> : null}
      </div>
      {dateline ? (
        <span className="hidden shrink-0 font-mono text-catalog tabular-nums text-ink-faint sm:inline">
          {dateline}
        </span>
      ) : null}
      {trailing}
    </div>
  )
}

/** Responsive grid for record cards. */
export function RecordGrid({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div
      className={cn(
        'grid gap-3 sm:grid-cols-2 lg:grid-cols-3',
        className,
      )}
    >
      {children}
    </div>
  )
}

/** An inline reference to an entity, for use inside a sentence. */
export function EntityLink({
  entity,
  className,
}: {
  entity: Pick<EntityRef, 'canonicalName' | 'href'>
  className?: string
}) {
  return (
    <Link
      href={entity.href}
      className={cn(
        'font-medium text-ink underline decoration-rule-strong decoration-1 underline-offset-2 transition-colors hover:text-accent hover:decoration-accent',
        className,
      )}
    >
      {entity.canonicalName}
    </Link>
  )
}
