import type { Prisma, Source } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma/client'

/**
 * Source (provenance) persistence — PRD §13.
 *
 * Every claim in the archive should be traceable to where it came from. Sources
 * are shared rows rather than free text on each record, so re-citing the same
 * Fandom page across a hundred relationships stays consistent.
 */

export async function listSources(): Promise<Source[]> {
  return prisma.source.findMany({ orderBy: [{ sourceType: 'asc' }, { name: 'asc' }] })
}

export async function findSourceById(id: string): Promise<Source | null> {
  return prisma.source.findUnique({ where: { id } })
}

export async function countSourceUsage(id: string) {
  const [entities, relationships] = await Promise.all([
    prisma.entity.count({ where: { provenanceId: id } }),
    prisma.relationship.count({ where: { provenanceId: id } }),
  ])
  return { entities, relationships }
}

export async function createSource(data: Prisma.SourceCreateInput) {
  return prisma.source.create({ data })
}

export async function updateSource(id: string, data: Prisma.SourceUpdateInput) {
  return prisma.source.update({ where: { id }, data })
}

export async function deleteSource(id: string) {
  // Entity.provenanceId / Relationship.provenanceId are SetNull, so records
  // survive the deletion — they simply become unsourced and get flagged by the
  // data health run.
  return prisma.source.delete({ where: { id } })
}
