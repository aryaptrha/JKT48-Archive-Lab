import type { NextRequest } from 'next/server'

import { getGamesIndex } from '@/server/queries/games'
import { jsonResponse } from '../_lib/respond'

export const dynamic = 'force-dynamic'

/**
 * `/api/v1/games` — Game catalogue & difficulty models (PRD §5, §6, §21).
 */
export async function GET(_request: NextRequest) {
  const index = await getGamesIndex()
  return jsonResponse(index.games)
}
