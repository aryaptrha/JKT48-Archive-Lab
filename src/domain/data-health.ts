import { IssueSeverity } from '@/generated/prisma/enums'

/**
 * Data health checks (PRD §16).
 *
 * The archive is only as good as its consistency, and the game engine amplifies
 * bad data into wrong questions. Each check has a stable code so an issue can be
 * ignored, resolved, and re-detected across runs without duplicating rows.
 */

export const CHECK = {
  ENTITY_MISSING_SPECIALIZED_ROW: 'ENTITY_MISSING_SPECIALIZED_ROW',
  ENTITY_MISSING_SUMMARY: 'ENTITY_MISSING_SUMMARY',
  ENTITY_MISSING_PROVENANCE: 'ENTITY_MISSING_PROVENANCE',
  ENTITY_ORPHANED: 'ENTITY_ORPHANED',
  ENTITY_DUPLICATE_NAME: 'ENTITY_DUPLICATE_NAME',
  MEMBER_MISSING_GENERATION: 'MEMBER_MISSING_GENERATION',
  MEMBER_NO_TEAM_HISTORY: 'MEMBER_NO_TEAM_HISTORY',
  RELATIONSHIP_MISSING_VALID_FROM: 'RELATIONSHIP_MISSING_VALID_FROM',
  RELATIONSHIP_INVERTED_DATES: 'RELATIONSHIP_INVERTED_DATES',
  RELATIONSHIP_TYPE_VIOLATION: 'RELATIONSHIP_TYPE_VIOLATION',
  RELATIONSHIP_OVERLAPPING_EXCLUSIVE: 'RELATIONSHIP_OVERLAPPING_EXCLUSIVE',
  RELATIONSHIP_MISSING_PROVENANCE: 'RELATIONSHIP_MISSING_PROVENANCE',
  SONG_NO_CENTER: 'SONG_NO_CENTER',
  QUIZZABLE_COVERAGE_LOW: 'QUIZZABLE_COVERAGE_LOW',
} as const

export type CheckCode = (typeof CHECK)[keyof typeof CHECK]

export type CheckDefinition = {
  code: CheckCode
  label: string
  /** Why this matters — shown in the admin health report. */
  rationale: string
  severity: IssueSeverity
  /** True when the check can meaningfully block a game from generating. */
  affectsGameQuality: boolean
}

