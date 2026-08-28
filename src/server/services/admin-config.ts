import {
  MASTERY_DIMENSION_LABELS,
  MASTERY_DIMENSIONS_V1,
  MASTERY_SCOPE_LABELS,
  MASTERY_SCOPES_V1,
} from '@/domain/mastery'
import {
  dimensionWeightInputSchema,
  eraInputSchema,
  gameDefinitionInputSchema,
  masteryStatusInputSchema,
  relationshipTypeInputSchema,
  settingInputSchema,
  sourceInputSchema,
  toFieldErrors,
  userRoleInputSchema,
  type FieldErrors,
} from '@/domain/validation'
import type {
  Difficulty,
  EntityType,
  GameType,
  MasteryDimension,
  MasteryScope,
  Prisma,
  SourceType,
  UserRole as UserRoleValue,
} from '@/generated/prisma/client'
import { AuditAction, UserRole } from '@/generated/prisma/enums'
import { toISODate } from '@/lib/date'
import type { Paginated } from '@/types/graph'

import { createEra, deleteEra, listEras, updateEra } from '../repositories/era-repository'
import {
  createGameDefinition,
  findGameDefinitionById,
  listGameDefinitions,
  updateGameDefinition,
} from '../repositories/game-repository'
import {
  createMasteryStatus,
  deleteMasteryStatus,
  findMasteryStatusById,
  listDimensionWeights,
  listMasteryStatuses,
  updateMasteryStatus,
  upsertDimensionWeight,
} from '../repositories/mastery-repository'
import { countRelationshipsByType } from '../repositories/relationship-repository'
import {
  createRelationshipType,
  deactivateRelationshipType,
  findRelationshipTypeById,
  listRelationshipTypes,
  updateRelationshipType,
} from '../repositories/relationship-type-repository'
import { listSettings, setSetting } from '../repositories/settings-repository'
import {
  countSourceUsage,
  createSource,
  deleteSource,
  findSourceById,
  listSources,
  updateSource,
} from '../repositories/source-repository'
import {
  countAdmins,
  findProfileById,
  listProfiles,
  setUserRole,
} from '../repositories/user-repository'

import { recordChange, type Actor } from './audit'
import type { AdminResult } from './entity-admin'

/**
 * Configuration writes (PRD §19, §35).
 *
 * Everything the archive treats as tunable rather than compiled lives here: the
 * relationship vocabulary, sources, eras, mastery bands and dimension weights,
 * game definitions, settings and user roles. The reason any of it is data is
 * §8.3 — "status name tidak boleh hard-coded" — together with §6, which makes a
 * game's difficulty and scoring properties of a row rather than of a code path.
 * This service is what makes those rows editable without making them editable by
 * anyone.
 *
 * Three rules, the same ones `entity-admin` follows: nothing is written that was
 * not parsed by a schema in `domain/validation`; every mutation writes its audit
 * entry in the same call; and every function takes an `Actor` the caller can only
 * have obtained from a resolved session. Authorization happens above this layer,
 * in the action or handler.
 *
 * Config edits are audited as `CONFIG_CHANGE` even when the change is a single
 * number — retuning `pointsIncorrect` silently changes every score that follows,
 * and someone should be able to find out when it happened.
 */

function fail<T>(message: string, fieldErrors: FieldErrors = {}): AdminResult<T> {
  return { ok: false, message, fieldErrors }
}

function invalid<T>(error: Parameters<typeof toFieldErrors>[0]): AdminResult<T> {
  return {
    ok: false,
    message: 'Please correct the highlighted fields.',
    fieldErrors: toFieldErrors(error),
  }
}

/**
 * A unique-constraint rejection, recognised by its code.
 *
 * Duck-typed rather than caught by class so this module needs no import from the
 * Prisma runtime. Reading the rejection also beats the alternative — pre-checking
 * every unique column before every write races a concurrent editor and still has
 * to handle the error it was meant to prevent.
 */
function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  )
}

async function audit(
  actor: Actor,
  entityType: string,
  entityId: string | null,
  summary: string,
  before?: unknown,
  after?: unknown,
): Promise<void> {
  await recordChange({
    actor,
    action: AuditAction.CONFIG_CHANGE,
    entityType,
    entityId,
    summary,
    before,
    after,
  })
}

