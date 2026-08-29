import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import { CalendarClock, ExternalLink } from 'lucide-react'

import { EdgeSections } from '@/components/archive/edges'
import { GraphMap } from '@/components/archive/graph-map'
import { CatalogNumber, Portrait, RecordRow } from '@/components/archive/record'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { DataList, DataRow } from '@/components/archive/stat'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Panel, PanelBody, PanelHeader, PanelTitle } from '@/components/ui/panel'
import { formatDate, parseDateParam, toISODate } from '@/lib/date'
import {
  entityByline,
  getEntityIdentity,
  getEntityMeta,
  getEntityRelations,
  type EntityCollectionRef,
  type EntityRelations,
} from '@/server/queries/entity-detail'
import type { EntityRef } from '@/types/graph'

/**
 * `/explore/[collection]/[slug]` — the record page (PRD §4.1, §20).
 *
 * The archive's primary unit. Four things share the page, in this order because it
 * is the order a reader needs them:
 *
 *   1. Identity — catalogue number, name, aliases, byline, source.
 *   2. Attributes — the type-specific facts.
 *   3. Relationships — grouped, dated, each with its own citation. This is the
 *      largest block by design: the relationships *are* the record (PRD §10).
 *   4. Practice — the games the graph can generate about this record.
 *
 * The first two come from the record's own row and render immediately; the last two
 * need the graph walked, so they stream in behind their own `<Suspense>`
 * boundaries. A reader gets the name and the portrait at once instead of waiting on
 * a breadth-first traversal, and the two boundaries share one promise so the split
 * costs no extra query.
 *
 * `?asOf=YYYY-MM-DD` re-reads the entire page as it stood on that date. That is
 * not a separate feature bolted on; it is the same temporal filter the Time Machine
 * uses (PRD §11), which is why a record page and a snapshot can never disagree.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const meta = await getEntityMeta(slug)
  if (!meta) return { title: 'Not found' }

  return {
    title: meta.canonicalName,
    description: meta.summary ?? meta.byline,
  }
}

/**
 * The relationships heading, shared by the loaded block and its placeholder so the
 * copy is written once.
 */
function RelationshipsHeading({ asOf, withLead }: { asOf: string | null; withLead: boolean }) {
  return (
    <SectionHeading
      eyebrow={asOf ? `Valid on ${formatDate(asOf)}` : 'Every connection, with its dates'}
      title="Relationships"
      as="h2"
      lead={
        withLead
          ? 'Relationships are records in their own right. Each one carries the window it held and the source it came from.'
          : undefined
      }
    />
  )
}

