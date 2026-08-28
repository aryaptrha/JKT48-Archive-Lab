import {
  CHECK,
  CHECK_DEFINITIONS,
  MIN_SUBJECTS_PER_DIFFICULTY,
  SEVERITY_ORDER,
  checkDefinition,
  type CheckCode,
  type CheckDefinition,
} from '@/domain/data-health'
import { attributeTableFor, entityTypeLabel } from '@/domain/entity-taxonomy'
import { REL } from '@/domain/relationship-types'
import { AuditAction, EntityType, IssueSeverity, IssueStatus } from '@/generated/prisma/enums'
import { formatDateRange } from '@/lib/date'
import { normalizeAnswer } from '@/lib/utils'
import type { EntityRef, Paginated } from '@/types/graph'

import { writeAuditLog } from '../repositories/audit-repository'
import {
  countIssuesByCheck,
  finishHealthRun,
  latestHealthRun,
  listHealthRuns,
  listIssues,
  scanEntities,
  scanRelationships,
  setIssueStatus,
  startHealthRun,
  syncIssues,
  type DetectedIssue,
  type IssueRow,
  type ScanEntityRow,
  type ScanRelationshipRow,
} from '../repositories/data-health-repository'
import { findCandidateEntities } from '../repositories/entity-repository'
import { listGameDefinitions } from '../repositories/game-repository'

import { toEntityRef } from './entity-mapper'
import { effectiveProfile } from './game-engine'

/**
 * Data health (PRD §16).
 *
 * The archive is the product, and the game engine amplifies whatever is wrong
 * with it: a member with no generation cannot be attributed to a mastery scope,
 * a temporal edge with no start date is silently true on every date, and a
 * relationship pointing at the wrong kind of entity produces a question that
 * reads as nonsense. Checks exist so those failures surface as an admin task
 * list rather than as a bad question in front of a player.
 *
 * Every check is pure: it takes the scanned rows and returns `DetectedIssue`
 * records. Persistence, run bookkeeping and audit logging happen once, in
 * `runDataHealthScan`. That means a check can be added by writing one function
 * and listing it — no new query, no new table, no new admin screen.
 */

/* -------------------------------------------------------------------------- */
/* Scan model                                                                 */
/* -------------------------------------------------------------------------- */

type Degree = {
  total: number
  /** Codes on edges where this entity is the source. */
  outgoing: Set<string>
  /** Codes on edges where this entity is the target. */
  incoming: Set<string>
}

type ScanData = {
  entities: ScanEntityRow[]
  relationships: ScanRelationshipRow[]
  degree: Map<string, Degree>
}

function emptyDegree(): Degree {
  return { total: 0, outgoing: new Set(), incoming: new Set() }
}

function indexDegrees(relationships: ScanRelationshipRow[]): Map<string, Degree> {
  const degrees = new Map<string, Degree>()

  const at = (id: string): Degree => {
    const existing = degrees.get(id)
    if (existing) return existing
    const created = emptyDegree()
    degrees.set(id, created)
    return created
  }

  for (const row of relationships) {
    const code = row.relationshipType.code
    const from = at(row.sourceEntityId)
    const to = at(row.targetEntityId)
    from.total += 1
    to.total += 1
    from.outgoing.add(code)
    to.incoming.add(code)
  }

  return degrees
}

function hasSpecializedRow(entity: ScanEntityRow): boolean {
  return Boolean(
    entity.member ??
      entity.generation ??
      entity.team ??
      entity.song ??
      entity.album ??
      entity.event ??
      entity.concert ??
      entity.setlist ??
      entity.mediaItem ??
      entity.organization,
  )
}

function severityOf(code: CheckCode): IssueSeverity {
  return CHECK_DEFINITIONS[code].severity
}

function entityIssue(
  code: CheckCode,
  entity: ScanEntityRow,
  message: string,
  details?: Record<string, unknown>,
): DetectedIssue {
  return {
    checkCode: code,
    severity: severityOf(code),
    message,
    entityId: entity.id,
    details: { entityType: entity.entityType, slug: entity.slug, ...details },
  }
}

