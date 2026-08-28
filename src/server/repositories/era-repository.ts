import type { Era, Prisma } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma/client'

/**
 * Era persistence — PRD §12.
 *
 * Eras label date ranges. Nothing is assigned to an era, so there is no join
 * here and never should be: the Time Machine turns an era into a date and asks
 * the graph.
 */

export async function listEras(): Promise<Era[]> {
  return prisma.era.findMany({ orderBy: [{ displayOrder: 'asc' }, { startDate: 'asc' }] })
}

export async function findEraBySlug(slug: string): Promise<Era | null> {
  return prisma.era.findUnique({ where: { slug } })
}

export async function findEraCovering(date: Date): Promise<Era | null> {
  return prisma.era.findFirst({
    where: {
      startDate: { lte: date },
      OR: [{ endDate: null }, { endDate: { gte: date } }],
    },
    orderBy: { startDate: 'desc' },
  })
}

export async function createEra(data: Prisma.EraCreateInput) {
  return prisma.era.create({ data })
}

export async function updateEra(id: string, data: Prisma.EraUpdateInput) {
  return prisma.era.update({ where: { id }, data })
}

export async function deleteEra(id: string) {
  return prisma.era.delete({ where: { id } })
}
