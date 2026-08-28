import {
  ALBUM_TYPE_LABELS,
  EVENT_TYPE_LABELS,
  MEDIA_TYPE_LABELS,
  MEMBER_STATUS_LABELS,
  ORGANIZATION_TYPE_LABELS,
  SONG_TYPE_LABELS,
} from './labels'

import type { AttributeTable } from './entity-taxonomy'

/**
 * How the type-specific half of the entity editor is laid out (PRD §25, §27).
 *
 * The base entity form is the same for all twenty-four types. The rest — a
 * member's blood type, a song's composer, a concert's attendance — is one table
 * per specialized row, and describing those fields as data means the editor is one
 * component instead of ten near-identical ones, and adding a column is a row here
 * rather than a new block of JSX.
 *
 * This is presentation metadata only. It says nothing about what is valid: that
 * lives in `validation.ts`, is enforced on the server, and stays authoritative
 * even when a client posts a field this file has never heard of. `required` here
 * only asks the browser to help; the schema is what refuses the write.
 *
 * Note what is absent, for every type: no generation, no team, no "center of". A
 * member's generation is a `BELONGS_TO_GENERATION` edge with a validity window,
 * not a column on the member row (§10, §11) — and an admin form is the easiest
 * place for that foreign key to creep back in.
 */

export type AttributeFieldKind =
  | 'text'
  | 'textarea'
  | 'date'
  | 'url'
  | 'number'
  | 'color'
  | 'select'
  | 'checkbox'

export type AttributeField = {
  /** Posted as `attributes.<name>`, matching the key its schema expects. */
  name: string
  label: string
  kind: AttributeFieldKind
  required?: boolean
  hint?: string
  options?: readonly { value: string; label: string }[]
  min?: number
  max?: number
  /** Spans both columns of the editor grid. */
  wide?: boolean
}

function options<T extends string>(labels: Record<T, string>): { value: T; label: string }[] {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }))
}

const MEMBER_FIELDS: readonly AttributeField[] = [
  {
    name: 'stageName',
    label: 'Stage name',
    kind: 'text',
    required: true,
    hint: 'The name used on stage, which is often not the canonical record name.',
  },
  {
    name: 'status',
    label: 'Status',
    kind: 'select',
    required: true,
    options: options(MEMBER_STATUS_LABELS),
  },
  { name: 'fullName', label: 'Full name', kind: 'text' },
  { name: 'nickname', label: 'Nickname', kind: 'text' },
  { name: 'birthDate', label: 'Born', kind: 'date' },
  { name: 'birthPlace', label: 'Birthplace', kind: 'text' },
  { name: 'heightCm', label: 'Height (cm)', kind: 'number', min: 100, max: 220 },
  { name: 'bloodType', label: 'Blood type', kind: 'text' },
  { name: 'zodiac', label: 'Zodiac', kind: 'text' },
  {
    name: 'debutDate',
    label: 'Debut',
    kind: 'date',
    hint: 'First appearance as a member. Team history is recorded as relationships.',
  },
  {
    name: 'graduationDate',
    label: 'Graduation',
    kind: 'date',
    hint: 'Leave empty while active. A GRADUATED_AT edge carries the ceremony itself.',
  },
  { name: 'jikoshoukai', label: 'Jikoshoukai', kind: 'textarea', wide: true },
]

const GENERATION_FIELDS: readonly AttributeField[] = [
  { name: 'number', label: 'Generation number', kind: 'number', required: true, min: 1, max: 200 },
  { name: 'initialMemberCount', label: 'Members at debut', kind: 'number', min: 0, max: 500 },
  { name: 'auditionOpenedAt', label: 'Audition opened', kind: 'date' },
  { name: 'announcedAt', label: 'Announced', kind: 'date' },
  {
    name: 'debutedAt',
    label: 'Debuted',
    kind: 'date',
    hint: 'When the generation was introduced, not when each member joined a team.',
  },
]

const TEAM_FIELDS: readonly AttributeField[] = [
  {
    name: 'code',
    label: 'Team code',
    kind: 'text',
    required: true,
    hint: 'Short form, e.g. J, KIII, T.',
  },
  { name: 'colorHex', label: 'Team colour', kind: 'color', hint: 'Six-digit hex, e.g. #B2242C.' },
  { name: 'formedAt', label: 'Formed', kind: 'date' },
  {
    name: 'disbandedAt',
    label: 'Disbanded',
    kind: 'date',
    hint: 'Leave empty while the team exists. Rosters are MEMBER_OF edges, not fields here.',
  },
  { name: 'catchphrase', label: 'Catchphrase', kind: 'textarea', wide: true },
]

const SONG_FIELDS: readonly AttributeField[] = [
  { name: 'title', label: 'Title', kind: 'text', required: true },
  {
    name: 'songType',
    label: 'Song type',
    kind: 'select',
    required: true,
    options: options(SONG_TYPE_LABELS),
  },
  {
    name: 'originalTitle',
    label: 'Original title',
    kind: 'text',
    hint: 'The Japanese title, where the song is an adaptation.',
  },
  { name: 'releasedAt', label: 'Released', kind: 'date' },
  { name: 'durationSec', label: 'Duration (seconds)', kind: 'number', min: 1, max: 3600 },
  {
    name: 'isAdaptation',
    label: 'Adapted from an AKB48-group original',
    kind: 'checkbox',
    hint: 'Distinguishes a translated cover from an original JKT48 composition.',
  },
  { name: 'originalArtist', label: 'Original artist', kind: 'text' },
  { name: 'lyricist', label: 'Lyricist', kind: 'text' },
  { name: 'composer', label: 'Composer', kind: 'text' },
]

