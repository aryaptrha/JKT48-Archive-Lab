import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

import {
  AuditTrail,
  DangerZone,
  FormBanner,
  MetaRow,
} from '@/components/admin/admin-chrome'
import { RelationshipForm } from '@/components/admin/relationship-form'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckboxField, Field, Input } from '@/components/ui/field'
import { requireAdmin } from '@/lib/auth/session'
import { toISODate, today } from '@/lib/date'
import { getRelationshipEditorPage } from '@/server/queries/admin'
import {
  closeRelationshipAction,
  deleteRelationshipAction,
  saveRelationshipAction,
} from '../actions'

export const metadata: Metadata = {
  title: 'Edit relationship',
}

/**
 * `/admin/relationships/[id]` (PRD §10, §16, §25).
 *
 * Provides relationship editing, closing (setting valid_to), audit trail and deletion.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function EditRelationshipPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: SearchParams
}) {
  await requireAdmin()
  const [{ id }, query] = await Promise.all([params, searchParams])

  const editor = await getRelationshipEditorPage({ id })
  if (!editor) notFound()

  const { defaults, types, sources, sourceEntity, targetEntity, history } = editor
  const typeDef = types.find((t) => t.id === defaults.relationshipTypeId)
  const isCurrentlyOpen = defaults.validFrom && !defaults.validTo

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow="Edge in knowledge graph"
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            <span>
              {sourceEntity && targetEntity && typeDef
                ? `${sourceEntity.canonicalName} → ${typeDef.name} → ${targetEntity.canonicalName}`
                : 'Edit relationship'}
            </span>
            {isCurrentlyOpen ? <Badge tone="sage">Active / Open</Badge> : null}
          </span>
        }
        lead="Relationships are first-class domain entities that model historical truth across time (§10, §11)."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/relationships">Back to relationships</Link>
          </Button>
        }
      />

      <FormBanner error={first(query.error)} notice={first(query.notice)} />

      <div className="grid gap-10 lg:grid-cols-[1fr_320px]">
        {/* ---------------------------------------------------- Main editor */}
        <div className="space-y-8">
          <div className="rounded-sm border border-rule bg-surface p-6">
            <RelationshipForm
              defaults={defaults}
              types={types}
              sources={sources}
              sourceEntity={sourceEntity}
              targetEntity={targetEntity}
              action={saveRelationshipAction}
              submitLabel="Save changes"
              cancelHref="/admin/relationships"
            />
          </div>

          {/* ------------------------------------------------- Audit trail */}
          <Section>
            <SectionHeading
              as="h2"
              eyebrow="Change history"
              title="Audit trail"
              lead="Append-only log of changes made to this relationship edge (§17)."
            />
            <AuditTrail entries={history} />
          </Section>

          {/* ------------------------------------------------- Danger zone */}
          <DangerZone
            title="Delete relationship"
            consequence={
              <p>
                Deleting this relationship will permanently sever the edge connecting{' '}
                <strong>{sourceEntity?.canonicalName ?? 'source'}</strong> and{' '}
                <strong>{targetEntity?.canonicalName ?? 'target'}</strong> in the knowledge graph.
                If this tenure or event has ended, consider <em>closing</em> the relationship instead of deleting it.
              </p>
            }
            confirmLabel="Confirm relationship deletion"
            confirmId="confirm-rel-delete"
          >
            <form action={deleteRelationshipAction} className="space-y-4">
              <input type="hidden" name="id" value={defaults.id ?? ''} />
              <input type="hidden" name="sourceEntityId" value={defaults.sourceEntityId} />
              <input type="hidden" name="targetEntityId" value={defaults.targetEntityId} />

              <CheckboxField
                id="confirm-rel-delete"
                name="confirm"
                required
                label="I understand that deleting this edge permanently removes it from the graph."
              />

              <Button type="submit" variant="destructive" size="sm">
                Permanently delete relationship
              </Button>
            </form>
          </DangerZone>
        </div>

        {/* ------------------------------------------------- Sidebar tools */}
        <aside className="space-y-8">
          {/* ------------------------------------------- Close relationship */}
          {typeDef?.isTemporal && !defaults.validTo ? (
            <div className="space-y-3 rounded-sm border border-rule bg-surface p-4">
              <h2 className="font-display text-sm font-semibold text-ink-strong">
                Close relationship (§11)
              </h2>
              <p className="text-xs leading-relaxed text-ink-muted">
                Closing records that a tenure or role has ended without deleting historical truth.
              </p>
              <form action={closeRelationshipAction} className="space-y-3 pt-1">
                <input type="hidden" name="id" value={defaults.id ?? ''} />
                <Field
                  htmlFor="close-valid-to"
                  label="End date (valid to)"
                  required
                >
                  <Input
                    id="close-valid-to"
                    name="validTo"
                    type="date"
                    defaultValue={toISODate(today())}
                    required
                  />
                </Field>
                <Button type="submit" variant="outline" size="sm" className="w-full">
                  Close relationship as of date
                </Button>
              </form>
            </div>
          ) : null}

          {/* -------------------------------------------------- Facts dl */}
          <div className="space-y-2 rounded-sm border border-rule bg-surface p-4">
            <h2 className="font-display text-sm font-semibold text-ink-strong">
              Edge details
            </h2>
            <dl className="divide-y divide-rule text-xs">
              <MetaRow label="Type code">
                <code className="font-mono text-ink-strong">{typeDef?.code ?? '—'}</code>
              </MetaRow>
              <MetaRow label="Temporal">
                {typeDef?.isTemporal ? 'Yes (bounded)' : 'No (permanent)'}
              </MetaRow>
              <MetaRow label="Weight">{defaults.weight}</MetaRow>
              {sourceEntity ? (
                <MetaRow label="Source link">
                  <Link
                    href={`/admin/entities/${sourceEntity.id}`}
                    className="font-medium text-ink transition-colors hover:text-accent"
                  >
                    {sourceEntity.canonicalName} →
                  </Link>
                </MetaRow>
              ) : null}
              {targetEntity ? (
                <MetaRow label="Target link">
                  <Link
                    href={`/admin/entities/${targetEntity.id}`}
                    className="font-medium text-ink transition-colors hover:text-accent"
                  >
                    {targetEntity.canonicalName} →
                  </Link>
                </MetaRow>
              ) : null}
            </dl>
          </div>
        </aside>
      </div>
    </PageShell>
  )
}
