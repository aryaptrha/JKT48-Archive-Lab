import type { NextRequest } from 'next/server'

import { getGamePage } from '@/server/queries/games'
import { errorResponse, jsonResponse } from '../../_lib/respond'

export const dynamic = 'force-dynamic'

/**
 * `/api/v1/games/[gameType]` — Specific game type & difficulty tiers (PRD §5, §6, §21).
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ gameType: string }> },
) {
  const { gameType: slugOrType } = await context.params

  const slug = slugOrType.toLowerCase().replace(/_/g, '-')
  const gamePage = await getGamePage(slug)

  if (!gamePage) {
    return errorResponse(
      `Unknown game type: "${slugOrType}". Available game types: mystery-member, connect-the-dots, memory-reconstruction, time-machine-quiz.`,
      'NOT_FOUND',
      404,
    )
  }

  return jsonResponse(gamePage.game)
}
