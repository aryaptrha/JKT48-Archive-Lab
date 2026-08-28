import { attributeTableFor, categoryForEntityType, type AttributeTable } from '@/domain/entity-taxonomy'
import {
  ATTRIBUTE_SCHEMAS,
  dateOnlySchema,
  entityInputSchema,
  relationshipInputSchema,
  toFieldErrors,
  type FieldErrors,
} from '@/domain/validation'
import type { Prisma } from '@/generated/prisma/client'
import { AuditAction } from '@/generated/prisma/enums'
import { toISODate } from '@/lib/date'
import { slugify } from '@/lib/utils'
import type { z } from 'zod'

import {
  createEntity as insertEntity,
  deleteEntity as removeEntity,
  findEntityById,
  slugExists,
  updateEntity as writeEntity,
  type EntityWithAttributes,
} from '../repositories/entity-repository'
import {
  countEdgesTouching,
  createRelationship as insertRelationship,
  deleteRelationship as removeRelationship,
  findRelationshipById,
  updateRelationship as writeRelationship,
  type EdgeRow,
} from '../repositories/relationship-repository'
import { findRelationshipTypeById } from '../repositories/relationship-type-repository'

import { recordChange, type Actor } from './audit'

/**
 * Curation writes for entities and relationships (PRD §19, §35).
 *
 * Three rules hold for every function here, and they are the reason this layer
 * exists rather than pages calling repositories:
 *
 *   1. Nothing is written that was not parsed by a schema in `domain/validation`
 *      — "server-side validation for admin mutations" (§35). The caller may be a
 *      Server Action or a Route Handler; neither is trusted to have validated.
 *   2. Every mutation writes an audit entry in the same call that performs it, so
 *      an entry cannot be forgotten at a call site (§17).
 *   3. Authorization happens above this layer, in the action or handler, via
 *      `requireAdmin` / `authorizeAdmin`. Every function takes an `Actor` it can
 *      only have got from a resolved session — there is no default actor, which
 *      is what keeps an unauthenticated path from quietly reaching a write.
 *
 * Expected failures are returned, not thrown: an admin form needs field errors
 * back so it can re-render with the operator's input intact. Genuine faults —
 * a dead database, a bug — still throw.
 */

/* -------------------------------------------------------------------------- */
/* Results                                                                    */
/* -------------------------------------------------------------------------- */

export type AdminResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; fieldErrors: FieldErrors }

function fail<T>(message: string, fieldErrors: FieldErrors = {}): AdminResult<T> {
  return { ok: false, message, fieldErrors }
}

function failFromZod<T>(error: z.ZodError, prefix?: string): AdminResult<T> {
  const flat = toFieldErrors(error)
  if (!prefix) return { ok: false, message: 'Please correct the highlighted fields.', fieldErrors: flat }

  const prefixed: FieldErrors = {}
  for (const [field, messages] of Object.entries(flat)) {
    prefixed[`${prefix}.${field}`] = messages
  }
  return { ok: false, message: 'Please correct the highlighted fields.', fieldErrors: prefixed }
}

/**
 * Recognise a unique-constraint violation without importing Prisma's runtime.
 *
 * The alternative — pre-checking every unique column before every write — races
 * against concurrent editors and still has to handle the error. Reading the code
 * off the rejection is both simpler and correct.
 */
function uniqueViolationTargets(error: unknown): string[] | null {
  if (typeof error !== 'object' || error === null) return null
  const record = error as { code?: unknown; meta?: unknown }
  if (record.code !== 'P2002') return null

  const meta = record.meta
  if (typeof meta !== 'object' || meta === null) return []
  const target = (meta as { target?: unknown }).target
  if (Array.isArray(target)) return target.map(String)
  if (typeof target === 'string') return [target]
  return []
}

/* -------------------------------------------------------------------------- */
/* Slugs                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Resolve a unique slug.
 *
 * Slugs are permanent public URLs, so an operator may pin one explicitly; when
 * they do and it is taken, that is an error rather than something to silently
 * renumber. A slug derived from the name gets a numeric suffix instead, because
 * two members really can share a name.
 */
