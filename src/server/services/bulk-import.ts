import { attributeFieldsFor } from '@/domain/attribute-fields'
import { parseImport } from '@/domain/bulk-import'
import { attributeTableFor, entityTypeLabel } from '@/domain/entity-taxonomy'
import { dateOnlySchema, relationshipInputSchema, toFieldErrors } from '@/domain/validation'
import { AuditAction, EntityType } from '@/generated/prisma/enums'
import { toISODate } from '@/lib/date'
import { slugify } from '@/lib/utils'

import {
  findEntitiesBySlugs,
  findEntityRefsByIds,
  findEntityRefsBySlugs,
} from '../repositories/entity-repository'
import { findEdgesBySourceAndType } from '../repositories/relationship-repository'
import { relationshipTypeMapByCode } from '../repositories/relationship-type-repository'
import { listSources } from '../repositories/source-repository'
import { recordChange } from './audit'
import { rawAttributeValues } from './entity-mapper'
import {
  checkEdgeCompatibility,
  checkEntityInput,
  createEntity,
  createRelationship,
  updateEntity,
  updateRelationship,
} from './entity-admin'

import type {
  ConflictPolicy,
  ImportFormat,
  ImportMode,
  ParsedEntityRow,
  ParsedRelationshipRow,
} from '@/domain/bulk-import'
import type { FieldErrors } from '@/domain/validation'
import type { EntityWithAttributes } from '../repositories/entity-repository'
import type { Actor } from './audit'

/**
 * Bulk import (PRD §14 "bulk/detail workflows", §26 V1.1).
 *
 * Two entry points over one implementation: `previewBulkImport` plans a batch and
 * writes nothing, `commitBulkImport` plans it again and applies it. They are the
 * same code path with a flag, which is the only way a preview stays trustworthy —
 * a dry run that diverged from the write would give an operator confidence in a
 * result they are not about to get.
 *
 * Every row that reaches the database goes through `createEntity`, `updateEntity`,
 * `createRelationship` or `updateRelationship` — one row at a time, through the
 * same audited services the single-record editors use. That is slower than a bulk
 * `createMany` and it is the point: those services own slug resolution, the
 * relationship guardrails and the audit entry, so an imported record is
 * indistinguishable from a hand-curated one and every row still has its own line
 * in its own history panel (PRD §17). A `createMany` would bypass all three.
 *
 * What follows from that is the transaction story, which is worth being explicit
 * about: there is no single transaction around the batch. The default is
 * therefore to refuse the whole commit unless every row validates, so the
 * all-or-nothing case needs no rollback. An operator who would rather take the
 * good rows and fix the rest opts into that deliberately, and gets told exactly
 * which lines were left behind.
 */

/* -------------------------------------------------------------------------- */
/* Report                                                                     */
/* -------------------------------------------------------------------------- */

export type RowOutcome = 'created' | 'updated' | 'skipped' | 'failed' | 'deferred'

export const ROW_OUTCOME_LABELS: Record<RowOutcome, string> = {
  created: 'Create',
  updated: 'Update',
  skipped: 'Skip',
  failed: 'Error',
  deferred: 'Deferred',
}

export type BulkImportRow = {
  /** Source line for a sheet, item index for JSON. */
  line: number
  kind: 'record' | 'relationship'
  label: string
  detail: string | null
  outcome: RowOutcome
  message: string | null
  /** Field-level messages, already flattened to one line each. */
  errors: string[]
  /** Admin editor link, once the row has an id to point at. */
  href: string | null
}

export type BulkImportReport = {
  mode: ImportMode
  format: ImportFormat
  conflictPolicy: ConflictPolicy
  /** False for a preview, and for a commit that was refused before it wrote. */
  committed: boolean
  counts: Record<RowOutcome, number>
  rows: BulkImportRow[]
  /** Header cells the importer could not place, so a typo is visible. */
  ignoredColumns: string[]
}

