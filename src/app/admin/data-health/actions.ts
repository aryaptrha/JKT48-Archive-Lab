'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { issueStatusInputSchema } from '@/domain/validation'
import { IssueStatus } from '@/generated/prisma/enums'
import { requireAdmin } from '@/lib/auth/session'
import { logger } from '@/lib/logger'
import { actorFromProfile } from '@/server/services/audit'
import { runDataHealthScan, setHealthIssueStatus } from '@/server/services/data-health'

/**
 * Server Actions for `/admin/data-health` (PRD §16, §25, §35).
 *
 * Both are short submits in the sense `lib/form-state.ts` describes: there is
 * nothing worth preserving in a scan trigger or a one-field status change, so
 * each ends in `redirect()` back to the report with `?notice=` / `?error=` for
 * `FormBanner`, rather than returning `AdminFormState`.
 *
 * `requireAdmin()` runs here even though the page above already called it. A
 * Server Action is its own POST endpoint — nothing about being rendered inside
 * an authorized page authorizes the action itself (§35) — and the resulting
 * profile is what turns into the `Actor` the two service calls audit against.
 * Neither action writes an audit row directly; that stays inside
 * `runDataHealthScan` / `setHealthIssueStatus`, which is what "never widen a
 * service" means in practice (see the sibling services this page reads).
 *
 * The page's own filter state (severity / check / status / page) travels
 * through each form as hidden `filter*`-prefixed fields, not as `severity` /
 * `status` themselves — the issue-status form already uses `status` for the
 * *target* status a submit button sets, and reusing that name for the
 * *current filter* would make one form post two different things under one
 * key. `back()` reads the `filter*` fields and writes them out again as the
 * plain `severity` / `check` / `status` query params the page actually reads.
 */

/** Trimmed text, or `undefined` for anything blank — never an empty string. */
function field(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed.length > 0 ? trimmed : undefined
}

type CarriedFilters = {
  severity?: string
  check?: string
  status?: string
  page?: string
}

function readFilters(formData: FormData): CarriedFilters {
  return {
    severity: field(formData, 'filterSeverity'),
    check: field(formData, 'filterCheck'),
    status: field(formData, 'filterStatus'),
    page: field(formData, 'filterPage'),
  }
}

/** Back to the report, keeping whatever filter the curator was looking at. */
function back(query: CarriedFilters & { notice?: string; error?: string }): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value) params.set(key, value)
  }
  const search = params.toString()
  return search ? `/admin/data-health?${search}` : '/admin/data-health'
}

export async function runScanAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const filters = readFilters(formData)

  let outcome: string
  try {
    const result = await runDataHealthScan(actorFromProfile(profile))
    // "Scan complete" tells a curator nothing they can act on; what changed
    // does — the same reasoning as the audit summary this call itself writes.
    outcome = back({
      ...filters,
      notice: `Scan complete — ${result.created} new, ${result.refreshed} refreshed, ${result.resolved} resolved. ${result.issuesFound} open in total.`,
    })
  } catch (error) {
    logger.error('dataHealth.runScan failed', error)
    outcome = back({ ...filters, error: 'The scan could not be completed. Try again in a moment.' })
  }

  revalidatePath('/admin/data-health')
  // The dashboard's health figures and blocking-check panel read the same
  // report, so a scan that changes the numbers has to invalidate it too.
  revalidatePath('/admin')
  redirect(outcome)
}

export async function setIssueStatusAction(formData: FormData): Promise<void> {
  const profile = await requireAdmin()
  const filters = readFilters(formData)

  const parsed = issueStatusInputSchema.safeParse({
    issueId: formData.get('issueId'),
    status: formData.get('status'),
    reason: formData.get('reason'),
  })

  if (!parsed.success) {
    redirect(back({ ...filters, error: 'That decision could not be recorded — reload and try again.' }))
  }

  let outcome: string
  try {
    await setHealthIssueStatus(
      parsed.data.issueId,
      parsed.data.status,
      actorFromProfile(profile),
      parsed.data.reason ?? undefined,
    )
    const verb =
      parsed.data.status === IssueStatus.RESOLVED
        ? 'resolved'
        : parsed.data.status === IssueStatus.IGNORED
          ? 'ignored'
          : 'reopened'
    outcome = back({ ...filters, notice: `Issue marked ${verb}.` })
  } catch (error) {
    logger.error('dataHealth.setIssueStatus failed', error, { issueId: parsed.data.issueId })
    outcome = back({ ...filters, error: 'That decision could not be saved. Try again in a moment.' })
  }

  revalidatePath('/admin/data-health')
  revalidatePath('/admin')
  redirect(outcome)
}