async function resolveSlug(
  requested: string | null,
  canonicalName: string,
  exceptId?: string,
): Promise<AdminResult<string>> {
  if (requested) {
    if (await slugExists(requested, exceptId)) {
      return fail('That slug is already in use.', { slug: ['Already used by another record'] })
    }
    return { ok: true, data: requested }
  }

  const base = slugify(canonicalName)
  if (!base) {
    return fail('A slug could not be derived from this name — enter one manually.', {
      slug: ['Required for names with no latin characters'],
    })
  }

  for (let suffix = 0; suffix < 50; suffix += 1) {
    const candidate = suffix === 0 ? base : `${base}-${suffix + 1}`
    if (!(await slugExists(candidate, exceptId))) return { ok: true, data: candidate }
  }

  return fail('Too many records share this name — enter a slug manually.', {
    slug: ['Could not derive a unique slug'],
  })
}

/* -------------------------------------------------------------------------- */
/* Specialized attribute rows                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The parsed attribute row, discriminated by table so each nested write below is
 * type-checked against the model it targets.
 */
type AttributeData = {
  [K in AttributeTable]: { table: K; data: z.output<(typeof ATTRIBUTE_SCHEMAS)[K]> }
}[AttributeTable]

/**
 * Fill in the one required label each specialized table carries.
 *
 * `members.stage_name`, `songs.title` and friends are non-null, and in practice
 * they hold the same string as the entity's canonical name. Defaulting them
 * means an operator types a name once. `teams.code` and `generations.number` are
 * deliberately absent here: they are real facts with no defensible default, so
 * validation asks for them.
 */
function withDerivedLabel(
  table: AttributeTable,
  raw: Record<string, unknown>,
  canonicalName: string,
): Record<string, unknown> {
  const labelField: Partial<Record<AttributeTable, string>> = {
    member: 'stageName',
    song: 'title',
    album: 'title',
    event: 'title',
    concert: 'title',
    setlist: 'stageName',
    mediaItem: 'title',
    organization: 'name',
  }

  const field = labelField[table]
  if (!field) return raw
  const existing = raw[field]
  if (typeof existing === 'string' && existing.trim().length > 0) return raw
  return { ...raw, [field]: canonicalName }
}

function parseAttributes(
  table: AttributeTable,
  raw: unknown,
  canonicalName: string,
): { ok: true; value: AttributeData } | { ok: false; error: z.ZodError } {
  const source = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const schema: z.ZodType = ATTRIBUTE_SCHEMAS[table]
  const parsed = schema.safeParse(withDerivedLabel(table, source, canonicalName))

  if (!parsed.success) return { ok: false, error: parsed.error }
  // The schema was selected by `table`, so its output is that table's row. TS
  // cannot correlate the two through the index, hence the single assertion.
  return { ok: true, value: { table, data: parsed.data } as AttributeData }
}

/** Nested create for a brand-new entity. */
function attributeCreate(parsed: AttributeData): Prisma.EntityCreateInput {
  switch (parsed.table) {
    case 'member':
      return { member: { create: parsed.data } } as Prisma.EntityCreateInput
    case 'generation':
      return { generation: { create: parsed.data } } as Prisma.EntityCreateInput
    case 'team':
      return { team: { create: parsed.data } } as Prisma.EntityCreateInput
    case 'song':
      return { song: { create: parsed.data } } as Prisma.EntityCreateInput
    case 'album':
      return { album: { create: parsed.data } } as Prisma.EntityCreateInput
    case 'event':
      return { event: { create: parsed.data } } as Prisma.EntityCreateInput
    case 'concert':
      return { concert: { create: parsed.data } } as Prisma.EntityCreateInput
    case 'setlist':
      return { setlist: { create: parsed.data } } as Prisma.EntityCreateInput
    case 'mediaItem':
      return { mediaItem: { create: parsed.data } } as Prisma.EntityCreateInput
    case 'organization':
      return { organization: { create: parsed.data } } as Prisma.EntityCreateInput
  }
}

