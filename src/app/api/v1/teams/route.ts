import type { NextRequest } from 'next/server'

import { getCollectionPage } from '@/server/queries/explore'
import { errorResponse, paginatedResponse, parsePagination } from '../_lib/respond'

export const dynamic = 'force-dynamic'

/**
 * `/api/v1/teams` — Teams collection endpoint (PRD §21).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const { page, pageSize } = parsePagination(searchParams)
  const search = searchParams.get('q')?.trim() || undefined

  const collection = await getCollectionPage('teams', {
    page,
    pageSize,
    search,
  })

  if (!collection) {
    return errorResponse('Teams collection not found', 'NOT_FOUND', 404)
  }

  return paginatedResponse(collection.results.items, {
    page: collection.results.page,
    pageSize: collection.results.pageSize,
    total: collection.results.total,
    pageCount: collection.results.pageCount,
  })
}
