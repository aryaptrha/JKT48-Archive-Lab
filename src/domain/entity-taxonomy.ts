import { EntityCategory, EntityType } from '@/generated/prisma/enums'

/**
 * Entity taxonomy (PRD §9.1).
 *
 * One place maps a concrete `EntityType` to its category, its human label, and
 * the public collection it appears under. Adding a new type means editing this
 * file and the enum — no feature needs to learn about it.
 */

/** The specialized attribute tables in the schema (PRD §9.2). */
export type AttributeTable =
  | 'member'
  | 'generation'
  | 'team'
  | 'song'
  | 'album'
  | 'event'
  | 'concert'
  | 'setlist'
  | 'mediaItem'
  | 'organization'

export const CATEGORY_BY_ENTITY_TYPE: Record<EntityType, EntityCategory> = {
  [EntityType.MEMBER]: EntityCategory.PERSON,
  [EntityType.STAFF]: EntityCategory.PERSON,

  [EntityType.GROUP]: EntityCategory.GROUP,
  [EntityType.TEAM]: EntityCategory.GROUP,
  [EntityType.GENERATION]: EntityCategory.GROUP,
  [EntityType.SUBUNIT]: EntityCategory.GROUP,

  [EntityType.SONG]: EntityCategory.MUSIC,
  [EntityType.SINGLE]: EntityCategory.MUSIC,
  [EntityType.ALBUM]: EntityCategory.MUSIC,
  [EntityType.SETLIST]: EntityCategory.MUSIC,
  [EntityType.UNIT]: EntityCategory.MUSIC,

  [EntityType.CONCERT]: EntityCategory.EVENT,
  [EntityType.THEATER_PERFORMANCE]: EntityCategory.EVENT,
  [EntityType.ELECTION]: EntityCategory.EVENT,
  [EntityType.AUDITION]: EntityCategory.EVENT,
  [EntityType.GRADUATION]: EntityCategory.EVENT,
  [EntityType.FORMATION]: EntityCategory.EVENT,
  [EntityType.MAJOR_EVENT]: EntityCategory.EVENT,

  [EntityType.TV_APPEARANCE]: EntityCategory.MEDIA,
  [EntityType.RADIO]: EntityCategory.MEDIA,
  [EntityType.MOVIE]: EntityCategory.MEDIA,
  [EntityType.DRAMA]: EntityCategory.MEDIA,
  [EntityType.PHOTOBOOK]: EntityCategory.MEDIA,

  [EntityType.ORGANIZATION]: EntityCategory.ORGANIZATION,
}

export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  [EntityType.MEMBER]: 'Member',
  [EntityType.STAFF]: 'Staff',
  [EntityType.GROUP]: 'Group',
  [EntityType.TEAM]: 'Team',
  [EntityType.GENERATION]: 'Generation',
  [EntityType.SUBUNIT]: 'Sub-unit',
  [EntityType.SONG]: 'Song',
  [EntityType.SINGLE]: 'Single',
  [EntityType.ALBUM]: 'Album',
  [EntityType.SETLIST]: 'Theater Setlist',
  [EntityType.UNIT]: 'Unit',
  [EntityType.CONCERT]: 'Concert',
  [EntityType.THEATER_PERFORMANCE]: 'Theater Performance',
  [EntityType.ELECTION]: 'Election',
  [EntityType.AUDITION]: 'Audition',
  [EntityType.GRADUATION]: 'Graduation',
  [EntityType.FORMATION]: 'Formation',
  [EntityType.MAJOR_EVENT]: 'Major Event',
  [EntityType.TV_APPEARANCE]: 'TV Appearance',
  [EntityType.RADIO]: 'Radio',
  [EntityType.MOVIE]: 'Movie',
  [EntityType.DRAMA]: 'Drama',
  [EntityType.PHOTOBOOK]: 'Photobook',
  [EntityType.ORGANIZATION]: 'Organization',
}

export const ENTITY_CATEGORY_LABELS: Record<EntityCategory, string> = {
  [EntityCategory.PERSON]: 'Person',
  [EntityCategory.GROUP]: 'Group',
  [EntityCategory.MUSIC]: 'Music',
  [EntityCategory.EVENT]: 'Event',
  [EntityCategory.MEDIA]: 'Media',
  [EntityCategory.ORGANIZATION]: 'Organization',
}

/**
 * Public browse collections (PRD §20). A collection can span several entity
 * types — `/explore/events` covers elections, graduations and formations.
 */
export type ExploreCollection = {
  slug: string
  label: string
  /** Singular noun used in headings and "Test this X" actions. */
  singular: string
  description: string
  entityTypes: EntityType[]
  /** Catalogue prefix shown in the archive UI, e.g. MBR / GEN / SNG. */
  catalogPrefix: string
}