/**
 * Nested upsert on edit.
 *
 * Upsert rather than update because the row may be missing: an entity whose type
 * was changed, or one imported before its specialized row existed. That gap is
 * exactly what the `MISSING_SPECIALIZED_ROW` health check reports, and saving the
 * record should close it rather than fail on it.
 */
function attributeUpsert(parsed: AttributeData): Prisma.EntityUpdateInput {
  switch (parsed.table) {
    case 'member':
      return { member: { upsert: { create: parsed.data, update: parsed.data } } }
    case 'generation':
      return { generation: { upsert: { create: parsed.data, update: parsed.data } } }
    case 'team':
      return { team: { upsert: { create: parsed.data, update: parsed.data } } }
    case 'song':
      return { song: { upsert: { create: parsed.data, update: parsed.data } } }
    case 'album':
      return { album: { upsert: { create: parsed.data, update: parsed.data } } }
    case 'event':
      return { event: { upsert: { create: parsed.data, update: parsed.data } } }
    case 'concert':
      return { concert: { upsert: { create: parsed.data, update: parsed.data } } }
    case 'setlist':
      return { setlist: { upsert: { create: parsed.data, update: parsed.data } } }
    case 'mediaItem':
      return { mediaItem: { upsert: { create: parsed.data, update: parsed.data } } }
    case 'organization':
      return { organization: { upsert: { create: parsed.data, update: parsed.data } } }
  }
}

/**
 * Drop attribute rows that no longer belong to the entity's type.
 *
 * Retyping a record from CONCERT to THEATER_PERFORMANCE moves it from `concerts`
 * to `events`. Leaving the old row behind would give the entity two competing
 * sets of attributes, and detail pages read whichever they were written to
 * expect.
 */
function staleAttributeDeletes(
  existing: EntityWithAttributes,
  keep: AttributeTable | null,
): Prisma.EntityUpdateInput {
  const update: Prisma.EntityUpdateInput = {}

  if (existing.member && keep !== 'member') update.member = { delete: true }
  if (existing.generation && keep !== 'generation') update.generation = { delete: true }
  if (existing.team && keep !== 'team') update.team = { delete: true }
  if (existing.song && keep !== 'song') update.song = { delete: true }
  if (existing.album && keep !== 'album') update.album = { delete: true }
  if (existing.event && keep !== 'event') update.event = { delete: true }
  if (existing.concert && keep !== 'concert') update.concert = { delete: true }
  if (existing.setlist && keep !== 'setlist') update.setlist = { delete: true }
  if (existing.mediaItem && keep !== 'mediaItem') update.mediaItem = { delete: true }
  if (existing.organization && keep !== 'organization') update.organization = { delete: true }

  return update
}

/* -------------------------------------------------------------------------- */
/* Audit snapshots                                                            */
/* -------------------------------------------------------------------------- */

/**
 * What the audit log stores for an entity.
 *
 * A flat record of readable values, not the Prisma row: the diff view renders
 * `before`/`after` field by field, so nested objects and relation arrays would
 * read as noise. Attributes are flattened with a prefix so `member.status`
 * appears as its own line in the history panel.
 */
