import type { Metadata } from 'next'
import Link from 'next/link'

import { FormBanner } from '@/components/admin/admin-chrome'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckboxField, Field, Input, Textarea } from '@/components/ui/field'
import { RELATIONSHIP_SECTIONS } from '@/domain/relationship-types'
import { EntityType } from '@/generated/prisma/enums'
import { requireAdmin } from '@/lib/auth/session'
import { getRelationshipTypes } from '@/server/services/admin-config'
import { retireRelationshipTypeAction, saveRelationshipTypeAction } from './actions'

export const metadata: Metadata = {
  title: 'Relationship types',
}

/**
 * `/admin/settings/relationship-types` (PRD §10, §19, §25).
 *
 * Vocabulary management for the knowledge graph. Types in use are retired rather than
 * deleted (onDelete: Restrict) so historical connections are preserved.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

const ENTITY_TYPES = Object.values(EntityType)

export default async function AdminRelationshipTypesPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireAdmin()
  const query = await searchParams
  const types = await getRelationshipTypes()

  // Build section mapping
  const typesByCode = new Map(types.map((t) => [t.code, t]))
  const unsectionedTypes = types.filter(
    (t) => !RELATIONSHIP_SECTIONS.some((sec) => sec.codes.includes(t.code as never)),
  )

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow={`${types.length} vocabulary terms`}
        title="Relationship Types"
        lead="The predicate vocabulary defining valid edges in the knowledge graph (§10). Allowed entity constraints and quizzability are controlled per type."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/settings">Back to settings</Link>
          </Button>
        }
      />

      <FormBanner error={first(query.error)} notice={first(query.notice)} />

      {/* ------------------------------------------------ Add Type Form */}
      <section className="space-y-4 rounded-sm border border-rule bg-surface p-6">
        <h2 className="font-display text-base font-semibold text-ink-strong">
          Add relationship type
        </h2>
        <form action={saveRelationshipTypeAction} className="space-y-4">
          <input type="hidden" name="isActive" value="true" />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field htmlFor="new-code" label="Code identifier (UPPER_CASE)" required>
              <Input
                id="new-code"
                name="code"
                placeholder="e.g. SUB_UNIT_OF"
                required
              />
            </Field>

            <Field htmlFor="new-name" label="Forward reading name" required>
              <Input
                id="new-name"
                name="name"
                placeholder="e.g. sub-unit of"
                required
              />
            </Field>

            <Field htmlFor="new-inv" label="Inverse reading name">
              <Input
                id="new-inv"
                name="inverseName"
                placeholder="e.g. contains sub-unit"
              />
            </Field>
          </div>

          <Field htmlFor="new-desc" label="Description">
            <Textarea
              id="new-desc"
              name="description"
              placeholder="What this relationship asserts between entities."
            />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <CheckboxField
              id="new-temporal"
              name="isTemporal"
              value="true"
              label="Temporal (bounded by dates)"
              hint="Carries validFrom / validTo in time machine"
            />
            <CheckboxField
              id="new-quizzable"
              name="isQuizzable"
              value="true"
              label="Quizzable"
              hint="Can be used as question/clue in games"
            />
            <CheckboxField
              id="new-directional"
              name="isDirectional"
              value="true"
              defaultChecked
              label="Directional"
              hint="Source → Target distinction"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              htmlFor="new-source-types"
              label="Allowed source types (empty = any)"
            >
              <select
                id="new-source-types"
                name="allowedSourceTypes"
                multiple
                size={5}
                className="w-full rounded-sm border border-rule-strong bg-surface-raised p-2 font-mono text-xs text-ink"
              >
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>

            <Field
              htmlFor="new-target-types"
              label="Allowed target types (empty = any)"
            >
              <select
                id="new-target-types"
                name="allowedTargetTypes"
                multiple
                size={5}
                className="w-full rounded-sm border border-rule-strong bg-surface-raised p-2 font-mono text-xs text-ink"
              >
                {ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <Button type="submit" variant="accent" size="sm">
            Create relationship type
          </Button>
        </form>
      </section>

      {/* ------------------------------------------------ Sections of Types */}
      {RELATIONSHIP_SECTIONS.map((section) => {
        const sectionTypes = section.codes
          .map((code) => typesByCode.get(code))
          .filter((t): t is NonNullable<typeof t> => Boolean(t))

        if (sectionTypes.length === 0) return null

        return (
          <Section key={section.label} className="space-y-6">
            <SectionHeading
              as="h2"
              eyebrow="Vocabulary group"
              title={`${section.label} relationships`}
            />

            <div className="space-y-6">
              {sectionTypes.map((type) => (
                <div
                  key={type.id}
                  className="space-y-4 rounded-sm border border-rule bg-surface p-6"
                >
                  <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule pb-3">
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-base font-semibold text-ink-strong">
                        {type.name}
                      </h3>
                      <Badge tone={type.isActive ? 'sage' : 'neutral'}>
                        {type.isActive ? 'Active' : 'Retired'}
                      </Badge>
                      {type.isTemporal ? <Badge tone="indigo">Temporal</Badge> : null}
                      {type.isQuizzable ? <Badge tone="ochre">Quizzable</Badge> : null}
                    </div>

                    <div className="flex items-center gap-3">
                      <span className="font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted">
                        {type.usageCount} edges in graph
                      </span>
                      {type.isActive ? (
                        <form action={retireRelationshipTypeAction}>
                          <input type="hidden" name="id" value={type.id} />
                          <Button type="submit" variant="outline" size="sm">
                            Retire type
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  <form action={saveRelationshipTypeAction} className="space-y-4">
                    <input type="hidden" name="id" value={type.id} />
                    <input type="hidden" name="isActive" value={type.isActive ? 'true' : 'false'} />

                    <div className="grid gap-4 sm:grid-cols-3">
                      <Field htmlFor={`code-${type.id}`} label="Code" required>
                        <Input
                          id={`code-${type.id}`}
                          name="code"
                          defaultValue={type.code}
                          required
                        />
                      </Field>

                      <Field htmlFor={`name-${type.id}`} label="Forward name" required>
                        <Input
                          id={`name-${type.id}`}
                          name="name"
                          defaultValue={type.name}
                          required
                        />
                      </Field>

                      <Field htmlFor={`inv-${type.id}`} label="Inverse name">
                        <Input
                          id={`inv-${type.id}`}
                          name="inverseName"
                          defaultValue={type.inverseName ?? ''}
                        />
                      </Field>
                    </div>

                    <Field htmlFor={`desc-${type.id}`} label="Description">
                      <Textarea
                        id={`desc-${type.id}`}
                        name="description"
                        defaultValue={type.description ?? ''}
                      />
                    </Field>

                    <div className="grid gap-4 sm:grid-cols-3">
                      <CheckboxField
                        id={`temp-${type.id}`}
                        name="isTemporal"
                        value="true"
                        defaultChecked={type.isTemporal}
                        label="Temporal"
                        hint="Supports date validity"
                      />
                      <CheckboxField
                        id={`quiz-${type.id}`}
                        name="isQuizzable"
                        value="true"
                        defaultChecked={type.isQuizzable}
                        label="Quizzable"
                        hint="Eligible for quiz clues"
                      />
                      <CheckboxField
                        id={`dir-${type.id}`}
                        name="isDirectional"
                        value="true"
                        defaultChecked={type.isDirectional}
                        label="Directional"
                        hint="Directional predicate"
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field
                        htmlFor={`src-${type.id}`}
                        label="Allowed source types"
                      >
                        <select
                          id={`src-${type.id}`}
                          name="allowedSourceTypes"
                          multiple
                          size={4}
                          defaultValue={type.allowedSourceTypes}
                          className="w-full rounded-sm border border-rule-strong bg-surface-raised p-2 font-mono text-xs text-ink"
                        >
                          {ENTITY_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </Field>

                      <Field
                        htmlFor={`tgt-${type.id}`}
                        label="Allowed target types"
                      >
                        <select
                          id={`tgt-${type.id}`}
                          name="allowedTargetTypes"
                          multiple
                          size={4}
                          defaultValue={type.allowedTargetTypes}
                          className="w-full rounded-sm border border-rule-strong bg-surface-raised p-2 font-mono text-xs text-ink"
                        >
                          {ENTITY_TYPES.map((t) => (
                            <option key={t} value={t}>
                              {t}
                            </option>
                          ))}
                        </select>
                      </Field>
                    </div>

                    <div className="pt-2">
                      <Button type="submit" variant="outline" size="sm">
                        Save type
                      </Button>
                    </div>
                  </form>
                </div>
              ))}
            </div>
          </Section>
        )
      })}

      {/* Unsectioned custom types */}
      {unsectionedTypes.length > 0 ? (
        <Section className="space-y-6">
          <SectionHeading
            as="h2"
            eyebrow="Custom types"
            title="Additional relationship types"
          />
          {/* Render unsectioned types */}
          <div className="space-y-6">
            {unsectionedTypes.map((type) => (
              <div
                key={type.id}
                className="space-y-4 rounded-sm border border-rule bg-surface p-6"
              >
                <h3 className="font-display text-base font-semibold text-ink-strong">
                  {type.name} ({type.code})
                </h3>
                <p className="text-xs text-ink-muted">{type.description}</p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}
    </PageShell>
  )
}
