'use client'

import { useActionState } from 'react'

import { Button } from '@/components/ui/button'
import { CheckboxField, Field, Input, Select, Textarea } from '@/components/ui/field'
import { ATTRIBUTE_TABLE_LABELS, attributeFieldsFor } from '@/domain/attribute-fields'
import { fieldError, IDLE_FORM_STATE } from '@/lib/form-state'
import { cn } from '@/lib/utils'

import type { AttributeField } from '@/domain/attribute-fields'
import type { AdminFormState } from '@/lib/form-state'
import type { EntityFormDefaults } from '@/server/queries/admin'

/**
 * The record editor (PRD §25).
 *
 * A Client Component for exactly one reason: `useActionState`, so a rejected save
 * comes back with the typed values still in the inputs and each message under the
 * field that caused it. Everything it renders is a plain form control, so it
 * submits and saves before hydration too — React posts the form normally and the
 * same Server Action runs.
 *
 * `entityType` is a hidden input, not a select. Two reasons: the type decides which
 * specialized table the record writes to, so changing it mid-edit would leave the
 * old row orphaned and the new one blank; and the type also decides which fields
 * this form shows, which is a server decision made from `?type=` on the create page.
 *
 * The type-specific fields come from `attribute-fields.ts` rather than from ten
 * hand-written blocks. There is still no generation dropdown, no team field and no
 * "center of" picker for any type — those are relationships (§10).
 */

type EntityFormProps = {
  defaults: EntityFormDefaults
  typeLabel: string
  sources: { id: string; name: string }[]
  action: (state: AdminFormState, formData: FormData) => Promise<AdminFormState>
  submitLabel: string
  cancelHref: string
}

function asText(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return ''
}

function asBool(value: unknown): boolean {
  return value === true || value === 'true'
}

