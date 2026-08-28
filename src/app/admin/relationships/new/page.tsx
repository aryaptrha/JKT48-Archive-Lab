import type { Metadata } from 'next'
import Link from 'next/link'

import { RelationshipForm } from '@/components/admin/relationship-form'
import { PageShell, SectionHeading } from '@/components/archive/section'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/field'
import { requireAdmin } from '@/lib/auth/session'
import { findEntityById } from '@/server/repositories/entity-repository'
import {
  getRelationshipEditorPage,
  searchEntityPicker,
} from '@/server/queries/admin'
import { toEntityRef } from '@/server/services/entity-mapper'
import { saveRelationshipAction } from '../actions'

export const metadata: Metadata = {
  title: 'New relationship',
}

/**
 * `/admin/relationships/new` (PRD §10, §16, §25).
 *
 * Relationship endpoints are picked via GET search forms in the URL (`?source=`, `?target=`).
 * This preserves linkability, works without client-side JS dependency, and allows
 * picking draft records as endpoints.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function NewRelationshipPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireAdmin()
  const query = await searchParams

  const sourceId = first(query.sourceEntityId) || first(query.source)
  const targetId = first(query.targetEntityId) || first(query.target)
  const sourceQuery = first(query.sourceQuery)?.trim() || ''
  const targetQuery = first(query.targetQuery)?.trim() || ''

  const [editor, targetEntityRow, sourceResults, targetResults] = await Promise.all([
    getRelationshipEditorPage({ sourceEntityId: sourceId }),
    targetId ? findEntityById(targetId, true) : Promise.resolve(null),
    sourceQuery.length >= 2 ? searchEntityPicker(sourceQuery) : Promise.resolve([]),
    targetQuery.length >= 2 ? searchEntityPicker(targetQuery) : Promise.resolve([]),
  ])

  if (!editor) {
    throw new Error('Failed to load relationship editor defaults')
  }

  const targetEntity = targetEntityRow ? toEntityRef(targetEntityRow) : null
  const sourceEntity = editor.sourceEntity

  const defaults = {
    ...editor.defaults,
    sourceEntityId: sourceEntity?.id ?? '',
    targetEntityId: targetEntity?.id ?? '',
  }

  // Preserve other URL parameters when selecting an endpoint
  function makePickerUrl(key: 'source' | 'target', entityId: string) {
    const params = new URLSearchParams()
    if (key === 'source') {
      params.set('source', entityId)
      if (targetId) params.set('target', targetId)
    } else {
      if (sourceId) params.set('source', sourceId)
      params.set('target', entityId)
    }
    return `/admin/relationships/new?${params.toString()}`
  }

  return (
    <PageShell className="space-y-8">
      <SectionHeading
        as="h1"
        eyebrow="Knowledge graph"
        title="New relationship"
        lead="Link two entities together with a typed predicate, temporal window and source attribution. Relationships form the core domain of the archive (§10, §28)."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/relationships">Back to relationships</Link>
          </Button>
        }
      />

      {/* ------------------------------------------------ Endpoint search panels */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Source selector */}
        <section className="space-y-3 rounded-sm border border-rule bg-surface p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-ink-strong">
              1. Choose Source Record
            </h2>
            {sourceEntity ? (
              <span className="font-mono text-catalog text-sage font-medium">Selected ✓</span>
            ) : null}
          </div>

          <form method="GET" action="/admin/relationships/new" className="flex gap-2">
            {targetId ? <input type="hidden" name="target" value={targetId} /> : null}
            <Input
              name="sourceQuery"
              defaultValue={sourceQuery}
              placeholder="Search source entity name..."
              className="flex-1"
            />
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>

          {sourceResults.length > 0 ? (
            <ul className="divide-y divide-rule border-t border-rule pt-2 text-xs">
              {sourceResults.map((opt) => (
                <li key={opt.id} className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <p className="font-medium text-ink-strong">{opt.canonicalName}</p>
                    <p className="font-mono text-catalog text-ink-faint">
                      {opt.typeLabel} · {opt.slug}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={makePickerUrl('source', opt.id)}>Select as source</Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : sourceQuery.length >= 2 ? (
            <p className="text-xs text-ink-faint pt-1">No matching entities found.</p>
          ) : null}
        </section>

        {/* Target selector */}
        <section className="space-y-3 rounded-sm border border-rule bg-surface p-4">
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="font-display text-sm font-semibold text-ink-strong">
              2. Choose Target Record
            </h2>
            {targetEntity ? (
              <span className="font-mono text-catalog text-sage font-medium">Selected ✓</span>
            ) : null}
          </div>

          <form method="GET" action="/admin/relationships/new" className="flex gap-2">
            {sourceId ? <input type="hidden" name="source" value={sourceId} /> : null}
            <Input
              name="targetQuery"
              defaultValue={targetQuery}
              placeholder="Search target entity name..."
              className="flex-1"
            />
            <Button type="submit" variant="outline" size="sm">
              Search
            </Button>
          </form>

          {targetResults.length > 0 ? (
            <ul className="divide-y divide-rule border-t border-rule pt-2 text-xs">
              {targetResults.map((opt) => (
                <li key={opt.id} className="flex items-center justify-between py-2">
                  <div className="space-y-0.5">
                    <p className="font-medium text-ink-strong">{opt.canonicalName}</p>
                    <p className="font-mono text-catalog text-ink-faint">
                      {opt.typeLabel} · {opt.slug}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={makePickerUrl('target', opt.id)}>Select as target</Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : targetQuery.length >= 2 ? (
            <p className="text-xs text-ink-faint pt-1">No matching entities found.</p>
          ) : null}
        </section>
      </div>

      {/* ---------------------------------------------------- Main editor form */}
      <div className="rounded-sm border border-rule bg-surface p-6">
        <RelationshipForm
          defaults={defaults}
          types={editor.types}
          sources={editor.sources}
          sourceEntity={sourceEntity}
          targetEntity={targetEntity}
          action={saveRelationshipAction}
          submitLabel="Create relationship"
          cancelHref="/admin/relationships"
        />
      </div>
    </PageShell>
  )
}