function snapshotEntity(row: EntityWithAttributes): Record<string, unknown> {
  const snapshot: Record<string, unknown> = {
    entityType: row.entityType,
    canonicalName: row.canonicalName,
    slug: row.slug,
    aliases: row.aliases,
    summary: row.summary,
    description: row.description,
    imageUrl: row.imageUrl,
    activeFrom: toISODate(row.activeFrom) ?? null,
    activeTo: toISODate(row.activeTo) ?? null,
    prominence: row.prominence,
    isPublished: row.isPublished,
    provenance: row.provenance?.name ?? null,
    notes: row.notes,
  }

  const tables: [AttributeTable, Record<string, unknown> | null][] = [
    ['member', row.member],
    ['generation', row.generation],
    ['team', row.team],
    ['song', row.song],
    ['album', row.album],
    ['event', row.event],
    ['concert', row.concert],
    ['setlist', row.setlist],
    ['mediaItem', row.mediaItem],
    ['organization', row.organization],
  ]

  for (const [table, attributes] of tables) {
    if (!attributes) continue
    for (const [field, value] of Object.entries(attributes)) {
      if (field === 'entityId') continue
      snapshot[`${table}.${field}`] = value instanceof Date ? (toISODate(value) ?? null) : value
    }
  }

  return snapshot
}

function snapshotRelationship(row: EdgeRow): Record<string, unknown> {
  return {
    source: row.source.canonicalName,
    relationshipType: row.relationshipType.code,
    target: row.target.canonicalName,
    validFrom: toISODate(row.validFrom) ?? null,
    validTo: toISODate(row.validTo) ?? null,
    weight: row.weight,
    provenance: row.provenance?.name ?? null,
    notes: row.notes,
  }
}

function describeEdge(row: EdgeRow): string {
  return `${row.source.canonicalName} → ${row.relationshipType.name} → ${row.target.canonicalName}`
}

/* -------------------------------------------------------------------------- */
/* Entities                                                                   */
/* -------------------------------------------------------------------------- */

export type SavedEntity = { id: string; slug: string; canonicalName: string }

export async function createEntity(
  input: unknown,
  actor: Actor,
): Promise<AdminResult<SavedEntity>> {
  const parsed = entityInputSchema.safeParse(input)
  if (!parsed.success) return failFromZod(parsed.error)
  const values = parsed.data

  const slug = await resolveSlug(values.slug, values.canonicalName)
  if (!slug.ok) return slug

  const table = attributeTableFor(values.entityType)
  let attributes: AttributeData | null = null
  if (table) {
    const result = parseAttributes(table, values.attributes, values.canonicalName)
    if (!result.ok) return failFromZod(result.error, 'attributes')
    attributes = result.value
  }

  const data: Prisma.EntityCreateInput = {
    entityType: values.entityType,
    category: categoryForEntityType(values.entityType),
    canonicalName: values.canonicalName,
    slug: slug.data,
    aliases: values.aliases,
    summary: values.summary,
    description: values.description,
    imageUrl: values.imageUrl,
    activeFrom: values.activeFrom,
    activeTo: values.activeTo,
    prominence: values.prominence,
    isPublished: values.isPublished,
    notes: values.notes,
    ...(values.provenanceId ? { provenance: { connect: { id: values.provenanceId } } } : {}),
    ...(attributes ? attributeCreate(attributes) : {}),
  }

  let created: EntityWithAttributes
  try {
    created = await insertEntity(data)
  } catch (error) {
    const targets = uniqueViolationTargets(error)
    if (!targets) throw error
    return fail('That record conflicts with an existing one.', {
      [targets[0] ?? '_form']: ['Already used by another record'],
    })
  }

  await recordChange({
    actor,
    action: AuditAction.CREATE,
    entityType: 'Entity',
    entityId: created.id,
    summary: `Created ${values.entityType} “${created.canonicalName}”`,
    after: snapshotEntity(created),
  })

  return { ok: true, data: { id: created.id, slug: created.slug, canonicalName: created.canonicalName } }
}

