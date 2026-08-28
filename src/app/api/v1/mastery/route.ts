import type { NextRequest } from 'next/server'

import { getCurrentProfile } from '@/lib/auth/session'
import { getMasteryOverview } from '@/server/services/mastery'
import {
  PRIVATE_CACHE_HEADERS,
  errorResponse,
  jsonResponse,
} from '../_lib/respond'

export const dynamic = 'force-dynamic'

/**
 * `/api/v1/mastery` — User personal mastery overview (PRD §8, §19, §21).
 *
 * Scoped to the authenticated user's session. Returns 401 Unauthorized if no active session.
 */
export async function GET(_request: NextRequest) {
  const profile = await getCurrentProfile()

  if (!profile) {
    return errorResponse(
      'Authentication required to access personal mastery records.',
      'UNAUTHORIZED',
      401,
    )
  }

  const mastery = await getMasteryOverview(profile.id)
  return jsonResponse(mastery, undefined, PRIVATE_CACHE_HEADERS)
}
