import { EntityType } from '@/generated/prisma/enums'

/**
 * The relationship vocabulary (PRD §10).
 *
 * Codes are stable identifiers that application code may reference. The rows
 * themselves live in the database and are admin-editable, so this file is the
 * *seed* and the *typed constant set* — not a hard-coded schema.
 *
 * Never model these as foreign keys on a specialized table. A member's team is
 * a temporal relationship, not a column.
 */

export const REL = {
  BELONGS_TO_GENERATION: 'BELONGS_TO_GENERATION',
  MEMBER_OF: 'MEMBER_OF',
  CAPTAIN_OF: 'CAPTAIN_OF',
  CENTER_OF: 'CENTER_OF',
  SENBATSU_IN: 'SENBATSU_IN',
  PERFORMED_IN: 'PERFORMED_IN',
  PARTICIPATED_IN: 'PARTICIPATED_IN',
  GRADUATED_AT: 'GRADUATED_AT',
  DEBUTED_AT: 'DEBUTED_AT',
  RANKED_IN: 'RANKED_IN',
  APPEARED_IN: 'APPEARED_IN',
  TRACK_ON: 'TRACK_ON',
  TITLE_TRACK_OF: 'TITLE_TRACK_OF',
  IN_SETLIST: 'IN_SETLIST',
  ADAPTED_FROM_GROUP: 'ADAPTED_FROM_GROUP',
  PART_OF: 'PART_OF',
  SUCCEEDED_BY: 'SUCCEEDED_BY',
  FORMED_AT: 'FORMED_AT',
  DISBANDED_AT: 'DISBANDED_AT',
  SISTER_GROUP_OF: 'SISTER_GROUP_OF',
  MANAGED_BY: 'MANAGED_BY',
} as const

export type RelationshipCode = (typeof REL)[keyof typeof REL]

export type RelationshipTypeSeed = {
  code: RelationshipCode
  name: string
  inverseName: string
  description: string
  isDirectional: boolean
  /** Participates in Time Machine snapshots and carries validFrom/validTo. */
  isTemporal: boolean
  allowedSourceTypes: EntityType[]
  allowedTargetTypes: EntityType[]
  /** May be turned into a clue or a question by the game engine. */
  isQuizzable: boolean
  displayOrder: number
}

