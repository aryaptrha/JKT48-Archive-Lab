/**
 * Date-only helpers.
 *
 * The graph is dated to the day, never the second: `activeFrom`, `validFrom`
 * and `validTo` are all `@db.Date`. Comparing those against a timestamp that
 * carries a local time zone is how off-by-one-day temporal bugs appear, so
 * every date entering or leaving the domain goes through here and is pinned to
 * UTC midnight.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** UTC midnight for a Date, string, or number. Invalid input yields undefined. */
export function toDateOnly(value: Date | string | number | null | undefined): Date | undefined {
  if (value === null || value === undefined || value === '') return undefined

  if (typeof value === 'string' && ISO_DATE.test(value)) {
    const parsed = new Date(`${value}T00:00:00.000Z`)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }

  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return undefined

  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), 0, 0, 0, 0),
  )
}

/** Today at UTC midnight — the default "as of" date for the archive. */
export function today(): Date {
  return toDateOnly(new Date()) as Date
}

/** `YYYY-MM-DD`, safe to put in a URL or a `<input type="date">`. */
export function toISODate(value: Date | string | number | null | undefined): string | undefined {
  const date = toDateOnly(value)
  return date?.toISOString().slice(0, 10)
}

/**
 * Parse a `?date=` search param. Returns undefined for anything unparseable so
 * callers fall back to the present rather than throwing on a bad URL.
 */
export function parseDateParam(value: string | string[] | undefined): Date | undefined {
  const raw = Array.isArray(value) ? value[0] : value
  if (!raw) return undefined
  return toDateOnly(raw)
}

const DISPLAY = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

const DISPLAY_MONTH = new Intl.DateTimeFormat('en-GB', {
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

export function formatDate(value: Date | string | null | undefined): string {
  const date = toDateOnly(value)
  return date ? DISPLAY.format(date) : '—'
}

export function formatMonthYear(value: Date | string | null | undefined): string {
  const date = toDateOnly(value)
  return date ? DISPLAY_MONTH.format(date) : '—'
}

export function yearOf(value: Date | string | null | undefined): number | undefined {
  return toDateOnly(value)?.getUTCFullYear()
}

/**
 * Human range for a temporal edge. An open end reads as "present", which is
 * what a null `validTo` means in the data model.
 */
export function formatDateRange(
  from: Date | string | null | undefined,
  to: Date | string | null | undefined,
): string {
  const start = toDateOnly(from)
  const end = toDateOnly(to)

  if (!start && !end) return 'Date unknown'
  if (start && !end) return `${formatDate(start)} — present`
  if (!start && end) return `until ${formatDate(end)}`
  return `${formatDate(start)} — ${formatDate(end)}`
}

/** Inclusive containment, matching the SQL temporal predicate in PRD §11. */
export function isValidOn(
  asOf: Date,
  from: Date | string | null | undefined,
  to: Date | string | null | undefined,
): boolean {
  const target = toDateOnly(asOf)
  if (!target) return false

  const start = toDateOnly(from)
  const end = toDateOnly(to)

  if (start && target.getTime() < start.getTime()) return false
  if (end && target.getTime() > end.getTime()) return false
  return true
}

export function addDays(value: Date, days: number): Date {
  const date = toDateOnly(value) as Date
  return new Date(date.getTime() + days * 86_400_000)
}

/** Difference in whole days, `later - earlier`. */
export function daysBetween(earlier: Date, later: Date): number {
  const a = toDateOnly(earlier) as Date
  const b = toDateOnly(later) as Date
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}