export async function updateEntity(
  id: string,
  input: unknown,
  actor: Actor,
): Promise<AdminResult<SavedEntity>> {
  const existing = await findEntityById(id, true)
  if (!existing) return fail('That record no longer exists.')

  const parsed = entityInputSchema.safeParse(input)
  if (!parsed.success) return failFromZod(parsed.error)
  const values = parsed.data

  const slug = await resolveSlug(values.slug, values.canonicalName, id)
  if (!slug.ok) return slug

  const table = attributeTableFor(values.entityType)
  let attributes: AttributeData | null = null
  if (table) {
    const result = parseAttributes(table, values.attributes, values.canonicalName)
    if (!result.ok) return failFromZod(result.error, 'attributes')
    attributes = result.value
  }

  const data: Prisma.EntityUpdateInput = {
    entityType: values.entityType,
    category: categoryForEntityType(values.entityType),
    canonicalName: values.canonicalName,
    slug: slug.data,
    aliases: values.aliases,
    summary: values.summary,
    description: values.description,
    imageUrl: values.imageUrl,
    activeFrom: values.activeFrom,
    activeTo: values.activeTo,
    prominence: values.prominence,
    isPublished: values.isPublished,
    notes: values.notes,
    provenance: values.provenanceId
      ? { connect: { id: values.provenanceId } }
      : { disconnect: true },
    ...staleAttributeDeletes(existing, table),
    ...(attributes ? attributeUpsert(attributes) : {}),
  }

  let updated: EntityWithAttributes
  try {
    updated = await writeEntity(id, data)
  } catch (error) {
    const targets = uniqueViolationTargets(error)
    if (!targets) throw error
    return fail('That record conflicts with an existing one.', {
      [targets[0] ?? '_form']: ['Already used by another record'],
    })
  }

  await recordChange({
    actor,
    action: AuditAction.UPDATE,
    entityType: 'Entity',
    entityId: id,
    summary: `Updated ${updated.entityType} “${updated.canonicalName}”`,
    before: snapshotEntity(existing),
    after: snapshotEntity(updated),
  })

  return { ok: true, data: { id, slug: updated.slug, canonicalName: updated.canonicalName } }
}

/**
 * Publish or unpublish without opening the full form.
 *
 * Unpublishing is the archive's soft delete: the record and its edges survive,
 * public queries stop returning it, and the game engine stops drawing questions
 * from it. Prefer it to `deleteEntity` for anything that once existed.
 */
export async function setEntityPublished(
  id: string,
  isPublished: boolean,
  actor: Actor,
): Promise<AdminResult<SavedEntity>> {
  const existing = await findEntityById(id, true)
  if (!existing) return fail('That record no longer exists.')
  if (existing.isPublished === isPublished) {
    return { ok: true, data: { id, slug: existing.slug, canonicalName: existing.canonicalName } }
  }

  const updated = await writeEntity(id, { isPublished })

  await recordChange({
    actor,
    action: AuditAction.UPDATE,
    entityType: 'Entity',
    entityId: id,
    summary: `${isPublished ? 'Published' : 'Unpublished'} “${existing.canonicalName}”`,
    before: { isPublished: existing.isPublished },
    after: { isPublished: updated.isPublished },
  })

  return { ok: true, data: { id, slug: updated.slug, canonicalName: updated.canonicalName } }
}

/**
 * Hard delete.
 *
 * Both relationship endpoints cascade, so deleting an entity deletes every fact
 * recorded about it. The caller must pass the edge count it showed the operator;
 * if the graph changed since, the delete is refused rather than performed against
 * a number nobody agreed to. `expectedEdgeCount` is how a confirmation dialog
 * stays honest.
 */
export async function deleteEntity(
  id: string,
  actor: Actor,
  expectedEdgeCount?: number,
): Promise<AdminResult<{ id: string; deletedEdges: number }>> {
  const existing = await findEntityById(id, true)
  if (!existing) return fail('That record no longer exists.')

  const edgeCount = await countEdgesTouching(id)
  if (expectedEdgeCount !== undefined && expectedEdgeCount !== edgeCount) {
    return fail(
      `This record now has ${edgeCount} relationship${edgeCount === 1 ? '' : 's'}, not ${expectedEdgeCount}. Review them before deleting.`,
    )
  }

  await removeEntity(id)

  await recordChange({
    actor,
    action: AuditAction.DELETE,
    entityType: 'Entity',
    entityId: id,
    summary: `Deleted ${existing.entityType} “${existing.canonicalName}” and ${edgeCount} relationship${edgeCount === 1 ? '' : 's'}`,
    before: snapshotEntity(existing),
  })

  return { ok: true, data: { id, deletedEdges: edgeCount } }
}

