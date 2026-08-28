import {
  ATTRIBUTE_TABLE_BY_ENTITY_TYPE,
  ENTITY_TYPE_LABELS,
  EXPLORE_COLLECTIONS,
  attributeTableFor,
  entityTypeLabel,
  type AttributeTable,
} from '@/domain/entity-taxonomy'
import { ISSUE_SEVERITY_LABELS, USER_ROLE_LABELS } from '@/domain/labels'
import { EntityType, IssueSeverity } from '@/generated/prisma/enums'
import { formatDate, formatDateRange, toISODate } from '@/lib/date'
import { emptyPage, type EntityRef, type Paginated } from '@/types/graph'

import {
  countEntitiesByType,
  findEntityById,
  listEntities,
  searchEntityRefs,
  type EntityWithAttributes,
} from '../repositories/entity-repository'
import { listEras } from '../repositories/era-repository'
import {
  countEdgesTouching,
  countRelationships,
  countRelationshipsByType,
  findRelationshipById,
  listRelationships,
  type EdgeRow,
} from '../repositories/relationship-repository'
import { listRelationshipTypes } from '../repositories/relationship-type-repository'
import { listSources } from '../repositories/source-repository'
import { getAuditLog, getRecordHistory, type AuditEntryView } from '../services/audit'
import { getConfigSummary, type ConfigSummary } from '../services/admin-config'
import { getHealthReport, type HealthReport } from '../services/data-health'
import { toEntityRef } from '../services/entity-mapper'

/**
 * Read models for the CMS (PRD §19, §20 `/admin`).
 *
 * These are reads only. Every admin *mutation* goes through `services/entity-admin`
 * or `services/admin-config`, which validate, audit and take an actor; nothing in
 * this file writes, and nothing in it authorizes. Authorization happens once, at
 * the route boundary, before any of these are called — a query that checked the
 * role itself would invite a caller to skip the check by calling a different one.
 *
 * The one thing that separates these from `queries/explore.ts` is that they pass
 * `includeUnpublished: true`. A curator has to be able to see a draft; that is the
 * whole reason the flag exists, and it is why the public read path never accepts it
 * as a parameter.
 */

/* -------------------------------------------------------------------------- */
/* Dashboard                                                                  */
/* -------------------------------------------------------------------------- */

export type AdminMetric = {
  label: string
  value: number
  href: string
  /** Set when the number is a problem rather than a size. */
  tone?: 'default' | 'warning' | 'critical'
}

export type AdminDashboard = {
  metrics: AdminMetric[]
  /** Entity counts per type, for the composition panel. */
  composition: { entityType: EntityType; label: string; count: number }[]
  /** Relationship counts per type — a thin type usually means a thin game. */
  edgeComposition: { code: string; name: string; count: number }[]
  health: HealthReport
  config: ConfigSummary
  recentActivity: AuditEntryView[]
}

const RECENT_ACTIVITY_COUNT = 12

/**
 * The `/admin` landing page.
 *
 * The health report leads the metrics rather than the entity count, because the
 * question a curator opens the CMS with is "is anything wrong", not "how big is
 * this". `blockingGames` is called out separately for the same reason: a data
 * problem that stops a game from generating is more urgent than one that only
 * makes a page thin (PRD §12).
 */