/* -------------------------------------------------------------------------- */
/* Relationship types                                                         */
/* -------------------------------------------------------------------------- */

/**
 * The relationship vocabulary is the graph's schema, held as data (PRD §10).
 *
 * Adding `PRODUCED_BY` should not require a migration, so types are rows. What
 * they must not do is vanish: a type with edges is retired, not deleted, because
 * deleting it would take the facts with it.
 */
export type RelationshipTypeView = {
  id: string
  code: string
  name: string
  inverseName: string | null
  description: string | null
  isDirectional: boolean
  isTemporal: boolean
  isQuizzable: boolean
  isActive: boolean
  displayOrder: number
  allowedSourceTypes: EntityType[]
  allowedTargetTypes: EntityType[]
  /** How many edges use it — the number that makes deletion unsafe. */
  usageCount: number
}

export async function getRelationshipTypes(): Promise<RelationshipTypeView[]> {
  const [types, counts] = await Promise.all([
    listRelationshipTypes(true),
    countRelationshipsByType(),
  ])

  return types.map((type) => ({
    id: type.id,
    code: type.code,
    name: type.name,
    inverseName: type.inverseName,
    description: type.description,
    isDirectional: type.isDirectional,
    isTemporal: type.isTemporal,
    isQuizzable: type.isQuizzable,
    isActive: type.isActive,
    displayOrder: type.displayOrder,
    allowedSourceTypes: [...type.allowedSourceTypes],
    allowedTargetTypes: [...type.allowedTargetTypes],
    usageCount: counts.get(type.id) ?? 0,
  }))
}

function snapshotRelationshipType(row: {
  code: string
  name: string
  inverseName: string | null
  isDirectional: boolean
  isTemporal: boolean
  isQuizzable: boolean
  isActive: boolean
  displayOrder: number
  allowedSourceTypes: readonly EntityType[]
  allowedTargetTypes: readonly EntityType[]
}): Record<string, unknown> {
  return {
    code: row.code,
    name: row.name,
    inverseName: row.inverseName,
    isDirectional: row.isDirectional,
    isTemporal: row.isTemporal,
    isQuizzable: row.isQuizzable,
    isActive: row.isActive,
    displayOrder: row.displayOrder,
    allowedSourceTypes: [...row.allowedSourceTypes],
    allowedTargetTypes: [...row.allowedTargetTypes],
  }
}

/**
 * Create or update a relationship type.
 *
 * Narrowing `allowedSourceTypes` on a type that already has edges is permitted:
 * those edges are recorded facts, and the data health run is the place that
 * reports the ones the new rule would have rejected. Refusing the edit would only
 * mean a rule can never be tightened after the first mistake.
 */
export async function saveRelationshipType(
  id: string | null,
  input: unknown,
  actor: Actor,
): Promise<AdminResult<{ id: string; code: string }>> {
  const parsed = relationshipTypeInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const values = parsed.data

  const data = {
    code: values.code,
    name: values.name,
    inverseName: values.inverseName,
    description: values.description,
    isDirectional: values.isDirectional,
    isTemporal: values.isTemporal,
    allowedSourceTypes: values.allowedSourceTypes,
    allowedTargetTypes: values.allowedTargetTypes,
    isQuizzable: values.isQuizzable,
    displayOrder: values.displayOrder,
    isActive: values.isActive,
  }

  try {
    if (!id) {
      const created = await createRelationshipType(data)
      await audit(
        actor,
        'RelationshipType',
        created.id,
        `Added relationship type ${created.code}`,
        undefined,
        snapshotRelationshipType(created),
      )
      return { ok: true, data: { id: created.id, code: created.code } }
    }

    const existing = await findRelationshipTypeById(id)
    if (!existing) return fail('That relationship type no longer exists.')

    const updated = await updateRelationshipType(id, data)
    await audit(
      actor,
      'RelationshipType',
      id,
      `Updated relationship type ${updated.code}`,
      snapshotRelationshipType(existing),
      snapshotRelationshipType(updated),
    )
    return { ok: true, data: { id, code: updated.code } }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    return fail('That code is already in use.', { code: ['Already used by another type'] })
  }
}