export type BulkImportResult =
  | { ok: true; report: BulkImportReport }
  | { ok: false; message: string }

export type BulkImportRequest = {
  text: string
  format: ImportFormat
  mode: ImportMode
  /** The type a row without its own `entityType` column is assumed to be. */
  entityType: EntityType
  conflictPolicy: ConflictPolicy
  /** Apply the valid rows even though some rows failed. */
  allowPartial: boolean
}

function emptyCounts(): Record<RowOutcome, number> {
  return { created: 0, updated: 0, skipped: 0, failed: 0, deferred: 0 }
}

/* -------------------------------------------------------------------------- */
/* Small resolvers                                                            */
/* -------------------------------------------------------------------------- */

const ENTITY_TYPES = Object.values(EntityType) as string[]

/** `Member`, `member` and `media item` all name a type; anything else does not. */
function toEntityType(raw: unknown): EntityType | null {
  if (typeof raw !== 'string') return null
  const key = raw.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_')
  return ENTITY_TYPES.includes(key) ? (key as EntityType) : null
}

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

/** The slug a reference names — itself if it already is one, else slugified. */
function refToSlug(ref: string): string {
  const trimmed = ref.trim().toLowerCase()
  return SLUG_PATTERN.test(trimmed) ? trimmed : slugify(ref)
}

function flattenFieldErrors(fieldErrors: FieldErrors): string[] {
  const lines: string[] = []
  for (const [field, messages] of Object.entries(fieldErrors)) {
    for (const message of messages) {
      lines.push(field === '_form' ? message : `${field}: ${message}`)
    }
  }
  return lines
}

/**
 * A date cell that was filled in but does not parse.
 *
 * `dateOnlySchema` turns anything unreadable into null on purpose — a half-typed
 * date in a form should not discard the rest of the edit. That leniency is wrong
 * here: silently importing `31/02/2020` as "no date" would lose a fact the
 * operator believes they recorded, across as many rows as the sheet has.
 */
function dateCellError(label: string, raw: unknown): string | null {
  if (raw === undefined || raw === null || raw === '') return null
  const parsed = dateOnlySchema.safeParse(raw)
  if (parsed.success && parsed.data !== null) return null
  return `${label}: “${String(raw)}” is not a date the archive can read — use YYYY-MM-DD`
}

function entityDateErrors(row: ParsedEntityRow, entityType: EntityType): string[] {
  const errors: string[] = []

  for (const key of ['activeFrom', 'activeTo'] as const) {
    const error = dateCellError(key, row.base[key])
    if (error) errors.push(error)
  }

  const table = attributeTableFor(entityType)
  if (table) {
    for (const field of attributeFieldsFor(table)) {
      if (field.kind !== 'date') continue
      const error = dateCellError(field.name, row.attributes[field.name])
      if (error) errors.push(error)
    }
  }

  return errors
}

type SourceIndex = { byId: Map<string, string>; byName: Map<string, string> }

async function buildSourceIndex(): Promise<SourceIndex> {
  const rows = await listSources()
  const byId = new Map<string, string>()
  const byName = new Map<string, string>()

  for (const row of rows) {
    byId.set(row.id, row.id)
    const key = row.name.trim().toLowerCase()
    if (!byName.has(key)) byName.set(key, row.id)
  }

  return { byId, byName }
}

/**
 * Provenance is resolved, never invented.
 *
 * An unrecognised citation fails its row rather than importing the record with
 * the citation dropped: provenance is the archive's claim to being trustworthy
 * (PRD §12), and a quietly unsourced row is exactly the kind of debt the data
 * health checks then have to find again later.
 */
function resolveProvenance(
  ref: string | null,
  index: SourceIndex,
): { id: string | null; error: string | null } {
  if (!ref) return { id: null, error: null }

  const byId = index.byId.get(ref)
  if (byId) return { id: byId, error: null }

  const byName = index.byName.get(ref.trim().toLowerCase())
  if (byName) return { id: byName, error: null }

  return {
    id: null,
    error: `provenance: no source named “${ref}”. Register it under Sources first, or clear the column.`,
  }
}