function edgeIssue(
  code: CheckCode,
  row: ScanRelationshipRow,
  message: string,
  details?: Record<string, unknown>,
): DetectedIssue {
  return {
    checkCode: code,
    severity: severityOf(code),
    message,
    relationshipId: row.id,
    details: { code: row.relationshipType.code, ...details },
  }
}

/** How an edge reads in an issue message. */
function describeEdge(row: ScanRelationshipRow): string {
  return `${row.source.canonicalName} → ${row.relationshipType.name} → ${row.target.canonicalName}`
}

/* -------------------------------------------------------------------------- */
/* Entity checks                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Unpublished records are exempt from the game-quality checks.
 *
 * A draft is *supposed* to be incomplete — that is what the draft state is for.
 * Flagging drafts would bury the issues that actually affect what fans and
 * players see under a list of work in progress.
 */
function isLive(entity: ScanEntityRow): boolean {
  return entity.isPublished
}

function checkEntities(data: ScanData): DetectedIssue[] {
  const issues: DetectedIssue[] = []

  for (const entity of data.entities) {
    const table = attributeTableFor(entity.entityType)
    if (table && !hasSpecializedRow(entity)) {
      issues.push(
        entityIssue(
          CHECK.ENTITY_MISSING_SPECIALIZED_ROW,
          entity,
          `${entity.canonicalName} is a ${entityTypeLabel(entity.entityType)} with no ${table} attribute row.`,
          { expectedTable: table },
        ),
      )
    }

    if (!entity.summary?.trim()) {
      issues.push(
        entityIssue(
          CHECK.ENTITY_MISSING_SUMMARY,
          entity,
          `${entity.canonicalName} has no one-line summary.`,
        ),
      )
    }

    if (!entity.provenanceId) {
      issues.push(
        entityIssue(
          CHECK.ENTITY_MISSING_PROVENANCE,
          entity,
          `${entity.canonicalName} has no source recorded.`,
        ),
      )
    }

    if (isLive(entity) && (data.degree.get(entity.id)?.total ?? 0) === 0) {
      issues.push(
        entityIssue(
          CHECK.ENTITY_ORPHANED,
          entity,
          `${entity.canonicalName} has no relationships, so no game or graph view can reach it.`,
        ),
      )
    }
  }

  return issues
}

/**
 * Duplicate names within a type.
 *
 * Compared after normalisation — the same normalisation free-text answers go
 * through — because "Shani Indira Natio" and "Shani Indira  Natio" are the same
 * ambiguity to a player even though they are different strings to Postgres.
 */
function checkDuplicateNames(data: ScanData): DetectedIssue[] {
  const groups = new Map<string, ScanEntityRow[]>()

  for (const entity of data.entities) {
    const key = `${entity.entityType}::${normalizeAnswer(entity.canonicalName)}`
    const list = groups.get(key)
    if (list) list.push(entity)
    else groups.set(key, [entity])
  }

  const issues: DetectedIssue[] = []

  for (const group of groups.values()) {
    if (group.length < 2) continue
    for (const entity of group) {
      const others = group.filter((row) => row.id !== entity.id).map((row) => row.slug)
      issues.push(
        entityIssue(
          CHECK.ENTITY_DUPLICATE_NAME,
          entity,
          `${entity.canonicalName} shares a name with ${others.length} other ${entityTypeLabel(entity.entityType)} record${others.length === 1 ? '' : 's'}.`,
          { duplicateSlugs: others },
        ),
      )
    }
  }

  return issues
}