/**
 * Retire a type instead of deleting it.
 *
 * `Relationship.relationshipType` is `onDelete: Restrict`, so the database would
 * refuse the delete once an edge exists anyway. Retiring removes the type from
 * the relationship builder while leaving every recorded edge readable — the same
 * distinction as closing a relationship rather than erasing it.
 */
export async function retireRelationshipType(
  id: string,
  actor: Actor,
): Promise<AdminResult<{ id: string }>> {
  const existing = await findRelationshipTypeById(id)
  if (!existing) return fail('That relationship type no longer exists.')
  if (!existing.isActive) return { ok: true, data: { id } }

  await deactivateRelationshipType(id)
  await audit(
    actor,
    'RelationshipType',
    id,
    `Retired relationship type ${existing.code}`,
    { isActive: true },
    { isActive: false },
  )

  return { ok: true, data: { id } }
}

/* -------------------------------------------------------------------------- */
/* Sources                                                                    */
/* -------------------------------------------------------------------------- */

export type SourceView = {
  id: string
  name: string
  url: string | null
  sourceType: SourceType
  retrievedAt: Date | null
  notes: string | null
  /** Records citing this source, split by kind. */
  usage: { entities: number; relationships: number; total: number }
}

/**
 * Sources back the provenance line on every record (PRD §13).
 *
 * The usage count is shown because a citation is what makes a claim checkable: an
 * archive that cannot say where a fact came from is a rumour with a stylesheet.
 */
export async function getSources(): Promise<SourceView[]> {
  const sources = await listSources()
  const usage = await Promise.all(sources.map((source) => countSourceUsage(source.id)))

  return sources.map((source, index) => {
    const counts = usage[index] ?? { entities: 0, relationships: 0 }

    return {
      id: source.id,
      name: source.name,
      url: source.url,
      sourceType: source.sourceType,
      retrievedAt: source.retrievedAt,
      notes: source.notes,
      usage: {
        entities: counts.entities,
        relationships: counts.relationships,
        total: counts.entities + counts.relationships,
      },
    }
  })
}

function snapshotSource(row: {
  name: string
  url: string | null
  sourceType: SourceType
  retrievedAt: Date | null
}): Record<string, unknown> {
  return {
    name: row.name,
    url: row.url,
    sourceType: row.sourceType,
    retrievedAt: toISODate(row.retrievedAt) ?? null,
  }
}

export async function saveSource(
  id: string | null,
  input: unknown,
  actor: Actor,
): Promise<AdminResult<{ id: string; name: string }>> {
  const parsed = sourceInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const values = parsed.data

  if (!id) {
    const created = await createSource(values)
    await audit(
      actor,
      'Source',
      created.id,
      `Added source “${created.name}”`,
      undefined,
      snapshotSource(created),
    )
    return { ok: true, data: { id: created.id, name: created.name } }
  }

  const existing = await findSourceById(id)
  if (!existing) return fail('That source no longer exists.')

  const updated = await updateSource(id, values)
  await audit(
    actor,
    'Source',
    id,
    `Updated source “${updated.name}”`,
    snapshotSource(existing),
    snapshotSource(updated),
  )

  return { ok: true, data: { id, name: updated.name } }
}

/**
 * Deleting a source clears citations rather than cascading.
 *
 * The relation is `onDelete: SetNull`, so the records survive without their
 * provenance and the `MISSING_PROVENANCE` health check then reports them. That is
 * the right outcome: losing a citation is a data-quality problem, not a reason to
 * lose the fact. The count comes back so a confirmation dialog can say how many
 * records are about to become unsourced.
 */
export async function removeSource(
  id: string,
  actor: Actor,
): Promise<AdminResult<{ id: string; unlinked: number }>> {
  const existing = await findSourceById(id)
  if (!existing) return fail('That source no longer exists.')

  const counts = await countSourceUsage(id)
  const unlinked = counts.entities + counts.relationships

  await deleteSource(id)
  await audit(
    actor,
    'Source',
    id,
    `Deleted source “${existing.name}”; ${unlinked} record${unlinked === 1 ? '' : 's'} left without provenance`,
    snapshotSource(existing),
  )

  return { ok: true, data: { id, unlinked } }
}

/* -------------------------------------------------------------------------- */
/* Eras                                                                       */
/* -------------------------------------------------------------------------- */

