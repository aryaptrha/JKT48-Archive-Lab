import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
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
import { entityByline, getEntityPage } from '@/server/queries/entity-detail'

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
  const page = await getEntityPage(slug)
  if (!page) return { title: 'Not found' }

  return {
    title: page.entity.canonicalName,
    description: page.entity.summary ?? entityByline(page.entity),
  }
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

  const page = await getEntityPage(slug, { asOf })
  if (!page) notFound()

  const { entity } = page
  const identityAttributes = entity.attributes.filter((attribute) => attribute.value.length > 0)

  return (
    <PageShell className="space-y-12">
      {/* ------------------------------------------------------------- identity */}
      <header className="space-y-5">
        <nav className="flex flex-wrap items-center gap-2 text-xs" aria-label="Breadcrumb">
          <Link href="/explore" className="text-ink-muted transition-colors hover:text-accent">
            Explore
          </Link>
          {page.collection ? (
            <>
              <span aria-hidden className="text-ink-faint">
                /
              </span>
              <Link
                href={`/explore/${page.collection.slug}`}
                className="text-ink-muted transition-colors hover:text-accent"
              >
                {page.collection.label}
              </Link>
            </>
          ) : null}
        </nav>

        <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:gap-6">
          <Portrait entity={entity} size="xl" className="animate-rise" />

          <div className="min-w-0 flex-1 space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <CatalogNumber entity={entity} />
              <Badge tone="quiet">{page.typeLabel}</Badge>
              {!entity.isPublished ? <Badge tone="ochre">Draft</Badge> : null}
              {page.asOf ? (
                <Badge tone="indigo">
                  <CalendarClock aria-hidden />
                  as of {formatDate(page.asOf)}
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
              {page.generation ? (
                <Button asChild variant="outline" size="sm">
                  <Link href={page.generation.href}>{page.generation.canonicalName}</Link>
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
              {page.asOf ? (
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
            <SectionHeading
              eyebrow={
                page.asOf
                  ? `Valid on ${formatDate(page.asOf)}`
                  : 'Every connection, with its dates'
              }
              title="Relationships"
              as="h2"
              lead={
                entity.sections.length === 0
                  ? undefined
                  : 'Relationships are records in their own right. Each one carries the window it held and the source it came from.'
              }
            />

            {entity.sections.length === 0 ? (
              <p className="rounded-sm border border-dashed border-rule-strong bg-ground-sunk px-4 py-5 text-sm text-ink-muted">
                No relationships recorded
                {page.asOf ? ` as of ${formatDate(page.asOf)}` : ''}. A record without
                connections is catalogued but not yet placed in the history.
              </p>
            ) : (
              <EdgeSections sections={entity.sections} />
            )}
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
          {page.neighbourhood && page.neighbourhood.nodes.length > 1 ? (
            <Panel>
              <PanelHeader>
                <PanelTitle className="text-sm">Connections</PanelTitle>
                <span className="font-mono text-catalog tabular-nums text-ink-faint">
                  {page.neighbourhood.edges.length} edges
                </span>
              </PanelHeader>
              <PanelBody>
                <GraphMap subgraph={page.neighbourhood} />
              </PanelBody>
            </Panel>
          ) : null}

          {page.practice.length > 0 ? (
            <Panel>
              <PanelHeader>
                <div className="space-y-1">
                  <p className="eyebrow">Practice</p>
                  <PanelTitle className="text-sm">
                    Test yourself on {page.generation?.canonicalName ?? entity.canonicalName}
                  </PanelTitle>
                </div>
              </PanelHeader>
              <div className="ruled">
                {page.practice.map((option) => (
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

          {page.related.length > 0 && page.collection ? (
            <Panel>
              <PanelHeader>
                <PanelTitle className="text-sm">More {page.collection.label}</PanelTitle>
              </PanelHeader>
              <div className="ruled">
                {page.related.map((card) => (
                  <RecordRow key={card.id} entity={card} meta={card.meta} dateline={card.dateline} />
                ))}
              </div>
            </Panel>
          ) : null}
        </aside>
      </div>
    </PageShell>
  )
}
