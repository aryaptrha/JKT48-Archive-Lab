import type { Metadata } from 'next'

import { DangerZone, FormBanner } from '@/components/admin/admin-chrome'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { Button } from '@/components/ui/button'
import { CheckboxField, Field, Input, Select, Textarea } from '@/components/ui/field'
import { SourceType } from '@/generated/prisma/enums'
import { requireAdmin } from '@/lib/auth/session'
import { toISODate } from '@/lib/date'
import { getSources } from '@/server/services/admin-config'
import { deleteSourceAction, saveSourceAction } from './actions'

export const metadata: Metadata = {
  title: 'Sources',
}

/**
 * `/admin/sources` — Data provenance management (PRD §13, §19, §25).
 *
 * Every claim in the archive should be traceable to its origin. Deleting a source
 * unlinks citations (FK SetNull) rather than cascading.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

const SOURCE_TYPES = Object.values(SourceType)

export default async function AdminSourcesPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireAdmin()
  const query = await searchParams
  const sources = await getSources()

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow={`${sources.length} sources registered`}
        title="Sources & Provenance"
        lead="Provenance anchors archive facts to primary references (§13). Removing a source leaves citing records unsourced rather than deleting them."
      />

      <FormBanner error={first(query.error)} notice={first(query.notice)} />

      {/* ---------------------------------------------------- Add Source Form */}
      <section className="space-y-4 rounded-sm border border-rule bg-surface p-6">
        <h2 className="font-display text-base font-semibold text-ink-strong">
          Add new source
        </h2>
        <form action={saveSourceAction} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="source-name" label="Source name" required>
              <Input
                id="source-name"
                name="name"
                placeholder="e.g. JKT48 Official Website"
                required
              />
            </Field>

            <Field htmlFor="source-type" label="Source type" required>
              <Select id="source-type" name="sourceType" defaultValue={SourceType.FANDOM}>
                {SOURCE_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field htmlFor="source-url" label="URL (optional)">
              <Input
                id="source-url"
                name="url"
                type="url"
                placeholder="https://..."
              />
            </Field>

            <Field htmlFor="source-retrieved" label="Retrieved date">
              <Input
                id="source-retrieved"
                name="retrievedAt"
                type="date"
              />
            </Field>
          </div>

          <Field htmlFor="source-notes" label="Curator notes">
            <Textarea
              id="source-notes"
              name="notes"
              placeholder="Notes on scope, reliability, or archive history."
            />
          </Field>

          <Button type="submit" variant="accent" size="sm">
            Create source
          </Button>
        </form>
      </section>

      {/* ------------------------------------------------------- Existing Sources */}
      <Section className="space-y-6">
        <SectionHeading
          as="h2"
          eyebrow="Registered citations"
          title="Existing sources"
          lead="Each source shows how many entities and relationships rely on it."
        />

        {sources.length > 0 ? (
          <div className="space-y-6">
            {sources.map((source) => (
              <div
                key={source.id}
                className="space-y-6 rounded-sm border border-rule bg-surface p-6"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule pb-3">
                  <div>
                    <h3 className="font-display text-base font-semibold text-ink-strong">
                      {source.name}
                    </h3>
                    <p className="font-mono text-catalog text-ink-faint">
                      {source.sourceType}
                      {source.url ? (
                        <>
                          {' · '}
                          <a
                            href={source.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-accent hover:underline"
                          >
                            {source.url} ↗
                          </a>
                        </>
                      ) : null}
                    </p>
                  </div>
                  <div className="font-mono text-catalog uppercase tracking-[0.09em] text-ink-muted">
                    {source.usage.entities} entities · {source.usage.relationships} edges (
                    <strong className="text-ink-strong">{source.usage.total} citations</strong>)
                  </div>
                </div>

                <form action={saveSourceAction} className="space-y-4">
                  <input type="hidden" name="id" value={source.id} />

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field htmlFor={`name-${source.id}`} label="Source name" required>
                      <Input
                        id={`name-${source.id}`}
                        name="name"
                        defaultValue={source.name}
                        required
                      />
                    </Field>

                    <Field htmlFor={`type-${source.id}`} label="Source type" required>
                      <Select
                        id={`type-${source.id}`}
                        name="sourceType"
                        defaultValue={source.sourceType}
                      >
                        {SOURCE_TYPES.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </Select>
                    </Field>
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field htmlFor={`url-${source.id}`} label="URL">
                      <Input
                        id={`url-${source.id}`}
                        name="url"
                        type="url"
                        defaultValue={source.url ?? ''}
                      />
                    </Field>

                    <Field htmlFor={`retrieved-${source.id}`} label="Retrieved date">
                      <Input
                        id={`retrieved-${source.id}`}
                        name="retrievedAt"
                        type="date"
                        defaultValue={toISODate(source.retrievedAt) ?? ''}
                      />
                    </Field>
                  </div>

                  <Field htmlFor={`notes-${source.id}`} label="Curator notes">
                    <Textarea
                      id={`notes-${source.id}`}
                      name="notes"
                      defaultValue={source.notes ?? ''}
                    />
                  </Field>

                  <div className="flex items-center justify-between pt-2">
                    <Button type="submit" variant="outline" size="sm">
                      Save changes
                    </Button>
                  </div>
                </form>

                <DangerZone
                  title="Delete source"
                  consequence={
                    <p>
                      Deleting <strong>{source.name}</strong> will remove this source record.
                      Its{' '}
                      <strong>
                        {source.usage.total} referencing record
                        {source.usage.total === 1 ? '' : 's'}
                      </strong>{' '}
                      will NOT be deleted; they will simply become <em>unsourced</em> (SetNull)
                      and flagged in the next data health check (§13).
                    </p>
                  }
                  confirmLabel="Confirm source deletion"
                  confirmId={`confirm-src-${source.id}`}
                >
                  <form action={deleteSourceAction} className="space-y-4">
                    <input type="hidden" name="id" value={source.id} />
                    <CheckboxField
                      id={`confirm-src-${source.id}`}
                      name="confirm"
                      required
                      label={`I understand that deleting this source leaves ${source.usage.total} record${source.usage.total === 1 ? '' : 's'} without provenance.`}
                    />
                    <Button type="submit" variant="destructive" size="sm">
                      Delete source
                    </Button>
                  </form>
                </DangerZone>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-ink-faint">No sources registered yet.</p>
        )}
      </Section>
    </PageShell>
  )
}
