import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  AuditTrail,
  DangerZone,
  FormBanner,
  MetaRow,
  PublishBadge,
} from '@/components/admin/admin-chrome'
import { EntityForm } from '@/components/admin/entity-form'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { Button } from '@/components/ui/button'
import { CheckboxField } from '@/components/ui/field'
import { entityTypeLabel } from '@/domain/entity-taxonomy'
import { requireAdmin } from '@/lib/auth/session'
import { getEntityEditorPage } from '@/server/queries/admin'
import { deleteEntityAction, saveEntityAction, setPublishedAction } from '../actions'

export const metadata: Metadata = {
  title: 'Edit record',
}

/**
 * `/admin/entities/[id]` (PRD §15, §19, §25).
 *
 * Provides full record editing, publish/unpublish toggle, related relationships
 * overview, change history audit trail, and gated deletion in the DangerZone.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function EditEntityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: SearchParams
}) {
  await requireAdmin()
  const [{ id }, query] = await Promise.all([params, searchParams])

  const editor = await getEntityEditorPage({ id })
  if (!editor) notFound()

  const { defaults, edges, edgeCount, sources, history, publicHref } = editor
  const typeName = entityTypeLabel(defaults.entityType)

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow={typeName}
        title={
          <span className="inline-flex items-center gap-3">
            <span>{defaults.canonicalName}</span>
            <PublishBadge isPublished={defaults.isPublished} />
          </span>
        }
        lead={defaults.summary || 'No summary catalogued yet.'}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {publicHref ? (
              <Button asChild variant="outline" size="sm">
                <Link href={publicHref} target="_blank" rel="noreferrer">
                  View public page ↗
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="accent" size="sm">
              <Link href={`/admin/relationships/new?sourceEntityId=${defaults.id}`}>
                + Add relationship
              </Link>
            </Button>
          </div>
        }
      />

      <FormBanner error={first(query.error)} notice={first(query.notice)} />

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        {/* -------------------------------------------------------- main editor */}
        <div className="space-y-8">
          <EntityForm
            defaults={defaults}
            typeLabel={typeName}
            sources={sources}
            action={saveEntityAction}
            submitLabel="Save changes"
            cancelHref="/admin/entities"
          />

          {/* ------------------------------------------------------- audit trail */}
          <Section>
            <SectionHeading
              as="h2"
              eyebrow="Change history"
              title="Audit trail"
              lead="Append-only log of mutations made to this record (§17)."
            />
            <AuditTrail entries={history} />
          </Section>

          {/* ------------------------------------------------------- danger zone */}
          <DangerZone
            title="Delete record"
            consequence={
              <p>
                Deleting <strong>{defaults.canonicalName}</strong> will permanently remove
                this record and cascade-delete its{' '}
                <strong>
                  {edgeCount} relationship{edgeCount === 1 ? '' : 's'}
                </strong>{' '}
                from the knowledge graph. This action cannot be undone.
              </p>
            }
            confirmLabel="Confirm record deletion"
            confirmId="confirm-entity-delete"
          >
            <form action={deleteEntityAction} className="space-y-4">
              <input type="hidden" name="id" value={defaults.id ?? ''} />
              <input type="hidden" name="entityType" value={defaults.entityType} />
              <input type="hidden" name="canonicalName" value={defaults.canonicalName} />
              <input type="hidden" name="expectedEdgeCount" value={edgeCount} />

              <CheckboxField
                id="confirm-entity-delete"
                name="confirm"
                required
                label={`I understand that deleting ${defaults.canonicalName} will also remove ${edgeCount} connecting relationship${edgeCount === 1 ? '' : 's'}.`}
              />

              <Button type="submit" variant="destructive" size="sm">
                Permanently delete record
              </Button>
            </form>
          </DangerZone>
        </div>

        {/* ----------------------------------------------------- sidebar facts */}
        <aside className="space-y-8">
          {/* ---------------------------------------------------- publish toggle */}
          <div className="space-y-3 rounded-sm border border-rule bg-surface p-4">
            <h2 className="font-display text-sm font-semibold text-ink-strong">
              Visibility & Publishing
            </h2>
            <p className="text-xs leading-relaxed text-ink-muted">
              {defaults.isPublished
                ? 'This record is published and visible on the encyclopedia and active in games.'
                : 'This record is a draft. It is invisible on the public site and excluded from quiz generation.'}
            </p>
            <form action={setPublishedAction} className="pt-1">
              <input type="hidden" name="id" value={defaults.id ?? ''} />
              <input type="hidden" name="entityType" value={defaults.entityType} />
              <input type="hidden" name="slug" value={defaults.slug} />
              <input
                type="hidden"
                name="isPublished"
                value={defaults.isPublished ? 'false' : 'true'}
              />
              <Button
                type="submit"
                variant={defaults.isPublished ? 'outline' : 'accent'}
                size="sm"
                className="w-full"
              >
                {defaults.isPublished ? 'Unpublish record' : 'Publish record'}
              </Button>
            </form>
          </div>

          {/* ------------------------------------------------------- metadata dl */}
          <div className="space-y-2 rounded-sm border border-rule bg-surface p-4">
            <h2 className="font-display text-sm font-semibold text-ink-strong">
              Record facts
            </h2>
            <dl className="divide-y divide-rule text-xs">
              <MetaRow label="Slug">
                <code className="font-mono text-ink-strong">{defaults.slug}</code>
              </MetaRow>
              <MetaRow label="Type">{typeName}</MetaRow>
              <MetaRow label="Prominence">{defaults.prominence} / 100</MetaRow>
              {defaults.activeFrom || defaults.activeTo ? (
                <MetaRow label="Active span">
                  {defaults.activeFrom || '—'} → {defaults.activeTo || 'present'}
                </MetaRow>
              ) : null}
              <MetaRow label="Connecting edges">
                <Link
                  href={`/admin/relationships?entityId=${defaults.id}`}
                  className="font-medium text-ink transition-colors hover:text-accent"
                >
                  {edgeCount} relationship{edgeCount === 1 ? '' : 's'} →
                </Link>
              </MetaRow>
            </dl>
          </div>

          {/* ------------------------------------------------- connected edges */}
          <div className="space-y-3 rounded-sm border border-rule bg-surface p-4">
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="font-display text-sm font-semibold text-ink-strong">
                Connected edges
              </h2>
              <Link
                href={`/admin/relationships?entityId=${defaults.id}`}
                className="font-mono text-catalog uppercase tracking-[0.09em] text-accent hover:underline"
              >
                View all ({edgeCount})
              </Link>
            </div>
            {edges.length > 0 ? (
              <ul className="divide-y divide-rule text-xs">
                {edges.slice(0, 8).map((edge) => (
                  <li key={edge.id} className="py-2 space-y-0.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-catalog font-medium text-ink-muted">
                        {edge.typeName}
                      </span>
                      <Link
                        href={edge.editHref}
                        className="font-mono text-catalog text-accent hover:underline"
                      >
                        Edit
                      </Link>
                    </div>
                    <p className="text-ink truncate">
                      {edge.source.id === defaults.id ? (
                        <>→ {edge.target.canonicalName}</>
                      ) : (
                        <>← {edge.source.canonicalName}</>
                      )}
                    </p>
                    {edge.validity ? (
                      <p className="font-mono text-catalog text-ink-faint">
                        {edge.validity}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-ink-faint">
                No relationships linked yet. Click “+ Add relationship” to connect this record.
              </p>
            )}
          </div>
        </aside>
      </div>
    </PageShell>
  )
}
