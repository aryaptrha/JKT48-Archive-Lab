/**
 * Eras (PRD §4.3, §12).
 *
 * Eras are *labels over a date range*, not containers that own data. Nothing
 * belongs to an era; the Time Machine resolves an era to a date and then asks
 * the graph what was true then. That is why there is no `era_id` anywhere in
 * the schema.
 *
 * Seed rows only — admins curate the real list.
 */

export type EraSeed = {
  name: string
  slug: string
  startDate: string
  endDate: string | null
  description: string
  displayOrder: number
}

export const ERA_SEEDS: EraSeed[] = [
  {
    name: 'Founding',
    slug: 'founding',
    startDate: '2011-09-02',
    endDate: '2012-12-31',
    description:
      'The first audition, the first generation, and the opening of the theater. Everything after this is downstream of it.',
    displayOrder: 10,
  },
  {
    name: 'Early Expansion',
    slug: 'early-expansion',
    startDate: '2013-01-01',
    endDate: '2015-12-31',
    description:
      'New generations arrive, teams multiply, and the first major graduations reshape the roster.',
    displayOrder: 20,
  },
  {
    name: 'Consolidation',
    slug: 'consolidation',
    startDate: '2016-01-01',
    endDate: '2018-04-07',
    description: 'Team structures settle, elections mature, and the setlist catalogue deepens.',
    displayOrder: 30,
  },
  {
    name: 'RE:BOOST',
    slug: 'reboost',
    startDate: '2018-04-08',
    endDate: '2019-12-21',
    description:
      'Founding members depart, activity shifts online, and the group reorganises around a younger roster.',
    displayOrder: 40,
  },
  {
    name: 'ONE',
    slug: 'one',
    startDate: '2019-12-22',
    endDate: '2022-01-21',
    description:
      'Founding members depart, activity shifts online, and the group reorganises around a younger roster.',
    displayOrder: 50,
  },
  {
    name: 'New Era',
    slug: 'new-era',
    startDate: '2022-01-22',
    endDate: '2025-12-31',
    description: 'The present roster and the ongoing record. An open era: no end date.',
    displayOrder: 60,
  },
  {
    name: 'Fight',
    slug: 'fight',
    startDate: '2026-01-01',
    endDate: null,
    description: 'The present roster and the ongoing record. An open era: no end date.',
    displayOrder: 60,
  },
]

/** The era covering a date, if any. Eras are expected not to overlap. */
export function eraForDate<T extends { startDate: Date | string; endDate: Date | string | null }>(
  date: Date,
  eras: readonly T[],
): T | undefined {
  const target = date.getTime()
  return eras.find((era) => {
    const start = new Date(era.startDate).getTime()
    const end = era.endDate ? new Date(era.endDate).getTime() : Number.POSITIVE_INFINITY
    return target >= start && target <= end
  })
}