/* -------------------------------------------------------------------------- */
/* Planning records                                                           */
/* -------------------------------------------------------------------------- */

type EntityAction =
  | { kind: 'create'; input: Record<string, unknown> }
  | { kind: 'update'; id: string; input: Record<string, unknown> }
  | { kind: 'skip'; message: string }
  | { kind: 'fail'; message: string; errors: string[] }

type PlannedEntity = {
  line: number
  label: string
  detail: string
  slug: string | null
  entityType: EntityType | null
  action: EntityAction
}

/** A record's identity for import is its slug — explicit, or derived from the name. */
function identitySlug(row: ParsedEntityRow): string {
  const explicit = typeof row.base.slug === 'string' ? row.base.slug.trim().toLowerCase() : ''
  if (explicit.length > 0) return explicit
  const name = typeof row.base.canonicalName === 'string' ? row.base.canonicalName.trim() : ''
  return name.length > 0 ? slugify(name) : ''
}

function createInput(
  row: ParsedEntityRow,
  entityType: EntityType,
  slug: string,
  provenanceId: string | null,
): Record<string, unknown> {
  return {
    ...row.base,
    entityType,
    // The slug is always explicit on import. `createEntity` would otherwise
    // suffix a derived collision into `shani-indira-natio-2`, which is right for
    // a curator typing a new record and wrong here: a re-run of the same sheet
    // must land on the same rows, not accumulate near-duplicates.
    slug,
    // A sheet with no Published column means "bring these in", not "file fifty
    // drafts" — but the shared boolean coercion reads a missing key as false, so
    // the intent has to be stated here rather than inherited.
    isPublished: 'isPublished' in row.base ? row.base.isPublished : true,
    provenanceId,
    attributes: row.attributes,
  }
}

/**
 * An update writes the stored record back with only the provided cells changed.
 *
 * The alternative — sending the sheet's columns alone — would blank every field
 * the operator left out, because the base schema turns a missing optional into
 * null. A curator fixing forty birth dates would silently erase forty summaries.
 */
function updateInput(
  existing: EntityWithAttributes,
  row: ParsedEntityRow,
  slug: string,
  provenanceId: string | null,
): Record<string, unknown> {
  const provided = { ...row.base }
  // The type is matched, never migrated: moving a record between specialized
  // tables is a decision for the record editor, not a side effect of a column.
  delete provided.entityType

  return {
    entityType: existing.entityType,
    canonicalName: existing.canonicalName,
    aliases: existing.aliases,
    summary: existing.summary,
    description: existing.description,
    imageUrl: existing.imageUrl,
    activeFrom: existing.activeFrom,
    activeTo: existing.activeTo,
    prominence: existing.prominence,
    isPublished: existing.isPublished,
    notes: existing.notes,
    ...provided,
    slug,
    provenanceId: row.provenanceRef ? provenanceId : existing.provenanceId,
    attributes: { ...rawAttributeValues(existing), ...row.attributes },
  }
}

