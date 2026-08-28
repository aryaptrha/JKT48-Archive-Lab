import type { NextRequest } from 'next/server'

import { getSnapshot } from '@/server/services/time-machine'
import { errorResponse, jsonResponse } from '../../_lib/respond'

export const dynamic = 'force-dynamic'

/**
 * `/api/v1/timeline/[date]` — Historical Time Machine snapshot on a specific date (PRD §4.3, §11, §21).
 *
 * Resolves active team rosters, captains, active members and generations
 * using the temporal validity predicate:
 *   WHERE valid_from <= date AND (valid_to IS NULL OR valid_to >= date)
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ date: string }> },
) {
  const { date } = await context.params
  const parsedDate = new Date(date)

  if (Number.isNaN(parsedDate.getTime())) {
    return errorResponse(
      `Invalid date parameter: "${date}". Expected format: YYYY-MM-DD.`,
      'INVALID_DATE',
      400,
    )
  }

  const snapshot = await getSnapshot(parsedDate)
  return jsonResponse(snapshot)
}
