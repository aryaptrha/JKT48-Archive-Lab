import type { AuditAction, UserProfile } from '@/generated/prisma/client'
import type { Paginated } from '@/types/graph'

import {
  findHistoryFor,
  listAuditLogs,
  writeAuditLog,
  type AuditListOptions,
} from '../repositories/audit-repository'

/**
 * Audit log (PRD §17, §35).
 *
 * Every administrative mutation is recorded, and the record is written by the
 * same service call that performs the mutation — never by the UI, and never as
 * an optional extra parameter a caller can forget. `Actor` exists so a Server
 * Action and a Route Handler pass identity the same way.
 *
 * The log is append-only: there is no update or delete here, deliberately. An
 * audit trail an admin can edit is not an audit trail.
 */

export type Actor = {
  id: string | null
  email: string | null
}

/** Narrow a profile to the identity fields the log keeps. */
export function actorFromProfile(profile: UserProfile | null | undefined): Actor {
  return { id: profile?.id ?? null, email: profile?.email ?? null }
}

/** For seeds, migrations and scheduled jobs, which have no signed-in user. */
export const SYSTEM_ACTOR: Actor = { id: null, email: null }

export type RecordChangeInput = {
  actor: Actor
  action: AuditAction
  /** Model name — `Entity`, `Relationship`, `GameDefinition`. */
  entityType: string
  entityId: string | null
  summary: string
  before?: unknown
  after?: unknown
}

export async function recordChange(input: RecordChangeInput): Promise<void> {
  await writeAuditLog({
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    summary: input.summary,
    before: input.before,
    after: input.after,
  })
}

export type AuditEntryView = {
  id: string
  action: AuditAction
  entityType: string
  entityId: string | null
  summary: string
  actorEmail: string | null
  createdAt: Date
  /** Field-level diff, empty when the mutation recorded no snapshots. */
  changes: { field: string; before: string | null; after: string | null }[]
}

/** Values are rendered rather than typed: a diff is for reading, not parsing. */
function render(value: unknown): string | null {
  if (value === null || value === undefined) return null
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (Array.isArray(value)) return value.length === 0 ? '—' : value.map(String).join(', ')
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Diff two JSON snapshots.
 *
 * Only changed fields are listed. A create has no `before` and shows every field
 * it set; a delete has no `after` and shows what was lost.
 */
function diff(before: unknown, after: unknown) {
  const beforeRecord = isRecord(before) ? before : {}
  const afterRecord = isRecord(after) ? after : {}
  const keys = [...new Set([...Object.keys(beforeRecord), ...Object.keys(afterRecord)])].sort()

  const changes: AuditEntryView['changes'] = []

  for (const field of keys) {
    const from = render(beforeRecord[field])
    const to = render(afterRecord[field])
    if (from === to) continue
    changes.push({ field, before: from, after: to })
  }

  return changes
}

type LogRow = {
  id: string
  action: AuditAction
  entityType: string
  entityId: string | null
  summary: string
  actorEmail: string | null
  createdAt: Date
  before: unknown
  after: unknown
}

function toEntryView(row: LogRow): AuditEntryView {
  return {
    id: row.id,
    action: row.action,
    entityType: row.entityType,
    entityId: row.entityId,
    summary: row.summary,
    actorEmail: row.actorEmail,
    createdAt: row.createdAt,
    changes: diff(row.before, row.after),
  }
}

export async function getAuditLog(
  options: AuditListOptions = {},
): Promise<Paginated<AuditEntryView>> {
  const { rows, total, page, pageSize } = await listAuditLogs(options)

  return {
    items: rows.map(toEntryView),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/** The change history panel on an admin edit screen. */
export async function getRecordHistory(
  entityType: string,
  entityId: string,
  limit = 20,
): Promise<AuditEntryView[]> {
  const rows = await findHistoryFor(entityType, entityId, limit)
  return rows.map(toEntryView)
}
