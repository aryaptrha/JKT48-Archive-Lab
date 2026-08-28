import { entityHref } from '@/domain/entity-taxonomy'
import {
  ALBUM_TYPE_LABELS,
  EVENT_TYPE_LABELS,
  MEDIA_TYPE_LABELS,
  MEMBER_STATUS_LABELS,
  ORGANIZATION_TYPE_LABELS,
  SONG_TYPE_LABELS,
  SOURCE_TYPE_LABELS,
} from '@/domain/labels'
import { RELATIONSHIP_SECTIONS } from '@/domain/relationship-types'
import type { EntityCategory, EntityType, Source } from '@/generated/prisma/client'
import { formatDate } from '@/lib/date'
import type {
  EdgeSection,
  EntityAttribute,
  EntityDetail,
  EntityRef,
  GraphEdge,
  SourceRef,
} from '@/types/graph'

import type { EdgeRow } from '../repositories/relationship-repository'
import type { EntityWithAttributes } from '../repositories/entity-repository'

/**
 * Prisma rows → view models.
 *
 * This is the boundary the PRD asks for (§26): everything above it speaks in
 * `EntityRef` and `GraphEdge`, everything below in Prisma payloads. All the
 * "which specialized table does this type use" knowledge lives here, once.
 */

type RefLike = {
  id: string
  entityType: EntityType
  category: EntityCategory
  canonicalName: string
  slug: string
  summary: string | null
  imageUrl: string | null
}

export function toEntityRef(row: RefLike): EntityRef {
  return {
    id: row.id,
    entityType: row.entityType,
    category: row.category,
    canonicalName: row.canonicalName,
    slug: row.slug,
    summary: row.summary,
    imageUrl: row.imageUrl,
    href: entityHref(row),
  }
}

export function toSourceRef(row: Source | null | undefined): SourceRef | null {
  if (!row) return null
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    sourceType: row.sourceType,
    retrievedAt: row.retrievedAt,
  }
}

/**
 * Orient an edge relative to the entity being viewed.
 *
 * The same row reads as "member of Team J" from a member and "roster includes
 * Kinal" from the team. Components should never have to work that out.
 */
export function toGraphEdge(row: EdgeRow, perspectiveEntityId: string): GraphEdge {
  const isOutgoing = row.sourceEntityId === perspectiveEntityId
  const other = isOutgoing ? row.target : row.source
  const type = row.relationshipType

  return {
    id: row.id,
    code: type.code,
    label: isOutgoing ? type.name : (type.inverseName ?? type.name),
    direction: isOutgoing ? 'OUTGOING' : 'INCOMING',
    isTemporal: type.isTemporal,
    isQuizzable: type.isQuizzable,
    validFrom: row.validFrom,
    validTo: row.validTo,
    weight: row.weight,
    notes: row.notes,
    other: toEntityRef(other),
    source: toSourceRef(row.provenance),
  }
}

/**
 * Group edges into the sections an entity page renders.
 *
 * Sections come from the relationship vocabulary, not from the entity type, so a
 * new relationship code appears in the right place by being listed in
 * `RELATIONSHIP_SECTIONS` — no per-page changes. Anything unlisted collects
 * under "Other connections" rather than disappearing.
 */
export function groupEdgesIntoSections(edges: GraphEdge[]): EdgeSection[] {
  const sections: EdgeSection[] = []
  const claimed = new Set<string>()

  for (const section of RELATIONSHIP_SECTIONS) {
    const codes = new Set<string>(section.codes)
    const matched = edges.filter((edge) => codes.has(edge.code))
    if (matched.length === 0) continue

    for (const edge of matched) claimed.add(edge.id)
    sections.push({ label: section.label, edges: matched })
  }

  const leftovers = edges.filter((edge) => !claimed.has(edge.id))
  if (leftovers.length > 0) {
    sections.push({ label: 'Other connections', edges: leftovers })
  }

  return sections
}

function attribute(
  label: string,
  value: string | number | Date | null | undefined,
  isRecallTarget = false,
  isIdentity = false,
): EntityAttribute | null {
  if (value === null || value === undefined || value === '') return null
  const text = value instanceof Date ? formatDate(value) : String(value)
  return { label, value: text, isRecallTarget, isIdentity }
}

/** Naming fields — recallable, but never usable as a clue about themselves. */
function identity(
  label: string,
  value: string | number | Date | null | undefined,
): EntityAttribute | null {
  return attribute(label, value, true, true)
}

function compact(items: (EntityAttribute | null)[]): EntityAttribute[] {
  return items.filter((item): item is EntityAttribute => item !== null)
}

/**
 * Flatten the specialized row into displayable attributes.
 *
 * `isRecallTarget` marks fields Memory Reconstruction may redact — facts a fan
 * could plausibly remember. Structural bookkeeping is deliberately not marked.
 */
