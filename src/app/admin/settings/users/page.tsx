import type { Metadata } from 'next'
import Link from 'next/link'

import { FormBanner } from '@/components/admin/admin-chrome'
import { EmptyState } from '@/components/archive/empty-state'
import { Pagination } from '@/components/archive/pagination'
import { SearchField } from '@/components/archive/search-field'
import { PageShell, SectionHeading } from '@/components/archive/section'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/field'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { UserRole } from '@/generated/prisma/enums'
import { requireAdmin } from '@/lib/auth/session'
import { formatDate } from '@/lib/date'
import { roleOptions } from '@/server/queries/admin'
import { getUsers } from '@/server/services/admin-config'
import { changeUserRoleAction } from './actions'

export const metadata: Metadata = {
  title: 'User administration',
}

/**
 * `/admin/settings/users` (PRD §19, §35).
 *
 * Role administration for the archive. Admin access is governed by the profile role column,
 * never by email allowlists or hard-coded usernames (§19).
 */

type SearchParams = Promise<Record<string, string | string[] | undefined>>

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: SearchParams
}) {
  const currentProfile = await requireAdmin()
  const query = await searchParams

  const search = first(query.q)?.trim() || undefined
  const pageParam = first(query.page)
  const pageNumber = Number.parseInt(pageParam ?? '1', 10)

  const users = await getUsers({
    page: Number.isFinite(pageNumber) ? pageNumber : 1,
    search,
  })

  const roles = roleOptions()
  const carried = new URLSearchParams()
  if (search) carried.set('q', search)

  const isFiltered = Boolean(search)

  return (
    <PageShell className="space-y-8">
      <SectionHeading
        as="h1"
        eyebrow={`${users.total.toLocaleString()} registered accounts`}
        title="User Accounts & Roles"
        lead="User role administration (§19). Administrators have full access to edit, publish and configure the archive. Demoting the last administrator or self-demotion is rejected."
        action={
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/settings">Back to settings</Link>
          </Button>
        }
      />

      <FormBanner error={first(query.error)} notice={first(query.notice)} />

      {/* ------------------------------------------------------------- search */}
      <SearchField
        action="/admin/settings/users"
        defaultValue={search}
        placeholder="Search users by email..."
        label="Search users"
      >
        {isFiltered ? (
          <Button asChild variant="ghost" size="sm">
            <Link href="/admin/settings/users">Clear search</Link>
          </Button>
        ) : null}
      </SearchField>

      {/* -------------------------------------------------------------- table */}
      {users.items.length > 0 ? (
        <div className="space-y-6">
          <Table>
            <TableHead>
              <TableRow>
                <TableHeader>Email & User</TableHeader>
                <TableHeader>Current role</TableHeader>
                <TableHeader>Registered</TableHeader>
                <TableHeader>Last active</TableHeader>
                <TableHeader className="text-right">Change role</TableHeader>
              </TableRow>
            </TableHead>
            <TableBody>
              {users.items.map((user) => {
                const isSelf = user.id === currentProfile.id

                return (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-ink-strong">
                            {user.email}
                          </span>
                          {isSelf ? <Badge tone="accent">You</Badge> : null}
                        </div>
                        {user.displayName ? (
                          <p className="text-xs text-ink-faint">
                            {user.displayName}
                          </p>
                        ) : null}
                      </div>
                    </TableCell>

                    <TableCell>
                      <Badge tone={user.role === UserRole.ADMIN ? 'accent' : 'neutral'}>
                        {user.role}
                      </Badge>
                    </TableCell>

                    <TableCell>
                      <time className="font-mono text-catalog text-ink-muted">
                        {formatDate(user.createdAt)}
                      </time>
                    </TableCell>

                    <TableCell>
                      <time className="font-mono text-catalog text-ink-faint">
                        {user.lastSeenAt ? formatDate(user.lastSeenAt) : 'Never'}
                      </time>
                    </TableCell>

                    <TableCell className="text-right">
                      <form
                        action={changeUserRoleAction}
                        className="inline-flex items-center gap-2"
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <Select
                          name="role"
                          defaultValue={user.role}
                          disabled={isSelf}
                          className="h-8 w-28 text-xs"
                        >
                          {roles.map((r) => (
                            <option key={r.value} value={r.value}>
                              {r.label}
                            </option>
                          ))}
                        </Select>
                        <Button
                          type="submit"
                          variant="outline"
                          size="sm"
                          disabled={isSelf}
                          className="h-8 text-xs"
                        >
                          Save
                        </Button>
                      </form>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          <Pagination
            page={users}
            params={carried}
            basePath="/admin/settings/users"
          />
        </div>
      ) : (
        <EmptyState
          title={isFiltered ? 'No matching users' : 'No user accounts found'}
          body="No user accounts were found."
          action={
            isFiltered ? (
              <Button asChild variant="outline" size="sm">
                <Link href="/admin/settings/users">Clear search</Link>
              </Button>
            ) : undefined
          }
        />
      )}
    </PageShell>
  )
}
