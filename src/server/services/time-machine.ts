import { REL } from '@/domain/relationship-types'
import { EntityType } from '@/generated/prisma/enums'
import { toDateOnly, today } from '@/lib/date'
import type { EntityRef } from '@/types/graph'

import { findEntitiesActiveOn } from '../repositories/entity-repository'
import { findEraCovering, listEras } from '../repositories/era-repository'
import { findEdgesByType } from '../repositories/relationship-repository'

import { toEntityRef } from './entity-mapper'

/**
 * Time Machine — PRD §4.3, §11.
 *
 * "What was true on this date?" is answered by filtering relationship validity,
 * never by reading a per-year snapshot table. There is no snapshot table, and
 * adding one would be the wrong fix for any performance problem here: the right
 * fix is an index on (valid_from, valid_to), which the schema already has.
 */

export type TeamRoster = {
  team: EntityRef
  captain: EntityRef | null
  members: EntityRef[]
}

export type EraRef = {
  id: string
  name: string
  slug: string
  startDate: Date
  endDate: Date | null
  description: string | null
}

export type TimeMachineSnapshot = {
  asOf: Date
  era: EraRef | null
  eras: EraRef[]
  rosters: TeamRoster[]
  generations: EntityRef[]
  /** Members holding at least one team membership on this date. */
  activeMembers: EntityRef[]
  totals: {
    teams: number
    members: number
    generations: number
  }
}

function toEraRef(row: {
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
 * The state of the group on a single date.
 *
 * Three queries total: memberships, captaincies, generations. Rosters are
 * assembled in memory because the alternative — one query per team — turns a
 * page view into thirty round trips against a pooled serverless connection.
 */
export async function getSnapshot(asOfInput?: Date | string | null): Promise<TimeMachineSnapshot> {
  const asOf = toDateOnly(asOfInput ?? undefined) ?? today()

  const [membershipEdges, captainEdges, generationRows, eraRows, currentEra] = await Promise.all([
    findEdgesByType(REL.MEMBER_OF, { asOf }),
    findEdgesByType(REL.CAPTAIN_OF, { asOf }),
    findEntitiesActiveOn(asOf, [EntityType.GENERATION]),
    listEras(),
    findEraCovering(asOf),
  ])

  const teams = new Map<string, TeamRoster>()
  const members = new Map<string, EntityRef>()

  for (const edge of membershipEdges) {
    const member = toEntityRef(edge.source)
    const team = toEntityRef(edge.target)

    members.set(member.id, member)

    const existing = teams.get(team.id)
    if (existing) {
      existing.members.push(member)
    } else {
      teams.set(team.id, { team, captain: null, members: [member] })
    }
  }

  for (const edge of captainEdges) {
    const roster = teams.get(edge.targetEntityId)
    if (roster) roster.captain = toEntityRef(edge.source)
  }

  const rosters = [...teams.values()]
    .map((roster) => ({
      ...roster,
      members: [...roster.members].sort((a, b) => a.canonicalName.localeCompare(b.canonicalName)),
    }))
    .sort((a, b) => a.team.canonicalName.localeCompare(b.team.canonicalName))

  const generations = generationRows.map(toEntityRef)
  const activeMembers = [...members.values()].sort((a, b) =>
    a.canonicalName.localeCompare(b.canonicalName),
  )

  return {
    asOf,
    era: currentEra ? toEraRef(currentEra) : null,
    eras: eraRows.map(toEraRef),
    rosters,
    generations,
    activeMembers,
    totals: {
      teams: rosters.length,
      members: activeMembers.length,
      generations: generations.length,
    },
  }
}

export type RosterDiff = {
  from: Date
  to: Date
  joined: { member: EntityRef; team: EntityRef }[]
  left: { member: EntityRef; team: EntityRef }[]
  unchanged: number
}

/**
 * What changed between two dates.
 *
 * Two snapshots compared in memory rather than a dedicated query, because the
 * interesting output is the difference of two membership *sets* and there is no
 * SQL shape that expresses that more cheaply than fetching both.
 */
export async function diffSnapshots(
  fromInput: Date | string,
  toInput: Date | string,
): Promise<RosterDiff> {
  const from = toDateOnly(fromInput) ?? today()
  const to = toDateOnly(toInput) ?? today()

  const [before, after] = await Promise.all([
    findEdgesByType(REL.MEMBER_OF, { asOf: from }),
    findEdgesByType(REL.MEMBER_OF, { asOf: to }),
  ])

  const key = (sourceId: string, targetId: string) => `${sourceId}::${targetId}`

  const beforeKeys = new Map(
    before.map((edge) => [
      key(edge.sourceEntityId, edge.targetEntityId),
      { member: toEntityRef(edge.source), team: toEntityRef(edge.target) },
    ]),
  )
  const afterKeys = new Map(
    after.map((edge) => [
      key(edge.sourceEntityId, edge.targetEntityId),
      { member: toEntityRef(edge.source), team: toEntityRef(edge.target) },
    ]),
  )

  const joined = [...afterKeys.entries()]
    .filter(([k]) => !beforeKeys.has(k))
    .map(([, value]) => value)

  const left = [...beforeKeys.entries()]
    .filter(([k]) => !afterKeys.has(k))
    .map(([, value]) => value)

  const unchanged = [...afterKeys.keys()].filter((k) => beforeKeys.has(k)).length

  return { from, to, joined, left, unchanged }
}

/** Eras with their date ranges, for the Time Machine's date picker presets. */
export async function getEraOptions(): Promise<EraRef[]> {
  const rows = await listEras()
  return rows.map(toEraRef)
}