async function planEntities(
  rows: ParsedEntityRow[],
  request: BulkImportRequest,
  sources: SourceIndex,
): Promise<PlannedEntity[]> {
  if (rows.length === 0) return []

  const slugs = rows.map(identitySlug).filter((slug) => slug.length > 0)
  const existingRefs = await findEntityRefsBySlugs(slugs)
  const existingBySlug = new Map(existingRefs.map((ref) => [ref.slug, ref]))

  // Only an update run needs the stored columns, and only for the rows that
  // actually matched something.
  const stored = new Map<string, EntityWithAttributes>()
  if (request.conflictPolicy === 'update' && existingRefs.length > 0) {
    const full = await findEntitiesBySlugs(existingRefs.map((ref) => ref.slug))
    for (const entity of full) stored.set(entity.slug, entity)
  }

  const planned: PlannedEntity[] = []
  const claimed = new Set<string>()

  for (const row of rows) {
    const typeCell = row.base.entityType
    const entityType = typeCell === undefined ? request.entityType : toEntityType(typeCell)
    const slug = identitySlug(row)
    const name = typeof row.base.canonicalName === 'string' ? row.base.canonicalName.trim() : ''
    const label = name.length > 0 ? name : slug.length > 0 ? slug : `Line ${row.line}`
    const typeLabel = entityType ? entityTypeLabel(entityType) : 'Unknown type'
    const detail = slug.length > 0 ? `${typeLabel} · ${slug}` : typeLabel

    const base = { line: row.line, label, detail, slug: slug.length > 0 ? slug : null, entityType }
    const errors: string[] = []

    if (!entityType) {
      errors.push(`entityType: “${String(typeCell)}” is not one of the archive's record types`)
    }
    if (slug.length === 0) {
      errors.push('canonicalName: required — a row needs a name, or a slug to match on')
    }

    const provenance = resolveProvenance(row.provenanceRef, sources)
    if (provenance.error) errors.push(provenance.error)
    if (entityType) errors.push(...entityDateErrors(row, entityType))

    if (errors.length > 0 || !entityType || slug.length === 0) {
      planned.push({ ...base, action: { kind: 'fail', message: 'This row cannot be imported.', errors } })
      continue
    }

    if (claimed.has(slug)) {
      planned.push({
        ...base,
        action: {
          kind: 'fail',
          message: `Another row in this batch already claims “${slug}”. Two rows for one record is a data-entry slip rather than a conflict to resolve, so neither is guessed at.`,
          errors: [],
        },
      })
      continue
    }
    claimed.add(slug)

    const existing = existingBySlug.get(slug)

    if (!existing) {
      const input = createInput(row, entityType, slug, provenance.id)
      const checked = checkEntityInput(input)
      planned.push({
        ...base,
        action: checked.ok
          ? { kind: 'create', input }
          : { kind: 'fail', message: checked.message, errors: flattenFieldErrors(checked.fieldErrors) },
      })
      continue
    }

    if (request.conflictPolicy === 'fail') {
      planned.push({
        ...base,
        action: {
          kind: 'fail',
          message: `“${slug}” already belongs to “${existing.canonicalName}”.`,
          errors: [],
        },
      })
      continue
    }

    if (request.conflictPolicy === 'skip') {
      planned.push({
        ...base,
        action: { kind: 'skip', message: `Already recorded as “${existing.canonicalName}”.` },
      })
      continue
    }

    if (existing.entityType !== entityType) {
      planned.push({
        ...base,
        action: {
          kind: 'fail',
          message: `“${slug}” is an existing ${entityTypeLabel(existing.entityType)} record, and this row calls it a ${entityTypeLabel(entityType)}. Changing a record's type is a job for the record editor.`,
          errors: [],
        },
      })
      continue
    }

    const full = stored.get(slug)
    if (!full) {
      planned.push({
        ...base,
        action: { kind: 'fail', message: 'Could not re-read that record to merge into.', errors: [] },
      })
      continue
    }

    const input = updateInput(full, row, slug, provenance.id)
    const checked = checkEntityInput(input)
    planned.push({
      ...base,
      action: checked.ok
        ? { kind: 'update', id: full.id, input }
        : { kind: 'fail', message: checked.message, errors: flattenFieldErrors(checked.fieldErrors) },
    })
  }

  return planned
}

/* -------------------------------------------------------------------------- */
/* Planning relationships                                                     */
/* -------------------------------------------------------------------------- */

type RelationshipAction =
  | { kind: 'create'; input: Record<string, unknown> }
  | { kind: 'update'; id: string; input: Record<string, unknown> }
  | { kind: 'skip'; message: string }
  | { kind: 'defer'; message: string }
  | { kind: 'fail'; message: string; errors: string[] }

type PlannedRelationship = {
  line: number
  label: string
  detail: string | null
  action: RelationshipAction
}