function snapshotEra(row: {
  name: string
  slug: string
  startDate: Date
  endDate: Date | null
  displayOrder: number
}): Record<string, unknown> {
  return {
    name: row.name,
    slug: row.slug,
    startDate: toISODate(row.startDate),
    endDate: toISODate(row.endDate) ?? null,
    displayOrder: row.displayOrder,
  }
}

/**
 * Eras are the timeline's editorial spine (PRD §4).
 *
 * They are curation, not derivation: "Awal", "Ekspansi", "Reformasi" are a
 * historian's reading of the same edges, which is why they are rows an admin
 * writes rather than buckets computed from dates. An open-ended era — no end date
 * — is the current one.
 */
export async function saveEra(
  id: string | null,
  input: unknown,
  actor: Actor,
): Promise<AdminResult<{ id: string; name: string }>> {
  const parsed = eraInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const values = parsed.data

  if (values.endDate && values.endDate < values.startDate) {
    return fail('An era cannot end before it starts.', { endDate: ['Earlier than the start date'] })
  }

  const data = {
    name: values.name,
    slug: values.slug,
    startDate: values.startDate,
    endDate: values.endDate,
    description: values.description,
    displayOrder: values.displayOrder,
  }

  try {
    if (!id) {
      const created = await createEra(data)
      await audit(
        actor,
        'Era',
        created.id,
        `Added era “${created.name}”`,
        undefined,
        snapshotEra(created),
      )
      return { ok: true, data: { id: created.id, name: created.name } }
    }

    const existing = (await listEras()).find((era) => era.id === id)
    if (!existing) return fail('That era no longer exists.')

    const updated = await updateEra(id, data)
    await audit(
      actor,
      'Era',
      id,
      `Updated era “${updated.name}”`,
      snapshotEra(existing),
      snapshotEra(updated),
    )
    return { ok: true, data: { id, name: updated.name } }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    return fail('That slug is already in use.', { slug: ['Already used by another era'] })
  }
}

/**
 * Eras carry no foreign keys from the graph — the timeline resolves them by date
 * range — so deleting one removes a label and nothing else.
 */
export async function removeEra(id: string, actor: Actor): Promise<AdminResult<{ id: string }>> {
  const existing = (await listEras()).find((era) => era.id === id)
  if (!existing) return fail('That era no longer exists.')

  await deleteEra(id)
  await audit(actor, 'Era', id, `Deleted era “${existing.name}”`, snapshotEra(existing))

  return { ok: true, data: { id } }
}

/* -------------------------------------------------------------------------- */
/* Mastery configuration                                                      */
/* -------------------------------------------------------------------------- */

export type MasteryStatusView = {
  id: string
  name: string
  slug: string
  minScore: number
  maxScore: number
  colorHex: string | null
  description: string | null
  displayOrder: number
  isActive: boolean
}

export type MasteryConfig = {
  statuses: MasteryStatusView[]
  weights: { scope: MasteryScope; dimension: MasteryDimension; weight: number }[]
  /** Score ranges no active band covers — a player there would have no label. */
  gaps: { from: number; to: number }[]
  /** Pairs of active bands claiming the same score. */
  overlaps: { first: string; second: string }[]
}

/**
 * The mastery configuration screen, coverage problems included.
 *
 * Bands are free-form by design (§8.3), which means an admin can leave 61–70
 * unlabelled or let two bands both claim 80. Neither is something the database can
 * refuse, so this reports them instead: a gap means a real player sees no status
 * at all, and an overlap means the status they see depends on row order. Both are
 * worth knowing before a player finds out.
 */
