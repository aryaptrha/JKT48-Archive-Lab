import type { NextRequest } from 'next/server'

import { getTimeline } from '@/server/queries/timeline'
import { jsonResponse } from '../_lib/respond'

export const dynamic = 'force-dynamic'

/**
 * `/api/v1/timeline` — Chronological history transitions & events (PRD §4.2, §21).
 */
export async function GET(request: NextRequest) {
  const fromParam = request.nextUrl.searchParams.get('from')
  const toParam = request.nextUrl.searchParams.get('to')

  const from = fromParam ? new Date(fromParam) : undefined
  const to = toParam ? new Date(toParam) : undefined

  const timeline = await getTimeline({
    from: from && !Number.isNaN(from.getTime()) ? from : undefined,
    to: to && !Number.isNaN(to.getTime()) ? to : undefined,
  })

  return jsonResponse(timeline)
}