function checkMembers(data: ScanData): DetectedIssue[] {
  const issues: DetectedIssue[] = []

  for (const entity of data.entities) {
    if (entity.entityType !== EntityType.MEMBER) continue
    if (!isLive(entity)) continue

    const degree = data.degree.get(entity.id) ?? emptyDegree()

    if (!degree.outgoing.has(REL.BELONGS_TO_GENERATION)) {
      issues.push(
        entityIssue(
          CHECK.MEMBER_MISSING_GENERATION,
          entity,
          `${entity.canonicalName} belongs to no generation, so mastery cannot attribute questions about her.`,
        ),
      )
    }

    if (!degree.outgoing.has(REL.MEMBER_OF)) {
      issues.push(
        entityIssue(
          CHECK.MEMBER_NO_TEAM_HISTORY,
          entity,
          `${entity.canonicalName} has no team membership on record.`,
        ),
      )
    }
  }

  return issues
}

function checkSongs(data: ScanData): DetectedIssue[] {
  const issues: DetectedIssue[] = []

  for (const entity of data.entities) {
    if (entity.entityType !== EntityType.SONG) continue
    if (!isLive(entity)) continue

    const degree = data.degree.get(entity.id) ?? emptyDegree()
    if (!degree.incoming.has(REL.CENTER_OF)) {
      issues.push(
        entityIssue(
          CHECK.SONG_NO_CENTER,
          entity,
          `${entity.canonicalName} has no center recorded.`,
        ),
      )
    }
  }

  return issues
}

/* -------------------------------------------------------------------------- */
/* Relationship checks                                                        */
/* -------------------------------------------------------------------------- */

function checkRelationships(data: ScanData): DetectedIssue[] {
  const issues: DetectedIssue[] = []

  for (const row of data.relationships) {
    const type = row.relationshipType

    if (type.isTemporal && !row.validFrom) {
      issues.push(
        edgeIssue(
          CHECK.RELATIONSHIP_MISSING_VALID_FROM,
          row,
          `${describeEdge(row)} is temporal but has no start date, so it reads as true on every date.`,
        ),
      )
    }

    if (row.validFrom && row.validTo && row.validTo < row.validFrom) {
      issues.push(
        edgeIssue(
          CHECK.RELATIONSHIP_INVERTED_DATES,
          row,
          `${describeEdge(row)} ends before it starts (${formatDateRange(row.validFrom, row.validTo)}).`,
        ),
      )
    }

    const sourceAllowed =
      type.allowedSourceTypes.length === 0 || type.allowedSourceTypes.includes(row.source.entityType)
    const targetAllowed =
      type.allowedTargetTypes.length === 0 || type.allowedTargetTypes.includes(row.target.entityType)

    if (!sourceAllowed || !targetAllowed) {
      const offending = !sourceAllowed ? row.source : row.target
      const side = !sourceAllowed ? 'source' : 'target'
      const allowed = !sourceAllowed ? type.allowedSourceTypes : type.allowedTargetTypes
      issues.push(
        edgeIssue(
          CHECK.RELATIONSHIP_TYPE_VIOLATION,
          row,
          `${describeEdge(row)} has a ${entityTypeLabel(offending.entityType)} as its ${side}; ${type.name} allows ${allowed.map(entityTypeLabel).join(', ')}.`,
          { side, offendingEntityId: offending.id, allowed },
        ),
      )
    }

    if (!row.provenanceId) {
      issues.push(
        edgeIssue(
          CHECK.RELATIONSHIP_MISSING_PROVENANCE,
          row,
          `${describeEdge(row)} has no source recorded.`,
        ),
      )
    }
  }

  return issues
}

/**
 * Relationship codes where one entity may hold only one edge at a time.
 *
 * Exclusivity is scoped to the *target's* entity type, and that qualification is
 * the whole reason this is a hand-written list rather than a column: a member is
 * legitimately in Team J and a subunit at the same moment, but she cannot be in
 * two teams at once. Comparing only same-target-type pairs is what keeps this
 * check from crying wolf on every subunit.
 */
