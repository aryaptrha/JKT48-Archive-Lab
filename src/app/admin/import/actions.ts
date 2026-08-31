'use server'

import { revalidatePath } from 'next/cache'

import {
  CONFLICT_POLICIES,
  IMPORT_FORMATS,
  IMPORT_MODES,
  MAX_IMPORT_BYTES,
} from '@/domain/bulk-import'
import { EntityType } from '@/generated/prisma/enums'
import { requireAdmin } from '@/lib/auth/session'
import { revalidateArchiveGraph } from '@/server/cache/tags'
import { actorFromProfile } from '@/server/services/audit'
import { commitBulkImport, previewBulkImport } from '@/server/services/bulk-import'

import type { ConflictPolicy, ImportFormat, ImportMode } from '@/domain/bulk-import'
import type { ImportState } from '@/lib/import-state'

/**
 * Server Actions for bulk import (PRD §14, §26).
 *
 * One action serves both buttons. Preview and commit differ by an `intent` field
 * and by nothing else — same parse, same plan, same guardrails — because the only
 * thing that makes a preview worth reading is that it ran the code the commit is
 * about to run.
 *
 * This form does not redirect on success, unlike the rest of the admin: the report
 * *is* the result. `AdminFormState` therefore does not fit, and the state below
 * carries the report instead of field errors — an import's errors belong to rows,
 * not to inputs.
 */

function readChoice<T extends string>(
  formData: FormData,
  field: string,
  allowed: readonly T[],
  fallback: T,
): T {
  const raw = formData.get(field)
  if (typeof raw !== 'string') return fallback
  return allowed.includes(raw as T) ? (raw as T) : fallback
}

const ENTITY_TYPES = Object.values(EntityType)

/**
 * The payload, from the file input if one was chosen and the textarea otherwise.
 *
 * A file is offered because five hundred rows is a lot to move through a
 * clipboard, and it is checked here rather than in the browser: a `<select>` or an
 * `accept=` attribute is a convenience for the operator, never a constraint the
 * server may rely on (PRD §35).
 */
async function readPayload(formData: FormData): Promise<{ text: string } | { error: string }> {
  const file = formData.get('file')

  if (file instanceof File && file.size > 0) {
    if (file.size > MAX_IMPORT_BYTES) {
      return {
        error: `“${file.name}” is ${Math.round(file.size / 1024)} KB, over the ${Math.round(MAX_IMPORT_BYTES / 1024)} KB limit. Split it into a few smaller batches.`,
      }
    }
    const fileText = await file.text()
    if (fileText.trim().length > 0) return { text: fileText }
  }

  const pasted = formData.get('text')
  if (typeof pasted === 'string' && pasted.trim().length > 0) return { text: pasted }

  return { error: 'Nothing to import — paste the rows in, or choose a file.' }
}

export async function runImportAction(
  _previous: ImportState,
  formData: FormData,
): Promise<ImportState> {
  const profile = await requireAdmin('/admin/import')

  const intent = formData.get('intent') === 'commit' ? 'commit' : 'preview'
  const mode = readChoice<ImportMode>(formData, 'mode', IMPORT_MODES, 'entities')
  const format = readChoice<ImportFormat>(formData, 'format', IMPORT_FORMATS, 'csv')
  const conflictPolicy = readChoice<ConflictPolicy>(
    formData,
    'conflictPolicy',
    CONFLICT_POLICIES,
    'skip',
  )
  const entityType = readChoice<EntityType>(formData, 'entityType', ENTITY_TYPES, EntityType.MEMBER)
  const allowPartial = formData.get('allowPartial') === 'on'

  const payload = await readPayload(formData)
  if ('error' in payload) {
    return { status: 'error', message: payload.error, report: null }
  }

  const request = {
    text: payload.text,
    format,
    mode,
    entityType,
    conflictPolicy,
    allowPartial,
  }

  if (intent === 'preview') {
    const result = await previewBulkImport(request)
    if (!result.ok) return { status: 'error', message: result.message, report: null }

    const { counts } = result.report
    const total = result.report.rows.length
    return {
      status: 'previewed',
      message:
        total === 0
          ? 'Nothing to import — the payload parsed but held no rows.'
          : `Checked ${total} row${total === 1 ? '' : 's'}: ${counts.created} to create, ${counts.updated} to update, ${counts.skipped} already recorded, ${counts.failed} with problems. Nothing has been written yet.`,
      report: result.report,
    }
  }

  const result = await commitBulkImport(request, actorFromProfile(profile))
  if (!result.ok) return { status: 'error', message: result.message, report: null }

  const { counts } = result.report
  const applied = counts.created + counts.updated

  if (applied > 0) {
    revalidateArchiveGraph()
    revalidatePath('/admin')
    revalidatePath('/admin/entities')
    revalidatePath('/admin/relationships')
    revalidatePath('/admin/audit')
  }

  return {
    status: 'committed',
    message: `Imported: ${counts.created} created, ${counts.updated} updated, ${counts.skipped} skipped, ${counts.failed} failed.`,
    report: result.report,
  }
}
