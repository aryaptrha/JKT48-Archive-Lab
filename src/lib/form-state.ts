import type { FieldErrors } from '@/domain/validation'

/**
 * The state a form action hands back to the form it was submitted from.
 *
 * Two shapes of admin mutation exist in this codebase and they report differently
 * on purpose:
 *
 *   - **Small, single-purpose submits** — publish/unpublish, retire a vocabulary
 *     term, save a one-line setting — redirect afterwards and put their outcome in
 *     `?error=` / `?notice=` for `FormBanner` to render. There is nothing worth
 *     preserving in a form of two fields, and the redirect means a refresh does not
 *     re-post the mutation.
 *
 *   - **The two long editors** — a record and a relationship — use this type with
 *     `useActionState` instead. A failed save has to come back with the typed
 *     values still in the inputs and the message under the field that caused it;
 *     "Please correct the highlighted fields" is useless if the fields are blank
 *     and the highlights are gone. React re-renders the same form with this state
 *     rather than navigating, so the browser keeps every value.
 *
 * Both paths run the same server-side validation and the same authorization. This
 * is a difference in how failure is *displayed*, never in what is trusted (PRD §35).
 *
 * The success path of an editor never returns: it redirects, so a reload of the
 * editor is a GET of saved data and not a second write.
 */
export type AdminFormState = {
  status: 'idle' | 'error'
  /** A sentence for the top of the form. */
  message: string | null
  /** Keyed by field path, e.g. `slug` or `attributes.stageName`. */
  fieldErrors: FieldErrors
}

export const IDLE_FORM_STATE: AdminFormState = {
  status: 'idle',
  message: null,
  fieldErrors: {},
}

/** Turn a failed `AdminResult` into form state. */
export function errorState(result: {
  message: string
  fieldErrors?: FieldErrors
}): AdminFormState {
  return {
    status: 'error',
    message: result.message,
    fieldErrors: result.fieldErrors ?? {},
  }
}

/** The first message recorded against a field, if any. */
export function fieldError(state: AdminFormState, field: string): string | undefined {
  return state.fieldErrors[field]?.[0]
}
