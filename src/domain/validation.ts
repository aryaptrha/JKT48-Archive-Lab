import { z } from 'zod'

import {
  AlbumType,
  AnswerMode,
  Difficulty,
  EntityType,
  EventType,
  GameType,
  IssueStatus,
  MasteryDimension,
  MasteryScope,
  MediaType,
  MemberStatus,
  OrganizationType,
  QuestionStrategy,
  SongType,
  SourceType,
  UserRole,
} from '@/generated/prisma/enums'
import { toDateOnly } from '@/lib/date'

import type { AttributeTable } from './entity-taxonomy'

/**
 * Input validation (PRD §35: "Server-side validation for admin mutations").
 *
 * These schemas are the single definition of what a valid record looks like, and
 * they live in the domain layer for one reason: the same shape has to be enforced
 * by a Server Action handling a form post and by a Route Handler handling JSON.
 * Two copies of these rules would eventually disagree, and the disagreement would
 * be a way into the database.
 *
 * Client-side validation is a convenience layer on top of these, never a
 * replacement — no mutation trusts anything that was not parsed here on the
 * server.
 *
 * Every schema coerces before it validates, because HTML forms submit strings:
 * empty text becomes null rather than `''`, `YYYY-MM-DD` becomes a UTC-midnight
 * date, and numeric fields arrive as strings.
 */

/* -------------------------------------------------------------------------- */
/* Primitives                                                                 */
/* -------------------------------------------------------------------------- */

/** Trimmed text, required. */
const text = (max = 400) => z.string().trim().min(1, 'Required').max(max)

/** Trimmed text where empty means "not recorded", never an empty string. */
const optionalText = (max = 400) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      const trimmed = typeof value === 'string' ? value.trim() : ''
      return trimmed.length > 0 ? trimmed : null
    })
    .refine((value) => value === null || value.length <= max, `Must be ${max} characters or fewer`)

const optionalUrl = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === 'string' && value.trim().length > 0 ? value.trim() : null))
  .refine(
    (value) => value === null || z.url().safeParse(value).success,
    'Must be a valid URL',
  )

/**
 * A `@db.Date` column. Anything unparseable becomes null rather than throwing:
 * a half-typed date in an admin form should not lose the rest of the edit.
 */
export const dateOnlySchema = z
  .union([z.string(), z.date(), z.number(), z.null(), z.undefined()])
  .transform((value) => toDateOnly(value) ?? null)

const dateOnly = dateOnlySchema

const requiredDate = z
  .union([z.string(), z.date(), z.number()])
  .transform((value) => toDateOnly(value))
  .refine((value): value is Date => value instanceof Date, 'A valid date is required')

const optionalInt = (min = 0, max = 100_000) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined || value === '') return null
      const parsed = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(parsed) ? Math.trunc(parsed) : null
    })
    .refine((value) => value === null || (value >= min && value <= max), `Must be ${min}–${max}`)

const int = (min: number, max: number, fallback: number) =>
  z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((value) => {
      if (value === null || value === undefined || value === '') return fallback
      const parsed = typeof value === 'number' ? value : Number(value)
      return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback
    })
    .refine((value) => value >= min && value <= max, `Must be ${min}–${max}`)

const bool = z
  .union([z.boolean(), z.string(), z.null(), z.undefined()])
  .transform((value) => {
    if (typeof value === 'boolean') return value
    if (typeof value !== 'string') return false
    // Checkbox posts arrive as "on"; JSON clients send "true".
    return ['true', 'on', '1', 'yes'].includes(value.toLowerCase())
  })

/** Aliases accept a comma-separated string (forms) or an array (JSON). */
const aliasList = z
  .union([z.string(), z.array(z.string()), z.null(), z.undefined()])
  .transform((value) => {
    const parts = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
    const cleaned = parts.map((part) => part.trim()).filter((part) => part.length > 0)
    return [...new Set(cleaned)].slice(0, 40)
  })

const hexColor = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === 'string' && value.trim() ? value.trim() : null))
  .refine(
    (value) => value === null || /^#[0-9a-fA-F]{6}$/.test(value),
    'Use a six-digit hex colour, e.g. #B2242C',
  )

const slug = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : null))
  .refine(
    (value) => value === null || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value),
    'Use lowercase words separated by single hyphens',
  )

/* -------------------------------------------------------------------------- */
/* Entities                                                                   */
/* -------------------------------------------------------------------------- */

/**
 * The base entity record.
 *
 * Note what is absent: there is no `teamId`, `generationId` or any other foreign
 * key to another entity. Those are relationships, created separately (PRD §10).
 * An admin form that offered "generation" as a dropdown on the member record
 * would be re-introducing exactly the schema the PRD rules out.
 */
