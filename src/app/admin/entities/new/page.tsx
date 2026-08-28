import type { Metadata } from 'next'
import Link from 'next/link'

import { EntityForm } from '@/components/admin/entity-form'
import { PageShell, SectionHeading } from '@/components/archive/section'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import {
  CATEGORY_BY_ENTITY_TYPE,
  ENTITY_CATEGORY_LABELS,
  ENTITY_TYPE_LABELS,
  entityTypeLabel,
} from '@/domain/entity-taxonomy'
import { EntityCategory, EntityType } from '@/generated/prisma/enums'
import { requireAdmin } from '@/lib/auth/session'
import { getEntityEditorPage } from '@/server/queries/admin'
import { saveEntityAction } from '../actions'

export const metadata: Metadata = {
  title: 'New record',
}

/**
 * `/admin/entities/new` (PRD §15, §19, §25).
 *
 * `type` is chosen via a separate GET form at the top of the screen before editing
 * begins. It is deliberately NOT a field inside `EntityForm`: the entity type
 * dictates which specialized table the row writes to and which attribute fields are
 * rendered. Changing it mid-edit would orphan one specialized row and leave another
 * blank.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

const ENTITY_TYPES = Object.values(EntityType)
const CATEGORIES = Object.values(EntityCategory)

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function parseEntityType(value: string | undefined): EntityType {
  return value && (ENTITY_TYPES as string[]).includes(value)
    ? (value as EntityType)
    : EntityType.MEMBER
}

export default async function NewEntityPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireAdmin()
  const query = await searchParams
  const entityType = parseEntityType(first(query.type))

  const editor = await getEntityEditorPage({ entityType })
  if (!editor) {
    throw new Error('Failed to load entity editor page defaults')
  }

  // Group types by category for the selector optgroups
  const typesByCategory = CATEGORIES.map((category) => {
    const types = (Object.keys(CATEGORY_BY_ENTITY_TYPE) as EntityType[]).filter(
      (t) => CATEGORY_BY_ENTITY_TYPE[t] === category,
    )
    return {
      category,
      label: ENTITY_CATEGORY_LABELS[category],
      types: types.map((t) => ({ value: t, label: ENTITY_TYPE_LABELS[t] })),
    }
  }).filter((group) => group.types.length > 0)

  return (
    <PageShell className="space-y-8">
      <SectionHeading
        as="h1"
        eyebrow="Create record"
        title="New record"
        lead="Records hold canonical facts and specialized attributes. Relationships (team memberships, generations, captaincies and center credits) are linked separately in the relationship editor (§10)."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/entities">Back to records</Link>
          </Button>
        }
      />

      {/* -------------------------------------------------------- type picker */}
      <section className="space-y-2 rounded-sm border border-rule bg-surface p-4">
        <form method="GET" action="/admin/entities/new" className="flex flex-wrap items-end gap-3">
          <div className="space-y-1.5">
            <label
              htmlFor="type-picker"
              className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted"
            >
              Record type (determines schema & fields)
            </label>
            <Select id="type-picker" name="type" defaultValue={entityType} className="w-full sm:w-64">
              {typesByCategory.map((group) => (
                <optgroup key={group.category} label={group.label}>
                  {group.types.map((type) => (
                    <option key={type.value} value={type.value}>
                      {type.label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          </div>
          <Button type="submit" variant="outline" size="sm">
            Change type
          </Button>
        </form>
      </section>

      {/* ------------------------------------------------------------- editor */}
      <EntityForm
        defaults={editor.defaults}
        typeLabel={entityTypeLabel(entityType)}
        sources={editor.sources}
        action={saveEntityAction}
        submitLabel="Create record"
        cancelHref="/admin/entities"
      />
    </PageShell>
  )
}