export const RELATIONSHIP_TYPE_SEEDS: RelationshipTypeSeed[] = [
  {
    code: REL.BELONGS_TO_GENERATION,
    name: 'belongs to generation',
    inverseName: 'has member',
    description:
      'Permanent cohort membership. A member never changes generation, which makes it the anchor for V1 mastery scoping.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.MEMBER],
    allowedTargetTypes: [EntityType.GENERATION],
    isQuizzable: true,
    displayOrder: 10,
  },
  {
    code: REL.MEMBER_OF,
    name: 'member of',
    inverseName: 'roster includes',
    description:
      'Team membership over a time window. A member may hold several of these across their career.',
    isDirectional: true,
    isTemporal: true,
    allowedSourceTypes: [EntityType.MEMBER],
    allowedTargetTypes: [EntityType.TEAM, EntityType.SUBUNIT, EntityType.UNIT],
    isQuizzable: true,
    displayOrder: 20,
  },
  {
    code: REL.CAPTAIN_OF,
    name: 'captain of',
    inverseName: 'captained by',
    description: 'Team captaincy over a time window.',
    isDirectional: true,
    isTemporal: true,
    allowedSourceTypes: [EntityType.MEMBER],
    allowedTargetTypes: [EntityType.TEAM],
    isQuizzable: true,
    displayOrder: 30,
  },
  {
    code: REL.CENTER_OF,
    name: 'center of',
    inverseName: 'centered by',
    description: 'Held the center position for a song.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.MEMBER],
    allowedTargetTypes: [EntityType.SONG],
    isQuizzable: true,
    displayOrder: 40,
  },
  {
    code: REL.SENBATSU_IN,
    name: 'senbatsu in',
    inverseName: 'senbatsu lineup',
    description: 'Part of the selected lineup that performed or recorded a song.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.MEMBER],
    allowedTargetTypes: [EntityType.SONG],
    isQuizzable: true,
    displayOrder: 50,
  },
  {
    code: REL.PERFORMED_IN,
    name: 'performed in',
    inverseName: 'performed by',
    description: 'Appeared as a performer at a concert or theater performance.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.MEMBER],
    allowedTargetTypes: [EntityType.CONCERT, EntityType.THEATER_PERFORMANCE],
    isQuizzable: true,
    displayOrder: 60,
  },
  {
    code: REL.PARTICIPATED_IN,
    name: 'participated in',
    inverseName: 'participants',
    description: 'Took part in an event: an election, an audition, an anniversary.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.MEMBER],
    allowedTargetTypes: [
      EntityType.MAJOR_EVENT,
      EntityType.ELECTION,
      EntityType.AUDITION,
      EntityType.FORMATION,
    ],
    isQuizzable: true,
    displayOrder: 70,
  },
  {
    code: REL.GRADUATED_AT,
    name: 'graduated at',
    inverseName: 'graduating member',
    description: 'The event at which a member graduated from the group.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.MEMBER],
    allowedTargetTypes: [EntityType.GRADUATION, EntityType.MAJOR_EVENT, EntityType.CONCERT],
    isQuizzable: true,
    displayOrder: 80,
  },
  {
    code: REL.DEBUTED_AT,
    name: 'debuted at',
    inverseName: 'debuting member',
    description: 'The event at which a member first appeared with the group.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.MEMBER],
    allowedTargetTypes: [EntityType.MAJOR_EVENT, EntityType.FORMATION, EntityType.CONCERT],
    isQuizzable: true,
    displayOrder: 90,
  },
  {
    code: REL.RANKED_IN,
    name: 'ranked in',
    inverseName: 'ranking includes',
    description:
      'Placed in a senbatsu election. The position is stored on the relationship notes/metadata.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.MEMBER],
    allowedTargetTypes: [EntityType.ELECTION],
    isQuizzable: true,
    displayOrder: 100,
  },
  {
    code: REL.APPEARED_IN,
    name: 'appeared in',
    inverseName: 'featured',
    description: 'Appeared in a media production: TV, radio, film, drama, photobook.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.MEMBER],
    allowedTargetTypes: [
      EntityType.TV_APPEARANCE,
      EntityType.RADIO,
      EntityType.MOVIE,
      EntityType.DRAMA,
      EntityType.PHOTOBOOK,
    ],
    isQuizzable: true,
    displayOrder: 110,
  },
  {
    code: REL.TRACK_ON,
    name: 'track on',
    inverseName: 'tracklist',
    description: 'A song appears on a release.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.SONG],
    allowedTargetTypes: [EntityType.ALBUM, EntityType.SINGLE],
    isQuizzable: true,
    displayOrder: 120,
  },
  {
    code: REL.TITLE_TRACK_OF,
    name: 'title track of',
    inverseName: 'title track',
    description: 'The lead A-side of a release.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.SONG],
    allowedTargetTypes: [EntityType.ALBUM, EntityType.SINGLE],
    isQuizzable: true,
    displayOrder: 130,
  },
  {
    code: REL.IN_SETLIST,
    name: 'in setlist',
    inverseName: 'setlist songs',
    description: 'A song belongs to a theater stage setlist.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.SONG],
    allowedTargetTypes: [EntityType.SETLIST],
    isQuizzable: true,
    displayOrder: 140,
  },
  {
    code: REL.ADAPTED_FROM_GROUP,
    name: 'adapted from a song by',
    inverseName: 'original material for',
    description: 'The originating group whose song this is an adaptation of.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.SONG],
    allowedTargetTypes: [EntityType.ORGANIZATION, EntityType.GROUP],
    isQuizzable: true,
    displayOrder: 150,
  },
  {
    code: REL.PART_OF,
    name: 'part of',
    inverseName: 'contains',
    description: 'Structural containment: a team is part of the group, a group part of a family.',
    isDirectional: true,
    isTemporal: true,
    allowedSourceTypes: [EntityType.TEAM, EntityType.SUBUNIT, EntityType.GENERATION],
    allowedTargetTypes: [EntityType.GROUP, EntityType.ORGANIZATION],
    isQuizzable: false,
    displayOrder: 160,
  },
  {
    code: REL.SUCCEEDED_BY,
    name: 'succeeded by',
    inverseName: 'preceded by',
    description: 'Chronological succession between generations or setlist revisions.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.GENERATION, EntityType.SETLIST],
    allowedTargetTypes: [EntityType.GENERATION, EntityType.SETLIST],
    isQuizzable: true,
    displayOrder: 170,
  },
  {
    code: REL.FORMED_AT,
    name: 'formed at',
    inverseName: 'formed',
    description: 'The event at which a team or generation came into existence.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.TEAM, EntityType.SUBUNIT, EntityType.GENERATION],
    allowedTargetTypes: [EntityType.FORMATION, EntityType.MAJOR_EVENT, EntityType.AUDITION],
    isQuizzable: true,
    displayOrder: 180,
  },
  {
    code: REL.DISBANDED_AT,
    name: 'disbanded at',
    inverseName: 'disbanded',
    description: 'The event at which a team was dissolved.',
    isDirectional: true,
    isTemporal: false,
    allowedSourceTypes: [EntityType.TEAM, EntityType.SUBUNIT],
    allowedTargetTypes: [EntityType.MAJOR_EVENT, EntityType.CONCERT],
    isQuizzable: true,
    displayOrder: 190,
  },
  {
    code: REL.SISTER_GROUP_OF,
    name: 'sister group of',
    inverseName: 'sister group of',
    description: 'Mutual sister-group relationship inside the 48 family.',
    isDirectional: false,
    isTemporal: false,
    allowedSourceTypes: [EntityType.ORGANIZATION, EntityType.GROUP],
    allowedTargetTypes: [EntityType.ORGANIZATION, EntityType.GROUP],
    isQuizzable: false,
    displayOrder: 200,
  },
  {
    code: REL.MANAGED_BY,
    name: 'managed by',
    inverseName: 'manages',
    description: 'Operating company or management entity.',
    isDirectional: true,
    isTemporal: true,
    allowedSourceTypes: [EntityType.GROUP, EntityType.ORGANIZATION],
    allowedTargetTypes: [EntityType.ORGANIZATION],
    isQuizzable: false,
    displayOrder: 210,
  },
]