function RelationshipsFallback({ asOf }: { asOf: string | null }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading relationships</span>
      <RelationshipsHeading asOf={asOf} withLead />
      <div className="space-y-6">
        {[0, 1].map((group) => (
          <div key={group} className="space-y-3">
            <div className="h-2.5 w-28 animate-pulse rounded-xs bg-ground-sunk" />
            <div className="ruled">
              {[0, 1, 2].map((row) => (
                <div key={row} className="space-y-2 py-3">
                  <div className="h-3 w-2/3 animate-pulse rounded-xs bg-ground-sunk" />
                  <div className="h-2.5 w-1/3 animate-pulse rounded-xs bg-ground-sunk" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

async function Relationships({
  relations,
  asOf,
}: {
  relations: Promise<EntityRelations | null>
  asOf: string | null
}) {
  const sections = (await relations)?.sections ?? []

  return (
    <>
      <RelationshipsHeading asOf={asOf} withLead={sections.length > 0} />

      {sections.length === 0 ? (
        <p className="rounded-sm border border-dashed border-rule-strong bg-ground-sunk px-4 py-5 text-sm text-ink-muted">
          No relationships recorded
          {asOf ? ` as of ${formatDate(asOf)}` : ''}. A record without
          connections is catalogued but not yet placed in the history.
        </p>
      ) : (
        <EdgeSections sections={sections} />
      )}
    </>
  )
}

function SidebarFallback() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading connections</span>
      <div className="h-56 animate-pulse rounded-sm border border-rule bg-ground-sunk" />
      <div className="h-40 animate-pulse rounded-sm border border-rule bg-ground-sunk" />
    </div>
  )
}

async function RecordSidebar({
  relations,
  collection,
  entity,
  generation,
}: {
  relations: Promise<EntityRelations | null>
  collection: EntityCollectionRef | null
  entity: Pick<EntityRef, 'canonicalName'>
  generation: EntityRef | null
}) {
  const resolved = await relations
  if (!resolved) return null

  const { neighbourhood, practice, related } = resolved

  return (
    <>
      {neighbourhood && neighbourhood.nodes.length > 1 ? (
        <Panel>
          <PanelHeader>
            <PanelTitle className="text-sm">Connections</PanelTitle>
            <span className="font-mono text-catalog tabular-nums text-ink-faint">
              {neighbourhood.edges.length} edges
            </span>
          </PanelHeader>
          <PanelBody>
            <GraphMap subgraph={neighbourhood} />
          </PanelBody>
        </Panel>
      ) : null}

      {practice.length > 0 ? (
        <Panel>
          <PanelHeader>
            <div className="space-y-1">
              <p className="eyebrow">Practice</p>
              <PanelTitle className="text-sm">
                Test yourself on {generation?.canonicalName ?? entity.canonicalName}
              </PanelTitle>
            </div>
          </PanelHeader>
          <div className="ruled">
            {practice.map((option) => (
              <div key={option.gameType} className="space-y-2 px-4 py-3">
                <Link
                  href={option.href}
                  className="text-sm font-medium text-ink transition-colors hover:text-accent"
                >
                  {option.label}
                </Link>
                {option.tagline ? (
                  <p className="text-xs leading-relaxed text-ink-faint">{option.tagline}</p>
                ) : null}
                <div className="flex flex-wrap gap-1.5 pt-0.5">
                  {option.rungs.map((rung) => (
                    <Link
                      key={rung.definitionId}
                      href={rung.href}
                      title={`${rung.cognition} · ${rung.rounds} rounds`}
                      className="rounded-xs border border-rule px-1.5 py-0.5 font-mono text-catalog uppercase tracking-[0.08em] text-ink-muted transition-colors hover:border-accent hover:text-accent"
                    >
                      {rung.label}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Panel>
      ) : null}

      {related.length > 0 && collection ? (
        <Panel>
          <PanelHeader>
            <PanelTitle className="text-sm">More {collection.label}</PanelTitle>
          </PanelHeader>
          <div className="ruled">
            {related.map((card) => (
              <RecordRow key={card.id} entity={card} meta={card.meta} dateline={card.dateline} />
            ))}
          </div>
        </Panel>
      ) : null}
    </>
  )
}

export default async function EntityPage({
  params,
  searchParams,
}: {
  params: Promise<{ collection: string; slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ slug }, query] = await Promise.all([params, searchParams])
  const asOf = parseDateParam(query.asOf) ?? null

  const identity = await getEntityIdentity(slug, { asOf })
  if (!identity) notFound()

  const { entity, collection, typeLabel, generation } = identity
  const identityAttributes = entity.attributes.filter((attribute) => attribute.value.length > 0)

  // Started here and awaited by the two boundaries below, so the relationships
  // block and the sidebar share one traversal. The empty `catch` is not error
  // handling: it marks the promise as observed for the window between this line
  // and the children awaiting it, so a failed read surfaces as a render error
  // rather than as an unhandled rejection. The awaits still receive it.
  const relations = getEntityRelations(slug, { asOf, generation })
  relations.catch(() => {})

  return (
    <PageShell className="space-y-12">
      {/* ------------------------------------------------------------- identity */}
      <header className="space-y-5">
        <nav className="flex flex-wrap items-center gap-2 text-xs" aria-label="Breadcrumb">
          <Link href="/explore" className="text-ink-muted transition-colors hover:text-accent">
            Explore
          </Link>
          {collection ? (
            <>
              <span aria-hidden className="text-ink-faint">
                /
              </span>
              <Link
                href={`/explore/${collection.slug}`}
                className="text-ink-muted transition-colors hover:text-accent"
              >
                {collection.label}
              </Link>
            </>
          ) : null}
        </nav>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          {/* The largest image above the fold on the archive's primary page. */}
          <Portrait entity={entity} size="xl" className="animate-rise" priority />

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <CatalogNumber entity={entity} />
              <Badge tone="quiet">{typeLabel}</Badge>
              {!entity.isPublished ? <Badge tone="ochre">Draft</Badge> : null}
              {identity.asOf ? (
                <Badge tone="indigo">
                  <CalendarClock aria-hidden />
                  as of {formatDate(identity.asOf)}
                </Badge>
              ) : null}
            </div>

            <h1 className="text-3xl font-semibold sm:text-4xl">{entity.canonicalName}</h1>

            {entity.aliases.length > 0 ? (
              <p className="text-sm text-ink-muted">
                Also known as{' '}
                <span className="text-ink">{entity.aliases.join(' · ')}</span>
              </p>
            ) : null}

            <p className="font-mono text-catalog uppercase tracking-[0.08em] text-ink-faint">
              {entityByline(entity)}
            </p>

            {entity.summary ? (
              <p className="max-w-2xl text-base leading-relaxed text-ink">{entity.summary}</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-2 pt-1">
              {generation ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={generation.href}>{generation.canonicalName}</Link>
                </Button>
              ) : null}
              <Button asChild variant="ghost" size="sm">
                <Link
                  href={`/history/time-machine?date=${toISODate(entity.activeFrom) ?? ''}`}
                >
                  <CalendarClock aria-hidden />
                  See the archive then
                </Link>
              </Button>
              {identity.asOf ? (
                <Button asChild variant="ghost" size="sm">
                  <Link href={entity.href}>Back to today</Link>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </header>

      {/* ------------------------------------------------------------ narrative */}
      {entity.description ? (
        <Section>
          <SectionHeading eyebrow="Record" title="Description" as="h2" />
          <div className="prose-archive text-[0.95rem]">
            {entity.description.split(/\n{2,}/).map((paragraph, index) => (
              <p key={index}>{paragraph}</p>
            ))}
          </div>
        </Section>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0 space-y-12">
          {/* -------------------------------------------------------- attributes */}
          {identityAttributes.length > 0 ? (
            <Section>
              <SectionHeading eyebrow="Catalogued facts" title="Attributes" as="h2" />
              <DataList>
                {identityAttributes.map((attribute) => (
                  <DataRow key={attribute.label} label={attribute.label}>
                    {attribute.value}
                  </DataRow>
                ))}
              </DataList>
            </Section>
          ) : null}

          {/* ----------------------------------------------------- relationships */}
          <Section>
            <Suspense fallback={<RelationshipsFallback asOf={identity.asOf} />}>
              <Relationships relations={relations} asOf={identity.asOf} />
            </Suspense>
          </Section>

          {/* ------------------------------------------------------------ source */}
          {entity.source || entity.notes ? (
            <Section>
              <SectionHeading eyebrow="Provenance" title="Where this comes from" as="h3" />
              <DataList>
                {entity.source ? (
                  <>
                    <DataRow label="Source">
                      {entity.source.url ? (
                        <a
                          href={entity.source.url}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="inline-flex items-center gap-1.5 text-accent underline underline-offset-2"
                        >
                          {entity.source.name}
                          <ExternalLink aria-hidden className="size-3" />
                        </a>
                      ) : (
                        entity.source.name
                      )}
                    </DataRow>
                    {entity.source.retrievedAt ? (
                      <DataRow label="Retrieved">{formatDate(entity.source.retrievedAt)}</DataRow>
                    ) : null}
                  </>
                ) : null}
                {entity.notes ? <DataRow label="Curator notes">{entity.notes}</DataRow> : null}
                <DataRow label="Last updated">{formatDate(entity.updatedAt)}</DataRow>
              </DataList>
            </Section>
          ) : null}
        </div>

        {/* ------------------------------------------------------------- sidebar */}
        <aside className="space-y-6">
          <Suspense fallback={<SidebarFallback />}>
            <RecordSidebar
              relations={relations}
              collection={collection}
              entity={entity}
              generation={generation}
            />
          </Suspense>
        </aside>
      </div>
    </PageShell>
  )
}
