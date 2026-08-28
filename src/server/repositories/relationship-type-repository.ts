import type { Prisma, RelationshipType } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma/client'

/**
 * Relationship type (vocabulary) persistence.
 *
 * These rows are the schema of the graph, and they are data — admins may add a
 * relationship type without a deploy. `src/domain/relationship-types.ts` holds
 * the seed and the typed codes; this file reads what is actually there.
 */

export async function listRelationshipTypes(includeInactive = false): Promise<RelationshipType[]> {
  return prisma.relationshipType.findMany({
    where: includeInactive ? undefined : { isActive: true },
    orderBy: [{ displayOrder: 'asc' }, { code: 'asc' }],
  })
}

export async function findRelationshipTypeByCode(code: string): Promise<RelationshipType | null> {
  return prisma.relationshipType.findUnique({ where: { code } })
}

export async function findRelationshipTypeById(id: string): Promise<RelationshipType | null> {
  return prisma.relationshipType.findUnique({ where: { id } })
}

/**
 * code → row lookup.
 *
 * The game engine works in codes but the database filters on ids, so almost
 * every generator starts by resolving this map once.
 */
export async function relationshipTypeMapByCode(
  includeInactive = false,
): Promise<Map<string, RelationshipType>> {
  const rows = await listRelationshipTypes(includeInactive)
  return new Map(rows.map((row) => [row.code, row]))
}

export async function resolveRelationshipTypeIds(codes: readonly string[]): Promise<string[]> {
  if (codes.length === 0) return []
  const rows = await prisma.relationshipType.findMany({
    where: { code: { in: [...codes] }, isActive: true },
    select: { id: true },
  })
  return rows.map((row) => row.id)
}

export async function listQuizzableRelationshipTypes(): Promise<RelationshipType[]> {
  return prisma.relationshipType.findMany({
    where: { isActive: true, isQuizzable: true },
    orderBy: [{ displayOrder: 'asc' }],
  })
}

export async function createRelationshipType(data: Prisma.RelationshipTypeCreateInput) {
  return prisma.relationshipType.create({ data })
}

export async function updateRelationshipType(id: string, data: Prisma.RelationshipTypeUpdateInput) {
  return prisma.relationshipType.update({ where: { id }, data })
}

/**
 * Types are never hard-deleted while edges reference them (the FK is Restrict);
 * deactivating hides a type from the builder without rewriting history.
 */
export async function deactivateRelationshipType(id: string) {
  return prisma.relationshipType.update({ where: { id }, data: { isActive: false } })
}