export function EntityForm({
  defaults,
  typeLabel,
  sources,
  action,
  submitLabel,
  cancelHref,
}: EntityFormProps) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM_STATE)

  const table = defaults.attributeTable
  const attributeFields = table ? attributeFieldsFor(table) : []

  const err = (field: string) => fieldError(state, field)

  function renderAttribute(field: AttributeField) {
    const id = `attributes-${field.name}`
    const name = `attributes.${field.name}`
    const error = err(name)
    const raw = defaults.attributes[field.name]
    const span = field.wide ? 'sm:col-span-2' : undefined

    if (field.kind === 'checkbox') {
      return (
        <div key={field.name} className={cn('pt-1', span)}>
          <CheckboxField
            id={id}
            name={name}
            value="true"
            defaultChecked={asBool(raw)}
            label={field.label}
            {...(field.hint ? { hint: field.hint } : {})}
          />
          {error ? (
            <p className="mt-1 text-xs font-medium text-accent" role="alert">
              {error}
            </p>
          ) : null}
        </div>
      )
    }

    const shared = {
      id,
      name,
      'aria-invalid': error ? true : undefined,
      required: field.required ?? false,
    } as const

    return (
      <Field
        key={field.name}
        htmlFor={id}
        label={field.label}
        {...(field.hint ? { hint: field.hint } : {})}
        {...(error ? { error } : {})}
        {...(field.required ? { required: true } : {})}
        className={span}
      >
        {field.kind === 'select' ? (
          <Select {...shared} defaultValue={asText(raw) || (field.options?.[0]?.value ?? '')}>
            {(field.options ?? []).map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        ) : field.kind === 'textarea' ? (
          <Textarea {...shared} rows={3} defaultValue={asText(raw)} />
        ) : field.kind === 'number' ? (
          <Input
            {...shared}
            type="number"
            inputMode="numeric"
            {...(field.min === undefined ? {} : { min: field.min })}
            {...(field.max === undefined ? {} : { max: field.max })}
            defaultValue={asText(raw)}
          />
        ) : field.kind === 'color' ? (
          // A text input rather than `type="color"`, which always posts a value:
          // an untouched colour picker would silently record black where the
          // curator meant "not known".
          <Input
            {...shared}
            type="text"
            inputMode="text"
            pattern="#[0-9a-fA-F]{6}"
            placeholder="#B2242C"
            defaultValue={asText(raw)}
          />
        ) : (
          <Input
            {...shared}
            type={field.kind === 'date' ? 'date' : field.kind === 'url' ? 'url' : 'text'}
            defaultValue={asText(raw)}
          />
        )}
      </Field>
    )
  }

  return (
    <form action={formAction} className="space-y-9">
      {defaults.id ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <input type="hidden" name="entityType" value={defaults.entityType} />

      {state.status === 'error' && state.message ? (
        <p
          role="alert"
          className="border-l-2 border-accent bg-accent-soft px-4 py-2.5 text-sm leading-relaxed text-ink"
        >
          {state.message}
        </p>
      ) : null}

      {err('_form') ? (
        <p role="alert" className="text-sm font-medium text-accent">
          {err('_form')}
        </p>
      ) : null}

      {/* ------------------------------------------------------------ identity */}
      <fieldset className="space-y-4">
        <legend className="eyebrow border-b border-rule pb-2">
          Identity · {typeLabel}
        </legend>

        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field
            htmlFor="canonicalName"
            label="Canonical name"
            required
            hint="How the archive refers to this record. Alternative spellings go in aliases."
            {...(err('canonicalName') ? { error: err('canonicalName') } : {})}
            className="sm:col-span-2"
          >
            <Input
              id="canonicalName"
              name="canonicalName"
              required
              maxLength={200}
              aria-invalid={err('canonicalName') ? true : undefined}
              defaultValue={defaults.canonicalName}
            />
          </Field>

          <Field
            htmlFor="slug"
            label="Slug"
            hint="Leave empty to derive it from the name, with a numeric suffix if it collides."
            {...(err('slug') ? { error: err('slug') } : {})}
          >
            <Input
              id="slug"
              name="slug"
              placeholder="derived-from-the-name"
              aria-invalid={err('slug') ? true : undefined}
              defaultValue={defaults.slug}
            />
          </Field>

          <Field
            htmlFor="prominence"
            label="Prominence"
            hint="0–100. Weights ordering and how often the record is drawn as a question."
            {...(err('prominence') ? { error: err('prominence') } : {})}
          >
            <Input
              id="prominence"
              name="prominence"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              aria-invalid={err('prominence') ? true : undefined}
              defaultValue={String(defaults.prominence)}
            />
          </Field>

          <Field
            htmlFor="aliases"
            label="Aliases"
            hint="Comma-separated. Every spelling a reader might search for, up to forty."
            {...(err('aliases') ? { error: err('aliases') } : {})}
            className="sm:col-span-2"
          >
            <Input
              id="aliases"
              name="aliases"
              aria-invalid={err('aliases') ? true : undefined}
              defaultValue={defaults.aliases}
            />
          </Field>
        </div>
      </fieldset>

      {/* --------------------------------------------------------------- prose */}
      <fieldset className="space-y-4">
        <legend className="eyebrow border-b border-rule pb-2">Description</legend>

        <Field
          htmlFor="summary"
          label="Summary"
          hint="One or two sentences, used in listings and search results. 320 characters."
          {...(err('summary') ? { error: err('summary') } : {})}
        >
          <Textarea
            id="summary"
            name="summary"
            rows={2}
            maxLength={320}
            aria-invalid={err('summary') ? true : undefined}
            defaultValue={defaults.summary}
          />
        </Field>

        <Field
          htmlFor="description"
          label="Description"
          hint="The full entry. Plain paragraphs; blank lines separate them."
          {...(err('description') ? { error: err('description') } : {})}
        >
          <Textarea
            id="description"
            name="description"
            rows={8}
            maxLength={8000}
            aria-invalid={err('description') ? true : undefined}
            defaultValue={defaults.description}
          />
        </Field>
      </fieldset>

      {/* ---------------------------------------------------------- lifecycle */}
      <fieldset className="space-y-4">
        <legend className="eyebrow border-b border-rule pb-2">Existence and image</legend>

        <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
          <Field
            htmlFor="activeFrom"
            label="Active from"
            hint="When this record began to exist. Used by the Time Machine (§11)."
            {...(err('activeFrom') ? { error: err('activeFrom') } : {})}
          >
            <Input
              id="activeFrom"
              name="activeFrom"
              type="date"
              aria-invalid={err('activeFrom') ? true : undefined}
              defaultValue={defaults.activeFrom}
            />
          </Field>

          <Field
            htmlFor="activeTo"
            label="Active to"
            hint="Empty means still current — an open window, not an unknown one."
            {...(err('activeTo') ? { error: err('activeTo') } : {})}
          >
            <Input
              id="activeTo"
              name="activeTo"
              type="date"
              aria-invalid={err('activeTo') ? true : undefined}
              defaultValue={defaults.activeTo}
            />
          </Field>

          <Field
            htmlFor="imageUrl"
            label="Image URL"
            hint="An absolute URL. Uploads land in Supabase Storage and are pasted here."
            {...(err('imageUrl') ? { error: err('imageUrl') } : {})}
            className="sm:col-span-2"
          >
            <Input
              id="imageUrl"
              name="imageUrl"
              type="url"
              aria-invalid={err('imageUrl') ? true : undefined}
              defaultValue={defaults.imageUrl}
            />
          </Field>
        </div>
      </fieldset>

      {/* ------------------------------------------------------------ specific */}
      {table && attributeFields.length > 0 ? (
        <fieldset className="space-y-4">
          <legend className="eyebrow border-b border-rule pb-2">
            {ATTRIBUTE_TABLE_LABELS[table]}
          </legend>
          <div className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
            {attributeFields.map(renderAttribute)}
          </div>
        </fieldset>
      ) : null}

      {/* ---------------------------------------------------------- provenance */}
      <fieldset className="space-y-4">
        <legend className="eyebrow border-b border-rule pb-2">Provenance and publication</legend>

        <Field
          htmlFor="provenanceId"
          label="Source"
          hint="Where this came from. A record with no source is reported by data health, not rejected (§14)."
          {...(err('provenanceId') ? { error: err('provenanceId') } : {})}
        >
          <Select
            id="provenanceId"
            name="provenanceId"
            aria-invalid={err('provenanceId') ? true : undefined}
            defaultValue={defaults.provenanceId}
          >
            <option value="">— not recorded —</option>
            {sources.map((source) => (
              <option key={source.id} value={source.id}>
                {source.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field
          htmlFor="notes"
          label="Curator notes"
          hint="Internal. Never rendered on the public site — conflicting sources, open questions, what to check next."
          {...(err('notes') ? { error: err('notes') } : {})}
        >
          <Textarea
            id="notes"
            name="notes"
            rows={3}
            maxLength={2000}
            aria-invalid={err('notes') ? true : undefined}
            defaultValue={defaults.notes}
          />
        </Field>

        <CheckboxField
          id="isPublished"
          name="isPublished"
          value="true"
          defaultChecked={defaults.isPublished}
          label="Published"
          hint="Unpublished records are invisible to readers and are never drawn as questions. New records start as drafts."
        />
      </fieldset>

      <div className="flex flex-wrap items-center gap-2 border-t border-rule-strong pt-5">
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? 'Saving…' : submitLabel}
        </Button>
        <Button asChild variant="ghost">
          <a href={cancelHref}>Cancel</a>
        </Button>
        {defaults.id ? null : (
          <p className="text-xs text-ink-faint">
            Relationships are added after the record exists, from the relationship editor.
          </p>
        )}
      </div>
    </form>
  )
}
