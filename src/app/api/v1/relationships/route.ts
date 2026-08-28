import type { NextRequest } from 'next/server'

import { listRelationships } from '@/server/repositories/relationship-repository'
import { toISODate } from '@/lib/date'
import { toEntityRef } from '@/server/services/entity-mapper'
import { paginatedResponse, parsePagination } from '../_lib/respond'

export const dynamic = 'force-dynamic'

/**
 * `/api/v1/relationships` — Knowledge graph edges (PRD §21).
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const { page, pageSize } = parsePagination(searchParams)

  const entityId = searchParams.get('entityId')?.trim() || undefined
  const code = searchParams.get('code')?.trim()
  const search = searchParams.get('q')?.trim() || undefined

  const { rows, total } = await listRelationships({
    entityId,
    relationshipCodes: code ? [code] : undefined,
    search,
    page,
    pageSize,
  })

  const items = rows.map((row) => ({
    id: row.id,
    code: row.relationshipType.code,
    name: row.relationshipType.name,
    inverseName: row.relationshipType.inverseName,
    isTemporal: row.relationshipType.isTemporal,
    source: toEntityRef(row.source),
    target: toEntityRef(row.target),
    validFrom: toISODate(row.validFrom),
    validTo: toISODate(row.validTo),
    weight: row.weight,
    provenance: row.provenance?.name ?? null,
  }))

  return paginatedResponse(items, { page, pageSize, total })
}