const EXCLUSIVE_CODES: { code: string; targetTypes: EntityType[] }[] = [
  { code: REL.MEMBER_OF, targetTypes: [EntityType.TEAM] },
  { code: REL.CAPTAIN_OF, targetTypes: [EntityType.TEAM] },
  { code: REL.BELONGS_TO_GENERATION, targetTypes: [EntityType.GENERATION] },
]

function overlaps(a: ScanRelationshipRow, b: ScanRelationshipRow): boolean {
  const aFrom = a.validFrom?.getTime() ?? Number.NEGATIVE_INFINITY
  const aTo = a.validTo?.getTime() ?? Number.POSITIVE_INFINITY
  const bFrom = b.validFrom?.getTime() ?? Number.NEGATIVE_INFINITY
  const bTo = b.validTo?.getTime() ?? Number.POSITIVE_INFINITY
  return aFrom <= bTo && bFrom <= aTo
}

function checkExclusiveOverlaps(data: ScanData): DetectedIssue[] {
  const issues: DetectedIssue[] = []

  for (const rule of EXCLUSIVE_CODES) {
    const bySubject = new Map<string, ScanRelationshipRow[]>()

    for (const row of data.relationships) {
      if (row.relationshipType.code !== rule.code) continue
      if (!rule.targetTypes.includes(row.target.entityType)) continue
      const list = bySubject.get(row.sourceEntityId)
      if (list) list.push(row)
      else bySubject.set(row.sourceEntityId, [row])
    }

    for (const rows of bySubject.values()) {
      if (rows.length < 2) continue

      // Sorted so the *later* edge carries the issue on every run: a stable
      // owner keeps the issue's identity, and with it any IGNORED decision.
      const ordered = [...rows].sort((a, b) => {
        const left = a.validFrom?.getTime() ?? Number.NEGATIVE_INFINITY
        const right = b.validFrom?.getTime() ?? Number.NEGATIVE_INFINITY
        return left === right ? a.id.localeCompare(b.id) : left - right
      })

      for (let i = 1; i < ordered.length; i += 1) {
        const later = ordered[i]
        if (!later) continue

        for (let j = 0; j < i; j += 1) {
          const earlier = ordered[j]
          if (!earlier) continue
          if (!overlaps(earlier, later)) continue

          issues.push(
            edgeIssue(
              CHECK.RELATIONSHIP_OVERLAPPING_EXCLUSIVE,
              later,
              `${later.source.canonicalName} is ${later.relationshipType.name} both ${earlier.target.canonicalName} (${formatDateRange(earlier.validFrom, earlier.validTo)}) and ${later.target.canonicalName} (${formatDateRange(later.validFrom, later.validTo)}).`,
              { conflictsWithRelationshipId: earlier.id },
            ),
          )
          break
        }
      }
    }
  }

  return issues
}

/* -------------------------------------------------------------------------- */
/* Coverage check                                                             */
/* -------------------------------------------------------------------------- */

/**
 * Whether each difficulty rung has enough eligible subjects to be worth playing.
 *
 * Eligibility is resolved with the same repository call the engine uses, not with
 * an approximation of it. A check that measured something slightly different
 * from what the generator does would be worse than no check: it would report
 * green while the game threw `InsufficientDataError`.
 */
async function checkCoverage(): Promise<DetectedIssue[]> {
  const definitions = await listGameDefinitions()
  const issues: DetectedIssue[] = []

  for (const definition of definitions) {
    if (!definition.isActive) continue

    const profile = effectiveProfile(definition)
    const eligible = await findCandidateEntities({
      entityType: definition.targetEntityType,
      minProminence: profile.minProminence,
      maxProminence: profile.maxProminence,
      requiredRelationshipTypeIds: definition.requiredRelationshipTypes
        .filter((link) => link.isRequired)
        .map((link) => link.relationshipTypeId),
      limit: MIN_SUBJECTS_PER_DIFFICULTY * 4,
    })

    if (eligible.length >= MIN_SUBJECTS_PER_DIFFICULTY) continue

    issues.push({
      checkCode: CHECK.QUIZZABLE_COVERAGE_LOW,
      severity: severityOf(CHECK.QUIZZABLE_COVERAGE_LOW),
      message: `${definition.name} has ${eligible.length} eligible ${entityTypeLabel(definition.targetEntityType)} subject${eligible.length === 1 ? '' : 's'}; ${MIN_SUBJECTS_PER_DIFFICULTY} are needed for questions to vary.`,
      subjectKey: definition.code,
      details: {
        definitionCode: definition.code,
        gameType: definition.gameType,
        difficulty: definition.difficulty,
        eligible: eligible.length,
        needed: MIN_SUBJECTS_PER_DIFFICULTY,
      },
    })
  }

  return issues
}

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