export async function getMasteryConfig(): Promise<MasteryConfig> {
  const [statuses, weights] = await Promise.all([listMasteryStatuses(true), listDimensionWeights()])

  const active = statuses
    .filter((status) => status.isActive)
    .sort((a, b) => a.minScore - b.minScore)

  const gaps: MasteryConfig['gaps'] = []
  let cursor = 0
  for (const status of active) {
    if (status.minScore > cursor) gaps.push({ from: cursor, to: status.minScore - 1 })
    cursor = Math.max(cursor, status.maxScore + 1)
  }
  if (cursor <= 100) gaps.push({ from: cursor, to: 100 })

  const overlaps: MasteryConfig['overlaps'] = []
  for (let index = 1; index < active.length; index += 1) {
    const previous = active[index - 1]
    const current = active[index]
    if (previous && current && current.minScore <= previous.maxScore) {
      overlaps.push({ first: previous.name, second: current.name })
    }
  }

  return {
    statuses: statuses.map((status) => ({
      id: status.id,
      name: status.name,
      slug: status.slug,
      minScore: status.minScore,
      maxScore: status.maxScore,
      colorHex: status.colorHex,
      description: status.description,
      displayOrder: status.displayOrder,
      isActive: status.isActive,
    })),
    weights: weights.map((weight) => ({
      scope: weight.scope,
      dimension: weight.dimension,
      weight: weight.weight,
    })),
    gaps,
    overlaps,
  }
}

function snapshotMasteryStatus(row: {
  name: string
  slug: string
  minScore: number
  maxScore: number
  isActive: boolean
}): Record<string, unknown> {
  return {
    name: row.name,
    slug: row.slug,
    minScore: row.minScore,
    maxScore: row.maxScore,
    isActive: row.isActive,
  }
}

export async function saveMasteryStatus(
  id: string | null,
  input: unknown,
  actor: Actor,
): Promise<AdminResult<{ id: string; name: string }>> {
  const parsed = masteryStatusInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const values = parsed.data

  try {
    if (!id) {
      const created = await createMasteryStatus(values)
      await audit(
        actor,
        'MasteryStatus',
        created.id,
        `Added mastery status “${created.name}”`,
        undefined,
        snapshotMasteryStatus(created),
      )
      return { ok: true, data: { id: created.id, name: created.name } }
    }

    const existing = await findMasteryStatusById(id)
    if (!existing) return fail('That status no longer exists.')

    const updated = await updateMasteryStatus(id, values)
    await audit(
      actor,
      'MasteryStatus',
      id,
      `Updated mastery status “${updated.name}”`,
      snapshotMasteryStatus(existing),
      snapshotMasteryStatus(updated),
    )
    return { ok: true, data: { id, name: updated.name } }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    return fail('That slug is already in use.', { slug: ['Already used by another status'] })
  }
}

/**
 * Removing the last active band is refused.
 *
 * Mastery resolves a score by looking a band up; with none left there is nothing
 * to resolve to and the profile page has nothing to say about a real score. Note
 * what this constrains — the *count* of bands, never their names or thresholds.
 */
export async function removeMasteryStatus(
  id: string,
  actor: Actor,
): Promise<AdminResult<{ id: string }>> {
  const statuses = await listMasteryStatuses(true)
  const existing = statuses.find((status) => status.id === id)
  if (!existing) return fail('That status no longer exists.')

  const activeCount = statuses.filter((status) => status.isActive).length
  if (existing.isActive && activeCount <= 1) {
    return fail('At least one active status band must remain.')
  }

  await deleteMasteryStatus(id)
  await audit(
    actor,
    'MasteryStatus',
    id,
    `Deleted mastery status “${existing.name}”`,
    snapshotMasteryStatus(existing),
  )

  return { ok: true, data: { id } }
}

/**
 * Dimension weights decide how the five dimensions roll up (PRD §8.2).
 *
 * Weights are relative, not percentages: the roll-up normalises by their sum, so
 * an admin can say "relationships matter twice as much as songs" without doing
 * arithmetic that has to total 100. A weight of 0 drops a dimension out of the
 * overall score while still tracking it on its own.
 */
export async function saveDimensionWeight(
  input: unknown,
  actor: Actor,
): Promise<AdminResult<{ scope: MasteryScope; dimension: MasteryDimension; weight: number }>> {
  const parsed = dimensionWeightInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const values = parsed.data

  const before = (await listDimensionWeights(values.scope)).find(
    (weight) => weight.dimension === values.dimension,
  )

  await upsertDimensionWeight(values.scope, values.dimension, values.weight)
  await audit(
    actor,
    'MasteryDimensionWeight',
    null,
    `Set ${values.scope} / ${values.dimension} weight to ${values.weight}`,
    before ? { weight: before.weight } : undefined,
    { weight: values.weight },
  )

  return { ok: true, data: values }
}