export const EXPLORE_COLLECTIONS: ExploreCollection[] = [
  {
    slug: 'members',
    label: 'Members',
    singular: 'Member',
    description:
      'Every person who has stood on the JKT48 stage, with their generation, team history and musical record.',
    entityTypes: [EntityType.MEMBER],
    catalogPrefix: 'MBR',
  },
  {
    slug: 'generations',
    label: 'Generations',
    singular: 'Generation',
    description:
      'The intake cohorts that structure the group’s history. Mastery in V1 is measured per generation.',
    entityTypes: [EntityType.GENERATION],
    catalogPrefix: 'GEN',
  },
  {
    slug: 'teams',
    label: 'Teams',
    singular: 'Team',
    description:
      'Performance teams and sub-units, whose rosters shift over time through shuffles and graduations.',
    entityTypes: [EntityType.TEAM, EntityType.SUBUNIT],
    catalogPrefix: 'TEA',
  },
  {
    slug: 'songs',
    label: 'Songs',
    singular: 'Song',
    description:
      'Singles, B-sides, album tracks and setlist songs — with centers, senbatsu lineups and origins.',
    entityTypes: [EntityType.SONG],
    catalogPrefix: 'SNG',
  },
  {
    slug: 'albums',
    label: 'Albums',
    singular: 'Album',
    description: 'Singles and albums as physical releases, with their tracklists and catalogue data.',
    entityTypes: [EntityType.ALBUM, EntityType.SINGLE],
    catalogPrefix: 'ALB',
  },
  {
    slug: 'events',
    label: 'Events',
    singular: 'Event',
    description:
      'Auditions, formations, shuffles, elections, graduations and concerts — the moments history turns on.',
    entityTypes: [
      EntityType.MAJOR_EVENT,
      EntityType.ELECTION,
      EntityType.AUDITION,
      EntityType.GRADUATION,
      EntityType.FORMATION,
      EntityType.CONCERT,
      EntityType.THEATER_PERFORMANCE,
    ],
    catalogPrefix: 'EVT',
  },
  {
    slug: 'setlists',
    label: 'Setlists',
    singular: 'Setlist',
    description: 'Theater stages, their revisions and the songs that make them up.',
    entityTypes: [EntityType.SETLIST],
    catalogPrefix: 'SET',
  },
  {
    slug: 'media',
    label: 'Media',
    singular: 'Media',
    description: 'Television, radio, film, drama and photobook appearances.',
    entityTypes: [
      EntityType.TV_APPEARANCE,
      EntityType.RADIO,
      EntityType.MOVIE,
      EntityType.DRAMA,
      EntityType.PHOTOBOOK,
    ],
    catalogPrefix: 'MED',
  },
  {
    slug: 'organizations',
    label: 'Organizations',
    singular: 'Organization',
    description: 'AKB48, sister groups, management and the wider institutional context.',
    entityTypes: [EntityType.ORGANIZATION, EntityType.GROUP],
    catalogPrefix: 'ORG',
  },
]

const COLLECTION_BY_SLUG = new Map(EXPLORE_COLLECTIONS.map((c) => [c.slug, c]))

export function getCollection(slug: string): ExploreCollection | undefined {
  return COLLECTION_BY_SLUG.get(slug)
}

/** The collection an entity type is browsed under. */
export function collectionForEntityType(type: EntityType): ExploreCollection | undefined {
  return EXPLORE_COLLECTIONS.find((c) => c.entityTypes.includes(type))
}

/** Canonical public URL for any entity — the one link builder for the archive. */
export function entityHref(entity: { entityType: EntityType; slug: string }): string {
  const collection = collectionForEntityType(entity.entityType)
  return `/explore/${collection?.slug ?? 'members'}/${entity.slug}`
}

export function categoryForEntityType(type: EntityType): EntityCategory {
  return CATEGORY_BY_ENTITY_TYPE[type]
}

export function entityTypeLabel(type: EntityType): string {
  return ENTITY_TYPE_LABELS[type] ?? type
}

/**
 * Which specialized attribute table backs each entity type.
 *
 * The schema keeps type-specific fields in their own tables (PRD §9.2), and
 * several entity types share one: every event-ish type uses `events`, every
 * media type uses `media_items`. Null means the type carries no extra fields
 * beyond the base entity record, so a missing row is not a defect.
 *
 * The data-health scan and the admin editor both need this mapping, which is
 * why it is domain knowledge rather than a switch inside either of them.
 */
export const ATTRIBUTE_TABLE_BY_ENTITY_TYPE: Record<EntityType, AttributeTable | null> = {
  [EntityType.MEMBER]: 'member',
  [EntityType.STAFF]: null,

  [EntityType.GROUP]: null,
  [EntityType.TEAM]: 'team',
  [EntityType.GENERATION]: 'generation',
  [EntityType.SUBUNIT]: 'team',

  [EntityType.SONG]: 'song',
  [EntityType.SINGLE]: 'album',
  [EntityType.ALBUM]: 'album',
  [EntityType.SETLIST]: 'setlist',
  [EntityType.UNIT]: 'team',

  [EntityType.CONCERT]: 'concert',
  [EntityType.THEATER_PERFORMANCE]: 'event',
  [EntityType.ELECTION]: 'event',
  [EntityType.AUDITION]: 'event',
  [EntityType.GRADUATION]: 'event',
  [EntityType.FORMATION]: 'event',
  [EntityType.MAJOR_EVENT]: 'event',

  [EntityType.TV_APPEARANCE]: 'mediaItem',
  [EntityType.RADIO]: 'mediaItem',
  [EntityType.MOVIE]: 'mediaItem',
  [EntityType.DRAMA]: 'mediaItem',
  [EntityType.PHOTOBOOK]: 'mediaItem',

  [EntityType.ORGANIZATION]: 'organization',
}

export function attributeTableFor(type: EntityType): AttributeTable | null {
  return ATTRIBUTE_TABLE_BY_ENTITY_TYPE[type]
}
