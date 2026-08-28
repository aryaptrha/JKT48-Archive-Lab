import type { IssueSeverity, Prisma } from '@/generated/prisma/client'
import { IssueStatus } from '@/generated/prisma/enums'
import { prisma } from '@/lib/prisma/client'

import { entityRefSelect } from './entity-repository'

/**
 * Data health persistence — PRD §16.
 *
 * A run is a batch; issues belong to a run. Re-running does not resurrect issues
 * an admin has deliberately ignored: `syncIssues` reconciles what was found
 * against what is already recorded, keeping IGNORED decisions intact.
 */

export const issueInclude = {
  entity: { select: entityRefSelect },
  relationship: {
    include: {
      relationshipType: { select: { code: true, name: true } },
      source: { select: entityRefSelect },
      target: { select: entityRefSelect },
    },
  },
} satisfies Prisma.DataHealthIssueInclude

export type IssueRow = Prisma.DataHealthIssueGetPayload<{ include: typeof issueInclude }>

export type DetectedIssue = {
  checkCode: string
  severity: IssueSeverity
  message: string
  details?: Record<string, unknown>
  entityId?: string | null
  relationshipId?: string | null
  /**
   * Discriminator for issues that belong to no single row — a thin difficulty
   * rung is about a game definition, not an entity. Stored inside `details` so
   * the identity of an issue survives a re-run without a dedicated column.
   */
  subjectKey?: string
}

export async function startHealthRun(triggeredBy: string | null) {
  return prisma.dataHealthRun.create({ data: { triggeredBy } })
}

export async function finishHealthRun(
  runId: string,
  issuesFound: number,
  summary: Record<string, number>,
) {
  return prisma.dataHealthRun.update({
    where: { id: runId },
    data: { finishedAt: new Date(), issuesFound, summary: summary as Prisma.InputJsonValue },
  })
}

export async function latestHealthRun() {
  return prisma.dataHealthRun.findFirst({ orderBy: { startedAt: 'desc' } })
}

export async function listHealthRuns(limit = 10) {
  return prisma.dataHealthRun.findMany({ orderBy: { startedAt: 'desc' }, take: limit })
}

/**
 * Replace the OPEN issue set with what this run detected.
 *
 * Three outcomes, and the distinction matters to an admin reading the report:
 *
 *   - Newly detected issues are created against this run.
 *   - Re-detected issues keep their existing row, so an IGNORED decision is
 *     never quietly undone by a re-scan. Their message is refreshed, because a
 *     count in the message ("6 of 8 eligible subjects") goes stale otherwise.
 *   - OPEN issues that were not re-detected become RESOLVED rather than being
 *     deleted, so the report can show that something got fixed.
 */
type IssueKeyParts = {
  checkCode: string
  entityId?: string | null
  relationshipId?: string | null
  subjectKey?: string | null
}

function issueKey(parts: IssueKeyParts): string {
  return [parts.checkCode, parts.entityId ?? '', parts.relationshipId ?? '', parts.subjectKey ?? ''].join('::')
}

function subjectKeyOf(details: Prisma.JsonValue | null): string {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return ''
  const value = (details as Record<string, unknown>).subjectKey
  return typeof value === 'string' ? value : ''
}

function detailsFor(issue: DetectedIssue): Prisma.InputJsonValue | undefined {
  if (!issue.details && !issue.subjectKey) return undefined
  return {
    ...(issue.details ?? {}),
    ...(issue.subjectKey ? { subjectKey: issue.subjectKey } : {}),
  } as Prisma.InputJsonValue
}

export async function syncIssues(runId: string, detected: DetectedIssue[]) {
  const existing = await prisma.dataHealthIssue.findMany({
    where: { status: { in: [IssueStatus.OPEN, IssueStatus.IGNORED] } },
    select: {
      id: true,
      checkCode: true,
      entityId: true,
      relationshipId: true,
      status: true,
      message: true,
      details: true,
    },
  })

  const existingByKey = new Map(
    existing.map((row) => [issueKey({ ...row, subjectKey: subjectKeyOf(row.details) }), row]),
  )
  const detectedKeys = new Set(detected.map(issueKey))

  const toCreate = detected.filter((issue) => !existingByKey.has(issueKey(issue)))

  const toRefresh = detected
    .map((issue) => ({ issue, row: existingByKey.get(issueKey(issue)) }))
    .filter(
      (pair): pair is { issue: DetectedIssue; row: (typeof existing)[number] } =>
        pair.row !== undefined && pair.row.message !== pair.issue.message,
    )

  const resolvedIds = existing
    .filter(
      (row) =>
        row.status === IssueStatus.OPEN &&
        !detectedKeys.has(issueKey({ ...row, subjectKey: subjectKeyOf(row.details) })),
    )
    .map((row) => row.id)

  await prisma.$transaction([
    ...(toCreate.length
      ? [
          prisma.dataHealthIssue.createMany({
            data: toCreate.map((issue) => ({
              runId,
              checkCode: issue.checkCode,
              severity: issue.severity,
              message: issue.message,
              details: detailsFor(issue),
              entityId: issue.entityId ?? null,
              relationshipId: issue.relationshipId ?? null,
            })),
          }),
        ]
      : []),
    ...toRefresh.map(({ issue, row }) =>
      prisma.dataHealthIssue.update({
        where: { id: row.id },
        data: {
          runId,
          message: issue.message,
          severity: issue.severity,
          details: detailsFor(issue),
        },
      }),
    ),
    ...(resolvedIds.length
      ? [
          prisma.dataHealthIssue.updateMany({
            where: { id: { in: resolvedIds } },
            data: { status: IssueStatus.RESOLVED, resolvedAt: new Date() },
          }),
        ]
      : []),
  ])

  return { created: toCreate.length, refreshed: toRefresh.length, resolved: resolvedIds.length }
}

