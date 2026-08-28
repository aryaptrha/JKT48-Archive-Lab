import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

import { formatDateRange } from '@/lib/date'
import { cn } from '@/lib/utils'
import type { EdgeSection, GraphEdge } from '@/types/graph'

import { Badge } from '@/components/ui/badge'
import { Portrait } from './record'

/**
 * Relationships, as rendered on an entity page (PRD §4.1, §10).
 *
 * This is the component the whole schema exists for. Relationships are
 * first-class records, so they get first-class presentation: each one shows the
 * far entity, the validity window it held, and the source it came from — the same
 * three things a footnote in a reference work carries.
 *
 * Two things are deliberately absent. There is no verb hard-coded here: the
 * reading label arrives on the edge, already oriented for the direction being
 * travelled, from the admin-editable relationship vocabulary. And there is no
 * "current"/"past" grouping invented by the component — an edge is open or closed
 * according to its `validTo`, which is a fact, whereas "current" would be this
 * component's opinion about a date it was not given.
 */

function validity(edge: GraphEdge): string | null {
  if (!edge.isTemporal) return null
  if (!edge.validFrom && !edge.validTo) return null
  return formatDateRange(edge.validFrom, edge.validTo)
}

export function EdgeRow({ edge }: { edge: GraphEdge }) {
  const span = validity(edge)
  const isOpen = edge.isTemporal && edge.validFrom !== null && edge.validTo === null

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <Portrait entity={edge.other} size="sm" className="mt-0.5" />

      <div className="min-w-0 flex-1 space-y-1">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
          <span className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
            {edge.label}
          </span>
          {isOpen ? (
            <Badge tone="sage" title="This relationship has no end date on record">
              open
            </Badge>
          ) : null}
        </div>

        <Link
          href={edge.other.href}
          className="block truncate text-sm font-medium text-ink transition-colors hover:text-accent"
        >
          {edge.other.canonicalName}
        </Link>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-faint">
          {span ? <span className="font-mono tabular-nums">{span}</span> : null}
          {edge.source ? (
            edge.source.url ? (
              <a
                href={edge.source.url}
                target="_blank"
                rel="noreferrer noopener"
                className="underline decoration-rule-strong underline-offset-2 hover:text-accent"
                title={`Source: ${edge.source.name}`}
              >
                {edge.source.name}
              </a>
            ) : (
              <span title="Source">{edge.source.name}</span>
            )
          ) : null}
          {edge.notes ? <span className="italic">{edge.notes}</span> : null}
        </div>
      </div>
    </div>
  )
}

/**
 * The full set of relationship sections.
 *
 * Sections come pre-grouped and pre-ordered from `groupEdgesIntoSections`, so the
 * order a reader sees is a property of the relationship vocabulary rather than of
 * this file.
 */
export function EdgeSections({
  sections,
  className,
}: {
  sections: EdgeSection[]
  className?: string
}) {
  if (sections.length === 0) return null

  return (
    <div className={cn('space-y-8', className)}>
      {sections.map((section) => (
        <section key={section.label} className="space-y-0">
          <div className="flex items-baseline justify-between gap-3 border-b border-rule-strong pb-2">
            <h3 className="text-base font-semibold">{section.label}</h3>
            <span className="font-mono text-catalog tabular-nums text-ink-faint">
              {section.edges.length}
            </span>
          </div>
          <div className="ruled">
            {section.edges.map((edge) => (
              <EdgeRow key={edge.id} edge={edge} />
            ))}
          </div>
        </section>
      ))}
    </div>
  )
}

/**
 * One relationship written as a sentence: subject → relationship → object.
 *
 * Used by the timeline and the audit log, where the edge is the record being
 * displayed rather than a property of an entity being viewed.
 */
export function EdgeSentence({
  subject,
  relationship,
  object,
  className,
}: {
  subject: { canonicalName: string; href: string }
  relationship: string
  object: { canonicalName: string; href: string }
  className?: string
}) {
  return (
    <p className={cn('flex flex-wrap items-center gap-x-2 gap-y-1 text-sm', className)}>
      <Link
        href={subject.href}
        className="font-medium text-ink transition-colors hover:text-accent"
      >
        {subject.canonicalName}
      </Link>
      <span className="inline-flex items-center gap-1.5 font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
        <ArrowRight aria-hidden className="size-3" />
        {relationship}
        <ArrowRight aria-hidden className="size-3" />
      </span>
      <Link
        href={object.href}
        className="font-medium text-ink transition-colors hover:text-accent"
      >
        {object.canonicalName}
      </Link>
    </p>
  )
}