export async function getAdminDashboard(): Promise<AdminDashboard> {
  const [counts, edgeCounts, relationships, health, config, activity, types] = await Promise.all([
    countEntitiesByType(true),
    countRelationshipsByType(),
    countRelationships(),
    getHealthReport(),
    getConfigSummary(),
    getAuditLog({ pageSize: RECENT_ACTIVITY_COUNT }),
    listRelationshipTypes(true),
  ])

  const entities = [...counts.values()].reduce((sum, count) => sum + count, 0)

  const errorIssues = health.totals[IssueSeverity.ERROR] ?? 0
  const warningIssues = health.totals[IssueSeverity.WARNING] ?? 0

  const metrics: AdminMetric[] = [
    { label: 'Records', value: entities, href: '/admin/entities' },
    { label: 'Relationships', value: relationships, href: '/admin/relationships' },
    {
      label: `${ISSUE_SEVERITY_LABELS[IssueSeverity.ERROR]} issues`,
      value: errorIssues,
      href: '/admin/data-health',
      tone: errorIssues > 0 ? 'critical' : 'default',
    },
    {
      label: `${ISSUE_SEVERITY_LABELS[IssueSeverity.WARNING]} issues`,
      value: warningIssues,
      href: '/admin/data-health',
      tone: warningIssues > 0 ? 'warning' : 'default',
    },
    {
      label: 'Games blocked by data',
      value: health.blockingGames.length,
      href: '/admin/data-health',
      tone: health.blockingGames.length > 0 ? 'critical' : 'default',
    },
    { label: 'Sources', value: config.sources, href: '/admin/sources' },
  ]

  return {
    metrics,
    composition: [...counts.entries()]
      .map(([entityType, count]) => ({
        entityType,
        label: ENTITY_TYPE_LABELS[entityType],
        count,
      }))
      .sort((a, b) => b.count - a.count),
    // Every type, including the ones with no edges. A vocabulary term nothing
    // uses is the usual reason a generator cannot build a round, so it is news
    // rather than an empty row to hide (PRD §16).
    edgeComposition: types
      .map((type) => ({
        code: type.code,
        name: type.name,
        count: edgeCounts.get(type.id) ?? 0,
      }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
    health,
    config,
    recentActivity: activity.items,
  }
}

/* -------------------------------------------------------------------------- */
/* Entity browser                                                             */
/* -------------------------------------------------------------------------- */

export type AdminEntityRow = EntityRef & {
  isPublished: boolean
  prominence: number
  typeLabel: string
  /** Dates from the record itself, so a curator can spot an undated draft. */
  dateline: string
  sourceName: string | null
  updatedAt: Date
  updatedLabel: string
  editHref: string
}

export type AdminEntityList = {
  rows: Paginated<AdminEntityRow>
  applied: { search: string | null; entityType: EntityType | null }
  /** Filter options with counts, including types that have no records yet. */
  typeOptions: { value: EntityType; label: string; count: number }[]
}

function toAdminRow(row: EntityWithAttributes): AdminEntityRow {
  return {
    ...toEntityRef(row),
    isPublished: row.isPublished,
    prominence: row.prominence,
    typeLabel: entityTypeLabel(row.entityType),
    dateline: formatDateRange(row.activeFrom, row.activeTo),
    sourceName: row.provenance?.name ?? null,
    updatedAt: row.updatedAt,
    updatedLabel: formatDate(row.updatedAt),
    editHref: `/admin/entities/${row.id}`,
  }
}

/**
 * `/admin/entities`.
 *
 * Ordered by recency rather than prominence: the CMS list is a work queue, and
 * the record someone just touched is the one they are most likely to return to.
 */
export async function getAdminEntityList(
  options: { page?: number; pageSize?: number; search?: string; entityType?: EntityType | null } = {},
): Promise<AdminEntityList> {
  const entityType = options.entityType ?? null
  const search = options.search?.trim() || null

  const [listing, counts] = await Promise.all([
    listEntities({
      ...(entityType ? { entityTypes: [entityType] } : {}),
      ...(search ? { search } : {}),
      page: options.page,
      pageSize: options.pageSize,
      orderBy: 'recent',
      includeUnpublished: true,
    }),
    countEntitiesByType(true),
  ])

  const typeOptions = (Object.keys(ENTITY_TYPE_LABELS) as EntityType[]).map((value) => ({
    value,
    label: ENTITY_TYPE_LABELS[value],
    count: counts.get(value) ?? 0,
  }))

  return {
    rows: {
      items: listing.rows.map(toAdminRow),
      total: listing.total,
      page: listing.page,
      pageSize: listing.pageSize,
      pageCount: Math.max(1, Math.ceil(listing.total / listing.pageSize)),
    },
    applied: { search, entityType },
    typeOptions,
  }
}

/* -------------------------------------------------------------------------- */
/* Entity editor                                                              */
/* -------------------------------------------------------------------------- */

export type EntityFormDefaults = {
  id: string | null
  entityType: EntityType
  /**
   * The specialized field set to render, or null for a type that has none —
   * STAFF and GROUP are entities with no attribute table of their own.
   */
  attributeTable: AttributeTable | null
  canonicalName: string
  slug: string
  aliases: string
  summary: string
  description: string
  imageUrl: string
  activeFrom: string
  activeTo: string
  prominence: number
  isPublished: boolean
  provenanceId: string
  notes: string
  /** Raw specialized-row values, keyed as the attribute schema expects them. */
  attributes: Record<string, unknown>
}

export type EntityEditorPage = {
  defaults: EntityFormDefaults
  /** Existing relationships, so the editor can show them without a second page. */
  edges: AdminEdgeRow[]
  edgeCount: number
  sources: { id: string; name: string }[]
  history: AuditEntryView[]
  typeOptions: { value: EntityType; label: string }[]
  /** Collections, for the "view on the public site" link. */
  publicHref: string | null
}

/**
 * The specialized row as plain values.
 *
 * The form needs the stored values, not the display strings `toEntityAttributes`
 * produces — an editor that round-trips "5 ft 4 in" back into `heightCm` is a data
 * loss bug waiting to happen. Primary keys are stripped because the attribute
 * schemas do not accept them and the entity id already identifies the row.
 */
function rawAttributes(row: EntityWithAttributes): Record<string, unknown> {
  const specialized =
    row.member ??
    row.generation ??
    row.team ??
    row.song ??
    row.album ??
    row.event ??
    row.concert ??
    row.setlist ??
    row.mediaItem ??
    row.organization

  if (!specialized) return {}

  const values: Record<string, unknown> = { ...specialized }
  delete values.entityId

  // Dates reach the form as `YYYY-MM-DD` so a date input can render them; the
  // validation layer parses them back to UTC-midnight on the way in.
  for (const [key, value] of Object.entries(values)) {
    if (value instanceof Date) values[key] = toISODate(value) ?? ''
  }

  return values
}

function blankDefaults(entityType: EntityType): EntityFormDefaults {
  return {
    id: null,
    entityType,
    attributeTable: attributeTableFor(entityType),
    canonicalName: '',
    slug: '',
    aliases: '',
    summary: '',
    description: '',
    imageUrl: '',
    activeFrom: '',
    activeTo: '',
    prominence: 50,
    // A new record starts unpublished. Publishing is a deliberate second action,
    // which is what makes a draft possible at all (PRD §19).
    isPublished: false,
    provenanceId: '',
    notes: '',
    attributes: {},
  }
}

/**
 * `/admin/entities/new` and `/admin/entities/[id]`.
 *
 * Returns null only when an id was given and no such record exists. Note what the
 * form does *not* contain: no generation dropdown, no team field, no "center of"
 * picker. Those are relationships, created in the relationship editor, because a
 * foreign key on the member record is exactly the schema §10 rules out — and a
 * form is the easiest place for one to creep back in.
 */
export async function getEntityEditorPage(
  options: { id?: string | null; entityType?: EntityType | null } = {},
): Promise<EntityEditorPage | null> {
  const [sources, typeOptions] = await Promise.all([
    listSources(),
    Promise.resolve(
      (Object.keys(ENTITY_TYPE_LABELS) as EntityType[]).map((value) => ({
        value,
        label: ENTITY_TYPE_LABELS[value],
      })),
    ),
  ])

  const sourceOptions = sources.map((source) => ({ id: source.id, name: source.name }))

  if (!options.id) {
    return {
      defaults: blankDefaults(options.entityType ?? EntityType.MEMBER),
      edges: [],
      edgeCount: 0,
      sources: sourceOptions,
      history: [],
      typeOptions,
      publicHref: null,
    }
  }

  const entity = await findEntityById(options.id, true)
  if (!entity) return null

  const [edges, edgeCount, history] = await Promise.all([
    listRelationships({ entityId: entity.id, pageSize: 100 }),
    countEdgesTouching(entity.id),
    getRecordHistory('Entity', entity.id),
  ])

  return {
    defaults: {
      id: entity.id,
      entityType: entity.entityType,
      attributeTable: attributeTableFor(entity.entityType),
      canonicalName: entity.canonicalName,
      slug: entity.slug,
      aliases: entity.aliases.join(', '),
      summary: entity.summary ?? '',
      description: entity.description ?? '',
      imageUrl: entity.imageUrl ?? '',
      activeFrom: toISODate(entity.activeFrom) ?? '',
      activeTo: toISODate(entity.activeTo) ?? '',
      prominence: entity.prominence,
      isPublished: entity.isPublished,
      provenanceId: entity.provenanceId ?? '',
      notes: entity.notes ?? '',
      attributes: rawAttributes(entity),
    },
    edges: edges.rows.map(toAdminEdgeRow),
    edgeCount,
    sources: sourceOptions,
    history,
    typeOptions,
    publicHref: entity.isPublished ? toEntityRef(entity).href : null,
  }
}

/* -------------------------------------------------------------------------- */
/* Relationship browser                                                       */
/* -------------------------------------------------------------------------- */

export type AdminEdgeRow = {
  id: string
  code: string
  typeName: string
  isTemporal: boolean
  source: EntityRef
  target: EntityRef
  validFrom: string
  validTo: string
  validity: string
  weight: number
  sourceName: string | null
  editHref: string
  /** True while the edge is still open — the roster a member is on right now. */
  isOpen: boolean
}

function toAdminEdgeRow(row: EdgeRow): AdminEdgeRow {
  return {
    id: row.id,
    code: row.relationshipType.code,
    typeName: row.relationshipType.name,
    isTemporal: row.relationshipType.isTemporal,
    source: toEntityRef(row.source),
    target: toEntityRef(row.target),
    validFrom: toISODate(row.validFrom) ?? '',
    validTo: toISODate(row.validTo) ?? '',
    validity: formatDateRange(row.validFrom, row.validTo),
    weight: row.weight,
    sourceName: row.provenance?.name ?? null,
    editHref: `/admin/relationships/${row.id}`,
    isOpen: row.validFrom !== null && row.validTo === null,
  }
}

export type AdminRelationshipList = {
  rows: Paginated<AdminEdgeRow>
  applied: { search: string | null; code: string | null; entityId: string | null }
  typeOptions: { code: string; name: string; count: number }[]
  /** Named when filtering by entity, so the page can say whose edges these are. */
  scope: EntityRef | null
}

/**
 * `/admin/relationships`.
 *
 * A first-class browser, not a panel inside the entity editor (PRD §10, §19). A
 * relationship has its own dates, its own provenance and its own edit history, and
 * curating it from inside one of its endpoints hides half of what it connects.
 */
export async function getAdminRelationshipList(
  options: {
    page?: number
    pageSize?: number
    search?: string
    code?: string | null
    entityId?: string | null
  } = {},
): Promise<AdminRelationshipList> {
  const code = options.code?.trim() || null
  const search = options.search?.trim() || null
  const entityId = options.entityId?.trim() || null

  const [listing, counts, types, scopeEntity] = await Promise.all([
    listRelationships({
      page: options.page,
      pageSize: options.pageSize,
      ...(code ? { relationshipCodes: [code] } : {}),
      ...(search ? { search } : {}),
      ...(entityId ? { entityId } : {}),
    }),
    countRelationshipsByType(),
    listRelationshipTypes(true),
    entityId ? findEntityById(entityId, true) : Promise.resolve(null),
  ])

  return {
    rows: {
      items: listing.rows.map(toAdminEdgeRow),
      total: listing.total,
      page: listing.page,
      pageSize: listing.pageSize,
      pageCount: Math.max(1, Math.ceil(listing.total / listing.pageSize)),
    },
    applied: { search, code, entityId },
    // Counts arrive keyed by relationship-type id, not by code.
    typeOptions: types.map((type) => ({
      code: type.code,
      name: type.name,
      count: counts.get(type.id) ?? 0,
    })),
    scope: scopeEntity ? toEntityRef(scopeEntity) : null,
  }
}

/* -------------------------------------------------------------------------- */
/* Relationship editor                                                        */
/* -------------------------------------------------------------------------- */

export type RelationshipFormDefaults = {
  id: string | null
  sourceEntityId: string
  relationshipTypeId: string
  targetEntityId: string
  validFrom: string
  validTo: string
  weight: number
  provenanceId: string
  notes: string
}

export type RelationshipTypeOption = {
  id: string
  code: string
  name: string
  inverseName: string | null
  isTemporal: boolean
  isDirectional: boolean
  /** Empty means "any type", which the form should present as no restriction. */
  allowedSourceTypes: EntityType[]
  allowedTargetTypes: EntityType[]
}

export type RelationshipEditorPage = {
  defaults: RelationshipFormDefaults
  types: RelationshipTypeOption[]
  sources: { id: string; name: string }[]
  /** Pre-resolved endpoints so an edit form can render names, not ids. */
  sourceEntity: EntityRef | null
  targetEntity: EntityRef | null
  history: AuditEntryView[]
}

/**
 * `/admin/relationships/new` and `/admin/relationships/[id]`.
 *
 * The type list carries `allowedSourceTypes` / `allowedTargetTypes` so the entity
 * pickers can be constrained as soon as a type is chosen. That is a convenience:
 * the same rule is enforced again in `entity-admin` on submit, because a filtered
 * dropdown is not a validation boundary (PRD §35).
 */
export async function getRelationshipEditorPage(
  options: { id?: string | null; sourceEntityId?: string | null } = {},
): Promise<RelationshipEditorPage | null> {
  const [types, sources] = await Promise.all([listRelationshipTypes(), listSources()])

  const typeOptions: RelationshipTypeOption[] = types.map((type) => ({
    id: type.id,
    code: type.code,
    name: type.name,
    inverseName: type.inverseName,
    isTemporal: type.isTemporal,
    isDirectional: type.isDirectional,
    allowedSourceTypes: type.allowedSourceTypes,
    allowedTargetTypes: type.allowedTargetTypes,
  }))
  const sourceOptions = sources.map((source) => ({ id: source.id, name: source.name }))

  if (!options.id) {
    const seedSourceId = options.sourceEntityId?.trim() || ''
    const seedEntity = seedSourceId ? await findEntityById(seedSourceId, true) : null

    return {
      defaults: {
        id: null,
        sourceEntityId: seedSourceId,
        relationshipTypeId: '',
        targetEntityId: '',
        validFrom: '',
        validTo: '',
        weight: 1,
        provenanceId: '',
        notes: '',
      },
      types: typeOptions,
      sources: sourceOptions,
      sourceEntity: seedEntity ? toEntityRef(seedEntity) : null,
      targetEntity: null,
      history: [],
    }
  }

  const edge = await findRelationshipById(options.id)
  if (!edge) return null

  const history = await getRecordHistory('Relationship', edge.id)

  return {
    defaults: {
      id: edge.id,
      sourceEntityId: edge.sourceEntityId,
      relationshipTypeId: edge.relationshipTypeId,
      targetEntityId: edge.targetEntityId,
      validFrom: toISODate(edge.validFrom) ?? '',
      validTo: toISODate(edge.validTo) ?? '',
      weight: edge.weight,
      provenanceId: edge.provenanceId ?? '',
      notes: edge.notes ?? '',
    },
    types: typeOptions,
    sources: sourceOptions,
    sourceEntity: toEntityRef(edge.source),
    targetEntity: toEntityRef(edge.target),
    history,
  }
}

/* -------------------------------------------------------------------------- */
/* Pickers                                                                    */
/* -------------------------------------------------------------------------- */

export type EntityPickerOption = EntityRef & { typeLabel: string; isPublished: boolean }

/**
 * Typeahead options for the relationship editor's endpoint fields.
 *
 * Searches unpublished records too: a curator building the graph for a draft
 * member needs to find her before she is public. `entityTypes` narrows the search
 * to what the chosen relationship type allows.
 */
export async function searchEntityPicker(
  query: string,
  options: { entityTypes?: EntityType[]; limit?: number } = {},
): Promise<EntityPickerOption[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const { rows } = await listEntities({
    search: trimmed,
    ...(options.entityTypes?.length ? { entityTypes: options.entityTypes } : {}),
    pageSize: options.limit ?? 12,
    orderBy: 'prominence',
    includeUnpublished: true,
  })

  return rows.map((row) => ({
    ...toEntityRef(row),
    typeLabel: entityTypeLabel(row.entityType),
    isPublished: row.isPublished,
  }))
}

/** The public-facing picker, used by relationship puzzles and the search box. */
export async function searchPublishedEntities(
  query: string,
  options: { entityTypes?: EntityType[]; limit?: number } = {},
): Promise<EntityRef[]> {
  const trimmed = query.trim()
  if (trimmed.length < 2) return []

  const rows = await searchEntityRefs(trimmed, options.limit ?? 12, options.entityTypes)
  return rows.map(toEntityRef)
}

/* -------------------------------------------------------------------------- */
/* Audit log                                                                  */
/* -------------------------------------------------------------------------- */

export type AuditPage = {
  entries: Paginated<AuditEntryView>
  applied: { entityType: string | null; action: string | null; actorId: string | null }
}

/**
 * `/admin/audit` (PRD §35: "Audit logging for administrative mutations").
 *
 * Read-only by design and with no delete path anywhere in the codebase — an audit
 * trail a curator can edit answers no question worth asking of it.
 */
export async function getAuditPage(
  options: {
    page?: number
    pageSize?: number
    entityType?: string | null
    action?: string | null
    actorId?: string | null
  } = {},
): Promise<AuditPage> {
  const entityType = options.entityType?.trim() || null
  const action = options.action?.trim() || null
  const actorId = options.actorId?.trim() || null

  const entries = await getAuditLog({
    page: options.page,
    pageSize: options.pageSize,
    ...(entityType ? { entityType } : {}),
    ...(action ? { action: action as never } : {}),
    ...(actorId ? { actorId } : {}),
  })

  return { entries, applied: { entityType, action, actorId } }
}

/* -------------------------------------------------------------------------- */
/* Supporting lists                                                           */
/* -------------------------------------------------------------------------- */

export type EraRow = {
  id: string
  name: string
  slug: string
  startDate: string
  endDate: string
  span: string
  description: string | null
  displayOrder: number
}

/** `/admin/settings` era editor. Eras label the timeline; they carry no edges. */
export async function getAdminEras(): Promise<EraRow[]> {
  const rows = await listEras()

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    startDate: toISODate(row.startDate) ?? '',
    endDate: toISODate(row.endDate) ?? '',
    span: formatDateRange(row.startDate, row.endDate),
    description: row.description,
    displayOrder: row.displayOrder,
  }))
}