export async function listIssues(
  options: { status?: IssueStatus; checkCode?: string; page?: number; pageSize?: number } = {},
) {
  const page = Math.max(1, options.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 50))

  const where: Prisma.DataHealthIssueWhereInput = {
    status: options.status ?? IssueStatus.OPEN,
    ...(options.checkCode ? { checkCode: options.checkCode } : {}),
  }

  const [rows, total] = await Promise.all([
    prisma.dataHealthIssue.findMany({
      where,
      include: issueInclude,
      orderBy: [{ severity: 'asc' }, { detectedAt: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.dataHealthIssue.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export async function countIssuesByCheck(status: IssueStatus = IssueStatus.OPEN) {
  const rows = await prisma.dataHealthIssue.groupBy({
    by: ['checkCode', 'severity'],
    where: { status },
    _count: { _all: true },
  })
  return rows.map((row) => ({
    checkCode: row.checkCode,
    severity: row.severity,
    count: row._count._all,
  }))
}

export async function setIssueStatus(id: string, status: IssueStatus) {
  return prisma.dataHealthIssue.update({
    where: { id },
    data: { status, resolvedAt: status === IssueStatus.RESOLVED ? new Date() : null },
  })
}

/* -------------------------------------------------------------------------- */
/* Scan reads                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The scan loads the whole archive twice — once as entities, once as edges — and
 * checks run in memory over those two arrays.
 *
 * That is a deliberate trade. Fourteen checks expressed as fourteen SQL queries
 * would each need their own temporal and publication predicates, and the ones
 * that compare edges to each other (overlapping exclusive memberships) are
 * awkward in SQL and obvious in a loop. An archive of this shape is thousands of
 * rows, not millions, and the scan is an admin action rather than a page load.
 */
export const scanEntitySelect = {
  id: true,
  entityType: true,
  category: true,
  canonicalName: true,
  slug: true,
  summary: true,
  isPublished: true,
  provenanceId: true,
  member: { select: { entityId: true } },
  generation: { select: { entityId: true } },
  team: { select: { entityId: true } },
  song: { select: { entityId: true } },
  album: { select: { entityId: true } },
  event: { select: { entityId: true } },
  concert: { select: { entityId: true } },
  setlist: { select: { entityId: true } },
  mediaItem: { select: { entityId: true } },
  organization: { select: { entityId: true } },
} satisfies Prisma.EntitySelect

export type ScanEntityRow = Prisma.EntityGetPayload<{ select: typeof scanEntitySelect }>

export const scanRelationshipSelect = {
  id: true,
  sourceEntityId: true,
  targetEntityId: true,
  validFrom: true,
  validTo: true,
  provenanceId: true,
  relationshipType: {
    select: {
      code: true,
      name: true,
      isTemporal: true,
      isQuizzable: true,
      allowedSourceTypes: true,
      allowedTargetTypes: true,
    },
  },
  source: { select: { id: true, entityType: true, canonicalName: true } },
  target: { select: { id: true, entityType: true, canonicalName: true } },
} satisfies Prisma.RelationshipSelect

export type ScanRelationshipRow = Prisma.RelationshipGetPayload<{
  select: typeof scanRelationshipSelect
}>

export async function scanEntities(): Promise<ScanEntityRow[]> {
  return prisma.entity.findMany({
    select: scanEntitySelect,
    orderBy: [{ entityType: 'asc' }, { canonicalName: 'asc' }],
  })
}

export async function scanRelationships(): Promise<ScanRelationshipRow[]> {
  return prisma.relationship.findMany({
    select: scanRelationshipSelect,
    orderBy: [{ validFrom: { sort: 'asc', nulls: 'last' } }],
  })
}
