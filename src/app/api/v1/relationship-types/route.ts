import type { NextRequest } from 'next/server'

import { listRelationshipTypes } from '@/server/repositories/relationship-type-repository'
import { jsonResponse } from '../_lib/respond'

export const dynamic = 'force-dynamic'

/**
 * `/api/v1/relationship-types` — Active relationship vocabulary (PRD §21).
 */
export async function GET(_request: NextRequest) {
  const types = await listRelationshipTypes(false)

  const items = types.map((type) => ({
    id: type.id,
    code: type.code,
    name: type.name,
    inverseName: type.inverseName,
    description: type.description,
    isDirectional: type.isDirectional,
    isTemporal: type.isTemporal,
    isQuizzable: type.isQuizzable,
    allowedSourceTypes: type.allowedSourceTypes,
    allowedTargetTypes: type.allowedTargetTypes,
    displayOrder: type.displayOrder,
  }))

  return jsonResponse(items)
}