const ALBUM_FIELDS: readonly AttributeField[] = [
  { name: 'title', label: 'Title', kind: 'text', required: true },
  {
    name: 'albumType',
    label: 'Release type',
    kind: 'select',
    required: true,
    options: options(ALBUM_TYPE_LABELS),
  },
  { name: 'releasedAt', label: 'Released', kind: 'date' },
  { name: 'catalogNumber', label: 'Catalogue number', kind: 'text' },
  { name: 'trackCount', label: 'Tracks', kind: 'number', min: 1, max: 200 },
  { name: 'label', label: 'Label', kind: 'text' },
]

const EVENT_FIELDS: readonly AttributeField[] = [
  { name: 'title', label: 'Title', kind: 'text', required: true },
  {
    name: 'eventType',
    label: 'Event type',
    kind: 'select',
    required: true,
    options: options(EVENT_TYPE_LABELS),
  },
  { name: 'startDate', label: 'Start', kind: 'date' },
  { name: 'endDate', label: 'End', kind: 'date', hint: 'Leave empty for a single-day event.' },
  { name: 'venue', label: 'Venue', kind: 'text' },
  { name: 'city', label: 'City', kind: 'text' },
  { name: 'country', label: 'Country', kind: 'text' },
]

const CONCERT_FIELDS: readonly AttributeField[] = [
  { name: 'title', label: 'Title', kind: 'text', required: true },
  { name: 'tourName', label: 'Tour', kind: 'text' },
  { name: 'heldAt', label: 'Held', kind: 'date' },
  { name: 'venue', label: 'Venue', kind: 'text' },
  { name: 'city', label: 'City', kind: 'text' },
  { name: 'attendance', label: 'Attendance', kind: 'number', min: 0, max: 500000 },
  { name: 'isStreamed', label: 'Streamed', kind: 'checkbox' },
]

const SETLIST_FIELDS: readonly AttributeField[] = [
  {
    name: 'stageName',
    label: 'Stage name',
    kind: 'text',
    required: true,
    hint: 'e.g. Pajama Drive, Renai Kinshi Jourei.',
  },
  {
    name: 'revision',
    label: 'Revision',
    kind: 'text',
    hint: 'Where the same stage has been re-staged with changes.',
  },
  { name: 'premieredAt', label: 'Premiered', kind: 'date' },
  { name: 'songCount', label: 'Songs', kind: 'number', min: 1, max: 100 },
  { name: 'theater', label: 'Theatre', kind: 'text' },
]

const MEDIA_FIELDS: readonly AttributeField[] = [
  { name: 'title', label: 'Title', kind: 'text', required: true },
  {
    name: 'mediaType',
    label: 'Media type',
    kind: 'select',
    required: true,
    options: options(MEDIA_TYPE_LABELS),
  },
  { name: 'releasedAt', label: 'Released', kind: 'date' },
  { name: 'network', label: 'Network', kind: 'text' },
  { name: 'publisher', label: 'Publisher', kind: 'text' },
  { name: 'externalUrl', label: 'External URL', kind: 'url', wide: true },
]

const ORGANIZATION_FIELDS: readonly AttributeField[] = [
  { name: 'name', label: 'Name', kind: 'text', required: true },
  {
    name: 'orgType',
    label: 'Organization type',
    kind: 'select',
    required: true,
    options: options(ORGANIZATION_TYPE_LABELS),
  },
  { name: 'country', label: 'Country', kind: 'text' },
  { name: 'foundedAt', label: 'Founded', kind: 'date' },
  { name: 'website', label: 'Website', kind: 'url', wide: true },
]

export const ATTRIBUTE_FIELDS = {
  member: MEMBER_FIELDS,
  generation: GENERATION_FIELDS,
  team: TEAM_FIELDS,
  song: SONG_FIELDS,
  album: ALBUM_FIELDS,
  event: EVENT_FIELDS,
  concert: CONCERT_FIELDS,
  setlist: SETLIST_FIELDS,
  mediaItem: MEDIA_FIELDS,
  organization: ORGANIZATION_FIELDS,
} as const satisfies Record<AttributeTable, readonly AttributeField[]>

export function attributeFieldsFor(table: AttributeTable): readonly AttributeField[] {
  return ATTRIBUTE_FIELDS[table]
}

/** What the specialized half of the form is called, in a heading. */
export const ATTRIBUTE_TABLE_LABELS: Record<AttributeTable, string> = {
  member: 'Member details',
  generation: 'Generation details',
  team: 'Team details',
  song: 'Song details',
  album: 'Release details',
  event: 'Event details',
  concert: 'Concert details',
  setlist: 'Setlist details',
  mediaItem: 'Media details',
  organization: 'Organization details',
}