type Endpoint =
  | { kind: 'found'; id: string; entityType: EntityType; canonicalName: string }
  | { kind: 'pending'; entityType: EntityType; canonicalName: string }
  | { kind: 'missing' }

/** A record this same batch is about to create, so an edge may reference it. */
export type PendingEntity = { entityType: EntityType; canonicalName: string; id: string | null }

function identityKey(
  sourceEntityId: string,
  relationshipTypeId: string,
  targetEntityId: string,
  validFrom: Date | null,
): string {
  return [sourceEntityId, relationshipTypeId, targetEntityId, toISODate(validFrom) ?? ''].join('|')
}

async function planRelationships(
  rows: ParsedRelationshipRow[],
  request: BulkImportRequest,
  sources: SourceIndex,
  pending: Map<string, PendingEntity>,
): Promise<PlannedRelationship[]> {
  if (rows.length === 0) return []

  // Inactive types are fetched too, so a retired code gets "retired" rather than
  // "unknown" — the operator's next move is different in each case.
  const types = await relationshipTypeMapByCode(true)

  const refs = new Set<string>()
  for (const row of rows) {
    if (row.sourceRef) refs.add(row.sourceRef)
    if (row.targetRef) refs.add(row.targetRef)
  }

  const refList = [...refs]
  const [bySlugRows, byIdRows] = await Promise.all([
    findEntityRefsBySlugs(refList.map(refToSlug)),
    findEntityRefsByIds(refList),
  ])
  const bySlug = new Map(bySlugRows.map((ref) => [ref.slug, ref]))
  const byId = new Map(byIdRows.map((ref) => [ref.id, ref]))

  const resolve = (ref: string): Endpoint => {
    const trimmed = ref.trim()
    if (trimmed.length === 0) return { kind: 'missing' }

    const direct = byId.get(trimmed)
    if (direct) {
      return { kind: 'found', id: direct.id, entityType: direct.entityType, canonicalName: direct.canonicalName }
    }

    const slug = refToSlug(trimmed)
    const found = bySlug.get(slug)
    if (found) {
      return { kind: 'found', id: found.id, entityType: found.entityType, canonicalName: found.canonicalName }
    }

    const upcoming = pending.get(slug)
    if (upcoming) {
      return upcoming.id
        ? { kind: 'found', id: upcoming.id, entityType: upcoming.entityType, canonicalName: upcoming.canonicalName }
        : { kind: 'pending', entityType: upcoming.entityType, canonicalName: upcoming.canonicalName }
    }

    return { kind: 'missing' }
  }

  // One pass over the edges that could collide, rather than a lookup per row.
  const sourceIds: string[] = []
  const typeIds: string[] = []
  for (const row of rows) {
    const source = resolve(row.sourceRef)
    if (source.kind === 'found') sourceIds.push(source.id)
    const type = types.get(row.typeCode)
    if (type) typeIds.push(type.id)
  }

  const existingEdges = await findEdgesBySourceAndType(sourceIds, typeIds)
  const edgeByIdentity = new Map(
    existingEdges.map((edge) => [
      identityKey(edge.sourceEntityId, edge.relationshipTypeId, edge.targetEntityId, edge.validFrom),
      edge,
    ]),
  )

  const planned: PlannedRelationship[] = []
  const claimed = new Set<string>()

  for (const row of rows) {
    const label = `${row.sourceRef || '—'} → ${row.typeCode || '—'} → ${row.targetRef || '—'}`
    const type = types.get(row.typeCode)

    const errors: string[] = []
    if (!row.sourceRef) errors.push('sourceRef: required')
    if (!row.targetRef) errors.push('targetRef: required')
    if (!row.typeCode) errors.push('typeCode: required')

    const provenance = resolveProvenance(row.provenanceRef, sources)
    if (provenance.error) errors.push(provenance.error)

    for (const key of ['validFrom', 'validTo'] as const) {
      const error = dateCellError(key, row.fields[key])
      if (error) errors.push(error)
    }

    if (row.typeCode && !type) {
      errors.push(
        `typeCode: no relationship type “${row.typeCode}”. Add it to the vocabulary under Relationships first.`,
      )
    }

    const source = row.sourceRef ? resolve(row.sourceRef) : ({ kind: 'missing' } as Endpoint)
    const target = row.targetRef ? resolve(row.targetRef) : ({ kind: 'missing' } as Endpoint)

    if (row.sourceRef && source.kind === 'missing') {
      errors.push(`sourceRef: no record matches “${row.sourceRef}”`)
    }
    if (row.targetRef && target.kind === 'missing') {
      errors.push(`targetRef: no record matches “${row.targetRef}”`)
    }

    if (errors.length > 0 || !type) {
      planned.push({
        line: row.line,
        label,
        detail: null,
        action: { kind: 'fail', message: 'This relationship cannot be imported.', errors },
      })
      continue
    }

    if (source.kind === 'pending' || target.kind === 'pending') {
      planned.push({
        line: row.line,
        label,
        detail: type.name,
        action: {
          kind: 'defer',
          message:
            'References a record this batch creates first, so it is checked in full when you commit.',
        },
      })
      continue
    }

    if (source.kind === 'missing' || target.kind === 'missing') {
      planned.push({
        line: row.line,
        label,
        detail: type.name,
        action: { kind: 'fail', message: 'Both endpoints must exist.', errors: [] },
      })
      continue
    }

    const raw = {
      sourceEntityId: source.id,
      relationshipTypeId: type.id,
      targetEntityId: target.id,
      validFrom: row.fields.validFrom,
      validTo: row.fields.validTo,
      weight: row.fields.weight,
      provenanceId: provenance.id,
      notes: row.fields.notes,
    }

    const parsed = relationshipInputSchema.safeParse(raw)
    if (!parsed.success) {
      planned.push({
        line: row.line,
        label,
        detail: type.name,
        action: {
          kind: 'fail',
          message: 'This relationship cannot be imported.',
          errors: flattenFieldErrors(toFieldErrors(parsed.error)),
        },
      })
      continue
    }

    const values = parsed.data
    const key = identityKey(source.id, type.id, target.id, values.validFrom)
    const dateRange = values.validFrom
      ? `${toISODate(values.validFrom)} → ${toISODate(values.validTo) ?? 'current'}`
      : null
    const detail = dateRange ? `${type.name} · ${dateRange}` : type.name

    const compatible = checkEdgeCompatibility({
      type,
      sourceEntityType: source.entityType,
      targetEntityType: target.entityType,
      validFrom: values.validFrom,
      validTo: values.validTo,
      // An existing edge may keep a retired type; a new one may not. Same rule
      // the relationship editor applies.
      requireActiveType: !edgeByIdentity.has(key),
    })
    if (!compatible.ok) {
      planned.push({
        line: row.line,
        label,
        detail,
        action: {
          kind: 'fail',
          message: compatible.message,
          errors: flattenFieldErrors(compatible.fieldErrors),
        },
      })
      continue
    }

    if (claimed.has(key)) {
      planned.push({
        line: row.line,
        label,
        detail,
        action: {
          kind: 'fail',
          message: 'Another row in this batch records the same relationship with the same start date.',
          errors: [],
        },
      })
      continue
    }
    claimed.add(key)

    const existing = edgeByIdentity.get(key)

    if (!existing) {
      planned.push({ line: row.line, label, detail, action: { kind: 'create', input: raw } })
      continue
    }

    if (request.conflictPolicy === 'fail') {
      planned.push({
        line: row.line,
        label,
        detail,
        action: {
          kind: 'fail',
          message: 'Already recorded with the same start date.',
          errors: [],
        },
      })
      continue
    }

    if (request.conflictPolicy === 'skip') {
      planned.push({
        line: row.line,
        label,
        detail,
        action: { kind: 'skip', message: 'Already recorded with the same start date.' },
      })
      continue
    }

    // The identity fields are equal by definition; an update is for the rest of
    // the edge — closing it off, correcting a weight, adding a citation.
    planned.push({
      line: row.line,
      label,
      detail,
      action: {
        kind: 'update',
        id: existing.id,
        input: {
          sourceEntityId: source.id,
          relationshipTypeId: type.id,
          targetEntityId: target.id,
          validFrom: existing.validFrom,
          validTo: 'validTo' in row.fields ? row.fields.validTo : existing.validTo,
          weight: 'weight' in row.fields ? row.fields.weight : existing.weight,
          notes: 'notes' in row.fields ? row.fields.notes : existing.notes,
          provenanceId: row.provenanceRef ? provenance.id : existing.provenanceId,
        },
      },
    })
  }

  return planned
}