/**
 * Every scope and dimension the weight editor must offer.
 *
 * Read from the domain lists rather than from existing rows, because a dimension
 * with no row yet is exactly the one an admin needs to be able to set.
 */
export function masteryWeightOptions() {
  return {
    scopes: MASTERY_SCOPES_V1.map((scope) => ({
      value: scope,
      label: MASTERY_SCOPE_LABELS[scope],
    })),
    dimensions: MASTERY_DIMENSIONS_V1.map((dimension) => ({
      value: dimension,
      label: MASTERY_DIMENSION_LABELS[dimension],
    })),
  }
}

/* -------------------------------------------------------------------------- */
/* Game definitions                                                           */
/* -------------------------------------------------------------------------- */

export type GameDefinitionView = {
  id: string
  code: string
  name: string
  gameType: GameType
  difficulty: Difficulty
  targetEntityType: EntityType
  isActive: boolean
  roundCount: number
  clueCount: number
  hopCount: number
  optionCount: number
  timeLimitSec: number | null
  pointsCorrect: number
  pointsRelationshipCorrect: number
  pointsIncorrect: number
  displayOrder: number
  relationshipTypes: { id: string; code: string; name: string; isRequired: boolean }[]
}

export async function getGameDefinitions(): Promise<GameDefinitionView[]> {
  const definitions = await listGameDefinitions(true)

  return definitions.map((definition) => ({
    id: definition.id,
    code: definition.code,
    name: definition.name,
    gameType: definition.gameType,
    difficulty: definition.difficulty,
    targetEntityType: definition.targetEntityType,
    isActive: definition.isActive,
    roundCount: definition.roundCount,
    clueCount: definition.clueCount,
    hopCount: definition.hopCount,
    optionCount: definition.optionCount,
    timeLimitSec: definition.timeLimitSec,
    pointsCorrect: definition.pointsCorrect,
    pointsRelationshipCorrect: definition.pointsRelationshipCorrect,
    pointsIncorrect: definition.pointsIncorrect,
    displayOrder: definition.displayOrder,
    relationshipTypes: definition.requiredRelationshipTypes.map((link) => ({
      id: link.relationshipType.id,
      code: link.relationshipType.code,
      name: link.relationshipType.name,
      isRequired: link.isRequired,
    })),
  }))
}

/**
 * The join rows that tell a generator which edges it may use.
 *
 * Required types gate subject selection — a Mystery Member round is impossible for
 * a member with no team history — while enriching types only supply extra clues.
 * A type named in both lists is treated as required, because the stricter reading
 * is the one that cannot produce an unanswerable question.
 */
function relationshipLinkRows(
  requiredIds: readonly string[],
  enrichingIds: readonly string[],
): Prisma.GameDefinitionRelationshipTypeCreateManyGameDefinitionInput[] {
  const required = new Set(requiredIds)
  const rows = [...required].map((relationshipTypeId) => ({
    relationshipTypeId,
    isRequired: true,
  }))

  for (const relationshipTypeId of new Set(enrichingIds)) {
    if (required.has(relationshipTypeId)) continue
    rows.push({ relationshipTypeId, isRequired: false })
  }

  return rows
}

function snapshotDefinition(row: {
  code: string
  name: string
  difficulty: Difficulty
  isActive: boolean
  roundCount: number
  clueCount: number
  hopCount: number
  optionCount: number
  pointsCorrect: number
  pointsRelationshipCorrect: number
  pointsIncorrect: number
  timeLimitSec: number | null
  requiredRelationshipTypes: { relationshipType: { code: string }; isRequired: boolean }[]
}): Record<string, unknown> {
  const codes = (isRequired: boolean) =>
    row.requiredRelationshipTypes
      .filter((link) => link.isRequired === isRequired)
      .map((link) => link.relationshipType.code)
      .sort()

  return {
    code: row.code,
    name: row.name,
    difficulty: row.difficulty,
    isActive: row.isActive,
    roundCount: row.roundCount,
    clueCount: row.clueCount,
    hopCount: row.hopCount,
    optionCount: row.optionCount,
    pointsCorrect: row.pointsCorrect,
    pointsRelationshipCorrect: row.pointsRelationshipCorrect,
    pointsIncorrect: row.pointsIncorrect,
    timeLimitSec: row.timeLimitSec,
    requiredTypes: codes(true),
    enrichingTypes: codes(false),
  }
}

