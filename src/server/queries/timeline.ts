import { formatDate, formatMonthYear, today, toISODate, yearOf } from '@/lib/date'
import type { EntityRef } from '@/types/graph'

import { listEras } from '../repositories/era-repository'
import { findEdgeTransitions, type EdgeRow } from '../repositories/relationship-repository'
import { toEntityRef } from '../services/entity-mapper'
import {
  diffSnapshots,
  getEraOptions,
  getSnapshot,
  type EraRef,
  type RosterDiff,
  type TimeMachineSnapshot,
} from '../services/time-machine'

/**
 * Read models for the history section (PRD §20 `/history/timeline`,
 * `/history/time-machine`; §4.2).
 *
 * Both pages are the same idea seen from two angles. The timeline asks "when did
 * things change", the Time Machine asks "what was true on this date", and both
 * answers come out of the temporal validity model in §11 — no per-year snapshot
 * table, no denormalised history, just `validFrom` / `validTo` read two different
 * ways.
 *
 * The timeline is built from relationship *transitions* rather than from entity
 * records, because a knowledge graph records change on its edges. A member
 * joining Team J is an edge beginning; her graduation is an edge ending. Reading
 * the timeline off entity columns would mean the archive could only remember the
 * present.
 */

/** Whether this moment is an edge beginning or an edge ending. */
export type TransitionKind = 'START' | 'END'

export type TimelineEvent = {
  id: string
  date: Date
  dateLabel: string
  monthLabel: string
  year: number
  kind: TransitionKind
  code: string
  /**
   * The relationship's own name, from the admin-editable vocabulary — never a
   * verb hard-coded here (PRD §19). The UI supplies the "began"/"ended" chrome
   * from `kind`.
   */
  relationship: string
  subject: EntityRef
  object: EntityRef
  sourceName: string | null
}

export type TimelineYear = {
  year: number
  era: EraRef | null
  events: TimelineEvent[]
}

export type TimelineRange = { from: Date; to: Date }

export type Timeline = {
  range: TimelineRange
  years: TimelineYear[]
  eras: EraRef[]
  /** Event counts per year, for a scrubber that needs no second query. */
  density: { year: number; count: number }[]
  total: number
}

function eraRef(row: {
  id: string
  name: string
  slug: string
  startDate: Date
  endDate: Date | null
  description: string | null
}): EraRef {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    startDate: row.startDate,
    endDate: row.endDate,
    description: row.description,
  }
}

/**
 * An edge's two endpoints as refs.
 *
 * `subject` is the stored source and `object` the stored target — a timeline
 * entry reads in the direction the edge was recorded, which is the direction the
 * relationship's own name is phrased for.
 */
function edgeRefs(row: EdgeRow): { subject: EntityRef; object: EntityRef } {
  return { subject: toEntityRef(row.source), object: toEntityRef(row.target) }
}

/**
 * One edge becomes up to two events.
 *
 * An edge with both dates inside the window changed twice and belongs on the
 * timeline twice — a member who joined a team in 2013 and left it in 2018 is two
 * moments, not one span. The id carries the kind so React keys stay stable.
 */
function toEvents(row: EdgeRow, range: TimelineRange): TimelineEvent[] {
  const { subject, object } = edgeRefs(row)
  const events: TimelineEvent[] = []

  const push = (date: Date | null, kind: TransitionKind) => {
    if (!date) return
    if (date < range.from || date > range.to) return

    const year = yearOf(date)
    if (year === undefined) return

    events.push({
      id: `${row.id}:${kind}`,
      date,
      dateLabel: formatDate(date),
      monthLabel: formatMonthYear(date),
      year,
      kind,
      code: row.relationshipType.code,
      relationship: row.relationshipType.name,
      subject,
      object,
      sourceName: row.provenance?.name ?? null,
    })
  }

  push(row.validFrom, 'START')
  push(row.validTo, 'END')

  return events
}

const DEFAULT_TIMELINE_START = new Date(Date.UTC(2011, 0, 1))

/**
 * The timeline (PRD §4.2).
 *
 * Grouped by year rather than paginated: history reads as a continuous column,
 * and a "page 3 of 2011–2026" control describes nothing a reader is looking for.
 * The range is what bounds the query instead.
 */
export async function getTimeline(
  options: { from?: Date | null; to?: Date | null } = {},
): Promise<Timeline> {
  const from = options.from ?? DEFAULT_TIMELINE_START
  const to = options.to ?? today()
  const range: TimelineRange = from <= to ? { from, to } : { from: to, to: from }

  const [rows, eraRows] = await Promise.all([findEdgeTransitions(range.from, range.to), listEras()])
  const eras = eraRows.map(eraRef)

  const events = rows.flatMap((row) => toEvents(row, range))
  events.sort((a, b) => b.date.getTime() - a.date.getTime())

  const byYear = new Map<number, TimelineEvent[]>()
  for (const event of events) {
    const bucket = byYear.get(event.year)
    if (bucket) bucket.push(event)
    else byYear.set(event.year, [event])
  }

  // Newest year first, matching the event order inside each year.
  const years: TimelineYear[] = [...byYear.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, yearEvents]) => ({
      year,
      // An era is matched by the year's midpoint so a year split across two eras
      // resolves to one label rather than flickering between them.
      era: eras.find((era) => coversYear(era, year)) ?? null,
      events: yearEvents,
    }))

  return {
    range,
    years,
    eras,
    density: years.map((entry) => ({ year: entry.year, count: entry.events.length })).reverse(),
    total: events.length,
  }
}

function coversYear(era: EraRef, year: number): boolean {
  const midYear = new Date(Date.UTC(year, 6, 1))
  if (era.startDate > midYear) return false
  return era.endDate === null || era.endDate >= midYear
}

/* -------------------------------------------------------------------------- */
/* Time Machine                                                               */
/* -------------------------------------------------------------------------- */

export type TimeMachinePage = {
  snapshot: TimeMachineSnapshot
  /** ISO date driving the URL, so the page can build its own links. */
  asOf: string
  eras: EraRef[]
  /**
   * What changed since the comparison date. Null when no comparison was asked
   * for — the snapshot has to be readable on its own.
   */
  diff: RosterDiff | null
  comparedTo: string | null
  /** Era boundaries make the most useful jump targets on a date scrubber. */
  presets: { label: string; date: string }[]
}

/**
 * The Time Machine page (PRD §4.3, §5.4).
 *
 * `getSnapshot` does the temporal work; this adds the navigation around it. Note
 * that the same snapshot service backs the Time Machine *game*: the game asks
 * questions about a date, the page shows the answers, and neither has its own
 * copy of what "as of" means.
 */
export async function getTimeMachinePage(
  options: { asOf?: Date | string | null; comparedTo?: Date | string | null } = {},
): Promise<TimeMachinePage> {
  const [snapshot, eras] = await Promise.all([getSnapshot(options.asOf ?? null), getEraOptions()])

  const diff = options.comparedTo
    ? await diffSnapshots(options.comparedTo, snapshot.asOf)
    : null

  const presets = eras
    .map((era) => ({ label: era.name, date: toISODate(era.startDate) ?? '' }))
    .filter((preset) => preset.date.length > 0)

  return {
    snapshot,
    asOf: toISODate(snapshot.asOf) ?? '',
    eras,
    diff,
    comparedTo: diff ? (toISODate(diff.from) ?? null) : null,
    presets,
  }
}
