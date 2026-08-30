import type { BulkImportReport } from '@/server/services/bulk-import'

/**
 * The state the bulk import form gets back from its action.
 *
 * Separate from `actions.ts` because every export of a `'use server'` module must
 * be an async function — a plain constant there is a build error — and separate
 * from `AdminFormState` because an import reports differently from an editor. An
 * editor's failure belongs under the input that caused it; an import's belongs to
 * a row of the sheet, and there may be four hundred of them. The report carries
 * those, so this type carries the report.
 *
 * `status` distinguishes the two outcomes a curator must not confuse: `previewed`
 * means nothing was written, `committed` means it was.
 */
export type ImportState = {
  status: 'idle' | 'previewed' | 'committed' | 'error'
  message: string | null
  report: BulkImportReport | null
}

export const IDLE_IMPORT_STATE: ImportState = {
  status: 'idle',
  message: null,
  report: null,
}