/* -------------------------------------------------------------------------- */
/* Relationships                                                              */
/* -------------------------------------------------------------------------- */

/**
 * Check an edge against its type's rules.
 *
 * `allowedSourceTypes` / `allowedTargetTypes` are the guardrails that keep the
 * graph meaningful — nothing else stops a curator recording "Song CENTER_OF
 * Member" by picking the wrong autocomplete row. An empty list means the type
 * accepts anything, which is how a new type behaves until someone constrains it.
 */
async function validateEdge(
  values: { sourceEntityId: string; relationshipTypeId: string; targetEntityId: string; validFrom: Date | null; validTo: Date | null },
  requireActiveType: boolean,
): Promise<AdminResult<{ typeName: string }>> {
  const [type, source, target] = await Promise.all([
    findRelationshipTypeById(values.relationshipTypeId),
    findEntityById(values.sourceEntityId, true),
    findEntityById(values.targetEntityId, true),
  ])

  if (!type) {
    return fail('Choose a relationship type.', { relationshipTypeId: ['Unknown relationship type'] })
  }
  if (requireActiveType && !type.isActive) {
    return fail(`${type.name} is retired and cannot be used for new relationships.`, {
      relationshipTypeId: ['This type is no longer active'],
    })
  }
  if (!source) return fail('The source record no longer exists.', { sourceEntityId: ['Not found'] })
  if (!target) return fail('The target record no longer exists.', { targetEntityId: ['Not found'] })

  if (type.allowedSourceTypes.length > 0 && !type.allowedSourceTypes.includes(source.entityType)) {
    return fail(`${type.name} cannot start from a ${source.entityType} record.`, {
      sourceEntityId: [`Allowed: ${type.allowedSourceTypes.join(', ')}`],
    })
  }
  if (type.allowedTargetTypes.length > 0 && !type.allowedTargetTypes.includes(target.entityType)) {
    return fail(`${type.name} cannot point at a ${target.entityType} record.`, {
      targetEntityId: [`Allowed: ${type.allowedTargetTypes.join(', ')}`],
    })
  }

  // A non-temporal type has no validity window; accepting dates for one would
  // put facts in the database that no query reads and Time Machine ignores.
  if (!type.isTemporal && (values.validFrom || values.validTo)) {
    return fail(`${type.name} is not a dated relationship.`, {
      validFrom: ['This relationship type does not carry dates'],
    })
  }

  return { ok: true, data: { typeName: type.name } }
}

export type SavedRelationship = { id: string; description: string }

export async function createRelationship(
  input: unknown,
  actor: Actor,
): Promise<AdminResult<SavedRelationship>> {
  const parsed = relationshipInputSchema.safeParse(input)
  if (!parsed.success) return failFromZod(parsed.error)
  const values = parsed.data

  const checked = await validateEdge(values, true)
  if (!checked.ok) return checked

  let created: EdgeRow
  try {
    created = await insertRelationship({
      source: { connect: { id: values.sourceEntityId } },
      relationshipType: { connect: { id: values.relationshipTypeId } },
      target: { connect: { id: values.targetEntityId } },
      validFrom: values.validFrom,
      validTo: values.validTo,
      weight: values.weight,
      notes: values.notes,
      ...(values.provenanceId ? { provenance: { connect: { id: values.provenanceId } } } : {}),
    })
  } catch (error) {
    if (!uniqueViolationTargets(error)) throw error
    // The identity is (source, type, target, validFrom) — the same fact recorded
    // twice, not two different facts.
    return fail('That relationship is already recorded with the same start date.', {
      validFrom: ['Duplicate of an existing relationship'],
    })
  }

  await recordChange({
    actor,
    action: AuditAction.CREATE,
    entityType: 'Relationship',
    entityId: created.id,
    summary: `Linked ${describeEdge(created)}`,
    after: snapshotRelationship(created),
  })

  return { ok: true, data: { id: created.id, description: describeEdge(created) } }
}