/* -------------------------------------------------------------------------- */
/* Run                                                                        */
/* -------------------------------------------------------------------------- */

function predictedOutcome(action: EntityAction | RelationshipAction): RowOutcome {
  switch (action.kind) {
    case 'create':
      return 'created'
    case 'update':
      return 'updated'
    case 'skip':
      return 'skipped'
    case 'defer':
      return 'deferred'
    default:
      return 'failed'
  }
}

async function runImport(
  request: BulkImportRequest,
  actor: Actor | null,
): Promise<BulkImportResult> {
  const parsed = parseImport({
    text: request.text,
    format: request.format,
    mode: request.mode,
    entityType: request.entityType,
  })
  if (!parsed.ok) return { ok: false, message: parsed.message }

  const sources = await buildSourceIndex()
  const plannedEntities = await planEntities(parsed.entities, request, sources)

  // Records first, so an edge in the same payload can name one of them. On a
  // preview the id is still unknown, which is what `deferred` reports; on a
  // commit the entity pass has already filled it in.
  const pending = new Map<string, PendingEntity>()
  for (const plan of plannedEntities) {
    if (!plan.slug || !plan.entityType) continue
    if (plan.action.kind !== 'create') continue
    pending.set(plan.slug, { entityType: plan.entityType, canonicalName: plan.label, id: null })
  }

  const rows: BulkImportRow[] = []
  const counts = emptyCounts()

  for (const issue of parsed.issues) {
    rows.push({
      line: issue.line,
      kind: request.mode === 'entities' ? 'record' : 'relationship',
      label: `Line ${issue.line}`,
      detail: null,
      outcome: 'failed',
      message: issue.message,
      errors: [],
      href: null,
    })
    counts.failed += 1
  }

  const invalid =
    parsed.issues.length + plannedEntities.filter((plan) => plan.action.kind === 'fail').length

  /**
   * A refused commit still returns its report — the operator needs to see which
   * lines to fix, and a bare error message would send them back to the sheet
   * blind.
   */
  const blocked = actor !== null && invalid > 0 && !request.allowPartial

  const commit = actor !== null && !blocked

  /* ---- records ---- */

  for (const plan of plannedEntities) {
    const row: BulkImportRow = {
      line: plan.line,
      kind: 'record',
      label: plan.label,
      detail: plan.detail,
      outcome: predictedOutcome(plan.action),
      message: 'message' in plan.action ? plan.action.message : null,
      errors: plan.action.kind === 'fail' ? plan.action.errors : [],
      href: null,
    }

    if (commit && actor && (plan.action.kind === 'create' || plan.action.kind === 'update')) {
      const result =
        plan.action.kind === 'create'
          ? await createEntity(plan.action.input, actor)
          : await updateEntity(plan.action.id, plan.action.input, actor)

      if (result.ok) {
        row.href = `/admin/entities/${result.data.id}`
        row.message = null
        if (plan.slug) {
          pending.set(plan.slug, {
            entityType: plan.entityType ?? request.entityType,
            canonicalName: result.data.canonicalName,
            id: result.data.id,
          })
        }
      } else {
        row.outcome = 'failed'
        row.message = result.message
        row.errors = flattenFieldErrors(result.fieldErrors)
      }
    }

    counts[row.outcome] += 1
    rows.push(row)
  }

  /* ---- relationships ---- */

  const plannedRelationships = await planRelationships(
    parsed.relationships,
    request,
    sources,
    pending,
  )

  for (const plan of plannedRelationships) {
    const row: BulkImportRow = {
      line: plan.line,
      kind: 'relationship',
      label: plan.label,
      detail: plan.detail,
      outcome: predictedOutcome(plan.action),
      message: 'message' in plan.action ? plan.action.message : null,
      errors: plan.action.kind === 'fail' ? plan.action.errors : [],
      href: null,
    }

    if (commit && actor && (plan.action.kind === 'create' || plan.action.kind === 'update')) {
      const result =
        plan.action.kind === 'create'
          ? await createRelationship(plan.action.input, actor)
          : await updateRelationship(plan.action.id, plan.action.input, actor)

      if (result.ok) {
        row.href = `/admin/relationships/${result.data.id}`
        row.message = null
      } else {
        row.outcome = 'failed'
        row.message = result.message
        row.errors = flattenFieldErrors(result.fieldErrors)
      }
    }

    counts[row.outcome] += 1
    rows.push(row)
  }

  rows.sort((a, b) => a.line - b.line || a.kind.localeCompare(b.kind))

  const report: BulkImportReport = {
    mode: request.mode,
    format: request.format,
    conflictPolicy: request.conflictPolicy,
    committed: commit,
    counts,
    rows,
    ignoredColumns: parsed.ignoredColumns,
  }

  if (blocked) {
    return {
      ok: false,
      message: `${invalid} row${invalid === 1 ? '' : 's'} would not import, so nothing was written. Fix them, or tick “apply the valid rows” to bring in the rest without them.`,
    }
  }

  if (commit && actor && counts.created + counts.updated > 0) {
    await recordBatch(request, report, actor)
  }

  return { ok: true, report }
}