/**
 * Create or update a game definition (PRD §6).
 *
 * The relationship-type gates are rewritten as a nested `deleteMany` +
 * `createMany`, which Prisma runs in the same transaction as the scalar update. A
 * definition briefly holding half its required types would let the generator pick
 * a subject it cannot build a question about.
 */
export async function saveGameDefinition(
  id: string | null,
  input: unknown,
  actor: Actor,
): Promise<AdminResult<{ id: string; code: string }>> {
  const parsed = gameDefinitionInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const values = parsed.data

  const links = relationshipLinkRows(
    values.requiredRelationshipTypeIds,
    values.enrichingRelationshipTypeIds,
  )

  const scalars = {
    code: values.code,
    gameType: values.gameType,
    difficulty: values.difficulty,
    name: values.name,
    description: values.description,
    questionStrategy: values.questionStrategy,
    answerMode: values.answerMode,
    targetEntityType: values.targetEntityType,
    clueCount: values.clueCount,
    optionCount: values.optionCount,
    hopCount: values.hopCount,
    roundCount: values.roundCount,
    timeLimitSec: values.timeLimitSec,
    pointsCorrect: values.pointsCorrect,
    pointsRelationshipCorrect: values.pointsRelationshipCorrect,
    pointsIncorrect: values.pointsIncorrect,
    isActive: values.isActive,
    displayOrder: values.displayOrder,
    // An absent `config` leaves whatever the row already holds. Writing a JSON
    // null instead would erase a generator's knobs on an unrelated edit.
    ...(values.config === undefined ? {} : { config: values.config as Prisma.InputJsonValue }),
  }

  try {
    if (!id) {
      const created = await createGameDefinition({
        ...scalars,
        requiredRelationshipTypes: { createMany: { data: links } },
      })
      await audit(
        actor,
        'GameDefinition',
        created.id,
        `Added game “${created.name}”`,
        undefined,
        snapshotDefinition(created),
      )
      return { ok: true, data: { id: created.id, code: created.code } }
    }

    const existing = await findGameDefinitionById(id)
    if (!existing) return fail('That game definition no longer exists.')

    const updated = await updateGameDefinition(id, {
      ...scalars,
      requiredRelationshipTypes: { deleteMany: {}, createMany: { data: links } },
    })
    await audit(
      actor,
      'GameDefinition',
      id,
      `Updated game “${updated.name}”`,
      snapshotDefinition(existing),
      snapshotDefinition(updated),
    )
    return { ok: true, data: { id, code: updated.code } }
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
    return fail('That code is already in use.', { code: ['Already used by another game'] })
  }
}

/**
 * Games are activated and deactivated, never deleted.
 *
 * `GameSession.gameDefinition` points at the row, and a player's history should
 * still be able to say which game they played and how it was scored. Deactivating
 * removes it from the catalogue and leaves their record intact — this is also how
 * the Daily Challenge ships seeded but inactive in V1.
 */
export async function setGameDefinitionActive(
  id: string,
  isActive: boolean,
  actor: Actor,
): Promise<AdminResult<{ id: string }>> {
  const existing = await findGameDefinitionById(id)
  if (!existing) return fail('That game definition no longer exists.')
  if (existing.isActive === isActive) return { ok: true, data: { id } }

  await updateGameDefinition(id, { isActive })
  await audit(
    actor,
    'GameDefinition',
    id,
    `${isActive ? 'Activated' : 'Deactivated'} game “${existing.name}”`,
    { isActive: existing.isActive },
    { isActive },
  )

  return { ok: true, data: { id } }
}

/* -------------------------------------------------------------------------- */
/* Settings                                                                   */
/* -------------------------------------------------------------------------- */

export type SettingView = {
  key: string
  value: unknown
  group: string
  description: string | null
  updatedAt: Date
}

export async function getSettingsList(): Promise<SettingView[]> {
  const rows = await listSettings()

  return rows.map((row) => ({
    key: row.key,
    value: row.value,
    group: row.group,
    description: row.description,
    updatedAt: row.updatedAt,
  }))
}

/**
 * Write one setting.
 *
 * Group and description fall back to whatever the row already carries, so a form
 * that only posts a value does not strip the row's own documentation.
 */