/**
 * Relationship groups rendered as sections on an entity detail page
 * (PRD §4.1: TEAM / MUSIC / CENTER / SENBATSU …).
 */
export const RELATIONSHIP_SECTIONS: { label: string; codes: RelationshipCode[] }[] = [
  { label: 'Generation', codes: [REL.BELONGS_TO_GENERATION] },
  { label: 'Teams', codes: [REL.MEMBER_OF, REL.CAPTAIN_OF] },
  { label: 'Music', codes: [REL.CENTER_OF, REL.SENBATSU_IN, REL.TITLE_TRACK_OF, REL.TRACK_ON] },
  { label: 'Setlists', codes: [REL.IN_SETLIST] },
  {
    label: 'Events',
    codes: [
      REL.PARTICIPATED_IN,
      REL.PERFORMED_IN,
      REL.RANKED_IN,
      REL.DEBUTED_AT,
      REL.GRADUATED_AT,
      REL.FORMED_AT,
      REL.DISBANDED_AT,
    ],
  },
  { label: 'Media', codes: [REL.APPEARED_IN] },
  {
    label: 'Structure',
    codes: [
      REL.PART_OF,
      REL.SUCCEEDED_BY,
      REL.SISTER_GROUP_OF,
      REL.MANAGED_BY,
      REL.ADAPTED_FROM_GROUP,
    ],
  },
]
