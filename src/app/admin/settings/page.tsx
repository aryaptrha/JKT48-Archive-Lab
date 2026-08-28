import type { Metadata } from 'next'

import { AdminFigure, FormBanner } from '@/components/admin/admin-chrome'
import { PageShell, Section, SectionHeading } from '@/components/archive/section'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/field'
import { requireAdmin } from '@/lib/auth/session'
import { formatDate } from '@/lib/date'
import { getConfigSummary, getSettingsList } from '@/server/services/admin-config'
import { saveSettingAction } from './actions'

export const metadata: Metadata = {
  title: 'Settings',
}

/**
 * `/admin/settings` (PRD §19, §25).
 *
 * The configuration hub linking to sub-editors (vocabulary, eras, users, mastery, games)
 * and providing inline editing for key-value application settings.
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  await requireAdmin()
  const query = await searchParams

  const [summary, settings] = await Promise.all([
    getConfigSummary(),
    getSettingsList(),
  ])

  // Group settings by group
  const groupedSettings = settings.reduce<Record<string, typeof settings>>(
    (acc, setting) => {
      const g = setting.group || 'general'
      if (!acc[g]) acc[g] = []
      acc[g].push(setting)
      return acc
    },
    {},
  )

  return (
    <PageShell className="space-y-10">
      <SectionHeading
        as="h1"
        eyebrow="System & Vocabulary"
        title="Archive Settings"
        lead="Configuration is stored as domain rows (§6, §8.3, §10). Each sub-section manages a specific subsystem of the archive."
      />

      <FormBanner error={first(query.error)} notice={first(query.notice)} />

      {/* ------------------------------------------------ Subsystem figures */}
      <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3 lg:grid-cols-6">
        <AdminFigure
          label="Relationship Types"
          value={summary.relationshipTypes.total}
          href="/admin/settings/relationship-types"
          detail={`${summary.relationshipTypes.active} active vocabulary terms`}
        />
        <AdminFigure
          label="Historical Eras"
          value={summary.eras}
          href="/admin/settings/eras"
          detail="Timeline editorial spans"
        />
        <AdminFigure
          label="Administrators"
          value={summary.admins}
          href="/admin/settings/users"
          tone={summary.admins === 1 ? 'warning' : 'default'}
          detail={summary.admins === 1 ? 'Only 1 admin account' : 'User roles & access'}
        />
        <AdminFigure
          label="Mastery Tiers"
          value={summary.masteryStatuses.total}
          href="/admin/mastery"
          detail={`${summary.masteryStatuses.active} active bands`}
        />
        <AdminFigure
          label="Game Engines"
          value={summary.gameDefinitions.total}
          href="/admin/games"
          detail={`${summary.gameDefinitions.active} playable models`}
        />
        <AdminFigure
          label="Sources"
          value={summary.sources}
          href="/admin/sources"
          detail="Citation providers"
        />
      </div>

      {/* ------------------------------------------------ Key-Value Settings */}
      <Section className="space-y-8">
        <SectionHeading
          as="h2"
          eyebrow="Application values"
          title="Key-Value Settings"
          lead="Runtime switches and textual configurations stored in the AppSetting table."
        />

        {Object.entries(groupedSettings).map(([groupName, groupSettings]) => (
          <div
            key={groupName}
            className="space-y-4 rounded-sm border border-rule bg-surface p-6"
          >
            <h3 className="font-display text-base font-semibold uppercase tracking-wider text-ink-strong">
              {groupName} settings
            </h3>

            <div className="space-y-4 divide-y divide-rule">
              {groupSettings.map((setting) => (
                <form
                  key={setting.key}
                  action={saveSettingAction}
                  className="pt-4 first:pt-0 space-y-3"
                >
                  <input type="hidden" name="key" value={setting.key} />
                  <input type="hidden" name="group" value={setting.group} />

                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <span className="font-mono text-sm font-semibold text-ink-strong">
                        {setting.key}
                      </span>
                      {setting.description ? (
                        <p className="text-xs text-ink-muted">{setting.description}</p>
                      ) : null}
                    </div>
                    <time className="font-mono text-catalog text-ink-faint">
                      Updated {formatDate(setting.updatedAt)}
                    </time>
                  </div>

                  <div className="flex items-end gap-3">
                    <Field
                      htmlFor={`val-${setting.key}`}
                      label="Value"
                      className="flex-1"
                    >
                      <Input
                        id={`val-${setting.key}`}
                        name="value"
                        defaultValue={
                          typeof setting.value === 'object'
                            ? JSON.stringify(setting.value)
                            : String(setting.value ?? '')
                        }
                      />
                    </Field>
                    <Button type="submit" variant="outline" size="sm">
                      Save
                    </Button>
                  </div>
                </form>
              ))}
            </div>
          </div>
        ))}
      </Section>
    </PageShell>
  )
}