/**
 * Collection labels for admin navigation.
 *
 * Reuses the public taxonomy so a curator's mental model of the archive matches a
 * reader's — the CMS is a view of the same collections, not a parallel structure.
 */
export function adminCollectionOptions(): { slug: string; label: string; entityTypes: EntityType[] }[] {
  return EXPLORE_COLLECTIONS.map((collection) => ({
    slug: collection.slug,
    label: collection.label,
    entityTypes: [...collection.entityTypes],
  }))
}

/** Role labels for the user administration screen (PRD §19). */
export function roleOptions(): { value: string; label: string }[] {
  return Object.entries(USER_ROLE_LABELS).map(([value, label]) => ({ value, label }))
}

/**
 * Which attribute table an entity type writes to.
 *
 * Exposed so the editor can pick a field set without duplicating the mapping. The
 * empty page shape is here for the same reason: a component should never have to
 * invent one.
 */
export function attributeTableOptions(): {
  entityType: EntityType
  table: AttributeTable | null
}[] {
  return (Object.keys(ATTRIBUTE_TABLE_BY_ENTITY_TYPE) as EntityType[]).map((entityType) => ({
    entityType,
    table: ATTRIBUTE_TABLE_BY_ENTITY_TYPE[entityType],
  }))
}

export const EMPTY_ADMIN_ENTITY_PAGE = emptyPage<AdminEntityRow>()
