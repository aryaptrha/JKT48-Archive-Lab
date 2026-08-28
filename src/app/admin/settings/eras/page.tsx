import type { Metadata } from 'next'
import Link from 'next/link'

import { DangerZone, FormBanner } from '@/components/admin/admin-chrome'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckboxField, Field, Input, Textarea } from '@/components/ui/field'
import { requireAdmin } from '@/lib/auth/session'
import { getAdminEras } from '@/server/queries/admin'
import { deleteEraAction, saveEraAction } from './actions'

export const metadata: Metadata = {
  title: 'Eras',
}

/**
 * `/admin/settings/eras` (PRD §4, §19, §25).
 *
 * Eras are the coarse historical chapters used by the Timeline and Time Machine
 * to group and navigate periods of JKT48 history.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminErasPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireAdmin()
  const query = await searchParams
  const eras = await getAdminEras()

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow={`${eras.length} historical eras`}
        title="Historical Eras"
        lead="Eras define the editorial chapter divisions of JKT48 history (§4). An era with no end date is considered the current/ongoing era."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/settings">Back to settings</Link>
          </Button>
        }
      />

      <FormBanner error={first(query.error)} notice={first(query.notice)} />

      {/* ------------------------------------------------ Add Era Form */}
      <section className="space-y-4 rounded-sm border border-rule bg-surface p-6">
        <h2 className="font-display text-base font-semibold text-ink-strong">
          Add historical era
        </h2>
        <form action={saveEraAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field htmlFor="new-name" label="Era title" required>
              <Input
                id="new-name"
                name="name"
                placeholder="e.g. Era New Era"
                required
              />
            </Field>

            <Field htmlFor="new-slug" label="Slug identifier" required>
              <Input
                id="new-slug"
                name="slug"
                placeholder="e.g. new-era"
                required
              />
            </Field>

            <Field htmlFor="new-order" label="Display order">
              <Input
                id="new-order"
                name="displayOrder"
                type="number"
                defaultValue={eras.length}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="new-start" label="Start date" required>
              <Input
                id="new-start"
                name="startDate"
                type="date"
                required
              />
            </Field>

            <Field htmlFor="new-end" label="End date (empty for current era)">
              <Input
                id="new-end"
                name="endDate"
                type="date"
              />
            </Field>
          </div>

          <Field htmlFor="new-desc" label="Historical description">
            <Textarea
              id="new-desc"
              name="description"
              placeholder="Narrative summary of what characterised this era."
            />
          </Field>

          <Button type="submit" variant="accent" size="sm">
            Create era
          </Button>
        </form>
      </section>

      {/* ------------------------------------------------ Existing Eras */}
      <Section className="space-y-6">
        <SectionHeading
          as="h2"
          eyebrow="Chronology"
          title="Catalogued eras"
          lead="Ordered chronologically. Eras provide high-level context on the Timeline."
        />

        <div className="space-y-6">
          {eras.map((era) => (
            <div
              key={era.id}
              className="space-y-4 rounded-sm border border-rule bg-surface p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-base font-semibold text-ink-strong">
                    {era.name}
                  </h3>
                  <Badge tone={era.endDate ? 'neutral' : 'sage'}>
                    {era.span}
                  </Badge>
                </div>
                <p className="font-mono text-catalog text-ink-faint">
                  Slug: {era.slug} · Order: {era.displayOrder}
                </p>
              </div>

              <form action={saveEraAction} className="space-y-4">
                <input type="hidden" name="id" value={era.id} />

                <div className="grid gap-4 sm:grid-cols-3">
                  <Field htmlFor={`name-${era.id}`} label="Era name" required>
                    <Input
                      id={`name-${era.id}`}
                      name="name"
                      defaultValue={era.name}
                      required
                    />
                  </Field>

                  <Field htmlFor={`slug-${era.id}`} label="Slug" required>
                    <Input
                      id={`slug-${era.id}`}
                      name="slug"
                      defaultValue={era.slug}
                      required
                    />
                  </Field>

                  <Field htmlFor={`order-${era.id}`} label="Display order">
                    <Input
                      id={`order-${era.id}`}
                      name="displayOrder"
                      type="number"
                      defaultValue={era.displayOrder}
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <Field htmlFor={`start-${era.id}`} label="Start date" required>
                    <Input
                      id={`start-${era.id}`}
                      name="startDate"
                      type="date"
                      defaultValue={era.startDate}
                      required
                    />
                  </Field>

                  <Field htmlFor={`end-${era.id}`} label="End date">
                    <Input
                      id={`end-${era.id}`}
                      name="endDate"
                      type="date"
                      defaultValue={era.endDate}
                    />
                  </Field>
                </div>

                <Field htmlFor={`desc-${era.id}`} label="Description">
                  <Textarea
                    id={`desc-${era.id}`}
                    name="description"
                    defaultValue={era.description ?? ''}
                  />
                </Field>

                <div className="flex items-center justify-between pt-2">
                  <Button type="submit" variant="outline" size="sm">
                    Save era
                  </Button>
                </div>
              </form>

              <DangerZone
                title="Delete historical era"
                consequence={
                  <p>
                    Deleting <strong>{era.name}</strong> removes this era label.
                    Entities and relationships in the knowledge graph will not be deleted.
                  </p>
                }
                confirmLabel="Confirm era deletion"
                confirmId={`confirm-era-${era.id}`}
              >
                <form action={deleteEraAction} className="space-y-4">
                  <input type="hidden" name="id" value={era.id} />
                  <CheckboxField
                    id={`confirm-era-${era.id}`}
                    name="confirm"
                    required
                    label={`Confirm deletion of ${era.name} era.`}
                  />
                  <Button type="submit" variant="destructive" size="sm">
                    Delete era
                  </Button>
                </form>
              </DangerZone>
            </div>
          ))}
        </div>
      </Section>
    </PageShell>
  )
}