export function toEntityAttributes(entity: EntityWithAttributes): EntityAttribute[] {
  const { member, generation, team, song, album, event, concert, setlist, mediaItem, organization } =
    entity

  if (member) {
    return compact([
      identity('Stage name', member.stageName),
      identity('Full name', member.fullName),
      identity('Nickname', member.nickname),
      attribute('Status', MEMBER_STATUS_LABELS[member.status]),
      attribute('Born', member.birthDate, true),
      attribute('Birthplace', member.birthPlace, true),
      attribute('Height', member.heightCm ? `${member.heightCm} cm` : null),
      attribute('Blood type', member.bloodType),
      attribute('Zodiac', member.zodiac),
      attribute('Jikoshoukai', member.jikoshoukai, true),
      attribute('Debut', member.debutDate, true),
      attribute('Graduation', member.graduationDate, true),
    ])
  }

  if (generation) {
    return compact([
      identity('Generation number', generation.number),
      attribute('Audition opened', generation.auditionOpenedAt, true),
      attribute('Announced', generation.announcedAt, true),
      attribute('Debuted', generation.debutedAt, true),
      attribute('Initial members', generation.initialMemberCount, true),
    ])
  }

  if (team) {
    return compact([
      identity('Team code', team.code),
      attribute('Formed', team.formedAt, true),
      attribute('Disbanded', team.disbandedAt, true),
      attribute('Catchphrase', team.catchphrase, true),
    ])
  }

  if (song) {
    return compact([
      identity('Title', song.title),
      identity('Original title', song.originalTitle),
      attribute('Song type', SONG_TYPE_LABELS[song.songType]),
      attribute('Released', song.releasedAt, true),
      attribute(
        'Duration',
        song.durationSec
          ? `${Math.floor(song.durationSec / 60)}:${String(song.durationSec % 60).padStart(2, '0')}`
          : null,
      ),
      attribute('Adaptation', song.isAdaptation ? 'Yes' : 'No'),
      attribute('Original artist', song.originalArtist, true),
      attribute('Lyricist', song.lyricist),
      attribute('Composer', song.composer),
    ])
  }

  if (album) {
    return compact([
      identity('Title', album.title),
      attribute('Release type', ALBUM_TYPE_LABELS[album.albumType]),
      attribute('Released', album.releasedAt, true),
      attribute('Catalogue number', album.catalogNumber),
      attribute('Tracks', album.trackCount),
      attribute('Label', album.label),
    ])
  }

  if (event) {
    return compact([
      identity('Title', event.title),
      attribute('Event type', EVENT_TYPE_LABELS[event.eventType]),
      attribute('Start', event.startDate, true),
      attribute('End', event.endDate),
      attribute('Venue', event.venue, true),
      attribute('City', event.city),
      attribute('Country', event.country),
    ])
  }

  if (concert) {
    return compact([
      identity('Title', concert.title),
      attribute('Tour', concert.tourName, true),
      attribute('Held', concert.heldAt, true),
      attribute('Venue', concert.venue, true),
      attribute('City', concert.city),
      attribute('Attendance', concert.attendance),
      attribute('Streamed', concert.isStreamed ? 'Yes' : 'No'),
    ])
  }

  if (setlist) {
    return compact([
      identity('Stage', setlist.stageName),
      attribute('Revision', setlist.revision, true),
      attribute('Premiered', setlist.premieredAt, true),
      attribute('Songs', setlist.songCount),
      attribute('Theater', setlist.theater),
    ])
  }

  if (mediaItem) {
    return compact([
      identity('Title', mediaItem.title),
      attribute('Media type', MEDIA_TYPE_LABELS[mediaItem.mediaType]),
      attribute('Released', mediaItem.releasedAt, true),
      attribute('Network', mediaItem.network, true),
      attribute('Publisher', mediaItem.publisher),
    ])
  }

  if (organization) {
    return compact([
      identity('Name', organization.name),
      attribute('Organization type', ORGANIZATION_TYPE_LABELS[organization.orgType]),
      attribute('Country', organization.country),
      attribute('Founded', organization.foundedAt, true),
    ])
  }

  return []
}

export function toEntityDetail(entity: EntityWithAttributes, edges: GraphEdge[]): EntityDetail {
  return {
    ...toEntityRef(entity),
    aliases: entity.aliases,
    description: entity.description,
    activeFrom: entity.activeFrom,
    activeTo: entity.activeTo,
    prominence: entity.prominence,
    isPublished: entity.isPublished,
    notes: entity.notes,
    attributes: toEntityAttributes(entity),
    sections: groupEdgesIntoSections(edges),
    source: toSourceRef(entity.provenance),
    updatedAt: entity.updatedAt,
  }
}

export function sourceTypeLabel(type: Source['sourceType']): string {
  return SOURCE_TYPE_LABELS[type]
}