export const CHECK_DEFINITIONS: Record<CheckCode, CheckDefinition> = {
  [CHECK.ENTITY_MISSING_SPECIALIZED_ROW]: {
    code: CHECK.ENTITY_MISSING_SPECIALIZED_ROW,
    label: 'Entity has no specialized attribute row',
    rationale:
      'A MEMBER without a member row cannot show a profile, and Memory Reconstruction has nothing to redact.',
    severity: IssueSeverity.ERROR,
    affectsGameQuality: true,
  },
  [CHECK.ENTITY_MISSING_SUMMARY]: {
    code: CHECK.ENTITY_MISSING_SUMMARY,
    label: 'Entity has no summary',
    rationale: 'List views fall back to a bare name, which reads as an incomplete archive.',
    severity: IssueSeverity.INFO,
    affectsGameQuality: false,
  },
  [CHECK.ENTITY_MISSING_PROVENANCE]: {
    code: CHECK.ENTITY_MISSING_PROVENANCE,
    label: 'Entity has no source',
    rationale: 'Unsourced records cannot be defended when a fan disputes them (PRD §13).',
    severity: IssueSeverity.WARNING,
    affectsGameQuality: false,
  },
  [CHECK.ENTITY_ORPHANED]: {
    code: CHECK.ENTITY_ORPHANED,
    label: 'Entity has no relationships',
    rationale:
      'An entity with no edges is invisible to the graph and unusable by every game. This is the single most common cause of thin question pools.',
    severity: IssueSeverity.WARNING,
    affectsGameQuality: true,
  },
  [CHECK.ENTITY_DUPLICATE_NAME]: {
    code: CHECK.ENTITY_DUPLICATE_NAME,
    label: 'Duplicate canonical name within a type',
    rationale:
      'Two members with the same name make free-text answers ambiguous and split their histories.',
    severity: IssueSeverity.WARNING,
    affectsGameQuality: true,
  },
  [CHECK.MEMBER_MISSING_GENERATION]: {
    code: CHECK.MEMBER_MISSING_GENERATION,
    label: 'Member has no generation',
    rationale:
      'V1 mastery is scoped per generation, so a member without one can never be attributed.',
    severity: IssueSeverity.ERROR,
    affectsGameQuality: true,
  },
  [CHECK.MEMBER_NO_TEAM_HISTORY]: {
    code: CHECK.MEMBER_NO_TEAM_HISTORY,
    label: 'Member has no team history',
    rationale: 'The Time Machine cannot place this member on any roster at any date.',
    severity: IssueSeverity.WARNING,
    affectsGameQuality: true,
  },
  [CHECK.RELATIONSHIP_MISSING_VALID_FROM]: {
    code: CHECK.RELATIONSHIP_MISSING_VALID_FROM,
    label: 'Temporal relationship has no start date',
    rationale:
      'Without validFrom the edge is true at every date, which silently corrupts every Time Machine snapshot.',
    severity: IssueSeverity.ERROR,
    affectsGameQuality: true,
  },
  [CHECK.RELATIONSHIP_INVERTED_DATES]: {
    code: CHECK.RELATIONSHIP_INVERTED_DATES,
    label: 'Relationship ends before it starts',
    rationale: 'validTo earlier than validFrom means the edge is valid on no date at all.',
    severity: IssueSeverity.ERROR,
    affectsGameQuality: true,
  },
  [CHECK.RELATIONSHIP_TYPE_VIOLATION]: {
    code: CHECK.RELATIONSHIP_TYPE_VIOLATION,
    label: 'Endpoint type not allowed by the relationship type',
    rationale:
      'A CENTER_OF pointing at an event rather than a song produces nonsense clues in Mystery Member.',
    severity: IssueSeverity.ERROR,
    affectsGameQuality: true,
  },
  [CHECK.RELATIONSHIP_OVERLAPPING_EXCLUSIVE]: {
    code: CHECK.RELATIONSHIP_OVERLAPPING_EXCLUSIVE,
    label: 'Overlapping exclusive memberships',
    rationale:
      'Two concurrent MEMBER_OF edges for one member make "which team on this date" unanswerable.',
    severity: IssueSeverity.WARNING,
    affectsGameQuality: true,
  },
  [CHECK.RELATIONSHIP_MISSING_PROVENANCE]: {
    code: CHECK.RELATIONSHIP_MISSING_PROVENANCE,
    label: 'Relationship has no source',
    rationale: 'Relationships are the claims most likely to be challenged (PRD §13).',
    severity: IssueSeverity.INFO,
    affectsGameQuality: false,
  },
  [CHECK.SONG_NO_CENTER]: {
    code: CHECK.SONG_NO_CENTER,
    label: 'Song has no center',
    rationale: 'Center relationships carry a large share of the HARD and EXPERT question pool.',
    severity: IssueSeverity.INFO,
    affectsGameQuality: true,
  },
  [CHECK.QUIZZABLE_COVERAGE_LOW]: {
    code: CHECK.QUIZZABLE_COVERAGE_LOW,
    label: 'Too few quizzable subjects for a difficulty',
    rationale:
      'The generator needs enough eligible subjects to avoid repeating the same question. Below the threshold, that difficulty should be hidden rather than shipped thin.',
    severity: IssueSeverity.WARNING,
    affectsGameQuality: true,
  },
}

/**
 * Minimum eligible subjects before a difficulty is considered playable.
 * Below this, the games index marks the rung as needing more data instead of
 * serving repeats.
 */
export const MIN_SUBJECTS_PER_DIFFICULTY = 8

export const SEVERITY_ORDER: Record<IssueSeverity, number> = {
  [IssueSeverity.ERROR]: 0,
  [IssueSeverity.WARNING]: 1,
  [IssueSeverity.INFO]: 2,
}

export function checkDefinition(code: string): CheckDefinition | undefined {
  return CHECK_DEFINITIONS[code as CheckCode]
}
