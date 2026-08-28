import type { NextRequest } from 'next/server'

import { EntityType } from '@/generated/prisma/enums'
import { listEntities } from '@/server/repositories/entity-repository'
import { toEntityRef } from '@/server/services/entity-mapper'
import { errorResponse, paginatedResponse, parsePagination } from '../_lib/respond'

export const dynamic = 'force-dynamic'

const ENTITY_TYPES = Object.values(EntityType)

/**
 * `/api/v1/entities` — Public entity list (PRD §21).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const { page, pageSize } = parsePagination(searchParams)

  const search = searchParams.get('q')?.trim() || undefined
  const typeParam = searchParams.get('type')?.trim()

  let entityTypes: EntityType[] | undefined
  if (typeParam) {
    if ((ENTITY_TYPES as string[]).includes(typeParam)) {
      entityTypes = [typeParam as EntityType]
    } else {
      return errorResponse(`Unknown entity type: ${typeParam}`, 'INVALID_PARAMETER', 400)
    }
  }

  const { rows, total } = await listEntities({
    entityTypes,
    search,
    page,
    pageSize,
    orderBy: 'prominence',
    includeUnpublished: false,
  })

  return paginatedResponse(rows.map(toEntityRef), { page, pageSize, total })
}