/**
 * One audit entry for the batch itself, on top of the per-row entries the
 * services already wrote.
 *
 * Both are needed, for different questions. The per-row entries are what a
 * record's own history panel reads, so an imported row explains itself; this one
 * answers "what happened at 14:32 on Tuesday", which a hundred separate CREATE
 * lines do not. `AuditAction.BULK_IMPORT` exists in the enum for exactly this.
 */
async function recordBatch(
  request: BulkImportRequest,
  report: BulkImportReport,
  actor: Actor,
): Promise<void> {
  const { counts } = report
  const parts = [
    `${counts.created} created`,
    `${counts.updated} updated`,
    `${counts.skipped} skipped`,
    `${counts.failed} failed`,
  ]

  await recordChange({
    actor,
    action: AuditAction.BULK_IMPORT,
    entityType: 'BulkImport',
    entityId: null,
    summary: `Bulk import (${request.mode}, ${request.format.toUpperCase()}): ${parts.join(', ')}`,
    after: {
      mode: request.mode,
      format: request.format,
      conflictPolicy: request.conflictPolicy,
      allowPartial: request.allowPartial,
      counts,
      // Capped: the point of the manifest is to identify the batch later, not to
      // hold a second copy of the sheet in the audit log.
      applied: report.rows
        .filter((row) => row.outcome === 'created' || row.outcome === 'updated')
        .slice(0, 100)
        .map((row) => ({ line: row.line, kind: row.kind, label: row.label, outcome: row.outcome })),
    },
  })
}

/** Plan a batch and write nothing. */
export async function previewBulkImport(request: BulkImportRequest): Promise<BulkImportResult> {
  return runImport(request, null)
}

/** Plan a batch and apply it, row by row, through the audited services. */
export async function commitBulkImport(
  request: BulkImportRequest,
  actor: Actor,
): Promise<BulkImportResult> {
  return runImport(request, actor)
}