export async function updateRelationship(
  id: string,
  input: unknown,
  actor: Actor,
): Promise<AdminResult<SavedRelationship>> {
  const existing = await findRelationshipById(id)
  if (!existing) return fail('That relationship no longer exists.')

  const parsed = relationshipInputSchema.safeParse(input)
  if (!parsed.success) return failFromZod(parsed.error)
  const values = parsed.data

  // An existing edge may keep a retired type: retiring a type is a curation
  // decision about new data, not a reason to block fixing a date on old data.
  const checked = await validateEdge(values, existing.relationshipTypeId !== values.relationshipTypeId)
  if (!checked.ok) return checked

  let updated: EdgeRow
  try {
    updated = await writeRelationship(id, {
      source: { connect: { id: values.sourceEntityId } },
      relationshipType: { connect: { id: values.relationshipTypeId } },
      target: { connect: { id: values.targetEntityId } },
      validFrom: values.validFrom,
      validTo: values.validTo,
      weight: values.weight,
      notes: values.notes,
      provenance: values.provenanceId
        ? { connect: { id: values.provenanceId } }
        : { disconnect: true },
    })
  } catch (error) {
    if (!uniqueViolationTargets(error)) throw error
    return fail('That relationship is already recorded with the same start date.', {
      validFrom: ['Duplicate of an existing relationship'],
    })
  }

  await recordChange({
    actor,
    action: AuditAction.UPDATE,
    entityType: 'Relationship',
    entityId: id,
    summary: `Updated ${describeEdge(updated)}`,
    before: snapshotRelationship(existing),
    after: snapshotRelationship(updated),
  })

  return { ok: true, data: { id, description: describeEdge(updated) } }
}

export async function deleteRelationship(
  id: string,
  actor: Actor,
): Promise<AdminResult<{ id: string }>> {
  const existing = await findRelationshipById(id)
  if (!existing) return fail('That relationship no longer exists.')

  await removeRelationship(id)

  await recordChange({
    actor,
    action: AuditAction.DELETE,
    entityType: 'Relationship',
    entityId: id,
    summary: `Removed ${describeEdge(existing)}`,
    before: snapshotRelationship(existing),
  })

  return { ok: true, data: { id } }
}

/**
 * Close an open-ended relationship on a date.
 *
 * The single most common curation edit in an idol archive: a member graduates, a
 * team disbands, a transfer happens. Doing it as its own action means the history
 * is amended by adding an end date, never by deleting the edge — the fact that
 * she *was* in Team J stays true for every earlier date the Time Machine visits.
 */
export async function closeRelationship(
  id: string,
  endDate: unknown,
  actor: Actor,
): Promise<AdminResult<SavedRelationship>> {
  const existing = await findRelationshipById(id)
  if (!existing) return fail('That relationship no longer exists.')

  const parsed = dateOnlySchema.safeParse(endDate)
  if (!parsed.success) return failFromZod(parsed.error)

  const validTo = parsed.data
  if (!validTo) return fail('Enter the date this relationship ended.', { validTo: ['Required'] })
  if (existing.validFrom && validTo < existing.validFrom) {
    return fail('The end date cannot be earlier than the start date.', {
      validTo: ['Earlier than the start date'],
    })
  }

  const updated = await writeRelationship(id, { validTo })

  await recordChange({
    actor,
    action: AuditAction.UPDATE,
    entityType: 'Relationship',
    entityId: id,
    summary: `Closed ${describeEdge(updated)}`,
    before: { validTo: toISODate(existing.validTo) ?? null },
    after: { validTo: toISODate(updated.validTo) ?? null },
  })

  return { ok: true, data: { id, description: describeEdge(updated) } }
}
