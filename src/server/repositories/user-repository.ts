import type { Prisma, UserProfile, UserRole } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma/client'

/**
 * User profile persistence.
 *
 * Authentication lives in Supabase; this table holds the application's view of
 * a user, and crucially the `role` column that authorization reads. Admin access
 * is a row value, never a hard-coded email (PRD §19, §35).
 */

export async function findProfileById(id: string): Promise<UserProfile | null> {
  return prisma.userProfile.findUnique({ where: { id } })
}

export async function listProfiles(options: { page?: number; pageSize?: number; search?: string } = {}) {
  const page = Math.max(1, options.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, options.pageSize ?? 25))

  const search = options.search?.trim()
  const where: Prisma.UserProfileWhereInput = search
    ? {
        OR: [
          { email: { contains: search, mode: 'insensitive' } },
          { displayName: { contains: search, mode: 'insensitive' } },
        ],
      }
    : {}

  const [rows, total] = await Promise.all([
    prisma.userProfile.findMany({
      where,
      orderBy: [{ role: 'asc' }, { email: 'asc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.userProfile.count({ where }),
  ])

  return { rows, total, page, pageSize }
}

export async function setUserRole(id: string, role: UserRole) {
  return prisma.userProfile.update({ where: { id }, data: { role } })
}

export async function countAdmins(): Promise<number> {
  return prisma.userProfile.count({ where: { role: 'ADMIN' } })
}

/**
 * Promote by email, for bootstrapping the first administrator from the seed
 * script. Returns null when no profile exists yet — the user must sign in once
 * so Supabase creates their auth record.
 */
export async function promoteByEmail(email: string, role: UserRole): Promise<UserProfile | null> {
  const profile = await prisma.userProfile.findUnique({ where: { email } })
  if (!profile) return null
  return prisma.userProfile.update({ where: { id: profile.id }, data: { role } })
}
