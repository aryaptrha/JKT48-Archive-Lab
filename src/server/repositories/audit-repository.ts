import type { AuditAction, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma/client'

/**
 * Audit log persistence — PRD §17, §35.
 *
 * Every administrative mutation is recorded. The actor's email is denormalised
 * onto the row so the log stays readable after a profile is removed, and the
 * FK is SetNull rather than Cascade for the same reason: deleting a user must
 * not erase what they did.
 */

export type AuditEntry = {
  actorId: string | null
  actorEmail: string | null
  action: AuditAction
  entityType: string
  entityId: string | null
  summary: string
  before?: unknown
  after?: unknown
}

export async function writeAuditLog(entry: AuditEntry) {
  return prisma.auditLog.create({
    data: {
      actorId: entry.actorId,
      actorEmail: entry.actorEmail,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      summary: entry.summary,
      before: (entry.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (entry.after ?? undefined) as Prisma.InputJsonValue | undefined,
    },
  })
}

export type AuditListOptions = {
  page?: number
  pageSize?: number
  entityType?: string
  entityId?: string
  action?: AuditAction
  actorId?: string
}

export async function listAuditLogs(options: AuditListOptions = {}) {
  const page = Math.max(1, options.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 30))

  const where: Prisma.AuditLogWhereInput = {
    ...(options.entityType ? { entityType: options.entityType } : {}),
    ...(options.entityId ? { entityId: options.entityId } : {}),
    ...(options.action ? { action: options.action } : {}),
    ...(options.actorId ? { actorId: options.actorId } : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.auditLog.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

/** Change history for one record, shown on the admin edit screen. */
export async function findHistoryFor(entityType: string, entityId: string, limit = 20) {
  return prisma.auditLog.findMany({
    where: { entityType, entityId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  })
}
