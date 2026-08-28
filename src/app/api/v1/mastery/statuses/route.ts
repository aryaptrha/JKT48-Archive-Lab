import type { NextRequest } from 'next/server'

import { getMasteryBands } from '@/server/services/mastery'
import { jsonResponse } from '../../_lib/respond'

export const dynamic = 'force-dynamic'

/**
 * `/api/v1/mastery/statuses` — Public mastery status bands & thresholds configuration (PRD §8.3, §21).
 */
export async function GET(_request: NextRequest) {
  const bands = await getMasteryBands()
  return jsonResponse(bands)
}
