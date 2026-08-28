import { REL } from '@/domain/relationship-types'
import {
  EntityType,
  GameType,
  MasteryDimension,
  MasteryScope,
  QuestionStrategy,
} from '@/generated/prisma/enums'

import type { GameDefinitionRow } from '../../repositories/game-repository'

import { firstEdgeOfCode, type GraphSlice } from './pool'

/**
 * Mastery attribution (PRD §8.2).
 *
 * Every answered round has to land somewhere in the mastery model, and the
 * mapping is derived rather than configured per definition: the scope comes from
 * the subject's own graph (a member belongs to exactly one generation, which is
 * why V1 scopes by generation at all), and the dimension comes from what the
 * question actually exercises.
 */

export type Attribution = {
  scope: MasteryScope
  targetEntityId: string | null
  dimension: MasteryDimension
}

const DIMENSION_BY_ENTITY_TYPE: Partial<Record<EntityType, MasteryDimension>> = {
  [EntityType.MEMBER]: MasteryDimension.MEMBERS,
  [EntityType.STAFF]: MasteryDimension.MEMBERS,
  [EntityType.TEAM]: MasteryDimension.TEAMS,
  [EntityType.SUBUNIT]: MasteryDimension.TEAMS,
  [EntityType.GENERATION]: MasteryDimension.MEMBERS,
  [EntityType.SONG]: MasteryDimension.SONGS,
  [EntityType.SINGLE]: MasteryDimension.SONGS,
  [EntityType.ALBUM]: MasteryDimension.SONGS,
  [EntityType.SETLIST]: MasteryDimension.SONGS,
  [EntityType.CONCERT]: MasteryDimension.HISTORY,
  [EntityType.THEATER_PERFORMANCE]: MasteryDimension.HISTORY,
  [EntityType.ELECTION]: MasteryDimension.HISTORY,
  [EntityType.AUDITION]: MasteryDimension.HISTORY,
  [EntityType.GRADUATION]: MasteryDimension.HISTORY,
  [EntityType.FORMATION]: MasteryDimension.HISTORY,
  [EntityType.MAJOR_EVENT]: MasteryDimension.HISTORY,
}

const RELATIONSHIP_STRATEGIES: QuestionStrategy[] = [
  QuestionStrategy.RELATIONSHIP,
  QuestionStrategy.INDIRECT_RELATIONSHIP,
  QuestionStrategy.MULTI_HOP,
]

/**
 * Which dimension a round trains.
 *
 * Game type wins where the game *is* the skill — the Time Machine is temporal
 * reasoning whatever it asks about, and Connect the Dots is always about edges.
 * Otherwise the question strategy decides, and only then the subject's type.
 */
export function dimensionFor(definition: GameDefinitionRow): MasteryDimension {
  if (definition.gameType === GameType.TIME_MACHINE_QUIZ) return MasteryDimension.HISTORY
  if (definition.gameType === GameType.CONNECT_THE_DOTS) return MasteryDimension.RELATIONSHIPS

  if (RELATIONSHIP_STRATEGIES.includes(definition.questionStrategy)) {
    return MasteryDimension.RELATIONSHIPS
  }

  return DIMENSION_BY_ENTITY_TYPE[definition.targetEntityType] ?? MasteryDimension.MEMBERS
}

/**
 * Scope a round to the subject's generation when the graph says which one it is.
 *
 * Falls back to GLOBAL rather than skipping attribution, so practice on an
 * un-cohorted entity still counts towards something.
 */
export function attributionFor(
  definition: GameDefinitionRow,
  slice: GraphSlice,
  subjectEntityId: string | null,
): Attribution {
  const dimension = dimensionFor(definition)

  if (!subjectEntityId) {
    return { scope: MasteryScope.GLOBAL, targetEntityId: null, dimension }
  }

  const generationEdge = firstEdgeOfCode(
    slice,
    subjectEntityId,
    REL.BELONGS_TO_GENERATION,
    'OUTGOING',
  )

  if (generationEdge) {
    return {
      scope: MasteryScope.GENERATION,
      targetEntityId: generationEdge.other.id,
      dimension,
    }
  }

  return { scope: MasteryScope.GLOBAL, targetEntityId: null, dimension }
}
