import type { Metadata } from 'next'

import { DangerZone, FormBanner } from '@/components/admin/admin-chrome'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { CheckboxField, Field, Input, Select, Textarea } from '@/components/ui/field'

import { requireAdmin } from '@/lib/auth/session'
import { getMasteryConfig, masteryWeightOptions } from '@/server/services/admin-config'
import {
  deleteMasteryStatusAction,
  saveDimensionWeightAction,
  saveMasteryStatusAction,
} from './actions'

export const metadata: Metadata = {
  title: 'Mastery configuration',
}

/**
 * `/admin/mastery` (PRD §8, §19, §25).
 *
 * Status names, score boundaries and colors are NEVER hard-coded (§8.3).
 * They are configurable rows in the database.
 *
 * Gaps (uncovered scores) and overlaps (conflicting bands) are computed and reported.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminMasteryPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireAdmin()
  const query = await searchParams

  const config = await getMasteryConfig()
  const weightOptions = masteryWeightOptions()

  const hasCoverageIssues = config.gaps.length > 0 || config.overlaps.length > 0

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow={`${config.statuses.length} status tiers`}
        title="Mastery System Configuration"
        lead="Status names, thresholds and dimension weights are configuration, never code (§8.3). The archive has no hard-coded rank labels."
      />

      <FormBanner error={first(query.error)} notice={first(query.notice)} />

      {/* ------------------------------------------------ Coverage Diagnostics */}
      <section className="space-y-3 rounded-sm border border-rule bg-surface p-4">
        <h2 className="font-display text-sm font-semibold text-ink-strong">
          Score Coverage Health (0–100)
        </h2>

        {hasCoverageIssues ? (
          <div className="space-y-2">
            {config.gaps.map((gap, i) => (
              <p key={`gap-${i}`} className="text-xs text-accent font-medium">
                ⚠️ Coverage Gap: Score range {gap.from}–{gap.to} has no active status band.
              </p>
            ))}
            {config.overlaps.map((overlap, i) => (
              <p key={`overlap-${i}`} className="text-xs text-ochre font-medium">
                ⚠️ Overlapping Bands: “{overlap.first}” and “{overlap.second}” claim overlapping scores.
              </p>
            ))}
          </div>
        ) : (
          <p className="text-xs text-sage font-medium">
            ✓ Active mastery bands cover scores 0–100 seamlessly with no gaps or overlaps.
          </p>
        )}
      </section>

      {/* ------------------------------------------------ Add Status Band */}
      <section className="space-y-4 rounded-sm border border-rule bg-surface p-6">
        <h2 className="font-display text-base font-semibold text-ink-strong">
          Add mastery status tier
        </h2>
        <form action={saveMasteryStatusAction} className="space-y-4">
          <input type="hidden" name="isActive" value="true" />

          <div className="grid gap-4 sm:grid-cols-3">
            <Field htmlFor="new-name" label="Tier name" required>
              <Input
                id="new-name"
                name="name"
                placeholder="e.g. Mastered, Expert, Scholar"
                required
              />
            </Field>

            <Field htmlFor="new-slug" label="Slug identifier" required>
              <Input
                id="new-slug"
                name="slug"
                placeholder="e.g. mastered"
                required
              />
            </Field>

            <Field htmlFor="new-color" label="Color Hex">
              <Input
                id="new-color"
                name="colorHex"
                placeholder="#888078"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field htmlFor="new-min" label="Min score (0–100)" required>
              <Input
                id="new-min"
                name="minScore"
                type="number"
                min={0}
                max={100}
                defaultValue={80}
                required
              />
            </Field>

            <Field htmlFor="new-max" label="Max score (0–100)" required>
              <Input
                id="new-max"
                name="maxScore"
                type="number"
                min={0}
                max={100}
                defaultValue={94}
                required
              />
            </Field>

            <Field htmlFor="new-order" label="Display order">
              <Input
                id="new-order"
                name="displayOrder"
                type="number"
                defaultValue={config.statuses.length}
              />
            </Field>
          </div>

          <Field htmlFor="new-desc" label="Description">
            <Textarea
              id="new-desc"
              name="description"
              placeholder="What this tier indicates about a fan's historical knowledge."
            />
          </Field>

          <Button type="submit" variant="accent" size="sm">
            Create status tier
          </Button>
        </form>
      </section>

      {/* ------------------------------------------------ Existing Status Bands */}
      <Section className="space-y-6">
        <SectionHeading
          as="h2"
          eyebrow="Tiers"
          title="Mastery status bands"
          lead="Ordered by score range. At least one active band must remain."
        />

        <div className="space-y-6">
          {config.statuses.map((status) => (
            <div
              key={status.id}
              className="space-y-4 rounded-sm border border-rule bg-surface p-6"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-3">
                <div className="flex items-center gap-2">
                  <h3 className="font-display text-base font-semibold text-ink-strong">
                    {status.name}
                  </h3>
                  <Badge tone={status.isActive ? 'sage' : 'neutral'}>
                    {status.minScore}–{status.maxScore}%
                  </Badge>
                  {status.colorHex ? (
                    <span
                      className="inline-block size-3 rounded-full border border-rule-strong"
                      style={{ backgroundColor: status.colorHex }}
                    />
                  ) : null}
                </div>
                <p className="font-mono text-catalog text-ink-faint">
                  Slug: {status.slug} · Order: {status.displayOrder}
                </p>
              </div>

              <form action={saveMasteryStatusAction} className="space-y-4">
                <input type="hidden" name="id" value={status.id} />

                <div className="grid gap-4 sm:grid-cols-4">
                  <Field htmlFor={`name-${status.id}`} label="Tier name" required>
                    <Input
                      id={`name-${status.id}`}
                      name="name"
                      defaultValue={status.name}
                      required
                    />
                  </Field>

                  <Field htmlFor={`slug-${status.id}`} label="Slug" required>
                    <Input
                      id={`slug-${status.id}`}
                      name="slug"
                      defaultValue={status.slug}
                      required
                    />
                  </Field>

                  <Field htmlFor={`min-${status.id}`} label="Min score" required>
                    <Input
                      id={`min-${status.id}`}
                      name="minScore"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={status.minScore}
                      required
                    />
                  </Field>

                  <Field htmlFor={`max-${status.id}`} label="Max score" required>
                    <Input
                      id={`max-${status.id}`}
                      name="maxScore"
                      type="number"
                      min={0}
                      max={100}
                      defaultValue={status.maxScore}
                      required
                    />
                  </Field>
                </div>

                <div className="grid gap-4 sm:grid-cols-3">
                  <Field htmlFor={`color-${status.id}`} label="Color Hex">
                    <Input
                      id={`color-${status.id}`}
                      name="colorHex"
                      defaultValue={status.colorHex ?? ''}
                    />
                  </Field>

                  <Field htmlFor={`order-${status.id}`} label="Display order">
                    <Input
                      id={`order-${status.id}`}
                      name="displayOrder"
                      type="number"
                      defaultValue={status.displayOrder}
                    />
                  </Field>

                  <Field htmlFor={`active-${status.id}`} label="Status active">
                    <Select
                      id={`active-${status.id}`}
                      name="isActive"
                      defaultValue={status.isActive ? 'true' : 'false'}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </Select>
                  </Field>
                </div>

                <Field htmlFor={`desc-${status.id}`} label="Description">
                  <Textarea
                    id={`desc-${status.id}`}
                    name="description"
                    defaultValue={status.description ?? ''}
                  />
                </Field>

                <div className="flex items-center justify-between pt-2">
                  <Button type="submit" variant="outline" size="sm">
                    Save band
                  </Button>
                </div>
              </form>

              <DangerZone
                title="Delete status tier"
                consequence={
                  <p>
                    Deleting <strong>{status.name}</strong> removes this score tier.
                    At least one active band must remain in the database (§8.3).
                  </p>
                }
                confirmLabel="Confirm tier deletion"
                confirmId={`confirm-status-${status.id}`}
              >
                <form action={deleteMasteryStatusAction} className="space-y-4">
                  <input type="hidden" name="id" value={status.id} />
                  <CheckboxField
                    id={`confirm-status-${status.id}`}
                    name="confirm"
                    required
                    label={`Confirm deletion of ${status.name} status band.`}
                  />
                  <Button type="submit" variant="destructive" size="sm">
                    Delete status band
                  </Button>
                </form>
              </DangerZone>
            </div>
          ))}
        </div>
      </Section>

      {/* ------------------------------------------------ Dimension Weights Matrix */}
      <Section className="space-y-6">
        <SectionHeading
          as="h2"
          eyebrow="Roll-up formula"
          title="Dimension weights"
          lead="Weights determine how knowledge dimensions (members, teams, songs, history, relationships) contribute to the overall generation mastery roll-up (§8.2)."
        />

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {weightOptions.scopes.map((scope) => (
            <div key={scope.value} className="space-y-4 rounded-sm border border-rule bg-surface p-4">
              <h3 className="font-display text-sm font-semibold text-ink-strong">
                Scope: {scope.label}
              </h3>

              <div className="space-y-3">
                {weightOptions.dimensions.map((dim) => {
                  const currentWeight =
                    config.weights.find(
                      (w) => w.scope === scope.value && w.dimension === dim.value,
                    )?.weight ?? 1

                  return (
                    <form
                      key={`${scope.value}-${dim.value}`}
                      action={saveDimensionWeightAction}
                      className="flex items-end gap-2 border-b border-rule pb-2"
                    >
                      <input type="hidden" name="scope" value={scope.value} />
                      <input type="hidden" name="dimension" value={dim.value} />

                      <div className="flex-1 space-y-1">
                        <label
                          htmlFor={`wt-${scope.value}-${dim.value}`}
                          className="block font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted"
                        >
                          {dim.label}
                        </label>
                        <Input
                          id={`wt-${scope.value}-${dim.value}`}
                          name="weight"
                          type="number"
                          min={0}
                          max={100}
                          defaultValue={currentWeight}
                          className="h-8 text-xs font-mono"
                        />
                      </div>

                      <Button type="submit" variant="outline" size="sm" className="h-8 text-xs">
                        Save
                      </Button>
                    </form>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Section>
    </PageShell>
  )
}