export type HealthRunResult = {
  runId: string
  issuesFound: number
  created: number
  refreshed: number
  resolved: number
  bySeverity: Record<IssueSeverity, number>
  byCheck: Record<string, number>
}

function summarise(issues: DetectedIssue[]) {
  const byCheck: Record<string, number> = {}
  const bySeverity: Record<IssueSeverity, number> = {
    [IssueSeverity.ERROR]: 0,
    [IssueSeverity.WARNING]: 0,
    [IssueSeverity.INFO]: 0,
  }

  for (const issue of issues) {
    byCheck[issue.checkCode] = (byCheck[issue.checkCode] ?? 0) + 1
    bySeverity[issue.severity] += 1
  }

  return { byCheck, bySeverity }
}

/**
 * Run every check and reconcile the results.
 *
 * The scan is an administrative mutation — it writes issue rows and resolves
 * others — so it is audited like any other (PRD §35), with the actor recorded.
 */
export async function runDataHealthScan(actor?: {
  id: string | null
  email: string | null
}): Promise<HealthRunResult> {
  const run = await startHealthRun(actor?.email ?? null)

  const [entities, relationships] = await Promise.all([scanEntities(), scanRelationships()])
  const data: ScanData = { entities, relationships, degree: indexDegrees(relationships) }

  const issues = [
    ...checkEntities(data),
    ...checkDuplicateNames(data),
    ...checkMembers(data),
    ...checkSongs(data),
    ...checkRelationships(data),
    ...checkExclusiveOverlaps(data),
    ...(await checkCoverage()),
  ]

  const { byCheck, bySeverity } = summarise(issues)
  const sync = await syncIssues(run.id, issues)
  await finishHealthRun(run.id, issues.length, byCheck)

  await writeAuditLog({
    actorId: actor?.id ?? null,
    actorEmail: actor?.email ?? null,
    action: AuditAction.DATA_HEALTH_RUN,
    entityType: 'DataHealthRun',
    entityId: run.id,
    summary: `Data health scan found ${issues.length} issue${issues.length === 1 ? '' : 's'} (${sync.created} new, ${sync.resolved} resolved).`,
    after: { byCheck, bySeverity },
  })

  return {
    runId: run.id,
    issuesFound: issues.length,
    created: sync.created,
    refreshed: sync.refreshed,
    resolved: sync.resolved,
    bySeverity,
    byCheck,
  }
}

/* -------------------------------------------------------------------------- */
/* Reads                                                                      */
/* -------------------------------------------------------------------------- */

export type HealthIssueView = {
  id: string
  checkCode: string
  check: CheckDefinition | null
  severity: IssueSeverity
  status: IssueStatus
  message: string
  detectedAt: Date
  entity: EntityRef | null
  relationship: {
    id: string
    label: string
    from: EntityRef
    to: EntityRef
    window: string
  } | null
  /** Where an admin goes to fix it. */
  fixHref: string | null
}

