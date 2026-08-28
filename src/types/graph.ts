import type {
  AlbumType,
  EntityCategory,
  EntityType,
  EventType,
  MediaType,
  MemberStatus,
  OrganizationType,
  SongType,
  SourceType,
} from '@/generated/prisma/enums'

/**
 * View models for the knowledge graph.
 *
 * Components consume these, never Prisma payload types. That keeps the ORM in
 * the service layer (PRD §26) and means a schema change surfaces as a compile
 * error in one mapper rather than in fifty components.
 */

export type EntityRef = {
  id: string
  entityType: EntityType
  category: EntityCategory
  canonicalName: string
  slug: string
  summary: string | null
  imageUrl: string | null
  /** Pre-built canonical URL, so components never assemble routes. */
  href: string
}

export type SourceRef = {
  id: string
  name: string
  url: string | null
  sourceType: SourceType
  retrievedAt: Date | null
}

export type EdgeDirection = 'OUTGOING' | 'INCOMING'

/**
 * One relationship, already oriented from the perspective of the entity being
 * viewed: `other` is the far end and `label` is the correct phrasing for the
 * direction travelled.
 */
export type GraphEdge = {
  id: string
  code: string
  /** Reading label for this direction: "member of" vs "roster includes". */
  label: string
  direction: EdgeDirection
  isTemporal: boolean
  isQuizzable: boolean
  validFrom: Date | null
  validTo: Date | null
  weight: number
  notes: string | null
  other: EntityRef
  source: SourceRef | null
}

/** A named group of edges as rendered on an entity page (PRD §4.1). */
export type EdgeSection = {
  label: string
  edges: GraphEdge[]
}

/** Type-specific attributes, flattened for display. */
export type EntityAttribute = {
  label: string
  value: string
  /** Marks fields Memory Reconstruction is allowed to redact. */
  isRecallTarget?: boolean
  /**
   * Names the entity. The game engine must never use one of these as a clue —
   * "which member has the full name Shania Junianatha?" answers itself.
   */
  isIdentity?: boolean
}

export type EntityDetail = EntityRef & {
  aliases: string[]
  description: string | null
  activeFrom: Date | null
  activeTo: Date | null
  prominence: number
  isPublished: boolean
  notes: string | null
  attributes: EntityAttribute[]
  sections: EdgeSection[]
  source: SourceRef | null
  updatedAt: Date
}

/** Specialized rows, discriminated by entity type. */
export type MemberAttributes = {
  stageName: string
  fullName: string | null
  nickname: string | null
  status: MemberStatus
  birthDate: Date | null
  birthPlace: string | null
  heightCm: number | null
  bloodType: string | null
  zodiac: string | null
  jikoshoukai: string | null
  debutDate: Date | null
  graduationDate: Date | null
}

export type GenerationAttributes = {
  number: number
  auditionOpenedAt: Date | null
  announcedAt: Date | null
  debutedAt: Date | null
  initialMemberCount: number | null
}

export type TeamAttributes = {
  code: string
  formedAt: Date | null
  disbandedAt: Date | null
  colorHex: string | null
  catchphrase: string | null
}

export type SongAttributes = {
  title: string
  originalTitle: string | null
  songType: SongType
  releasedAt: Date | null
  durationSec: number | null
  isAdaptation: boolean
  originalArtist: string | null
  lyricist: string | null
  composer: string | null
}

export type AlbumAttributes = {
  title: string
  albumType: AlbumType
  releasedAt: Date | null
  catalogNumber: string | null
  trackCount: number | null
  label: string | null
}

export type EventAttributes = {
  title: string
  eventType: EventType
  startDate: Date | null
  endDate: Date | null
  venue: string | null
  city: string | null
  country: string | null
}

export type MediaAttributes = {
  title: string
  mediaType: MediaType
  releasedAt: Date | null
  network: string | null
  publisher: string | null
  externalUrl: string | null
}

export type OrganizationAttributes = {
  name: string
  orgType: OrganizationType
  country: string | null
  foundedAt: Date | null
  website: string | null
}

/**
 * An edge in its stored orientation, for views that draw the graph rather than
 * read it from one entity's point of view (Connect the Dots, subgraph panels).
 */
export type SubgraphEdge = {
  id: string
  code: string
  label: string
  isTemporal: boolean
  isQuizzable: boolean
  validFrom: Date | null
  validTo: Date | null
  weight: number
  from: EntityRef
  to: EntityRef
}

export type Subgraph = {
  root: EntityRef
  nodes: EntityRef[]
  edges: SubgraphEdge[]
}

export type GraphPathStep = {
  edge: SubgraphEdge
  /** Whether the path travelled the edge forwards or backwards. */
  direction: EdgeDirection
  /** The entity arrived at by taking this step. */
  to: EntityRef
}

/** A resolved chain through the graph — the raw material for multi-hop questions. */
export type GraphPath = {
  start: EntityRef
  end: EntityRef
  steps: GraphPathStep[]
}

/** Paginated list envelope used by every browse view and list endpoint. */
export type Paginated<T> = {
  items: T[]
  total: number
  page: number
  pageSize: number
  pageCount: number
}

export function emptyPage<T>(page = 1, pageSize = 24): Paginated<T> {
  return { items: [], total: 0, page, pageSize, pageCount: 0 }
}
