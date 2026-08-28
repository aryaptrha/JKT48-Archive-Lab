import type { NextRequest } from 'next/server'

import { getEntityDetailById, getEntityDetailBySlug } from '@/server/services/knowledge-graph'
import { errorResponse, jsonResponse } from '../../_lib/respond'

export const dynamic = 'force-dynamic'

/**
 * `/api/v1/entities/[id]` — Entity detail with relationships (PRD §21).
 *
 * Accepts either a canonical entity ID or an entity slug.
 */
export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params
  const asOfParam = request.nextUrl.searchParams.get('asOf')
  const asOf = asOfParam ? new Date(asOfParam) : undefined

  let entity = await getEntityDetailById(id, { asOf, includeUnpublished: false })
  if (!entity) {
    entity = await getEntityDetailBySlug(id, { asOf, includeUnpublished: false })
  }

  if (!entity) {
    return errorResponse(`Entity not found: ${id}`, 'NOT_FOUND', 404)
  }

  return jsonResponse(entity)
}