function toIssueView(row: IssueRow): HealthIssueView {
  const relationship = row.relationship
    ? {
        id: row.relationship.id,
        label: row.relationship.relationshipType.name,
        from: toEntityRef(row.relationship.source),
        to: toEntityRef(row.relationship.target),
        window: formatDateRange(row.relationship.validFrom, row.relationship.validTo),
      }
    : null

  const fixHref = row.entity
    ? `/admin/entities/${row.entity.id}`
    : relationship
      ? `/admin/relationships/${relationship.id}`
      : null

  return {
    id: row.id,
    checkCode: row.checkCode,
    check: checkDefinition(row.checkCode) ?? null,
    severity: row.severity,
    status: row.status,
    message: row.message,
    detectedAt: row.detectedAt,
    entity: row.entity ? toEntityRef(row.entity) : null,
    relationship,
    fixHref,
  }
}

export type HealthCheckSummary = {
  check: CheckDefinition
  count: number
}

export type HealthReport = {
  lastRun: {
    id: string
    startedAt: Date
    finishedAt: Date | null
    issuesFound: number
    triggeredBy: string | null
  } | null
  totals: Record<IssueSeverity, number>
  /** Every check, including the ones currently passing — a green row is news. */
  checks: HealthCheckSummary[]
  blockingGames: HealthCheckSummary[]
  recentRuns: {
    id: string
    startedAt: Date
    finishedAt: Date | null
    issuesFound: number
  }[]
}

export async function getHealthReport(): Promise<HealthReport> {
  const [lastRun, counts, runs] = await Promise.all([
    latestHealthRun(),
    countIssuesByCheck(IssueStatus.OPEN),
    listHealthRuns(8),
  ])

  const countByCheck = new Map<string, number>()
  const totals: Record<IssueSeverity, number> = {
    [IssueSeverity.ERROR]: 0,
    [IssueSeverity.WARNING]: 0,
    [IssueSeverity.INFO]: 0,
  }

  for (const row of counts) {
    countByCheck.set(row.checkCode, (countByCheck.get(row.checkCode) ?? 0) + row.count)
    totals[row.severity] += row.count
  }

  const checks = Object.values(CHECK_DEFINITIONS)
    .map((check) => ({ check, count: countByCheck.get(check.code) ?? 0 }))
    .sort((a, b) => {
      const bySeverity = SEVERITY_ORDER[a.check.severity] - SEVERITY_ORDER[b.check.severity]
      return bySeverity !== 0 ? bySeverity : b.count - a.count
    })

  return {
    lastRun: lastRun
      ? {
          id: lastRun.id,
          startedAt: lastRun.startedAt,
          finishedAt: lastRun.finishedAt,
          issuesFound: lastRun.issuesFound,
          triggeredBy: lastRun.triggeredBy,
        }
      : null,
    totals,
    checks,
    blockingGames: checks.filter((row) => row.check.affectsGameQuality && row.count > 0),
    recentRuns: runs.map((run) => ({
      id: run.id,
      startedAt: run.startedAt,
      finishedAt: run.finishedAt,
      issuesFound: run.issuesFound,
    })),
  }
}

export async function getHealthIssues(options: {
  status?: IssueStatus
  checkCode?: string
  page?: number
  pageSize?: number
} = {}): Promise<Paginated<HealthIssueView>> {
  const { rows, total, page, pageSize } = await listIssues(options)

  return {
    items: rows.map(toIssueView),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/**
 * Change one issue's status.
 *
 * Ignoring is a judgement call about the archive — "this member really has no
 * team history yet" — so it is audited with the reason the admin gave.
 */
export async function setHealthIssueStatus(
  issueId: string,
  status: IssueStatus,
  actor: { id: string | null; email: string | null },
  reason?: string,
): Promise<void> {
  const updated = await setIssueStatus(issueId, status)

  await writeAuditLog({
    actorId: actor.id,
    actorEmail: actor.email,
    action: AuditAction.CONFIG_CHANGE,
    entityType: 'DataHealthIssue',
    entityId: issueId,
    summary: `Marked ${updated.checkCode} as ${status}${reason ? `: ${reason}` : ''}.`,
    after: { status, reason: reason ?? null },
  })
}