export const entityInputSchema = z.object({
  entityType: z.enum(EntityType),
  canonicalName: text(200),
  slug: slug,
  aliases: aliasList,
  summary: optionalText(320),
  description: optionalText(8000),
  imageUrl: optionalUrl,
  activeFrom: dateOnly,
  activeTo: dateOnly,
  prominence: int(0, 100, 50),
  isPublished: bool,
  provenanceId: optionalText(64),
  notes: optionalText(2000),
  /** Type-specific fields, validated against the schema for the entity's table. */
  attributes: z.record(z.string(), z.unknown()).optional(),
})

export type EntityInput = z.infer<typeof entityInputSchema>

export const memberAttributesSchema = z.object({
  stageName: text(120),
  fullName: optionalText(200),
  nickname: optionalText(80),
  status: z.enum(MemberStatus),
  birthDate: dateOnly,
  birthPlace: optionalText(160),
  heightCm: optionalInt(100, 220),
  bloodType: optionalText(8),
  zodiac: optionalText(40),
  jikoshoukai: optionalText(400),
  debutDate: dateOnly,
  graduationDate: dateOnly,
})

export const generationAttributesSchema = z.object({
  number: int(1, 200, 1),
  auditionOpenedAt: dateOnly,
  announcedAt: dateOnly,
  debutedAt: dateOnly,
  initialMemberCount: optionalInt(0, 500),
})

export const teamAttributesSchema = z.object({
  code: text(24),
  formedAt: dateOnly,
  disbandedAt: dateOnly,
  colorHex: hexColor,
  catchphrase: optionalText(300),
})

export const songAttributesSchema = z.object({
  title: text(200),
  originalTitle: optionalText(200),
  songType: z.enum(SongType),
  releasedAt: dateOnly,
  durationSec: optionalInt(1, 3600),
  isAdaptation: bool,
  originalArtist: optionalText(160),
  lyricist: optionalText(160),
  composer: optionalText(160),
})

export const albumAttributesSchema = z.object({
  title: text(200),
  albumType: z.enum(AlbumType),
  releasedAt: dateOnly,
  catalogNumber: optionalText(80),
  trackCount: optionalInt(1, 200),
  label: optionalText(160),
})

export const eventAttributesSchema = z.object({
  title: text(200),
  eventType: z.enum(EventType),
  startDate: dateOnly,
  endDate: dateOnly,
  venue: optionalText(200),
  city: optionalText(120),
  country: optionalText(120),
})

export const concertAttributesSchema = z.object({
  title: text(200),
  tourName: optionalText(200),
  heldAt: dateOnly,
  venue: optionalText(200),
  city: optionalText(120),
  attendance: optionalInt(0, 500_000),
  isStreamed: bool,
})

export const setlistAttributesSchema = z.object({
  stageName: text(200),
  revision: optionalText(80),
  premieredAt: dateOnly,
  songCount: optionalInt(1, 100),
  theater: optionalText(160),
})

export const mediaAttributesSchema = z.object({
  title: text(200),
  mediaType: z.enum(MediaType),
  releasedAt: dateOnly,
  network: optionalText(160),
  publisher: optionalText(160),
  externalUrl: optionalUrl,
})

export const organizationAttributesSchema = z.object({
  name: text(200),
  orgType: z.enum(OrganizationType),
  country: optionalText(120),
  foundedAt: dateOnly,
  website: optionalUrl,
})

/**
 * The attribute schema for a specialized table.
 *
 * Returned by table rather than by entity type because several types share a
 * table — every event-ish type writes to `events`. The mapping from type to
 * table lives in the taxonomy, so this stays a lookup.
 */
export const ATTRIBUTE_SCHEMAS = {
  member: memberAttributesSchema,
  generation: generationAttributesSchema,
  team: teamAttributesSchema,
  song: songAttributesSchema,
  album: albumAttributesSchema,
  event: eventAttributesSchema,
  concert: concertAttributesSchema,
  setlist: setlistAttributesSchema,
  mediaItem: mediaAttributesSchema,
  organization: organizationAttributesSchema,
} as const satisfies Record<AttributeTable, z.ZodType>

export function attributeSchemaFor(table: AttributeTable) {
  return ATTRIBUTE_SCHEMAS[table]
}

/* -------------------------------------------------------------------------- */
/* Relationships                                                              */
/* -------------------------------------------------------------------------- */

/**
 * A relationship is a first-class record with its own form (PRD §10, §19).
 *
 * `validFrom` / `validTo` belong to the edge, not to either endpoint, which is
 * what lets a member's team history be a list of dated edges rather than a
 * column that only remembers the present.
 */
export const relationshipInputSchema = z
  .object({
    sourceEntityId: text(64),
    relationshipTypeId: text(64),
    targetEntityId: text(64),
    validFrom: dateOnly,
    validTo: dateOnly,
    weight: int(1, 100, 1),
    provenanceId: optionalText(64),
    notes: optionalText(2000),
  })
  .refine((value) => value.sourceEntityId !== value.targetEntityId, {
    message: 'A relationship cannot connect an entity to itself',
    path: ['targetEntityId'],
  })
  .refine((value) => !value.validFrom || !value.validTo || value.validTo >= value.validFrom, {
    message: 'The end date cannot be earlier than the start date',
    path: ['validTo'],
  })