export async function saveSetting(
  input: unknown,
  actor: Actor,
): Promise<AdminResult<{ key: string }>> {
  const parsed = settingInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const values = parsed.data

  const before = (await listSettings()).find((row) => row.key === values.key)

  await setSetting(
    values.key,
    values.value,
    values.group ?? before?.group ?? 'general',
    values.description ?? before?.description ?? undefined,
  )

  await audit(
    actor,
    'AppSetting',
    values.key,
    `Changed setting ${values.key}`,
    before ? { value: before.value } : undefined,
    { value: values.value },
  )

  return { ok: true, data: { key: values.key } }
}

/* -------------------------------------------------------------------------- */
/* Users                                                                      */
/* -------------------------------------------------------------------------- */

export type UserView = {
  id: string
  email: string
  displayName: string | null
  role: UserRoleValue
  lastSeenAt: Date | null
  createdAt: Date
}

export async function getUsers(
  options: { page?: number; pageSize?: number; search?: string } = {},
): Promise<Paginated<UserView>> {
  const { rows, total, page, pageSize } = await listProfiles(options)

  return {
    items: rows.map((row) => ({
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      role: row.role,
      lastSeenAt: row.lastSeenAt,
      createdAt: row.createdAt,
    })),
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
  }
}

/**
 * Change a user's role.
 *
 * This function is the whole of PRD §19's "admin functionality must never depend
 * on a hard-coded username": admin is a column, granted by another admin, and the
 * first one comes from the seed. Two guards, both about not locking everyone out
 * of the archive:
 *
 *   - demoting the last admin is refused, since nobody would be left who could
 *     promote anyone;
 *   - an admin cannot demote themselves, which is the same mistake by a shorter
 *     route and by far the more likely of the two.
 */
export async function changeUserRole(
  input: unknown,
  actor: Actor,
): Promise<AdminResult<{ id: string; role: UserRoleValue }>> {
  const parsed = userRoleInputSchema.safeParse(input)
  if (!parsed.success) return invalid(parsed.error)
  const values = parsed.data

  const target = await findProfileById(values.userId)
  if (!target) return fail('That user no longer exists.')
  if (target.role === values.role) return { ok: true, data: { id: target.id, role: target.role } }

  const losingAdmin = target.role === UserRole.ADMIN && values.role !== UserRole.ADMIN
  if (losingAdmin) {
    if (actor.id === target.id) {
      return fail('You cannot remove your own admin access. Ask another admin to do it.')
    }
    if ((await countAdmins()) <= 1) {
      return fail('At least one admin must remain. Promote someone else first.')
    }
  }

  await setUserRole(values.userId, values.role)
  await audit(
    actor,
    'UserProfile',
    values.userId,
    `Changed ${target.email}'s role to ${values.role}`,
    { role: target.role },
    { role: values.role },
  )

  return { ok: true, data: { id: values.userId, role: values.role } }
}

/* -------------------------------------------------------------------------- */
/* Landing page counts                                                        */
/* -------------------------------------------------------------------------- */

export type ConfigSummary = {
  relationshipTypes: { total: number; active: number }
  sources: number
  eras: number
  masteryStatuses: { total: number; active: number }
  gameDefinitions: { total: number; active: number }
  admins: number
}

/**
 * Counts for the configuration landing page.
 *
 * These are all small vocabulary tables, so they are counted from the repository
 * lists rather than through count queries of their own — cheaper in round trips
 * than it is expensive in rows, and it keeps this service talking only to
 * repositories.
 */
export async function getConfigSummary(): Promise<ConfigSummary> {
  const [types, sources, eras, statuses, definitions, admins] = await Promise.all([
    listRelationshipTypes(true),
    listSources(),
    listEras(),
    listMasteryStatuses(true),
    listGameDefinitions(true),
    countAdmins(),
  ])

  return {
    relationshipTypes: {
      total: types.length,
      active: types.filter((type) => type.isActive).length,
    },
    sources: sources.length,
    eras: eras.length,
    masteryStatuses: {
      total: statuses.length,
      active: statuses.filter((status) => status.isActive).length,
    },
    gameDefinitions: {
      total: definitions.length,
      active: definitions.filter((definition) => definition.isActive).length,
    },
    admins,
  }
}
