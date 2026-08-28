import type { AppSetting } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma/client'

/**
 * Application settings — PRD §19 (admin-configurable behaviour).
 *
 * Anything the PRD calls "configurable" belongs here rather than in a constant:
 * archive title, default game round count, whether anonymous play is allowed.
 */

export const SETTING = {
  ARCHIVE_TITLE: 'archive.title',
  ARCHIVE_TAGLINE: 'archive.tagline',
  ALLOW_ANONYMOUS_PLAY: 'games.allowAnonymousPlay',
  DEFAULT_ROUND_COUNT: 'games.defaultRoundCount',
  TIME_MACHINE_MIN_DATE: 'timeMachine.minDate',
  SHOW_UNSOURCED_BADGE: 'archive.showUnsourcedBadge',
} as const

export type SettingKey = (typeof SETTING)[keyof typeof SETTING]

export const SETTING_DEFAULTS: Record<SettingKey, unknown> = {
  [SETTING.ARCHIVE_TITLE]: 'JKT48 Archive Lab',
  [SETTING.ARCHIVE_TAGLINE]: 'An interactive record of a group, and a way to learn it.',
  [SETTING.ALLOW_ANONYMOUS_PLAY]: true,
  [SETTING.DEFAULT_ROUND_COUNT]: 5,
  [SETTING.TIME_MACHINE_MIN_DATE]: '2011-09-02',
  [SETTING.SHOW_UNSOURCED_BADGE]: true,
}

export async function listSettings(): Promise<AppSetting[]> {
  return prisma.appSetting.findMany({ orderBy: [{ group: 'asc' }, { key: 'asc' }] })
}

/** Read one setting, falling back to the compiled default when unset. */
export async function getSetting<T>(key: SettingKey, fallback?: T): Promise<T> {
  const row = await prisma.appSetting.findUnique({ where: { key } })
  if (row) return row.value as T
  return (fallback ?? SETTING_DEFAULTS[key]) as T
}

export async function getSettings(): Promise<Record<string, unknown>> {
  const rows = await listSettings()
  const merged: Record<string, unknown> = { ...SETTING_DEFAULTS }
  for (const row of rows) merged[row.key] = row.value
  return merged
}

export async function setSetting(key: string, value: unknown, group = 'general', description?: string) {
  return prisma.appSetting.upsert({
    where: { key },
    create: { key, value: value as never, group, description },
    update: { value: value as never, group, ...(description ? { description } : {}) },
  })
}