export type RelationshipInput = z.infer<typeof relationshipInputSchema>

/** The relationship vocabulary is admin-editable (PRD §19). */
export const relationshipTypeInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Use SCREAMING_SNAKE_CASE, e.g. CENTER_OF'),
  name: text(120),
  inverseName: optionalText(120),
  description: optionalText(2000),
  isDirectional: bool,
  isTemporal: bool,
  allowedSourceTypes: z.array(z.enum(EntityType)).default([]),
  allowedTargetTypes: z.array(z.enum(EntityType)).default([]),
  isQuizzable: bool,
  displayOrder: int(0, 10_000, 100),
  isActive: bool,
})

/* -------------------------------------------------------------------------- */
/* Supporting records                                                         */
/* -------------------------------------------------------------------------- */

export const sourceInputSchema = z.object({
  name: text(240),
  url: optionalUrl,
  sourceType: z.enum(SourceType),
  retrievedAt: dateOnly,
  notes: optionalText(2000),
})

export const eraInputSchema = z.object({
  name: text(160),
  slug: slug.refine((value): value is string => value !== null, 'A slug is required'),
  startDate: requiredDate,
  endDate: dateOnly,
  description: optionalText(2000),
  displayOrder: int(0, 10_000, 0),
})

/**
 * Game tuning (PRD §6).
 *
 * Scoring and difficulty live in data so a curator can retune a game without a
 * deploy, which is why point values are editable numbers here rather than
 * constants in the engine. `pointsIncorrect` is allowed to be negative — that is
 * the Connect the Dots penalty.
 */
export const gameDefinitionInputSchema = z.object({
  code: z
    .string()
    .trim()
    .min(3)
    .max(80)
    .regex(/^[A-Z][A-Z0-9_]*$/, 'Use SCREAMING_SNAKE_CASE'),
  gameType: z.enum(GameType),
  difficulty: z.enum(Difficulty),
  name: text(160),
  description: optionalText(2000),
  questionStrategy: z.enum(QuestionStrategy),
  answerMode: z.enum(AnswerMode),
  targetEntityType: z.enum(EntityType),
  clueCount: int(0, 12, 1),
  optionCount: int(2, 8, 4),
  hopCount: int(1, 5, 1),
  roundCount: int(1, 50, 5),
  timeLimitSec: optionalInt(0, 3600),
  pointsCorrect: int(0, 1000, 10),
  pointsRelationshipCorrect: int(0, 1000, 20),
  pointsIncorrect: int(-1000, 0, -5),
  isActive: bool,
  displayOrder: int(0, 10_000, 100),
  /**
   * Which edges the generator may use.
   *
   * Required types gate subject selection — a Mystery Member round is impossible
   * for a member with no team history — while enriching types only supply extra
   * clues. A type named in both lists is treated as required.
   */
  requiredRelationshipTypeIds: z.array(z.string().trim().min(1)).default([]),
  enrichingRelationshipTypeIds: z.array(z.string().trim().min(1)).default([]),
  /** Generator-specific knobs; shape belongs to the generator, not to this schema. */
  config: z.unknown().optional(),
})

/**
 * Mastery status bands (PRD §8.3).
 *
 * The band's *name* is data. Nothing in the codebase may branch on it, which is
 * the whole point of it being editable here.
 */
export const masteryStatusInputSchema = z
  .object({
    name: text(80),
    slug: slug.refine((value): value is string => value !== null, 'A slug is required'),
    minScore: int(0, 100, 0),
    maxScore: int(0, 100, 100),
    colorHex: hexColor,
    description: optionalText(500),
    displayOrder: int(0, 1000, 0),
    isActive: bool,
  })
  .refine((value) => value.maxScore >= value.minScore, {
    message: 'The maximum score must be at least the minimum',
    path: ['maxScore'],
  })

export const dimensionWeightInputSchema = z.object({
  scope: z.enum(MasteryScope),
  dimension: z.enum(MasteryDimension),
  weight: int(0, 100, 1),
})

export const settingInputSchema = z.object({
  key: text(120),
  value: z.unknown(),
  group: optionalText(80),
  description: optionalText(500),
})

export const userRoleInputSchema = z.object({
  userId: text(64),
  role: z.enum(UserRole),
})

export const issueStatusInputSchema = z.object({
  issueId: text(64),
  status: z.enum(IssueStatus),
  reason: optionalText(500),
})

/* -------------------------------------------------------------------------- */
/* Errors                                                                     */
/* -------------------------------------------------------------------------- */

export type FieldErrors = Record<string, string[]>

/** Flatten a Zod error into something a form can render field by field. */
export function toFieldErrors(error: z.ZodError): FieldErrors {
  const errors: FieldErrors = {}

  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.map(String).join('.') : '_form'
    const list = errors[key]
    if (list) list.push(issue.message)
    else errors[key] = [issue.message]
  }

  return errors
}
